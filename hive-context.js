#!/usr/bin/env node
/**
 * HIVE CONTEXT INJECTION SYSTEM
 *
 * Builds a compressed codebase summary and injects it into every local LLM prompt.
 * This is what took local models from 0% to 100% codebase awareness.
 *
 * Architecture:
 *   buildContext()       — scans codebase, extracts structure, returns <2000 token string
 *   watchAndRebuild()    — fs.watch on key files, rebuilds on change
 *   injectContext(prompt) — wraps any prompt with the system context
 *   sprintContext()      — adds sprint-specific overlay (last built, what failed, CEO direction)
 *
 * Usage:
 *   const { injectContext, buildContext } = require('./hive-context');
 *   const ctx = buildContext();                         // on hive start
 *   const fullPrompt = injectContext(ctx, userPrompt);  // before every LLM call
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT, '.data', 'hive-context-cache.json');

// ============================================================
// 1. EXTRACTORS — pull structured data from actual source files
// ============================================================

/**
 * Extract Express route definitions from server-v2.js
 * Returns: [{ method: 'POST', path: '/v1/hive/create', line: 3237 }, ...]
 */
function extractRoutes(serverPath) {
  try {
    const src = fs.readFileSync(serverPath, 'utf8');
    const routes = [];
    const re = /app\.(get|post|put|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      const line = src.substring(0, m.index).split('\n').length;
      routes.push({ method: m[1].toUpperCase(), path: m[2], line });
    }
    return routes;
  } catch { return []; }
}

/**
 * Extract exported function/handler names from a handler file
 * Returns: ['crypto-uuid', 'crypto-hash-sha256', ...]
 */
function extractHandlerKeys(handlerPath) {
  try {
    const src = fs.readFileSync(handlerPath, 'utf8');
    const keys = [];
    // Match object keys in module.exports = { 'key-name': ... }
    const re = /['"`]([a-z0-9_-]+)['"`]\s*:\s*(?:async\s*)?\(?/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[1].length > 2 && !['use', 'get', 'set', 'run'].includes(m[1])) {
        keys.push(m[1]);
      }
    }
    return [...new Set(keys)];
  } catch { return []; }
}

/**
 * Extract CLI commands from cli.js
 * Returns: ['call', 'health', 'memory', 'balance', 'search', ...]
 */
function extractCLICommands(cliPath) {
  try {
    const src = fs.readFileSync(cliPath, 'utf8');
    const cmds = [];
    // Match command dispatch patterns: case 'health':, === 'health', cmd === 'health'
    const re = /(?:case\s+|===\s*)['"`]([a-z][\w-]*)['"`]/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[1].length > 1) cmds.push(m[1]);
    }
    return [...new Set(cmds)];
  } catch { return []; }
}

/**
 * Extract SQLite table names from server-v2.js
 * Returns: ['hives', 'hive_messages', 'hive_state', 'users', ...]
 */
function extractDBTables(serverPath) {
  try {
    const src = fs.readFileSync(serverPath, 'utf8');
    const tables = [];
    const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      tables.push(m[1]);
    }
    return [...new Set(tables)];
  } catch { return []; }
}

/**
 * Extract known error codes from server-v2.js
 * Returns: ['empty_message', 'insufficient_credits', ...]
 */
function extractErrorCodes(serverPath) {
  try {
    const src = fs.readFileSync(serverPath, 'utf8');
    const codes = [];
    const re = /code:\s*['"`]([a-z_]+)['"`]/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      codes.push(m[1]);
    }
    return [...new Set(codes)];
  } catch { return []; }
}

/**
 * Count lines and get file size for a source file
 */
function fileStat(filePath) {
  try {
    const src = fs.readFileSync(filePath, 'utf8');
    return { lines: src.split('\n').length, bytes: Buffer.byteLength(src) };
  } catch { return { lines: 0, bytes: 0 }; }
}

/**
 * Get package version
 */
function getVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  } catch { return 'unknown'; }
}

// ============================================================
// 2. buildContext() — the core function
// ============================================================

