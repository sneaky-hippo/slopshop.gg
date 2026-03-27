#!/usr/bin/env node
'use strict';

const https = require('https');
const http = require('http');
const readline = require('readline');

// ============================================================
// GLOBAL FLAGS (parsed early, before command dispatch)
// ============================================================
const quiet   = process.argv.includes('--quiet') || process.argv.includes('-q');
const jsonMode = process.argv.includes('--json');
const noColor  = process.argv.includes('--no-color');

// Strip global flags from argv so commands don't see them
const GLOBAL_FLAGS = ['--quiet', '-q', '--json', '--no-color'];

// ============================================================
// ANSI COLOR HELPERS
// ============================================================
const C = noColor ? {
  reset: '', bold: '', dim: '', red: '', green: '', cyan: '',
  yellow: '', white: '', bgRed: '',
} : {
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
// CONFIG (env vars → config file → defaults)
// ============================================================
const _os = require('os');
const _fs = require('fs');
const _path = require('path');
const _CONFIG_FILE = _path.join(_os.homedir(), '.slopshop', 'config.json');
function _loadCfg() { try { return JSON.parse(_fs.readFileSync(_CONFIG_FILE, 'utf8')); } catch(e) { return {}; } }
const _cfg = _loadCfg();
const API_KEY  = process.env.SLOPSHOP_KEY || _cfg.api_key || '';
const BASE_URL = (process.env.SLOPSHOP_BASE || _cfg.base_url || 'https://slopshop.gg').replace(/\/$/, '');

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

function extractMeta(data) {
  let result = {};
  let metaParts = [];

  if (data && typeof data === 'object' && data.data !== undefined && data.meta !== undefined) {
    result = data.data || {};
    const m = data.meta || {};
    if (m.credits_used !== undefined)      metaParts.push(`${m.credits_used}cr`);
    if (m.latency_ms !== undefined)        metaParts.push(`${m.latency_ms}ms`);
    if (m.credits_remaining !== undefined) metaParts.push(`remaining: ${m.credits_remaining}`);
    if (m.status !== undefined)            metaParts.push(`status: ${m.status}`);
    if (result._engine) {
      metaParts.push(`engine: ${result._engine}`);
      const { _engine, ...rest } = result;
      result = rest;
    }
  } else {
    for (const [k, v] of Object.entries(data)) {
      if (['_credits_used', '_credits_remaining', '_latency_ms', '_engine', '_request_id'].includes(k)) {
        if (k === '_credits_used')      metaParts.push(`${v}cr`);
        if (k === '_credits_remaining') metaParts.push(`remaining: ${v}`);
        if (k === '_latency_ms')        metaParts.push(`${v}ms`);
        if (k === '_engine')            metaParts.push(`engine: ${v}`);
      } else {
        result[k] = v;
      }
    }
  }

  return { result, metaParts };
}

function printResult(data, slug) {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const { result, metaParts } = extractMeta(data);

  if (quiet) {
    // Quiet mode: just key: value lines, no decoration
    for (const [k, v] of Object.entries(result)) {
      console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
    return;
  }

  // Beautiful call result screen
  if (slug) {
    const metaStr = metaParts.length > 0 ? dim(metaParts.join(' \u00b7 ')) : '';
    const slugDisplay = cyan(bold(slug));
    console.log(`\n  ${slugDisplay}${metaStr ? '  ' + metaStr : ''}`);
    console.log(`  ${dim('\u2500'.repeat(42))}`);
    for (const [k, v] of Object.entries(result)) {
      if (typeof v === 'object' && v !== null) {
        console.log(`  ${bold(k + ':')} ${prettyJSON(v, 1)}`);
      } else {
        const valStr = typeof v === 'string' && v.length > 60
          ? v.slice(0, 57) + '...'
          : String(v);
        console.log(`  ${bold(k + ':')} ${green(valStr)}`);
      }
    }
    console.log('');
  } else {
    console.log(prettyJSON(result));
    if (metaParts.length > 0) {
      console.log(dim(`\n  [${metaParts.join('  \u00b7  ')}]`));
    }
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
  const slug = args[0];
  if (!slug) die('Usage: slop call <api-slug> [--key value]...');

  // --help: show API schema info (dry-run)
  if (args.includes('--help')) {
    try {
      if (!quiet && !jsonMode) console.log(dim(`  Fetching API info for ${cyan(slug)}...`));
      const res = await request('POST', '/v1/dry-run/' + slug, {}, false);
      if (jsonMode) {
        console.log(JSON.stringify(res.data, null, 2));
      } else {
        const d = res.data;
        console.log(`\n  ${cyan(bold(d.slug || slug))}`);
        if (d.name) console.log(`  ${bold(d.name)}`);
        if (d.description || d.desc) console.log(`  ${d.description || d.desc}`);
        if (d.credits !== undefined) console.log(`  ${dim('Credits:')} ${yellow(String(d.credits))}`);
        if (d.input_schema || d.schema || d.parameters) {
          const schema = d.input_schema || d.schema || d.parameters;
          console.log(`\n  ${bold('Parameters:')}`);
          const props = schema.properties || schema;
          for (const [k, v] of Object.entries(props)) {
            const req = (schema.required || []).includes(k) ? red('*') : ' ';
            const type = v.type || '';
            const desc = v.description || '';
            console.log(`    ${req} ${cyan('--' + k)}  ${dim(type)}  ${desc}`);
          }
        }
        if (d.example) {
          console.log(`\n  ${bold('Example:')}`);
          console.log(`    ${cyan('slop call ' + slug)} ${Object.entries(d.example).map(([k,v]) => `--${k} ${JSON.stringify(v)}`).join(' ')}`);
        }
        console.log('');
      }
    } catch (err) {
      handleError(err);
    }
    return;
  }

  requireKey();

  // Parse --key value pairs (skip global flags)
  const input = {};
  for (let i = 1; i < args.length; i++) {
    if (GLOBAL_FLAGS.includes(args[i])) continue;
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
    i++; // skip value
  }

  // Accept piped stdin as text/input field
  const stdinData = await readStdin();
  if (stdinData) {
    if (!input.text && !input.input) {
      input.text = stdinData;
    }
  }

  if (!quiet && !jsonMode) console.log(dim(`  Calling ${cyan(slug)}...`));

  try {
    const res = await request('POST', `/v1/${slug}`, input);
    printResult(res.data, slug);
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
      // Auto-map common output fields to input fields
      if (typeof previous === 'object' && previous !== null) {
        const keys = ['result', 'output', 'text', 'data', 'value', 'content', 'encoded', 'decoded', 'html', 'csv', 'hash', 'uuid', 'nanoid', 'password', 'hmac', 'words'];
        for (const k of keys) {
          if (previous[k] !== undefined) {
            // Map to both text and input for maximum compatibility
            input.text = String(previous[k]);
            input.input = previous[k];
            // Also map specific field names to common input names
            if (k === 'hash' || k === 'uuid' || k === 'words') {
              input.text = String(previous[k]);
            }
            if (k === 'result') {
              input.text = String(previous[k]);
              input.data = previous[k];
            }
            break;
          }
        }
      }
    }

    if (!quiet && !jsonMode) {
      console.log(`\n${bold(`Step ${i + 1}:`)} ${cyan(slug)}`);
      console.log(dim('  Input: ') + dim(JSON.stringify(input).slice(0, 120)));
    }

    try {
      const res = await request('POST', `/v1/${slug}`, input);
      printResult(res.data, slug);

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
  const query = args.filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
  if (!query) die('Usage: slop search <query>');

  if (!quiet && !jsonMode) console.log(dim(`  Searching for: "${query}"...`));

  try {
    const res = await request('POST', '/v1/resolve', { query }, false);

    if (jsonMode) {
      console.log(JSON.stringify(res.data, null, 2));
      return;
    }

    const { match, alternatives } = res.data;

    if (!match) {
      console.log(quiet ? 'no results' : yellow('  No matching APIs found. Try different terms.'));
      return;
    }

    if (quiet) {
      console.log(match.slug || match.id);
      if (alternatives) alternatives.forEach(a => console.log(a.slug || a.id));
      return;
    }

    console.log(`\n${bold('Best match:')}`);
    console.log(`  ${cyan(match.slug || match.id)}`);
    console.log(`  ${bold(match.name)}`);
    console.log(`  ${match.desc || match.description}`);
    console.log(`  ${dim(`${match.credits} credits  \u00b7  confidence: ${(match.confidence * 100).toFixed(0)}%`)}`);

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
  const filteredArgs = args.filter(a => !GLOBAL_FLAGS.includes(a));
  const category = filteredArgs[0] || '';

  if (!quiet && !jsonMode) console.log(dim(`  Loading APIs${category ? ` in category: ${category}` : ''}...`));

  try {
    const res = await request('GET', '/v1/tools', null, false);
    const tools = res.data?.tools || res.data?.apis || res.tools || res.apis || [];
    const total = res.data?.total || res.total || tools.length;

    if (jsonMode) {
      console.log(JSON.stringify(res.data, null, 2));
      return;
    }

    if (!tools || tools.length === 0) {
      console.log(quiet ? '' : yellow('  No APIs found.'));
      return;
    }

    // Client-side category filtering (case-insensitive partial match)
    let filtered = tools;
    if (category) {
      const catLower = category.toLowerCase();
      filtered = tools.filter(t => {
        const slug = (t.slug || t.id || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        const name = (t.name || '').toLowerCase();
        return slug.includes(catLower) || cat.includes(catLower) || name.includes(catLower);
      });
    }

    if (quiet) {
      for (const t of filtered) console.log(t.slug || t.id || '');
      return;
    }

    console.log(`\n${bold(`${filtered.length} APIs${category ? ` matching "${category}"` : ' available'}`)}\n`);

    // Column widths
    const COL_SLUG = 42;
    const COL_NAME = 30;
    const COL_CRED = 8;

    const hdr = [
      bold(padEnd('SLUG', COL_SLUG)),
      bold(padEnd('NAME', COL_NAME)),
      bold(padEnd('CREDITS', COL_CRED)),
      bold('STATUS'),
    ].join('  ');

    console.log(hdr);
    console.log(dim('\u2500'.repeat(100)));

    for (const t of filtered) {
      const row = [
        cyan(padEnd(t.slug || t.id || '', COL_SLUG)),
        padEnd((t.name || '').slice(0, COL_NAME - 1), COL_NAME),
        yellow(padEnd(String(t.credits || 0), COL_CRED)),
        dim(t.status || ''),
      ].join('  ');
      console.log(row);
    }

    console.log(dim(`\n  Showing ${filtered.length} of ${total}. Use a category name to filter.`));
  } catch (err) {
    handleError(err);
  }
}

async function cmdBalance() {
  requireKey();

  try {
    const res = await request('GET', '/v1/credits/balance');
    const d = res.data;
    const balance = d.balance || 0;
    const tier = d.tier || 'free';
    const auto_reload = d.auto_reload;

    if (jsonMode) {
      console.log(JSON.stringify(d, null, 2));
      return;
    }

    if (quiet) {
      console.log(`balance: ${balance}`);
      console.log(`tier: ${tier}`);
      return;
    }

    // Credit bar: scale to 16 chars, assume 2000 max for free tier
    const maxCredits = tier === 'free' ? 2000 : (tier === 'pro' ? 100000 : 1000000);
    const filled = Math.round((balance / maxCredits) * 16);
    const bar = '\u2588'.repeat(Math.min(filled, 16)) + '\u2591'.repeat(Math.max(16 - filled, 0));

    const W = 42;
    console.log(`\n  \u250c\u2500 Credits ${ '\u2500'.repeat(W - 12)}\u2510`);
    console.log(`  \u2502  ${bold('Balance:')}  ${green(bar)}  ${bold(balance.toLocaleString().padStart(7))}${' '.repeat(W - 33 - balance.toLocaleString().length)}\u2502`);
    console.log(`  \u2502  ${bold('Tier:')}     ${cyan(tier)}${' '.repeat(W - 11 - tier.length)}\u2502`);
    if (auto_reload !== undefined) {
      const arStr = auto_reload ? green('on') : dim('off');
      const arLen = auto_reload ? 2 : 3;
      console.log(`  \u2502  ${bold('Reload:')}   ${arStr}${' '.repeat(W - 13 - arLen)}\u2502`);
    }
    console.log(`  \u2514${ '\u2500'.repeat(W)}\u2518\n`);
  } catch (err) {
    handleError(err);
  }
}

async function cmdBuy(args) {
  requireKey();

  const filteredArgs = args.filter(a => !GLOBAL_FLAGS.includes(a));
  const amount = parseInt(filteredArgs[0]);
  const validAmounts = [1000, 10000, 100000, 1000000];
  const prices = { 1000: '$9', 10000: '$49', 100000: '$299', 1000000: '$1999' };

  if (!amount || !validAmounts.includes(amount)) {
    if (jsonMode) {
      console.log(JSON.stringify({ packs: validAmounts.map(a => ({ credits: a, price: prices[a] })) }, null, 2));
      return;
    }
    console.log(`\n  ${bold('Credit packs:')}\n`);
    for (const a of validAmounts) {
      console.log(`    ${yellow(a.toLocaleString().padStart(10))} credits  \u2192  ${green(prices[a])}`);
    }
    console.log(`\n  Usage: ${cyan('slop buy <amount>')}`);
    console.log(dim('  Example: slop buy 10000\n'));
    return;
  }

  if (!quiet && !jsonMode) console.log(dim(`  Purchasing ${amount.toLocaleString()} credits...`));

  try {
    // Try Stripe checkout first, fall back to internal credits
    let res;
    try {
      res = await request('POST', '/v1/checkout', { amount });
      if (res.data?.checkout_url) {
        if (jsonMode) { console.log(JSON.stringify(res.data, null, 2)); return; }
        if (quiet) { console.log(res.data.checkout_url); return; }
        console.log(`\n  ${green('✓ Stripe checkout ready!')}`);
        console.log(`  ${bold('Open this URL to pay:')}\n`);
        console.log(`  ${cyan(res.data.checkout_url)}\n`);
        console.log(dim('  Credits will be added automatically after payment.\n'));
        return;
      }
    } catch(e) { /* Stripe not configured, fall back */ }

    res = await request('POST', '/v1/credits/buy', { amount });
    const d = res.data;

    if (jsonMode) {
      console.log(JSON.stringify(d, null, 2));
      return;
    }

    if (quiet) {
      console.log(`balance: ${d.new_balance}`);
      return;
    }

    console.log(`\n  ${green('\u2713 Credits added!')}  +${d.amount_added?.toLocaleString()}`);
    console.log(`  New balance: ${bold(d.new_balance?.toLocaleString())} credits`);
    console.log(`  Tier: ${cyan(d.tier)}`);
    console.log(`  Charged: ${yellow(d.charged)}`);
  } catch (err) {
    handleError(err);
  }
}

async function cmdHealth() {
  if (!quiet && !jsonMode) console.log(dim(`  Checking ${BASE_URL}...`));

  try {
    const res = await request('GET', '/v1/health', null, false);
    const d = res.data;

    if (jsonMode) {
      console.log(JSON.stringify(d, null, 2));
      return;
    }

    const ok = d.status === 'operational';

    if (quiet) {
      console.log(d.status || 'unknown');
      return;
    }

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
  if (!quiet && !jsonMode) {
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
  }

  if (jsonMode) {
    console.log(JSON.stringify({
      commands: ['call', 'pipe', 'search', 'list', 'run', 'org', 'chain', 'memory', 'discover', 'stats', 'signup', 'login', 'whoami', 'key', 'config', 'balance', 'buy', 'health', 'mcp', 'help'],
      flags: ['--quiet', '-q', '--json', '--no-color'],
      version: '1.0.0'
    }, null, 2));
    return;
  }

  console.log(`  ${C.red}${C.bold}SLOPSHOP${C.reset} ${dim('\u2014 the missing CLI for AI agents')}\n`);
  console.log(`  ${bold('USAGE')}`);
  console.log(`    ${cyan('slop')} <command> [options]\n`);
  console.log(`  ${bold('COMMANDS')}`);
  console.log(`    ${cyan('slop call')} <api-slug> ${dim('[--key value]...')}   Call any API with parameters`);
  console.log(`    ${cyan('slop pipe')} <api1> <api2> ${dim('...')}             Chain APIs together`);
  console.log(`    ${cyan('slop run')} ${dim('"task description"')}             Natural language task execution`);
  console.log(`    ${cyan('slop search')} <query>                    Semantic search for APIs`);
  console.log(`    ${cyan('slop list')} ${dim('[category]')}                    List available APIs`);
  console.log(`    ${cyan('slop discover')} ${dim('"goal"')}                    Find the right feature for a goal\n`);
  console.log(`  ${bold('AGENT ORCHESTRATION')}`);
  console.log(`    ${cyan('slop org')} ${dim('<sub>')}                         Launch/manage agent organizations`);
  console.log(`    ${cyan('slop chain')} ${dim('<sub>')}                       Create/manage agent chains`);
  console.log(`    ${cyan('slop memory')} ${dim('<sub>')}                      Direct memory key-value operations\n`);
  console.log(`  ${bold('ACCOUNT & CONFIG')}`);
  console.log(`    ${cyan('slop signup')}                            Create a new account`);
  console.log(`    ${cyan('slop login')}                             Log in`);
  console.log(`    ${cyan('slop whoami')}                            Show current user info`);
  console.log(`    ${cyan('slop key')} ${dim('[set|remove|rotate]')}          Manage your API key`);
  console.log(`    ${cyan('slop config')} ${dim('[key] [value]')}              View or set config`);
  console.log(`    ${cyan('slop balance')}                           Check credit balance`);
  console.log(`    ${cyan('slop buy')} <amount>                      Buy credits (1k/10k/100k/1M)`);
  console.log(`    ${cyan('slop stats')}                             Platform statistics & usage`);
  console.log(`    ${cyan('slop health')}                            Server health check`);
  console.log(`    ${cyan('slop mcp')}                               Set up MCP for Claude Code`);
  console.log(`    ${cyan('slop help')}                              Show this help\n`);
  console.log(`  ${bold('FLAGS')}`);
  console.log(`    ${yellow('--quiet, -q')}    Suppress decorative output, data only`);
  console.log(`    ${yellow('--json')}         Output raw JSON (for piping)`);
  console.log(`    ${yellow('--no-color')}     Disable ANSI colors\n`);
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
  console.log(`    ${dim('# Get JSON output for scripting')}`);
  console.log(`    ${cyan('slop balance --json | jq .balance')}\n`);
  console.log(`  ${bold('ENVIRONMENT')}`);
  console.log(`    ${yellow('SLOPSHOP_KEY')}   ${dim('Required. Your API key.')}`);
  console.log(`    ${yellow('SLOPSHOP_BASE')}  ${dim(`Optional. Server URL. Default: https://slopshop.gg`)}\n`);
  console.log(`  ${dim('Get a key: POST /v1/keys   |   slopshop.gg')}\n`);
}

// ============================================================
// MCP SETUP
// ============================================================
function cmdMcp() {
  console.log(`\n  ${bold('Setting up Slopshop MCP for Claude Code...')}\n`);
  try {
    require('./setup-mcp.js');
  } catch(e) {
    // If setup-mcp.js isn't available (npm install), use inline setup
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch(e) {}

    settings.mcpServers = settings.mcpServers || {};
    settings.mcpServers.slopshop = {
      command: 'node',
      args: [path.join(__dirname, 'mcp-server.js')],
      env: {
        SLOPSHOP_BASE: BASE_URL,
        SLOPSHOP_KEY: API_KEY || ''
      }
    };

    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    console.log(green('  MCP server configured!'));
    console.log(dim(`  Settings: ${settingsPath}`));
    console.log(`\n  ${bold('Restart Claude Code to activate.')}\n`);
  }
}

// ============================================================
// UTILITIES
// ============================================================
function requireKey() {
  if (!API_KEY) {
    die('No API key found.\n  Set via CLI:  slop config api_key sk-slop-YOUR-KEY\n  Or env var:   export SLOPSHOP_KEY=sk-slop-...\n  Sign up:      slop signup\n  Config file:  ' + _CONFIG_FILE);
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
// CONFIG FILE HELPERS
// ============================================================
const os = require('os');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(os.homedir(), '.slopshop');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return {};
}

function saveConfig(cfg) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptSecret(question) {
  return new Promise((resolve) => {
    process.stderr.write(question);
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    let pwd = '';
    const onData = (ch) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r' || c === '\u0004') {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.removeListener('data', onData);
        process.stderr.write('\n');
        rl.close();
        resolve(pwd);
      } else if (c === '\u007F' || c === '\b') {
        if (pwd.length > 0) {
          pwd = pwd.slice(0, -1);
          process.stderr.write('\b \b');
        }
      } else if (c === '\u0003') {
        process.exit(1);
      } else {
        pwd += c;
        process.stderr.write('*');
      }
    };
    process.stdin.on('data', onData);
    if (!process.stdin.isTTY) {
      rl.on('line', (line) => {
        rl.close();
        resolve(line.trim());
      });
    }
  });
}

// ============================================================
// AUTH COMMANDS
// ============================================================

async function cmdSignup() {
  if (!quiet && !jsonMode) console.log(`\n  ${bold('Sign up for Slopshop')}\n`);

  // Support non-interactive mode for AI agents: slop signup --email x --password y
  const emailIdx = process.argv.indexOf('--email');
  const passIdx = process.argv.indexOf('--password');
  const email = emailIdx >= 0 ? process.argv[emailIdx + 1] : await prompt('  Email: ');
  if (!email) die('Email is required.');

  const password = passIdx >= 0 ? process.argv[passIdx + 1] : await promptSecret('  Password: ');
  if (!password) die('Password is required.');

  if (!quiet && !jsonMode) console.log(dim('  Creating account...'));

  try {
    const res = await request('POST', '/v1/auth/signup', { email, password }, false);
    const d = res.data;
    const apiKey = d.api_key || d.key || d.token;
    const credits = d.credits || d.balance || 2000;

    if (jsonMode) {
      console.log(JSON.stringify(d, null, 2));
      if (apiKey) {
        const cfg = loadConfig();
        cfg.api_key = apiKey;
        cfg.email = email;
        cfg.base_url = BASE_URL;
        saveConfig(cfg);
      }
      return;
    }

    if (apiKey) {
      const maskedKey = apiKey.slice(0, 8) + '...' + apiKey.slice(-4);
      const cfg = loadConfig();
      cfg.api_key = apiKey;
      cfg.email = email;
      cfg.base_url = BASE_URL;
      saveConfig(cfg);

      if (quiet) {
        console.log(`email: ${email}`);
        console.log(`api_key: ${apiKey}`);
        console.log(`credits: ${credits}`);
        return;
      }

      const W = 43;
      console.log('');
      console.log(`  \u250c${ '\u2500'.repeat(W)}\u2510`);
      console.log(`  \u2502  ${green('\u2713')} Account created${' '.repeat(W - 20)}\u2502`);
      console.log(`  \u2502${' '.repeat(W)}\u2502`);
      console.log(`  \u2502  Email:    ${email}${' '.repeat(Math.max(W - 13 - email.length, 0))}\u2502`);
      console.log(`  \u2502  API Key:  ${maskedKey}${' '.repeat(Math.max(W - 13 - maskedKey.length, 0))}\u2502`);
      console.log(`  \u2502  Credits:  ${credits.toLocaleString()} (free)${' '.repeat(Math.max(W - 21 - credits.toLocaleString().length, 0))}\u2502`);
      console.log(`  \u2502${' '.repeat(W)}\u2502`);
      console.log(`  \u2502  Key saved to ~/.slopshop/config.json${' '.repeat(W - 40)}\u2502`);
      console.log(`  \u2502${' '.repeat(W)}\u2502`);
      console.log(`  \u2502  Next: ${cyan('slop call crypto-hash-sha256 \\\\')}${' '.repeat(Math.max(W - 42, 0))}\u2502`);
      console.log(`  \u2502        ${dim('--text "hello world"')}${' '.repeat(Math.max(W - 28, 0))}\u2502`);
      console.log(`  \u2514${ '\u2500'.repeat(W)}\u2518`);
      console.log('');
    } else {
      console.log(`\n  ${green('Account created!')}  Welcome to Slopshop.\n`);
    }
  } catch (err) {
    handleError(err);
  }
}

async function cmdLogin() {
  if (!quiet && !jsonMode) console.log(`\n  ${bold('Log in to Slopshop')}\n`);

  // Support non-interactive mode: slop login --email x --password y
  const emailIdx = process.argv.indexOf('--email');
  const passIdx = process.argv.indexOf('--password');
  const email = emailIdx >= 0 ? process.argv[emailIdx + 1] : await prompt('  Email: ');
  if (!email) die('Email is required.');

  const password = passIdx >= 0 ? process.argv[passIdx + 1] : await promptSecret('  Password: ');
  if (!password) die('Password is required.');

  if (!quiet && !jsonMode) console.log(dim('  Logging in...'));

  try {
    const res = await request('POST', '/v1/auth/login', { email, password }, false);
    const d = res.data;
    const apiKey = d.api_key || d.key || d.token;

    if (jsonMode) {
      console.log(JSON.stringify(d, null, 2));
      if (apiKey) {
        const cfg = loadConfig();
        cfg.api_key = apiKey;
        cfg.email = email;
        cfg.base_url = BASE_URL;
        saveConfig(cfg);
      }
      return;
    }

    if (apiKey) {
      const cfg = loadConfig();
      cfg.api_key = apiKey;
      cfg.email = email;
      cfg.base_url = BASE_URL;
      saveConfig(cfg);

      if (quiet) {
        console.log(`email: ${email}`);
        console.log(`api_key: ${apiKey}`);
        return;
      }

      console.log(`\n  ${green('\u2713')} ${bold('Logged in!')}  Welcome back, ${email}`);
      console.log(dim(`  Key saved to ${CONFIG_FILE}`));
      console.log(`\n  Next: ${cyan('slop balance')}  or  ${cyan('slop call <api-slug>')}\n`);
    } else {
      console.log(`\n  ${green('Logged in!')}  Welcome back.\n`);
    }
  } catch (err) {
    handleError(err);
  }
}

async function cmdWhoami() {
  requireKey();

  try {
    const res = await request('GET', '/v1/auth/me');
    const d = res.data;

    if (jsonMode) {
      console.log(JSON.stringify(d, null, 2));
      return;
    }

    if (quiet) {
      console.log(d.email || 'unknown');
      return;
    }

    console.log(`\n  ${bold('Email:')}    ${d.email || dim('unknown')}`);
    console.log(`  ${bold('Tier:')}     ${cyan(d.tier || 'free')}`);
    console.log(`  ${bold('Balance:')}  ${green(String(d.balance ?? d.credits ?? 'unknown'))} credits`);
    if (d.created_at) console.log(`  ${bold('Joined:')}   ${dim(d.created_at)}`);
  } catch (err) {
    handleError(err);
  }
}

function cmdConfig(args) {
  const cfg = loadConfig();

  if (args.length === 0) {
    // Show current config
    console.log(`\n  ${bold('Slopshop Config')}  ${dim(CONFIG_FILE)}\n`);
    if (Object.keys(cfg).length === 0) {
      console.log(dim('  No config set. Use `slop config <key> <value>` to set values.\n'));
    } else {
      for (const [k, v] of Object.entries(cfg)) {
        const display = k === 'api_key' ? v.slice(0, 12) + '...' : v;
        console.log(`  ${cyan(k)}  ${display}`);
      }
      console.log('');
    }
    console.log(`  ${bold('Settable keys:')}`);
    console.log(`    ${cyan('api_key')}    ${dim('Your SLOPSHOP_KEY')}`);
    console.log(`    ${cyan('base_url')}   ${dim('Server URL (default: https://slopshop.gg)')}\n`);
    return;
  }

  const key = args[0];
  const val = args.slice(1).join(' ');

  if (!val) {
    // Get a single key
    if (cfg[key] !== undefined) {
      console.log(cfg[key]);
    } else {
      console.log(dim(`  Key "${key}" not set.`));
    }
    return;
  }

  // Set a key
  cfg[key] = val;
  saveConfig(cfg);
  console.log(green(`  Set ${key}`));
}

// ============================================================
// KEY MANAGEMENT
// ============================================================

function cmdKey(args) {
  const sub = args[0] || '';
  const cfg = loadConfig();

  if (!sub || sub === 'show') {
    // Show current key (masked)
    const key = API_KEY || cfg.api_key;
    if (key) {
      console.log(`\n  ${bold('API Key:')}  ${cyan(key.slice(0, 16) + '...' + key.slice(-4))}`);
      console.log(`  ${bold('Source:')}   ${process.env.SLOPSHOP_KEY ? 'environment variable' : 'config file'}`);
      console.log(dim(`  ${_CONFIG_FILE}\n`));
    } else {
      console.log(dim('\n  No API key configured.\n'));
      console.log(`  ${bold('Set a key:')}   ${cyan('slop key set sk-slop-YOUR-KEY')}`);
      console.log(`  ${bold('Or sign up:')}  ${cyan('slop signup')}\n`);
    }
    return;
  }

  if (sub === 'set') {
    const newKey = args[1];
    if (!newKey) return die('Usage: slop key set sk-slop-YOUR-KEY');
    if (!newKey.startsWith('sk-slop-')) return die('Invalid key format. Keys start with sk-slop-');
    cfg.api_key = newKey;
    saveConfig(cfg);
    console.log(green(`\n  API key saved!`));
    console.log(`  ${bold('Key:')}  ${cyan(newKey.slice(0, 16) + '...' + newKey.slice(-4))}`);
    console.log(dim(`  Saved to ${_CONFIG_FILE}\n`));
    return;
  }

  if (sub === 'remove' || sub === 'delete' || sub === 'clear') {
    delete cfg.api_key;
    saveConfig(cfg);
    console.log(green(`\n  API key removed from config.`));
    console.log(dim(`  To fully clear, also: unset SLOPSHOP_KEY\n`));
    return;
  }

  if (sub === 'rotate') {
    requireKey();
    console.log(dim('  Rotating key...'));
    request('POST', '/v1/auth/rotate-key').then(res => {
      const d = res.data;
      const newKey = d.api_key || d.new_key || d.key;
      if (newKey) {
        cfg.api_key = newKey;
        saveConfig(cfg);
        console.log(green(`\n  Key rotated!`));
        console.log(`  ${bold('New key:')}  ${cyan(newKey.slice(0, 16) + '...' + newKey.slice(-4))}`);
        console.log(dim(`  Old key is now invalid.\n`));
      }
    }).catch(handleError);
    return;
  }

  console.log(`\n  ${bold('Key Management')}\n`);
  console.log(`  ${cyan('slop key')}           Show current key`);
  console.log(`  ${cyan('slop key set KEY')}   Save a new key`);
  console.log(`  ${cyan('slop key remove')}    Remove saved key`);
  console.log(`  ${cyan('slop key rotate')}    Rotate key (invalidates old)\n`);
}

// ============================================================
// ORG — Agent Organizations
// ============================================================
async function cmdOrg(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Agent Organizations')}\n`);
    console.log(`  ${cyan('slop org launch')} ${dim('--name "My Team" --template startup-team')}`);
    console.log(`  ${cyan('slop org templates')}              List pre-built org templates`);
    console.log(`  ${cyan('slop org status')} ${dim('<org-id>')}         Check org status`);
    console.log(`  ${cyan('slop org task')} ${dim('<org-id> "task"')}   Send task to org`);
    console.log(`  ${cyan('slop org scale')} ${dim('<org-id>')}         Scale agents up/down`);
    console.log(`  ${cyan('slop org standup')} ${dim('<org-id>')}       Get today's standups\n`);
    return;
  }

  if (sub === 'templates') {
    const res = await request('GET', '/v1/org/templates', null, false);
    const templates = res.data?.templates || res.templates || [];
    if (jsonMode) { console.log(JSON.stringify(templates, null, 2)); return; }
    console.log(`\n  ${bold('Organization Templates')}\n`);
    for (const t of templates) {
      console.log(`  ${cyan(t.id.padEnd(20))} ${t.agents.length} agents  ${dim(t.description)}`);
    }
    console.log('');
    return;
  }

  if (sub === 'launch') {
    const nameIdx = args.indexOf('--name');
    const templateIdx = args.indexOf('--template');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : 'My Org';
    const template = templateIdx >= 0 ? args[templateIdx + 1] : null;

    let body = { name };
    if (template) {
      // Fetch template and use its agents/channels
      const tmpl = await request('GET', '/v1/org/templates', null, false);
      const found = (tmpl.data?.templates || tmpl.templates || []).find(t => t.id === template);
      if (found) { body.agents = found.agents; body.channels = found.channels; }
      else { die('Template not found: ' + template); }
    }
    body.auto_handoff = true;

    if (!quiet && !jsonMode) console.log(dim(`\n  Launching ${name}...`));
    const res = await request('POST', '/v1/org/launch', body);
    const d = res.data || res;

    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }

    console.log(`\n  ${green('\u2713 Organization launched!')}`);
    console.log(`  ${bold('Org ID:')}  ${cyan(d.org_id)}`);
    console.log(`  ${bold('Agents:')} ${d.agents?.length || 0}`);
    for (const a of (d.agents || [])) {
      console.log(`    ${dim('\u2022')} ${a.name} (${a.role}) ${dim('\u2014 ' + a.model)}`);
    }
    console.log(`  ${bold('Channels:')} ${(d.channels || []).join(', ')}`);
    console.log(`  ${bold('Hive:')}   ${d.hive_id}`);
    console.log(`\n  ${dim('Send a task:')} ${cyan('slop org task ' + d.org_id + ' "Build a REST API"')}\n`);
    return;
  }

  if (sub === 'task') {
    const orgId = args[1];
    const task = args.slice(2).filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
    if (!orgId || !task) die('Usage: slop org task <org-id> "your task here"');
    const res = await request('POST', '/v1/org/' + orgId + '/task', { task });
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    console.log(`\n  ${green('\u2713 Task sent!')} Assigned to ${bold(d.assigned_to || 'first agent')}\n`);
    return;
  }

  if (sub === 'status') {
    const orgId = args[1];
    if (!orgId) die('Usage: slop org status <org-id>');
    const res = await request('GET', '/v1/org/' + orgId + '/status');
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    console.log(`\n  ${bold(d.name || 'Organization')}`);
    console.log(`  Agents: ${cyan(String(d.agent_count || 0))}  Messages: ${d.messages_total || 0}  Chain: ${d.chain_status || 'unknown'}\n`);
    return;
  }

  if (sub === 'scale') {
    const orgId = args[1];
    if (!orgId) die('Usage: slop org scale <org-id> [--count N]');
    const countIdx = args.indexOf('--count');
    const count = countIdx >= 0 ? parseInt(args[countIdx + 1]) : undefined;
    const body = {};
    if (count !== undefined) body.count = count;
    const res = await request('POST', '/v1/org/' + orgId + '/scale', body);
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    console.log(`\n  ${green('\u2713 Scaled!')} Agents: ${cyan(String(d.agent_count || d.count || 0))}\n`);
    return;
  }

  if (sub === 'standup') {
    const orgId = args[1];
    if (!orgId) die('Usage: slop org standup <org-id>');
    const res = await request('GET', '/v1/org/' + orgId + '/standup');
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    console.log(`\n  ${bold('Daily Standup')}\n`);
    for (const a of (d.agents || [])) {
      console.log(`  ${cyan(a.name)} (${a.role}/${a.model}): ${dim(a.standup?.status || 'no standup')}`);
    }
    console.log('');
    return;
  }

  die('Unknown org command: ' + sub + '. Run slop org help');
}

// ============================================================
// CHAIN — Agent Chain Management
// ============================================================
async function cmdChain(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Agent Chains')}\n`);
    console.log(`  ${cyan('slop chain create')} ${dim('--name "research" --steps "claude:research,grok:critique"')}`);
    console.log(`  ${cyan('slop chain list')}                     List your chains`);
    console.log(`  ${cyan('slop chain status')} ${dim('<chain-id>')}       Check chain status`);
    console.log(`  ${cyan('slop chain pause')} ${dim('<chain-id>')}        Pause a running chain`);
    console.log(`  ${cyan('slop chain resume')} ${dim('<chain-id>')}       Resume a paused chain\n`);
    return;
  }

  if (sub === 'create') {
    const nameIdx = args.indexOf('--name');
    const stepsIdx = args.indexOf('--steps');
    const loopFlag = args.includes('--loop');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : 'Untitled Chain';
    const stepsRaw = stepsIdx >= 0 ? args[stepsIdx + 1] : null;

    if (!stepsRaw) die('Usage: slop chain create --name "name" --steps "model:role,model:role"');

    const steps = stepsRaw.split(',').map(s => {
      const parts = s.trim().split(':');
      return { model: parts[0], role: parts[1] || 'default' };
    });

    const body = { name, steps, loop: loopFlag };
    if (!quiet && !jsonMode) console.log(dim(`\n  Creating chain "${name}"...`));
    const res = await request('POST', '/v1/chain/create', body);
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    console.log(`\n  ${green('\u2713 Chain created!')}`);
    console.log(`  ${bold('Chain ID:')} ${cyan(d.chain_id || d.id)}`);
    console.log(`  ${bold('Steps:')}    ${steps.length}`);
    console.log(`  ${bold('Loop:')}     ${loopFlag ? green('yes') : dim('no')}`);
    for (let i = 0; i < steps.length; i++) {
      console.log(`    ${dim(String(i + 1) + '.')} ${cyan(steps[i].model)} ${dim('\u2192')} ${steps[i].role}`);
    }
    console.log('');
    return;
  }

  if (sub === 'list') {
    const res = await request('GET', '/v1/chain/list');
    const chains = res.data?.chains || res.chains || [];
    if (jsonMode) { console.log(JSON.stringify(chains, null, 2)); return; }
    console.log(`\n  ${bold('Your Chains')}\n`);
    if (chains.length === 0) {
      console.log(dim('  No chains found. Create one with: slop chain create\n'));
      return;
    }
    for (const c of chains) {
      const status = c.status === 'running' ? green(c.status) : c.status === 'paused' ? yellow(c.status) : dim(c.status || 'unknown');
      console.log(`  ${cyan(c.id || c.chain_id)}  ${bold(c.name || 'Untitled')}  ${status}  ${dim(String(c.steps?.length || 0) + ' steps')}`);
    }
    console.log('');
    return;
  }

  if (sub === 'status') {
    const chainId = args[1];
    if (!chainId) die('Usage: slop chain status <chain-id>');
    const res = await request('GET', '/v1/chain/' + chainId + '/status');
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    const status = d.status === 'running' ? green(d.status) : d.status === 'paused' ? yellow(d.status) : dim(d.status || 'unknown');
    console.log(`\n  ${bold(d.name || 'Chain')} ${dim('(' + chainId + ')')}`);
    console.log(`  Status: ${status}  Step: ${d.current_step || 0}/${d.total_steps || 0}  Iterations: ${d.iterations || 0}\n`);
    return;
  }

  if (sub === 'pause') {
    const chainId = args[1];
    if (!chainId) die('Usage: slop chain pause <chain-id>');
    const res = await request('POST', '/v1/chain/' + chainId + '/pause', {});
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    console.log(`\n  ${yellow('\u23f8 Chain paused:')} ${chainId}\n`);
    return;
  }

  if (sub === 'resume') {
    const chainId = args[1];
    if (!chainId) die('Usage: slop chain resume <chain-id>');
    const res = await request('POST', '/v1/chain/' + chainId + '/resume', {});
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    console.log(`\n  ${green('\u25b6 Chain resumed:')} ${chainId}\n`);
    return;
  }

  die('Unknown chain command: ' + sub + '. Run slop chain help');
}

// ============================================================
// MEMORY — Direct Memory Operations
// ============================================================
async function cmdMemory(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Memory Operations')}\n`);
    console.log(`  ${cyan('slop memory set')} ${dim('<key> <value>')}     Store a value`);
    console.log(`  ${cyan('slop memory get')} ${dim('<key>')}             Retrieve a value`);
    console.log(`  ${cyan('slop memory search')} ${dim('<query>')}        Search memory`);
    console.log(`  ${cyan('slop memory list')}                    List all keys`);
    console.log(`  ${cyan('slop memory delete')} ${dim('<key>')}          Delete a key\n`);
    return;
  }

  if (sub === 'set') {
    const key = args[1];
    const value = args.slice(2).filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
    if (!key || !value) die('Usage: slop memory set <key> <value>');
    const res = await request('POST', '/v1/memory-set', { key, value });
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    console.log(`\n  ${green('\u2713 Stored:')} ${cyan(key)}\n`);
    return;
  }

  if (sub === 'get') {
    const key = args[1];
    if (!key) die('Usage: slop memory get <key>');
    const res = await request('POST', '/v1/memory-get', { key });
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    if (quiet) { console.log(d.value !== undefined ? d.value : ''); return; }
    console.log(`\n  ${bold(key + ':')} ${green(String(d.value !== undefined ? d.value : dim('(not found)')))}\n`);
    return;
  }

  if (sub === 'search') {
    const query = args.slice(1).filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
    if (!query) die('Usage: slop memory search <query>');
    const res = await request('POST', '/v1/memory-search', { query });
    const results = res.data?.results || res.results || [];
    if (jsonMode) { console.log(JSON.stringify(results, null, 2)); return; }
    console.log(`\n  ${bold('Memory Search:')} "${query}"\n`);
    if (results.length === 0) { console.log(dim('  No results found.\n')); return; }
    for (const r of results) {
      console.log(`  ${cyan(r.key || r.id)}  ${dim('\u2192')}  ${green(String(r.value || r.content || '').slice(0, 80))}`);
    }
    console.log('');
    return;
  }

  if (sub === 'list') {
    const res = await request('POST', '/v1/memory-list', {});
    const keys = res.data?.keys || res.keys || res.data?.entries || [];
    if (jsonMode) { console.log(JSON.stringify(keys, null, 2)); return; }
    console.log(`\n  ${bold('Memory Keys')}\n`);
    if (keys.length === 0) { console.log(dim('  No keys stored.\n')); return; }
    for (const k of keys) {
      if (typeof k === 'string') {
        console.log(`  ${cyan(k)}`);
      } else {
        console.log(`  ${cyan(k.key || k.id)}  ${dim(String(k.value || '').slice(0, 60))}`);
      }
    }
    console.log('');
    return;
  }

  if (sub === 'delete' || sub === 'rm' || sub === 'remove') {
    const key = args[1];
    if (!key) die('Usage: slop memory delete <key>');
    const res = await request('POST', '/v1/memory-delete', { key });
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    console.log(`\n  ${green('\u2713 Deleted:')} ${cyan(key)}\n`);
    return;
  }

  die('Unknown memory command: ' + sub + '. Run slop memory help');
}

// ============================================================
// RUN — Natural Language Task Execution
// ============================================================
async function cmdRun(args) {
  requireKey();
  const task = args.filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
  if (!task) die('Usage: slop run "describe your task in natural language"');

  if (!quiet && !jsonMode) console.log(dim(`\n  Running: "${task}"...`));

  try {
    const res = await request('POST', '/v1/agent/run', { task });
    const d = res.data || res;

    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }

    if (quiet) {
      console.log(d.result || d.output || JSON.stringify(d));
      return;
    }

    console.log(`\n  ${bold('Result')}`);
    console.log(`  ${dim('\u2500'.repeat(42))}`);
    if (d.steps && Array.isArray(d.steps)) {
      for (let i = 0; i < d.steps.length; i++) {
        const s = d.steps[i];
        console.log(`  ${dim(String(i + 1) + '.')} ${cyan(s.action || s.tool || 'step')} ${dim('\u2192')} ${green(String(s.result || s.output || '').slice(0, 80))}`);
      }
    }
    if (d.result !== undefined) {
      console.log(`\n  ${bold('Output:')} ${green(String(d.result))}`);
    } else if (d.output !== undefined) {
      console.log(`\n  ${bold('Output:')} ${green(String(d.output))}`);
    } else {
      console.log(`\n  ${prettyJSON(d)}`);
    }
    if (d.credits_used) console.log(dim(`\n  [${d.credits_used}cr used]`));
    console.log('');
  } catch (err) {
    handleError(err);
  }
}

// ============================================================
// DISCOVER — Find the Right Feature for a Goal
// ============================================================
async function cmdDiscover(args) {
  const query = args.filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
  if (!query) die('Usage: slop discover "what you want to accomplish"');

  if (!quiet && !jsonMode) console.log(dim(`\n  Discovering: "${query}"...`));

  try {
    const res = await request('POST', '/v1/discover', { query }, false);
    const d = res.data || res;

    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }

    if (quiet) {
      const suggestions = d.suggestions || d.results || [];
      for (const s of suggestions) console.log(s.command || s.slug || s.id || '');
      return;
    }

    console.log(`\n  ${bold('Recommended for:')} "${query}"\n`);
    const suggestions = d.suggestions || d.results || d.recommendations || [];
    if (suggestions.length === 0) {
      console.log(dim('  No suggestions found. Try different terms.\n'));
      return;
    }
    for (const s of suggestions) {
      console.log(`  ${cyan(s.command || s.slug || s.id || 'unknown')}`);
      if (s.description || s.desc) console.log(`    ${dim(s.description || s.desc)}`);
      if (s.example) console.log(`    ${dim('Example:')} ${cyan(s.example)}`);
      console.log('');
    }
  } catch (err) {
    handleError(err);
  }
}

// ============================================================
// STATS — Platform Statistics
// ============================================================
async function cmdStats(args) {
  if (!quiet && !jsonMode) console.log(dim(`\n  Loading stats...`));

  try {
    // Fetch health for API count, and balance if authed
    const healthRes = await request('GET', '/v1/health', null, false);
    const h = healthRes.data || {};

    let balance = null;
    let usage = null;
    if (API_KEY) {
      try {
        const balRes = await request('GET', '/v1/credits/balance');
        balance = balRes.data || {};
      } catch (e) { /* no balance */ }
      try {
        const usageRes = await request('GET', '/v1/usage/today');
        usage = usageRes.data || {};
      } catch (e) { /* no usage endpoint */ }
    }

    if (jsonMode) {
      console.log(JSON.stringify({ health: h, balance, usage }, null, 2));
      return;
    }

    if (quiet) {
      console.log(`apis: ${h.apis_loaded || 0}`);
      if (balance) console.log(`credits: ${balance.balance || 0}`);
      if (usage) console.log(`calls_today: ${usage.calls || 0}`);
      return;
    }

    console.log(`\n  ${bold('Platform Stats')}`);
    console.log(`  ${dim('\u2500'.repeat(42))}`);
    console.log(`  ${bold('Total APIs:')}        ${yellow(String(h.apis_loaded || 0))}`);
    console.log(`  ${bold('Status:')}            ${h.status === 'operational' ? green(h.status) : red(h.status || 'unknown')}`);
    console.log(`  ${bold('Version:')}           ${dim(h.version || 'unknown')}`);
    console.log(`  ${bold('Uptime:')}            ${dim(formatUptime(h.uptime_seconds || 0))}`);
    if (balance) {
      console.log(`  ${bold('Credits remaining:')} ${green(String(balance.balance || 0))}`);
      console.log(`  ${bold('Tier:')}              ${cyan(balance.tier || 'free')}`);
    }
    if (usage) {
      console.log(`  ${bold('Calls today:')}       ${yellow(String(usage.calls || usage.requests || 0))}`);
      console.log(`  ${bold('Credits used today:')} ${yellow(String(usage.credits_used || 0))}`);
    }
    if (!API_KEY) {
      console.log(`\n  ${dim('Log in for usage stats: slop login')}`);
    }
    console.log('');
  } catch (err) {
    handleError(err);
  }
}

// ============================================================
// MAIN ENTRYPOINT
// ============================================================
async function main() {
  const rawArgs = process.argv.slice(2).filter(a => !GLOBAL_FLAGS.includes(a));
  const cmd = rawArgs[0];
  const args = rawArgs.slice(1);

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
    case 'signup':  await cmdSignup();     break;
    case 'login':   await cmdLogin();      break;
    case 'whoami':  await cmdWhoami();     break;
    case 'config':  cmdConfig(args);       break;
    case 'key':     cmdKey(args);          break;
    case 'mcp':     cmdMcp();              break;
    case 'org':     await cmdOrg(args);    break;
    case 'chain':   await cmdChain(args);  break;
    case 'memory':  await cmdMemory(args); break;
    case 'mem':     await cmdMemory(args); break;
    case 'run':     await cmdRun(args);    break;
    case 'discover': await cmdDiscover(args); break;
    case 'stats':   await cmdStats(args);  break;
    default:
      // Natural language routing — understand what the user wants
      await cmdNatural(cmd, args);
      break;
  }
}

