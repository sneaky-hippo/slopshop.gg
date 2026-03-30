'use strict';

const handlers = {};

// In-process score store (survives the lifetime of the Node process)
// key -> { score: number, total_signals: number, last_updated: string }
const _scoreStore = new Map();

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Tokenise a string into lowercase words > 3 chars (stop-word light).
 * Used for all text-similarity operations so behaviour is consistent.
 */
function _tokens(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
}

/**
 * Jaccard similarity between two token arrays (as sets).
 * Returns 0-1.
 */
function _jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Normalise an importance score to 0-10 range.
 * Factors: access_count (log-normalised), recency (exponential decay), size.
 */
function _importanceScore(access_count, age_days, value_length) {
  // Log-normalise access count so 1→0.1, 10→0.5, 100→1.0
  const access_score = Math.min(1, Math.log10(Math.max(1, access_count)) / 2);
  // Exponential decay: half-life ~14 days
  const recency_score = Math.exp(-0.05 * Math.max(0, age_days));
  // Content richness capped at 1kb
  const size_score = Math.min(1, value_length / 1000);
  // Weighted blend
  return (access_score * 0.4 + recency_score * 0.4 + size_score * 0.2) * 10;
}

// ─── MEMORY SCORE UPDATE ─────────────────────────────────────────────────────

