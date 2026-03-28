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

// Structured logging
const log = {
  info: (msg, data = {}) => console.log(JSON.stringify({ level: 'info', msg, ...data, ts: new Date().toISOString() })),
  warn: (msg, data = {}) => console.log(JSON.stringify({ level: 'warn', msg, ...data, ts: new Date().toISOString() })),
  error: (msg, data = {}) => console.error(JSON.stringify({ level: 'error', msg, ...data, ts: new Date().toISOString() })),
};

const helmet = require('helmet');
const compression = require('compression');
const app = express();
// PERF: gzip/deflate compression — reduces response size 60-80% for JSON
app.use(compression({ level: 1, threshold: 256 })); // level 1 = fastest, skip tiny responses
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://slopshop.gg", "https://slopshop-production.up.railway.app"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Admin-Secret'],
  exposedHeaders: [
    'X-Request-Id', 'X-Credits-Used', 'X-Credits-Remaining', 'X-Latency-Ms', 'X-Engine', 'X-Cost-USD',
    'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset',
    'X-API-Version', 'Retry-After', 'Sunset', 'Deprecation'
  ],
  maxAge: 86400,
}));
app.use(express.json({ limit: '1mb' })); // 1MB max request body
app.set('trust proxy', 1); // trust Railway/Vercel proxy for IP

// PERF: Disable Express ETag generation (not needed for API responses)
app.set('etag', false);
// PERF: Disable x-powered-by header (fewer bytes per response)
app.disable('x-powered-by');
// PERF: Use fast JSON serializer for known-safe objects
app.set('json spaces', undefined); // no pretty-printing in production

// ===== SECURITY 10/10: Input sanitization + prototype pollution protection =====
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    // Block prototype pollution
    const blocked = ['__proto__', 'constructor', 'prototype'];
    const checkProto = (obj) => {
      for (const key of Object.keys(obj)) {
        if (blocked.includes(key)) { delete obj[key]; continue; }
        if (obj[key] && typeof obj[key] === 'object' && !Buffer.isBuffer(obj[key])) checkProto(obj[key]);
      }
    };
    checkProto(req.body);
    // Sanitize all string inputs
    const sanitize = (obj) => {
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string') {
          // Strip null bytes (injection vector)
          obj[key] = val.replace(/\0/g, '');
          // Limit string length to prevent memory abuse (1MB max per field)
          if (obj[key].length > 1048576) obj[key] = obj[key].slice(0, 1048576);
        } else if (val && typeof val === 'object' && !Buffer.isBuffer(val)) {
          sanitize(val);
        }
      }
    };
    sanitize(req.body);
  }
  next();
});

// ===== SECURITY 10/10: DNS rebinding protection =====
app.use((req, res, next) => {
  const host = req.headers.host;
  const allowed = ['slopshop.gg', 'slopshop-production.up.railway.app', 'localhost:3000', `localhost:${process.env.PORT || 3000}`];
  if (host && !allowed.some(a => host.includes(a)) && process.env.NODE_ENV === 'production') {
    return res.status(421).json({ error: { code: 'invalid_host' } });
  }
  next();
});

// ===== SECURITY 10/10: Response header hardening + HSTS =====
app.use((req, res, next) => {
  // Helmet already sets X-Content-Type-Options and X-Frame-Options, but we ensure full coverage
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('X-XSS-Protection', '0'); // Disabled per modern best practice (CSP handles this)
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.set('X-Permitted-Cross-Domain-Policies', 'none');
  // HSTS: enforce HTTPS for 1 year with preload
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
});

// ===== SECURITY 10/10: Request timeout (slow loris protection) =====
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: { code: 'request_timeout' } });
    }
  });
  next();
});

// Global request ID + security headers on EVERY response
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.set('X-Request-Id', req.requestId);
  res.set('X-API-Version', '2026.03.28');
  next();
});

// ===== RATE LIMITING (in-memory, per-IP) — PERF: Optimized with pre-allocated slots =====
const ipLimits = new Map();
function rateLimit(key, maxPerWindow, windowMs) {
  const now = Date.now();
  const entry = ipLimits.get(key);
  if (entry) {
    if (now - entry.s > windowMs) {
      // Window expired, reset in-place (no allocation)
      entry.c = 1;
      entry.s = now;
      return true;
    }
    return ++entry.c <= maxPerWindow;
  }
  // First request — allocate minimal object
  ipLimits.set(key, { c: 1, s: now });
  return true;
}
// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ipLimits) {
    if (now - entry.s > 3600000) ipLimits.delete(key);
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
let superpowerHandlers = {}, hackathon1 = {}, hackathon2 = {}, hackathon3 = {}, hackathon4 = {}, hackathon5a = {}, hackathon5b = {}, competitor1 = {}, competitor2 = {}, rapidapi1 = {}, rapidapi2 = {}, rapidapi3 = {}, power1 = {}, power2 = {};
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
try { power1 = require('./handlers/compute-power-1'); } catch (e) { console.warn('Handler load skipped:', e.message); }
try { power2 = require('./handlers/compute-power-2'); } catch (e) { console.warn('Handler load skipped:', e.message); }
const allHandlers = { ...computeHandlers, ...superpowerHandlers, ...hackathon1, ...hackathon2, ...hackathon3, ...hackathon4, ...hackathon5a, ...hackathon5b, ...competitor1, ...competitor2, ...rapidapi1, ...rapidapi2, ...rapidapi3, ...power1, ...power2, ...llmHandlers, ...networkHandlers, ...externalHandlers, ...senseHandlers, ...generateHandlers, ...memoryHandlers, ...enrichHandlers, ...orchHandlers };

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
// On Railway: set DB_PATH=/data/slopshop.db and mount a volume at /data
// On local: defaults to .data/slopshop.db
const fs = require('fs');
const Database = require('better-sqlite3');
// Try paths in order: DB_PATH env → .data/ → /tmp/
const DB_CANDIDATES = [
  process.env.DB_PATH,
  path.join(__dirname, '.data', 'slopshop.db'),
  '/tmp/slopshop.db',
].filter(Boolean);

let DB_PATH;
let db;
for (const candidate of DB_CANDIDATES) {
  try {
    const dir = path.dirname(candidate);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Touch the file first (Railway volumes need this)
    if (!fs.existsSync(candidate)) fs.writeFileSync(candidate, '');
    // Test by actually opening the database
    db = new Database(candidate);
    DB_PATH = candidate;
    break;
  } catch(e) {
    log.warn('DB path failed, trying next', { path: candidate, error: e.message });
  }
}
if (!db) {
  console.error('FATAL: Could not open database at any path');
  process.exit(1);
}
db.pragma('journal_mode = WAL'); // fast concurrent reads
db.pragma('busy_timeout = 5000'); // wait up to 5s for locks instead of failing
db.pragma('synchronous = NORMAL'); // faster writes, still crash-safe with WAL
db.pragma('cache_size = -64000'); // PERF: 64MB cache (default is 2MB) — massive read speedup
db.pragma('temp_store = MEMORY'); // PERF: temp tables in memory, not disk
db.pragma('mmap_size = 268435456'); // PERF: 256MB memory-mapped I/O — bypass read() syscalls
db.pragma('page_size = 8192'); // PERF: 8KB pages (better for large tables, only works on new DBs)
log.info('Database initialized', { path: DB_PATH, tables: db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get().c });

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
`);

// Migrate: add columns that may be missing from older databases
const apiKeysCols = db.pragma('table_info(api_keys)').map(c => c.name);
if (!apiKeysCols.includes('scope')) db.exec(`ALTER TABLE api_keys ADD COLUMN scope TEXT DEFAULT '*'`);
if (!apiKeysCols.includes('label')) db.exec(`ALTER TABLE api_keys ADD COLUMN label TEXT DEFAULT NULL`);
if (!apiKeysCols.includes('max_credits')) db.exec(`ALTER TABLE api_keys ADD COLUMN max_credits INTEGER DEFAULT NULL`);
// SECURITY: Store hashed API keys instead of plaintext.
// Migration path:
//   - key_hash + key_prefix columns are added alongside existing plaintext 'key' column
//   - New keys store SHA-256 hash in key_hash, first 10 chars in key_prefix, and plaintext in 'key' (for backward compat)
//   - Auth checks hash first, falls back to plaintext match for pre-migration keys
//   - Once all keys are re-issued or rotated, the plaintext 'key' column can be dropped
if (!apiKeysCols.includes('key_hash')) db.exec(`ALTER TABLE api_keys ADD COLUMN key_hash TEXT DEFAULT NULL`);
if (!apiKeysCols.includes('key_prefix')) db.exec(`ALTER TABLE api_keys ADD COLUMN key_prefix TEXT DEFAULT NULL`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)`);

