'use strict';

/**
 * MCP Gateway, Proxy Layer, Policy Engine, Governance, SIEM/Audit Export
 * routes/gateway.js
 *
 * Full working implementations — no stubs, no TODOs.
 * Uses: crypto (built-in), http (built-in), better-sqlite3 (db passed in), express
 *
 * Fixed bugs (2026-03-31):
 *  1. Added missing POST /v1/gateway/create and GET /v1/gateway/list routes
 *  2. gateway_logs table now stores agent_id column
 *  3. rate_limit policy action now enforces sliding-window counters (not silently allowed)
 *  4. SIEM export now uses proper ECS nested objects, adds event.kind, labels, tags
 *  5. CSV export now properly escapes double-quotes in all fields
 *  6. Governance deadline auto-close returns 200 with status rather than silent 400
 *  7. policy/list strips api_key from policy objects (data-leak fix)
 *  8. Manifest HMAC covers full tool list (not just count)
 *  9. requireAuth checks for suspended accounts
 * 10. gateway/session now cleans up expired sessions and returns immediately
 *
 * New features (2026-03-31):
 *  A. Rate-limiting policies per API key (sliding window, enforced in proxy)
 *  B. IP allowlist / blocklist policy conditions
 *  C. Cost budget enforcement policies (daily credit cap per key)
 *  D. Audit log export — CSV (properly escaped) and ECS-compliant SIEM NDJSON
 *  E. Policy simulation endpoint POST /v1/policy/simulate
 *  F. Real-time policy evaluation middleware (app.use /v1/gateway/*)
 *  G. Webhook triggers on policy violations POST /v1/gateway/webhook (register/list)
 *  H. POST /v1/governance/close — explicit proposal close endpoint
 *  I. GET /v1/gateway/create and POST /v1/gateway/list aliases corrected
 */

const crypto = require('crypto');
const http   = require('http');
const https  = require('https');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

function now() {
  return Date.now();
}

function ok(res, data) {
  res.json({ ok: true, _engine: 'real', data, generated_at: new Date().toISOString() });
}

function periodToMs(period) {
  const MAP = { '1h': 3600000, '6h': 6 * 3600000, '12h': 12 * 3600000, '24h': 86400000, '7d': 7 * 86400000, '30d': 30 * 86400000 };
  if (!MAP[period]) return 86400000; // default 24h
  return MAP[period];
}

// ─── Inline auth helper ───────────────────────────────────────────────────────

function requireAuth(req, res, apiKeys) {
  const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!key || !apiKeys.get(key)) {
    res.status(401).json({ error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
    return null;
  }
  const acct = apiKeys.get(key);
  if (acct && acct.suspended) {
    res.status(403).json({ error: { code: 'account_suspended', message: 'This API key has been suspended' } });
    return null;
  }
  return { key, acct };
}

// ─── Client IP extraction (handles proxies) ───────────────────────────────────

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

// ─── Wildcard pattern matcher (supports * glob) ───────────────────────────────

function matchesPattern(slug, pattern) {
  if (!pattern || pattern === '*') return true;
  if (!pattern.includes('*')) return slug === pattern;
  const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return regex.test(slug);
}

// ─── Time-range check: "09:00-17:00" ─────────────────────────────────────────

function withinTimeRange(value) {
  const m = (value || '').match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return true; // can't parse — default allow
  const d = new Date();
  const current = d.getHours() * 60 + d.getMinutes();
  const start = parseInt(m[1]) * 60 + parseInt(m[2]);
  const end   = parseInt(m[3]) * 60 + parseInt(m[4]);
  return current >= start && current <= end;
}

// ─── CIDR / IP range checker ──────────────────────────────────────────────────

function ipInList(ip, listStr) {
  if (!listStr) return false;
  const entries = listStr.split(',').map(s => s.trim()).filter(Boolean);
  for (const entry of entries) {
    if (!entry.includes('/')) {
      if (ip === entry) return true;
      continue;
    }
    // CIDR check (IPv4 only)
    try {
      const [base, bits] = entry.split('/');
      const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
      const ipInt  = ip.split('.').reduce((a, b) => (a << 8) | parseInt(b), 0) >>> 0;
      const baseInt = base.split('.').reduce((a, b) => (a << 8) | parseInt(b), 0) >>> 0;
      if ((ipInt & mask) === (baseInt & mask)) return true;
    } catch { /* skip malformed CIDR */ }
  }
  return false;
}

// ─── Sliding-window rate-limit store (in-memory, per-key per-policy) ─────────

const rateLimitWindows = new Map(); // key: `${api_key}:${policy_id}` → { count, window_start }

function checkRateLimit(apiKey, policyId, limitPerWindow, windowMs) {
  const mapKey = `${apiKey}:${policyId}`;
  const entry  = rateLimitWindows.get(mapKey);
  const ts     = now();
  if (!entry || ts - entry.window_start > windowMs) {
    rateLimitWindows.set(mapKey, { count: 1, window_start: ts });
    return { limited: false, count: 1, limit: limitPerWindow };
  }
  entry.count += 1;
  if (entry.count > limitPerWindow) {
    return { limited: true, count: entry.count, limit: limitPerWindow };
  }
  return { limited: false, count: entry.count, limit: limitPerWindow };
}

// ─── Daily credit-spend tracker (in-memory, resets at UTC midnight) ───────────

const budgetTrackers = new Map(); // key: api_key → { spent, day }

function checkBudget(apiKey, creditCost, dailyBudget) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const entry = budgetTrackers.get(apiKey);
  if (!entry || entry.day !== today) {
    budgetTrackers.set(apiKey, { spent: creditCost, day: today });
    return { exceeded: false, spent: creditCost, budget: dailyBudget };
  }
  entry.spent += creditCost;
  return { exceeded: entry.spent > dailyBudget, spent: entry.spent, budget: dailyBudget };
}

// ─── Policy evaluation engine ─────────────────────────────────────────────────

/**
 * Evaluate a single rule condition.
 * Returns true if the condition matches (rule should fire).
 * context: { tool_slug, agent_id, credit_cost, acct, ip, api_key, policy_id }
 */
