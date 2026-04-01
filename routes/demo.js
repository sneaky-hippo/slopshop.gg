'use strict';
const crypto = require('crypto');

// In-memory IP rate limit store
const demoIpLimits = new Map();
function demoRateLimit(ip) {
  const now = Date.now();
  const window = 3600000; // 1 hour
  const max = 10; // 10 demo requests per IP per hour
  const entry = demoIpLimits.get(ip) || { count: 0, start: now };
  if (now - entry.start > window) { demoIpLimits.set(ip, { count: 1, start: now }); return true; }
  entry.count++;
  demoIpLimits.set(ip, entry);
  return entry.count <= max;
}

module.exports = function(app, db, apiKeys) {

  // ── POST /v1/demo/extract ──────────────────────────────────────────────────
  app.post('/v1/demo/extract', (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || '0.0.0.0';
    if (!demoRateLimit(ip)) {
      return res.status(429).json({ ok: false, error: { code: 'rate_limited', message: 'Demo limit reached (10/hour). Sign in for unlimited access.' } });
    }

    let { content } = req.body || {};
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(422).json({ ok: false, error: { code: 'missing_content' } });
    }

    // Trim to max 5000 chars
    content = content.trim().slice(0, 5000);

    // Tokenize into sentences
    const sentences = content
      .split(/(?<=[\.\!\?])\s+|(?<=\n)\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Extract entities: capitalized mid-sentence words, dates, URLs
    const dateRegex = /\b(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/gi;
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const capWordRegex = /(?<![.!?\n]\s)(?<!\A)\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})*)\b/g;

    function extractEntities(text) {
      const entities = new Set();
      // Dates
      for (const m of text.matchAll(dateRegex)) entities.add(m[0]);
      // URLs
      for (const m of text.matchAll(urlRegex)) entities.add(m[0]);
      // Capitalized words not at start of sentence
      const words = text.split(/\s+/);
      for (let i = 1; i < words.length; i++) {
        const w = words[i].replace(/[^a-zA-Z]/g, '');
        if (w.length > 1 && /^[A-Z]/.test(w)) entities.add(w);
      }
      return [...entities];
    }

    // Density: unique_words / total_words * 100
    const allWords = content.toLowerCase().match(/\b\w+\b/g) || [];
    const uniqueWords = new Set(allWords);
    const densityScore = allWords.length > 0
      ? Math.round((uniqueWords.size / allWords.length) * 1000) / 10
      : 0;

    // Filter filler sentences — keep ones with >6 words and a named entity or specific detail
    const fillerStartRe = /^(the|a|an|this|that|these|those|it|they|we|i|you|he|she)\b/i;
    const candidates = sentences.filter(s => {
      const words = s.split(/\s+/);
      if (words.length <= 6) return false;
      if (fillerStartRe.test(s)) {
        // Only keep if it has an extracted entity
        const ents = extractEntities(s);
        return ents.length > 0;
      }
      return true;
    });

    // Jaccard clustering: group candidates where word overlap > 0.2
    function jaccardSimilarity(a, b) {
      const setA = new Set(a.toLowerCase().match(/\b\w+\b/g) || []);
      const setB = new Set(b.toLowerCase().match(/\b\w+\b/g) || []);
      const intersection = [...setA].filter(w => setB.has(w)).length;
      const union = new Set([...setA, ...setB]).size;
      return union === 0 ? 0 : intersection / union;
    }

    const clusters = [];
    const used = new Set();
    for (let i = 0; i < candidates.length; i++) {
      if (used.has(i)) continue;
      const group = [candidates[i]];
      for (let j = i + 1; j < candidates.length; j++) {
        if (used.has(j)) continue;
        if (jaccardSimilarity(candidates[i], candidates[j]) > 0.2) {
          group.push(candidates[j]);
          used.add(j);
        }
      }
      used.add(i);
      // Merge: pick the longest sentence from the cluster as representative
      const representative = group.reduce((a, b) => a.length >= b.length ? a : b);
      clusters.push(representative);
    }

    // Build up to 8 memory fragments
    const memories = clusters.slice(0, 8).map((content, idx) => ({
      content,
      chunk_index: idx,
      entities: extractEntities(content)
    }));

    return res.json({
      ok: true,
      memories,
      memories_extracted: memories.length,
      density_score: densityScore,
      demo: true
    });
  });

  // ── POST /v1/demo/score ────────────────────────────────────────────────────
  app.post('/v1/demo/score', (req, res) => {
    const body = req.body || {};

    const sleep  = Math.min(parseFloat(body.sleep_hours)  || 7, 10) / 10;
    const focus  = Math.min(parseFloat(body.focus_score)  || 5, 10) / 10;
    const days   = Math.min(parseInt(body.days_active)    || 0, 90) / 90;
    const voice  = body.has_voice_journal ? 0.1 : 0;
    const team   = body.has_team          ? 0.1 : 0;
    const raw    = (sleep * 0.25 + focus * 0.3 + days * 0.3 + voice + team) * 100 + 10;
    const score  = Math.round(Math.min(raw, 100));

    let rank;
    if      (score <= 20) rank = 'Spark';
    else if (score <= 40) rank = 'Ember';
    else if (score <= 60) rank = 'Flame';
    else if (score <= 80) rank = 'Blaze';
    else                  rank = 'Inferno';

    return res.json({ ok: true, score, rank, demo: true });
  });

  // ── GET /v1/demo/status ────────────────────────────────────────────────────
  app.get('/v1/demo/status', (req, res) => {
    const stats = {};
    try { stats.api_count = 1427; } catch (_) {}
    try { stats.memory_nodes    = db.prepare('SELECT COUNT(*) as c FROM graphrag_nodes').get()?.c || 0; }    catch (_) { stats.memory_nodes = 0; }
    try { stats.dream_sessions  = db.prepare('SELECT COUNT(*) as c FROM dream_sessions WHERE status = ?').get('complete')?.c || 0; } catch (_) { stats.dream_sessions = 0; }
    try { stats.users           = db.prepare('SELECT COUNT(*) as c FROM users').get()?.c || 0; }             catch (_) { stats.users = 0; }
    return res.json({ ok: true, ...stats, demo: true });
  });

};
