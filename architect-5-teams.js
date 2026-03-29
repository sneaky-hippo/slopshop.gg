#!/usr/bin/env node
/**
 * 5 PARALLEL ARCHITECT TEAMS
 * Each gets a different angle. All run simultaneously on local models.
 * Results aggregated at the end for Claude CLI discussion.
 */
const http = require('http');
const fs = require('fs');

function ollamaChat(model, prompt) {
  return new Promise(r => {
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false });
    const req = http.request({ hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, timeout: 120000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d).message?.content || ''); } catch(e) { r(''); } });
    });
    req.on('error', () => r('')); req.on('timeout', () => { req.destroy(); r(''); });
    req.write(body); req.end();
  });
}

const PROBLEM = `We have a codebase (500K tokens across 20 files). Local LLMs have 4K-8K context windows. We need local models to "know" the codebase well enough to suggest specific improvements (name exact files, functions, line numbers).

Current approach: inject 500 chars of code into prompt. Result: 29% quality.
Goal: 90%+ quality from local models on codebase-specific questions.

The codebase is a Node.js API platform with: server-v2.js (8000 lines), cli.js (4000 lines), mcp-server.js (400 lines), agent.js (500 lines). It has 1255 API endpoints, persistent memory, and a CLI with 44 commands.`;

const teams = [
  { model: 'llama3', name: 'COMPRESSION', prompt: PROBLEM + `\n\nYou are a context compression architect. Design a system that compresses 500K tokens of codebase into a 2K token "cheat sheet" that a small model can use. The cheat sheet must contain: file names + line counts, function signatures, known bugs, key patterns, API endpoints. How do you build this? How do you update it when code changes? Output a specific technical design.` },
  { model: 'mistral', name: 'ROUTING', prompt: PROBLEM + `\n\nYou are a query routing architect. Design a system that, given a natural language question like "how can we improve search?", retrieves the EXACT 500 tokens from the codebase that are most relevant. Not semantic search — actual code retrieval. How do you index the codebase? How do you match queries to code sections? How fast must it be? Output a specific technical design.` },
  { model: 'deepseek-coder-v2', name: 'STORAGE', prompt: PROBLEM + `\n\nYou are a knowledge storage architect. Design a local database that stores codebase knowledge in chunks optimized for 4K context injection. What chunk size? What metadata per chunk? How do you handle cross-file dependencies? How do you rank chunks by relevance? Output a specific technical design with data structures.` },
  { model: 'llama3', name: 'SYNC', prompt: PROBLEM + `\n\nYou are a data synchronization architect. The codebase changes constantly (10-50 commits per day). How do you keep the local knowledge base updated? Do you re-index everything or detect diffs? How do you handle renamed functions? How do you know when knowledge is stale? Output a specific technical design.` },
  { model: 'mistral', name: 'EVALUATION', prompt: PROBLEM + `\n\nYou are a quality evaluation architect. Design a test suite that measures whether a local LLM "knows" the codebase. The test has 20 questions like "what file handles search?" (answer: server-v2.js), "what's the API for UUID?" (answer: crypto-uuid), "what's broken about hash search?" (answer: returns hashtags not hashes). How do you score it? What's the pass threshold? Output a specific test design.` },
];

async function main() {
  console.log('=== 5 PARALLEL ARCHITECT TEAMS ===\n');
  console.log('Running all 5 simultaneously on local models...\n');

  // Run all 5 in parallel
  const results = await Promise.all(teams.map(async t => {
    const start = Date.now();
    console.log(`  [${t.name}] Starting on ${t.model}...`);
    const resp = await ollamaChat(t.model, t.prompt);
    const ms = Date.now() - start;
    console.log(`  [${t.name}] Done in ${Math.round(ms/1000)}s (${resp.length} chars)`);
    return { ...t, response: resp, ms };
  }));

  // Aggregate
  console.log('\n=== TEAM REPORTS ===\n');
  for (const r of results) {
    console.log(`--- ${r.name} (${r.model}, ${Math.round(r.ms/1000)}s) ---`);
    console.log(r.response.slice(0, 500));
    console.log('...\n');
  }

  // Save to file for Claude discussion
  const report = results.map(r => `## ${r.name} (${r.model})\n${r.response}\n`).join('\n---\n\n');
  fs.writeFileSync('.internal/architect-report.md', `# 5-Team Architecture Report\n\nProblem: Local LLMs (4-8GB) need to "know" a 500K token codebase.\nGoal: 90%+ quality on codebase-specific questions.\n\n${report}`);
  console.log('Full report saved to .internal/architect-report.md');
  console.log('Discuss with: "review the architect report and synthesize the best approach"');
}

main().catch(e => console.error('Error:', e.message));
