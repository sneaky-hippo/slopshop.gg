#!/usr/bin/env node
/**
 * THESIS TEST: Does codebase context improve local LLM output quality?
 * Runs same prompt with and without context across all 3 local models.
 * Scores: specificity (names real files/endpoints), actionability (could implement), accuracy (correct about codebase)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

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

// Build codebase context
const readme = fs.readFileSync('README.md', 'utf8').slice(0, 800);
const northStar = fs.readFileSync('NORTH-STAR.md', 'utf8').slice(0, 400);
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const files = fs.readdirSync('.').filter(f => f.endsWith('.js') || f.endsWith('.html')).slice(0, 20);
const cliHelp = fs.readFileSync('cli.js', 'utf8').split('\n').slice(0, 50).join('\n');
const serverSample = fs.readFileSync('server-v2.js', 'utf8').split('\n').slice(820, 850).join('\n');

const context = `
CODEBASE CONTEXT:
Name: ${pkg.name} v${pkg.version}
Description: ${pkg.description}
Files: ${files.join(', ')}
README excerpt: ${readme.slice(0, 300)}
North Star: ${northStar.slice(0, 200)}
CLI commands: call, pipe, search, list, org, chain, memory, hive, agents, mcp serve, init, doctor, benchmark, quickstart
Server sample (health endpoint area): ${serverSample.slice(0, 300)}
Known issues from testing: search for "hash" sometimes returns wrong result, latency ~400ms from client, memory export needs testing
`;

const basePrompt = 'Suggest ONE specific improvement for slopshop.gg that would make the biggest impact. Name the exact file, function, or endpoint to change. Be specific enough that a developer could implement it in 30 minutes.';

async function main() {
  const models = ['llama3', 'mistral', 'deepseek-coder-v2'];

  console.log('=== TEST A: NO CONTEXT ===\n');
  for (const m of models) {
    const resp = await ollamaChat(m, basePrompt);
    const hasFile = /\b(server|cli|agent|mcp|index|auth)\.(js|html)\b/i.test(resp);
    const hasEndpoint = /\/(v1|api)\//i.test(resp);
    const hasSpecific = /function\s|line\s\d|add\s|change\s|fix\s/i.test(resp);
    console.log(`  ${m}:`);
    console.log(`    Response: ${resp.slice(0, 150).replace(/\n/g, ' ')}`);
    console.log(`    Names real file: ${hasFile} | Names endpoint: ${hasEndpoint} | Specific action: ${hasSpecific}`);
    console.log('');
  }

  console.log('\n=== TEST B: WITH FULL CONTEXT ===\n');
  for (const m of models) {
    const resp = await ollamaChat(m, context + '\n\n' + basePrompt);
    const hasFile = /\b(server|cli|agent|mcp|index|auth)\.(js|html)\b/i.test(resp);
    const hasEndpoint = /\/(v1|api)\//i.test(resp);
    const hasSpecific = /function\s|line\s\d|add\s|change\s|fix\s/i.test(resp);
    console.log(`  ${m}:`);
    console.log(`    Response: ${resp.slice(0, 150).replace(/\n/g, ' ')}`);
    console.log(`    Names real file: ${hasFile} | Names endpoint: ${hasEndpoint} | Specific action: ${hasSpecific}`);
    console.log('');
  }

  console.log('=== VERDICT ===');
  console.log('Compare Test A vs Test B: does context make responses more specific and accurate?');
}

main().catch(e => console.error('Error:', e.message));
