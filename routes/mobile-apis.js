'use strict';
/**
 * Mobile App APIs — endpoints called exclusively by the REM Labs iOS/Android app.
 *
 * Endpoints:
 *   POST /v1/brief/feedback                    — rate today's brief
 *   GET  /v1/patterns                          — suggested automation patterns from procedural_skills
 *   GET  /v1/memory/dream/sessions             — alias for /v1/memory/dream/log
 *   GET  /v1/automations                       — list user automations
 *   POST /v1/automations/preview               — LLM-preview a natural-language automation
 *   POST /v1/automations                       — create automation (LLM-parsed)
 *   POST /v1/automations/:id                   — update automation
 *   POST /v1/automations/:id/delete            — delete automation
 *   GET  /v1/scout/topics                      — list scout topics
 *   POST /v1/scout/add                         — add scout topic
 *   POST /v1/scout/remove                      — remove scout topic
 *   GET  /v1/integrations/status               — aggregate integration status for all providers
 *   POST /v1/integrations/:service/disconnect  — revoke integration token
 *   GET  /v1/subscription                      — current plan + usage stats
 *   POST /v1/subscription/checkout             — Stripe checkout or simple upgrade
 *
 * Usage: require('./routes/mobile-apis')(app, db, apiKeys, allHandlers, auth, hashApiKey)
 */

const crypto = require('crypto');

