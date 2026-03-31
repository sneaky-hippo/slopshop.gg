'use strict';

/**
 * @fileoverview Slopshop Memory SDK — Node.js
 *
 * Full SDK for the 9 Slopshop memory techniques:
 *   1. Persistent Memory    (/v1/memory/*)
 *   2. Dream Engine         (/v1/memory/dream/*)
 *   3. Multiplayer Memory   (/v1/memory/share/*, /v1/memory/collaborator/*)
 *   4. Snapshot Branching   (/v1/memory/snapshot, /v1/memory/restore/:id, /v1/memory/merge)
 *   5. Bayesian Calibration (/v1/memory/bayesian/*)
 *   6. Episodic Chains      (/v1/memory/chain/*)
 *   7. Memory Triggers      (/v1/memory/trigger/*)
 *   8. Procedural Memory    (/v1/memory/procedure/*)
 *   9. Swarm Orchestration  (/v1/swarm/*)
 *
 * Works in CommonJS and ESM environments.
 *
 * @example <caption>CommonJS</caption>
 * const { SlopshopMemory } = require('slopshop-memory');
 * const mem = new SlopshopMemory({ apiKey: 'sk-slop-your-key' });
 * await mem.memory.store('goal', 'ship it');
 *
 * @example <caption>ESM</caption>
 * import { SlopshopMemory } from 'slopshop-memory';
 * const mem = new SlopshopMemory({ apiKey: 'sk-slop-your-key' });
 * const job = await mem.dream.start({ namespace: 'default', strategy: 'consolidate' });
 */

const http = require('http');
const https = require('https');

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Thrown when the Slopshop API returns an error response.
 *
 * @class SlopshopError
 * @extends Error
 * @property {number|null} statusCode - HTTP status code.
 * @property {object|null} body - Full parsed response body.
 *
 * @example
 * try {
 *   await mem.memory.retrieve('missing-key');
 * } catch (err) {
 *   if (err instanceof SlopshopError && err.statusCode === 404) {
 *     console.log('Key not found');
 *   }
 * }
 */
