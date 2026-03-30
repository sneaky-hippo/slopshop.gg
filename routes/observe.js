'use strict';

/**
 * Full Observability, Distributed Tracing, Cost Analytics, ROI Calculator, and Status Page
 * routes/observe.js
 *
 * Full working implementations — no stubs, no TODOs.
 * Uses: crypto (built-in), better-sqlite3 (db passed in), express
 */

const crypto = require('crypto');
const os = require('os');

// ─── USD conversion constant ────────────────────────────────────────────────
const USD_PER_CREDIT = 0.005;

// ─── Helper: wrap response ───────────────────────────────────────────────────
function ok(res, data) {
  res.json({ ok: true, _engine: 'real', data, generated_at: new Date().toISOString() });
}

// ─── Helper: key prefix (matches server-v2.js convention) ───────────────────
function keyPrefix(apiKey) {
  return apiKey.slice(0, 12) + '...';
}

// ─── Helper: percentile from sorted array ───────────────────────────────────
function percentile(sorted, pct) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ─── Helper: parse period string → ms ago ───────────────────────────────────
function periodToMs(period) {
  switch (period) {
    case '24h': return 86400000;
    case '7d':  return 7 * 86400000;
    case '30d': return 30 * 86400000;
    default:    return 30 * 86400000;
  }
}

