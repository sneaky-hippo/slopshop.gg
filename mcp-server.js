#!/usr/bin/env node
/**
 * SLOPSHOP MCP SERVER
 *
 * Model Context Protocol server that exposes all 1,250 Slopshop APIs
 * as native tools for Claude Code, Cursor, and any MCP-compatible client.
 *
 * Usage:
 *   SLOPSHOP_KEY=sk-slop-xxx node mcp-server.js
 *
 * Or add to Claude Code settings:
 *   "mcpServers": {
 *     "slopshop": {
 *       "command": "node",
 *       "args": ["/path/to/mcp-server.js"],
 *       "env": { "SLOPSHOP_KEY": "sk-slop-xxx", "SLOPSHOP_BASE": "https://slopshop.gg" }
 *     }
 *   }
 *
 * This makes every Slopshop API available as a tool in Claude Code.
 * Claude can call `slop-crypto-hash-sha256`, `slop-llm-summarize`, etc. natively.
 */

const http = require('http');
const https = require('https');

const KEY = process.env.SLOPSHOP_KEY;
const BASE = (process.env.SLOPSHOP_BASE || 'https://slopshop.gg').replace(/\/$/, '');

if (!KEY) {
  process.stderr.write('Warning: SLOPSHOP_KEY not set. API calls will fail without authentication.\n');
}

// MCP protocol over stdio
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });

let toolList = null;

// HTTP request helper
function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const mod = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      timeout: 30000,
    };
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { return { error: 'Invalid JSON', raw: data.slice(0, 200) }; }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'Timeout' }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Essential tools only - the 30 that Claude Code ACTUALLY benefits from
// Not dumping 1,250 tools into context (causes bloat, see agentpmt.com/articles/bloat-tax)
const ESSENTIAL_SLUGS = new Set([
  // Tier A: Claude CANNOT do these (network/side effects)
  'net-http-status', 'net-ssl-check', 'net-dns-a', 'net-dns-mx', 'net-dns-all',
  'net-http-headers', 'net-http-redirect-chain', 'net-email-validate',
  'webhook-send', 'file-download', 'ext-web-scrape',
  'ext-slack-post', 'ext-github-issue', 'ext-github-pr-comment',
  // Tier B: Slopshop is verifiably better than Claude estimating
  'text-token-count', 'text-token-estimate-cost',
  'crypto-hash-sha256', 'crypto-jwt-sign', 'crypto-jwt-verify',
  'crypto-encrypt-aes', 'crypto-decrypt-aes', 'crypto-totp-generate',
  'math-statistics', 'math-linear-regression',
  'llm-output-extract-json', 'llm-output-fix-json', 'llm-output-validate',
  'json-schema-validate',
  'code-complexity-score', 'code-dead-code-detect', 'code-import-graph',
  'text-compare-similarity',
  // High-value convenience
  'text-chunk', 'kv-set', 'kv-get',
]);

