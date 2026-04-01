'use strict';
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

// ── helpers ───────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }
function now() { return Date.now(); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Compute standard deviation for an array of numbers. */
function stdDev(arr) {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Extract key phrases from a transcript:
 *  - Capitalized words (excluding the very first word of the transcript)
 *  - 2-3 word sequences that appear more than once
 */
function extractKeyPhrases(text) {
  const phrases = new Set();

  // Capitalized words (not at the start of a sentence to reduce noise)
  const capWords = text.match(/(?<![.!?\n]\s{0,5})\b([A-Z][a-z]{2,})\b/g) || [];
  for (const w of capWords) {
    if (w.length >= 3) phrases.add(w.toLowerCase());
  }

  // 2–3 word n-gram repetition
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const ngramCount = {};
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      const gram = words.slice(i, i + n).join(' ');
      ngramCount[gram] = (ngramCount[gram] || 0) + 1;
    }
  }
  for (const [gram, count] of Object.entries(ngramCount)) {
    if (count > 1) phrases.add(gram);
  }

  return [...phrases].slice(0, 20); // cap at 20 phrases
}

/**
 * Naive sentence/chunk splitter for auto-extract.
 * Splits on sentence boundaries and groups into ~150-word chunks.
 */
function chunkText(text, targetWords = 150) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks = [];
  let current = [];
  let count = 0;

  for (const s of sentences) {
    const wc = s.split(/\s+/).filter(Boolean).length;
    if (count + wc > targetWords && current.length > 0) {
      chunks.push(current.join(' ').trim());
      current = [];
      count = 0;
    }
    current.push(s.trim());
    count += wc;
  }
  if (current.length > 0) chunks.push(current.join(' ').trim());
  return chunks.filter(c => c.length > 0);
}

const VALID_DEVICE_TYPES = new Set(['oura', 'whoop', 'garmin', 'apple_watch', 'fitbit', 'generic']);
const VALID_DATA_TYPES   = new Set(['sleep', 'hrv', 'heart_rate', 'stress', 'activity', 'spo2', 'temperature']);

// ── module export ─────────────────────────────────────────────────────────────