class SlopshopError extends Error {
  /**
   * @param {string} message - Human-readable error message.
   * @param {number|null} [statusCode=null] - HTTP status code.
   * @param {object|null} [body=null] - Parsed response body.
   */
  constructor(message, statusCode = null, body = null) {
    super(message);
    this.name = 'SlopshopError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Internal HTTP helper
// ---------------------------------------------------------------------------

/**
 * Make an HTTP/HTTPS request and return the parsed JSON response.
 *
 * @param {object} opts
 * @param {string} opts.method - HTTP method.
 * @param {string} opts.url - Full request URL.
 * @param {object} opts.headers - Request headers.
 * @param {object|null} [opts.body=null] - JSON request body.
 * @param {number} [opts.timeout=30000] - Timeout in milliseconds.
 * @returns {Promise<object>} Parsed response JSON.
 * @throws {SlopshopError}
 */
function _httpRequest({ method, url, headers, body = null, timeout = 30000 }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: reqHeaders,
      timeout,
    };

    const req = mod.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data;
        try {
          data = JSON.parse(raw);
        } catch (_) {
          data = {};
        }
        if (res.statusCode >= 400) {
          const msg =
            data?.error?.message ||
            data?.message ||
            res.statusMessage ||
            'API error';
          return reject(new SlopshopError(msg, res.statusCode, data));
        }
        resolve(data);
      });
    });

    req.on('error', (err) => reject(new SlopshopError(`Connection error: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new SlopshopError(`Request timed out after ${timeout}ms`, 408));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Method group base
// ---------------------------------------------------------------------------

/**
 * @private
 * Base class for nested method groups. Delegates HTTP calls to the parent client.
 */
class _MethodGroup {
  /** @param {SlopshopMemory} client */
  constructor(client) {
    this._client = client;
  }

  _post(path, body) {
    return this._client._request('POST', path, body);
  }

  _get(path) {
    return this._client._request('GET', path);
  }
}

// ---------------------------------------------------------------------------
// 1. Persistent Memory
// ---------------------------------------------------------------------------

/**
 * Persistent Memory methods (/v1/memory/*).
 * Access via `mem.memory`.
 */
class PersistentMemory extends _MethodGroup {
  /**
   * Store a value under a key in a namespace.
   *
   * @param {string} key - Unique memory key.
   * @param {*} value - Any JSON-serialisable value.
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @param {string[]} [options.tags] - Optional tags for filtering.
   * @param {number} [options.ttl] - Time-to-live in seconds.
   * @returns {Promise<object>} Response with `id` and `created_at`.
   *
   * @example
   * await mem.memory.store('user:name', 'Alice', { namespace: 'profile' });
   */
  store(key, value, { namespace = 'default', tags, ttl } = {}) {
    const body = { key, value, namespace };
    if (tags !== undefined) body.tags = tags;
    if (ttl !== undefined) body.ttl = ttl;
    return this._post('/v1/memory/store', body);
  }

  /**
   * Retrieve a stored memory by key.
   *
   * @param {string} key - Memory key.
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @returns {Promise<object>} Response with `key`, `value`, and metadata.
   *
   * @example
   * const result = await mem.memory.retrieve('user:name');
   * console.log(result.value); // 'Alice'
   */
  retrieve(key, { namespace = 'default' } = {}) {
    return this._post('/v1/memory/retrieve', { key, namespace });
  }

  /**
   * Delete a memory by key.
   *
   * @param {string} key - Memory key to delete.
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @returns {Promise<object>} Confirmation with `deleted: true`.
   */
  delete(key, { namespace = 'default' } = {}) {
    return this._post('/v1/memory/delete', { key, namespace });
  }

  /**
   * List all memories in a namespace with pagination.
   *
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @param {number} [options.limit=50] - Max results.
   * @param {number} [options.offset=0] - Pagination offset.
   * @param {string[]} [options.tags] - Filter by tags.
   * @returns {Promise<object>} Response with `items` array and `total` count.
   */
  list({ namespace = 'default', limit = 50, offset = 0, tags } = {}) {
    const body = { namespace, limit, offset };
    if (tags !== undefined) body.tags = tags;
    return this._post('/v1/memory/list', body);
  }

  /**
   * Semantic search over stored memories.
   *
   * @param {string} query - Natural-language search query.
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @param {number} [options.topK=10] - Number of results.
   * @returns {Promise<object>} Response with `results` ranked by similarity.
   *
   * @example
   * const { results } = await mem.memory.search('user preferences');
   */
  search(query, { namespace = 'default', topK = 10 } = {}) {
    return this._post('/v1/memory/search', { query, namespace, top_k: topK });
  }
}

// ---------------------------------------------------------------------------
// 2. Dream Engine
// ---------------------------------------------------------------------------

/**
 * Dream Engine methods for REM-style memory synthesis.
 * Access via `mem.dream`.
 */
class DreamEngine extends _MethodGroup {
  /**
   * Start an asynchronous dream synthesis job.
   *
   * The Dream Engine consolidates memories in a namespace: synthesises
   * patterns, prunes duplicates, and writes compressed insights back.
   *
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Namespace to synthesise.
   * @param {string} [options.strategy='consolidate'] - One of `'consolidate'`,
   *   `'compress'`, `'evolve'`, or `'prune'`.
   * @param {string} [options.model] - Optional model override.
   * @returns {Promise<object>} Response with `dream_id` and `status: 'queued'`.
   *
   * @example
   * const job = await mem.dream.start({ strategy: 'consolidate' });
   * console.log(job.dream_id);
   */
  start({ namespace = 'default', strategy = 'consolidate', model } = {}) {
    const body = { namespace, strategy };
    if (model !== undefined) body.model = model;
    return this._post('/v1/memory/dream/start', body);
  }

  /**
   * Poll the status of a dream job.
   *
   * @param {string} dreamId - Dream job ID from `start()`.
   * @returns {Promise<object>} Response with `status` (`'queued'`, `'running'`,
   *   `'complete'`, or `'failed'`), `progress`, and on completion `summary`.
   *
   * @example
   * const status = await mem.dream.status(job.dream_id);
   * if (status.status === 'complete') console.log(status.summary);
   */
  status(dreamId) {
    return this._get(`/v1/memory/dream/status/${dreamId}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Multiplayer Memory
// ---------------------------------------------------------------------------

/**
 * Multiplayer Memory methods for shared team memory spaces.
 * Access via `mem.multiplayer`.
 */
class MultiplayerMemory extends _MethodGroup {
  /**
   * Create a shareable memory space from an existing namespace.
   *
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Source namespace to share.
   * @param {string} [options.name] - Human-readable name for the shared space.
   * @param {string} [options.permissions='read-write'] - Default collaborator
   *   permissions: `'read-only'`, `'read-write'`, or `'admin'`.
   * @returns {Promise<object>} Response with `share_id` and `invite_url`.
   *
   * @example
   * const share = await mem.multiplayer.createShare({ name: 'Team Alpha' });
   * console.log(share.invite_url);
   */
  createShare({ namespace = 'default', name, permissions = 'read-write' } = {}) {
    const body = { namespace, permissions };
    if (name !== undefined) body.name = name;
    return this._post('/v1/memory/share/create', body);
  }

  /**
   * Invite a collaborator (human or agent) to a shared memory space.
   *
   * @param {string} shareId - Shared space ID from `createShare()`.
   * @param {object} [options={}]
   * @param {string} [options.email] - Email for human collaborator.
   * @param {string} [options.agentId] - Agent identity ID for AI-to-AI sharing.
   * @param {string} [options.permissions='read-write'] - Permission level.
   * @returns {Promise<object>} Response with `invite_id` and `status: 'invited'`.
   *
   * @example
   * await mem.multiplayer.inviteCollaborator(share.share_id, {
   *   email: 'alice@example.com',
   * });
   */
  inviteCollaborator(shareId, { email, agentId, permissions = 'read-write' } = {}) {
    const body = { share_id: shareId, permissions };
    if (email !== undefined) body.email = email;
    if (agentId !== undefined) body.agent_id = agentId;
    return this._post('/v1/memory/collaborator/invite', body);
  }

  /**
   * List collaborators in a shared memory space.
   *
   * @param {string} shareId - Shared space ID.
   * @returns {Promise<object>} Response with `collaborators` array.
   */
  listCollaborators(shareId) {
    return this._post('/v1/memory/collaborator/list', { share_id: shareId });
  }

  /**
   * Leave a shared memory space.
   *
   * @param {string} shareId - Shared space ID to leave.
   * @returns {Promise<object>} Confirmation response.
   */
  leave(shareId) {
    return this._post('/v1/memory/share/leave', { share_id: shareId });
  }
}

// ---------------------------------------------------------------------------
// 4. Snapshot Branching
// ---------------------------------------------------------------------------

/**
 * Snapshot Branching methods for versioning memory namespaces.
 * Access via `mem.snapshot`.
 */
class SnapshotBranching extends _MethodGroup {
  /**
   * Create a point-in-time snapshot of a namespace.
   *
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Namespace to snapshot.
   * @param {string} [options.label] - Human-readable snapshot label.
   * @returns {Promise<object>} Response with `snapshot_id` and `created_at`.
   *
   * @example
   * const snap = await mem.snapshot.create({ label: 'before-experiment' });
   */
  create({ namespace = 'default', label } = {}) {
    const body = { namespace };
    if (label !== undefined) body.label = label;
    return this._post('/v1/memory/snapshot', body);
  }

  /**
   * Restore a namespace from a snapshot.
   *
   * @param {string} snapshotId - Snapshot ID to restore.
   * @param {object} [options={}]
   * @param {string} [options.targetNamespace] - Namespace to restore into.
   *   Defaults to the original namespace.
   * @returns {Promise<object>} Response with `restored_namespace` and `memories_restored`.
   *
   * @example
   * await mem.snapshot.restore(snap.snapshot_id);
   */
  restore(snapshotId, { targetNamespace } = {}) {
    const body = { snapshot_id: snapshotId };
    if (targetNamespace !== undefined) body.target_namespace = targetNamespace;
    return this._post(`/v1/memory/restore/${snapshotId}`, body);
  }

  /**
   * Merge two namespaces together.
   *
   * @param {string} sourceNamespace - Namespace to merge from.
   * @param {string} targetNamespace - Namespace to merge into.
   * @param {object} [options={}]
   * @param {string} [options.strategy='union'] - Merge strategy: `'union'`,
   *   `'intersection'`, or `'source-wins'`.
   * @returns {Promise<object>} Response with `merged_count` and `conflicts_resolved`.
   */
  merge(sourceNamespace, targetNamespace, { strategy = 'union' } = {}) {
    return this._post('/v1/memory/merge', {
      source_namespace: sourceNamespace,
      target_namespace: targetNamespace,
      strategy,
    });
  }

  /**
   * List all snapshots for a namespace.
   *
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @returns {Promise<object>} Response with `snapshots` array (newest first).
   */
  list({ namespace = 'default' } = {}) {
    return this._post('/v1/memory/snapshot/list', { namespace });
  }
}

// ---------------------------------------------------------------------------
// 5. Bayesian Calibration
// ---------------------------------------------------------------------------

/**
 * Bayesian Calibration methods for confidence-weighted memory updates.
 * Access via `mem.bayesian`.
 */
class BayesianCalibration extends _MethodGroup {
  /**
   * Update a memory's confidence score using Bayesian inference.
   *
   * @param {string} key - Memory key to update.
   * @param {string|object} evidence - New evidence to incorporate.
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @param {number} [options.likelihood] - P(evidence | hypothesis), 0.0–1.0.
   * @param {number} [options.prior] - Prior probability override, 0.0–1.0.
   * @returns {Promise<object>} Response with `prior`, `likelihood`, `posterior`,
   *   and the updated `memory` object.
   *
   * @example
   * const result = await mem.bayesian.update('user:trust', 'completed 5 tasks');
   * console.log(result.posterior); // e.g. 0.87
   */
  update(key, evidence, { namespace = 'default', likelihood, prior } = {}) {
    const body = { key, evidence, namespace };
    if (likelihood !== undefined) body.likelihood = likelihood;
    if (prior !== undefined) body.prior = prior;
    return this._post('/v1/memory/bayesian/update', body);
  }

  /**
   * Get the current Bayesian confidence score for a memory key.
   *
   * @param {string} key - Memory key.
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @returns {Promise<object>} Response with `key`, `confidence`, and `evidence_count`.
   */
  queryConfidence(key, { namespace = 'default' } = {}) {
    return this._post('/v1/memory/bayesian/confidence', { key, namespace });
  }
}

// ---------------------------------------------------------------------------
// 6. Episodic Chains
// ---------------------------------------------------------------------------

/**
 * Episodic Chain methods for linked, time-ordered memory episodes.
 * Access via `mem.chain`.
 */
class EpisodicChains extends _MethodGroup {
  /**
   * Create a new episodic chain from a sequence of events.
   *
   * @param {string} title - Chain title.
   * @param {object[]} entries - Ordered episode entries. Each entry needs at
   *   least a `content` field. Optional: `timestamp`, `role`, `tags`.
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @param {object} [options.metadata] - Chain-level metadata.
   * @returns {Promise<object>} Response with `chain_id`, `length`, `created_at`.
   *
   * @example
   * const chain = await mem.chain.create('User Onboarding', [
   *   { content: 'Signed up', role: 'system' },
   *   { content: 'First memory stored', role: 'system' },
   * ]);
   */
  create(title, entries, { namespace = 'default', metadata } = {}) {
    const body = { title, entries, namespace };
    if (metadata !== undefined) body.metadata = metadata;
    return this._post('/v1/memory/chain', body);
  }

  /**
   * Append a new episode to an existing chain.
   *
   * @param {string} chainId - Chain ID to extend.
   * @param {object} entry - Episode entry with at least a `content` field.
   * @returns {Promise<object>} Response with updated `chain_id` and `length`.
   */
  append(chainId, entry) {
    return this._post('/v1/memory/chain/append', { chain_id: chainId, entry });
  }

  /**
   * Retrieve all episodes in a chain.
   *
   * @param {string} chainId - Chain ID.
   * @param {object} [options={}]
   * @param {number} [options.limit=100] - Max episodes to return.
   * @returns {Promise<object>} Response with `chain_id`, `title`, `entries`.
   */
  get(chainId, { limit = 100 } = {}) {
    return this._post('/v1/memory/chain/get', { chain_id: chainId, limit });
  }

  /**
   * Replay an episodic chain from a given index position.
   *
   * @param {string} chainId - Chain ID to replay.
   * @param {object} [options={}]
   * @param {number} [options.fromIndex=0] - Start replay from this episode index.
   * @returns {Promise<object>} Response with `entries` and a generated `narrative`.
   */
  replay(chainId, { fromIndex = 0 } = {}) {
    return this._post('/v1/memory/chain/replay', { chain_id: chainId, from_index: fromIndex });
  }
}

// ---------------------------------------------------------------------------
// 7. Memory Triggers
// ---------------------------------------------------------------------------

/**
 * Memory Trigger methods for event-driven memory callbacks.
 * Access via `mem.trigger`.
 */
class MemoryTriggers extends _MethodGroup {
  /**
   * Register an event-driven trigger on the memory system.
   *
   * @param {string} event - Event type: `'memory.write'`, `'memory.delete'`,
   *   `'dream.complete'`, `'confidence.drop'`, `'chain.append'`.
   * @param {string|object} action - Webhook URL string or action config object
   *   with `type` and configuration fields.
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Namespace to watch.
   * @param {object} [options.condition] - Filter expression, e.g.
   *   `{ key_pattern: 'user:*', confidence_below: 0.5 }`.
   * @param {object} [options.payload] - Extra data to attach to invocations.
   * @returns {Promise<object>} Response with `trigger_id` and `status: 'active'`.
   *
   * @example
   * await mem.trigger.create('memory.write', 'https://hooks.example.com/notify', {
   *   condition: { key_pattern: 'agent:*' },
   * });
   */
  create(event, action, { namespace = 'default', condition, payload } = {}) {
    const body = { event, action, namespace };
    if (condition !== undefined) body.condition = condition;
    if (payload !== undefined) body.payload = payload;
    return this._post('/v1/memory/trigger', body);
  }

  /**
   * List all triggers on a namespace.
   *
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @returns {Promise<object>} Response with `triggers` array.
   */
  list({ namespace = 'default' } = {}) {
    return this._post('/v1/memory/trigger/list', { namespace });
  }

  /**
   * Delete a registered trigger.
   *
   * @param {string} triggerId - Trigger ID to remove.
   * @returns {Promise<object>} Confirmation with `deleted: true`.
   */
  delete(triggerId) {
    return this._post('/v1/memory/trigger/delete', { trigger_id: triggerId });
  }
}

// ---------------------------------------------------------------------------
// 8. Procedural Memory
// ---------------------------------------------------------------------------

/**
 * Procedural Memory methods for learned, reusable tool chains.
 * Access via `mem.procedure`.
 */
class ProceduralMemory extends _MethodGroup {
  /**
   * Teach the agent a new named procedure (reusable tool chain).
   *
   * @param {string} name - Unique procedure name (e.g. `'deploy-to-production'`).
   * @param {object[]} steps - Ordered steps. Each step: `{ tool, input, on_error? }`.
   * @param {object} [options={}]
   * @param {string} [options.description] - Human-readable description.
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @param {string[]} [options.tags] - Tags for discovery.
   * @returns {Promise<object>} Response with `procedure_id`, `name`, `step_count`.
   *
   * @example
   * const proc = await mem.procedure.learn('daily-report', [
   *   { tool: 'memory-list', input: { namespace: 'work' } },
   *   { tool: 'memory/dream/start', input: { strategy: 'compress' } },
   * ], { description: 'Compress work memories daily' });
   */
  learn(name, steps, { description, namespace = 'default', tags } = {}) {
    const body = { name, steps, namespace };
    if (description !== undefined) body.description = description;
    if (tags !== undefined) body.tags = tags;
    return this._post('/v1/memory/procedure/learn', body);
  }

  /**
   * Recall a stored procedure by name or ID.
   *
   * @param {object} [options={}]
   * @param {string} [options.name] - Procedure name.
   * @param {string} [options.procedureId] - Procedure ID.
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @returns {Promise<object>} Full `procedure` object with all steps.
   */
  recall({ name, procedureId, namespace = 'default' } = {}) {
    const body = { namespace };
    if (name !== undefined) body.name = name;
    if (procedureId !== undefined) body.procedure_id = procedureId;
    return this._post('/v1/memory/procedure/recall', body);
  }

  /**
   * Execute a stored procedure.
   *
   * @param {string} procedureId - Procedure ID to execute.
   * @param {object} [options={}]
   * @param {object} [options.input] - Runtime input values.
   * @param {boolean} [options.dryRun=false] - Validate steps without executing.
   * @returns {Promise<object>} Response with `run_id`, `status`, `results`.
   */
  run(procedureId, { input, dryRun = false } = {}) {
    const body = { procedure_id: procedureId, dry_run: dryRun };
    if (input !== undefined) body.input = input;
    return this._post('/v1/memory/procedure/run', body);
  }

  /**
   * List stored procedures in a namespace.
   *
   * @param {object} [options={}]
   * @param {string} [options.namespace='default'] - Memory namespace.
   * @param {string[]} [options.tags] - Filter by tags.
   * @returns {Promise<object>} Response with `procedures` array.
   */
  list({ namespace = 'default', tags } = {}) {
    const body = { namespace };
    if (tags !== undefined) body.tags = tags;
    return this._post('/v1/memory/procedure/list', body);
  }
}

// ---------------------------------------------------------------------------
// 9. Swarm Orchestration
// ---------------------------------------------------------------------------

/**
 * Swarm Orchestration methods for parallel agent armies.
 * Access via `mem.swarm`.
 */
class SwarmOrchestration extends _MethodGroup {
  /**
   * Orchestrate a swarm of agents to solve a task in parallel.
   *
   * @param {string} task - High-level task description.
   * @param {object} [options={}]
   * @param {number} [options.agents=10] - Number of parallel agents.
   * @param {string} [options.strategy='parallel'] - `'parallel'`, `'pipeline'`,
   *   or `'vote'`.
   * @param {string} [options.model] - Model override for worker agents.
   * @param {string} [options.memoryNamespace='default'] - Shared memory namespace.
   * @param {number} [options.timeout=300] - Swarm timeout in seconds.
   * @returns {Promise<object>} Response with `swarm_id`, `status`, `agent_ids`.
   *
   * @example
   * const swarm = await mem.swarm.orchestrate(
   *   'Research top 10 AI memory techniques',
   *   { agents: 5, strategy: 'parallel', memoryNamespace: 'research' }
   * );
   * console.log(swarm.swarm_id);
   */
  orchestrate(task, {
    agents = 10,
    strategy = 'parallel',
    model,
    memoryNamespace = 'default',
    timeout = 300,
  } = {}) {
    const body = { task, agents, strategy, memory_namespace: memoryNamespace, timeout };
    if (model !== undefined) body.model = model;
    return this._post('/v1/swarm/orchestrate', body);
  }

  /**
   * Check the status of a running swarm.
   *
   * @param {string} swarmId - Swarm ID from `orchestrate()`.
   * @returns {Promise<object>} Response with `status`, `completed_agents`,
   *   and on completion `result` and `synthesis`.
   */
  status(swarmId) {
    return this._get(`/v1/swarm/status/${swarmId}`);
  }

  /**
   * Stop a running swarm and collect partial results.
   *
   * @param {string} swarmId - Swarm ID to stop.
   * @returns {Promise<object>} Response with `stopped: true` and partial `results`.
   */
  stop(swarmId) {
    return this._post('/v1/swarm/stop', { swarm_id: swarmId });
  }
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

/**
 * Slopshop Memory SDK client.
 *
 * Provides access to all 9 memory techniques via typed method groups:
 * - `memory`      — Persistent key-value store
 * - `dream`       — Dream Engine (REM synthesis)
 * - `multiplayer` — Shared team memory spaces
 * - `snapshot`    — Snapshot branching & versioning
 * - `bayesian`    — Confidence-weighted Bayesian updates
 * - `chain`       — Episodic linked memory chains
 * - `trigger`     — Event-driven memory callbacks
 * - `procedure`   — Learned procedural tool chains
 * - `swarm`       — Swarm orchestration
 *
 * @class SlopshopMemory
 *
 * @param {object} options
 * @param {string} options.apiKey - Slopshop API key (`sk-slop-...`).
 * @param {string} [options.baseUrl='https://slopshop.gg'] - API base URL.
 * @param {number} [options.timeout=30000] - Request timeout in milliseconds.
 *
 * @example <caption>CommonJS — all 9 techniques</caption>
 * const { SlopshopMemory } = require('slopshop-memory');
 * const mem = new SlopshopMemory({ apiKey: 'sk-slop-your-key' });
 *
 * // 1. Persistent Memory
 * await mem.memory.store('goal', 'ship it', { namespace: 'work' });
 *
 * // 2. Dream Engine
 * const job = await mem.dream.start({ strategy: 'consolidate' });
 * const status = await mem.dream.status(job.dream_id);
 *
 * // 3. Multiplayer Memory
 * const share = await mem.multiplayer.createShare({ name: 'Team Alpha' });
 * await mem.multiplayer.inviteCollaborator(share.share_id, { email: 'bob@example.com' });
 *
 * // 4. Snapshot Branching
 * const snap = await mem.snapshot.create({ label: 'v1' });
 * await mem.snapshot.restore(snap.snapshot_id);
 *
 * // 5. Bayesian Calibration
 * const calibrated = await mem.bayesian.update('risk:high', 'incident resolved');
 * console.log(calibrated.posterior);
 *
 * // 6. Episodic Chains
 * const chain = await mem.chain.create('User Journey', [
 *   { content: 'Signed up' },
 *   { content: 'First query' },
 * ]);
 *
 * // 7. Memory Triggers
 * await mem.trigger.create('memory.write', 'https://hooks.example.com/alert');
 *
 * // 8. Procedural Memory
 * await mem.procedure.learn('daily-sync', [
 *   { tool: 'memory-list', input: {} },
 *   { tool: 'memory/dream/start', input: { strategy: 'compress' } },
 * ]);
 *
 * // 9. Swarm Orchestration
 * const swarm = await mem.swarm.orchestrate('Analyse Q1 data', { agents: 8 });
 */
class SlopshopMemory {
  constructor({ apiKey, baseUrl = 'https://slopshop.gg', timeout = 30000 } = {}) {
    if (!apiKey) throw new SlopshopError('apiKey is required');

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = timeout;

    /** @type {PersistentMemory} */
    this.memory = new PersistentMemory(this);
    /** @type {DreamEngine} */
    this.dream = new DreamEngine(this);
    /** @type {MultiplayerMemory} */
    this.multiplayer = new MultiplayerMemory(this);
    /** @type {SnapshotBranching} */
    this.snapshot = new SnapshotBranching(this);
    /** @type {BayesianCalibration} */
    this.bayesian = new BayesianCalibration(this);
    /** @type {EpisodicChains} */
    this.chain = new EpisodicChains(this);
    /** @type {MemoryTriggers} */
    this.trigger = new MemoryTriggers(this);
    /** @type {ProceduralMemory} */
    this.procedure = new ProceduralMemory(this);
    /** @type {SwarmOrchestration} */
    this.swarm = new SwarmOrchestration(this);
  }

  /**
   * Internal HTTP request dispatcher.
   *
   * @param {string} method - HTTP method.
   * @param {string} path - URL path (starts with `/`).
   * @param {object|null} [body=null] - JSON body.
   * @returns {Promise<object>} Parsed JSON response.
   * @throws {SlopshopError}
   */
  _request(method, path, body = null) {
    return _httpRequest({
      method,
      url: this.baseUrl + path,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'slopshop-memory-sdk-node/1.0.0',
      },
      body,
      timeout: this.timeout,
    });
  }

  /**
   * Check the Slopshop API health.
   *
   * @returns {Promise<object>} Response with `status: 'ok'` and server metadata.
   */
  health() {
    return this._request('GET', '/v1/health');
  }

  /**
   * Convenience shortcut: store a value in persistent memory.
   *
   * @param {string} key - Memory key.
   * @param {*} value - Value to store.
   * @param {object} [options={}] - Passed through to `memory.store`.
   * @returns {Promise<object>}
   */
  store(key, value, options = {}) {
    return this.memory.store(key, value, options);
  }

  /**
   * Convenience shortcut: retrieve a value from persistent memory.
   *
   * @param {string} key - Memory key.
   * @param {object} [options={}] - Passed through to `memory.retrieve`.
   * @returns {Promise<object>}
   */
  retrieve(key, options = {}) {
    return this.memory.retrieve(key, options);
  }

  /**
   * Static factory method.
   *
   * @param {object} options - Same as constructor.
   * @returns {SlopshopMemory}
   */
  static create(options) {
    return new SlopshopMemory(options);
  }
}

// ---------------------------------------------------------------------------
// Exports — supports CommonJS and ESM
// ---------------------------------------------------------------------------

module.exports = { SlopshopMemory, SlopshopError };
module.exports.default = SlopshopMemory;

// ESM named re-exports via module.exports allows:
//   import { SlopshopMemory } from 'slopshop-memory'
// when bundled with tools that handle CJS interop (webpack, esbuild, etc.)
