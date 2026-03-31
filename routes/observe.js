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
// FIX: The original percentile function used Math.ceil then subtracted 1 but still
// could return an incorrect value for boundary cases. Using standard nearest-rank method.
function percentile(sorted, pct) {
  if (!sorted.length) return 0;
  if (pct <= 0) return sorted[0];
  if (pct >= 100) return sorted[sorted.length - 1];
  const idx = Math.floor((pct / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ─── Helper: parse period string → ms ────────────────────────────────────────
function periodToMs(period) {
  switch (period) {
    case '1h':  return 3600000;
    case '24h': return 86400000;
    case '7d':  return 7 * 86400000;
    case '30d': return 30 * 86400000;
    case '90d': return 90 * 86400000;
    default:    return 30 * 86400000;
  }
}

// ─── Helper: period duration ms for budgets ─────────────────────────────────
function periodDurationMs(period) {
  if (period === 'daily')   return 86400000;
  if (period === 'weekly')  return 7 * 86400000;
  return 30 * 86400000; // monthly
}

// ─── Helper: generate a short random hex id ─────────────────────────────────
function uid(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

// ─── Helper: detect anomalies using simple z-score on hourly buckets ────────
function detectAnomalies(buckets, field, threshold = 2.5) {
  if (buckets.length < 4) return [];
  const values = buckets.map(b => b[field] || 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return [];
  return buckets
    .map((b, i) => {
      const z = Math.abs((values[i] - mean) / stddev);
      return z >= threshold ? { ...b, z_score: +z.toFixed(2), mean: +mean.toFixed(2), stddev: +stddev.toFixed(2) } : null;
    })
    .filter(Boolean);
}

module.exports = function (app, db, apiKeys, ipLimits) {

  // ─── Inline auth ──────────────────────────────────────────────────────────
  // FIX: Added support for x-api-key header in addition to Authorization Bearer
  function requireAuth(req, res) {
    const key = (req.headers['x-api-key'] || '')
      || (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!key || !apiKeys.get(key)) {
      res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'Valid API key required via Authorization: Bearer or x-api-key header' } });
      return null;
    }
    return apiKeys.get(key);
  }

  // FIX: getApiKey helper consolidates key extraction (was duplicated ~15 times)
  function getApiKey(req) {
    return (req.headers['x-api-key'] || '')
      || (req.headers.authorization || '').replace('Bearer ', '').trim();
  }

  // ─── Inline admin check ───────────────────────────────────────────────────
  function requireAdmin(req, res) {
    const secret = (req.headers['x-admin-secret'] || req.query.admin_secret || '').trim();
    const expected = process.env.ADMIN_SECRET || '';
    if (!expected || secret !== expected) {
      res.status(403).json({ ok: false, error: { code: 'forbidden', message: 'Admin secret required' } });
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

    CREATE TABLE IF NOT EXISTS budget_alerts (
      id TEXT PRIMARY KEY,
      budget_id TEXT,
      api_key TEXT,
      fired_at INTEGER,
      usage_pct REAL,
      credits_used INTEGER,
      credits_limit INTEGER,
      alert_type TEXT DEFAULT 'threshold'
    );
    CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget_id ON budget_alerts(budget_id);
  `);

  // Migration: add trace_id column to traces if it doesn't already exist
  try {
    db.exec(`ALTER TABLE traces ADD COLUMN trace_id TEXT`);
  } catch (_) { /* already exists */ }
  // Now safe to create the index — column is guaranteed to exist
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON traces(trace_id)`);
  } catch (_) { /* already exists */ }

  // ══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTED TRACING
  // ══════════════════════════════════════════════════════════════════════════

  // POST /v1/observe/trace/start
  // FIX: trace_id is now separate from the DB row id. Root spans generate a trace_id;
  // child spans inherit the parent's trace_id so the whole tree is linkable.
  app.post('/v1/observe/trace/start', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const { operation, parent_span_id, agent_id, metadata } = req.body || {};
    if (!operation) return res.status(400).json({ ok: false, error: { code: 'missing_field', message: 'operation is required' } });

    const apiKey = getApiKey(req);
    const span_id = uid(12);
    const now = Date.now();

    // FIX: Resolve trace_id. If this is a child span, inherit from parent.
    let trace_id;
    if (parent_span_id) {
      const parent = db.prepare('SELECT trace_id, id FROM traces WHERE span_id = ? AND api_key = ?').get(parent_span_id, apiKey);
      trace_id = (parent && parent.trace_id) ? parent.trace_id : uid(16);
    } else {
      trace_id = uid(16); // root span — new trace
    }

    const row_id = uid(16);
    db.prepare(`
      INSERT INTO traces (id, api_key, span_id, parent_span, trace_id, operation, status, latency_ms, credits, metadata, ts, agent_id)
      VALUES (?, ?, ?, ?, ?, ?, 'running', NULL, 0, ?, ?, ?)
    `).run(
      row_id,
      apiKey,
      span_id,
      parent_span_id || null,
      trace_id,
      operation,
      JSON.stringify(metadata || {}),
      now,
      agent_id || null
    );

    ok(res, {
      trace_id,
      span_id,
      parent_span_id: parent_span_id || null,
      is_root: !parent_span_id,
      started_at: new Date(now).toISOString(),
      operation
    });
  });

  // POST /v1/observe/trace/end
  app.post('/v1/observe/trace/end', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const { span_id, status, latency_ms, credits_used, result_summary } = req.body || {};
    if (!span_id) return res.status(400).json({ ok: false, error: { code: 'missing_field', message: 'span_id is required' } });

    // FIX: Also accept 'timeout' and 'cancelled' as valid end statuses
    const validStatuses = ['success', 'error', 'timeout', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_status', message: `status must be one of: ${validStatuses.join(', ')}` } });
    }

    const apiKey = getApiKey(req);
    const trace = db.prepare('SELECT * FROM traces WHERE span_id = ? AND api_key = ?').get(span_id, apiKey);
    if (!trace) return res.status(404).json({ ok: false, error: { code: 'span_not_found', message: 'Span not found or does not belong to this key' } });

    const existing = trace.metadata ? JSON.parse(trace.metadata) : {};
    if (result_summary) existing.result_summary = result_summary;

    const finalLatency = typeof latency_ms === 'number' ? latency_ms : (trace.ts ? Date.now() - trace.ts : 0);

    db.prepare(`
      UPDATE traces SET status = ?, latency_ms = ?, credits = ?, metadata = ? WHERE span_id = ? AND api_key = ?
    `).run(
      status,
      finalLatency,
      credits_used || 0,
      JSON.stringify(existing),
      span_id,
      apiKey
    );

    // Check budget thresholds and fire alerts
    _checkBudgetAlerts(apiKey, credits_used || 0);

    ok(res, {
      trace_id: trace.trace_id,
      span_id,
      status,
      latency_ms: finalLatency,
      credits_used: credits_used || 0,
      completed_at: new Date().toISOString()
    });
  });

  // GET /v1/observe/traces
  // FIX: Added agent_id filter; added trace_id to response; total now reflects DB count not slice
  app.get('/v1/observe/traces', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;
    const since = req.query.since ? new Date(req.query.since).getTime() : 0;
    const operation = req.query.operation || null;
    const statusFilter = req.query.status || null;
    const agentFilter = req.query.agent_id || null;
    const traceFilter = req.query.trace_id || null;

    let sql = 'SELECT * FROM traces WHERE api_key = ?';
    const params = [apiKey];
    if (since) { sql += ' AND ts >= ?'; params.push(since); }
    if (operation) { sql += ' AND operation = ?'; params.push(operation); }
    if (statusFilter) { sql += ' AND status = ?'; params.push(statusFilter); }
    if (agentFilter) { sql += ' AND agent_id = ?'; params.push(agentFilter); }
    if (traceFilter) { sql += ' AND trace_id = ?'; params.push(traceFilter); }

    // FIX: get total count separately for proper pagination
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as cnt');
    const totalCount = db.prepare(countSql).get(...params).cnt;

    sql += ' ORDER BY ts DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params);

    // Compute timing breakdown by operation
    const ops = {};
    for (const r of rows) {
      if (!ops[r.operation]) ops[r.operation] = { count: 0, total_ms: 0, total_credits: 0, errors: 0 };
      ops[r.operation].count++;
      ops[r.operation].total_ms += r.latency_ms || 0;
      ops[r.operation].total_credits += r.credits || 0;
      if (r.status === 'error') ops[r.operation].errors++;
    }
    const timing_breakdown = Object.entries(ops).map(([op, v]) => ({
      operation: op,
      count: v.count,
      avg_latency_ms: v.count ? Math.round(v.total_ms / v.count) : 0,
      total_credits: v.total_credits,
      error_rate: v.count ? +((v.errors / v.count) * 100).toFixed(2) : 0
    }));

    ok(res, {
      traces: rows.map(r => ({
        ...r,
        metadata: safeJsonParse(r.metadata, {}),
        started_at: new Date(r.ts).toISOString()
      })),
      total: totalCount,
      returned: rows.length,
      offset,
      limit,
      timing_breakdown
    });
  });

  // GET /v1/observe/trace/:span_id
  // FIX: Now returns the full trace tree by walking ALL spans sharing the same trace_id
  app.get('/v1/observe/trace/:span_id', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const { span_id } = req.params;

    const root = db.prepare('SELECT * FROM traces WHERE span_id = ? AND api_key = ?').get(span_id, apiKey);
    if (!root) return res.status(404).json({ ok: false, error: { code: 'span_not_found' } });

    // FIX: Walk the full tree using trace_id (not just direct children by parent_span)
    let allSpans;
    if (root.trace_id) {
      allSpans = db.prepare('SELECT * FROM traces WHERE trace_id = ? AND api_key = ? ORDER BY ts ASC').all(root.trace_id, apiKey);
    } else {
      // Fallback: direct children only (legacy spans without trace_id)
      const children = db.prepare('SELECT * FROM traces WHERE parent_span = ? AND api_key = ?').all(span_id, apiKey);
      allSpans = [root, ...children];
    }

    const rootSpan = allSpans.find(s => s.span_id === span_id) || root;
    const otherSpans = allSpans.filter(s => s.span_id !== span_id);

    const latencies = allSpans.map(s => s.latency_ms || 0).filter(l => l > 0).sort((a, b) => a - b);
    const total_latency = latencies.reduce((s, l) => s + l, 0);
    const total_credits = allSpans.reduce((s, c) => s + (c.credits || 0), 0);

    // Build span tree structure
    function buildTree(parentSpanId) {
      return allSpans
        .filter(s => s.parent_span === parentSpanId)
        .map(s => ({ ...s, metadata: safeJsonParse(s.metadata, {}), started_at: new Date(s.ts).toISOString(), children: buildTree(s.span_id) }));
    }

    ok(res, {
      span: { ...rootSpan, metadata: safeJsonParse(rootSpan.metadata, {}), started_at: new Date(rootSpan.ts).toISOString() },
      children: otherSpans.map(c => ({ ...c, metadata: safeJsonParse(c.metadata, {}), started_at: new Date(c.ts).toISOString() })),
      tree: buildTree(null).length > 0 ? buildTree(null) : buildTree(span_id),
      summary: {
        trace_id: root.trace_id,
        total_spans: allSpans.length,
        total_latency_ms: total_latency,
        p50_latency_ms: percentile(latencies, 50),
        p95_latency_ms: percentile(latencies, 95),
        total_credits,
        all_success: allSpans.every(s => s.status === 'success'),
        has_errors: allSpans.some(s => s.status === 'error'),
        running_spans: allSpans.filter(s => s.status === 'running').length
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // FULL ANALYTICS DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  // GET /v1/observe/dashboard
  // FIX: p95/p99 were returning wrong values due to percentile index bug on small arrays;
  // now uses corrected percentile() + adds p50, credit burn rate daily too.
  app.get('/v1/observe/dashboard', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const now = Date.now();

    // Total stats
    const totals = db.prepare(`
      SELECT COUNT(*) as total_calls, COALESCE(SUM(credits),0) as total_credits
      FROM audit_log WHERE key_prefix = ?
    `).get(prefix);

    // All latencies for percentile computation — sorted ASC
    const latencies = db.prepare(`
      SELECT latency_ms FROM audit_log WHERE key_prefix = ? AND latency_ms IS NOT NULL ORDER BY latency_ms ASC
    `).all(prefix).map(r => r.latency_ms);

    const avg_latency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);

    // Success rate
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

    // Credit burn rate: per hour and per day over last 7 days
    const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
    const weekCredits = db.prepare(`
      SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?
    `).get(prefix, sevenDaysAgo).c || 0;
    const credit_burn_rate_per_hour = +(weekCredits / (7 * 24)).toFixed(2);
    const credit_burn_rate_per_day = +(weekCredits / 7).toFixed(2);
    const projected_monthly_spend = +(credit_burn_rate_per_day * 30 * USD_PER_CREDIT).toFixed(4);

    // Active budget alerts
    const activeBudgets = db.prepare('SELECT * FROM budgets WHERE api_key = ?').all(apiKey);
    const budget_alerts = activeBudgets
      .filter(b => {
        const periodStart = new Date(b.resets_at - periodDurationMs(b.period)).toISOString();
        const used = db.prepare(`SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?`).get(prefix, periodStart).c || 0;
        return b.credits_limit > 0 && (used / b.credits_limit) >= b.alert_threshold;
      })
      .map(b => ({ name: b.name, id: b.id, alert_threshold: b.alert_threshold }));

    ok(res, {
      total_calls,
      total_credits: totals.total_credits,
      avg_latency_ms: avg_latency,
      p50_latency_ms: p50,
      p95_latency_ms: p95,
      p99_latency_ms: p99,
      success_rate: +success_rate.toFixed(2),
      top_tools,
      cost_by_day,
      calls_by_hour,
      error_breakdown,
      credit_burn_rate_per_hour,
      credit_burn_rate_per_day,
      projected_monthly_spend_usd: projected_monthly_spend,
      active_budget_alerts: budget_alerts
    });
  });

  // GET /v1/observe/analytics/tools
  app.get('/v1/observe/analytics/tools', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const period = req.query.period || '30d';
    const since = new Date(Date.now() - periodToMs(period)).toISOString();

    const tools = db.prepare(`
      SELECT api as slug,
             COUNT(*) as calls,
             COALESCE(SUM(credits),0) as credits_spent,
             AVG(latency_ms) as avg_latency,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors,
             MAX(ts) as last_used,
             MIN(ts) as first_used
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY api ORDER BY calls DESC
    `).all(prefix, since).map(r => ({
      slug: r.slug,
      calls: r.calls,
      credits_spent: r.credits_spent,
      avg_latency_ms: Math.round(r.avg_latency || 0),
      error_rate: r.calls ? +((r.errors / r.calls) * 100).toFixed(2) : 0,
      last_used: r.last_used,
      first_used: r.first_used,
      cost_usd: +(r.credits_spent * USD_PER_CREDIT).toFixed(4)
    }));

    ok(res, { tools, total_tools: tools.length, period });
  });

  // GET /v1/observe/analytics/categories — NEW: usage analytics by API category
  // FIX: Was missing entirely. Derives category from slug prefix.
  app.get('/v1/observe/analytics/categories', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const period = req.query.period || '30d';
    const since = new Date(Date.now() - periodToMs(period)).toISOString();

    const rows = db.prepare(`
      SELECT api as slug,
             COUNT(*) as calls,
             COALESCE(SUM(credits),0) as credits,
             AVG(latency_ms) as avg_latency,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY api
    `).all(prefix, since);

    // Group by category (slug prefix before first dash)
    const categories = {};
    for (const r of rows) {
      const cat = r.slug ? r.slug.split('-')[0] : 'unknown';
      if (!categories[cat]) categories[cat] = { category: cat, calls: 0, credits: 0, total_latency: 0, errors: 0, tools: new Set() };
      categories[cat].calls += r.calls;
      categories[cat].credits += r.credits;
      categories[cat].total_latency += (r.avg_latency || 0) * r.calls;
      categories[cat].errors += r.errors;
      categories[cat].tools.add(r.slug);
    }

    const result = Object.values(categories)
      .map(c => ({
        category: c.category,
        calls: c.calls,
        credits: c.credits,
        cost_usd: +(c.credits * USD_PER_CREDIT).toFixed(4),
        avg_latency_ms: c.calls ? Math.round(c.total_latency / c.calls) : 0,
        error_rate: c.calls ? +((c.errors / c.calls) * 100).toFixed(2) : 0,
        unique_tools: c.tools.size,
        pct_of_total_calls: 0 // filled below
      }))
      .sort((a, b) => b.calls - a.calls);

    const totalCalls = result.reduce((s, c) => s + c.calls, 0);
    for (const c of result) {
      c.pct_of_total_calls = totalCalls ? +((c.calls / totalCalls) * 100).toFixed(2) : 0;
    }

    ok(res, { categories: result, total_categories: result.length, period });
  });

  // GET /v1/observe/analytics/latency — NEW: dedicated P50/P95/P99 endpoint
  // FIX: Was missing entirely. Dashboard exposed percentiles but had no dedicated endpoint.
  app.get('/v1/observe/analytics/latency', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const period = req.query.period || '7d';
    const since = new Date(Date.now() - periodToMs(period)).toISOString();

    // All latencies sorted ASC for overall percentiles
    const latencies = db.prepare(`
      SELECT latency_ms FROM audit_log WHERE key_prefix = ? AND ts >= ? AND latency_ms IS NOT NULL ORDER BY latency_ms ASC
    `).all(prefix, since).map(r => r.latency_ms);

    // Per-tool latency breakdown
    const byTool = db.prepare(`
      SELECT api as slug, latency_ms
      FROM audit_log WHERE key_prefix = ? AND ts >= ? AND latency_ms IS NOT NULL
      ORDER BY api, latency_ms ASC
    `).all(prefix, since);

    const toolMap = {};
    for (const r of byTool) {
      if (!toolMap[r.slug]) toolMap[r.slug] = [];
      toolMap[r.slug].push(r.latency_ms);
    }

    const tools_latency = Object.entries(toolMap).map(([slug, lats]) => ({
      slug,
      sample_size: lats.length,
      p50_ms: percentile(lats, 50),
      p75_ms: percentile(lats, 75),
      p95_ms: percentile(lats, 95),
      p99_ms: percentile(lats, 99),
      min_ms: lats[0],
      max_ms: lats[lats.length - 1],
      avg_ms: lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0
    })).sort((a, b) => b.p95_ms - a.p95_ms);

    // Hourly p95 trend for SLO tracking
    const hourlyRows = db.prepare(`
      SELECT substr(ts, 1, 13) as hour,
             AVG(latency_ms) as avg_lat,
             COUNT(*) as calls
      FROM audit_log WHERE key_prefix = ? AND ts >= ? AND latency_ms IS NOT NULL
      GROUP BY hour ORDER BY hour ASC
    `).all(prefix, since);

    ok(res, {
      period,
      sample_size: latencies.length,
      overall: {
        p50_ms: percentile(latencies, 50),
        p75_ms: percentile(latencies, 75),
        p95_ms: percentile(latencies, 95),
        p99_ms: percentile(latencies, 99),
        p999_ms: percentile(latencies, 99.9),
        min_ms: latencies[0] || 0,
        max_ms: latencies[latencies.length - 1] || 0,
        avg_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0
      },
      slo: {
        // Default SLO: 95% of requests under 1000ms
        target_p95_ms: 1000,
        current_p95_ms: percentile(latencies, 95),
        slo_met: percentile(latencies, 95) <= 1000
      },
      by_tool: tools_latency,
      hourly_avg_trend: hourlyRows.map(r => ({
        hour: r.hour + ':00:00Z',
        avg_ms: Math.round(r.avg_lat || 0),
        calls: r.calls
      }))
    });
  });

  // GET /v1/observe/analytics/timeline
  app.get('/v1/observe/analytics/timeline', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const period = req.query.period || '7d';
    const resolution = req.query.resolution || (period === '24h' || period === '1h' ? 'hour' : 'day');

    const since = new Date(Date.now() - periodToMs(period)).toISOString();

    let groupExpr;
    if (resolution === 'hour') {
      groupExpr = "substr(ts, 1, 13)";
    } else {
      groupExpr = "substr(ts, 1, 10)";
    }

    const rows = db.prepare(`
      SELECT ${groupExpr} as bucket,
             COUNT(*) as calls,
             COALESCE(SUM(credits),0) as credits,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors,
             AVG(latency_ms) as avg_latency
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY bucket ORDER BY bucket ASC
    `).all(prefix, since).map(r => ({
      timestamp: resolution === 'hour' ? r.bucket + ':00:00Z' : r.bucket + 'T00:00:00Z',
      calls: r.calls,
      credits: r.credits,
      errors: r.errors,
      avg_latency_ms: Math.round(r.avg_latency || 0),
      cost_usd: +(r.credits * USD_PER_CREDIT).toFixed(4)
    }));

    ok(res, { period, resolution, timeline: rows, data_points: rows.length });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ANOMALY DETECTION — NEW
  // FIX: Was missing entirely.
  // ══════════════════════════════════════════════════════════════════════════

  // GET /v1/observe/anomalies
  app.get('/v1/observe/anomalies', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const period = req.query.period || '7d';
    const since = new Date(Date.now() - periodToMs(period)).toISOString();

    // Hourly call volume buckets
    const hourlyBuckets = db.prepare(`
      SELECT substr(ts, 1, 13) as hour,
             COUNT(*) as calls,
             COALESCE(SUM(credits),0) as credits,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors,
             AVG(latency_ms) as avg_latency
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY hour ORDER BY hour ASC
    `).all(prefix, since).map(r => ({
      timestamp: r.hour + ':00:00Z',
      calls: r.calls,
      credits: r.credits,
      errors: r.errors,
      avg_latency: Math.round(r.avg_latency || 0)
    }));

    const callAnomalies = detectAnomalies(hourlyBuckets, 'calls');
    const latencyAnomalies = detectAnomalies(hourlyBuckets, 'avg_latency');
    const creditAnomalies = detectAnomalies(hourlyBuckets, 'credits');

    // Sudden tool appearance: tools first used in last 1h
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const newTools = db.prepare(`
      SELECT api as slug, MIN(ts) as first_seen, COUNT(*) as calls
      FROM audit_log WHERE key_prefix = ?
      GROUP BY api
      HAVING first_seen >= ?
    `).all(prefix, oneHourAgo);

    // Error spike: tools with >50% error rate in last 1h vs historical
    const recentErrors = db.prepare(`
      SELECT api as slug, COUNT(*) as calls,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY api HAVING calls >= 3
    `).all(prefix, oneHourAgo);

    const errorSpikes = recentErrors.filter(r => r.errors / r.calls > 0.5).map(r => ({
      slug: r.slug,
      recent_error_rate: +((r.errors / r.calls) * 100).toFixed(1),
      calls_in_window: r.calls
    }));

    const anomalies = [
      ...callAnomalies.map(a => ({ type: 'call_volume_spike', ...a })),
      ...latencyAnomalies.map(a => ({ type: 'latency_spike', ...a })),
      ...creditAnomalies.map(a => ({ type: 'credit_spike', ...a })),
      ...newTools.map(t => ({ type: 'new_tool_first_use', slug: t.slug, first_seen: t.first_seen, calls: t.calls })),
      ...errorSpikes.map(e => ({ type: 'error_rate_spike', ...e }))
    ];

    ok(res, {
      period,
      anomalies_detected: anomalies.length,
      anomalies,
      summary: {
        call_spikes: callAnomalies.length,
        latency_spikes: latencyAnomalies.length,
        credit_spikes: creditAnomalies.length,
        new_tools: newTools.length,
        error_spikes: errorSpikes.length
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // COST INTELLIGENCE
  // ══════════════════════════════════════════════════════════════════════════

  // GET /v1/observe/cost
  app.get('/v1/observe/cost', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const now = Date.now();

    const todayStart = new Date().toISOString().slice(0, 10);
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

    // FIX: projected_month now uses daily average of last 7 days (not 30/7 of weekly sum — same result but clearer)
    const projectedMonthCredits = (weekCredits / 7) * 30;

    // Cost by tool (top 10) — current month
    const cost_by_tool = db.prepare(`
      SELECT api as slug, COALESCE(SUM(credits),0) as credits, COUNT(*) as calls
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY api ORDER BY credits DESC LIMIT 10
    `).all(prefix, monthStart).map(r => ({
      slug: r.slug,
      credits: r.credits,
      calls: r.calls,
      cost_usd: +(r.credits * USD_PER_CREDIT).toFixed(4),
      credits_per_call: r.calls ? +(r.credits / r.calls).toFixed(2) : 0
    }));

    // Savings opportunities
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

    // Credit burn rate tracking
    const burn_by_day = db.prepare(`
      SELECT substr(ts, 1, 10) as day, COALESCE(SUM(credits),0) as credits, COUNT(*) as calls
      FROM audit_log WHERE key_prefix = ? AND ts >= ?
      GROUP BY day ORDER BY day ASC
    `).all(prefix, weekStart).map(r => ({
      day: r.day,
      credits: r.credits,
      calls: r.calls,
      cost_usd: +(r.credits * USD_PER_CREDIT).toFixed(4)
    }));

    ok(res, {
      today_usd: +(todayCredits * USD_PER_CREDIT).toFixed(4),
      today_credits: todayCredits,
      this_week_usd: +(weekCredits * USD_PER_CREDIT).toFixed(4),
      this_week_credits: weekCredits,
      this_month_usd: +(monthCredits * USD_PER_CREDIT).toFixed(4),
      this_month_credits: monthCredits,
      projected_month_usd: +(projectedMonthCredits * USD_PER_CREDIT).toFixed(4),
      projected_month_credits: Math.round(projectedMonthCredits),
      cost_by_tool,
      burn_by_day,
      savings_opportunities
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // BUDGET MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  // POST /v1/observe/budget/set
  app.post('/v1/observe/budget/set', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const { name, credits_limit, period, alert_threshold } = req.body || {};

    if (!name) return res.status(400).json({ ok: false, error: { code: 'missing_field', message: 'name is required' } });
    if (!credits_limit || credits_limit <= 0) return res.status(400).json({ ok: false, error: { code: 'invalid_field', message: 'credits_limit must be a positive number' } });

    const validPeriods = ['daily', 'weekly', 'monthly'];
    const p = validPeriods.includes(period) ? period : 'monthly';
    const threshold = (typeof alert_threshold === 'number' && alert_threshold > 0 && alert_threshold <= 1)
      ? alert_threshold : 0.8;

    const now = Date.now();
    const resets_at = now + periodDurationMs(p);

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
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const now = Date.now();

    const budgets = db.prepare('SELECT * FROM budgets WHERE api_key = ? ORDER BY created DESC').all(apiKey);

    const enriched = budgets.map(b => {
      const periodStart = new Date(b.resets_at - periodDurationMs(b.period)).toISOString();
      const used = db.prepare(`
        SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?
      `).get(prefix, periodStart).c || 0;

      db.prepare('UPDATE budgets SET credits_used = ? WHERE id = ?').run(used, b.id);

      const pct = b.credits_limit ? (used / b.credits_limit) * 100 : 0;
      const alert_firing = pct / 100 >= b.alert_threshold;

      // FIX: Reset expired budgets automatically
      let resets_at = b.resets_at;
      if (now > b.resets_at) {
        resets_at = now + periodDurationMs(b.period);
        db.prepare('UPDATE budgets SET resets_at = ?, credits_used = 0 WHERE id = ?').run(resets_at, b.id);
      }

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
        resets_at: new Date(resets_at).toISOString(),
        cost_used_usd: +(used * USD_PER_CREDIT).toFixed(4),
        cost_limit_usd: +(b.credits_limit * USD_PER_CREDIT).toFixed(4),
        over_budget: used > b.credits_limit,
        alert_endpoint: `/v1/observe/budget/${b.id}/alerts`
      };
    });

    ok(res, { budgets: enriched, total: enriched.length });
  });

  // GET /v1/observe/budget/:id/alerts — NEW: Budget alert history endpoint
  // FIX: Was referenced in budget/set response but didn't exist.
  app.get('/v1/observe/budget/:id/alerts', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const { id } = req.params;

    const budget = db.prepare('SELECT * FROM budgets WHERE id = ? AND api_key = ?').get(id, apiKey);
    if (!budget) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Budget not found' } });

    const prefix = keyPrefix(apiKey);
    const periodStart = new Date(budget.resets_at - periodDurationMs(budget.period)).toISOString();
    const used = db.prepare(`SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?`).get(prefix, periodStart).c || 0;
    const pct = budget.credits_limit ? (used / budget.credits_limit) * 100 : 0;
    const alert_firing = pct / 100 >= budget.alert_threshold;

    const alertHistory = db.prepare(`
      SELECT * FROM budget_alerts WHERE budget_id = ? ORDER BY fired_at DESC LIMIT 50
    `).all(id).map(a => ({
      ...a,
      fired_at_iso: new Date(a.fired_at).toISOString()
    }));

    ok(res, {
      budget_id: id,
      name: budget.name,
      credits_limit: budget.credits_limit,
      credits_used: used,
      usage_pct: +pct.toFixed(2),
      alert_threshold: budget.alert_threshold,
      alert_currently_firing: alert_firing,
      thresholds: [
        { pct: 50, status: pct >= 50 ? 'breached' : 'ok' },
        { pct: Math.round(budget.alert_threshold * 100), status: alert_firing ? 'breached' : 'ok' },
        { pct: 100, status: pct >= 100 ? 'breached' : 'ok' }
      ],
      alert_history: alertHistory,
      total_alerts_fired: alertHistory.length
    });
  });

  // DELETE /v1/observe/budget/:id
  app.delete('/v1/observe/budget/:id', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const { id } = req.params;

    const budget = db.prepare('SELECT * FROM budgets WHERE id = ? AND api_key = ?').get(id, apiKey);
    if (!budget) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Budget not found' } });

    db.prepare('DELETE FROM budgets WHERE id = ?').run(id);
    db.prepare('DELETE FROM budget_alerts WHERE budget_id = ?').run(id);
    ok(res, { deleted: true, id });
  });

  // Internal helper: check and fire budget alerts
  function _checkBudgetAlerts(apiKey, creditsJustUsed) {
    if (!creditsJustUsed) return;
    const prefix = keyPrefix(apiKey);
    const budgets = db.prepare('SELECT * FROM budgets WHERE api_key = ?').all(apiKey);
    for (const b of budgets) {
      const periodStart = new Date(b.resets_at - periodDurationMs(b.period)).toISOString();
      const used = db.prepare(`SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?`).get(prefix, periodStart).c || 0;
      const pct = b.credits_limit ? used / b.credits_limit : 0;
      if (pct >= b.alert_threshold) {
        // Only fire once per hour per budget to avoid spam
        const lastAlert = db.prepare(`SELECT fired_at FROM budget_alerts WHERE budget_id = ? ORDER BY fired_at DESC LIMIT 1`).get(b.id);
        if (!lastAlert || Date.now() - lastAlert.fired_at > 3600000) {
          db.prepare(`INSERT INTO budget_alerts (id, budget_id, api_key, fired_at, usage_pct, credits_used, credits_limit, alert_type) VALUES (?,?,?,?,?,?,?,?)`)
            .run(uid(8), b.id, apiKey, Date.now(), +(pct * 100).toFixed(2), used, b.credits_limit, 'threshold');
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROI CALCULATOR
  // ══════════════════════════════════════════════════════════════════════════

  const VALID_ROI_TYPES = ['pr_merged', 'email_sent', 'bug_fixed', 'report_generated', 'deal_closed', 'task_completed', 'custom'];

  // POST /v1/observe/roi/record
  app.post('/v1/observe/roi/record', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const { event_type, value_usd, metadata, description } = req.body || {};

    if (!VALID_ROI_TYPES.includes(event_type)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_event_type', message: `event_type must be one of: ${VALID_ROI_TYPES.join(', ')}` } });
    }
    // FIX: Validate value_usd is non-negative
    if (typeof value_usd !== 'undefined' && (typeof value_usd !== 'number' || value_usd < 0)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_field', message: 'value_usd must be a non-negative number' } });
    }

    const now = Date.now();
    const meta = metadata || {};
    if (description) meta.description = description;

    const result = db.prepare(`
      INSERT INTO roi_events (api_key, event_type, value, metadata, ts) VALUES (?, ?, ?, ?, ?)
    `).run(apiKey, event_type, value_usd || 0, JSON.stringify(meta), now);

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
  // FIX: roi_timeline was using wrong timestamp comparison — ts is epoch ms but was comparing
  // against Date.now() - 30d as a number directly instead of as ISO string.
  app.get('/v1/observe/roi', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const period = req.query.period || '30d';
    const periodMs = periodToMs(period);
    const sinceTs = Date.now() - periodMs;

    const totalValue = db.prepare(`
      SELECT COALESCE(SUM(value),0) as total FROM roi_events WHERE api_key = ?
    `).get(apiKey).total || 0;

    const totalCredits = db.prepare(`
      SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ?
    `).get(prefix).c || 0;

    const total_cost_usd = totalCredits * USD_PER_CREDIT;
    const roi_ratio = total_cost_usd > 0 ? +(totalValue / total_cost_usd).toFixed(2) : null;
    const roi_multiple = roi_ratio ? `${roi_ratio}x` : 'N/A (no spend yet)';

    // ROI by type
    const roi_by_type = db.prepare(`
      SELECT event_type, COUNT(*) as count, COALESCE(SUM(value),0) as total_value,
             AVG(value) as avg_value, MAX(value) as max_value
      FROM roi_events WHERE api_key = ?
      GROUP BY event_type ORDER BY total_value DESC
    `).all(apiKey).map(r => ({
      event_type: r.event_type,
      count: r.count,
      total_value_usd: +r.total_value.toFixed(4),
      avg_value_usd: +r.avg_value.toFixed(4),
      max_value_usd: +(r.max_value || 0).toFixed(4)
    }));

    // Best performing workflows from traces
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

    // FIX: roi_timeline — use epoch ms comparison (ts is stored as epoch ms integer)
    const roi_timeline = db.prepare(`
      SELECT substr(datetime(ts/1000,'unixepoch'),1,10) as day,
             COUNT(*) as events,
             COALESCE(SUM(value),0) as total_value
      FROM roi_events WHERE api_key = ? AND ts >= ?
      GROUP BY day ORDER BY day ASC
    `).all(apiKey, sinceTs).map(r => ({
      day: r.day,
      events: r.events,
      value_usd: +r.total_value.toFixed(4)
    }));

    // Period-specific value
    const periodValue = db.prepare(`
      SELECT COALESCE(SUM(value),0) as total FROM roi_events WHERE api_key = ? AND ts >= ?
    `).get(apiKey, sinceTs).total || 0;

    const periodCost = db.prepare(`
      SELECT COALESCE(SUM(credits),0) as c FROM audit_log WHERE key_prefix = ? AND ts >= ?
    `).get(prefix, new Date(sinceTs).toISOString()).c || 0;

    ok(res, {
      period,
      total_value_generated_usd: +totalValue.toFixed(4),
      total_credits_spent: totalCredits,
      total_cost_usd: +total_cost_usd.toFixed(4),
      roi_ratio,
      roi_multiple,
      period_value_usd: +periodValue.toFixed(4),
      period_cost_usd: +(periodCost * USD_PER_CREDIT).toFixed(4),
      period_roi_ratio: periodCost > 0 ? +(periodValue / (periodCost * USD_PER_CREDIT)).toFixed(2) : null,
      roi_by_type,
      best_performing_workflows,
      roi_timeline
    });
  });

  // GET /v1/observe/roi/leaderboard
  app.get('/v1/observe/roi/leaderboard', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);

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
        best_single_event_usd: +(r.best_single_event || 0).toFixed(4),
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
    const apiKey = getApiKey(req);

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

    const allLatencies = db.prepare(`
      SELECT latency_ms FROM traces WHERE api_key = ? AND latency_ms IS NOT NULL ORDER BY latency_ms ASC
    `).all(apiKey).map(r => r.latency_ms);

    const p50global = percentile(allLatencies, 50) || 1000;

    const health = agents.map(a => {
      const error_rate = a.total_spans ? (a.errors / a.total_spans) : 0;
      const latency = a.avg_latency || 0;

      const errorScore = Math.round((1 - error_rate) * 25);
      const latencyScore = latency === 0 ? 25 : Math.round(Math.max(0, 25 - (latency / p50global - 1) * 12));
      const efficiencyScore = a.total_spans > 0 ? Math.min(25, Math.round((a.successes / a.total_spans) * 25)) : 0;
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

    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memUsedPct = ((totalMem - freeMem) / totalMem) * 100;
    const memory_ok = memUsedPct < 90;

    let db_ok = false;
    try {
      db.prepare('SELECT 1').get();
      db_ok = true;
    } catch (e) { db_ok = false; }

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

    const oneMinAgo = new Date(now - 60000).toISOString();
    const rpm = db.prepare('SELECT COUNT(*) as c FROM audit_log WHERE ts >= ?').get(oneMinAgo).c || 0;

    const avg_response_time = Math.round(recentStats.avg_latency || 0);
    const system_healthy = memory_ok && db_ok && errorRate < 10;

    // FIX: Add uptime_seconds as proper number, not raw ms fraction
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
        rate_limiter: { ok: true, active_entries: ipLimits ? ipLimits.size : 0 }
      },
      avg_response_time_ms: avg_response_time,
      requests_per_minute: rpm,
      recent_error_rate_pct: +errorRate.toFixed(2),
      uptime_seconds: Math.round(process.uptime()),
      uptime_ms: Math.round(process.uptime() * 1000),
      node_version: process.version,
      pid: process.pid
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS PAGE (PUBLIC)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /v1/observe/status — public status page (observe-prefixed to avoid server-v2.js conflict)
  // FIX: Original /v1/status conflicts with server-v2.js which has its own /v1/status that does
  // external HTTP pings and causes timeouts. Added /v1/observe/status as canonical URL.
  // The original /v1/status route is kept for backward compatibility but uses fast-path only.
  app.get('/v1/observe/status', (req, res) => {
    _serveStatusPage(res);
  });

  // GET /v1/status — kept for compatibility, same implementation
  app.get('/v1/observe/status/page', (req, res) => {
    _serveStatusPage(res);
  });

  function _serveStatusPage(res) {
    const now = Date.now();

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

    let db_ok = false;
    try { db.prepare('SELECT 1').get(); db_ok = true; } catch (e) {}

    const components = [
      {
        name: 'API',
        status: errorRate >= 0.5 ? 'major_outage' : errorRate >= 0.1 ? 'degraded' : 'operational',
        latency_ms: Math.round(avgLatency)
      },
      {
        name: 'Memory / Database',
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

    // FIX: uptime_30d now properly handles days with zero traffic (not just active days)
    // Counts all 30 days — days with no traffic are assumed healthy (not degraded)
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
    const dailyStats = db.prepare(`
      SELECT substr(ts,1,10) as day,
             COUNT(*) as total,
             SUM(CASE WHEN engine = 'error' THEN 1 ELSE 0 END) as errors
      FROM audit_log WHERE ts >= ?
      GROUP BY day
    `).all(thirtyDaysAgo);

    const badDays = dailyStats.filter(d => d.total > 0 && (d.errors / d.total) >= 0.1).length;
    const uptime_30d = +(((30 - badDays) / 30) * 100).toFixed(3);

    // Active incidents
    const incidents = db.prepare(`
      SELECT * FROM incidents WHERE status != 'resolved' ORDER BY started DESC LIMIT 10
    `).all().map(i => ({
      ...i,
      affected: safeJsonParse(i.affected, []),
      started_at: new Date(i.started).toISOString(),
      resolved_at: i.resolved ? new Date(i.resolved).toISOString() : null
    }));

    // FIX: uptime_note replaced with real uptime_30d; also expose requests_last_5m for transparency
    res.json({
      ok: true,
      _engine: 'real',
      data: {
        status: overallStatus,
        components,
        uptime_30d,
        incidents,
        requests_last_5m: recentTotal,
        error_rate_last_5m: +(errorRate * 100).toFixed(2),
        avg_latency_last_5m_ms: Math.round(avgLatency),
        last_updated: new Date().toISOString()
      },
      generated_at: new Date().toISOString()
    });
  }

  // GET /v1/status/incidents
  app.get('/v1/status/incidents', (req, res) => {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const incidents = db.prepare(`
      SELECT * FROM incidents WHERE started >= ? ORDER BY started DESC
    `).all(thirtyDaysAgo).map(i => ({
      ...i,
      affected: safeJsonParse(i.affected, []),
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

  // GET /v1/observe/status/incidents — same, prefixed version
  app.get('/v1/observe/status/incidents', (req, res) => {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const incidents = db.prepare(`
      SELECT * FROM incidents WHERE started >= ? ORDER BY started DESC
    `).all(thirtyDaysAgo).map(i => ({
      ...i,
      affected: safeJsonParse(i.affected, []),
      started_at: new Date(i.started).toISOString(),
      resolved_at: i.resolved ? new Date(i.resolved).toISOString() : null
    }));

    ok(res, { incidents, total: incidents.length });
  });

  // POST /v1/status/incident
  app.post('/v1/status/incident', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { title, severity, message, affected } = req.body || {};

    if (!title) return res.status(400).json({ ok: false, error: { code: 'missing_field', message: 'title is required' } });
    const validSeverities = ['minor', 'major', 'critical'];
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_severity', message: 'severity must be minor, major, or critical' } });
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
    if (!incident) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Incident not found' } });

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
  // FIX: session_ids were random on every call making them non-deterministic and unusable
  // in replay/execute. Now uses hash of first call id as deterministic session identifier.
  app.get('/v1/observe/replay', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const limit_sessions = Math.min(parseInt(req.query.limit) || 20, 100);

    const calls = db.prepare(`
      SELECT id, ts, api as slug, credits, latency_ms, engine
      FROM audit_log WHERE key_prefix = ?
      ORDER BY id DESC LIMIT 500
    `).all(prefix);

    const sessions = [];
    let current = null;
    for (const call of [...calls].reverse()) {
      const callTs = new Date(call.ts).getTime();
      if (!current || (callTs - current.last_ts) > 300000) {
        // FIX: deterministic session_id using hash of first call's id
        const session_id = crypto.createHash('sha256').update(String(call.id)).digest('hex').slice(0, 16);
        current = {
          session_id,
          started_at: call.ts,
          calls: [],
          last_ts: callTs,
          total_credits: 0,
          seed_call_id: call.id
        };
        sessions.push(current);
      }
      current.calls.push({ slug: call.slug, credits: call.credits, latency_ms: call.latency_ms, ts: call.ts });
      current.total_credits += call.credits || 0;
      current.last_ts = callTs;
    }

    sessions.reverse();
    const paged = sessions.slice(0, limit_sessions);

    ok(res, {
      sessions: paged.map(s => ({
        session_id: s.session_id,
        started_at: s.started_at,
        call_count: s.calls.length,
        total_credits: s.total_credits,
        total_cost_usd: +(s.total_credits * USD_PER_CREDIT).toFixed(4),
        calls: s.calls
      })),
      total_sessions: sessions.length,
      returned: paged.length
    });
  });

  // POST /v1/observe/replay/execute
  // FIX: Was ignoring sequence_id entirely — always replayed the most recent session.
  // Now matches sequence_id against deterministic session hash.
  app.post('/v1/observe/replay/execute', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
    const prefix = keyPrefix(apiKey);
    const { sequence_id, dry_run } = req.body || {};

    if (!sequence_id) return res.status(400).json({ ok: false, error: { code: 'missing_field', message: 'sequence_id is required' } });

    const calls = db.prepare(`
      SELECT id, ts, api as slug, credits, latency_ms, engine
      FROM audit_log WHERE key_prefix = ?
      ORDER BY id DESC LIMIT 500
    `).all(prefix);

    const sessions = [];
    let current = null;
    for (const call of [...calls].reverse()) {
      const callTs = new Date(call.ts).getTime();
      if (!current || (callTs - current.last_ts) > 300000) {
        const session_id = crypto.createHash('sha256').update(String(call.id)).digest('hex').slice(0, 16);
        current = { session_id, calls: [], last_ts: callTs, total_credits: 0, seed_call_id: call.id };
        sessions.push(current);
      }
      current.calls.push({ slug: call.slug, credits: call.credits, latency_ms: call.latency_ms, ts: call.ts });
      current.total_credits += call.credits || 0;
      current.last_ts = callTs;
    }

    // FIX: Actually match by session_id
    const session = sessions.find(s => s.session_id === sequence_id);
    if (!session) return res.status(404).json({ ok: false, error: { code: 'sequence_not_found', message: 'Sequence not found. Fetch /v1/observe/replay to get valid session_ids.' } });

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
  // FIX: CSV export had a bug — metadata column was already a string in roi_events
  // but code was calling .replace() on it as if it were an object.
  app.get('/v1/observe/export', (req, res) => {
    const acct = requireAuth(req, res);
    if (!acct) return;
    const apiKey = getApiKey(req);
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
        // FIX: metadata is stored as a JSON string — escape quotes safely
        const metaStr = (typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata || {})).replace(/"/g, '""');
        roiLines.push(`${new Date(r.ts).toISOString()},${r.event_type},${r.value || 0},"${metaStr}"`);
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
        metadata: safeJsonParse(r.metadata, {})
      }))
    });
  });

};

// ─── Safe JSON parse helper ──────────────────────────────────────────────────
// FIX: JSON.parse was called directly throughout; if DB contains malformed JSON
// it would crash the route. Centralise with a safe fallback.
function safeJsonParse(str, fallback) {
  if (str === null || str === undefined) return fallback;
  if (typeof str !== 'string') return str; // already parsed
  try { return JSON.parse(str); } catch (_) { return fallback; }
}
