#!/usr/bin/env node
/**
 * LIVE BREATHING HIVE — Real LLM-powered agent sprints
 * Each agent calls /v1/agent/run with their task, gets real LLM output,
 * posts results to hive channels. This costs real credits.
 */

const https = require('https');
const KEY = (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return process.env.SLOPSHOP_KEY || ''; } })();

function api(method, path, body) {
  return new Promise((resolve) => {
    const opts = { hostname: 'slopshop.gg', path, method, timeout: 60000,
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' } };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ error: d }); } });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const AGENTS = [
  { name: 'CEO', role: 'chief-executive', model: 'claude' },
  { name: 'CTO', role: 'tech-lead', model: 'claude' },
  { name: 'PM', role: 'product-manager', model: 'gpt' },
  { name: 'Eng-1', role: 'engineer', model: 'claude' },
  { name: 'QA', role: 'qa-lead', model: 'grok' },
];

async function main() {
  console.log('\n  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║  LIVE BREATHING HIVE — Real LLM Agent Execution  ║');
  console.log('  ╚═══════════════════════════════════════════════════╝\n');

  // Check balance first
  const bal = await api('GET', '/v1/credits/balance');
  const balance = (bal.data || bal).balance || 0;
  console.log('  Balance: ' + balance + ' credits');
  console.log('  Cost estimate: ~' + (AGENTS.length * 20 + 5) + ' credits per sprint (5 agents x 20cr + hive)\n');

  if (balance < 100) {
    console.log('  ERROR: Need at least 100 credits. Current: ' + balance);
    process.exit(1);
  }

  // Launch org
  console.log('  Launching 5-agent hive...');
  const orgRes = await api('POST', '/v1/org/launch', {
    name: 'Live Breathing Hive',
    agents: AGENTS.map(a => ({ ...a, skills: [a.role] })),
    channels: ['general', 'engineering', 'standups', 'results'],
    auto_handoff: true,
  });
  const org = orgRes.data || orgRes;
  const orgId = org.org_id;
  const hiveId = org.hive_id || 'hive-' + orgId.slice(0, 8);
  console.log('  Org: ' + orgId);
  console.log('  Hive: ' + hiveId);
  console.log('  Agents: ' + AGENTS.length + '\n');

  // Set vision
  await api('POST', '/v1/hive/' + hiveId + '/vision', {
    vision: 'Improve slopshop.gg. Each agent runs a real task using the LLM, reports results to hive.'
  });

  // Sprint 1: Each agent gets a real task and executes it via agent/run
  const TASKS = [
    { agent: 'CEO', task: 'Analyze slopshop.gg competitive positioning. What are our top 3 strengths and top 3 weaknesses compared to Claude Code CLI and AWS CLI? Be specific and concise.' },
    { agent: 'CTO', task: 'Review slopshop server architecture. We have 1248 APIs in a single Express server with SQLite. What are the top 3 scalability risks and how should we address them? Be specific.' },
    { agent: 'PM', task: 'Write a 3-sentence product description for slopshop.gg that would work on Product Hunt. Focus on what makes it unique: 1248 APIs, agent orchestration, free memory, self-hostable.' },
    { agent: 'Eng-1', task: 'Generate a SHA-256 hash of the string "slopshop-live-hive-test" and store the result in memory with key "hive-test-hash"' },
    { agent: 'QA', task: 'Test the slopshop text-word-count API with the input "The quick brown fox jumps over the lazy dog" and verify the result is 9 words.' },
  ];

  console.log('  ═══ SPRINT 1: Real LLM Execution ═══\n');

  let totalCredits = 0;

  for (const { agent, task } of TASKS) {
    process.stdout.write('  [' + agent.padEnd(6) + '] Thinking...');

    const start = Date.now();
    const result = await api('POST', '/v1/agent/run', { task });
    const elapsed = Date.now() - start;
    const data = result.data || result;
    const credits = data.total_credits || result.meta?.credits_used || 20;
    totalCredits += credits;

    // Extract the answer
    const answer = data.answer || data.result || (data.steps && data.steps.length > 0 ?
      data.steps.map(s => (s.result ? JSON.stringify(s.result).slice(0, 100) : '')).filter(Boolean).join('; ') :
      JSON.stringify(data).slice(0, 150));

    const answerClean = String(answer).replace(/\n/g, ' ').slice(0, 120);
    process.stdout.write('\r  [' + agent.padEnd(6) + '] ' + elapsed + 'ms | ' + credits + 'cr | ' + answerClean + '\n');

    // Post to hive
    await api('POST', '/v1/hive/' + hiveId + '/send', {
      channel: 'results',
      from: agent,
      message: 'TASK: ' + task.slice(0, 60) + '... RESULT: ' + answerClean,
    });

    // Post standup
    await api('POST', '/v1/hive/' + hiveId + '/send', {
      channel: 'standups',
      from: agent,
      message: 'Completed task in ' + elapsed + 'ms. Credits used: ' + credits + '. Output: ' + answerClean.slice(0, 80),
    });
  }

  console.log('\n  ═══ SPRINT 1 COMPLETE ═══\n');
  console.log('  Total credits used: ' + totalCredits);

  // Check balance after
  const bal2 = await api('GET', '/v1/credits/balance');
  console.log('  Remaining balance: ' + ((bal2.data || bal2).balance || 0));

  // Show hive messages
  console.log('\n  ═══ HIVE #results CHANNEL ═══\n');
  const msgs = await api('GET', '/v1/hive/' + hiveId + '/channel/results');
  const messages = (msgs.data || msgs).messages || [];
  for (const m of messages.slice(-5)) {
    const ts = typeof m.ts === 'number' ? new Date(m.ts).toISOString().slice(11, 19) : String(m.ts || '').slice(11, 19);
    console.log('  ' + ts + '  ' + String(m.from || '').padEnd(8) + String(m.message || '').slice(0, 80));
  }

  console.log('\n  Org: ' + orgId);
  console.log('  Watch: slop live ' + orgId + '\n');
}

main().catch(e => console.error('Fatal:', e.message));
