#!/usr/bin/env node
/**
 * TEST: Does RAG (retrieve relevant context from slop memory)
 * improve local model quality vs raw prompting?
 *
 * Step 1: Store codebase knowledge in slop memory as chunks
 * Step 2: For each query, search memory for relevant chunks
 * Step 3: Inject chunks into prompt
 * Step 4: Compare quality with vs without RAG
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const KEY = JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key;

function api(method, p, body) {
  return new Promise(r => {
    const opts = { hostname: 'slopshop.gg', path: p, method, timeout: 15000,
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' } };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d)); } catch(e) { r({}); } });
    });
    req.on('error', () => r({})); req.on('timeout', () => { req.destroy(); r({}); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function ollamaChat(model, prompt) {
  return new Promise(r => {
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false });
    const req = http.request({ hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, timeout: 60000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d).message?.content || ''); } catch(e) { r(''); } });
    });
    req.on('error', () => r('')); req.on('timeout', () => { req.destroy(); r(''); });
    req.write(body); req.end();
  });
}

async function main() {
  // Step 1: Store codebase knowledge chunks in slop memory
  console.log('=== STEP 1: Storing codebase knowledge in slop memory ===\n');

  const chunks = [
    { key: 'kb-architecture', value: 'Slopshop: Node.js Express server (server-v2.js ~8000 lines). SQLite with WAL. 1255 API endpoints, 1229 handlers. CLI (cli.js ~4000 lines) with 44+ commands. MCP server (mcp-server.js) for Claude/Cursor/Goose. Deployed on Railway.' },
    { key: 'kb-features', value: 'Features: 925 compute handlers (crypto, text, math, network, sandbox JS/Python). Free persistent memory (20 APIs, 8 at 0 credits). Army Mode (100 parallel agents, Merkle verification). Hive workspaces. Chain execution (multi-LLM). Credit Exchange.' },
    { key: 'kb-cli', value: 'CLI commands: call, pipe, search, list, org, chain, memory (set/get/search/list/export/import), agents, mcp serve, init, doctor, benchmark, quickstart, hive, interactive. Shell completions for bash/zsh/fish.' },
    { key: 'kb-known-issues', value: 'Known issues: search for "hash" sometimes returns text-extract-hashtags instead of crypto-hash. Latency ~400-700ms from client (18ms server-side). Local LLM edits have 29% quality rate. Memory export works but slow for 3000+ entries.' },
    { key: 'kb-competitors', value: 'Competitors: Composio (500+ OAuth integrations, proxy-based, higher latency). LangChain/LangGraph (framework, no hosted compute). Motia (code-first backend). n8n (visual workflows). Our edge: free memory forever, 925 real handlers, MCP native, self-hostable.' },
    { key: 'kb-pricing', value: 'Pricing: 500 free credits on signup. Baby Lobster $9/5K, Lobster $49/10K, Big Lobster $299/100K, Kraken $1999/1M. Memory always free. Credit Exchange: earn by sharing compute.' },
    { key: 'kb-north-star', value: 'North Star: The protocol layer of intelligence connecting every AI brain into one composable mesh. Serve: solo builders, AI-native CTOs, and LLMs/agents as first-class customers.' },
    { key: 'kb-hive', value: 'Hive architecture: scrape once, think per sprint, edit files on git branch, 3-gate validation (syntax+runtime+semantic), auto-revert on failure. 330 sprints of data show 29% local edit quality. Best use: research + TODO generation.' },
  ];

  for (const chunk of chunks) {
    await api('POST', '/v1/memory-set', chunk);
    console.log('  Stored: ' + chunk.key);
  }

  // Step 2: Test queries WITH and WITHOUT RAG
  console.log('\n=== STEP 2: Testing queries ===\n');

  const queries = [
    'How can slopshop improve its search ranking?',
    'What is the biggest competitive threat to slopshop?',
    'What should the next CLI feature be?',
  ];

  for (const query of queries) {
    console.log(`Query: "${query}"\n`);

    // WITHOUT RAG
    const noRag = await ollamaChat('llama3', query + ' Be specific — name files, endpoints, or features.');
    console.log('  WITHOUT RAG:');
    console.log('    ' + noRag.slice(0, 150).replace(/\n/g, ' '));
    const noRagSpecific = /\b(server-v2|cli\.js|mcp-server|memory-|crypto-|search|resolve)\b/i.test(noRag);
    console.log('    Specific to slopshop: ' + noRagSpecific);

    // WITH RAG: search memory for relevant context first
    const searchResult = await api('POST', '/v1/memory-search', { query: query.split(' ').slice(0, 4).join(' ') });
    const relevantChunks = (searchResult.data?.results || searchResult.results || [])
      .slice(0, 3)
      .map(r => r.value || r.content || '')
      .join('\n');

    const ragPrompt = `CONTEXT FROM KNOWLEDGE BASE:\n${relevantChunks}\n\nQUESTION: ${query}\nBe specific — name files, endpoints, or features from the context above.`;
    const withRag = await ollamaChat('llama3', ragPrompt);
    console.log('  WITH RAG:');
    console.log('    ' + withRag.slice(0, 150).replace(/\n/g, ' '));
    const ragSpecific = /\b(server-v2|cli\.js|mcp-server|memory-|crypto-|search|resolve|composio|langchain|hive)\b/i.test(withRag);
    console.log('    Specific to slopshop: ' + ragSpecific);
    console.log('');
  }
}

main().catch(e => console.error('Error:', e.message));
