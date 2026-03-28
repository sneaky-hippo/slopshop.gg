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
const verbose  = process.argv.includes('--verbose') || process.argv.includes('-V');
const timeoutFlag = process.argv.find(a => a.startsWith('--timeout='));
const globalTimeout = timeoutFlag ? parseInt(timeoutFlag.split('=')[1]) * 1000 : 30000;
const retryIdx = process.argv.indexOf('--retry');
const maxRetries = retryIdx >= 0 ? parseInt(process.argv[retryIdx + 1]) || 3 : 0;

// Strip global flags from argv so commands don't see them
const GLOBAL_FLAGS = ['--quiet', '-q', '--json', '--no-color', '--verbose', '-V'];

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
const os = require('os');
const fs = require('fs');
const path = require('path');
const CONFIG_DIR = path.join(os.homedir(), '.slopshop');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const THEMES={default:{r:"[38;2;239;68;68m"},dracula:{r:"[38;2;189;147;249m"},nord:{r:"[38;2;136;192;208m"},monokai:{r:"[38;2;249;38;114m"}};
const PKG_VERSION = (() => { try { return require('./package.json').version; } catch { return 'unknown'; } })();

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch (e) { return {}; }
}
function saveConfig(cfg) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

const _cfg = loadConfig();
const API_KEY  = process.env.SLOPSHOP_KEY || _cfg.api_key || '';
const BASE_URL = (process.env.SLOPSHOP_BASE || _cfg.base_url || 'https://slopshop.gg').replace(/\/$/, '');

