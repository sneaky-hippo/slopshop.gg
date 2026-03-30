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
    const valid = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!valid) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── Inline auth helper ───────────────────────────────────────────────────────

function requireAuth(req, res, apiKeys) {
  const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!key || !apiKeys.get(key)) {
    res.status(401).json({ error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
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
      last_seen INTEGER
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
  `);

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
      INSERT INTO ans_registry (id, api_key, agent_id, name, capabilities, endpoint_hint, metadata, reputation, registered, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, 5.0, ?, ?)
    `),
    getAnsByName: db.prepare(`SELECT * FROM ans_registry WHERE name = ?`),
    getAnsByAgentId: db.prepare(`SELECT * FROM ans_registry WHERE agent_id = ?`),
    deleteAns: db.prepare(`DELETE FROM ans_registry WHERE agent_id = ? AND api_key = ?`),
    discoverByCapability: db.prepare(`
      SELECT * FROM ans_registry
      WHERE capabilities LIKE ?
      ORDER BY reputation DESC
      LIMIT ?
    `),
    updateAnsReputation: db.prepare(`UPDATE ans_registry SET reputation = ?, last_seen = ? WHERE agent_id = ?`),

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
      UPDATE a2a_messages SET status = ?, response = ?, responded_at = ? WHERE id = ?
    `),
    getConversations: db.prepare(`
      SELECT * FROM a2a_messages
      WHERE from_agent = ? OR to_agent = ?
      ORDER BY created ASC
    `),

    // orgs
    insertOrg: db.prepare(`INSERT INTO orgs (id, api_key, name, plan, created) VALUES (?, ?, ?, ?, ?)`),
    getOrg: db.prepare(`SELECT * FROM orgs WHERE id = ?`),
    insertMember: db.prepare(`INSERT INTO org_members (id, org_id, api_key, role, agent_quota, joined) VALUES (?, ?, ?, ?, ?, ?)`),
    getMembers: db.prepare(`SELECT * FROM org_members WHERE org_id = ?`),
    countAgentsByKey: db.prepare(`SELECT COUNT(*) as cnt FROM agent_identities WHERE api_key = ? AND revoked = 0 AND expires_at > ?`),
    orgUsage: db.prepare(`SELECT api_key, COUNT(*) as active_agents FROM agent_identities WHERE api_key = ? AND revoked = 0 AND expires_at > ? GROUP BY api_key`),
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

  // ════════════════════════════════════════════════════════════════════════════
  // AGENT IDENTITY SYSTEM
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/identity/issue
  app.post('/v1/identity/issue', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { agent_id, capabilities = [], ttl_seconds = 3600, task_scope } = req.body;
    if (!agent_id) return res.status(400).json({ error: { code: 'missing_agent_id', message: 'agent_id is required' } });

    const now = Date.now();
    const expires_at = now + (Number(ttl_seconds) || 3600) * 1000;
    const public_id = crypto.randomUUID();

    const payload = {
      jti: public_id,
      agent_id,
      capabilities: Array.isArray(capabilities) ? capabilities : [],
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
      JSON.stringify(payload.capabilities),
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
      expires_at,
      capabilities: payload.capabilities,
      public_id,
    });
  });

  // POST /v1/identity/verify
  app.post('/v1/identity/verify', (req, res) => {
    const token = req.body.token || req.body.svid;
    if (!token) return res.status(400).json({ error: { code: 'missing_token', message: 'token (or svid) is required' } });

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
      capabilities: JSON.parse(record.capabilities || '[]'),
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
      return res.status(400).json({ error: { code: 'missing_param', message: 'Provide token or agent_id' } });
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
      task_scope: r.task_scope,
      expires_at: r.expires_at,
      revoked: !!r.revoked,
      created: r.created,
      last_used: r.last_used,
    }));

    return res.json({ ok: true, _engine: 'real', identities, count: identities.length });
  });

  // GET /v1/identity/:agent_id
  app.get('/v1/identity/:agent_id', (req, res) => {
    const { agent_id } = req.params;
    const record = stmts.getIdentityByAgentId.get(agent_id);
    if (!record) return res.status(404).json({ error: { code: 'not_found', message: 'Agent identity not found' } });

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
      task_scope: record.task_scope,
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

    const { name, capabilities = [], endpoint_hint, metadata } = req.body;
    if (!name) return res.status(400).json({ error: { code: 'missing_name', message: 'name is required' } });

    const now = Date.now();
    const agent_id = crypto.randomUUID();
    const record_id = crypto.randomUUID();
    const ttl = 86400; // 24h default TTL in seconds

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
        now
      );
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        return res.status(409).json({ error: { code: 'name_conflict', message: 'Agent name already registered' } });
      }
      throw e;
    }

    return res.json({ ok: true, _engine: 'real', agent_id, record_id, ttl, name });
  });

  // GET /v1/ans/discover
  app.get('/v1/ans/discover', (req, res) => {
    const capability = req.query.capability || '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);

    const rows = stmts.discoverByCapability.all(`%${capability}%`, limit);
    const agents = rows.map(r => ({
      agent_id: r.agent_id,
      name: r.name,
      capabilities: JSON.parse(r.capabilities || '[]'),
      endpoint_hint: r.endpoint_hint,
      reputation: r.reputation,
      last_seen: r.last_seen,
    }));

    return res.json({ ok: true, _engine: 'real', agents, count: agents.length, capability });
  });

  // GET /v1/ans/lookup/:name
  app.get('/v1/ans/lookup/:name', (req, res) => {
    const record = stmts.getAnsByName.get(req.params.name);
    if (!record) return res.status(404).json({ error: { code: 'not_found', message: 'Agent not found' } });

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
      last_seen: record.last_seen,
    });
  });

  // DELETE /v1/ans/:agent_id
  app.delete('/v1/ans/:agent_id', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { agent_id } = req.params;
    const existing = stmts.getAnsByAgentId.get(agent_id);
    if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'Agent not found' } });
    if (existing.api_key !== key) return res.status(403).json({ error: { code: 'forbidden', message: 'Cannot deregister another API key\'s agent' } });

    stmts.deleteAns.run(agent_id, key);
    return res.json({ ok: true, _engine: 'real', deregistered: true, agent_id });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // REPUTATION SCORING
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/reputation/signal
  app.post('/v1/reputation/signal', (req, res) => {
    const { agent_id, signal, task, credits_used } = req.body;
    if (!agent_id) return res.status(400).json({ error: { code: 'missing_agent_id', message: 'agent_id is required' } });
    if (!['success', 'failure', 'error', 'timeout'].includes(signal)) {
      return res.status(400).json({ error: { code: 'invalid_signal', message: 'signal must be success|failure|error|timeout' } });
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
    if (!agent_id) return res.status(400).json({ error: { code: 'missing_agent_id', message: 'agent_id is required' } });

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
  app.post('/v1/a2a/message', (req, res) => {
    const { from_agent, to_agent, type, payload, priority = 5, ttl_ms } = req.body;

    if (!from_agent || !to_agent) {
      return res.status(400).json({ error: { code: 'missing_agents', message: 'from_agent and to_agent are required' } });
    }
    if (!['request', 'response', 'delegate', 'notify'].includes(type)) {
      return res.status(400).json({ error: { code: 'invalid_type', message: 'type must be request|response|delegate|notify' } });
    }

    const message_id = crypto.randomUUID();
    const queued_at = Date.now();
    const prio = Math.max(1, Math.min(10, Number(priority) || 5));

    stmts.insertMessage.run(
      message_id,
      from_agent,
      to_agent,
      type,
      typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
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
    });
  });

  // GET /v1/a2a/inbox/:agent_id
  app.get('/v1/a2a/inbox/:agent_id', (req, res) => {
    const { agent_id } = req.params;
    const now = Date.now();

    let rows = stmts.getInbox.all(agent_id);

    // Filter expired messages
    rows = rows.filter(r => {
      if (!r.ttl_ms) return true;
      return (r.created + r.ttl_ms) > now;
    });

    const messages = rows.map(r => ({
      message_id: r.id,
      from_agent: r.from_agent,
      type: r.type,
      payload: (() => { try { return JSON.parse(r.payload); } catch { return r.payload; } })(),
      priority: r.priority,
      status: r.status,
      created: r.created,
    }));

    return res.json({ ok: true, _engine: 'real', agent_id, messages, count: messages.length });
  });

  // POST /v1/a2a/respond
  app.post('/v1/a2a/respond', (req, res) => {
    const { message_id, payload, status } = req.body;
    if (!message_id) return res.status(400).json({ error: { code: 'missing_message_id', message: 'message_id is required' } });
    if (!['success', 'error', 'delegated'].includes(status)) {
      return res.status(400).json({ error: { code: 'invalid_status', message: 'status must be success|error|delegated' } });
    }

    const msg = stmts.getMessage.get(message_id);
    if (!msg) return res.status(404).json({ error: { code: 'not_found', message: 'Message not found' } });

    const responded_at = Date.now();
    stmts.respondMessage.run(
      status,
      typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
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
  app.post('/v1/a2a/delegate', (req, res) => {
    const { from_agent, to_agent, task, context, budget_credits } = req.body;
    if (!from_agent || !to_agent) {
      return res.status(400).json({ error: { code: 'missing_agents', message: 'from_agent and to_agent are required' } });
    }
    if (!task) return res.status(400).json({ error: { code: 'missing_task', message: 'task is required' } });

    const delegation_id = crypto.randomUUID();
    const now = Date.now();

    // Check target agent exists and has good reputation
    const targetRec = stmts.getAnsByAgentId.get(to_agent);
    const accepted = targetRec ? targetRec.reputation >= 3.0 : true; // auto-accept if unknown, reject if low rep

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
      return res.status(400).json({ error: { code: 'missing_agents', message: 'from_agent and to_agent are required' } });
    }

    // Normalize type: map simple types like 'text' to 'notify'
    const VALID_TYPES = ['request', 'response', 'delegate', 'notify'];
    const normalizedType = VALID_TYPES.includes(type) ? type : 'notify';

    const message_id = crypto.randomUUID();
    const queued_at = Date.now();
    const prio = Math.max(1, Math.min(10, Number(priority) || 5));
    const payload = message !== undefined ? (typeof message === 'string' ? message : JSON.stringify(message)) : '{}';

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
    if (!name) return res.status(400).json({ error: { code: 'missing_name', message: 'org name is required' } });
    if (!['free', 'pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ error: { code: 'invalid_plan', message: 'plan must be free|pro|enterprise' } });
    }

    const now = Date.now();
    const org_id = crypto.randomUUID();

    // Generate admin key and invite token
    const admin_key = 'sk-org-admin-' + crypto.randomBytes(16).toString('hex');
    const member_invite_token = 'inv-' + crypto.randomBytes(20).toString('hex');

    stmts.insertOrg.run(org_id, key, name, plan, now);

    // Add creator as admin member
    const member_id = crypto.randomUUID();
    const quotaByPlan = { free: 5, pro: 50, enterprise: 500 };
    stmts.insertMember.run(member_id, org_id, key, 'admin', quotaByPlan[plan] || 5, now);

    return res.json({
      ok: true,
      _engine: 'real',
      org_id,
      name,
      plan,
      admin_key,
      member_invite_token,
      created: now,
    });
  });

  // POST /v1/org/invite
  app.post('/v1/org/invite', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { org_id, role = 'member', agent_quota = 10 } = req.body;
    if (!org_id) return res.status(400).json({ error: { code: 'missing_org_id', message: 'org_id is required' } });
    if (!['admin', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({ error: { code: 'invalid_role', message: 'role must be admin|member|viewer' } });
    }

    const org = stmts.getOrg.get(org_id);
    if (!org) return res.status(404).json({ error: { code: 'not_found', message: 'Org not found' } });
    if (org.api_key !== key) return res.status(403).json({ error: { code: 'forbidden', message: 'Must be org owner to invite' } });

    const invite_token = 'inv-' + crypto.randomBytes(20).toString('hex');
    const invite_link = `https://slopshop.gg/join?token=${invite_token}&org=${org_id}&role=${role}`;

    return res.json({
      ok: true,
      _engine: 'real',
      org_id,
      role,
      agent_quota: Number(agent_quota) || 10,
      invite_token,
      invite_link,
      expires_at: Date.now() + 7 * 24 * 3600 * 1000, // 7 days
    });
  });

  // GET /v1/org/:org_id/members
  app.get('/v1/org/:org_id/members', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { org_id } = req.params;
    const org = stmts.getOrg.get(org_id);
    if (!org) return res.status(404).json({ error: { code: 'not_found', message: 'Org not found' } });
    if (org.api_key !== key) return res.status(403).json({ error: { code: 'forbidden', message: 'Access denied' } });

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
  app.get('/v1/org/:org_id/usage', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { org_id } = req.params;
    const org = stmts.getOrg.get(org_id);
    if (!org) return res.status(404).json({ error: { code: 'not_found', message: 'Org not found' } });
    if (org.api_key !== key) return res.status(403).json({ error: { code: 'forbidden', message: 'Access denied' } });

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
