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

function checkOutputConditions(test, actual_output) {
  const reasons = [];

  if (Array.isArray(test.expected_output_contains)) {
    for (const needle of test.expected_output_contains) {
      const haystack = JSON.stringify(actual_output).toLowerCase();
      if (!haystack.includes(String(needle).toLowerCase())) {
        reasons.push(`expected output to contain "${needle}"`);
      }
    }
  }

  if (Array.isArray(test.expected_output_not_contains)) {
    for (const needle of test.expected_output_not_contains) {
      const haystack = JSON.stringify(actual_output).toLowerCase();
      if (haystack.includes(String(needle).toLowerCase())) {
        reasons.push(`expected output NOT to contain "${needle}"`);
      }
    }
  }

  return reasons;
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

  // Credits check: estimate from response header or body
  const credits_used = actual_output?.meta?.credits_used || actual_output?.data?.credits_used || 1;
  if (credits_used > maxCredits) {
    failureReasons.push(`credits_used ${credits_used} exceeded max ${maxCredits}`);
  }

  // Output condition checks (only when status is success)
  if (isSuccess) {
    const conditionFailures = checkOutputConditions(test, actual_output);
    failureReasons.push(...conditionFailures);
  }

  const passed = failureReasons.length === 0;

  return {
    test_id: test.id,
    passed,
    latency_ms,
    credits_used,
    actual_output,
    failure_reason: passed ? undefined : failureReasons.join('; '),
  };
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
  `);

  // ── Prepared statements ───────────────────────────────────────────────────

  const stmts = {
    // eval_suites
    insertSuite: db.prepare(`
      INSERT INTO eval_suites (id, api_key, name, description, tests, created)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getSuite: db.prepare(`SELECT * FROM eval_suites WHERE id = ?`),
    getSuiteForKey: db.prepare(`SELECT * FROM eval_suites WHERE id = ? AND api_key = ?`),

    // eval_runs
    insertRun: db.prepare(`
      INSERT INTO eval_runs (id, suite_id, api_key, status, results, score, passed, failed, started, completed)
      VALUES (?, ?, ?, 'running', NULL, NULL, NULL, NULL, ?, NULL)
    `),
    updateRun: db.prepare(`
      UPDATE eval_runs SET status = ?, results = ?, score = ?, passed = ?, failed = ?, completed = ? WHERE id = ?
    `),
    getRun: db.prepare(`SELECT * FROM eval_runs WHERE id = ?`),
    listRuns: db.prepare(`SELECT id, suite_id, status, score, passed, failed, started, completed FROM eval_runs WHERE api_key = ? ORDER BY started DESC LIMIT ?`),

    // model_routes
    insertRoute: db.prepare(`
      INSERT INTO model_routes (id, api_key, name, strategy, models, fallback, created)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getRoute: db.prepare(`SELECT * FROM model_routes WHERE id = ? AND api_key = ?`),
    listRoutes: db.prepare(`SELECT * FROM model_routes WHERE api_key = ? ORDER BY created DESC`),
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
      ok(res, { suites: suiteCount, runs: runCount, last_run: lastRun || null, features: ['suite_create', 'run_benchmark', 'model_routing', 'leaderboard'] });
    } catch (e) { res.status(500).json({ error: { code: 'eval_error', message: e.message } }); }
  });

  // GET /v1/eval/list — List eval suites (also /v1/eval/suites)
  const listEvalSuites = (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;
      const suites = db.prepare('SELECT id, name, description, created FROM eval_suites WHERE api_key = ? ORDER BY created DESC LIMIT ? OFFSET ?').all(auth.key, limit, offset);
      const total = db.prepare('SELECT COUNT(*) as c FROM eval_suites WHERE api_key = ?').get(auth.key).c;
      ok(res, { suites, pagination: { total, limit, offset, has_more: offset + limit < total } });
    } catch (e) { res.status(500).json({ error: { code: 'eval_list_error', message: e.message } }); }
  };
  app.get('/v1/eval/list', listEvalSuites);
  app.get('/v1/eval/suites', listEvalSuites);

  // POST /v1/eval/suite/create — Create test suite
  app.post('/v1/eval/suite/create', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { name, description, tests } = req.body;
    if (!name) return res.status(400).json({ error: { code: 'missing_field', message: 'name is required' } });
    if (!Array.isArray(tests) || tests.length === 0) {
      return res.status(400).json({ error: { code: 'missing_field', message: 'tests must be a non-empty array' } });
    }

    // Validate each test
    const VALID_STATUSES = ['success', 'error'];
    for (const t of tests) {
      if (!t.id)        return res.status(400).json({ error: { code: 'invalid_test', message: `Each test must have an id` } });
      if (!t.tool_slug) return res.status(400).json({ error: { code: 'invalid_test', message: `Test "${t.id}" must have a tool_slug` } });
      if (t.expected_status && !VALID_STATUSES.includes(t.expected_status)) {
        return res.status(400).json({ error: { code: 'invalid_test', message: `expected_status must be "success" or "error"` } });
      }
    }

    const suite_id = 'suite-' + uid(12);
    stmts.insertSuite.run(suite_id, key, name, description || null, JSON.stringify(tests), now());

    ok(res, { suite_id, name, description, test_count: tests.length, created_at: new Date().toISOString() });
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

  // POST /v1/eval/run — Execute a test suite
  app.post('/v1/eval/run', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const { suite_id, dry_run } = req.body;
    if (!suite_id) return res.status(400).json({ error: { code: 'missing_field', message: 'suite_id is required' } });

    const suite = stmts.getSuiteForKey.get(suite_id, key);
    if (!suite) return res.status(404).json({ error: { code: 'suite_not_found', message: 'Suite not found or does not belong to this key' } });

    const tests = JSON.parse(suite.tests || '[]');
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
          ],
        })),
        test_count: tests.length,
        message: 'Dry run — no tools executed',
      });
    }

    // Create the run record
    stmts.insertRun.run(run_id, suite_id, key, started);

    // Execute tests sequentially to avoid hammering the server
    const results = [];
    let passed = 0;
    let failed = 0;

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
        });
        failed++;
      }
    }

    const total = tests.length;
    const score = total > 0 ? Math.round((passed / total) * 100 * 100) / 100 : 0;
    const completed = now();

    // Persist the run results
    stmts.updateRun.run('completed', JSON.stringify(results), score, passed, failed, completed, run_id);

    ok(res, {
      run_id,
      suite_id,
      suite_name: suite.name,
      status: 'completed',
      score,
      passed,
      failed,
      total,
      started_at: new Date(started).toISOString(),
      completed_at: new Date(completed).toISOString(),
      duration_ms: completed - started,
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
      started_at: new Date(run.started).toISOString(),
      completed_at: run.completed ? new Date(run.completed).toISOString() : null,
      duration_ms: run.completed ? run.completed - run.started : null,
      results: run.results ? JSON.parse(run.results) : [],
    });
  });

  // GET /v1/eval/runs — List recent runs
  app.get('/v1/eval/runs', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const { key } = auth;

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const runs = stmts.listRuns.all(key, limit);

    ok(res, {
      runs: runs.map(r => ({
        run_id: r.id,
        suite_id: r.suite_id,
        status: r.status,
        score: r.score,
        passed: r.passed,
        failed: r.failed,
        started_at: new Date(r.started).toISOString(),
        completed_at: r.completed ? new Date(r.completed).toISOString() : null,
        duration_ms: r.completed ? r.completed - r.started : null,
      })),
      count: runs.length,
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
        });
        failed++;
      }
    }

    const total = BENCHMARK_TESTS.length;
    const score = total > 0 ? Math.round((passed / total) * 100 * 100) / 100 : 0;
    const duration_ms = now() - started;

    // Grade
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

    ok(res, {
      benchmark: 'slopshop-standard-v1',
      score,
      grade,
      passed,
      failed,
      total,
      duration_ms,
      started_at: new Date(started).toISOString(),
      completed_at: new Date().toISOString(),
      results,
      note: `Standard Slopshop benchmark suite — tests core tool availability and correctness.`,
    });
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
  app.post('/v1/route/recommend', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { task_description, priority, budget_per_call_usd } = req.body;
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
      },
      {
        provider: 'anthropic', model_id: 'claude-opus-4-5',
        cost_per_1k_tokens: 0.015, speed: 6, quality: 10,
        strengths: ['reasoning', 'complex tasks', 'long context', 'creative writing'],
        env_var: 'ANTHROPIC_API_KEY',
      },
      {
        provider: 'openai', model_id: 'gpt-4o-mini',
        cost_per_1k_tokens: 0.00015, speed: 9, quality: 7,
        strengths: ['fast', 'cheap', 'general purpose'],
        env_var: 'OPENAI_API_KEY',
      },
      {
        provider: 'openai', model_id: 'gpt-4o',
        cost_per_1k_tokens: 0.005, speed: 7, quality: 9,
        strengths: ['vision', 'reasoning', 'function calling'],
        env_var: 'OPENAI_API_KEY',
      },
      {
        provider: 'grok', model_id: 'grok-3',
        cost_per_1k_tokens: 0.003, speed: 7, quality: 8,
        strengths: ['real-time data', 'reasoning', 'long context'],
        env_var: 'XAI_API_KEY',
      },
      {
        provider: 'deepseek', model_id: 'deepseek-chat',
        cost_per_1k_tokens: 0.00014, speed: 7, quality: 8,
        strengths: ['math', 'coding', 'reasoning', 'cost-effective'],
        env_var: 'DEEPSEEK_API_KEY',
      },
      {
        provider: 'local', model_id: 'llama3',
        cost_per_1k_tokens: 0, speed: 5, quality: 6,
        strengths: ['privacy', 'free', 'offline'],
        env_var: null,
      },
    ];

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
    const scored = MODEL_CATALOG.map(m => {
      let score = 0;

      if (resolvedPriority === 'cost') {
        score += (1 / (m.cost_per_1k_tokens + 0.00001)) * 0.01; // lower cost = higher score
      } else if (resolvedPriority === 'speed') {
        score += m.speed * 2;
      } else if (resolvedPriority === 'quality') {
        score += m.quality * 2;
      } else {
        // balanced
        score += m.speed + m.quality + (1 / (m.cost_per_1k_tokens + 0.00001)) * 0.005;
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

};
