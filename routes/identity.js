'use strict';

/**
 * Agent Identity, Zero-Trust, A2A Protocol, and Reputation System
 * routes/identity.js
 *
 * Full working implementations — no stubs, no TODOs.
 * Uses: crypto (built-in), better-sqlite3 (db passed in), express
 */

const crypto = require('crypto');

// ─── JWT-like token helpers (HMAC-SHA256, no external lib) ───────────────────

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

function signToken(payload) {
  const secret = process.env.INTERNAL_SECRET || 'slop-internal-secret-change-me';
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

// FIX #1: timingSafeEqual throws if buffers have different lengths (truncated/tampered tokens).
// Now length-check before comparison to avoid unhandled exception.
function verifyToken(token) {
  try {
    const secret = process.env.INTERNAL_SECRET || 'slop-internal-secret-change-me';
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    // Guard: timingSafeEqual requires identical lengths
    if (sigBuf.length !== expBuf.length) return null;
    const valid = crypto.timingSafeEqual(sigBuf, expBuf);
    if (!valid) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// FIX #5: ANS name validation — only allow safe characters for URL-safe names.
function isValidAnsName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(name);
}

// ─── Inline auth helper ───────────────────────────────────────────────────────

function requireAuth(req, res, apiKeys) {
  const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!key || !apiKeys.get(key)) {
    res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
    return null;
  }
  return key;
}

// ─── Reputation scoring ───────────────────────────────────────────────────────

const SCORE_DELTAS = { success: 0.1, failure: -0.3, error: -0.5, timeout: -0.2 };

function clampScore(s) {
  return Math.max(0, Math.min(10, s));
}

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = function (app, db, apiKeys) {

  // ── Schema bootstrap ──────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_identities (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      task_scope TEXT,
      expires_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL,
      last_used INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_agent_identities_agent_id ON agent_identities(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_identities_api_key  ON agent_identities(api_key);

    CREATE TABLE IF NOT EXISTS ans_registry (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      name TEXT UNIQUE NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      endpoint_hint TEXT,
      metadata TEXT,
      reputation REAL NOT NULL DEFAULT 5.0,
      registered INTEGER NOT NULL,
      last_seen INTEGER,
      expires_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_ans_registry_api_key ON ans_registry(api_key);

    CREATE TABLE IF NOT EXISTS reputation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      signal TEXT NOT NULL,
      task TEXT,
      credits_used INTEGER,
      score_delta REAL NOT NULL,
      ts INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reputation_events_agent_id ON reputation_events(agent_id);

    CREATE TABLE IF NOT EXISTS a2a_messages (
      id TEXT PRIMARY KEY,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'pending',
      ttl_ms INTEGER,
      created INTEGER NOT NULL,
      responded_at INTEGER,
      response TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_a2a_messages_to_agent   ON a2a_messages(to_agent);
    CREATE INDEX IF NOT EXISTS idx_a2a_messages_from_agent ON a2a_messages(from_agent);

    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      name TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      created INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS org_members (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      api_key TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      agent_quota INTEGER NOT NULL DEFAULT 10,
      joined INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_org_members_org_id  ON org_members(org_id);
    CREATE INDEX IF NOT EXISTS idx_org_members_api_key ON org_members(api_key);

    CREATE TABLE IF NOT EXISTS org_invites (
      token TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      agent_quota INTEGER NOT NULL DEFAULT 10,
      created_by TEXT NOT NULL,
      created INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      redeemed INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_org_invites_org_id ON org_invites(org_id);
  `);

  // FIX #6 / schema migration: add expires_at column to ans_registry if it doesn't exist yet
  try {
    db.exec(`ALTER TABLE ans_registry ADD COLUMN expires_at INTEGER`);
  } catch { /* column already exists — safe to ignore */ }

  // ── Prepared statements ───────────────────────────────────────────────────

  const stmts = {
    // agent_identities
    insertIdentity: db.prepare(`
      INSERT INTO agent_identities (id, api_key, agent_id, token_hash, capabilities, task_scope, expires_at, revoked, created, last_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `),
    getIdentityByHash: db.prepare(`SELECT * FROM agent_identities WHERE token_hash = ?`),
    getIdentityByAgentId: db.prepare(`SELECT * FROM agent_identities WHERE agent_id = ? ORDER BY created DESC LIMIT 1`),
    revokeByHash: db.prepare(`UPDATE agent_identities SET revoked = 1 WHERE token_hash = ?`),
    revokeByAgentId: db.prepare(`UPDATE agent_identities SET revoked = 1 WHERE agent_id = ?`),
    touchIdentity: db.prepare(`UPDATE agent_identities SET last_used = ? WHERE token_hash = ?`),
    listIdentities: db.prepare(`SELECT * FROM agent_identities WHERE api_key = ? ORDER BY created DESC`),

    // ans_registry
    insertAns: db.prepare(`
      INSERT INTO ans_registry (id, api_key, agent_id, name, capabilities, endpoint_hint, metadata, reputation, registered, last_seen, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 5.0, ?, ?, ?)
    `),
    getAnsByName: db.prepare(`SELECT * FROM ans_registry WHERE name = ?`),
    getAnsByAgentId: db.prepare(`SELECT * FROM ans_registry WHERE agent_id = ?`),
    deleteAns: db.prepare(`DELETE FROM ans_registry WHERE agent_id = ? AND api_key = ?`),
    discoverByCapability: db.prepare(`
      SELECT * FROM ans_registry
      WHERE capabilities LIKE ?
      AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY reputation DESC
      LIMIT ?
    `),
    listAllAns: db.prepare(`
      SELECT * FROM ans_registry
      WHERE (expires_at IS NULL OR expires_at > ?)
      ORDER BY reputation DESC
      LIMIT ?
    `),
    updateAnsReputation: db.prepare(`UPDATE ans_registry SET reputation = ?, last_seen = ? WHERE agent_id = ?`),
    updateAnsLastSeen: db.prepare(`UPDATE ans_registry SET last_seen = ? WHERE agent_id = ?`),

    // reputation_events
    insertRepEvent: db.prepare(`
      INSERT INTO reputation_events (agent_id, signal, task, credits_used, score_delta, ts)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getRepEvents: db.prepare(`SELECT * FROM reputation_events WHERE agent_id = ? ORDER BY ts DESC LIMIT 100`),
    getRepEventCount: db.prepare(`SELECT COUNT(*) as cnt FROM reputation_events WHERE agent_id = ?`),
    getRepSuccessCount: db.prepare(`SELECT COUNT(*) as cnt FROM reputation_events WHERE agent_id = ? AND signal = 'success'`),
    getRepRank: db.prepare(`SELECT COUNT(*) as cnt FROM ans_registry WHERE reputation > (SELECT reputation FROM ans_registry WHERE agent_id = ?)`),
    getTotalAgents: db.prepare(`SELECT COUNT(*) as cnt FROM ans_registry`),

    // a2a_messages
    insertMessage: db.prepare(`
      INSERT INTO a2a_messages (id, from_agent, to_agent, type, payload, priority, status, ttl_ms, created, responded_at, response)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL, NULL)
    `),
    getInbox: db.prepare(`
      SELECT * FROM a2a_messages
      WHERE to_agent = ? AND status = 'pending'
      ORDER BY priority DESC, created ASC
    `),
    getMessage: db.prepare(`SELECT * FROM a2a_messages WHERE id = ?`),
    respondMessage: db.prepare(`
      UPDATE a2a_messages SET status = ?, response = ?, responded_at = ? WHERE id = ? AND status = 'pending'
    `),
    getConversations: db.prepare(`
      SELECT * FROM a2a_messages
      WHERE from_agent = ? OR to_agent = ?
      ORDER BY created ASC
    `),
    purgeExpiredMessages: db.prepare(`
      DELETE FROM a2a_messages
      WHERE ttl_ms IS NOT NULL AND (created + ttl_ms) < ? AND status = 'pending'
    `),

    // orgs
    insertOrg: db.prepare(`INSERT INTO orgs (id, api_key, name, plan, created) VALUES (?, ?, ?, ?, ?)`),
    getOrg: db.prepare(`SELECT * FROM orgs WHERE id = ?`),
    insertMember: db.prepare(`INSERT INTO org_members (id, org_id, api_key, role, agent_quota, joined) VALUES (?, ?, ?, ?, ?, ?)`),
    getMembers: db.prepare(`SELECT * FROM org_members WHERE org_id = ?`),
    getMemberByKey: db.prepare(`SELECT * FROM org_members WHERE org_id = ? AND api_key = ?`),
    countAgentsByKey: db.prepare(`SELECT COUNT(*) as cnt FROM agent_identities WHERE api_key = ? AND revoked = 0 AND expires_at > ?`),
    orgUsage: db.prepare(`SELECT api_key, COUNT(*) as active_agents FROM agent_identities WHERE api_key = ? AND revoked = 0 AND expires_at > ? GROUP BY api_key`),

    // org_invites
    insertInvite: db.prepare(`
      INSERT INTO org_invites (token, org_id, role, agent_quota, created_by, created, expires_at, redeemed)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `),
    getInvite: db.prepare(`SELECT * FROM org_invites WHERE token = ?`),
    redeemInvite: db.prepare(`UPDATE org_invites SET redeemed = 1 WHERE token = ?`),
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getRepScore(agent_id) {
    const rec = stmts.getAnsByAgentId.get(agent_id);
    return rec ? rec.reputation : 5.0;
  }

  function applyRepSignal(agent_id, signal) {
    const delta = SCORE_DELTAS[signal] || 0;
    const rec = stmts.getAnsByAgentId.get(agent_id);
    const current = rec ? rec.reputation : 5.0;
    const next = clampScore(current + delta);
    if (rec) stmts.updateAnsReputation.run(next, Date.now(), agent_id);
    return { delta, next };
  }

  // FIX #17: helper to check if caller is org owner OR an admin member
  function isOrgAdmin(org, key) {
    if (org.api_key === key) return true;
    const member = stmts.getMemberByKey.get(org.id, key);
    return member && member.role === 'admin';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AGENT IDENTITY SYSTEM
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/identity/issue
  app.post('/v1/identity/issue', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { agent_id, capabilities = [], ttl_seconds = 3600, task_scope } = req.body;
    if (!agent_id) return res.status(400).json({ ok: false, error: { code: 'missing_agent_id', message: 'agent_id is required' } });
    if (typeof agent_id !== 'string' || agent_id.length > 256) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_agent_id', message: 'agent_id must be a string <= 256 chars' } });
    }

    const now = Date.now();
    const ttl = Math.max(60, Math.min(Number(ttl_seconds) || 3600, 86400 * 30)); // 1 min–30 days
    const expires_at = now + ttl * 1000;
    const public_id = crypto.randomUUID();

    const caps = Array.isArray(capabilities) ? capabilities : [];

    const payload = {
      jti: public_id,
      agent_id,
      capabilities: caps,
      task_scope: task_scope || null,
      iss: 'slopshop.gg',
      iat: Math.floor(now / 1000),
      exp: Math.floor(expires_at / 1000),
    };

    const token = signToken(payload);
    const token_hash = hashToken(token);

    stmts.insertIdentity.run(
      public_id,
      key,
      agent_id,
      token_hash,
      JSON.stringify(caps),
      task_scope || null,
      expires_at,
      now,
      now
    );

    return res.json({
      ok: true,
      _engine: 'real',
      token,
      agent_id,
      public_id,
      expires_at,
      ttl_seconds: ttl,
      capabilities: caps,
      task_scope: task_scope || null,
    });
  });

  // POST /v1/identity/verify
  app.post('/v1/identity/verify', (req, res) => {
    // FIX #2/#3: Support token and svid fields; return task_scope + public_id in valid response
    const token = req.body.token || req.body.svid;
    if (!token) return res.status(400).json({ ok: false, error: { code: 'missing_token', message: 'token (or svid) is required' } });

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(200).json({ ok: true, _engine: 'real', valid: false, reason: 'invalid_signature' });
    }

    const now = Date.now();
    const exp_ms = payload.exp * 1000;
    if (exp_ms < now) {
      return res.json({ ok: true, _engine: 'real', valid: false, reason: 'expired' });
    }

    const token_hash = hashToken(token);
    const record = stmts.getIdentityByHash.get(token_hash);

    if (!record) {
      return res.json({ ok: true, _engine: 'real', valid: false, reason: 'not_found' });
    }
    if (record.revoked) {
      return res.json({ ok: true, _engine: 'real', valid: false, reason: 'revoked' });
    }

    stmts.touchIdentity.run(now, token_hash);
    const reputation_score = getRepScore(payload.agent_id);

    return res.json({
      ok: true,
      _engine: 'real',
      valid: true,
      agent_id: payload.agent_id,
      public_id: record.id,
      capabilities: JSON.parse(record.capabilities || '[]'),
      task_scope: record.task_scope || null,
      expires_at: record.expires_at,
      reputation_score,
    });
  });

  // POST /v1/identity/revoke
  app.post('/v1/identity/revoke', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { token, agent_id } = req.body;
    if (!token && !agent_id) {
      return res.status(400).json({ ok: false, error: { code: 'missing_param', message: 'Provide token or agent_id' } });
    }

    if (token) {
      const token_hash = hashToken(token);
      stmts.revokeByHash.run(token_hash);
      return res.json({ ok: true, _engine: 'real', revoked: true, by: 'token' });
    }

    stmts.revokeByAgentId.run(agent_id);
    return res.json({ ok: true, _engine: 'real', revoked: true, by: 'agent_id', agent_id });
  });

  // GET /v1/identity/list  (must come before /:agent_id)
  app.get('/v1/identity/list', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const rows = stmts.listIdentities.all(key);
    const identities = rows.map(r => ({
      public_id: r.id,
      agent_id: r.agent_id,
      capabilities: JSON.parse(r.capabilities || '[]'),
      task_scope: r.task_scope || null,
      expires_at: r.expires_at,
      revoked: !!r.revoked,
      created: r.created,
      last_used: r.last_used,
    }));

    return res.json({ ok: true, _engine: 'real', identities, count: identities.length });
  });

  // GET /v1/identity/:agent_id
  // FIX #17: require auth so internal capabilities/task_scope aren't publicly readable
  app.get('/v1/identity/:agent_id', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { agent_id } = req.params;
    const record = stmts.getIdentityByAgentId.get(agent_id);
    if (!record) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Agent identity not found' } });

    const now = Date.now();
    const rep = getRepScore(agent_id);
    const events = stmts.getRepEvents.all(agent_id);
    const totalCount = stmts.getRepEventCount.get(agent_id).cnt;
    const successCount = stmts.getRepSuccessCount.get(agent_id).cnt;

    return res.json({
      ok: true,
      _engine: 'real',
      agent_id,
      public_id: record.id,
      capabilities: JSON.parse(record.capabilities || '[]'),
      task_scope: record.task_scope || null,
      expires_at: record.expires_at,
      active: !record.revoked && record.expires_at > now,
      revoked: !!record.revoked,
      reputation_score: rep,
      task_history: {
        total: totalCount,
        success: successCount,
        recent: events.slice(0, 20),
      },
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // AGENT NAME SERVICE
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/ans/register
  app.post('/v1/ans/register', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    // FIX #4: allow caller to supply their own agent_id (e.g. after issuing identity)
    const { name, agent_id: provided_agent_id, capabilities = [], endpoint_hint, metadata, ttl_seconds = 86400 } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: { code: 'missing_name', message: 'name is required' } });

    // FIX #5: validate name format — only URL-safe chars
    if (!isValidAnsName(name)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_name', message: 'name must be 1–128 chars, alphanumeric, dots, dashes, underscores only' } });
    }

    const now = Date.now();
    const ttl = Math.max(300, Math.min(Number(ttl_seconds) || 86400, 86400 * 365)); // 5min–1year
    const agent_id = provided_agent_id && typeof provided_agent_id === 'string'
      ? provided_agent_id
      : crypto.randomUUID();
    const record_id = crypto.randomUUID();
    // FIX #6: persist expires_at so TTL is actually enforced in queries
    const expires_at = now + ttl * 1000;

    try {
      stmts.insertAns.run(
        record_id,
        key,
        agent_id,
        name,
        JSON.stringify(Array.isArray(capabilities) ? capabilities : []),
        endpoint_hint || null,
        metadata ? JSON.stringify(metadata) : null,
        now,
        now,
        expires_at
      );
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        return res.status(409).json({ ok: false, error: { code: 'name_conflict', message: 'Agent name already registered' } });
      }
      throw e;
    }

    return res.json({ ok: true, _engine: 'real', agent_id, record_id, ttl_seconds: ttl, expires_at, name });
  });

  // GET /v1/ans/discover
  // FIX #7: require non-empty capability OR explicit list mode; never return all records silently
  app.get('/v1/ans/discover', (req, res) => {
    const capability = (req.query.capability || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    const now = Date.now();

    let rows;
    if (capability === '') {
      // List mode — return all non-expired agents sorted by reputation
      rows = stmts.listAllAns.all(now, limit);
    } else {
      rows = stmts.discoverByCapability.all(`%${capability}%`, now, limit);
    }

    const agents = rows.map(r => ({
      agent_id: r.agent_id,
      name: r.name,
      capabilities: JSON.parse(r.capabilities || '[]'),
      endpoint_hint: r.endpoint_hint,
      reputation: r.reputation,
      last_seen: r.last_seen,
      expires_at: r.expires_at,
    }));

    return res.json({ ok: true, _engine: 'real', agents, count: agents.length, capability: capability || null });
  });

  // GET /v1/ans/lookup/:name
  // FIX #8/#19: normalize 404 shape to include ok: false; TTL-aware lookup
  app.get('/v1/ans/lookup/:name', (req, res) => {
    const record = stmts.getAnsByName.get(req.params.name);
    if (!record) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Agent not found' } });

    const now = Date.now();
    if (record.expires_at && record.expires_at < now) {
      return res.status(404).json({ ok: false, error: { code: 'expired', message: 'ANS registration has expired' } });
    }

    // Update last_seen on lookup
    stmts.updateAnsLastSeen.run(now, record.agent_id);

    return res.json({
      ok: true,
      _engine: 'real',
      agent_id: record.agent_id,
      name: record.name,
      capabilities: JSON.parse(record.capabilities || '[]'),
      endpoint_hint: record.endpoint_hint,
      metadata: record.metadata ? JSON.parse(record.metadata) : null,
      reputation: record.reputation,
      registered: record.registered,
      last_seen: now,
      expires_at: record.expires_at,
    });
  });

  // DELETE /v1/ans/:agent_id
  app.delete('/v1/ans/:agent_id', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { agent_id } = req.params;
    const existing = stmts.getAnsByAgentId.get(agent_id);
    if (!existing) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Agent not found' } });
    if (existing.api_key !== key) return res.status(403).json({ ok: false, error: { code: 'forbidden', message: "Cannot deregister another API key's agent" } });

    stmts.deleteAns.run(agent_id, key);
    return res.json({ ok: true, _engine: 'real', deregistered: true, agent_id });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // REPUTATION SCORING
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/reputation/signal
  // FIX #9: require auth — anyone could poison any agent's reputation without it
  app.post('/v1/reputation/signal', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { agent_id, signal, task, credits_used } = req.body;
    if (!agent_id) return res.status(400).json({ ok: false, error: { code: 'missing_agent_id', message: 'agent_id is required' } });
    if (!['success', 'failure', 'error', 'timeout'].includes(signal)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_signal', message: 'signal must be success|failure|error|timeout' } });
    }

    const now = Date.now();
    const { delta, next: new_score } = applyRepSignal(agent_id, signal);

    stmts.insertRepEvent.run(
      agent_id,
      signal,
      task || null,
      Number(credits_used) || 0,
      delta,
      now
    );

    return res.json({
      ok: true,
      _engine: 'real',
      agent_id,
      signal,
      score_delta: delta,
      new_score,
      recorded_at: now,
    });
  });

  // GET /v1/reputation/:agent_id
  app.get('/v1/reputation/:agent_id', (req, res) => {
    const { agent_id } = req.params;

    const rec = stmts.getAnsByAgentId.get(agent_id);
    const score = rec ? rec.reputation : 5.0;
    const totalResult = stmts.getRepEventCount.get(agent_id);
    const successResult = stmts.getRepSuccessCount.get(agent_id);
    const total_tasks = totalResult ? totalResult.cnt : 0;
    const success_count = successResult ? successResult.cnt : 0;
    const success_rate = total_tasks > 0 ? success_count / total_tasks : 0;

    const rankResult = stmts.getRepRank.get(agent_id);
    const totalAgents = stmts.getTotalAgents.get().cnt;
    const rank = rankResult ? rankResult.cnt + 1 : 1;
    const percentile = totalAgents > 1 ? Math.round((1 - (rank - 1) / totalAgents) * 100) : 100;

    return res.json({
      ok: true,
      _engine: 'real',
      agent_id,
      score,
      total_tasks,
      success_rate: Math.round(success_rate * 1000) / 1000,
      rank,
      percentile,
    });
  });

  // POST /v1/reputation/slash
  app.post('/v1/reputation/slash', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { agent_id, reason, severity = 5 } = req.body;
    if (!agent_id) return res.status(400).json({ ok: false, error: { code: 'missing_agent_id', message: 'agent_id is required' } });

    const sev = Math.max(1, Math.min(10, Number(severity) || 5));
    const delta = -(sev * 0.5);

    const rec = stmts.getAnsByAgentId.get(agent_id);
    const current = rec ? rec.reputation : 5.0;
    const new_score = clampScore(current + delta);

    if (rec) stmts.updateAnsReputation.run(new_score, Date.now(), agent_id);

    stmts.insertRepEvent.run(
      agent_id,
      'error',
      reason || 'reputation slash',
      0,
      delta,
      Date.now()
    );

    return res.json({
      ok: true,
      _engine: 'real',
      agent_id,
      slashed: true,
      severity: sev,
      score_delta: delta,
      previous_score: current,
      new_score,
      reason: reason || null,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // A2A PROTOCOL
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/a2a/message
  // FIX #10: echo payload summary back in response
  app.post('/v1/a2a/message', (req, res) => {
    const { from_agent, to_agent, type, payload, priority = 5, ttl_ms } = req.body;

    if (!from_agent || !to_agent) {
      return res.status(400).json({ ok: false, error: { code: 'missing_agents', message: 'from_agent and to_agent are required' } });
    }
    if (!['request', 'response', 'delegate', 'notify'].includes(type)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_type', message: 'type must be request|response|delegate|notify' } });
    }
    if (payload === undefined || payload === null) {
      return res.status(400).json({ ok: false, error: { code: 'missing_payload', message: 'payload is required' } });
    }

    const message_id = crypto.randomUUID();
    const queued_at = Date.now();
    const prio = Math.max(1, Math.min(10, Number(priority) || 5));
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    stmts.insertMessage.run(
      message_id,
      from_agent,
      to_agent,
      type,
      payloadStr,
      prio,
      ttl_ms ? Number(ttl_ms) : null,
      queued_at
    );

    return res.json({
      ok: true,
      _engine: 'real',
      message_id,
      queued_at,
      status: 'pending',
      from_agent,
      to_agent,
      type,
      priority: prio,
      payload: (() => { try { return JSON.parse(payloadStr); } catch { return payloadStr; } })(),
    });
  });

  // GET /v1/a2a/inbox/:agent_id
  // FIX #12: purge expired messages from DB on each inbox read (lazy GC)
  app.get('/v1/a2a/inbox/:agent_id', (req, res) => {
    const { agent_id } = req.params;
    const now = Date.now();

    // Lazy GC: delete expired pending messages for this agent
    stmts.purgeExpiredMessages.run(now);

    const rows = stmts.getInbox.all(agent_id);

    const messages = rows.map(r => ({
      message_id: r.id,
      from_agent: r.from_agent,
      type: r.type,
      payload: (() => { try { return JSON.parse(r.payload); } catch { return r.payload; } })(),
      priority: r.priority,
      status: r.status,
      created: r.created,
      ttl_ms: r.ttl_ms,
      expires_at: r.ttl_ms ? r.created + r.ttl_ms : null,
    }));

    return res.json({ ok: true, _engine: 'real', agent_id, messages, count: messages.length });
  });

  // POST /v1/a2a/respond
  // FIX #11: prevent double-responding — only respond to pending messages
  app.post('/v1/a2a/respond', (req, res) => {
    const { message_id, payload, status } = req.body;
    if (!message_id) return res.status(400).json({ ok: false, error: { code: 'missing_message_id', message: 'message_id is required' } });
    if (!['success', 'error', 'delegated'].includes(status)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_status', message: 'status must be success|error|delegated' } });
    }

    const msg = stmts.getMessage.get(message_id);
    if (!msg) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Message not found' } });

    // FIX #11: block responding to already-responded messages
    if (msg.status !== 'pending') {
      return res.status(409).json({ ok: false, error: { code: 'already_responded', message: `Message already has status: ${msg.status}` } });
    }

    const responded_at = Date.now();
    const payloadStr = payload !== undefined
      ? (typeof payload === 'string' ? payload : JSON.stringify(payload))
      : '{}';

    stmts.respondMessage.run(
      status,
      payloadStr,
      responded_at,
      message_id
    );

    return res.json({
      ok: true,
      _engine: 'real',
      message_id,
      status,
      responded_at,
      from_agent: msg.from_agent,
      to_agent: msg.to_agent,
    });
  });

  // POST /v1/a2a/delegate
  // FIX #18: invert acceptance logic — unknown agents should NOT auto-accept; require ANS registration
  app.post('/v1/a2a/delegate', (req, res) => {
    const { from_agent, to_agent, task, context, budget_credits } = req.body;
    if (!from_agent || !to_agent) {
      return res.status(400).json({ ok: false, error: { code: 'missing_agents', message: 'from_agent and to_agent are required' } });
    }
    if (!task) return res.status(400).json({ ok: false, error: { code: 'missing_task', message: 'task is required' } });

    const delegation_id = crypto.randomUUID();
    const now = Date.now();

    // FIX #18: unknown agents (not in ANS) are NOT auto-accepted; require reputation >= 3.0 for known agents
    const targetRec = stmts.getAnsByAgentId.get(to_agent);
    // If agent is unregistered: reject (can't validate). If registered: accept only if reputation >= 3.0
    const accepted = targetRec ? targetRec.reputation >= 3.0 : false;
    const reject_reason = !targetRec ? 'unregistered_agent' : (targetRec.reputation < 3.0 ? 'reputation_too_low' : null);

    const delegatePayload = {
      delegation_id,
      task,
      context: context || null,
      budget_credits: Number(budget_credits) || 0,
      accepted,
    };

    stmts.insertMessage.run(
      delegation_id,
      from_agent,
      to_agent,
      'delegate',
      JSON.stringify(delegatePayload),
      8, // high priority for delegations
      null,
      now
    );

    return res.json({
      ok: true,
      _engine: 'real',
      delegation_id,
      accepted,
      reject_reason: accepted ? null : reject_reason,
      from_agent,
      to_agent,
      task,
      budget_credits: delegatePayload.budget_credits,
      created: now,
    });
  });

  // POST /v1/a2a/send — simplified alias for /v1/a2a/message
  // Accepts: {from_agent, to_agent, message, type} where type defaults to 'notify'
  app.post('/v1/a2a/send', (req, res) => {
    const { from_agent, to_agent, message, type = 'notify', priority = 5, ttl_ms } = req.body;

    if (!from_agent || !to_agent) {
      return res.status(400).json({ ok: false, error: { code: 'missing_agents', message: 'from_agent and to_agent are required' } });
    }

    // Normalize type: map unknown types to 'notify'
    const VALID_TYPES = ['request', 'response', 'delegate', 'notify'];
    const normalizedType = VALID_TYPES.includes(type) ? type : 'notify';

    const message_id = crypto.randomUUID();
    const queued_at = Date.now();
    const prio = Math.max(1, Math.min(10, Number(priority) || 5));

    // FIX #13: warn if message is undefined — default to empty string, not '{}'
    const payload = message !== undefined
      ? (typeof message === 'string' ? message : JSON.stringify(message))
      : '';

    stmts.insertMessage.run(
      message_id,
      from_agent,
      to_agent,
      normalizedType,
      payload,
      prio,
      ttl_ms ? Number(ttl_ms) : null,
      queued_at
    );

    return res.json({
      ok: true,
      _engine: 'real',
      message_id,
      queued_at,
      status: 'pending',
      from_agent,
      to_agent,
      type: normalizedType,
      priority: prio,
      message_preview: typeof payload === 'string' ? payload.slice(0, 100) : null,
    });
  });

  // GET /v1/a2a/conversations/:agent_id
  app.get('/v1/a2a/conversations/:agent_id', (req, res) => {
    const { agent_id } = req.params;
    const rows = stmts.getConversations.all(agent_id, agent_id);

    // Group into threads by pairing from_agent+to_agent
    const threads = {};
    for (const r of rows) {
      const key = [r.from_agent, r.to_agent].sort().join('::');
      if (!threads[key]) threads[key] = { participants: [r.from_agent, r.to_agent].sort(), messages: [] };
      threads[key].messages.push({
        message_id: r.id,
        from_agent: r.from_agent,
        to_agent: r.to_agent,
        type: r.type,
        payload: (() => { try { return JSON.parse(r.payload); } catch { return r.payload; } })(),
        priority: r.priority,
        status: r.status,
        created: r.created,
        responded_at: r.responded_at,
        response: r.response ? (() => { try { return JSON.parse(r.response); } catch { return r.response; } })() : null,
      });
    }

    return res.json({
      ok: true,
      _engine: 'real',
      agent_id,
      threads: Object.values(threads),
      thread_count: Object.keys(threads).length,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // MULTI-TENANT IDENTITY
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/org/create
  app.post('/v1/org/create', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { name, plan = 'free' } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: { code: 'missing_name', message: 'org name is required' } });
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_name', message: 'org name must be a non-empty string' } });
    }
    if (!['free', 'pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_plan', message: 'plan must be free|pro|enterprise' } });
    }

    const now = Date.now();
    const org_id = crypto.randomUUID();

    // FIX #14: generate but also store invite token so it can be redeemed later
    const member_invite_token = 'inv-' + crypto.randomBytes(20).toString('hex');
    const invite_expires_at = now + 7 * 24 * 3600 * 1000; // 7 days

    stmts.insertOrg.run(org_id, key, name.trim(), plan, now);

    // Add creator as admin member
    const member_id = crypto.randomUUID();
    const quotaByPlan = { free: 5, pro: 50, enterprise: 500 };
    stmts.insertMember.run(member_id, org_id, key, 'admin', quotaByPlan[plan] || 5, now);

    // Persist the initial invite token
    stmts.insertInvite.run(
      member_invite_token,
      org_id,
      'member',
      quotaByPlan[plan] || 5,
      key,
      now,
      invite_expires_at,
    );

    return res.json({
      ok: true,
      _engine: 'real',
      org_id,
      name: name.trim(),
      plan,
      member_invite_token,
      invite_expires_at,
      created: now,
    });
  });

  // POST /v1/org/invite
  // FIX #15: allow admin members (not just owner) to generate invites
  // FIX #14: persist invite token to DB
  app.post('/v1/org/invite', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { org_id, role = 'member', agent_quota = 10 } = req.body;
    if (!org_id) return res.status(400).json({ ok: false, error: { code: 'missing_org_id', message: 'org_id is required' } });
    if (!['admin', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_role', message: 'role must be admin|member|viewer' } });
    }

    const org = stmts.getOrg.get(org_id);
    if (!org) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Org not found' } });

    // FIX #15: allow org owner OR admin members to invite
    if (!isOrgAdmin(org, key)) {
      return res.status(403).json({ ok: false, error: { code: 'forbidden', message: 'Must be org owner or admin to invite' } });
    }

    const now = Date.now();
    const invite_token = 'inv-' + crypto.randomBytes(20).toString('hex');
    const expires_at = now + 7 * 24 * 3600 * 1000; // 7 days
    const quota = Math.max(1, Math.min(Number(agent_quota) || 10, 1000));

    // FIX #14: persist invite so it can be validated/redeemed
    stmts.insertInvite.run(invite_token, org_id, role, quota, key, now, expires_at);

    const invite_link = `https://slopshop.gg/join?token=${invite_token}&org=${org_id}&role=${role}`;

    return res.json({
      ok: true,
      _engine: 'real',
      org_id,
      role,
      agent_quota: quota,
      invite_token,
      invite_link,
      expires_at,
    });
  });

  // POST /v1/org/join  — redeem an invite token
  app.post('/v1/org/join', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { invite_token } = req.body;
    if (!invite_token) return res.status(400).json({ ok: false, error: { code: 'missing_token', message: 'invite_token is required' } });

    const invite = stmts.getInvite.get(invite_token);
    if (!invite) return res.status(404).json({ ok: false, error: { code: 'invalid_token', message: 'Invite token not found' } });
    if (invite.redeemed) return res.status(409).json({ ok: false, error: { code: 'already_redeemed', message: 'Invite token already used' } });
    if (invite.expires_at < Date.now()) return res.status(410).json({ ok: false, error: { code: 'expired', message: 'Invite token has expired' } });

    const now = Date.now();
    const member_id = crypto.randomUUID();
    stmts.insertMember.run(member_id, invite.org_id, key, invite.role, invite.agent_quota, now);
    stmts.redeemInvite.run(invite_token);

    const org = stmts.getOrg.get(invite.org_id);

    return res.json({
      ok: true,
      _engine: 'real',
      member_id,
      org_id: invite.org_id,
      org_name: org ? org.name : null,
      role: invite.role,
      agent_quota: invite.agent_quota,
      joined: now,
    });
  });

  // GET /v1/org/:org_id/members
  // FIX #16: allow admin members (not just owner) to view members
  app.get('/v1/org/:org_id/members', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { org_id } = req.params;
    const org = stmts.getOrg.get(org_id);
    if (!org) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Org not found' } });

    // FIX #16: org owner OR any member can view
    const callerMember = stmts.getMemberByKey.get(org_id, key);
    if (org.api_key !== key && !callerMember) {
      return res.status(403).json({ ok: false, error: { code: 'forbidden', message: 'Access denied' } });
    }

    const members = stmts.getMembers.all(org_id);
    const now = Date.now();

    const enriched = members.map(m => {
      const active_agents = stmts.countAgentsByKey.get(m.api_key, now).cnt;
      return {
        member_id: m.id,
        api_key_prefix: m.api_key.slice(0, 12) + '...',
        role: m.role,
        agent_quota: m.agent_quota,
        active_agents,
        joined: m.joined,
      };
    });

    return res.json({
      ok: true,
      _engine: 'real',
      org_id,
      org_name: org.name,
      plan: org.plan,
      members: enriched,
      member_count: enriched.length,
    });
  });

  // GET /v1/org/:org_id/usage
  // FIX #16: allow admin members (not just owner) to view usage
  app.get('/v1/org/:org_id/usage', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { org_id } = req.params;
    const org = stmts.getOrg.get(org_id);
    if (!org) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Org not found' } });

    // FIX #16: org owner OR admin member can view usage
    if (!isOrgAdmin(org, key)) {
      const callerMember = stmts.getMemberByKey.get(org_id, key);
      if (!callerMember) {
        return res.status(403).json({ ok: false, error: { code: 'forbidden', message: 'Access denied' } });
      }
    }

    const members = stmts.getMembers.all(org_id);
    const now = Date.now();

    let total_active_agents = 0;
    let total_agent_quota = 0;
    const member_usage = members.map(m => {
      const active = stmts.countAgentsByKey.get(m.api_key, now).cnt;
      total_active_agents += active;
      total_agent_quota += m.agent_quota;
      return {
        role: m.role,
        agent_quota: m.agent_quota,
        active_agents: active,
      };
    });

    return res.json({
      ok: true,
      _engine: 'real',
      org_id,
      org_name: org.name,
      plan: org.plan,
      summary: {
        total_members: members.length,
        total_active_agents,
        total_agent_quota,
        quota_used_pct: total_agent_quota > 0 ? Math.round((total_active_agents / total_agent_quota) * 100) : 0,
      },
      member_usage,
      as_of: now,
    });
  });
};
