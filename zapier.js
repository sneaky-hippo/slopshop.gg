/**
 * SLOPSHOP ZAPIER INTEGRATION
 *
 * Adds Zapier-native endpoints to server-v2:
 *   - /zapier/auth/test          - test auth (Zapier requirement)
 *   - /zapier/v1/triggers        - list available triggers (v1 prefix for Zapier CLI)
 *   - /zapier/v1/actions         - list available actions with pagination + filtering
 *   - /zapier/v1/execute         - Zapier-friendly execute endpoint
 *   - /zapier/v1/fields/:slug    - dynamic input fields for a given action
 *   - /zapier/v1/output/:slug    - output field mapping for a given action
 *   - /zapier/v1/trigger/poll/:event - polling trigger endpoint
 *   - /zapier/call/:slug         - Zapier-friendly wrapper (flat key-value input, flat output)
 *   - /zapier/webhook            - receive webhooks FROM Zapier, process, return
 *   - /zapier/subscribe          - webhook subscription management (REST hooks)
 *   - /zapier/app.json           - Zapier app definition
 *
 * Mount with: require('./zapier')(app, allHandlers, API_DEFS, apiKeys, auth)
 *
 * Zapier CLI compatibility: authentication_type = 'custom', test endpoint at /zapier/auth/test
 */

const crypto = require('crypto');

// In-memory webhook subscriptions (keyed by id)
// NOTE: These reset on server restart. For production persistence, wire into db.
const webhookSubs = new Map();

// Per-key polling cursors: track last seen event timestamps for triggers
const pollCursors = new Map(); // `${apiKey}:${event}` -> ISO timestamp

// Helper: flatten a nested object to dot-notation keys (safe for Zapier)
function flatten(obj, prefix = '') {
  const flat = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}_${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(flat, flatten(v, key));
    } else if (Array.isArray(v)) {
      flat[key] = v.map(item => (typeof item === 'object' ? JSON.stringify(item) : item)).join(', ');
    } else {
      flat[key] = v;
    }
  }
  return flat;
}

// Helper: convert API_DEFS schema to Zapier inputFields array
function buildInputFields(slug, def, SCHEMAS) {
  const schema = SCHEMAS && SCHEMAS[slug];
  if (schema && schema.input && typeof schema.input === 'object') {
    return Object.entries(schema.input).map(([key, spec]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
      type: spec.type === 'number' ? 'integer' : spec.type === 'boolean' ? 'boolean' : 'string',
      required: spec.required === true,
      helpText: spec.description || '',
    }));
  }
  // Fallback generic fields
  return [
    { key: 'input', label: 'Input Text', type: 'string', required: false, helpText: 'Primary input data' },
    { key: 'data', label: 'Input Data (JSON)', type: 'string', required: false, helpText: 'JSON object with specific fields for this API' },
  ];
}

// Helper: convert API_DEFS schema to Zapier outputFields array
function buildOutputFields(slug, def, SCHEMAS) {
  const schema = SCHEMAS && SCHEMAS[slug];
  if (schema && schema.output && typeof schema.output === 'object') {
    return Object.entries(schema.output).map(([key, type]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
      type: String(type).includes('number') ? 'integer' : 'string',
    }));
  }
  return [
    { key: 'result', label: 'Result', type: 'string' },
    { key: 'credits_used', label: 'Credits Used', type: 'integer' },
    { key: 'credits_remaining', label: 'Credits Remaining', type: 'integer' },
  ];
}

// Fire registered webhooks for an event (called internally when events occur)
async function fireWebhooks(event, payload) {
  const targets = [...webhookSubs.values()].filter(s => s.event === event || s.event === '*');
  for (const sub of targets) {
    try {
      await fetch(sub.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Zapier-Event': event },
        body: JSON.stringify({ event, data: payload, ts: new Date().toISOString() }),
      }).catch(() => {}); // swallow network errors — Zapier handles retries
    } catch (_) {}
  }
}

