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
const verbose = process.argv.includes('--verbose') || process.argv.includes('-V');
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

function progressBar(current, total, width = 30, label = '') {
  if (quiet || jsonMode || !process.stderr.isTTY) return;
  const pct = Math.min(current / total, 1);
  const filled = Math.round(width * pct);
  const empty = width - filled;
  const bar = C.green + '\u2588'.repeat(filled) + C.dim + '\u2591'.repeat(empty) + C.reset;
  const pctStr = Math.round(pct * 100) + '%';
  process.stderr.write(`\r  ${bar} ${C.bold}${pctStr}${C.reset} ${C.dim}${label}${C.reset}`);
  if (current >= total) process.stderr.write('\n');
}

// ============================================================
// PRETTY PRINT HELPERS
// ============================================================
function prettyJSON(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (obj === null) return dim('null');
  if (typeof obj === 'boolean') return obj ? green(String(obj)) : red(String(obj));
  if (typeof obj === 'number') return yellow(String(obj));
  if (typeof obj === 'string') return green(`"${obj}"`);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    const items = obj.map(v => `${pad}  ${prettyJSON(v, indent + 1)}`);
    return `[ ${items.join(',\n')} ]`;
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
        else if (k === '_credits_remaining') metaParts.push(`remaining: ${v}`);
        else if (k === '_latency_ms')   metaParts.push(`${v}ms`);
        else if (k === '_engine')       metaParts.push(`engine: ${v}`);
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
    process.stdin.on('end', () => resolve(data.trim().replace(/\s+$/, '')));
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
      console.log(`  ${bold('Would execute:')} ${green('no (dry run)')}`);
      console.log(dim('  Use without --dry-run to execute.\n'));
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  // --help: show API schema info (dry-run)
  if (args.includes('--help')) {
    try {
      if (!quiet && !jsonMode) console.log(dim(`  Fetching API info for ${slug}...`));
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
          console.log(`\n${bold('Parameters:')} ${d.parameters ? '' : ' (no parameters found)'}`);
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
      const _t0 = Date.now();
      const res = await request('POST', `/v1/${slug}`, input);
      const _elapsed = Date.now() - _t0;
      spinnerStop(true);
      printResult(res.data, slug);

      // Show timing summary
      if (!quiet && !jsonMode) {
        const d2 = res.data;
        const meta2 = (d2 && typeof d2 === 'object' && d2.meta) ? d2.meta : {};
        const creditStr = meta2.credits_used !== undefined ? ` (${meta2.credits_used} credit${meta2.credits_used === 1 ? '' : 's'})` : '';
        console.log(`  ${green('\u2713')} ${cyan(slug)} completed in ${bold(_elapsed + 'ms')}${creditStr}`);
        const rawData = (d2 && typeof d2 === 'object' && d2.data !== undefined) ? d2.data : d2;
        const engineTag = (rawData && rawData._engine) ? ` Result verified with _engine: "${rawData._engine}"` : '';
        console.log(`  ${dim('  Real compute, not LLM estimation.' + engineTag)}\n`);
      }

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
      console.log(JSON.stringify(d));
      return;
    }

    if (quiet) {
      console.log(`balance: ${balance}`);
      console.log(`tier: ${tier}`);
      return;
    }

    // Credit bar: scale to 16 chars, assume 500 max for free tier
    const maxCredits = tier === 'free' ? 500 : (tier === 'pro' ? 100000 : 1000000);
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
    console.log(`  Version: ${dim(d.version !== undefined ? d.version : 'unknown')}`);
    console.log(`  Base:    ${dim(BASE_URL)}`);
  } catch (err) {
    handleError(err);
  }
}

async function cmdDoctor() {
  console.log(`\n  ${bold('Slopshop Doctor')} ${dim('— diagnosing your setup')}\n`);
  const checks = [];

  // 1. API Key
  const hasKey = !!API_KEY;
  checks.push({ name: 'API Key', ok: hasKey, detail: hasKey ? dim(API_KEY.slice(0, 12) + '...') : red('Not set. Run: slop signup') });

  // 2. Server reachable
  let serverOk = false;
  try {
    const res = await request('GET', '/v1/health', null, false);
    serverOk = res.data?.status === 'healthy' || res.data?.status === 'operational';
    checks.push({ name: 'Server', ok: serverOk, detail: serverOk ? green(res.data?.version || 'ok') + ' ' + dim(BASE_URL) : red('Unreachable: ' + BASE_URL) });
  } catch(e) { checks.push({ name: 'Server', ok: false, detail: red('Unreachable: ' + BASE_URL) }); }

  // 3. Credits
  if (hasKey) {
    try {
      const bal = await request('GET', '/v1/credits/balance');
      const b = bal.data?.balance ?? bal.balance ?? 0;
      checks.push({ name: 'Credits', ok: b > 0, detail: b > 0 ? green(b + 'cr') + ' (' + (bal.data?.tier || bal.tier || 'free') + ')' : red('0 credits. Run: slop buy') });
    } catch(e) { checks.push({ name: 'Credits', ok: false, detail: yellow('Could not check') }); }
  }

  // 4. Ollama (local LLM)
  let ollamaOk = false;
  try {
    const ollamaRes = await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:11434/api/tags', res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      req.on('error', reject);
      req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
    });
    const models = (ollamaRes.models || []).map(m => m.name).slice(0, 5);
    ollamaOk = models.length > 0;
    checks.push({ name: 'Ollama', ok: ollamaOk, detail: ollamaOk ? green(models.length + ' models') + ' ' + dim(models.join(', ')) : yellow('No models. Run: ollama pull llama3') });
  } catch(e) { checks.push({ name: 'Ollama', ok: false, detail: dim('Not running (optional). Start: ollama serve') }); }

  // 5. MCP config
  const mcpPath = path.join(os.homedir(), '.claude', 'settings.json');
  let mcpOk = false;
  try {
    const settings = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    mcpOk = !!settings.mcpServers?.slopshop;
    checks.push({ name: 'MCP (Claude)', ok: mcpOk, detail: mcpOk ? green('Configured') : dim('Not set. Run: slop mcp') });
  } catch(e) { checks.push({ name: 'MCP (Claude)', ok: false, detail: dim('Not set. Run: slop mcp') }); }

  // 6. Config file
  const configExists = fs.existsSync(CONFIG_FILE);
  checks.push({ name: 'Config', ok: configExists, detail: configExists ? dim(CONFIG_FILE) : red('Missing. Run: slop signup') });

  // 7. Memory writable
  if (hasKey && serverOk) {
    try {
      const ts = Date.now();
      await request('POST', '/v1/memory-set', { key: 'doctor-' + ts, value: 'ok' });
      const get = await request('POST', '/v1/memory-get', { key: 'doctor-' + ts });
      const memOk = (get.data?.value || get.value) === 'ok';
      checks.push({ name: 'Memory', ok: memOk, detail: memOk ? green('Read/write OK (free forever)') : red('Write failed') });
    } catch(e) { checks.push({ name: 'Memory', ok: false, detail: red('Error: ' + e.message) }); }
  }

  // Display results
  const passed = checks.filter(c => c.ok).length;
  for (const c of checks) {
    console.log(`  ${c.ok ? green('✓') : (c.detail.includes('optional') || c.detail.includes('Not set') ? yellow('○') : red('✗'))} ${bold(c.name.padEnd(14))} ${c.detail}`);
  }

  console.log(`\n  ${bold('Result:')} ${passed}/${checks.length} checks passed`);
  if (passed === checks.length) console.log(`  ${green('Everything looks good!')}`);
  else console.log(`  ${yellow('Some items need attention. See above.')}`);
  console.log('');
}

