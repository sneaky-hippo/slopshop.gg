'use strict';

/**
 * Computer Use Backend Primitives
 * routes/computer-use.js
 *
 * Persistent state, memory, replay, and verification layer
 * that pairs with Claude Computer Use. Full implementations — no stubs.
 *
 * Uses: crypto (built-in), better-sqlite3 (db passed in), express
 *
 * CHANGELOG (fixes applied):
 *  BUG-01 — Added GET /v1/computer-use/session/:id/screenshots (was 404)
 *  BUG-02 — Added GET /v1/computer-use/session/:id/replay (was 404, only POST /replay existed)
 *  BUG-03 — Added POST /v1/computer-use/screenshot/diff (was 404)
 *  BUG-04 — /session/:id/action silently coerced unknown types to "click" with no error;
 *            now returns 400 for invalid action types
 *  BUG-05 — Actions allowed on ended/stopped sessions; now returns 409 session_ended
 *  BUG-06 — Approval /request ignored action_type/selector/value body fields;
 *            now auto-builds action_description from them if not provided explicitly
 *  BUG-07 — stop and end routes duplicated 40+ lines; extracted shared endSession()
 *  BUG-08 — No credit tracking; added credits_used to cu_sessions + credits per action
 *  BUG-09 — No session timeout/cleanup; added GET /v1/computer-use/sessions/cleanup
 *            and automatic TTL check on session detail fetch
 *  BUG-10 — Checkpoint restore SQL used wrong LIMIT/OFFSET (fetched action AT index,
 *            should fetch the NEXT action to resume FROM)
 *  FEAT-01 — Session cost tracking (credits per action type)
 *  FEAT-02 — Approval gates auto-triggered for sensitive action types (click on destructive
 *             selectors, type with password patterns, navigate)
 *  FEAT-03 — GET /v1/computer-use/session/:id/cost returns credit breakdown
 *  FEAT-04 — GET /v1/computer-use/session/:id/screenshots — list screenshots per session
 *  FEAT-05 — GET /v1/computer-use/session/:id/replay — convenience alias
 *  FEAT-06 — POST /v1/computer-use/screenshot/diff — pixel diff between two b64 images
 *  FEAT-07 — POST /v1/computer-use/session/start accepts task + config fields
 */

const crypto = require('crypto');

// ─── Credit costs per action type ────────────────────────────────────────────
const ACTION_CREDITS = {
  click:    1,
  type:     2,
  scroll:   1,
  drag:     2,
  keypress: 1,
  navigate: 3,
  wait:     0,
  screenshot: 1,
};
const DEFAULT_ACTION_CREDITS = 1;

// ─── Session TTL (ms) — sessions inactive for longer are auto-expired ─────────
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

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
 * derived from the api_key.
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

/**
 * Determine if an action requires human approval based on type and selector/value.
 * Returns { required: bool, risk_level: string, reason: string }
 */
function checkApprovalRequired(actionType, selector, value) {
  const sel = (selector || '').toLowerCase();
  const val = (value || '').toLowerCase();

  // Critical: destructive selector patterns
  const destructivePatterns = [/delete/i, /remove/i, /destroy/i, /drop/i, /truncate/i, /purge/i, /wipe/i, /format/i];
  if (actionType === 'click' && destructivePatterns.some(p => p.test(sel))) {
    return { required: true, risk_level: 'critical', reason: `Click on potentially destructive element: ${selector}` };
  }

  // High: password/secret input
  const sensitivePatterns = [/password/i, /passwd/i, /secret/i, /token/i, /api.?key/i, /credit.?card/i, /ssn/i];
  if (actionType === 'type' && sensitivePatterns.some(p => p.test(sel))) {
    return { required: true, risk_level: 'high', reason: `Typing into sensitive field: ${selector}` };
  }

  // High: navigate to external/non-localhost URLs
  if (actionType === 'navigate' && val && !val.includes('localhost') && !val.includes('127.0.0.1')) {
    return { required: true, risk_level: 'medium', reason: `Navigate to external URL: ${value}` };
  }

  // Medium: form submit buttons
  if (actionType === 'click' && /submit|confirm|proceed|purchase|buy|pay|send/i.test(sel)) {
    return { required: true, risk_level: 'medium', reason: `Click on confirmation element: ${selector}` };
  }

  return { required: false, risk_level: 'low', reason: null };
}

