#!/usr/bin/env node
/**
 * 30-AGENT DIRECT COMPUTE HIVE — Calls tools directly (bypasses agent/run planner).
 * Every agent calls a real API, gets real data, posts to hive.
 */
const https = require('https');
const KEY = (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return ''; } })();
function api(m, p, b) { return new Promise(r => { const o = { hostname: 'slopshop.gg', path: p, method: m, timeout: 15000, headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' } }; const req = https.request(o, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { r(JSON.parse(d)); } catch(e) { r({ error: d.slice(0, 100) }); } }); }); req.on('error', e => r({ error: e.message })); req.on('timeout', () => { req.destroy(); r({ error: 'timeout' }); }); if (b) req.write(JSON.stringify(b)); req.end(); }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function post(h, c, f, m) { return api('POST', '/v1/hive/' + h + '/send', { channel: c, from: f, message: m.slice(0, 500) }); }

const AGENTS = [
  'CEO', 'VP-Eng', 'VP-Product', 'VP-Growth', 'VP-Design', 'VP-AI',
  'EM-Platform', 'EM-Frontend', 'EM-Backend', 'EM-Infra',
  'Eng-1', 'Eng-2', 'Eng-3', 'Eng-4', 'Eng-5',
  'Eng-6', 'Eng-7', 'Eng-8', 'Eng-9', 'Eng-10',
  'PM-1', 'PM-2', 'PM-3', 'Designer-1', 'Designer-2',
  'QA-1', 'QA-2', 'Sec-1', 'Sec-2', 'DevOps',
];

// Direct tool calls — each returns real verifiable data
function getToolCall(agent, sprint) {
  const s = sprint;
  const calls = [
    { slug: 'crypto-uuid', body: {} },
    { slug: 'crypto-hash-sha256', body: { text: agent + '-sprint-' + s } },
    { slug: 'text-word-count', body: { text: 'Agent ' + agent + ' executing sprint ' + s + ' on slopshop hive' } },
    { slug: 'text-reverse', body: { text: agent + '-sprint-' + s } },
    { slug: 'text-slugify', body: { text: agent + ' Sprint ' + s + ' Deliverable' } },
    { slug: 'crypto-password-generate', body: { length: 16 } },
    { slug: 'text-base64-encode', body: { text: agent + ':' + s } },
    { slug: 'crypto-random-int', body: { min: 1, max: 10000 } },
    { slug: 'text-char-count', body: { text: 'Sprint ' + s + ' by ' + agent } },
    { slug: 'json-format', body: { json: JSON.stringify({ agent, sprint: s, ts: Date.now() }) } },
  ];
  const idx = (AGENTS.indexOf(agent) + s) % calls.length;
  return calls[idx];
}

async function main() {
  console.log('\n  ╔═══════════════════════════════════════════════════════════════╗');
  console.log('  ║  30-AGENT DIRECT COMPUTE HIVE — Real Tools, Real Data       ║');
  console.log('  ╚═══════════════════════════════════════════════════════════════╝\n');

  const bal = await api('GET', '/v1/credits/balance');
  console.log('  Balance: ' + ((bal.data || bal).balance || 0).toLocaleString() + 'cr');
  console.log('  Agents: 30 | Sprints: 30 | 6 agents/batch | 5s pace\n');

  const orgRes = await api('POST', '/v1/org/launch', {
    name: 'Direct Compute Hive — 30 Agents',
    agents: AGENTS.map(n => ({ name: n, role: n.toLowerCase(), model: ['claude', 'gpt', 'grok'][AGENTS.indexOf(n) % 3], skills: ['compute'] })),
    channels: ['general', 'standups', 'results', 'firings', 'leadership'],
    auto_handoff: true,
  });
  const org = orgRes.data || orgRes;
  const hive = org.hive_id || 'hive-' + org.org_id.slice(0, 8);
  console.log('  Org: ' + org.org_id.slice(0, 8) + ' | Hive: ' + hive + '\n');

  const perf = {};
  for (const a of AGENTS) perf[a] = { shipped: 0, failed: 0, bad: 0 };
  let totalCr = 0, fires = 0;

  for (let sprint = 1; sprint <= 30; sprint++) {
    const t0 = Date.now();
    const batchIdx = ((sprint - 1) % 5) * 6;
    const batch = AGENTS.slice(batchIdx, batchIdx + 6);
    let ok = 0, fail = 0, cr = 0;
    const previews = [];

    for (const agent of batch) {
      const { slug, body } = getToolCall(agent, sprint);
      const res = await api('POST', '/v1/' + slug, body);
      const data = res.data || {};
      const used = res.meta?.credits_used || 1;
      cr += used;
      totalCr += used;

      // Check for real data (not error)
      const { _engine, ...clean } = data;
      const hasData = Object.keys(clean).length > 0 && !data.error && !data._error;
      const preview = JSON.stringify(clean).slice(0, 45);

      if (hasData) {
        perf[agent].shipped++;
        perf[agent].bad = 0;
        ok++;
        previews.push(agent.slice(0, 5) + ':' + preview.slice(0, 20));
      } else {
        perf[agent].failed++;
        perf[agent].bad++;
        fail++;
      }

      if (perf[agent].bad >= 5) {
        fires++;
        perf[agent].bad = 0;
        await post(hive, 'firings', 'CEO', 'FIRED: ' + agent + ' — 5 fails');
      }
    }

    // Post standup
    await post(hive, 'standups', 'CEO', 'S' + sprint + ': ' + ok + '/' + batch.length + ' | ' + cr + 'cr | ' + previews.join(' '));

    const ms = Date.now() - t0;
    console.log('  S' + String(sprint).padStart(2) + ' | ' + ok + '/' + batch.length + ' ok | ' + cr + 'cr | ' + ms + 'ms | ' + previews.join(' | ').slice(0, 70));

    if (sprint < 30) await sleep(5000);
  }

  // Report
  console.log('\n  ════════════════════════════════════════════');
  const totalS = Object.values(perf).reduce((a, p) => a + p.shipped, 0);
  const totalF = Object.values(perf).reduce((a, p) => a + p.failed, 0);
  console.log('  Shipped: ' + totalS + ' | Failed: ' + totalF + ' | Rate: ' + Math.round(totalS / (totalS + totalF) * 100) + '%');
  console.log('  Credits: ' + totalCr + ' | Fires: ' + fires);

  const sorted = Object.entries(perf).sort((a, b) => b[1].shipped - a[1].shipped);
  console.log('\n  TOP 10:');
  for (const [n, p] of sorted.slice(0, 10)) console.log('    ' + n.padEnd(14) + p.shipped + '/' + (p.shipped + p.failed));

  await post(hive, 'leadership', 'CEO', 'DONE: ' + totalS + ' shipped, ' + totalCr + 'cr, ' + fires + ' fires.');
  await api('POST', '/v1/memory-set', { key: 'direct-hive-30', value: JSON.stringify({ shipped: totalS, failed: totalF, credits: totalCr, fires, ts: new Date().toISOString() }) });

  const fb = await api('GET', '/v1/credits/balance');
  console.log('\n  Balance: ' + ((fb.data || fb).balance || 0).toLocaleString() + 'cr');
  console.log('  Org: ' + org.org_id + '\n');
}
main().catch(e => console.error('Fatal:', e.message));