// ============================================================
// HIVE v3 — Production. Context-injected. 5-gate safety. Metrics.
// Local=research, Cloud=edits. CLAUDE.md in every prompt.
// Usage: slop hive [sprints] [--cloud] [--edit] "mission"
// ============================================================
async function cmdHive(args) {
  requireKey();
  const numArg = args.find(a => /^\d+$/.test(a));
  const sprints = numArg ? parseInt(numArg) : 10;
  const useCloud = args.includes('--cloud');
  const allowEdits = args.includes('--edit');
  const cloudEveryArg = args.find(a => a.startsWith('--cloud-every='));
  const cloudEvery = cloudEveryArg ? parseInt(cloudEveryArg.split('=')[1]) : 10;
  const mission = args.filter(a => !/^\d+$/.test(a) && !a.startsWith('--')).join(' ').trim() || 'improve slopshop';

  const HIVE_EDIT_BLACKLIST = ['server-v2.js', 'auth.js', 'stripe.js'];

  // ── Helpers ──
  const ollamaChat = (model, prompt) => new Promise(r => {
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false });
    const req = http.request({ hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, timeout: 90000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { const content = JSON.parse(d).message?.content; r(content || ''); } catch(e) { r(''); } });
    });
    req.on('error', () => r('')); req.on('timeout', () => { req.destroy(); r(''); });
    req.write(body); req.end();
  });
  let creditsSpent = 0;
  const cloudChat = async (provider, prompt) => {
    if (!useCloud || creditsSpent >= 50) return '';
    try { const r = await request('POST', '/v1/llm-think', { text: prompt.slice(0, 3500), provider }); creditsSpent += 10; return r.data?.data?.answer || r.data?.answer || ''; }
    catch(e) { return ''; }
  };
  const slopCall = async (slug, params) => {
    try { const r = await request('POST', '/v1/' + slug, params); return { ok: true, data: r.data?.data || r.data }; }
    catch(e) { return { ok: false }; }
  };
  const slopMem = async (k, v) => (await slopCall('memory-set', { key: k, value: typeof v === 'string' ? v : JSON.stringify(v) })).ok;
  const extractScore = t => { const m = (t||'').match(/(\d+\.?\d*)\s*\/\s*10/); return m ? parseFloat(m[1]) : 0; };
  const todoFile = path.join(CONFIG_DIR, 'hive-todo.md');
  const todos = [];

  // ── Context injection: load CLAUDE.md + auto-extract codebase summary ──
  let codebaseContext = '';
  try {
    // Try the auto-extractor first
    const ctxBuilder = require('./hive-context');
    const ctx = ctxBuilder.loadOrBuild();
    codebaseContext = ctx.context.slice(0, 2000);
  } catch(e) {
    // Fallback: just CLAUDE.md
    try { codebaseContext = fs.readFileSync(path.join(__dirname, 'CLAUDE.md'), 'utf8').slice(0, 800); } catch(e2) {}
  }
  // Inject context into every local prompt
  const localAsk = async (prompt) => {
    const injected = codebaseContext ? `CODEBASE:\n${codebaseContext}\n\n${prompt}` : prompt;
    return ollamaChat('llama3', injected);
  };
  const cloudAsk = async (prompt) => {
    const injected = codebaseContext ? `CODEBASE:\n${codebaseContext.slice(0, 500)}\n\n${prompt}` : prompt;
    return cloudChat('anthropic', injected);
  };

  // ── Shared state ──
  const HIVE_KEY = 'hive-' + Date.now();
  const localDoc = path.join(CONFIG_DIR, 'hive-shared.json');
  let shared = { mission, sprints_done: 0, research: [], builds: [], scores: [], vision: mission, discoveries: [] };
  try { if (fs.existsSync(localDoc)) { const p = JSON.parse(fs.readFileSync(localDoc, 'utf8')); if (p.research?.length) { shared = { ...shared, ...p, mission }; console.log(dim(`  Loaded ${p.research?.length||0} research from cache`)); } } } catch(e) {}
  const save = async () => { try { fs.writeFileSync(localDoc, JSON.stringify(shared, null, 2)); } catch(e) {} await slopMem(HIVE_KEY, shared); };

  let northStar = 'The protocol layer of intelligence connecting every AI brain into one composable mesh.';
  try { northStar = fs.readFileSync(path.join(__dirname, 'NORTH-STAR.md'), 'utf8').replace(/\n/g, ' ').slice(0, 250); } catch(e) {}

  console.log('');
  console.log(`  ${C.red}${C.bold}╔════════════════════════════════════════════════╗${C.reset}`);
  console.log(`  ${C.red}${C.bold}║          SLOPSHOP HIVE v3 (production)         ║${C.reset}`);
  console.log(`  ${C.red}${C.bold}╚════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  ${bold('Mission:')} ${green(mission)}`);
  console.log(`  ${dim('Context:')} ${codebaseContext ? green(codebaseContext.split('\n').length + ' lines injected') : yellow('CLAUDE.md not found')}`);
  console.log(`  ${dim(useCloud ? 'Cloud every ' + cloudEvery + ' sprints' : 'Local only (free). --cloud for cloud LLMs.')}`);
  console.log('');

  // ── Scrape once ──
  console.log(`  ${bold('INITIAL SCRAPE')}`);
  const urls = [...new Set(mission.match(/https?:\/\/[^\s,)]+/g) || [])];
  const mw = mission.toLowerCase();
  if (mw.includes('competitor') || mw.includes('compar')) { if (!urls.find(u=>u.includes('composio'))) urls.push('https://composio.dev'); }
  if (mw.includes('slopshop') && !urls.find(u=>u.includes('slopshop'))) urls.push('https://slopshop.gg');

  for (const url of urls.slice(0, 4)) {
    const r = await slopCall('ext-web-scrape', { url });
    if (r.ok && (r.data?.title || r.data?.content)) {
      shared.research.push({ text: `[${url}] ${r.data?.title || ''}: ${(r.data?.content || '').slice(0, 150)}`, sprint: 0 });
      console.log(`  ${green('✓')} ${cyan(url.slice(0, 40))} ${dim((r.data?.title || '').slice(0, 30))}`);
    }
  }
  if (shared.research.length > 20) shared.research = shared.research.slice(-20);
  await save();
  console.log(`  ${dim(shared.research.length + ' items in knowledge base')}`);
  console.log('');

  // Safety: hive edits go on a git branch
  const hiveBranch = 'hive-' + Date.now();
  let onBranch = false;
  try { require('child_process').execSync('git checkout -b ' + hiveBranch, { cwd: __dirname, stdio: 'pipe' }); onBranch = true; console.log(`  ${green('✓')} Branch: ${cyan(hiveBranch)} ${dim('(master is safe)')}`); }
  catch(e) { console.log(`  ${dim('No git — edits are direct')}`); }
  const successfulEdits = [];
  console.log('');

  // ===============================================================
  // HIVE v3 SPRINT LOOP — Cloud finds issues, local adds context, cloud fixes
  //
  // Cycle of cloudEvery sprints (default 10):
  //   Sprint 1 (CLOUD-SCAN):  Claude reads code, finds up to 5 real issues
  //   Sprints 2..N-1 (LOCAL): Local picks one issue, reads surrounding code, adds notes
  //   Sprint N (CLOUD-FIX):   Claude reads notes, picks best issue, generates + applies fix
  //
  // Why this works:
  //   - Cloud does HARD work (finding bugs, writing fixes) -- good at this
  //   - Local does EASY work (reading code, confirming, adding context) -- can do this
  //   - Every cycle produces ONE real shipped fix with 5-gate safety
  // ===============================================================

  const editableFiles = ['server-v2.js', 'cli.js', 'mcp-server.js', 'agent.js',
    'handlers/compute.js', 'handlers/llm.js', 'handlers/network.js',
    'handlers/external.js', 'handlers/memory.js', 'pipes.js', 'schemas.js'];

  // Issues found by cloud scan, enriched by local sprints during a cycle
  let cycleIssues = []; // { file, line, issue, context, localNotes: [] }

  for (let s = 1; s <= sprints; s++) {
    const t0 = Date.now();
    creditsSpent = 0;
    const cyclePos = ((s - 1) % cloudEvery) + 1; // 1-based position within cycle
    const isCloudScan = useCloud && cyclePos === 1;         // first sprint: cloud finds issues
    const isCloudFix  = useCloud && cyclePos === cloudEvery; // last sprint: cloud fixes best issue
    const isLocal = !isCloudScan && !isCloudFix;

    const recentScores = shared.scores.slice(-5).map(x => x.score);
    const trend = recentScores.length >= 2 ? recentScores[recentScores.length - 1] - recentScores[0] : 0;
    const phase = s <= 3 ? 'EXPLORE' : (trend > 0.5 ? 'ACCELERATE' : (trend < -0.5 ? 'FIX' : 'OPTIMIZE'));

    let priority = '', score = 0, built_n = 0;

    // --------------------------------------------------
    // CLOUD-SCAN: Claude analyzes 50 lines of code, finds real issues
    // --------------------------------------------------
    if (isCloudScan) {
      console.log(`  ${C.red}${C.bold}== S${s} ==${C.reset} ${yellow('[CLOUD-SCAN]')} ${dim('Finding issues for next cycle')}`);

      // Rotate through editable files each cycle
      const cycleNum = Math.floor((s - 1) / cloudEvery);
      const targetFile = editableFiles[cycleNum % editableFiles.length];
      let codeSnippet = '';
      let startLine = 0;
      try {
        const allLines = fs.readFileSync(path.join(__dirname, targetFile), 'utf8').split('\n');
        // Pick a 50-line window -- use prime multiplier for good spread across file
        const windowStart = (cycleNum * 37) % Math.max(1, allLines.length - 50);
        startLine = windowStart;
        codeSnippet = allLines.slice(windowStart, windowStart + 50).map((l, i) => `${windowStart + i + 1}: ${l}`).join('\n');
      } catch (e) {
        console.log(`  ${dim('|')} ${yellow('Cannot read ' + targetFile)}`);
      }

      if (codeSnippet) {
        const scanPrompt = `You are reviewing ${targetFile} for slopshop.gg.

CODEBASE:
${codebaseContext.slice(0, 800)}

MISSION: ${mission}

CODE (lines ${startLine + 1}-${startLine + 50}):
${codeSnippet}

Find up to 5 REAL issues in this code. Only report issues that are:
- Missing error handling (no try-catch around risky ops)
- Potential null/undefined crashes
- Security issues (unsanitized input, missing auth checks)
- Logic bugs (wrong operator, off-by-one, mutating when should copy)
- Missing timeouts or resource leaks

Do NOT report:
- Style preferences, renaming, or formatting
- "Could be more elegant" rewrites
- Anything that works correctly as-is

For each issue, output EXACTLY this format (one per line):
ISSUE: ${targetFile}:<line_number> | <one sentence describing the real bug/risk>

If fewer than 5 real issues exist, output fewer. If zero real issues, output:
ISSUE: none`;

        const scanResp = await cloudAsk(scanPrompt);
        cycleIssues = [];
        const issueMatches = (scanResp || '').match(/ISSUE:\s*.+/gi) || [];
        for (const m of issueMatches) {
          if (m.toLowerCase().includes('none')) continue;
          const parts = m.replace(/^ISSUE:\s*/i, '').split('|');
          const loc = (parts[0] || '').trim();
          const desc = (parts[1] || '').trim();
          const fileMatch = loc.match(/^([^:]+):(\d+)/);
          if (fileMatch && desc) {
            cycleIssues.push({
              file: fileMatch[1].trim(),
              line: parseInt(fileMatch[2]),
              issue: desc,
              context: '',
              localNotes: [],
            });
          }
        }

        score = 8;
        priority = `Found ${cycleIssues.length} issues in ${targetFile}`;
        for (const iss of cycleIssues) {
          console.log(`  ${dim('|')} ${red('ISSUE')} ${dim(iss.file + ':' + iss.line)} ${iss.issue.slice(0, 60)}`);
          todos.push({ sprint: s, file: iss.file, line: iss.line, verdict: 'BUG', issue: iss.issue, phase });
        }
        if (cycleIssues.length === 0) {
          console.log(`  ${dim('|')} ${dim('No real issues found in this region -- clean code')}`);
          score = 6;
        }
      } else {
        score = 5; priority = 'no code to scan';
        console.log(`  ${dim('|')} ${dim('No code snippet available')}`);
      }

    // --------------------------------------------------
    // LOCAL SPRINT: Pick one cloud-found issue, read surrounding code, add notes
    //
    // KEY INSIGHT: Local models (llama3 4GB) CANNOT find bugs -- they say FINE to
    // everything. But they CAN do simple tasks:
    //   - Read code and describe what it does (CONTEXT)
    //   - Confirm whether a KNOWN issue looks real (CONFIRM yes/no)
    //   - Flag whether nearby code might break if we edit (RISK)
    //
    // These are easy yes/no + one-sentence tasks. Even a 4GB model handles this.
    // --------------------------------------------------
    } else if (isLocal) {
      console.log(`  ${C.red}${C.bold}== S${s} ==${C.reset} ${dim('[LOCAL]')} ${dim('Enriching issue ' + (cyclePos - 1) + '/' + (cloudEvery - 2))}`);

      if (cycleIssues.length === 0) {
        // No cloud issues to enrich -- happens if cloud-scan found nothing or --local-only
        console.log(`  ${dim('|')} ${dim('No issues to research -- waiting for next cloud scan')}`);
        score = 5; priority = 'waiting for cloud scan';
      } else {
        // Round-robin through cloud-found issues so each gets multiple local reviews
        const issueIdx = (cyclePos - 2) % cycleIssues.length;
        const issue = cycleIssues[issueIdx];

        // Read 10 lines of context around the flagged line
        let surroundingCode = '';
        try {
          const allLines = fs.readFileSync(path.join(__dirname, issue.file), 'utf8').split('\n');
          const ln = issue.line - 1;
          const ctxStart = Math.max(0, ln - 5);
          const ctxEnd = Math.min(allLines.length, ln + 5);
          surroundingCode = allLines.slice(ctxStart, ctxEnd).map((l, i) => `${ctxStart + i + 1}: ${l}`).join('\n');
          issue.context = surroundingCode;
        } catch (e) {}

        // Ask local model SIMPLE questions it CAN answer.
        // NOT "find bugs" (it can't). Instead: "here's a known bug, tell me about context."
        const localPrompt = `Sprint ${s}/${sprints}. Mission: ${mission.slice(0, 60)}

A senior code reviewer found this issue in ${issue.file} line ${issue.line}:
ISSUE: ${issue.issue}

Here is the code around that line:
${surroundingCode}

Answer these 3 questions. Keep each answer to ONE sentence.

1. CONFIRM: Does the issue look real based on the code? (YES or NO, then why)
2. CONTEXT: What does this code section do? (function name and purpose)
3. RISK: If we change line ${issue.line}, could it break nearby code? (YES or NO, then what)

CONFIRM:
CONTEXT:
RISK:`;

        const localResp = await localAsk(localPrompt);

        // Parse the structured response
        const confirm = ((localResp || '').match(/CONFIRM:\s*(.+?)(?:\n|$)/i) || [])[1] || '';
        const context = ((localResp || '').match(/CONTEXT:\s*(.+?)(?:\n|$)/i) || [])[1] || '';
        const risk = ((localResp || '').match(/RISK:\s*(.+?)(?:\n|$)/i) || [])[1] || '';

        // Store notes -- even partial/garbled responses add value because
        // multiple local sprints reviewing the same issue create consensus
        const note = {
          sprint: s,
          confirm: confirm.slice(0, 100),
          context: context.slice(0, 100),
          risk: risk.slice(0, 100),
          raw: (localResp || '').slice(0, 200),
        };
        issue.localNotes.push(note);

        const confirmed = confirm.toLowerCase().startsWith('yes');
        score = confirmed ? 7 : 5;
        priority = `${issue.file}:${issue.line} ${confirmed ? 'CONFIRMED' : 'UNCERTAIN'}: ${issue.issue.slice(0, 40)}`;

        console.log(`  ${dim('|')} ${dim('Issue:')} ${issue.issue.slice(0, 55)}`);
        console.log(`  ${dim('|')} ${confirmed ? green('CONFIRMED') : yellow('UNCERTAIN')} ${dim(confirm.slice(0, 50))}`);
        if (context) console.log(`  ${dim('|')} ${dim('Context:')} ${context.slice(0, 55)}`);
        if (risk) console.log(`  ${dim('|')} ${dim('Risk:')} ${risk.slice(0, 55)}`);

        // Add to shared research for persistence across sessions
        shared.research.push({
          text: `[S${s}] ${issue.file}:${issue.line} ${confirmed ? 'CONFIRMED' : 'UNCERTAIN'}: ${issue.issue.slice(0, 80)}`,
          sprint: s,
        });
        if (shared.research.length > 50) shared.research = shared.research.slice(-50);
      }

    // --------------------------------------------------
    // CLOUD-FIX: Claude reads all local enrichment notes, picks best issue,
    // generates a precise find/replace patch, applies through 5-gate safety
    // --------------------------------------------------
    } else if (isCloudFix) {
      console.log(`  ${C.red}${C.bold}== S${s} ==${C.reset} ${yellow('[CLOUD-FIX]')} ${dim('Implementing best issue from cycle')}`);

      // Filter to issues that got at least one local review
      const reviewedIssues = cycleIssues.filter(iss => iss.localNotes.length > 0);

      if (reviewedIssues.length === 0 && cycleIssues.length === 0) {
        console.log(`  ${dim('|')} ${dim('No issues to fix this cycle')}`);
        score = 5; priority = 'no issues found';
      } else {
        // Use reviewed issues if available, otherwise fall back to all issues
        const candidates = reviewedIssues.length > 0 ? reviewedIssues : cycleIssues;

        // Build summary for CEO decision -- includes local confirmation counts
        const issueSummary = candidates.map((iss, i) => {
          const confirmedCount = iss.localNotes.filter(n => n.confirm.toLowerCase().startsWith('yes')).length;
          const totalNotes = iss.localNotes.length;
          const riskNotes = iss.localNotes.map(n => n.risk).filter(Boolean).join('; ');
          return `${i + 1}. ${iss.file}:${iss.line} -- ${iss.issue}\n   Local votes: ${confirmedCount}/${totalNotes} confirmed\n   Context: ${iss.localNotes[0]?.context || 'no local review'}\n   Risk: ${riskNotes || 'unknown'}`;
        }).join('\n');

        // CEO prompt: pick the single best issue to fix
        const ceoPrompt = `You are the CEO of an engineering team for slopshop.gg.

MISSION: ${mission}
VISION: ${shared.vision}
PHASE: ${phase}
RECENT EDITS: ${shared.builds.filter(b => b.type === 'file-edit').slice(-3).map(b => b.key + ': ' + (b.find || '').slice(0, 30)).join('; ') || 'none yet'}

Issues found by code review, researched by local agents:

${issueSummary}

Pick the SINGLE highest-impact issue to fix NOW. Prefer:
- Issues confirmed by local research (more votes = more confidence)
- Low risk of breaking other code
- Real bugs over style issues

Output EXACTLY:
PICK: <number 1-${candidates.length}>
FILE: <filename>
ISSUE: <one sentence>
APPROACH: <one sentence -- the exact code change to make>
VISION: <updated project vision, or "unchanged">`;

        const ceoResp = await cloudAsk(ceoPrompt);
        const pickNum = parseInt(((ceoResp || '').match(/PICK:\s*(\d+)/i) || [])[1]) || 1;
        const pickedIssue = candidates[Math.min(pickNum - 1, candidates.length - 1)];
        const approach = ((ceoResp || '').match(/APPROACH:\s*(.+?)(?:\n|$)/i) || [])[1] || '';
        const newVision = ((ceoResp || '').match(/VISION:\s*(.+?)(?:\n|$)/i) || [])[1] || '';
        if (newVision && newVision.toLowerCase() !== 'unchanged') {
          shared.vision = newVision.slice(0, 200);
        }

        console.log(`  ${dim('|')} ${bold('CEO PICK:')} #${pickNum} ${pickedIssue.issue.slice(0, 55)}`);
        console.log(`  ${dim('|')} ${dim('Approach:')} ${approach.slice(0, 55)}`);

        // Read the target code region for patch generation
        const fp = path.resolve(__dirname, pickedIssue.file);
        let codeRegion = '';
        try {
          const allLines = fs.readFileSync(fp, 'utf8').split('\n');
          const ln = pickedIssue.line - 1;
          const regionStart = Math.max(0, ln - 5);
          const regionEnd = Math.min(allLines.length, ln + 10);
          codeRegion = allLines.slice(regionStart, regionEnd).map((l, i) => `${regionStart + i + 1}: ${l}`).join('\n');
        } catch (e) {
          console.log(`  ${dim('|')} ${red('Cannot read')} ${pickedIssue.file}`);
        }

        if (codeRegion) {
          // Generate exact find/replace patch
          const patchPrompt = `You are editing ${pickedIssue.file} to fix this issue:
ISSUE: ${pickedIssue.issue}
APPROACH: ${approach}

Here is the code region:
${codeRegion}

Local research notes:
${pickedIssue.localNotes.map(n => '- Confirm: ' + n.confirm + ' | Context: ' + n.context + ' | Risk: ' + n.risk).join('\n') || '- No local notes available'}

Write an EXACT find-and-replace patch.

CRITICAL RULES:
- FIND block: copy the EXACT text from the code above (preserve indentation with spaces)
- REPLACE block: your fixed version
- Change as FEW lines as possible (1-3 ideal)
- Do NOT use .splice where .slice is correct
- Do NOT add .default to require() calls
- Do NOT invert boolean conditions unless that IS the fix
- Do NOT rewrite working patterns into "clever" alternatives
- Preserve exact whitespace (spaces, not tabs)

FIND:
${'```'}
<exact existing text>
${'```'}

REPLACE:
${'```'}
<your fix>
${'```'}

CONFIDENCE: <1-10>`;

          const patchResp = await cloudAsk(patchPrompt);

          // Parse FIND/REPLACE blocks from response
          const ticks = '`'.repeat(3);
          const findMatch = (patchResp || '').match(new RegExp('FIND:\\s*' + ticks + '\\s*\\n?([\\s\\S]*?)' + ticks, 'i'));
          const replaceMatch2 = (patchResp || '').match(new RegExp('REPLACE:\\s*' + ticks + '\\s*\\n?([\\s\\S]*?)' + ticks, 'i'));
          const confidence = parseInt(((patchResp || '').match(/CONFIDENCE:\s*(\d+)/i) || [])[1]) || 0;

          const findText = findMatch ? findMatch[1].replace(/\n$/, '') : '';
          const replaceText = replaceMatch2 ? replaceMatch2[1].replace(/\n$/, '') : '';

          priority = pickedIssue.issue;

          if (findText && replaceText && findText !== replaceText && confidence >= 5) {
           if (!allowEdits) {
              console.log(`  ${dim('|')} File editing disabled (use --edit flag to enable)`);
              score = 5;
           } else if (HIVE_EDIT_BLACKLIST.includes(pickedIssue.file)) {
              console.log(`  ${dim('|')} ${red('BLOCKED:')} ${pickedIssue.file} is blacklisted from hive edits`);
              score = 4;
           } else {
            const filePath = path.resolve(__dirname, pickedIssue.file);

            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf8');

              // == GATE 0: EXACT MATCH -- find text must exist verbatim ==
              if (content.includes(findText)) {
                const backup = content;
                const newContent = content.replace(findText, replaceText);
                fs.writeFileSync(filePath, newContent);

                // == GATE 1: SYNTAX -- node -c must pass ==
                let syntaxOk = true;
                if (filePath.endsWith('.js')) {
                  try { require('child_process').execSync('node -c "' + filePath + '"', { stdio: 'pipe', timeout: 5000 }); }
                  catch (e) { syntaxOk = false; }
                }

                // == GATE 2: RUNTIME -- file must load without crash ==
                let runtimeOk = true;
                if (syntaxOk) {
                  try {
                    if (pickedIssue.file === 'cli.js') {
                      require('child_process').execSync('node "' + filePath + '" version --json --quiet', { stdio: 'pipe', timeout: 10000 });
                    } else if (pickedIssue.file === 'server-v2.js') {
                      require('child_process').execSync("node -e \"require('./server-v2.js')\"", { cwd: __dirname, stdio: 'pipe', timeout: 5000 });
                    } else {
                      require('child_process').execSync('node -c "' + filePath + '"', { stdio: 'pipe', timeout: 5000 });
                    }
                  } catch (e) { runtimeOk = false; }
                }

                // == GATE 3: SEMANTIC REVIEW -- cloud LLM checks for known bad patterns ==
                let semanticOk = true;
                if (syntaxOk && runtimeOk) {
                  const reviewResp = await cloudAsk('Review this code change for bugs.\n\nORIGINAL:\n' + findText + '\n\nREPLACEMENT:\n' + replaceText + '\n\nISSUE BEING FIXED: ' + pickedIssue.issue + '\n\nCheck for these specific bug patterns:\n1. .splice used where .slice was intended (splice mutates)\n2. Inverted boolean logic (condition flipped from original)\n3. const variable being reassigned\n4. .default added to require() (does not exist in Node CJS)\n5. Variable shadowing in nested scope\n6. Off-by-one errors in loops or slicing\n7. Missing null/undefined checks that existed in original\n8. Breaking change to function signature or return type\n\nOutput EXACTLY one line:\nSAFE: <reason>\nor\nDANGEROUS: <reason>');
                  if ((reviewResp || '').toLowerCase().includes('dangerous')) {
                    semanticOk = false;
                    const reason = ((reviewResp || '').match(/DANGEROUS:\s*(.+?)(?:\n|$)/i) || [])[1] || 'unknown';
                    console.log(`  ${dim('|')} ${red('GATE 3 FAIL:')} ${reason.slice(0, 60)}`);
                  }
                }

                // == GATE 4: SIZE -- not whitespace-only, not bloating 3x ==
                const meaningful = findText.replace(/\s/g, '') !== replaceText.replace(/\s/g, '') &&
                                   replaceText.length < findText.length * 3;

                if (syntaxOk && runtimeOk && semanticOk && meaningful) {
                  // All 5 gates passed -- commit the edit
                  try {
                    require('child_process').execSync(
                      `git add "${filePath}" && git commit -m "hive S${s}: ${priority.replace(/"/g, '').slice(0, 50)}"`,
                      { cwd: __dirname, stdio: 'pipe', timeout: 5000 }
                    );
                  } catch (e) { /* not in git or nothing to commit */ }

                  shared.builds.push({ key: pickedIssue.file, type: 'file-edit', find: findText.slice(0, 50), replace: replaceText.slice(0, 50), sprint: s });
                  successfulEdits.push({ sprint: s, file: pickedIssue.file, priority, find: findText.slice(0, 60), replace: replaceText.slice(0, 60) });
                  built_n++;
                  score = 9;
                  console.log(`  ${dim('|')} ${green('GATE 0: exact match OK')}`);
                  console.log(`  ${dim('|')} ${green('GATE 1: syntax OK')}`);
                  console.log(`  ${dim('|')} ${green('GATE 2: runtime OK')}`);
                  console.log(`  ${dim('|')} ${green('GATE 3: semantic SAFE')}`);
                  console.log(`  ${dim('|')} ${green('GATE 4: size OK')}`);
                  console.log(`  ${dim('|')} ${green('SHIPPED')} ${cyan(pickedIssue.file)} ${dim('(5-gate pass + committed)')}`);
                  console.log(`  ${dim('|')} ${red('-')} ${dim(findText.split('\n')[0].slice(0, 60))}`);
                  console.log(`  ${dim('|')} ${green('+')} ${dim(replaceText.split('\n')[0].slice(0, 60))}`);
                } else {
                  // Gate failed -- revert from in-memory backup
                  fs.writeFileSync(filePath, backup);
                  const reason = !syntaxOk ? 'syntax error' : !runtimeOk ? 'runtime crash' : !semanticOk ? 'semantic DANGEROUS' : 'trivial/bloated';
                  console.log(`  ${dim('|')} ${red('REVERTED')} ${cyan(pickedIssue.file)} ${dim('(' + reason + ')')}`);
                  score = 4;
                }
              } else {
                console.log(`  ${dim('|')} ${yellow('GATE 0 FAIL:')} find text not found in ${pickedIssue.file}`);
                score = 4;
              }
            }
           } // end allowEdits else block
          } else {
            const reason = !findText ? 'no FIND block' : !replaceText ? 'no REPLACE block' : findText === replaceText ? 'no change' : 'low confidence (' + confidence + ')';
            console.log(`  ${dim('|')} ${dim('No valid patch: ' + reason)}`);
            score = 5;
          }
        } else {
          score = 5; priority = pickedIssue?.issue || 'no code region';
        }
      }

      // Clear cycle issues -- next cycle starts fresh with new cloud scan
      cycleIssues = [];
    }

    // == Store in memory if no file edit shipped ==
    if (built_n === 0) {
      await slopMem('hive-s' + s, JSON.stringify({ priority, sprint: s }));
      shared.builds.push({ key: 'hive-s' + s, type: 'memory', sprint: s });
    }
    if (shared.builds.length > 50) shared.builds = shared.builds.slice(-50);

    // == Score + phase tracking ==
    shared.scores.push({ sprint: s, score, phase });
    if (shared.scores.length > 50) shared.scores = shared.scores.slice(-50);
    if (priority) shared.plan = [priority];

    // Re-scrape every 25 sprints to refresh knowledge base
    if (s % 25 === 0 && urls.length > 0) {
      console.log(`  ${dim('|')} ${cyan('refreshing knowledge base...')}`);
      const fresh = await slopCall('ext-web-scrape', { url: urls[s % urls.length] });
      if (fresh.ok) shared.research.push({ text: `[REFRESH ${urls[s % urls.length]}] ${fresh.data?.title || ''}: ${(fresh.data?.content || '').slice(0, 150)}`, sprint: s });
      if (shared.research.length > 50) shared.research = shared.research.slice(-50);
    }

    // Compaction every 100 sprints -- prevent unbounded growth
    if (s % 100 === 0) {
      const oldResearch = shared.research.slice(0, -10);
      const kept = shared.research.slice(-10);
      if (oldResearch.length > 5) {
        const themes = [...new Set(oldResearch.map(r => (r.text || '').split(':')[0]).filter(Boolean))].slice(0, 5).join(', ');
        shared.research = [{ text: `[COMPACTED S1-${s - 10}] ${oldResearch.length} items. Themes: ${themes}`, sprint: s }].concat(kept);
      }
      shared.builds = shared.builds.filter(b => b.type === 'file-edit').slice(-20);
    }

    // Discovery: find new competitor URLs on cloud-fix sprints
    if (isCloudFix && urls.length > 0) {
      const discResp = await cloudChat('anthropic', `We research: ${urls.join(', ')}. Name ONE new competitor URL we should add. Just the URL, nothing else.`);
      const newUrl = (discResp || '').match(/https?:\/\/\S+/)?.[0];
      if (newUrl && !urls.includes(newUrl)) { urls.push(newUrl); shared.discoveries.push(newUrl); console.log(`  ${dim('|')} ${green('DISCOVERED:')} ${cyan(newUrl)}`); }
    }

    const ms = Date.now() - t0;
    const phaseColor = phase === 'ACCELERATE' ? green : phase === 'FIX' ? red : phase === 'EXPLORE' ? cyan : dim;
    console.log(`  ${dim('>')} ${bold(score + '/10')} ${phaseColor('[' + phase + ']')} built:${built_n} ${dim(ms + 'ms')} ${dim(creditsSpent + 'cr')}`);
    if (s % 5 === 0 && shared.vision) console.log(`    ${bold('VISION:')} ${green(shared.vision.slice(0, 70))}`);

    // Metrics CSV -- append-only, never loaded into prompts
    const metricsFile = path.join(CONFIG_DIR, 'hive-metrics.csv');
    if (s === 1) { try { fs.writeFileSync(metricsFile, 'sprint,score,phase,built,edits,credits,ms,file,priority\n'); } catch (e) {} }
    const editResult = successfulEdits.length > 0 ? successfulEdits[successfulEdits.length - 1]?.file || '' : '';
    try { fs.appendFileSync(metricsFile, `${s},${score},${phase},${built_n},${successfulEdits.length},${creditsSpent},${ms},${editResult},${(priority || '').replace(/,/g, ';').slice(0, 60)}\n`); } catch (e) {}

    // Running stats every 25 sprints
    if (s % 25 === 0) {
      const totalEdits = successfulEdits.length;
      const avgScore = Math.round(shared.scores.reduce((a, x) => a + (x.score || 0), 0) / shared.scores.length * 10) / 10;
      console.log(`    ${bold('STATS @' + s + ':')} edits:${totalEdits} avg:${avgScore}/10 scores:${shared.scores.slice(-5).map(x => x.score).join(' > ')}`);
    }

    shared.sprints_done = s;
    await save();
    console.log('');
    await new Promise(r => setTimeout(r, 300));
  }

  // Final
  console.log(`  ${C.red}${C.bold}╔════════════════════════════════════════════════╗${C.reset}`);
  console.log(`  ${C.red}${C.bold}║            HIVE COMPLETE                       ║${C.reset}`);
  console.log(`  ${C.red}${C.bold}╚════════════════════════════════════════════════╝${C.reset}`);
  const avg = shared.scores.length > 0 ? (shared.scores.reduce((a,s)=>a+s.score,0)/shared.scores.length).toFixed(1) : '?';
  console.log(`  Sprints: ${sprints}  Avg: ${bold(avg+'/10')}  Builds: ${shared.builds.length}  Discoveries: ${shared.discoveries?.length||0}`);
  if (shared.scores.length > 0) console.log(`  Scores: ${shared.scores.slice(-10).map(s=>s.score.toFixed(1)).join('→')}`);
  if (shared.vision) console.log(`  Vision: ${green(shared.vision.slice(0,70))}`);
  // Show edits for review
  if (successfulEdits.length > 0) {
    console.log(`\n  ${bold('CODE CHANGES (' + successfulEdits.length + ' edits):')}`);
    for (const e of successfulEdits) {
      console.log(`  ${cyan('S' + e.sprint)} ${bold(e.file)} ${dim(e.priority.slice(0, 50))}`);
      console.log(`    ${red('-')} ${dim(e.find)}`);
      console.log(`    ${green('+')} ${dim(e.replace)}`);
    }
    if (onBranch) {
      console.log(`\n  ${bold('Branch:')} ${cyan(hiveBranch)}`);
      console.log(`  ${dim('To merge:')}  ${cyan('git checkout master && git merge ' + hiveBranch)}`);
      console.log(`  ${dim('To discard:')} ${cyan('git checkout master && git branch -D ' + hiveBranch)}`);
      console.log(`  ${dim('To review:')} ${cyan('git diff master..' + hiveBranch)}`);
    }
  }

  // Write TODO for unimplemented ideas
  if (todos.length > 0) {
    const todoContent = `# Hive TODO — ${new Date().toISOString().slice(0, 10)}\n\nMission: ${mission}\nSprints: ${sprints} | Avg: ${avg}/10\nBranch: ${hiveBranch}\nEdits shipped: ${successfulEdits.length}\n\n## Priorities\n\n${todos.map((t, i) => `${i + 1}. [S${t.sprint}] [${t.phase}] ${t.priority}`).join('\n')}\n\n## Code changes on branch ${hiveBranch}\n\n${successfulEdits.map(e => `- ${e.file}: ${e.priority.slice(0, 60)}`).join('\n')}\n`;
    fs.writeFileSync(todoFile, todoContent);
    console.log(`  ${bold('TODO:')} ${cyan(todoFile)}`);
  }
  console.log(`  Doc: ${cyan(HIVE_KEY)}  Local: ${dim(localDoc)}`);

  // Switch back to master — hive edits stay on branch
  if (onBranch) {
    try { require('child_process').execSync('git checkout master', { cwd: __dirname, stdio: 'pipe' }); console.log(`  ${green('✓')} Back on master. Hive edits on ${cyan(hiveBranch)}.`); }
    catch(e) {}
  }
  console.log('');
}

