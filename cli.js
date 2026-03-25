#!/usr/bin/env node
'use strict';

const https = require('https');
const http = require('http');
const readline = require('readline');

// ============================================================
// ANSI COLOR HELPERS
// ============================================================
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[38;2;239;68;68m',   // #ef4444
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
  white:   '\x1b[97m',
  bgRed:   '\x1b[41m',
};

const red    = (s) => `${C.red}${s}${C.reset}`;
const green  = (s) => `${C.green}${s}${C.reset}`;
const cyan   = (s) => `${C.cyan}${s}${C.reset}`;
const dim    = (s) => `${C.dim}${s}${C.reset}`;
const bold   = (s) => `${C.bold}${s}${C.reset}`;
const yellow = (s) => `${C.yellow}${s}${C.reset}`;

// ============================================================
// CONFIG
// ============================================================
const API_KEY  = process.env.SLOPSHOP_KEY;
const BASE_URL = (process.env.SLOPSHOP_BASE || 'http://localhost:3000').replace(/\/$/, '');

// ============================================================
// HTTP HELPER
// ============================================================
function request(method, path, body, auth = true) {
  return new Promise((resolve, reject) => {
    const urlStr = BASE_URL + path;
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }

    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'slopshop-cli/1.0.0',
      },
    };

    if (auth && API_KEY) {
      options.headers['Authorization'] = `Bearer ${API_KEY}`;
    }
    if (payload) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = { _raw: data };
        }
        if (res.statusCode >= 400) {
          const msg = parsed?.error?.message || parsed?.message || `HTTP ${res.statusCode}`;
          return reject(Object.assign(new Error(msg), { status: res.statusCode, body: parsed }));
        }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });

    req.on('error', (e) => reject(e));

    req.setTimeout(30000, () => {
      req.destroy(new Error('Request timed out after 30 seconds'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ============================================================
// PRETTY PRINT HELPERS
// ============================================================
function prettyJSON(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (obj === null) return dim('null');
  if (typeof obj === 'boolean') return cyan(String(obj));
  if (typeof obj === 'number') return yellow(String(obj));
  if (typeof obj === 'string') return green(`"${obj}"`);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    const items = obj.map(v => `${pad}  ${prettyJSON(v, indent + 1)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    const items = keys.map(k => `${pad}  ${cyan('"' + k + '"')}: ${prettyJSON(obj[k], indent + 1)}`);
    return `{\n${items.join(',\n')}\n${pad}}`;
  }
  return String(obj);
}

function printResult(data) {
  // Support both flat (_credits_used) and wrapped ({ data: {...}, meta: {...} }) response shapes
  let result = {};
  let metaParts = [];

  if (data && typeof data === 'object' && data.data !== undefined && data.meta !== undefined) {
    // Wrapped format: { data: {...}, meta: { credits_used, credits_remaining, latency_ms, ... } }
    result = data.data || {};
    const m = data.meta || {};
    if (m.credits_used !== undefined)      metaParts.push(`credits used: ${m.credits_used}`);
    if (m.credits_remaining !== undefined) metaParts.push(`remaining: ${m.credits_remaining}`);
    if (m.latency_ms !== undefined)        metaParts.push(`${m.latency_ms}ms`);
    if (m.status !== undefined)            metaParts.push(`status: ${m.status}`);
    // Strip _engine from result display, show inline
    if (result._engine) {
      metaParts.push(`engine: ${result._engine}`);
      const { _engine, ...rest } = result;
      result = rest;
    }
  } else {
    // Flat format: top-level _credits_used etc.
    for (const [k, v] of Object.entries(data)) {
      if (['_credits_used', '_credits_remaining', '_latency_ms', '_engine', '_request_id'].includes(k)) {
        if (k === '_credits_used')      metaParts.push(`credits used: ${v}`);
        if (k === '_credits_remaining') metaParts.push(`remaining: ${v}`);
        if (k === '_latency_ms')        metaParts.push(`${v}ms`);
        if (k === '_engine')            metaParts.push(`engine: ${v}`);
      } else {
        result[k] = v;
      }
    }
  }

  console.log(prettyJSON(result));

  if (metaParts.length > 0) {
    console.log(dim(`\n  [${metaParts.join('  ·  ')}]`));
  }
}

// ============================================================
// READ STDIN (non-blocking)
// ============================================================
function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve(null);
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim() || null));
    process.stdin.on('error', () => resolve(null));
    setTimeout(() => resolve(data.trim() || null), 100);
  });
}

// ============================================================
// COMMANDS
// ============================================================

async function cmdCall(args) {
  requireKey();

  const slug = args[0];
  if (!slug) die('Usage: slop call <api-slug> [--key value]...');

  // Parse --key value pairs
  const input = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (!key.startsWith('--')) die(`Expected --key, got: ${key}`);
    const k = key.slice(2);
    // Try to parse JSON values (numbers, bools, objects)
    try {
      input[k] = JSON.parse(val);
    } catch {
      input[k] = val;
    }
  }

  // Accept piped stdin as text/input field
  const stdinData = await readStdin();
  if (stdinData) {
    if (!input.text && !input.input) {
      input.text = stdinData;
    }
  }

  console.log(dim(`  Calling ${cyan(slug)}...`));

  try {
    const res = await request('POST', `/v1/${slug}`, input);
    printResult(res.data);
  } catch (err) {
    handleError(err);
  }
}

async function cmdPipe(args) {
  requireKey();

  // Separate slugs from --key value pairs
  const slugs = [];
  const initialInput = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      const k = args[i].slice(2);
      try { initialInput[k] = JSON.parse(args[i + 1]); }
      catch { initialInput[k] = args[i + 1]; }
      i++; // skip value
    } else if (!args[i].startsWith('--')) {
      slugs.push(args[i]);
    }
  }

  if (slugs.length < 1) die('Usage: slop pipe <api1> <api2> ... [--key value]...');

  let previous = Object.keys(initialInput).length > 0 ? initialInput : null;

  // Accept piped stdin for first step
  const stdinData = await readStdin();

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const input = {};

    if (i === 0) {
      // Merge initial --key value pairs and stdin into first step
      Object.assign(input, initialInput);
      if (stdinData && !input.text && !input.input) {
        input.text = stdinData;
        input.input = stdinData;
      }
    }

    if (i > 0 && previous !== null) {
      input._previous = previous;
      // Also try to surface the most useful previous field as input
      if (typeof previous === 'object' && previous !== null) {
        const keys = ['result', 'output', 'text', 'data', 'value', 'content', 'encoded', 'decoded', 'html', 'csv', 'hash', 'uuid', 'nanoid', 'password', 'hmac'];
        for (const k of keys) {
          if (previous[k] !== undefined) {
            input.input = previous[k];
            break;
          }
        }
      }
    }

    console.log(`\n${bold(`Step ${i + 1}:`)} ${cyan(slug)}`);
    console.log(dim('  Input: ') + dim(JSON.stringify(input).slice(0, 120)));

    try {
      const res = await request('POST', `/v1/${slug}`, input);
      printResult(res.data);

      // Strip meta for next step - handle both wrapped and flat shapes
      let raw = res.data;
      if (raw && typeof raw === 'object' && raw.data !== undefined && raw.meta !== undefined) {
        raw = raw.data || {};
      }
      const clean = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!k.startsWith('_')) clean[k] = v;
      }
      previous = clean;
    } catch (err) {
      handleError(err);
      process.exit(1);
    }
  }
}

async function cmdSearch(args) {
  const query = args.join(' ');
  if (!query) die('Usage: slop search <query>');

  console.log(dim(`  Searching for: "${query}"...`));

  try {
    const res = await request('POST', '/v1/resolve', { query }, false);
    const { match, alternatives } = res.data;

    if (!match) {
      console.log(yellow('  No matching APIs found. Try different terms.'));
      return;
    }

    console.log(`\n${bold('Best match:')}`);
    console.log(`  ${cyan(match.slug || match.id)}`);
    console.log(`  ${bold(match.name)}`);
    console.log(`  ${match.desc || match.description}`);
    console.log(`  ${dim(`${match.credits} credits  ·  confidence: ${(match.confidence * 100).toFixed(0)}%`)}`);

    if (alternatives && alternatives.length > 0) {
      console.log(`\n${bold('Also try:')}`);
      for (const alt of alternatives) {
        console.log(`  ${cyan(alt.slug || alt.id)}  ${dim(`${alt.credits} credits`)}`);
      }
    }
  } catch (err) {
    handleError(err);
  }
}

async function cmdList(args) {
  const category = args[0] || '';
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';

  console.log(dim(`  Loading APIs${category ? ` in category: ${category}` : ''}...`));

  try {
    const res = await request('GET', `/v1/tools${qs}`, null, false);
    const tools = res.data?.tools || res.data?.apis || res.tools || res.apis || [];
    const total = res.data?.total || res.total || tools.length;

    if (!tools || tools.length === 0) {
      console.log(yellow('  No APIs found.'));
      return;
    }

    console.log(`\n${bold(`${total} APIs available`)}\n`);

    // Column widths
    const COL_SLUG = 42;
    const COL_NAME = 30;
    const COL_CRED = 8;
    const COL_TIER = 12;

    const hdr = [
      bold(padEnd('SLUG', COL_SLUG)),
      bold(padEnd('NAME', COL_NAME)),
      bold(padEnd('CREDITS', COL_CRED)),
      bold('STATUS'),
    ].join('  ');

    console.log(hdr);
    console.log(dim('─'.repeat(100)));

    for (const t of tools) {
      const row = [
        cyan(padEnd(t.id || '', COL_SLUG)),
        padEnd((t.name || '').slice(0, COL_NAME - 1), COL_NAME),
        yellow(padEnd(String(t.credits || 0), COL_CRED)),
        dim(t.status || ''),
      ].join('  ');
      console.log(row);
    }

    console.log(dim(`\n  Showing ${tools.length} of ${total}. Use --category to filter.`));
  } catch (err) {
    handleError(err);
  }
}

async function cmdBalance() {
  requireKey();

  try {
    const res = await request('GET', '/v1/credits/balance');
    const { balance, tier, auto_reload } = res.data;

    console.log(`\n  ${bold('Balance:')}  ${green(balance.toLocaleString())} credits`);
    console.log(`  ${bold('Tier:')}     ${cyan(tier)}`);
    console.log(`  ${bold('Auto-reload:')} ${auto_reload ? green('on') : dim('off')}`);
  } catch (err) {
    handleError(err);
  }
}

async function cmdBuy(args) {
  requireKey();

  const amount = parseInt(args[0]);
  const validAmounts = [1000, 10000, 100000, 1000000];
  const prices = { 1000: '$9', 10000: '$49', 100000: '$299', 1000000: '$1999' };

  if (!amount || !validAmounts.includes(amount)) {
    console.log(`\n  ${bold('Credit packs:')}\n`);
    for (const a of validAmounts) {
      console.log(`    ${yellow(a.toLocaleString().padStart(10))} credits  →  ${green(prices[a])}`);
    }
    console.log(`\n  Usage: ${cyan('slop buy <amount>')}`);
    console.log(dim('  Example: slop buy 10000\n'));
    return;
  }

  console.log(dim(`  Purchasing ${amount.toLocaleString()} credits...`));

  try {
    const res = await request('POST', '/v1/credits/buy', { amount });
    const d = res.data;
    console.log(`\n  ${green('Credits added!')}  +${d.amount_added?.toLocaleString()}`);
    console.log(`  New balance: ${bold(d.new_balance?.toLocaleString())} credits`);
    console.log(`  Tier: ${cyan(d.tier)}`);
    console.log(`  Charged: ${yellow(d.charged)}`);
  } catch (err) {
    handleError(err);
  }
}

async function cmdHealth() {
  console.log(dim(`  Checking ${BASE_URL}...`));

  try {
    const res = await request('GET', '/v1/health', null, false);
    const d = res.data;
    const ok = d.status === 'operational';

    console.log(`\n  Status:  ${ok ? green('operational') : red(d.status)}`);
    console.log(`  APIs:    ${yellow(String(d.apis_loaded || 0))} loaded`);
    console.log(`  Uptime:  ${dim(formatUptime(d.uptime_seconds || 0))}`);
    console.log(`  Version: ${dim(d.version || 'unknown')}`);
    console.log(`  Base:    ${dim(BASE_URL)}`);
  } catch (err) {
    handleError(err);
  }
}

function cmdHelp() {
  const lobster = `
  ${C.red}${C.bold}       (\\/)
      .-'  '-.
     /  o  o  \\
    |   (__)   |
    |  ======  |
     \\  \\  /  /
      '--\\/--'
    /|  ||  |\\
   / |  ||  | \\
  /  |  ||  |  \\
 ====|==||==|====
${C.reset}`;

  console.log(lobster);
  console.log(`  ${C.red}${C.bold}SLOPSHOP${C.reset} ${dim('— the API bazaar for lobsters')}\n`);
  console.log(`  ${bold('USAGE')}`);
  console.log(`    ${cyan('slop')} <command> [options]\n`);
  console.log(`  ${bold('COMMANDS')}`);
  console.log(`    ${cyan('slop call')} <api-slug> ${dim('[--key value]...')}   Call any API with parameters`);
  console.log(`    ${cyan('slop pipe')} <api1> <api2> ${dim('...')}             Chain APIs together`);
  console.log(`    ${cyan('slop search')} <query>                    Semantic search for APIs`);
  console.log(`    ${cyan('slop list')} ${dim('[category]')}                    List available APIs`);
  console.log(`    ${cyan('slop balance')}                           Check credit balance`);
  console.log(`    ${cyan('slop buy')} <amount>                      Buy credits (1k/10k/100k/1M)`);
  console.log(`    ${cyan('slop health')}                            Server health check`);
  console.log(`    ${cyan('slop help')}                              Show this help\n`);
  console.log(`  ${bold('EXAMPLES')}`);
  console.log(`    ${dim('# Generate a UUID')}`);
  console.log(`    ${cyan('slop call generate-value-uuid')}\n`);
  console.log(`    ${dim('# Hash some text')}`);
  console.log(`    ${cyan('slop call generate-value-hash-sha256 --input "hello world"')}\n`);
  console.log(`    ${dim('# Pipe text through word-count')}`);
  console.log(`    ${cyan('echo "hello world" | slop call text-string-word-count')}\n`);
  console.log(`    ${dim('# Chain APIs: encode then hash')}`);
  console.log(`    ${cyan('slop pipe convert-data-base64-encode generate-value-hash-sha256 --input "test"')}\n`);
  console.log(`    ${dim('# Find APIs for currency conversion')}`);
  console.log(`    ${cyan('slop search currency convert')}\n`);
  console.log(`    ${dim('# List all text APIs')}`);
  console.log(`    ${cyan('slop list text')}\n`);
  console.log(`  ${bold('ENVIRONMENT')}`);
  console.log(`    ${yellow('SLOPSHOP_KEY')}   ${dim('Required. Your API key.')}`);
  console.log(`    ${yellow('SLOPSHOP_BASE')}  ${dim(`Optional. Server URL. Default: http://localhost:3000`)}\n`);
  console.log(`  ${dim('Get a key: POST /v1/keys   |   slopshop.gg')}\n`);
}

// ============================================================
// UTILITIES
// ============================================================
function requireKey() {
  if (!API_KEY) {
    die('SLOPSHOP_KEY environment variable is required.\n  Set it with: export SLOPSHOP_KEY=sk-slop-...\n  Get a key:   curl -X POST ' + BASE_URL + '/v1/keys');
  }
}

function die(msg) {
  console.error(red('\n  Error: ') + msg + '\n');
  process.exit(1);
}

function handleError(err) {
  if (err.body?.error) {
    const e = err.body.error;
    console.error(red(`\n  Error [${e.code || err.status}]: `) + (e.message || err.message));
    if (e.tiers) {
      console.error(dim('  Valid amounts: ' + Object.keys(e.tiers).join(', ')));
    }
  } else {
    console.error(red('\n  Error: ') + err.message);
  }
  console.log('');
}

function padEnd(str, len) {
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ============================================================
// MAIN ENTRYPOINT
// ============================================================
async function main() {
  const [,, cmd, ...args] = process.argv;

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    cmdHelp();
    return;
  }

  switch (cmd) {
    case 'call':    await cmdCall(args);   break;
    case 'pipe':    await cmdPipe(args);   break;
    case 'search':  await cmdSearch(args); break;
    case 'list':    await cmdList(args);   break;
    case 'balance': await cmdBalance();    break;
    case 'buy':     await cmdBuy(args);    break;
    case 'health':  await cmdHealth();     break;
    default:
      console.error(red(`\n  Unknown command: ${cmd}`));
      console.error(dim('  Run `slop help` for usage.\n'));
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(red('\n  Fatal: ') + err.message + '\n');
  process.exit(1);
});
