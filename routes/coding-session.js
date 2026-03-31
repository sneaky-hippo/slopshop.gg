'use strict';
const crypto = require('crypto');

function requireAuth(req, res, apiKeys) {
  const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!key || !apiKeys.get(key)) {
    res.status(401).json({ error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
    return null;
  }
  return { key, acct: apiKeys.get(key) };
}

function ok(res, data) {
  res.json({ ok: true, _engine: 'real', ...data });
}

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

module.exports = function (app, db, apiKeys) {
  // ===== DB SCHEMA =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS coding_sessions (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      language TEXT DEFAULT 'javascript',
      code TEXT DEFAULT '',
      status TEXT DEFAULT 'waiting',
      rotation_policy TEXT DEFAULT 'round-robin',
      current_turn TEXT,
      turn_order TEXT DEFAULT '[]',
      participants TEXT DEFAULT '[]',
      turn_index INTEGER DEFAULT 0,
      turn_started_at INTEGER DEFAULT 0,
      turn_timeout_ms INTEGER DEFAULT 120000,
      message_count INTEGER DEFAULT 0,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_coding_sessions_api_key ON coding_sessions(api_key);
    CREATE TABLE IF NOT EXISTS coding_session_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      actor_type TEXT DEFAULT 'human',
      action TEXT NOT NULL,
      content TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_coding_session_history_session ON coding_session_history(session_id);
    CREATE TABLE IF NOT EXISTS pubsub (channel TEXT, message TEXT, sender TEXT, ts INTEGER);
  `);

  // ===== PREPARED STATEMENTS =====
  const stmts = {
    insertSession: db.prepare(`INSERT INTO coding_sessions
      (id, api_key, name, description, language, code, status, rotation_policy, current_turn, turn_order, participants, turn_index, turn_started_at, turn_timeout_ms, message_count, created, updated)
      VALUES (?, ?, ?, ?, ?, '', 'waiting', ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)`),
    getSession: db.prepare('SELECT * FROM coding_sessions WHERE id = ?'),
    listSessions: db.prepare('SELECT id, name, description, language, status, rotation_policy, current_turn, participants, message_count, created, updated FROM coding_sessions WHERE api_key = ? ORDER BY updated DESC LIMIT 50'),
    updateParticipants: db.prepare('UPDATE coding_sessions SET participants = ?, turn_order = ?, updated = ? WHERE id = ?'),
    updateStatus: db.prepare('UPDATE coding_sessions SET status = ?, updated = ? WHERE id = ?'),
    updateCode: db.prepare('UPDATE coding_sessions SET code = ?, updated = ? WHERE id = ?'),
    updateTurn: db.prepare('UPDATE coding_sessions SET current_turn = ?, turn_index = ?, turn_started_at = ?, status = ?, updated = ? WHERE id = ?'),
    incrementMessages: db.prepare('UPDATE coding_sessions SET message_count = message_count + 1, updated = ? WHERE id = ?'),
    getFreshTurn: db.prepare('SELECT current_turn, turn_index FROM coding_sessions WHERE id = ?'),
    insertHistory: db.prepare('INSERT INTO coding_session_history (session_id, actor, actor_type, action, content, metadata, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    getHistory: db.prepare('SELECT * FROM coding_session_history WHERE session_id = ? ORDER BY ts ASC LIMIT ? OFFSET ?'),
    pollPubsub: db.prepare('SELECT message, sender, ts FROM pubsub WHERE channel = ? AND ts > ? ORDER BY ts ASC LIMIT 50'),
    insertPubsub: db.prepare('INSERT INTO pubsub (channel, message, sender, ts) VALUES (?, ?, ?, ?)'),
  };

  const CODE_MAX = 200 * 1024; // 200KB

  // ===== HELPERS =====
  function publishEvent(sessionId, type, payload, actor) {
    const channel = `coding-session:${sessionId}`;
    const message = JSON.stringify({ type, ...payload, ts: Date.now() });
    stmts.insertPubsub.run(channel, message, (actor || 'system').slice(0, 20), Date.now());
  }

  function logHistory(sessionId, actor, actorType, action, content, metadata) {
    stmts.insertHistory.run(sessionId, actor, actorType, action, content || '', JSON.stringify(metadata || {}), Date.now());
  }

  function nextRoundRobin(turnOrder, currentIdx) {
    const nextIdx = (currentIdx + 1) % turnOrder.length;
    return { next: turnOrder[nextIdx], nextIdx };
  }

  function serializeSession(s) {
    return {
      ...s,
      participants: JSON.parse(s.participants || '[]'),
      turn_order: JSON.parse(s.turn_order || '[]'),
    };
  }

  // ===== 1. CREATE SESSION =====
  app.post('/v1/coding-session/create', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { name, description, language, rotation_policy, turn_timeout_ms, creator_name, skills } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) return fail(res, 400, 'missing_name', 'name is required');

    const id = crypto.randomUUID();
    const now = Date.now();
    const actor = auth.key.slice(0, 12);
    const participants = [{ id: actor, name: (creator_name || actor).slice(0, 50), role: 'owner', skills: Array.isArray(skills) ? skills : [], joined_at: now }];
    const turnOrder = [actor];
    const policy = ['round-robin', 'skill-based', 'user-picks', 'auto'].includes(rotation_policy) ? rotation_policy : 'round-robin';

    stmts.insertSession.run(
      id, auth.key, name.trim().slice(0, 200), (description || '').slice(0, 500),
      language || 'javascript', policy, actor, JSON.stringify(turnOrder),
      JSON.stringify(participants), now, turn_timeout_ms || 120000, now, now
    );
    logHistory(id, actor, 'human', 'create', `Session "${name}" created`, { language, rotation_policy: policy });

    ok(res, {
      id, name: name.trim(), status: 'waiting', language: language || 'javascript',
      rotation_policy: policy, current_turn: actor, participants,
      join_url: `/coding-session?id=${id}`,
    });
  });

  // ===== 2. LIST SESSIONS =====
  app.get('/v1/coding-sessions', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const sessions = stmts.listSessions.all(auth.key);
    ok(res, { sessions: sessions.map(serializeSession) });
  });

  // ===== 3. GET SESSION =====
  app.get('/v1/coding-session/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const session = stmts.getSession.get(req.params.id);
    if (!session) return fail(res, 404, 'not_found', 'Session not found');
    ok(res, { session: serializeSession(session) });
  });

  // ===== 4. JOIN SESSION =====
  app.post('/v1/coding-session/:id/join', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const session = stmts.getSession.get(req.params.id);
    if (!session) return fail(res, 404, 'not_found', 'Session not found');
    if (session.status === 'ended') return fail(res, 400, 'session_ended', 'Session has ended');

    const actor = auth.key.slice(0, 12);
    const participants = JSON.parse(session.participants || '[]');
    const turnOrder = JSON.parse(session.turn_order || '[]');

    if (participants.find(p => p.id === actor)) {
      return ok(res, { joined: false, reason: 'already_joined', participants, current_turn: session.current_turn });
    }

    const displayName = (req.body.name || actor).slice(0, 50);
    const role = ['contributor', 'reviewer', 'observer', 'ai'].includes(req.body.role) ? req.body.role : 'contributor';
    const newP = { id: actor, name: displayName, role, skills: Array.isArray(req.body.skills) ? req.body.skills : [], joined_at: Date.now() };
    participants.push(newP);
    if (role !== 'observer') turnOrder.push(actor);

    stmts.updateParticipants.run(JSON.stringify(participants), JSON.stringify(turnOrder), Date.now(), session.id);
    logHistory(session.id, actor, 'human', 'join', `${displayName} joined as ${role}`, { role });
    publishEvent(session.id, 'participant_joined', { participant: newP, participant_count: participants.length }, actor);

    ok(res, { joined: true, participant: newP, participants, current_turn: session.current_turn });
  });

  // ===== 5. SEND MESSAGE =====
  app.post('/v1/coding-session/:id/message', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const session = stmts.getSession.get(req.params.id);
    if (!session) return fail(res, 404, 'not_found', 'Session not found');
    if (session.status === 'ended') return fail(res, 400, 'session_ended', 'Session has ended');

    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) return fail(res, 400, 'missing_message', 'message is required');

    const actor = auth.key.slice(0, 12);
    const participants = JSON.parse(session.participants || '[]');
    const p = participants.find(p => p.id === actor);
    const actorName = p ? p.name : actor;
    const content = message.trim().slice(0, 5000);

    logHistory(session.id, actor, 'human', 'message', content, {});
    stmts.incrementMessages.run(Date.now(), session.id);
    publishEvent(session.id, 'message', { actor, actor_name: actorName, message: content }, actor);

    ok(res, { ok: true, actor, actor_name: actorName, message: content });
  });

  // ===== 6. UPDATE CODE (requires current turn or owner) =====
  app.post('/v1/coding-session/:id/code', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const session = stmts.getSession.get(req.params.id);
    if (!session) return fail(res, 404, 'not_found', 'Session not found');
    if (session.status === 'ended') return fail(res, 400, 'session_ended', 'Session has ended');
    if (session.status === 'paused') return fail(res, 400, 'session_paused', 'Session is paused — resume first');

    const actor = auth.key.slice(0, 12);
    const isOwner = session.api_key === auth.key;
    if (!isOwner && session.status === 'active' && session.current_turn !== actor) {
      return fail(res, 403, 'not_your_turn', `It is ${session.current_turn}'s turn to code`);
    }

    const { code } = req.body;
    if (code === undefined || code === null) return fail(res, 400, 'missing_code', 'code field is required');
    if (typeof code !== 'string') return fail(res, 400, 'invalid_code', 'code must be a string');
    const bytes = Buffer.byteLength(code, 'utf8');
    if (bytes > CODE_MAX) return fail(res, 400, 'code_too_large', `Code exceeds 200KB limit (got ${Math.round(bytes / 1024)}KB)`);

    stmts.updateCode.run(code, Date.now(), session.id);
    logHistory(session.id, actor, 'human', 'code_update', '', { bytes, lines: code.split('\n').length });
    publishEvent(session.id, 'code_update', { actor, preview: code.slice(0, 120), bytes, lines: code.split('\n').length }, actor);

    ok(res, { ok: true, bytes, lines: code.split('\n').length });
  });

  // ===== 7. ADVANCE TURN =====
  app.post('/v1/coding-session/:id/advance', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const session = stmts.getSession.get(req.params.id);
    if (!session) return fail(res, 404, 'not_found', 'Session not found');
    if (session.status === 'ended') return fail(res, 400, 'session_ended', 'Session has ended');

    const actor = auth.key.slice(0, 12);
    const isOwner = session.api_key === auth.key;
    if (!isOwner && session.current_turn !== actor) {
      return fail(res, 403, 'not_your_turn', 'Only the current turn holder or session owner can advance the turn');
    }

    const turnOrder = JSON.parse(session.turn_order || '[]');
    if (turnOrder.length < 2) return fail(res, 400, 'need_more_participants', 'Need at least 2 participants to rotate turns');

    let nextActor, nextIdx;

    if (session.rotation_policy === 'user-picks') {
      const { next_participant } = req.body;
      if (!next_participant) return fail(res, 400, 'missing_next_participant', 'next_participant is required for user-picks policy');
      if (!turnOrder.includes(next_participant)) return fail(res, 400, 'invalid_next', `next_participant must be one of: ${turnOrder.join(', ')}`);
      nextActor = next_participant;
      nextIdx = turnOrder.indexOf(next_participant);
    } else if (session.rotation_policy === 'skill-based' && req.body.context) {
      // Match skills to context keywords
      const participants = JSON.parse(session.participants || '[]');
      const ctx = (req.body.context || '').toLowerCase();
      let bestMatch = null, bestScore = -1;
      for (const p of participants) {
        if (!turnOrder.includes(p.id) || p.id === actor) continue;
        const score = (p.skills || []).filter(s => ctx.includes(s.toLowerCase())).length;
        if (score > bestScore) { bestScore = score; bestMatch = p.id; }
      }
      nextActor = bestMatch || nextRoundRobin(turnOrder, session.turn_index).next;
      nextIdx = turnOrder.indexOf(nextActor);
    } else {
      const rotation = nextRoundRobin(turnOrder, session.turn_index);
      nextActor = rotation.next;
      nextIdx = rotation.nextIdx;
    }

    const now = Date.now();
    // Transaction prevents concurrent advance race conditions
    const advanceTurn = db.transaction(() => {
      const fresh = stmts.getFreshTurn.get(session.id);
      if (fresh.turn_index !== session.turn_index) return { raced: true, current_turn: fresh.current_turn };
      stmts.updateTurn.run(nextActor, nextIdx, now, 'active', now, session.id);
      return { raced: false };
    });

    const result = advanceTurn();
    if (result.raced) return ok(res, { ok: true, current_turn: result.current_turn, note: 'turn already advanced by another request' });

    const participants = JSON.parse(session.participants || '[]');
    const nextP = participants.find(p => p.id === nextActor) || { id: nextActor, name: nextActor };
    logHistory(session.id, actor, 'human', 'turn_advance', `Turn passed to ${nextP.name}`, { prev: actor, next: nextActor });
    publishEvent(session.id, 'turn_advance', { prev_turn: actor, current_turn: nextActor, turn_index: nextIdx, participant: nextP }, actor);

    ok(res, { ok: true, prev_turn: actor, current_turn: nextActor, participant: nextP });
  });

  // ===== 8. PAUSE SESSION (owner only) =====
  app.post('/v1/coding-session/:id/pause', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const session = stmts.getSession.get(req.params.id);
    if (!session) return fail(res, 404, 'not_found', 'Session not found');
    if (session.api_key !== auth.key) return fail(res, 403, 'owner_only', 'Only session owner can pause');
    if (session.status !== 'active') return fail(res, 400, 'not_active', `Session is ${session.status}, not active`);

    stmts.updateStatus.run('paused', Date.now(), session.id);
    const actor = auth.key.slice(0, 12);
    logHistory(session.id, actor, 'human', 'pause', 'Session paused', {});
    publishEvent(session.id, 'session_paused', { actor }, actor);

    ok(res, { ok: true, status: 'paused' });
  });

  // ===== 9. RESUME SESSION (owner only) =====
  app.post('/v1/coding-session/:id/resume', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const session = stmts.getSession.get(req.params.id);
    if (!session) return fail(res, 404, 'not_found', 'Session not found');
    if (session.api_key !== auth.key) return fail(res, 403, 'owner_only', 'Only session owner can resume');
    if (session.status !== 'paused') return fail(res, 400, 'not_paused', `Session is ${session.status}, not paused`);

    stmts.updateStatus.run('active', Date.now(), session.id);
    const actor = auth.key.slice(0, 12);
    logHistory(session.id, actor, 'human', 'resume', 'Session resumed', {});
    publishEvent(session.id, 'session_resumed', { actor }, actor);

    ok(res, { ok: true, status: 'active' });
  });

  // ===== 10. END SESSION (owner only) =====
  app.post('/v1/coding-session/:id/end', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const session = stmts.getSession.get(req.params.id);
    if (!session) return fail(res, 404, 'not_found', 'Session not found');
    if (session.api_key !== auth.key) return fail(res, 403, 'owner_only', 'Only session owner can end session');
    if (session.status === 'ended') return ok(res, { ok: true, status: 'ended' });

    stmts.updateStatus.run('ended', Date.now(), session.id);
    const actor = auth.key.slice(0, 12);
    logHistory(session.id, actor, 'human', 'end', 'Session ended', {});
    publishEvent(session.id, 'session_ended', { actor }, actor);

    ok(res, { ok: true, status: 'ended' });
  });

  // ===== 11. SSE STREAM =====
  app.get('/v1/coding-session/:id/stream', (req, res) => {
    const rawKey = (req.headers.authorization || req.query.key || '').replace('Bearer ', '').trim();
    if (!rawKey || !apiKeys.get(rawKey)) return res.status(401).json({ error: { code: 'auth_required' } });

    const session = stmts.getSession.get(req.params.id);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':\n\n'); // comment to flush headers

    const channel = `coding-session:${session.id}`;
    let since = Date.now() - 500; // small lookback for events just before connect
    let closed = false;
    const MAX_DURATION = 30 * 60 * 1000; // 30 min max
    const startTime = Date.now();
    let heartbeatCounter = 0;

    function push(event, data) {
      if (closed) return;
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) { closed = true; }
    }

    // Send initial full state
    const full = stmts.getSession.get(session.id);
    push('init', { session: serializeSession(full) });

    const interval = setInterval(() => {
      if (closed) return;

      if (Date.now() - startTime > MAX_DURATION) {
        push('close', { reason: 'max_duration_reached' });
        res.end();
        closed = true;
        clearInterval(interval);
        return;
      }

      // Poll pubsub for new events in this session's channel
      try {
        const rows = stmts.pollPubsub.all(channel, since);
        if (rows.length) {
          since = rows[rows.length - 1].ts;
          for (const row of rows) {
            try {
              const msg = JSON.parse(row.message);
              push(msg.type || 'event', msg);
            } catch (_) {}
          }
        }
      } catch (_) {}

      // Heartbeat every ~10s (800ms * 12.5 = 10s)
      heartbeatCounter++;
      if (heartbeatCounter % 13 === 0) {
        push('heartbeat', { ts: Date.now(), elapsed_s: Math.round((Date.now() - startTime) / 1000) });
      }
    }, 800);

    req.on('close', () => {
      closed = true;
      clearInterval(interval);
    });
  });

  // ===== 12. GET HISTORY =====
  app.get('/v1/coding-session/:id/history', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;
    const session = stmts.getSession.get(req.params.id);
    if (!session) return fail(res, 404, 'not_found', 'Session not found');

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const history = stmts.getHistory.all(session.id, limit, offset);

    ok(res, { history, count: history.length, limit, offset });
  });
};
