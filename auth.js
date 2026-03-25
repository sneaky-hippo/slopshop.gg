/**
 * SLOPSHOP AUTH
 *
 * Real signup/login with email. API key management.
 * Mounts onto Express app.
 *
 * Usage: require('./auth')(app, db, apiKeys, persistKey)
 */
const crypto = require('crypto');

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

  const dbGetUser = db.prepare('SELECT * FROM users WHERE email = ?');
  const dbGetUserByKey = db.prepare('SELECT * FROM users WHERE api_key = ?');
  const dbInsertUser = db.prepare('INSERT INTO users (id, email, password_hash, salt, api_key, created) VALUES (?, ?, ?, ?, ?, ?)');

  function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  // Signup: create account + API key + 1000 free credits
  app.post('/v1/auth/signup', (req, res) => {
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

    dbInsertUser.run(id, email, hash, salt, key, Date.now());

    // Create API key with 1000 free credits
    const dbInsertKey = db.prepare('INSERT OR REPLACE INTO api_keys (key, id, balance, tier, created) VALUES (?, ?, ?, ?, ?)');
    dbInsertKey.run(key, id, 1000, 'baby-lobster', Date.now());
    apiKeys.set(key, { id, balance: 1000, tier: 'baby-lobster', auto_reload: false, created: Date.now() });

    res.status(201).json({
      user_id: id,
      email,
      api_key: key,
      balance: 1000,
      message: 'Account created. 1,000 free credits loaded. Set SLOPSHOP_KEY=' + key,
    });
  });

  // Login: get API key
  app.post('/v1/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: { code: 'missing_fields' } });

    const user = dbGetUser.get(email);
    if (!user) return res.status(401).json({ error: { code: 'invalid_credentials' } });

    const hash = hashPassword(password, user.salt);
    if (hash !== user.password_hash) return res.status(401).json({ error: { code: 'invalid_credentials' } });

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

    const user = dbGetUserByKey.get(oldKey);
    if (!user) return res.status(401).json({ error: { code: 'invalid_key' } });

    const newKey = 'sk-slop-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);

    // Transfer balance to new key
    const acct = apiKeys.get(oldKey);
    if (acct) {
      apiKeys.delete(oldKey);
      apiKeys.set(newKey, acct);
      db.prepare('UPDATE api_keys SET key = ? WHERE key = ?').run(newKey, oldKey);
    }
    db.prepare('UPDATE users SET api_key = ? WHERE api_key = ?').run(newKey, oldKey);

    res.json({ new_key: newKey, old_key_revoked: true });
  });

  // Who am I
  app.get('/v1/auth/me', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const key = auth.slice(7);

    const user = dbGetUserByKey.get(key);
    const acct = apiKeys.get(key);

    res.json({
      user: user ? { id: user.id, email: user.email, created: user.created } : null,
      balance: acct ? acct.balance : 0,
      tier: acct ? acct.tier : 'none',
    });
  });

  console.log('  🔐 Auth: signup, login, rotate-key, me');
};
