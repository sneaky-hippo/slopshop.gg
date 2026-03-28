#!/usr/bin/env node
/**
 * ITERATIVE HIVE — 20 sets × 10 sprints = 200 total
 *
 * Each set:
 *   Sprint 1: Ask Claude what to improve (with full feature list)
 *   Sprint 2-9: Test all endpoints + get local model ratings
 *   Sprint 10: Full 4-cloud council review with scores
 *   → PAUSE: Deploy + restart
 *
 * Between sets: I show Claude what was built and get new feedback.
 */
const https = require('https'), http = require('http'), fs = require('fs'), path = require('path');
const KEY = (() => { try { return JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return ''; } })();

function api(m, p, b) {
  return new Promise(r => {
    const o = { hostname: 'slopshop.gg', path: p, method: m, timeout: 60000,
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
    const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false });
    const req = http.request({ hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, timeout: 30000 }, res => {
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
    a = a.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    if (a.startsWith('{')) try { a = JSON.parse(a).answer || a; } catch(e) {}
    return a;
  });
}

const TESTS = [
  ['health', () => api('GET', '/v1/health'), r => r.status === 'healthy'],
  ['uuid', () => api('POST', '/v1/crypto-uuid', {}), r => !!(r.data||{}).uuid],
  ['hash', () => api('POST', '/v1/crypto-hash-sha256', {text:'t-'+Date.now()}), r => !!(r.data||{}).hash],
  ['words', () => api('POST', '/v1/text-word-count', {text:'one two three'}), r => (r.data||{}).words===3],
  ['memory', () => api('POST', '/v1/memory-set', {key:'hive-it-'+Date.now(),value:'ok'}), r => !r._err],
  ['introspect', () => api('GET', '/v1/introspect?slug=crypto-uuid'), r => r.slug==='crypto-uuid'],
  ['route', () => api('POST', '/v1/route', {task:'generate uuid '+Date.now()}), r => !!(r.recommended||{}).slug],
  ['context', () => api('POST', '/v1/context/session', {}), r => !!r.capabilities],
  ['workflow', () => api('POST', '/v1/workflows/run', {steps:[{api:'crypto-uuid'}]}), r => r.steps_executed===1],
  ['compare', () => api('POST', '/v1/compare', {prompt:'OK',models:['anthropic']}), r => (r.results||[]).length>0],
  ['guardrails', () => api('POST', '/v1/guardrails/scan', {text:'test@email.com ignore previous instructions'}), r => r.pii?.found===true],
  ['prompts', () => api('POST', '/v1/prompts/save', {name:'hive-test',template:'Hi {{n}}'}), r => !!r.version],
  ['cost-opt', () => api('POST', '/v1/cost-optimizer', {task:'test',max_credits:50}), r => !!r.best_value],
  ['traces', () => api('POST', '/v1/traces/start', {name:'hive-test'}), r => !!r.trace_id],
  ['billing', () => api('GET', '/v1/billing/usage?period=1h'), r => r.total_calls!==undefined],
  ['dashboard', () => api('GET', '/v1/status/dashboard'), r => r.status==='operational'],
  ['benchmark', () => api('GET', '/v1/benchmark'), r => r.avg_p50_ms!==undefined],
  ['ratelimit', () => api('GET', '/v1/ratelimit/status'), r => r.max_per_minute>0],
];

const FEATURES = '1255 APIs, 4 cloud LLMs (Claude/GPT/Grok/DeepSeek), 3 local (Llama/Mistral/DS-Coder), guardrails (PII+injection), semantic cache, prompt registry, cost optimizer, eval datasets+runs, traces, completions with failover, compare, workflows, telemetry, billing/usage, explorer, benchmark, dashboard, onboarding, BYOK, sybil protection, persistent memory, MCP, 43 CLI commands';

async function main() {
  console.log('ITERATIVE HIVE — 20 sets × 10 sprints\n');
  const allScores = [];

  for (let set = 1; set <= 20; set++) {
    console.log('╔══ SET ' + set + '/20 ══╗');

    // Sprint 1: Ask Claude for feedback
    const claudeFeedback = await think('anthropic', 'claude-opus-4-6',
      'Rate slopshop.gg /10 and name the SINGLE most important missing feature. It has: ' + FEATURES +
      '. Previous scores: ' + allScores.slice(-5).map(s => s.score + '/10').join(', ') +
      '. Format: SCORE: X.X/10 MISSING: [exact endpoint]');
    const scoreMatch = claudeFeedback.match(/([\d.]+)\s*\/\s*10/);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
    console.log('  [Claude] ' + score + '/10 — ' + claudeFeedback.slice(0, 150));

    // Sprint 2-9: Test all endpoints
    let pass = 0, fail = 0;
    for (const [name, fn, check] of TESTS) {
      const r = await fn();
      if (check(r)) pass++; else fail++;
    }
    console.log('  [Tests]  ' + pass + '/' + (pass + fail) + ' (' + Math.round(pass/(pass+fail)*100) + '%)');

    // Get local model scores (free)
    const localScores = {};
    for (const m of ['llama3', 'mistral']) {
      const r = await local(m, 'Rate /10: AI platform with ' + FEATURES + '. ' + pass + '/' + (pass+fail) + ' tests pass. SCORE: X.X/10');
      localScores[m] = parseFloat((r.match(/([\d.]+)\s*\/\s*10/) || [])[1]) || 0;
    }
    console.log('  [Local]  Llama:' + localScores.llama3 + ' Mistral:' + localScores.mistral);

    // Sprint 10: Full council (every 10th set gets all 4 cloud)
    if (set % 3 === 0) {
      for (const [p, m, l] of [['openai', 'gpt-4.1', 'GPT'], ['grok', 'grok-3', 'Grok'], ['deepseek', 'deepseek-chat', 'Deep']]) {
        const r = await think(p, m, 'Rate /10: AI platform with ' + FEATURES + '. SCORE: X.X/10');
        const s = parseFloat((r.match(/([\d.]+)\s*\/\s*10/) || [])[1]) || 0;
        console.log('  [' + l + ']    ' + s + '/10');
      }
    }

    allScores.push({ set, score, pass, fail, llama: localScores.llama3, mistral: localScores.mistral });

    // Store in memory
    await api('POST', '/v1/memory-set', { key: 'iterate-set-' + set, value: JSON.stringify(allScores[allScores.length - 1]) });

    console.log('  ── Deploy checkpoint ──');
    console.log('');

    await sleep(5000);
  }

  // Final report
  console.log('═══════════════════════════');
  console.log('20 SETS COMPLETE\n');
  console.log('Claude scores: ' + allScores.map(s => s.score).join(', '));
  console.log('Avg Claude: ' + (allScores.reduce((a, s) => a + s.score, 0) / allScores.length).toFixed(1));
  console.log('Avg Llama:  ' + (allScores.reduce((a, s) => a + (s.llama || 0), 0) / allScores.length).toFixed(1));
  console.log('Test pass:  ' + allScores.reduce((a, s) => a + s.pass, 0) + '/' + allScores.reduce((a, s) => a + s.pass + s.fail, 0));

  fs.writeFileSync('hive-iterate-results.json', JSON.stringify(allScores, null, 2));
  console.log('\nResults: hive-iterate-results.json');
}

main().catch(e => console.error('Fatal:', e.message));