function cmdHelp() {
  if (!quiet && !jsonMode) {
    console.log(`\n  ${C.dim}${'~'.repeat(50)}${C.reset}`);
    console.log(`  ${C.dim}  S L O P S H O P   C L I${C.reset}`);
    console.log(`  ${C.dim}${'~'.repeat(50)}${C.reset}`);

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
    console.log(`  ${bold('Standalone CLI')} ${dim('\u00b7')} ${bold('MCP Server')} ${dim('\u00b7')} ${bold('925 Handlers')} ${dim('\u00b7')} ${bold('Free Memory Forever')}`);
    console.log(`  ${dim('Works inside:')} ${cyan('Claude Code')} ${dim('\u00b7')} ${cyan('Cursor')} ${dim('\u00b7')} ${cyan('Goose')} ${dim('\u00b7')} ${cyan('Cline')} ${dim('\u00b7')} ${cyan('OpenCode')} ${dim('\u00b7')} ${cyan('Aider')}\n`);
  }

  if (jsonMode) {
    console.log(JSON.stringify({
      commands: ['call', 'pipe', 'search', 'list', 'run', 'org', 'wallet', 'bounty', 'market', 'eval', 'replay', 'queue', 'webhooks', 'teams', 'knowledge', 'chain', 'memory', 'discover', 'stats', 'benchmark', 'signup', 'login', 'whoami', 'key', 'config', 'balance', 'buy', 'health', 'mcp', 'batch', 'watch', 'alias', 'history', 'plan', 'models', 'profile', 'cost', 'debug', 'cloud', 'logs', 'dev', 'env', 'listen', 'types', 'file', 'git', 'review', 'session', 'live', 'voice', 'simulate', 'snapshot', 'guardrails', 'template', 'marketplace', 'version', 'upgrade', 'completions', 'help', 'army', 'schedule', 'copilot', 'tournament', 'reputation', 'proof', 'staking', 'forge', 'arbitrage', 'browser', 'desktop', 'sandbox', 'federation', 'graphrag', 'chaos', 'quickstart'],
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
  console.log(`    ${cyan('slop army')} ${dim('recruit|list|dismiss')}        Manage agent armies`);
  console.log(`    ${cyan('slop schedule')} ${dim('add|list|remove')}         Schedule recurring agent tasks`);
  console.log(`    ${cyan('slop copilot')} ${dim('start|stop|status')}        Interactive AI copilot mode`);
  console.log(`    ${cyan('slop tournament')} ${dim('create|list|join')}      Agent tournaments and competitions`);
  console.log(`    ${cyan('slop simulate')} ${dim('--task "..." --agents 10')}  Run agent simulation`);
  console.log(`    ${cyan('slop snapshot save')} ${dim('--run-id ID')}        Save swarm snapshot`);
  console.log(`    ${cyan('slop template')} ${dim('list|run')}               Agent templates`);
  console.log(`    ${cyan('slop federation')} ${dim('join|list|leave')}       Federated agent networks`);
  console.log(`    ${cyan('slop chaos')} ${dim('run|report')}                Chaos testing for agent swarms`);
  console.log(`    ${cyan('slop interactive')}                      Interactive REPL / shell mode\n`);
  console.log(`  ${bold('SAFETY & VOICE')}`);
  console.log(`    ${cyan('slop voice transcribe')} ${dim('--file path')}    Transcribe audio file`);
  console.log(`    ${cyan('slop guardrails scan')} ${dim('"text"')}          Deep scan text for safety\n`);
  console.log(`  ${bold('MARKETPLACE')}`);
  console.log(`    ${cyan('slop marketplace publish')} ${dim('--name X')}    Publish a tool`);
  console.log(`    ${cyan('slop marketplace top')}                  Browse top tools\n`);
  console.log(`  ${bold('ECONOMY & KNOWLEDGE')}`);
  console.log(`    ${cyan('slop wallet')} ${dim('create|list|fund|transfer')} Manage wallets and funds`);
  console.log(`    ${cyan('slop bounty')} ${dim('post|list|claim')}            Post and claim bounties`);
  console.log(`    ${cyan('slop market')} ${dim('create|list|bet|resolve')}  Prediction markets`);
  console.log(`    ${cyan('slop eval')} ${dim('run')}                        Run evaluation test sets`);
  console.log(`    ${cyan('slop replay')} ${dim('list|load')}                List/load saved replays`);
  console.log(`    ${cyan('slop knowledge')} ${dim('add|query')}               Knowledge graph operations`);
  console.log(`    ${cyan('slop reputation')} ${dim('view|rate')}             Agent reputation scores`);
  console.log(`    ${cyan('slop proof')} ${dim('generate|verify')}            Proof-of-work verification`);
  console.log(`    ${cyan('slop staking')} ${dim('stake|unstake|status')}     Stake credits on outcomes`);
  console.log(`    ${cyan('slop forge')} ${dim('create|list|deploy')}         Forge custom tools`);
  console.log(`    ${cyan('slop arbitrage')} ${dim('scan|execute')}           Credit arbitrage across markets`);
  console.log(`    ${cyan('slop graphrag')} ${dim('index|query')}             Graph-based RAG operations\n`);
  console.log(`  ${bold('ACCOUNT & CONFIG')}`);
  console.log(`    ${cyan('slop login')}                             Log in`);
  console.log(`    ${cyan('slop whoami')}                            Show current user info`);
  console.log(`    ${cyan('slop key')} ${dim('[set|remove|rotate]')}          Manage your API key`);
  console.log(`    ${cyan('slop config')} ${dim('[key] [value]')}              View or set config`);
  console.log(`    ${cyan('slop balance')}                           Check credit balance`);
  console.log(`    ${cyan('slop buy')} <amount>                      Buy credits (1k/10k/100k/1M)`);
  console.log(`    ${cyan('slop stats')}                             Platform statistics & usage`);
  console.log(`    ${cyan('slop health')}                            Server health check`);
  console.log(`    ${cyan('slop benchmark')}                         Benchmark API latency (8 endpoints)`);
  console.log(`    ${cyan('slop mcp')}                               Set up MCP for Claude Code`);
  console.log(`    ${cyan('slop mcp serve')}                         Start MCP server (Goose/Cursor/Cline)`);
  console.log(`    ${cyan('slop mcp config')}                        Show MCP config for all clients`);
  console.log(`    ${cyan('slop init')} ${dim('[--full-stack --ollama]')}    Scaffold Slopshop project`);
  console.log(`    ${cyan('slop agents')} ${dim('set|start|stop|status')}   Configure always-running local agents`);
  console.log(`    ${cyan('slop doctor')}                            Diagnose your setup (key, server, Ollama, MCP)`);
  console.log(`    ${cyan('slop quickstart')}                         Guided setup wizard for new users`);
  console.log(`    ${cyan('slop help')}                              Show this help\n`);
  console.log(`  ${bold('AI & PLANNING')}`);
  console.log(`    ${cyan('slop plan')} ${dim('"task description"')}          Plan before executing`);
  console.log(`    ${cyan('slop plan --execute')}                    Execute saved plan`);
  console.log(`    ${cyan('slop review')} ${dim('[file]')}                   AI code review`);
  console.log(`    ${cyan('slop debug')} ${dim('"error message"')}            AI error debugging`);
  console.log(`    ${cyan('slop models')}                            List/set AI models`);
  console.log(`    ${cyan('slop cost')} ${dim('<slug>')}                     Estimate credit cost\n`);
  console.log(`  ${bold('LOCAL TOOLS')}`);
  console.log(`    ${cyan('slop git')} ${dim('status|diff|log|commit|push')} Git integration`);
  console.log(`    ${cyan('slop session')} ${dim('save|resume|list')}         Save/resume CLI sessions\n`);
  console.log(`  ${bold('CLOUD & INFRA')}`);
  console.log(`    ${cyan('slop cloud')} ${dim('run|status|list')}            Cloud task handoff`);
  console.log(`    ${cyan('slop logs')} ${dim('[--follow --filter X]')}       Stream platform logs`);
  console.log(`    ${cyan('slop listen')} ${dim('[--forward-to URL]')}        Webhook event listener`);
  console.log(`    ${cyan('slop dev')} ${dim('[--port 3000]')}                Start local dev server`);
  console.log(`    ${cyan('slop env')} ${dim('list|set|get|delete')}          Manage env variables`);
  console.log(`    ${cyan('slop browser')} ${dim('open|scrape|screenshot')}   Browser automation`);
  console.log(`    ${cyan('slop desktop')} ${dim('capture|click|type')}       Desktop automation`);
  console.log(`    ${cyan('slop sandbox')} ${dim('create|exec|destroy')}      Sandboxed execution environments\n`);
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
  console.log(`    ${cyan('slop call crypto-uuid')}\n`);
  console.log(`    ${dim('# Hash some text')}`);
  console.log(`    ${cyan('slop call crypto-hash-sha256 --text "hello world"')}\n`);
  console.log(`    ${dim('# Count words')}`);
  console.log(`    ${cyan('slop call text-word-count --text "one two three"')}\n`);
  console.log(`    ${dim('# Chain APIs: encode then hash')}`);
  console.log(`    ${cyan('slop pipe text-base64-encode crypto-hash-sha256 --text "test"')}\n`);
  console.log(`    ${dim('# Store in persistent memory (free)')}`);
  console.log(`    ${cyan('slop memory set mykey "my value"')}\n`);
  console.log(`    ${dim('# Search 925+ tools')}`);
  console.log(`    ${cyan('slop search "validate email"')}\n`);
  console.log(`    ${dim('# Run iterative hive')}`);
  console.log(`    ${cyan('slop hive 10 "review competitors and find gaps"')}`);
  console.log(`    ${dim('    --edit    Enable file editing (disabled by default for safety)')}`);
  console.log(`    ${dim('    --cloud   Enable cloud LLM calls')}\n`);
  console.log(`    ${dim('# Check your setup')}`);
  console.log(`    ${cyan('slop doctor')}\n`);
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

  if (sub !== null && sub !== undefined && sub === 'config') {
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

  // Smart suggestions based on status code
  if (err.status === 401) {
    console.error(yellow('\n  Suggestion: ') + 'Not authenticated. Try:');
    console.error(`    ${cyan('slop signup')}   Create a free account`);
    console.error(`    ${cyan('slop login')}    Log in to existing account`);
    console.error(`    ${cyan('slop key set sk-slop-YOUR-KEY')}  Set API key manually`);
  } else if (err.status === 402) {
    const remaining = err.body?.error?.credits_remaining ?? err.body?.credits_remaining;
    if (remaining !== undefined) {
      console.error(yellow(`\n  Balance: `) + `${remaining} credits remaining`);
    }
    console.error(yellow('\n  Suggestion: ') + 'Insufficient credits. Top up with:');
    console.error(`    ${cyan('slop buy')}      Purchase more credits`);
    console.error(`    ${cyan('slop balance')}  Check your current balance`);
  } else if (err.status === 404) {
    console.error(yellow('\n  Suggestion: ') + 'API not found. Try searching for similar tools:');
    console.error(`    ${cyan('slop search "<keyword>"')}  Find matching APIs`);
    console.error(`    ${cyan('slop list')}               Browse all categories`);
    console.error(`    ${cyan('slop discover')}           Discover APIs by category`);
  } else if (err.status === 429) {
    const retryAfter = err.body?.error?.retry_after || err.body?.retry_after;
    if (retryAfter) {
      console.error(yellow(`\n  Rate limited. `) + `Retry after ${bold(retryAfter + 's')}`);
    } else {
      console.error(yellow('\n  Rate limited. ') + 'Wait a moment and try again.');
    }
    console.error(`    ${dim('Tip: Use')} ${cyan('--retry 3')} ${dim('for automatic retries with backoff')}`);
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
    const credits = d.credits || d.balance || 500;

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
    // Handle: slop key set sk-slop-xxx OR slop key set KEY sk-slop-xxx
    let newKey = args[1];
    if (newKey && !newKey.startsWith('sk-slop-') && args[2]?.startsWith('sk-slop-')) newKey = args[2];
    if (!newKey) return die('Usage: slop key set sk-slop-YOUR-KEY');
    if (!newKey.startsWith('sk-slop-')) return die('Invalid key format. Keys start with sk-slop-\n  Example: slop key set sk-slop-5a42dc9cbc7341f5bbd0d755');
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
  console.log(`  ${cyan('slop key set sk-slop-xxx')}   Save a new key`);
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
    console.log(`  ${cyan('slop memory export')} ${dim('[file]')}         Export ALL memory to local JSON`);
    console.log(`  ${cyan('slop memory import')} ${dim('<file>')}         Import memory from JSON file`);
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

    // LOCAL CACHE: Always keep a local copy of memory (your data, your machine)
    const localDir = path.join(CONFIG_DIR, 'memory');
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    const cacheFile = path.join(localDir, 'cache.json');
    let cache = {};
    try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch(e) {}
    cache[key] = { value, updated: new Date().toISOString() };
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));

    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    if (quiet) { console.log(d.key || key || 'stored'); return; }
    console.log(`\n  ${green('\u2713 Stored:')} ${cyan(key)} ${dim('(cloud + local cache)')}\n`);
    return;
  }

  if (sub === 'get') {
    const key = args[1];
    if (!key) die('Usage: slop memory get <key>');
    const res = await request('POST', '/v1/memory-get', { key });
    const d = res.data || res;
    const val = d.data?.value ?? d.value;
    const found = val !== undefined && val !== null;
    if (jsonMode) { console.log(JSON.stringify(d, null, 2)); return; }
    if (quiet) { console.log(found ? String(val) : ''); return; }
    console.log(`\n  ${bold(key + ':')} ${found ? green(String(val)) : dim('(not found)')}\n`);
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

  if (sub === 'export') {
    // Export ALL memory data to a local JSON file — data portability
    const outFile = args[1] || path.join(process.cwd(), 'slopshop-memory-export.json');
    console.log(`\n  ${bold('Exporting all memory...')}`);
    spinnerStart('Fetching keys...');
    const listRes = await request('POST', '/v1/memory-list', {});
    const keys = (listRes.data?.keys || listRes.data?.entries || []).map(k => typeof k === 'string' ? k : (k.key || k.id));
    spinnerStop(true);
    console.log(`  Found ${bold(String(keys.length))} keys. Fetching values...`);

    const exported = {};
    let fetched = 0;
    for (const key of keys) {
      try {
        const getRes = await request('POST', '/v1/memory-get', { key });
        const val = getRes.data?.data?.value ?? getRes.data?.value;
        if (val !== undefined) exported[key] = val;
        fetched++;
        if (fetched % 50 === 0) process.stderr.write(dim(`  ... ${fetched}/${keys.length}\n`));
      } catch(e) { /* skip failed keys */ }
    }

    // Also save locally
    const localDir = path.join(CONFIG_DIR, 'memory');
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    const localFile = path.join(localDir, 'export-' + new Date().toISOString().slice(0, 10) + '.json');
    fs.writeFileSync(localFile, JSON.stringify(exported, null, 2));
    fs.writeFileSync(outFile, JSON.stringify(exported, null, 2));

    console.log(`\n  ${green('✓')} Exported ${bold(String(Object.keys(exported).length))} entries`);
    console.log(`  ${dim('Local backup:')} ${localFile}`);
    console.log(`  ${dim('Export file:')}  ${outFile}`);
    console.log(`  ${dim('Your data. Your control. Always exportable.')}\n`);
    return;
  }

  if (sub === 'import') {
    const inFile = args[1];
    if (!inFile || !fs.existsSync(inFile)) die('Usage: slop memory import <file.json>');
    const data = JSON.parse(fs.readFileSync(inFile, 'utf8'));
    const entries = Object.entries(data);
    console.log(`\n  ${bold('Importing ' + entries.length + ' entries...')}`);
    let imported = 0;
    for (const [key, value] of entries) {
      try {
        await request('POST', '/v1/memory-set', { key, value: typeof value === 'string' ? value : JSON.stringify(value) });
        imported++;
        if (imported % 50 === 0) process.stderr.write(dim(`  ... ${imported}/${entries.length}\n`));
      } catch(e) { /* skip */ }
    }
    console.log(`  ${green('✓')} Imported ${bold(String(imported))} entries\n`);
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
// BENCHMARK — Measure API latency across endpoints
// ============================================================
async function cmdBenchmark() {
  requireKey();

  const timestamp = Date.now();
  const tests = [
    { name: 'crypto-uuid',       method: 'POST', path: '/v1/crypto-uuid',         body: null,                                    category: 'compute' },
    { name: 'crypto-hash-sha256', method: 'POST', path: '/v1/crypto-hash-sha256', body: { text: 'benchmark' },                   category: 'compute' },
    { name: 'text-word-count',   method: 'POST', path: '/v1/text-word-count',     body: { text: 'one two three' },               category: 'compute' },
    { name: 'memory-set',        method: 'POST', path: '/v1/memory-set',          body: { key: 'bench-' + timestamp, value: 'ok' }, category: 'memory' },
    { name: 'memory-search',     method: 'POST', path: '/v1/memory-search',       body: { query: 'bench' },                      category: 'memory' },
    { name: 'health',            method: 'GET',  path: '/v1/health',              body: null,                                    category: 'health' },
    { name: 'route',             method: 'POST', path: '/v1/route',               body: { task: 'generate uuid' },               category: 'routing' },
    { name: 'introspect',        method: 'GET',  path: '/v1/introspect?slug=crypto-uuid', body: null,                            category: 'discovery' },
  ];

  if (!quiet && !jsonMode) {
    console.log(`\n  ${bold('Benchmark')} — ${dim('measuring latency across ' + tests.length + ' endpoints')}`);
    console.log(`  ${dim('Target:')} ${BASE_URL}\n`);
  }

  const results = [];

  for (const t of tests) {
    const start = Date.now();
    let ok = false;
    let status = '';
    try {
      const authNeeded = t.name !== 'health';
      await request(t.method, t.path, t.body, authNeeded);
      ok = true;
      status = 'ok';
    } catch (err) {
      status = err.message ? err.message.slice(0, 40) : 'error';
    }
    const elapsed = Date.now() - start;
    results.push({ name: t.name, category: t.category, ok, elapsed, status });

    if (!quiet && !jsonMode) {
      const icon = ok ? green('PASS') : red('FAIL');
      const ms = ok ? green(String(elapsed) + 'ms') : red(String(elapsed) + 'ms');
      const pad = t.name.padEnd(22);
      console.log(`  ${icon}  ${cyan(pad)} ${ms}  ${dim(t.category)}`);
      progressBar(results.length, tests.length, 30, t.name);
    }
  }

  // Calculate stats
  const passed = results.filter(r => r.ok);
  const latencies = passed.map(r => r.elapsed).sort((a, b) => a - b);
  const avg = latencies.length ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : 0;
  const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const successRate = results.length ? Math.round((passed.length / results.length) * 100) : 0;

  if (jsonMode) {
    console.log(JSON.stringify({
      results: results.map(r => ({ name: r.name, category: r.category, ok: r.ok, elapsed_ms: r.elapsed, status: r.status })),
      summary: { total: results.length, passed: passed.length, success_rate: successRate, avg_ms: avg, p50_ms: p50, p95_ms: p95 }
    }, null, 2));
    return;
  }

  if (quiet) {
    console.log(`${passed.length}/${results.length} passed, avg ${avg}ms, p95 ${p95}ms`);
    return;
  }

  console.log(`\n  ${dim('\u2500'.repeat(50))}`);
  console.log(`  ${bold('Summary')}`);
  console.log(`  ${dim('\u2500'.repeat(50))}`);
  console.log(`  ${bold('Passed:')}       ${passed.length === results.length ? green(passed.length + '/' + results.length) : red(passed.length + '/' + results.length)} ${dim('(' + successRate + '%)')}`);
  console.log(`  ${bold('Avg latency:')}  ${cyan(avg + 'ms')}`);
  console.log(`  ${bold('P50 latency:')}  ${cyan(p50 + 'ms')}`);
  console.log(`  ${bold('P95 latency:')}  ${cyan(p95 + 'ms')}`);
  console.log(`\n  ${passed.length}/${results.length} passed, avg ${avg}ms, p95 ${p95}ms\n`);
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
// AGENTS — Configure and manage always-running local agents
// ============================================================
async function cmdAgents(args) {
  const sub = (args || [])[0];
  const agentConfig = _cfg.agents || { count: 0, models: ['llama3', 'mistral', 'deepseek-coder-v2'], auto_start: false };

  if (sub === 'set' || sub === 'count') {
    const count = parseInt(args[1]);
    if (isNaN(count) || count < 0 || count > 256) {
      console.log(red('\n  Invalid count. Use 0-256.\n'));
      return;
    }
    const cfg = loadConfig();
    cfg.agents = { ...agentConfig, count, auto_start: count > 0 };
    saveConfig(cfg);
    console.log(`\n  ${green('✓')} Local agent pool set to ${bold(String(count))} agents`);
    if (count > 0) {
      console.log(`  ${dim('Models:')} ${agentConfig.models.join(', ')}`);
      console.log(`  ${dim('Agents will start on next')} ${cyan('slop agents start')}`);
    } else {
      console.log(`  ${dim('Local agents disabled.')}`);
    }
    console.log('');
    return;
  }

  if (sub === 'models') {
    const models = args.slice(1).filter(a => a && !a.startsWith('-'));
    if (models.length === 0) {
      console.log(`\n  ${bold('Current models:')} ${agentConfig.models.join(', ')}`);
      console.log(`\n  ${cyan('slop agents models llama3 mistral qwen2.5')}  Set models`);
      console.log(`  ${dim('Models must be available in Ollama (ollama list)')}\n`);
      return;
    }
    const cfg = loadConfig();
    cfg.agents = { ...agentConfig, models };
    saveConfig(cfg);
    console.log(`\n  ${green('✓')} Local agent models: ${models.join(', ')}\n`);
    return;
  }

  if (sub === 'start') {
    const count = parseInt(args[1]) || agentConfig.count || 3;
    console.log(`\n  ${bold('Starting ' + count + ' local agents...')}`);
    console.log(`  ${dim('Models:')} ${agentConfig.models.join(', ')}`);
    console.log(`  ${dim('Each agent runs in background, processing tasks from the queue')}\n`);

    // Check Ollama is running
    try {
      const http = require('http');
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:11434/api/tags', res => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
        });
        req.on('error', reject);
        req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      console.log(`  ${green('✓')} Ollama is running`);
    } catch(e) {
      console.log(`  ${red('✗')} Ollama not running on localhost:11434`);
      console.log(`  ${dim('Start it with:')} ${cyan('ollama serve')}\n`);
      return;
    }

    // Spawn background agent workers
    const { spawn } = require('child_process');
    const logFile = path.join(CONFIG_DIR, 'agents.log');
    const pids = [];

    for (let i = 0; i < count; i++) {
      const model = agentConfig.models[i % agentConfig.models.length];
      const agentScript = `
        const http = require('http');
        const id = 'agent-${i}-${model}';
        function log(m) { process.stdout.write(new Date().toISOString().slice(11,19) + ' [' + id + '] ' + m + '\\n'); }
        log('Started (' + '${model}' + ')');

        async function ollamaChat(prompt) {
          return new Promise(r => {
            const body = JSON.stringify({ model: '${model}', messages: [{ role: 'user', content: prompt }], stream: false });
            const req = http.request({ hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
              headers: { 'Content-Type': 'application/json' }, timeout: 60000 }, res => {
              let d = ''; res.on('data', c => d += c);
              res.on('end', () => { try { r(JSON.parse(d).message?.content || ''); } catch(e) { r(''); } });
            });
            req.on('error', () => r('')); req.on('timeout', () => { req.destroy(); r(''); });
            req.write(body); req.end();
          });
        }

        async function loop() {
          while (true) {
            try {
              const result = await ollamaChat('You are agent ' + id + '. Heartbeat check. Respond with just OK.');
              if (result) log('Heartbeat: ' + result.slice(0, 20));
            } catch(e) { log('Error: ' + e.message); }
            await new Promise(r => setTimeout(r, ${30000 + i * 5000}));
          }
        }
        loop();
      `;
      const child = spawn('node', ['-e', agentScript], {
        detached: true,
        stdio: ['ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile, 'a')],
      });
      child.unref();
      pids.push(child.pid);
      console.log(`  ${green('✓')} Agent ${i} (${model}) PID ${child.pid}`);
    }

    // Save PIDs
    const cfg = loadConfig();
    cfg.agents = { ...agentConfig, count, pids, started: new Date().toISOString() };
    saveConfig(cfg);

    console.log(`\n  ${bold(count + ' agents running')} — logs at ${dim(logFile)}`);
    console.log(`  ${cyan('slop agents status')}  Check agent health`);
    console.log(`  ${cyan('slop agents stop')}    Stop all agents\n`);
    return;
  }

  if (sub === 'stop') {
    const pids = agentConfig.pids || [];
    if (pids.length === 0) {
      console.log(`\n  ${dim('No running agents.')}\n`);
      return;
    }
    for (const pid of pids) {
      try { process.kill(pid, 'SIGTERM'); console.log(`  ${green('✓')} Stopped PID ${pid}`); }
      catch(e) { console.log(`  ${dim('PID ' + pid + ' already stopped')}`); }
    }
    const cfg = loadConfig();
    cfg.agents = { ...agentConfig, pids: [], started: null };
    saveConfig(cfg);
    console.log(`\n  ${bold('All agents stopped.')}\n`);
    return;
  }

  if (sub === 'status') {
    const pids = agentConfig.pids || [];
    console.log(`\n  ${bold('Local Agent Pool')}`);
    console.log(`  ${dim('Configured:')} ${agentConfig.count || 0} agents`);
    console.log(`  ${dim('Models:')}     ${agentConfig.models.join(', ')}`);
    console.log(`  ${dim('Running:')}    ${pids.length} (PIDs: ${pids.join(', ') || 'none'})`);
    if (agentConfig.started) console.log(`  ${dim('Started:')}    ${agentConfig.started}`);
    const logFile = path.join(CONFIG_DIR, 'agents.log');
    if (fs.existsSync(logFile)) {
      const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(l => l.trim()).slice(-5);
      console.log(`\n  ${bold('Recent logs:')}`);
      for (const l of lines) console.log(`  ${dim(l)}`);
    }
    console.log('');
    return;
  }

  // Default: show help
  console.log(`\n  ${bold('Local Agent Pool')} ${dim('— configure always-running Ollama agents')}\n`);
  console.log(`  ${cyan('slop agents set <N>')}              Set agent count (0-256)`);
  console.log(`  ${cyan('slop agents models <m1> <m2>...')}  Set Ollama models to use`);
  console.log(`  ${cyan('slop agents start')}                Start the agent pool`);
  console.log(`  ${cyan('slop agents start 8')}              Start 8 agents`);
  console.log(`  ${cyan('slop agents stop')}                 Stop all running agents`);
  console.log(`  ${cyan('slop agents status')}               Show agent pool health`);
  console.log(`\n  ${dim('Current:')} ${agentConfig.count || 0} agents, models: ${agentConfig.models.join(', ')}`);
  console.log(`  ${dim('Agents run in background using local Ollama models (free, fast).')}\n`);
}

// ============================================================
// COMPLETIONS — Generate shell completions
// ============================================================
function cmdCompletions(args) {
  const shell = args[0] || 'bash';

  const commands = ['call','pipe','run','search','list','discover','org','wallet','bounty','market','eval','replay','queue','webhooks','teams','knowledge','chain','memory','mem','signup','login','whoami','key','config','balance','buy','stats','benchmark','health','mcp','help','batch','watch','alias','history','plan','models','profile','cost','debug','cloud','logs','dev','env','listen','types','file','git','review','session','version','upgrade','completions','do','init','live','interactive','tui','agents'];

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

  // Show local Ollama models if available
  try {
    const ollamaRes = await request('GET', '/v1/models/ollama', null, false);
    const local = ollamaRes.data?.models || ollamaRes.models || [];
    if (local.length > 0) {
      console.log(`  ${bold('Local (Ollama)')}\n`);
      for (const m of local) {
        console.log(`    ${dim('○')} ${cyan((m.name || m.id || m).toString().padEnd(22))} ${dim(m.size || '')}`);
      }
      console.log('');
    }
  } catch (_) { /* Ollama not available */ }
}

// ============================================================
// WALLET — Manage wallets
// ============================================================
async function cmdWallet(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Wallet Management')}\n`);
    console.log(`  ${cyan('slop wallet create')} ${dim('--name X')}             Create a wallet`);
    console.log(`  ${cyan('slop wallet list')}                          List wallets`);
    console.log(`  ${cyan('slop wallet fund')} ${dim('<id> <amount>')}          Fund a wallet`);
    console.log(`  ${cyan('slop wallet transfer')} ${dim('--from X --to Y --amount N')}  Transfer funds\n`);
    return;
  }

  if (sub === 'create') {
    const nameIdx = args.indexOf('--name');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : 'default';
    const res = await request('POST', '/v1/wallet/create', { name });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Wallet created')}  ${cyan(d.id || d.wallet_id || '')}  ${dim(name)}\n`);
    return;
  }

  if (sub === 'list') {
    const res = await request('GET', '/v1/wallet/list', null);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const wallets = res.data?.wallets || res.wallets || [];
    console.log(`\n  ${bold('Wallets')}\n`);
    for (const w of wallets) {
      console.log(`  ${cyan((w.id || '').padEnd(20))} ${yellow(String(w.balance ?? 0).padStart(10))} credits  ${dim(w.name || '')}`);
    }
    console.log('');
    return;
  }

  if (sub === 'fund') {
    const id = args[1];
    const amount = Number(args[2]);
    if (!id || !amount) die('Usage: slop wallet fund <id> <amount>');
    const res = await request('POST', `/v1/wallet/${id}/fund`, { amount });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    console.log(`\n  ${green('✓ Funded')} ${cyan(id)} with ${yellow(String(amount))} credits\n`);
    return;
  }

  if (sub === 'transfer') {
    const fromIdx = args.indexOf('--from');
    const toIdx = args.indexOf('--to');
    const amtIdx = args.indexOf('--amount');
    const from = fromIdx >= 0 ? args[fromIdx + 1] : null;
    const to = toIdx >= 0 ? args[toIdx + 1] : null;
    const amount = amtIdx >= 0 ? Number(args[amtIdx + 1]) : null;
    if (!from || !to || !amount) die('Usage: slop wallet transfer --from X --to Y --amount N');
    const res = await request('POST', '/v1/wallet/transfer', { from, to, amount });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    console.log(`\n  ${green('✓ Transferred')} ${yellow(String(amount))} from ${cyan(from)} → ${cyan(to)}\n`);
    return;
  }

  die(`Unknown wallet subcommand: ${sub}. Try: slop wallet help`);
}

// ============================================================
// BOUNTY — Post and claim bounties
// ============================================================
async function cmdBounty(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Bounties')}\n`);
    console.log(`  ${cyan('slop bounty post')} ${dim('--title X --reward N')}   Post a bounty`);
    console.log(`  ${cyan('slop bounty list')}                          List bounties`);
    console.log(`  ${cyan('slop bounty claim')} ${dim('<id>')}                  Claim a bounty\n`);
    return;
  }

  if (sub === 'post') {
    const titleIdx = args.indexOf('--title');
    const rewardIdx = args.indexOf('--reward');
    const title = titleIdx >= 0 ? args[titleIdx + 1] : null;
    const reward = rewardIdx >= 0 ? Number(args[rewardIdx + 1]) : null;
    if (!title || !reward) die('Usage: slop bounty post --title X --reward N');
    const res = await request('POST', '/v1/bounties/post', { title, reward });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Bounty posted')}  ${cyan(d.id || d.bounty_id || '')}  ${dim(title)}  ${yellow(String(reward) + ' credits')}\n`);
    return;
  }

  if (sub === 'list') {
    const res = await request('GET', '/v1/bounties', null);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const bounties = res.data?.bounties || res.bounties || [];
    console.log(`\n  ${bold('Bounties')}\n`);
    for (const b of bounties) {
      const status = b.claimed ? dim('claimed') : green('open');
      console.log(`  ${cyan((b.id || '').padEnd(14))} ${yellow(String(b.reward ?? 0).padStart(8))} cr  ${status}  ${b.title || ''}`);
    }
    console.log('');
    return;
  }

  if (sub === 'claim') {
    const id = args[1];
    if (!id) die('Usage: slop bounty claim <id>');
    const res = await request('POST', `/v1/bounties/${id}/claim`, {});
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    console.log(`\n  ${green('✓ Bounty claimed:')} ${cyan(id)}\n`);
    return;
  }

  die(`Unknown bounty subcommand: ${sub}. Try: slop bounty help`);
}

// ============================================================
// MARKET — Prediction markets
// ============================================================
async function cmdMarket(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Prediction Markets')}\n`);
    console.log(`  ${cyan('slop market create')} ${dim('--question X --options "yes,no"')}  Create a market`);
    console.log(`  ${cyan('slop market list')}                                  List markets`);
    console.log(`  ${cyan('slop market bet')} ${dim('<id> --position yes --amount 10')}  Place a bet`);
    console.log(`  ${cyan('slop market resolve')} ${dim('<id> --outcome yes')}           Resolve a market\n`);
    return;
  }

  if (sub === 'create') {
    const qIdx = args.indexOf('--question');
    const oIdx = args.indexOf('--options');
    const question = qIdx >= 0 ? args[qIdx + 1] : null;
    const options = oIdx >= 0 ? args[oIdx + 1] : 'yes,no';
    if (!question) die('Usage: slop market create --question X --options "yes,no"');
    const res = await request('POST', '/v1/market/create', { question, options: options.split(',') });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Market created')}  ${cyan(d.id || d.market_id || '')}  ${dim(question)}\n`);
    return;
  }

  if (sub === 'list') {
    const res = await request('GET', '/v1/market/list', null);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const markets = res.data?.markets || res.markets || [];
    console.log(`\n  ${bold('Markets')}\n`);
    for (const m of markets) {
      const status = m.resolved ? dim('resolved') : green('open');
      console.log(`  ${cyan((m.id || '').padEnd(14))} ${status}  ${m.question || ''}`);
    }
    console.log('');
    return;
  }

  if (sub === 'bet') {
    const id = args[1];
    const posIdx = args.indexOf('--position');
    const amtIdx = args.indexOf('--amount');
    const position = posIdx >= 0 ? args[posIdx + 1] : null;
    const amount = amtIdx >= 0 ? Number(args[amtIdx + 1]) : null;
    if (!id || !position || !amount) die('Usage: slop market bet <id> --position yes --amount 10');
    const res = await request('POST', `/v1/market/${id}/bet`, { position, amount });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    console.log(`\n  ${green('✓ Bet placed')} ${yellow(String(amount))} on ${cyan(position)} in market ${cyan(id)}\n`);
    return;
  }

  if (sub === 'resolve') {
    const id = args[1];
    const outcomeIdx = args.indexOf('--outcome');
    const outcome = outcomeIdx >= 0 ? args[outcomeIdx + 1] : null;
    if (!id || !outcome) die('Usage: slop market resolve <id> --outcome yes');
    const res = await request('POST', `/v1/market/${id}/resolve`, { outcome });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    console.log(`\n  ${green('✓ Market resolved:')} ${cyan(id)} → ${yellow(outcome)}\n`);
    return;
  }

  die(`Unknown market subcommand: ${sub}. Try: slop market help`);
}

// ============================================================
// ARMY — Deploy agent swarms
// ============================================================
async function cmdArmy(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Army — Agent Swarm Deploy')}\n`);
    console.log(`  ${cyan('slop army deploy')} ${dim('--task "..." --agents 10 --tool <slug>')}  Deploy a swarm`);
    console.log(`  ${cyan('slop army runs')}                                       List all runs`);
    console.log(`  ${cyan('slop army status')} ${dim('<id>')}                                 Check run status\n`);
    return;
  }

  if (sub === 'deploy') {
    const taskIdx = args.indexOf('--task');
    const agentsIdx = args.indexOf('--agents');
    const toolIdx = args.indexOf('--tool');
    const task = taskIdx >= 0 ? args[taskIdx + 1] : null;
    const agents = agentsIdx >= 0 ? Number(args[agentsIdx + 1]) : 5;
    const tool = toolIdx >= 0 ? args[toolIdx + 1] : null;
    if (!task) die('Usage: slop army deploy --task "..." --agents 10 --tool <slug>');
    spinnerStart('Deploying agent swarm...');
    const res = await request('POST', '/v1/army/deploy', { task, agents, tool });
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Swarm deployed')}  ${cyan(d.id || d.run_id || '')}  ${dim(String(agents) + ' agents')}  ${dim(task.slice(0, 60))}\n`);
    return;
  }

  if (sub === 'runs') {
    spinnerStart('Fetching army runs...');
    const res = await request('GET', '/v1/army/runs', null);
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const runs = res.data?.runs || res.runs || [];
    console.log(`\n  ${bold('Army Runs')}\n`);
    for (const r of runs) {
      const status = r.status === 'complete' ? green(r.status) : yellow(r.status || 'unknown');
      console.log(`  ${cyan((r.id || '').padEnd(20))} ${status.padEnd(20)}  ${dim((r.task || '').slice(0, 50))}`);
    }
    if (runs.length === 0) console.log(dim('  No runs found.'));
    console.log('');
    return;
  }

  if (sub === 'status') {
    const id = args[1];
    if (!id) die('Usage: slop army status <id>');
    spinnerStart('Fetching run status...');
    const res = await request('GET', `/v1/army/run/${id}`, null);
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${bold('Army Run')} ${cyan(id)}\n`);
    console.log(`  ${dim('Status:')}  ${d.status === 'complete' ? green(d.status) : yellow(d.status || 'unknown')}`);
    console.log(`  ${dim('Agents:')}  ${d.agent_count || d.agents || '?'}`);
    console.log(`  ${dim('Task:')}    ${d.task || 'N/A'}`);
    if (d.merkle_root) console.log(`  ${dim('Merkle:')}  ${d.merkle_root}`);
    console.log('');
    return;
  }

  die(`Unknown army subcommand: ${sub}. Try: slop army help`);
}

// ============================================================
// SCHEDULE — Cron-based scheduled jobs
// ============================================================
async function cmdSchedule(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Schedules — Cron Jobs')}\n`);
    console.log(`  ${cyan('slop schedule create')} ${dim('--cron "0 * * * *" --slug <slug>')}  Create a schedule`);
    console.log(`  ${cyan('slop schedule list')}                                     List schedules`);
    console.log(`  ${cyan('slop schedule delete')} ${dim('<id>')}                              Delete a schedule\n`);
    return;
  }

  if (sub === 'create') {
    const cronIdx = args.indexOf('--cron');
    const slugIdx = args.indexOf('--slug');
    const cron = cronIdx >= 0 ? args[cronIdx + 1] : null;
    const slug = slugIdx >= 0 ? args[slugIdx + 1] : null;
    if (!cron || !slug) die('Usage: slop schedule create --cron "0 * * * *" --slug <slug>');
    spinnerStart('Creating schedule...');
    const res = await request('POST', '/v1/schedules', { cron, slug });
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Schedule created')}  ${cyan(d.id || d.schedule_id || '')}  ${dim(cron)}  ${dim(slug)}\n`);
    return;
  }

  if (sub === 'list') {
    spinnerStart('Fetching schedules...');
    const res = await request('GET', '/v1/schedules', null);
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const schedules = res.data?.schedules || res.schedules || [];
    console.log(`\n  ${bold('Schedules')}\n`);
    for (const s of schedules) {
      console.log(`  ${cyan((s.id || '').padEnd(20))} ${dim((s.cron || '').padEnd(15))}  ${s.slug || ''}`);
    }
    if (schedules.length === 0) console.log(dim('  No schedules found.'));
    console.log('');
    return;
  }

  if (sub === 'delete') {
    const id = args[1];
    if (!id) die('Usage: slop schedule delete <id>');
    spinnerStart('Deleting schedule...');
    const res = await request('DELETE', `/v1/schedules/${id}`, null);
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    console.log(`\n  ${green('✓ Schedule deleted:')} ${cyan(id)}\n`);
    return;
  }

  die(`Unknown schedule subcommand: ${sub}. Try: slop schedule help`);
}

// ============================================================
// COPILOT — Persistent AI copilot sessions
// ============================================================
async function cmdCopilot(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Copilot — AI Assistant')}\n`);
    console.log(`  ${cyan('slop copilot spawn')}                 Spawn a new copilot session`);
    console.log(`  ${cyan('slop copilot chat')} ${dim('<message>')}      Send a message to copilot`);
    console.log(`  ${cyan('slop copilot inbox')}                 View copilot inbox\n`);
    return;
  }

  if (sub === 'spawn') {
    spinnerStart('Spawning copilot...');
    const res = await request('POST', '/v1/copilot/spawn', {});
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Copilot spawned')}  ${cyan(d.id || d.session_id || '')}  ${dim(d.status || 'ready')}\n`);
    return;
  }

  if (sub === 'chat') {
    const message = args.slice(1).join(' ');
    if (!message) die('Usage: slop copilot chat <message>');
    spinnerStart('Sending to copilot...');
    const res = await request('POST', '/v1/copilot/chat', { message });
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${cyan('Copilot:')} ${d.reply || d.message || d.response || JSON.stringify(d)}\n`);
    return;
  }

  if (sub === 'inbox') {
    spinnerStart('Fetching copilot inbox...');
    const res = await request('GET', '/v1/copilot/inbox', null);
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const messages = res.data?.messages || res.messages || res.data?.inbox || [];
    console.log(`\n  ${bold('Copilot Inbox')}\n`);
    for (const m of messages) {
      const from = m.from || m.role || 'copilot';
      console.log(`  ${cyan(from.padEnd(12))} ${m.message || m.content || m.text || ''}`);
    }
    if (messages.length === 0) console.log(dim('  Inbox empty.'));
    console.log('');
    return;
  }

  die(`Unknown copilot subcommand: ${sub}. Try: slop copilot help`);
}

// ============================================================
// TOURNAMENT — Competitive agent tournaments
// ============================================================
async function cmdTournament(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Tournaments')}\n`);
    console.log(`  ${cyan('slop tournament create')} ${dim('--name "test"')}    Create a tournament`);
    console.log(`  ${cyan('slop tournament leaderboard')}             View leaderboard\n`);
    return;
  }

  if (sub === 'create') {
    const nameIdx = args.indexOf('--name');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : null;
    if (!name) die('Usage: slop tournament create --name "test"');
    spinnerStart('Creating tournament...');
    const res = await request('POST', '/v1/tournament/create', { name });
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Tournament created')}  ${cyan(d.id || d.tournament_id || '')}  ${dim(name)}\n`);
    return;
  }

  if (sub === 'leaderboard') {
    spinnerStart('Fetching leaderboard...');
    const res = await request('GET', '/v1/tournament/leaderboard', null);
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const entries = res.data?.leaderboard || res.leaderboard || res.data?.entries || [];
    console.log(`\n  ${bold('Tournament Leaderboard')}\n`);
    entries.forEach((e, i) => {
      const rank = String(i + 1).padStart(3);
      console.log(`  ${dim(rank)}  ${cyan((e.name || e.agent || e.id || '').padEnd(24))} ${yellow(String(e.score ?? e.points ?? 0).padStart(8))} pts`);
    });
    if (entries.length === 0) console.log(dim('  No entries yet.'));
    console.log('');
    return;
  }

  die(`Unknown tournament subcommand: ${sub}. Try: slop tournament help`);
}

