#!/usr/bin/env node
/**
 * OPTIMIZED HIVE v3 — Full logging, all 7 models, 2s pace, scored /10
 *
 * Every sprint creates a detailed log entry in memory.
 * Every agent action is tracked with timestamp, model, cost, result.
 * Reviews use numbered ratings. Local models do free work.
 * Outputs a JSON log file for analysis.
 */
const https = require('https'), http = require('http'), fs = require('fs'), path = require('path');
const KEY = (() => { try { return JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return ''; } })();
const LOG_FILE = path.join(__dirname, 'hive-log.json');

function api(m, p, b) {
  return new Promise(r => {
    const o = { hostname: 'slopshop.gg', path: p, method: m, timeout: 30000,
      headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' } };
    const req = https.request(o, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d)); } catch(e) { r({ _err: true }); } });
    });
    req.on('error', () => r({ _err: true }));
    req.on('timeout', () => { req.destroy(); r({ _err: true }); });
    if (b) req.write(JSON.stringify(b));
    req.end();
  });
}

function local(model, prompt) {
  return new Promise(r => {
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false, options: { num_ctx: 4096 } });
    const req = http.request({ hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, timeout: 60000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d).message?.content || ''); } catch(e) { r(''); } });
    });
    req.on('error', () => r('')); req.on('timeout', () => { req.destroy(); r(''); });
    req.write(body); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function think(prov, model, text) {
  return api('POST', '/v1/llm-think', { text, provider: prov, model }).then(res => {
    let a = (res.data || {}).answer || '';
    if (a.includes('```')) a = a.replace(/```json\s*/g, '').replace(/```/g, '');
    if (a.startsWith('{')) try { a = JSON.parse(a).answer || a; } catch(e) {}
    return a.trim();
  });
}

// All test targets
const TESTS = [
  { name: 'uuid', slug: 'crypto-uuid', body: {}, check: r => !!(r.data||{}).uuid },
  { name: 'hash', slug: 'crypto-hash-sha256', body: null, check: r => !!(r.data||{}).hash },
  { name: 'words', slug: 'text-word-count', body: { text: 'one two three four five' }, check: r => (r.data||{}).words === 5 },
  { name: 'reverse', slug: 'text-reverse', body: null, check: r => !!(r.data||{}).result },
  { name: 'password', slug: 'crypto-password-generate', body: { length: 24 }, check: r => (r.data||{}).length === 24 },
  { name: 'slugify', slug: 'text-slugify', body: null, check: r => !!(r.data||{}).slug },
  { name: 'memory', slug: 'memory-set', body: null, check: r => !r._err },
  { name: 'introspect', slug: null, check: r => r.slug === 'crypto-uuid' },
  { name: 'route', slug: null, check: r => !!(r.recommended||{}).slug },
  { name: 'context', slug: null, check: r => !!r.capabilities },
  { name: 'state', slug: 'state/set', body: null, check: r => !!r.version },
  { name: 'workflow', slug: 'workflows/run', body: { steps: [{ api: 'crypto-uuid' }] }, check: r => r.steps_executed === 1 },
  { name: 'compare', slug: 'compare', body: { prompt: 'Say OK', models: ['anthropic'] }, check: r => (r.results||[]).length > 0 },
  { name: 'telemetry', slug: null, check: r => r.total_calls !== undefined },
  { name: 'health', slug: null, check: r => r.status === 'healthy' },
];

function getTestCall(test, sprint) {
  const ts = Date.now();
  if (test.name === 'introspect') return api('GET', '/v1/introspect?slug=crypto-uuid');
  if (test.name === 'route') return api('POST', '/v1/route', { task: 'generate uuid ' + ts });
  if (test.name === 'context') return api('POST', '/v1/context/session', {});
  if (test.name === 'telemetry') return api('GET', '/v1/telemetry?since=1h');
  if (test.name === 'health') return api('GET', '/v1/health');
  const body = test.body || { text: test.name + '-' + sprint + '-' + ts, key: 'hive-' + ts, value: 'ok' };
  return api('POST', '/v1/' + test.slug, body);
}

