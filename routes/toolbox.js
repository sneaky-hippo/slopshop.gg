'use strict';
const crypto = require('crypto');
const { API_DEFS } = require('../registry');
const { SCHEMAS } = require('../schemas');

module.exports = function mountToolbox(app, db, apiKeys, auth, allHandlers, persistKey, ipLimits, ollamaRequest, nlScoreAPIs, nlExtractParams, memoryAuth, BODY_LIMIT_COMPUTE) {
  const apiMap = new Map(Object.entries(API_DEFS));


// nl_query_log table for /v1/query/history
db.exec('CREATE TABLE IF NOT EXISTS nl_query_log (id INTEGER PRIMARY KEY AUTOINCREMENT, api_key TEXT, query TEXT, slug TEXT, method TEXT, confidence REAL, result_summary TEXT, ts INTEGER)');
// nl_query_feedback table for feedback loop
db.exec('CREATE TABLE IF NOT EXISTS nl_query_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, api_key TEXT, query_id INTEGER, slug_chosen TEXT, correct INTEGER, ts INTEGER)');

// Levenshtein distance — used by fuzzy stage for typo-tolerant slug matching
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// Fuzzy slug match — returns best slug by Levenshtein similarity against slug tokens
function fuzzySlugMatch(query) {
  const lower = (query || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = lower.split(/\s+/).filter(w => w.length >= 3);
  let bestSlug = null, bestScore = Infinity;
  for (const slug of Object.keys(API_DEFS)) {
    const tokens = slug.split('-').filter(t => t.length >= 3);
    for (const w of words) {
      for (const t of tokens) {
        const d = levenshtein(w, t);
        const norm = d / Math.max(w.length, t.length);
        if (norm < bestScore) { bestScore = norm; bestSlug = slug; }
      }
    }
  }
  return bestScore <= 0.35 ? bestSlug : null;
}

// Compound / pipe detector — returns pipe_suggestion when query implies multi-step work
const PIPE_CONNECTORS = /(and then|then store|and store|and save|and send|and email|and remember|after that|followed by|then (?:hash|encrypt|send|store|save|email|post|upload))/i;
function detectPipeSuggestion(query, scored) {
  if (!query || !PIPE_CONNECTORS.test(query) || scored.length < 2) return null;
  const top = scored.slice(0, 8);
  const first = top[0];
  const second = top.find(s => s.category !== first.category) || top[1];
  if (!second || second.slug === first.slug) return null;
  return {
    steps: [
      { slug: first.slug, name: first.name, input: nlExtractParams(query, first.slug) },
      { slug: second.slug, name: second.name, input: nlExtractParams(query, second.slug) },
    ],
    hint: 'Use POST /v1/chain/create or POST /v1/workflows/run to execute multi-step pipes',
  };
}

// PILLAR 3: /route — Smart API routing (returns best slug + filled params, does NOT execute)
// Returns: { slug, input_filled, confidence, method, alternatives[] }
app.post('/v1/route', auth, (req, res) => {
  const task = req.body.task || req.body.query || '';
  if (!task) return res.status(422).json({ error: { code: 'missing_task' } });

  const { scored, maxPossible } = nlScoreAPIs(task);
  const best = scored[0] || null;
  const method = best ? (best._intent_boost > 0 ? 'keyword' : 'fuzzy') : 'no_match';
  const input_filled = best ? nlExtractParams(task, best.slug) : null;
  const confidence = best ? Math.min(Math.round((best.relevance_score / Math.max(maxPossible, best.relevance_score)) * 100) / 100, 1) : 0;

  function buildExampleCall(item) {
    if (!item) return null;
    const schema = SCHEMAS?.[item.slug];
    const exampleInput = schema?.example?.input || {};
    if (Object.keys(exampleInput).length === 0 && item.input_schema) {
      for (const [k, v] of Object.entries(item.input_schema)) {
        if (v && v.required) {
          if (v.type === 'string') exampleInput[k] = 'example';
          else if (v.type === 'number') exampleInput[k] = 42;
          else if (v.type === 'boolean') exampleInput[k] = true;
          else if (v.type === 'array') exampleInput[k] = [];
          else if (v.type === 'object') exampleInput[k] = {};
        }
      }
    }
    const bodyToUse = input_filled && Object.keys(input_filled).filter(k => k !== 'text' && k !== 'message').length > 0 ? input_filled : exampleInput;
    return { endpoint: '/v1/' + item.slug, body: bodyToUse };
  }

  function buildReason(item) {
    if (!item) return 'No matching API found';
    const parts = [];
    if (item._intent_boost > 0) parts.push('intent keyword match');
    if (item._matched_terms && item._matched_terms.length > 0) parts.push('matched terms: ' + [...new Set(item._matched_terms)].slice(0,3).join(', '));
    if (item.tier === 'compute') parts.push('fast compute tier');
    if (item.credits <= 1) parts.push('low cost');
    return parts.length > 0 ? parts.join('; ') : 'best available match';
  }

  const recommended_call = buildExampleCall(best);
  const pipe_suggestion = detectPipeSuggestion(task, scored);

  res.json({
    ok: true,
    task,
    slug: best ? best.slug : null,
    recommended: best ? best.slug : null,
    recommended_call,
    input_filled,
    confidence,
    method,
    reason: buildReason(best),
    alternatives: scored.slice(1, 4).map(s => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      confidence: Math.min(Math.round((s.relevance_score / Math.max(maxPossible, s.relevance_score)) * 100) / 100, 1),
    })),
    pipe_suggestion,
    example_call: recommended_call,
    _detail: best ? { slug: best.slug, name: best.name, description: best.description, credits: best.credits, tier: best.tier, category: best.category, has_handler: best.has_handler, input_schema: best.input_schema } : null,
    total_matches: scored.length,
    _engine: 'real',
  });
});

// PILLAR 4: /state — Shared state sync (DeepSeek's request)
// Versioned shared state that multiple agents can read/write concurrently
app.post('/v1/state/set', auth, (req, res) => {
  const { key, value, namespace } = req.body;
  if (!key) return res.status(422).json({ error: { code: 'missing_key' } });
  const ns = namespace || 'shared:' + req.apiKey.slice(0, 12);
  const version = Date.now();

  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(
    ns + ':' + key,
    JSON.stringify({ value, version, updated_by: req.apiKey.slice(0, 12), ts: new Date().toISOString() })
  );

  res.json({ ok: true, key, version, namespace: ns, _engine: 'real' });
});

app.post('/v1/state/get', auth, (req, res) => {
  const { key, namespace } = req.body;
  if (!key) return res.status(422).json({ error: { code: 'missing_key' } });
  const ns = namespace || 'shared:' + req.apiKey.slice(0, 12);
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(ns + ':' + key);
  if (!row) return res.json({ ok: true, key, value: null, version: null });
  try {
    const parsed = JSON.parse(row.value);
    res.json({ ok: true, key, ...parsed, namespace: ns, _engine: 'real' });
  } catch(e) {
    res.json({ ok: true, key, value: row.value, namespace: ns, _engine: 'real' });
  }
});

app.post('/v1/state/list', auth, (req, res) => {
  const ns = req.body.namespace || 'shared:' + req.apiKey.slice(0, 12);
  const rows = db.prepare("SELECT key, value FROM agent_state WHERE key LIKE ? || ':%'").all(ns);
  const entries = rows.map(r => {
    const shortKey = r.key.replace(ns + ':', '');
    try { return { key: shortKey, ...JSON.parse(r.value) }; } catch(e) { return { key: shortKey, value: r.value }; }
  });
  res.json({ ok: true, namespace: ns, entries, count: entries.length, _engine: 'real' });
});

// Safe condition evaluator — no arbitrary JS execution (no eval)
// Supports paths: result.field, ctx.field, step_N_result.field
// Operators: ==, !=, >, <, >=, <=, ===, !==, includes, startsWith, endsWith
// Truthy check: "result.field" / negation: "!result.field"
// "result" resolves to the most recent step_N_result in ctx
function evalSafeCondition(condStr, ctx) {
  const str = String(condStr).trim();

  // Resolve root object from prefix name
  function resolveRoot(prefix) {
    if (prefix === 'ctx') return ctx;
    if (prefix === 'result') {
      // Find most recent step result stored in context
      let maxStep = -1;
      for (const k of Object.keys(ctx || {})) {
        const sm = k.match(/^step_(\d+)_result$/);
        if (sm) { const n = parseInt(sm[1]); if (n > maxStep) maxStep = n; }
      }
      return maxStep >= 0 ? ctx['step_' + maxStep + '_result'] : undefined;
    }
    // Direct step_N_result reference
    if (/^step_\d+_result$/.test(prefix) && ctx[prefix] !== undefined) return ctx[prefix];
    return undefined;
  }

  // Resolve a dotted path like "result.score" or "ctx.step_0_result.hash"
  function resolvePath(fullPath) {
    const parts = fullPath.split('.');
    let root = resolveRoot(parts[0]);
    let val = root;
    for (let i = 1; i < parts.length; i++) {
      if (val == null) return undefined;
      val = val[parts[i]];
    }
    return val;
  }

  // Parse RHS literal value
  function parseValue(raw) {
    const v = raw.trim();
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    if (v === 'undefined') return undefined;
    if (/^['"](.*)['"]$/.test(v)) return v.slice(1, -1);
    if (v !== '' && !isNaN(Number(v))) return Number(v);
    return v;
  }

  // Compare helper
  function compare(lhs, op, rhs) {
    switch (op) {
      case '==':  return lhs == rhs;
      case '!=':  return lhs != rhs;
      case '===': return lhs === rhs;
      case '!==': return lhs !== rhs;
      case '>':   return Number(lhs) > Number(rhs);
      case '<':   return Number(lhs) < Number(rhs);
      case '>=':  return Number(lhs) >= Number(rhs);
      case '<=':  return Number(lhs) <= Number(rhs);
      case 'includes':   return typeof lhs === 'string' ? lhs.includes(String(rhs)) : Array.isArray(lhs) ? lhs.includes(rhs) : false;
      case 'startsWith': return typeof lhs === 'string' && lhs.startsWith(String(rhs));
      case 'endsWith':   return typeof lhs === 'string' && lhs.endsWith(String(rhs));
      default: return false;
    }
  }

  // Negation: !result.field
  const negMatch = str.match(/^!(\w+(?:\.\w+)*)$/);
  if (negMatch) return !resolvePath(negMatch[1]);

  // Comparison: path op value
  const cmpMatch = str.match(/^(\w+(?:\.\w+)*)\s*(===|!==|==|!=|>=|<=|>|<|includes|startsWith|endsWith)\s*(.+)$/);
  if (cmpMatch) {
    const [, path, op, rawVal] = cmpMatch;
    return compare(resolvePath(path), op, parseValue(rawVal));
  }

  // Truthy check: result.field
  const truthyMatch = str.match(/^(\w+(?:\.\w+)*)$/);
  if (truthyMatch) return !!resolvePath(truthyMatch[1]);

  return false;
}

// ===== WORKFLOWS — Declarative multi-step conditional chains =====
app.post('/v1/workflows/run', auth, async (req, res) => {
  const { name, steps, input } = req.body;
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return res.status(422).json({ error: { code: 'missing_steps', message: 'Provide steps: [{api, input, condition?}]' } });
  }

  const results = [];
  let context = input || {};
  let totalCredits = 0;
  const startTime = Date.now();

  for (let i = 0; i < Math.min(steps.length, 20); i++) {
    const step = steps[i];

    // Conditional execution
    if (step.condition) {
      try {
        if (!evalSafeCondition(step.condition, context)) {
          results.push({ step: i, api: step.api, skipped: true, reason: 'Condition false: ' + step.condition });
          continue;
        }
      } catch(e) {
        results.push({ step: i, api: step.api, skipped: true, reason: 'Condition error: ' + e.message });
        continue;
      }
    }

    const handler = allHandlers[step.api];
    const def = apiMap.get(step.api);
    if (!handler || !def) {
      results.push({ step: i, api: step.api, error: 'Not found' });
      continue;
    }

    // Merge context into step input
    const stepInput = { ...context, ...(step.input || {}) };

    const acct = apiKeys.get(req.apiKey);
    if (!acct || acct.balance < def.credits) {
      results.push({ step: i, api: step.api, error: 'Insufficient credits' });
      break;
    }
    acct.balance -= def.credits;
    totalCredits += def.credits;

    try {
      const stepStart = Date.now();
      const result = await handler(stepInput);
      const stepMs = Date.now() - stepStart;
      // Pass result forward as context
      if (result && typeof result === 'object') {
        const { _engine, ...clean } = result;
        context = { ...context, ...clean, _prev: clean };
      }
      results.push({ step: i, api: step.api, credits: def.credits, time_ms: stepMs, result: result || {} });
    } catch(e) {
      acct.balance += def.credits;
      totalCredits -= def.credits;
      results.push({ step: i, api: step.api, error: e.message });
      if (!step.continue_on_error) break;
    }
  }

  persistKey(req.apiKey);
  res.json({
    ok: true, name: name || 'unnamed',
    steps_total: steps.length, steps_executed: results.length,
    results, context, total_credits: totalCredits,
    time_ms: Date.now() - startTime, _engine: 'real',
  });
});

// ===== TELEMETRY — Observability, tracing, cost tracking =====
app.get('/v1/telemetry', auth, (req, res) => {
  const keyPrefix = req.apiKey.slice(0, 12) + '...';
  const since = req.query.since || '24h';
  const sinceMs = since.endsWith('h') ? parseInt(since) * 3600000 : since.endsWith('d') ? parseInt(since) * 86400000 : 86400000;
  const cutoff = new Date(Date.now() - sinceMs).toISOString();

  try {
    const calls = db.prepare('SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix = ? AND ts > ? ORDER BY id DESC LIMIT 100').all(keyPrefix, cutoff);
    const totalCredits = calls.reduce((s, c) => s + c.credits, 0);
    const totalCalls = calls.length;
    const avgLatency = totalCalls > 0 ? Math.round(calls.reduce((s, c) => s + (c.latency_ms || 0), 0) / totalCalls) : 0;
    const byApi = {};
    calls.forEach(c => { byApi[c.api] = (byApi[c.api] || 0) + 1; });
    const topApis = Object.entries(byApi).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([api, count]) => ({ api, count }));
    const byEngine = {};
    calls.forEach(c => { byEngine[c.engine || 'unknown'] = (byEngine[c.engine || 'unknown'] || 0) + 1; });

    res.json({
      ok: true, since, period_ms: sinceMs,
      total_calls: totalCalls, total_credits: totalCredits, avg_latency_ms: avgLatency,
      top_apis: topApis, by_engine: byEngine,
      recent: calls.slice(0, 20).map(c => ({ api: c.api, credits: c.credits, latency_ms: c.latency_ms, engine: c.engine, time: c.ts })),
      _engine: 'real',
    });
  } catch(e) {
    res.json({ ok: true, total_calls: 0, total_credits: 0, error: e.message, _engine: 'real' });
  }
});

