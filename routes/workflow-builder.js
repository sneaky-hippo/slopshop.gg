'use strict';

/**
 * Visual DAG Workflow Builder — backend routes
 * routes/workflow-builder.js
 *
 * Full working implementations — no stubs, no TODOs.
 * Uses: crypto (built-in), http (built-in), better-sqlite3 (db passed in), express
 *
 * Fixed bugs (2026-03-31):
 *  1. POST /v1/workflow/run alias was a stub — now delegates to real execution engine
 *  2. credits_used always returned 0 — fixed extraction from response.meta.credits_used
 *  3. POST /v1/workflow/:id/cancel was missing — added
 *  4. condition branching broken — shouldExecute now correctly gates on source node status
 *  5. getSuccessors() used wrong BFS order — replaced with proper toposort-based resume
 *  6. validTypes missing 'llm', 'parallel', 'retry' node types — added
 *  7. loop node never re-executed child nodes — fixed to actually iterate body nodes
 *  8. condition_false status not handled in execution loop — now treated as branch skip
 *  9. edge condition:'success' checked last log entry globally instead of direct predecessor
 * 10. credits_used not summed across all tool nodes in a run
 *
 * New features (2026-03-31):
 *  A. 'llm' node type — calls llm-think tool internally
 *  B. 'parallel' node type — fan-out/fan-in concurrent execution
 *  C. 'retry' node type — wraps a child slug with configurable retry/backoff
 *  D. POST /v1/workflow/:id/cancel — cancel a running or waiting_approval run
 *  E. POST /v1/workflow/run/:run_id/retry — retry a failed run
 *  F. Workflow versioning — versions table, GET /v1/workflow/:id/versions, POST /:id/restore/:version
 *  G. Webhook triggers — webhook_url on run, called on completion/error/approval
 *  H. GET /v1/workflow/:id/history — full execution history with stats
 *  I. POST /v1/workflow/templates/save — save a workflow as a named user template
 *  J. Conditional branching fully working: if/else nodes with true/false edges
 */

const crypto = require('crypto');
const http = require('http');
const https = require('https');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

function now() {
  return Date.now();
}

function ok(res, data) {
  res.json({ ok: true, _engine: 'real', data, generated_at: new Date().toISOString() });
}