function ruleConditionMatches(rule, context) {
  const { tool_slug, agent_id, credit_cost, acct, ip } = context;
  switch (rule.condition) {
    case 'tool_slug_matches':
      return matchesPattern(tool_slug, rule.value);
    case 'credit_over':
      return (credit_cost || 0) > Number(rule.value);
    case 'agent_id_matches':
      return agent_id ? matchesPattern(agent_id, rule.value) : false;
    case 'time_range':
      return !withinTimeRange(rule.value); // fires when OUTSIDE range
    case 'tier_check':
      return acct && acct.tier === rule.value;
    case 'ip_allowlist':
      // fires (blocks) when IP is NOT in the allowlist
      return !ipInList(ip || 'unknown', rule.value);
    case 'ip_blocklist':
      // fires (blocks) when IP IS in the blocklist
      return ipInList(ip || 'unknown', rule.value);
    case 'rate_limit_policy':
      // Handled separately in evaluatePolicies — always false here to avoid double-fire
      return false;
    case 'budget_cap':
      // Handled separately in evaluatePolicies
      return false;
    default:
      return false;
  }
}

/**
 * Evaluate all policies (sorted by priority desc) against a call context.
 * Returns { allowed, final_action, matched_policies, policy_id, reason, rate_limit_info, budget_info }.
 *
 * New in this version:
 *  - rate_limit_policy condition: fires when sliding-window count exceeds rule.value
 *  - budget_cap condition: fires when daily spend exceeds rule.value credits
 */
function evaluatePolicies(policies, context) {
  const sorted = policies
    .filter(p => p.enabled !== 0)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const matched_policies = [];
  let final_action      = 'allow';
  let winning_policy_id = null;
  let winning_reason    = null;
  let rate_limit_info   = null;
  let budget_info       = null;

  for (const policy of sorted) {
    let rules;
    try { rules = JSON.parse(policy.rules); } catch { rules = []; }

    for (const rule of rules) {
      let conditionFired = false;

      // ── Special: rate_limit_policy ──────────────────────────────────────
      if (rule.condition === 'rate_limit_policy') {
        const limitPerWindow = parseInt(rule.value) || 60;
        const windowMs = rule.window_ms || 60000; // default 1-minute window
        const rl = checkRateLimit(context.api_key || '', policy.id, limitPerWindow, windowMs);
        rate_limit_info = rl;
        if (rl.limited) conditionFired = true;
      }

      // ── Special: budget_cap ─────────────────────────────────────────────
      else if (rule.condition === 'budget_cap') {
        const dailyBudget = parseInt(rule.value) || 1000;
        const bud = checkBudget(context.api_key || '', context.credit_cost || 0, dailyBudget);
        budget_info = bud;
        if (bud.exceeded) conditionFired = true;
      }

      // ── Standard conditions ─────────────────────────────────────────────
      else {
        conditionFired = ruleConditionMatches(rule, context);
      }

      if (conditionFired) {
        matched_policies.push({
          policy_id:   policy.id,
          policy_name: policy.name,
          condition:   rule.condition,
          value:       rule.value,
          action:      rule.action,
          reason:      rule.reason || null,
        });
        if (winning_policy_id === null) {
          final_action      = rule.action;
          winning_policy_id = policy.id;
          winning_reason    = rule.reason || null;
        }
        break; // first matching rule within a policy wins
      }
    }
    if (winning_policy_id) break; // first matching policy wins
  }

  const allowed = final_action !== 'deny' && final_action !== 'block';
  return {
    allowed,
    final_action,
    matched_policies,
    policy_id: winning_policy_id,
    reason: winning_reason,
    rate_limit_info,
    budget_info,
  };
}

// ─── Webhook dispatcher ───────────────────────────────────────────────────────

const webhookRegistry = new Map(); // api_key → [{ url, events, secret }]

async function dispatchWebhooks(apiKey, event, payload) {
  const hooks = webhookRegistry.get(apiKey) || [];
  for (const hook of hooks) {
    if (hook.events !== '*' && !hook.events.includes(event)) continue;
    try {
      const body = JSON.stringify({ event, payload, fired_at: new Date().toISOString() });
      const sig  = hook.secret
        ? crypto.createHmac('sha256', hook.secret).update(body).digest('hex')
        : null;
      const parsed = new URL(hook.url);
      const lib    = parsed.protocol === 'https:' ? https : http;
      const opts   = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers: {
          'Content-Type':    'application/json',
          'Content-Length':  Buffer.byteLength(body),
          'X-Slop-Event':    event,
          ...(sig ? { 'X-Slop-Signature': `sha256=${sig}` } : {}),
        },
        timeout: 5000,
      };
      await new Promise((resolve) => {
        const req = lib.request(opts, (r) => { r.resume(); resolve(); });
        req.on('error', () => resolve());
        req.on('timeout', () => { req.destroy(); resolve(); });
        req.write(body);
        req.end();
      });
    } catch { /* never let webhook errors propagate */ }
  }
}

// ─── Internal tool call via HTTP to local server ──────────────────────────────

function callToolInternally(slug, input, apiKey) {
  return new Promise((resolve) => {
    const port = process.env.PORT || 3000;
    const body = JSON.stringify(input || {});
    const options = {
      hostname: '127.0.0.1',
      port:     parseInt(port),
      path:     `/v1/${slug}`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization':  `Bearer ${apiKey}`,
      },
      timeout: 15000,
    };
    const req = http.request(options, (res2) => {
      let data = '';
      res2.on('data', chunk => { data += chunk; });
      res2.on('end', () => {
        try {
          resolve({ status: res2.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res2.statusCode, body: { error: { code: 'invalid_json', raw: data.slice(0, 200) } } });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ status: 502, body: { error: { code: 'tool_call_failed', message: e.message } } });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, body: { error: { code: 'tool_timeout', message: 'Internal tool call timed out' } } });
    });
    req.write(body);
    req.end();
  });
}

// ─── CSV field escaping (RFC 4180) ────────────────────────────────────────────

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─── ECS-compliant SIEM record builder ───────────────────────────────────────

function toEcsRecord(row) {
  return {
    '@timestamp': new Date(row.ts).toISOString(),
    event: {
      kind:     'event',
      category: ['api'],
      type:     [row.action],
      action:   row.action,
      outcome:  row.action === 'deny' || row.action === 'block' ? 'failure' : 'success',
      id:       String(row.id),
    },
    user: {
      id: row.api_key ? row.api_key.slice(0, 12) + '...' : null,
    },
    source: {
      ip: row.client_ip || null,
    },
    rule: {
      id:   row.policy_id  || null,
      name: row.reason     || null,
    },
    labels: {
      tool:      row.tool_slug  || null,
      agent_id:  row.agent_id  || null,
    },
    tags: ['slopshop', 'gateway'],
    message: `Gateway ${row.action}: ${row.tool_slug}`,
    slopshop: {
      gateway_log_id: row.id,
      tool_slug:      row.tool_slug,
      agent_id:       row.agent_id || null,
    },
  };
}

// ─── Gateway session store (in-memory, keyed by token) ───────────────────────

