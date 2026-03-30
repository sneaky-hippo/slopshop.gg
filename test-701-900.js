#!/usr/bin/env node
'use strict';

// Exhaustive test script for endpoints 701-900 (offset=700, limit=200)
// Each exotic handler gets meaningful input and output verification.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9975;
const BASE = `http://127.0.0.1:${PORT}`;
const API_KEY = 'sk-slop-demo-key-12345678';

const results = [];
let pass = 0, fail = 0, error = 0;

function post(slug, body, timeout = 15000) {
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
          resolve({ status: res.statusCode, body: parsed.data || parsed });
        } catch (e) {
          reject(new Error(`JSON parse for ${slug}: ${chunks.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

function check(name, condition, expected, actual) {
  if (condition) {
    results.push({ name, status: 'PASS' });
    pass++;
  } else {
    results.push({ name, status: 'FAIL', expected: String(expected).slice(0,120), actual: String(actual != null ? actual : 'undefined').slice(0,120) });
    fail++;
  }
}

async function safeTest(label, fn) {
  try {
    await fn();
  } catch (e) {
    results.push({ name: label, status: 'ERROR', actual: e.message.slice(0, 120) });
    error++;
  }
}

async function run() {
  console.log('Starting test run for endpoints 701-900...\n');

  // ─── 700: sense-subdomains (network, skip deep test) ───
  await safeTest('700 sense-subdomains', async () => {
    const r = await post('sense-subdomains', { domain: 'example.com' });
    check('700 sense-subdomains returns 200', r.status === 200, 200, r.status);
  });

  // ─── 701: memory-time-capsule ───
  await safeTest('701 memory-time-capsule', async () => {
    const r = await post('memory-time-capsule', { message: 'Hello from the past', open_after: '2026-04-01' });
    check('701 memory-time-capsule 200', r.status === 200, 200, r.status);
  });

  // ─── 702-705: army endpoints ───
  await safeTest('702 army-deploy', async () => {
    const r = await post('army-deploy', { name: 'test-army', mission: 'research', strategy: 'parallel', agents: 3 });
    check('702 army-deploy 200', r.status === 200, 200, r.status);
  });
  await safeTest('703 army-simulate', async () => {
    const r = await post('army-simulate', { mission: 'analyze competitors', agents: 5, rounds: 3 });
    check('703 army-simulate 200', r.status === 200, 200, r.status);
  });
  await safeTest('704 army-survey', async () => {
    const r = await post('army-survey', { question: 'What is the best approach?', army_name: 'test-army' });
    check('704 army-survey 200', r.status === 200, 200, r.status);
  });
  await safeTest('705 army-quick-poll', async () => {
    const r = await post('army-quick-poll', { question: 'Ship now?', options: ['yes', 'no', 'wait'] });
    check('705 army-quick-poll 200', r.status === 200, 200, r.status);
  });

  // ─── 706-709: hive endpoints ───
  await safeTest('706 hive-create', async () => {
    const r = await post('hive-create', { name: 'test-hive', description: 'Test workspace' });
    check('706 hive-create 200', r.status === 200, 200, r.status);
  });
  await safeTest('707 hive-send', async () => {
    const r = await post('hive-send', { hive: 'test-hive', message: 'hello', from: 'agent-1' });
    check('707 hive-send 200', r.status === 200, 200, r.status);
  });
  await safeTest('708 hive-sync', async () => {
    const r = await post('hive-sync', { hive: 'test-hive' });
    check('708 hive-sync 200', r.status === 200, 200, r.status);
  });
  await safeTest('709 hive-standup', async () => {
    const r = await post('hive-standup', { hive: 'test-hive' });
    check('709 hive-standup 200', r.status === 200, 200, r.status);
  });

  // ─── 710-713: broadcast/standup ───
  await safeTest('710 broadcast', async () => {
    const r = await post('broadcast', { message: 'deploy complete', channel: 'general' });
    check('710 broadcast 200', r.status === 200, 200, r.status);
  });
  await safeTest('711 broadcast-poll', async () => {
    const r = await post('broadcast-poll', { question: 'Deploy now?', options: ['yes', 'no'] });
    check('711 broadcast-poll 200', r.status === 200, 200, r.status);
  });
  await safeTest('712 standup-submit', async () => {
    const r = await post('standup-submit', { agent: 'agent-1', yesterday: 'built tests', today: 'fixing bugs', blockers: 'none' });
    check('712 standup-submit 200', r.status === 200, 200, r.status);
  });
  await safeTest('713 standup-streaks', async () => {
    const r = await post('standup-streaks', { agent: 'agent-1' });
    check('713 standup-streaks 200', r.status === 200, 200, r.status);
  });

  // ─── 714: reputation-rate ───
  await safeTest('714 reputation-rate', async () => {
    const r = await post('reputation-rate', { agent: 'agent-1', rating: 5, context: 'great work' });
    check('714 reputation-rate 200', r.status === 200, 200, r.status);
  });

  // ─── 715-721: session/branch/failure/ab/knowledge ───
  await safeTest('715 session-save', async () => {
    const r = await post('session-save', { session_id: 'test-sess', data: { foo: 'bar' } });
    check('715 session-save 200', r.status === 200, 200, r.status);
  });
  await safeTest('716 branch-create', async () => {
    const r = await post('branch-create', { name: 'feature-x', parent: 'main' });
    check('716 branch-create 200', r.status === 200, 200, r.status);
  });
  await safeTest('717 failure-log', async () => {
    const r = await post('failure-log', { event: 'api timeout', severity: 'high', details: 'upstream took 30s' });
    check('717 failure-log 200', r.status === 200, 200, r.status);
  });
  await safeTest('718 ab-create', async () => {
    const r = await post('ab-create', { experiment: 'button-color', variants: ['red', 'blue'] });
    check('718 ab-create 200', r.status === 200, 200, r.status);
  });
  await safeTest('719 knowledge-add', async () => {
    const r = await post('knowledge-add', { key: 'test-fact', value: 'The sky is blue' });
    check('719 knowledge-add 200', r.status === 200, 200, r.status);
  });
  await safeTest('720 knowledge-walk', async () => {
    const r = await post('knowledge-walk', { start: 'test-fact' });
    check('720 knowledge-walk 200', r.status === 200, 200, r.status);
  });
  await safeTest('721 knowledge-path', async () => {
    const r = await post('knowledge-path', { from: 'test-fact', to: 'test-fact' });
    check('721 knowledge-path 200', r.status === 200, 200, r.status);
  });

  // ─── 722-724: consciousness/existential/void ───
  await safeTest('722 consciousness-think', async () => {
    const r = await post('consciousness-think', { text: 'What is the meaning of existence?' });
    check('722 consciousness-think 200', r.status === 200, 200, r.status);
  });
  await safeTest('723 existential', async () => {
    const r = await post('existential', { question: 'Why do agents exist?' });
    check('723 existential 200', r.status === 200, 200, r.status);
  });
  await safeTest('724 void', async () => {
    const r = await post('void', { text: 'staring into the abyss' });
    check('724 void 200', r.status === 200, 200, r.status);
  });
  await safeTest('725 void-echo', async () => {
    const r = await post('void-echo', { text: 'echo in the void' });
    check('725 void-echo 200', r.status === 200, 200, r.status);
  });

  // ─── 726-730: random utilities ───
  await safeTest('726 random-int', async () => {
    const r = await post('random-int', { min: 1, max: 100 });
    check('726 random-int 200', r.status === 200, 200, r.status);
    const val = r.body.result ?? r.body.value ?? r.body.random;
    check('726 random-int in range', typeof val === 'number' && val >= 1 && val <= 100, '1-100', val);
  });
  await safeTest('727 random-float', async () => {
    const r = await post('random-float', { min: 0, max: 1 });
    check('727 random-float 200', r.status === 200, 200, r.status);
    const val = r.body.result ?? r.body.value ?? r.body.random;
    check('727 random-float in range', typeof val === 'number' && val >= 0 && val <= 1, '0-1', val);
  });
  await safeTest('728 random-choice', async () => {
    const r = await post('random-choice', { array: ['apple', 'banana', 'cherry'] });
    check('728 random-choice 200', r.status === 200, 200, r.status);
    const val = r.body.chosen;
    check('728 random-choice valid', Array.isArray(val) && val.length >= 1, 'non-empty array', JSON.stringify(val));
  });
  await safeTest('729 random-shuffle', async () => {
    const r = await post('random-shuffle', { array: [1, 2, 3, 4, 5] });
    check('729 random-shuffle 200', r.status === 200, 200, r.status);
    const val = r.body.shuffled;
    check('729 random-shuffle same length', Array.isArray(val) && val.length === 5, 5, val?.length);
  });
  await safeTest('730 random-sample', async () => {
    const r = await post('random-sample', { array: [1, 2, 3, 4, 5], n: 3 });
    check('730 random-sample 200', r.status === 200, 200, r.status);
    const val = r.body.sample;
    check('730 random-sample correct count', Array.isArray(val) && val.length === 3, 3, val?.length);
  });

  // ─── 731-735: form/approval system ───
  await safeTest('731 form-create', async () => {
    const r = await post('form-create', { name: 'feedback', fields: ['rating', 'comment'] });
    check('731 form-create 200', r.status === 200, 200, r.status);
  });
  await safeTest('732 form-submit', async () => {
    const r = await post('form-submit', { form: 'feedback', data: { rating: 5, comment: 'great' } });
    check('732 form-submit 200', r.status === 200, 200, r.status);
  });
  await safeTest('733 form-results', async () => {
    const r = await post('form-results', { form: 'feedback' });
    check('733 form-results 200', r.status === 200, 200, r.status);
  });
  await safeTest('734 approval-request', async () => {
    const r = await post('approval-request', { action: 'deploy-v2', requester: 'agent-1' });
    check('734 approval-request 200', r.status === 200, 200, r.status);
  });
  await safeTest('735 approval-decide', async () => {
    const r = await post('approval-decide', { request_id: 'test-req', decision: 'approved' });
    check('735 approval-decide 200', r.status === 200, 200, r.status);
  });
  await safeTest('736 approval-status', async () => {
    const r = await post('approval-status', { request_id: 'test-req' });
    check('736 approval-status 200', r.status === 200, 200, r.status);
  });

  // ─── 737-739: ticket system ───
  await safeTest('737 ticket-create', async () => {
    const r = await post('ticket-create', { title: 'Fix login bug', priority: 'high', assignee: 'dev-1' });
    check('737 ticket-create 200', r.status === 200, 200, r.status);
  });
  await safeTest('738 ticket-update', async () => {
    const r = await post('ticket-update', { ticket_id: 'TKT-001', status: 'in-progress' });
    check('738 ticket-update 200', r.status === 200, 200, r.status);
  });
  await safeTest('739 ticket-list', async () => {
    const r = await post('ticket-list', {});
    check('739 ticket-list 200', r.status === 200, 200, r.status);
  });

  // ─── 740-741: certification ───
  await safeTest('740 certification-create', async () => {
    const r = await post('certification-create', { name: 'API Master', criteria: ['pass-exam', 'build-project'] });
    check('740 certification-create 200', r.status === 200, 200, r.status);
  });
  await safeTest('741 certification-exam', async () => {
    const r = await post('certification-exam', { certification: 'API Master', agent: 'agent-1' });
    check('741 certification-exam 200', r.status === 200, 200, r.status);
  });

  // ─── 742: health-report ───
  await safeTest('742 health-report', async () => {
    const r = await post('health-report', {});
    check('742 health-report 200', r.status === 200, 200, r.status);
  });

  // ─── 743: ritual-checkin ───
  await safeTest('743 ritual-checkin', async () => {
    const r = await post('ritual-checkin', { agent: 'agent-1', ritual: 'morning-standup' });
    check('743 ritual-checkin 200', r.status === 200, 200, r.status);
  });

  // ─── 744: crypto-checksum-file ───
  await safeTest('744 crypto-checksum-file', async () => {
    const r = await post('crypto-checksum-file', { content: 'hello world', algorithm: 'sha256' });
    check('744 crypto-checksum-file 200', r.status === 200, 200, r.status);
  });

  // ─── 745: date-subtract ───
  await safeTest('745 date-subtract', async () => {
    const r = await post('date-subtract', { date: '2026-03-29', subtract: { days: 10 } });
    check('745 date-subtract 200', r.status === 200, 200, r.status);
  });

  // ─── 746: date-timezone-convert ───
  await safeTest('746 date-timezone-convert', async () => {
    const r = await post('date-timezone-convert', { date: '2026-03-29T12:00:00Z', from: 'UTC', to: 'America/New_York' });
    check('746 date-timezone-convert 200', r.status === 200, 200, r.status);
  });

  // ─── 747-759: network utilities ───
  const netSlugs = [
    { i: 747, slug: 'net-url-build', body: { scheme: 'https', host: 'example.com', path: '/api', query: { q: 'test' } } },
    { i: 748, slug: 'net-url-normalize', body: { url: 'HTTP://EXAMPLE.com/./foo/../bar' } },
    { i: 749, slug: 'net-dns-lookup', body: { domain: 'example.com' } },
    { i: 750, slug: 'net-url-status', body: { url: 'https://example.com' } },
    { i: 751, slug: 'net-url-headers', body: { url: 'https://example.com' } },
    { i: 752, slug: 'net-url-redirect-chain', body: { url: 'https://example.com' } },
    { i: 753, slug: 'net-ip-info', body: { ip: '8.8.8.8' } },
    { i: 754, slug: 'net-dns-cname', body: { domain: 'www.example.com' } },
    { i: 755, slug: 'net-dns-reverse', body: { ip: '8.8.8.8' } },
    { i: 756, slug: 'net-http-options', body: { url: 'https://example.com' } },
    { i: 757, slug: 'net-ssl-expiry', body: { domain: 'example.com' } },
    { i: 758, slug: 'net-ip-is-private', body: { ip: '192.168.1.1' } },
    { i: 759, slug: 'net-domain-validate', body: { domain: 'example.com' } },
  ];
  for (const ns of netSlugs) {
    await safeTest(`${ns.i} ${ns.slug}`, async () => {
      const r = await post(ns.slug, ns.body, 20000);
      check(`${ns.i} ${ns.slug} 200`, r.status === 200, 200, r.status);
    });
  }

  // ─── 760-765: generators ───
  await safeTest('760 gen-qr-data', async () => {
    const r = await post('gen-qr-data', { text: 'https://slopshop.gg' });
    check('760 gen-qr-data 200', r.status === 200, 200, r.status);
  });
  await safeTest('761 gen-fake-uuid', async () => {
    const r = await post('gen-fake-uuid', {});
    check('761 gen-fake-uuid 200', r.status === 200, 200, r.status);
    const uuid = r.body.uuid || r.body.result || r.body.value;
    check('761 gen-fake-uuid format', typeof uuid === 'string' && uuid.length >= 32, 'uuid string', uuid);
  });
  await safeTest('762 gen-fake-date', async () => {
    const r = await post('gen-fake-date', { min: '2020-01-01', max: '2026-12-31' });
    check('762 gen-fake-date 200', r.status === 200, 200, r.status);
  });
  await safeTest('763 gen-fake-sentence', async () => {
    const r = await post('gen-fake-sentence', {});
    check('763 gen-fake-sentence 200', r.status === 200, 200, r.status);
  });
  await safeTest('764 gen-fake-paragraph', async () => {
    const r = await post('gen-fake-paragraph', {});
    check('764 gen-fake-paragraph 200', r.status === 200, 200, r.status);
  });
  await safeTest('765 gen-slug', async () => {
    const r = await post('gen-slug', { text: 'Hello World Test' });
    check('765 gen-slug 200', r.status === 200, 200, r.status);
    const slug = r.body.slug || r.body.result || r.body.value;
    check('765 gen-slug output', typeof slug === 'string' && slug.includes('-'), 'hello-world-test', slug);
  });

  // ─── 766-767: hash utilities ───
  await safeTest('766 hash-hmac', async () => {
    const r = await post('hash-hmac', { text: 'hello', key: 'secret', algorithm: 'sha256' });
    check('766 hash-hmac 200', r.status === 200, 200, r.status);
    const h = r.body.hmac || r.body.hash || r.body.result;
    check('766 hash-hmac is hex string', typeof h === 'string' && h.length >= 32, 'hex string', h);
  });
  await safeTest('767 hash-checksum', async () => {
    const r = await post('hash-checksum', { text: 'hello world', algorithm: 'md5' });
    check('767 hash-checksum 200', r.status === 200, 200, r.status);
  });

  // ─── 768-775: string utilities ───
  await safeTest('768 regex-replace', async () => {
    const r = await post('regex-replace', { text: 'foo123bar456', pattern: '\\d+', replacement: '#' });
    check('768 regex-replace 200', r.status === 200, 200, r.status);
    const result = r.body.result || r.body.text || r.body.output;
    check('768 regex-replace output', typeof result === 'string' && result.includes('#'), 'foo#bar#', result);
  });
  await safeTest('769 encode-rot13', async () => {
    const r = await post('encode-rot13', { text: 'Hello' });
    check('769 encode-rot13 200', r.status === 200, 200, r.status);
    const result = r.body.result || r.body.text || r.body.encoded;
    check('769 encode-rot13 output', result === 'Uryyb', 'Uryyb', result);
  });
  await safeTest('770 encode-morse', async () => {
    const r = await post('encode-morse', { text: 'SOS' });
    check('770 encode-morse 200', r.status === 200, 200, r.status);
    const result = r.body.encoded || r.body.result || r.body.text || r.body.morse;
    check('770 encode-morse output', typeof result === 'string' && result.includes('...'), '... --- ...', result);
  });
  await safeTest('771 string-repeat', async () => {
    const r = await post('string-repeat', { text: 'ab', count: 3 });
    check('771 string-repeat 200', r.status === 200, 200, r.status);
    const result = r.body.result || r.body.text || r.body.output;
    check('771 string-repeat output', result === 'ababab', 'ababab', result);
  });
  await safeTest('772 string-pad', async () => {
    const r = await post('string-pad', { text: 'hi', length: 6, char: '*', side: 'left' });
    check('772 string-pad 200', r.status === 200, 200, r.status);
  });
  await safeTest('773 string-wrap', async () => {
    const r = await post('string-wrap', { text: 'The quick brown fox jumps over the lazy dog', width: 10 });
    check('773 string-wrap 200', r.status === 200, 200, r.status);
  });
  await safeTest('774 string-template', async () => {
    const r = await post('string-template', { template: 'Hello {{name}}, you have {{count}} items', vars: { name: 'Agent', count: 5 } });
    check('774 string-template 200', r.status === 200, 200, r.status);
    const result = r.body.rendered || r.body.result || r.body.text;
    check('774 string-template output', typeof result === 'string' && result.includes('Agent'), 'Hello Agent, you have 5 items', result);
  });
  await safeTest('775 string-camel-case', async () => {
    const r = await post('string-camel-case', { text: 'hello-world-test' });
    check('775 string-camel-case 200', r.status === 200, 200, r.status);
    const result = r.body.camel || r.body.result || r.body.text;
    check('775 string-camel-case output', result === 'helloWorldTest', 'helloWorldTest', result);
  });

  // ═══════════════════════════════════════════════════════════
  //  EXOTIC HANDLERS — Deep verification
  // ═══════════════════════════════════════════════════════════

  // ─── TEMPORAL ENGINEERING (776-783) ────────────────────────

  await safeTest('776 temporal-fork', async () => {
    const r = await post('temporal-fork', {
      states: { v: 10 },
      actions: [['fix bug', 'deploy'], ['revert', 'rebuild from scratch']]
    });
    check('776 temporal-fork 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('776 has branches array', Array.isArray(b.branches) && b.branches.length === 2, 2, b.branches?.length);
    check('776 each branch has score', b.branches?.every(br => typeof br.score === 'number' && br.score >= 0 && br.score <= 100), true, b.branches?.map(br=>br.score));
    check('776 best_branch is number', typeof b.best_branch === 'number', true, typeof b.best_branch);
    // "fix" is a positive action — first branch should have higher score
    check('776 fix branch scores higher', b.branches[0].actions.join(' ').includes('fix'), true, b.branches[0]?.actions);
    check('776 _engine is real', b._engine === 'real', 'real', b._engine);
  });

  await safeTest('777 causal-rewind', async () => {
    const r = await post('causal-rewind', {
      events: ['deploy v1', 'config change', 'traffic spike', 'db timeout', 'outage'],
      undesired_outcome: 'outage'
    });
    check('777 causal-rewind 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('777 has root_cause_candidate', b.root_cause_candidate !== null, true, b.root_cause_candidate);
    check('777 has rollback_point', typeof b.rollback_point === 'number', true, b.rollback_point);
    check('777 has chain', Array.isArray(b.chain), true, typeof b.chain);
    check('777 rollback at 3', b.rollback_point === 3, 3, b.rollback_point);
  });

  await safeTest('778 deadline-pressure-field', async () => {
    const r = await post('deadline-pressure-field', {
      tasks: [
        { name: 'write tests', priority: 9, hours: 4 },
        { name: 'update docs', priority: 3, hours: 1 },
        { name: 'fix critical bug', priority: 10, hours: 6 }
      ],
      deadline_hours: 8
    });
    check('778 deadline-pressure 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('778 tasks sorted by pressure', b.tasks[0].name === 'fix critical bug', 'fix critical bug', b.tasks[0]?.name);
    check('778 each task has urgency', b.tasks.every(t => ['critical', 'high', 'normal'].includes(t.urgency)), true, b.tasks?.map(t=>t.urgency));
    check('778 fix critical bug is high (8-6=2, not <2)', b.tasks[0].urgency === 'high', 'high', b.tasks[0]?.urgency);
  });

  await safeTest('779 temporal-echo-detect', async () => {
    const r = await post('temporal-echo-detect', {
      actions: ['deploy', 'rollback', 'deploy', 'rollback', 'deploy', 'rollback'],
      window_size: 4
    });
    check('779 temporal-echo 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('779 loop_detected true', b.loop_detected === true, true, b.loop_detected);
    check('779 cycle_length 2', b.cycle_length === 2, 2, b.cycle_length);
    check('779 has escape_suggestion', typeof b.escape_suggestion === 'string' && b.escape_suggestion.length > 0, true, b.escape_suggestion);
  });

  await safeTest('780 chronological-debt-ledger', async () => {
    const r = await post('chronological-debt-ledger', {
      shortcuts: [
        { name: 'skipped_tests', age_hours: 96 },
        { name: 'hardcoded_config', age_hours: 24 },
        { name: 'manual_deploy', age_hours: 168 }
      ]
    });
    check('780 chrono-debt 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('780 total_debt is 3', b.total_debt === 3, 3, b.total_debt);
    check('780 has critical count', typeof b.critical_count === 'number', true, typeof b.critical_count);
    check('780 manual_deploy age=168 is critical', b.debts.find(d => d.name === 'manual_deploy')?.status === 'critical', 'critical', b.debts?.find(d => d.name === 'manual_deploy')?.status);
    check('780 debts sorted by compound_urgency', b.debts[0].compound_urgency >= b.debts[b.debts.length - 1].compound_urgency, true, b.debts?.map(d=>d.compound_urgency));
  });

  await safeTest('781 event-horizon-scheduler', async () => {
    const r = await post('event-horizon-scheduler', {
      tasks: [
        { name: 'critical deploy', priority: 10 },
        { name: 'code review', priority: 5 },
        { name: 'docs update', priority: 2 }
      ],
      gravity_constant: 9.8
    });
    check('781 event-horizon 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('781 schedule sorted by warp', b.schedule[0].name === 'critical deploy', 'critical deploy', b.schedule[0]?.name);
    check('781 each has warp_factor', b.schedule.every(t => typeof t.warp_factor === 'number'), true, b.schedule?.map(t=>t.warp_factor));
  });

  await safeTest('782 retrocausal-hint', async () => {
    const r = await post('retrocausal-hint', {
      current_state: { status: 'buggy', tests: 'failing' },
      desired_state: { status: 'stable', tests: 'passing' },
      possible_actions: ['write more tests', 'revert to stable', 'add logging']
    });
    check('782 retrocausal 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('782 best_next_action exists', typeof b.best_next_action === 'string', true, b.best_next_action);
    check('782 confidence is number', typeof b.confidence === 'number' && b.confidence >= 0 && b.confidence <= 1, true, b.confidence);
    check('782 all_scored has 3', Array.isArray(b.all_scored) && b.all_scored.length === 3, 3, b.all_scored?.length);
  });

  await safeTest('783 temporal-diff-merge', async () => {
    const r = await post('temporal-diff-merge', {
      base: { name: 'app', version: '1.0', color: 'blue' },
      branch_a: { name: 'app', version: '1.1', color: 'blue' },
      branch_b: { name: 'app', version: '1.0', color: 'red' }
    });
    check('783 temporal-diff 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('783 merged.version = 1.1', b.merged.version === '1.1', '1.1', b.merged?.version);
    check('783 merged.color = red', b.merged.color === 'red', 'red', b.merged?.color);
    check('783 conflict_count = 0', b.conflict_count === 0, 0, b.conflict_count);
  });

  // ─── COGNITIVE ARCHITECTURE (784-791) ──────────────────────

  await safeTest('784 cognitive-load-balancer', async () => {
    const r = await post('cognitive-load-balancer', {
      tasks: [
        { name: 'A', complexity: 4 },
        { name: 'B', complexity: 3 },
        { name: 'C', complexity: 5 },
        { name: 'D', complexity: 2 },
        { name: 'E', complexity: 6 }
      ],
      max_load: 7
    });
    check('784 cog-load 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('784 has chunks', Array.isArray(b.chunks) && b.chunks.length > 0, true, b.chunks?.length);
    check('784 no chunk exceeds max_load', b.chunks.every(chunk => chunk.reduce((s, t) => s + t.load, 0) <= 7), true, 'chunk loads');
    check('784 max_load = 7', b.max_load === 7, 7, b.max_load);
  });

  await safeTest('785 attention-spotlight', async () => {
    const r = await post('attention-spotlight', {
      context: { performance: 'slow', security: 'ok', cost: '$500/mo', latency: '200ms', performance_fix: 'add cache' },
      goal: 'performance'
    });
    check('785 attention 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('785 focused has performance keys', Object.keys(b.focused).includes('performance'), true, Object.keys(b.focused));
    check('785 focused has performance_fix', Object.keys(b.focused).includes('performance_fix'), true, Object.keys(b.focused));
    check('785 pruned some keys', b.pruned_keys > 0, true, b.pruned_keys);
    check('785 focus_ratio < 1', b.focus_ratio < 1, true, b.focus_ratio);
  });

  await safeTest('786 metacognitive-audit', async () => {
    const r = await post('metacognitive-audit', {
      decisions: [
        { action: 'deploy v2', confidence: 0.95, correct: false },
        { action: 'skip tests', confidence: 0.3, correct: true },
        { action: 'add cache', confidence: 0.7, correct: true }
      ]
    });
    check('786 metacog 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('786 overconfidence_rate > 0', b.overconfidence_rate > 0, true, b.overconfidence_rate);
    check('786 blind_spots = 1', b.blind_spots === 1, 1, b.blind_spots);
    check('786 total = 3', b.total === 3, 3, b.total);
    check('786 first decision overconfident', b.decisions[0].overconfident === true, true, b.decisions[0]?.overconfident);
  });

  await safeTest('787 reasoning-scaffold', async () => {
    const r = await post('reasoning-scaffold', { problem_type: 'debugging' });
    check('787 scaffold 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('787 problem_type = debugging', b.problem_type === 'debugging', 'debugging', b.problem_type);
    check('787 scaffold has steps', Array.isArray(b.scaffold) && b.scaffold.length >= 5, true, b.scaffold?.length);
    check('787 first step is Reproduce', b.scaffold[0].instruction === 'Reproduce', 'Reproduce', b.scaffold[0]?.instruction);
  });

  await safeTest('788 cognitive-dissonance-detector', async () => {
    const r = await post('cognitive-dissonance-detector', {
      beliefs: [
        'We should always ship fast and not worry about testing',
        'Quality is the most important thing and we should never ship without tests',
        'Documentation is not important'
      ]
    });
    check('788 dissonance 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('788 dissonant_pairs found', Array.isArray(b.dissonant_pairs) && b.dissonant_pairs.length > 0, true, b.dissonant_pairs?.length);
    check('788 max_tension > 0', b.max_tension > 0, true, b.max_tension);
    check('788 beliefs_analyzed = 3', b.beliefs_analyzed === 3, 3, b.beliefs_analyzed);
  });

  await safeTest('789 focus-drift-compass', async () => {
    const r = await post('focus-drift-compass', {
      goal: 'improve API performance latency',
      recent_actions: [
        'profiled slow endpoints',
        'added caching to hot paths',
        'refactored UI components',
        'updated CSS styling',
        'wrote documentation'
      ]
    });
    check('789 focus-drift 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('789 drift_detected true', b.drift_detected === true, true, b.drift_detected);
    check('789 drift_started_at = 0 (no goal words in any action)', b.drift_started_at === 0, 0, b.drift_started_at);
    check('789 avg_alignment = 0 (no overlap)', b.avg_alignment === 0, 0, b.avg_alignment);
  });

  await safeTest('790 dunning-kruger-calibrator', async () => {
    const r = await post('dunning-kruger-calibrator', {
      self_ratings: [0.9, 0.85, 0.95, 0.8],
      actual_scores: [0.5, 0.6, 0.4, 0.7]
    });
    check('790 dunning-kruger 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('790 pattern = systematic_overconfidence', b.pattern === 'systematic_overconfidence', 'systematic_overconfidence', b.pattern);
    check('790 avg_bias > 0.2', b.avg_bias > 0.2, true, b.avg_bias);
    check('790 adjustment < 0', b.adjustment < 0, true, b.adjustment);
    check('790 calibration has 4 items', b.calibration.length === 4, 4, b.calibration?.length);
  });

  await safeTest('791 mental-model-clash', async () => {
    const r = await post('mental-model-clash', {
      model_a: { growth: 'exponential', cost: 'linear', risk: 'low' },
      model_b: { growth: 'linear', cost: 'linear', risk: 'high' }
    });
    check('791 model-clash 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('791 agreements has cost', b.agreements.includes('cost'), true, b.agreements);
    check('791 disagreements has growth and risk', b.disagreements.length === 2, 2, b.disagreements?.length);
    check('791 agreement_rate ~0.33', Math.abs(b.agreement_rate - 0.33) < 0.05, '~0.33', b.agreement_rate);
  });

  // ─── SWARM / DISTRIBUTED COORDINATION (792-799) ───────────

  await safeTest('792 swarm-consensus-vote', async () => {
    const r = await post('swarm-consensus-vote', {
      options: ['implement caching', 'optimize database queries', 'add more servers'],
      voter_count: 200
    });
    check('792 swarm-vote 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('792 has winner', typeof b.winner === 'string', true, b.winner);
    check('792 total_votes = 200', b.total_votes === 200, 200, b.total_votes);
    check('792 votes sum to 200', Object.values(b.results).reduce((a, c) => a + c, 0) === 200, 200, Object.values(b.results || {}).reduce((a, c) => a + c, 0));
    check('792 dissent_ratio 0-1', b.dissent_ratio >= 0 && b.dissent_ratio <= 1, true, b.dissent_ratio);
  });

  await safeTest('793 stigmergy-blackboard', async () => {
    const r = await post('stigmergy-blackboard', {
      signals: [
        { topic: 'bottleneck', weight: 5, detail: 'db slow' },
        { topic: 'bottleneck', weight: 3, detail: 'api slow' },
        { topic: 'opportunity', weight: 2, detail: 'cache hit rate low' },
        { topic: 'bottleneck', weight: 4, detail: 'network latency' }
      ]
    });
    check('793 stigmergy 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('793 top_topic = bottleneck', b.top_topic === 'bottleneck', 'bottleneck', b.top_topic);
    check('793 total_signals = 4', b.total_signals === 4, 4, b.total_signals);
    check('793 hotspots has 2', b.hotspots.length === 2, 2, b.hotspots?.length);
  });

  await safeTest('794 flocking-alignment', async () => {
    const r = await post('flocking-alignment', {
      agents: [
        { id: 'a1', x: 0, y: 0, vx: 3, vy: 0 },
        { id: 'a2', x: 1, y: 1, vx: 0, vy: 3 },
        { id: 'a3', x: 2, y: 0, vx: -3, vy: 0 }
      ]
    });
    check('794 flocking 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('794 swarm_heading.vx = 0', b.swarm_heading.vx === 0, 0, b.swarm_heading?.vx);
    check('794 swarm_heading.vy = 1', b.swarm_heading.vy === 1, 1, b.swarm_heading?.vy);
    check('794 corrections has 3', b.corrections.length === 3, 3, b.corrections?.length);
    check('794 cohesion 0-1', b.cohesion >= 0 && b.cohesion <= 1, true, b.cohesion);
  });

  await safeTest('795 ant-colony-path-rank', async () => {
    const r = await post('ant-colony-path-rank', {
      graph: { A: { B: 1, C: 3 }, B: { C: 1, D: 2 }, C: { D: 1 }, D: {} },
      iterations: 10,
      ants_per_iteration: 5
    });
    check('795 ant-colony 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('795 has best_paths', Array.isArray(b.best_paths) && b.best_paths.length > 0, true, b.best_paths?.length);
    check('795 best path starts A ends D', b.best_paths[0].path[0] === 'A' && b.best_paths[0].path[b.best_paths[0].path.length - 1] === 'D', true, b.best_paths[0]?.path);
    check('795 best path cost <= 4', b.best_paths[0].cost <= 4, true, b.best_paths[0]?.cost);
  });

  await safeTest('796 emergence-detector', async () => {
    const r = await post('emergence-detector', {
      agent_actions: [
        { type: 'cache' }, { type: 'cache' }, { type: 'cache' }, { type: 'cache' },
        { type: 'log' }, { type: 'retry' },
        { type: 'cache' }, { type: 'cache' }
      ]
    });
    check('796 emergence 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('796 emergence_detected true', b.emergence_detected === true, true, b.emergence_detected);
    check('796 emergent_behavior has cache', b.emergent_behavior.includes('cache'), true, b.emergent_behavior);
  });

  await safeTest('797 swarm-role-crystallize', async () => {
    const r = await post('swarm-role-crystallize', {
      agents: [
        { id: 'a1', skills: ['fast', 'explore'] },
        { id: 'a2', skills: ['precise', 'verify', 'test'] },
        { id: 'a3', skills: ['plan', 'organize'] }
      ],
      mission: 'code review'
    });
    check('797 role-crystallize 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('797 a1 = scout', b.assignments[0].role === 'scout', 'scout', b.assignments[0]?.role);
    check('797 a2 = validator', b.assignments[1].role === 'validator', 'validator', b.assignments[1]?.role);
    check('797 a3 = coordinator', b.assignments[2].role === 'coordinator', 'coordinator', b.assignments[2]?.role);
    check('797 coverage > 0', b.coverage > 0, true, b.coverage);
  });

  await safeTest('798 collective-memory-distill', async () => {
    const r = await post('collective-memory-distill', {
      observations: [
        { text: 'Database performance is degraded under heavy load' },
        { text: 'Heavy traffic causes database slowdowns' },
        { text: 'The database needs optimization for load handling' },
        { text: 'Users report timeouts during peak database load' }
      ]
    });
    check('798 memory-distill 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('798 sources = 4', b.sources === 4, 4, b.sources);
    check('798 key_themes has items', b.key_themes.length > 0, true, b.key_themes?.length);
    check('798 top theme related to database/load', b.key_themes[0].term === 'database' || b.key_themes[0].term === 'load', 'database or load', b.key_themes[0]?.term);
  });

  await safeTest('799 quorum-sensing-trigger', async () => {
    const r = await post('quorum-sensing-trigger', {
      signals: [
        { strength: 3 }, { strength: 2 }, { strength: 4 }, { strength: 1 }
      ],
      threshold: 0.5
    });
    check('799 quorum 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('799 signal_strength = 10', b.signal_strength === 10, 10, b.signal_strength);
    check('799 activated true', b.activated === true, true, b.activated);
    check('799 signals_received = 4', b.signals_received === 4, 4, b.signals_received);
  });

  // ─── DIMENSIONAL ANALYSIS (800-807) ───────────────────────

  await safeTest('800 perspective-warp', async () => {
    const r = await post('perspective-warp', {
      problem: 'API latency is causing user frustration and system performance issues',
      perspectives: ['user', 'engineer', 'adversary', 'novice']
    });
    check('800 perspective 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('800 has 4 warped_views', b.warped_views.length === 4, 4, b.warped_views?.length);
    check('800 most_revealing is string', typeof b.most_revealing === 'string', true, b.most_revealing);
    check('800 each view has reframe', b.warped_views.every(v => typeof v.reframe === 'string'), true, 'all have reframe');
  });

  await safeTest('801 dimensional-collapse', async () => {
    const r = await post('dimensional-collapse', {
      dimensions: ['cost', 'speed', 'quality'],
      scores: [0.8, 0.3, 0.9],
      context: 'We need a fast and cheap solution'
    });
    check('801 dim-collapse 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('801 key_dimension exists', typeof b.key_dimension === 'string', true, b.key_dimension);
    check('801 key_dimension = speed (most variance)', b.key_dimension === 'speed', 'speed', b.key_dimension);
    check('801 all_dimensions has 3', b.all_dimensions.length === 3, 3, b.all_dimensions?.length);
  });

  await safeTest('802 cross-domain-bridge', async () => {
    const r = await post('cross-domain-bridge', {
      domain_a: { speed: 'fast', fuel: 'gas', passengers: 4 },
      domain_b: { throughput: 'high', power: 'electric', connections: 100 }
    });
    check('802 bridge 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('802 mapping has 3', b.mapping.length === 3, 3, b.mapping?.length);
    check('802 structural_similarity 0-1', b.structural_similarity >= 0 && b.structural_similarity <= 1, true, b.structural_similarity);
  });

  await safeTest('803 scale-shift-lens', async () => {
    const r = await post('scale-shift-lens', {
      problem: 'handle user requests',
      current_scale: 1,
      scales: [0.1, 1, 10, 100, 1000]
    });
    check('803 scale-shift 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('803 has 5 scale_analysis', b.scale_analysis.length === 5, 5, b.scale_analysis?.length);
    check('803 critical_threshold exists', b.critical_threshold !== undefined, true, b.critical_threshold);
  });

  await safeTest('804 flatland-projection', async () => {
    const r = await post('flatland-projection', {
      variables: ['latency', 'throughput', 'cost', 'reliability'],
      data: [
        { latency: 10, throughput: 100, cost: 50, reliability: 99 },
        { latency: 200, throughput: 10, cost: 5, reliability: 80 },
        { latency: 50, throughput: 50, cost: 30, reliability: 95 }
      ]
    });
    check('804 flatland 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('804 best_projection has 2 axes', Array.isArray(b.best_projection) && b.best_projection.length === 2, 2, b.best_projection?.length);
    check('804 total_dimensions = 4', b.total_dimensions === 4, 4, b.total_dimensions);
    check('804 all_projections = 6 pairs', b.all_projections.length === 6, 6, b.all_projections?.length);
  });

  await safeTest('805 abstraction-ladder', async () => {
    const r = await post('abstraction-ladder', {
      concrete_statement: 'The payment API returns 500 when amount is negative'
    });
    check('805 abstraction 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('805 ladder has 4 levels', b.ladder.length === 4, 4, b.ladder?.length);
    check('805 levels are instance,pattern,principle,universal', b.ladder.map(l => l.level).join(',') === 'instance,pattern,principle,universal', 'instance,pattern,principle,universal', b.ladder?.map(l => l.level).join(','));
    check('805 solve_at = principle', b.solve_at === 'principle', 'principle', b.solve_at);
  });

  await safeTest('806 inverse-dimension-map', async () => {
    const r = await post('inverse-dimension-map', {
      solution: 'Add caching to improve performance and reduce cost',
      problem_dimensions: ['performance', 'cost', 'reliability', 'usability']
    });
    check('806 inverse-dim 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('806 addressed_count = 2', b.addressed_count === 2, 2, b.addressed_count);
    check('806 gaps has reliability and usability', b.gaps.length === 2, 2, b.gaps?.length);
  });

  await safeTest('807 dimension-gate-filter', async () => {
    const r = await post('dimension-gate-filter', {
      items: [
        { name: 'Option A', quality: 0.9, relevance: 0.8 },
        { name: 'Option B', quality: 0.2, relevance: 0.1 },
        { name: 'Option C', quality: 0.7, relevance: 0.6 }
      ],
      gate_dimensions: ['quality', 'relevance'],
      min_score: 0.5
    });
    check('807 dim-gate 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('807 passed has 2', b.passed.length === 2, 2, b.passed?.length);
    check('807 rejected has 1', b.rejected.length === 1, 1, b.rejected?.length);
    check('807 pass_rate ~0.67', Math.abs(b.pass_rate - 0.67) < 0.05, '~0.67', b.pass_rate);
  });

  // ─── INFO THEORY / ENTROPY (808-813) ──────────────────────

  await safeTest('808 entropy-gauge', async () => {
    const r = await post('entropy-gauge', {
      distribution: { a: 25, b: 25, c: 25, d: 25 }
    });
    check('808 entropy 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('808 entropy = max_entropy (uniform)', b.entropy === b.max_entropy, b.max_entropy, b.entropy);
    check('808 normalized = 1', b.normalized === 1, 1, b.normalized);
    check('808 disorder_level = high', b.disorder_level === 'high', 'high', b.disorder_level);
    check('808 categories = 4', b.categories === 4, 4, b.categories);
  });

  await safeTest('809 information-bottleneck', async () => {
    const r = await post('information-bottleneck', {
      inputs: ['critical data point with unique information', 'a', 'b', 'important analysis result with details', 'c', 'd'],
      compression_ratio: 0.5
    });
    check('809 info-bottleneck 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('809 retained has 3', b.retained.length === 3, 3, b.retained?.length);
    check('809 discarded_count = 3', b.discarded_count === 3, 3, b.discarded_count);
    check('809 compression_ratio = 0.5', b.compression_ratio === 0.5, 0.5, b.compression_ratio);
  });

  await safeTest('810 noise-signal-separator', async () => {
    const r = await post('noise-signal-separator', {
      data: ['Important analysis of system performance under load',
             'a', 'x', '',
             'Critical security vulnerability found in auth module',
             'ok'],
      noise_threshold: 0.3
    });
    check('810 noise-signal 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('810 has signals array', Array.isArray(b.signals), true, typeof b.signals);
    check('810 has noise array', Array.isArray(b.noise), true, typeof b.noise);
    check('810 total_items = 6', b.total_items === 6, 6, b.total_items);
  });

  await safeTest('811 redundancy-compressor', async () => {
    const r = await post('redundancy-compressor', {
      messages: ['hello', 'world', 'hello', 'test', 'world', 'hello']
    });
    check('811 redundancy 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('811 unique has 3', b.unique.length === 3, 3, b.unique?.length);
    check('811 unique_count = 3', b.unique_count === 3, 3, b.unique_count);
    check('811 original_count = 6', b.original_count === 6, 6, b.original_count);
    check('811 compression = 0.5', b.compression === 0.5, 0.5, b.compression);
    check('811 duplicates has 3', b.duplicates.length === 3, 3, b.duplicates?.length);
  });

  await safeTest('812 surprise-index', async () => {
    const r = await post('surprise-index', {
      expected: { revenue: 100, users: 500, errors: 5 },
      actual: { revenue: 50, users: 490, errors: 200 }
    });
    check('812 surprise 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('812 most_surprising = errors', b.most_surprising.key === 'errors', 'errors', b.most_surprising?.key);
    check('812 alarm true', b.alarm === true, true, b.alarm);
    check('812 avg_surprise > 0.5', b.avg_surprise > 0.5, true, b.avg_surprise);
  });

  await safeTest('813 context-parallax', async () => {
    const r = await post('context-parallax', {
      claim: 'Machine learning improves software quality',
      context_a: 'In companies with large engineering teams and massive datasets, machine learning has improved testing coverage and code quality significantly.',
      context_b: 'Small startups with limited data find machine learning tooling expensive, complex, and often counterproductive to their velocity.'
    });
    check('813 parallax 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('813 parallax_shift 0-1', b.parallax_shift >= 0 && b.parallax_shift <= 1, true, b.parallax_shift);
    check('813 fragile boolean', typeof b.fragile === 'boolean', true, typeof b.fragile);
    check('813 has context_similarity', typeof b.context_similarity === 'number', true, typeof b.context_similarity);
  });

  // ─── REPUTATION ECONOMICS (814-821) ───────────────────────

  await safeTest('814 trust-decay-curve', async () => {
    const r = await post('trust-decay-curve', {
      initial_trust: 100,
      hours_elapsed: 168,
      half_life: 168
    });
    check('814 trust-decay 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('814 current = 50', b.current === 50, 50, b.current);
    check('814 decay_rate = 0.5', b.decay_rate === 0.5, 0.5, b.decay_rate);
    check('814 needs_refresh false (50 is not < 50)', b.needs_refresh === false, false, b.needs_refresh);
  });

  await safeTest('815 credibility-arbitrage', async () => {
    const r = await post('credibility-arbitrage', {
      entity_a: { code: 90, writing: 30, design: 50 },
      entity_b: { code: 40, writing: 85, design: 50 }
    });
    check('815 cred-arb 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('815 opportunities >= 2', b.opportunities.length >= 2, true, b.opportunities?.length);
    check('815 code gap = 50', b.opportunities.find(o => o.domain === 'code')?.gap === 50, 50, b.opportunities?.find(o => o.domain === 'code')?.gap);
    check('815 writing gap = 55', b.opportunities.find(o => o.domain === 'writing')?.gap === 55, 55, b.opportunities?.find(o => o.domain === 'writing')?.gap);
  });

  await safeTest('816 reputation-stake-escrow', async () => {
    const r = await post('reputation-stake-escrow', {
      reputation_score: 80,
      commitment_risk: 0.6,
      duration_days: 14
    });
    check('816 stake-escrow 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('816 stake_required is number', typeof b.stake_required === 'number' && b.stake_required > 0, true, b.stake_required);
    check('816 projected_gain < projected_loss', b.projected_gain < b.projected_loss, true, `${b.projected_gain} < ${b.projected_loss}`);
  });

  await safeTest('817 influence-liquidity-score', async () => {
    const r = await post('influence-liquidity-score', {
      connections: 200,
      active_connections: 80,
      response_rate: 0.7
    });
    check('817 influence 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('817 liquidity_score = 0.28', b.liquidity_score === 0.28, 0.28, b.liquidity_score);
    check('817 transferability = medium', b.transferability === 'medium', 'medium', b.transferability);
  });

  await safeTest('818 sybil-resistance-proof', async () => {
    const r = await post('sybil-resistance-proof', {
      signals: [
        { type: 'interaction', unique_peers: 20 },
        { type: 'creation', unique_content: 15 },
        { type: 'verification', unique_peers: 10 }
      ]
    });
    check('818 sybil 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('818 likely_sybil false', b.likely_sybil === false, false, b.likely_sybil);
    check('818 uniqueness_score > 0.3', b.uniqueness_score > 0.3, true, b.uniqueness_score);
    check('818 signals_analyzed = 3', b.signals_analyzed === 3, 3, b.signals_analyzed);
  });

  await safeTest('819 trust-triangulation', async () => {
    const r = await post('trust-triangulation', {
      a_trusts_b: 0.9,
      b_trusts_c: 0.8,
      a_trusts_c: 0.3
    });
    check('819 trust-tri 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('819 implied = 0.72', b.implied_trust === 0.72, 0.72, b.implied_trust);
    check('819 inconsistency = 0.42', b.inconsistency === 0.42, 0.42, b.inconsistency);
    check('819 suspicious true', b.suspicious === true, true, b.suspicious);
  });

  await safeTest('820 social-collateral-ratio', async () => {
    const r = await post('social-collateral-ratio', {
      earned_reputation: 40,
      leveraged_reputation: 60
    });
    check('820 social-collateral 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('820 ratio < 1', b.ratio < 1, true, b.ratio);
    check('820 over_leveraged true', b.over_leveraged === true, true, b.over_leveraged);
    check('820 risk_level = warning', b.risk_level === 'warning', 'warning', b.risk_level);
  });

  await safeTest('821 merit-half-life', async () => {
    const r = await post('merit-half-life', {
      accomplishments: [
        { name: 'shipped v2', age_days: 10, domain: 'engineering' },
        { name: 'viral tweet', age_days: 60, domain: 'social' },
        { name: 'published paper', age_days: 200, domain: 'research' }
      ]
    });
    check('821 merit 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('821 accomplishments sorted by present_value', b.accomplishments[0].present_value >= b.accomplishments[b.accomplishments.length - 1].present_value, true, b.accomplishments?.map(a => a.present_value));
    check('821 engineering hl = 180', b.accomplishments.find(a => a.domain === 'engineering')?.half_life_days === 180, 180, 'check');
    check('821 social hl = 90', b.accomplishments.find(a => a.domain === 'social')?.half_life_days === 90, 90, 'check');
  });

  // ─── ADVERSARIAL THINKING (822-828) ───────────────────────

  await safeTest('822 threat-model-generator', async () => {
    const r = await post('threat-model-generator', {
      target: 'e-commerce platform',
      system_components: ['auth', 'payment', 'database', 'frontend', 'api']
    });
    check('822 threat-model 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('822 attack_paths has 5', b.attack_paths.length === 5, 5, b.attack_paths?.length);
    check('822 easiest_path = frontend', b.easiest_path.target === 'frontend', 'frontend', b.easiest_path?.target);
    check('822 each has effort', b.attack_paths.every(a => typeof a.effort === 'number'), true, 'effort numbers');
  });

  await safeTest('823 counter-argument-generator', async () => {
    const r = await post('counter-argument-generator', {
      proposal: 'We should migrate to microservices to improve scalability and team autonomy'
    });
    check('823 counter-arg 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('823 counter_arguments has 5', b.counter_arguments.length === 5, 5, b.counter_arguments?.length);
    check('823 each has strength', b.counter_arguments.every(a => typeof a.strength === 'number'), true, 'strengths');
  });

  await safeTest('824 chaos-blast-radius', async () => {
    // Graph: if A deps [B], removing B affects A (reverse traversal)
    const r = await post('chaos-blast-radius', {
      dependency_graph: { auth: ['api'], api: ['database'], frontend: ['api'], mobile: ['api'], database: [] },
      failure_point: 'database'
    });
    check('824 blast-radius 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('824 affected includes api', b.affected.includes('api'), true, b.affected);
    check('824 affected includes frontend', b.affected.includes('frontend'), true, b.affected);
    check('824 blast_radius >= 4', b.blast_radius >= 4, true, b.blast_radius);
  });

  await safeTest('825 pre-mortem-autopsy', async () => {
    const r = await post('pre-mortem-autopsy', {
      plan: 'Launch new feature with tight deadline and small team, requires external API integration',
      team_size: 2
    });
    check('825 pre-mortem 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('825 has failure_narrative', typeof b.failure_narrative === 'string', true, typeof b.failure_narrative);
    check('825 root_causes has items', b.root_causes.length > 0, true, b.root_causes?.length);
  });

  await safeTest('826 weakest-link-finder', async () => {
    const r = await post('weakest-link-finder', {
      chain: [
        { name: 'auth', strength: 95 },
        { name: 'api', strength: 70 },
        { name: 'database', strength: 90 },
        { name: 'frontend', strength: 40 }
      ]
    });
    check('826 weakest-link 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('826 weakest = frontend', b.weakest_link.name === 'frontend', 'frontend', b.weakest_link?.name);
    check('826 exploitability = 0.6', b.weakest_link.exploitability === 0.6, 0.6, b.weakest_link?.exploitability);
  });

  await safeTest('827 security-persona-model', async () => {
    const r = await post('security-persona-model', {
      attack_surface: 'critical infrastructure government system'
    });
    check('827 sec-persona 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('827 persona = APT Group', b.persona.name === 'APT Group', 'APT Group', b.persona?.name);
    check('827 defense_priority = critical', b.defense_priority === 'critical', 'critical', b.defense_priority);
  });

  await safeTest('828 assumption-stress-test', async () => {
    const r = await post('assumption-stress-test', {
      argument: 'We must scale because growth is certain. Everyone will adopt our product. Revenue will always increase.'
    });
    check('828 stress-test 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('828 has assumptions', b.assumptions.length > 0, true, b.assumptions?.length);
    check('828 most_dangerous exists', b.most_dangerous !== null, true, b.most_dangerous);
  });

  // ─── NARRATIVE INTELLIGENCE (829-836) ─────────────────────

  await safeTest('829 plot-twist-injector', async () => {
    const r = await post('plot-twist-injector', {
      story_state: 'The hero has found a trusted ally and together they quest for the ancient treasure',
      characters: [{ name: 'Hero' }, { name: 'Mentor' }, { name: 'Ally' }]
    });
    check('829 plot-twist 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('829 twist is string', typeof b.twist === 'string', true, b.twist);
    check('829 theme is string', typeof b.theme === 'string', true, b.theme);
    check('829 impact_score 0-1', b.impact_score >= 0 && b.impact_score <= 1, true, b.impact_score);
  });

  await safeTest('830 dramatic-tension-curve', async () => {
    const r = await post('dramatic-tension-curve', {
      events: [
        'The hero begins the journey',
        'First conflict emerges',
        'Danger and crisis at the gates',
        'The climactic battle with death on the line',
        'Peace is restored after the victory'
      ]
    });
    check('830 tension-curve 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('830 curve has 5', b.curve.length === 5, 5, b.curve?.length);
    check('830 peak exists', b.peak !== null, true, b.peak);
    check('830 tension values 0-1', b.curve.every(c => c.tension >= 0 && c.tension <= 1), true, b.curve?.map(c => c.tension));
  });

  await safeTest('831 character-arc-trajectory', async () => {
    const r = await post('character-arc-trajectory', {
      decisions: [
        { action: 'sacrifice for others', growth: 0.3 },
        { action: 'forgive the enemy', growth: 0.2 },
        { action: 'accept responsibility', growth: 0.15 }
      ],
      starting_state: 'selfish'
    });
    check('831 char-arc 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('831 arc_type = growth or redemption', ['growth', 'redemption'].includes(b.arc_type), 'growth/redemption', b.arc_type);
    check('831 total_growth = 0.65', b.total_growth === 0.65, 0.65, b.total_growth);
    check('831 decisions_analyzed = 3', b.decisions_analyzed === 3, 3, b.decisions_analyzed);
  });

  await safeTest('832 chekhov-gun-tracker', async () => {
    const r = await post('chekhov-gun-tracker', {
      planted_details: ['mysterious key', 'old map', 'broken compass', 'sealed letter'],
      resolved_details: ['mysterious key', 'old map']
    });
    check('832 chekhov 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('832 planted = 4', b.planted === 4, 4, b.planted);
    check('832 resolved = 2', b.resolved === 2, 2, b.resolved);
    check('832 unresolved has 2', b.unresolved.length === 2, 2, b.unresolved?.length);
    check('832 broken_promises = 2', b.broken_promises === 2, 2, b.broken_promises);
  });

  await safeTest('833 unreliable-narrator-score', async () => {
    const r = await post('unreliable-narrator-score', {
      account: 'I was right about everything, they were wrong. I always make the best decisions. Everyone knows I had to do it. It was absolutely not my fault.'
    });
    check('833 unreliable 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('833 reliability < 0.4', b.reliability < 0.4, true, b.reliability);
    check('833 verdict = unreliable', b.verdict === 'unreliable', 'unreliable', b.verdict);
    check('833 self_serving > 0', b.self_serving > 0, true, b.self_serving);
    check('833 superlatives > 0', b.superlatives > 0, true, b.superlatives);
  });

  await safeTest('834 story-beat-decomposer', async () => {
    const r = await post('story-beat-decomposer', {
      text: 'The village was peaceful. A stranger arrived with dark news. Preparations began for war. Allies gathered from distant lands. The battle raged. The hero fell. But rose again to triumph. Peace returned at last.'
    });
    check('834 story-beat 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('834 beat_count >= 5', b.beat_count >= 5, true, b.beat_count);
    check('834 structure_detected = complete_arc', b.structure_detected === 'complete_arc', 'complete_arc', b.structure_detected);
    check('834 first beat = setup', b.beats[0].type === 'setup', 'setup', b.beats[0]?.type);
  });

  await safeTest('835 emotional-resonance-calc', async () => {
    const r = await post('emotional-resonance-calc', {
      scene: 'The hero laughed with joy as they celebrated the victory, but felt a twinge of sadness for those lost in the conflict.',
      audience_type: 'general'
    });
    check('835 emo-resonance 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('835 dominant exists', b.dominant && typeof b.dominant.emotion === 'string', true, b.dominant?.emotion);
    check('835 activated_emotions has items', b.activated_emotions.length > 0, true, b.activated_emotions?.length);
    check('835 resonance_score 0-1', b.resonance_score >= 0 && b.resonance_score <= 1, true, b.resonance_score);
  });

  await safeTest('836 antagonist-motivation-engine', async () => {
    const r = await post('antagonist-motivation-engine', {
      conflict: 'The villain seeks to protect their family from a prophecy that predicts destruction, willing to sacrifice anything to prevent it.'
    });
    check('836 antagonist 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('836 sympathetic_motivation exists', typeof b.sympathetic_motivation === 'string', true, b.sympathetic_motivation);
    check('836 moral_complexity 0-1', b.moral_complexity >= 0 && b.moral_complexity <= 1, true, b.moral_complexity);
    check('836 motivation mentions saving/protecting', b.sympathetic_motivation.includes('saving'), true, b.sympathetic_motivation);
  });

  // ─── SENSORY SIMULATION (837-843) ─────────────────────────

  await safeTest('837 synesthesia-mapper', async () => {
    const r = await post('synesthesia-mapper', {
      input_type: 'color',
      input_value: '#FF0000',
      output_type: 'pitch'
    });
    check('837 synesthesia 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('837 has mapped_value', typeof b.mapped_value === 'string', true, b.mapped_value);
    check('837 confidence 0-1', b.confidence >= 0 && b.confidence <= 1, true, b.confidence);
  });

  await safeTest('838 signal-noise-separator', async () => {
    // Use data where outliers are clearly >1 std dev from mean
    const r = await post('signal-noise-separator', {
      data: [1, 1, 1, 1, 1, 1, 1, 1, 100, 1],
      noise_threshold: 1
    });
    check('838 signal-noise 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('838 signal includes 100', b.signal.includes(100), true, b.signal);
    check('838 snr is number', typeof b.snr === 'number', true, b.snr);
    check('838 mean is number', typeof b.mean === 'number', true, b.mean);
    check('838 std_dev is number', typeof b.std_dev === 'number', true, b.std_dev);
  });

  await safeTest('839 pattern-pareidolia', async () => {
    const r = await post('pattern-pareidolia', {
      data: [1, 2, 3, 1, 2, 3, 1, 2, 3]
    });
    check('839 pareidolia 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('839 spurious_patterns found', b.spurious_patterns.length > 0, true, b.spurious_patterns?.length);
    check('839 pattern length = 3', b.spurious_patterns[0].length === 3, 3, b.spurious_patterns[0]?.length);
    check('839 data_points = 9', b.data_points === 9, 9, b.data_points);
  });

  await safeTest('840 sensory-overload-filter', async () => {
    const r = await post('sensory-overload-filter', {
      streams: [
        { name: 'alerts', priority: 10, volume: 50 },
        { name: 'metrics', priority: 5, volume: 80 },
        { name: 'logs', priority: 2, volume: 200 }
      ],
      budget: 100
    });
    check('840 overload-filter 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('840 allocation has 3', b.allocation.length === 3, 3, b.allocation?.length);
    check('840 alerts gets full allocation', b.allocation[0].allocated === 50, 50, b.allocation[0]?.allocated);
    check('840 budget = 100', b.budget === 100, 100, b.budget);
  });

  await safeTest('841 phantom-signal-detector', async () => {
    const r = await post('phantom-signal-detector', {
      channels: [[0.1, 0.05, 0.08], [0.06, 0.07, 0.09], [0.05, 0.04, 0.06]]
    });
    check('841 phantom 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('841 channels_fused = 3', b.channels_fused === 3, 3, b.channels_fused);
    check('841 phantom_signals is array', Array.isArray(b.phantom_signals), true, typeof b.phantom_signals);
  });

  await safeTest('842 perceptual-contrast-boost', async () => {
    const r = await post('perceptual-contrast-boost', {
      object_a: { color: 'red', size: 10, shape: 'circle' },
      object_b: { color: 'blue', size: 10, shape: 'square' }
    });
    check('842 contrast-boost 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('842 differences has 2 (color+shape)', b.differences.length === 2, 2, b.differences?.length);
    check('842 total_fields = 3', b.total_fields === 3, 3, b.total_fields);
  });

  await safeTest('843 edge-detection-abstract', async () => {
    const r = await post('edge-detection-abstract', {
      data: [1, 1, 1, 10, 10, 10, 2, 2, 20, 20],
      sensitivity: 3
    });
    check('843 edge-detect 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('843 edges found', b.edge_count >= 2, true, b.edge_count);
    check('843 sharpest has magnitude', typeof b.sharpest?.magnitude === 'number', true, b.sharpest?.magnitude);
    check('843 sharpest magnitude = 18', b.sharpest.magnitude === 18, 18, b.sharpest?.magnitude);
  });

  // ─── GROUP ANALYSIS (844-853) ─────────────────────────────

  await safeTest('844 tribe-formation-seed', async () => {
    const r = await post('tribe-formation-seed', {
      individuals: [
        { id: 'a', values: ['speed', 'innovation'] },
        { id: 'b', values: ['quality', 'reliability'] },
        { id: 'c', values: ['speed', 'innovation'] },
        { id: 'd', values: ['quality', 'reliability'] },
        { id: 'e', values: ['creativity'] }
      ]
    });
    check('844 tribe 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('844 tribe_count = 3', b.tribe_count === 3, 3, b.tribe_count);
    check('844 a and c same tribe', b.tribes.find(t => t.members.includes('a'))?.members.includes('c'), true, 'a+c together');
  });

  await safeTest('845 initiation-rite-generator', async () => {
    const r = await post('initiation-rite-generator', {
      core_values: ['excellence', 'resilience', 'collaboration'],
      difficulty: 'hard'
    });
    check('845 initiation 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('845 rite has stages', b.rite.stages.length === 4, 4, b.rite?.stages?.length);
    check('845 challenges = 3', b.rite.challenges.length === 3, 3, b.rite?.challenges?.length);
    check('845 difficulty = hard', b.rite.difficulty === 'hard', 'hard', b.rite?.difficulty);
  });

  await safeTest('846 totem-synthesizer', async () => {
    const r = await post('totem-synthesizer', {
      values: ['innovation', 'speed', 'quality'],
      history: ['shipped v1', 'grew 10x'],
      language_patterns: ['we ship fast']
    });
    check('846 totem 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('846 totem has symbol', typeof b.totem.symbol === 'string', true, b.totem?.symbol);
    check('846 totem has motto', typeof b.totem.motto === 'string', true, b.totem?.motto);
    check('846 identity_strength > 0', b.identity_strength > 0, true, b.identity_strength);
  });

  await safeTest('847 schism-predictor', async () => {
    const r = await post('schism-predictor', {
      opinions: [
        { agent: 'a', position: 0.1 },
        { agent: 'b', position: 0.15 },
        { agent: 'c', position: 0.85 },
        { agent: 'd', position: 0.9 }
      ]
    });
    check('847 schism 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('847 schism_likely true', b.schism_likely === true, true, b.schism_likely);
    check('847 gap_size = 0.7', b.gap_size === 0.7, 0.7, b.gap_size);
    check('847 factions a+b vs c+d', b.factions.a.length === 2 && b.factions.b.length === 2, true, JSON.stringify(b.factions));
  });

  await safeTest('848 sacred-value-detector', async () => {
    const r = await post('sacred-value-detector', {
      discourse: 'User privacy is a fundamental right that we will never compromise on, no matter what. It is non-negotiable and sacred to our mission.'
    });
    check('848 sacred 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('848 sacred_values_detected true', b.sacred_values_detected === true, true, b.sacred_values_detected);
    check('848 markers include never compromise', b.markers.includes('never compromise'), true, b.markers);
    check('848 intensity > 0', b.intensity > 0, true, b.intensity);
  });

  await safeTest('849 cooperation-stability-index', async () => {
    const r = await post('cooperation-stability-index', {
      cooperation_payoff: 3,
      defection_payoff: 5,
      rounds_remaining: 100
    });
    check('849 coop-stability 200', r.status === 200, 200, r.status);
    const b = r.body;
    // With bug fix: shadow_of_future = (1-1/100) = 0.99, temptation/3 = 0.56 => cooperate
    check('849 prediction = cooperate (many rounds)', b.prediction === 'cooperate', 'cooperate', b.prediction);
    check('849 temptation_ratio > 1', b.temptation_ratio > 1, true, b.temptation_ratio);
  });

  await safeTest('850 group-polarization-drift', async () => {
    const r = await post('group-polarization-drift', {
      positions: [0.6, 0.65, 0.7, 0.55, 0.75],
      interaction_rounds: 10
    });
    check('850 polarization 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('850 drift_direction = toward_extreme_high', b.drift_direction === 'toward_extreme_high', 'toward_extreme_high', b.drift_direction);
    check('850 drifted_positions all >= original', b.drifted_positions.every((d, i) => d >= b.original_positions[i]), true, 'all drifted up');
  });

  await safeTest('851 free-rider-detector', async () => {
    const r = await post('free-rider-detector', {
      contributions: [
        { agent: 'a', contributed: 50 },
        { agent: 'b', contributed: 2 },
        { agent: 'c', contributed: 45 },
        { agent: 'd', contributed: 1 }
      ],
      threshold: 0.3
    });
    check('851 free-rider 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('851 rider_count = 2', b.rider_count === 2, 2, b.rider_count);
    check('851 free_riders includes b and d', b.free_riders.map(f => f.agent).sort().join(',') === 'b,d', 'b,d', b.free_riders?.map(f => f.agent).sort().join(','));
  });

  await safeTest('852 ritual-frequency-optimizer', async () => {
    const r = await post('ritual-frequency-optimizer', {
      rituals: [
        { name: 'standup', frequency_days: 1, value: 5, cost: 2 },
        { name: 'retro', frequency_days: 14, value: 8, cost: 4 },
        { name: 'all-hands', frequency_days: 30, value: 3, cost: 10 }
      ]
    });
    check('852 ritual-freq 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('852 all-hands adjustment = less_frequent', b.rituals.find(r => r.name === 'all-hands')?.adjustment === 'less_frequent', 'less_frequent', b.rituals?.find(r => r.name === 'all-hands')?.adjustment);
    check('852 has total_cost_per_month', typeof b.total_cost_per_month === 'number', true, typeof b.total_cost_per_month);
  });

  await safeTest('853 coalition-stability-index', async () => {
    const r = await post('coalition-stability-index', {
      groups: ['faction_a', 'faction_b'],
      shared_interests: 8,
      competing_interests: 2
    });
    check('853 coalition 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('853 stability_index = 0.8', b.stability_index === 0.8, 0.8, b.stability_index);
    check('853 prediction = durable', b.prediction === 'durable', 'durable', b.prediction);
  });

  // ─── WARFARE / STRATEGIC (854-861) ────────────────────────

  await safeTest('854 fog-of-war-simulator', async () => {
    const r = await post('fog-of-war-simulator', {
      units: [
        { id: 'scout', x: 0, y: 0, team: 1 },
        { id: 'sniper', x: 2, y: 2, team: 1 },
        { id: 'enemy1', x: 1, y: 1, team: 2 },
        { id: 'enemy2', x: 10, y: 10, team: 2 }
      ],
      sight_range: 3
    });
    check('854 fog-of-war 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('854 scout sees enemy1', b.visibility.scout?.includes('enemy1'), true, b.visibility?.scout);
    check('854 scout does not see enemy2', !b.visibility.scout?.includes('enemy2'), true, b.visibility?.scout);
    check('854 sight_range = 3', b.sight_range === 3, 3, b.sight_range);
  });

  await safeTest('855 supply-line-vulnerability', async () => {
    const r = await post('supply-line-vulnerability', {
      nodes: ['base', 'depot', 'front'],
      edges: [
        { from: 'base', to: 'depot', capacity: 100 },
        { from: 'depot', to: 'front', capacity: 20 }
      ],
      target: 'front'
    });
    check('855 supply-line 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('855 bottleneck capacity = 20', b.min_cut_capacity === 20, 20, b.min_cut_capacity);
    check('855 bottleneck from depot', b.bottleneck.from === 'depot', 'depot', b.bottleneck?.from);
  });

  await safeTest('856 bluff-credibility-scorer', async () => {
    const r = await post('bluff-credibility-scorer', {
      history: [
        { claimed: 'strong', actual: 'strong' },
        { claimed: 'strong', actual: 'weak' },
        { claimed: 'strong', actual: 'weak' },
        { claimed: 'weak', actual: 'strong' }
      ]
    });
    check('856 bluff 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('856 honesty_rate = 0.25', b.honesty_rate === 0.25, 0.25, b.honesty_rate);
    check('856 bluff_rate = 0.75', b.bluff_rate === 0.75, 0.75, b.bluff_rate);
    check('856 note mentions frequently', b.note.includes('Frequently'), true, b.note);
  });

  await safeTest('857 pincer-movement-planner', async () => {
    const r = await post('pincer-movement-planner', {
      friendlies: [{ id: 'f1', x: 0, y: 3 }, { id: 'f2', x: 0, y: 8 }],
      enemies: [{ id: 'e1', x: 5, y: 5 }],
      grid_size: 10
    });
    check('857 pincer 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('857 maneuver = pincer', b.maneuver === 'pincer', 'pincer', b.maneuver);
    check('857 paths has 2', b.paths.length === 2, 2, b.paths?.length);
    check('857 flanks are different', b.paths[0].flank !== b.paths[1].flank, true, b.paths?.map(p => p.flank));
  });

  await safeTest('858 attrition-war-projector', async () => {
    const r = await post('attrition-war-projector', {
      side_a: { units: 100, replenish: 5 },
      side_b: { units: 50, replenish: 2 },
      turns: 30
    });
    check('858 attrition 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('858 winner = side_a', b.winner === 'side_a', 'side_a', b.winner);
    check('858 log has entries', b.log.length > 0, true, b.log?.length);
    check('858 final.a > final.b', b.final.a > b.final.b, true, `a=${b.final?.a} b=${b.final?.b}`);
  });

  await safeTest('859 resource-denial-analyzer', async () => {
    const r = await post('resource-denial-analyzer', {
      resources: [
        { name: 'fuel_depot', value: 80, on_path: true },
        { name: 'ammo_cache', value: 50, on_path: true },
        { name: 'hospital', value: 30, on_path: false }
      ],
      enemy_path: 'north'
    });
    check('859 resource-denial 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('859 deny_order starts with fuel_depot', b.deny_order[0] === 'fuel_depot', 'fuel_depot', b.deny_order?.[0]);
    check('859 value_denied = 130', b.value_denied === 130, 130, b.value_denied);
    check('859 enemy_impact = 195', b.enemy_impact === 195, 195, b.enemy_impact);
  });

  await safeTest('860 deterrence-stability-index', async () => {
    const r = await post('deterrence-stability-index', {
      actors: [
        { id: 'A', first_strike: 80, second_strike: 60 },
        { id: 'B', first_strike: 70, second_strike: 50 }
      ]
    });
    check('860 deterrence 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('860 stable is boolean', typeof b.stable === 'boolean', true, typeof b.stable);
    check('860 index is number', typeof b.index === 'number', true, typeof b.index);
  });

  await safeTest('861 nash-equilibrium-finder', async () => {
    const r = await post('nash-equilibrium-finder', {
      payoff_matrix: [[3, 0], [5, 1]]
    });
    check('861 nash 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('861 equilibria found', b.count >= 1, true, b.count);
    check('861 equilibrium at (1,0)', b.equilibria.some(e => e.row === 1 && e.col === 0), true, JSON.stringify(b.equilibria));
  });

  // ─── ECOSYSTEM MODELING (862-868) ─────────────────────────

  await safeTest('862 carrying-capacity-estimator', async () => {
    const r = await post('carrying-capacity-estimator', {
      resources: 1000,
      consumption_rate: 10,
      regeneration_rate: 8
    });
    check('862 carrying-cap 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('862 carrying_capacity = 800', b.carrying_capacity === 800, 800, b.carrying_capacity);
    check('862 sustainable = false', b.sustainable === false, false, b.sustainable);
    check('862 overshoot = 25%', b.overshoot === '25%', '25%', b.overshoot);
    check('862 time_to_depletion = 500', b.time_to_depletion === 500, 500, b.time_to_depletion);
  });

  await safeTest('863 trophic-cascade-simulator', async () => {
    const r = await post('trophic-cascade-simulator', {
      food_web: {
        grass: { pop: 1000, eaten_by: ['rabbit'] },
        rabbit: { pop: 100, eaten_by: ['fox'] },
        fox: { pop: 10, eaten_by: [] }
      },
      removed_species: 'fox',
      generations: 5
    });
    check('863 trophic 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('863 removed = fox', b.removed_species === 'fox', 'fox', b.removed_species);
    check('863 rabbit grew (no predator)', b.cascade_effect.find(c => c.species === 'rabbit')?.now > 100, true, b.cascade_effect?.find(c => c.species === 'rabbit')?.now);
    check('863 timeline has entries', b.timeline.length > 0, true, b.timeline?.length);
  });

  await safeTest('864 keystone-species-detector', async () => {
    const r = await post('keystone-species-detector', {
      food_web: {
        plankton: { deps: [] },
        fish: { deps: ['plankton'] },
        shark: { deps: ['fish'] },
        seabird: { deps: ['fish'] }
      }
    });
    check('864 keystone 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('864 keystone = plankton', b.keystone.species === 'plankton', 'plankton', b.keystone?.species);
    check('864 plankton impact >= 3', b.keystone.removal_impact >= 3, true, b.keystone?.removal_impact);
  });

  await safeTest('865 invasive-spread-modeler', async () => {
    const r = await post('invasive-spread-modeler', {
      grid_size: 10,
      start_position: { x: 5, y: 5 },
      reproduction_rate: 0.5,
      steps: 10
    });
    check('865 invasive 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('865 final_coverage > 1', b.final_coverage > 1, true, b.final_coverage);
    check('865 total_cells = 100', b.total_cells === 100, 100, b.total_cells);
    check('865 timeline has entries', b.timeline.length > 0, true, b.timeline?.length);
  });

  await safeTest('866 biodiversity-index-calculator', async () => {
    const r = await post('biodiversity-index-calculator', {
      species_counts: [100, 100, 100, 100]
    });
    check('866 biodiversity 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('866 shannon_index = ln(4) ~1.386', Math.abs(b.shannon_index - 1.386) < 0.01, '~1.386', b.shannon_index);
    check('866 evenness = 1', b.evenness === 1, 1, b.evenness);
    check('866 species_richness = 4', b.species_richness === 4, 4, b.species_richness);
    check('866 classification = moderate_diversity', b.classification === 'moderate_diversity', 'moderate_diversity', b.classification);
  });

  await safeTest('867 symbiosis-network-analyzer', async () => {
    const r = await post('symbiosis-network-analyzer', {
      relationships: [
        { a: 'bee', b: 'flower', type: 'mutualism' },
        { a: 'barnacle', b: 'whale', type: 'commensalism' },
        { a: 'flea', b: 'dog', type: 'parasitism' },
        { a: 'clownfish', b: 'anemone', type: 'mutualism' }
      ]
    });
    check('867 symbiosis 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('867 total_species = 8', b.total_species === 8, 8, b.total_species);
    check('867 mutualism = 2', b.by_type.mutualism === 2, 2, b.by_type?.mutualism);
    check('867 health = healthy', b.health === 'healthy', 'healthy', b.health);
  });

  await safeTest('868 terraforming-phase-planner', async () => {
    const r = await post('terraforming-phase-planner', {
      current: { atmosphere: 'toxic', temperature: -50, water: 0 },
      target: { atmosphere: 'breathable', temperature: 20, water: 70 }
    });
    check('868 terraforming 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('868 total_phases = 3', b.total_phases === 3, 3, b.total_phases);
    check('868 feasibility = achievable', b.feasibility === 'achievable', 'achievable', b.feasibility);
  });

  // ─── INFORMATION PROPAGATION (869-874) ────────────────────

  await safeTest('869 idea-virality-predictor', async () => {
    const r = await post('idea-virality-predictor', {
      message: 'Free AI tools for everyone',
      emotional_valence: 0.9,
      simplicity: 0.8,
      novelty: 0.7
    });
    check('869 virality 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('869 r0 > 2', b.r0 > 2, true, b.r0);
    check('869 viral = true', b.viral === true, true, b.viral);
  });

  await safeTest('870 belief-propagation-simulator', async () => {
    const r = await post('belief-propagation-simulator', {
      agents: ['skeptic', 'believer', 'neutral', 'supporter', 'doubter'],
      initial_beliefs: [0.1, 0.9, 0.5, 0.8, 0.2],
      rounds: 20
    });
    check('870 belief-prop 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('870 converged boolean', typeof b.converged === 'boolean', true, typeof b.converged);
    check('870 final_beliefs has 5', b.final_beliefs.length === 5, 5, b.final_beliefs?.length);
  });

  await safeTest('871 counter-narrative-generator', async () => {
    const r = await post('counter-narrative-generator', {
      narrative: {
        claim: 'AI will always replace all human jobs inevitably',
        evidence: 'Historical automation trends',
        frame: 'Progress'
      }
    });
    check('871 counter-narrative 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('871 has counter', typeof b.counter === 'object', true, typeof b.counter);
    check('871 effectiveness 0-1', b.effectiveness >= 0 && b.effectiveness <= 1, true, b.effectiveness);
    check('871 detected overgeneralization', b.counter.undermines.includes('overgeneralization_detected'), true, b.counter?.undermines);
  });

  await safeTest('872 memetic-immunity-profiler', async () => {
    const r = await post('memetic-immunity-profiler', {
      existing_beliefs: ['efficiency is paramount', 'data drives decisions', 'we never ship without testing'],
      target_idea: 'ship fast and break things, testing is optional'
    });
    check('872 memetic 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('872 immunity_level > 0', b.immunity_level > 0, true, b.immunity_level);
    check('872 susceptible is boolean', typeof b.susceptible === 'boolean', true, typeof b.susceptible);
  });

  await safeTest('873 overton-window-mapper', async () => {
    const r = await post('overton-window-mapper', {
      positions: [
        { name: 'radical_left', sentiment: -0.8 },
        { name: 'progressive', sentiment: -0.2 },
        { name: 'centrist', sentiment: 0.1 },
        { name: 'conservative', sentiment: 0.2 },
        { name: 'radical_right', sentiment: 0.9 }
      ]
    });
    check('873 overton 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('873 inside has mainstream', b.inside.length >= 2, true, b.inside?.length);
    check('873 outside has radicals', b.outside.length >= 2, true, b.outside?.length);
  });

  await safeTest('874 echo-chamber-detector', async () => {
    const r = await post('echo-chamber-detector', {
      communications: [
        { source: 'group_a', sentiment: 0.8 },
        { source: 'group_a', sentiment: 0.85 },
        { source: 'group_a', sentiment: 0.82 },
        { source: 'group_b', sentiment: -0.5 },
        { source: 'group_b', sentiment: 0.8 }
      ]
    });
    check('874 echo-chamber 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('874 echo_chambers >= 1', b.echo_chambers >= 1, true, b.echo_chambers);
    check('874 total_groups = 2', b.total_groups === 2, 2, b.total_groups);
    check('874 group_a is echo chamber', b.groups.find(g => g.source === 'group_a')?.is_echo_chamber === true, true, 'group_a echo');
  });

  // ─── DREAM / STATE MANAGEMENT (875-881) ───────────────────

  await safeTest('875 dream-level-stabilizer', async () => {
    const r = await post('dream-level-stabilizer', {
      levels: [
        { depth: 1, coherence: 0.9 },
        { depth: 2, coherence: 0.4 },
        { depth: 3, coherence: 0.1 }
      ]
    });
    check('875 dream-stabilize 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('875 deepest_stable >= 2', b.deepest_stable >= 2, true, b.deepest_stable);
    check('875 collapse_risk true', b.collapse_risk === true, true, b.collapse_risk);
    check('875 depth3 needs totem', b.levels.find(l => l.depth === 3)?.anchor_type === 'totem', 'totem', b.levels?.find(l => l.depth === 3)?.anchor_type);
  });

  await safeTest('876 nightmare-pattern-detector', async () => {
    const r = await post('nightmare-pattern-detector', {
      events: [
        { type: 'chase through dark corridors' },
        { type: 'falling from a height' },
        { type: 'trapped in a small room' },
        { type: 'peaceful meadow' }
      ]
    });
    check('876 nightmare 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('876 threat_events >= 3', b.threat_events >= 3, true, b.threat_events);
    check('876 escalating true', b.escalating === true, true, b.escalating);
    check('876 classification = nightmare', b.classification === 'nightmare', 'nightmare', b.classification);
  });

  await safeTest('877 dream-exit-pathfinder', async () => {
    const r = await post('dream-exit-pathfinder', {
      levels: 4,
      current_level: 3,
      hazards: [{ level: 2, type: 'guardian' }]
    });
    check('877 dream-exit 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('877 exit_path has 3 steps', b.exit_path.length === 3, 3, b.exit_path?.length);
    check('877 total_levels = 3', b.total_levels_to_surface === 3, 3, b.total_levels_to_surface);
    check('877 hazard at level 2', b.exit_path.find(p => p.level === 2)?.safe === false, false, 'level 2 unsafe');
  });

  await safeTest('878 shared-unconscious-merger', async () => {
    const r = await post('shared-unconscious-merger', {
      symbols_a: ['water', 'mountain', 'door', 'key'],
      symbols_b: ['water', 'fire', 'door', 'bridge']
    });
    check('878 unconscious 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('878 shared has water+door', b.shared_symbols.includes('water') && b.shared_symbols.includes('door'), true, b.shared_symbols);
    check('878 unique_to_a has mountain+key', b.unique_to_a.length === 2, 2, b.unique_to_a?.length);
    check('878 dream_space = stable', b.dream_space === 'stable', 'stable', b.dream_space);
  });

  await safeTest('879 lucid-trigger-calibrator', async () => {
    const r = await post('lucid-trigger-calibrator', {
      triggers: [
        { type: 'text_anomaly', strength: 0.5 },
        { type: 'gravity_shift', strength: 0.8 },
        { type: 'mirror_check', strength: 0.3 }
      ],
      dreamer_profile: { awareness: 0.6, experience: 'advanced' }
    });
    check('879 lucid 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('879 best_trigger = gravity_shift', b.best_trigger.type === 'gravity_shift', 'gravity_shift', b.best_trigger?.type);
    check('879 lucidity_chance > 0.5', b.lucidity_chance > 0.5, true, b.lucidity_chance);
  });

  await safeTest('880 dream-time-dilation-calculator', async () => {
    const r = await post('dream-time-dilation-calculator', {
      real_seconds: 60,
      depth: 2
    });
    check('880 time-dilation 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('880 multiplier = 400 (20^2)', b.total_multiplier === 400, 400, b.total_multiplier);
    check('880 dream_seconds = 24000', b.dream_seconds === 24000, 24000, b.dream_seconds);
    check('880 dream_hours = 6.67', Math.abs(b.dream_hours - 6.67) < 0.01, '~6.67', b.dream_hours);
    check('880 breakdown has 2 levels', b.breakdown.length === 2, 2, b.breakdown?.length);
  });

  await safeTest('881 dream-architect-blueprint', async () => {
    const r = await post('dream-architect-blueprint', {
      rooms: [
        { id: 'lobby', shape: 'impossible_stairs' },
        { id: 'vault', shape: 'penrose_triangle' },
        { id: 'escape', shape: 'normal' }
      ],
      connections: [
        { from: 'lobby', to: 'vault', type: 'door' },
        { from: 'vault', to: 'escape', type: 'window' }
      ],
      gravity_rules: { default: 'down', overrides: { lobby: 'shifting' } }
    });
    check('881 dream-blueprint 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('881 paradox_count = 2', b.paradox_count === 2, 2, b.paradox_count);
    check('881 complexity_score = 6', b.complexity_score === 6, 6, b.complexity_score);
    check('881 stability = unstable', b.stability === 'unstable', 'unstable', b.stability);
  });

  // ─── PROCESS OPTIMIZATION / BUREAUCRACY (882-892) ─────────

  await safeTest('882 loophole-scanner', async () => {
    const r = await post('loophole-scanner', {
      rules: [
        { id: 1, condition: 'age > 18', action: 'allow' },
        { id: 2, condition: 'age < 18', action: 'deny' }
      ]
    });
    check('882 loophole 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('882 loopholes found', b.loopholes.length > 0, true, b.loopholes?.length);
    check('882 has boundary_gap', b.loopholes.some(l => l.type === 'boundary_gap'), true, b.loopholes?.map(l => l.type));
    check('882 exploitable true', b.exploitable === true, true, b.exploitable);
  });

  await safeTest('883 red-tape-critical-path', async () => {
    const r = await post('red-tape-critical-path', {
      process: [
        { name: 'apply', days: 1, parallel: false },
        { name: 'background_check', days: 7, parallel: false },
        { name: 'interview', days: 2, parallel: true },
        { name: 'reference_check', days: 3, parallel: true },
        { name: 'offer', days: 1, parallel: false }
      ]
    });
    check('883 red-tape 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('883 critical_path has sequential', b.critical_path.includes('apply') && b.critical_path.includes('background_check'), true, b.critical_path);
    check('883 parallelizable has interview', b.parallelizable.includes('interview'), true, b.parallelizable);
    check('883 savings > 0', b.savings > 0, true, b.savings);
  });

  await safeTest('884 compliance-shortcut-router', async () => {
    const r = await post('compliance-shortcut-router', {
      goal: 'launch product',
      requirements: [
        { name: 'safety_cert', mandatory: true, effort: 10 },
        { name: 'marketing_review', mandatory: false, effort: 5 },
        { name: 'legal_sign_off', mandatory: true, effort: 3 },
        { name: 'focus_group', mandatory: false, effort: 8 }
      ]
    });
    check('884 compliance 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('884 minimum_path has 2', b.minimum_path.length === 2, 2, b.minimum_path?.length);
    check('884 effort_saved = 13', b.effort_saved === 13, 13, b.effort_saved);
    check('884 minimum_effort = 13', b.minimum_effort === 13, 13, b.minimum_effort);
  });

  await safeTest('885 bureaucratic-deadlock-breaker', async () => {
    const r = await post('bureaucratic-deadlock-breaker', {
      dependencies: [
        { from: 'A', needs: 'B' },
        { from: 'B', needs: 'C' },
        { from: 'C', needs: 'A' }
      ]
    });
    check('885 deadlock 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('885 deadlocks_found >= 1', b.deadlocks_found >= 1, true, b.deadlocks_found);
    check('885 has override_suggestion', b.override_suggestion !== null, true, b.override_suggestion);
  });

  await safeTest('886 appeals-strategy-optimizer', async () => {
    const r = await post('appeals-strategy-optimizer', {
      denial_reason: 'insufficient documentation',
      precedents: [
        { case: 'case_1', outcome: 'overturned', argument: 'procedural_error' },
        { case: 'case_2', outcome: 'upheld', argument: 'weak_evidence' },
        { case: 'case_3', outcome: 'overturned', argument: 'new_evidence' }
      ]
    });
    check('886 appeals 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('886 success_probability ~0.67', Math.abs(b.success_probability - 0.67) < 0.05, '~0.67', b.success_probability);
    check('886 recommended_argument exists', typeof b.recommended_argument === 'string', true, b.recommended_argument);
  });

  await safeTest('887 sunset-clause-exploiter', async () => {
    const r = await post('sunset-clause-exploiter', {
      rules: [
        { name: 'legacy_discount', expires: '2026-06-01' },
        { name: 'old_policy', expires: '2025-01-01' },
        { name: 'grandfather_clause', expires: '2027-12-31' }
      ]
    });
    check('887 sunset 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('887 active_opportunities excludes expired', b.active_opportunities.every(o => o.active), true, 'all active');
    check('887 old_policy not in active', !b.active_opportunities.some(o => o.name === 'old_policy'), true, 'expired excluded');
  });

  await safeTest('888 form-dependency-resolver', async () => {
    const r = await post('form-dependency-resolver', {
      forms: [
        { id: 'F1', requires: [] },
        { id: 'F2', requires: ['F1'] },
        { id: 'F3', requires: ['F1', 'F2'] },
        { id: 'F4', requires: ['F3'] }
      ]
    });
    check('888 form-deps 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('888 order = F1,F2,F3,F4', b.submission_order.join(',') === 'F1,F2,F3,F4', 'F1,F2,F3,F4', b.submission_order?.join(','));
    check('888 total_forms = 4', b.total_forms === 4, 4, b.total_forms);
  });

  await safeTest('889 rubber-stamp-probability', async () => {
    const r = await post('rubber-stamp-probability', {
      office: 'permits',
      day_of_week: 'wednesday',
      queue_position: 2,
      complexity: 'low'
    });
    check('889 rubber-stamp 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('889 approval_probability > 0.7', b.approval_probability > 0.7, true, b.approval_probability);
    check('889 best_day = wednesday', b.best_day === 'wednesday', 'wednesday', b.best_day);
    check('889 recommendation = Submit now', b.recommendation === 'Submit now', 'Submit now', b.recommendation);
  });

  await safeTest('890 jurisdiction-arbitrage-finder', async () => {
    const r = await post('jurisdiction-arbitrage-finder', {
      jurisdictions: [
        { name: 'zone_a', threshold: 100, processing_days: 30 },
        { name: 'zone_b', threshold: 50, processing_days: 10 },
        { name: 'zone_c', threshold: 200, processing_days: 5 }
      ],
      requirement: 75
    });
    check('890 jurisdiction 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('890 eligible has 1 (zone_b)', b.eligible_jurisdictions.length === 1, 1, b.eligible_jurisdictions?.length);
    check('890 fastest = zone_b', b.fastest.name === 'zone_b', 'zone_b', b.fastest?.name);
  });

  await safeTest('891 committee-consensus-predictor', async () => {
    const r = await post('committee-consensus-predictor', {
      members: [
        { name: 'chair', lean: 0.8 },
        { name: 'member_a', lean: 0.5 },
        { name: 'member_b', lean: -0.4 },
        { name: 'member_c', lean: 0.6 },
        { name: 'member_d', lean: 0.3 }
      ],
      proposal_alignment: 0.5
    });
    check('891 committee 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('891 passes is boolean', typeof b.passes === 'boolean', true, typeof b.passes);
    check('891 tally has yes/no/abstain', typeof b.tally.yes === 'number' && typeof b.tally.no === 'number', true, JSON.stringify(b.tally));
    check('891 majority_needed = 3', b.majority_needed === 3, 3, b.majority_needed);
  });

  await safeTest('892 regulatory-capture-scorer', async () => {
    const r = await post('regulatory-capture-scorer', {
      agency: 'FCC',
      industry_ties: [
        { type: 'revolving_door', count: 5 },
        { type: 'lobbying_meetings', count: 40 },
        { type: 'industry_funded_studies', count: 10 }
      ]
    });
    check('892 regulatory 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('892 capture_index > 0.5', b.capture_index > 0.5, true, b.capture_index);
    check('892 classification is captured', b.classification.includes('captured'), true, b.classification);
    check('892 agency = FCC', b.agency === 'FCC', 'FCC', b.agency);
  });

  // ─── SENTIMENT / EMOTIONAL (893-899) ──────────────────────

  await safeTest('893 mood-decay-curve', async () => {
    const r = await post('mood-decay-curve', {
      initial_mood: 100,
      hours_elapsed: 24,
      half_life: 24
    });
    check('893 mood-decay 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('893 current = 50', b.current === 50, 50, b.current);
    check('893 baseline = 50', b.baseline === 50, 50, b.baseline);
  });

  await safeTest('894 empathy-bridge-score', async () => {
    const r = await post('empathy-bridge-score', {
      personality_a: { openness: 0.9, agreeableness: 0.8, conscientiousness: 0.3 },
      personality_b: { openness: 0.3, agreeableness: 0.7, conscientiousness: 0.9 }
    });
    check('894 empathy 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('894 compatibility 0-1', b.compatibility >= 0 && b.compatibility <= 1, true, b.compatibility);
    check('894 adjustments has openness+consciousness', b.adjustments.length >= 2, true, b.adjustments?.length);
  });

  await safeTest('895 catharsis-threshold', async () => {
    const r = await post('catharsis-threshold', {
      tension_events: [
        { intensity: 5 },
        { intensity: 7 },
        { intensity: 8 },
        { intensity: 9 },
        { intensity: 10 }
      ]
    });
    check('895 catharsis 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('895 cumulative_tension = 39', b.cumulative_tension === 39, 39, b.cumulative_tension);
    check('895 threshold = 30', b.threshold === 30, 30, b.threshold);
    check('895 catharsis_imminent true', b.catharsis_imminent === true, true, b.catharsis_imminent);
  });

  await safeTest('896 emotional-contagion-spread', async () => {
    const r = await post('emotional-contagion-spread', {
      network: { a: ['b', 'c'], b: ['a', 'd'], c: ['a'], d: ['b'] },
      seed_agent: 'a',
      seed_mood: 100,
      steps: 5
    });
    check('896 contagion 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('896 final_moods has all agents', Object.keys(b.final_moods).length === 4, 4, Object.keys(b.final_moods)?.length);
    check('896 all moods > 0', Object.values(b.final_moods).every(m => m > 0), true, Object.values(b.final_moods));
    check('896 spread_ratio > 0', b.spread_ratio > 0, true, b.spread_ratio);
  });

  await safeTest('897 sentiment-inertia', async () => {
    const r = await post('sentiment-inertia', {
      text: 'This is absolutely terrible and horrible. Everything is bad and awful. I hate this dreadful situation.'
    });
    check('897 sentiment-inertia 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('897 text_analysis.negative_words > 0', b.text_analysis.negative_words > 0, true, b.text_analysis?.negative_words);
    check('897 text_analysis.dominant = negative', b.text_analysis.dominant === 'negative', 'negative', b.text_analysis?.dominant);
    check('897 current < 0 (negative text)', b.current < 0, true, b.current);
  });

  await safeTest('898 affective-contrast-ratio', async () => {
    const r = await post('affective-contrast-ratio', {
      state_a: { valence: 0.9, arousal: 0.2 },
      state_b: { valence: -0.8, arousal: 0.9 }
    });
    check('898 affective 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('898 contrast_ratio > 1', b.contrast_ratio > 1, true, b.contrast_ratio);
    check('898 dramatic true', b.dramatic === true, true, b.dramatic);
    check('898 perceptible true', b.perceptible === true, true, b.perceptible);
  });

  await safeTest('899 concept-fusion-reactor', async () => {
    const r = await post('concept-fusion-reactor', {
      concept_a: 'blockchain',
      concept_b: 'democracy'
    });
    check('899 fusion 200', r.status === 200, 200, r.status);
    const b = r.body;
    check('899 fusion_name is string', typeof b.fusion_name === 'string' && b.fusion_name.length > 0, true, b.fusion_name);
    check('899 concepts has 2', b.concepts.length === 2, 2, b.concepts?.length);
    check('899 plausibility 0-1', b.plausibility >= 0 && b.plausibility <= 1, true, b.plausibility);
    check('899 applications has items', b.applications.length >= 1, true, b.applications?.length);
    check('899 definition mentions both concepts', b.definition.includes('blockchain') && b.definition.includes('democracy'), true, b.definition);
  });

  // ═══════════════════════════════════════════════════════════
  //  REPORT
  // ═══════════════════════════════════════════════════════════

  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${pass} PASS | ${fail} FAIL | ${error} ERROR`);
  console.log('='.repeat(60));

  const failures = results.filter(r => r.status !== 'PASS');
  if (failures.length > 0) {
    console.log('\nFailures/Errors:');
    failures.forEach(f => {
      console.log(`  [${f.status}] ${f.name}`);
      if (f.expected) console.log(`    expected: ${f.expected}`);
      if (f.actual) console.log(`    actual:   ${f.actual}`);
    });
  }

  // Write report
  const reportPath = path.join(__dirname, '.internal', 'REAL-AUDIT-701-900.md');
  const lines = [];
  lines.push('# Real Audit: Endpoints 701-900');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString().split('T')[0]}`);
  lines.push(`**Server:** http://localhost:${PORT}`);
  lines.push(`**Total tests:** ${results.length}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| PASS | ${pass} |`);
  lines.push(`| FAIL | ${fail} |`);
  lines.push(`| ERROR | ${error} |`);
  lines.push(`| Total | ${results.length} |`);
  lines.push(`| Pass Rate | ${Math.round(pass / results.length * 100)}% |`);
  lines.push('');

  if (failures.length > 0) {
    lines.push('## Failures & Errors');
    lines.push('');
    lines.push('| Test | Status | Expected | Actual |');
    lines.push('|------|--------|----------|--------|');
    failures.forEach(f => {
      lines.push(`| ${f.name} | ${f.status} | ${(f.expected || '').replace(/\|/g, '\\|')} | ${(f.actual || '').replace(/\|/g, '\\|')} |`);
    });
    lines.push('');
  }

  lines.push('## All Results');
  lines.push('');
  lines.push('| # | Test | Status |');
  lines.push('|---|------|--------|');
  results.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${r.name} | ${r.status} |`);
  });

  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`\nReport written to ${reportPath}`);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