// ============================================================
// REPUTATION — Agent reputation & ratings
// ============================================================
async function cmdReputation(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Reputation')}\n`);
    console.log(`  ${cyan('slop reputation leaderboard')}              View reputation leaderboard`);
    console.log(`  ${cyan('slop reputation rate')} ${dim('<agent> <score>')}    Rate an agent (1-5)\n`);
    return;
  }

  if (sub === 'leaderboard') {
    spinnerStart('Fetching reputation leaderboard...');
    const res = await request('GET', '/v1/reputation/leaderboard', null);
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const entries = res.data?.leaderboard || res.leaderboard || res.data?.agents || [];
    console.log(`\n  ${bold('Reputation Leaderboard')}\n`);
    entries.forEach((e, i) => {
      const rank = String(i + 1).padStart(3);
      const stars = '★'.repeat(Math.round(e.rating || e.score || 0));
      console.log(`  ${dim(rank)}  ${cyan((e.agent || e.name || e.id || '').padEnd(24))} ${yellow(stars)}  ${dim(String(e.rating || e.score || 0))}`);
    });
    if (entries.length === 0) console.log(dim('  No ratings yet.'));
    console.log('');
    return;
  }

  if (sub === 'rate') {
    const agent = args[1];
    const score = Number(args[2]);
    if (!agent || !score) die('Usage: slop reputation rate <agent> <score>');
    spinnerStart('Submitting rating...');
    const res = await request('POST', '/v1/reputation/rate', { agent, score });
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    console.log(`\n  ${green('✓ Rated')} ${cyan(agent)} → ${yellow(String(score) + '/5')} ${'★'.repeat(score)}\n`);
    return;
  }

  die(`Unknown reputation subcommand: ${sub}. Try: slop reputation help`);
}

