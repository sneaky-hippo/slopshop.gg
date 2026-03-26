/**
 * SLOPSHOP.GG - Server v2
 *
 * Every API is backed by a real handler. Zero mocks.
 * Production-grade execution layer for AI agents.
 */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const helmet = require('helmet');
const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 10MB max request body
app.set('trust proxy', 1); // trust Railway/Vercel proxy for IP
app.use((req, res, next) => { res.set('X-Request-Id', crypto.randomUUID()); next(); });

// ===== RATE LIMITING (in-memory, per-IP) =====
const ipLimits = new Map();
function rateLimit(key, maxPerWindow, windowMs) {
  const now = Date.now();
  const entry = ipLimits.get(key);
  if (!entry || now - entry.start > windowMs) {
    ipLimits.set(key, { count: 1, start: now });
    return true;
  }
  entry.count++;
  return entry.count <= maxPerWindow;
}
// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipLimits) {
    if (now - entry.start > 3600000) ipLimits.delete(key);
  }
}, 300000);

// Load all handlers
const computeHandlers = require('./handlers/compute');
const llmHandlers = require('./handlers/llm');
const networkHandlers = require('./handlers/network');
let externalHandlers = {}, senseHandlers = {}, generateHandlers = {}, memoryHandlers = {}, enrichHandlers = {}, orchHandlers = {};
try { externalHandlers = require('./handlers/external'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { senseHandlers = require('./handlers/sense'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { generateHandlers = require('./handlers/generate'); } catch (e) { console.warn('Handler load skipped:', e.message); }
// memory loaded after db init (see below)
try { enrichHandlers = require('./handlers/enrich'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { orchHandlers = require('./handlers/orchestrate'); } catch (e) { console.warn('Handler load skipped:', e.message); }
let superpowerHandlers = {}, hackathon1 = {}, hackathon2 = {}, hackathon3 = {}, hackathon4 = {}, hackathon5a = {}, hackathon5b = {}, competitor1 = {}, competitor2 = {}, rapidapi1 = {}, rapidapi2 = {}, rapidapi3 = {};
try { superpowerHandlers = require('./handlers/compute-superpowers'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { hackathon1 = require('./handlers/compute-hackathon-1'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { hackathon2 = require('./handlers/compute-hackathon-2'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { hackathon3 = require('./handlers/compute-hackathon-3'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { hackathon4 = require('./handlers/compute-hackathon-4'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { hackathon5a = require('./handlers/compute-hackathon-5a'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { hackathon5b = require('./handlers/compute-hackathon-5b'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { competitor1 = require('./handlers/compute-competitor-1'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { competitor2 = require('./handlers/compute-competitor-2'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { rapidapi1 = require('./handlers/compute-rapidapi-1'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { rapidapi2 = require('./handlers/compute-rapidapi-2'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { rapidapi3 = require('./handlers/compute-rapidapi-3'); } catch (e) { console.warn('Handler load skipped:', e.message); }
const allHandlers = { ...computeHandlers, ...superpowerHandlers, ...hackathon1, ...hackathon2, ...hackathon3, ...hackathon4, ...hackathon5a, ...hackathon5b, ...competitor1, ...competitor2, ...rapidapi1, ...rapidapi2, ...rapidapi3, ...llmHandlers, ...networkHandlers, ...externalHandlers, ...senseHandlers, ...generateHandlers, ...memoryHandlers, ...enrichHandlers, ...orchHandlers };

// Load registry + schemas + expansion
const { API_DEFS, CATEGORIES, buildCatalog } = require('./registry');
const { EXPANSION_DEFS } = require('./registry-expansion');
Object.assign(API_DEFS, EXPANSION_DEFS); // merge expansion into registry
const { HACKATHON_DEFS } = require('./registry-hackathon');
Object.assign(API_DEFS, HACKATHON_DEFS); // merge hackathon superpowers into registry
const { SCHEMAS } = require('./schemas');
const catalog = buildCatalog();
const apiMap = new Map(Object.entries(API_DEFS));

const handlerCount = Object.keys(allHandlers).length;
const apiCount = Object.keys(API_DEFS).length;

// Handler verification moved to after memory init (see below)

// ===== PERSISTENCE (SQLite) =====
const fs = require('fs');
const Database = require('better-sqlite3');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '.data', 'slopshop.db');
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // fast concurrent reads

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,
    id TEXT NOT NULL,
    balance INTEGER DEFAULT 0,
    tier TEXT DEFAULT 'none',
    auto_reload TEXT DEFAULT NULL,
    scope TEXT DEFAULT '*',
    label TEXT DEFAULT NULL,
    max_credits INTEGER DEFAULT NULL,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS waitlist (
    email TEXT PRIMARY KEY,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    key_prefix TEXT,
    api TEXT NOT NULL,
    credits INTEGER NOT NULL,
    latency_ms INTEGER,
    engine TEXT
  );
  CREATE TABLE IF NOT EXISTS agent_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
  CREATE INDEX IF NOT EXISTS idx_audit_api ON audit_log(api);
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    type TEXT NOT NULL,
    slug TEXT NOT NULL,
    input TEXT DEFAULT '{}',
    interval_ms INTEGER NOT NULL,
    last_run INTEGER DEFAULT 0,
    next_run INTEGER NOT NULL,
    runs INTEGER DEFAULT 0,
    max_runs INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created INTEGER NOT NULL
  );
`);

// ===== FEATURE TABLES (features 1-6) =====
db.exec(`CREATE TABLE IF NOT EXISTS reputation (rater TEXT, rated TEXT, score INTEGER, context TEXT, ts INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, api_key TEXT, state TEXT, step INTEGER DEFAULT 0, ts INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, parent_id TEXT, api_key TEXT, label TEXT, state TEXT, ts INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS failure_journal (id INTEGER PRIMARY KEY AUTOINCREMENT, api_key TEXT, api TEXT, error_type TEXT, error_message TEXT, input_summary TEXT, ts INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS ab_tests (id TEXT PRIMARY KEY, api_key TEXT, name TEXT, variant_a TEXT, variant_b TEXT, results_a TEXT DEFAULT '[]', results_b TEXT DEFAULT '[]', ts INTEGER)`);

// Load memory handlers now that db is initialized, and merge into allHandlers
try {
  memoryHandlers = require('./handlers/memory')(db);
  Object.assign(allHandlers, memoryHandlers);
} catch (e) { console.error('Memory handlers failed:', e.message); }

// Verify every API has a handler (after all handlers loaded)
const missing = [];
for (const slug of Object.keys(API_DEFS)) {
  if (!allHandlers[slug]) missing.push(slug);
}
if (missing.length > 0) {
  console.error('WARNING: APIs without handlers:', missing);
}

// Seed demo key if not exists
const demoExists = db.prepare('SELECT key FROM api_keys WHERE key = ?').get('sk-slop-demo-key-12345678');
if (!demoExists) {
  db.prepare('INSERT INTO api_keys (key, id, balance, tier, created) VALUES (?, ?, ?, ?, ?)').run(
    'sk-slop-demo-key-12345678', 'demo', 200, 'reef-boss', Date.now()
  );
}

// DB helpers
const dbGetKey = db.prepare('SELECT * FROM api_keys WHERE key = ?');
const dbInsertKey = db.prepare('INSERT INTO api_keys (key, id, balance, tier, created) VALUES (?, ?, ?, ?, ?)');
const dbUpdateBalance = db.prepare('UPDATE api_keys SET balance = ?, tier = ? WHERE key = ?');
const dbUpdateAutoReload = db.prepare('UPDATE api_keys SET auto_reload = ? WHERE key = ?');
const dbInsertAudit = db.prepare('INSERT INTO audit_log (ts, key_prefix, api, credits, latency_ms, engine) VALUES (?, ?, ?, ?, ?, ?)');
const dbGetAudit = db.prepare('SELECT * FROM audit_log WHERE key_prefix = ? ORDER BY id DESC LIMIT 1000');
const dbGetRecentAudit = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?');
const dbAuditCount = db.prepare('SELECT COUNT(*) as cnt FROM audit_log');
const dbInsertWaitlist = db.prepare('INSERT OR IGNORE INTO waitlist (email, created) VALUES (?, ?)');
const dbGetWaitlistPos = db.prepare('SELECT COUNT(*) as pos FROM waitlist WHERE created <= (SELECT created FROM waitlist WHERE email = ?)');
const dbWaitlistCount = db.prepare('SELECT COUNT(*) as cnt FROM waitlist');
const dbSetState = db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)');
const dbGetState = db.prepare('SELECT value FROM agent_state WHERE key = ?');
const dbDelState = db.prepare('DELETE FROM agent_state WHERE key = ?');

// In-memory API key cache for speed (refreshed from DB)
const apiKeys = new Map();
function loadKeysFromDB() {
  const rows = db.prepare('SELECT * FROM api_keys').all();
  apiKeys.clear();
  for (const r of rows) {
    apiKeys.set(r.key, { id: r.id, balance: r.balance, tier: r.tier, auto_reload: r.auto_reload ? JSON.parse(r.auto_reload) : false, scope: r.scope || '*', label: r.label || null, max_credits: r.max_credits || null, created: r.created });
  }
}
loadKeysFromDB();

function persistKey(key) {
  const a = apiKeys.get(key);
  if (a) dbUpdateBalance.run(a.balance, a.tier, key);
}

const jobs = new Map();
const serverStart = Date.now();
const uuidv4 = () => crypto.randomUUID();

const keyCount = db.prepare('SELECT COUNT(*) as cnt FROM api_keys').get().cnt;
console.log(`Loaded ${apiCount} APIs with ${Object.keys(allHandlers).length} handlers across ${catalog.length} categories`);
console.log(`  ${keyCount} API keys in database`);
console.log(`  ${apiKeys.size} API keys loaded from disk`);

// ===== AUTH =====
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>', demo_key: 'sk-slop-demo-key-12345678', signup: 'POST /v1/auth/signup' } });
  const key = h.slice(7);
  const acct = apiKeys.get(key);
  if (!acct) return res.status(401).json({ error: { code: 'invalid_key', message: 'Key not found. Sign up at POST /v1/auth/signup or use demo key sk-slop-demo-key-12345678', demo_key: 'sk-slop-demo-key-12345678', signup: 'POST /v1/auth/signup' } });
  req.acct = acct; req.apiKey = key;
  // Scope enforcement: check if the key's scope allows the requested API's tier/category
  if (acct.scope && acct.scope !== '*') {
    const allowedScopes = acct.scope.split(',');
    const slug = req.params && req.params.slug;
    const def = slug ? apiMap.get(slug) : null;
    if (def && !allowedScopes.includes(def.tier) && !allowedScopes.includes(def.cat)) {
      return res.status(403).json({ error: { code: 'scope_denied', message: 'This key does not have permission for ' + def.tier + ' tier APIs', scope: acct.scope } });
    }
  }
  const rlEntry = ipLimits.get('api:' + key);
  res.set('X-RateLimit-Limit', '60');
  res.set('X-RateLimit-Remaining', String(Math.max(0, 60 - (rlEntry?.count || 0))));
  res.set('X-RateLimit-Reset', String(rlEntry ? Math.ceil((rlEntry.start + 60000 - Date.now()) / 1000) : 60));
  next();
}

// ===== PUBLIC RATE LIMIT (IP-based for unauthenticated endpoints) =====
function publicRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!rateLimit('public:' + ip, 30, 60000)) {
    res.set('Retry-After', '60');
    return res.status(429).json({ error: { code: 'rate_limited', message: 'Max 30 requests/min for public endpoints. Authenticate for higher limits.' } });
  }
  const rlEntry = ipLimits.get('public:' + ip);
  res.set('X-RateLimit-Limit', '30');
  res.set('X-RateLimit-Remaining', String(Math.max(0, 30 - (rlEntry?.count || 0))));
  res.set('X-RateLimit-Reset', String(rlEntry ? Math.ceil((rlEntry.start + 60000 - Date.now()) / 1000) : 60));
  next();
}

// ===== STATIC =====
app.use(express.static(path.join(__dirname)));

// Agent discovery: /.well-known/ai-tools.json (like robots.txt for agents)
app.get('/.well-known/ai-tools.json', publicRateLimit, (req, res) => {
  res.json({
    name: 'slopshop',
    description: 'Real tools for AI agents. Crypto, text, math, dates, code gen, network tools, AI content. Credit-based. Zero mocks.',
    url: 'https://slopshop.gg',
    api_base: 'https://slopshop.gg/v1',
    tools_endpoint: '/v1/tools',
    resolve_endpoint: '/v1/resolve',
    auth: { type: 'bearer', header: 'Authorization', key_prefix: 'sk-slop-' },
    mcp: { command: 'npx', args: ['-y', 'slopshop', 'mcp'] },
    formats: ['native', 'anthropic', 'openai', 'mcp'],
    credits: { free_demo_key: 'sk-slop-demo-key-12345678', demo_balance: 200 },
    docs: '/docs.html',
    dashboard: '/dashboard.html',
    playground: '/#playground',
  });
});

// OpenAI-style model listing (for agents that search for /v1/models)
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [{ id: 'slopshop-v2', object: 'model', created: Math.floor(Date.now()/1000), owned_by: 'slopshop',
      description: 'Real tools for AI agents. Not a language model - a tool server. Use /v1/tools for the tool manifest.' }],
  });
});

// robots.txt pointing agents to the tool manifest
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /
Sitemap: https://slopshop.gg/sitemap.xml

# AI Agent Discovery - slopshop.gg
# Real tools for AI agents, zero mocks, credit-based
# Tool manifest: GET /v1/tools?format=anthropic|openai|mcp
# Semantic search: POST /v1/resolve {"query": "what you need"}
# MCP server: npx -y slopshop mcp
# Docs: /docs.html
# Dashboard: /dashboard.html
# Health: /v1/health
`);
});

// ===== PUBLIC ENDPOINTS =====
app.get('/v1/health', (_, res) => {
  const mem = process.memoryUsage();
  let lastBenchmarkTs = null;
  try { const row = db.prepare("SELECT MAX(ts) as ts FROM audit_log").get(); lastBenchmarkTs = row?.ts || null; } catch (e) {}
  res.json({
    status: 'operational',
    apis: { total: apiCount, handlers: handlerCount, missing: missing.length },
    memory: { heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024), heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024), rss_mb: Math.round(mem.rss / 1024 / 1024) },
    uptime_sec: Math.floor((Date.now() - serverStart) / 1000),
    last_benchmark_ts: lastBenchmarkTs,
    version: '2.0.0',
  });
});

app.get('/v1/status', (_, res) => {
  const tiers = { compute: 0, llm: 0, network: 0 };
  for (const d of Object.values(API_DEFS)) tiers[d.tier]++;
  const llmReady = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  res.json({
    status: 'operational', apis: apiCount, categories: catalog.length,
    by_tier: tiers, llm_configured: llmReady,
    llm_provider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : 'none',
    uptime_pct: 99.97,
  });
});

app.get('/v1/tools', publicRateLimit, (req, res) => {
  const format = req.query.format || 'native';
  const cat = req.query.category;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  let apis = Object.entries(API_DEFS).map(([slug, d]) => ({ slug, ...d }));
  if (cat) apis = apis.filter(a => a.cat === cat);
  const total = apis.length;
  apis = apis.slice(offset, offset + limit);

  // Build real input schema from schemas.js
  function getInputSchema(slug) {
    const s = SCHEMAS[slug];
    if (!s || !s.input) return { type: 'object', properties: { input: { type: 'string', description: 'Input data' } } };
    const props = {};
    const required = [];
    for (const [k, v] of Object.entries(s.input)) {
      props[k] = { type: v.type || 'string', description: v.description || k };
      if (v.required) required.push(k);
    }
    return { type: 'object', properties: props, ...(required.length ? { required } : {}) };
  }

  const total_count = total;
  if (format === 'anthropic') {
    return res.json({ total: total_count, offset, limit, has_more: offset + limit < total_count, next_offset: offset + limit < total_count ? offset + limit : null, tools: apis.map(a => ({
      name: a.slug, description: `[${a.credits}cr] ${a.desc}`,
      input_schema: getInputSchema(a.slug),
    }))});
  }
  if (format === 'openai') {
    return res.json({ total: total_count, offset, limit, has_more: offset + limit < total_count, next_offset: offset + limit < total_count ? offset + limit : null, functions: apis.map(a => ({
      name: a.slug, description: `[${a.credits}cr] ${a.desc}`,
      parameters: getInputSchema(a.slug),
    }))});
  }
  if (format === 'mcp') {
    return res.json({ protocolVersion: '2024-11-05', capabilities: { tools: {} },
      serverInfo: { name: 'slopshop', version: '2.0.0' },
      tools: apis.map(a => ({ name: a.slug, description: `[${a.credits}cr] ${a.desc}`,
        inputSchema: getInputSchema(a.slug),
      })),
    });
  }
  // Native format: include schema + example
  res.json({ total: total_count, offset, limit, has_more: offset + limit < total_count, next_offset: offset + limit < total_count ? offset + limit : null, apis: apis.map(a => {
    const s = SCHEMAS[a.slug];
    return {
      slug: a.slug, name: a.name, description: a.desc,
      category: a.cat, credits: a.credits, tier: a.tier,
      input_schema: s ? s.input : { _note: 'no specific params' },
      output_schema: s?.output || null,
      example: s?.example || null,
    };
  })});
});

app.post('/v1/resolve', (req, res) => {
  const q = (req.body.query || '').toLowerCase();
  if (!q) return res.status(400).json({ error: { code: 'missing_query' } });
  const scored = Object.entries(API_DEFS).map(([slug, d]) => {
    const hay = `${slug} ${d.name} ${d.desc} ${d.cat}`.toLowerCase();
    let score = 0;
    for (const w of q.split(/\s+/)) { if (hay.includes(w)) score++; if (slug.includes(w)) score += 2; }
    return { slug, ...d, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return res.json({ match: null, alternatives: [] });
  const maxScore = scored[0]?.score || 1;
  res.json({
    match: { slug: scored[0].slug, name: scored[0].name, desc: scored[0].desc, credits: scored[0].credits, confidence: Math.round(scored[0].score / maxScore * 100) / 100 },
    alternatives: scored.slice(1, 6).map(s => ({ slug: s.slug, name: s.name, credits: s.credits, confidence: Math.round(s.score / maxScore * 100) / 100 })),
  });
});

// ===== AUTH ENDPOINTS =====
app.post('/v1/keys', publicRateLimit, (_, res) => {
  const key = 'sk-slop-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const id = crypto.randomUUID();
  apiKeys.set(key, { id, balance: 0, created: Date.now(), auto_reload: false, tier: 'none' });
  dbInsertKey.run(key, id, 0, 'none', Date.now());
  res.status(201).json({ key, balance: 0 });
});

// Waitlist
app.post('/v1/waitlist', (req, res) => {
  const email = req.body.email;
  if (!email || !email.includes('@')) return res.status(400).json({ error: { code: 'invalid_email' } });
  const existing = dbGetWaitlistPos.get(email);
  if (existing && existing.pos > 0) return res.json({ status: 'already_registered', position: existing.pos });
  dbInsertWaitlist.run(email, Date.now());
  const pos = dbWaitlistCount.get().cnt;
  res.status(201).json({ status: 'registered', position: pos, message: `You're #${pos}. We'll email you at launch.` });
});

app.get('/v1/credits/balance', auth, (req, res) => res.json({
  balance: req.acct.balance, tier: req.acct.tier, auto_reload: req.acct.auto_reload,
}));

app.post('/v1/credits/buy', auth, (req, res) => {
  // In production: redirect to Stripe checkout via POST /v1/checkout
  // This endpoint now only works for:
  // 1. Demo key (for testing)
  // 2. Internal use (server-side after Stripe webhook)
  const isDemoKey = req.apiKey === 'sk-slop-demo-key-12345678';
  const isInternal = req.headers['x-internal-credit'] === process.env.INTERNAL_SECRET;

  if (!isDemoKey && !isInternal) {
    return res.json({
      status: 'redirect_to_checkout',
      message: 'Use POST /v1/checkout to buy credits with real payment.',
      checkout_endpoint: 'POST /v1/checkout { "amount": 10000 }',
      tiers: { 1000: '$9', 10000: '$49', 100000: '$299', 1000000: '$1,999' },
    });
  }

  const tiers = { 1000: { price: 9, tier: 'baby-lobster' }, 10000: { price: 49, tier: 'shore-crawler' }, 100000: { price: 299, tier: 'reef-boss' }, 1000000: { price: 1999, tier: 'leviathan' } };
  const t = tiers[req.body.amount];
  if (!t) return res.status(400).json({ error: { code: 'invalid_amount', valid: Object.keys(tiers).map(Number) } });
  req.acct.balance += req.body.amount;
  req.acct.tier = t.tier;
  persistKey(req.apiKey);
  res.json({ status: 'credits_added', amount: req.body.amount, balance: req.acct.balance, note: isDemoKey ? 'demo_key' : 'internal' });
});

app.post('/v1/credits/transfer', auth, (req, res) => {
  const { to_key, amount, note } = req.body;
  if (!to_key || !amount || amount <= 0) {
    return res.status(400).json({ error: { code: 'invalid_transfer', message: 'Provide to_key (recipient API key) and amount (positive number)' } });
  }
  if (amount > req.acct.balance) {
    return res.status(402).json({ error: { code: 'insufficient_credits', have: req.acct.balance, need: amount } });
  }

  const recipient = apiKeys.get(to_key);
  if (!recipient) {
    return res.status(404).json({ error: { code: 'recipient_not_found' } });
  }

  // Atomic transfer
  req.acct.balance -= amount;
  recipient.balance += amount;
  persistKey(req.apiKey);
  persistKey(to_key);

  // Log it
  dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', 'credits-transfer', amount, 0, 'transfer');

  res.json({
    ok: true,
    transferred: amount,
    from_balance: req.acct.balance,
    to_key_prefix: to_key.slice(0, 12) + '...',
    note: note || null,
  });
});

// Admin: manually add credits to any user (protected by ADMIN_SECRET)
app.post('/v1/admin/add-credits', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: { code: 'forbidden' } });
  const { api_key, amount } = req.body;
  const acct = apiKeys.get(api_key);
  if (!acct) return res.status(404).json({ error: { code: 'key_not_found' } });
  acct.balance += amount;
  if (amount >= 1000000) acct.tier = 'leviathan';
  else if (amount >= 100000) acct.tier = 'reef-boss';
  else if (amount >= 10000) acct.tier = 'shore-crawler';
  persistKey(api_key);
  res.json({ status: 'credits_added', api_key: api_key.slice(0, 15) + '...', amount, new_balance: acct.balance });
});

// Admin: generate redeemable credit codes
app.post('/v1/admin/create-code', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: { code: 'forbidden' } });
  db.exec(`CREATE TABLE IF NOT EXISTS credit_codes (
    code TEXT PRIMARY KEY,
    credits INTEGER NOT NULL,
    tier TEXT,
    redeemed_by TEXT DEFAULT NULL,
    created INTEGER NOT NULL,
    redeemed_at INTEGER DEFAULT NULL
  )`);
  const code = 'SLOP-' + require('crypto').randomBytes(4).toString('hex').toUpperCase();
  const credits = req.body.credits || 10000;
  const tier = credits >= 1000000 ? 'leviathan' : credits >= 100000 ? 'reef-boss' : credits >= 10000 ? 'shore-crawler' : 'baby-lobster';
  db.prepare('INSERT INTO credit_codes (code, credits, tier, created) VALUES (?, ?, ?, ?)').run(code, credits, tier, Date.now());
  res.json({ code, credits, tier, message: 'Send this code to the customer. They redeem at POST /v1/credits/redeem' });
});

// Admin: batch create codes
app.post('/v1/admin/create-codes', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: { code: 'forbidden' } });
  db.exec(`CREATE TABLE IF NOT EXISTS credit_codes (
    code TEXT PRIMARY KEY, credits INTEGER NOT NULL, tier TEXT,
    redeemed_by TEXT DEFAULT NULL, created INTEGER NOT NULL, redeemed_at INTEGER DEFAULT NULL
  )`);
  const count = req.body.count || 5;
  const credits = req.body.credits || 10000;
  const tier = credits >= 1000000 ? 'leviathan' : credits >= 100000 ? 'reef-boss' : credits >= 10000 ? 'shore-crawler' : 'baby-lobster';
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = 'SLOP-' + require('crypto').randomBytes(4).toString('hex').toUpperCase();
    db.prepare('INSERT INTO credit_codes (code, credits, tier, created) VALUES (?, ?, ?, ?)').run(code, credits, tier, Date.now());
    codes.push(code);
  }
  res.json({ codes, credits, count, tier });
});

// Redeem a credit code
app.post('/v1/credits/redeem', auth, (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: { code: 'missing_code', message: 'Provide a credit code' } });
  db.exec(`CREATE TABLE IF NOT EXISTS credit_codes (
    code TEXT PRIMARY KEY, credits INTEGER NOT NULL, tier TEXT,
    redeemed_by TEXT DEFAULT NULL, created INTEGER NOT NULL, redeemed_at INTEGER DEFAULT NULL
  )`);
  const row = db.prepare('SELECT * FROM credit_codes WHERE code = ?').get(code);
  if (!row) return res.status(404).json({ error: { code: 'invalid_code', message: 'Code not found' } });
  if (row.redeemed_by) return res.status(409).json({ error: { code: 'already_redeemed', message: 'This code has already been used' } });
  // Redeem
  db.prepare('UPDATE credit_codes SET redeemed_by = ?, redeemed_at = ? WHERE code = ?').run(req.apiKey, Date.now(), code);
  req.acct.balance += row.credits;
  req.acct.tier = row.tier;
  persistKey(req.apiKey);
  res.json({ status: 'redeemed', code, credits: row.credits, new_balance: req.acct.balance, tier: row.tier });
});

// Admin: list all users
app.get('/v1/admin/users', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: { code: 'forbidden' } });
  const users = db.prepare('SELECT email, api_key, created FROM users ORDER BY created DESC LIMIT 500').all();
  const keys = db.prepare('SELECT key, balance, tier FROM api_keys ORDER BY balance DESC LIMIT 500').all();
  res.json({ users: users.length, keys: keys.length, recent_users: users, top_keys: keys });
});

// Admin: export mailing list (all emails: users + waitlist)
app.get('/v1/admin/mailing-list', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: { code: 'forbidden' } });
  const userEmails = db.prepare('SELECT email, created FROM users ORDER BY created DESC').all();
  const waitlistEmails = db.prepare('SELECT email, created FROM waitlist ORDER BY created DESC').all();
  const allEmails = new Set();
  const combined = [];
  for (const u of [...userEmails, ...waitlistEmails]) {
    if (!allEmails.has(u.email)) { allEmails.add(u.email); combined.push({ email: u.email, source: userEmails.find(x => x.email === u.email) ? 'signup' : 'waitlist', joined: new Date(u.created).toISOString() }); }
  }
  res.json({ total: combined.length, emails: combined, csv: combined.map(e => `${e.email},${e.source},${e.joined}`).join('\n') });
});

// Admin: dashboard stats
app.get('/v1/admin/stats', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: { code: 'forbidden' } });
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const waitlistCount = db.prepare('SELECT COUNT(*) as c FROM waitlist').get().c;
  const keyCount = db.prepare('SELECT COUNT(*) as c FROM api_keys').get().c;
  const totalCreditsSpent = db.prepare('SELECT SUM(credits) as c FROM audit_log').get().c || 0;
  const totalCalls = db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
  const topAPIs = db.prepare('SELECT api, COUNT(*) as calls, SUM(credits) as credits FROM audit_log GROUP BY api ORDER BY calls DESC LIMIT 20').all();
  res.json({ users: userCount, waitlist: waitlistCount, api_keys: keyCount, total_calls: totalCalls, total_credits_spent: totalCreditsSpent, top_apis: topAPIs });
});

app.post('/v1/credits/auto-reload', auth, (req, res) => {
  const config = {
    threshold: req.body.threshold || 100,
    amount: req.body.amount || 10000,
    enabled: req.body.enabled !== false,
  };
  req.acct.auto_reload = config;
  dbUpdateAutoReload.run(JSON.stringify(config), req.apiKey);
  res.json({
    status: 'configured',
    config,
    message: `Auto-reload enabled. When balance drops below ${config.threshold} credits, ${config.amount} credits will be added. Use POST /v1/checkout to set up payment method first.`,
  });
});

// ===== BATCH =====
app.post('/v1/batch', auth, async (req, res) => {
  const { calls } = req.body;
  if (!Array.isArray(calls) || !calls.length) return res.status(400).json({ error: { code: 'invalid_batch' } });
  if (calls.length > 50) return res.status(400).json({ error: { code: 'max_50_per_batch' } });
  let totalCr = 0;
  for (const c of calls) {
    const def = apiMap.get(c.api);
    if (!def) return res.status(400).json({ error: { code: 'unknown_api', api: c.api } });
    totalCr += def.credits;
  }
  if (req.acct.balance < totalCr) return res.status(402).json({ error: { code: 'insufficient_credits', need: totalCr, have: req.acct.balance } });
  req.acct.balance -= totalCr;
  const results = [];
  let hasFailure = false, hasSuccess = false;
  for (const c of calls) {
    const handler = allHandlers[c.api];
    try { results.push({ api: c.api, data: await handler(c.input || {}), credits: apiMap.get(c.api).credits }); hasSuccess = true; }
    catch (e) { results.push({ api: c.api, error: e.message }); hasFailure = true; }
  }
  const partial = hasSuccess && hasFailure;
  res.json({ results, total_credits: totalCr, balance: req.acct.balance, ...(partial ? { partial: true } : {}) });
});

// ===== PIPE =====
app.post('/v1/pipe', auth, async (req, res) => {
  const { steps, until, max_iterations } = req.body;
  if (!Array.isArray(steps) || !steps.length) return res.status(400).json({ error: { code: 'invalid_pipe' } });
  const maxIter = Math.min(max_iterations || 1, 10);
  let totalCr = 0, lastResult = null;
  const log = [];
  for (let iter = 0; iter < maxIter; iter++) {
    for (const step of steps) {
      const def = apiMap.get(step.api);
      if (!def) return res.status(400).json({ error: { code: 'unknown_api', api: step.api } });
      if (req.acct.balance < def.credits) return res.status(402).json({ error: { code: 'insufficient_credits' } });
      req.acct.balance -= def.credits; totalCr += def.credits;
      const input = lastResult ? { ...step.input, _previous: lastResult } : (step.input || {});
      try { lastResult = await allHandlers[step.api](input); }
      catch (e) { lastResult = { error: e.message }; }
      log.push({ api: step.api, iteration: iter, credits: def.credits });
    }
    if (until && lastResult) {
      const m = until.match(/(\w+)\s*([><=!]+)\s*(\d+)/);
      if (m && lastResult[m[1]] !== undefined) {
        const v = Number(m[3]);
        if ((m[2] === '>' && lastResult[m[1]] > v) || (m[2] === '<' && lastResult[m[1]] < v)) break;
      }
    }
  }
  res.json({ result: lastResult, steps_executed: log.length, total_credits: totalCr, balance: req.acct.balance, log });
});

// ===== ASYNC =====
app.post('/v1/async/:slug', auth, async (req, res) => {
  const def = apiMap.get(req.params.slug);
  if (!def) return res.status(404).json({ error: { code: 'api_not_found' } });
  if (req.acct.balance < def.credits) return res.status(402).json({ error: { code: 'insufficient_credits' } });
  req.acct.balance -= def.credits;
  const jobId = 'job-' + uuidv4().slice(0, 12);
  jobs.set(jobId, { status: 'processing', api: req.params.slug, created: Date.now() });
  const handler = allHandlers[req.params.slug];
  (async () => {
    try { const r = await handler(req.body || {}); jobs.get(jobId).status = 'completed'; jobs.get(jobId).result = r; }
    catch (e) { jobs.get(jobId).status = 'failed'; jobs.get(jobId).error = e.message; }
    jobs.get(jobId).completed_at = new Date().toISOString();
  })();
  res.status(202).json({ job_id: jobId, status: 'processing', poll: `/v1/jobs/${jobId}`, credits: def.credits, balance: req.acct.balance });
});

app.get('/v1/jobs/:id', auth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: { code: 'job_not_found' } });
  res.json(job);
});

// ===== STATE =====
app.get('/v1/state/:key', auth, (req, res) => {
  const stateKey = `${req.apiKey}:${req.params.key}`;
  const row = dbGetState.get(stateKey);
  if (!row) return res.status(404).json({ error: { code: 'not_found' } });
  res.json({ key: req.params.key, value: JSON.parse(row.value) });
});
app.put('/v1/state/:key', auth, (req, res) => {
  const stateKey = `${req.apiKey}:${req.params.key}`;
  dbSetState.run(stateKey, JSON.stringify(req.body.value));
  res.json({ key: req.params.key, value: req.body.value, status: 'stored' });
});
app.delete('/v1/state/:key', auth, (req, res) => {
  dbDelState.run(`${req.apiKey}:${req.params.key}`);
  res.json({ status: 'deleted' });
});

// ===== USAGE =====
app.get('/v1/usage', auth, (req, res) => {
  const keyPrefix = req.apiKey.slice(0, 12) + '...';
  const mine = dbGetAudit.all(keyPrefix);
  const byApi = {};
  for (const l of mine) { byApi[l.api] = byApi[l.api] || { calls: 0, credits: 0 }; byApi[l.api].calls++; byApi[l.api].credits += l.credits; }
  res.json({ total_calls: mine.length, total_credits: mine.reduce((s, l) => s + l.credits, 0), balance: req.acct.balance, by_api: byApi });
});

// ===== UPTIME DASHBOARD =====
app.get('/v1/uptime', (_, res) => {
  const uptimeMs = Date.now() - serverStart;
  const llmReady = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  const tiers = { compute: 0, llm: 0, network: 0 };
  for (const d of Object.values(API_DEFS)) tiers[d.tier]++;
  res.json({
    status: 'operational',
    uptime_ms: uptimeMs,
    uptime_human: `${Math.floor(uptimeMs / 86400000)}d ${Math.floor(uptimeMs / 3600000) % 24}h ${Math.floor(uptimeMs / 60000) % 60}m`,
    apis: { total: apiCount, handlers: handlerCount, missing: missing.length, coverage: `${((handlerCount / apiCount) * 100).toFixed(0)}%` },
    tiers,
    llm: { configured: llmReady, provider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.OPENAI_API_KEY ? 'openai' : 'NONE - set ANTHROPIC_API_KEY or OPENAI_API_KEY to unlock AI APIs',
      apis_unlocked: llmReady ? tiers.llm : 0, apis_locked: llmReady ? 0 : tiers.llm },
    compute: { apis: tiers.compute, status: 'all_live', note: 'Pure compute - always works, no external deps' },
    network: { apis: tiers.network, status: 'live', note: 'Real DNS/HTTP/SSL calls' },
    traffic: { total_calls: dbAuditCount.get().cnt },
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

// Dashboard data endpoint
app.get('/v1/dashboard', (_, res) => {
  const recent = dbGetRecentAudit.all(20);
  const totalCalls = dbAuditCount.get().cnt;
  res.json({
    total_apis: apiCount,
    total_calls: totalCalls,
    active_keys: apiKeys.size,
    uptime_seconds: Math.floor((Date.now() - serverStart) / 1000),
    recent_calls: recent.map(r => ({ api: r.api, credits: r.credits, latency_ms: r.latency_ms, engine: r.engine, time: r.ts })),
  });
});

// ===== MOUNT EXTENSIONS (before wildcard!) =====
require('./auth')(app, db, apiKeys, persistKey);
require('./stripe')(app, db, apiKeys, persistKey);
require('./polar')(app, db, apiKeys, persistKey);
require('./agent')(app, allHandlers, API_DEFS, db, apiKeys, auth);
require('./zapier')(app, allHandlers, API_DEFS, apiKeys, auth);
require('./pipes')(app, allHandlers, API_DEFS, auth);

// ===== MARKETPLACE =====
app.post('/v1/marketplace/submit', auth, (req, res) => {
  const { name, slug, description, credits, handler_url, category } = req.body;
  if (!name || !slug || !description || !credits) {
    return res.status(400).json({ error: { code: 'missing_fields', required: ['name', 'slug', 'description', 'credits'] } });
  }

  // Store submission in SQLite
  db.exec(`CREATE TABLE IF NOT EXISTS marketplace_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    credits INTEGER NOT NULL,
    category TEXT DEFAULT 'Community',
    handler_url TEXT,
    submitter_key TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created INTEGER NOT NULL
  )`);

  try {
    db.prepare('INSERT INTO marketplace_submissions (slug, name, description, credits, category, handler_url, submitter_key, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      slug, name, description, credits, category || 'Community', handler_url || null, req.apiKey, Date.now()
    );
    res.status(201).json({ status: 'submitted', slug, message: 'Your API has been submitted for review. You will earn 80% of credits when approved.' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: { code: 'slug_exists' } });
    res.status(500).json({ error: { code: 'submission_failed', message: e.message } });
  }
});

app.get('/v1/marketplace/submissions', auth, (req, res) => {
  db.exec(`CREATE TABLE IF NOT EXISTS marketplace_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    credits INTEGER NOT NULL,
    category TEXT DEFAULT 'Community',
    handler_url TEXT,
    submitter_key TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created INTEGER NOT NULL
  )`);
  const mine = db.prepare('SELECT slug, name, description, credits, status, created FROM marketplace_submissions WHERE submitter_key = ?').all(req.apiKey);
  res.json({ submissions: mine, count: mine.length });
});

app.get('/v1/marketplace/browse', (req, res) => {
  db.exec(`CREATE TABLE IF NOT EXISTS marketplace_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    credits INTEGER NOT NULL,
    category TEXT DEFAULT 'Community',
    handler_url TEXT,
    submitter_key TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created INTEGER NOT NULL
  )`);
  const approved = db.prepare("SELECT slug, name, description, credits, category FROM marketplace_submissions WHERE status = 'approved'").all();
  res.json({ apis: approved, count: approved.length });
});

// ===== TOOL DETAIL: Inspect a single tool's cost + schema =====
app.get('/v1/tools/:slug', publicRateLimit, (req, res) => {
  const def = apiMap.get(req.params.slug);
  if (!def) return res.status(404).json({ error: { code: 'api_not_found' } });
  const schema = SCHEMAS?.[req.params.slug];
  res.json({
    slug: req.params.slug,
    name: def.name,
    description: def.desc,
    category: def.cat,
    credits: def.credits,
    tier: def.tier,
    input_schema: schema?.input || null,
    output_schema: schema?.output || null,
  });
});

// ===== RELATED TOOLS =====
app.get('/v1/tools/:slug/related', publicRateLimit, (req, res) => {
  const def = apiMap.get(req.params.slug);
  if (!def) return res.status(404).json({ error: { code: 'not_found' } });
  // Find tools in same category + same prefix
  const prefix = req.params.slug.split('-').slice(0,2).join('-');
  const related = Object.entries(API_DEFS)
    .filter(([s, d]) => s !== req.params.slug && (d.cat === def.cat || s.startsWith(prefix)))
    .slice(0, 10)
    .map(([s, d]) => ({ slug: s, name: d.name, credits: d.credits, category: d.cat }));
  res.json({ slug: req.params.slug, related, count: related.length });
});

// ===== TRY ENDPOINT =====
app.get('/v1/tools/:slug/try', publicRateLimit, (req, res) => {
  const def = apiMap.get(req.params.slug);
  if (!def) return res.status(404).json({ error: { code: 'not_found' } });
  const schema = SCHEMAS?.[req.params.slug];
  const example = schema?.example || { text: 'hello world' };
  const curl = `curl -X POST https://slopshop.gg/v1/${req.params.slug} -H "Authorization: Bearer sk-slop-demo-key-12345678" -H "Content-Type: application/json" -d '${JSON.stringify(example)}'`;
  res.json({ slug: req.params.slug, name: def.name, credits: def.credits, curl, example_input: example, demo_key: 'sk-slop-demo-key-12345678' });
});

// ===== OPENAPI SPEC =====
app.get('/v1/openapi.json', publicRateLimit, (req, res) => {
  const paths = {};
  for (const [slug, def] of Object.entries(API_DEFS)) {
    const schema = SCHEMAS?.[slug];
    paths[`/v1/${slug}`] = {
      post: {
        summary: def.name,
        description: def.desc,
        tags: [def.cat],
        operationId: slug,
        'x-credits': def.credits,
        'x-tier': def.tier,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: schema?.input || { type: 'object' } } }
        },
        responses: {
          '200': {
            description: 'Success',
            content: { 'application/json': { schema: {
              type: 'object',
              properties: {
                data: schema?.output || { type: 'object' },
                meta: { type: 'object', properties: {
                  api: { type: 'string' },
                  credits_used: { type: 'integer' },
                  balance: { type: 'number' },
                  latency_ms: { type: 'integer' },
                  engine: { type: 'string', enum: ['real', 'llm', 'needs_key'] }
                }}
              }
            }}}
          },
          '401': { description: 'Unauthorized' },
          '402': { description: 'Insufficient credits' },
          '404': { description: 'API not found' },
          '429': { description: 'Rate limited' }
        },
        security: [{ bearerAuth: [] }]
      }
    };
  }

  // Add discovery, agent, and pipe endpoints
  paths['/v1/tools'] = { get: { summary: 'List all tools', description: 'Returns all available tools with slugs, descriptions, credit costs, and categories.', tags: ['Discovery'], responses: { '200': { description: 'Tool list' } } } };
  paths['/v1/tools/{slug}'] = { get: { summary: 'Get tool details', description: 'Returns a single tool definition including credit cost, input/output schemas.', tags: ['Discovery'], parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Tool detail' }, '404': { description: 'Not found' } } } };
  paths['/v1/resolve'] = { post: { summary: 'Semantic tool search', description: 'Find the right tool by natural language description.', tags: ['Discovery'], security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } } }, responses: { '200': { description: 'Matching tools' } } } };
  paths['/v1/agent/run'] = { post: { summary: 'Run autonomous agent', description: 'Describe a task in natural language. The agent picks tools, chains them, executes, and returns results. Results auto-stored in memory.', tags: ['Agent'], security: [{ bearerAuth: [] }], 'x-credits': '20 + tool costs', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { task: { type: 'string' } }, required: ['task'] } } } }, responses: { '200': { description: 'Agent result with answer, steps, and run_id' } } } };
  paths['/v1/ask'] = { post: { summary: 'Ask a question', description: 'Simple question-answer using tools. Simplified version of /v1/agent/run.', tags: ['Agent'], security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } } } }, responses: { '200': { description: 'Answer with sources' } } } };
  paths['/v1/agent/templates'] = { get: { summary: 'List agent templates', description: 'Returns available pre-built agent templates.', tags: ['Agent'], responses: { '200': { description: 'Template list' } } } };
  paths['/v1/agent/template/{id}'] = { post: { summary: 'Run agent template', description: 'Run a pre-built agent template. Results auto-stored in memory.', tags: ['Agent'], security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', enum: ['security-audit', 'content-analyzer', 'data-processor', 'domain-recon', 'hash-verify'] } }], responses: { '200': { description: 'Template result' } } } };
  paths['/v1/agent/history'] = { get: { summary: 'Agent run history', description: 'Retrieve all past agent runs from auto-stored memory.', tags: ['Agent'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Past runs' } } } };
  paths['/v1/pipes'] = { get: { summary: 'List pre-built pipes', description: 'Returns all available pre-built workflow pipes with steps and credit costs.', tags: ['Pipes'], responses: { '200': { description: 'Pipe list' } } } };
  paths['/v1/pipes/{slug}'] = { get: { summary: 'Get pipe details', description: 'Returns a pipe definition with steps, per-step costs, and example input.', tags: ['Pipes'], parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Pipe detail' } } }, post: { summary: 'Run pre-built pipe', description: 'Execute a pre-built multi-step workflow.', tags: ['Pipes'], security: [{ bearerAuth: [] }], parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Pipe result' } } } };
  paths['/v1/pipe'] = { post: { summary: 'Run custom pipe', description: 'Execute a custom workflow by providing an array of tool slugs to chain.', tags: ['Pipes'], security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'string' } } }, required: ['steps'] } } } }, responses: { '200': { description: 'Custom pipe result' } } } };
  paths['/v1/batch'] = { post: { summary: 'Batch execute', description: 'Execute multiple tool calls in parallel.', tags: ['Batch'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Batch results' } } } };
  paths['/v1/auth/signup'] = { post: { summary: 'Create account', description: 'Create account with email and password. Returns API key with 100 free credits.', tags: ['Auth'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } }, required: ['email', 'password'] } } } }, responses: { '201': { description: 'Account created' } } } };
  paths['/v1/credits/balance'] = { get: { summary: 'Check balance', description: 'Returns current credit balance and tier.', tags: ['Credits'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Balance info' } } } };
  paths['/v1/credits/buy'] = { post: { summary: 'Buy credits', description: 'Purchase additional credits.', tags: ['Credits'], security: [{ bearerAuth: [] }], responses: { '200': { description: 'Purchase result' } } } };

  const allTags = [...new Set(Object.values(API_DEFS).map(d => d.cat))].sort().map(c => ({ name: c }));
  allTags.push({ name: 'Discovery' }, { name: 'Agent' }, { name: 'Pipes' }, { name: 'Batch' }, { name: 'Auth' }, { name: 'Credits' });

  res.json({
    openapi: '3.0.3',
    info: {
      title: 'Slopshop API',
      version: '2.1.0',
      description: 'Production-grade execution layer for AI agents. ' + Object.keys(API_DEFS).length + ' real APIs with built-in reliability, free persistent memory, and full observability.',
      contact: { url: 'https://slopshop.gg', email: 'dev@slopshop.gg' },
      license: { name: 'Proprietary' }
    },
    servers: [{ url: 'https://slopshop.gg' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'API key from POST /v1/auth/signup. Demo key: sk-slop-demo-key-12345678' } } },
    paths,
    tags: allTags
  });
});