module.exports = function mountZapier(app, allHandlers, API_DEFS, apiKeys, auth, SCHEMAS) {
  // ─── SCHEMAS optional (passed from server-v2 if available) ───────────────
  // Gracefully handle if SCHEMAS was not passed (older server-v2 mount)
  if (!SCHEMAS || typeof SCHEMAS !== 'object') SCHEMAS = {};

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH TEST — Zapier calls this first to verify the API key is valid
  // ═══════════════════════════════════════════════════════════════════════════
  app.get('/zapier/auth/test', auth, (req, res) => {
    const acct = req.acct || {};
    res.json({
      id: acct.id || 'unknown',
      balance: acct.balance != null ? acct.balance : 0,
      tier: acct.tier || 'free',
      message: 'Authenticated successfully',
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // APP DEFINITION — Zapier reads this to build the integration UI
  // ═══════════════════════════════════════════════════════════════════════════
  app.get('/zapier/app.json', (req, res) => {
    // Build actions list for the app manifest
    const actions = Object.entries(API_DEFS).map(([slug, def]) => ({
      key: slug,
      noun: def.name,
      display: {
        label: def.name,
        description: def.desc || '',
      },
      operation: {
        inputFields: buildInputFields(slug, def, SCHEMAS),
        outputFields: buildOutputFields(slug, def, SCHEMAS),
        perform: {
          url: `{{bundle.authData.base_url}}/zapier/call/${slug}`,
          method: 'POST',
          headers: {
            Authorization: 'Bearer {{bundle.authData.api_key}}',
            'Content-Type': 'application/json',
          },
          body: { input: '{{bundle.inputData.input}}', data: '{{bundle.inputData.data}}' },
        },
        sample: { result: 'Sample output', _engine: 'real', credits_used: def.credits || 1 },
      },
    }));

    // Group categories
    const categories = {};
    for (const [slug, def] of Object.entries(API_DEFS)) {
      const cat = def.cat || def.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(slug);
    }

    res.json({
      platformVersion: '15.0.0',
      version: '1.0.0',
      key: 'slopshop',
      name: 'Slopshop',
      description: 'The API bazaar for AI agents. 1,300+ real APIs — text processing, crypto, AI content, network tools, and more.',
      logo: 'https://slopshop.gg/logo.png',
      // Zapier CLI compatible authentication block
      authentication: {
        type: 'custom',
        authentication_type: 'custom',
        test: {
          url: '{{bundle.authData.base_url}}/zapier/auth/test',
          method: 'GET',
          headers: { Authorization: 'Bearer {{bundle.authData.api_key}}' },
        },
        fields: [
          {
            key: 'api_key',
            label: 'API Key',
            type: 'string',
            required: true,
            helpText: 'Your Slopshop API key (sk-slop-...)',
          },
          {
            key: 'base_url',
            label: 'Base URL',
            type: 'string',
            required: false,
            default: 'https://slopshop-production.up.railway.app',
            helpText: 'API base URL (leave blank for production)',
          },
        ],
        connectionLabel: '{{bundle.authData.api_key}}',
      },
      actions,
      triggers: [
        {
          key: 'credit_low',
          noun: 'Credit Balance',
          display: {
            label: 'Credit Balance Low',
            description: 'Triggers when credit balance drops below threshold',
          },
          operation: {
            type: 'polling',
            inputFields: [
              { key: 'threshold', label: 'Threshold', type: 'integer', required: false, default: '100', helpText: 'Alert when balance falls below this number' },
            ],
            perform: {
              url: '{{bundle.authData.base_url}}/zapier/v1/trigger/poll/credit_low',
              method: 'GET',
              params: { threshold: '{{bundle.inputData.threshold}}' },
              headers: { Authorization: 'Bearer {{bundle.authData.api_key}}' },
            },
            sample: { id: 'credit_low_1', balance: 50, threshold: 100, triggered_at: new Date().toISOString() },
          },
        },
        {
          key: 'memory_change',
          noun: 'Memory Entry',
          display: {
            label: 'New Memory Entry',
            description: 'Triggers when a new memory entry is written (polling)',
          },
          operation: {
            type: 'polling',
            inputFields: [
              { key: 'namespace', label: 'Namespace', type: 'string', required: false, default: 'default', helpText: 'Memory namespace to watch' },
            ],
            perform: {
              url: '{{bundle.authData.base_url}}/zapier/v1/trigger/poll/memory_change',
              method: 'GET',
              params: { namespace: '{{bundle.inputData.namespace}}' },
              headers: { Authorization: 'Bearer {{bundle.authData.api_key}}' },
            },
            sample: { id: 'mem_1', key: 'example_key', value: 'example value', namespace: 'default', created_at: new Date().toISOString() },
          },
        },
        {
          key: 'dream_insight',
          noun: 'Dream Insight',
          display: {
            label: 'New Dream Insight',
            description: 'Triggers when a dream insight is written to memory (polling)',
          },
          operation: {
            type: 'polling',
            inputFields: [
              { key: 'topic', label: 'Topic Filter', type: 'string', required: false, helpText: 'Only return insights matching this topic (optional)' },
            ],
            perform: {
              url: '{{bundle.authData.base_url}}/zapier/v1/trigger/poll/dream_insight',
              method: 'GET',
              params: { topic: '{{bundle.inputData.topic}}' },
              headers: { Authorization: 'Bearer {{bundle.authData.api_key}}' },
            },
            sample: { id: 'dream_1', topic: 'AI strategy', insight: 'Example insight text', created_at: new Date().toISOString() },
          },
        },
        {
          key: 'api_call_complete',
          noun: 'API Call',
          display: {
            label: 'API Call Complete (REST Hook)',
            description: 'Triggers via REST hook when an API call completes',
          },
          operation: {
            type: 'hook',
            inputFields: [
              { key: 'api_slug', label: 'API Slug', type: 'string', required: false, helpText: 'Filter by specific API slug (leave blank for all)' },
            ],
            performSubscribe: {
              url: '{{bundle.authData.base_url}}/zapier/subscribe',
              method: 'POST',
              headers: { Authorization: 'Bearer {{bundle.authData.api_key}}', 'Content-Type': 'application/json' },
              body: { hookUrl: '{{bundle.targetUrl}}', event: 'api_call_complete', filter: '{{bundle.inputData.api_slug}}' },
            },
            performUnsubscribe: {
              url: '{{bundle.authData.base_url}}/zapier/subscribe/{{bundle.subscribeData.id}}',
              method: 'DELETE',
              headers: { Authorization: 'Bearer {{bundle.authData.api_key}}' },
            },
            perform: '{{bundle.cleanedRequest}}',
            sample: { id: 'call_1', api: 'crypto-uuid', result: 'abc-123', credits_used: 1, ts: new Date().toISOString() },
          },
        },
      ],
      categories: Object.entries(categories).map(([name, slugs]) => ({ name, api_count: slugs.length })),
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // v1 API — matches /zapier/v1/* (Zapier CLI default prefix)
  // ═══════════════════════════════════════════════════════════════════════════

  // LIST TRIGGERS — /zapier/v1/triggers
  app.get('/zapier/v1/triggers', auth, (req, res) => {
    res.json({
      triggers: [
        {
          key: 'credit_low',
          label: 'Credit Balance Low',
          description: 'Triggers when credit balance drops below threshold',
          type: 'polling',
          poll_url: '/zapier/v1/trigger/poll/credit_low',
        },
        {
          key: 'memory_change',
          label: 'New Memory Entry',
          description: 'Triggers when a new memory entry is written',
          type: 'polling',
          poll_url: '/zapier/v1/trigger/poll/memory_change',
        },
        {
          key: 'dream_insight',
          label: 'New Dream Insight',
          description: 'Triggers when a dream insight is stored',
          type: 'polling',
          poll_url: '/zapier/v1/trigger/poll/dream_insight',
        },
        {
          key: 'api_call_complete',
          label: 'API Call Complete',
          description: 'Triggers via REST hook when an API call completes',
          type: 'hook',
          subscribe_url: '/zapier/subscribe',
        },
      ],
    });
  });

  // LIST ACTIONS — /zapier/v1/actions  (auth required, paginated, filterable)
  app.get('/zapier/v1/actions', auth, (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(req.query.per_page) || 50));
    const category = req.query.category || '';
    const search = (req.query.q || req.query.search || '').toLowerCase();
    const tier = req.query.tier || '';

    let entries = Object.entries(API_DEFS);

    if (category) {
      entries = entries.filter(([, def]) => {
        const cat = def.cat || def.category || '';
        return cat.toLowerCase() === category.toLowerCase();
      });
    }
    if (search) {
      entries = entries.filter(([slug, def]) =>
        slug.includes(search) ||
        (def.name || '').toLowerCase().includes(search) ||
        (def.desc || '').toLowerCase().includes(search)
      );
    }
    if (tier) {
      entries = entries.filter(([, def]) => (def.tier || '').toLowerCase() === tier.toLowerCase());
    }

    const total = entries.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const pageEntries = entries.slice(offset, offset + perPage);

    const actions = pageEntries.map(([slug, def]) => ({
      slug,
      name: def.name,
      description: def.desc,
      category: def.cat || def.category,
      credits: def.credits,
      tier: def.tier,
    }));

    res.json({
      total,
      page,
      per_page: perPage,
      total_pages: totalPages,
      actions,
    });
  });

  // EXECUTE — /zapier/v1/execute  (Zapier CLI compatible execute endpoint)
  // Accepts: { action: "slug", input: { ...fields } }
  app.post('/zapier/v1/execute', auth, async (req, res) => {
    const { action, input } = req.body || {};
    if (!action) return res.status(400).json({ error: 'Provide "action" field with the API slug to call' });

    const def = API_DEFS[action];
    if (!def) return res.status(404).json({ error: `Unknown action: ${action}` });

    const handler = allHandlers[action];
    if (!handler) return res.status(501).json({ error: `No handler registered for: ${action}` });

    const acct = req.acct;
    if (acct.balance < (def.credits || 1)) {
      return res.status(402).json({ error: `Insufficient credits. Need ${def.credits}, have ${acct.balance}.` });
    }

    acct.balance -= def.credits || 1;

    try {
      const result = await handler(input || {});

      // Ensure result is always an object for flattening
      const resultObj = (result !== null && typeof result === 'object' && !Array.isArray(result))
        ? result
        : { result };

      const flat = flatten(resultObj);
      flat.credits_used = def.credits || 1;
      flat.credits_remaining = acct.balance;
      flat.action = action;

      // Fire any registered REST hook webhooks
      fireWebhooks('api_call_complete', { api: action, result: flat }).catch(() => {});

      res.json(flat);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e), action });
    }
  });

  // DYNAMIC FIELDS — /zapier/v1/fields/:slug
  // Zapier calls this to populate dropdown fields dynamically from the API
  app.get('/zapier/v1/fields/:slug', auth, (req, res) => {
    const slug = req.params.slug;
    const def = API_DEFS[slug];
    if (!def) return res.status(404).json({ error: `Unknown action: ${slug}` });

    const inputFields = buildInputFields(slug, def, SCHEMAS);
    const outputFields = buildOutputFields(slug, def, SCHEMAS);

    res.json({
      slug,
      name: def.name,
      input_fields: inputFields,
      output_fields: outputFields,
    });
  });

  // OUTPUT FIELD MAPPING — /zapier/v1/output/:slug
  // Returns the expected output schema so Zapier can map fields in subsequent Zap steps
  app.get('/zapier/v1/output/:slug', auth, (req, res) => {
    const slug = req.params.slug;
    const def = API_DEFS[slug];
    if (!def) return res.status(404).json({ error: `Unknown action: ${slug}` });

    const outputFields = buildOutputFields(slug, def, SCHEMAS);

    // Always include the standard Zapier meta fields
    const metaFields = [
      { key: 'credits_used', label: 'Credits Used', type: 'integer' },
      { key: 'credits_remaining', label: 'Credits Remaining', type: 'integer' },
      { key: 'action', label: 'Action Slug', type: 'string' },
    ];

    res.json({
      slug,
      name: def.name,
      output_fields: [...outputFields, ...metaFields],
    });
  });

  // POLLING TRIGGERS — /zapier/v1/trigger/poll/:event
  // Zapier polls these on a schedule; returns array of new events since last poll
  app.get('/zapier/v1/trigger/poll/:event', auth, async (req, res) => {
    const event = req.params.event;
    const apiKey = req.apiKey;
    const cursorKey = `${apiKey}:${event}`;
    const lastPoll = pollCursors.get(cursorKey) || new Date(0).toISOString();
    const now = new Date().toISOString();

    // Update cursor immediately (Zapier deduplicates by 'id' field)
    pollCursors.set(cursorKey, now);

    try {
      switch (event) {
        case 'credit_low': {
          const threshold = parseInt(req.query.threshold) || 100;
          const acct = req.acct;
          const balance = acct.balance || 0;
          if (balance < threshold) {
            return res.json([{
              id: `credit_low_${acct.id}_${Date.now()}`,
              balance,
              threshold,
              tier: acct.tier,
              triggered_at: now,
            }]);
          }
          return res.json([]);
        }

        case 'memory_change': {
          // Poll for new memory entries since last poll
          const namespace = req.query.namespace || 'default';
          const memHandler = allHandlers['memory-list'] || allHandlers['memory-search'];
          if (!memHandler) return res.json([]);

          const memResult = await memHandler({ namespace, limit: 50 });
          const entries = memResult.entries || memResult.results || [];

          // Filter entries created/updated after lastPoll
          const newEntries = entries.filter(e => {
            const ts = e.updated_at || e.created_at || e.ts || '';
            return ts > lastPoll;
          });

          return res.json(newEntries.map(e => ({
            id: `mem_${namespace}_${e.key || e.id || crypto.randomUUID()}`,
            key: e.key,
            value: typeof e.value === 'object' ? JSON.stringify(e.value) : String(e.value || ''),
            namespace,
            created_at: e.updated_at || e.created_at || now,
          })));
        }

        case 'dream_insight': {
          // Poll for new dream insights stored in memory namespace 'dreams'
          const topicFilter = (req.query.topic || '').toLowerCase();
          const memSearch = allHandlers['memory-search'];
          if (!memSearch) return res.json([]);

          const searchResult = await memSearch({
            query: topicFilter || 'dream insight',
            namespace: 'dreams',
            limit: 20,
          });
          const results = searchResult.results || [];

          const newInsights = results.filter(r => {
            const ts = r.updated_at || r.created_at || r.ts || '';
            return ts > lastPoll;
          });

          return res.json(newInsights.map(r => ({
            id: `dream_${r.key || r.id || crypto.randomUUID()}`,
            topic: r.key || topicFilter || 'unknown',
            insight: typeof r.value === 'string' ? r.value : JSON.stringify(r.value || ''),
            created_at: r.updated_at || r.created_at || now,
          })));
        }

        default:
          return res.status(404).json({ error: `Unknown trigger event: ${event}` });
      }
    } catch (e) {
      res.status(500).json({ error: e.message || String(e), event });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY ROUTES — /zapier/* (non-versioned, kept for backwards compatibility)
  // ═══════════════════════════════════════════════════════════════════════════

  // Legacy: list all actions (unauth, no pagination — for backwards compat)
  app.get('/zapier/actions', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(req.query.per_page) || 0));
    const category = req.query.category || '';
    const search = (req.query.q || '').toLowerCase();

    let entries = Object.entries(API_DEFS);

    if (category) {
      entries = entries.filter(([, def]) => {
        const cat = def.cat || def.category || '';
        return cat.toLowerCase() === category.toLowerCase();
      });
    }
    if (search) {
      entries = entries.filter(([slug, def]) =>
        slug.includes(search) ||
        (def.name || '').toLowerCase().includes(search)
      );
    }

    // If per_page provided, paginate; otherwise return all (legacy behaviour)
    if (perPage > 0) {
      const total = entries.length;
      const totalPages = Math.ceil(total / perPage);
      const offset = (page - 1) * perPage;
      const pageEntries = entries.slice(offset, offset + perPage);
      return res.json({
        total,
        page,
        per_page: perPage,
        total_pages: totalPages,
        actions: pageEntries.map(([slug, def]) => ({
          slug,
          name: def.name,
          description: def.desc,
          category: def.cat || def.category,
          credits: def.credits,
          tier: def.tier,
        })),
      });
    }

    const actions = entries.map(([slug, def]) => ({
      slug,
      name: def.name,
      description: def.desc,
      category: def.cat || def.category,
      credits: def.credits,
      tier: def.tier,
    }));
    res.json({ total: actions.length, actions });
  });

  // Legacy: Zapier-friendly API call wrapper
  // Accepts flat key-value input, returns flat output
  app.post('/zapier/call/:slug', auth, async (req, res) => {
    const slug = req.params.slug;
    const def = API_DEFS[slug];
    if (!def) return res.status(404).json({ error: `Unknown API: ${slug}` });

    const handler = allHandlers[slug];
    if (!handler) return res.status(501).json({ error: `No handler for: ${slug}` });

    const acct = req.acct;
    if (acct.balance < (def.credits || 1)) {
      return res.status(402).json({ error: `Insufficient credits. Need ${def.credits}, have ${acct.balance}.` });
    }

    acct.balance -= def.credits || 1;

    // Build input: try to parse 'data' field as JSON, merge with flat fields
    let input = {};
    if (req.body && req.body.data) {
      try {
        input = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
      } catch (_) {
        input.data = req.body.data;
      }
    }
    // Merge flat fields (everything except 'data')
    for (const [k, v] of Object.entries(req.body || {})) {
      if (k !== 'data' && v !== undefined && v !== '') input[k] = v;
    }

    try {
      const result = await handler(input);

      // Ensure result is always an object for flattening
      const resultObj = (result !== null && typeof result === 'object' && !Array.isArray(result))
        ? result
        : { result };

      const flat = flatten(resultObj);
      flat.credits_used = def.credits || 1;
      flat.credits_remaining = acct.balance;
      flat.api = slug;

      // Fire REST hook webhooks
      fireWebhooks('api_call_complete', { api: slug, result: flat }).catch(() => {});

      res.json(flat);
    } catch (e) {
      res.status(500).json({ error: e.message || String(e), api: slug });
    }
  });

  // Webhook receiver: Zapier sends data TO Slopshop for processing
  app.post('/zapier/webhook', auth, async (req, res) => {
    const { api, input } = req.body || {};
    if (!api) return res.status(400).json({ error: 'Provide "api" field with the API slug to call' });

    const def = API_DEFS[api];
    if (!def) return res.status(404).json({ error: `Unknown API: ${api}` });

    const handler = allHandlers[api];
    if (!handler) return res.status(501).json({ error: `No handler: ${api}` });

    const acct = req.acct;
    if (acct.balance < (def.credits || 1)) {
      return res.status(402).json({ error: 'Insufficient credits' });
    }

    acct.balance -= def.credits || 1;

    try {
      const result = await handler(input || req.body);

      // Ensure result is always an object for flattening
      const resultObj = (result !== null && typeof result === 'object' && !Array.isArray(result))
        ? result
        : { result };

      res.json({
        status: 'processed',
        api,
        result: resultObj,
        credits_used: def.credits || 1,
        balance: acct.balance,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e), api });
    }
  });

  // Webhook subscription management (REST hook subscribe/unsubscribe)
  app.post('/zapier/subscribe', auth, (req, res) => {
    const { hookUrl, event, filter } = req.body || {};
    if (!hookUrl) return res.status(400).json({ error: 'Provide hookUrl' });
    const id = crypto.randomUUID();
    webhookSubs.set(id, {
      url: hookUrl,
      event: event || 'api_call_complete',
      filter: filter || null,
      key: req.apiKey,
      created: new Date().toISOString(),
    });
    res.status(201).json({ id, status: 'subscribed', event: event || 'api_call_complete' });
  });

  app.delete('/zapier/subscribe/:id', auth, (req, res) => {
    if (!webhookSubs.has(req.params.id)) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    webhookSubs.delete(req.params.id);
    res.json({ status: 'unsubscribed', id: req.params.id });
  });

  // List active webhook subscriptions for this key
  app.get('/zapier/subscribe', auth, (req, res) => {
    const subs = [...webhookSubs.entries()]
      .filter(([, s]) => s.key === req.apiKey)
      .map(([id, s]) => ({ id, event: s.event, url: s.url, filter: s.filter, created: s.created }));
    res.json({ subscriptions: subs, total: subs.length });
  });

  console.log('  Zapier:   /zapier/app.json | /zapier/auth/test | /zapier/v1/{triggers,actions,execute,fields,output} | /zapier/call/:slug | /zapier/webhook | /zapier/subscribe');

  // Expose fireWebhooks so server-v2 can call it when memory/dream events occur
  return { fireWebhooks };
};
