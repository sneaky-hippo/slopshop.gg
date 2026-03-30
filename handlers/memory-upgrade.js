'use strict';

const handlers = {};

// In-process score store (survives the lifetime of the Node process)
// key -> { score: number, total_signals: number, last_updated: string }
const _scoreStore = new Map();

// ─── MEMORY SCORE ────────────────────────────────────────────────────────────

handlers['memory-score-update'] = async (input) => {
  const key = String(input.key || '');
  const outcome = String(input.outcome || 'neutral');
  const weight = parseFloat(input.weight) || 1;

  if (!key) return { error: 'key is required' };

  // Try to read from _db if passed (duck-duck for a simple get/set interface)
  const db = input._db || null;
  let current = null;

  if (db && typeof db.get === 'function') {
    try { current = await db.get(`m:score:${key}`); } catch (_) {}
  }

  if (!current && _scoreStore.has(key)) {
    current = _scoreStore.get(key);
  }

  const old_score = current ? current.score : 5; // default start at 5
  const total_signals = current ? current.total_signals + 1 : 1;

  let delta = 0;
  if (outcome === 'success') delta = weight * 0.1;
  else if (outcome === 'failure') delta = -(weight * 0.2);
  // neutral = no change

  const new_score = Math.min(10, Math.max(0, old_score + delta));
  const rounded = Math.round(new_score * 1000) / 1000;
  const last_updated = new Date().toISOString();

  const record = { score: rounded, total_signals, last_updated };

  if (db && typeof db.set === 'function') {
    try { await db.set(`m:score:${key}`, record); } catch (_) {}
  }
  _scoreStore.set(key, record);

  return {
    key,
    old_score: Math.round(old_score * 1000) / 1000,
    new_score: rounded,
    outcome,
    total_signals,
    last_updated,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['memory-score-get'] = async (input) => {
  const key = String(input.key || '');
  if (!key) return { error: 'key is required' };

  const db = input._db || null;
  let record = null;

  if (db && typeof db.get === 'function') {
    try { record = await db.get(`m:score:${key}`); } catch (_) {}
  }

  if (!record && _scoreStore.has(key)) {
    record = _scoreStore.get(key);
  }

  const score = record ? record.score : 5;
  const total_signals = record ? record.total_signals : 0;
  const last_updated = record ? record.last_updated : null;

  let grade;
  if (score >= 8) grade = 'A';
  else if (score >= 6) grade = 'B';
  else if (score >= 4) grade = 'C';
  else if (score >= 2) grade = 'D';
  else grade = 'F';

  return { key, score: Math.round(score * 1000) / 1000, grade, total_signals, last_updated };
};

// ─── MEMORY DRIFT ────────────────────────────────────────────────────────────

handlers['memory-drift-detect'] = async (input) => {
  const threshold_days = parseInt(input.threshold_days) || 30;
  const namespace = String(input.namespace || 'default');

  // Accept an optional array of {key, last_updated} for real analysis
  const key_data = Array.isArray(input.key_data) ? input.key_data : [];

  const now = Date.now();
  const threshold_ms = threshold_days * 24 * 60 * 60 * 1000;

  let recent_keys = 0;
  let stale_keys = 0;

  for (const item of key_data) {
    const ts = item.last_updated ? new Date(item.last_updated).getTime() : 0;
    const age_ms = now - ts;
    if (age_ms <= threshold_ms) recent_keys++;
    else stale_keys++;
  }

  const total_keys = key_data.length;

  // Drift score: 0 = all recent, 100 = all stale
  const drift_score = total_keys > 0 ? Math.round((stale_keys / total_keys) * 100) : 0;

  let recommendation;
  if (drift_score >= 75) recommendation = `High drift detected (${drift_score}%) — consider pruning stale entries or refreshing frequently-used patterns`;
  else if (drift_score >= 40) recommendation = `Moderate drift (${drift_score}%) — review stale keys for relevance`;
  else recommendation = `Low drift (${drift_score}%) — memory patterns are relatively fresh`;

  return {
    namespace,
    threshold_days,
    total_keys,
    recent_keys,
    stale_keys,
    drift_score,
    recommendation,
  };
};

// ─── MEMORY CLUSTER ──────────────────────────────────────────────────────────

handlers['memory-cluster'] = async (input) => {
  const keys_data = Array.isArray(input.keys) ? input.keys : [];

  // Group by key prefix (split on : - _) then by value length bucket
  const clusters = new Map();

  for (const item of keys_data) {
    const key = String(item.key || '');
    const value = String(item.value || '');

    // Extract prefix: first segment before : - or _
    const prefix_match = key.match(/^([a-zA-Z0-9]+)/);
    const prefix = prefix_match ? prefix_match[1] : 'misc';

    // Value length bucket
    const len = value.length;
    const size_bucket = len === 0 ? 'empty' : len < 50 ? 'small' : len < 200 ? 'medium' : 'large';

    const cluster_label = `${prefix}:${size_bucket}`;

    if (!clusters.has(cluster_label)) {
      clusters.set(cluster_label, { keys: [], values: [], lengths: [] });
    }
    const c = clusters.get(cluster_label);
    c.keys.push(key);
    c.values.push(value);
    c.lengths.push(len);
  }

  const result_clusters = [];
  for (const [label, data] of clusters.entries()) {
    const avg_value_length = data.lengths.length > 0
      ? Math.round(data.lengths.reduce((a, b) => a + b, 0) / data.lengths.length)
      : 0;
    // Representative key: shortest key in cluster
    const representative_key = data.keys.reduce((a, b) => a.length <= b.length ? a : b, data.keys[0] || '');
    result_clusters.push({
      label,
      keys: data.keys,
      avg_value_length,
      representative_key,
    });
  }

  // Sort clusters by size descending
  result_clusters.sort((a, b) => b.keys.length - a.keys.length);

  return { clusters: result_clusters, cluster_count: result_clusters.length };
};

// ─── KNOWLEDGE GRAPH ─────────────────────────────────────────────────────────

handlers['memory-knowledge-graph'] = async (input) => {
  const entries = Array.isArray(input.entries) ? input.entries : [];

  const nodes = entries.map((e, i) => ({
    id: String(e.key || i),
    label: String(e.key || `node_${i}`),
    type: Array.isArray(e.tags) && e.tags.length > 0 ? e.tags[0] : 'memory',
  }));

  const edges = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const aKey = String(a.key || '');
      const bKey = String(b.key || '');

      // Shared key prefix (first segment)
      const aPrefix = aKey.split(/[:\-_]/)[0];
      const bPrefix = bKey.split(/[:\-_]/)[0];
      if (aPrefix && aPrefix === bPrefix && aPrefix.length > 1) {
        edges.push({ from: aKey, to: bKey, relation: 'shared_prefix', strength: 0.7 });
        continue;
      }

      // Shared tags
      const aTags = Array.isArray(a.tags) ? a.tags : [];
      const bTags = Array.isArray(b.tags) ? b.tags : [];
      const sharedTags = aTags.filter(t => bTags.includes(t));
      if (sharedTags.length > 0) {
        edges.push({ from: aKey, to: bKey, relation: `shared_tag:${sharedTags[0]}`, strength: 0.5 * sharedTags.length });
        continue;
      }

      // Value text overlap (shared significant words)
      const aWords = new Set(String(a.value || '').toLowerCase().split(/\s+/).filter(w => w.length > 4));
      const bWords = String(b.value || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const sharedWords = bWords.filter(w => aWords.has(w));
      if (sharedWords.length >= 3) {
        edges.push({ from: aKey, to: bKey, relation: 'value_overlap', strength: Math.min(1, sharedWords.length * 0.15) });
      }
    }
  }

  // Graph density = actual edges / max possible edges
  const max_edges = nodes.length > 1 ? (nodes.length * (nodes.length - 1)) / 2 : 1;
  const graph_density = Math.round((edges.length / max_edges) * 1000) / 1000;

  return { nodes, edges, graph_density };
};

// ─── MEMORY TIMELINE ─────────────────────────────────────────────────────────

handlers['memory-timeline'] = async (input) => {
  const events = Array.isArray(input.events) ? input.events : [];

  if (events.length === 0) {
    return { timeline: [], peak_period: null, total_span_hours: 0 };
  }

  // Parse and sort events by timestamp
  const parsed = events
    .map(e => ({ ...e, _ts: new Date(e.timestamp || 0).getTime() }))
    .filter(e => !isNaN(e._ts))
    .sort((a, b) => a._ts - b._ts);

  if (parsed.length === 0) {
    return { timeline: [], peak_period: null, total_span_hours: 0 };
  }

  const first_ts = parsed[0]._ts;
  const last_ts = parsed[parsed.length - 1]._ts;
  const total_span_ms = last_ts - first_ts;
  const total_span_hours = Math.round(total_span_ms / 3600000 * 100) / 100;

  // Choose bucket size: hourly if span <= 48h, daily otherwise
  const bucket_ms = total_span_hours <= 48 ? 3600000 : 86400000;
  const bucket_label = bucket_ms === 3600000 ? 'hour' : 'day';

  const buckets = new Map();
  for (const e of parsed) {
    const bucket_start = Math.floor(e._ts / bucket_ms) * bucket_ms;
    if (!buckets.has(bucket_start)) buckets.set(bucket_start, []);
    buckets.get(bucket_start).push(e);
  }

  const timeline = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucket_start, evts]) => ({
      bucket: bucket_label,
      start: new Date(bucket_start).toISOString(),
      end: new Date(bucket_start + bucket_ms).toISOString(),
      event_count: evts.length,
      keys: evts.map(e => e.key),
    }));

  const peak = timeline.reduce((a, b) => b.event_count > a.event_count ? b : a, timeline[0]);

  return {
    timeline,
    peak_period: peak ? { start: peak.start, end: peak.end, event_count: peak.event_count } : null,
    total_span_hours,
  };
};

// ─── MEMORY IMPORTANCE RANK ───────────────────────────────────────────────────

handlers['memory-importance-rank'] = async (input) => {
  const entries = Array.isArray(input.entries) ? input.entries : [];

  const ranked = entries.map(e => {
    const access_count = parseFloat(e.access_count) || 1;
    const age_days = parseFloat(e.age_days) || 0;
    const value = String(e.value || '');

    const recency_score = Math.max(0, 1 - age_days / 30);
    const size_score = Math.min(1, value.length / 500);
    const importance_score = (access_count * 0.4) + (recency_score * 0.4) + (size_score * 0.2);

    return {
      key: e.key,
      value: e.value,
      importance_score: Math.round(importance_score * 10000) / 10000,
      access_count,
      age_days,
      recency_score: Math.round(recency_score * 1000) / 1000,
      size_score: Math.round(size_score * 1000) / 1000,
    };
  }).sort((a, b) => b.importance_score - a.importance_score)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return {
    ranked,
    top_5: ranked.slice(0, 5),
    total: ranked.length,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = handlers;