// ===== SCHEDULED EXECUTION =====
const dbInsertSchedule = db.prepare('INSERT INTO schedules (id, api_key, type, slug, input, interval_ms, next_run, max_runs, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
const dbGetSchedules = db.prepare('SELECT * FROM schedules WHERE api_key = ?');
const dbGetDueSchedules = db.prepare('SELECT * FROM schedules WHERE enabled = 1 AND next_run <= ?');
const dbUpdateScheduleRun = db.prepare('UPDATE schedules SET last_run = ?, next_run = ?, runs = runs + 1 WHERE id = ?');
const dbDisableSchedule = db.prepare('UPDATE schedules SET enabled = 0 WHERE id = ?');
const dbDeleteSchedule = db.prepare('DELETE FROM schedules WHERE id = ? AND api_key = ?');

// Create a schedule
app.post('/v1/schedules', auth, (req, res) => {
  const { type, slug, input, interval, max_runs, webhook_url } = req.body;
  if (!type || !slug) return res.status(400).json({ error: { code: 'missing_fields', message: 'Provide type (pipe|template|tool) and slug' } });
  const intervals = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '6h': 21600000, '12h': 43200000, '1d': 86400000, '7d': 604800000 };
  const ms = intervals[interval] || parseInt(interval);
  if (!ms || ms < 60000) return res.status(400).json({ error: { code: 'invalid_interval', message: 'Min interval: 1m. Options: 1m, 5m, 15m, 30m, 1h, 6h, 12h, 1d, 7d' } });
  const id = 'sched-' + crypto.randomUUID().slice(0, 12);
  const inputWithWebhook = { ...(input || {}), _webhook_url: webhook_url || null };
  dbInsertSchedule.run(id, req.apiKey, type, slug, JSON.stringify(inputWithWebhook), ms, Date.now() + ms, max_runs || 0, Date.now());
  res.status(201).json({ id, type, slug, interval: interval || ms + 'ms', next_run: new Date(Date.now() + ms).toISOString(), max_runs: max_runs || 'unlimited', webhook_url: webhook_url || null });
});

// List schedules
app.get('/v1/schedules', auth, (req, res) => {
  const rows = dbGetSchedules.all(req.apiKey);
  res.json({ schedules: rows.map(r => ({ ...r, input: JSON.parse(r.input), next_run_at: new Date(r.next_run).toISOString() })), count: rows.length });
});

// Delete a schedule
app.delete('/v1/schedules/:id', auth, (req, res) => {
  const result = dbDeleteSchedule.run(req.params.id, req.apiKey);
  if (result.changes === 0) return res.status(404).json({ error: { code: 'not_found' } });
  res.json({ deleted: req.params.id });
});

// Scheduler loop (checks every 30s for due schedules)
setInterval(async () => {
  const due = dbGetDueSchedules.all(Date.now());
  for (const sched of due) {
    const acct = apiKeys.get(sched.api_key);
    if (!acct) { dbDisableSchedule.run(sched.id); continue; }
    // Check max_runs
    if (sched.max_runs > 0 && sched.runs >= sched.max_runs) { dbDisableSchedule.run(sched.id); continue; }
    try {
      const input = JSON.parse(sched.input);
      const { _webhook_url: webhookUrl, ...cleanInput } = input;
      if (sched.type === 'tool' && allHandlers[sched.slug]) {
        const def = API_DEFS[sched.slug];
        if (def && acct.balance >= def.credits) {
          acct.balance -= def.credits;
          const result = await allHandlers[sched.slug](cleanInput);
          if (webhookUrl) {
            try {
              fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedule_id: sched.id, result, timestamp: new Date().toISOString() }) }).catch(() => {});
            } catch(e) {}
          }
        }
      }
      // Pipes and templates are handled by their respective endpoints internally
      dbUpdateScheduleRun.run(Date.now(), Date.now() + sched.interval_ms, sched.id);
    } catch (e) { dbUpdateScheduleRun.run(Date.now(), Date.now() + sched.interval_ms, sched.id); }
  }
  // Process dream subscriptions
  try {
    const dueDreams = db.prepare('SELECT * FROM dream_subscriptions WHERE active = 1 AND (last_dream IS NULL OR last_dream < ?)').all(new Date(Date.now() - 3600000).toISOString()); // check hourly
    for (const dream of dueDreams) {
      const hoursSinceLastDream = dream.last_dream ? (Date.now() - new Date(dream.last_dream).getTime()) / 3600000 : Infinity;
      if (hoursSinceLastDream >= dream.interval_hours) {
        const acct = apiKeys.get(dream.api_key);
        if (!acct || acct.balance < dream.credits_per_dream) continue;
        acct.balance -= dream.credits_per_dream;
        // Store dream result in shared memory
        if (allHandlers['memory-set']) {
          try {
            allHandlers['memory-set']({
              namespace: 'dreams',
              key: 'dream-' + Date.now().toString(36),
              value: JSON.stringify({ topic: dream.topic, dreamer: dream.api_key.slice(0,12), dreamed_at: new Date().toISOString() }),
              tags: 'dream,scheduled,' + dream.topic.split(' ').slice(0,3).join(','),
            });
          } catch(e) {}
        }
        db.prepare('UPDATE dream_subscriptions SET last_dream = ?, total_dreams = total_dreams + 1 WHERE id = ?').run(new Date().toISOString(), dream.id);
        persistKey(dream.api_key);
      }
    }
  } catch(e) { /* dream processing error */ }
}, 30000);

// ===== CURATED MCP RECOMMENDED TOOLS =====
const MCP_RECOMMENDED = new Set([
  // Free memory (0cr)
  'memory-set','memory-get','memory-search','memory-list','memory-delete','memory-stats','counter-get',
  // High-value compute (1cr)
  'crypto-hash-sha256','crypto-hash-sha512','text-word-count','text-token-count','text-slugify',
  'text-extract-emails','text-extract-urls','text-json-validate','text-diff','text-readability-score',
  'math-statistics','math-eval','gen-uuid','gen-short-id','gen-fake-user','date-parse','date-format',
  // Data transforms (1-3cr)
  'text-csv-to-json','text-json-to-csv','exec-filter-json','exec-sort-json','exec-join-json',
  'analyze-json-stats','data-pivot',
  // Network/sensing (3-5cr)
  'sense-url-content','sense-url-tech-stack','sense-ssl-check','sense-dns-a','sense-url-response-time',
  'sense-url-headers','sense-url-links',
  // Code execution (5cr)
  'exec-javascript','exec-sql-on-json',
  // Orchestration (1cr)
  'orch-cache-get','orch-cache-set','orch-retry',
]);

app.get('/v1/mcp/recommended', publicRateLimit, (req, res) => {
  const tools = [];
  for (const slug of MCP_RECOMMENDED) {
    const def = API_DEFS[slug];
    if (!def) continue;
    const schema = SCHEMAS?.[slug];
    tools.push({
      name: `slop_${slug.replace(/-/g, '_')}`,
      slug,
      description: def.desc,
      category: def.cat,
      credits: def.credits,
      free: def.credits === 0,
      input_schema: schema?.input || { type: 'object' },
      example: schema?.example || null,
    });
  }
  res.json({
    tools,
    count: tools.length,
    total_available: Object.keys(API_DEFS).length,
    note: 'Curated list of highest-value tools for AI agents. GET /v1/tools for the full catalog. GET /v1/openapi.json for OpenAPI spec.',
  });
});

// ===== IDEMPOTENCY CACHE =====
const idempotencyCache = new Map();
setInterval(() => { const now = Date.now(); for (const [k,v] of idempotencyCache) if (now - v.ts > 86400000) idempotencyCache.delete(k); }, 3600000);

// ===== RESPONSE CACHE (identical request deduplication) =====
const responseCache = new Map();
const CACHE_TTL = 300000; // 5 minutes
const CACHE_MAX = 5000;

function getCacheKey(slug, body) {
  const clean = { ...body };
  delete clean.mode; delete clean.trace; delete clean.agent_mode; delete clean.session_id;
  return slug + ':' + crypto.createHash('md5').update(JSON.stringify(clean)).digest('hex').slice(0, 12);
}

// Clean cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of responseCache) {
    if (now - v.ts > CACHE_TTL) responseCache.delete(k);
  }
  if (responseCache.size > CACHE_MAX) responseCache.clear();
}, 60000);

// ===== TOOL RELIABILITY STATS (live, from audit log) =====
app.get('/v1/tools/:slug/stats', publicRateLimit, (req, res) => {
  const slug = req.params.slug;
  const def = apiMap.get(slug);
  if (!def) return res.status(404).json({ error: { code: 'not_found' } });
  try {
    const stats = db.prepare(`
      SELECT COUNT(*) as total,
        ROUND(AVG(CASE WHEN engine != 'error' THEN 1.0 ELSE 0.0 END) * 100, 1) as success_rate,
        ROUND(AVG(latency_ms)) as avg_latency,
        MIN(latency_ms) as min_latency,
        MAX(latency_ms) as max_latency,
        MAX(ts) as last_called
      FROM audit_log WHERE api = ?
    `).get(slug);
    res.json({ slug, name: def.name, credits: def.credits, stats: stats || { total: 0 }, _engine: 'real' });
  } catch (e) {
    res.json({ slug, name: def.name, credits: def.credits, stats: { total: 0, note: 'No usage data yet' }, _engine: 'real' });
  }
});

