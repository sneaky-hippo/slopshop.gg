'use strict';

const zlib = require('zlib');
const MEM_COMPRESS_THRESHOLD = 512; // Only compress values > 512 bytes
const MEM_COMPRESS_PREFIX = '~z~';  // Marker for compressed values

function _memCompress(str) {
  if (!str || str.length < MEM_COMPRESS_THRESHOLD) return str;
  try {
    return MEM_COMPRESS_PREFIX + zlib.deflateRawSync(Buffer.from(str, 'utf8'), { level: 6 }).toString('base64');
  } catch(e) { return str; }
}

function _memDecompress(str) {
  if (!str || !str.startsWith(MEM_COMPRESS_PREFIX)) return str;
  try {
    return zlib.inflateRawSync(Buffer.from(str.slice(MEM_COMPRESS_PREFIX.length), 'base64')).toString('utf8');
  } catch(e) { return str.slice(MEM_COMPRESS_PREFIX.length) || str; }
}

// ---------------------------------------------------------------------------
// SQLite-backed memory system — v2
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
      version   INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (namespace, key)
    );
    CREATE TABLE IF NOT EXISTS memory_history (
      namespace TEXT    NOT NULL,
      key       TEXT    NOT NULL,
      value     TEXT,
      timestamp INTEGER NOT NULL,
      version   INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_mem_history_ns_key
      ON memory_history (namespace, key);
    CREATE TABLE IF NOT EXISTS memory_locks (
      namespace TEXT    NOT NULL,
      key       TEXT    NOT NULL,
      owner     TEXT    NOT NULL,
      locked_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (namespace, key)
    );
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

  // Add version column if it doesn't exist (migration for existing installs)
  try { db.exec(`ALTER TABLE memory ADD COLUMN version INTEGER NOT NULL DEFAULT 1`); } catch (e) {}
  try { db.exec(`ALTER TABLE memory_history ADD COLUMN version INTEGER NOT NULL DEFAULT 1`); } catch (e) {}
  // Add type column for memory taxonomy (user, feedback, project, reference)
  try { db.exec(`ALTER TABLE memory ADD COLUMN type TEXT DEFAULT 'project'`); } catch (e) {}
  try { db.exec(`ALTER TABLE memory ADD COLUMN locked INTEGER NOT NULL DEFAULT 0`); } catch (e) {}

  // PERF: Add indexes for list/search hot paths (idempotent — IF NOT EXISTS)
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_memory_ns_updated
        ON memory (namespace, updated DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_ns_ttl
        ON memory (namespace, ttl, created);
      CREATE INDEX IF NOT EXISTS idx_memory_ns_type
        ON memory (namespace, type);
      CREATE INDEX IF NOT EXISTS idx_memory_updated
        ON memory (updated DESC);
    `);
  } catch (e) { /* non-fatal — indexes are pure optimization */ }

  // -------------------------------------------------------------------------
  // Prepared statements
  // -------------------------------------------------------------------------
  const stmts = {
    // memory
    memGet:    db.prepare(`SELECT * FROM memory WHERE namespace = ? AND key = ?`),
    memUpsert: db.prepare(`
      INSERT INTO memory (namespace, key, value, tags, created, updated, ttl, version, type)
      VALUES (@namespace, @key, @value, @tags, @created, @updated, @ttl, @version, @type)
      ON CONFLICT(namespace, key) DO UPDATE SET
        value   = excluded.value,
        tags    = excluded.tags,
        updated = excluded.updated,
        ttl     = excluded.ttl,
        version = excluded.version,
        type    = excluded.type
    `),
    memUpdateTtl: db.prepare(`
      UPDATE memory SET ttl = @ttl, updated = @updated
      WHERE namespace = @namespace AND key = @key
    `),
    memUpdateValue: db.prepare(`
      UPDATE memory SET value = @value, updated = @updated, version = version + 1
      WHERE namespace = @namespace AND key = @key
    `),
    memUpdateValueAndTags: db.prepare(`
      UPDATE memory SET value = @value, tags = @tags, updated = @updated, version = version + 1
      WHERE namespace = @namespace AND key = @key
    `),
    memDelete: db.prepare(`DELETE FROM memory WHERE namespace = ? AND key = ?`),
    memSearch: db.prepare(`
      SELECT key, value, tags, created, updated, ttl, version, type FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
        AND (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')
    `),
    memSearchByType: db.prepare(`
      SELECT key, value, tags, created, updated, ttl, version, type FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
        AND type = ?
        AND (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')
    `),
    memList: db.prepare(`
      SELECT key, created, updated, length(value) AS size, tags FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
      ORDER BY updated DESC
    `),
    memListByTag: db.prepare(`
      SELECT key, created, updated, length(value) AS size, tags FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
        AND tags LIKE ? ESCAPE '\\'
      ORDER BY updated DESC
    `),
    memStats: db.prepare(`
      SELECT
        COUNT(*) AS count,
        SUM(length(value)) AS total_size_bytes,
        MIN(created) AS oldest,
        MAX(updated) AS newest,
        SUM(CASE WHEN ttl > 0 THEN 1 ELSE 0 END) AS ttl_count
      FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
    `),
    memAll: db.prepare(`
      SELECT key, value, tags, ttl, created, updated, version, type, locked FROM memory
      WHERE namespace = ?
        AND (ttl = 0 OR (created + ttl * 1000) >= ?)
    `),
    memNsList: db.prepare(`
      SELECT namespace, COUNT(*) AS count, MAX(updated) AS last_updated FROM memory GROUP BY namespace
    `),
    memNsClear: db.prepare(`DELETE FROM memory WHERE namespace = ?`),
    memNsHistoryClear: db.prepare(`DELETE FROM memory_history WHERE namespace = ?`),
    memCopy: db.prepare(`
      INSERT INTO memory (namespace, key, value, tags, created, updated, ttl, version)
      SELECT @dest_ns, @dest_key, value, tags, @now, @now, ttl, 1
      FROM memory WHERE namespace = @src_ns AND key = @src_key
      ON CONFLICT(namespace, key) DO UPDATE SET
        value   = excluded.value,
        tags    = excluded.tags,
        updated = excluded.updated,
        version = memory.version + 1
    `),

    // history
    histInsert: db.prepare(`
      INSERT INTO memory_history (namespace, key, value, timestamp, version) VALUES (?, ?, ?, ?, ?)
    `),
    histSelect: db.prepare(`
      SELECT value, timestamp, version FROM memory_history
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

    // locks
    lockGet:    db.prepare(`SELECT * FROM memory_locks WHERE namespace = ? AND key = ?`),
    lockInsert: db.prepare(`
      INSERT INTO memory_locks (namespace, key, owner, locked_at, expires_at)
      VALUES (@namespace, @key, @owner, @locked_at, @expires_at)
    `),
    lockDelete: db.prepare(`DELETE FROM memory_locks WHERE namespace = ? AND key = ? AND owner = ?`),
    lockDeleteExpired: db.prepare(`DELETE FROM memory_locks WHERE expires_at < ?`),

    // queues
    queueInsert: db.prepare(`INSERT INTO queues (name, id, value, created) VALUES (?, ?, ?, ?)`),
    queuePopRow: db.prepare(`SELECT id, value FROM queues WHERE name = ? ORDER BY created ASC LIMIT 1`),
    queueDelete: db.prepare(`DELETE FROM queues WHERE id = ?`),
    queuePeek:   db.prepare(`SELECT value FROM queues WHERE name = ? ORDER BY created ASC LIMIT 1`),
    queueSize:   db.prepare(`SELECT COUNT(*) AS cnt FROM queues WHERE name = ?`),

    // counters
    counterGet:    db.prepare(`SELECT * FROM counters WHERE name = ?`),
    counterUpsert: db.prepare(`
      INSERT INTO counters (name, value, created, updated) VALUES (@name, @value, @now, @now)
      ON CONFLICT(name) DO UPDATE SET value = value + @delta, updated = @now
    `),
    counterSet: db.prepare(`
      INSERT INTO counters (name, value, created, updated) VALUES (@name, @value, @now, @now)
      ON CONFLICT(name) DO UPDATE SET value = @value, updated = @now
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

  // Stringify a parsed value for text scoring — handles objects/arrays gracefully
  function valueToText(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
      return JSON.stringify(parsed);
    } catch {
      return String(raw || '');
    }
  }

  // TF-IDF-like word-overlap score between query and text [0..1]
  function scoreRelevance(query, text) {
    const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (qWords.length === 0) return 0;
    const textLower = text.toLowerCase();
    let matchWeight = 0;
    for (const w of qWords) {
      // Count occurrences for term frequency boost
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const hits = (textLower.match(re) || []).length;
      if (hits > 0) matchWeight += 1 + Math.log(1 + hits) * 0.3;
    }
    return parseFloat((matchWeight / qWords.length).toFixed(4));
  }

  function histRecord(namespace, key, value, version, now) {
    stmts.histInsert.run(namespace, key, value, now, version || 1);
    stmts.histPrune.run(namespace, key, namespace, key);
  }

  // -------------------------------------------------------------------------
  // 1. memory-set
  // -------------------------------------------------------------------------
  function memorySet(input) {
    input = input || {};
    const { key, value, tags = [], namespace = 'default', ttl_seconds, type } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const VALID_TYPES = ['user', 'feedback', 'project', 'reference'];
    const memType = (type && VALID_TYPES.includes(type)) ? type : (type ? 'project' : undefined);
    const now = Date.now();
    const existing = stmts.memGet.get(namespace, key);
    const isLive = existing && !isExpiredRow(existing, now);

    // Record history of old value before overwriting
    if (isLive) {
      histRecord(namespace, key, existing.value, existing.version, now);
    }

    // ttl_seconds: positive = set/update TTL, 0 = clear TTL, null/undefined = preserve existing TTL
    let ttl;
    if (ttl_seconds == null) {
      // preserve existing if updating, else no TTL
      ttl = (isLive && existing.ttl) ? existing.ttl : 0;
    } else {
      ttl = Math.max(0, Number(ttl_seconds));
    }

    // type: use provided value, fall back to existing, then default 'project'
    const resolvedType = memType || (isLive && existing.type ? existing.type : 'project');

    const newVersion = isLive ? (existing.version || 1) + 1 : 1;

    stmts.memUpsert.run({
      namespace,
      key,
      value: _memCompress(JSON.stringify(value)),
      tags: JSON.stringify(Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : [tags]),
      created: isLive ? existing.created : now,
      updated: now,
      ttl,
      version: newVersion,
      type: resolvedType,
    });

    const result = { _engine: 'real', key, namespace, status: 'stored', version: newVersion, type: resolvedType };
    if (ttl > 0) {
      result.ttl_seconds = ttl;
      result.expires_at = new Date((isLive ? existing.created : now) + ttl * 1000).toISOString();
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
      return { _engine: 'real', key, namespace, value: null, found: false, tags: [] };
    }
    const result = {
      _engine: 'real',
      key,
      namespace,
      value: JSON.parse(_memDecompress(row.value)),
      found: true,
      tags: JSON.parse(row.tags),
      version: row.version || 1,
      type: row.type || 'project',
      created: new Date(row.created).toISOString(),
      updated: new Date(row.updated).toISOString(),
    };
    if (row.ttl > 0) {
      result.ttl_seconds = row.ttl;
      result.expires_at = new Date(row.created + row.ttl * 1000).toISOString();
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // 3. memory-search — LIKE-based with relevance scoring
  // -------------------------------------------------------------------------
  function memorySearch(input) {
    input = input || {};
    const { query = '', namespace = 'default', limit = 50, type } = input;
    const VALID_TYPES = ['user', 'feedback', 'project', 'reference'];
    const typeFilter = (type && VALID_TYPES.includes(type)) ? type : null;
    const now = Date.now();

    // Fetch all live rows for namespace (LIKE on compressed value column is not reliable),
    // then decompress and filter in JS so search works correctly.
    const allRows = typeFilter
      ? db.prepare(`SELECT key, value, tags, updated, type FROM memory WHERE namespace = ? AND (ttl = 0 OR (created + ttl * 1000) >= ?) AND type = ?`).all(namespace, now, typeFilter)
      : db.prepare(`SELECT key, value, tags, updated, type FROM memory WHERE namespace = ? AND (ttl = 0 OR (created + ttl * 1000) >= ?)`).all(namespace, now);

    const pat = query.trim() ? query.trim().toLowerCase() : null;

    // Score and rank: count word hits weighted by frequency
    const results = allRows
    .filter(r => {
      if (!pat) return true;
      const decompVal = _memDecompress(r.value) || '';
      const textCorpus = (decompVal + ' ' + r.key + ' ' + (r.tags || '[]')).toLowerCase();
      return textCorpus.includes(pat) || scoreRelevance(pat, textCorpus) > 0;
    })
    .map(r => {
      const decompVal = _memDecompress(r.value);
      const textCorpus = valueToText(decompVal) + ' ' + r.key + ' ' + (r.tags || '[]');
      const score = query.trim() ? scoreRelevance(query, textCorpus) : 1;
      return {
        key: r.key,
        value: JSON.parse(decompVal),
        tags: JSON.parse(r.tags),
        type: r.type || 'project',
        score,
        updated: new Date(r.updated).toISOString(),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(limit));

    return { _engine: 'real', results, count: results.length, query, ...(typeFilter ? { type_filter: typeFilter } : {}) };
  }

  // -------------------------------------------------------------------------
  // 4. memory-list
  // -------------------------------------------------------------------------
  function memoryList(input) {
    input = input || {};
    const { namespace = 'default', tag, include_meta = false, limit = 100, offset = 0 } = input;
    const now = Date.now();
    let rows;
    if (tag != null) {
      rows = stmts.memListByTag.all(namespace, now, likePattern(tag));
      rows = rows.filter(r => {
        try { return JSON.parse(r.tags).includes(tag); } catch { return false; }
      });
    } else {
      rows = db.prepare("SELECT key, created, updated, length(value) AS size, tags FROM memory WHERE namespace = ? AND (ttl = 0 OR (created + ttl * 1000) >= ?) ORDER BY updated DESC LIMIT ? OFFSET ?").all(namespace, now, Number(limit), Number(offset));
    }

    // PERF: fast approximate count — TTL-expired rows are rare, skip the expensive expression scan
    // Use exact count only when offset > 0 (pagination) to avoid full scan on every page-1 call
    let total;
    if (Number(offset) > 0) {
      total = db.prepare("SELECT COUNT(*) as cnt FROM memory WHERE namespace = ? AND (ttl = 0 OR (created + ttl * 1000) >= ?)").get(namespace, now).cnt;
    } else {
      // Fast path: indexed count by namespace only (off-by-at-most-a-few due to uncleared expired rows)
      total = db.prepare("SELECT COUNT(*) as cnt FROM memory WHERE namespace = ?").get(namespace).cnt;
    }
    if (include_meta) {
      const entries = rows.map(r => ({
        key: r.key,
        size: r.size,
        tags: JSON.parse(r.tags),
        created: new Date(r.created).toISOString(),
        updated: new Date(r.updated).toISOString(),
      }));
      return { _engine: 'real', entries, keys: entries.map(e => e.key), count: entries.length, total, limit: Number(limit), offset: Number(offset), has_more: Number(offset) + entries.length < total };
    }

    const keys = rows.map(r => r.key);
    return { _engine: 'real', keys, count: keys.length, total, limit: Number(limit), offset: Number(offset), has_more: Number(offset) + keys.length < total };
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
    if (existed) {
      // Protect locked (core) memories from deletion
      if (existing.locked) {
        return { _engine: 'real', error: 'memory_protected', message: 'This memory is protected (locked) and cannot be deleted. Use POST /v1/memory/lock with locked:false to unprotect it first.', key, namespace };
      }
      // Record final value in history before deleting
      histRecord(namespace, key, existing.value, existing.version, Date.now());
      stmts.memDelete.run(namespace, key);
    }
    return { _engine: 'real', deleted: existed, key, namespace };
  }

  // -------------------------------------------------------------------------
  // 6. memory-expire  (alias: memory-ttl-set)
  // -------------------------------------------------------------------------
  function memoryExpire(input) {
    input = input || {};
    const { key, ttl_seconds, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    if (ttl_seconds == null) return { _engine: 'real', error: 'missing_required_field', required: 'ttl_seconds' };
    const now = Date.now();
    const row = stmts.memGet.get(namespace, key);
    if (!row || isExpiredRow(row, now)) return { _engine: 'real', error: 'key_not_found', key, namespace };
    const ttl = Math.max(0, Number(ttl_seconds));
    stmts.memUpdateTtl.run({ ttl, updated: now, namespace, key });
    const result = { _engine: 'real', key, namespace, ttl_seconds: ttl };
    if (ttl > 0) {
      result.expires_at = new Date(row.created + ttl * 1000).toISOString();
    } else {
      result.expires_at = null;
      result.note = 'TTL cleared — key will not expire';
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // 7. memory-bulk-set — set multiple keys atomically
  // -------------------------------------------------------------------------
  function memoryBulkSet(input) {
    input = input || {};
    const { entries = [], namespace = 'default' } = input;
    if (!Array.isArray(entries) || entries.length === 0) {
      return { _engine: 'real', error: 'entries must be a non-empty array of {key, value, tags?, ttl_seconds?}' };
    }
    if (entries.length > 500) {
      return { _engine: 'real', error: 'bulk_too_large', max: 500, provided: entries.length };
    }

    const now = Date.now();
    const stored = [];
    const failed = [];

    const doBulk = db.transaction(() => {
      for (const entry of entries) {
        try {
          const { key, value, tags = [], ttl_seconds, type } = entry;
          if (!key) { failed.push({ entry, reason: 'missing key' }); continue; }
          const existing = stmts.memGet.get(namespace, key);
          const isLive = existing && !isExpiredRow(existing, now);
          if (isLive) histRecord(namespace, key, existing.value, existing.version, now);

          let ttl;
          if (ttl_seconds == null) {
            ttl = (isLive && existing.ttl) ? existing.ttl : 0;
          } else {
            ttl = Math.max(0, Number(ttl_seconds));
          }

          const newVersion = isLive ? (existing.version || 1) + 1 : 1;
          stmts.memUpsert.run({
            namespace,
            key,
            value: _memCompress(JSON.stringify(value)),
            tags: JSON.stringify(Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : [tags]),
            created: isLive ? existing.created : now,
            updated: now,
            ttl,
            version: newVersion,
            type: type || (isLive && existing.type ? existing.type : 'project'),
          });
          stored.push(key);
        } catch (err) {
          failed.push({ entry, reason: err.message });
        }
      }
    });

    doBulk();
    return { _engine: 'real', stored: stored.length, failed: failed.length, keys: stored, errors: failed, namespace };
  }

  // -------------------------------------------------------------------------
  // 8. memory-copy — copy key to another namespace (or rename within namespace)
  // -------------------------------------------------------------------------
  function memoryCopy(input) {
    input = input || {};
    const { key, dest_key, src_namespace = 'default', dest_namespace, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const srcNs = src_namespace || namespace;
    const dstNs = dest_namespace || srcNs;
    const dstKey = dest_key || key;
    const now = Date.now();

    const srcRow = stmts.memGet.get(srcNs, key);
    if (!srcRow || isExpiredRow(srcRow, now)) {
      return { _engine: 'real', error: 'key_not_found', key, namespace: srcNs };
    }

    // Record history at destination if it exists
    const existingDest = stmts.memGet.get(dstNs, dstKey);
    if (existingDest && !isExpiredRow(existingDest, now)) {
      histRecord(dstNs, dstKey, existingDest.value, existingDest.version, now);
    }

    stmts.memCopy.run({ dest_ns: dstNs, dest_key: dstKey, now, src_ns: srcNs, src_key: key });
    return {
      _engine: 'real',
      copied: true,
      src: { namespace: srcNs, key },
      dest: { namespace: dstNs, key: dstKey },
    };
  }

  // -------------------------------------------------------------------------
  // 9. memory-tag-search — search/filter by exact tag(s)
  // -------------------------------------------------------------------------
  function memoryTagSearch(input) {
    input = input || {};
    const { tags, tag, namespace = 'default', limit = 100 } = input;
    const searchTags = tags
      ? (Array.isArray(tags) ? tags : [tags])
      : tag ? [tag] : null;
    if (!searchTags || searchTags.length === 0) {
      return { _engine: 'real', error: 'missing_required_field', required: 'tags (array) or tag (string)' };
    }

    const now = Date.now();
    // Use first tag for SQL filter, then precise-filter in JS for AND semantics
    const rows = stmts.memListByTag.all(namespace, now, likePattern(searchTags[0]));
    const filtered = rows.filter(r => {
      try {
        const rowTags = JSON.parse(r.tags);
        return searchTags.every(t => rowTags.includes(t));
      } catch { return false; }
    }).slice(0, Number(limit));

    const results = filtered.map(r => ({
      key: r.key,
      tags: JSON.parse(r.tags),
      size: r.size,
      updated: new Date(r.updated).toISOString(),
    }));

    return { _engine: 'real', results, count: results.length, tags: searchTags, namespace };
  }

  // -------------------------------------------------------------------------
  // 10. memory-lock — acquire an optimistic lock on a key
  // -------------------------------------------------------------------------
  function memoryLock(input) {
    input = input || {};
    const { key, owner, ttl_seconds = 30, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    if (!owner) return { _engine: 'real', error: 'missing_required_field', required: 'owner' };
    const now = Date.now();

    // Clean expired locks first
    stmts.lockDeleteExpired.run(now);

    const existing = stmts.lockGet.get(namespace, key);
    if (existing) {
      if (existing.expires_at < now) {
        // Expired — delete and allow re-acquire
        stmts.lockDelete.run(namespace, key, existing.owner);
      } else {
        return {
          _engine: 'real',
          acquired: false,
          key,
          namespace,
          locked_by: existing.owner,
          expires_at: new Date(existing.expires_at).toISOString(),
          error: 'lock_held',
        };
      }
    }

    const ttl = Math.max(1, Math.min(Number(ttl_seconds), 3600));
    const expiresAt = now + ttl * 1000;
    stmts.lockInsert.run({ namespace, key, owner, locked_at: now, expires_at: expiresAt });

    return {
      _engine: 'real',
      acquired: true,
      key,
      namespace,
      owner,
      ttl_seconds: ttl,
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // 11. memory-unlock — release a lock
  // -------------------------------------------------------------------------
  function memoryUnlock(input) {
    input = input || {};
    const { key, owner, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    if (!owner) return { _engine: 'real', error: 'missing_required_field', required: 'owner' };

    const existing = stmts.lockGet.get(namespace, key);
    if (!existing) return { _engine: 'real', released: false, key, namespace, reason: 'lock_not_found' };
    if (existing.owner !== owner) {
      return { _engine: 'real', released: false, key, namespace, reason: 'not_owner', locked_by: existing.owner };
    }

    stmts.lockDelete.run(namespace, key, owner);
    return { _engine: 'real', released: true, key, namespace };
  }

  // -------------------------------------------------------------------------
  // 12. memory-increment
  // -------------------------------------------------------------------------
  function memoryIncrement(input) {
    input = input || {};
    const { key, by = 1, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const now = Date.now();

    const doIncrement = db.transaction(() => {
      const row = stmts.memGet.get(namespace, key);
      const isLive = row && !isExpiredRow(row, now);
      const parsedCurrent = isLive ? JSON.parse(_memDecompress(row.value)) : null;
      const current = (isLive && typeof parsedCurrent === 'number') ? parsedCurrent : 0;
      const next = current + Number(by);

      if (isLive) {
        histRecord(namespace, key, row.value, row.version, now);
        stmts.memUpdateValue.run({ value: _memCompress(JSON.stringify(next)), updated: now, namespace, key });
      } else {
        stmts.memUpsert.run({
          namespace, key, value: _memCompress(JSON.stringify(next)),
          tags: JSON.stringify([]), created: now, updated: now, ttl: 0, version: 1,
        });
      }
      return next;
    });

    const next = doIncrement();
    return { _engine: 'real', key, namespace, value: next };
  }

  // -------------------------------------------------------------------------
  // 13. memory-append
  // -------------------------------------------------------------------------
  function memoryAppend(input) {
    input = input || {};
    const { key, item, namespace = 'default', max_length } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const now = Date.now();

    const doAppend = db.transaction(() => {
      const row = stmts.memGet.get(namespace, key);
      const isLive = row && !isExpiredRow(row, now);
      const parsedArr = isLive ? JSON.parse(_memDecompress(row.value)) : null;
      let arr = (isLive && Array.isArray(parsedArr)) ? parsedArr : [];
      arr.push(item);
      if (max_length && arr.length > Number(max_length)) {
        arr = arr.slice(arr.length - Number(max_length));
      }

      if (isLive) {
        histRecord(namespace, key, row.value, row.version, now);
        stmts.memUpdateValue.run({ value: _memCompress(JSON.stringify(arr)), updated: now, namespace, key });
      } else {
        stmts.memUpsert.run({
          namespace, key, value: _memCompress(JSON.stringify(arr)),
          tags: JSON.stringify([]), created: now, updated: now, ttl: 0, version: 1,
        });
      }
      return arr.length;
    });

    const length = doAppend();
    return { _engine: 'real', key, namespace, length };
  }

  // -------------------------------------------------------------------------
  // 14. memory-history
  // -------------------------------------------------------------------------
  function memoryHistory(input) {
    input = input || {};
    const { key, limit = 10, namespace = 'default' } = input;
    if (!key) return { _engine: 'real', error: 'missing_required_field', required: 'key' };
    const rows = stmts.histSelect.all(namespace, key, Math.min(Number(limit), 100));
    const versions = rows.map(r => ({
      value: JSON.parse(_memDecompress(r.value)),
      timestamp: new Date(r.timestamp).toISOString(),
      version: r.version || null,
    }));
    return { _engine: 'real', key, namespace, versions, history: versions, count: versions.length };
  }

  // -------------------------------------------------------------------------
  // 15. memory-export
  // -------------------------------------------------------------------------
  function memoryExport(input) {
    input = input || {};
    const { namespace = 'default', include_meta = false } = input;
    const now = Date.now();
    const rows = stmts.memAll.all(namespace, now);
    const data = {};
    const meta = {};
    for (const r of rows) {
      data[r.key] = JSON.parse(_memDecompress(r.value));
      if (include_meta) {
        meta[r.key] = {
          tags: JSON.parse(r.tags),
          ttl: r.ttl,
          version: r.version || 1,
          type: r.type || 'project',
          created: new Date(r.created).toISOString(),
          updated: new Date(r.updated).toISOString(),
        };
      }
    }
    const result = { _engine: 'real', namespace, data, count: Object.keys(data).length };
    if (include_meta) result.meta = meta;
    return result;
  }

  // -------------------------------------------------------------------------
  // 16. memory-import
  // -------------------------------------------------------------------------
  function memoryImport(input) {
    input = input || {};
    const { data = {}, namespace = 'default', overwrite = true } = input;
    const now = Date.now();

    const doImport = db.transaction(() => {
      let imported = 0, skipped = 0, overwritten = 0;
      for (const [k, v] of Object.entries(data)) {
        const existing = stmts.memGet.get(namespace, k);
        if (existing && !overwrite) { skipped++; continue; }
        if (existing) {
          histRecord(namespace, k, existing.value, existing.version, now);
          overwritten++;
        } else {
          imported++;
        }
        stmts.memUpsert.run({
          namespace,
          key: k,
          value: _memCompress(JSON.stringify(v)),
          tags: existing ? existing.tags : JSON.stringify([]),
          created: existing ? existing.created : now,
          updated: now,
          ttl: existing ? existing.ttl : 0,
          version: existing ? (existing.version || 1) + 1 : 1,
          type: existing ? (existing.type || 'project') : 'project',
        });
      }
      return { imported, skipped, overwritten };
    });

    const stats = doImport();
    return { _engine: 'real', namespace, ...stats, total: stats.imported + stats.overwritten };
  }

  // -------------------------------------------------------------------------
  // 17. memory-stats
  // -------------------------------------------------------------------------
  function memoryStats(input) {
    input = input || {};
    const { namespace = 'default', all_namespaces = false } = input;
    const now = Date.now();

    if (all_namespaces) {
      const nsRows = stmts.memNsList.all();
      const namespaces = nsRows.map(r => ({
        namespace: r.namespace,
        count: r.count,
        last_updated: r.last_updated ? new Date(r.last_updated).toISOString() : null,
      }));
      return { _engine: 'real', namespaces, total_namespaces: namespaces.length };
    }

    const row = stmts.memStats.get(namespace, now);
    // Per-tag breakdown
    const allRows = stmts.memAll.all(namespace, now);
    const tagBreakdown = {};
    for (const r of allRows) {
      try {
        for (const t of JSON.parse(r.tags)) {
          tagBreakdown[t] = (tagBreakdown[t] || 0) + 1;
        }
      } catch {}
    }

    return {
      _engine: 'real',
      namespace,
      count: row.count || 0,
      total_size_bytes: row.total_size_bytes || 0,
      ttl_count: row.ttl_count || 0,
      oldest: row.oldest ? new Date(row.oldest).toISOString() : null,
      newest: row.newest ? new Date(row.newest).toISOString() : null,
      tag_breakdown: tagBreakdown,
    };
  }

  // -------------------------------------------------------------------------
  // 18. memory-namespace-list
  // -------------------------------------------------------------------------
  function memoryNamespaceList() {
    const rows = stmts.memNsList.all();
    const namespaces = rows.map(r => ({
      namespace: r.namespace,
      count: r.count,
      last_updated: r.last_updated ? new Date(r.last_updated).toISOString() : null,
    }));
    return { _engine: 'real', namespaces, names: namespaces.map(r => r.namespace), count: namespaces.length };
  }

  // -------------------------------------------------------------------------
  // 19. memory-namespace-clear
  // -------------------------------------------------------------------------
  function memoryNamespaceClear(input) {
    input = input || {};
    const { namespace, confirm } = input;
    if (!namespace) return { _engine: 'real', error: 'missing_required_field', required: 'namespace' };
    if (confirm !== `clear:${namespace}`) {
      return {
        _engine: 'real',
        error: 'missing_required_field',
        required: 'confirm',
        hint: `pass confirm: "clear:${namespace}"`,
      };
    }
    const doDelete = db.transaction(() => {
      const { count } = db.prepare('SELECT COUNT(*) as count FROM memory WHERE namespace = ?').get(namespace);
      stmts.memNsClear.run(namespace);
      stmts.memNsHistoryClear.run(namespace);
      return count;
    });
    const deleted = doDelete();
    return { _engine: 'real', cleared: true, deleted, namespace };
  }

  // -------------------------------------------------------------------------
  // 20. memory-search-semantic (alias for memory-vector-search with richer output)
  // -------------------------------------------------------------------------
  function memorySearchSemantic(input) {
    input = input || {};
    const { namespace = 'default', query, limit = 10, min_score = 0 } = input;
    if (!query) return { _engine: 'real', error: 'missing_required_field', required: 'query', results: [] };

    const ns = namespace || 'default';
    const now = Date.now();
    const all = stmts.memAll.all(ns, now);

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);

    const scored = all.map(row => {
      const decompVal = _memDecompress(row.value);
      const valText = valueToText(decompVal);
      const text = (valText + ' ' + row.key + ' ' + (row.tags || '[]')).toLowerCase();
      const score = scoreRelevance(query, text);

      // Build match evidence
      const matchedWords = queryWords.filter(w => text.includes(w));
      // Extract snippet around first match
      let snippet = null;
      if (matchedWords.length > 0 && valText.length > 0) {
        const idx = valText.toLowerCase().indexOf(matchedWords[0]);
        if (idx >= 0) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(valText.length, idx + 80);
          snippet = (start > 0 ? '...' : '') + valText.slice(start, end) + (end < valText.length ? '...' : '');
        }
      }

      return {
        key: row.key,
        value: JSON.parse(decompVal),
        tags: JSON.parse(row.tags),
        score,
        matched_words: matchedWords,
        snippet,
      };
    })
    .filter(r => r.score > Number(min_score))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Number(limit), 100));

    return { _engine: 'real', results: scored, count: scored.length, query, namespace: ns };
  }

  // -------------------------------------------------------------------------
  // 21. memory-vector-search (backwards-compat alias)
  // -------------------------------------------------------------------------
  function memoryVectorSearch(input) {
    return memorySearchSemantic(input);
  }

  // -------------------------------------------------------------------------
  // 22. queue-push
  // -------------------------------------------------------------------------
  function queuePush(input) {
    input = input || {};
    const queue = input.queue || input.key || input.name || 'default';
    const item = input.item !== undefined ? input.item : input.value;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    stmts.queueInsert.run(queue, id, JSON.stringify(item), Date.now());
    const { cnt } = stmts.queueSize.get(queue);
    return { _engine: 'real', queue, id, size: cnt };
  }

  // -------------------------------------------------------------------------
  // 23. queue-pop
  // -------------------------------------------------------------------------
  function queuePop(input) {
    input = input || {};
    const queue = input.queue || input.key || input.name || 'default';

    const doPop = db.transaction(() => {
      const row = stmts.queuePopRow.get(queue);
      if (!row) return { item: null, remaining: 0 };
      stmts.queueDelete.run(row.id);
      const { cnt } = stmts.queueSize.get(queue);
      return { item: JSON.parse(row.value), id: row.id, remaining: cnt };
    });

    const result = doPop();
    return { _engine: 'real', queue, ...result };
  }

  // -------------------------------------------------------------------------
  // 24. queue-peek
  // -------------------------------------------------------------------------
  function queuePeek(input) {
    input = input || {};
    const queue = input.queue || input.key || input.name || 'default';
    const row = stmts.queuePeek.get(queue);
    const { cnt } = stmts.queueSize.get(queue);
    return {
      _engine: 'real',
      queue,
      item: row ? JSON.parse(row.value) : null,
      size: cnt,
    };
  }

  // -------------------------------------------------------------------------
  // 25. queue-size
  // -------------------------------------------------------------------------
  function queueSize(input) {
    input = input || {};
    const queue = input.queue || input.key || input.name || 'default';
    const { cnt } = stmts.queueSize.get(queue);
    return { _engine: 'real', queue, size: cnt };
  }

  // -------------------------------------------------------------------------
  // 26. counter-increment
  // -------------------------------------------------------------------------
  function counterIncrement(input) {
    input = input || {};
    const name = input.name || input.key;
    const by = input.by != null ? input.by : (input.amount != null ? input.amount : 1);
    if (!name) return { _engine: 'real', error: 'missing_required_field', required: 'name or key' };
    const delta = Number(by);
    const now = Date.now();
    stmts.counterUpsert.run({ name, value: delta, delta, now });
    const row = stmts.counterGet.get(name);
    return { _engine: 'real', name, value: row.value };
  }

  // -------------------------------------------------------------------------
  // 27. counter-decrement
  // -------------------------------------------------------------------------
  function counterDecrement(input) {
    input = input || {};
    const name = input.name || input.key;
    const by = input.by != null ? input.by : (input.amount != null ? input.amount : 1);
    if (!name) return { _engine: 'real', error: 'missing_required_field', required: 'name or key' };
    const delta = -Math.abs(Number(by));
    const now = Date.now();
    stmts.counterUpsert.run({ name, value: delta, delta, now });
    const row = stmts.counterGet.get(name);
    return { _engine: 'real', name, value: row.value };
  }

  // -------------------------------------------------------------------------
  // 28. counter-get
  // -------------------------------------------------------------------------
  function counterGet(input) {
    input = input || {};
    const name = input.name || input.key;
    if (!name) return { _engine: 'real', error: 'missing_required_field', required: 'name or key' };
    const row = stmts.counterGet.get(name);
    return {
      _engine: 'real',
      name,
      value: row ? row.value : 0,
      created: row ? new Date(row.created).toISOString() : null,
      updated: row ? new Date(row.updated).toISOString() : null,
    };
  }

  // -------------------------------------------------------------------------
  // 29. counter-reset
  // -------------------------------------------------------------------------
  function counterReset(input) {
    input = input || {};
    const name = input.name || input.key;
    const to = input.to != null ? Number(input.to) : 0;
    if (!name) return { _engine: 'real', error: 'missing_required_field', required: 'name or key' };
    const now = Date.now();
    stmts.counterSet.run({ name, value: to, now });
    return { _engine: 'real', name, value: to, reset: true };
  }

  // -------------------------------------------------------------------------
  // 30. memory-time-capsule
  // -------------------------------------------------------------------------
  function memoryTimeCapsule(input) {
    input = input || {};
    const { namespace, key, value, open_after } = input;
    if (!value) return { _engine: 'real', error: 'Provide a value to store' };
    const ns = namespace || 'time-capsules';
    const k = key || 'capsule-' + Date.now().toString(36);
    const openAfterMs = open_after ? new Date(open_after).getTime() : Date.now() + 86400000;
    const now = Date.now();

    stmts.memUpsert.run({
      namespace: ns,
      key: k,
      value: _memCompress(JSON.stringify({
        value,
        sealed_at: new Date().toISOString(),
        opens_at: new Date(openAfterMs).toISOString(),
      })),
      tags: JSON.stringify(['time-capsule']),
      created: now,
      updated: now,
      ttl: 0,
      version: 1,
    });

    return {
      _engine: 'real',
      key: k,
      namespace: ns,
      opens_at: new Date(openAfterMs).toISOString(),
      status: 'sealed',
    };
  }


  // -------------------------------------------------------------------------
  // memory-bulk-get — retrieve multiple keys in one call
  // -------------------------------------------------------------------------
  function memoryBulkGet(input) {
    input = input || {};
    const { keys = [], namespace = 'default' } = input;
    if (!Array.isArray(keys) || keys.length === 0) return { _engine: 'real', results: {}, found: 0, error: 'keys must be a non-empty array' };
    const now = Date.now();
    const results = {};
    for (const key of keys.slice(0, 500)) {
      const row = db.prepare('SELECT key, value, tags, type, locked, version FROM memory WHERE namespace = ? AND key = ?').get(namespace, key);
      if (!row) { results[key] = null; continue; }
      try {
        results[key] = { value: JSON.parse(_memDecompress(row.value)), tags: JSON.parse(row.tags || '[]'), type: row.type || 'project', locked: !!row.locked, version: row.version || 1 };
      } catch(e) { results[key] = { value: row.value, tags: [], type: row.type || 'project' }; }
    }
    return { _engine: 'real', results, found: Object.values(results).filter(v => v !== null).length, namespace };
  }

  // -------------------------------------------------------------------------
  // Handler map
  // -------------------------------------------------------------------------
  return {
    'memory-set':              memorySet,
    'memory-get':              memoryGet,
    'memory-search':           memorySearch,
    'memory-list':             memoryList,
    'memory-delete':           memoryDelete,
    'memory-expire':           memoryExpire,
    'memory-ttl-set':          memoryExpire,          // alias
    'memory-bulk-get':         memoryBulkGet,
    'memory-bulk-set':         memoryBulkSet,
    'memory-copy':             memoryCopy,
    'memory-tag-search':       memoryTagSearch,
    'memory-lock':             memoryLock,
    'memory-unlock':           memoryUnlock,
    'memory-increment':        memoryIncrement,
    'memory-append':           memoryAppend,
    'memory-history':          memoryHistory,
    'memory-export':           memoryExport,
    'memory-import':           memoryImport,
    'memory-stats':            memoryStats,
    'memory-namespace-list':   memoryNamespaceList,
    'memory-namespace-clear':  memoryNamespaceClear,
    'memory-search-semantic':  memorySearchSemantic,
    'memory-vector-search':    memoryVectorSearch,
    'memory-time-capsule':     memoryTimeCapsule,
    'queue-push':              queuePush,
    'queue-pop':               queuePop,
    'queue-peek':              queuePeek,
    'queue-size':              queueSize,
    'counter-increment':       counterIncrement,
    'counter-decrement':       counterDecrement,
    'counter-get':             counterGet,
    'counter-reset':           counterReset,

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

    // ─── MEMORY → GRAPHRAG BRIDGE ───
    // Exports memory namespace into the knowledge_graph table as (subject, predicate, object) triples
    'memory-to-graph': (input) => {
      input = input || {};
      const namespace = input.namespace || 'default';
      const limit = Math.min(parseInt(input.limit) || 50, 200);
      const apiKey = input.api_key || null;

      const nowTs = Date.now();
      const rows = db.prepare('SELECT key, value, tags, type FROM memory WHERE namespace = ? LIMIT ?').all(namespace, limit);

      let inserted = 0;
      const errors = [];
      for (const row of rows) {
        try {
          let valStr = row.value;
          try { const v = JSON.parse(row.value); valStr = typeof v === 'string' ? v : JSON.stringify(v); } catch(_) {}
          const subject = namespace + '/' + row.key;
          const object = String(valStr || '').slice(0, 500);
          if (!subject || !object) continue;
          db.prepare(`INSERT OR IGNORE INTO knowledge_graph (id, api_key, subject, predicate, object, confidence, ts)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(
              require('crypto').randomUUID(),
              apiKey || '',
              subject,
              'memory_entry',
              object,
              0.8,
              Date.now()
            );
          inserted++;
        } catch(e) { errors.push(row.key + ': ' + e.message); }
      }
      return { _engine: 'real', ok: true, namespace, rows_processed: rows.length, triples_inserted: inserted, errors: errors.slice(0, 5) };
    },

    // Scores each memory key in a namespace by importance (recency + access + tag richness + value length + lock)
    'memory-score': (input) => {
      input = input || {};
      const namespace = input.namespace || 'default';
      const now = Date.now();
      const rows = db.prepare('SELECT key, value, tags, created, updated, ttl, locked FROM memory WHERE namespace = ? ORDER BY updated DESC LIMIT 500').all(namespace);
      if (!rows.length) return { _engine: 'real', namespace, scored: [], total: 0 };

      const maxAge = Math.max(...rows.map(r => now - r.created), 1);
      const scored = rows.map(r => {
        const ageDays = (now - (r.updated || r.ts || now)) / 86400000;
        const recency = Math.exp(-0.1 * ageDays);
        let tagRichness = 0;
        try { tagRichness = Math.min(JSON.parse(r.tags || '[]').length * 0.1, 0.5); } catch(_) {}
        const valueScore = Math.min((r.value || '').length / 2000, 0.3);
        const lockBonus = r.locked ? 0.2 : 0;
        const score = Math.round((recency * 0.4 + tagRichness + valueScore + lockBonus) * 1000) / 1000;
        return { key: r.key, score, recency: Math.round(recency * 100) / 100, tag_richness: tagRichness, value_score: valueScore, locked: !!r.locked };
      });
      scored.sort((a, b) => b.score - a.score);
      return { _engine: 'real', namespace, scored, total: scored.length, avg_score: Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length * 1000) / 1000 };
    },

    // Forgets low-scoring memories below a threshold
    'memory-forget': (input) => {
      input = input || {};
      const namespace = input.namespace || 'default';
      const threshold = parseFloat(input.threshold) || 0.1;
      const dryRun = input.dry_run !== false;

      const rows = db.prepare('SELECT key, value, tags, created, updated, locked FROM memory WHERE namespace = ? ORDER BY updated ASC').all(namespace);
      const now = Date.now();
      const toForget = [];

      for (const r of rows) {
        if (r.locked) continue; // never forget locked memories
        const ageDays = (now - (r.updated || r.ts || now)) / 86400000;
        const recency = Math.exp(-0.1 * ageDays);
        let tagRichness = 0;
        try { tagRichness = Math.min(JSON.parse(r.tags || '[]').length * 0.1, 0.5); } catch(_) {}
        const valueScore = Math.min((r.value || '').length / 2000, 0.3);
        const score = recency * 0.4 + tagRichness + valueScore;
        if (score < threshold) toForget.push({ key: r.key, score: Math.round(score * 1000) / 1000 });
      }

      if (!dryRun && toForget.length > 0) {
        const del = db.prepare('DELETE FROM memory WHERE namespace = ? AND key = ?');
        const delMany = db.transaction((items) => { for (const item of items) del.run(namespace, item.key); });
        delMany(toForget);
      }

      return {
        _engine: 'real', namespace, threshold,
        dry_run: dryRun,
        would_forget: toForget.length,
        forgotten: dryRun ? 0 : toForget.length,
        keys: toForget.slice(0, 20).map(k => k.key),
        note: dryRun ? 'Set dry_run:false to actually delete' : `Deleted ${toForget.length} low-score memories`,
      };
    },

    // ─── CONTEXT SESSION (aggregate session context for agents) ───
    'context-session': (input) => {
      try {
        input = input || {};
        const namespace = input.namespace || 'shared';
        const goal = input.goal || null;

        let memoryCount = 0;
        try { memoryCount = db.prepare('SELECT COUNT(*) as cnt FROM memory').get().cnt; } catch(e) {}

        let stateEntries = [];
        try {
          const rows = db.prepare("SELECT key, value FROM agent_state WHERE key LIKE ? || ':%' LIMIT 50").all(namespace);
          stateEntries = rows.map(r => {
            const shortKey = r.key.replace(namespace + ':', '');
            try { return { key: shortKey, ...JSON.parse(r.value) }; } catch(e) { return { key: shortKey, value: r.value }; }
          });
        } catch(e) {}

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
            ts: new Date().toISOString(),
          },
        };
      } catch(e) { return { _engine: 'real', ok: false, error: e.message }; }
    },
  };
};