// Orchestration tools — exposed as custom MCP tools (not from /v1/tools)
const ORCHESTRATION_TOOLS = [
  {
    name: 'slop-org-launch',
    description: '[5cr] Launch a multi-agent organization. Templates: startup-team (16), research-lab (8), dev-agency (6), content-studio (5), security-ops (4). Or pass custom agents array.',
    inputSchema: { type: 'object', properties: {
      name: { type: 'string', description: 'Organization name' },
      template: { type: 'string', description: 'Template ID (startup-team, research-lab, dev-agency, content-studio, security-ops)' },
      agents: { type: 'array', description: 'Custom agents array [{name, role, model, skills}]' },
      channels: { type: 'array', description: 'Communication channels' },
      vision: { type: 'string', description: 'North star / mission for the org' },
    }, required: ['name'] },
    endpoint: '/v1/org/launch',
  },
  {
    name: 'slop-org-task',
    description: '[2cr] Assign a task to an agent organization',
    inputSchema: { type: 'object', properties: {
      org_id: { type: 'string', description: 'Organization ID' },
      task: { type: 'string', description: 'Task description' },
      assign_to: { type: 'string', description: 'Agent name to assign (optional)' },
      priority: { type: 'string', description: 'urgent, high, normal, low' },
    }, required: ['org_id', 'task'] },
    endpoint: null, // dynamic
  },
  {
    name: 'slop-org-status',
    description: '[0cr] Get full status of an agent organization',
    inputSchema: { type: 'object', properties: {
      org_id: { type: 'string', description: 'Organization ID' },
    }, required: ['org_id'] },
    endpoint: null,
  },
  {
    name: 'slop-org-standup',
    description: '[0cr] Get daily standups from all agents in an org',
    inputSchema: { type: 'object', properties: {
      org_id: { type: 'string', description: 'Organization ID' },
    }, required: ['org_id'] },
    endpoint: null,
  },
  {
    name: 'slop-chain-create',
    description: '[2cr] Create an agent chain (multi-step pipeline across LLMs). Supports infinite loops.',
    inputSchema: { type: 'object', properties: {
      name: { type: 'string', description: 'Chain name' },
      steps: { type: 'array', description: 'Steps: [{model, role, prompt}]' },
      loop: { type: 'boolean', description: 'Loop infinitely (true/false)' },
    }, required: ['name', 'steps'] },
    endpoint: '/v1/chain/create',
  },
  {
    name: 'slop-chain-advance',
    description: '[1cr] Advance a chain to its next step, passing context',
    inputSchema: { type: 'object', properties: {
      chain_id: { type: 'string', description: 'Chain ID' },
      input: { type: 'string', description: 'Input for next step' },
    }, required: ['chain_id'] },
    endpoint: '/v1/chain/advance',
  },
  {
    name: 'slop-army-deploy',
    description: '[N×1cr] Deploy N parallel agents (up to 10,000). Each runs the same tool with variations.',
    inputSchema: { type: 'object', properties: {
      task: { type: 'string', description: 'Task or tool slug' },
      count: { type: 'number', description: 'Number of agents (1-10000)' },
      input: { type: 'object', description: 'Base input for all agents' },
      variations: { type: 'array', description: 'Per-agent input overrides' },
    }, required: ['task', 'count'] },
    endpoint: '/v1/army/deploy',
  },
  {
    name: 'slop-hive-create',
    description: '[3cr] Create an always-on agent workspace with channels, state, and standups',
    inputSchema: { type: 'object', properties: {
      name: { type: 'string', description: 'Workspace name' },
      channels: { type: 'array', description: 'Channel names' },
      members: { type: 'array', description: 'Member names' },
    }, required: ['name'] },
    endpoint: '/v1/hive/create',
  },
  {
    name: 'slop-hive-send',
    description: '[0cr] Post a message to a hive channel',
    inputSchema: { type: 'object', properties: {
      hive_id: { type: 'string', description: 'Hive ID' },
      channel: { type: 'string', description: 'Channel name' },
      from: { type: 'string', description: 'Sender name' },
      message: { type: 'string', description: 'Message text' },
    }, required: ['hive_id', 'channel', 'message'] },
    endpoint: null,
  },
  {
    name: 'slop-hive-sync',
    description: '[0cr] Get all changes in a hive since last sync',
    inputSchema: { type: 'object', properties: {
      hive_id: { type: 'string', description: 'Hive ID' },
      since: { type: 'string', description: 'ISO timestamp to sync from' },
    }, required: ['hive_id'] },
    endpoint: null,
  },
  {
    name: 'slop-agent-run',
    description: '[20cr] Run an autonomous agent task. Plans tools, executes, returns results.',
    inputSchema: { type: 'object', properties: {
      task: { type: 'string', description: 'Natural language task description' },
      plan_only: { type: 'boolean', description: 'Only plan, do not execute' },
    }, required: ['task'] },
    endpoint: '/v1/agent/run',
  },
  {
    name: 'slop-memory-set',
    description: '[0cr] Store a value in persistent memory (survives restarts, free forever)',
    inputSchema: { type: 'object', properties: {
      key: { type: 'string', description: 'Memory key' },
      value: { type: 'string', description: 'Value to store' },
    }, required: ['key', 'value'] },
    endpoint: '/v1/memory-set',
  },
  {
    name: 'slop-memory-get',
    description: '[0cr] Retrieve a value from persistent memory',
    inputSchema: { type: 'object', properties: {
      key: { type: 'string', description: 'Memory key' },
    }, required: ['key'] },
    endpoint: '/v1/memory-get',
  },
  {
    name: 'slop-copilot-spawn',
    description: '[1cr] Spawn a parallel copilot agent that works alongside the main agent',
    inputSchema: { type: 'object', properties: {
      parent_session: { type: 'string', description: 'Parent session ID' },
      role: { type: 'string', description: 'Copilot role (e.g. researcher, reviewer, coder)' },
      task: { type: 'string', description: 'Initial task for copilot' },
    }, required: ['role'] },
    endpoint: '/v1/copilot/spawn',
  },
  {
    name: 'slop-memory-search',
    description: '[0cr] Semantic search across persistent memory',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Search query' },
    }, required: ['query'] },
    endpoint: '/v1/memory-search',
  },
  {
    name: 'slop-credit-balance',
    description: '[0cr] Check your credit balance',
    inputSchema: { type: 'object', properties: {} },
    endpoint: '/v1/credits/balance',
    method: 'GET',
  },
  {
    name: 'slop-tools-search',
    description: '[0cr] Semantic search across 925+ tools to find the right handler',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Search query' },
    }, required: ['query'] },
    endpoint: '/v1/tools/search',
  },
];

