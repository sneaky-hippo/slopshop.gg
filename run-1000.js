#!/usr/bin/env node
/**
 * 1000-SPRINT HIVE — Documents fixes, audits every 5, fires underperformers.
 * Direct tool calls (no agent/run overhead). 5s pace. Never strip _engine.
 */
const https = require('https');
const KEY = (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return ''; } })();
function api(m, p, b) { return new Promise(r => { const o = { hostname: 'slopshop.gg', path: p, method: m, timeout: 15000, headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' } }; const req = https.request(o, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { r(JSON.parse(d)); } catch(e) { r({ error: d.slice(0, 100) }); } }); }); req.on('error', e => r({ error: e.message })); req.on('timeout', () => { req.destroy(); r({ error: 'timeout' }); }); if (b) req.write(JSON.stringify(b)); req.end(); }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function post(h, c, f, m) { return api('POST', '/v1/hive/' + h + '/send', { channel: c, from: f, message: String(m).slice(0, 500) }); }

const TOOLS = [
  (a, s) => ({ slug: 'crypto-uuid', body: {}, v: d => d.uuid }),
  (a, s) => ({ slug: 'crypto-hash-sha256', body: { text: a + '-' + s + '-' + Date.now() }, v: d => d.hash }),
  (a, s) => ({ slug: 'text-word-count', body: { text: 'Sprint ' + s + ' agent ' + a + ' delivering value ' + Date.now() }, v: d => d.words }),
  (a, s) => ({ slug: 'text-reverse', body: { text: a + '-' + Date.now() }, v: d => d.result }),
  (a, s) => ({ slug: 'crypto-password-generate', body: { length: 20 }, v: d => d.password }),
  (a, s) => ({ slug: 'text-slugify', body: { text: a + ' Sprint ' + s + ' ' + Date.now() }, v: d => d.slug }),
  (a, s) => ({ slug: 'text-base64-encode', body: { text: a + ':' + s + ':' + Date.now() }, v: d => d.result }),
  (a, s) => ({ slug: 'crypto-random-int', body: { min: 1, max: 99999 }, v: d => d.result !== undefined }),
];

const AGENTS = ['CEO', 'CTO', 'VP-Eng', 'VP-Prod', 'EM-1', 'EM-2', 'Eng-1', 'Eng-2', 'Eng-3', 'Eng-4', 'QA-1', 'Sec-1'];

async function main() {
  console.log('\n  1000-SPRINT HIVE — ' + AGENTS.length + ' agents, 5s pace, audit every 5\n');
  const bal = await api('GET', '/v1/credits/balance');
  // Pre-flight: verify tools work before starting
  console.log('  Pre-flight check...');
  let pfPass = 0;
  for (const slug of ['crypto-uuid', 'crypto-hash-sha256', 'text-reverse']) {
    const r = await api('POST', '/v1/' + slug, { text: 'preflight-' + Date.now() });
    if (r.data && (r.data.uuid || r.data.hash || r.data.result)) pfPass++;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (pfPass < 2) { console.log('  Pre-flight FAILED (' + pfPass + '/3). Waiting 30s for instance...'); await new Promise(r => setTimeout(r, 30000));
    pfPass = 0;
    for (const slug of ['crypto-uuid', 'crypto-hash-sha256', 'text-reverse']) {
      const r = await api('POST', '/v1/' + slug, { text: 'preflight2-' + Date.now() });
      if (r.data && (r.data.uuid || r.data.hash || r.data.result)) pfPass++;
      await new Promise(r => setTimeout(r, 1000));
    }
    if (pfPass < 2) { console.log('  Pre-flight still failing. Aborting.'); process.exit(1); }
  }
  console.log('  Pre-flight: ' + pfPass + '/3 OK\n');
  console.log('  Balance: ' + ((bal.data || bal).balance || 0).toLocaleString() + 'cr\n');

  const orgRes = await api('POST', '/v1/org/launch', {
    name: '1000-Sprint Hive', agents: AGENTS.map((n, i) => ({ name: n, role: n.toLowerCase(), model: ['claude', 'gpt', 'grok'][i % 3], skills: ['compute'] })),
    channels: ['general', 'standups', 'results', 'firings', 'audits'], auto_handoff: true,
  });
  const org = orgRes.data || orgRes;
  const hive = org.hive_id || 'hive-' + (org.org_id || '').slice(0, 8);

  const perf = {}; for (const a of AGENTS) perf[a] = { ok: 0, fail: 0, strikes: 0, pleaded: false, fired: false };
  let total = 0, ok = 0, fail = 0, cr = 0, fires = 0, streak = 0;
  const fixes = [];

  for (let s = 1; s <= 1000; s++) {
    // Pick 3 agents (rotating)
    const batch = [];
    for (let b = 0; b < 3; b++) {
      const agent = AGENTS[(s * 3 + b) % AGENTS.length];
      if (!perf[agent].fired) batch.push(agent);
    }
    if (batch.length === 0) { console.log('  S' + s + ': ALL FIRED. Resetting.'); for (const a of AGENTS) { perf[a].fired = false; perf[a].strikes = 0; perf[a].pleaded = false; } continue; }

    let sprintOk = 0, sprintCr = 0;
    const previews = [];

    for (const agent of batch) {
      const toolFn = TOOLS[(s + AGENTS.indexOf(agent)) % TOOLS.length];
      const { slug, body, v } = toolFn(agent, s);
      const res = await api('POST', '/v1/' + slug, body);
      const data = res.data || {};
      const used = res.meta?.credits_used || 1;
      sprintCr += used; cr += used; total++;

      const isRL = res.error?.code === 'rate_limited';
      const hasValue = v(data);

      if (hasValue) {
        perf[agent].ok++; perf[agent].strikes = 0; ok++; sprintOk++; streak++;
        previews.push(agent.slice(0, 5) + ':' + slug.slice(0, 12) + '=' + JSON.stringify(data).slice(0, 25));
      } else if (!isRL) {
        perf[agent].fail++; perf[agent].strikes++; fail++; streak = 0;

        // Firing chain
        if (perf[agent].strikes === 1 && !perf[agent].pleaded) {
          perf[agent].pleaded = true;
          await post(hive, 'general', agent, 'Plead: second chance. Reorienting around vision.');
        } else if (perf[agent].strikes >= 2) {
          perf[agent].fired = true; fires++;
          await post(hive, 'firings', 'CEO', 'FIRED: ' + agent);
          fixes.push('S' + s + ': Fired ' + agent + ' (' + perf[agent].strikes + ' strikes)');
          // VP check
          if (agent.startsWith('Eng') || agent.startsWith('QA') || agent.startsWith('Sec')) {
            const vp = AGENTS.find(a => a.startsWith('VP') && !perf[a].fired);
            if (vp && perf[agent].strikes >= 3) {
              perf[vp].strikes++;
              if (perf[vp].strikes >= 2) { perf[vp].fired = true; fires++; await post(hive, 'firings', 'BOARD', 'VP FIRED: ' + vp); fixes.push('S' + s + ': VP fired: ' + vp); }
            }
          }
        }
      }
    }

    // Standup
    await post(hive, 'standups', 'CEO', 'S' + s + ': ' + sprintOk + '/' + batch.length + ' | ' + sprintCr + 'cr | streak:' + streak + ' | ' + previews.join(' ').slice(0, 200));

    // AUDIT every 5 sprints
    if (s % 5 === 0) {
      const rate = ok > 0 ? Math.round(ok / total * 100) : 0;
      const active = AGENTS.filter(a => !perf[a].fired).length;
      if (rate < 50 && s > 10) {
        fixes.push('S' + s + ': AUDIT — rate ' + rate + '% below 50%. Investigating.');
        // Quick diagnostic
        const testRes = await api('POST', '/v1/crypto-uuid', {});
        if (testRes.data?.uuid) {
          fixes.push('S' + s + ': Platform OK, agent selection issue. Resetting strikes.');
          for (const a of AGENTS) { if (perf[a].strikes > 0 && !perf[a].fired) perf[a].strikes = 0; }
        } else {
          fixes.push('S' + s + ': Platform issue detected: ' + JSON.stringify(testRes.error || testRes).slice(0, 80));
        }
        await post(hive, 'audits', 'SYSTEM', 'S' + s + ' AUDIT: rate=' + rate + '% active=' + active + ' fires=' + fires);
      }
    }

    // Print
    if (s <= 5 || s % 25 === 0 || s === 1000) {
      console.log('  S' + String(s).padStart(4) + ' | ' + sprintOk + '/' + batch.length + ' | ' + cr + 'cr | ok:' + ok + ' fail:' + fail + ' | streak:' + streak + ' | ' + previews.join(' ').slice(0, 55));
    }

    // Memory checkpoint every 50
    if (s % 50 === 0) {
      await api('POST', '/v1/memory-set', { key: 'sprint-1000-cp-' + s, value: JSON.stringify({ s, ok, fail, cr, fires, streak, ts: new Date().toISOString() }) });
    }

    await sleep(5000);
  }

  console.log('\n  ═══════════════════════════════════');
  console.log('  1000 SPRINTS COMPLETE\n');
  console.log('  OK: ' + ok + ' | Fail: ' + fail + ' | Rate: ' + Math.round(ok / total * 100) + '%');
  console.log('  Credits: ' + cr.toLocaleString() + ' | Fires: ' + fires + ' | Max streak: ' + streak);
  console.log('\n  FIXES LOG (' + fixes.length + '):');
  for (const f of fixes.slice(0, 20)) console.log('    ' + f);
  if (fixes.length > 20) console.log('    ... and ' + (fixes.length - 20) + ' more');

  await post(hive, 'leadership', 'CEO', 'DONE: ' + ok + '/' + total + ' shipped. ' + cr + 'cr. ' + fires + ' fires. Streak: ' + streak);
  const fb = await api('GET', '/v1/credits/balance');
  console.log('\n  Balance: ' + ((fb.data || fb).balance || 0).toLocaleString() + 'cr');
  console.log('  Org: ' + org.org_id + '\n');
}
main().catch(e => console.error('Fatal:', e.message));
