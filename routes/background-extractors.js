'use strict';

/**
 * Background Extractors — Passive memory extraction and source discovery
 * routes/background-extractors.js
 *
 * Pure-JS extraction pipeline: tokenize → entity scan → density score →
 * candidate selection → Jaccard clustering → store memory chunks.
 * No external AI calls. All data scoped to the API key.
 *
 * Endpoints:
 *   POST   /v1/memory/background/extract       — extract memories from content
 *   GET    /v1/memory/background/runs          — list extraction runs
 *   GET    /v1/memory/background/runs/:run_id  — get run details
 *   DELETE /v1/memory/background/runs/:run_id  — delete run + memories
 *   GET    /v1/memory/background/memories      — list extracted memories
 *   POST   /v1/memory/discovery/scan           — multi-source discovery scan
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

// ── Pure-JS extraction helpers ───────────────────────────────────────────────

/**
 * Split text into sentences on `. `, `! `, `? `, and `\n`.
 * Trims and drops empty strings.
 */
function tokenizeSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Extract entities from a block of text.
 * Returns { names, dates, urls, codeBlockCount }.
 */
function extractEntities(text) {
  // URLs
  const urlRegex = /https?:\/\/[^\s"'<>)\]]+/g;
  const urls = (text.match(urlRegex) || []).map(u => u.replace(/[.,;:!?]$/, ''));

  // Dates: YYYY-MM-DD or Month DD YYYY (e.g. "January 15 2024", "Jan 15 2024")
  const isoDateRegex = /\b\d{4}-\d{2}-\d{2}\b/g;
  const naturalDateRegex = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/g;
  const dates = [
    ...(text.match(isoDateRegex) || []),
    ...(text.match(naturalDateRegex) || []),
  ];

  // Capitalized words (names/proper nouns): word starting with uppercase not at sentence start
  // Strategy: find tokens that are Title-cased and NOT the first word after punctuation
  const nameRegex = /(?<![.!?\n]\s{0,5})\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){0,3})\b/g;
  const rawNames = [];
  let m;
  while ((m = nameRegex.exec(text)) !== null) {
    const candidate = m[1];
    // Filter out common sentence-starting words that are always capitalized
    const stopWords = new Set(['The', 'A', 'An', 'This', 'That', 'These', 'Those', 'It', 'He', 'She', 'They', 'We', 'I', 'You', 'In', 'On', 'At', 'By', 'For', 'With', 'To', 'Of', 'And', 'But', 'Or', 'So', 'If', 'Is', 'Are', 'Was', 'Were', 'Be', 'Been', 'Being', 'Have', 'Has', 'Had', 'Do', 'Does', 'Did', 'Will', 'Would', 'Could', 'Should', 'May', 'Might', 'Must', 'Shall', 'Can', 'Not', 'No', 'Yes', 'Here', 'There', 'When', 'Where', 'What', 'Who', 'How', 'Why']);
    const firstWord = candidate.split(' ')[0];
    if (!stopWords.has(firstWord) && candidate.length > 1) {
      rawNames.push(candidate);
    }
  }
  const names = [...new Set(rawNames)];

  // Code blocks: fenced ```...``` or 4-space-indented lines
  const fencedBlocks = (text.match(/```[\s\S]*?```/g) || []);
  const indentedLines = text.split('\n').filter(l => /^    \S/.test(l));
  const codeBlockCount = fencedBlocks.length + (indentedLines.length > 0 ? 1 : 0);

  return { names, dates, urls, codeBlockCount };
}

/**
 * Compute information density for a block of text.
 * Returns unique_words / total_words * 100, capped 0–100.
 */
function computeDensity(text) {
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 1);
  if (words.length === 0) return 0;
  const uniqueWords = new Set(words).size;
  return Math.min(100, Math.max(0, (uniqueWords / words.length) * 100));
}