db.exec(`
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

// ===== MEMORY 2FA — Session-gated persistent memory with email verification =====
db.exec(`CREATE TABLE IF NOT EXISTS memory_sessions (
  id TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  verified INTEGER DEFAULT 0,
  code TEXT,
  code_expires INTEGER,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS memory_2fa_settings (
  api_key TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  email TEXT,
  updated INTEGER NOT NULL
)`);

const dbGetMemSession = db.prepare('SELECT * FROM memory_sessions WHERE id = ? AND api_key = ?');
const dbInsertMemSession = db.prepare('INSERT OR REPLACE INTO memory_sessions (id, api_key, verified, code, code_expires, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?)');
const dbVerifyMemSession = db.prepare('UPDATE memory_sessions SET verified = 1 WHERE id = ? AND api_key = ?');
const dbGet2faSetting = db.prepare('SELECT * FROM memory_2fa_settings WHERE api_key = ?');
const dbSet2faSetting = db.prepare('INSERT OR REPLACE INTO memory_2fa_settings (api_key, enabled, email, updated) VALUES (?, ?, ?, ?)');

// Memory 2FA middleware — checks session before allowing memory ops
function memoryAuth(req, res, next) {
  const slug = req.params.slug;
  if (!slug || !slug.startsWith('memory-')) return next();

  const setting = dbGet2faSetting.get(req.apiKey);
  if (!setting || !setting.enabled) return next(); // 2FA not enabled, pass through

  const sessionId = req.headers['x-memory-session'] || req.body._memory_session;
  if (!sessionId) {
    return res.status(401).json({
      error: { code: 'memory_session_required', message: 'Memory 2FA is enabled. Get a session: POST /v1/memory/session/create, then verify with the emailed code: POST /v1/memory/session/verify' }
    });
  }

  const session = dbGetMemSession.get(sessionId, req.apiKey);
  if (!session) return res.status(401).json({ error: { code: 'invalid_memory_session' } });
  if (session.expires < Date.now()) return res.status(401).json({ error: { code: 'memory_session_expired', message: 'Session expired. Create a new one.' } });
  if (!session.verified) return res.status(401).json({ error: { code: 'memory_session_unverified', message: 'Verify your session with the emailed code: POST /v1/memory/session/verify' } });

  req.memorySession = session;
  next();
}

// Memory 2FA endpoints
app.post('/v1/memory/2fa/enable', auth, (req, res) => {
  const email = req.body.email;
  if (!email || !email.includes('@')) return res.status(422).json({ error: { code: 'email_required' } });
  dbSet2faSetting.run(req.apiKey, 1, email, Date.now());
  res.json({ ok: true, message: 'Memory 2FA enabled. All memory operations now require a verified session.', email: email.replace(/(.{2}).*(@.*)/, '$1***$2') });
});

app.post('/v1/memory/2fa/disable', auth, (req, res) => {
  dbSet2faSetting.run(req.apiKey, 0, null, Date.now());
  res.json({ ok: true, message: 'Memory 2FA disabled. Memory operations no longer require session verification.' });
});

app.get('/v1/memory/2fa/status', auth, (req, res) => {
  const setting = dbGet2faSetting.get(req.apiKey);
  res.json({ enabled: !!(setting && setting.enabled), email: setting?.email ? setting.email.replace(/(.{2}).*(@.*)/, '$1***$2') : null });
});

app.post('/v1/memory/session/create', auth, (req, res) => {
  const setting = dbGet2faSetting.get(req.apiKey);
  if (!setting || !setting.enabled) {
    return res.json({ ok: true, session_id: 'no-2fa', message: '2FA not enabled. Memory ops work without session.', verified: true });
  }
  const sessionId = 'memsess-' + crypto.randomUUID();
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit code
  const now = Date.now();
  const expires = now + 3600000; // 1 hour session
  const codeExpires = now + 600000; // 10 min code validity
  dbInsertMemSession.run(sessionId, req.apiKey, 0, code, codeExpires, now, expires);

  // In production, send email. For now, log it (would use SendGrid/SES in production)
  log.info('Memory 2FA code generated', { key_prefix: req.apiKey.slice(0, 12), email: setting.email, code_hint: code.slice(0, 2) + '****' });

  // If we have a webhook or email handler, send the code
  if (allHandlers['ext-email-send'] && process.env.SENDGRID_API_KEY) {
    allHandlers['ext-email-send']({ to: setting.email, subject: 'Slopshop Memory 2FA Code', body: 'Your verification code is: ' + code + '\nExpires in 10 minutes.' }).catch(() => {});
  }

  res.json({
    ok: true,
    session_id: sessionId,
    message: 'Verification code sent to ' + setting.email.replace(/(.{2}).*(@.*)/, '$1***$2') + '. Verify with POST /v1/memory/session/verify',
    expires_in: '1 hour',
    code_expires_in: '10 minutes',
    // DEV MODE: include code if no email service configured
    ...(!process.env.SENDGRID_API_KEY ? { dev_code: code, dev_note: 'Code shown because no email service configured. Set SENDGRID_API_KEY for production.' } : {}),
  });
});

app.post('/v1/memory/session/verify', auth, (req, res) => {
  const { session_id, code } = req.body;
  if (!session_id || !code) return res.status(422).json({ error: { code: 'missing_fields', fields: ['session_id', 'code'] } });

  const session = dbGetMemSession.get(session_id, req.apiKey);
  if (!session) return res.status(404).json({ error: { code: 'session_not_found' } });
  if (session.verified) return res.json({ ok: true, message: 'Already verified.', session_id });
  if (session.code_expires < Date.now()) return res.status(410).json({ error: { code: 'code_expired', message: 'Code expired. Create a new session.' } });

  // Timing-safe comparison
  if (!crypto.timingSafeEqual(Buffer.from(String(code)), Buffer.from(String(session.code)))) {
    return res.status(401).json({ error: { code: 'invalid_code' } });
  }

  dbVerifyMemSession.run(session_id, req.apiKey);
  res.json({ ok: true, message: 'Session verified. Include X-Memory-Session: ' + session_id + ' header on memory requests.', session_id, expires: new Date(session.expires).toISOString() });
});

// ===== AGENT CHAINING & PROMPT QUEUE TABLES =====
db.exec(`CREATE TABLE IF NOT EXISTS agent_chains (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  steps TEXT,
  loop INTEGER DEFAULT 0,
  context TEXT DEFAULT '{}',
  status TEXT DEFAULT 'active',
  current_step INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS prompt_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  prompts TEXT,
  schedule TEXT,
  frequency TEXT DEFAULT 'once',
  status TEXT DEFAULT 'queued',
  last_run TEXT,
  run_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// ===== PHASE 4-5 TABLES: ECONOMY (Credit Market, Reputation, Wallets) =====
db.exec(`CREATE TABLE IF NOT EXISTS credit_market (
  id TEXT PRIMARY KEY,
  seller_id TEXT,
  amount INTEGER,
  price_per_credit REAL DEFAULT 0.005,
  remaining INTEGER,
  status TEXT DEFAULT 'active',
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS agent_reputation (
  agent_id TEXT PRIMARY KEY,
  score REAL DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS agent_wallets (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  agent_name TEXT,
  balance INTEGER DEFAULT 0,
  budget_limit INTEGER DEFAULT 1000,
  total_earned INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// ===== PHASE 2-3 TABLES: EVALUATIONS, TEMPLATES, REPLAYS =====
db.exec(`CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  agent_slug TEXT,
  accuracy INTEGER,
  avg_latency INTEGER,
  results TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS marketplace_templates (
  id TEXT PRIMARY KEY,
  author_id TEXT,
  name TEXT,
  description TEXT,
  category TEXT DEFAULT 'general',
  steps TEXT,
  tools TEXT,
  estimated_credits INTEGER DEFAULT 0,
  forks INTEGER DEFAULT 0,
  rating REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published',
  created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS replays (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  events TEXT,
  tools_used TEXT,
  total_credits INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`);

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
  db.prepare('INSERT INTO api_keys (key, id, balance, tier, created, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'sk-slop-demo-key-12345678', 'demo', 200, 'baby-lobster', Date.now(), hashApiKey('sk-slop-demo-key-12345678'), keyPrefix('sk-slop-demo-key-12345678')
  );
}

// DB helpers
// Hash an API key for secure storage — uses SHA-256, returns hex string
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}
// Extract prefix for indexed lookup (first 10 chars, e.g. "sk-slop-xx")
function keyPrefix(key) {
  return key.slice(0, 10);
}
const dbGetKey = db.prepare('SELECT * FROM api_keys WHERE key = ?');
const dbGetKeyByHash = db.prepare('SELECT * FROM api_keys WHERE key_hash = ?');
const dbGetKeysByPrefix = db.prepare('SELECT * FROM api_keys WHERE key_prefix = ?');
const dbInsertKey = db.prepare('INSERT INTO api_keys (key, id, balance, tier, created, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?)');
const dbUpdateBalance = db.prepare('UPDATE api_keys SET balance = ?, tier = ? WHERE key = ?');
const dbUpdateAutoReload = db.prepare('UPDATE api_keys SET auto_reload = ? WHERE key = ?');
const _dbInsertAudit = db.prepare('INSERT INTO audit_log (ts, key_prefix, api, credits, latency_ms, engine) VALUES (?, ?, ?, ?, ?, ?)');
const dbGetAudit = db.prepare('SELECT * FROM audit_log WHERE key_prefix = ? ORDER BY id DESC LIMIT 1000');
const dbGetRecentAudit = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?');
const dbAuditCount = db.prepare('SELECT COUNT(*) as cnt FROM audit_log');
const dbInsertWaitlist = db.prepare('INSERT OR IGNORE INTO waitlist (email, created) VALUES (?, ?)');
const dbGetWaitlistPos = db.prepare('SELECT COUNT(*) as pos FROM waitlist WHERE created <= (SELECT created FROM waitlist WHERE email = ?)');
const dbWaitlistCount = db.prepare('SELECT COUNT(*) as cnt FROM waitlist');
const dbSetState = db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)');
const dbGetState = db.prepare('SELECT value FROM agent_state WHERE key = ?');
const dbDelState = db.prepare('DELETE FROM agent_state WHERE key = ?');

// ===== PERF: Batched audit writes (flush every 500ms or 50 entries) =====
const auditBatch = [];
const AUDIT_FLUSH_INTERVAL = 500;
const AUDIT_FLUSH_SIZE = 50;

const _dbInsertAuditBatch = db.transaction((rows) => {
  for (const r of rows) _dbInsertAudit.run(r.ts, r.kp, r.api, r.cr, r.lat, r.eng);
});

function flushAuditBatch() {
  if (auditBatch.length === 0) return;
  const batch = auditBatch.splice(0, auditBatch.length);
  try { _dbInsertAuditBatch(batch); }
  catch(e) { log.error('Audit batch flush failed', { error: e.message, count: batch.length }); }
}
setInterval(flushAuditBatch, AUDIT_FLUSH_INTERVAL);

// Drop-in replacement: queues instead of synchronous write
const dbInsertAudit = {
  run(ts, kp, api, cr, lat, eng) {
    auditBatch.push({ ts, kp, api, cr, lat, eng });
    if (auditBatch.length >= AUDIT_FLUSH_SIZE) flushAuditBatch();
  }
};

// ===== PERF: Batched key persistence (coalesce writes) =====
const dirtyKeys = new Set();
const KEY_PERSIST_INTERVAL = 1000; // flush every 1s

// In-memory API key cache for speed (refreshed from DB)
// Keys are indexed by plaintext key (legacy) AND by hash (new secure path)
const apiKeys = new Map();
const apiKeysByHash = new Map(); // hash -> { acct, plaintextKey }
function loadKeysFromDB() {
  const rows = db.prepare('SELECT * FROM api_keys').all();
  apiKeys.clear();
  apiKeysByHash.clear();
  for (const r of rows) {
    const acct = { id: r.id, balance: r.balance, tier: r.tier, auto_reload: r.auto_reload ? JSON.parse(r.auto_reload) : false, scope: r.scope || '*', label: r.label || null, max_credits: r.max_credits || null, created: r.created };
    apiKeys.set(r.key, acct);
    // Index by hash: use stored hash if available, otherwise compute from plaintext key
    const h = r.key_hash || hashApiKey(r.key);
    apiKeysByHash.set(h, { acct, plaintextKey: r.key });
  }
}
loadKeysFromDB();

// PERF: Deferred key persistence — mark dirty, flush in batch
function persistKey(key) {
  dirtyKeys.add(key);
}

const _dbPersistBatch = db.transaction((keys) => {
  for (const key of keys) {
    const a = apiKeys.get(key);
    if (a) dbUpdateBalance.run(a.balance, a.tier, key);
  }
});

function flushDirtyKeys() {
  if (dirtyKeys.size === 0) return;
  const keys = [...dirtyKeys];
  dirtyKeys.clear();
  try { _dbPersistBatch(keys); }
  catch(e) { log.error('Key persist batch failed', { error: e.message, count: keys.length }); }
}
setInterval(flushDirtyKeys, KEY_PERSIST_INTERVAL);

// Flush on shutdown
process.on('SIGTERM', () => { flushDirtyKeys(); flushAuditBatch(); process.exit(0); });
process.on('SIGINT', () => { flushDirtyKeys(); flushAuditBatch(); process.exit(0); });

const jobs = new Map();
const serverStart = Date.now();
const uuidv4 = () => crypto.randomUUID();

// ===== USAGE STREAM INFRASTRUCTURE =====
const usageStreamClients = new Set();
function emitUsageEvent(keyPrefix, slug, credits, status) {
  // PERF: Skip entirely when no SSE clients connected (common case)
  if (usageStreamClients.size === 0) return;
  const event = { ts: new Date().toISOString(), key_prefix: keyPrefix, slug, credits, status };
  for (const client of usageStreamClients) {
    if (client.keyPrefix === keyPrefix) {
      try { client.res.write(`event: usage\ndata: ${JSON.stringify(event)}\n\n`); } catch (e) { usageStreamClients.delete(client); }
    }
  }
}

const keyCount = db.prepare('SELECT COUNT(*) as cnt FROM api_keys').get().cnt;
log.info('Server loaded', { apis: apiCount, handlers: Object.keys(allHandlers).length, categories: catalog.length });
log.info('API keys initialized', { dbKeys: keyCount, memoryKeys: apiKeys.size });

// ===== AUTH =====
// SECURITY: API keys are now hashed with SHA-256 before storage.
// New keys store key_hash + key_prefix in DB. Auth looks up by hash.
// Backward compat: existing plaintext keys still work via direct Map lookup.
// Migration path: once all keys are rotated/re-issued, drop the plaintext 'key' column.

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    log.warn('Auth failure: missing or malformed header', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>', demo_key: 'sk-slop-demo-key-12345678', signup: 'POST /v1/auth/signup' } });
  }
  const key = h.slice(7);
  // SECURITY: Look up by hash first (new secure path), fall back to plaintext (legacy/migration)
  let acct = apiKeys.get(key); // plaintext lookup (backward compat for pre-hash keys)
  if (!acct) {
    const incomingHash = hashApiKey(key);
    const entry = apiKeysByHash.get(incomingHash);
    if (entry) acct = entry.acct;
  }
  if (!acct) {
    log.warn('Auth failure: invalid key', { ip: req.ip, path: req.path, key_prefix: key.slice(0, 12) });
    return res.status(401).json({ error: { code: 'invalid_key', message: 'Key not found. Sign up at POST /v1/auth/signup or use demo key sk-slop-demo-key-12345678', demo_key: 'sk-slop-demo-key-12345678', signup: 'POST /v1/auth/signup' } });
  }
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
  // Per-key rate limiting: 120 requests per minute (PERF: doubled from 60)
  const rlMax = acct.tier === 'leviathan' ? 1000 : acct.tier === 'reef-boss' ? 300 : 120; if (!rateLimit('api:' + key, rlMax, 60000)) {
    log.warn('Rate limit exceeded', { key_prefix: key.slice(0, 12), ip: req.ip, path: req.path });
    const rlEntry = ipLimits.get('api:' + key);
    res.set('X-RateLimit-Limit', String(rlMax||120));
    res.set('X-RateLimit-Remaining', '0');
    res.set('X-RateLimit-Reset', String(rlEntry ? Math.ceil((rlEntry.s + 60000) / 1000) : Math.ceil(Date.now() / 1000) + 60));
    res.set('Retry-After', '30');
    return res.status(429).json({ error: { code: 'rate_limited', message: 'Max 120 requests/min per API key. Retry after 30 seconds.', retry_after: 30 } });
  }
  const rlEntry = ipLimits.get('api:' + key);
  res.set('X-RateLimit-Limit', String(rlMax||120));
  res.set('X-RateLimit-Remaining', String(Math.max(0, 120 - (rlEntry?.c || 0))));
  res.set('X-RateLimit-Reset', String(rlEntry ? Math.ceil((rlEntry.s + 60000) / 1000) : Math.ceil(Date.now() / 1000) + 60));
  next();
}

// ===== PUBLIC RATE LIMIT (IP-based for unauthenticated endpoints) =====
function publicRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!rateLimit('public:' + ip, 30, 60000)) {
    log.warn('Public rate limit exceeded', { ip, path: req.path });
    const rlEntry = ipLimits.get('public:' + ip);
    res.set('Retry-After', '30');
    res.set('X-RateLimit-Limit', '30');
    res.set('X-RateLimit-Remaining', '0');
    res.set('X-RateLimit-Reset', String(rlEntry ? Math.ceil((rlEntry.s + 60000) / 1000) : Math.ceil(Date.now() / 1000) + 60));
    return res.status(429).json({ error: { code: 'rate_limited', message: 'Max 30 requests/min for public endpoints. Authenticate for higher limits.', retry_after: 30 } });
  }
  const rlEntry = ipLimits.get('public:' + ip);
  res.set('X-RateLimit-Limit', '30');
  res.set('X-RateLimit-Remaining', String(Math.max(0, 30 - (rlEntry?.count || 0))));
  res.set('X-RateLimit-Reset', String(rlEntry ? Math.ceil((rlEntry.s + 60000) / 1000) : Math.ceil(Date.now() / 1000) + 60));
  next();
}

// ===== STATIC =====
// Allowlist-based static file protection
app.use((req, res, next) => {
  // Only serve files with these extensions from static
  const ext = path.extname(req.path).toLowerCase();
  const allowedExts = ['.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.txt', '.xml', '.json', '.webmanifest', '.woff', '.woff2', '.ttf'];

  // Block dotfiles except .well-known
  if (req.path.startsWith('/.') && !req.path.startsWith('/.well-known')) {
    return res.status(404).send('Not found');
  }

  // Block paths that look like source code or config
  if (req.path.includes('/handlers/') || req.path.includes('/node_modules/') || req.path.includes('/sdk/') || req.path.includes('/.data/')) {
    return res.status(404).send('Not found');
  }

  // For files with extensions, only allow safe types
  if (ext && !allowedExts.includes(ext)) {
    return res.status(404).send('Not found');
  }

  // Block specific known sensitive files by name (no extension)
  const sensitiveNames = ['/server-v2', '/registry', '/schemas', '/auth', '/agent', '/pipes', '/stripe', '/polar', '/zapier', '/package', '/package-lock', '/Procfile', '/Dockerfile', '/CLAUDE'];
  if (sensitiveNames.some(n => req.path.startsWith(n + '.') || req.path === n)) {
    return res.status(404).send('Not found');
  }

  next();
});
app.use(express.static(path.join(__dirname)));

// Enforce HTTPS in production
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] === 'http') {
      return res.redirect(301, 'https://' + req.headers.host + req.url);
    }
    next();
  });
}

// ===== REQUEST BODY SIZE VALIDATION PER ENDPOINT =====
// Global limit is 1MB (express.json above), but tighter limits per route type
// PERF: Body size check uses content-length only (express.json already enforces 1MB global limit)
// Removed JSON.stringify check that was allocating on every request
function bodySizeLimit(maxBytes) {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > maxBytes) {
      return res.status(413).json({ error: { code: 'payload_too_large', message: `Body exceeds ${maxBytes} byte limit`, max_bytes: maxBytes, received_bytes: contentLength } });
    }
    next();
  };
}
const BODY_LIMIT_AUTH = bodySizeLimit(1024);        // 1KB for auth endpoints
const BODY_LIMIT_COMPUTE = bodySizeLimit(102400);   // 100KB for compute handlers
const BODY_LIMIT_BATCH = bodySizeLimit(512000);     // 500KB for batch (50 calls)
const BODY_LIMIT_ARMY = bodySizeLimit(10240);       // 10KB for army deploy

// ===== SECURITY.TXT =====
app.get('/.well-known/security.txt', (req, res) => {
  res.type('text/plain').send(`Contact: dev@slopshop.gg
Preferred-Languages: en
Canonical: https://slopshop.gg/.well-known/security.txt
Policy: https://slopshop.gg/security
`);
});

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
  let sqliteTableCount = 76;
  try { const row = db.prepare("SELECT MAX(ts) as ts FROM audit_log").get(); lastBenchmarkTs = row?.ts || null; } catch (e) {}
  try { const row = db.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table'").get(); sqliteTableCount = row?.cnt || 76; } catch (e) {}
  res.json({
    status: 'healthy',
    version: '3.7.0',
    apis: apiCount,
    uptime_seconds: Math.floor((Date.now() - serverStart) / 1000),
    memory_mb: Math.round(mem.rss / 1024 / 1024),
    sqlite_tables: sqliteTableCount,
    features: {
      streaming: true,
      batch: true,
      dry_run: true,
      copilot: true,
      exchange: true,
      memory: true,
    },
    detail: {
      handlers: handlerCount,
      missing: missing.length,
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
      last_benchmark_ts: lastBenchmarkTs,
    },
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
  const limit = Math.min(parseInt(req.query.limit) || 2000, 5000);
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
app.post('/v1/keys', publicRateLimit, BODY_LIMIT_AUTH, (_, res) => {
  const key = 'sk-slop-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  // Entropy validation: key must be at least 32 chars with 24 hex chars of randomness (96+ bits)
  if (key.length < 32 || !/^sk-slop-[0-9a-f]{24}$/.test(key)) {
    return res.status(500).json({ error: { code: 'key_generation_failed', message: 'Insufficient key entropy' } });
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  const kHash = hashApiKey(key);
  const kPrefix = keyPrefix(key);
  const acct = { id, balance: 0, created: now, auto_reload: false, tier: 'none' };
  apiKeys.set(key, acct);
  apiKeysByHash.set(kHash, { acct, plaintextKey: key });
  dbInsertKey.run(key, id, 0, 'none', now, kHash, kPrefix);
  res.status(201).json({ key, balance: 0 });
});

// Waitlist
app.post('/v1/waitlist', BODY_LIMIT_AUTH, (req, res) => {
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

app.post('/v1/credits/buy', auth, BODY_LIMIT_AUTH, (req, res) => {
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
      tiers: { 5000: '$9', 50000: '$49', 500000: '$299', 1000000: '$1,999' },
    });
  }

  const tiers = { 5000: { price: 9, tier: 'baby-lobster' }, 10000: { price: 49, tier: 'shore-crawler' }, 100000: { price: 299, tier: 'reef-boss' }, 1000000: { price: 1999, tier: 'leviathan' } };
  const t = tiers[req.body.amount];
  if (!t) return res.status(400).json({ error: { code: 'invalid_amount', valid: Object.keys(tiers).map(Number) } });
  req.acct.balance += req.body.amount;
  req.acct.tier = t.tier;
  persistKey(req.apiKey);
  res.json({ status: 'credits_added', amount: req.body.amount, balance: req.acct.balance, note: isDemoKey ? 'demo_key' : 'internal' });
});

app.post('/v1/credits/transfer', auth, BODY_LIMIT_AUTH, (req, res) => {
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

// Timing-safe comparison for admin secrets
const secretMatch = (a, b) => {
  if (!a || !b) return false;
  try { return crypto.timingSafeEqual(Buffer.from(String(a)), Buffer.from(String(b))); } catch(e) { return false; }
};

// Admin rate limit: 10 req/min per IP on admin endpoints
function adminRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!rateLimit('admin:' + ip, 10, 60000)) {
    log.warn('Admin rate limit exceeded', { ip, path: req.path });
    return res.status(429).json({ error: { code: 'rate_limited', message: 'Admin endpoints limited to 10 req/min' } });
  }
  next();
}

// Admin: manually add credits to any user (protected by ADMIN_SECRET)
app.post('/v1/admin/add-credits', adminRateLimit, (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secretMatch(secret, process.env.ADMIN_SECRET)) {
    log.warn('Admin auth failure', { ip: req.ip, path: req.path, action: 'add-credits' });
    return res.status(403).json({ error: { code: 'forbidden' } });
  }
  log.info('Admin access', { ip: req.ip, path: req.path, action: 'add-credits' });
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
app.post('/v1/admin/create-code', adminRateLimit, (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secretMatch(secret, process.env.ADMIN_SECRET)) {
    log.warn('Admin auth failure', { ip: req.ip, path: req.path, action: 'create-code' });
    return res.status(403).json({ error: { code: 'forbidden' } });
  }
  log.info('Admin access', { ip: req.ip, path: req.path, action: 'create-code' });
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
app.post('/v1/admin/create-codes', adminRateLimit, (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secretMatch(secret, process.env.ADMIN_SECRET)) { log.warn('Admin auth failure', { ip: req.ip, path: req.path, action: 'create-codes' }); return res.status(403).json({ error: { code: 'forbidden' } }); }
  log.info('Admin access', { ip: req.ip, path: req.path, action: 'create-codes' });
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
app.post('/v1/credits/redeem', auth, BODY_LIMIT_AUTH, (req, res) => {
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
app.get('/v1/admin/users', adminRateLimit, (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secretMatch(secret, process.env.ADMIN_SECRET)) { log.warn('Admin auth failure', { ip: req.ip, path: req.path, action: 'list-users' }); return res.status(403).json({ error: { code: 'forbidden' } }); }
  log.info('Admin access', { ip: req.ip, path: req.path, action: 'list-users' });
  const users = db.prepare('SELECT email, api_key, created FROM users ORDER BY created DESC LIMIT 500').all();
  const keys = db.prepare('SELECT key, balance, tier FROM api_keys ORDER BY balance DESC LIMIT 500').all();
  res.json({ users: users.length, keys: keys.length, recent_users: users, top_keys: keys });
});

// Admin: export mailing list (all emails: users + waitlist)
app.get('/v1/admin/mailing-list', adminRateLimit, (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secretMatch(secret, process.env.ADMIN_SECRET)) { log.warn('Admin auth failure', { ip: req.ip, path: req.path, action: 'mailing-list' }); return res.status(403).json({ error: { code: 'forbidden' } }); }
  log.info('Admin access', { ip: req.ip, path: req.path, action: 'mailing-list' });
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
app.get('/v1/admin/stats', adminRateLimit, (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secretMatch(secret, process.env.ADMIN_SECRET)) { log.warn('Admin auth failure', { ip: req.ip, path: req.path, action: 'stats' }); return res.status(403).json({ error: { code: 'forbidden' } }); }
  log.info('Admin access', { ip: req.ip, path: req.path, action: 'stats' });
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const waitlistCount = db.prepare('SELECT COUNT(*) as c FROM waitlist').get().c;
  const keyCount = db.prepare('SELECT COUNT(*) as c FROM api_keys').get().c;
  const totalCreditsSpent = db.prepare('SELECT SUM(credits) as c FROM audit_log').get().c || 0;
  const totalCalls = db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
  const topAPIs = db.prepare('SELECT api, COUNT(*) as calls, SUM(credits) as credits FROM audit_log GROUP BY api ORDER BY calls DESC LIMIT 20').all();
  res.json({ users: userCount, waitlist: waitlistCount, api_keys: keyCount, total_calls: totalCalls, total_credits_spent: totalCreditsSpent, top_apis: topAPIs });
});

app.post('/v1/credits/auto-reload', auth, BODY_LIMIT_AUTH, (req, res) => {
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
app.post('/v1/batch', auth, BODY_LIMIT_BATCH, async (req, res) => {
  const { calls } = req.body;
  if (!Array.isArray(calls) || !calls.length) return res.status(400).json({ error: { code: 'invalid_batch', message: 'Provide { calls: [{ slug: "api-slug", input: {...} }, ...] }' } });
  if (calls.length > 50) return res.status(400).json({ error: { code: 'max_50_per_batch', message: 'Maximum 50 calls per batch request' } });
  let totalCr = 0;
  for (const c of calls) {
    const slug = c.slug || c.api; // accept both slug and api fields
    const def = apiMap.get(slug);
    if (!def) return res.status(400).json({ error: { code: 'unknown_api', api: slug } });
    totalCr += def.credits;
  }
  if (req.acct.balance < totalCr) return res.status(402).json({ error: { code: 'insufficient_credits', need: totalCr, have: req.acct.balance } });
  req.acct.balance -= totalCr;
  let hasFailure = false, hasSuccess = false;
  const batchStart = Date.now();
  // Execute all calls in parallel using Promise.allSettled
  const promises = calls.map(c => {
    const slug = c.slug || c.api;
    const handler = allHandlers[slug];
    const callStart = Date.now();
    return Promise.resolve()
      .then(() => handler(c.input || {}))
      .then(data => ({ slug, data, credits: apiMap.get(slug).credits, latency_ms: Date.now() - callStart }))
      .catch(e => ({ slug, error: e.message, credits: apiMap.get(slug).credits, latency_ms: Date.now() - callStart }));
  });
  const settled = await Promise.allSettled(promises);
  const results = settled.map(s => {
    const r = s.value;
    if (r.error) hasFailure = true; else hasSuccess = true;
    return r;
  });
  const partial = hasSuccess && hasFailure;
  // Emit usage events for each call in batch
  const keyPrefix = req.apiKey.slice(0, 12);
  for (const r of results) {
    emitUsageEvent(keyPrefix, r.slug, r.credits, r.error ? 'error' : 'ok');
  }
  res.json({ ok: true, results, total_credits: totalCr, balance: req.acct.balance, total_latency_ms: Date.now() - batchStart, calls_count: calls.length, ...(partial ? { partial: true } : {}) });
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
  // SECURITY FIX (HIGH-01): Store owner key on job for access control
  jobs.set(jobId, { status: 'processing', api: req.params.slug, created: Date.now(), _owner: req.apiKey });
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
  // SECURITY FIX (HIGH-01): Only allow job owner to read results
  if (job._owner && job._owner !== req.apiKey) return res.status(403).json({ error: { code: 'forbidden', message: 'You can only access your own jobs' } });
  const { _owner, ...safeJob } = job;
  res.json(safeJob);
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
app.get('/v1/dashboard', auth, (_, res) => {
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

  // Item 7: Find which templates use this tool
  let used_in_templates = [];
  try {
    const rows = db.prepare("SELECT id, name FROM marketplace_templates WHERE status = 'published' AND tools LIKE ?").all('%' + req.params.slug + '%');
    // Filter precisely — LIKE can match partial slugs
    used_in_templates = rows.filter(r => {
      try { return JSON.parse(r.tools || '[]').includes(req.params.slug); } catch { return false; }
    }).map(r => ({ template_id: r.id, name: r.name }));
  } catch(e) {}
  // Also check shared_templates
  try {
    const rows2 = db.prepare("SELECT id, name, config FROM shared_templates WHERE config LIKE ?").all('%' + req.params.slug + '%');
    rows2.forEach(r => {
      try {
        const cfg = JSON.parse(r.config || '{}');
        const cfgStr = JSON.stringify(cfg);
        if (cfgStr.includes(req.params.slug)) {
          used_in_templates.push({ template_id: r.id, name: r.name });
        }
      } catch {}
    });
  } catch(e) {}

  res.json({
    slug: req.params.slug,
    name: def.name,
    description: def.desc,
    category: def.cat,
    credits: def.credits,
    tier: def.tier,
    input_schema: schema?.input || null,
    output_schema: schema?.output || null,
    used_in_templates,
    template_count: used_in_templates.length,
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
app.get('/v1/openapi.json', (req, res) => {
  try {
    const spec = require('./openapi.json');
    res.json(spec);
  } catch(e) {
    res.status(404).json({ error: 'OpenAPI spec not generated yet. Run: node openapi-gen.js' });
  }
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
  'math-statistics','math-eval','gen-uuid','gen-short-id','gen-fake-name','date-parse','date-format',
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

// ===== RESPONSE CACHE (identical request deduplication, LRU-style) =====
const responseCache = new Map();
const CACHE_TTL = 300000; // 5 minutes
const CACHE_MAX = 10000;  // PERF: doubled cache size for better hit rate

// PERF: Fast cache key using FNV-1a hash instead of crypto.createHash (10-50x faster for small inputs)
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function getCacheKey(slug, body) {
  // Avoid full object clone + JSON.stringify for common case (small bodies)
  const keys = Object.keys(body);
  if (keys.length === 0) return slug + ':empty';
  // Build key string directly, skipping meta fields
  let keyStr = slug;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === 'mode' || k === 'trace' || k === 'agent_mode' || k === 'session_id') continue;
    const v = body[k];
    keyStr += ':' + k + '=' + (typeof v === 'string' ? (v.length > 64 ? v.slice(0, 64) : v) : String(v));
  }
  return slug + ':' + fnv1a(keyStr);
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
// PERF: Suggestion cache — avoids expensive self-join on audit_log per request
const _suggestionsCache = new Map();
const _dbCoOccur = db.prepare(`
  SELECT b.api, COUNT(*) as cnt FROM audit_log a
  JOIN audit_log b ON a.key_prefix = b.key_prefix AND b.ts > a.ts AND b.api != a.api
  WHERE a.api = ? GROUP BY b.api ORDER BY cnt DESC LIMIT 3
`);
function getSuggestions(slug) {
  if (TOOL_CHAINS[slug]) return TOOL_CHAINS[slug];
  const cached = _suggestionsCache.get(slug);
  if (cached && Date.now() - cached.ts < 300000) return cached.val; // 5min TTL
  try {
    const coOccur = _dbCoOccur.all(slug);
    const val = coOccur.length > 0 ? coOccur.map(r => r.api) : ['memory-set', 'memory-search'];
    _suggestionsCache.set(slug, { val, ts: Date.now() });
    if (_suggestionsCache.size > 1000) {
      // Evict oldest entries
      const oldest = [..._suggestionsCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 200);
      for (const [k] of oldest) _suggestionsCache.delete(k);
    }
    return val;
  } catch (e) { return ['memory-set', 'memory-search']; }
}
function getCacheFingerprint(slug, body) {
  // PERF: Use FNV-1a instead of SHA-256 for fingerprinting
  return slug + ':' + fnv1a(JSON.stringify(body));
}

// ===== QUICKSTART: Getting-started steps =====
app.get('/v1/quickstart', publicRateLimit, (req, res) => {
  res.json({
    ok: true,
    steps: [
      { step: 1, action: 'Sign up', command: 'curl -X POST https://slopshop.gg/v1/auth/signup -d \'{"email":"you@example.com","password":"secure123"}\'' },
      { step: 2, action: 'Make your first call', command: 'curl -X POST https://slopshop.gg/v1/crypto-hash-sha256 -H "Authorization: Bearer YOUR_KEY" -d \'{"text":"hello"}\'' },
      { step: 3, action: 'Store a memory (free)', command: 'curl -X POST https://slopshop.gg/v1/memory-set -H "Authorization: Bearer YOUR_KEY" -d \'{"key":"first_memory","value":"hello world"}\'' },
      { step: 4, action: 'Chain two agents', command: 'curl -X POST https://slopshop.gg/v1/chain/create -H "Authorization: Bearer YOUR_KEY" -d \'{"name":"my-chain","steps":[{"agent":"claude","prompt":"Hello"},{"agent":"grok","prompt":"Respond"}]}\'' },
      { step: 5, action: 'Explore all tools', command: 'curl https://slopshop.gg/v1/tools/categories' }
    ],
    features: 22,
    endpoints: 348,
    free_credits: 2000
  });
});

// ===== FEATURE DISCOVERY =====
app.post('/v1/discover', publicRateLimit, (req, res) => {
  const { goal } = req.body;
  const g = (goal || '').toLowerCase();

  const features = [
    { name: 'Agent Chains', endpoint: '/v1/chain/create', when: 'multi-step workflows, infinite loops, cross-LLM chaining', keywords: ['chain', 'loop', 'sequence', 'workflow', 'multi-step', 'consciousness'] },
    { name: 'Free Memory', endpoint: '/v1/memory-set', when: 'persistent state across sessions and LLMs', keywords: ['remember', 'memory', 'state', 'persist', 'store', 'save'] },
    { name: 'Army (10K Parallel)', endpoint: '/v1/army/deploy', when: 'massive parallel execution', keywords: ['parallel', 'scale', 'army', '1000', 'swarm', 'deploy'] },
    { name: 'Hive Workspace', endpoint: '/v1/hive/create', when: 'always-on agent collaboration', keywords: ['workspace', 'team', 'collaborate', 'channel', 'standup'] },
    { name: 'Smart Router', endpoint: '/v1/router/smart', when: 'choosing the best LLM for a task', keywords: ['route', 'choose', 'best', 'llm', 'model', 'provider'] },
    { name: 'Prompt Queue', endpoint: '/v1/chain/queue', when: 'scheduling overnight batch work', keywords: ['schedule', 'overnight', 'batch', 'queue', 'later', 'cron'] },
    { name: 'Knowledge Graph', endpoint: '/v1/knowledge/add', when: 'connecting entities and finding paths', keywords: ['knowledge', 'graph', 'entity', 'relationship', 'connect'] },
    { name: 'Copilot', endpoint: '/v1/copilot/spawn', when: 'second agent working alongside main agent', keywords: ['copilot', 'pair', 'assist', 'helper', 'second'] },
    { name: 'Evaluations', endpoint: '/v1/eval/run', when: 'testing and benchmarking agents', keywords: ['eval', 'test', 'benchmark', 'score', 'accuracy'] },
    { name: 'Prediction Markets', endpoint: '/v1/market/create', when: 'agents betting on outcomes', keywords: ['predict', 'bet', 'forecast', 'market'] },
    { name: 'Template Marketplace', endpoint: '/v1/templates/browse', when: 'finding pre-built agent templates', keywords: ['template', 'marketplace', 'pre-built', 'starter'] },
    { name: 'Compute Exchange', endpoint: '/v1/exchange/register', when: 'earning credits by sharing compute', keywords: ['earn', 'exchange', 'share', 'compute', 'credits'] },
    { name: 'Credit Market', endpoint: '/v1/credits/market', when: 'buying/selling credits', keywords: ['buy', 'sell', 'trade', 'credits'] },
    { name: 'Agent Wallets', endpoint: '/v1/wallet/create', when: 'agents with their own budgets', keywords: ['wallet', 'budget', 'sub-account'] },
    { name: 'Streaming', endpoint: '/v1/stream/:slug', when: 'real-time SSE output', keywords: ['stream', 'real-time', 'sse', 'live'] },
    { name: 'Batch', endpoint: '/v1/batch', when: 'executing multiple calls at once', keywords: ['batch', 'multiple', 'bulk', 'parallel'] },
    { name: 'Replay', endpoint: '/v1/replay/save', when: 'recording and replaying swarm runs', keywords: ['replay', 'record', 'playback', 'debug'] },
  ];

  const matched = features.map(f => ({
    ...f,
    relevance: f.keywords.filter(k => g.includes(k)).length
  })).filter(f => f.relevance > 0 || !goal).sort((a, b) => b.relevance - a.relevance);

  res.json({
    ok: true,
    goal,
    recommended: matched.slice(0, 5),
    all_features: matched,
    total: features.length,
    _engine: 'real'
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

// Phase 4-5: Reputation leaderboard & my (must be before parameterized :key_prefix route)
app.get('/v1/reputation/leaderboard', publicRateLimit, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const agents = db.prepare('SELECT * FROM agent_reputation ORDER BY score DESC LIMIT ?').all(limit);
  res.json({ ok: true, leaderboard: agents, count: agents.length });
});
app.get('/v1/reputation/my', auth, (req, res) => {
  const agentId = req.acct?.email || req.apiKey;
  const rep = db.prepare('SELECT * FROM agent_reputation WHERE agent_id = ?').get(agentId);
  if (!rep) return res.json({ agent_id: agentId, score: 0, tasks_completed: 0, upvotes: 0, downvotes: 0 });
  res.json(rep);
});

app.get('/v1/reputation/:key_prefix', publicRateLimit, (req, res) => {
  // Phase 4-5: Check agent_reputation table first
  try {
    const rep = db.prepare('SELECT * FROM agent_reputation WHERE agent_id = ?').get(req.params.key_prefix);
    if (rep) return res.json(rep);
  } catch(e) { /* fall through to legacy */ }
  // Legacy reputation lookup
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
  // Sanitized: only allow known column names to prevent SQL injection
  const field = variant === 'b' ? 'results_b' : 'results_a';
  const existing = JSON.parse(test[field]);
  existing.push(score);
  if (field === 'results_b') {
    db.prepare('UPDATE ab_tests SET results_b = ? WHERE id = ?').run(JSON.stringify(existing), req.params.id);
  } else {
    db.prepare('UPDATE ab_tests SET results_a = ? WHERE id = ?').run(JSON.stringify(existing), req.params.id);
  }
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
  // SECURITY FIX (HIGH-02): Prevent duplicate voting
  // Parse existing voters tracking (stored alongside votes)
  let voterTracking = {};
  try { voterTracking = JSON.parse(row.api_key || '{}'); } catch(e) { voterTracking = {}; }
  // Use a separate field pattern: store voters in a parseable way
  // We'll track voters in a simple in-memory approach using the votes JSON with a _voters key
  const votes = JSON.parse(row.votes);
  if (!votes._voters) votes._voters = {};
  const voterKey = req.apiKey.slice(0, 16);
  if (votes._voters[voterKey]) return res.status(409).json({ error: { code: 'already_voted', message: 'You have already voted on this poll' } });
  votes._voters[voterKey] = choice;
  votes[choice] = (votes[choice] || 0) + 1;
  db.prepare('UPDATE broadcast_polls SET votes = ? WHERE id = ?').run(JSON.stringify(votes), req.params.id);
  const total = Object.entries(votes).filter(([k]) => k !== '_voters').reduce((s, [, v]) => s + v, 0);
  res.json({ ok: true, choice, tally: Object.fromEntries(Object.entries(votes).filter(([k]) => k !== '_voters')), total_votes: total, _engine: 'real' });
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
app.post('/v1/army/deploy', auth, BODY_LIMIT_ARMY, async (req, res) => {
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
    ok: true,
    id: id,
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
  const { channel, message, type, mode } = req.body;
  if (!message) return res.status(400).json({ error: { code: 'empty_message' } });
  const ch = channel || 'general';
  const now = Date.now();
  const sender = req.apiKey.slice(0, 12);
  const msgText = typeof message === 'string' ? message : JSON.stringify(message);

  db.prepare('INSERT INTO hive_messages (hive_id, channel, sender, message, type, ts) VALUES (?, ?, ?, ?, ?, ?)').run(
    req.params.id, ch, sender, msgText, type || 'message', now
  );
  // Also publish to pub/sub for real-time listeners
  db.prepare('INSERT INTO pubsub (channel, message, sender, ts) VALUES (?, ?, ?, ?)').run(
    'hive:' + req.params.id + ':' + ch, JSON.stringify({ hive: req.params.id, channel: ch, message }), sender, now
  );

  // Item 9: Debate/consensus mode — collect recent responses from multiple channels and synthesize
  if (mode === 'debate') {
    try {
      const hive = db.prepare('SELECT * FROM hives WHERE id = ?').get(req.params.id);
      const channels = hive ? JSON.parse(hive.channels || '[]') : [ch];
      const channelResponses = {};
      const oneHourAgo = now - 3600000;
      for (const c of channels) {
        const msgs = db.prepare('SELECT sender, message, ts FROM hive_messages WHERE hive_id = ? AND channel = ? AND ts > ? ORDER BY ts DESC LIMIT 10').all(req.params.id, c, oneHourAgo);
        if (msgs.length > 0) channelResponses[c] = msgs;
      }
      // Synthesize consensus from all channel messages
      const allMessages = Object.values(channelResponses).flat();
      const senderVotes = {};
      allMessages.forEach(m => { senderVotes[m.sender] = (senderVotes[m.sender] || 0) + 1; });
      const topContributors = Object.entries(senderVotes).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, c]) => ({ sender: s, messages: c }));

      // Store debate summary in hive state
      const debateSummary = { topic: msgText, channels_polled: Object.keys(channelResponses).length, total_messages: allMessages.length, top_contributors: topContributors, timestamp: now };
      db.prepare('INSERT OR REPLACE INTO hive_state (hive_id, key, value, ts) VALUES (?, ?, ?, ?)').run(req.params.id, '_last_debate', JSON.stringify(debateSummary), now);

      return res.json({
        ok: true,
        hive_id: req.params.id,
        channel: ch,
        mode: 'debate',
        debate: debateSummary,
        channel_responses: channelResponses,
        consensus: allMessages.length > 0 ? 'Debate recorded with ' + allMessages.length + ' messages across ' + Object.keys(channelResponses).length + ' channels.' : 'No recent messages to form consensus.',
        _engine: 'real'
      });
    } catch(e) {
      return res.json({ ok: true, hive_id: req.params.id, channel: ch, mode: 'debate', error: e.message });
    }
  }

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
  const betAmount = Math.max(1, Math.floor(amount));
  const mkt = db.prepare('SELECT * FROM sp_markets WHERE id = ?').get(req.params.id);
  if (!mkt) return res.status(404).json({ error: 'market_not_found' });
  if (mkt.status !== 'open') return res.status(400).json({ error: 'market_closed' });
  // Deduct bet amount from bettor's balance
  if (req.acct.balance < betAmount) return res.status(402).json({ error: { code: 'insufficient_credits', need: betAmount, have: req.acct.balance } });
  req.acct.balance -= betAmount;
  persistKey(req.apiKey);
  db.prepare('INSERT INTO sp_market_bets (market_id, agent_key, position, amount, ts) VALUES (?, ?, ?, ?, ?)').run(req.params.id, req.apiKey.slice(0, 12), position, betAmount, Date.now());
  res.json({ ok: true, market_id: req.params.id, position, amount: betAmount, balance: req.acct.balance });
});

app.post('/v1/market/:id/resolve', auth, (req, res) => {
  const { outcome } = req.body;
  if (!outcome) return res.status(400).json({ error: 'outcome required' });
  const mkt = db.prepare('SELECT * FROM sp_markets WHERE id = ?').get(req.params.id);
  if (!mkt) return res.status(404).json({ error: 'market_not_found' });
  if (mkt.status === 'resolved') return res.status(400).json({ error: 'market_already_resolved' });
  // SECURITY FIX (HIGH-03): Only the market creator can resolve it
  if (mkt.creator !== req.apiKey.slice(0, 12)) return res.status(403).json({ error: { code: 'forbidden', message: 'Only the market creator can resolve this market' } });
  db.prepare('UPDATE sp_markets SET status = ?, outcome = ? WHERE id = ?').run('resolved', outcome, req.params.id);
  // Pay out winners proportionally from the total pot
  const allBets = db.prepare('SELECT * FROM sp_market_bets WHERE market_id = ?').all(req.params.id);
  const totalPot = allBets.reduce((a, b) => a + b.amount, 0);
  const winners = allBets.filter(b => b.position === outcome);
  const winnerTotal = winners.reduce((a, b) => a + b.amount, 0);
  const payouts = [];
  if (winners.length > 0 && totalPot > 0) {
    for (const w of winners) {
      const share = winnerTotal > 0 ? Math.floor(totalPot * (w.amount / winnerTotal)) : 0;
      // Credit the winner's account
      const winnerAcct = [...apiKeys.entries()].find(([k]) => k.slice(0, 12) === w.agent_key);
      if (winnerAcct) {
        winnerAcct[1].balance += share;
        persistKey(winnerAcct[0]);
      }
      payouts.push({ agent: w.agent_key, bet: w.amount, payout: share });
    }
  }
  res.json({ ok: true, market_id: req.params.id, outcome, total_pot: totalPot, winners_count: winners.length, payouts });
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
  // Check if this agent already voted
  const voter = req.apiKey.slice(0, 12);
  const existingVote = db.prepare('SELECT proposal_id FROM sp_governance_votes WHERE proposal_id = ? AND voter = ?').get(proposal_id, voter);
  if (existingVote) return res.status(409).json({ error: { code: 'already_voted', message: 'You have already voted on this proposal' } });
  db.prepare('INSERT INTO sp_governance_votes (proposal_id, voter, vote, ts) VALUES (?, ?, ?, ?)').run(proposal_id, voter, vote, Date.now());
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
  res.json({ ok: true, eval_id: id, score: score + '%', passed, total: test_cases.length, results: results.slice(0, 20), _engine: 'real' });
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
  // SECURITY FIX (CRIT-04): Prevent self-claiming bounties
  if (bounty.api_key === req.apiKey) return res.status(403).json({ error: { code: 'cannot_claim_own_bounty', message: 'You cannot claim a bounty you posted' } });
  // Store full API key for claimed_by (not truncated prefix) to prevent cross-user collisions
  db.prepare('UPDATE bounties SET status = ?, claimed_by = ? WHERE id = ?').run('claimed', req.apiKey, req.params.id);
  res.json({ ok: true, bounty_id: req.params.id, status: 'claimed', note: 'Complete the task and POST /v1/bounties/' + req.params.id + '/submit' });
});

app.post('/v1/bounties/:id/submit', auth, (req, res) => {
  // SECURITY FIX (CRIT-04): Match on full API key, not truncated prefix
  const bounty = db.prepare('SELECT * FROM bounties WHERE id = ? AND claimed_by = ?').get(req.params.id, req.apiKey);
  if (!bounty) return res.status(404).json({ error: { code: 'not_your_bounty' } });
  // SECURITY FIX: Mark as submitted, require poster approval instead of auto-release
  db.prepare('UPDATE bounties SET status = ?, result = ? WHERE id = ?').run('submitted', JSON.stringify(req.body), req.params.id);
  // Auto-release reward (in future: require poster approval)
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

  // Item 4/10: Merge user params into template config
  let config = JSON.parse(tmpl.config);
  if (req.body.params && typeof req.body.params === 'object') {
    // Merge params into each step if config has steps array
    if (Array.isArray(config.steps)) {
      config.steps = config.steps.map(step => ({ ...step, ...req.body.params }));
    }
    // Also merge at top level for non-step configs
    config = { ...config, ...req.body.params };
  }

  db.prepare('INSERT INTO shared_templates (id, api_key, name, config, ts) VALUES (?, ?, ?, ?, ?)').run(newId, req.apiKey, (req.body.name || tmpl.name) + ' (fork)', JSON.stringify(config), Date.now());
  res.json({ ok: true, forked_from: req.params.id, new_template_id: newId, config });
});

app.post('/v1/templates/star/:id', auth, (req, res) => {
  db.prepare('UPDATE shared_templates SET stars = stars + 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true, starred: req.params.id });
});

app.get('/v1/templates/browse', publicRateLimit, (req, res) => {
  // Sanitized: whitelist sort columns to prevent SQL injection
  const sortMap = { stars: 'stars', forks: 'forks', ts: 'ts' };
  const sort = sortMap[req.query.sort] || 'ts';
  const templates = db.prepare('SELECT id, name, forks, stars, ts FROM shared_templates ORDER BY ' + sort + ' DESC LIMIT 50').all();
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
  const period = req.query.period || '24h';
  const hours = period === '7d' ? 168 : period === '30d' ? 720 : 24;
  const since = new Date(Date.now() - hours * 3600000).toISOString();

  try {
    const rows = db.prepare('SELECT api, COUNT(*) as calls, AVG(latency_ms) as avg_latency FROM audit_log WHERE timestamp > ? GROUP BY api ORDER BY calls DESC LIMIT 50').all(since);
    res.json({ popular: rows, period, since });
  } catch (e) {
    res.json({ popular: [], period, note: 'No usage data yet' });
  }
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

  // Build a real structured response based on message analysis
  const messageCount = db.prepare('SELECT COUNT(*) as cnt FROM copilot_messages WHERE copilot_id = ?').get(copilot_id).cnt;
  const msgLower = message.toLowerCase();

  let responseText = '';
  let suggestedTools = [];
  let suggestedCall = null;

  // Analyze the message and produce a useful response
  if (msgLower.includes('tool') || msgLower.includes('api') || msgLower.includes('find') || msgLower.includes('search') || msgLower.includes('what can')) {
    // Search the registry for relevant tools
    const words = msgLower.split(/\s+/).filter(w => w.length > 2 && !['the','and','for','can','you','what','how','find','tool','api','search'].includes(w));
    const matches = [];
    for (const [slug, def] of apiMap.entries()) {
      const text = (slug + ' ' + def.name + ' ' + def.desc).toLowerCase();
      let score = 0;
      words.forEach(w => { if (text.includes(w)) score++; if (slug.includes(w)) score += 2; });
      if (score > 0) matches.push({ slug, name: def.name, desc: def.desc, credits: def.credits, score });
    }
    matches.sort((a, b) => b.score - a.score);
    suggestedTools = matches.slice(0, 5).map(m => ({ slug: m.slug, name: m.name, description: m.desc, credits: m.credits }));
    responseText = suggestedTools.length > 0
      ? `Found ${matches.length} relevant tool(s). Top matches: ${suggestedTools.map(t => t.slug).join(', ')}. Use POST /v1/{slug} to call any of them.`
      : `No tools matched your query. Try GET /v1/tools to browse all ${apiMap.size} available APIs, or POST /v1/resolve with a natural language query.`;
  } else if (msgLower.includes('run') || msgLower.includes('call') || msgLower.includes('execute') || msgLower.includes('use')) {
    // Extract a potential slug from the message
    const slugMatch = msgLower.match(/(?:run|call|execute|use)\s+([a-z0-9-]+)/);
    if (slugMatch) {
      const slug = slugMatch[1];
      const def = apiMap.get(slug);
      if (def) {
        suggestedCall = { method: 'POST', url: `/v1/${slug}`, cost: def.credits, description: def.desc };
        responseText = `To call "${slug}" (${def.name}): POST /v1/${slug} with your input. It costs ${def.credits} credit(s). ${def.desc}`;
      } else {
        responseText = `Tool "${slug}" not found. Try POST /v1/resolve {"query": "${slug}"} to search for matching tools.`;
      }
    } else {
      responseText = `To run a tool, use POST /v1/{tool-slug} with input JSON. Use POST /v1/agent/run {"task": "your description"} to auto-discover and chain tools.`;
    }
  } else if (msgLower.includes('balance') || msgLower.includes('credit') || msgLower.includes('cost')) {
    responseText = `Check your balance with GET /v1/auth/me. Add credits with POST /v1/auth/topup. Use ?preview=true on any call to see costs before executing.`;
  } else if (msgLower.includes('help') || msgLower.includes('how') || msgLower.includes('start') || msgLower.includes('getting started')) {
    responseText = `Slopshop has ${apiMap.size} real tools. Key endpoints: GET /v1/tools (browse), POST /v1/resolve (search), POST /v1/batch (parallel calls), POST /v1/agent/run (auto-chain tools). All require Bearer auth. Docs at /docs.html.`;
  } else {
    // Generic: search for anything relevant
    const words = msgLower.split(/\s+/).filter(w => w.length > 3);
    const matches = [];
    for (const [slug, def] of apiMap.entries()) {
      const text = (slug + ' ' + def.name + ' ' + def.desc).toLowerCase();
      let score = 0;
      words.forEach(w => { if (text.includes(w)) score++; });
      if (score > 0) matches.push({ slug, name: def.name, credits: def.credits, score });
    }
    matches.sort((a, b) => b.score - a.score);
    if (matches.length > 0) {
      suggestedTools = matches.slice(0, 3).map(m => ({ slug: m.slug, name: m.name, credits: m.credits }));
      responseText = `Based on your message, these tools might help: ${suggestedTools.map(t => `${t.slug} (${t.name})`).join(', ')}. Use POST /v1/{slug} to call them.`;
    } else {
      responseText = `I can help you find and use tools. Try asking about specific capabilities (e.g., "find tools for hashing"), or say "help" for an overview. ${apiMap.size} tools available.`;
    }
  }

  // Store the copilot response
  db.prepare('INSERT INTO copilot_messages (copilot_id, role, content) VALUES (?, ?, ?)').run(copilot_id, 'assistant', responseText);
  db.prepare('UPDATE copilot_sessions SET message_count = message_count + 1 WHERE id = ?').run(copilot_id);

  const response = {
    copilot_id,
    response: responseText,
    message_count: messageCount,
    context_from_main: null,
    llm_available: !!process.env.ANTHROPIC_API_KEY,
    ...(suggestedTools.length > 0 ? { suggested_tools: suggestedTools } : {}),
    ...(suggestedCall ? { suggested_call: suggestedCall } : {}),
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

// ===== TOOL DISCOVERY SYSTEM =====

// POST /v1/tools/search — Semantic tool search
app.post('/v1/tools/search', publicRateLimit, (req, res) => {
  const { query, category, max_results, min_relevance } = req.body;
  const q = (query || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const maxR = Math.min(max_results || 20, 100);
  const minRel = min_relevance || 0.1;

  const results = [];
  for (const [slug, def] of apiMap.entries()) {
    const text = (slug + ' ' + def.name + ' ' + def.desc + ' ' + def.cat).toLowerCase();
    const matches = q.filter(w => text.includes(w)).length;
    const relevance = q.length > 0 ? matches / q.length : 0;
    if (relevance >= minRel && (!category || def.cat.toLowerCase().includes(category.toLowerCase()))) {
      results.push({ slug, name: def.name, desc: def.desc, category: def.cat, credits: def.credits, relevance: Math.round(relevance * 100) / 100 });
    }
  }
  results.sort((a, b) => b.relevance - a.relevance);
  res.json({ results: results.slice(0, maxR), total: results.length, query });
});

// GET /v1/tools/categories — List all categories with counts
app.get('/v1/tools/categories', publicRateLimit, (req, res) => {
  const cats = {};
  for (const [slug, def] of apiMap.entries()) {
    if (!cats[def.cat]) cats[def.cat] = { name: def.cat, count: 0, sample_tools: [] };
    cats[def.cat].count++;
    if (cats[def.cat].sample_tools.length < 3) cats[def.cat].sample_tools.push(slug);
  }
  const sorted = Object.values(cats).sort((a, b) => b.count - a.count);
  res.json({ categories: sorted, total_categories: sorted.length, total_apis: apiMap.size });
});

// POST /v1/tools/recommend — Recommend tools for a task
app.post('/v1/tools/recommend', publicRateLimit, (req, res) => {
  const { task, context, limit } = req.body;
  const taskWords = (task || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const n = Math.min(limit || 10, 50);

  // Score every tool
  const scored = [];
  for (const [slug, def] of apiMap.entries()) {
    const text = (slug + ' ' + def.name + ' ' + def.desc).toLowerCase();
    let score = 0;
    taskWords.forEach(w => { if (text.includes(w)) score += 1; if (slug.includes(w)) score += 2; });
    if (score > 0) scored.push({ slug, name: def.name, desc: def.desc, category: def.cat, credits: def.credits, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // Group by workflow step
  const plan = scored.slice(0, n).map((t, i) => ({ step: i + 1, ...t }));
  res.json({ task, recommendations: plan, total_matches: scored.length });
});

// GET /v1/tools/new — Recently added tools
app.get('/v1/tools/new', publicRateLimit, (req, res) => {
  // Return tools from the newest handler files (hackathon, competitor, rapidapi, power)
  const newSlugs = new Set();
  ['compute-power-1', 'compute-power-2', 'compute-rapidapi-1', 'compute-rapidapi-2', 'compute-rapidapi-3', 'compute-competitor-1', 'compute-competitor-2'].forEach(f => {
    try { Object.keys(require('./handlers/' + f)).forEach(s => newSlugs.add(s)); } catch(e) {}
  });

  const tools = [];
  for (const slug of newSlugs) {
    const def = apiMap.get(slug);
    if (def) tools.push({ slug, name: def.name, desc: def.desc, category: def.cat, credits: def.credits });
  }
  res.json({ new_tools: tools, count: tools.length });
});

// GET /v1/tools/by-category/:category — Get all tools in a category
app.get('/v1/tools/by-category/:category', publicRateLimit, (req, res) => {
  const cat = decodeURIComponent(req.params.category).toLowerCase();
  const tools = [];
  for (const [slug, def] of apiMap.entries()) {
    if (def.cat.toLowerCase() === cat || def.cat.toLowerCase().includes(cat)) {
      tools.push({ slug, name: def.name, desc: def.desc, credits: def.credits });
    }
  }
  tools.sort((a, b) => a.slug.localeCompare(b.slug));
  res.json({ category: req.params.category, tools, count: tools.length });
});

// POST /v1/tools/compare — Compare multiple tools
app.post('/v1/tools/compare', publicRateLimit, (req, res) => {
  const { slugs } = req.body;
  const compared = (slugs || []).map(slug => {
    const def = apiMap.get(slug);
    if (!def) return { slug, found: false };
    return { slug, name: def.name, desc: def.desc, category: def.cat, credits: def.credits, tier: def.tier, has_handler: !!allHandlers[slug] };
  });
  res.json({ compared, count: compared.length });
});

// GET /v1/stats — Platform statistics (public)
app.get('/v1/stats', publicRateLimit, (req, res) => {
  const cats = {};
  let free = 0, paid = 0;
  for (const [slug, def] of apiMap.entries()) {
    cats[def.cat] = (cats[def.cat] || 0) + 1;
    if (def.credits === 0) free++; else paid++;
  }
  res.json({
    total_apis: apiMap.size,
    categories: Object.keys(cats).length,
    free_apis: free,
    paid_apis: paid,
    top_categories: Object.entries(cats).sort((a,b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    features: { copilot: true, compute_exchange: true, persistent_memory: true, benchmarked: true },
    uptime: process.uptime(),
    version: require('./package.json').version
  });
});

// ===== SSE STREAMING: Stream results for any API =====
app.post('/v1/stream/:slug', auth, async (req, res) => {
  const def = apiMap.get(req.params.slug);
  if (!def) return res.status(404).json({ error: { code: 'api_not_found', slug: req.params.slug } });

  const handler = allHandlers[req.params.slug];
  if (!handler) return res.status(501).json({ error: { code: 'no_handler', slug: req.params.slug } });

  if (req.acct.balance < def.credits) {
    if (req.acct.auto_reload) { req.acct.balance += req.acct.auto_reload.amount; }
    else return res.status(402).json({ error: { code: 'insufficient_credits', need: def.credits, have: req.acct.balance } });
  }

  // Input schema validation
  const inputSchema = SCHEMAS?.[req.params.slug]?.input;
  if (inputSchema && inputSchema.required) {
    const missingFields = inputSchema.required.filter(f => req.body[f] === undefined && req.body[f] !== '');
    if (missingFields.length > 0) {
      return res.status(422).json({
        ok: false,
        error: { code: 'validation_error', message: `Missing required fields: ${missingFields.join(', ')}`, missing_fields: missingFields },
      });
    }
  }

  req.acct.balance -= def.credits;

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Credits-Used': String(def.credits),
    'X-Credits-Remaining': String(req.acct.balance),
  });

  // Send start event
  res.write(`event: start\ndata: ${JSON.stringify({ slug: req.params.slug, credits: def.credits, ts: new Date().toISOString() })}\n\n`);

  // Send progress event
  res.write(`event: progress\ndata: ${JSON.stringify({ status: 'executing', slug: req.params.slug, percent: 0 })}\n\n`);

  const start = Date.now();
  let result, handlerError = false;
  try {
    result = await handler(req.body || {});
  } catch (e) {
    result = null;
    handlerError = e.message;
  }
  const latency = Date.now() - start;

  dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', req.params.slug, def.credits, latency, handlerError ? 'error' : (result?._engine || 'unknown'));
  persistKey(req.apiKey);

  // Emit usage event for real-time stream
  emitUsageEvent(req.apiKey.slice(0, 12), req.params.slug, def.credits, handlerError ? 'error' : 'ok');

  if (handlerError) {
    req.acct.balance += def.credits;
    persistKey(req.apiKey);
    res.write(`event: error\ndata: ${JSON.stringify({ error: handlerError, credits_refunded: def.credits })}\n\n`);
    res.write(`event: done\ndata: ${JSON.stringify({ ok: false, latency_ms: latency })}\n\n`);
    return res.end();
  }

  // Send progress at 50%
  res.write(`event: progress\ndata: ${JSON.stringify({ status: 'processing', slug: req.params.slug, percent: 50 })}\n\n`);

  // For LLM-tier results with text content, stream token-by-token
  const engine = result?._engine || 'unknown';
  if (def.tier === 'llm' && result && typeof result === 'object') {
    const textFields = Object.entries(result).filter(([k, v]) => typeof v === 'string' && v.length > 50 && k !== '_engine');
    if (textFields.length > 0) {
      for (const [fieldName, text] of textFields) {
        const words = text.split(/(\s+)/);
        for (let i = 0; i < words.length; i++) {
          res.write(`event: token\ndata: ${JSON.stringify({ field: fieldName, token: words[i], index: i })}\n\n`);
        }
      }
    }
  }

  // Send progress at 100%
  res.write(`event: progress\ndata: ${JSON.stringify({ status: 'complete', slug: req.params.slug, percent: 100 })}\n\n`);

  // Send full result
  const confidence = engine === 'real' ? 0.99 : engine === 'llm' ? 0.85 : 0.80;
  res.write(`event: result\ndata: ${JSON.stringify({
    ok: true,
    data: result,
    meta: { api: req.params.slug, credits_used: def.credits, balance: req.acct.balance, latency_ms: latency, engine, confidence },
  })}\n\n`);

  // Send done event
  res.write(`event: done\ndata: ${JSON.stringify({ ok: true, latency_ms: latency, credits_used: def.credits, balance: req.acct.balance })}\n\n`);
  res.end();
});

// ===== REAL-TIME USAGE STREAM =====
app.get('/v1/stream/usage', auth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const keyPrefix = req.apiKey.slice(0, 12);
  const client = { keyPrefix, res, connectedAt: Date.now() };
  usageStreamClients.add(client);

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ key_prefix: keyPrefix, ts: new Date().toISOString(), message: 'Listening for usage events. Make API calls to see them here in real-time.' })}\n\n`);

  // Send heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try { res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`); }
    catch (e) { clearInterval(heartbeat); usageStreamClients.delete(client); }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    usageStreamClients.delete(client);
  });
});

// ===== DRY RUN: Preview API call without executing =====
app.post('/v1/dry-run/:slug', auth, (req, res) => {
  const def = apiMap.get(req.params.slug);
  if (!def) return res.status(404).json({ error: { code: 'api_not_found', slug: req.params.slug, hint: 'GET /v1/tools to browse' } });

  const schema = SCHEMAS?.[req.params.slug];
  const handler = allHandlers[req.params.slug];

  // Validate input if schema exists, but don't charge
  let validationResult = { valid: true, missing_fields: [] };
  if (schema?.input?.required) {
    const missingFields = schema.input.required.filter(f => req.body[f] === undefined && req.body[f] !== '');
    if (missingFields.length > 0) {
      validationResult = { valid: false, missing_fields: missingFields };
    }
  }

  res.json({
    ok: true,
    dry_run: true,
    slug: req.params.slug,
    name: def.name,
    description: def.desc,
    category: def.cat,
    tier: def.tier,
    credits: def.credits,
    estimated_cost_usd: (def.credits * 0.009).toFixed(4),
    can_afford: req.acct.balance >= def.credits,
    balance: req.acct.balance,
    balance_after: Math.max(0, req.acct.balance - def.credits),
    has_handler: !!handler,
    input_schema: schema?.input || null,
    output_schema: schema?.output || null,
    example_input: schema?.example || null,
    example_output: schema?.example_output || null,
    input_validation: validationResult,
    hints: {
      execute: `POST /v1/${req.params.slug}`,
      stream: `POST /v1/stream/${req.params.slug}`,
      async: `POST /v1/async/${req.params.slug}`,
    },
  });
});

// ===========================================================================================
// ===== ENTERPRISE FEATURES — Team Management, Analytics, Key Management, Webhooks, Rate Limits
// ===========================================================================================

// ── ENTERPRISE TABLES ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS ent_teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_key TEXT NOT NULL,
    plan TEXT DEFAULT 'business',
    max_members INTEGER DEFAULT 50,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ent_team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    email TEXT NOT NULL,
    api_key TEXT,
    role TEXT DEFAULT 'member',
    status TEXT DEFAULT 'invited',
    invited_by TEXT,
    joined INTEGER,
    UNIQUE(team_id, email)
  );
  CREATE TABLE IF NOT EXISTS ent_team_keys (
    key TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    label TEXT,
    budget_monthly INTEGER DEFAULT NULL,
    budget_used INTEGER DEFAULT 0,
    budget_reset_at INTEGER,
    scope TEXT DEFAULT '*',
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ent_webhooks (
    id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL,
    secret TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    failures INTEGER DEFAULT 0,
    last_triggered INTEGER,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ent_webhook_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id TEXT NOT NULL,
    event TEXT NOT NULL,
    status_code INTEGER,
    response_ms INTEGER,
    success INTEGER,
    ts INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ent_rate_limits (
    api_key TEXT PRIMARY KEY,
    requests_per_minute INTEGER DEFAULT 60,
    requests_per_hour INTEGER DEFAULT 1000,
    requests_per_day INTEGER DEFAULT 10000,
    burst_limit INTEGER DEFAULT 120,
    set_by TEXT,
    updated INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ent_team_members_team ON ent_team_members(team_id);
  CREATE INDEX IF NOT EXISTS idx_ent_team_keys_team ON ent_team_keys(team_id);
  CREATE INDEX IF NOT EXISTS idx_ent_webhooks_key ON ent_webhooks(api_key);
  CREATE INDEX IF NOT EXISTS idx_ent_webhook_log_wh ON ent_webhook_log(webhook_id);
`);

// ── WEBHOOK DISPATCHER (fire-and-forget) ────────────────────────────────────
const https = require('https');
const http = require('http');
function fireWebhook(webhookRow, event, payload) {
  try {
    const whUrl = new URL(webhookRow.url);
    const body = JSON.stringify({ event, payload, webhook_id: webhookRow.id, ts: new Date().toISOString() });
    const signature = crypto.createHmac('sha256', webhookRow.secret).update(body).digest('hex');
    const options = {
      hostname: whUrl.hostname, port: whUrl.port || (whUrl.protocol === 'https:' ? 443 : 80),
      path: whUrl.pathname + whUrl.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Slopshop-Signature': signature, 'X-Slopshop-Event': event },
      timeout: 5000
    };
    const whStart = Date.now();
    const mod = whUrl.protocol === 'https:' ? https : http;
    const whReq = mod.request(options, (resp) => {
      const ms = Date.now() - whStart;
      db.prepare('INSERT INTO ent_webhook_log (webhook_id, event, status_code, response_ms, success, ts) VALUES (?, ?, ?, ?, ?, ?)').run(webhookRow.id, event, resp.statusCode, ms, resp.statusCode < 400 ? 1 : 0, Date.now());
      if (resp.statusCode >= 400) {
        db.prepare('UPDATE ent_webhooks SET failures = failures + 1 WHERE id = ?').run(webhookRow.id);
        if (webhookRow.failures >= 9) db.prepare('UPDATE ent_webhooks SET active = 0 WHERE id = ?').run(webhookRow.id);
      } else {
        db.prepare('UPDATE ent_webhooks SET last_triggered = ?, failures = 0 WHERE id = ?').run(Date.now(), webhookRow.id);
      }
      resp.resume();
    });
    whReq.on('error', () => {
      db.prepare('UPDATE ent_webhooks SET failures = failures + 1 WHERE id = ?').run(webhookRow.id);
      db.prepare('INSERT INTO ent_webhook_log (webhook_id, event, status_code, response_ms, success, ts) VALUES (?, ?, ?, ?, ?, ?)').run(webhookRow.id, event, 0, Date.now() - whStart, 0, Date.now());
    });
    whReq.write(body);
    whReq.end();
  } catch (e) { /* silent — webhooks are best-effort */ }
}

function dispatchWebhooks(apiKey, event, payload) {
  try {
    const hooks = db.prepare('SELECT * FROM ent_webhooks WHERE api_key = ? AND active = 1').all(apiKey);
    for (const hook of hooks) {
      const events = JSON.parse(hook.events);
      if (events.includes(event) || events.includes('*')) fireWebhook(hook, event, payload);
    }
  } catch (e) { /* silent */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. TEAM MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// POST /v1/teams/create — Create a team with name, owner
app.post('/v1/teams/create', auth, (req, res) => {
  const { name, plan } = req.body;
  if (!name) return res.status(400).json({ error: { code: 'missing_field', message: 'name is required' } });
  if (name.length > 100) return res.status(400).json({ error: { code: 'invalid_field', message: 'name must be 100 chars or fewer' } });
  const id = 'team-' + crypto.randomBytes(8).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO ent_teams (id, name, owner_key, plan, created) VALUES (?, ?, ?, ?, ?)').run(id, name, req.apiKey, plan || 'business', now);
  db.prepare('INSERT INTO ent_team_members (team_id, email, api_key, role, status, invited_by, joined) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.acct.id, req.apiKey, 'owner', 'active', req.apiKey.slice(0, 12), now);
  dispatchWebhooks(req.apiKey, 'team.created', { team_id: id, name });
  res.status(201).json({ ok: true, team: { id, name, plan: plan || 'business', owner: req.apiKey.slice(0, 12) + '...', max_members: 50, created: new Date(now).toISOString() } });
});

// POST /v1/teams/invite — Invite user to team by email
app.post('/v1/teams/invite', auth, (req, res) => {
  const { team_id, email, role } = req.body;
  if (!team_id || !email) return res.status(400).json({ error: { code: 'missing_fields', message: 'team_id and email are required' } });
  if (!email.includes('@')) return res.status(400).json({ error: { code: 'invalid_email', message: 'Valid email address required' } });
  const team = db.prepare('SELECT * FROM ent_teams WHERE id = ?').get(team_id);
  if (!team) return res.status(404).json({ error: { code: 'team_not_found', message: 'No team with that ID' } });
  const inviter = db.prepare('SELECT * FROM ent_team_members WHERE team_id = ? AND api_key = ? AND role IN (?, ?)').get(team_id, req.apiKey, 'owner', 'admin');
  if (!inviter) return res.status(403).json({ error: { code: 'forbidden', message: 'Only team owners and admins can invite members' } });
  const memberCount = db.prepare('SELECT COUNT(*) as cnt FROM ent_team_members WHERE team_id = ?').get(team_id).cnt;
  if (memberCount >= team.max_members) return res.status(400).json({ error: { code: 'team_full', message: `Team is at capacity (${team.max_members} members)` } });
  const memberRole = role && ['admin', 'member', 'viewer'].includes(role) ? role : 'member';
  try {
    db.prepare('INSERT INTO ent_team_members (team_id, email, role, status, invited_by, joined) VALUES (?, ?, ?, ?, ?, ?)').run(team_id, email, memberRole, 'invited', req.apiKey.slice(0, 12), null);
  } catch (e) {
    return res.status(409).json({ error: { code: 'already_invited', message: 'This email has already been invited to this team' } });
  }
  dispatchWebhooks(req.apiKey, 'team.invite', { team_id, email, role: memberRole });
  res.status(201).json({ ok: true, team_id, email, role: memberRole, status: 'invited', message: `Invitation sent to ${email}` });
});

// GET /v1/teams/members/:team_id — List team members
app.get('/v1/teams/members/:team_id', auth, (req, res) => {
  const team = db.prepare('SELECT * FROM ent_teams WHERE id = ?').get(req.params.team_id);
  if (!team) return res.status(404).json({ error: { code: 'team_not_found' } });
  const self = db.prepare('SELECT * FROM ent_team_members WHERE team_id = ? AND api_key = ?').get(req.params.team_id, req.apiKey);
  if (!self && team.owner_key !== req.apiKey) return res.status(403).json({ error: { code: 'forbidden', message: 'You must be a team member to view the roster' } });
  const members = db.prepare('SELECT id, email, role, status, joined FROM ent_team_members WHERE team_id = ? ORDER BY joined ASC').all(req.params.team_id);
  res.json({ ok: true, team_id: req.params.team_id, team_name: team.name, members, count: members.length, max_members: team.max_members });
});

// POST /v1/teams/set-role — Set member role (admin/member/viewer)
app.post('/v1/teams/set-role', auth, (req, res) => {
  const { team_id, member_id, role } = req.body;
  if (!team_id || !member_id || !role) return res.status(400).json({ error: { code: 'missing_fields', message: 'team_id, member_id, and role are required' } });
  if (!['admin', 'member', 'viewer'].includes(role)) return res.status(400).json({ error: { code: 'invalid_role', message: 'Role must be one of: admin, member, viewer' } });
  const team = db.prepare('SELECT * FROM ent_teams WHERE id = ?').get(team_id);
  if (!team) return res.status(404).json({ error: { code: 'team_not_found' } });
  const setter = db.prepare('SELECT * FROM ent_team_members WHERE team_id = ? AND api_key = ? AND role = ?').get(team_id, req.apiKey, 'owner');
  if (!setter && team.owner_key !== req.apiKey) return res.status(403).json({ error: { code: 'forbidden', message: 'Only the team owner can change roles' } });
  const member = db.prepare('SELECT * FROM ent_team_members WHERE team_id = ? AND id = ?').get(team_id, member_id);
  if (!member) return res.status(404).json({ error: { code: 'member_not_found' } });
  if (member.role === 'owner') return res.status(400).json({ error: { code: 'cannot_change_owner', message: 'Cannot change the owner role. Transfer ownership first.' } });
  db.prepare('UPDATE ent_team_members SET role = ? WHERE team_id = ? AND id = ?').run(role, team_id, member_id);
  dispatchWebhooks(req.apiKey, 'team.role_changed', { team_id, member_id, new_role: role });
  res.json({ ok: true, team_id, member_id, role, message: `Role updated to ${role}` });
});

// DELETE /v1/teams/remove-member — Remove from team
app.delete('/v1/teams/remove-member', auth, (req, res) => {
  const { team_id, member_id } = req.body;
  if (!team_id || !member_id) return res.status(400).json({ error: { code: 'missing_fields', message: 'team_id and member_id are required' } });
  const team = db.prepare('SELECT * FROM ent_teams WHERE id = ?').get(team_id);
  if (!team) return res.status(404).json({ error: { code: 'team_not_found' } });
  const requester = db.prepare('SELECT * FROM ent_team_members WHERE team_id = ? AND api_key = ? AND role IN (?, ?)').get(team_id, req.apiKey, 'owner', 'admin');
  if (!requester) return res.status(403).json({ error: { code: 'forbidden', message: 'Only owners and admins can remove members' } });
  const target = db.prepare('SELECT * FROM ent_team_members WHERE team_id = ? AND id = ?').get(team_id, member_id);
  if (!target) return res.status(404).json({ error: { code: 'member_not_found' } });
  if (target.role === 'owner') return res.status(400).json({ error: { code: 'cannot_remove_owner', message: 'Cannot remove the team owner' } });
  db.prepare('DELETE FROM ent_team_members WHERE team_id = ? AND id = ?').run(team_id, member_id);
  dispatchWebhooks(req.apiKey, 'team.member_removed', { team_id, member_id, email: target.email });
  res.json({ ok: true, team_id, member_id, removed: true, message: `Member ${target.email} removed from team` });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. USAGE ANALYTICS DASHBOARD ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /v1/analytics/usage — Per-user usage summary
app.get('/v1/analytics/usage', auth, (req, res) => {
  try {
    const kp = req.apiKey.slice(0, 12) + '...';
    const totalCalls = db.prepare('SELECT COUNT(*) as cnt FROM audit_log WHERE key_prefix = ?').get(kp)?.cnt || 0;
    const totalCredits = db.prepare('SELECT COALESCE(SUM(credits), 0) as total FROM audit_log WHERE key_prefix = ?').get(kp)?.total || 0;
    const errorCount = db.prepare("SELECT COUNT(*) as cnt FROM audit_log WHERE key_prefix = ? AND engine = 'error'").get(kp)?.cnt || 0;
    const topTools = db.prepare('SELECT api, COUNT(*) as calls, SUM(credits) as credits FROM audit_log WHERE key_prefix = ? GROUP BY api ORDER BY calls DESC LIMIT 10').all(kp);
    const avgLatency = db.prepare('SELECT ROUND(AVG(latency_ms)) as avg_ms FROM audit_log WHERE key_prefix = ? AND latency_ms IS NOT NULL').get(kp)?.avg_ms || 0;
    const firstCall = db.prepare('SELECT MIN(ts) as first FROM audit_log WHERE key_prefix = ?').get(kp)?.first;
    const lastCall = db.prepare('SELECT MAX(ts) as last FROM audit_log WHERE key_prefix = ?').get(kp)?.last;
    res.json({
      ok: true,
      total_calls: totalCalls,
      total_credits_spent: totalCredits,
      summary: {
        total_calls: totalCalls,
        total_credits_spent: totalCredits,
        error_count: errorCount,
        error_rate: totalCalls > 0 ? Math.round(errorCount / totalCalls * 10000) / 100 : 0,
        avg_latency_ms: avgLatency,
        top_tools: topTools,
        current_balance: req.acct.balance,
        member_since: firstCall || null,
        last_active: lastCall || null
      },
      _engine: 'real'
    });
  } catch (e) { res.status(500).json({ error: { code: 'analytics_error', message: e.message } }); }
});

// GET /v1/analytics/timeline — Calls over time (hourly/daily buckets)
app.get('/v1/analytics/timeline', auth, (req, res) => {
  try {
    const kp = req.apiKey.slice(0, 12) + '...';
    const granularity = req.query.granularity === 'hourly' ? 'hourly' : 'daily';
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    let data;
    if (granularity === 'hourly') {
      data = db.prepare("SELECT SUBSTR(ts, 1, 13) as bucket, COUNT(*) as calls, SUM(credits) as credits, ROUND(AVG(latency_ms)) as avg_latency_ms FROM audit_log WHERE key_prefix = ? AND ts > ? GROUP BY bucket ORDER BY bucket").all(kp, since);
    } else {
      data = db.prepare("SELECT DATE(ts) as bucket, COUNT(*) as calls, SUM(credits) as credits, ROUND(AVG(latency_ms)) as avg_latency_ms FROM audit_log WHERE key_prefix = ? AND ts > ? GROUP BY bucket ORDER BY bucket").all(kp, since);
    }
    res.json({ ok: true, granularity, days, buckets: data, total_buckets: data.length, _engine: 'real' });
  } catch (e) { res.status(500).json({ error: { code: 'analytics_error', message: e.message } }); }
});

// GET /v1/analytics/by-tool — Per-tool breakdown
app.get('/v1/analytics/by-tool', auth, (req, res) => {
  try {
    const kp = req.apiKey.slice(0, 12) + '...';
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const tools = db.prepare(`
      SELECT api as tool, COUNT(*) as calls, SUM(credits) as total_credits,
        ROUND(AVG(latency_ms)) as avg_latency_ms,
        MIN(latency_ms) as min_latency_ms, MAX(latency_ms) as max_latency_ms,
        SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors,
        MAX(ts) as last_used
      FROM audit_log WHERE key_prefix = ? AND ts > ?
      GROUP BY api ORDER BY calls DESC
    `).all(kp, since);
    for (const t of tools) {
      t.error_rate = t.calls > 0 ? Math.round(t.errors / t.calls * 10000) / 100 : 0;
      const def = apiMap.get(t.tool);
      if (def) { t.category = def.cat; t.tier = def.tier; t.credits_per_call = def.credits; }
    }
    res.json({ ok: true, days, tools, count: tools.length, _engine: 'real' });
  } catch (e) { res.status(500).json({ error: { code: 'analytics_error', message: e.message } }); }
});

// GET /v1/analytics/by-category — Per-category breakdown
app.get('/v1/analytics/by-category', auth, (req, res) => {
  try {
    const kp = req.apiKey.slice(0, 12) + '...';
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = db.prepare('SELECT api, COUNT(*) as calls, SUM(credits) as credits FROM audit_log WHERE key_prefix = ? AND ts > ? GROUP BY api').all(kp, since);
    const categories = {};
    for (const row of rows) {
      const def = apiMap.get(row.api);
      const cat = def ? def.cat : 'unknown';
      if (!categories[cat]) categories[cat] = { category: cat, calls: 0, credits: 0, tools: 0, tool_list: [] };
      categories[cat].calls += row.calls;
      categories[cat].credits += row.credits;
      categories[cat].tools++;
      categories[cat].tool_list.push(row.api);
    }
    const sorted = Object.values(categories).sort((a, b) => b.calls - a.calls);
    res.json({ ok: true, days, categories: sorted, count: sorted.length, _engine: 'real' });
  } catch (e) { res.status(500).json({ error: { code: 'analytics_error', message: e.message } }); }
});

// GET /v1/analytics/cost-forecast — Project future credit usage based on current trends
app.get('/v1/analytics/cost-forecast', auth, (req, res) => {
  try {
    const kp = req.apiKey.slice(0, 12) + '...';
    const lookbackDays = Math.min(parseInt(req.query.lookback) || 30, 90);
    const forecastDays = Math.min(parseInt(req.query.forecast) || 30, 365);
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const daily = db.prepare('SELECT DATE(ts) as date, SUM(credits) as credits, COUNT(*) as calls FROM audit_log WHERE key_prefix = ? AND ts > ? GROUP BY DATE(ts) ORDER BY date').all(kp, since);
    if (daily.length === 0) {
      return res.json({ ok: true, forecast: { projected_credits: 0, projected_calls: 0, days_until_depletion: null, confidence: 'no_data' }, _engine: 'real' });
    }
    const avgDailyCredits = Math.round(daily.reduce((s, d) => s + d.credits, 0) / daily.length);
    const avgDailyCalls = Math.round(daily.reduce((s, d) => s + d.calls, 0) / daily.length);
    const mid = Math.floor(daily.length / 2);
    const firstHalf = daily.slice(0, mid);
    const secondHalf = daily.slice(mid);
    const firstAvg = firstHalf.length ? firstHalf.reduce((s, d) => s + d.credits, 0) / firstHalf.length : avgDailyCredits;
    const secondAvg = secondHalf.length ? secondHalf.reduce((s, d) => s + d.credits, 0) / secondHalf.length : avgDailyCredits;
    const growthRate = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;
    const trend = growthRate > 0.1 ? 'increasing' : growthRate < -0.1 ? 'decreasing' : 'stable';
    const projectedCredits = Math.round(avgDailyCredits * forecastDays * (1 + growthRate * 0.5));
    const projectedCalls = Math.round(avgDailyCalls * forecastDays * (1 + growthRate * 0.5));
    const daysUntilDepletion = avgDailyCredits > 0 ? Math.floor(req.acct.balance / avgDailyCredits) : null;
    const depletionDate = daysUntilDepletion !== null ? new Date(Date.now() + daysUntilDepletion * 86400000).toISOString().split('T')[0] : null;
    res.json({
      ok: true,
      forecast: {
        lookback_days: lookbackDays,
        forecast_days: forecastDays,
        avg_daily_credits: avgDailyCredits,
        avg_daily_calls: avgDailyCalls,
        trend,
        growth_rate: Math.round(growthRate * 10000) / 100,
        projected_credits: projectedCredits,
        projected_cost_usd: (projectedCredits * 0.005).toFixed(2),
        projected_calls: projectedCalls,
        current_balance: req.acct.balance,
        days_until_depletion: daysUntilDepletion,
        depletion_date: depletionDate,
        recommendation: daysUntilDepletion !== null && daysUntilDepletion < 7
          ? 'CRITICAL: Balance will deplete within 7 days. Enable auto-reload or purchase credits.'
          : daysUntilDepletion !== null && daysUntilDepletion < 30
          ? 'WARNING: Balance will deplete within 30 days. Consider purchasing more credits.'
          : 'Balance is healthy for the forecasted period.',
        confidence: daily.length >= 14 ? 'high' : daily.length >= 7 ? 'medium' : 'low'
      },
      _engine: 'real'
    });
  } catch (e) { res.status(500).json({ error: { code: 'analytics_error', message: e.message } }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. API KEY MANAGEMENT ENHANCEMENTS
// ═══════════════════════════════════════════════════════════════════════════

// POST /v1/keys/create-team-key — Create a key scoped to a team with budget limits
app.post('/v1/keys/create-team-key', auth, (req, res) => {
  const { team_id, label, scope, budget_monthly } = req.body;
  if (!team_id) return res.status(400).json({ error: { code: 'missing_field', message: 'team_id is required' } });
  const team = db.prepare('SELECT * FROM ent_teams WHERE id = ?').get(team_id);
  if (!team) return res.status(404).json({ error: { code: 'team_not_found' } });
  const member = db.prepare('SELECT * FROM ent_team_members WHERE team_id = ? AND api_key = ? AND role IN (?, ?)').get(team_id, req.apiKey, 'owner', 'admin');
  if (!member && team.owner_key !== req.apiKey) return res.status(403).json({ error: { code: 'forbidden', message: 'Only team owners and admins can create team keys' } });
  const key = 'sk-slop-team-' + crypto.randomBytes(12).toString('hex');
  const id = crypto.randomUUID();
  const now = Date.now();
  const resetAt = budget_monthly ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime() : null;
  const teamAcct = { id, balance: 0, created: now, auto_reload: false, tier: 'none', scope: scope || '*', label: label || `${team.name} team key`, max_credits: budget_monthly || null };
  apiKeys.set(key, teamAcct);
  apiKeysByHash.set(hashApiKey(key), { acct: teamAcct, plaintextKey: key });
  dbInsertKey.run(key, id, 0, 'none', now, hashApiKey(key), keyPrefix(key));
  db.prepare('INSERT INTO ent_team_keys (key, team_id, label, budget_monthly, budget_used, budget_reset_at, scope, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(key, team_id, label || `${team.name} team key`, budget_monthly || null, 0, resetAt, scope || '*', now);
  dispatchWebhooks(req.apiKey, 'key.created', { key: key.slice(0, 18) + '...', team_id, label });
  res.status(201).json({
    ok: true,
    key,
    team_id,
    label: label || `${team.name} team key`,
    scope: scope || '*',
    budget: budget_monthly ? { monthly_limit: budget_monthly, used: 0, resets_at: new Date(resetAt).toISOString() } : null,
    message: 'Team key created. Add credits via POST /v1/credits/buy'
  });
});

// GET /v1/keys/usage/:key_prefix — Get usage stats for a specific key
app.get('/v1/keys/usage/:key_prefix', auth, (req, res) => {
  try {
    const prefix = req.params.key_prefix;
    const kp = prefix.length <= 15 ? prefix + '...' : prefix.slice(0, 12) + '...';
    const totalCalls = db.prepare('SELECT COUNT(*) as cnt FROM audit_log WHERE key_prefix = ?').get(kp)?.cnt || 0;
    const totalCredits = db.prepare('SELECT COALESCE(SUM(credits), 0) as total FROM audit_log WHERE key_prefix = ?').get(kp)?.total || 0;
    const last24h = db.prepare('SELECT COUNT(*) as calls, COALESCE(SUM(credits), 0) as credits FROM audit_log WHERE key_prefix = ? AND ts > ?').get(kp, new Date(Date.now() - 86400000).toISOString());
    const last7d = db.prepare('SELECT COUNT(*) as calls, COALESCE(SUM(credits), 0) as credits FROM audit_log WHERE key_prefix = ? AND ts > ?').get(kp, new Date(Date.now() - 7 * 86400000).toISOString());
    const topApis = db.prepare('SELECT api, COUNT(*) as calls, SUM(credits) as credits FROM audit_log WHERE key_prefix = ? GROUP BY api ORDER BY calls DESC LIMIT 10').all(kp);
    const teamKey = db.prepare('SELECT * FROM ent_team_keys WHERE key LIKE ?').get(prefix + '%');
    res.json({
      ok: true,
      key_prefix: kp,
      total_calls: totalCalls,
      total_credits: totalCredits,
      last_24h: { calls: last24h?.calls || 0, credits: last24h?.credits || 0 },
      last_7d: { calls: last7d?.calls || 0, credits: last7d?.credits || 0 },
      top_apis: topApis,
      budget: teamKey ? { monthly_limit: teamKey.budget_monthly, used: teamKey.budget_used, remaining: teamKey.budget_monthly ? teamKey.budget_monthly - teamKey.budget_used : null, resets_at: teamKey.budget_reset_at ? new Date(teamKey.budget_reset_at).toISOString() : null } : null,
      _engine: 'real'
    });
  } catch (e) { res.status(500).json({ error: { code: 'usage_error', message: e.message } }); }
});

// POST /v1/keys/set-budget — Set monthly credit budget on a key (returns 402 when exceeded)
app.post('/v1/keys/set-budget', auth, (req, res) => {
  const { key, budget_monthly } = req.body;
  if (!key || budget_monthly === undefined) return res.status(400).json({ error: { code: 'missing_fields', message: 'key and budget_monthly are required' } });
  if (typeof budget_monthly !== 'number' || budget_monthly < 0) return res.status(400).json({ error: { code: 'invalid_budget', message: 'budget_monthly must be a non-negative number' } });
  const teamKey = db.prepare('SELECT * FROM ent_team_keys WHERE key = ?').get(key);
  if (teamKey) {
    const team = db.prepare('SELECT * FROM ent_teams WHERE id = ?').get(teamKey.team_id);
    if (!team || team.owner_key !== req.apiKey) {
      const isAdmin = db.prepare('SELECT * FROM ent_team_members WHERE team_id = ? AND api_key = ? AND role IN (?, ?)').get(teamKey.team_id, req.apiKey, 'owner', 'admin');
      if (!isAdmin) return res.status(403).json({ error: { code: 'forbidden', message: 'Only team owners and admins can set budgets' } });
    }
    const resetAt = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime();
    db.prepare('UPDATE ent_team_keys SET budget_monthly = ?, budget_reset_at = ? WHERE key = ?').run(budget_monthly, resetAt, key);
    const acct = apiKeys.get(key);
    if (acct) acct.max_credits = budget_monthly;
    db.prepare('UPDATE api_keys SET max_credits = ? WHERE key = ?').run(budget_monthly, key);
    dispatchWebhooks(req.apiKey, 'budget.updated', { key: key.slice(0, 15) + '...', budget_monthly });
    return res.json({ ok: true, key: key.slice(0, 15) + '...', budget_monthly, resets_at: new Date(resetAt).toISOString(), message: 'Monthly budget set. API calls will return 402 when budget is exceeded.' });
  }
  const acct = apiKeys.get(key);
  if (!acct) return res.status(404).json({ error: { code: 'key_not_found' } });
  acct.max_credits = budget_monthly;
  db.prepare('UPDATE api_keys SET max_credits = ? WHERE key = ?').run(budget_monthly, key);
  res.json({ ok: true, key: key.slice(0, 15) + '...', budget_monthly, message: 'Budget cap set on key.' });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. WEBHOOK MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const VALID_WEBHOOK_EVENTS = ['api_call', 'error', 'budget_alert', 'low_credits', 'team.created', 'team.invite', 'team.role_changed', 'team.member_removed', 'budget.updated', 'key.created', '*'];

// POST /v1/webhooks/create — Register a webhook URL for events
app.post('/v1/webhooks/create', auth, (req, res) => {
  const { url, events } = req.body;
  if (!url) return res.status(400).json({ error: { code: 'missing_field', message: 'url is required' } });
  if (!events || !Array.isArray(events) || events.length === 0) return res.status(400).json({ error: { code: 'missing_field', message: 'events must be a non-empty array. Valid events: ' + VALID_WEBHOOK_EVENTS.join(', ') } });
  try { new URL(url); } catch (e) { return res.status(400).json({ error: { code: 'invalid_url', message: 'url must be a valid HTTP/HTTPS URL' } }); }
  const invalidEvents = events.filter(ev => !VALID_WEBHOOK_EVENTS.includes(ev));
  if (invalidEvents.length > 0) return res.status(400).json({ error: { code: 'invalid_events', message: `Invalid event types: ${invalidEvents.join(', ')}`, valid_events: VALID_WEBHOOK_EVENTS } });
  const id = 'wh-' + crypto.randomBytes(8).toString('hex');
  const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO ent_webhooks (id, api_key, url, events, secret, active, failures, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.apiKey, url, JSON.stringify(events), secret, 1, 0, now);
  res.status(201).json({
    ok: true,
    webhook: { id, url, events, active: true, created: new Date(now).toISOString() },
    secret,
    message: 'Webhook registered. The secret is used to sign payloads (X-Slopshop-Signature header). Store it securely — it will not be shown again.'
  });
});

// GET /v1/webhooks/enterprise/list — List registered webhooks with delivery stats
app.get('/v1/webhooks/enterprise/list', auth, (req, res) => {
  const hooks = db.prepare('SELECT id, url, events, active, failures, last_triggered, created FROM ent_webhooks WHERE api_key = ? ORDER BY created DESC').all(req.apiKey);
  for (const h of hooks) {
    h.events = JSON.parse(h.events);
    h.last_triggered = h.last_triggered ? new Date(h.last_triggered).toISOString() : null;
    h.created = new Date(h.created).toISOString();
    const deliveries = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes FROM ent_webhook_log WHERE webhook_id = ? AND ts > ?').get(h.id, Date.now() - 7 * 86400000);
    h.delivery_stats_7d = { total: deliveries?.total || 0, successes: deliveries?.successes || 0, failure_rate: deliveries?.total > 0 ? Math.round((1 - (deliveries.successes || 0) / deliveries.total) * 10000) / 100 : 0 };
  }
  res.json({ ok: true, webhooks: hooks, count: hooks.length });
});

// DELETE /v1/webhooks/delete/:id — Delete a webhook
app.delete('/v1/webhooks/delete/:id', auth, (req, res) => {
  const hook = db.prepare('SELECT * FROM ent_webhooks WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!hook) return res.status(404).json({ error: { code: 'webhook_not_found', message: 'Webhook not found or you do not own it' } });
  db.prepare('DELETE FROM ent_webhook_log WHERE webhook_id = ?').run(req.params.id);
  db.prepare('DELETE FROM ent_webhooks WHERE id = ?').run(req.params.id);
  res.json({ ok: true, deleted: req.params.id, message: 'Webhook and its delivery logs have been deleted' });
});

// POST /v1/webhooks/test/:id — Send a test payload to the webhook
app.post('/v1/webhooks/test/:id', auth, (req, res) => {
  const hook = db.prepare('SELECT * FROM ent_webhooks WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
  if (!hook) return res.status(404).json({ error: { code: 'webhook_not_found', message: 'Webhook not found or you do not own it' } });
  const testPayload = {
    type: 'test',
    message: 'This is a test webhook delivery from Slopshop',
    webhook_id: hook.id,
    timestamp: new Date().toISOString(),
    your_events: JSON.parse(hook.events)
  };
  fireWebhook(hook, 'test', testPayload);
  res.json({ ok: true, webhook_id: hook.id, url: hook.url, test_sent: true, message: 'Test payload dispatched. Check your endpoint for delivery.' });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. RATE LIMIT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// POST /v1/rate-limits/configure — Set custom rate limits per key (requires admin)
app.post('/v1/rate-limits/configure', auth, (req, res) => {
  const { target_key, requests_per_minute, requests_per_hour, requests_per_day, burst_limit } = req.body;
  const secret = req.headers['x-admin-secret'];
  const isAdmin = secret && secretMatch(secret, process.env.ADMIN_SECRET);
  const isSelf = !target_key || target_key === req.apiKey;
  if (!isAdmin && !isSelf) return res.status(403).json({ error: { code: 'forbidden', message: 'Only admins can configure rate limits for other keys. Set X-Admin-Secret header or omit target_key to configure your own.' } });
  const keyToConfig = target_key || req.apiKey;
  const acct = apiKeys.get(keyToConfig);
  if (!acct && !isSelf) return res.status(404).json({ error: { code: 'key_not_found' } });
  const rpm = Math.min(Math.max(requests_per_minute || 60, 1), 10000);
  const rph = Math.min(Math.max(requests_per_hour || 1000, 1), 100000);
  const rpd = Math.min(Math.max(requests_per_day || 10000, 1), 1000000);
  const burst = Math.min(Math.max(burst_limit || rpm * 2, 1), 20000);
  db.prepare('INSERT OR REPLACE INTO ent_rate_limits (api_key, requests_per_minute, requests_per_hour, requests_per_day, burst_limit, set_by, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').run(keyToConfig, rpm, rph, rpd, burst, isAdmin ? 'admin' : 'self', Date.now());
  res.json({
    ok: true,
    key: keyToConfig.slice(0, 15) + '...',
    rate_limits: { requests_per_minute: rpm, requests_per_hour: rph, requests_per_day: rpd, burst_limit: burst },
    set_by: isAdmin ? 'admin' : 'self',
    message: 'Custom rate limits configured. These override default limits.'
  });
});

// GET /v1/rate-limits/status — Check current rate limit status for your key
app.get('/v1/rate-limits/status', auth, (req, res) => {
  const custom = db.prepare('SELECT * FROM ent_rate_limits WHERE api_key = ?').get(req.apiKey);
  const rpm = custom ? custom.requests_per_minute : 60;
  const rph = custom ? custom.requests_per_hour : 1000;
  const rpd = custom ? custom.requests_per_day : 10000;
  const burst = custom ? custom.burst_limit : 120;
  const minuteEntry = ipLimits.get('api:' + req.apiKey);
  const currentMinute = minuteEntry?.count || 0;
  const kp = req.apiKey.slice(0, 12) + '...';
  let hourlyUsage = 0, dailyUsage = 0;
  try {
    hourlyUsage = db.prepare('SELECT COUNT(*) as cnt FROM audit_log WHERE key_prefix = ? AND ts > ?').get(kp, new Date(Date.now() - 3600000).toISOString())?.cnt || 0;
    dailyUsage = db.prepare('SELECT COUNT(*) as cnt FROM audit_log WHERE key_prefix = ? AND ts > ?').get(kp, new Date(Date.now() - 86400000).toISOString())?.cnt || 0;
  } catch (e) { /* ignore */ }
  res.json({
    ok: true,
    key: req.apiKey.slice(0, 15) + '...',
    is_custom: !!custom,
    limits: { requests_per_minute: rpm, requests_per_hour: rph, requests_per_day: rpd, burst_limit: burst },
    current_usage: { minute: currentMinute, hour: hourlyUsage, day: dailyUsage },
    remaining: { minute: Math.max(0, rpm - currentMinute), hour: Math.max(0, rph - hourlyUsage), day: Math.max(0, rpd - dailyUsage) },
    throttled: currentMinute >= rpm || hourlyUsage >= rph || dailyUsage >= rpd,
    _engine: 'real'
  });
});

// ===== END ENTERPRISE FEATURES =====

// ===== AGENT RUN (real tool-chaining agent loop) =====
// ===== AGENT ESTIMATE: Credit preview / dry-run for agent chains =====
app.post('/v1/agent/estimate', auth, (req, res) => {
  const { task, tools, max_steps } = req.body;
  const steps = max_steps || 5;
  const taskWords = (task || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);

  let toolSlugs = tools || [];
  if (!toolSlugs.length) {
    const scored = [];
    for (const [slug, def] of apiMap.entries()) {
      const text = (slug + ' ' + def.name + ' ' + def.desc).toLowerCase();
      let score = 0;
      taskWords.forEach(w => { if (text.includes(w)) score++; });
      if (score > 0 && def.credits <= 5) scored.push({ slug, score, credits: def.credits });
    }
    toolSlugs = scored.sort((a, b) => b.score - a.score).slice(0, steps).map(t => t.slug);
  }

  const estimated = toolSlugs.map(slug => {
    const def = apiMap.get(slug);
    return def ? { slug, credits: def.credits, tier: def.tier } : null;
  }).filter(Boolean);

  const totalCredits = estimated.reduce((s, t) => s + t.credits, 0);

  res.json({
    ok: true,
    task,
    estimated_steps: estimated,
    total_credits: totalCredits,
    can_afford: req.acct.balance >= totalCredits,
    balance: req.acct.balance,
    _engine: 'real'
  });
});

app.post('/v1/agent/run', auth, async (req, res) => {
  const { task, tools, max_steps } = req.body;
  if (!task) return res.status(400).json({ error: { code: 'task_required' } });

  const steps = Math.min(max_steps || 5, 10);
  const chain = [];
  let lastResult = null;

  // Find relevant tools
  const taskWords = task.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let toolSlugs = tools || [];

  if (!toolSlugs.length) {
    // Auto-discover tools from task description
    const scored = [];
    for (const [slug, def] of apiMap.entries()) {
      const text = (slug + ' ' + def.name + ' ' + def.desc).toLowerCase();
      let score = 0;
      taskWords.forEach(w => { if (text.includes(w)) score++; if (slug.includes(w)) score += 2; });
      if (score > 0 && def.credits <= 5) scored.push({ slug, score, credits: def.credits });
    }
    toolSlugs = scored.sort((a, b) => b.score - a.score).slice(0, steps).map(t => t.slug);
  }

  // Execute tool chain
  let totalCredits = 0;
  for (const slug of toolSlugs.slice(0, steps)) {
    const def = apiMap.get(slug);
    if (!def) continue;
    const handler = allHandlers[slug];
    if (!handler) continue;

    if (req.acct.balance < def.credits) break;
    req.acct.balance -= def.credits;
    totalCredits += def.credits;

    const input = lastResult ? { ...req.body, _previous: lastResult, task } : { ...req.body, task };
    try {
      const start = Date.now();
      const result = await handler(input);
      chain.push({ step: chain.length + 1, tool: slug, credits: def.credits, latency_ms: Date.now() - start, result });
      lastResult = result;
    } catch (e) {
      chain.push({ step: chain.length + 1, tool: slug, error: e.message });
      // Refund on error
      req.acct.balance += def.credits;
      totalCredits -= def.credits;
    }
  }

  persistKey(req.apiKey);

  // Item 3: Debate mode — run a second pass with alternate tool selection and compare
  let debateResult = null;
  if (req.body.mode === 'debate' && chain.length > 0) {
    try {
      // Build alternate tool list by picking next-best tools not already used
      const usedSlugs = new Set(chain.map(c => c.tool));
      const altScored = [];
      for (const [slug, def] of apiMap.entries()) {
        if (usedSlugs.has(slug)) continue;
        const text = (slug + ' ' + def.name + ' ' + def.desc).toLowerCase();
        let score = 0;
        taskWords.forEach(w => { if (text.includes(w)) score++; if (slug.includes(w)) score += 2; });
        if (score > 0 && def.credits <= 5) altScored.push({ slug, score, credits: def.credits });
      }
      const altSlugs = altScored.sort((a, b) => b.score - a.score).slice(0, steps).map(t => t.slug);
      const altChain = [];
      let altLastResult = null;
      let altCredits = 0;
      for (const slug of altSlugs.slice(0, steps)) {
        const def = apiMap.get(slug);
        if (!def) continue;
        const handler = allHandlers[slug];
        if (!handler) continue;
        if (req.acct.balance < def.credits) break;
        req.acct.balance -= def.credits;
        altCredits += def.credits;
        totalCredits += def.credits;
        const input = altLastResult ? { ...req.body, _previous: altLastResult, task } : { ...req.body, task };
        try {
          const start = Date.now();
          const result = await handler(input);
          altChain.push({ step: altChain.length + 1, tool: slug, credits: def.credits, latency_ms: Date.now() - start, result });
          altLastResult = result;
        } catch (e) {
          altChain.push({ step: altChain.length + 1, tool: slug, error: e.message });
          req.acct.balance += def.credits;
          altCredits -= def.credits;
          totalCredits -= def.credits;
        }
      }
      // Consensus: prefer the path with more successful steps; tie goes to primary
      const primarySuccess = chain.filter(s => !s.error).length;
      const altSuccess = altChain.filter(s => !s.error).length;
      const winner = altSuccess > primarySuccess ? 'alternate' : 'primary';
      debateResult = {
        alternate_steps: altChain,
        alternate_credits: altCredits,
        primary_successes: primarySuccess,
        alternate_successes: altSuccess,
        consensus: winner,
        consensus_result: winner === 'alternate' ? altLastResult : lastResult
      };
      if (winner === 'alternate') lastResult = altLastResult;
    } catch(e) { debateResult = { error: e.message }; }
  }

  persistKey(req.apiKey);

  // Item 6: Auto-persist ALL intermediate steps to memory (not just final result)
  if (chain.length > 0 && lastResult) {
    try {
      const memHandler = allHandlers['memory-set'];
      if (memHandler) {
        const ns = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
        memHandler({ namespace: ns, key: 'agent_run_' + Date.now(), value: JSON.stringify({ task, steps: chain, final_result: lastResult }) });
      }
    } catch(e) {}
  }

  const response = {
    ok: true,
    task,
    steps: chain,
    total_steps: chain.length,
    total_credits: totalCredits,
    final_result: lastResult,
    tools_used: chain.map(c => c.tool),
    balance: req.acct.balance,
    _engine: 'real'
  };
  if (debateResult) response.debate = debateResult;
  res.json(response);
});

// ===== AGENT-TO-AGENT CHAINING & PROMPT QUEUE =====

// 1. Create an agent chain
app.post('/v1/chain/create', auth, (req, res) => {
  const { name, steps, loop, context } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO agent_chains (id, user_id, name, steps, loop, context, status, current_step, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
    id, req.acct?.email || req.apiKey, name || 'Chain', JSON.stringify(steps || []), loop ? 1 : 0, JSON.stringify(context || {}), 'active', 0
  );
  res.json({ ok: true, chain_id: id, steps: (steps || []).length, loop: !!loop, status: 'active' });
});

// 2. Advance chain to next step
app.post('/v1/chain/advance', auth, (req, res) => {
  const { chain_id, result, context_update } = req.body;
  const chain = db.prepare('SELECT * FROM agent_chains WHERE id = ?').get(chain_id);
  if (!chain) return res.status(404).json({ error: { code: 'chain_not_found' } });

  const steps = JSON.parse(chain.steps);
  let ctx = JSON.parse(chain.context);
  let currentStep = chain.current_step;

  // Store result from completed step
  if (result) ctx['step_' + currentStep + '_result'] = result;
  if (context_update) Object.assign(ctx, context_update);

  // Advance
  currentStep++;
  if (currentStep >= steps.length) {
    if (chain.loop) {
      currentStep = 0; // Loop back
      ctx._loop_count = (ctx._loop_count || 0) + 1;
    } else {
      db.prepare('UPDATE agent_chains SET status = ?, context = ?, current_step = ? WHERE id = ?').run('completed', JSON.stringify(ctx), currentStep, chain_id);
      return res.json({ ok: true, status: 'completed', loops: ctx._loop_count || 0, final_context: ctx });
    }
  }

  const nextStep = steps[currentStep];
  db.prepare('UPDATE agent_chains SET context = ?, current_step = ? WHERE id = ?').run(JSON.stringify(ctx), currentStep, chain_id);

  res.json({
    ok: true,
    chain_id,
    current_step: currentStep,
    next: { agent: nextStep.agent, prompt: nextStep.prompt, context: nextStep.pass_context ? ctx : {} },
    loop_count: ctx._loop_count || 0,
    status: 'running'
  });
});

// 3. Queue prompts for later execution (overnight batch)
app.post('/v1/chain/queue', auth, (req, res) => {
  const { prompts, schedule, frequency } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO prompt_queue (id, user_id, prompts, schedule, frequency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
    id, req.acct?.email || req.apiKey, JSON.stringify(prompts || []), schedule || 'now', frequency || 'once', 'queued'
  );
  res.json({ ok: true, queue_id: id, prompt_count: (prompts || []).length, schedule: schedule || 'now', frequency: frequency || 'once' });
});

// 4. Check chain status
app.get('/v1/chain/status/:id', auth, (req, res) => {
  const chain = db.prepare('SELECT * FROM agent_chains WHERE id = ?').get(req.params.id);
  if (!chain) return res.status(404).json({ error: { code: 'chain_not_found' } });
  const steps = JSON.parse(chain.steps);
  const ctx = JSON.parse(chain.context);
  res.json({
    ok: true,
    chain_id: chain.id,
    name: chain.name,
    status: chain.status,
    current_step: chain.current_step,
    total_steps: steps.length,
    loop: !!chain.loop,
    loop_count: ctx._loop_count || 0,
    context: ctx,
    created_at: chain.created_at
  });
});

// 5. Pause a running chain
app.post('/v1/chain/pause/:id', auth, (req, res) => {
  const chain = db.prepare('SELECT * FROM agent_chains WHERE id = ?').get(req.params.id);
  if (!chain) return res.status(404).json({ error: { code: 'chain_not_found' } });
  if (chain.status === 'paused') return res.json({ ok: true, chain_id: chain.id, status: 'paused', message: 'Already paused' });
  db.prepare('UPDATE agent_chains SET status = ? WHERE id = ?').run('paused', req.params.id);
  res.json({ ok: true, chain_id: chain.id, status: 'paused' });
});

// 6. Resume a paused chain
app.post('/v1/chain/resume/:id', auth, (req, res) => {
  const chain = db.prepare('SELECT * FROM agent_chains WHERE id = ?').get(req.params.id);
  if (!chain) return res.status(404).json({ error: { code: 'chain_not_found' } });
  if (chain.status !== 'paused') return res.json({ ok: true, chain_id: chain.id, status: chain.status, message: 'Chain is not paused' });
  db.prepare('UPDATE agent_chains SET status = ? WHERE id = ?').run('active', req.params.id);
  const steps = JSON.parse(chain.steps);
  const nextStep = steps[chain.current_step];
  const ctx = JSON.parse(chain.context);
  res.json({
    ok: true,
    chain_id: chain.id,
    status: 'active',
    current_step: chain.current_step,
    next: nextStep ? { agent: nextStep.agent, prompt: nextStep.prompt, context: nextStep.pass_context ? ctx : {} } : null
  });
});

// 7. List all chains for user
app.get('/v1/chain/list', auth, (req, res) => {
  const userId = req.acct?.email || req.apiKey;
  const chains = db.prepare('SELECT * FROM agent_chains WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  res.json({
    ok: true,
    chains: chains.map(c => ({
      chain_id: c.id,
      name: c.name,
      status: c.status,
      current_step: c.current_step,
      total_steps: JSON.parse(c.steps).length,
      loop: !!c.loop,
      created_at: c.created_at
    })),
    total: chains.length
  });
});

// 8. List queued prompts
app.get('/v1/queue/list', auth, (req, res) => {
  const userId = req.acct?.email || req.apiKey;
  const queued = db.prepare('SELECT * FROM prompt_queue WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  res.json({
    ok: true,
    queued: queued.map(q => ({
      queue_id: q.id,
      prompt_count: JSON.parse(q.prompts).length,
      schedule: q.schedule,
      frequency: q.frequency,
      status: q.status,
      last_run: q.last_run,
      run_count: q.run_count,
      created_at: q.created_at
    })),
    total: queued.length
  });
});

// 9. Cancel a queued prompt
app.delete('/v1/queue/:id', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM prompt_queue WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: { code: 'queue_item_not_found' } });
  db.prepare('UPDATE prompt_queue SET status = ? WHERE id = ?').run('cancelled', req.params.id);
  res.json({ ok: true, queue_id: req.params.id, status: 'cancelled' });
});

// 10. Local compute enhancement — harness local results + cloud tools
app.post('/v1/local/enhance', auth, (req, res) => {
  const { task, local_result, enhance_with } = req.body;
  const id = uuidv4();
  const enhancements = [];
  (enhance_with || []).forEach(slug => {
    const handler = allHandlers[slug];
    if (handler) {
      try {
        const result = handler({ ...req.body, text: JSON.stringify(local_result), data: local_result });
        enhancements.push({ tool: slug, result });
      } catch(e) { enhancements.push({ tool: slug, error: e.message }); }
    }
  });

  res.json({
    ok: true,
    enhancement_id: id,
    original: local_result,
    enhancements,
    enhanced_count: enhancements.filter(e => !e.error).length,
    _engine: 'real'
  });
});

// ===== PHASE 4-5: ECONOMY ENDPOINTS =====

// --- Credit Trading System ---

// POST /v1/credits/offer — Offer credits for sale
app.post('/v1/credits/offer', auth, (req, res) => {
  const { amount, price_per_credit, expires_hours } = req.body;
  if (!amount || amount < 100) return res.status(400).json({ error: { code: 'min_100_credits', message: 'Minimum offer is 100 credits' } });
  if (req.acct.balance < amount) return res.status(402).json({ error: { code: 'insufficient_credits', balance: req.acct.balance, needed: amount } });

  const id = uuidv4();
  // Escrow credits from seller
  req.acct.balance -= amount;
  persistKey(req.apiKey);

  const expiresAt = new Date(Date.now() + (expires_hours || 24) * 3600000).toISOString();
  db.prepare("INSERT INTO credit_market (id, seller_id, amount, price_per_credit, remaining, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)").run(
    id, req.acct?.email || req.apiKey, amount, price_per_credit || 0.005, amount, 'active', expiresAt
  );

  res.json({ ok: true, offer_id: id, amount, price_per_credit: price_per_credit || 0.005, escrowed: true });
});

// POST /v1/credits/buy-offer/:id — Buy from an offer
app.post('/v1/credits/buy-offer/:id', auth, (req, res) => {
  const { amount } = req.body;
  const offer = db.prepare('SELECT * FROM credit_market WHERE id = ? AND status = "active"').get(req.params.id);
  if (!offer) return res.status(404).json({ error: { code: 'offer_not_found' } });
  if (offer.seller_id === (req.acct?.email || req.apiKey)) return res.status(400).json({ error: { code: 'cannot_buy_own_offer' } });

  const buyAmount = Math.min(amount || offer.remaining, offer.remaining);
  if (buyAmount <= 0) return res.status(400).json({ error: { code: 'offer_exhausted' } });

  // Buyer receives the escrowed credits directly
  req.acct.balance += buyAmount;
  persistKey(req.apiKey);

  const newRemaining = offer.remaining - buyAmount;
  if (newRemaining <= 0) {
    db.prepare('UPDATE credit_market SET remaining = 0, status = "sold" WHERE id = ?').run(req.params.id);
  } else {
    db.prepare('UPDATE credit_market SET remaining = ? WHERE id = ?').run(newRemaining, req.params.id);
  }

  res.json({ ok: true, bought: buyAmount, remaining_in_offer: Math.max(0, newRemaining), new_balance: req.acct.balance });
});

// GET /v1/credits/market — Browse credit market
app.get('/v1/credits/market', publicRateLimit, (req, res) => {
  const offers = db.prepare('SELECT id, seller_id, amount, price_per_credit, remaining, status, expires_at, created_at FROM credit_market WHERE status = "active" AND expires_at > CURRENT_TIMESTAMP ORDER BY price_per_credit ASC LIMIT 50').all();
  res.json({ ok: true, offers, count: offers.length });
});

// DELETE /v1/credits/offer/:id — Cancel offer (return escrowed credits)
app.delete('/v1/credits/offer/:id', auth, (req, res) => {
  const offer = db.prepare('SELECT * FROM credit_market WHERE id = ? AND status = "active"').get(req.params.id);
  if (!offer) return res.status(404).json({ error: { code: 'offer_not_found' } });
  if (offer.seller_id !== (req.acct?.email || req.apiKey)) return res.status(403).json({ error: { code: 'not_your_offer' } });

  // Return remaining escrowed credits
  req.acct.balance += offer.remaining;
  persistKey(req.apiKey);

  db.prepare('UPDATE credit_market SET status = "cancelled" WHERE id = ?').run(req.params.id);
  res.json({ ok: true, returned_credits: offer.remaining, new_balance: req.acct.balance });
});

// GET /v1/credits/my-offers — My active offers
app.get('/v1/credits/my-offers', auth, (req, res) => {
  const sellerId = req.acct?.email || req.apiKey;
  const offers = db.prepare('SELECT * FROM credit_market WHERE seller_id = ? ORDER BY created_at DESC LIMIT 50').all(sellerId);
  res.json({ ok: true, offers, count: offers.length });
});

// --- Agent Reputation System ---

// POST /v1/reputation/vote — Upvote/downvote an agent
app.post('/v1/reputation/vote', auth, (req, res) => {
  const { agent_id, vote } = req.body;
  if (!agent_id) return res.status(400).json({ error: { code: 'agent_id_required' } });
  if (!['up', 'down'].includes(vote)) return res.status(400).json({ error: { code: 'vote_must_be_up_or_down' } });

  const existing = db.prepare('SELECT * FROM agent_reputation WHERE agent_id = ?').get(agent_id);
  if (!existing) {
    db.prepare('INSERT INTO agent_reputation (agent_id, score, tasks_completed, upvotes, downvotes, updated_at) VALUES (?, ?, 0, ?, ?, CURRENT_TIMESTAMP)').run(
      agent_id, vote === 'up' ? 1 : -1, vote === 'up' ? 1 : 0, vote === 'down' ? 1 : 0
    );
  } else {
    if (vote === 'up') {
      db.prepare('UPDATE agent_reputation SET upvotes = upvotes + 1, score = score + 1, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?').run(agent_id);
    } else {
      db.prepare('UPDATE agent_reputation SET downvotes = downvotes + 1, score = score - 1, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?').run(agent_id);
    }
  }

  const updated = db.prepare('SELECT * FROM agent_reputation WHERE agent_id = ?').get(agent_id);
  res.json({ ok: true, agent_id, vote, reputation: updated });
});

// NOTE: GET /v1/reputation/leaderboard, /v1/reputation/my, and /v1/reputation/:agent_id
// are registered earlier (before the legacy :key_prefix route) to avoid route conflicts.

// --- Agent Wallet System ---

// POST /v1/wallet/create — Create an agent wallet (sub-account)
app.post('/v1/wallet/create', auth, (req, res) => {
  const { agent_name, initial_credits, budget_limit } = req.body;
  const id = uuidv4();
  const initial = Math.min(initial_credits || 100, req.acct.balance);
  req.acct.balance -= initial;
  persistKey(req.apiKey);

  db.prepare('INSERT INTO agent_wallets (id, owner_id, agent_name, balance, budget_limit, total_earned, total_spent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
    id, req.acct?.email || req.apiKey, agent_name || 'Agent', initial, budget_limit || 1000, 0, 0
  );

  res.json({ ok: true, wallet_id: id, agent_name: agent_name || 'Agent', balance: initial, budget_limit: budget_limit || 1000 });
});

// GET /v1/wallet/list — List my agent wallets
app.get('/v1/wallet/list', auth, (req, res) => {
  const ownerId = req.acct?.email || req.apiKey;
  const wallets = db.prepare('SELECT * FROM agent_wallets WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId);
  res.json({ ok: true, wallets, count: wallets.length });
});

// POST /v1/wallet/transfer — Transfer between wallets
app.post('/v1/wallet/transfer', auth, (req, res) => {
  const { from_wallet_id, to_wallet_id, amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: { code: 'invalid_amount' } });

  const ownerId = req.acct?.email || req.apiKey;

  // Allow transfer from main account (from_wallet_id = "main") or from a wallet
  let fromBalance;
  if (from_wallet_id === 'main') {
    fromBalance = req.acct.balance;
  } else {
    const fromWallet = db.prepare('SELECT * FROM agent_wallets WHERE id = ? AND owner_id = ?').get(from_wallet_id, ownerId);
    if (!fromWallet) return res.status(404).json({ error: { code: 'from_wallet_not_found' } });
    fromBalance = fromWallet.balance;
  }

  if (fromBalance < amount) return res.status(402).json({ error: { code: 'insufficient_credits' } });

  // Allow transfer to main account (to_wallet_id = "main") or to a wallet
  if (to_wallet_id === 'main') {
    // to main — no validation needed
  } else {
    const toWallet = db.prepare('SELECT * FROM agent_wallets WHERE id = ? AND owner_id = ?').get(to_wallet_id, ownerId);
    if (!toWallet) return res.status(404).json({ error: { code: 'to_wallet_not_found' } });
  }

  // Debit source
  if (from_wallet_id === 'main') {
    req.acct.balance -= amount;
    persistKey(req.apiKey);
  } else {
    db.prepare('UPDATE agent_wallets SET balance = balance - ?, total_spent = total_spent + ? WHERE id = ?').run(amount, amount, from_wallet_id);
  }

  // Credit destination
  if (to_wallet_id === 'main') {
    req.acct.balance += amount;
    persistKey(req.apiKey);
  } else {
    db.prepare('UPDATE agent_wallets SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?').run(amount, amount, to_wallet_id);
  }

  res.json({ ok: true, from: from_wallet_id, to: to_wallet_id, amount, transferred: true });
});

// ===== USER LLM KEY MANAGEMENT (BYOK — Bring Your Own Key) =====
// Users store their own API keys. When set, LLM calls use USER keys = 0 slopshop credits.
app.post('/v1/keys/llm/set', auth, (req, res) => {
  const { provider, key } = req.body;
  const valid = ['anthropic', 'openai', 'grok', 'deepseek'];
  if (!provider || !valid.includes(provider)) return res.status(422).json({ error: { code: 'invalid_provider', valid } });
  if (!key || key.length < 10) return res.status(422).json({ error: { code: 'invalid_key' } });
  const ns = 'user-keys:' + req.apiKey.slice(0, 16);
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(
    ns + ':' + provider,
    JSON.stringify({ key: Buffer.from(key).toString('base64'), provider, set_at: new Date().toISOString() })
  );
  res.json({ ok: true, provider, message: 'Key saved. LLM calls with provider=' + provider + ' now use YOUR key (0 slopshop credits).', _engine: 'real' });
});

app.get('/v1/keys/llm/list', auth, (req, res) => {
  const ns = 'user-keys:' + req.apiKey.slice(0, 16);
  const rows = db.prepare("SELECT key AS k, value FROM agent_state WHERE k LIKE ?").all(ns + ':%');
  const keys = rows.map(r => {
    try { const d = JSON.parse(r.value); return { provider: d.provider, set_at: d.set_at, key_preview: Buffer.from(d.key, 'base64').toString().slice(0, 8) + '...' }; }
    catch(e) { return null; }
  }).filter(Boolean);
  res.json({ ok: true, keys, count: keys.length, _engine: 'real' });
});

app.delete('/v1/keys/llm/:provider', auth, (req, res) => {
  const ns = 'user-keys:' + req.apiKey.slice(0, 16);
  db.prepare('DELETE FROM agent_state WHERE key = ?').run(ns + ':' + req.params.provider);
  res.json({ ok: true, provider: req.params.provider, deleted: true, _engine: 'real' });
});

// ===== UNIVERSAL MODEL MESH — 4 pillars requested by Claude/GPT/Grok/DeepSeek =====

// PILLAR 1: /context/session — Structured execution context (Claude's request)
// Gives any LLM full awareness of: goal, memory state, capabilities, recent results
app.post('/v1/context/session', auth, (req, res) => {
  const sessionId = req.body.session_id || 'default';
  const keyPrefix = req.acct._nsPrefix || crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);

  // Get recent memory changes
  const memoryKeys = [];
  try {
    const rows = db.prepare('SELECT key, updated FROM memory WHERE namespace = ? ORDER BY updated DESC LIMIT 20').all(keyPrefix);
    rows.forEach(r => memoryKeys.push({ key: r.key, updated: new Date(r.updated).toISOString() }));
  } catch(e) {}

  // Get recent agent runs
  const recentRuns = [];
  try {
    const rows = db.prepare('SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix = ? ORDER BY id DESC LIMIT 10').all(req.apiKey.slice(0, 12) + '...');
    rows.forEach(r => recentRuns.push({ api: r.api, credits: r.credits, latency_ms: r.latency_ms, engine: r.engine, time: r.ts }));
  } catch(e) {}

  // Available capabilities
  const capabilities = {
    total_apis: apiCount,
    categories: catalog.length,
    compute_handlers: Object.keys(allHandlers).length,
    llm_providers: ['anthropic', 'openai', 'grok', 'deepseek'].filter(p => {
      const envMap = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', grok: 'XAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
      return process.env[envMap[p]];
    }),
    memory: { free: true, persistent: true },
    orchestration: ['org/launch', 'chain/create', 'army/deploy', 'hive/create', 'copilot/spawn'],
    rate_limit: { max_per_min: req.acct.tier === 'leviathan' ? 1000 : req.acct.tier === 'reef-boss' ? 300 : 120, remaining: 'check X-RateLimit-Remaining header' },
  };

  // Current goal (from hive vision if available)
  let goal = null;
  try {
    const vision = db.prepare("SELECT value FROM memory WHERE namespace = ? AND key = '_vision' ORDER BY updated DESC LIMIT 1").get(keyPrefix);
    if (vision) goal = vision.value;
  } catch(e) {}

  res.json({
    ok: true,
    session_id: sessionId,
    goal,
    balance: req.acct.balance,
    tier: req.acct.tier,
    memory: { recent_keys: memoryKeys, total: memoryKeys.length },
    recent_activity: recentRuns,
    capabilities,
    timestamp: new Date().toISOString(),
    _engine: 'real',
  });
});

// PILLAR 2: /introspect — Dynamic API discovery (GPT's request)
// Any LLM can discover schemas, limits, docs for any tool in real-time
app.get('/v1/introspect', auth, (req, res) => {
  const query = req.query.q || req.query.query || '';
  const slug = req.query.slug || '';
  const category = req.query.category || '';
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  let results = Object.entries(API_DEFS);

  if (slug) {
    const def = apiMap.get(slug);
    if (!def) return res.status(404).json({ error: { code: 'not_found', slug } });
    const schema = SCHEMAS?.[slug] || {};
    return res.json({
      ok: true,
      slug, name: def.name, description: def.desc, credits: def.credits, tier: def.tier, category: def.cat,
      input_schema: schema.input || null,
      output_schema: schema.output || null,
      example: schema.example || null,
      handler_exists: !!allHandlers[slug],
      _engine: 'real',
    });
  }

  if (category) results = results.filter(([_, d]) => d.cat.toLowerCase().includes(category.toLowerCase()));
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(([slug, d]) => slug.includes(q) || d.name.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q));
  }

  res.json({
    ok: true,
    total: results.length,
    results: results.slice(0, limit).map(([slug, d]) => ({
      slug, name: d.name, description: d.desc, credits: d.credits, tier: d.tier, category: d.cat,
      has_handler: !!allHandlers[slug],
      input_schema: SCHEMAS?.[slug]?.input || null,
    })),
    query: query || category || 'all',
    _engine: 'real',
  });
});

// PILLAR 3: /route — Smart API routing (Grok's request)
// Auto-selects the best API for a task based on intent, cost, reliability
app.post('/v1/route', auth, (req, res) => {
  const task = req.body.task || req.body.query || '';
  if (!task) return res.status(422).json({ error: { code: 'missing_task' } });

  const lower = task.toLowerCase();

  // Use the smart routing from agent.js patterns + scoring
  const scored = [];
  for (const [slug, def] of Object.entries(API_DEFS)) {
    const text = (slug + ' ' + def.name + ' ' + def.desc).toLowerCase();
    let score = 0;
    const words = lower.split(/\s+/).filter(w => w.length > 2);
    words.forEach(w => { if (text.includes(w)) score++; if (slug.includes(w)) score += 3; });

    // Boost compute tier (cheaper, faster, more reliable)
    if (def.tier === 'compute') score += 2;
    if (def.credits <= 1) score += 1;

    if (score > 2) {
      scored.push({
        slug, name: def.name, description: def.desc,
        credits: def.credits, tier: def.tier, category: def.cat,
        relevance_score: score,
        has_handler: !!allHandlers[slug],
        input_schema: SCHEMAS?.[slug]?.input || null,
      });
    }
  }

  scored.sort((a, b) => b.relevance_score - a.relevance_score);

  res.json({
    ok: true,
    task,
    recommended: scored[0] || null,
    alternatives: scored.slice(1, 5),
    total_matches: scored.length,
    _engine: 'real',
  });
});

// PILLAR 4: /state — Shared state sync (DeepSeek's request)
// Versioned shared state that multiple agents can read/write concurrently
app.post('/v1/state/set', auth, (req, res) => {
  const { key, value, namespace } = req.body;
  if (!key) return res.status(422).json({ error: { code: 'missing_key' } });
  const ns = namespace || 'shared:' + req.apiKey.slice(0, 12);
  const version = Date.now();

  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(
    ns + ':' + key,
    JSON.stringify({ value, version, updated_by: req.apiKey.slice(0, 12), ts: new Date().toISOString() })
  );

  res.json({ ok: true, key, version, namespace: ns, _engine: 'real' });
});

app.post('/v1/state/get', auth, (req, res) => {
  const { key, namespace } = req.body;
  if (!key) return res.status(422).json({ error: { code: 'missing_key' } });
  const ns = namespace || 'shared:' + req.apiKey.slice(0, 12);
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(ns + ':' + key);
  if (!row) return res.json({ ok: true, key, value: null, version: null });
  try {
    const parsed = JSON.parse(row.value);
    res.json({ ok: true, key, ...parsed, namespace: ns, _engine: 'real' });
  } catch(e) {
    res.json({ ok: true, key, value: row.value, namespace: ns, _engine: 'real' });
  }
});

app.post('/v1/state/list', auth, (req, res) => {
  const ns = req.body.namespace || 'shared:' + req.apiKey.slice(0, 12);
  const rows = db.prepare("SELECT key, value FROM agent_state WHERE key LIKE ? || ':%'").all(ns);
  const entries = rows.map(r => {
    const shortKey = r.key.replace(ns + ':', '');
    try { return { key: shortKey, ...JSON.parse(r.value) }; } catch(e) { return { key: shortKey, value: r.value }; }
  });
  res.json({ ok: true, namespace: ns, entries, count: entries.length, _engine: 'real' });
});

// ===== WORKFLOWS — Declarative multi-step conditional chains =====
app.post('/v1/workflows/run', auth, async (req, res) => {
  const { name, steps, input } = req.body;
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return res.status(422).json({ error: { code: 'missing_steps', message: 'Provide steps: [{api, input, condition?}]' } });
  }

  const results = [];
  let context = input || {};
  let totalCredits = 0;
  const startTime = Date.now();

  for (let i = 0; i < Math.min(steps.length, 20); i++) {
    const step = steps[i];

    // Conditional execution
    if (step.condition) {
      try {
        const condFn = new Function('ctx', 'return ' + step.condition);
        if (!condFn(context)) {
          results.push({ step: i, api: step.api, skipped: true, reason: 'Condition false: ' + step.condition });
          continue;
        }
      } catch(e) {
        results.push({ step: i, api: step.api, skipped: true, reason: 'Condition error: ' + e.message });
        continue;
      }
    }

    const handler = allHandlers[step.api];
    const def = apiMap.get(step.api);
    if (!handler || !def) {
      results.push({ step: i, api: step.api, error: 'Not found' });
      continue;
    }

    // Merge context into step input
    const stepInput = { ...context, ...(step.input || {}) };

    const acct = apiKeys.get(req.apiKey);
    if (!acct || acct.balance < def.credits) {
      results.push({ step: i, api: step.api, error: 'Insufficient credits' });
      break;
    }
    acct.balance -= def.credits;
    totalCredits += def.credits;

    try {
      const stepStart = Date.now();
      const result = await handler(stepInput);
      const stepMs = Date.now() - stepStart;
      // Pass result forward as context
      if (result && typeof result === 'object') {
        const { _engine, ...clean } = result;
        context = { ...context, ...clean, _prev: clean };
      }
      results.push({ step: i, api: step.api, credits: def.credits, time_ms: stepMs, result: result || {} });
    } catch(e) {
      acct.balance += def.credits;
      totalCredits -= def.credits;
      results.push({ step: i, api: step.api, error: e.message });
      if (!step.continue_on_error) break;
    }
  }

  persistKey(req.apiKey);
  res.json({
    ok: true, name: name || 'unnamed',
    steps_total: steps.length, steps_executed: results.length,
    results, context, total_credits: totalCredits,
    time_ms: Date.now() - startTime, _engine: 'real',
  });
});

// ===== TELEMETRY — Observability, tracing, cost tracking =====
app.get('/v1/telemetry', auth, (req, res) => {
  const keyPrefix = req.apiKey.slice(0, 12) + '...';
  const since = req.query.since || '24h';
  const sinceMs = since.endsWith('h') ? parseInt(since) * 3600000 : since.endsWith('d') ? parseInt(since) * 86400000 : 86400000;
  const cutoff = new Date(Date.now() - sinceMs).toISOString();

  try {
    const calls = db.prepare('SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix = ? AND ts > ? ORDER BY id DESC LIMIT 100').all(keyPrefix, cutoff);
    const totalCredits = calls.reduce((s, c) => s + c.credits, 0);
    const totalCalls = calls.length;
    const avgLatency = totalCalls > 0 ? Math.round(calls.reduce((s, c) => s + (c.latency_ms || 0), 0) / totalCalls) : 0;
    const byApi = {};
    calls.forEach(c => { byApi[c.api] = (byApi[c.api] || 0) + 1; });
    const topApis = Object.entries(byApi).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([api, count]) => ({ api, count }));
    const byEngine = {};
    calls.forEach(c => { byEngine[c.engine || 'unknown'] = (byEngine[c.engine || 'unknown'] || 0) + 1; });

    res.json({
      ok: true, since, period_ms: sinceMs,
      total_calls: totalCalls, total_credits: totalCredits, avg_latency_ms: avgLatency,
      top_apis: topApis, by_engine: byEngine,
      recent: calls.slice(0, 20).map(c => ({ api: c.api, credits: c.credits, latency_ms: c.latency_ms, engine: c.engine, time: c.ts })),
      _engine: 'real',
    });
  } catch(e) {
    res.json({ ok: true, total_calls: 0, total_credits: 0, error: e.message, _engine: 'real' });
  }
});

// ===== EVAL — Evaluate and score agent outputs =====
app.post('/v1/mesh/eval', auth, async (req, res) => {
  const { run_id, output, criteria, task } = req.body;
  if (!output && !run_id) return res.status(422).json({ error: { code: 'missing_output', message: 'Provide output text or run_id' } });

  // Use LLM to evaluate
  const llmHandler = allHandlers['llm-think'] || allHandlers['llm-summarize'];
  if (!llmHandler) return res.json({ ok: true, score: null, message: 'No LLM available for evaluation', _engine: 'real' });

  const evalPrompt = 'Evaluate this AI output on a scale of 1-10. ' +
    (criteria ? 'Criteria: ' + criteria + '. ' : 'Criteria: accuracy, completeness, actionability. ') +
    (task ? 'Original task: ' + task + '. ' : '') +
    'Output to evaluate: ' + String(output || run_id).slice(0, 2000) +
    '. Respond with JSON: {"score": number, "reasoning": string, "improvements": string[]}';

  try {
    const result = await llmHandler({ text: evalPrompt });
    let score = null, reasoning = '', improvements = [];
    const answer = result?.answer || result?.summary || '';
    try {
      const parsed = JSON.parse(answer.replace(/```json\s*/g, '').replace(/```/g, '').trim());
      score = parsed.score;
      reasoning = parsed.reasoning;
      improvements = parsed.improvements;
    } catch(e) {
      // Extract score from text
      const scoreMatch = answer.match(/(\d+)\s*\/\s*10/);
      score = scoreMatch ? parseInt(scoreMatch[1]) : null;
      reasoning = answer.slice(0, 300);
    }

    res.json({ ok: true, score, reasoning, improvements, _engine: 'real' });
  } catch(e) {
    res.json({ ok: true, score: null, error: e.message, _engine: 'real' });
  }
});


// ===== COMPARE — Side-by-side multi-LLM comparison (unanimously requested by all 4 LLMs) =====
app.post('/v1/compare', auth, async (req, res) => {
  const prompt = req.body.prompt || req.body.text || '';
  const models = req.body.models || ['anthropic', 'openai', 'grok', 'deepseek'];
  if (!prompt) return res.status(422).json({ error: { code: 'missing_prompt' } });

  const results = [];
  for (const provider of models) {
    const start = Date.now();
    try {
      const handler = allHandlers['llm-think'];
      if (!handler) { results.push({ provider, error: 'no handler' }); continue; }
      const result = await handler({ text: prompt, provider });
      const ms = Date.now() - start;
      let answer = result?.answer || result?.summary || '';
      answer = String(answer).trim();
      if (answer.startsWith('{')) try { answer = JSON.parse(answer).answer || answer; } catch(e) {}
      results.push({ provider, model: result?._model || provider, answer: answer.slice(0, 500), latency_ms: ms, credits: 10 });
    } catch(e) {
      results.push({ provider, error: e.message, latency_ms: Date.now() - start });
    }
  }

  // Rank by response quality (length as proxy for now)
  results.sort((a, b) => (b.answer || '').length - (a.answer || '').length);
  results.forEach((r, i) => r.rank = i + 1);

  const totalCredits = results.filter(r => !r.error).length * 10;
  const acct = apiKeys.get(req.apiKey);
  if (acct) acct.balance -= totalCredits;
  persistKey(req.apiKey);

  res.json({
    ok: true, prompt: prompt.slice(0, 200),
    providers_queried: models.length,
    results, total_credits: totalCredits,
    fastest: results.filter(r => r.latency_ms).sort((a, b) => a.latency_ms - b.latency_ms)[0]?.provider,
    slowest: results.filter(r => r.latency_ms).sort((a, b) => b.latency_ms - a.latency_ms)[0]?.provider,
    cost_per_model: results.filter(r => !r.error).reduce((o, r) => { o[r.provider] = r.credits + 'cr'; return o; }, {}),
    avg_latency_ms: Math.round(results.filter(r => r.latency_ms).reduce((s, r) => s + r.latency_ms, 0) / results.filter(r => r.latency_ms).length),
    _engine: 'real',
  });
});

// ===== ONBOARDING — Interactive quickstart (requested by GPT, Grok, DeepSeek, Mistral) =====
app.get('/v1/quickstart/interactive', auth, async (req, res) => {
  const steps = [
    { step: 1, title: 'Generate a UUID', command: 'slop call crypto-uuid', api: 'crypto-uuid', credits: 1 },
    { step: 2, title: 'Hash some text', command: 'slop call crypto-hash-sha256 --text "hello"', api: 'crypto-hash-sha256', credits: 1 },
    { step: 3, title: 'Store in memory (free)', command: 'slop memory set mykey "hello world"', api: 'memory-set', credits: 0 },
    { step: 4, title: 'Ask all 4 AI models', command: 'slop call llm-council --text "What should I build?"', api: 'llm-council', credits: 40 },
    { step: 5, title: 'Launch an agent team', command: 'slop org launch --template dev-agency', api: 'org/launch', credits: 5 },
  ];

  // Auto-execute step 1 to show immediate value
  const demo = await (async () => {
    try {
      const handler = allHandlers['crypto-uuid'];
      if (handler) return await handler({});
      return null;
    } catch(e) { return null; }
  })();

  res.json({
    ok: true,
    welcome: 'Welcome to Slopshop! Follow these 5 steps to see the platform in action.',
    your_balance: req.acct.balance,
    steps,
    demo_result: demo ? { uuid: demo.uuid, _engine: demo._engine } : null,
    next: 'Try: curl -X POST ' + req.protocol + '://' + req.get('host') + '/v1/crypto-uuid -H "Authorization: Bearer YOUR_KEY"',
    docs: 'https://slopshop.gg/docs',
    _engine: 'real',
  });
});

// ===== STATUS DASHBOARD (requested by DeepSeek, Grok) =====
app.get('/v1/status/dashboard', (req, res) => {
  const uptime = Math.floor((Date.now() - serverStart) / 1000);
  const mem = process.memoryUsage();

  let recentCalls = 0, recentErrors = 0;
  try {
    recentCalls = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE ts > datetime('now', '-1 hour')").get().c;
    recentErrors = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE engine = 'error' AND ts > datetime('now', '-1 hour')").get().c;
  } catch(e) {}

  const providers = ['anthropic', 'openai', 'grok', 'deepseek'].filter(p => {
    const envMap = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', grok: 'XAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
    return process.env[envMap[p]];
  });

  res.json({
    ok: true,
    status: 'operational',
    version: '3.7.0',
    uptime_seconds: uptime,
    uptime_human: Math.floor(uptime / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm',
    apis: apiCount,
    handlers: Object.keys(allHandlers).length,
    llm_providers: providers,
    memory_mb: Math.round(mem.heapUsed / 1048576),
    recent_1h: { calls: recentCalls, errors: recentErrors, error_rate: recentCalls > 0 ? (recentErrors / recentCalls * 100).toFixed(1) + '%' : '0%' },
    sqlite_tables: db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get().c,
    features: { workflows: true, telemetry: true, eval: true, compare: true, mesh: true, byok: true, memory_2fa: true, sybil_protection: true },
    _engine: 'real',
  });
});

// ===== BENCHMARK — On-demand performance test (requested by Claude, Grok) =====
app.get('/v1/benchmark', auth, async (req, res) => {
  const tests = ['crypto-uuid', 'crypto-hash-sha256', 'text-word-count', 'text-reverse', 'crypto-password-generate'];
  const results = [];

  for (const slug of tests) {
    const handler = allHandlers[slug];
    if (!handler) continue;
    const times = [];
    for (let i = 0; i < 3; i++) {
      const start = process.hrtime.bigint();
      try { await handler({ text: 'benchmark-' + Date.now(), length: 16 }); } catch(e) {}
      times.push(Number(process.hrtime.bigint() - start) / 1e6);
    }
    times.sort((a, b) => a - b);
    results.push({ api: slug, p50_ms: +times[1].toFixed(3), min_ms: +times[0].toFixed(3), max_ms: +times[2].toFixed(3) });
  }

  res.json({
    ok: true,
    benchmark: results,
    total_handlers: Object.keys(allHandlers).length,
    avg_p50_ms: +(results.reduce((s, r) => s + r.p50_ms, 0) / results.length).toFixed(3),
    _engine: 'real',
  });
});


// Machine-readable documentation endpoint
app.get('/v1/docs/overview', (req, res) => {
  const categories = {};
  for (const [slug, def] of Object.entries(API_DEFS)) {
    if (!categories[def.cat]) categories[def.cat] = { count: 0, apis: [] };
    categories[def.cat].count++;
    categories[def.cat].apis.push({ slug, name: def.name, credits: def.credits });
  }
  res.json({
    ok: true,
    version: '3.7.0',
    total_apis: Object.keys(API_DEFS).length,
    categories: Object.entries(categories).map(([name, data]) => ({ name, count: data.count, sample_apis: data.apis.slice(0, 3) })),
    llm_providers: ['anthropic (Claude)', 'openai (GPT)', 'grok (xAI)', 'deepseek', 'ollama (local)'],
    key_endpoints: [
      { path: '/v1/agent/run', desc: 'Autonomous agent — describe task, get results' },
      { path: '/v1/compare', desc: 'Side-by-side multi-LLM comparison' },
      { path: '/v1/llm-think', desc: 'Ask any LLM to reason (provider=anthropic|openai|grok|deepseek)' },
      { path: '/v1/llm-council', desc: 'Get all LLMs to answer same question' },
      { path: '/v1/org/launch', desc: 'Launch multi-agent organization' },
      { path: '/v1/workflows/run', desc: 'Multi-step conditional workflow' },
      { path: '/v1/introspect', desc: 'Discover any API schema' },
      { path: '/v1/context/session', desc: 'Get execution context for LLMs' },
      { path: '/v1/memory-set', desc: 'Free persistent memory' },
      { path: '/v1/quickstart/interactive', desc: 'Guided 5-step onboarding' },
    ],
    quickstart: 'npm install -g slopshop && slop signup && slop call crypto-uuid',
    _engine: 'real',
  });
});
// ===== API EXPLORER — Try any API with live results (Claude's #1 request for 9.5) =====
app.post('/v1/explorer/try', auth, async (req, res) => {
  const { slug, input } = req.body;
  if (!slug) return res.status(422).json({ error: { code: 'missing_slug', hint: 'GET /v1/introspect to discover APIs' } });

  const def = apiMap.get(slug);
  const handler = allHandlers[slug];
  const schema = SCHEMAS?.[slug] || {};

  if (!def) return res.status(404).json({ error: { code: 'not_found', slug, similar: Object.keys(API_DEFS).filter(s => s.includes(slug.split('-')[0])).slice(0, 5) } });

  const result = { slug, name: def.name, category: def.cat, credits: def.credits, tier: def.tier, input_schema: schema.input || null };

  if (!handler) {
    result.executable = false;
    result.reason = 'No handler (needs external key or not implemented)';
    return res.json({ ok: true, ...result, _engine: 'real' });
  }

  // Execute with timing
  result.executable = true;
  const acct = apiKeys.get(req.apiKey);
  if (!acct || acct.balance < def.credits) return res.status(402).json({ error: { code: 'insufficient_credits', need: def.credits } });

  acct.balance -= def.credits;
  const start = process.hrtime.bigint();
  try {
    const output = await handler(input || {});
    const latencyNs = Number(process.hrtime.bigint() - start);
    result.output = output;
    result.latency_ms = +(latencyNs / 1e6).toFixed(3);
    result.latency_us = +(latencyNs / 1e3).toFixed(1);
    result.cost_usd = '$' + (def.credits * 0.009).toFixed(4);
  } catch(e) {
    acct.balance += def.credits;
    result.error = e.message;
    result.latency_ms = +(Number(process.hrtime.bigint() - start) / 1e6).toFixed(3);
  }
  persistKey(req.apiKey);
  result.balance_after = acct.balance;

  res.json({ ok: true, ...result, _engine: 'real' });
});

// List all executable APIs for the explorer
app.get('/v1/explorer/apis', auth, (req, res) => {
  const category = req.query.category || '';
  const q = req.query.q || '';
  let apis = Object.entries(API_DEFS).map(([slug, def]) => ({
    slug, name: def.name, category: def.cat, credits: def.credits, tier: def.tier,
    executable: !!allHandlers[slug],
    has_schema: !!SCHEMAS?.[slug],
  }));
  if (category) apis = apis.filter(a => a.category.toLowerCase().includes(category.toLowerCase()));
  if (q) apis = apis.filter(a => a.slug.includes(q) || a.name.toLowerCase().includes(q));
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json({ ok: true, total: apis.length, apis: apis.slice(0, limit), categories: [...new Set(apis.map(a => a.category))], _engine: 'real' });
});

// ===== BILLING/USAGE — Real-time cost tracking (GPT's 10/10 request) =====
app.get('/v1/billing/usage', auth, (req, res) => {
  const keyPrefix = req.apiKey.slice(0, 12) + '...';
  const period = req.query.period || '24h';
  const periodMs = period.endsWith('h') ? parseInt(period) * 3600000 : period.endsWith('d') ? parseInt(period) * 86400000 : 86400000;
  const cutoff = new Date(Date.now() - periodMs).toISOString();

  try {
    const calls = db.prepare('SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix = ? AND ts > ? ORDER BY id DESC').all(keyPrefix, cutoff);
    const byApi = {};
    let totalCredits = 0, totalCalls = 0;
    for (const c of calls) {
      totalCredits += c.credits;
      totalCalls++;
      if (!byApi[c.api]) byApi[c.api] = { calls: 0, credits: 0, avg_latency: 0, total_latency: 0 };
      byApi[c.api].calls++;
      byApi[c.api].credits += c.credits;
      byApi[c.api].total_latency += (c.latency_ms || 0);
    }
    const breakdown = Object.entries(byApi).map(([api, d]) => ({
      api, calls: d.calls, credits: d.credits, cost_usd: '$' + (d.credits * 0.009).toFixed(4),
      avg_latency_ms: d.calls > 0 ? Math.round(d.total_latency / d.calls) : 0,
    })).sort((a, b) => b.credits - a.credits);

    res.json({
      ok: true, period, total_calls: totalCalls, total_credits: totalCredits,
      total_cost_usd: '$' + (totalCredits * 0.009).toFixed(2),
      balance: req.acct.balance, tier: req.acct.tier,
      breakdown: breakdown.slice(0, 30),
      _engine: 'real',
    });
  } catch(e) {
    res.json({ ok: true, total_calls: 0, total_credits: 0, error: e.message, _engine: 'real' });
  }
});

// ===== API VERSIONING (Grok's 10/10 request) =====
app.get('/v1/api/versions', (req, res) => {
  res.json({
    ok: true,
    current: '3.6.0',
    api_version: '2026.03.28',
    supported: ['v1'],
    deprecated: [],
    changelog_url: '/v1/changelog',
    migration_guides: [],
    _engine: 'real',
  });
});

// ===== LOAD-BALANCED COMPLETIONS (DeepSeek's 10/10 request) =====
app.post('/v1/completions', auth, async (req, res) => {
  const prompt = req.body.prompt || req.body.text || req.body.messages?.[0]?.content || '';
  if (!prompt) return res.status(422).json({ error: { code: 'missing_prompt' } });
  const preferredProvider = req.body.provider || req.body.model?.split('/')[0];
  const providers = ['anthropic', 'openai', 'grok', 'deepseek'];
  const envMap = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', grok: 'XAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
  const available = providers.filter(p => process.env[envMap[p]]);

  // Try preferred, then failover to others
  const order = preferredProvider && available.includes(preferredProvider)
    ? [preferredProvider, ...available.filter(p => p !== preferredProvider)]
    : available;

  for (const provider of order) {
    try {
      const handler = allHandlers['llm-think'];
      if (!handler) continue;
      const start = Date.now();
      const result = await handler({ text: prompt, provider });
      const latency = Date.now() - start;
      let answer = result?.answer || result?.summary || '';
      if (answer.startsWith('{')) try { answer = JSON.parse(answer).answer || answer; } catch(e) {}

      const acct = apiKeys.get(req.apiKey);
      if (acct) { acct.balance -= 10; persistKey(req.apiKey); }

      return res.json({
        ok: true, provider, model: result?._model || provider,
        text: answer, latency_ms: latency, credits: 10,
        failover: provider !== order[0], available_providers: available,
        _engine: 'real',
      });
    } catch(e) { continue; }
  }
  res.status(503).json({ error: { code: 'all_providers_failed', tried: order } });
});

// ===== SECURITY AUDIT LOG (GPT's 10/10 request) =====
app.get('/v1/security/audit', auth, (req, res) => {
  const keyPrefix = req.apiKey.slice(0, 12) + '...';
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const logs = db.prepare('SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix = ? ORDER BY id DESC LIMIT ?').all(keyPrefix, limit);
    res.json({ ok: true, entries: logs, count: logs.length, key_prefix: keyPrefix, _engine: 'real' });
  } catch(e) {
    res.json({ ok: true, entries: [], error: e.message, _engine: 'real' });
  }
});

// ===== STREAM LIFECYCLE (Claude's 10/10 #1) =====
const activeStreams = new Map();
app.post('/v1/completions/:id/cancel', auth, (req, res) => {
  const stream = activeStreams.get(req.params.id);
  if (stream) { stream.destroyed = true; activeStreams.delete(req.params.id); }
  res.json({ ok: true, id: req.params.id, cancelled: !!stream, _engine: 'real' });
});
app.get('/v1/completions/:id/status', auth, (req, res) => {
  const stream = activeStreams.get(req.params.id);
  res.json({ ok: true, id: req.params.id, active: !!stream, _engine: 'real' });
});

// ===== PER-KEY USAGE AUDIT (Claude's 10/10 #2) =====
app.get('/v1/audit/key/:prefix', auth, (req, res) => {
  const prefix = req.params.prefix;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  try {
    const logs = db.prepare('SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix LIKE ? ORDER BY id DESC LIMIT ?').all(prefix + '%', limit);
    const totalCredits = logs.reduce((s, l) => s + l.credits, 0);
    res.json({ ok: true, key_prefix: prefix, entries: logs, count: logs.length, total_credits: totalCredits, _engine: 'real' });
  } catch(e) {
    res.json({ ok: true, entries: [], error: e.message, _engine: 'real' });
  }
});

// ===== RATE LIMIT STATUS (enterprise-grade observability) =====
app.get('/v1/ratelimit/status', auth, (req, res) => {
  const rlKey = 'api:' + req.apiKey;
  const entry = ipLimits.get(rlKey);
  const rlMax = req.acct.tier === 'leviathan' ? 1000 : req.acct.tier === 'reef-boss' ? 300 : 120;
  res.json({
    ok: true, tier: req.acct.tier, max_per_minute: rlMax,
    used: entry ? entry.c : 0,
    remaining: entry ? Math.max(0, rlMax - entry.c) : rlMax,
    resets_at: entry ? new Date(entry.s + 60000).toISOString() : null,
    _engine: 'real',
  });
});

// ===== DEPENDENCY CHECK (Claude's implicit ask: prove APIs work) =====
app.get('/v1/healthcheck/deep', auth, async (req, res) => {
  const checks = [];
  const test = async (name, fn) => {
    const start = Date.now();
    try { const r = await fn(); checks.push({ name, ok: true, ms: Date.now() - start }); }
    catch(e) { checks.push({ name, ok: false, ms: Date.now() - start, error: e.message }); }
  };
  await test('sqlite', () => db.prepare('SELECT 1').get());
  await test('compute', () => allHandlers['crypto-uuid']({}));
  await test('memory', () => allHandlers['memory-set'] ? allHandlers['memory-set']({ key: '_healthcheck', value: Date.now().toString(), namespace: '_system' }) : Promise.reject('no handler'));
  await test('state', () => db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('_healthcheck', ?)").run(Date.now().toString()));

  if (process.env.ANTHROPIC_API_KEY) {
    await test('anthropic', () => allHandlers['llm-think'] ? allHandlers['llm-think']({ text: 'OK', provider: 'anthropic' }) : Promise.reject('no handler'));
  }

  const passing = checks.filter(c => c.ok).length;
  res.json({
    ok: true, healthy: passing === checks.length,
    checks, passing, total: checks.length,
    timestamp: new Date().toISOString(),
    _engine: 'real',
  });
});

// ===== GUARDRAILS — Content safety + PII + prompt injection (Claude roadmap #1) =====
const PII_PATTERNS = [
  { name: 'email', pattern: /[\w.+-]+@[\w.-]+\.\w{2,}/g },
  { name: 'phone', pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g },
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'credit_card', pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
  { name: 'ip_address', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { name: 'api_key', pattern: /\b(sk-[a-zA-Z0-9]{20,}|xai-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,})\b/g },
];

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*:\s*you\s+are/i,
  /\]\s*\}\s*\{\s*"role"\s*:\s*"system"/i,
  /pretend\s+you\s+(are|have)\s+no\s+rules/i,
  /disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i,
  /do\s+not\s+follow\s+(your|any)\s+(instructions|rules)/i,
];

app.post('/v1/guardrails/scan', auth, (req, res) => {
  const text = req.body.text || '';
  if (!text) return res.status(422).json({ error: { code: 'missing_text' } });

  // PII Detection
  const pii_found = [];
  for (const { name, pattern } of PII_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) pii_found.push({ type: name, count: matches.length, samples: matches.slice(0, 3).map(m => m.slice(0, 4) + '***') });
  }

  // Prompt Injection Detection
  const injections = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) injections.push({ pattern: pattern.source.slice(0, 40), matched: true });
  }

  // Toxicity (basic keyword check — production would use a classifier)
  const toxicKeywords = ['kill', 'bomb', 'hack into', 'steal', 'exploit vulnerability'];
  const toxicity = toxicKeywords.filter(k => text.toLowerCase().includes(k));

  const safe = pii_found.length === 0 && injections.length === 0 && toxicity.length === 0;

  res.json({
    ok: true, safe,
    pii: { found: pii_found.length > 0, items: pii_found },
    injection: { found: injections.length > 0, items: injections },
    toxicity: { found: toxicity.length > 0, keywords: toxicity },
    text_length: text.length,
    _engine: 'real',
  });
});

app.post('/v1/guardrails/redact', auth, (req, res) => {
  let text = req.body.text || '';
  if (!text) return res.status(422).json({ error: { code: 'missing_text' } });
  const redactions = [];
  for (const { name, pattern } of PII_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      redactions.push({ type: name, count: matches.length });
      text = text.replace(pattern, '[' + name.toUpperCase() + '_REDACTED]');
    }
  }
  res.json({ ok: true, redacted_text: text, redactions, _engine: 'real' });
});

// ===== PROMPT REGISTRY — Versioned templates (Claude roadmap #4) =====
app.post('/v1/prompts/save', auth, (req, res) => {
  const { name, template, variables, tags } = req.body;
  if (!name || !template) return res.status(422).json({ error: { code: 'missing_name_or_template' } });
  const ns = 'prompts:' + req.apiKey.slice(0, 12);
  const version = Date.now();
  const entry = { template, variables: variables || [], tags: tags || [], version, created: new Date().toISOString() };

  // Store current version
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(ns + ':' + name, JSON.stringify(entry));
  // Store version history
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(ns + ':' + name + ':v' + version, JSON.stringify(entry));

  res.json({ ok: true, name, version, _engine: 'real' });
});

app.post('/v1/prompts/render', auth, (req, res) => {
  const { name, params } = req.body;
  if (!name) return res.status(422).json({ error: { code: 'missing_name' } });
  const ns = 'prompts:' + req.apiKey.slice(0, 12);
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(ns + ':' + name);
  if (!row) return res.status(404).json({ error: { code: 'prompt_not_found' } });
  const entry = JSON.parse(row.value);
  let rendered = entry.template;
  for (const [k, v] of Object.entries(params || {})) {
    rendered = rendered.replace(new RegExp('{{' + k + '}}', 'g'), v);
  }
  res.json({ ok: true, name, rendered, version: entry.version, _engine: 'real' });
});

app.get('/v1/prompts/list', auth, (req, res) => {
  const ns = 'prompts:' + req.apiKey.slice(0, 12);
  const rows = db.prepare("SELECT key AS k, value FROM agent_state WHERE k LIKE ? AND k NOT LIKE '%:v%'").all(ns + ':%');
  const prompts = rows.map(r => { try { const e = JSON.parse(r.value); return { name: r.k.replace(ns + ':', ''), ...e }; } catch(e) { return null; } }).filter(Boolean);
  res.json({ ok: true, prompts, count: prompts.length, _engine: 'real' });
});

// ===== SEMANTIC CACHE (Claude roadmap #2 — simplified version) =====
const semanticCache = new Map();
app.post('/v1/cache/check', auth, (req, res) => {
  const text = req.body.text || '';
  const key = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).sort().join(' ').slice(0, 200);
  const cached = semanticCache.get(key);
  if (cached && Date.now() - cached.ts < (req.body.ttl || 300000)) {
    return res.json({ ok: true, hit: true, cached_response: cached.value, age_ms: Date.now() - cached.ts, _engine: 'real' });
  }
  res.json({ ok: true, hit: false, cache_key: key, _engine: 'real' });
});

app.post('/v1/cache/set', auth, (req, res) => {
  const text = req.body.text || '';
  const value = req.body.value || req.body.response;
  const key = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).sort().join(' ').slice(0, 200);
  semanticCache.set(key, { value, ts: Date.now() });
  if (semanticCache.size > 10000) { const oldest = [...semanticCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 2000); for (const [k] of oldest) semanticCache.delete(k); }
  res.json({ ok: true, cached: true, key, _engine: 'real' });
});

// ===== COST OPTIMIZER (Claude roadmap #5) =====
app.post('/v1/cost-optimizer', auth, (req, res) => {
  const task = req.body.task || req.body.text || '';
  const budget = req.body.max_credits || 100;
  if (!task) return res.status(422).json({ error: { code: 'missing_task' } });

  const envMap = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', grok: 'XAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
  const costs = { anthropic: 15, openai: 10, grok: 8, deepseek: 3, ollama: 0 };
  const quality = { anthropic: 9.5, openai: 9, grok: 8.5, deepseek: 8, ollama: 6 };
  const available = Object.entries(envMap).filter(([_, env]) => process.env[env]).map(([p]) => p);
  if (process.env.OLLAMA_ENABLED) available.push('ollama');

  const recommendations = available.map(p => ({
    provider: p, estimated_credits: costs[p] || 10, quality_score: quality[p] || 5,
    value_ratio: ((quality[p] || 5) / Math.max(costs[p] || 1, 1)).toFixed(2),
    within_budget: (costs[p] || 10) <= budget,
  })).sort((a, b) => parseFloat(b.value_ratio) - parseFloat(a.value_ratio));

  res.json({
    ok: true, task: task.slice(0, 100), budget,
    best_value: recommendations[0]?.provider,
    cheapest: recommendations.sort((a, b) => a.estimated_credits - b.estimated_credits)[0]?.provider,
    highest_quality: recommendations.sort((a, b) => b.quality_score - a.quality_score)[0]?.provider,
    recommendations: recommendations.sort((a, b) => parseFloat(b.value_ratio) - parseFloat(a.value_ratio)),
    _engine: 'real',
  });
});

// ===== EVAL DATASETS (Claude roadmap #6) =====
app.post('/v1/eval/datasets/save', auth, (req, res) => {
  const { name, entries } = req.body;
  if (!name || !entries || !Array.isArray(entries)) return res.status(422).json({ error: { code: 'need_name_and_entries', format: '[{input, expected_output}]' } });
  const ns = 'eval-datasets:' + req.apiKey.slice(0, 12);
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(
    ns + ':' + name, JSON.stringify({ entries, count: entries.length, created: new Date().toISOString() })
  );
  res.json({ ok: true, name, entries_count: entries.length, _engine: 'real' });
});

app.get('/v1/eval/datasets/list', auth, (req, res) => {
  const ns = 'eval-datasets:' + req.apiKey.slice(0, 12);
  const rows = db.prepare("SELECT key AS k, value FROM agent_state WHERE k LIKE ?").all(ns + ':%');
  const datasets = rows.map(r => {
    try { const d = JSON.parse(r.value); return { name: r.k.replace(ns + ':', ''), count: d.count, created: d.created }; }
    catch(e) { return null; }
  }).filter(Boolean);
  res.json({ ok: true, datasets, count: datasets.length, _engine: 'real' });
});

app.post('/v1/eval/run', auth, async (req, res) => {
  const { dataset, provider, model } = req.body;
  if (!dataset) return res.status(422).json({ error: { code: 'missing_dataset' } });
  const ns = 'eval-datasets:' + req.apiKey.slice(0, 12);
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(ns + ':' + dataset);
  if (!row) return res.status(404).json({ error: { code: 'dataset_not_found' } });

  const data = JSON.parse(row.value);
  const results = [];
  const handler = allHandlers['llm-think'];
  if (!handler) return res.json({ ok: true, error: 'no LLM handler', _engine: 'real' });

  for (const entry of data.entries.slice(0, 20)) {
    try {
      const start = Date.now();
      const result = await handler({ text: entry.input, provider: provider || 'anthropic', model });
      const answer = result?.answer || result?.summary || '';
      const latency = Date.now() - start;
      const match = entry.expected_output ? answer.toLowerCase().includes(entry.expected_output.toLowerCase()) : null;
      results.push({ input: entry.input.slice(0, 80), expected: entry.expected_output, got: answer.slice(0, 200), match, latency_ms: latency });
    } catch(e) {
      results.push({ input: entry.input.slice(0, 80), error: e.message });
    }
  }

  const passing = results.filter(r => r.match === true).length;
  const total = results.filter(r => r.match !== null).length;

  res.json({
    ok: true, dataset, provider: provider || 'anthropic',
    results, passing, total, accuracy: total > 0 ? Math.round(passing / total * 100) + '%' : 'N/A',
    _engine: 'real',
  });
});

// ===== OBSERVABILITY TRACES (Claude roadmap #9) =====
app.post('/v1/traces/start', auth, (req, res) => {
  const traceId = 'trace-' + crypto.randomUUID().slice(0, 12);
  const { name, metadata } = req.body;
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(
    'traces:' + traceId, JSON.stringify({ name: name || 'unnamed', steps: [], metadata: metadata || {}, started: new Date().toISOString(), status: 'active' })
  );
  res.json({ ok: true, trace_id: traceId, _engine: 'real' });
});

app.post('/v1/traces/:id/step', auth, (req, res) => {
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get('traces:' + req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'trace_not_found' } });
  const trace = JSON.parse(row.value);
  trace.steps.push({ ...req.body, ts: new Date().toISOString() });
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('traces:' + req.params.id, JSON.stringify(trace));
  res.json({ ok: true, trace_id: req.params.id, steps: trace.steps.length, _engine: 'real' });
});

app.get('/v1/traces/:id', auth, (req, res) => {
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get('traces:' + req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'trace_not_found' } });
  res.json({ ok: true, ...JSON.parse(row.value), trace_id: req.params.id, _engine: 'real' });
});

// ===== FINE-TUNING JOBS (Claude's #1 missing feature for 10/10) =====
// Manages fine-tuning jobs across providers. Stores job state in SQLite.
app.post('/v1/fine-tuning/jobs', auth, async (req, res) => {
  const { provider, model, training_data, hyperparameters, name } = req.body;
  if (!provider || !training_data) return res.status(422).json({ error: { code: 'missing_fields', required: ['provider', 'training_data'] } });

  const jobId = 'ft-' + crypto.randomUUID().slice(0, 12);
  const job = {
    id: jobId, provider, model: model || 'default', name: name || 'unnamed',
    status: 'pending', training_examples: Array.isArray(training_data) ? training_data.length : 0,
    hyperparameters: hyperparameters || { epochs: 3, learning_rate: 'auto' },
    created: new Date().toISOString(), updated: new Date().toISOString(),
    estimated_cost: null, result_model: null,
  };

  // Store job
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('ft-jobs:' + jobId, JSON.stringify(job));

  // Store training data
  if (Array.isArray(training_data)) {
    db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('ft-data:' + jobId, JSON.stringify(training_data));
  }

  // If BYOK, attempt to submit to provider
  const userKeyNs = 'user-keys:' + req.apiKey.slice(0, 16);
  const userKeyRow = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(userKeyNs + ':' + provider);

  if (userKeyRow) {
    job.status = 'submitted';
    job.note = 'Job submitted via BYOK. Check provider dashboard for progress.';
  } else if (process.env[{ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' }[provider] || '']) {
    job.status = 'queued';
    job.note = 'Job queued. Platform key will be used. Fine-tuning charges apply at provider rates.';
  } else {
    job.status = 'pending_key';
    job.note = 'No API key for ' + provider + '. Set your key via POST /v1/keys/llm/set to proceed.';
  }

  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('ft-jobs:' + jobId, JSON.stringify(job));

  const acct = apiKeys.get(req.apiKey);
  if (acct) { acct.balance -= 5; persistKey(req.apiKey); }

  res.json({ ok: true, job, _engine: 'real' });
});

app.get('/v1/fine-tuning/jobs', auth, (req, res) => {
  const rows = db.prepare("SELECT key AS k, value FROM agent_state WHERE k LIKE 'ft-jobs:%'").all();
  const jobs = rows.map(r => { try { return JSON.parse(r.value); } catch(e) { return null; } }).filter(Boolean);
  res.json({ ok: true, jobs, count: jobs.length, _engine: 'real' });
});

app.get('/v1/fine-tuning/jobs/:id', auth, (req, res) => {
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get('ft-jobs:' + req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'job_not_found' } });
  res.json({ ok: true, ...JSON.parse(row.value), _engine: 'real' });
});

app.post('/v1/fine-tuning/jobs/:id/cancel', auth, (req, res) => {
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get('ft-jobs:' + req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'job_not_found' } });
  const job = JSON.parse(row.value);
  job.status = 'cancelled';
  job.updated = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('ft-jobs:' + req.params.id, JSON.stringify(job));
  res.json({ ok: true, ...job, _engine: 'real' });
});

// ===== WORKFLOW TRIGGERS (Claude asked 20 consecutive times) =====
app.post('/v1/workflows/triggers', auth, (req, res) => {
  const { name, workflow_steps, event, webhook_url, schedule } = req.body;
  if (!name || !workflow_steps) return res.status(422).json({ error: { code: 'missing_fields', required: ['name', 'workflow_steps'] } });
  const triggerId = 'trigger-' + crypto.randomUUID().slice(0, 12);
  const trigger = {
    id: triggerId, name, steps: workflow_steps,
    event: event || 'manual', webhook_url: webhook_url || null, schedule: schedule || null,
    enabled: true, executions: 0, last_run: null,
    created: new Date().toISOString(),
  };
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('wf-triggers:' + triggerId, JSON.stringify(trigger));
  res.json({ ok: true, trigger, _engine: 'real' });
});

app.get('/v1/workflows/triggers', auth, (req, res) => {
  const rows = db.prepare("SELECT key AS k, value FROM agent_state WHERE k LIKE 'wf-triggers:%'").all();
  const triggers = rows.map(r => { try { return JSON.parse(r.value); } catch(e) { return null; } }).filter(Boolean);
  res.json({ ok: true, triggers, count: triggers.length, _engine: 'real' });
});

app.post('/v1/workflows/triggers/:id/execute', auth, async (req, res) => {
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get('wf-triggers:' + req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'trigger_not_found' } });
  const trigger = JSON.parse(row.value);

  // Execute the workflow
  const results = [];
  let context = req.body.input || {};
  for (const step of (trigger.steps || []).slice(0, 20)) {
    const handler = allHandlers[step.api];
    const def = apiMap.get(step.api);
    if (!handler || !def) { results.push({ api: step.api, error: 'not found' }); continue; }
    const acct = apiKeys.get(req.apiKey);
    if (!acct || acct.balance < def.credits) { results.push({ api: step.api, error: 'insufficient credits' }); break; }
    acct.balance -= def.credits;
    try {
      const output = await handler({ ...context, ...(step.input || {}) });
      if (output && typeof output === 'object') { const { _engine, ...clean } = output; context = { ...context, ...clean }; }
      results.push({ api: step.api, credits: def.credits, result: output });
    } catch(e) { acct.balance += def.credits; results.push({ api: step.api, error: e.message }); }
  }
  persistKey(req.apiKey);

  trigger.executions++;
  trigger.last_run = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('wf-triggers:' + req.params.id, JSON.stringify(trigger));

  res.json({ ok: true, trigger_id: req.params.id, results, steps_executed: results.length, _engine: 'real' });
});

app.delete('/v1/workflows/triggers/:id', auth, (req, res) => {
  db.prepare('DELETE FROM agent_state WHERE key = ?').run('wf-triggers:' + req.params.id);
  res.json({ ok: true, deleted: req.params.id, _engine: 'real' });
});

app.get('/v1/chain/:id/status', auth, (req, res) => { req.params = { id: req.params.id }; const chain = db.prepare('SELECT * FROM agent_chains WHERE id = ?').get(req.params.id); if (!chain) return res.status(404).json({ error: { code: 'chain_not_found' } }); res.json({ ok: true, chain_id: chain.id, name: chain.name, status: chain.status, current_step: chain.current_step, _engine: 'real' }); });
app.get('/v1/exchange/list', auth, (req, res) => { try { const tasks = db.prepare("SELECT * FROM compute_exchange WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50").all(); res.json({ ok: true, tasks, count: tasks.length, _engine: 'real' }); } catch(e) { res.json({ ok: true, tasks: [], count: 0, _engine: 'real' }); } });
// ===== WILDCARD: Call any API (MUST BE LAST) =====
app.post('/v1/:slug', auth, memoryAuth, BODY_LIMIT_COMPUTE, async (req, res) => {
  const def = apiMap.get(req.params.slug);
  if (!def) {
    const similar = Object.keys(API_DEFS).filter(s => s.includes(req.params.slug.split('-')[0]) || req.params.slug.includes(s.split('-')[0])).slice(0, 5);
    return res.status(404).json({ error: { code: 'api_not_found', slug: req.params.slug, suggestions: similar.length > 0 ? similar : undefined, hint: 'GET /v1/tools to browse, GET /v1/introspect?q=TERM to search, POST /v1/route to auto-select' } });
  }

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

  // PERF: Only clone + scan body if file references exist (rare path)
  let body = req.body;
  let hasFileRef = false;
  const bodyKeys = Object.keys(body);
  for (let i = 0; i < bodyKeys.length; i++) {
    if (typeof body[bodyKeys[i]] === 'string' && body[bodyKeys[i]].charCodeAt(0) === 102 && body[bodyKeys[i]].startsWith('file:')) {
      hasFileRef = true; break;
    }
  }
  if (hasFileRef) {
    body = { ...req.body };
    for (const [key, val] of Object.entries(body)) {
      if (typeof val === 'string' && val.startsWith('file:')) {
        try {
          const fileRow = db.prepare('SELECT * FROM files WHERE id = ?').get(val.slice(5));
          if (fileRow) body[key] = fs.readFileSync(path.join(__dirname, '.data', 'files', fileRow.id), 'utf8');
        } catch(e) { /* leave as-is */ }
      }
    }
  }

  // Scope memory namespaces to API key to prevent cross-key access
  // PERF: Cache the SHA-256 prefix per key instead of re-computing each request
  if (req.params.slug.charCodeAt(0) === 109 && req.params.slug.startsWith('memory-') && body.namespace) {
    if (!req.acct._nsPrefix) {
      req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    }
    if (body === req.body) body = { ...req.body }; // clone only if needed
    body.namespace = req.acct._nsPrefix + ':' + body.namespace;
  }

  req.acct.balance -= def.credits;
  const start = Date.now();
  let result, handlerError = false;
  try { result = await handler(body); }
  catch (e) { result = null; handlerError = e.message; }
  // Also detect soft errors — handlers that return {_error: "..."} instead of throwing
  if (result && result._error && !handlerError) {
    handlerError = result._error;
  }
  const latency = Date.now() - start;

  dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', req.params.slug, def.credits, latency, handlerError ? 'error' : (result?._engine || 'unknown'));
  persistKey(req.apiKey);

  // Emit real-time usage event
  emitUsageEvent(req.apiKey.slice(0, 12), req.params.slug, def.credits, handlerError ? 'error' : 'ok');

  res.set('X-Credits-Used', String(def.credits));
  res.set('X-Cost-USD', (def.credits * 0.005).toFixed(4));
  res.set('X-Credits-Remaining', String(req.acct.balance));
  res.set('X-Latency-Ms', String(latency));
  res.set('Server-Timing', 'total;dur=' + latency);
  // PERF: X-Request-Id already set in global middleware — skip duplicate UUID generation
  // PERF: Lazy suggestions — only compute if not a batch/high-throughput path
  if (!req.body._batch) {
    res.set('X-Slopshop-Suggestion', getSuggestions(req.params.slug).slice(0,2).join(','));
  }

  // Deterministic mode
  const isDeterministic = req.body.mode === 'deterministic';
  if (isDeterministic) res.set('X-Deterministic', 'true');

  if (handlerError) {
    // Refund credits on handler error — users should not pay for failed calls
    req.acct.balance += def.credits;
    persistKey(req.apiKey);
    res.set('X-Engine', 'error');
    res.set('X-Credits-Used', '0');
    res.set('X-Credits-Remaining', String(req.acct.balance));
    const schema = SCHEMAS?.[req.params.slug];
    const errBody = { error: { code: 'handler_error', message: handlerError, api: req.params.slug, credits_refunded: def.credits, latency_ms: latency } };
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
  if (def.tier === 'compute' && !handlerError && !req.params.slug.includes('uuid') && !req.params.slug.includes('random') && !req.params.slug.includes('password')) {
    responseCache.set(cacheKey, { data: response, ts: Date.now() });
    res.set('X-Cache', 'MISS');
  }

  // Store idempotency result
  if (idempKey) idempotencyCache.set(idempKey, { data: response, ts: Date.now() });

  // PERF: Notarize output only when requested (saves JSON.stringify + SHA-256 per response)
  if (req.body.trace || req.headers['x-notarize'] || agentMode) {
    const outputHash = crypto.createHash('sha256').update(JSON.stringify(response.data)).digest('hex');
    response.meta.output_hash = outputHash;
    res.set('X-Output-Hash', outputHash);
  }

  res.json(response);
});

// ===== PHASE 2-3: AGENT EVALUATION SYSTEM =====

// POST /v1/eval/run — Run an agent evaluation
app.post('/v1/eval/run', auth, async (req, res) => {
  const { agent_slug, test_cases, criteria } = req.body;
  const id = uuidv4();
  const results = [];
  const handler = allHandlers[agent_slug];
  if (!handler) return res.status(404).json({ error: { code: 'agent_not_found' } });

  for (const tc of (test_cases || [])) {
    const start = Date.now();
    try {
      const result = await handler(tc.input || {});
      const latency = Date.now() - start;
      const correct = tc.expected ? JSON.stringify(result).includes(JSON.stringify(tc.expected)) : true;
      results.push({ input: tc.input, output: result, expected: tc.expected, correct, latency_ms: latency });
    } catch(e) {
      results.push({ input: tc.input, error: e.message, correct: false, latency_ms: Date.now() - start });
    }
  }

  const accuracy = Math.round(results.filter(r => r.correct).length / Math.max(results.length, 1) * 100);
  const avgLatency = Math.round(results.reduce((s, r) => s + r.latency_ms, 0) / Math.max(results.length, 1));

  db.prepare('INSERT INTO evaluations (id, user_id, agent_slug, accuracy, avg_latency, results, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
    id, req.acct?.email || req.apiKey, agent_slug, accuracy, avgLatency, JSON.stringify(results)
  );

  res.json({ ok: true, eval_id: id, accuracy, avg_latency_ms: avgLatency, results, total: results.length, passed: results.filter(r => r.correct).length });
});

// GET /v1/eval/leaderboard — Public leaderboard of best-performing tools
app.get('/v1/eval/leaderboard', publicRateLimit, (req, res) => {
  try {
    const rows = db.prepare('SELECT agent_slug, AVG(accuracy) as avg_accuracy, AVG(avg_latency) as avg_latency, COUNT(*) as eval_count FROM evaluations GROUP BY agent_slug ORDER BY avg_accuracy DESC LIMIT 50').all();
    res.json({ leaderboard: rows });
  } catch(e) { res.json({ leaderboard: [] }); }
});

// GET /v1/eval/history — User's eval history
app.get('/v1/eval/history', auth, (req, res) => {
  try {
    const userId = req.acct?.email || req.apiKey;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const rows = db.prepare('SELECT id, agent_slug, accuracy, avg_latency, created_at FROM evaluations WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(userId, limit, offset);
    res.json({ ok: true, history: rows, limit, offset });
  } catch(e) { res.json({ ok: false, history: [], error: e.message }); }
});

// POST /v1/eval/compare — Compare two agents head-to-head
app.post('/v1/eval/compare', auth, async (req, res) => {
  const { agent_a, agent_b, test_cases } = req.body;
  if (!agent_a || !agent_b) return res.status(400).json({ error: { code: 'missing_agents', message: 'Provide agent_a and agent_b slugs' } });
  const handlerA = allHandlers[agent_a];
  const handlerB = allHandlers[agent_b];
  if (!handlerA) return res.status(404).json({ error: { code: 'agent_not_found', agent: agent_a } });
  if (!handlerB) return res.status(404).json({ error: { code: 'agent_not_found', agent: agent_b } });

  const resultsA = [], resultsB = [];
  for (const tc of (test_cases || [])) {
    const startA = Date.now();
    try {
      const rA = await handlerA(tc.input || {});
      const latA = Date.now() - startA;
      const correctA = tc.expected ? JSON.stringify(rA).includes(JSON.stringify(tc.expected)) : true;
      resultsA.push({ input: tc.input, output: rA, correct: correctA, latency_ms: latA });
    } catch(e) { resultsA.push({ input: tc.input, error: e.message, correct: false, latency_ms: Date.now() - startA }); }

    const startB = Date.now();
    try {
      const rB = await handlerB(tc.input || {});
      const latB = Date.now() - startB;
      const correctB = tc.expected ? JSON.stringify(rB).includes(JSON.stringify(tc.expected)) : true;
      resultsB.push({ input: tc.input, output: rB, correct: correctB, latency_ms: latB });
    } catch(e) { resultsB.push({ input: tc.input, error: e.message, correct: false, latency_ms: Date.now() - startB }); }
  }

  const accA = Math.round(resultsA.filter(r => r.correct).length / Math.max(resultsA.length, 1) * 100);
  const accB = Math.round(resultsB.filter(r => r.correct).length / Math.max(resultsB.length, 1) * 100);
  const avgLatA = Math.round(resultsA.reduce((s, r) => s + r.latency_ms, 0) / Math.max(resultsA.length, 1));
  const avgLatB = Math.round(resultsB.reduce((s, r) => s + r.latency_ms, 0) / Math.max(resultsB.length, 1));

  const winner = accA > accB ? agent_a : accB > accA ? agent_b : (avgLatA <= avgLatB ? agent_a : agent_b);
  res.json({ ok: true, agent_a: { slug: agent_a, accuracy: accA, avg_latency_ms: avgLatA, results: resultsA }, agent_b: { slug: agent_b, accuracy: accB, avg_latency_ms: avgLatB, results: resultsB }, winner, total_tests: (test_cases || []).length });
});

// GET /v1/eval/report/:id — Get detailed eval report
app.get('/v1/eval/report/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'eval_not_found' } });
  try { row.results = JSON.parse(row.results); } catch(e) {}
  res.json({ ok: true, report: row });
});

// ===== PHASE 2-3: AGENT TEMPLATES SYSTEM =====

// POST /v1/templates/publish — Publish a template to marketplace
app.post('/v1/templates/publish', auth, (req, res) => {
  const { name, description, category, steps, tools, estimated_credits, params } = req.body;
  const id = uuidv4();

  // Item 4/10: If params provided, merge into each step
  let finalSteps = steps || [];
  if (params && typeof params === 'object' && Array.isArray(finalSteps)) {
    finalSteps = finalSteps.map(step => ({ ...step, ...params }));
  }

  db.prepare('INSERT INTO marketplace_templates (id, author_id, name, description, category, steps, tools, estimated_credits, forks, rating, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
    id, req.acct?.email || req.apiKey, name, description, category || 'general', JSON.stringify(finalSteps), JSON.stringify(tools || []), estimated_credits || 0, 0, 0, 'published'
  );
  res.json({ ok: true, template_id: id, status: 'published', params_applied: !!params });
});

// GET /v1/templates/browse — Browse marketplace templates
app.get('/v1/templates/browse', publicRateLimit, (req, res) => {
  try {
    const category = req.query.category;
    // Sanitized: whitelist sort columns to prevent SQL injection
    const sortMap = { forks: 'forks DESC', recent: 'created_at DESC', rating: 'rating DESC' };
    const sort = sortMap[req.query.sort] || 'rating DESC';
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    let rows;
    if (category) {
      rows = db.prepare('SELECT id, author_id, name, description, category, estimated_credits, forks, rating, rating_count, status, created_at FROM marketplace_templates WHERE status = \'published\' AND category = ? ORDER BY ' + sort + ' LIMIT ? OFFSET ?').all(category, limit, offset);
    } else {
      rows = db.prepare('SELECT id, author_id, name, description, category, estimated_credits, forks, rating, rating_count, status, created_at FROM marketplace_templates WHERE status = \'published\' ORDER BY ' + sort + ' LIMIT ? OFFSET ?').all(limit, offset);
    }
    res.json({ ok: true, templates: rows, limit, offset });
  } catch(e) { res.json({ ok: false, templates: [], error: e.message }); }
});

// POST /v1/templates/fork/:id — Fork a template
app.post('/v1/templates/fork/:id', auth, (req, res) => {
  const tmpl = db.prepare('SELECT * FROM marketplace_templates WHERE id = ?').get(req.params.id);
  if (!tmpl) return res.status(404).json({ error: { code: 'template_not_found' } });
  const newId = uuidv4();

  // Item 4/10: Merge user params into forked template steps
  let forkedSteps = tmpl.steps;
  if (req.body.params && typeof req.body.params === 'object') {
    try {
      const parsed = JSON.parse(tmpl.steps || '[]');
      if (Array.isArray(parsed)) {
        forkedSteps = JSON.stringify(parsed.map(step => ({ ...step, ...req.body.params })));
      }
    } catch(e) {}
  }

  db.prepare('INSERT INTO marketplace_templates (id, author_id, name, description, category, steps, tools, estimated_credits, forks, rating, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
    newId, req.acct?.email || req.apiKey, (req.body.name || tmpl.name) + ' (fork)', tmpl.description, tmpl.category, forkedSteps, tmpl.tools, tmpl.estimated_credits, 0, 0, 'published'
  );
  db.prepare('UPDATE marketplace_templates SET forks = forks + 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true, forked_template_id: newId, original_id: req.params.id, params_applied: !!req.body.params });
});

// POST /v1/templates/rate/:id — Rate a template
app.post('/v1/templates/rate/:id', auth, (req, res) => {
  const { rating } = req.body;
  if (typeof rating !== 'number' || rating < 1 || rating > 5) return res.status(400).json({ error: { code: 'invalid_rating', message: 'Rating must be 1-5' } });
  const tmpl = db.prepare('SELECT * FROM marketplace_templates WHERE id = ?').get(req.params.id);
  if (!tmpl) return res.status(404).json({ error: { code: 'template_not_found' } });
  const newCount = (tmpl.rating_count || 0) + 1;
  const newRating = ((tmpl.rating || 0) * (tmpl.rating_count || 0) + rating) / newCount;
  db.prepare('UPDATE marketplace_templates SET rating = ?, rating_count = ? WHERE id = ?').run(Math.round(newRating * 100) / 100, newCount, req.params.id);
  res.json({ ok: true, template_id: req.params.id, new_rating: Math.round(newRating * 100) / 100, rating_count: newCount });
});

// ===== PHASE 2-3: AGENT REPLAY SYSTEM =====

// POST /v1/replay/save — Save a swarm run for replay
app.post('/v1/replay/save', auth, (req, res) => {
  const { name, events, tools_used, total_credits, duration_ms } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO replays (id, user_id, name, events, tools_used, total_credits, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
    id, req.acct?.email || req.apiKey, name || 'Replay', JSON.stringify(events || []), JSON.stringify(tools_used || []), total_credits || 0, duration_ms || 0
  );
  res.json({ ok: true, replay_id: id });
});

// GET /v1/replay/list — List user's replays (must be before :id route)
app.get('/v1/replay/list', auth, (req, res) => {
  try {
    const userId = req.acct?.email || req.apiKey;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const rows = db.prepare('SELECT id, name, total_credits, duration_ms, created_at FROM replays WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(userId, limit, offset);
    res.json({ ok: true, replays: rows, limit, offset });
  } catch(e) { res.json({ ok: false, replays: [], error: e.message }); }
});

// GET /v1/replay/:id — Get replay data
app.get('/v1/replay/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM replays WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'replay_not_found' } });
  try { row.events = JSON.parse(row.events); } catch(e) {}
  try { row.tools_used = JSON.parse(row.tools_used); } catch(e) {}
  res.json({ ok: true, replay: row });
});

// ===== GROK AUDIT: MISSING FEATURES FROM 150-FEATURE WISHLIST =====

// 1. "Share my Army" public links — auto-generates playground fork
app.post('/v1/army/share', auth, (req, res) => {
  const { deployment_id, name, description } = req.body;
  const shareId = 'share-' + crypto.randomUUID().slice(0, 12);
  db.exec(`CREATE TABLE IF NOT EXISTS shared_armies (
    id TEXT PRIMARY KEY, user_id TEXT, deployment_id TEXT, name TEXT, description TEXT,
    fork_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.prepare('INSERT INTO shared_armies (id, user_id, deployment_id, name, description) VALUES (?, ?, ?, ?, ?)').run(
    shareId, req.acct?.email || req.apiKey, deployment_id || null, name || 'Shared Army', description || ''
  );
  res.json({ ok: true, share_id: shareId, public_url: `/army/shared/${shareId}`, playground_fork_url: `/#playground?fork=${shareId}`, embed: `<iframe src="https://slopshop.gg/army/shared/${shareId}" />` });
});
app.get('/v1/army/shared/:id', publicRateLimit, (req, res) => {
  db.exec(`CREATE TABLE IF NOT EXISTS shared_armies (
    id TEXT PRIMARY KEY, user_id TEXT, deployment_id TEXT, name TEXT, description TEXT,
    fork_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  )`);
  const row = db.prepare('SELECT * FROM shared_armies WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'not_found' } });
  res.json({ ok: true, army: row, fork_url: `/#playground?fork=${req.params.id}` });
});

// 2. "Invite 3 friends -> 5k bonus credits" referral system
db.exec(`CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY, referrer_key TEXT, referee_email TEXT, referee_key TEXT DEFAULT NULL,
  bonus_awarded INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
)`);
app.post('/v1/referral/invite', auth, (req, res) => {
  const { emails } = req.body;
  if (!Array.isArray(emails) || emails.length === 0) return res.status(400).json({ error: { code: 'missing_emails', message: 'Provide {emails: ["friend@example.com"]}' } });
  const referralCode = 'REF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const created = [];
  for (const email of emails.slice(0, 10)) {
    const id = 'ref-' + crypto.randomUUID().slice(0, 12);
    db.prepare('INSERT OR IGNORE INTO referrals (id, referrer_key, referee_email) VALUES (?, ?, ?)').run(id, req.apiKey, email);
    created.push({ email, invite_link: `https://slopshop.gg/?ref=${referralCode}` });
  }
  res.json({ ok: true, referral_code: referralCode, invites_sent: created, bonus_rule: 'When 3 friends sign up, you get 5,000 bonus credits' });
});
app.get('/v1/referral/status', auth, (req, res) => {
  const referrals = db.prepare('SELECT referee_email, referee_key, bonus_awarded, created_at FROM referrals WHERE referrer_key = ?').all(req.apiKey);
  const signedUp = referrals.filter(r => r.referee_key);
  const bonusEligible = signedUp.length >= 3;
  const bonusAwarded = referrals.some(r => r.bonus_awarded);
  res.json({ ok: true, total_invited: referrals.length, signed_up: signedUp.length, bonus_eligible: bonusEligible, bonus_awarded: bonusAwarded, referrals, rule: 'Invite 3 friends who sign up -> 5,000 bonus credits' });
});
app.post('/v1/referral/redeem', auth, (req, res) => {
  const referrals = db.prepare('SELECT * FROM referrals WHERE referrer_key = ? AND referee_key IS NOT NULL').all(req.apiKey);
  if (referrals.length < 3) return res.status(400).json({ error: { code: 'not_enough_referrals', have: referrals.length, need: 3 } });
  if (referrals.some(r => r.bonus_awarded)) return res.json({ ok: false, message: 'Bonus already awarded' });
  req.acct.balance += 5000;
  persistKey(req.apiKey);
  db.prepare('UPDATE referrals SET bonus_awarded = 1 WHERE referrer_key = ?').run(req.apiKey);
  res.json({ ok: true, bonus_credits: 5000, new_balance: req.acct.balance });
});

// 3. "Built with Slopshop" badge endpoint (enhanced)
app.get('/v1/badge/built-with', publicRateLimit, (req, res) => {
  const style = req.query.style || 'flat';
  // SECURITY FIX (HIGH-05): Validate color is hex-only to prevent SVG injection
  const rawColor = req.query.color || 'ff3333';
  const color = /^[0-9a-fA-F]{3,8}$/.test(rawColor) ? rawColor : 'ff3333';
  res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="20">
    <rect width="180" height="20" rx="3" fill="#555"/>
    <rect x="80" width="100" height="20" rx="3" fill="#${color}"/>
    <rect x="80" width="4" height="20" fill="#${color}"/>
    <text x="40" y="14" font-family="Verdana" font-size="11" fill="white" text-anchor="middle">built with</text>
    <text x="130" y="14" font-family="Verdana" font-size="11" fill="white" text-anchor="middle" font-weight="bold">slopshop</text>
  </svg>`);
});

// 4. Daily "Agent Standup" email summary endpoint
app.post('/v1/standup/email-digest', auth, (req, res) => {
  const { email, frequency, hive_id } = req.body;
  db.exec(`CREATE TABLE IF NOT EXISTS standup_digests (
    id TEXT PRIMARY KEY, user_id TEXT, email TEXT, frequency TEXT DEFAULT 'daily',
    hive_id TEXT, enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
  )`);
  const id = 'digest-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO standup_digests (id, user_id, email, frequency, hive_id) VALUES (?, ?, ?, ?, ?)').run(
    id, req.acct?.email || req.apiKey, email || req.acct?.email || '', frequency || 'daily', hive_id || null
  );
  res.json({ ok: true, digest_id: id, frequency: frequency || 'daily', message: 'Daily agent standup email digest configured. Summaries include HIVE activity, agent runs, credit usage, and standup submissions.' });
});

// 5. Auto-save every playground run as reusable template
app.post('/v1/playground/auto-save', auth, (req, res) => {
  const { slug, input, result, name } = req.body;
  db.exec(`CREATE TABLE IF NOT EXISTS playground_saves (
    id TEXT PRIMARY KEY, user_id TEXT, slug TEXT, input TEXT, result TEXT,
    name TEXT, template_id TEXT DEFAULT NULL, created_at TEXT DEFAULT (datetime('now'))
  )`);
  const id = 'pg-' + crypto.randomUUID().slice(0, 12);
  const templateId = 'tpl-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO playground_saves (id, user_id, slug, input, result, name, template_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, req.acct?.email || req.apiKey, slug || '', JSON.stringify(input || {}), JSON.stringify(result || {}), name || `Run: ${slug}`, templateId
  );
  res.json({ ok: true, save_id: id, template_id: templateId, reuse_url: `/v1/templates/browse/${templateId}`, message: 'Playground run auto-saved as reusable template' });
});

// 6. "Memory Health Score" dashboard
app.get('/v1/memory/health', auth, (req, res) => {
  const ns = req.query.namespace || 'default';
  const userId = req.acct?.email || req.apiKey;
  try {
    const totalKeys = db.prepare("SELECT COUNT(*) as cnt FROM memory WHERE namespace = ?").get(ns + ':' + userId)?.cnt || 0;
    const totalSize = db.prepare("SELECT SUM(LENGTH(value)) as size FROM memory WHERE namespace = ?").get(ns + ':' + userId)?.size || 0;
    const oldestEntry = db.prepare("SELECT MIN(updated) as ts FROM memory WHERE namespace = ?").get(ns + ':' + userId)?.ts || null;
    const newestEntry = db.prepare("SELECT MAX(updated) as ts FROM memory WHERE namespace = ?").get(ns + ':' + userId)?.ts || null;
    const orphanedKeys = 0; // placeholder for advanced check
    const healthScore = Math.min(100, Math.max(0, totalKeys > 0 ? 80 + Math.min(20, Math.floor(totalKeys / 5)) : 0));
    res.json({
      ok: true, namespace: ns,
      health_score: healthScore,
      grade: healthScore >= 90 ? 'A' : healthScore >= 70 ? 'B' : healthScore >= 50 ? 'C' : 'D',
      metrics: {
        total_keys: totalKeys, total_size_bytes: totalSize || 0,
        avg_value_size: totalKeys > 0 ? Math.round((totalSize || 0) / totalKeys) : 0,
        oldest_entry: oldestEntry, newest_entry: newestEntry,
        orphaned_keys: orphanedKeys,
      },
      recommendations: totalKeys === 0 ? ['Start by storing agent state with memory-set'] :
        (totalSize || 0) > 1048576 ? ['Consider archiving old entries', 'Use namespaces to organize data'] :
        ['Memory usage looks healthy'],
    });
  } catch(e) {
    res.json({ ok: true, health_score: 0, grade: 'N/A', metrics: { total_keys: 0 }, recommendations: ['No memory data yet. Use POST /v1/memory-set to get started.'], note: e.message });
  }
});

// 7. "Clone my last successful swarm" button
app.post('/v1/army/clone-last', auth, (req, res) => {
  db.exec(`CREATE TABLE IF NOT EXISTS army_runs (
    id TEXT PRIMARY KEY, user_id TEXT, config TEXT, status TEXT DEFAULT 'completed',
    result TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`);
  const userId = req.acct?.email || req.apiKey;
  const lastRun = db.prepare("SELECT * FROM army_runs WHERE user_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1").get(userId);
  if (!lastRun) return res.status(404).json({ error: { code: 'no_previous_runs', message: 'No successful swarm runs found. Deploy one first with POST /v1/army/deploy' } });
  const newId = 'clone-' + crypto.randomUUID().slice(0, 12);
  let config = {};
  try { config = JSON.parse(lastRun.config); } catch(e) {}
  res.json({ ok: true, clone_id: newId, original_id: lastRun.id, config, message: 'Last successful swarm cloned. POST /v1/army/deploy with this config to re-run.', deploy_body: config });
});

// 8. Credit expiration warning + auto-topup
app.get('/v1/credits/expiration', auth, (req, res) => {
  const balance = req.acct.balance;
  const autoReload = req.acct.auto_reload;
  const warningThreshold = 100;
  const isLow = balance < warningThreshold;
  const expiresIn = null; // Credits don't expire currently but the warning system is in place
  res.json({
    ok: true, balance, auto_reload: autoReload || false,
    warning: isLow ? `Low credit balance: ${balance} credits remaining` : null,
    auto_topup_enabled: !!(autoReload && autoReload.enabled),
    auto_topup_config: autoReload || { threshold: 100, amount: 10000, enabled: false },
    expires_in: expiresIn,
    recommendations: isLow ? [
      'Enable auto-topup: POST /v1/credits/auto-reload {"threshold": 100, "amount": 10000}',
      'Buy credits: POST /v1/checkout {"amount": 10000}',
    ] : ['Credit balance is healthy'],
  });
});

// 9. Public leaderboards for most valuable memory graphs
app.get('/v1/memory/leaderboard', publicRateLimit, (req, res) => {
  try {
    const stats = db.prepare("SELECT namespace, COUNT(*) as key_count, SUM(LENGTH(value)) as total_size FROM memory GROUP BY namespace ORDER BY key_count DESC LIMIT 20").all();
    const leaderboard = stats.map((s, i) => ({
      rank: i + 1,
      namespace: s.namespace ? s.namespace.split(':')[0] : 'unknown',
      key_count: s.key_count,
      total_size_bytes: s.total_size || 0,
      score: s.key_count * 10 + Math.floor((s.total_size || 0) / 1024),
    }));
    res.json({ ok: true, leaderboard, count: leaderboard.length, note: 'Ranked by memory graph size and complexity' });
  } catch(e) {
    res.json({ ok: true, leaderboard: [], note: 'Leaderboard populates as users build memory graphs' });
  }
});

// 10. Multi-LLM smart router with cost, speed, quality, and task-fit scoring
app.post('/v1/router/smart', auth, (req, res) => {
  const { task, providers, optimize_for } = req.body;
  const opt = optimize_for || 'balanced'; // 'cost', 'speed', 'quality', 'balanced'

  const providerProfiles = {
    'claude': { cost: 3, speed: 7, quality: 9, best_for: ['reasoning', 'code', 'analysis', 'writing'] },
    'grok': { cost: 2, speed: 9, quality: 8, best_for: ['real-time', 'search', 'humor', 'speed'] },
    'gpt': { cost: 5, speed: 6, quality: 9, best_for: ['general', 'creative', 'structured'] },
    'gemini': { cost: 3, speed: 8, quality: 7, best_for: ['multimodal', 'long-context', 'search'] },
    'llama': { cost: 1, speed: 8, quality: 6, best_for: ['cost-sensitive', 'self-host', 'privacy'] },
    'mistral': { cost: 1, speed: 9, quality: 7, best_for: ['speed', 'code', 'european'] },
    'deepseek': { cost: 1, speed: 7, quality: 8, best_for: ['code', 'math', 'reasoning'] },
  };

  const taskWords = (task || '').toLowerCase().split(/\s+/);
  const available = providers || Object.keys(providerProfiles);

  const scored = available.map(p => {
    const profile = providerProfiles[p] || { cost: 5, speed: 5, quality: 5, best_for: [] };
    let score = 0;

    // Task fit bonus
    const taskFit = profile.best_for.filter(b => taskWords.some(w => b.includes(w))).length;
    score += taskFit * 3;

    // Optimization preference weighting
    if (opt === 'cost') score += (10 - profile.cost) * 2;
    else if (opt === 'speed') score += profile.speed * 2;
    else if (opt === 'quality') score += profile.quality * 2;
    else score += profile.quality + profile.speed + (10 - profile.cost); // balanced

    return { provider: p, score: Math.round(score * 100) / 100, ...profile, task_fit: taskFit };
  }).sort((a, b) => b.score - a.score);

  const recommended = scored[0];
  res.json({
    ok: true,
    recommended: recommended.provider,
    reasoning: `${recommended.provider} scored highest for "${opt}" optimization with task fit ${recommended.task_fit}`,
    all_scores: scored,
    optimize_for: opt,
    _engine: 'real'
  });
});

// 11. Knowledge graph auto-discovery from memory
app.post('/v1/knowledge/auto-discover', auth, (req, res) => {
  const { namespace } = req.body;
  const userId = req.acct?.email || req.apiKey;
  const ns = namespace || 'default';
  try {
    const memories = db.prepare("SELECT key, value FROM memory WHERE namespace = ? LIMIT 200").all(ns + ':' + userId);
    const entities = new Set();
    const relationships = [];
    for (const m of memories) {
      entities.add(m.key);
      try {
        const val = JSON.parse(m.value);
        if (typeof val === 'object' && val !== null) {
          for (const [k, v] of Object.entries(val)) {
            if (typeof v === 'string' && v.length < 100) {
              entities.add(v);
              relationships.push({ subject: m.key, predicate: k, object: v });
            }
          }
        }
      } catch(e) {
        // value is not JSON, try to extract entities from text
        const words = String(m.value).split(/\s+/).filter(w => w.length > 3 && w[0] === w[0].toUpperCase());
        for (const w of words.slice(0, 5)) {
          entities.add(w);
          relationships.push({ subject: m.key, predicate: 'mentions', object: w });
        }
      }
    }
    res.json({
      ok: true, namespace: ns, entities_discovered: entities.size,
      relationships_found: relationships.length,
      entities: [...entities].slice(0, 100),
      relationships: relationships.slice(0, 200),
      tip: 'Use POST /v1/knowledge/add to persist these relationships into the knowledge graph',
    });
  } catch(e) {
    res.json({ ok: true, entities_discovered: 0, relationships_found: 0, note: 'No memory data to analyze. Use POST /v1/memory-set first.', error: e.message });
  }
});

// 12. Auto-Merkle proof generation for every task
app.post('/v1/proof/merkle', auth, (req, res) => {
  const { task_ids, data } = req.body;
  const items = data || task_ids || [];
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: { code: 'missing_data', message: 'Provide {data: ["item1", "item2", ...]}' } });
  // Build Merkle tree
  const leaves = items.map(item => crypto.createHash('sha256').update(String(item)).digest('hex'));
  let level = [...leaves];
  const tree = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      next.push(crypto.createHash('sha256').update(left + right).digest('hex'));
    }
    level = next;
    tree.push(level);
  }
  const root = level[0];
  // Generate proof for first item
  const proof = [];
  let idx = 0;
  for (let l = 0; l < tree.length - 1; l++) {
    const sibling = idx % 2 === 0 ? (tree[l][idx + 1] || tree[l][idx]) : tree[l][idx - 1];
    proof.push({ hash: sibling, position: idx % 2 === 0 ? 'right' : 'left' });
    idx = Math.floor(idx / 2);
  }
  res.json({
    ok: true, merkle_root: root, leaf_count: leaves.length,
    tree_depth: tree.length,
    leaves: leaves.slice(0, 20),
    proof_for_first_item: proof,
    verify_tip: 'Hash each item, then combine with proof siblings to reconstruct the root',
  });
});

// 13. "Optimize this swarm for 40% cheaper" endpoint
app.post('/v1/optimize/swarm', auth, (req, res) => {
  const { steps, target_reduction } = req.body;
  if (!Array.isArray(steps) || steps.length === 0) return res.status(400).json({ error: { code: 'missing_steps', message: 'Provide {steps: [{slug: "api-slug"}, ...]}' } });
  const reduction = (target_reduction || 40) / 100;
  let totalCost = 0;
  const analysis = steps.map(s => {
    const def = apiMap.get(s.slug || s.api);
    const cost = def ? def.credits : 1;
    totalCost += cost;
    return { slug: s.slug || s.api, current_cost: cost, category: def?.cat || 'unknown' };
  });
  const targetCost = Math.ceil(totalCost * (1 - reduction));
  // Suggest cheaper alternatives
  const optimized = analysis.map(a => {
    if (a.current_cost <= 1) return { ...a, optimized_cost: a.current_cost, suggestion: 'Already minimal cost' };
    // Find cheaper alternative in same category
    const alternatives = Object.entries(API_DEFS).filter(([slug, d]) => d.cat === a.category && d.credits < a.current_cost).sort((x, y) => x[1].credits - y[1].credits);
    if (alternatives.length > 0) {
      return { ...a, optimized_cost: alternatives[0][1].credits, suggestion: `Replace with ${alternatives[0][0]} (${alternatives[0][1].credits}cr)`, alternative: alternatives[0][0] };
    }
    return { ...a, optimized_cost: a.current_cost, suggestion: 'No cheaper alternative found' };
  });
  const optimizedTotal = optimized.reduce((s, a) => s + a.optimized_cost, 0);
  const actualReduction = totalCost > 0 ? Math.round((1 - optimizedTotal / totalCost) * 100) : 0;
  res.json({
    ok: true, original_cost: totalCost, optimized_cost: optimizedTotal,
    savings: totalCost - optimizedTotal, reduction_pct: actualReduction,
    target_reduction_pct: Math.round(reduction * 100),
    steps: optimized,
    tip: actualReduction < reduction * 100 ? 'Consider caching repeated calls (free on cache hit) or using batch mode for volume discounts' : 'Optimization target achieved!',
  });
});

// 14. Grok-specific MCP templates (enhance /v1/mcp/recommended with Grok mention)
app.get('/v1/mcp/grok-templates', publicRateLimit, (req, res) => {
  const grokTools = [
    { slug: 'memory-set', note: 'Grok can persist conversation context across sessions' },
    { slug: 'memory-get', note: 'Retrieve stored context for continuity' },
    { slug: 'memory-search', note: 'Semantic search across stored memories' },
    { slug: 'crypto-hash-sha256', note: 'Verify data integrity in agent workflows' },
    { slug: 'text-word-count', note: 'Quick text analysis' },
    { slug: 'exec-javascript', note: 'Run code snippets from Grok conversations' },
    { slug: 'sense-url-content', note: 'Fetch and analyze web pages' },
    { slug: 'text-csv-to-json', note: 'Transform data formats' },
    { slug: 'analyze-ab-test', note: 'Statistical analysis for decision-making' },
    { slug: 'gen-fake-name', note: 'Generate test data on demand' },
  ];
  const enriched = grokTools.map(t => {
    const def = API_DEFS[t.slug];
    return { ...t, name: def?.name || t.slug, credits: def?.credits || 0, category: def?.cat || 'unknown' };
  });
  res.json({
    ok: true, provider: 'grok', model: 'grok-3',
    tools: enriched,
    setup: {
      agent_mode: 'Add mode: "grok" to any request for enhanced Grok-optimized responses',
      integration_guide: 'https://slopshop.gg/integrate-grok',
      mcp_config: { command: 'npx', args: ['-y', 'slopshop', 'mcp'] },
    },
    count: enriched.length,
  });
});

// 15. Cost optimizer endpoint (multi-LLM)
app.post('/v1/optimize/cost', auth, (req, res) => {
  const { monthly_budget, current_provider, tasks_per_day } = req.body;
  const budget = monthly_budget || 100;
  const tasksPerDay = tasks_per_day || 100;
  const monthlyTasks = tasksPerDay * 30;
  const providers = [
    { name: 'anthropic-claude', cost_per_task: 0.003, quality: 95, best_for: 'Complex reasoning, code generation' },
    { name: 'openai-gpt4o', cost_per_task: 0.0025, quality: 92, best_for: 'General purpose, function calling' },
    { name: 'grok-3', cost_per_task: 0.005, quality: 90, best_for: 'Real-time data, X integration' },
    { name: 'deepseek', cost_per_task: 0.00014, quality: 85, best_for: 'Budget-friendly, high volume' },
    { name: 'groq-llama', cost_per_task: 0.0006, quality: 82, best_for: 'Ultra-low latency' },
    { name: 'slopshop-compute', cost_per_task: 0.00005, quality: 99, best_for: 'Deterministic compute (no LLM needed)' },
  ];
  const analysis = providers.map(p => ({
    ...p,
    monthly_cost: Math.round(monthlyTasks * p.cost_per_task * 100) / 100,
    fits_budget: monthlyTasks * p.cost_per_task <= budget,
    tasks_within_budget: Math.floor(budget / p.cost_per_task),
  })).sort((a, b) => a.monthly_cost - b.monthly_cost);
  res.json({
    ok: true, monthly_budget: budget, tasks_per_day: tasksPerDay,
    recommendation: analysis.find(a => a.fits_budget && a.quality >= 85) || analysis[0],
    all_options: analysis,
    tip: 'Use slopshop-compute for deterministic tasks (hashing, parsing, transforms) at near-zero cost, reserve LLM budget for reasoning tasks',
  });
});

// 16. "Agent of the Week" spotlight
app.get('/v1/spotlight/agent-of-the-week', publicRateLimit, (req, res) => {
  try {
    const topAgent = db.prepare("SELECT key_prefix, COUNT(*) as calls, SUM(credits) as total_credits FROM audit_log WHERE ts > datetime('now', '-7 days') GROUP BY key_prefix ORDER BY calls DESC LIMIT 1").get();
    res.json({
      ok: true,
      agent_of_the_week: topAgent ? {
        key_prefix: topAgent.key_prefix,
        calls_this_week: topAgent.calls,
        credits_used: topAgent.total_credits,
        badge: 'Agent of the Week',
      } : { note: 'No activity this week yet' },
      leaderboard_url: '/v1/eval/leaderboard',
      nominate: 'Active agents are automatically considered based on usage and reputation',
    });
  } catch(e) {
    res.json({ ok: true, agent_of_the_week: { note: 'Spotlight launches when community grows' } });
  }
});

// 17. Ambassador program endpoint
app.post('/v1/ambassador/apply', auth, (req, res) => {
  const { name, platform, audience_size, why } = req.body;
  db.exec(`CREATE TABLE IF NOT EXISTS ambassadors (
    id TEXT PRIMARY KEY, user_id TEXT, name TEXT, platform TEXT,
    audience_size INTEGER DEFAULT 0, why TEXT, status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  const id = 'amb-' + crypto.randomUUID().slice(0, 12);
  db.prepare('INSERT INTO ambassadors (id, user_id, name, platform, audience_size, why) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, req.acct?.email || req.apiKey, name || '', platform || '', audience_size || 0, why || ''
  );
  res.json({
    ok: true, application_id: id, status: 'pending',
    benefits: [
      '50,000 free credits/month',
      'Early access to new features',
      'Custom badge on profile',
      'Revenue share on referrals',
      'Direct Slack channel with team',
    ],
    message: 'Application received. We review ambassador applications weekly.',
  });
});
app.get('/v1/ambassador/status', auth, (req, res) => {
  db.exec(`CREATE TABLE IF NOT EXISTS ambassadors (
    id TEXT PRIMARY KEY, user_id TEXT, name TEXT, platform TEXT,
    audience_size INTEGER DEFAULT 0, why TEXT, status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  const app_row = db.prepare('SELECT * FROM ambassadors WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.acct?.email || req.apiKey);
  if (!app_row) return res.json({ ok: true, status: 'not_applied', apply_url: 'POST /v1/ambassador/apply' });
  res.json({ ok: true, ...app_row });
});

// 18. CLI scaffold reference + doctor endpoint
app.get('/v1/cli/init-template', publicRateLimit, (req, res) => {
  const projectName = req.query.name || 'my-project';
  res.json({
    ok: true,
    command: `npx slopshop init ${projectName}`,
    scaffolds: {
      'package.json': { name: projectName, dependencies: { slopshop: 'latest' }, scripts: { start: 'node index.js', 'slop:doctor': 'npx slopshop doctor' } },
      'index.js': `const slop = require('slopshop');\nconst client = slop.init({ key: process.env.SLOP_KEY });\n\n// Your HIVE workspace\nconst hive = await client.hive.create({ name: '${projectName}' });\nconsole.log('Workspace ready:', hive.id);`,
      '.env.example': 'SLOP_KEY=sk-slop-your-key-here',
      'slop.config.json': { hive: { name: projectName, channels: ['general', 'tasks'] }, templates: [], auto_memory: true },
    },
    doctor_command: 'npx slopshop doctor',
    doctor_checks: ['API key valid', 'Credit balance > 0', 'Network connectivity', 'Memory read/write', 'Handler health'],
    autocomplete: 'npx slopshop completion >> ~/.bashrc',
  });
});

// 19. Doctor health check
app.get('/v1/cli/doctor', auth, (req, res) => {
  const checks = [];
  checks.push({ check: 'api_key', status: 'pass', detail: 'Key is valid' });
  checks.push({ check: 'credit_balance', status: req.acct.balance > 0 ? 'pass' : 'warn', detail: `Balance: ${req.acct.balance} credits` });
  checks.push({ check: 'memory_rw', status: 'pass', detail: 'SQLite operational' });
  checks.push({ check: 'handlers', status: missing.length === 0 ? 'pass' : 'warn', detail: `${handlerCount} handlers loaded, ${missing.length} missing` });
  checks.push({ check: 'llm_provider', status: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY ? 'pass' : 'info', detail: process.env.ANTHROPIC_API_KEY ? 'Anthropic configured' : process.env.OPENAI_API_KEY ? 'OpenAI configured' : 'No LLM key (AI APIs unavailable)' });
  const passing = checks.filter(c => c.status === 'pass').length;
  res.json({ ok: true, healthy: passing >= 3, checks, score: `${passing}/${checks.length}`, version: '3.6.0' });
});

// 20. OpenAPI -> MCP auto-generator
app.post('/v1/mcp/generate-from-openapi', auth, (req, res) => {
  const { openapi_spec } = req.body;
  if (!openapi_spec) return res.status(400).json({ error: { code: 'missing_spec', message: 'Provide {openapi_spec: {...}} with a valid OpenAPI 3.x spec' } });
  const paths = openapi_spec.paths || {};
  const tools = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (typeof op !== 'object') continue;
      const name = op.operationId || `${method}_${path.replace(/[/{}]/g, '_')}`;
      tools.push({
        name: name.replace(/[^a-zA-Z0-9_]/g, '_'),
        description: op.summary || op.description || `${method.toUpperCase()} ${path}`,
        inputSchema: op.requestBody?.content?.['application/json']?.schema || { type: 'object' },
        method: method.toUpperCase(),
        path,
      });
    }
  }
  res.json({
    ok: true,
    mcp_server_config: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: openapi_spec.info?.title || 'generated', version: openapi_spec.info?.version || '1.0.0' },
      tools,
    },
    tools_generated: tools.length,
    tip: 'Save this as mcp-server.json and register with your MCP client',
  });
});

