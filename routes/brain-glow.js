'use strict';

/**
 * Brain Glow Score — Agentic Memory Intelligence Metric
 * routes/brain-glow.js
 *
 * Computes a composite Brain Glow Score reflecting the quality and depth of a
 * user's memory activity across Dream Engine, TMR, emotional tagging, hive
 * contributions, and dream prep sessions.
 *
 * Endpoints:
 *   GET  /v1/memory/score                — get current Brain Glow Score
 *   POST /v1/memory/score/compute        — force-recompute and persist score
 *   GET  /v1/memory/briefing             — morning intelligence briefing
 *   GET  /v1/memory/score/history        — score history (?limit=30&days=90)
 *   POST /v1/memory/score/streak/checkin — manual streak check-in
 */

const crypto = require('crypto');

function requireAuth(req, res, apiKeys) {
  const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!key || !apiKeys.get(key)) {
    res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
    return null;
  }
  return key;
}

function hashKey(key) { return crypto.createHash('sha256').update(key).digest('hex'); }
function ok(res, data) { res.json({ ok: true, ...data }); }
function err(res, status, code, message) { res.status(status).json({ ok: false, error: { code, message } }); }

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ── Helpers for safe cross-table queries ─────────────────────────────────────

function safeGet(db, sql, params) {
  try {
    return db.prepare(sql).get(...params);
  } catch (_) {
    return null;
  }
}

function safeAll(db, sql, params) {
  try {
    return db.prepare(sql).all(...params);
  } catch (_) {
    return [];
  }
}

// ── Core score computation ────────────────────────────────────────────────────