/**
 * Identify memory candidates from sentences.
 * A candidate is any sentence with > 8 words AND
 * (contains a named entity OR a date OR a code fragment).
 */
function identifyCandidates(sentences, entities) {
  const entitySet = new Set([
    ...entities.names.map(n => n.toLowerCase()),
    ...entities.dates,
    ...entities.urls,
  ]);

  return sentences.filter(sentence => {
    const words = sentence.split(/\s+/).filter(w => w.length > 0);
    if (words.length <= 8) return false;

    // Check for code markers
    if (/```|^\s{4}\S/.test(sentence)) return true;

    // Check for date-like patterns
    if (/\d{4}-\d{2}-\d{2}/.test(sentence)) return true;
    if (/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/.test(sentence)) return true;

    // Check for URL
    if (/https?:\/\//.test(sentence)) return true;

    // Check for named entities
    const lower = sentence.toLowerCase();
    for (const entity of entitySet) {
      if (entity.length > 1 && lower.includes(entity)) return true;
    }

    return false;
  });
}

/**
 * Jaccard token overlap score [0..1] — same algo as graphrag.js.
 */
function jaccardScore(a, b) {
  if (!a && !b) return 0;
  const tokA = new Set((a || '').toLowerCase().split(/\W+/).filter(t => t.length > 1));
  const tokB = new Set((b || '').toLowerCase().split(/\W+/).filter(t => t.length > 1));
  if (tokA.size === 0 && tokB.size === 0) return 0;
  const intersection = [...tokA].filter(t => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Cluster sentences by Jaccard keyword overlap.
 * Sentences where Jaccard > 0.15 with any cluster member are merged into that cluster.
 * Returns array of clusters, each cluster is an array of sentences.
 */
function clusterByJaccard(sentences, threshold = 0.15) {
  const clusters = [];

  for (const sentence of sentences) {
    let placed = false;
    for (const cluster of clusters) {
      // Compare against all members; join if overlaps with any
      for (const member of cluster) {
        if (jaccardScore(sentence, member) > threshold) {
          cluster.push(sentence);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      clusters.push([sentence]);
    }
  }

  return clusters;
}

/**
 * Full extraction pipeline: text → memory chunks.
 * Returns { chunks, entities, densityScore }.
 * chunks = array of strings, each is a memory chunk (cluster joined as sentences).
 */
function runExtractionPipeline(content) {
  const sentences = tokenizeSentences(content);
  const entities = extractEntities(content);
  const densityScore = computeDensity(content);
  const candidates = identifyCandidates(sentences, entities);
  const clusters = clusterByJaccard(candidates);

  // Each cluster becomes one memory chunk: join its sentences
  const chunks = clusters.map(cluster => cluster.join(' '));

  return { chunks, entities, densityScore };
}

// ── Module export ─────────────────────────────────────────────────────────────

module.exports = function (app, db, apiKeys) {

  // ── Schema bootstrap ────────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS background_runs (
      id                 TEXT PRIMARY KEY,
      api_key_hash       TEXT NOT NULL,
      namespace          TEXT NOT NULL DEFAULT 'default',
      source_type        TEXT,
      source_id          TEXT,
      content_length     INTEGER,
      memories_extracted INTEGER DEFAULT 0,
      density_score      REAL,
      entities_json      TEXT,
      auto_dream         INTEGER DEFAULT 0,
      dream_incubation_id TEXT,
      status             TEXT DEFAULT 'complete',
      created_at         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bgruns_key ON background_runs(api_key_hash, created_at);

    CREATE TABLE IF NOT EXISTS background_extracted_memories (
      id           TEXT PRIMARY KEY,
      run_id       TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      namespace    TEXT NOT NULL DEFAULT 'default',
      content      TEXT NOT NULL,
      source_type  TEXT,
      chunk_index  INTEGER,
      density_score REAL,
      entities_json TEXT,
      tags         TEXT,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bgmem_run ON background_extracted_memories(run_id);
    CREATE INDEX IF NOT EXISTS idx_bgmem_key ON background_extracted_memories(api_key_hash, namespace, created_at);

    CREATE TABLE IF NOT EXISTS discovery_scans (
      id              TEXT PRIMARY KEY,
      api_key_hash    TEXT NOT NULL,
      namespace       TEXT NOT NULL DEFAULT 'default',
      sources_count   INTEGER,
      extracted_count INTEGER,
      total_memories  INTEGER,
      results_json    TEXT,
      created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discscans_key ON discovery_scans(api_key_hash, created_at);
  `);

  // ── POST /v1/memory/background/extract ───────────────────────────────────────

  app.post('/v1/memory/background/extract', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const {
      content,
      source_type = 'document',
      source_id = null,
      namespace = 'default',
      auto_dream = false,
      tags = [],
    } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return err(res, 422, 'missing_field', 'content is required and must be a non-empty string');
    }

    const VALID_SOURCE_TYPES = ['conversation', 'document', 'code', 'journal', 'web', 'file'];
    const resolvedSourceType = VALID_SOURCE_TYPES.includes(source_type) ? source_type : 'document';

    const api_key_hash = hashKey(apiKey);
    const now = Date.now();
    const run_id = 'bgrun_' + crypto.randomUUID().replace(/-/g, '');

    // Run pipeline
    const { chunks, entities, densityScore } = runExtractionPipeline(content);

    // Compute per-chunk density and store each memory
    const memoryIds = [];
    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
    const chunkEntities = extractEntities(content); // entities are document-level

    const insertMem = db.prepare(`
      INSERT INTO background_extracted_memories
        (id, run_id, api_key_hash, namespace, content, source_type, chunk_index, density_score, entities_json, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < chunks.length; i++) {
      const memId = 'bgmem_' + crypto.randomUUID().replace(/-/g, '');
      const chunkDensity = computeDensity(chunks[i]);
      const chunkEntitiesJson = JSON.stringify(extractEntities(chunks[i]));
      insertMem.run(
        memId,
        run_id,
        api_key_hash,
        namespace,
        chunks[i],
        resolvedSourceType,
        i,
        chunkDensity,
        chunkEntitiesJson,
        tagsJson,
        now
      );
      memoryIds.push(memId);
    }

    // Handle auto_dream: queue into dream_incubation_runs if table exists
    let dreamIncubationId = null;
    if (auto_dream && memoryIds.length > 0) {
      dreamIncubationId = 'dream_' + crypto.randomUUID().replace(/-/g, '');
      try {
        db.prepare(`
          INSERT INTO dream_incubation_runs
            (id, api_key_hash, namespace, status, source, memory_ids_json, created_at)
          VALUES (?, ?, ?, 'queued', 'background_extract', ?, ?)
        `).run(dreamIncubationId, api_key_hash, namespace, JSON.stringify(memoryIds), now);
      } catch (_) {
        // dream_incubation_runs table may not exist yet; skip silently
        dreamIncubationId = null;
      }
    }

    // Store run metadata
    db.prepare(`
      INSERT INTO background_runs
        (id, api_key_hash, namespace, source_type, source_id, content_length,
         memories_extracted, density_score, entities_json, auto_dream,
         dream_incubation_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete', ?)
    `).run(
      run_id,
      api_key_hash,
      namespace,
      resolvedSourceType,
      source_id || null,
      content.length,
      memoryIds.length,
      densityScore,
      JSON.stringify(entities),
      auto_dream ? 1 : 0,
      dreamIncubationId,
      now
    );

    ok(res, {
      run_id,
      memories_extracted: memoryIds.length,
      memory_ids: memoryIds,
      entities_found: {
        names: entities.names,
        dates: entities.dates,
        urls: entities.urls,
        code_blocks: entities.codeBlockCount,
      },
      density_score: parseFloat(densityScore.toFixed(2)),
      auto_dream_queued: dreamIncubationId !== null,
      source_type: resolvedSourceType,
      created_at: new Date(now).toISOString(),
    });
  });

  // ── GET /v1/memory/background/runs ───────────────────────────────────────────

  app.get('/v1/memory/background/runs', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const api_key_hash = hashKey(apiKey);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 200);
    const namespace = req.query.namespace || null;

    let query = `
      SELECT id, namespace, source_type, source_id, content_length,
             memories_extracted, density_score, entities_json, auto_dream,
             dream_incubation_id, status, created_at
      FROM background_runs
      WHERE api_key_hash = ?
    `;
    const params = [api_key_hash];

    if (namespace) {
      query += ' AND namespace = ?';
      params.push(namespace);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const runs = db.prepare(query).all(...params);

    ok(res, {
      runs: runs.map(r => ({
        run_id: r.id,
        namespace: r.namespace,
        source_type: r.source_type,
        source_id: r.source_id,
        content_length: r.content_length,
        memories_extracted: r.memories_extracted,
        density_score: r.density_score !== null ? parseFloat(r.density_score.toFixed(2)) : null,
        entities: r.entities_json ? JSON.parse(r.entities_json) : null,
        auto_dream: r.auto_dream === 1,
        dream_incubation_id: r.dream_incubation_id,
        status: r.status,
        created_at: new Date(r.created_at).toISOString(),
      })),
      count: runs.length,
    });
  });

  // ── GET /v1/memory/background/runs/:run_id ───────────────────────────────────

  app.get('/v1/memory/background/runs/:run_id', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const api_key_hash = hashKey(apiKey);
    const { run_id } = req.params;

    const run = db.prepare(`
      SELECT id, namespace, source_type, source_id, content_length,
             memories_extracted, density_score, entities_json, auto_dream,
             dream_incubation_id, status, created_at
      FROM background_runs
      WHERE id = ? AND api_key_hash = ?
    `).get(run_id, api_key_hash);

    if (!run) return err(res, 404, 'run_not_found', `Run ${run_id} not found`);

    const memories = db.prepare(`
      SELECT id, content, source_type, chunk_index, density_score, entities_json, tags, created_at
      FROM background_extracted_memories
      WHERE run_id = ? AND api_key_hash = ?
      ORDER BY chunk_index ASC
    `).all(run_id, api_key_hash);

    ok(res, {
      run_id: run.id,
      namespace: run.namespace,
      source_type: run.source_type,
      source_id: run.source_id,
      content_length: run.content_length,
      memories_extracted: run.memories_extracted,
      density_score: run.density_score !== null ? parseFloat(run.density_score.toFixed(2)) : null,
      entities: run.entities_json ? JSON.parse(run.entities_json) : null,
      auto_dream: run.auto_dream === 1,
      dream_incubation_id: run.dream_incubation_id,
      status: run.status,
      created_at: new Date(run.created_at).toISOString(),
      memories: memories.map(m => ({
        memory_id: m.id,
        content: m.content,
        source_type: m.source_type,
        chunk_index: m.chunk_index,
        density_score: m.density_score !== null ? parseFloat(m.density_score.toFixed(2)) : null,
        entities: m.entities_json ? JSON.parse(m.entities_json) : null,
        tags: m.tags ? JSON.parse(m.tags) : [],
        created_at: new Date(m.created_at).toISOString(),
      })),
    });
  });

  // ── DELETE /v1/memory/background/runs/:run_id ────────────────────────────────

  app.delete('/v1/memory/background/runs/:run_id', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const api_key_hash = hashKey(apiKey);
    const { run_id } = req.params;

    const run = db.prepare(`
      SELECT id FROM background_runs WHERE id = ? AND api_key_hash = ?
    `).get(run_id, api_key_hash);

    if (!run) return err(res, 404, 'run_not_found', `Run ${run_id} not found`);

    const memResult = db.prepare(`
      DELETE FROM background_extracted_memories WHERE run_id = ? AND api_key_hash = ?
    `).run(run_id, api_key_hash);

    db.prepare(`DELETE FROM background_runs WHERE id = ? AND api_key_hash = ?`)
      .run(run_id, api_key_hash);

    ok(res, {
      deleted: true,
      run_id,
      memories_removed: memResult.changes,
    });
  });

  // ── GET /v1/memory/background/memories ───────────────────────────────────────

  app.get('/v1/memory/background/memories', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const api_key_hash = hashKey(apiKey);
    const namespace = req.query.namespace || null;
    const source_type = req.query.source_type || null;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 500);

    let query = `
      SELECT id, run_id, namespace, content, source_type, chunk_index,
             density_score, entities_json, tags, created_at
      FROM background_extracted_memories
      WHERE api_key_hash = ?
    `;
    const params = [api_key_hash];

    if (namespace) {
      query += ' AND namespace = ?';
      params.push(namespace);
    }
    if (source_type) {
      query += ' AND source_type = ?';
      params.push(source_type);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const memories = db.prepare(query).all(...params);

    ok(res, {
      memories: memories.map(m => ({
        memory_id: m.id,
        run_id: m.run_id,
        namespace: m.namespace,
        content: m.content,
        source_type: m.source_type,
        chunk_index: m.chunk_index,
        density_score: m.density_score !== null ? parseFloat(m.density_score.toFixed(2)) : null,
        entities: m.entities_json ? JSON.parse(m.entities_json) : null,
        tags: m.tags ? JSON.parse(m.tags) : [],
        created_at: new Date(m.created_at).toISOString(),
      })),
      count: memories.length,
    });
  });

  // ── POST /v1/memory/discovery/scan ───────────────────────────────────────────

  app.post('/v1/memory/discovery/scan', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const {
      sources = [],
      namespace = 'default',
      auto_extract = true,
      min_density_threshold = 20,
    } = req.body;

    if (!Array.isArray(sources) || sources.length === 0) {
      return err(res, 422, 'missing_field', 'sources must be a non-empty array');
    }
    if (sources.length > 50) {
      return err(res, 422, 'too_many_sources', 'Maximum 50 sources per scan');
    }

    const api_key_hash = hashKey(apiKey);
    const now = Date.now();
    const scan_id = 'scan_' + crypto.randomUUID().replace(/-/g, '');
    const threshold = Math.max(0, Math.min(100, parseFloat(min_density_threshold) || 20));

    const scanResults = [];
    let totalMemoriesCreated = 0;
    let extractedCount = 0;

    const insertMem = db.prepare(`
      INSERT INTO background_extracted_memories
        (id, run_id, api_key_hash, namespace, content, source_type, chunk_index, density_score, entities_json, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertRun = db.prepare(`
      INSERT INTO background_runs
        (id, api_key_hash, namespace, source_type, source_id, content_length,
         memories_extracted, density_score, entities_json, auto_dream,
         dream_incubation_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'complete', ?)
    `);

    for (let idx = 0; idx < sources.length; idx++) {
      const source = sources[idx];
      const sourceName = source.name || source.url || `source_${idx}`;
      const sourceType = source.type || 'text';

      let contentToProcess = null;
      let densityScore = 0;
      let isUrlHint = false;

      if (sourceType === 'url_hint') {
        // Don't fetch URL — store the hint as a low-density memory record
        isUrlHint = true;
        const hintContent = `URL: ${source.url || '(no url)'}${source.description ? ' — ' + source.description : ''}`;
        densityScore = computeDensity(hintContent);
        contentToProcess = hintContent;
      } else if (sourceType === 'key_value_pairs') {
        // Serialize to "key: value\n" lines
        const data = source.data && typeof source.data === 'object' ? source.data : {};
        contentToProcess = Object.entries(data)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
          .join('\n');
        densityScore = computeDensity(contentToProcess);
      } else {
        // type === 'text' or unknown
        contentToProcess = typeof source.content === 'string' ? source.content : '';
        densityScore = computeDensity(contentToProcess);
      }

      const meetsThreshold = densityScore >= threshold;
      const shouldExtract = auto_extract && meetsThreshold && contentToProcess.trim().length > 0;
      let memoryCount = 0;
      let runId = null;

      if (isUrlHint) {
        // Always store url_hint as a single low-density memory record (no pipeline)
        runId = 'bgrun_' + crypto.randomUUID().replace(/-/g, '');
        const memId = 'bgmem_' + crypto.randomUUID().replace(/-/g, '');
        insertMem.run(
          memId, runId, api_key_hash, namespace,
          contentToProcess, 'web', 0,
          parseFloat(densityScore.toFixed(2)),
          JSON.stringify({ names: [], dates: [], urls: source.url ? [source.url] : [], codeBlockCount: 0 }),
          JSON.stringify([]),
          now
        );
        insertRun.run(
          runId, api_key_hash, namespace, 'web',
          source.url || null, contentToProcess.length,
          1, parseFloat(densityScore.toFixed(2)),
          JSON.stringify({ names: [], dates: [], urls: source.url ? [source.url] : [], codeBlockCount: 0 }),
          now
        );
        memoryCount = 1;
        totalMemoriesCreated += 1;
        extractedCount += 1;

        scanResults.push({
          source_name: sourceName,
          type: sourceType,
          density_score: parseFloat(densityScore.toFixed(2)),
          extracted: true,
          memory_count: memoryCount,
          note: 'url_hint stored without fetching (background mode)',
        });
        continue;
      }

      if (shouldExtract) {
        const { chunks, entities, densityScore: pipelineDensity } = runExtractionPipeline(contentToProcess);
        runId = 'bgrun_' + crypto.randomUUID().replace(/-/g, '');

        for (let ci = 0; ci < chunks.length; ci++) {
          const memId = 'bgmem_' + crypto.randomUUID().replace(/-/g, '');
          const chunkDensity = computeDensity(chunks[ci]);
          const chunkEntitiesJson = JSON.stringify(extractEntities(chunks[ci]));
          insertMem.run(
            memId, runId, api_key_hash, namespace,
            chunks[ci], sourceType, ci,
            parseFloat(chunkDensity.toFixed(2)),
            chunkEntitiesJson,
            JSON.stringify([]),
            now
          );
        }

        insertRun.run(
          runId, api_key_hash, namespace, sourceType,
          source.name || null, contentToProcess.length,
          chunks.length, parseFloat(pipelineDensity.toFixed(2)),
          JSON.stringify(entities),
          now
        );

        memoryCount = chunks.length;
        totalMemoriesCreated += memoryCount;
        extractedCount += 1;
      }

      scanResults.push({
        source_name: sourceName,
        type: sourceType,
        density_score: parseFloat(densityScore.toFixed(2)),
        extracted: shouldExtract,
        memory_count: memoryCount,
        ...(shouldExtract ? {} : {
          skipped_reason: meetsThreshold
            ? 'auto_extract is false'
            : `density ${densityScore.toFixed(1)} below threshold ${threshold}`,
        }),
      });
    }

    const skippedCount = sources.length - extractedCount;

    // Store scan record
    db.prepare(`
      INSERT INTO discovery_scans
        (id, api_key_hash, namespace, sources_count, extracted_count, total_memories, results_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      scan_id, api_key_hash, namespace,
      sources.length, extractedCount, totalMemoriesCreated,
      JSON.stringify(scanResults),
      now
    );

    ok(res, {
      scan_id,
      sources_scanned: sources.length,
      sources_extracted: extractedCount,
      sources_skipped: skippedCount,
      total_memories_created: totalMemoriesCreated,
      scan_results: scanResults,
      namespace,
      created_at: new Date(now).toISOString(),
    });
  });

};
