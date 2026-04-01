'use strict';

/**
 * Dream Engine V2 — TDI, Metacognitive Check, Affective Profiling
 * routes/dream-engine-v2.js
 *
 * Endpoints:
 *   POST /v1/memory/dream/prep             — Pre-dream preparation questionnaire
 *   POST /v1/memory/dream/incubate         — TDI (Targeted Dream Incubation)
 *   GET  /v1/memory/dream/incubate/:id     — Get incubation status
 *   POST /v1/memory/dream/emotional-tag    — Retroactive emotional tagging
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

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function ok(res, data) { res.json({ ok: true, ...data }); }
function err(res, status, code, message) {
  res.status(status).json({ ok: false, error: { code, message } });
}

/**
 * Pure computational metacognitive check.
 * Simulates gamma-band coherence, phase-amplitude coupling, and theta-gamma
 * cross-frequency coupling using seeded trigonometric math — no external calls.
 */
function runMetacognitiveCheck() {
  const seed = Date.now() % 1000;

  const prefrontal_binding_score = clamp(50 + 40 * Math.sin(seed / 137.0), 0, 100);
  const alpha_theta_pac_score    = clamp(50 + 40 * Math.cos(seed / 89.0), 0, 100);
  const theta_gamma_coupling     = clamp(
    (prefrontal_binding_score + alpha_theta_pac_score) / 2 + 10 * Math.sin(seed / 53.0),
    0, 100
  );

  const memory_consolidation_readiness = clamp(
    0.4 * prefrontal_binding_score +
    0.35 * alpha_theta_pac_score +
    0.25 * theta_gamma_coupling,
    0, 100
  );

  const recommended_depth =
    memory_consolidation_readiness > 70 ? 3 :
    memory_consolidation_readiness > 40 ? 2 : 1;

  const stage_weights = {
    orient:      1.0,
    gather:      1.0 + memory_consolidation_readiness / 200,
    consolidate: 1.0 + prefrontal_binding_score / 150,
    validate:    1.0,
    evolve:      1.0 + alpha_theta_pac_score / 150,
    forecast:    1.0 + theta_gamma_coupling / 200,
    extract:     1.0,
    store:       1.0,
    reflect:     1.0
  };

  return {
    prefrontal_binding_score,
    alpha_theta_pac_score,
    theta_gamma_coupling,
    memory_consolidation_readiness,
    recommended_depth,
    stage_weights
  };
}

/**
 * Pure affective profiler.
 * Scans text for emotion-bearing keywords and returns a VAD profile
 * (Valence, Arousal, Dominance) with consolidation bias.
 */
