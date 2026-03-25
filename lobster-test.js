#!/usr/bin/env node
/**
 * LOBSTER QA: Simulates real users breaking everything.
 * Tests every API with: correct input, empty input, wrong types, unicode, huge data.
 * Reports crashes, failures, and missing features.
 */
const http = require('http');
const { API_DEFS } = require('./registry');
const { SCHEMAS } = require('./schemas');

const BASE = process.argv[2] || 'http://localhost:3021';
const KEY = process.argv[3] || 'sk-slop-demo-key-12345678';

function req(slug, input) {
  return new Promise(r => {
    const u = new URL('/v1/' + slug, BASE);
    const data = JSON.stringify(input);
    const rq = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' }, timeout: 10000 }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { try { r({ s: res.statusCode, b: JSON.parse(b) }); } catch (e) { r({ s: res.statusCode, b }); } });
    });
    rq.on('error', e => r({ s: 0, b: { error: e.message } }));
    rq.on('timeout', () => { rq.destroy(); r({ s: 0, b: { error: 'timeout' } }); });
    rq.write(data); rq.end();
  });
}

async function buyCredits() {
  await req('credits/buy', { amount: 1000000 });
}

const GOOD_INPUT = { text: 'Hello test@example.com visit https://example.com or call 555-1234. Order #42 for $99. #deal @john', data: 'hello lobster', numbers: [10, 20, 30, 40, 50], pattern: '[0-9]+', replacement: 'N', flags: 'g', from: 'USD', to: 'EUR', amount: 100, value: 72, date: '2026-03-25', hex: '#3b82f6', json: { name: 'Alice', age: 30, scores: [90, 85] }, ip: '192.168.1.1', cidr: '192.168.0.0/16', domain: 'google.com', url: 'https://httpbin.org/get', email: 'test@gmail.com', secret: 'my-secret', payload: { sub: 'lobster', role: 'admin' }, code: 'function fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }', language: 'javascript', topic: 'AI agents', income: 150000, filing_status: 'single', principal: 300000, annual_rate: 0.065, years: 30, cron: '30 9 * * 1-5', version: '1.2.3', bump: 'minor', number: 42, year: 2026, languages: ['node', 'python'], rows: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }], a: 'hello world\nfoo bar', b: 'hello lobster\nfoo bar\nnew line', n: 10, length: 8, bytes: 16, min: 1, max: 100, indent: 2, token: '', password: 'testpass123', key: 'encryption-key' };