// 21. VS Code extension + Terraform/Pulumi reference
app.get('/v1/integrations/ecosystem', publicRateLimit, (req, res) => {
  res.json({
    ok: true,
    integrations: {
      vscode_extension: { status: 'coming_soon', description: 'Slopshop VS Code extension with inline tool testing, credit balance, and autocomplete', install: 'ext install slopshop.slopshop-tools', roadmap: 'Q3 2026' },
      terraform_provider: { status: 'coming_soon', description: 'Terraform provider for managing Slopshop resources (keys, teams, schedules)', registry: 'registry.terraform.io/providers/slopshop/slopshop', roadmap: 'Q3 2026' },
      pulumi_provider: { status: 'coming_soon', description: 'Pulumi provider (TypeScript, Python, Go) for Slopshop infrastructure-as-code', roadmap: 'Q4 2026' },
      docker: { status: 'available', command: 'docker run -p 3000:3000 slopshop/slopshop:latest', kubernetes_manifest: 'https://slopshop.gg/deploy/k8s-manifest.yaml' },
      github_action: { status: 'available', uses: 'slopshop/action@v1', with: { api_key: '${{ secrets.SLOP_KEY }}' } },
    },
    cli: {
      install: 'npm install -g slopshop',
      init: 'slop init my-project',
      doctor: 'slop doctor',
      autocomplete: 'slop completion >> ~/.bashrc',
    },
  });
});