/**
 * Scans the codebase and produces a compressed system context string.
 * Target: <2000 tokens (~1500 words / ~6000 chars).
 *
 * Returns { context: string, hash: string, builtAt: string, tokenEstimate: number }
 */
function buildContext(opts = {}) {
  const serverPath = path.join(ROOT, 'server-v2.js');
  const cliPath = path.join(ROOT, 'cli.js');
  const handlersDir = path.join(ROOT, 'handlers');

  // --- Extract everything ---
  const version = getVersion();
  const routes = extractRoutes(serverPath);
  const dbTables = extractDBTables(serverPath);
  const errorCodes = extractErrorCodes(serverPath);
  const cliCommands = extractCLICommands(cliPath);

  // Handler files and their exported keys
  const handlerFiles = [];
  try {
    const files = fs.readdirSync(handlersDir).filter(f => f.endsWith('.js')).sort();
    for (const f of files) {
      const keys = extractHandlerKeys(path.join(handlersDir, f));
      handlerFiles.push({ file: f, handlers: keys.length, sample: keys.slice(0, 5) });
    }
  } catch {}

  // Key file stats
  const keyFiles = [
    'server-v2.js', 'cli.js', 'registry.js', 'schemas.js',
    'mcp-server.js', 'pipes.js', 'zapier.js', 'auth.js',
  ];
  const fileStats = {};
  for (const f of keyFiles) {
    const s = fileStat(path.join(ROOT, f));
    if (s.lines > 0) fileStats[f] = s.lines;
  }

  // --- Categorize routes for compact display ---
  const routeGroups = {};
  for (const r of routes) {
    // Group by first two path segments: /v1/hive/* -> "hive"
    const parts = r.path.split('/').filter(Boolean);
    const group = parts[1] || parts[0] || 'root';
    if (!routeGroups[group]) routeGroups[group] = [];
    routeGroups[group].push(`${r.method} ${r.path}`);
  }

  // --- Compact route summary (top groups only) ---
  const routeSummary = Object.entries(routeGroups)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .map(([group, endpoints]) => {
      if (endpoints.length <= 3) {
        return endpoints.join(', ');
      }
      return `${group}/ (${endpoints.length} endpoints): ${endpoints.slice(0, 2).join(', ')}, ...`;
    })
    .join('\n');

  // --- Handler summary ---
  const handlerSummary = handlerFiles
    .map(h => `${h.file} (${h.handlers} fns)${h.sample.length ? ': ' + h.sample.join(', ') : ''}`)
    .join('\n');

  // --- Sprint context ---
  const sprint = loadSprintContext();

  // --- Assemble the context string ---
  const context = `=== SLOPSHOP CODEBASE CONTEXT v${version} ===
Built: ${new Date().toISOString().slice(0, 16)}

PROJECT: Slopshop.gg — API platform for AI agents. 1255+ APIs, MCP server, persistent memory, multi-LLM orchestration, hive workspaces.
STACK: Node.js/Express, SQLite (better-sqlite3), no ORM. Single-file server (server-v2.js).
ENTRY: node server-v2.js (port 3000). CLI: node cli.js or "slop" command.

FILE STRUCTURE (lines):
${Object.entries(fileStats).map(([f, l]) => `  ${f}: ${l}L`).join('\n')}
  handlers/: ${handlerFiles.length} files, ${handlerFiles.reduce((s, h) => s + h.handlers, 0)} total handlers

KEY ENDPOINTS (${routes.length} total):
${routeSummary}

HANDLERS:
${handlerSummary}

DB TABLES: ${dbTables.join(', ')}

CLI COMMANDS: ${cliCommands.join(', ')}

ERROR CODES: ${errorCodes.slice(0, 15).join(', ')}${errorCodes.length > 15 ? ` (+${errorCodes.length - 15} more)` : ''}

ARCHITECTURE RULES:
- All handlers are real (zero mocks). Handler returns { _engine: 'real', ...data }.
- Auth via API key in Authorization header. Credits system (1-20cr per call).
- Three tiers: compute (pure, no deps), llm (needs API key), network (dns/http/tls).
- Registry pattern: registry.js defines API, schemas.js defines I/O, handlers/*.js implements.
- Hive = always-on agent workspace. SQLite tables: hives, hive_messages, hive_state.
- Agent chains: create chain with steps, advance through models sequentially.
- Memory: persistent KV store per API key. Search via memory-search endpoint.

KNOWN ISSUES:
- loadConfig() in cli.js returns Promise.reject on missing config (should return {})
- String template literal on server-v2.js line 77 has backtick formatting issue
- Local LLM calls in hive-v2.js use raw HTTP to Ollama (no slop CLI integration yet)

RUN/TEST:
  node server-v2.js           # start server
  node audit.js                # full audit
  node cli.js health           # health check
  node cli.js call <slug>      # call any API
  node hive-v2.js [sprints]    # run hive sprints
${sprint ? '\nSPRINT CONTEXT:\n' + sprint : ''}`;

  const hash = crypto.createHash('md5').update(context).digest('hex').slice(0, 8);
  // Rough token estimate: ~4 chars per token for English
  const tokenEstimate = Math.ceil(context.length / 4);

  const result = { context, hash, builtAt: new Date().toISOString(), tokenEstimate };

  // Cache to disk
  try {
    const dataDir = path.join(ROOT, '.data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2));
  } catch {}

  return result;
}

// ============================================================
// 3. SPRINT CONTEXT — what was built, what failed, CEO direction
// ============================================================

const SPRINT_FILE = path.join(ROOT, '.data', 'sprint-context.json');

/**
 * Load sprint context from disk.
 * Returns formatted string or null.
 */
function loadSprintContext() {
  try {
    const sprint = JSON.parse(fs.readFileSync(SPRINT_FILE, 'utf8'));
    const lines = [];
    if (sprint.name) lines.push(`Sprint: ${sprint.name}`);
    if (sprint.built) lines.push(`Built: ${sprint.built.join(', ')}`);
    if (sprint.failed) lines.push(`Failed: ${sprint.failed.join(', ')}`);
    if (sprint.direction) lines.push(`CEO Direction: ${sprint.direction}`);
    if (sprint.focus) lines.push(`Focus: ${sprint.focus}`);
    if (sprint.blockers) lines.push(`Blockers: ${sprint.blockers.join(', ')}`);
    return lines.join('\n');
  } catch { return null; }
}

/**
 * Update sprint context. Called manually or by CI.
 *
 * Example:
 *   updateSprintContext({
 *     name: 'Sprint 12 — Chain Reliability',
 *     built: ['chain/create endpoint', 'chain/advance retry logic', 'hive debate mode'],
 *     failed: ['chain/advance timeout >30s on 5-step chains', 'Ollama streaming broke on mistral'],
 *     direction: 'Focus on chain reliability. No new features until chains work e2e.',
 *     focus: 'Make agent chains bulletproof',
 *     blockers: ['Ollama OOM on 13B models with >2k context'],
 *   });
 */
function updateSprintContext(sprint) {
  sprint.updatedAt = new Date().toISOString();
  const dataDir = path.join(ROOT, '.data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(SPRINT_FILE, JSON.stringify(sprint, null, 2));
  return sprint;
}

// ============================================================
// 4. CONTEXT INJECTION — wraps prompts for local LLMs
// ============================================================

/**
 * Inject codebase context into a prompt for a local LLM.
 *
 * @param {object} ctx - Output of buildContext()
 * @param {string} prompt - The user/task prompt
 * @param {object} opts - { role: 'developer'|'reviewer'|'qa', sprintOverride: string }
 * @returns {string} The full prompt with context prepended
 */
function injectContext(ctx, prompt, opts = {}) {
  const role = opts.role || 'developer';

  const roleInstructions = {
    developer: 'You are a developer working on this codebase. Follow the architecture rules. Return real implementations, not mocks.',
    reviewer: 'You are reviewing code for this project. Check for: missing error handling, credit deduction bugs, auth bypasses, SQLite injection.',
    qa: 'You are QA testing this platform. Focus on: endpoint correctness, edge cases, error codes, credit math.',
    architect: 'You are the system architect. Evaluate decisions against: scalability, protocol-first design, composability, solo-builder DX.',
  };

  return `<system>
${roleInstructions[role] || roleInstructions.developer}

${ctx.context}
</system>

${prompt}`;
}

// ============================================================
// 5. WATCH AND REBUILD — keeps context fresh
// ============================================================

/**
 * Watch key files and rebuild context on change.
 * Call this once when the hive starts.
 *
 * @param {function} onChange - callback(newCtx) when context is rebuilt
 * @returns {{ stop: function, ctx: object }} - stop watcher + initial context
 */
function watchAndRebuild(onChange) {
  let ctx = buildContext();
  let debounce = null;
  const watchers = [];

  const watchFiles = [
    path.join(ROOT, 'server-v2.js'),
    path.join(ROOT, 'cli.js'),
    path.join(ROOT, 'registry.js'),
    path.join(ROOT, 'schemas.js'),
    path.join(ROOT, 'package.json'),
    SPRINT_FILE,
  ];

  // Also watch handler directory
  const handlersDir = path.join(ROOT, 'handlers');

  const rebuild = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const oldHash = ctx.hash;
      ctx = buildContext();
      if (ctx.hash !== oldHash && onChange) {
        onChange(ctx);
      }
    }, 1000); // 1s debounce — files often save in bursts
  };

  for (const f of watchFiles) {
    try {
      watchers.push(fs.watch(f, rebuild));
    } catch {} // file may not exist yet
  }

  try {
    watchers.push(fs.watch(handlersDir, rebuild));
  } catch {}

  return {
    ctx,
    stop: () => {
      if (debounce) clearTimeout(debounce);
      watchers.forEach(w => w.close());
    },
  };
}