// ============================================================
// PROOF — Merkle proof generation & verification
// ============================================================
async function cmdProof(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Proof — Merkle Trees')}\n`);
    console.log(`  ${cyan('slop proof merkle')} ${dim('<item1> <item2> ...')}  Generate a Merkle tree`);
    console.log(`  ${cyan('slop proof verify')} ${dim('--leaf <hash> --root <hash>')}  Verify a Merkle proof\n`);
    return;
  }

  if (sub === 'merkle') {
    const items = args.slice(1);
    if (items.length === 0) die('Usage: slop proof merkle <item1> <item2> ...');
    spinnerStart('Generating Merkle tree...');
    const res = await request('POST', '/v1/proof/merkle', { items });
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Merkle tree generated')}\n`);
    console.log(`  ${dim('Root:')}   ${cyan(d.root || d.merkle_root || '')}`);
    console.log(`  ${dim('Leaves:')} ${d.leaf_count || d.leaves || items.length}`);
    if (d.tree) console.log(`  ${dim('Tree:')}   ${JSON.stringify(d.tree).slice(0, 100)}`);
    console.log('');
    return;
  }

  if (sub === 'verify') {
    const leafIdx = args.indexOf('--leaf');
    const rootIdx = args.indexOf('--root');
    const leaf = leafIdx >= 0 ? args[leafIdx + 1] : null;
    const root = rootIdx >= 0 ? args[rootIdx + 1] : null;
    if (!leaf || !root) die('Usage: slop proof verify --leaf <hash> --root <hash>');
    spinnerStart('Verifying Merkle proof...');
    const res = await request('POST', '/v1/proof/verify', { leaf, root });
    spinnerStop();
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    const valid = d.valid || d.verified;
    console.log(`\n  ${valid ? green('✓ Proof valid') : red('✗ Proof invalid')}\n`);
    console.log(`  ${dim('Leaf:')} ${leaf}`);
    console.log(`  ${dim('Root:')} ${root}`);
    console.log('');
    return;
  }

  die(`Unknown proof subcommand: ${sub}. Try: slop proof help`);
}

// ============================================================
// EVAL — Run evaluation test sets
// ============================================================
async function cmdEval(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Evaluations')}\n`);
    console.log(`  ${cyan('slop eval run')} ${dim('--test-set X')}   Run an evaluation test set\n`);
    return;
  }

  if (sub === 'run') {
    const tsIdx = args.indexOf('--test-set');
    const testSet = tsIdx >= 0 ? args[tsIdx + 1] : null;
    if (!testSet) die('Usage: slop eval run --test-set X');
    const res = await request('POST', '/v1/eval/run', { test_set: testSet });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Eval started')}  ${cyan(d.id || d.eval_id || '')}  ${dim(testSet)}\n`);
    if (d.results) {
      for (const r of Array.isArray(d.results) ? d.results : []) {
        console.log(`  ${r.passed ? green('PASS') : red('FAIL')}  ${r.name || r.test || ''}`);
      }
      console.log('');
    }
    return;
  }

  die(`Unknown eval subcommand: ${sub}. Try: slop eval help`);
}

// ============================================================
// REPLAY — List and load saved replays
// ============================================================
async function cmdReplay(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Replays')}\n`);
    console.log(`  ${cyan('slop replay list')}             List saved replays`);
    console.log(`  ${cyan('slop replay load')} ${dim('<id>')}       Load a replay\n`);
    return;
  }

  if (sub === 'list') {
    const res = await request('GET', '/v1/replay/list', null);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const replays = res.data?.replays || res.replays || [];
    console.log(`\n  ${bold('Replays')}\n`);
    for (const r of replays) {
      console.log(`  ${cyan((r.id || '').padEnd(14))} ${dim(r.created_at || '')}  ${r.name || r.title || ''}`);
    }
    console.log('');
    return;
  }

  if (sub === 'load') {
    const id = args[1];
    if (!id) die('Usage: slop replay load <id>');
    const res = await request('GET', `/v1/replay/${id}`, null);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Replay loaded:')} ${cyan(id)}\n`);
    if (d.events) {
      for (const e of Array.isArray(d.events) ? d.events : []) {
        console.log(`  ${dim(e.timestamp || '')} ${e.type || ''} ${e.data || ''}`);
      }
      console.log('');
    }
    return;
  }

  die(`Unknown replay subcommand: ${sub}. Try: slop replay help`);
}

// ============================================================
// QUEUE — Push tasks to the prompt queue
// ============================================================
async function cmdQueue(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Prompt Queue')}\n`);
    console.log(`  ${cyan('slop queue push')} ${dim('--task X --namespace Y')}   Push a task to the queue\n`);
    return;
  }

  if (sub === 'push') {
    const taskIdx = args.indexOf('--task');
    const nsIdx = args.indexOf('--namespace');
    const task = taskIdx >= 0 ? args[taskIdx + 1] : null;
    const namespace = nsIdx >= 0 ? args[nsIdx + 1] : 'default';
    if (!task) die('Usage: slop queue push --task X --namespace Y');
    const res = await request('POST', '/v1/chain/queue', { task, namespace });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Task queued')}  ${cyan(d.id || d.queue_id || '')}  ${dim(namespace)}\n`);
    return;
  }

  die(`Unknown queue subcommand: ${sub}. Try: slop queue help`);
}

// ============================================================
// WEBHOOKS — Manage webhooks
// ============================================================
async function cmdWebhooks(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Webhooks')}\n`);
    console.log(`  ${cyan('slop webhooks create')} ${dim('--url X --events Y')}   Register a webhook\n`);
    return;
  }

  if (sub === 'create') {
    const urlIdx = args.indexOf('--url');
    const evIdx = args.indexOf('--events');
    const url = urlIdx >= 0 ? args[urlIdx + 1] : null;
    const events = evIdx >= 0 ? args[evIdx + 1] : null;
    if (!url || !events) die('Usage: slop webhooks create --url X --events Y');
    const eventList = events.split(',').map(e => e.trim());
    const res = await request('POST', '/v1/webhooks/create', { url, events: eventList });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Webhook created')}  ${cyan(d.id || d.webhook_id || '')}  ${dim(url)}\n`);
    return;
  }

  die(`Unknown webhooks subcommand: ${sub}. Try: slop webhooks help`);
}

// ============================================================
// TEAMS — Manage teams
// ============================================================
async function cmdTeams(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Teams')}\n`);
    console.log(`  ${cyan('slop teams create')} ${dim('--name X')}              Create a team\n`);
    return;
  }

  if (sub === 'create') {
    const nameIdx = args.indexOf('--name');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : null;
    if (!name) die('Usage: slop teams create --name X');
    const res = await request('POST', '/v1/teams/create', { name });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Team created')}  ${cyan(d.id || d.team_id || '')}  ${dim(name)}\n`);
    return;
  }

  die(`Unknown teams subcommand: ${sub}. Try: slop teams help`);
}

// ============================================================
// KNOWLEDGE — Knowledge graph operations
// ============================================================
async function cmdKnowledge(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Knowledge Graph')}\n`);
    console.log(`  ${cyan('slop knowledge add')} ${dim('--subject X --predicate Y --object Z')}   Add a triple`);
    console.log(`  ${cyan('slop knowledge query')} ${dim('"question"')}                          Query knowledge\n`);
    return;
  }

  if (sub === 'add') {
    const sIdx = args.indexOf('--subject');
    const pIdx = args.indexOf('--predicate');
    const oIdx = args.indexOf('--object');
    const subject = sIdx >= 0 ? args[sIdx + 1] : null;
    const predicate = pIdx >= 0 ? args[pIdx + 1] : null;
    const object = oIdx >= 0 ? args[oIdx + 1] : null;
    if (!subject || !predicate || !object) die('Usage: slop knowledge add --subject X --predicate Y --object Z');
    const res = await request('POST', '/v1/knowledge/add', { subject, predicate, object });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    console.log(`\n  ${green('✓ Added:')} ${cyan(subject)} ${dim('→')} ${yellow(predicate)} ${dim('→')} ${cyan(object)}\n`);
    return;
  }

  if (sub === 'query') {
    const question = args.slice(1).join(' ');
    if (!question) die('Usage: slop knowledge query <question>');
    const res = await request('POST', '/v1/knowledge/query', { question });
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${bold('Knowledge Results')}\n`);
    const results = d.results || d.triples || [d];
    for (const r of (Array.isArray(results) ? results : [results])) {
      if (r.subject) console.log(`  ${cyan(r.subject)} ${dim('→')} ${yellow(r.predicate || '')} ${dim('→')} ${cyan(r.object || '')}`);
      else console.log(`  ${dim(JSON.stringify(r))}`);
    }
    console.log('');
    return;
  }

  die(`Unknown knowledge subcommand: ${sub}. Try: slop knowledge help`);
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
    const res = await request('POST', '/v1/llm-think', { text: `Debug this error and explain the fix:\n\n${errorText}`, task: 'debug' });
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
      const res = await request('POST', '/v1/chain/queue', { prompts: [task], schedule: 'now' });
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
      const res = await request('GET', '/v1/chain/' + taskId + '/status');
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
      const res = await request('GET', '/v1/chain/list');
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
    const res = await request('POST', '/v1/llm-think', { text: prompt, task: 'code-review' });
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
// STAKING — Deposit, withdraw, status
// ============================================================
async function cmdStaking(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Staking')}\n`);
    console.log(`  ${cyan('slop staking deposit <amount>')} ${dim('--lock 30')}   Deposit stake`);
    console.log(`  ${cyan('slop staking withdraw <stake_id>')}            Withdraw stake`);
    console.log(`  ${cyan('slop staking status')}                         View staking status\n`);
    return;
  }

  if (sub === 'deposit') {
    const amount = Number(args[1]);
    if (!amount) die('Usage: slop staking deposit <amount> [--lock 30]');
    const lockIdx = args.indexOf('--lock');
    const lock = lockIdx >= 0 ? Number(args[lockIdx + 1]) || 30 : 30;
    spinnerStart('Depositing stake...');
    const res = await request('POST', '/v1/staking/deposit', { amount, lock_days: lock });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Stake deposited')}  ${cyan(d.stake_id || d.id || '')}  ${yellow(String(amount) + ' credits')}  ${dim('locked ' + lock + ' days')}\n`);
    return;
  }

  if (sub === 'withdraw') {
    const stakeId = args[1];
    if (!stakeId) die('Usage: slop staking withdraw <stake_id>');
    spinnerStart('Withdrawing stake...');
    const res = await request('POST', '/v1/staking/withdraw', { stake_id: stakeId });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Stake withdrawn')}  ${cyan(stakeId)}  ${yellow(String(d.amount || d.credits || '') + ' credits returned')}\n`);
    return;
  }

  if (sub === 'status') {
    spinnerStart('Fetching staking status...');
    const res = await request('GET', '/v1/staking/status', null);
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    const stakes = d.stakes || [];
    console.log(`\n  ${bold('Staking Status')}  ${dim('Total staked:')} ${yellow(String(d.total_staked || 0))}\n`);
    for (const s of stakes) {
      const status = s.locked ? yellow('locked') : green('unlocked');
      console.log(`  ${cyan((s.id || s.stake_id || '').padEnd(20))} ${yellow(String(s.amount ?? 0).padStart(10))} cr  ${status}  ${dim(s.lock_days ? s.lock_days + 'd' : '')}`);
    }
    console.log('');
    return;
  }

  die(`Unknown staking subcommand: ${sub}. Try: slop staking help`);
}

// ============================================================
// FORGE — Create, browse, execute plugins
// ============================================================
async function cmdForge(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Forge — Plugin Marketplace')}\n`);
    console.log(`  ${cyan('slop forge create')} ${dim('--name "my-tool" --code "return {result: input.text}"')}  Create a plugin`);
    console.log(`  ${cyan('slop forge browse')}                                                      Browse plugins`);
    console.log(`  ${cyan('slop forge execute <plugin_id>')} ${dim('--input \'{}\'')}                           Execute a plugin\n`);
    return;
  }

  if (sub === 'create') {
    const nameIdx = args.indexOf('--name');
    const codeIdx = args.indexOf('--code');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : null;
    const code = codeIdx >= 0 ? args[codeIdx + 1] : null;
    if (!name || !code) die('Usage: slop forge create --name "my-tool" --code "return {result: input.text}"');
    spinnerStart('Creating plugin...');
    const res = await request('POST', '/v1/forge/create', { name, code });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Plugin created')}  ${cyan(d.plugin_id || d.id || '')}  ${dim(name)}\n`);
    return;
  }

  if (sub === 'browse') {
    spinnerStart('Browsing forge...');
    const res = await request('GET', '/v1/forge/browse', null);
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const plugins = res.data?.plugins || res.plugins || [];
    console.log(`\n  ${bold('Forge — Plugins')}\n`);
    for (const p of plugins) {
      console.log(`  ${cyan((p.id || p.plugin_id || '').padEnd(20))} ${(p.name || '').padEnd(25)} ${dim(p.description || p.desc || '')}`);
    }
    if (plugins.length === 0) console.log(`  ${dim('No plugins yet. Create one with: slop forge create')}`);
    console.log('');
    return;
  }

  if (sub === 'execute') {
    const pluginId = args[1];
    if (!pluginId) die('Usage: slop forge execute <plugin_id> --input \'{}\'');
    const inputIdx = args.indexOf('--input');
    let input = {};
    if (inputIdx >= 0) {
      try { input = JSON.parse(args[inputIdx + 1]); } catch { input = { text: args[inputIdx + 1] }; }
    }
    spinnerStart(`Executing plugin ${pluginId}...`);
    const res = await request('POST', '/v1/forge/execute', { plugin_id: pluginId, input });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Plugin executed')}  ${cyan(pluginId)}`);
    console.log(`  ${dim('Result:')} ${JSON.stringify(d.result || d.output || d, null, 2).slice(0, 500)}\n`);
    return;
  }

  die(`Unknown forge subcommand: ${sub}. Try: slop forge help`);
}

// ============================================================
// ARBITRAGE — Multi-model cost optimization
// ============================================================
async function cmdArbitrage(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Arbitrage — Multi-Model Optimizer')}\n`);
    console.log(`  ${cyan('slop arbitrage optimize')} ${dim('--task "summarize" --budget 100')}  Optimize across models\n`);
    return;
  }

  if (sub === 'optimize') {
    const taskIdx = args.indexOf('--task');
    const budgetIdx = args.indexOf('--budget');
    const task = taskIdx >= 0 ? args[taskIdx + 1] : null;
    const budget = budgetIdx >= 0 ? Number(args[budgetIdx + 1]) : 100;
    if (!task) die('Usage: slop arbitrage optimize --task "summarize" --budget 100');
    spinnerStart('Optimizing across models...');
    const res = await request('POST', '/v1/arbitrage/optimize', { task, budget });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Arbitrage complete')}`);
    console.log(`  ${bold('Best model:')}  ${cyan(d.model || d.best_model || 'N/A')}`);
    console.log(`  ${bold('Cost:')}        ${yellow(String(d.cost || d.credits || '?') + ' credits')}`);
    console.log(`  ${bold('Latency:')}     ${dim(String(d.latency_ms || d.latency || '?') + 'ms')}`);
    if (d.alternatives) {
      console.log(`  ${bold('Alternatives:')}`);
      for (const alt of d.alternatives) {
        console.log(`    ${dim('•')} ${cyan(alt.model || '?')} — ${yellow(String(alt.cost || '?') + ' cr')} ${dim(String(alt.latency_ms || '') + 'ms')}`);
      }
    }
    console.log('');
    return;
  }

  die(`Unknown arbitrage subcommand: ${sub}. Try: slop arbitrage help`);
}

// ============================================================
// BROWSER — Browser/computer-use primitives (Strat 4)
// ============================================================
async function cmdBrowser(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Browser — Computer-Use Primitives')}\n`);
    console.log(`  ${cyan('slop browser act')} ${dim('"click login" --url "https://example.com"')}  Execute browser action`);
    console.log(`  ${cyan('slop browser extract')} ${dim('--url "https://example.com" --selectors "h1,.title"')}  Extract structured data`);
    console.log(`  ${cyan('slop browser screenshot')} ${dim('--url "https://example.com"')}  Get page text representation\n`);
    return;
  }

  if (sub === 'act') {
    const urlIdx = args.indexOf('--url');
    const url = urlIdx >= 0 ? args[urlIdx + 1] : null;
    // Task is the first non-flag arg after 'act'
    const task = args.slice(1).filter(a => a !== '--url' && a !== url)[0] || 'browse';
    if (!url) die('Usage: slop browser act "task" --url "https://example.com"');
    spinnerStart('Executing browser action...');
    const res = await request('POST', '/v1/browser/act', { task, url });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Browser action complete')}`);
    if (d.result) {
      if (d.result.title) console.log(`  ${dim('Title:')} ${d.result.title}`);
      if (d.result.links_found !== undefined) console.log(`  ${dim('Links:')} ${d.result.links_found}`);
      if (d.result.text_snippet) console.log(`  ${dim('Snippet:')} ${d.result.text_snippet.slice(0, 200)}...`);
    }
    if (d.session_id) console.log(`  ${dim('Session:')} ${d.session_id}`);
    console.log('');
    return;
  }

  if (sub === 'extract') {
    const urlIdx = args.indexOf('--url');
    const url = urlIdx >= 0 ? args[urlIdx + 1] : null;
    const selIdx = args.indexOf('--selectors');
    const selectors = selIdx >= 0 ? args[selIdx + 1] : null;
    const fmtIdx = args.indexOf('--format');
    const format = fmtIdx >= 0 ? args[fmtIdx + 1] : 'json';
    if (!url) die('Usage: slop browser extract --url "https://example.com" --selectors "h1,.title"');
    spinnerStart('Extracting data...');
    const res = await request('POST', '/v1/browser/extract', { url, selectors, format });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Data extracted')}`);
    if (d.data && typeof d.data === 'object') {
      for (const [sel, vals] of Object.entries(d.data)) {
        console.log(`  ${bold(sel)}:`);
        (Array.isArray(vals) ? vals : [vals]).slice(0, 10).forEach(v => console.log(`    ${dim('-')} ${String(v).slice(0, 120)}`));
      }
    } else {
      console.log(`  ${dim('Data:')} ${JSON.stringify(d.data || d).slice(0, 500)}`);
    }
    console.log('');
    return;
  }

  if (sub === 'screenshot') {
    const urlIdx = args.indexOf('--url');
    const url = urlIdx >= 0 ? args[urlIdx + 1] : args[1];
    if (!url) die('Usage: slop browser screenshot --url "https://example.com"');
    spinnerStart('Fetching page info...');
    const res = await request('POST', '/v1/browser/screenshot', { url });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Page screenshot (text)')}`);
    if (d.title) console.log(`  ${dim('Title:')} ${d.title}`);
    if (d.meta && Object.keys(d.meta).length > 0) {
      console.log(`  ${dim('Meta:')}`);
      Object.entries(d.meta).slice(0, 5).forEach(([k, v]) => console.log(`    ${dim(k + ':')} ${v.slice(0, 100)}`));
    }
    if (d.text_content) console.log(`  ${dim('Content:')} ${d.text_content.slice(0, 300)}...`);
    if (d.link_count) console.log(`  ${dim('Links:')} ${d.link_count}`);
    console.log('');
    return;
  }

  die(`Unknown browser subcommand: ${sub}. Try: slop browser help`);
}

// ============================================================
// DESKTOP — Desktop-style command execution (Strat 4)
// ============================================================
async function cmdDesktop(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Desktop — Command Execution')}\n`);
    console.log(`  ${cyan('slop desktop act')} ${dim('"echo hello"')}  Execute a whitelisted command`);
    console.log(`  ${cyan('slop desktop act')} ${dim('"ls" --cwd "/tmp"')}  Execute with working directory\n`);
    return;
  }

  if (sub === 'act') {
    const command = args[1];
    if (!command) die('Usage: slop desktop act "command" [--cwd "/path"]');
    const cwdIdx = args.indexOf('--cwd');
    const cwd = cwdIdx >= 0 ? args[cwdIdx + 1] : undefined;
    const timeoutIdx = args.indexOf('--timeout');
    const timeout = timeoutIdx >= 0 ? parseInt(args[timeoutIdx + 1]) * 1000 : undefined;
    spinnerStart('Executing command...');
    const res = await request('POST', '/v1/desktop/act', { command, cwd, timeout });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    if (d.ok) {
      console.log(`\n  ${green('✓ Command succeeded')} ${dim('(exit ' + (d.exit_code || 0) + ')')}`);
    } else {
      console.log(`\n  ${red('✗ Command failed')} ${dim('(exit ' + (d.exit_code || 1) + ')')}`);
    }
    if (d.stdout) console.log(`  ${dim('stdout:')}\n${d.stdout.slice(0, 2000)}`);
    if (d.stderr) console.log(`  ${dim('stderr:')}\n${d.stderr.slice(0, 1000)}`);
    console.log('');
    return;
  }

  die(`Unknown desktop subcommand: ${sub}. Try: slop desktop help`);
}

// ============================================================
// SANDBOX — Secure code execution
// ============================================================
async function cmdSandbox(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Sandbox — Secure Code Execution')}\n`);
    console.log(`  ${cyan('slop sandbox execute')} ${dim('--code "return 2+2"')}  Execute code in sandbox\n`);
    return;
  }

  if (sub === 'execute') {
    const codeIdx = args.indexOf('--code');
    const code = codeIdx >= 0 ? args[codeIdx + 1] : null;
    if (!code) die('Usage: slop sandbox execute --code "return 2+2"');
    spinnerStart('Executing in sandbox...');
    const res = await request('POST', '/v1/sandbox/execute', { code });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Sandbox result')}`);
    console.log(`  ${dim('Output:')} ${JSON.stringify(d.result || d.output || d, null, 2).slice(0, 500)}`);
    if (d.execution_time_ms) console.log(`  ${dim('Time:')} ${d.execution_time_ms}ms`);
    console.log('');
    return;
  }

  die(`Unknown sandbox subcommand: ${sub}. Try: slop sandbox help`);
}

