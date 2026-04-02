'use strict';
/**
 * AUTH ENHANCEMENTS
 *
 * 1. Server-side Google OAuth2 redirect flow  (GET /auth/google, GET /auth/google/callback)
 * 2. Key anomaly detection                    (POST /v1/keys/anomaly-check, GET /v1/keys/security)
 * 3. Email-key binding                        (GET /v1/auth/portal, POST /v1/keys/email-bind)
 * 4. Auth status for UI navigation            (GET /auth/status)
 *
 * Zero external packages — only Node.js built-ins: crypto, https, querystring/url.
 *
 * Usage: require('./routes/auth-enhancements')(app, db, apiKeys)
 */

const crypto = require('crypto');
const https  = require('https');
const qs     = require('querystring');

module.exports = function mountAuthEnhancements(app, db, apiKeys) {

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function appUrl() {
    const raw = process.env.BASE_URL || process.env.APP_URL || 'https://remlabs.ai';
    // Ensure scheme is present
    if (raw.startsWith('http')) return raw.replace(/\/$/, '');
    return 'https://' + raw.replace(/\/$/, '');
  }

  function hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  function resolveBearer(req) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    return null;
  }

  function resolveSession(req) {
    const token = req.cookies && req.cookies.slop_session;
    if (!token) return null;
    return db.prepare('SELECT * FROM sessions WHERE token = ? AND expires > ?').get(token, Date.now()) || null;
  }

  /** POST body to a Google endpoint over HTTPS, returns parsed JSON. */
  function httpsPost(hostname, path, body) {
    return new Promise((resolve, reject) => {
      const payload = qs.stringify(body);
      const options = {
        hostname,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('request_timeout')); });
      req.write(payload);
      req.end();
    });
  }

  /** Decode a JWT payload without verifying signature (safe because token came from Google HTTPS). */
  function decodeJwtPayload(token) {
    const parts = token.split('.');
    if (parts.length < 2) throw new Error('invalid_jwt');
    // Base64url → Base64 → Buffer
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  }

  // ── Schema bootstrap ─────────────────────────────────────────────────────────

  // Defensive stubs for tables owned by auth.js — no-ops if already created by auth.js
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, salt TEXT NOT NULL,
      api_key TEXT NOT NULL, key_hash TEXT, created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_key_hash ON users(key_hash);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, api_key TEXT NOT NULL, user_id TEXT NOT NULL,
      email TEXT, created INTEGER NOT NULL, expires INTEGER NOT NULL, ip TEXT
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      key TEXT PRIMARY KEY, id TEXT, balance INTEGER DEFAULT 0,
      tier TEXT DEFAULT 'none', scope TEXT DEFAULT '*',
      label TEXT, created INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS key_anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_hash TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      detected_at INTEGER NOT NULL,
      anomaly_type TEXT NOT NULL,
      details TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ka_key ON key_anomalies(api_key_hash, detected_at);

    CREATE TABLE IF NOT EXISTS key_ip_log (
      api_key_hash TEXT NOT NULL,
      ip TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      request_count INTEGER DEFAULT 1,
      PRIMARY KEY (api_key_hash, ip)
    );

    CREATE TABLE IF NOT EXISTS key_verifications (
      api_key_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0
    );
  `);

  // Cleanup stale oauth states every 10 minutes
  setInterval(() => {
    try { db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(Date.now() - 600000); } catch (_) {}
  }, 600000);

  // ── Prepared statements ──────────────────────────────────────────────────────

  const stmtGetUserByEmail   = db.prepare('SELECT * FROM users WHERE email = ?');
  const stmtGetUserByKey     = db.prepare('SELECT * FROM users WHERE api_key = ?');
  const stmtGetUserByKeyHash = db.prepare('SELECT * FROM users WHERE key_hash = ?');

  function findUserByKey(key) {
    const h = hashKey(key);
    return stmtGetUserByKeyHash.get(h) || stmtGetUserByKey.get(key) || null;
  }

  // ── SendGrid email helper (mirrors auth.js pattern) ──────────────────────────

  function sendEmail(to, subject, body) {
    const allHandlers = app.locals && app.locals.allHandlers;
    if (allHandlers && allHandlers['ext-email-send'] && process.env.SENDGRID_API_KEY) {
      return allHandlers['ext-email-send']({ to, subject, body }).catch(() => {});
    }
    return Promise.resolve(null);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. SERVER-SIDE GOOGLE OAUTH2 REDIRECT FLOW
  // ════════════════════════════════════════════════════════════════════════════

  // ── GET /auth/google — kick off OAuth2 flow ──────────────────────────────────
  app.get('/auth/google', (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.redirect('/home?error=google_not_configured');
    }

    try {
      const state = crypto.randomBytes(16).toString('hex'); // 32 hex chars
      // Encode optional return_to path in state so callback can redirect back
      const returnTo = req.query.return_to || '';
      const statePayload = returnTo ? state + ':' + Buffer.from(returnTo).toString('base64url') : state;
      db.prepare('INSERT OR REPLACE INTO oauth_states (state, created_at) VALUES (?, ?)').run(statePayload, Date.now());

      const params = new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        redirect_uri:  appUrl() + '/auth/google/callback',
        response_type: 'code',
        scope:         'openid email profile',
        access_type:   'online',
        state:         statePayload,
        prompt:        'select_account',
      });

      return res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
    } catch (e) {
      console.error('[auth-enhancements] /auth/google error:', e.message);
      return res.redirect('/home?error=oauth_init_failed');
    }
  });

  // ── GET /auth/google/callback — handle code exchange ────────────────────────
  app.get('/auth/google/callback', async (req, res) => {
    const { code, state, error: oauthError } = req.query;

    // Google returned an error (e.g. user denied consent)
    if (oauthError) {
      return res.redirect('/home?error=' + encodeURIComponent(oauthError));
    }

    if (!code || !state) {
      return res.redirect('/home?error=missing_callback_params');
    }

    // Validate CSRF state (state may have :base64url(return_to) suffix)
    const stateRow = db.prepare('SELECT state FROM oauth_states WHERE state = ?').get(state);
    if (!stateRow) {
      return res.redirect('/home?error=invalid_state');
    }
    // Consume the state — delete regardless of subsequent outcome
    db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);

    // Extract optional return_to from state
    let returnToPath = null;
    const colonIdx = state.indexOf(':');
    if (colonIdx !== -1) {
      try { returnToPath = Buffer.from(state.slice(colonIdx + 1), 'base64url').toString('utf8'); } catch(_) {}
    }

    try {
      // Exchange code for tokens
      const tokenData = await httpsPost('oauth2.googleapis.com', '/token', {
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  appUrl() + '/auth/google/callback',
        grant_type:    'authorization_code',
      });

      if (tokenData.error) {
        console.error('[auth-enhancements] token exchange error:', tokenData.error);
        return res.redirect('/home?error=token_exchange_failed');
      }

      if (!tokenData.id_token) {
        return res.redirect('/home?error=no_id_token');
      }

      // Decode (not verify) the id_token payload
      let payload;
      try {
        payload = decodeJwtPayload(tokenData.id_token);
      } catch (_) {
        return res.redirect('/home?error=id_token_decode_failed');
      }

      const { email, sub: googleSub, name, email_verified } = payload;

      if (!email_verified) {
        return res.redirect('/home?error=unverified_email');
      }
      if (!email || !googleSub) {
        return res.redirect('/home?error=missing_google_claims');
      }

      // Find or create user
      let user = stmtGetUserByEmail.get(email);
      if (!user) {
        const userId   = crypto.randomUUID();
        const apiKey   = 'sk-slop-' + crypto.randomBytes(24).toString('hex');
        const kHash    = hashKey(apiKey);
        const kPrefix  = apiKey.slice(0, 10);
        const now      = Date.now();
        const userName = name || email.split('@')[0];

        try {
          db.prepare(
            'INSERT INTO users (id, email, password_hash, salt, api_key, key_hash, created, google_sub, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING'
          ).run(userId, email, '', '', apiKey, kHash, now, googleSub, userName);

          db.prepare(
            'INSERT OR REPLACE INTO api_keys (key, id, balance, tier, scope, label, max_credits, created, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(apiKey, userId, 500, 'free', '*', null, null, now, kHash, kPrefix);

          apiKeys.set(apiKey, {
            id:          userId,
            balance:     500,
            tier:        'free',
            auto_reload: false,
            scope:       '*',
            label:       null,
            max_credits: null,
            created:     now,
          });
        } catch (insertErr) {
          console.error('[auth-enhancements] user insert error:', insertErr.message);
        }

        user = stmtGetUserByEmail.get(email);
      } else if (!user.google_sub) {
        // Link Google sub to existing email account
        db.prepare('UPDATE users SET google_sub = ?, name = COALESCE(name, ?) WHERE email = ?').run(googleSub, name || null, email);
        user = stmtGetUserByEmail.get(email);
      }

      if (!user) {
        return res.redirect('/home?error=user_create_failed');
      }

      // Create 30-day session
      const sessionToken = 'sess-' + crypto.randomBytes(32).toString('hex');
      const now          = Date.now();
      const expires      = now + 30 * 24 * 3600 * 1000;

      db.prepare(
        'INSERT INTO sessions (token, api_key, user_id, email, created, expires, ip) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(sessionToken, user.api_key, user.id, user.email, now, expires, req.ip || null);

      res.cookie('slop_session', sessionToken, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge:   30 * 24 * 3600 * 1000,
        path:     '/',
      });

      // Pass API key in URL fragment so cross-domain remlabs.ai pages can store it in
      // localStorage — the slop_session cookie is set on slopshop.gg and won't be
      // readable from remlabs.ai requests due to same-site cookie scoping.
      // CONSUMER_URL separates the post-auth destination from the Google redirect_uri
      // (APP_URL / BASE_URL), which must match what's registered in Google Console.
      const consumerUrl = (process.env.CONSUMER_URL || 'https://remlabs.ai').replace(/\/$/, '');
      // Use return_to path if provided (e.g. /cli-login for device code flow)
      const destPath = returnToPath && /^\/[a-zA-Z0-9\-_\/?=&%]+$/.test(returnToPath) ? returnToPath : '/memory';
      return res.redirect(consumerUrl + destPath + '#key=' + encodeURIComponent(user.api_key));

    } catch (err) {
      console.error('[auth-enhancements] callback error:', err.message);
      return res.redirect('/home?error=auth_callback_failed');
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. KEY ANOMALY DETECTION
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * trackKeyUsage — passive middleware, mounted via app.locals.trackKeyUsage.
   * Logs IP + user-agent per key; flags multi-IP anomalies; never blocks.
   */
  function trackKeyUsage(req, res, next) {
    try {
      const rawKey = req.apiKey || resolveBearer(req);
      if (rawKey) {
        const keyHash  = hashKey(rawKey);
        const ip       = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
        const ua       = (req.headers['user-agent'] || '').slice(0, 512);
        const now      = Date.now();

        // Upsert IP log
        db.prepare(`
          INSERT INTO key_ip_log (api_key_hash, ip, first_seen, last_seen, request_count)
          VALUES (?, ?, ?, ?, 1)
          ON CONFLICT(api_key_hash, ip) DO UPDATE SET
            last_seen     = excluded.last_seen,
            request_count = request_count + 1
        `).run(keyHash, ip, now, now);

        // Check distinct IPs in the past hour
        const oneHourAgo = now - 3600000;
        const { ip_count: hourIpCount } = db.prepare(
          'SELECT COUNT(DISTINCT ip) AS ip_count FROM key_ip_log WHERE api_key_hash = ? AND last_seen > ?'
        ).get(keyHash, oneHourAgo) || { ip_count: 0 };

        if (hourIpCount > 5) {
          // Only insert an anomaly if we haven't logged this type in the last 10 minutes
          const tenMinAgo = now - 600000;
          const recent = db.prepare(
            'SELECT id FROM key_anomalies WHERE api_key_hash = ? AND anomaly_type = ? AND detected_at > ? LIMIT 1'
          ).get(keyHash, 'multi_ip', tenMinAgo);

          if (!recent) {
            db.prepare(
              'INSERT INTO key_anomalies (api_key_hash, ip, user_agent, detected_at, anomaly_type, details) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(keyHash, ip, ua, now, 'multi_ip', JSON.stringify({ distinct_ips_1h: hourIpCount }));
          }
        }
      }
    } catch (_) {
      // Never block the request on anomaly tracking errors
    }
    next();
  }

  // Expose middleware so server-v2.js can mount it
  app.locals.trackKeyUsage = trackKeyUsage;

  // ── POST /v1/keys/anomaly-check ──────────────────────────────────────────────
  app.post('/v1/keys/anomaly-check', (req, res) => {
    const rawKey = resolveBearer(req);
    if (!rawKey) return res.status(401).json({ error: { code: 'auth_required' } });
    if (!apiKeys.has(rawKey)) return res.status(401).json({ error: { code: 'invalid_key' } });

    const keyHash    = hashKey(rawKey);
    const now        = Date.now();
    const since24h   = now - 86400000;

    const { ip_count } = db.prepare(
      'SELECT COUNT(DISTINCT ip) AS ip_count FROM key_ip_log WHERE api_key_hash = ? AND last_seen > ?'
    ).get(keyHash, since24h) || { ip_count: 0 };

    const anomalies = db.prepare(
      'SELECT id, anomaly_type, ip, detected_at, details FROM key_anomalies WHERE api_key_hash = ? AND detected_at > ? ORDER BY detected_at DESC LIMIT 20'
    ).all(keyHash, since24h);

    return res.json({
      anomaly_detected: anomalies.length > 0,
      ip_count,
      anomalies,
    });
  });

  // ── GET /v1/keys/security ────────────────────────────────────────────────────
  app.get('/v1/keys/security', (req, res) => {
    const rawKey = resolveBearer(req);
    if (!rawKey) return res.status(401).json({ error: { code: 'auth_required' } });
    if (!apiKeys.has(rawKey)) return res.status(401).json({ error: { code: 'invalid_key' } });

    const keyHash  = hashKey(rawKey);
    const now      = Date.now();
    const since24h = now - 86400000;
    const since7d  = now - 7 * 86400000;

    const { ip_count: distinct_ips_24h } = db.prepare(
      'SELECT COUNT(DISTINCT ip) AS ip_count FROM key_ip_log WHERE api_key_hash = ? AND last_seen > ?'
    ).get(keyHash, since24h) || { ip_count: 0 };

    const { ip_count: distinct_ips_7d } = db.prepare(
      'SELECT COUNT(DISTINCT ip) AS ip_count FROM key_ip_log WHERE api_key_hash = ? AND last_seen > ?'
    ).get(keyHash, since7d) || { ip_count: 0 };

    const lastRow = db.prepare(
      'SELECT ip AS last_ip, last_seen FROM key_ip_log WHERE api_key_hash = ? ORDER BY last_seen DESC LIMIT 1'
    ).get(keyHash);

    const { anomalies_count } = db.prepare(
      'SELECT COUNT(*) AS anomalies_count FROM key_anomalies WHERE api_key_hash = ? AND detected_at > ?'
    ).get(keyHash, since7d) || { anomalies_count: 0 };

    return res.json({
      distinct_ips_24h,
      distinct_ips_7d,
      last_ip:        lastRow ? lastRow.last_ip   : null,
      last_seen:      lastRow ? lastRow.last_seen  : null,
      anomalies_count,
      status:         anomalies_count > 0 ? 'flagged' : 'normal',
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. EMAIL-KEY BINDING
  // ════════════════════════════════════════════════════════════════════════════

  // ── GET /v1/auth/portal ──────────────────────────────────────────────────────
  app.get('/v1/auth/portal', (req, res) => {
    // Check session cookie first
    const session = resolveSession(req);
    if (session) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
      return res.json({
        portal:   'consumer',
        redirect: (process.env.APP_URL || 'https://remlabs.ai') + '/memory',
        email:    user ? user.email : session.email || null,
        name:     user ? (user.name || null) : null,
      });
    }

    // Fall back to Bearer key
    const rawKey = resolveBearer(req);
    if (rawKey && apiKeys.has(rawKey)) {
      const user = findUserByKey(rawKey);
      if (user) {
        return res.json({
          portal:   'consumer',
          redirect: (process.env.APP_URL || 'https://remlabs.ai') + '/memory',
          email:    user.email,
          name:     user.name || null,
        });
      }
      // Key exists but has no user account — developer key
      return res.json({
        portal:   'developer',
        redirect: '/dev-console.html',
        email:    null,
        name:     null,
      });
    }

    return res.status(401).json({ error: { code: 'auth_required' } });
  });

  // ── POST /v1/keys/email-bind ─────────────────────────────────────────────────
  app.post('/v1/keys/email-bind', async (req, res) => {
    const rawKey = resolveBearer(req);
    if (!rawKey) return res.status(401).json({ error: { code: 'auth_required' } });
    if (!apiKeys.has(rawKey)) return res.status(401).json({ error: { code: 'invalid_key' } });

    const keyHash = hashKey(rawKey);
    const { email, verification_code } = req.body;

    if (!email) {
      return res.status(400).json({ error: { code: 'missing_email', message: 'Provide an email address.' } });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ error: { code: 'invalid_email' } });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Step 2: verify the code ──────────────────────────────────────────────
    if (verification_code) {
      const verRow = db.prepare('SELECT * FROM key_verifications WHERE api_key_hash = ?').get(keyHash);

      if (!verRow) {
        return res.status(400).json({ error: { code: 'no_pending_verification', message: 'Request a verification code first.' } });
      }
      if (verRow.expires_at < Date.now()) {
        db.prepare('DELETE FROM key_verifications WHERE api_key_hash = ?').run(keyHash);
        return res.status(400).json({ error: { code: 'code_expired', message: 'Verification code expired. Request a new one.' } });
      }
      if (verRow.attempts >= 5) {
        db.prepare('DELETE FROM key_verifications WHERE api_key_hash = ?').run(keyHash);
        return res.status(429).json({ error: { code: 'too_many_attempts', message: 'Too many failed attempts. Request a new code.' } });
      }
      if (verRow.email !== normalizedEmail) {
        return res.status(400).json({ error: { code: 'email_mismatch', message: 'Email does not match the pending verification.' } });
      }

      const match = crypto.timingSafeEqual(
        Buffer.from(String(verification_code).trim()),
        Buffer.from(verRow.code)
      );
      if (!match) {
        db.prepare('UPDATE key_verifications SET attempts = attempts + 1 WHERE api_key_hash = ?').run(keyHash);
        return res.status(400).json({ error: { code: 'invalid_code', message: 'Incorrect verification code.' } });
      }

      // Code is valid — consume it
      db.prepare('DELETE FROM key_verifications WHERE api_key_hash = ?').run(keyHash);

      // Find or create user for this email
      let user = stmtGetUserByEmail.get(normalizedEmail);
      const acct = apiKeys.get(rawKey);

      if (!user) {
        const userId  = crypto.randomUUID();
        const now     = Date.now();
        // Create a minimal user record linked to this key
        try {
          db.prepare(
            'INSERT INTO users (id, email, password_hash, salt, api_key, key_hash, created) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(userId, normalizedEmail, '', '', rawKey, keyHash, now);
          // Ensure api_keys row is current
          db.prepare('UPDATE api_keys SET id = ? WHERE key_hash = ?').run(userId, keyHash);
          if (acct) acct.id = userId;
        } catch (e) {
          console.error('[auth-enhancements] email-bind insert error:', e.message);
          return res.status(500).json({ error: { code: 'bind_failed' } });
        }
        user = stmtGetUserByEmail.get(normalizedEmail);
      } else {
        // Link this key to the existing user if not already
        const existingKeyHash = user.key_hash;
        if (existingKeyHash !== keyHash) {
          // Only bind if user has no primary key or key is not already owned by another user
          const ownerOfKey = stmtGetUserByKeyHash.get(keyHash);
          if (!ownerOfKey) {
            db.prepare('UPDATE users SET api_key = ?, key_hash = ? WHERE id = ?').run(rawKey, keyHash, user.id);
            db.prepare('UPDATE api_keys SET id = ? WHERE key_hash = ?').run(user.id, keyHash);
          }
        }
      }

      return res.json({
        ok:      true,
        bound:   true,
        email:   normalizedEmail,
        user_id: user ? user.id : null,
        message: 'Email successfully bound to API key.',
      });
    }

    // ── Step 1: send verification code ──────────────────────────────────────
    // Rate-limit: 1 request per 60 seconds per key
    const existing = db.prepare('SELECT expires_at FROM key_verifications WHERE api_key_hash = ?').get(keyHash);
    if (existing) {
      const sentAt = existing.expires_at - 10 * 60 * 1000; // code expires in 10 min
      if (Date.now() - sentAt < 60000) {
        return res.status(429).json({ error: { code: 'rate_limited', message: 'Please wait before requesting another code.' } });
      }
    }

    const code      = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    db.prepare(`
      INSERT INTO key_verifications (api_key_hash, email, code, expires_at, attempts)
      VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(api_key_hash) DO UPDATE SET
        email = excluded.email,
        code = excluded.code,
        expires_at = excluded.expires_at,
        attempts = 0
    `).run(keyHash, normalizedEmail, code, expiresAt);

    const emailBody = `Your Slopshop email verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.\n\nSlopshop`;
    await sendEmail(normalizedEmail, 'Your Slopshop verification code', emailBody);

    // Dev mode: return code in response if no SendGrid configured
    const devPayload = !process.env.SENDGRID_API_KEY ? { dev_code: code } : {};

    return res.json({
      ok:         true,
      sent:       true,
      email:      normalizedEmail,
      expires_in: '10 minutes',
      message:    'Verification code sent. Call this endpoint again with verification_code to complete binding.',
      ...devPayload,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. AUTH STATUS FOR UI NAVIGATION
  // ════════════════════════════════════════════════════════════════════════════

  // ── GET /auth/status ─────────────────────────────────────────────────────────
  app.get('/auth/status', (req, res) => {
    // 1. Check session cookie
    const session = resolveSession(req);
    if (session) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
      return res.json({
        authenticated: true,
        portal:        'consumer',
        email:         user ? user.email : session.email || null,
        name:          user ? (user.name || null) : null,
      });
    }

    // 2. Fall back to Bearer token
    const rawKey = resolveBearer(req);
    if (rawKey && apiKeys.has(rawKey)) {
      const user = findUserByKey(rawKey);
      if (user) {
        return res.json({
          authenticated: true,
          portal:        'consumer',
          email:         user.email,
          name:          user.name || null,
        });
      }
      // Key-only (no user account) = developer portal
      return res.json({
        authenticated: true,
        portal:        'developer',
        email:         null,
        name:          null,
      });
    }

    return res.json({
      authenticated: false,
      portal:        null,
      email:         null,
      name:          null,
    });
  });

  console.log('  Auth enhancements: /auth/google, /auth/google/callback, /auth/status, /v1/keys/anomaly-check, /v1/keys/security, /v1/auth/portal, /v1/keys/email-bind');
};

// WIRE INTO server-v2.js (add after other route modules):
// try { require('./routes/auth-enhancements')(app, db, apiKeys); console.log('Route loaded: auth-enhancements'); } catch (e) { console.error('Route load FAILED: auth-enhancements -', e.message, e.stack); }
