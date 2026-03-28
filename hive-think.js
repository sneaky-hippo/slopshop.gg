#!/usr/bin/env node
/**
 * THINKING HIVE — Agents that actually reason, collaborate, and produce insights.
 *
 * Each agent:
 * 1. Reads context from shared memory (what other agents produced)
 * 2. THINKS via LLM about their assigned problem
 * 3. Produces a concrete deliverable (analysis, copy, spec, recommendation)
 * 4. Stores it in shared memory for other agents to build on
 * 5. Posts summary to hive channel
 *
 * This is NOT a compute tool loop. This is agents using AI to think.
 */
const https = require('https'), fs = require('fs'), path = require('path');
const KEY = (() => { try { return JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return ''; } })();

function api(m, p, b) {
  return new Promise(r => {
    const o = { hostname: 'slopshop.gg', path: p, method: m, timeout: 60000,
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' } };
    const req = https.request(o, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d)); } catch(e) { r({ _err: true, raw: d.slice(0, 200) }); } });
    });
    req.on('error', e => r({ _err: true, error: e.message }));
    req.on('timeout', () => { req.destroy(); r({ _err: true, error: 'timeout' }); });
    if (b) req.write(JSON.stringify(b));
    req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// LLM think: ask the LLM a question and get a reasoned answer
async function think(prompt) {
  const res = await api('POST', '/v1/llm-think', { text: prompt });
  const d = res.data || {};
  let raw = d.answer || d.summary || d.result || '';
  if (!raw && d.raw) raw = typeof d.raw === 'string' ? d.raw : JSON.stringify(d.raw);
  if (!raw) return d._error || 'no response';
  // Clean markdown code fences from LLM output
  raw = String(raw).replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  // If it's a JSON string with an answer field, extract it
  if (raw.startsWith('{')) {
    try { const p = JSON.parse(raw); if (p.answer) raw = p.answer; } catch(e) {}
  }
  return raw;
}

// Memory operations
async function remember(key, value) {
  // Clean LLM output before storing
  if (typeof value === 'string') {
    value = value.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    if (value.startsWith('{')) {
      try { const p = JSON.parse(value); value = p.answer || p.summary || value; } catch(e) {}
    }
  }
  // Store full value — no truncation
  await api('POST', '/v1/memory-set', { key, value: typeof value === 'string' ? value : JSON.stringify(value) });
}
async function recall(key) {
  const res = await api('POST', '/v1/memory-get', { key });
  return (res.data || {}).value || null;
}

async function post(hive, channel, from, message) {
  await api('POST', '/v1/hive/' + hive + '/send', { channel, from, message: String(message).slice(0, 500) });
}