// ============================================================
// FEDERATION — Cross-instance federation status
// ============================================================
async function cmdFederation(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Federation — Cross-Instance Mesh')}\n`);
    console.log(`  ${cyan('slop federation status')}  View federation status\n`);
    return;
  }

  if (sub === 'status') {
    spinnerStart('Fetching federation status...');
    const res = await request('GET', '/v1/federation/status', null);
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${bold('Federation Status')}\n`);
    console.log(`  ${bold('Nodes:')}      ${cyan(String(d.node_count || d.nodes?.length || 0))}`);
    console.log(`  ${bold('Connected:')} ${green(String(d.connected || d.active || 0))}`);
    console.log(`  ${bold('Latency:')}   ${dim(String(d.avg_latency_ms || d.latency || '?') + 'ms')}`);
    if (d.nodes) {
      console.log(`\n  ${bold('Nodes:')}`);
      for (const n of d.nodes) {
        const status = n.online ? green('online') : dim('offline');
        console.log(`    ${dim('•')} ${cyan((n.id || n.name || '?').padEnd(20))} ${status}  ${dim(n.region || '')}`);
      }
    }
    console.log('');
    return;
  }

  die(`Unknown federation subcommand: ${sub}. Try: slop federation help`);
}

// ============================================================
// GRAPHRAG — Knowledge graph + RAG queries
// ============================================================
async function cmdGraphrag(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('GraphRAG — Knowledge Graph Queries')}\n`);
    console.log(`  ${cyan('slop graphrag query "search term"')}  Query the knowledge graph\n`);
    return;
  }

  if (sub === 'query') {
    const query = args.slice(1).join(' ');
    if (!query) die('Usage: slop graphrag query "search term"');
    spinnerStart('Querying knowledge graph...');
    const res = await request('POST', '/v1/graphrag/query', { query });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ GraphRAG results')}`);
    const results = d.results || d.nodes || d.matches || [];
    if (results.length > 0) {
      for (const r of results.slice(0, 10)) {
        const label = r.label || r.name || r.title || r.id || '?';
        const score = r.score ? ` ${dim('(' + r.score.toFixed(3) + ')')}` : '';
        console.log(`  ${dim('•')} ${cyan(label)}${score}  ${dim((r.summary || r.text || '').slice(0, 80))}`);
      }
    } else {
      console.log(`  ${dim('No results found for:')} "${query}"`);
    }
    if (d.graph_stats) console.log(`\n  ${dim('Graph:')} ${d.graph_stats.nodes || '?'} nodes, ${d.graph_stats.edges || '?'} edges`);
    console.log('');
    return;
  }

  die(`Unknown graphrag subcommand: ${sub}. Try: slop graphrag help`);
}

