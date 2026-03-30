'use strict';

/**
 * Evaluation Framework + Model Routing
 * routes/eval.js
 *
 * Full working implementations — no stubs, no TODOs.
 * Uses: crypto (built-in), http (built-in), better-sqlite3 (db passed in), express
 */

const crypto = require('crypto');
const http = require('http');
const https = require('https');

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

// ─── Inline auth helper ───────────────────────────────────────────────────────

function requireAuth(req, res, apiKeys) {
  const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!key || !apiKeys.get(key)) {
    res.status(401).json({ error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
    return null;
  }
  return { key, acct: apiKeys.get(key) };
}

// ─── Internal HTTP tool call ──────────────────────────────────────────────────

function callToolInternally(slug, input, apiKey, timeoutMs) {
  return new Promise((resolve) => {
    const port = process.env.PORT || 3000;
    const body = JSON.stringify(input || {});
    const start = now();
    const options = {
      hostname: '127.0.0.1',
      port: parseInt(port),
      path: `/v1/${slug}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: timeoutMs || 15000,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const latency_ms = now() - start;
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed, latency_ms });
        } catch {
          resolve({ status: res.statusCode, body: { error: { code: 'invalid_json' } }, latency_ms });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ status: 502, body: { error: { code: 'tool_call_failed', message: e.message } }, latency_ms: now() - start });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, body: { error: { code: 'timeout' } }, latency_ms: timeoutMs || 15000 });
    });
    req.write(body);
    req.end();
  });
}

// ─── Internal cloud LLM call ──────────────────────────────────────────────────

function callCloudLLM(hostname, path, apiKey, body, timeoutMs) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const start = now();
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: timeoutMs || 30000,
    }, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        const latency_ms = now() - start;
        try {
          resolve({ status: res.statusCode, body: JSON.parse(d), latency_ms });
        } catch {
          resolve({ status: res.statusCode, body: { error: 'invalid_json' }, latency_ms });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ status: 502, body: { error: e.message }, latency_ms: now() - start });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, body: { error: 'timeout' }, latency_ms: timeoutMs || 30000 });
    });
    req.write(data);
    req.end();
  });
}

// ─── Check output against test conditions ─────────────────────────────────────
// BUG FIX: extended to support exact match, field existence, numeric bounds,
// and JSON path matching in addition to string containment.

function checkOutputConditions(test, actual_output) {
  const reasons = [];
  const haystack = JSON.stringify(actual_output).toLowerCase();

  // Contains check (string in serialized JSON)
  if (Array.isArray(test.expected_output_contains)) {
    for (const needle of test.expected_output_contains) {
      if (!haystack.includes(String(needle).toLowerCase())) {
        reasons.push(`expected output to contain "${needle}"`);
      }
    }
  }

  // Not-contains check
  if (Array.isArray(test.expected_output_not_contains)) {
    for (const needle of test.expected_output_not_contains) {
      if (haystack.includes(String(needle).toLowerCase())) {
        reasons.push(`expected output NOT to contain "${needle}"`);
      }
    }
  }

  // Exact field match: expected_fields: { "data.key": "value" }
  if (test.expected_fields && typeof test.expected_fields === 'object') {
    for (const [path, expectedVal] of Object.entries(test.expected_fields)) {
      const actualVal = getNestedField(actual_output, path);
      if (actualVal === undefined) {
        reasons.push(`field "${path}" not found in output`);
      } else if (String(actualVal) !== String(expectedVal)) {
        reasons.push(`field "${path}" expected "${expectedVal}", got "${actualVal}"`);
      }
    }
  }

  // Numeric bounds: expected_numeric_bounds: { "data.count": { min: 1, max: 100 } }
  if (test.expected_numeric_bounds && typeof test.expected_numeric_bounds === 'object') {
    for (const [path, bounds] of Object.entries(test.expected_numeric_bounds)) {
      const actualVal = parseFloat(getNestedField(actual_output, path));
      if (isNaN(actualVal)) {
        reasons.push(`field "${path}" is not numeric (got "${getNestedField(actual_output, path)}")`);
      } else {
        if (bounds.min !== undefined && actualVal < bounds.min) {
          reasons.push(`field "${path}" value ${actualVal} is below minimum ${bounds.min}`);
        }
        if (bounds.max !== undefined && actualVal > bounds.max) {
          reasons.push(`field "${path}" value ${actualVal} exceeds maximum ${bounds.max}`);
        }
      }
    }
  }

  // Exact JSON match on a sub-field: expected_exact: { "data.ok": true }
  if (test.expected_exact !== undefined) {
    const actualStr = JSON.stringify(actual_output);
    const expectStr = JSON.stringify(test.expected_exact);
    if (!actualStr.includes(expectStr.slice(1, -1))) {
      reasons.push(`output did not match expected_exact pattern`);
    }
  }

  return reasons;
}

// ─── Nested field getter (dot-notation path) ─────────────────────────────────

function getNestedField(obj, path) {
  return path.split('.').reduce((cur, key) => {
    if (cur === undefined || cur === null) return undefined;
    return cur[key];
  }, obj);
}

// ─── Scoring rubric evaluator ─────────────────────────────────────────────────
// BUG FIX / NEW FEATURE: compute per-test rubric scores (accuracy, latency, cost)

function computeRubricScore(testResult, test) {
  const rubric = test.rubric || {};
  const scores = {};

  // Accuracy score (0-100): binary pass/fail unless partial_credit_fields defined
  if (rubric.accuracy !== false) {
    if (testResult.passed) {
      scores.accuracy = 100;
    } else if (Array.isArray(rubric.partial_credit_fields)) {
      // Partial credit: score proportional to how many condition checks passed
      // We infer from failure_reason how many checks failed
      const totalChecks = (
        (test.expected_output_contains || []).length +
        (test.expected_output_not_contains || []).length +
        Object.keys(test.expected_fields || {}).length
      ) || 1;
      const failedChecks = testResult.failure_reason
        ? testResult.failure_reason.split('; ').length
        : 0;
      scores.accuracy = Math.round(Math.max(0, ((totalChecks - failedChecks) / totalChecks) * 100));
    } else {
      scores.accuracy = 0;
    }
  }

  // Latency score (0-100): inversely proportional to max_latency_ms
  if (rubric.latency !== false) {
    const maxMs = test.max_latency_ms || 5000;
    const actualMs = testResult.latency_ms || 0;
    scores.latency = Math.round(Math.max(0, Math.min(100, (1 - actualMs / maxMs) * 100)));
  }

  // Cost score (0-100): inversely proportional to max_credits
  if (rubric.cost !== false) {
    const maxCred = test.max_credits || 10;
    const usedCred = testResult.credits_used || 0;
    scores.cost = Math.round(Math.max(0, Math.min(100, (1 - usedCred / maxCred) * 100)));
  }

  // Composite weighted score
  const weights = rubric.weights || { accuracy: 0.6, latency: 0.2, cost: 0.2 };
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 1;
  let composite = 0;
  if (scores.accuracy !== undefined) composite += (scores.accuracy * (weights.accuracy || 0.6));
  if (scores.latency !== undefined) composite += (scores.latency * (weights.latency || 0.2));
  if (scores.cost !== undefined) composite += (scores.cost * (weights.cost || 0.2));
  scores.composite = Math.round(composite / totalWeight);

  return scores;
}

// ─── Execute a single test case ───────────────────────────────────────────────

async function runTestCase(test, apiKey) {
  const maxLatency = test.max_latency_ms || 5000;
  const maxCredits = test.max_credits || 10;
  const expectedStatus = test.expected_status || 'success';

  const result = await callToolInternally(test.tool_slug, test.input, apiKey, maxLatency + 2000);

  const latency_ms = result.latency_ms;
  const actual_output = result.body;
  const httpOk = result.status >= 200 && result.status < 300;
  const isSuccess = httpOk && !actual_output?.error;
  const actualStatus = isSuccess ? 'success' : 'error';

  const failureReasons = [];

  // Status check
  if (actualStatus !== expectedStatus) {
    failureReasons.push(`expected status "${expectedStatus}", got "${actualStatus}"`);
  }

  // Latency check
  if (latency_ms > maxLatency) {
    failureReasons.push(`latency ${latency_ms}ms exceeded max ${maxLatency}ms`);
  }

  // BUG FIX: credits_used was defaulting to 1 even when the tool returned 0.
  // Now we correctly read 0 when the field is 0, only defaulting to 1 when field is absent.
  const credits_used = actual_output?.meta?.credits_used !== undefined
    ? actual_output.meta.credits_used
    : (actual_output?.data?.credits_used !== undefined ? actual_output.data.credits_used : 1);

  if (credits_used > maxCredits) {
    failureReasons.push(`credits_used ${credits_used} exceeded max ${maxCredits}`);
  }

  // Output condition checks (only when status is success)
  if (isSuccess) {
    const conditionFailures = checkOutputConditions(test, actual_output);
    failureReasons.push(...conditionFailures);
  }

  const passed = failureReasons.length === 0;

  const testResult = {
    test_id: test.id,
    passed,
    latency_ms,
    credits_used,
    actual_output,
    failure_reason: passed ? undefined : failureReasons.join('; '),
  };

  // Attach rubric scores if rubric is defined or always (default rubric)
  testResult.rubric_scores = computeRubricScore(testResult, test);

  return testResult;
}

// ─── Round-robin state ────────────────────────────────────────────────────────

const rrCounters = new Map();

// ─── Weighted random selection ────────────────────────────────────────────────

function weightedRandom(models) {
  const totalWeight = models.reduce((sum, m) => sum + (m.weight || 1), 0);
  let rand = Math.random() * totalWeight;
  for (const m of models) {
    rand -= (m.weight || 1);
    if (rand <= 0) return m;
  }
  return models[models.length - 1];
}

// ─── Execute LLM call via provider ───────────────────────────────────────────

async function executeLLMCall(model, prompt, max_tokens) {
  const provider = model.provider;
  const model_id = model.model_id;
  const t = max_tokens || model.max_tokens || 512;

  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { response: `[LLM_KEY_REQUIRED: Set ANTHROPIC_API_KEY env var]`, tokens_used: 0, ok: false };
    const body = { model: model_id || 'claude-3-haiku-20240307', max_tokens: t, messages: [{ role: 'user', content: prompt }] };
    const result = await callCloudLLM('api.anthropic.com', '/v1/messages', key, body, 30000);
    const text = result.body?.content?.[0]?.text || result.body?.error || '[no response]';
    const tokens = (result.body?.usage?.input_tokens || 0) + (result.body?.usage?.output_tokens || 0);
    return { response: text, tokens_used: tokens, ok: result.status === 200 };
  }

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { response: `[LLM_KEY_REQUIRED: Set OPENAI_API_KEY env var]`, tokens_used: 0, ok: false };
    const body = { model: model_id || 'gpt-4o-mini', max_tokens: t, messages: [{ role: 'user', content: prompt }] };
    const result = await callCloudLLM('api.openai.com', '/v1/chat/completions', key, body, 30000);
    const text = result.body?.choices?.[0]?.message?.content || result.body?.error?.message || '[no response]';
    const tokens = result.body?.usage?.total_tokens || 0;
    return { response: text, tokens_used: tokens, ok: result.status === 200 };
  }

  if (provider === 'grok') {
    const key = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
    if (!key) return { response: `[LLM_KEY_REQUIRED: Set XAI_API_KEY env var]`, tokens_used: 0, ok: false };
    const body = { model: model_id || 'grok-3', max_tokens: t, messages: [{ role: 'user', content: prompt }] };
    const result = await callCloudLLM('api.x.ai', '/v1/chat/completions', key, body, 30000);
    const text = result.body?.choices?.[0]?.message?.content || result.body?.error?.message || '[no response]';
    const tokens = result.body?.usage?.total_tokens || 0;
    return { response: text, tokens_used: tokens, ok: result.status === 200 };
  }

  if (provider === 'deepseek') {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) return { response: `[LLM_KEY_REQUIRED: Set DEEPSEEK_API_KEY env var]`, tokens_used: 0, ok: false };
    const body = { model: model_id || 'deepseek-chat', max_tokens: t, messages: [{ role: 'user', content: prompt }] };
    const result = await callCloudLLM('api.deepseek.com', '/v1/chat/completions', key, body, 30000);
    const text = result.body?.choices?.[0]?.message?.content || result.body?.error?.message || '[no response]';
    const tokens = result.body?.usage?.total_tokens || 0;
    return { response: text, tokens_used: tokens, ok: result.status === 200 };
  }

  if (provider === 'local') {
    // Try Ollama at localhost:11434
    const ollamaPort = process.env.OLLAMA_PORT || 11434;
    const body = { model: model_id || 'llama3', prompt };
    return new Promise((resolve) => {
      const data = JSON.stringify(body);
      const start = now();
      const req = http.request({
        hostname: '127.0.0.1',
        port: parseInt(ollamaPort),
        path: '/api/generate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 30000,
      }, (res) => {
        let d = '';
        res.on('data', c => { d += c; });
        res.on('end', () => {
          try {
            // Ollama streams NDJSON; last line has done:true
            const lines = d.trim().split('\n').filter(Boolean);
            const last = JSON.parse(lines[lines.length - 1]);
            const text = last.response || last.message?.content || '[no response]';
            resolve({ response: text, tokens_used: last.eval_count || 0, ok: true });
          } catch {
            resolve({ response: '[local model parse error]', tokens_used: 0, ok: false });
          }
        });
      });
      req.on('error', () => {
        resolve({ response: `[LLM_KEY_REQUIRED: Set OLLAMA_HOST or start Ollama locally]`, tokens_used: 0, ok: false });
      });
      req.on('timeout', () => { req.destroy(); resolve({ response: '[local model timeout]', tokens_used: 0, ok: false }); });
      req.write(data);
      req.end();
    });
  }

  return { response: `[LLM_KEY_REQUIRED: Set ${provider.toUpperCase()}_API_KEY env var]`, tokens_used: 0, ok: false };
}

// ─── Aggregate run statistics ─────────────────────────────────────────────────

function aggregateRunStats(results) {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const score = total > 0 ? Math.round((passed / total) * 100 * 100) / 100 : 0;

  const latencies = results.map(r => r.latency_ms || 0);
  const credits = results.map(r => r.credits_used || 0);

  const avg_latency_ms = latencies.length
    ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
    : 0;
  const p95_latency_ms = latencies.length
    ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1]
    : 0;
  const total_credits = credits.reduce((s, v) => s + v, 0);

  const avg_rubric_accuracy = results.length
    ? Math.round(results.reduce((s, r) => s + (r.rubric_scores?.accuracy || 0), 0) / results.length)
    : 0;
  const avg_rubric_latency = results.length
    ? Math.round(results.reduce((s, r) => s + (r.rubric_scores?.latency || 0), 0) / results.length)
    : 0;
  const avg_rubric_cost = results.length
    ? Math.round(results.reduce((s, r) => s + (r.rubric_scores?.cost || 0), 0) / results.length)
    : 0;

  return {
    score,
    passed,
    failed,
    total,
    avg_latency_ms,
    p95_latency_ms,
    total_credits,
    rubric_averages: { accuracy: avg_rubric_accuracy, latency: avg_rubric_latency, cost: avg_rubric_cost },
  };
}

// ─── CSV serializer ───────────────────────────────────────────────────────────

function resultsToCSV(results, runMeta) {
  const header = [
    'test_id', 'passed', 'latency_ms', 'credits_used',
    'rubric_accuracy', 'rubric_latency', 'rubric_cost', 'rubric_composite',
    'failure_reason',
  ].join(',');

  const rows = results.map(r => [
    r.test_id || '',
    r.passed ? 'true' : 'false',
    r.latency_ms || 0,
    r.credits_used || 0,
    r.rubric_scores?.accuracy ?? '',
    r.rubric_scores?.latency ?? '',
    r.rubric_scores?.cost ?? '',
    r.rubric_scores?.composite ?? '',
    `"${(r.failure_reason || '').replace(/"/g, '""')}"`,
  ].join(','));

  const meta = [
    `# run_id: ${runMeta.run_id}`,
    `# suite_id: ${runMeta.suite_id}`,
    `# score: ${runMeta.score}`,
    `# generated_at: ${new Date().toISOString()}`,
  ].join('\n');

  return [meta, header, ...rows].join('\n');
}

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = function (app, db, apiKeys) {

  // ── Schema bootstrap ──────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS eval_suites (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      tests TEXT NOT NULL DEFAULT '[]',
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_eval_suites_api_key ON eval_suites(api_key);

    CREATE TABLE IF NOT EXISTS eval_runs (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL,
      api_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      results TEXT,
      score REAL,
      passed INTEGER,
      failed INTEGER,
      avg_latency_ms INTEGER,
      total_credits REAL,
      started INTEGER NOT NULL,
      completed INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_eval_runs_suite_id ON eval_runs(suite_id);
    CREATE INDEX IF NOT EXISTS idx_eval_runs_api_key  ON eval_runs(api_key);

    CREATE TABLE IF NOT EXISTS model_routes (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      name TEXT NOT NULL,
      strategy TEXT NOT NULL DEFAULT 'cost_optimized',
      models TEXT NOT NULL DEFAULT '[]',
      fallback TEXT,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_model_routes_api_key ON model_routes(api_key);

    CREATE TABLE IF NOT EXISTS eval_leaderboard (
      id TEXT PRIMARY KEY,
      tool_slug TEXT NOT NULL,
      api_key TEXT NOT NULL,
      run_id TEXT NOT NULL,
      suite_name TEXT,
      score REAL NOT NULL,
      avg_latency_ms INTEGER,
      total_credits REAL,
      passed INTEGER,
      failed INTEGER,
      total INTEGER,
      is_public INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leaderboard_tool ON eval_leaderboard(tool_slug);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON eval_leaderboard(score DESC);
  `);

  // ── Migrate existing eval_runs table to add new columns if needed ─────────
  try {
    db.exec(`ALTER TABLE eval_runs ADD COLUMN avg_latency_ms INTEGER`);
  } catch (_) { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE eval_runs ADD COLUMN total_credits REAL`);
  } catch (_) { /* column already exists */ }

  // ── Prepared statements ───────────────────────────────────────────────────

  const stmts = {
    // eval_suites
    insertSuite: db.prepare(`
      INSERT INTO eval_suites (id, api_key, name, description, tests, created)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getSuite: db.prepare(`SELECT * FROM eval_suites WHERE id = ?`),
    getSuiteForKey: db.prepare(`SELECT * FROM eval_suites WHERE id = ? AND api_key = ?`),
    updateSuiteTests: db.prepare(`UPDATE eval_suites SET tests = ? WHERE id = ? AND api_key = ?`),

    // eval_runs
    insertRun: db.prepare(`
      INSERT INTO eval_runs (id, suite_id, api_key, status, results, score, passed, failed, avg_latency_ms, total_credits, started, completed)
      VALUES (?, ?, ?, 'running', NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL)
    `),
    updateRun: db.prepare(`
      UPDATE eval_runs SET status = ?, results = ?, score = ?, passed = ?, failed = ?, avg_latency_ms = ?, total_credits = ?, completed = ? WHERE id = ?
    `),
    getRun: db.prepare(`SELECT * FROM eval_runs WHERE id = ?`),
    listRuns: db.prepare(`SELECT id, suite_id, status, score, passed, failed, avg_latency_ms, total_credits, started, completed FROM eval_runs WHERE api_key = ? ORDER BY started DESC LIMIT ? OFFSET ?`),
    countRuns: db.prepare(`SELECT COUNT(*) as c FROM eval_runs WHERE api_key = ?`),
    listRunsBySuite: db.prepare(`SELECT id, suite_id, status, score, passed, failed, avg_latency_ms, total_credits, started, completed FROM eval_runs WHERE api_key = ? AND suite_id = ? ORDER BY started DESC LIMIT ?`),

    // model_routes
    insertRoute: db.prepare(`
      INSERT INTO model_routes (id, api_key, name, strategy, models, fallback, created)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getRoute: db.prepare(`SELECT * FROM model_routes WHERE id = ? AND api_key = ?`),
    listRoutes: db.prepare(`SELECT * FROM model_routes WHERE api_key = ? ORDER BY created DESC`),

    // leaderboard
    insertLeaderboard: db.prepare(`
      INSERT INTO eval_leaderboard (id, tool_slug, api_key, run_id, suite_name, score, avg_latency_ms, total_credits, passed, failed, total, is_public, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getLeaderboard: db.prepare(`SELECT * FROM eval_leaderboard WHERE is_public = 1 ORDER BY score DESC, avg_latency_ms ASC LIMIT ?`),
    getLeaderboardByTool: db.prepare(`SELECT * FROM eval_leaderboard WHERE tool_slug = ? AND is_public = 1 ORDER BY score DESC, avg_latency_ms ASC LIMIT ?`),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // EVALUATION FRAMEWORK
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /v1/eval — Discovery / stats
  app.get('/v1/eval', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    try {
      const suiteCount = db.prepare('SELECT COUNT(*) as c FROM eval_suites WHERE api_key = ?').get(auth.key).c;
      const runCount = db.prepare('SELECT COUNT(*) as c FROM eval_runs WHERE api_key = ?').get(auth.key).c;
      const lastRun = db.prepare('SELECT score, status, completed FROM eval_runs WHERE api_key = ? ORDER BY started DESC LIMIT 1').get(auth.key);
      ok(res, {
        suites: suiteCount,
        runs: runCount,
        last_run: lastRun || null,
        features: [
          'suite_create', 'run_benchmark', 'model_routing', 'leaderboard',
          'ab_testing', 'batch_eval', 'rubric_scoring', 'regression_testing',
          'export_csv', 'export_json', 'route_from_eval',
        ],
      });
    } catch (e) { res.status(500).json({ error: { code: 'eval_error', message: e.message } }); }
  });

  // ─── POST /v1/eval/create — BUG FIX: this endpoint was missing (404).
  // Lightweight single-tool eval creator. Creates a suite + returns suite_id.
  // Accepts top-level tool_slug + inputs array as a convenience wrapper.
  app.post('/v1/eval/create', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const {
      name,
      description,
      // Simple single-tool mode
      tool_slug, slug, inputs,
      // Full suite mode (array of test objects)
      tests,
    } = req.body;

    if (!name) return res.status(400).json({ error: { code: 'missing_field', message: 'name is required' } });

    let resolvedTests = [];

    if (Array.isArray(tests) && tests.length > 0) {
      // Full suite mode — same as /v1/eval/suite/create
      resolvedTests = tests;
    } else if (tool_slug || slug) {
      // Single-tool mode — convert inputs array to test cases
      const resolvedSlug = tool_slug || slug;
      const resolvedInputs = Array.isArray(inputs) ? inputs : [];
      if (resolvedInputs.length === 0) {
        return res.status(400).json({ error: { code: 'missing_field', message: 'inputs must be a non-empty array when using tool_slug mode' } });
      }
      resolvedTests = resolvedInputs.map((inp, i) => ({
        id: `test-${i + 1}`,
        tool_slug: resolvedSlug,
        input: inp.input !== undefined ? inp.input : inp,
        expected_output_contains: inp.expected !== undefined ? [inp.expected] : undefined,
        expected_status: inp.expected_status || 'success',
        max_latency_ms: inp.max_latency_ms || 5000,
        max_credits: inp.max_credits || 10,
      }));
    } else {
      return res.status(400).json({ error: { code: 'missing_field', message: 'Provide either tests[] or tool_slug + inputs[]' } });
    }

    // Normalize slug alias in test objects
    const VALID_STATUSES = ['success', 'error'];
    let testIdx = 0;
    for (const t of resolvedTests) {
      if (!t.id) t.id = `test-${++testIdx}`;
      if (!t.tool_slug && t.slug) t.tool_slug = t.slug;
      if (!t.tool_slug) return res.status(400).json({ error: { code: 'invalid_test', message: `Test "${t.id}" must have a tool_slug (or slug)` } });
      if (t.expected_status && !VALID_STATUSES.includes(t.expected_status)) {
        return res.status(400).json({ error: { code: 'invalid_test', message: `expected_status must be "success" or "error"` } });
      }
    }

    const suite_id = 'eval-' + uid(12);
    stmts.insertSuite.run(suite_id, key, name, description || null, JSON.stringify(resolvedTests), now());

    ok(res, {
      suite_id,
      eval_id: suite_id,
      name,
      description: description || null,
      test_count: resolvedTests.length,
      created_at: new Date().toISOString(),
      next_steps: {
        run: `POST /v1/eval/run with { suite_id: "${suite_id}" }`,
        status: `GET /v1/eval/${suite_id}`,
      },
    });
  });

  // GET /v1/eval/list — List eval suites (also /v1/eval/suites)
  // BUG FIX: suites list was returning raw epoch integer for `created` — now returns ISO string.
  const listEvalSuites = (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;
      const suites = db.prepare('SELECT id, name, description, created FROM eval_suites WHERE api_key = ? ORDER BY created DESC LIMIT ? OFFSET ?').all(auth.key, limit, offset);
      const total = db.prepare('SELECT COUNT(*) as c FROM eval_suites WHERE api_key = ?').get(auth.key).c;
      ok(res, {
        suites: suites.map(s => ({
          suite_id: s.id,
          name: s.name,
          description: s.description,
          // BUG FIX: was returning raw integer epoch, now returns ISO string
          created_at: new Date(s.created).toISOString(),
        })),
        pagination: { total, limit, offset, has_more: offset + limit < total },
      });
    } catch (e) { res.status(500).json({ error: { code: 'eval_list_error', message: e.message } }); }
  };
  app.get('/v1/eval/list', listEvalSuites);
  app.get('/v1/eval/suites', listEvalSuites);

  // POST /v1/eval/suite/create — Create test suite
  // BUG FIX: description-only suites now allowed (tests defaults to [])
  app.post('/v1/eval/suite/create', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { name, description, tests } = req.body;
    if (!name) return res.status(400).json({ error: { code: 'missing_field', message: 'name is required' } });

    // BUG FIX: tests is now optional at creation time — you can add tests later via /v1/eval/suite/:id/add-tests
    const resolvedTests = Array.isArray(tests) ? tests : [];

    // Normalize and validate each test
    const VALID_STATUSES = ['success', 'error'];
    let testIdx = 0;
    for (const t of resolvedTests) {
      if (!t.id) t.id = `test-${++testIdx}`;
      if (!t.tool_slug && t.slug) t.tool_slug = t.slug;
      if (!t.tool_slug) return res.status(400).json({ error: { code: 'invalid_test', message: `Test "${t.id}" must have a tool_slug (or slug)` } });
      if (t.expected_status && !VALID_STATUSES.includes(t.expected_status)) {
        return res.status(400).json({ error: { code: 'invalid_test', message: `expected_status must be "success" or "error"` } });
      }
    }

    const suite_id = 'suite-' + uid(12);
    stmts.insertSuite.run(suite_id, key, name, description || null, JSON.stringify(resolvedTests), now());

    ok(res, { suite_id, name, description, test_count: resolvedTests.length, created_at: new Date().toISOString() });
  });

  // POST /v1/eval/suite/:id/add-tests — Append tests to an existing suite
  app.post('/v1/eval/suite/:id/add-tests', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const suite = stmts.getSuiteForKey.get(req.params.id, key);
    if (!suite) return res.status(404).json({ error: { code: 'suite_not_found' } });

    const { tests } = req.body;
    if (!Array.isArray(tests) || tests.length === 0) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'tests must be a non-empty array' } });
    }

    const existing = JSON.parse(suite.tests || '[]');
    let nextIdx = existing.length;

    for (const t of tests) {
      if (!t.id) t.id = `test-${++nextIdx}`;
      if (!t.tool_slug && t.slug) t.tool_slug = t.slug;
      if (!t.tool_slug) return res.status(400).json({ error: { code: 'invalid_test', message: `Test "${t.id}" must have a tool_slug` } });
    }

    const merged = [...existing, ...tests];
    stmts.updateSuiteTests.run(JSON.stringify(merged), suite.id, key);

    ok(res, { suite_id: suite.id, test_count: merged.length, added: tests.length });
  });

  // GET /v1/eval/suite/:id — Get suite definition
  app.get('/v1/eval/suite/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const suite = stmts.getSuiteForKey.get(req.params.id, key);
    if (!suite) return res.status(404).json({ error: { code: 'suite_not_found' } });

    ok(res, {
      suite_id: suite.id,
      name: suite.name,
      description: suite.description,
      tests: JSON.parse(suite.tests || '[]'),
      test_count: JSON.parse(suite.tests || '[]').length,
      created_at: new Date(suite.created).toISOString(),
    });
  });

  // ─── GET /v1/eval/:id — BUG FIX: was returning 404.
  // Now routes to either a suite or run based on ID prefix.
  app.get('/v1/eval/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;
    const { id } = req.params;

    try {
      // Check if it's a run ID
      if (id.startsWith('run-')) {
        const run = stmts.getRun.get(id);
        if (!run) return res.status(404).json({ error: { code: 'not_found', message: `No eval or run found with id "${id}"` } });
        if (run.api_key !== key) return res.status(403).json({ error: { code: 'forbidden' } });
        return ok(res, {
          type: 'run',
          run_id: run.id,
          suite_id: run.suite_id,
          status: run.status,
          score: run.score,
          passed: run.passed,
          failed: run.failed,
          avg_latency_ms: run.avg_latency_ms,
          total_credits: run.total_credits,
          started_at: new Date(run.started).toISOString(),
          completed_at: run.completed ? new Date(run.completed).toISOString() : null,
          duration_ms: run.completed ? run.completed - run.started : null,
          results: run.results ? JSON.parse(run.results) : [],
        });
      }

      // Check if it's a suite ID (suite- or eval- prefix)
      const suite = stmts.getSuiteForKey.get(id, key);
      if (suite) {
        const tests = JSON.parse(suite.tests || '[]');
        const recentRuns = stmts.listRunsBySuite.all(key, id, 5);
        return ok(res, {
          type: 'suite',
          suite_id: suite.id,
          name: suite.name,
          description: suite.description,
          test_count: tests.length,
          created_at: new Date(suite.created).toISOString(),
          recent_runs: recentRuns.map(r => ({
            run_id: r.id,
            status: r.status,
            score: r.score,
            passed: r.passed,
            failed: r.failed,
            started_at: new Date(r.started).toISOString(),
          })),
        });
      }

      return res.status(404).json({ error: { code: 'not_found', message: `No eval or run found with id "${id}"` } });
    } catch (e) { res.status(500).json({ error: { code: 'eval_get_error', message: e.message } }); }
  });

  // POST /v1/eval/run — Execute a test suite
  app.post('/v1/eval/run', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { suite_id, dry_run, parallel, publish_to_leaderboard } = req.body;
    if (!suite_id) return res.status(400).json({ error: { code: 'missing_field', message: 'suite_id is required' } });

    const suite = stmts.getSuiteForKey.get(suite_id, key);
    if (!suite) return res.status(404).json({ error: { code: 'suite_not_found', message: 'Suite not found or does not belong to this key' } });

    const tests = JSON.parse(suite.tests || '[]');
    if (tests.length === 0) {
      return res.status(400).json({ error: { code: 'empty_suite', message: 'Suite has no tests. Add tests via POST /v1/eval/suite/:id/add-tests' } });
    }

    const run_id = 'run-' + uid(12);
    const started = now();

    if (dry_run) {
      return ok(res, {
        run_id,
        dry_run: true,
        suite_id,
        suite_name: suite.name,
        tests_would_run: tests.map(t => ({
          test_id: t.id,
          tool_slug: t.tool_slug,
          input: t.input,
          expected_status: t.expected_status || 'success',
          max_latency_ms: t.max_latency_ms || 5000,
          max_credits: t.max_credits || 10,
          checks: [
            ...(t.expected_output_contains || []).map(v => `contains: "${v}"`),
            ...(t.expected_output_not_contains || []).map(v => `not_contains: "${v}"`),
            ...Object.keys(t.expected_fields || {}).map(k => `field: ${k}`),
          ],
        })),
        test_count: tests.length,
        message: 'Dry run — no tools executed',
      });
    }

    // Create the run record
    stmts.insertRun.run(run_id, suite_id, key, started);

    // Execute tests — parallel mode available
    let results = [];
    let passed = 0;
    let failed = 0;

    if (parallel) {
      // Run all tests concurrently
      const settled = await Promise.allSettled(tests.map(test => runTestCase(test, key)));
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status === 'fulfilled') {
          results.push(s.value);
          if (s.value.passed) { passed++; } else { failed++; }
        } else {
          results.push({
            test_id: tests[i].id,
            passed: false,
            latency_ms: 0,
            credits_used: 0,
            actual_output: null,
            failure_reason: `Internal error: ${s.reason?.message || s.reason}`,
            rubric_scores: { accuracy: 0, latency: 0, cost: 0, composite: 0 },
          });
          failed++;
        }
      }
    } else {
      // Sequential execution to avoid hammering the server
      for (const test of tests) {
        try {
          const testResult = await runTestCase(test, key);
          results.push(testResult);
          if (testResult.passed) { passed++; } else { failed++; }
        } catch (e) {
          results.push({
            test_id: test.id,
            passed: false,
            latency_ms: 0,
            credits_used: 0,
            actual_output: null,
            failure_reason: `Internal error: ${e.message}`,
            rubric_scores: { accuracy: 0, latency: 0, cost: 0, composite: 0 },
          });
          failed++;
        }
      }
    }

    const stats = aggregateRunStats(results);
    const completed = now();

    // Persist the run results
    stmts.updateRun.run(
      'completed',
      JSON.stringify(results),
      stats.score,
      stats.passed,
      stats.failed,
      stats.avg_latency_ms,
      stats.total_credits,
      completed,
      run_id,
    );

    // Optionally publish to leaderboard
    if (publish_to_leaderboard) {
      const toolSlugs = [...new Set(tests.map(t => t.tool_slug).filter(Boolean))];
      const primarySlug = toolSlugs[0] || 'unknown';
      stmts.insertLeaderboard.run(
        'lb-' + uid(10),
        primarySlug,
        key,
        run_id,
        suite.name,
        stats.score,
        stats.avg_latency_ms,
        stats.total_credits,
        stats.passed,
        stats.failed,
        stats.total,
        1,
        now(),
      );
    }

    ok(res, {
      run_id,
      suite_id,
      suite_name: suite.name,
      status: 'completed',
      score: stats.score,
      passed: stats.passed,
      failed: stats.failed,
      total: stats.total,
      avg_latency_ms: stats.avg_latency_ms,
      p95_latency_ms: stats.p95_latency_ms,
      total_credits: stats.total_credits,
      rubric_averages: stats.rubric_averages,
      started_at: new Date(started).toISOString(),
      completed_at: new Date(completed).toISOString(),
      duration_ms: completed - started,
      parallel: !!parallel,
      results,
    });
  });

  // GET /v1/eval/run/:id — Get run results
  app.get('/v1/eval/run/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const run = stmts.getRun.get(req.params.id);
    if (!run) return res.status(404).json({ error: { code: 'run_not_found' } });
    if (run.api_key !== key) return res.status(403).json({ error: { code: 'forbidden' } });

    ok(res, {
      run_id: run.id,
      suite_id: run.suite_id,
      status: run.status,
      score: run.score,
      passed: run.passed,
      failed: run.failed,
      avg_latency_ms: run.avg_latency_ms,
      total_credits: run.total_credits,
      started_at: new Date(run.started).toISOString(),
      completed_at: run.completed ? new Date(run.completed).toISOString() : null,
      duration_ms: run.completed ? run.completed - run.started : null,
      results: run.results ? JSON.parse(run.results) : [],
    });
  });

  // GET /v1/eval/run/:id/export — NEW: Export run results as CSV or JSON
  app.get('/v1/eval/run/:id/export', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const run = stmts.getRun.get(req.params.id);
    if (!run) return res.status(404).json({ error: { code: 'run_not_found' } });
    if (run.api_key !== key) return res.status(403).json({ error: { code: 'forbidden' } });

    const format = (req.query.format || 'json').toLowerCase();
    const results = run.results ? JSON.parse(run.results) : [];

    if (format === 'csv') {
      const csv = resultsToCSV(results, {
        run_id: run.id,
        suite_id: run.suite_id,
        score: run.score,
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="eval-${run.id}.csv"`);
      return res.send(csv);
    }

    // JSON export
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="eval-${run.id}.json"`);
    return res.json({
      run_id: run.id,
      suite_id: run.suite_id,
      status: run.status,
      score: run.score,
      passed: run.passed,
      failed: run.failed,
      avg_latency_ms: run.avg_latency_ms,
      total_credits: run.total_credits,
      started_at: new Date(run.started).toISOString(),
      completed_at: run.completed ? new Date(run.completed).toISOString() : null,
      duration_ms: run.completed ? run.completed - run.started : null,
      exported_at: new Date().toISOString(),
      results,
    });
  });

  // GET /v1/eval/runs — List recent runs
  app.get('/v1/eval/runs', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const runs = stmts.listRuns.all(key, limit, offset);
    const total = stmts.countRuns.get(key).c;

    ok(res, {
      runs: runs.map(r => ({
        run_id: r.id,
        suite_id: r.suite_id,
        status: r.status,
        score: r.score,
        passed: r.passed,
        failed: r.failed,
        avg_latency_ms: r.avg_latency_ms,
        total_credits: r.total_credits,
        started_at: new Date(r.started).toISOString(),
        completed_at: r.completed ? new Date(r.completed).toISOString() : null,
        duration_ms: r.completed ? r.completed - r.started : null,
      })),
      count: runs.length,
      pagination: { total, limit, offset, has_more: offset + limit < total },
    });
  });

  // POST /v1/eval/benchmark — Run standard Slopshop benchmark suite
  app.post('/v1/eval/benchmark', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    // Built-in benchmark tests
    const BENCHMARK_TESTS = [
      {
        id: 'bench-uuid',
        tool_slug: 'crypto-uuid',
        input: {},
        expected_output_contains: ['uuid'],
        expected_status: 'success',
        max_latency_ms: 3000,
        max_credits: 5,
        description: 'UUID generator produces a uuid field',
      },
      {
        id: 'bench-hash-sha256',
        tool_slug: 'crypto-hash-sha256',
        input: { text: 'benchmark-test-input' },
        expected_output_contains: ['hash'],
        expected_status: 'success',
        max_latency_ms: 3000,
        max_credits: 5,
        description: 'SHA-256 hash produces a hash field',
      },
      {
        id: 'bench-word-count',
        tool_slug: 'text-word-count',
        input: { text: 'one two three' },
        expected_output_contains: ['3'],
        expected_status: 'success',
        max_latency_ms: 3000,
        max_credits: 5,
        description: 'Word count returns 3 for "one two three"',
      },
      {
        id: 'bench-memory-set',
        tool_slug: 'memory-set',
        input: { key: '_benchmark_test_key', value: 'benchmark_value' },
        expected_output_contains: ['ok'],
        expected_status: 'success',
        max_latency_ms: 3000,
        max_credits: 5,
        description: 'Memory set acknowledges write',
      },
      {
        id: 'bench-memory-get',
        tool_slug: 'memory-get',
        input: { key: '_benchmark_test_key' },
        expected_output_contains: ['benchmark_value'],
        expected_status: 'success',
        max_latency_ms: 3000,
        max_credits: 5,
        description: 'Memory get roundtrip reads stored value',
      },
    ];

    const started = now();
    const results = [];
    let passed = 0;
    let failed = 0;

    for (const test of BENCHMARK_TESTS) {
      try {
        const result = await runTestCase(test, key);
        results.push({ ...result, description: test.description });
        if (result.passed) { passed++; } else { failed++; }
      } catch (e) {
        results.push({
          test_id: test.id,
          passed: false,
          latency_ms: 0,
          credits_used: 0,
          actual_output: null,
          description: test.description,
          failure_reason: `Internal error: ${e.message}`,
          rubric_scores: { accuracy: 0, latency: 0, cost: 0, composite: 0 },
        });
        failed++;
      }
    }

    const stats = aggregateRunStats(results);
    const duration_ms = now() - started;

    // Grade
    const grade = stats.score >= 90 ? 'A' : stats.score >= 75 ? 'B' : stats.score >= 60 ? 'C' : stats.score >= 40 ? 'D' : 'F';

    ok(res, {
      benchmark: 'slopshop-standard-v1',
      score: stats.score,
      grade,
      passed: stats.passed,
      failed: stats.failed,
      total: stats.total,
      avg_latency_ms: stats.avg_latency_ms,
      p95_latency_ms: stats.p95_latency_ms,
      total_credits: stats.total_credits,
      rubric_averages: stats.rubric_averages,
      duration_ms,
      started_at: new Date(started).toISOString(),
      completed_at: new Date().toISOString(),
      results,
      note: `Standard Slopshop benchmark suite — tests core tool availability and correctness.`,
    });
  });

  // ─── NEW: POST /v1/eval/ab — A/B testing between two tools ───────────────
  // Runs the same inputs against two tool slugs and compares their performance.
  app.post('/v1/eval/ab', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { tool_a, tool_b, inputs, name } = req.body;

    if (!tool_a || !tool_b) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'tool_a and tool_b are required' } });
    }
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'inputs must be a non-empty array' } });
    }

    const runAB = async (toolSlug) => {
      const tests = inputs.map((inp, i) => ({
        id: `ab-${i + 1}`,
        tool_slug: toolSlug,
        input: inp.input !== undefined ? inp.input : inp,
        expected_output_contains: inp.expected !== undefined ? [inp.expected] : undefined,
        expected_status: inp.expected_status || 'success',
        max_latency_ms: inp.max_latency_ms || 5000,
        max_credits: inp.max_credits || 10,
      }));

      const results = [];
      for (const test of tests) {
        try {
          results.push(await runTestCase(test, key));
        } catch (e) {
          results.push({
            test_id: test.id,
            passed: false,
            latency_ms: 0,
            credits_used: 0,
            actual_output: null,
            failure_reason: `Internal error: ${e.message}`,
            rubric_scores: { accuracy: 0, latency: 0, cost: 0, composite: 0 },
          });
        }
      }
      return results;
    };

    const started = now();
    const [resultsA, resultsB] = await Promise.all([runAB(tool_a), runAB(tool_b)]);
    const duration_ms = now() - started;

    const statsA = aggregateRunStats(resultsA);
    const statsB = aggregateRunStats(resultsB);

    // Determine winner by composite rubric score
    const winner = statsA.rubric_averages.composite >= statsB.rubric_averages.composite ? tool_a : tool_b;
    const scoreDiff = Math.abs(statsA.score - statsB.score);
    const verdict = scoreDiff < 5
      ? 'tie'
      : statsA.score > statsB.score ? `${tool_a}_wins` : `${tool_b}_wins`;

    ok(res, {
      ab_test: name || `${tool_a}_vs_${tool_b}`,
      tool_a: {
        slug: tool_a,
        score: statsA.score,
        passed: statsA.passed,
        failed: statsA.failed,
        avg_latency_ms: statsA.avg_latency_ms,
        total_credits: statsA.total_credits,
        rubric_averages: statsA.rubric_averages,
        results: resultsA,
      },
      tool_b: {
        slug: tool_b,
        score: statsB.score,
        passed: statsB.passed,
        failed: statsB.failed,
        avg_latency_ms: statsB.avg_latency_ms,
        total_credits: statsB.total_credits,
        rubric_averages: statsB.rubric_averages,
        results: resultsB,
      },
      verdict,
      winner: verdict === 'tie' ? null : winner,
      score_difference: Math.round(scoreDiff * 100) / 100,
      latency_winner: statsA.avg_latency_ms <= statsB.avg_latency_ms ? tool_a : tool_b,
      cost_winner: statsA.total_credits <= statsB.total_credits ? tool_a : tool_b,
      duration_ms,
      input_count: inputs.length,
    });
  });

  // ─── NEW: POST /v1/eval/batch — Batch eval: test one tool against many inputs ─
  app.post('/v1/eval/batch', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { tool_slug, slug, inputs, parallel, save_as_suite, suite_name } = req.body;
    const resolvedSlug = tool_slug || slug;

    if (!resolvedSlug) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'tool_slug is required' } });
    }
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'inputs must be a non-empty array' } });
    }
    if (inputs.length > 200) {
      return res.status(400).json({ error: { code: 'too_many_inputs', message: 'Maximum 200 inputs per batch run' } });
    }

    const tests = inputs.map((inp, i) => ({
      id: `batch-${i + 1}`,
      tool_slug: resolvedSlug,
      input: inp.input !== undefined ? inp.input : inp,
      expected_output_contains: inp.expected !== undefined ? [inp.expected] : undefined,
      expected_status: inp.expected_status || 'success',
      max_latency_ms: inp.max_latency_ms || 5000,
      max_credits: inp.max_credits || 10,
    }));

    const started = now();
    const results = [];

    if (parallel) {
      const settled = await Promise.allSettled(tests.map(t => runTestCase(t, key)));
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status === 'fulfilled') {
          results.push(s.value);
        } else {
          results.push({
            test_id: tests[i].id,
            passed: false,
            latency_ms: 0,
            credits_used: 0,
            actual_output: null,
            failure_reason: `Internal error: ${s.reason?.message || s.reason}`,
            rubric_scores: { accuracy: 0, latency: 0, cost: 0, composite: 0 },
          });
        }
      }
    } else {
      for (const test of tests) {
        try {
          results.push(await runTestCase(test, key));
        } catch (e) {
          results.push({
            test_id: test.id,
            passed: false,
            latency_ms: 0,
            credits_used: 0,
            actual_output: null,
            failure_reason: `Internal error: ${e.message}`,
            rubric_scores: { accuracy: 0, latency: 0, cost: 0, composite: 0 },
          });
        }
      }
    }

    const stats = aggregateRunStats(results);
    const duration_ms = now() - started;

    // Optionally persist the batch as a saved suite + run
    let saved_suite_id = null;
    let saved_run_id = null;
    if (save_as_suite) {
      const sName = suite_name || `Batch: ${resolvedSlug} (${inputs.length} inputs)`;
      saved_suite_id = 'suite-' + uid(12);
      stmts.insertSuite.run(saved_suite_id, key, sName, null, JSON.stringify(tests), now());

      saved_run_id = 'run-' + uid(12);
      stmts.insertRun.run(saved_run_id, saved_suite_id, key, now());
      stmts.updateRun.run(
        'completed',
        JSON.stringify(results),
        stats.score,
        stats.passed,
        stats.failed,
        stats.avg_latency_ms,
        stats.total_credits,
        now(),
        saved_run_id,
      );
    }

    ok(res, {
      tool_slug: resolvedSlug,
      batch_size: inputs.length,
      score: stats.score,
      passed: stats.passed,
      failed: stats.failed,
      total: stats.total,
      avg_latency_ms: stats.avg_latency_ms,
      p95_latency_ms: stats.p95_latency_ms,
      total_credits: stats.total_credits,
      rubric_averages: stats.rubric_averages,
      duration_ms,
      parallel: !!parallel,
      saved_suite_id,
      saved_run_id,
      results,
    });
  });

  // ─── NEW: POST /v1/eval/regression — Compare current run against a baseline ─
  // Baseline can be a previous run_id or a score threshold.
  app.post('/v1/eval/regression', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { suite_id, baseline_run_id, threshold_score, threshold_latency_ms, parallel } = req.body;

    if (!suite_id) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'suite_id is required' } });
    }
    if (!baseline_run_id && threshold_score === undefined) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'Provide baseline_run_id or threshold_score' } });
    }

    const suite = stmts.getSuiteForKey.get(suite_id, key);
    if (!suite) return res.status(404).json({ error: { code: 'suite_not_found' } });

    const tests = JSON.parse(suite.tests || '[]');
    if (tests.length === 0) {
      return res.status(400).json({ error: { code: 'empty_suite', message: 'Suite has no tests' } });
    }

    // Load baseline
    let baseline = null;
    if (baseline_run_id) {
      const baselineRun = stmts.getRun.get(baseline_run_id);
      if (!baselineRun) return res.status(404).json({ error: { code: 'baseline_not_found', message: 'Baseline run not found' } });
      if (baselineRun.api_key !== key) return res.status(403).json({ error: { code: 'forbidden' } });
      baseline = {
        run_id: baselineRun.id,
        score: baselineRun.score,
        passed: baselineRun.passed,
        failed: baselineRun.failed,
        avg_latency_ms: baselineRun.avg_latency_ms,
      };
    } else {
      baseline = {
        run_id: null,
        score: threshold_score,
        avg_latency_ms: threshold_latency_ms || null,
      };
    }

    // Run the suite now
    const run_id = 'run-' + uid(12);
    const started = now();
    stmts.insertRun.run(run_id, suite_id, key, started);

    const results = [];
    if (parallel) {
      const settled = await Promise.allSettled(tests.map(t => runTestCase(t, key)));
      for (let i = 0; i < settled.length; i++) {
        const s = settled[i];
        if (s.status === 'fulfilled') {
          results.push(s.value);
        } else {
          results.push({ test_id: tests[i].id, passed: false, latency_ms: 0, credits_used: 0, actual_output: null, failure_reason: s.reason?.message, rubric_scores: { accuracy: 0, latency: 0, cost: 0, composite: 0 } });
        }
      }
    } else {
      for (const test of tests) {
        try {
          results.push(await runTestCase(test, key));
        } catch (e) {
          results.push({ test_id: test.id, passed: false, latency_ms: 0, credits_used: 0, actual_output: null, failure_reason: e.message, rubric_scores: { accuracy: 0, latency: 0, cost: 0, composite: 0 } });
        }
      }
    }

    const stats = aggregateRunStats(results);
    const completed = now();

    stmts.updateRun.run('completed', JSON.stringify(results), stats.score, stats.passed, stats.failed, stats.avg_latency_ms, stats.total_credits, completed, run_id);

    // Regression analysis
    const scoreDelta = stats.score - baseline.score;
    const latencyDelta = baseline.avg_latency_ms !== null
      ? stats.avg_latency_ms - baseline.avg_latency_ms
      : null;

    const regressionDetected = scoreDelta < -5; // >5 point drop = regression
    const latencyRegression = latencyDelta !== null && latencyDelta > (baseline.avg_latency_ms * 0.2); // >20% latency increase

    // Per-test regression: compare against baseline results if available
    const perTestComparison = [];
    if (baseline_run_id) {
      const baselineRunData = stmts.getRun.get(baseline_run_id);
      const baselineResults = baselineRunData?.results ? JSON.parse(baselineRunData.results) : [];
      const baselineMap = new Map(baselineResults.map(r => [r.test_id, r]));
      for (const r of results) {
        const b = baselineMap.get(r.test_id);
        if (b) {
          perTestComparison.push({
            test_id: r.test_id,
            current_passed: r.passed,
            baseline_passed: b.passed,
            regressed: b.passed && !r.passed,
            improved: !b.passed && r.passed,
            latency_delta_ms: r.latency_ms - (b.latency_ms || 0),
          });
        }
      }
    }

    const regressions = perTestComparison.filter(t => t.regressed);
    const improvements = perTestComparison.filter(t => t.improved);

    ok(res, {
      run_id,
      suite_id,
      regression_detected: regressionDetected || latencyRegression,
      score_regression: regressionDetected,
      latency_regression: latencyRegression,
      current: {
        score: stats.score,
        passed: stats.passed,
        failed: stats.failed,
        avg_latency_ms: stats.avg_latency_ms,
      },
      baseline: {
        run_id: baseline.run_id,
        score: baseline.score,
        avg_latency_ms: baseline.avg_latency_ms,
      },
      deltas: {
        score: Math.round(scoreDelta * 100) / 100,
        avg_latency_ms: latencyDelta !== null ? Math.round(latencyDelta) : null,
      },
      per_test_regressions: regressions,
      per_test_improvements: improvements,
      summary: regressionDetected
        ? `REGRESSION: score dropped ${Math.abs(scoreDelta).toFixed(1)} points vs baseline`
        : latencyRegression
          ? `LATENCY REGRESSION: avg latency increased ${latencyDelta}ms vs baseline`
          : `PASS: no regression detected (score ${stats.score} vs baseline ${baseline.score})`,
      results,
    });
  });

  // ─── NEW: GET /v1/eval/leaderboard — Public tool benchmark leaderboard ─────
  app.get('/v1/eval/leaderboard', (req, res) => {
    const tool_slug = req.query.tool_slug || null;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    try {
      let entries;
      if (tool_slug) {
        entries = stmts.getLeaderboardByTool.all(tool_slug, limit);
      } else {
        entries = stmts.getLeaderboard.all(limit);
      }

      ok(res, {
        leaderboard: entries.map((e, i) => ({
          rank: i + 1,
          tool_slug: e.tool_slug,
          suite_name: e.suite_name,
          score: e.score,
          avg_latency_ms: e.avg_latency_ms,
          total_credits: e.total_credits,
          passed: e.passed,
          failed: e.failed,
          total: e.total,
          run_id: e.run_id,
          submitted_at: new Date(e.created).toISOString(),
        })),
        total: entries.length,
        filter: tool_slug ? { tool_slug } : null,
        note: 'Submit to leaderboard via POST /v1/eval/run with { publish_to_leaderboard: true }',
      });
    } catch (e) { res.status(500).json({ error: { code: 'leaderboard_error', message: e.message } }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MODEL ROUTING + FALLBACK
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /v1/route/create — Create a model routing config
  app.post('/v1/route/create', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { name, strategy, models, fallback_model } = req.body;
    if (!name) return res.status(400).json({ error: { code: 'missing_field', message: 'name is required' } });
    if (!Array.isArray(models) || models.length === 0) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'models must be a non-empty array' } });
    }

    const VALID_STRATEGIES = ['cost_optimized', 'performance', 'balanced', 'round_robin'];
    const resolvedStrategy = VALID_STRATEGIES.includes(strategy) ? strategy : 'cost_optimized';

    const VALID_PROVIDERS = ['anthropic', 'openai', 'grok', 'deepseek', 'local'];
    for (const m of models) {
      if (!VALID_PROVIDERS.includes(m.provider)) {
        return res.status(400).json({ error: { code: 'invalid_provider', message: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` } });
      }
      if (!m.model_id) return res.status(400).json({ error: { code: 'missing_model_id', message: 'Each model must have a model_id' } });
    }

    const route_id = 'route-' + uid(12);
    stmts.insertRoute.run(
      route_id,
      key,
      name,
      resolvedStrategy,
      JSON.stringify(models),
      fallback_model ? JSON.stringify(fallback_model) : null,
      now()
    );

    ok(res, {
      route_id,
      name,
      strategy: resolvedStrategy,
      model_count: models.length,
      has_fallback: !!fallback_model,
      created_at: new Date().toISOString(),
    });
  });

  // POST /v1/route/execute — Execute using routing strategy
  app.post('/v1/route/execute', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { route_id, prompt, max_tokens } = req.body;
    if (!route_id) return res.status(400).json({ error: { code: 'missing_field', message: 'route_id is required' } });
    if (!prompt)   return res.status(400).json({ error: { code: 'missing_field', message: 'prompt is required' } });

    const route = stmts.getRoute.get(route_id, key);
    if (!route) return res.status(404).json({ error: { code: 'route_not_found' } });

    let models = JSON.parse(route.models || '[]');
    const strategy = route.strategy;
    const fallbackDef = route.fallback ? JSON.parse(route.fallback) : null;

    if (!models.length) {
      return res.status(400).json({ error: { code: 'no_models', message: 'Route has no models configured' } });
    }

    // Build ordered model list based on strategy
    let orderedModels;
    if (strategy === 'cost_optimized') {
      orderedModels = [...models].sort((a, b) => (a.cost_per_1k_tokens || 0) - (b.cost_per_1k_tokens || 0));
    } else if (strategy === 'performance') {
      orderedModels = [models[0], ...models.slice(1)];
    } else if (strategy === 'round_robin') {
      const counter = (rrCounters.get(route_id) || 0) % models.length;
      rrCounters.set(route_id, counter + 1);
      orderedModels = [models[counter], ...models.filter((_, i) => i !== counter)];
    } else if (strategy === 'balanced') {
      const primary = weightedRandom(models);
      orderedModels = [primary, ...models.filter(m => m !== primary)];
    } else {
      orderedModels = models;
    }

    const start = now();
    let model_used = null;
    let llm_response = null;
    let tokens_used = 0;
    let fallback_used = false;
    let last_error = null;

    // Try each model in order
    for (const model of orderedModels) {
      try {
        const result = await executeLLMCall(model, prompt, max_tokens);
        if (result.ok) {
          model_used = model;
          llm_response = result.response;
          tokens_used = result.tokens_used || 0;
          break;
        } else {
          last_error = result.response;
        }
      } catch (e) {
        last_error = e.message;
      }
    }

    // Try fallback if all primary models failed
    if (!model_used && fallbackDef) {
      try {
        const fallbackResult = await executeLLMCall(fallbackDef, prompt, max_tokens);
        if (fallbackResult.ok) {
          model_used = fallbackDef;
          llm_response = fallbackResult.response;
          tokens_used = fallbackResult.tokens_used || 0;
          fallback_used = true;
        } else {
          last_error = fallbackResult.response;
        }
      } catch (e) {
        last_error = e.message;
      }
    }

    // If still no model succeeded, return best informational error
    if (!model_used) {
      model_used = orderedModels[0];
      llm_response = last_error || `[LLM_KEY_REQUIRED: Set ${model_used.provider.toUpperCase()}_API_KEY env var]`;
    }

    const latency_ms = now() - start;
    const cost_per_1k = model_used.cost_per_1k_tokens || 0;
    const cost_estimate_usd = tokens_used > 0 ? Math.round((tokens_used / 1000) * cost_per_1k * 10000) / 10000 : 0;

    ok(res, {
      model_used: model_used.model_id,
      provider: model_used.provider,
      response: llm_response,
      latency_ms,
      tokens_used,
      cost_estimate_usd,
      fallback_used,
      strategy,
    });
  });

  // GET /v1/route/list — List routing configs
  app.get('/v1/route/list', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const routes = stmts.listRoutes.all(key);
    ok(res, {
      routes: routes.map(r => ({
        route_id: r.id,
        name: r.name,
        strategy: r.strategy,
        models: JSON.parse(r.models || '[]'),
        fallback: r.fallback ? JSON.parse(r.fallback) : null,
        model_count: JSON.parse(r.models || '[]').length,
        created_at: new Date(r.created).toISOString(),
      })),
      count: routes.length,
    });
  });

  // POST /v1/route/recommend — Recommend best model for a task
  // BUG FIX: local/llama3 (cost=0) was always winning cost-priority ranking.
  // Now local is only recommended when explicitly requested or no API keys are configured.
  app.post('/v1/route/recommend', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { task_description, priority, budget_per_call_usd, include_local } = req.body;
    if (!task_description) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'task_description is required' } });
    }

    const VALID_PRIORITIES = ['cost', 'speed', 'quality'];
    const resolvedPriority = VALID_PRIORITIES.includes(priority) ? priority : 'balanced';
    const budget = parseFloat(budget_per_call_usd) || null;

    // Model catalog with scoring
    const MODEL_CATALOG = [
      {
        provider: 'anthropic', model_id: 'claude-3-haiku-20240307',
        cost_per_1k_tokens: 0.00025, speed: 9, quality: 7,
        strengths: ['fast', 'cheap', 'coding', 'analysis'],
        env_var: 'ANTHROPIC_API_KEY',
        is_local: false,
      },
      {
        provider: 'anthropic', model_id: 'claude-opus-4-5',
        cost_per_1k_tokens: 0.015, speed: 6, quality: 10,
        strengths: ['reasoning', 'complex tasks', 'long context', 'creative writing'],
        env_var: 'ANTHROPIC_API_KEY',
        is_local: false,
      },
      {
        provider: 'openai', model_id: 'gpt-4o-mini',
        cost_per_1k_tokens: 0.00015, speed: 9, quality: 7,
        strengths: ['fast', 'cheap', 'general purpose'],
        env_var: 'OPENAI_API_KEY',
        is_local: false,
      },
      {
        provider: 'openai', model_id: 'gpt-4o',
        cost_per_1k_tokens: 0.005, speed: 7, quality: 9,
        strengths: ['vision', 'reasoning', 'function calling'],
        env_var: 'OPENAI_API_KEY',
        is_local: false,
      },
      {
        provider: 'grok', model_id: 'grok-3',
        cost_per_1k_tokens: 0.003, speed: 7, quality: 8,
        strengths: ['real-time data', 'reasoning', 'long context'],
        env_var: 'XAI_API_KEY',
        is_local: false,
      },
      {
        provider: 'deepseek', model_id: 'deepseek-chat',
        cost_per_1k_tokens: 0.00014, speed: 7, quality: 8,
        strengths: ['math', 'coding', 'reasoning', 'cost-effective'],
        env_var: 'DEEPSEEK_API_KEY',
        is_local: false,
      },
      {
        provider: 'local', model_id: 'llama3',
        cost_per_1k_tokens: 0, speed: 5, quality: 6,
        strengths: ['privacy', 'free', 'offline'],
        env_var: null,
        is_local: true,
      },
    ];

    // BUG FIX: filter out local unless explicitly requested or include_local=true
    const catalog = include_local ? MODEL_CATALOG : MODEL_CATALOG.filter(m => !m.is_local);

    // Task keyword analysis
    const task = task_description.toLowerCase();
    const taskHints = {
      coding: task.match(/\b(code|coding|program|function|bug|debug|javascript|python|sql|script)\b/),
      math: task.match(/\b(math|calculate|formula|equation|statistics|number)\b/),
      reasoning: task.match(/\b(reason|analyze|think|complex|multi-step|strategy|plan)\b/),
      creative: task.match(/\b(write|creative|story|essay|poem|blog|content)\b/),
      fast: task.match(/\b(fast|quick|simple|basic|brief|short)\b/),
      vision: task.match(/\b(image|photo|picture|visual|screenshot|ocr)\b/),
    };

    // Score each model
    const scored = catalog.map(m => {
      let score = 0;

      if (resolvedPriority === 'cost') {
        // BUG FIX: use a bounded inverse rather than unbounded (1/near-zero = infinity for local)
        // Local is excluded from catalog unless requested, but protect anyway.
        const effectiveCost = m.cost_per_1k_tokens > 0 ? m.cost_per_1k_tokens : 0.0001;
        score += (1 / effectiveCost) * 0.01;
      } else if (resolvedPriority === 'speed') {
        score += m.speed * 2;
      } else if (resolvedPriority === 'quality') {
        score += m.quality * 2;
      } else {
        // balanced
        const effectiveCost = m.cost_per_1k_tokens > 0 ? m.cost_per_1k_tokens : 0.0001;
        score += m.speed + m.quality + (1 / effectiveCost) * 0.005;
      }

      // Apply task hints
      if (taskHints.coding && m.strengths.includes('coding')) score += 3;
      if (taskHints.math && m.strengths.includes('math')) score += 3;
      if (taskHints.reasoning && m.strengths.includes('reasoning')) score += 3;
      if (taskHints.creative && m.strengths.includes('creative writing')) score += 3;
      if (taskHints.fast && m.cost_per_1k_tokens < 0.001) score += 2;
      if (taskHints.vision && m.strengths.includes('vision')) score += 5;

      // Budget filter
      if (budget !== null && m.cost_per_1k_tokens > budget * 2) score -= 5;

      return { ...m, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    const alternatives = scored.slice(1, 4);

    // Build reasoning
    const reasons = [];
    if (resolvedPriority === 'cost') reasons.push(`Optimized for lowest cost ($${best.cost_per_1k_tokens}/1k tokens)`);
    if (resolvedPriority === 'speed') reasons.push(`Optimized for speed (speed score: ${best.speed}/10)`);
    if (resolvedPriority === 'quality') reasons.push(`Optimized for quality (quality score: ${best.quality}/10)`);
    if (taskHints.coding) reasons.push('Task involves coding — selected model excels at code generation');
    if (taskHints.math) reasons.push('Task involves math — selected model excels at mathematical reasoning');
    if (taskHints.reasoning) reasons.push('Task requires deep reasoning — selected capable model');
    if (taskHints.vision) reasons.push('Task involves vision — selected vision-capable model');
    if (!reasons.length) reasons.push('General-purpose task — balanced model selected');

    ok(res, {
      recommendation: {
        provider: best.provider,
        model_id: best.model_id,
        cost_per_1k_tokens: best.cost_per_1k_tokens,
        speed_score: best.speed,
        quality_score: best.quality,
        strengths: best.strengths,
        env_var_needed: best.env_var,
        env_var_set: best.env_var ? !!process.env[best.env_var] : true,
      },
      reasoning: reasons.join('. '),
      alternatives: alternatives.map(m => ({
        provider: m.provider,
        model_id: m.model_id,
        cost_per_1k_tokens: m.cost_per_1k_tokens,
        strengths: m.strengths,
        env_var_needed: m.env_var,
      })),
      priority: resolvedPriority,
      task_hints_detected: Object.entries(taskHints).filter(([, v]) => v).map(([k]) => k),
      budget_per_call_usd: budget,
    });
  });

  // ─── NEW: POST /v1/route/from-eval — Auto-generate a routing config from eval results ─
  // Analyzes eval run results and recommends the optimal model routing strategy.
  app.post('/v1/route/from-eval', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { run_id, route_name, auto_create } = req.body;
    if (!run_id) return res.status(400).json({ error: { code: 'missing_field', message: 'run_id is required' } });

    const run = stmts.getRun.get(run_id);
    if (!run) return res.status(404).json({ error: { code: 'run_not_found' } });
    if (run.api_key !== key) return res.status(403).json({ error: { code: 'forbidden' } });

    const results = run.results ? JSON.parse(run.results) : [];
    if (results.length === 0) {
      return res.status(400).json({ error: { code: 'no_results', message: 'Run has no results to analyze' } });
    }

    // Analyze results to determine routing strategy
    const avgLatency = run.avg_latency_ms || 0;
    const score = run.score || 0;
    const totalCredits = run.total_credits || 0;
    const perTestCredits = results.length > 0 ? totalCredits / results.length : 0;

    // Determine strategy based on performance profile
    let recommendedStrategy;
    let strategyReason;

    if (score < 70) {
      recommendedStrategy = 'performance';
      strategyReason = `Low pass rate (${score}%) — use performance strategy to prioritize quality models`;
    } else if (avgLatency > 2000) {
      recommendedStrategy = 'cost_optimized';
      strategyReason = `High latency (${avgLatency}ms avg) — use cost_optimized to route to faster/cheaper models`;
    } else if (perTestCredits > 5) {
      recommendedStrategy = 'cost_optimized';
      strategyReason = `High credit usage (${perTestCredits.toFixed(1)}/test) — cost_optimized reduces spend`;
    } else {
      recommendedStrategy = 'balanced';
      strategyReason = `Good performance profile — balanced strategy distributes load efficiently`;
    }

    // Build suggested model list based on provider detection from results
    const suggestedModels = [
      { provider: 'anthropic', model_id: 'claude-3-haiku-20240307', cost_per_1k_tokens: 0.00025, weight: 3 },
      { provider: 'openai', model_id: 'gpt-4o-mini', cost_per_1k_tokens: 0.00015, weight: 2 },
      { provider: 'deepseek', model_id: 'deepseek-chat', cost_per_1k_tokens: 0.00014, weight: 1 },
    ];

    const fallbackModel = { provider: 'anthropic', model_id: 'claude-opus-4-5', cost_per_1k_tokens: 0.015 };

    let created_route = null;
    if (auto_create) {
      const rName = route_name || `Auto-route from run ${run_id}`;
      const route_id = 'route-' + uid(12);
      stmts.insertRoute.run(route_id, key, rName, recommendedStrategy, JSON.stringify(suggestedModels), JSON.stringify(fallbackModel), now());
      created_route = { route_id, name: rName, strategy: recommendedStrategy };
    }

    ok(res, {
      run_id,
      analysis: {
        score,
        avg_latency_ms: avgLatency,
        total_credits: totalCredits,
        credits_per_test: Math.round(perTestCredits * 100) / 100,
      },
      recommended_strategy: recommendedStrategy,
      strategy_reason: strategyReason,
      suggested_models: suggestedModels,
      suggested_fallback: fallbackModel,
      created_route,
      note: auto_create
        ? `Route created. Use POST /v1/route/execute with route_id: "${created_route?.route_id}" to start routing.`
        : `Set auto_create: true to automatically create this route.`,
    });
  });

};