// ===== EVAL — Evaluate and score agent outputs =====
app.post('/v1/mesh/eval', auth, async (req, res) => {
  const { run_id, output, criteria, task } = req.body;
  if (!output && !run_id) return res.status(422).json({ error: { code: 'missing_output', message: 'Provide output text or run_id' } });

  // Use LLM to evaluate
  const llmHandler = allHandlers['llm-think'] || allHandlers['llm-summarize'];
  if (!llmHandler) return res.json({ ok: true, score: null, message: 'No LLM available for evaluation', _engine: 'real' });

  const evalPrompt = 'Evaluate this AI output on a scale of 1-10. ' +
    (criteria ? 'Criteria: ' + criteria + '. ' : 'Criteria: accuracy, completeness, actionability. ') +
    (task ? 'Original task: ' + task + '. ' : '') +
    'Output to evaluate: ' + String(output || run_id).slice(0, 2000) +
    '. Respond with JSON: {"score": number, "reasoning": string, "improvements": string[]}';

  try {
    const result = await llmHandler({ text: evalPrompt });
    let score = null, reasoning = '', improvements = [];
    const answer = result?.answer || result?.summary || '';
    try {
      const parsed = JSON.parse(answer.replace(/```json\s*/g, '').replace(/```/g, '').trim());
      score = parsed.score;
      reasoning = parsed.reasoning;
      improvements = parsed.improvements;
    } catch(e) {
      // Extract score from text
      const scoreMatch = answer.match(/(\d+)\s*\/\s*10/);
      score = scoreMatch ? parseInt(scoreMatch[1]) : null;
      reasoning = answer.slice(0, 300);
    }

    res.json({ ok: true, score, reasoning, improvements, _engine: 'real' });
  } catch(e) {
    res.json({ ok: true, score: null, error: e.message, _engine: 'real' });
  }
});


// ===== COMPARE — Side-by-side multi-LLM comparison (unanimously requested by all 4 LLMs) =====
app.post('/v1/compare', auth, async (req, res) => {
  const prompt = req.body.prompt || req.body.text || '';
  const models = req.body.models || ['anthropic', 'openai', 'grok', 'deepseek'];
  if (!prompt) return res.status(422).json({ error: { code: 'missing_prompt' } });

  const results = [];
  for (const provider of models) {
    const start = Date.now();
    try {
      const handler = allHandlers['llm-think'];
      if (!handler) { results.push({ provider, error: 'no handler' }); continue; }
      const result = await handler({ text: prompt, provider });
      const ms = Date.now() - start;
      let answer = result?.answer || result?.summary || '';
      answer = String(answer).trim();
      if (answer.startsWith('{')) try { answer = JSON.parse(answer).answer || answer; } catch(e) {}
      results.push({ provider, model: result?._model || provider, answer: answer.slice(0, 500), latency_ms: ms, credits: 10 });
    } catch(e) {
      results.push({ provider, error: e.message, latency_ms: Date.now() - start });
    }
  }

  // Sort alphabetically by provider (length is not a quality metric)
  results.sort((a, b) => (a.provider || '').localeCompare(b.provider || ''));
  results.forEach((r, i) => r.rank = i + 1);

  const totalCredits = results.filter(r => !r.error).length * 10;
  const acct = apiKeys.get(req.apiKey);
  if (acct) acct.balance -= totalCredits;
  persistKey(req.apiKey);

  res.json({
    ok: true, prompt: prompt.slice(0, 200),
    providers_queried: models.length,
    results, total_credits: totalCredits,
    fastest: results.filter(r => r.latency_ms).sort((a, b) => a.latency_ms - b.latency_ms)[0]?.provider,
    slowest: results.filter(r => r.latency_ms).sort((a, b) => b.latency_ms - a.latency_ms)[0]?.provider,
    cost_per_model: results.filter(r => !r.error).reduce((o, r) => { o[r.provider] = r.credits + 'cr'; return o; }, {}),
    avg_latency_ms: Math.round(results.filter(r => r.latency_ms).reduce((s, r) => s + r.latency_ms, 0) / results.filter(r => r.latency_ms).length),
    _engine: 'static',
  });
});

// ===== ONBOARDING — Interactive quickstart (requested by GPT, Grok, DeepSeek, Mistral) =====
app.get('/v1/quickstart/interactive', auth, async (req, res) => {
  const steps = [
    { step: 1, title: 'Store your first memory', command: 'slop memory set mykey "hello world"', api: 'memory-set', credits: 0, why: 'Memory is free and permanent — the foundation of the Dream Engine' },
    { step: 2, title: 'Start a Dream session', command: 'curl -X POST /v1/memory/dream/start -d \'{"strategy":"synthesize"}\'', api: '/v1/memory/dream/start', credits: 10, why: 'The Dream Engine synthesizes your memories into compressed insights while you sleep' },
    { step: 3, title: 'Create a team memory space', command: 'curl -X POST /v1/memory/share/create -d \'{"name":"my-team"}\'', api: '/v1/memory/share/create', credits: 0, why: 'Multiplayer Memory — share intelligence with teammates and agents in real time' },
    { step: 4, title: 'Ask all models at once', command: 'slop call llm-council --text "What should I build?"', api: 'llm-council', credits: 40, why: 'Multi-model intelligence: Claude, Grok, GPT, and any local model' },
    { step: 5, title: 'Launch an agent team', command: 'slop org launch --template dev-agency', api: 'org/launch', credits: 5, why: 'Swarms of agents share memory and dream together — the Living Backend OS' },
  ];

  // Auto-execute step 1 to show immediate value
  const demo = await (async () => {
    try {
      const handler = allHandlers['crypto-uuid'];
      if (handler) return await handler({});
      return null;
    } catch(e) { return null; }
  })();

  res.json({
    ok: true,
    welcome: 'Welcome to Slopshop — The Living Agentic Backend OS. Dream Engine + Multiplayer Memory: agents that synthesize knowledge overnight, teams that share intelligence in real time.',
    headline: 'Our north star: Dream Engine (REM-style memory consolidation) + Multiplayer Memory (shared team intelligence). Everything else is built around these two primitives.',
    your_balance: req.acct.balance,
    steps,
    demo_result: demo ? { uuid: demo.uuid, _engine: demo._engine } : null,
    next: 'Try: curl -X POST ' + req.protocol + '://' + req.get('host') + '/v1/crypto-uuid -H "Authorization: Bearer YOUR_KEY"',
    docs: 'https://slopshop.gg/docs',
    _engine: 'real',
  });
});