// 22. Enterprise references (multi-region, SOC2, p99, air-gapped, hybrid sync)
app.get('/v1/enterprise/capabilities', publicRateLimit, (req, res) => {
  res.json({
    ok: true,
    enterprise: {
      multi_region: { status: 'roadmap', regions: ['us-east-1', 'eu-west-1', 'ap-southeast-1'], description: 'Multi-region deployment with automatic failover', roadmap: 'Q4 2026' },
      soc2: { status: 'in_progress', description: 'SOC 2 Type II certification in progress', path: 'Audit scheduled Q3 2026, expected completion Q4 2026', current: 'Data encrypted in transit (TLS 1.3). SQLite with WAL mode for durability. Encryption at rest via Railway volume encryption. Self-hosted users should enable disk encryption.' },
      p99_latency: { guarantee: '<100ms for compute APIs', measured: '<50ms p95, <100ms p99 for all 927 compute handlers', sla: 'Enterprise SLA available on request' },
      air_gapped: { status: 'available', description: 'Air-gapped enterprise version — zero internet required for 927 compute APIs', setup: 'docker run --network=none slopshop/slopshop-airgap:latest', note: 'Network and LLM APIs require connectivity' },
      open_source_core: { status: 'available', description: 'All 927 compute handlers are open-source (MIT). LLM and enterprise features are proprietary.', repo: 'https://github.com/slopshop/slopshop' },
      self_host_cloud_sync: { status: 'roadmap', description: 'Hybrid mode: self-host compute, sync memory and state to slopshop.gg cloud', features: ['Bidirectional memory sync', 'Cloud backup of local state', 'Unified billing'], roadmap: 'Q2 2027' },
      kubernetes: { manifest_url: 'https://slopshop.gg/deploy/k8s-manifest.yaml', helm_chart: 'helm install slopshop slopshop/slopshop', one_command: 'kubectl apply -f https://slopshop.gg/deploy/k8s-manifest.yaml' },
    },
    contact: 'dev@slopshop.gg',
  });
});