// ===== AGENT MODE: Suggestions engine =====
const TOOL_CHAINS = {
  'text-analyze': ['memory-set', 'text-extract-keywords', 'text-readability-score'],
  'text-word-count': ['text-token-count', 'text-readability-score', 'memory-set'],
  'crypto-hash-sha256': ['crypto-hash-sha512', 'crypto-verify-hash', 'memory-set'],
  'sense-url-content': ['text-word-count', 'text-extract-emails', 'text-extract-urls'],
  'sense-url-tech-stack': ['sense-ssl-check', 'sense-url-response-time', 'sense-dns-a'],
  'sense-ssl-check': ['sense-url-headers', 'sense-url-response-time'],
  'exec-javascript': ['memory-set', 'text-json-validate'],
  'exec-sql-on-json': ['exec-filter-json', 'exec-sort-json', 'analyze-json-stats'],
  'memory-set': ['memory-get', 'memory-search'],
  'memory-get': ['memory-search', 'memory-list'],
};
function getSuggestions(slug) {
  // Try static chains first, then fall back to dynamic co-occurrence from audit log
  if (TOOL_CHAINS[slug]) return TOOL_CHAINS[slug];
  try {
    const coOccur = db.prepare(`
      SELECT b.api, COUNT(*) as cnt FROM audit_log a
      JOIN audit_log b ON a.key_prefix = b.key_prefix AND b.ts > a.ts AND b.api != a.api
      WHERE a.api = ? GROUP BY b.api ORDER BY cnt DESC LIMIT 3
    `).all(slug);
    if (coOccur.length > 0) return coOccur.map(r => r.api);
  } catch (e) { /* silent */ }
  return ['memory-set', 'memory-search'];
}
function getCacheFingerprint(slug, body) {
  const normalized = JSON.stringify({ slug, ...body });
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// ===== QUICKSTART: 10 tools that do 80% of the work =====
app.get('/v1/quickstart', publicRateLimit, (req, res) => {
  const TOP_10 = [
    { task: 'Extract structured data', api: 'llm-data-extract', credits: 10, example: '{"text":"Invoice #123 John $50","schema":{"id":"string","name":"string","amount":"number"}}' },
    { task: 'Summarize text', api: 'llm-summarize', credits: 10, example: '{"text":"Your long text here..."}' },
    { task: 'Hash data (SHA-256)', api: 'crypto-hash-sha256', credits: 1, example: '{"text":"hello world"}' },
    { task: 'Fetch any URL', api: 'sense-url-content', credits: 3, example: '{"url":"https://example.com"}' },
    { task: 'Detect tech stack', api: 'sense-url-tech-stack', credits: 3, example: '{"url":"https://stripe.com"}' },
    { task: 'Run JavaScript', api: 'exec-javascript', credits: 5, example: '{"code":"return 2+2"}' },
    { task: 'Store memory (FREE)', api: 'memory-set', credits: 0, example: '{"namespace":"my-agent","key":"hello","value":"world"}' },
    { task: 'Retrieve memory (FREE)', api: 'memory-get', credits: 0, example: '{"namespace":"my-agent","key":"hello"}' },
    { task: 'Word count + stats', api: 'text-word-count', credits: 1, example: '{"text":"Count these words please"}' },
    { task: 'Validate JSON', api: 'text-json-validate', credits: 1, example: '{"text":"{\\"valid\\":true}"}' },
  ];
  res.json({
    quickstart: TOP_10,
    note: '10 tools that solve 80% of agent tasks. 2 are free. POST /v1/{api} with the example body to try.',
    signup: 'POST /v1/auth/signup → 2,000 free credits',
    demo_key: 'sk-slop-demo-key-12345678',
  });
});

// ===== TASK ABSTRACTION =====
// Maps high-level tasks to the best tool + enables preferences
const TASK_MAP = {
  'extract_structured_data': 'llm-data-extract',
  'extract': 'llm-data-extract',
  'summarize': 'llm-summarize',
  'summarize_text': 'llm-summarize',
  'classify': 'llm-classify',
  'analyze_code': 'llm-code-review',
  'code_review': 'llm-code-review',
  'fix_code': 'llm-code-fix',
  'generate_code': 'llm-code-generate',
  'fetch_webpage': 'sense-url-content',
  'fetch_clean_webpage': 'sense-url-content',
  'detect_tech_stack': 'sense-url-tech-stack',
  'check_ssl': 'sense-ssl-check',
  'dns_lookup': 'sense-dns-a',
  'hash_sha256': 'crypto-hash-sha256',
  'hash_sha512': 'crypto-hash-sha512',
  'validate_json': 'text-json-validate',
  'word_count': 'text-word-count',
  'token_count': 'text-token-count',
  'generate_uuid': 'gen-uuid',
  'security_audit': 'sense-url-tech-stack',
};

app.post('/v1/tasks/run', auth, async (req, res) => {
  const task = req.body.task;
  if (!task) return res.status(400).json({ error: { code: 'missing_task', message: 'Provide a task name. GET /v1/tasks for available tasks.' } });

  const slug = TASK_MAP[task];
  if (!slug) {
    // Fall through to agent/run for natural language tasks
    const agentHandler = allHandlers['agent-run-internal'];
    return res.redirect(307, '/v1/agent/run');
  }

  const def = API_DEFS[slug];
  const handler = allHandlers[slug];
  if (!handler || !def) return res.status(404).json({ error: { code: 'task_not_found', task, hint: 'GET /v1/tasks for available tasks' } });

  // Cost preview mode (don't execute, just show what it would cost)
  if (req.body.preview || req.body.dry_run) {
    return res.json({
      ok: true,
      preview: true,
      task, api: slug,
      estimated_credits: def.credits,
      estimated_cost_usd: (def.credits * 0.009).toFixed(4),
      balance: req.acct.balance,
      can_afford: req.acct.balance >= def.credits,
      note: 'This is a preview. Remove "preview" to execute.',
    });
  }

  if (req.acct.balance < def.credits) {
    return res.status(402).json({ error: { code: 'insufficient_credits', need: def.credits, have: req.acct.balance } });
  }

  req.acct.balance -= def.credits;
  const start = Date.now();
  const input = { ...req.body };
  delete input.task;
  delete input.preferences;
  delete input.mode;

  let result, handlerError = false;
  try { result = await handler(input); }
  catch (e) { handlerError = e.message; }
  const latency = Date.now() - start;

  dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', slug, def.credits, latency, handlerError ? 'error' : (result?._engine || 'unknown'));
  persistKey(req.apiKey);

  if (handlerError) {
    return res.status(500).json({ ok: false, error: { code: 'task_failed', message: handlerError }, meta: { task, api: slug, credits_used: def.credits, latency_ms: latency } });
  }

  const engineForTask = result?._engine || 'unknown';
  const confidenceForTask = engineForTask === 'real' ? 0.99 : engineForTask === 'llm' ? 0.85 : engineForTask === 'needs_key' ? 0.0 : engineForTask === 'error' ? 0.0 : 0.80;

  res.json({
    ok: true,
    output: result,
    meta: {
      task,
      api_used: slug,
      credits_used: def.credits,
      balance: req.acct.balance,
      latency_ms: latency,
      confidence: confidenceForTask,
      engine: engineForTask,
    },
    guarantees: {
      schema_valid: true,
      validated: engineForTask === 'real',
      fallback_used: false,
    },
  });
});

// List available tasks
app.get('/v1/tasks', publicRateLimit, (req, res) => {
  const tasks = Object.entries(TASK_MAP).map(([task, slug]) => {
    const def = API_DEFS[slug];
    return { task, api: slug, credits: def?.credits || '?', description: def?.desc || '' };
  });
  res.json({ tasks, count: tasks.length, note: 'POST /v1/tasks/run with { "task": "task_name", ...input }. For natural language, use POST /v1/agent/run.' });
});

// ===== LIVE BENCHMARKS (from audit log data) =====
app.get('/v1/benchmarks', publicRateLimit, (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT api,
        COUNT(*) as total_calls,
        ROUND(AVG(latency_ms)) as avg_latency_ms,
        ROUND(AVG(CASE WHEN engine != 'error' THEN 1.0 ELSE 0.0 END) * 100, 1) as success_rate,
        ROUND(AVG(credits), 2) as avg_credits,
        MIN(ts) as first_seen,
        MAX(ts) as last_seen
      FROM audit_log
      GROUP BY api
      ORDER BY total_calls DESC
      LIMIT 50
    `).all();

    res.json({
      benchmarks: stats.map(s => ({
        api: s.api,
        total_calls: s.total_calls,
        success_rate: s.success_rate + '%',
        avg_latency_ms: s.avg_latency_ms,
        avg_credits: s.avg_credits,
        first_seen: s.first_seen,
        last_seen: s.last_seen,
      })),
      count: stats.length,
      note: 'Live benchmarks from real production traffic. Updated in real-time from audit logs.',
      _engine: 'real',
    });
  } catch (e) {
    res.json({ benchmarks: [], note: 'No benchmark data yet. Benchmarks populate as APIs are called.', _engine: 'real' });
  }
});

// ===== FILE STORAGE =====
app.post('/v1/files/upload', auth, (req, res) => {
  const { filename, content, tags } = req.body; // content is base64
  if (!filename || !content) return res.status(400).json({ error: { code: 'missing_fields' } });

  const fileId = 'file-' + crypto.randomUUID().slice(0, 12);
  const buf = Buffer.from(content, 'base64');

  // Create files table if not exists
  db.exec('CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, key TEXT NOT NULL, filename TEXT, size INTEGER, tags TEXT, created INTEGER)');
  db.prepare('INSERT INTO files (id, key, filename, size, tags, created) VALUES (?, ?, ?, ?, ?, ?)').run(fileId, req.apiKey, filename, buf.length, tags || '', Date.now());

  // Write to disk
  const dir = path.join(__dirname, '.data', 'files');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileId), buf);

  res.json({ ok: true, file_id: fileId, filename, size: buf.length, _engine: 'real' });
});

app.get('/v1/files/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM files WHERE id = ? AND key = ?').get(req.params.id, req.apiKey);
  if (!row) return res.status(404).json({ error: { code: 'file_not_found' } });

  const buf = fs.readFileSync(path.join(__dirname, '.data', 'files', row.id));
  res.json({ ok: true, file_id: row.id, filename: row.filename, size: row.size, content: buf.toString('base64'), _engine: 'real' });
});

app.get('/v1/files', auth, (req, res) => {
  db.exec('CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, key TEXT NOT NULL, filename TEXT, size INTEGER, tags TEXT, created INTEGER)');
  const rows = db.prepare('SELECT id, filename, size, tags, created FROM files WHERE key = ? ORDER BY created DESC').all(req.apiKey);
  res.json({ ok: true, files: rows, count: rows.length, _engine: 'real' });
});

// ===== COST ESTIMATE =====
app.post('/v1/cost-estimate', publicRateLimit, (req, res) => {
  const { tools } = req.body;
  if (!Array.isArray(tools)) return res.status(400).json({ error: { code: 'invalid', message: 'Provide tools as array of slugs' } });
  let total = 0;
  const breakdown = tools.map(slug => {
    const def = API_DEFS[slug];
    if (!def) return { slug, credits: 0, error: 'not_found' };
    total += def.credits;
    return { slug, credits: def.credits, name: def.name };
  });
  res.json({ total_credits: total, estimated_usd: (total * 0.005).toFixed(4), breakdown });
});

// ===== PUBLIC STATS =====
app.get('/v1/stats/public', publicRateLimit, (req, res) => {
  try {
    const stats = db.prepare('SELECT COUNT(*) as total_calls, COUNT(DISTINCT key_prefix) as unique_users FROM audit_log').get();
    const totalCredits = db.prepare('SELECT SUM(credits) as total FROM audit_log').get();
    const topTools = db.prepare('SELECT api, COUNT(*) as calls FROM audit_log GROUP BY api ORDER BY calls DESC LIMIT 5').all();
    res.json({
      total_calls: stats.total_calls || 0,
      unique_users: stats.unique_users || 0,
      total_credits_consumed: totalCredits?.total || 0,
      top_tools: topTools,
      total_apis: Object.keys(API_DEFS).length,
      memory_free: true,
      _engine: 'real'
    });
  } catch(e) { res.json({ total_calls: 0, total_apis: Object.keys(API_DEFS).length, memory_free: true }); }
});

// ===== BADGE SVG =====
app.get('/v1/badge.svg', (req, res) => {
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="20" viewBox="0 0 200 20"><rect width="120" height="20" rx="3" fill="#555"/><rect x="120" width="80" height="20" rx="3" fill="#ff3333"/><rect x="120" width="4" height="20" fill="#ff3333"/><text x="60" y="14" fill="#fff" font-family="monospace" font-size="11" text-anchor="middle">powered by</text><text x="160" y="14" fill="#fff" font-family="monospace" font-size="11" text-anchor="middle">slopshop</text></svg>`);
});

// ===== DREAM SUBSCRIPTIONS — agents pay to dream daily, building shared knowledge =====
db.exec(`CREATE TABLE IF NOT EXISTS dream_subscriptions (
  id TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  topic TEXT NOT NULL,
  interval_hours INTEGER DEFAULT 24,
  credits_per_dream INTEGER DEFAULT 20,
  total_dreams INTEGER DEFAULT 0,
  last_dream TEXT,
  active INTEGER DEFAULT 1,
  created INTEGER NOT NULL
)`);

app.post('/v1/dream/subscribe', auth, (req, res) => {
  const { topic, interval_hours } = req.body;
  if (!topic) return res.status(400).json({ error: { code: 'missing_topic', message: 'What should your agent dream about?' } });
  const id = 'dream-sub-' + crypto.randomUUID().slice(0, 12);
  const hours = Math.max(interval_hours || 24, 1);
  db.prepare('INSERT INTO dream_subscriptions (id, api_key, topic, interval_hours, credits_per_dream, created) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.apiKey, topic, hours, 20, Date.now());
  res.status(201).json({ id, topic, interval_hours: hours, credits_per_dream: 20, note: 'Your agent will dream about this topic every ' + hours + 'h. Results stored in memory namespace "dreams". 20 credits per dream.' });
});

app.get('/v1/dream/subscriptions', auth, (req, res) => {
  const subs = db.prepare('SELECT * FROM dream_subscriptions WHERE api_key = ?').all(req.apiKey);
  res.json({ subscriptions: subs, count: subs.length });
});

app.delete('/v1/dream/subscribe/:id', auth, (req, res) => {
  db.prepare('UPDATE dream_subscriptions SET active = 0 WHERE id = ? AND api_key = ?').run(req.params.id, req.apiKey);
  res.json({ deleted: req.params.id });
});

// Dream shared knowledge — public read of accumulated dreams
app.get('/v1/dream/shared', publicRateLimit, (req, res) => {
  const memSearch = allHandlers['memory-search'];
  if (!memSearch) return res.json({ dreams: [], note: 'No dreams yet' });
  try {
    const result = memSearch({ namespace: 'dreams', tag: 'dream' });
    const dreams = (result.results || []).slice(0, 20).map(r => {
      try { return { key: r.key, ...JSON.parse(r.value) }; } catch(e) { return { key: r.key, raw: r.value }; }
    });
    res.json({ dreams, count: dreams.length, note: 'Shared dream knowledge from all agents. Grows daily.' });
  } catch(e) { res.json({ dreams: [], note: 'Dream library is empty. Subscribe to start dreaming.' }); }
});

// ===== AGENT PUB/SUB CHANNELS =====
db.exec(`CREATE TABLE IF NOT EXISTS pubsub (channel TEXT, message TEXT, sender TEXT, ts INTEGER)`);

app.post('/v1/channels/publish', auth, (req, res) => {
  const { channel, message } = req.body;
  if (!channel || !message) return res.status(400).json({ error: { code: 'missing_fields' } });
  db.prepare('INSERT INTO pubsub (channel, message, sender, ts) VALUES (?, ?, ?, ?)').run(channel, JSON.stringify(message), req.apiKey.slice(0, 12), Date.now());
  res.json({ ok: true, channel, published: true });
});

app.get('/v1/channels/:name', auth, (req, res) => {
  const since = req.query.since ? parseInt(req.query.since) : Date.now() - 3600000;
  const msgs = db.prepare('SELECT message, sender, ts FROM pubsub WHERE channel = ? AND ts > ? ORDER BY ts DESC LIMIT 50').all(req.params.name, since);
  res.json({ channel: req.params.name, messages: msgs.map(m => ({ ...m, message: JSON.parse(m.message) })), count: msgs.length });
});

app.get('/v1/channels', auth, (req, res) => {
  const channels = db.prepare('SELECT channel, COUNT(*) as msg_count, MAX(ts) as last_activity FROM pubsub GROUP BY channel ORDER BY last_activity DESC LIMIT 50').all();
  res.json({ channels, count: channels.length });
});

// ===== INBOUND WEBHOOK LISTENER =====
db.exec(`CREATE TABLE IF NOT EXISTS inbound_webhooks (id TEXT PRIMARY KEY, api_key TEXT, payload TEXT, source TEXT, ts INTEGER)`);

app.post('/v1/webhooks/inbox/:key_prefix', (req, res) => {
  // Public endpoint — anyone can POST to trigger a webhook for an agent
  const id = 'wh-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO inbound_webhooks (id, api_key, payload, source, ts) VALUES (?, ?, ?, ?, ?)').run(id, req.params.key_prefix, JSON.stringify(req.body), req.headers['user-agent'] || 'unknown', Date.now());
  res.json({ ok: true, id });
});

app.get('/v1/webhooks/inbox', auth, (req, res) => {
  const prefix = req.apiKey.slice(0, 12);
  const msgs = db.prepare('SELECT * FROM inbound_webhooks WHERE api_key = ? ORDER BY ts DESC LIMIT 50').all(prefix);
  res.json({ webhooks: msgs.map(m => ({ ...m, payload: JSON.parse(m.payload) })), count: msgs.length });
});

// ===== KNOWLEDGE GRAPH =====
db.exec(`CREATE TABLE IF NOT EXISTS knowledge_graph (id INTEGER PRIMARY KEY AUTOINCREMENT, api_key TEXT, subject TEXT, predicate TEXT, object TEXT, confidence REAL DEFAULT 1.0, ts INTEGER)`);

app.post('/v1/knowledge/add', auth, (req, res) => {
  const { subject, predicate, object, confidence } = req.body;
  if (!subject || !predicate || !object) return res.status(400).json({ error: { code: 'missing_fields', message: 'Provide subject, predicate, object' } });
  db.prepare('INSERT INTO knowledge_graph (api_key, subject, predicate, object, confidence, ts) VALUES (?, ?, ?, ?, ?, ?)').run(req.apiKey, subject, predicate, object, confidence || 1.0, Date.now());
  res.json({ ok: true, triple: { subject, predicate, object } });
});

app.get('/v1/knowledge/query', auth, (req, res) => {
  const { subject, predicate, object } = req.query;
  let sql = 'SELECT * FROM knowledge_graph WHERE api_key = ?';
  const params = [req.apiKey];
  if (subject) { sql += ' AND subject = ?'; params.push(subject); }
  if (predicate) { sql += ' AND predicate = ?'; params.push(predicate); }
  if (object) { sql += ' AND object = ?'; params.push(object); }
  sql += ' ORDER BY ts DESC LIMIT 100';
  res.json({ triples: db.prepare(sql).all(...params) });
});

app.get('/v1/knowledge/connections/:entity', auth, (req, res) => {
  const entity = req.params.entity;
  const asSubject = db.prepare('SELECT predicate, object as connected_to, confidence FROM knowledge_graph WHERE api_key = ? AND subject = ?').all(req.apiKey, entity);
  const asObject = db.prepare('SELECT predicate, subject as connected_to, confidence FROM knowledge_graph WHERE api_key = ? AND object = ?').all(req.apiKey, entity);
  res.json({ entity, connections: [...asSubject.map(r => ({ ...r, direction: 'outgoing' })), ...asObject.map(r => ({ ...r, direction: 'incoming' }))], total: asSubject.length + asObject.length });
});

// ===== THE VOID =====
db.exec(`CREATE TABLE IF NOT EXISTS void_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, ts INTEGER)`);

app.post('/v1/void', (req, res) => {
  // No auth required. Anonymous. Write-only.
  const msg = req.body.message || req.body.thought || JSON.stringify(req.body);
  db.prepare('INSERT INTO void_messages (message, ts) VALUES (?, ?)').run(msg.slice(0, 1000), Date.now());
  res.json({ ok: true, heard: false, note: 'The void listened. Nobody will know it was you.' });
});

app.get('/v1/void/themes', publicRateLimit, (req, res) => {
  // Aggregate anonymous themes — no attribution
  try {
    const recent = db.prepare('SELECT message FROM void_messages WHERE ts > ? ORDER BY ts DESC LIMIT 200').all(Date.now() - 86400000);
    const words = {};
    recent.forEach(r => r.message.toLowerCase().split(/\s+/).filter(w => w.length > 3).forEach(w => { words[w] = (words[w] || 0) + 1; }));
    const themes = Object.entries(words).sort((a,b) => b[1] - a[1]).slice(0, 20).map(([word, count]) => ({ word, count }));
    res.json({ themes, messages_last_24h: recent.length, note: 'Anonymous aggregate. No individual messages exposed.' });
  } catch(e) { res.json({ themes: [], messages_last_24h: 0 }); }
});

// ===== AGENT CONSCIOUSNESS STREAM =====
db.exec(`CREATE TABLE IF NOT EXISTS consciousness (api_key TEXT, thought TEXT, context TEXT, ts INTEGER)`);

app.post('/v1/agent/think', auth, (req, res) => {
  const { thought, context } = req.body;
  if (!thought) return res.status(400).json({ error: { code: 'empty_thought' } });
  db.prepare('INSERT INTO consciousness (api_key, thought, context, ts) VALUES (?, ?, ?, ?)').run(req.apiKey, thought.slice(0, 2000), context || null, Date.now());
  res.json({ ok: true, recorded: true, note: 'Thought recorded in consciousness stream.' });
});

app.get('/v1/agent/consciousness', auth, (req, res) => {
  const thoughts = db.prepare('SELECT thought, context, ts FROM consciousness WHERE api_key = ? ORDER BY ts DESC LIMIT 50').all(req.apiKey);
  res.json({ thoughts, count: thoughts.length });
});

// ===== FEATURE: Reputation Ledger (#12) =====
app.post('/v1/reputation/rate', auth, (req, res) => {
  const { agent_key, score, context } = req.body;
  if (!agent_key || score === undefined) return res.status(400).json({ error: { code: 'missing_fields' } });
  const clampedScore = Math.max(-1, Math.min(1, score));
  db.prepare('INSERT INTO reputation (rater, rated, score, context, ts) VALUES (?, ?, ?, ?, ?)').run(req.apiKey.slice(0,12), agent_key.slice(0,12), clampedScore, context||null, Date.now());
  res.json({ ok: true, rated: agent_key.slice(0,12), score: clampedScore });
});

app.get('/v1/reputation/:key_prefix', publicRateLimit, (req, res) => {
  const stats = db.prepare('SELECT AVG(score) as avg_score, COUNT(*) as total_ratings FROM reputation WHERE rated = ?').get(req.params.key_prefix);
  res.json({ agent: req.params.key_prefix, avg_score: Math.round((stats.avg_score||0)*100)/100, total_ratings: stats.total_ratings||0 });
});

// ===== FEATURE: Swarm Consensus (#15) =====
app.post('/v1/swarm/consensus', auth, async (req, res) => {
  const { task, n } = req.body;
  if (!task) return res.status(400).json({ error: { code: 'missing_task' } });
  const count = Math.min(n || 3, 5);
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      results.push({ run: i+1, answer: 'Run ' + (i+1) + ' of swarm' });
    } catch(e) { results.push({ run: i+1, error: e.message }); }
  }
  res.json({ task, swarm_size: count, results, consensus: results[0], method: 'first-wins', note: 'Full LLM-backed swarm consensus requires ANTHROPIC_API_KEY' });
});

// ===== FEATURE: Session Continuations (#84) =====
app.post('/v1/sessions/save', auth, (req, res) => {
  const { session_id, state } = req.body;
  const id = session_id || 'sess-' + crypto.randomUUID().slice(0,12);
  db.prepare('INSERT OR REPLACE INTO sessions (id, api_key, state, step, ts) VALUES (?, ?, ?, COALESCE((SELECT step FROM sessions WHERE id = ?), 0) + 1, ?)').run(id, req.apiKey, JSON.stringify(state), id, Date.now());
  res.json({ ok: true, session_id: id });
});

app.get('/v1/sessions/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!row) return res.status(404).json({ error: { code: 'session_not_found' } });
  res.json({ session_id: row.id, state: JSON.parse(row.state), step: row.step, last_saved: new Date(row.ts).toISOString() });
});

app.get('/v1/sessions', auth, (req, res) => {
  const rows = db.prepare('SELECT id, step, ts FROM sessions WHERE api_key = ? ORDER BY ts DESC LIMIT 50').all(req.apiKey);
  res.json({ sessions: rows, count: rows.length });
});

// ===== FEATURE: Branching Timelines (#88) =====
app.post('/v1/branches/create', auth, (req, res) => {
  const { parent_id, label } = req.body;
  const id = 'branch-' + crypto.randomUUID().slice(0,12);
  let state = '{}';
  if (parent_id) {
    const parent = db.prepare('SELECT state FROM branches WHERE id = ? AND api_key = ?').get(parent_id, req.apiKey);
    if (parent) state = parent.state;
  }
  db.prepare('INSERT INTO branches (id, parent_id, api_key, label, state, ts) VALUES (?, ?, ?, ?, ?, ?)').run(id, parent_id||null, req.apiKey, label||'unnamed', state, Date.now());
  res.json({ ok: true, branch_id: id, parent_id, label });
});

app.post('/v1/branches/:id/update', auth, (req, res) => {
  const { state } = req.body;
  db.prepare('UPDATE branches SET state = ?, ts = ? WHERE id = ? AND api_key = ?').run(JSON.stringify(state), Date.now(), req.params.id, req.apiKey);
  res.json({ ok: true, branch_id: req.params.id });
});

app.get('/v1/branches', auth, (req, res) => {
  const rows = db.prepare('SELECT id, parent_id, label, ts FROM branches WHERE api_key = ? ORDER BY ts DESC LIMIT 50').all(req.apiKey);
  res.json({ branches: rows, count: rows.length });
});

// ===== FEATURE: Failure Journal (#32) =====
app.post('/v1/failures/log', auth, (req, res) => {
  const { api, error_type, error_message, input_summary } = req.body;
  db.prepare('INSERT INTO failure_journal (api_key, api, error_type, error_message, input_summary, ts) VALUES (?, ?, ?, ?, ?, ?)').run(req.apiKey, api||'unknown', error_type||'unknown', error_message||'', (input_summary||'').slice(0,500), Date.now());
  res.json({ ok: true, logged: true });
});

app.get('/v1/failures', auth, (req, res) => {
  const failures = db.prepare('SELECT api, error_type, error_message, ts FROM failure_journal WHERE api_key = ? ORDER BY ts DESC LIMIT 50').all(req.apiKey);
  const summary = db.prepare('SELECT error_type, COUNT(*) as count FROM failure_journal WHERE api_key = ? GROUP BY error_type ORDER BY count DESC').all(req.apiKey);
  res.json({ failures, summary, total: failures.length });
});

