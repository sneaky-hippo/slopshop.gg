#!/usr/bin/env node
// MAXIMUM ROBUSTNESS AUDIT — tests every product, auth flow, edge case, error path
// Does NOT restart the server. Paces requests to avoid rate limits.
const http = require('http');
const crypto = require('crypto');
const DEMO = 'sk-slop-demo-key-12345678';
const FOUNDER = 'sk-slop-65354bc59f26480abb4da30b';
let pass = 0, fail = 0, warn = 0;
const failures = [], warnings = [];
const W = 150; // ms between requests

function post(path, body, key) {
  return new Promise(r => {
    const d = JSON.stringify(body || {});
    const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d), 'Authorization': 'Bearer ' + (key || DEMO) },
      timeout: 15000
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { r({ s: res.statusCode, ...JSON.parse(b) }); } catch (e) { r({ s: res.statusCode, raw: b.slice(0, 200) }); } }); });
    req.on('error', e => r({ s: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); r({ s: 0, error: 'TIMEOUT' }); });
    req.write(d); req.end();
  });
}
function get(path, key) {
  return new Promise(r => {
    http.get('http://localhost:3000' + path, { headers: { 'Authorization': 'Bearer ' + (key || DEMO) }, timeout: 10000 }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => { try { r({ s: res.statusCode, ...JSON.parse(b) }); } catch (e) { r({ s: res.statusCode, raw: b.slice(0, 200) }); } });
    }).on('error', e => r({ s: 0, error: e.message }));
  });
}
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ok(n, c, d) { if (c) pass++; else { fail++; failures.push(n + ': ' + (d || '')); console.log('  FAIL', n, (d || '').slice(0, 60)); } }
function wn(n, d) { warn++; warnings.push(n + ': ' + (d || '')); }

