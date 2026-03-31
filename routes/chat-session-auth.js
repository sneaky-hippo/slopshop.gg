'use strict';
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// ChatSession JWT Auth — Slopshop Multiplayer Chat
//
// Endpoints:
//   POST /v1/auth/chat/join    — issue JWT + refresh token for a hive room
//   POST /v1/auth/chat/refresh — rotate refresh token, issue new pair
//   POST /v1/auth/chat/logout  — revoke session
//   GET  /v1/hive/:id/live     — SSE stream for a hive (all channels)
//
// Design: session-table revocation + family-based refresh rotation + jti blacklist
// Deps: jsonwebtoken (npm install jsonwebtoken)
// ─────────────────────────────────────────────────────────────────────────────

let jwt;
try { jwt = require('jsonwebtoken'); } catch (_) { jwt = null; }

const ACCESS_EXP = 15 * 60;         // 15 minutes
const REFRESH_EXP_MS = 7 * 86400000; // 7 days

function ok(res, data) {
  return res.json({ ok: true, _engine: 'real', ...data });
}
function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

module.exports = function (app, db, apiKeys) {
  // ─── SCHEMA ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      hive_id TEXT NOT NULL,
      channel TEXT DEFAULT '*',
      display_name TEXT DEFAULT '',
      revoked_at INTEGER,
      token_version INTEGER DEFAULT 0,
      created INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cs_api_key ON chat_sessions(api_key);
    CREATE INDEX IF NOT EXISTS idx_cs_hive ON chat_sessions(hive_id);

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      refresh_hash TEXT UNIQUE NOT NULL,
      family_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rt_hash ON refresh_tokens(refresh_hash);
    CREATE INDEX IF NOT EXISTS idx_rt_family ON refresh_tokens(family_id);
    CREATE INDEX IF NOT EXISTS idx_rt_session ON refresh_tokens(session_id);

    CREATE TABLE IF NOT EXISTS jwt_blacklist (
      jti TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
  `);

  // ─── PREPARED STATEMENTS ────────────────────────────────────────────────────
  const stmts = {
    insertSession: db.prepare(`INSERT INTO chat_sessions (id, api_key, hive_id, channel, display_name, created, last_seen) VALUES (?,?,?,?,?,?,?)`),
    getSession: db.prepare('SELECT * FROM chat_sessions WHERE id = ?'),
    revokeSession: db.prepare('UPDATE chat_sessions SET revoked_at = ? WHERE id = ?'),
    touchSession: db.prepare('UPDATE chat_sessions SET last_seen = ? WHERE id = ?'),
    listSessions: db.prepare('SELECT id, hive_id, channel, display_name, created, last_seen FROM chat_sessions WHERE api_key = ? AND revoked_at IS NULL ORDER BY last_seen DESC LIMIT 20'),
    insertRefresh: db.prepare(`INSERT INTO refresh_tokens (session_id, refresh_hash, family_id, expires_at, created) VALUES (?,?,?,?,?)`),
    getRefreshByHash: db.prepare('SELECT * FROM refresh_tokens WHERE refresh_hash = ?'),
    revokeRefreshById: db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?'),
    revokeFamily: db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ?'),
    insertBlacklist: db.prepare('INSERT OR IGNORE INTO jwt_blacklist (jti, expires_at) VALUES (?,?)'),
    checkBlacklist: db.prepare('SELECT 1 FROM jwt_blacklist WHERE jti = ? AND expires_at > ?'),
    cleanBlacklist: db.prepare('DELETE FROM jwt_blacklist WHERE expires_at < ?'),
    pollHive: db.prepare(`SELECT message, sender, ts FROM pubsub WHERE channel LIKE ? AND ts > ? ORDER BY ts ASC LIMIT 100`),
    getHive: db.prepare('SELECT id FROM hives WHERE id = ?'),
  };

  // Purge expired blacklist entries every hour
  setInterval(() => { try { stmts.cleanBlacklist.run(Date.now()); } catch (_) {} }, 3600000);

  // ─── HELPERS ────────────────────────────────────────────────────────────────
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.INTERNAL_SECRET || 'slopshop-chat-secret-change-me';

  function issueTokens(sessionId, hiveId, channel, apiKey, familyId) {
    const jti = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    let accessToken = null;

    if (jwt) {
      accessToken = jwt.sign({
        sub: apiKey.slice(0, 12),
        sessionId, hiveId, channel, jti,
        iat: now, exp: now + ACCESS_EXP,
      }, JWT_SECRET);
    }

    const refreshRaw = crypto.randomBytes(64).toString('hex');
    const refreshHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
    const fid = familyId || crypto.randomUUID();
    const now_ms = Date.now();
    stmts.insertRefresh.run(sessionId, refreshHash, fid, now_ms + REFRESH_EXP_MS, now_ms);

    return { accessToken, refreshToken: refreshRaw, familyId: fid, jti, expiresIn: ACCESS_EXP };
  }

  function requireApiAuth(req, res) {
    const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!key || !apiKeys.get(key)) { fail(res, 401, 'auth_required', 'Set Authorization: Bearer <api_key>'); return null; }
    return key;
  }

  // ─── EXPORTED MIDDLEWARE ─────────────────────────────────────────────────────
  // Use this on chat-protected routes: app.use('/some/path', chatAuth)
  function chatAuth(req, res, next) {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
      if (!token) return fail(res, 401, 'auth_required', 'No Bearer token');

      // Allow raw API key as fallback (for agents using the API directly)
      if (token.startsWith('sk-')) {
        if (!apiKeys.get(token)) return fail(res, 401, 'invalid_key', 'Invalid API key');
        req.apiKey = token;
        return next();
      }

      if (!jwt) return fail(res, 503, 'jwt_unavailable', 'JWT library not installed (npm install jsonwebtoken)');

      let payload;
      try {
        payload = jwt.verify(token, JWT_SECRET, { clockTolerance: 30 });
      } catch (err) {
        if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'expired', needsRefresh: true });
        return fail(res, 401, 'invalid_token', 'Invalid JWT');
      }

      // Check session revocation
      const session = stmts.getSession.get(payload.sessionId);
      if (!session || session.revoked_at) return fail(res, 401, 'session_revoked', 'Session has been revoked');

      // Check jti blacklist
      if (stmts.checkBlacklist.get(payload.jti, Date.now())) return fail(res, 401, 'token_revoked', 'Token revoked');

      req.chatSession = payload;
      req.apiKey = session.api_key;
      stmts.touchSession.run(Date.now(), session.id);
      next();
    } catch (err) {
      next(err);
    }
  }

  // ─── 1. JOIN — create session + issue tokens ─────────────────────────────────
  app.post('/v1/auth/chat/join', (req, res) => {
    const apiKey = requireApiAuth(req, res);
    if (!apiKey) return;

    const { hive_id, channel, display_name } = req.body;
    if (!hive_id) return fail(res, 400, 'missing_hive_id', 'hive_id is required');

    // Verify hive exists
    const hive = stmts.getHive.get(hive_id);
    if (!hive) return fail(res, 404, 'hive_not_found', 'Hive not found');

    const sessionId = crypto.randomUUID();
    const now = Date.now();
    stmts.insertSession.run(sessionId, apiKey, hive_id, channel || '*', (display_name || apiKey.slice(0, 8)).slice(0, 50), now, now);

    const tokens = issueTokens(sessionId, hive_id, channel || '*', apiKey, null);
    ok(res, {
      session_id: sessionId,
      hive_id, channel: channel || '*',
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresIn,
      note: jwt ? 'JWT issued. Use access_token as Bearer.' : 'JWT unavailable — use raw API key as Bearer.',
    });
  });

  // ─── 2. REFRESH — token rotation with family reuse detection ─────────────────
  app.post('/v1/auth/chat/refresh', (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return fail(res, 400, 'missing_token', 'refresh_token is required');

    const hash = crypto.createHash('sha256').update(refresh_token).digest('hex');
    const record = stmts.getRefreshByHash.get(hash);

    if (!record) {
      return fail(res, 401, 'invalid_token', 'Invalid or expired refresh token');
    }

    // Reuse detection: if already revoked, nuke entire family
    if (record.revoked_at || record.expires_at < Date.now()) {
      if (record.family_id) {
        stmts.revokeFamily.run(Date.now(), record.family_id);
        const session = stmts.getSession.get(record.session_id);
        if (session) stmts.revokeSession.run(Date.now(), session.id);
      }
      return fail(res, 401, 'token_reuse_detected', 'Refresh token reuse detected. Session terminated for security.');
    }

    const session = stmts.getSession.get(record.session_id);
    if (!session || session.revoked_at) {
      return fail(res, 401, 'session_revoked', 'Session has been revoked');
    }

    // Rotate: revoke old, issue new in same family
    stmts.revokeRefreshById.run(Date.now(), record.id);
    const tokens = issueTokens(session.id, session.hive_id, session.channel, session.api_key, record.family_id);

    ok(res, {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresIn,
    });
  });

  // ─── 3. LOGOUT — revoke session ──────────────────────────────────────────────
  app.post('/v1/auth/chat/logout', chatAuth, (req, res) => {
    const sessionId = req.chatSession?.sessionId;
    if (sessionId) {
      stmts.revokeSession.run(Date.now(), sessionId);
      // Blacklist the jti for remaining access token lifetime
      if (req.chatSession?.jti) {
        stmts.insertBlacklist.run(req.chatSession.jti, Date.now() + ACCESS_EXP * 1000);
      }
    }
    ok(res, { logged_out: true });
  });

  // ─── 4. LIST SESSIONS ────────────────────────────────────────────────────────
  app.get('/v1/auth/chat/sessions', (req, res) => {
    const apiKey = requireApiAuth(req, res);
    if (!apiKey) return;
    const sessions = stmts.listSessions.all(apiKey);
    ok(res, { sessions });
  });

  // ─── 5. REVOKE SESSION (admin/owner) ─────────────────────────────────────────
  app.post('/v1/auth/chat/revoke', chatAuth, (req, res) => {
    const { session_id } = req.body;
    const target = session_id || req.chatSession?.sessionId;
    if (!target) return fail(res, 400, 'missing_session_id', 'session_id required');
    const session = stmts.getSession.get(target);
    if (!session) return fail(res, 404, 'not_found', 'Session not found');
    if (session.api_key !== req.apiKey) return fail(res, 403, 'forbidden', 'Cannot revoke another user\'s session');
    stmts.revokeSession.run(Date.now(), target);
    ok(res, { revoked: true, session_id: target });
  });

  // ─── 6. HIVE LIVE STREAM — SSE for all channels in a hive ───────────────────
  app.get('/v1/hive/:id/live', (req, res) => {
    const rawKey = (req.headers.authorization || req.query.key || '').replace('Bearer ', '').trim();
    if (!rawKey || !apiKeys.get(rawKey)) return res.status(401).json({ error: { code: 'auth_required' } });

    const hiveId = req.params.id;
    const hive = stmts.getHive.get(hiveId);
    if (!hive) return res.status(404).json({ error: { code: 'hive_not_found' } });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':\n\n');

    // Poll pubsub channel `hive:<id>:<channel>` pattern
    const channelPattern = `hive:${hiveId}:%`;
    let since = Date.now() - 1000; // small lookback
    let closed = false;
    const MAX_MS = 30 * 60 * 1000;
    const start = Date.now();
    let heartbeat = 0;

    function push(event, data) {
      if (closed) return;
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) { closed = true; }
    }

    const interval = setInterval(() => {
      if (closed) return;
      if (Date.now() - start > MAX_MS) { push('close', { reason: 'max_duration' }); res.end(); closed = true; return; }
      try {
        const rows = stmts.pollHive.all(channelPattern, since);
        if (rows.length) {
          since = rows[rows.length - 1].ts;
          for (const row of rows) {
            try {
              const parsed = JSON.parse(row.message);
              const channel = parsed.channel || 'general';
              push('message', { ...parsed, channel, sender: row.sender, ts: row.ts });
            } catch (_) {}
          }
        }
      } catch (_) {}
      heartbeat++;
      if (heartbeat % 15 === 0) push('heartbeat', { ts: Date.now() });
    }, 800);

    req.on('close', () => { closed = true; clearInterval(interval); });
  });

  // Export middleware for use in other routes
  app.locals.chatAuth = chatAuth;
};