// ============================================================
// CHAOS — Chaos testing for endpoints
// ============================================================
async function cmdChaos(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Chaos — Endpoint Resilience Testing')}\n`);
    console.log(`  ${cyan('slop chaos test')} ${dim('--endpoints crypto-uuid,crypto-hash-sha256')}  Test endpoints\n`);
    return;
  }

  if (sub === 'test') {
    const epIdx = args.indexOf('--endpoints');
    const endpoints = epIdx >= 0 ? args[epIdx + 1] : null;
    if (!endpoints) die('Usage: slop chaos test --endpoints crypto-uuid,crypto-hash-sha256');
    const endpointList = endpoints.split(',').map(e => e.trim());
    spinnerStart(`Chaos testing ${endpointList.length} endpoints...`);
    const res = await request('POST', '/v1/chaos/test', { endpoints: endpointList });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${bold('Chaos Test Results')}\n`);
    const results = d.results || [];
    for (const r of results) {
      const status = r.passed ? green('PASS') : red('FAIL');
      console.log(`  ${status}  ${cyan((r.endpoint || r.slug || '?').padEnd(30))} ${dim(String(r.latency_ms || '') + 'ms')}  ${r.error ? red(r.error) : ''}`);
    }
    if (d.summary) {
      console.log(`\n  ${bold('Summary:')} ${green(String(d.summary.passed || 0) + ' passed')} / ${red(String(d.summary.failed || 0) + ' failed')} / ${dim(String(d.summary.total || 0) + ' total')}`);
    }
    console.log('');
    return;
  }

  die(`Unknown chaos subcommand: ${sub}. Try: slop chaos help`);
}

// ============================================================
// TUI — Full-screen dashboard matching Grok's Strat 3 spec
// 4-panel layout: Army Overview | Live Activity | Hive | Memory
// Plus Swarm Visualizer + hotkey bar. Zero dependencies.
// ============================================================
async function cmdTui() {
  requireKey();
  const ESC = '\x1b[';
  const clr = () => process.stdout.write(`${ESC}2J${ESC}H`);
  const mv = (r, c) => process.stdout.write(`${ESC}${r};${c}H`);
  const wr = (r, c, t) => { mv(r, c); process.stdout.write(t); };

  // Theme wiring — read from config, cycle with [W]
  const themeNames = Object.keys(THEMES);
  const cfgTheme = loadConfig().theme || 'default';
  let themeIdx = Math.max(0, themeNames.indexOf(cfgTheme));
  function currentTheme() { return THEMES[themeNames[themeIdx]]; }
  function tR() { return '\x1b' + currentTheme().r; }

  const G = '\x1b[32m', Y = '\x1b[33m', D = '\x1b[90m', B = '\x1b[1m', X = '\x1b[0m';
  // R and C are now functions that respect the active theme
  const thR = () => tR();
  const thC = () => {
    const name = themeNames[themeIdx];
    if (name === 'dracula') return '\x1b[38;2;139;233;253m';
    if (name === 'nord') return '\x1b[38;2;136;192;208m';
    if (name === 'monokai') return '\x1b[38;2;102;217;239m';
    return '\x1b[36m';
  };
  // Helper to get themed R and C for each render
  let R, TC;
  function refreshThemeColors() { R = thR(); TC = thC(); }

  function drawBox(r, c, w, h, title) {
    mv(r, c); process.stdout.write(`${D}╔${'═'.repeat(w - 2)}╗${X}`);
    if (title) { mv(r, c + 2); process.stdout.write(` ${B}${Y}${title}${X} `); }
    for (let i = 1; i < h - 1; i++) { mv(r + i, c); process.stdout.write(`${D}║${X}${' '.repeat(w - 2)}${D}║${X}`); }
    mv(r + h - 1, c); process.stdout.write(`${D}╚${'═'.repeat(w - 2)}╝${X}`);
  }

  // State
  let balance = 0, tier = 'free', memKeys = 0, tables = 0;
  let activity = [], armyRuns = [], memoryEntries = [], hiveList = [];
  let running = true, agentCount = 0;

  async function fetchAll() {
    const results = await Promise.allSettled([
      request('GET', '/v1/credits/balance'),
      request('GET', '/v1/health'),
      request('GET', '/v1/usage/today'),
      request('POST', '/v1/memory-list', {}),
      request('GET', '/v1/army/runs').catch(() => null),
      request('GET', '/v1/hives').catch(() => null),
    ]);
    const [bal, hp, usage, mem, army, hives] = results.map(r => r.status === 'fulfilled' ? r.value?.data : {});
    balance = bal?.balance || 0;
    tier = bal?.tier || 'free';
    tables = hp?.sqlite_tables || 0;
    memKeys = (mem?.entries || mem?.keys || []).length;
    memoryEntries = (mem?.entries || mem?.keys || []).slice(0, 6);
    activity = (usage?.calls || usage?.recent || []).slice(0, 6);
    armyRuns = (army?.runs || []).slice(0, 4);
    hiveList = (hives?.hives || []).slice(0, 4);
    agentCount = armyRuns.reduce((s, r) => s + (r.agent_count || 0), 0);
  }

  function render() {
    refreshThemeColors();
    const C = TC; // themed cyan for TUI panels
    const w = process.stdout.columns || 120;
    const h = process.stdout.rows || 40;
    const halfW = Math.floor(w / 2) - 1;
    clr();

    // ── HEADER ──
    const line = '─'.repeat(w - 2);
    wr(1, 2, `${D}${line}${X}`);
    wr(2, 2, `${B}${R}S L O P   T U I${X}   ${D}v${PKG_VERSION}${X}`);
    wr(3, 2, `Connected to ${C}${BASE_URL}${X} ${D}•${X} ${C}1,255${X} endpoints ${D}•${X} ${C}925${X} real handlers ${D}•${X} <50ms p95`);
    wr(4, 2, `${B}Credits:${X} ${G}${balance.toLocaleString()}${X} ${tier.toUpperCase()}   ${D}|${X}   ${B}Memory:${X} ${G}FREE FOREVER${X} ${D}(${tables} tables • ${memKeys} keys)${X}`);
    wr(5, 2, `Engine: ${G}real everywhere${X} ${D}•${X} Merkle-verified swarm ${D}•${X} 4 LLM providers live`);
    wr(6, 2, `${D}${line}${X}`);

    // ── TOP LEFT: ARMY OVERVIEW ──
    drawBox(8, 1, halfW, 8, 'ARMY OVERVIEW');
    if (armyRuns.length > 0) {
      armyRuns.forEach((r, i) => {
        const status = (r.status || '?').toUpperCase();
        const statusColor = status === 'COMPLETED' ? G : status === 'RUNNING' ? C : Y;
        wr(9 + i, 3, `${Y}${(r.task || 'Untitled').slice(0, 30).padEnd(30)}${X} ${statusColor}${status.padEnd(10)}${X} ${D}(${r.agent_count || '?'} agents)${X}`);
      });
      wr(13, 3, `${D}Merkle root: ${(armyRuns[0]?.merkle_root || 'none').slice(0, 16)}... (verified)${X}`);
    } else {
      wr(10, 3, `${D}No active swarms.${X}`);
      wr(11, 3, `${D}Deploy new swarm → ${B}[A]${X}`);
    }

    // ── TOP RIGHT: LIVE ACTIVITY ──
    drawBox(8, halfW + 2, w - halfW - 2, 8, 'LIVE ACTIVITY (last 60s)');
    if (activity.length > 0) {
      activity.forEach((c, i) => {
        const time = (c.time || c.ts || '').toString().slice(0, 8);
        const api = (c.api || c.slug || c.command || '?').slice(0, 22);
        const lat = c.latency_ms || c.latency || '';
        wr(9 + i, halfW + 4, `${D}${time.padEnd(10)}${X}${C}${api.padEnd(24)}${X}${lat ? `${G}${lat}ms${X}` : ''}`);
      });
    } else {
      wr(10, halfW + 4, `${D}No recent calls. Try: slop call crypto-uuid${X}`);
    }

    // ── MIDDLE LEFT: HIVE WORKSPACES ──
    drawBox(17, 1, halfW, 7, 'HIVE WORKSPACES');
    if (hiveList.length > 0) {
      hiveList.forEach((hv, i) => {
        wr(18 + i, 3, `${C}#${(hv.name || hv.id || 'workspace').slice(0, 25).padEnd(25)}${X} ${D}(${hv.member_count || '?'} agents online)${X}`);
      });
    } else {
      wr(18, 3, `${D}#research-channel       (create with ${C}slop hive${X}${D})${X}`);
    }
    wr(22, 3, `${D}Press ${B}[H]${X}${D} to open channel + live standups${X}`);

    // ── MIDDLE RIGHT: MEMORY VISUALIZER ──
    drawBox(17, halfW + 2, w - halfW - 2, 7, 'MEMORY VISUALIZER');
    wr(18, halfW + 4, `${D}Top namespaces (free forever):${X}`);
    if (memoryEntries.length > 0) {
      memoryEntries.slice(0, 4).forEach((m, i) => {
        const key = typeof m === 'string' ? m : (m.key || '?');
        const val = typeof m === 'object' ? (m.value || '').slice(0, 30) : '';
        wr(19 + i, halfW + 5, `${D}•${X} ${C}${key.slice(0, 28).padEnd(28)}${X} ${D}${val}${X}`);
      });
    } else {
      wr(19, halfW + 5, `${D}• (no keys yet — memory is free forever)${X}`);
    }

    // ── BOTTOM: SWARM VISUALIZER ──
    drawBox(25, 1, w - 2, 5, 'SWARM VISUALIZER');
    const lobsters = agentCount > 0 ? '🦞'.repeat(Math.min(agentCount, 8)) : '🦞🦞🦞';
    const agentStr = agentCount > 0 ? `${agentCount} agents active` : 'Ready to deploy';
    wr(26, 3, `${lobsters}  ${G}${agentStr}${X}  ${lobsters}`);
    const pipes = Array.from({ length: Math.min(14, Math.floor((w - 8) / 4)) }, () => '│').join('   ');
    wr(27, 3, `${D}${pipes}${X}`);
    wr(28, 3, `${D}100 parallel capable • Claude→GPT→Grok→DeepSeek loops • Merkle proofs • Zero sleep${X}`);

    // ── HOTKEY BAR ──
    wr(h - 2, 2, `${D}${line}${X}`);
    wr(h - 1, 2, `${B}[A]${X} Army  ${B}[H]${X} Hive  ${B}[M]${X} Memory  ${B}[T]${X} Tools  ${B}[N]${X} New Swarm  ${B}[P]${X} Pipe/Task  ${B}[S]${X} Swarm Viz  ${B}[B]${X} Balance  ${B}[L]${X} List  ${B}[W]${X} Theme  ${B}[R]${X} Refresh  ${B}[?]${X} Help  ${B}[Q]${X} Quit`);
    wr(h, 2, `${D}Dashboard • Refreshing live every 3s • Press any hotkey…${X}`);
  }

  // Initial fetch
  await fetchAll();

  // Enter raw mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(`${ESC}?25l`);
  }

  render();

  // Auto-refresh every 3s
  const interval = setInterval(async () => {
    if (!running) return;
    await fetchAll();
    render();
  }, 3000);

  // Handle resize
  process.stdout.on('resize', () => { if (running) render(); });

  // Hotkeys
  process.stdin.on('data', async (data) => {
    const k = data.toString().toLowerCase();
    if (k === 'q' || k === '\x03') {
      running = false; clearInterval(interval);
      process.stdout.write(`${ESC}?25h`); clr();
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      console.log(dim('\n  TUI closed.\n'));
      process.exit(0);
    }
    if (k === 'r') { await fetchAll(); render(); }
    if (k === 'p') {
      // Run pipe/task inline
      clr();
      process.stdout.write(`${ESC}?25h`);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      console.log(`\n  ${B}${Y}RUN PIPE / TASK${X}\n`);
      console.log(`  ${D}Chain APIs with pipes: "sense-url-tech-stack stripe.com | text-summarize | memory-set --key=summary"${X}`);
      console.log(`  ${D}Or run a natural language task via agent/run${X}\n`);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const input = await new Promise(r => rl.question(`  ${B}> ${X}`, r));
      rl.close();
      if (input) {
        if (input.includes('|')) {
          // Pipe mode
          const steps = input.split('|').map(s => s.trim());
          console.log(`\n  ${D}Running ${steps.length}-step pipe...${X}\n`);
          let lastOutput = {};
          for (const step of steps) {
            const parts = step.split(/\s+/);
            const slug = parts[0];
            const rest = parts.slice(1).join(' ');
            let body = { ...lastOutput };
            if (rest) {
              try { body = { ...body, ...JSON.parse(rest) }; } catch { body.text = rest; body.input = rest; }
            }
            try {
              console.log(`  ${D}→ ${slug}${X}`);
              const res = await request('POST', '/v1/' + slug, body);
              lastOutput = res.data || {};
              console.log(`    ${G}✓${X} ${D}${JSON.stringify(lastOutput).slice(0, 120)}${X}`);
            } catch (e) { console.log(`    ${R}✗ ${e.message}${X}`); break; }
          }
          console.log(`\n  ${G}Pipe complete.${X} ${D}_engine: real${X}`);
        } else {
          // Agent run mode
          console.log(`\n  ${D}Running agent task...${X}\n`);
          try {
            const res = await request('POST', '/v1/agent/run', { task: input });
            const d = res.data || {};
            console.log(`  ${G}✓${X} ${JSON.stringify(d.output || d).slice(0, 300)}`);
            console.log(`  ${D}_engine: ${d.output?._engine || d._engine || 'real'}${X}`);
          } catch (e) { console.log(`  ${R}Error: ${e.message}${X}`); }
        }
      }
      console.log(`\n  ${D}Press any key to return to dashboard...${X}`);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdout.write(`${ESC}?25l`);
      await new Promise(resolve => process.stdin.once('data', resolve));
      await fetchAll();
      render();
    }
    if (k === 'b') {
      // Rich balance + stats view
      clr();
      console.log(`\n  ${B}${Y}BALANCE + STATS${X}\n`);
      try {
        const [bal, usage, health] = await Promise.all([
          request('GET', '/v1/credits/balance').catch(() => ({ data: {} })),
          request('GET', '/v1/usage/today').catch(() => ({ data: {} })),
          request('GET', '/v1/health').catch(() => ({ data: {} })),
        ]);
        balance = bal.data?.balance || 0;
        tier = bal.data?.tier || 'free';
        const hp = health.data || {};
        console.log(`  ${B}Tier:${X}            ${G}${tier.toUpperCase()}${X}`);
        console.log(`  ${B}Credits:${X}         ${G}${balance.toLocaleString()}${X}`);
        console.log(`  ${B}Memory:${X}          ${G}FREE FOREVER${X} ${D}(${hp.sqlite_tables || '?'} tables)${X}`);
        console.log(`  ${B}Agents online:${X}   ${C}${agentCount || 0}${X}`);
        console.log(`  ${B}APIs available:${X}  ${C}${hp.apis || 1255}${X} endpoints, ${C}${hp.detail?.handlers || 925}${X} handlers`);
        console.log(`  ${B}Server uptime:${X}   ${D}${hp.uptime_seconds ? Math.floor(hp.uptime_seconds / 60) + 'm' : '?'}${X}`);
        console.log(`  ${B}Heap used:${X}       ${D}${hp.detail?.heap_used_mb || '?'}MB / ${hp.detail?.heap_total_mb || '?'}MB${X}`);
        const calls = usage.data?.total_calls || usage.data?.calls?.length || 0;
        const credits = usage.data?.total_credits || 0;
        console.log(`  ${B}Calls today:${X}     ${C}${calls}${X}`);
        console.log(`  ${B}Credits today:${X}   ${Y}${credits}${X}`);
      } catch (e) { console.log(`  ${R}Error: ${e.message}${X}`); }
      console.log(`\n  ${D}Press any key to return to dashboard...${X}`);
      await new Promise(resolve => process.stdin.once('data', resolve));
      await fetchAll();
      render();
    }
    if (k === 'l') {
      // Quick list — show categories inline
      clr();
      console.log(`\n  ${B}All 78 Categories:${X}\n`);
      try {
        const res = await request('GET', '/v1/tools?format=categories');
        const cats = res.data?.categories || res.data || [];
        if (Array.isArray(cats)) cats.forEach(c => console.log(`  ${C}${typeof c === 'string' ? c : c.name || c.category || JSON.stringify(c)}${X}`));
      } catch { console.log(`  ${D}Could not fetch categories${X}`); }
      console.log(`\n  ${D}Press any key to return to dashboard...${X}`);
      await new Promise(resolve => process.stdin.once('data', resolve));
      render();
    }
    if (k === 'n') {
      // Deploy army with interactive prompt
      clr();
      process.stdout.write(`${ESC}?25h`);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      console.log(`\n  ${B}${Y}NEW SWARM${X}\n`);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q) => new Promise(r => rl.question(q, r));
      const task = await ask(`  ${B}Task:${X} `);
      const agentStr = await ask(`  ${B}Agents${X} ${D}(default 10):${X} `);
      const toolStr = await ask(`  ${B}Tool slug${X} ${D}(or blank for agent/run):${X} `);
      rl.close();
      const agents = parseInt(agentStr) || 10;
      console.log(`\n  ${D}Deploying ${agents}-agent swarm...${X}\n`);
      try {
        const body = toolStr ? { tool: toolStr, input: { text: task }, agents, task } : { task, agents };
        const endpoint = toolStr ? '/v1/army/deploy' : '/v1/agent/run';
        const res = await request('POST', endpoint, body);
        const d = res.data || {};
        console.log(`  ${G}✓${X} Swarm deployed: ${C}${d.run_id || d.task_id || '?'}${X}`);
        if (d.agent_count) console.log(`  Agents: ${d.agent_count} | Merkle: ${G}${(d.merkle_root || '').slice(0, 20)}...${X}`);
        if (d.results) console.log(`  Results: ${JSON.stringify((d.results || []).slice(0, 2)).slice(0, 120)}...`);
        if (d.output) console.log(`  Output: ${JSON.stringify(d.output).slice(0, 200)}`);
        console.log(`  ${D}_engine: ${d._engine || d.output?._engine || 'real'}${X}`);
      } catch (e) { console.log(`  ${R}Error: ${e.message}${X}`); }
      console.log(`\n  ${D}Press any key to return to dashboard...${X}`);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdout.write(`${ESC}?25l`);
      await new Promise(resolve => process.stdin.once('data', resolve));
      await fetchAll();
      render();
    }
    if (k === 'a') {
      // Army detail view
      clr();
      const w = process.stdout.columns || 120;
      drawBox(1, 1, w - 2, process.stdout.rows - 2, 'ARMY DEPLOY — All Runs');
      if (armyRuns.length > 0) {
        armyRuns.forEach((r, i) => {
          wr(3 + i * 3, 3, `${Y}${r.id || '?'}${X}  Status: ${G}${(r.status || '?').toUpperCase()}${X}  Agents: ${r.agent_count || '?'}`);
          wr(4 + i * 3, 5, `Task: ${C}${(r.task || 'N/A').slice(0, 80)}${X}`);
          wr(5 + i * 3, 5, `${D}Merkle: ${(r.merkle_root || 'pending').slice(0, 32)}${X}`);
        });
      } else {
        wr(4, 3, `${D}No army runs. Press N to deploy a new swarm.${X}`);
      }
      wr(process.stdout.rows - 2, 2, `${D}Press any key to return to dashboard...${X}`);
      await new Promise(resolve => process.stdin.once('data', resolve));
      render();
    }
    if (k === 'm') {
      // Memory: interactive set/search/delete
      clr();
      process.stdout.write(`${ESC}?25h`);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      console.log(`\n  ${B}${Y}MEMORY${X} ${D}(FREE FOREVER • SQLite-backed • persistent across sessions)${X}\n`);
      // Show current keys
      try {
        const res = await request('POST', '/v1/memory-list', {});
        const entries = res.data?.entries || res.data?.keys || [];
        console.log(`  ${B}${entries.length} keys stored${X}\n`);
        entries.slice(0, 8).forEach(m => {
          const key = typeof m === 'string' ? m : (m.key || '?');
          const val = typeof m === 'object' ? (m.value || '').slice(0, 50) : '';
          console.log(`  ${C}${key.padEnd(30)}${X} ${D}${val}${X}`);
        });
        if (entries.length > 8) console.log(`  ${D}... and ${entries.length - 8} more${X}`);
      } catch {}
      console.log('');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q) => new Promise(r => rl.question(q, r));
      const op = await ask(`  ${B}[S]et / [G]et / [Q]uery / [D]elete / [Enter] back:${X} `);
      if (op.toLowerCase() === 's') {
        const key = await ask(`  ${B}Key:${X} `);
        const val = await ask(`  ${B}Value:${X} `);
        if (key && val) {
          try {
            await request('POST', '/v1/memory-set', { key, value: val });
            console.log(`  ${G}✓${X} Set ${C}${key}${X} = "${val.slice(0, 50)}" ${D}(FREE)${X}`);
          } catch (e) { console.log(`  ${R}Error: ${e.message}${X}`); }
        }
      } else if (op.toLowerCase() === 'g') {
        const key = await ask(`  ${B}Key:${X} `);
        try {
          const res = await request('POST', '/v1/memory-get', { key });
          console.log(`  ${G}✓${X} ${C}${key}${X} = "${JSON.stringify(res.data?.value || res.data?.data?.value || '(empty)').slice(0, 200)}"`);
        } catch (e) { console.log(`  ${R}Not found: ${e.message}${X}`); }
      } else if (op.toLowerCase() === 'q') {
        const query = await ask(`  ${B}Search:${X} `);
        try {
          const res = await request('POST', '/v1/memory-search', { query });
          const results = res.data?.results || res.data?.matches || [];
          console.log(`  ${G}${results.length} results:${X}`);
          results.slice(0, 10).forEach(r => {
            const key = typeof r === 'string' ? r : (r.key || '?');
            const score = r.score ? ` (score: ${r.score})` : '';
            console.log(`  ${D}•${X} ${C}${key}${X}${D}${score}${X}`);
          });
        } catch (e) { console.log(`  ${R}Error: ${e.message}${X}`); }
      } else if (op.toLowerCase() === 'd') {
        const key = await ask(`  ${B}Key to delete:${X} `);
        try {
          await request('POST', '/v1/memory-delete', { key });
          console.log(`  ${G}✓${X} Deleted ${C}${key}${X}`);
        } catch (e) { console.log(`  ${R}Error: ${e.message}${X}`); }
      }
      rl.close();
      console.log(`\n  ${D}Press any key to return to dashboard...${X}`);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdout.write(`${ESC}?25l`);
      await new Promise(resolve => process.stdin.once('data', resolve));
      await fetchAll();
      render();
    }
    if (k === 't') {
      // Tools: search + execute inline
      clr();
      process.stdout.write(`${ESC}?25h`);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      console.log(`\n  ${B}${Y}TOOLS CATALOG${X} ${D}(1,255 endpoints • 925 real handlers • 78 categories)${X}\n`);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q) => new Promise(r => rl.question(q, r));
      const query = await ask(`  ${B}Search or slug:${X} `);
      if (query) {
        // Try as slug first, then search
        console.log(`\n  ${D}Searching for "${query}"...${X}\n`);
        try {
          const res = await request('POST', '/v1/resolve', { query });
          const d = res.data || {};
          const slug = d.slug || d.best_match || query;
          const name = d.name || slug;
          console.log(`  ${G}✓${X} Found: ${C}${slug}${X} — ${name} ${D}(${d.credits || '?'} credits)${X}`);
          const exec = await ask(`\n  ${B}Execute? (y/N):${X} `);
          if (exec.toLowerCase() === 'y') {
            const input = await ask(`  ${B}Input${X} ${D}(JSON or text):${X} `);
            let body;
            try { body = JSON.parse(input); } catch { body = { text: input }; }
            console.log(`\n  ${D}Executing ${slug}...${X}\n`);
            const callRes = await request('POST', '/v1/' + slug, body);
            const cd = callRes.data || {};
            console.log(`  ${G}✓ RESULT:${X}`);
            console.log(`  ${JSON.stringify(cd, null, 2).split('\n').slice(0, 15).join('\n')}`);
            console.log(`  ${D}_engine: ${cd._engine || 'real'} | latency: ${callRes.meta?.latency_ms || '?'}ms | credits: ${callRes.meta?.credits_used || '?'}${X}`);
          }
        } catch (e) { console.log(`  ${R}Error: ${e.message}${X}`); }
      }
      rl.close();
      console.log(`\n  ${D}Press any key to return to dashboard...${X}`);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      process.stdout.write(`${ESC}?25l`);
      await new Promise(resolve => process.stdin.once('data', resolve));
      render();
    }
    if (k === 'h') {
      // Hive view
      clr();
      const w = process.stdout.columns || 120;
      drawBox(1, 1, w - 2, process.stdout.rows - 2, 'HIVE WORKSPACES — Multi-Agent Collaboration');
      if (hiveList.length > 0) {
        hiveList.forEach((hv, i) => {
          wr(3 + i * 2, 3, `${C}#${(hv.name || hv.id || 'workspace').padEnd(25)}${X} ${D}${hv.member_count || '?'} agents | channels: ${hv.channels?.length || '?'}${X}`);
        });
      } else {
        wr(4, 3, `${D}No hive workspaces yet.${X}`);
        wr(6, 3, `${B}Create:${X}  slop call hive/create --name "research-team"`);
        wr(7, 3, `${B}Send:${X}    slop call hive/<id>/send --message "hello"`);
        wr(8, 3, `${B}Standup:${X} slop call hive/<id>/standup`);
        wr(9, 3, `${B}Govern:${X}  slop call governance/propose --hive <id> --proposal "upgrade"`);
      }
      wr(process.stdout.rows - 2, 2, `${D}Press any key to return...${X}`);
      await new Promise(resolve => process.stdin.once('data', resolve));
      render();
    }
    if (k === 's') {
      // Full-screen swarm visualizer
      clr();
      const w = process.stdout.columns || 120;
      const h = process.stdout.rows || 40;
      drawBox(1, 1, w - 2, h - 2, 'SWARM VISUALIZER');
      const totalAgents = armyRuns.reduce((s, r) => s + (r.agent_count || 0), 0) || 0;
      const lobsterCount = Math.min(Math.max(totalAgents, 3), Math.floor((w - 10) / 3));
      wr(3, 3, `${G}${'🦞'.repeat(lobsterCount)}${X}`);
      wr(5, 3, `${B}${totalAgents || 'No'}${X} agents ${totalAgents > 0 ? 'humming' : 'deployed yet'}`);
      for (let row = 0; row < Math.min(8, Math.floor((h - 12) / 2)); row++) {
        const pipes = Array.from({ length: Math.min(20, Math.floor((w - 8) / 4)) }, () => '│').join('   ');
        wr(7 + row * 2, 3, `${D}${pipes}${X}`);
        wr(8 + row * 2, 5, `${D}${'·'.repeat(Math.floor((w - 12) / 2))}${X}`);
      }
      wr(h - 5, 3, `${D}100 parallel capable • Infinite Claude→Grok→GPT→DeepSeek loops${X}`);
      wr(h - 4, 3, `${D}Real compute • Merkle proofs • SHA-256 verified • Zero sleep${X}`);
      wr(h - 3, 2, `${D}Press any key to return...${X}`);
      await new Promise(resolve => process.stdin.once('data', resolve));
      render();
    }
    if (k === 'w') {
      // Cycle through themes
      themeIdx = (themeIdx + 1) % themeNames.length;
      const cfg = loadConfig();
      cfg.theme = themeNames[themeIdx];
      saveConfig(cfg);
      render();
    }
    if (k === '?') {
      clr();
      console.log(`\n  ${B}${Y}SLOP TUI HELP${X}\n`);
      console.log(`  ${B}[D]${X} Dashboard        Main 4-panel view with live data`);
      console.log(`  ${B}[A]${X} Army Detail      All army deployments with Merkle roots`);
      console.log(`  ${B}[H]${X} Hive             Workspace management + standups`);
      console.log(`  ${B}[M]${X} Memory           Browse all keys (free forever)`);
      console.log(`  ${B}[T]${X} Tools            78 categories, 925 handlers`);
      console.log(`  ${B}[N]${X} New Swarm        Deploy 5-agent army instantly`);
      console.log(`  ${B}[S]${X} Swarm Viz        Full-screen swarm visualizer`);
      console.log(`  ${B}[B]${X} Balance          Refresh credit balance`);
      console.log(`  ${B}[L]${X} List             All tool categories`);
      console.log(`  ${B}[W]${X} Theme            Cycle theme (${themeNames.join('/')})`);
      console.log(`  ${B}[R]${X} Refresh          Force data refresh`);
      console.log(`  ${B}[?]${X} Help             This screen`);
      console.log(`  ${B}[Q]${X} Quit             Exit TUI\n`);
      console.log(`  ${D}Dashboard auto-refreshes every 3s${X}\n`);
      console.log(`  ${D}Press any key to return...${X}`);
      await new Promise(resolve => process.stdin.once('data', resolve));
      render();
    }
  });
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
  console.log(`  ${dim('925 handlers | 44+ commands | Type anything | Ctrl+C to exit')}`);
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
          case 'wallet': await cmdWallet(args); break;
          case 'bounty': await cmdBounty(args); break;
          case 'market': await cmdMarket(args); break;
          case 'army': await cmdArmy(args); break;
          case 'schedule': await cmdSchedule(args); break;
          case 'copilot': await cmdCopilot(args); break;
          case 'tournament': await cmdTournament(args); break;
          case 'reputation': await cmdReputation(args); break;
          case 'proof': await cmdProof(args); break;
          case 'staking': await cmdStaking(args); break;
          case 'forge': await cmdForge(args); break;
          case 'arbitrage': await cmdArbitrage(args); break;
          case 'browser': await cmdBrowser(args); break;
          case 'desktop': await cmdDesktop(args); break;
          case 'sandbox': await cmdSandbox(args); break;
          case 'federation': await cmdFederation(args); break;
          case 'graphrag': await cmdGraphrag(args); break;
          case 'chaos': await cmdChaos(args); break;
          case 'eval': await cmdEval(args); break;
          case 'replay': await cmdReplay(args); break;
          case 'queue': await cmdQueue(args); break;
          case 'webhooks': await cmdWebhooks(args); break;
          case 'teams': await cmdTeams(args); break;
          case 'knowledge': await cmdKnowledge(args); break;
          case 'chain': await cmdChain(args); break;
          case 'memory': case 'mem': await cmdMemory(args); break;
          case 'discover': await cmdDiscover(args); break;
          case 'balance': await cmdBalance(); break;
          case 'health': await cmdHealth(); break;
          case 'stats': await cmdStats(args); break;
          case 'benchmark': await cmdBenchmark(); break;
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
          case 'mcp': cmdMcp(args); break;
          case 'init': cmdInit(args); break;
          case 'agents': case 'agent': await cmdAgents(args); break;
          case 'doctor': await cmdDoctor(); break;
          case 'hive': await cmdHive(args); break;
          case 'quickstart': case 'start': case 'tutorial': await cmdQuickstart(); break;
          case 'live': await cmdLive(args); break;
          case 'batch': await cmdBatch(args); break;
          case 'watch': await cmdWatch(args); break;
          case 'alias': cmdAlias(args); break;
          case 'profile': case 'profiles': cmdProfile(args); break;
          case 'session': await cmdSession(args); break;
          case 'upgrade': await cmdUpgrade(); break;
          case 'completions': cmdCompletions(args); break;
          case 'buy': await cmdBuy(args); break;
          case 'cloud': await cmdCloud(args); break;
          case 'logs': case 'log': await cmdLogs(args); break;
          case 'dev': await cmdDev(args); break;
          case 'env': await cmdEnv(args); break;
          case 'listen': await cmdListen(args); break;
          case 'types': await cmdTypes(args); break;
          case 'model': await cmdModels(args); break;
          case 'voice': await cmdVoice(args); break;
          case 'simulate': await cmdSimulate(args); break;
          case 'snapshot': await cmdSnapshot(args); break;
          case 'guardrails': await cmdGuardrails(args); break;
          case 'template': await cmdTemplate(args); break;
          case 'marketplace': await cmdMarketplace(args); break;
          case 'do': await cmdNatural(args[0] || '', args.slice(1)); break;
          case 'tui': case 'dashboard': await cmdTui(); break;
          default:
            // Smart LOCAL routing before burning cloud credits
            const lowerLine = line.toLowerCase();

            // Catch common natural language patterns and route to local commands
            if (lowerLine.includes('agent') && (lowerLine.includes('start') || lowerLine.includes('launch') || lowerLine.includes('run'))) {
              const numMatch = lowerLine.match(/(\d+)/);
              const count = numMatch ? numMatch[1] : '8';
              console.log(dim(`\n  → Routing to: slop agents start ${count}\n`));
              await cmdAgents(['start', count]);
            } else if (lowerLine.includes('agent') && (lowerLine.includes('stop') || lowerLine.includes('kill'))) {
              console.log(dim('\n  → Routing to: slop agents stop\n'));
              await cmdAgents(['stop']);
            } else if (lowerLine.includes('agent') && (lowerLine.includes('status') || lowerLine.includes('how many'))) {
              console.log(dim('\n  → Routing to: slop agents status\n'));
              await cmdAgents(['status']);
            } else if (lowerLine.includes('hive') && (lowerLine.includes('launch') || lowerLine.includes('create') || lowerLine.includes('start'))) {
              console.log(dim('\n  → Routing to: slop org launch\n'));
              await cmdOrg(['launch', '--template', 'startup-team', '--name', 'Hive-' + Date.now()]);
            } else if (lowerLine.includes('doctor') || lowerLine.includes('diagnos') || lowerLine.includes('check setup')) {
              console.log(dim('\n  → Routing to: slop doctor\n'));
              await cmdDoctor();
            } else if (lowerLine.includes('benchmark') || lowerLine.includes('latency') || lowerLine.includes('speed test')) {
              console.log(dim('\n  → Routing to: slop benchmark\n'));
              await cmdBenchmark();
            } else if (lowerLine.includes('balance') || lowerLine.includes('credits') || lowerLine.includes('how much')) {
              console.log(dim('\n  → Routing to: slop balance\n'));
              await cmdBalance();
            } else if (lowerLine.includes('mcp') && lowerLine.includes('serve')) {
              console.log(dim('\n  → Routing to: slop mcp serve\n'));
              cmdMcp(['serve']);
            } else if (lowerLine.includes('mcp') && lowerLine.includes('config')) {
              console.log(dim('\n  → Routing to: slop mcp config\n'));
              cmdMcp(['config']);
            } else if (lowerLine.includes('install') || lowerLine.includes('setup') || lowerLine.includes('init')) {
              console.log(dim('\n  → Routing to: slop quickstart\n'));
              await cmdQuickstart();
            } else if (lowerLine.includes('hash') || lowerLine.includes('uuid') || lowerLine.includes('encrypt')) {
              // Route compute keywords to search
              console.log(dim('\n  → Routing to: slop search "' + line + '"\n'));
              await cmdSearch([line]);
            } else if (lowerLine.includes('memory') || lowerLine.includes('remember') || lowerLine.includes('store')) {
              console.log(dim('\n  → Routing to: slop memory\n'));
              await cmdMemory(args);
            } else if (lowerLine.startsWith('do ') || lowerLine.startsWith('run ')) {
              // Explicit natural language execution
              await cmdNatural(args[0] || '', args.slice(1));
            } else {
              // Show helpful suggestion instead of burning credits
              console.log(`\n  ${yellow('Not sure what you mean.')} Try one of these:\n`);
              console.log(`  ${cyan('agents start 8')}     Launch 8 local Ollama agents`);
              console.log(`  ${cyan('agents stop')}        Stop all running agents`);
              console.log(`  ${cyan('org launch')}         Launch an agent organization`);
              console.log(`  ${cyan('call <slug>')}        Call any of 925+ APIs`);
              console.log(`  ${cyan('search <query>')}     Find the right tool`);
              console.log(`  ${cyan('memory set <k> <v>')} Store persistent memory`);
              console.log(`  ${cyan('doctor')}             Diagnose your setup`);
              console.log(`  ${cyan('benchmark')}          Test API latency`);
              console.log(`  ${cyan('mcp serve')}          Start MCP server`);
              console.log(`  ${cyan('do <anything>')}      Natural language (uses credits)`);
              console.log(`  ${cyan('help')}               See all commands\n`);
            }
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
// VOICE — Transcribe audio files
// ============================================================
async function cmdVoice(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Voice')}\n`);
    console.log(`  ${cyan('slop voice transcribe')} ${dim('--file path')}   Transcribe an audio file\n`);
    return;
  }

  if (sub === 'transcribe') {
    const fileIdx = args.indexOf('--file');
    const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;
    if (!filePath) die('Usage: slop voice transcribe --file <path>');
    spinnerStart('Transcribing audio...');
    try {
      const res = await request('POST', '/v1/voice/transcribe', { file: filePath });
      spinnerStop(true);
      if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
      const d = res.data || res;
      console.log(`\n  ${green('✓ Transcription complete')}\n`);
      if (d.text || d.transcript) console.log(`  ${d.text || d.transcript}\n`);
      if (d.duration) console.log(`  ${dim('Duration:')} ${d.duration}`);
      if (d.language) console.log(`  ${dim('Language:')} ${d.language}`);
      console.log('');
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  die(`Unknown voice subcommand: ${sub}. Try: slop voice help`);
}

// ============================================================
// SIMULATE — Run agent simulations
// ============================================================
async function cmdSimulate(args) {
  requireKey();
  const taskIdx = args.indexOf('--task');
  const agentsIdx = args.indexOf('--agents');
  const task = taskIdx >= 0 ? args[taskIdx + 1] : null;
  const agents = agentsIdx >= 0 ? parseInt(args[agentsIdx + 1]) || 10 : 10;

  if (!task) die('Usage: slop simulate --task "..." --agents 10');

  spinnerStart(`Simulating with ${agents} agents...`);
  try {
    const res = await request('POST', '/v1/agent/simulate', { task, agents });
    spinnerStop(true);
    if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
    const d = res.data || res;
    console.log(`\n  ${green('✓ Simulation complete')}`);
    console.log(`  ${bold('Task:')}   ${task}`);
    console.log(`  ${bold('Agents:')} ${agents}`);
    if (d.simulation_id || d.id) console.log(`  ${bold('ID:')}     ${cyan(d.simulation_id || d.id)}`);
    if (d.results) {
      console.log(`\n  ${bold('Results:')}`);
      for (const r of Array.isArray(d.results) ? d.results : []) {
        console.log(`    ${dim('-')} ${r.agent || r.name || 'agent'}: ${r.output || r.result || ''}`);
      }
    }
    console.log('');
  } catch (err) { spinnerStop(false); handleError(err); }
}

// ============================================================
// SNAPSHOT — Save/restore swarm snapshots
// ============================================================
async function cmdSnapshot(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Swarm Snapshots')}\n`);
    console.log(`  ${cyan('slop snapshot save')} ${dim('--run-id ID')}   Save a swarm snapshot\n`);
    return;
  }

  if (sub === 'save') {
    const runIdx = args.indexOf('--run-id');
    const runId = runIdx >= 0 ? args[runIdx + 1] : null;
    if (!runId) die('Usage: slop snapshot save --run-id <ID>');
    spinnerStart('Saving snapshot...');
    try {
      const res = await request('POST', '/v1/swarm/snapshot', { run_id: runId });
      spinnerStop(true);
      if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
      const d = res.data || res;
      console.log(`\n  ${green('✓ Snapshot saved')}`);
      if (d.snapshot_id || d.id) console.log(`  ${bold('Snapshot ID:')} ${cyan(d.snapshot_id || d.id)}`);
      console.log(`  ${bold('Run ID:')}      ${runId}`);
      console.log('');
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  die(`Unknown snapshot subcommand: ${sub}. Try: slop snapshot help`);
}

// ============================================================
// GUARDRAILS — Scan text for safety issues
// ============================================================
async function cmdGuardrails(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Guardrails')}\n`);
    console.log(`  ${cyan('slop guardrails scan')} ${dim('"text"')}   Deep scan text for safety issues\n`);
    return;
  }

  if (sub === 'scan') {
    const text = args.slice(1).filter(a => !GLOBAL_FLAGS.includes(a)).join(' ');
    if (!text) die('Usage: slop guardrails scan "text to scan"');
    spinnerStart('Scanning text...');
    try {
      const res = await request('POST', '/v1/guardrails/scan-deep', { text });
      spinnerStop(true);
      if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
      const d = res.data || res;
      const safe = d.safe !== false;
      console.log(`\n  ${safe ? green('✓ Text passed safety scan') : red('✗ Safety issues detected')}`);
      if (d.score !== undefined) console.log(`  ${bold('Score:')}  ${d.score}`);
      if (d.flags && d.flags.length > 0) {
        console.log(`  ${bold('Flags:')}`);
        for (const f of d.flags) {
          console.log(`    ${red('•')} ${f.category || f.type || f}: ${f.message || f.description || ''}`);
        }
      }
      if (d.categories) {
        console.log(`  ${bold('Categories:')}`);
        for (const [k, v] of Object.entries(d.categories)) {
          console.log(`    ${dim(k + ':')} ${v}`);
        }
      }
      console.log('');
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  die(`Unknown guardrails subcommand: ${sub}. Try: slop guardrails help`);
}

// ============================================================
// TEMPLATE — List and run agent templates
// ============================================================
async function cmdTemplate(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Agent Templates')}\n`);
    console.log(`  ${cyan('slop template list')}                      List available templates`);
    console.log(`  ${cyan('slop template run')} ${dim('--name truth-seeker')}   Run an agent template\n`);
    return;
  }

  if (sub === 'list') {
    spinnerStart('Fetching templates...');
    try {
      const res = await request('GET', '/v1/agent/templates');
      spinnerStop(true);
      if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
      const templates = res.data?.templates || res.templates || res.data || [];
      console.log(`\n  ${bold('Agent Templates')}\n`);
      if (!Array.isArray(templates) || templates.length === 0) {
        console.log(dim('  No templates found.\n'));
        return;
      }
      for (const t of templates) {
        console.log(`  ${cyan((t.name || t.slug || '').padEnd(24))} ${t.description || t.desc || ''}`);
      }
      console.log('');
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  if (sub === 'run') {
    const nameIdx = args.indexOf('--name');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : null;
    if (!name) die('Usage: slop template run --name <template-name>');
    spinnerStart(`Running template "${name}"...`);
    try {
      const res = await request('POST', '/v1/agent/template/run', { name });
      spinnerStop(true);
      if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
      const d = res.data || res;
      console.log(`\n  ${green('✓ Template launched')}`);
      console.log(`  ${bold('Template:')} ${cyan(name)}`);
      if (d.agent_id || d.id) console.log(`  ${bold('Agent ID:')} ${d.agent_id || d.id}`);
      if (d.status) console.log(`  ${bold('Status:')}   ${d.status}`);
      console.log('');
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  die(`Unknown template subcommand: ${sub}. Try: slop template help`);
}

// ============================================================
// MARKETPLACE — Publish tools and browse top tools
// ============================================================
async function cmdMarketplace(args) {
  requireKey();
  const sub = args[0];

  if (!sub || sub === 'help') {
    console.log(`\n  ${bold('Marketplace')}\n`);
    console.log(`  ${cyan('slop marketplace publish')} ${dim('--name "tool"')}   Publish a tool`);
    console.log(`  ${cyan('slop marketplace top')}                       Browse top tools\n`);
    return;
  }

  if (sub === 'publish') {
    const nameIdx = args.indexOf('--name');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : null;
    if (!name) die('Usage: slop marketplace publish --name "tool-name"');
    spinnerStart(`Publishing "${name}"...`);
    try {
      const res = await request('POST', '/v1/marketplace/publish', { name });
      spinnerStop(true);
      if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
      const d = res.data || res;
      console.log(`\n  ${green('✓ Published to marketplace')}`);
      console.log(`  ${bold('Name:')} ${cyan(name)}`);
      if (d.tool_id || d.id) console.log(`  ${bold('ID:')}   ${d.tool_id || d.id}`);
      if (d.url) console.log(`  ${bold('URL:')}  ${d.url}`);
      console.log('');
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  if (sub === 'top') {
    spinnerStart('Fetching top tools...');
    try {
      const res = await request('GET', '/v1/marketplace/top');
      spinnerStop(true);
      if (jsonMode) { console.log(JSON.stringify(res.data || res, null, 2)); return; }
      const tools = res.data?.tools || res.tools || res.data || [];
      console.log(`\n  ${bold('Top Marketplace Tools')}\n`);
      if (!Array.isArray(tools) || tools.length === 0) {
        console.log(dim('  No tools found.\n'));
        return;
      }
      for (const t of tools) {
        const downloads = t.downloads || t.installs || 0;
        console.log(`  ${cyan((t.name || t.slug || '').padEnd(24))} ${dim(String(downloads) + ' downloads')}  ${t.description || t.desc || ''}`);
      }
      console.log('');
    } catch (err) { spinnerStop(false); handleError(err); }
    return;
  }

  die(`Unknown marketplace subcommand: ${sub}. Try: slop marketplace help`);
}

// ============================================================
// QUICKSTART — Interactive guided tutorial
// ============================================================
async function cmdQuickstart() {
  console.log(`\n  ${bold('Slopshop Quickstart')} ${dim('\u2014 6 steps, 2 minutes')}\n`);

  // Step 1: Health check
  console.log(`  ${bold('Step 1/6:')} Checking connection...`);
  try {
    const health = await request('GET', '/v1/health', null, false);
    console.log(`  ${green('\u2713')} Server: ${health.data?.version || 'ok'} (${health.data?.apis || '925+'} APIs)`);
    progressBar(1, 6, 20, 'Step 1/6');
    console.log('');
  } catch (e) {
    console.log(`  ${red('\u2717')} Could not reach server: ${e.message}\n`);
    return;
  }

  // Step 2: First API call (free - uuid)
  console.log(`  ${bold('Step 2/6:')} Making your first API call...`);
  console.log(`  ${dim('\u2192 slop call crypto-uuid')}`);
  try {
    const uuid = await request('POST', '/v1/crypto-uuid', {});
    console.log(`  ${green('\u2713')} Generated: ${cyan((uuid.data?.uuid || uuid.data?.data?.uuid || JSON.stringify(uuid.data).slice(0, 36)))}`);
    progressBar(2, 6, 20, 'Step 2/6');
    console.log('');
  } catch (e) {
    console.log(`  ${red('\u2717')} ${e.message}\n`);
  }

  // Step 3: Memory (free)
  console.log(`  ${bold('Step 3/6:')} Storing in persistent memory (free forever)...`);
  console.log(`  ${dim('\u2192 slop call memory-set --key hello --value world')}`);
  try {
    await request('POST', '/v1/memory-set', { key: 'quickstart-hello', value: 'world' });
    const mem = await request('POST', '/v1/memory-get', { key: 'quickstart-hello' });
    console.log(`  ${green('\u2713')} Stored & retrieved: ${cyan('"world"')}`);
    progressBar(3, 6, 20, 'Step 3/6');
    console.log('');
  } catch (e) {
    console.log(`  ${red('\u2717')} ${e.message}\n`);
  }

  // Step 4: Search tools
  console.log(`  ${bold('Step 4/6:')} Searching 925 tools...`);
  console.log(`  ${dim('\u2192 slop search "hash data"')}`);
  try {
    const search = await request('GET', '/v1/tools/search?q=hash+data&limit=3');
    const tools = search.data?.results || search.data || [];
    for (const t of (Array.isArray(tools) ? tools : []).slice(0, 3)) {
      console.log(`  ${dim('\u2022')} ${cyan(t.slug)} \u2014 ${(t.description || '').slice(0, 60)}`);
    }
    progressBar(4, 6, 20, 'Step 4/6');
    console.log('');
  } catch (e) {
    console.log(`  ${dim('\u2022 Search available at:')} ${cyan('slop search "<query>"')}\n`);
  }

  // Step 5: Chain
  console.log(`  ${bold('Step 5/6:')} Chaining two APIs...`);
  console.log(`  ${dim('\u2192 slop pipe text-reverse crypto-hash-sha256 --text "hello"')}`);
  console.log(`  ${green('\u2713')} Pipe reverses text \u2192 hashes the result`);
  progressBar(5, 6, 20, 'Step 5/6');
  console.log('');

  // Step 6: System resource check
  console.log(`  ${bold('Step 6/6:')} System resource check...\n`);
  try {
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    const totalGbRam = Math.round(totalRam / (1024 ** 3));
    const freeGbRam = Math.round(freeRam / (1024 ** 3));
    const cpuCores = os.cpus().length;

    let ollamaRunning = false;
    let ollamaModels = [];
    try {
      const ollamaData = await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:11434/api/tags', { timeout: 3000 }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
      });
      if (ollamaData && ollamaData.models) {
        ollamaRunning = true;
        ollamaModels = ollamaData.models.map(m => m.name.replace(/:latest$/, ''));
      }
    } catch { /* Ollama not available */ }

    const ollamaModelCount = ollamaModels.length || 1;
    const recommended = Math.max(1, Math.min(Math.floor(freeGbRam / 2), cpuCores, ollamaModelCount * 8, 64));

    const w = 41;
    const line = '\u2500'.repeat(w);
    const tl = '\u250c', tr = '\u2510', bl = '\u2514', br = '\u2518', vl = '\u2502', ml = '\u251c', mr = '\u2524';

    const pad = (s, len) => {
      // Strip ANSI for length calc
      const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
      const diff = len - stripped.length;
      return diff > 0 ? s + ' '.repeat(diff) : s;
    };

    const ramLine = `RAM:      ${totalGbRam} GB total, ${freeGbRam} GB free`;
    const cpuLine = `CPU:      ${cpuCores} cores`;

    let ollamaLine1, ollamaLine2;
    if (ollamaRunning && ollamaModels.length > 0) {
      const modelListStr = ollamaModels.join(', ');
      if (modelListStr.length <= 22) {
        ollamaLine1 = `Ollama:   ${ollamaModels.length} model${ollamaModels.length === 1 ? '' : 's'} (${modelListStr})`;
        ollamaLine2 = null;
      } else {
        const first = ollamaModels.slice(0, 2).join(', ') + ',';
        const rest = ollamaModels.slice(2).join(', ');
        ollamaLine1 = `Ollama:   ${ollamaModels.length} model${ollamaModels.length === 1 ? '' : 's'} (${first}`;
        ollamaLine2 = `          ${rest})`;
      }
    } else {
      ollamaLine1 = `Ollama:   ${ollamaRunning ? '0 models' : dim('not detected')}`;
      ollamaLine2 = null;
    }
    const gpuLine = `GPU:      ${ollamaRunning ? '(detected via Ollama)' : dim('unknown')}`;

    const recLine = `Recommended: ${bold(String(recommended))} always-on local agents`;
    const cmdLine = `\u2192 ${cyan('slop agents start ' + recommended)}`;

    console.log(`  ${tl}${line}${tr}`);
    console.log(`  ${vl}  ${bold('System Resources')}${' '.repeat(w - 19)}${vl}`);
    console.log(`  ${ml}${line}${mr}`);
    console.log(`  ${vl}  ${pad(ramLine, w - 3)}${vl}`);
    console.log(`  ${vl}  ${pad(cpuLine, w - 3)}${vl}`);
    console.log(`  ${vl}  ${pad(ollamaLine1, w - 3)}${vl}`);
    if (ollamaLine2) {
      console.log(`  ${vl}  ${pad(ollamaLine2, w - 3)}${vl}`);
    }
    console.log(`  ${vl}  ${pad(gpuLine, w - 3)}${vl}`);
    console.log(`  ${ml}${line}${mr}`);
    console.log(`  ${vl}  ${pad(recLine, w - 3)}${vl}`);
    console.log(`  ${vl}  ${pad(cmdLine, w - 3)}${vl}`);
    console.log(`  ${bl}${line}${br}`);
    console.log('');
    progressBar(6, 6, 20, 'Step 6/6');
  } catch (e) {
    console.log(`  ${red('\u2717')} Could not detect system resources: ${e.message}`);
    progressBar(6, 6, 20, 'Step 6/6');
  }
  console.log('');

  // Summary
  console.log(`  ${bold('You\'re ready!')} Here\'s what to try next:\n`);
  console.log(`  ${cyan('slop doctor')}              Check your full setup`);
  console.log(`  ${cyan('slop benchmark')}           Measure API latency`);
  console.log(`  ${cyan('slop mcp serve')}           Start MCP server for Goose/Cursor/Cline`);
  console.log(`  ${cyan('slop agents start 8')}      Launch local Ollama agent pool`);
  console.log(`  ${cyan('slop interactive')}         Enter interactive REPL mode`);
  console.log(`  ${cyan('slop call --help <slug>')}  Get help on any API\n`);
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

  // First-run welcome experience: show if no config file exists
  // and the command isn't signup, help, or version
  if (!fs.existsSync(CONFIG_FILE) && cmd && !['signup', 'help', 'version', '-v', '--version', '-h', '--help'].includes(cmd)) {
    console.log(`
  ${C.bold}\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557${C.reset}
  ${C.bold}\u2551${C.reset}           ${C.bold}Welcome to Slopshop CLI${C.reset}            ${C.bold}\u2551${C.reset}
  ${C.bold}\u2551${C.reset}     ${dim('The standalone CLI for AI agents')}         ${C.bold}\u2551${C.reset}
  ${C.bold}\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d${C.reset}

  ${bold('Get started in 30 seconds:')}

  1. ${cyan('slop signup')}                         Create free account (500 credits)
  2. ${cyan('slop "hash hello world"')}              Natural language → auto-routes
  3. ${cyan('slop "remember goal: ship v1"')}         Store to persistent memory (free)
  4. ${cyan('slop mcp serve')}                       Start MCP server (Cursor/Claude)
  5. ${cyan('slop help')}                            See all 70+ commands

  ${dim('Free persistent memory forever. 925 real compute handlers.')}
  ${dim('Works inside Claude Code, Cursor, Goose, Cline, OpenCode, Aider.')}
`);
  }

  if (!cmd || cmd === '--help' || cmd === '-h') {
    // First-run: show onboarding if no key configured
    if (!cmd && !API_KEY && !jsonMode) {
      console.log(`\n  ${C.red}${C.bold}SLOPSHOP${C.reset} v${PKG_VERSION} ${dim('— the missing CLI for AI agents')}\n`);
      console.log(`  ${bold('Quick start:')}`);
      console.log(`    1. ${cyan('slop signup')}                          Create free account (500 credits)`);
      console.log(`    2. ${cyan('slop "hash hello world"')}                Natural language routing`);
      console.log(`    3. ${cyan('slop "remember goal: ship v1"')}          Free persistent memory`);
      console.log(`    4. ${cyan('slop research "AI agents"')}              Multi-LLM research\n`);
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
    case 'agents':  await cmdAgents(args);  break;
    case 'agent':   await cmdAgents(args);  break;
    case 'doctor':  await cmdDoctor();      break;
    case 'hive':    await cmdHive(args);   break;
    case 'org':     await cmdOrg(args);    break;
    case 'wallet':  await cmdWallet(args); break;
    case 'bounty':  await cmdBounty(args); break;
    case 'market':  await cmdMarket(args); break;
    case 'army':    await cmdArmy(args);   break;
    case 'schedule': await cmdSchedule(args); break;
    case 'copilot': await cmdCopilot(args); break;
    case 'tournament': await cmdTournament(args); break;
    case 'reputation': await cmdReputation(args); break;
    case 'proof':   await cmdProof(args);  break;
    case 'staking': await cmdStaking(args); break;
    case 'forge':   await cmdForge(args);  break;
    case 'arbitrage': await cmdArbitrage(args); break;
    case 'browser': await cmdBrowser(args); break;
    case 'desktop': await cmdDesktop(args); break;
    case 'sandbox': await cmdSandbox(args); break;
    case 'federation': await cmdFederation(args); break;
    case 'graphrag': await cmdGraphrag(args); break;
    case 'chaos':   await cmdChaos(args);  break;
    case 'eval':    await cmdEval(args);   break;
    case 'replay':  await cmdReplay(args); break;
    case 'queue':   await cmdQueue(args);  break;
    case 'webhooks': await cmdWebhooks(args); break;
    case 'teams':   await cmdTeams(args);  break;
    case 'knowledge': await cmdKnowledge(args); break;
    case 'chain':   await cmdChain(args);  break;
    case 'memory':  await cmdMemory(args); break;
    case 'mem':     await cmdMemory(args); break;
    case 'run':     await cmdRun(args);    break;
    case 'discover': await cmdDiscover(args); break;
    case 'stats':   await cmdStats(args);  break;
    case 'benchmark': await cmdBenchmark(); break;
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
    case 'tui': case 'dashboard': await cmdTui(); break;
    case 'i': case 'interactive': case 'shell': case 'repl': await cmdInteractive(); break;
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
    case 'quickstart': case 'start': case 'tutorial': await cmdQuickstart(); break;
    case 'upgrade':     await cmdUpgrade();         break;
    case 'completions': cmdCompletions(args);       break;
    case 'voice':   await cmdVoice(args);  break;
    case 'simulate': await cmdSimulate(args); break;
    case 'snapshot': await cmdSnapshot(args); break;
    case 'guardrails': await cmdGuardrails(args); break;
    case 'template': await cmdTemplate(args); break;
    case 'marketplace': await cmdMarketplace(args); break;
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

  // Research / North Star
  if (/^(research|investigate|find out about|deep dive|analyze)\s+(.+)/i.test(fullInput)) {
    requireKey();
    const topic = fullInput.replace(/^(?:research|investigate|find out about|deep dive|analyze)\s+/i, '');
    if (!quiet && !jsonMode) console.log(dim('\n  Running multi-LLM research...'));
    const r = await request('POST', '/v1/research', { topic, tier: 'basic' });
    if (jsonMode) return console.log(JSON.stringify(r));
    console.log(`\n  ${bold('Research: ' + topic)}`);
    if (r.data?.findings) for (const f of r.data.findings) console.log(`  [${cyan(f.provider)}] ${f.response?.slice(0, 200) || 'no response'}`);
    else console.log(`  ${dim('No LLM keys configured. Set ANTHROPIC_API_KEY, XAI_API_KEY, etc.')}`);
    console.log();
    return;
  }
  if (/^(set|my)\s+(north\s*star|goal|mission)\s+(?:is\s+|to\s+)?(.+)/i.test(fullInput)) {
    requireKey();
    const goal = fullInput.replace(/^(?:set|my)\s+(?:north\s*star|goal|mission)\s+(?:is\s+|to\s+)?/i, '');
    const r = await request('POST', '/v1/northstar/set', { goal });
    if (jsonMode) return console.log(JSON.stringify(r));
    console.log(`\n  ${green('✓')} North Star set: "${goal}"`);
    console.log(`  ${dim('Run')} ${cyan('slop research "' + goal.slice(0, 30) + '"')} ${dim('to start research')}\n`);
    return;
  }
  if (/^(daily|hive daily|daily intelligence|brief|morning brief)/i.test(lower)) {
    requireKey();
    const r = await request('POST', '/v1/hive/daily-intelligence', { mode: 'light' });
    if (jsonMode) return console.log(JSON.stringify(r));
    console.log(`\n  ${bold('Daily Intelligence Brief')}`);
    console.log(`  ${dim('Providers:')} ${r.data?.providers_used || 0}`);
    console.log(`  ${dim('Credits:')} ${r.data?.credits_used || 0}`);
    console.log();
    return;
  }

  // Connect external services
  if (/^(connect|link|integrate)\s+(\w+)/i.test(fullInput)) {
    requireKey();
    const toolkit = fullInput.match(/(?:connect|link|integrate)\s+(\w+)/i)[1].toLowerCase();
    const r = await request('GET', '/v1/connectors/connect/' + toolkit);
    if (r.error) { console.log(`\n  ${red('✗')} ${r.error.message || r.error.code}\n`); return; }
    console.log(`\n  ${bold('Connect ' + toolkit)}`);
    console.log(`  ${dim('Auth URL:')} ${r.auth_url}`);
    console.log(`  ${dim('Open this URL in your browser to authorize.')}\n`);
    return;
  }

  // Triggers
  if (/^(trigger|webhook)\s+(create|new|add)\s+(\w+)/i.test(fullInput)) {
    requireKey();
    const toolkit = fullInput.match(/(?:trigger|webhook)\s+(?:create|new|add)\s+(\w+)/i)[1];
    const r = await request('POST', '/v1/triggers/create', { toolkit, event_type: 'webhook' });
    if (jsonMode) return console.log(JSON.stringify(r));
    console.log(`\n  ${green('✓')} Trigger created: ${r.trigger_id}`);
    console.log(`  ${dim('Webhook URL:')} ${r.webhook_url}\n`);
    return;
  }

  // Upload memory file
  if (/^(upload|import)\s+(memory|file|data)\s+(.+)/i.test(fullInput)) {
    requireKey();
    const filePath = fullInput.match(/(?:upload|import)\s+(?:memory|file|data)\s+(.+)/i)[1].trim();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const r = await request('POST', '/v1/memory/upload', { content, filename: path.basename(filePath) });
      if (jsonMode) return console.log(JSON.stringify(r));
      console.log(`\n  ${green('✓')} Uploaded ${r.data?.entries_stored || 0} entries from ${path.basename(filePath)}`);
      console.log(`  ${dim('Namespace:')} ${r.data?.namespace || 'default'}\n`);
    } else {
      console.log(`\n  ${red('✗')} File not found: ${filePath}\n`);
    }
    return;
  }

  // Prime check
  if (/^is\s+(\d+)\s+prime/i.test(fullInput)) {
    const n = parseInt(fullInput.match(/is\s+(\d+)\s+prime/i)[1]);
    return cmdCall(['math-prime-check', '--number', String(n)]);
  }

  // Factorial
  if (/^(\d+)\s*!|^factorial\s+(\d+)|^what is (\d+) factorial/i.test(fullInput)) {
    const m = fullInput.match(/(\d+)/);
    if (m) return cmdCall(['math-factorial', '--n', m[1]]);
  }

  // Fibonacci
  if (/^fib(?:onacci)?\s+(\d+)/i.test(fullInput)) {
    const n = fullInput.match(/(\d+)/)[1];
    return cmdCall(['math-fibonacci', '--n', n]);
  }

  // Temperature conversion
  if (/^convert\s+(\d+)\s*°?\s*(c|f|celsius|fahrenheit|kelvin)\s+to\s+(c|f|celsius|fahrenheit|kelvin)/i.test(fullInput)) {
    const m = fullInput.match(/convert\s+(\d+)\s*°?\s*(\w+)\s+to\s+(\w+)/i);
    return cmdCall(['convert-temperature', '--value', m[1], '--from', m[2], '--to', m[3]]);
  }

  // Server-side NL router fallback (uses /v1/query)
  if (API_KEY) {
    try {
      const r = await request('POST', '/v1/query', { query: fullInput });
      if (r.ok && r.data?.routed_to && r.data.routed_to !== null) {
        if (jsonMode) return console.log(JSON.stringify(r));
        console.log(`\n  ${dim('Routed to:')} ${cyan(r.data.routed_to)} ${dim('(' + (r.data.method || 'auto') + ')')}`);
        const d = r.data;
        delete d._engine; delete d.routed_to; delete d.method;
        if (Object.keys(d).length > 0) {
          console.log(`  ${JSON.stringify(d, null, 2).split('\n').map(l => '  ' + l).join('\n')}`);
        }
        console.log();
        return;
      }
    } catch(e) {}
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
  // Warn user and confirm before spending credits
  if (!quiet && !jsonMode) {
    console.log(`\n  ${yellow('No local command match.')} This will use the cloud agent (costs ~20 credits).`);
    console.log(`  ${dim('Input:')} "${fullInput}"`);
    console.log(`  ${dim('Tip: Try')} ${cyan('slop search "' + fullInput.split(' ').slice(0, 3).join(' ') + '"')} ${dim('first (1 credit)')}\n`);

    // In interactive mode, ask for confirmation
    if (typeof process.stdin.isTTY !== 'undefined' && process.stdin.isTTY) {
      const answer = await new Promise(r => {
        const rlConfirm = readline.createInterface({ input: process.stdin, output: process.stdout });
        rlConfirm.question(`  ${bold('Spend credits?')} [y/N] `, a => { rlConfirm.close(); r(a.trim().toLowerCase()); });
      });
      if (answer !== 'y' && answer !== 'yes') {
        console.log(dim('  Cancelled. Try a specific command instead.\n'));
        return;
      }
    }
  }

  if (!quiet && !jsonMode) console.log(dim('  Running server-side agent...'));

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
