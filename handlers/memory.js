'use strict';

// ---------------------------------------------------------------------------
// SQLite-backed memory system
// ---------------------------------------------------------------------------
// Usage: module.exports(db) returns handler map
// The `db` instance is a better-sqlite3 Database already open and
// configured with WAL mode by server-v2.js.
// ---------------------------------------------------------------------------

module.exports = function (db) {

  // -------------------------------------------------------------------------
  // Schema bootstrap – idempotent, runs once at require time
  // -------------------------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      namespace TEXT NOT NULL,
      key       TEXT NOT NULL,
      value     TEXT,
      tags      TEXT NOT NULL DEFAULT '[]',
      created   INTEGER NOT NULL,
      updated   INTEGER NOT NULL,
      ttl       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (namespace, key)
    );
    CREATE TABLE IF NOT EXISTS memory_history (
      namespace TEXT    NOT NULL,
      key       TEXT    NOT NULL,
      value     TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mem_history_ns_key
      ON memory_history (namespace, key);
    CREATE TABLE IF NOT EXISTS queues (
      name    TEXT    NOT NULL,
      id      TEXT    PRIMARY KEY,
      value   TEXT,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_queues_name_created
      ON queues (name, created);
    CREATE TABLE IF NOT EXISTS counters (
      name    TEXT    PRIMARY KEY,
      value   REAL    NOT NULL DEFAULT 0,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    );
  `);

  // -------------------------------------------------------------------------
  // Prepared statements
  // -------------------------------------------------------------------------
  const stmts = {
    // memory
    memGet:    db.prepare(`SELECT * FROM memory WHERE namespace = ? AND key = ?`),
    memUpsert: db.prepare(`
      INSERT INTO memory (namespace, key, value, tags, created, updated, ttl)
      VALUES (@namespace, @key, @value, @tags, @created, @updated, @ttl)
      ON CONFLICT(namespace, key) DO UPDATE SET
        value   = excluded.value,
        tags    = excluded.tags,
        updated = excluded.updated,
        ttl     = CASE WHEN excluded.ttl = 0 THEN memory.ttl ELSE excluded.ttl END
    `),
    memUpdateTtl: db.prepare(`
      UPDATE memory SET ttl = @ttl, updated = @updated
      WHERE namespace = @namespace AND key = @key
    `),
    memUpdateValue: db.prepare(`
      UPDATE memory SET value = @value, updated = @updated
      WHERE namespace = @namespace AND key = @key
    `),
    memDelete: db.prepare(`DELETE FROM memory WHERE namespace = ? AND key = ?`),
    memDeleteExpired: db.prepare(`
      DELETE FROM memory WHERE namespace = ? AND key = ? AND ttl > 0 AND (created + ttl * 1000) < ?
    `),
    memSearch: db.prepare(`
      SELECT key, value, tags, created, updated, ttl FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
        AND (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')
    `),
    memList: db.prepare(`
      SELECT key, created, updated, length(value) AS size, tags FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
    `),
    memListByTag: db.prepare(`
      SELECT key, created, updated, length(value) AS size, tags FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
        AND tags LIKE ? ESCAPE '\\'
    `),
    memStats: db.prepare(`
      SELECT
        COUNT(*) AS count,
        SUM(length(value)) AS total_size_bytes,
        MIN(created) AS oldest,
        MAX(updated) AS newest
      FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
    `),
    memAll: db.prepare(`
      SELECT key, value, tags, ttl FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
    `),
    memNsList: db.prepare(`
      SELECT namespace, COUNT(*) AS count FROM memory GROUP BY namespace
    `),
    memNsClear: db.prepare(`DELETE FROM memory WHERE namespace = ?`),
    memNsHistoryClear: db.prepare(`DELETE FROM memory_history WHERE namespace = ?`),

    // history
    histInsert: db.prepare(`
      INSERT INTO memory_history (namespace, key, value, timestamp) VALUES (?, ?, ?, ?)
    `),
    histSelect: db.prepare(`
      SELECT value, timestamp FROM memory_history
      WHERE namespace = ? AND key = ?
      ORDER BY timestamp DESC LIMIT ?
    `),
    histPrune: db.prepare(`
      DELETE FROM memory_history WHERE namespace = ? AND key = ?
        AND timestamp NOT IN (
          SELECT timestamp FROM memory_history
          WHERE namespace = ? AND key = ?
          ORDER BY timestamp DESC LIMIT 50
        )
    `),

    // queues
    queueInsert: db.prepare(`INSERT INTO queues (name, id, value, created) VALUES (?, ?, ?, ?)`),
    queuePopRow: db.prepare(`SELECT id, value FROM queues WHERE name = ? ORDER BY created ASC LIMIT 1`),
    queueDelete: db.prepare(`DELETE FROM queues WHERE id = ?`),
    queuePeek:   db.prepare(`SELECT value FROM queues WHERE name = ? ORDER BY created ASC LIMIT 1`),
    queueSize:   db.prepare(`SELECT COUNT(*) AS cnt FROM queues WHERE name = ?`),

    // counters
    counterGet:    db.prepare(`SELECT value FROM counters WHERE name = ?`),
    counterUpsert: db.prepare(`
      INSERT INTO counters (name, value, created, updated) VALUES (@name, @value, @now, @now)
      ON CONFLICT(name) DO UPDATE SET value = value + @delta, updated = @now
    `),
  };

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------
  function isExpiredRow(row, now) {
    if (!row) return true;
    if (!row.ttl || row.ttl === 0) return false;
    return (row.created + row.ttl * 1000) < now;
  }

  function escapeLike(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  function likePattern(q) {
    return `%${escapeLike(q)}%`;
  }

  // -------------------------------------------------------------------------
  // 1. memory-set
  // -------------------------------------------------------------------------
  function memorySet(input) {
    input = input || {};
    const { key, value, tags = [], namespace = 'default', ttl_seconds } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const now = Date.now();
    const existing = stmts.memGet.get(namespace, key);

    // Record history of old value before overwriting
    if (existing && !isExpiredRow(existing, now)) {
      stmts.histInsert.run(namespace, key, existing.value, now);
      stmts.histPrune.run(namespace, key, namespace, key);
    }

    // Item 5: TTL support — if ttl_seconds is provided, set it; otherwise preserve existing
    const ttl = (ttl_seconds != null && Number(ttl_seconds) > 0) ? Number(ttl_seconds) : 0;

    stmts.memUpsert.run({
      namespace,
      key,
      value: JSON.stringify(value),
      tags: JSON.stringify(tags),
      created: existing ? existing.created : now,
      updated: now,
      ttl, // 0 preserves existing ttl via ON CONFLICT DO UPDATE logic; >0 sets new ttl
    });

    const result = { _engine: 'real', key, status: 'stored' };
    if (ttl > 0) {
      result.ttl_seconds = ttl;
      result.expires_at = (existing ? existing.created : now) + ttl * 1000;
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // 2. memory-get
  // -------------------------------------------------------------------------
  function memoryGet(input) {
    input = input || {};
    const { key, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const now = Date.now();
    const row = stmts.memGet.get(namespace, key);
    if (!row || isExpiredRow(row, now)) {
      if (row) stmts.memDelete.run(namespace, key);
      return { _engine: 'real', key, value: null, found: false, tags: [] };
    }
    return {
      _engine: 'real',
      key,
      value: JSON.parse(row.value),
      found: true,
      tags: JSON.parse(row.tags),
    };
  }

  // -------------------------------------------------------------------------
  // 3. memory-search
  // -------------------------------------------------------------------------
  function memorySearch(input) {
    input = input || {};
    const { query = '', namespace = 'default' } = input;
    const now = Date.now();
    const pat = likePattern(query);
    const rows = stmts.memSearch.all(namespace, now, pat, pat, pat);
    const results = rows.map(r => ({
      key: r.key,
      value: JSON.parse(r.value),
      tags: JSON.parse(r.tags),
    }));
    return { _engine: 'real', results, count: results.length };
  }

  // -------------------------------------------------------------------------
  // 4. memory-list
  // -------------------------------------------------------------------------
  function memoryList(input) {
    input = input || {};
    const { namespace = 'default', tag } = input;
    const now = Date.now();
    let rows;
    if (tag != null) {
      rows = stmts.memListByTag.all(namespace, now, likePattern(tag));
      // Filter precisely – LIKE can give false positives on substrings of tag values
      rows = rows.filter(r => {
        try { return JSON.parse(r.tags).includes(tag); } catch { return false; }
      });
    } else {
      rows = stmts.memList.all(namespace, now);
    }
    const keys = rows.map(r => r.key);
    return { _engine: 'real', keys, count: keys.length };
  }

  // -------------------------------------------------------------------------
  // 5. memory-delete
  // -------------------------------------------------------------------------
  function memoryDelete(input) {
    input = input || {};
    const { key, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const existing = stmts.memGet.get(namespace, key);
    const existed = !!existing;
    if (existed) stmts.memDelete.run(namespace, key);
    return { _engine: 'real', deleted: existed };
  }

  // -------------------------------------------------------------------------
  // 6. memory-expire
  // -------------------------------------------------------------------------
  function memoryExpire(input) {
    input = input || {};
    const { key, ttl_seconds, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    if (ttl_seconds == null) return { _engine: 'real', error: 'missing_required_field', required: 'ttl_seconds' };
    const now = Date.now();
    const row = stmts.memGet.get(namespace, key);
    if (!row || isExpiredRow(row, now)) return { _engine: 'real', error: 'key_not_found', key };
    const ttl = Number(ttl_seconds);
    stmts.memUpdateTtl.run({ ttl, updated: now, namespace, key });
    const expires_at = row.created + ttl * 1000;
    return { _engine: 'real', key, expires_at };
  }

  // -------------------------------------------------------------------------
  // 7. memory-increment
  // -------------------------------------------------------------------------
  function memoryIncrement(input) {
    input = input || {};
    const { key, by = 1, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const now = Date.now();

    const doIncrement = db.transaction(() => {
      const row = stmts.memGet.get(namespace, key);
      const current = (row && !isExpiredRow(row, now) && typeof JSON.parse(row.value) === 'number')
        ? JSON.parse(row.value)
        : 0;
      const next = current + Number(by);

      if (row && !isExpiredRow(row, now)) {
        stmts.histInsert.run(namespace, key, row.value, now);
        stmts.histPrune.run(namespace, key, namespace, key);
        stmts.memUpdateValue.run({ value: JSON.stringify(next), updated: now, namespace, key });
      } else {
        stmts.memUpsert.run({
          namespace,
          key,
          value: JSON.stringify(next),
          tags: JSON.stringify([]),
          created: now,
          updated: now,
          ttl: 0,
        });
      }
      return next;
    });

    const next = doIncrement();
    return { _engine: 'real', key, value: next };
  }

  // -------------------------------------------------------------------------
  // 8. memory-append
  // -------------------------------------------------------------------------
  function memoryAppend(input) {
    input = input || {};
    const { key, item, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const now = Date.now();

    const doAppend = db.transaction(() => {
      const row = stmts.memGet.get(namespace, key);
      const arr = (row && !isExpiredRow(row, now) && Array.isArray(JSON.parse(row.value)))
        ? JSON.parse(row.value)
        : [];
      arr.push(item);

      if (row && !isExpiredRow(row, now)) {
        stmts.histInsert.run(namespace, key, row.value, now);
        stmts.histPrune.run(namespace, key, namespace, key);
        stmts.memUpdateValue.run({ value: JSON.stringify(arr), updated: now, namespace, key });
      } else {
        stmts.memUpsert.run({
          namespace,
          key,
          value: JSON.stringify(arr),
          tags: JSON.stringify([]),
          created: now,
          updated: now,
          ttl: 0,
        });
      }
      return arr.length;
    });

    const length = doAppend();
    return { _engine: 'real', key, length };
  }

  // -------------------------------------------------------------------------
  // 9. memory-history
  // -------------------------------------------------------------------------
  function memoryHistory(input) {
    input = input || {};
    const { key, limit = 10, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const rows = stmts.histSelect.all(namespace, key, Number(limit));
    const versions = rows.map(r => ({
      value: JSON.parse(r.value),
      timestamp: r.timestamp,
    }));
    return { _engine: 'real', versions, history: versions, count: versions.length };
  }

  // -------------------------------------------------------------------------
  // 10. memory-export
  // -------------------------------------------------------------------------
  function memoryExport(input) {
    input = input || {};
    const { namespace = 'default' } = input;
    const now = Date.now();
    const rows = stmts.memAll.all(namespace, now);
    const data = {};
    for (const r of rows) {
      data[r.key] = JSON.parse(r.value);
    }
    return { _engine: 'real', data, count: Object.keys(data).length };
  }

  // -------------------------------------------------------------------------
  // 11. memory-import
  // -------------------------------------------------------------------------
  function memoryImport(input) {
    input = input || {};
    const { data = {}, namespace = 'default' } = input;
    const now = Date.now();

    const doImport = db.transaction(() => {
      let count = 0;
      for (const [k, v] of Object.entries(data)) {
        const existing = stmts.memGet.get(namespace, k);
        if (existing) {
          stmts.histInsert.run(namespace, k, existing.value, now);
          stmts.histPrune.run(namespace, k, namespace, k);
        }
        stmts.memUpsert.run({
          namespace,
          key: k,
          value: JSON.stringify(v),
          tags: existing ? existing.tags : JSON.stringify([]),
          created: existing ? existing.created : now,
          updated: now,
          ttl: 0,
        });
        count++;
      }
      return count;
    });

    const imported = doImport();
    return { _engine: 'real', imported };
  }

  // -------------------------------------------------------------------------
  // 12. memory-stats
  // -------------------------------------------------------------------------
  function memoryStats(input) {
    input = input || {};
    const { namespace = 'default' } = input;
    const now = Date.now();
    const row = stmts.memStats.get(namespace, now);
    return {
      _engine: 'real',
      count: row.count || 0,
      total_size_bytes: row.total_size_bytes || 0,
      oldest: row.oldest ? new Date(row.oldest).toISOString() : null,
      newest: row.newest ? new Date(row.newest).toISOString() : null,
    };
  }

  // -------------------------------------------------------------------------
  // 13. memory-namespace-list
  // -------------------------------------------------------------------------
  function memoryNamespaceList() {
    const rows = stmts.memNsList.all();
    const namespaces = rows.map(r => r.namespace);
    return { _engine: 'real', namespaces, count: namespaces.length };
  }

  // -------------------------------------------------------------------------
  // 14. memory-namespace-clear
  // -------------------------------------------------------------------------
  function memoryNamespaceClear(input) {
    input = input || {};
    const { namespace, confirm } = input;
    if (!namespace) return { _engine: 'real', error: 'missing_required_field', required: 'namespace' };
    if (confirm !== `clear:${namespace}`) {
      return { _engine: 'real', error: 'missing_required_field', required: 'confirm', hint: `pass confirm: "clear:${namespace}"` };
    }
    const doDelete = db.transaction(() => {
      stmts.memNsClear.run(namespace);
      stmts.memNsHistoryClear.run(namespace);
    });
    doDelete();
    return { _engine: 'real', cleared: true };
  }

  // -------------------------------------------------------------------------
  // 15. queue-push
  // -------------------------------------------------------------------------
  function queuePush(input) {
    input = input || {};
    const queue = input.queue || input.key || input.name || 'default';
    const item = input.item !== undefined ? input.item : input.value;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    stmts.queueInsert.run(queue, id, JSON.stringify(item), Date.now());
    const { cnt } = stmts.queueSize.get(queue);
    return { _engine: 'real', queue, size: cnt };
  }

  // -------------------------------------------------------------------------
  // 16. queue-pop
  // -------------------------------------------------------------------------
  function queuePop(input) {
    input = input || {};
    const queue = input.queue || input.key || input.name || 'default';

    const doPop = db.transaction(() => {
      const row = stmts.queuePopRow.get(queue);
      if (!row) return { item: null, remaining: 0 };
      stmts.queueDelete.run(row.id);
      const { cnt } = stmts.queueSize.get(queue);
      return { item: JSON.parse(row.value), remaining: cnt };
    });

    const result = doPop();
    return { _engine: 'real', ...result };
  }

  // -------------------------------------------------------------------------
  // 17. queue-peek
  // -------------------------------------------------------------------------
  function queuePeek(input) {
    input = input || {};
    const queue = input.queue || input.key || input.name || 'default';
    const row = stmts.queuePeek.get(queue);
    const { cnt } = stmts.queueSize.get(queue);
    return {
      _engine: 'real',
      item: row ? JSON.parse(row.value) : null,
      size: cnt,
    };
  }

  // -------------------------------------------------------------------------
  // 18. queue-size
  // -------------------------------------------------------------------------
  function queueSize(input) {
    input = input || {};
    const queue = input.queue || input.key || input.name || 'default';
    const { cnt } = stmts.queueSize.get(queue);
    return { _engine: 'real', size: cnt };
  }

  // -------------------------------------------------------------------------
  // 19. counter-increment
  // -------------------------------------------------------------------------
  function counterIncrement(input) {
    input = input || {};
    const name = input.name || input.key;
    const by = input.by || input.amount || 1;
    if (!name) return { _engine: 'real', error: 'missing_required_field', required: 'name' };
    const delta = Number(by);
    const now = Date.now();
    stmts.counterUpsert.run({ name, value: delta, delta, now });
    const row = stmts.counterGet.get(name);
    return { _engine: 'real', name, value: row.value };
  }

  function counterDecrement(input) {
    input = input || {};
    const name = input.name || input.key;
    const by = input.by || input.amount || 1;
    if (!name) return { _engine: 'real', error: 'missing_required_field', required: 'name' };
    const delta = -Math.abs(Number(by));
    const now = Date.now();
    stmts.counterUpsert.run({ name, value: delta, delta, now });
    const row = stmts.counterGet.get(name);
    return { _engine: 'real', name, value: row.value };
  }

  // -------------------------------------------------------------------------
  // 20. counter-get
  // -------------------------------------------------------------------------
  function counterGet(input) {
    input = input || {};
    const name = input.name || input.key;
    if (!name) return { _engine: 'real', error: 'missing_required_field', required: 'name' };
    const row = stmts.counterGet.get(name);
    return { _engine: 'real', name, value: row ? row.value : 0 };
  }

  // -------------------------------------------------------------------------
  // 21. memory-vector-search
  // -------------------------------------------------------------------------
  function memoryVectorSearch(input) {
    const { namespace, query, limit } = input;
    if (!query) return { _engine: 'real', error: 'Provide a query string', results: [] };

    const ns = namespace || 'default';
    const now = Date.now();
    const all = stmts.memAll.all(ns, now);

    // Simple TF-IDF-like scoring: count query word matches in each value
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scored = all.map(row => {
      const text = (row.value + ' ' + row.key + ' ' + (row.tags || '')).toLowerCase();
      const matches = queryWords.filter(w => text.includes(w)).length;
      const score = queryWords.length > 0 ? matches / queryWords.length : 0;
      return { key: row.key, value: row.value, tags: row.tags, score, matches };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit || 10);

    return { _engine: 'real', results: scored, count: scored.length, query };
  }

  // -------------------------------------------------------------------------
  // 22. memory-time-capsule
  // -------------------------------------------------------------------------
  function memoryTimeCapsule(input) {
    const { namespace, key, value, open_after } = input;
    if (!value) return { _engine: 'real', error: 'Provide a value to store' };
    const ns = namespace || 'time-capsules';
    const k = key || 'capsule-' + Date.now().toString(36);
    const openAfterMs = open_after ? new Date(open_after).getTime() : Date.now() + 86400000; // default: 24h

    stmts.memUpsert.run({
      namespace: ns,
      key: k,
      value: JSON.stringify({ value, sealed_at: new Date().toISOString(), opens_at: new Date(openAfterMs).toISOString() }),
      tags: JSON.stringify(['time-capsule']),
      created: Date.now(),
      updated: Date.now(),
      ttl: 0,
    });

    return { _engine: 'real', key: k, namespace: ns, opens_at: new Date(openAfterMs).toISOString(), status: 'sealed' };
  }

  // -------------------------------------------------------------------------
  // Handler map
  // -------------------------------------------------------------------------
  return {
    'memory-set':             memorySet,
    'memory-get':             memoryGet,
    'memory-search':          memorySearch,
    'memory-list':            memoryList,
    'memory-delete':          memoryDelete,
    'memory-expire':          memoryExpire,
    'memory-increment':       memoryIncrement,
    'memory-append':          memoryAppend,
    'memory-history':         memoryHistory,
    'memory-export':          memoryExport,
    'memory-import':          memoryImport,
    'memory-stats':           memoryStats,
    'memory-namespace-list':  memoryNamespaceList,
    'memory-namespace-clear': memoryNamespaceClear,
    'queue-push':             queuePush,
    'queue-pop':              queuePop,
    'queue-peek':             queuePeek,
    'queue-size':             queueSize,
    'counter-increment':      counterIncrement,
    'counter-decrement':      counterDecrement,
    'counter-get':            counterGet,
    'memory-vector-search':   memoryVectorSearch,
    'memory-time-capsule':    memoryTimeCapsule,

    // ─── STATE HANDLERS (shared agent state via agent_state table) ───
    'state-set': (input) => {
      try {
        input = input || {};
        const key = input.key;
        if (!key) return { _engine: 'real', ok: false, error: 'key is required' };
        const value = input.value;
        const namespace = input.namespace || 'shared';
        const version = Date.now();
        db.prepare('INSERT OR REPLACE INTO agent_state (key, value) VALUES (?, ?)').run(
          namespace + ':' + key,
          JSON.stringify({ value, version, ts: new Date().toISOString() })
        );
        return { _engine: 'real', ok: true, key, version, namespace };
      } catch(e) { return { _engine: 'real', ok: false, error: e.message }; }
    },

    'state-get': (input) => {
      try {
        input = input || {};
        const key = input.key;
        if (!key) return { _engine: 'real', ok: false, error: 'key is required' };
        const namespace = input.namespace || 'shared';
        const row = db.prepare('SELECT value FROM agent_state WHERE key = ?').get(namespace + ':' + key);
        if (!row) return { _engine: 'real', ok: true, key, value: null, version: null };
        try {
          const parsed = JSON.parse(row.value);
          return { _engine: 'real', ok: true, key, ...parsed, namespace };
        } catch(e) {
          return { _engine: 'real', ok: true, key, value: row.value, namespace };
        }
      } catch(e) { return { _engine: 'real', ok: false, error: e.message }; }
    },

    'state-list': (input) => {
      try {
        input = input || {};
        const namespace = input.namespace || 'shared';
        const rows = db.prepare("SELECT key, value FROM agent_state WHERE key LIKE ? || ':%'").all(namespace);
        const entries = rows.map(r => {
          const shortKey = r.key.replace(namespace + ':', '');
          try { return { key: shortKey, ...JSON.parse(r.value) }; } catch(e) { return { key: shortKey, value: r.value }; }
        });
        return { _engine: 'real', ok: true, namespace, entries, count: entries.length };
      } catch(e) { return { _engine: 'real', ok: false, entries: [], count: 0, error: e.message }; }
    },

    // ─── CONTEXT SESSION (aggregate session context for agents) ───
    'context-session': (input) => {
      try {
        input = input || {};
        const namespace = input.namespace || 'shared';
        const goal = input.goal || null;

        // Gather memory stats
        let memoryCount = 0;
        try { memoryCount = db.prepare('SELECT COUNT(*) as cnt FROM memory').get().cnt; } catch(e) {}

        // Gather state entries for this namespace
        let stateEntries = [];
        try {
          const rows = db.prepare("SELECT key, value FROM agent_state WHERE key LIKE ? || ':%' LIMIT 50").all(namespace);
          stateEntries = rows.map(r => {
            const shortKey = r.key.replace(namespace + ':', '');
            try { return { key: shortKey, ...JSON.parse(r.value) }; } catch(e) { return { key: shortKey, value: r.value }; }
          });
        } catch(e) {}

        // Gather recent audit activity
        let recentActivity = [];
        try {
          recentActivity = db.prepare('SELECT slug, ts, latency_ms, engine FROM audit_log ORDER BY rowid DESC LIMIT 10').all();
        } catch(e) {}

        return {
          _engine: 'real',
          ok: true,
          session: {
            goal,
            namespace,
            memory_entries: memoryCount,
            state_entries: stateEntries.length,
            state: stateEntries,
            recent_activity: recentActivity,
            capabilities: ['memory', 'state', 'compute', 'orchestrate', 'generate'],
            ts: new Date().toISOString()
          }
        };
      } catch(e) { return { _engine: 'real', ok: false, error: e.message }; }
    },
  };
};