function computeScore(db, keyHash) {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const sevenDaysAgo  = now - 7  * 24 * 60 * 60 * 1000;

  // ── insights: count completed dream sessions in last 30 days ─────────────
  let insights = 0;
  try {
    const insightRow = db.prepare(
      `SELECT COUNT(*) AS cnt FROM dream_sessions
       WHERE api_key_hash = ? AND status = 'complete' AND created_at >= ?`
    ).get(keyHash, thirtyDaysAgo);
    insights = insightRow ? (insightRow.cnt || 0) : 0;

    // Fallback: also try summing insight_count column if present
    try {
      const sumRow = db.prepare(
        `SELECT SUM(insight_count) AS s FROM dream_sessions
         WHERE api_key_hash = ? AND created_at >= ?`
      ).get(keyHash, thirtyDaysAgo);
      const sumVal = sumRow && sumRow.s != null ? sumRow.s : 0;
      insights = Math.max(insights, sumVal);
    } catch (_) { /* column may not exist */ }
  } catch (_) { insights = 0; }

  // ── relevance: avg score from consumer_scores history ────────────────────
  let relevance = 1.0;
  try {
    const relRow = db.prepare(
      `SELECT AVG(score) AS avg_score FROM consumer_scores WHERE api_key_hash = ?`
    ).get(keyHash);
    if (relRow && relRow.avg_score != null) {
      relevance = relRow.avg_score / 100; // normalize to [0..1] range for formula
      if (relevance <= 0) relevance = 1.0;
    }
  } catch (_) { relevance = 1.0; }

  // ── dream_depth: avg stage_count / 9 ─────────────────────────────────────
  let dream_depth = 0.5;
  try {
    const ddRow = db.prepare(
      `SELECT AVG(stage_count) AS avg_stages FROM dream_sessions WHERE api_key_hash = ?`
    ).get(keyHash);
    if (ddRow && ddRow.avg_stages != null && ddRow.avg_stages > 0) {
      dream_depth = clamp(ddRow.avg_stages / 9, 0.1, 1.0);
    }
  } catch (_) { dream_depth = 0.5; }

  // ── emotional_depth: 1 + (count emotional tags / 100), cap 2.0 ───────────
  let emotional_depth = 1.0;
  try {
    const edRow = db.prepare(
      `SELECT COUNT(*) AS cnt FROM memory_emotional_tags WHERE api_key_hash = ?`
    ).get(keyHash);
    const tagCount = edRow ? (edRow.cnt || 0) : 0;
    emotional_depth = clamp(1 + tagCount / 100, 1.0, 2.0);
  } catch (_) { emotional_depth = 1.0; }

  // ── user_shaping: 1 + (count dream_prep_sessions / 10), cap 2.0 ──────────
  let user_shaping = 1.0;
  try {
    const usRow = db.prepare(
      `SELECT COUNT(*) AS cnt FROM dream_prep_sessions WHERE api_key_hash = ?`
    ).get(keyHash);
    const prepCount = usRow ? (usRow.cnt || 0) : 0;
    user_shaping = clamp(1 + prepCount / 10, 1.0, 2.0);
  } catch (_) { user_shaping = 1.0; }

  // ── collective_boost: 1 + (hive contributions / 5), cap 1.5 ──────────────
  let collective_boost = 1.0;
  try {
    const cbRow = db.prepare(
      `SELECT COUNT(*) AS cnt FROM hive_members WHERE api_key_hash = ?`
    ).get(keyHash);
    const hiveCount = cbRow ? (cbRow.cnt || 0) : 0;
    collective_boost = clamp(1 + hiveCount / 5, 1.0, 1.5);
  } catch (_) { collective_boost = 1.0; }

  // ── duration_sec: time since first dream session ──────────────────────────
  let duration_sec = 1;
  try {
    const durRow = db.prepare(
      `SELECT MIN(created_at) AS first FROM dream_sessions WHERE api_key_hash = ?`
    ).get(keyHash);
    if (durRow && durRow.first != null) {
      const daysSince = (now - durRow.first) / 86400000;
      duration_sec = Math.max(1, daysSince * 86400);
    }
  } catch (_) { duration_sec = 1; }

  // ── raw score ─────────────────────────────────────────────────────────────
  const rawScore =
    (insights * relevance * dream_depth * emotional_depth * user_shaping * collective_boost)
    / duration_sec;
  const score = clamp(rawScore * 100000, 0, 100); // scale to 0-100 range

  // ── streak_days ───────────────────────────────────────────────────────────
  let streak_days = 0;
  try {
    // Get all completed dream session dates (UTC days) in descending order
    const sessions = db.prepare(
      `SELECT DISTINCT CAST(created_at / 86400000 AS INTEGER) AS day_bucket
       FROM dream_sessions
       WHERE api_key_hash = ? AND status = 'complete'
       ORDER BY day_bucket DESC`
    ).all(keyHash);

    const todayBucket = Math.floor(now / 86400000);
    let expected = todayBucket;
    for (const row of sessions) {
      if (row.day_bucket === expected || row.day_bucket === expected - 1) {
        // Allow today (expected) or yesterday as start
        if (streak_days === 0 && row.day_bucket === expected - 1) expected--;
        if (row.day_bucket === expected) {
          streak_days++;
          expected--;
        } else {
          break;
        }
      } else if (streak_days === 0 && row.day_bucket < expected) {
        // No session today — streak starts from most recent day
        expected = row.day_bucket;
        streak_days = 1;
        expected--;
      } else {
        break;
      }
    }
  } catch (_) { streak_days = 0; }

  // ── rank ──────────────────────────────────────────────────────────────────
  let rank;
  if      (score <= 20) rank = 'Spark';
  else if (score <= 40) rank = 'Ember';
  else if (score <= 60) rank = 'Flame';
  else if (score <= 80) rank = 'Blaze';
  else                  rank = 'Inferno';

  // ── trend: this week avg vs last week avg ────────────────────────────────
  let trend = 'stable';
  try {
    const thisWeekStart = now - 7  * 24 * 60 * 60 * 1000;
    const lastWeekStart = now - 14 * 24 * 60 * 60 * 1000;

    const thisWeek = db.prepare(
      `SELECT AVG(score) AS avg FROM consumer_scores
       WHERE api_key_hash = ? AND computed_at >= ?`
    ).get(keyHash, thisWeekStart);

    const lastWeek = db.prepare(
      `SELECT AVG(score) AS avg FROM consumer_scores
       WHERE api_key_hash = ? AND computed_at >= ? AND computed_at < ?`
    ).get(keyHash, lastWeekStart, thisWeekStart);

    const thisAvg = thisWeek && thisWeek.avg != null ? thisWeek.avg : null;
    const lastAvg = lastWeek && lastWeek.avg != null ? lastWeek.avg : null;

    if (thisAvg !== null && lastAvg !== null) {
      const delta = thisAvg - lastAvg;
      if (delta > 1)       trend = 'rising';
      else if (delta < -1) trend = 'declining';
      else                 trend = 'stable';
    }
  } catch (_) { trend = 'stable'; }

  return {
    score,
    rank,
    streak_days,
    trend,
    components: {
      insights,
      relevance,
      dream_depth,
      emotional_depth,
      user_shaping,
      collective_boost,
    },
    computed_at: now,
  };
}

function persistScore(db, keyHash, result) {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO consumer_scores
       (id, api_key_hash, score, insights, dream_depth, emotional_depth,
        user_shaping, collective_boost, streak_days, rank, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    keyHash,
    result.score,
    result.components.insights,
    result.components.dream_depth,
    result.components.emotional_depth,
    result.components.user_shaping,
    result.components.collective_boost,
    result.streak_days,
    result.rank,
    result.computed_at,
  );
}