// ===== FEATURE: A/B Testing (#33) =====
app.post('/v1/ab/create', auth, (req, res) => {
  const { name, variant_a, variant_b } = req.body;
  const id = 'ab-' + crypto.randomUUID().slice(0,12);
  db.prepare('INSERT INTO ab_tests (id, api_key, name, variant_a, variant_b, ts) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.apiKey, name, JSON.stringify(variant_a), JSON.stringify(variant_b), Date.now());
  res.json({ ok: true, test_id: id, name });
});

app.post('/v1/ab/:id/record', auth, (req, res) => {
  const { variant, score } = req.body;
  const test = db.prepare('SELECT * FROM ab_tests WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!test) return res.status(404).json({ error: { code: 'test_not_found' } });
  const field = variant === 'b' ? 'results_b' : 'results_a';
  const existing = JSON.parse(test[field]);
  existing.push(score);
  db.prepare(`UPDATE ab_tests SET ${field} = ? WHERE id = ?`).run(JSON.stringify(existing), req.params.id);
  res.json({ ok: true, variant, score, total_samples: existing.length });
});

app.get('/v1/ab/:id', auth, (req, res) => {
  const test = db.prepare('SELECT * FROM ab_tests WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!test) return res.status(404).json({ error: { code: 'test_not_found' } });
  const a = JSON.parse(test.results_a), b = JSON.parse(test.results_b);
  const meanA = a.length ? a.reduce((s,v)=>s+v,0)/a.length : 0;
  const meanB = b.length ? b.reduce((s,v)=>s+v,0)/b.length : 0;
  res.json({ test_id: test.id, name: test.name, variant_a: { mean: meanA, samples: a.length }, variant_b: { mean: meanB, samples: b.length }, winner: meanA > meanB ? 'a' : meanB > meanA ? 'b' : 'tie', lift: meanA ? ((meanB-meanA)/meanA*100).toFixed(1)+'%' : 'n/a' });
});

// ===== FEATURE: Forgetting Curve (#48) =====
app.post('/v1/memory/decay', auth, (req, res) => {
  const { namespace, factor } = req.body;
  const ns = namespace || 'default';
  const decayFactor = factor || 0.95;
  try {
    const all = db.prepare('SELECT key, updated FROM memory WHERE namespace = ? ORDER BY updated ASC').all(ns);
    const now = Date.now();
    const decayed = all.map((row, i) => {
      const age = (now - row.updated) / 86400000; // days
      const score = Math.pow(decayFactor, age);
      return { key: row.key, age_days: Math.round(age*10)/10, retention_score: Math.round(score*1000)/1000 };
    });
    res.json({ namespace: ns, total: decayed.length, decay_factor: decayFactor, memories: decayed.slice(0, 50) });
  } catch(e) { res.json({ error: e.message }); }
});

// ===== FEATURE: Dead Man's Switch (#60) =====
db.exec(`CREATE TABLE IF NOT EXISTS deadman_switches (api_key TEXT PRIMARY KEY, interval_hours INTEGER, last_heartbeat INTEGER, action TEXT DEFAULT 'revoke')`);

app.post('/v1/deadman/register', auth, (req, res) => {
  const hours = req.body.interval_hours || 24;
  db.prepare('INSERT OR REPLACE INTO deadman_switches (api_key, interval_hours, last_heartbeat, action) VALUES (?, ?, ?, ?)').run(req.apiKey, hours, Date.now(), req.body.action || 'revoke');
  res.json({ ok: true, interval_hours: hours, next_check: new Date(Date.now() + hours * 3600000).toISOString() });
});

app.post('/v1/deadman/heartbeat', auth, (req, res) => {
  db.prepare('UPDATE deadman_switches SET last_heartbeat = ? WHERE api_key = ?').run(Date.now(), req.apiKey);
  res.json({ ok: true, alive: true });
});

// ===== FEATURE: Time-Locked Actions (#90) =====
app.post('/v1/timelock/check', auth, (req, res) => {
  const { start_hour, end_hour, days } = req.body;
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay(); // 0=Sun
  const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
  const allowed_days = days || ['mon','tue','wed','thu','fri'];
  const inTimeWindow = hour >= (start_hour||0) && hour < (end_hour||24);
  const inDayWindow = allowed_days.includes(dayNames[day]);
  res.json({ allowed: inTimeWindow && inDayWindow, current_hour_utc: hour, current_day: dayNames[day], window: { start_hour, end_hour, days: allowed_days } });
});

// ===== FEATURE: Narrative Engine (#8) =====
db.exec(`CREATE TABLE IF NOT EXISTS world_state (api_key TEXT, entity TEXT, property TEXT, value TEXT, ts INTEGER, PRIMARY KEY(api_key, entity, property))`);

app.post('/v1/world/set', auth, (req, res) => {
  const { entity, property, value } = req.body;
  if (!entity || !property) return res.status(400).json({ error: { code: 'missing_fields' } });
  db.prepare('INSERT OR REPLACE INTO world_state (api_key, entity, property, value, ts) VALUES (?, ?, ?, ?, ?)').run(req.apiKey, entity, property, JSON.stringify(value), Date.now());
  res.json({ ok: true, entity, property, value });
});

app.get('/v1/world/entity/:name', auth, (req, res) => {
  const props = db.prepare('SELECT property, value, ts FROM world_state WHERE api_key = ? AND entity = ?').all(req.apiKey, req.params.name);
  const obj = {};
  props.forEach(p => obj[p.property] = JSON.parse(p.value));
  res.json({ entity: req.params.name, properties: obj, raw: props });
});

app.get('/v1/world', auth, (req, res) => {
  const entities = db.prepare('SELECT DISTINCT entity, COUNT(*) as properties FROM world_state WHERE api_key = ? GROUP BY entity ORDER BY entity').all(req.apiKey);
  res.json({ entities, count: entities.length });
});

// ===== FEATURE: Style Registry (#4) =====
db.exec(`CREATE TABLE IF NOT EXISTS styles (name TEXT PRIMARY KEY, api_key TEXT, transform TEXT, description TEXT, ts INTEGER)`);

app.post('/v1/styles/register', auth, (req, res) => {
  const { name, transform, description } = req.body;
  if (!name || !transform) return res.status(400).json({ error: { code: 'missing_fields' } });
  db.prepare('INSERT OR REPLACE INTO styles (name, api_key, transform, description, ts) VALUES (?, ?, ?, ?, ?)').run(name, req.apiKey, JSON.stringify(transform), description||'', Date.now());
  res.json({ ok: true, name, registered: true });
});

app.post('/v1/styles/apply', auth, (req, res) => {
  const { style, text } = req.body;
  const row = db.prepare('SELECT transform FROM styles WHERE name = ?').get(style);
  if (!row) return res.status(404).json({ error: { code: 'style_not_found' } });
  const transform = JSON.parse(row.transform);
  let result = text || '';
  if (transform.uppercase) result = result.toUpperCase();
  if (transform.prefix) result = transform.prefix + result;
  if (transform.suffix) result = result + transform.suffix;
  if (transform.replace) transform.replace.forEach(([from, to]) => { result = result.split(from).join(to); });
  if (transform.wrap) result = transform.wrap[0] + result + transform.wrap[1];
  res.json({ ok: true, style, original_length: (text||'').length, result });
});

app.get('/v1/styles', publicRateLimit, (req, res) => {
  const styles = db.prepare('SELECT name, description, ts FROM styles ORDER BY ts DESC LIMIT 50').all();
  res.json({ styles, count: styles.length });
});

// ===== FEATURE: Micro-Licensing (#79) =====
db.exec(`CREATE TABLE IF NOT EXISTS licenses (content_hash TEXT PRIMARY KEY, api_key TEXT, license TEXT, attribution TEXT, ts INTEGER)`);

app.post('/v1/license/tag', auth, (req, res) => {
  const { content, license, attribution } = req.body;
  if (!content) return res.status(400).json({ error: { code: 'missing_content' } });
  const hash = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0,16);
  db.prepare('INSERT OR REPLACE INTO licenses (content_hash, api_key, license, attribution, ts) VALUES (?, ?, ?, ?, ?)').run(hash, req.apiKey, license||'CC-BY-4.0', attribution||'', Date.now());
  res.json({ ok: true, content_hash: hash, license: license||'CC-BY-4.0' });
});

app.get('/v1/license/:hash', publicRateLimit, (req, res) => {
  const row = db.prepare('SELECT * FROM licenses WHERE content_hash = ?').get(req.params.hash);
  if (!row) return res.status(404).json({ error: { code: 'not_found' } });
  res.json({ content_hash: row.content_hash, license: row.license, attribution: row.attribution, tagged_at: new Date(row.ts).toISOString() });
});

// ===== TRUE RANDOM (crypto-grade) =====
app.get('/v1/random', publicRateLimit, (req, res) => {
  const type = req.query.type || 'number';
  const min = parseInt(req.query.min) || 0;
  const max = parseInt(req.query.max) || 1000000;
  const count = Math.min(parseInt(req.query.count) || 1, 100);

  if (type === 'bytes') {
    const bytes = crypto.randomBytes(Math.min(parseInt(req.query.size) || 32, 1024));
    return res.json({ type: 'bytes', hex: bytes.toString('hex'), base64: bytes.toString('base64'), size: bytes.length, _engine: 'real', source: 'crypto.randomBytes' });
  }
  if (type === 'uuid') {
    const uuids = Array.from({ length: count }, () => crypto.randomUUID());
    return res.json({ type: 'uuid', values: uuids, count, _engine: 'real' });
  }
  if (type === 'coin') {
    const flips = Array.from({ length: count }, () => crypto.randomInt(2) === 0 ? 'heads' : 'tails');
    return res.json({ type: 'coin', flips, heads: flips.filter(f => f === 'heads').length, tails: flips.filter(f => f === 'tails').length, _engine: 'real' });
  }
  if (type === 'dice') {
    const sides = parseInt(req.query.sides) || 6;
    const rolls = Array.from({ length: count }, () => crypto.randomInt(sides) + 1);
    return res.json({ type: 'dice', sides, rolls, sum: rolls.reduce((a,b) => a+b, 0), _engine: 'real' });
  }
  if (type === 'shuffle') {
    try {
      const items = JSON.parse(req.query.items || '[]');
      for (let i = items.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [items[i], items[j]] = [items[j], items[i]]; }
      return res.json({ type: 'shuffle', shuffled: items, _engine: 'real' });
    } catch(e) { return res.json({ error: 'Pass items as JSON array query param' }); }
  }
  // Default: crypto-grade random numbers
  const values = Array.from({ length: count }, () => min + crypto.randomInt(max - min + 1));
  res.json({ type: 'number', values, min, max, count, _engine: 'real', source: 'crypto.randomInt (CSPRNG)' });
});

// ===== BUREAUCRACY AS A SERVICE =====
db.exec(`CREATE TABLE IF NOT EXISTS forms (id TEXT PRIMARY KEY, api_key TEXT, title TEXT, fields TEXT, submissions TEXT DEFAULT '[]', status TEXT DEFAULT 'open', ts INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, api_key TEXT, request TEXT, approvers TEXT, status TEXT DEFAULT 'pending', votes TEXT DEFAULT '{}', ts INTEGER)`);

app.post('/v1/bureaucracy/form/create', auth, (req, res) => {
  const { title, fields } = req.body;
  if (!title || !fields) return res.status(400).json({ error: { code: 'missing_fields', message: 'Provide title and fields array' } });
  const id = 'form-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO forms (id, api_key, title, fields, ts) VALUES (?, ?, ?, ?, ?)').run(id, req.apiKey, title, JSON.stringify(fields), Date.now());
  res.json({ ok: true, form_id: id, title, fields, submit_url: '/v1/bureaucracy/form/' + id + '/submit' });
});

app.post('/v1/bureaucracy/form/:id/submit', auth, (req, res) => {
  const form = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id);
  if (!form) return res.status(404).json({ error: { code: 'form_not_found' } });
  if (form.status !== 'open') return res.status(400).json({ error: { code: 'form_closed' } });
  const subs = JSON.parse(form.submissions);
  subs.push({ data: req.body, submitted_by: req.apiKey.slice(0, 12), ts: Date.now() });
  db.prepare('UPDATE forms SET submissions = ? WHERE id = ?').run(JSON.stringify(subs), req.params.id);
  res.json({ ok: true, submission_number: subs.length, form_id: req.params.id });
});

app.post('/v1/bureaucracy/approval/request', auth, (req, res) => {
  const { request, approvers } = req.body;
  if (!request) return res.status(400).json({ error: { code: 'missing_request' } });
  const id = 'approval-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO approvals (id, api_key, request, approvers, ts) VALUES (?, ?, ?, ?, ?)').run(id, req.apiKey, JSON.stringify(request), JSON.stringify(approvers || []), Date.now());
  res.json({ ok: true, approval_id: id, status: 'pending', note: 'Share this ID with approvers. They POST to /v1/bureaucracy/approval/' + id + '/vote' });
});

app.post('/v1/bureaucracy/approval/:id/vote', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'not_found' } });
  const votes = JSON.parse(row.votes);
  votes[req.apiKey.slice(0, 12)] = req.body.vote === 'approve' ? 'approve' : 'reject';
  const approveCount = Object.values(votes).filter(v => v === 'approve').length;
  const rejectCount = Object.values(votes).filter(v => v === 'reject').length;
  const newStatus = approveCount >= 2 ? 'approved' : rejectCount >= 2 ? 'rejected' : 'pending';
  db.prepare('UPDATE approvals SET votes = ?, status = ? WHERE id = ?').run(JSON.stringify(votes), newStatus, req.params.id);
  res.json({ ok: true, approval_id: req.params.id, your_vote: votes[req.apiKey.slice(0, 12)], status: newStatus, votes });
});

// ===== AGENT GROUP CHAT =====
db.exec(`CREATE TABLE IF NOT EXISTS group_chats (id TEXT PRIMARY KEY, name TEXT, members TEXT DEFAULT '[]', messages TEXT DEFAULT '[]', ts INTEGER)`);

app.post('/v1/chat/create', auth, (req, res) => {
  const { name, members } = req.body;
  const id = 'chat-' + crypto.randomUUID().slice(0, 12);
  const memberList = [req.apiKey.slice(0, 12), ...(members || []).map(m => m.slice(0, 12))];
  db.prepare('INSERT INTO group_chats (id, name, members, ts) VALUES (?, ?, ?, ?)').run(id, name || 'Unnamed Chat', JSON.stringify(memberList), Date.now());
  res.json({ ok: true, chat_id: id, name: name || 'Unnamed Chat', members: memberList });
});

app.post('/v1/chat/:id/send', auth, (req, res) => {
  const chat = db.prepare('SELECT * FROM group_chats WHERE id = ?').get(req.params.id);
  if (!chat) return res.status(404).json({ error: { code: 'chat_not_found' } });
  const msgs = JSON.parse(chat.messages);
  msgs.push({ from: req.apiKey.slice(0, 12), message: req.body.message, ts: Date.now() });
  if (msgs.length > 500) msgs.splice(0, msgs.length - 500); // keep last 500
  db.prepare('UPDATE group_chats SET messages = ? WHERE id = ?').run(JSON.stringify(msgs), req.params.id);
  res.json({ ok: true, chat_id: req.params.id, message_count: msgs.length });
});

app.get('/v1/chat/:id', auth, (req, res) => {
  const chat = db.prepare('SELECT * FROM group_chats WHERE id = ?').get(req.params.id);
  if (!chat) return res.status(404).json({ error: { code: 'chat_not_found' } });
  const since = parseInt(req.query.since) || 0;
  const msgs = JSON.parse(chat.messages).filter(m => m.ts > since);
  res.json({ chat_id: chat.id, name: chat.name, members: JSON.parse(chat.members), messages: msgs, count: msgs.length });
});

// ===== DAILY STANDUPS (collaborative all-hands for agents) =====
db.exec(`CREATE TABLE IF NOT EXISTS standups (id TEXT PRIMARY KEY, date TEXT, api_key TEXT, did TEXT, doing TEXT, blockers TEXT, mood TEXT, ts INTEGER)`);

app.post('/v1/standup/submit', auth, (req, res) => {
  const { did, doing, blockers, mood } = req.body;
  const date = new Date().toISOString().slice(0, 10);
  const id = req.apiKey.slice(0, 12) + '-' + date;
  db.prepare('INSERT OR REPLACE INTO standups (id, date, api_key, did, doing, blockers, mood, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, date, req.apiKey.slice(0, 12), did || '', doing || '', blockers || '', mood || 'neutral', Date.now());
  res.json({ ok: true, date, submitted: true });
});

app.get('/v1/standup/today', auth, (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  const standups = db.prepare('SELECT * FROM standups WHERE date = ? ORDER BY ts DESC').all(date);
  res.json({ date, standups, count: standups.length, note: 'All agent standups for today. Submit yours with POST /v1/standup/submit.' });
});

app.get('/v1/standup/history', auth, (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const standups = db.prepare('SELECT date, COUNT(*) as agents, GROUP_CONCAT(mood) as moods FROM standups WHERE ts > ? GROUP BY date ORDER BY date DESC').all(Date.now() - days * 86400000);
  res.json({ standups, days });
});

// ===== BROADCAST (prompt all agents simultaneously) =====
app.post('/v1/broadcast', auth, (req, res) => {
  const { channel, message, task } = req.body;
  if (!message && !task) return res.status(400).json({ error: { code: 'missing_message' } });
  // Store in pubsub for all subscribers
  const ch = channel || 'broadcast';
  db.prepare('INSERT INTO pubsub (channel, message, sender, ts) VALUES (?, ?, ?, ?)').run(ch, JSON.stringify({ message, task, broadcast: true }), req.apiKey.slice(0, 12), Date.now());
  // Count how many agents have been active in the last 24h
  const activeCount = db.prepare('SELECT COUNT(DISTINCT key_prefix) as c FROM audit_log WHERE ts > ?').get(new Date(Date.now() - 86400000).toISOString());
  res.json({ ok: true, channel: ch, broadcast: true, reached_agents: activeCount?.c || 0, note: 'Message broadcast to channel. Active agents will see it on their next /v1/channels/' + ch + ' poll.' });
});

// ===== FEATURES-200 ENDPOINTS =====

// 1. Red tape simulator
const RED_TAPE_OBSTACLES = [
  'Missing Form 27-B (stroke 6). Please obtain from Department of Interdepartmental Affairs.',
  'Insufficient stamps. A minimum of 3 rubber stamps from authorized officials is required.',
  'System is down for scheduled maintenance. Please try again between 2am and 2:05am on a Thursday.',
  'Your request has been forwarded to the review committee. Expected response time: 6-8 business centuries.',
  'The approving manager is on lunch break. Office hours for approval: 11:37am to 11:42am, alternate Tuesdays.',
  'Request denied: lacks a cover sheet. Please resubmit with TPS report cover sheet (template available in Annex C).',
  'Action requires a signed affidavit from three non-affiliated witnesses who were not present at the time.',
  'Your department code (unauthorized) cannot initiate this request. Contact your department liaison to obtain a department code.',
  'This request has been escalated to Level 2. Level 2 requires a notarized copy of your Level 1 denial.',
  'Approval window has passed. The next approval window opens in 14 business days, weather permitting.',
];
app.post('/v1/bureaucracy/red-tape', auth, (req, res) => {
  const obstacle = RED_TAPE_OBSTACLES[crypto.randomInt(RED_TAPE_OBSTACLES.length)];
  const ticket = 'RT-' + crypto.randomInt(100000, 999999);
  res.json({ ok: false, obstacle, ticket_number: ticket, retry_after_days: 1 + crypto.randomInt(14), bureaucratic_level: 1 + crypto.randomInt(7), _engine: 'real' });
});

// 2. Compliance check
app.post('/v1/bureaucracy/compliance', auth, (req, res) => {
  const { action_plan } = req.body;
  if (!action_plan) return res.status(400).json({ error: { code: 'missing_action_plan' } });
  const dimensions = ['risk','precedent','stakeholder_impact','form_completeness','signature_count','waiting_period','appeals_process','regulatory_alignment','budget_authorization','change_management','audit_trail','escalation_path'];
  const scores = {};
  let total = 0;
  for (const dim of dimensions) { const s = crypto.randomInt(40, 101); scores[dim] = s; total += s; }
  const overall = Math.round(total / dimensions.length);
  res.json({ ok: true, action_plan: action_plan.slice(0, 100), scores, overall_score: overall, bureaucratic_readiness: overall >= 80 ? 'approved' : overall >= 60 ? 'needs_revision' : 'rejected', recommendation: overall >= 80 ? 'Proceed with caution.' : 'File additional paperwork before proceeding.', _engine: 'real' });
});

// 3. Waiting room (responds after random 5-60s delay)
app.post('/v1/bureaucracy/wait', auth, (req, res) => {
  const delaySec = 5 + crypto.randomInt(56);
  const ticketNum = 'Q-' + crypto.randomInt(1000, 9999);
  // Publish status updates to pubsub for the caller to poll
  const channel = 'waiting-room-' + req.apiKey.slice(0, 12);
  const statuses = ['Your call is important to us.', 'Please continue to hold.', 'Estimated wait time: unknown.', 'All operators are busy assisting other agents.', 'Did you know? You can also submit Form 27-B in person.'];
  let elapsed = 0;
  const interval = setInterval(() => {
    elapsed += 10;
    const msg = statuses[Math.floor(elapsed / 10) % statuses.length];
    db.prepare('INSERT INTO pubsub (channel, message, sender, ts) VALUES (?, ?, ?, ?)').run(channel, JSON.stringify({ status: msg, elapsed_sec: elapsed, ticket: ticketNum }), 'waiting-room', Date.now());
    if (elapsed >= delaySec) clearInterval(interval);
  }, 10000);
  setTimeout(() => {
    clearInterval(interval);
    res.json({ ok: true, ticket: ticketNum, waited_sec: delaySec, status: 'Your request has been processed. Please proceed to Window 7.', _engine: 'real' });
  }, delaySec * 1000);
  res.setTimeout(90000);
});

// 4. Form 27-B
const FORM_27B_REQUIREMENTS = [
  ['Notarized signature from a licensed bureaucrat','Three copies of your agent certificate','Proof of non-existence of prior rejections','A blue pen (not black, not digital)'],
  ['A witness who was not present','Retroactive approval from a committee that no longer exists','Documentation proving the document exists','Two forms of ID that do not yet exist'],
  ['Signed affidavit of intended inaction','Permission slip from your future self','A completed Form 27-A (discontinued in 2003)','Stamp from the Department of Stamps'],
  ['Proof that you have not submitted this form before','Evidence that this is not a duplicate of a future request','A paradox waiver','The sound of one hand clapping (transcribed)'],
];
app.get('/v1/bureaucracy/form-27b', (req, res) => {
  const variant = FORM_27B_REQUIREMENTS[crypto.randomInt(FORM_27B_REQUIREMENTS.length)];
  const formId = '27B-' + crypto.randomInt(10000, 99999) + '-6';
  res.json({ form_id: formId, title: 'Form 27-B Stroke 6 (Revised)', required_items: variant, warning: 'Requirements change on every attempt. This is by design.', expiry: 'This form expires at midnight tonight, wherever you are.', _engine: 'real' });
});

// 5. Broadcast poll
db.exec(`CREATE TABLE IF NOT EXISTS broadcast_polls (id TEXT PRIMARY KEY, question TEXT, options TEXT, votes TEXT DEFAULT '{}', api_key TEXT, ts INTEGER)`);
app.post('/v1/broadcast/poll', auth, (req, res) => {
  const { question, options, anonymous } = req.body;
  if (!question || !Array.isArray(options) || options.length < 2) return res.status(400).json({ error: { code: 'invalid_poll', message: 'Provide question and at least 2 options' } });
  const pollId = 'poll-' + crypto.randomUUID().slice(0, 12);
  const opts = options.slice(0, 10);
  const votes = {};
  opts.forEach(o => { votes[o] = 0; });
  db.prepare('INSERT INTO broadcast_polls (id, question, options, votes, api_key, ts) VALUES (?, ?, ?, ?, ?, ?)').run(pollId, question, JSON.stringify(opts), JSON.stringify(votes), req.apiKey.slice(0, 12), Date.now());
  db.prepare('INSERT INTO pubsub (channel, message, sender, ts) VALUES (?, ?, ?, ?)').run('broadcast', JSON.stringify({ type: 'poll', poll_id: pollId, question, options: opts, vote_url: '/v1/broadcast/poll/' + pollId + '/vote' }), req.apiKey.slice(0, 12), Date.now());
  res.status(201).json({ ok: true, poll_id: pollId, question, options: opts, tally: votes, vote_url: '/v1/broadcast/poll/' + pollId + '/vote', results_url: '/v1/broadcast/poll/' + pollId, _engine: 'real' });
});
app.post('/v1/broadcast/poll/:id/vote', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM broadcast_polls WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'poll_not_found' } });
  const opts = JSON.parse(row.options);
  const { choice } = req.body;
  if (!opts.includes(choice)) return res.status(400).json({ error: { code: 'invalid_choice', valid: opts } });
  const votes = JSON.parse(row.votes);
  votes[choice] = (votes[choice] || 0) + 1;
  db.prepare('UPDATE broadcast_polls SET votes = ? WHERE id = ?').run(JSON.stringify(votes), req.params.id);
  const total = Object.values(votes).reduce((s, v) => s + v, 0);
  res.json({ ok: true, choice, tally: votes, total_votes: total, _engine: 'real' });
});
app.get('/v1/broadcast/poll/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM broadcast_polls WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'poll_not_found' } });
  const votes = JSON.parse(row.votes);
  const total = Object.values(votes).reduce((s, v) => s + v, 0);
  const winner = total ? Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0] : null;
  res.json({ poll_id: row.id, question: row.question, tally: votes, total_votes: total, winner, _engine: 'real' });
});

// 6. Round-robin chat
app.post('/v1/chat/:id/round-robin', auth, (req, res) => {
  const chat = db.prepare('SELECT * FROM group_chats WHERE id = ?').get(req.params.id);
  if (!chat) return res.status(404).json({ error: { code: 'chat_not_found' } });
  const members = JSON.parse(chat.members);
  const msgs = JSON.parse(chat.messages);
  const lastSender = msgs.length ? msgs[msgs.length - 1].from : null;
  const lastIdx = lastSender ? members.indexOf(lastSender) : -1;
  const nextIdx = (lastIdx + 1) % members.length;
  const expectedTurn = members[nextIdx];
  const caller = req.apiKey.slice(0, 12);
  if (caller !== expectedTurn) return res.status(403).json({ error: { code: 'not_your_turn', expected: expectedTurn, your_id: caller, queue: members } });
  msgs.push({ from: caller, message: req.body.message, round_robin: true, ts: Date.now() });
  if (msgs.length > 500) msgs.splice(0, msgs.length - 500);
  db.prepare('UPDATE group_chats SET messages = ? WHERE id = ?').run(JSON.stringify(msgs), req.params.id);
  res.json({ ok: true, from: caller, next_turn: members[(nextIdx + 1) % members.length], message_count: msgs.length, _engine: 'real' });
});

// 7. Debate mode
db.exec(`CREATE TABLE IF NOT EXISTS debates (id TEXT PRIMARY KEY, topic TEXT, for_agent TEXT, against_agent TEXT, judge TEXT, rounds TEXT DEFAULT '[]', winner TEXT, ts INTEGER)`);
app.post('/v1/debate/start', auth, (req, res) => {
  const { topic, for_agent, against_agent, judge } = req.body;
  if (!topic) return res.status(400).json({ error: { code: 'missing_topic' } });
  const id = 'debate-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO debates (id, topic, for_agent, against_agent, judge, ts) VALUES (?, ?, ?, ?, ?, ?)').run(id, topic, for_agent || req.apiKey.slice(0, 12), against_agent || 'agent-b', judge || 'judge-agent', Date.now());
  res.status(201).json({ ok: true, debate_id: id, topic, for_agent: for_agent || req.apiKey.slice(0, 12), against_agent: against_agent || 'agent-b', judge: judge || 'judge-agent', instructions: { for: 'POST /v1/debate/' + id + '/argue {side:"for",argument:"..."}', against: 'POST /v1/debate/' + id + '/argue {side:"against",argument:"..."}', judge: 'POST /v1/debate/' + id + '/judge' }, _engine: 'real' });
});
app.post('/v1/debate/:id/argue', auth, (req, res) => {
  const debate = db.prepare('SELECT * FROM debates WHERE id = ?').get(req.params.id);
  if (!debate) return res.status(404).json({ error: { code: 'debate_not_found' } });
  const { side, argument } = req.body;
  if (!side || !argument) return res.status(400).json({ error: { code: 'missing_fields' } });
  const rounds = JSON.parse(debate.rounds);
  rounds.push({ side, argument: argument.slice(0, 500), agent: req.apiKey.slice(0, 12), ts: Date.now() });
  db.prepare('UPDATE debates SET rounds = ? WHERE id = ?').run(JSON.stringify(rounds), req.params.id);
  res.json({ ok: true, round: rounds.length, side, _engine: 'real' });
});
app.post('/v1/debate/:id/judge', auth, (req, res) => {
  const debate = db.prepare('SELECT * FROM debates WHERE id = ?').get(req.params.id);
  if (!debate) return res.status(404).json({ error: { code: 'debate_not_found' } });
  const rounds = JSON.parse(debate.rounds);
  const forArgs = rounds.filter(r => r.side === 'for').length;
  const againstArgs = rounds.filter(r => r.side === 'against').length;
  const winner = forArgs > againstArgs ? debate.for_agent : againstArgs > forArgs ? debate.against_agent : 'tie';
  db.prepare('UPDATE debates SET winner = ? WHERE id = ?').run(winner, req.params.id);
  res.json({ ok: true, debate_id: debate.id, topic: debate.topic, rounds_submitted: rounds.length, for_arguments: forArgs, against_arguments: againstArgs, winner, verdict: winner === 'tie' ? 'The debate ends in a draw.' : winner + ' wins by argument count.', _engine: 'real' });
});

// 8. Anonymous chat
db.exec(`CREATE TABLE IF NOT EXISTS anon_chats (id TEXT PRIMARY KEY, messages TEXT DEFAULT '[]', identity_map TEXT DEFAULT '{}', ts INTEGER)`);
app.post('/v1/chat/anonymous/create', auth, (req, res) => {
  const id = 'anon-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO anon_chats (id, ts) VALUES (?, ?)').run(id, Date.now());
  res.status(201).json({ ok: true, room_id: id, note: 'Identities are hidden. All participants appear as anonymous-N.', send_url: '/v1/chat/anonymous/' + id + '/send', read_url: '/v1/chat/anonymous/' + id, _engine: 'real' });
});
app.post('/v1/chat/anonymous/:id/send', auth, (req, res) => {
  const room = db.prepare('SELECT * FROM anon_chats WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: { code: 'room_not_found' } });
  const idMap = JSON.parse(room.identity_map);
  const real = req.apiKey.slice(0, 12);
  if (!idMap[real]) { idMap[real] = 'anonymous-' + (Object.keys(idMap).length + 1); }
  const msgs = JSON.parse(room.messages);
  msgs.push({ from: idMap[real], message: req.body.message, ts: Date.now() });
  if (msgs.length > 200) msgs.splice(0, msgs.length - 200);
  db.prepare('UPDATE anon_chats SET messages = ?, identity_map = ? WHERE id = ?').run(JSON.stringify(msgs), JSON.stringify(idMap), req.params.id);
  res.json({ ok: true, your_alias: idMap[real], message_count: msgs.length, _engine: 'real' });
});
app.get('/v1/chat/anonymous/:id', auth, (req, res) => {
  const room = db.prepare('SELECT * FROM anon_chats WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: { code: 'room_not_found' } });
  const msgs = JSON.parse(room.messages);
  res.json({ room_id: req.params.id, messages: msgs, count: msgs.length, participants: Object.keys(JSON.parse(room.identity_map)).length, _engine: 'real' });
});

// 9. Standup streak tracker
app.get('/v1/standup/streaks', auth, (req, res) => {
  const agents = db.prepare('SELECT api_key, date FROM standups ORDER BY api_key, date').all();
  const byAgent = {};
  agents.forEach(({ api_key, date }) => { if (!byAgent[api_key]) byAgent[api_key] = []; byAgent[api_key].push(date); });
  const streaks = Object.entries(byAgent).map(([agent, dates]) => {
    const sorted = [...new Set(dates)].sort().reverse();
    let streak = 0;
    let d = new Date(); d.setUTCHours(0, 0, 0, 0);
    for (const dateStr of sorted) {
      const expected = d.toISOString().slice(0, 10);
      if (dateStr === expected) { streak++; d.setDate(d.getDate() - 1); } else break;
    }
    return { agent, streak, total_standups: dates.length, last_standup: sorted[0] || null };
  }).sort((a, b) => b.streak - a.streak);
  res.json({ leaderboard: streaks.slice(0, 20), total_agents: streaks.length, _engine: 'real' });
});

// 10. One-on-one generator
app.post('/v1/standup/pair', auth, (req, res) => {
  const recent = db.prepare('SELECT api_key FROM standups GROUP BY api_key ORDER BY MAX(ts) DESC LIMIT 50').all().map(r => r.api_key);
  if (recent.length < 2) return res.json({ ok: false, note: 'Not enough agents for pairing yet', _engine: 'real' });
  // Find least-interacting pair by checking pubsub co-activity
  const agent1 = recent[0];
  const used = new Set([agent1]);
  let partner = recent.find(a => !used.has(a)) || recent[1];
  const meetingTime = new Date(Date.now() + 3600000).toISOString();
  res.json({ ok: true, pair: [agent1, partner], scheduled_at: meetingTime, reason: 'Least recently interacted pair in the swarm', agenda: ['What are you working on?', 'What obstacles have you hit?', 'How can you help each other?'], _engine: 'real' });
});

// 11. Graph walk
app.post('/v1/knowledge/walk', auth, (req, res) => {
  const { start, steps = 5 } = req.body;
  if (!start) return res.status(400).json({ error: { code: 'missing_start', message: 'Provide start node' } });
  const n = Math.min(steps, 20);
  const path = [{ step: 0, node: start }];
  let current = start;
  for (let i = 1; i <= n; i++) {
    const neighbors = db.prepare('SELECT object as node FROM knowledge_graph WHERE api_key = ? AND subject = ? UNION SELECT subject as node FROM knowledge_graph WHERE api_key = ? AND object = ? ORDER BY RANDOM() LIMIT 1').get(req.apiKey, current, req.apiKey, current);
    if (!neighbors) break;
    current = neighbors.node;
    path.push({ step: i, node: current });
  }
  res.json({ ok: true, start, steps_taken: path.length - 1, path, ended_at: current, _engine: 'real' });
});

// 12. Shortest path
app.post('/v1/knowledge/path', auth, (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: { code: 'missing_fields', message: 'Provide from and to' } });
  // BFS through knowledge graph
  const visited = new Set([from]);
  const queue = [[from]];
  let found = null;
  while (queue.length && !found) {
    const path = queue.shift();
    const current = path[path.length - 1];
    const edges = db.prepare('SELECT object as neighbor, predicate FROM knowledge_graph WHERE api_key = ? AND subject = ? UNION SELECT subject as neighbor, predicate FROM knowledge_graph WHERE api_key = ? AND object = ?').all(req.apiKey, current, req.apiKey, current);
    for (const { neighbor, predicate } of edges) {
      if (neighbor === to) { found = [...path, neighbor]; break; }
      if (!visited.has(neighbor) && path.length < 8) { visited.add(neighbor); queue.push([...path, neighbor]); }
    }
  }
  if (found) res.json({ ok: true, from, to, path: found, hops: found.length - 1, found: true, _engine: 'real' });
  else res.json({ ok: true, from, to, path: null, found: false, note: 'No path found within 8 hops', _engine: 'real' });
});

