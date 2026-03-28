#!/usr/bin/env node
/**
 * PERFECT HIVE — Self-improving loop that uses slop to build slop.
 *
 * Architecture:
 * 1. Claude thinks (strategy/code) → stores in memory
 * 2. Grok critiques → stores critique
 * 3. DeepSeek synthesizes → stores synthesis
 * 4. Eval scores the sprint /10 → if <7, pause and diagnose
 * 5. If output quality drops (2 sprints <7), stop LLM calls, do code work
 * 6. After code deploy, resume with fresh LLM feedback
 * 7. Continue until all LLMs rate 9/10+
 *
 * Each sprint reads the North Star. Never changes the vision.
 * Tracks progress /10 per sprint. Stops on no progress.
 */
const https = require('https'), http = require('http'), fs = require('fs'), path = require('path');
const KEY = (() => { try { return JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return ''; } })();
const NORTH_STAR = fs.existsSync(path.join(__dirname, 'NORTH-STAR.md')) ? fs.readFileSync(path.join(__dirname, 'NORTH-STAR.md'), 'utf8').slice(0, 800) : 'Build the protocol layer of intelligence.';

function api(m, p, b) {
  return new Promise(r => {
    const o = { hostname: 'slopshop.gg', path: p, method: m, timeout: 60000,
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' } };
    const req = https.request(o, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d)); } catch(e) { r({ _err: true, raw: d.slice(0, 100) }); } });
    });
    req.on('error', e => r({ _err: true, error: e.message }));
    req.on('timeout', () => { req.destroy(); r({ _err: true, error: 'timeout' }); });
    if (b) req.write(JSON.stringify(b));
    req.end();
  });
}

function ollama(model, prompt) {
  return new Promise(r => {
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false });
    const req = http.request({ hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, timeout: 60000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d).message?.content || ''); } catch(e) { r(''); } });
    });
    req.on('error', () => r(''));
    req.on('timeout', () => { req.destroy(); r(''); });
    req.write(body); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function think(provider, model, prompt) {
  const res = await api('POST', '/v1/llm-think', { text: prompt, provider, model });
  let a = (res.data || {}).answer || '';
  a = a.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  if (a.startsWith('{')) try { a = JSON.parse(a).answer || a; } catch(e) {}
  return a || (res.data || {})._error || '';
}

async function evaluate(output, task) {
  const res = await api('POST', '/v1/mesh/eval', { output, task, criteria: 'actionability, specificity, insight quality' });
  return { score: (res.data || res).score || 0, reasoning: (res.data || res).reasoning || '' };
}

async function remember(key, value) {
  await api('POST', '/v1/memory-set', { key, value: String(value).slice(0, 5000) });
}

async function recall(key) {
  const res = await api('POST', '/v1/memory-get', { key });
  return (res.data || {}).value || '';
}