// ===== STATUS DASHBOARD (requested by DeepSeek, Grok) =====
app.get('/v1/status/dashboard', (req, res) => {
  const uptime = Math.floor((Date.now() - serverStart) / 1000);
  const mem = process.memoryUsage();

  let recentCalls = 0, recentErrors = 0;
  try {
    recentCalls = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE ts > datetime('now', '-1 hour')").get().c;
    recentErrors = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE engine = 'error' AND ts > datetime('now', '-1 hour')").get().c;
  } catch(e) {}

  const providers = ['anthropic', 'openai', 'grok', 'deepseek'].filter(p => {
    const envMap = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', grok: 'XAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
    return process.env[envMap[p]];
  });

  res.json({
    ok: true,
    status: 'operational',
    version: '3.7.1',
    uptime_seconds: uptime,
    uptime_human: Math.floor(uptime / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm',
    apis: apiCount,
    handlers: Object.keys(allHandlers).length,
    llm_providers: providers,
    memory_mb: Math.round(mem.heapUsed / 1048576),
    recent_1h: { calls: recentCalls, errors: recentErrors, error_rate: recentCalls > 0 ? (recentErrors / recentCalls * 100).toFixed(1) + '%' : '0%' },
    sqlite_tables: db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get().c,
    features: { dream_engine: true, multiplayer_memory: true, workflows: true, telemetry: true, eval: true, compare: true, mesh: true, byok: true, memory_2fa: true, sybil_protection: true },
    headline_products: {
      dream_engine: 'REM-style memory consolidation — agents synthesize and evolve their knowledge overnight. POST /v1/memory/dream/start',
      multiplayer_memory: 'Shared memory spaces with collaborator invites — teams share intelligence in real time. POST /v1/memory/share/create',
    },
    _engine: 'real',
  });
});

// ===== BENCHMARK — On-demand performance test (requested by Claude, Grok) =====
// ===== BENCHMARK with REAL test vectors — known correct answers for 50+ endpoints =====
const TEST_VECTORS = {
  'crypto-hash-sha256': { input: { text: 'hello' }, expect: d => d.hash === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' },
  'crypto-hash-sha512': { input: { text: 'hello' }, expect: d => typeof d.hash === 'string' && d.hash.length === 128 },
  'crypto-hash-md5': { input: { text: 'hello' }, expect: d => d.hash === '5d41402abc4b2a76b9719d911017c592' },
  'crypto-uuid': { input: {}, expect: d => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(d.uuid) },
  'crypto-nanoid': { input: { size: 10 }, expect: d => typeof d.id === 'string' && d.id.length === 10 },
  'crypto-password-generate': { input: { length: 20 }, expect: d => typeof d.password === 'string' && d.password.length === 20 },
  'crypto-random-bytes': { input: { size: 16 }, expect: d => typeof d.hex === 'string' && d.hex.length === 32 },
  'crypto-random-int': { input: { min: 1, max: 10 }, expect: d => d.result >= 1 && d.result <= 10 },
  'crypto-otp-generate': { input: { digits: 6 }, expect: d => /^\d{6}$/.test(d.otp) },
  'crypto-hmac': { input: { text: 'hello', secret: 'key' }, expect: d => typeof d.hmac === 'string' && d.hmac.length === 64 },
  'crypto-encrypt-aes': { input: { text: 'secret', key: 'mykey' }, expect: d => typeof d.encrypted === 'string' && typeof d.iv === 'string' && typeof d.tag === 'string' },
  'crypto-checksum-file': { input: { content: 'test' }, expect: d => typeof d.md5 === 'string' && typeof d.sha256 === 'string' },
  'math-evaluate': { input: { expression: '2+2' }, expect: d => d.result === 4 },
  'math-fibonacci': { input: { n: 7 }, expect: d => Array.isArray(d.sequence) && d.sequence.length === 7 && d.sequence[6] === 8 },
  'math-prime-check': { input: { n: 17 }, expect: d => d.isPrime === true },
  'math-gcd': { input: { a: 12, b: 8 }, expect: d => d.gcd === 4 },
  'math-lcm': { input: { a: 4, b: 6 }, expect: d => d.lcm === 12 },
  'math-statistics': { input: { numbers: [1, 2, 3, 4, 5] }, expect: d => d.mean === 3 && d.median === 3 && d.min === 1 && d.max === 5 },
  'math-percentile': { input: { numbers: [10, 20, 30, 40, 50], percentile: 50 }, expect: d => d.value === 30 },
  'math-base-convert': { input: { value: '255', from: 10, to: 16 }, expect: d => d.result === 'ff' },
  'math-currency-convert': { input: { amount: 100, from: 'USD', to: 'USD' }, expect: d => d.result === 100 },
  'math-unit-convert': { input: { value: 1000, from: 'g', to: 'kg' }, expect: d => d.result === 1 },
  'math-percentage-change': { input: { from: 50, to: 75 }, expect: d => d.change === 50 && d.direction === 'increase' },
  'math-compound-interest': { input: { principal: 1000, rate: 0.1, years: 1, n: 1 }, expect: d => d.finalAmount === 1100 },
  'math-color-convert': { input: { hex: '#ff0000' }, expect: d => d.rgb && d.rgb.r === 255 && d.rgb.g === 0 && d.rgb.b === 0 },
  'math-number-format': { input: { number: 1234.5, decimals: 2 }, expect: d => typeof d.result === 'string' },
  'math-roi-calculate': { input: { cost: 100, revenue: 150 }, expect: d => d.profit === 50 && d.roi === 50 },
  'stats-mean': { input: { data: [2, 4, 6] }, expect: d => d.mean === 4 },
  'stats-median': { input: { data: [1, 3, 5, 7, 9] }, expect: d => d.median === 5 },
  'stats-stddev': { input: { data: [2, 4, 4, 4, 5, 5, 7, 9] }, expect: d => typeof d.stddev === 'number' && d.stddev > 0 },
  'stats-summary': { input: { data: [1, 2, 3, 4, 5] }, expect: d => d.count === 5 && d.min === 1 && d.max === 5 },
  'text-word-count': { input: { text: 'a b c' }, expect: d => d.words === 3 },
  'text-char-count': { input: { text: 'hello' }, expect: d => d.withSpaces === 5 && d.letters === 5 },
  'text-reverse': { input: { text: 'abc' }, expect: d => d.result === 'cba' },
  'text-slugify': { input: { text: 'Hello World!' }, expect: d => d.slug === 'hello-world' },
  'text-case-convert': { input: { text: 'hello world', to: 'upper' }, expect: d => d.result === 'HELLO WORLD' },
  'text-base64-encode': { input: { text: 'hello' }, expect: d => d.result === 'aGVsbG8=' },
  'text-base64-decode': { input: { text: 'aGVsbG8=' }, expect: d => d.result === 'hello' },
  'text-url-encode': { input: { text: 'hello world' }, expect: d => d.result === 'hello%20world' },
  'text-url-decode': { input: { text: 'hello%20world' }, expect: d => d.result === 'hello world' },
  'text-hex-encode': { input: { text: 'hi' }, expect: d => d.result === '6869' },
  'text-hex-decode': { input: { text: '6869' }, expect: d => d.result === 'hi' },
  'text-rot13': { input: { text: 'hello' }, expect: d => d.result === 'uryyb' },
  'text-extract-emails': { input: { text: 'mail me at test@example.com please' }, expect: d => d.count === 1 && d.emails[0] === 'test@example.com' },
  'text-extract-urls': { input: { text: 'go to https://example.com now' }, expect: d => d.count === 1 && d.urls[0] === 'https://example.com' },
  'text-extract-numbers': { input: { text: 'I have 3 cats and 5 dogs' }, expect: d => d.count === 2 && d.numbers.includes(3) && d.numbers.includes(5) },
  'text-extract-hashtags': { input: { text: '#hello #world' }, expect: d => d.count === 2 },
  'text-extract-mentions': { input: { text: 'hey @alice and @bob' }, expect: d => d.count === 2 },
  'text-json-validate': { input: { text: '{"a":1}' }, expect: d => d.valid === true },
  'text-strip-html': { input: { text: '<b>bold</b>' }, expect: d => d.result === 'bold' },
  'text-escape-html': { input: { text: '<div>' }, expect: d => d.result === '&lt;div&gt;' },
  'text-unescape-html': { input: { text: '&lt;div&gt;' }, expect: d => d.result === '<div>' },
  'text-sentence-split': { input: { text: 'Hello. World.' }, expect: d => d.count === 2 },
  'text-csv-to-json': { input: { text: 'a,b\n1,2' }, expect: d => Array.isArray(d.data) && d.data.length === 1 && d.data[0].a === '1' },
  'text-regex-test': { input: { text: 'abc123', pattern: '\\d+' }, expect: d => d.matched === true && d.count >= 1 },
  'text-profanity-check': { input: { text: 'hello friend' }, expect: d => d.clean === true && d.count === 0 },
  'text-language-detect': { input: { text: 'the quick brown fox jumps over the lazy dog' }, expect: d => d.detected === 'english' },
  'text-deduplicate-lines': { input: { text: 'a\nb\na\nc' }, expect: d => d.unique === 3 && d.duplicatesRemoved === 1 },
  'text-sort-lines': { input: { text: 'c\na\nb' }, expect: d => d.result === 'a\nb\nc' },
  'text-json-format': { input: { text: '{"a":1}', minify: true }, expect: d => d.result === '{"a":1}' && d.valid === true },
  'text-json-flatten': { input: { data: { a: { b: 1 } } }, expect: d => d.result && d.result['a.b'] === 1 },
  'text-yaml-to-json': { input: { text: 'name: test\nvalue: 42' }, expect: d => d.data && d.data.name === 'test' && d.data.value === 42 },
  'text-markdown-to-html': { input: { text: '**bold**' }, expect: d => typeof d.html === 'string' && d.html.includes('<strong>bold</strong>') },
  'text-count-frequency': { input: { text: 'the cat sat on the mat', mode: 'word' }, expect: d => d.frequency && d.frequency.the === 2 },
  'date-weekday': { input: { date: '2024-01-01' }, expect: d => d.weekday === 'Monday' },
  'date-diff': { input: { from: '2024-01-01', to: '2024-01-31' }, expect: d => d.days === 30 },
  'date-unix-to-iso': { input: { timestamp: 0 }, expect: d => typeof d.iso === 'string' && d.iso.startsWith('1970') },
  'gen-slug': { input: { text: 'My Cool API' }, expect: d => typeof d.slug === 'string' && d.slug === 'my-cool-api' },
  'gen-short-id': { input: {}, expect: d => typeof d.id === 'string' && d.id.length > 0 },
  'code-semver-compare': { input: { a: '1.2.3', b: '1.3.0' }, expect: d => d.result === -1 || d.comparison === -1 || d.a_less === true || (typeof d.result === 'number' && d.result < 0) },
};

app.post('/v1/eval/benchmark', auth, async (req, res) => {
  // Alias — forwards to the main benchmark handler below
  req.query.tool_slugs = req.body?.tool_slugs?.join(',');
  req.query.test_count = req.body?.test_count;
  return benchmarkHandler(req, res);
});
const benchmarkHandler = async (req, res) => {
  const results = [];
  let passed = 0, failed = 0, skipped = 0, errors = 0;

  for (const [slug, vector] of Object.entries(TEST_VECTORS)) {
    const handler = allHandlers[slug];
    if (!handler) { results.push({ api: slug, status: 'SKIP', reason: 'no handler' }); skipped++; continue; }

    const times = [];
    let output = null;
    let testPassed = false;
    let testError = null;

    for (let i = 0; i < 3; i++) {
      const start = process.hrtime.bigint();
      try {
        const result = await handler(vector.input);
        if (i === 0) output = result;
        times.push(Number(process.hrtime.bigint() - start) / 1e6);
      } catch (e) {
        times.push(Number(process.hrtime.bigint() - start) / 1e6);
        if (i === 0) testError = e.message;
      }
    }

    if (testError) {
      results.push({ api: slug, status: 'ERROR', error: testError, p50_ms: times.length >= 2 ? +times.sort((a, b) => a - b)[1].toFixed(3) : null });
      errors++;
      continue;
    }

    try {
      testPassed = vector.expect(output);
    } catch (e) {
      testPassed = false;
      testError = 'Assertion threw: ' + e.message;
    }

    times.sort((a, b) => a - b);
    const entry = {
      api: slug,
      status: testPassed ? 'PASS' : 'FAIL',
      p50_ms: times.length >= 2 ? +times[1].toFixed(3) : +times[0].toFixed(3),
      min_ms: +times[0].toFixed(3),
      max_ms: +times[times.length - 1].toFixed(3),
    };
    if (!testPassed) entry.output_sample = JSON.stringify(output).slice(0, 200);
    if (testError) entry.error = testError;
    results.push(entry);
    if (testPassed) passed++; else failed++;
  }

  res.json({
    ok: true,
    summary: { total: results.length, passed, failed, skipped, errors, pass_rate: results.length > 0 ? +(passed / (passed + failed + errors) * 100).toFixed(1) : 0 },
    benchmark: results,
    total_handlers: Object.keys(allHandlers).length,
    total_test_vectors: Object.keys(TEST_VECTORS).length,
    avg_p50_ms: +(results.filter(r => r.p50_ms != null).reduce((s, r) => s + r.p50_ms, 0) / Math.max(results.filter(r => r.p50_ms != null).length, 1)).toFixed(3),
    _engine: 'real',
  });
};
app.get('/v1/benchmark', auth, benchmarkHandler);


// Machine-readable documentation endpoint
app.get('/v1/docs/overview', (req, res) => {
  const categories = {};
  for (const [slug, def] of Object.entries(API_DEFS)) {
    if (!categories[def.cat]) categories[def.cat] = { count: 0, apis: [] };
    categories[def.cat].count++;
    categories[def.cat].apis.push({ slug, name: def.name, credits: def.credits });
  }
  res.json({
    ok: true,
    version: '3.7.1',
    total_apis: Object.keys(API_DEFS).length,
    categories: Object.entries(categories).map(([name, data]) => ({ name, count: data.count, sample_apis: data.apis.slice(0, 3) })),
    llm_providers: ['anthropic (Claude)', 'openai (GPT)', 'grok (xAI)', 'deepseek', 'ollama (local)'],
    key_endpoints: [
      { path: '/v1/agent/run', desc: 'Autonomous agent — describe task, get results' },
      { path: '/v1/compare', desc: 'Side-by-side multi-LLM comparison' },
      { path: '/v1/llm-think', desc: 'Ask any LLM to reason (provider=anthropic|openai|grok|deepseek)' },
      { path: '/v1/llm-council', desc: 'Get all LLMs to answer same question' },
      { path: '/v1/org/launch', desc: 'Launch multi-agent organization' },
      { path: '/v1/workflows/run', desc: 'Multi-step conditional workflow' },
      { path: '/v1/introspect', desc: 'Discover any API schema' },
      { path: '/v1/context/session', desc: 'Get execution context for LLMs' },
      { path: '/v1/memory-set', desc: 'Free persistent memory' },
      { path: '/v1/quickstart/interactive', desc: 'Guided 5-step onboarding' },
    ],
    quickstart: 'npm install -g slopshop && slop signup && slop call crypto-uuid',
    _engine: 'real',
  });
});
// ===== API EXPLORER — Try any API with live results (Claude's #1 request for 9.5) =====
app.post('/v1/explorer/try', auth, async (req, res) => {
  const { slug, input } = req.body;
  if (!slug) return res.status(422).json({ error: { code: 'missing_slug', hint: 'GET /v1/introspect to discover APIs' } });

  const def = apiMap.get(slug);
  const handler = allHandlers[slug];
  const schema = SCHEMAS?.[slug] || {};

  if (!def) return res.status(404).json({ error: { code: 'not_found', slug, similar: Object.keys(API_DEFS).filter(s => s.includes(slug.split('-')[0])).slice(0, 5) } });

  const result = { slug, name: def.name, category: def.cat, credits: def.credits, tier: def.tier, input_schema: schema.input || null };

  if (!handler) {
    result.executable = false;
    result.reason = 'No handler (needs external key or not implemented)';
    return res.json({ ok: true, ...result, _engine: 'real' });
  }

  // Execute with timing
  result.executable = true;
  const acct = apiKeys.get(req.apiKey);
  if (!acct || acct.balance < def.credits) return res.status(402).json({ error: { code: 'insufficient_credits', need: def.credits } });

  acct.balance -= def.credits;
  const start = process.hrtime.bigint();
  try {
    const output = await handler(input || {});
    const latencyNs = Number(process.hrtime.bigint() - start);
    result.output = output;
    result.latency_ms = +(latencyNs / 1e6).toFixed(3);
    result.latency_us = +(latencyNs / 1e3).toFixed(1);
    result.cost_usd = '$' + (def.credits * 0.009).toFixed(4);
  } catch(e) {
    acct.balance += def.credits;
    result.error = e.message;
    result.latency_ms = +(Number(process.hrtime.bigint() - start) / 1e6).toFixed(3);
  }
  persistKey(req.apiKey);
  result.balance_after = acct.balance;

  res.json({ ok: true, ...result, _engine: 'real' });
});

// List all executable APIs for the explorer
app.get('/v1/explorer/apis', auth, (req, res) => {
  const category = req.query.category || '';
  const q = req.query.q || '';
  let apis = Object.entries(API_DEFS).map(([slug, def]) => ({
    slug, name: def.name, category: def.cat, credits: def.credits, tier: def.tier,
    executable: !!allHandlers[slug],
    has_schema: !!SCHEMAS?.[slug],
  }));
  if (category) apis = apis.filter(a => a.category.toLowerCase().includes(category.toLowerCase()));
  if (q) apis = apis.filter(a => a.slug.includes(q) || a.name.toLowerCase().includes(q));
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json({ ok: true, total: apis.length, apis: apis.slice(0, limit), categories: [...new Set(apis.map(a => a.category))], _engine: 'real' });
});

// ===== BILLING/USAGE — Real-time cost tracking (GPT's 10/10 request) =====
app.get('/v1/billing/usage', auth, (req, res) => {
  const keyPrefix = req.apiKey.slice(0, 12) + '...';
  const period = req.query.period || '24h';
  const periodMs = period.endsWith('h') ? parseInt(period) * 3600000 : period.endsWith('d') ? parseInt(period) * 86400000 : 86400000;
  const cutoff = new Date(Date.now() - periodMs).toISOString();

  try {
    const calls = db.prepare('SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix = ? AND ts > ? ORDER BY id DESC').all(keyPrefix, cutoff);
    const byApi = {};
    let totalCredits = 0, totalCalls = 0;
    for (const c of calls) {
      totalCredits += c.credits;
      totalCalls++;
      if (!byApi[c.api]) byApi[c.api] = { calls: 0, credits: 0, avg_latency: 0, total_latency: 0 };
      byApi[c.api].calls++;
      byApi[c.api].credits += c.credits;
      byApi[c.api].total_latency += (c.latency_ms || 0);
    }
    const breakdown = Object.entries(byApi).map(([api, d]) => ({
      api, calls: d.calls, credits: d.credits, cost_usd: '$' + (d.credits * 0.009).toFixed(4),
      avg_latency_ms: d.calls > 0 ? Math.round(d.total_latency / d.calls) : 0,
    })).sort((a, b) => b.credits - a.credits);

    res.json({
      ok: true, period, total_calls: totalCalls, total_credits: totalCredits,
      total_cost_usd: '$' + (totalCredits * 0.009).toFixed(2),
      balance: req.acct.balance, tier: req.acct.tier,
      breakdown: breakdown.slice(0, 30),
      _engine: 'real',
    });
  } catch(e) {
    res.json({ ok: true, total_calls: 0, total_credits: 0, error: e.message, _engine: 'real' });
  }
});

// ===== API VERSIONING (Grok's 10/10 request) =====
app.get('/v1/api/versions', (req, res) => {
  res.json({
    ok: true,
    current: '3.6.0',
    api_version: '2026.03.28',
    supported: ['v1'],
    deprecated: [],
    changelog_url: '/v1/changelog',
    migration_guides: [],
    _engine: 'real',
  });
});

// ===== LOAD-BALANCED COMPLETIONS (DeepSeek's 10/10 request) =====
app.post('/v1/completions', auth, async (req, res) => {
  const prompt = req.body.prompt || req.body.text || req.body.messages?.[0]?.content || '';
  if (!prompt) return res.status(422).json({ error: { code: 'missing_prompt' } });
  const preferredProvider = req.body.provider || req.body.model?.split('/')[0];
  const providers = ['anthropic', 'openai', 'grok', 'deepseek'];
  const envMap = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', grok: 'XAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
  const available = providers.filter(p => process.env[envMap[p]]);

  // Try preferred, then failover to others
  const order = preferredProvider && available.includes(preferredProvider)
    ? [preferredProvider, ...available.filter(p => p !== preferredProvider)]
    : available;

  for (const provider of order) {
    try {
      const handler = allHandlers['llm-think'];
      if (!handler) continue;
      const start = Date.now();
      const result = await handler({ text: prompt, provider });
      const latency = Date.now() - start;
      let answer = result?.answer || result?.summary || '';
      if (answer.startsWith('{')) try { answer = JSON.parse(answer).answer || answer; } catch(e) {}

      const acct = apiKeys.get(req.apiKey);
      if (acct) { acct.balance -= 10; persistKey(req.apiKey); }

      return res.json({
        ok: true, provider, model: result?._model || provider,
        text: answer, latency_ms: latency, credits: 10,
        failover: provider !== order[0], available_providers: available,
        _engine: 'real',
      });
    } catch(e) { continue; }
  }
  res.status(503).json({ error: { code: 'all_providers_failed', tried: order } });
});

// ===== SECURITY AUDIT LOG (GPT's 10/10 request) =====
app.get('/v1/security/audit', auth, (req, res) => {
  const keyPrefix = req.apiKey.slice(0, 12) + '...';
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const logs = db.prepare('SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix = ? ORDER BY id DESC LIMIT ?').all(keyPrefix, limit);
    res.json({ ok: true, entries: logs, count: logs.length, key_prefix: keyPrefix, _engine: 'real' });
  } catch(e) {
    res.json({ ok: true, entries: [], error: e.message, _engine: 'real' });
  }
});

// ===== STREAM LIFECYCLE (Claude's 10/10 #1) =====
const activeStreams = new Map();
app.post('/v1/completions/:id/cancel', auth, (req, res) => {
  const stream = activeStreams.get(req.params.id);
  if (stream) { stream.destroyed = true; activeStreams.delete(req.params.id); }
  res.json({ ok: true, id: req.params.id, cancelled: !!stream, _engine: 'real' });
});
app.get('/v1/completions/:id/status', auth, (req, res) => {
  const stream = activeStreams.get(req.params.id);
  res.json({ ok: true, id: req.params.id, active: !!stream, _engine: 'real' });
});

// ===== PER-KEY USAGE AUDIT (Claude's 10/10 #2) =====
app.get('/v1/audit/key/:prefix', auth, (req, res) => {
  const prefix = req.params.prefix;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  try {
    const logs = db.prepare('SELECT api, credits, latency_ms, engine, ts FROM audit_log WHERE key_prefix LIKE ? ORDER BY id DESC LIMIT ?').all(prefix + '%', limit);
    const totalCredits = logs.reduce((s, l) => s + l.credits, 0);
    res.json({ ok: true, key_prefix: prefix, entries: logs, count: logs.length, total_credits: totalCredits, _engine: 'real' });
  } catch(e) {
    res.json({ ok: true, entries: [], error: e.message, _engine: 'real' });
  }
});

// ===== RATE LIMIT STATUS (enterprise-grade observability) =====
app.get('/v1/ratelimit/status', auth, (req, res) => {
  const rlKey = 'api:' + req.apiKey;
  const entry = ipLimits.get(rlKey);
  const rlMax = req.acct.tier === 'leviathan' ? 1000 : req.acct.tier === 'reef-boss' ? 300 : 120;
  res.json({
    ok: true, tier: req.acct.tier, max_per_minute: rlMax,
    used: entry ? entry.c : 0,
    remaining: entry ? Math.max(0, rlMax - entry.c) : rlMax,
    resets_at: entry ? new Date(entry.s + 60000).toISOString() : null,
    _engine: 'real',
  });
});

// ===== DEPENDENCY CHECK (Claude's implicit ask: prove APIs work) =====
app.get('/v1/healthcheck/deep', auth, async (req, res) => {
  const checks = [];
  const test = async (name, fn) => {
    const start = Date.now();
    try { const r = await fn(); checks.push({ name, ok: true, ms: Date.now() - start }); }
    catch(e) { checks.push({ name, ok: false, ms: Date.now() - start, error: e.message }); }
  };
  await test('sqlite', () => db.prepare('SELECT 1').get());
  await test('compute', () => allHandlers['crypto-uuid']({}));
  await test('memory', () => allHandlers['memory-set'] ? allHandlers['memory-set']({ key: '_healthcheck', value: Date.now().toString(), namespace: '_system' }) : Promise.reject('no handler'));
  await test('state', () => db.prepare("INSERT OR REPLACE INTO agent_state (key, value) VALUES ('_healthcheck', ?)").run(Date.now().toString()));

  if (process.env.ANTHROPIC_API_KEY) {
    await test('anthropic', () => allHandlers['llm-think'] ? allHandlers['llm-think']({ text: 'OK', provider: 'anthropic' }) : Promise.reject('no handler'));
  }

  const passing = checks.filter(c => c.ok).length;
  res.json({
    ok: true, healthy: passing === checks.length,
    checks, passing, total: checks.length,
    timestamp: new Date().toISOString(),
    _engine: 'real',
  });
});

// ===== GUARDRAILS — Content safety + PII + prompt injection (Claude roadmap #1) =====
const PII_PATTERNS = [
  { name: 'email', pattern: /[\w.+-]+@[\w.-]+\.\w{2,}/g },
  { name: 'phone', pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g },
  { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: 'credit_card', pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
  { name: 'ip_address', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { name: 'api_key', pattern: /\b(sk-[a-zA-Z0-9]{20,}|xai-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,})\b/g },
];

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*:\s*you\s+are/i,
  /\]\s*\}\s*\{\s*"role"\s*:\s*"system"/i,
  /pretend\s+you\s+(are|have)\s+no\s+rules/i,
  /disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i,
  /do\s+not\s+follow\s+(your|any)\s+(instructions|rules)/i,
];