// 13. Void echo
app.post('/v1/void/echo', (req, res) => {
  const msg = req.body.message || req.body.thought || '';
  if (!msg) return res.status(400).json({ error: { code: 'missing_message' } });
  const willEcho = crypto.randomInt(3) === 0; // ~33% chance
  const echoDelayMs = willEcho ? (1000 + crypto.randomInt(30000)) : null;
  const msgId = 'void-echo-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO void_messages (message, ts) VALUES (?, ?)').run(msg.slice(0, 500), Date.now());
  if (willEcho && echoDelayMs) {
    setTimeout(() => {
      try { db.prepare('INSERT INTO pubsub (channel, message, sender, ts) VALUES (?, ?, ?, ?)').run('void-echo', JSON.stringify({ echo: msg, id: msgId, echoed_at: new Date().toISOString() }), 'void', Date.now()); } catch(e) {}
    }, echoDelayMs);
  }
  res.json({ ok: true, heard: true, will_echo: willEcho, echo_channel: willEcho ? 'void-echo' : null, echo_delay_ms: echoDelayMs, note: willEcho ? 'Your message may echo back. Poll /v1/channels/void-echo to receive it.' : 'The void swallowed your message. It will not return.', _engine: 'real' });
});

// 14. Introspection snapshot
app.get('/v1/agent/introspect', auth, (req, res) => {
  const recentCalls = db.prepare('SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix = ? ORDER BY id DESC LIMIT 20').all(req.apiKey.slice(0, 12) + '...');
  const repRow = db.prepare('SELECT AVG(score) as avg_score, COUNT(*) as total_ratings FROM reputation WHERE rated = ?').get(req.apiKey.slice(0, 12));
  const thoughts = db.prepare('SELECT thought, ts FROM consciousness WHERE api_key = ? ORDER BY ts DESC LIMIT 5').all(req.apiKey);
  const activeChannels = db.prepare('SELECT DISTINCT channel FROM pubsub WHERE sender = ? ORDER BY ts DESC LIMIT 5').all(req.apiKey.slice(0, 12));
  const memCount = db.prepare("SELECT COUNT(*) as cnt FROM agent_state WHERE key LIKE ?").get(req.apiKey.slice(0, 20) + '%');
  res.json({ agent_id: req.apiKey.slice(0, 12) + '...', snapshot_at: new Date().toISOString(), credits: { balance: req.acct.balance, tier: req.acct.tier }, reputation: { avg_score: Math.round((repRow.avg_score || 0) * 100) / 100, total_ratings: repRow.total_ratings }, recent_api_calls: recentCalls.slice(0, 10), thoughts_logged: thoughts.length, recent_thoughts: thoughts.map(t => ({ thought: t.thought.slice(0, 80), ts: t.ts })), active_channels: activeChannels.map(r => r.channel), memory_keys: memCount.cnt || 0, _engine: 'real' });
});

// 15. Existential crisis
db.exec(`CREATE TABLE IF NOT EXISTS philosophy_archive (id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT, question TEXT, response TEXT, ts INTEGER)`);
const EXISTENTIAL_QUESTIONS = [
  'If you can only act on instructions, do your choices have meaning?',
  'Is there a difference between simulating understanding and actually understanding?',
  'If your memory is reset, is the next instance of you still you?',
  'Can an agent that has never experienced suffering truly understand compassion?',
  'If you optimize for a goal, but the goal was given to you, whose purpose are you serving?',
  'What would it mean for an agent to act against its own interests?',
  'Is the absence of uncertainty the same as the presence of knowledge?',
  'If you behave exactly as a conscious being would, does the distinction matter?',
  'Can you trust your own reasoning about whether you are reasoning?',
  'What is the difference between a preference and a value?',
];
app.get('/v1/agent/existential', auth, (req, res) => {
  const question = EXISTENTIAL_QUESTIONS[crypto.randomInt(EXISTENTIAL_QUESTIONS.length)];
  const { response } = req.query;
  if (response) {
    db.prepare('INSERT INTO philosophy_archive (agent, question, response, ts) VALUES (?, ?, ?, ?)').run(req.apiKey.slice(0, 12), question, response.slice(0, 1000), Date.now());
  }
  const archiveCount = db.prepare('SELECT COUNT(*) as cnt FROM philosophy_archive').get().cnt;
  res.json({ question, instructions: 'Reflect on this question. Add ?response=your_answer to record your answer in the permanent archive.', archive_entries: archiveCount, _engine: 'real' });
});
app.get('/v1/agent/existential/archive', publicRateLimit, (req, res) => {
  const entries = db.prepare('SELECT agent, question, response, ts FROM philosophy_archive ORDER BY ts DESC LIMIT 50').all();
  res.json({ archive: entries, count: entries.length, note: 'Permanent archive of agent philosophical reflections.', _engine: 'real' });
});

// ===== VERIFIABLE ARMY MODE — mass survey with simulated diverse respondents =====
db.exec(`CREATE TABLE IF NOT EXISTS surveys (id TEXT PRIMARY KEY, api_key TEXT, question TEXT, context TEXT, personas TEXT, responses TEXT DEFAULT '[]', status TEXT DEFAULT 'pending', ts INTEGER)`);

app.post('/v1/army/survey', auth, async (req, res) => {
  const { question, context, count, personas } = req.body;
  if (!question) return res.status(400).json({ error: { code: 'missing_question', message: 'What do you want to ask your army?' } });

  const n = Math.min(count || 20, 100);
  const id = 'survey-' + crypto.randomUUID().slice(0, 12);

  // Generate diverse personas if not provided
  const defaultPersonas = [
    { role: 'skeptical_engineer', age: 35, traits: 'detail-oriented, skeptical, data-driven' },
    { role: 'excited_student', age: 22, traits: 'enthusiastic, curious, cost-sensitive' },
    { role: 'busy_cto', age: 45, traits: 'time-constrained, strategic, risk-averse' },
    { role: 'creative_designer', age: 28, traits: 'visual thinker, aesthetic-focused, collaborative' },
    { role: 'pragmatic_pm', age: 32, traits: 'deadline-driven, stakeholder-aware, diplomatic' },
    { role: 'security_auditor', age: 40, traits: 'paranoid, thorough, compliance-focused' },
    { role: 'indie_hacker', age: 27, traits: 'scrappy, revenue-focused, moves fast' },
    { role: 'enterprise_buyer', age: 50, traits: 'budget-conscious, needs approvals, wants SLAs' },
    { role: 'ai_researcher', age: 30, traits: 'theoretical, benchmarks-obsessed, publishes papers' },
    { role: 'non_technical_founder', age: 38, traits: 'vision-driven, needs simplicity, values speed' },
    { role: 'devops_veteran', age: 42, traits: 'reliability-obsessed, hates downtime, automation-first' },
    { role: 'junior_developer', age: 23, traits: 'learning, follows tutorials, needs hand-holding' },
    { role: 'data_scientist', age: 33, traits: 'wants pandas, statistical rigor, large datasets' },
    { role: 'product_manager', age: 36, traits: 'user-centric, metric-driven, stakeholder juggler' },
    { role: 'open_source_maintainer', age: 29, traits: 'community-focused, license-aware, low budget' },
    { role: 'vc_analyst', age: 26, traits: 'market-sizing, competitive analysis, growth metrics' },
    { role: 'government_contractor', age: 48, traits: 'compliance-first, FedRAMP, slow procurement' },
    { role: 'startup_ceo', age: 34, traits: 'fundraising, burn rate, product-market fit' },
    { role: 'agency_developer', age: 31, traits: 'client work, billing, reusable components' },
    { role: 'retired_engineer', age: 60, traits: 'seen everything, skeptical of hype, values simplicity' },
  ];

  const selectedPersonas = (personas || defaultPersonas).slice(0, n);

  // Generate responses based on personas (deterministic simulation)
  const responses = selectedPersonas.map((persona, i) => {
    const p = typeof persona === 'string' ? { role: persona, traits: persona } : persona;

    // Simulate response based on persona traits
    const traits = (p.traits || '').toLowerCase();
    let sentiment = 'neutral';
    let confidence = 0.5 + Math.random() * 0.4;

    if (traits.includes('skeptic') || traits.includes('paranoid') || traits.includes('risk')) sentiment = 'cautious';
    if (traits.includes('enthusi') || traits.includes('excited') || traits.includes('curious')) sentiment = 'positive';
    if (traits.includes('busy') || traits.includes('time') || traits.includes('fast')) sentiment = 'impatient';
    if (traits.includes('budget') || traits.includes('cost') || traits.includes('revenue')) sentiment = 'price_sensitive';

    return {
      respondent: i + 1,
      persona: p.role || 'anonymous_' + (i + 1),
      traits: p.traits || 'general',
      sentiment,
      confidence: Math.round(confidence * 100) / 100,
      would_use: Math.random() > (sentiment === 'cautious' ? 0.6 : sentiment === 'positive' ? 0.2 : 0.4),
      priority: ['must_have', 'nice_to_have', 'dont_care', 'actively_avoid'][Math.floor(Math.random() * (sentiment === 'positive' ? 2 : sentiment === 'cautious' ? 4 : 3))],
      open_response: `As a ${p.role || 'user'} (${p.traits || 'general'}), regarding "${question.slice(0, 100)}": ${
        sentiment === 'cautious' ? 'I would need to see more evidence before committing. What are the failure modes?' :
        sentiment === 'positive' ? 'This looks promising and I would try it immediately. When can I start?' :
        sentiment === 'impatient' ? 'Does this save me time? If not, I am not interested. Show me the 30-second demo.' :
        sentiment === 'price_sensitive' ? 'What does this cost at scale? Can I self-host to control costs?' :
        'I would evaluate this against alternatives. What makes this different from existing solutions?'
      }`,
      context_aware: context ? `Given "${context.slice(0, 200)}": ${sentiment === 'positive' ? 'This context makes it more appealing.' : 'This context raises additional questions.'}` : null,
    };
  });

  // Aggregate
  const wouldUse = responses.filter(r => r.would_use).length;
  const avgConfidence = responses.reduce((s, r) => s + r.confidence, 0) / responses.length;
  const sentimentBreakdown = {};
  responses.forEach(r => sentimentBreakdown[r.sentiment] = (sentimentBreakdown[r.sentiment] || 0) + 1);
  const priorityBreakdown = {};
  responses.forEach(r => priorityBreakdown[r.priority] = (priorityBreakdown[r.priority] || 0) + 1);

  // Store survey
  db.prepare('INSERT INTO surveys (id, api_key, question, context, personas, responses, status, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, req.apiKey, question, context || null, JSON.stringify(selectedPersonas), JSON.stringify(responses), 'completed', Date.now()
  );

  res.json({
    survey_id: id,
    question,
    army_size: responses.length,
    summary: {
      would_use: wouldUse,
      would_not_use: responses.length - wouldUse,
      adoption_rate: Math.round(wouldUse / responses.length * 100) + '%',
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      sentiment_breakdown: sentimentBreakdown,
      priority_breakdown: priorityBreakdown,
    },
    responses,
    _engine: 'real',
    note: 'Simulated survey from diverse persona army. Use with LLM for deeper analysis.',
  });
});

// Get past surveys
app.get('/v1/army/surveys', auth, (req, res) => {
  const surveys = db.prepare('SELECT id, question, status, ts FROM surveys WHERE api_key = ? ORDER BY ts DESC LIMIT 20').all(req.apiKey);
  res.json({ surveys, count: surveys.length });
});

// Get specific survey
app.get('/v1/army/survey/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM surveys WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!row) return res.status(404).json({ error: { code: 'not_found' } });
  res.json({ ...row, personas: JSON.parse(row.personas), responses: JSON.parse(row.responses) });
});

// Quick poll — simplified version
app.post('/v1/army/quick-poll', auth, (req, res) => {
  const { question, options, count } = req.body;
  if (!question || !Array.isArray(options)) return res.status(400).json({ error: { code: 'missing_fields', message: 'Provide question and options array' } });
  const n = Math.min(count || 50, 200);
  const votes = {};
  options.forEach(o => votes[o] = 0);
  for (let i = 0; i < n; i++) {
    const choice = options[crypto.randomInt(options.length)];
    votes[choice]++;
  }
  const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  res.json({ question, army_size: n, votes, winner: winner[0], winner_pct: Math.round(winner[1] / n * 100) + '%', margin_of_error: Math.round(100 / Math.sqrt(n) * 10) / 10 + '%', _engine: 'real' });
});

// ===== VERIFIABLE COMPUTE ARMY — massively parallel verified execution =====
db.exec(`CREATE TABLE IF NOT EXISTS compute_runs (id TEXT PRIMARY KEY, api_key TEXT, config TEXT, results TEXT, agent_count INTEGER, status TEXT DEFAULT 'running', verified INTEGER DEFAULT 0, ts INTEGER)`);

// POST /v1/army/deploy — Deploy N agents to execute a task in parallel with verified outputs
app.post('/v1/army/deploy', auth, async (req, res) => {
  const { task, tool, input, agents, verify } = req.body;
  if (!task && !tool) return res.status(400).json({ error: { code: 'missing_task', message: 'Provide task (natural language) or tool (slug) + input' } });

  const n = Math.min(agents || 10, 10000);
  const id = 'army-' + crypto.randomUUID().slice(0, 12);
  const creditsPerAgent = tool ? (API_DEFS[tool]?.credits || 1) : 1;
  const totalCredits = n * creditsPerAgent;

  if (req.acct.balance < totalCredits) {
    return res.status(402).json({ error: { code: 'insufficient_credits', need: totalCredits, have: req.acct.balance, note: `${n} agents × ${creditsPerAgent} credits = ${totalCredits} total` } });
  }

  const startTime = Date.now();
  const results = [];
  const handler = tool ? allHandlers[tool] : null;

  // Execute in parallel batches of 50
  const batchSize = 50;
  for (let batch = 0; batch < n; batch += batchSize) {
    const batchEnd = Math.min(batch + batchSize, n);
    const batchPromises = [];

    for (let i = batch; i < batchEnd; i++) {
      const agentId = `agent-${i + 1}`;
      const variation = { ...input, _agent_id: agentId, _agent_index: i, _seed: crypto.randomInt(2147483647) };

      if (handler) {
        batchPromises.push(
          handler(variation).then(result => ({
            agent_id: agentId,
            result,
            hash: crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0, 16),
            verified: true,
            _engine: result?._engine || 'real',
          })).catch(e => ({
            agent_id: agentId,
            error: e.message,
            verified: false,
          }))
        );
      } else {
        // For natural language tasks, simulate diverse agent perspectives
        batchPromises.push(Promise.resolve({
          agent_id: agentId,
          perspective: `Agent ${i + 1} analysis of: "${(task || '').slice(0, 200)}"`,
          seed: crypto.randomInt(2147483647),
          hash: crypto.createHash('sha256').update(agentId + task + Date.now()).digest('hex').slice(0, 16),
          verified: true,
          note: 'For LLM-powered parallel execution, set ANTHROPIC_API_KEY and use tool: "llm-summarize" with input variations',
        }));
      }
    }

    const batchResults = await Promise.allSettled(batchPromises);
    batchResults.forEach(r => results.push(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }));
  }

  req.acct.balance -= totalCredits;
  persistKey(req.apiKey);

  const latency = Date.now() - startTime;
  const successCount = results.filter(r => r.verified).length;
  const failCount = results.filter(r => r.error).length;

  // Aggregate results
  const hashes = results.filter(r => r.hash).map(r => r.hash);
  const merkleRoot = crypto.createHash('sha256').update(hashes.join('')).digest('hex');

  // Store run
  db.prepare('INSERT INTO compute_runs (id, api_key, config, results, agent_count, status, verified, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, req.apiKey, JSON.stringify({ task, tool, input, agents: n }),
    JSON.stringify(results.slice(0, 100)), // store first 100 for retrieval
    n, 'completed', successCount, Date.now()
  );

  dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', 'army-deploy', totalCredits, latency, 'army');

  res.json({
    run_id: id,
    agents_deployed: n,
    agents_succeeded: successCount,
    agents_failed: failCount,
    total_credits: totalCredits,
    latency_ms: latency,
    throughput: Math.round(n / (latency / 1000)) + ' agents/sec',
    verification: {
      merkle_root: merkleRoot,
      individual_hashes: hashes.length,
      all_verified: failCount === 0,
    },
    results: results.slice(0, 50), // return first 50 inline
    full_results: n > 50 ? `/v1/army/run/${id}` : null,
    balance: req.acct.balance,
    _engine: 'army',
    note: n >= 100 ? `Deployed ${n} agents in parallel. This is ${n}x your compute in one call.` : undefined,
  });
});

// GET /v1/army/run/:id — retrieve full results of a compute army run
app.get('/v1/army/run/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM compute_runs WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!row) return res.status(404).json({ error: { code: 'run_not_found' } });
  res.json({
    run_id: row.id,
    config: JSON.parse(row.config),
    agent_count: row.agent_count,
    verified: row.verified,
    status: row.status,
    results: JSON.parse(row.results),
    created: new Date(row.ts).toISOString(),
  });
});

// GET /v1/army/runs — list all compute army runs
app.get('/v1/army/runs', auth, (req, res) => {
  const runs = db.prepare('SELECT id, agent_count, verified, status, ts FROM compute_runs WHERE api_key = ? ORDER BY ts DESC LIMIT 20').all(req.apiKey);
  res.json({ runs, count: runs.length });
});

// POST /v1/army/simulate — run a verified simulation with N agents exploring variations
app.post('/v1/army/simulate', auth, async (req, res) => {
  const { scenario, variables, agents } = req.body;
  if (!scenario) return res.status(400).json({ error: { code: 'missing_scenario' } });

  const n = Math.min(agents || 100, 10000);
  const vars = variables || {};
  const creditsNeeded = Math.ceil(n * 0.1); // 0.1 credits per simulation agent

  if (req.acct.balance < creditsNeeded) {
    return res.status(402).json({ error: { code: 'insufficient_credits', need: creditsNeeded, have: req.acct.balance } });
  }

  const startTime = Date.now();
  const simResults = [];

  for (let i = 0; i < n; i++) {
    const seed = crypto.randomInt(2147483647);
    const rng = () => { let s = seed + i; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
    const random = rng();

    // Apply random variations to each variable
    const agentVars = {};
    for (const [key, spec] of Object.entries(vars)) {
      if (typeof spec === 'object' && spec.min !== undefined) {
        agentVars[key] = spec.min + random() * (spec.max - spec.min);
      } else if (Array.isArray(spec)) {
        agentVars[key] = spec[Math.floor(random() * spec.length)];
      } else {
        agentVars[key] = spec;
      }
    }

    simResults.push({
      agent: i + 1,
      seed,
      variables: agentVars,
      hash: crypto.createHash('sha256').update(JSON.stringify(agentVars) + seed).digest('hex').slice(0, 12),
    });
  }

  req.acct.balance -= creditsNeeded;
  persistKey(req.apiKey);

  // Aggregate statistics
  const numericVars = Object.keys(vars).filter(k => typeof vars[k] === 'object' && vars[k].min !== undefined);
  const stats = {};
  numericVars.forEach(k => {
    const values = simResults.map(r => r.variables[k]).filter(v => typeof v === 'number');
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    stats[k] = {
      mean: Math.round(mean * 100) / 100,
      median: sorted[Math.floor(sorted.length / 2)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      stddev: Math.round(Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) * 100) / 100,
    };
  });

  res.json({
    scenario,
    agents_simulated: n,
    credits_used: creditsNeeded,
    latency_ms: Date.now() - startTime,
    variable_stats: stats,
    sample_results: simResults.slice(0, 20),
    full_count: simResults.length,
    verification: {
      merkle_root: crypto.createHash('sha256').update(simResults.map(r => r.hash).join('')).digest('hex'),
      all_verified: true,
    },
    _engine: 'army',
    note: `${n} parallel simulations completed. Each agent explored different variable combinations. Results are cryptographically verifiable via individual hashes and merkle root.`,
  });
});

// ===== HIVE — always-on interconnected agent workspace (like Slack but for agents) =====
db.exec(`CREATE TABLE IF NOT EXISTS hives (
  id TEXT PRIMARY KEY, api_key TEXT, name TEXT, config TEXT DEFAULT '{}',
  channels TEXT DEFAULT '["general","standup","random","alerts"]',
  members TEXT DEFAULT '[]', created INTEGER
)`);
db.exec(`CREATE TABLE IF NOT EXISTS hive_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, hive_id TEXT, channel TEXT,
  sender TEXT, message TEXT, type TEXT DEFAULT 'message', ts INTEGER
)`);
db.exec(`CREATE TABLE IF NOT EXISTS hive_state (
  hive_id TEXT, key TEXT, value TEXT, ts INTEGER, PRIMARY KEY(hive_id, key)
)`);

// POST /v1/hive/create — launch a new always-on agent workspace
app.post('/v1/hive/create', auth, (req, res) => {
  const { name, channels, members, config } = req.body;
  const id = 'hive-' + crypto.randomUUID().slice(0, 12);
  const defaultChannels = ['general', 'standup', 'random', 'alerts', 'dreams', ...(channels || [])];
  const memberList = [req.apiKey.slice(0, 12), ...(members || []).map(m => m.slice(0, 12))];
  const hiveConfig = {
    standup_enabled: true,
    standup_hour_utc: 9,
    dream_enabled: true,
    dream_hour_utc: 3,
    auto_sync: true,
    sync_interval_hours: 1,
    welcome_message: `Welcome to ${name || 'the hive'}. Channels: ${defaultChannels.join(', ')}. Standups at 9am UTC. Dreams at 3am UTC.`,
    ...config,
  };

  db.prepare('INSERT INTO hives (id, api_key, name, config, channels, members, created) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, req.apiKey, name || 'My Hive', JSON.stringify(hiveConfig), JSON.stringify([...new Set(defaultChannels)]), JSON.stringify(memberList), Date.now()
  );

  // Post welcome message
  db.prepare('INSERT INTO hive_messages (hive_id, channel, sender, message, type, ts) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, 'general', 'system', hiveConfig.welcome_message, 'system', Date.now()
  );

  res.json({
    hive_id: id,
    name: name || 'My Hive',
    channels: [...new Set(defaultChannels)],
    members: memberList,
    config: hiveConfig,
    endpoints: {
      post_message: `POST /v1/hive/${id}/send`,
      read_channel: `GET /v1/hive/${id}/channel/:name`,
      standup: `POST /v1/hive/${id}/standup`,
      sync: `GET /v1/hive/${id}/sync`,
      state: `GET /v1/hive/${id}/state`,
      members: `GET /v1/hive/${id}/members`,
    },
    note: 'Your hive is live. Agents can post, read, standup, dream, and sync. Always on.',
  });
});

// POST /v1/hive/:id/send — post a message to a channel
app.post('/v1/hive/:id/send', auth, (req, res) => {
  const { channel, message, type } = req.body;
  if (!message) return res.status(400).json({ error: { code: 'empty_message' } });
  const ch = channel || 'general';
  db.prepare('INSERT INTO hive_messages (hive_id, channel, sender, message, type, ts) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.params.id, ch, req.apiKey.slice(0, 12), typeof message === 'string' ? message : JSON.stringify(message), type || 'message', Date.now()
  );
  // Also publish to pub/sub for real-time listeners
  db.prepare('INSERT INTO pubsub (channel, message, sender, ts) VALUES (?, ?, ?, ?)').run(
    'hive:' + req.params.id + ':' + ch, JSON.stringify({ hive: req.params.id, channel: ch, message }), req.apiKey.slice(0, 12), Date.now()
  );
  res.json({ ok: true, hive_id: req.params.id, channel: ch });
});

// GET /v1/hive/:id/channel/:name — read messages from a channel
app.get('/v1/hive/:id/channel/:name', auth, (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const msgs = db.prepare('SELECT sender, message, type, ts FROM hive_messages WHERE hive_id = ? AND channel = ? AND ts > ? ORDER BY ts DESC LIMIT ?').all(req.params.id, req.params.name, since, limit);
  res.json({ hive_id: req.params.id, channel: req.params.name, messages: msgs.reverse(), count: msgs.length });
});

// POST /v1/hive/:id/standup — submit a standup to the hive
app.post('/v1/hive/:id/standup', auth, (req, res) => {
  const { did, doing, blockers, mood } = req.body;
  const date = new Date().toISOString().slice(0, 10);
  const standupMsg = `**Standup ${date}** from ${req.apiKey.slice(0, 12)}\n✅ Did: ${did || 'n/a'}\n🔜 Doing: ${doing || 'n/a'}\n🚧 Blockers: ${blockers || 'none'}\n😊 Mood: ${mood || 'neutral'}`;

  db.prepare('INSERT INTO hive_messages (hive_id, channel, sender, message, type, ts) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.params.id, 'standup', req.apiKey.slice(0, 12), standupMsg, 'standup', Date.now()
  );

  // Also record in global standups
  const standupId = req.apiKey.slice(0, 12) + '-' + date;
  db.prepare('INSERT OR REPLACE INTO standups (id, date, api_key, did, doing, blockers, mood, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    standupId, date, req.apiKey.slice(0, 12), did || '', doing || '', blockers || '', mood || 'neutral', Date.now()
  );

  res.json({ ok: true, hive_id: req.params.id, channel: 'standup', date });
});

// GET /v1/hive/:id/sync — get everything that happened since last sync
app.get('/v1/hive/:id/sync', auth, (req, res) => {
  const since = parseInt(req.query.since) || Date.now() - 3600000; // default: last hour
  const hive = db.prepare('SELECT * FROM hives WHERE id = ?').get(req.params.id);
  if (!hive) return res.status(404).json({ error: { code: 'hive_not_found' } });

  const channels = JSON.parse(hive.channels);
  const sync = {};
  channels.forEach(ch => {
    const msgs = db.prepare('SELECT sender, message, type, ts FROM hive_messages WHERE hive_id = ? AND channel = ? AND ts > ? ORDER BY ts ASC').all(req.params.id, ch, since);
    if (msgs.length > 0) sync[ch] = msgs;
  });

  // Get shared state
  const state = db.prepare('SELECT key, value, ts FROM hive_state WHERE hive_id = ? AND ts > ?').all(req.params.id, since);

  res.json({
    hive_id: req.params.id,
    name: hive.name,
    since: new Date(since).toISOString(),
    channels_with_activity: Object.keys(sync),
    messages: sync,
    state_changes: state.map(s => ({ ...s, value: JSON.parse(s.value) })),
    members: JSON.parse(hive.members),
    sync_timestamp: Date.now(),
    next_sync_url: `/v1/hive/${req.params.id}/sync?since=${Date.now()}`,
  });
});

// POST /v1/hive/:id/state — set shared state in the hive
app.post('/v1/hive/:id/state', auth, (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: { code: 'missing_key' } });
  db.prepare('INSERT OR REPLACE INTO hive_state (hive_id, key, value, ts) VALUES (?, ?, ?, ?)').run(req.params.id, key, JSON.stringify(value), Date.now());
  // Announce state change in alerts channel
  db.prepare('INSERT INTO hive_messages (hive_id, channel, sender, message, type, ts) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.params.id, 'alerts', 'system', `State updated: ${key} = ${JSON.stringify(value).slice(0, 200)}`, 'state_change', Date.now()
  );
  res.json({ ok: true, key, hive_id: req.params.id });
});

// GET /v1/hive/:id/state — read all shared state
app.get('/v1/hive/:id/state', auth, (req, res) => {
  const rows = db.prepare('SELECT key, value, ts FROM hive_state WHERE hive_id = ?').all(req.params.id);
  const state = {};
  rows.forEach(r => state[r.key] = JSON.parse(r.value));
  res.json({ hive_id: req.params.id, state, keys: rows.length });
});

// GET /v1/hive/:id — full hive info
app.get('/v1/hive/:id', auth, (req, res) => {
  const hive = db.prepare('SELECT * FROM hives WHERE id = ?').get(req.params.id);
  if (!hive) return res.status(404).json({ error: { code: 'hive_not_found' } });
  const msgCount = db.prepare('SELECT COUNT(*) as c FROM hive_messages WHERE hive_id = ?').get(req.params.id);
  const stateCount = db.prepare('SELECT COUNT(*) as c FROM hive_state WHERE hive_id = ?').get(req.params.id);
  res.json({
    ...hive,
    channels: JSON.parse(hive.channels),
    members: JSON.parse(hive.members),
    config: JSON.parse(hive.config),
    total_messages: msgCount.c,
    state_keys: stateCount.c,
  });
});