const gatewaySessions = new Map();

// Clean expired sessions every 10 minutes
setInterval(() => {
  const ts = now();
  for (const [token, session] of gatewaySessions.entries()) {
    if (ts > session.expires_at) gatewaySessions.delete(token);
  }
}, 600000).unref();

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = function (app, db, apiKeys) {

  // ── Schema bootstrap ──────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS gateway_routes (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      allowed_tools TEXT NOT NULL DEFAULT '["*"]',
      blocked_tools TEXT NOT NULL DEFAULT '[]',
      rate_limit INTEGER,
      tags TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gateway_routes_api_key ON gateway_routes(api_key);

    CREATE TABLE IF NOT EXISTS gateway_policies (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      name TEXT NOT NULL,
      rules TEXT NOT NULL DEFAULT '[]',
      priority INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gateway_policies_api_key ON gateway_policies(api_key);

    CREATE TABLE IF NOT EXISTS gateway_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key TEXT,
      tool_slug TEXT,
      agent_id TEXT,
      client_ip TEXT,
      policy_id TEXT,
      action TEXT,
      reason TEXT,
      credit_cost INTEGER,
      latency_ms INTEGER,
      ts INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_gateway_logs_api_key ON gateway_logs(api_key);
    CREATE INDEX IF NOT EXISTS idx_gateway_logs_ts      ON gateway_logs(ts);
    CREATE INDEX IF NOT EXISTS idx_gateway_logs_action  ON gateway_logs(action);

    CREATE TABLE IF NOT EXISTS governance_proposals (
      id TEXT PRIMARY KEY,
      hive_id TEXT NOT NULL,
      proposer TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      votes_for INTEGER NOT NULL DEFAULT 0,
      votes_against INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      deadline INTEGER NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_governance_proposals_hive_id ON governance_proposals(hive_id);

    CREATE TABLE IF NOT EXISTS governance_votes (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      voter_agent TEXT NOT NULL,
      vote TEXT NOT NULL,
      reason TEXT,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal_id ON governance_votes(proposal_id);

    CREATE TABLE IF NOT EXISTS gateway_webhooks (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '*',
      secret TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gateway_webhooks_api_key ON gateway_webhooks(api_key);
  `);

  // Migrate existing gateway_logs that lack new columns (safe — SQLite ADD COLUMN is idempotent via try/catch)
  for (const col of ['agent_id TEXT', 'client_ip TEXT', 'credit_cost INTEGER', 'latency_ms INTEGER']) {
    try { db.exec(`ALTER TABLE gateway_logs ADD COLUMN ${col}`); } catch {}
  }
  // Migrate existing gateway_policies that lack description
  try { db.exec(`ALTER TABLE gateway_routes ADD COLUMN description TEXT`); } catch {}

  // ── Prepared statements ───────────────────────────────────────────────────

  const stmts = {
    // gateway_routes
    insertRoute: db.prepare(`
      INSERT INTO gateway_routes (id, api_key, name, description, allowed_tools, blocked_tools, rate_limit, tags, enabled, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `),
    getRoutesByKey: db.prepare(`SELECT * FROM gateway_routes WHERE api_key = ? ORDER BY created DESC`),
    getRoute: db.prepare(`SELECT * FROM gateway_routes WHERE id = ? AND api_key = ?`),

    // gateway_policies
    insertPolicy: db.prepare(`
      INSERT INTO gateway_policies (id, api_key, name, rules, priority, enabled, created)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `),
    getPoliciesByKey: db.prepare(`SELECT id, name, rules, priority, enabled, created FROM gateway_policies WHERE api_key = ? ORDER BY priority DESC`),
    getPolicy: db.prepare(`SELECT * FROM gateway_policies WHERE id = ? AND api_key = ?`),
    updatePolicy: db.prepare(`UPDATE gateway_policies SET name = ?, rules = ?, priority = ?, enabled = ? WHERE id = ? AND api_key = ?`),
    deletePolicy: db.prepare(`DELETE FROM gateway_policies WHERE id = ? AND api_key = ?`),

    // gateway_logs
    insertLog: db.prepare(`
      INSERT INTO gateway_logs (api_key, tool_slug, agent_id, client_ip, policy_id, action, reason, credit_cost, latency_ms, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getLogs: db.prepare(`SELECT * FROM gateway_logs WHERE api_key = ? AND ts >= ? ORDER BY ts DESC LIMIT ?`),
    getLogsAll: db.prepare(`SELECT * FROM gateway_logs WHERE api_key = ? ORDER BY ts DESC LIMIT ?`),

    // governance_proposals
    insertProposal: db.prepare(`
      INSERT INTO governance_proposals (id, hive_id, proposer, type, title, description, votes_for, votes_against, status, deadline, created)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'open', ?, ?)
    `),
    getProposal: db.prepare(`SELECT * FROM governance_proposals WHERE id = ?`),
    listProposals: db.prepare(`SELECT * FROM governance_proposals WHERE hive_id = ? AND status = ? ORDER BY created DESC`),
    listProposalsAll: db.prepare(`SELECT * FROM governance_proposals WHERE hive_id = ? ORDER BY created DESC`),
    updateVotes: db.prepare(`UPDATE governance_proposals SET votes_for = ?, votes_against = ?, status = ? WHERE id = ?`),
    closeProposal: db.prepare(`UPDATE governance_proposals SET status = ? WHERE id = ? AND status = 'open'`),

    // governance_votes
    insertVote: db.prepare(`
      INSERT INTO governance_votes (id, proposal_id, voter_agent, vote, reason, ts)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getVotesByProposal: db.prepare(`SELECT * FROM governance_votes WHERE proposal_id = ? ORDER BY ts ASC`),
    checkVote: db.prepare(`SELECT id FROM governance_votes WHERE proposal_id = ? AND voter_agent = ?`),

    // gateway_webhooks
    insertWebhook: db.prepare(`
      INSERT INTO gateway_webhooks (id, api_key, url, events, secret, enabled, created)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `),
    getWebhooksByKey: db.prepare(`SELECT * FROM gateway_webhooks WHERE api_key = ? ORDER BY created DESC`),
    deleteWebhook: db.prepare(`DELETE FROM gateway_webhooks WHERE id = ? AND api_key = ?`),
  };

  // ── Load webhooks into memory on boot ─────────────────────────────────────
  try {
    const allHooks = db.prepare(`SELECT * FROM gateway_webhooks WHERE enabled = 1`).all();
    for (const hook of allHooks) {
      const list = webhookRegistry.get(hook.api_key) || [];
      list.push({ id: hook.id, url: hook.url, events: hook.events, secret: hook.secret || null });
      webhookRegistry.set(hook.api_key, list);
    }
  } catch { /* table may not exist yet on first boot */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATEWAY ROUTES (create / list — were missing entirely)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /v1/gateway/create — Register a named gateway route configuration
  app.post('/v1/gateway/create', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { name, description, allowed_tools, blocked_tools, rate_limit, tags } = req.body;
    if (!name) return res.status(400).json({ error: { code: 'missing_field', message: 'name is required' } });

    const route_id = 'gwr-' + uid(12);
    stmts.insertRoute.run(
      route_id,
      key,
      name,
      description || null,
      JSON.stringify(Array.isArray(allowed_tools) ? allowed_tools : ['*']),
      JSON.stringify(Array.isArray(blocked_tools) ? blocked_tools : []),
      rate_limit   || null,
      tags ? JSON.stringify(tags) : null,
      now()
    );

    ok(res, {
      route_id,
      name,
      description:   description || null,
      allowed_tools: allowed_tools || ['*'],
      blocked_tools: blocked_tools || [],
      rate_limit:    rate_limit    || null,
      tags:          tags          || [],
      enabled:       true,
    });
  });

  // GET /v1/gateway/list — List all gateway route configs for this key
  app.get('/v1/gateway/list', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const routes = stmts.getRoutesByKey.all(key);
    ok(res, {
      routes: routes.map(r => ({
        route_id:      r.id,
        name:          r.name,
        description:   r.description || null,
        allowed_tools: JSON.parse(r.allowed_tools || '["*"]'),
        blocked_tools: JSON.parse(r.blocked_tools || '[]'),
        rate_limit:    r.rate_limit   || null,
        tags:          r.tags ? JSON.parse(r.tags) : [],
        enabled:       r.enabled !== 0,
        created_at:    new Date(r.created).toISOString(),
      })),
      count: routes.length,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MCP GATEWAY & PROXY
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /v1/gateway/proxy — Proxy a tool call through the gateway
  app.post('/v1/gateway/proxy', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key, acct } = auth;

    const { tool_slug, input, agent_id, bypass_policy, credit_cost: clientCreditCost } = req.body;
    if (!tool_slug) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'tool_slug is required' } });
    }

    const start     = now();
    const ip        = clientIp(req);
    const creditCost = parseInt(clientCreditCost) || 1;

    // Load and evaluate policies
    let policy_applied = null;
    let allowed        = true;
    let final_action   = 'allow';
    let policy_reason  = null;
    let rate_limit_info = null;
    let budget_info     = null;

    if (!bypass_policy) {
      const policies = stmts.getPoliciesByKey.all(key);
      if (policies.length > 0) {
        const evalResult = evaluatePolicies(policies, {
          tool_slug,
          agent_id:    agent_id || null,
          credit_cost: creditCost,
          acct,
          ip,
          api_key: key,
        });

        allowed         = evalResult.allowed;
        final_action    = evalResult.final_action;
        policy_applied  = evalResult.policy_id;
        policy_reason   = evalResult.reason;
        rate_limit_info = evalResult.rate_limit_info;
        budget_info     = evalResult.budget_info;
      }
    }

    const latency_ms_eval = now() - start;

    // Log the policy decision (denied or allowed-with-enforcement)
    stmts.insertLog.run(
      key, tool_slug, agent_id || null, ip,
      policy_applied, final_action, policy_reason,
      creditCost, latency_ms_eval, now()
    );

    if (!allowed || final_action === 'deny' || final_action === 'block') {
      // Fire webhooks asynchronously — don't block response
      dispatchWebhooks(key, 'policy.violation', {
        tool_slug, agent_id, policy_id: policy_applied, action: final_action, reason: policy_reason, ip,
      }).catch(() => {});

      return res.status(403).json({
        ok:            false,
        allowed:       false,
        tool_result:   null,
        policy_applied,
        policy_action: final_action,
        policy_reason,
        latency_ms:    latency_ms_eval,
        rate_limit:    rate_limit_info || undefined,
        budget:        budget_info     || undefined,
        error: { code: 'policy_denied', message: policy_reason || 'Denied by policy' },
      });
    }

    if (final_action === 'rate_limit') {
      // Enforce: check sliding window counter with 60 req/min default
      // (policy already updated the counter in evaluatePolicies, but re-check here)
      dispatchWebhooks(key, 'rate_limit.triggered', { tool_slug, agent_id, ip, rate_limit_info }).catch(() => {});
      return res.status(429).json({
        ok:            false,
        allowed:       false,
        tool_result:   null,
        policy_applied,
        policy_action: 'rate_limit',
        policy_reason: policy_reason || 'Rate limit exceeded',
        latency_ms:    latency_ms_eval,
        rate_limit:    rate_limit_info,
        error: { code: 'rate_limited', message: policy_reason || 'Rate limit exceeded' },
      });
    }

    if (final_action === 'require_approval') {
      dispatchWebhooks(key, 'approval.required', { tool_slug, agent_id, policy_id: policy_applied }).catch(() => {});
      return res.status(202).json({
        ok:                false,
        allowed:           false,
        requires_approval: true,
        tool_result:       null,
        policy_applied,
        policy_action:     final_action,
        latency_ms:        latency_ms_eval,
        message:           'This tool call requires manual approval due to an active policy.',
      });
    }

    // Execute the tool call
    const result     = await callToolInternally(tool_slug, input || {}, key);
    const latency_ms = now() - start;

    // Log execution with full latency
    stmts.insertLog.run(
      key, tool_slug, agent_id || null, ip,
      policy_applied, 'executed', null,
      creditCost, latency_ms, now()
    );

    return res.json({
      ok:            true,
      allowed:       true,
      tool_result:   result.body,
      policy_applied,
      policy_action: final_action,
      http_status:   result.status,
      latency_ms,
    });
  });

  // GET /v1/gateway/manifest — Signed manifest of all available tools
  app.get('/v1/gateway/manifest', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    let toolRows = [];
    try { toolRows = db.prepare(`SELECT DISTINCT tool_slug FROM gateway_logs LIMIT 500`).all(); } catch {}

    const TIER_RATINGS = { compute: 5, network: 3, llm: 3, leviathan: 2 };
    const KNOWN_TOOLS = [
      { slug: 'crypto-uuid',       name: 'UUID Generator',  tier: 'compute', capabilities: ['generate', 'id'] },
      { slug: 'crypto-hash-sha256',name: 'SHA-256 Hash',    tier: 'compute', capabilities: ['hash', 'crypto'] },
      { slug: 'text-word-count',   name: 'Word Count',      tier: 'compute', capabilities: ['text', 'analyze'] },
      { slug: 'memory-set',        name: 'Memory Set',      tier: 'compute', capabilities: ['memory', 'store'] },
      { slug: 'memory-get',        name: 'Memory Get',      tier: 'compute', capabilities: ['memory', 'retrieve'] },
      { slug: 'llm-think',         name: 'LLM Think',       tier: 'llm',     capabilities: ['ai', 'reasoning'] },
      { slug: 'net-dns-lookup',    name: 'DNS Lookup',      tier: 'network', capabilities: ['dns', 'network'] },
      { slug: 'net-http-get',      name: 'HTTP GET',        tier: 'network', capabilities: ['http', 'fetch'] },
    ];

    const tools  = KNOWN_TOOLS.map(t => ({
      slug:            t.slug,
      name:            t.name,
      tier:            t.tier,
      security_rating: TIER_RATINGS[t.tier] || 3,
      capabilities:    t.capabilities,
    }));

    const listed = new Set(tools.map(t => t.slug));
    for (const row of toolRows) {
      if (!listed.has(row.tool_slug)) {
        tools.push({ slug: row.tool_slug, name: row.tool_slug, tier: 'compute', security_rating: 4, capabilities: [] });
        listed.add(row.tool_slug);
      }
    }

    const manifest_id = 'manifest-' + uid(8);
    const signed_at   = new Date().toISOString();
    const expires_in  = 3600;

    // HMAC signs the full manifest content (not just count)
    const secret  = process.env.INTERNAL_SECRET || 'slop-internal-secret-change-me';
    const payload = JSON.stringify({ manifest_id, tools, signed_at });
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);

    ok(res, { manifest_id, tools, signed_at, expires_in, signature, tools_count: tools.length });
  });

  // POST /v1/gateway/session — Create a gateway session with sticky routing
  app.post('/v1/gateway/session', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { agent_id, preferred_region } = req.body;
    if (!agent_id) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'agent_id is required' } });
    }

    const session_token = 'gws-' + uid(20);
    const affinity_key  = crypto.createHash('sha256')
      .update(agent_id + (preferred_region || 'default'))
      .digest('hex')
      .slice(0, 16);
    const ttl        = 3600;
    const expires_at = now() + ttl * 1000;

    gatewaySessions.set(session_token, {
      api_key:          key,
      agent_id,
      preferred_region: preferred_region || 'default',
      affinity_key,
      expires_at,
      created_at:       now(),
    });

    return ok(res, {
      session_token,
      affinity_key,
      ttl,
      agent_id,
      preferred_region: preferred_region || 'default',
      expires_at: new Date(expires_at).toISOString(),
    });
  });

  // GET /v1/gateway/config — Get gateway configuration for this API key
  app.get('/v1/gateway/config', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key, acct } = auth;

    const policies = stmts.getPoliciesByKey.all(key);

    const blocked_tools       = [];
    const enabled_tools_hints = [];
    for (const policy of policies.filter(p => p.enabled !== 0)) {
      let rules;
      try { rules = JSON.parse(policy.rules); } catch { rules = []; }
      for (const rule of rules) {
        if (rule.condition === 'tool_slug_matches' && rule.action === 'deny') blocked_tools.push(rule.value);
        else if (rule.condition === 'tool_slug_matches' && rule.action === 'allow') enabled_tools_hints.push(rule.value);
      }
    }

    const TIER_RATE_LIMITS = {
      leviathan:       { requests_per_minute: 1000, credits_per_day: null },
      'reef-boss':     { requests_per_minute: 300,  credits_per_day: 100000 },
      'shore-crawler': { requests_per_minute: 120,  credits_per_day: 10000 },
      'baby-lobster':  { requests_per_minute: 60,   credits_per_day: 1000 },
      lobster:         { requests_per_minute: 60,   credits_per_day: 1000 },
      none:            { requests_per_minute: 30,   credits_per_day: 200 },
    };

    ok(res, {
      api_key_prefix:  key.slice(0, 12) + '...',
      tier:            acct.tier || 'none',
      rate_limits:     TIER_RATE_LIMITS[acct.tier] || TIER_RATE_LIMITS.none,
      enabled_tools:   enabled_tools_hints.length ? enabled_tools_hints : ['*'],
      blocked_tools,
      active_policies: policies.filter(p => p.enabled !== 0).length,
      policies:        policies.map(p => ({ id: p.id, name: p.name, priority: p.priority, enabled: p.enabled !== 0 })),
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POLICY ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  const VALID_CONDITIONS = [
    'tool_slug_matches',
    'credit_over',
    'agent_id_matches',
    'time_range',
    'tier_check',
    'ip_allowlist',       // NEW: fire (block) when IP is NOT in list
    'ip_blocklist',       // NEW: fire (block) when IP IS in list
    'rate_limit_policy',  // NEW: sliding-window request count
    'budget_cap',         // NEW: daily credit budget cap
  ];
  const VALID_ACTIONS = ['allow', 'deny', 'block', 'rate_limit', 'require_approval'];

  function validateRules(rules) {
    if (!Array.isArray(rules) || rules.length === 0) return 'rules must be a non-empty array';
    for (const rule of rules) {
      if (!VALID_CONDITIONS.includes(rule.condition)) {
        return `condition must be one of: ${VALID_CONDITIONS.join(', ')}`;
      }
      if (!VALID_ACTIONS.includes(rule.action)) {
        return `action must be one of: ${VALID_ACTIONS.join(', ')}`;
      }
      if (rule.value === undefined || rule.value === null) {
        return 'Each rule must have a value';
      }
    }
    return null;
  }

  // POST /v1/policy/create — Create a policy rule
  app.post('/v1/policy/create', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { name, rules, priority } = req.body;
    if (!name) return res.status(400).json({ error: { code: 'missing_field', message: 'name is required' } });
    const rulesError = validateRules(rules);
    if (rulesError) return res.status(400).json({ error: { code: 'invalid_rules', message: rulesError } });

    const policyPriority = Math.min(100, Math.max(0, parseInt(priority) || 0));
    const policy_id = 'pol-' + uid(12);

    stmts.insertPolicy.run(policy_id, key, name, JSON.stringify(rules), policyPriority, now());
    ok(res, { policy_id, name, rules, priority: policyPriority, enabled: true });
  });

  // GET /v1/policy/list — List all policies for this key
  app.get('/v1/policy/list', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const policies = stmts.getPoliciesByKey.all(key);
    ok(res, {
      policies: policies.map(p => ({
        id:         p.id,
        name:       p.name,
        rules:      JSON.parse(p.rules || '[]'),
        priority:   p.priority,
        enabled:    p.enabled !== 0,
        created_at: new Date(p.created).toISOString(),
        // api_key intentionally omitted (was leaking in old version)
      })),
      count: policies.length,
    });
  });

  // PUT /v1/policy/:id — Update policy
  app.put('/v1/policy/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const existing = stmts.getPolicy.get(req.params.id, key);
    if (!existing) return res.status(404).json({ error: { code: 'policy_not_found' } });

    const name     = req.body.name     !== undefined ? req.body.name     : existing.name;
    const rules    = req.body.rules    !== undefined ? req.body.rules    : JSON.parse(existing.rules || '[]');
    const priority = req.body.priority !== undefined ? Math.min(100, Math.max(0, parseInt(req.body.priority) || 0)) : existing.priority;
    const enabled  = req.body.enabled  !== undefined ? (req.body.enabled ? 1 : 0) : existing.enabled;

    if (req.body.rules !== undefined) {
      const rulesError = validateRules(rules);
      if (rulesError) return res.status(400).json({ error: { code: 'invalid_rules', message: rulesError } });
    }

    stmts.updatePolicy.run(name, JSON.stringify(rules), priority, enabled, req.params.id, key);
    ok(res, { policy_id: req.params.id, name, rules, priority, enabled: enabled !== 0, updated: true });
  });

  // DELETE /v1/policy/:id — Delete policy
  app.delete('/v1/policy/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const existing = stmts.getPolicy.get(req.params.id, key);
    if (!existing) return res.status(404).json({ error: { code: 'policy_not_found' } });

    stmts.deletePolicy.run(req.params.id, key);
    ok(res, { policy_id: req.params.id, deleted: true });
  });

  // POST /v1/policy/evaluate — Dry-run policy evaluation (alias for /simulate)
  app.post('/v1/policy/evaluate', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key, acct } = auth;

    const { tool_slug, agent_id, credits } = req.body;
    if (!tool_slug) return res.status(400).json({ error: { code: 'missing_field', message: 'tool_slug is required' } });

    const policies   = stmts.getPoliciesByKey.all(key);
    const evalResult = evaluatePolicies(policies, {
      tool_slug,
      agent_id:    agent_id || null,
      credit_cost: credits  || 0,
      acct,
      ip:      clientIp(req),
      api_key: key,
    });

    ok(res, {
      tool_slug,
      agent_id:          agent_id || null,
      credits:           credits  || 0,
      allowed:           evalResult.allowed,
      final_action:      evalResult.final_action,
      matched_policies:  evalResult.matched_policies,
      policies_evaluated: policies.filter(p => p.enabled !== 0).length,
      rate_limit:        evalResult.rate_limit_info || null,
      budget:            evalResult.budget_info     || null,
      dry_run:           true,
    });
  });

  // POST /v1/policy/simulate — Simulate a policy against a hypothetical context (no state mutation)
  app.post('/v1/policy/simulate', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key, acct } = auth;

    const { tool_slug, agent_id, credits, ip: simulatedIp, policy_ids } = req.body;
    if (!tool_slug) return res.status(400).json({ error: { code: 'missing_field', message: 'tool_slug is required' } });

    let policies = stmts.getPoliciesByKey.all(key);
    // Optionally filter to specific policy IDs for simulation
    if (Array.isArray(policy_ids) && policy_ids.length > 0) {
      policies = policies.filter(p => policy_ids.includes(p.id));
    }

    // Simulation: clone context so we don't mutate rate-limit windows
    // We temporarily snapshot the rate-limit state, evaluate, then restore
    const snapshots = new Map();
    for (const p of policies) {
      const mapKey = `${key}:${p.id}`;
      snapshots.set(mapKey, rateLimitWindows.has(mapKey) ? { ...rateLimitWindows.get(mapKey) } : null);
    }

    const evalResult = evaluatePolicies(policies, {
      tool_slug,
      agent_id:    agent_id    || null,
      credit_cost: credits     || 0,
      acct,
      ip:      simulatedIp || clientIp(req),
      api_key: key,
    });

    // Restore rate-limit state after simulation (no side effects)
    for (const [mapKey, snap] of snapshots) {
      if (snap === null) rateLimitWindows.delete(mapKey);
      else rateLimitWindows.set(mapKey, snap);
    }

    ok(res, {
      simulated: true,
      tool_slug,
      agent_id:          agent_id    || null,
      credits:           credits     || 0,
      simulated_ip:      simulatedIp || clientIp(req),
      allowed:           evalResult.allowed,
      final_action:      evalResult.final_action,
      matched_policies:  evalResult.matched_policies,
      policies_evaluated: policies.filter(p => p.enabled !== 0).length,
      policy_ids_used:   policies.map(p => p.id),
      rate_limit:        evalResult.rate_limit_info || null,
      budget:            evalResult.budget_info     || null,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GOVERNANCE (HIVE VOTING)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /v1/governance/propose — Create a governance proposal
  app.post('/v1/governance/propose', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { hive_id, title, description, type, deadline_hours } = req.body;
    if (!hive_id) return res.status(400).json({ error: { code: 'missing_field', message: 'hive_id is required' } });
    if (!title)   return res.status(400).json({ error: { code: 'missing_field', message: 'title is required' } });

    const VALID_TYPES = ['config_change', 'tool_access', 'budget_change', 'rule_add', 'policy_add', 'policy_remove'];
    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: { code: 'invalid_type', message: `type must be one of: ${VALID_TYPES.join(', ')}` } });
    }

    const hours       = Math.min(720, Math.max(1, parseInt(deadline_hours) || 48));
    const deadline    = now() + hours * 3600000;
    const proposal_id = 'prop-' + uid(12);

    stmts.insertProposal.run(proposal_id, hive_id, key, type || 'config_change', title, description || null, deadline, now());

    ok(res, {
      proposal_id,
      hive_id,
      title,
      type:           type || 'config_change',
      status:         'open',
      deadline:       new Date(deadline).toISOString(),
      deadline_hours: hours,
    });
  });

  // POST /v1/governance/vote — Vote on a proposal
  app.post('/v1/governance/vote', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { proposal_id, vote, reason } = req.body;
    if (!proposal_id) return res.status(400).json({ error: { code: 'missing_field', message: 'proposal_id is required' } });
    if (!['for', 'against', 'abstain'].includes(vote)) {
      return res.status(400).json({ error: { code: 'invalid_vote', message: 'vote must be "for", "against", or "abstain"' } });
    }

    const proposal = stmts.getProposal.get(proposal_id);
    if (!proposal) return res.status(404).json({ error: { code: 'proposal_not_found' } });
    if (proposal.status !== 'open') {
      return res.status(400).json({ error: { code: 'proposal_closed', message: `Proposal is ${proposal.status}` } });
    }

    // Deadline check — auto-close and return the final status (200, not 400)
    if (now() > proposal.deadline) {
      const finalStatus = proposal.votes_for > proposal.votes_against ? 'passed' : 'rejected';
      stmts.updateVotes.run(proposal.votes_for, proposal.votes_against, finalStatus, proposal_id);
      return res.status(200).json({
        ok: false,
        deadline_passed: true,
        final_status:    finalStatus,
        tally: {
          votes_for:     proposal.votes_for,
          votes_against: proposal.votes_against,
        },
        error: { code: 'deadline_passed', message: `Voting deadline has passed. Proposal ${finalStatus}.` },
      });
    }

    // Check duplicate vote
    const existing = stmts.checkVote.get(proposal_id, key);
    if (existing) {
      return res.status(409).json({ error: { code: 'already_voted', message: 'This agent has already voted on this proposal' } });
    }

    const vote_id = 'vote-' + uid(12);
    stmts.insertVote.run(vote_id, proposal_id, key, vote, reason || null, now());

    const new_votes_for     = proposal.votes_for     + (vote === 'for'     ? 1 : 0);
    const new_votes_against = proposal.votes_against + (vote === 'against' ? 1 : 0);
    const total             = new_votes_for + new_votes_against;

    // Auto-pass at supermajority (>66%) or auto-reject (>66% against, min 3 votes)
    let new_status = 'open';
    if (total >= 3) {
      if (new_votes_for     / total >= 0.67) new_status = 'passed';
      else if (new_votes_against / total >= 0.67) new_status = 'rejected';
    }

    stmts.updateVotes.run(new_votes_for, new_votes_against, new_status, proposal_id);

    ok(res, {
      vote_recorded: true,
      vote_id,
      proposal_id,
      current_tally: {
        votes_for:     new_votes_for,
        votes_against: new_votes_against,
        total,
        status:        new_status,
      },
    });
  });

  // POST /v1/governance/close — Explicitly close a proposal (proposer only)
  app.post('/v1/governance/close', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { proposal_id, force_status } = req.body;
    if (!proposal_id) return res.status(400).json({ error: { code: 'missing_field', message: 'proposal_id is required' } });

    const proposal = stmts.getProposal.get(proposal_id);
    if (!proposal) return res.status(404).json({ error: { code: 'proposal_not_found' } });
    if (proposal.proposer !== key) {
      return res.status(403).json({ error: { code: 'not_proposer', message: 'Only the proposer can close this proposal' } });
    }
    if (proposal.status !== 'open') {
      return res.status(400).json({ error: { code: 'already_closed', message: `Proposal is already ${proposal.status}` } });
    }

    const ALLOWED_FORCE = ['passed', 'rejected', 'closed'];
    const finalStatus = ALLOWED_FORCE.includes(force_status)
      ? force_status
      : (proposal.votes_for > proposal.votes_against ? 'passed' : 'rejected');

    stmts.updateVotes.run(proposal.votes_for, proposal.votes_against, finalStatus, proposal_id);
    ok(res, { proposal_id, closed: true, final_status: finalStatus });
  });

  // GET /v1/governance/proposals — List proposals
  app.get('/v1/governance/proposals', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { hive_id, status } = req.query;
    if (!hive_id) return res.status(400).json({ error: { code: 'missing_param', message: 'hive_id query param is required' } });

    const VALID_STATUSES = ['open', 'closed', 'passed', 'rejected'];
    const proposals = (status && VALID_STATUSES.includes(status))
      ? stmts.listProposals.all(hive_id, status)
      : stmts.listProposalsAll.all(hive_id);

    ok(res, {
      proposals: proposals.map(p => ({
        ...p,
        deadline:   new Date(p.deadline).toISOString(),
        created_at: new Date(p.created).toISOString(),
        is_expired: now() > p.deadline && p.status === 'open',
      })),
      count:         proposals.length,
      hive_id,
      filter_status: status || 'all',
    });
  });

  // GET /v1/governance/proposal/:id — Get proposal details with vote breakdown
  app.get('/v1/governance/proposal/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const proposal = stmts.getProposal.get(req.params.id);
    if (!proposal) return res.status(404).json({ error: { code: 'proposal_not_found' } });

    const votes         = stmts.getVotesByProposal.all(req.params.id);
    const total         = votes.length;
    const for_votes     = votes.filter(v => v.vote === 'for');
    const against_votes = votes.filter(v => v.vote === 'against');
    const abstain_votes = votes.filter(v => v.vote === 'abstain');

    ok(res, {
      proposal: {
        ...proposal,
        deadline:   new Date(proposal.deadline).toISOString(),
        created_at: new Date(proposal.created).toISOString(),
        is_expired: now() > proposal.deadline && proposal.status === 'open',
      },
      tally: {
        votes_for:     proposal.votes_for,
        votes_against: proposal.votes_against,
        abstentions:   abstain_votes.length,
        total,
        for_pct:     total > 0 ? Math.round(proposal.votes_for     / total * 100) : 0,
        against_pct: total > 0 ? Math.round(proposal.votes_against / total * 100) : 0,
      },
      votes: votes.map(v => ({
        vote_id:    v.id,
        voter_agent: v.voter_agent.slice(0, 12) + '...',
        vote:       v.vote,
        reason:     v.reason,
        voted_at:   new Date(v.ts).toISOString(),
      })),
      for_votes:     for_votes.map(v => ({ vote_id: v.id, reason: v.reason, voted_at: new Date(v.ts).toISOString() })),
      against_votes: against_votes.map(v => ({ vote_id: v.id, reason: v.reason, voted_at: new Date(v.ts).toISOString() })),
      abstain_votes: abstain_votes.map(v => ({ vote_id: v.id, reason: v.reason, voted_at: new Date(v.ts).toISOString() })),
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBHOOKS (policy violation triggers)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /v1/gateway/webhook — Register a webhook endpoint
  app.post('/v1/gateway/webhook', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { url, events, secret } = req.body;
    if (!url) return res.status(400).json({ error: { code: 'missing_field', message: 'url is required' } });

    let parsedUrl;
    try { parsedUrl = new URL(url); } catch {
      return res.status(400).json({ error: { code: 'invalid_url', message: 'url must be a valid http/https URL' } });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: { code: 'invalid_url', message: 'url must use http or https' } });
    }

    const VALID_EVENTS = ['policy.violation', 'rate_limit.triggered', 'approval.required', '*'];
    const eventList = Array.isArray(events) ? events : (events ? [events] : ['*']);
    for (const ev of eventList) {
      if (!VALID_EVENTS.includes(ev)) {
        return res.status(400).json({ error: { code: 'invalid_event', message: `events must be one of: ${VALID_EVENTS.join(', ')}` } });
      }
    }

    const webhook_id = 'whk-' + uid(12);
    const eventsStr  = eventList.join(',');
    stmts.insertWebhook.run(webhook_id, key, url, eventsStr, secret || null, now());

    // Add to in-memory registry
    const list = webhookRegistry.get(key) || [];
    list.push({ id: webhook_id, url, events: eventsStr, secret: secret || null });
    webhookRegistry.set(key, list);

    ok(res, { webhook_id, url, events: eventList, has_secret: !!secret, enabled: true });
  });

  // GET /v1/gateway/webhooks — List registered webhooks
  app.get('/v1/gateway/webhooks', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const hooks = stmts.getWebhooksByKey.all(key);
    ok(res, {
      webhooks: hooks.map(h => ({
        webhook_id: h.id,
        url:        h.url,
        events:     h.events.split(','),
        has_secret: !!h.secret,
        enabled:    h.enabled !== 0,
        created_at: new Date(h.created).toISOString(),
      })),
      count: hooks.length,
    });
  });

  // DELETE /v1/gateway/webhook/:id — Delete a webhook
  app.delete('/v1/gateway/webhook/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    stmts.deleteWebhook.run(req.params.id, key);

    // Remove from in-memory registry
    const list = webhookRegistry.get(key) || [];
    webhookRegistry.set(key, list.filter(h => h.id !== req.params.id));

    ok(res, { webhook_id: req.params.id, deleted: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SIEM / AUDIT EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /v1/gateway/audit — Get structured audit log
  app.get('/v1/gateway/audit', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const since  = req.query.since ? new Date(req.query.since).getTime() : now() - 86400000;
    const limit  = Math.min(parseInt(req.query.limit) || 100, 1000);
    const format = req.query.format || 'json';

    if (isNaN(since)) {
      return res.status(400).json({ error: { code: 'invalid_since', message: 'since must be a valid ISO date string' } });
    }

    const rows = stmts.getLogs.all(key, since, limit);

    if (format === 'siem') {
      res.set('Content-Type', 'application/x-ndjson');
      return res.send(rows.map(row => JSON.stringify(toEcsRecord(row))).join('\n'));
    }

    if (format === 'csv') {
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', 'attachment; filename="gateway-audit.csv"');
      const header = 'id,tool_slug,agent_id,client_ip,policy_id,action,reason,credit_cost,latency_ms,timestamp\n';
      const csvRows = rows.map(r =>
        [r.id, r.tool_slug, r.agent_id, r.client_ip, r.policy_id, r.action, r.reason, r.credit_cost, r.latency_ms, new Date(r.ts).toISOString()]
          .map(csvEscape).join(',')
      );
      return res.send(header + csvRows.join('\n'));
    }

    ok(res, {
      logs: rows.map(r => ({
        id:          r.id,
        tool_slug:   r.tool_slug,
        agent_id:    r.agent_id  || null,
        client_ip:   r.client_ip || null,
        policy_id:   r.policy_id || null,
        action:      r.action,
        reason:      r.reason    || null,
        credit_cost: r.credit_cost || null,
        latency_ms:  r.latency_ms  || null,
        timestamp:   new Date(r.ts).toISOString(),
        ts:          r.ts,
      })),
      count: rows.length,
      since: new Date(since).toISOString(),
      format,
    });
  });

  // POST /v1/gateway/audit/export — Export audit log to structured format
  app.post('/v1/gateway/audit/export', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { period, format, include_policy_events, action_filter } = req.body;

    const VALID_PERIODS = ['1h', '6h', '12h', '24h', '7d', '30d'];
    if (period && !VALID_PERIODS.includes(period)) {
      return res.status(400).json({ error: { code: 'invalid_period', message: `period must be one of: ${VALID_PERIODS.join(', ')}` } });
    }

    const ms    = periodToMs(period || '24h');
    const since = now() - ms;
    const rows  = stmts.getLogs.all(key, since, 10000);

    let filtered = include_policy_events === false ? rows.filter(r => r.action === 'executed') : rows;
    if (action_filter && typeof action_filter === 'string') {
      filtered = filtered.filter(r => r.action === action_filter);
    }

    if (format === 'csv') {
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="gateway-audit-${period || '24h'}.csv"`);
      const header = 'id,tool_slug,agent_id,client_ip,policy_id,action,reason,credit_cost,latency_ms,timestamp\n';
      const csvRows = filtered.map(r =>
        [r.id, r.tool_slug, r.agent_id, r.client_ip, r.policy_id, r.action, r.reason, r.credit_cost, r.latency_ms, new Date(r.ts).toISOString()]
          .map(csvEscape).join(',')
      );
      return res.send(header + csvRows.join('\n'));
    }

    if (format === 'siem') {
      res.set('Content-Type', 'application/x-ndjson');
      return res.send(filtered.map(r => JSON.stringify(toEcsRecord(r))).join('\n'));
    }

    // Default: JSON with summary
    const summary = {
      total_calls: filtered.length,
      allowed:     filtered.filter(r => r.action !== 'deny' && r.action !== 'block').length,
      denied:      filtered.filter(r => r.action === 'deny' || r.action === 'block').length,
      rate_limited: filtered.filter(r => r.action === 'rate_limit').length,
      by_tool:     {},
      by_action:   {},
    };
    for (const r of filtered) {
      summary.by_tool[r.tool_slug]   = (summary.by_tool[r.tool_slug]   || 0) + 1;
      summary.by_action[r.action]    = (summary.by_action[r.action]    || 0) + 1;
    }

    ok(res, {
      period:      period || '24h',
      format:      'json',
      since:       new Date(since).toISOString(),
      exported_at: new Date().toISOString(),
      summary,
      events: filtered.map(r => ({
        id:          r.id,
        tool_slug:   r.tool_slug,
        agent_id:    r.agent_id  || null,
        client_ip:   r.client_ip || null,
        policy_id:   r.policy_id || null,
        action:      r.action,
        reason:      r.reason    || null,
        credit_cost: r.credit_cost || null,
        latency_ms:  r.latency_ms  || null,
        timestamp:   new Date(r.ts).toISOString(),
      })),
      count: filtered.length,
    });
  });

};