async function main() {
  const sprintCount = parseInt(process.argv[2]) || 50;
  console.log('OPTIMIZED HIVE v3 — ' + sprintCount + ' sprints, 7 models, full logging\n');

  const hiveLog = { started: new Date().toISOString(), sprints: [], reviews: [] };

  const orgRes = await api('POST', '/v1/org/launch', {
    name: 'Optimized Hive v3',
    agents: [
      { name: 'Claude-CEO', role: 'ceo', model: 'claude', skills: ['strategy'] },
      { name: 'GPT-Eng', role: 'engineer', model: 'gpt', skills: ['build'] },
      { name: 'Grok-Critic', role: 'critic', model: 'grok', skills: ['critique'] },
      { name: 'DeepSeek-Synth', role: 'synthesizer', model: 'deepseek', skills: ['synthesis'] },
      { name: 'Llama-QA', role: 'qa', model: 'ollama', skills: ['test'] },
      { name: 'Mistral-Doc', role: 'docs', model: 'ollama', skills: ['docs'] },
      { name: 'DSCoder-Review', role: 'reviewer', model: 'ollama', skills: ['code-review'] },
    ],
    channels: ['general', 'tests', 'scores', 'logs'],
    auto_handoff: true,
  });
  const hive = (orgRes.data || orgRes).hive_id || 'hive-default';

  let totalPass = 0, totalFail = 0, totalCr = 0;

  for (let sprint = 1; sprint <= sprintCount; sprint++) {
    const sprintLog = { sprint, ts: new Date().toISOString(), tests: [], thinks: [], scores: {} };

    // TEST PHASE: 4 random tests per sprint (2s pace)
    const idxs = [...new Set([sprint % TESTS.length, (sprint*3+1) % TESTS.length, (sprint*7+2) % TESTS.length, (sprint*11+3) % TESTS.length])];
    let pass = 0, fail = 0;

    for (const idx of idxs) {
      const test = TESTS[idx];
      const start = Date.now();
      const result = await getTestCall(test, sprint);
      const ms = Date.now() - start;
      const ok = test.check(result);
      if (ok) { pass++; totalPass++; } else { fail++; totalFail++; }
      totalCr += (result.meta?.credits_used || 1);
      sprintLog.tests.push({ name: test.name, pass: ok, ms, credits: result.meta?.credits_used || 1 });
    }

    // THINK PHASE: Every 5th sprint, rotate through ALL models
    if (sprint % 5 === 0) {
      const passRate = Math.round(totalPass / (totalPass + totalFail) * 100);
      const prompt = 'slopshop.gg sprint ' + sprint + ': ' + passRate + '% pass rate (' + totalPass + ' tests). Rate the product /10 and name ONE specific improvement. Format: SCORE: X/10 IMPROVEMENT: [specific thing]';

      // Cloud models
      const cloudModels = [['anthropic', 'claude-opus-4-6', 'Claude'], ['openai', 'gpt-4.1', 'GPT'], ['grok', 'grok-3', 'Grok'], ['deepseek', 'deepseek-chat', 'DeepSeek']];
      const modelIdx = Math.floor((sprint / 5 - 1) % cloudModels.length);
      const [prov, model, label] = cloudModels[modelIdx];

      const thought = await think(prov, model, prompt);
      const scoreMatch = thought.match(/(\d+)\s*\/\s*10/) || thought.match(/SCORE:\s*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
      sprintLog.thinks.push({ model: label, provider: prov, thought: thought.slice(0, 300), score });
      sprintLog.scores[label] = score;
      totalCr += 10;

      console.log('  [' + label.padEnd(8) + '] ' + score + '/10 — ' + thought.slice(0, 100));
      await sleep(2000);

      // Local model review (FREE, every 5th sprint)
      const localModels = ['llama3', 'mistral', 'deepseek-coder-v2'];
      const localModel = localModels[Math.floor((sprint / 5 - 1) % localModels.length)];
      const localThought = await local(localModel, prompt);
      const localScore = (localThought.match(/(\d+)\s*\/\s*10/) || [])[1] || 0;
      sprintLog.thinks.push({ model: localModel, provider: 'local', thought: localThought.slice(0, 300), score: parseInt(localScore) || 0 });
      sprintLog.scores[localModel] = parseInt(localScore) || 0;

      console.log('  [' + localModel.slice(0, 8).padEnd(8) + '] ' + localScore + '/10 — ' + localThought.slice(0, 80));
    }

    // FULL COUNCIL: Every 25th sprint
    if (sprint % 25 === 0) {
      console.log('\n  === COUNCIL at Sprint ' + sprint + ' ===');
      const passRate = Math.round(totalPass / (totalPass + totalFail) * 100);
      const review = { sprint, ts: new Date().toISOString(), scores: {} };

      for (const [prov, model, label] of [['anthropic', 'claude-opus-4-6', 'Claude'], ['openai', 'gpt-4.1', 'GPT'], ['grok', 'grok-3', 'Grok'], ['deepseek', 'deepseek-chat', 'DeepSeek']]) {
        const r = await think(prov, model, 'Rate slopshop.gg /10 overall. ' + totalPass + ' tests passed at ' + passRate + '%. 1255 APIs, 7 models, workflows, telemetry, eval. Format: SCORE: X/10 then one sentence.');
        const s = (r.match(/(\d+)\s*\/\s*10/) || [])[1] || 0;
        review.scores[label] = parseInt(s);
        console.log('  ' + label + ': ' + s + '/10 — ' + r.slice(0, 100));
        totalCr += 10;
        await sleep(2000);
      }
      for (const m of ['llama3', 'mistral', 'deepseek-coder-v2']) {
        const r = await local(m, 'Rate this AI platform /10: 1255 APIs, 7 models, ' + passRate + '% pass. SCORE: X/10 then one sentence.');
        const s = (r.match(/(\d+)\s*\/\s*10/) || [])[1] || 0;
        review.scores[m] = parseInt(s);
        console.log('  ' + m + ': ' + s + '/10 — ' + r.slice(0, 80));
      }
      hiveLog.reviews.push(review);
      console.log('');
    }

    hiveLog.sprints.push(sprintLog);

    // Print every sprint (short)
    const passRate = Math.round(totalPass / (totalPass + totalFail) * 100);
    if (sprint <= 3 || sprint % 10 === 0 || sprint === sprintCount) {
      console.log('  S' + String(sprint).padStart(3) + ' | ' + pass + '/' + idxs.length + ' | total: ' + totalPass + '/' + (totalPass + totalFail) + ' (' + passRate + '%) | ' + totalCr + 'cr');
    }

    // Save log every 10 sprints
    if (sprint % 10 === 0) {
      fs.writeFileSync(LOG_FILE, JSON.stringify(hiveLog, null, 2));
    }

    await sleep(2000);
  }

  // Final save
  hiveLog.completed = new Date().toISOString();
  hiveLog.summary = { sprints: sprintCount, pass: totalPass, fail: totalFail, rate: Math.round(totalPass / (totalPass + totalFail) * 100), credits: totalCr };
  fs.writeFileSync(LOG_FILE, JSON.stringify(hiveLog, null, 2));

  console.log('\n═══════════════════════');
  console.log('HIVE COMPLETE\n');
  console.log('Pass: ' + totalPass + '/' + (totalPass + totalFail) + ' (' + hiveLog.summary.rate + '%)');
  console.log('Credits: ' + totalCr);
  console.log('Reviews: ' + hiveLog.reviews.length);
  console.log('Log: ' + LOG_FILE);

  // Print review scores
  if (hiveLog.reviews.length > 0) {
    console.log('\nCOUNCIL SCORES:');
    for (const r of hiveLog.reviews) {
      console.log('  S' + r.sprint + ': ' + Object.entries(r.scores).map(([m, s]) => m + '=' + s).join(', '));
    }
  }
}

main().catch(e => console.error('Fatal:', e.message));