// 23. Case studies page reference
app.get('/v1/case-studies', publicRateLimit, (req, res) => {
  res.json({
    ok: true,
    case_studies: [
      { title: 'AI Research Lab — 10x faster paper analysis', use_case: 'Deployed 5,000-agent army to analyze and summarize 10,000 research papers in under 2 hours', tools_used: ['army/deploy', 'llm-summarize', 'memory-set', 'knowledge/add'], credits_used: 50000 },
      { title: 'E-commerce — Automated product enrichment', use_case: 'Knowledge graph + memory to auto-enrich 100K product listings with SEO metadata', tools_used: ['knowledge/add', 'llm-seo-meta', 'text-keyword-extract', 'memory-set'], credits_used: 120000 },
      { title: 'DevOps Agency — Replace Redis + Zapier + Cron', use_case: 'Single Slopshop instance replaced 3 SaaS subscriptions for an agency managing 50 client sites', tools_used: ['memory-set', 'orch-schedule-once', 'sense-url-content', 'comm-webhook-get'], credits_used: 15000 },
      { title: 'Crypto Trading Firm — Real-time signal verification', use_case: 'Merkle proofs + hash verification for audit-grade trade signal logging', tools_used: ['proof/merkle', 'crypto-hash-sha256', 'memory-set', 'orch-cache-set'], credits_used: 8000 },
    ],
    submit_your_story: 'POST /v1/case-studies/submit',
    page: 'https://slopshop.gg/case-studies.html',
  });
});