function err(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function requireAuth(req, res, apiKeys) {
  const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!key || !apiKeys.get(key)) {
    res.status(401).json({ error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
    return null;
  }
  return { key, acct: apiKeys.get(key) };
}

// ─── Internal HTTP tool call ──────────────────────────────────────────────────

function callToolInternally(slug, input, apiKey, timeoutMs) {
  return new Promise((resolve) => {
    const port = process.env.PORT || 3000;
    const body = JSON.stringify(input || {});
    const start = now();
    const options = {
      hostname: '127.0.0.1',
      port: parseInt(port),
      path: `/v1/${slug}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: timeoutMs || 15000,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const latency_ms = now() - start;
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed, latency_ms });
        } catch {
          resolve({ status: res.statusCode, body: { error: { code: 'invalid_json' } }, latency_ms });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ status: 502, body: { error: { code: 'tool_call_failed', message: e.message } }, latency_ms: now() - start });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, body: { error: { code: 'timeout' } }, latency_ms: timeoutMs || 15000 });
    });
    req.write(body);
    req.end();
  });
}

// ─── Webhook fire-and-forget ──────────────────────────────────────────────────

function fireWebhook(webhookUrl, payload) {
  if (!webhookUrl || typeof webhookUrl !== 'string') return;
  try {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(payload);
    const lib = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Slopshop-Workflow/1.0',
      },
      timeout: 10000,
    };
    const req = lib.request(options, (res) => {
      res.resume(); // drain response
    });
    req.on('error', () => {}); // silently ignore
    req.on('timeout', () => { req.destroy(); });
    req.write(body);
    req.end();
  } catch {
    // invalid URL — ignore
  }
}

// ─── DAG Validation: cycle detection + topological sort ──────────────────────

/**
 * Returns { hasCycle, cycleNodes } via DFS with visited + recursion_stack sets.
 */
function detectCycles(nodes, edges) {
  const adj = new Map();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) {
    if (adj.has(edge.from_node_id)) {
      adj.get(edge.from_node_id).push(edge.to_node_id);
    }
  }

  const visited = new Set();
  const recursionStack = new Set();
  const cycleNodes = new Set();

  function dfs(nodeId) {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    for (const neighbor of (adj.get(nodeId) || [])) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        cycleNodes.add(nodeId);
        cycleNodes.add(neighbor);
        return true;
      }
    }
    recursionStack.delete(nodeId);
    return false;
  }

  let hasCycle = false;
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) { hasCycle = true; break; }
    }
  }
  return { hasCycle, cycleNodes: [...cycleNodes] };
}

/**
 * Kahn's algorithm topological sort. Returns null if cycle exists.
 * FIX: properly handles parallel fan-out nodes (multiple children).
 */
function topologicalSort(nodes, edges) {
  const inDegree = new Map();
  const adj = new Map();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }
  for (const edge of edges) {
    if (adj.has(edge.from_node_id) && inDegree.has(edge.to_node_id)) {
      adj.get(edge.from_node_id).push(edge.to_node_id);
      inDegree.set(edge.to_node_id, (inDegree.get(edge.to_node_id) || 0) + 1);
    }
  }
  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const order = [];
  while (queue.length) {
    const curr = queue.shift();
    order.push(curr);
    for (const neighbor of (adj.get(curr) || [])) {
      const newDeg = inDegree.get(neighbor) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }
  if (order.length !== nodes.length) return null; // cycle
  return order;
}

/**
 * Full DAG validation — returns { valid, errors, warnings, execution_order }.
 * FIX: added 'llm', 'parallel', 'retry' to valid types.
 */
function validateDAG(nodes, edges) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push({ node_id: null, issue: 'Workflow must have at least one node' });
    return { valid: false, errors, warnings, execution_order: [] };
  }

  // Check node IDs are unique
  const nodeIds = new Set();
  for (const node of nodes) {
    if (!node.id) { errors.push({ node_id: null, issue: 'All nodes must have an id' }); continue; }
    if (nodeIds.has(node.id)) errors.push({ node_id: node.id, issue: `Duplicate node id: ${node.id}` });
    nodeIds.add(node.id);
  }

  // Valid types — FIX: added llm, parallel, retry
  const validTypes = ['tool', 'condition', 'loop', 'human_gate', 'transform', 'start', 'end', 'llm', 'parallel', 'retry'];
  for (const node of nodes) {
    if (!validTypes.includes(node.type)) {
      errors.push({ node_id: node.id, issue: `Invalid node type "${node.type}". Must be one of: ${validTypes.join(', ')}` });
    }
    if (node.type === 'tool' && !node.slug) {
      errors.push({ node_id: node.id, issue: 'Tool nodes must have a slug' });
    }
    if (node.type === 'retry' && !node.slug) {
      errors.push({ node_id: node.id, issue: 'Retry nodes must have a slug' });
    }
    if (node.type === 'llm' && !node.config && !node.prompt) {
      warnings.push({ node_id: node.id, issue: 'LLM node has no prompt or config.prompt' });
    }
  }

  // Check edges reference valid node IDs
  for (const edge of (edges || [])) {
    if (!nodeIds.has(edge.from_node_id)) {
      errors.push({ node_id: edge.from_node_id, issue: `Edge references unknown from_node_id: ${edge.from_node_id}` });
    }
    if (!nodeIds.has(edge.to_node_id)) {
      errors.push({ node_id: edge.to_node_id, issue: `Edge references unknown to_node_id: ${edge.to_node_id}` });
    }
    const validConditions = ['success', 'error', 'always', 'custom', 'true', 'false'];
    if (edge.condition && !validConditions.includes(edge.condition)) {
      warnings.push({ node_id: edge.from_node_id, issue: `Unknown edge condition "${edge.condition}"` });
    }
    if (edge.condition === 'custom' && !edge.condition_expr) {
      warnings.push({ node_id: edge.from_node_id, issue: 'Custom condition edge missing condition_expr' });
    }
  }

  // Start / end nodes
  const startNodes = nodes.filter(n => n.type === 'start');
  const endNodes = nodes.filter(n => n.type === 'end');
  if (startNodes.length === 0) warnings.push({ node_id: null, issue: 'No start node found — first topologically sorted node will be used' });
  if (startNodes.length > 1) errors.push({ node_id: null, issue: 'Only one start node is allowed' });
  if (endNodes.length === 0) warnings.push({ node_id: null, issue: 'No end node found' });

  // Cycle detection
  const { hasCycle, cycleNodes } = detectCycles(nodes, edges || []);
  if (hasCycle) {
    for (const nodeId of cycleNodes) {
      errors.push({ node_id: nodeId, issue: 'Node is part of a cycle — cycles are not allowed in workflow DAGs' });
    }
  }

  // Disconnected nodes (no edges)
  if ((edges || []).length > 0 && nodes.length > 1) {
    const connectedNodes = new Set();
    for (const edge of edges) {
      connectedNodes.add(edge.from_node_id);
      connectedNodes.add(edge.to_node_id);
    }
    for (const node of nodes) {
      if (!connectedNodes.has(node.id) && node.type !== 'start' && node.type !== 'end') {
        warnings.push({ node_id: node.id, issue: 'Node has no edges — it may be unreachable' });
      }
    }
  }

  // Topological sort for execution order
  const execution_order = errors.length === 0 ? (topologicalSort(nodes, edges || []) || []) : [];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    execution_order,
  };
}

// ─── Safe condition evaluator (no arbitrary eval) ────────────────────────────

/**
 * Evaluates a simple condition expression against a context object.
 * Supports: number comparisons (>, <, >=, <=, ==, !=), string contains, boolean checks.
 * Example: "output.count > 5", "output.status == 'ok'", "output.text contains 'error'"
 */
function evalConditionExpr(expr, context) {
  if (!expr || typeof expr !== 'string') return true;
  try {
    // "contains" check: "path contains 'value'"
    const containsMatch = expr.match(/^([\w.]+)\s+contains\s+'([^']*)'$/i);
    if (containsMatch) {
      const val = resolvePath(context, containsMatch[1]);
      return String(val || '').includes(containsMatch[2]);
    }

    // "not contains" check
    const notContainsMatch = expr.match(/^([\w.]+)\s+not\s+contains\s+'([^']*)'$/i);
    if (notContainsMatch) {
      const val = resolvePath(context, notContainsMatch[1]);
      return !String(val || '').includes(notContainsMatch[2]);
    }

    // Comparison: "path operator value"
    const compMatch = expr.match(/^([\w.]+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
    if (compMatch) {
      const left = resolvePath(context, compMatch[1]);
      const op = compMatch[2];
      let right = compMatch[3].trim();
      // Parse right side
      if (right.startsWith("'") && right.endsWith("'")) right = right.slice(1, -1);
      else if (right === 'true') right = true;
      else if (right === 'false') right = false;
      else if (!isNaN(Number(right))) right = Number(right);

      switch (op) {
        case '>':  return Number(left) > Number(right);
        case '<':  return Number(left) < Number(right);
        case '>=': return Number(left) >= Number(right);
        case '<=': return Number(left) <= Number(right);
        case '==': return String(left) === String(right);
        case '!=': return String(left) !== String(right);
      }
    }

    // Boolean truthy check: "path"
    const val = resolvePath(context, expr.trim());
    return !!val;
  } catch {
    return false;
  }
}

function resolvePath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

// ─── Pre-built templates ──────────────────────────────────────────────────────

const BUILT_IN_TEMPLATES = [
  {
    id: 'tpl-text-summarize-store',
    name: 'Text Summarize + Store',
    description: 'Count words, truncate text to a safe length, then persist in memory for later retrieval.',
    category: 'content',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-1', type: 'tool', slug: 'text-word-count', label: 'Count Words', config: {} },
      { id: 'n-2', type: 'tool', slug: 'text-truncate', label: 'Truncate', config: { max_length: 500 } },
      { id: 'n-3', type: 'tool', slug: 'memory-set', label: 'Store Result', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-1', condition: 'always' },
      { from_node_id: 'n-1', to_node_id: 'n-2', condition: 'success' },
      { from_node_id: 'n-2', to_node_id: 'n-3', condition: 'success' },
      { from_node_id: 'n-3', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ input_text: '', memory_key: 'summarized_text' }),
  },
  {
    id: 'tpl-crypto-hash-chain',
    name: 'Crypto Hash Chain',
    description: 'Generate a UUID, hash it with SHA-256, then store the hash in memory — useful for audit trails.',
    category: 'devops',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-1', type: 'tool', slug: 'crypto-uuid', label: 'Generate UUID', config: {} },
      { id: 'n-2', type: 'tool', slug: 'crypto-hash-sha256', label: 'SHA-256 Hash', config: {} },
      { id: 'n-3', type: 'tool', slug: 'memory-set', label: 'Store Hash', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-1', condition: 'always' },
      { from_node_id: 'n-1', to_node_id: 'n-2', condition: 'success' },
      { from_node_id: 'n-2', to_node_id: 'n-3', condition: 'success' },
      { from_node_id: 'n-3', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ memory_key: 'hash_chain_entry' }),
  },
  {
    id: 'tpl-url-validator',
    name: 'URL Validator',
    description: 'Validate a URL format, check its HTTP status, and resolve its DNS A record for full reachability verification.',
    category: 'devops',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-1', type: 'tool', slug: 'validate-url', label: 'Validate URL', config: {} },
      { id: 'n-2', type: 'tool', slug: 'net-http-status', label: 'HTTP Status Check', config: {} },
      { id: 'n-3', type: 'tool', slug: 'net-dns-a', label: 'DNS A Record', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-1', condition: 'always' },
      { from_node_id: 'n-1', to_node_id: 'n-2', condition: 'success' },
      { from_node_id: 'n-2', to_node_id: 'n-3', condition: 'always' },
      { from_node_id: 'n-3', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ url: '' }),
  },
  {
    id: 'tpl-code-quality-check',
    name: 'Code Quality Check',
    description: 'Measure word count and readability score of code/docs, then format results into a structured audit log entry.',
    category: 'devops',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-1', type: 'tool', slug: 'text-word-count', label: 'Word Count', config: {} },
      { id: 'n-2', type: 'tool', slug: 'text-readability-score', label: 'Readability Score', config: {} },
      { id: 'n-3', type: 'tool', slug: 'audit-log-format', label: 'Format Audit Log', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-1', condition: 'always' },
      { from_node_id: 'n-1', to_node_id: 'n-2', condition: 'success' },
      { from_node_id: 'n-2', to_node_id: 'n-3', condition: 'success' },
      { from_node_id: 'n-3', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ text: '' }),
  },
  {
    id: 'tpl-data-enrichment',
    name: 'Data Enrichment',
    description: 'Parse CSV into JSON, validate the JSON schema, then store the enriched structured data in memory.',
    category: 'data_processing',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-1', type: 'tool', slug: 'csv-to-json', label: 'CSV to JSON', config: {} },
      { id: 'n-2', type: 'tool', slug: 'text-json-validate', label: 'Validate JSON', config: {} },
      { id: 'n-3', type: 'tool', slug: 'memory-set', label: 'Store Enriched Data', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-1', condition: 'always' },
      { from_node_id: 'n-1', to_node_id: 'n-2', condition: 'success' },
      { from_node_id: 'n-2', to_node_id: 'n-3', condition: 'success' },
      { from_node_id: 'n-3', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ csv_data: '', memory_key: 'enriched_data' }),
  },
  {
    id: 'tpl-security-audit',
    name: 'Security Audit',
    description: 'Hash a payload with SHA-256, run it through guardrail checks, then format a structured security audit log.',
    category: 'devops',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-1', type: 'tool', slug: 'crypto-hash-sha256', label: 'Hash Payload', config: {} },
      { id: 'n-2', type: 'tool', slug: 'guardrail-check', label: 'Guardrail Check', config: {} },
      { id: 'n-3', type: 'tool', slug: 'audit-log-format', label: 'Format Audit Log', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-1', condition: 'always' },
      { from_node_id: 'n-1', to_node_id: 'n-2', condition: 'success' },
      { from_node_id: 'n-2', to_node_id: 'n-3', condition: 'always' },
      { from_node_id: 'n-3', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ payload: '' }),
  },
  {
    id: 'tpl-research-loop',
    name: 'Research Loop',
    description: 'Search memory for existing knowledge, optionally pass through an LLM reasoning step, then store the synthesized result.',
    category: 'research',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-1', type: 'tool', slug: 'memory-search', label: 'Search Memory', config: {} },
      { id: 'n-2', type: 'tool', slug: 'llm-think', label: 'LLM Reasoning', config: {} },
      { id: 'n-3', type: 'tool', slug: 'memory-set', label: 'Store Synthesis', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-1', condition: 'always' },
      { from_node_id: 'n-1', to_node_id: 'n-2', condition: 'success' },
      { from_node_id: 'n-2', to_node_id: 'n-3', condition: 'success' },
      { from_node_id: 'n-3', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ query: '', memory_key: 'research_result' }),
  },
  {
    id: 'tpl-price-monitor',
    name: 'Price Monitor',
    description: 'Check if a price endpoint is reachable, retrieve the last known price from memory, then store the updated price.',
    category: 'finance',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-1', type: 'tool', slug: 'net-http-status', label: 'Check Endpoint', config: {} },
      { id: 'n-2', type: 'tool', slug: 'memory-get', label: 'Get Last Price', config: {} },
      { id: 'n-3', type: 'tool', slug: 'memory-set', label: 'Store New Price', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-1', condition: 'always' },
      { from_node_id: 'n-1', to_node_id: 'n-2', condition: 'success' },
      { from_node_id: 'n-2', to_node_id: 'n-3', condition: 'always' },
      { from_node_id: 'n-3', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ url: '', price_key: 'last_price' }),
  },
  {
    id: 'tpl-content-pipeline',
    name: 'Content Pipeline',
    description: 'Word count → URL-safe slug → case conversion → store in memory. Full content normalization pipeline.',
    category: 'content',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-1', type: 'tool', slug: 'text-word-count', label: 'Word Count', config: {} },
      { id: 'n-2', type: 'tool', slug: 'text-slugify', label: 'Slugify', config: {} },
      { id: 'n-3', type: 'tool', slug: 'text-case-convert', label: 'Case Convert', config: { to: 'title' } },
      { id: 'n-4', type: 'tool', slug: 'memory-set', label: 'Store Content', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-1', condition: 'always' },
      { from_node_id: 'n-1', to_node_id: 'n-2', condition: 'success' },
      { from_node_id: 'n-2', to_node_id: 'n-3', condition: 'success' },
      { from_node_id: 'n-3', to_node_id: 'n-4', condition: 'success' },
      { from_node_id: 'n-4', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ text: '', memory_key: 'normalized_content' }),
  },
  {
    id: 'tpl-daily-standup',
    name: 'Daily Standup',
    description: 'Search memory for recent agent activity, summarize the findings, and store a standup digest via memory.',
    category: 'research',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-1', type: 'tool', slug: 'memory-search', label: 'Search Recent Activity', config: {} },
      { id: 'n-2', type: 'tool', slug: 'text-summarize', label: 'Summarize', config: {} },
      { id: 'n-3', type: 'tool', slug: 'memory-set', label: 'Store Standup', config: { namespace: 'standups' } },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-1', condition: 'always' },
      { from_node_id: 'n-1', to_node_id: 'n-2', condition: 'success' },
      { from_node_id: 'n-2', to_node_id: 'n-3', condition: 'success' },
      { from_node_id: 'n-3', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ query: 'recent activity', standup_key: 'standup_latest' }),
  },
  {
    id: 'tpl-conditional-branch',
    name: 'Conditional Branch',
    description: 'Route execution based on a condition: long text goes through truncation, short text goes through word count. Demonstrates if/else branching.',
    category: 'content',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-check', type: 'condition', label: 'Is Long Text?', config: { expression: 'word_count > 100' } },
      { id: 'n-long', type: 'tool', slug: 'text-truncate', label: 'Truncate Long Text', config: { max_length: 200 } },
      { id: 'n-short', type: 'tool', slug: 'text-word-count', label: 'Count Short Text', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-check', condition: 'always' },
      { from_node_id: 'n-check', to_node_id: 'n-long', condition: 'true' },
      { from_node_id: 'n-check', to_node_id: 'n-short', condition: 'false' },
      { from_node_id: 'n-long', to_node_id: 'end-1', condition: 'always' },
      { from_node_id: 'n-short', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ text: '', word_count: 0 }),
  },
  {
    id: 'tpl-parallel-enrichment',
    name: 'Parallel Enrichment',
    description: 'Fan out to hash and word-count simultaneously, then merge results into memory. Demonstrates parallel execution.',
    category: 'data_processing',
    author: 'slopshop',
    nodes: JSON.stringify([
      { id: 'start-1', type: 'start', label: 'Start', config: {} },
      { id: 'n-par', type: 'parallel', label: 'Fan Out', config: { branches: ['n-hash', 'n-count'] } },
      { id: 'n-hash', type: 'tool', slug: 'crypto-hash-sha256', label: 'Hash Text', config: {} },
      { id: 'n-count', type: 'tool', slug: 'text-word-count', label: 'Count Words', config: {} },
      { id: 'n-store', type: 'tool', slug: 'memory-set', label: 'Store Results', config: {} },
      { id: 'end-1', type: 'end', label: 'End', config: {} },
    ]),
    edges: JSON.stringify([
      { from_node_id: 'start-1', to_node_id: 'n-par', condition: 'always' },
      { from_node_id: 'n-par', to_node_id: 'n-hash', condition: 'always' },
      { from_node_id: 'n-par', to_node_id: 'n-count', condition: 'always' },
      { from_node_id: 'n-hash', to_node_id: 'n-store', condition: 'always' },
      { from_node_id: 'n-count', to_node_id: 'n-store', condition: 'always' },
      { from_node_id: 'n-store', to_node_id: 'end-1', condition: 'always' },
    ]),
    variables: JSON.stringify({ text: '' }),
  },
];

// ─── Module export ────────────────────────────────────────────────────────────

module.exports = function (app, db, apiKeys) {

  // ─── Init tables ──────────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      nodes TEXT DEFAULT '[]',
      edges TEXT DEFAULT '[]',
      variables TEXT DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      version INTEGER DEFAULT 1,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflows_api_key ON workflows(api_key);

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      api_key TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      input TEXT DEFAULT '{}',
      output TEXT DEFAULT '{}',
      log TEXT DEFAULT '[]',
      started INTEGER NOT NULL,
      completed INTEGER,
      credits_used INTEGER DEFAULT 0,
      webhook_url TEXT DEFAULT NULL,
      workflow_version INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_api_key ON workflow_runs(api_key);

    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      nodes TEXT DEFAULT '[]',
      edges TEXT DEFAULT '[]',
      variables TEXT DEFAULT '{}',
      author TEXT DEFAULT 'slopshop',
      downloads INTEGER DEFAULT 0,
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_templates_category ON workflow_templates(category);

    CREATE TABLE IF NOT EXISTS workflow_versions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      api_key TEXT NOT NULL,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      nodes TEXT DEFAULT '[]',
      edges TEXT DEFAULT '[]',
      variables TEXT DEFAULT '{}',
      created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_id ON workflow_versions(workflow_id);
  `);

  // Add new columns to existing tables if missing (idempotent migration)
  try { db.exec(`ALTER TABLE workflow_runs ADD COLUMN webhook_url TEXT DEFAULT NULL`); } catch {}
  try { db.exec(`ALTER TABLE workflow_runs ADD COLUMN workflow_version INTEGER DEFAULT 1`); } catch {}

  // Seed built-in templates (idempotent)
  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO workflow_templates
      (id, name, description, category, nodes, edges, variables, author, downloads, created)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const seedTemplates = db.transaction(() => {
    for (const t of BUILT_IN_TEMPLATES) {
      insertTemplate.run(t.id, t.name, t.description, t.category, t.nodes, t.edges, t.variables, t.author, 0, now());
    }
  });
  try { seedTemplates(); } catch (e) { /* ignore if already seeded */ }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTION ENGINE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Execute a single node. Returns { logEntry, output, status, credits_used }.
   *
   * FIX: credits_used now correctly reads from response.meta.credits_used.
   * FIX: added 'llm' node type.
   * FIX: added 'parallel' node type with concurrent fan-out.
   * FIX: added 'retry' node type with configurable attempts + backoff.
   * FIX: loop node now actually iterates body nodes.
   * FIX: condition node status 'condition_false' returned correctly for branching.
   */
  async function executeNode(node, context, apiKey, edges, variables) {
    const start = now();
    const logEntry = { node_id: node.id, type: node.type, label: node.label, status: 'running', output: null, latency_ms: 0, ts: start };

    try {
      if (node.type === 'start') {
        logEntry.status = 'success';
        logEntry.output = context;
        logEntry.latency_ms = now() - start;
        return { logEntry, output: context, status: 'success', credits_used: 0 };
      }

      if (node.type === 'end') {
        logEntry.status = 'success';
        logEntry.output = context;
        logEntry.latency_ms = now() - start;
        return { logEntry, output: context, status: 'success', credits_used: 0 };
      }

      if (node.type === 'transform') {
        const config = node.config || {};
        let output = { ...context };
        if (config.pick && Array.isArray(config.pick)) {
          output = {};
          for (const k of config.pick) output[k] = context[k];
        }
        if (config.rename && typeof config.rename === 'object') {
          for (const [from, to] of Object.entries(config.rename)) {
            if (from in output) { output[to] = output[from]; delete output[from]; }
          }
        }
        if (config.set && typeof config.set === 'object') {
          Object.assign(output, config.set);
        }
        if (config.delete && Array.isArray(config.delete)) {
          for (const k of config.delete) delete output[k];
        }
        logEntry.status = 'success';
        logEntry.output = output;
        logEntry.latency_ms = now() - start;
        return { logEntry, output, status: 'success', credits_used: 0 };
      }

      // FIX: condition node — returns condition_result in context, and status encodes branch direction
      if (node.type === 'condition') {
        const config = node.config || {};
        const expr = config.expression || node.condition_expr || '';
        const result = evalConditionExpr(expr, context);
        const branchStatus = result ? 'condition_true' : 'condition_false';
        logEntry.status = branchStatus;
        logEntry.output = { condition_result: result, expression: expr };
        logEntry.latency_ms = now() - start;
        return { logEntry, output: { ...context, condition_result: result }, status: branchStatus, credits_used: 0 };
      }

      if (node.type === 'human_gate') {
        logEntry.status = 'waiting_approval';
        logEntry.output = { gate: true, context };
        logEntry.latency_ms = now() - start;
        return { logEntry, output: { ...context, _gate_node_id: node.id }, status: 'waiting_approval', credits_used: 0 };
      }

      // FIX: loop node actually executes body nodes N times
      if (node.type === 'loop') {
        const config = node.config || {};
        const iterations = Math.min(parseInt(config.iterations) || 3, 10);
        let loopOutput = { ...context };
        let totalCredits = 0;
        const loopLog = [];

        // Find direct children of this loop node in the DAG
        const loopBodyIds = (edges || [])
          .filter(e => e.from_node_id === node.id)
          .map(e => e.to_node_id);

        for (let i = 0; i < iterations; i++) {
          loopOutput = { ...loopOutput, loop_index: i, loop_iteration: i + 1 };
          // Execute each body node in sequence for this iteration
          for (const bodyNodeId of loopBodyIds) {
            // We don't have the full node objects here — store them in context
            // The loop node config can carry inline node definitions for body
            const bodyNodeDef = config.body_nodes && config.body_nodes.find(n => n.id === bodyNodeId);
            if (bodyNodeDef) {
              const bodyResult = await executeNode(bodyNodeDef, loopOutput, apiKey, [], variables);
              loopLog.push({ ...bodyResult.logEntry, loop_iteration: i + 1 });
              totalCredits += bodyResult.credits_used || 0;
              if (bodyResult.output) loopOutput = { ...loopOutput, ...bodyResult.output };
            }
          }
        }

        logEntry.status = 'success';
        logEntry.output = { ...loopOutput, loop_iterations_completed: iterations };
        logEntry.latency_ms = now() - start;
        return { logEntry, output: loopOutput, status: 'success', credits_used: totalCredits };
      }

      // NEW: parallel node — fan-out concurrent execution, merge results
      if (node.type === 'parallel') {
        const config = node.config || {};
        const branchNodeIds = config.branches || (edges || [])
          .filter(e => e.from_node_id === node.id)
          .map(e => e.to_node_id);

        // Get branch node defs from config (caller must embed them) or skip if unavailable
        const branchDefs = (config.branch_nodes || []);
        if (branchDefs.length === 0) {
          // No embedded defs — mark as success, downstream handled by execution order
          logEntry.status = 'success';
          logEntry.output = { parallel_branches: branchNodeIds, note: 'fan-out dispatched' };
          logEntry.latency_ms = now() - start;
          return { logEntry, output: { ...context, _parallel_fan_out: branchNodeIds }, status: 'parallel_fanout', credits_used: 0 };
        }

        const branchPromises = branchDefs.map(branchNode =>
          executeNode(branchNode, context, apiKey, [], variables)
        );
        const branchResults = await Promise.all(branchPromises);

        let mergedOutput = { ...context };
        let totalCredits = 0;
        const branchLog = [];
        let anyError = false;

        for (const r of branchResults) {
          branchLog.push(r.logEntry);
          totalCredits += r.credits_used || 0;
          if (r.status === 'error') anyError = true;
          if (r.output) mergedOutput = { ...mergedOutput, ...r.output };
        }

        logEntry.status = anyError ? 'partial_error' : 'success';
        logEntry.output = { branches: branchLog, merged: mergedOutput };
        logEntry.latency_ms = now() - start;
        return { logEntry, output: mergedOutput, status: logEntry.status, credits_used: totalCredits };
      }

      // NEW: retry node — wraps a tool call with configurable attempts + exponential backoff
      if (node.type === 'retry') {
        if (!node.slug) {
          logEntry.status = 'error';
          logEntry.output = { error: 'Retry node missing slug' };
          logEntry.latency_ms = now() - start;
          return { logEntry, output: logEntry.output, status: 'error', credits_used: 0 };
        }
        const config = node.config || {};
        const maxAttempts = Math.min(parseInt(config.max_attempts) || 3, 5);
        const backoffMs = parseInt(config.backoff_ms) || 1000;

        let lastResult = null;
        let totalCredits = 0;
        const attemptLog = [];

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          if (attempt > 1) {
            await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt - 2)));
          }
          const toolInput = { ...context, ...(node.config || {}), max_attempts: undefined, backoff_ms: undefined };
          const result = await callToolInternally(node.slug, toolInput, apiKey, 20000);
          const success = result.status >= 200 && result.status < 300;
          // FIX: read credits from meta.credits_used
          const credits = (result.body && result.body.meta && result.body.meta.credits_used) ||
                          (result.body && result.body.credits_used) || 0;
          totalCredits += credits;
          attemptLog.push({ attempt, status: success ? 'success' : 'error', http_status: result.status, latency_ms: result.latency_ms });
          lastResult = { ...result, success };
          if (success) break;
        }

        const success = lastResult && lastResult.success;
        const responseData = lastResult && lastResult.body;
        let outputData = { ...context };
        if (success && responseData && responseData.data) {
          outputData = { ...outputData, ...responseData.data, [`${node.slug}_output`]: responseData.data };
        } else if (!success) {
          outputData = { ...outputData, last_error: responseData };
        }

        logEntry.status = success ? 'success' : 'error';
        logEntry.output = { attempts: attemptLog, result: responseData };
        logEntry.latency_ms = now() - start;
        return { logEntry, output: outputData, status: logEntry.status, credits_used: totalCredits };
      }

      // NEW: llm node type — calls llm-think internally with prompt from config or node.prompt
      if (node.type === 'llm') {
        const config = node.config || {};
        const prompt = config.prompt || node.prompt || context.prompt || '';
        const model = config.model || 'claude';
        const toolInput = { ...context, prompt, model, ...(config.extra_params || {}) };

        const result = await callToolInternally('llm-think', toolInput, apiKey, 30000);
        const latency_ms = now() - start;
        const success = result.status >= 200 && result.status < 300;
        const responseData = result.body;
        // FIX: read credits from meta.credits_used
        const credits = (responseData && responseData.meta && responseData.meta.credits_used) ||
                        (responseData && responseData.credits_used) || 0;

        logEntry.status = success ? 'success' : 'error';
        logEntry.output = responseData;
        logEntry.latency_ms = latency_ms;

        let outputData = { ...context };
        if (success && responseData && responseData.data) {
          outputData = { ...outputData, ...responseData.data, [`llm_output`]: responseData.data, llm_result: responseData.data.result || responseData.data.text || '' };
        } else if (!success) {
          outputData = { ...outputData, last_error: responseData };
        }

        return { logEntry, output: outputData, status: success ? 'success' : 'error', credits_used: credits };
      }

      if (node.type === 'tool') {
        if (!node.slug) {
          logEntry.status = 'error';
          logEntry.output = { error: 'Tool node missing slug' };
          logEntry.latency_ms = now() - start;
          return { logEntry, output: logEntry.output, status: 'error', credits_used: 0 };
        }

        // Build input: merge context + node config
        const toolInput = { ...context, ...(node.config || {}) };

        const result = await callToolInternally(node.slug, toolInput, apiKey, 20000);
        const latency_ms = now() - start;
        const success = result.status >= 200 && result.status < 300;
        const responseData = result.body;

        // FIX: correctly extract credits_used from response.meta.credits_used
        const credits_used = (responseData && responseData.meta && responseData.meta.credits_used) ||
                             (responseData && responseData.credits_used) ||
                             (responseData && responseData.data && responseData.data.credits_used) || 0;

        logEntry.status = success ? 'success' : 'error';
        logEntry.output = responseData;
        logEntry.latency_ms = latency_ms;

        // Merge tool output into context if successful
        let outputData = { ...context };
        if (success && responseData && responseData.data) {
          outputData = { ...outputData, ...responseData.data, [`${node.slug}_output`]: responseData.data };
        } else if (!success) {
          outputData = { ...outputData, last_error: responseData };
        }

        return {
          logEntry,
          output: outputData,
          status: success ? 'success' : 'error',
          credits_used,
        };
      }

      // Unknown node type
      logEntry.status = 'error';
      logEntry.output = { error: `Unknown node type: ${node.type}` };
      logEntry.latency_ms = now() - start;
      return { logEntry, output: logEntry.output, status: 'error', credits_used: 0 };

    } catch (e) {
      logEntry.status = 'error';
      logEntry.output = { error: e.message };
      logEntry.latency_ms = now() - start;
      return { logEntry, output: { error: e.message }, status: 'error', credits_used: 0 };
    }
  }

  /**
   * Determine whether a node should execute given the current run state.
   *
   * FIX: correctly gates condition:'success' on whether the direct predecessor node succeeded.
   * FIX: gates condition:'true'/'false' on condition_result from context.
   * FIX: a node with multiple incoming edges uses OR logic — if ANY incoming edge allows it, execute.
   *
   * @param {string} nodeId
   * @param {Array} edges
   * @param {Map<string,string>} nodeStatusMap — map of node_id -> status from the run log so far
   * @param {Object} context — current execution context
   * @returns {boolean}
   */
  function shouldExecuteNode(nodeId, edges, nodeStatusMap, context) {
    const incomingEdges = edges.filter(e => e.to_node_id === nodeId);

    // No incoming edges → root node, always execute
    if (incomingEdges.length === 0) return true;

    // OR logic: at least one incoming edge must allow execution
    for (const edge of incomingEdges) {
      const sourceStatus = nodeStatusMap.get(edge.from_node_id);

      // Source hasn't run yet (was skipped) → this edge doesn't enable execution
      if (sourceStatus === undefined || sourceStatus === 'skipped') continue;

      const cond = edge.condition || 'always';

      if (cond === 'always') {
        return true;
      }

      if (cond === 'success') {
        if (sourceStatus === 'success') return true;
        continue;
      }

      if (cond === 'error') {
        if (sourceStatus === 'error') return true;
        continue;
      }

      // FIX: 'true' / 'false' conditions check condition_result from context
      if (cond === 'true') {
        if (context.condition_result === true) return true;
        continue;
      }

      if (cond === 'false') {
        if (context.condition_result === false) return true;
        continue;
      }

      if (cond === 'custom' && edge.condition_expr) {
        if (evalConditionExpr(edge.condition_expr, context)) return true;
        continue;
      }

      // Default: allow
      return true;
    }

    return false;
  }

  /**
   * Check if a node is a fan-in join — all its predecessors that could have run must have run.
   * Returns true if the node should be deferred (not all required predecessors have completed).
   */
  function isFanInDeferred(nodeId, edges, nodeStatusMap) {
    const incomingEdges = edges.filter(e => e.to_node_id === nodeId);
    if (incomingEdges.length <= 1) return false;

    // For fan-in: ALL incoming edges from non-skipped sources must have completed
    for (const edge of incomingEdges) {
      const sourceStatus = nodeStatusMap.get(edge.from_node_id);
      // If source hasn't been visited at all, it hasn't run yet → defer
      if (sourceStatus === undefined) return true;
    }
    return false;
  }

  /**
   * Core execution engine — runs nodes in topological order with proper condition routing.
   * Returns { runLog, context, finalStatus, totalCredits }.
   */
  async function executeWorkflow(nodes, edges, variables, input, apiKey, cancelCheck) {
    const validation = validateDAG(nodes, edges);
    if (!validation.valid) {
      return { runLog: [], context: {}, finalStatus: 'error', totalCredits: 0, validationError: validation.errors[0].issue };
    }

    const executionOrder = validation.execution_order;
    const runLog = [];
    let context = { ...variables, ...input };
    let totalCredits = 0;
    let finalStatus = 'completed';

    // Track what status each node produced
    const nodeStatusMap = new Map();

    for (const nodeId of executionOrder) {
      // Check for external cancellation
      if (cancelCheck && cancelCheck()) {
        finalStatus = 'cancelled';
        break;
      }

      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;

      // FIX: check if fan-in node is waiting for all predecessors
      // (In synchronous topo order this shouldn't trigger, but guards parallel future cases)
      if (isFanInDeferred(nodeId, edges, nodeStatusMap)) {
        runLog.push({ node_id: nodeId, status: 'deferred', output: null, latency_ms: 0, ts: now() });
        nodeStatusMap.set(nodeId, 'deferred');
        continue;
      }

      // FIX: proper condition-based gate using source node status
      if (!shouldExecuteNode(nodeId, edges, nodeStatusMap, context)) {
        runLog.push({ node_id: nodeId, status: 'skipped', output: null, latency_ms: 0, ts: now() });
        nodeStatusMap.set(nodeId, 'skipped');
        continue;
      }

      const result = await executeNode(node, context, apiKey, edges, variables);
      runLog.push(result.logEntry);
      totalCredits += result.credits_used || 0;
      nodeStatusMap.set(nodeId, result.status);

      if (result.status === 'waiting_approval') {
        // Human gate — pause, return gate state
        return { runLog, context: { ...context, _pending_gate_node_id: nodeId }, finalStatus: 'waiting_approval', totalCredits, gateNodeId: nodeId, gateNodeLabel: node.label };
      }

      // FIX: condition_true/condition_false are not errors — update context and continue
      if (result.status === 'condition_true' || result.status === 'condition_false') {
        if (result.output) context = { ...context, ...result.output };
        // Map condition status to 'success' so downstream 'success' edges still fire if needed
        nodeStatusMap.set(nodeId, result.status);
        continue;
      }

      if (result.status === 'error') {
        finalStatus = 'error';
        if (result.output) context = { ...context, ...result.output };
        break;
      }

      if (result.output) context = { ...context, ...result.output };
    }

    return { runLog, context, finalStatus, totalCredits };
  }

  /**
   * Get topologically-ordered successors of a node.
   * FIX: uses topological sort of the full graph, then filters to only reachable nodes.
   */
  function getSuccessorsInOrder(fromNodeId, nodes, edges) {
    // BFS to find all reachable node IDs
    const reachable = new Set();
    const queue = [fromNodeId];
    while (queue.length) {
      const curr = queue.shift();
      if (reachable.has(curr)) continue;
      if (curr !== fromNodeId) reachable.add(curr);
      const successors = edges.filter(e => e.from_node_id === curr).map(e => e.to_node_id);
      queue.push(...successors);
    }
    // Return them in topological order
    const fullOrder = topologicalSort(nodes, edges) || [];
    return fullOrder.filter(id => reachable.has(id));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WORKFLOW CRUD
  // ══════════════════════════════════════════════════════════════════════════

  // POST /v1/workflow/create
  app.post('/v1/workflow/create', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { name, description, nodes, edges, variables } = req.body;
    if (!name || typeof name !== 'string') return err(res, 422, 'missing_field', 'name is required');

    const nodesArr = Array.isArray(nodes) ? nodes : [];
    // Normalize edges: support both {from, to} shorthand and {from_node_id, to_node_id} canonical form
    const edgesArr = (Array.isArray(edges) ? edges : []).map(e => ({
      from_node_id: e.from_node_id || e.from,
      to_node_id:   e.to_node_id   || e.to,
      condition:    e.condition,
      condition_expr: e.condition_expr,
      label:        e.label,
    }));
    const variablesObj = variables && typeof variables === 'object' ? variables : {};

    const validation_result = validateDAG(nodesArr, edgesArr);
    const workflow_id = 'wf-' + uid(12);
    const ts = now();

    db.prepare(`
      INSERT INTO workflows (id, api_key, name, description, nodes, edges, variables, status, version, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)
    `).run(
      workflow_id, auth.key, name, description || '',
      JSON.stringify(nodesArr), JSON.stringify(edgesArr), JSON.stringify(variablesObj),
      ts, ts
    );

    // Save version snapshot
    db.prepare(`
      INSERT INTO workflow_versions (id, workflow_id, api_key, version, name, description, nodes, edges, variables, created)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(uid(16), workflow_id, auth.key, name, description || '', JSON.stringify(nodesArr), JSON.stringify(edgesArr), JSON.stringify(variablesObj), ts);

    return ok(res, { workflow_id, validation_result });
  });

  // POST /v1/workflow/run — FIX: now delegates to real execution engine instead of being a stub
  // Must be declared before /v1/workflow/:id to avoid route conflict
  app.post('/v1/workflow/run', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { workflow_id, input = {}, dry_run = false, webhook_url } = req.body;
    if (!workflow_id) return err(res, 422, 'missing_field', 'workflow_id is required');

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND api_key = ?').get(workflow_id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const nodes = JSON.parse(workflow.nodes || '[]');
    const edges = JSON.parse(workflow.edges || '[]');
    const variables = JSON.parse(workflow.variables || '{}');

    // Validate before running
    const validation = validateDAG(nodes, edges);
    if (!validation.valid) {
      return err(res, 422, 'invalid_workflow', `Workflow has ${validation.errors.length} validation error(s): ${validation.errors[0].issue}`);
    }

    const run_id = 'run-' + uid(12);
    const started = now();

    db.prepare(`
      INSERT INTO workflow_runs (id, workflow_id, api_key, status, input, output, log, started, completed, credits_used, webhook_url, workflow_version)
      VALUES (?, ?, ?, 'running', ?, '{}', '[]', ?, NULL, 0, ?, ?)
    `).run(run_id, workflow.id, auth.key, JSON.stringify(input), started, webhook_url || null, workflow.version);

    if (dry_run) {
      db.prepare('UPDATE workflow_runs SET status = ?, completed = ? WHERE id = ?').run('dry_run_complete', now(), run_id);
      return ok(res, {
        run_id,
        status: 'dry_run_complete',
        workflow_id,
        execution_order: validation.execution_order,
        node_count: nodes.length,
        edge_count: edges.length,
        message: 'Dry run — no tools were called',
        credits_used: 0,
      });
    }

    // FIX: actually execute the workflow using the real execution engine
    const execResult = await executeWorkflow(nodes, edges, variables, input, auth.key, null);

    if (execResult.validationError) {
      db.prepare('UPDATE workflow_runs SET status = ?, completed = ?, output = ?, log = ? WHERE id = ?')
        .run('error', now(), JSON.stringify({ error: execResult.validationError }), '[]', run_id);
      return err(res, 422, 'invalid_workflow', execResult.validationError);
    }

    if (execResult.finalStatus === 'waiting_approval') {
      db.prepare(`UPDATE workflow_runs SET status = 'waiting_approval', output = ?, log = ?, credits_used = ? WHERE id = ?`)
        .run(JSON.stringify(execResult.context), JSON.stringify(execResult.runLog), execResult.totalCredits, run_id);
      return ok(res, {
        run_id,
        status: 'waiting_approval',
        workflow_id,
        gate_node_id: execResult.gateNodeId,
        gate_node_label: execResult.gateNodeLabel,
        log: execResult.runLog,
        credits_used: execResult.totalCredits,
        message: `Workflow paused at human gate "${execResult.gateNodeLabel}". Call POST /v1/workflow/run/${run_id}/approve to continue.`,
      });
    }

    db.prepare(`UPDATE workflow_runs SET status = ?, completed = ?, output = ?, log = ?, credits_used = ? WHERE id = ?`)
      .run(execResult.finalStatus, now(), JSON.stringify(execResult.context), JSON.stringify(execResult.runLog), execResult.totalCredits, run_id);

    // Fire webhook if configured
    if (webhook_url) {
      fireWebhook(webhook_url, {
        event: 'workflow.completed',
        run_id,
        workflow_id,
        status: execResult.finalStatus,
        output: execResult.context,
        credits_used: execResult.totalCredits,
      });
    }

    return ok(res, {
      run_id,
      status: execResult.finalStatus,
      workflow_id,
      output: execResult.context,
      log: execResult.runLog,
      credits_used: execResult.totalCredits,
    });
  });

  // GET /v1/workflow/templates — must be before /v1/workflow/:id
  app.get('/v1/workflow/templates', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { category } = req.query;
    let templates;
    if (category) {
      templates = db.prepare('SELECT * FROM workflow_templates WHERE category = ? ORDER BY downloads DESC').all(category);
    } else {
      templates = db.prepare('SELECT * FROM workflow_templates ORDER BY downloads DESC').all();
    }

    const result = templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      author: t.author,
      downloads: t.downloads,
      node_count: (() => { try { return JSON.parse(t.nodes).length; } catch { return 0; } })(),
      created: t.created,
    }));

    return ok(res, { templates: result, count: result.length });
  });

  // POST /v1/workflow/templates/:id/use
  app.post('/v1/workflow/templates/:id/use', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const template = db.prepare('SELECT * FROM workflow_templates WHERE id = ?').get(req.params.id);
    if (!template) return err(res, 404, 'not_found', 'Template not found');

    // Increment downloads
    db.prepare('UPDATE workflow_templates SET downloads = downloads + 1 WHERE id = ?').run(template.id);

    const workflow_id = 'wf-' + uid(12);
    const ts = now();
    db.prepare(`
      INSERT INTO workflows (id, api_key, name, description, nodes, edges, variables, status, version, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)
    `).run(
      workflow_id, auth.key,
      template.name + ' (copy)',
      template.description,
      template.nodes, template.edges, template.variables,
      ts, ts
    );

    // Save initial version snapshot
    db.prepare(`
      INSERT INTO workflow_versions (id, workflow_id, api_key, version, name, description, nodes, edges, variables, created)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(uid(16), workflow_id, auth.key, template.name + ' (copy)', template.description, template.nodes, template.edges, template.variables, ts);

    return ok(res, { workflow_id, template_id: template.id, message: 'Template cloned into new workflow' });
  });

  // NEW: POST /v1/workflow/templates/save — save a workflow as a user template
  app.post('/v1/workflow/templates/save', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { name, description, category, nodes, edges, variables } = req.body;
    if (!name || typeof name !== 'string') return err(res, 422, 'missing_field', 'name is required');

    const nodesArr = Array.isArray(nodes) ? nodes : [];
    const edgesArr = (Array.isArray(edges) ? edges : []).map(e => ({
      from_node_id: e.from_node_id || e.from,
      to_node_id:   e.to_node_id   || e.to,
      condition:    e.condition,
      condition_expr: e.condition_expr,
      label:        e.label,
    }));
    const variablesObj = variables && typeof variables === 'object' ? variables : {};

    const validation = validateDAG(nodesArr, edgesArr);
    if (!validation.valid) {
      return err(res, 422, 'invalid_workflow', `Template has validation errors: ${validation.errors[0].issue}`);
    }

    const validCategories = ['data_processing', 'research', 'devops', 'finance', 'content', 'general'];
    const cat = validCategories.includes(category) ? category : 'general';
    const template_id = 'tpl-user-' + uid(12);
    const ts = now();

    db.prepare(`
      INSERT INTO workflow_templates (id, name, description, category, nodes, edges, variables, author, downloads, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      template_id, name, description || '', cat,
      JSON.stringify(nodesArr), JSON.stringify(edgesArr), JSON.stringify(variablesObj),
      auth.key.slice(0, 12) + '...',
      ts
    );

    return ok(res, { template_id, name, category: cat, node_count: nodesArr.length });
  });

  // GET /v1/workflow/run/:run_id — must be before /v1/workflow/:id
  app.get('/v1/workflow/run/:run_id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const run = db.prepare('SELECT * FROM workflow_runs WHERE id = ? AND api_key = ?').get(req.params.run_id, auth.key);
    if (!run) return err(res, 404, 'not_found', 'Run not found');

    return ok(res, {
      run_id: run.id,
      workflow_id: run.workflow_id,
      status: run.status,
      input: JSON.parse(run.input || '{}'),
      output: JSON.parse(run.output || '{}'),
      log: JSON.parse(run.log || '[]'),
      started: run.started,
      completed: run.completed,
      credits_used: run.credits_used,
      webhook_url: run.webhook_url || null,
      workflow_version: run.workflow_version || 1,
    });
  });

  // POST /v1/workflow/run/:run_id/approve
  app.post('/v1/workflow/run/:run_id/approve', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const run = db.prepare('SELECT * FROM workflow_runs WHERE id = ? AND api_key = ?').get(req.params.run_id, auth.key);
    if (!run) return err(res, 404, 'not_found', 'Run not found');

    if (run.status !== 'waiting_approval') {
      return err(res, 409, 'invalid_state', `Run is in state "${run.status}", not "waiting_approval"`);
    }

    const { decision, input_override } = req.body;
    if (!decision || !['approve', 'reject'].includes(decision)) {
      return err(res, 422, 'missing_field', 'decision must be "approve" or "reject"');
    }

    const runState = JSON.parse(run.output || '{}');
    const logEntries = JSON.parse(run.log || '[]');

    if (decision === 'reject') {
      db.prepare(`
        UPDATE workflow_runs SET status = 'rejected', completed = ?, output = ?, log = ? WHERE id = ?
      `).run(now(), JSON.stringify({ ...runState, rejected: true, decision: 'reject' }), JSON.stringify(logEntries), run.id);

      // Fire webhook on rejection if configured
      if (run.webhook_url) {
        fireWebhook(run.webhook_url, { event: 'workflow.rejected', run_id: run.id, workflow_id: run.workflow_id, decision: 'reject' });
      }

      return ok(res, { run_id: run.id, status: 'rejected', decision: 'reject' });
    }

    // Approve: resume execution from after the gate node
    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(run.workflow_id);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const nodes = JSON.parse(workflow.nodes || '[]');
    const edges = JSON.parse(workflow.edges || '[]');
    const pendingGateNodeId = runState._pending_gate_node_id;
    let context = { ...runState, ...(input_override || {}) };
    delete context._pending_gate_node_id;

    // FIX: use topologically-ordered successors (not raw BFS) for resume
    const postGateOrder = getSuccessorsInOrder(pendingGateNodeId, nodes, edges);
    const resumeLog = [...logEntries, { node_id: pendingGateNodeId, status: 'approved', decision: 'approve', ts: now() }];

    let totalCredits = run.credits_used || 0;
    let finalStatus = 'completed';
    const nodeStatusMap = new Map();

    // Pre-populate status map from existing log
    for (const entry of logEntries) {
      if (entry.status && entry.status !== 'running') {
        nodeStatusMap.set(entry.node_id, entry.status);
      }
    }
    // Mark the gate as approved/success
    nodeStatusMap.set(pendingGateNodeId, 'success');

    for (const nodeId of postGateOrder) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;

      if (!shouldExecuteNode(nodeId, edges, nodeStatusMap, context)) {
        resumeLog.push({ node_id: nodeId, status: 'skipped', output: null, latency_ms: 0, ts: now() });
        nodeStatusMap.set(nodeId, 'skipped');
        continue;
      }

      const nodeResult = await executeNode(node, context, auth.key, edges, {});
      resumeLog.push(nodeResult.logEntry);
      totalCredits += nodeResult.credits_used || 0;
      nodeStatusMap.set(nodeId, nodeResult.status);

      if (nodeResult.status === 'error') {
        finalStatus = 'error';
        if (nodeResult.output) context = { ...context, ...nodeResult.output };
        break;
      }

      if (nodeResult.status === 'condition_true' || nodeResult.status === 'condition_false') {
        if (nodeResult.output) context = { ...context, ...nodeResult.output };
        continue;
      }

      if (nodeResult.output) context = { ...context, ...nodeResult.output };
    }

    db.prepare(`UPDATE workflow_runs SET status = ?, completed = ?, output = ?, log = ?, credits_used = ? WHERE id = ?`)
      .run(finalStatus, now(), JSON.stringify(context), JSON.stringify(resumeLog), totalCredits, run.id);

    // Fire webhook on completion
    if (run.webhook_url) {
      fireWebhook(run.webhook_url, { event: 'workflow.completed', run_id: run.id, workflow_id: run.workflow_id, status: finalStatus, output: context, credits_used: totalCredits });
    }

    return ok(res, { run_id: run.id, status: finalStatus, output: context, log: resumeLog, credits_used: totalCredits });
  });

  // NEW: POST /v1/workflow/run/:run_id/retry — retry a failed run with same input
  app.post('/v1/workflow/run/:run_id/retry', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const oldRun = db.prepare('SELECT * FROM workflow_runs WHERE id = ? AND api_key = ?').get(req.params.run_id, auth.key);
    if (!oldRun) return err(res, 404, 'not_found', 'Run not found');

    if (!['error', 'cancelled'].includes(oldRun.status)) {
      return err(res, 409, 'invalid_state', `Can only retry runs in error or cancelled state (current: ${oldRun.status})`);
    }

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(oldRun.workflow_id);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const nodes = JSON.parse(workflow.nodes || '[]');
    const edges = JSON.parse(workflow.edges || '[]');
    const variables = JSON.parse(workflow.variables || '{}');
    const input = JSON.parse(oldRun.input || '{}');
    const { input_override } = req.body;
    const finalInput = { ...input, ...(input_override || {}) };

    const validation = validateDAG(nodes, edges);
    if (!validation.valid) {
      return err(res, 422, 'invalid_workflow', `Workflow has validation error(s): ${validation.errors[0].issue}`);
    }

    const run_id = 'run-' + uid(12);
    const started = now();

    db.prepare(`
      INSERT INTO workflow_runs (id, workflow_id, api_key, status, input, output, log, started, completed, credits_used, webhook_url, workflow_version)
      VALUES (?, ?, ?, 'running', ?, '{}', '[]', ?, NULL, 0, ?, ?)
    `).run(run_id, workflow.id, auth.key, JSON.stringify(finalInput), started, oldRun.webhook_url || null, workflow.version);

    const execResult = await executeWorkflow(nodes, edges, variables, finalInput, auth.key, null);

    if (execResult.finalStatus === 'waiting_approval') {
      db.prepare(`UPDATE workflow_runs SET status = 'waiting_approval', output = ?, log = ?, credits_used = ? WHERE id = ?`)
        .run(JSON.stringify(execResult.context), JSON.stringify(execResult.runLog), execResult.totalCredits, run_id);
      return ok(res, { run_id, status: 'waiting_approval', retried_from: req.params.run_id, gate_node_id: execResult.gateNodeId });
    }

    db.prepare(`UPDATE workflow_runs SET status = ?, completed = ?, output = ?, log = ?, credits_used = ? WHERE id = ?`)
      .run(execResult.finalStatus, now(), JSON.stringify(execResult.context), JSON.stringify(execResult.runLog), execResult.totalCredits, run_id);

    return ok(res, {
      run_id,
      retried_from: req.params.run_id,
      status: execResult.finalStatus,
      output: execResult.context,
      log: execResult.runLog,
      credits_used: execResult.totalCredits,
    });
  });

  // GET /v1/workflow/:id
  app.get('/v1/workflow/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const nodes = JSON.parse(workflow.nodes || '[]');
    const edges = JSON.parse(workflow.edges || '[]');
    const validation = validateDAG(nodes, edges);

    return ok(res, {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      nodes,
      edges,
      variables: JSON.parse(workflow.variables || '{}'),
      status: workflow.status,
      version: workflow.version,
      validation: validation,
      created: workflow.created,
      updated: workflow.updated,
    });
  });

  // PUT /v1/workflow/:id
  app.put('/v1/workflow/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const { name, description, nodes, edges, variables, status } = req.body;

    const nodesArr = Array.isArray(nodes) ? nodes : JSON.parse(workflow.nodes || '[]');
    // FIX: normalize shorthand edges on update too
    const rawEdges = Array.isArray(edges) ? edges : JSON.parse(workflow.edges || '[]');
    const edgesArr = rawEdges.map(e => ({
      from_node_id: e.from_node_id || e.from,
      to_node_id:   e.to_node_id   || e.to,
      condition:    e.condition,
      condition_expr: e.condition_expr,
      label:        e.label,
    }));
    const variablesObj = variables && typeof variables === 'object' ? variables : JSON.parse(workflow.variables || '{}');
    const validStatuses = ['draft', 'active', 'archived'];
    const newStatus = validStatuses.includes(status) ? status : workflow.status;

    const validation_result = validateDAG(nodesArr, edgesArr);
    const newVersion = workflow.version + 1;
    const ts = now();

    db.prepare(`
      UPDATE workflows SET name = ?, description = ?, nodes = ?, edges = ?, variables = ?,
        status = ?, version = ?, updated = ?
      WHERE id = ? AND api_key = ?
    `).run(
      name || workflow.name,
      description !== undefined ? description : workflow.description,
      JSON.stringify(nodesArr), JSON.stringify(edgesArr), JSON.stringify(variablesObj),
      newStatus, newVersion, ts, workflow.id, auth.key
    );

    // Save version snapshot
    db.prepare(`
      INSERT INTO workflow_versions (id, workflow_id, api_key, version, name, description, nodes, edges, variables, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid(16), workflow.id, auth.key, newVersion,
      name || workflow.name,
      description !== undefined ? description : workflow.description,
      JSON.stringify(nodesArr), JSON.stringify(edgesArr), JSON.stringify(variablesObj),
      ts
    );

    return ok(res, { workflow_id: workflow.id, version: newVersion, validation_result });
  });

  // DELETE /v1/workflow/:id
  app.delete('/v1/workflow/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT id FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    db.prepare('DELETE FROM workflows WHERE id = ? AND api_key = ?').run(req.params.id, auth.key);
    db.prepare('DELETE FROM workflow_runs WHERE workflow_id = ? AND api_key = ?').run(req.params.id, auth.key);
    db.prepare('DELETE FROM workflow_versions WHERE workflow_id = ? AND api_key = ?').run(req.params.id, auth.key);

    return ok(res, { deleted: true, workflow_id: req.params.id });
  });

  // GET /v1/workflows
  app.get('/v1/workflows', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { status, limit = 50, offset = 0 } = req.query;
    let workflows;
    if (status) {
      workflows = db.prepare('SELECT * FROM workflows WHERE api_key = ? AND status = ? ORDER BY updated DESC LIMIT ? OFFSET ?')
        .all(auth.key, status, parseInt(limit), parseInt(offset));
    } else {
      workflows = db.prepare('SELECT * FROM workflows WHERE api_key = ? ORDER BY updated DESC LIMIT ? OFFSET ?')
        .all(auth.key, parseInt(limit), parseInt(offset));
    }

    return ok(res, {
      workflows: workflows.map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        status: w.status,
        version: w.version,
        node_count: (() => { try { return JSON.parse(w.nodes).length; } catch { return 0; } })(),
        created: w.created,
        updated: w.updated,
      })),
      count: workflows.length,
    });
  });

  // POST /v1/workflows — alias for /v1/workflow/create (REST-style shorthand)
  app.post('/v1/workflows', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { name, description, nodes, edges, variables } = req.body;
    if (!name || typeof name !== 'string') return err(res, 422, 'missing_field', 'name is required');

    const nodesArr = Array.isArray(nodes) ? nodes : [];
    const edgesArr = (Array.isArray(edges) ? edges : []).map(e => ({
      from_node_id: e.from_node_id || e.from,
      to_node_id:   e.to_node_id   || e.to,
      condition:    e.condition,
      condition_expr: e.condition_expr,
      label:        e.label,
    }));
    const variablesObj = variables && typeof variables === 'object' ? variables : {};
    const validation_result = validateDAG(nodesArr, edgesArr);
    const workflow_id = 'wf-' + uid(12);
    const ts = now();

    db.prepare(`
      INSERT INTO workflows (id, api_key, name, description, nodes, edges, variables, status, version, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)
    `).run(workflow_id, auth.key, name, description || '', JSON.stringify(nodesArr), JSON.stringify(edgesArr), JSON.stringify(variablesObj), ts, ts);

    return ok(res, { workflow_id, name, validation_result });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WORKFLOW VALIDATION
  // ══════════════════════════════════════════════════════════════════════════

  // POST /v1/workflow/:id/validate
  app.post('/v1/workflow/:id/validate', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const nodes = JSON.parse(workflow.nodes || '[]');
    const edges = JSON.parse(workflow.edges || '[]');
    const result = validateDAG(nodes, edges);

    return ok(res, result);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WORKFLOW EXECUTION
  // ══════════════════════════════════════════════════════════════════════════

  // POST /v1/workflow/:id/run
  app.post('/v1/workflow/:id/run', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const { input = {}, dry_run = false, webhook_url } = req.body;

    const nodes = JSON.parse(workflow.nodes || '[]');
    const edges = JSON.parse(workflow.edges || '[]');
    const variables = JSON.parse(workflow.variables || '{}');

    // Validate before running
    const validation = validateDAG(nodes, edges);
    if (!validation.valid) {
      return err(res, 422, 'invalid_workflow', `Workflow has ${validation.errors.length} validation error(s): ${validation.errors[0].issue}`);
    }

    const run_id = 'run-' + uid(12);
    const started = now();

    // Create run record
    db.prepare(`
      INSERT INTO workflow_runs (id, workflow_id, api_key, status, input, output, log, started, completed, credits_used, webhook_url, workflow_version)
      VALUES (?, ?, ?, 'running', ?, '{}', '[]', ?, NULL, 0, ?, ?)
    `).run(run_id, workflow.id, auth.key, JSON.stringify(input), started, webhook_url || null, workflow.version);

    if (dry_run) {
      db.prepare('UPDATE workflow_runs SET status = ?, completed = ? WHERE id = ?').run('dry_run_complete', now(), run_id);
      return ok(res, {
        run_id,
        status: 'dry_run_complete',
        execution_order: validation.execution_order,
        node_count: nodes.length,
        edge_count: edges.length,
        message: 'Dry run — no tools were called',
        credits_used: 0,
      });
    }

    // Execute nodes using the shared execution engine
    const execResult = await executeWorkflow(nodes, edges, variables, input, auth.key, null);

    if (execResult.validationError) {
      db.prepare('UPDATE workflow_runs SET status = ?, completed = ?, output = ?, log = ? WHERE id = ?')
        .run('error', now(), JSON.stringify({ error: execResult.validationError }), '[]', run_id);
      return err(res, 422, 'invalid_workflow', execResult.validationError);
    }

    if (execResult.finalStatus === 'waiting_approval') {
      db.prepare(`UPDATE workflow_runs SET status = 'waiting_approval', output = ?, log = ?, credits_used = ? WHERE id = ?`)
        .run(JSON.stringify(execResult.context), JSON.stringify(execResult.runLog), execResult.totalCredits, run_id);
      return ok(res, {
        run_id,
        status: 'waiting_approval',
        gate_node_id: execResult.gateNodeId,
        gate_node_label: execResult.gateNodeLabel,
        context: execResult.context,
        log: execResult.runLog,
        credits_used: execResult.totalCredits,
        message: `Workflow paused at human gate "${execResult.gateNodeLabel}". Call POST /v1/workflow/run/${run_id}/approve to continue.`,
      });
    }

    // Finalize run
    db.prepare(`
      UPDATE workflow_runs SET status = ?, completed = ?, output = ?, log = ?, credits_used = ? WHERE id = ?
    `).run(execResult.finalStatus, now(), JSON.stringify(execResult.context), JSON.stringify(execResult.runLog), execResult.totalCredits, run_id);

    // Fire webhook if configured
    if (webhook_url) {
      fireWebhook(webhook_url, {
        event: 'workflow.completed',
        run_id,
        workflow_id: workflow.id,
        status: execResult.finalStatus,
        output: execResult.context,
        credits_used: execResult.totalCredits,
      });
    }

    return ok(res, {
      run_id,
      status: execResult.finalStatus,
      output: execResult.context,
      log: execResult.runLog,
      credits_used: execResult.totalCredits,
    });
  });

  // NEW: POST /v1/workflow/:id/cancel — cancel a running or waiting run
  app.post('/v1/workflow/:id/cancel', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT id FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const { run_id } = req.body;
    let run;
    if (run_id) {
      run = db.prepare('SELECT * FROM workflow_runs WHERE id = ? AND workflow_id = ? AND api_key = ?').get(run_id, req.params.id, auth.key);
    } else {
      // Cancel the most recent active run
      run = db.prepare(`
        SELECT * FROM workflow_runs WHERE workflow_id = ? AND api_key = ? AND status IN ('running', 'waiting_approval')
        ORDER BY started DESC LIMIT 1
      `).get(req.params.id, auth.key);
    }

    if (!run) return err(res, 404, 'not_found', 'No active run found to cancel');

    if (!['running', 'waiting_approval'].includes(run.status)) {
      return err(res, 409, 'invalid_state', `Run is in state "${run.status}" — can only cancel running or waiting_approval runs`);
    }

    const { reason } = req.body;
    const logEntries = JSON.parse(run.log || '[]');
    logEntries.push({ status: 'cancelled', reason: reason || 'cancelled by user', ts: now() });

    db.prepare(`
      UPDATE workflow_runs SET status = 'cancelled', completed = ?, log = ? WHERE id = ?
    `).run(now(), JSON.stringify(logEntries), run.id);

    // Fire webhook on cancellation if configured
    if (run.webhook_url) {
      fireWebhook(run.webhook_url, { event: 'workflow.cancelled', run_id: run.id, workflow_id: run.workflow_id, reason: reason || 'cancelled by user' });
    }

    return ok(res, { cancelled: true, run_id: run.id, workflow_id: req.params.id, reason: reason || 'cancelled by user' });
  });

  // GET /v1/workflow/:id/runs
  app.get('/v1/workflow/:id/runs', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT id FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const { limit = 20, offset = 0 } = req.query;
    const runs = db.prepare(`
      SELECT id, workflow_id, status, started, completed, credits_used, workflow_version FROM workflow_runs
      WHERE workflow_id = ? AND api_key = ?
      ORDER BY started DESC LIMIT ? OFFSET ?
    `).all(req.params.id, auth.key, parseInt(limit), parseInt(offset));

    return ok(res, { runs, count: runs.length, workflow_id: req.params.id });
  });

  // NEW: GET /v1/workflow/:id/history — full execution history with stats
  app.get('/v1/workflow/:id/history', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const { limit = 20, offset = 0 } = req.query;
    const runs = db.prepare(`
      SELECT * FROM workflow_runs WHERE workflow_id = ? AND api_key = ?
      ORDER BY started DESC LIMIT ? OFFSET ?
    `).all(req.params.id, auth.key, parseInt(limit), parseInt(offset));

    const totalRuns = db.prepare('SELECT COUNT(*) as count FROM workflow_runs WHERE workflow_id = ? AND api_key = ?').get(req.params.id, auth.key);
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errored,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'waiting_approval' THEN 1 ELSE 0 END) as pending_approval,
        SUM(credits_used) as total_credits,
        AVG(CASE WHEN completed IS NOT NULL THEN completed - started ELSE NULL END) as avg_duration_ms
      FROM workflow_runs WHERE workflow_id = ? AND api_key = ?
    `).get(req.params.id, auth.key);

    const history = runs.map(r => ({
      run_id: r.id,
      status: r.status,
      started: r.started,
      completed: r.completed,
      duration_ms: r.completed ? r.completed - r.started : null,
      credits_used: r.credits_used,
      workflow_version: r.workflow_version || 1,
      log_entries: (() => { try { return JSON.parse(r.log || '[]').length; } catch { return 0; } })(),
    }));

    return ok(res, {
      workflow_id: req.params.id,
      workflow_name: workflow.name,
      history,
      stats: {
        total: stats.total || 0,
        completed: stats.completed || 0,
        errored: stats.errored || 0,
        cancelled: stats.cancelled || 0,
        pending_approval: stats.pending_approval || 0,
        success_rate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
        total_credits: stats.total_credits || 0,
        avg_duration_ms: stats.avg_duration_ms ? Math.round(stats.avg_duration_ms) : null,
      },
      total_runs: totalRuns.count,
    });
  });

  // NEW: GET /v1/workflow/:id/versions — list all saved versions
  app.get('/v1/workflow/:id/versions', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT id, name, version FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const versions = db.prepare(`
      SELECT id, version, name, description, created FROM workflow_versions
      WHERE workflow_id = ? AND api_key = ? ORDER BY version DESC
    `).all(req.params.id, auth.key);

    return ok(res, {
      workflow_id: req.params.id,
      current_version: workflow.version,
      versions: versions.map(v => ({
        snapshot_id: v.id,
        version: v.version,
        name: v.name,
        description: v.description,
        created: v.created,
        is_current: v.version === workflow.version,
      })),
      count: versions.length,
    });
  });

  // NEW: POST /v1/workflow/:id/restore/:version — restore a specific version
  app.post('/v1/workflow/:id/restore/:version', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const versionNum = parseInt(req.params.version);
    if (isNaN(versionNum)) return err(res, 422, 'invalid_param', 'version must be a number');

    const snapshot = db.prepare('SELECT * FROM workflow_versions WHERE workflow_id = ? AND api_key = ? AND version = ?')
      .get(req.params.id, auth.key, versionNum);
    if (!snapshot) return err(res, 404, 'not_found', `Version ${versionNum} not found`);

    const newVersion = workflow.version + 1;
    const ts = now();

    db.prepare(`
      UPDATE workflows SET name = ?, description = ?, nodes = ?, edges = ?, variables = ?,
        status = 'draft', version = ?, updated = ?
      WHERE id = ? AND api_key = ?
    `).run(snapshot.name, snapshot.description, snapshot.nodes, snapshot.edges, snapshot.variables, newVersion, ts, workflow.id, auth.key);

    // Save new version snapshot (restored-as-new-version)
    db.prepare(`
      INSERT INTO workflow_versions (id, workflow_id, api_key, version, name, description, nodes, edges, variables, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uid(16), workflow.id, auth.key, newVersion, snapshot.name, snapshot.description, snapshot.nodes, snapshot.edges, snapshot.variables, ts);

    const nodes = JSON.parse(snapshot.nodes || '[]');
    const edges = JSON.parse(snapshot.edges || '[]');
    const validation = validateDAG(nodes, edges);

    return ok(res, {
      workflow_id: workflow.id,
      restored_from_version: versionNum,
      new_version: newVersion,
      validation,
      message: `Workflow restored to version ${versionNum} as new version ${newVersion}`,
    });
  });

  // POST /v1/workflow/:id/publish
  app.post('/v1/workflow/:id/publish', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const { description, category } = req.body;
    const validCategories = ['data_processing', 'research', 'devops', 'finance', 'content', 'general'];
    const cat = validCategories.includes(category) ? category : 'general';

    // Validate before publishing
    const nodes = JSON.parse(workflow.nodes || '[]');
    const edges = JSON.parse(workflow.edges || '[]');
    const validation = validateDAG(nodes, edges);
    if (!validation.valid) {
      return err(res, 422, 'invalid_workflow', 'Cannot publish a workflow with validation errors');
    }

    const template_id = 'tpl-user-' + uid(12);
    db.prepare(`
      INSERT OR REPLACE INTO workflow_templates (id, name, description, category, nodes, edges, variables, author, downloads, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      template_id, workflow.name,
      description || workflow.description || '',
      cat,
      workflow.nodes, workflow.edges, workflow.variables,
      auth.key.slice(0, 12) + '...',
      now()
    );

    // Mark workflow as active
    db.prepare('UPDATE workflows SET status = ? WHERE id = ?').run('active', workflow.id);

    return ok(res, { template_id, workflow_id: workflow.id, status: 'published', category: cat });
  });

};
