#!/usr/bin/env node
// DEEP AUDIT: Tests every endpoint with known-answer correctness, edge cases, and inner logic verification
// Outputs a detailed report with PASS/FAIL/FLAG for each endpoint

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const BASE = 'http://localhost:3000';
const KEY = 'sk-slop-demo-key-12345678';
const START = parseInt(process.env.START || '0');
const END = parseInt(process.env.END || '99999');
const OUTFILE = process.env.OUTFILE || '/tmp/deep-audit.jsonl';

function _post(slug, body, timeout = 10000) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body || {});
    const req = http.request({
      hostname: 'localhost', port: 3000,
      path: '/v1/' + slug, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Authorization': 'Bearer ' + KEY },
      timeout
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, d: JSON.parse(b) }); }
        catch (e) { resolve({ s: res.statusCode, raw: b.slice(0, 300) }); }
      });
    });
    req.on('error', e => resolve({ s: 0, err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ s: 0, err: 'TIMEOUT' }); });
    req.write(data);
    req.end();
  });
}
async function post(slug, body, timeout = 10000) {
  let res = await _post(slug, body, timeout);
  if (res.s === 429) { await new Promise(r => setTimeout(r, 3000)); res = await _post(slug, body, timeout); }
  if (res.s === 429) { await new Promise(r => setTimeout(r, 10000)); res = await _post(slug, body, timeout); }
  return res;
}