// ============================================================
// 6. CACHED LOAD — use cached context if fresh, rebuild if stale
// ============================================================

/**
 * Load context from cache if <5 minutes old, otherwise rebuild.
 * Use this for quick hive startups.
 */
function loadOrBuild(maxAgeMs = 5 * 60 * 1000) {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const age = Date.now() - new Date(cached.builtAt).getTime();
    if (age < maxAgeMs && cached.context) {
      return cached;
    }
  } catch {}
  return buildContext();
}

// ============================================================
// 7. EXPORTS
// ============================================================

module.exports = {
  buildContext,
  injectContext,
  watchAndRebuild,
  loadOrBuild,
  updateSprintContext,
  loadSprintContext,
  // Extractors (for testing/debugging)
  extractRoutes,
  extractHandlerKeys,
  extractCLICommands,
  extractDBTables,
  extractErrorCodes,
};

// ============================================================
// 8. CLI MODE — run directly to see/test the context
// ============================================================

if (require.main === module) {
  const cmd = process.argv[2];

  if (cmd === 'sprint') {
    // node hive-context.js sprint '{"name":"Sprint 12","built":["chains"],"direction":"reliability"}'
    const data = JSON.parse(process.argv[3] || '{}');
    updateSprintContext(data);
    console.log('Sprint context updated.');
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  }

  if (cmd === 'json') {
    const ctx = buildContext();
    console.log(JSON.stringify(ctx, null, 2));
    process.exit(0);
  }

  if (cmd === 'watch') {
    const { ctx, stop } = watchAndRebuild((newCtx) => {
      console.log(`\n--- Context rebuilt (hash: ${newCtx.hash}, ~${newCtx.tokenEstimate} tokens) ---\n`);
    });
    console.log(`Watching for changes... (hash: ${ctx.hash}, ~${ctx.tokenEstimate} tokens)`);
    console.log('Press Ctrl+C to stop.\n');
    process.on('SIGINT', () => { stop(); process.exit(0); });
    return;
  }

  // Default: print the context
  const ctx = buildContext();
  console.log(ctx.context);
  console.log('\n--- Stats ---');
  console.log(`Hash: ${ctx.hash}`);
  console.log(`Chars: ${ctx.context.length}`);
  console.log(`Token estimate: ~${ctx.tokenEstimate}`);
  console.log(`Built: ${ctx.builtAt}`);
}