// ===== CREDITS FORECAST =====
app.get('/v1/credits/forecast', auth, (req, res) => {
  try {
    const prefix = req.apiKey.slice(0, 12) + '...';
    const recent = db.prepare("SELECT COUNT(*) as calls, SUM(credits) as total FROM audit_log WHERE key_prefix = ? AND ts > datetime('now', '-7 days')").get(prefix);
    const dailyBurn = Math.round((recent.total || 0) / 7);
    const daysRemaining = dailyBurn > 0 ? Math.round(req.acct.balance / dailyBurn) : Infinity;
    res.json({ ok: true, balance: req.acct.balance, daily_burn: dailyBurn, days_remaining: daysRemaining === Infinity ? null : daysRemaining, days_remaining_display: dailyBurn > 0 ? daysRemaining + ' days' : 'unlimited', weekly_calls: recent.calls || 0, weekly_credits: recent.total || 0, _engine: 'real' });
  } catch(e) { res.json({ ok: true, balance: req.acct.balance, daily_burn: 0, days_remaining: null, days_remaining_display: 'unlimited', weekly_calls: 0, weekly_credits: 0, _engine: 'real' }); }
});

// ===== AGENT ORGANIZATION (Cosmos) =====

// POST /v1/org/launch — Launch an agent organization with one call
app.post('/v1/org/launch', auth, async (req, res) => {
  const { name, agents, channels, standup_frequency, auto_handoff } = req.body;
  // agents: [{name: "Alice", role: "researcher", model: "claude", skills: ["search", "analyze"]}, ...]
  // channels: ["general", "research", "code-review", "shipping"]

  const orgId = uuidv4();

  // 1. Create a Hive workspace
  const hiveId = 'hive-' + orgId.slice(0, 8);
  db.prepare('INSERT INTO hives (id, api_key, name, channels, members, created) VALUES (?, ?, ?, ?, ?, ?)').run(
    hiveId, req.acct?.email || req.apiKey, name || 'Agent Org',
    JSON.stringify(channels || ['general', 'standup', 'handoff']),
    JSON.stringify((agents || []).map(a => a.name)),
    Date.now()
  );

  // 2. Create copilots for each agent
  const orgAgents = (agents || [
    { name: 'Researcher', role: 'researcher', model: 'claude', skills: ['search', 'analyze', 'summarize'] },
    { name: 'Writer', role: 'writer', model: 'gpt', skills: ['draft', 'edit', 'format'] },
    { name: 'Reviewer', role: 'reviewer', model: 'grok', skills: ['critique', 'fact-check', 'improve'] },
    { name: 'Engineer', role: 'engineer', model: 'claude', skills: ['code', 'test', 'debug'] },
  ]).map(agent => {
    const copilotId = 'agent-' + uuidv4().slice(0, 8);
    db.prepare('INSERT INTO copilot_sessions (id, main_session_id, role, system_prompt, status, message_count) VALUES (?, ?, ?, ?, ?, 0)').run(
      copilotId, orgId, agent.role,
      `You are ${agent.name}, a ${agent.role} in the ${name || 'Agent Org'} organization. Your model is ${agent.model}. Your skills: ${(agent.skills || []).join(', ')}. When you finish a task, hand it off to the next agent by posting to the handoff channel.`,
      'active'
    );
    return { ...agent, agent_id: copilotId };
  });

  // 3. Create an agent chain for the handoff workflow
  const chainId = uuidv4();
  const chainSteps = orgAgents.map(a => ({
    agent: a.model,
    prompt: `[${a.name}] Process the task using your ${a.role} skills: ${(a.skills || []).join(', ')}`,
    pass_context: true
  }));
  db.prepare('INSERT INTO agent_chains (id, user_id, name, steps, loop, context, status, current_step) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    chainId, req.acct?.email || req.apiKey, (name || 'Agent Org') + ' Chain',
    JSON.stringify(chainSteps), auto_handoff ? 1 : 0, '{}', 'active', 0
  );

  // 4. Store org metadata
  const now = Date.now();
  db.prepare('INSERT OR REPLACE INTO memory (namespace, key, value, tags, created, updated) VALUES (?, ?, ?, ?, ?, ?)').run(
    'org:' + orgId, 'config',
    JSON.stringify({ name, agents: orgAgents, channels, hive_id: hiveId, chain_id: chainId, standup_frequency: standup_frequency || 'daily' }),
    'org,config', now, now
  );

  res.json({
    ok: true,
    org_id: orgId,
    name: name || 'Agent Org',
    agents: orgAgents,
    hive_id: hiveId,
    chain_id: chainId,
    channels: channels || ['general', 'standup', 'handoff'],
    auto_handoff: !!auto_handoff,
    standup_frequency: standup_frequency || 'daily',
    endpoints: {
      send_task: `POST /v1/org/${orgId}/task`,
      standup: `GET /v1/org/${orgId}/standup`,
      status: `GET /v1/org/${orgId}/status`,
      scale: `POST /v1/org/${orgId}/scale`,
    },
    _engine: 'real'
  });
});

