/**
 * SLOPSHOP AUTH
 *
 * Real signup/login with email. API key management.
 * Mounts onto Express app.
 *
 * Usage: require('./auth')(app, db, apiKeys, persistKey)
 */
const crypto = require('crypto');

const signupLimits = new Map();
module.exports = function mountAuth(app, db, apiKeys, persistKey) {

  // Ensure users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      api_key TEXT NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_key ON users(api_key);
  `);

  // SECURITY: Add key_hash column for hash-based user lookups.
  // Migration: existing rows have NULL key_hash and are found via plaintext api_key fallback.
  // New rows store SHA-256 hash. Once all users rotate keys, plaintext api_key column can be dropped.
  const usersCols = db.pragma('table_info(users)').map(c => c.name);
  if (!usersCols.includes('key_hash')) db.exec(`ALTER TABLE users ADD COLUMN key_hash TEXT DEFAULT NULL`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_key_hash ON users(key_hash)`);

  function hashApiKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  const dbGetUser = db.prepare('SELECT * FROM users WHERE email = ?');
  const dbGetUserByKey = db.prepare('SELECT * FROM users WHERE api_key = ?');
  const dbGetUserByKeyHash = db.prepare('SELECT * FROM users WHERE key_hash = ?');
  const dbInsertUser = db.prepare('INSERT INTO users (id, email, password_hash, salt, api_key, key_hash, created) VALUES (?, ?, ?, ?, ?, ?, ?)');

  // Look up user by API key: try hash first (secure path), fall back to plaintext (migration compat)
  function findUserByKey(key) {
    const h = hashApiKey(key);
    return dbGetUserByKeyHash.get(h) || dbGetUserByKey.get(key);
  }

  function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  // Rate limit helper (shared with server)
  const ipLimits = new Map();
  function rateLimit(key, max, windowMs) {
    const now = Date.now();
    const e = ipLimits.get(key);
    if (!e || now - e.s > windowMs) { ipLimits.set(key, { c: 1, s: now }); return true; }
    e.c++; return e.c <= max;
  }

  // Signup: create account + API key + 500 free credits
  // Sybil protection: max 3 signups per IP per day
  const signupRateLimit = (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = 'signup:' + ip;
    const now = Date.now();
    const entry = signupLimits.get(key);
    if (entry && now - entry.start < 86400000 && entry.count >= 3) {
      return res.status(429).json({ error: { code: 'signup_rate_limited', message: 'Max 3 accounts per IP per day', retry_after: Math.ceil((entry.start + 86400000 - now) / 1000) } });
    }
    if (!entry || now - entry.start > 86400000) signupLimits.set(key, { count: 1, start: now });
    else entry.count++;
    next();
  };
  app.post('/v1/auth/signup', signupRateLimit, (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!rateLimit('signup:' + ip, 5, 3600000)) {
      return res.status(429).json({ error: { code: 'rate_limited', message: 'Max 5 signups per hour. Try again later.' } });
    }
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: { code: 'missing_fields', message: 'Provide email and password' } });
    if (!email.includes('@')) return res.status(400).json({ error: { code: 'invalid_email' } });
    if (password.length < 8) return res.status(400).json({ error: { code: 'weak_password', message: 'Password must be at least 8 characters' } });

    const existing = dbGetUser.get(email);
    if (existing) return res.status(409).json({ error: { code: 'email_exists', message: 'Account already exists. Use /v1/auth/login.' } });

    const id = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const key = 'sk-slop-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    const kHash = hashApiKey(key);
    const kPrefix = key.slice(0, 10);

    dbInsertUser.run(id, email, hash, salt, key, kHash, Date.now());

    // Create API key with 500 free credits (memory APIs are free / 0 credits)
    // Store SHA-256 hash + prefix for secure lookup; plaintext kept for backward compat during migration
    const dbInsertKeyFull = db.prepare('INSERT OR REPLACE INTO api_keys (key, id, balance, tier, scope, label, max_credits, created, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const now = Date.now();
    dbInsertKeyFull.run(key, id, 500, 'free', '*', null, null, now, kHash, kPrefix);
    const acct = { id, balance: 500, tier: 'free', auto_reload: false, scope: '*', label: null, max_credits: null, created: now };
    apiKeys.set(key, acct);

    // Referral bonus
    if (req.body.referral_code) {
      const rc = req.body.referral_code;
      if (!/^sk-slop-[0-9a-f]{8,}$/.test(rc)) { /* invalid format, skip */ }
      const referrer = rc && /^sk-slop-[0-9a-f]{8,}$/.test(rc) ? db.prepare('SELECT key FROM api_keys WHERE key LIKE ?').get(rc + '%') : null;
      if (referrer) {
        const referrerAcct = apiKeys.get(referrer.key);
        if (referrerAcct) { referrerAcct.balance += 500; persistKey(referrer.key); }
        // Also give the new user bonus
        apiKeys.get(key).balance += 500;
        persistKey(key);
      }
    }

    res.status(201).json({
      user_id: id,
      email,
      api_key: key,
      balance: 500,
      message: 'Account created. 500 free credits loaded. Memory APIs are always free. Set SLOPSHOP_KEY=' + key,
    });
  });

  // Login: get API key (rate limited: 10 attempts per minute per IP)
  app.post('/v1/auth/login', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!rateLimit('login:' + ip, 10, 60000)) {
      return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many login attempts. Wait 1 minute.' } });
    }
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: { code: 'missing_fields' } });

    const user = dbGetUser.get(email);
    if (!user) return res.status(401).json({ error: { code: 'invalid_credentials' } });

    const hash = hashPassword(password, user.salt);
    // SECURITY FIX (HIGH-06): Use timing-safe comparison to prevent timing attacks
    const hashBuf = Buffer.from(hash);
    const storedBuf = Buffer.from(user.password_hash);
    if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) return res.status(401).json({ error: { code: 'invalid_credentials' } });

    // Refresh key in cache
    const acct = apiKeys.get(user.api_key);

    res.json({
      user_id: user.id,
      email: user.email,
      api_key: user.api_key,
      balance: acct ? acct.balance : 0,
    });
  });

  // Rotate API key
  app.post('/v1/auth/rotate-key', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const oldKey = auth.slice(7);

    const user = findUserByKey(oldKey);
    if (!user) return res.status(401).json({ error: { code: 'invalid_key' } });

    const newKey = 'sk-slop-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    const newHash = hashApiKey(newKey);
    const newPrefix = newKey.slice(0, 10);

    // Transfer balance to new key (update hash + prefix in DB)
    const acct = apiKeys.get(oldKey);
    if (acct) {
      apiKeys.delete(oldKey);
      apiKeys.set(newKey, acct);
      db.prepare('UPDATE api_keys SET key = ?, key_hash = ?, key_prefix = ? WHERE key = ?').run(newKey, newHash, newPrefix, oldKey);
    }
    db.prepare('UPDATE users SET api_key = ?, key_hash = ? WHERE api_key = ?').run(newKey, newHash, oldKey);

    res.json({ new_key: newKey, old_key_revoked: true });
  });

  // Who am I
  app.get('/v1/auth/me', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const key = auth.slice(7);

    const user = findUserByKey(key);
    const acct = apiKeys.get(key);

    res.json({
      user: user ? { id: user.id, email: user.email, created: user.created } : null,
      balance: acct ? acct.balance : 0,
      tier: acct ? acct.tier : 'none',
    });
  });

  // Create a scoped API key (child key tied to the authenticated user's account)
  const VALID_SCOPES = new Set(['compute', 'network', 'llm', 'memory', 'execute', 'read-only', '*']);
  app.post('/v1/auth/create-scoped-key', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const parentKey = auth.slice(7);

    const user = findUserByKey(parentKey);
    if (!user) return res.status(401).json({ error: { code: 'invalid_key' } });

    const parentAcct = apiKeys.get(parentKey);
    if (!parentAcct) return res.status(401).json({ error: { code: 'invalid_key' } });

    let { scope, label, max_credits } = req.body;
    // scope can be a string or array; normalize to comma-separated string
    if (Array.isArray(scope)) scope = scope.join(',');
    if (!scope) scope = '*';
    const scopeParts = scope.split(',').map(s => s.trim());
    for (const s of scopeParts) {
      if (!VALID_SCOPES.has(s)) {
        return res.status(400).json({ error: { code: 'invalid_scope', message: 'Invalid scope: ' + s, valid_scopes: [...VALID_SCOPES] } });
      }
    }
    scope = scopeParts.join(',');
    if (label && typeof label !== 'string') return res.status(400).json({ error: { code: 'invalid_label' } });
    if (max_credits !== undefined && max_credits !== null) {
      max_credits = parseInt(max_credits, 10);
      if (isNaN(max_credits) || max_credits < 0) return res.status(400).json({ error: { code: 'invalid_max_credits' } });
    } else {
      max_credits = null;
    }

    const newKey = 'sk-slop-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    const newHash = hashApiKey(newKey);
    const newPrefix = newKey.slice(0, 10);
    const now = Date.now();
    db.prepare('INSERT INTO api_keys (key, id, balance, tier, scope, label, max_credits, created, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newKey, user.id, parentAcct.balance, parentAcct.tier, scope, label || null, max_credits, now, newHash, newPrefix);
    apiKeys.set(newKey, { id: user.id, balance: parentAcct.balance, tier: parentAcct.tier, auto_reload: false, scope, label: label || null, max_credits, created: now });

    res.status(201).json({ api_key: newKey, scope, label: label || null, max_credits, created: now, message: 'Scoped key created. Shares balance with parent account.' });
  });

  // List all API keys for the authenticated user
  app.get('/v1/auth/keys', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const key = auth.slice(7);

    const user = findUserByKey(key);
    if (!user) return res.status(401).json({ error: { code: 'invalid_key' } });

    const rows = db.prepare('SELECT key, id, balance, tier, scope, label, max_credits, created FROM api_keys WHERE id = ? ORDER BY created ASC').all(user.id);
    res.json({ keys: rows.map(r => ({ key: r.key, scope: r.scope || '*', label: r.label || null, max_credits: r.max_credits || null, tier: r.tier, balance: r.balance, created: r.created, primary: r.key === user.api_key })) });
  });

  // Revoke a scoped key (cannot revoke your own primary key)
  app.delete('/v1/auth/keys/:key', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const callerKey = auth.slice(7);

    const user = findUserByKey(callerKey);
    if (!user) return res.status(401).json({ error: { code: 'invalid_key' } });

    const targetKey = req.params.key;
    if (targetKey === user.api_key) return res.status(400).json({ error: { code: 'cannot_revoke_primary', message: 'Cannot revoke your primary key. Use /v1/auth/rotate-key instead.' } });

    const targetRow = db.prepare('SELECT * FROM api_keys WHERE key = ? AND id = ?').get(targetKey, user.id);
    if (!targetRow) return res.status(404).json({ error: { code: 'key_not_found', message: 'Key not found or does not belong to your account.' } });

    db.prepare('DELETE FROM api_keys WHERE key = ?').run(targetKey);
    apiKeys.delete(targetKey);

    res.json({ revoked: targetKey, status: 'deleted' });
  });

  // ═══ SESSION-BASED AUTH — for web dashboard (cookie + ephemeral token) ═══
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    email TEXT,
    created INTEGER NOT NULL,
    expires INTEGER NOT NULL,
    ip TEXT
  )`);

  // POST /v1/auth/session — Create a web session from API key or email+password
  // Returns a session token that can be used as Bearer OR set as cookie
  app.post('/v1/auth/session', (req, res) => {
    const { email, password, api_key } = req.body;
    let user, key;

    if (api_key) {
      // Auth via API key
      user = findUserByKey(api_key);
      key = api_key;
    } else if (email && password) {
      // Auth via email+password
      user = dbGetUser.get(email);
      if (!user) return res.status(401).json({ error: { code: 'invalid_credentials' } });
      const hash = hashPassword(password, user.salt);
      const hashBuf = Buffer.from(hash);
      const storedBuf = Buffer.from(user.password_hash);
      if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) {
        return res.status(401).json({ error: { code: 'invalid_credentials' } });
      }
      key = user.api_key;
    } else {
      // Check Bearer header
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        key = auth.slice(7);
        user = findUserByKey(key);
      }
    }

    if (!user || !key) return res.status(401).json({ error: { code: 'auth_required', message: 'Provide email+password, api_key, or Bearer token' } });

    const sessionToken = 'sess-' + crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expires = now + 7 * 24 * 3600000; // 7 days

    db.prepare('INSERT INTO sessions (token, api_key, user_id, email, created, expires, ip) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      sessionToken, key, user.id, user.email, now, expires, req.ip
    );

    // Set cookie for web dashboard
    res.cookie('slop_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600000,
      path: '/',
    });

    res.json({
      ok: true,
      session_token: sessionToken,
      expires_in: '7 days',
      user: { id: user.id, email: user.email },
      balance: apiKeys.get(key)?.balance || 0,
      note: 'Use this token as Bearer header OR it is set as httpOnly cookie for dashboard.',
    });
  });

  // GET /v1/auth/session — Check current session
  app.get('/v1/auth/session', (req, res) => {
    const token = req.cookies?.slop_session || (req.headers.authorization?.startsWith('Bearer sess-') ? req.headers.authorization.slice(7) : null);
    if (!token) return res.status(401).json({ error: { code: 'no_session' } });

    const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires > ?').get(token, Date.now());
    if (!session) return res.status(401).json({ error: { code: 'session_expired' } });

    const user = findUserByKey(session.api_key);
    const acct = apiKeys.get(session.api_key);

    res.json({
      ok: true,
      user: user ? { id: user.id, email: user.email } : null,
      balance: acct?.balance || 0,
      tier: acct?.tier || 'free',
      session_expires: session.expires,
    });
  });

  // POST /v1/auth/logout — Destroy session
  app.post('/v1/auth/logout', (req, res) => {
    const token = req.cookies?.slop_session || (req.headers.authorization?.startsWith('Bearer sess-') ? req.headers.authorization.slice(7) : null);
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      res.clearCookie('slop_session');
    }
    res.json({ ok: true, logged_out: true });
  });

  // Clean expired sessions periodically
  setInterval(() => {
    try { db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); } catch(e) {}
  }, 3600000); // every hour

  console.log('  🔐 Auth: signup, login, rotate-key, me, create-scoped-key, keys, revoke-key, session, logout');
};
