#!/usr/bin/env node
/**
 * 100-SPRINT HIVE MARATHON with real agent execution, manager accountability,
 * and firing/hiring. Each sprint: agents run real tasks via /v1/agent/run,
 * post results to hive, managers rated on team output, fired after 5 bad sprints.
 */
const https = require('https');
const crypto = require('crypto');
const KEY = (() => { try { return JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return process.env.SLOPSHOP_KEY || ''; } })();

function api(method, path, body) {
  return new Promise(r => {
    const opts = { hostname: 'slopshop.gg', path, method, timeout: 30000,
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' } };
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

function post(hive, ch, from, msg) {
  return api('POST', '/v1/hive/' + hive + '/send', { channel: ch, from, message: msg.slice(0, 500) });
}

// Team roster — 10 agents with managers
const TEAM = [
  { name: 'CEO', role: 'ceo', model: 'claude', isManager: true },
  { name: 'CTO', role: 'cto', model: 'claude', isManager: true },
  { name: 'PM-Lead', role: 'pm', model: 'gpt', isManager: true },
  { name: 'Eng-1', role: 'sr-engineer', model: 'claude', isManager: false },
  { name: 'Eng-2', role: 'engineer', model: 'gpt', isManager: false },
  { name: 'Eng-3', role: 'engineer', model: 'grok', isManager: false },
  { name: 'QA-Lead', role: 'qa', model: 'claude', isManager: true },
  { name: 'SecOps', role: 'security', model: 'grok', isManager: false },
  { name: 'DevOps', role: 'devops', model: 'gpt', isManager: false },
  { name: 'Growth', role: 'growth', model: 'grok', isManager: false },
];

// Sprint tasks — rotate through these
const TASK_POOL = [
  // Compute tasks (cheap, 1-3cr, produce real results)
  { task: 'Generate a UUID and hash it with SHA-256', for: 'engineer' },
  { task: 'Count the words in: Slopshop is the missing CLI for AI agents with 1248 APIs', for: 'engineer' },
  { task: 'Base64 encode the string: live-hive-sprint', for: 'engineer' },
  { task: 'Generate a secure random password with 32 characters', for: 'engineer' },
  { task: 'Calculate the SHA-512 hash of: agent-orchestration-test', for: 'engineer' },
  { task: 'Reverse the string: slopshop.gg is the cosmos of AI', for: 'engineer' },
  { task: 'Slugify the text: Live Breathing Hive Sprint Results', for: 'engineer' },
  { task: 'Validate the email format: test@slopshop.gg', for: 'qa' },
  { task: 'Extract all numbers from: We have 1248 APIs, 927 handlers, and 85 tables', for: 'qa' },
  { task: 'Generate a TOTP code for testing 2FA', for: 'security' },
  { task: 'Check if the JSON is valid: {"agents": 30, "hives": 5}', for: 'qa' },
  { task: 'Calculate statistics for the dataset: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]', for: 'engineer' },
  // Memory tasks (free, 0cr)
  { task: 'Store sprint progress in memory with key sprint-status and value sprint-running', for: 'devops' },
  { task: 'Retrieve the value stored at key sprint-status from memory', for: 'devops' },
  // Analysis tasks
  { task: 'Analyze the text sentiment of: Slopshop is crushing it with 100 sprints of agent execution', for: 'pm' },
  { task: 'Extract keywords from: AI agent orchestration platform with persistent memory and multi-LLM support', for: 'pm' },
  { task: 'Check the readability score of: The slopshop CLI provides 1248 real APIs for AI agents across 78 categories', for: 'pm' },
  // Growth tasks
  { task: 'Generate a catchy slogan by reversing and slugifying: The Future of Agent Infrastructure', for: 'growth' },
  { task: 'Calculate the cost estimate for 1000 API calls at 1 credit each', for: 'growth' },
  { task: 'Generate a random integer between 1 and 100 for A/B test variant assignment', for: 'growth' },
];

async function main() {
  console.log('\n  ╔═══════════════════════════════════════════════════════════╗');
  console.log('  ║  100-SPRINT LIVE HIVE — Real Execution + Manager Accountability  ║');
  console.log('  ╚═══════════════════════════════════════════════════════════╝\n');

  const bal = await api('GET', '/v1/credits/balance');
  const balance = (bal.data || bal).balance || 0;
  console.log('  Balance: ' + balance + ' credits');
  console.log('  Est cost: ~500-800cr (100 sprints x 5-8cr avg per sprint)\n');

  // Launch org
  const orgRes = await api('POST', '/v1/org/launch', {
    name: '100-Sprint Hive',
    agents: TEAM.map(a => ({ ...a, skills: [a.role] })),
    channels: ['general', 'standups', 'results', 'firings', 'leadership'],
    auto_handoff: true,
  });
  const org = orgRes.data || orgRes;
  const orgId = org.org_id;
  const hive = org.hive_id || 'hive-' + orgId.slice(0, 8);
  console.log('  Org: ' + orgId.slice(0, 8) + ' | Agents: ' + TEAM.length + ' | Hive: ' + hive + '\n');

  // Performance tracking
  const perf = {};
  for (const a of TEAM) perf[a.name] = { shipped: 0, failed: 0, idle: 0, consecutive_bad: 0, fired: false, results: [] };
  let totalCredits = 0;
  let fires = 0, hires = 0;

  // Run 100 sprints
  for (let sprint = 1; sprint <= 100; sprint++) {
    const sprintStart = Date.now();
    const sprintResults = [];

    // Pick 3-4 agents to work this sprint (rotating)
    const activeAgents = TEAM.filter(a => !perf[a.name].fired).slice(0, 5);
    const workers = activeAgents.slice(0, Math.min(3, activeAgents.length));

    for (const agent of workers) {
      // Pick a task matching agent role
      const roleTasks = TASK_POOL.filter(t => t.for === agent.role || t.for === 'engineer');
      const task = roleTasks[sprint % roleTasks.length];

      // Execute real API call
      const result = await api('POST', '/v1/agent/run', { task: task.task });
      const data = result.data || result;
      const steps = data.steps || [];
      const hasResult = steps.some(s => s.result && Object.keys(s.result).length > 0);
      const credits = data.total_credits || 20;
      totalCredits += credits;

      // Score this execution
      if (hasResult) {
        perf[agent.name].shipped++;
        perf[agent.name].consecutive_bad = 0;
        const firstResult = steps.find(s => s.result && Object.keys(s.result).length > 0);
        const preview = JSON.stringify(firstResult?.result || {}).slice(0, 60);
        perf[agent.name].results.push(preview);
        sprintResults.push({ agent: agent.name, ok: true, preview, credits });
      } else {
        perf[agent.name].failed++;
        perf[agent.name].consecutive_bad++;
        sprintResults.push({ agent: agent.name, ok: false, credits });
      }
    }

    // Manager review — check if managers' teams are producing
    for (const agent of TEAM.filter(a => a.isManager && !perf[a.name].fired)) {
      const teamOk = sprintResults.filter(r => r.ok).length;
      const teamTotal = sprintResults.length;
      if (teamTotal > 0 && teamOk / teamTotal < 0.5) {
        perf[agent.name].consecutive_bad++;
      } else if (teamTotal > 0) {
        perf[agent.name].shipped++;
        perf[agent.name].consecutive_bad = Math.max(0, perf[agent.name].consecutive_bad - 1);
      }
    }

    // FIRE CHECK — 5 consecutive bad sprints
    for (const agent of TEAM) {
      if (perf[agent.name].fired) continue;
      if (perf[agent.name].consecutive_bad >= 5) {
        perf[agent.name].fired = true;
        fires++;
        await post(hive, 'firings', 'CEO', 'FIRED: ' + agent.name + ' (' + agent.role + ') — 5 consecutive bad sprints. Shipping rate: ' + Math.round(perf[agent.name].shipped / (perf[agent.name].shipped + perf[agent.name].failed) * 100) + '%');
        // Hire replacement
        hires++;
        const newName = agent.name + '-v' + (fires);
        TEAM.push({ name: newName, role: agent.role, model: ['claude', 'gpt', 'grok'][fires % 3], isManager: agent.isManager });
        perf[newName] = { shipped: 0, failed: 0, idle: 0, consecutive_bad: 0, fired: false, results: [] };
        await post(hive, 'general', 'CEO', 'HIRED: ' + newName + ' replacing ' + agent.name + '. Welcome aboard.');
      }
    }

    // Post standup every sprint
    const okCount = sprintResults.filter(r => r.ok).length;
    const preview = sprintResults.filter(r => r.ok).map(r => r.agent + ':' + r.preview?.slice(0, 30)).join(' | ');
    await post(hive, 'standups', 'CEO', 'S' + sprint + ': ' + okCount + '/' + sprintResults.length + ' shipped | ' + totalCredits + 'cr total | ' + preview);

    // Store in shared memory every 10 sprints
    if (sprint % 10 === 0) {
      await api('POST', '/v1/memory-set', { key: 'hive-100-sprint-' + sprint, value: JSON.stringify({
        sprint, totalCredits, fires, hires,
        activeAgents: TEAM.filter(a => !perf[a.name].fired).length,
        topShipper: Object.entries(perf).sort((a, b) => b[1].shipped - a[1].shipped)[0]?.[0],
      })});
    }

    // Print progress
    const elapsed = Date.now() - sprintStart;
    if (sprint <= 3 || sprint % 10 === 0 || sprint === 100) {
      const active = TEAM.filter(a => !perf[a.name].fired).length;
      console.log('  S' + String(sprint).padStart(3) + ' | ' + okCount + '/' + sprintResults.length + ' ok | ' +
        totalCredits + 'cr | ' + active + ' agents | ' + fires + ' fires | ' + elapsed + 'ms | ' +
        (preview || 'no results').slice(0, 60));
    }
  }

  // === FINAL REPORT ===
  console.log('\n  ═══════════════════════════════════════════════');
  console.log('  100 SPRINTS COMPLETE\n');

  const activeCount = TEAM.filter(a => !perf[a.name].fired).length;
  const totalShipped = Object.values(perf).reduce((s, p) => s + p.shipped, 0);
  const totalFailed = Object.values(perf).reduce((s, p) => s + p.failed, 0);

  console.log('  Credits: ' + totalCredits);
  console.log('  Agents: ' + activeCount + ' active (started ' + 10 + ', fired ' + fires + ', hired ' + hires + ')');
  console.log('  Shipped: ' + totalShipped + ' | Failed: ' + totalFailed + ' | Rate: ' + Math.round(totalShipped / (totalShipped + totalFailed) * 100) + '%\n');

  // Leaderboard
  const sorted = Object.entries(perf).filter(([_, p]) => p.shipped + p.failed > 0).sort((a, b) => b[1].shipped - a[1].shipped);
  console.log('  TOP 5:');
  for (const [name, p] of sorted.slice(0, 5)) {
    const rate = Math.round(p.shipped / (p.shipped + p.failed || 1) * 100);
    console.log('    ' + (p.fired ? '☠' : '★') + ' ' + name.padEnd(14) + p.shipped + ' shipped (' + rate + '%)' + (p.fired ? ' [FIRED]' : ''));
  }
  console.log('\n  FIRED:');
  for (const [name, p] of Object.entries(perf).filter(([_, p]) => p.fired)) {
    console.log('    ☠ ' + name.padEnd(14) + p.shipped + ' shipped, ' + p.failed + ' failed');
  }

  // Final hive message
  await post(hive, 'leadership', 'CEO', '100 SPRINTS DONE. ' + totalCredits + 'cr spent. ' + totalShipped + ' shipped. ' + fires + ' fired. ' + activeCount + ' agents remaining. Rate: ' + Math.round(totalShipped / (totalShipped + totalFailed) * 100) + '%.');

  const finalBal = await api('GET', '/v1/credits/balance');
  console.log('\n  Final balance: ' + ((finalBal.data || finalBal).balance || 0) + ' credits');
  console.log('  Org: ' + orgId + '\n');
}

main().catch(e => console.error('Fatal:', e.message));
