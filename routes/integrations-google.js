'use strict';
/**
 * Google OAuth Integration — Gmail + Calendar data pull into Memory Hub
 *
 * Endpoints:
 *   GET  /v1/integrations/google/connect   — redirect to Google OAuth consent screen
 *   GET  /v1/integrations/google/callback  — handle OAuth callback, store tokens, trigger initial pull
 *   POST /v1/integrations/google/sync      — manual Gmail + Calendar pull (requires auth)
 *   GET  /v1/integrations/google/status    — connection status for current user (requires auth)
 *
 * Zero external packages — only Node.js built-ins: crypto, https, querystring.
 *
 * Usage: require('./routes/integrations-google')(app, db, apiKeys, allHandlers, auth, hashApiKey)
 */

const crypto = require('crypto');
const https  = require('https');
const qs     = require('querystring');

module.exports = function mountGoogleIntegrations(app, db, apiKeys, allHandlers, auth, hashApiKey) {

  // ── Bootstrap table ──────────────────────────────────────────────────────────

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS integration_tokens (
        id           TEXT PRIMARY KEY,
        api_key      TEXT NOT NULL,
        provider     TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        expiry       INTEGER,
        email        TEXT,
        created_at   INTEGER,
        updated_at   INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_int_tokens_key ON integration_tokens(api_key, provider);
    `);
  } catch (_) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Require Bearer auth; returns the raw api_key string or null (and has already sent 401). */
  function requireAuth(req, res) {
    const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!key || !apiKeys.has(key)) {
      res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
      return null;
    }
    return key;
  }

  /** sha-256 hash of the api key — 16-char prefix used as namespace prefix. */
  function keyHash(key) {
    return (typeof hashApiKey === 'function')
      ? hashApiKey(key)
      : crypto.createHash('sha256').update(key).digest('hex');
  }

  /** Consumer-facing frontend URL. */
  function consumerUrl() {
    const raw = process.env.CONSUMER_URL || process.env.BASE_URL || 'https://remlabs.ai';
    return raw.replace(/\/$/, '');
  }

  /** Railway/backend base URL used as the OAuth redirect_uri origin. */
  function backendUrl() {
    const raw = process.env.GOOGLE_REDIRECT_URI
      || process.env.API_BASE_URL
      || 'https://slopshop-production.up.railway.app';
    // If GOOGLE_REDIRECT_URI is the full callback URL, return it directly.
    if (raw.includes('/v1/integrations/google/callback')) return raw;
    return raw.replace(/\/$/, '') + '/v1/integrations/google/callback';
  }

  /**
   * Generic HTTPS request helper.
   * options: standard https.request options object
   * body:    optional string body
   * Returns { status, body } — body is parsed JSON if possible, raw string otherwise.
   */
  function httpsRequest(options, body) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (_) { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on('error', reject);
      req.setTimeout(20000, () => { req.destroy(); reject(new Error('https_request_timeout')); });
      if (body) req.write(body);
      req.end();
    });
  }

  /** POST form-encoded body to a Google HTTPS endpoint. */
  function googlePost(hostname, path, formFields) {
    const payload = qs.stringify(formFields);
    return httpsRequest({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, payload);
  }

  /** GET request with a Bearer token. */
  function googleGet(hostname, path, accessToken, extraHeaders) {
    return httpsRequest({
      hostname,
      path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Accept': 'application/json',
        ...(extraHeaders || {}),
      },
    });
  }

  /**
   * Refresh an expired access token.
   * Returns updated { access_token, expiry } or throws.
   */
  async function refreshAccessToken(refreshToken) {
    const result = await googlePost('oauth2.googleapis.com', '/token', {
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    });
    if (!result.body || !result.body.access_token) {
      throw new Error('token_refresh_failed: ' + JSON.stringify(result.body).slice(0, 200));
    }
    return {
      access_token: result.body.access_token,
      expiry: Date.now() + ((result.body.expires_in || 3600) * 1000),
    };
  }

  /**
   * Retrieve stored tokens for (api_key, provider), refreshing if needed.
   * Returns the token row with a fresh access_token, or null if not connected.
   */
  async function getValidToken(apiKey, provider) {
    const row = db.prepare(
      'SELECT * FROM integration_tokens WHERE api_key = ? AND provider = ?'
    ).get(apiKey, provider);
    if (!row) return null;

    const bufferMs = 5 * 60 * 1000; // refresh 5 min before expiry
    if (row.expiry && Date.now() > (row.expiry - bufferMs) && row.refresh_token) {
      try {
        const fresh = await refreshAccessToken(row.refresh_token);
        db.prepare(
          'UPDATE integration_tokens SET access_token = ?, expiry = ?, updated_at = ? WHERE id = ?'
        ).run(fresh.access_token, fresh.expiry, Date.now(), row.id);
        row.access_token = fresh.access_token;
        row.expiry       = fresh.expiry;
      } catch (e) {
        console.error('[integrations-google] token refresh failed:', e.message);
        // Return the (possibly stale) row; the caller will surface an API error.
      }
    }
    return row;
  }

  /**
   * Store memories using allHandlers['memory-set'].
   * Namespace: {keyHash16}:google-life
   */
  async function storeMemory(apiKey, key, value, tags) {
    const memSet = allHandlers && allHandlers['memory-set'];
    if (!memSet) {
      console.warn('[integrations-google] memory-set handler unavailable — skipping store');
      return false;
    }
    const ns = keyHash(apiKey).slice(0, 16) + ':google-life';
    try {
      await memSet({ namespace: ns, key, value, tags: tags || [] });
      return true;
    } catch (e) {
      console.error('[integrations-google] memory-set error:', e.message);
      return false;
    }
  }

  /**
   * If the user just accumulated >10 new memories, fire a synthesize dream.
   * Best-effort — errors are silently swallowed.
   */
  async function maybeFireDream(apiKey, newCount) {
    if (newCount < 10) return;
    try {
      const dreamHandler = allHandlers && allHandlers['memory-dream-start'];
      if (dreamHandler) {
        await dreamHandler({ strategy: 'synthesize', api_key: apiKey });
        return;
      }
      // Fallback: fire the internal POST endpoint via self-call is not possible without
      // a running HTTP server reference — skip silently if handler not registered.
    } catch (_) {}
  }

  // ── Pull logic ───────────────────────────────────────────────────────────────

  /**
   * Pull Gmail threads (last 30 days, max 50) and store as memories.
   * Returns the number of memories stored.
   */
  async function pullGmail(apiKey, accessToken) {
    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    // List thread IDs
    const listResult = await googleGet(
      'gmail.googleapis.com',
      '/gmail/v1/users/me/threads?maxResults=50&q=' + encodeURIComponent('after:' + since),
      accessToken
    );

    if (!listResult.body || !listResult.body.threads) return 0;

    const threads = listResult.body.threads.slice(0, 50);
    let stored = 0;

    for (const thread of threads) {
      try {
        // Fetch thread metadata (format=metadata gives headers + snippet, no body)
        const tResult = await googleGet(
          'gmail.googleapis.com',
          '/gmail/v1/users/me/threads/' + thread.id + '?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date',
          accessToken
        );

        if (!tResult.body || !tResult.body.messages || !tResult.body.messages.length) continue;

        const msg    = tResult.body.messages[0];
        const headers = (msg.payload && msg.payload.headers) || [];
        const get     = (name) => (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';

        const subject = get('Subject') || '(no subject)';
        const from    = get('From') || '';
        const date    = get('Date') || '';
        const snippet = (msg.snippet || '').slice(0, 300);

        const memKey   = 'gmail:thread:' + thread.id;
        const memValue = JSON.stringify({ subject, from, date, snippet });

        const ok = await storeMemory(apiKey, memKey, memValue, ['gmail', 'email', 'google-life']);
        if (ok) stored++;
      } catch (e) {
        console.error('[integrations-google] gmail thread fetch error:', e.message);
      }
    }

    return stored;
  }

  /**
   * Pull Calendar events (next + past 30 days) and store as memories.
   * Returns the number of memories stored.
   */
  async function pullCalendar(apiKey, accessToken) {
    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 7  * 24 * 60 * 60 * 1000).toISOString(); // +7 days future
    const path =
      '/calendar/v3/calendars/primary/events' +
      '?maxResults=50' +
      '&singleEvents=true' +
      '&orderBy=startTime' +
      '&timeMin=' + encodeURIComponent(timeMin) +
      '&timeMax=' + encodeURIComponent(timeMax);

    const result = await googleGet('www.googleapis.com', path, accessToken);
    if (!result.body || !result.body.items) return 0;

    const events = result.body.items;
    let stored = 0;

    for (const event of events) {
      try {
        const title    = event.summary || '(untitled event)';
        const start    = (event.start && (event.start.dateTime || event.start.date)) || '';
        const end      = (event.end   && (event.end.dateTime   || event.end.date))   || '';
        const location = event.location || '';
        const attendees = ((event.attendees || []).map(a => a.email)).slice(0, 10);

        const memKey   = 'calendar:event:' + (event.id || crypto.randomBytes(8).toString('hex'));
        const memValue = JSON.stringify({ title, start, end, location, attendees });

        const ok = await storeMemory(apiKey, memKey, memValue, ['calendar', 'event', 'google-life']);
        if (ok) stored++;
      } catch (e) {
        console.error('[integrations-google] calendar event error:', e.message);
      }
    }

    return stored;
  }

  /**
   * Full sync: pull both Gmail and Calendar, return counts.
   */
  async function runSync(apiKey) {
    const tokenRow = await getValidToken(apiKey, 'google');
    if (!tokenRow) throw Object.assign(new Error('not_connected'), { code: 'not_connected' });

    const [emailsPulled, eventsPulled] = await Promise.all([
      pullGmail(apiKey, tokenRow.access_token).catch(e => {
        console.error('[integrations-google] gmail pull error:', e.message); return 0;
      }),
      pullCalendar(apiKey, tokenRow.access_token).catch(e => {
        console.error('[integrations-google] calendar pull error:', e.message); return 0;
      }),
    ]);

    const memoriesStored = emailsPulled + eventsPulled;

    // Update last_sync timestamp
    try {
      db.prepare('UPDATE integration_tokens SET updated_at = ? WHERE api_key = ? AND provider = ?')
        .run(Date.now(), apiKey, 'google');
    } catch (_) {}

    // Optionally fire a dream if we stored enough new memories
    await maybeFireDream(apiKey, memoriesStored);

    return { emails_pulled: emailsPulled, events_pulled: eventsPulled, memories_stored: memoriesStored };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ROUTE 1 — GET /v1/integrations/google/connect
  // Redirects the user to Google's OAuth consent screen.
  // The caller passes ?api_key=<key> in the query string (or it's in the Bearer header).
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/v1/integrations/google/connect', (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ ok: false, error: 'google_not_configured' });
    }

    // Accept the api_key from query param (for browser-initiated redirects)
    // or from Authorization header (for API clients).
    let apiKey = req.query.api_key
      || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

    if (!apiKey || !apiKeys.has(apiKey)) {
      return res.status(401).json({ ok: false, error: 'auth_required' });
    }

    try {
      // Encode the api_key as base64 in the state param so we can retrieve it on callback.
      // Also append a random nonce to prevent CSRF.
      const nonce     = crypto.randomBytes(12).toString('hex');
      const stateData = Buffer.from(JSON.stringify({ key: apiKey, nonce })).toString('base64url');

      // Persist state for CSRF validation
      try {
        db.exec(`CREATE TABLE IF NOT EXISTS integration_oauth_states (
          state TEXT PRIMARY KEY, created_at INTEGER NOT NULL
        )`);
      } catch (_) {}
      db.prepare('INSERT OR REPLACE INTO integration_oauth_states (state, created_at) VALUES (?, ?)')
        .run(stateData, Date.now());

      const params = new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        redirect_uri:  backendUrl(),
        response_type: 'code',
        scope:         'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email',
        access_type:   'offline',   // ensures we get a refresh_token
        prompt:        'consent',   // forces refresh_token even if already granted
        state:         stateData,
      });

      return res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
    } catch (e) {
      console.error('[integrations-google] /connect error:', e.message);
      return res.status(500).json({ ok: false, error: 'oauth_init_failed' });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ROUTE 2 — GET /v1/integrations/google/callback
  // Handles OAuth callback after user approves. Exchanges code, stores tokens,
  // triggers initial data pull, then redirects to the consumer frontend.
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/v1/integrations/google/callback', async (req, res) => {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(consumerUrl() + '/console?error=' + encodeURIComponent(oauthError));
    }
    if (!code || !state) {
      return res.redirect(consumerUrl() + '/console?error=missing_callback_params');
    }

    // Validate CSRF state
    let statePayload;
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS integration_oauth_states (
        state TEXT PRIMARY KEY, created_at INTEGER NOT NULL
      )`);
      const stateRow = db.prepare('SELECT state FROM integration_oauth_states WHERE state = ?').get(state);
      if (!stateRow) {
        return res.redirect(consumerUrl() + '/console?error=invalid_state');
      }
      // Consume state
      db.prepare('DELETE FROM integration_oauth_states WHERE state = ?').run(state);
      statePayload = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch (e) {
      console.error('[integrations-google] callback state parse error:', e.message);
      return res.redirect(consumerUrl() + '/console?error=invalid_state');
    }

    const apiKey = statePayload && statePayload.key;
    if (!apiKey || !apiKeys.has(apiKey)) {
      return res.redirect(consumerUrl() + '/console?error=key_not_found');
    }

    try {
      // Exchange code for tokens
      const tokenResult = await googlePost('oauth2.googleapis.com', '/token', {
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  backendUrl(),
        grant_type:    'authorization_code',
      });

      if (!tokenResult.body || tokenResult.body.error) {
        const errMsg = (tokenResult.body && tokenResult.body.error) || 'token_exchange_failed';
        console.error('[integrations-google] token exchange error:', errMsg);
        return res.redirect(consumerUrl() + '/console?error=' + encodeURIComponent(errMsg));
      }

      const { access_token, refresh_token, expires_in, id_token } = tokenResult.body;
      const expiry = Date.now() + ((expires_in || 3600) * 1000);

      // Decode id_token to get user email (no verification needed — came directly from Google HTTPS)
      let email = '';
      if (id_token) {
        try {
          const parts  = id_token.split('.');
          const b64    = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
          const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
          email = payload.email || '';
        } catch (_) {}
      }

      // Upsert token row
      const tokenId = keyHash(apiKey).slice(0, 16) + ':google';
      const now     = Date.now();

      const existing = db.prepare('SELECT id FROM integration_tokens WHERE api_key = ? AND provider = ?').get(apiKey, 'google');
      if (existing) {
        db.prepare(`
          UPDATE integration_tokens
          SET access_token = ?, refresh_token = COALESCE(?, refresh_token),
              expiry = ?, email = ?, updated_at = ?
          WHERE api_key = ? AND provider = ?
        `).run(access_token, refresh_token || null, expiry, email, now, apiKey, 'google');
      } else {
        db.prepare(`
          INSERT INTO integration_tokens (id, api_key, provider, access_token, refresh_token, expiry, email, created_at, updated_at)
          VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?)
        `).run(tokenId, apiKey, access_token, refresh_token || null, expiry, email, now, now);
      }

      // Trigger initial background data pull (non-blocking)
      setImmediate(() => {
        runSync(apiKey).then(counts => {
          console.log('[integrations-google] initial sync complete:', counts);
        }).catch(e => {
          console.error('[integrations-google] initial sync error:', e.message);
        });
      });

      return res.redirect(consumerUrl() + '/console?connected=google');
    } catch (e) {
      console.error('[integrations-google] callback error:', e.message);
      return res.redirect(consumerUrl() + '/console?error=callback_failed');
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ROUTE 3 — POST /v1/integrations/google/sync  (requires auth)
  // Manually trigger a Gmail + Calendar pull for the authenticated user.
  // ════════════════════════════════════════════════════════════════════════════

  app.post('/v1/integrations/google/sync', async (req, res) => {
    const apiKey = requireAuth(req, res);
    if (!apiKey) return;

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ ok: false, error: 'google_not_configured' });
    }

    try {
      const counts = await runSync(apiKey);
      return res.json({ ok: true, ...counts });
    } catch (e) {
      if (e.code === 'not_connected') {
        return res.status(404).json({ ok: false, error: 'not_connected', message: 'Connect Google first via GET /v1/integrations/google/connect' });
      }
      console.error('[integrations-google] /sync error:', e.message);
      return res.status(500).json({ ok: false, error: 'sync_failed', message: e.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ROUTE 4 — GET /v1/integrations/google/status  (requires auth)
  // Returns connection status and last sync time for the current user.
  // ════════════════════════════════════════════════════════════════════════════

  app.get('/v1/integrations/google/status', (req, res) => {
    const apiKey = requireAuth(req, res);
    if (!apiKey) return;

    try {
      const row = db.prepare(
        'SELECT email, expiry, updated_at FROM integration_tokens WHERE api_key = ? AND provider = ?'
      ).get(apiKey, 'google');

      if (!row) {
        return res.json({ ok: true, connected: false, email: null, last_sync: null });
      }

      return res.json({
        ok:        true,
        connected: true,
        email:     row.email || null,
        last_sync: row.updated_at || null,
        // Surface whether the stored token is currently valid (not expired)
        token_valid: row.expiry ? Date.now() < row.expiry : true,
      });
    } catch (e) {
      console.error('[integrations-google] /status error:', e.message);
      return res.status(500).json({ ok: false, error: 'status_failed' });
    }
  });

  // Cleanup stale integration OAuth states every 15 minutes
  setInterval(() => {
    try {
      db.prepare('DELETE FROM integration_oauth_states WHERE created_at < ?').run(Date.now() - 900000);
    } catch (_) {}
  }, 900000);

  console.log('[integrations-google] routes mounted: connect / callback / sync / status');
};
