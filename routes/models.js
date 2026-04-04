'use strict';

const crypto = require('crypto');

module.exports = function mountModels(app, db, apiKeys, auth, publicRateLimit, allHandlers, dbInsertAudit, persistKey, emitUsageEvent) {
  const { API_DEFS } = require('../registry');
  const { SCHEMAS } = require('../schemas');

  // ===== NATIVE OLLAMA INTEGRATION =====
  function ollamaRequest(path, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = require('http').request({ hostname: '127.0.0.1', port: 11434, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 120000 }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('Invalid JSON from Ollama')); } });
      });
      req.on('error', e => reject(e));
      req.on('timeout', () => { req.destroy(); reject(new Error('Ollama timeout')); });
      req.write(data); req.end();
    });
  }

  app.get('/v1/models/ollama', publicRateLimit, async (req, res) => {
    try {
      const ollamaHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
      const resp = await new Promise((resolve, reject) => {
        const url = new URL('/api/tags', ollamaHost);
        const mod = url.protocol === 'https:' ? require('https') : require('http');
        const request = mod.get(url, { timeout: 5000 }, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
        });
        request.on('error', reject);
        request.on('timeout', () => { request.destroy(); reject(new Error('Ollama timeout')); });
      });
      const models = (resp.models || []).map(m => ({ name: m.name, size: m.size, parameter_size: m.details?.parameter_size, family: m.details?.family }));
      res.json({ ok: true, models, count: models.length, host: ollamaHost, _engine: 'ollama' });
    } catch(e) { res.status(502).json({ error: { code: 'ollama_unavailable', message: 'Ollama not running. Set OLLAMA_HOST env var if using custom host.', hint: 'Start with: ollama serve' } }); }
  });

  app.post('/v1/models/ollama/generate', auth, async (req, res) => {
    const { model, prompt, namespace } = req.body;
    if (!model || !prompt) return res.status(400).json({ error: { code: 'missing_fields', message: 'model and prompt required' } });
    const start = Date.now();
    try {
      const resp = await ollamaRequest('/api/chat', { model, messages: [{ role: 'user', content: prompt }], stream: false });
      const answer = resp.message?.content || '';
      const latency = Date.now() - start;
      const outputHash = crypto.createHash('sha256').update(answer).digest('hex').slice(0, 16);
      if (namespace && allHandlers && allHandlers['memory-set']) { try { allHandlers['memory-set']({ key: namespace + '-' + Date.now(), value: answer.slice(0, 1000), namespace }); } catch(e) {} }
      res.json({ ok: true, data: { answer, model, _engine: 'ollama', output_hash: outputHash }, meta: { credits_used: 0, latency_ms: latency, engine: 'ollama' } });
    } catch(e) { res.status(502).json({ error: { code: 'ollama_error', message: e.message, hint: 'Is Ollama running? ollama serve' } }); }
  });

  app.post('/v1/models/ollama/embeddings', auth, async (req, res) => {
    const { model, prompt, namespace } = req.body;
    if (!model || !prompt) return res.status(400).json({ error: { code: 'missing_fields', message: 'model and prompt required' } });
    try {
      const resp = await ollamaRequest('/api/embeddings', { model, prompt });
      const embedding = resp.embedding || [];
      const outputHash = crypto.createHash('sha256').update(JSON.stringify(embedding)).digest('hex').slice(0, 16);
      if (namespace && allHandlers && allHandlers['memory-set']) { try { allHandlers['memory-set']({ key: namespace + '-emb-' + Date.now(), value: JSON.stringify(embedding.slice(0, 100)), namespace }); } catch(e) {} }
      res.json({ ok: true, data: { embedding, dimensions: embedding.length, model, _engine: 'ollama', output_hash: outputHash }, meta: { credits_used: 0, engine: 'ollama' } });
    } catch(e) { res.status(502).json({ error: { code: 'ollama_error', message: e.message } }); }
  });

  // ===== NATIVE vLLM INTEGRATION =====
  const VLLM_HOST = process.env.VLLM_HOST || 'http://localhost:8000';

  function vllmRequest(path, body) {
    const url = new URL(path, VLLM_HOST);
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const mod = url.protocol === 'https:' ? require('https') : require('http');
      const req = mod.request(url, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 120000 }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('Invalid JSON from vLLM')); } });
      });
      req.on('error', e => reject(e));
      req.on('timeout', () => { req.destroy(); reject(new Error('vLLM timeout')); });
      req.write(data); req.end();
    });
  }

  app.get('/v1/models/vllm', publicRateLimit, async (req, res) => {
    try {
      const url = new URL('/v1/models', VLLM_HOST);
      const mod = url.protocol === 'https:' ? require('https') : require('http');
      const resp = await new Promise((resolve, reject) => {
        const request = mod.get(url, { timeout: 5000 }, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
        });
        request.on('error', reject);
        request.on('timeout', () => { request.destroy(); reject(new Error('vLLM timeout')); });
      });
      const models = (resp.data || []).map(m => ({ id: m.id, object: m.object, owned_by: m.owned_by }));
      res.json({ ok: true, models, count: models.length, host: VLLM_HOST, _engine: 'vllm' });
    } catch(e) { res.status(502).json({ error: { code: 'vllm_unavailable', message: 'vLLM not running on ' + VLLM_HOST, hint: 'Start vLLM with: python -m vllm.entrypoints.openai.api_server --model <model>' } }); }
  });

  app.post('/v1/models/vllm/generate', auth, async (req, res) => {
    const { model, prompt, messages, namespace, ...extra } = req.body;
    if (!prompt && !messages) return res.status(400).json({ error: { code: 'missing_fields', message: 'prompt or messages required' } });
    const chatMessages = messages || [{ role: 'user', content: prompt }];
    const start = Date.now();
    try {
      const resp = await vllmRequest('/v1/chat/completions', { model: model || undefined, messages: chatMessages, ...extra });
      const answer = resp.choices?.[0]?.message?.content || '';
      const latency = Date.now() - start;
      const outputHash = crypto.createHash('sha256').update(answer).digest('hex').slice(0, 16);
      if (namespace && allHandlers && allHandlers['memory-set']) { try { allHandlers['memory-set']({ key: namespace + '-' + Date.now(), value: answer.slice(0, 1000), namespace }); } catch(e) {} }
      res.json({ ok: true, data: { answer, model: resp.model || model, _engine: 'vllm', output_hash: outputHash, usage: resp.usage || null }, meta: { credits_used: 0, latency_ms: latency, engine: 'vllm' } });
    } catch(e) { res.status(502).json({ error: { code: 'vllm_error', message: e.message, hint: 'Is vLLM running? python -m vllm.entrypoints.openai.api_server --model <model>' } }); }
  });

  // ===== NATIVE llama.cpp INTEGRATION =====
  const LLAMACPP_HOST = process.env.LLAMACPP_HOST || 'http://localhost:8080';

  function llamacppRequest(path, body) {
    const url = new URL(path, LLAMACPP_HOST);
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const mod = url.protocol === 'https:' ? require('https') : require('http');
      const req = mod.request(url, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 120000 }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('Invalid JSON from llama.cpp')); } });
      });
      req.on('error', e => reject(e));
      req.on('timeout', () => { req.destroy(); reject(new Error('llama.cpp timeout')); });
      req.write(data); req.end();
    });
  }

  app.post('/v1/models/llama-cpp/generate', auth, async (req, res) => {
    const { prompt, namespace, ...extra } = req.body;
    if (!prompt) return res.status(400).json({ error: { code: 'missing_fields', message: 'prompt required' } });
    const start = Date.now();
    try {
      const resp = await llamacppRequest('/completion', { prompt, ...extra });
      const answer = resp.content || '';
      const latency = Date.now() - start;
      const outputHash = crypto.createHash('sha256').update(answer).digest('hex').slice(0, 16);
      if (namespace && allHandlers && allHandlers['memory-set']) { try { allHandlers['memory-set']({ key: namespace + '-' + Date.now(), value: answer.slice(0, 1000), namespace }); } catch(e) {} }
      res.json({ ok: true, data: { answer, _engine: 'llama-cpp', output_hash: outputHash }, meta: { credits_used: 0, latency_ms: latency, engine: 'llama-cpp' } });
    } catch(e) { res.status(502).json({ error: { code: 'llamacpp_error', message: e.message, hint: 'Is llama.cpp server running? ./server -m model.gguf --port 8080' } }); }
  });

  // ===== CLOUD MODEL PROXIES (Grok / DeepSeek / Auto-Router) =====

  function cloudRequest(hostname, path, apiKey, body, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = require('https').request({ hostname, port: 443, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Authorization': 'Bearer ' + apiKey }, timeout: timeoutMs }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('Invalid JSON from cloud API')); } });
      });
      req.on('error', e => reject(e));
      req.on('timeout', () => { req.destroy(); reject(new Error('Cloud API timeout')); });
      req.write(data); req.end();
    });
  }

  // --- Grok (xAI) ---
  app.post('/v1/models/grok/generate', auth, async (req, res) => {
    const grokKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.X_API_KEY;
    if (!grokKey) return res.status(503).json({ error: { code: 'grok_not_configured', message: 'XAI_API_KEY env var not set' } });
    const { model, prompt, messages, namespace, ...extra } = req.body;
    if (!prompt && !messages) return res.status(400).json({ error: { code: 'missing_fields', message: 'prompt or messages required' } });
    const creditCost = 10;
    if (req.acct.balance < creditCost) return res.status(402).json({ error: { code: 'insufficient_credits', need: creditCost, have: req.acct.balance } });
    req.acct.balance -= creditCost;
    const chatMessages = messages || [{ role: 'user', content: prompt }];
    const start = Date.now();
    try {
      const resp = await cloudRequest('api.x.ai', '/v1/chat/completions', grokKey, { model: model || 'grok-3', messages: chatMessages, ...extra });
      if (resp.error) { req.acct.balance += creditCost; return res.status(502).json({ error: { code: 'grok_api_error', message: resp.error.message || JSON.stringify(resp.error) } }); }
      const answer = resp.choices?.[0]?.message?.content || '';
      const latency = Date.now() - start;
      const outputHash = crypto.createHash('sha256').update(answer).digest('hex').slice(0, 16);
      if (namespace && allHandlers && allHandlers['memory-set']) { try { allHandlers['memory-set']({ key: namespace + '-' + Date.now(), value: answer.slice(0, 1000), namespace }); } catch(e) {} }
      if (dbInsertAudit) dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', 'grok-generate', creditCost, latency, 'grok');
      if (persistKey) persistKey(req.apiKey);
      if (emitUsageEvent) emitUsageEvent(req.apiKey.slice(0, 12) + '...', 'grok-generate', creditCost, 'ok');
      res.json({ ok: true, data: { answer, model: resp.model || model || 'grok-3', _engine: 'grok', output_hash: outputHash, usage: resp.usage || null }, meta: { credits_used: creditCost, latency_ms: latency, engine: 'grok' } });
    } catch(e) {
      req.acct.balance += creditCost;
      res.status(502).json({ error: { code: 'grok_error', message: e.message } });
    }
  });

  // --- Grok Tool Optimizer ---
  app.post('/v1/grok/optimize', auth, (req, res) => {
    const { tool_slug, task_description } = req.body;
    if (!tool_slug) return res.status(400).json({ error: { code: 'missing_fields', message: 'tool_slug is required' } });
    if (!task_description) return res.status(400).json({ error: { code: 'missing_fields', message: 'task_description is required' } });

    const def = API_DEFS[tool_slug];
    if (!def) return res.status(404).json({ error: { code: 'tool_not_found', message: `No tool found for slug: ${tool_slug}` } });

    const schema = SCHEMAS[tool_slug] || null;
    const inputFields = schema?.input ? Object.keys(schema.input) : [];
    const example = schema?.example || null;

    // Build Grok-optimized chain-of-thought hints
    const hints = [
      `Think step-by-step before calling "${def.name}".`,
      `Task context: ${task_description}`,
      `This tool belongs to category "${def.cat}" and costs ${def.credits} credit(s) (tier: ${def.tier}).`,
      inputFields.length ? `Required input fields: ${inputFields.join(', ')}. Map your reasoning to each field before invoking.` : null,
      `Grok reasoning style: Be direct, break the problem into sub-tasks, solve each, then compose the final tool call.`,
      `If the output is unexpected, re-examine your inputs — don't retry blindly.`,
    ].filter(Boolean);

    const optimized_schema = {
      slug: tool_slug,
      name: def.name,
      description: def.desc,
      category: def.cat,
      tier: def.tier,
      credits: def.credits,
      input: schema?.input || {},
      output: schema?.output || {},
      example,
      chain_of_thought_prompt: [
        `You are solving: "${task_description}"`,
        `Available tool: ${def.name} — ${def.desc}`,
        inputFields.length ? `Step 1: Identify values for each input field: [${inputFields.join(', ')}].` : null,
        `Step 2: Validate that your inputs match the tool's expectations.`,
        `Step 3: Call the tool with your prepared inputs.`,
        `Step 4: Interpret the result and decide if you need a follow-up action.`,
      ].filter(Boolean),
    };

    res.json({
      ok: true,
      optimized_schema,
      hints,
      _engine: 'real',
    });
  });

  // --- DeepSeek ---
  app.post('/v1/models/deepseek/generate', auth, async (req, res) => {
    const dsKey = process.env.DEEPSEEK_API_KEY;
    if (!dsKey) return res.status(503).json({ error: { code: 'deepseek_not_configured', message: 'DEEPSEEK_API_KEY env var not set' } });
    const { model, prompt, messages, namespace, ...extra } = req.body;
    if (!prompt && !messages) return res.status(400).json({ error: { code: 'missing_fields', message: 'prompt or messages required' } });
    const creditCost = 5;
    if (req.acct.balance < creditCost) return res.status(402).json({ error: { code: 'insufficient_credits', need: creditCost, have: req.acct.balance } });
    req.acct.balance -= creditCost;
    const chatMessages = messages || [{ role: 'user', content: prompt }];
    const start = Date.now();
    try {
      const resp = await cloudRequest('api.deepseek.com', '/v1/chat/completions', dsKey, { model: model || 'deepseek-chat', messages: chatMessages, ...extra });
      if (resp.error) { req.acct.balance += creditCost; return res.status(502).json({ error: { code: 'deepseek_api_error', message: resp.error.message || JSON.stringify(resp.error) } }); }
      const answer = resp.choices?.[0]?.message?.content || '';
      const latency = Date.now() - start;
      const outputHash = crypto.createHash('sha256').update(answer).digest('hex').slice(0, 16);
      if (namespace && allHandlers && allHandlers['memory-set']) { try { allHandlers['memory-set']({ key: namespace + '-' + Date.now(), value: answer.slice(0, 1000), namespace }); } catch(e) {} }
      if (dbInsertAudit) dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', 'deepseek-generate', creditCost, latency, 'deepseek');
      if (persistKey) persistKey(req.apiKey);
      if (emitUsageEvent) emitUsageEvent(req.apiKey.slice(0, 12) + '...', 'deepseek-generate', creditCost, 'ok');
      res.json({ ok: true, data: { answer, model: resp.model || model || 'deepseek-chat', _engine: 'deepseek', output_hash: outputHash, usage: resp.usage || null }, meta: { credits_used: creditCost, latency_ms: latency, engine: 'deepseek' } });
    } catch(e) {
      req.acct.balance += creditCost;
      res.status(502).json({ error: { code: 'deepseek_error', message: e.message } });
    }
  });

  // --- Smart Auto-Router ---
  app.post('/v1/models/auto', auth, async (req, res) => {
    const { prompt, messages, prefer, model, namespace, ...extra } = req.body;
    if (!prompt && !messages) return res.status(400).json({ error: { code: 'missing_fields', message: 'prompt or messages required' } });
    const strategy = prefer || 'best';

    const providerOrder = {
      local: ['ollama', 'deepseek', 'grok', 'anthropic'],
      fast:  ['grok', 'anthropic', 'deepseek', 'ollama'],
      cheap: ['deepseek', 'ollama', 'grok', 'anthropic'],
      best:  ['anthropic', 'grok', 'deepseek', 'ollama'],
    };
    const order = providerOrder[strategy] || providerOrder.best;

    function isAvailable(provider) {
      if (provider === 'ollama') return !!(process.env.OLLAMA_HOST || process.env.OLLAMA_AVAILABLE);
      if (provider === 'grok') return !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.X_API_KEY);
      if (provider === 'deepseek') return !!process.env.DEEPSEEK_API_KEY;
      if (provider === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
      return false;
    }

    const creditCosts = { ollama: 0, grok: 10, deepseek: 5, anthropic: 15 };
    const chatMessages = messages || [{ role: 'user', content: prompt }];

    for (const provider of order) {
      if (!isAvailable(provider)) continue;
      const cost = creditCosts[provider];
      if (cost > 0 && req.acct.balance < cost) continue;

      const start = Date.now();
      try {
        let answer, respModel, usage;
        if (provider === 'ollama') {
          const ollamaModel = model || 'llama3';
          const resp = await ollamaRequest('/api/chat', { model: ollamaModel, messages: [{ role: 'user', content: prompt || chatMessages[chatMessages.length - 1].content }], stream: false });
          answer = resp.message?.content || '';
          respModel = ollamaModel;
        } else if (provider === 'grok') {
          const grokKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.X_API_KEY;
          const resp = await cloudRequest('api.x.ai', '/v1/chat/completions', grokKey, { model: model || 'grok-3', messages: chatMessages, ...extra });
          if (resp.error) continue;
          answer = resp.choices?.[0]?.message?.content || '';
          respModel = resp.model || model || 'grok-3';
          usage = resp.usage;
        } else if (provider === 'deepseek') {
          const dsKey = process.env.DEEPSEEK_API_KEY;
          const resp = await cloudRequest('api.deepseek.com', '/v1/chat/completions', dsKey, { model: model || 'deepseek-chat', messages: chatMessages, ...extra });
          if (resp.error) continue;
          answer = resp.choices?.[0]?.message?.content || '';
          respModel = resp.model || model || 'deepseek-chat';
          usage = resp.usage;
        } else if (provider === 'anthropic') {
          const antKey = process.env.ANTHROPIC_API_KEY;
          const resp = await cloudRequest('api.anthropic.com', '/v1/messages', antKey, { model: model || 'claude-sonnet-4-20250514', max_tokens: 4096, messages: chatMessages, ...extra });
          if (resp.error) continue;
          answer = resp.content?.[0]?.text || '';
          respModel = resp.model || model || 'claude-sonnet-4-20250514';
          usage = resp.usage;
        }

        if (!answer) continue;

        const latency = Date.now() - start;
        if (cost > 0) {
          req.acct.balance -= cost;
          if (dbInsertAudit) dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', 'auto-' + provider, cost, latency, provider);
          if (persistKey) persistKey(req.apiKey);
          if (emitUsageEvent) emitUsageEvent(req.apiKey.slice(0, 12) + '...', 'auto-' + provider, cost, 'ok');
        }
        const outputHash = crypto.createHash('sha256').update(answer).digest('hex').slice(0, 16);
        if (namespace && allHandlers && allHandlers['memory-set']) { try { allHandlers['memory-set']({ key: namespace + '-' + Date.now(), value: answer.slice(0, 1000), namespace }); } catch(e) {} }
        return res.json({ ok: true, data: { answer, model: respModel, _engine: provider, output_hash: outputHash, usage: usage || null }, meta: { credits_used: cost, latency_ms: latency, engine: provider, strategy, providers_tried: order.slice(0, order.indexOf(provider) + 1) } });
      } catch(e) {
        continue;
      }
    }

    res.status(503).json({ error: { code: 'no_provider_available', message: 'All providers failed or unavailable', strategy, tried: order.filter(p => isAvailable(p)) } });
  });

  // --- Unified Model List ---
  app.get('/v1/models', publicRateLimit, async (req, res) => {
    const models = [];

    // Check Ollama
    try {
      const resp = await new Promise((resolve, reject) => {
        const r = require('http').get('http://127.0.0.1:11434/api/tags', rr => {
          let d = ''; rr.on('data', c => d += c); rr.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
        });
        r.on('error', reject);
        r.setTimeout(3000, () => { r.destroy(); reject(new Error('timeout')); });
      });
      for (const m of (resp.models || [])) {
        models.push({ id: m.name, provider: 'ollama', type: 'local', credits_per_call: 0, details: { size: m.size, parameter_size: m.details?.parameter_size, family: m.details?.family } });
      }
    } catch(e) { /* Ollama not running */ }

    // Cloud providers
    if (process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.X_API_KEY) {
      models.push({ id: 'grok-3', provider: 'grok', type: 'cloud', credits_per_call: 10 });
      models.push({ id: 'grok-3-mini', provider: 'grok', type: 'cloud', credits_per_call: 10 });
    }
    if (process.env.DEEPSEEK_API_KEY) {
      models.push({ id: 'deepseek-chat', provider: 'deepseek', type: 'cloud', credits_per_call: 5 });
      models.push({ id: 'deepseek-reasoner', provider: 'deepseek', type: 'cloud', credits_per_call: 5 });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      models.push({ id: 'claude-sonnet-4-20250514', provider: 'anthropic', type: 'cloud', credits_per_call: 15 });
      models.push({ id: 'claude-opus-4-20250514', provider: 'anthropic', type: 'cloud', credits_per_call: 15 });
    }

    // Check vLLM
    try {
      const url = new URL('/v1/models', VLLM_HOST);
      const mod = url.protocol === 'https:' ? require('https') : require('http');
      const resp = await new Promise((resolve, reject) => {
        const r = mod.get(url, rr => {
          let d = ''; rr.on('data', c => d += c); rr.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
        });
        r.on('error', reject);
        r.setTimeout(3000, () => { r.destroy(); reject(new Error('timeout')); });
      });
      for (const m of (resp.data || [])) {
        models.push({ id: m.id, provider: 'vllm', type: 'local', credits_per_call: 0 });
      }
    } catch(e) { /* vLLM not running */ }

    const providers = [...new Set(models.map(m => m.provider))];
    res.json({ ok: true, models, count: models.length, providers, _note: 'Local models are free (0 credits). Cloud models require auth and credits.' });
  });
};