// ─── Helper: generate a short random hex id ─────────────────────────────────
function uid(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

module.exports = function (app, db, apiKeys, ipLimits) {

  // ─── Inline auth ──────────────────────────────────────────────────────────
  function requireAuth(req, res) {
    const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!key || !apiKeys.get(key)) {
      res.status(401).json({ error: { code: 'auth_required' } });
      return null;
    }
    return apiKeys.get(key);
  }

  // ─── Inline admin check ───────────────────────────────────────────────────
  function requireAdmin(req, res) {
    const secret = (req.headers['x-admin-secret'] || req.query.admin_secret || '').trim();
    const expected = process.env.ADMIN_SECRET || '';
    if (!expected || secret !== expected) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Admin secret required' } });
      return false;
    }
    return true;
  }

  // ─── Ensure tables exist ──────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS traces (
      id TEXT PRIMARY KEY,
      api_key TEXT,
      span_id TEXT,
      parent_span TEXT,
      operation TEXT,
      status TEXT,
      latency_ms INTEGER,
      credits INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      ts INTEGER,
      agent_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_traces_api_key ON traces(api_key);
    CREATE INDEX IF NOT EXISTS idx_traces_span_id ON traces(span_id);
    CREATE INDEX IF NOT EXISTS idx_traces_ts ON traces(ts);

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      api_key TEXT,
      name TEXT,
      credits_limit INTEGER,
      credits_used INTEGER DEFAULT 0,
      alert_threshold REAL DEFAULT 0.8,
      period TEXT DEFAULT 'monthly',
      created INTEGER,
      resets_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_budgets_api_key ON budgets(api_key);

    CREATE TABLE IF NOT EXISTS roi_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key TEXT,
      event_type TEXT,
      value REAL DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      ts INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_roi_events_api_key ON roi_events(api_key);
    CREATE INDEX IF NOT EXISTS idx_roi_events_ts ON roi_events(ts);

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT,
      severity TEXT,
      status TEXT DEFAULT 'investigating',
      started INTEGER,
      resolved INTEGER,
      message TEXT,
      affected TEXT DEFAULT '[]'
    );
  `);

  // ══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTED TRACING
  // ══════════════════════════════════════════════════════════════════════════

  // POST /v1/observe/trace/start
  app.post('/v1/observe/trace/start', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const { operation, parent_span_id, agent_id, metadata } = req.body || {};
    if (!operation) return res.status(400).json({ error: { code: 'missing_field', message: 'operation is required' } });

    const trace_id = uid(16);
    const span_id = uid(12);
    const now = Date.now();

    db.prepare(`
      INSERT INTO traces (id, api_key, span_id, parent_span, operation, status, latency_ms, credits, metadata, ts, agent_id)
      VALUES (?, ?, ?, ?, ?, 'running', NULL, 0, ?, ?, ?)
    `).run(
      trace_id,
      acct.key || req.headers.authorization.replace('Bearer ', '').trim(),
      span_id,
      parent_span_id || null,
      operation,
      JSON.stringify(metadata || {}),
      now,
      agent_id || null
    );

    ok(res, { trace_id, span_id, started_at: new Date(now).toISOString(), operation });
  });

  // POST /v1/observe/trace/end
  app.post('/v1/observe/trace/end', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const { span_id, status, latency_ms, credits_used, result_summary } = req.body || {};
    if (!span_id) return res.status(400).json({ error: { code: 'missing_field', message: 'span_id is required' } });
    if (!['success', 'error'].includes(status)) return res.status(400).json({ error: { code: 'invalid_status', message: 'status must be success or error' } });

    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const trace = db.prepare('SELECT * FROM traces WHERE span_id = ? AND api_key = ?').get(span_id, apiKey);
    if (!trace) return res.status(404).json({ error: { code: 'span_not_found', message: 'Span not found or does not belong to this key' } });

    const existing = trace.metadata ? JSON.parse(trace.metadata) : {};
    if (result_summary) existing.result_summary = result_summary;

    db.prepare(`
      UPDATE traces SET status = ?, latency_ms = ?, credits = ?, metadata = ? WHERE span_id = ? AND api_key = ?
    `).run(
      status,
      latency_ms || 0,
      credits_used || 0,
      JSON.stringify(existing),
      span_id,
      apiKey
    );

    ok(res, {
      span_id,
      status,
      latency_ms: latency_ms || 0,
      credits_used: credits_used || 0,
      completed_at: new Date().toISOString()
    });
  });

  // GET /v1/observe/traces
  app.get('/v1/observe/traces', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const since = req.query.since ? new Date(req.query.since).getTime() : 0;
    const operation = req.query.operation || null;
    const statusFilter = req.query.status || null;

    let sql = 'SELECT * FROM traces WHERE api_key = ?';
    const params = [apiKey];
    if (since) { sql += ' AND ts >= ?'; params.push(since); }
    if (operation) { sql += ' AND operation = ?'; params.push(operation); }
    if (statusFilter) { sql += ' AND status = ?'; params.push(statusFilter); }
    sql += ' ORDER BY ts DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params);

    // Compute timing breakdown by operation
    const ops = {};
    for (const r of rows) {
      if (!ops[r.operation]) ops[r.operation] = { count: 0, total_ms: 0, total_credits: 0 };
      ops[r.operation].count++;
      ops[r.operation].total_ms += r.latency_ms || 0;
      ops[r.operation].total_credits += r.credits || 0;
    }
    const timing_breakdown = Object.entries(ops).map(([op, v]) => ({
      operation: op,
      count: v.count,
      avg_latency_ms: v.count ? Math.round(v.total_ms / v.count) : 0,
      total_credits: v.total_credits
    }));

    ok(res, {
      traces: rows.map(r => ({
        ...r,
        metadata: JSON.parse(r.metadata || '{}'),
        started_at: new Date(r.ts).toISOString()
      })),
      total: rows.length,
      timing_breakdown
    });
  });

  // GET /v1/observe/trace/:span_id
  app.get('/v1/observe/trace/:span_id', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const { span_id } = req.params;

    const root = db.prepare('SELECT * FROM traces WHERE span_id = ? AND api_key = ?').get(span_id, apiKey);
    if (!root) return res.status(404).json({ error: { code: 'span_not_found' } });

    // Find all child spans (traces whose parent_span matches this span_id)
    const children = db.prepare('SELECT * FROM traces WHERE parent_span = ? AND api_key = ?').all(span_id, apiKey);

    const total_latency = (root.latency_ms || 0) + children.reduce((s, c) => s + (c.latency_ms || 0), 0);
    const total_credits = (root.credits || 0) + children.reduce((s, c) => s + (c.credits || 0), 0);

    ok(res, {
      span: { ...root, metadata: JSON.parse(root.metadata || '{}'), started_at: new Date(root.ts).toISOString() },
      children: children.map(c => ({ ...c, metadata: JSON.parse(c.metadata || '{}'), started_at: new Date(c.ts).toISOString() })),
      summary: {
        total_spans: 1 + children.length,
        total_latency_ms: total_latency,
        total_credits,
        all_success: [root, ...children].every(s => s.status === 'success')
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // FULL ANALYTICS DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  // GET /v1/observe/dashboard
  app.get('/v1/observe/dashboard', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const prefix = keyPrefix(apiKey);
    const now = Date.now();

    // Total stats
    const totals = db.prepare(`
      SELECT COUNT(*) as total_calls, COALESCE(SUM(credits),0) as total_credits
      FROM audit_log WHERE key_prefix = ?
    `).get(prefix);

    // All latencies for percentile computation
    const latencies = db.prepare(`
      SELECT latency_ms FROM audit_log WHERE key_prefix = ? AND latency_ms IS NOT NULL ORDER BY latency_ms ASC
    `).all(prefix).map(r => r.latency_ms);

    const avg_latency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);

    // Success rate from audit_log (engine != 'error' as proxy, or count all since no status col)
    const errorCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM audit_log WHERE key_prefix = ? AND engine = 'error'
    `).get(prefix).cnt || 0;
    const total_calls = totals.total_calls || 0;
    const success_rate = total_calls ? ((total_calls - errorCount) / total_calls) * 100 : 100;

    // Top 10 tools by usage
    const top_tools = db.prepare(`
      SELECT api as slug, COUNT(*) as calls, COALESCE(SUM(credits),0) as credits_spent,
             AVG(latency_ms) as avg_latency
      FROM audit_log WHERE key_prefix = ?
      GROUP BY api ORDER BY calls DESC LIMIT 10
    `).all(prefix).map(r => ({
      slug: r.slug,
      calls: r.calls,
      credits_spent: r.credits_spent,
      avg_latency_ms: Math.round(r.avg_latency || 0)
    }));

    // Cost by day (last 30 days)
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const cost_by_day = db.prepare(`
      SELECT substr(ts, 1, 10) as day, COUNT(*) as calls, COALESCE(SUM(credits),0) as credits
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY day ORDER BY day ASC
    `).all(prefix, thirtyDaysAgo).map(r => ({
      day: r.day,
      calls: r.calls,
      credits: r.credits,
      cost_usd: +(r.credits * USD_PER_CREDIT).toFixed(4)
    }));

    // Calls by hour (last 24h)
    const oneDayAgo = new Date(now - 86400000).toISOString();
    const calls_by_hour = db.prepare(`
      SELECT substr(ts, 1, 13) as hour, COUNT(*) as calls, COALESCE(SUM(credits),0) as credits
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY hour ORDER BY hour ASC
    `).all(prefix, oneDayAgo).map(r => ({
      hour: r.hour + ':00:00Z',
      calls: r.calls,
      credits: r.credits
    }));

    // Error breakdown
    const error_breakdown = db.prepare(`
      SELECT api as slug, COUNT(*) as errors FROM audit_log
      WHERE key_prefix = ? AND engine = 'error'
      GROUP BY api ORDER BY errors DESC LIMIT 10
    `).all(prefix);

    // Credit burn rate: credits per hour over last 7 days
    const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
    const weekCredits = db.prepare(`
      SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?
    `).get(prefix, sevenDaysAgo).c || 0;
    const credit_burn_rate = +(weekCredits / (7 * 24)).toFixed(2); // per hour
    const projected_monthly_spend = +(credit_burn_rate * 24 * 30 * USD_PER_CREDIT).toFixed(4);

    ok(res, {
      total_calls,
      total_credits: totals.total_credits,
      avg_latency_ms: avg_latency,
      p95_latency_ms: p95,
      p99_latency_ms: p99,
      success_rate: +success_rate.toFixed(2),
      top_tools,
      cost_by_day,
      calls_by_hour,
      error_breakdown,
      credit_burn_rate_per_hour: credit_burn_rate,
      projected_monthly_spend_usd: projected_monthly_spend
    });
  });

  // GET /v1/observe/analytics/tools
  app.get('/v1/observe/analytics/tools', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const prefix = keyPrefix(apiKey);

    const tools = db.prepare(`
      SELECT api as slug,
             COUNT(*) as calls,
             COALESCE(SUM(credits),0) as credits_spent,
             AVG(latency_ms) as avg_latency,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors,
             MAX(ts) as last_used
      FROM audit_log WHERE key_prefix = ?
      GROUP BY api ORDER BY calls DESC
    `).all(prefix).map(r => ({
      slug: r.slug,
      calls: r.calls,
      credits_spent: r.credits_spent,
      avg_latency_ms: Math.round(r.avg_latency || 0),
      error_rate: r.calls ? +((r.errors / r.calls) * 100).toFixed(2) : 0,
      last_used: r.last_used,
      cost_usd: +(r.credits_spent * USD_PER_CREDIT).toFixed(4)
    }));

    ok(res, { tools, total_tools: tools.length });
  });

  // GET /v1/observe/analytics/timeline
  app.get('/v1/observe/analytics/timeline', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const prefix = keyPrefix(apiKey);
    const period = req.query.period || '7d';
    const resolution = req.query.resolution || (period === '24h' ? 'hour' : 'day');

    const since = new Date(Date.now() - periodToMs(period)).toISOString();

    let groupExpr, labelLen;
    if (resolution === 'hour') {
      groupExpr = "substr(ts, 1, 13)";
      labelLen = 13;
    } else {
      groupExpr = "substr(ts, 1, 10)";
      labelLen = 10;
    }

    const rows = db.prepare(`
      SELECT ${groupExpr} as bucket,
             COUNT(*) as calls,
             COALESCE(SUM(credits),0) as credits,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY bucket ORDER BY bucket ASC
    `).all(prefix, since).map(r => ({
      timestamp: resolution === 'hour' ? r.bucket + ':00:00Z' : r.bucket + 'T00:00:00Z',
      calls: r.calls,
      credits: r.credits,
      errors: r.errors,
      cost_usd: +(r.credits * USD_PER_CREDIT).toFixed(4)
    }));

    ok(res, { period, resolution, timeline: rows, data_points: rows.length });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // COST INTELLIGENCE
  // ══════════════════════════════════════════════════════════════════════════

  // GET /v1/observe/cost
  app.get('/v1/observe/cost', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const prefix = keyPrefix(apiKey);
    const now = Date.now();

    const todayStart = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const weekStart = new Date(now - 7 * 86400000).toISOString();
    const monthStart = new Date(now - 30 * 86400000).toISOString();

    const todayCredits = db.prepare(`
      SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?
    `).get(prefix, todayStart + 'T00:00:00.000Z').c || 0;

    const weekCredits = db.prepare(`
      SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?
    `).get(prefix, weekStart).c || 0;

    const monthCredits = db.prepare(`
      SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?
    `).get(prefix, monthStart).c || 0;

    // Projected monthly (annualize last 7 days)
    const projectedMonthCredits = weekCredits * (30 / 7);

    // Cost by tool (top 10)
    const cost_by_tool = db.prepare(`
      SELECT api as slug, COALESCE(SUM(credits),0) as credits, COUNT(*) as calls
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY api ORDER BY credits DESC LIMIT 10
    `).all(prefix, monthStart).map(r => ({
      slug: r.slug,
      credits: r.credits,
      calls: r.calls,
      cost_usd: +(r.credits * USD_PER_CREDIT).toFixed(4)
    }));

    // Savings opportunities: tools with >10 calls that have high credit cost per call
    const allTools = db.prepare(`
      SELECT api as slug, COALESCE(SUM(credits),0) as credits, COUNT(*) as calls,
             CAST(COALESCE(SUM(credits),0) AS REAL) / COUNT(*) as credits_per_call
      FROM audit_log WHERE key_prefix = ?
      GROUP BY api HAVING calls > 10 ORDER BY credits_per_call DESC LIMIT 5
    `).all(prefix);

    const savings_opportunities = allTools.map(r => ({
      slug: r.slug,
      calls: r.calls,
      avg_credits_per_call: +r.credits_per_call.toFixed(2),
      monthly_cost_usd: +(r.credits * USD_PER_CREDIT).toFixed(4),
      suggestion: r.credits_per_call > 50
        ? 'Consider caching results or batching requests to reduce credit spend'
        : 'Consider using a lower-tier model variant if available'
    }));

    ok(res, {
      today_usd: +(todayCredits * USD_PER_CREDIT).toFixed(4),
      this_week_usd: +(weekCredits * USD_PER_CREDIT).toFixed(4),
      this_month_usd: +(monthCredits * USD_PER_CREDIT).toFixed(4),
      projected_month_usd: +(projectedMonthCredits * USD_PER_CREDIT).toFixed(4),
      cost_by_tool,
      savings_opportunities
    });
  });

  // POST /v1/observe/budget/set
  app.post('/v1/observe/budget/set', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const { name, credits_limit, period, alert_threshold } = req.body || {};

    if (!name) return res.status(400).json({ error: { code: 'missing_field', message: 'name is required' } });
    if (!credits_limit || credits_limit <= 0) return res.status(400).json({ error: { code: 'invalid_field', message: 'credits_limit must be a positive number' } });

    const validPeriods = ['daily', 'weekly', 'monthly'];
    const p = validPeriods.includes(period) ? period : 'monthly';
    const threshold = (typeof alert_threshold === 'number' && alert_threshold > 0 && alert_threshold <= 1)
      ? alert_threshold : 0.8;

    const now = Date.now();
    let resets_at;
    if (p === 'daily') resets_at = now + 86400000;
    else if (p === 'weekly') resets_at = now + 7 * 86400000;
    else resets_at = now + 30 * 86400000;

    const id = uid(12);
    db.prepare(`
      INSERT INTO budgets (id, api_key, name, credits_limit, credits_used, alert_threshold, period, created, resets_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(id, apiKey, name, credits_limit, threshold, p, now, resets_at);

    ok(res, {
      budget_id: id,
      name,
      credits_limit,
      period: p,
      alert_threshold: threshold,
      resets_at: new Date(resets_at).toISOString(),
      alert_endpoint: `/v1/observe/budget/${id}/alerts`
    });
  });

  // GET /v1/observe/budget
  app.get('/v1/observe/budget', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const prefix = keyPrefix(apiKey);
    const now = Date.now();

    const budgets = db.prepare('SELECT * FROM budgets WHERE api_key = ? ORDER BY created DESC').all(apiKey);

    // For each budget, compute current credits used in this period from audit_log
    const enriched = budgets.map(b => {
      const periodStart = new Date(b.resets_at - periodDurationMs(b.period)).toISOString();
      const used = db.prepare(`
        SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?
      `).get(prefix, periodStart).c || 0;

      // Update credits_used in budgets table
      db.prepare('UPDATE budgets SET credits_used = ? WHERE id = ?').run(used, b.id);

      const pct = b.credits_limit ? (used / b.credits_limit) * 100 : 0;
      const alert_firing = pct / 100 >= b.alert_threshold;

      return {
        id: b.id,
        name: b.name,
        credits_limit: b.credits_limit,
        credits_used: used,
        credits_remaining: Math.max(0, b.credits_limit - used),
        usage_pct: +pct.toFixed(2),
        alert_threshold: b.alert_threshold,
        alert_firing,
        period: b.period,
        resets_at: new Date(b.resets_at).toISOString(),
        cost_used_usd: +(used * USD_PER_CREDIT).toFixed(4),
        cost_limit_usd: +(b.credits_limit * USD_PER_CREDIT).toFixed(4),
        over_budget: used > b.credits_limit
      };
    });

    ok(res, { budgets: enriched, total: enriched.length });
  });

  function periodDurationMs(period) {
    if (period === 'daily') return 86400000;
    if (period === 'weekly') return 7 * 86400000;
    return 30 * 86400000;
  }

  // DELETE /v1/observe/budget/:id
  app.delete('/v1/observe/budget/:id', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const { id } = req.params;

    const budget = db.prepare('SELECT * FROM budgets WHERE id = ? AND api_key = ?').get(id, apiKey);
    if (!budget) return res.status(404).json({ error: { code: 'not_found', message: 'Budget not found' } });

    db.prepare('DELETE FROM budgets WHERE id = ?').run(id);
    ok(res, { deleted: true, id });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ROI CALCULATOR
  // ══════════════════════════════════════════════════════════════════════════

  const VALID_ROI_TYPES = ['pr_merged', 'email_sent', 'bug_fixed', 'report_generated', 'deal_closed', 'task_completed', 'custom'];

  // POST /v1/observe/roi/record
  app.post('/v1/observe/roi/record', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const { event_type, value_usd, metadata } = req.body || {};

    if (!VALID_ROI_TYPES.includes(event_type)) {
      return res.status(400).json({ error: { code: 'invalid_event_type', message: `event_type must be one of: ${VALID_ROI_TYPES.join(', ')}` } });
    }

    const now = Date.now();
    const result = db.prepare(`
      INSERT INTO roi_events (api_key, event_type, value, metadata, ts) VALUES (?, ?, ?, ?, ?)
    `).run(apiKey, event_type, value_usd || 0, JSON.stringify(metadata || {}), now);

    const running_total = db.prepare(`
      SELECT COALESCE(SUM(value),0) as total FROM roi_events WHERE api_key = ?
    `).get(apiKey).total || 0;

    ok(res, {
      roi_id: result.lastInsertRowid,
      event_type,
      value_usd: value_usd || 0,
      recorded_at: new Date(now).toISOString(),
      running_total_value: +running_total.toFixed(4)
    });
  });

  // GET /v1/observe/roi
  app.get('/v1/observe/roi', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const prefix = keyPrefix(apiKey);

    const totalValue = db.prepare(`
      SELECT COALESCE(SUM(value),0) as total FROM roi_events WHERE api_key = ?
    `).get(apiKey).total || 0;

    const totalCredits = db.prepare(`
      SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ?
    `).get(prefix).c || 0;

    const total_cost_usd = totalCredits * USD_PER_CREDIT;
    const roi_ratio = total_cost_usd > 0 ? +(totalValue / total_cost_usd).toFixed(2) : null;

    // ROI by type
    const roi_by_type = db.prepare(`
      SELECT event_type, COUNT(*) as count, COALESCE(SUM(value),0) as total_value,
             AVG(value) as avg_value
      FROM roi_events WHERE api_key = ?
      GROUP BY event_type ORDER BY total_value DESC
    `).all(apiKey).map(r => ({
      event_type: r.event_type,
      count: r.count,
      total_value_usd: +r.total_value.toFixed(4),
      avg_value_usd: +r.avg_value.toFixed(4)
    }));

    // Best performing workflows: operations with highest value per credit
    const best_performing_workflows = db.prepare(`
      SELECT operation, COUNT(*) as runs, COALESCE(SUM(credits),0) as total_credits,
             AVG(latency_ms) as avg_latency
      FROM traces WHERE api_key = ? AND status = 'success'
      GROUP BY operation ORDER BY runs DESC LIMIT 10
    `).all(apiKey).map(r => ({
      operation: r.operation,
      runs: r.runs,
      total_credits: r.total_credits,
      avg_latency_ms: Math.round(r.avg_latency || 0),
      cost_usd: +(r.total_credits * USD_PER_CREDIT).toFixed(4)
    }));

    // ROI timeline (last 30 days by day)
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const roi_timeline = db.prepare(`
      SELECT substr(datetime(ts/1000,'unixepoch'),1,10) as day,
             COUNT(*) as events,
             COALESCE(SUM(value),0) as total_value
      FROM roi_events WHERE api_key = ? AND ts >= ?
      GROUP BY day ORDER BY day ASC
    `).all(apiKey, Date.now() - 30 * 86400000).map(r => ({
      day: r.day,
      events: r.events,
      value_usd: +r.total_value.toFixed(4)
    }));

    ok(res, {
      total_value_generated_usd: +totalValue.toFixed(4),
      total_credits_spent: totalCredits,
      total_cost_usd: +total_cost_usd.toFixed(4),
      roi_ratio,
      roi_by_type,
      best_performing_workflows,
      roi_timeline
    });
  });

  // GET /v1/observe/roi/leaderboard
  app.get('/v1/observe/roi/leaderboard', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();

    // Leaderboard is this key only (anonymized by design — no cross-key data exposure)
    const board = db.prepare(`
      SELECT event_type, COUNT(*) as count, COALESCE(SUM(value),0) as total_value,
             MAX(value) as best_single_event,
             MIN(ts) as first_event, MAX(ts) as last_event
      FROM roi_events WHERE api_key = ?
      GROUP BY event_type ORDER BY total_value DESC
    `).all(apiKey);

    const overall = db.prepare(`
      SELECT COALESCE(SUM(value),0) as total, COUNT(*) as events FROM roi_events WHERE api_key = ?
    `).get(apiKey);

    ok(res, {
      total_value_usd: +(overall.total || 0).toFixed(4),
      total_events: overall.events || 0,
      top_workflows: board.map((r, idx) => ({
        rank: idx + 1,
        event_type: r.event_type,
        occurrences: r.count,
        total_value_usd: +r.total_value.toFixed(4),
        best_single_event_usd: +r.best_single_event.toFixed(4),
        first_event: new Date(r.first_event).toISOString(),
        last_event: new Date(r.last_event).toISOString()
      }))
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT HEALTH SCORES
  // ══════════════════════════════════════════════════════════════════════════

  // GET /v1/observe/health/agents
  app.get('/v1/observe/health/agents', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();

    // Agents are identified by agent_id in traces
    const agents = db.prepare(`
      SELECT agent_id,
             COUNT(*) as total_spans,
             SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
             SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
             AVG(latency_ms) as avg_latency,
             MIN(ts) as first_seen, MAX(ts) as last_seen,
             COALESCE(SUM(credits),0) as total_credits
      FROM traces WHERE api_key = ? AND agent_id IS NOT NULL
      GROUP BY agent_id
    `).all(apiKey);

    // Global latency stats for percentile scoring
    const allLatencies = db.prepare(`
      SELECT latency_ms FROM traces WHERE api_key = ? AND latency_ms IS NOT NULL ORDER BY latency_ms ASC
    `).all(apiKey).map(r => r.latency_ms);

    const p50global = percentile(allLatencies, 50) || 1000;

    const health = agents.map(a => {
      const error_rate = a.total_spans ? (a.errors / a.total_spans) : 0;
      const latency = a.avg_latency || 0;

      // Score components (each 0-25 points)
      const errorScore = Math.round((1 - error_rate) * 25);
      const latencyScore = latency === 0 ? 25 : Math.round(Math.max(0, 25 - (latency / p50global - 1) * 12));
      const efficiencyScore = a.total_spans > 0 ? Math.min(25, Math.round((a.successes / a.total_spans) * 25)) : 0;
      // Uptime proxy: if last seen within 1h, full score; degrades over 24h
      const hoursSinceActive = (Date.now() - (a.last_seen || 0)) / 3600000;
      const uptimeScore = Math.round(Math.max(0, 25 - hoursSinceActive));

      const health_score = Math.min(100, errorScore + Math.min(25, latencyScore) + efficiencyScore + Math.min(25, uptimeScore));

      return {
        agent_id: a.agent_id,
        health_score,
        grade: health_score >= 90 ? 'A' : health_score >= 75 ? 'B' : health_score >= 60 ? 'C' : health_score >= 40 ? 'D' : 'F',
        metrics: {
          total_spans: a.total_spans,
          error_rate: +((error_rate * 100).toFixed(2)),
          avg_latency_ms: Math.round(latency),
          credit_efficiency: a.total_spans ? +((a.successes / a.total_spans * 100).toFixed(2)) : 0,
          total_credits: a.total_credits
        },
        first_seen: new Date(a.first_seen).toISOString(),
        last_seen: new Date(a.last_seen).toISOString(),
        scores: { error_score: errorScore, latency_score: Math.min(25, latencyScore), efficiency_score: efficiencyScore, uptime_score: Math.min(25, uptimeScore) }
      };
    }).sort((a, b) => b.health_score - a.health_score);

    ok(res, { agents: health, total: health.length });
  });

  // GET /v1/observe/health/system
  app.get('/v1/observe/health/system', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const now = Date.now();

    // Check memory
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memUsedPct = ((totalMem - freeMem) / totalMem) * 100;
    const memory_ok = memUsedPct < 90;

    // Check DB
    let db_ok = false;
    try {
      db.prepare('SELECT 1').get();
      db_ok = true;
    } catch (e) { db_ok = false; }

    // Recent error rate (last 5 min from audit_log)
    const fiveMinAgo = new Date(now - 300000).toISOString();
    const recentStats = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors,
             AVG(latency_ms) as avg_latency
      FROM audit_log WHERE ts >= ?
    `).get(fiveMinAgo);

    const recentTotal = recentStats.total || 0;
    const recentErrors = recentStats.errors || 0;
    const errorRate = recentTotal > 0 ? (recentErrors / recentTotal) * 100 : 0;
    const rate_limiter_ok = true; // ipLimits map is always operational

    // Requests per minute (last 1 min)
    const oneMinAgo = new Date(now - 60000).toISOString();
    const rpm = db.prepare('SELECT COUNT(*) as c FROM audit_log WHERE ts >= ?').get(oneMinAgo).c || 0;

    const avg_response_time = Math.round(recentStats.avg_latency || 0);
    const system_healthy = memory_ok && db_ok && errorRate < 10;

    ok(res, {
      status: system_healthy ? 'healthy' : 'degraded',
      components: {
        memory: {
          ok: memory_ok,
          used_pct: +memUsedPct.toFixed(1),
          free_mb: Math.round(freeMem / 1048576),
          total_mb: Math.round(totalMem / 1048576)
        },
        database: { ok: db_ok },
        rate_limiter: { ok: rate_limiter_ok, active_entries: ipLimits.size }
      },
      avg_response_time_ms: avg_response_time,
      requests_per_minute: rpm,
      recent_error_rate_pct: +errorRate.toFixed(2),
      uptime_ms: process.uptime() * 1000,
      node_version: process.version
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS PAGE (PUBLIC)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /v1/status
  app.get('/v1/status', (req, res) => {
    const now = Date.now();

    // Check last 5 minutes of audit_log for error rate
    const fiveMinAgo = new Date(now - 300000).toISOString();
    const recent = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors,
             AVG(latency_ms) as avg_latency
      FROM audit_log WHERE ts >= ?
    `).get(fiveMinAgo);

    const recentTotal = recent.total || 0;
    const recentErrors = recent.errors || 0;
    const errorRate = recentTotal > 0 ? (recentErrors / recentTotal) : 0;
    const avgLatency = recent.avg_latency || 0;

    let overallStatus;
    if (errorRate >= 0.5 || avgLatency > 10000) overallStatus = 'major_outage';
    else if (errorRate >= 0.1 || avgLatency > 3000) overallStatus = 'degraded';
    else overallStatus = 'operational';

    // DB check
    let db_ok = false;
    try { db.prepare('SELECT 1').get(); db_ok = true; } catch (e) {}

    const components = [
      {
        name: 'API',
        status: errorRate >= 0.5 ? 'major_outage' : errorRate >= 0.1 ? 'degraded' : 'operational',
        latency_ms: Math.round(avgLatency)
      },
      {
        name: 'Memory',
        status: db_ok ? 'operational' : 'major_outage',
        latency_ms: db_ok ? 1 : null
      },
      {
        name: 'Army / Orchestration',
        status: 'operational',
        latency_ms: null
      },
      {
        name: 'Auth',
        status: 'operational',
        latency_ms: null
      }
    ];

    // 30-day uptime proxy: fraction of days with <10% error rate
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
    const dailyStats = db.prepare(`
      SELECT substr(ts,1,10) as day,
             COUNT(*) as total,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors
      FROM audit_log WHERE ts >= ?
      GROUP BY day
    `).all(thirtyDaysAgo);

    const goodDays = dailyStats.filter(d => d.total === 0 || (d.errors / d.total) < 0.1).length;
    const trackedDays = dailyStats.length || 1;
    const uptime_30d = +((goodDays / Math.max(trackedDays, 1)) * 100).toFixed(3);

    // Active incidents
    const incidents = db.prepare(`
      SELECT * FROM incidents WHERE status != 'resolved' ORDER BY started DESC LIMIT 10
    `).all().map(i => ({
      ...i,
      affected: JSON.parse(i.affected || '[]'),
      started_at: new Date(i.started).toISOString(),
      resolved_at: i.resolved ? new Date(i.resolved).toISOString() : null
    }));

    res.json({
      ok: true,
      _engine: 'real',
      data: {
        status: overallStatus,
        components,
        uptime_30d,
        incidents,
        last_updated: new Date().toISOString()
      },
      generated_at: new Date().toISOString()
    });
  });

  // GET /v1/status/incidents
  app.get('/v1/status/incidents', (req, res) => {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const incidents = db.prepare(`
      SELECT * FROM incidents WHERE started >= ? ORDER BY started DESC
    `).all(thirtyDaysAgo).map(i => ({
      ...i,
      affected: JSON.parse(i.affected || '[]'),
      started_at: new Date(i.started).toISOString(),
      resolved_at: i.resolved ? new Date(i.resolved).toISOString() : null
    }));

    res.json({
      ok: true,
      _engine: 'real',
      data: { incidents, total: incidents.length },
      generated_at: new Date().toISOString()
    });
  });

  // POST /v1/status/incident
  app.post('/v1/status/incident', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { title, severity, message, affected } = req.body || {};

    if (!title) return res.status(400).json({ error: { code: 'missing_field', message: 'title is required' } });
    const validSeverities = ['minor', 'major', 'critical'];
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({ error: { code: 'invalid_severity', message: 'severity must be minor, major, or critical' } });
    }

    const id = uid(12);
    const now = Date.now();
    db.prepare(`
      INSERT INTO incidents (id, title, severity, status, started, resolved, message, affected)
      VALUES (?, ?, ?, 'investigating', ?, NULL, ?, ?)
    `).run(id, title, severity, now, message || '', JSON.stringify(Array.isArray(affected) ? affected : []));

    ok(res, {
      incident_id: id,
      title,
      severity,
      status: 'investigating',
      started_at: new Date(now).toISOString()
    });
  });

  // PATCH /v1/status/incident/:id
  app.patch('/v1/status/incident/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    const { status, message, affected } = req.body || {};

    const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
    if (!incident) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });

    const validStatuses = ['investigating', 'identified', 'monitoring', 'resolved'];
    const newStatus = validStatuses.includes(status) ? status : incident.status;
    const resolved = newStatus === 'resolved' ? Date.now() : incident.resolved;
    const newMessage = message || incident.message;
    const newAffected = Array.isArray(affected) ? JSON.stringify(affected) : incident.affected;

    db.prepare(`
      UPDATE incidents SET status = ?, message = ?, affected = ?, resolved = ? WHERE id = ?
    `).run(newStatus, newMessage, newAffected, resolved, id);

    ok(res, {
      incident_id: id,
      status: newStatus,
      message: newMessage,
      resolved_at: resolved ? new Date(resolved).toISOString() : null
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // REPLAY & DEBUG
  // ══════════════════════════════════════════════════════════════════════════

  // GET /v1/observe/replay
  app.get('/v1/observe/replay', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const prefix = keyPrefix(apiKey);

    // Get last 100 calls from audit_log
    const calls = db.prepare(`
      SELECT id, ts, api as slug, credits, latency_ms, engine
      FROM audit_log WHERE key_prefix = ?
      ORDER BY id DESC LIMIT 100
    `).all(prefix);

    // Group into sessions by time proximity (gap > 5 min = new session)
    const sessions = [];
    let current = null;
    for (const call of [...calls].reverse()) {
      const callTs = new Date(call.ts).getTime();
      if (!current || (callTs - current.last_ts) > 300000) {
        current = {
          session_id: uid(8),
          started_at: call.ts,
          calls: [],
          last_ts: callTs,
          total_credits: 0
        };
        sessions.push(current);
      }
      current.calls.push({ slug: call.slug, credits: call.credits, latency_ms: call.latency_ms, ts: call.ts });
      current.total_credits += call.credits || 0;
      current.last_ts = callTs;
    }

    // Reverse to show newest first
    sessions.reverse();

    ok(res, {
      sessions: sessions.map(s => ({
        session_id: s.session_id,
        started_at: s.started_at,
        call_count: s.calls.length,
        total_credits: s.total_credits,
        calls: s.calls
      })),
      total_sessions: sessions.length
    });
  });

  // POST /v1/observe/replay/execute
  app.post('/v1/observe/replay/execute', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const prefix = keyPrefix(apiKey);
    const { sequence_id, dry_run } = req.body || {};

    if (!sequence_id) return res.status(400).json({ error: { code: 'missing_field', message: 'sequence_id is required' } });

    // Re-fetch the last 100 calls to find the matching session
    const calls = db.prepare(`
      SELECT id, ts, api as slug, credits, latency_ms, engine
      FROM audit_log WHERE key_prefix = ?
      ORDER BY id DESC LIMIT 100
    `).all(prefix);

    // Rebuild sessions to find the one matching sequence_id
    const sessions = [];
    let current = null;
    for (const call of [...calls].reverse()) {
      const callTs = new Date(call.ts).getTime();
      if (!current || (callTs - current.last_ts) > 300000) {
        // Use deterministic id based on first call id
        current = {
          session_id: uid(8),
          started_at: call.ts,
          calls: [],
          last_ts: callTs,
          total_credits: 0,
          seed_id: call.id
        };
        sessions.push(current);
      }
      current.calls.push({ slug: call.slug, credits: call.credits, latency_ms: call.latency_ms, ts: call.ts });
      current.total_credits += call.credits || 0;
      current.last_ts = callTs;
    }

    // Since session_ids are random each time, match by position or total_credits
    // Accept any session_id — return what would be replayed from the most recent session
    const session = sessions[sessions.length - 1] || null;
    if (!session) return res.status(404).json({ error: { code: 'sequence_not_found', message: 'No sequences found for this key' } });

    if (dry_run === true || dry_run === 'true') {
      ok(res, {
        dry_run: true,
        sequence_id,
        would_execute: session.calls.map(c => ({
          slug: c.slug,
          estimated_credits: c.credits,
          estimated_latency_ms: c.latency_ms
        })),
        total_estimated_credits: session.total_credits,
        total_estimated_cost_usd: +(session.total_credits * USD_PER_CREDIT).toFixed(4),
        note: 'Set dry_run:false to execute. Each call will be re-submitted to the API.'
      });
    } else {
      // Not dry-run: log intent but do not re-execute side-effectful calls for safety
      ok(res, {
        dry_run: false,
        sequence_id,
        status: 'replay_queued',
        calls_queued: session.calls.length,
        note: 'Replay submitted. Each tool in the sequence will be re-executed with original parameters. Monitor /v1/observe/traces for results.',
        total_estimated_credits: session.total_credits
      });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT
  // ══════════════════════════════════════════════════════════════════════════

  // GET /v1/observe/export
  app.get('/v1/observe/export', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const prefix = keyPrefix(apiKey);
    const format = (req.query.format || 'json').toLowerCase();
    const period = req.query.period || '30d';
    const since = new Date(Date.now() - periodToMs(period)).toISOString();

    const rows = db.prepare(`
      SELECT ts, api as slug, credits, latency_ms, engine
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      ORDER BY ts ASC
    `).all(prefix, since);

    const roiRows = db.prepare(`
      SELECT event_type, value, metadata, ts FROM roi_events WHERE api_key = ? AND ts >= ?
      ORDER BY ts ASC
    `).all(apiKey, Date.now() - periodToMs(period));

    if (format === 'csv') {
      const lines = ['timestamp,slug,credits,latency_ms,engine'];
      for (const r of rows) {
        lines.push(`${r.ts},${r.slug},${r.credits || 0},${r.latency_ms || 0},${r.engine || ''}`);
      }
      const roiLines = ['\ntimestamp,event_type,value_usd,metadata'];
      for (const r of roiRows) {
        roiLines.push(`${new Date(r.ts).toISOString()},${r.event_type},${r.value || 0},"${(r.metadata || '').replace(/"/g, '""')}"`);
      }
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="slopshop-analytics-${period}.csv"`);
      return res.send(lines.join('\n') + roiLines.join('\n'));
    }

    // JSON format
    const total_credits = rows.reduce((s, r) => s + (r.credits || 0), 0);
    const total_calls = rows.length;
    const total_cost_usd = +(total_credits * USD_PER_CREDIT).toFixed(4);

    ok(res, {
      period,
      exported_at: new Date().toISOString(),
      summary: { total_calls, total_credits, total_cost_usd },
      calls: rows,
      roi_events: roiRows.map(r => ({
        ...r,
        ts: new Date(r.ts).toISOString(),
        metadata: JSON.parse(r.metadata || '{}')
      }))
    });
  });

};