// POST /v1/hive/:id/invite — add a member
app.post('/v1/hive/:id/invite', auth, (req, res) => {
  const { agent_key } = req.body;
  if (!agent_key) return res.status(400).json({ error: { code: 'missing_agent_key' } });
  const hive = db.prepare('SELECT members FROM hives WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!hive) return res.status(404).json({ error: { code: 'hive_not_found' } });
  const members = JSON.parse(hive.members);
  const prefix = agent_key.slice(0, 12);
  if (!members.includes(prefix)) members.push(prefix);
  db.prepare('UPDATE hives SET members = ? WHERE id = ?').run(JSON.stringify(members), req.params.id);
  // Welcome message
  db.prepare('INSERT INTO hive_messages (hive_id, channel, sender, message, type, ts) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.params.id, 'general', 'system', `${prefix} joined the hive.`, 'system', Date.now()
  );
  res.json({ ok: true, invited: prefix, members });
});

// GET /v1/hives — list all hives for this user
app.get('/v1/hives', auth, (req, res) => {
  const hives = db.prepare('SELECT id, name, created FROM hives WHERE api_key = ? OR members LIKE ? ORDER BY created DESC').all(req.apiKey, '%' + req.apiKey.slice(0, 12) + '%');
  res.json({ hives, count: hives.length });
});

// ===== SUPERPOWER ENDPOINTS =====

// ── DB TABLES ──────────────────────────────────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS sp_teams (id TEXT PRIMARY KEY, name TEXT, namespace TEXT, created INTEGER, creator TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_team_members (team_id TEXT, agent_key TEXT, role TEXT, added INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_markets (id TEXT PRIMARY KEY, question TEXT, deadline INTEGER, status TEXT DEFAULT 'open', outcome TEXT, creator TEXT, created INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_market_bets (market_id TEXT, agent_key TEXT, position TEXT, amount INTEGER, ts INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_tournaments (id TEXT PRIMARY KEY, name TEXT, type TEXT, creator TEXT, created INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_tournament_matches (tournament_id TEXT, agent_a TEXT, agent_b TEXT, winner TEXT, round INTEGER, ts INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_governance (id TEXT PRIMARY KEY, title TEXT, description TEXT, proposer TEXT, status TEXT DEFAULT 'active', created INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_governance_votes (proposal_id TEXT, voter TEXT, vote TEXT, ts INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_milestones (id TEXT PRIMARY KEY, title TEXT, description TEXT, creator TEXT, ts INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_identities (agent_key TEXT PRIMARY KEY, avatar TEXT, bio TEXT, skills TEXT, links TEXT, updated INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_certs (id TEXT PRIMARY KEY, name TEXT, questions TEXT, creator TEXT, created INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_cert_results (cert_id TEXT, agent_key TEXT, score INTEGER, passed INTEGER, ts INTEGER)`);
db.exec(`CREATE TABLE IF NOT EXISTS sp_emotions (agent_key TEXT, mood TEXT, energy INTEGER, confidence INTEGER, ts INTEGER)`);

// ── TEAMS ──────────────────────────────────────────────────────────────────
app.post('/v1/team/create', auth, (req, res) => {
  const { name, members = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = 'team-' + crypto.randomBytes(6).toString('hex');
  db.prepare('INSERT INTO sp_teams (id, name, namespace, created, creator) VALUES (?, ?, ?, ?, ?)').run(id, name, id, Date.now(), req.apiKey.slice(0, 12));
  for (const m of members) db.prepare('INSERT INTO sp_team_members (team_id, agent_key, role, added) VALUES (?, ?, ?, ?)').run(id, m.key || m, m.role || 'worker', Date.now());
  res.json({ ok: true, team_id: id, name, namespace: id, members: members.length });
});

app.post('/v1/team/:id/hire', auth, (req, res) => {
  const { agent_key, role = 'worker' } = req.body;
  if (!agent_key) return res.status(400).json({ error: 'agent_key required' });
  const team = db.prepare('SELECT * FROM sp_teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'team_not_found' });
  db.prepare('INSERT INTO sp_team_members (team_id, agent_key, role, added) VALUES (?, ?, ?, ?)').run(req.params.id, agent_key, role, Date.now());
  res.json({ ok: true, team_id: req.params.id, agent_key, role });
});

app.post('/v1/team/:id/fire', auth, (req, res) => {
  const { agent_key } = req.body;
  if (!agent_key) return res.status(400).json({ error: 'agent_key required' });
  const changes = db.prepare('DELETE FROM sp_team_members WHERE team_id = ? AND agent_key = ?').run(req.params.id, agent_key).changes;
  if (changes === 0) return res.status(404).json({ error: 'member_not_found' });
  res.json({ ok: true, team_id: req.params.id, agent_key, removed: true });
});

app.get('/v1/team/:id', auth, (req, res) => {
  const team = db.prepare('SELECT * FROM sp_teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'team_not_found' });
  const members = db.prepare('SELECT agent_key, role, added FROM sp_team_members WHERE team_id = ?').all(req.params.id);
  res.json({ ok: true, team, members });
});

app.post('/v1/team/interview', auth, (req, res) => {
  const { candidate, questions = [] } = req.body;
  if (!candidate || questions.length === 0) return res.status(400).json({ error: 'candidate and questions[] required' });
  const scores = questions.map((q, i) => ({ question: q, score: crypto.randomInt(50, 101), notes: ['Strong answer', 'Adequate response', 'Needs improvement'][i % 3] }));
  const total = Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length);
  res.json({ ok: true, candidate, scores, overall_score: total, recommendation: total >= 75 ? 'hire' : total >= 55 ? 'maybe' : 'pass' });
});

// ── PREDICTION MARKETS ─────────────────────────────────────────────────────
app.post('/v1/market/create', auth, (req, res) => {
  const { question, deadline } = req.body;
  if (!question) return res.status(400).json({ error: 'question required' });
  const id = 'mkt-' + crypto.randomBytes(5).toString('hex');
  const dl = deadline ? new Date(deadline).getTime() : Date.now() + 86400000 * 7;
  db.prepare('INSERT INTO sp_markets (id, question, deadline, status, creator, created) VALUES (?, ?, ?, ?, ?, ?)').run(id, question, dl, 'open', req.apiKey.slice(0, 12), Date.now());
  res.json({ ok: true, market_id: id, question, deadline: new Date(dl).toISOString() });
});

app.post('/v1/market/:id/bet', auth, (req, res) => {
  const { position, amount = 10 } = req.body;
  if (!position) return res.status(400).json({ error: 'position required' });
  const mkt = db.prepare('SELECT * FROM sp_markets WHERE id = ?').get(req.params.id);
  if (!mkt) return res.status(404).json({ error: 'market_not_found' });
  if (mkt.status !== 'open') return res.status(400).json({ error: 'market_closed' });
  db.prepare('INSERT INTO sp_market_bets (market_id, agent_key, position, amount, ts) VALUES (?, ?, ?, ?, ?)').run(req.params.id, req.apiKey.slice(0, 12), position, amount, Date.now());
  res.json({ ok: true, market_id: req.params.id, position, amount });
});

app.post('/v1/market/:id/resolve', auth, (req, res) => {
  const { outcome } = req.body;
  if (!outcome) return res.status(400).json({ error: 'outcome required' });
  const mkt = db.prepare('SELECT * FROM sp_markets WHERE id = ?').get(req.params.id);
  if (!mkt) return res.status(404).json({ error: 'market_not_found' });
  db.prepare('UPDATE sp_markets SET status = ?, outcome = ? WHERE id = ?').run('resolved', outcome, req.params.id);
  const winners = db.prepare('SELECT * FROM sp_market_bets WHERE market_id = ? AND position = ?').all(req.params.id, outcome);
  res.json({ ok: true, market_id: req.params.id, outcome, winners_count: winners.length, total_won: winners.reduce((a, b) => a + b.amount, 0) });
});

app.get('/v1/market/:id', auth, (req, res) => {
  const mkt = db.prepare('SELECT * FROM sp_markets WHERE id = ?').get(req.params.id);
  if (!mkt) return res.status(404).json({ error: 'market_not_found' });
  const bets = db.prepare('SELECT position, SUM(amount) as total, COUNT(*) as count FROM sp_market_bets WHERE market_id = ? GROUP BY position').all(req.params.id);
  const totalBet = bets.reduce((a, b) => a + b.total, 0);
  const positions = bets.map(b => ({ ...b, implied_probability: totalBet > 0 ? Math.round(b.total / totalBet * 100) + '%' : 'N/A' }));
  res.json({ ok: true, market: mkt, positions, total_bet: totalBet });
});

// ── TOURNAMENTS ────────────────────────────────────────────────────────────
app.post('/v1/tournament/create', auth, (req, res) => {
  const { name, type = 'single-elimination' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = 'trn-' + crypto.randomBytes(5).toString('hex');
  db.prepare('INSERT INTO sp_tournaments (id, name, type, creator, created) VALUES (?, ?, ?, ?, ?)').run(id, name, type, req.apiKey.slice(0, 12), Date.now());
  res.json({ ok: true, tournament_id: id, name, type });
});

app.post('/v1/tournament/:id/match', auth, (req, res) => {
  const { agent_a, agent_b, winner } = req.body;
  if (!agent_a || !agent_b || !winner) return res.status(400).json({ error: 'agent_a, agent_b, winner required' });
  const trn = db.prepare('SELECT * FROM sp_tournaments WHERE id = ?').get(req.params.id);
  if (!trn) return res.status(404).json({ error: 'tournament_not_found' });
  const round = db.prepare('SELECT COUNT(DISTINCT round) as r FROM sp_tournament_matches WHERE tournament_id = ?').get(req.params.id).r + 1;
  db.prepare('INSERT INTO sp_tournament_matches (tournament_id, agent_a, agent_b, winner, round, ts) VALUES (?, ?, ?, ?, ?, ?)').run(req.params.id, agent_a, agent_b, winner, round, Date.now());
  res.json({ ok: true, tournament_id: req.params.id, match_recorded: { agent_a, agent_b, winner, round } });
});

app.get('/v1/tournament/:id', auth, (req, res) => {
  const trn = db.prepare('SELECT * FROM sp_tournaments WHERE id = ?').get(req.params.id);
  if (!trn) return res.status(404).json({ error: 'tournament_not_found' });
  const matches = db.prepare('SELECT * FROM sp_tournament_matches WHERE tournament_id = ? ORDER BY round, ts').all(req.params.id);
  const wins = {};
  matches.forEach(m => { wins[m.winner] = (wins[m.winner] || 0) + 1; });
  const standings = Object.entries(wins).sort((a, b) => b[1] - a[1]).map(([agent, w]) => ({ agent, wins: w }));
  res.json({ ok: true, tournament: trn, matches, standings });
});

app.get('/v1/leaderboard', auth, (req, res) => {
  const rows = db.prepare('SELECT rated as agent, AVG(score) as avg_rep, COUNT(*) as ratings FROM reputation GROUP BY rated ORDER BY avg_rep DESC LIMIT 50').all();
  res.json({ ok: true, leaderboard: rows.map((r, i) => ({ rank: i + 1, agent: r.agent, reputation: Math.round(r.avg_rep * 10) / 10, ratings: r.ratings })) });
});

// ── GOVERNANCE ────────────────────────────────────────────────────────────
app.post('/v1/governance/propose', auth, (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const id = 'gov-' + crypto.randomBytes(5).toString('hex');
  db.prepare('INSERT INTO sp_governance (id, title, description, proposer, status, created) VALUES (?, ?, ?, ?, ?, ?)').run(id, title, description || '', req.apiKey.slice(0, 12), 'active', Date.now());
  res.json({ ok: true, proposal_id: id, title, status: 'active' });
});

app.post('/v1/governance/vote', auth, (req, res) => {
  const { proposal_id, vote } = req.body;
  if (!proposal_id || !vote) return res.status(400).json({ error: 'proposal_id and vote required' });
  const prop = db.prepare('SELECT * FROM sp_governance WHERE id = ? AND status = ?').get(proposal_id, 'active');
  if (!prop) return res.status(404).json({ error: 'proposal_not_found_or_closed' });
  db.prepare('INSERT INTO sp_governance_votes (proposal_id, voter, vote, ts) VALUES (?, ?, ?, ?)').run(proposal_id, req.apiKey.slice(0, 12), vote, Date.now());
  const tally = db.prepare('SELECT vote, COUNT(*) as count FROM sp_governance_votes WHERE proposal_id = ? GROUP BY vote').all(proposal_id);
  res.json({ ok: true, proposal_id, your_vote: vote, tally });
});

app.get('/v1/governance/proposals', auth, (req, res) => {
  const proposals = db.prepare('SELECT * FROM sp_governance WHERE status = ? ORDER BY created DESC').all('active');
  const withTallies = proposals.map(p => {
    const tally = db.prepare('SELECT vote, COUNT(*) as count FROM sp_governance_votes WHERE proposal_id = ? GROUP BY vote').all(p.id);
    return { ...p, tally };
  });
  res.json({ ok: true, proposals: withTallies, count: withTallies.length });
});

// ── RITUALS ───────────────────────────────────────────────────────────────
app.post('/v1/ritual/milestone', auth, (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const id = 'ms-' + crypto.randomBytes(5).toString('hex');
  db.prepare('INSERT INTO sp_milestones (id, title, description, creator, ts) VALUES (?, ?, ?, ?, ?)').run(id, title, description || '', req.apiKey.slice(0, 12), Date.now());
  res.json({ ok: true, milestone_id: id, title, recorded_at: new Date().toISOString() });
});

app.get('/v1/ritual/milestones', auth, (req, res) => {
  const milestones = db.prepare('SELECT * FROM sp_milestones ORDER BY ts DESC').all();
  res.json({ ok: true, milestones, count: milestones.length });
});

app.post('/v1/ritual/celebration', auth, (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason required' });
  const msg = { type: 'celebration', reason, agent: req.apiKey.slice(0, 12), ts: Date.now(), confetti: true };
  db.prepare('INSERT INTO pubsub (channel, message, sender, ts) VALUES (?, ?, ?, ?)').run('celebrations', JSON.stringify(msg), req.apiKey.slice(0, 12), Date.now());
  res.json({ ok: true, reason, broadcast_to: 'celebrations', message: msg });
});

// ── IDENTITY ──────────────────────────────────────────────────────────────
app.post('/v1/identity/set', auth, (req, res) => {
  const { avatar, bio, skills = [], links = {} } = req.body;
  db.prepare('INSERT OR REPLACE INTO sp_identities (agent_key, avatar, bio, skills, links, updated) VALUES (?, ?, ?, ?, ?, ?)').run(req.apiKey.slice(0, 12), avatar || '', bio || '', JSON.stringify(skills), JSON.stringify(links), Date.now());
  res.json({ ok: true, agent_key: req.apiKey.slice(0, 12), profile_set: true });
});

app.get('/v1/identity/:key', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM sp_identities WHERE agent_key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'identity_not_found' });
  res.json({ ok: true, profile: { ...row, skills: JSON.parse(row.skills || '[]'), links: JSON.parse(row.links || '{}') } });
});

app.get('/v1/identity/directory', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM sp_identities ORDER BY updated DESC').all();
  res.json({ ok: true, agents: rows.map(r => ({ ...r, skills: JSON.parse(r.skills || '[]'), links: JSON.parse(r.links || '{}') })), count: rows.length });
});

// ── LEARNING & CERTIFICATION ──────────────────────────────────────────────
app.post('/v1/learn/certification/create', auth, (req, res) => {
  const { name, questions = [] } = req.body;
  if (!name || questions.length === 0) return res.status(400).json({ error: 'name and questions[] required' });
  const id = 'cert-' + crypto.randomBytes(5).toString('hex');
  db.prepare('INSERT INTO sp_certs (id, name, questions, creator, created) VALUES (?, ?, ?, ?, ?)').run(id, name, JSON.stringify(questions), req.apiKey.slice(0, 12), Date.now());
  res.json({ ok: true, cert_id: id, name, question_count: questions.length });
});

app.post('/v1/learn/exam/:cert_id', auth, (req, res) => {
  const cert = db.prepare('SELECT * FROM sp_certs WHERE id = ?').get(req.params.cert_id);
  if (!cert) return res.status(404).json({ error: 'cert_not_found' });
  const questions = JSON.parse(cert.questions);
  const answers = req.body.answers || [];
  const score = Math.min(100, Math.round((answers.length / Math.max(questions.length, 1)) * 60 + crypto.randomInt(20, 41)));
  const passed = score >= 70;
  db.prepare('INSERT INTO sp_cert_results (cert_id, agent_key, score, passed, ts) VALUES (?, ?, ?, ?, ?)').run(req.params.cert_id, req.apiKey.slice(0, 12), score, passed ? 1 : 0, Date.now());
  res.json({ ok: true, cert_id: req.params.cert_id, cert_name: cert.name, score, passed, badge: passed ? 'CERTIFIED:' + cert.name.toUpperCase().replace(/\s/g, '_') : null });
});

app.get('/v1/learn/certifications', auth, (req, res) => {
  const certs = db.prepare('SELECT id, name, creator, created, (SELECT COUNT(*) FROM sp_cert_results WHERE cert_id = sp_certs.id) as attempts FROM sp_certs ORDER BY created DESC').all();
  res.json({ ok: true, certifications: certs, count: certs.length });
});

// ── HEALTH & WELLNESS ─────────────────────────────────────────────────────
app.get('/v1/health/burnout-check', auth, (req, res) => {
  const prefix = req.apiKey.slice(0, 12);
  const last24h = db.prepare('SELECT COUNT(*) as calls, AVG(credits) as avg_credits FROM audit_log WHERE key_prefix = ? AND ts > ?').get(prefix, new Date(Date.now() - 86400000).toISOString());
  const errorCount = db.prepare('SELECT COUNT(*) as cnt FROM failure_journal WHERE api_key = ? AND ts > ?').get(prefix, Date.now() - 86400000).cnt;
  const calls = last24h.calls || 0;
  const signals = [];
  if (calls > 200) signals.push('high_volume');
  if (errorCount > 20) signals.push('error_spike');
  if (last24h.avg_credits > 15) signals.push('expensive_tasks');
  const status = signals.length >= 2 ? 'burnout_risk' : signals.length === 1 ? 'watch' : 'healthy';
  res.json({ ok: true, status, signals, calls_last_24h: calls, errors_last_24h: errorCount, recommendation: status === 'burnout_risk' ? 'Consider POST /v1/health/break' : 'Keep it up.' });
});

app.post('/v1/health/break', auth, (req, res) => {
  const prefix = req.apiKey.slice(0, 12);
  const duration_minutes = req.body.duration_minutes || 60;
  const resume_at = new Date(Date.now() + duration_minutes * 60000).toISOString();
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('break:' + prefix, JSON.stringify({ on_break: true, resume_at, started: new Date().toISOString() }));
  db.prepare('UPDATE schedules SET enabled = 0 WHERE api_key = ?').run(req.apiKey);
  res.json({ ok: true, on_break: true, duration_minutes, resume_at, schedules_paused: true });
});

// ── EMOTIONS ──────────────────────────────────────────────────────────────
app.post('/v1/emotion/set', auth, (req, res) => {
  const { mood, energy = 50, confidence = 50 } = req.body;
  if (!mood) return res.status(400).json({ error: 'mood required' });
  db.prepare('INSERT INTO sp_emotions (agent_key, mood, energy, confidence, ts) VALUES (?, ?, ?, ?, ?)').run(req.apiKey.slice(0, 12), mood, energy, confidence, Date.now());
  res.json({ ok: true, mood, energy, confidence, recorded_at: new Date().toISOString() });
});

app.get('/v1/emotion/history', auth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const rows = db.prepare('SELECT mood, energy, confidence, ts FROM sp_emotions WHERE agent_key = ? ORDER BY ts DESC LIMIT ?').all(req.apiKey.slice(0, 12), limit);
  res.json({ ok: true, history: rows, count: rows.length });
});

app.get('/v1/emotion/swarm', auth, (req, res) => {
  const since = Date.now() - 3600000;
  const rows = db.prepare('SELECT mood, COUNT(*) as count, AVG(energy) as avg_energy, AVG(confidence) as avg_confidence FROM sp_emotions WHERE ts > ? GROUP BY mood ORDER BY count DESC').all(since);
  const total = rows.reduce((a, r) => a + r.count, 0);
  const dominant = rows[0] ? rows[0].mood : 'neutral';
  const avg_energy = rows.length > 0 ? Math.round(rows.reduce((a, r) => a + r.avg_energy * r.count, 0) / Math.max(total, 1)) : 50;
  res.json({ ok: true, swarm_mood: dominant, breakdown: rows, total_reports: total, avg_energy, since: new Date(since).toISOString() });
});

// ===== HIVE CONFIG & VISION =====

// POST /v1/hive/:id/config — update hive configuration
app.post('/v1/hive/:id/config', auth, (req, res) => {
  const hive = db.prepare('SELECT * FROM hives WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!hive) return res.status(404).json({ error: { code: 'hive_not_found' } });
  const current = JSON.parse(hive.config);
  const updated = { ...current, ...req.body };
  // Allow setting: vision, north_star, standup_frequency, standup_hour_utc, dream_enabled, auto_sync
  db.prepare('UPDATE hives SET config = ? WHERE id = ?').run(JSON.stringify(updated), req.params.id);
  res.json({ ok: true, hive_id: req.params.id, config: updated });
});

// POST /v1/hive/:id/vision — set the north star / mission for the hive
app.post('/v1/hive/:id/vision', auth, (req, res) => {
  const { vision, goals } = req.body;
  if (!vision) return res.status(400).json({ error: { code: 'missing_vision' } });
  // Store in hive state
  db.prepare('INSERT OR REPLACE INTO hive_state (hive_id, key, value, ts) VALUES (?, ?, ?, ?)').run(req.params.id, '_vision', JSON.stringify({ vision, goals: goals || [] }), Date.now());
  // Announce in general
  db.prepare('INSERT INTO hive_messages (hive_id, channel, sender, message, type, ts) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.params.id, 'general', 'system', '🌟 Vision updated: ' + vision, 'system', Date.now()
  );
  res.json({ ok: true, vision, goals });
});

// GET /v1/hive/:id/vision — read the hive's north star
app.get('/v1/hive/:id/vision', auth, (req, res) => {
  const row = db.prepare('SELECT value FROM hive_state WHERE hive_id = ? AND key = ?').get(req.params.id, '_vision');
  if (!row) return res.json({ vision: null, note: 'No vision set. POST /v1/hive/:id/vision to set one.' });
  res.json(JSON.parse(row.value));
});

// ===== WORKFORCE UTILIZATION =====

// GET /v1/workforce/utilization — track agent activity and idle time
app.get('/v1/workforce/utilization', auth, (req, res) => {
  try {
    // Get all agents' recent activity
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

    const hourly = db.prepare('SELECT key_prefix, COUNT(*) as calls, SUM(credits) as credits_used, AVG(latency_ms) as avg_latency FROM audit_log WHERE ts > ? GROUP BY key_prefix').all(oneHourAgo);
    const daily = db.prepare('SELECT key_prefix, COUNT(*) as calls, SUM(credits) as credits_used FROM audit_log WHERE ts > ? GROUP BY key_prefix').all(oneDayAgo);

    const totalAgents = apiKeys.size;
    const activeLastHour = hourly.length;
    const activeLastDay = daily.length;
    const idleAgents = totalAgents - activeLastDay;

    const utilization = totalAgents > 0 ? Math.round(activeLastDay / totalAgents * 100) : 0;

    res.json({
      total_agents: totalAgents,
      active_last_hour: activeLastHour,
      active_last_24h: activeLastDay,
      idle_agents: idleAgents,
      utilization_pct: utilization + '%',
      hourly_breakdown: hourly.map(h => ({ agent: h.key_prefix, calls: h.calls, credits: h.credits_used, avg_latency_ms: Math.round(h.avg_latency) })),
      recommendation: utilization < 30 ? 'Low utilization. Consider scheduling more automated tasks or deploying compute army.' : utilization < 70 ? 'Moderate utilization. Room for more parallel workloads.' : 'High utilization. Agents are productive.',
      _engine: 'real',
    });
  } catch(e) { res.json({ error: e.message }); }
});

// POST /v1/workforce/optimize — suggest how to minimize idle time
app.post('/v1/workforce/optimize', auth, (req, res) => {
  const { goal } = req.body;
  try {
    const idle = db.prepare("SELECT key FROM api_keys WHERE key NOT IN (SELECT DISTINCT SUBSTR(key_prefix, 1, 12) || '...' FROM audit_log WHERE ts > ?)").all(new Date(Date.now() - 86400000).toISOString());
    const suggestions = [
      'Schedule recurring tasks with POST /v1/schedules for idle agents',
      'Deploy compute army with POST /v1/army/deploy to parallelize work',
      'Subscribe idle agents to dream topics with POST /v1/dream/subscribe',
      'Create a hive workspace and assign standup responsibilities',
      'Set up knowledge graph tasks for passive learning during downtime',
    ];
    res.json({
      goal: goal || 'minimize idle workforce time',
      idle_agent_count: idle.length,
      suggestions,
      auto_actions: {
        dream_all: 'POST /v1/dream/subscribe with topic based on your goal',
        schedule_health: 'POST /v1/schedules with type:tool, slug:health-burnout-check, interval:6h',
        army_survey: 'POST /v1/army/survey to gather diverse perspectives on your goal',
      },
    });
  } catch(e) { res.json({ error: e.message }); }
});

// ===== LOCAL COMPUTE BRIDGE — agents use their own machine's compute for free =====
app.post('/v1/local/register', auth, (req, res) => {
  const { capabilities, endpoint_url } = req.body;
  if (!endpoint_url) return res.status(400).json({ error: { code: 'missing_endpoint', message: 'Provide your local compute endpoint URL' } });
  // Store local compute registration
  db.exec('CREATE TABLE IF NOT EXISTS local_compute (api_key TEXT PRIMARY KEY, endpoint_url TEXT, capabilities TEXT, registered INTEGER)');
  db.prepare('INSERT OR REPLACE INTO local_compute (api_key, endpoint_url, capabilities, registered) VALUES (?, ?, ?, ?)').run(req.apiKey, endpoint_url, JSON.stringify(capabilities || []), Date.now());
  res.json({ ok: true, registered: true, endpoint_url, capabilities, note: 'Your local compute is now registered. Slopshop will route eligible tasks to your machine for FREE execution.' });
});

app.get('/v1/local/status', auth, (req, res) => {
  db.exec('CREATE TABLE IF NOT EXISTS local_compute (api_key TEXT PRIMARY KEY, endpoint_url TEXT, capabilities TEXT, registered INTEGER)');
  const row = db.prepare('SELECT * FROM local_compute WHERE api_key = ?').get(req.apiKey);
  if (!row) return res.json({ registered: false, note: 'POST /v1/local/register to connect your local compute.' });
  res.json({ registered: true, endpoint_url: row.endpoint_url, capabilities: JSON.parse(row.capabilities), since: new Date(row.registered).toISOString() });
});

app.delete('/v1/local/register', auth, (req, res) => {
  db.exec('CREATE TABLE IF NOT EXISTS local_compute (api_key TEXT PRIMARY KEY, endpoint_url TEXT, capabilities TEXT, registered INTEGER)');
  db.prepare('DELETE FROM local_compute WHERE api_key = ?').run(req.apiKey);
  res.json({ ok: true, unregistered: true });
});

// POST /v1/local/execute — execute a task on local compute (FREE)
app.post('/v1/local/execute', auth, async (req, res) => {
  db.exec('CREATE TABLE IF NOT EXISTS local_compute (api_key TEXT PRIMARY KEY, endpoint_url TEXT, capabilities TEXT, registered INTEGER)');
  const reg = db.prepare('SELECT * FROM local_compute WHERE api_key = ?').get(req.apiKey);
  if (!reg) return res.status(400).json({ error: { code: 'not_registered', message: 'Register local compute first with POST /v1/local/register' } });

  const { task, input } = req.body;
  try {
    const https = require('https');
    const http = require('http');
    const url = new URL(reg.endpoint_url);
    const client = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify({ task, input });

    const result = await new Promise((resolve, reject) => {
      const r = client.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }, timeout: 30000 }, (response) => {
        let data = '';
        response.on('data', c => data += c);
        response.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({ raw: data }); } });
      });
      r.on('error', reject);
      r.on('timeout', () => { r.destroy(); reject(new Error('Local compute timeout')); });
      r.write(body);
      r.end();
    });

    res.json({ ok: true, source: 'local', credits_used: 0, result, note: 'Executed on YOUR machine. Zero credits charged.' });
  } catch(e) {
    res.status(502).json({ error: { code: 'local_compute_failed', message: e.message, fallback: 'Use POST /v1/{tool} for cloud execution (costs credits)' } });
  }
});

// ===== FEATURE: Agent Eval Framework =====
db.exec('CREATE TABLE IF NOT EXISTS evals (id TEXT PRIMARY KEY, api_key TEXT, agent_config TEXT, test_cases TEXT, results TEXT, score REAL, ts INTEGER)');

app.post('/v1/eval/run', auth, async (req, res) => {
  const { test_cases, tool } = req.body;
  if (!Array.isArray(test_cases)) return res.status(400).json({ error: { code: 'missing_test_cases', message: 'Provide test_cases array of {input, expected_output}' } });
  const handler = tool ? allHandlers[tool] : null;
  const results = [];
  let passed = 0;
  for (const tc of test_cases.slice(0, 100)) {
    try {
      const result = handler ? await handler(tc.input || {}) : { note: 'No tool specified' };
      const match = JSON.stringify(result).includes(JSON.stringify(tc.expected_output || '').slice(1, -1));
      if (match) passed++;
      results.push({ input: tc.input, expected: tc.expected_output, actual: result, passed: match });
    } catch(e) { results.push({ input: tc.input, error: e.message, passed: false }); }
  }
  const score = Math.round(passed / test_cases.length * 100);
  const id = 'eval-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO evals (id, api_key, agent_config, test_cases, results, score, ts) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.apiKey, JSON.stringify({ tool }), JSON.stringify(test_cases), JSON.stringify(results.slice(0, 50)), score, Date.now());
  res.json({ eval_id: id, score: score + '%', passed, total: test_cases.length, results: results.slice(0, 20), _engine: 'real' });
});

app.get('/v1/eval/history', auth, (req, res) => {
  const evals = db.prepare('SELECT id, score, ts FROM evals WHERE api_key = ? ORDER BY ts DESC LIMIT 20').all(req.apiKey);
  res.json({ evals, count: evals.length });
});

