/**
 * Slopshop Node.js SDK - The API bazaar for lobsters.
 *
 *   npm install slopshop
 *
 * Usage:
 *   import { Slop } from 'slopshop';
 *   const s = new Slop(); // reads SLOPSHOP_KEY from env
 *   const result = await s.call('lead-scoring-ai', { company: 'Acme' });
 *   console.log(result.data);
 */

class SlopError extends Error {
  constructor(code, message, status) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.status = status;
  }
}

class SlopResult {
  constructor(raw) {
    this._raw = raw;
    this.data = raw.data || {};
    this.meta = raw.meta || {};
    this.creditsUsed = this.meta.credits_used || 0;
    this.creditsRemaining = this.meta.credits_remaining;
    this.requestId = this.meta.request_id;
  }
}

class Slop {
  constructor(key, { baseUrl } = {}) {
    this.key = key || process.env.SLOPSHOP_KEY;
    if (!this.key) throw new SlopError('no_key', 'Set SLOPSHOP_KEY env var or pass key to new Slop(key)');
    this.base = (baseUrl || process.env.SLOPSHOP_BASE || 'https://api.slopshop.gg').replace(/\/$/, '');
  }

  async _req(method, path, body, auth = true) {
    const url = `${this.base}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers['Authorization'] = `Bearer ${this.key}`;

    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = data.error || {};
      throw new SlopError(err.code || 'http_error', err.message || resp.statusText, resp.status);
    }
    return data;
  }

  /** Call any API by slug */
  async call(api, input = {}) {
    return new SlopResult(await this._req('POST', `/v1/${api}`, input));
  }

  /** Batch call multiple APIs: [{api, input}, ...] */
  async batch(calls) {
    return this._req('POST', '/v1/batch', { calls });
  }

  /** Async fire-and-forget for complex APIs */
  async asyncCall(api, input = {}) {
    return this._req('POST', `/v1/async/${api}`, input);
  }

  /** Check async job status */
  async job(jobId) {
    return this._req('GET', `/v1/jobs/${jobId}`);
  }

  /** Semantic search: describe what you need */
  async resolve(query) {
    return this._req('POST', '/v1/resolve', { query }, false);
  }

  /** Get tool manifest */
  async tools({ format = 'native', category, limit = 100, offset = 0 } = {}) {
    let q = `?format=${format}&limit=${limit}&offset=${offset}`;
    if (category) q += `&category=${encodeURIComponent(category)}`;
    return this._req('GET', `/v1/tools${q}`, null, false);
  }

  /** Check balance */
  async balance() {
    return this._req('GET', '/v1/credits/balance');
  }

  /** Buy credits */
  async buyCredits(amount, paymentMethod) {
    return this._req('POST', '/v1/credits/buy', { amount, payment_method: paymentMethod });
  }

  /** Transfer credits */
  async transfer(toKey, amount) {
    return this._req('POST', '/v1/credits/transfer', { to_key: toKey, amount });
  }

  /** Turing-complete pipeline */
  async pipe(steps, { until, maxIterations = 1 } = {}) {
    return this._req('POST', '/v1/pipe', { steps, until, max_iterations: maxIterations });
  }

  /** Get persistent state */
  async stateGet(key) { return this._req('GET', `/v1/state/${key}`); }
  /** Set persistent state */
  async stateSet(key, value) { return this._req('PUT', `/v1/state/${key}`, { value }); }
  /** Delete persistent state */
  async stateDel(key) { return this._req('DELETE', `/v1/state/${key}`); }

  /** Health check (no auth) */
  async health() { return this._req('GET', '/v1/health', null, false); }
}

module.exports = { Slop, SlopResult, SlopError };
