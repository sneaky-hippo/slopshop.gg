'use strict';

/**
 * Slopshop Node.js SDK
 * @example
 * const { Slopshop } = require('slopshop/sdk/node');
 * const slop = new Slopshop('sk-slop-your-key');
 * const result = await slop.call('crypto-hash-sha256', { text: 'hello' });
 */

const http = require('http');
const https = require('https');

class Slopshop {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl || 'https://slopshop.gg').replace(/\/$/, '');
    this.timeout = options.timeout || 30000;
  }

  async _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const mod = url.protocol === 'https:' ? https : http;
      const payload = body ? JSON.stringify(body) : null;

      const opts = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.apiKey,
          'User-Agent': 'slopshop-sdk-node/3.2.0',
        },
        timeout: this.timeout,
      };
      if (payload) opts.headers['Content-Length'] = Buffer.byteLength(payload);

      const req = mod.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) reject(new SlopshopError(parsed.error?.message || 'API error', res.statusCode, parsed));
            else resolve({ data: parsed, status: res.statusCode, headers: res.headers });
          } catch(e) { reject(new SlopshopError('Invalid response', res.statusCode)); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new SlopshopError('Timeout', 408)); });
      if (payload) req.write(payload);
      req.end();
    });
  }

  // Core API call
  async call(slug, input = {}) {
    const res = await this._request('POST', '/v1/' + slug, input);
    return res.data;
  }

  // Batch calls
  async batch(calls) {
    const res = await this._request('POST', '/v1/batch', { calls });
    return res.data;
  }

  // Agent run
  async agent(task, options = {}) {
    const res = await this._request('POST', '/v1/agent/run', { task, ...options });
    return res.data;
  }

  // Memory
  async memorySet(key, value, options = {}) {
    return this.call('memory-set', { key, value, ...options });
  }
  async memoryGet(key, options = {}) {
    return this.call('memory-get', { key, ...options });
  }
  async memorySearch(query, options = {}) {
    return this.call('memory-search', { query, ...options });
  }
  async memoryList(options = {}) {
    return this.call('memory-list', options);
  }

  // Auth
  async me() {
    const res = await this._request('GET', '/v1/auth/me');
    return res.data;
  }
  async balance() {
    const res = await this._request('GET', '/v1/credits/balance');
    return res.data;
  }

  // Discovery
  async search(query, options = {}) {
    const res = await this._request('POST', '/v1/tools/search', { query, ...options });
    return res.data;
  }
  async categories() {
    const res = await this._request('GET', '/v1/tools/categories');
    return res.data;
  }
  async recommend(task) {
    const res = await this._request('POST', '/v1/tools/recommend', { task });
    return res.data;
  }

  // Hive
  async hiveCreate(name, options = {}) {
    const res = await this._request('POST', '/v1/hive/create', { name, ...options });
    return res.data;
  }
  async hiveSend(hiveId, message, channel = 'general') {
    const res = await this._request('POST', '/v1/hive/' + hiveId + '/send', { message, channel });
    return res.data;
  }

  // Stream (returns raw response for SSE)
  async stream(slug, input = {}) {
    return this._request('POST', '/v1/stream/' + slug, input);
  }

  // Dry run
  async dryRun(slug, input = {}) {
    const res = await this._request('POST', '/v1/dry-run/' + slug, input);
    return res.data;
  }

  // Health
  async health() {
    const res = await this._request('GET', '/v1/health');
    return res.data;
  }

  // Stats
  async stats() {
    const res = await this._request('GET', '/v1/stats');
    return res.data;
  }

  // Ollama (local LLM — 0 credits)
  async ollamaModels() {
    const res = await this._request('GET', '/v1/models/ollama');
    return res.data;
  }
  async ollamaGenerate(model, prompt, options = {}) {
    return this.call('models/ollama/generate', { model, prompt, ...options });
  }
  async ollamaEmbed(model, prompt, options = {}) {
    return this.call('models/ollama/embeddings', { model, prompt, ...options });
  }

  // vLLM (local inference — 0 credits)
  async vllmGenerate(model, prompt, options = {}) {
    return this.call('models/vllm/generate', { model, prompt, ...options });
  }

  // Wallet + Economy
  async walletCreate(name, options = {}) {
    return this.call('wallet/create', { name, ...options });
  }
  async walletTransfer(fromWallet, toWallet, amount) {
    return this.call('wallet/transfer', { from_wallet: fromWallet, to_wallet: toWallet, amount });
  }

  // Knowledge Graph
  async knowledgeAdd(subject, predicate, object, options = {}) {
    return this.call('knowledge/add', { subject, predicate, object, ...options });
  }
  async knowledgeQuery(query, options = {}) {
    return this.call('knowledge/query', { query, ...options });
  }

  // Army (parallel agents)
  async armyDeploy(task, agents = 10, options = {}) {
    return this.call('army/deploy', { task, agents, ...options });
  }

  // Chain
  async chainCreate(name, steps, options = {}) {
    return this.call('chain/create', { name, steps, ...options });
  }
  async chainRun(chainId, options = {}) {
    return this.call('chain/run', { chain_id: chainId, ...options });
  }
}

class SlopshopError extends Error {
  constructor(message, statusCode, body) {
    super(message);
    this.name = 'SlopshopError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

// Static factory
Slopshop.create = (apiKey, options) => new Slopshop(apiKey, options);

module.exports = { Slopshop, SlopshopError };
