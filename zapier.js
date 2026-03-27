/**
 * SLOPSHOP ZAPIER INTEGRATION
 *
 * Adds Zapier-native endpoints to server-v2:
 *   - /zapier/auth/test     - test auth (Zapier requirement)
 *   - /zapier/triggers      - list available triggers
 *   - /zapier/actions        - list available actions (all 1,250 APIs)
 *   - /zapier/call/:slug    - Zapier-friendly wrapper (flat key-value input, flat output)
 *   - /zapier/webhook       - receive webhooks FROM Zapier, process, return
 *   - /zapier/subscribe     - webhook subscription management
 *
 * Also exposes /zapier/app.json (Zapier app definition)
 *
 * Mount with: require('./zapier')(app, allHandlers, API_DEFS, apiKeys, auth)
 */

module.exports = function mountZapier(app, allHandlers, API_DEFS, apiKeys, auth) {

  // Zapier app definition (what Zapier reads to build the integration UI)
  app.get('/zapier/app.json', (req, res) => {
    const actions = Object.entries(API_DEFS).map(([slug, def]) => ({
      key: slug,
      noun: def.name,
      display: {
        label: def.name,
        description: def.desc,
      },
      operation: {
        inputFields: [
          { key: 'input', label: 'Input Text', type: 'text', required: false, helpText: 'Primary input data' },
          { key: 'data', label: 'Input Data (JSON)', type: 'text', required: false, helpText: 'JSON object with specific fields for this API' },
        ],
        perform: { url: `{{bundle.authData.base_url}}/zapier/call/${slug}`, method: 'POST',
          headers: { Authorization: 'Bearer {{bundle.authData.api_key}}', 'Content-Type': 'application/json' },
          body: { input: '{{bundle.inputData.input}}', data: '{{bundle.inputData.data}}' },
        },
        sample: { result: 'Sample output', _engine: 'real', credits_used: def.credits },
      },
    }));

    // Group actions by category
    const categories = {};
    for (const [slug, def] of Object.entries(API_DEFS)) {
      if (!categories[def.cat]) categories[def.cat] = [];
      categories[def.cat].push(slug);
    }

    res.json({
      platformVersion: '15.0.0',
      version: '1.0.0',
      key: 'slopshop',
      name: 'Slopshop',
      description: 'The API bazaar for AI agents. 1,250 real APIs - text processing, crypto, AI content, network tools, and more.',
      logo: 'https://slopshop.gg/logo.png',
      authentication: {
        type: 'custom',
        test: { url: '{{bundle.authData.base_url}}/zapier/auth/test', method: 'GET',
          headers: { Authorization: 'Bearer {{bundle.authData.api_key}}' } },
        fields: [
          { key: 'api_key', label: 'API Key', type: 'string', required: true, helpText: 'Your Slopshop API key (sk-slop-...)' },
          { key: 'base_url', label: 'Base URL', type: 'string', required: false, default: 'https://api.slopshop.gg', helpText: 'API base URL (default: https://api.slopshop.gg)' },
        ],
      },
      actions,
      triggers: [
        {
          key: 'credit_low',
          noun: 'Low Credits',
          display: { label: 'Credit Balance Low', description: 'Triggers when credit balance drops below threshold' },
          operation: {
            type: 'polling',
            perform: { url: '{{bundle.authData.base_url}}/v1/credits/balance', method: 'GET',
              headers: { Authorization: 'Bearer {{bundle.authData.api_key}}' } },
          },
        },
      ],
      categories: Object.entries(categories).map(([name, slugs]) => ({ name, api_count: slugs.length })),
    });
  });

  // Auth test endpoint (Zapier calls this to verify the key works)
  app.get('/zapier/auth/test', auth, (req, res) => {
    res.json({
      id: req.acct.id,
      balance: req.acct.balance,
      tier: req.acct.tier,
      message: 'Authenticated successfully',
    });
  });

  // List all available actions for Zapier
  app.get('/zapier/actions', (req, res) => {
    const actions = Object.entries(API_DEFS).map(([slug, def]) => ({
      slug,
      name: def.name,
      description: def.desc,
      category: def.cat,
      credits: def.credits,
      tier: def.tier,
    }));
    res.json({ total: actions.length, actions });
  });

  // Zapier-friendly API call wrapper
  // Accepts flat key-value input (Zapier doesn't do nested JSON well)
  // Returns flat output (Zapier prefers flat responses)
  app.post('/zapier/call/:slug', auth, async (req, res) => {
    const def = API_DEFS[req.params.slug];
    if (!def) return res.status(404).json({ error: `Unknown API: ${req.params.slug}` });

    const handler = allHandlers[req.params.slug];
    if (!handler) return res.status(501).json({ error: `No handler for: ${req.params.slug}` });

    if (req.acct.balance < def.credits) {
      return res.status(402).json({ error: `Insufficient credits. Need ${def.credits}, have ${req.acct.balance}.` });
    }

    req.acct.balance -= def.credits;

    // Build input: try to parse 'data' field as JSON, merge with flat fields
    let input = {};
    if (req.body.data) {
      try { input = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data; }
      catch (e) { input.data = req.body.data; }
    }
    // Merge flat fields (everything except 'data')
    for (const [k, v] of Object.entries(req.body)) {
      if (k !== 'data' && v !== undefined && v !== '') input[k] = v;
    }

    try {
      const result = await handler(input);

      // Flatten for Zapier: convert nested objects to dot-notation
      const flat = {};
      function flatten(obj, prefix = '') {
        for (const [k, v] of Object.entries(obj || {})) {
          const key = prefix ? `${prefix}_${k}` : k;
          if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key);
          else if (Array.isArray(v)) flat[key] = v.join(', ');
          else flat[key] = v;
        }
      }
      flatten(result);
      flat.credits_used = def.credits;
      flat.credits_remaining = req.acct.balance;
      flat.api = req.params.slug;

      res.json(flat);
    } catch (e) {
      res.status(500).json({ error: e.message, api: req.params.slug });
    }
  });

  // Webhook receiver: Zapier sends data TO Slopshop for processing
  // Use case: "When new row in Google Sheet -> process with Slopshop -> update CRM"
  app.post('/zapier/webhook', auth, async (req, res) => {
    const { api, input } = req.body;
    if (!api) return res.status(400).json({ error: 'Provide "api" field with the API slug to call' });

    const def = API_DEFS[api];
    if (!def) return res.status(404).json({ error: `Unknown API: ${api}` });

    const handler = allHandlers[api];
    if (!handler) return res.status(501).json({ error: `No handler: ${api}` });

    if (req.acct.balance < def.credits) {
      return res.status(402).json({ error: 'Insufficient credits' });
    }

    req.acct.balance -= def.credits;

    try {
      const result = await handler(input || req.body);
      res.json({ status: 'processed', api, result, credits_used: def.credits, balance: req.acct.balance });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Webhook subscription management (for Zapier REST hook triggers)
  const webhookSubs = new Map(); // id -> { url, event, key }

  app.post('/zapier/subscribe', auth, (req, res) => {
    const { hookUrl, event } = req.body;
    if (!hookUrl) return res.status(400).json({ error: 'Provide hookUrl' });
    const id = require('crypto').randomUUID();
    webhookSubs.set(id, { url: hookUrl, event: event || 'api_call', key: req.apiKey, created: Date.now() });
    res.status(201).json({ id, status: 'subscribed' });
  });

  app.delete('/zapier/subscribe/:id', auth, (req, res) => {
    webhookSubs.delete(req.params.id);
    res.json({ status: 'unsubscribed' });
  });

  console.log('  🔗 Zapier:   /zapier/app.json, /zapier/call/:slug, /zapier/webhook');
};
