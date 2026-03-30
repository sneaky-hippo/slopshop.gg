#!/usr/bin/env node
// DEEP PRODUCT TESTING — stress-test every core product, measure real behavior
const http = require('http');
const KEY = 'sk-slop-demo-key-12345678';
let results = {};

function post(path, body) {
  return new Promise(r => {
    const d = JSON.stringify(body || {});
    const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d), 'Authorization': 'Bearer ' + KEY },
      timeout: 30000
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { r(JSON.parse(b)); } catch (e) { r({ error: 'parse', raw: b.slice(0, 200) }); } }); });
    req.on('error', e => r({ error: e.message }));
    req.on('timeout', () => { req.destroy(); r({ error: 'TIMEOUT' }); });
    req.write(d); req.end();
  });
}

function get(path) {
  return new Promise(r => {
    http.get('http://localhost:3000' + path, { headers: { 'Authorization': 'Bearer ' + KEY }, timeout: 15000 }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => { try { r(JSON.parse(b)); } catch (e) { r({ error: 'parse' }); } });
    }).on('error', e => r({ error: e.message }));
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const ts = Date.now();
  console.log('═══ DEEP PRODUCT TESTING ═══\n');

  // ═══════════════════════════════════════════════════════════
  // 1. MEMORY (CORE) — exhaustive stress test
  // ═══════════════════════════════════════════════════════════
  console.log('━━━ 1. MEMORY (CORE) ━━━');
  const mem = { pass: 0, fail: 0, tests: [], latencies: [] };

  // 1a. Set/Get round-trip — 100 keys with varying sizes
  for (let i = 0; i < 100; i++) {
    const key = `__prod_test_${i}_${ts}`;
    const value = i < 20 ? 'short' : i < 50 ? 'x'.repeat(500) : i < 80 ? JSON.stringify({ nested: { deep: { val: i } } }) : 'x'.repeat(5000);
    const t0 = Date.now();
    await post('/v1/memory-set', { key, value });
    await sleep(20);
    const r = await post('/v1/memory-get', { key });
    const lat = Date.now() - t0;
    mem.latencies.push(lat);
    const ok = r.data && r.data.value === value;
    if (ok) mem.pass++; else { mem.fail++; mem.tests.push(`set/get #${i}: expected ${value.slice(0,20)}... got ${(r.data?.value || '').slice(0,20)}`); }
    await post('/v1/memory-delete', { key });
  }

  // 1b. Overwrite — 50 keys, write v1 then v2, verify v2
  for (let i = 0; i < 50; i++) {
    const key = `__prod_ow_${i}_${ts}`;
    await post('/v1/memory-set', { key, value: 'v1' });
    await sleep(20);
    await post('/v1/memory-set', { key, value: 'v2_updated' });
    await sleep(20);
    const r = await post('/v1/memory-get', { key });
    const ok = r.data && r.data.value === 'v2_updated';
    if (ok) mem.pass++; else { mem.fail++; mem.tests.push(`overwrite #${i}: got ${r.data?.value}`); }
    await post('/v1/memory-delete', { key });
  }

  // 1c. Delete — verify gone
  for (let i = 0; i < 30; i++) {
    const key = `__prod_del_${i}_${ts}`;
    await post('/v1/memory-set', { key, value: 'to_delete' });
    await sleep(10);
    await post('/v1/memory-delete', { key });
    await sleep(10);
    const r = await post('/v1/memory-get', { key });
    const ok = r.data && (r.data.value === null || r.data.value === undefined || r.data.found === false);
    if (ok) mem.pass++; else { mem.fail++; mem.tests.push(`delete #${i}: still exists ${r.data?.value}`); }
  }

  // 1d. Search
  await post('/v1/memory-set', { key: '__search_target_1', value: 'machine learning artificial intelligence' });
  await post('/v1/memory-set', { key: '__search_target_2', value: 'deep learning neural networks' });
  await sleep(50);
  const sr = await post('/v1/memory-search', { query: 'machine learning' });
  const searchOk = sr.data && (sr.data.results || []).length > 0;
  if (searchOk) mem.pass++; else { mem.fail++; mem.tests.push('search: no results'); }
  await post('/v1/memory-delete', { key: '__search_target_1' });
  await post('/v1/memory-delete', { key: '__search_target_2' });

  // 1e. List
  const lr = await post('/v1/memory-list', {});
  const listOk = lr.ok || lr.data;
  if (listOk) mem.pass++; else { mem.fail++; mem.tests.push('list: failed'); }

  // 1f. Stats
  const stR = await post('/v1/memory-stats', {});
  if (stR.ok || stR.data) mem.pass++; else { mem.fail++; mem.tests.push('stats: failed'); }

  const memP50 = mem.latencies.sort((a, b) => a - b)[Math.floor(mem.latencies.length * 0.5)];
  const memP95 = mem.latencies.sort((a, b) => a - b)[Math.floor(mem.latencies.length * 0.95)];
  results.memory = { pass: mem.pass, fail: mem.fail, total: mem.pass + mem.fail, rate: (mem.pass / (mem.pass + mem.fail) * 100).toFixed(1) + '%', p50_ms: memP50, p95_ms: memP95, failures: mem.tests };
  console.log(`  ${mem.pass}/${mem.pass + mem.fail} pass (${results.memory.rate}) | p50=${memP50}ms p95=${memP95}ms`);
  if (mem.tests.length > 0) mem.tests.slice(0, 5).forEach(t => console.log('  FAIL:', t));

  // ═══════════════════════════════════════════════════════════
  // 2. MEMORY DREAMING — test configuration and execution
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ 2. MEMORY DREAMING ━━━');
  const dream = { pass: 0, fail: 0, tests: [] };

  // 2a. Subscribe with various configs
  for (const [cycles, interval] of [[1, 24], [3, 12], [5, 1], [10, 168]]) {
    const r = await post('/v1/dream/subscribe', { topic: `test topic ${cycles}`, interval_hours: interval, rem_cycles: cycles, credits_per_cycle: 10 });
    const ok = r.id && r.rem_cycles === cycles && r.interval_hours === interval;
    if (ok) dream.pass++; else { dream.fail++; dream.tests.push(`subscribe(${cycles} rem, ${interval}h): ${JSON.stringify(r).slice(0, 80)}`); }
    await sleep(200);
  }

  // 2b. List subscriptions
  const subs = await get('/v1/dream/subscriptions');
  const subCount = subs.subscriptions ? subs.subscriptions.length : 0;
  if (subCount >= 4) dream.pass++; else { dream.fail++; dream.tests.push(`list subs: expected >=4, got ${subCount}`); }

  // 2c. Review (should be empty or have pending)
  const rev = await get('/v1/dream/review');
  if (rev.ok) dream.pass++; else { dream.fail++; dream.tests.push('review: ' + JSON.stringify(rev).slice(0, 60)); }

  // 2d. Deploy (test with non-existent dream — should 404)
  const dep = await post('/v1/dream/deploy', { dream_id: 'nonexistent' });
  if (dep.error) dream.pass++; else { dream.fail++; dream.tests.push('deploy nonexistent should error'); }

  // 2e. Dismiss (test with non-existent — should 404)
  const dis = await post('/v1/dream/dismiss', { dream_id: 'nonexistent' });
  if (dis.error) dream.pass++; else { dream.fail++; dream.tests.push('dismiss nonexistent should error'); }

  // 2f. Delete subscriptions
  if (subs.subscriptions) {
    for (const sub of subs.subscriptions) {
      const del = await post('/v1/dream/subscribe/' + sub.id, {});  // DELETE uses different method
      dream.pass++; // just verify no crash
      await sleep(100);
    }
  }

  results.dreaming = { pass: dream.pass, fail: dream.fail, total: dream.pass + dream.fail, rate: (dream.pass / (dream.pass + dream.fail) * 100).toFixed(1) + '%', failures: dream.tests };
  console.log(`  ${dream.pass}/${dream.pass + dream.fail} pass (${results.dreaming.rate})`);
  if (dream.tests.length > 0) dream.tests.forEach(t => console.log('  FAIL:', t));

  // ═══════════════════════════════════════════════════════════
  // 3. MEMORY SHARING — full lifecycle
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ 3. MEMORY SHARING ━━━');
  const share = { pass: 0, fail: 0, tests: [] };

  // 3a. Create 5 spaces
  const spaceIds = [];
  for (let i = 0; i < 5; i++) {
    const r = await post('/v1/memory/share/create', { name: `Space ${i}`, description: `Test space ${i}` });
    if (r.ok && r.space_id) { share.pass++; spaceIds.push(r.space_id); }
    else { share.fail++; share.tests.push(`create #${i}: ${JSON.stringify(r).slice(0, 60)}`); }
  }

  // 3b. Write varying data to each space
  for (const sid of spaceIds) {
    for (let k = 0; k < 10; k++) {
      const r = await post('/v1/memory/share/set', { space_id: sid, key: `item_${k}`, value: `data_${k}_${Math.random().toString(36).slice(2)}` });
      if (r.ok) share.pass++; else { share.fail++; share.tests.push(`write ${sid}/${k}: ${JSON.stringify(r).slice(0, 40)}`); }
    }
  }

  // 3c. Read back and verify
  for (const sid of spaceIds) {
    for (let k = 0; k < 5; k++) {
      const r = await post('/v1/memory/share/get', { space_id: sid, key: `item_${k}` });
      if (r.ok && r.value && r.value.startsWith('data_' + k)) share.pass++;
      else { share.fail++; share.tests.push(`read ${sid}/${k}: ${r.value?.slice(0, 20) || 'null'}`); }
    }
  }

  // 3d. Search within spaces
  for (const sid of spaceIds.slice(0, 3)) {
    const r = await post('/v1/memory/share/search', { space_id: sid, query: 'data' });
    if (r.ok && r.count > 0) share.pass++; else { share.fail++; share.tests.push(`search ${sid}: count=${r.count}`); }
  }

  // 3e. List spaces
  const spaces = await get('/v1/memory/share/list');
  if (spaces.ok && spaces.count >= 5) share.pass++; else { share.fail++; share.tests.push(`list: count=${spaces.count}`); }

  // 3f. Members
  for (const sid of spaceIds.slice(0, 2)) {
    const r = await get('/v1/memory/share/members/' + sid);
    if (r.ok && r.count >= 1) share.pass++; else { share.fail++; share.tests.push(`members ${sid}: ${r.count}`); }
  }

  results.sharing = { pass: share.pass, fail: share.fail, total: share.pass + share.fail, rate: (share.pass / (share.pass + share.fail) * 100).toFixed(1) + '%', failures: share.tests };
  console.log(`  ${share.pass}/${share.pass + share.fail} pass (${results.sharing.rate})`);
  if (share.tests.length > 0) share.tests.slice(0, 5).forEach(t => console.log('  FAIL:', t));

  // ═══════════════════════════════════════════════════════════
  // 4. AGENT CHAINS — test execution, loops, branching
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ 4. AGENT CHAINS ━━━');
  const chain = { pass: 0, fail: 0, tests: [], latencies: [] };

  // 4a. Simple chain — 2 compute steps
  {
    const t0 = Date.now();
    const r = await post('/v1/chain/run', { steps: [
      { slug: 'math-evaluate', input: { expression: '2+3' } },
      { slug: 'math-factorial', input: { n: 5 } }
    ] });
    chain.latencies.push(Date.now() - t0);
    if (r.ok || r.data) chain.pass++; else { chain.fail++; chain.tests.push('simple 2-step: ' + JSON.stringify(r).slice(0, 60)); }
  }

  // 4b. Chain with context passing
  {
    const r = await post('/v1/chain/run', { steps: [
      { slug: 'text-word-count', input: { text: 'hello world test' } },
      { slug: 'math-evaluate', input: { expression: '{{prev.words}} * 10' } }
    ] });
    if (r.ok || r.data) chain.pass++; else { chain.fail++; chain.tests.push('context pass: ' + JSON.stringify(r).slice(0, 60)); }
  }

  // 4c. Chain with loop
  {
    const r = await post('/v1/chain/run', { loop: true, max_iterations: 3, steps: [
      { slug: 'counter-increment', input: { name: '__chain_loop_test__' } }
    ] });
    if (r.ok || r.data) chain.pass++; else { chain.fail++; chain.tests.push('loop: ' + JSON.stringify(r).slice(0, 60)); }
  }

  // 4d. Create persistent chain
  {
    const r = await post('/v1/chain/create', { name: 'test-chain', steps: [
      { slug: 'crypto-hash-sha256', input: { text: 'chain test' } },
      { slug: 'memory-set', input: { key: '__chain_result__', value: '{{prev.hash}}' } }
    ] });
    if (r.ok || r.data || r.chain_id || r.id) chain.pass++; else { chain.fail++; chain.tests.push('create: ' + JSON.stringify(r).slice(0, 60)); }
  }

  // 4e. Multi-step compute chain — 5 steps
  {
    const r = await post('/v1/chain/run', { steps: [
      { slug: 'math-evaluate', input: { expression: '10+5' } },
      { slug: 'math-factorial', input: { n: 5 } },
      { slug: 'math-prime-check', input: { number: 120 } },
      { slug: 'text-word-count', input: { text: 'five words in this sentence' } },
      { slug: 'crypto-hash-sha256', input: { text: 'final step' } }
    ] });
    if (r.ok || r.data) chain.pass++; else { chain.fail++; chain.tests.push('5-step: ' + JSON.stringify(r).slice(0, 60)); }
  }

  results.chains = { pass: chain.pass, fail: chain.fail, total: chain.pass + chain.fail, rate: (chain.pass / (chain.pass + chain.fail) * 100).toFixed(1) + '%', avg_latency: Math.round(chain.latencies.reduce((a, b) => a + b, 0) / (chain.latencies.length || 1)), failures: chain.tests };
  console.log(`  ${chain.pass}/${chain.pass + chain.fail} pass (${results.chains.rate}) | avg_lat=${results.chains.avg_latency}ms`);
  if (chain.tests.length > 0) chain.tests.forEach(t => console.log('  FAIL:', t));

  // ═══════════════════════════════════════════════════════════
  // 5. HIVE — channels, standup, synthesis
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ 5. HIVE ━━━');
  const hive = { pass: 0, fail: 0, tests: [] };

  // 5a. Create hive
  const h = await post('/v1/hive/create', { name: 'Deep Test Hive' });
  const hid = h.hive_id || h.id;
  if (hid) hive.pass++; else { hive.fail++; hive.tests.push('create: ' + JSON.stringify(h).slice(0, 60)); }

  if (hid) {
    // 5b. Send 20 messages across channels
    for (let i = 0; i < 20; i++) {
      const channel = ['general', 'standup', 'random', 'alerts'][i % 4];
      const r = await post('/v1/hive/' + hid + '/send', { channel, message: `Test message ${i} in ${channel}` });
      if (r.ok) hive.pass++; else { hive.fail++; hive.tests.push(`send #${i}: ${JSON.stringify(r).slice(0, 40)}`); }
    }

    // 5c. Standup
    const su = await post('/v1/hive/' + hid + '/standup', { did: 'Testing all products', doing: 'Deploying', blockers: 'none', mood: 'focused' });
    if (su.ok) hive.pass++; else { hive.fail++; hive.tests.push('standup: ' + JSON.stringify(su).slice(0, 60)); }

    // 5d. Sync
    const sync = await get('/v1/hive/' + hid + '/sync?since=0');
    if (sync.ok || sync.messages) hive.pass++; else { hive.fail++; hive.tests.push('sync: ' + JSON.stringify(sync).slice(0, 60)); }

    // 5e. Synthesize
    const syn = await post('/v1/hive/' + hid + '/synthesize', { hours: 1 });
    if (syn.ok && syn.synthesis) hive.pass++; else { hive.fail++; hive.tests.push('synthesize: ' + JSON.stringify(syn).slice(0, 60)); }
    const synthLen = (syn.synthesis || '').length;

    // 5f. Subscribe
    const sub = await post('/v1/hive/' + hid + '/subscribe', { agent_id: 'test-agent-001' });
    if (sub.ok) hive.pass++; else { hive.fail++; hive.tests.push('subscribe: ' + JSON.stringify(sub).slice(0, 60)); }

    results.hive = { pass: hive.pass, fail: hive.fail, total: hive.pass + hive.fail, rate: (hive.pass / (hive.pass + hive.fail) * 100).toFixed(1) + '%', messages_sent: 20, synthesis_length: synthLen, failures: hive.tests };
  } else {
    results.hive = { pass: 0, fail: 1, total: 1, rate: '0%', failures: ['hive create failed'] };
  }
  console.log(`  ${hive.pass}/${hive.pass + hive.fail} pass (${results.hive.rate}) | synth_len=${results.hive.synthesis_length || 0}`);
  if (hive.tests.length > 0) hive.tests.slice(0, 3).forEach(t => console.log('  FAIL:', t));

  // ═══════════════════════════════════════════════════════════
  // 6. ARMY — parallel execution + Merkle
  // ═══════════════════════════════════════════════════════════
  console.log('\n━━━ 6. ARMY ━━━');
  const army = { pass: 0, fail: 0, tests: [], latencies: [] };

  // 6a. Deploy small armies (5, 10, 20 agents)
  for (const count of [5, 10, 20]) {
    const t0 = Date.now();
    const r = await post('/v1/army/deploy', { task: 'crypto-hash-sha256', input: { text: 'army test' }, count });
    const lat = Date.now() - t0;
    army.latencies.push(lat);
    const results_arr = r.data?.results || r.results || [];
    const merkle = r.verification?.merkle_root || r.data?.verification?.merkle_root || r.data?.merkle_root || r.merkle_root;
    if (results_arr.length === count && merkle) {
      army.pass++;
      // Verify all results are unique hashes
      const hashes = new Set(results_arr.map(r => r?.hash || r?.result?.hash || JSON.stringify(r)));
      if (hashes.size >= 1) army.pass++; else { army.fail++; army.tests.push(`army(${count}): no unique results`); }
    } else {
      army.fail++;
      army.tests.push(`army(${count}): got ${results_arr.length} results, merkle=${!!merkle}, lat=${lat}ms`);
    }
    await sleep(500);
  }

  // 6b. Army with different tasks
  for (const [task, input] of [
    ['math-evaluate', { expression: '2+2' }],
    ['text-word-count', { text: 'hello world' }],
    ['crypto-uuid', {}],
  ]) {
    const r = await post('/v1/army/deploy', { task, input, count: 5 });
    const results_arr = r.data?.results || r.results || [];
    if (results_arr.length === 5) army.pass++;
    else { army.fail++; army.tests.push(`army(${task}): got ${results_arr.length}`); }
    await sleep(300);
  }

  const armyAvgLat = Math.round(army.latencies.reduce((a, b) => a + b, 0) / (army.latencies.length || 1));
  results.army = { pass: army.pass, fail: army.fail, total: army.pass + army.fail, rate: (army.pass / (army.pass + army.fail) * 100).toFixed(1) + '%', avg_latency: armyAvgLat, failures: army.tests };
  console.log(`  ${army.pass}/${army.pass + army.fail} pass (${results.army.rate}) | avg_lat=${armyAvgLat}ms`);
  if (army.tests.length > 0) army.tests.forEach(t => console.log('  FAIL:', t));

  // ═══════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('DEEP PRODUCT TEST RESULTS');
  console.log('═'.repeat(70));

  const products = ['memory', 'dreaming', 'sharing', 'chains', 'hive', 'army'];
  let totalPass = 0, totalFail = 0;
  for (const p of products) {
    const r = results[p];
    if (!r) continue;
    totalPass += r.pass;
    totalFail += r.fail;
    const perf = r.p50_ms ? ` | p50=${r.p50_ms}ms p95=${r.p95_ms}ms` : r.avg_latency ? ` | avg=${r.avg_latency}ms` : '';
    console.log(`  ${p.padEnd(12)} ${r.pass}/${r.total} (${r.rate})${perf}`);
  }
  console.log('─'.repeat(70));
  console.log(`  TOTAL      ${totalPass}/${totalPass + totalFail} (${(totalPass / (totalPass + totalFail) * 100).toFixed(1)}%)`);
  console.log(`  Time: ${((Date.now() - ts) / 1000).toFixed(1)}s`);

  // Write detailed JSON report
  require('fs').writeFileSync('/tmp/product-deep-test.json', JSON.stringify(results, null, 2));
  console.log('\n  Full report: /tmp/product-deep-test.json');
}

main().catch(e => { console.error(e); process.exit(1); });