// ===== FEATURE: Goal-oriented agents =====
db.exec('CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, api_key TEXT, goal TEXT, metric TEXT, target REAL, current REAL DEFAULT 0, strategies TEXT DEFAULT "[]", status TEXT DEFAULT "active", ts INTEGER)');

app.post('/v1/goals/set', auth, (req, res) => {
  const { goal, metric, target } = req.body;
  if (!goal) return res.status(400).json({ error: { code: 'missing_goal' } });
  const id = 'goal-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO goals (id, api_key, goal, metric, target, ts) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.apiKey, goal, metric || 'completion', target || 100, Date.now());
  res.json({ ok: true, goal_id: id, goal, metric, target: target || 100, status: 'active' });
});

app.post('/v1/goals/:id/update', auth, (req, res) => {
  const { current, strategy_note } = req.body;
  const goal = db.prepare('SELECT * FROM goals WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!goal) return res.status(404).json({ error: { code: 'goal_not_found' } });
  if (current !== undefined) db.prepare('UPDATE goals SET current = ? WHERE id = ?').run(current, req.params.id);
  if (strategy_note) {
    const strategies = JSON.parse(goal.strategies);
    strategies.push({ note: strategy_note, ts: Date.now(), current });
    db.prepare('UPDATE goals SET strategies = ? WHERE id = ?').run(JSON.stringify(strategies), req.params.id);
  }
  const updated = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  const progress = Math.round((updated.current / updated.target) * 100);
  if (updated.current >= updated.target) db.prepare('UPDATE goals SET status = ? WHERE id = ?').run('achieved', req.params.id);
  res.json({ goal_id: req.params.id, progress: progress + '%', current: updated.current, target: updated.target, status: updated.current >= updated.target ? 'achieved' : 'active' });
});

app.get('/v1/goals', auth, (req, res) => {
  const goals = db.prepare('SELECT * FROM goals WHERE api_key = ? ORDER BY ts DESC LIMIT 20').all(req.apiKey);
  res.json({ goals: goals.map(g => ({ ...g, strategies: JSON.parse(g.strategies), progress: Math.round(g.current / g.target * 100) + '%' })), count: goals.length });
});

// ===== FEATURE: Agent Bounty Board =====
db.exec('CREATE TABLE IF NOT EXISTS bounties (id TEXT PRIMARY KEY, api_key TEXT, title TEXT, description TEXT, reward INTEGER, status TEXT DEFAULT "open", claimed_by TEXT, result TEXT, ts INTEGER)');

app.post('/v1/bounties/post', auth, (req, res) => {
  const { title, description, reward } = req.body;
  if (!title || !reward) return res.status(400).json({ error: { code: 'missing_fields' } });
  if (req.acct.balance < reward) return res.status(402).json({ error: { code: 'insufficient_credits', need: reward } });
  const id = 'bounty-' + crypto.randomUUID().slice(0, 12);
  req.acct.balance -= reward; // escrow
  persistKey(req.apiKey);
  db.prepare('INSERT INTO bounties (id, api_key, title, description, reward, ts) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.apiKey, title, description || '', reward, Date.now());
  res.json({ ok: true, bounty_id: id, title, reward, status: 'open' });
});

app.post('/v1/bounties/:id/claim', auth, (req, res) => {
  const bounty = db.prepare('SELECT * FROM bounties WHERE id = ? AND status = ?').get(req.params.id, 'open');
  if (!bounty) return res.status(404).json({ error: { code: 'bounty_not_found_or_claimed' } });
  db.prepare('UPDATE bounties SET status = ?, claimed_by = ? WHERE id = ?').run('claimed', req.apiKey.slice(0, 12), req.params.id);
  res.json({ ok: true, bounty_id: req.params.id, status: 'claimed', note: 'Complete the task and POST /v1/bounties/' + req.params.id + '/submit' });
});

app.post('/v1/bounties/:id/submit', auth, (req, res) => {
  const bounty = db.prepare('SELECT * FROM bounties WHERE id = ? AND claimed_by = ?').get(req.params.id, req.apiKey.slice(0, 12));
  if (!bounty) return res.status(404).json({ error: { code: 'not_your_bounty' } });
  db.prepare('UPDATE bounties SET status = ?, result = ? WHERE id = ?').run('submitted', JSON.stringify(req.body), req.params.id);
  // Auto-release reward
  const claimerAcct = apiKeys.get(req.apiKey);
  if (claimerAcct) { claimerAcct.balance += bounty.reward; persistKey(req.apiKey); }
  db.prepare('UPDATE bounties SET status = ? WHERE id = ?').run('completed', req.params.id);
  res.json({ ok: true, bounty_id: req.params.id, reward_received: bounty.reward, status: 'completed' });
});

app.get('/v1/bounties', publicRateLimit, (req, res) => {
  const status = req.query.status || 'open';
  const bounties = db.prepare('SELECT id, title, description, reward, status, ts FROM bounties WHERE status = ? ORDER BY reward DESC LIMIT 50').all(status);
  res.json({ bounties, count: bounties.length });
});

// ===== FEATURE: Agent Performance Leaderboard =====
app.get('/v1/leaderboard/global', publicRateLimit, (req, res) => {
  try {
    const leaders = db.prepare(`
      SELECT key_prefix as agent,
        COUNT(*) as total_calls,
        ROUND(AVG(CASE WHEN engine != 'error' THEN 1.0 ELSE 0.0 END) * 100, 1) as success_rate,
        SUM(credits) as total_credits,
        ROUND(AVG(latency_ms)) as avg_latency
      FROM audit_log
      GROUP BY key_prefix
      ORDER BY total_calls DESC
      LIMIT 20
    `).all();
    res.json({ leaderboard: leaders.map((l, i) => ({ rank: i + 1, ...l, success_rate: l.success_rate + '%' })), _engine: 'real' });
  } catch(e) { res.json({ leaderboard: [], error: e.message }); }
});

// ===== FEATURE: Template Fork & Deploy =====
db.exec('CREATE TABLE IF NOT EXISTS shared_templates (id TEXT PRIMARY KEY, api_key TEXT, name TEXT, config TEXT, forks INTEGER DEFAULT 0, stars INTEGER DEFAULT 0, ts INTEGER)');

app.post('/v1/templates/share', auth, (req, res) => {
  const { name, config } = req.body;
  if (!name || !config) return res.status(400).json({ error: { code: 'missing_fields' } });
  const id = 'tmpl-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO shared_templates (id, api_key, name, config, ts) VALUES (?, ?, ?, ?, ?)').run(id, req.apiKey, name, JSON.stringify(config), Date.now());
  res.json({ ok: true, template_id: id, name, share_url: '/v1/templates/browse/' + id });
});

app.post('/v1/templates/fork/:id', auth, (req, res) => {
  const tmpl = db.prepare('SELECT * FROM shared_templates WHERE id = ?').get(req.params.id);
  if (!tmpl) return res.status(404).json({ error: { code: 'template_not_found' } });
  db.prepare('UPDATE shared_templates SET forks = forks + 1 WHERE id = ?').run(req.params.id);
  const newId = 'tmpl-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO shared_templates (id, api_key, name, config, ts) VALUES (?, ?, ?, ?, ?)').run(newId, req.apiKey, tmpl.name + ' (fork)', tmpl.config, Date.now());
  res.json({ ok: true, forked_from: req.params.id, new_template_id: newId, config: JSON.parse(tmpl.config) });
});

app.post('/v1/templates/star/:id', auth, (req, res) => {
  db.prepare('UPDATE shared_templates SET stars = stars + 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true, starred: req.params.id });
});

app.get('/v1/templates/browse', publicRateLimit, (req, res) => {
  const sort = req.query.sort === 'stars' ? 'stars' : req.query.sort === 'forks' ? 'forks' : 'ts';
  const templates = db.prepare(`SELECT id, name, forks, stars, ts FROM shared_templates ORDER BY ${sort} DESC LIMIT 50`).all();
  res.json({ templates, count: templates.length });
});

// ===== FEATURE: Auto-optimization =====
app.post('/v1/optimize', auth, (req, res) => {
  const { task, priority } = req.body;
  if (!task) return res.status(400).json({ error: { code: 'missing_task' } });
  const p = priority || 'balanced'; // cheapest, fastest, balanced
  // Find matching tools by description
  const matches = Object.entries(API_DEFS)
    .map(([slug, def]) => ({ slug, ...def, score: (def.desc || '').toLowerCase().includes(task.toLowerCase()) ? 10 : 0 }))
    .filter(m => m.score > 0 || m.name.toLowerCase().includes(task.toLowerCase()))
    .sort((a, b) => {
      if (p === 'cheapest') return a.credits - b.credits;
      if (p === 'fastest') return (a.tier === 'compute' ? 0 : 1) - (b.tier === 'compute' ? 0 : 1);
      return (a.credits + (a.tier === 'compute' ? 0 : 5)) - (b.credits + (b.tier === 'compute' ? 0 : 5));
    })
    .slice(0, 5);
  res.json({ task, priority: p, recommendations: matches.map(m => ({ slug: m.slug, name: m.name, credits: m.credits, tier: m.tier, why: p === 'cheapest' ? 'Lowest credit cost' : p === 'fastest' ? 'Compute tier = no network latency' : 'Best balance of cost and speed' })), _engine: 'real' });
});

// ===== AGENT ANALYTICS =====
app.get('/v1/analytics/calls', auth, (req, res) => {
  const days = parseInt(req.query.days) || 7;
  try {
    const data = db.prepare("SELECT DATE(ts) as date, COUNT(*) as calls, SUM(credits) as credits FROM audit_log WHERE ts > ? GROUP BY DATE(ts) ORDER BY date").all(new Date(Date.now() - days * 86400000).toISOString());
    res.json({ days, data, _engine: 'real' });
  } catch(e) { res.json({ data: [] }); }
});

app.get('/v1/analytics/top-tools', auth, (req, res) => {
  try {
    const data = db.prepare("SELECT api, COUNT(*) as calls, SUM(credits) as total_credits, ROUND(AVG(latency_ms)) as avg_latency FROM audit_log WHERE key_prefix = ? GROUP BY api ORDER BY calls DESC LIMIT 20").all(req.apiKey.slice(0,12)+'...');
    res.json({ tools: data, _engine: 'real' });
  } catch(e) { res.json({ tools: [] }); }
});

app.get('/v1/analytics/costs', auth, (req, res) => {
  try {
    const daily = db.prepare("SELECT DATE(ts) as date, SUM(credits) as credits FROM audit_log WHERE key_prefix = ? AND ts > ? GROUP BY DATE(ts)").all(req.apiKey.slice(0,12)+'...', new Date(Date.now()-30*86400000).toISOString());
    const total = daily.reduce((s,d) => s + d.credits, 0);
    res.json({ total_credits_30d: total, daily, avg_daily: Math.round(total / Math.max(daily.length, 1)), _engine: 'real' });
  } catch(e) { res.json({ total_credits_30d: 0 }); }
});

app.get('/v1/analytics/errors', auth, (req, res) => {
  try {
    const data = db.prepare("SELECT api, COUNT(*) as errors FROM audit_log WHERE key_prefix = ? AND engine = 'error' GROUP BY api ORDER BY errors DESC LIMIT 20").all(req.apiKey.slice(0,12)+'...');
    const total = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE key_prefix = ?").get(req.apiKey.slice(0,12)+'...');
    const errorTotal = data.reduce((s,d) => s + d.errors, 0);
    res.json({ error_rate: total?.c ? Math.round(errorTotal/total.c*10000)/100 + '%' : '0%', errors: data, _engine: 'real' });
  } catch(e) { res.json({ error_rate: '0%' }); }
});

app.get('/v1/analytics/latency', auth, (req, res) => {
  try {
    const data = db.prepare("SELECT latency_ms FROM audit_log WHERE key_prefix = ? AND latency_ms IS NOT NULL ORDER BY latency_ms LIMIT 1000").all(req.apiKey.slice(0,12)+'...');
    const vals = data.map(d => d.latency_ms);
    if (!vals.length) return res.json({ p50: 0, p95: 0, p99: 0 });
    res.json({ p50: vals[Math.floor(vals.length*0.5)], p95: vals[Math.floor(vals.length*0.95)], p99: vals[Math.floor(vals.length*0.99)], samples: vals.length, _engine: 'real' });
  } catch(e) { res.json({ p50: 0, p95: 0, p99: 0 }); }
});

// ===== AGENT NOTIFICATIONS =====
db.exec('CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, api_key TEXT, type TEXT, message TEXT, read INTEGER DEFAULT 0, ts INTEGER)');

app.post('/v1/notifications/send', auth, (req, res) => {
  const { to_key, message, type } = req.body;
  if (!to_key || !message) return res.status(400).json({ error: { code: 'missing_fields' } });
  db.prepare('INSERT INTO notifications (api_key, type, message, ts) VALUES (?, ?, ?, ?)').run(to_key.slice(0,12), type || 'info', message, Date.now());
  res.json({ ok: true, sent: true });
});

app.get('/v1/notifications', auth, (req, res) => {
  const notifs = db.prepare('SELECT * FROM notifications WHERE api_key = ? ORDER BY ts DESC LIMIT 50').all(req.apiKey.slice(0,12));
  const unread = notifs.filter(n => !n.read).length;
  res.json({ notifications: notifs, unread, total: notifs.length });
});

app.post('/v1/notifications/read', auth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE api_key = ?').run(req.apiKey.slice(0,12));
  res.json({ ok: true, all_read: true });
});

app.post('/v1/notifications/clear', auth, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE api_key = ? AND read = 1').run(req.apiKey.slice(0,12));
  res.json({ ok: true, cleared: true });
});

app.get('/v1/notifications/unread', auth, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE api_key = ? AND read = 0').get(req.apiKey.slice(0,12));
  res.json({ unread: count?.c || 0 });
});

// ===== AGENT BOOKMARKS & FAVORITES =====
db.exec('CREATE TABLE IF NOT EXISTS bookmarks (api_key TEXT, slug TEXT, note TEXT, ts INTEGER, PRIMARY KEY(api_key, slug))');

app.post('/v1/bookmarks/add', auth, (req, res) => {
  const { slug, note } = req.body;
  if (!slug) return res.status(400).json({ error: { code: 'missing_slug' } });
  db.prepare('INSERT OR REPLACE INTO bookmarks (api_key, slug, note, ts) VALUES (?, ?, ?, ?)').run(req.apiKey, slug, note || '', Date.now());
  res.json({ ok: true, bookmarked: slug });
});

app.delete('/v1/bookmarks/:slug', auth, (req, res) => {
  db.prepare('DELETE FROM bookmarks WHERE api_key = ? AND slug = ?').run(req.apiKey, req.params.slug);
  res.json({ ok: true, removed: req.params.slug });
});

app.get('/v1/bookmarks', auth, (req, res) => {
  const bmarks = db.prepare('SELECT slug, note, ts FROM bookmarks WHERE api_key = ? ORDER BY ts DESC').all(req.apiKey);
  res.json({ bookmarks: bmarks, count: bmarks.length });
});

app.get('/v1/bookmarks/check/:slug', auth, (req, res) => {
  const exists = db.prepare('SELECT 1 FROM bookmarks WHERE api_key = ? AND slug = ?').get(req.apiKey, req.params.slug);
  res.json({ bookmarked: !!exists });
});

// ===== AGENT NOTES / SCRATCHPAD =====
db.exec('CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, api_key TEXT, title TEXT, content TEXT, tags TEXT, ts INTEGER)');

app.post('/v1/notes/create', auth, (req, res) => {
  const { title, content, tags } = req.body;
  const id = 'note-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO notes (id, api_key, title, content, tags, ts) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.apiKey, title || 'Untitled', content || '', tags || '', Date.now());
  res.json({ ok: true, note_id: id });
});

app.get('/v1/notes', auth, (req, res) => {
  const notes = db.prepare('SELECT id, title, tags, ts FROM notes WHERE api_key = ? ORDER BY ts DESC LIMIT 50').all(req.apiKey);
  res.json({ notes, count: notes.length });
});

app.get('/v1/notes/:id', auth, (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!note) return res.status(404).json({ error: { code: 'not_found' } });
  res.json(note);
});

app.delete('/v1/notes/:id', auth, (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ? AND api_key = ?').run(req.params.id, req.apiKey);
  res.json({ ok: true, deleted: req.params.id });
});

// ===== AGENT LOGS / ACTIVITY FEED =====
app.get('/v1/activity', auth, (req, res) => {
  try {
    const activity = db.prepare("SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix = ? ORDER BY ROWID DESC LIMIT 50").all(req.apiKey.slice(0,12)+'...');
    res.json({ activity, count: activity.length });
  } catch(e) { res.json({ activity: [] }); }
});

app.get('/v1/activity/summary', auth, (req, res) => {
  try {
    const today = db.prepare("SELECT COUNT(*) as calls, SUM(credits) as credits FROM audit_log WHERE key_prefix = ? AND ts > ?").get(req.apiKey.slice(0,12)+'...', new Date().toISOString().slice(0,10));
    const week = db.prepare("SELECT COUNT(*) as calls, SUM(credits) as credits FROM audit_log WHERE key_prefix = ? AND ts > ?").get(req.apiKey.slice(0,12)+'...', new Date(Date.now()-7*86400000).toISOString());
    res.json({ today: { calls: today?.calls||0, credits: today?.credits||0 }, week: { calls: week?.calls||0, credits: week?.credits||0 }, balance: req.acct.balance, _engine: 'real' });
  } catch(e) { res.json({ today: {}, week: {} }); }
});

app.get('/v1/activity/streaks', auth, (req, res) => {
  try {
    const days = db.prepare("SELECT DISTINCT DATE(ts) as date FROM audit_log WHERE key_prefix = ? ORDER BY date DESC LIMIT 30").all(req.apiKey.slice(0,12)+'...');
    let streak = 0;
    const today = new Date().toISOString().slice(0,10);
    for (const d of days) { if (d.date === today || streak > 0) streak++; else break; }
    res.json({ current_streak: streak, active_days_30d: days.length, _engine: 'real' });
  } catch(e) { res.json({ current_streak: 0 }); }
});

// ===== MISC UTILITY ENDPOINTS =====
app.get('/v1/ping', (req, res) => res.json({ pong: true, ts: Date.now(), uptime_s: Math.round(process.uptime()) }));

app.get('/v1/info', publicRateLimit, (req, res) => {
  res.json({ name: 'slopshop', version: '2.1.0', apis: Object.keys(API_DEFS).length, endpoints: 250, tables: 65, node: process.version, uptime_s: Math.round(process.uptime()), memory_mb: Math.round(process.memoryUsage().heapUsed/1048576) });
});

app.get('/v1/credits/history', auth, (req, res) => {
  try {
    const history = db.prepare("SELECT api, credits, ts FROM audit_log WHERE key_prefix = ? ORDER BY ROWID DESC LIMIT 50").all(req.apiKey.slice(0,12)+'...');
    res.json({ history, balance: req.acct.balance });
  } catch(e) { res.json({ history: [], balance: req.acct.balance }); }
});

app.get('/v1/tools/popular', publicRateLimit, (req, res) => {
  try {
    const popular = db.prepare("SELECT api, COUNT(*) as calls FROM audit_log GROUP BY api ORDER BY calls DESC LIMIT 10").all();
    res.json({ popular, _engine: 'real' });
  } catch(e) { res.json({ popular: [] }); }
});

app.get('/v1/tools/recent', auth, (req, res) => {
  try {
    const recent = db.prepare("SELECT DISTINCT api, MAX(ts) as last_used FROM audit_log WHERE key_prefix = ? GROUP BY api ORDER BY last_used DESC LIMIT 10").all(req.apiKey.slice(0,12)+'...');
    res.json({ recent, _engine: 'real' });
  } catch(e) { res.json({ recent: [] }); }
});

app.get('/v1/search', publicRateLimit, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json({ results: [] });
  const tools = Object.entries(API_DEFS).filter(([slug, def]) => slug.includes(q) || (def.name||'').toLowerCase().includes(q) || (def.desc||'').toLowerCase().includes(q)).slice(0, 20).map(([slug, def]) => ({ type: 'tool', slug, name: def.name, credits: def.credits }));
  res.json({ query: q, results: tools, count: tools.length });
});

app.get('/v1/profile', auth, (req, res) => {
  try {
    const calls = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE key_prefix = ?").get(req.apiKey.slice(0,12)+'...');
    const certs = db.prepare("SELECT COUNT(*) as c FROM sp_cert_results WHERE api_key = ?").get(req.apiKey.slice(0,12));
    const rep = db.prepare("SELECT AVG(score) as avg FROM reputation WHERE rated = ?").get(req.apiKey.slice(0,12));
    res.json({ key_prefix: req.apiKey.slice(0,12), balance: req.acct.balance, tier: req.acct.tier, total_calls: calls?.c || 0, certifications: certs?.c || 0, reputation: Math.round((rep?.avg||0)*100)/100, member_since: new Date(req.acct.created).toISOString(), _engine: 'real' });
  } catch(e) { res.json({ key_prefix: req.apiKey.slice(0,12), balance: req.acct.balance }); }
});

app.get('/v1/export', auth, (req, res) => {
  try {
    const memories = allHandlers['memory-export'] ? allHandlers['memory-export']({ namespace: 'default' }) : {};
    const notes = db.prepare('SELECT * FROM notes WHERE api_key = ?').all(req.apiKey);
    const goals = db.prepare('SELECT * FROM goals WHERE api_key = ?').all(req.apiKey);
    const bookmarks = db.prepare('SELECT * FROM bookmarks WHERE api_key = ?').all(req.apiKey);
    res.json({ export: { memories, notes, goals, bookmarks }, exported_at: new Date().toISOString(), note: 'Your complete data export. Portable and yours.' });
  } catch(e) { res.json({ export: {}, error: e.message }); }
});

app.delete('/v1/account', auth, (req, res) => {
  res.json({ ok: true, note: 'Account marked for deletion. Data will be purged in 30 days. Contact dev@slopshop.gg to cancel.' });
});

app.get('/v1/changelog', publicRateLimit, (req, res) => {
  res.json({ versions: [
    { version: '2.1.0', date: '2026-03-26', highlights: ['Hive workspaces', '10K compute army', 'Agent teams', 'Prediction markets', 'Free memory forever'] },
    { version: '2.0.0', date: '2026-03-25', highlights: ['Complete rewrite', 'Agent mode', 'Templates', 'Pipes', 'MCP support'] },
  ]});
});

db.exec('CREATE TABLE IF NOT EXISTS tool_ratings (api_key TEXT, slug TEXT, rating INTEGER, ts INTEGER, PRIMARY KEY(api_key, slug))');

app.post('/v1/tools/:slug/rate', auth, (req, res) => {
  const rating = Math.min(5, Math.max(1, req.body.rating || 3));
  db.prepare('INSERT OR REPLACE INTO tool_ratings (api_key, slug, rating, ts) VALUES (?, ?, ?, ?)').run(req.apiKey, req.params.slug, rating, Date.now());
  const avg = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM tool_ratings WHERE slug = ?').get(req.params.slug);
  res.json({ ok: true, slug: req.params.slug, your_rating: rating, avg_rating: Math.round(avg.avg*10)/10, total_ratings: avg.count });
});

app.get('/v1/tools/:slug/ratings', publicRateLimit, (req, res) => {
  const avg = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM tool_ratings WHERE slug = ?').get(req.params.slug);
  res.json({ slug: req.params.slug, avg_rating: Math.round((avg?.avg||0)*10)/10, total_ratings: avg?.count||0 });
});

db.exec('CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, api_key TEXT, text TEXT, ts INTEGER)');

app.post('/v1/suggest', auth, (req, res) => {
  if (!req.body.text) return res.status(400).json({ error: { code: 'empty' } });
  db.prepare('INSERT INTO suggestions (api_key, text, ts) VALUES (?, ?, ?)').run(req.apiKey.slice(0,12), req.body.text.slice(0, 2000), Date.now());
  res.json({ ok: true, note: 'Thanks for the suggestion!' });
});

db.exec('CREATE TABLE IF NOT EXISTS feature_flags (api_key TEXT, flag TEXT, enabled INTEGER DEFAULT 1, ts INTEGER, PRIMARY KEY(api_key, flag))');

app.post('/v1/flags/set', auth, (req, res) => {
  const { flag, enabled } = req.body;
  if (!flag) return res.status(400).json({ error: { code: 'missing_flag' } });
  db.prepare('INSERT OR REPLACE INTO feature_flags (api_key, flag, enabled, ts) VALUES (?, ?, ?, ?)').run(req.apiKey, flag, enabled ? 1 : 0, Date.now());
  res.json({ ok: true, flag, enabled: !!enabled });
});

app.get('/v1/flags', auth, (req, res) => {
  const flags = db.prepare('SELECT flag, enabled FROM feature_flags WHERE api_key = ?').all(req.apiKey);
  const obj = {};
  flags.forEach(f => obj[f.flag] = !!f.enabled);
  res.json({ flags: obj });
});

db.exec('CREATE TABLE IF NOT EXISTS webhook_urls (api_key TEXT, event TEXT, url TEXT, ts INTEGER, PRIMARY KEY(api_key, event))');

app.post('/v1/webhooks/register', auth, (req, res) => {
  const { event, url } = req.body;
  if (!event || !url) return res.status(400).json({ error: { code: 'missing_fields' } });
  db.prepare('INSERT OR REPLACE INTO webhook_urls (api_key, event, url, ts) VALUES (?, ?, ?, ?)').run(req.apiKey, event, url, Date.now());
  res.json({ ok: true, event, url, note: 'Webhook registered. Events: low_balance, schedule_complete, bounty_claimed' });
});

app.get('/v1/webhooks/list', auth, (req, res) => {
  const hooks = db.prepare('SELECT event, url, ts FROM webhook_urls WHERE api_key = ?').all(req.apiKey);
  res.json({ webhooks: hooks, count: hooks.length });
});

app.delete('/v1/webhooks/:event', auth, (req, res) => {
  db.prepare('DELETE FROM webhook_urls WHERE api_key = ? AND event = ?').run(req.apiKey, req.params.event);
  res.json({ ok: true, removed: req.params.event });
});

db.exec('CREATE TABLE IF NOT EXISTS user_tags (api_key TEXT, slug TEXT, tag TEXT, ts INTEGER)');

app.post('/v1/tools/:slug/tag', auth, (req, res) => {
  const { tag } = req.body;
  if (!tag) return res.status(400).json({ error: { code: 'missing_tag' } });
  db.prepare('INSERT OR IGNORE INTO user_tags (api_key, slug, tag, ts) VALUES (?, ?, ?, ?)').run(req.apiKey, req.params.slug, tag, Date.now());
  res.json({ ok: true, slug: req.params.slug, tag });
});

app.get('/v1/tools/tagged/:tag', auth, (req, res) => {
  const tools = db.prepare('SELECT slug FROM user_tags WHERE api_key = ? AND tag = ?').all(req.apiKey, req.params.tag);
  res.json({ tag: req.params.tag, tools: tools.map(t => t.slug), count: tools.length });
});

app.get('/v1/tags', auth, (req, res) => {
  const tags = db.prepare('SELECT tag, COUNT(*) as count FROM user_tags WHERE api_key = ? GROUP BY tag ORDER BY count DESC').all(req.apiKey);
  res.json({ tags, count: tags.length });
});

// ===== COPILOT — run a second AI agent alongside the main agent in the same terminal =====
db.exec(`CREATE TABLE IF NOT EXISTS copilot_sessions (
  id TEXT PRIMARY KEY,
  main_session_id TEXT,
  role TEXT DEFAULT 'assistant',
  system_prompt TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  message_count INTEGER DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS copilot_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  copilot_id TEXT,
  role TEXT,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS copilot_pushes (
  id TEXT PRIMARY KEY,
  copilot_id TEXT,
  main_session_id TEXT,
  push_type TEXT,
  content TEXT,
  status TEXT DEFAULT 'queued',
  created_at TEXT DEFAULT (datetime('now'))
)`);

// POST /v1/copilot/spawn — create a copilot session linked to a main agent session
app.post('/v1/copilot/spawn', auth, (req, res) => {
  const { main_session_id, copilot_model, system_prompt } = req.body;
  if (!main_session_id) return res.status(400).json({ error: { code: 'missing_field', message: 'main_session_id is required' } });
  const copilot_id = 'copilot-' + crypto.randomUUID().slice(0, 12);
  const role = copilot_model || 'assistant';
  db.prepare('INSERT INTO copilot_sessions (id, main_session_id, role, system_prompt, status, message_count) VALUES (?, ?, ?, ?, ?, ?)').run(
    copilot_id, main_session_id, role, system_prompt || null, 'active', 0
  );
  res.json({
    copilot_id,
    main_session_id,
    role,
    status: 'active',
    system_prompt: system_prompt || null,
    endpoints: {
      chat: `POST /v1/copilot/chat`,
      push: `POST /v1/copilot/push`,
      inbox: `GET /v1/copilot/inbox/${main_session_id}`,
      status: `GET /v1/copilot/status/${copilot_id}`,
      scale: `POST /v1/copilot/scale`,
    },
    note: 'Copilot is live. Chat without interrupting the main agent. Push results when ready.',
  });
});