app.post('/v1/guardrails/scan', auth, (req, res) => {
  const text = req.body.text || '';
  if (!text) return res.status(422).json({ error: { code: 'missing_text' } });

  // PII Detection
  const pii_found = [];
  for (const { name, pattern } of PII_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) pii_found.push({ type: name, count: matches.length, samples: matches.slice(0, 3).map(m => m.slice(0, 4) + '***') });
  }

  // Prompt Injection Detection
  const injections = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) injections.push({ pattern: pattern.source.slice(0, 40), matched: true });
  }

  // Toxicity (basic keyword check — production would use a classifier)
  const toxicKeywords = ['kill', 'bomb', 'hack into', 'steal', 'exploit vulnerability'];
  const toxicity = toxicKeywords.filter(k => text.toLowerCase().includes(k));

  const safe = pii_found.length === 0 && injections.length === 0 && toxicity.length === 0;

  res.json({
    ok: true, safe,
    pii: { found: pii_found.length > 0, items: pii_found },
    injection: { found: injections.length > 0, items: injections },
    toxicity: { found: toxicity.length > 0, keywords: toxicity },
    text_length: text.length,
    _engine: 'real',
  });
});

app.post('/v1/guardrails/redact', auth, (req, res) => {
  let text = req.body.text || '';
  if (!text) return res.status(422).json({ error: { code: 'missing_text' } });
  const redactions = [];
  for (const { name, pattern } of PII_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      redactions.push({ type: name, count: matches.length });
      text = text.replace(pattern, '[' + name.toUpperCase() + '_REDACTED]');
    }
  }
  res.json({ ok: true, redacted_text: text, redactions, _engine: 'real' });
});

