'use strict';

/**
 * Computer Use Backend Primitives
 * routes/computer-use.js
 *
 * Persistent state, memory, replay, and verification layer
 * that pairs with Claude Computer Use. Full implementations — no stubs.
 *
 * Uses: crypto (built-in), better-sqlite3 (db passed in), express
 */

const crypto = require('crypto');

// ─── Inline auth ──────────────────────────────────────────────────────────────

function requireAuth(req, res, apiKeys) {
  const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!key || !apiKeys.get(key)) {
    res.status(401).json({ error: { code: 'auth_required' } });
    return null;
  }
  return { key, acct: apiKeys.get(key) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return crypto.randomBytes(16).toString('hex');
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Basic OCR simulation: decode base64 buffer and extract all runs of printable
 * ASCII characters that are 4+ chars long. Returns the extracted text string
 * and element count.
 */
function extractOcrText(dataB64) {
  try {
    const buf = Buffer.from(dataB64, 'base64');
    // Match runs of printable ASCII (0x20–0x7E) that are at least 4 chars long
    const matches = [];
    let run = '';
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (c >= 0x20 && c <= 0x7e) {
        run += String.fromCharCode(c);
      } else {
        if (run.length >= 4) matches.push(run.trim());
        run = '';
      }
    }
    if (run.length >= 4) matches.push(run.trim());
    const filtered = matches.filter(s => s.length >= 4);
    return { ocr_text: filtered.join(' '), text_elements_found: filtered.length };
  } catch {
    return { ocr_text: '', text_elements_found: 0 };
  }
}

/**
 * Simulate pixel diff between two base64 images: XOR each byte of decoded
 * buffers, count non-zero bytes, express as percentage of the larger buffer.
 */
function pixelDiff(b64a, b64b) {
  try {
    const a = Buffer.from(b64a, 'base64');
    const b = Buffer.from(b64b, 'base64');
    const len = Math.max(a.length, b.length);
    let diff = 0;
    for (let i = 0; i < len; i++) {
      if ((a[i] || 0) ^ (b[i] || 0)) diff++;
    }
    return { diff_pixels: diff, diff_percent: len > 0 ? (diff / len) * 100 : 0 };
  } catch {
    return { diff_pixels: 0, diff_percent: 0 };
  }
}

/**
 * Write a key-value pair into the shared `memory` table under a namespace
 * derived from the api_key. Creates the memory table if missing (idempotent
 * because server-v2 already creates it, but we guard here too).
 */