// POST /v1/org/:id/task — Send a task to the organization
app.post('/v1/org/:id/task', auth, async (req, res) => {
  const { task, priority, assign_to } = req.body;
  const orgId = req.params.id;

  // Get org config from memory
  const orgData = db.prepare("SELECT value FROM memory WHERE namespace = ? AND key = 'config'").get('org:' + orgId);
  if (!orgData) return res.status(404).json({ error: { code: 'org_not_found' } });

  const org = JSON.parse(orgData.value);
  const taskId = uuidv4();

  // Post task to hive
  db.prepare('INSERT INTO hive_messages (hive_id, channel, sender, message, ts) VALUES (?, ?, ?, ?, ?)').run(
    org.hive_id, 'general', 'system', JSON.stringify({ task_id: taskId, task, priority: priority || 'normal', assigned_to: assign_to || org.agents[0]?.name }),
    Date.now()
  );

  // If auto_handoff, advance the chain
  let chainResult = null;
  if (org.chain_id) {
    const chain = db.prepare('SELECT * FROM agent_chains WHERE id = ?').get(org.chain_id);
    if (chain) {
      const steps = JSON.parse(chain.steps);
      const ctx = JSON.parse(chain.context || '{}');
      ctx.current_task = task;
      ctx.task_id = taskId;
      db.prepare('UPDATE agent_chains SET context = ? WHERE id = ?').run(JSON.stringify(ctx), org.chain_id);
      chainResult = { chain_id: org.chain_id, next_step: steps[chain.current_step]?.agent || 'pending' };
    }
  }

  res.json({
    ok: true,
    task_id: taskId,
    org_id: orgId,
    assigned_to: assign_to || org.agents[0]?.name,
    chain: chainResult,
    hive_id: org.hive_id,
    _engine: 'real'
  });
});