// ============================================================
// HTTP HELPER — PERF: Connection pooling with keep-alive agents
// ============================================================
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 6, keepAliveMsecs: 30000 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 6, keepAliveMsecs: 30000 });

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
      agent: isHttps ? httpsAgent : httpAgent, // PERF: Reuse TCP connections
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'slopshop-cli/' + PKG_VERSION,
        'Connection': 'keep-alive',
        'Accept-Encoding': 'gzip, deflate', // PERF: Request compressed responses
      },
    };

    if (auth && API_KEY) {
      options.headers['Authorization'] = `Bearer ${API_KEY}`;
    }
    // Attach memory session header for memory endpoints (2FA)
    if (path.includes('memory-') || path.includes('/memory')) {
      const cfg = loadConfig();
      if (cfg.memory_session) {
        options.headers['X-Memory-Session'] = cfg.memory_session;
      }
    }
    if (payload) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    if (verbose) {
      console.error(dim(`  [verbose] ${method} ${urlStr}`));
      if (payload) console.error(dim(`  [verbose] Body: ${payload.slice(0, 200)}`));
    }

    const req = lib.request(options, (res) => {
      // PERF: Handle gzip/deflate compressed responses
      let stream = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip' || encoding === 'deflate') {
        const zlib = require('zlib');
        stream = encoding === 'gzip' ? res.pipe(zlib.createGunzip()) : res.pipe(zlib.createInflate());
      }

      let data = '';
      stream.on('data', (chunk) => { data += chunk; });
      stream.on('end', () => {
        if (verbose) {
          console.error(dim(`  [verbose] ${res.statusCode} ${JSON.stringify(res.headers).slice(0, 200)}`));
        }
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

    req.setTimeout(globalTimeout, () => {
      req.destroy(new Error(`Request timed out after ${globalTimeout / 1000} seconds`));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ============================================================
// SPINNER — Progress indicator during API calls
// ============================================================
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerTimer = null;
let spinnerFrame = 0;

function spinnerStart(msg) {
  if (quiet || jsonMode || !process.stderr.isTTY) return;
  spinnerFrame = 0;
  spinnerTimer = setInterval(() => {
    const frame = noColor ? '-' : SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
    process.stderr.write(`\r  ${cyan(frame)} ${dim(msg)}`);
    spinnerFrame++;
  }, 80);
}

function spinnerStop(success = true) {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    if (process.stderr.isTTY) {
      process.stderr.write('\r' + ' '.repeat(80) + '\r');
    }
  }
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

  if (!data || typeof data !== 'object') {
    return { result: { value: data }, metaParts: [] };
  }

  if (data.data !== undefined && data.meta !== undefined) {
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

  // --dry-run: show what would happen without executing
  if (args.includes('--dry-run')) {
    try {
      spinnerStart(`Estimating cost for ${slug}...`);
      const res = await request('POST', '/v1/dry-run/' + slug, {}, false);
      spinnerStop(true);
      if (jsonMode) { console.log(JSON.stringify(res.data, null, 2)); return; }
      const d = res.data;
      console.log(`\n  ${bold('Dry Run:')} ${cyan(slug)}`);
      console.log(`  ${bold('Credits:')} ${yellow(String(d.credits || 0))}`);
      console.log(`  ${bold('Tier Required:')} ${dim(d.tier || 'any')}`);
      console.log(`  ${bold('Would execute:')} ${green('yes')}`);
      console.log(dim('  Use without --dry-run to execute.\n'));
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

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

  // --model flag: pass model selection for LLM APIs
  const modelIdx = process.argv.indexOf('--model');
  if (modelIdx >= 0 && process.argv[modelIdx + 1]) {
    input.model = process.argv[modelIdx + 1];
  }

  // Accept piped stdin as text/input field
  const stdinData = await readStdin();
  if (stdinData) {
    if (!input.text && !input.input) {
      input.text = stdinData;
    }
  }

  spinnerStart(`Calling ${slug}...`);

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) spinnerStart(`Retry ${attempt}/${maxRetries} — ${slug}...`);
      const res = await request('POST', `/v1/${slug}`, input);
      spinnerStop(true);
      printResult(res.data, slug);

      // Save to history
      const cfg2 = loadConfig();
      cfg2.history = cfg2.history || [];
      const d = res.data;
      const meta = (d && typeof d === 'object' && d.meta) ? d.meta : {};
      cfg2.history.push({ time: new Date().toLocaleTimeString(), command: 'call ' + slug, credits: meta.credits_used });
      if (cfg2.history.length > 100) cfg2.history = cfg2.history.slice(-100);
      saveConfig(cfg2);

      return;
    } catch (err) {
      lastErr = err;
      spinnerStop(false);
      if (attempt >= maxRetries) break;
      // Wait a bit before retry (exponential backoff)
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  handleError(lastErr);
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

  spinnerStart(`Searching for: "${query}"...`);

  try {
    const res = await request('POST', '/v1/resolve', { query }, false);
    spinnerStop(true);

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
  const filteredArgs = args.filter(a => !GLOBAL_FLAGS.includes(a) && !a.startsWith('--limit') && !a.startsWith('--offset') && !a.startsWith('--page'));
  const category = filteredArgs[0] || '';

  // Pagination flags
  const limitIdx = args.indexOf('--limit');
  const offsetIdx = args.indexOf('--offset');
  const pageIdx = args.indexOf('--page');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) || 50 : 0;
  const offset = offsetIdx >= 0 ? parseInt(args[offsetIdx + 1]) || 0 : (pageIdx >= 0 ? ((parseInt(args[pageIdx + 1]) || 1) - 1) * (limit || 50) : 0);

  spinnerStart(`Loading APIs${category ? ` in category: ${category}` : ''}...`);

  try {
    const queryParams = limit ? `?limit=${limit}&offset=${offset}` : '';
    const res = await request('GET', '/v1/tools' + queryParams, null, false);
    spinnerStop(true);
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

    const pageInfo = limit ? `  Showing ${offset + 1}-${Math.min(offset + limit, filtered.length)} of ${total}.` : `  Showing ${filtered.length} of ${total}.`;
    console.log(dim(`\n${pageInfo} Use --limit N --offset N or --page N to paginate. Use a category name to filter.`));
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

  // Safety: confirm purchase
  if (!quiet && !jsonMode && process.stdin.isTTY && !args.includes('--yes') && !args.includes('-y')) {
    const answer = await prompt(`  Purchase ${amount.toLocaleString()} credits for ${prices[amount]}? (y/N) `);
    if (answer.toLowerCase() !== 'y') { console.log(dim('\n  Cancelled.\n')); return; }
  }

  spinnerStart(`Purchasing ${amount.toLocaleString()} credits...`);

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
      commands: ['call', 'pipe', 'search', 'list', 'run', 'org', 'chain', 'memory', 'discover', 'stats', 'signup', 'login', 'whoami', 'key', 'config', 'balance', 'buy', 'health', 'mcp', 'batch', 'watch', 'alias', 'history', 'plan', 'models', 'profile', 'cost', 'debug', 'cloud', 'logs', 'dev', 'env', 'listen', 'types', 'file', 'git', 'review', 'session', 'live', 'version', 'upgrade', 'completions', 'help'],
      flags: ['--quiet', '-q', '--json', '--no-color', '--verbose', '-V', '--timeout=N', '--retry N', '--model M', '--dry-run', '--limit N', '--offset N'],
      version: PKG_VERSION
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
  console.log(`    ${cyan('slop memory')} ${dim('<sub>')}                      Direct memory key-value operations`);
  console.log(`    ${cyan('slop live')} ${dim('<org-id>')}                     Real-time agent dashboard (The Sims for AI)`);
  console.log(`    ${cyan('slop live --launch')}                    Launch 30-agent startup + watch`);
  console.log(`    ${cyan('slop interactive')}                      Interactive REPL / shell mode\n`);
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
  console.log(`    ${cyan('slop mcp serve')}                         Start MCP server (Goose/Cursor/Cline)`);
  console.log(`    ${cyan('slop mcp config')}                        Show MCP config for all clients`);
  console.log(`    ${cyan('slop init')} ${dim('[--full-stack --ollama]')}    Scaffold Slopshop project`);
  console.log(`    ${cyan('slop help')}                              Show this help\n`);
  console.log(`  ${bold('AI & PLANNING')}`);
  console.log(`    ${cyan('slop plan')} ${dim('"task description"')}          Plan before executing`);
  console.log(`    ${cyan('slop plan --execute')}                    Execute saved plan`);
  console.log(`    ${cyan('slop review')} ${dim('[file]')}                   AI code review`);
  console.log(`    ${cyan('slop debug')} ${dim('"error message"')}            AI error debugging`);
  console.log(`    ${cyan('slop models')}                            List/set AI models`);
  console.log(`    ${cyan('slop cost')} ${dim('<slug>')}                     Estimate credit cost\n`);
  console.log(`  ${bold('LOCAL TOOLS')}`);
  console.log(`    ${cyan('slop file')} ${dim('read|write|edit|list|info')}   Local file operations`);
  console.log(`    ${cyan('slop git')} ${dim('status|diff|log|commit|push')} Git integration`);
  console.log(`    ${cyan('slop session')} ${dim('save|resume|list')}         Save/resume CLI sessions\n`);
  console.log(`  ${bold('CLOUD & INFRA')}`);
  console.log(`    ${cyan('slop cloud')} ${dim('run|status|list')}            Cloud task handoff`);
  console.log(`    ${cyan('slop logs')} ${dim('[--follow --filter X]')}       Stream platform logs`);
  console.log(`    ${cyan('slop listen')} ${dim('[--forward-to URL]')}        Webhook event listener`);
  console.log(`    ${cyan('slop dev')} ${dim('[--port 3000]')}                Start local dev server`);
  console.log(`    ${cyan('slop env')} ${dim('list|set|get|delete')}          Manage env variables\n`);
  console.log(`  ${bold('PRODUCTIVITY')}`);
  console.log(`    ${cyan('slop batch')} ${dim('<file> or "cmd1" "cmd2"')}    Execute multiple commands`);
  console.log(`    ${cyan('slop watch')} ${dim('<slug> [--interval 5]')}      Repeat a command every N seconds`);
  console.log(`    ${cyan('slop alias')} ${dim('<name> = <command>')}         Create shorthand aliases`);
  console.log(`    ${cyan('slop history')} ${dim('[N | clear]')}              Show recent commands`);
  console.log(`    ${cyan('slop profile')} ${dim('list|add|switch')}          Multi-profile management`);
  console.log(`    ${cyan('slop types')} ${dim('[ts|py|go]')}                 Generate API type definitions`);
  console.log(`    ${cyan('slop version')}                            Show version info`);
  console.log(`    ${cyan('slop upgrade')}                            Check for CLI updates`);
  console.log(`    ${cyan('slop completions')} ${dim('[bash|zsh|fish]')}      Generate shell completions\n`);
  console.log(`  ${bold('FLAGS')}`);
  console.log(`    ${yellow('--quiet, -q')}    Suppress decorative output, data only`);
  console.log(`    ${yellow('--json')}         Output raw JSON (for piping)`);
  console.log(`    ${yellow('--no-color')}     Disable ANSI colors`);
  console.log(`    ${yellow('--verbose, -V')}  Show request/response details`);
  console.log(`    ${yellow('--timeout=N')}    Request timeout in seconds (default: 30)`);
  console.log(`    ${yellow('--retry N')}      Retry failed requests N times`);
  console.log(`    ${yellow('--model M')}      Override AI model for LLM calls`);
  console.log(`    ${yellow('--dry-run')}      Preview cost without executing`);
  console.log(`    ${yellow('--limit N')}      Limit results (list/batch)`);
  console.log(`    ${yellow('--offset N')}     Offset results (list)\n`);
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
function cmdMcp(args) {
  const sub = (args || [])[0];

  if (sub === 'serve') {
    // Start MCP server in STDIO mode for any MCP client (Goose, Cursor, Claude Desktop, etc.)
    const port = parseInt((args || [])[1]) || 0;
    console.error(`Slopshop MCP Server v${PKG_VERSION} — 925+ real compute tools + free memory`);
    console.error(`Discoverable by Claude Desktop, Cursor, VS Code Copilot, Goose, OpenCode, Cline`);
    console.error(`Base: ${BASE_URL}`);
    if (port) {
      console.error(`HTTP mode on port ${port} (for remote MCP clients)`);
      // HTTP transport for remote MCP clients
      const httpServer = require('http').createServer((req, res) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
          try {
            // Forward to MCP server process
            const { execSync } = require('child_process');
            const result = execSync(`echo '${body.replace(/'/g, "\\'")}' | node "${path.join(__dirname, 'mcp-server.js')}"`, {
              env: { ...process.env, SLOPSHOP_KEY: API_KEY, SLOPSHOP_BASE: BASE_URL },
              timeout: 30000,
            });
            res.writeHead(200);
            res.end(result);
          } catch(e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });
      httpServer.listen(port, () => console.error(`MCP HTTP server listening on port ${port}`));
    } else {
      // STDIO mode (default — works with Goose, Claude Desktop, Cursor, etc.)
      require('./mcp-server.js');
    }
    return;
  }

  if (sub === 'config') {
    // Show MCP config for various clients
    const mcpConfig = {
      slopshop: {
        command: 'npx',
        args: ['slopshop', 'mcp', 'serve'],
        env: { SLOPSHOP_KEY: API_KEY || 'sk-slop-your-key-here' }
      }
    };
    console.log(`\n  ${bold('MCP Server Configuration')}\n`);
    console.log(`  ${cyan('Claude Desktop / Cursor / VS Code Copilot:')}`);
    console.log(`  Add to your MCP settings:\n`);
    console.log(JSON.stringify({ mcpServers: mcpConfig }, null, 2));
    console.log(`\n  ${cyan('Goose:')}`);
    console.log(`  goose configure → Add Extension → STDIO → "npx slopshop mcp serve"\n`);
    console.log(`  ${cyan('OpenCode:')}`);
    console.log(`  Add to opencode.json: { "plugins": ["@slopshop/opencode-plugin"] }\n`);
    console.log(`  ${cyan('Cline:')}`);
    console.log(`  MCP Marketplace → Add custom → command: "npx slopshop mcp serve"\n`);
    console.log(`  ${cyan('Aider:')}`);
    console.log(`  Copy integrations/aider/aider-slopshop.yml to ~/.aider.conf.yml\n`);
    return;
  }

  // Default: setup for Claude Code (legacy behavior)
  console.log(`\n  ${bold('Setting up Slopshop MCP for Claude Code...')}\n`);
  try {
    require('./setup-mcp.js');
  } catch(e) {
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

  console.log(`\n  ${bold('Other MCP options:')}`);
  console.log(`  ${cyan('slop mcp serve')}       Start MCP server (STDIO mode for any client)`);
  console.log(`  ${cyan('slop mcp serve 8765')}  Start MCP server (HTTP mode on port 8765)`);
  console.log(`  ${cyan('slop mcp config')}      Show config for all MCP clients\n`);
}

// ============================================================
// INIT — Scaffold a new Slopshop-powered project
// ============================================================
function cmdInit(args) {
  const flags = (args || []).join(' ');
  const withOllama = flags.includes('--ollama') || flags.includes('--full-stack');
  const withGoose = flags.includes('--goose') || flags.includes('--full-stack');
  const projectDir = process.cwd();

  console.log(`\n  ${bold('Initializing Slopshop project...')}\n`);

  // Create .slopshop directory
  const slopDir = path.join(projectDir, '.slopshop');
  if (!fs.existsSync(slopDir)) fs.mkdirSync(slopDir, { recursive: true });

  // Write MCP config for the project
  const mcpConfig = {
    mcpServers: {
      slopshop: {
        command: 'npx',
        args: ['slopshop', 'mcp', 'serve'],
        env: { SLOPSHOP_KEY: '${SLOPSHOP_KEY}' }
      }
    }
  };
  fs.writeFileSync(path.join(slopDir, 'mcp.json'), JSON.stringify(mcpConfig, null, 2));
  console.log(green('  ✓') + ` Created ${dim('.slopshop/mcp.json')} (MCP server config)`);

  // Write Goose Recipe if requested
  if (withGoose) {
    const recipe = `version: "1.0.0"
title: "Slopshop Agent Workflow"
description: "Use Slopshop tools for compute, memory, and orchestration"

instructions: |
  Use Slopshop extensions for reliable compute operations.
  Store findings in persistent memory.

prompt: "Start the workflow."

extensions:
  - type: stdio
    name: slopshop
    cmd: npx
    args: [slopshop, mcp, serve]
    timeout: 300
    env_keys: [SLOPSHOP_KEY]
`;
    fs.writeFileSync(path.join(slopDir, 'recipe.yaml'), recipe);
    console.log(green('  ✓') + ` Created ${dim('.slopshop/recipe.yaml')} (Goose Recipe template)`);
  }

  // Write docker-compose if full-stack
  if (withOllama) {
    const compose = `version: "3.8"
services:
  slopshop:
    image: node:20-slim
    working_dir: /app
    command: npx slopshop mcp serve 8765
    ports:
      - "8765:8765"
    environment:
      - SLOPSHOP_KEY=\${SLOPSHOP_KEY}
      - SLOPSHOP_BASE=\${SLOPSHOP_BASE:-https://slopshop.gg}
    volumes:
      - slopshop-data:/app/data

  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama

volumes:
  slopshop-data:
  ollama-data:
`;
    fs.writeFileSync(path.join(slopDir, 'docker-compose.yml'), compose);
    console.log(green('  ✓') + ` Created ${dim('.slopshop/docker-compose.yml')} (full stack with Ollama)`);
  }

  // Write .env template
  if (!fs.existsSync(path.join(projectDir, '.env'))) {
    fs.writeFileSync(path.join(projectDir, '.env'), `# Slopshop Configuration\nSLOPSHOP_KEY=${API_KEY || 'sk-slop-your-key-here'}\nSLOPSHOP_BASE=https://slopshop.gg\n`);
    console.log(green('  ✓') + ` Created ${dim('.env')} (API key config)`);
  }

  console.log(`\n  ${bold('Next steps:')}`);
  console.log(`  ${cyan('slop mcp serve')}         Start MCP server`);
  console.log(`  ${cyan('slop call crypto-uuid')}   Test a tool call`);
  console.log(`  ${cyan('slop memory set hello world')}  Store persistent memory`);
  if (withOllama) console.log(`  ${cyan('docker compose -f .slopshop/docker-compose.yml up')}  Start full stack`);
  if (withGoose) console.log(`  ${cyan('goose run --recipe .slopshop/recipe.yaml')}  Run Goose Recipe`);
  console.log('');
}

// ============================================================
// UTILITIES
// ============================================================
function requireKey() {
  if (!API_KEY) {
    die('No API key found.\n  Set via CLI:  slop config api_key sk-slop-YOUR-KEY\n  Or env var:   export SLOPSHOP_KEY=sk-slop-...\n  Sign up:      slop signup\n  Config file:  ' + CONFIG_FILE);
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
  console.error('');
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

// (loadConfig, saveConfig, CONFIG_DIR, CONFIG_FILE, os, fs, path defined at top of file)

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

async function cmdKey(args) {
  const sub = args[0] || '';
  const cfg = loadConfig();

  if (!sub || sub === 'show') {
    // Show current key (masked)
    const key = API_KEY || cfg.api_key;
    if (key) {
      console.log(`\n  ${bold('API Key:')}  ${cyan(key.slice(0, 16) + '...' + key.slice(-4))}`);
      console.log(`  ${bold('Source:')}   ${process.env.SLOPSHOP_KEY ? 'environment variable' : 'config file'}`);
      console.log(dim(`  ${CONFIG_FILE}\n`));
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
    console.log(dim(`  Saved to ${CONFIG_FILE}\n`));
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
    if (process.stdin.isTTY && !quiet) {
      const answer = await prompt('  This will invalidate your current key. Continue? (y/N) ');
      if (answer.toLowerCase() !== 'y') { console.log(dim('\n  Cancelled.\n')); return; }
    }
    spinnerStart('Rotating key...');
    request('POST', '/v1/auth/rotate-key').then(res => {
      spinnerStop(true);
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

    const agentCount = d.agents?.length || 0;
    const models = {};
    for (const a of (d.agents || [])) { models[a.model] = (models[a.model] || 0) + 1; }
    const modelStr = Object.entries(models).map(([m, c]) => c + ' ' + m).join(', ');

    console.log(`\n  ${green('\u2713 Organization launched!')}`);
    console.log(`  ${bold('Org ID:')}  ${cyan(d.org_id)}`);
    console.log(`  ${bold('Agents:')} ${agentCount} (${modelStr})`);
    for (const a of (d.agents || [])) {
      const icon = a.model === 'claude' ? 'C' : a.model === 'gpt' ? 'G' : a.model === 'grok' ? 'X' : '?';
      console.log(`    ${dim('[')}${cyan(icon)}${dim(']')} ${a.name} ${dim('(' + a.role + ')')}`);
    }
    console.log(`  ${bold('Channels:')} ${(d.channels || []).join(', ')}`);
    console.log(`  ${bold('Hive:')}   ${d.hive_id}`);
    console.log('');
    console.log(`  ${C.bgRed}${C.white}${C.bold} ${agentCount} AGENTS RUNNING ${C.reset} ${dim('locally hosted on slopshop.gg')}`);
    console.log(`  ${dim('Models:')} ${modelStr}`);
    console.log(`\n  ${dim('Send a task:')} ${cyan('slop org task ' + d.org_id + ' "Build a REST API"')}`);
    console.log(`  ${dim('Watch live:')}  ${cyan('slop live ' + d.org_id)}\n`);

    // Track active orgs in config
    const cfg = loadConfig();
    cfg.active_orgs = cfg.active_orgs || [];
    cfg.active_orgs.push({ id: d.org_id, name: body.name || 'Org', agents: agentCount, created: new Date().toISOString() });
    if (cfg.active_orgs.length > 20) cfg.active_orgs = cfg.active_orgs.slice(-20);
    saveConfig(cfg);
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
    console.log(`  ${cyan('slop memory delete')} ${dim('<key>')}          Delete a key`);
    console.log('');
    console.log(`  ${bold('2FA Protection')}`);
    console.log(`  ${cyan('slop memory 2fa enable')} ${dim('--email x@y.com')}  Enable email 2FA`);
    console.log(`  ${cyan('slop memory 2fa disable')}              Disable 2FA`);
    console.log(`  ${cyan('slop memory 2fa status')}               Check 2FA status`);
    console.log(`  ${cyan('slop memory session')}                  Create verified session`);
    console.log('');
    return;
  }

  // 2FA subcommands
  if (sub === '2fa') {
    const action = args[1];
    if (action === 'enable') {
      const emailIdx = args.indexOf('--email');
      const email = emailIdx >= 0 ? args[emailIdx + 1] : null;
      if (!email) die('Usage: slop memory 2fa enable --email your@email.com');
      spinnerStart('Enabling memory 2FA...');
      try {
        const res = await request('POST', '/v1/memory/2fa/enable', { email });
        spinnerStop(true);
        const d = res.data || res;
        if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
        console.log(`\n  ${green('Memory 2FA enabled!')}`);
        console.log(`  ${bold('Email:')} ${d.email || email}`);
        console.log(`  All memory operations now require a verified session.`);
        console.log(`  ${dim('Create a session:')} ${cyan('slop memory session')}\n`);
      } catch(e) { spinnerStop(false); handleError(e); }
      return;
    }
    if (action === 'disable') {
      if (process.stdin.isTTY && !quiet) {
        const answer = await prompt('  Disable memory 2FA? This removes session requirements. (y/N) ');
        if (answer.toLowerCase() !== 'y') { console.log(dim('  Cancelled.\n')); return; }
      }
      try {
        const res = await request('POST', '/v1/memory/2fa/disable', {});
        if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
        console.log(green('\n  Memory 2FA disabled.\n'));
      } catch(e) { handleError(e); }
      return;
    }
    if (action === 'status') {
      try {
        const res = await request('GET', '/v1/memory/2fa/status');
        const d = res.data || res;
        if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
        console.log(`\n  ${bold('Memory 2FA:')} ${d.enabled ? green('ENABLED') : dim('disabled')}`);
        if (d.email) console.log(`  ${bold('Email:')} ${d.email}`);
        console.log('');
      } catch(e) { handleError(e); }
      return;
    }
    console.log(`\n  ${bold('Memory 2FA')}\n`);
    console.log(`  ${cyan('slop memory 2fa enable --email x@y.com')}`);
    console.log(`  ${cyan('slop memory 2fa disable')}`);
    console.log(`  ${cyan('slop memory 2fa status')}\n`);
    return;
  }

  // Session management
  if (sub === 'session') {
    spinnerStart('Creating memory session...');
    try {
      const res = await request('POST', '/v1/memory/session/create', {});
      spinnerStop(true);
      const d = res.data || res;
      if (d.session_id === 'no-2fa') {
        if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
        console.log(dim('\n  2FA not enabled. Memory ops work without a session.\n'));
        console.log(`  ${dim('Enable:')} ${cyan('slop memory 2fa enable --email your@email.com')}\n`);
        return;
      }
      if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
      console.log(`\n  ${green('Session created!')}`);
      console.log(`  ${bold('Session ID:')} ${cyan(d.session_id)}`);
      console.log(`  ${bold('Expires:')} ${d.expires_in}`);
      if (d.dev_code) {
        console.log(`  ${yellow('Dev code:')} ${bold(d.dev_code)} ${dim('(shown because no email service)')}`);
      } else {
        console.log(`  ${dim('Verification code sent to your email.')}`);
      }
      console.log(`\n  ${dim('Verify:')} ${cyan('slop memory verify --session ' + d.session_id + ' --code 123456')}`);

      // Save session to config for convenience
      const cfg = loadConfig();
      cfg.memory_session = d.session_id;
      saveConfig(cfg);
      console.log(`  ${dim('Session saved to config. Will be used automatically.')}\n`);
    } catch(e) { spinnerStop(false); handleError(e); }
    return;
  }

  if (sub === 'verify') {
    const sessIdx = args.indexOf('--session');
    const codeIdx = args.indexOf('--code');
    const cfg = loadConfig();
    const sessionId = sessIdx >= 0 ? args[sessIdx + 1] : cfg.memory_session;
    const code = codeIdx >= 0 ? args[codeIdx + 1] : args[1];
    if (!sessionId || !code) die('Usage: slop memory verify --session <id> --code <6-digit>');
    spinnerStart('Verifying...');
    try {
      const res = await request('POST', '/v1/memory/session/verify', { session_id: sessionId, code });
      spinnerStop(true);
      const d = res.data || res;
      if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
      console.log(`\n  ${green('Session verified!')} Expires: ${d.expires || 'in 1 hour'}`);
      console.log(`  ${dim('Memory operations now work with this session.')}\n`);
    } catch(e) { spinnerStop(false); handleError(e); }
    return;
  }

  if (sub === 'set') {
    const key = args[1];
    const value = args.slice(2).filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
    if (!key || !value) die('Usage: slop memory set <key> <value>');
    const res = await request('POST', '/v1/memory-set', { key, value });
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    if (quiet) { console.log(d.key || key || 'stored'); return; }
    console.log(`\n  ${green('\u2713 Stored:')} ${cyan(key)}\n`);
    return;
  }

  if (sub === 'get') {
    const key = args[1];
    if (!key) die('Usage: slop memory get <key>');
    const res = await request('POST', '/v1/memory-get', { key });
    const d = res.data || res;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    if (quiet) { const val = d.value || d.data?.value || ''; console.log(val); return; }
    console.log(`\n  ${bold(key + ':')} ${green(String(d.value !== undefined ? d.value : dim('(not found)')))}\n`);
    return;
  }

  if (sub === 'search') {
    const query = args.slice(1).filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
    if (!query) die('Usage: slop memory search <query>');
    const res = await request('POST', '/v1/memory-search', { query });
    const results = res.data?.results || res.results || [];
    if (jsonMode) { console.log(JSON.stringify(results, null, 2)); return; }
    if (quiet) { for (const r of results) console.log(r.key || r.id || ''); return; }
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
    if (quiet) { for (const k of keys) console.log(typeof k === 'string' ? k : (k.key || k.id || '')); return; }
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
    if (quiet) { console.log('deleted'); return; }
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

  spinnerStart(`Running: "${task}"...`);

  try {
    const res = await request('POST', '/v1/agent/run', { task });
    spinnerStop(true);
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

  spinnerStart(`Discovering: "${query}"...`);

  try {
    const res = await request('POST', '/v1/discover', { query }, false);
    spinnerStop(true);
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
// BATCH — Execute multiple commands from a file or inline
// ============================================================
async function cmdBatch(args) {
  requireKey();
  const file = args[0];
  let commands = [];

  if (file && fs.existsSync(file)) {
    commands = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
  } else if (args.length > 0) {
    // Inline: slop batch "hash hello" "uuid" "reverse test"
    commands = args.filter(a => !GLOBAL_FLAGS.includes(a));
  }

  if (commands.length === 0) {
    die('Usage: slop batch <file.txt> or slop batch "cmd1" "cmd2" ...');
  }

  if (!quiet && !jsonMode) console.log(`\n  ${bold('Batch:')} ${commands.length} commands\n`);

  const results = [];
  for (const cmd of commands) {
    const parts = cmd.trim().split(/\s+/);
    const slug = parts[0];
    const input = {};
    for (let i = 1; i < parts.length; i += 2) {
      const key = parts[i]?.replace(/^--/, '');
      const val = parts[i + 1];
      if (key && val) input[key] = val;
    }

    try {
      const res = await request('POST', '/v1/' + slug, input);
      results.push({ command: cmd, ok: true, data: res.data || res });
      if (!quiet && !jsonMode) console.log(`  ${green('\u2713')} ${cmd}`);
    } catch(e) {
      results.push({ command: cmd, ok: false, error: e.message });
      if (!quiet && !jsonMode) console.log(`  ${red('\u2717')} ${cmd}: ${e.message}`);
    }
  }

  if (jsonMode) console.log(JSON.stringify(results, null, 2));
  else if (!quiet) console.log(`\n  ${results.filter(r => r.ok).length}/${results.length} succeeded\n`);
}

// ============================================================
// WATCH — Repeat a command every N seconds
// ============================================================
async function cmdWatch(args) {
  requireKey();
  const intervalIdx = args.indexOf('--interval');
  const interval = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1]) || 5 : 5;
  const slug = args.filter((a, i) => a !== '--interval' && (intervalIdx < 0 || i !== intervalIdx + 1) && !GLOBAL_FLAGS.includes(a))[0];

  if (!slug) die('Usage: slop watch <api-slug> [--interval 5]');

  console.log(dim(`  Watching ${slug} every ${interval}s (Ctrl+C to stop)\n`));

  const poll = async () => {
    try {
      const res = await request('POST', '/v1/' + slug, {});
      const d = res.data || res;
      console.log(`  ${dim(new Date().toLocaleTimeString())} ${cyan(slug)} \u2192 ${JSON.stringify(d).slice(0, 100)}`);
    } catch(e) {
      console.log(`  ${dim(new Date().toLocaleTimeString())} ${red(slug)} \u2192 ${e.message}`);
    }
  };

  await poll();
  setInterval(poll, interval * 1000);
}

// ============================================================
// ALIAS — Create shorthand aliases
// ============================================================
function cmdAlias(args) {
  const cfg = loadConfig();
  cfg.aliases = cfg.aliases || {};

  if (args.length === 0) {
    console.log(`\n  ${bold('Aliases')}\n`);
    if (Object.keys(cfg.aliases).length === 0) {
      console.log(dim('  No aliases set. Use: slop alias <name> = <command>\n'));
    } else {
      for (const [name, cmd] of Object.entries(cfg.aliases)) {
        console.log(`  ${cyan(name)} \u2192 ${dim(cmd)}`);
      }
      console.log('');
    }
    return;
  }

  const eqIdx = args.indexOf('=');
  if (eqIdx > 0) {
    const name = args.slice(0, eqIdx).join(' ');
    const command = args.slice(eqIdx + 1).join(' ');
    cfg.aliases[name] = command;
    saveConfig(cfg);
    console.log(green(`\n  Alias set: ${cyan(name)} \u2192 ${command}\n`));
  } else if (args[0] === 'remove' || args[0] === 'delete') {
    const name = args[1];
    delete cfg.aliases[name];
    saveConfig(cfg);
    console.log(green(`\n  Alias removed: ${name}\n`));
  } else {
    // Show specific alias
    const alias = cfg.aliases[args[0]];
    if (alias) console.log(`\n  ${cyan(args[0])} \u2192 ${alias}\n`);
    else console.log(dim(`\n  No alias: ${args[0]}\n`));
  }
}

// ============================================================
// HISTORY — Show recent commands/calls
// ============================================================
function cmdHistory(args) {
  const cfg = loadConfig();
  const history = cfg.history || [];

  if (args[0] === 'clear') {
    cfg.history = [];
    saveConfig(cfg);
    console.log(green('\n  History cleared.\n'));
    return;
  }

  if (history.length === 0) {
    console.log(dim('\n  No history yet.\n'));
    return;
  }

  const n = parseInt(args[0]) || 20;
  console.log(`\n  ${bold('Recent commands')} (last ${Math.min(n, history.length)})\n`);
  for (const h of history.slice(-n)) {
    console.log(`  ${dim(h.time)} ${cyan(h.command)} ${dim(h.credits ? h.credits + 'cr' : '')}`);
  }
  console.log('');
}

// ============================================================
// UPGRADE — Check for CLI updates
// ============================================================
async function cmdUpgrade() {
  try {
    const pkg = require('./package.json');
    console.log(dim(`\n  Current: v${pkg.version}`));
    console.log(`  Run: ${cyan('npm install -g slopshop@latest')} to upgrade.\n`);
  } catch(e) { console.log(dim('\n  Could not check version.\n')); }
}

// ============================================================
// COMPLETIONS — Generate shell completions
// ============================================================
function cmdCompletions(args) {
  const shell = args[0] || 'bash';

  const commands = ['call','pipe','run','search','list','discover','org','chain','memory','mem','signup','login','whoami','key','config','balance','buy','stats','health','mcp','help','batch','watch','alias','history','plan','models','profile','cost','debug','cloud','logs','dev','env','listen','types','file','git','review','session','version','upgrade','completions','do','init','live','interactive','tui'];

  if (shell === 'bash') {
    console.log(`# Add to ~/.bashrc:`);
    console.log(`_slop_completions() {`);
    console.log(`  local cur="\${COMP_WORDS[COMP_CWORD]}"`);
    console.log(`  COMPREPLY=( $(compgen -W "${commands.join(' ')}" -- "$cur") )`);
    console.log(`}`);
    console.log(`complete -F _slop_completions slop`);
  } else if (shell === 'zsh') {
    console.log(`# Add to ~/.zshrc:`);
    console.log(`_slop() { _arguments '1:command:(${commands.join(' ')})' }`);
    console.log(`compdef _slop slop`);
  } else if (shell === 'fish') {
    console.log(`# Add to ~/.config/fish/completions/slop.fish:`);
    for (const cmd of commands) {
      console.log(`complete -c slop -n "__fish_use_subcommand" -a "${cmd}"`);
    }
  } else {
    console.log(`\n  ${bold('Shell Completions')}\n`);
    console.log(`  ${cyan('slop completions bash')}   Generate bash completions`);
    console.log(`  ${cyan('slop completions zsh')}    Generate zsh completions`);
    console.log(`  ${cyan('slop completions fish')}   Generate fish completions\n`);
  }
}

// ============================================================
// PLAN — Plan before executing
// ============================================================
async function cmdPlan(args) {
  requireKey();
  const sub = args[0];

  if (sub === '--execute' || sub === '--run') {
    // Execute last saved plan
    const cfg = loadConfig();
    if (!cfg.last_plan || !cfg.last_plan.steps) {
      die('No plan saved. Run: slop plan "your task"');
    }
    if (!quiet && !jsonMode) console.log(`\n  ${bold('Executing plan:')} ${cfg.last_plan.task}\n`);
    for (let i = 0; i < cfg.last_plan.steps.length; i++) {
      const step = cfg.last_plan.steps[i];
      if (!quiet && !jsonMode) console.log(`  ${dim(String(i + 1) + '.')} ${cyan(step.action || step.tool || step)}`);
      if (step.slug) {
        try {
          spinnerStart(`Step ${i + 1}: ${step.slug}...`);
          const res = await request('POST', '/v1/' + step.slug, step.input || {});
          spinnerStop(true);
          if (!quiet && !jsonMode) console.log(`     ${green('✓')} ${JSON.stringify(res.data).slice(0, 100)}`);
        } catch(e) {
          spinnerStop(false);
          console.log(`     ${red('✗')} ${e.message}`);
        }
      }
    }
    console.log('');
    return;
  }

  if (sub === '--show') {
    const cfg = loadConfig();
    if (!cfg.last_plan) { console.log(dim('\n  No plan saved.\n')); return; }
    if (jsonMode) { console.log(JSON.stringify(cfg.last_plan, null, 2)); return; }
    console.log(`\n  ${bold('Last Plan:')} ${cfg.last_plan.task}\n`);
    for (let i = 0; i < (cfg.last_plan.steps || []).length; i++) {
      const s = cfg.last_plan.steps[i];
      console.log(`  ${dim(String(i + 1) + '.')} ${cyan(s.action || s.tool || s.slug || String(s))}`);
      if (s.description) console.log(`     ${dim(s.description)}`);
    }
    console.log(`\n  ${dim('Run with:')} ${cyan('slop plan --execute')}\n`);
    return;
  }

  const task = args.filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
  if (!task) die('Usage: slop plan "describe your task"\n  Options: --execute (run last plan), --show (view last plan)');

  spinnerStart(`Planning: "${task}"...`);

  try {
    const res = await request('POST', '/v1/agent/run', { task, plan_only: true });
    spinnerStop(true);
    const d = res.data || res;

    // Save plan to config
    const cfg = loadConfig();
    cfg.last_plan = { task, steps: d.steps || d.plan || [{ action: task }], created: new Date().toISOString() };
    saveConfig(cfg);

    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }

    console.log(`\n  ${bold('Plan for:')} "${task}"\n`);
    const steps = d.steps || d.plan || [];
    if (steps.length === 0) {
      console.log(`  ${dim('1.')} ${cyan('agent/run')} — Execute task directly`);
    } else {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const cost = s.credits ? ` ${dim('(' + s.credits + 'cr)')}` : '';
        console.log(`  ${dim(String(i + 1) + '.')} ${cyan(s.action || s.tool || s.slug || String(s))}${cost}`);
        if (s.description) console.log(`     ${dim(s.description)}`);
      }
    }
    const totalCost = steps.reduce((sum, s) => sum + (s.credits || 0), 0);
    if (totalCost) console.log(`\n  ${bold('Estimated cost:')} ${yellow(totalCost + ' credits')}`);
    console.log(`\n  ${dim('Execute with:')} ${cyan('slop plan --execute')}\n`);
  } catch (err) {
    spinnerStop(false);
    handleError(err);
  }
}

// ============================================================
// MODELS — List and set AI model
// ============================================================
async function cmdModels(args) {
  const sub = args[0];

  if (sub === 'set') {
    const model = args[1];
    if (!model) die('Usage: slop models set <model-id>');
    const cfg = loadConfig();
    cfg.default_model = model;
    saveConfig(cfg);
    console.log(green(`\n  Default model set to: ${cyan(model)}\n`));
    return;
  }

  if (jsonMode) {
    console.log(JSON.stringify({
      default: loadConfig().default_model || 'claude-opus-4-6',
      available: [
        { id: 'claude-opus-4-6', provider: 'anthropic', context: '1M', cost: '1x' },
        { id: 'claude-sonnet-4-6', provider: 'anthropic', context: '200K', cost: '0.2x' },
        { id: 'claude-haiku-4-5', provider: 'anthropic', context: '200K', cost: '0.04x' },
        { id: 'gpt-5.4', provider: 'openai', context: '128K', cost: '1.2x', note: 'requires multi-llm tier' },
        { id: 'grok-3', provider: 'xai', context: '128K', cost: '0.8x', note: 'requires multi-llm tier' },
      ]
    }, null, 2));
    return;
  }

  const cfg = loadConfig();
  const current = cfg.default_model || 'claude-opus-4-6';

  console.log(`\n  ${bold('Available Models')}\n`);
  console.log(`  ${bold('Current:')} ${cyan(current)}\n`);

  const models = [
    { id: 'claude-opus-4-6',   provider: 'Anthropic', ctx: '1M',   cost: '1x',    note: '' },
    { id: 'claude-sonnet-4-6', provider: 'Anthropic', ctx: '200K', cost: '0.2x',  note: '' },
    { id: 'claude-haiku-4-5',  provider: 'Anthropic', ctx: '200K', cost: '0.04x', note: '' },
    { id: 'gpt-5.4',           provider: 'OpenAI',    ctx: '128K', cost: '1.2x',  note: 'multi-llm tier' },
    { id: 'grok-3',            provider: 'xAI',       ctx: '128K', cost: '0.8x',  note: 'multi-llm tier' },
  ];

  for (const m of models) {
    const active = m.id === current ? green(' ●') : '  ';
    const note = m.note ? dim(` (${m.note})`) : '';
    console.log(`  ${active} ${cyan(m.id.padEnd(22))} ${dim(m.provider.padEnd(10))} ${dim(m.ctx.padEnd(5))} ${yellow(m.cost.padEnd(6))}${note}`);
  }
  console.log(`\n  ${dim('Set default:')} ${cyan('slop models set <model-id>')}`);
  console.log(`  ${dim('Per-call:')}    ${cyan('slop call <slug> --model <model-id>')}\n`);
}

// ============================================================
// PROFILE — Multi-profile support
// ============================================================
function cmdProfile(args) {
  const sub = args[0] || 'list';
  const cfg = loadConfig();
  cfg.profiles = cfg.profiles || {};

  if (sub === 'list') {
    const active = cfg.active_profile || 'default';
    console.log(`\n  ${bold('Profiles')}\n`);
    console.log(`  ${active === 'default' ? green('●') : dim('○')} ${cyan('default')} ${dim(cfg.email || 'no email')} ${dim(cfg.base_url || BASE_URL)}`);
    for (const [name, profile] of Object.entries(cfg.profiles)) {
      const isActive = name === active;
      console.log(`  ${isActive ? green('●') : dim('○')} ${cyan(name)} ${dim(profile.email || 'no email')} ${dim(profile.base_url || BASE_URL)}`);
    }
    console.log(`\n  ${dim('Commands:')} add, switch, remove\n`);
    return;
  }

  if (sub === 'add' || sub === 'create') {
    const name = args[1];
    if (!name) die('Usage: slop profile add <name>');
    const keyIdx = args.indexOf('--key');
    const urlIdx = args.indexOf('--url');
    const emailIdx = args.indexOf('--email');
    cfg.profiles[name] = {
      api_key: keyIdx >= 0 ? args[keyIdx + 1] : '',
      base_url: urlIdx >= 0 ? args[urlIdx + 1] : BASE_URL,
      email: emailIdx >= 0 ? args[emailIdx + 1] : '',
    };
    saveConfig(cfg);
    console.log(green(`\n  Profile "${name}" created.`));
    console.log(`  ${dim('Switch to it:')} ${cyan('slop profile switch ' + name)}\n`);
    return;
  }

  if (sub === 'switch' || sub === 'use') {
    const name = args[1];
    if (!name) die('Usage: slop profile switch <name>');
    if (name !== 'default' && !cfg.profiles[name]) die(`Profile "${name}" not found. Run: slop profile list`);
    cfg.active_profile = name;
    if (name !== 'default' && cfg.profiles[name]) {
      // Swap active keys
      if (cfg.profiles[name].api_key) cfg.api_key = cfg.profiles[name].api_key;
      if (cfg.profiles[name].base_url) cfg.base_url = cfg.profiles[name].base_url;
      if (cfg.profiles[name].email) cfg.email = cfg.profiles[name].email;
    }
    saveConfig(cfg);
    console.log(green(`\n  Switched to profile: ${cyan(name)}\n`));
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    const name = args[1];
    if (!name) die('Usage: slop profile remove <name>');
    delete cfg.profiles[name];
    if (cfg.active_profile === name) cfg.active_profile = 'default';
    saveConfig(cfg);
    console.log(green(`\n  Profile "${name}" removed.\n`));
    return;
  }

  console.log(`\n  ${bold('Profile Management')}\n`);
  console.log(`  ${cyan('slop profile list')}                     Show all profiles`);
  console.log(`  ${cyan('slop profile add')} ${dim('<name> [--key K --url U --email E]')}`);
  console.log(`  ${cyan('slop profile switch')} ${dim('<name>')}          Switch active profile`);
  console.log(`  ${cyan('slop profile remove')} ${dim('<name>')}          Delete a profile\n`);
}

// ============================================================
// COST — Estimate cost of an API call or pipe
// ============================================================
async function cmdCost(args) {
  const filteredArgs = args.filter(a => !GLOBAL_FLAGS.includes(a));
  if (filteredArgs.length === 0) {
    die('Usage: slop cost <slug> or slop cost <slug1> <slug2> (for pipe cost)');
  }

  spinnerStart('Estimating cost...');
  let totalCredits = 0;
  const breakdown = [];

  for (const slug of filteredArgs) {
    try {
      const res = await request('POST', '/v1/dry-run/' + slug, {}, false);
      const d = res.data;
      const credits = d.credits || 0;
      totalCredits += credits;
      breakdown.push({ slug, credits, tier: d.tier || 'any' });
    } catch(e) {
      breakdown.push({ slug, credits: '?', error: e.message });
    }
  }

  spinnerStop(true);

  if (jsonMode) { console.log(JSON.stringify({ breakdown, total: totalCredits }, null, 2)); return; }

  console.log(`\n  ${bold('Cost Estimate')}\n`);
  for (const b of breakdown) {
    if (b.error) {
      console.log(`  ${red('✗')} ${cyan(b.slug)} — ${dim(b.error)}`);
    } else {
      console.log(`  ${green('✓')} ${cyan(b.slug.padEnd(35))} ${yellow(b.credits + ' credits')} ${dim('tier: ' + b.tier)}`);
    }
  }
  if (filteredArgs.length > 1) {
    console.log(`  ${dim('─'.repeat(50))}`);
    console.log(`  ${bold('Total:')} ${yellow(totalCredits + ' credits')}`);
  }
  console.log('');
}

// ============================================================
// DEBUG — Explain and fix errors
// ============================================================
async function cmdDebug(args) {
  requireKey();

  // Check for --last flag
  if (args.includes('--last')) {
    die('--last requires shell integration. Pipe errors directly:\n  command 2>&1 | slop debug');
  }

  let errorText = args.filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');

  // Accept piped stdin
  const stdinData = await readStdin();
  if (stdinData) errorText = stdinData;

  if (!errorText) die('Usage: slop debug "error message"\n  Or: command 2>&1 | slop debug');

  spinnerStart('Analyzing error...');

  try {
    const res = await request('POST', '/v1/llm-analyze-text', { text: `Debug this error and explain the fix:\n\n${errorText}`, task: 'debug' });
    spinnerStop(true);
    const d = res.data || res;

    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }

    console.log(`\n  ${bold('Error Analysis')}`);
    console.log(`  ${dim('─'.repeat(42))}`);
    const analysis = d.result || d.analysis || d.response || d.output || JSON.stringify(d);
    console.log(`\n  ${analysis}\n`);
    if (d.credits_used) console.log(dim(`  [${d.credits_used}cr used]\n`));
  } catch (err) {
    spinnerStop(false);
    handleError(err);
  }
}

// ============================================================
// CLOUD — Cloud task handoff
// ============================================================
async function cmdCloud(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Cloud Tasks')}\n`);
    console.log(`  ${cyan('slop cloud run')} ${dim('"task description"')}   Send task to cloud`);
    console.log(`  ${cyan('slop cloud status')} ${dim('<task-id>')}          Check task progress`);
    console.log(`  ${cyan('slop cloud list')}                        List cloud tasks\n`);
    return;
  }

  if (sub === 'run') {
    const task = args.slice(1).filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
    if (!task) die('Usage: slop cloud run "your task description"');

    spinnerStart('Submitting task to cloud...');
    try {
      const res = await request('POST', '/v1/prompt-queue/add', { prompt: task, priority: 'normal' });
      spinnerStop(true);
      const d = res.data || res;

      if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }

      console.log(`\n  ${green('✓ Task submitted to cloud!')}`);
      console.log(`  ${bold('Task ID:')}  ${cyan(d.id || d.queue_id || 'queued')}`);
      console.log(`  ${bold('Status:')}   ${dim(d.status || 'pending')}`);
      console.log(`\n  ${dim('Check progress:')} ${cyan('slop cloud status ' + (d.id || d.queue_id || '<task-id>'))}\n`);
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  if (sub === 'status') {
    const taskId = args[1];
    if (!taskId) die('Usage: slop cloud status <task-id>');

    spinnerStart('Checking task...');
    try {
      const res = await request('GET', '/v1/prompt-queue/status/' + taskId);
      spinnerStop(true);
      const d = res.data || res;

      if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }

      const statusColor = d.status === 'complete' ? green : d.status === 'running' ? yellow : dim;
      console.log(`\n  ${bold('Task:')} ${taskId}`);
      console.log(`  ${bold('Status:')} ${statusColor(d.status || 'unknown')}`);
      if (d.result) console.log(`  ${bold('Result:')} ${green(String(d.result).slice(0, 200))}`);
      if (d.progress) console.log(`  ${bold('Progress:')} ${yellow(d.progress)}`);
      console.log('');
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  if (sub === 'list') {
    spinnerStart('Loading tasks...');
    try {
      const res = await request('GET', '/v1/prompt-queue/list');
      spinnerStop(true);
      const items = res.data?.items || res.data?.queue || res.items || [];

      if (jsonMode) { console.log(JSON.stringify(items, null, 2)); return; }

      console.log(`\n  ${bold('Cloud Tasks')}\n`);
      if (items.length === 0) { console.log(dim('  No tasks found.\n')); return; }
      for (const item of items) {
        const statusColor = item.status === 'complete' ? green : item.status === 'running' ? yellow : dim;
        console.log(`  ${cyan(String(item.id || '').padEnd(10))} ${statusColor((item.status || 'pending').padEnd(10))} ${dim(String(item.prompt || item.task || '').slice(0, 60))}`);
      }
      console.log('');
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  die('Unknown cloud command: ' + sub + '. Run slop cloud help');
}

// ============================================================
// LOGS — Stream platform logs
// ============================================================
async function cmdLogs(args) {
  requireKey();

  const filterIdx = args.indexOf('--filter');
  const sinceIdx = args.indexOf('--since');
  const filter = filterIdx >= 0 ? args[filterIdx + 1] : null;
  const since = sinceIdx >= 0 ? args[sinceIdx + 1] : '1h';
  const follow = args.includes('--follow') || args.includes('-f');

  spinnerStart('Loading logs...');

  try {
    const res = await request('GET', `/v1/usage/today`);
    spinnerStop(true);
    const d = res.data || res;

    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }

    console.log(`\n  ${bold('Platform Logs')} ${dim('(last ' + since + ')')}\n`);

    // Display usage as log entries
    const entries = d.recent || d.calls || d.entries || [];
    if (entries.length === 0 && typeof d === 'object') {
      // Fallback: display available stats as log entries
      for (const [k, v] of Object.entries(d)) {
        if (k.startsWith('_')) continue;
        const line = `${dim(new Date().toISOString().slice(11, 19))} ${cyan(k)} ${dim('→')} ${green(String(v))}`;
        if (!filter || line.toLowerCase().includes(filter.toLowerCase())) {
          console.log(`  ${line}`);
        }
      }
    } else {
      for (const entry of entries) {
        const time = dim(entry.time || entry.timestamp || '');
        const slug = cyan(entry.slug || entry.endpoint || entry.action || '');
        const status = entry.error ? red('ERR') : green('OK');
        const line = `  ${time} ${status} ${slug} ${dim(String(entry.credits || '') + 'cr')}`;
        if (!filter || line.toLowerCase().includes(filter.toLowerCase())) {
          console.log(line);
        }
      }
    }

    if (follow) {
      console.log(dim('\n  Tailing logs (Ctrl+C to stop)...\n'));
      setInterval(async () => {
        try {
          const r = await request('GET', '/v1/usage/today');
          const d2 = r.data || r;
          // Show delta
          console.log(`  ${dim(new Date().toISOString().slice(11, 19))} ${dim('calls:')} ${yellow(String(d2.calls || d2.requests || 0))} ${dim('credits:')} ${yellow(String(d2.credits_used || 0))}`);
        } catch(e) { /* ignore */ }
      }, 5000);
    } else {
      console.log('');
    }
  } catch (err) {
    spinnerStop(false);
    handleError(err);
  }
}

// ============================================================
// DEV — Local development server
// ============================================================
async function cmdDev(args) {
  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? args[portIdx + 1] : '3000';

  console.log(`\n  ${bold('Starting local dev server...')}\n`);

  const { execSync, spawn } = require('child_process');
  const serverPath = path.join(__dirname, 'server-v2.js');

  if (!fs.existsSync(serverPath)) {
    die('server-v2.js not found. Run from the slopshop project directory.');
  }

  console.log(`  ${dim('Server:')} ${serverPath}`);
  console.log(`  ${dim('Port:')}   ${port}`);
  console.log(`  ${dim('URL:')}    ${cyan('http://localhost:' + port)}\n`);
  console.log(dim('  Press Ctrl+C to stop.\n'));

  const child = spawn('node', [serverPath], {
    env: { ...process.env, PORT: port },
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    console.error(red('\n  Failed to start server: ') + err.message);
  });

  child.on('exit', (code) => {
    console.log(dim(`\n  Server exited (code ${code})\n`));
  });

  // Keep alive
  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
  });
}

// ============================================================
// ENV — Environment variable management (memory-backed)
// ============================================================
async function cmdEnv(args) {
  requireKey();
  const sub = args[0] || 'list';

  if (sub === 'list') {
    spinnerStart('Loading env vars...');
    try {
      const res = await request('POST', '/v1/memory-list', { prefix: 'env:' });
      spinnerStop(true);
      const keys = res.data?.keys || res.data?.entries || [];
      if (jsonMode) { console.log(JSON.stringify(keys, null, 2)); return; }
      console.log(`\n  ${bold('Environment Variables')}\n`);
      if (keys.length === 0) { console.log(dim('  No env vars set. Use: slop env set KEY=value\n')); return; }
      for (const k of keys) {
        const key = typeof k === 'string' ? k : (k.key || '');
        const val = typeof k === 'string' ? '' : (k.value || '');
        console.log(`  ${cyan(key.replace(/^env:/, ''))} = ${green(val)}`);
      }
      console.log('');
    } catch(err) { spinnerStop(false); handleError(err); }
    return;
  }

  if (sub === 'set') {
    const pair = args.slice(1).join(' ');
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) die('Usage: slop env set KEY=value');
    const key = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    await request('POST', '/v1/memory-set', { key: 'env:' + key, value });
    if (jsonMode) { console.log(JSON.stringify({ ok: true, key, value })); return; }
    console.log(green(`\n  Set env:${key}\n`));
    return;
  }

  if (sub === 'get') {
    const key = args[1];
    if (!key) die('Usage: slop env get KEY');
    try {
      const res = await request('POST', '/v1/memory-get', { key: 'env:' + key });
      const d = res.data || res;
      if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
      console.log(d.value !== undefined ? d.value : dim('(not set)'));
    } catch(e) { console.log(dim('(not set)')); }
    return;
  }

  if (sub === 'delete' || sub === 'rm') {
    const key = args[1];
    if (!key) die('Usage: slop env delete KEY');
    await request('POST', '/v1/memory-delete', { key: 'env:' + key });
    if (!quiet) console.log(green(`\n  Deleted env:${key}\n`));
    return;
  }

  console.log(`\n  ${bold('Environment Variables')}\n`);
  console.log(`  ${cyan('slop env list')}              List all env vars`);
  console.log(`  ${cyan('slop env set KEY=value')}     Set an env var`);
  console.log(`  ${cyan('slop env get KEY')}           Get an env var`);
  console.log(`  ${cyan('slop env delete KEY')}        Delete an env var\n`);
}

// ============================================================
// LISTEN — Webhook listener
// ============================================================
async function cmdListen(args) {
  requireKey();

  const forwardIdx = args.indexOf('--forward-to');
  const forwardUrl = forwardIdx >= 0 ? args[forwardIdx + 1] : null;
  const eventsIdx = args.indexOf('--events');
  const events = eventsIdx >= 0 ? args[eventsIdx + 1].split(',') : [];

  console.log(`\n  ${bold('Webhook Listener')}`);
  console.log(`  ${dim('─'.repeat(42))}`);
  if (forwardUrl) console.log(`  ${bold('Forwarding to:')} ${cyan(forwardUrl)}`);
  if (events.length > 0) console.log(`  ${bold('Events:')} ${events.map(e => cyan(e)).join(', ')}`);
  console.log(dim('  Listening for events (Ctrl+C to stop)...\n'));

  // Poll for new events
  let lastCheck = Date.now();
  const poll = async () => {
    try {
      const res = await request('GET', '/v1/usage/today');
      const d = res.data || res;
      const timestamp = new Date().toISOString().slice(11, 19);
      console.log(`  ${dim(timestamp)} ${cyan('heartbeat')} ${dim('calls=' + (d.calls || d.requests || 0) + ' credits=' + (d.credits_used || 0))}`);

      if (forwardUrl) {
        // Forward event to local endpoint
        try {
          await request('POST', forwardUrl.replace(BASE_URL, ''), { type: 'heartbeat', data: d }, false);
        } catch(e) { /* forward failed, log only */ }
      }
    } catch(e) { /* ignore */ }
  };

  await poll();
  setInterval(poll, 10000);
}

// ============================================================
// TYPES — Generate TypeScript/Go/Python types from OpenAPI
// ============================================================
async function cmdTypes(args) {
  const lang = args.find(a => ['typescript', 'ts', 'go', 'python', 'py', 'rust'].includes(a)) || 'typescript';
  const slug = args.find(a => !['typescript', 'ts', 'go', 'python', 'py', 'rust', '--output'].includes(a) && !GLOBAL_FLAGS.includes(a));
  const outputIdx = args.indexOf('--output');
  const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : null;

  spinnerStart('Generating types...');

  try {
    const res = await request('GET', '/v1/openapi.json', null, false);
    spinnerStop(true);
    const spec = res.data;
    const paths = spec.paths || {};

    let output = '';

    if (lang === 'typescript' || lang === 'ts') {
      output += '// Auto-generated Slopshop API types\n';
      output += '// Generated: ' + new Date().toISOString() + '\n\n';
      output += 'export interface SlopResponse<T = any> {\n  data: T;\n  meta: { credits_used: number; latency_ms: number; credits_remaining: number; };\n}\n\n';

      let count = 0;
      for (const [path, methods] of Object.entries(paths)) {
        if (slug && !path.includes(slug)) continue;
        const name = path.replace('/v1/', '').replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        const pascalName = name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
        output += `export interface ${pascalName}Input { [key: string]: any; }\n`;
        output += `export interface ${pascalName}Output { [key: string]: any; }\n\n`;
        count++;
        if (count > 50 && !slug) { output += '// ... and more. Use slop types <slug> for specific API.\n'; break; }
      }
    } else if (lang === 'python' || lang === 'py') {
      output += '# Auto-generated Slopshop API types\n';
      output += 'from typing import Any, Dict, Optional\nfrom dataclasses import dataclass\n\n';
      output += '@dataclass\nclass SlopResponse:\n    data: Any\n    meta: Dict[str, Any]\n\n';
    } else if (lang === 'go') {
      output += '// Auto-generated Slopshop API types\npackage slopshop\n\n';
      output += 'type SlopResponse struct {\n\tData interface{} `json:"data"`\n\tMeta SlopMeta    `json:"meta"`\n}\n\n';
      output += 'type SlopMeta struct {\n\tCreditsUsed      int `json:"credits_used"`\n\tLatencyMs        int `json:"latency_ms"`\n\tCreditsRemaining int `json:"credits_remaining"`\n}\n';
    }

    if (outputFile) {
      fs.writeFileSync(outputFile, output);
      console.log(green(`\n  Types written to ${outputFile}\n`));
    } else {
      console.log(output);
    }
  } catch(err) {
    spinnerStop(false);
    handleError(err);
  }
}

// ============================================================
// FILE — Local file read/write (5 competitors have this)
// ============================================================
async function cmdFile(args) {
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('File Operations')}\n`);
    console.log(`  ${cyan('slop file read')} ${dim('<path>')}              Read a file`);
    console.log(`  ${cyan('slop file write')} ${dim('<path> --content "..."')} Write to a file`);
    console.log(`  ${cyan('slop file edit')} ${dim('<path> --find X --replace Y')} Find & replace`);
    console.log(`  ${cyan('slop file list')} ${dim('[dir]')}               List directory contents`);
    console.log(`  ${cyan('slop file info')} ${dim('<path>')}              File metadata\n`);
    return;
  }

  if (sub === 'read' || sub === 'cat') {
    const filePath = args[1];
    if (!filePath) die('Usage: slop file read <path>');
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (jsonMode) { console.log(JSON.stringify({ path: filePath, content, size: content.length, lines: content.split('\n').length })); return; }
      if (quiet) { console.log(content); return; }
      const lines = content.split('\n');
      console.log(`\n  ${bold(filePath)} ${dim('(' + lines.length + ' lines, ' + content.length + ' bytes)')}\n`);
      for (let i = 0; i < lines.length; i++) {
        console.log(`  ${dim(String(i + 1).padStart(4))} ${lines[i]}`);
      }
      console.log('');
    } catch(e) { die('Cannot read file: ' + e.message); }
    return;
  }

  if (sub === 'write') {
    const filePath = args[1];
    const contentIdx = args.indexOf('--content');
    const content = contentIdx >= 0 ? args.slice(contentIdx + 1).join(' ') : null;
    if (!filePath || content === null) die('Usage: slop file write <path> --content "text"');
    try {
      fs.writeFileSync(filePath, content);
      if (jsonMode) { console.log(JSON.stringify({ ok: true, path: filePath, bytes: content.length })); return; }
      console.log(green(`\n  Written ${content.length} bytes to ${filePath}\n`));
    } catch(e) { die('Cannot write file: ' + e.message); }
    return;
  }

  if (sub === 'edit') {
    const filePath = args[1];
    const findIdx = args.indexOf('--find');
    const replaceIdx = args.indexOf('--replace');
    if (!filePath || findIdx < 0 || replaceIdx < 0) die('Usage: slop file edit <path> --find "old" --replace "new"');
    const findStr = args.slice(findIdx + 1, replaceIdx).join(' ');
    const replaceStr = args.slice(replaceIdx + 1).join(' ');
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      const count = (content.match(new RegExp(findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      content = content.split(findStr).join(replaceStr);
      fs.writeFileSync(filePath, content);
      if (jsonMode) { console.log(JSON.stringify({ ok: true, path: filePath, replacements: count })); return; }
      console.log(green(`\n  Replaced ${count} occurrence(s) in ${filePath}\n`));
    } catch(e) { die('Cannot edit file: ' + e.message); }
    return;
  }

  if (sub === 'list' || sub === 'ls') {
    const dir = args[1] || '.';
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      if (jsonMode) { console.log(JSON.stringify(entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })))); return; }
      if (quiet) { entries.forEach(e => console.log(e.name)); return; }
      console.log(`\n  ${bold(path.resolve(dir))}\n`);
      for (const entry of entries) {
        const icon = entry.isDirectory() ? cyan('d') : dim('f');
        console.log(`  ${icon} ${entry.isDirectory() ? bold(entry.name + '/') : entry.name}`);
      }
      console.log(dim(`\n  ${entries.length} entries\n`));
    } catch(e) { die('Cannot list: ' + e.message); }
    return;
  }

  if (sub === 'info' || sub === 'stat') {
    const filePath = args[1];
    if (!filePath) die('Usage: slop file info <path>');
    try {
      const stat = fs.statSync(filePath);
      const info = { path: filePath, size: stat.size, modified: stat.mtime.toISOString(), created: stat.birthtime.toISOString(), isDirectory: stat.isDirectory() };
      if (jsonMode) { console.log(JSON.stringify(info)); return; }
      console.log(`\n  ${bold(filePath)}`);
      console.log(`  Size:     ${yellow(stat.size + ' bytes')}`);
      console.log(`  Modified: ${dim(stat.mtime.toISOString())}`);
      console.log(`  Created:  ${dim(stat.birthtime.toISOString())}`);
      console.log(`  Type:     ${stat.isDirectory() ? 'directory' : 'file'}\n`);
    } catch(e) { die('Cannot stat: ' + e.message); }
    return;
  }

  die('Unknown file command: ' + sub + '. Run slop file help');
}

// ============================================================
// GIT — Git integration (4 competitors have this)
// ============================================================
async function cmdGit(args) {
  const { execSync } = require('child_process');
  const sub = args[0];

  const git = (cmd) => {
    try { return execSync('git ' + cmd, { encoding: 'utf8', timeout: 10000 }).trim(); }
    catch(e) { throw new Error(e.stderr?.trim() || e.message); }
  };

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Git Integration')}\n`);
    console.log(`  ${cyan('slop git status')}                    Working tree status`);
    console.log(`  ${cyan('slop git diff')} ${dim('[--staged]')}          Show changes`);
    console.log(`  ${cyan('slop git log')} ${dim('[--limit N]')}          Recent commits`);
    console.log(`  ${cyan('slop git commit')} ${dim('"message"')}         Commit staged changes`);
    console.log(`  ${cyan('slop git push')}                      Push to remote`);
    console.log(`  ${cyan('slop git branch')}                    List branches`);
    console.log(`  ${cyan('slop git stash')} ${dim('[pop]')}              Stash/unstash changes\n`);
    return;
  }

  try {
    if (sub === 'status' || sub === 'st') {
      const branch = git('branch --show-current');
      const status = git('status --short');
      if (jsonMode) {
        const lines = status.split('\n').filter(l => l.trim());
        const parsed = lines.map(l => ({ status: l.slice(0, 2).trim(), file: l.slice(3) }));
        console.log(JSON.stringify({ branch, files: parsed, clean: lines.length === 0 }));
        return;
      }
      console.log(`\n  ${bold('Branch:')} ${cyan(branch)}`);
      if (!status) { console.log(green('  Working tree clean.\n')); return; }
      console.log('');
      for (const line of status.split('\n')) {
        if (!line.trim()) continue;
        const st = line.slice(0, 2);
        const file = line.slice(3);
        const color = st.includes('M') ? yellow : st.includes('?') ? dim : st.includes('A') ? green : st.includes('D') ? red : dim;
        console.log(`  ${color(st)} ${file}`);
      }
      console.log('');
      return;
    }

    if (sub === 'diff') {
      const staged = args.includes('--staged') || args.includes('--cached');
      const diff = git('diff' + (staged ? ' --staged' : '') + ' --stat');
      const fullDiff = git('diff' + (staged ? ' --staged' : ''));
      if (jsonMode) { console.log(JSON.stringify({ staged, stat: diff, diff: fullDiff.slice(0, 5000) })); return; }
      if (!diff) { console.log(dim('\n  No changes.\n')); return; }
      console.log(`\n  ${bold(staged ? 'Staged changes:' : 'Unstaged changes:')}\n`);
      for (const line of diff.split('\n')) {
        if (line.includes('|')) {
          const [file, rest] = line.split('|');
          console.log(`  ${cyan(file.trim().padEnd(40))} ${rest.replace(/\+/g, green('+')).replace(/-/g, red('-'))}`);
        } else {
          console.log(`  ${dim(line)}`);
        }
      }
      console.log('');
      return;
    }

    if (sub === 'log') {
      const limitIdx = args.indexOf('--limit');
      const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) || 10 : 10;
      const log = git(`log --oneline -${limit} --format="%h %s (%ar)"`);
      if (jsonMode) {
        const entries = log.split('\n').filter(l => l).map(l => {
          const [hash, ...rest] = l.split(' ');
          return { hash, message: rest.join(' ') };
        });
        console.log(JSON.stringify(entries));
        return;
      }
      console.log(`\n  ${bold('Recent Commits')}\n`);
      for (const line of log.split('\n')) {
        if (!line.trim()) continue;
        const hash = line.slice(0, 7);
        const rest = line.slice(8);
        console.log(`  ${yellow(hash)} ${rest}`);
      }
      console.log('');
      return;
    }

    if (sub === 'commit') {
      const msg = args.slice(1).filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
      if (!msg) die('Usage: slop git commit "your commit message"');
      // Check if anything is staged; don't silently git add -A
      const staged = git('diff --cached --name-only');
      if (!staged.trim()) {
        const unstaged = git('status --short');
        if (!unstaged.trim()) die('Nothing to commit. Working tree clean.');
        if (!quiet && !jsonMode) {
          console.log(yellow('\n  Nothing staged. Unstaged changes:'));
          for (const line of unstaged.split('\n').slice(0, 10)) {
            if (line.trim()) console.log('  ' + line);
          }
        }
        if (process.stdin.isTTY && !args.includes('--all') && !args.includes('-a')) {
          const answer = await prompt('\n  Stage all and commit? (y/N) ');
          if (answer.toLowerCase() !== 'y') { console.log(dim('  Cancelled.\n')); return; }
        }
        git('add -A');
      }
      const result = git(`commit -m "${msg.replace(/"/g, '\\"')}"`);
      if (jsonMode) { console.log(JSON.stringify({ ok: true, message: msg, output: result })); return; }
      console.log(`\n  ${green('Committed:')} ${msg}`);
      console.log(dim('  ' + result.split('\n')[0]) + '\n');
      return;
    }

    if (sub === 'push') {
      spinnerStart('Pushing...');
      const result = git('push 2>&1');
      spinnerStop(true);
      if (jsonMode) { console.log(JSON.stringify({ ok: true, output: result })); return; }
      console.log(`\n  ${green('Pushed!')}\n  ${dim(result)}\n`);
      return;
    }

    if (sub === 'branch' || sub === 'branches') {
      const branches = git('branch -a');
      if (jsonMode) {
        const parsed = branches.split('\n').filter(l => l.trim()).map(l => ({ name: l.replace(/^\*?\s+/, ''), current: l.startsWith('*') }));
        console.log(JSON.stringify(parsed));
        return;
      }
      console.log(`\n  ${bold('Branches')}\n`);
      for (const line of branches.split('\n')) {
        if (!line.trim()) continue;
        if (line.startsWith('*')) {
          console.log(`  ${green('*')} ${cyan(line.slice(2))}`);
        } else {
          console.log(`    ${line.trim()}`);
        }
      }
      console.log('');
      return;
    }

    if (sub === 'stash') {
      if (args[1] === 'pop') {
        const result = git('stash pop');
        console.log(green(`\n  Stash popped.\n`));
      } else if (args[1] === 'list') {
        const stashes = git('stash list');
        console.log(`\n  ${bold('Stashes')}\n  ${stashes || dim('No stashes.')}\n`);
      } else {
        const result = git('stash');
        console.log(green(`\n  Changes stashed.\n`));
      }
      return;
    }

    die('Unknown git command: ' + sub + '. Run slop git help');
  } catch (err) {
    if (!quiet) console.error(red('\n  Git error: ') + err.message + '\n');
  }
}

// ============================================================
// REVIEW — Code review (3 competitors have this)
// ============================================================
async function cmdReview(args) {
  requireKey();
  const { execSync } = require('child_process');

  let code = '';
  let source = '';

  // slop review <file>
  const filePath = args.find(a => !a.startsWith('--') && !GLOBAL_FLAGS.includes(a));
  const severity = args.includes('--severity') ? args[args.indexOf('--severity') + 1] : 'all';

  if (filePath && fs.existsSync(filePath)) {
    code = fs.readFileSync(filePath, 'utf8');
    source = filePath;
  } else {
    // Default: review staged/unstaged git changes
    try {
      code = execSync('git diff --staged', { encoding: 'utf8', timeout: 5000 });
      source = 'staged changes';
      if (!code.trim()) {
        code = execSync('git diff', { encoding: 'utf8', timeout: 5000 });
        source = 'unstaged changes';
      }
      if (!code.trim()) {
        code = execSync('git diff HEAD~1', { encoding: 'utf8', timeout: 5000 });
        source = 'last commit';
      }
    } catch(e) { /* not a git repo */ }
  }

  // Accept piped stdin
  const stdinData = await readStdin();
  if (stdinData) { code = stdinData; source = 'stdin'; }

  if (!code.trim()) die('Usage: slop review <file> or run in a git repo\n  Also: cat file.js | slop review');

  // Truncate to fit in LLM context
  if (code.length > 15000) code = code.slice(0, 15000) + '\n... (truncated)';

  spinnerStart(`Reviewing ${source}...`);

  try {
    const prompt = `Review this code. List issues by severity (critical, high, medium, low). For each issue, give the line context and a fix suggestion. Be concise.\n\nSource: ${source}\n\`\`\`\n${code}\n\`\`\``;
    const res = await request('POST', '/v1/llm-analyze-text', { text: prompt, task: 'code-review' });
    spinnerStop(true);
    const d = res.data || res;

    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }

    console.log(`\n  ${bold('Code Review:')} ${source}`);
    console.log(`  ${dim('─'.repeat(50))}\n`);
    const review = d.result || d.analysis || d.response || d.output || JSON.stringify(d);
    console.log(`  ${review}\n`);
    if (d.credits_used) console.log(dim(`  [${d.credits_used}cr used]\n`));
  } catch (err) {
    spinnerStop(false);
    handleError(err);
  }
}

// ============================================================
// SESSION — Session persistence (3 competitors have this)
// ============================================================
async function cmdSession(args) {
  const sub = args[0] || 'list';
  const cfg = loadConfig();
  cfg.sessions = cfg.sessions || {};

  if (sub === 'list') {
    if (jsonMode) { console.log(JSON.stringify(Object.entries(cfg.sessions).map(([id, s]) => ({ id, ...s })))); return; }
    console.log(`\n  ${bold('Saved Sessions')}\n`);
    const entries = Object.entries(cfg.sessions);
    if (entries.length === 0) { console.log(dim('  No sessions saved.\n')); return; }
    for (const [id, session] of entries) {
      console.log(`  ${cyan(id.padEnd(20))} ${dim(session.created || '')} ${dim(String(session.commands?.length || 0) + ' commands')}`);
    }
    console.log('');
    return;
  }

  if (sub === 'save') {
    const name = args[1] || 'session-' + Date.now().toString(36);
    cfg.sessions[name] = {
      created: new Date().toISOString(),
      commands: cfg.history || [],
      config_snapshot: { base_url: cfg.base_url, email: cfg.email },
    };
    saveConfig(cfg);
    if (jsonMode) { console.log(JSON.stringify({ ok: true, session_id: name })); return; }
    console.log(green(`\n  Session saved: ${cyan(name)}`));
    console.log(dim(`  ${(cfg.history || []).length} commands captured.\n`));
    return;
  }

  if (sub === 'resume' || sub === 'load') {
    const name = args[1];
    if (!name) die('Usage: slop session resume <name>');
    const session = cfg.sessions[name];
    if (!session) die('Session not found: ' + name);
    cfg.history = session.commands || [];
    saveConfig(cfg);
    if (jsonMode) { console.log(JSON.stringify({ ok: true, session_id: name, commands: session.commands?.length || 0 })); return; }
    console.log(green(`\n  Session resumed: ${cyan(name)}`));
    console.log(dim(`  ${session.commands?.length || 0} commands loaded into history.\n`));
    return;
  }

  if (sub === 'delete' || sub === 'rm') {
    const name = args[1];
    if (!name) die('Usage: slop session delete <name>');
    delete cfg.sessions[name];
    saveConfig(cfg);
    console.log(green(`\n  Session deleted: ${name}\n`));
    return;
  }

  console.log(`\n  ${bold('Session Management')}\n`);
  console.log(`  ${cyan('slop session list')}              Show saved sessions`);
  console.log(`  ${cyan('slop session save')} ${dim('[name]')}       Save current session`);
  console.log(`  ${cyan('slop session resume')} ${dim('<name>')}    Resume a session`);
  console.log(`  ${cyan('slop session delete')} ${dim('<name>')}    Delete a session\n`);
}

// ============================================================
// INTERACTIVE — Minimal TUI / REPL (zero dependencies)
// ============================================================
async function cmdInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const W = process.stdout.columns || 80;

  // Header
  const cfg = loadConfig();
  const activeOrgs = cfg.active_orgs || [];
  const totalAgents = activeOrgs.reduce((sum, o) => sum + (o.agents || 0), 0);

  console.log('');
  console.log(`  ${C.red}${C.bold}SLOPSHOP${C.reset} ${dim('v' + PKG_VERSION + ' — interactive mode')}`);
  console.log(`  ${dim('1,248 APIs | 44 commands | Type anything | Ctrl+C to exit')}`);
  if (API_KEY) console.log(`  ${dim('Key:')} ${cyan(API_KEY.slice(0, 12) + '...')}`);
  else console.log(`  ${yellow('No key set.')} Run: ${cyan('signup')} or ${cyan('key set sk-slop-...')}`);
  if (totalAgents > 0) {
    console.log(`  ${C.bgRed}${C.white}${C.bold} ${totalAgents} AGENTS ACTIVE ${C.reset} ${dim('across ' + activeOrgs.length + ' org(s)')}`);
  }
  console.log(`  ${dim('─'.repeat(Math.min(W - 4, 60)))}\n`);

  const history = [];

  const loop = () => {
    rl.question(`  ${C.red}slop${C.reset}${C.dim}>${C.reset} `, async (input) => {
      const line = input.trim();
      if (!line) { loop(); return; }
      if (line === 'exit' || line === 'quit' || line === 'q') {
        console.log(dim('\n  Goodbye.\n'));
        rl.close();
        process.exit(0);
      }

      history.push(line);

      // Parse as if it were a CLI command
      const parts = line.split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);

      try {
        switch (cmd) {
          case 'help': case '?': cmdHelp(); break;
          case 'call': await cmdCall(args); break;
          case 'pipe': await cmdPipe(args); break;
          case 'search': await cmdSearch(args); break;
          case 'list': await cmdList(args); break;
          case 'run': await cmdRun(args); break;
          case 'plan': await cmdPlan(args); break;
          case 'org': await cmdOrg(args); break;
          case 'chain': await cmdChain(args); break;
          case 'memory': case 'mem': await cmdMemory(args); break;
          case 'discover': await cmdDiscover(args); break;
          case 'balance': await cmdBalance(); break;
          case 'health': await cmdHealth(); break;
          case 'stats': await cmdStats(args); break;
          case 'whoami': await cmdWhoami(); break;
          case 'models': await cmdModels(args); break;
          case 'cost': await cmdCost(args); break;
          case 'debug': await cmdDebug(args); break;
          case 'git': await cmdGit(args); break;
          case 'file': await cmdFile(args); break;
          case 'review': await cmdReview(args); break;
          case 'history':
            console.log(`\n  ${bold('Session history')}\n`);
            history.forEach((h, i) => console.log(`  ${dim(String(i + 1).padStart(3))} ${h}`));
            console.log('');
            break;
          case 'clear':
            console.clear();
            break;
          case 'signup': await cmdSignup(); break;
          case 'login': await cmdLogin(); break;
          case 'key': await cmdKey(args); break;
          case 'config': cmdConfig(args); break;
          default:
            // Natural language routing
            await cmdNatural(cmd, args);
            break;
        }
      } catch (e) {
        console.error(red('  Error: ') + e.message + '\n');
      }

      loop();
    });
  };

  loop();
}

// ============================================================
// LIVE — Real-time agent organization dashboard (The Sims for AI agents)
// ============================================================
async function cmdLive(args) {
  requireKey();
  const orgId = args[0];

  if (!orgId) {
    // List orgs or prompt to launch one
    console.log(`\n  ${bold('Live Agent Dashboard')}\n`);
    console.log(`  ${cyan('slop live <org-id>')}        Watch an organization in real-time`);
    console.log(`  ${cyan('slop live --launch')}        Launch full-startup template and watch`);
    console.log(`  ${cyan('slop live --templates')}     List available org templates\n`);

    if (args.includes('--templates')) {
      spinnerStart('Loading templates...');
      try {
        const res = await request('GET', '/v1/org/templates', null, false);
        spinnerStop(true);
        const templates = res.data?.templates || res.templates || [];
        console.log(`  ${bold('Organization Templates')}\n`);
        for (const t of templates) {
          console.log(`  ${cyan(t.id.padEnd(22))} ${yellow(String(t.agents?.length || 0).padEnd(3))} agents  ${dim(t.description || t.name)}`);
        }
        console.log(`\n  ${dim('Launch:')} ${cyan('slop org launch --template full-startup --name "My Company"')}\n`);
      } catch(e) { spinnerStop(false); handleError(e); }
      return;
    }

    if (args.includes('--launch')) {
      spinnerStart('Launching 30-agent startup...');
      try {
        const tmplRes = await request('GET', '/v1/org/templates', null, false);
        const templates = tmplRes.data?.templates || tmplRes.templates || [];
        const fullStartup = templates.find(t => t.id === 'full-startup') || templates[0];
        const res = await request('POST', '/v1/org/launch', {
          name: 'AI Startup ' + Date.now().toString(36),
          agents: fullStartup.agents,
          channels: fullStartup.channels,
          auto_handoff: true,
        });
        spinnerStop(true);
        const d = res.data || res;
        console.log(`\n  ${green('Organization launched!')}`);
        console.log(`  ${bold('Org ID:')} ${cyan(d.org_id)}`);
        console.log(`  ${bold('Agents:')} ${d.agents?.length || 0}`);
        console.log(`\n  ${dim('Now watch it live:')}`);
        console.log(`  ${cyan('slop live ' + d.org_id)}\n`);
      } catch(e) { spinnerStop(false); handleError(e); }
      return;
    }
    return;
  }

  // Real-time dashboard for an org
  console.log(`\n  ${bold('LIVE DASHBOARD')} ${dim('— ' + orgId)}`);
  console.log(`  ${dim('Press Ctrl+C to exit. Press Enter to send a command.')}\n`);

  let lastSync = new Date(0).toISOString();

  const refresh = async () => {
    try {
      const status = await request('GET', `/v1/org/${orgId}/status`);
      const d = status.data || status;

      // Clear screen effect
      const now = new Date().toISOString().slice(11, 19);
      console.log(`\n  ${dim('─'.repeat(60))}`);
      console.log(`  ${bold(d.name || 'Organization')} ${dim('|')} ${cyan(orgId)} ${dim('|')} ${now}`);
      console.log(`  ${dim('Agents:')} ${yellow(String(d.agent_count || d.agents?.length || 0))} ${dim('| Messages:')} ${d.messages_total || 0} ${dim('| Chain:')} ${d.chain_status || 'active'}`);

      // Show agents with status indicators
      if (d.agents && Array.isArray(d.agents)) {
        console.log('');
        for (const agent of d.agents) {
          const statusIcon = agent.status === 'working' ? green('●') : agent.status === 'idle' ? dim('○') : yellow('◐');
          const model = dim(`[${agent.model || '?'}]`);
          console.log(`  ${statusIcon} ${cyan(String(agent.name || agent.role || '').padEnd(16))} ${dim(String(agent.role || '').padEnd(20))} ${model} ${dim(agent.last_action || '')}`);
        }
      }

      // Check for new messages in hive
      if (d.hive_id) {
        try {
          const sync = await request('GET', `/v1/hive/${d.hive_id}/sync?since=${encodeURIComponent(lastSync)}`);
          const msgs = sync.data?.messages || [];
          if (msgs.length > 0) {
            console.log(`\n  ${bold('Recent Activity:')}`);
            for (const msg of msgs.slice(-5)) {
              console.log(`  ${dim(String(msg.ts || '').slice(11, 19))} ${cyan(String(msg.from || '').padEnd(12))} ${dim('#' + (msg.channel || 'general'))} ${msg.message?.slice(0, 60) || ''}`);
            }
            lastSync = msgs[msgs.length - 1].ts || lastSync;
          }
        } catch(e) { /* no hive messages yet */ }
      }

      console.log(`\n  ${dim('Commands: task <text> | scale <n> | standup | vision <text> | quit')}`);
    } catch (e) {
      console.log(`  ${red('Error:')} ${e.message}`);
    }
  };

  await refresh();
  const timer = setInterval(refresh, 8000);

  // Interactive command input
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) return;
    if (input === 'quit' || input === 'exit' || input === 'q') {
      clearInterval(timer);
      rl.close();
      console.log(dim('\n  Dashboard closed.\n'));
      process.exit(0);
    }
    if (input.startsWith('task ')) {
      const task = input.slice(5);
      try {
        const res = await request('POST', `/v1/org/${orgId}/task`, { task });
        console.log(`  ${green('Task sent:')} ${task}`);
      } catch(e) { console.log(`  ${red('Error:')} ${e.message}`); }
    } else if (input.startsWith('scale ')) {
      const count = parseInt(input.slice(6));
      try {
        await request('POST', `/v1/org/${orgId}/scale`, { count });
        console.log(`  ${green('Scaled to')} ${count} agents`);
      } catch(e) { console.log(`  ${red('Error:')} ${e.message}`); }
    } else if (input === 'standup') {
      try {
        const res = await request('GET', `/v1/org/${orgId}/standup`);
        const agents = res.data?.agents || [];
        console.log(`\n  ${bold('Daily Standup')}`);
        for (const a of agents) {
          console.log(`  ${cyan(a.name)} (${a.role}): ${dim(a.standup?.status || 'no standup')}`);
        }
      } catch(e) { console.log(`  ${red('Error:')} ${e.message}`); }
    } else if (input.startsWith('vision ')) {
      const vision = input.slice(7);
      try {
        const d = (await request('GET', `/v1/org/${orgId}/status`)).data || {};
        if (d.hive_id) {
          await request('POST', `/v1/hive/${d.hive_id}/vision`, { vision });
          console.log(`  ${green('Vision set:')} ${vision}`);
        }
      } catch(e) { console.log(`  ${red('Error:')} ${e.message}`); }
    } else {
      console.log(dim(`  Unknown command: ${input}`));
    }
  });

  process.on('SIGINT', () => {
    clearInterval(timer);
    rl.close();
    console.log(dim('\n  Dashboard closed.\n'));
    process.exit(0);
  });
}

// ============================================================
// MAIN ENTRYPOINT
// ============================================================
async function main() {
  // Filter out global flags and --timeout=N and --retry N from args
  const rawArgs = process.argv.slice(2).filter((a, i, arr) => {
    if (GLOBAL_FLAGS.includes(a)) return false;
    if (a.startsWith('--timeout=')) return false;
    if (a === '--retry') return false;
    // Skip the value after --retry
    if (i > 0 && arr[i - 1] === '--retry') return false;
    return true;
  });
  let cmd = rawArgs[0];
  let args = rawArgs.slice(1);

  // Check aliases before command dispatch
  const aliasCfg = loadConfig();
  if (cmd && aliasCfg.aliases && aliasCfg.aliases[cmd]) {
    const aliasedArgs = aliasCfg.aliases[cmd].split(/\s+/);
    cmd = aliasedArgs[0];
    args = [...aliasedArgs.slice(1), ...args];
  }

  if (!cmd || cmd === '--help' || cmd === '-h') {
    // First-run: show onboarding if no key configured
    if (!cmd && !API_KEY && !jsonMode) {
      console.log(`\n  ${C.red}${C.bold}SLOPSHOP${C.reset} v${PKG_VERSION} ${dim('— the missing CLI for AI agents')}\n`);
      console.log(`  ${bold('Quick start:')}`);
      console.log(`    1. ${cyan('slop signup')}                    Create free account (500 credits)`);
      console.log(`    2. ${cyan('slop call crypto-uuid')}          Your first API call`);
      console.log(`    3. ${cyan('slop search "what you need"')}    Find any of 1,248 APIs`);
      console.log(`    4. ${cyan('slop pipe api1 api2')}            Chain APIs together\n`);
      console.log(`  ${bold('Already have a key?')}`);
      console.log(`    ${cyan('slop key set sk-slop-YOUR-KEY')}\n`);
      console.log(`  ${dim('Run')} ${cyan('slop help')} ${dim('for all 42 commands.')}\n`);
      return;
    }
    cmdHelp();
    return;
  }
  if (cmd === 'help') {
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
    case 'key':     await cmdKey(args);     break;
    case 'mcp':     cmdMcp(args);           break;
    case 'init':    cmdInit(args);          break;
    case 'org':     await cmdOrg(args);    break;
    case 'chain':   await cmdChain(args);  break;
    case 'memory':  await cmdMemory(args); break;
    case 'mem':     await cmdMemory(args); break;
    case 'run':     await cmdRun(args);    break;
    case 'discover': await cmdDiscover(args); break;
    case 'stats':   await cmdStats(args);  break;
    case 'batch':   await cmdBatch(args);  break;
    case 'watch':   await cmdWatch(args);  break;
    case 'alias':   cmdAlias(args);        break;
    case 'history': cmdHistory(args);      break;
    case 'plan':    await cmdPlan(args);   break;
    case 'models':  await cmdModels(args); break;
    case 'model':   await cmdModels(args); break;
    case 'profile': cmdProfile(args);      break;
    case 'profiles': cmdProfile(args);     break;
    case 'cost':    await cmdCost(args);   break;
    case 'debug':   await cmdDebug(args);  break;
    case 'cloud':   await cmdCloud(args);  break;
    case 'logs':    await cmdLogs(args);   break;
    case 'log':     await cmdLogs(args);   break;
    case 'dev':     await cmdDev(args);    break;
    case 'env':     await cmdEnv(args);    break;
    case 'listen':  await cmdListen(args); break;
    case 'types':   await cmdTypes(args);  break;
    case 'file':    await cmdFile(args);    break;
    case 'git':     await cmdGit(args);    break;
    case 'review':  await cmdReview(args); break;
    case 'session': await cmdSession(args); break;
    case 'live':    await cmdLive(args);    break;
    case 'i': case 'interactive': case 'tui': case 'shell': case 'repl': await cmdInteractive(); break;
    case 'version': case '-v': case '--version': {
      if (jsonMode) {
        console.log(JSON.stringify({ version: PKG_VERSION, name: 'slopshop', node: process.version, platform: `${process.platform}-${process.arch}`, config: CONFIG_FILE }));
      } else {
        console.log(`\n  ${bold('slopshop')} v${PKG_VERSION}`);
        console.log(`  ${dim('Node:')}     ${process.version}`);
        console.log(`  ${dim('Platform:')} ${process.platform}-${process.arch}`);
        console.log(`  ${dim('Config:')}   ${CONFIG_FILE}\n`);
      }
      break;
    }
    case 'upgrade':     await cmdUpgrade();         break;
    case 'completions': cmdCompletions(args);       break;
    case 'do':      await cmdNatural(args[0] || '', args.slice(1)); break;
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
  if (/^(remember|store|save|set|put)\s+["']?(\S+?)["']?\s*[=:]\s*(.+)/i.test(fullInput)) {
    const m = fullInput.match(/^(?:remember|store|save|set|put)\s+["']?(\S+?)["']?\s*[=:]\s*(.+)/i);
    return cmdMemory(['set', m[1].trim(), m[2].trim().replace(/^['"]|['"]$/g, '')]);
  }
  if (/^(recall|get|fetch|retrieve|what is|what's|whats)\s+["']?(\S+?)["']?\s*$/i.test(fullInput)) {
    const m = fullInput.match(/^(?:recall|get|fetch|retrieve|what is|what's|whats)\s+["']?(\S+?)["']?\s*$/i);
    return cmdMemory(['get', m[1].trim()]);
  }
  if (/^(find|search|look for|where)\s+(.+)\s+in\s+memory/i.test(fullInput)) {
    const m = fullInput.match(/^(?:find|search|look for|where)\s+(.+)\s+in\s+memory/i);
    return cmdMemory(['search', m[1].trim()]);
  }
  if (/^(forget|delete|remove|clear)\s+["']?(\S+?)["']?\s*$/i.test(fullInput)) {
    const m = fullInput.match(/^(?:forget|delete|remove|clear)\s+["']?(\S+?)["']?\s*$/i);
    return cmdMemory(['delete', m[1].trim()]);
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

  // Math
  if (/^(calculate|compute|math|eval)\s+(.+)/i.test(fullInput)) {
    const expr = fullInput.replace(/^(?:calculate|compute|math|eval)\s+/i, '');
    return cmdCall(['math-evaluate', '--expression', expr]);
  }

  // JSON operations
  if (/^(parse|format|prettify|validate)\s+json\s+(.+)/i.test(fullInput)) {
    const data = fullInput.replace(/^(?:parse|format|prettify|validate)\s+json\s+/i, '');
    return cmdCall(['json-format', '--json', data]);
  }

  // Time/date
  if (/^(what time|current time|now|timestamp|date)/i.test(lower)) {
    return cmdCall(['date-now']);
  }

  // Password generation
  if (/^(generate|create|new)\s+(password|pass|secret)/i.test(lower)) {
    return cmdCall(['crypto-password-generate', '--length', '24']);
  }

  // Random number
  if (/^(random|roll|dice|flip)/i.test(lower)) {
    return cmdCall(['crypto-random-int', '--min', '1', '--max', '100']);
  }

  // Base64 decode
  if (/^(decode|debase)\s+base64\s+(.+)/i.test(fullInput)) {
    const data = fullInput.match(/(?:decode|debase)\s+base64\s+(.+)/i)[1];
    return cmdCall(['text-base64-decode', '--text', data]);
  }

  // IP/DNS
  if (/^(lookup|resolve|dns)\s+(\S+)/i.test(fullInput)) {
    const domain = fullInput.match(/(?:lookup|resolve|dns)\s+(\S+)/i)[1];
    return cmdCall(['net-dns-lookup', '--domain', domain]);
  }

  // JWT decode
  if (/^(decode|inspect)\s+jwt\s+(.+)/i.test(fullInput)) {
    const token = fullInput.match(/(?:decode|inspect)\s+jwt\s+(.+)/i)[1];
    return cmdCall(['crypto-jwt-decode', '--token', token]);
  }

  // Who am I
  if (/^(who am i|whoami|my account|my info|about me)/i.test(lower)) {
    return cmdWhoami();
  }

  // Help variants
  if (/^(help|how|what can|commands|usage)/i.test(lower)) {
    return cmdHelp();
  }

  // Pipe operations with natural language
  if (/^(.+)\s+then\s+(.+)/i.test(fullInput)) {
    // "hash hello then base64 encode" -> pipe
    console.log(dim('\n  Tip: Use slop pipe <api1> <api2> for chaining.\n'));
  }

  // Cost estimation
  if (/^(how much|cost|price|estimate)\s+(.+)/i.test(fullInput)) {
    const task = fullInput.replace(/^(?:how much|cost|price|estimate)\s+(?:does|would|will|to)?\s*/i, '');
    return cmdCall(['cost-estimate-llm', '--prompt', task, '--model', 'claude-4-sonnet']);
  }

  // List all memory
  if (/^(list|show|all)\s+(my\s+)?(memories|memory|stored|data|keys)/i.test(lower)) {
    return cmdMemory(['list']);
  }

  // Search memory
  if (/^(search|find|look)\s+(my\s+)?(memory|memories|stored|data)\s+(?:for\s+)?(.+)/i.test(fullInput)) {
    const m = fullInput.match(/(?:search|find|look)\s+(?:my\s+)?(?:memory|memories|stored|data)\s+(?:for\s+)?(.+)/i);
    return cmdMemory(['search', m[1]]);
  }

  // Plan mode
  if (/^(plan|plan out|design|architect|outline)\s+(.+)/i.test(fullInput)) {
    const task = fullInput.replace(/^(?:plan|plan out|design|architect|outline)\s+/i, '');
    return cmdPlan([task]);
  }

  // Debug
  if (/^(debug|explain|fix|diagnose)\s+(this\s+)?(error|bug|issue|problem)\s*:?\s*(.+)/i.test(fullInput)) {
    const error = fullInput.replace(/^(?:debug|explain|fix|diagnose)\s+(?:this\s+)?(?:error|bug|issue|problem)\s*:?\s*/i, '');
    return cmdDebug([error]);
  }

  // Cloud
  if (/^(run|execute|do)\s+(.+)\s+(in the cloud|on cloud|remotely|async)/i.test(fullInput)) {
    const task = fullInput.replace(/\s+(in the cloud|on cloud|remotely|async)\s*$/i, '').replace(/^(?:run|execute|do)\s+/i, '');
    return cmdCloud(['run', task]);
  }

  // Models
  if (/^(what|which|list|show)\s+(models?|llms?|ais?)/i.test(lower)) {
    return cmdModels([]);
  }

  // Code review
  if (/^(review|code review|check code|audit code|lint)\s*(.*)/i.test(fullInput)) {
    const file = fullInput.replace(/^(?:review|code review|check code|audit code|lint)\s*/i, '').trim();
    return cmdReview(file ? [file] : []);
  }

  // File operations
  if (/^(read|cat|open|show)\s+(file\s+)?(.+)/i.test(fullInput)) {
    const target = fullInput.match(/(?:read|cat|open|show)\s+(?:file\s+)?(.+)/i)[1].trim();
    if (fs.existsSync(target)) return cmdFile(['read', target]);
  }
  if (/^(write|create|save)\s+(file\s+)?(.+\.\w+)/i.test(fullInput)) {
    const m = fullInput.match(/(?:write|create|save)\s+(?:file\s+)?(\S+)\s+(.*)/i);
    if (m) return cmdFile(['write', m[1], '--content', m[2]]);
  }

  // Git shortcuts
  if (/^(commit|push|stash|branch(es)?|git status|git diff|git log)/i.test(lower)) {
    const parts = fullInput.replace(/^git\s*/i, '').split(/\s+/);
    return cmdGit(parts);
  }

  // Search for tools
  if (/^(find|search|look for|what tools?|which api|how do i)\s+(.+)/i.test(fullInput)) {
    const query = fullInput.replace(/^(?:find|search|look for|what tools?|which api|how do i)\s+/i, '');
    return cmdSearch([query]);
  }

  // If nothing matched locally, try the server-side agent/run as fallback
  // This uses credits — warn the user
  if (!API_KEY) {
    if (!quiet && !jsonMode) {
      console.log(dim(`\n  No built-in command for: "${fullInput}"`));
      console.log(`  Try: ${cyan('slop search "' + fullInput.split(' ').slice(0, 3).join(' ') + '"')}`);
      console.log(`  Or:  ${cyan('slop help')}\n`);
    }
    return;
  }
  if (!quiet && !jsonMode) console.log(dim(`\n  No built-in match. Running server-side (uses credits)...`));

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