function get(path) {
  return new Promise((resolve) => {
    http.get(BASE + path, { headers: { 'Authorization': 'Bearer ' + KEY } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

// ═══════════════════════════════════════════════════════════════
// KNOWN CORRECT ANSWERS — every answer verified by hand/calculator
// ═══════════════════════════════════════════════════════════════
const DEEP_TESTS = {
  // ─── TEXT PROCESSING ────────────────────────────────────────
  'text-word-count': [
    { input: { text: 'hello world' }, check: d => d.words === 2 && d.characters === 11, desc: 'basic count' },
    { input: { text: '' }, check: d => d.words === 0, desc: 'empty string' },
    { input: { text: 'one' }, check: d => d.words === 1, desc: 'single word' },
    { input: { text: '  spaces   everywhere  ' }, check: d => d.words === 2, desc: 'extra whitespace' },
    { input: { text: 'Hello. World! How? Are you.' }, check: d => d.sentences >= 4, desc: 'sentence count' },
  ],
  'text-char-count': [
    { input: { text: 'abc123' }, check: d => (d.withSpaces === 6 || d.total === 6) && d.letters === 3 && d.digits === 3, desc: 'mixed chars' },
    { input: { text: '' }, check: d => (d.withSpaces === 0 || d.total === 0), desc: 'empty' },
  ],
  'text-extract-emails': [
    { input: { text: 'a@b.com and c@d.org' }, check: d => d.emails.length === 2 && d.emails.includes('a@b.com'), desc: 'two emails' },
    { input: { text: 'no emails here' }, check: d => d.emails.length === 0, desc: 'no emails' },
    { input: { text: 'dup@dup.com dup@dup.com' }, check: d => d.emails.length === 1, desc: 'dedup' },
  ],
  'text-reverse': [
    { input: { text: 'abc' }, check: d => (d.result === 'cba' || d.reversed === 'cba'), desc: 'basic' },
    { input: { text: '' }, check: d => (d.result === '' || d.reversed === ''), desc: 'empty' },
    { input: { text: 'racecar' }, check: d => (d.result === 'racecar' || d.reversed === 'racecar'), desc: 'palindrome' },
  ],
  'text-slugify': [
    { input: { text: 'Hello World! Test' }, check: d => d.slug === 'hello-world-test', desc: 'basic' },
    { input: { text: '---already---slugified---' }, check: d => d.slug === 'already-slugified' || d.slug === '-already-slugified-', desc: 'dashes' },
    { input: { text: 'café résumé' }, check: d => d.slug === 'cafe-resume', desc: 'diacritics' },
  ],
  'text-case-convert': [
    { input: { text: 'hello world', case: 'upper' }, check: d => d.result === 'HELLO WORLD', desc: 'upper' },
    { input: { text: 'HELLO WORLD', case: 'lower' }, check: d => d.result === 'hello world', desc: 'lower' },
    { input: { text: 'hello world', case: 'title' }, check: d => d.result === 'Hello World', desc: 'title' },
  ],
  'text-rot13': [
    { input: { text: 'Hello' }, check: d => d.result === 'Uryyb', desc: 'basic rot13' },
    { input: { text: 'Uryyb' }, check: d => d.result === 'Hello', desc: 'double rot13 = identity' },
  ],
  'text-base64-encode': [
    { input: { text: 'hello world' }, check: d => d.result === 'aGVsbG8gd29ybGQ=', desc: 'known base64' },
  ],
  'text-base64-decode': [
    { input: { text: 'aGVsbG8gd29ybGQ=' }, check: d => d.result === 'hello world', desc: 'decode base64' },
  ],
  'text-url-encode': [
    { input: { text: 'hello world&foo=bar' }, check: d => d.result === 'hello%20world%26foo%3Dbar', desc: 'url encode' },
  ],
  'text-url-decode': [
    { input: { text: 'hello%20world%26foo%3Dbar' }, check: d => d.result === 'hello world&foo=bar', desc: 'url decode' },
  ],
  'text-hex-encode': [
    { input: { text: 'AB' }, check: d => d.result === '4142', desc: 'hex encode' },
  ],
  'text-hex-decode': [
    { input: { text: '4142' }, check: d => d.result === 'AB', desc: 'hex decode' },
  ],
  'text-escape-html': [
    { input: { text: '<script>alert("xss")</script>' }, check: d => d.result && d.result.includes('&lt;') && !d.result.includes('<script>'), desc: 'XSS safe' },
  ],
  'text-readability-score': [
    { input: { text: 'The cat sat on the mat. The dog ran fast.' }, check: d => typeof d.fleschReadingEase === 'number' && d.fleschReadingEase > 50, desc: 'simple text = high readability' },
  ],

  // ─── CRYPTO ─────────────────────────────────────────────────
  'crypto-hash-sha256': [
    { input: { text: 'hello' }, check: d => d.hash === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', desc: 'known SHA-256' },
    { input: { text: '' }, check: d => d.hash === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', desc: 'empty string SHA-256' },
  ],
  'crypto-hash-md5': [
    { input: { text: 'hello' }, check: d => d.hash === '5d41402abc4b2a76b9719d911017c592', desc: 'known MD5' },
  ],
  'crypto-hash-sha512': [
    { input: { text: 'hello' }, check: d => d.hash && d.hash.length === 128, desc: 'SHA-512 length' },
  ],
  'crypto-hmac': [
    { input: { text: 'hello', key: 'secret', algorithm: 'sha256' }, check: d => d.hmac === '88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b', desc: 'known HMAC' },
  ],
  'crypto-uuid': [
    { input: {}, check: d => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(d.uuid), desc: 'valid UUID v4 format' },
  ],
  'crypto-encrypt-aes': [
    { input: { text: 'secret message', key: 'mykey123' }, check: d => d.encrypted && d.iv && d.tag, desc: 'returns ciphertext+iv+tag' },
  ],
  'crypto-jwt-decode': [
    { input: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' },
      check: d => d.payload && d.payload.name === 'John Doe' && d.payload.sub === '1234567890', desc: 'decode known JWT' },
  ],

  // ─── MATH (exact answers) ──────────────────────────────────
  'math-evaluate': [
    { input: { expression: '2+3*4' }, check: d => d.result === 14, desc: 'order of operations' },
    { input: { expression: '(2+3)*4' }, check: d => d.result === 20, desc: 'parentheses' },
    { input: { expression: '10/3' }, check: d => Math.abs(d.result - 3.3333) < 0.01, desc: 'division' },
    { input: { expression: '2**10' }, check: d => d.result === 1024, desc: 'exponentiation' },
    { input: { expression: '100%7' }, check: d => d.result === 2, desc: 'modulo' },
  ],
  'math-factorial': [
    { input: { n: 0 }, check: d => d.result === 1, desc: '0! = 1' },
    { input: { n: 1 }, check: d => d.result === 1, desc: '1! = 1' },
    { input: { n: 6 }, check: d => d.result === 720, desc: '6! = 720' },
    { input: { n: 12 }, check: d => d.result === 479001600, desc: '12! = 479001600' },
    { input: { n: 20 }, check: d => d.result === 2432902008176640000, desc: '20! = 2.43e18' },
  ],
  'math-fibonacci': [
    { input: { n: 1 }, check: d => { const s = d.sequence || d.result; return Array.isArray(s) && s[0] === 0; }, desc: 'fib(1)' },
    { input: { n: 8 }, check: d => { const s = d.sequence || d.result; return Array.isArray(s) && s[7] === 13; }, desc: 'fib(8) = 13' },
  ],
  'math-prime-check': [
    { input: { number: 2 }, check: d => d.isPrime === true || d.prime === true || d.result === true, desc: '2 is prime' },
    { input: { number: 4 }, check: d => d.isPrime === false || d.prime === false || d.result === false, desc: '4 is not prime' },
    { input: { number: 97 }, check: d => d.isPrime === true || d.prime === true || d.result === true, desc: '97 is prime' },
    { input: { number: 1 }, check: d => d.isPrime === false || d.prime === false || d.result === false, desc: '1 is not prime' },
  ],
  'math-gcd': [
    { input: { a: 12, b: 8 }, check: d => (d.result === 4 || d.gcd === 4), desc: 'gcd(12,8)=4' },
    { input: { a: 17, b: 13 }, check: d => (d.result === 1 || d.gcd === 1), desc: 'gcd coprimes=1' },
    { input: { a: 0, b: 5 }, check: d => (d.result === 5 || d.gcd === 5), desc: 'gcd(0,5)=5' },
  ],
  'math-lcm': [
    { input: { a: 4, b: 6 }, check: d => (d.result === 12 || d.lcm === 12), desc: 'lcm(4,6)=12' },
    { input: { a: 7, b: 3 }, check: d => (d.result === 21 || d.lcm === 21), desc: 'lcm(7,3)=21' },
  ],
  'math-statistics': [
    { input: { numbers: [2, 4, 4, 4, 5, 5, 7, 9] }, check: d => {
      const mean = d.mean || (d.statistics && d.statistics.mean);
      return Math.abs(mean - 5) < 0.01;
    }, desc: 'mean = 5' },
    { input: { numbers: [1, 2, 3, 4, 5] }, check: d => {
      const median = d.median || (d.statistics && d.statistics.median);
      return median === 3;
    }, desc: 'median = 3' },
  ],
  'math-solve-quadratic': [
    { input: { a: 1, b: -5, c: 6 }, check: d => {
      const roots = d.roots || d.solutions || [];
      return roots.includes(2) && roots.includes(3);
    }, desc: 'x²-5x+6=0 → roots 2,3' },
    { input: { a: 1, b: 0, c: 1 }, check: d => {
      return d.discriminant < 0 || (d.roots && d.roots.length === 0) || d.error;
    }, desc: 'x²+1=0 → no real roots' },
  ],
  'math-distance': [
    { input: { x1: 0, y1: 0, x2: 3, y2: 4 }, check: d => d.distance === 5 || d.result === 5, desc: '3-4-5 triangle' },
  ],
  'math-sigmoid': [
    { input: { x: 0 }, check: d => Math.abs((d.result || d.value || 0) - 0.5) < 0.001, desc: 'sigmoid(0)=0.5' },
  ],
  'math-combinations': [
    { input: { n: 10, r: 3 }, check: d => (d.result === 120 || d.combinations === 120), desc: 'C(10,3)=120' },
  ],
  'math-permutations': [
    { input: { n: 5, r: 3 }, check: d => (d.result === 60 || d.permutations === 60), desc: 'P(5,3)=60' },
  ],

  // ─── FINANCE (exact formulas) ──────────────────────────────
  'finance-compound-interest': [
    { input: { principal: 1000, rate: 5, time: 10, n: 1 }, check: d => {
      // A = 1000*(1+0.05)^10 = 1628.89
      return Math.abs((d.result || d.amount || d.final || 0) - 1628.89) < 1;
    }, desc: 'compound annually' },
  ],
  'finance-loan-payment': [
    { input: { principal: 200000, rate: 4.5, years: 30 }, check: d => {
      // M = 200000 * (0.00375 * 1.00375^360) / (1.00375^360 - 1) ≈ 1013.37
      return Math.abs((d.payment || d.monthly || d.result || 0) - 1013.37) < 5;
    }, desc: 'mortgage payment' },
  ],
  'finance-roi': [
    { input: { investment: 1000, returns: 1500 }, check: d => Math.abs((d.roi || d.result || 0) - 50) < 0.1, desc: 'ROI = 50%' },
  ],
  'finance-npv': [
    { input: { cashFlows: [-1000, 300, 400, 500, 600], rate: 10 }, check: d => {
      // NPV = -1000 + 300/1.1 + 400/1.21 + 500/1.331 + 600/1.4641 ≈ 412.27
      return Math.abs((d.npv || d.result || 0) - 412.27) < 5;
    }, desc: 'NPV calculation' },
  ],
  'finance-break-even': [
    { input: { fixedCosts: 10000, pricePerUnit: 50, costPerUnit: 30 }, check: d => {
      return (d.units || d.breakEvenUnits || d.result || 0) === 500;
    }, desc: 'break-even = 500 units' },
  ],

  // ─── SORT ALGORITHMS (correctness) ─────────────────────────
  'sort-bubble': [
    { input: { data: [5, 3, 8, 1, 9, 2] }, check: d => JSON.stringify(d.sorted || d.result) === '[1,2,3,5,8,9]', desc: 'sorted correctly' },
    { input: { data: [] }, check: d => (d.sorted || d.result || []).length === 0, desc: 'empty array' },
    { input: { data: [1] }, check: d => JSON.stringify(d.sorted || d.result) === '[1]', desc: 'single element' },
  ],
  'sort-quick': [
    { input: { data: [10, -3, 7, 0, 15, -1] }, check: d => JSON.stringify(d.sorted || d.result) === '[-3,-1,0,7,10,15]', desc: 'with negatives' },
  ],
  'sort-merge': [
    { input: { data: [5, 3, 8, 1, 9, 2] }, check: d => JSON.stringify(d.sorted || d.result) === '[1,2,3,5,8,9]', desc: 'merge sort' },
  ],
  'sort-topological': [
    { input: { graph: { a: ['b', 'c'], b: ['d'], c: ['d'], d: [] } }, check: d => {
      const s = d.sorted || d.result || d.order || [];
      // a must come before b and c, b and c before d
      return s.indexOf('a') < s.indexOf('b') && s.indexOf('a') < s.indexOf('c') && s.indexOf('b') < s.indexOf('d');
    }, desc: 'correct topological order' },
  ],
  'sort-natural': [
    { input: { data: ['file10', 'file2', 'file1', 'file20'] }, check: d => {
      const s = d.sorted || d.result || [];
      return s[0] === 'file1' && s[1] === 'file2' && s[2] === 'file10' && s[3] === 'file20';
    }, desc: 'natural number sort' },
  ],

  // ─── ML ALGORITHMS (inner logic) ──────────────────────────
  'ml-cosine-similarity': [
    { input: { a: [1, 0, 0], b: [0, 1, 0] }, check: d => Math.abs((d.similarity || d.result || 0) - 0) < 0.01, desc: 'orthogonal = 0' },
    { input: { a: [1, 2, 3], b: [1, 2, 3] }, check: d => Math.abs((d.similarity || d.result || 0) - 1) < 0.01, desc: 'identical = 1' },
    { input: { a: [1, 0], b: [-1, 0] }, check: d => Math.abs((d.similarity || d.result || 0) - (-1)) < 0.01, desc: 'opposite = -1' },
  ],
  'ml-sentiment': [
    { input: { text: 'I love this amazing wonderful product!' }, check: d => {
      const s = d.sentiment || d.label || '';
      const score = d.score || 0;
      return (typeof s === 'string' && s.toLowerCase().includes('pos')) || score > 0;
    }, desc: 'positive sentiment' },
    { input: { text: 'This is terrible, awful, horrible garbage.' }, check: d => {
      const s = d.sentiment || d.label || '';
      const score = d.score || 0;
      return (typeof s === 'string' && s.toLowerCase().includes('neg')) || score < 0;
    }, desc: 'negative sentiment' },
  ],
  'ml-tokenize': [
    { input: { text: 'Hello world, how are you?' }, check: d => {
      const tokens = d.tokens || d.result || [];
      return tokens.length >= 5;
    }, desc: 'tokenization' },
  ],

  // ─── SEARCH ALGORITHMS ─────────────────────────────────────
  'search-levenshtein': [
    { input: { a: 'kitten', b: 'sitting' }, check: d => (d.distance || d.result) === 3, desc: 'edit distance = 3' },
    { input: { a: 'abc', b: 'abc' }, check: d => (d.distance || d.result) === 0, desc: 'identical = 0' },
    { input: { a: '', b: 'abc' }, check: d => (d.distance || d.result) === 3, desc: 'empty to abc = 3' },
  ],
  'search-binary': [
    { input: { data: [1, 3, 5, 7, 9], target: 7 }, check: d => (d.index === 3 || d.found === true), desc: 'find 7 at index 3' },
    { input: { data: [1, 3, 5, 7, 9], target: 4 }, check: d => (d.index === -1 || d.found === false), desc: 'not found' },
  ],

  // ─── DATA OPERATIONS ───────────────────────────────────────
  'data-sort': [
    { input: { data: [3, 1, 4, 1, 5, 9, 2, 6], order: 'asc' }, check: d => {
      const r = d.result || d.sorted || d.data || [];
      return JSON.stringify(r) === '[1,1,2,3,4,5,6,9]';
    }, desc: 'sort ascending' },
  ],
  'data-deduplicate': [
    { input: { data: [1, 2, 2, 3, 3, 3] }, check: d => {
      const r = d.result || d.deduplicated || d.data || [];
      return r.length === 3 && r.includes(1) && r.includes(2) && r.includes(3);
    }, desc: 'deduplicate' },
  ],
  'data-chunk': [
    { input: { data: [1, 2, 3, 4, 5], size: 2 }, check: d => {
      const r = d.result || d.chunks || [];
      return r.length === 3 && r[0].length === 2 && r[2].length === 1;
    }, desc: 'chunk into pairs' },
  ],
  'data-flatten': [
    { input: { data: [[1, 2], [3, [4, 5]], [6]] }, check: d => {
      const r = d.result || d.flattened || [];
      return r.length === 6;
    }, desc: 'flatten nested' },
  ],
  'data-correlation': [
    { input: { x: [1, 2, 3, 4, 5], y: [2, 4, 6, 8, 10] }, check: d => {
      return Math.abs((d.r || d.correlation || d.result || 0) - 1) < 0.01;
    }, desc: 'perfect positive correlation' },
  ],

  // ─── MEMORY PERSISTENCE ────────────────────────────────────
  'memory-set': [
    { input: { key: '__deep_audit_test__', value: 'persistence_check_42' }, check: d => d.status === 'ok' || d.success === true, desc: 'set key' },
  ],
  'memory-get': [
    { input: { key: '__deep_audit_test__' }, check: d => d.value === 'persistence_check_42', desc: 'retrieve persisted value', depends: 'memory-set' },
  ],

  // ─── EXEC (turing completeness) ────────────────────────────
  'exec-javascript': [
    { input: { code: 'let sum=0; for(let i=1;i<=100;i++) sum+=i; return sum;' }, check: d => d.result === 5050, desc: 'sum 1..100 = 5050' },
    { input: { code: 'return [1,2,3].map(x=>x*x)' }, check: d => JSON.stringify(d.result) === '[1,4,9]', desc: 'map squares' },
    { input: { code: 'function fib(n){return n<=1?n:fib(n-1)+fib(n-2)} return fib(10)' }, check: d => d.result === 55, desc: 'recursive fib(10)=55' },
  ],
  'exec-jq': [
    { input: { json: { users: [{ name: 'Alice' }, { name: 'Bob' }] }, filter: '.users[].name' }, check: d => {
      const r = d.result || [];
      return Array.isArray(r) && r.includes('Alice') && r.includes('Bob');
    }, desc: 'jq filter' },
  ],
  'exec-template': [
    { input: { template: 'Hello {{name}}, you are {{age}} years old', data: { name: 'Alice', age: 30 } }, check: d => {
      return (d.result || d.output || '').includes('Alice') && (d.result || d.output || '').includes('30');
    }, desc: 'template interpolation' },
  ],

  // ─── DATE/TIME ─────────────────────────────────────────────
  'date-weekday': [
    { input: { date: '2024-01-01' }, check: d => (d.weekday || d.day || d.result || '').toLowerCase() === 'monday', desc: '2024-01-01 = Monday' },
    { input: { date: '2024-12-25' }, check: d => (d.weekday || d.day || d.result || '').toLowerCase() === 'wednesday', desc: 'Christmas 2024 = Wednesday' },
  ],
  'date-is-leap-year': [
    { input: { year: 2024 }, check: d => d.isLeapYear === true || d.leapYear === true || d.result === true, desc: '2024 is leap' },
    { input: { year: 2023 }, check: d => d.isLeapYear === false || d.leapYear === false || d.result === false, desc: '2023 is not' },
    { input: { year: 1900 }, check: d => d.isLeapYear === false || d.leapYear === false || d.result === false, desc: '1900 is not (century rule)' },
    { input: { year: 2000 }, check: d => d.isLeapYear === true || d.leapYear === true || d.result === true, desc: '2000 is (400 rule)' },
  ],
  'date-days-in-month': [
    { input: { year: 2024, month: 2 }, check: d => (d.result === 29 || d.days === 29), desc: 'Feb 2024 = 29 (leap)' },
    { input: { year: 2023, month: 2 }, check: d => (d.result === 28 || d.days === 28), desc: 'Feb 2023 = 28' },
  ],

  // ─── VALIDATION ────────────────────────────────────────────
  'validate-email-syntax': [
    { input: { email: 'valid@example.com' }, check: d => d.valid === true, desc: 'valid email' },
    { input: { email: 'not-an-email' }, check: d => d.valid === false, desc: 'invalid email' },
    { input: { email: '' }, check: d => d.valid === false, desc: 'empty string' },
  ],
  'validate-credit-card': [
    { input: { number: '4111111111111111' }, check: d => d.valid === true, desc: 'Visa test card (Luhn valid)' },
    { input: { number: '4111111111111112' }, check: d => d.valid === false, desc: 'Luhn invalid' },
  ],

  // ─── CONVERT ───────────────────────────────────────────────
  'convert-temperature': [
    { input: { value: 0, from: 'celsius', to: 'fahrenheit' }, check: d => Math.abs((d.result || d.value || d.converted || 0) - 32) < 0.1, desc: '0°C = 32°F' },
    { input: { value: 100, from: 'celsius', to: 'fahrenheit' }, check: d => Math.abs((d.result || d.value || d.converted || 0) - 212) < 0.1, desc: '100°C = 212°F' },
    { input: { value: -40, from: 'celsius', to: 'fahrenheit' }, check: d => Math.abs((d.result || d.value || d.converted || 0) - (-40)) < 0.1, desc: '-40°C = -40°F' },
  ],

  // ─── ORCHESTRATION ─────────────────────────────────────────
  'orch-parallel': [
    { input: { tasks: [{ slug: 'math-evaluate', input: { expression: '2+2' } }, { slug: 'math-evaluate', input: { expression: '3+3' } }] },
      check: d => {
        const results = d.results || [];
        return results.length === 2;
      }, desc: 'parallel execution returns 2 results' },
  ],
  'orch-batch': [
    { input: { slug: 'math-evaluate', inputs: [{ expression: '1+1' }, { expression: '2+2' }, { expression: '3+3' }] },
      check: d => {
        const results = d.results || [];
        return results.length === 3;
      }, desc: 'batch returns 3 results' },
  ],
};

async function runDeepAudit() {
  const tools = await get('/v1/tools?limit=2000');
  if (!tools || !tools.apis) { console.error('Cannot get tools'); process.exit(1); }
  const allSlugs = tools.apis.map(a => a.slug);
  const slugs = allSlugs.slice(START, END);
  console.log(`Deep audit: ${slugs.length} endpoints (${START}-${Math.min(END, allSlugs.length)})`);

  const results = [];
  let totalTests = 0, totalPass = 0, totalFail = 0;
  const flagged = [];

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const tests = DEEP_TESTS[slug];

    if (tests) {
      // Run known-answer tests
      for (const t of tests) {
        totalTests++;
        const res = await post(slug, t.input);
        const d = res.d?.data || res.d || {};
        let passed = false;
        try { passed = res.s === 200 && t.check(d); } catch (e) { passed = false; }
        if (passed) totalPass++;
        else {
          totalFail++;
          flagged.push({ slug, desc: t.desc, input: t.input, got: JSON.stringify(d).slice(0, 200) });
        }
        const line = { slug, test: t.desc, pass: passed, http: res.s, data: JSON.stringify(d).slice(0, 150) };
        results.push(line);
        if (!passed) console.log(`  FAIL ${slug}: ${t.desc} → ${JSON.stringify(d).slice(0, 100)}`);
      }
    } else {
      // No deep test — run basic smoke test with edge cases
      totalTests++;
      const generic = guessInput(slug);
      const res = await post(slug, generic);
      const ok = res.s === 200 && res.d && (res.d.ok || res.d.data);
      if (ok) totalPass++;
      else {
        totalFail++;
        flagged.push({ slug, desc: 'smoke test', input: generic, got: JSON.stringify(res.d || res.err || '').slice(0, 200) });
      }
      results.push({ slug, test: 'smoke', pass: ok, http: res.s });

      // Edge case: empty input
      totalTests++;
      const emptyRes = await post(slug, {});
      const emptyOk = emptyRes.s === 200 || emptyRes.s === 400; // 400 for missing required params is OK
      if (emptyOk) totalPass++;
      else {
        totalFail++;
        flagged.push({ slug, desc: 'empty input', input: {}, got: `HTTP ${emptyRes.s}: ${JSON.stringify(emptyRes.d?.error || emptyRes.err || '').slice(0, 150)}` });
        if (emptyRes.s >= 500) console.log(`  FLAG ${slug}: crashes on empty input (HTTP ${emptyRes.s})`);
      }
      results.push({ slug, test: 'empty_input', pass: emptyOk, http: emptyRes.s });
    }

    if (i % 50 === 49) {
      console.log(`  progress: ${i + 1}/${slugs.length} | tests: ${totalTests} | pass: ${totalPass} | fail: ${totalFail}`);
    }
    // Pace to avoid rate limiting (120 req/min = 2/sec max, but we do 2 reqs per endpoint)
    await new Promise(r => setTimeout(r, 600));
  }

  // Summary
  const summary = {
    total_endpoints: slugs.length,
    total_tests: totalTests,
    pass: totalPass,
    fail: totalFail,
    pass_rate: (totalPass / totalTests * 100).toFixed(1) + '%',
    flagged_count: flagged.length,
    flagged: flagged
  };

  console.log('\n' + '='.repeat(60));
  console.log(`DEEP AUDIT COMPLETE: ${START}-${END}`);
  console.log(`Total tests: ${totalTests}`);
  console.log(`Pass: ${totalPass} (${summary.pass_rate})`);
  console.log(`Fail: ${totalFail}`);
  console.log(`Flagged endpoints: ${flagged.length}`);
  console.log('='.repeat(60));

  if (flagged.length > 0) {
    console.log('\n=== FLAGGED ENDPOINTS ===');
    flagged.forEach(f => console.log(`  ${f.slug} | ${f.desc} | ${f.got.slice(0, 100)}`));
  }

  fs.writeFileSync(OUTFILE, JSON.stringify(summary, null, 2));
  console.log(`\nResults written to ${OUTFILE}`);
}

function guessInput(slug) {
  const s = slug.toLowerCase();
  if (s.startsWith('text-')) return { text: 'Hello world, this is a test sentence for deep audit.', input: 'test', value: 'test' };
  if (s.startsWith('math-')) return { expression: '2+3', a: 12, b: 8, numbers: [1, 2, 3, 4, 5], number: 17, n: 5, value: 42 };
  if (s.startsWith('crypto-')) return { text: 'hello', key: 'secret', algorithm: 'sha256', length: 16 };
  if (s.startsWith('date-')) return { date: '2024-01-15', year: 2024, month: 2 };
  if (s.startsWith('json-')) return { json: '{"test":true}', data: { test: true } };
  if (s.startsWith('validate-')) return { email: 'test@example.com', url: 'https://slopshop.gg', ip: '192.168.1.1', value: 'test@example.com', number: '4111111111111111', phone: '+15551234567', uuid: '550e8400-e29b-41d4-a716-446655440000', password: 'MyP@ss!2024', version: '1.2.3', color: '#FF5733', slug: 'hello-world', code: 'US', port: 8080, domain: 'slopshop.gg', expression: '*/5 * * * *', pattern: '^[a-z]+$' };
  if (s.startsWith('convert-')) return { value: 100, from: 'celsius', to: 'fahrenheit', number: '42' };
  if (s.startsWith('code-')) return { code: 'function foo() { return 1; }', language: 'javascript' };
  if (s.startsWith('network-')) return { domain: 'google.com', url: 'https://slopshop.gg', ip: '8.8.8.8', code: 404 };
  if (s.startsWith('image-')) return { url: 'https://via.placeholder.com/100', width: 100, height: 100 };
  if (s.startsWith('gen-')) return { count: 3, length: 16, text: 'Hello World', seed: 'test' };
  if (s.startsWith('exec-')) return { code: 'return 2+2', expression: '2+2', language: 'javascript' };
  if (s.startsWith('data-')) return { data: [5, 3, 8, 1, 9, 2], key: 'type', order: 'asc', size: 2 };
  if (s.startsWith('sort-')) return { data: [5, 3, 8, 1, 9, 2] };
  if (s.startsWith('search-')) return { query: 'test', items: ['hello', 'test', 'world'], a: 'abc', b: 'def', data: [1, 3, 5, 7], target: 5 };
  if (s.startsWith('ml-')) return { text: 'AI is transforming software development', data: [[1, 1], [2, 2], [8, 8]], x: [1, 2, 3], y: [2, 4, 6], a: [1, 2, 3], b: [4, 5, 6], k: 2 };
  if (s.startsWith('finance-')) return { amount: 1000, principal: 1000, rate: 5, time: 10, price: 100, cost: 50 };
  if (s.startsWith('sense-')) return { url: 'https://slopshop.gg', domain: 'google.com' };
  if (s.startsWith('enrich-')) return { domain: 'google.com', ip: '8.8.8.8', email: 'test@gmail.com' };
  if (s.startsWith('memory-')) return { key: 'audit-' + slug, value: 'test', query: 'test' };
  if (s.startsWith('counter-')) return { key: 'audit-ctr', amount: 1 };
  if (s.startsWith('queue-')) return { queue: 'audit-q', item: 'test' };
  if (s.startsWith('state-')) return { key: 'audit-state', value: { ok: true } };
  if (s.startsWith('orch-')) return { slug: 'math-evaluate', input: { expression: '2+2' }, tasks: [{ slug: 'math-evaluate', input: { expression: '1+1' } }], key: 'audit-' + slug, ms: 100 };
  if (s.startsWith('comm-')) return { email: 'test@gmail.com', phone: '+15551234567', url: 'https://slopshop.gg' };
  if (s.startsWith('analyze-')) return { text: 'AI and machine learning are transforming technology', data: 'name,age\nAlice,30\nBob,25', url: 'https://slopshop.gg' };
  if (s.startsWith('format-')) return { value: 1234567.89, number: 1234567.89, date: '2024-01-15', bytes: 1048576 };
  if (s.startsWith('logic-')) return { condition: true, value: 42, default: 0, cases: { a: 1 }, key: 'a' };
  if (s.startsWith('security-') || s.startsWith('auth-')) return { password: 'MyP@ssw0rd!2024', text: 'hello', algorithm: 'sha256', key: 'test', token: 'test' };
  if (s.startsWith('workflow-')) return { slug: 'math-evaluate', input: { expression: '2+2' }, attempt: 1, initialDelay: 100 };
  // Catch-all for superpowers and exotic handlers
  return { text: 'Deep audit test input', data: [1, 2, 3], value: 42, input: 'test', name: 'test', key: 'audit-' + slug, query: 'test', topic: 'artificial intelligence', description: 'test', prompt: 'test', count: 3 };
}

runDeepAudit().catch(e => { console.error(e); process.exit(1); });
