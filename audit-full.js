#!/usr/bin/env node
/**
 * FULL FUNCTIONALITY AUDIT — Tests EVERYTHING as a new user
 */
const https = require('https'), fs = require('fs'), path = require('path');
const KEY = (() => { try { return JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key; } catch(e) { return ''; } })();

function api(m, p, b, key) {
  return new Promise(r => {
    const k = key || KEY;
    const o = { hostname: 'slopshop.gg', path: p, method: m, timeout: 30000,
      headers: { 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' } };
    const req = https.request(o, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { r(JSON.parse(d)); } catch(e) { r({ _err: true, raw: d.slice(0, 80) }); } });
    });
    req.on('error', e => r({ _err: true, error: e.message }));
    req.on('timeout', () => { req.destroy(); r({ _err: true }); });
    if (b) req.write(JSON.stringify(b));
    req.end();
  });
}

async function main() {
  console.log('FULL FUNCTIONALITY AUDIT\n');

  // Signup as new user
  const signup = await api('POST', '/v1/auth/signup', { email: 'audit' + Date.now() + '@test.io', password: 'audit12345678' });
  const testKey = signup.api_key || '';
  console.log('New user key: ' + testKey.slice(0, 16) + '...\n');

  const t = (m, p, b) => api(m, p, b, testKey);
  const results = [];

  async function test(name, fn) {
    try {
      const r = await fn();
      const ok = r && !r._err && !r.error?.code;
      results.push({ name, ok });
      console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + (ok ? '' : ' → ' + JSON.stringify(r.error || r).slice(0, 60)));
    } catch(e) {
      results.push({ name, ok: false });
      console.log('  ✗ ' + name + ' → ' + e.message);
    }
  }

  console.log('── Core ──');
  await test('health', () => api('GET', '/v1/health'));
  await test('balance', () => t('GET', '/v1/credits/balance'));
  await test('whoami', () => t('GET', '/v1/auth/me'));

  console.log('\n── Compute ──');
  await test('uuid', () => t('POST', '/v1/crypto-uuid', {}));
  await test('hash', () => t('POST', '/v1/crypto-hash-sha256', { text: 'test' }));
  await test('words', () => t('POST', '/v1/text-word-count', { text: 'one two' }));
  await test('reverse', () => t('POST', '/v1/text-reverse', { text: 'hi' }));
  await test('password', () => t('POST', '/v1/crypto-password-generate', { length: 16 }));
  await test('slugify', () => t('POST', '/v1/text-slugify', { text: 'Hello World' }));
  await test('base64', () => t('POST', '/v1/text-base64-encode', { text: 'test' }));
  await test('random', () => t('POST', '/v1/crypto-random-int', { min: 1, max: 100 }));

  console.log('\n── Memory ──');
  await test('memory-set', () => t('POST', '/v1/memory-set', { key: 'audit-' + Date.now(), value: 'works' }));
  await test('memory-get', () => t('POST', '/v1/memory-get', { key: 'audit-' + Date.now() }));
  await test('memory-list', () => t('POST', '/v1/memory-list', {}));

  console.log('\n── Chains ──');
  const chain = await t('POST', '/v1/chain/create', { name: 'audit', steps: [{ model: 'claude', role: 'test' }] });
  await test('chain/create', () => Promise.resolve(chain));
  await test('chain/list', () => t('GET', '/v1/chain/list'));
  if (chain.chain_id) await test('chain/status', () => t('GET', '/v1/chain/' + chain.chain_id + '/status'));

  console.log('\n── Army ──');
  await test('army/deploy', () => t('POST', '/v1/army/deploy', { task: 'crypto-uuid', count: 3 }));

  console.log('\n── Hive ──');
  const hive = await t('POST', '/v1/hive/create', { name: 'audit-hive', channels: ['general'] });
  await test('hive/create', () => Promise.resolve(hive));
  const hiveId = hive.hive_id || hive.id || '';
  if (hiveId) {
    await test('hive/send', () => t('POST', '/v1/hive/' + hiveId + '/send', { channel: 'general', from: 'audit', message: 'test' }));
    await test('hive/read', () => t('GET', '/v1/hive/' + hiveId + '/channel/general'));
    await test('hive/sync', () => t('GET', '/v1/hive/' + hiveId + '/sync?since=2020-01-01T00:00:00Z'));
    await test('hive/state', () => t('POST', '/v1/hive/' + hiveId + '/state', { key: 'test', value: 'ok' }));
  }

  console.log('\n── Org ──');
  const org = await t('POST', '/v1/org/launch', { name: 'audit', agents: [{ name: 'A', role: 't', model: 'claude', skills: ['t'] }], channels: ['general'] });
  await test('org/launch', () => Promise.resolve(org));
  await test('org/templates', () => t('GET', '/v1/org/templates'));
  const orgId = (org.data || org).org_id || '';
  if (orgId) await test('org/status', () => t('GET', '/v1/org/' + orgId + '/status'));

  console.log('\n── Mesh ──');
  await test('context', () => t('POST', '/v1/context/session', {}));
  await test('introspect', () => t('GET', '/v1/introspect?slug=crypto-uuid'));
  await test('route', () => t('POST', '/v1/route', { task: 'uuid' }));
  await test('state/set', () => t('POST', '/v1/state/set', { key: 'a', value: 'b' }));
  await test('state/get', () => t('POST', '/v1/state/get', { key: 'a' }));

  console.log('\n── Workflows ──');
  await test('workflow/run', () => t('POST', '/v1/workflows/run', { steps: [{ api: 'crypto-uuid' }] }));
  await test('trigger/create', () => t('POST', '/v1/workflows/triggers', { name: 'a', workflow_steps: [{ api: 'crypto-uuid' }] }));

  console.log('\n── Advanced ──');
  await test('compare', () => t('POST', '/v1/compare', { prompt: 'OK', models: ['anthropic'] }));
  await test('guardrails', () => t('POST', '/v1/guardrails/scan', { text: 'test@email.com' }));
  await test('redact', () => t('POST', '/v1/guardrails/redact', { text: 'test@email.com' }));
  await test('prompts', () => t('POST', '/v1/prompts/save', { name: 'a', template: 'hi' }));
  await test('cost-opt', () => t('POST', '/v1/cost-optimizer', { task: 'test' }));
  await test('fine-tune', () => t('POST', '/v1/fine-tuning/jobs', { provider: 'openai', training_data: [{ input: 'a', output: 'b' }] }));
  await test('traces', () => t('POST', '/v1/traces/start', { name: 'audit' }));
  await test('cache/check', () => t('POST', '/v1/cache/check', { text: 'test' }));
  await test('telemetry', () => t('GET', '/v1/telemetry?since=1h'));
  await test('billing', () => t('GET', '/v1/billing/usage?period=1h'));
  await test('explorer', () => t('POST', '/v1/explorer/try', { slug: 'crypto-uuid' }));
  await test('benchmark', () => t('GET', '/v1/benchmark'));
  await test('dashboard', () => api('GET', '/v1/status/dashboard'));
  await test('healthcheck', () => t('GET', '/v1/healthcheck/deep'));
  await test('ratelimit', () => t('GET', '/v1/ratelimit/status'));
  await test('docs', () => api('GET', '/v1/docs/overview'));
  await test('onboarding', () => t('GET', '/v1/quickstart/interactive'));
  await test('versions', () => api('GET', '/v1/api/versions'));

  console.log('\n── Exchange ──');
  await test('exchange/list', () => t('GET', '/v1/exchange/list'));
  await test('exchange/post', () => t('POST', '/v1/exchange/post', { task: 'test', reward: 5 }));

  console.log('\n── Agent ──');
  await test('agent/run', () => t('POST', '/v1/agent/run', { task: 'Generate a UUID' }));
  await test('agent/templates', () => t('GET', '/v1/agent/templates'));

  // Summary
  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log('\n═══════════════════════════════');
  console.log('PASS: ' + pass + '/' + (pass + fail) + ' (' + Math.round(pass / (pass + fail) * 100) + '%)');
  if (fail > 0) {
    console.log('FAILURES:');
    for (const r of results.filter(r => !r.ok)) console.log('  ✗ ' + r.name);
  }
  const bal = await t('GET', '/v1/credits/balance');
  console.log('Credits: started 2000, remaining ' + (bal.balance || '?'));
}

main().catch(e => console.error('Fatal:', e.message));