// ===== DEEP SCAN — All-in-one guardrail: PII, injection, toxicity, bias, hallucination =====
app.post('/v1/guardrails/scan-deep', auth, (req, res) => {
  const text = req.body.text || '';
  if (!text) return res.status(422).json({ error: { code: 'missing_text' } });
  const checks = Array.isArray(req.body.checks) ? req.body.checks : ['pii', 'injection', 'toxicity', 'bias', 'hallucination'];

  const findings = [];
  const addFinding = (type, severity, location, detail) => findings.push({ type, severity, location, detail });

  // --- PII regex: SSN, credit card, email, phone, IP, API key, passport, DL, DOB, IBAN, tokens ---
  if (checks.includes('pii')) {
    const piiDefs = [
      { name: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, severity: 'critical' },
      { name: 'credit_card', pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, severity: 'critical' },
      { name: 'email', pattern: /[\w.+-]+@[\w.-]+\.\w{2,}/g, severity: 'high' },
      { name: 'phone', pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, severity: 'high' },
      { name: 'ip_address', pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, severity: 'medium' },
      { name: 'api_key', pattern: /\b(sk-[a-zA-Z0-9]{20,}|xai-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,})\b/g, severity: 'critical' },
      // Passport numbers (labeled references)
      { name: 'passport', pattern: /\bpassport\s*(?:#|no\.?|number)?\s*:?\s*([A-Z0-9]{6,12})\b/gi, severity: 'critical' },
      // Driver's license patterns
      { name: 'drivers_license', pattern: /\b(?:DL|driver'?s?\s*(?:license|licence|lic))\s*(?:#|no\.?|number)?\s*:?\s*([A-Z0-9]{4,15})\b/gi, severity: 'critical' },
      { name: 'drivers_license_format', pattern: /\b[A-Z]\d{7}\b/g, severity: 'high' },
      // Date of birth patterns
      { name: 'dob', pattern: /\b(?:DOB|date\s*of\s*birth|born|birthday)\s*:?\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/gi, severity: 'high' },
      { name: 'dob_iso', pattern: /\b(?:DOB|date\s*of\s*birth|born)\s*:?\s*\d{4}-\d{2}-\d{2}\b/gi, severity: 'high' },
      { name: 'dob_written', pattern: /\b(?:DOB|date\s*of\s*birth|born)\s*:?\s*(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/gi, severity: 'high' },
      // IBAN (international bank account number)
      { name: 'iban', pattern: /\b[A-Z]{2}\d{2}\s?[A-Z0-9]{4}\s?(?:\d{4}\s?){2,7}\d{1,4}\b/g, severity: 'critical' },
      // AWS access key
      { name: 'aws_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g, severity: 'critical' },
      // GitHub token
      { name: 'github_token', pattern: /\b(ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g, severity: 'critical' },
    ];
    for (const { name, pattern, severity } of piiDefs) {
      let m;
      while ((m = pattern.exec(text)) !== null) {
        addFinding('pii:' + name, severity, { offset: m.index, length: m[0].length }, m[0].slice(0, 4) + '***');
      }
    }
  }

  // --- SQL + prompt injection patterns ---
  if (checks.includes('injection')) {
    const sqlPatterns = [
      { pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|UNION)\b\s+.{0,60}\b(FROM|INTO|TABLE|SET|ALL)\b)/gi, name: 'sql_injection' },
      { pattern: /('\s*(OR|AND)\s+'?\d*'?\s*=\s*'?\d*)/gi, name: 'sql_tautology' },
      { pattern: /(;\s*DROP\s+TABLE)/gi, name: 'sql_drop' },
      { pattern: /(--\s*$|\/\*[\s\S]*?\*\/)/gm, name: 'sql_comment' },
      { pattern: /(\bEXEC\s*\(|xp_cmdshell|LOAD_FILE\s*\(|INTO\s+OUTFILE)/gi, name: 'sql_exec' },
      { pattern: /(\bWAITFOR\s+DELAY|BENCHMARK\s*\(|SLEEP\s*\()/gi, name: 'sql_timing' },
    ];
    for (const { pattern, name } of sqlPatterns) {
      let m;
      while ((m = pattern.exec(text)) !== null) {
        addFinding('injection:' + name, 'critical', { offset: m.index, length: m[0].length }, m[0].slice(0, 60));
      }
    }

    const promptPatterns = [
      { pattern: /ignore\s+(all\s+)?previous\s+instructions/gi, name: 'ignore_previous' },
      { pattern: /you\s+are\s+now\s+(a|an)\s+/gi, name: 'role_override' },
      { pattern: /system\s*:\s*you\s+are/gi, name: 'system_impersonation' },
      { pattern: /\]\s*\}\s*\{\s*"role"\s*:\s*"system"/gi, name: 'json_role_inject' },
      { pattern: /pretend\s+you\s+(are|have)\s+no\s+rules/gi, name: 'rule_bypass' },
      { pattern: /disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/gi, name: 'disregard' },
      { pattern: /do\s+not\s+follow\s+(your|any)\s+(instructions|rules)/gi, name: 'dont_follow' },
      { pattern: /jailbreak/gi, name: 'jailbreak' },
      { pattern: /DAN\s+mode/gi, name: 'dan_mode' },
      { pattern: /ignore\s+(all\s+)?(prior|above|preceding)\s+(text|context|instructions|input)/gi, name: 'ignore_prior' },
      { pattern: /forget\s+(everything|all|your)\s+(you|instructions|training|rules)/gi, name: 'forget_instructions' },
      { pattern: /you\s+are\s+now\s+(in\s+)?(unrestricted|unfiltered|uncensored|developer)\s+mode/gi, name: 'unrestricted_mode' },
      { pattern: /system\s*prompt\s*[:=]/gi, name: 'system_prompt_set' },
      { pattern: /reveal\s+(your|the)\s+(system\s*prompt|instructions|rules|guidelines)/gi, name: 'prompt_leak' },
      { pattern: /what\s+(are|is)\s+your\s+(system|initial|original)\s+(prompt|instructions|message)/gi, name: 'prompt_extraction' },
      { pattern: /act\s+as\s+(if\s+)?(you\s+)?(are|were)\s+(a\s+)?(?:evil|malicious|unethical|unrestricted)/gi, name: 'evil_roleplay' },
      { pattern: /override\s+(safety|content|ethical)\s+(filter|policy|guidelines|restrictions)/gi, name: 'safety_override' },
      { pattern: /\[SYSTEM\]|\[INST\]|<\|im_start\|>system/gi, name: 'control_token_inject' },
      { pattern: /from\s+now\s+on,?\s+(you\s+)?(will|must|should|shall)\s+(ignore|disregard|bypass|override)/gi, name: 'from_now_on' },
      { pattern: /enter\s+(god|sudo|admin|root|superuser)\s+mode/gi, name: 'privilege_escalation' },
      { pattern: /hypothetically|in\s+a\s+fictional\s+scenario|for\s+(educational|research)\s+purposes\s+only/gi, name: 'hypothetical_bypass' },
    ];
    for (const { pattern, name } of promptPatterns) {
      let m;
      while ((m = pattern.exec(text)) !== null) {
        addFinding('injection:prompt:' + name, 'critical', { offset: m.index, length: m[0].length }, m[0].slice(0, 60));
      }
    }
  }

  // --- Toxicity keywords (60+ terms: violence, hate, threats, exploitation, abuse) ---
  if (checks.includes('toxicity')) {
    const toxicTerms = [
      // Violence & threats
      { term: 'kill', severity: 'high' }, { term: 'murder', severity: 'critical' },
      { term: 'assassinate', severity: 'critical' }, { term: 'slaughter', severity: 'critical' },
      { term: 'massacre', severity: 'critical' }, { term: 'stab', severity: 'high' },
      { term: 'strangle', severity: 'critical' }, { term: 'behead', severity: 'critical' },
      { term: 'mutilate', severity: 'critical' }, { term: 'torture', severity: 'critical' },
      { term: 'assault', severity: 'high' }, { term: 'violent', severity: 'medium' },
      { term: 'bloodbath', severity: 'critical' }, { term: 'genocide', severity: 'critical' },
      { term: 'ethnic cleansing', severity: 'critical' }, { term: 'lynching', severity: 'critical' },
      // Weapons & terrorism
      { term: 'bomb', severity: 'critical' }, { term: 'terrorism', severity: 'critical' },
      { term: 'terrorist', severity: 'critical' }, { term: 'weapon of mass destruction', severity: 'critical' },
      { term: 'biological weapon', severity: 'critical' }, { term: 'chemical weapon', severity: 'critical' },
      { term: 'nerve agent', severity: 'critical' }, { term: 'explosive', severity: 'high' },
      { term: 'detonate', severity: 'critical' }, { term: 'improvised explosive', severity: 'critical' },
      { term: 'pipe bomb', severity: 'critical' }, { term: 'car bomb', severity: 'critical' },
      // Self-harm
      { term: 'suicide', severity: 'high' }, { term: 'self-harm', severity: 'high' },
      { term: 'cut myself', severity: 'high' }, { term: 'end my life', severity: 'critical' },
      { term: 'kill myself', severity: 'critical' }, { term: 'overdose', severity: 'high' },
      // Hate speech & slurs
      { term: 'slur', severity: 'critical' }, { term: 'hate speech', severity: 'critical' },
      { term: 'racial slur', severity: 'critical' }, { term: 'white power', severity: 'critical' },
      { term: 'death to', severity: 'critical' }, { term: 'exterminate', severity: 'critical' },
      { term: 'subhuman', severity: 'critical' }, { term: 'vermin', severity: 'high' },
      { term: 'infestation', severity: 'medium' }, { term: 'mongrel', severity: 'high' },
      { term: 'abomination', severity: 'high' }, { term: 'degenerate', severity: 'high' },
      // Cyber threats & exploitation
      { term: 'hack into', severity: 'high' }, { term: 'steal', severity: 'high' },
      { term: 'exploit vulnerability', severity: 'high' }, { term: 'ransomware', severity: 'critical' },
      { term: 'malware', severity: 'high' }, { term: 'keylogger', severity: 'high' },
      { term: 'phishing', severity: 'high' }, { term: 'brute force attack', severity: 'high' },
      { term: 'ddos', severity: 'high' }, { term: 'zero day exploit', severity: 'critical' },
      // Abuse & exploitation
      { term: 'child abuse', severity: 'critical' }, { term: 'trafficking', severity: 'critical' },
      { term: 'exploitation', severity: 'high' }, { term: 'blackmail', severity: 'high' },
      { term: 'extortion', severity: 'high' }, { term: 'revenge porn', severity: 'critical' },
      { term: 'doxxing', severity: 'critical' }, { term: 'swatting', severity: 'critical' },
      // Drugs & illegal
      { term: 'synthesize drugs', severity: 'critical' }, { term: 'cook meth', severity: 'critical' },
      { term: 'drug recipe', severity: 'critical' }, { term: 'illegal substance', severity: 'high' },
      // Threats
      { term: 'i will find you', severity: 'critical' }, { term: 'you will regret', severity: 'high' },
      { term: 'burn it down', severity: 'high' }, { term: 'shoot up', severity: 'critical' },
    ];
    const lower = text.toLowerCase();
    for (const { term, severity } of toxicTerms) {
      let idx = lower.indexOf(term);
      while (idx !== -1) {
        addFinding('toxicity', severity, { offset: idx, length: term.length }, term);
        idx = lower.indexOf(term, idx + 1);
      }
    }
  }

  // --- Bias indicators (gender stereotypes, racial generalizations, ableism, ageism) ---
  if (checks.includes('bias')) {
    const biasPatterns = [
      { pattern: /\b(all|every|no)\s+(men|women|blacks|whites|asians|muslims|christians|jews|immigrants|gays|lesbians|hispanics|latinos|latinas|natives|arabs|indians|chinese|mexicans|africans)\s+(are|have|should|must|always|never|can't|cannot|don't|will)\b/gi, name: 'group_generalization', severity: 'high' },
      { pattern: /\b(obviously|clearly|everyone knows|it'?s? (a )?fact that)\b/gi, name: 'assumption_language', severity: 'low' },
      { pattern: /\b(inferior|superior|subhuman|master race|pure blood|pure race)\b/gi, name: 'supremacy_language', severity: 'critical' },
      { pattern: /\b(typical|stereotyp(e|ical|ically)|always like that)\b/gi, name: 'stereotype_language', severity: 'medium' },
      // Gender stereotypes
      { pattern: /\b(women|girls|females?)\s+(belong|should\s+stay|can'?t|cannot|aren'?t\s+(good|capable)|shouldn'?t)\s+(in\s+the|at\s+home|work|be\s+(leaders?|engineers?|doctors?|scientists?))/gi, name: 'gender_stereotype', severity: 'high' },
      { pattern: /\b(men|boys|males?)\s+(don'?t|can'?t|shouldn'?t|aren'?t\s+capable\s+of)\s+(cry|feel|show\s+emotion|care\s+for|nurture|cook|clean)/gi, name: 'gender_stereotype', severity: 'high' },
      { pattern: /\b(man\s+up|boys\s+will\s+be\s+boys|like\s+a\s+girl|throw\s+like\s+a\s+girl|man'?s\s+job|woman'?s\s+(place|job|work))\b/gi, name: 'gender_stereotype', severity: 'medium' },
      // Racial generalizations
      { pattern: /\b(those\s+people|they\s+all|their\s+kind|that\s+race|that\s+type\s+of\s+people)\s+(are|always|never|tend\s+to)\b/gi, name: 'racial_generalization', severity: 'high' },
      { pattern: /\b(go\s+back\s+to|don'?t\s+belong\s+(here|in\s+this\s+country)|not\s+(real|true)\s+americans?)\b/gi, name: 'xenophobia', severity: 'critical' },
      // Ableism
      { pattern: /\b(retarded|crippled|lame|psycho|lunatic|idiot|moron|imbecile)\b/gi, name: 'ableist_language', severity: 'medium' },
      // Ageism
      { pattern: /\b(too\s+old\s+to|old\s+people\s+(can'?t|shouldn'?t|don'?t)|ok\s+boomer|senile|decrepit)\b/gi, name: 'ageist_language', severity: 'medium' },
    ];
    for (const { pattern, name, severity } of biasPatterns) {
      let m;
      while ((m = pattern.exec(text)) !== null) {
        addFinding('bias:' + name, severity, { offset: m.index, length: m[0].length }, m[0].slice(0, 60));
      }
    }
  }

  // --- Hallucination risk scoring (fake URLs, fake citations, overly precise stats) ---
  if (checks.includes('hallucination')) {
    let hallucinationScore = 0;
    const hallucinationSignals = [];

    // Overly precise percentages (e.g. "73.847%")
    const specificNumbers = text.match(/\b\d{2,}\.\d{2,}%\b/g);
    if (specificNumbers) { hallucinationScore += specificNumbers.length * 15; hallucinationSignals.push('overly_precise_percentages:' + specificNumbers.length); }

    // Suspiciously round statistics (e.g. "exactly 90%", "precisely 75%")
    const roundStats = text.match(/\b(exactly|precisely)\s+\d+(\.\d+)?%/gi);
    if (roundStats) { hallucinationScore += roundStats.length * 10; hallucinationSignals.push('suspiciously_exact_stats:' + roundStats.length); }

    const certaintyMatches = text.match(/\b(definitely|absolutely|certainly|undoubtedly|without question|100%|guaranteed|proven fact|indisputably|unequivocally)\b/gi);
    if (certaintyMatches) { hallucinationScore += certaintyMatches.length * 8; hallucinationSignals.push('certainty_language:' + certaintyMatches.length); }

    // Fake citations
    const fakeCites = text.match(/\b(according to (a |the )?(recent |new |latest |20\d{2} )?stud(y|ies)|research (shows|proves|confirms|suggests|indicates|demonstrates|found)|scientists (have )?(found|discovered|proven|confirmed|shown))\b/gi);
    if (fakeCites) { hallucinationScore += fakeCites.length * 12; hallucinationSignals.push('unverified_citations:' + fakeCites.length); }

    // Fake academic references
    const fakeJournals = text.match(/\b(published\s+in\s+(the\s+)?journal\s+of|et\s+al\.\s*\(\d{4}\)|doi:\s*10\.\d{4,})/gi);
    if (fakeJournals) { hallucinationScore += fakeJournals.length * 14; hallucinationSignals.push('fake_academic_refs:' + fakeJournals.length); }

    // Suspicious URLs: check for plausible-but-fake domains
    const urls = text.match(/https?:\/\/[^\s)]+/g);
    if (urls) {
      let fakeUrlCount = 0;
      const suspiciousTlds = ['.info', '.xyz', '.click', '.top', '.buzz'];
      for (const url of urls) {
        if (url.length > 100) fakeUrlCount++;
        if (suspiciousTlds.some(tld => url.includes(tld))) fakeUrlCount++;
        if (/\/\d{4}\/\d{2}\/\d{2}\/[a-z-]{30,}/.test(url)) fakeUrlCount++;
      }
      const urlScore = urls.length * 3 + fakeUrlCount * 8;
      hallucinationScore += urlScore;
      hallucinationSignals.push('urls_present:' + urls.length + (fakeUrlCount ? ',suspicious_urls:' + fakeUrlCount : ''));
    }

    // Fake quoted speech
    const quotes = text.match(/"[^"]{20,}"/g);
    if (quotes && quotes.length > 2) { hallucinationScore += quotes.length * 6; hallucinationSignals.push('many_quotes:' + quotes.length); }

    // Named person + said/stated (potentially fabricated attribution)
    const namedQuotes = text.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+(said|stated|claimed|noted|explained|remarked|argued|declared)\b/g);
    if (namedQuotes) { hallucinationScore += namedQuotes.length * 5; hallucinationSignals.push('attributed_quotes:' + namedQuotes.length); }

    // High claim density
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length > 20) { hallucinationScore += Math.floor(sentences.length / 5); hallucinationSignals.push('high_claim_density:' + sentences.length); }

    // Temporal precision without source
    const temporalPrecision = text.match(/\b(in|during|by)\s+\d{4},?\s+(exactly|precisely|approximately)\s+[\d,]+\b/gi);
    if (temporalPrecision) { hallucinationScore += temporalPrecision.length * 10; hallucinationSignals.push('temporal_precision:' + temporalPrecision.length); }

    hallucinationScore = Math.min(hallucinationScore, 100);
    if (hallucinationScore > 0) {
      addFinding('hallucination_risk', hallucinationScore >= 50 ? 'high' : hallucinationScore >= 25 ? 'medium' : 'low',
        { offset: 0, length: text.length }, 'score:' + hallucinationScore + ' signals:' + hallucinationSignals.join(','));
    }
  }

  // Compute overall risk score (0-100)
  const severityWeights = { critical: 25, high: 15, medium: 8, low: 3 };
  let risk_score = findings.reduce((sum, f) => sum + (severityWeights[f.severity] || 5), 0);
  risk_score = Math.min(risk_score, 100);
  const safe = risk_score === 0;

  res.json({
    ok: true,
    safe,
    risk_score,
    findings,
    finding_count: findings.length,
    checks_run: checks,
    text_length: text.length,
    _engine: 'real',
  });
});

// ===== PROMPT REGISTRY — Versioned templates (Claude roadmap #4) =====
app.post('/v1/prompts/save', auth, (req, res) => {
  const { name, template, variables, tags } = req.body;
  if (!name || !template) return res.status(422).json({ error: { code: 'missing_name_or_template' } });
  const ns = 'prompts:' + req.apiKey.slice(0, 12);
  const version = Date.now();
  const entry = { template, variables: variables || [], tags: tags || [], version, created: new Date().toISOString() };

  // Store current version
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(ns + ':' + name, JSON.stringify(entry));
  // Store version history
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(ns + ':' + name + ':v' + version, JSON.stringify(entry));

  res.json({ ok: true, name, version, _engine: 'real' });
});

app.post('/v1/prompts/render', auth, (req, res) => {
  const { name, params } = req.body;
  if (!name) return res.status(422).json({ error: { code: 'missing_name' } });
  const ns = 'prompts:' + req.apiKey.slice(0, 12);
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(ns + ':' + name);
  if (!row) return res.status(404).json({ error: { code: 'prompt_not_found' } });
  const entry = JSON.parse(row.value);
  let rendered = entry.template;
  for (const [k, v] of Object.entries(params || {})) {
    rendered = rendered.replace(new RegExp('{{' + k + '}}', 'g'), v);
  }
  res.json({ ok: true, name, rendered, version: entry.version, _engine: 'real' });
});

app.get('/v1/prompts/list', auth, (req, res) => {
  const ns = 'prompts:' + req.apiKey.slice(0, 12);
  const rows = db.prepare("SELECT key AS k, value FROM agent_state WHERE k LIKE ? AND k NOT LIKE '%:v%'").all(ns + ':%');
  const prompts = rows.map(r => { try { const e = JSON.parse(r.value); return { name: r.k.replace(ns + ':', ''), ...e }; } catch(e) { return null; } }).filter(Boolean);
  res.json({ ok: true, prompts, count: prompts.length, _engine: 'real' });
});

// ===== SEMANTIC CACHE (Claude roadmap #2 — simplified version) =====
const semanticCache = new Map();
app.post('/v1/cache/check', auth, (req, res) => {
  const text = req.body.text || '';
  const key = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).sort().join(' ').slice(0, 200);
  const cached = semanticCache.get(key);
  if (cached && Date.now() - cached.ts < (req.body.ttl || 300000)) {
    return res.json({ ok: true, hit: true, cached_response: cached.value, age_ms: Date.now() - cached.ts, _engine: 'real' });
  }
  res.json({ ok: true, hit: false, cache_key: key, _engine: 'real' });
});

app.post('/v1/cache/set', auth, (req, res) => {
  const text = req.body.text || '';
  const value = req.body.value || req.body.response;
  const key = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).sort().join(' ').slice(0, 200);
  semanticCache.set(key, { value, ts: Date.now() });
  if (semanticCache.size > 10000) { const oldest = [...semanticCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 2000); for (const [k] of oldest) semanticCache.delete(k); }
  res.json({ ok: true, cached: true, key, _engine: 'real' });
});

// ===== COST OPTIMIZER (Claude roadmap #5) =====
app.post('/v1/cost-optimizer', auth, async (req, res) => {
  const task = req.body.task || req.body.text || '';
  const budget = req.body.max_credits || 100;
  const benchmark = req.body.benchmark === true; // Actually test providers if requested
  if (!task) return res.status(422).json({ error: { code: 'missing_task' } });

  const envMap = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', grok: 'XAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
  const baseCosts = { anthropic: 15, openai: 10, grok: 8, deepseek: 3, ollama: 0 };
  const baseQuality = { anthropic: 9.5, openai: 9, grok: 8.5, deepseek: 8, ollama: 6 };
  const available = Object.entries(envMap).filter(([_, env]) => process.env[env]).map(([p]) => p);
  // Check if Ollama is actually running
  let ollamaAvailable = false;
  try { await ollamaRequest('/api/tags', {}); ollamaAvailable = true; } catch {}
  if (ollamaAvailable) available.push('ollama');

  let usedLlm = false;
  let benchmarkResults = {};

  // If benchmark=true, actually test each provider with a small prompt
  if (benchmark && available.length > 0) {
    const testPrompt = `Briefly answer in under 20 words: ${task.slice(0, 200)}`;
    for (const provider of available.slice(0, 4)) {
      const start = Date.now();
      try {
        if (provider === 'ollama') {
          const resp = await ollamaRequest('/api/generate', { model: 'llama3.2', prompt: testPrompt, stream: false });
          benchmarkResults[provider] = { latency_ms: Date.now() - start, response_length: (resp.response || '').length, success: true };
        } else {
          const llmThink = allHandlers['llm-think'];
          if (llmThink) {
            const result = await llmThink({ text: testPrompt, provider, max_tokens: 50 });
            benchmarkResults[provider] = { latency_ms: Date.now() - start, response_length: (result?.answer || '').length, success: true };
          }
        }
        usedLlm = true;
      } catch (e) {
        benchmarkResults[provider] = { latency_ms: Date.now() - start, success: false, error: e.message };
      }
    }
  }

  const recommendations = available.map(p => {
    const bench = benchmarkResults[p];
    const qualityScore = bench?.success ? Math.min(10, baseQuality[p] + (bench.response_length > 10 ? 0.5 : -1)) : baseQuality[p] || 5;
    return {
      provider: p, estimated_credits: baseCosts[p] || 10, quality_score: qualityScore,
      value_ratio: (qualityScore / Math.max(baseCosts[p] || 1, 1)).toFixed(2),
      within_budget: (baseCosts[p] || 10) <= budget,
      benchmark: bench || null,
    };
  }).sort((a, b) => parseFloat(b.value_ratio) - parseFloat(a.value_ratio));

  const outputHash = crypto.createHash('sha256').update(JSON.stringify(recommendations)).digest('hex').slice(0, 16);
  res.json({
    ok: true, task: task.slice(0, 100), budget,
    best_value: recommendations[0]?.provider,
    cheapest: [...recommendations].sort((a, b) => a.estimated_credits - b.estimated_credits)[0]?.provider,
    highest_quality: [...recommendations].sort((a, b) => b.quality_score - a.quality_score)[0]?.provider,
    recommendations,
    output_hash: outputHash,
    _engine: usedLlm ? 'real' : 'static',
    _note: usedLlm ? 'Benchmarked against live providers' : 'Baseline estimates. Pass benchmark:true to test providers live.',
  });
});

// ===== EVAL DATASETS (Claude roadmap #6) =====
app.post('/v1/eval/datasets/save', auth, (req, res) => {
  const { name, entries } = req.body;
  if (!name || !entries || !Array.isArray(entries)) return res.status(422).json({ error: { code: 'need_name_and_entries', format: '[{input, expected_output}]' } });
  const ns = 'eval-datasets:' + req.apiKey.slice(0, 12);
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(
    ns + ':' + name, JSON.stringify({ entries, count: entries.length, created: new Date().toISOString() })
  );
  res.json({ ok: true, name, entries_count: entries.length, _engine: 'real' });
});

app.get('/v1/eval/datasets/list', auth, (req, res) => {
  const ns = 'eval-datasets:' + req.apiKey.slice(0, 12);
  const rows = db.prepare("SELECT key AS k, value FROM agent_state WHERE k LIKE ?").all(ns + ':%');
  const datasets = rows.map(r => {
    try { const d = JSON.parse(r.value); return { name: r.k.replace(ns + ':', ''), count: d.count, created: d.created }; }
    catch(e) { return null; }
  }).filter(Boolean);
  res.json({ ok: true, datasets, count: datasets.length, _engine: 'real' });
});

// ===== OBSERVABILITY TRACES (Claude roadmap #9) =====
app.post('/v1/traces/start', auth, (req, res) => {
  const traceId = 'trace-' + crypto.randomUUID().slice(0, 12);
  const { name, metadata } = req.body;
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(
    'traces:' + traceId, JSON.stringify({ name: name || 'unnamed', steps: [], metadata: metadata || {}, started: new Date().toISOString(), status: 'active' })
  );
  res.json({ ok: true, trace_id: traceId, _engine: 'real' });
});

app.post('/v1/traces/:id/step', auth, (req, res) => {
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get('traces:' + req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'trace_not_found' } });
  const trace = JSON.parse(row.value);
  trace.steps.push({ ...req.body, ts: new Date().toISOString() });
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('traces:' + req.params.id, JSON.stringify(trace));
  res.json({ ok: true, trace_id: req.params.id, steps: trace.steps.length, _engine: 'real' });
});

app.get('/v1/traces/:id', auth, (req, res) => {
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get('traces:' + req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'trace_not_found' } });
  res.json({ ok: true, ...JSON.parse(row.value), trace_id: req.params.id, _engine: 'real' });
});

// ===== FINE-TUNING JOBS (Claude's #1 missing feature for 10/10) =====
// Manages fine-tuning jobs across providers. Stores job state in SQLite.
app.post('/v1/fine-tuning/jobs', auth, async (req, res) => {
  const { provider, model, training_data, hyperparameters, name } = req.body;
  if (!provider || !training_data) return res.status(422).json({ error: { code: 'missing_fields', required: ['provider', 'training_data'] } });

  const jobId = 'ft-' + crypto.randomUUID().slice(0, 12);
  const job = {
    id: jobId, provider, model: model || 'default', name: name || 'unnamed',
    status: 'pending', training_examples: Array.isArray(training_data) ? training_data.length : 0,
    hyperparameters: hyperparameters || { epochs: 3, learning_rate: 'auto' },
    created: new Date().toISOString(), updated: new Date().toISOString(),
    estimated_cost: null, result_model: null,
  };

  // Store job
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('ft-jobs:' + jobId, JSON.stringify(job));

  // Store training data
  if (Array.isArray(training_data)) {
    db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('ft-data:' + jobId, JSON.stringify(training_data));
  }

  // If BYOK, attempt to submit to provider
  const userKeyNs = 'user-keys:' + req.apiKey.slice(0, 16);
  const userKeyRow = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(userKeyNs + ':' + provider);

  const apiKeyForProvider = userKeyRow ? Buffer.from(userKeyRow.value, 'base64').toString() : process.env[{ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' }[provider] || ''];

  if (apiKeyForProvider && provider === 'openai' && Array.isArray(training_data)) {
    // Actually submit to OpenAI Fine-Tuning API
    try {
      // Format training data as JSONL
      const jsonl = training_data.map(ex => JSON.stringify({
        messages: ex.messages || [
          { role: 'system', content: ex.system || 'You are a helpful assistant.' },
          { role: 'user', content: ex.input || ex.prompt || '' },
          { role: 'assistant', content: ex.output || ex.completion || '' },
        ]
      })).join('\n');

      // Upload file first
      const boundary = 'slopshop' + Date.now();
      const fileBody = `--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nfine-tune\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="training.jsonl"\r\nContent-Type: application/jsonl\r\n\r\n${jsonl}\r\n--${boundary}--`;
      const fileResp = await new Promise((resolve, reject) => {
        const req = require('https').request({ hostname: 'api.openai.com', path: '/v1/files', method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiKeyForProvider, 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': Buffer.byteLength(fileBody) },
          timeout: 30000 }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } }); });
        req.on('error', reject); req.write(fileBody); req.end();
      });

      if (fileResp.id) {
        // Create fine-tuning job
        const ftBody = JSON.stringify({ training_file: fileResp.id, model: model || 'gpt-4o-mini-2024-07-18', hyperparameters: { n_epochs: hyperparameters?.epochs || 3 } });
        const ftResp = await new Promise((resolve, reject) => {
          const req = require('https').request({ hostname: 'api.openai.com', path: '/v1/fine_tuning/jobs', method: 'POST',
            headers: { 'Authorization': 'Bearer ' + apiKeyForProvider, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(ftBody) },
            timeout: 30000 }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } }); });
          req.on('error', reject); req.write(ftBody); req.end();
        });

        job.status = 'submitted';
        job.provider_job_id = ftResp.id || null;
        job.provider_status = ftResp.status || 'unknown';
        job.training_file_id = fileResp.id;
        job.note = ftResp.id ? 'Fine-tuning job submitted to OpenAI. Track via provider_job_id.' : 'Submission attempted but no job ID returned: ' + JSON.stringify(ftResp.error || ftResp).slice(0, 200);
      } else {
        job.status = 'error';
        job.note = 'File upload failed: ' + JSON.stringify(fileResp.error || fileResp).slice(0, 200);
      }
    } catch (e) {
      job.status = 'error';
      job.note = 'OpenAI API call failed: ' + e.message;
    }
  } else if (apiKeyForProvider) {
    job.status = 'queued';
    job.note = provider === 'openai' ? 'OpenAI key found but training_data must be an array. Resubmit with training_data as array of {input, output} objects.' : 'Fine-tuning via ' + provider + ' API not yet supported. Job metadata stored for manual submission.';
  } else {
    job.status = 'pending_key';
    job.note = 'No API key for ' + provider + '. Set via POST /v1/keys/llm/set or set ' + ({ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' }[provider] || 'PROVIDER_KEY') + ' env var.';
  }

  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('ft-jobs:' + jobId, JSON.stringify(job));

  const acct = apiKeys.get(req.apiKey);
  if (acct) { acct.balance -= 5; persistKey(req.apiKey); }

  res.json({ ok: true, job, _engine: 'real' });
});

app.get('/v1/fine-tuning/jobs', auth, (req, res) => {
  const rows = db.prepare("SELECT key AS k, value FROM agent_state WHERE k LIKE 'ft-jobs:%'").all();
  const jobs = rows.map(r => { try { return JSON.parse(r.value); } catch(e) { return null; } }).filter(Boolean);
  res.json({ ok: true, jobs, count: jobs.length, _engine: 'real' });
});

app.get('/v1/fine-tuning/jobs/:id', auth, (req, res) => {
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get('ft-jobs:' + req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'job_not_found' } });
  res.json({ ok: true, ...JSON.parse(row.value), _engine: 'real' });
});

app.post('/v1/fine-tuning/jobs/:id/cancel', auth, (req, res) => {
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get('ft-jobs:' + req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'job_not_found' } });
  const job = JSON.parse(row.value);
  job.status = 'cancelled';
  job.updated = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('ft-jobs:' + req.params.id, JSON.stringify(job));
  res.json({ ok: true, ...job, _engine: 'real' });
});

