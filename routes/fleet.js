'use strict';

/**
 * Fleet Management — Multi-Agent Orchestration
 * routes/fleet.js
 *
 * Wiring:
 *   - task-result endpoint auto-writes completed task output to persistent memory
 *     under namespace 'fleet:<api_key_hash[:8]>', key 'task:<task_id>'
 *   - Emits fleet:result on the internal event bus for cross-feature subscribers
 *
 * Register, monitor, dispatch, and recall agents in a fleet.
 * All fleet data is scoped to the API key.
 *
 * Endpoints:
 *   POST   /v1/fleet/register    — register an agent
 *   POST   /v1/fleet/heartbeat   — agent check-in
 *   GET    /v1/fleet/status      — list all agents with summary
 *   POST   /v1/fleet/dispatch    — assign a task to one or all agents
 *   POST   /v1/fleet/recall      — stop an agent's current task
 *   DELETE /v1/fleet/deregister  — remove an agent
 */

const crypto = require('crypto');
let slopBus;
try { slopBus = require('../lib/events'); } catch (_) { slopBus = { emit: () => {} }; }

function requireAuth(req, res, apiKeys) {
  const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!key || !apiKeys.get(key)) {
    res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
    return null;
  }
  return key;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function ok(res, data)  { res.json({ ok: true, ...data }); }
function err(res, status, code, message) {
  res.status(status).json({ ok: false, error: { code, message } });
}

// Agents idle > 5 minutes are marked stale
const STALE_MS = 5 * 60 * 1000;