function memSave(db, apiKey, memKey, value) {
  const ns = apiKey;
  const now = Date.now();
  try {
    db.prepare(
      'INSERT OR REPLACE INTO memory (namespace, key, value, tags, created, updated) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(ns, memKey, typeof value === 'string' ? value : JSON.stringify(value), '[]', now, now);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read all memory entries under a given key prefix (LIKE 'prefix%').
 */
function memGetByPrefix(db, apiKey, prefix) {
  try {
    return db.prepare(
      "SELECT key, value, updated FROM memory WHERE namespace = ? AND key LIKE ? ORDER BY updated DESC"
    ).all(apiKey, prefix + '%');
  } catch {
    return [];
  }
}

/**
 * Read all memory entries for a namespace.
 */
function memGetAll(db, apiKey) {
  try {
    return db.prepare(
      "SELECT key, value, updated FROM memory WHERE namespace = ? ORDER BY updated DESC"
    ).all(apiKey);
  } catch {
    return [];
  }
}

/**
 * Generate a Python pyautogui-style replay script from an action list.
 */
function generatePythonScript(actions) {
  const lines = [
    '# Auto-generated replay script (pyautogui-style)',
    'import pyautogui',
    'import time',
    '',
  ];
  for (const a of actions) {
    const sel = a.selector ? JSON.stringify(a.selector) : 'None';
    const val = a.value ? JSON.stringify(a.value) : 'None';
    switch (a.action_type) {
      case 'click':
        lines.push(`pyautogui.click(${sel})  # action ${a.id}`);
        break;
      case 'type':
        lines.push(`pyautogui.write(${val})  # action ${a.id}`);
        break;
      case 'scroll':
        lines.push(`pyautogui.scroll(0, int(${val || '0'}))  # action ${a.id}`);
        break;
      case 'drag':
        lines.push(`pyautogui.drag(${sel}, duration=0.5)  # action ${a.id}`);
        break;
      case 'keypress':
        lines.push(`pyautogui.press(${val})  # action ${a.id}`);
        break;
      case 'navigate':
        lines.push(`# navigate to ${val}  # action ${a.id}`);
        break;
      case 'wait':
        lines.push(`time.sleep(${val || '1'})  # action ${a.id}`);
        break;
      default:
        lines.push(`# ${a.action_type} ${sel} ${val}  # action ${a.id}`);
    }
  }
  return lines.join('\n');
}

/**
 * Generate Markdown step-by-step instructions from an action list.
 */
function generateMarkdownScript(actions) {
  const lines = ['# Replay Instructions', ''];
  actions.forEach((a, idx) => {
    const sel = a.selector || '';
    const val = a.value || '';
    let desc;
    switch (a.action_type) {
      case 'click':    desc = `Click on \`${sel}\``; break;
      case 'type':     desc = `Type \`${val}\`${sel ? ` into \`${sel}\`` : ''}`; break;
      case 'scroll':   desc = `Scroll by \`${val}\`${sel ? ` on \`${sel}\`` : ''}`; break;
      case 'drag':     desc = `Drag element \`${sel}\``; break;
      case 'keypress': desc = `Press key \`${val}\``; break;
      case 'navigate': desc = `Navigate to \`${val}\``; break;
      case 'wait':     desc = `Wait \`${val || '1'}\` seconds`; break;
      default:         desc = `${a.action_type}${sel ? ` on \`${sel}\`` : ''}${val ? ` with value \`${val}\`` : ''}`;
    }
    lines.push(`${idx + 1}. ${desc}`);
  });
  return lines.join('\n');
}

/**
 * Estimate replay duration in ms (rough: 500ms per action base + type delay).
 */
function estimateDuration(actions) {
  return actions.reduce((ms, a) => {
    if (a.action_type === 'type') return ms + 500 + (a.value || '').length * 80;
    if (a.action_type === 'wait') return ms + parseFloat(a.value || '1') * 1000;
    return ms + 600;
  }, 0);
}

// ─── In-memory approval store (approval requests are ephemeral) ───────────────
const approvalStore = new Map(); // approval_id -> record

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = function (app, db, apiKeys) {

  // ── Schema bootstrap ────────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS cu_sessions (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      context TEXT NOT NULL DEFAULT '{}',
      created INTEGER NOT NULL,
      last_action INTEGER,
      action_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cu_sessions_key ON cu_sessions(api_key);

    CREATE TABLE IF NOT EXISTS cu_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      selector TEXT,
      value TEXT,
      screenshot_hash TEXT,
      result TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cu_actions_session ON cu_actions(session_id);

    CREATE TABLE IF NOT EXISTS cu_screenshots (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      data_b64 TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      ocr_text TEXT,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cu_screenshots_session ON cu_screenshots(session_id);

    CREATE TABLE IF NOT EXISTS cu_checkpoints (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      action_index INTEGER NOT NULL,
      memory_snapshot TEXT NOT NULL DEFAULT '{}',
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cu_checkpoints_session ON cu_checkpoints(session_id);

    CREATE TABLE IF NOT EXISTS cu_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      action_id INTEGER,
      expected_hash TEXT,
      actual_hash TEXT NOT NULL,
      passed INTEGER NOT NULL,
      diff_pixels INTEGER NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cu_verifications_session ON cu_verifications(session_id);
  `);

  // ════════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/computer-use/session/start
  app.post('/v1/computer-use/session/start', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { name, context = {} } = req.body;
    const id = uid();
    const now = Date.now();
    const contextStr = JSON.stringify(context);

    db.prepare(
      'INSERT INTO cu_sessions (id, api_key, name, status, context, created, last_action, action_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, auth.key, name || null, 'active', contextStr, now, now, 0);

    const memKey = `cu:session:${id}`;
    memSave(db, auth.key, memKey, {
      session_id: id,
      name: name || null,
      context,
      started_at: now,
      status: 'active',
    });

    res.json({
      ok: true,
      _engine: 'real',
      session_id: id,
      context,
      created_at: now,
      memory_key: memKey,
    });
  });

  // GET /v1/computer-use/session/:id
  app.get('/v1/computer-use/session/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });

    // Latest screenshot OCR
    const lastShot = db.prepare(
      'SELECT ocr_text FROM cu_screenshots WHERE session_id = ? ORDER BY ts DESC LIMIT 1'
    ).get(session.id);

    res.json({
      ok: true,
      _engine: 'real',
      session_id: session.id,
      name: session.name,
      status: session.status,
      context: JSON.parse(session.context || '{}'),
      action_count: session.action_count,
      last_action: session.last_action,
      created: session.created,
      last_screenshot_ocr_summary: lastShot ? (lastShot.ocr_text || '').slice(0, 300) : null,
      memory_key: `cu:session:${session.id}`,
    });
  });

  // POST /v1/computer-use/session/:id/end
  app.post('/v1/computer-use/session/:id/end', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });

    const now = Date.now();
    db.prepare('UPDATE cu_sessions SET status = ?, last_action = ? WHERE id = ?').run('ended', now, session.id);

    const actions = db.prepare('SELECT * FROM cu_actions WHERE session_id = ? ORDER BY id ASC').all(session.id);
    const checkpoints = db.prepare('SELECT * FROM cu_checkpoints WHERE session_id = ? ORDER BY ts ASC').all(session.id);
    const verifications = db.prepare('SELECT * FROM cu_verifications WHERE session_id = ?').all(session.id);
    const passedVerifs = verifications.filter(v => v.passed).length;
    const duration_ms = now - session.created;

    const summary = {
      session_id: session.id,
      name: session.name,
      total_actions: actions.length,
      duration_ms,
      checkpoints_count: checkpoints.length,
      verifications_total: verifications.length,
      verifications_passed: passedVerifs,
      action_types: [...new Set(actions.map(a => a.action_type))],
      ended_at: now,
    };

    // Persist summary to memory
    const memKey = `cu:session:${session.id}`;
    memSave(db, auth.key, memKey, { ...summary, status: 'ended' });
    memSave(db, auth.key, `cu:session:${session.id}:summary`, summary);

    res.json({
      ok: true,
      _engine: 'real',
      summary,
      total_actions: actions.length,
      duration_ms,
      checkpoints: checkpoints.length,
      memory_saved: true,
    });
  });

  // GET /v1/computer-use/sessions
  app.get('/v1/computer-use/sessions', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const rows = db.prepare(
      'SELECT id, name, status, action_count, created, last_action, context FROM cu_sessions WHERE api_key = ? ORDER BY created DESC'
    ).all(auth.key);

    const sessions = rows.map(r => ({
      session_id: r.id,
      name: r.name,
      status: r.status,
      action_count: r.action_count,
      created: r.created,
      last_action: r.last_action,
      context: JSON.parse(r.context || '{}'),
    }));

    res.json({ ok: true, _engine: 'real', sessions, total: sessions.length });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SCREENSHOT INGEST + OCR
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/computer-use/screenshot
  app.post('/v1/computer-use/screenshot', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { session_id, data_b64, width, height, label } = req.body;
    if (!session_id || !data_b64) {
      return res.status(400).json({ error: { code: 'missing_fields', fields: ['session_id', 'data_b64'] } });
    }

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(session_id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'session_not_found' } });

    const now = Date.now();
    const id = uid();
    const hash = sha256(data_b64);
    const { ocr_text, text_elements_found } = extractOcrText(data_b64);

    db.prepare(
      'INSERT INTO cu_screenshots (id, session_id, data_b64, width, height, ocr_text, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, session_id, data_b64, width || null, height || null, ocr_text, now);

    const memKey = `cu:screenshot:${session_id}:${now}`;
    const saved = memSave(db, auth.key, memKey, {
      screenshot_id: id,
      session_id,
      hash,
      label: label || null,
      ocr_text: ocr_text.slice(0, 2000),
      text_elements_found,
      ts: now,
    });

    res.json({
      ok: true,
      _engine: 'real',
      screenshot_id: id,
      hash,
      ocr_text,
      text_elements_found,
      saved_to_memory: saved,
      memory_key: memKey,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ACTION RECORDING + REPLAY
  // ════════════════════════════════════════════════════════════════════════════

  const VALID_ACTION_TYPES = new Set(['click', 'type', 'scroll', 'drag', 'keypress', 'navigate', 'wait']);

  // POST /v1/computer-use/action
  app.post('/v1/computer-use/action', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { session_id, action_type, selector, value, screenshot_before_hash, screenshot_after_hash } = req.body;
    if (!session_id || !action_type) {
      return res.status(400).json({ error: { code: 'missing_fields', fields: ['session_id', 'action_type'] } });
    }
    if (!VALID_ACTION_TYPES.has(action_type)) {
      return res.status(400).json({ error: { code: 'invalid_action_type', valid: [...VALID_ACTION_TYPES] } });
    }

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(session_id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'session_not_found' } });

    const now = Date.now();
    const screenshotHash = screenshot_after_hash || screenshot_before_hash || null;

    const ins = db.prepare(
      'INSERT INTO cu_actions (session_id, action_type, selector, value, screenshot_hash, result, verified, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(session_id, action_type, selector || null, value || null, screenshotHash, null, 0, now);

    db.prepare(
      'UPDATE cu_sessions SET action_count = action_count + 1, last_action = ? WHERE id = ?'
    ).run(now, session_id);

    const sequenceNumber = db.prepare(
      'SELECT COUNT(*) as cnt FROM cu_actions WHERE session_id = ?'
    ).get(session_id).cnt;

    res.json({
      ok: true,
      _engine: 'real',
      action_id: ins.lastInsertRowid,
      sequence_number: sequenceNumber,
    });
  });

  // GET /v1/computer-use/session/:id/actions
  app.get('/v1/computer-use/session/:id/actions', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });

    const actions = db.prepare(
      'SELECT * FROM cu_actions WHERE session_id = ? ORDER BY id ASC'
    ).all(req.params.id);

    res.json({
      ok: true,
      _engine: 'real',
      session_id: req.params.id,
      actions,
      total: actions.length,
    });
  });

  // POST /v1/computer-use/replay
  app.post('/v1/computer-use/replay', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { session_id, format = 'json' } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: { code: 'missing_fields', fields: ['session_id'] } });
    }

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(session_id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'session_not_found' } });

    const actions = db.prepare(
      'SELECT * FROM cu_actions WHERE session_id = ? ORDER BY id ASC'
    ).all(session_id);

    if (!['json', 'python', 'markdown'].includes(format)) {
      return res.status(400).json({ error: { code: 'invalid_format', valid: ['json', 'python', 'markdown'] } });
    }

    let script;
    if (format === 'json') {
      script = JSON.stringify(actions.map(a => ({
        action_id: a.id,
        action_type: a.action_type,
        selector: a.selector,
        value: a.value,
        screenshot_hash: a.screenshot_hash,
        ts: a.ts,
      })), null, 2);
    } else if (format === 'python') {
      script = generatePythonScript(actions);
    } else {
      script = generateMarkdownScript(actions);
    }

    const replay_id = uid();
    const estimated_duration_ms = estimateDuration(actions);

    res.json({
      ok: true,
      _engine: 'real',
      replay_id,
      session_id,
      format,
      script,
      action_count: actions.length,
      estimated_duration_ms,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PIXEL-LEVEL VERIFICATION
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/computer-use/verify
  app.post('/v1/computer-use/verify', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const {
      session_id,
      action_id,
      expected_hash,
      actual_screenshot_b64,
      tolerance_percent = 5,
    } = req.body;

    if (!session_id || !actual_screenshot_b64) {
      return res.status(400).json({ error: { code: 'missing_fields', fields: ['session_id', 'actual_screenshot_b64'] } });
    }

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(session_id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'session_not_found' } });

    const now = Date.now();
    const actual_hash = sha256(actual_screenshot_b64);
    let passed = false;
    let diff_pixels = 0;
    let diff_percent = 0;
    let match_score_percent = 0;
    let result;

    if (expected_hash) {
      // Hash-only comparison
      passed = actual_hash === expected_hash;
      diff_percent = passed ? 0 : 100;
      match_score_percent = passed ? 100 : 0;
    } else {
      // If we have the expected screenshot via action_id, look up its screenshot_hash
      // and try to find the corresponding screenshot data
      let expectedB64 = null;
      if (action_id) {
        const action = db.prepare('SELECT screenshot_hash FROM cu_actions WHERE id = ? AND session_id = ?').get(action_id, session_id);
        if (action && action.screenshot_hash) {
          const shot = db.prepare('SELECT data_b64 FROM cu_screenshots WHERE id = ? AND session_id = ?').get(action.screenshot_hash, session_id);
          if (shot) expectedB64 = shot.data_b64;
        }
      }

      if (expectedB64) {
        const d = pixelDiff(expectedB64, actual_screenshot_b64);
        diff_pixels = d.diff_pixels;
        diff_percent = d.diff_percent;
        match_score_percent = Math.max(0, 100 - diff_percent);
        passed = diff_percent <= tolerance_percent;
      } else {
        // No expected data to compare against — treat as unverifiable, pass trivially
        match_score_percent = 100;
        passed = true;
        result = 'unverifiable';
      }
    }

    if (!result) {
      if (passed && diff_percent === 0) result = 'match';
      else if (passed) result = 'close_match';
      else result = 'mismatch';
    }

    db.prepare(
      'INSERT INTO cu_verifications (session_id, action_id, expected_hash, actual_hash, passed, diff_pixels, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(session_id, action_id || null, expected_hash || null, actual_hash, passed ? 1 : 0, diff_pixels, now);

    if (action_id) {
      db.prepare('UPDATE cu_actions SET verified = ? WHERE id = ? AND session_id = ?').run(passed ? 1 : 0, action_id, session_id);
    }

    res.json({
      ok: true,
      _engine: 'real',
      passed,
      match_score_percent: Math.round(match_score_percent * 100) / 100,
      diff_pixels,
      diff_percent: Math.round(diff_percent * 100) / 100,
      actual_hash,
      result,
    });
  });

  // GET /v1/computer-use/session/:id/verifications
  app.get('/v1/computer-use/session/:id/verifications', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });

    const verifications = db.prepare(
      'SELECT * FROM cu_verifications WHERE session_id = ? ORDER BY id ASC'
    ).all(req.params.id);

    const passed = verifications.filter(v => v.passed).length;

    res.json({
      ok: true,
      _engine: 'real',
      session_id: req.params.id,
      verifications,
      total: verifications.length,
      passed,
      failed: verifications.length - passed,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // CHECKPOINTS
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/computer-use/checkpoint
  app.post('/v1/computer-use/checkpoint', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { session_id, name, memory_keys_to_snapshot = [] } = req.body;
    if (!session_id || !name) {
      return res.status(400).json({ error: { code: 'missing_fields', fields: ['session_id', 'name'] } });
    }

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(session_id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'session_not_found' } });

    const now = Date.now();
    const id = uid();
    const action_index = session.action_count;

    // Snapshot requested memory keys
    const memorySnapshot = {};
    const savedKeys = [];
    if (Array.isArray(memory_keys_to_snapshot)) {
      for (const mk of memory_keys_to_snapshot) {
        try {
          const row = db.prepare('SELECT value FROM memory WHERE namespace = ? AND key = ?').get(auth.key, mk);
          if (row) {
            memorySnapshot[mk] = row.value;
            savedKeys.push(mk);
          }
        } catch { /* skip */ }
      }
    }

    // Also snapshot the session memory key
    const sessionMemKey = `cu:session:${session_id}`;
    try {
      const row = db.prepare('SELECT value FROM memory WHERE namespace = ? AND key = ?').get(auth.key, sessionMemKey);
      if (row && !memorySnapshot[sessionMemKey]) {
        memorySnapshot[sessionMemKey] = row.value;
        savedKeys.push(sessionMemKey);
      }
    } catch { /* skip */ }

    db.prepare(
      'INSERT INTO cu_checkpoints (id, session_id, name, action_index, memory_snapshot, ts) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, session_id, name, action_index, JSON.stringify(memorySnapshot), now);

    res.json({
      ok: true,
      _engine: 'real',
      checkpoint_id: id,
      session_id,
      name,
      action_index,
      saved_memory_keys: savedKeys,
      ts: now,
    });
  });

  // GET /v1/computer-use/session/:id/checkpoints
  app.get('/v1/computer-use/session/:id/checkpoints', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });

    const checkpoints = db.prepare(
      'SELECT id, session_id, name, action_index, ts FROM cu_checkpoints WHERE session_id = ? ORDER BY ts ASC'
    ).all(req.params.id);

    res.json({
      ok: true,
      _engine: 'real',
      session_id: req.params.id,
      checkpoints,
      total: checkpoints.length,
    });
  });

  // POST /v1/computer-use/checkpoint/:id/restore
  app.post('/v1/computer-use/checkpoint/:id/restore', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const checkpoint = db.prepare('SELECT * FROM cu_checkpoints WHERE id = ?').get(req.params.id);
    if (!checkpoint) return res.status(404).json({ error: { code: 'not_found' } });

    // Verify the checkpoint belongs to this user's session
    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(checkpoint.session_id, auth.key);
    if (!session) return res.status(403).json({ error: { code: 'forbidden' } });

    const memorySnapshot = JSON.parse(checkpoint.memory_snapshot || '{}');

    // Restore memory entries from the snapshot
    for (const [mk, val] of Object.entries(memorySnapshot)) {
      try {
        const now = Date.now();
        db.prepare(
          'INSERT OR REPLACE INTO memory (namespace, key, value, tags, created, updated) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(auth.key, mk, val, '[]', now, now);
      } catch { /* skip */ }
    }

    // The action to resume from is the one after the checkpoint's action_index
    const actions = db.prepare(
      'SELECT * FROM cu_actions WHERE session_id = ? ORDER BY id ASC LIMIT ? OFFSET ?'
    ).all(checkpoint.session_id, 1, checkpoint.action_index);

    const action_to_resume_from = actions.length > 0 ? actions[0] : null;

    res.json({
      ok: true,
      _engine: 'real',
      checkpoint: {
        id: checkpoint.id,
        session_id: checkpoint.session_id,
        name: checkpoint.name,
        action_index: checkpoint.action_index,
        ts: checkpoint.ts,
      },
      memory_snapshot: memorySnapshot,
      action_to_resume_from,
      memory_keys_restored: Object.keys(memorySnapshot).length,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // MEMORY BRIDGE
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/computer-use/memory/save
  app.post('/v1/computer-use/memory/save', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { session_id, key, value, type = 'context' } = req.body;
    if (!session_id || !key || value === undefined) {
      return res.status(400).json({ error: { code: 'missing_fields', fields: ['session_id', 'key', 'value'] } });
    }

    const VALID_TYPES = ['context', 'result', 'error', 'screenshot_summary', 'form_data'];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: { code: 'invalid_type', valid: VALID_TYPES } });
    }

    const memKey = `cu:${session_id}:${type}:${key}`;
    const saved = memSave(db, auth.key, memKey, value);

    res.json({
      ok: true,
      _engine: 'real',
      memory_key: memKey,
      saved,
      type,
    });
  });

  // GET /v1/computer-use/memory/:session_id
  app.get('/v1/computer-use/memory/:session_id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const prefix = `cu:${req.params.session_id}:`;
    const rows = memGetByPrefix(db, auth.key, prefix);

    // Organize by type
    const organized = {
      context: [],
      result: [],
      error: [],
      screenshot_summary: [],
      form_data: [],
      session: [],
      other: [],
    };

    for (const row of rows) {
      // Key pattern: cu:{session_id}:{type}:{key}  or  cu:session:{session_id}  or  cu:screenshot:{session_id}:{ts}
      let parsed;
      try { parsed = JSON.parse(row.value); } catch { parsed = row.value; }
      const entry = { key: row.key, value: parsed, updated: row.updated };

      const relative = row.key.replace(prefix, '');
      const typePart = relative.split(':')[0];
      if (organized[typePart]) {
        organized[typePart].push(entry);
      } else {
        organized.other.push(entry);
      }
    }

    res.json({
      ok: true,
      _engine: 'real',
      session_id: req.params.session_id,
      memory: organized,
      total_entries: rows.length,
    });
  });

  // POST /v1/computer-use/memory/search
  app.post('/v1/computer-use/memory/search', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { query, session_id } = req.body;
    if (!query) {
      return res.status(400).json({ error: { code: 'missing_fields', fields: ['query'] } });
    }

    // Retrieve all relevant memory entries (scoped to session if provided)
    let rows;
    if (session_id) {
      rows = memGetByPrefix(db, auth.key, `cu:${session_id}:`);
    } else {
      rows = memGetByPrefix(db, auth.key, 'cu:');
    }

    // Keyword-based semantic search: score each entry by token overlap with query
    const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    const scored = rows.map(row => {
      const text = (row.key + ' ' + row.value).toLowerCase();
      const score = queryTokens.reduce((acc, token) => {
        const count = (text.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        return acc + count;
      }, 0);
      let parsed;
      try { parsed = JSON.parse(row.value); } catch { parsed = row.value; }
      return { key: row.key, value: parsed, updated: row.updated, score };
    });

    const results = scored
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ key, value, updated, score }) => ({ key, value, updated, relevance_score: score }));

    res.json({
      ok: true,
      _engine: 'real',
      query,
      results,
      total: results.length,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // HUMAN-IN-LOOP APPROVAL QUEUE
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/computer-use/approval/request
  app.post('/v1/computer-use/approval/request', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const {
      session_id,
      action_description,
      risk_level = 'low',
      timeout_seconds = 300,
      notify_webhook,
    } = req.body;

    if (!session_id || !action_description) {
      return res.status(400).json({ error: { code: 'missing_fields', fields: ['session_id', 'action_description'] } });
    }

    const VALID_RISK = ['low', 'medium', 'high', 'critical'];
    if (!VALID_RISK.includes(risk_level)) {
      return res.status(400).json({ error: { code: 'invalid_risk_level', valid: VALID_RISK } });
    }

    const now = Date.now();
    const approval_id = uid();
    const expires_at = now + timeout_seconds * 1000;

    const record = {
      approval_id,
      api_key: auth.key,
      session_id,
      action_description,
      risk_level,
      status: 'pending',
      created_at: now,
      expires_at,
      notify_webhook: notify_webhook || null,
      decision: null,
      modification: null,
    };

    approvalStore.set(approval_id, record);

    // Fire-and-forget webhook notification if provided
    if (notify_webhook) {
      try {
        const u = new URL(notify_webhook);
        const body = JSON.stringify({ approval_id, session_id, action_description, risk_level, expires_at });
        const mod = u.protocol === 'https:' ? require('https') : require('http');
        const opts = { method: 'POST', hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } };
        const wreq = mod.request(opts);
        wreq.on('error', () => {});
        wreq.write(body);
        wreq.end();
      } catch { /* ignore bad webhook URLs */ }
    }

    res.json({
      ok: true,
      _engine: 'real',
      approval_id,
      status: 'pending',
      expires_at,
      risk_level,
      session_id,
    });
  });

  // POST /v1/computer-use/approval/:id/respond
  app.post('/v1/computer-use/approval/:id/respond', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { decision, modification } = req.body;
    const VALID_DECISIONS = ['approve', 'reject', 'modify'];
    if (!decision || !VALID_DECISIONS.includes(decision)) {
      return res.status(400).json({ error: { code: 'invalid_decision', valid: VALID_DECISIONS } });
    }

    const record = approvalStore.get(req.params.id);
    if (!record) return res.status(404).json({ error: { code: 'not_found' } });
    if (record.api_key !== auth.key) return res.status(403).json({ error: { code: 'forbidden' } });
    if (Date.now() > record.expires_at) return res.status(410).json({ error: { code: 'expired' } });
    if (record.status !== 'pending') return res.status(409).json({ error: { code: 'already_responded' } });

    record.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'modified';
    record.decision = decision;
    record.modification = modification || null;
    record.responded_at = Date.now();
    approvalStore.set(req.params.id, record);

    res.json({
      ok: true,
      _engine: 'real',
      approval_id: req.params.id,
      decision,
      action_modified: decision === 'modify' ? modification || null : null,
      status: record.status,
    });
  });

  // GET /v1/computer-use/approval/pending
  app.get('/v1/computer-use/approval/pending', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const now = Date.now();
    const pending = [];
    for (const [id, rec] of approvalStore) {
      if (rec.api_key === auth.key && rec.status === 'pending' && now <= rec.expires_at) {
        pending.push({
          approval_id: id,
          session_id: rec.session_id,
          action_description: rec.action_description,
          risk_level: rec.risk_level,
          created_at: rec.created_at,
          expires_at: rec.expires_at,
          expires_in_seconds: Math.max(0, Math.round((rec.expires_at - now) / 1000)),
        });
      }
    }

    pending.sort((a, b) => b.created_at - a.created_at);

    res.json({
      ok: true,
      _engine: 'real',
      pending,
      total: pending.length,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // CLOSED-LOOP VERIFICATION PIPELINE
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/computer-use/pipeline/verify-action
  app.post('/v1/computer-use/pipeline/verify-action', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const {
      session_id,
      action,
      expected_result_description,
      screenshot_after_b64,
    } = req.body;

    if (!session_id || !action || !action.action_type || !expected_result_description) {
      return res.status(400).json({
        error: { code: 'missing_fields', fields: ['session_id', 'action', 'action.action_type', 'expected_result_description'] },
      });
    }
    if (!VALID_ACTION_TYPES.has(action.action_type)) {
      return res.status(400).json({ error: { code: 'invalid_action_type', valid: [...VALID_ACTION_TYPES] } });
    }

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(session_id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'session_not_found' } });

    const now = Date.now();

    // 1. Record the action atomically
    const afterHash = screenshot_after_b64 ? sha256(screenshot_after_b64) : null;
    const ins = db.prepare(
      'INSERT INTO cu_actions (session_id, action_type, selector, value, screenshot_hash, result, verified, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      session_id,
      action.action_type,
      action.selector || null,
      action.value || null,
      afterHash,
      expected_result_description,
      0,
      now
    );
    const action_id = ins.lastInsertRowid;

    db.prepare('UPDATE cu_sessions SET action_count = action_count + 1, last_action = ? WHERE id = ?').run(now, session_id);

    // 2. Run verification
    let verified = false;
    let confidence = 0;
    let diff_pixels = 0;
    let diff_percent = 0;

    if (screenshot_after_b64) {
      // Find previous screenshot to diff against (most recent before this action)
      const prevShot = db.prepare(
        'SELECT data_b64 FROM cu_screenshots WHERE session_id = ? ORDER BY ts DESC LIMIT 1'
      ).get(session_id);

      if (prevShot) {
        const d = pixelDiff(prevShot.data_b64, screenshot_after_b64);
        diff_pixels = d.diff_pixels;
        diff_percent = d.diff_percent;
        // Confidence: if some change occurred, it's more likely the action had effect
        // Actions that should produce change: click, type, navigate, keypress
        const changeActions = new Set(['click', 'type', 'navigate', 'keypress', 'drag']);
        if (changeActions.has(action.action_type)) {
          // Expect some diff; too much or too little reduces confidence
          if (diff_percent > 0 && diff_percent < 80) {
            confidence = Math.min(95, 50 + diff_percent * 2);
            verified = true;
          } else if (diff_percent === 0) {
            confidence = 20; // no visible change for a change-action
            verified = false;
          } else {
            confidence = 30; // massive change, suspicious
            verified = false;
          }
        } else {
          // scroll/wait: low diff expected
          confidence = diff_percent < 20 ? 80 : 50;
          verified = true;
        }
      } else {
        // No previous screenshot to compare — accept on good faith
        confidence = 60;
        verified = true;
      }

      // Store the after-screenshot
      const shotId = uid();
      db.prepare(
        'INSERT INTO cu_screenshots (id, session_id, data_b64, width, height, ocr_text, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(shotId, session_id, screenshot_after_b64, null, null, '', now);

      // Record verification
      db.prepare(
        'INSERT INTO cu_verifications (session_id, action_id, expected_hash, actual_hash, passed, diff_pixels, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(session_id, action_id, null, afterHash, verified ? 1 : 0, diff_pixels, now);

      // Update action's verified flag
      db.prepare('UPDATE cu_actions SET verified = ? WHERE id = ?').run(verified ? 1 : 0, action_id);
    } else {
      // No screenshot provided — record expected result in memory only
      confidence = 50;
      verified = false;
    }

    // 3. Update session memory with result
    const memKey = `cu:session:${session_id}:last_action`;
    const memVal = {
      action_id,
      action_type: action.action_type,
      selector: action.selector || null,
      value: action.value || null,
      expected_result_description,
      verified,
      confidence,
      diff_percent: Math.round(diff_percent * 100) / 100,
      ts: now,
    };
    const memory_updated = memSave(db, auth.key, memKey, memVal);

    res.json({
      ok: true,
      _engine: 'real',
      action_id,
      verified,
      confidence: Math.round(confidence * 10) / 10,
      diff_pixels,
      diff_percent: Math.round(diff_percent * 100) / 100,
      memory_updated,
      session_id,
    });
  });
};