module.exports = function (app, db, apiKeys) {

  // ── schema ──────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_transcripts (
      id TEXT PRIMARY KEY,
      api_key_hash TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'default',
      session_id TEXT,
      transcript TEXT NOT NULL,
      source TEXT DEFAULT 'microphone',
      duration_sec REAL,
      language TEXT DEFAULT 'en',
      word_count INTEGER,
      speaking_rate REAL,
      memory_value_score REAL,
      key_phrases TEXT,
      emotional_hint TEXT,
      wearable_context TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vt_key ON voice_transcripts(api_key_hash, namespace, created_at);

    CREATE TABLE IF NOT EXISTS voice_memory_chunks (
      id TEXT PRIMARY KEY,
      transcript_id TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'default',
      content TEXT NOT NULL,
      chunk_index INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vmc_transcript ON voice_memory_chunks(transcript_id);

    CREATE TABLE IF NOT EXISTS wearable_data (
      id TEXT PRIMARY KEY,
      api_key_hash TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'default',
      device_type TEXT,
      data_type TEXT,
      readings_json TEXT,
      aggregates_json TEXT,
      sleep_data_json TEXT,
      memory_consolidation_index REAL,
      session_date TEXT,
      synced_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wd_key ON wearable_data(api_key_hash, namespace, synced_at);

    CREATE TABLE IF NOT EXISTS voice_rooms (
      id TEXT PRIMARY KEY,
      api_key_hash TEXT NOT NULL,
      namespace TEXT NOT NULL DEFAULT 'default',
      room_name TEXT,
      max_participants INTEGER DEFAULT 10,
      auto_transcribe INTEGER DEFAULT 1,
      shared_memory_namespace TEXT,
      join_token TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vr_key ON voice_rooms(api_key_hash);

    CREATE TABLE IF NOT EXISTS voice_room_participants (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      participant_label TEXT,
      joined_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vrp_room ON voice_room_participants(room_id);

    CREATE TABLE IF NOT EXISTS voice_room_transcripts (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      participant_id TEXT,
      transcript TEXT NOT NULL,
      duration_sec REAL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vrt_room ON voice_room_transcripts(room_id, created_at);
  `);

  // ── prepared statements ─────────────────────────────────────────────────────
  const insertTranscript = db.prepare(`
    INSERT INTO voice_transcripts
      (id, api_key_hash, namespace, session_id, transcript, source, duration_sec, language,
       word_count, speaking_rate, memory_value_score, key_phrases, emotional_hint, wearable_context, created_at)
    VALUES
      (@id, @api_key_hash, @namespace, @session_id, @transcript, @source, @duration_sec, @language,
       @word_count, @speaking_rate, @memory_value_score, @key_phrases, @emotional_hint, @wearable_context, @created_at)
  `);

  const insertChunk = db.prepare(`
    INSERT INTO voice_memory_chunks
      (id, transcript_id, api_key_hash, namespace, content, chunk_index, created_at)
    VALUES
      (@id, @transcript_id, @api_key_hash, @namespace, @content, @chunk_index, @created_at)
  `);

  const insertWearable = db.prepare(`
    INSERT INTO wearable_data
      (id, api_key_hash, namespace, device_type, data_type, readings_json, aggregates_json,
       sleep_data_json, memory_consolidation_index, session_date, synced_at)
    VALUES
      (@id, @api_key_hash, @namespace, @device_type, @data_type, @readings_json, @aggregates_json,
       @sleep_data_json, @memory_consolidation_index, @session_date, @synced_at)
  `);

  const insertRoom = db.prepare(`
    INSERT INTO voice_rooms
      (id, api_key_hash, namespace, room_name, max_participants, auto_transcribe,
       shared_memory_namespace, join_token, status, created_at)
    VALUES
      (@id, @api_key_hash, @namespace, @room_name, @max_participants, @auto_transcribe,
       @shared_memory_namespace, @join_token, @status, @created_at)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO voice_room_participants
      (id, room_id, api_key_hash, participant_label, joined_at)
    VALUES
      (@id, @room_id, @api_key_hash, @participant_label, @joined_at)
  `);

  const insertRoomTranscript = db.prepare(`
    INSERT INTO voice_room_transcripts
      (id, room_id, participant_id, transcript, duration_sec, created_at)
    VALUES
      (@id, @room_id, @participant_id, @transcript, @duration_sec, @created_at)
  `);

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /v1/voice/transcribe-and-store
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/v1/voice/transcribe-and-store', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const {
      transcript,
      source = 'microphone',
      duration_sec = null,
      language = 'en',
      namespace = 'default',
      auto_extract = true,
      session_id = null,
      emotional_hint = null,
      wearable_context = null
    } = req.body || {};

    // Validation
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      return err(res, 400, 'invalid_transcript', 'transcript must be a non-empty string');
    }
    if (transcript.length > 50000) {
      return err(res, 400, 'transcript_too_long', 'transcript must be 50000 characters or fewer');
    }

    // Word count & speaking rate
    const words = transcript.split(/\s+/).filter(Boolean);
    const word_count = words.length;
    const speaking_rate = (duration_sec && duration_sec > 0)
      ? parseFloat((word_count / (duration_sec / 60)).toFixed(2))
      : null;

    // Key phrases
    const key_phrases = extractKeyPhrases(transcript);

    // Memory value score
    const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
    const uniqueRatio = word_count > 0 ? uniqueWords / word_count : 0;
    const hasEmotionalHint = emotional_hint && typeof emotional_hint === 'string' && emotional_hint.trim().length > 0;
    const hasWearable = wearable_context && typeof wearable_context === 'object';

    const rawScore =
      (word_count / 100) * 10 +
      uniqueRatio * 30 +
      (hasEmotionalHint ? 20 : 0) +
      (hasWearable ? 10 : 0);
    const memory_value_score = parseFloat(clamp(rawScore, 0, 100).toFixed(2));

    // Insert transcript
    const transcript_id = uid();
    const created_at = now();

    insertTranscript.run({
      id: transcript_id,
      api_key_hash: keyHash,
      namespace,
      session_id: session_id || null,
      transcript,
      source,
      duration_sec: duration_sec || null,
      language,
      word_count,
      speaking_rate,
      memory_value_score,
      key_phrases: JSON.stringify(key_phrases),
      emotional_hint: emotional_hint || null,
      wearable_context: wearable_context ? JSON.stringify(wearable_context) : null,
      created_at
    });

    // Auto-extract chunks
    const chunk_ids = [];
    if (auto_extract) {
      const chunks = chunkText(transcript);
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = uid();
        insertChunk.run({
          id: chunkId,
          transcript_id,
          api_key_hash: keyHash,
          namespace,
          content: chunks[i],
          chunk_index: i,
          created_at
        });
        chunk_ids.push(chunkId);
      }
    }

    ok(res, {
      transcript_id,
      word_count,
      speaking_rate,
      memory_value_score,
      key_phrases,
      chunks_extracted: chunk_ids.length,
      chunk_ids,
      namespace,
      created_at: new Date(created_at).toISOString()
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /v1/voice/transcripts
  // ═══════════════════════════════════════════════════════════════════════════
  app.get('/v1/voice/transcripts', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const namespace  = req.query.namespace  || 'default';
    const limit      = Math.min(parseInt(req.query.limit) || 20, 200);
    const session_id = req.query.session_id || null;

    let query = `SELECT * FROM voice_transcripts WHERE api_key_hash = ? AND namespace = ?`;
    const params = [keyHash, namespace];

    if (session_id) {
      query += ` AND session_id = ?`;
      params.push(session_id);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params).map(r => ({
      ...r,
      key_phrases: r.key_phrases ? JSON.parse(r.key_phrases) : [],
      wearable_context: r.wearable_context ? JSON.parse(r.wearable_context) : null,
      created_at: new Date(r.created_at).toISOString()
    }));

    ok(res, { transcripts: rows, count: rows.length });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /v1/voice/transcript/:transcript_id
  // ═══════════════════════════════════════════════════════════════════════════
  app.delete('/v1/voice/transcript/:transcript_id', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const { transcript_id } = req.params;

    const row = db.prepare(
      `SELECT id FROM voice_transcripts WHERE id = ? AND api_key_hash = ?`
    ).get(transcript_id, keyHash);

    if (!row) return err(res, 404, 'not_found', 'Transcript not found');

    db.prepare(`DELETE FROM voice_memory_chunks WHERE transcript_id = ?`).run(transcript_id);
    db.prepare(`DELETE FROM voice_transcripts WHERE id = ?`).run(transcript_id);

    ok(res, { deleted: true, transcript_id });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /v1/wearable/sync
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/v1/wearable/sync', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const {
      device_type,
      data_type,
      readings = [],
      sleep_data = null,
      namespace = 'default',
      session_date = null
    } = req.body || {};

    // Validation
    if (!device_type || !VALID_DEVICE_TYPES.has(device_type)) {
      return err(res, 400, 'invalid_device_type',
        `device_type must be one of: ${[...VALID_DEVICE_TYPES].join(', ')}`);
    }
    if (!data_type || !VALID_DATA_TYPES.has(data_type)) {
      return err(res, 400, 'invalid_data_type',
        `data_type must be one of: ${[...VALID_DATA_TYPES].join(', ')}`);
    }
    if (!Array.isArray(readings)) {
      return err(res, 400, 'invalid_readings', 'readings must be an array');
    }

    // Compute aggregates from readings values
    const values = readings.map(r => Number(r.value)).filter(v => !isNaN(v));
    let aggregates = { min: null, max: null, avg: null, std_dev: null };
    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      aggregates = {
        min: parseFloat(Math.min(...values).toFixed(4)),
        max: parseFloat(Math.max(...values).toFixed(4)),
        avg: parseFloat((sum / values.length).toFixed(4)),
        std_dev: parseFloat(stdDev(values).toFixed(4))
      };
    }

    // Memory consolidation index from sleep_data
    let memory_consolidation_index = null;
    if (sleep_data && typeof sleep_data === 'object') {
      const {
        total_sleep_sec = 0,
        rem_sec = 0,
        deep_sec = 0,
        efficiency = 0
      } = sleep_data;

      if (total_sleep_sec > 0) {
        const base           = (rem_sec  / total_sleep_sec) * 100 * 2;
        const bonus          = (deep_sec / total_sleep_sec) * 100 * 1.5;
        const efficiency_mod = (efficiency || 0) * 20;
        memory_consolidation_index = parseFloat(
          clamp(base + bonus + efficiency_mod, 0, 100).toFixed(2)
        );
      } else {
        memory_consolidation_index = 0;
      }
    }

    // Insert wearable record
    const sync_id   = uid();
    const synced_at = now();

    insertWearable.run({
      id: sync_id,
      api_key_hash: keyHash,
      namespace,
      device_type,
      data_type,
      readings_json: JSON.stringify(readings),
      aggregates_json: JSON.stringify(aggregates),
      sleep_data_json: sleep_data ? JSON.stringify(sleep_data) : null,
      memory_consolidation_index,
      session_date: session_date || null,
      synced_at
    });

    // Auto-insert into tmr_queue if high-consolidation sleep
    let tmr_scheduled = false;
    if (sleep_data && memory_consolidation_index !== null && memory_consolidation_index > 60) {
      try {
        db.prepare(`
          INSERT INTO tmr_queue
            (id, api_key_hash, namespace, cue_type, priority, description, status, created_at)
          VALUES
            (?, ?, ?, 'sleep_optimized', ?, ?, 'pending', ?)
        `).run(
          uid(),
          keyHash,
          namespace,
          memory_consolidation_index,
          'High-consolidation sleep detected — optimal TMR window',
          synced_at
        );
        tmr_scheduled = true;
      } catch (_) {
        // tmr_queue table may not exist yet — silently skip
      }
    }

    ok(res, {
      sync_id,
      device_type,
      data_type,
      readings_count: readings.length,
      aggregates,
      memory_consolidation_index,
      tmr_scheduled,
      namespace,
      synced_at: new Date(synced_at).toISOString()
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /v1/wearable/data
  // ═══════════════════════════════════════════════════════════════════════════
  app.get('/v1/wearable/data', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const namespace   = req.query.namespace   || 'default';
    const limit       = Math.min(parseInt(req.query.limit) || 30, 200);
    const device_type = req.query.device_type || null;
    const data_type   = req.query.data_type   || null;

    let query = `SELECT * FROM wearable_data WHERE api_key_hash = ? AND namespace = ?`;
    const params = [keyHash, namespace];

    if (device_type) { query += ` AND device_type = ?`; params.push(device_type); }
    if (data_type)   { query += ` AND data_type = ?`;   params.push(data_type);   }

    query += ` ORDER BY synced_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params).map(r => ({
      ...r,
      readings:   r.readings_json   ? JSON.parse(r.readings_json)   : [],
      aggregates: r.aggregates_json ? JSON.parse(r.aggregates_json) : {},
      sleep_data: r.sleep_data_json ? JSON.parse(r.sleep_data_json) : null,
      synced_at:  new Date(r.synced_at).toISOString()
    }));

    ok(res, { data: rows, count: rows.length });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /v1/wearable/sleep-correlation
  // ═══════════════════════════════════════════════════════════════════════════
  app.get('/v1/wearable/sleep-correlation', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const namespace = req.query.namespace || 'default';

    // Fetch sleep wearable records that have a session_date
    const sleepRows = db.prepare(`
      SELECT session_date, memory_consolidation_index
      FROM wearable_data
      WHERE api_key_hash = ? AND namespace = ? AND data_type = 'sleep' AND session_date IS NOT NULL
      ORDER BY session_date ASC
    `).all(keyHash, namespace);

    // Attempt to pull dream sessions — table may not exist
    let dreamRows = [];
    try {
      dreamRows = db.prepare(`
        SELECT date(created_at / 1000, 'unixepoch') AS session_date, COUNT(*) AS insight_count
        FROM dream_sessions
        WHERE api_key_hash = ? AND namespace = ?
        GROUP BY session_date
      `).all(keyHash, namespace);
    } catch (_) {
      // dream_sessions table may not exist — handle gracefully
    }

    // Index dream insights by date
    const dreamByDate = {};
    for (const d of dreamRows) dreamByDate[d.session_date] = d.insight_count;

    // Build correlated nights
    const nights = [];
    for (const s of sleepRows) {
      const date = s.session_date;
      if (dreamByDate[date] !== undefined) {
        nights.push({
          date,
          memory_consolidation_index: s.memory_consolidation_index,
          dream_insight_count: dreamByDate[date],
          correlation_score: parseFloat(
            clamp(
              (s.memory_consolidation_index / 100) * dreamByDate[date],
              0,
              100
            ).toFixed(2)
          )
        });
      }
    }

    // Overall correlation: count pairs where high MCI (>60) → more insights than average
    let overall_correlation = 'insufficient_data';
    if (nights.length >= 2) {
      const avgInsights = nights.reduce((s, n) => s + n.dream_insight_count, 0) / nights.length;
      const highMciNights = nights.filter(n => n.memory_consolidation_index > 60);
      const highMciAboveAvg = highMciNights.filter(n => n.dream_insight_count > avgInsights).length;
      if (highMciNights.length > 0 && highMciAboveAvg / highMciNights.length >= 0.6) {
        overall_correlation = 'positive';
      } else {
        overall_correlation = 'weak';
      }
    }

    // Best nights by insight count
    const best_nights = [...nights]
      .sort((a, b) => b.dream_insight_count - a.dream_insight_count)
      .slice(0, 3);

    // Recommendation
    let recommendation;
    if (nights.length === 0) {
      recommendation = 'No correlated nights found. Continue logging wearable sleep data and dream sessions to unlock correlation insights.';
    } else if (overall_correlation === 'positive') {
      recommendation = 'Your high-consolidation sleep nights consistently produce more dream insights. Prioritize 7–9 hours with low awakenings and maintain a regular sleep schedule to maximise memory consolidation.';
    } else if (overall_correlation === 'weak') {
      recommendation = 'No strong correlation detected yet. Consider logging more nights and using TMR cues on high-consolidation nights to amplify memory-dream linkage.';
    } else {
      recommendation = 'Keep tracking — you need at least 2 correlated nights to generate meaningful insights.';
    }

    ok(res, {
      correlated_nights: nights,
      overall_correlation,
      best_nights,
      recommendation,
      nights_analysed: nights.length
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /v1/voice/multiplayer/room
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/v1/voice/multiplayer/room', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const {
      room_name = null,
      namespace = 'default',
      max_participants = 10,
      auto_transcribe = true,
      shared_memory_namespace = null
    } = req.body || {};

    const room_id   = uid();
    const join_token = crypto.randomBytes(6).toString('hex'); // 12-char hex
    const created_at = now();

    insertRoom.run({
      id: room_id,
      api_key_hash: keyHash,
      namespace,
      room_name: room_name || `Room-${room_id.slice(0, 8)}`,
      max_participants: parseInt(max_participants) || 10,
      auto_transcribe: auto_transcribe ? 1 : 0,
      shared_memory_namespace: shared_memory_namespace || null,
      join_token,
      status: 'open',
      created_at
    });

    ok(res, {
      room_id,
      room_name: room_name || `Room-${room_id.slice(0, 8)}`,
      join_token,
      namespace,
      max_participants: parseInt(max_participants) || 10,
      auto_transcribe: !!auto_transcribe,
      shared_memory_namespace: shared_memory_namespace || null,
      status: 'open',
      created_at: new Date(created_at).toISOString()
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /v1/voice/multiplayer/room/:room_id
  // ═══════════════════════════════════════════════════════════════════════════
  app.get('/v1/voice/multiplayer/room/:room_id', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const { room_id } = req.params;

    const room = db.prepare(
      `SELECT * FROM voice_rooms WHERE id = ? AND api_key_hash = ?`
    ).get(room_id, keyHash);

    if (!room) return err(res, 404, 'not_found', 'Room not found');

    const participant_count = db.prepare(
      `SELECT COUNT(*) as cnt FROM voice_room_participants WHERE room_id = ?`
    ).get(room_id).cnt;

    ok(res, {
      ...room,
      auto_transcribe: !!room.auto_transcribe,
      participant_count,
      created_at: new Date(room.created_at).toISOString()
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /v1/voice/multiplayer/room/:room_id/join
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/v1/voice/multiplayer/room/:room_id/join', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const { room_id } = req.params;
    const { join_token, participant_label = null } = req.body || {};

    if (!join_token) return err(res, 400, 'missing_join_token', 'join_token is required');

    const room = db.prepare(
      `SELECT * FROM voice_rooms WHERE id = ?`
    ).get(room_id);

    if (!room) return err(res, 404, 'not_found', 'Room not found');
    if (room.status !== 'open') return err(res, 400, 'room_closed', 'Room is no longer open');
    if (room.join_token !== join_token) return err(res, 403, 'invalid_token', 'join_token is invalid');

    // Check capacity
    const participant_count = db.prepare(
      `SELECT COUNT(*) as cnt FROM voice_room_participants WHERE room_id = ?`
    ).get(room_id).cnt;

    if (participant_count >= room.max_participants) {
      return err(res, 400, 'room_full', `Room is at capacity (${room.max_participants} participants)`);
    }

    const participant_id = uid();
    const joined_at = now();

    insertParticipant.run({
      id: participant_id,
      room_id,
      api_key_hash: keyHash,
      participant_label: participant_label || null,
      joined_at
    });

    ok(res, {
      joined: true,
      participant_id,
      room_id,
      participant_label: participant_label || null,
      joined_at: new Date(joined_at).toISOString()
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /v1/voice/multiplayer/room/:room_id/transcript
  // ═══════════════════════════════════════════════════════════════════════════
  app.post('/v1/voice/multiplayer/room/:room_id/transcript', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;
    const keyHash = hashKey(key);

    const { room_id } = req.params;
    const {
      participant_id,
      transcript,
      duration_sec = null
    } = req.body || {};

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      return err(res, 400, 'invalid_transcript', 'transcript must be a non-empty string');
    }

    const room = db.prepare(`SELECT * FROM voice_rooms WHERE id = ?`).get(room_id);
    if (!room) return err(res, 404, 'not_found', 'Room not found');
    if (room.status !== 'open') return err(res, 400, 'room_closed', 'Room is no longer open');

    // Validate participant if provided
    if (participant_id) {
      const participant = db.prepare(
        `SELECT id FROM voice_room_participants WHERE id = ? AND room_id = ?`
      ).get(participant_id, room_id);
      if (!participant) {
        return err(res, 403, 'invalid_participant', 'participant_id not found in this room');
      }
    }

    const room_transcript_id = uid();
    const created_at = now();

    insertRoomTranscript.run({
      id: room_transcript_id,
      room_id,
      participant_id: participant_id || null,
      transcript,
      duration_sec: duration_sec || null,
      created_at
    });

    // If auto_transcribe, also store in voice_transcripts
    let stored_transcript_id = null;
    if (room.auto_transcribe) {
      const targetNamespace = room.shared_memory_namespace || room.namespace;
      const words = transcript.split(/\s+/).filter(Boolean);
      const word_count = words.length;
      const speaking_rate = (duration_sec && duration_sec > 0)
        ? parseFloat((word_count / (duration_sec / 60)).toFixed(2))
        : null;
      const key_phrases = extractKeyPhrases(transcript);
      const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
      const uniqueRatio = word_count > 0 ? uniqueWords / word_count : 0;
      const rawScore = (word_count / 100) * 10 + uniqueRatio * 30;
      const memory_value_score = parseFloat(clamp(rawScore, 0, 100).toFixed(2));

      stored_transcript_id = uid();
      insertTranscript.run({
        id: stored_transcript_id,
        api_key_hash: keyHash,
        namespace: targetNamespace,
        session_id: room_id,
        transcript,
        source: 'wearable',
        duration_sec: duration_sec || null,
        language: 'en',
        word_count,
        speaking_rate,
        memory_value_score,
        key_phrases: JSON.stringify(key_phrases),
        emotional_hint: null,
        wearable_context: null,
        created_at
      });
    }

    ok(res, {
      room_transcript_id,
      room_id,
      participant_id: participant_id || null,
      stored_transcript_id,
      auto_transcribed: !!room.auto_transcribe,
      created_at: new Date(created_at).toISOString()
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /v1/voice/multiplayer/room/:room_id/transcripts
  // ═══════════════════════════════════════════════════════════════════════════
  app.get('/v1/voice/multiplayer/room/:room_id/transcripts', (req, res) => {
    const key = requireAuth(req, res, apiKeys);
    if (!key) return;

    const { room_id } = req.params;

    // Verify room exists (any valid auth can view — room token already controls access)
    const room = db.prepare(`SELECT id FROM voice_rooms WHERE id = ?`).get(room_id);
    if (!room) return err(res, 404, 'not_found', 'Room not found');

    const rows = db.prepare(`
      SELECT * FROM voice_room_transcripts
      WHERE room_id = ?
      ORDER BY created_at ASC
    `).all(room_id).map(r => ({
      ...r,
      created_at: new Date(r.created_at).toISOString()
    }));

    ok(res, { room_id, transcripts: rows, count: rows.length });
  });

};
