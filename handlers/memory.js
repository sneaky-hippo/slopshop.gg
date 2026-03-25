'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// File-based persistence helpers
// ---------------------------------------------------------------------------
const DATA = path.join(__dirname, '..', '.data');

function ensureDir() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
}

function load(file, fallback) {
  ensureDir();
  const p = path.join(DATA, file);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}

function save(file, data) {
  ensureDir();
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Memory helpers
// ---------------------------------------------------------------------------
function memFile(namespace) { return `mem-${namespace}.json`; }

function loadMem(namespace) {
  return load(memFile(namespace), {});
}

function saveMem(namespace, data) {
  save(memFile(namespace), data);
}

function isExpired(entry) {
  if (!entry || entry.expires_at == null) return false;
  return Date.now() > entry.expires_at;
}

// ---------------------------------------------------------------------------
// 1. memory-set
// ---------------------------------------------------------------------------
function memorySet(input) {
  const { key, value, tags = [], namespace = 'default' } = input;
  if (!key) throw new Error('key is required');
  const mem = loadMem(namespace);
  const prev = mem[key];
  const versions = (prev && Array.isArray(prev._versions)) ? prev._versions : [];
  if (prev) {
    versions.push({ value: prev.value, timestamp: prev.updated_at || prev.created_at });
    if (versions.length > 50) versions.splice(0, versions.length - 50);
  }
  const now = Date.now();
  mem[key] = {
    value,
    tags,
    created_at: (prev && prev.created_at) ? prev.created_at : now,
    updated_at: now,
    expires_at: (prev && prev.expires_at != null) ? prev.expires_at : null,
    _versions: versions,
  };
  saveMem(namespace, mem);
  return { _engine: 'real', key, status: 'stored' };
}

// ---------------------------------------------------------------------------
// 2. memory-get
// ---------------------------------------------------------------------------
function memoryGet(input) {
  const { key, namespace = 'default' } = input;
  if (!key) throw new Error('key is required');
  const mem = loadMem(namespace);
  const entry = mem[key];
  if (!entry || isExpired(entry)) {
    if (entry && isExpired(entry)) {
      delete mem[key];
      saveMem(namespace, mem);
    }
    return { _engine: 'real', key, value: null, found: false, tags: [] };
  }
  return { _engine: 'real', key, value: entry.value, found: true, tags: entry.tags || [] };
}

// ---------------------------------------------------------------------------
// 3. memory-search
// ---------------------------------------------------------------------------
function memorySearch(input) {
  const { query = '', namespace = 'default' } = input;
  const mem = loadMem(namespace);
  const q = String(query).toLowerCase();
  const results = [];
  for (const [k, entry] of Object.entries(mem)) {
    if (isExpired(entry)) continue;
    const keyMatch = k.toLowerCase().includes(q);
    const valMatch = JSON.stringify(entry.value).toLowerCase().includes(q);
    const tagMatch = (entry.tags || []).some(t => String(t).toLowerCase().includes(q));
    if (keyMatch || valMatch || tagMatch) {
      results.push({ key: k, value: entry.value, tags: entry.tags || [] });
    }
  }
  return { _engine: 'real', results, count: results.length };
}

// ---------------------------------------------------------------------------
// 4. memory-list
// ---------------------------------------------------------------------------
function memoryList(input) {
  const { namespace = 'default', tag } = input;
  const mem = loadMem(namespace);
  let keys = [];
  for (const [k, entry] of Object.entries(mem)) {
    if (isExpired(entry)) continue;
    if (tag != null) {
      if ((entry.tags || []).includes(tag)) keys.push(k);
    } else {
      keys.push(k);
    }
  }
  return { _engine: 'real', keys, count: keys.length };
}

// ---------------------------------------------------------------------------
// 5. memory-delete
// ---------------------------------------------------------------------------
function memoryDelete(input) {
  const { key, namespace = 'default' } = input;
  if (!key) throw new Error('key is required');
  const mem = loadMem(namespace);
  const existed = key in mem;
  delete mem[key];
  saveMem(namespace, mem);
  return { _engine: 'real', deleted: existed };
}

// ---------------------------------------------------------------------------
// 6. memory-expire
// ---------------------------------------------------------------------------
function memoryExpire(input) {
  const { key, ttl_seconds, namespace = 'default' } = input;
  if (!key) throw new Error('key is required');
  if (ttl_seconds == null) throw new Error('ttl_seconds is required');
  const mem = loadMem(namespace);
  if (!mem[key]) throw new Error(`Key "${key}" not found`);
  const expires_at = Date.now() + Number(ttl_seconds) * 1000;
  mem[key].expires_at = expires_at;
  saveMem(namespace, mem);
  return { _engine: 'real', key, expires_at };
}

// ---------------------------------------------------------------------------
// 7. memory-increment
// ---------------------------------------------------------------------------
function memoryIncrement(input) {
  const { key, by = 1, namespace = 'default' } = input;
  if (!key) throw new Error('key is required');
  const mem = loadMem(namespace);
  const entry = mem[key];
  const current = (entry && !isExpired(entry) && typeof entry.value === 'number') ? entry.value : 0;
  const next = current + Number(by);
  const now = Date.now();
  const versions = (entry && Array.isArray(entry._versions)) ? entry._versions : [];
  if (entry) {
    versions.push({ value: entry.value, timestamp: entry.updated_at || entry.created_at });
    if (versions.length > 50) versions.splice(0, versions.length - 50);
  }
  mem[key] = {
    value: next,
    tags: (entry && entry.tags) ? entry.tags : [],
    created_at: (entry && entry.created_at) ? entry.created_at : now,
    updated_at: now,
    expires_at: (entry && entry.expires_at != null) ? entry.expires_at : null,
    _versions: versions,
  };
  saveMem(namespace, mem);
  return { _engine: 'real', key, value: next };
}

// ---------------------------------------------------------------------------
// 8. memory-append
// ---------------------------------------------------------------------------
function memoryAppend(input) {
  const { key, item, namespace = 'default' } = input;
  if (!key) throw new Error('key is required');
  const mem = loadMem(namespace);
  const entry = mem[key];
  const arr = (entry && !isExpired(entry) && Array.isArray(entry.value)) ? entry.value : [];
  arr.push(item);
  const now = Date.now();
  const versions = (entry && Array.isArray(entry._versions)) ? entry._versions : [];
  if (entry) {
    versions.push({ value: entry.value, timestamp: entry.updated_at || entry.created_at });
    if (versions.length > 50) versions.splice(0, versions.length - 50);
  }
  mem[key] = {
    value: arr,
    tags: (entry && entry.tags) ? entry.tags : [],
    created_at: (entry && entry.created_at) ? entry.created_at : now,
    updated_at: now,
    expires_at: (entry && entry.expires_at != null) ? entry.expires_at : null,
    _versions: versions,
  };
  saveMem(namespace, mem);
  return { _engine: 'real', key, length: arr.length };
}

// ---------------------------------------------------------------------------
// 9. memory-history
// ---------------------------------------------------------------------------
function memoryHistory(input) {
  const { key, limit = 10, namespace = 'default' } = input;
  if (!key) throw new Error('key is required');
  const mem = loadMem(namespace);
  const entry = mem[key];
  if (!entry || isExpired(entry)) return { _engine: 'real', versions: [] };
  const versions = (entry._versions || []).slice(-Number(limit));
  return { _engine: 'real', versions };
}

// ---------------------------------------------------------------------------
// 10. memory-export
// ---------------------------------------------------------------------------
function memoryExport(input) {
  const { namespace = 'default' } = input;
  const mem = loadMem(namespace);
  const data = {};
  for (const [k, entry] of Object.entries(mem)) {
    if (!isExpired(entry)) data[k] = entry.value;
  }
  return { _engine: 'real', data, count: Object.keys(data).length };
}

// ---------------------------------------------------------------------------
// 11. memory-import
// ---------------------------------------------------------------------------
function memoryImport(input) {
  const { data = {}, namespace = 'default' } = input;
  const mem = loadMem(namespace);
  const now = Date.now();
  let count = 0;
  for (const [k, v] of Object.entries(data)) {
    const existing = mem[k];
    const versions = (existing && Array.isArray(existing._versions)) ? existing._versions : [];
    if (existing) {
      versions.push({ value: existing.value, timestamp: existing.updated_at || existing.created_at });
      if (versions.length > 50) versions.splice(0, versions.length - 50);
    }
    mem[k] = {
      value: v,
      tags: (existing && existing.tags) ? existing.tags : [],
      created_at: (existing && existing.created_at) ? existing.created_at : now,
      updated_at: now,
      expires_at: null,
      _versions: versions,
    };
    count++;
  }
  saveMem(namespace, mem);
  return { _engine: 'real', imported: count };
}

// ---------------------------------------------------------------------------
// 12. memory-stats
// ---------------------------------------------------------------------------
function memoryStats(input) {
  const { namespace = 'default' } = input;
  const mem = loadMem(namespace);
  let count = 0;
  let oldest = null;
  let newest = null;
  for (const [, entry] of Object.entries(mem)) {
    if (isExpired(entry)) continue;
    count++;
    if (oldest == null || entry.created_at < oldest) oldest = entry.created_at;
    if (newest == null || entry.created_at > newest) newest = entry.created_at;
  }
  const raw = JSON.stringify(mem);
  const total_size_bytes = Buffer.byteLength(raw, 'utf8');
  return {
    _engine: 'real',
    count,
    total_size_bytes,
    oldest: oldest ? new Date(oldest).toISOString() : null,
    newest: newest ? new Date(newest).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// 13. memory-namespace-list
// ---------------------------------------------------------------------------
function memoryNamespaceList() {
  ensureDir();
  let files;
  try { files = fs.readdirSync(DATA); } catch (e) { files = []; }
  const namespaces = files
    .filter(f => f.startsWith('mem-') && f.endsWith('.json'))
    .map(f => f.slice(4, -5));
  return { _engine: 'real', namespaces, count: namespaces.length };
}

// ---------------------------------------------------------------------------
// 14. memory-namespace-clear
// ---------------------------------------------------------------------------
function memoryNamespaceClear(input) {
  const { namespace } = input;
  if (!namespace) throw new Error('namespace is required');
  const p = path.join(DATA, memFile(namespace));
  let cleared = false;
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    cleared = true;
  }
  return { _engine: 'real', cleared };
}

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------
function queueFile(name) { return `queue-${name}.json`; }
function loadQueue(name) { return load(queueFile(name), []); }
function saveQueue(name, arr) { save(queueFile(name), arr); }

// ---------------------------------------------------------------------------
// 15. queue-push
// ---------------------------------------------------------------------------
function queuePush(input) {
  const { queue = 'default', item } = input;
  const arr = loadQueue(queue);
  arr.push(item);
  saveQueue(queue, arr);
  return { _engine: 'real', queue, size: arr.length };
}

// ---------------------------------------------------------------------------
// 16. queue-pop
// ---------------------------------------------------------------------------
function queuePop(input) {
  const { queue = 'default' } = input;
  const arr = loadQueue(queue);
  if (arr.length === 0) return { _engine: 'real', item: null, remaining: 0 };
  const item = arr.shift();
  saveQueue(queue, arr);
  return { _engine: 'real', item, remaining: arr.length };
}

// ---------------------------------------------------------------------------
// 17. queue-peek
// ---------------------------------------------------------------------------
function queuePeek(input) {
  const { queue = 'default' } = input;
  const arr = loadQueue(queue);
  return { _engine: 'real', item: arr[0] !== undefined ? arr[0] : null, size: arr.length };
}

// ---------------------------------------------------------------------------
// 18. queue-size
// ---------------------------------------------------------------------------
function queueSize(input) {
  const { queue = 'default' } = input;
  const arr = loadQueue(queue);
  return { _engine: 'real', size: arr.length };
}

// ---------------------------------------------------------------------------
// Counter helpers
// ---------------------------------------------------------------------------
const COUNTERS_FILE = 'counters.json';
function loadCounters() { return load(COUNTERS_FILE, {}); }
function saveCounters(data) { save(COUNTERS_FILE, data); }

// ---------------------------------------------------------------------------
// 19. counter-increment
// ---------------------------------------------------------------------------
function counterIncrement(input) {
  const { name, by = 1 } = input;
  if (!name) throw new Error('name is required');
  const counters = loadCounters();
  counters[name] = (counters[name] || 0) + Number(by);
  saveCounters(counters);
  return { _engine: 'real', name, value: counters[name] };
}

// ---------------------------------------------------------------------------
// 20. counter-get
// ---------------------------------------------------------------------------
function counterGet(input) {
  const { name } = input;
  if (!name) throw new Error('name is required');
  const counters = loadCounters();
  return { _engine: 'real', name, value: counters[name] || 0 };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  'memory-set':              memorySet,
  'memory-get':              memoryGet,
  'memory-search':           memorySearch,
  'memory-list':             memoryList,
  'memory-delete':           memoryDelete,
  'memory-expire':           memoryExpire,
  'memory-increment':        memoryIncrement,
  'memory-append':           memoryAppend,
  'memory-history':          memoryHistory,
  'memory-export':           memoryExport,
  'memory-import':           memoryImport,
  'memory-stats':            memoryStats,
  'memory-namespace-list':   memoryNamespaceList,
  'memory-namespace-clear':  memoryNamespaceClear,
  'queue-push':              queuePush,
  'queue-pop':               queuePop,
  'queue-peek':              queuePeek,
  'queue-size':              queueSize,
  'counter-increment':       counterIncrement,
  'counter-get':             counterGet,
};
