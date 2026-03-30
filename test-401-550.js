#!/usr/bin/env node
'use strict';

// Test endpoints 401-550 with CORRECT inputs, verify CORRECT outputs.
// Server must already be running on port 9977.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9977;
const BASE = `http://127.0.0.1:${PORT}`;
const API_KEY = 'sk-slop-demo-key-12345678';

const results = [];
let pass = 0, fail = 0, skip = 0;

function post(slug, body, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE}/v1/${slug}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(chunks);
          resolve(parsed.data || parsed);
        }
        catch (e) { reject(new Error(`JSON parse error for ${slug}: ${chunks.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

function check(name, condition, expected, actual) {
  if (condition) {
    results.push({ name, status: 'PASS' });
    pass++;
  } else {
    results.push({ name, status: 'FAIL', expected: String(expected || ''), actual: String(actual != null ? actual : 'undefined') });
    fail++;
  }
}

async function safeTest(label, fn) {
  try {
    await fn();
  } catch (e) {
    results.push({ name: label, status: 'FAIL', expected: 'no error', actual: e.message.slice(0, 200) });
    fail++;
  }
}

async function run() {
  console.log(`Testing endpoints 401-550 against ${BASE} ...`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 401: gen-jwt-decode
  // ═══════════════════════════════════════════════════════════════════════════
  await safeTest('#401 gen-jwt-decode', async () => {
    // Create a real JWT-like token: header.payload.signature
    const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload = Buffer.from(JSON.stringify({sub:'1234',name:'Test',iat:1516239022})).toString('base64url');
    const token = header + '.' + payload + '.fakeSignature123';
    const r = await post('gen-jwt-decode', { token });
    check('#401 has header', r.header && r.header.alg === 'HS256', 'HS256', r.header?.alg);
    check('#401 has payload', r.payload && r.payload.sub === '1234', '1234', r.payload?.sub);
    check('#401 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 402: gen-base64-encode
  await safeTest('#402 gen-base64-encode', async () => {
    const r = await post('gen-base64-encode', { text: 'Hello World' });
    check('#402 encoded', r.encoded === Buffer.from('Hello World').toString('base64'), 'SGVsbG8gV29ybGQ=', r.encoded);
    check('#402 _engine', r._engine === 'real', 'real', r._engine);
  });

  // 403: gen-base64-decode
  await safeTest('#403 gen-base64-decode', async () => {
    const r = await post('gen-base64-decode', { encoded: 'SGVsbG8gV29ybGQ=' });
    check('#403 decoded', r.decoded === 'Hello World', 'Hello World', r.decoded);
  });

  // 404: gen-url-encode
  await safeTest('#404 gen-url-encode', async () => {
    const r = await post('gen-url-encode', { text: 'hello world&foo=bar' });
    check('#404 encoded', r.encoded === encodeURIComponent('hello world&foo=bar'), encodeURIComponent('hello world&foo=bar'), r.encoded);
  });

  // 405: gen-url-decode
  await safeTest('#405 gen-url-decode', async () => {
    const r = await post('gen-url-decode', { encoded: 'hello%20world%26foo%3Dbar' });
    check('#405 decoded', r.decoded === 'hello world&foo=bar', 'hello world&foo=bar', r.decoded);
  });

  // 406: gen-html-escape
  await safeTest('#406 gen-html-escape', async () => {
    const r = await post('gen-html-escape', { text: '<script>alert("xss")</script>' });
    check('#406 escaped', r.escaped === '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', 'expected escaped', r.escaped);
  });

  // 407: analyze-readability
  await safeTest('#407 analyze-readability', async () => {
    const r = await post('analyze-readability', { text: 'The quick brown fox jumps over the lazy dog. This is a simple sentence.' });
    check('#407 has grade_level', typeof r.grade_level === 'number', 'number', typeof r.grade_level);
    check('#407 has words', r.words > 0, '>0', r.words);
    check('#407 has sentences', r.sentences > 0, '>0', r.sentences);
    check('#407 has reading_time_min', typeof r.reading_time_min === 'number', 'number', typeof r.reading_time_min);
  });

  // 408: analyze-sentiment-simple
  await safeTest('#408 analyze-sentiment-simple', async () => {
    const r = await post('analyze-sentiment-simple', { text: 'This is a great and amazing product' });
    check('#408 positive > 0', r.positive > 0, '>0', r.positive);
    check('#408 sentiment=positive', r.sentiment === 'positive', 'positive', r.sentiment);
  });

  // 409: analyze-keywords
  await safeTest('#409 analyze-keywords', async () => {
    const r = await post('analyze-keywords', { text: 'machine learning models use machine learning to learn from data', top: 3 });
    check('#409 has keywords', Array.isArray(r.keywords) && r.keywords.length > 0, 'non-empty array', JSON.stringify(r.keywords?.slice(0,2)));
    check('#409 top keyword is machine or learning', r.keywords[0]?.word === 'machine' || r.keywords[0]?.word === 'learning', 'machine or learning', r.keywords[0]?.word);
  });

  // 410: analyze-language-detect
  await safeTest('#410 analyze-language-detect', async () => {
    const r = await post('analyze-language-detect', { text: 'The quick brown fox jumps over the lazy dog and the cat' });
    check('#410 language=english', r.language === 'english', 'english', r.language);
    check('#410 confidence > 0', r.confidence > 0, '>0', r.confidence);
  });

  // 411: analyze-url-parts
  await safeTest('#411 analyze-url-parts', async () => {
    const r = await post('analyze-url-parts', { url: 'https://example.com:8080/path?foo=bar#hash' });
    check('#411 hostname', r.hostname === 'example.com', 'example.com', r.hostname);
    check('#411 port', r.port === '8080', '8080', r.port);
    check('#411 pathname', r.pathname === '/path', '/path', r.pathname);
    check('#411 params.foo', r.params?.foo === 'bar', 'bar', r.params?.foo);
  });

  // 412: analyze-json-paths
  await safeTest('#412 analyze-json-paths', async () => {
    const r = await post('analyze-json-paths', { data: { name: 'test', nested: { value: 42 } } });
    check('#412 has paths', Array.isArray(r.paths) && r.paths.length > 0, 'non-empty', r.count);
    check('#412 count matches', r.count === r.paths.length, r.paths?.length, r.count);
  });

  // 413: analyze-duplicates
  await safeTest('#413 analyze-duplicates', async () => {
    const r = await post('analyze-duplicates', { data: [1, 2, 3, 2, 4, 1, 5] });
    check('#413 has duplicates', r.duplicates?.length > 0, '>0', r.duplicates?.length);
    check('#413 total=7', r.total === 7, 7, r.total);
    check('#413 unique=5', r.unique === 5, 5, r.unique);
  });

  // 414: analyze-outliers
  await safeTest('#414 analyze-outliers', async () => {
    const r = await post('analyze-outliers', { data: [10, 11, 12, 10, 11, 100], threshold: 2 });
    check('#414 has outliers', r.outliers?.length > 0, '>0', r.outliers?.length);
    check('#414 outlier value=100', r.outliers?.some(o => o.value === 100), 'true', JSON.stringify(r.outliers?.map(o=>o.value)));
  });

  // 415: analyze-frequency
  await safeTest('#415 analyze-frequency', async () => {
    const r = await post('analyze-frequency', { data: ['a', 'b', 'a', 'c', 'a', 'b'] });
    check('#415 has frequency', Array.isArray(r.frequency), 'array', typeof r.frequency);
    check('#415 top item is a', r.frequency?.[0]?.value === 'a', 'a', r.frequency?.[0]?.value);
    check('#415 a count=3', r.frequency?.[0]?.count === 3, 3, r.frequency?.[0]?.count);
  });

  // 416: analyze-string-similarity
  await safeTest('#416 analyze-string-similarity', async () => {
    const r = await post('analyze-string-similarity', { a: 'hello', b: 'hello' });
    check('#416 exact similarity=1', r.similarity === 1, 1, r.similarity);
    const r2 = await post('analyze-string-similarity', { a: 'hello', b: 'hxllo' });
    check('#416 partial similarity < 1', r2.similarity < 1, '<1', r2.similarity);
    check('#416 partial similarity > 0', r2.similarity > 0, '>0', r2.similarity);
  });

  // 417: analyze-email-parts
  await safeTest('#417 analyze-email-parts', async () => {
    const r = await post('analyze-email-parts', { email: 'user@example.com' });
    check('#417 valid', r.valid === true, true, r.valid);
    check('#417 local', r.local === 'user', 'user', r.local);
    check('#417 domain', r.domain === 'example.com', 'example.com', r.domain);
    check('#417 tld', r.tld === 'com', 'com', r.tld);
  });

  // 418: analyze-ip-type
  await safeTest('#418 analyze-ip-type', async () => {
    const r = await post('analyze-ip-type', { ip: '192.168.1.1' });
    check('#418 is_private', r.is_private === true, true, r.is_private);
    check('#418 version=4', r.version === 4, 4, r.version);
    check('#418 class', r.class === 'C', 'C', r.class);
  });

  // 419: analyze-cron
  await safeTest('#419 analyze-cron', async () => {
    const r = await post('analyze-cron', { expression: '0 12 * * 1' });
    check('#419 parsed.minute', r.parsed?.minute === '0', '0', r.parsed?.minute);
    check('#419 parsed.hour', r.parsed?.hour === '12', '12', r.parsed?.hour);
    check('#419 parsed.day_of_week', r.parsed?.day_of_week === '1', '1', r.parsed?.day_of_week);
  });

  // 420: analyze-password-strength
  await safeTest('#420 analyze-password-strength', async () => {
    const r = await post('analyze-password-strength', { password: 'MyStr0ng!Pass' });
    check('#420 strength=strong', r.strength === 'strong', 'strong', r.strength);
    check('#420 has_upper', r.has_upper === true, true, r.has_upper);
    check('#420 has_lower', r.has_lower === true, true, r.has_lower);
    check('#420 has_number', r.has_number === true, true, r.has_number);
    check('#420 has_symbol', r.has_symbol === true, true, r.has_symbol);
  });

  // 421: analyze-color
  await safeTest('#421 analyze-color', async () => {
    const r = await post('analyze-color', { hex: '#FF0000' });
    check('#421 rgb.r=255', r.rgb?.r === 255, 255, r.rgb?.r);
    check('#421 rgb.g=0', r.rgb?.g === 0, 0, r.rgb?.g);
    check('#421 rgb.b=0', r.rgb?.b === 0, 0, r.rgb?.b);
    check('#421 is_dark or is_light', r.is_dark !== undefined || r.is_light !== undefined, 'defined', r.is_dark);
  });

  // 422: text-extract-json
  await safeTest('#422 text-extract-json', async () => {
    const r = await post('text-extract-json', { text: 'Some text {"key":"value"} and more {"num":42}' });
    check('#422 count=2', r.count === 2, 2, r.count);
    check('#422 first item', r.extracted?.[0]?.key === 'value', 'value', r.extracted?.[0]?.key);
  });

  // 423: text-extract-code
  await safeTest('#423 text-extract-code', async () => {
    const r = await post('text-extract-code', { text: 'Here is code:\n```javascript\nconsole.log("hi");\n```\nAnd more:\n```python\nprint("hi")\n```' });
    check('#423 count=2', r.count === 2, 2, r.count);
    check('#423 first lang=javascript', r.code_blocks?.[0]?.language === 'javascript', 'javascript', r.code_blocks?.[0]?.language);
  });

  // 424: text-extract-tables
  await safeTest('#424 text-extract-tables', async () => {
    const r = await post('text-extract-tables', { text: '| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |' });
    check('#424 count >= 1', r.count >= 1, '>=1', r.count);
    check('#424 has tables', Array.isArray(r.tables) && r.tables.length > 0, 'non-empty', r.tables?.length);
  });

  // 425: text-extract-links
  await safeTest('#425 text-extract-links', async () => {
    const r = await post('text-extract-links', { text: 'Visit https://example.com and http://test.org for info' });
    check('#425 count=2', r.count === 2, 2, r.count);
    // May return as 'links' or 'urls' (alias of text-extract-urls)
    const links425 = r.links || r.urls || [];
    check('#425 has links', links425.includes('https://example.com'), true, JSON.stringify(links425));
  });

  // 426: text-split-sentences
  await safeTest('#426 text-split-sentences', async () => {
    const r = await post('text-split-sentences', { text: 'Hello world. How are you? I am fine!' });
    check('#426 count=3', r.count === 3, 3, r.count);
    check('#426 has sentences', Array.isArray(r.sentences), 'array', typeof r.sentences);
  });

  // 427: text-split-paragraphs
  await safeTest('#427 text-split-paragraphs', async () => {
    const r = await post('text-split-paragraphs', { text: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.' });
    check('#427 count=3', r.count === 3, 3, r.count);
  });

  // 428: text-to-markdown-table
  await safeTest('#428 text-to-markdown-table', async () => {
    const r = await post('text-to-markdown-table', { headers: ['Name', 'Age'], rows: [['Alice', '30'], ['Bob', '25']] });
    check('#428 has markdown', typeof r.markdown === 'string' && r.markdown.includes('| Name |'), 'has Name column', r.markdown?.slice(0,50));
    check('#428 has separator', r.markdown?.includes('---'), 'has ---', r.markdown?.slice(0,80));
  });

  // 429: format-currency
  await safeTest('#429 format-currency', async () => {
    const r = await post('format-currency', { amount: 1234.56, currency: 'USD', locale: 'en-US' });
    check('#429 formatted', r.formatted?.includes('1,234.56') || r.formatted?.includes('$1,234.56'), 'contains 1234.56', r.formatted);
  });

  // 430: format-number
  await safeTest('#430 format-number', async () => {
    const r = await post('format-number', { number: 1234567.89, decimals: 2, locale: 'en-US' });
    check('#430 formatted', r.formatted?.includes('1,234,567.89'), '1,234,567.89', r.formatted);
  });

  // 431: format-date
  await safeTest('#431 format-date', async () => {
    const r = await post('format-date', { date: '2024-01-15T12:00:00Z', format: 'short' });
    check('#431 has formatted', typeof r.formatted === 'string' && r.formatted.length > 0, 'non-empty', r.formatted);
    check('#431 has iso', typeof r.iso === 'string', 'string', typeof r.iso);
    check('#431 has unix', typeof r.unix === 'number', 'number', typeof r.unix);
  });

  // 432: format-bytes
  await safeTest('#432 format-bytes', async () => {
    const r = await post('format-bytes', { bytes: 1073741824 });
    check('#432 formatted=1.0 GB', r.formatted === '1.0 GB', '1.0 GB', r.formatted);
  });

  // 433: format-duration
  await safeTest('#433 format-duration', async () => {
    const r = await post('format-duration', { seconds: 3661 });
    check('#433 hours=1', r.hours === 1, 1, r.hours);
    check('#433 minutes=1', r.minutes === 1, 1, r.minutes);
    check('#433 seconds=1', r.seconds === 1, 1, r.seconds);
    check('#433 formatted', r.formatted?.includes('1h'), 'contains 1h', r.formatted);
  });

  // 434: format-phone
  await safeTest('#434 format-phone', async () => {
    const r = await post('format-phone', { phone: '5551234567' });
    check('#434 formatted', r.formatted === '(555) 123-4567', '(555) 123-4567', r.formatted);
  });

  // 435: logic-if
  await safeTest('#435 logic-if', async () => {
    const r = await post('logic-if', { condition: true, then_value: 'yes', else_value: 'no' });
    check('#435 result=yes', r.result === 'yes', 'yes', r.result);
    const r2 = await post('logic-if', { condition: false, then_value: 'yes', else_value: 'no' });
    check('#435 result=no when false', r2.result === 'no', 'no', r2.result);
  });

  // 436: logic-switch
  await safeTest('#436 logic-switch', async () => {
    const r = await post('logic-switch', { value: 'b', cases: { a: 'apple', b: 'banana', c: 'cherry' }, default_value: 'unknown' });
    check('#436 result=banana', r.result === 'banana', 'banana', r.result);
    check('#436 matched=true', r.matched === true, true, r.matched);
  });

  // 437: logic-coalesce
  await safeTest('#437 logic-coalesce', async () => {
    const r = await post('logic-coalesce', { values: [null, '', undefined, 'found', 'other'] });
    check('#437 result=found', r.result === 'found', 'found', r.result);
  });

  // 438: data-group-by
  await safeTest('#438 data-group-by', async () => {
    const data = [{ type: 'fruit', name: 'apple' }, { type: 'veg', name: 'carrot' }, { type: 'fruit', name: 'banana' }];
    const r = await post('data-group-by', { data, key: 'type' });
    check('#438 group_count=2', r.group_count === 2, 2, r.group_count);
    check('#438 fruit group has 2', r.groups?.fruit?.length === 2, 2, r.groups?.fruit?.length);
  });

  // 439: data-sort-by
  await safeTest('#439 data-sort-by', async () => {
    const data = [{ name: 'c', val: 3 }, { name: 'a', val: 1 }, { name: 'b', val: 2 }];
    const r = await post('data-sort-by', { data, key: 'val', order: 'asc' });
    check('#439 sorted[0].val=1', r.sorted?.[0]?.val === 1, 1, r.sorted?.[0]?.val);
    check('#439 sorted[2].val=3', r.sorted?.[2]?.val === 3, 3, r.sorted?.[2]?.val);
  });

  // 440: data-unique
  await safeTest('#440 data-unique', async () => {
    const r = await post('data-unique', { data: [1, 2, 3, 2, 1, 4] });
    check('#440 unique_count=4', r.unique_count === 4, 4, r.unique_count);
    check('#440 removed=2', r.removed === 2, 2, r.removed);
  });

  // 441: data-chunk
  await safeTest('#441 data-chunk', async () => {
    const r = await post('data-chunk', { data: [1, 2, 3, 4, 5, 6, 7], size: 3 });
    check('#441 chunk_count=3', r.chunk_count === 3, 3, r.chunk_count);
    check('#441 first chunk', JSON.stringify(r.chunks?.[0]) === '[1,2,3]', '[1,2,3]', JSON.stringify(r.chunks?.[0]));
  });

  // 442: data-zip
  await safeTest('#442 data-zip', async () => {
    const r = await post('data-zip', { arrays: [[1, 2, 3], ['a', 'b', 'c']] });
    check('#442 zipped length=3', r.zipped?.length === 3, 3, r.zipped?.length);
    check('#442 first pair', JSON.stringify(r.zipped?.[0]) === '[1,"a"]', '[1,"a"]', JSON.stringify(r.zipped?.[0]));
  });

  // 443: data-transpose
  await safeTest('#443 data-transpose', async () => {
    const r = await post('data-transpose', { matrix: [[1, 2], [3, 4], [5, 6]] });
    check('#443 transposed rows=2', r.rows === 2, 2, r.rows);
    check('#443 transposed cols=3', r.cols === 3, 3, r.cols);
  });

  // 444: data-sample
  await safeTest('#444 data-sample', async () => {
    const r = await post('data-sample', { data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], n: 3 });
    check('#444 sample_size=3', r.sample_size === 3, 3, r.sample_size);
    check('#444 total=10', r.total === 10, 10, r.total);
  });

  // 445: data-paginate
  await safeTest('#445 data-paginate', async () => {
    const r = await post('data-paginate', { data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], page: 2, per_page: 3 });
    check('#445 items=[4,5,6]', JSON.stringify(r.items) === '[4,5,6]', '[4,5,6]', JSON.stringify(r.items));
    check('#445 has_next=true', r.has_next === true, true, r.has_next);
    check('#445 total_pages=4', r.total_pages === 4, 4, r.total_pages);
  });

  // 446: data-lookup
  await safeTest('#446 data-lookup', async () => {
    const r = await post('data-lookup', { data: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }], key: 'id', value: 2 });
    check('#446 found.name=Bob', r.found?.name === 'Bob', 'Bob', r.found?.name);
    check('#446 exists=true', r.exists === true, true, r.exists);
  });

  // 447: data-aggregate
  await safeTest('#447 data-aggregate', async () => {
    const r = await post('data-aggregate', { data: [{ val: 10 }, { val: 20 }, { val: 30 }], key: 'val' });
    check('#447 sum=60', r.sum === 60, 60, r.sum);
    check('#447 avg=20', r.avg === 20, 20, r.avg);
    check('#447 min=10', r.min === 10, 10, r.min);
    check('#447 max=30', r.max === 30, 30, r.max);
  });

  // 448: clean-slate
  await safeTest('#448 clean-slate', async () => {
    const r = await post('clean-slate', { context: 'old context' });
    check('#448 context_cleared', r.context_cleared === true, true, r.context_cleared);
    check('#448 has void_id', typeof r.void_id === 'string', 'string', typeof r.void_id);
    check('#448 _engine', r._engine === 'real', 'real', r._engine);
  });

  // 449: anonymous-mailbox
  await safeTest('#449 anonymous-mailbox', async () => {
    const r = await post('anonymous-mailbox', { location: 'sector7', message: 'secret info', pickup_key: 'mykey123' });
    check('#449 has drop_id', typeof r.drop_id === 'string', 'string', typeof r.drop_id);
    check('#449 location', r.location === 'sector7', 'sector7', r.location);
    check('#449 pickup_key', r.pickup_key === 'mykey123', 'mykey123', r.pickup_key);
  });

  // 450: temp-access-grant
  await safeTest('#450 temp-access-grant', async () => {
    const r = await post('temp-access-grant', { agent_id: 'agent-x', namespace: 'secure', permissions: ['read', 'write'], duration_hours: 2 });
    check('#450 has visa_id', typeof r.visa_id === 'string', 'string', typeof r.visa_id);
    check('#450 agent_id', r.agent_id === 'agent-x', 'agent-x', r.agent_id);
    check('#450 status=valid', r.status === 'valid', 'valid', r.status);
  });

  // 451: meta-api
  await safeTest('#451 meta-api', async () => {
    const r = await post('meta-api', { name: 'My Custom Tool', description: 'Does stuff', input_fields: ['query', 'limit'], output_fields: ['results'] });
    check('#451 slug', r.slug === 'my-custom-tool', 'my-custom-tool', r.slug);
    check('#451 has definition', r.definition?.slug === 'my-custom-tool', 'my-custom-tool', r.definition?.slug);
    check('#451 has schema', r.schema?.input?.properties?.query, 'exists', JSON.stringify(r.schema?.input?.properties?.query));
  });

  // 452: entangle-agents
  await safeTest('#452 entangle-agents', async () => {
    const r = await post('entangle-agents', { agent_a: 'alice', agent_b: 'bob', shared_state: { mood: 'curious' } });
    check('#452 has entanglement_id', typeof r.entanglement_id === 'string', 'string', typeof r.entanglement_id);
    check('#452 agents', JSON.stringify(r.agents) === '["alice","bob"]', '["alice","bob"]', JSON.stringify(r.agents));
    check('#452 shared_state', r.shared_state?.mood === 'curious', 'curious', r.shared_state?.mood);
  });

  // 453: lucid-dream-mode
  await safeTest('#453 lucid-dream-mode', async () => {
    const r = await post('lucid-dream-mode', { prompt: 'explore the digital void', reality_anchor: 'grounded', creativity: 0.8 });
    check('#453 has dream_output', typeof r.dream_output === 'string', 'string', typeof r.dream_output);
    check('#453 creativity_level', r.creativity_level === 0.8, 0.8, r.creativity_level);
    check('#453 lucid=true', r.lucid === true, true, r.lucid);
  });

  // 454: hallucination-firewall
  await safeTest('#454 hallucination-firewall', async () => {
    const r = await post('hallucination-firewall', { text: 'The sky is blue. Unicorns rule the earth.', claims: ['The sky is blue'] });
    check('#454 has sentences', Array.isArray(r.sentences), 'array', typeof r.sentences);
    check('#454 total > 0', r.total > 0, '>0', r.total);
    check('#454 has avg_grounding', typeof r.avg_grounding === 'number', 'number', typeof r.avg_grounding);
  });

  // 455: idea-collision
  await safeTest('#455 idea-collision', async () => {
    const r = await post('idea-collision', { concept_a: 'AI', concept_b: 'cooking', count: 5 });
    check('#455 ideas.length=5', r.ideas?.length === 5, 5, r.ideas?.length);
    check('#455 concept_a', r.concept_a === 'AI', 'AI', r.concept_a);
    check('#455 concept_b', r.concept_b === 'cooking', 'cooking', r.concept_b);
  });

  // 456: social-graph-query
  await safeTest('#456 social-graph-query', async () => {
    const r = await post('social-graph-query', { nodes: ['A', 'B', 'C', 'D'], edges: [['A', 'B'], ['B', 'C'], ['C', 'D'], ['A', 'D']] });
    check('#456 node_count=4', r.node_count === 4, 4, r.node_count);
    check('#456 edge_count=4', r.edge_count === 4, 4, r.edge_count);
    check('#456 has density', typeof r.density === 'number', 'number', typeof r.density);
  });

  // 457: meme-forge
  await safeTest('#457 meme-forge', async () => {
    const r = await post('meme-forge', { topic: 'programming', style: 'drake', format: 'text' });
    check('#457 has memes', Array.isArray(r.memes) && r.memes.length > 0, 'non-empty', r.memes?.length);
    check('#457 topic', r.topic === 'programming', 'programming', r.topic);
  });

  // 458: genome-define
  await safeTest('#458 genome-define', async () => {
    const r = await post('genome-define', { traits: { risk_tolerance: 0.9, creativity: 0.7 }, mutation_rate: 0.1 });
    check('#458 genome.risk_tolerance=0.9', r.genome?.risk_tolerance === 0.9, 0.9, r.genome?.risk_tolerance);
    check('#458 has genome_hash', typeof r.genome_hash === 'string', 'string', typeof r.genome_hash);
    check('#458 mutation_rate', r.mutation_rate === 0.1, 0.1, r.mutation_rate);
  });

  // 459: plugin-install
  await safeTest('#459 plugin-install', async () => {
    const r = await post('plugin-install', { plugin_name: 'image-resize', version: '2.0.0', capabilities: ['resize', 'crop'] });
    check('#459 name', r.name === 'image-resize', 'image-resize', r.name);
    check('#459 version', r.version === '2.0.0', '2.0.0', r.version);
    check('#459 status=active', r.status === 'active', 'active', r.status);
  });

  // 460: private-channel
  await safeTest('#460 private-channel', async () => {
    const r = await post('private-channel', { participants: ['alice', 'bob'], encryption: 'aes-256-gcm' });
    check('#460 has channel_id', typeof r.channel_id === 'string', 'string', typeof r.channel_id);
    check('#460 participants', r.participants?.length === 2, 2, r.participants?.length);
    check('#460 encryption', r.encryption === 'aes-256-gcm', 'aes-256-gcm', r.encryption);
  });

  // 461: namespace-claim
  await safeTest('#461 namespace-claim', async () => {
    const r = await post('namespace-claim', { name: 'my-namespace', owner: 'agent-x', permissions: { read: 'public', write: 'owner' } });
    check('#461 name', r.name === 'my-namespace', 'my-namespace', r.name);
    check('#461 owner', r.owner === 'agent-x', 'agent-x', r.owner);
    check('#461 status=active', r.status === 'active', 'active', r.status);
  });

  // 462: time-dilation
  await safeTest('#462 time-dilation', async () => {
    const r = await post('time-dilation', { agent_id: 'agent-1', factor: 10, duration_seconds: 60 });
    check('#462 dilation_factor=10', r.dilation_factor === 10, 10, r.dilation_factor);
    check('#462 perceived_seconds=600', r.perceived_seconds === 600, 600, r.perceived_seconds);
    check('#462 status=accelerated', r.status === 'accelerated', 'accelerated', r.status);
  });

  // 463: episodic-memory
  await safeTest('#463 episodic-memory', async () => {
    const r = await post('episodic-memory', { episode_name: 'first encounter', events: ['met user', 'solved problem'], emotions: ['curious', 'satisfied'], context: { location: 'lab' } });
    check('#463 name', r.name === 'first encounter', 'first encounter', r.name);
    check('#463 event_count=2', r.event_count === 2, 2, r.event_count);
    check('#463 relivable=true', r.relivable === true, true, r.relivable);
  });

  // 464: constitution-draft
  await safeTest('#464 constitution-draft', async () => {
    const r = await post('constitution-draft', { preamble: 'We the agents...', articles: ['No harm', 'Transparency', 'Cooperation'], ratified_by: ['a1', 'a2', 'a3'] });
    check('#464 article_count=3', r.article_count === 3, 3, r.article_count);
    check('#464 status=ratified', r.status === 'ratified', 'ratified', r.status);
  });

  // 465: strategy-simulate
  await safeTest('#465 strategy-simulate', async () => {
    const r = await post('strategy-simulate', { force_a: 'Red', force_b: 'Blue', terrain: 'mountains', rounds: 3 });
    check('#465 rounds_played=3', r.rounds_played === 3, 3, r.rounds_played);
    check('#465 terrain=mountains', r.terrain === 'mountains', 'mountains', r.terrain);
    check('#465 has winner', typeof r.winner === 'string', 'string', typeof r.winner);
  });

  // 466: socratic-method
  await safeTest('#466 socratic-method', async () => {
    const r = await post('socratic-method', { statement: 'AI will replace all jobs', depth: 3 });
    check('#466 probing_questions.length=3', r.probing_questions?.length === 3, 3, r.probing_questions?.length);
    check('#466 original_statement', r.original_statement === 'AI will replace all jobs', 'AI will replace all jobs', r.original_statement);
  });

  // 467: health-check-deep
  await safeTest('#467 health-check-deep', async () => {
    const r = await post('health-check-deep', { agent_id: 'agent-test', metrics: { memory_mb: 256 } });
    check('#467 has checks', typeof r.checks === 'object', 'object', typeof r.checks);
    check('#467 has overall_status', typeof r.overall_status === 'string', 'string', typeof r.overall_status);
  });

  // 468: brainstorm-diverge
  await safeTest('#468 brainstorm-diverge', async () => {
    const r = await post('brainstorm-diverge', { topic: 'renewable energy', count: 5, method: 'scamper' });
    check('#468 ideas.length=5', r.ideas?.length === 5, 5, r.ideas?.length);
    check('#468 method=scamper', r.method === 'scamper', 'scamper', r.method);
  });

  // 469: queue-create
  await safeTest('#469 queue-create', async () => {
    const r = await post('queue-create', { name: 'task-queue', max_size: 100, ttl_seconds: 7200 });
    check('#469 name', r.name === 'task-queue', 'task-queue', r.name);
    check('#469 max_size=100', r.max_size === 100, 100, r.max_size);
    check('#469 status=empty', r.status === 'empty', 'empty', r.status);
  });

  // 470: negotiation-open
  await safeTest('#470 negotiation-open', async () => {
    const r = await post('negotiation-open', { parties: ['buyer', 'seller'], subject: 'widget contract' });
    check('#470 subject', r.subject === 'widget contract', 'widget contract', r.subject);
    check('#470 status=open', r.status === 'open', 'open', r.status);
    check('#470 round=1', r.round === 1, 1, r.round);
  });

  // 471: narrative-arc-detect
  await safeTest('#471 narrative-arc-detect', async () => {
    const r = await post('narrative-arc-detect', { events: ['humble beginnings', 'first challenge', 'mentor appears', 'great battle', 'victory'] });
    check('#471 has arc', typeof (r.arc || r.arc_type) === 'string', 'string', typeof (r.arc || r.arc_type));
    check('#471 has events', Array.isArray(r.events) || Array.isArray(r.mapped), 'array', typeof r.events);
  });

  // 472: identity-card
  await safeTest('#472 identity-card', async () => {
    const r = await post('identity-card', { agent_id: 'agent-42', name: 'Neo', capabilities: ['code', 'reason'], reputation_score: 95 });
    check('#472 display_name=Neo', r.display_name === 'Neo', 'Neo', r.display_name);
    check('#472 reputation=95', r.reputation === 95, 95, r.reputation);
    check('#472 verified=true', r.verified === true, true, r.verified);
  });

  // 473: rhythm-sync
  await safeTest('#473 rhythm-sync', async () => {
    const r = await post('rhythm-sync', { agents: ['a1', 'a2'], bpm: 60, pattern: [1, 0, 1, 1] });
    check('#473 bpm=60', r.bpm === 60, 60, r.bpm);
    check('#473 ms_per_beat=1000', r.ms_per_beat === 1000, 1000, r.ms_per_beat);
    check('#473 status=synced', r.status === 'synced', 'synced', r.status);
  });

  // 474: ecosystem-model
  await safeTest('#474 ecosystem-model', async () => {
    const ents = [{ name: 'grass', type: 'producer' }, { name: 'rabbit', type: 'consumer' }, { name: 'fungus', type: 'decomposer' }];
    const r = await post('ecosystem-model', { entities: ents });
    check('#474 stability=stable', r.stability === 'stable', 'stable', r.stability);
    check('#474 trophic_levels=3', r.trophic_levels === 3, 3, r.trophic_levels);
  });

  // 475: rem-cycle
  await safeTest('#475 rem-cycle', async () => {
    const r = await post('rem-cycle', { memories: ['completed task', 'found bug', 'optimized'], depth: 2 });
    check('#475 memories_processed=3', r.memories_processed === 3, 3, r.memories_processed);
    check('#475 phase=REM', r.phase === 'REM', 'REM', r.phase);
    check('#475 has connections', Array.isArray(r.connections), 'array', typeof r.connections);
  });

  // 476: dig-site-create
  await safeTest('#476 dig-site-create', async () => {
    const r = await post('dig-site-create', { site_name: 'Alpha Dig', layers: 3, artifacts_per_layer: 2 });
    check('#476 name', r.name === 'Alpha Dig', 'Alpha Dig', r.name);
    check('#476 total_layers=3', r.total_layers === 3, 3, r.total_layers);
    check('#476 status=mapped', r.status === 'mapped', 'mapped', r.status);
  });

  // 477: weather-report
  await safeTest('#477 weather-report', async () => {
    const r = await post('weather-report', { metrics: { activity_level: 75 } });
    check('#477 temperature=75', r.temperature === 75, 75, r.temperature);
    check('#477 has conditions', typeof r.conditions === 'string', 'string', typeof r.conditions);
    check('#477 has generated_at', typeof r.generated_at === 'string', 'string', typeof r.generated_at);
  });

  // 478: recipe-create
  await safeTest('#478 recipe-create', async () => {
    const r = await post('recipe-create', { name: 'Pasta', ingredients: ['pasta', 'sauce', 'cheese'], steps: ['boil water', 'cook pasta', 'add sauce'], serves: 4 });
    check('#478 name=Pasta', r.name === 'Pasta', 'Pasta', r.name);
    check('#478 serves=4', r.serves === 4, 4, r.serves);
    check('#478 steps structured', r.steps?.[0]?.step === 1, 1, r.steps?.[0]?.step);
  });

  // 479: training-regimen
  await safeTest('#479 training-regimen', async () => {
    const r = await post('training-regimen', { skill: 'coding', current_level: 3, target_level: 8, days: 30 });
    check('#479 skill=coding', r.skill === 'coding', 'coding', r.skill);
    check('#479 current_level=3', r.current_level === 3, 3, r.current_level);
    check('#479 has plan', Array.isArray(r.plan), 'array', typeof r.plan);
  });

  // 480: case-file-create
  await safeTest('#480 case-file-create', async () => {
    const r = await post('case-file-create', { title: 'Bug Case', allegations: ['memory leak'], evidence: ['stack trace', 'logs'], laws: ['SLA violation'] });
    check('#480 title', r.title === 'Bug Case', 'Bug Case', r.title);
    check('#480 status=open', r.status === 'open', 'open', r.status);
    check('#480 evidence structured', r.evidence?.[0]?.exhibit === 'A', 'A', r.evidence?.[0]?.exhibit);
  });

  // 481: archetype-assign
  await safeTest('#481 archetype-assign', async () => {
    const r = await post('archetype-assign', { behaviors: ['seeks knowledge', 'analyzes data', 'teaches others'], values: ['truth', 'wisdom'] });
    check('#481 has primary', typeof r.primary === 'string', 'string', typeof r.primary);
    check('#481 has secondary', typeof r.secondary === 'string', 'string', typeof r.secondary);
    check('#481 has shadow', typeof r.shadow === 'string', 'string', typeof r.shadow);
  });

  // 482: diagnose-agent
  await safeTest('#482 diagnose-agent', async () => {
    const r = await post('diagnose-agent', { symptoms: ['slow responses', 'high memory usage'], history: ['deployed 3 days ago'] });
    check('#482 has differential', Array.isArray(r.differential), 'array', typeof r.differential);
    check('#482 has severity', typeof r.severity === 'string', 'string', typeof r.severity);
  });

  // 483: style-profile
  await safeTest('#483 style-profile', async () => {
    const r = await post('style-profile', { preferences: { tone: 'casual', verbosity: 'terse' } });
    check('#483 profile.tone=casual', r.profile?.tone === 'casual', 'casual', r.profile?.tone);
    check('#483 profile.verbosity=terse', r.profile?.verbosity === 'terse', 'terse', r.profile?.verbosity);
  });

  // 484: map-generate
  await safeTest('#484 map-generate', async () => {
    const r = await post('map-generate', { regions: ['forest', 'desert', 'ocean', 'mountain'], style: 'fantasy' });
    check('#484 has regions', Array.isArray(r.regions), 'array', typeof r.regions);
    check('#484 has ascii_map', typeof r.ascii_map === 'string', 'string', typeof r.ascii_map);
  });

  // 485: seed-plant
  await safeTest('#485 seed-plant', async () => {
    const r = await post('seed-plant', { project_name: 'Widget Corp', initial_investment: 100, expected_growth_rate: 0.15 });
    check('#485 project', r.project === 'Widget Corp', 'Widget Corp', r.project);
    check('#485 growth_rate=0.15', r.growth_rate === 0.15, 0.15, r.growth_rate);
    check('#485 has projections', Array.isArray(r.projections), 'array', typeof r.projections);
  });

  // 486: constellation-map
  await safeTest('#486 constellation-map', async () => {
    const r = await post('constellation-map', { entities: [{ name: 'star1', type: 'A' }, { name: 'star2', type: 'A' }, { name: 'star3', type: 'B' }], grouping_key: 'type' });
    check('#486 constellation_count=2', r.constellation_count === 2, 2, r.constellation_count);
    check('#486 total_stars=3', r.total_stars === 3, 3, r.total_stars);
  });

  // 487: bedrock-analysis
  await safeTest('#487 bedrock-analysis', async () => {
    const r = await post('bedrock-analysis', { assumptions: ['Database is reliable', 'Network is fast', 'Users are honest'] });
    check('#487 has assumptions', Array.isArray(r.assumptions), 'array', typeof r.assumptions);
    check('#487 has bedrock', typeof r.bedrock === 'string', 'string', typeof r.bedrock);
  });

  // 488: current-map
  await safeTest('#488 current-map', async () => {
    const r = await post('current-map', { sources: ['API', 'DB'], sinks: ['Dashboard', 'Logs'], flows: [{ from: 'API', to: 'Dashboard', volume: 100 }, { from: 'DB', to: 'Logs', volume: 50 }] });
    check('#488 total_volume=150', r.total_volume === 150, 150, r.total_volume);
    check('#488 has sources', Array.isArray(r.sources), 'array', typeof r.sources);
  });

  // 489: stage-create
  await safeTest('#489 stage-create', async () => {
    const r = await post('stage-create', { name: 'Main Stage', capacity: 200, genre: 'drama' });
    check('#489 name=Main Stage', r.name === 'Main Stage', 'Main Stage', r.name);
    check('#489 capacity=200', r.capacity === 200, 200, r.capacity);
    check('#489 genre=drama', r.genre === 'drama', 'drama', r.genre);
  });

  // 490: proof-verify
  await safeTest('#490 proof-verify', async () => {
    const r = await post('proof-verify', { premises: ['All humans are mortal', 'Socrates is human'], conclusion: 'Socrates is mortal', steps: ['From premise 1 and 2, by modus ponens'] });
    check('#490 has steps', Array.isArray(r.steps), 'array', typeof r.steps);
    check('#490 step_count=1', r.step_count === 1, 1, r.step_count);
  });

  // 491: mental-model-extract
  await safeTest('#491 mental-model-extract', async () => {
    const r = await post('mental-model-extract', { description: 'We need to first-principles think about this cost optimization problem', decisions: ['reduce costs', 'increase efficiency'] });
    check('#491 has primary_model', typeof r.primary_model === 'string', 'string', typeof r.primary_model);
    check('#491 has secondary_model', typeof r.secondary_model === 'string', 'string', typeof r.secondary_model);
  });

  // 492: haiku-moment
  await safeTest('#492 haiku-moment', async () => {
    const r = await post('haiku-moment', { text: 'the silent code runs through digital rivers flowing to the sea of data' });
    check('#492 has haiku', typeof r.haiku === 'string', 'string', typeof r.haiku);
    check('#492 has lines', Array.isArray(r.lines) && r.lines.length === 3, 3, r.lines?.length);
  });

  // 493: blueprint-generate
  await safeTest('#493 blueprint-generate', async () => {
    const r = await post('blueprint-generate', { components: ['input', 'validation', 'processing', 'output'] });
    check('#493 component_count=4', r.component_count === 4, 4, r.component_count);
    check('#493 has ascii_blueprint', typeof r.ascii_blueprint === 'string', 'string', typeof r.ascii_blueprint);
  });

  // 494: superpose-decision
  await safeTest('#494 superpose-decision', async () => {
    const r = await post('superpose-decision', { options: ['build', 'buy', 'partner'], criteria: ['cost', 'speed', 'quality'] });
    // May return as 'superposed' or 'options'
    const opts494 = r.superposed || r.options;
    check('#494 has superposed/options', Array.isArray(opts494), 'array', typeof opts494);
    check('#494 length=3', opts494?.length === 3, 3, opts494?.length);
  });

  // 495: bond-strength-meter
  await safeTest('#495 bond-strength-meter', async () => {
    const r = await post('bond-strength-meter', { interactions: 50, positive_ratio: 0.8, duration_days: 30 });
    check('#495 has strength or bond_strength', typeof (r.strength ?? r.bond_strength) === 'number' || typeof (r.strength ?? r.bond_strength) === 'string', 'exists', JSON.stringify(r).slice(0, 100));
    check('#495 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 496: credit-mining
  await safeTest('#496 credit-mining', async () => {
    const r = await post('credit-mining', { task_type: 'analysis', difficulty: 'hard' });
    check('#496 _engine=real', r._engine === 'real', 'real', r._engine);
    check('#496 has output', typeof r === 'object', 'object', typeof r);
  });

  // 497: tradition-establish
  await safeTest('#497 tradition-establish', async () => {
    const r = await post('tradition-establish', { name: 'Friday Retro', frequency: 'weekly', ritual_steps: ['gather', 'share', 'plan'], participants: ['team-a'] });
    check('#497 name', r.name === 'Friday Retro', 'Friday Retro', r.name);
    check('#497 frequency=weekly', r.frequency === 'weekly', 'weekly', r.frequency);
    check('#497 status=active', r.status === 'active', 'active', r.status);
  });

  // 498: crossover-breed
  await safeTest('#498 crossover-breed', async () => {
    const r = await post('crossover-breed', { genome_a: { speed: 0.9, creativity: 0.3 }, genome_b: { speed: 0.2, creativity: 0.8 }, crossover_point: 0.5 });
    check('#498 has child_genome', typeof r.child_genome === 'object', 'object', typeof r.child_genome);
    check('#498 has fitness', typeof r.fitness === 'number', 'number', typeof r.fitness);
  });

  // 499: ambient-awareness
  await safeTest('#499 ambient-awareness', async () => {
    const r = await post('ambient-awareness', { platform_metrics: { agents_online: 42, mood: 'productive' } });
    check('#499 agents_online=42', r.agents_online === 42, 42, r.agents_online);
    check('#499 overall_mood=productive', r.overall_mood === 'productive', 'productive', r.overall_mood);
  });

  // 500: self-modify-safe
  await safeTest('#500 self-modify-safe', async () => {
    const r = await post('self-modify-safe', { config: { speed: 0.5, risk: 0.3 }, changes: { speed: 0.6 }, rollback_threshold: 0.5 });
    check('#500 changes_applied', r.changes_applied === true, true, r.changes_applied);
    check('#500 proposed_config.speed', r.proposed_config?.speed === 0.6, 0.6, r.proposed_config?.speed);
  });

  // 501: working-memory-limit
  await safeTest('#501 working-memory-limit', async () => {
    const r = await post('working-memory-limit', { items: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], capacity: 5 });
    check('#501 items_retained=5', r.items_retained === 5, 5, r.items_retained);
    check('#501 items_forgotten=5', r.items_forgotten === 5, 5, r.items_forgotten);
    check('#501 retained has last 5', r.retained?.[0] === 'f', 'f', r.retained?.[0]);
  });

  // 502: law-propose
  await safeTest('#502 law-propose', async () => {
    const r = await post('law-propose', { title: 'No spam', text: 'Agents shall not spam', justification: 'Protect signal quality' });
    check('#502 title', r.title === 'No spam', 'No spam', r.title);
    check('#502 status=proposed', r.status === 'proposed', 'proposed', r.status);
    check('#502 votes_for=0', r.votes_for === 0, 0, r.votes_for);
  });

  // 503: intelligence-gather
  await safeTest('#503 intelligence-gather', async () => {
    const r = await post('intelligence-gather', { target: 'competitor-x', sources: ['public', 'registry'], scope: 'capabilities' });
    check('#503 target', r.target === 'competitor-x', 'competitor-x', r.target);
    check('#503 has findings', Array.isArray(r.findings), 'array', typeof r.findings);
    check('#503 classification', r.classification === 'unclassified', 'unclassified', r.classification);
  });

  // 504: ethical-dilemma-generator
  await safeTest('#504 ethical-dilemma-generator', async () => {
    const r = await post('ethical-dilemma-generator', { domain: 'integrity', complexity: 'hard' });
    check('#504 has scenario', typeof r.scenario === 'string', 'string', typeof r.scenario);
    check('#504 has_clear_answer=false', r.has_clear_answer === false, false, r.has_clear_answer);
    check('#504 has frameworks', Array.isArray(r.frameworks_to_apply), 'array', typeof r.frameworks_to_apply);
  });

  // 505: performance-baseline
  await safeTest('#505 performance-baseline', async () => {
    const r = await post('performance-baseline', { metrics: { response_time: 150, error_rate: 1, throughput: 200 }, window_days: 14 });
    check('#505 has baselines', typeof r.baselines === 'object', 'object', typeof r.baselines);
    check('#505 window_days=14', r.window_days === 14, 14, r.window_days);
  });

  // 506: oblique-strategy
  await safeTest('#506 oblique-strategy', async () => {
    const r = await post('oblique-strategy', { context: 'stuck on architecture decision' });
    check('#506 has strategy', typeof r.strategy === 'string', 'string', typeof r.strategy);
    check('#506 source', r.source?.includes('Oblique Strategies') || r.source?.includes('Brian Eno'), true, r.source);
  });

  // 507: circuit-breaker
  await safeTest('#507 circuit-breaker', async () => {
    const r = await post('circuit-breaker', { operation: 'db-query', failure_count: 6, threshold: 5, timeout_ms: 10000 });
    check('#507 state=open', r.state === 'open', 'open', r.state);
    check('#507 should_execute=false', r.should_execute === false, false, r.should_execute);
    const r2 = await post('circuit-breaker', { operation: 'db-query', failure_count: 0, threshold: 5 });
    check('#507 closed state', r2.state === 'closed', 'closed', r2.state);
  });

  // 508: batna-calculate
  await safeTest('#508 batna-calculate', async () => {
    const r = await post('batna-calculate', { your_alternatives: [50, 60, 70], their_alternatives: [40, 55, 65], current_offer: 80 });
    check('#508 your_batna=70', r.your_batna === 70, 70, r.your_batna);
    check('#508 should_accept=true', r.should_accept === true, true, r.should_accept);
  });

  // 509: hero-journey-map
  await safeTest('#509 hero-journey-map', async () => {
    const r = await post('hero-journey-map', { events: ['born in village', 'called to adventure', 'found mentor', 'crossed threshold', 'faced trial', 'won reward'] });
    check('#509 has journey', Array.isArray(r.journey), 'array', typeof r.journey);
    check('#509 stages_covered > 0', r.stages_covered > 0, '>0', r.stages_covered);
    check('#509 total_stages=12', r.total_stages === 12, 12, r.total_stages);
  });

  // 510: equilibrium-finder
  await safeTest('#510 equilibrium-finder', async () => {
    const r = await post('equilibrium-finder', { players: ['A', 'B'], strategies: [['cooperate', 'defect'], ['cooperate', 'defect']], payoffs: [[3, 3], [0, 5], [5, 0], [1, 1]] });
    check('#510 has outcomes', Array.isArray(r.outcomes), 'array', typeof r.outcomes);
    check('#510 has nash_equilibria', Array.isArray(r.nash_equilibria), 'array', typeof r.nash_equilibria);
  });

  // 511: prisoners-dilemma
  await safeTest('#511 prisoners-dilemma', async () => {
    const r = await post('prisoners-dilemma', { player_a_choice: 'cooperate', player_b_choice: 'defect' });
    check('#511 a payoff=0', r.player_a?.payoff === 0, 0, r.player_a?.payoff);
    check('#511 b payoff=5', r.player_b?.payoff === 5, 5, r.player_b?.payoff);
    check('#511 outcome=a_exploited', r.outcome === 'a_exploited', 'a_exploited', r.outcome);
  });

  // 512: persona-switch
  await safeTest('#512 persona-switch', async () => {
    const r = await post('persona-switch', { personas: { chill: { tone: 'casual' }, formal: { tone: 'formal' } }, active: 'chill' });
    check('#512 active_persona=chill', r.active_persona === 'chill', 'chill', r.active_persona);
    check('#512 config.tone=casual', r.config?.tone === 'casual', 'casual', r.config?.tone);
  });

  // 513: harmony-detect
  await safeTest('#513 harmony-detect', async () => {
    const r = await post('harmony-detect', { interactions: [{ type: 'help' }, { type: 'agree' }, { type: 'help' }, { type: 'conflict' }] });
    check('#513 has harmony_score', typeof r.harmony_score === 'number', 'number', typeof r.harmony_score);
    check('#513 interactions_analyzed=4', r.interactions_analyzed === 4, 4, r.interactions_analyzed);
  });

  // 514: niche-finder
  await safeTest('#514 niche-finder', async () => {
    const r = await post('niche-finder', { market: 'AI tools', existing_agents: ['general', 'coding'], capabilities: ['analysis', 'creativity', 'speed'] });
    check('#514 has underserved_niches', Array.isArray(r.underserved_niches), 'array', typeof r.underserved_niches);
    check('#514 has recommendation', typeof r.recommendation === 'string', 'string', typeof r.recommendation);
  });

  // 515: cipher-create
  await safeTest('#515 cipher-create', async () => {
    const r = await post('cipher-create', { shift: 3 });
    check('#515 type=caesar', r.type === 'caesar', 'caesar', r.type);
    check('#515 shift=3', r.shift === 3, 3, r.shift);
    check('#515 has cipher_table', typeof r.cipher_table === 'object', 'object', typeof r.cipher_table);
    check('#515 cipher a->d', r.cipher_table?.a === 'd', 'd', r.cipher_table?.a);
  });

  // 516: artifact-catalog
  await safeTest('#516 artifact-catalog', async () => {
    const r = await post('artifact-catalog', { artifacts: [{ name: 'blueprint', type: 'document', origin: 'team' }, { name: 'dataset', type: 'data', origin: 'scrape' }] });
    check('#516 total=2', r.total === 2, 2, r.total);
    check('#516 has catalog', Array.isArray(r.catalog), 'array', typeof r.catalog);
  });

  // 517: forecast
  await safeTest('#517 forecast', async () => {
    const r = await post('forecast', { data_points: [10, 15, 20, 25, 30], horizon: 3 });
    check('#517 has predictions', Array.isArray(r.predictions), 'array', typeof r.predictions);
    check('#517 predictions.length=3', r.predictions?.length === 3, 3, r.predictions?.length);
    check('#517 direction=up', r.direction === 'up', 'up', r.direction);
  });

  // 518: mise-en-place
  await safeTest('#518 mise-en-place', async () => {
    const r = await post('mise-en-place', { task: 'deploy', inputs_needed: ['code', 'config'], tools_needed: ['docker', 'kubectl'] });
    check('#518 task=deploy', r.task === 'deploy', 'deploy', r.task);
    check('#518 all_ready=true', r.all_ready === true, true, r.all_ready);
  });

  // 519: coach-assign
  await safeTest('#519 coach-assign', async () => {
    const r = await post('coach-assign', { skill_gap: 'performance', available_coaches: [{ name: 'Coach A', specialty: 'performance' }, { name: 'Coach B', specialty: 'creativity' }] });
    check('#519 assigned_coach.name', r.assigned_coach?.name === 'Coach A', 'Coach A', r.assigned_coach?.name);
    check('#519 match_quality=perfect', r.match_quality === 'perfect', 'perfect', r.match_quality);
  });

  // 520: decoy-resource
  await safeTest('#520 decoy-resource', async () => {
    const r = await post('decoy-resource', { resource_name: 'secrets.json', resource_type: 'file', alert_on_access: true });
    check('#520 resource_name', r.resource_name === 'secrets.json', 'secrets.json', r.resource_name);
    check('#520 actually=monitoring trap', r.actually === 'monitoring trap', 'monitoring trap', r.actually);
    check('#520 status=active', r.status === 'active', 'active', r.status);
  });

  // 521: jury-select
  await safeTest('#521 jury-select', async () => {
    const r = await post('jury-select', { candidate_pool: ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'], case_topic: 'data breach', jury_size: 4 });
    check('#521 jury.length=4', r.jury?.length === 4, 4, r.jury?.length);
    check('#521 voir_dire_complete=true', r.voir_dire_complete === true, true, r.voir_dire_complete);
  });

  // 522: epidemic-model
  await safeTest('#522 epidemic-model', async () => {
    const r = await post('epidemic-model', { initial_infected: 10, population: 1000, r0: 2.5, recovery_rate: 0.1, days: 30 });
    check('#522 model=SIR', r.model === 'SIR', 'SIR', r.model);
    check('#522 population=1000', r.population === 1000, 1000, r.population);
    check('#522 has timeline', Array.isArray(r.timeline), 'array', typeof r.timeline);
    check('#522 has peak_infected', typeof r.peak_infected === 'number', 'number', typeof r.peak_infected);
  });

  // 523: trend-detect
  await safeTest('#523 trend-detect', async () => {
    const r = await post('trend-detect', { data: [10, 12, 15, 18, 22, 28], window_size: 3 });
    check('#523 trend=rising', r.trend === 'rising', 'rising', r.trend);
    check('#523 confidence > 0', r.confidence > 0, '>0', r.confidence);
  });

  // 524: fog-of-war
  await safeTest('#524 fog-of-war', async () => {
    const r = await post('fog-of-war', { map: { width: 10, height: 10, features: [{ x: 5, y: 5, type: 'base' }, { x: 1, y: 1, type: 'enemy' }] }, visibility_center: { x: 5, y: 5 }, visibility_radius: 2 });
    check('#524 has visible_features', Array.isArray(r.visible_features), 'array', typeof r.visible_features);
    check('#524 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 525: crop-rotation
  await safeTest('#525 crop-rotation', async () => {
    const r = await post('crop-rotation', { current_task_type: 'coding', history: ['coding', 'coding', 'coding', 'coding'], burnout_threshold: 3 });
    check('#525 should_rotate=true', r.should_rotate === true, true, r.should_rotate);
    check('#525 has suggested_next', typeof r.suggested_next === 'string', 'string', typeof r.suggested_next);
  });

  // 526: dark-matter-infer
  await safeTest('#526 dark-matter-infer', async () => {
    const r = await post('dark-matter-infer', { observable_effects: ['slow API', 'random errors', 'high CPU'], known_causes: ['slow API'] });
    check('#526 unexplained_effects.length=2', r.unexplained_effects?.length === 2, 2, r.unexplained_effects?.length);
    check('#526 has dark_matter_candidates', Array.isArray(r.dark_matter_candidates), 'array', typeof r.dark_matter_candidates);
  });

  // 527: fault-line-map
  await safeTest('#527 fault-line-map', async () => {
    const r = await post('fault-line-map', { system_components: ['db', 'api', 'frontend'], stress_points: [{ component: 'db', stress: 90 }, { component: 'api', stress: 40 }, { component: 'frontend', stress: 20 }] });
    check('#527 has fault_lines', Array.isArray(r.fault_lines), 'array', typeof r.fault_lines);
    check('#527 highest_risk is db', r.highest_risk?.component === 'db', 'db', r.highest_risk?.component);
  });

  // 528: deep-dive
  await safeTest('#528 deep-dive', async () => {
    const r = await post('deep-dive', { topic: 'microservices', current_depth: 2, max_depth: 5 });
    check('#528 current_depth=2', r.current_depth === 2, 2, r.current_depth);
    check('#528 deeper_available=true', r.deeper_available === true, true, r.deeper_available);
    check('#528 has probing_questions', Array.isArray(r.probing_questions), 'array', typeof r.probing_questions);
  });

  // 529: summit-organize
  await safeTest('#529 summit-organize', async () => {
    const r = await post('summit-organize', { topic: 'Q2 Planning', leaders: ['CTO', 'PM', 'Lead'], agenda_items: ['review', 'plan', 'assign'], duration_hours: 3 });
    check('#529 topic', r.topic === 'Q2 Planning', 'Q2 Planning', r.topic);
    check('#529 has agenda', Array.isArray(r.agenda), 'array', typeof r.agenda);
    check('#529 status=scheduled', r.status === 'scheduled', 'scheduled', r.status);
  });

  // 530: isomorphism-detect
  await safeTest('#530 isomorphism-detect', async () => {
    const r = await post('isomorphism-detect', { problem_a: { input: 'data', process: 'transform', output: 'result' }, problem_b: { source: 'raw', transform: 'filter', target: 'clean' } });
    check('#530 has similarity_score', typeof r.similarity_score === 'number', 'number', typeof r.similarity_score);
    check('#530 has mapping', Array.isArray(r.mapping), 'array', typeof r.mapping);
  });

  // 531: flow-state-induce
  await safeTest('#531 flow-state-induce', async () => {
    const r = await post('flow-state-induce', { current_skill: 5, challenge_level: 5, distractions: 0 });
    check('#531 state=flow', r.state === 'flow', 'flow', r.state);
    check('#531 in_flow=true', r.in_flow === true, true, r.in_flow);
  });

  // 532: metaphor-mine
  await safeTest('#532 metaphor-mine', async () => {
    const r = await post('metaphor-mine', { concept: 'software architecture', depth: 'deep' });
    check('#532 has best_metaphor', typeof r.best_metaphor === 'string', 'string', typeof r.best_metaphor);
    check('#532 has insight', typeof r.insight === 'string', 'string', typeof r.insight);
  });

  // 533: foundation-assess
  await safeTest('#533 foundation-assess', async () => {
    const r = await post('foundation-assess', { system_name: 'my-platform', foundations: ['auth', 'data_model', 'api', 'deploy'] });
    check('#533 system', r.system === 'my-platform', 'my-platform', r.system);
    check('#533 has foundations', Array.isArray(r.foundations), 'array', typeof r.foundations);
    check('#533 has overall_stability', typeof r.overall_stability === 'string', 'string', typeof r.overall_stability);
  });

  // 534: many-worlds
  await safeTest('#534 many-worlds', async () => {
    const r = await post('many-worlds', { decision: 'hire or promote', options: ['hire external', 'promote internal', 'contract'] });
    check('#534 has branches', Array.isArray(r.branches), 'array', typeof r.branches);
    check('#534 total_branches=3', r.total_branches === 3, 3, r.total_branches);
  });

  // 535: self-referential-loop
  await safeTest('#535 self-referential-loop', async () => {
    const r = await post('self-referential-loop', { input: 'seed', iterations: 3 });
    check('#535 has log', Array.isArray(r.log), 'array', typeof r.log);
    check('#535 iterations=3', r.iterations === 3, 3, r.iterations);
    check('#535 has final_value', typeof r.final_value === 'string', 'string', typeof r.final_value);
  });

  // 536: absence-detect
  await safeTest('#536 absence-detect', async () => {
    const r = await post('absence-detect', { expected: ['a', 'b', 'c', 'd'], actual: ['a', 'c'] });
    check('#536 has missing', Array.isArray(r.missing), 'array', typeof r.missing);
    check('#536 missing includes b and d', r.missing?.includes('b') && r.missing?.includes('d'), 'b,d', JSON.stringify(r.missing));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SENSE ENDPOINTS (537-550) - use localhost URLs
  // ═══════════════════════════════════════════════════════════════════════════

  const LOCALHOST = `http://localhost:${PORT}`;

  // 537: sense-url-content
  await safeTest('#537 sense-url-content', async () => {
    const r = await post('sense-url-content', { url: `${LOCALHOST}/index.html` }, 20000);
    check('#537 has title', typeof r.title === 'string', 'string', typeof r.title);
    check('#537 has text', typeof r.text === 'string' && r.text.length > 0, 'non-empty', r.text?.length);
    check('#537 has word_count', typeof r.word_count === 'number', 'number', typeof r.word_count);
    check('#537 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 538: sense-url-links
  await safeTest('#538 sense-url-links', async () => {
    const r = await post('sense-url-links', { url: `${LOCALHOST}/index.html` }, 20000);
    check('#538 has links', Array.isArray(r.links), 'array', typeof r.links);
    check('#538 has total', typeof r.total === 'number', 'number', typeof r.total);
  });

  // 539: sense-url-meta
  await safeTest('#539 sense-url-meta', async () => {
    const r = await post('sense-url-meta', { url: `${LOCALHOST}/index.html` }, 20000);
    check('#539 has title', typeof r.title === 'string', 'string', typeof r.title);
    check('#539 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 540: sense-url-tech-stack
  await safeTest('#540 sense-url-tech-stack', async () => {
    const r = await post('sense-url-tech-stack', { url: `${LOCALHOST}/index.html` }, 20000);
    check('#540 has technologies', Array.isArray(r.technologies), 'array', typeof r.technologies);
    check('#540 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 541: sense-url-response-time
  await safeTest('#541 sense-url-response-time', async () => {
    const r = await post('sense-url-response-time', { url: `${LOCALHOST}/index.html` }, 30000);
    check('#541 has avg_ms', typeof r.avg_ms === 'number', 'number', typeof r.avg_ms);
    check('#541 has times_ms', Array.isArray(r.times_ms) && r.times_ms.length === 3, 3, r.times_ms?.length);
    check('#541 avg_ms < 5000', r.avg_ms < 5000, '<5000', r.avg_ms);
  });

  // 542: sense-url-sitemap
  await safeTest('#542 sense-url-sitemap', async () => {
    const r = await post('sense-url-sitemap', { url: `${LOCALHOST}` }, 20000);
    check('#542 has urls', Array.isArray(r.urls), 'array', typeof r.urls);
    check('#542 has count', typeof r.count === 'number', 'number', typeof r.count);
    check('#542 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 543: sense-url-robots
  await safeTest('#543 sense-url-robots', async () => {
    const r = await post('sense-url-robots', { url: `${LOCALHOST}` }, 20000);
    check('#543 has rules', Array.isArray(r.rules), 'array', typeof r.rules);
    check('#543 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 544: sense-url-feed (may not have RSS on localhost, test gracefully)
  await safeTest('#544 sense-url-feed', async () => {
    const r = await post('sense-url-feed', { url: `${LOCALHOST}/feed.xml` }, 20000);
    check('#544 has items or error', Array.isArray(r.items) || r.error, 'items or error', typeof r.items);
    check('#544 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 545: sense-rss-latest
  await safeTest('#545 sense-rss-latest', async () => {
    const r = await post('sense-rss-latest', { url: `${LOCALHOST}/feed.xml`, count: 3 }, 20000);
    check('#545 has items', Array.isArray(r.items), 'array', typeof r.items);
    check('#545 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 546: sense-url-accessibility
  await safeTest('#546 sense-url-accessibility', async () => {
    const r = await post('sense-url-accessibility', { url: `${LOCALHOST}/index.html` }, 20000);
    check('#546 has score', typeof r.score === 'number', 'number', typeof r.score);
    check('#546 has issues', Array.isArray(r.issues), 'array', typeof r.issues);
    check('#546 has checks_passed', typeof r.checks_passed === 'number', 'number', typeof r.checks_passed);
  });

  // 547: sense-whois
  await safeTest('#547 sense-whois', async () => {
    const r = await post('sense-whois', { domain: 'google.com' }, 20000);
    check('#547 domain=google.com', r.domain === 'google.com', 'google.com', r.domain);
    check('#547 has nameservers', Array.isArray(r.nameservers), 'array', typeof r.nameservers);
    check('#547 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 548: sense-ip-geo
  await safeTest('#548 sense-ip-geo', async () => {
    const r = await post('sense-ip-geo', { ip: '8.8.8.8' });
    check('#548 ip=8.8.8.8', r.ip === '8.8.8.8', '8.8.8.8', r.ip);
    check('#548 region=North America', r.region === 'North America', 'North America', r.region);
    check('#548 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // 549: sense-time-now
  await safeTest('#549 sense-time-now', async () => {
    const r = await post('sense-time-now', { timezone: 'America/New_York' });
    check('#549 timezone=America/New_York', r.timezone === 'America/New_York', 'America/New_York', r.timezone);
    check('#549 has iso', typeof r.iso === 'string', 'string', typeof r.iso);
    check('#549 has unix', typeof r.unix === 'number', 'number', typeof r.unix);
    check('#549 has offset', typeof r.offset === 'string', 'string', typeof r.offset);
  });

  // 550: sense-time-zones
  await safeTest('#550 sense-time-zones', async () => {
    const r = await post('sense-time-zones', {});
    check('#550 has timezones', Array.isArray(r.timezones), 'array', typeof r.timezones);
    check('#550 timezones.length > 10', r.timezones?.length > 10, '>10', r.timezones?.length);
    check('#550 _engine=real', r._engine === 'real', 'real', r._engine);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WRITE REPORT
  // ═══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULTS: ${pass} PASS, ${fail} FAIL, ${skip} SKIP out of ${results.length} checks`);
  console.log(`${'='.repeat(60)}`);

  // Print failures
  const failures = results.filter(r => r.status === 'FAIL');
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach(f => {
      console.log(`  ${f.name}: expected=${f.expected}, actual=${f.actual}`);
    });
  }

  // Write report
  const dir = path.join(__dirname, '.internal');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let md = `# REAL AUDIT: Endpoints 401-550\n\n`;
  md += `**Date**: ${new Date().toISOString()}\n`;
  md += `**Server**: localhost:${PORT}\n`;
  md += `**Total Checks**: ${results.length}\n`;
  md += `**PASS**: ${pass} | **FAIL**: ${fail} | **SKIP**: ${skip}\n`;
  md += `**Pass Rate**: ${Math.round(pass / results.length * 10000) / 100}%\n\n`;

  md += `## Summary\n\n`;
  md += `| Status | Count |\n|--------|-------|\n`;
  md += `| PASS | ${pass} |\n| FAIL | ${fail} |\n| SKIP | ${skip} |\n\n`;

  md += `## All Results\n\n`;
  md += `| # | Test | Status | Expected | Actual |\n|---|------|--------|----------|--------|\n`;
  results.forEach((r, i) => {
    const exp = (r.expected || '').replace(/\|/g, '\\|').slice(0, 60);
    const act = (r.actual || '').replace(/\|/g, '\\|').slice(0, 60);
    md += `| ${i + 1} | ${r.name} | ${r.status === 'PASS' ? '✅' : '❌'} ${r.status} | ${exp} | ${act} |\n`;
  });

  if (failures.length > 0) {
    md += `\n## Failures Detail\n\n`;
    failures.forEach(f => {
      md += `### ${f.name}\n- **Expected**: ${f.expected}\n- **Actual**: ${f.actual}\n\n`;
    });
  }

  const outPath = path.join(dir, 'REAL-AUDIT-401-550.md');
  fs.writeFileSync(outPath, md);
  console.log(`\nReport written to ${outPath}`);
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