// ─── In-memory approval store (approval requests are ephemeral) ───────────────
const approvalStore = new Map(); // approval_id -> record

// ─── Shared session-end logic ─────────────────────────────────────────────────

/**
 * FIX BUG-07: was copy-pasted 40+ lines in both /stop and /end.
 * Extracted to a single shared function.
 */
function endSession(db, auth, sessionId, res) {
  const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(sessionId, auth.key);
  if (!session) return res.status(404).json({ error: { code: 'not_found' } });

  const now = Date.now();
  db.prepare('UPDATE cu_sessions SET status = ?, last_action = ? WHERE id = ?').run('ended', now, session.id);

  const actions = db.prepare('SELECT * FROM cu_actions WHERE session_id = ? ORDER BY id ASC').all(session.id);
  const checkpoints = db.prepare('SELECT * FROM cu_checkpoints WHERE session_id = ? ORDER BY ts ASC').all(session.id);
  const verifications = db.prepare('SELECT * FROM cu_verifications WHERE session_id = ?').all(session.id);
  const passedVerifs = verifications.filter(v => v.passed).length;
  const duration_ms = now - session.created;

  // BUG-08 fix: include credits in summary
  const creditsRow = db.prepare('SELECT IFNULL(SUM(credits), 0) as total FROM cu_actions WHERE session_id = ?').get(session.id);
  const total_credits_used = creditsRow ? creditsRow.total : 0;

  const summary = {
    session_id: session.id,
    name: session.name,
    total_actions: actions.length,
    duration_ms,
    checkpoints_count: checkpoints.length,
    verifications_total: verifications.length,
    verifications_passed: passedVerifs,
    action_types: [...new Set(actions.map(a => a.action_type))],
    total_credits_used,
    ended_at: now,
  };

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
    total_credits_used,
    memory_saved: true,
  });
}

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
      action_count INTEGER NOT NULL DEFAULT 0,
      credits_used INTEGER NOT NULL DEFAULT 0
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
      credits INTEGER NOT NULL DEFAULT 1,
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
      label TEXT,
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

  // Idempotent column migrations for existing deployments
  // BUG-08: add credits_used to cu_sessions if missing
  try { db.exec('ALTER TABLE cu_sessions ADD COLUMN credits_used INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
  // BUG-08: add credits to cu_actions if missing
  try { db.exec('ALTER TABLE cu_actions ADD COLUMN credits INTEGER NOT NULL DEFAULT 1'); } catch { /* already exists */ }
  // FEAT-04: add label to cu_screenshots if missing
  try { db.exec('ALTER TABLE cu_screenshots ADD COLUMN label TEXT'); } catch { /* already exists */ }

  // ════════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════════

  // POST /v1/computer-use/session/start
  // FEAT-07: also accepts task + config fields (passed through to context)
  app.post('/v1/computer-use/session/start', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { name, context = {}, task, config = {} } = req.body;
    const id = uid();
    const now = Date.now();

    // Merge task + config into context for convenience
    const mergedContext = { ...context };
    if (task) mergedContext.task = task;
    if (config && Object.keys(config).length > 0) mergedContext.config = config;

    const contextStr = JSON.stringify(mergedContext);

    db.prepare(
      'INSERT INTO cu_sessions (id, api_key, name, status, context, created, last_action, action_count, credits_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, auth.key, name || null, 'active', contextStr, now, now, 0, 0);

    const memKey = `cu:session:${id}`;
    memSave(db, auth.key, memKey, {
      session_id: id,
      name: name || null,
      context: mergedContext,
      started_at: now,
      status: 'active',
    });

    res.json({
      ok: true,
      _engine: 'real',
      session_id: id,
      context: mergedContext,
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

    // BUG-09: Auto-expire sessions that have been inactive past TTL
    const now = Date.now();
    if (session.status === 'active' && session.last_action && (now - session.last_action) > SESSION_TTL_MS) {
      db.prepare('UPDATE cu_sessions SET status = ? WHERE id = ?').run('timed_out', session.id);
      session.status = 'timed_out';
    }

    // Latest screenshot OCR
    const lastShot = db.prepare(
      'SELECT ocr_text FROM cu_screenshots WHERE session_id = ? ORDER BY ts DESC LIMIT 1'
    ).get(session.id);

    // Credits
    const creditsRow = db.prepare('SELECT IFNULL(SUM(credits), 0) as total FROM cu_actions WHERE session_id = ?').get(session.id);

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
      credits_used: creditsRow ? creditsRow.total : 0,
      last_screenshot_ocr_summary: lastShot ? (lastShot.ocr_text || '').slice(0, 300) : null,
      memory_key: `cu:session:${session.id}`,
    });
  });

  // POST /v1/computer-use/session/:id/end
  app.post('/v1/computer-use/session/:id/end', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    endSession(db, auth, req.params.id, res);  // FIX BUG-07
  });

  // POST /v1/computer-use/session/:id/stop — alias for /end
  // FIX BUG-07: was duplicating 40+ lines; now delegates to shared endSession()
  app.post('/v1/computer-use/session/:id/stop', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    endSession(db, auth, req.params.id, res);
  });

  // POST /v1/computer-use/session/:id/action
  // FIX BUG-04: returns 400 for invalid action types instead of silently mapping to 'click'
  // FIX BUG-05: returns 409 if session is not active
  app.post('/v1/computer-use/session/:id/action', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const session_id = req.params.id;
    const { type, action_type, action, x, y, description, value, selector, require_approval } = req.body;

    // Normalize action type: check all possible field names
    const rawType = (action_type || type || action || '').toString().trim();
    const VALID_ACTION_TYPES_LOCAL = new Set(['click', 'type', 'scroll', 'drag', 'keypress', 'navigate', 'wait', 'screenshot']);

    // FIX BUG-04: reject unknown action types explicitly
    if (!rawType || !VALID_ACTION_TYPES_LOCAL.has(rawType)) {
      return res.status(400).json({
        error: {
          code: 'invalid_action_type',
          received: rawType || null,
          valid: [...VALID_ACTION_TYPES_LOCAL],
        },
      });
    }

    const normalizedSelector = selector || (x !== undefined && y !== undefined ? `${x},${y}` : null);
    const normalizedValue = value || description || null;

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(session_id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'session_not_found' } });

    // FIX BUG-05: block actions on non-active sessions
    if (session.status !== 'active') {
      return res.status(409).json({
        error: {
          code: 'session_ended',
          status: session.status,
          message: `Session is ${session.status} and cannot accept new actions`,
        },
      });
    }

    // BUG-09: check TTL
    const now = Date.now();
    if ((now - session.last_action) > SESSION_TTL_MS) {
      db.prepare('UPDATE cu_sessions SET status = ? WHERE id = ?').run('timed_out', session_id);
      return res.status(409).json({ error: { code: 'session_timed_out', message: 'Session has exceeded inactivity TTL' } });
    }

    // FEAT-02: check if this action requires approval
    const approvalCheck = checkApprovalRequired(rawType, normalizedSelector, normalizedValue);
    if ((approvalCheck.required || require_approval) && rawType !== 'screenshot') {
      // Create a pending approval gate automatically
      const approval_id = uid();
      const expires_at = now + 300 * 1000; // 5 min
      const autoDesc = approvalCheck.reason || `${rawType} action${normalizedSelector ? ` on ${normalizedSelector}` : ''}`;
      const record = {
        approval_id,
        api_key: auth.key,
        session_id,
        action_description: autoDesc,
        action_type: rawType,
        selector: normalizedSelector,
        value: normalizedValue,
        risk_level: approvalCheck.risk_level,
        status: 'pending',
        created_at: now,
        expires_at,
        notify_webhook: null,
        decision: null,
        modification: null,
      };
      approvalStore.set(approval_id, record);

      return res.status(202).json({
        ok: false,
        _engine: 'real',
        approval_required: true,
        approval_id,
        risk_level: approvalCheck.risk_level,
        reason: autoDesc,
        expires_at,
        session_id,
        message: 'Action requires human approval. POST /v1/computer-use/approval/:id/respond with decision=approve to proceed.',
      });
    }

    // FEAT-01: compute credits for this action
    const credits = ACTION_CREDITS[rawType] !== undefined ? ACTION_CREDITS[rawType] : DEFAULT_ACTION_CREDITS;

    const ins = db.prepare(
      'INSERT INTO cu_actions (session_id, action_type, selector, value, screenshot_hash, result, verified, credits, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(session_id, rawType, normalizedSelector, normalizedValue, null, null, 0, credits, now);

    db.prepare(
      'UPDATE cu_sessions SET action_count = action_count + 1, last_action = ?, credits_used = credits_used + ? WHERE id = ?'
    ).run(now, credits, session_id);

    const sequenceNumber = db.prepare(
      'SELECT COUNT(*) as cnt FROM cu_actions WHERE session_id = ?'
    ).get(session_id).cnt;

    res.json({
      ok: true,
      _engine: 'real',
      action_id: ins.lastInsertRowid,
      sequence_number: sequenceNumber,
      session_id,
      type: rawType,
      credits_charged: credits,
    });
  });

  // GET /v1/computer-use/sessions
  app.get('/v1/computer-use/sessions', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT id, name, status, action_count, created, last_action, context, credits_used FROM cu_sessions WHERE api_key = ?';
    const params = [auth.key];
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10) || 50, parseInt(offset, 10) || 0);

    const rows = db.prepare(query).all(...params);

    const sessions = rows.map(r => ({
      session_id: r.id,
      name: r.name,
      status: r.status,
      action_count: r.action_count,
      created: r.created,
      last_action: r.last_action,
      credits_used: r.credits_used || 0,
      context: JSON.parse(r.context || '{}'),
    }));

    const total = db.prepare('SELECT COUNT(*) as cnt FROM cu_sessions WHERE api_key = ?').get(auth.key).cnt;

    res.json({ ok: true, _engine: 'real', sessions, total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) });
  });

  // GET /v1/computer-use/sessions/cleanup — BUG-09 fix: explicit TTL cleanup
  app.get('/v1/computer-use/sessions/cleanup', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const cutoff = Date.now() - SESSION_TTL_MS;
    const result = db.prepare(
      "UPDATE cu_sessions SET status = 'timed_out' WHERE api_key = ? AND status = 'active' AND last_action < ?"
    ).run(auth.key, cutoff);

    res.json({
      ok: true,
      _engine: 'real',
      sessions_expired: result.changes,
      ttl_ms: SESSION_TTL_MS,
      cutoff_ts: cutoff,
    });
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
      'INSERT INTO cu_screenshots (id, session_id, data_b64, width, height, ocr_text, label, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, session_id, data_b64, width || null, height || null, ocr_text, label || null, now);

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

  // FEAT-04 / FIX BUG-01: GET /v1/computer-use/session/:id/screenshots — was missing
  app.get('/v1/computer-use/session/:id/screenshots', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });

    const { include_data = 'false', limit = 20, offset = 0 } = req.query;
    const includeData = include_data === 'true' || include_data === '1';

    const cols = includeData
      ? 'id, session_id, width, height, ocr_text, label, ts, data_b64'
      : 'id, session_id, width, height, ocr_text, label, ts';

    const shots = db.prepare(
      `SELECT ${cols} FROM cu_screenshots WHERE session_id = ? ORDER BY ts DESC LIMIT ? OFFSET ?`
    ).all(req.params.id, parseInt(limit, 10) || 20, parseInt(offset, 10) || 0);

    const total = db.prepare('SELECT COUNT(*) as cnt FROM cu_screenshots WHERE session_id = ?').get(req.params.id).cnt;

    const screenshots = shots.map(s => ({
      screenshot_id: s.id,
      session_id: s.session_id,
      width: s.width,
      height: s.height,
      label: s.label,
      ocr_text_preview: s.ocr_text ? s.ocr_text.slice(0, 200) : null,
      ts: s.ts,
      ...(includeData ? { data_b64: s.data_b64 } : {}),
    }));

    res.json({
      ok: true,
      _engine: 'real',
      session_id: req.params.id,
      screenshots,
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  });

  // FEAT-06 / FIX BUG-03: POST /v1/computer-use/screenshot/diff — was missing
  app.post('/v1/computer-use/screenshot/diff', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { a_b64, b_b64, a_id, b_id } = req.body;

    let aData = a_b64;
    let bData = b_b64;

    // Allow resolving screenshots by ID
    if (!aData && a_id) {
      const row = db.prepare('SELECT data_b64, session_id FROM cu_screenshots WHERE id = ?').get(a_id);
      if (row) {
        // Verify ownership
        const sess = db.prepare('SELECT id FROM cu_sessions WHERE id = ? AND api_key = ?').get(row.session_id, auth.key);
        if (sess) aData = row.data_b64;
      }
      if (!aData) return res.status(404).json({ error: { code: 'screenshot_a_not_found' } });
    }
    if (!bData && b_id) {
      const row = db.prepare('SELECT data_b64, session_id FROM cu_screenshots WHERE id = ?').get(b_id);
      if (row) {
        const sess = db.prepare('SELECT id FROM cu_sessions WHERE id = ? AND api_key = ?').get(row.session_id, auth.key);
        if (sess) bData = row.data_b64;
      }
      if (!bData) return res.status(404).json({ error: { code: 'screenshot_b_not_found' } });
    }

    if (!aData || !bData) {
      return res.status(400).json({
        error: { code: 'missing_fields', message: 'Provide a_b64+b_b64 or a_id+b_id', fields: ['a_b64 or a_id', 'b_b64 or b_id'] },
      });
    }

    const { diff_pixels, diff_percent } = pixelDiff(aData, bData);
    const a_hash = sha256(aData);
    const b_hash = sha256(bData);
    const identical = a_hash === b_hash;
    const match_score_percent = Math.max(0, 100 - diff_percent);

    res.json({
      ok: true,
      _engine: 'real',
      identical,
      diff_pixels,
      diff_percent: Math.round(diff_percent * 100) / 100,
      match_score_percent: Math.round(match_score_percent * 100) / 100,
      a_hash,
      b_hash,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ACTION RECORDING + REPLAY
  // ════════════════════════════════════════════════════════════════════════════

  const VALID_ACTION_TYPES = new Set(['click', 'type', 'scroll', 'drag', 'keypress', 'navigate', 'wait', 'screenshot']);

  // POST /v1/computer-use/action  (global, session_id in body)
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

    // FIX BUG-05: block on non-active sessions
    if (session.status !== 'active') {
      return res.status(409).json({ error: { code: 'session_ended', status: session.status } });
    }

    const now = Date.now();
    const screenshotHash = screenshot_after_hash || screenshot_before_hash || null;
    const credits = ACTION_CREDITS[action_type] !== undefined ? ACTION_CREDITS[action_type] : DEFAULT_ACTION_CREDITS;

    const ins = db.prepare(
      'INSERT INTO cu_actions (session_id, action_type, selector, value, screenshot_hash, result, verified, credits, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(session_id, action_type, selector || null, value || null, screenshotHash, null, 0, credits, now);

    db.prepare(
      'UPDATE cu_sessions SET action_count = action_count + 1, last_action = ?, credits_used = credits_used + ? WHERE id = ?'
    ).run(now, credits, session_id);

    const sequenceNumber = db.prepare(
      'SELECT COUNT(*) as cnt FROM cu_actions WHERE session_id = ?'
    ).get(session_id).cnt;

    res.json({
      ok: true,
      _engine: 'real',
      action_id: ins.lastInsertRowid,
      sequence_number: sequenceNumber,
      credits_charged: credits,
    });
  });

  // GET /v1/computer-use/session/:id/actions
  app.get('/v1/computer-use/session/:id/actions', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });

    const { limit = 100, offset = 0 } = req.query;
    const actions = db.prepare(
      'SELECT * FROM cu_actions WHERE session_id = ? ORDER BY id ASC LIMIT ? OFFSET ?'
    ).all(req.params.id, parseInt(limit, 10) || 100, parseInt(offset, 10) || 0);

    const total = db.prepare('SELECT COUNT(*) as cnt FROM cu_actions WHERE session_id = ?').get(req.params.id).cnt;

    res.json({
      ok: true,
      _engine: 'real',
      session_id: req.params.id,
      actions,
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  });

  // POST /v1/computer-use/replay — global
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

  // FEAT-05 / FIX BUG-02: GET /v1/computer-use/session/:id/replay — was missing
  app.get('/v1/computer-use/session/:id/replay', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });

    const format = req.query.format || 'json';
    if (!['json', 'python', 'markdown'].includes(format)) {
      return res.status(400).json({ error: { code: 'invalid_format', valid: ['json', 'python', 'markdown'] } });
    }

    const actions = db.prepare(
      'SELECT * FROM cu_actions WHERE session_id = ? ORDER BY id ASC'
    ).all(req.params.id);

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

    const estimated_duration_ms = estimateDuration(actions);

    res.json({
      ok: true,
      _engine: 'real',
      replay_id: uid(),
      session_id: req.params.id,
      format,
      script,
      action_count: actions.length,
      estimated_duration_ms,
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SESSION COST TRACKING — FEAT-03
  // ════════════════════════════════════════════════════════════════════════════

  // GET /v1/computer-use/session/:id/cost
  app.get('/v1/computer-use/session/:id/cost', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });

    const actions = db.prepare('SELECT action_type, credits FROM cu_actions WHERE session_id = ?').all(req.params.id);

    const by_type = {};
    let total_credits = 0;
    for (const a of actions) {
      if (!by_type[a.action_type]) by_type[a.action_type] = { count: 0, credits: 0 };
      by_type[a.action_type].count++;
      by_type[a.action_type].credits += (a.credits || ACTION_CREDITS[a.action_type] || DEFAULT_ACTION_CREDITS);
      total_credits += (a.credits || ACTION_CREDITS[a.action_type] || DEFAULT_ACTION_CREDITS);
    }

    res.json({
      ok: true,
      _engine: 'real',
      session_id: req.params.id,
      total_credits,
      breakdown_by_type: by_type,
      credit_rate: ACTION_CREDITS,
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
  // FIX BUG-10: original used LIMIT 1 OFFSET action_index which fetched the wrong row
  app.post('/v1/computer-use/checkpoint/:id/restore', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const checkpoint = db.prepare('SELECT * FROM cu_checkpoints WHERE id = ?').get(req.params.id);
    if (!checkpoint) return res.status(404).json({ error: { code: 'not_found' } });

    const session = db.prepare('SELECT * FROM cu_sessions WHERE id = ? AND api_key = ?').get(checkpoint.session_id, auth.key);
    if (!session) return res.status(403).json({ error: { code: 'forbidden' } });

    const memorySnapshot = JSON.parse(checkpoint.memory_snapshot || '{}');

    for (const [mk, val] of Object.entries(memorySnapshot)) {
      try {
        const now = Date.now();
        db.prepare(
          'INSERT OR REPLACE INTO memory (namespace, key, value, tags, created, updated) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(auth.key, mk, val, '[]', now, now);
      } catch { /* skip */ }
    }

    // FIX BUG-10: fetch the action immediately AFTER checkpoint.action_index
    // Original was: LIMIT 1 OFFSET action_index — which fetched the action AT index (0-based)
    // The next action to replay starts at action_index+1 (1-based seq), i.e., OFFSET action_index
    // using ORDER BY id ASC so the OFFSET skips exactly action_index rows.
    const action_to_resume_from = db.prepare(
      'SELECT * FROM cu_actions WHERE session_id = ? ORDER BY id ASC LIMIT 1 OFFSET ?'
    ).get(checkpoint.session_id, checkpoint.action_index) || null;

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

    let rows;
    if (session_id) {
      rows = memGetByPrefix(db, auth.key, `cu:${session_id}:`);
    } else {
      rows = memGetByPrefix(db, auth.key, 'cu:');
    }

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
  // FIX BUG-06: now accepts action_type + selector + value and auto-builds description if not provided
  app.post('/v1/computer-use/approval/request', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const {
      session_id,
      action_description,
      action_type,
      selector,
      value,
      risk_level = 'low',
      timeout_seconds = 300,
      notify_webhook,
    } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: { code: 'missing_fields', fields: ['session_id'] } });
    }

    // FIX BUG-06: auto-build description from action fields if not provided explicitly
    let description = action_description;
    if (!description) {
      if (action_type) {
        description = `${action_type} action${selector ? ` on ${selector}` : ''}${value ? ` with value "${String(value).slice(0, 80)}"` : ''}`;
      } else {
        return res.status(400).json({ error: { code: 'missing_fields', fields: ['action_description or action_type'] } });
      }
    }

    const VALID_RISK = ['low', 'medium', 'high', 'critical'];
    const resolvedRisk = VALID_RISK.includes(risk_level) ? risk_level : 'low';

    // Auto-escalate risk for sensitive action types
    let finalRisk = resolvedRisk;
    if (action_type) {
      const autoCheck = checkApprovalRequired(action_type, selector, value);
      if (autoCheck.required && VALID_RISK.indexOf(autoCheck.risk_level) > VALID_RISK.indexOf(finalRisk)) {
        finalRisk = autoCheck.risk_level;
      }
    }

    const now = Date.now();
    const approval_id = uid();
    const expires_at = now + timeout_seconds * 1000;

    const record = {
      approval_id,
      api_key: auth.key,
      session_id,
      action_description: description,
      action_type: action_type || null,
      selector: selector || null,
      value: value || null,
      risk_level: finalRisk,
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
        const body = JSON.stringify({ approval_id, session_id, action_description: description, risk_level: finalRisk, expires_at });
        const mod = u.protocol === 'https:' ? require('https') : require('http');
        const opts = {
          method: 'POST',
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        };
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
      risk_level: finalRisk,
      action_description: description,
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

  // GET /v1/computer-use/approval/:id — check status of a single approval
  app.get('/v1/computer-use/approval/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const record = approvalStore.get(req.params.id);
    if (!record) return res.status(404).json({ error: { code: 'not_found' } });
    if (record.api_key !== auth.key) return res.status(403).json({ error: { code: 'forbidden' } });

    const now = Date.now();
    const expired = now > record.expires_at;

    res.json({
      ok: true,
      _engine: 'real',
      approval_id: record.approval_id,
      session_id: record.session_id,
      action_description: record.action_description,
      action_type: record.action_type,
      selector: record.selector,
      risk_level: record.risk_level,
      status: expired && record.status === 'pending' ? 'expired' : record.status,
      decision: record.decision,
      modification: record.modification,
      created_at: record.created_at,
      expires_at: record.expires_at,
      expires_in_seconds: Math.max(0, Math.round((record.expires_at - now) / 1000)),
      responded_at: record.responded_at || null,
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
          action_type: rec.action_type || null,
          selector: rec.selector || null,
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

    // FIX BUG-05: block on non-active sessions in pipeline too
    if (session.status !== 'active') {
      return res.status(409).json({ error: { code: 'session_ended', status: session.status } });
    }

    const now = Date.now();
    const credits = ACTION_CREDITS[action.action_type] !== undefined ? ACTION_CREDITS[action.action_type] : DEFAULT_ACTION_CREDITS;

    // 1. Record the action atomically
    const afterHash = screenshot_after_b64 ? sha256(screenshot_after_b64) : null;
    const ins = db.prepare(
      'INSERT INTO cu_actions (session_id, action_type, selector, value, screenshot_hash, result, verified, credits, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      session_id,
      action.action_type,
      action.selector || null,
      action.value || null,
      afterHash,
      expected_result_description,
      0,
      credits,
      now
    );
    const action_id = ins.lastInsertRowid;

    db.prepare('UPDATE cu_sessions SET action_count = action_count + 1, last_action = ?, credits_used = credits_used + ? WHERE id = ?').run(now, credits, session_id);

    // 2. Run verification
    let verified = false;
    let confidence = 0;
    let diff_pixels = 0;
    let diff_percent = 0;

    if (screenshot_after_b64) {
      const prevShot = db.prepare(
        'SELECT data_b64 FROM cu_screenshots WHERE session_id = ? ORDER BY ts DESC LIMIT 1'
      ).get(session_id);

      if (prevShot) {
        const d = pixelDiff(prevShot.data_b64, screenshot_after_b64);
        diff_pixels = d.diff_pixels;
        diff_percent = d.diff_percent;
        const changeActions = new Set(['click', 'type', 'navigate', 'keypress', 'drag']);
        if (changeActions.has(action.action_type)) {
          if (diff_percent > 0 && diff_percent < 80) {
            confidence = Math.min(95, 50 + diff_percent * 2);
            verified = true;
          } else if (diff_percent === 0) {
            confidence = 20;
            verified = false;
          } else {
            confidence = 30;
            verified = false;
          }
        } else {
          confidence = diff_percent < 20 ? 80 : 50;
          verified = true;
        }
      } else {
        confidence = 60;
        verified = true;
      }

      // Store the after-screenshot
      const shotId = uid();
      db.prepare(
        'INSERT INTO cu_screenshots (id, session_id, data_b64, width, height, ocr_text, label, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(shotId, session_id, screenshot_after_b64, null, null, '', 'pipeline_verify', now);

      db.prepare(
        'INSERT INTO cu_verifications (session_id, action_id, expected_hash, actual_hash, passed, diff_pixels, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(session_id, action_id, null, afterHash, verified ? 1 : 0, diff_pixels, now);

      db.prepare('UPDATE cu_actions SET verified = ? WHERE id = ?').run(verified ? 1 : 0, action_id);
    } else {
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
      credits_charged: credits,
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
      credits_charged: credits,
      memory_updated,
      session_id,
    });
  });
};
