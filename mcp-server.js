/**
 * SLOPSHOP MCP SERVER
 *
 * Model Context Protocol server that exposes all 1,248 Slopshop APIs
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
        catch (e) { resolve({ error: 'Invalid JSON', raw: data.slice(0, 200) }); }
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'Timeout' }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Essential tools only - the 30 that Claude Code ACTUALLY benefits from
// Not dumping 1,248 tools into context (causes bloat, see agentpmt.com/articles/bloat-tax)
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

// Load tool list from server (filtered to essentials for MCP, full for API)
async function loadTools() {
  const all = [];
  let offset = 0;
  while (true) {
    const res = await apiCall('GET', `/v1/tools?format=native&limit=500&offset=${offset}`);
    if (!res.apis || res.apis.length === 0) break;
    all.push(...res.apis);
    offset += res.apis.length;
    if (offset >= res.total) break;
  }
  // For MCP: only expose essential tools to avoid context bloat
  // All 1,248 are still callable via the API, just not listed as MCP tools
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
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'slopshop', version: '3.0.0' },
        },
      };

    case 'notifications/initialized':
      return null; // No response needed

    case 'tools/list':
      if (!toolList) await loadTools();
      return {
        jsonrpc: '2.0', id,
        result: {
          tools: toolList.map(t => {
            // Build real input schema from the tool's schema
            const props = {};
            const required = [];
            if (t.input_schema && typeof t.input_schema === 'object') {
              for (const [k, v] of Object.entries(t.input_schema)) {
                if (k === '_note') continue;
                props[k] = { type: v.type || 'string', description: v.description || k };
                if (v.required) required.push(k);
              }
            }
            if (Object.keys(props).length === 0) {
              props.input = { type: 'string', description: 'Input data' };
            }
            return {
              name: `slop-${t.slug}`,
              description: `[${t.credits}cr] ${t.description}`,
              inputSchema: {
                type: 'object',
                properties: props,
                ...(required.length ? { required } : {}),
              },
            };
          }),
        },
      };

    case 'tools/call': {
      const toolName = params.name.replace(/^slop-/, '');
      let input = {};

      // Parse input from MCP arguments
      if (params.arguments) {
        if (params.arguments.data) {
          try { input = JSON.parse(params.arguments.data); }
          catch (e) { input.data = params.arguments.data; }
        }
        if (params.arguments.input) {
          input.input = params.arguments.input;
          input.text = params.arguments.input;
        }
        // Copy any other args
        for (const [k, v] of Object.entries(params.arguments)) {
          if (k !== 'input' && k !== 'data') input[k] = v;
        }
      }

      const result = await apiCall('POST', `/v1/${toolName}`, input);

      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify(result.data || result, null, 2),
          }],
          isError: !!result.error,
        },
      };
    }

    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } };
  }
}

// Read JSON-RPC messages from stdin
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();

  // MCP uses Content-Length framing
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length: (\d+)/i);
    if (!match) {
      // Try raw JSON (some clients don't use framing)
      try {
        const lines = buffer.split('\n').filter(l => l.trim());
        for (const line of lines) {
          const msg = JSON.parse(line);
          handleMessage(msg).then(response => {
            if (response) send(response);
          });
        }
        buffer = '';
      } catch (e) { /* wait for more data */ }
      break;
    }

    const contentLength = parseInt(match[1]);
    const contentStart = headerEnd + 4;
    if (buffer.length < contentStart + contentLength) break;

    const content = buffer.slice(contentStart, contentStart + contentLength);
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
  if (!line.trim()) return;
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
