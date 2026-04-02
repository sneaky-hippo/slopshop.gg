'use strict';

/**
 * Dream Layer — Memory Content Types, Insight Separation, CLI Auth, File Upload
 *
 * The core idea: raw memories are your "core layer" — untouched.
 * Dream-generated insights form a separate "dream layer" layered on top.
 * Content can be anything: text, poem, lyrics, business plan, research, code, Notion page.
 * The CLI can auth via device code flow and upload content from any terminal.
 *
 * New endpoints:
 *   GET  /v1/memory/insights              — list dream insight layer (separate from core)
 *   POST /v1/memory/promote               — promote insight → core layer
 *   POST /v1/memory/upload                — upload any content type as memory
 *   GET  /v1/memory/dream/full-summary/:sid — combined core + insight summary for a dream
 *   GET  /v1/integrations                 — list connected integrations
 *   POST /v1/integrations/notion/sync     — sync Notion pages to memory namespace
 *   POST /v1/auth/cli/request             — device code flow: start
 *   POST /v1/auth/cli/token               — device code flow: poll (no auth needed)
 *   POST /v1/auth/cli/approve             — device code flow: approve from web
 *   GET  /v1/auth/cli/status/:device_code — check device code status
 */

const crypto = require('crypto');

module.exports = function mountDreamLayer(app, db, apiKeys, allHandlers) {
  // allHandlers may be undefined during tests — fall back to raw DB in that case
  const memSearch  = () => allHandlers && allHandlers['memory-search'];
  const memList    = () => allHandlers && allHandlers['memory-list'];
  const memGet     = () => allHandlers && allHandlers['memory-get'];
  const memSet     = () => allHandlers && allHandlers['memory-set'];
  const memDelete  = () => allHandlers && allHandlers['memory-delete'];
  const memBulkSet = () => allHandlers && allHandlers['memory-bulk-set'];

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function requireAuth(req, res) {
    const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!key || !apiKeys.has(key)) {
      res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
      return null;
    }
    return key;
  }

  function nsPrefix(key) {
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

  function scoped(key, ns) {
    return nsPrefix(key) + ':' + (ns || 'default');
  }

  // ── Schema migrations ─────────────────────────────────────────────────────────
  // All ALTER TABLE uses try/catch so they're safe on existing installs.

  const memCols = db.pragma('table_info(memory)').map(c => c.name);
  if (!memCols.includes('content_type'))    try { db.exec(`ALTER TABLE memory ADD COLUMN content_type TEXT DEFAULT 'text'`); } catch(_) {}
  if (!memCols.includes('memory_type'))     try { db.exec(`ALTER TABLE memory ADD COLUMN memory_type TEXT DEFAULT 'core'`); } catch(_) {}
  if (!memCols.includes('source_type'))     try { db.exec(`ALTER TABLE memory ADD COLUMN source_type TEXT DEFAULT 'manual'`); } catch(_) {}
  if (!memCols.includes('source_url'))      try { db.exec(`ALTER TABLE memory ADD COLUMN source_url TEXT`); } catch(_) {}
  if (!memCols.includes('dream_session_id')) try { db.exec(`ALTER TABLE memory ADD COLUMN dream_session_id TEXT`); } catch(_) {}

  // Indexes for fast insight queries
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_mem_type ON memory(namespace, memory_type)`); } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_mem_content_type ON memory(namespace, content_type)`); } catch(_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_mem_dream_session ON memory(dream_session_id)`); } catch(_) {}

  // CLI auth requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cli_auth_requests (
      device_code TEXT PRIMARY KEY,
      user_code   TEXT NOT NULL UNIQUE,
      api_key     TEXT,
      created     INTEGER NOT NULL,
      expires     INTEGER NOT NULL,
      approved    INTEGER NOT NULL DEFAULT 0,
      ip          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cli_user_code ON cli_auth_requests(user_code);
  `);

  // Integration tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_tokens (
      id          TEXT PRIMARY KEY,
      api_key_hash TEXT NOT NULL,
      provider    TEXT NOT NULL,
      access_token TEXT NOT NULL,
      workspace_name TEXT,
      workspace_id TEXT,
      scopes      TEXT,
      created     INTEGER NOT NULL,
      expires     INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_integration_key ON integration_tokens(api_key_hash, provider);
  `);

  // Cleanup stale CLI requests every 10 minutes
  setInterval(() => {
    try { db.prepare('DELETE FROM cli_auth_requests WHERE expires < ?').run(Date.now()); } catch(_) {}
  }, 600000);


  // ════════════════════════════════════════════════════════════════════════════════
  // DREAM INSIGHTS LAYER
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/memory/insights
   * List dream-layer insights.
   *
   * The dream engine writes to <namespace>:dreams sub-namespace, so that's
   * the canonical insight layer. We also check for memory_type='dream_insight'
   * as a fallback for manually tagged insights.
   */
  app.get('/v1/memory/insights', (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const ns = req.query.namespace || 'default';
    const scopedNs = scoped(key, ns);
    // Dream engine writes insights to <namespace>:dreams
    const dreamsNs = scopedNs + ':dreams';
    const dreamSessionId = req.query.dream_session_id || null;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    try {
      // Query the :dreams sub-namespace via memory-search handler (handles decompression + scoring)
      const searchFn = memSearch();
      const listFn   = memList();

      let dreamRows = [];
      if (searchFn) {
        // Empty query = list all entries in :dreams namespace (no scoring filter)
        // If session filter, narrow by session prefix in query
        const query = dreamSessionId ? dreamSessionId.slice(0, 8) : '';
        const sr = searchFn({ namespace: dreamsNs, query, limit });
        dreamRows = (sr.results || []).map(r => ({
          key: r.key,
          value: typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value || ''),
          tags: Array.isArray(r.tags) ? JSON.stringify(r.tags) : (r.tags || '[]'),
          content_type: r.content_type || 'text',
          memory_type: r.memory_type || 'dream_insight',
          source_type: r.source_type || 'dream',
          dream_session_id: r.dream_session_id || null,
          created: r.created || Date.now(), updated: r.updated || Date.now(),
          _from_handler: true
        }));
      } else {
        dreamRows = dreamSessionId
          ? db.prepare(`SELECT key,value,tags,content_type,memory_type,source_type,dream_session_id,created,updated FROM memory WHERE namespace=? AND (dream_session_id=? OR key LIKE ?) ORDER BY created DESC LIMIT ?`).all(dreamsNs, dreamSessionId, '%'+dreamSessionId.slice(0,8)+'%', limit)
          : db.prepare(`SELECT key,value,tags,content_type,memory_type,source_type,dream_session_id,created,updated FROM memory WHERE namespace=? ORDER BY created DESC LIMIT ?`).all(dreamsNs, limit);
      }

      // Also check for manually-tagged insights in the core namespace via search
      let taggedRows = [];
      if (searchFn) {
        const tr = searchFn({ namespace: scopedNs, query: 'dream insight synthesis', limit: Math.floor(limit / 2) });
        taggedRows = (tr.results || [])
          .filter(r => r.memory_type === 'dream_insight')
          .map(r => ({
            key: r.key,
            value: typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value || ''),
            tags: Array.isArray(r.tags) ? JSON.stringify(r.tags) : (r.tags || '[]'),
            content_type: r.content_type || 'text', _from_handler: true
          }));
      } else {
        taggedRows = db.prepare(`SELECT key,value,tags,content_type,memory_type,source_type,dream_session_id,created,updated FROM memory WHERE namespace=? AND memory_type='dream_insight' ORDER BY created DESC LIMIT ?`).all(scopedNs, Math.floor(limit / 2));
      }

      const seen = new Set();
      const allRows = [...dreamRows, ...taggedRows].filter(r => {
        if (seen.has(r.key)) return false;
        seen.add(r.key); return true;
      });

      const insights = allRows.map(r => {
        let val = r.value || '';
        // Only decompress raw DB rows — handler rows are already decompressed
        if (!r._from_handler) {
          if (typeof val === 'string' && val.startsWith('~z~')) {
            try { val = require('zlib').inflateRawSync(Buffer.from(val.slice(3), 'base64')).toString('utf8'); } catch(_) {}
          }
        }
        // Unwrap JSON envelope if present
        if (typeof val === 'string') {
          try { const parsed = JSON.parse(val); val = parsed.value || parsed.insight || parsed.summary || val; } catch(_) {}
        }
        return {
          key: r.key, value: val,
          tags: (() => { try { return Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags); } catch(_) { return []; } })(),
          content_type: r.content_type || 'text',
          source_type: r.source_type || 'dream',
          dream_session_id: r.dream_session_id,
          created: r.created, updated: r.updated
        };
      });

      res.json({ ok: true, insights, count: insights.length, namespace: ns, insights_namespace: dreamsNs });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }
  });

  /**
   * POST /v1/memory/promote
   * Promote a dream insight to core memory.
   * Copies from <namespace>:dreams into <namespace>, marks as promoted.
   * Body: { namespace, key, keep_original? }
   */
  app.post('/v1/memory/promote', (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const { namespace = 'default', key: memKey, keep_original = false } = req.body || {};
    if (!memKey) return res.status(400).json({ ok: false, error: { code: 'missing_key', message: 'key is required' } });

    const scopedNs   = scoped(key, namespace);
    const dreamsNs   = scopedNs + ':dreams';
    const now        = Date.now();

    try {
      const getFn = memGet();
      const setFn = memSet();
      const delFn = memDelete();

      // Look in dreams namespace first via handler
      let existing = getFn ? getFn({ namespace: dreamsNs, key: memKey }) : null;
      let fromDreams = true;

      if (!existing || existing._engine === 'not_found' || existing.value === undefined) {
        // Fall back to core namespace
        existing = getFn ? getFn({ namespace: scopedNs, key: memKey }) : null;
        fromDreams = false;
      }

      if (!existing || existing._engine === 'not_found' || existing.value === undefined) {
        return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Memory key not found in insights or core namespace' } });
      }

      // Value is already decompressed by memory-get handler
      let value = existing.value;
      if (typeof value === 'object') value = JSON.stringify(value);
      if (typeof value === 'string') {
        try { const p = JSON.parse(value); value = p.value || p.insight || p.summary || value; } catch(_) {}
      }

      // Write to core namespace via memory-set handler
      if (setFn) {
        setFn({
          namespace: scopedNs, key: memKey, value,
          tags: Array.isArray(existing.tags) ? existing.tags : [],
          type: 'project'
        });
      } else {
        db.prepare(`INSERT OR REPLACE INTO memory (namespace,key,value,tags,content_type,memory_type,source_type,created,updated,ttl)
          VALUES (?,?,?,?,?,'core','promoted',?,?,0)`)
          .run(scopedNs, memKey, value, '[]', 'text', now, now);
      }

      // Remove from dreams namespace via memory-delete handler
      if (fromDreams && !keep_original) {
        if (delFn) { delFn({ namespace: dreamsNs, key: memKey }); }
        else { db.prepare('DELETE FROM memory WHERE namespace=? AND key=?').run(dreamsNs, memKey); }
      }

      res.json({ ok: true, promoted: { key: memKey, namespace, memory_type: 'core', promoted_at: now, from_dreams_ns: fromDreams } });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }
  });

  /**
   * GET /v1/memory/dream/full-summary/:session_id
   * Full combined summary: core memories + dream insights + session stats.
   * The "Dream Report" — shareable, self-contained.
   */
  app.get('/v1/memory/dream/full-summary/:session_id', (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const sessionId = req.params.session_id;
    const prefix = nsPrefix(key);

    try {
      // Get the dream session
      const session = db.prepare(`
        SELECT * FROM dream_sessions WHERE id = ? AND (api_key = ? OR api_key LIKE ?)
      `).get(sessionId, key, key.slice(0, 20) + '%');

      if (!session) return res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Dream session not found' } });

      const scopedNs = prefix + ':' + (session.namespace || 'default').replace(prefix + ':', '');

      // Dream engine writes to <namespace>:dreams sub-namespace
      const dreamsNs = scopedNs + ':dreams';

      // Get insights via memory-search handler on :dreams namespace
      const searchFn = memSearch();
      const listFn   = memList();
      const getFn    = memGet();

      let insightRows = [];
      if (searchFn) {
        const pfx = sessionId.slice(0, 8);
        const sr = searchFn({ namespace: dreamsNs, query: pfx + ' insights synthesis patterns', limit: 50 });
        insightRows = (sr.results || []).map(r => ({
          key: r.key,
          value: typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value || ''),
          tags: r.tags || [],
          content_type: r.content_type || 'text',
          _from_handler: true
        }));
        // Also check core namespace for promoted insights from this session
        const csr = searchFn({ namespace: scopedNs, query: pfx, limit: 20 });
        const coreInsights = (csr.results || []).filter(r => r.key && r.key.includes(pfx)).map(r => ({
          key: r.key,
          value: typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value || ''),
          tags: r.tags || [], content_type: r.content_type || 'text', _from_handler: true
        }));
        const seenKeys = new Set(insightRows.map(r => r.key));
        coreInsights.forEach(r => { if (!seenKeys.has(r.key)) insightRows.push(r); });
      } else {
        insightRows = db.prepare(`SELECT key,value,tags,content_type FROM memory WHERE (namespace=? OR namespace=?) AND (dream_session_id=? OR key LIKE ?) ORDER BY created ASC LIMIT 50`).all(dreamsNs, scopedNs, sessionId, '%dream%');
      }

      // Sample core memories via memory-search handler
      let coreMemRows = [];
      if (searchFn) {
        const cr = searchFn({ namespace: scopedNs, query: 'key concepts themes knowledge', limit: 10 });
        coreMemRows = (cr.results || []).filter(r => !r.key.includes(':dreams')).slice(0, 10).map(r => ({
          key: r.key,
          value: typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value || ''),
          content_type: r.content_type || 'text', _from_handler: true
        }));
      } else {
        coreMemRows = db.prepare(`SELECT key,value,content_type FROM memory WHERE namespace=? AND (memory_type='core' OR memory_type IS NULL) ORDER BY updated DESC LIMIT 10`).all(scopedNs);
      }

      // Get brain glow score for session context
      let brainScore = null;
      try {
        const bs = db.prepare(`SELECT score, rank FROM brain_glow_scores WHERE api_key_hash = ? ORDER BY computed_at DESC LIMIT 1`)
          .get(crypto.createHash('sha256').update(key).digest('hex'));
        if (bs) brainScore = { score: bs.score, rank: bs.rank };
      } catch(_) {}

      const summary = {
        ok: true,
        session_id: sessionId,
        session: {
          strategy: session.strategy,
          status: session.status,
          memories_created: session.memories_created,
          keys_sampled: session.keys_sampled,
          started_at: session.started_at,
          completed_at: session.completed_at
        },
        core_memories: coreMemRows.map(r => {
          let preview = r.value || '';
          if (!r._from_handler && typeof preview === 'string' && preview.startsWith('~z~')) {
            try { preview = require('zlib').inflateRawSync(Buffer.from(preview.slice(3), 'base64')).toString('utf8'); } catch(_) {}
          }
          return { key: r.key, preview: String(preview).slice(0, 200), content_type: r.content_type || 'text' };
        }),
        insights: insightRows.map(r => {
          let val = r.value || '';
          if (!r._from_handler && typeof val === 'string' && val.startsWith('~z~')) {
            try { val = require('zlib').inflateRawSync(Buffer.from(val.slice(3), 'base64')).toString('utf8'); } catch(_) {}
          }
          if (typeof val === 'string') {
            try { const p = JSON.parse(val); val = p.value || p.insight || p.summary || val; } catch(_) {}
          }
          return {
            key: r.key, value: val,
            tags: (() => { try { return Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags); } catch(_) { return []; } })(),
            content_type: r.content_type || 'text'
          };
        }),
        brain_score: brainScore,
        insight_count: insightRows.length,
        core_count: coreMemRows.length
      };

      res.json(summary);
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }
  });


  // ════════════════════════════════════════════════════════════════════════════════
  // CONTENT UPLOAD
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * POST /v1/memory/upload
   * Upload any content as a memory — text, poem, lyrics, code, research, document.
   * No file size limits for text. Binary files accepted as base64.
   *
   * Body: {
   *   content: string        — the content to store
   *   key?: string           — memory key (auto-generated if omitted)
   *   namespace?: string     — target namespace (default: 'default')
   *   content_type?: string  — 'text'|'poem'|'lyrics'|'code'|'research'|'document'|'business_idea'|'notion_page'
   *   tags?: string[]        — optional tags
   *   title?: string         — optional human-readable title (stored as tag)
   *   source_url?: string    — original URL (for web-sourced content)
   *   source_type?: string   — 'manual'|'cli'|'api'|'notion'|'file'
   *   ttl?: number           — optional TTL in seconds
   * }
   */
  app.post('/v1/memory/upload', (req, res) => {
    const apiKey = requireAuth(req, res);
    if (!apiKey) return;

    const {
      content, key: memKey, namespace = 'default',
      content_type = 'text', tags = [], title,
      source_url, source_type = 'api', ttl = 0
    } = req.body || {};

    if (!content) return res.status(400).json({ ok: false, error: { code: 'missing_content', message: 'content is required' } });
    // Strip lone surrogates so the content is always valid JSON when passed to LLM
    const cleanContent = content.replace(/[\uD800-\uDFFF]/g, '');

    const VALID_TYPES = ['text', 'poem', 'lyrics', 'code', 'research', 'document', 'business_idea',
                         'notion_page', 'markdown', 'json', 'csv', 'url', 'note'];
    const resolvedType = VALID_TYPES.includes(content_type) ? content_type : 'text';

    const scopedNs = scoped(apiKey, namespace);
    const now = Date.now();

    // Auto-generate key from title, content hash, or timestamp
    let resolvedKey = memKey;
    if (!resolvedKey) {
      if (title) {
        resolvedKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) + '_' + now.toString(36);
      } else {
        resolvedKey = resolvedType + '_' + crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
      }
    }

    // Build tags array
    const allTags = Array.isArray(tags) ? [...tags] : [];
    if (title && !allTags.includes(title)) allTags.push('title:' + title);
    if (resolvedType !== 'text') allTags.push('type:' + resolvedType);
    if (source_type !== 'manual') allTags.push('source:' + source_type);

    try {
      const setFn = memSet();
      if (setFn) {
        setFn({ namespace: scopedNs, key: resolvedKey, value: cleanContent, tags: allTags, ttl_seconds: ttl || undefined, type: 'project' });
      } else {
        db.prepare(`INSERT OR REPLACE INTO memory (namespace,key,value,tags,content_type,memory_type,source_type,source_url,created,updated,ttl) VALUES (?,?,?,?,?,'core',?,?,?,?,?)`)
          .run(scopedNs, resolvedKey, cleanContent, JSON.stringify(allTags), resolvedType, source_type, source_url || null, now, now, ttl);
      }

      res.json({
        ok: true,
        key: resolvedKey,
        namespace,
        content_type: resolvedType,
        source_type,
        size_bytes: Buffer.byteLength(cleanContent, 'utf8'),
        stored_at: now
      });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }
  });


  // ════════════════════════════════════════════════════════════════════════════════
  // INTEGRATIONS
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/integrations
   * List all connected integrations for this API key.
   */
  app.get('/v1/integrations', (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    try {
      const rows = db.prepare(`
        SELECT id, provider, workspace_name, workspace_id, scopes, created, expires
        FROM integration_tokens WHERE api_key_hash = ?
      `).all(keyHash);

      res.json({
        ok: true,
        integrations: rows.map(r => ({
          id: r.id, provider: r.provider,
          workspace: r.workspace_name || r.workspace_id,
          scopes: r.scopes ? r.scopes.split(',') : [],
          connected_at: r.created,
          expires: r.expires
        }))
      });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }
  });

  /**
   * POST /v1/integrations/notion/sync
   * Sync Notion pages/databases to a memory namespace.
   * Accepts a Notion integration token + list of page IDs.
   *
   * In production: calls Notion API to fetch page content, stores as memories.
   * Right now: validates input and provides clear instructions; stores pages if content provided.
   */
  app.post('/v1/integrations/notion/sync', async (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const {
      notion_token, page_ids = [], pages = [],
      namespace = 'default', dry_run = false
    } = req.body || {};

    if (!notion_token && !pages.length) {
      return res.status(400).json({
        ok: false,
        error: { code: 'missing_token', message: 'Provide notion_token + page_ids to sync, or pages array with {id, title, content} to batch import' },
        hint: {
          with_token: 'POST /v1/integrations/notion/sync { notion_token: "secret_...", page_ids: ["abc123"] }',
          batch_import: 'POST /v1/integrations/notion/sync { pages: [{id: "abc", title: "My Page", content: "..."}], namespace: "work" }'
        }
      });
    }

    const scopedNs = scoped(key, namespace);
    const now = Date.now();
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    // Batch import mode: pages array provided directly (no Notion API call needed)
    if (pages.length) {
      if (dry_run) {
        return res.json({ ok: true, dry_run: true, would_import: pages.length, namespace });
      }

      let imported = 0;
      const results = [];

      for (const page of pages) {
        if (!page.content && !page.title) continue;
        const memKey = 'notion_' + (page.id || crypto.createHash('sha256').update(page.title || page.content || '').digest('hex').slice(0, 12));
        const content = page.content || page.title || '';
        const tags = JSON.stringify(['source:notion', 'type:notion_page', ...(page.tags || [])]);

        try {
          const exists = db.prepare('SELECT key FROM memory WHERE namespace = ? AND key = ?').get(scopedNs, memKey);
          if (exists) {
            db.prepare(`UPDATE memory SET value = ?, tags = ?, content_type = 'notion_page', source_type = 'notion', source_url = ?, updated = ? WHERE namespace = ? AND key = ?`)
              .run(content, tags, page.url || null, now, scopedNs, memKey);
          } else {
            db.prepare(`INSERT INTO memory (namespace, key, value, tags, content_type, memory_type, source_type, source_url, created, updated, ttl) VALUES (?, ?, ?, ?, 'notion_page', 'core', 'notion', ?, ?, ?, 0)`)
              .run(scopedNs, memKey, content, tags, page.url || null, now, now);
          }
          results.push({ key: memKey, title: page.title, status: 'imported' });
          imported++;
        } catch(e) {
          results.push({ key: memKey, title: page.title, status: 'error', error: e.message });
        }
      }

      // Always register an integration record so GET /v1/integrations shows Notion connected
      try {
        const token = notion_token || 'batch_import';
        db.prepare(`
          INSERT OR REPLACE INTO integration_tokens
            (id, api_key_hash, provider, access_token, workspace_name, created)
          VALUES (?, ?, 'notion', ?, ?, ?)
        `).run(crypto.randomUUID(), keyHash, token, 'Notion (' + namespace + ')', now);
      } catch(_) {}

      return res.json({ ok: true, imported, namespace, results });
    }

    // Live Notion API sync (requires notion_token + page_ids)
    // Store token first
    try {
      db.prepare(`INSERT OR REPLACE INTO integration_tokens (id, api_key_hash, provider, access_token, created) VALUES (?, ?, 'notion', ?, ?)`)
        .run(crypto.randomUUID(), keyHash, notion_token, now);
    } catch(_) {}

    // Fetch pages from Notion API
    const imported = [];
    const errors = [];

    for (const pageId of (Array.isArray(page_ids) ? page_ids : [page_ids])) {
      try {
        const https = require('https');
        const pageData = await new Promise((resolve, reject) => {
          const options = {
            hostname: 'api.notion.com', path: '/v1/pages/' + pageId, method: 'GET',
            headers: { 'Authorization': 'Bearer ' + notion_token, 'Notion-Version': '2022-06-28' }
          };
          const req2 = https.request(options, (r) => {
            let data = '';
            r.on('data', c => data += c);
            r.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
          });
          req2.on('error', reject);
          req2.setTimeout(10000, () => { req2.destroy(); reject(new Error('timeout')); });
          req2.end();
        });

        if (pageData.object === 'error') {
          errors.push({ page_id: pageId, error: pageData.message });
          continue;
        }

        // Extract title from Notion page properties
        const titleProp = Object.values(pageData.properties || {}).find(p => p.type === 'title');
        const title = titleProp?.title?.map(t => t.plain_text).join('') || pageId;
        const url = pageData.url || null;

        if (!dry_run) {
          const memKey = 'notion_' + pageId.replace(/-/g, '').slice(0, 16);
          const content = title; // In full impl: would also fetch page blocks
          db.prepare(`INSERT OR REPLACE INTO memory (namespace, key, value, tags, content_type, memory_type, source_type, source_url, created, updated, ttl)
            VALUES (?, ?, ?, ?, 'notion_page', 'core', 'notion', ?, ?, ?, 0)`)
            .run(scopedNs, memKey, content, JSON.stringify(['source:notion', 'notion_page_id:' + pageId]), url, now, now);
        }

        imported.push({ page_id: pageId, title, url, status: dry_run ? 'would_import' : 'imported' });
      } catch(e) {
        errors.push({ page_id: pageId, error: e.message });
      }
    }

    res.json({ ok: true, dry_run, namespace, imported: imported.length, pages: imported, errors });
  });

  /**
   * DELETE /v1/integrations/:provider
   * Disconnect an integration.
   */
  app.delete('/v1/integrations/:provider', (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const { provider } = req.params;

    try {
      db.prepare('DELETE FROM integration_tokens WHERE api_key_hash = ? AND provider = ?').run(keyHash, provider);
      res.json({ ok: true, disconnected: provider });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }
  });


  // ════════════════════════════════════════════════════════════════════════════════
  // CLI AUTH — DEVICE CODE FLOW
  // Lets any CLI or agent authenticate without opening a browser on the same machine.
  //
  // Flow:
  //   1. CLI calls POST /v1/auth/cli/request → gets { device_code, user_code, verification_url }
  //   2. CLI shows user: "Visit remlabs.ai/cli-login and enter code: ABCD-1234"
  //   3. User visits verification_url, signs in, clicks Approve
  //   4. CLI polls POST /v1/auth/cli/token with device_code every 3-5 seconds
  //   5. When approved, token endpoint returns { api_key }
  // ════════════════════════════════════════════════════════════════════════════════

  function generateUserCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/1/0 confusion
    let code = '';
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += '-';
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /**
   * POST /v1/auth/cli/request
   * Start device code flow. No auth required — this is how the CLI bootstraps itself.
   */
  app.post('/v1/auth/cli/request', (req, res) => {
    const deviceCode  = crypto.randomBytes(32).toString('hex');
    const userCode    = generateUserCode();
    const now         = Date.now();
    const expires     = now + 15 * 60 * 1000; // 15 minutes
    const ip          = req.ip || null;
    const consumerUrl = (process.env.CONSUMER_URL || 'https://remlabs.ai').replace(/\/$/, '');

    try {
      db.prepare(`
        INSERT INTO cli_auth_requests (device_code, user_code, created, expires, ip)
        VALUES (?, ?, ?, ?, ?)
      `).run(deviceCode, userCode, now, expires, ip);

      res.json({
        ok: true,
        device_code: deviceCode,
        user_code: userCode,
        verification_url: consumerUrl + '/cli-login?code=' + userCode,
        expires_in: 900, // 15 minutes in seconds
        interval: 5,     // poll every 5 seconds
        message: 'Visit the URL and enter your code to authenticate'
      });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }
  });

  /**
   * POST /v1/auth/cli/token
   * Poll for the API key. Returns { api_key } when approved, { pending: true } while waiting.
   * Body: { device_code }
   */
  app.post('/v1/auth/cli/token', (req, res) => {
    const { device_code } = req.body || {};
    if (!device_code) return res.status(400).json({ ok: false, error: { code: 'missing_device_code' } });

    try {
      const row = db.prepare('SELECT * FROM cli_auth_requests WHERE device_code = ?').get(device_code);

      if (!row) return res.status(404).json({ ok: false, error: { code: 'invalid_device_code' } });
      if (row.expires < Date.now()) {
        db.prepare('DELETE FROM cli_auth_requests WHERE device_code = ?').run(device_code);
        return res.status(410).json({ ok: false, error: { code: 'expired', message: 'Device code expired. Run login again.' } });
      }
      if (!row.approved) return res.json({ ok: true, pending: true, message: 'Waiting for user approval' });

      // Approved — return the API key and clean up
      const apiKey = row.api_key;
      db.prepare('DELETE FROM cli_auth_requests WHERE device_code = ?').run(device_code);

      return res.json({ ok: true, api_key: apiKey, message: 'Authenticated successfully' });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }
  });

  /**
   * POST /v1/auth/cli/approve
   * Called from the web UI when user approves a device code.
   * Requires session auth (the user must be logged in on the web).
   * Body: { user_code }
   */
  app.post('/v1/auth/cli/approve', (req, res) => {
    // Get API key from session or Bearer token
    let apiKey = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

    // Also accept session cookie
    if (!apiKey && req.cookies?.slop_session) {
      try {
        const sess = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires > ?')
          .get(req.cookies.slop_session, Date.now());
        if (sess) apiKey = sess.api_key;
      } catch(_) {}
    }

    if (!apiKey || !apiKeys.has(apiKey)) {
      return res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'Sign in to approve CLI access' } });
    }

    const { user_code } = req.body || {};
    if (!user_code) return res.status(400).json({ ok: false, error: { code: 'missing_user_code' } });

    const normalizedCode = (user_code || '').toUpperCase().trim();

    try {
      const row = db.prepare('SELECT * FROM cli_auth_requests WHERE user_code = ?').get(normalizedCode);
      if (!row) return res.status(404).json({ ok: false, error: { code: 'invalid_code', message: 'Code not found or already used' } });
      if (row.expires < Date.now()) return res.status(410).json({ ok: false, error: { code: 'expired' } });
      if (row.approved) return res.json({ ok: true, already_approved: true });

      db.prepare('UPDATE cli_auth_requests SET api_key = ?, approved = 1 WHERE user_code = ?')
        .run(apiKey, normalizedCode);

      res.json({ ok: true, approved: true, message: 'CLI access granted' });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }
  });

  /**
   * GET /v1/auth/cli/status/:device_code
   * Check status of a device code request.
   */
  app.get('/v1/auth/cli/status/:device_code', (req, res) => {
    const { device_code } = req.params;
    try {
      const row = db.prepare('SELECT approved, expires FROM cli_auth_requests WHERE device_code = ?').get(device_code);
      if (!row) return res.json({ ok: true, status: 'invalid_or_expired' });
      if (row.expires < Date.now()) return res.json({ ok: true, status: 'expired' });
      return res.json({ ok: true, status: row.approved ? 'approved' : 'pending', expires: row.expires });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════════
  // NOTION WRITE-BACK — Enrich a Notion page with dream insights
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * POST /v1/integrations/notion/enrich
   * Append dream insights as a new section to an existing Notion page.
   * Requires: notion_token (stored or provided) + page_id + dream insights.
   *
   * Body: { page_id, namespace?, dream_session_id?, notion_token?, insight_keys?, title? }
   *
   * If notion_token is not in the body, looks up stored token in integration_tokens.
   * If dream_session_id provided, uses insights from that session; otherwise uses all
   * recent insights from the namespace.
   */
  app.post('/v1/integrations/notion/enrich', async (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const {
      page_id, namespace = 'default',
      dream_session_id, notion_token: providedToken,
      insight_keys, title = 'Dream Insights'
    } = req.body || {};

    if (!page_id) {
      return res.status(400).json({ ok: false, error: { code: 'missing_page_id', message: 'Provide page_id of the Notion page to enrich' } });
    }

    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const scopedNs = scoped(key, namespace);
    const dreamsNs = scopedNs + ':dreams';

    // Resolve Notion token
    let notionToken = providedToken;
    if (!notionToken) {
      try {
        const stored = db.prepare(`SELECT access_token FROM integration_tokens WHERE api_key_hash = ? AND provider = 'notion' ORDER BY created DESC LIMIT 1`).get(keyHash);
        if (stored && stored.access_token !== 'batch_import') notionToken = stored.access_token;
      } catch(_) {}
    }

    // Fetch insights via memory-search handler (handles decompression)
    const searchFn = memSearch();
    const getFn    = memGet();
    let insights = [];
    try {
      let rawRows = [];
      if (insight_keys && insight_keys.length && getFn) {
        rawRows = insight_keys.map(k => {
          const r = getFn({ namespace: dreamsNs, key: k }) || getFn({ namespace: scopedNs, key: k });
          if (!r || r._engine === 'not_found') return null;
          return { key: k, value: r.value, _from_handler: true };
        }).filter(Boolean);
      } else if (searchFn) {
        const query = dream_session_id ? dream_session_id.slice(0, 8) + ' insights synthesis' : 'insights synthesis patterns themes';
        const sr = searchFn({ namespace: dreamsNs, query, limit: 20 });
        rawRows = (sr.results || []).map(r => ({ key: r.key, value: r.value, _from_handler: true }));
        if (dream_session_id) {
          const pfx = dream_session_id.slice(0, 8);
          rawRows = rawRows.filter(r => r.key.includes(pfx));
        }
      } else {
        rawRows = db.prepare(`SELECT key,value FROM memory WHERE namespace=? ORDER BY created DESC LIMIT 10`).all(dreamsNs);
      }

      insights = rawRows.map(r => {
        let val = r._from_handler ? r.value : r.value || '';
        if (!r._from_handler && typeof val === 'string' && val.startsWith('~z~')) {
          try { val = require('zlib').inflateRawSync(Buffer.from(val.slice(3), 'base64')).toString('utf8'); } catch(_) {}
        }
        if (typeof val === 'object') val = JSON.stringify(val);
        if (typeof val === 'string') {
          try { const p = JSON.parse(val); val = p.value || p.insight || p.summary || val; } catch(_) {}
        }
        return { key: r.key, value: typeof val === 'string' ? val : JSON.stringify(val) };
      }).filter(i => i.value && !i.key.includes(':manifest'));
    } catch(e) {
      return res.status(500).json({ ok: false, error: { code: 'db_error', message: e.message } });
    }

    if (!insights.length) {
      return res.status(404).json({ ok: false, error: { code: 'no_insights', message: 'No insights found to write back. Run a dream first.' } });
    }

    // Build Notion blocks for the enrichment section
    const blocks = [
      {
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: '🌙 ' + title + ' (REM Labs Dream Engine)' } }] }
      },
      ...insights.map(ins => ({
        object: 'block', type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: ins.value.slice(0, 2000) } }]
        }
      })),
      {
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: 'Generated by REM Labs Dream Engine — remlabs.ai' }, annotations: { italic: true, color: 'gray' } }] }
      }
    ];

    // If no token, return a preview of what would be written
    if (!notionToken) {
      return res.json({
        ok: true,
        dry_run: true,
        message: 'No Notion token found. Connect Notion with a token to write back. Preview of blocks:',
        page_id,
        insights_count: insights.length,
        preview: insights.map(i => '• ' + i.value.slice(0, 120)),
        hint: 'POST /v1/integrations/notion/sync with notion_token to connect, then re-run enrich'
      });
    }

    // Write to Notion API
    try {
      const https = require('https');
      const body = JSON.stringify({ children: blocks });
      const notionRes = await new Promise((resolve, reject) => {
        const opts = {
          hostname: 'api.notion.com',
          path: '/v1/blocks/' + page_id + '/children',
          method: 'PATCH',
          headers: {
            'Authorization': 'Bearer ' + notionToken,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        };
        const r = https.request(opts, (resp) => {
          let data = '';
          resp.on('data', c => data += c);
          resp.on('end', () => { try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); } catch(e) { reject(e); } });
        });
        r.on('error', reject);
        r.setTimeout(10000, () => { r.destroy(); reject(new Error('timeout')); });
        r.write(body);
        r.end();
      });

      if (notionRes.status >= 400) {
        return res.status(notionRes.status).json({ ok: false, error: { code: 'notion_api_error', message: notionRes.body?.message || 'Notion API error' } });
      }

      return res.json({
        ok: true,
        page_id,
        blocks_appended: blocks.length,
        insights_written: insights.length,
        notion_response: { status: notionRes.status }
      });
    } catch(e) {
      return res.status(500).json({ ok: false, error: { code: 'notion_write_failed', message: e.message } });
    }
  });


  // ════════════════════════════════════════════════════════════════════════════════
  // GITHUB INTEGRATION — Import issues, PRs, commits as memories
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * POST /v1/integrations/github/sync
   * Import GitHub issues, PRs, and commits as memories.
   *
   * Body: { github_token, repo, owner, namespace?, types?, limit? }
   * types: ['issues', 'prs', 'commits'] (default: ['issues', 'prs'])
   */
  app.post('/v1/integrations/github/sync', async (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const {
      github_token, repo, owner,
      namespace = 'default',
      types = ['issues', 'prs'],
      limit = 20
    } = req.body || {};

    if (!github_token || !repo || !owner) {
      return res.status(400).json({
        ok: false,
        error: { code: 'missing_params', message: 'Provide github_token, owner, and repo' },
        example: { github_token: 'ghp_...', owner: 'acme', repo: 'my-project', namespace: 'work' }
      });
    }

    const scopedNs = scoped(key, namespace);
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const now = Date.now();
    const https = require('https');

    async function githubFetch(path) {
      return new Promise((resolve, reject) => {
        const opts = {
          hostname: 'api.github.com', path,
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + github_token,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'remlabs-memory-sync/1.0',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        };
        const r = https.request(opts, (resp) => {
          let data = '';
          resp.on('data', c => data += c);
          resp.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        r.on('error', reject);
        r.setTimeout(10000, () => { r.destroy(); reject(new Error('timeout')); });
        r.end();
      });
    }

    const imported = [];
    const errors = [];
    const safeLimit = Math.min(parseInt(limit) || 20, 50);

    // Import issues
    if (types.includes('issues')) {
      try {
        const issues = await githubFetch(`/repos/${owner}/${repo}/issues?state=open&per_page=${safeLimit}`);
        for (const issue of (Array.isArray(issues) ? issues : [])) {
          if (issue.pull_request) continue; // skip PRs from issues endpoint
          const memKey = `gh_issue_${repo}_${issue.number}`;
          const content = `[GitHub Issue #${issue.number}] ${issue.title}\n\n${(issue.body || '').slice(0, 1000)}\nLabels: ${(issue.labels || []).map(l => l.name).join(', ')}\nURL: ${issue.html_url}`;
          const tags = JSON.stringify(['source:github', 'type:issue', `repo:${owner}/${repo}`]);
          try {
            db.prepare(`INSERT OR REPLACE INTO memory (namespace, key, value, tags, content_type, memory_type, source_type, source_url, created, updated, ttl)
              VALUES (?, ?, ?, ?, 'document', 'core', 'github', ?, ?, ?, 0)`)
              .run(scopedNs, memKey, content, tags, issue.html_url, now, now);
            imported.push({ key: memKey, type: 'issue', number: issue.number, title: issue.title });
          } catch(e) { errors.push({ type: 'issue', number: issue.number, error: e.message }); }
        }
      } catch(e) { errors.push({ type: 'issues', error: e.message }); }
    }

    // Import PRs
    if (types.includes('prs')) {
      try {
        const prs = await githubFetch(`/repos/${owner}/${repo}/pulls?state=open&per_page=${safeLimit}`);
        for (const pr of (Array.isArray(prs) ? prs : [])) {
          const memKey = `gh_pr_${repo}_${pr.number}`;
          const content = `[GitHub PR #${pr.number}] ${pr.title}\n\n${(pr.body || '').slice(0, 1000)}\nBranch: ${pr.head?.ref} → ${pr.base?.ref}\nURL: ${pr.html_url}`;
          const tags = JSON.stringify(['source:github', 'type:pr', `repo:${owner}/${repo}`]);
          try {
            db.prepare(`INSERT OR REPLACE INTO memory (namespace, key, value, tags, content_type, memory_type, source_type, source_url, created, updated, ttl)
              VALUES (?, ?, ?, ?, 'document', 'core', 'github', ?, ?, ?, 0)`)
              .run(scopedNs, memKey, content, tags, pr.html_url, now, now);
            imported.push({ key: memKey, type: 'pr', number: pr.number, title: pr.title });
          } catch(e) { errors.push({ type: 'pr', number: pr.number, error: e.message }); }
        }
      } catch(e) { errors.push({ type: 'prs', error: e.message }); }
    }

    // Import recent commits
    if (types.includes('commits')) {
      try {
        const commits = await githubFetch(`/repos/${owner}/${repo}/commits?per_page=${Math.min(safeLimit, 20)}`);
        for (const c of (Array.isArray(commits) ? commits : [])) {
          const memKey = `gh_commit_${repo}_${c.sha.slice(0, 8)}`;
          const content = `[GitHub Commit ${c.sha.slice(0, 7)}] ${c.commit?.message?.split('\n')[0] || ''}\n\nAuthor: ${c.commit?.author?.name}\nDate: ${c.commit?.author?.date}\nURL: ${c.html_url}`;
          const tags = JSON.stringify(['source:github', 'type:commit', `repo:${owner}/${repo}`]);
          try {
            db.prepare(`INSERT OR REPLACE INTO memory (namespace, key, value, tags, content_type, memory_type, source_type, source_url, created, updated, ttl)
              VALUES (?, ?, ?, ?, 'text', 'core', 'github', ?, ?, ?, 0)`)
              .run(scopedNs, memKey, content, tags, c.html_url, now, now);
            imported.push({ key: memKey, type: 'commit', sha: c.sha.slice(0, 7), message: c.commit?.message?.split('\n')[0] });
          } catch(e) { errors.push({ type: 'commit', sha: c.sha?.slice(0, 7), error: e.message }); }
        }
      } catch(e) { errors.push({ type: 'commits', error: e.message }); }
    }

    // Register integration
    try {
      db.prepare(`INSERT OR REPLACE INTO integration_tokens (id, api_key_hash, provider, access_token, workspace_name, created)
        VALUES (?, ?, 'github', ?, ?, ?)`)
        .run(crypto.randomUUID(), keyHash, github_token.slice(0, 12) + '...', `${owner}/${repo}`, now);
    } catch(_) {}

    res.json({ ok: true, imported: imported.length, namespace, repo: `${owner}/${repo}`, results: imported, errors });
  });


  // ════════════════════════════════════════════════════════════════════════════════
  // LINEAR INTEGRATION — Import tickets as memories
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * POST /v1/integrations/linear/sync
   * Import Linear issues into memory namespace.
   *
   * Body: { linear_token, namespace?, team_id?, limit?, states? }
   */
  app.post('/v1/integrations/linear/sync', async (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const {
      linear_token, namespace = 'default',
      team_id, limit = 20, states = ['Todo', 'In Progress']
    } = req.body || {};

    if (!linear_token) {
      return res.status(400).json({
        ok: false,
        error: { code: 'missing_token', message: 'Provide linear_token (API key from Linear settings)' },
        example: { linear_token: 'lin_api_...', namespace: 'work', states: ['Todo', 'In Progress'] }
      });
    }

    const scopedNs = scoped(key, namespace);
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const now = Date.now();

    try {
      const https = require('https');
      const stateFilter = states.length ? `{ name: { in: ${JSON.stringify(states)} } }` : '{}';
      const teamFilter = team_id ? `, team: { id: { eq: "${team_id}" } }` : '';
      const query = `{
        issues(first: ${Math.min(parseInt(limit) || 20, 50)}, filter: { state: ${stateFilter}${teamFilter} }) {
          nodes {
            id identifier title description state { name } assignee { name }
            labels { nodes { name } } url createdAt updatedAt
          }
        }
      }`;

      const body = JSON.stringify({ query });
      const linearRes = await new Promise((resolve, reject) => {
        const opts = {
          hostname: 'api.linear.app', path: '/graphql',
          method: 'POST',
          headers: {
            'Authorization': linear_token,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        };
        const r = https.request(opts, (resp) => {
          let data = '';
          resp.on('data', c => data += c);
          resp.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        r.on('error', reject);
        r.setTimeout(10000, () => { r.destroy(); reject(new Error('timeout')); });
        r.write(body);
        r.end();
      });

      const issues = linearRes?.data?.issues?.nodes || [];
      const imported = [];

      for (const issue of issues) {
        const memKey = `linear_${issue.identifier.toLowerCase().replace('-', '_')}`;
        const content = `[Linear ${issue.identifier}] ${issue.title}\n\n${(issue.description || '').slice(0, 800)}\nState: ${issue.state?.name}\nAssignee: ${issue.assignee?.name || 'Unassigned'}\nLabels: ${(issue.labels?.nodes || []).map(l => l.name).join(', ')}\nURL: ${issue.url}`;
        const tags = JSON.stringify(['source:linear', 'type:issue', `state:${issue.state?.name}`]);
        try {
          db.prepare(`INSERT OR REPLACE INTO memory (namespace, key, value, tags, content_type, memory_type, source_type, source_url, created, updated, ttl)
            VALUES (?, ?, ?, ?, 'document', 'core', 'linear', ?, ?, ?, 0)`)
            .run(scopedNs, memKey, content, tags, issue.url, now, now);
          imported.push({ key: memKey, id: issue.identifier, title: issue.title, state: issue.state?.name });
        } catch(e) {}
      }

      // Register integration
      try {
        db.prepare(`INSERT OR REPLACE INTO integration_tokens (id, api_key_hash, provider, access_token, workspace_name, created)
          VALUES (?, ?, 'linear', ?, ?, ?)`)
          .run(crypto.randomUUID(), keyHash, linear_token.slice(0, 12) + '...', 'Linear', now);
      } catch(_) {}

      res.json({ ok: true, imported: imported.length, namespace, results: imported });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'linear_error', message: e.message } });
    }
  });


  // ════════════════════════════════════════════════════════════════════════════════
  // SLACK INTEGRATION — Import channel messages as memories
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * POST /v1/integrations/slack/sync
   * Import recent messages from a Slack channel as memories.
   *
   * Body: { slack_token, channel_id, namespace?, limit?, oldest? }
   * slack_token: Bot user OAuth token (xoxb-...)
   */
  app.post('/v1/integrations/slack/sync', async (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const {
      slack_token, channel_id, namespace = 'default',
      limit = 30, oldest
    } = req.body || {};

    if (!slack_token || !channel_id) {
      return res.status(400).json({
        ok: false,
        error: { code: 'missing_params', message: 'Provide slack_token (xoxb-...) and channel_id' },
        example: { slack_token: 'xoxb-...', channel_id: 'C01234ABCDE', namespace: 'team', limit: 30 }
      });
    }

    const scopedNs = scoped(key, namespace);
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const now = Date.now();

    try {
      const https = require('https');
      const params = new URLSearchParams({ channel: channel_id, limit: Math.min(parseInt(limit) || 30, 100) });
      if (oldest) params.set('oldest', oldest);

      const slackRes = await new Promise((resolve, reject) => {
        const opts = {
          hostname: 'slack.com',
          path: '/api/conversations.history?' + params.toString(),
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + slack_token }
        };
        const r = https.request(opts, (resp) => {
          let data = '';
          resp.on('data', c => data += c);
          resp.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        r.on('error', reject);
        r.setTimeout(10000, () => { r.destroy(); reject(new Error('timeout')); });
        r.end();
      });

      if (!slackRes.ok) {
        return res.status(400).json({ ok: false, error: { code: 'slack_error', message: slackRes.error || 'Slack API error' } });
      }

      const messages = (slackRes.messages || []).filter(m => m.type === 'message' && m.text && !m.subtype);
      const imported = [];

      // Group messages into batches of 5 for context-rich memories
      for (let i = 0; i < messages.length; i += 5) {
        const batch = messages.slice(i, i + 5);
        const ts = batch[0].ts.replace('.', '_');
        const memKey = `slack_${channel_id.slice(0, 8)}_${ts}`;
        const content = batch.map(m => `[${new Date(parseFloat(m.ts) * 1000).toISOString()}] ${m.text}`).join('\n');
        const tags = JSON.stringify(['source:slack', `channel:${channel_id}`, 'type:messages']);
        try {
          db.prepare(`INSERT OR REPLACE INTO memory (namespace, key, value, tags, content_type, memory_type, source_type, created, updated, ttl)
            VALUES (?, ?, ?, ?, 'text', 'core', 'slack', ?, ?, 0)`)
            .run(scopedNs, memKey, content, tags, now, now);
          imported.push({ key: memKey, messages: batch.length, ts: batch[0].ts });
        } catch(e) {}
      }

      // Register integration
      try {
        db.prepare(`INSERT OR REPLACE INTO integration_tokens (id, api_key_hash, provider, access_token, workspace_name, created)
          VALUES (?, ?, 'slack', ?, ?, ?)`)
          .run(crypto.randomUUID(), keyHash, slack_token.slice(0, 12) + '...', `Slack (${channel_id})`, now);
      } catch(_) {}

      res.json({ ok: true, imported: imported.length, messages_synced: messages.length, namespace, results: imported });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'slack_error', message: e.message } });
    }
  });


  // ════════════════════════════════════════════════════════════════════════════════
  // URL IMPORT — Fetch any URL and store as memory
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * POST /v1/integrations/url/import
   * Fetch a URL and store its content as a memory.
   * Strips HTML tags, extracts text content.
   *
   * Body: { url, namespace?, key?, content_type?, tags? }
   */
  app.post('/v1/integrations/url/import', async (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const {
      url: targetUrl, namespace = 'default',
      key: memKey, content_type = 'document', tags = []
    } = req.body || {};

    if (!targetUrl) {
      return res.status(400).json({ ok: false, error: { code: 'missing_url', message: 'Provide a url to import' } });
    }

    // Basic URL validation
    let parsedUrl;
    try { parsedUrl = new URL(targetUrl); } catch(_) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_url', message: 'Invalid URL format' } });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ ok: false, error: { code: 'invalid_protocol', message: 'Only http/https URLs allowed' } });
    }

    const scopedNs = scoped(key, namespace);
    const now = Date.now();

    try {
      const { get: httpGet } = parsedUrl.protocol === 'https:' ? require('https') : require('http');

      const rawHtml = await new Promise((resolve, reject) => {
        const r = httpGet(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; REMLabs-Memory/1.0)' },
          timeout: 10000
        }, (resp) => {
          if (resp.statusCode >= 400) { reject(new Error(`HTTP ${resp.statusCode}`)); return; }
          let data = '';
          resp.on('data', c => data += c);
          resp.on('end', () => resolve(data));
        });
        r.on('error', reject);
        r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
      });

      // Strip HTML — extract text content
      const text = rawHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ').trim()
        .slice(0, 8000);

      // Extract title from HTML
      const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1].trim() : parsedUrl.hostname;

      const finalKey = memKey || 'url_' + crypto.createHash('sha256').update(targetUrl).digest('hex').slice(0, 12);
      const allTags = JSON.stringify(['source:url', `domain:${parsedUrl.hostname}`, ...tags]);

      db.prepare(`INSERT OR REPLACE INTO memory (namespace, key, value, tags, content_type, memory_type, source_type, source_url, created, updated, ttl)
        VALUES (?, ?, ?, ?, ?, 'core', 'url', ?, ?, ?, 0)`)
        .run(scopedNs, finalKey, text, allTags, content_type, targetUrl, now, now);

      res.json({ ok: true, key: finalKey, namespace, title: pageTitle, url: targetUrl, size_bytes: text.length, content_type });
    } catch(e) {
      res.status(500).json({ ok: false, error: { code: 'fetch_failed', message: e.message } });
    }
  });


  /**
   * GET /v1/integrations/providers
   * List all available integration providers with status for the current user.
   */
  app.get('/v1/integrations/providers', (req, res) => {
    const key = requireAuth(req, res);
    if (!key) return;

    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    let connected = [];
    try {
      connected = db.prepare(`SELECT provider FROM integration_tokens WHERE api_key_hash = ?`).all(keyHash).map(r => r.provider);
    } catch(_) {}

    const providers = [
      { id: 'notion',   name: 'Notion',        status: connected.includes('notion') ? 'connected' : 'available',  endpoint: 'POST /v1/integrations/notion/sync',   write_back: true,  description: 'Import pages + write dream insights back to Notion' },
      { id: 'github',   name: 'GitHub',         status: connected.includes('github') ? 'connected' : 'available',  endpoint: 'POST /v1/integrations/github/sync',   write_back: false, description: 'Import issues, PRs, and commits as memories' },
      { id: 'linear',   name: 'Linear',         status: connected.includes('linear') ? 'connected' : 'available',  endpoint: 'POST /v1/integrations/linear/sync',   write_back: false, description: 'Import tickets and project issues' },
      { id: 'slack',    name: 'Slack',          status: connected.includes('slack') ? 'connected' : 'available',   endpoint: 'POST /v1/integrations/slack/sync',    write_back: false, description: 'Import channel messages and threads' },
      { id: 'url',      name: 'Web/URL Import', status: 'available',                                                endpoint: 'POST /v1/integrations/url/import',    write_back: false, description: 'Fetch any webpage and store as memory' },
      { id: 'obsidian', name: 'Obsidian',       status: 'coming_soon',                                              endpoint: null, write_back: true,                                  description: 'Sync Obsidian vault notes (use CLI: remlabs memory upload *.md)' },
      { id: 'voice',    name: 'Voice/Audio',    status: 'available',                                                endpoint: 'POST /v1/voice/transcribe-and-store', write_back: false, description: 'Transcribe and store voice memos' },
    ];

    res.json({ ok: true, providers, connected: connected.length });
  });


  // ── Convenience aliases ───────────────────────────────────────────────────────

  // POST /v1/memory/biota → 307 to /v1/memory/dream/biota (307 preserves method + body)
  app.post('/v1/memory/biota', (req, res) => {
    res.redirect(307, '/v1/memory/dream/biota');
  });

  // POST /v1/memory-add → same as /v1/memory-set (the dispatcher slug is memory-set)
  app.post('/v1/memory-add', (req, res) => {
    res.redirect(307, '/v1/memory-set');
  });

  console.log('  Route loaded: dream-layer (insights, promote, upload, CLI auth, integrations, aliases)');
};