module.exports = function mountMobileAPIs(app, db, apiKeys, allHandlers, auth, hashApiKey) {

  // ── Schema bootstrap ────────────────────────────────────────────────────────

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS automations (
        id         TEXT PRIMARY KEY,
        api_key    TEXT NOT NULL,
        title      TEXT,
        description TEXT,
        trigger    TEXT,
        action     TEXT,
        enabled    INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_automations_key ON automations(api_key, created_at DESC);
    `);
  } catch (_) {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS scout_topics (
        id         TEXT PRIMARY KEY,
        api_key    TEXT NOT NULL,
        topic      TEXT NOT NULL,
        source     TEXT DEFAULT 'manual',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scout_key ON scout_topics(api_key);
    `);
  } catch (_) {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS brief_feedback (
        id         TEXT PRIMARY KEY,
        api_key    TEXT NOT NULL,
        brief_id   TEXT,
        rating     INTEGER,
        created_at INTEGER NOT NULL
      );
    `);
  } catch (_) {}

  // ── Auth helper ─────────────────────────────────────────────────────────────

  function requireAuth(req, res) {
    const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!key || !apiKeys.has(key)) {
      res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
      return null;
    }
    return key;
  }

  // ── LLM helper — parses NL description into { title, trigger, action } ─────

  async function parseAutomationWithLLM(description) {
    const llmHandler = allHandlers && allHandlers['llm-think'];
    if (!llmHandler) {
      // Fallback: simple heuristic split on " → " or "when ... then ..."
      const arrow = description.match(/^(.+?)\s*(?:→|->|>)\s*(.+)$/i);
      if (arrow) {
        return { title: arrow[1].trim().slice(0, 80), trigger: arrow[1].trim(), action: arrow[2].trim() };
      }
      const whenThen = description.match(/when\s+(.+?)[,;]\s+(?:then\s+)?(.+)/i);
      if (whenThen) {
        return { title: whenThen[1].trim().slice(0, 80), trigger: whenThen[1].trim(), action: whenThen[2].trim() };
      }
      return { title: description.slice(0, 80), trigger: '', action: description };
    }

    const systemPrompt = `You are an automation rule parser. Extract a structured automation rule from the user's natural language description.
Return ONLY valid JSON with these fields:
- title: short human-readable name (max 80 chars)
- trigger: the condition or event that starts this automation (what to watch for)
- action: what should happen when the trigger fires (what REM does)

Keep trigger and action concise (under 120 chars each). Do not add commentary.`;

    try {
      const result = await llmHandler({
        text: description,
        system_prompt: systemPrompt,
        max_tokens: 300,
      });
      const raw = typeof result === 'string' ? result : (result.text || result.output || result.result || JSON.stringify(result));
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title:   (parsed.title   || description.slice(0, 80)).slice(0, 80),
          trigger: (parsed.trigger || '').slice(0, 120),
          action:  (parsed.action  || description).slice(0, 120),
        };
      }
    } catch (_) {}

    // Final fallback
    return { title: description.slice(0, 80), trigger: '', action: description.slice(0, 120) };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /v1/brief/feedback
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/v1/brief/feedback', auth, (req, res) => {
    const key = req.apiKey;
    const { brief_id, rating } = req.body || {};
    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_rating', message: 'Rating must be 1–5' } });
    }
    try {
      db.prepare('INSERT INTO brief_feedback (id, api_key, brief_id, rating, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), key, brief_id || null, ratingNum, Date.now());
    } catch (_) {}
    res.json({ ok: true });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /v1/patterns  — automation pattern suggestions from procedural_skills
  // ─────────────────────────────────────────────────────────────────────────────
  app.get('/v1/patterns', auth, (req, res) => {
    const key   = req.apiKey;
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
    let rows = [];
    try {
      rows = db.prepare(
        'SELECT id, trigger_condition, action_description, confidence, created FROM procedural_skills WHERE namespace = ? ORDER BY confidence DESC, created DESC LIMIT ?'
      ).all(key, limit);
    } catch (_) {}

    const patterns = rows.map(r => ({
      id:          r.id,
      title:       (r.trigger_condition || '').slice(0, 80) || 'Pattern',
      trigger:     r.trigger_condition  || '',
      action:      r.action_description || '',
      confidence:  r.confidence || 0.7,
      created_at:  r.created ? new Date(r.created).toISOString() : null,
    }));

    // If no patterns yet, return a few helpful examples
    if (patterns.length === 0) {
      return res.json({
        patterns: [
          { id: 'example-1', title: 'Flag urgent emails',       trigger: 'When I receive an email marked urgent', action: 'Save it to memory and add to my daily brief', confidence: 0.9 },
          { id: 'example-2', title: 'Capture meeting notes',    trigger: 'When I add a calendar event',           action: 'Create a memory entry for preparation notes', confidence: 0.85 },
          { id: 'example-3', title: 'Daily memory snapshot',    trigger: 'Every evening at 9 PM',                 action: 'Run a Dream session on today\'s activity',    confidence: 0.8 },
        ],
      });
    }

    res.json({ patterns });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /v1/memory/dream/sessions  — alias for /v1/memory/dream/log
  // ─────────────────────────────────────────────────────────────────────────────
  app.get('/v1/memory/dream/sessions', auth, (req, res) => {
    const key   = req.apiKey;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    let rows = [];
    try {
      rows = db.prepare(
        'SELECT id, namespace, strategy, status, model, keys_sampled, memories_created, started_at, completed_at, duration_ms, error, result FROM dream_sessions WHERE api_key = ? ORDER BY started_at DESC LIMIT ?'
      ).all(key, limit);
    } catch (_) {}

    const sessions = rows.map(r => {
      let title = r.namespace || 'Dream Session';
      try {
        const parsed = r.result ? JSON.parse(r.result) : null;
        if (parsed && parsed.title) title = parsed.title;
        else if (parsed && parsed.summary) title = parsed.summary.slice(0, 60);
      } catch (_) {}
      return {
        id:          r.id,
        status:      r.status || 'complete',
        topic:       r.namespace || 'default',
        depth:       r.strategy || 'standard',
        title,
        created_at:  r.started_at ? new Date(r.started_at).toISOString() : null,
      };
    });

    res.json({ sessions });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /v1/automations
  // ─────────────────────────────────────────────────────────────────────────────
  app.get('/v1/automations', auth, (req, res) => {
    const key = req.apiKey;
    let rows = [];
    try {
      rows = db.prepare('SELECT * FROM automations WHERE api_key = ? ORDER BY created_at DESC').all(key);
    } catch (_) {}

    const automations = rows.map(r => ({
      id:          r.id,
      title:       r.title || r.description || 'Automation',
      description: r.description || '',
      trigger:     r.trigger || '',
      action:      r.action  || '',
      enabled:     r.enabled !== 0,
      created_at:  r.created_at ? new Date(r.created_at).toISOString() : null,
    }));

    res.json({ automations });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /v1/automations/preview  (must be registered BEFORE /:id)
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/v1/automations/preview', auth, async (req, res) => {
    const { description } = req.body || {};
    if (!description || description.trim().length < 5) {
      return res.status(400).json({ ok: false, error: { code: 'missing_description' } });
    }
    try {
      const parsed = await parseAutomationWithLLM(description.trim());
      res.json({ ok: true, preview: parsed });
    } catch (err) {
      res.json({ ok: false, preview: { title: description.slice(0, 80), trigger: '', action: '' } });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /v1/automations  — create
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/v1/automations', auth, async (req, res) => {
    const key = req.apiKey;
    const { description } = req.body || {};
    if (!description || description.trim().length < 3) {
      return res.status(400).json({ ok: false, error: { code: 'missing_description', message: 'Provide a description.' } });
    }

    // Cap automations per user at 50
    try {
      const count = db.prepare('SELECT COUNT(*) as c FROM automations WHERE api_key = ?').get(key);
      if (count && count.c >= 50) {
        return res.status(429).json({ ok: false, error: { code: 'limit_reached', message: 'Max 50 automations. Delete one first.' } });
      }
    } catch (_) {}

    const parsed = await parseAutomationWithLLM(description.trim());
    const id = crypto.randomUUID();
    const now = Date.now();

    try {
      db.prepare('INSERT INTO automations (id, api_key, title, description, trigger, action, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
        .run(id, key, parsed.title, description.trim(), parsed.trigger, parsed.action, now);
    } catch (err) {
      return res.status(500).json({ ok: false, error: { code: 'db_error', message: 'Could not save automation.' } });
    }

    res.status(201).json({
      ok: true,
      automation: {
        id,
        title:       parsed.title,
        description: description.trim(),
        trigger:     parsed.trigger,
        action:      parsed.action,
        enabled:     true,
        created_at:  new Date(now).toISOString(),
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /v1/automations/:id/delete
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/v1/automations/:id/delete', auth, (req, res) => {
    const key = req.apiKey;
    const { id } = req.params;
    try {
      const row = db.prepare('SELECT id FROM automations WHERE id = ? AND api_key = ?').get(id, key);
      if (!row) return res.status(404).json({ ok: false, error: { code: 'not_found' } });
      db.prepare('DELETE FROM automations WHERE id = ? AND api_key = ?').run(id, key);
      res.json({ ok: true, deleted: id });
    } catch (err) {
      res.status(500).json({ ok: false, error: { code: 'db_error' } });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /v1/automations/:id  — update (enabled, title, etc.)
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/v1/automations/:id', auth, (req, res) => {
    const key = req.apiKey;
    const { id } = req.params;
    const { enabled, title, trigger, action } = req.body || {};

    try {
      const row = db.prepare('SELECT * FROM automations WHERE id = ? AND api_key = ?').get(id, key);
      if (!row) return res.status(404).json({ ok: false, error: { code: 'not_found' } });

      const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : row.enabled;
      const newTitle   = title   !== undefined ? title.slice(0, 80)   : row.title;
      const newTrigger = trigger !== undefined ? trigger.slice(0, 120) : row.trigger;
      const newAction  = action  !== undefined ? action.slice(0, 120)  : row.action;

      db.prepare('UPDATE automations SET enabled = ?, title = ?, trigger = ?, action = ? WHERE id = ? AND api_key = ?')
        .run(newEnabled, newTitle, newTrigger, newAction, id, key);

      res.json({
        ok: true,
        automation: {
          id,
          title:       newTitle,
          description: row.description || '',
          trigger:     newTrigger,
          action:      newAction,
          enabled:     newEnabled !== 0,
          created_at:  row.created_at ? new Date(row.created_at).toISOString() : null,
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: { code: 'db_error' } });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /v1/scout/topics
  // ─────────────────────────────────────────────────────────────────────────────
  app.get('/v1/scout/topics', auth, (req, res) => {
    const key = req.apiKey;
    let rows = [];
    try {
      rows = db.prepare('SELECT id, topic, source, created_at FROM scout_topics WHERE api_key = ? ORDER BY created_at DESC').all(key);
    } catch (_) {}
    res.json({ topics: rows.map(r => ({ id: r.id, topic: r.topic, source: r.source || 'manual' })) });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /v1/scout/add
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/v1/scout/add', auth, (req, res) => {
    const key = req.apiKey;
    const { topic } = req.body || {};
    if (!topic || !topic.trim()) {
      return res.status(400).json({ ok: false, error: { code: 'missing_topic' } });
    }
    const topicStr = topic.trim().slice(0, 200);
    try {
      // Prevent duplicates for this key
      const exists = db.prepare('SELECT id FROM scout_topics WHERE api_key = ? AND topic = ?').get(key, topicStr);
      if (exists) return res.json({ ok: true, id: exists.id, duplicate: true });

      const count = db.prepare('SELECT COUNT(*) as c FROM scout_topics WHERE api_key = ?').get(key);
      if (count && count.c >= 100) {
        return res.status(429).json({ ok: false, error: { code: 'limit_reached', message: 'Max 100 scout topics.' } });
      }

      const id = crypto.randomUUID();
      db.prepare('INSERT INTO scout_topics (id, api_key, topic, source, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, key, topicStr, 'manual', Date.now());
      res.status(201).json({ ok: true, id, topic: topicStr });
    } catch (err) {
      res.status(500).json({ ok: false, error: { code: 'db_error' } });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /v1/scout/remove
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/v1/scout/remove', auth, (req, res) => {
    const key = req.apiKey;
    const { topic } = req.body || {};
    if (!topic) return res.status(400).json({ ok: false, error: { code: 'missing_topic' } });
    try {
      db.prepare('DELETE FROM scout_topics WHERE api_key = ? AND topic = ?').run(key, topic.trim());
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: { code: 'db_error' } });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /v1/integrations/status  — aggregate all providers for current user
  // ─────────────────────────────────────────────────────────────────────────────
  app.get('/v1/integrations/status', auth, (req, res) => {
    const key = req.apiKey;
    let rows = [];
    try {
      rows = db.prepare(
        'SELECT provider, email, updated_at FROM integration_tokens WHERE api_key = ?'
      ).all(key);
    } catch (_) {}

    const statusMap = {};
    for (const r of rows) {
      statusMap[r.provider] = {
        service:    r.provider,
        connected:  true,
        email:      r.email || undefined,
        last_sync:  r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
      };
    }

    // Return list; all unconnected services are omitted (client treats absence as disconnected)
    const statuses = Object.values(statusMap);
    res.json({ ok: true, statuses });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /v1/integrations/:service/disconnect
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/v1/integrations/:service/disconnect', auth, (req, res) => {
    const key     = req.apiKey;
    const service = req.params.service;
    try {
      db.prepare('DELETE FROM integration_tokens WHERE api_key = ? AND provider = ?').run(key, service);
    } catch (_) {}
    res.json({ ok: true, disconnected: service });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /v1/subscription  — current plan + usage stats
  // ─────────────────────────────────────────────────────────────────────────────
  app.get('/v1/subscription', auth, (req, res) => {
    const key  = req.apiKey;
    const acct = apiKeys.get(key);
    const tier = (acct && acct.tier) || 'free';

    let memoriesUsed = 0;
    let asksUsed = 0;
    try {
      const mRow = db.prepare('SELECT COUNT(*) as c FROM memory WHERE api_key = ?').get(key);
      memoriesUsed = (mRow && mRow.c) || 0;
    } catch (_) {}
    try {
      const aRow = db.prepare("SELECT COUNT(*) as c FROM dream_sessions WHERE api_key = ? AND started_at > ?").get(key, Date.now() - 30 * 86400000);
      asksUsed = (aRow && aRow.c) || 0;
    } catch (_) {}

    const limits = {
      free:  { memories: 1000,  asks: 20  },
      pro:   { memories: 50000, asks: 500 },
      team:  { memories: -1,    asks: -1  }, // unlimited
    };
    const planLimits = limits[tier] || limits.free;

    res.json({
      plan:            tier === 'free' ? 'free' : tier,
      status:          'active',
      memories_used:   memoriesUsed,
      memories_limit:  planLimits.memories,
      asks_used:       asksUsed,
      asks_limit:      planLimits.asks,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /v1/subscription/checkout  — Stripe or simple plan upgrade
  // ─────────────────────────────────────────────────────────────────────────────
  app.post('/v1/subscription/checkout', auth, (req, res) => {
    const { plan } = req.body || {};
    const validPlans = ['pro', 'team'];
    if (!plan || !validPlans.includes(plan)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_plan', message: 'Plan must be pro or team.' } });
    }

    // If Stripe is configured, return a checkout URL via billing.js pattern
    // Otherwise return the pricing page so the user can upgrade via web
    const baseUrl = process.env.CONSUMER_URL || 'https://remlabs.ai';
    const checkoutUrl = `${baseUrl}/pricing?plan=${plan}&source=mobile`;

    res.json({ ok: true, checkout_url: checkoutUrl, plan });
  });

  console.log('  📱 Mobile APIs: brief/feedback, patterns, dream/sessions, automations, scout, integrations/status, subscription');
};
