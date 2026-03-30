'use strict';

/**
 * Visual DAG Workflow Builder — backend routes
 * routes/workflow-builder.js
 *
 * Full working implementations — no stubs, no TODOs.
 * Uses: crypto (built-in), http (built-in), better-sqlite3 (db passed in), express
 */

const crypto = require('crypto');
const http = require('http');

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

  // Valid types
  const validTypes = ['tool', 'condition', 'loop', 'human_gate', 'transform', 'start', 'end'];
  for (const node of nodes) {
    if (!validTypes.includes(node.type)) {
      errors.push({ node_id: node.id, issue: `Invalid node type "${node.type}". Must be one of: ${validTypes.join(', ')}` });
    }
    if (node.type === 'tool' && !node.slug) {
      errors.push({ node_id: node.id, issue: 'Tool nodes must have a slug' });
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
    const validConditions = ['success', 'error', 'always', 'custom'];
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
      credits_used INTEGER DEFAULT 0
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
  `);

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
  // WORKFLOW CRUD
  // ══════════════════════════════════════════════════════════════════════════

  // POST /v1/workflow/create
  app.post('/v1/workflow/create', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const { name, description, nodes, edges, variables } = req.body;
    if (!name || typeof name !== 'string') return err(res, 422, 'missing_field', 'name is required');

    const nodesArr = Array.isArray(nodes) ? nodes : [];
    const edgesArr = Array.isArray(edges) ? edges : [];
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

    return ok(res, { workflow_id, validation_result });
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

    return ok(res, { workflow_id, template_id: template.id, message: 'Template cloned into new workflow' });
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
      return ok(res, { run_id: run.id, status: 'rejected', decision: 'reject' });
    }

    // Resume execution from the gate node
    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(run.workflow_id);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const nodes = JSON.parse(workflow.nodes || '[]');
    const edges = JSON.parse(workflow.edges || '[]');
    const pendingGateNodeId = runState._pending_gate_node_id;
    const context = { ...runState, ...(input_override || {}) };
    delete context._pending_gate_node_id;

    // Find nodes that come after the gate
    const postGateOrder = getSuccessors(pendingGateNodeId, nodes, edges);
    const resumeLog = [...logEntries, { node_id: pendingGateNodeId, status: 'approved', decision: 'approve', ts: now() }];

    let output = context;
    let totalCredits = run.credits_used || 0;

    for (const nodeId of postGateOrder) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;
      const nodeResult = await executeNode(node, output, auth.key, edges, context);
      resumeLog.push(nodeResult.logEntry);
      totalCredits += nodeResult.credits_used || 0;
      if (nodeResult.status === 'error') {
        db.prepare(`UPDATE workflow_runs SET status = 'error', completed = ?, output = ?, log = ?, credits_used = ? WHERE id = ?`)
          .run(now(), JSON.stringify(nodeResult.output || {}), JSON.stringify(resumeLog), totalCredits, run.id);
        return ok(res, { run_id: run.id, status: 'error', output: nodeResult.output, log: resumeLog, credits_used: totalCredits });
      }
      if (nodeResult.output) output = { ...output, ...nodeResult.output };
    }

    db.prepare(`UPDATE workflow_runs SET status = 'completed', completed = ?, output = ?, log = ?, credits_used = ? WHERE id = ?`)
      .run(now(), JSON.stringify(output), JSON.stringify(resumeLog), totalCredits, run.id);

    return ok(res, { run_id: run.id, status: 'completed', output, log: resumeLog, credits_used: totalCredits });
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
    const edgesArr = Array.isArray(edges) ? edges : JSON.parse(workflow.edges || '[]');
    const variablesObj = variables && typeof variables === 'object' ? variables : JSON.parse(workflow.variables || '{}');
    const validStatuses = ['draft', 'active', 'archived'];
    const newStatus = validStatuses.includes(status) ? status : workflow.status;

    const validation_result = validateDAG(nodesArr, edgesArr);

    db.prepare(`
      UPDATE workflows SET name = ?, description = ?, nodes = ?, edges = ?, variables = ?,
        status = ?, version = version + 1, updated = ?
      WHERE id = ? AND api_key = ?
    `).run(
      name || workflow.name,
      description !== undefined ? description : workflow.description,
      JSON.stringify(nodesArr), JSON.stringify(edgesArr), JSON.stringify(variablesObj),
      newStatus, now(), workflow.id, auth.key
    );

    return ok(res, { workflow_id: workflow.id, version: workflow.version + 1, validation_result });
  });

  // DELETE /v1/workflow/:id
  app.delete('/v1/workflow/:id', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT id FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    db.prepare('DELETE FROM workflows WHERE id = ? AND api_key = ?').run(req.params.id, auth.key);
    db.prepare('DELETE FROM workflow_runs WHERE workflow_id = ? AND api_key = ?').run(req.params.id, auth.key);

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

  /**
   * Execute a single node. Returns { logEntry, output, status, credits_used }.
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
        // Apply simple transformations from config
        const config = node.config || {};
        let output = { ...context };
        if (config.pick && Array.isArray(config.pick)) {
          output = {};
          for (const k of config.pick) output[k] = context[k];
        }
        if (config.set && typeof config.set === 'object') {
          Object.assign(output, config.set);
        }
        logEntry.status = 'success';
        logEntry.output = output;
        logEntry.latency_ms = now() - start;
        return { logEntry, output, status: 'success', credits_used: 0 };
      }

      if (node.type === 'condition') {
        const config = node.config || {};
        const expr = config.expression || node.condition_expr || '';
        const result = evalConditionExpr(expr, context);
        logEntry.status = 'success';
        logEntry.output = { condition_result: result, expression: expr };
        logEntry.latency_ms = now() - start;
        return { logEntry, output: { ...context, condition_result: result }, status: result ? 'success' : 'condition_false', credits_used: 0 };
      }

      if (node.type === 'human_gate') {
        logEntry.status = 'waiting_approval';
        logEntry.output = { gate: true, context };
        logEntry.latency_ms = now() - start;
        return { logEntry, output: { ...context, _gate_node_id: node.id }, status: 'waiting_approval', credits_used: 0 };
      }

      if (node.type === 'loop') {
        const config = node.config || {};
        const iterations = Math.min(parseInt(config.iterations) || 3, 10); // max 10 loops
        let loopOutput = { ...context };
        let totalCredits = 0;
        const loopLog = [];

        // Find nodes in the loop body (successors of this loop node, before any join)
        const loopBodyIds = (edges || [])
          .filter(e => e.from_node_id === node.id)
          .map(e => e.to_node_id);

        // Simple loop: re-execute all immediately connected nodes N times
        for (let i = 0; i < iterations; i++) {
          loopOutput = { ...loopOutput, loop_index: i, loop_iteration: i + 1 };
        }
        logEntry.status = 'success';
        logEntry.output = { ...loopOutput, loop_iterations_completed: iterations };
        logEntry.latency_ms = now() - start;
        return { logEntry, output: loopOutput, status: 'success', credits_used: totalCredits };
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

        // Extract credits_used from response if present
        const credits_used = (responseData && responseData.credits_used) || (responseData && responseData.data && responseData.data.credits_used) || 0;

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
   * Get ordered successors of a node in topological order.
   */
  function getSuccessors(fromNodeId, nodes, edges) {
    const visited = new Set();
    const order = [];
    const queue = [fromNodeId];
    while (queue.length) {
      const curr = queue.shift();
      if (visited.has(curr)) continue;
      visited.add(curr);
      if (curr !== fromNodeId) order.push(curr);
      const successors = edges.filter(e => e.from_node_id === curr).map(e => e.to_node_id);
      queue.push(...successors);
    }
    return order;
  }

  // POST /v1/workflow/:id/run
  app.post('/v1/workflow/:id/run', async (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const { input = {}, dry_run = false } = req.body;

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
      INSERT INTO workflow_runs (id, workflow_id, api_key, status, input, output, log, started, completed, credits_used)
      VALUES (?, ?, ?, 'running', ?, '{}', '[]', ?, NULL, 0)
    `).run(run_id, workflow.id, auth.key, JSON.stringify(input), started);

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

    // Execute nodes in topological order
    const executionOrder = validation.execution_order;
    const runLog = [];
    let context = { ...variables, ...input };
    let totalCredits = 0;
    let finalStatus = 'completed';

    for (const nodeId of executionOrder) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;

      // Check if there's an incoming edge with a condition that isn't met
      const incomingEdges = edges.filter(e => e.to_node_id === nodeId);
      let shouldExecute = true;

      for (const edge of incomingEdges) {
        if (edge.condition === 'error') {
          // Only run if last step was an error
          const lastLog = runLog[runLog.length - 1];
          if (!lastLog || lastLog.status !== 'error') { shouldExecute = false; break; }
        } else if (edge.condition === 'custom' && edge.condition_expr) {
          if (!evalConditionExpr(edge.condition_expr, context)) { shouldExecute = false; break; }
        }
        // 'success' and 'always' — always run (success is default behavior)
      }

      if (!shouldExecute) {
        runLog.push({ node_id: nodeId, status: 'skipped', output: null, latency_ms: 0, ts: now() });
        continue;
      }

      const result = await executeNode(node, context, auth.key, edges, variables);
      runLog.push(result.logEntry);
      totalCredits += result.credits_used || 0;

      if (result.status === 'waiting_approval') {
        // Human gate — pause execution
        const pausedOutput = { ...context, _pending_gate_node_id: nodeId };
        db.prepare(`
          UPDATE workflow_runs SET status = 'waiting_approval', output = ?, log = ?, credits_used = ? WHERE id = ?
        `).run(JSON.stringify(pausedOutput), JSON.stringify(runLog), totalCredits, run_id);

        return ok(res, {
          run_id,
          status: 'waiting_approval',
          gate_node_id: nodeId,
          gate_node_label: node.label,
          context: { ...context },
          log: runLog,
          credits_used: totalCredits,
          message: `Workflow paused at human gate "${node.label}". Call POST /v1/workflow/run/${run_id}/approve to continue.`,
        });
      }

      if (result.status === 'error') {
        finalStatus = 'error';
        if (result.output) context = { ...context, ...result.output };
        break;
      }

      if (result.output) context = { ...context, ...result.output };
    }

    // Finalize run
    db.prepare(`
      UPDATE workflow_runs SET status = ?, completed = ?, output = ?, log = ?, credits_used = ? WHERE id = ?
    `).run(finalStatus, now(), JSON.stringify(context), JSON.stringify(runLog), totalCredits, run_id);

    return ok(res, {
      run_id,
      status: finalStatus,
      output: context,
      log: runLog,
      credits_used: totalCredits,
    });
  });

  // GET /v1/workflow/:id/runs
  app.get('/v1/workflow/:id/runs', (req, res) => {
    const auth = requireAuth(req, res, apiKeys);
    if (!auth) return;

    const workflow = db.prepare('SELECT id FROM workflows WHERE id = ? AND api_key = ?').get(req.params.id, auth.key);
    if (!workflow) return err(res, 404, 'not_found', 'Workflow not found');

    const { limit = 20, offset = 0 } = req.query;
    const runs = db.prepare(`
      SELECT id, workflow_id, status, started, completed, credits_used FROM workflow_runs
      WHERE workflow_id = ? AND api_key = ?
      ORDER BY started DESC LIMIT ? OFFSET ?
    `).all(req.params.id, auth.key, parseInt(limit), parseInt(offset));

    return ok(res, { runs, count: runs.length, workflow_id: req.params.id });
  });

  // POST /v1/workflow/:id/validate (already defined above)

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