// ── Module export ─────────────────────────────────────────────────────────────

module.exports = function (app, db, apiKeys) {

  // ── Schema bootstrap ──────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS consumer_scores (
      id               TEXT PRIMARY KEY,
      api_key_hash     TEXT NOT NULL,
      score            REAL,
      insights         REAL,
      dream_depth      REAL,
      emotional_depth  REAL,
      user_shaping     REAL,
      collective_boost REAL,
      streak_days      INTEGER,
      rank             TEXT,
      computed_at      INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_consumer_scores_key_time
      ON consumer_scores (api_key_hash, computed_at);

    CREATE TABLE IF NOT EXISTS streak_checkins (
      id           TEXT PRIMARY KEY,
      api_key_hash TEXT NOT NULL,
      note         TEXT,
      created_at   INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_streak_checkins_key_time
      ON streak_checkins (api_key_hash, created_at);
  `);

  // ── GET /v1/memory/score ──────────────────────────────────────────────────

  app.get('/v1/memory/score', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const result = computeScore(db, keyHash);
    persistScore(db, keyHash, result);

    ok(res, result);
  });

  // ── POST /v1/memory/score/compute ─────────────────────────────────────────

  app.post('/v1/memory/score/compute', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    // namespace is accepted but currently used as a tag for future scoping
    // const { namespace } = req.body || {};

    const result = computeScore(db, keyHash);
    persistScore(db, keyHash, result);

    ok(res, result);
  });

  // ── GET /v1/memory/briefing ───────────────────────────────────────────────

  app.get('/v1/memory/briefing', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const now = Date.now();
    const sevenDaysAgo  = now - 7 * 24 * 60 * 60 * 1000;
    const threeDaysAgo  = now - 3 * 24 * 60 * 60 * 1000;

    // ── brain_glow ────────────────────────────────────────────────────────
    const brain_glow_result = computeScore(db, keyHash);
    persistScore(db, keyHash, brain_glow_result);
    const brain_glow = brain_glow_result;

    // ── dream_recap ───────────────────────────────────────────────────────
    const dream_recap = safeAll(db,
      `SELECT id, strategy, insight_count, created_at
       FROM dream_sessions
       WHERE api_key_hash = ? AND status = 'complete'
       ORDER BY created_at DESC LIMIT 3`,
      [keyHash]
    );

    // ── top_insights ──────────────────────────────────────────────────────
    const top_insights = safeAll(db,
      `SELECT id, dream_id, content, strategy, created_at
       FROM dream_entries
       WHERE api_key_hash = ?
       ORDER BY created_at DESC LIMIT 5`,
      [keyHash]
    );

    // ── tmr_cues ──────────────────────────────────────────────────────────
    const tmr_cues = safeAll(db,
      `SELECT id, memory_ref, cue_type, priority, scheduled_at
       FROM tmr_queue
       WHERE api_key_hash = ? AND status = 'pending'
       ORDER BY priority DESC, scheduled_at ASC LIMIT 3`,
      [keyHash]
    );

    // ── emotional_summary ─────────────────────────────────────────────────
    let emotional_summary = {
      avg_valence: null,
      avg_arousal: null,
      dominant_emotion: null,
      emotional_trend: 'stable',
    };

    try {
      const allEmotions = db.prepare(
        `SELECT valence, arousal, primary_emotion, created_at
         FROM memory_emotional_tags
         WHERE api_key_hash = ? AND created_at >= ?
         ORDER BY created_at DESC`
      ).all(keyHash, sevenDaysAgo);

      if (allEmotions.length > 0) {
        // avg valence + arousal over 7 days
        const valences  = allEmotions.map(r => r.valence  ?? 0);
        const arousals  = allEmotions.map(r => r.arousal  ?? 0);
        const avgVal7   = valences.reduce((a, b) => a + b, 0) / valences.length;
        const avgAro7   = arousals.reduce((a, b) => a + b, 0) / arousals.length;

        // dominant emotion
        const emotionCounts = {};
        for (const row of allEmotions) {
          if (row.primary_emotion) {
            emotionCounts[row.primary_emotion] = (emotionCounts[row.primary_emotion] || 0) + 1;
          }
        }
        const dominant_emotion = Object.keys(emotionCounts).sort(
          (a, b) => emotionCounts[b] - emotionCounts[a]
        )[0] || null;

        // emotional_trend: last 3 days vs days 4-7
        const last3  = allEmotions.filter(r => r.created_at >= threeDaysAgo);
        const days47 = allEmotions.filter(r => r.created_at < threeDaysAgo);

        let emotional_trend = 'stable';
        if (last3.length > 0 && days47.length > 0) {
          const avg3  = last3.reduce((a, r) => a + (r.valence ?? 0), 0) / last3.length;
          const avg47 = days47.reduce((a, r) => a + (r.valence ?? 0), 0) / days47.length;
          if      (avg3 > avg47 + 0.05) emotional_trend = 'improving';
          else if (avg3 < avg47 - 0.05) emotional_trend = 'declining';
          else                          emotional_trend = 'stable';
        }

        emotional_summary = {
          avg_valence:      parseFloat(avgVal7.toFixed(4)),
          avg_arousal:      parseFloat(avgAro7.toFixed(4)),
          dominant_emotion,
          emotional_trend,
        };
      }
    } catch (_) { /* table may not exist yet */ }

    // ── recommended_strategies ────────────────────────────────────────────
    const strategies = new Set(['synthesize']);

    const valence = emotional_summary.avg_valence;
    if (valence !== null && valence < 0) {
      strategies.add('reflect');
      strategies.add('validate');
    }
    if (brain_glow.components.insights >= 3) {
      strategies.add('evolve');
      strategies.add('forecast');
    }

    // Fill remaining slots up to 3 from a priority list
    const fallbacks = ['pattern_extract', 'compress', 'associate', 'insight_generate'];
    for (const s of fallbacks) {
      if (strategies.size >= 3) break;
      strategies.add(s);
    }

    const recommended_strategies = [...strategies].slice(0, 3);

    // ── date ──────────────────────────────────────────────────────────────
    const date = new Date(now).toISOString().split('T')[0];

    ok(res, {
      brain_glow,
      dream_recap,
      top_insights,
      tmr_cues,
      emotional_summary,
      recommended_strategies,
      date,
    });
  });

  // ── GET /v1/memory/score/history ──────────────────────────────────────────

  app.get('/v1/memory/score/history', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 200);
    const days  = parseInt(req.query.days, 10) || 90;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    let history = [];
    try {
      history = db.prepare(
        `SELECT id, score, insights, dream_depth, emotional_depth,
                user_shaping, collective_boost, streak_days, rank, computed_at
         FROM consumer_scores
         WHERE api_key_hash = ? AND computed_at >= ?
         ORDER BY computed_at DESC
         LIMIT ?`
      ).all(keyHash, since, limit);
    } catch (e) {
      return err(res, 500, 'db_error', e.message);
    }

    ok(res, { history, total: history.length });
  });

  // ── POST /v1/memory/score/streak/checkin ─────────────────────────────────

  app.post('/v1/memory/score/streak/checkin', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const { note = '' } = req.body || {};
    const now = Date.now();
    const id  = crypto.randomUUID();

    try {
      db.prepare(
        `INSERT INTO streak_checkins (id, api_key_hash, note, created_at)
         VALUES (?, ?, ?, ?)`
      ).run(id, keyHash, String(note).slice(0, 500), now);
    } catch (e) {
      return err(res, 500, 'db_error', e.message);
    }

    // Recompute streak count from checkins + dream sessions
    let streak_days = 0;
    try {
      // Gather all distinct day buckets from both checkins and completed dream sessions
      const checkinDays = db.prepare(
        `SELECT DISTINCT CAST(created_at / 86400000 AS INTEGER) AS day_bucket
         FROM streak_checkins WHERE api_key_hash = ?`
      ).all(keyHash).map(r => r.day_bucket);

      let sessionDays = [];
      try {
        sessionDays = db.prepare(
          `SELECT DISTINCT CAST(created_at / 86400000 AS INTEGER) AS day_bucket
           FROM dream_sessions WHERE api_key_hash = ? AND status = 'complete'`
        ).all(keyHash).map(r => r.day_bucket);
      } catch (_) { /* table may not exist */ }

      const allDays = [...new Set([...checkinDays, ...sessionDays])].sort((a, b) => b - a);

      const todayBucket = Math.floor(now / 86400000);
      let expected = todayBucket;
      for (const day of allDays) {
        if (day === expected) {
          streak_days++;
          expected--;
        } else if (streak_days === 0 && day === expected - 1) {
          // streak starts from yesterday if no activity today
          expected = day;
          streak_days = 1;
          expected--;
        } else {
          break;
        }
      }
    } catch (_) { streak_days = 0; }

    ok(res, { checkin_id: id, streak_days, created_at: now });
  });

};