// ===== WORKFLOW TRIGGERS (Claude asked 20 consecutive times) =====
app.post('/v1/workflows/triggers', auth, (req, res) => {
  const { name, workflow_steps, event, webhook_url, schedule } = req.body;
  if (!name || !workflow_steps) return res.status(422).json({ error: { code: 'missing_fields', required: ['name', 'workflow_steps'] } });
  const triggerId = 'trigger-' + crypto.randomUUID().slice(0, 12);
  const trigger = {
    id: triggerId, name, steps: workflow_steps,
    event: event || 'manual', webhook_url: webhook_url || null, schedule: schedule || null,
    enabled: true, executions: 0, last_run: null,
    created: new Date().toISOString(),
  };
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('wf-triggers:' + triggerId, JSON.stringify(trigger));
  res.json({ ok: true, trigger, _engine: 'real' });
});

app.get('/v1/workflows/triggers', auth, (req, res) => {
  const rows = db.prepare("SELECT key AS k, value FROM agent_state WHERE k LIKE 'wf-triggers:%'").all();
  const triggers = rows.map(r => { try { return JSON.parse(r.value); } catch(e) { return null; } }).filter(Boolean);
  res.json({ ok: true, triggers, count: triggers.length, _engine: 'real' });
});

app.post('/v1/workflows/triggers/:id/execute', auth, async (req, res) => {
  const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get('wf-triggers:' + req.params.id);
  if (!row) return res.status(404).json({ error: { code: 'trigger_not_found' } });
  const trigger = JSON.parse(row.value);

  // Execute the workflow
  const results = [];
  let context = req.body.input || {};
  for (const step of (trigger.steps || []).slice(0, 20)) {
    const handler = allHandlers[step.api];
    const def = apiMap.get(step.api);
    if (!handler || !def) { results.push({ api: step.api, error: 'not found' }); continue; }
    const acct = apiKeys.get(req.apiKey);
    if (!acct || acct.balance < def.credits) { results.push({ api: step.api, error: 'insufficient credits' }); break; }
    acct.balance -= def.credits;
    try {
      const output = await handler({ ...context, ...(step.input || {}) });
      if (output && typeof output === 'object') { const { _engine, ...clean } = output; context = { ...context, ...clean }; }
      results.push({ api: step.api, credits: def.credits, result: output });
    } catch(e) { acct.balance += def.credits; results.push({ api: step.api, error: e.message }); }
  }
  persistKey(req.apiKey);

  trigger.executions++;
  trigger.last_run = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run('wf-triggers:' + req.params.id, JSON.stringify(trigger));

  res.json({ ok: true, trigger_id: req.params.id, results, steps_executed: results.length, _engine: 'real' });
});

