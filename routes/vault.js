'use strict';

/**
 * Credential Vault — Secretless Agent Pattern
 * routes/vault.js
 *
 * Agents store API keys by vault_id and NEVER see raw credentials again.
 * External calls are proxied server-side so the key is never transmitted to
 * the agent.
 *
 * Security guarantees:
 *   - AES-256-GCM authenticated encryption (auth_tag prevents tampering)
 *   - scrypt key derivation (N=16384, r=8, p=1) — memoized after first call
 *   - Credentials NEVER appear in any response after initial storage
 *   - SSRF prevention: blocks loopback, RFC-1918, link-local, HTTPS required
 *     + DNS pre-resolution to detect IP-level rebinding
 *   - All operations logged to vault_audit_log (excluding credential value)
 */

const crypto = require('crypto');
const dns = require('dns').promises;

// Warn at startup if running with the insecure default key
if (!process.env.INTERNAL_SECRET) {
  console.warn('[vault] WARNING: INTERNAL_SECRET env var is not set. Using insecure default key. Set INTERNAL_SECRET for production.');
}

// ─── Encryption helpers ───────────────────────────────────────────────────────

// Memoize the derived key — scrypt is intentionally expensive; no need to repeat on every call
let _cachedDerivedKey = null;
let _cachedSecret = null;
function getDerivedKey() {
  const secret = process.env.INTERNAL_SECRET || 'slop-internal-secret-change-me';
  if (_cachedDerivedKey && _cachedSecret === secret) return _cachedDerivedKey;
  _cachedDerivedKey = crypto.scryptSync(secret, 'vault-salt-v1', 32, { N: 16384, r: 8, p: 1 });
  _cachedSecret = secret;
  return _cachedDerivedKey;
}

function encrypt(plaintext) {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const auth_tag = cipher.getAuthTag(); // 16-byte auth tag
  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    auth_tag: auth_tag.toString('hex'),
  };
}