async function main() {
  console.log('🦞 LOBSTER QA - Breaking Every API');
  console.log('====================================\n');

  await buyCredits();

  const slugs = Object.keys(API_DEFS);
  const results = { pass: 0, needsKey: 0, fail: 0, crash: 0, crashes: [], failures: [] };

  // TEST 1: Every API with good input
  console.log('TEST 1: All ' + slugs.length + ' APIs with correct input');
  for (const slug of slugs) {
    const r = await req(slug, GOOD_INPUT);
    if (r.s === 200) {
      const eng = r.b?.data?._engine;
      if (eng === 'needs_key') results.needsKey++;
      else results.pass++;
    } else if (r.s === 500) {
      results.crash++;
      results.crashes.push({ slug, error: r.b?.error?.message || 'unknown', test: 'good_input' });
    } else if (r.s === 0) {
      results.crash++;
      results.crashes.push({ slug, error: r.b?.error || 'connection', test: 'good_input' });
    } else {
      results.fail++;
      results.failures.push({ slug, status: r.s, test: 'good_input' });
    }
  }
  console.log(`  PASS: ${results.pass}  NEEDS_KEY: ${results.needsKey}  FAIL: ${results.fail}  CRASH: ${results.crash}`);
  if (results.crashes.length) results.crashes.forEach(c => console.log(`  CRASH: ${c.slug} - ${c.error}`));

  // TEST 2: Empty input on all compute APIs
  console.log('\nTEST 2: Empty input {} on compute APIs');
  let emptyOk = 0, emptyCrash = 0;
  const emptyCrashes = [];
  for (const [slug, def] of Object.entries(API_DEFS)) {
    if (def.tier !== 'compute') continue;
    const r = await req(slug, {});
    if (r.s === 200) emptyOk++;
    else if (r.s === 500) { emptyCrash++; emptyCrashes.push(slug + ': ' + (r.b?.error?.message || '').slice(0, 60)); }
  }
  console.log(`  OK: ${emptyOk}  CRASH: ${emptyCrash}`);
  if (emptyCrashes.length) emptyCrashes.forEach(c => console.log(`  CRASH: ${c}`));

  // TEST 3: Specific edge cases
  console.log('\nTEST 3: Edge cases');

  const tests = [
    ['math-statistics with string', 'math-statistics', { numbers: 'not an array' }],
    ['math-evaluate injection', 'math-evaluate', { text: 'process.exit(1)' }],
    ['bad regex', 'text-regex-test', { pattern: '(((((', text: 'test' }],
    ['bad decrypt', 'crypto-decrypt-aes', { encrypted: 'garbage', key: 'k', iv: 'badiv', tag: 'badtag' }],
    ['bad JSON validate', 'text-json-validate', { text: '{broken json' }],
    ['negative numbers stats', 'math-statistics', { numbers: [-5, -3, 0, 3, 5] }],
    ['unicode text', 'text-word-count', { text: '🦞 こんにちは мир 你好 مرحبا' }],
    ['empty string hash', 'crypto-hash-sha256', { data: '' }],
    ['zero division', 'math-evaluate', { text: '1/0' }],
    ['very long password', 'crypto-password-generate', { length: 256 }],
    ['large fibonacci', 'math-fibonacci', { n: 50 }],
    ['prime large', 'math-prime-check', { number: 999999937 }],
    ['SQL with injection', 'code-sql-format', { text: "SELECT * FROM users WHERE name = 'admin'; DROP TABLE users; --" }],
    ['nested JSON flatten', 'text-json-flatten', { json: { a: { b: { c: { d: { e: 1 } } } } } }],
    ['date far future', 'date-parse', { date: '2099-12-31' }],
    ['date epoch 0', 'date-unix-to-iso', { timestamp: 0 }],
    ['empty CSV', 'text-csv-to-json', { data: '' }],
    ['single line CSV', 'text-csv-to-json', { data: 'just,headers' }],
    ['JWT with no secret', 'crypto-jwt-sign', { payload: { admin: true } }],
    ['color convert black', 'math-color-convert', { hex: '#000000' }],
    ['color convert white', 'math-color-convert', { hex: '#ffffff' }],
    ['url parse garbage', 'text-url-parse', { text: 'not a url at all' }],
    ['base convert 0', 'math-base-convert', { text: '0', from_base: 10, to_base: 2 }],
    ['word count empty', 'text-word-count', { text: '' }],
    ['loan 0% interest', 'math-loan-payment', { principal: 100000, annual_rate: 0, years: 30 }],
  ];

  let edgeOk = 0, edgeCrash = 0;
  for (const [name, slug, input] of tests) {
    const r = await req(slug, input);
    if (r.s === 200) {
      edgeOk++;
      const hasError = r.b?.data?.error;
      console.log(`  OK  ${name}${hasError ? ' (graceful error: ' + String(hasError).slice(0, 40) + ')' : ''}`);
    } else if (r.s === 500) {
      edgeCrash++;
      console.log(`  CRASH  ${name}: ${r.b?.error?.message || JSON.stringify(r.b).slice(0, 60)}`);
    } else {
      console.log(`  HTTP${r.s}  ${name}`);
    }
  }
  console.log(`\n  Edge cases: ${edgeOk}/${tests.length} ok, ${edgeCrash} crashes`);

  // SUMMARY
  console.log('\n====================================');
  console.log('SUMMARY');
  console.log('====================================');
  console.log(`APIs tested:     ${slugs.length}`);
  console.log(`Pass (real):     ${results.pass}`);
  console.log(`Pass (need key): ${results.needsKey}`);
  console.log(`Fail:            ${results.fail}`);
  console.log(`Crash:           ${results.crash}`);
  console.log(`Empty input:     ${emptyOk}/${emptyOk + emptyCrash} ok`);
  console.log(`Edge cases:      ${edgeOk}/${tests.length} ok`);

  if (results.crash === 0 && emptyCrash === 0 && edgeCrash === 0) {
    console.log('\n🦞 ZERO CRASHES. Ship it.');
  } else {
    console.log('\n❌ CRASHES FOUND. Fix before ship.');
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