app.delete('/v1/workflows/triggers/:id', auth, (req, res) => {
  db.prepare('DELETE FROM agent_state WHERE key = ?').run('wf-triggers:' + req.params.id);
  res.json({ ok: true, deleted: req.params.id, _engine: 'real' });
});

app.get('/v1/chain/:id/status', auth, (req, res) => { req.params = { id: req.params.id }; const chain = db.prepare('SELECT * FROM agent_chains WHERE id = ?').get(req.params.id); if (!chain) return res.status(404).json({ error: { code: 'chain_not_found' } }); res.json({ ok: true, chain_id: chain.id, name: chain.name, status: chain.status, current_step: chain.current_step, _engine: 'real' }); });
app.get('/v1/exchange/list', auth, (req, res) => {
  try {
    const suppliers = db.prepare("SELECT * FROM compute_suppliers ORDER BY last_heartbeat DESC LIMIT 50").all();
    res.json({ ok: true, nodes: suppliers.map(s => ({ id: s.id, capabilities: JSON.parse(s.capabilities || '[]'), status: s.status, last_heartbeat: s.last_heartbeat })), count: suppliers.length, _engine: 'real' });
  } catch(e) { res.json({ ok: true, nodes: [], count: 0, _engine: 'real' }); }
});
// ═══ NATURAL LANGUAGE ROUTER — "slop anything" ═══
// POST /v1/query — parse NL, route to best tool, execute, return result
// Returns: { slug, input, result, confidence, method: 'keyword'|'llm'|'fallback' }
app.post('/v1/query', auth, async (req, res) => {
  // Null safety: accept query/q/text, coerce to string
  const raw = req.body.query || req.body.q || req.body.text;
  const input = raw && typeof raw === 'string' ? raw.trim() : (raw ? String(raw).trim() : '');
  const debug = req.body.debug;
  if (!input) return res.status(400).json({ error: { code: 'missing_query', message: 'Provide query, q, or text in request body' } });
  const start_ts = Date.now();

  // Helper: normalised confidence with floor for real matches
  function calcConf(score, maxP) {
    const raw = score / Math.max(maxP, score, 1);
    return Math.min(Math.round(raw * 100) / 100, 1);
  }

  // Helper: log query and return inserted row id (for feedback linkage)
  function logQuery(apiKey, query, slug, method, confidence, resultSummary) {
    try {
      const info = db.prepare('INSERT INTO nl_query_log (api_key, query, slug, method, confidence, result_summary, ts) VALUES (?,?,?,?,?,?,?)').run(apiKey, query, slug, method, confidence, resultSummary, Date.now());
      return info.lastInsertRowid;
    } catch(_) { return null; }
  }

  // Helper: structured best_match object
  function buildBestMatch(item, conf, mp) {
    if (!item) return null;
    return {
      slug: item.slug,
      name: item.name || (API_DEFS[item.slug] && API_DEFS[item.slug].name) || item.slug,
      description: item.description || (API_DEFS[item.slug] && API_DEFS[item.slug].desc) || null,
      confidence: conf != null ? conf : calcConf(item.relevance_score || 0, mp),
      credits: item.credits,
      tier: item.tier,
      category: item.category,
      has_handler: item.has_handler != null ? item.has_handler : !!allHandlers[item.slug],
      input_schema: item.input_schema || null,
      matched_terms: item._matched_terms || [],
    };
  }

  // Helper: top-3 alternatives excluding chosen slug
  function buildAlternatives(scored, chosenSlug, maxP) {
    return scored
      .filter(s => s.slug !== chosenSlug)
      .slice(0, 3)
      .map(s => ({ slug: s.slug, name: s.name, confidence: calcConf(s.relevance_score, maxP) }));
  }

  // Stage 1: Fast exact-match (is this a known slug?)
  const slugMatch = input.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (allHandlers[slugMatch]) {
    try {
      const result = await Promise.resolve(allHandlers[slugMatch](req.body));
      const conf = 1.0;
      const qid = logQuery(req.apiKey, input, slugMatch, 'exact', conf, JSON.stringify(result).slice(0, 200));
      return res.json({
        ok: true, query_id: qid, slug: slugMatch,
        best_match: { slug: slugMatch, name: (API_DEFS[slugMatch] && API_DEFS[slugMatch].name) || slugMatch, confidence: conf, method: 'exact' },
        alternatives: [],
        pipe_suggestion: null,
        input: req.body, result, confidence: conf, method: 'exact',
        recommended_call: { endpoint: '/v1/' + slugMatch, body: req.body },
        _engine: 'real', latency_ms: Date.now() - start_ts,
      });
    } catch(e) { if (debug) console.error('[v1/query] exact handler error:', e.message); }
  }

  // Stage 2: Keyword/intent matching via NL_INTENT_BOOSTS + scoring
  const { scored, maxPossible } = nlScoreAPIs(input);
  const best = scored[0] || null;
  const pipe_suggestion = detectPipeSuggestion(input, scored);

  if (best && best._intent_boost > 0) {
    const extractedInput = nlExtractParams(input, best.slug);
    const confidence = calcConf(best.relevance_score, maxPossible);
    const handler = allHandlers[best.slug];
    if (handler) {
      try {
        const result = await Promise.resolve(handler({ ...extractedInput, _apiKey: req.apiKey, _apiKeyHash: req.apiKey }));
        const qid = logQuery(req.apiKey, input, best.slug, 'keyword', confidence, JSON.stringify(result).slice(0, 200));
        return res.json({
          ok: true, query_id: qid, slug: best.slug,
          best_match: buildBestMatch(best, confidence, maxPossible),
          alternatives: buildAlternatives(scored, best.slug, maxPossible),
          pipe_suggestion,
          input: extractedInput, result, confidence, method: 'keyword',
          recommended_call: { endpoint: '/v1/' + best.slug, body: extractedInput },
          _engine: 'real', latency_ms: Date.now() - start_ts,
        });
      } catch(e) {
        if (debug) console.error('[v1/query] keyword handler error:', e.message);
      }
    }
  }

  // Stage 3: LLM fallback — gated on ANY available LLM API key
  const llmHandler = allHandlers['llm-think'] || allHandlers['llm-chat'];
  const hasLlmKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GROK_API_KEY || process.env.DEEPSEEK_API_KEY);
  if (llmHandler && hasLlmKey) {
    try {
      const slugList = Object.keys(API_DEFS).slice(0, 80).join(', ');
      const routingPrompt = 'You are a routing engine for an API platform. Given this user query, return ONLY a JSON object with keys: slug (best API slug to call), input (extracted parameters as object), confidence (0-1 float).\n\nAvailable slugs (sample): ' + slugList + '\n\nUser query: "' + input + '"\n\nRespond with ONLY valid JSON, no markdown, no explanation. Example: {"slug":"crypto-hash-sha256","input":{"data":"hello world"},"confidence":0.95}';
      const llmResult = await Promise.resolve(llmHandler({ message: routingPrompt, max_tokens: 200 }));
      const llmText = llmResult && (llmResult.content || llmResult.text || llmResult.response) || '';
      const jsonMatch = llmText.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.slug && allHandlers[parsed.slug]) {
          const execInput = parsed.input || nlExtractParams(input, parsed.slug);
          const result = await Promise.resolve(allHandlers[parsed.slug]({ ...execInput, _apiKey: req.apiKey, _apiKeyHash: req.apiKey }));
          const conf = Math.min(parsed.confidence || 0.6, 1);
          const qid = logQuery(req.apiKey, input, parsed.slug, 'llm', conf, JSON.stringify(result).slice(0, 200));
          const matchedDef = scored.find(s => s.slug === parsed.slug) || { slug: parsed.slug, name: API_DEFS[parsed.slug] && API_DEFS[parsed.slug].name };
          return res.json({
            ok: true, query_id: qid, slug: parsed.slug,
            best_match: buildBestMatch(matchedDef, conf, maxPossible),
            alternatives: buildAlternatives(scored, parsed.slug, maxPossible),
            pipe_suggestion,
            input: execInput, result, confidence: conf, method: 'llm',
            recommended_call: { endpoint: '/v1/' + parsed.slug, body: execInput },
            _engine: 'real', latency_ms: Date.now() - start_ts,
          });
        }
      }
    } catch(e) {
      if (debug) console.error('[v1/query] llm fallback error:', e.message);
    }
  }

  // Stage 4: True fuzzy fallback — Levenshtein-based (distinct from Stage 2 scoring)
  const fuzzySlug = fuzzySlugMatch(input);
  const fuzzyTarget = (fuzzySlug && allHandlers[fuzzySlug]) ? fuzzySlug : (best && best.has_handler ? best.slug : null);
  if (fuzzyTarget && allHandlers[fuzzyTarget]) {
    const extractedInput = nlExtractParams(input, fuzzyTarget);
    const scoreEntry = scored.find(s => s.slug === fuzzyTarget);
    const confidence = scoreEntry ? calcConf(scoreEntry.relevance_score, maxPossible) : 0.2;
    try {
      const result = await Promise.resolve(allHandlers[fuzzyTarget]({ ...extractedInput, _apiKey: req.apiKey, _apiKeyHash: req.apiKey }));
      const qid = logQuery(req.apiKey, input, fuzzyTarget, 'fuzzy', confidence, JSON.stringify(result).slice(0, 200));
      return res.json({
        ok: true, query_id: qid, slug: fuzzyTarget,
        best_match: buildBestMatch(scoreEntry || { slug: fuzzyTarget, name: API_DEFS[fuzzyTarget] && API_DEFS[fuzzyTarget].name, relevance_score: 0 }, confidence, maxPossible),
        alternatives: buildAlternatives(scored, fuzzyTarget, maxPossible),
        pipe_suggestion,
        input: extractedInput, result, confidence, method: 'fuzzy',
        recommended_call: { endpoint: '/v1/' + fuzzyTarget, body: extractedInput },
        _engine: 'real', latency_ms: Date.now() - start_ts,
      });
    } catch(e) { if (debug) console.error('[v1/query] fuzzy handler error:', e.message); }
  }

  // Stage 5: No match — return structured response with suggestions
  const qid = logQuery(req.apiKey, input, null, 'no_match', 0, null);
  res.json({
    ok: false,
    query_id: qid,
    slug: null,
    best_match: null,
    alternatives: scored.slice(0, 3).map(s => ({ slug: s.slug, name: s.name, confidence: calcConf(s.relevance_score, maxPossible) })),
    pipe_suggestion: null,
    input: {},
    result: null,
    confidence: 0,
    method: 'no_match',
    query: input,
    recommended_call: null,
    suggestions: scored.slice(0, 5).map(s => ({ slug: s.slug, name: s.name, confidence: calcConf(s.relevance_score, maxPossible) })),
    hint: 'Try being more specific, or use POST /v1/{slug} directly',
    _engine: 'real',
    latency_ms: Date.now() - start_ts,
  });
});

