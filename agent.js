/**
 * SLOP AGENT
 *
 * The killer feature: describe what you want in English.
 * The system picks tools, chains them, returns results.
 * No API selection. No input formatting. Just ask.
 *
 * POST /v1/agent/run { "task": "What's the tech stack of stripe.com?" }
 * → Automatically calls sense-url-tech-stack, formats result, returns answer.
 *
 * This is what turns Slopshop from "API marketplace" into "agent operating system."
 */

const https = require('https');

module.exports = function mountAgent(app, allHandlers, API_DEFS, db, apiKeys, auth) {

  // Build a compact tool index for the LLM
  const toolIndex = Object.entries(API_DEFS).map(([slug, d]) =>
    `${slug}: ${d.desc} [${d.credits}cr]`
  ).join('\n');

  // Call Anthropic to plan which tools to use
  // Smart keyword matching — picks the 1 BEST tool with proper input mapping
  // This is the fast path (no LLM needed) for common operations
  const DIRECT_ROUTES = {
    'hash': { slug: 'crypto-hash-sha256', inputMap: t => ({ text: t.replace(/^.*hash\s*/i, '').replace(/^(the\s+)?(word|text|string)\s*/i, '').replace(/\s*(with|using)\s*sha.*/i, '').trim() }) },
    'uuid': { slug: 'crypto-uuid', inputMap: () => ({}) },
    'reverse': { slug: 'text-reverse', inputMap: t => ({ text: t.replace(/^.*reverse\s*(the\s*)?(string|text)?\s*:?\s*/i, '').trim() }) },
    'count the words': { slug: 'text-word-count', inputMap: t => ({ text: t.replace(/^.*count\s*(the\s*)?words\s*(in|of|for)?\s*:?\s*/i, '').trim() }) },
    'count words': { slug: 'text-word-count', inputMap: t => ({ text: t.replace(/^.*count\s*(the\s*)?words\s*(in|of|for)?\s*:?\s*/i, '').trim() }) },
    'word count': { slug: 'text-word-count', inputMap: t => ({ text: t.replace(/^.*word\s*count\s*(of|in|for)?\s*:?\s*/i, '').trim() }) },
    'slugify': { slug: 'text-slugify', inputMap: t => ({ text: t.replace(/^.*slugify\s*(the\s*)?(text|string)?\s*:?\s*/i, '').trim() }) },
    'password': { slug: 'crypto-password-generate', inputMap: t => { const m = t.match(/(\d+)\s*char/); return { length: m ? parseInt(m[1]) : 20 }; } },
    'base64 encode': { slug: 'text-base64-encode', inputMap: t => ({ text: t.replace(/^.*base64\s*encode\s*(the\s*)?(text|string)?\s*:?\s*/i, '').trim() }) },
    'base64 decode': { slug: 'text-base64-decode', inputMap: t => ({ text: t.replace(/^.*base64\s*decode\s*(the\s*)?(text|string)?\s*:?\s*/i, '').trim() }) },
    'random': { slug: 'crypto-random-int', inputMap: t => { const m = t.match(/(\d+)\s*(?:and|to)\s*(\d+)/); return { min: m ? parseInt(m[1]) : 1, max: m ? parseInt(m[2]) : 100 }; } },
    'validate json': { slug: 'json-format', inputMap: t => ({ json: t.replace(/^.*validate\s*(the\s*)?json\s*:?\s*/i, '').trim() }) },
    'validate email': { slug: 'validate-email-syntax', inputMap: t => { const m = t.match(/[\w.+-]+@[\w.-]+/); return { email: m ? m[0] : '' }; } },
    'validate this email': { slug: 'validate-email-syntax', inputMap: t => { const m = t.match(/[\w.+-]+@[\w.-]+/); return { email: m ? m[0] : '' }; } },
    'email valid': { slug: 'validate-email-syntax', inputMap: t => { const m = t.match(/[\w.+-]+@[\w.-]+/); return { email: m ? m[0] : '' }; } },
    'totp': { slug: 'crypto-totp-generate', inputMap: () => ({}) },
    'statistics': { slug: 'math-statistics', inputMap: t => { const nums = t.match(/[\d.]+/g); return { data: nums ? nums.map(Number) : [] }; } },
    'char count': { slug: 'text-char-count', inputMap: t => ({ text: t.replace(/^.*count\s*(the\s*)?char\w*\s*(in|of|for)?\s*:?\s*/i, '').trim() }) },
    'md5': { slug: 'crypto-hash-md5', inputMap: t => ({ text: t.replace(/^.*md5s*(hash)?s*(of)?s*:?s*/i, '').trim() }) },
    'url encode': { slug: 'text-url-encode', inputMap: t => ({ text: t.replace(/^.*urls*encodes*(the)?s*(string|text)?s*:?s*/i, '').trim() }) },
    'timestamp': { slug: 'date-now', inputMap: () => ({}) },
    'extract email': { slug: 'text-extract-emails', inputMap: t => ({ text: t.replace(/^.*extracts*(all)?s*emails?s*(from)?s*:?s*/i, '').trim() }) },
    'json to yaml': { slug: 'json-to-yaml', inputMap: t => ({ json: t.replace(/^.*jsons*tos*yamls*:?s*/i, '').trim() }) },
    'yaml': { slug: 'json-to-yaml', inputMap: t => ({ json: t.replace(/^.*(?:to|convert)s*yamls*:?s*/i, '').trim() }) },
    'encrypt': { slug: 'crypto-encrypt-aes', inputMap: t => ({ text: t.replace(/^.*encrypts*(the)?s*(text|string)?s*:?s*/i, '').trim(), key: 'default' }) },
    'decrypt': { slug: 'crypto-decrypt-aes', inputMap: t => ({ text: t.replace(/^.*decrypts*(the)?s*(text|string)?s*:?s*/i, '').trim(), key: 'default' }) },
    'jwt': { slug: 'crypto-jwt-decode', inputMap: t => ({ token: t.replace(/^.*(?:decode|inspect)s*jwts*:?s*/i, '').trim() }) },
    'dns': { slug: 'net-dns-a', inputMap: t => ({ domain: t.replace(/^.*(?:dns|lookup|resolve)s*(for)?s*:?s*/i, '').trim() }) },
    'sentiment': { slug: 'text-sentiment', inputMap: t => ({ text: t.replace(/^.*sentiments*(of|for|in)?s*:?s*/i, '').trim() }) },
    'keywords': { slug: 'text-extract-keywords', inputMap: t => ({ text: t.replace(/^.*keywords?s*(of|from|in|for)?s*:?s*/i, '').trim() }) },
    'readability': { slug: 'text-readability-score', inputMap: t => ({ text: t.replace(/^.*readabilitys*(of|for|score)?s*:?s*/i, '').trim() }) },
    'token count': { slug: 'text-token-count', inputMap: t => ({ text: t.replace(/^.*tokens*counts*(of|for|in)?s*:?s*/i, '').trim() }) },
    'tokens': { slug: 'text-token-count', inputMap: t => ({ text: t.replace(/^.*tokens?s*(in|of|for)?s*:?s*/i, '').trim() }) },
    'ip address': { slug: 'validate-ip-address', inputMap: t => { const m=t.match(/(d+.d+.d+.d+)/); return { ip: m?m[1]:'' }; } },
    'json validate': { slug: 'json-format', inputMap: t => ({ json: t.replace(/^.*(?:validate|check|verify)s*(?:thes*)?jsons*:?s*/i, '').trim() }) },
    'diff': { slug: 'text-diff', inputMap: t => ({ a: 'original', b: t.replace(/^.*diffs*:?s*/i, '').trim() }) },
    'regex': { slug: 'text-regex-test', inputMap: t => ({ text: t, pattern: '.*' }) },
    'lorem': { slug: 'gen-lorem-ipsum', inputMap: t => { const m=t.match(/(d+)/); return { sentences: m?parseInt(m[1]):3 }; } },

    'count char': { slug: 'text-char-count', inputMap: t => ({ text: t.replace(/^.*count\s*(the\s*)?char\w*\s*(in|of|for)?\s*:?\s*/i, '').trim() }) },
    'character count': { slug: 'text-char-count', inputMap: t => ({ text: t.replace(/^.*char\w*\s*count\s*(in|of|for)?\s*:?\s*/i, '').trim() }) },
  };

  function smartRoute(task) {
    const lower = task.toLowerCase();
    for (const [trigger, route] of Object.entries(DIRECT_ROUTES)) {
      if (lower.includes(trigger)) {
        const input = route.inputMap(task);
        return { steps: [{ api: route.slug, input, reason: 'Direct route: ' + trigger }], model: 'smart-route' };
      }
    }
    return null;
  }

  function keywordFallback(task) {
    const taskWords = task.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scored = [];
    for (const [slug, def] of Object.entries(API_DEFS)) {
      const text = (slug + ' ' + def.name + ' ' + def.desc).toLowerCase();
      let score = 0;
      taskWords.forEach(w => { if (text.includes(w)) score++; if (slug.includes(w)) score += 2; });
      if (score > 0 && def.credits <= 5) scored.push({ slug, score, credits: def.credits });
    }
    // Only pick the TOP 1-2 matches, not 5
    const topTools = scored.sort((a, b) => b.score - a.score).slice(0, 2);
    if (topTools.length === 0) return { error: 'No matching tools found for task' };
    return { steps: topTools.map(t => ({ api: t.slug, input: { text: task }, reason: `Keyword (score ${t.score})` })), model: 'keyword' };
  }

  const llmHandler = allHandlers['llm-summarize'];

  async function planTools(task, options = {}) {
    // 1. Try smart direct routing first (instant, no LLM, no credits)
    const direct = smartRoute(task);
    if (direct) return direct;

    // 2. Try LLM planning if available
    if (process.env.ANTHROPIC_API_KEY && llmHandler) {
      try {
        const topKeyword = Object.entries(API_DEFS)
          .filter(([_, d]) => d.credits <= 5)
          .slice(0, 100)
          .map(([slug, d]) => slug + ': ' + d.desc)
          .join('\n');

        const prompt = 'Pick 1-2 APIs for this task. Return ONLY JSON: [{"api":"slug","input":{...},"reason":"..."}]\n\nAPIs:\n' +
          topKeyword.slice(0, 4000) + '\n\nTask: "' + task + '"\n\nJSON array:';

        const result = await llmHandler({ text: prompt, task: 'plan' });
        const text = result?.summary || '';
        const match = text.match(/\[[\s\S]*?\]/);
        if (match) {
          const steps = JSON.parse(match[0]);
          if (Array.isArray(steps) && steps.length > 0 && steps[0].api) {
            return { steps: steps.slice(0, 3), plan_model: plan.model, model: result?._model || 'llm' };
          }
        }
      } catch (e) { /* LLM planning failed, fall through to keyword */ }
    }

    // 3. Keyword fallback (reduced to 1-2 tools)
    return keywordFallback(task);
  }

  // Fallback map: if a tool fails, try these alternatives in order
  const FALLBACKS = {
    'crypto-hash-sha256': ['crypto-hash-sha512', 'crypto-hash-md5'],
    'sense-url-content': ['sense-url-meta', 'sense-url-links'],
    'sense-ssl-check': ['sense-url-headers'],
    'text-word-count': ['text-token-count'],
    'llm-summarize': ['llm-extract-key-points'],
  };

  function getFallbacks(slug) {
    if (FALLBACKS[slug]) return FALLBACKS[slug];
    // Auto-generate from same prefix (e.g., crypto-hash-* are all fallbacks for each other)
    const prefix = slug.split('-').slice(0, 2).join('-');
    return Object.keys(API_DEFS).filter(s => s !== slug && s.startsWith(prefix)).slice(0, 3);
  }

  // Execute a plan (call each tool in sequence)
  // onStep(stepData) is an optional callback invoked after each step completes
  async function executePlan(steps, apiKey, onStep) {
    const results = [];
    let totalCredits = 0;
    let lastResult = null;

    for (const step of steps) {
      const handler = allHandlers[step.api];
      const def = API_DEFS[step.api];
      if (!handler || !def) {
        results.push({ api: step.api, error: 'Tool not found', reason: step.reason });
        continue;
      }

      // Check credits
      const acct = apiKeys.get(apiKey);
      if (!acct || acct.balance < def.credits) {
        results.push({ api: step.api, error: 'Insufficient credits' });
        break;
      }
      acct.balance -= def.credits;
      totalCredits += def.credits;

      // Merge previous result into input if available
      const input = { ...step.input };
      if (lastResult && typeof lastResult === 'object') {
        if (lastResult.text) input.text = input.text || lastResult.text;
        if (lastResult.url) input.url = input.url || lastResult.url;
        if (lastResult.data) input.data = input.data || lastResult.data;
        if (lastResult.hash) input.data = input.data || lastResult.hash;
      }

      try {
        const _stepStart = Date.now(); const result = await handler(input); const _stepMs = Date.now() - _stepStart;
        lastResult = result;
        const stepData = { api: step.api, credits: def.credits, reason: step.reason, data: result, time_ms: _stepMs };
        results.push(stepData);
        if (onStep) onStep(stepData);
      } catch (e) {
        // Attempt fallbacks before recording failure
        const fallbackList = getFallbacks(step.api);
        let fallbackSucceeded = false;
        for (const fallbackSlug of fallbackList) {
          const fbHandler = allHandlers[fallbackSlug];
          const fbDef = API_DEFS[fallbackSlug];
          if (!fbHandler || !fbDef) continue;
          const fbAcct = apiKeys.get(apiKey);
          if (!fbAcct || fbAcct.balance < fbDef.credits) continue;
          try {
            const fbResult = await fbHandler(input);
            fbAcct.balance -= fbDef.credits;
            totalCredits += fbDef.credits;
            lastResult = fbResult;
            const fbStepData = { api: fallbackSlug, credits: fbDef.credits, reason: step.reason, data: fbResult, fallback_used: true, original_api: step.api };
            results.push(fbStepData);
            if (onStep) onStep(fbStepData);
            fallbackSucceeded = true;
            break;
          } catch (fbErr) {
            // Try next fallback
          }
        }
        if (!fallbackSucceeded) {
          const errData = { api: step.api, error: e.message, reason: step.reason };
          results.push(errData);
          if (onStep) onStep(errData);
        }
      }
    }

    return { results, total_credits: totalCredits };
  }

  // Summarize results using LLM handler (same infra that powers llm-* endpoints)
  async function summarize(task, results) {
    if (!llmHandler) return null;
    try {
      const prompt = `User asked: "${task}"\n\nTool results:\n${JSON.stringify(results, null, 2).slice(0, 4000)}\n\nProvide a clear, concise answer based on these results. 2-3 sentences max.`;
      const result = await llmHandler({ text: prompt, task: 'summarize-agent-results' });
      return result?.summary || result?.result || result?.analysis || result?.response || null;
    } catch (e) { return null; }
  }

  // === AGENT TEMPLATES ===
  const TEMPLATES = {
    'security-audit': {
      name: 'Security Auditor',
      desc: 'Audit a URL for security issues, tech stack, SSL, headers',
      task: (input) => `Perform a security audit on ${input.url || input.target}. Check the tech stack, SSL certificate, HTTP headers, and response time. Store findings in memory.`,
    },
    'content-analyzer': {
      name: 'Content Analyzer',
      desc: 'Fetch, analyze, and summarize any URL content',
      task: (input) => `Fetch the content of ${input.url} and analyze it. Extract key topics, word count, reading level, and sentiment. Store the analysis in memory.`,
    },
    'data-processor': {
      name: 'Data Processor',
      desc: 'Transform, filter, and analyze JSON/CSV data',
      task: (input) => `Process this data: ${JSON.stringify(input.data).slice(0, 2000)}. ${input.instructions || 'Clean, analyze, and return statistics.'}`,
    },
    'domain-recon': {
      name: 'Domain Recon',
      desc: 'Full reconnaissance on a domain - DNS, tech, SSL, links',
      task: (input) => `Do full reconnaissance on ${input.domain || input.url}. Check DNS records, tech stack, SSL certificate, sitemap, and response time. Store all findings in memory.`,
    },
    'hash-verify': {
      name: 'Hash & Verify',
      desc: 'Hash data with multiple algorithms, verify integrity',
      task: (input) => `Hash "${input.text || input.data}" with SHA-256, SHA-512, and MD5. Return all hashes.`,
    },
  };

  // GET /v1/agent/templates - list available templates
  app.get('/v1/agent/templates', (req, res) => {
    res.json({
      templates: Object.entries(TEMPLATES).map(([id, t]) => ({
        id, name: t.name, description: t.desc,
      })),
      _engine: 'agent',
    });
  });

  // POST /v1/agent/template/:id - run a template
  app.post('/v1/agent/template/:id', auth, async (req, res) => {
    const template = TEMPLATES[req.params.id];
    if (!template) return res.status(404).json({ error: { code: 'template_not_found', available: Object.keys(TEMPLATES) } });

    const task = template.task(req.body);
    req.body.task = task;
    req.body._template = req.params.id;
    // Fall through to the agent/run logic below by forwarding internally
    const startTime = Date.now();
    const plan = await planTools(task);
    if (plan.error) return res.status(500).json({ error: { code: 'planning_failed', message: plan.error } });
    const execution = await executePlan(plan.steps, req.apiKey);
    // Skip LLM summarize for smart-routed tasks (result is self-explanatory)
    const skipSummarize = plan.model === 'smart-route' && execution.results.length <= 2;
    const answer = skipSummarize 
      ? 'Result: ' + JSON.stringify(execution.results[0]?.data || {}).slice(0, 500)
      : await summarize(task, execution.results);
    const totalTime = Date.now() - startTime;
    const acct = apiKeys.get(req.apiKey);
    const overhead = (plan.model === 'smart-route') ? 0 : 20; if (acct && overhead > 0) { if (acct.balance < overhead) return res.status(402).json({ error: { code: 'insufficient_credits', need: overhead, have: acct.balance } }); acct.balance -= overhead; }

    // Auto-store in memory (free - 0 credits)
    const runId = `run-${Date.now().toString(36)}`;
    autoStoreResult(runId, task, answer, execution.results, req.params.id);

    res.json({
      answer, task, template: req.params.id,
      run_id: runId,
      steps: execution.results.map(r => ({ api: r.api, reason: r.reason, credits: r.credits, success: !r.error })),
      total_credits: execution.total_credits + 20,
      balance: acct?.balance,
      time_ms: totalTime,
      _engine: 'agent',
    });
  });

  // Auto-store agent results in memory (uses memory handler directly, no credit cost)
  function autoStoreResult(runId, task, answer, results, template) {
    const memHandler = allHandlers['memory-set'];
    if (!memHandler) return;

    try {
      memHandler({
        namespace: 'agent-runs',
        key: runId,
        value: JSON.stringify({
          task,
          answer,
          tools_used: results.map(r => r.api),
          template: template || null,
          timestamp: new Date().toISOString(),
          success: results.every(r => !r.error),
        }),
        tags: ['agent-run', template || 'adhoc'].join(','),
      });
    } catch (e) { /* silent - memory is best-effort */ }
  }

  // GET /v1/agent/run/:id - retrieve a specific run (shareable link)
  app.get('/v1/agent/run/:id', auth, async (req, res) => {
    const memGet = allHandlers['memory-get'];
    if (!memGet) return res.status(404).json({ error: { code: 'not_found' } });

    try {
      const result = await memGet({ namespace: 'agent-runs', key: req.params.id });
      if (!result.found) return res.status(404).json({ error: { code: 'run_not_found', run_id: req.params.id } });
      const run = JSON.parse(result.value);
      res.json({ run_id: req.params.id, ...run, _engine: 'agent', shareable: `https://slopshop.gg/v1/agent/run/${req.params.id}` });
    } catch (e) {
      res.status(404).json({ error: { code: 'run_not_found', run_id: req.params.id } });
    }
  });

  // GET /v1/agent/history - retrieve past agent runs from memory
  app.get('/v1/agent/history', auth, async (req, res) => {
    const memSearch = allHandlers['memory-search'];
    if (!memSearch) return res.json({ runs: [], _engine: 'agent' });

    try {
      const result = await memSearch({ namespace: 'agent-runs', tag: 'agent-run' });
      const runs = (result.results || []).map(r => {
        try { return { key: r.key, ...JSON.parse(r.value) }; }
        catch (e) { return { key: r.key, raw: r.value }; }
      });
      res.json({ runs, count: runs.length, _engine: 'agent' });
    } catch (e) {
      res.json({ runs: [], error: e.message, _engine: 'agent' });
    }
  });

  // === THE ENDPOINT ===
  app.post('/v1/agent/run', auth, async (req, res) => {
    const task = req.body.task || req.body.query || req.body.prompt;
    if (!task) return res.status(400).json({ error: { code: 'missing_task', message: 'Provide a "task" field describing what you want.' } });

    const streaming = !!req.body.stream;
    const startTime = Date.now();

    if (streaming) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Notify client that planning has started
      res.write('data: ' + JSON.stringify({ event: 'planning', task }) + '\n\n');

      // Step 1: Plan
      const plan = await planTools(task, { model: req.body.model });
      if (plan.error) {
        res.write('data: ' + JSON.stringify({ event: 'error', error: { code: 'planning_failed', message: plan.error } }) + '\n\n');
        return res.end();
      }

      // Step 2: Execute with per-step streaming callback
      const execution = await executePlan(plan.steps, req.apiKey, (stepData) => {
        res.write('data: ' + JSON.stringify({ event: 'step', step: stepData }) + '\n\n');
      });

      // Step 3: Summarize
      const answer = await summarize(task, execution.results);

      const totalTime = Date.now() - startTime;

      // Charge overhead
      const acct = apiKeys.get(req.apiKey);
      if (acct) { if (acct.balance < 20) return res.status(402).json({ error: { code: 'insufficient_credits', need: 20, have: acct.balance, message: 'Buy credits: POST /v1/credits/buy' } }); acct.balance -= 20; }

      // Auto-store
      const runId = `run-${Date.now().toString(36)}`;
      autoStoreResult(runId, task, answer, execution.results);

      // Final event
      res.write('data: ' + JSON.stringify({
        event: 'complete',
        answer,
        task,
        run_id: runId,
        steps: execution.results.map(r => {
          const step = { api: r.api, reason: r.reason, credits: r.credits, success: !r.error, fallback_used: r.fallback_used || false };
          if (r.data) { const { _engine, ...clean } = r.data; step.result = clean; }
          if (r.error) step.error = r.error;
          return step;
        }),
        total_credits: execution.total_credits + 20,
        balance: acct?.balance,
        time_ms: totalTime,
        _engine: 'agent',
      }) + '\n\n');
      return res.end();
    }

    // Step 1: Plan (non-streaming)
    const plan = await planTools(task, { model: req.body.model });
    if (plan.error) return res.status(500).json({ error: { code: 'planning_failed', message: plan.error } });

    // Step 2: Execute
    const execution = await executePlan(plan.steps, req.apiKey);

    // Step 3: Summarize
    const answer = await summarize(task, execution.results);

    const totalTime = Date.now() - startTime;

    // Charge for the agent overhead (planning + summarizing = ~20 credits)
    const acct = apiKeys.get(req.apiKey);
    if (acct) { if (acct.balance < 20) return res.status(402).json({ error: { code: 'insufficient_credits', need: 20, have: acct.balance, message: 'Buy credits: POST /v1/credits/buy' } }); acct.balance -= 20; }

    // Step 4: Auto-store in memory (free - 0 credits for memory-set)
    const runId = `run-${Date.now().toString(36)}`;
    autoStoreResult(runId, task, answer, execution.results);

    res.json({
      ok: true,
      answer,
      task,
      run_id: runId,
      steps: execution.results.map(r => {
        const step = { api: r.api, reason: r.reason, credits: r.credits, success: !r.error, fallback_used: r.fallback_used || false };
        // Include handler result data (was being stripped — P0 bug)
        if (r.data) {
          const { _engine, ...clean } = r.data;
          step.result = clean;
        }
        if (r.error) step.error = r.error;
        return step;
      }),
      total_credits: execution.total_credits + 20,
      balance: acct?.balance,
      time_ms: totalTime,
      _engine: 'agent',
    });
  });

  // POST /v1/agent/dream — creative, exploratory, high-temperature agent mode
  app.post('/v1/agent/dream', auth, async (req, res) => {
    const prompt = req.body.prompt || req.body.dream || req.body.task;
    if (!prompt) return res.status(400).json({ error: { code: 'missing_prompt', message: 'What should the agent dream about?' } });

    const startTime = Date.now();

    // Use the planner but with creative instructions
    const dreamPrompt = `You are a creative AI agent in DREAM MODE. Be imaginative, unexpected, and exploratory.
The user wants to explore: "${prompt}"
Available tools: ${toolIndex.slice(0, 8000)}
Pick 2-5 tools that would produce surprising, creative, or unexpected results related to this prompt.
Be creative in how you combine them. This is exploration, not production.
JSON array only:`;

    // Plan with high creativity
    const plan = await planTools(dreamPrompt, { model: req.body.model });
    if (plan.error) return res.status(500).json({ error: { code: 'dream_failed', message: plan.error } });

    const execution = await executePlan(plan.steps, req.apiKey);
    const answer = await summarize('Creative exploration of: ' + prompt, execution.results);

    const acct = apiKeys.get(req.apiKey);
    if (acct) { if (acct.balance < 20) return res.status(402).json({ error: { code: 'insufficient_credits', need: 20, have: acct.balance } }); acct.balance -= 20; }

    const runId = 'dream-' + Date.now().toString(36);
    autoStoreResult(runId, prompt, answer, execution.results, 'dream');

    res.json({
      dream: answer,
      prompt,
      mode: 'dream',
      run_id: runId,
      steps: execution.results.map(r => ({ api: r.api, reason: r.reason, success: !r.error })),
      total_credits: execution.total_credits + 20,
      time_ms: Date.now() - startTime,
      _engine: 'agent',
    });
  });

  // POST /v1/agent/remix — take a previous run and remix it
  app.post('/v1/agent/remix', auth, async (req, res) => {
    const { run_id, instruction } = req.body;
    if (!run_id) return res.status(400).json({ error: { code: 'missing_run_id' } });

    // Fetch the original run from memory
    const memGet = allHandlers['memory-get'];
    if (!memGet) return res.status(500).json({ error: { code: 'memory_unavailable' } });

    const original = await memGet({ namespace: 'agent-runs', key: run_id });
    if (!original.found) return res.status(404).json({ error: { code: 'run_not_found' } });

    const parsed = typeof original.value === 'string' ? JSON.parse(original.value) : original.value;
    const remixTask = `Take this previous result and ${instruction || 'remix it creatively'}: ${JSON.stringify(parsed).slice(0, 3000)}`;

    // Forward to agent/run logic directly
    req.body.task = remixTask;
    return res.redirect(307, '/v1/agent/run');
  });

  // Simple version: just ask a question, get an answer
  app.post('/v1/ask', auth, async (req, res) => {
    const question = req.body.question || req.body.q || req.body.task;
    if (!question) return res.status(400).json({ error: { code: 'missing_question' } });

    // For simple questions, use the agent
    req.body.task = question;
    // Forward to agent/run
    const agentReq = { ...req, body: { task: question } };

    const startTime = Date.now();
    const plan = await planTools(question);
    if (plan.error) return res.json({ answer: 'I need the AI engine configured to answer questions. The tools are available at /v1/tools.', error: plan.error });

    const execution = await executePlan(plan.steps, req.apiKey);
    const answer = await summarize(question, execution.results);

    const acct = apiKeys.get(req.apiKey);
    if (acct) { if (acct.balance < 20) return res.status(402).json({ error: { code: 'insufficient_credits', need: 20, have: acct.balance } }); acct.balance -= 20; }

    res.json({
      answer: answer || 'Could not determine answer from available tools.',
      sources: execution.results.map(r => r.api),
      credits: execution.total_credits + 20,
      time_ms: Date.now() - startTime,
    });
  });

  console.log('  🤖 Agent: POST /v1/agent/run, /v1/agent/dream, /v1/agent/remix, /v1/ask, /v1/agent/template/:id, GET /v1/agent/templates, /v1/agent/history');
};