function computeAffectiveProfile(emotional_state, recent_context, focus_intention) {
  const text = [emotional_state, recent_context, focus_intention]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let valence   = 0;
  let arousal   = 0;
  let dominance = 0;

  // Joy / positive
  if (/joy|happy|excited|elated|thrilled|great|wonderful|fantastic/.test(text)) {
    valence   += 0.3;
    arousal   += 0.2;
  }
  // Sadness / low
  if (/sad|down|loss|grief|depressed|unhappy|hopeless|melancholy/.test(text)) {
    valence   -= 0.3;
    arousal   -= 0.1;
  }
  // Anger / frustration
  if (/angry|anger|frustrated|frustration|furious|rage|irritated|annoyed/.test(text)) {
    valence   -= 0.2;
    arousal   += 0.3;
  }
  // Fear / anxiety
  if (/fear|anxious|anxiety|worried|worry|scared|nervous|dread/.test(text)) {
    valence   -= 0.2;
    arousal   += 0.2;
    dominance -= 0.2;
  }
  // Surprise
  if (/surprise|surprising|unexpected|shocked|astonished|startled/.test(text)) {
    arousal   += 0.1;
  }

  // Clamp to valid ranges
  valence   = clamp(valence,   -1, 1);
  arousal   = clamp(arousal,    0, 1);
  dominance = clamp(dominance, -1, 1);
  // Normalise dominance to 0-1 range
  const dominanceNorm = clamp((dominance + 1) / 2, 0, 1);

  // Primary emotion heuristic
  let primary_emotion = 'neutral';
  if (valence > 0.2 && arousal > 0.1)  primary_emotion = 'joy';
  else if (valence < -0.2 && arousal < 0.2) primary_emotion = 'sadness';
  else if (valence < -0.1 && arousal > 0.25) primary_emotion = 'anger';
  else if (valence < -0.1 && dominance < 0) primary_emotion = 'fear';
  else if (arousal > 0.1 && valence >= -0.05 && valence <= 0.15) primary_emotion = 'surprise';

  // Consolidation bias
  let consolidation_bias = 'neutral';
  if (valence > 0.2) {
    consolidation_bias = 'reward';
  } else if (valence < -0.2 && arousal > 0.5) {
    consolidation_bias = 'threat';
  } else if (arousal > 0.4 && valence > 0) {
    consolidation_bias = 'exploratory';
  }

  // Collect emotional tags from matched patterns
  const emotional_tags = [];
  if (/joy|happy|excited/.test(text))   emotional_tags.push('joy');
  if (/sad|down|loss/.test(text))       emotional_tags.push('sadness');
  if (/angry|frustrated/.test(text))    emotional_tags.push('anger');
  if (/fear|anxious|worried/.test(text)) emotional_tags.push('fear');
  if (/surprise|unexpected/.test(text)) emotional_tags.push('surprise');
  if (emotional_tags.length === 0)      emotional_tags.push('neutral');

  return {
    valence,
    arousal,
    dominance: dominanceNorm,
    primary_emotion,
    emotional_tags,
    consolidation_bias
  };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = function (app, db, apiKeys) {

  // ── Schema ────────────────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS dream_prep_sessions (
      id                    TEXT PRIMARY KEY,
      api_key_hash          TEXT NOT NULL,
      namespace             TEXT,
      questions_answered    TEXT,
      focus_intention       TEXT,
      emotional_state       TEXT,
      recent_context        TEXT,
      sleep_quality_estimate REAL,
      readiness_score       REAL,
      recommended_strategies TEXT,
      created_at            INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dream_incubation_runs (
      id                TEXT PRIMARY KEY,
      api_key_hash      TEXT NOT NULL,
      namespace         TEXT,
      prep_id           TEXT,
      target_memory_ids TEXT,
      incubation_prompt TEXT,
      strategies        TEXT,
      model             TEXT,
      emotional_tags    TEXT,
      metacognitive_check TEXT,
      affective_profile TEXT,
      status            TEXT DEFAULT 'queued',
      created_at        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_emotional_tags (
      id                TEXT PRIMARY KEY,
      api_key_hash      TEXT NOT NULL,
      namespace         TEXT,
      memory_id         TEXT NOT NULL,
      valence           REAL,
      arousal           REAL,
      dominance         REAL,
      primary_emotion   TEXT,
      emotional_tags    TEXT,
      consolidation_bias TEXT,
      created_at        INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_emotional_tags_key_ns
      ON memory_emotional_tags (api_key_hash, namespace);
  `);

  // ── Prepared statements ──────────────────────────────────────────────────

  const insertPrep = db.prepare(`
    INSERT INTO dream_prep_sessions
      (id, api_key_hash, namespace, questions_answered, focus_intention,
       emotional_state, recent_context, sleep_quality_estimate,
       readiness_score, recommended_strategies, created_at)
    VALUES
      (@id, @api_key_hash, @namespace, @questions_answered, @focus_intention,
       @emotional_state, @recent_context, @sleep_quality_estimate,
       @readiness_score, @recommended_strategies, @created_at)
  `);

  const getPrep = db.prepare(`
    SELECT * FROM dream_prep_sessions WHERE id = ? AND api_key_hash = ?
  `);

  const insertIncubation = db.prepare(`
    INSERT INTO dream_incubation_runs
      (id, api_key_hash, namespace, prep_id, target_memory_ids,
       incubation_prompt, strategies, model, emotional_tags,
       metacognitive_check, affective_profile, status, created_at)
    VALUES
      (@id, @api_key_hash, @namespace, @prep_id, @target_memory_ids,
       @incubation_prompt, @strategies, @model, @emotional_tags,
       @metacognitive_check, @affective_profile, @status, @created_at)
  `);

  const getIncubation = db.prepare(`
    SELECT * FROM dream_incubation_runs WHERE id = ?
  `);

  const insertEmotionalTag = db.prepare(`
    INSERT OR REPLACE INTO memory_emotional_tags
      (id, api_key_hash, namespace, memory_id, valence, arousal, dominance,
       primary_emotion, emotional_tags, consolidation_bias, created_at)
    VALUES
      (@id, @api_key_hash, @namespace, @memory_id, @valence, @arousal, @dominance,
       @primary_emotion, @emotional_tags, @consolidation_bias, @created_at)
  `);

  // ── POST /v1/memory/dream/prep ───────────────────────────────────────────

  app.post('/v1/memory/dream/prep', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const {
      namespace,
      questions_answered,
      focus_intention,
      emotional_state,
      recent_context,
      sleep_quality_estimate
    } = req.body || {};

    // Readiness score: base 40 + 10 per qualifying field
    let readiness_score = 40;
    if (questions_answered)                                  readiness_score += 10;
    if (emotional_state)                                     readiness_score += 10;
    if (recent_context)                                      readiness_score += 10;
    if (typeof sleep_quality_estimate === 'number' && sleep_quality_estimate >= 6) readiness_score += 10;
    if (focus_intention)                                     readiness_score += 10;

    // Recommended strategies
    let recommended_strategies;
    const emotionLower   = (emotional_state   || '').toLowerCase();
    const intentionLower = (focus_intention   || '').toLowerCase();

    if (/anxious|anxiety|worried|worry|nervous/.test(emotionLower)) {
      recommended_strategies = ['reflect', 'validate'];
    } else if (/problem|solve|solution|fix|debug|challenge/.test(intentionLower)) {
      recommended_strategies = ['synthesize', 'insight_generate', 'pattern_extract'];
    } else {
      recommended_strategies = ['synthesize', 'pattern_extract', 'reflect'];
    }

    const id         = crypto.randomUUID();
    const created_at = Date.now();

    insertPrep.run({
      id,
      api_key_hash:           hashKey(key),
      namespace:              namespace || null,
      questions_answered:     questions_answered != null ? String(questions_answered) : null,
      focus_intention:        focus_intention    || null,
      emotional_state:        emotional_state    || null,
      recent_context:         recent_context     || null,
      sleep_quality_estimate: sleep_quality_estimate != null ? Number(sleep_quality_estimate) : null,
      readiness_score,
      recommended_strategies: JSON.stringify(recommended_strategies),
      created_at
    });

    ok(res, {
      prep_id:                id,
      timestamp:              created_at,
      readiness_score,
      recommended_strategies
    });
  });

  // ── POST /v1/memory/dream/incubate ───────────────────────────────────────

  app.post('/v1/memory/dream/incubate', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const {
      prep_id,
      target_memory_ids,
      incubation_prompt,
      strategies,
      model,
      namespace,
      emotional_tags
    } = req.body || {};

    // Validate prep_id if supplied
    if (prep_id) {
      const prep = getPrep.get(prep_id, hashKey(key));
      if (!prep) {
        return err(res, 404, 'prep_not_found', `No prep session found for id: ${prep_id}`);
      }
    }

    // Run pure-JS metacognitive simulation
    const metacognitive_check = runMetacognitiveCheck();

    // Compute affective profile from body context
    const prepRecord = prep_id ? getPrep.get(prep_id, hashKey(key)) : null;
    const emotional_state_text = prepRecord ? prepRecord.emotional_state : null;
    const recent_context_text  = prepRecord ? prepRecord.recent_context  : null;
    const focus_intention_text = prepRecord ? prepRecord.focus_intention : null;

    const affective_profile = computeAffectiveProfile(
      emotional_state_text,
      recent_context_text,
      focus_intention_text
    );

    // Estimated insights: a simple heuristic based on strategies count and depth
    const strategyList        = Array.isArray(strategies) ? strategies : (strategies ? [strategies] : []);
    const estimated_insights  = Math.max(1, strategyList.length) * metacognitive_check.recommended_depth * 2;

    const id         = crypto.randomUUID();
    const created_at = Date.now();

    insertIncubation.run({
      id,
      api_key_hash:       hashKey(key),
      namespace:          namespace          || null,
      prep_id:            prep_id            || null,
      target_memory_ids:  target_memory_ids  != null ? JSON.stringify(target_memory_ids) : null,
      incubation_prompt:  incubation_prompt  || null,
      strategies:         JSON.stringify(strategyList),
      model:              model              || null,
      emotional_tags:     emotional_tags     != null ? JSON.stringify(emotional_tags) : null,
      metacognitive_check: JSON.stringify(metacognitive_check),
      affective_profile:  JSON.stringify(affective_profile),
      status:             'queued',
      created_at
    });

    ok(res, {
      incubation_id:       id,
      metacognitive_score: Math.round(metacognitive_check.memory_consolidation_readiness),
      affective_profile,
      estimated_insights,
      status:             'queued'
    });
  });

  // ── GET /v1/memory/dream/incubate/:incubation_id ─────────────────────────

  app.get('/v1/memory/dream/incubate/:incubation_id', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { incubation_id } = req.params;
    const row = getIncubation.get(incubation_id);

    if (!row) {
      return err(res, 404, 'not_found', `Incubation run not found: ${incubation_id}`);
    }

    // Scope check — only the owning key may read
    if (row.api_key_hash !== hashKey(key)) {
      return err(res, 403, 'forbidden', 'Access denied');
    }

    // Deserialise JSON columns
    const record = {
      ...row,
      target_memory_ids:   safeParseJSON(row.target_memory_ids),
      strategies:          safeParseJSON(row.strategies),
      emotional_tags:      safeParseJSON(row.emotional_tags),
      metacognitive_check: safeParseJSON(row.metacognitive_check),
      affective_profile:   safeParseJSON(row.affective_profile)
    };

    ok(res, { incubation: record });
  });

  // ── POST /v1/memory/dream/emotional-tag ──────────────────────────────────

  app.post('/v1/memory/dream/emotional-tag', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { memory_ids, namespace } = req.body || {};

    if (!Array.isArray(memory_ids) || memory_ids.length === 0) {
      return err(res, 400, 'invalid_input', '`memory_ids` must be a non-empty array');
    }

    const keyHash    = hashKey(key);
    const created_at = Date.now();
    const tagged     = [];

    for (const memory_id of memory_ids) {
      if (!memory_id) continue;

      // We compute the affective profile treating the memory_id as a content
      // hint.  In production the caller would pass content; here we derive
      // a profile from whatever textual signal the ID carries.
      const profile = computeAffectiveProfile(String(memory_id), null, null);

      const id = crypto.randomUUID();

      insertEmotionalTag.run({
        id,
        api_key_hash:       keyHash,
        namespace:          namespace || null,
        memory_id:          String(memory_id),
        valence:            profile.valence,
        arousal:            profile.arousal,
        dominance:          profile.dominance,
        primary_emotion:    profile.primary_emotion,
        emotional_tags:     JSON.stringify(profile.emotional_tags),
        consolidation_bias: profile.consolidation_bias,
        created_at
      });

      tagged.push({
        tag_id:             id,
        memory_id:          String(memory_id),
        affective_profile:  profile
      });
    }

    ok(res, {
      tagged_count: tagged.length,
      tagged
    });
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  function safeParseJSON(v) {
    if (v == null) return null;
    try { return JSON.parse(v); } catch (_) { return v; }
  }
};