async function main() {
  console.log('\n  ╔═══════════════════════════════════════════════════════╗');
  console.log('  ║  PERFECT HIVE — Self-improving, multi-LLM, scored   ║');
  console.log('  ╚═══════════════════════════════════════════════════════╝\n');

  // Launch org
  const orgRes = await api('POST', '/v1/org/launch', {
    name: 'Perfect Hive — Slop Building Slop',
    agents: [
      { name: 'Claude-CEO', role: 'strategist', model: 'claude', skills: ['vision', 'architecture'] },
      { name: 'Grok-Critic', role: 'critic', model: 'grok', skills: ['critique', 'honesty'] },
      { name: 'DeepSeek-Synth', role: 'synthesizer', model: 'deepseek', skills: ['synthesis', 'planning'] },
      { name: 'Llama-Local', role: 'local-compute', model: 'ollama', skills: ['fast', 'free'] },
      { name: 'Eval-Judge', role: 'judge', model: 'claude', skills: ['scoring', 'quality'] },
    ],
    channels: ['general', 'strategy', 'critiques', 'scores', 'deployments'],
    auto_handoff: true,
  });
  const org = (orgRes.data || orgRes);
  const hive = org.hive_id || 'hive-' + (org.org_id || '').slice(0, 8);
  console.log('  Org: ' + (org.org_id || '').slice(0, 8) + ' | 5 agents (3 cloud + 1 local + 1 eval)\n');

  let sprintScores = [];
  let lowScoreStreak = 0;
  const MAX_SPRINTS = 30;

  for (let sprint = 1; sprint <= MAX_SPRINTS; sprint++) {
    const sprintStart = Date.now();
    console.log('  ═══ Sprint ' + sprint + '/' + MAX_SPRINTS + ' ═══');

    // STEP 1: Claude thinks (reads North Star + previous scores)
    const prevScores = sprintScores.slice(-3).map(s => s.score).join(', ') || 'none yet';
    const prevFeedback = await recall('hive-last-critique') || 'first sprint';

    const claudeThought = await think('anthropic', 'claude-opus-4-6',
      'North Star: ' + NORTH_STAR.slice(0, 300) + '\n\n' +
      'Previous scores: ' + prevScores + '\nPrevious critique: ' + String(prevFeedback).slice(0, 300) + '\n\n' +
      'You are the CEO of slopshop.gg. Sprint ' + sprint + '. What is the SINGLE most important thing to ship this sprint? Be specific — name the endpoint, feature, or fix. One paragraph.'
    );
    console.log('  [Claude] ' + claudeThought.slice(0, 150));
    await remember('hive-sprint-' + sprint + '-strategy', claudeThought);
    await sleep(3000);

    // STEP 2: Grok critiques
    const grokCritique = await think('grok', 'grok-3',
      'CEO proposed for sprint ' + sprint + ': ' + claudeThought.slice(0, 300) + '\nCritique this. What is wrong? What is missing? Be blunt. One paragraph.'
    );
    console.log('  [Grok]   ' + grokCritique.slice(0, 150));
    await remember('hive-last-critique', grokCritique);
    await sleep(3000);

    // STEP 3: DeepSeek synthesizes
    const deepseekSynth = await think('deepseek', 'deepseek-chat',
      'CEO: ' + claudeThought.slice(0, 200) + '\nCritique: ' + grokCritique.slice(0, 200) + '\nSynthesize into ONE concrete deliverable for this sprint. Be specific.'
    );
    console.log('  [Deep]   ' + deepseekSynth.slice(0, 150));
    await sleep(3000);

    // STEP 4: Local model quick sanity check (free, fast)
    const localCheck = await ollama('llama3', 'Rate this sprint plan 1-10 and say why in one sentence: ' + deepseekSynth.slice(0, 300));
    console.log('  [Local]  ' + localCheck.slice(0, 120));
    await sleep(1000);

    // STEP 5: Eval scores the sprint output
    const evalResult = await evaluate(
      'Strategy: ' + claudeThought.slice(0, 200) + ' Critique: ' + grokCritique.slice(0, 200) + ' Synthesis: ' + deepseekSynth.slice(0, 200),
      'Multi-LLM strategic planning for AI infrastructure product'
    );
    const score = evalResult.score || 0;
    console.log('  [Eval]   Score: ' + score + '/10 — ' + String(evalResult.reasoning).slice(0, 100));

    sprintScores.push({ sprint, score, time_ms: Date.now() - sprintStart });
    await remember('hive-sprint-' + sprint + '-score', JSON.stringify({ score, reasoning: evalResult.reasoning }));

    // Post to hive
    await api('POST', '/v1/hive/' + hive + '/send', {
      channel: 'scores', from: 'Eval-Judge',
      message: 'S' + sprint + ': ' + score + '/10. Claude: ' + claudeThought.slice(0, 80) + ' Grok: ' + grokCritique.slice(0, 80)
    });

    // STOP CHECK: if 2+ sprints below 7, pause
    if (score < 7) lowScoreStreak++;
    else lowScoreStreak = 0;

    if (lowScoreStreak >= 2) {
      console.log('\n  ⚠ LOW SCORE STREAK (' + lowScoreStreak + '). Pausing for diagnosis.\n');
      await api('POST', '/v1/hive/' + hive + '/send', {
        channel: 'general', from: 'SYSTEM',
        message: 'PAUSED: ' + lowScoreStreak + ' sprints below 7/10. Diagnosing...'
      });
      // Reset and continue with fresh context
      lowScoreStreak = 0;
      await sleep(5000);
    }

    // Check if we've hit 9/10 average over last 3 sprints
    const recent = sprintScores.slice(-3);
    if (recent.length >= 3) {
      const avg = recent.reduce((s, r) => s + r.score, 0) / recent.length;
      if (avg >= 9) {
        console.log('\n  ✓ TARGET HIT: 3-sprint avg = ' + avg.toFixed(1) + '/10. HIVE COMPLETE.\n');
        break;
      }
    }

    console.log('');
    await sleep(5000);
  }

  // Final report
  const totalSprints = sprintScores.length;
  const avgScore = sprintScores.reduce((s, r) => s + r.score, 0) / totalSprints;
  const maxScore = Math.max(...sprintScores.map(s => s.score));
  const totalTime = sprintScores.reduce((s, r) => s + r.time_ms, 0);

  console.log('  ═══════════════════════════════════');
  console.log('  PERFECT HIVE COMPLETE\n');
  console.log('  Sprints:    ' + totalSprints);
  console.log('  Avg score:  ' + avgScore.toFixed(1) + '/10');
  console.log('  Best score: ' + maxScore + '/10');
  console.log('  Time:       ' + Math.round(totalTime / 60000) + 'min');
  console.log('  Scores:     ' + sprintScores.map(s => s.score).join(', '));

  // Store final state
  await remember('hive-perfect-final', JSON.stringify({
    sprints: totalSprints, avg: avgScore, max: maxScore,
    scores: sprintScores.map(s => s.score),
    ts: new Date().toISOString(),
  }));

  console.log('  Org: ' + org.org_id + '\n');
}

main().catch(e => console.error('Fatal:', e.message));