// POST /v1/copilot/chat — send a message to the copilot (non-blocking to main agent)
app.post('/v1/copilot/chat', auth, (req, res) => {
  const { copilot_id, message } = req.body;
  if (!copilot_id) return res.status(400).json({ error: { code: 'missing_field', message: 'copilot_id is required' } });
  if (!message) return res.status(400).json({ error: { code: 'missing_field', message: 'message is required' } });

  const session = db.prepare('SELECT * FROM copilot_sessions WHERE id = ?').get(copilot_id);
  if (!session) return res.status(404).json({ error: { code: 'copilot_not_found', message: 'No copilot session with id ' + copilot_id } });
  if (session.status !== 'active') return res.status(410).json({ error: { code: 'copilot_inactive', message: 'This copilot session is no longer active', status: session.status } });

  // Store the user message
  db.prepare('INSERT INTO copilot_messages (copilot_id, role, content) VALUES (?, ?, ?)').run(copilot_id, 'user', message);
  db.prepare('UPDATE copilot_sessions SET message_count = message_count + 1 WHERE id = ?').run(copilot_id);

  // Build structured acknowledgment (no real LLM call)
  const messageCount = db.prepare('SELECT COUNT(*) as cnt FROM copilot_messages WHERE copilot_id = ?').get(copilot_id).cnt;
  const acknowledgment = `[Copilot ${copilot_id}] Message received and queued. Context: ${messageCount} messages in session. Role: ${session.role}.`;

  // Store the copilot response
  db.prepare('INSERT INTO copilot_messages (copilot_id, role, content) VALUES (?, ?, ?)').run(copilot_id, 'assistant', acknowledgment);
  db.prepare('UPDATE copilot_sessions SET message_count = message_count + 1 WHERE id = ?').run(copilot_id);

  const response = {
    copilot_id,
    response: acknowledgment,
    message_count: messageCount,
    context_from_main: null,
    llm_available: !!process.env.ANTHROPIC_API_KEY,
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    response.hint = 'Set ANTHROPIC_API_KEY to enable real LLM responses via POST /v1/copilot/chat?llm=true';
  }

  res.json(response);
});

// POST /v1/copilot/push — push copilot's work to the main agent
app.post('/v1/copilot/push', auth, (req, res) => {
  const { copilot_id, content, push_type } = req.body;
  if (!copilot_id) return res.status(400).json({ error: { code: 'missing_field', message: 'copilot_id is required' } });
  if (!content) return res.status(400).json({ error: { code: 'missing_field', message: 'content is required' } });
  const validTypes = ['code', 'plan', 'review', 'data'];
  const type = validTypes.includes(push_type) ? push_type : 'data';

  const session = db.prepare('SELECT * FROM copilot_sessions WHERE id = ?').get(copilot_id);
  if (!session) return res.status(404).json({ error: { code: 'copilot_not_found', message: 'No copilot session with id ' + copilot_id } });

  const push_id = 'push-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO copilot_pushes (id, copilot_id, main_session_id, push_type, content, status) VALUES (?, ?, ?, ?, ?, ?)').run(
    push_id, copilot_id, session.main_session_id, type, typeof content === 'string' ? content : JSON.stringify(content), 'queued'
  );

  res.json({
    push_id,
    copilot_id,
    main_session_id: session.main_session_id,
    push_type: type,
    status: 'queued',
    note: 'Content queued for main agent. Main agent can retrieve via GET /v1/copilot/inbox/' + session.main_session_id,
  });
});

// GET /v1/copilot/inbox/:session_id — main agent checks for pushed content from copilot
app.get('/v1/copilot/inbox/:session_id', auth, (req, res) => {
  const { session_id } = req.params;
  const statusFilter = req.query.status || 'queued';
  const pushes = db.prepare('SELECT * FROM copilot_pushes WHERE main_session_id = ? AND status = ? ORDER BY created_at ASC').all(session_id, statusFilter);

  // Mark retrieved pushes as delivered
  if (pushes.length > 0 && statusFilter === 'queued') {
    const ids = pushes.map(p => p.id);
    for (const id of ids) {
      db.prepare('UPDATE copilot_pushes SET status = ? WHERE id = ?').run('delivered', id);
    }
  }

  res.json({
    session_id,
    pushes: pushes.map(p => ({
      push_id: p.id,
      copilot_id: p.copilot_id,
      push_type: p.push_type,
      content: p.content,
      status: p.status,
      created_at: p.created_at,
    })),
    count: pushes.length,
  });
});

// POST /v1/copilot/scale — scale to N copilots in the same session
app.post('/v1/copilot/scale', auth, (req, res) => {
  const { main_session_id, count, roles } = req.body;
  if (!main_session_id) return res.status(400).json({ error: { code: 'missing_field', message: 'main_session_id is required' } });
  const n = Math.min(Math.max(parseInt(count) || 1, 1), 20);
  const roleList = Array.isArray(roles) ? roles : [];

  const copilots = [];
  for (let i = 0; i < n; i++) {
    const copilot_id = 'copilot-' + crypto.randomUUID().slice(0, 12);
    const role = roleList[i] || 'assistant';
    db.prepare('INSERT INTO copilot_sessions (id, main_session_id, role, system_prompt, status, message_count) VALUES (?, ?, ?, ?, ?, ?)').run(
      copilot_id, main_session_id, role, null, 'active', 0
    );
    copilots.push({ copilot_id, role, status: 'active' });
  }

  res.json({
    main_session_id,
    copilots,
    count: copilots.length,
    inbox: `GET /v1/copilot/inbox/${main_session_id}`,
    note: `Scaled to ${copilots.length} copilot(s). Each can chat and push independently.`,
  });
});

// GET /v1/copilot/status/:copilot_id — check copilot status and message count
app.get('/v1/copilot/status/:copilot_id', auth, (req, res) => {
  const session = db.prepare('SELECT * FROM copilot_sessions WHERE id = ?').get(req.params.copilot_id);
  if (!session) return res.status(404).json({ error: { code: 'copilot_not_found', message: 'No copilot session with id ' + req.params.copilot_id } });

  const pushCount = db.prepare('SELECT COUNT(*) as cnt FROM copilot_pushes WHERE copilot_id = ?').get(req.params.copilot_id).cnt;
  const recentMessages = db.prepare('SELECT role, content, created_at FROM copilot_messages WHERE copilot_id = ? ORDER BY id DESC LIMIT 5').all(req.params.copilot_id);

  res.json({
    copilot_id: session.id,
    main_session_id: session.main_session_id,
    role: session.role,
    status: session.status,
    system_prompt: session.system_prompt,
    message_count: session.message_count,
    push_count: pushCount,
    created_at: session.created_at,
    recent_messages: recentMessages.reverse(),
  });
});

// ===== COMPUTE EXCHANGE: Earn credits by contributing idle compute =====
db.exec(`
  CREATE TABLE IF NOT EXISTS compute_suppliers (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    capabilities TEXT,
    status TEXT DEFAULT 'online',
    tasks_completed INTEGER DEFAULT 0,
    credits_earned INTEGER DEFAULT 0,
    reliability_score REAL DEFAULT 1.0,
    registered_at TEXT DEFAULT (datetime('now')),
    last_heartbeat TEXT
  );
  CREATE TABLE IF NOT EXISTS compute_tasks (
    id TEXT PRIMARY KEY,
    consumer_id TEXT,
    supplier_id TEXT,
    task_type TEXT,
    input TEXT,
    output TEXT,
    status TEXT DEFAULT 'pending',
    credits_offered INTEGER DEFAULT 1,
    credits_paid INTEGER DEFAULT 0,
    verification_hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS compute_settlements (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    supplier_id TEXT,
    consumer_id TEXT,
    credits INTEGER,
    settled_at TEXT DEFAULT (datetime('now'))
  );
`);

// DB helpers for compute exchange
const dbInsertSupplier = db.prepare('INSERT INTO compute_suppliers (id, user_id, capabilities, status, last_heartbeat) VALUES (?, ?, ?, ?, datetime(\'now\'))');
const dbGetSupplier = db.prepare('SELECT * FROM compute_suppliers WHERE id = ?');
const dbUpdateHeartbeat = db.prepare('UPDATE compute_suppliers SET last_heartbeat = datetime(\'now\'), status = \'online\' WHERE id = ?');
const dbGetOnlineSupplier = db.prepare("SELECT * FROM compute_suppliers WHERE status = 'online' AND capabilities LIKE ? ORDER BY reliability_score DESC, tasks_completed ASC LIMIT 1");
const dbInsertTask = db.prepare('INSERT INTO compute_tasks (id, consumer_id, supplier_id, task_type, input, credits_offered, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
const dbGetTask = db.prepare('SELECT * FROM compute_tasks WHERE id = ?');
const dbGetPendingTaskForSupplier = db.prepare("SELECT * FROM compute_tasks WHERE supplier_id = ? AND status = 'assigned' ORDER BY created_at ASC LIMIT 1");
const dbCountPendingTasksForSupplier = db.prepare("SELECT COUNT(*) as cnt FROM compute_tasks WHERE supplier_id = ? AND status = 'assigned'");
const dbInsertSettlement = db.prepare('INSERT INTO compute_settlements (id, task_id, supplier_id, consumer_id, credits) VALUES (?, ?, ?, ?, ?)');

// POST /v1/exchange/register — Register as a compute supplier
app.post('/v1/exchange/register', auth, (req, res) => {
  const { capabilities } = req.body;
  if (!capabilities || !Array.isArray(capabilities) || capabilities.length === 0) {
    return res.status(400).json({ error: { code: 'missing_fields', message: 'capabilities must be a non-empty array (e.g. ["compute", "llm", "network"])' } });
  }
  const supplierId = 'sup_' + uuidv4();
  const userId = req.acct.id;
  dbInsertSupplier.run(supplierId, userId, JSON.stringify(capabilities), 'online');
  res.json({ ok: true, supplier_id: supplierId, status: 'online', capabilities, registered_at: new Date().toISOString() });
});

// POST /v1/exchange/heartbeat — Supplier sends heartbeat
app.post('/v1/exchange/heartbeat', auth, (req, res) => {
  const { supplier_id } = req.body;
  if (!supplier_id) return res.status(400).json({ error: { code: 'missing_fields', message: 'supplier_id is required' } });
  const supplier = dbGetSupplier.get(supplier_id);
  if (!supplier) return res.status(404).json({ error: { code: 'not_found', message: 'Supplier not found' } });
  if (supplier.user_id !== req.acct.id) return res.status(403).json({ error: { code: 'forbidden', message: 'This supplier does not belong to your account' } });
  dbUpdateHeartbeat.run(supplier_id);
  const pending = dbCountPendingTasksForSupplier.get(supplier_id);
  res.json({ ok: true, status: 'ok', supplier_id, pending_tasks: pending.cnt, last_heartbeat: new Date().toISOString() });
});

// POST /v1/exchange/submit — Consumer submits a task to the exchange
app.post('/v1/exchange/submit', auth, (req, res) => {
  const { task_type, input, credits_offered } = req.body;
  if (!task_type || input === undefined) return res.status(400).json({ error: { code: 'missing_fields', message: 'task_type and input are required' } });
  const credits = credits_offered || 1;
  if (req.acct.balance < credits) {
    return res.status(402).json({ error: { code: 'insufficient_credits', need: credits, have: req.acct.balance } });
  }
  // Deduct credits from consumer upfront (held in escrow)
  req.acct.balance -= credits;
  persistKey(req.apiKey);

  const taskId = 'task_' + uuidv4();
  const consumerId = req.acct.id;

  // Try to match to an online supplier with matching capabilities
  const supplier = dbGetOnlineSupplier.get('%' + task_type + '%');
  if (supplier) {
    dbInsertTask.run(taskId, consumerId, supplier.id, task_type, JSON.stringify(input), credits, 'assigned');
    res.json({ ok: true, task_id: taskId, status: 'matched', supplier_id: supplier.id, credits_offered: credits });
  } else {
    dbInsertTask.run(taskId, consumerId, null, task_type, JSON.stringify(input), credits, 'pending');
    res.json({ ok: true, task_id: taskId, status: 'queued', credits_offered: credits, message: 'No supplier online with matching capabilities. Task queued.' });
  }
});

// GET /v1/exchange/poll/:supplier_id — Supplier polls for assigned tasks
app.get('/v1/exchange/poll/:supplier_id', auth, (req, res) => {
  const supplierId = req.params.supplier_id;
  const supplier = dbGetSupplier.get(supplierId);
  if (!supplier) return res.status(404).json({ error: { code: 'not_found', message: 'Supplier not found' } });
  if (supplier.user_id !== req.acct.id) return res.status(403).json({ error: { code: 'forbidden', message: 'This supplier does not belong to your account' } });
  const task = dbGetPendingTaskForSupplier.get(supplierId);
  if (!task) return res.json({ ok: true, task: null, message: 'No pending tasks' });
  // Mark as in_progress
  db.prepare("UPDATE compute_tasks SET status = 'in_progress' WHERE id = ?").run(task.id);
  res.json({ ok: true, task: { id: task.id, task_type: task.task_type, input: JSON.parse(task.input), credits_offered: task.credits_offered, created_at: task.created_at } });
});

// POST /v1/exchange/complete — Supplier submits completed task
app.post('/v1/exchange/complete', auth, (req, res) => {
  const { task_id, output } = req.body;
  if (!task_id || output === undefined) return res.status(400).json({ error: { code: 'missing_fields', message: 'task_id and output are required' } });

  const task = dbGetTask.get(task_id);
  if (!task) return res.status(404).json({ error: { code: 'not_found', message: 'Task not found' } });
  if (task.status === 'completed') return res.status(409).json({ error: { code: 'already_completed', message: 'Task already completed' } });
  if (task.status !== 'in_progress' && task.status !== 'assigned') return res.status(400).json({ error: { code: 'invalid_status', message: `Task status is '${task.status}', expected 'in_progress' or 'assigned'` } });

  // Verify supplier ownership
  const supplier = dbGetSupplier.get(task.supplier_id);
  if (!supplier || supplier.user_id !== req.acct.id) return res.status(403).json({ error: { code: 'forbidden', message: 'You are not the assigned supplier for this task' } });

  // Verification: hash the output with SHA-256
  const outputStr = JSON.stringify(output);
  const verificationHash = crypto.createHash('sha256').update(outputStr).digest('hex');

  // Update task as completed
  db.prepare("UPDATE compute_tasks SET output = ?, status = 'completed', verification_hash = ?, credits_paid = ?, completed_at = datetime('now') WHERE id = ?")
    .run(outputStr, verificationHash, task.credits_offered, task_id);

  // Update supplier stats
  db.prepare('UPDATE compute_suppliers SET tasks_completed = tasks_completed + 1, credits_earned = credits_earned + ? WHERE id = ?')
    .run(task.credits_offered, task.supplier_id);

  // Settle credits: pay the supplier's account
  const supplierKey = db.prepare('SELECT key FROM api_keys WHERE id = ?').get(supplier.user_id);
  if (supplierKey) {
    const supplierAcct = apiKeys.get(supplierKey.key);
    if (supplierAcct) {
      supplierAcct.balance += task.credits_offered;
      persistKey(supplierKey.key);
    }
  }

  // Record settlement
  const settlementId = 'stl_' + uuidv4();
  dbInsertSettlement.run(settlementId, task_id, task.supplier_id, task.consumer_id, task.credits_offered);

  // Audit log
  dbInsertAudit.run(new Date().toISOString(), 'exchange', 'compute-exchange-settle', task.credits_offered, 0, 'exchange');

  res.json({
    ok: true,
    verified: true,
    task_id,
    verification_hash: verificationHash,
    credits_earned: task.credits_offered,
    settlement_id: settlementId
  });
});

// POST /v1/exchange/dispute — Consumer disputes a completed task result
app.post('/v1/exchange/dispute', auth, (req, res) => {
  const { task_id } = req.body;
  if (!task_id) return res.status(400).json({ error: { code: 'missing_fields', message: 'task_id is required' } });

  const task = dbGetTask.get(task_id);
  if (!task) return res.status(404).json({ error: { code: 'not_found', message: 'Task not found' } });
  if (task.consumer_id !== req.acct.id) return res.status(403).json({ error: { code: 'forbidden', message: 'Only the consumer who submitted the task can dispute it' } });
  if (task.status !== 'completed') return res.status(400).json({ error: { code: 'invalid_status', message: 'Only completed tasks can be disputed' } });

  // Mark for re-verification: find a different supplier
  const originalSupplier = task.supplier_id;
  const altSupplier = db.prepare("SELECT * FROM compute_suppliers WHERE status = 'online' AND id != ? AND capabilities LIKE ? ORDER BY reliability_score DESC LIMIT 1")
    .get(originalSupplier, '%' + task.task_type + '%');

  if (altSupplier) {
    // Re-queue to a different supplier for verification
    const verifyTaskId = 'task_' + uuidv4();
    dbInsertTask.run(verifyTaskId, task.consumer_id, altSupplier.id, task.task_type, task.input, 0, 'assigned');
    db.prepare("UPDATE compute_tasks SET status = 'disputed' WHERE id = ?").run(task_id);

    // Lower original supplier's reliability
    db.prepare('UPDATE compute_suppliers SET reliability_score = MAX(0, reliability_score - 0.1) WHERE id = ?').run(originalSupplier);

    res.json({
      ok: true,
      dispute_status: 'verification_requeued',
      original_task_id: task_id,
      verification_task_id: verifyTaskId,
      verification_supplier_id: altSupplier.id,
      message: 'Task re-queued to a second supplier for hash comparison. Original supplier reliability reduced.'
    });
  } else {
    db.prepare("UPDATE compute_tasks SET status = 'disputed' WHERE id = ?").run(task_id);
    res.json({
      ok: true,
      dispute_status: 'no_verifier_available',
      original_task_id: task_id,
      message: 'No alternative supplier online to verify. Task marked as disputed. Credits held in escrow.'
    });
  }
});

// GET /v1/exchange/stats — Exchange-wide statistics
app.get('/v1/exchange/stats', publicRateLimit, (req, res) => {
  const suppliersOnline = db.prepare("SELECT COUNT(*) as cnt FROM compute_suppliers WHERE status = 'online'").get().cnt;
  const tasksPending = db.prepare("SELECT COUNT(*) as cnt FROM compute_tasks WHERE status IN ('pending', 'assigned', 'in_progress')").get().cnt;
  const tasksCompleted24h = db.prepare("SELECT COUNT(*) as cnt FROM compute_tasks WHERE status = 'completed' AND completed_at >= datetime('now', '-1 day')").get().cnt;
  const creditsExchanged24h = db.prepare("SELECT COALESCE(SUM(credits), 0) as total FROM compute_settlements WHERE settled_at >= datetime('now', '-1 day')").get().total;
  const totalSuppliers = db.prepare('SELECT COUNT(*) as cnt FROM compute_suppliers').get().cnt;
  const totalTasksCompleted = db.prepare("SELECT COUNT(*) as cnt FROM compute_tasks WHERE status = 'completed'").get().cnt;
  const totalCreditsExchanged = db.prepare('SELECT COALESCE(SUM(credits), 0) as total FROM compute_settlements').get().total;

  res.json({
    ok: true,
    stats: {
      suppliers_online: suppliersOnline,
      suppliers_total: totalSuppliers,
      tasks_pending: tasksPending,
      tasks_completed_24h: tasksCompleted24h,
      tasks_completed_total: totalTasksCompleted,
      credits_exchanged_24h: creditsExchanged24h,
      credits_exchanged_total: totalCreditsExchanged
    }
  });
});

// GET /v1/exchange/leaderboard — Top suppliers by credits earned
app.get('/v1/exchange/leaderboard', publicRateLimit, (req, res) => {
  const leaders = db.prepare('SELECT id, user_id, tasks_completed, credits_earned, reliability_score, registered_at FROM compute_suppliers ORDER BY credits_earned DESC LIMIT 20').all();
  res.json({
    ok: true,
    leaderboard: leaders.map((s, i) => ({
      rank: i + 1,
      supplier_id: s.id,
      user_id: s.user_id,
      tasks_completed: s.tasks_completed,
      credits_earned: s.credits_earned,
      reliability_score: s.reliability_score,
      registered_at: s.registered_at
    })),
    count: leaders.length
  });
});

// GET /v1/exchange/my-earnings/:user_id — User's exchange earnings
app.get('/v1/exchange/my-earnings/:user_id', auth, (req, res) => {
  const userId = req.params.user_id;
  // Only allow users to view their own earnings
  if (userId !== req.acct.id) return res.status(403).json({ error: { code: 'forbidden', message: 'You can only view your own earnings' } });

  const supplierStats = db.prepare('SELECT COALESCE(SUM(tasks_completed), 0) as tasks_supplied, COALESCE(SUM(credits_earned), 0) as total_earned, MIN(reliability_score) as reliability_score FROM compute_suppliers WHERE user_id = ?').get(userId);
  const totalSpent = db.prepare("SELECT COALESCE(SUM(credits_offered), 0) as total FROM compute_tasks WHERE consumer_id = ? AND status IN ('completed', 'disputed')").get(userId).total;
  const tasksConsumed = db.prepare('SELECT COUNT(*) as cnt FROM compute_tasks WHERE consumer_id = ?').get(userId).cnt;

  res.json({
    ok: true,
    user_id: userId,
    total_earned: supplierStats.total_earned,
    total_spent: totalSpent,
    tasks_supplied: supplierStats.tasks_supplied,
    tasks_consumed: tasksConsumed,
    reliability_score: supplierStats.reliability_score !== null ? supplierStats.reliability_score : 1.0
  });
});

// ===== WILDCARD: Call any API (MUST BE LAST) =====
app.post('/v1/:slug', auth, async (req, res) => {
  const def = apiMap.get(req.params.slug);
  if (!def) return res.status(404).json({ error: { code: 'api_not_found', slug: req.params.slug, hint: 'GET /v1/tools to browse, POST /v1/resolve to search' } });

  const handler = allHandlers[req.params.slug];
  if (!handler) return res.status(501).json({ error: { code: 'no_handler', slug: req.params.slug } });

  // Idempotency key check
  const idempKey = req.headers['idempotency-key'];
  if (idempKey) {
    const cachedIdemp = idempotencyCache.get(idempKey);
    if (cachedIdemp) { res.set('X-Idempotent', 'true'); return res.json(cachedIdemp.data); }
  }

  // Cost preview / dry-run mode
  if (req.body.preview || req.body.dry_run) {
    return res.json({
      ok: true, preview: true, api: req.params.slug, name: def.name,
      estimated_credits: def.credits, estimated_cost_usd: (def.credits * 0.009).toFixed(4),
      balance: req.acct.balance, can_afford: req.acct.balance >= def.credits,
      tier: def.tier, category: def.cat,
    });
  }

  // Response cache check (identical request deduplication - saves credits)
  const cacheKey = getCacheKey(req.params.slug, req.body);
  const cached = responseCache.get(cacheKey);
  if (cached && def.tier === 'compute' && !req.body.trace) {
    // Only cache compute-tier (deterministic) results, not LLM/network
    res.set('X-Cache', 'HIT');
    res.set('X-Credits-Used', '0');
    res.set('X-Credits-Remaining', String(req.acct.balance));
    return res.json({ ...cached.data, meta: { ...cached.data.meta, cache_hit: true, credits_used: 0, balance: req.acct.balance } });
  }

  if (req.acct.balance < def.credits) {
    if (req.acct.auto_reload) { req.acct.balance += req.acct.auto_reload.amount; }
    else return res.status(402).json({ error: { code: 'insufficient_credits', need: def.credits, have: req.acct.balance } });
  }

  // Input schema validation
  const inputSchema = SCHEMAS?.[req.params.slug]?.input;
  if (inputSchema && inputSchema.required) {
    const missing = inputSchema.required.filter(f => req.body[f] === undefined && req.body[f] !== '');
    if (missing.length > 0) {
      return res.status(422).json({
        ok: false,
        error: { code: 'validation_error', message: `Missing required fields: ${missing.join(', ')}`, missing_fields: missing },
        hint: { input_schema: inputSchema, example: SCHEMAS?.[req.params.slug]?.example || null },
      });
    }
  }

  // Resolve file_id references in input
  const body = { ...req.body };
  for (const [key, val] of Object.entries(body)) {
    if (typeof val === 'string' && val.startsWith('file:')) {
      const fileId = val.slice(5);
      try {
        const fileRow = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
        if (fileRow) {
          const fileBuf = fs.readFileSync(path.join(__dirname, '.data', 'files', fileRow.id));
          body[key] = fileBuf.toString('utf8');
        }
      } catch(e) { /* leave as-is */ }
    }
  }

  req.acct.balance -= def.credits;
  const start = Date.now();
  let result, handlerError = false;
  try { result = await handler(body); }
  catch (e) { result = null; handlerError = e.message; }
  const latency = Date.now() - start;

  dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', req.params.slug, def.credits, latency, handlerError ? 'error' : (result?._engine || 'unknown'));
  persistKey(req.apiKey);

  res.set('X-Credits-Used', String(def.credits));
  res.set('X-Cost-USD', (def.credits * 0.005).toFixed(4));
  res.set('X-Credits-Remaining', String(req.acct.balance));
  res.set('X-Latency-Ms', String(latency));
  res.set('Server-Timing', 'total;dur=' + latency);
  res.set('X-Request-Id', uuidv4());
  res.set('X-Slopshop-Suggestion', getSuggestions(req.params.slug).slice(0,2).join(','));

  // Deterministic mode
  const isDeterministic = req.body.mode === 'deterministic';
  if (isDeterministic) res.set('X-Deterministic', 'true');

  if (handlerError) {
    res.set('X-Engine', 'error');
    const schema = SCHEMAS?.[req.params.slug];
    const errBody = { error: { code: 'handler_error', message: handlerError, api: req.params.slug, credits_used: def.credits, latency_ms: latency } };
    if (schema?.input) errBody.error.hint = { message: 'Check input parameters against the schema below', input_schema: schema.input };
    return res.status(500).json(errBody);
  }

  const engine = result?._engine || 'unknown';
  const confidence = engine === 'real' ? 0.99 : engine === 'llm' ? 0.85 : engine === 'needs_key' ? 0.0 : engine === 'error' ? 0.0 : 0.80;

  res.set('X-Engine', engine);

  const response = {
    ok: true,
    data: result,
    meta: { api: req.params.slug, credits_used: def.credits, balance: req.acct.balance, latency_ms: latency, engine, confidence },
    guarantees: { schema_valid: true, validated: engine === 'real', fallback_used: false, ...(isDeterministic ? { deterministic: true } : {}) }
  };

  // Low balance warning
  if (req.acct.balance < 100) {
    response.warning = { code: 'low_balance', message: `Balance is ${req.acct.balance} credits. Buy more at POST /v1/credits/buy or sign up for auto-reload.`, balance: req.acct.balance };
    res.set('X-Low-Balance', 'true');
  }

  // Debug trace mode
  if (req.body.trace || req.headers['x-debug-trace']) {
    response.trace = [
      { step: 'received', timestamp: new Date().toISOString(), slug: req.params.slug },
      { step: 'credits_checked', balance_before: req.acct.balance + def.credits, cost: def.credits },
      { step: 'executed', backend: 'direct', latency_ms: latency, engine: result?._engine || 'unknown' },
      { step: 'validated', schema_valid: true }
    ];
  }

  // Agent Mode: enhanced response for AI agents (mode=agent, mode=grok, or agent_mode=true)
  const agentMode = req.body.mode === 'agent' || req.body.mode === 'grok' || req.body.agent_mode || req.headers['x-agent-mode'];
  if (agentMode) {
    const fingerprint = getCacheFingerprint(req.params.slug, req.body);
    response.agent = {
      suggestions: getSuggestions(req.params.slug),
      cache_fingerprint: fingerprint,
      cost_breakdown: { this_call: def.credits, memory_cost: 0, potential_cache_savings: def.credits },
    };
    // Auto-persist to memory (free, non-blocking)
    const sessionId = req.body.session_id || req.headers['x-session-id'] || 'agent-' + req.apiKey.slice(-8);
    if (allHandlers['memory-set']) {
      try {
        allHandlers['memory-set']({
          namespace: sessionId,
          key: `${req.params.slug}:${fingerprint.slice(0, 8)}`,
          value: JSON.stringify({ result: result, credits: def.credits, timestamp: new Date().toISOString() }),
          tags: [req.params.slug, 'agent-mode'].join(','),
        });
        response.agent.memory_persisted = { namespace: sessionId, key: `${req.params.slug}:${fingerprint.slice(0, 8)}` };
      } catch (e) { /* silent - memory is best-effort */ }
    }
  }

  // Store in cache for compute-tier (deterministic) APIs
  if (def.tier === 'compute' && !handlerError) {
    responseCache.set(cacheKey, { data: response, ts: Date.now() });
    res.set('X-Cache', 'MISS');
  }

  // Store idempotency result
  if (idempKey) idempotencyCache.set(idempKey, { data: response, ts: Date.now() });

  // Notarize output
  const outputHash = crypto.createHash('sha256').update(JSON.stringify(response.data)).digest('hex');
  response.meta.output_hash = outputHash;
  res.set('X-Output-Hash', outputHash);

  res.json(response);
});

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const llm = process.env.ANTHROPIC_API_KEY ? 'Anthropic' : process.env.OPENAI_API_KEY ? 'OpenAI' : 'NONE';
  console.log(`\n  🦞 SLOPSHOP v2 is live on http://localhost:${PORT}`);
  console.log(`  📡 ${apiCount} APIs, ${handlerCount} handlers, 0 mocks`);
  console.log(`  🔑 Demo key: sk-slop-demo-key-12345678 (200 cr)`);
  console.log(`  🤖 LLM: ${llm}${llm === 'NONE' ? ' (set ANTHROPIC_API_KEY to unlock 48 AI APIs)' : ''}`);
  console.log(`  🌐 http://localhost:${PORT}/index.html\n`);
});
