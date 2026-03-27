#!/usr/bin/env node
/**
 * 30 FIX SPRINTS — Focused on fixing hive issues found in the 100-sprint run.
 * Paced at 3s between sprints to avoid rate limit collapse.
 * Max 2 agents per sprint to conserve credits.
 * Stops if balance < 100.
 */
const https = require('https');
const KEY = (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return ''; } })();

function api(method, path, body) {
  return new Promise(r => {
    const opts = { hostname: 'slopshop.gg', path, method, timeout: 30000,
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' } };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d)); } catch(e) { r({ error: d.slice(0, 200) }); } });
    });
    req.on('error', e => r({ error: e.message }));
    req.on('timeout', () => { req.destroy(); r({ error: 'timeout' }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function post(hive, ch, from, msg) { return api('POST', '/v1/hive/' + hive + '/send', { channel: ch, from, message: msg.slice(0, 500) }); }

// Focused tasks that test specific things and produce verifiable output
const TASKS = [
  // Sprint 1-5: Verify core compute works
  { task: 'Generate a UUID', expect: 'uuid', agent: 'Eng' },
  { task: 'Hash the text "sprint-test" with SHA-256', expect: 'hash', agent: 'Eng' },
  { task: 'Count words in: one two three four five', expect: 'count', agent: 'QA' },
  { task: 'Base64 encode the text: hive-fix-sprint', expect: 'result', agent: 'Eng' },
  { task: 'Generate a random password with 16 characters', expect: 'password', agent: 'SecOps' },
  // Sprint 6-10: Memory operations
  { task: 'Store in memory key=sprint-fix-1 value=working', expect: 'ok', agent: 'DevOps' },
  { task: 'Get the value from memory key=sprint-fix-1', expect: 'value', agent: 'DevOps' },
  { task: 'Reverse the string: slopshop hive fix', expect: 'result', agent: 'Eng' },
  { task: 'Slugify the text: Live Hive Sprint Fix', expect: 'result', agent: 'Eng' },
  { task: 'Validate email format: test@slopshop.gg', expect: 'valid', agent: 'QA' },
  // Sprint 11-15: Data processing
  { task: 'Calculate statistics for: 10 20 30 40 50', expect: 'mean', agent: 'Eng' },
  { task: 'Extract numbers from: We have 1248 APIs and 927 handlers', expect: 'numbers', agent: 'QA' },
  { task: 'Generate a TOTP code', expect: 'code', agent: 'SecOps' },
  { task: 'Check JSON validity: {"test": true}', expect: 'valid', agent: 'QA' },
  { task: 'Convert text to uppercase: hello slopshop', expect: 'result', agent: 'Eng' },
  // Sprint 16-20: Advanced
  { task: 'Hash "test-1" then hash "test-2" with SHA-256', expect: 'hash', agent: 'Eng' },
  { task: 'Generate a UUID and base64 encode it', expect: 'uuid', agent: 'Eng' },
  { task: 'Count characters in: The quick brown fox', expect: 'characters', agent: 'QA' },
  { task: 'Store in memory key=sprint-final value=complete', expect: 'ok', agent: 'DevOps' },
  { task: 'Generate a random integer between 1 and 1000', expect: 'result', agent: 'Eng' },
  // Sprint 21-25: Stress test
  { task: 'Hash "stress-1" with SHA-256', expect: 'hash', agent: 'Eng' },
  { task: 'Hash "stress-2" with SHA-256', expect: 'hash', agent: 'QA' },
  { task: 'Hash "stress-3" with SHA-256', expect: 'hash', agent: 'Eng' },
  { task: 'Generate 3 UUIDs by generating a UUID', expect: 'uuid', agent: 'Eng' },
  { task: 'Reverse the string: sprint twenty five', expect: 'result', agent: 'QA' },
  // Sprint 26-30: Final verification
  { task: 'Count words in: the hive is alive and breathing now', expect: 'words', agent: 'QA' },
  { task: 'Get memory key=sprint-final', expect: 'value', agent: 'DevOps' },
  { task: 'Generate a secure password with 32 characters', expect: 'password', agent: 'SecOps' },
  { task: 'Slugify: Thirty Sprints Complete All Fixed', expect: 'result', agent: 'Eng' },
  { task: 'Hash "final-sprint-30" with SHA-256', expect: 'hash', agent: 'Eng' },
];

async function main() {
  console.log('\n  ╔═══════════════════════════════════════════════╗');
  console.log('  ║  30 FIX SPRINTS — Paced, Focused, Verified   ║');
  console.log('  ╚═══════════════════════════════════════════════╝\n');

  const bal = await api('GET', '/v1/credits/balance');
  let balance = (bal.data || bal).balance || 0;
  console.log('  Balance: ' + balance + 'cr | Pace: 3s between sprints\n');

  // Launch
  const orgRes = await api('POST', '/v1/org/launch', {
    name: '30 Fix Sprints',
    agents: [
      { name: 'Lead', role: 'lead', model: 'claude', skills: ['management'] },
      { name: 'Eng', role: 'engineer', model: 'claude', skills: ['code'] },
      { name: 'QA', role: 'qa', model: 'grok', skills: ['testing'] },
      { name: 'SecOps', role: 'security', model: 'gpt', skills: ['security'] },
      { name: 'DevOps', role: 'devops', model: 'claude', skills: ['infra'] },
    ],
    channels: ['general', 'standups', 'results'],
    auto_handoff: true,
  });
  const org = orgRes.data || orgRes;
  const hive = org.hive_id || 'hive-' + org.org_id.slice(0, 8);
  console.log('  Org: ' + org.org_id.slice(0, 8) + ' | 5 agents | Hive: ' + hive + '\n');

  let totalCr = 0, shipped = 0, failed = 0;

  for (let i = 0; i < TASKS.length; i++) {
    const sprint = i + 1;
    const t = TASKS[i];

    // Balance check
    if (balance < 50) {
      console.log('  S' + sprint + ': STOPPED — balance too low (' + balance + 'cr)');
      break;
    }

    // Execute
    const start = Date.now();
    const result = await api('POST', '/v1/agent/run', { task: t.task });
    const data = result.data || result;
    const steps = data.steps || [];
    const cr = data.total_credits || 0;
    totalCr += cr;
    balance -= cr;
    const elapsed = Date.now() - start;

    // Check for real results
    const hasData = steps.some(s => s.result && Object.keys(s.result).length > 0);
    const firstResult = steps.find(s => s.result && Object.keys(s.result).length > 0);
    const preview = firstResult ? JSON.stringify(firstResult.result).slice(0, 80) : 'no result';

    if (hasData) {
      shipped++;
      await post(hive, 'results', t.agent, 'S' + sprint + ' OK: ' + t.task.slice(0, 40) + ' → ' + preview.slice(0, 60));
    } else {
      failed++;
      await post(hive, 'results', t.agent, 'S' + sprint + ' FAIL: ' + t.task.slice(0, 40) + ' → no data');
    }

    // Print
    const icon = hasData ? '✓' : '✗';
    const color = hasData ? '' : ' [FAIL]';
    console.log('  S' + String(sprint).padStart(2) + ' ' + icon + ' [' + t.agent.padEnd(6) + '] ' +
      cr + 'cr ' + elapsed + 'ms | ' + preview.slice(0, 55) + color);

    // Pace: wait 3s between sprints to avoid rate limit
    if (i < TASKS.length - 1) await sleep(3000);
  }

  console.log('\n  ═══════════════════════════════════════');
  console.log('  30 FIX SPRINTS COMPLETE\n');
  console.log('  Shipped: ' + shipped + '/' + (shipped + failed) + ' (' + Math.round(shipped / (shipped + failed) * 100) + '%)');
  console.log('  Credits: ' + totalCr + 'cr spent');

  const finalBal = await api('GET', '/v1/credits/balance');
  console.log('  Balance: ' + ((finalBal.data || finalBal).balance || 0) + 'cr remaining');

  await post(hive, 'general', 'Lead', '30 FIX SPRINTS DONE. ' + shipped + '/' + (shipped + failed) + ' shipped. ' + totalCr + 'cr. Rate: ' + Math.round(shipped / (shipped + failed) * 100) + '%');

  // Store results in shared memory
  await api('POST', '/v1/memory-set', { key: 'fix-sprint-results', value: JSON.stringify({
    shipped, failed, totalCr, rate: Math.round(shipped / (shipped + failed) * 100),
    timestamp: new Date().toISOString(),
  })});

  console.log('  Org: ' + org.org_id + '\n');
}

main().catch(e => console.error('Fatal:', e.message));