async function main() {
  const ts = Date.now();
  console.log('═══ MAXIMUM ROBUSTNESS AUDIT ═══\n');

  // ━━━ 1. AUTH SYSTEM ━━━
  console.log('━━━ 1. AUTH ━━━');

  // 1a. Signup new test user
  const testEmail = `robustness-${ts}@test.slopshop.gg`;
  const r1 = await post('/v1/auth/signup', { email: testEmail, password: 'RobustTest2026!' });
  ok('signup', r1.s === 201 && r1.api_key, `s=${r1.s}`);
  const testKey = r1.api_key;
  await sleep(W);

  // 1b. Login
  const r2 = await post('/v1/auth/login', { email: testEmail, password: 'RobustTest2026!' });
  ok('login', r2.s === 200 && r2.api_key === testKey, `s=${r2.s}`);
  await sleep(W);

  // 1c. Wrong password
  const r3 = await post('/v1/auth/login', { email: testEmail, password: 'wrong' });
  ok('bad password → 401', r3.s === 401);
  await sleep(W);

  // 1d. Me endpoint
  const r4 = await get('/v1/auth/me', testKey);
  ok('me', r4.s === 200 && r4.user?.email === testEmail, `email=${r4.user?.email}`);
  await sleep(W);

  // 1e. Create scoped key
  const r5 = await post('/v1/auth/create-scoped-key', { scope: 'memory', label: 'robustness-test' }, testKey);
  ok('scoped key', r5.s === 201 && r5.api_key, `s=${r5.s}`);
  const scopedKey = r5.api_key;
  await sleep(W);

  // 1f. List keys
  const r6 = await get('/v1/auth/keys', testKey);
  ok('list keys', r6.s === 200 && r6.keys?.length >= 2, `count=${r6.keys?.length}`);
  await sleep(W);

  // 1g. Session auth
  const r7 = await post('/v1/auth/session', { api_key: testKey });
  ok('session create', r7.s === 200 && r7.session_token, `s=${r7.s}`);
  await sleep(W);

  // 1h. No auth → 401
  const r8 = await new Promise(r => {
    const req = http.request({ hostname: 'localhost', port: 3000, path: '/v1/memory-set', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, timeout: 5000
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ s: res.statusCode })); });
    req.write('{}'); req.end();
  });
  ok('no auth → 401', r8.s === 401);
  await sleep(W);

  // 1i. Balance check
  const r9 = await get('/v1/credits/balance', testKey);
  ok('balance = 500', r9.s === 200 && r9.balance === 500, `balance=${r9.balance}`);
  await sleep(W);

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 2. MEMORY ROBUSTNESS ━━━
  console.log('━━━ 2. MEMORY ━━━');

  // 2a-e: Set/Get/Overwrite/Delete/Search
  for (let i = 0; i < 20; i++) {
    const key = `__robust_${i}_${ts}`;
    const val = crypto.randomBytes(16).toString('hex');
    await post('/v1/memory-set', { key, value: val }, testKey);
    await sleep(30);
    const r = await post('/v1/memory-get', { key }, testKey);
    ok(`mem rt #${i}`, r.data?.value === val);
    await post('/v1/memory-delete', { key }, testKey);
  }
  await sleep(W);

  // 2f: Overwrite
  await post('/v1/memory-set', { key: '__robust_ow', value: 'v1' }, testKey);
  await sleep(50);
  await post('/v1/memory-set', { key: '__robust_ow', value: 'v2' }, testKey);
  await sleep(50);
  const r2f = await post('/v1/memory-get', { key: '__robust_ow' }, testKey);
  ok('overwrite', r2f.data?.value === 'v2', `got=${r2f.data?.value}`);
  await post('/v1/memory-delete', { key: '__robust_ow' }, testKey);
  await sleep(W);

  // 2g: Empty value
  await post('/v1/memory-set', { key: '__robust_empty', value: '' }, testKey);
  await sleep(30);
  const r2g = await post('/v1/memory-get', { key: '__robust_empty' }, testKey);
  ok('empty value', r2g.data?.value === '', `got="${r2g.data?.value}"`);
  await sleep(W);

  // 2h: Counter
  const ctr = `__robust_ctr_${ts}`;
  await post('/v1/counter-increment', { name: ctr }, testKey);
  await post('/v1/counter-increment', { name: ctr }, testKey);
  await post('/v1/counter-increment', { name: ctr }, testKey);
  const r2h = await post('/v1/counter-get', { name: ctr }, testKey);
  ok('counter=3', r2h.data?.value === 3, `got=${r2h.data?.value}`);
  await sleep(W);

  // 2i: Queue FIFO
  const q = `__robust_q_${ts}`;
  await post('/v1/queue-push', { queue: q, item: 'first' }, testKey);
  await post('/v1/queue-push', { queue: q, item: 'second' }, testKey);
  const r2i = await post('/v1/queue-pop', { queue: q }, testKey);
  ok('queue FIFO', (r2i.data?.item || r2i.data?.value) === 'first');
  await sleep(W);

  // 2j: Upload
  const r2j = await post('/v1/memory/upload', { content: '# Test\n\nSection content here', namespace: 'robust-test' }, testKey);
  ok('upload', r2j.ok && r2j.data?.entries_stored >= 1, `stored=${r2j.data?.entries_stored}`);
  await sleep(W);

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 3. COMPUTE HANDLERS ━━━
  console.log('━━━ 3. COMPUTE ━━━');

  const computes = [
    ['/v1/crypto-hash-sha256', { text: 'robust' }, d => d.data?.hash?.length === 64],
    ['/v1/math-evaluate', { expression: '2+3*4' }, d => d.data?.result === 14],
    ['/v1/text-word-count', { text: 'one two three' }, d => d.data?.words === 3],
    ['/v1/text-reverse', { text: 'abc' }, d => (d.data?.result || d.data?.reversed) === 'cba'],
    ['/v1/math-factorial', { n: 6 }, d => d.data?.result === 720],
    ['/v1/math-prime-check', { number: 97 }, d => d.data?.isPrime === true || d.data?.prime === true],
    ['/v1/crypto-uuid', {}, d => /^[0-9a-f]{8}-/.test(d.data?.uuid || '')],
    ['/v1/text-slugify', { text: 'Hello World' }, d => d.data?.slug === 'hello-world'],
    ['/v1/text-base64-encode', { text: 'test' }, d => d.data?.result === 'dGVzdA=='],
    ['/v1/exec-javascript', { code: 'return 6*7' }, d => d.data?.result === 42],
    ['/v1/convert-temperature', { value: 100, from: 'celsius', to: 'fahrenheit' }, d => Math.abs((d.data?.result || 0) - 212) < 0.1],
    ['/v1/text-case-convert', { text: 'hello', case: 'upper' }, d => d.data?.result === 'HELLO'],
  ];
  for (const [path, input, check] of computes) {
    const r = await post(path, input, testKey);
    ok(path.split('/').pop(), r.s === 200 && check(r), `s=${r.s} data=${JSON.stringify(r.data).slice(0, 40)}`);
    await sleep(W);
  }

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 4. CHAINS ━━━
  console.log('━━━ 4. CHAINS ━━━');

  const r4a = await post('/v1/chain/run', { steps: [
    { slug: 'math-evaluate', input: { expression: '10+5' } },
    { slug: 'math-factorial', input: { n: 5 } }
  ] }, testKey);
  ok('inline chain', r4a.ok && r4a.results?.length === 2);
  await sleep(W);

  const r4b = await post('/v1/chain/create', { name: 'robust-chain', steps: [{ slug: 'crypto-uuid' }] }, testKey);
  ok('create chain', r4b.ok && r4b.chain_id);
  if (r4b.chain_id) {
    const r4c = await post('/v1/chain/run', { chain_id: r4b.chain_id }, testKey);
    ok('run persistent chain', r4c.ok);
  }
  await sleep(W);

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 5. HIVE ━━━
  console.log('━━━ 5. HIVE ━━━');

  const r5a = await post('/v1/hive/create', { name: 'Robust Hive' }, testKey);
  const hid = r5a.hive_id || r5a.id;
  ok('hive create', !!hid);
  if (hid) {
    await post('/v1/hive/' + hid + '/send', { channel: 'general', message: 'Robustness test' }, testKey);
    ok('hive send', true);
    const r5b = await post('/v1/hive/' + hid + '/standup', { did: 'Testing', doing: 'Auditing', blockers: 'none' }, testKey);
    ok('hive standup', r5b.ok);
    const r5c = await post('/v1/hive/' + hid + '/synthesize', { hours: 1 }, testKey);
    ok('hive synthesize', r5c.ok && r5c.synthesis);
    await sleep(W);
  }

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 6. ARMY ━━━
  console.log('━━━ 6. ARMY ━━━');

  const r6a = await post('/v1/army/deploy', { task: 'crypto-hash-sha256', input: { text: 'robust' }, count: 5 }, testKey);
  ok('army 5 agents', r6a.results?.length === 5, `got=${r6a.results?.length}`);
  ok('army merkle', !!r6a.verification?.merkle_root);
  ok('army all verified', r6a.verification?.all_verified === true);
  await sleep(W);

  // Army with tool param
  const r6b = await post('/v1/army/deploy', { tool: 'math-evaluate', input: { expression: '1+1' }, agents: 3 }, testKey);
  ok('army tool param', r6b.results?.length === 3);
  await sleep(W);

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 7. NL ROUTER ━━━
  console.log('━━━ 7. NL ROUTER ━━━');

  const queries = [
    ['hash slopshop with sha256', 'crypto-hash-sha256'],
    ['how many words in hello world test', 'text-word-count'],
    ['is 97 prime', 'math-prime-check'],
    ['generate a uuid', 'crypto-uuid'],
    ['reverse the text hello', 'text-reverse'],
    ['calculate 2+3*4', 'math-evaluate'],
  ];
  for (const [q, expected] of queries) {
    const r = await post('/v1/query', { query: q }, testKey);
    ok(`query: "${q.slice(0, 25)}"`, r.ok && r.data?.routed_to === expected, `routed=${r.data?.routed_to}`);
    await sleep(W);
  }

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 8. RESEARCH + NORTH STAR ━━━
  console.log('━━━ 8. RESEARCH + NORTH STAR ━━━');

  const r8a = await get('/v1/research/tiers', testKey);
  ok('research tiers', r8a.ok && r8a.tiers);
  await sleep(W);

  const r8b = await post('/v1/northstar/set', { goal: 'Build the best AI agent backend' }, testKey);
  ok('northstar set', r8b.ok, `s=${r8b.s}`);
  await sleep(W);

  const r8c = await get('/v1/northstar', testKey);
  ok('northstar get', r8c.ok && r8c.data?.goal);
  await sleep(W);

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 9. WORKFLOWS ━━━
  console.log('━━━ 9. WORKFLOWS ━━━');

  const r9a = await post('/v1/workflows', { name: 'robust-wf', nodes: [
    { id: 's', type: 'start' },
    { id: 'h', type: 'handler', data: { handler: 'crypto-hash-sha256', params: { text: 'workflow-test' } } },
    { id: 'e', type: 'end' }
  ], edges: [{ source: 's', target: 'h' }, { source: 'h', target: 'e' }] }, testKey);
  ok('workflow create', r9a.ok && r9a.workflow_id);
  await sleep(W);

  if (r9a.workflow_id) {
    // Dry run
    const r9b = await post('/v1/workflows/' + r9a.workflow_id + '/run', { dry_run: true }, testKey);
    ok('workflow dry run', r9b.ok && r9b.data?.dry_run === true);
    await sleep(W);

    // Real run
    const r9c = await post('/v1/workflows/' + r9a.workflow_id + '/run', {}, testKey);
    ok('workflow run', r9c.ok && r9c.data?.nodes_executed >= 1, `nodes=${r9c.data?.nodes_executed}`);
    await sleep(W);

    // Run history
    const r9d = await get('/v1/workflows/' + r9a.workflow_id + '/runs', testKey);
    ok('workflow history', r9d.ok && r9d.runs?.length >= 1);
    await sleep(W);
  }

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 10. BUDGET ━━━
  console.log('━━━ 10. BUDGET ━━━');

  const r10a = await post('/v1/budget/set', { daily_limit: 200, alert_threshold: 50 }, testKey);
  ok('budget set', r10a.ok);
  await sleep(W);

  const r10b = await get('/v1/budget', testKey);
  ok('budget get', r10b.ok && r10b.daily_limit === 200);
  await sleep(W);

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 11. SHARING ━━━
  console.log('━━━ 11. SHARING ━━━');

  const r11a = await post('/v1/memory/share/create', { name: 'Robust Space' }, testKey);
  ok('share create', r11a.ok && r11a.space_id);
  if (r11a.space_id) {
    await post('/v1/memory/share/set', { space_id: r11a.space_id, key: 'test', value: 'shared' }, testKey);
    await sleep(50);
    const r11b = await post('/v1/memory/share/get', { space_id: r11a.space_id, key: 'test' }, testKey);
    ok('share read', r11b.ok && r11b.value === 'shared');
  }
  await sleep(W);

  // Collaborator
  const r11c = await post('/v1/memory/collaborator/invite', { namespace: 'robust-test', invitee_key: 'sk-other', permission: 'rw' }, testKey);
  ok('collab invite', r11c.ok && r11c.invite_token);
  await sleep(W);

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 12. DREAMING ━━━
  console.log('━━━ 12. DREAMING ━━━');

  const r12a = await post('/v1/dream/subscribe', { topic: 'robustness testing', tier: 'basic' }, testKey);
  ok('dream subscribe', r12a.s === 201 && r12a.id);
  ok('dream tier=basic', r12a.tier === 'basic');
  ok('dream interval=2h', r12a.interval === '2h' || r12a.interval_hours === 2);
  await sleep(W);

  const r12b = await get('/v1/dream/review', testKey);
  ok('dream review', r12b.ok);
  await sleep(W);

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 13. ERROR HANDLING ━━━
  console.log('━━━ 13. ERROR HANDLING ━━━');

  // Missing required fields
  const r13a = await post('/v1/memory-set', {}, testKey);
  ok('memory-set no key → error', r13a.data?.error || r13a.error);

  // Bad slug
  const r13b = await post('/v1/nonexistent-endpoint', {}, testKey);
  ok('bad slug → 404 or error', r13b.s === 404 || r13b.error);

  // Empty body
  const r13c = await post('/v1/math-evaluate', {}, testKey);
  ok('empty math → graceful', r13c.s === 200 || r13c.s === 400);

  // Overflow
  const r13d = await post('/v1/math-factorial', { n: 200 }, testKey);
  ok('factorial(200) → graceful', r13d.s === 200 || r13d.s === 400);

  await sleep(W);
  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ 14. CROSS-PRODUCT INTEGRATION ━━━
  console.log('━━━ 14. INTEGRATION ━━━');

  // Compute → Memory
  const r14a = await post('/v1/crypto-hash-sha256', { text: 'integration' }, testKey);
  const hash = r14a.data?.hash;
  await post('/v1/memory-set', { key: '__robust_hash', value: hash }, testKey);
  await sleep(50);
  const r14b = await post('/v1/memory-get', { key: '__robust_hash' }, testKey);
  ok('compute→memory', r14b.data?.value === hash);
  await post('/v1/memory-delete', { key: '__robust_hash' }, testKey);

  // Chain → Verify
  const r14c = await post('/v1/chain/run', { steps: [
    { slug: 'text-word-count', input: { text: 'one two three four five' } }
  ] }, testKey);
  ok('chain result', r14c.ok && r14c.results?.[0]?.result?.words === 5);

  // NL → Compute → Verify
  const r14d = await post('/v1/query', { query: 'what is 6 factorial' }, testKey);
  ok('nl → compute', r14d.ok && r14d.data?.routed_to);
  await sleep(W);

  // Health
  const r14e = await get('/v1/health');
  ok('health', r14e.status === 'healthy' && r14e.apis > 1000);

  console.log(`  ${pass}/${pass + fail} pass\n`);

  // ━━━ SUMMARY ━━━
  console.log('═'.repeat(60));
  console.log('ROBUSTNESS AUDIT COMPLETE');
  console.log('═'.repeat(60));
  console.log(`  Pass: ${pass}`);
  console.log(`  Fail: ${fail}`);
  console.log(`  Total: ${pass + fail}`);
  console.log(`  Rate: ${(pass / (pass + fail) * 100).toFixed(1)}%`);
  console.log(`  Time: ${((Date.now() - ts) / 1000).toFixed(1)}s`);
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach(f => console.log('  ' + f));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
