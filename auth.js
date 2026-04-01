/**
 * SLOPSHOP AUTH
 *
 * Real signup/login with email+password. API key management.
 * Password reset via email. Session tokens for dashboard.
 *
 * Usage: require('./auth')(app, db, apiKeys, persistKey, allHandlers)
 */
const crypto = require('crypto');

const signupLimits = new Map();
module.exports = function mountAuth(app, db, apiKeys, persistKey, allHandlers) {

  // ── Users table ────────────────────────────────────────────────────────────
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

  const usersCols = db.pragma('table_info(users)').map(c => c.name);
  if (!usersCols.includes('key_hash')) db.exec(`ALTER TABLE users ADD COLUMN key_hash TEXT DEFAULT NULL`);
  try { db.exec(`ALTER TABLE users ADD COLUMN google_sub TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN name TEXT`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 0`); } catch(e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'free'`); } catch(e) {}
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_key_hash ON users(key_hash)`);

  // ── Sessions table — migrate if stale schema ───────────────────────────────
  // Old schema used 'id' or missing 'token' column; drop and recreate if needed
  try {
    const sessionCols = db.pragma('table_info(sessions)').map(c => c.name);
    if (sessionCols.length > 0 && !sessionCols.includes('token')) {
      db.exec('DROP TABLE sessions');
    }
  } catch(_) {}
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    user_id TEXT NOT NULL,
    email TEXT,
    created INTEGER NOT NULL,
    expires INTEGER NOT NULL,
    ip TEXT
  )`);

  // ── Password resets table ──────────────────────────────────────────────────
  db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    created INTEGER NOT NULL
  )`);

  // ── Prepared statements ────────────────────────────────────────────────────
  const dbGetUser       = db.prepare('SELECT * FROM users WHERE email = ?');
  const dbGetUserById   = db.prepare('SELECT * FROM users WHERE id = ?');
  const dbGetUserByKey  = db.prepare('SELECT * FROM users WHERE api_key = ?');
  const dbGetUserByKeyHash = db.prepare('SELECT * FROM users WHERE key_hash = ?');
  const dbInsertUser    = db.prepare('INSERT INTO users (id, email, password_hash, salt, api_key, key_hash, created) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const dbGetReset      = db.prepare('SELECT * FROM password_resets WHERE token = ?');
  const dbInsertReset   = db.prepare('INSERT INTO password_resets (token, user_id, email, expires_at, created) VALUES (?, ?, ?, ?, ?)');
  const dbUseReset      = db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?');
  const dbExpireResets  = db.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0');

  function hashApiKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  function findUserByKey(key) {
    const h = hashApiKey(key);
    return dbGetUserByKeyHash.get(h) || dbGetUserByKey.get(key);
  }

  function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  // Rate limiter
  const ipLimits = new Map();
  function rateLimit(key, max, windowMs) {
    const now = Date.now();
    const e = ipLimits.get(key);
    if (!e || now - e.s > windowMs) { ipLimits.set(key, { c: 1, s: now }); return true; }
    e.c++; return e.c <= max;
  }

  // Email sender (uses SendGrid if configured)
  function sendEmail(to, subject, body) {
    if (allHandlers && allHandlers['ext-email-send'] && process.env.SENDGRID_API_KEY) {
      return allHandlers['ext-email-send']({ to, subject, body }).catch(() => {});
    }
    return Promise.resolve(null); // dev mode — no email sent
  }

  function appUrl() {
    return process.env.APP_URL || 'https://slopshop.gg';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/auth/signup
  // ─────────────────────────────────────────────────────────────────────────
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

    const dbInsertKeyFull = db.prepare('INSERT OR REPLACE INTO api_keys (key, id, balance, tier, scope, label, max_credits, created, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const now = Date.now();
    dbInsertKeyFull.run(key, id, 500, 'free', '*', null, null, now, kHash, kPrefix);
    const acct = { id, balance: 500, tier: 'free', auto_reload: false, scope: '*', label: null, max_credits: null, created: now };
    apiKeys.set(key, acct);

    // Referral bonus
    if (req.body.referral_code) {
      const rc = req.body.referral_code;
      if (/^sk-slop-[0-9a-f]{8,}$/.test(rc)) {
        const referrer = db.prepare('SELECT key FROM api_keys WHERE key LIKE ?').get(rc + '%');
        if (referrer) {
          const referrerAcct = apiKeys.get(referrer.key);
          if (referrerAcct) { referrerAcct.balance += 500; persistKey(referrer.key); }
          apiKeys.get(key).balance += 500;
          persistKey(key);
        }
      }
    }

    res.status(201).json({
      user_id: id,
      email,
      api_key: key,
      balance: 500,
      message: 'Account created. 500 free credits loaded. Memory APIs are always free.',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/auth/login
  // ─────────────────────────────────────────────────────────────────────────
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
    const hashBuf   = Buffer.from(hash);
    const storedBuf = Buffer.from(user.password_hash);
    if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) {
      return res.status(401).json({ error: { code: 'invalid_credentials' } });
    }

    const acct = apiKeys.get(user.api_key);
    res.json({
      user_id: user.id,
      email:   user.email,
      api_key: user.api_key,
      balance: acct ? acct.balance : 0,
      tier:    acct ? acct.tier : 'free',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/auth/forgot-password
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/v1/auth/forgot-password', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!rateLimit('forgot:' + ip, 5, 3600000)) {
      return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many reset requests. Try again later.' } });
    }

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: { code: 'missing_email', message: 'Provide your email address.' } });

    const user = dbGetUser.get(email.toLowerCase().trim());

    // Always respond success (don't leak if email exists)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 3600000; // 1 hour

    if (user) {
      // Expire any existing unused resets for this email
      dbExpireResets.run(user.email);
      dbInsertReset.run(token, user.id, user.email, expiresAt, Date.now());

      const resetUrl = `${appUrl()}/reset-password?token=${token}`;
      const emailBody = `Hi,\n\nSomeone requested a password reset for your Slopshop account.\n\nClick this link to set a new password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, you can safely ignore this email — your password has not changed.\n\nSlopshop`;

      sendEmail(user.email, 'Reset your Slopshop password', emailBody);

      // Dev mode: return token in response if no email configured
      if (!process.env.SENDGRID_API_KEY) {
        return res.json({
          ok: true,
          message: 'Reset link generated (dev mode — no email sent). Use the reset_url below.',
          reset_url: resetUrl,
          dev_token: token,
          expires_in: '1 hour',
        });
      }
    }

    res.json({
      ok: true,
      message: 'If that email has an account, a reset link has been sent. Check your inbox (and spam folder).',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/auth/reset-password
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/v1/auth/reset-password', (req, res) => {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      return res.status(400).json({ error: { code: 'missing_fields', message: 'Provide token and new_password.' } });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: { code: 'weak_password', message: 'Password must be at least 8 characters.' } });
    }

    const reset = dbGetReset.get(token);
    if (!reset || reset.used) {
      return res.status(400).json({ error: { code: 'invalid_token', message: 'Invalid or already used reset link. Request a new one.' } });
    }
    if (reset.expires_at < Date.now()) {
      return res.status(400).json({ error: { code: 'token_expired', message: 'Reset link has expired. Request a new one.' } });
    }

    const user = dbGetUserById.get(reset.user_id);
    if (!user) {
      return res.status(400).json({ error: { code: 'user_not_found' } });
    }

    // Update password
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(new_password, newSalt);
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(newHash, newSalt, user.id);

    // Mark token as used
    dbUseReset.run(token);

    res.json({ ok: true, message: 'Password updated. You can now log in with your new password.' });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/auth/providers — list available OAuth providers
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/v1/auth/providers', (req, res) => {
    res.json({
      google: !!(process.env.GOOGLE_CLIENT_ID),
      google_client_id: process.env.GOOGLE_CLIENT_ID || null,
      github: false
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/auth/google — authenticate with Google ID token
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/v1/auth/google', async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: { code: 'missing_credential', message: 'Google credential token required' } });

    try {
      // Verify the Google ID token with Google's tokeninfo endpoint
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      const payload = await verifyRes.json();

      if (!verifyRes.ok || payload.error) {
        return res.status(401).json({ error: { code: 'invalid_token', message: 'Invalid Google credential' } });
      }

      // Check audience matches (if GOOGLE_CLIENT_ID env var set)
      const expectedClientId = process.env.GOOGLE_CLIENT_ID;
      if (expectedClientId && payload.aud !== expectedClientId) {
        return res.status(401).json({ error: { code: 'invalid_audience', message: 'Token audience mismatch' } });
      }

      const email = payload.email;
      const name = payload.name || email.split('@')[0];
      const googleSub = payload.sub;

      if (!email || !payload.email_verified) {
        return res.status(400).json({ error: { code: 'unverified_email', message: 'Google account email not verified' } });
      }

      // Find or create user
      let user = dbGetUser.get(email);
      if (!user) {
        // Create new user
        const userId = crypto.randomUUID();
        const apiKey = 'sk-slop-' + crypto.randomBytes(24).toString('hex');
        const kHash = hashApiKey(apiKey);
        const kPrefix = apiKey.slice(0, 10);
        const now = Date.now();
        try {
          db.prepare('INSERT INTO users (id, email, password_hash, salt, api_key, key_hash, created, google_sub, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING').run(
            userId, email, '', '', apiKey, kHash, now, googleSub, name
          );
          const dbInsertKeyFull = db.prepare('INSERT OR REPLACE INTO api_keys (key, id, balance, tier, scope, label, max_credits, created, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          dbInsertKeyFull.run(apiKey, userId, 500, 'free', '*', null, null, now, kHash, kPrefix);
          apiKeys.set(apiKey, { id: userId, balance: 500, tier: 'free', auto_reload: false, scope: '*', label: null, max_credits: null, created: now });
        } catch(_e) {}
        user = dbGetUser.get(email);
      } else if (!user.google_sub) {
        // Link Google account to existing email user
        db.prepare('UPDATE users SET google_sub = ? WHERE email = ?').run(googleSub, email);
      }

      if (!user) {
        return res.status(500).json({ error: { code: 'user_create_failed', message: 'Failed to create user account' } });
      }

      // Create session
      const token = 'sess-' + crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
      db.prepare('INSERT INTO sessions (token, api_key, user_id, email, created, expires, ip) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        token, user.api_key, user.id, user.email, Date.now(), expires, req.ip || null
      );

      const acct = apiKeys.get(user.api_key);

      return res.json({
        ok: true,
        token,
        api_key: user.api_key,
        email: user.email,
        name: user.name || name,
        credits: acct ? acct.balance : 0,
        tier: acct ? acct.tier : 'free',
        is_new: !user.google_sub
      });
    } catch (err) {
      console.error('Google auth error:', err);
      return res.status(500).json({ error: { code: 'auth_error', message: 'Authentication failed' } });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/auth/change-password  (authenticated)
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/v1/auth/change-password', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const key = auth.slice(7);

    const user = findUserByKey(key);
    if (!user) return res.status(401).json({ error: { code: 'invalid_key' } });

    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: { code: 'missing_fields', message: 'Provide current_password and new_password.' } });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: { code: 'weak_password', message: 'Password must be at least 8 characters.' } });
    }

    const hashCurrent = hashPassword(current_password, user.salt);
    const hashBuf   = Buffer.from(hashCurrent);
    const storedBuf = Buffer.from(user.password_hash);
    if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) {
      return res.status(401).json({ error: { code: 'wrong_password', message: 'Current password is incorrect.' } });
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(new_password, newSalt);
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(newHash, newSalt, user.id);

    res.json({ ok: true, message: 'Password changed successfully.' });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/auth/me
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/v1/auth/me', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const key = auth.slice(7);

    const user = findUserByKey(key);
    const acct = apiKeys.get(key);

    res.json({
      user: user ? { id: user.id, email: user.email, created: user.created } : null,
      api_key: key,
      balance: acct ? acct.balance : 0,
      tier:    acct ? acct.tier : 'none',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/auth/rotate-key
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/v1/auth/rotate-key', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const oldKey = auth.slice(7);

    const user = findUserByKey(oldKey);
    if (!user) return res.status(401).json({ error: { code: 'invalid_key' } });

    const newKey    = 'sk-slop-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    const newHash   = hashApiKey(newKey);
    const newPrefix = newKey.slice(0, 10);

    const acct = apiKeys.get(oldKey);
    if (acct) {
      apiKeys.delete(oldKey);
      apiKeys.set(newKey, acct);
      db.prepare('UPDATE api_keys SET key = ?, key_hash = ?, key_prefix = ? WHERE key = ?').run(newKey, newHash, newPrefix, oldKey);
    }
    db.prepare('UPDATE users SET api_key = ?, key_hash = ? WHERE api_key = ?').run(newKey, newHash, oldKey);

    res.json({ ok: true, new_key: newKey, old_key_revoked: true, message: 'Key rotated. Update your environment variable.' });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/auth/keys
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/v1/auth/keys', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const key = auth.slice(7);

    const user = findUserByKey(key);
    if (!user) return res.status(401).json({ error: { code: 'invalid_key' } });

    const rows = db.prepare('SELECT key, id, balance, tier, scope, label, max_credits, created FROM api_keys WHERE id = ? ORDER BY created ASC').all(user.id);
    res.json({ keys: rows.map(r => ({ key: r.key, scope: r.scope || '*', label: r.label || null, max_credits: r.max_credits || null, tier: r.tier, balance: r.balance, created: r.created, primary: r.key === user.api_key })) });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/auth/create-scoped-key
  // ─────────────────────────────────────────────────────────────────────────
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
    if (Array.isArray(scope)) scope = scope.join(',');
    if (!scope) scope = '*';
    const scopeParts = scope.split(',').map(s => s.trim());
    for (const s of scopeParts) {
      if (!VALID_SCOPES.has(s)) return res.status(400).json({ error: { code: 'invalid_scope', message: 'Invalid scope: ' + s } });
    }
    scope = scopeParts.join(',');
    if (max_credits !== undefined && max_credits !== null) {
      max_credits = parseInt(max_credits, 10);
      if (isNaN(max_credits) || max_credits < 0) return res.status(400).json({ error: { code: 'invalid_max_credits' } });
    } else {
      max_credits = null;
    }

    const newKey    = 'sk-slop-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    const newHash   = hashApiKey(newKey);
    const newPrefix = newKey.slice(0, 10);
    const now = Date.now();
    db.prepare('INSERT INTO api_keys (key, id, balance, tier, scope, label, max_credits, created, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newKey, user.id, parentAcct.balance, parentAcct.tier, scope, label || null, max_credits, now, newHash, newPrefix);
    apiKeys.set(newKey, { id: user.id, balance: parentAcct.balance, tier: parentAcct.tier, auto_reload: false, scope, label: label || null, max_credits, created: now });

    res.status(201).json({ api_key: newKey, scope, label: label || null, max_credits, created: now });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /v1/auth/keys/:key
  // ─────────────────────────────────────────────────────────────────────────
  app.delete('/v1/auth/keys/:key', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const callerKey = auth.slice(7);

    const user = findUserByKey(callerKey);
    if (!user) return res.status(401).json({ error: { code: 'invalid_key' } });

    const targetKey = req.params.key;
    if (targetKey === user.api_key) return res.status(400).json({ error: { code: 'cannot_revoke_primary', message: 'Use /v1/auth/rotate-key instead.' } });

    const targetRow = db.prepare('SELECT * FROM api_keys WHERE key = ? AND id = ?').get(targetKey, user.id);
    if (!targetRow) return res.status(404).json({ error: { code: 'key_not_found' } });

    db.prepare('DELETE FROM api_keys WHERE key = ?').run(targetKey);
    apiKeys.delete(targetKey);

    res.json({ revoked: targetKey, status: 'deleted' });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/auth/session — create web session
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/v1/auth/session', (req, res) => {
    const { email, password, api_key } = req.body;
    let user, key;

    if (api_key) {
      user = findUserByKey(api_key);
      key  = api_key;
    } else if (email && password) {
      user = dbGetUser.get(email);
      if (!user) return res.status(401).json({ error: { code: 'invalid_credentials' } });
      const hash = hashPassword(password, user.salt);
      const hashBuf   = Buffer.from(hash);
      const storedBuf = Buffer.from(user.password_hash);
      if (hashBuf.length !== storedBuf.length || !crypto.timingSafeEqual(hashBuf, storedBuf)) {
        return res.status(401).json({ error: { code: 'invalid_credentials' } });
      }
      key = user.api_key;
    } else {
      const bearerAuth = req.headers.authorization;
      if (bearerAuth && bearerAuth.startsWith('Bearer ')) {
        key  = bearerAuth.slice(7);
        user = findUserByKey(key);
      }
    }

    if (!user || !key) return res.status(401).json({ error: { code: 'auth_required', message: 'Provide email+password, api_key, or Bearer token' } });

    const sessionToken = 'sess-' + crypto.randomBytes(32).toString('hex');
    const now      = Date.now();
    const expires  = now + 7 * 24 * 3600000;

    db.prepare('INSERT INTO sessions (token, api_key, user_id, email, created, expires, ip) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      sessionToken, key, user.id, user.email, now, expires, req.ip
    );

    res.cookie('slop_session', sessionToken, {
      httpOnly: true,
      secure:   !!(process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT),
      sameSite: 'lax',
      maxAge:   7 * 24 * 3600000,
      path:     '/',
    });

    res.json({
      ok: true,
      session_token: sessionToken,
      expires_in: '7 days',
      user:    { id: user.id, email: user.email },
      api_key: key,
      balance: apiKeys.get(key)?.balance || 0,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v1/auth/session — check session
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/v1/auth/session', (req, res) => {
    const token = req.cookies?.slop_session ||
      (req.headers.authorization?.startsWith('Bearer sess-') ? req.headers.authorization.slice(7) : null);
    if (!token) return res.status(401).json({ error: { code: 'no_session' } });

    const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires > ?').get(token, Date.now());
    if (!session) return res.status(401).json({ error: { code: 'session_expired' } });

    const user = findUserByKey(session.api_key);
    const acct = apiKeys.get(session.api_key);

    res.json({
      ok: true,
      user:            user ? { id: user.id, email: user.email } : null,
      api_key:         session.api_key,
      balance:         acct?.balance || 0,
      tier:            acct?.tier || 'free',
      session_expires: session.expires,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v1/auth/logout
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/v1/auth/logout', (req, res) => {
    const token = req.cookies?.slop_session ||
      (req.headers.authorization?.startsWith('Bearer sess-') ? req.headers.authorization.slice(7) : null);
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      res.clearCookie('slop_session');
    }
    res.json({ ok: true, logged_out: true });
  });

  // Cleanup expired sessions + password resets every hour
  setInterval(() => {
    try { db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); } catch(_) {}
    try { db.prepare('DELETE FROM password_resets WHERE expires_at < ? AND used = 1').run(Date.now()); } catch(_) {}
  }, 3600000);

  console.log('  🔐 Auth: signup, login, forgot-password, reset-password, change-password, rotate-key, me, keys, session, logout, providers, google');
};