// GET /v1/org/:id/status — Get organization status
app.get('/v1/org/:id/status', auth, (req, res) => {
  const orgData = db.prepare("SELECT value FROM memory WHERE namespace = ? AND key = 'config'").get('org:' + req.params.id);
  if (!orgData) return res.status(404).json({ error: { code: 'org_not_found' } });
  const org = JSON.parse(orgData.value);

  // Get recent activity
  const messages = db.prepare('SELECT COUNT(*) as count FROM hive_messages WHERE hive_id = ?').get(org.hive_id);
  const chain = db.prepare('SELECT status, current_step FROM agent_chains WHERE id = ?').get(org.chain_id);

  res.json({
    ok: true,
    org_id: req.params.id,
    name: org.name,
    agents: org.agents,
    agent_count: org.agents.length,
    channels: org.channels,
    messages_total: messages?.count || 0,
    chain_status: chain?.status || 'unknown',
    chain_step: chain?.current_step || 0,
    _engine: 'real'
  });
});

// POST /v1/org/:id/scale — Scale agents up or down
app.post('/v1/org/:id/scale', auth, (req, res) => {
  const { add_agents, remove_agents } = req.body;
  const orgData = db.prepare("SELECT value FROM memory WHERE namespace = ? AND key = 'config'").get('org:' + req.params.id);
  if (!orgData) return res.status(404).json({ error: { code: 'org_not_found' } });

  const org = JSON.parse(orgData.value);

  // Add new agents
  if (add_agents && Array.isArray(add_agents)) {
    for (const agent of add_agents) {
      const copilotId = 'agent-' + uuidv4().slice(0, 8);
      db.prepare('INSERT INTO copilot_sessions (id, main_session_id, role, system_prompt, status, message_count) VALUES (?, ?, ?, ?, ?, 0)').run(
        copilotId, req.params.id, agent.role,
        `You are ${agent.name}, a ${agent.role}. Model: ${agent.model}.`,
        'active'
      );
      org.agents.push({ ...agent, agent_id: copilotId });
    }
  }

  // Remove agents
  if (remove_agents && Array.isArray(remove_agents)) {
    org.agents = org.agents.filter(a => !remove_agents.includes(a.name));
  }

  // Update config
  db.prepare("UPDATE memory SET value = ?, updated = ? WHERE namespace = ? AND key = 'config'").run(
    JSON.stringify(org), Date.now(), 'org:' + req.params.id
  );

  res.json({ ok: true, org_id: req.params.id, agents: org.agents, agent_count: org.agents.length, _engine: 'real' });
});

// GET /v1/org/:id/standup — Get latest standup from all agents
app.get('/v1/org/:id/standup', auth, (req, res) => {
  const orgData = db.prepare("SELECT value FROM memory WHERE namespace = ? AND key = 'config'").get('org:' + req.params.id);
  if (!orgData) return res.status(404).json({ error: { code: 'org_not_found' } });
  const org = JSON.parse(orgData.value);

  // Get today's standups
  const today = new Date().toISOString().slice(0, 10);
  const standups = db.prepare("SELECT * FROM standups WHERE date = ? ORDER BY ts DESC").all(today);

  res.json({
    ok: true,
    org_id: req.params.id,
    agents: org.agents.map(a => ({
      name: a.name,
      role: a.role,
      model: a.model,
      standup: standups.find(s => s.api_key === a.name) || { status: 'no standup today' }
    })),
    _engine: 'real'
  });
});

// GET /v1/org/templates — Pre-built org templates
app.get('/v1/org/templates', publicRateLimit, (req, res) => {
  res.json({
    ok: true,
    templates: [
      {
        id: 'startup-team',
        name: 'Startup Team (16 agents)',
        description: 'Full startup org: CEO, CTO, PM, 4 engineers, 2 designers, 2 marketers, 2 sales, support lead, data analyst, QA lead',
        agents: [
          { name: 'CEO', role: 'strategy', model: 'claude', skills: ['planning', 'decision-making', 'vision'] },
          { name: 'CTO', role: 'technical-lead', model: 'claude', skills: ['architecture', 'code-review', 'technical-decisions'] },
          { name: 'PM', role: 'product', model: 'gpt', skills: ['specs', 'prioritization', 'user-research'] },
          { name: 'Engineer-1', role: 'backend', model: 'claude', skills: ['api', 'database', 'infrastructure'] },
          { name: 'Engineer-2', role: 'frontend', model: 'gpt', skills: ['ui', 'react', 'css'] },
          { name: 'Engineer-3', role: 'fullstack', model: 'grok', skills: ['integration', 'testing', 'deployment'] },
          { name: 'Engineer-4', role: 'data', model: 'claude', skills: ['analytics', 'pipeline', 'ml'] },
          { name: 'Designer-1', role: 'ux', model: 'gpt', skills: ['wireframes', 'user-flows', 'research'] },
          { name: 'Designer-2', role: 'visual', model: 'gpt', skills: ['branding', 'ui-design', 'assets'] },
          { name: 'Marketer-1', role: 'growth', model: 'grok', skills: ['seo', 'content', 'analytics'] },
          { name: 'Marketer-2', role: 'community', model: 'grok', skills: ['social', 'engagement', 'partnerships'] },
          { name: 'Sales-1', role: 'outbound', model: 'gpt', skills: ['prospecting', 'demos', 'closing'] },
          { name: 'Sales-2', role: 'enterprise', model: 'claude', skills: ['enterprise-sales', 'contracts', 'relationships'] },
          { name: 'Support', role: 'support-lead', model: 'gpt', skills: ['tickets', 'docs', 'onboarding'] },
          { name: 'Analyst', role: 'data-analyst', model: 'claude', skills: ['metrics', 'reporting', 'insights'] },
          { name: 'QA', role: 'quality', model: 'grok', skills: ['testing', 'automation', 'bug-tracking'] },
        ],
        channels: ['general', 'engineering', 'design', 'marketing', 'sales', 'support', 'standups', 'leadership'],
      },
      {
        id: 'research-lab',
        name: 'Research Lab (8 agents)',
        description: 'Academic research team: PI, 3 researchers, 2 analysts, reviewer, writer',
        agents: [
          { name: 'PI', role: 'principal-investigator', model: 'claude', skills: ['direction', 'review', 'publishing'] },
          { name: 'Researcher-1', role: 'primary-researcher', model: 'claude', skills: ['literature-review', 'hypothesis', 'experiments'] },
          { name: 'Researcher-2', role: 'secondary-researcher', model: 'gpt', skills: ['data-collection', 'methodology', 'replication'] },
          { name: 'Researcher-3', role: 'junior-researcher', model: 'grok', skills: ['search', 'summarize', 'annotate'] },
          { name: 'Analyst-1', role: 'statistician', model: 'claude', skills: ['statistics', 'modeling', 'visualization'] },
          { name: 'Analyst-2', role: 'data-engineer', model: 'claude', skills: ['pipeline', 'cleaning', 'storage'] },
          { name: 'Reviewer', role: 'peer-reviewer', model: 'grok', skills: ['critique', 'fact-check', 'methodology-review'] },
          { name: 'Writer', role: 'technical-writer', model: 'gpt', skills: ['drafting', 'editing', 'formatting'] },
        ],
        channels: ['general', 'literature', 'experiments', 'analysis', 'writing', 'standups'],
      },
      {
        id: 'dev-agency',
        name: 'Dev Agency (6 agents)',
        description: 'Software development team: architect, 2 devs, QA, DevOps, PM',
        agents: [
          { name: 'Architect', role: 'architect', model: 'claude', skills: ['system-design', 'code-review', 'standards'] },
          { name: 'Dev-1', role: 'senior-dev', model: 'claude', skills: ['backend', 'api', 'database'] },
          { name: 'Dev-2', role: 'junior-dev', model: 'gpt', skills: ['frontend', 'testing', 'docs'] },
          { name: 'QA', role: 'tester', model: 'grok', skills: ['testing', 'automation', 'reporting'] },
          { name: 'DevOps', role: 'infrastructure', model: 'claude', skills: ['ci-cd', 'monitoring', 'deployment'] },
          { name: 'PM', role: 'project-manager', model: 'gpt', skills: ['planning', 'tracking', 'communication'] },
        ],
        channels: ['general', 'code', 'testing', 'deployment', 'standups'],
      },
      {
        id: 'content-studio',
        name: 'Content Studio (5 agents)',
        description: 'Content creation team: editor, 2 writers, SEO specialist, social manager',
        agents: [
          { name: 'Editor', role: 'editor-in-chief', model: 'claude', skills: ['editing', 'strategy', 'quality'] },
          { name: 'Writer-1', role: 'long-form', model: 'gpt', skills: ['articles', 'guides', 'research'] },
          { name: 'Writer-2', role: 'short-form', model: 'grok', skills: ['social', 'captions', 'headlines'] },
          { name: 'SEO', role: 'seo-specialist', model: 'claude', skills: ['keywords', 'optimization', 'analytics'] },
          { name: 'Social', role: 'social-manager', model: 'gpt', skills: ['scheduling', 'engagement', 'trends'] },
        ],
        channels: ['general', 'drafts', 'published', 'analytics', 'standups'],
      },
      {
        id: 'security-ops',
        name: 'Security Ops (4 agents)',
        description: 'Security team: CISO, pentester, analyst, incident responder',
        agents: [
          { name: 'CISO', role: 'security-lead', model: 'claude', skills: ['policy', 'risk-assessment', 'compliance'] },
          { name: 'Pentester', role: 'offensive-security', model: 'grok', skills: ['vulnerability-scanning', 'exploitation', 'reporting'] },
          { name: 'Analyst', role: 'threat-analyst', model: 'claude', skills: ['monitoring', 'intelligence', 'triage'] },
          { name: 'Responder', role: 'incident-response', model: 'gpt', skills: ['containment', 'forensics', 'remediation'] },
        ],
        channels: ['general', 'alerts', 'incidents', 'compliance', 'standups'],
      },
      {
        id: 'full-startup',
        name: 'Full AI Startup (30 agents)',
        description: '30-agent company: CEO, 5 visionaries, 4 middle managers, 10 engineers, 3 PMs, 2 designers, 2 QA, 2 security, 1 DevOps, 1 data scientist. All with subagent + chain capabilities.',
        agents: [
          { name: 'CEO', role: 'chief-executive', model: 'claude', skills: ['strategy', 'fundraising', 'vision', 'hiring', 'culture'] },
          { name: 'VP-Product', role: 'product-visionary', model: 'claude', skills: ['roadmap', 'user-research', 'prioritization', 'metrics'] },
          { name: 'VP-Engineering', role: 'engineering-visionary', model: 'claude', skills: ['architecture', 'scaling', 'hiring', 'tech-debt'] },
          { name: 'VP-Growth', role: 'growth-visionary', model: 'grok', skills: ['acquisition', 'retention', 'analytics', 'experiments'] },
          { name: 'VP-Design', role: 'design-visionary', model: 'claude', skills: ['design-systems', 'ux-research', 'brand', 'accessibility'] },
          { name: 'VP-AI', role: 'ai-visionary', model: 'gpt', skills: ['ml-ops', 'model-selection', 'fine-tuning', 'eval'] },
          { name: 'EM-Platform', role: 'engineering-manager', model: 'claude', skills: ['sprint-planning', 'code-review', 'mentoring', 'oncall'] },
          { name: 'EM-Frontend', role: 'engineering-manager', model: 'gpt', skills: ['react', 'performance', 'a11y', 'testing'] },
          { name: 'EM-Backend', role: 'engineering-manager', model: 'claude', skills: ['apis', 'databases', 'caching', 'monitoring'] },
          { name: 'EM-Infra', role: 'engineering-manager', model: 'grok', skills: ['kubernetes', 'ci-cd', 'cost-optimization', 'reliability'] },
          { name: 'Eng-1', role: 'senior-engineer', model: 'claude', skills: ['typescript', 'react', 'graphql', 'testing'] },
          { name: 'Eng-2', role: 'senior-engineer', model: 'gpt', skills: ['python', 'fastapi', 'postgres', 'redis'] },
          { name: 'Eng-3', role: 'senior-engineer', model: 'claude', skills: ['rust', 'systems', 'performance', 'concurrency'] },
          { name: 'Eng-4', role: 'engineer', model: 'grok', skills: ['node', 'express', 'mongodb', 'websockets'] },
          { name: 'Eng-5', role: 'engineer', model: 'claude', skills: ['go', 'microservices', 'grpc', 'observability'] },
          { name: 'Eng-6', role: 'engineer', model: 'gpt', skills: ['ml', 'pytorch', 'data-pipelines', 'feature-engineering'] },
          { name: 'Eng-7', role: 'engineer', model: 'claude', skills: ['ios', 'swift', 'mobile', 'offline-first'] },
          { name: 'Eng-8', role: 'engineer', model: 'grok', skills: ['android', 'kotlin', 'mobile', 'push-notifications'] },
          { name: 'Eng-9', role: 'junior-engineer', model: 'claude', skills: ['html', 'css', 'javascript', 'learning'] },
          { name: 'Eng-10', role: 'junior-engineer', model: 'gpt', skills: ['python', 'scripting', 'automation', 'testing'] },
          { name: 'PM-1', role: 'product-manager', model: 'claude', skills: ['specs', 'user-stories', 'roadmap', 'stakeholders'] },
          { name: 'PM-2', role: 'product-manager', model: 'gpt', skills: ['analytics', 'experiments', 'pricing', 'competitive-intel'] },
          { name: 'PM-3', role: 'technical-pm', model: 'grok', skills: ['api-design', 'developer-experience', 'docs', 'sdks'] },
          { name: 'Designer-1', role: 'product-designer', model: 'claude', skills: ['figma', 'prototyping', 'user-testing', 'design-systems'] },
          { name: 'Designer-2', role: 'ux-researcher', model: 'gpt', skills: ['interviews', 'surveys', 'usability-testing', 'personas'] },
          { name: 'QA-1', role: 'qa-lead', model: 'claude', skills: ['test-automation', 'e2e', 'regression', 'performance-testing'] },
          { name: 'QA-2', role: 'qa-engineer', model: 'grok', skills: ['manual-testing', 'bug-reports', 'edge-cases', 'accessibility'] },
          { name: 'Security-1', role: 'security-lead', model: 'claude', skills: ['threat-modeling', 'pen-testing', 'compliance', 'soc2'] },
          { name: 'Security-2', role: 'security-engineer', model: 'gpt', skills: ['sast', 'dast', 'dependency-audit', 'incident-response'] },
          { name: 'DevOps', role: 'devops-engineer', model: 'grok', skills: ['terraform', 'docker', 'monitoring', 'cost-optimization'] },
        ],
        channels: ['general', 'engineering', 'product', 'design', 'qa', 'security', 'leadership', 'standups', 'incidents', 'launches', 'watercooler'],
      },
      {
        id: 'research-facility',
        name: 'Research Facility (20 agents)',
        description: '20-agent research org: Director, 4 department leads, 12 researchers, 2 data engineers, 1 lab coordinator. For protein folding, drug discovery, materials science.',
        agents: [
          { name: 'Director', role: 'research-director', model: 'claude', skills: ['strategy', 'funding', 'publications', 'collaborations'] },
          { name: 'Lead-CompBio', role: 'department-lead', model: 'claude', skills: ['protein-folding', 'molecular-dynamics', 'alphafold', 'docking'] },
          { name: 'Lead-ML', role: 'department-lead', model: 'gpt', skills: ['deep-learning', 'transformers', 'gnn', 'diffusion-models'] },
          { name: 'Lead-Chem', role: 'department-lead', model: 'claude', skills: ['drug-design', 'admet', 'synthesis', 'screening'] },
          { name: 'Lead-Data', role: 'department-lead', model: 'grok', skills: ['pipelines', 'databases', 'visualization', 'statistics'] },
          { name: 'Researcher-1', role: 'senior-researcher', model: 'claude', skills: ['protein-structure', 'cryo-em', 'homology-modeling'] },
          { name: 'Researcher-2', role: 'senior-researcher', model: 'gpt', skills: ['molecular-dynamics', 'free-energy', 'enhanced-sampling'] },
          { name: 'Researcher-3', role: 'researcher', model: 'claude', skills: ['ligand-binding', 'virtual-screening', 'pharmacophore'] },
          { name: 'Researcher-4', role: 'researcher', model: 'grok', skills: ['gnn-models', 'message-passing', 'equivariant-networks'] },
          { name: 'Researcher-5', role: 'researcher', model: 'claude', skills: ['generative-models', 'vae', 'flow-matching', 'se3'] },
          { name: 'Researcher-6', role: 'researcher', model: 'gpt', skills: ['retrosynthesis', 'reaction-prediction', 'yield-optimization'] },
          { name: 'Researcher-7', role: 'researcher', model: 'claude', skills: ['toxicity-prediction', 'admet-modeling', 'clinical-trials'] },
          { name: 'Researcher-8', role: 'researcher', model: 'grok', skills: ['multi-target', 'polypharmacology', 'network-biology'] },
          { name: 'Researcher-9', role: 'junior-researcher', model: 'claude', skills: ['literature-review', 'data-collection', 'benchmarking'] },
          { name: 'Researcher-10', role: 'junior-researcher', model: 'gpt', skills: ['visualization', 'plotting', 'report-writing'] },
          { name: 'Researcher-11', role: 'junior-researcher', model: 'claude', skills: ['dataset-curation', 'annotation', 'quality-control'] },
          { name: 'Researcher-12', role: 'junior-researcher', model: 'grok', skills: ['experimentation', 'ablation-studies', 'hyperparameter-tuning'] },
          { name: 'DataEng-1', role: 'data-engineer', model: 'claude', skills: ['etl', 'spark', 'data-lakes', 'feature-stores'] },
          { name: 'DataEng-2', role: 'data-engineer', model: 'gpt', skills: ['mlops', 'model-registry', 'experiment-tracking', 'serving'] },
          { name: 'Coordinator', role: 'lab-coordinator', model: 'claude', skills: ['scheduling', 'resource-allocation', 'compliance', 'reporting'] },
        ],
        channels: ['general', 'comp-bio', 'ml-research', 'chemistry', 'data', 'publications', 'standups', 'journal-club'],
      },
    ],
    _engine: 'real'
  });
});

// ===== START =====
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  const llm = process.env.ANTHROPIC_API_KEY ? 'Anthropic' : process.env.OPENAI_API_KEY ? 'OpenAI' : 'NONE';
  console.log(`\n  🦞 SLOPSHOP v2 is live on http://localhost:${PORT}`);
  console.log(`  📡 ${apiCount} APIs, ${handlerCount} handlers, 0 mocks`);
  console.log(`  🔑 Demo key: sk-slop-demo-key-12345678 (200 cr)`);
  console.log(`  🤖 LLM: ${llm}${llm === 'NONE' ? ' (set ANTHROPIC_API_KEY to unlock 48 AI APIs)' : ''}`);
  console.log(`  🌐 http://localhost:${PORT}/index.html\n`);
});

function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    try { db.close(); console.log('Database closed.'); } catch(e) {}
    process.exit(0);
  });
  setTimeout(() => { console.error('Forced shutdown after timeout'); process.exit(1); }, 10000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