handlers['memory-score-update'] = async (input) => {
  const key = String(input.key || '');
  const outcome = String(input.outcome || 'neutral');
  const weight = parseFloat(input.weight) || 1;

  if (!key) return { error: 'key is required' };

  // Try to read from _db if passed (duck-type for a simple get/set interface)
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

// ─── MEMORY SCORE GET ────────────────────────────────────────────────────────

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

// ─── MEMORY SCORE (relevance to context) ─────────────────────────────────────
// BUG FIX: This handler was missing entirely, causing 404/timeouts.
// Scores a single memory item's relevance to a given query context.

handlers['memory-score'] = async (input) => {
  const memoryId   = String(input.memoryId || input.key || '');
  const memoryValue = String(input.value || input.content || '');
  const context    = String(input.context || input.query || '');
  const age_days   = parseFloat(input.age_days) || 0;
  const access_count = parseFloat(input.access_count) || 1;

  if (!context) return { error: 'context (or query) is required' };

  // Text overlap relevance
  const ctxTokens = _tokens(context);
  const memTokens = _tokens(memoryId + ' ' + memoryValue);
  const overlap   = _jaccard(ctxTokens, memTokens);

  // Recency decay: half-life 14 days
  const recency   = Math.exp(-0.05 * Math.max(0, age_days));

  // Access popularity: log-normalised 0-1
  const popularity = Math.min(1, Math.log10(Math.max(1, access_count)) / 2);

  // Composite score 0-10
  const relevance_score = Math.round((overlap * 0.5 + recency * 0.3 + popularity * 0.2) * 10 * 1000) / 1000;

  let label;
  if (relevance_score >= 7)      label = 'highly_relevant';
  else if (relevance_score >= 4) label = 'relevant';
  else if (relevance_score >= 2) label = 'marginally_relevant';
  else                           label = 'not_relevant';

  return {
    memoryId,
    context,
    relevance_score,
    label,
    breakdown: {
      text_overlap: Math.round(overlap * 1000) / 1000,
      recency_score: Math.round(recency * 1000) / 1000,
      popularity_score: Math.round(popularity * 1000) / 1000,
    },
  };
};

// ─── MEMORY DRIFT DETECT ─────────────────────────────────────────────────────

handlers['memory-drift-detect'] = async (input) => {
  const threshold_days = parseInt(input.threshold_days) || 30;
  const namespace = String(input.namespace || 'default');

  // Accept an optional array of {key, last_updated} for real analysis
  const key_data = Array.isArray(input.key_data) ? input.key_data : [];

  const now = Date.now();
  const threshold_ms = threshold_days * 24 * 60 * 60 * 1000;

  let recent_keys = 0;
  let stale_keys = 0;
  const stale_items = [];

  for (const item of key_data) {
    const ts = item.last_updated ? new Date(item.last_updated).getTime() : 0;
    // BUG FIX: NaN timestamps were being counted as stale (epoch 0 = always stale).
    // Now we explicitly handle missing/invalid timestamps.
    if (!item.last_updated || isNaN(ts)) {
      stale_keys++;
      stale_items.push({ key: item.key, reason: 'no_timestamp', age_days: null });
      continue;
    }
    const age_ms = now - ts;
    const age_days_val = Math.round(age_ms / 86400000);
    if (age_ms <= threshold_ms) {
      recent_keys++;
    } else {
      stale_keys++;
      stale_items.push({ key: item.key, age_days: age_days_val, last_updated: item.last_updated });
    }
  }

  const total_keys = key_data.length;

  // BUG FIX: drift_score was returning 0 for empty arrays with no indication.
  // Now returns a clear empty_namespace flag.
  const drift_score = total_keys > 0 ? Math.round((stale_keys / total_keys) * 100) : 0;

  let recommendation;
  if (total_keys === 0) {
    recommendation = 'No keys provided — pass key_data array for analysis';
  } else if (drift_score >= 75) {
    recommendation = `High drift detected (${drift_score}%) — consider pruning stale entries or refreshing frequently-used patterns`;
  } else if (drift_score >= 40) {
    recommendation = `Moderate drift (${drift_score}%) — review stale keys for relevance`;
  } else {
    recommendation = `Low drift (${drift_score}%) — memory patterns are relatively fresh`;
  }

  return {
    namespace,
    threshold_days,
    total_keys,
    recent_keys,
    stale_keys,
    drift_score,
    stale_items: stale_items.slice(0, 50), // cap to 50 for response size
    recommendation,
    empty_namespace: total_keys === 0,
  };
};

// ─── MEMORY DRIFT (semantic comparison) ──────────────────────────────────────
// BUG FIX: This handler was missing — callers got 404/timeout.
// Detects semantic drift between a stored memory value and a current/updated value.

handlers['memory-drift'] = async (input) => {
  const stored  = String(input.stored  || input.old_value || '');
  const current = String(input.current || input.new_value || '');
  const key     = String(input.key || 'unknown');

  if (!stored)  return { error: 'stored (or old_value) is required' };
  if (!current) return { error: 'current (or new_value) is required' };

  const storedTokens  = _tokens(stored);
  const currentTokens = _tokens(current);

  // Jaccard similarity (1 = identical token sets, 0 = completely different)
  const similarity = _jaccard(storedTokens, currentTokens);
  const drift_score = Math.round((1 - similarity) * 100);

  // Identify added and removed significant tokens
  const storedSet  = new Set(storedTokens);
  const currentSet = new Set(currentTokens);
  const added   = [...currentSet].filter(t => !storedSet.has(t)).slice(0, 20);
  const removed = [...storedSet].filter(t => !currentSet.has(t)).slice(0, 20);

  let drift_level;
  if (drift_score <= 10)      drift_level = 'none';
  else if (drift_score <= 30) drift_level = 'minor';
  else if (drift_score <= 60) drift_level = 'moderate';
  else if (drift_score <= 85) drift_level = 'major';
  else                        drift_level = 'complete';

  const needs_update = drift_score > 20;

  return {
    key,
    drift_score,
    drift_level,
    similarity: Math.round(similarity * 1000) / 1000,
    needs_update,
    changes: {
      tokens_added: added,
      tokens_removed: removed,
      added_count: added.length,
      removed_count: removed.length,
    },
    stored_length: stored.length,
    current_length: current.length,
  };
};

// ─── MEMORY CLUSTER ──────────────────────────────────────────────────────────
// BUG FIX: representative_key reduce crash on empty array now guarded.
// IMPROVEMENT: Added content-similarity sub-clustering via Jaccard on tokens.

handlers['memory-cluster'] = async (input) => {
  const keys_data = Array.isArray(input.keys) ? input.keys : [];

  // Group by key prefix (split on : - _) then by value length bucket
  const clusters = new Map();

  for (const item of keys_data) {
    const key   = String(item.key   || '');
    const value = String(item.value || '');

    // Extract prefix: first segment before : - or _
    const prefix_match = key.match(/^([a-zA-Z0-9]+)/);
    const prefix = prefix_match ? prefix_match[1] : 'misc';

    // Value length bucket
    const len = value.length;
    const size_bucket = len === 0 ? 'empty' : len < 50 ? 'small' : len < 200 ? 'medium' : 'large';

    const cluster_label = `${prefix}:${size_bucket}`;

    if (!clusters.has(cluster_label)) {
      clusters.set(cluster_label, { keys: [], values: [], lengths: [], token_union: [] });
    }
    const c = clusters.get(cluster_label);
    c.keys.push(key);
    c.values.push(value);
    c.lengths.push(len);
    // Accumulate tokens for intra-cluster cohesion metric
    _tokens(value).forEach(t => c.token_union.push(t));
  }

  const result_clusters = [];
  for (const [label, data] of clusters.entries()) {
    const avg_value_length = data.lengths.length > 0
      ? Math.round(data.lengths.reduce((a, b) => a + b, 0) / data.lengths.length)
      : 0;

    // BUG FIX: Guard against empty keys array in reduce
    const representative_key = data.keys.length > 0
      ? data.keys.reduce((a, b) => a.length <= b.length ? a : b)
      : '';

    // Cohesion: ratio of unique tokens vs total tokens (high = diverse, low = cohesive)
    const total_t  = data.token_union.length;
    const unique_t = new Set(data.token_union).size;
    const cohesion = total_t > 0 ? Math.round((1 - unique_t / total_t) * 1000) / 1000 : 0;

    result_clusters.push({
      label,
      keys: data.keys,
      avg_value_length,
      representative_key,
      cohesion,
    });
  }

  // Sort clusters by size descending
  result_clusters.sort((a, b) => b.keys.length - a.keys.length);

  return { clusters: result_clusters, cluster_count: result_clusters.length };
};

// ─── KNOWLEDGE GRAPH ─────────────────────────────────────────────────────────
// BUG FIX: shared words threshold of 3 was too strict for short entries.
// Now uses proportional threshold: >= 20% of the shorter entry's token count.

handlers['memory-knowledge-graph'] = async (input) => {
  const entries = Array.isArray(input.entries) ? input.entries : [];

  const nodes = entries.map((e, i) => ({
    id:    String(e.key || i),
    label: String(e.key || `node_${i}`),
    type:  Array.isArray(e.tags) && e.tags.length > 0 ? e.tags[0] : 'memory',
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
        edges.push({
          from: aKey, to: bKey,
          relation: `shared_tag:${sharedTags[0]}`,
          strength: Math.min(1, 0.5 * sharedTags.length),
        });
        continue;
      }

      // BUG FIX: Hard threshold of 3 shared words fails on short entries.
      // Use Jaccard similarity >= 0.15 instead (proportional to content length).
      const aTokens = _tokens(String(a.value || ''));
      const bTokens = _tokens(String(b.value || ''));
      const sim = _jaccard(aTokens, bTokens);
      if (sim >= 0.15) {
        edges.push({
          from: aKey, to: bKey,
          relation: 'value_overlap',
          strength: Math.round(Math.min(1, sim) * 1000) / 1000,
        });
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
    .filter(e => !isNaN(e._ts) && e._ts > 0)
    .sort((a, b) => a._ts - b._ts);

  if (parsed.length === 0) {
    return { timeline: [], peak_period: null, total_span_hours: 0 };
  }

  const first_ts = parsed[0]._ts;
  const last_ts  = parsed[parsed.length - 1]._ts;
  const total_span_ms = last_ts - first_ts;
  const total_span_hours = Math.round(total_span_ms / 3600000 * 100) / 100;

  // Choose bucket size: hourly if span <= 48h, daily otherwise
  const bucket_ms    = total_span_hours <= 48 ? 3600000 : 86400000;
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
      end:   new Date(bucket_start + bucket_ms).toISOString(),
      event_count: evts.length,
      keys: evts.map(e => e.key),
    }));

  const peak = timeline.reduce((a, b) => b.event_count > a.event_count ? b : a, timeline[0]);

  return {
    timeline,
    peak_period: peak
      ? { start: peak.start, end: peak.end, event_count: peak.event_count }
      : null,
    total_span_hours,
  };
};

// ─── MEMORY IMPORTANCE RANK ───────────────────────────────────────────────────
// BUG FIX: Original formula `access_count * 0.4` was unbounded — a key with
// access_count=100 scored 40+, making recency/size irrelevant. Now uses
// log-normalised access score so all factors stay in [0,1] before weighting.

handlers['memory-importance-rank'] = async (input) => {
  const entries = Array.isArray(input.entries) ? input.entries : [];

  const ranked = entries.map(e => {
    const access_count  = Math.max(0, parseFloat(e.access_count) || 1);
    const age_days      = Math.max(0, parseFloat(e.age_days) || 0);
    const value         = String(e.value || '');

    // BUG FIX: use log-normalised access score (0→0, 1→0.1, 10→0.5, 100→1.0)
    const access_score  = Math.min(1, Math.log10(Math.max(1, access_count)) / 2);
    // Exponential decay: half-life ~14 days (more realistic than linear /30)
    const recency_score = Math.exp(-0.05 * age_days);
    // Content richness: capped at 1000 chars
    const size_score    = Math.min(1, value.length / 1000);

    const importance_score = Math.round(
      (access_score * 0.4 + recency_score * 0.4 + size_score * 0.2) * 10 * 10000
    ) / 10000;

    return {
      key:             e.key,
      value:           e.value,
      importance_score,
      access_count,
      age_days,
      recency_score:   Math.round(recency_score * 1000) / 1000,
      access_score:    Math.round(access_score  * 1000) / 1000,
      size_score:      Math.round(size_score    * 1000) / 1000,
    };
  })
  .sort((a, b) => b.importance_score - a.importance_score)
  .map((e, i) => ({ ...e, rank: i + 1 }));

  return {
    ranked,
    top_5: ranked.slice(0, 5),
    total: ranked.length,
  };
};

// ─── MEMORY SUMMARIZE NAMESPACE ───────────────────────────────────────────────
// NEW: Summarizes all memory entries in a namespace into a compact digest.
// Pure compute — no LLM calls, no external dependencies.

handlers['memory-summarize-namespace'] = async (input) => {
  const namespace = String(input.namespace || 'default');
  const entries   = Array.isArray(input.entries) ? input.entries : [];
  const max_digest_items = Math.min(parseInt(input.max_items) || 10, 50);

  if (entries.length === 0) {
    return {
      namespace,
      summary: 'Empty namespace — no entries provided.',
      total_entries: 0,
      total_chars: 0,
      top_keys: [],
      categories: {},
      digest: [],
    };
  }

  // Aggregate stats
  let total_chars = 0;
  const category_counts = {};
  const token_freq = {};

  for (const e of entries) {
    const v = String(e.value || '');
    total_chars += v.length;

    // Category from key prefix
    const prefix = String(e.key || '').split(/[:\-_]/)[0] || 'misc';
    category_counts[prefix] = (category_counts[prefix] || 0) + 1;

    // Token frequency for summary
    for (const tok of _tokens(v)) {
      token_freq[tok] = (token_freq[tok] || 0) + 1;
    }
  }

  // Top tokens (TF proxy for key themes)
  const top_tokens = Object.entries(token_freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([token, count]) => ({ token, count }));

  // Rank entries by importance for digest
  const ranked = entries.map(e => {
    const access_count = parseFloat(e.access_count) || 1;
    const age_days     = parseFloat(e.age_days) || 0;
    const v = String(e.value || '');
    return {
      key:   e.key,
      value: v.length > 200 ? v.slice(0, 200) + '…' : v,
      score: _importanceScore(access_count, age_days, v.length),
    };
  })
  .sort((a, b) => b.score - a.score);

  const digest = ranked.slice(0, max_digest_items).map(e => ({
    key:   e.key,
    value: e.value,
    importance: Math.round(e.score * 100) / 100,
  }));

  // Human-readable summary sentence
  const topCat  = Object.entries(category_counts).sort((a, b) => b[1] - a[1])[0];
  const themes  = top_tokens.slice(0, 5).map(t => t.token).join(', ');
  const summary = `Namespace "${namespace}" contains ${entries.length} entries `
    + `(${total_chars.toLocaleString()} chars total). `
    + (topCat ? `Dominant category: "${topCat[0]}" (${topCat[1]} keys). ` : '')
    + (themes ? `Key themes: ${themes}.` : '');

  return {
    namespace,
    summary,
    total_entries: entries.length,
    total_chars,
    top_keys:     ranked.slice(0, 5).map(e => e.key),
    categories:   category_counts,
    top_tokens,
    digest,
  };
};

// ─── MEMORY DEDUPLICATE ───────────────────────────────────────────────────────
// NEW: Finds near-duplicate memory entries using Jaccard token similarity.
// Returns duplicate groups and a merged canonical form for each group.

handlers['memory-deduplicate'] = async (input) => {
  const entries   = Array.isArray(input.entries) ? input.entries : [];
  const threshold = Math.min(1, Math.max(0, parseFloat(input.threshold) || 0.8));

  if (entries.length === 0) {
    return { duplicate_groups: [], unique_entries: [], duplicates_found: 0 };
  }

  // Pre-tokenise all entries
  const tokenised = entries.map(e => ({
    key:    String(e.key   || ''),
    value:  String(e.value || ''),
    tokens: _tokens(String(e.key || '') + ' ' + String(e.value || '')),
    _orig:  e,
  }));

  const visited  = new Set();
  const groups   = [];
  const ungrouped = [];

  for (let i = 0; i < tokenised.length; i++) {
    if (visited.has(i)) continue;

    const group = [tokenised[i]];
    visited.add(i);

    for (let j = i + 1; j < tokenised.length; j++) {
      if (visited.has(j)) continue;
      const sim = _jaccard(tokenised[i].tokens, tokenised[j].tokens);
      if (sim >= threshold) {
        group.push(tokenised[j]);
        visited.add(j);
      }
    }

    if (group.length > 1) {
      // Canonical = entry with longest value (most information)
      const canonical = group.reduce((a, b) => b.value.length > a.value.length ? b : a);
      groups.push({
        canonical_key:   canonical.key,
        canonical_value: canonical.value.length > 300 ? canonical.value.slice(0, 300) + '…' : canonical.value,
        duplicate_keys:  group.filter(e => e.key !== canonical.key).map(e => e.key),
        member_count:    group.length,
        avg_similarity:  (() => {
          if (group.length < 2) return 1;
          let sum = 0, pairs = 0;
          for (let a = 0; a < group.length; a++) {
            for (let b = a + 1; b < group.length; b++) {
              sum += _jaccard(group[a].tokens, group[b].tokens);
              pairs++;
            }
          }
          return Math.round(sum / pairs * 1000) / 1000;
        })(),
      });
    } else {
      ungrouped.push(tokenised[i]._orig);
    }
  }

  const duplicates_found = groups.reduce((sum, g) => sum + g.duplicate_keys.length, 0);
  const credits_saved    = duplicates_found; // 1 slot saved per duplicate removed

  return {
    duplicate_groups:  groups,
    unique_entries:    ungrouped,
    duplicates_found,
    credits_saved,
    threshold_used:    threshold,
    total_input:       entries.length,
    deduped_count:     entries.length - duplicates_found,
  };
};

// ─── MEMORY FORGET CURVE ─────────────────────────────────────────────────────
// NEW: Applies Ebbinghaus forgetting curve to decay memory strength over time.
// R = e^(-t/S) where t = time elapsed, S = stability (higher = slower decay).
// Also supports spaced-repetition: each review event increases stability.

handlers['memory-forget-curve'] = async (input) => {
  const entries     = Array.isArray(input.entries) ? input.entries : [];
  const decay_rate  = Math.max(0.01, parseFloat(input.decay_rate) || 1.0);
  const threshold   = Math.max(0, Math.min(1, parseFloat(input.threshold) || 0.2));

  if (entries.length === 0) {
    return { results: [], forgotten: [], retained: [], summary: { total: 0, forgotten_count: 0, retained_count: 0 } };
  }

  const results   = [];
  const forgotten = [];
  const retained  = [];

  for (const e of entries) {
    const key        = String(e.key || '');
    const age_days   = Math.max(0, parseFloat(e.age_days) || 0);
    // Initial memory strength (0-1), defaults to 1 (perfect recall at encoding)
    const initial_strength = Math.min(1, Math.max(0, parseFloat(e.strength) || 1.0));
    // Stability: how resistant to forgetting. Boosted by repetitions.
    // Each review/access adds +0.5 stability (spaced repetition effect)
    const reviews    = Math.max(0, parseInt(e.reviews || e.access_count) || 0);
    const stability  = Math.max(0.1, (1 + reviews * 0.5) / decay_rate);

    // Ebbinghaus: R(t) = initial_strength * e^(-t/S)
    const retention  = initial_strength * Math.exp(-age_days / stability);
    const retention_pct = Math.round(Math.min(1, Math.max(0, retention)) * 1000) / 1000;

    // Next optimal review: time at which retention drops to 90% of current
    // Derived from R(t+Δt) = 0.9 * R(t) → Δt = S * ln(1/0.9)
    const next_review_days = Math.round(stability * Math.log(1 / 0.9) * 10) / 10;

    const should_forget = retention_pct < threshold;
    const urgency = should_forget
      ? 'forgotten'
      : retention_pct < 0.5
      ? 'review_soon'
      : 'stable';

    const item = {
      key,
      retention: retention_pct,
      stability: Math.round(stability * 100) / 100,
      age_days,
      reviews,
      should_forget,
      urgency,
      next_review_days,
    };

    results.push(item);
    if (should_forget) forgotten.push(key);
    else retained.push(key);
  }

  // Sort by retention ascending (weakest memories first)
  results.sort((a, b) => a.retention - b.retention);

  return {
    results,
    forgotten,
    retained,
    summary: {
      total:           entries.length,
      forgotten_count: forgotten.length,
      retained_count:  retained.length,
      avg_retention:   results.length > 0
        ? Math.round(results.reduce((s, r) => s + r.retention, 0) / results.length * 1000) / 1000
        : 0,
      decay_rate,
      threshold_used: threshold,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = handlers;
