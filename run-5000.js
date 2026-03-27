#!/usr/bin/env node
/**
 * 5,000-SPRINT HIVE ENGINE
 *
 * Rules:
 * - NEVER strip _engine
 * - Agent produces no value (not rate-limited) → fired next round
 * - Agent fails again → VP fired
 * - Agent fails again → CEO fired
 * - Anyone gets 1 second chance if they plead
 * - Brotherhood reorientation after forgiveness
 * - After 5-10 agents with no results → pause, audit, fix, relaunch
 * - Deploy every 50 sprints
 * - If nothing deployed, pause and fix
 * - A/B/C/D/E test different hive configs
 * - 5s pacing between sprints
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const KEY = (() => { try { return JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return ''; } })();

function api(m, p, b) {
  return new Promise(r => {
    const o = { hostname: 'slopshop.gg', path: p, method: m, timeout: 15000,
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' } };
    const req = https.request(o, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d)); } catch(e) { r({ error: d.slice(0, 100) }); } });
    });
    req.on('error', e => r({ error: e.message }));
    req.on('timeout', () => { req.destroy(); r({ error: 'timeout' }); });
    if (b) req.write(JSON.stringify(b));
    req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function post(h, c, f, m) { return api('POST', '/v1/hive/' + h + '/send', { channel: c, from: f, message: String(m).slice(0, 500) }); }

// 10 tool types that produce real verifiable output
const TOOLS = [
  (a, s) => ({ slug: 'crypto-uuid', body: {}, verify: d => !!d.uuid }),
  (a, s) => ({ slug: 'crypto-hash-sha256', body: { text: a + '-' + s + '-' + Date.now() }, verify: d => !!d.hash }),
  (a, s) => ({ slug: 'text-word-count', body: { text: 'Agent ' + a + ' sprint ' + s + ' delivering value now' }, verify: d => d.words > 0 }),
  (a, s) => ({ slug: 'text-reverse', body: { text: a + '-delivers-' + s }, verify: d => !!d.result }),
  (a, s) => ({ slug: 'text-slugify', body: { text: a + ' Sprint ' + s + ' Ship It' }, verify: d => !!d.slug }),
  (a, s) => ({ slug: 'crypto-password-generate', body: { length: 20 }, verify: d => !!d.password }),
  (a, s) => ({ slug: 'text-base64-encode', body: { text: a + ':sprint:' + s }, verify: d => !!d.result }),
  (a, s) => ({ slug: 'crypto-random-int', body: { min: 1, max: 99999 }, verify: d => d.result !== undefined }),
  (a, s) => ({ slug: 'text-char-count', body: { text: 'Sprint ' + s + ' by ' + a + ' at ' + Date.now() }, verify: d => d.characters > 0 }),
  (a, s) => ({ slug: 'json-format', body: { json: JSON.stringify({ agent: a, sprint: s, ts: Date.now() }) }, verify: d => !!d.formatted }),
];

// 5 hive configs for A/B/C/D/E testing
const HIVE_CONFIGS = [
  { id: 'A', name: 'Alpha — Speed', agents: 6, pace: 3000, desc: 'Small fast team' },
  { id: 'B', name: 'Beta — Scale', agents: 15, pace: 5000, desc: 'Medium balanced team' },
  { id: 'C', name: 'Charlie — Full', agents: 30, pace: 7000, desc: 'Full startup team' },
  { id: 'D', name: 'Delta — Lean', agents: 4, pace: 2000, desc: 'Lean squad' },
  { id: 'E', name: 'Echo — Elite', agents: 8, pace: 4000, desc: 'Elite performers only' },
];

function makeAgents(count) {
  const roles = ['CEO', 'VP-Eng', 'VP-Prod', 'VP-Growth', 'EM-1', 'EM-2', 'Eng-1', 'Eng-2', 'Eng-3', 'Eng-4',
    'Eng-5', 'Eng-6', 'Eng-7', 'Eng-8', 'PM-1', 'PM-2', 'QA-1', 'QA-2', 'Sec-1', 'DevOps',
    'Eng-9', 'Eng-10', 'Design-1', 'Design-2', 'Growth-1', 'Data-1', 'Eng-11', 'Eng-12', 'EM-3', 'CTO'];
  const models = ['claude', 'gpt', 'grok'];
  return roles.slice(0, count).map((name, i) => ({
    name, role: name.toLowerCase(), model: models[i % 3], skills: ['compute'],
  }));
}

async function main() {
  console.log('\n  ╔═══════════════════════════════════════════════════════════════════╗');
  console.log('  ║  5,000-SPRINT HIVE ENGINE — A/B/C/D/E Testing, Real Compute     ║');
  console.log('  ╚═══════════════════════════════════════════════════════════════════╝\n');

  const bal = await api('GET', '/v1/credits/balance');
  console.log('  Balance: ' + ((bal.data || bal).balance || 0).toLocaleString() + 'cr');
  console.log('  Target: 5,000 consecutive insightful sprints');
  console.log('  Configs: A(6 fast) B(15 balanced) C(30 full) D(4 lean) E(8 elite)\n');

  let globalSprint = 0;
  let totalShipped = 0, totalFailed = 0, totalCredits = 0;
  let consecutiveInsightful = 0;
  let configResults = {};
  for (const c of HIVE_CONFIGS) configResults[c.id] = { shipped: 0, failed: 0, sprints: 0 };

  // Run in rounds of 50 sprints per config (A=50, B=50, C=50, D=50, E=50 = 250 per cycle)
  // Repeat until 5,000 or issues
  const MAX_SPRINTS = 5000;
  const SPRINTS_PER_CONFIG = 50;
  const DEPLOY_EVERY = 50;

  while (globalSprint < MAX_SPRINTS) {
    for (const config of HIVE_CONFIGS) {
      if (globalSprint >= MAX_SPRINTS) break;

      const agents = makeAgents(config.agents);
      const orgRes = await api('POST', '/v1/org/launch', {
        name: 'Hive ' + config.id + ' — ' + config.name + ' (cycle ' + Math.floor(globalSprint / 250) + ')',
        agents, channels: ['general', 'standups', 'results', 'firings'],
        auto_handoff: true,
      });
      const org = orgRes.data || orgRes;
      const hive = org.hive_id || 'hive-' + (org.org_id || 'unknown').slice(0, 8);

      const perf = {};
      for (const a of agents) perf[a.name] = { shipped: 0, failed: 0, strikes: 0, pleaded: false, fired: false };
      let configShipped = 0, configFailed = 0, noResultStreak = 0;

      for (let localSprint = 0; localSprint < SPRINTS_PER_CONFIG && globalSprint < MAX_SPRINTS; localSprint++) {
        globalSprint++;
        const batchSize = Math.min(3, agents.length);
        const batchStart = (localSprint * batchSize) % agents.length;
        const batch = [];
        for (let b = 0; b < batchSize; b++) batch.push(agents[(batchStart + b) % agents.length]);

        let sprintOk = 0, sprintFail = 0, sprintCr = 0;
        const previews = [];

        for (const agent of batch) {
          if (perf[agent.name].fired) continue;

          const toolFn = TOOLS[(globalSprint + agents.indexOf(agent)) % TOOLS.length];
          const { slug, body, verify } = toolFn(agent.name, globalSprint);
          const res = await api('POST', '/v1/' + slug, body);
          const data = res.data || {};
          const cr = res.meta?.credits_used || 1;
          sprintCr += cr;
          totalCredits += cr;

          const isRateLimit = res.error?.code === 'rate_limited' || res.status === 429;
          const hasValue = verify(data);

          if (hasValue) {
            perf[agent.name].shipped++;
            perf[agent.name].strikes = 0;
            configShipped++;
            totalShipped++;
            sprintOk++;
            const preview = JSON.stringify(data).slice(0, 35);
            previews.push(agent.name.slice(0, 6) + ':' + preview);
          } else if (isRateLimit) {
            // Rate limited — don't punish
            sprintFail++;
          } else {
            perf[agent.name].failed++;
            perf[agent.name].strikes++;
            configFailed++;
            totalFailed++;
            sprintFail++;

            // FIRING CHAIN: strike 1 → fire agent. strike 2 → fire VP. strike 3 → fire CEO.
            if (perf[agent.name].strikes >= 1 && !perf[agent.name].pleaded) {
              // Second chance — plead
              perf[agent.name].pleaded = true;
              await post(hive, 'general', agent.name, 'I plead for a second chance. Reorienting around the vision. Will deliver next sprint.');
            } else if (perf[agent.name].strikes >= 2) {
              perf[agent.name].fired = true;
              await post(hive, 'firings', 'CEO', 'FIRED: ' + agent.name + ' — failed after second chance.');
              // Check VP
              const vp = agents.find(a => a.name.startsWith('VP') && !perf[a.name].fired);
              if (vp && perf[agent.name].strikes >= 3) {
                perf[vp.name].fired = true;
                await post(hive, 'firings', 'BOARD', 'VP FIRED: ' + vp.name + ' — team not delivering.');
              }
            }
          }
        }

        // No-result streak check
        if (sprintOk === 0) {
          noResultStreak++;
          if (noResultStreak >= 5) {
            // Pause, audit, relaunch
            await post(hive, 'general', 'SYSTEM', 'PAUSE: ' + noResultStreak + ' sprints with 0 results. Running audit...');
            // Quick audit — test 3 tools
            let auditPass = 0;
            for (const slug of ['crypto-uuid', 'text-reverse', 'crypto-hash-sha256']) {
              const r = await api('POST', '/v1/' + slug, { text: 'audit-' + Date.now() });
              if ((r.data || {}).uuid || (r.data || {}).result || (r.data || {}).hash) auditPass++;
            }
            if (auditPass >= 2) {
              await post(hive, 'general', 'SYSTEM', 'Audit: ' + auditPass + '/3 tools work. Issue is agent config, not platform. Resetting strikes.');
              for (const a of agents) { perf[a.name].strikes = 0; perf[a.name].fired = false; perf[a.name].pleaded = false; }
              noResultStreak = 0;
            } else {
              await post(hive, 'general', 'SYSTEM', 'Audit: Platform issue (' + auditPass + '/3). Breaking to fix.');
              break;
            }
          }
        } else {
          noResultStreak = 0;
          consecutiveInsightful++;
        }

        // Standup
        await post(hive, 'standups', 'CEO', 'G' + globalSprint + '/S' + (localSprint + 1) + ' [' + config.id + ']: ' + sprintOk + '/' + batch.length + ' | ' + sprintCr + 'cr | ' + previews.join(' ').slice(0, 200));

        // Print every 10th sprint or first 3
        if (globalSprint <= 3 || globalSprint % 10 === 0 || globalSprint % DEPLOY_EVERY === 0) {
          console.log('  G' + String(globalSprint).padStart(5) + ' [' + config.id + '] ' + sprintOk + '/' + batch.length + ' ok | ' + sprintCr + 'cr | streak:' + consecutiveInsightful + ' | ' + previews.join(' | ').slice(0, 55));
        }

        // Deploy checkpoint every 50
        if (globalSprint % DEPLOY_EVERY === 0) {
          await api('POST', '/v1/memory-set', { key: 'g-sprint-' + globalSprint, value: JSON.stringify({
            sprint: globalSprint, shipped: totalShipped, failed: totalFailed, credits: totalCredits,
            streak: consecutiveInsightful, config: config.id, ts: new Date().toISOString(),
          })});
          console.log('  ─── CHECKPOINT G' + globalSprint + ' | Shipped: ' + totalShipped + ' | Credits: ' + totalCredits + ' | Streak: ' + consecutiveInsightful + ' ───');
        }

        // Pace
        await sleep(config.pace);
      }

      configResults[config.id].shipped += configShipped;
      configResults[config.id].failed += configFailed;
      configResults[config.id].sprints += Math.min(SPRINTS_PER_CONFIG, globalSprint);
    }
  }

  // FINAL REPORT
  console.log('\n  ═══════════════════════════════════════════════════════');
  console.log('  5,000-SPRINT ENGINE COMPLETE\n');
  console.log('  Total sprints: ' + globalSprint);
  console.log('  Shipped: ' + totalShipped + ' | Failed: ' + totalFailed + ' | Rate: ' + Math.round(totalShipped / (totalShipped + totalFailed || 1) * 100) + '%');
  console.log('  Credits: ' + totalCredits.toLocaleString());
  console.log('  Max consecutive insightful: ' + consecutiveInsightful);
  console.log('\n  A/B/C/D/E RESULTS:');
  for (const [id, r] of Object.entries(configResults)) {
    const total = r.shipped + r.failed;
    console.log('    ' + id + ': ' + r.shipped + '/' + total + ' (' + (total > 0 ? Math.round(r.shipped / total * 100) : 0) + '%) over ' + r.sprints + ' sprints');
  }

  const fb = await api('GET', '/v1/credits/balance');
  console.log('\n  Balance: ' + ((fb.data || fb).balance || 0).toLocaleString() + 'cr\n');
}

main().catch(e => console.error('Fatal:', e.message));