async function main() {
  console.log('\n  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║  THINKING HIVE — Agents that reason and collaborate ║');
  console.log('  ╚══════════════════════════════════════════════════════╝\n');

  // Launch org
  const orgRes = await api('POST', '/v1/org/launch', {
    name: 'Thinking Hive',
    agents: [
      { name: 'CEO', role: 'strategist', model: 'claude', skills: ['vision', 'prioritization'] },
      { name: 'CTO', role: 'architect', model: 'claude', skills: ['architecture', 'scalability'] },
      { name: 'PM', role: 'product', model: 'gpt', skills: ['specs', 'user-stories'] },
      { name: 'Eng', role: 'engineer', model: 'claude', skills: ['implementation', 'optimization'] },
      { name: 'Growth', role: 'growth', model: 'grok', skills: ['marketing', 'positioning'] },
      { name: 'Critic', role: 'critic', model: 'gpt', skills: ['finding-flaws', 'honest-feedback'] },
    ],
    channels: ['general', 'strategy', 'product', 'engineering', 'growth', 'critiques'],
    auto_handoff: true,
  });
  const org = (orgRes.data || orgRes);
  const hive = org.hive_id || 'hive-' + (org.org_id || '').slice(0, 8);
  console.log('  Org: ' + (org.org_id || '').slice(0, 8) + ' | 6 thinking agents\n');

  let totalCredits = 0;
  const insights = [];

  // ═══════════════════════════════════════
  // SPRINT 1: CEO sets strategic direction
  // ═══════════════════════════════════════
  console.log('  ── Sprint 1: CEO Strategic Analysis ──');
  const ceoThought = await think(
    'You are the CEO of slopshop.gg, an AI agent infrastructure platform. We have: 1,248 APIs, 44 CLI commands, agent orchestration (hive/org/chain), free persistent memory, MCP integration for Claude Code, smart routing (35 patterns), and self-hostable deployment.\n\n' +
    'Our competitors are Claude Code (agentic coding), OpenAI Codex CLI (code generation), and AWS Bedrock (cloud AI). We scored 9.2/10 on an independent audit but the critic noted: tool count is inflated (many are trivial regex), no autonomous code editing loop, agent orgs are messaging-based not real LLM execution.\n\n' +
    'What are our top 3 strategic priorities for the next quarter? Be specific, actionable, and honest. Each priority should have a measurable outcome.'
  );
  console.log('  CEO: ' + ceoThought.slice(0, 200));
  await remember('strategy-priorities', ceoThought);
  await post(hive, 'strategy', 'CEO', ceoThought.slice(0, 500));
  totalCredits += 10;
  insights.push({ agent: 'CEO', type: 'strategy', content: ceoThought });
  console.log('');
  await sleep(3000);

  // ═══════════════════════════════════════
  // SPRINT 2: CTO reads CEO strategy, proposes architecture
  // ═══════════════════════════════════════
  console.log('  ── Sprint 2: CTO Architecture Response ──');
  const strategy = await recall('strategy-priorities');
  const ctoThought = await think(
    'You are the CTO of slopshop.gg. The CEO just set these strategic priorities:\n\n' + (strategy || 'no strategy yet') + '\n\n' +
    'Current architecture: single Express.js server (7,400 lines), SQLite database, Railway deployment, 927 compute handlers.\n\n' +
    'Propose 3 technical initiatives that directly support the CEO\'s priorities. For each: what to build, estimated effort (days), and the technical approach. Be concrete — name specific files, endpoints, or patterns.'
  );
  console.log('  CTO: ' + ctoThought.slice(0, 200));
  await remember('tech-initiatives', ctoThought);
  await post(hive, 'engineering', 'CTO', ctoThought.slice(0, 500));
  totalCredits += 10;
  insights.push({ agent: 'CTO', type: 'architecture', content: ctoThought });
  console.log('');
  await sleep(3000);

  // ═══════════════════════════════════════
  // SPRINT 3: PM reads both, writes user stories
  // ═══════════════════════════════════════
  console.log('  ── Sprint 3: PM User Stories ──');
  const techPlan = await recall('tech-initiatives');
  const pmThought = await think(
    'You are the PM of slopshop.gg. Here\'s the context:\n\nCEO Strategy: ' + (strategy || '').slice(0, 500) + '\n\nCTO Tech Plan: ' + (techPlan || '').slice(0, 500) + '\n\n' +
    'Write 3 user stories for the highest-priority initiative. Format: "As a [user], I want to [action] so that [benefit]." Include acceptance criteria for each. These should be shippable in 1 week.'
  );
  console.log('  PM: ' + pmThought.slice(0, 200));
  await remember('user-stories', pmThought);
  await post(hive, 'product', 'PM', pmThought.slice(0, 500));
  totalCredits += 10;
  insights.push({ agent: 'PM', type: 'user-stories', content: pmThought });
  console.log('');
  await sleep(3000);

  // ═══════════════════════════════════════
  // SPRINT 4: Engineer reads stories, proposes implementation
  // ═══════════════════════════════════════
  console.log('  ── Sprint 4: Engineer Implementation Plan ──');
  const stories = await recall('user-stories');
  const engThought = await think(
    'You are a senior engineer at slopshop.gg. Here are the user stories to implement:\n\n' + (stories || '').slice(0, 800) + '\n\n' +
    'For the first user story, write a concrete implementation plan: which files to modify, what functions to add/change, what tests to write. Be specific — reference real Express.js patterns, SQLite queries, and Node.js code structures. Keep it under 200 words.'
  );
  console.log('  Eng: ' + engThought.slice(0, 200));
  await remember('implementation-plan', engThought);
  await post(hive, 'engineering', 'Eng', engThought.slice(0, 500));
  totalCredits += 10;
  insights.push({ agent: 'Eng', type: 'implementation', content: engThought });
  console.log('');
  await sleep(3000);

  // ═══════════════════════════════════════
  // SPRINT 5: Growth reads everything, writes launch plan
  // ═══════════════════════════════════════
  console.log('  ── Sprint 5: Growth Launch Plan ──');
  const growthThought = await think(
    'You are the growth lead at slopshop.gg. Context:\n\nStrategy: ' + (strategy || '').slice(0, 300) + '\nProduct: ' + (stories || '').slice(0, 300) + '\n\n' +
    'Write a launch plan for the first feature shipping this week. Include: 1) Product Hunt title and tagline (under 60 chars), 2) Hacker News Show HN post title, 3) Three tweet hooks, 4) One-paragraph dev.to intro. Make it compelling — focus on what developers care about.'
  );
  console.log('  Growth: ' + growthThought.slice(0, 200));
  await remember('launch-plan', growthThought);
  await post(hive, 'growth', 'Growth', growthThought.slice(0, 500));
  totalCredits += 10;
  insights.push({ agent: 'Growth', type: 'launch-plan', content: growthThought });
  console.log('');
  await sleep(3000);

  // ═══════════════════════════════════════
  // SPRINT 6: Critic reads ALL outputs, finds flaws
  // ═══════════════════════════════════════
  console.log('  ── Sprint 6: Critic Review ──');
  const allWork = [strategy, techPlan, stories, engThought, growthThought].filter(Boolean).map(s => s.slice(0, 300)).join('\n---\n');
  const criticThought = await think(
    'You are a brutally honest product critic reviewing slopshop.gg\'s sprint output. Here\'s what the team produced:\n\n' + allWork + '\n\n' +
    'Score each output 1-10 and explain why. What\'s the weakest link? What would you change? What\'s missing? Be specific and constructive, not just negative.'
  );
  console.log('  Critic: ' + criticThought.slice(0, 200));
  await remember('critic-review', criticThought);
  await post(hive, 'critiques', 'Critic', criticThought.slice(0, 500));
  totalCredits += 10;
  insights.push({ agent: 'Critic', type: 'critique', content: criticThought });
  console.log('');
  await sleep(3000);

  // ═══════════════════════════════════════
  // SPRINT 7: CEO reads critic, revises strategy
  // ═══════════════════════════════════════
  console.log('  ── Sprint 7: CEO Revision Based on Feedback ──');
  const critique = await recall('critic-review');
  const ceoRevision = await think(
    'You are the CEO of slopshop.gg. Your critic just reviewed the team\'s work:\n\n' + (critique || '').slice(0, 600) + '\n\n' +
    'Based on this feedback, what\'s the single most important thing to change? Write a 3-sentence directive to the team. Be decisive.'
  );
  console.log('  CEO: ' + ceoRevision.slice(0, 200));
  await remember('ceo-revision', ceoRevision);
  await post(hive, 'general', 'CEO', 'REVISION: ' + ceoRevision.slice(0, 450));
  totalCredits += 10;
  insights.push({ agent: 'CEO', type: 'revision', content: ceoRevision });
  console.log('');
  await sleep(3000);

  // ═══════════════════════════════════════
  // SPRINT 8-10: Second loop — deeper work
  // ═══════════════════════════════════════
  console.log('  ── Sprint 8: CTO Revised Architecture ──');
  const revision = await recall('ceo-revision');
  const ctoRevised = await think(
    'The CEO revised the direction: ' + (revision || '').slice(0, 400) + '\n\nAs CTO, revise your technical plan accordingly. What changes? What stays? 3 bullet points max.'
  );
  console.log('  CTO: ' + ctoRevised.slice(0, 150));
  await remember('tech-revised', ctoRevised);
  await post(hive, 'engineering', 'CTO', ctoRevised.slice(0, 500));
  totalCredits += 10;
  insights.push({ agent: 'CTO', type: 'revised-plan', content: ctoRevised });
  console.log('');
  await sleep(3000);

  console.log('  ── Sprint 9: PM Final Spec ──');
  const pmFinal = await think(
    'Based on the revised direction: ' + (revision || '').slice(0, 300) + '\nAnd CTO plan: ' + (ctoRevised || '').slice(0, 300) + '\n\nWrite the final 1-page spec for what ships this week. Include: feature name, user-facing description, API endpoint, and success metric. Keep it tight.'
  );
  console.log('  PM: ' + pmFinal.slice(0, 150));
  await remember('final-spec', pmFinal);
  await post(hive, 'product', 'PM', pmFinal.slice(0, 500));
  totalCredits += 10;
  insights.push({ agent: 'PM', type: 'final-spec', content: pmFinal });
  console.log('');
  await sleep(3000);

  console.log('  ── Sprint 10: Critic Final Score ──');
  const finalWork = [ceoRevision, ctoRevised, pmFinal].filter(Boolean).map(s => s.slice(0, 300)).join('\n---\n');
  const finalCritique = await think(
    'Review the revised outputs:\n\n' + finalWork + '\n\nScore the overall sprint 1-10. Is this team ready to ship? One paragraph verdict.'
  );
  console.log('  Critic: ' + finalCritique.slice(0, 200));
  await remember('final-verdict', finalCritique);
  await post(hive, 'critiques', 'Critic', finalCritique.slice(0, 500));
  totalCredits += 10;
  insights.push({ agent: 'Critic', type: 'final-verdict', content: finalCritique });

  // ═══════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════
  console.log('\n  ═══════════════════════════════════════');
  console.log('  10 THINKING SPRINTS COMPLETE\n');
  console.log('  Credits: ' + totalCredits + 'cr (10 LLM calls × 10cr)');
  console.log('  Insights: ' + insights.length);
  console.log('  Memory keys stored: ' + insights.length);
  console.log('');
  console.log('  DELIVERABLES IN SHARED MEMORY:');
  console.log('    strategy-priorities  — CEO strategic direction');
  console.log('    tech-initiatives     — CTO architecture plan');
  console.log('    user-stories         — PM user stories');
  console.log('    implementation-plan  — Engineer impl spec');
  console.log('    launch-plan          — Growth launch strategy');
  console.log('    critic-review        — Critic feedback');
  console.log('    ceo-revision         — CEO revised direction');
  console.log('    tech-revised         — CTO revised plan');
  console.log('    final-spec           — PM final spec');
  console.log('    final-verdict        — Critic final score');
  console.log('');
  console.log('  Each agent READ others\' work before producing their own.');
  console.log('  Org: ' + org.org_id + '\n');
}

main().catch(e => console.error('Fatal:', e.message));