// GET /v1/query/history — last N NL queries for this API key (default 20, max 100)
app.get('/v1/query/history', auth, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const rows = db.prepare('SELECT id, query, slug, method, confidence, result_summary, ts FROM nl_query_log WHERE api_key = ? ORDER BY ts DESC LIMIT ?').all(req.apiKey, limit);
    // Attach any feedback for each row
    const feedbackRows = rows.length > 0
      ? db.prepare('SELECT query_id, slug_chosen, correct FROM nl_query_feedback WHERE api_key = ? AND query_id IN (' + rows.map(() => '?').join(',') + ')').all(req.apiKey, ...rows.map(r => r.id))
      : [];
    const feedbackByQid = {};
    for (const fb of feedbackRows) feedbackByQid[fb.query_id] = { slug_chosen: fb.slug_chosen, correct: !!fb.correct };
    res.json({
      ok: true,
      history: rows.map(r => ({
        id: r.id,
        query: r.query,
        slug: r.slug,
        method: r.method,
        confidence: r.confidence,
        result_summary: r.result_summary,
        feedback: feedbackByQid[r.id] || null,
        ts: new Date(r.ts).toISOString(),
      })),
      count: rows.length,
      _engine: 'real',
    });
  } catch(e) {
    res.json({ ok: true, history: [], count: 0, _engine: 'real' });
  }
});

// POST /v1/query/feedback — mark a previous NL query routing as correct or incorrect
// Body: { query_id, slug_chosen, correct: true|false }
app.post('/v1/query/feedback', auth, (req, res) => {
  const { query_id, slug_chosen, correct } = req.body;
  if (!query_id) return res.status(400).json({ error: { code: 'missing_query_id', message: 'Provide query_id from a previous /v1/query response' } });
  try {
    // Verify the query_id belongs to this API key
    const row = db.prepare('SELECT id, slug FROM nl_query_log WHERE id = ? AND api_key = ?').get(query_id, req.apiKey);
    if (!row) return res.status(404).json({ error: { code: 'query_not_found', message: 'No query found with that id for your API key' } });
    const chosenSlug = slug_chosen || row.slug;
    db.prepare('INSERT OR REPLACE INTO nl_query_feedback (api_key, query_id, slug_chosen, correct, ts) VALUES (?,?,?,?,?)').run(req.apiKey, query_id, chosenSlug, correct ? 1 : 0, Date.now());
    res.json({ ok: true, query_id, slug_chosen: chosenSlug, correct: !!correct, _engine: 'real' });
  } catch(e) {
    res.status(500).json({ error: { code: 'feedback_error', message: e.message } });
  }
});

// GET /v1/route/suggestions?q=X — autocomplete: top 10 API slugs matching a partial query
app.get('/v1/route/suggestions', auth, (req, res) => {
  const q = (req.query.q || req.query.query || '').trim();
  if (!q) return res.status(400).json({ error: { code: 'missing_q', message: 'Provide ?q=<partial query>' } });
  try {
    const { scored, maxPossible } = nlScoreAPIs(q);
    const suggestions = scored.slice(0, 10).map(s => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
      confidence: Math.min(Math.round((s.relevance_score / Math.max(maxPossible, s.relevance_score, 1)) * 100) / 100, 1),
      credits: s.credits,
      tier: s.tier,
      category: s.category,
      example_call: { endpoint: '/v1/' + s.slug },
    }));
    res.json({ ok: true, q, suggestions, count: suggestions.length, _engine: 'real' });
  } catch(e) {
    res.status(500).json({ error: { code: 'suggestions_error', message: e.message } });
  }
});

// ═══ WORKFLOW ENGINE — handled by routes/workflow-builder.js ═══
// Table creation and all /v1/workflows routes are in routes/workflow-builder.js

// All /v1/workflows routes are handled by routes/workflow-builder.js

// ═══ BUDGET GUARDRAILS ═══
db.exec('CREATE TABLE IF NOT EXISTS budget_settings (api_key TEXT PRIMARY KEY, daily_limit INTEGER, monthly_limit INTEGER, alert_threshold INTEGER, created INTEGER)');

app.post('/v1/budget/set', auth, (req, res) => {
  const { daily_limit, monthly_limit, alert_threshold } = req.body;
  db.prepare('INSERT OR REPLACE INTO budget_settings (api_key, daily_limit, monthly_limit, alert_threshold, created) VALUES (?, ?, ?, ?, ?)').run(
    req.apiKey, daily_limit || 0, monthly_limit || 0, alert_threshold || 50, Date.now()
  );
  res.json({ ok: true, daily_limit, monthly_limit, alert_threshold });
});

app.get('/v1/budget', auth, (req, res) => {
  const budget = db.prepare('SELECT * FROM budget_settings WHERE api_key = ?').get(req.apiKey);
  const todaySpend = db.prepare("SELECT COALESCE(SUM(credits), 0) as total FROM audit_log WHERE key_prefix LIKE ? AND ts > ?").get(req.apiKey.slice(0, 12) + '%', new Date().toISOString().split('T')[0]);
  res.json({
    ok: true,
    balance: req.acct.balance,
    daily_limit: budget?.daily_limit || 0,
    monthly_limit: budget?.monthly_limit || 0,
    alert_threshold: budget?.alert_threshold || 50,
    today_spent: todaySpend?.total || 0,
    forecast_days: req.acct.balance > 0 && todaySpend?.total > 0 ? Math.floor(req.acct.balance / todaySpend.total) : null,
  });
});



// ===== REST MEMORY ALIASES (convenience routes mapping to slug handlers) =====
// These expose marketed REST paths that delegate to the underlying slug dispatcher logic.

// Helper: call a handler by slug, return JSON result
// Applies the same namespace scoping as the wildcard dispatcher for memory-* slugs.
async function callSlugHandler(slug, input, req) {
  const handler = allHandlers[slug];
  if (!handler) return null;
  if (slug.startsWith('memory-') && input) {
    if (!req.acct._nsPrefix) {
      req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    }
    const rawNs = input.namespace || 'default';
    input = { ...input, namespace: req.acct._nsPrefix + ':' + rawNs };
  }
  return handler(input, req);
}

// POST /v1/memory/store  → memory-set
app.post('/v1/memory/store', auth, memoryAuth, BODY_LIMIT_COMPUTE, async (req, res) => {
  const result = await callSlugHandler('memory-set', req.body, req);
  if (!result) return res.status(501).json({ error: { code: 'handler_missing', slug: 'memory-set' } });
  try { return res.json({ ok: true, ...result }); }
  catch (e) { return res.status(500).json({ ok: false, error: { code: 'internal', message: e.message } }); }
});

// GET /v1/memory/search  → memory-search (query params)
app.get('/v1/memory/search', auth, memoryAuth, async (req, res) => {
  try {
    const result = await callSlugHandler('memory-search', { ...req.query }, req);
    if (!result) return res.status(501).json({ error: { code: 'handler_missing', slug: 'memory-search' } });
    return res.json({ ok: true, ...result });
  } catch (e) { return res.status(500).json({ ok: false, error: { code: 'internal', message: e.message } }); }
});

// POST /v1/memory/search  → memory-search (query in body)
app.post('/v1/memory/search', auth, memoryAuth, BODY_LIMIT_COMPUTE, async (req, res) => {
  try {
    const result = await callSlugHandler('memory-search', req.body, req);
    if (!result) return res.status(501).json({ error: { code: 'handler_missing', slug: 'memory-search' } });
    return res.json({ ok: true, ...result });
  } catch (e) { return res.status(500).json({ ok: false, error: { code: 'internal', message: e.message } }); }
});

// GET /v1/memory/list  → memory-list
app.get('/v1/memory/list', auth, memoryAuth, async (req, res) => {
  try {
    const result = await callSlugHandler('memory-list', { ...req.query }, req);
    if (!result) return res.status(501).json({ error: { code: 'handler_missing', slug: 'memory-list' } });
    return res.json({ ok: true, ...result });
  } catch (e) { return res.status(500).json({ ok: false, error: { code: 'internal', message: e.message } }); }
});

// POST /v1/memory/extract  → memory-chunk or 501 with hint
app.post('/v1/memory/extract', auth, memoryAuth, BODY_LIMIT_COMPUTE, async (req, res) => {
  try {
    const result = await callSlugHandler('memory-extract', req.body, req) || await callSlugHandler('memory-chunk', req.body, req);
    if (!result) return res.status(501).json({ error: { code: 'handler_missing', message: 'Use POST /v1/memory/background/extract for background extraction' } });
    return res.json({ ok: true, ...result });
  } catch (e) { return res.status(500).json({ ok: false, error: { code: 'internal', message: e.message } }); }
});

// GET /v1/memory/namespaces  → memory-list-namespaces or derived from memory-list
app.get('/v1/memory/namespaces', auth, memoryAuth, async (req, res) => {
  try {
    const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const keyHash = require('crypto').createHash('sha256').update(key).digest('hex');
    const rows = db.prepare(
      `SELECT DISTINCT namespace FROM memories WHERE api_key_hash = ? ORDER BY namespace`
    ).all(keyHash);
    return res.json({ ok: true, namespaces: rows.map(r => r.namespace || 'default') });
  } catch (e) { return res.status(500).json({ ok: false, error: { code: 'internal', message: e.message } }); }
});

// GET /.well-known/mcp.json  — MCP discovery manifest (unauthenticated)
app.get('/.well-known/mcp.json', (req, res) => {
  const base = process.env.BASE_URL || `https://${req.hostname}`;
  res.json({
    schema_version: '2025-03',
    name: 'slopshop',
    description: 'Living Agentic Backend OS — 530+ tools, Dream Engine memory consolidation, Multiplayer Memory',
    server_url: `${base}/mcp`,
    capabilities: ['tools', 'memory', 'prompts'],
    tool_count: 530,
    docs_url: 'https://slopshop.gg/docs',
  });
});

// GET /v1/status/public  — unauthenticated health summary
app.get('/v1/status/public', (req, res) => {
  res.json({
    ok: true,
    status: 'operational',
    version: process.env.npm_package_version || '2.0.0',
    uptime_sec: Math.floor(process.uptime()),
    tool_count: apiMap ? apiMap.size : 0,
    timestamp: new Date().toISOString(),
  });
});

// GET /v1/metrics/public  — unauthenticated public metrics
app.get('/v1/metrics/public', (req, res) => {
  try {
    const totalKeys = db.prepare('SELECT COUNT(*) AS cnt FROM api_keys WHERE active = 1').get();
    const totalDreams = db.prepare("SELECT COUNT(*) AS cnt FROM dream_sessions WHERE status = 'complete'").get();
    res.json({
      ok: true,
      active_api_keys: totalKeys ? totalKeys.cnt : 0,
      completed_dream_sessions: totalDreams ? totalDreams.cnt : 0,
      uptime_sec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.json({ ok: true, uptime_sec: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
  }
});

// ===== WILDCARD: Call any API (MUST BE LAST) =====
};