module.exports = function (app, db, apiKeys) {

  // ── Schema bootstrap ──────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS fleet_agents (
      id              TEXT PRIMARY KEY,
      api_key_hash    TEXT NOT NULL,
      name            TEXT NOT NULL,
      identity_id     TEXT,
      status          TEXT NOT NULL DEFAULT 'idle',
      last_heartbeat  INTEGER,
      current_task    TEXT,
      task_id         TEXT,
      metadata        TEXT,
      created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fleet_api_key_hash ON fleet_agents(api_key_hash);

    CREATE TABLE IF NOT EXISTS fleet_dispatch_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_hash    TEXT NOT NULL,
      task_id         TEXT NOT NULL,
      agent_id        TEXT,
      task            TEXT NOT NULL,
      dispatched_at   INTEGER NOT NULL,
      recalled_at     INTEGER,
      result_status   TEXT,
      result          TEXT,
      result_at       INTEGER,
      error_message   TEXT
    );
  `);

  // ── POST /v1/fleet/register ───────────────────────────────────────────────

  app.post('/v1/fleet/register', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { name, identity_id, metadata } = req.body;
    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 128) {
      return err(res, 422, 'invalid_name', 'name must be 1–128 characters');
    }

    const api_key_hash = hashKey(apiKey);
    const agent_id = 'agt_' + crypto.randomUUID().replace(/-/g, '');
    const now = Date.now();

    db.prepare(`
      INSERT INTO fleet_agents (id, api_key_hash, name, identity_id, status, last_heartbeat, metadata, created_at)
      VALUES (?, ?, ?, ?, 'idle', ?, ?, ?)
    `).run(agent_id, api_key_hash, name, identity_id || null, now, metadata ? JSON.stringify(metadata) : null, now);

    const fleet_position = db.prepare('SELECT COUNT(*) as cnt FROM fleet_agents WHERE api_key_hash = ?').get(api_key_hash).cnt;

    ok(res, {
      agent_id,
      name,
      status: 'idle',
      fleet_position,
      created_at: new Date(now).toISOString(),
    });
  });

  // ── POST /v1/fleet/heartbeat ──────────────────────────────────────────────

  app.post('/v1/fleet/heartbeat', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { agent_id, status = 'idle', task } = req.body;
    if (!agent_id) return err(res, 422, 'missing_field', 'agent_id is required');

    const VALID_STATUSES = ['idle', 'active', 'error', 'paused'];
    if (!VALID_STATUSES.includes(status)) {
      return err(res, 422, 'invalid_status', `status must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const api_key_hash = hashKey(apiKey);
    const agent = db.prepare('SELECT * FROM fleet_agents WHERE id = ? AND api_key_hash = ?').get(agent_id, api_key_hash);
    if (!agent) return err(res, 404, 'agent_not_found', 'Agent not found');

    const now = Date.now();
    db.prepare(`
      UPDATE fleet_agents SET status = ?, last_heartbeat = ?, current_task = ? WHERE id = ?
    `).run(status, now, task || null, agent_id);

    // Check for pending instructions (dispatched tasks)
    const pending = db.prepare(`
      SELECT task_id, task FROM fleet_dispatch_log
      WHERE agent_id = ? AND recalled_at IS NULL
      ORDER BY dispatched_at DESC LIMIT 1
    `).get(agent_id);

    ok(res, {
      agent_id,
      status,
      last_heartbeat: new Date(now).toISOString(),
      instructions: pending ? { task_id: pending.task_id, task: pending.task } : null,
    });
  });

  // ── GET /v1/fleet/status ──────────────────────────────────────────────────

  app.get('/v1/fleet/status', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const api_key_hash = hashKey(apiKey);
    const now = Date.now();
    const agents = db.prepare(`
      SELECT id, name, identity_id, status, last_heartbeat, current_task, task_id, metadata, created_at
      FROM fleet_agents WHERE api_key_hash = ?
      ORDER BY created_at ASC
    `).all(api_key_hash);

    const summary = { idle: 0, active: 0, error: 0, paused: 0, stale: 0, total: agents.length };
    const list = agents.map(a => {
      const stale = a.last_heartbeat && (now - a.last_heartbeat) > STALE_MS;
      const effective_status = stale ? 'stale' : a.status;
      summary[effective_status] = (summary[effective_status] || 0) + 1;
      return {
        agent_id: a.id,
        name: a.name,
        identity_id: a.identity_id || null,
        status: effective_status,
        last_heartbeat: a.last_heartbeat ? new Date(a.last_heartbeat).toISOString() : null,
        current_task: a.current_task || null,
        metadata: a.metadata ? JSON.parse(a.metadata) : null,
        created_at: new Date(a.created_at).toISOString(),
      };
    });

    ok(res, { agents: list, summary });
  });

  // ── POST /v1/fleet/dispatch ───────────────────────────────────────────────

  app.post('/v1/fleet/dispatch', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { task, agent_id, broadcast = false } = req.body;
    if (!task || typeof task !== 'string') {
      return err(res, 422, 'missing_field', 'task is required');
    }
    if (!agent_id && !broadcast) {
      return err(res, 422, 'missing_target', 'Provide agent_id or set broadcast: true');
    }

    const api_key_hash = hashKey(apiKey);
    const task_id = 'tsk_' + crypto.randomUUID().replace(/-/g, '');
    const now = Date.now();

    let targetAgents = [];
    if (broadcast) {
      targetAgents = db.prepare('SELECT id FROM fleet_agents WHERE api_key_hash = ?').all(api_key_hash).map(a => a.id);
    } else {
      const agent = db.prepare('SELECT id FROM fleet_agents WHERE id = ? AND api_key_hash = ?').get(agent_id, api_key_hash);
      if (!agent) return err(res, 404, 'agent_not_found', 'Agent not found');
      targetAgents = [agent_id];
    }

    if (targetAgents.length === 0) {
      return err(res, 404, 'no_agents', 'No agents registered in fleet');
    }

    const insertDispatch = db.prepare(`
      INSERT INTO fleet_dispatch_log (api_key_hash, task_id, agent_id, task, dispatched_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateStatus = db.prepare(`
      UPDATE fleet_agents SET status = 'active', current_task = ?, task_id = ? WHERE id = ?
    `);

    const dispatchMany = db.transaction((agents) => {
      for (const aid of agents) {
        insertDispatch.run(api_key_hash, task_id, aid, task, now);
        updateStatus.run(task, task_id, aid);
      }
    });
    dispatchMany(targetAgents);

    ok(res, {
      task_id,
      task,
      dispatched_to: targetAgents,
      broadcast,
      dispatched_at: new Date(now).toISOString(),
    });
  });

  // ── POST /v1/fleet/recall ─────────────────────────────────────────────────

  app.post('/v1/fleet/recall', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { agent_id } = req.body;
    if (!agent_id) return err(res, 422, 'missing_field', 'agent_id is required');

    const api_key_hash = hashKey(apiKey);
    const agent = db.prepare('SELECT id, status, task_id FROM fleet_agents WHERE id = ? AND api_key_hash = ?').get(agent_id, api_key_hash);
    if (!agent) return err(res, 404, 'agent_not_found', 'Agent not found');

    const now = Date.now();
    db.prepare('UPDATE fleet_agents SET status = \'idle\', current_task = NULL, task_id = NULL WHERE id = ?').run(agent_id);
    if (agent.task_id) {
      db.prepare('UPDATE fleet_dispatch_log SET recalled_at = ? WHERE agent_id = ? AND task_id = ?')
        .run(now, agent_id, agent.task_id);
    }

    ok(res, { recalled: true, agent_id, previous_status: agent.status });
  });

  // ── POST /v1/fleet/task-result ────────────────────────────────────────────
  //    Agent reports completion or failure of a dispatched task.

  app.post('/v1/fleet/task-result', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { agent_id, task_id, result_status = 'completed', result, error_message } = req.body;
    if (!agent_id) return err(res, 422, 'missing_field', 'agent_id is required');
    if (!task_id)  return err(res, 422, 'missing_field', 'task_id is required');

    const VALID_RESULT_STATUSES = ['completed', 'failed', 'partial'];
    if (!VALID_RESULT_STATUSES.includes(result_status)) {
      return err(res, 422, 'invalid_result_status', `result_status must be one of: ${VALID_RESULT_STATUSES.join(', ')}`);
    }

    const api_key_hash = hashKey(apiKey);
    const agent = db.prepare('SELECT id, task_id FROM fleet_agents WHERE id = ? AND api_key_hash = ?').get(agent_id, api_key_hash);
    if (!agent) return err(res, 404, 'agent_not_found', 'Agent not found');

    const log = db.prepare('SELECT id FROM fleet_dispatch_log WHERE agent_id = ? AND task_id = ? AND api_key_hash = ?')
      .get(agent_id, task_id, api_key_hash);
    if (!log) return err(res, 404, 'task_not_found', 'Dispatch log entry not found');

    const now = Date.now();
    const resultStr = result !== undefined ? (typeof result === 'string' ? result : JSON.stringify(result)) : null;

    db.prepare(`
      UPDATE fleet_dispatch_log
      SET result_status = ?, result = ?, result_at = ?, error_message = ?
      WHERE agent_id = ? AND task_id = ? AND api_key_hash = ?
    `).run(result_status, resultStr, now, error_message || null, agent_id, task_id, api_key_hash);

    // Mark agent idle again after task completion
    db.prepare(`UPDATE fleet_agents SET status = 'idle', current_task = NULL, task_id = NULL WHERE id = ?`).run(agent_id);

    // Auto-wire: persist completed task result to memory so it's queryable across features
    if (result_status === 'completed' && resultStr) {
      try {
        const memNs = 'fleet:' + api_key_hash.slice(0, 8);
        db.prepare('INSERT OR REPLACE INTO memory (namespace, key, value, tags, created, updated) VALUES (?, ?, ?, ?, ?, ?)')
          .run(memNs, 'task:' + task_id, resultStr.slice(0, 8192), 'fleet,task-result,agent:' + agent_id, now, now);
      } catch (_) { /* memory table may not exist in test environments */ }
    }

    // Emit on bus so workflow/chain subscribers can react to fleet completions
    slopBus.emit('fleet:result', { agentId: agent_id, taskId: task_id, resultStatus: result_status, apiKeyHash: api_key_hash });

    ok(res, {
      recorded: true,
      agent_id,
      task_id,
      result_status,
      result_at: new Date(now).toISOString(),
    });
  });

  // ── DELETE /v1/fleet/deregister ───────────────────────────────────────────

  app.delete('/v1/fleet/deregister', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { agent_id } = req.body;
    if (!agent_id) return err(res, 422, 'missing_field', 'agent_id is required');

    const api_key_hash = hashKey(apiKey);
    const agent = db.prepare('SELECT id FROM fleet_agents WHERE id = ? AND api_key_hash = ?').get(agent_id, api_key_hash);
    if (!agent) return err(res, 404, 'agent_not_found', 'Agent not found');

    db.prepare('DELETE FROM fleet_agents WHERE id = ?').run(agent_id);
    db.prepare('DELETE FROM fleet_dispatch_log WHERE agent_id = ? AND api_key_hash = ?').run(agent_id, api_key_hash);

    ok(res, { deregistered: true, agent_id });
  });
};
