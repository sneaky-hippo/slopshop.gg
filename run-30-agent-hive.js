#!/usr/bin/env node
/**
 * 30-AGENT LIVE HIVE — All agents compute in parallel with 5s pacing.
 * Real execution, real results, real accountability.
 */
const https = require('https');
const KEY = (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return ''; } })();

function api(method, path, body) {
  return new Promise(r => {
    const opts = { hostname: 'slopshop.gg', path, method, timeout: 30000,
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' } };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d)); } catch(e) { r({ error: d.slice(0,200) }); } });
    });
    req.on('error', e => r({ error: e.message }));
    req.on('timeout', () => { req.destroy(); r({ error: 'timeout' }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function post(hive, ch, from, msg) { return api('POST', '/v1/hive/' + hive + '/send', { channel: ch, from, message: msg.slice(0, 500) }); }

const AGENTS = [
  { name: 'CEO', role: 'chief-executive', model: 'claude' },
  { name: 'VP-Eng', role: 'vp-engineering', model: 'claude' },
  { name: 'VP-Product', role: 'vp-product', model: 'gpt' },
  { name: 'VP-Growth', role: 'vp-growth', model: 'grok' },
  { name: 'VP-Design', role: 'vp-design', model: 'claude' },
  { name: 'VP-AI', role: 'vp-ai', model: 'gpt' },
  { name: 'EM-Platform', role: 'em', model: 'claude' },
  { name: 'EM-Frontend', role: 'em', model: 'gpt' },
  { name: 'EM-Backend', role: 'em', model: 'claude' },
  { name: 'EM-Infra', role: 'em', model: 'grok' },
  { name: 'Eng-1', role: 'sr-engineer', model: 'claude' },
  { name: 'Eng-2', role: 'sr-engineer', model: 'gpt' },
  { name: 'Eng-3', role: 'sr-engineer', model: 'claude' },
  { name: 'Eng-4', role: 'engineer', model: 'grok' },
  { name: 'Eng-5', role: 'engineer', model: 'claude' },
  { name: 'Eng-6', role: 'engineer', model: 'gpt' },
  { name: 'Eng-7', role: 'engineer', model: 'claude' },
  { name: 'Eng-8', role: 'engineer', model: 'grok' },
  { name: 'Eng-9', role: 'jr-engineer', model: 'claude' },
  { name: 'Eng-10', role: 'jr-engineer', model: 'gpt' },
  { name: 'PM-1', role: 'pm', model: 'claude' },
  { name: 'PM-2', role: 'pm', model: 'gpt' },
  { name: 'PM-3', role: 'tech-pm', model: 'grok' },
  { name: 'Designer-1', role: 'designer', model: 'claude' },
  { name: 'Designer-2', role: 'ux', model: 'gpt' },
  { name: 'QA-1', role: 'qa-lead', model: 'claude' },
  { name: 'QA-2', role: 'qa', model: 'grok' },
  { name: 'Sec-1', role: 'security-lead', model: 'claude' },
  { name: 'Sec-2', role: 'security', model: 'gpt' },
  { name: 'DevOps', role: 'devops', model: 'grok' },
];

// Each agent gets a task matching their role — all use local compute (cheap, 1-3cr)
function getTask(agent, sprint) {
  const pool = {
    'chief-executive': ['Generate a UUID for sprint tracking', 'Store sprint-'+sprint+' status=active in memory', 'Hash "ceo-directive-'+sprint+'" with SHA-256'],
    'vp-engineering': ['Count words in: engineering sprint '+sprint+' all systems go', 'Generate a random integer between 1 and 100 for priority scoring', 'Hash "eng-sprint-'+sprint+'" with SHA-256'],
    'vp-product': ['Slugify: Product Sprint '+sprint+' Feature Release', 'Extract keywords from: AI agent orchestration platform sprint '+sprint, 'Reverse the string: product-sprint-'+sprint],
    'vp-growth': ['Base64 encode: growth-metrics-sprint-'+sprint, 'Generate a UUID for campaign tracking', 'Count characters in: growth sprint '+sprint+' launch prep'],
    'vp-design': ['Slugify: Design System Sprint '+sprint+' Update', 'Reverse: design-tokens-sprint-'+sprint, 'Generate a random password with 8 characters for prototype access'],
    'vp-ai': ['Hash "ai-model-eval-'+sprint+'" with SHA-256', 'Calculate statistics for: '+Array.from({length:5},()=>Math.floor(Math.random()*100)).join(' '), 'Count words in: machine learning model evaluation sprint '+sprint],
    'em': ['Generate a UUID for ticket tracking', 'Hash "sprint-'+sprint+'-task" with SHA-256', 'Store em-status-'+sprint+'=working in memory'],
    'sr-engineer': ['Generate a UUID', 'Hash "code-review-'+sprint+'" with SHA-256', 'Base64 encode: deploy-'+sprint],
    'engineer': ['Generate a UUID', 'Count words in: implementing feature for sprint '+sprint, 'Hash "commit-'+sprint+'" with SHA-256'],
    'jr-engineer': ['Reverse the string: learning-sprint-'+sprint, 'Slugify: Junior Dev Sprint '+sprint+' Task', 'Generate a random integer between 1 and 1000'],
    'pm': ['Extract numbers from: Sprint '+sprint+' has 30 agents and 1248 APIs', 'Slugify: Sprint '+sprint+' Release Notes', 'Count words in: product requirements for sprint '+sprint+' feature'],
    'tech-pm': ['Validate JSON: {"sprint":'+sprint+',"agents":30}', 'Hash "api-spec-'+sprint+'" with SHA-256', 'Count characters in: technical specification sprint '+sprint],
    'designer': ['Slugify: Design Component Sprint '+sprint, 'Generate a random password with 6 characters for mockup', 'Reverse: figma-sprint-'+sprint],
    'ux': ['Count words in: user research findings sprint '+sprint+' interviews', 'Slugify: UX Report Sprint '+sprint, 'Extract numbers from: 30 agents 5 hives sprint '+sprint],
    'qa-lead': ['Validate JSON: {"tests":"pass","sprint":'+sprint+'}', 'Hash "test-report-'+sprint+'" with SHA-256', 'Count words in: test coverage report sprint '+sprint],
    'qa': ['Generate a UUID for test run ID', 'Validate email format: qa-'+sprint+'@slopshop.gg', 'Reverse: regression-test-'+sprint],
    'security-lead': ['Hash "security-audit-'+sprint+'" with SHA-256', 'Generate a secure password with 24 characters', 'Validate JSON: {"vuln_count":0,"sprint":'+sprint+'}'],
    'security': ['Generate a TOTP code', 'Hash "pentest-'+sprint+'" with SHA-256', 'Base64 encode: security-report-'+sprint],
    'devops': ['Store deploy-status-'+sprint+'=green in memory', 'Hash "infra-'+sprint+'" with SHA-256', 'Generate a UUID for deployment ID'],
  };
  const tasks = pool[agent.role] || pool['engineer'];
  return tasks[sprint % tasks.length];
}

async function main() {
  console.log('\n  ╔═══════════════════════════════════════════════════════════╗');
  console.log('  ║  30-AGENT LIVE HIVE — Full Team, Real Compute, 30 Sprints ║');
  console.log('  ╚═══════════════════════════════════════════════════════════╝\n');

  const bal = await api('GET', '/v1/credits/balance');
  console.log('  Balance: ' + ((bal.data||bal).balance||0).toLocaleString() + 'cr | Tier: ' + ((bal.data||bal).tier||'?'));
  console.log('  Agents: ' + AGENTS.length + ' | Sprints: 30 | Pace: 5s between sprints');
  console.log('  Est cost: ~' + (30 * 6 * 25) + 'cr (30 sprints x 6 agents/batch x ~25cr)\n');

  // Launch
  const orgRes = await api('POST', '/v1/org/launch', {
    name: 'Full Startup Hive — 30 Agents Live',
    agents: AGENTS.map(a => ({ ...a, skills: [a.role] })),
    channels: ['general', 'engineering', 'product', 'design', 'qa', 'security', 'leadership', 'standups', 'results'],
    auto_handoff: true,
  });
  const org = orgRes.data || orgRes;
  const hive = org.hive_id || 'hive-' + org.org_id.slice(0, 8);
  console.log('  Org: ' + org.org_id.slice(0, 8) + ' | Hive: ' + hive);
  console.log('  ' + AGENTS.length + ' agents deployed\n');

  await post(hive, 'general', 'CEO', '30-agent startup is live. All agents executing real compute tasks. 30 sprints. Ship or get fired.');

  const perf = {};
  for (const a of AGENTS) perf[a.name] = { shipped: 0, failed: 0, bad: 0 };
  let totalCr = 0, fires = 0;

  for (let sprint = 1; sprint <= 30; sprint++) {
    const sprintStart = Date.now();
    let sprintShipped = 0, sprintFailed = 0, sprintCr = 0;

    // Run 6 agents per sprint (rotating through all 30 in 5 batches)
    const batchStart = ((sprint - 1) % 5) * 6;
    const batch = AGENTS.slice(batchStart, batchStart + 6);

    // Execute batch sequentially (to stay under rate limit)
    for (const agent of batch) {
      const task = getTask(agent, sprint);
      const result = await api('POST', '/v1/agent/run', { task });
      const data = result.data || result;
      const steps = data.steps || [];
      const cr = data.total_credits || 0;
      totalCr += cr;
      sprintCr += cr;

      const hasData = steps.some(s => s.result && Object.keys(s.result).length > 0);
      const firstResult = steps.find(s => s.result && Object.keys(s.result).length > 0);
      const preview = firstResult ? JSON.stringify(firstResult.result).slice(0, 50) : 'empty';

      if (hasData) {
        perf[agent.name].shipped++;
        perf[agent.name].bad = 0;
        sprintShipped++;
      } else {
        perf[agent.name].failed++;
        perf[agent.name].bad++;
        sprintFailed++;
      }

      // Fire after 5 consecutive failures
      if (perf[agent.name].bad >= 5) {
        fires++;
        perf[agent.name].bad = 0;
        await post(hive, 'leadership', 'CEO', 'FIRED: ' + agent.name + ' — 5 consecutive fails');
      }
    }

    // Standup
    const batchNames = batch.map(a => a.name).join(', ');
    await post(hive, 'standups', 'CEO', 'S' + sprint + ': ' + sprintShipped + '/' + batch.length + ' shipped | ' + sprintCr + 'cr | Agents: ' + batchNames);

    const elapsed = Date.now() - sprintStart;
    console.log('  S' + String(sprint).padStart(2) + ' | ' + sprintShipped + '/' + batch.length + ' ok | ' + sprintCr + 'cr | ' + elapsed + 'ms | ' + batchNames);

    // Pace between sprints
    if (sprint < 30) await sleep(5000);
  }

  // Final report
  console.log('\n  ════════════════════════════════════════════');
  console.log('  30 SPRINTS x 30 AGENTS COMPLETE\n');
  console.log('  Credits: ' + totalCr.toLocaleString() + 'cr');
  console.log('  Fires: ' + fires);

  const sorted = Object.entries(perf).sort((a, b) => b[1].shipped - a[1].shipped);
  console.log('\n  TOP 10:');
  for (const [n, p] of sorted.slice(0, 10)) {
    const total = p.shipped + p.failed;
    console.log('    ' + n.padEnd(14) + p.shipped + '/' + total + ' (' + (total > 0 ? Math.round(p.shipped / total * 100) : 0) + '%)');
  }
  console.log('\n  BOTTOM 5:');
  for (const [n, p] of sorted.slice(-5)) {
    const total = p.shipped + p.failed;
    console.log('    ' + n.padEnd(14) + p.shipped + '/' + total + ' (' + (total > 0 ? Math.round(p.shipped / total * 100) : 0) + '%)');
  }

  const finalBal = await api('GET', '/v1/credits/balance');
  console.log('\n  Balance: ' + ((finalBal.data||finalBal).balance||0).toLocaleString() + 'cr');

  await post(hive, 'leadership', 'CEO', 'FINAL: 30 sprints done. ' + totalCr + 'cr. ' + fires + ' fires. All 30 agents rotated through.');
  await api('POST', '/v1/memory-set', { key: '30-agent-hive-final', value: JSON.stringify({ totalCr, fires, agents: 30, sprints: 30, perf: Object.fromEntries(sorted.slice(0, 10)), ts: new Date().toISOString() }) });

  console.log('  Org: ' + org.org_id + '\n');
}

main().catch(e => console.error('Fatal:', e.message));