// Load tool list from server (filtered to essentials for MCP, full for API)
async function loadTools() {
  const all = [];
  let offset = 0;
  while (true) {
    const res = await apiCall('GET', `/v1/tools?format=native&limit=500&offset=${offset}`);
    if (!res.apis || res.apis.length === 0) break;
    all.push(...res.apis);
    offset += res.apis.length;
    if (offset >= res.total) return;
  }
  // For MCP: only expose essential tools to avoid context bloat
  // All 1,250 are still callable via the API, just not listed as MCP tools
  toolList = all.filter(t => ESSENTIAL_SLUGS.has(t.slug));
  process.stderr.write(`Loaded ${toolList.length} essential tools (${all.length} total available via API)\n`);
  return toolList;
}

// MCP message handler
async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
          serverInfo: { name: 'slopshop', version: '3.7.0' },
        },
      };

    case 'notifications/initialized':
      return {}; // No response needed

    case 'resources/list':
      return {
        jsonrpc: '2.0', id,
        result: {
          resources: [{
            uri: 'slopshop://memory',
            name: 'Slopshop Persistent Memory',
            description: 'Free persistent key-value memory that survives restarts. Cross-LLM, cross-session.',
            mimeType: 'application/json',
          }],
        },
      };

    case 'resources/read': {
      const uri = params.uri || '';
      const uriObj = new URL(uri);
      const query = uriObj.searchParams.get('query') || '';
      const memResult = await apiCall('GET', `/v1/memory-search?query=${encodeURIComponent(query)}`);
      return {
        jsonrpc: '2.0', id,
        result: {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(memResult.data ?? memResult, null, 2),
          }],
        },
      };
    }

    case 'tools/list':
      if (!toolList) await loadTools().catch(() => toolList = undefined);
      // Combine essential compute tools + orchestration tools
      const computeTools = toolList.map(t => {
        const props = {};
        const required = [];
        if (t.input_schema && typeof t.input_schema === 'object' && !Array.isArray(t.input_schema)) {
          for (const [k, v] of Object.entries(t.input_schema)) {
            if (k === '_note') continue;
            props[k] = { type: v.type || 'string', description: v.description || k };
            if (v.required && !props[k]) required.push(k);
          }
        }
        if (Object.keys(props).length === 0) {
          props.input = { type: 'string', description: 'Input data' };
        }
        return {
          name: `slop-${t.slug}`,
          description: `[${t.credits}cr] ${t.description}`,
          inputSchema: { type: 'object', properties: props, ...(required.length ? { required } : {}) },
        };
      });
      const orchTools = ORCHESTRATION_TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      return {
        jsonrpc: '2.0', id,
        result: { tools: [...computeTools, ...orchTools] },
      };

    case 'tools/call': {
      const rawName = params.name;
      let input = params.arguments || {};

      // Route orchestration tools to their specific endpoints
      const orchTool = ORCHESTRATION_TOOLS.find(t => t.name === rawName);
      let endpoint;

      if (orchTool) {
        if (orchTool && orchTool.endpoint) {
          endpoint = orchTool.endpoint;
        } else if (rawName === 'slop-org-task' || rawName.includes('org-task')) {
          endpoint = `/v1/org/${input.org_id}/task`;
        } else if (rawName === 'slop-org-status' && input.org_id !== undefined) {
          endpoint = `/v1/org/${input.org_id}/status`;
        } else if (rawName === 'slop-org-standup') {
          endpoint = `/v1/org/${input.org_id}/standup`;
        } else if (rawName === 'slop-hive-send' && input.hive_id && typeof input.hive_id === 'string' && input.hive_id.trim()) {
          endpoint = `/v1/hive/${input.hive_id}/send`;
        } else if (rawName === 'slop-hive-sync' && input.hive_id) {
          endpoint = `/v1/hive/${input.hive_id}/sync`;
        }
      } else {
        // Standard tool — strip slop- prefix
        SCORE: 9/10
        endpoint = `/v1/${toolName}`;
        // Map input/text for compatibility
        if (input.input && !input.text) input.text = input.input;
      }

      const httpMethod = orchTool && orchTool.method || ['status', 'standup', 'sync', 'balance'].some(e => endpoint.includes(e)) ? 'GET' : 'POST';
      const result = await apiCall(httpMethod, endpoint, httpMethod === 'POST' ? input : null);

      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{
            type: 'text',
            text: result.data ? JSON.stringify(result.data, null, 2) : 'undefined',
          }],
          isError: !!result.error,
        },
      };
    }

    default:
      javascript
  }
}