// ============================================================
// NATURAL LANGUAGE CLI ROUTER
// ============================================================

async function cmdNatural(cmd, args) {
  const fullInput = [cmd, ...args].filter(a => !GLOBAL_FLAGS.includes(a)).join(' ').trim();
  if (!fullInput) { die('Run `slop help` for usage.'); }

  // Pattern matching for common intents — no API call needed, instant routing
  const lower = fullInput.toLowerCase();

  // Memory operations
  if (/^(remember|store|save|set|put)\s+(\w+)\s*[=:]\s*(.+)/i.test(fullInput)) {
    const m = fullInput.match(/^(?:remember|store|save|set|put)\s+(\w+)\s*[=:]\s*(.+)/i);
    return cmdMemory(['set', m[1], m[2]]);
  }
  if (/^(recall|get|fetch|retrieve|what is|what's|whats)\s+(\w+)/i.test(fullInput)) {
    const m = fullInput.match(/^(?:recall|get|fetch|retrieve|what is|what's|whats)\s+(\S+)/i);
    return cmdMemory(['get', m[1]]);
  }
  if (/^(find|search|look for|where)\s+(.+)\s+in\s+memory/i.test(fullInput)) {
    const m = fullInput.match(/^(?:find|search|look for|where)\s+(.+)\s+in\s+memory/i);
    return cmdMemory(['search', m[1]]);
  }
  if (/^(forget|delete|remove|clear)\s+(\w+)/i.test(fullInput)) {
    const m = fullInput.match(/^(?:forget|delete|remove|clear)\s+(\S+)/i);
    return cmdMemory(['delete', m[1]]);
  }

  // Hash/crypto
  if (/^hash\s+(.+)/i.test(fullInput)) {
    const text = fullInput.replace(/^hash\s+/i, '').replace(/^['"]|['"]$/g, '');
    return cmdCall(['crypto-hash-sha256', '--text', text]);
  }
  if (/^(encrypt|encode)\s+(.+)\s+(base64|b64)/i.test(fullInput)) {
    const text = fullInput.match(/^(?:encrypt|encode)\s+(.+)\s+(?:base64|b64)/i)[1];
    return cmdCall(['text-base64-encode', '--text', text]);
  }
  if (/^uuid|^generate.*uuid|^new.*id/i.test(lower)) {
    return cmdCall(['crypto-uuid']);
  }

  // Validation
  if (/^(validate|check|verify|is)\s+.*(email|mail)\s+(\S+)/i.test(fullInput)) {
    const m = fullInput.match(/(\S+@\S+\.\S+)/);
    if (m) return cmdCall(['validate-email-syntax', '--email', m[1]]);
  }
  if (/^(validate|check|verify)\s+.*url\s+(\S+)/i.test(fullInput)) {
    const m = fullInput.match(/(https?:\/\/\S+)/);
    if (m) return cmdCall(['validate-url-format', '--url', m[1]]);
  }
  if (/^(validate|check)\s+.*ip\s+([\d.]+)/i.test(fullInput)) {
    const m = fullInput.match(/([\d]+\.[\d]+\.[\d]+\.[\d]+)/);
    if (m) return cmdCall(['validate-ip-address', '--ip', m[1]]);
  }

  // Word/text operations
  if (/^(count|how many)\s+(words?|characters?|chars?)\s+(?:in\s+)?(.+)/i.test(fullInput)) {
    const m = fullInput.match(/^(?:count|how many)\s+\w+\s+(?:in\s+)?(.+)/i);
    const text = m[1].replace(/^['"]|['"]$/g, '');
    return cmdCall(['text-word-count', '--text', text]);
  }
  if (/^(reverse|flip)\s+(.+)/i.test(fullInput)) {
    const text = fullInput.replace(/^(?:reverse|flip)\s+/i, '').replace(/^['"]|['"]$/g, '');
    return cmdCall(['text-reverse', '--text', text]);
  }
  if (/^(slugify|slug)\s+(.+)/i.test(fullInput)) {
    const text = fullInput.replace(/^(?:slugify|slug)\s+/i, '').replace(/^['"]|['"]$/g, '');
    return cmdCall(['text-slugify', '--text', text]);
  }

  // Summarize
  if (/^(summarize|summarise|tldr|summary)\s+(.+)/i.test(fullInput)) {
    requireKey();
    const text = fullInput.replace(/^(?:summarize|summarise|tldr|summary)\s+/i, '').replace(/^['"]|['"]$/g, '');
    return cmdCall(['llm-summarize', '--text', text]);
  }

  // Org operations
  if (/^(launch|create|start|deploy)\s+(an?\s+)?(org|team|organization|company|startup|agency)/i.test(lower)) {
    return cmdOrg(['launch', ...args]);
  }
  if (/^(send|assign|give)\s+.*task/i.test(lower)) {
    // Try to extract org ID and task
    return cmdRun([fullInput]);
  }

  // Chain operations
  if (/^(chain|loop|repeat|cycle)\s+/i.test(lower)) {
    return cmdChain(['create', ...args]);
  }

  // Balance/credits
  if (/^(how many|my|check)\s+(credits?|balance|money)/i.test(lower) || lower === 'credits' || lower === 'balance') {
    return cmdBalance();
  }

  // Stats
  if (/^(status|stats|how is|platform|health)/i.test(lower)) {
    return cmdStats(args);
  }

  // Search for tools
  if (/^(find|search|look for|what tools?|which api|how do i)\s+(.+)/i.test(fullInput)) {
    const query = fullInput.replace(/^(?:find|search|look for|what tools?|which api|how do i)\s+/i, '');
    return cmdSearch([query]);
  }

  // If nothing matched locally, try the server-side agent/run as fallback
  requireKey();
  if (!quiet && !jsonMode) console.log(dim(`\n  Understanding: "${fullInput}"...\n`));

  try {
    // First try discover to suggest features
    const disc = await request('POST', '/v1/discover', { goal: fullInput });
    const recs = disc.data?.recommended || disc.recommended || [];

    if (recs.length > 0 && recs[0].relevance > 0) {
      if (!quiet && !jsonMode) {
        console.log(`  ${bold('Suggested features:')}\n`);
        for (const r of recs.slice(0, 3)) {
          console.log(`  ${cyan(r.name || r.endpoint)} ${dim('— ' + (r.when || r.description || ''))}`);
        }
        console.log('');
      }
    }

    // Then try agent/run for actual execution
    const res = await request('POST', '/v1/agent/run', { task: fullInput });
    const d = res.data || res;

    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }

    if (d.steps && d.steps.length > 0) {
      const successful = d.steps.filter(s => s.success !== false);
      if (successful.length > 0) {
        console.log(`  ${green('✓')} Executed ${successful.length} tool${successful.length > 1 ? 's' : ''}:\n`);
        for (const step of successful) {
          const result = step.result || step.data || step;
          const preview = JSON.stringify(result).slice(0, 120);
          console.log(`  ${cyan(step.api || step.tool || 'unknown')} ${dim('→')} ${preview}`);
        }
      }
      if (d.answer) console.log(`\n  ${bold('Answer:')} ${d.answer}`);
      console.log(dim(`\n  ${d.total_credits || 0} credits used\n`));
    } else if (d.answer) {
      console.log(`\n  ${d.answer}\n`);
    } else {
      console.log(dim(`\n  Could not process: "${fullInput}"`));
      console.log(`  Try: ${cyan('slop search "' + fullInput.split(' ').slice(0, 3).join(' ') + '"')}\n`);
    }
  } catch (err) {
    // Final fallback: suggest search
    if (!quiet && !jsonMode) {
      console.log(dim(`\n  I don't have a direct command for that.`));
      console.log(`  Try: ${cyan('slop search "' + fullInput.split(' ').slice(0, 3).join(' ') + '"')}`);
      console.log(`  Or:  ${cyan('slop run "' + fullInput + '"')}\n`);
    }
  }
}

main().catch((err) => {
  console.error(red('\n  Fatal: ') + err.message + '\n');
  process.exit(1);
});