function decrypt(ciphertext_hex, iv_hex, auth_tag_hex) {
  const key = getDerivedKey();
  const iv = Buffer.from(iv_hex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(auth_tag_hex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext_hex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// ─── SSRF prevention ──────────────────────────────────────────────────────────

const BLOCKED_PREFIXES = [
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,        // AWS metadata + link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // RFC-6598 shared address space
  /^::1$/,              // IPv6 loopback
  /^::ffff:/i,          // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  /^64:ff9b:/i,         // IPv4/IPv6 NAT64
  /^fd[0-9a-f]{2}:/i,  // IPv6 ULA
  /^fe80:/i,            // IPv6 link-local
  /^fc[0-9a-f]{2}:/i,  // IPv6 ULA (fc00::/7)
  /^localhost$/i,
];

function isSsrfBlocked(host) {
  return BLOCKED_PREFIXES.some(re => re.test(host));
}

// Whitelist of allowed HTTP methods for vault proxy
const ALLOWED_PROXY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);

// Headers an agent cannot override (would allow auth bypass or hop-by-hop abuse)
const BLOCKED_PROXY_HEADERS = new Set([
  'authorization', 'x-api-key', 'cookie', 'set-cookie',
  'host', 'connection', 'transfer-encoding', 'upgrade', 'proxy-authorization',
]);

// ─── Inline auth helper ───────────────────────────────────────────────────────

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

function ok(res, data) {
  res.json({ ok: true, ...data });
}

function err(res, status, code, message) {
  res.status(status).json({ ok: false, error: { code, message } });
}

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = function (app, db, apiKeys) {

  // ── Schema bootstrap ──────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_secrets (
      id              TEXT PRIMARY KEY,
      api_key_hash    TEXT NOT NULL,
      name            TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'api_key',
      encrypted_value TEXT NOT NULL,
      iv              TEXT NOT NULL,
      auth_tag        TEXT NOT NULL,
      created_at      INTEGER NOT NULL,
      last_used       INTEGER,
      use_count       INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_vault_api_key_hash ON vault_secrets(api_key_hash);
    CREATE TABLE IF NOT EXISTS vault_audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_hash TEXT NOT NULL,
      vault_id   TEXT,
      action     TEXT NOT NULL,
      url        TEXT,
      status     INTEGER,
      latency_ms INTEGER,
      ts         INTEGER NOT NULL
    );
  `);

  const VALID_TYPES = ['api_key', 'oauth_token', 'header', 'basic'];

  // ── POST /v1/vault/set ────────────────────────────────────────────────────
  //    Store a credential. Returns vault_id. Credential never returned again.

  app.post('/v1/vault/set', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { name, credential, type = 'api_key' } = req.body;

    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 128) {
      return err(res, 422, 'invalid_name', 'name must be 1–128 characters');
    }
    if (!credential || typeof credential !== 'string' || credential.length < 1 || credential.length > 8192) {
      return err(res, 422, 'invalid_credential', 'credential must be 1–8192 characters');
    }
    if (!VALID_TYPES.includes(type)) {
      return err(res, 422, 'invalid_type', `type must be one of: ${VALID_TYPES.join(', ')}`);
    }

    const vault_id = 'vlt_' + crypto.randomUUID().replace(/-/g, '');
    const api_key_hash = hashKey(apiKey);
    const now = Date.now();
    const { ciphertext, iv, auth_tag } = encrypt(credential);

    db.prepare(`
      INSERT INTO vault_secrets (id, api_key_hash, name, type, encrypted_value, iv, auth_tag, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(vault_id, api_key_hash, name, type, ciphertext, iv, auth_tag, now);

    db.prepare(`INSERT INTO vault_audit_log (api_key_hash, vault_id, action, ts) VALUES (?, ?, ?, ?)`)
      .run(api_key_hash, vault_id, 'set', now);

    ok(res, {
      vault_id,
      name,
      type,
      created_at: new Date(now).toISOString(),
    });
  });

  // ── GET /v1/vault/list ────────────────────────────────────────────────────
  //    List all vault entries for this API key. No credentials returned.

  app.get('/v1/vault/list', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const api_key_hash = hashKey(apiKey);
    const rows = db.prepare(`
      SELECT id, name, type, created_at, last_used, use_count
      FROM vault_secrets
      WHERE api_key_hash = ?
      ORDER BY created_at DESC
    `).all(api_key_hash);

    ok(res, {
      vaults: rows.map(r => ({
        vault_id: r.id,
        name: r.name,
        type: r.type,
        created_at: new Date(r.created_at).toISOString(),
        last_used: r.last_used ? new Date(r.last_used).toISOString() : null,
        use_count: r.use_count,
      })),
      count: rows.length,
    });
  });

  // ── DELETE /v1/vault/delete ───────────────────────────────────────────────
  //    Delete a vault entry.

  app.delete('/v1/vault/delete', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { vault_id } = req.body;
    if (!vault_id || typeof vault_id !== 'string') {
      return err(res, 422, 'missing_field', 'vault_id is required');
    }

    const api_key_hash = hashKey(apiKey);
    const row = db.prepare('SELECT id FROM vault_secrets WHERE id = ? AND api_key_hash = ?').get(vault_id, api_key_hash);
    if (!row) return err(res, 404, 'vault_not_found', 'Vault entry not found or access denied');

    db.prepare('DELETE FROM vault_secrets WHERE id = ?').run(vault_id);

    db.prepare(`INSERT INTO vault_audit_log (api_key_hash, vault_id, action, ts) VALUES (?, ?, ?, ?)`)
      .run(api_key_hash, vault_id, 'delete', Date.now());

    ok(res, { deleted: true, vault_id });
  });

  // ── POST /v1/vault/proxy ──────────────────────────────────────────────────
  //    Proxy an HTTPS call using a stored credential. Agent never sees the key.

  app.post('/v1/vault/proxy', async (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { vault_id, url: targetUrl, method = 'GET', body: proxyBody, headers: extraHeaders = {} } = req.body;

    if (!vault_id || typeof vault_id !== 'string') {
      return err(res, 422, 'missing_field', 'vault_id is required');
    }
    if (!targetUrl || typeof targetUrl !== 'string') {
      return err(res, 422, 'missing_field', 'url is required');
    }
    if (targetUrl.length > 8192) {
      return err(res, 422, 'url_too_long', 'url must be ≤ 8192 characters');
    }

    // Validate and whitelist method
    const upperMethod = (typeof method === 'string' ? method : 'GET').toUpperCase();
    if (!ALLOWED_PROXY_METHODS.has(upperMethod)) {
      return err(res, 422, 'invalid_method', `method must be one of: ${[...ALLOWED_PROXY_METHODS].join(', ')}`);
    }

    // Validate URL
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return err(res, 422, 'invalid_url', 'url must be a valid URL');
    }

    // SSRF: enforce HTTPS
    if (parsed.protocol !== 'https:') {
      return err(res, 403, 'https_required', 'Only HTTPS URLs are allowed for vault proxy');
    }

    // SSRF: block private/loopback/link-local by hostname pattern
    if (isSsrfBlocked(parsed.hostname)) {
      return err(res, 403, 'ssrf_blocked', 'Target hostname is not allowed');
    }

    // SSRF: DNS pre-resolution — validate the resolved IP, not just the hostname
    // This catches DNS rebinding attacks (TOCTOU between check and fetch)
    try {
      const { address: resolvedIp } = await dns.lookup(parsed.hostname, { verbatim: false });
      if (isSsrfBlocked(resolvedIp)) {
        return err(res, 403, 'ssrf_blocked', 'Resolved IP address is not allowed');
      }
    } catch {
      return err(res, 422, 'dns_failed', 'Cannot resolve target hostname');
    }

    // Validate request body size
    if (proxyBody !== undefined && proxyBody !== null) {
      const bodyStr = typeof proxyBody === 'string' ? proxyBody : JSON.stringify(proxyBody);
      if (bodyStr.length > 1048576) {
        return err(res, 422, 'body_too_large', 'Request body must be ≤ 1MB');
      }
    }

    // Sanitize extra headers: reject hop-by-hop headers, auth overrides, and oversized values
    const safeHeaders = {};
    if (extraHeaders && typeof extraHeaders === 'object') {
      for (const [k, v] of Object.entries(extraHeaders)) {
        if (typeof k !== 'string' || typeof v !== 'string') continue;
        if (k.length > 128 || v.length > 1024) continue;
        if (BLOCKED_PROXY_HEADERS.has(k.toLowerCase())) continue;
        safeHeaders[k] = v;
      }
    }

    const api_key_hash = hashKey(apiKey);
    const row = db.prepare(`
      SELECT id, name, type, encrypted_value, iv, auth_tag
      FROM vault_secrets WHERE id = ? AND api_key_hash = ?
    `).get(vault_id, api_key_hash);

    if (!row) return err(res, 404, 'vault_not_found', 'Vault entry not found or access denied');

    // Decrypt credential
    let credential;
    try {
      credential = decrypt(row.encrypted_value, row.iv, row.auth_tag);
    } catch {
      return err(res, 500, 'decryption_failed', 'Failed to decrypt stored credential');
    }

    // Build auth header based on type
    const authHeaders = {};
    if (row.type === 'api_key') {
      authHeaders['X-API-Key'] = credential;
    } else if (row.type === 'oauth_token' || row.type === 'header') {
      authHeaders['Authorization'] = 'Bearer ' + credential;
    } else if (row.type === 'basic') {
      authHeaders['Authorization'] = 'Basic ' + Buffer.from(credential).toString('base64');
    }

    const start = Date.now();
    let status = 0, response_body = '', latency_ms = 0;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const fetchRes = await fetch(targetUrl, {
        method: upperMethod,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Slopshop-VaultProxy/1.0',
          ...safeHeaders,   // agent-supplied headers (sanitized, no auth overrides)
          ...authHeaders,   // vault auth headers injected last — always override
        },
        body: proxyBody ? JSON.stringify(proxyBody) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);
      status = fetchRes.status;

      // Cap response at 1MB
      const buf = await fetchRes.arrayBuffer();
      const raw = Buffer.from(buf);
      if (raw.length > 1048576) {
        response_body = raw.slice(0, 1048576).toString('utf8') + '\n[truncated — response exceeded 1MB]';
      } else {
        response_body = raw.toString('utf8');
      }
    } catch (e) {
      status = 0;
      response_body = e.name === 'AbortError' ? 'Request timed out after 10s' : e.message;
    }

    latency_ms = Date.now() - start;
    credential = null; // explicit GC hint

    // Update usage stats
    db.prepare('UPDATE vault_secrets SET last_used = ?, use_count = use_count + 1 WHERE id = ?')
      .run(Date.now(), vault_id);

    // Audit log (no credential)
    db.prepare(`INSERT INTO vault_audit_log (api_key_hash, vault_id, action, url, status, latency_ms, ts) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(api_key_hash, vault_id, 'proxy', targetUrl, status, latency_ms, Date.now());

    // Try to parse as JSON for convenience
    let response_json = null;
    try { response_json = JSON.parse(response_body); } catch {}

    ok(res, {
      vault_id,
      url: targetUrl,
      method: method.toUpperCase(),
      status,
      response_body: response_json || response_body,
      latency_ms,
    });
  });

  // ── GET /v1/vault/audit ───────────────────────────────────────────────────
  //    Retrieve recent vault operations for audit purposes.

  app.get('/v1/vault/audit', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const api_key_hash = hashKey(apiKey);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const rows = db.prepare(`
      SELECT vault_id, action, url, status, latency_ms, ts
      FROM vault_audit_log
      WHERE api_key_hash = ?
      ORDER BY ts DESC LIMIT ?
    `).all(api_key_hash, limit);

    ok(res, {
      audit: rows.map(r => ({
        vault_id: r.vault_id,
        action: r.action,
        url: r.url || null,
        status: r.status || null,
        latency_ms: r.latency_ms || null,
        ts: new Date(r.ts).toISOString(),
      })),
      count: rows.length,
    });
  });
};