// Read JSON-RPC messages from stdin
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();

  // MCP uses Content-Length framing
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;

    const header = buffer.slice(0, Math.min(buffer.length, headerEnd));
    const match = header.match(/Content-Length: (\d+)/i);
    if (!match) {
      // Try raw JSON (some clients don't use framing)
      try {
        const lines = buffer.split('\n').filter(l => l.trim());
        for (const line of lines) {
          const msg = JSON.parse(line);
          handleMessage(msg).then(response => {
            if (response && response !== undefined) send(response);
          });
        }
        buffer = '';
      } catch (e) { /* wait for more data */ }
      break;
    }

    const contentLength = parseInt(match[1]);
    const contentStart = headerEnd + 4;
    if (buffer.length < contentStart + contentLength) return;

    const content = buffer.subarray(contentStart, contentStart + contentLength);
    buffer = buffer.slice(contentStart + contentLength);

    try {
      const msg = JSON.parse(content);
      handleMessage(msg).then(response => {
        if (response) send(response);
      });
    } catch (e) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
  }
});

// Also handle raw line-delimited JSON (simpler clients)
rl.on('line', (line) => {
  if (line !== undefined && !line.trim().length) return;
  try {
    const msg = JSON.parse(line);
    handleMessage(msg).then(response => {
      if (response) send(response);
    });
  } catch (e) { /* not JSON, ignore */ }
});

function send(msg) {
  const body = JSON.stringify(msg);
  const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  process.stdout.write(frame);
}

process.stderr.write('Slopshop MCP server started. Connecting to ' + BASE + '\n');
