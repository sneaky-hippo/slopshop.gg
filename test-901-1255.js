#!/usr/bin/env node
'use strict';

// Exhaustive test for endpoints 901-1255 (355 endpoints).
// Starts server on port 9974, runs all tests, writes audit to .internal/REAL-AUDIT-901-1255.md

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 9974;
const BASE = `http://127.0.0.1:${PORT}`;
const API_KEY = 'sk-slop-demo-key-12345678';

let serverProcess;
const results = [];
let pass = 0, fail = 0, skip = 0;

function post(slug, body, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE}/v1/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(chunks);
          resolve(parsed.data || parsed);
        } catch (e) { reject(new Error(`JSON parse error for ${slug}: ${chunks.slice(0, 200)}`)); }
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
    results.push({ name, status: 'FAIL', expected: String(expected || ''), actual: String(actual != null ? actual : 'undefined').slice(0, 300) });
    fail++;
  }
}

async function safeTest(label, fn) {
  try { await fn(); }
  catch (e) {
    results.push({ name: label + ': ERROR', status: 'FAIL', expected: 'no error', actual: e.message.slice(0, 300) });
    fail++;
  }
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`${BASE}/health`, res => { res.resume(); resolve(); });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  return false;
}

async function runTests() {
  console.log('Checking if server is running on port', PORT, '...');
  let externalServer = false;
  try {
    await new Promise((resolve, reject) => {
      const req = http.get(`${BASE}/health`, res => { res.resume(); resolve(); });
      req.on('error', reject);
      req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
    });
    externalServer = true;
    console.log('Server already running on port', PORT);
  } catch {
    console.log('Starting server on port', PORT, '...');
    const { spawn } = require('child_process');
    serverProcess = spawn('node', ['server-v2.js'], {
      cwd: path.join(__dirname),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', () => {});
    serverProcess.stderr.on('data', () => {});
    const ready = await waitForServer();
    if (!ready) { console.error('Server failed to start'); process.exit(1); }
  }
  console.log('Server ready. Running 355 tests for endpoints 901-1255...\n');

  // ==================== #901 insight-crystallize ====================
  await safeTest('insight-crystallize', async () => {
    const r = await post('insight-crystallize', { insights: ['Users prefer speed', 'Latency kills conversions', 'Speed is revenue'] });
    check('insight-crystallize: has crystal', typeof r.crystal === 'string' && r.crystal.length > 0, 'string', typeof r.crystal);
    check('insight-crystallize: has observations', typeof r.observations === 'number', 'number', typeof r.observations);
    check('insight-crystallize: has confidence', typeof r.confidence === 'number', 'number', typeof r.confidence);
  });

  // ==================== #902 wisdom-half-life ====================
  await safeTest('wisdom-half-life', async () => {
    const r = await post('wisdom-half-life', { knowledge: 'JavaScript frameworks', learned_date: '2024-01-01', domain: 'technology' });
    check('wisdom-half-life: has half_life', typeof r.half_life !== 'undefined', 'defined', typeof r.half_life);
    check('wisdom-half-life: has decay', typeof r.current_retention === 'number' || typeof r.decay !== 'undefined', 'number', typeof r.current_retention);
  });

  // ==================== #903 eureka-detector ====================
  await safeTest('eureka-detector', async () => {
    const r = await post('eureka-detector', { ideas: ['combine A and B', 'what if we flip the model', 'standard approach'] });
    check('eureka-detector: has eureka or score', typeof r.eureka_score !== 'undefined' || typeof r.eureka !== 'undefined' || typeof r.score !== 'undefined', 'defined', JSON.stringify(r).slice(0, 100));
  });

  // ==================== #904 knowledge-compost ====================
  await safeTest('knowledge-compost', async () => {
    const r = await post('knowledge-compost', { items: ['old fact 1', 'old fact 2', 'new insight'], maturity: 'ripe' });
    check('knowledge-compost: has result', typeof r.compost !== 'undefined' || typeof r.result !== 'undefined' || typeof r.decomposed !== 'undefined', 'defined', JSON.stringify(r).slice(0, 100));
  });

  // ==================== #905 analogy-forge ====================
  await safeTest('analogy-forge', async () => {
    const r = await post('analogy-forge', { concept: 'database indexing', target_domain: 'library' });
    check('analogy-forge: has analogy', typeof r.analogy === 'string' || typeof r.result === 'string', 'string', typeof r.analogy);
  });

  // ==================== #906 paradox-resolver ====================
  await safeTest('paradox-resolver', async () => {
    const r = await post('paradox-resolver', { statement_a: 'This statement is false', statement_b: 'This statement is true' });
    check('paradox-resolver: has resolution', typeof r.resolution === 'string' || typeof r.analysis !== 'undefined', 'defined', JSON.stringify(r).slice(0, 100));
  });

  // ==================== #907 question-sharpener ====================
  await safeTest('question-sharpener', async () => {
    const r = await post('question-sharpener', { question: 'How do we make things better?' });
    check('question-sharpener: has sharpened', typeof r.sharpened === 'string' || typeof r.refined === 'string' || typeof r.questions !== 'undefined', 'defined', JSON.stringify(r).slice(0, 100));
  });

  // ==================== #908 behavioral-fossil-extract ====================
  await safeTest('behavioral-fossil-extract', async () => {
    const r = await post('behavioral-fossil-extract', { actions: ['login', 'search', 'purchase', 'logout', 'login', 'search'] });
    check('behavioral-fossil-extract: has fossils or patterns', Array.isArray(r.fossils) || Array.isArray(r.patterns) || typeof r.extracted !== 'undefined', 'defined', JSON.stringify(r).slice(0, 100));
  });

  // ==================== #909 artifact-carbon-date ====================
  await safeTest('artifact-carbon-date', async () => {
    const r = await post('artifact-carbon-date', { artifact: 'var x = require("express");', type: 'code' });
    check('artifact-carbon-date: has estimated_era or age', typeof r.estimated_era !== 'undefined' || typeof r.age !== 'undefined' || typeof r.estimate !== 'undefined', 'defined', JSON.stringify(r).slice(0, 100));
  });

  // ==================== #910 legacy-intent-recover ====================
  await safeTest('legacy-intent-recover', async () => {
    const r = await post('legacy-intent-recover', { code: 'function calculateTotal(a,b,c) { return a*b+c; }' });
    check('legacy-intent-recover: has intent', typeof r.intent === 'string' || typeof r.recovered_intent === 'string' || typeof r.analysis !== 'undefined', 'defined', JSON.stringify(r).slice(0, 100));
  });

  // ==================== #911 decision-fossil-record ====================
  await safeTest('decision-fossil-record', async () => {
    const r = await post('decision-fossil-record', { decisions: [
      { condition: 'urgent', action: 'deploy' },
      { condition: 'urgent', action: 'deploy' },
      { condition: 'low-priority', action: 'backlog' }
    ]});
    check('decision-fossil-record: has reconstructed_policy', Array.isArray(r.reconstructed_policy), 'array', typeof r.reconstructed_policy);
    check('decision-fossil-record: has total_decisions', typeof r.total_decisions === 'number', 'number', typeof r.total_decisions);
  });

  // ==================== #912 cultural-drift-velocity ====================
  await safeTest('cultural-drift-velocity', async () => {
    const r = await post('cultural-drift-velocity', { text_a: 'agile sprint velocity standups', text_b: 'waterfall milestones deadlines gates' });
    check('cultural-drift-velocity: has drift_velocity', typeof r.drift_velocity === 'number', 'number', typeof r.drift_velocity);
    check('cultural-drift-velocity: has interpretation', typeof r.interpretation === 'string', 'string', typeof r.interpretation);
  });

  // ==================== #913 ruin-reconstructor ====================
  await safeTest('ruin-reconstructor', async () => {
    const r = await post('ruin-reconstructor', { fragment: { name: '??', age: 30, email: '??' } });
    check('ruin-reconstructor: has reconstructed', typeof r.reconstructed === 'object', 'object', typeof r.reconstructed);
    check('ruin-reconstructor: has inferred_fields', Array.isArray(r.inferred_fields), 'array', typeof r.inferred_fields);
  });

  // ==================== #914 idea-momentum ====================
  await safeTest('idea-momentum', async () => {
    const r = await post('idea-momentum', { mass: 10, velocity: 5, friction: 20 });
    check('idea-momentum: has momentum', typeof r.momentum === 'number', 'number', typeof r.momentum);
    check('idea-momentum: momentum = 50', r.momentum === 50, 50, r.momentum);
    check('idea-momentum: has overcomes_friction', typeof r.overcomes_friction === 'boolean', 'boolean', typeof r.overcomes_friction);
  });

  // ==================== #915 scope-creep-friction ====================
  await safeTest('scope-creep-friction', async () => {
    const r = await post('scope-creep-friction', { initial: 10, current: 15 });
    check('scope-creep-friction: has drift', typeof r.drift === 'number', 'number', typeof r.drift);
    check('scope-creep-friction: drift = 5', r.drift === 5, 5, r.drift);
    check('scope-creep-friction: has energy_lost', typeof r.energy_lost === 'number', 'number', typeof r.energy_lost);
  });

  // ==================== #916 consensus-pendulum ====================
  await safeTest('consensus-pendulum', async () => {
    const r = await post('consensus-pendulum', { opinions: [1, 3, 5, 7, 9] });
    check('consensus-pendulum: has current_center', typeof r.current_center === 'number', 'number', typeof r.current_center);
    check('consensus-pendulum: center = 5', r.current_center === 5, 5, r.current_center);
    check('consensus-pendulum: has converged', typeof r.converged === 'boolean', 'boolean', typeof r.converged);
  });

  // ==================== #917 burnout-thermodynamics ====================
  await safeTest('burnout-thermodynamics', async () => {
    const r = await post('burnout-thermodynamics', { workload: 80, recovery: 30, current_temp: 50, meltdown_threshold: 100 });
    check('burnout-thermodynamics: has net_heat', typeof r.net_heat === 'number', 'number', typeof r.net_heat);
    check('burnout-thermodynamics: net_heat = 50', r.net_heat === 50, 50, r.net_heat);
    check('burnout-thermodynamics: has status', typeof r.status === 'string', 'string', typeof r.status);
  });

  // ==================== #918 attention-orbital-decay ====================
  await safeTest('attention-orbital-decay', async () => {
    const r = await post('attention-orbital-decay', { altitude: 100, thrust: 5, decay_rate: 10 });
    check('attention-orbital-decay: has new_altitude', typeof r.new_altitude === 'number', 'number', typeof r.new_altitude);
    check('attention-orbital-decay: has decaying', typeof r.decaying === 'boolean', 'boolean', typeof r.decaying);
  });

  // ==================== #919 decision-spring-constant ====================
  await safeTest('decision-spring-constant', async () => {
    const r = await post('decision-spring-constant', { importance: 8, deferred_days: 14 });
    check('decision-spring-constant: has restoring_force', typeof r.restoring_force === 'number', 'number', typeof r.restoring_force);
    check('decision-spring-constant: has snapback_urgency', typeof r.snapback_urgency === 'string', 'string', typeof r.snapback_urgency);
  });

  // ==================== #920 argument-elastic-collision ====================
  await safeTest('argument-elastic-collision', async () => {
    const r = await post('argument-elastic-collision', { mass_a: 10, velocity_a: 5, mass_b: 8, velocity_b: -3 });
    check('argument-elastic-collision: has post_collision', typeof r.post_collision === 'object', 'object', typeof r.post_collision);
    check('argument-elastic-collision: has winner', typeof r.winner === 'string', 'string', typeof r.winner);
  });

  // ==================== #921 priority-gravity-well ====================
  await safeTest('priority-gravity-well', async () => {
    const r = await post('priority-gravity-well', {
      tasks: [{ name: 'task1', x: 1, y: 1 }, { name: 'task2', x: 5, y: 5 }],
      attractors: [{ name: 'urgent', x: 0, y: 0, mass: 10 }, { name: 'important', x: 10, y: 10, mass: 5 }]
    });
    check('priority-gravity-well: has assignments', Array.isArray(r.assignments), 'array', typeof r.assignments);
  });

  // ==================== #922 workflow-rhythm-score ====================
  await safeTest('workflow-rhythm-score', async () => {
    const now = Date.now();
    const r = await post('workflow-rhythm-score', { timestamps: [now - 3000, now - 2000, now - 1000, now] });
    check('workflow-rhythm-score: has avg_interval_ms', typeof r.avg_interval_ms === 'number', 'number', typeof r.avg_interval_ms);
    check('workflow-rhythm-score: has groove', typeof r.groove === 'string', 'string', typeof r.groove);
  });

  // ==================== #923 crescendo-detector ====================
  await safeTest('crescendo-detector', async () => {
    const r = await post('crescendo-detector', { values: [1, 3, 5, 7, 2, 4] });
    check('crescendo-detector: has crescendo', typeof r.crescendo === 'boolean', 'boolean', typeof r.crescendo);
    check('crescendo-detector: has longest_build', typeof r.longest_build === 'number', 'number', typeof r.longest_build);
    check('crescendo-detector: longest = 4', r.longest_build === 4, 4, r.longest_build);
  });

  // ==================== #924 counterpoint-scheduler ====================
  await safeTest('counterpoint-scheduler', async () => {
    const r = await post('counterpoint-scheduler', { voice_a: ['A1', 'A2', 'A3'], voice_b: ['B1', 'B2'] });
    check('counterpoint-scheduler: has schedule', Array.isArray(r.schedule), 'array', typeof r.schedule);
    check('counterpoint-scheduler: has total_items', typeof r.total_items === 'number', 'number', typeof r.total_items);
  });

  // ==================== #925 cadence-predictor ====================
  await safeTest('cadence-predictor', async () => {
    const r = await post('cadence-predictor', { events: [{ value: 10 }, { value: 20 }, { value: 30 }, { value: 25 }] });
    check('cadence-predictor: has cadence', typeof r.cadence === 'string', 'string', typeof r.cadence);
    check('cadence-predictor: has momentum', typeof r.momentum === 'number' || typeof r.momentum === 'string', 'defined', typeof r.momentum);
  });

  // ==================== #926 motif-extractor ====================
  await safeTest('motif-extractor', async () => {
    const r = await post('motif-extractor', { sequence: ['A', 'B', 'A', 'B', 'C', 'A', 'B'] });
    check('motif-extractor: has motifs', Array.isArray(r.motifs), 'array', typeof r.motifs);
    check('motif-extractor: has dominant_motif', typeof r.dominant_motif !== 'undefined', 'defined', typeof r.dominant_motif);
  });

  // ==================== #927 tempo-rubato-adjuster ====================
  await safeTest('tempo-rubato-adjuster', async () => {
    const r = await post('tempo-rubato-adjuster', {
      schedule: [{ task: 'A', duration: 60 }, { task: 'B', duration: 60 }],
      priorities: [3, 1]
    });
    check('tempo-rubato-adjuster: has rubato_schedule', Array.isArray(r.rubato_schedule), 'array', typeof r.rubato_schedule);
    check('tempo-rubato-adjuster: has total_duration', typeof r.total_duration === 'number', 'number', typeof r.total_duration);
  });

  // ==================== #928 polyrhythm-workload ====================
  await safeTest('polyrhythm-workload', async () => {
    const r = await post('polyrhythm-workload', { rhythms: [3, 4, 6] });
    check('polyrhythm-workload: has composite_cycle_length', typeof r.composite_cycle_length === 'number', 'number', typeof r.composite_cycle_length);
    check('polyrhythm-workload: LCM(3,4,6)=12', r.composite_cycle_length === 12, 12, r.composite_cycle_length);
  });

  // ==================== #929 dynamics-envelope ====================
  await safeTest('dynamics-envelope', async () => {
    const r = await post('dynamics-envelope', { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3, time: 0.05 });
    check('dynamics-envelope: has amplitude', typeof r.amplitude === 'number', 'number', typeof r.amplitude);
    check('dynamics-envelope: has phase', typeof r.phase === 'string', 'string', typeof r.phase);
  });

  // ==================== #930 harmonic-series-rank ====================
  await safeTest('harmonic-series-rank', async () => {
    const r = await post('harmonic-series-rank', { fundamental: 440, frequencies: [440, 880, 1320] });
    check('harmonic-series-rank: has harmonics', Array.isArray(r.harmonics), 'array', typeof r.harmonics);
    check('harmonic-series-rank: has tonal_quality', typeof r.tonal_quality === 'string', 'string', typeof r.tonal_quality);
  });

  // ==================== #931 team-harmony-analyzer ====================
  await safeTest('team-harmony-analyzer', async () => {
    const r = await post('team-harmony-analyzer', { members: [{ name: 'Alice', frequency: 440 }, { name: 'Bob', frequency: 550 }] });
    check('team-harmony-analyzer: has pairs', Array.isArray(r.pairs), 'array', typeof r.pairs);
    check('team-harmony-analyzer: has overall_harmony', typeof r.overall_harmony === 'number', 'number', typeof r.overall_harmony);
  });

  // ==================== #932 sla-enforce ====================
  await safeTest('sla-enforce', async () => {
    const r = await post('sla-enforce', {
      rules: [{ metric: 'latency', threshold: 200, operator: '<' }, { metric: 'error_rate', threshold: 1, operator: '<' }],
      metrics: { latency: 150, error_rate: 0.5 }
    });
    check('sla-enforce: has results', Array.isArray(r.results), 'array', typeof r.results);
    check('sla-enforce: has all_passed', r.all_passed === true, true, r.all_passed);
  });

  // ==================== #933 capacity-forecast ====================
  await safeTest('capacity-forecast', async () => {
    const r = await post('capacity-forecast', { history: [100, 120, 140, 160], ceiling: 500 });
    check('capacity-forecast: has growth_per_period', typeof r.growth_per_period === 'number', 'number', typeof r.growth_per_period);
    check('capacity-forecast: has periods_until_ceiling', typeof r.periods_until_ceiling === 'number', 'number', typeof r.periods_until_ceiling);
  });

  // ==================== #934 runbook-execute ====================
  await safeTest('runbook-execute', async () => {
    const r = await post('runbook-execute', {
      state: { cpu: 90, memory: 50 },
      rules: [{ condition: 'cpu > 80', action: 'scale_up' }, { condition: 'memory > 80', action: 'alert' }]
    });
    check('runbook-execute: has action', typeof r.action === 'string', 'string', typeof r.action);
    check('runbook-execute: action is scale_up', r.action === 'scale_up', 'scale_up', r.action);
  });

  // ==================== #935 incident-timeline ====================
  await safeTest('incident-timeline', async () => {
    const r = await post('incident-timeline', {
      events: [
        { time: '2024-01-01T12:05:00Z', description: 'Alert fired', severity: 'high' },
        { time: '2024-01-01T12:00:00Z', description: 'Anomaly detected', severity: 'critical' },
        { time: '2024-01-01T12:10:00Z', description: 'Service restored', severity: 'low' }
      ]
    });
    check('incident-timeline: has timeline', Array.isArray(r.timeline), 'array', typeof r.timeline);
    check('incident-timeline: has root_cause_candidate', typeof r.root_cause_candidate !== 'undefined', 'defined', typeof r.root_cause_candidate);
  });

  // ==================== #936 compliance-check ====================
  await safeTest('compliance-check', async () => {
    const r = await post('compliance-check', {
      data: { name: 'Acme', email: 'test@test.com' },
      rules: [{ field: 'name', required: true }, { field: 'phone', required: true }]
    });
    check('compliance-check: has results', Array.isArray(r.results), 'array', typeof r.results);
    check('compliance-check: has compliant', typeof r.compliant === 'boolean', 'boolean', typeof r.compliant);
    check('compliance-check: not compliant (phone missing)', r.compliant === false, false, r.compliant);
  });

  // ==================== #937 retry-policy-calc ====================
  await safeTest('retry-policy-calc', async () => {
    const r = await post('retry-policy-calc', { strategy: 'exponential', max_retries: 5, base_delay: 1000 });
    check('retry-policy-calc: has schedule', Array.isArray(r.schedule), 'array', typeof r.schedule);
    check('retry-policy-calc: has total_wait_ms', typeof r.total_wait_ms === 'number', 'number', typeof r.total_wait_ms);
    check('retry-policy-calc: 5 retries', r.schedule && r.schedule.length === 5, 5, r.schedule && r.schedule.length);
  });

  // ==================== #938 cost-attribution ====================
  await safeTest('cost-attribution', async () => {
    const r = await post('cost-attribution', {
      total: 1000,
      entities: [{ name: 'team-a', usage: 60 }, { name: 'team-b', usage: 40 }]
    });
    check('cost-attribution: has bills', Array.isArray(r.bills), 'array', typeof r.bills);
    check('cost-attribution: has total', typeof r.total === 'number', 'number', typeof r.total);
  });

  // ==================== #939 change-risk-score ====================
  await safeTest('change-risk-score', async () => {
    const r = await post('change-risk-score', { blast_radius: 8, rollback_difficulty: 6, dependency_depth: 4 });
    check('change-risk-score: has risk_score', typeof r.risk_score === 'number', 'number', typeof r.risk_score);
    check('change-risk-score: has level', typeof r.level === 'string', 'string', typeof r.level);
  });

  // ==================== #940 canary-analysis ====================
  await safeTest('canary-analysis', async () => {
    const r = await post('canary-analysis', {
      baseline: { latency: 100, error_rate: 1 },
      canary: { latency: 105, error_rate: 1.2 },
      threshold: 10
    });
    check('canary-analysis: has checks', Array.isArray(r.checks), 'array', typeof r.checks);
    check('canary-analysis: has recommendation', typeof r.recommendation === 'string', 'string', typeof r.recommendation);
  });

  // ==================== #941 dependency-criticality ====================
  await safeTest('dependency-criticality', async () => {
    const r = await post('dependency-criticality', {
      graph: { A: ['B', 'C'], B: ['C'], C: [] }
    });
    check('dependency-criticality: has rankings', Array.isArray(r.rankings), 'array', typeof r.rankings);
  });

  // ==================== #942 audit-log-hash ====================
  await safeTest('audit-log-hash', async () => {
    const r = await post('audit-log-hash', {
      entries: [{ action: 'login', user: 'alice' }, { action: 'update', user: 'bob' }]
    });
    check('audit-log-hash: has entries with hash', Array.isArray(r.entries) && r.entries[0] && typeof r.entries[0].hash === 'string', 'string hash', typeof (r.entries && r.entries[0] && r.entries[0].hash));
    check('audit-log-hash: has chain_head', typeof r.chain_head === 'string', 'string', typeof r.chain_head);
    check('audit-log-hash: has tamper_proof', r.tamper_proof === true, true, r.tamper_proof);
  });

  // ==================== #943 rate-limit-calc ====================
  await safeTest('rate-limit-calc', async () => {
    const r = await post('rate-limit-calc', { quota: 100, used: 75, window_seconds: 60 });
    check('rate-limit-calc: has remaining', typeof r.remaining === 'number', 'number', typeof r.remaining);
    check('rate-limit-calc: remaining = 25', r.remaining === 25, 25, r.remaining);
    check('rate-limit-calc: has throttled', typeof r.throttled === 'boolean', 'boolean', typeof r.throttled);
  });

  // ==================== #944 rollback-plan ====================
  await safeTest('rollback-plan', async () => {
    const r = await post('rollback-plan', { services: ['api', 'worker', 'db'] });
    check('rollback-plan: has rollback_steps', Array.isArray(r.rollback_steps), 'array', typeof r.rollback_steps);
    check('rollback-plan: has total_steps', typeof r.total_steps === 'number', 'number', typeof r.total_steps);
  });

  // ==================== #945 resource-bin-pack ====================
  await safeTest('resource-bin-pack', async () => {
    const r = await post('resource-bin-pack', {
      workloads: [{ name: 'w1', size: 3 }, { name: 'w2', size: 5 }, { name: 'w3', size: 2 }, { name: 'w4', size: 4 }],
      node_capacity: 8
    });
    check('resource-bin-pack: has nodes', Array.isArray(r.nodes), 'array', typeof r.nodes);
    check('resource-bin-pack: has node_count', typeof r.node_count === 'number', 'number', typeof r.node_count);
  });

  // ==================== #946 alert-dedup ====================
  await safeTest('alert-dedup', async () => {
    const r = await post('alert-dedup', {
      alerts: [
        { type: 'cpu_high', time: 1000 },
        { type: 'cpu_high', time: 1005 },
        { type: 'disk_full', time: 1010 }
      ],
      window: 60
    });
    check('alert-dedup: has deduped', typeof r.deduped === 'number' || Array.isArray(r.deduped), 'defined', typeof r.deduped);
    check('alert-dedup: has suppressed', typeof r.suppressed === 'number', 'number', typeof r.suppressed);
  });

  // ==================== #947 config-drift-detect ====================
  await safeTest('config-drift-detect', async () => {
    const r = await post('config-drift-detect', {
      desired: { port: 3000, debug: false, log_level: 'info' },
      actual: { port: 3000, debug: true, log_level: 'warn' }
    });
    check('config-drift-detect: has drifts', Array.isArray(r.drifts), 'array', typeof r.drifts);
    check('config-drift-detect: 2 drifts', r.drift_count === 2, 2, r.drift_count);
    check('config-drift-detect: not clean', r.clean === false, false, r.clean);
  });

  // ==================== #948 mttr-calculate ====================
  await safeTest('mttr-calculate', async () => {
    const r = await post('mttr-calculate', {
      started: '2024-01-01T12:00:00Z',
      detected: '2024-01-01T12:05:00Z',
      acknowledged: '2024-01-01T12:10:00Z',
      resolved: '2024-01-01T12:30:00Z'
    });
    check('mttr-calculate: has mttd_min', typeof r.mttd_min === 'number', 'number', typeof r.mttd_min);
    check('mttr-calculate: mttd = 5', r.mttd_min === 5, 5, r.mttd_min);
    check('mttr-calculate: has mttr_min', typeof r.mttr_min === 'number', 'number', typeof r.mttr_min);
    check('mttr-calculate: mttr = 30', r.mttr_min === 30, 30, r.mttr_min);
  });

  // ==================== #949 token-bucket-sim ====================
  await safeTest('token-bucket-sim', async () => {
    const r = await post('token-bucket-sim', {
      capacity: 10, refill_rate: 2, requests: [{ time: 0 }, { time: 0 }, { time: 0 }]
    });
    check('token-bucket-sim: has results', Array.isArray(r.results), 'array', typeof r.results);
    check('token-bucket-sim: has accepted', typeof r.accepted === 'number', 'number', typeof r.accepted);
  });

  // ==================== #950 chaos-schedule ====================
  await safeTest('chaos-schedule', async () => {
    const r = await post('chaos-schedule', {
      services: ['api', 'worker', 'db'],
      blackout_hours: [0, 1, 2, 3, 4, 5]
    });
    check('chaos-schedule: has schedule', Array.isArray(r.schedule), 'array', typeof r.schedule);
  });

  // ==================== #951 ab-test-eval ====================
  await safeTest('ab-test-eval', async () => {
    const r = await post('ab-test-eval', {
      variants: [
        { name: 'control', users: 1000, conversions: 100 },
        { name: 'treatment', users: 1000, conversions: 130 }
      ]
    });
    check('ab-test-eval: has variants', Array.isArray(r.variants), 'array', typeof r.variants);
    check('ab-test-eval: has winner', typeof r.winner === 'string', 'string', typeof r.winner);
    check('ab-test-eval: winner is treatment', r.winner === 'treatment', 'treatment', r.winner);
    check('ab-test-eval: has lift_pct', typeof r.lift_pct === 'number', 'number', typeof r.lift_pct);
  });

  // ==================== #952 nps-calculate ====================
  await safeTest('nps-calculate', async () => {
    const r = await post('nps-calculate', { ratings: [10, 9, 8, 7, 6, 5, 10, 9, 8, 10] });
    check('nps-calculate: has nps', typeof r.nps === 'number', 'number', typeof r.nps);
    check('nps-calculate: has promoters', typeof r.promoters === 'number', 'number', typeof r.promoters);
    check('nps-calculate: has detractors', typeof r.detractors === 'number', 'number', typeof r.detractors);
  });

  // ==================== #953 cohort-analyze ====================
  await safeTest('cohort-analyze', async () => {
    const r = await post('cohort-analyze', {
      users: [
        { id: 'u1', joined: '2024-W01', active_weeks: ['2024-W01', '2024-W02'] },
        { id: 'u2', joined: '2024-W01', active_weeks: ['2024-W01'] },
        { id: 'u3', joined: '2024-W02', active_weeks: ['2024-W02', '2024-W03'] }
      ]
    });
    check('cohort-analyze: has cohorts', typeof r.cohorts === 'object', 'object', typeof r.cohorts);
  });

  // ==================== #954 funnel-analyze ====================
  await safeTest('funnel-analyze', async () => {
    const r = await post('funnel-analyze', {
      stages: [
        { name: 'visit', count: 10000 },
        { name: 'signup', count: 3000 },
        { name: 'activate', count: 1500 },
        { name: 'purchase', count: 500 }
      ]
    });
    check('funnel-analyze: has funnel', Array.isArray(r.funnel), 'array', typeof r.funnel);
    check('funnel-analyze: has overall_conversion', typeof r.overall_conversion === 'number', 'number', typeof r.overall_conversion);
    check('funnel-analyze: overall = 5%', r.overall_conversion === 5, 5, r.overall_conversion);
    check('funnel-analyze: has biggest_leak', typeof r.biggest_leak === 'string' || typeof r.biggest_leak === 'object', 'defined', typeof r.biggest_leak);
  });

  // ==================== #955 viral-coefficient ====================
  await safeTest('viral-coefficient', async () => {
    const r = await post('viral-coefficient', { users: 100, invites_per_user: 3, conversion_rate: 0.4 });
    check('viral-coefficient: has k_factor', typeof r.k_factor === 'number', 'number', typeof r.k_factor);
    check('viral-coefficient: k = 1.2', r.k_factor === 1.2 || Math.abs(r.k_factor - 1.2) < 0.01, 1.2, r.k_factor);
    check('viral-coefficient: viral = true', r.viral === true, true, r.viral);
  });

  // ==================== #956 churn-predict ====================
  await safeTest('churn-predict', async () => {
    const r = await post('churn-predict', { mau_history: [1000, 950, 900, 855] });
    check('churn-predict: has churn_rates', Array.isArray(r.churn_rates), 'array', typeof r.churn_rates);
    check('churn-predict: has avg_monthly_churn', typeof r.avg_monthly_churn === 'number', 'number', typeof r.avg_monthly_churn);
  });

  // ==================== #957 feature-prioritize ====================
  await safeTest('feature-prioritize', async () => {
    const r = await post('feature-prioritize', {
      features: [
        { name: 'dark-mode', reach: 8, impact: 3, confidence: 0.9, effort: 2 },
        { name: 'api-v2', reach: 5, impact: 9, confidence: 0.7, effort: 8 }
      ]
    });
    check('feature-prioritize: has prioritized', Array.isArray(r.prioritized), 'array', typeof r.prioritized);
    check('feature-prioritize: has top_pick', typeof r.top_pick === 'string' || typeof r.top_pick === 'object', 'defined', typeof r.top_pick);
  });

  // ==================== #958 changelog-format ====================
  await safeTest('changelog-format', async () => {
    const r = await post('changelog-format', {
      entries: [
        { type: 'added', description: 'New login page' },
        { type: 'fixed', description: 'Memory leak in worker' },
        { type: 'changed', description: 'Updated dependencies' }
      ]
    });
    check('changelog-format: has markdown', typeof r.markdown === 'string', 'string', typeof r.markdown);
    check('changelog-format: has counts', typeof r.counts === 'object', 'object', typeof r.counts);
  });

  // ==================== #959 demo-data-gen ====================
  await safeTest('demo-data-gen', async () => {
    const r = await post('demo-data-gen', {
      schema: { name: 'string', age: 'int', active: 'boolean' },
      count: 5
    });
    check('demo-data-gen: has data', Array.isArray(r.data), 'array', typeof r.data);
    check('demo-data-gen: 5 rows', r.data && r.data.length === 5, 5, r.data && r.data.length);
    check('demo-data-gen: has row_count', r.row_count === 5, 5, r.row_count);
  });

  // ==================== #960 growth-metric-dash ====================
  await safeTest('growth-metric-dash', async () => {
    const r = await post('growth-metric-dash', {
      weekly_signups: [100, 120, 150, 180],
      weekly_revenue: [1000, 1200, 1500, 1800]
    });
    check('growth-metric-dash: has wow_growth', typeof r.wow_growth === 'number', 'number', typeof r.wow_growth);
    check('growth-metric-dash: has mrr', typeof r.mrr === 'number', 'number', typeof r.mrr);
  });

  // ==================== #961 referral-code-gen ====================
  await safeTest('referral-code-gen', async () => {
    const r = await post('referral-code-gen', { username: 'alice', count: 3 });
    check('referral-code-gen: has codes', Array.isArray(r.codes), 'array', typeof r.codes);
    check('referral-code-gen: 3 codes', r.codes && r.codes.length === 3, 3, r.codes && r.codes.length);
  });

  // ==================== #962 competitor-matrix ====================
  await safeTest('competitor-matrix', async () => {
    const r = await post('competitor-matrix', {
      your_features: ['api', 'cli', 'mcp', 'memory'],
      competitors: [
        { name: 'CompA', features: ['api', 'cli'] },
        { name: 'CompB', features: ['api', 'mcp', 'webhooks'] }
      ]
    });
    check('competitor-matrix: has total_features', typeof r.total_features === 'number', 'number', typeof r.total_features);
    check('competitor-matrix: has advantages', Array.isArray(r.advantages), 'array', typeof r.advantages);
  });

  // ==================== #963 landing-page-audit ====================
  await safeTest('landing-page-audit', async () => {
    const r = await post('landing-page-audit', {
      sections: ['headline', 'cta', 'social_proof', 'pricing']
    });
    check('landing-page-audit: has score', typeof r.score === 'number', 'number', typeof r.score);
    check('landing-page-audit: has grade', typeof r.grade === 'string', 'string', typeof r.grade);
  });

  // ==================== #964 onboarding-score ====================
  await safeTest('onboarding-score', async () => {
    const r = await post('onboarding-score', {
      steps: [
        { name: 'signup', completed: true },
        { name: 'profile', completed: true },
        { name: 'connect', completed: false },
        { name: 'first_action', completed: false }
      ]
    });
    check('onboarding-score: has completion', typeof r.completion === 'number', 'number', typeof r.completion);
    check('onboarding-score: completion = 50', r.completion === 50, 50, r.completion);
    check('onboarding-score: has next_step', typeof r.next_step === 'string', 'string', typeof r.next_step);
  });

  // ==================== #965 stripe-price-calc ====================
  await safeTest('stripe-price-calc', async () => {
    const r = await post('stripe-price-calc', { amount: 100 });
    check('stripe-price-calc: has stripe_fee', typeof r.stripe_fee === 'number', 'number', typeof r.stripe_fee);
    check('stripe-price-calc: fee = 3.20', Math.abs(r.stripe_fee - 3.2) < 0.01, 3.2, r.stripe_fee);
    check('stripe-price-calc: has net', typeof r.net === 'number', 'number', typeof r.net);
    check('stripe-price-calc: net = 96.80', Math.abs(r.net - 96.8) < 0.01, 96.8, r.net);
  });

  // ==================== #966 social-proof-gen ====================
  await safeTest('social-proof-gen', async () => {
    const r = await post('social-proof-gen', { metrics: { users: 10000, uptime: 99.9, countries: 50 } });
    check('social-proof-gen: has snippets', Array.isArray(r.snippets), 'array', typeof r.snippets);
    check('social-proof-gen: has count', typeof r.count === 'number', 'number', typeof r.count);
  });

  // ==================== #967 pricing-table-gen ====================
  await safeTest('pricing-table-gen', async () => {
    const r = await post('pricing-table-gen', {
      tiers: [
        { name: 'Free', price: 0, features: ['basic'] },
        { name: 'Pro', price: 29, features: ['basic', 'advanced'] },
        { name: 'Enterprise', price: 199, features: ['all'] }
      ]
    });
    check('pricing-table-gen: has tiers', Array.isArray(r.tiers), 'array', typeof r.tiers);
    check('pricing-table-gen: Pro is popular', r.tiers && r.tiers[1] && r.tiers[1].popular === true, true, r.tiers && r.tiers[1] && r.tiers[1].popular);
  });

  // ==================== #968 waitlist-position ====================
  await safeTest('waitlist-position', async () => {
    const r = await post('waitlist-position', { position: 42, total: 1000 });
    check('waitlist-position: has position', r.position === 42, 42, r.position);
    check('waitlist-position: has percentile', typeof r.percentile === 'number', 'number', typeof r.percentile);
    check('waitlist-position: has shareable', typeof r.shareable === 'string', 'string', typeof r.shareable);
  });

  // ==================== #969 launch-countdown ====================
  await safeTest('launch-countdown', async () => {
    const r = await post('launch-countdown', { launch_date: '2027-01-01T00:00:00Z' });
    check('launch-countdown: has days', typeof r.days === 'number', 'number', typeof r.days);
    check('launch-countdown: has hype', typeof r.hype === 'number' || typeof r.hype === 'string', 'defined', typeof r.hype);
  });

  // ==================== #970 benchmark-harness ====================
  await safeTest('benchmark-harness', async () => {
    const r = await post('benchmark-harness', {
      tests: [
        { input: 'hello', expected: 'HELLO', actual: 'HELLO' },
        { input: 'world', expected: 'WORLD', actual: 'WORLD' },
        { input: 'test', expected: 'TEST', actual: 'WRONG' }
      ]
    });
    check('benchmark-harness: has results', Array.isArray(r.results), 'array', typeof r.results);
    check('benchmark-harness: has accuracy', typeof r.accuracy === 'number', 'number', typeof r.accuracy);
    check('benchmark-harness: accuracy ~ 66.67', Math.abs(r.accuracy - 66.67) < 1, '66.67', r.accuracy);
  });

  // ==================== #971 ablation-score ====================
  await safeTest('ablation-score', async () => {
    const r = await post('ablation-score', {
      full_score: 0.95,
      ablations: [
        { feature: 'attention', score_without: 0.80 },
        { feature: 'normalization', score_without: 0.90 }
      ]
    });
    check('ablation-score: has contributions', Array.isArray(r.contributions), 'array', typeof r.contributions);
    check('ablation-score: has most_important', typeof r.most_important === 'string', 'string', typeof r.most_important);
    check('ablation-score: most_important = attention', r.most_important === 'attention', 'attention', r.most_important);
  });

  // ==================== #972 calibration-curve ====================
  await safeTest('calibration-curve', async () => {
    const r = await post('calibration-curve', {
      predictions: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95],
      actuals: [0, 0, 0, 1, 0, 1, 1, 1, 1, 1]
    });
    check('calibration-curve: has bins', Array.isArray(r.bins), 'array', typeof r.bins);
    check('calibration-curve: has brier_score', typeof r.brier_score === 'number', 'number', typeof r.brier_score);
  });

  // ==================== #973 confusion-matrix ====================
  await safeTest('confusion-matrix', async () => {
    const r = await post('confusion-matrix', {
      predicted: ['cat', 'dog', 'cat', 'cat', 'dog'],
      actual: ['cat', 'dog', 'dog', 'cat', 'dog']
    });
    check('confusion-matrix: has matrix', Array.isArray(r.matrix), 'array', typeof r.matrix);
    check('confusion-matrix: has accuracy', typeof r.accuracy === 'number', 'number', typeof r.accuracy);
    check('confusion-matrix: accuracy = 80%', r.accuracy === 80 || r.accuracy === 0.8, '80', r.accuracy);
  });

  // ==================== #974 rouge-score ====================
  await safeTest('rouge-score', async () => {
    const r = await post('rouge-score', {
      candidate: 'the cat sat on the mat',
      reference: 'the cat is on the mat'
    });
    check('rouge-score: has rouge_1', typeof r.rouge_1 === 'object', 'object', typeof r.rouge_1);
    check('rouge-score: has precision', typeof r.rouge_1.precision === 'number', 'number', typeof (r.rouge_1 && r.rouge_1.precision));
    check('rouge-score: has recall', typeof r.rouge_1.recall === 'number', 'number', typeof (r.rouge_1 && r.rouge_1.recall));
    check('rouge-score: has f1', typeof r.rouge_1.f1 === 'number', 'number', typeof (r.rouge_1 && r.rouge_1.f1));
  });

  // ==================== #975 bleu-score ====================
  await safeTest('bleu-score', async () => {
    const r = await post('bleu-score', {
      candidate: 'the cat sat on the mat',
      reference: 'the cat is on the mat'
    });
    check('bleu-score: has bleu', typeof r.bleu === 'number', 'number', typeof r.bleu);
    check('bleu-score: has brevity_penalty', typeof r.brevity_penalty === 'number', 'number', typeof r.brevity_penalty);
  });

  // ==================== #976 cosine-similarity ====================
  await safeTest('cosine-similarity', async () => {
    const r = await post('cosine-similarity', { vector_a: [1, 0, 0], vector_b: [0, 1, 0] });
    check('cosine-similarity: orthogonal = 0', r.similarity === 0, 0, r.similarity);
    check('cosine-similarity: angle = 90', r.angle_degrees === 90, 90, r.angle_degrees);
  });

  // ==================== #977 embedding-cluster ====================
  await safeTest('embedding-cluster', async () => {
    const r = await post('embedding-cluster', {
      vectors: [[1, 0], [0.9, 0.1], [0, 1], [0.1, 0.9]],
      k: 2
    });
    check('embedding-cluster: has clusters', Array.isArray(r.clusters), 'array', typeof r.clusters);
    check('embedding-cluster: k=2', r.k === 2, 2, r.k);
  });

  // ==================== #978 elo-rating ====================
  await safeTest('elo-rating', async () => {
    const r = await post('elo-rating', { rating_a: 1500, rating_b: 1400, winner: 'a', k: 32 });
    check('elo-rating: has new_a', typeof r.new_a === 'number', 'number', typeof r.new_a);
    check('elo-rating: has new_b', typeof r.new_b === 'number', 'number', typeof r.new_b);
    check('elo-rating: a gained', r.new_a > 1500, '>1500', r.new_a);
    check('elo-rating: b lost', r.new_b < 1400, '<1400', r.new_b);
  });

  // ==================== #979 hypothesis-test ====================
  await safeTest('hypothesis-test', async () => {
    const r = await post('hypothesis-test', {
      sample_a: [10, 12, 14, 11, 13],
      sample_b: [20, 22, 24, 21, 23]
    });
    check('hypothesis-test: has t_statistic', typeof r.t_statistic === 'number', 'number', typeof r.t_statistic);
    check('hypothesis-test: has significant', typeof r.significant === 'boolean', 'boolean', typeof r.significant);
    check('hypothesis-test: significant = true (big diff)', r.significant === true, true, r.significant);
  });

  // ==================== #980 pareto-frontier ====================
  await safeTest('pareto-frontier', async () => {
    const r = await post('pareto-frontier', {
      points: [{ x: 1, y: 5 }, { x: 2, y: 4 }, { x: 3, y: 3 }, { x: 5, y: 1 }, { x: 4, y: 4 }]
    });
    check('pareto-frontier: has pareto_optimal', Array.isArray(r.pareto_optimal), 'array', typeof r.pareto_optimal);
    check('pareto-frontier: has frontier_size', typeof r.frontier_size === 'number', 'number', typeof r.frontier_size);
  });

  // ==================== #981 information-gain ====================
  await safeTest('information-gain', async () => {
    const r = await post('information-gain', {
      data: [
        { color: 'red', size: 'big', label: 'yes' },
        { color: 'red', size: 'small', label: 'no' },
        { color: 'blue', size: 'big', label: 'yes' },
        { color: 'blue', size: 'big', label: 'yes' }
      ],
      target: 'label'
    });
    check('information-gain: has base_entropy', typeof r.base_entropy === 'number', 'number', typeof r.base_entropy);
    check('information-gain: has gains', Array.isArray(r.gains), 'array', typeof r.gains);
    check('information-gain: has best_split', typeof r.best_split === 'string', 'string', typeof r.best_split);
  });

  // ==================== #982 prompt-complexity ====================
  await safeTest('prompt-complexity', async () => {
    const r = await post('prompt-complexity', { prompt: 'List the top 5 reasons why AI is important. Be concise. Use bullet points. Do not exceed 100 words.' });
    check('prompt-complexity: has complexity_score', typeof r.complexity_score === 'number', 'number', typeof r.complexity_score);
    check('prompt-complexity: has tier', typeof r.tier === 'string', 'string', typeof r.tier);
  });

  // ==================== #983 response-diversity ====================
  await safeTest('response-diversity', async () => {
    const r = await post('response-diversity', {
      responses: ['The sky is blue because of Rayleigh scattering', 'Rayleigh scattering makes the sky blue', 'Blue sky comes from light scattering']
    });
    check('response-diversity: has unique_terms', typeof r.unique_terms === 'number', 'number', typeof r.unique_terms);
    check('response-diversity: has diversity', typeof r.diversity === 'number', 'number', typeof r.diversity);
  });

  // ==================== #984 concept-drift-detect ====================
  await safeTest('concept-drift-detect', async () => {
    const r = await post('concept-drift-detect', {
      before: [1, 2, 3, 4, 5],
      after: [10, 11, 12, 13, 14]
    });
    check('concept-drift-detect: has drift_detected', typeof r.drift_detected === 'boolean', 'boolean', typeof r.drift_detected);
    check('concept-drift-detect: drift = true', r.drift_detected === true, true, r.drift_detected);
    check('concept-drift-detect: has shift', typeof r.shift === 'number', 'number', typeof r.shift);
  });

  // ==================== #985 reward-shape ====================
  await safeTest('reward-shape', async () => {
    const r = await post('reward-shape', {
      trajectory: [{ state: 'start', action: 'move' }, { state: 'goal', action: 'stop' }],
      rules: [{ condition: 'goal', reward: 10 }, { condition: 'start', reward: -1 }]
    });
    check('reward-shape: has trajectory', Array.isArray(r.trajectory), 'array', typeof r.trajectory);
    check('reward-shape: has cumulative', typeof r.cumulative === 'number', 'number', typeof r.cumulative);
  });

  // ==================== #986 alignment-tax ====================
  await safeTest('alignment-tax', async () => {
    const r = await post('alignment-tax', { unconstrained: 100, constrained: 90 });
    check('alignment-tax: has tax_pct', typeof r.tax_pct === 'number', 'number', typeof r.tax_pct);
    check('alignment-tax: tax = 10%', r.tax_pct === 10, 10, r.tax_pct);
    check('alignment-tax: acceptable = true', r.acceptable === true, true, r.acceptable);
  });

  // ==================== #987 token-attribution ====================
  await safeTest('token-attribution', async () => {
    const r = await post('token-attribution', { tokens: ['The', 'quick', 'brown', 'fox'] });
    check('token-attribution: has attribution', Array.isArray(r.attribution), 'array', typeof r.attribution);
    check('token-attribution: has most_influential', typeof r.most_influential === 'string', 'string', typeof r.most_influential);
  });

  // ==================== #988 xp-level-calc ====================
  await safeTest('xp-level-calc', async () => {
    const r = await post('xp-level-calc', { xp: 5000 });
    check('xp-level-calc: has level', typeof r.level === 'number', 'number', typeof r.level);
    check('xp-level-calc: has xp_to_next', typeof r.xp_to_next === 'number', 'number', typeof r.xp_to_next);
    check('xp-level-calc: has progress', typeof r.progress === 'number', 'number', typeof r.progress);
  });

  // ==================== #989 skill-tree-eval ====================
  await safeTest('skill-tree-eval', async () => {
    const r = await post('skill-tree-eval', {
      skills: [
        { id: 'sword', prereqs: [] },
        { id: 'dual-wield', prereqs: ['sword'] },
        { id: 'whirlwind', prereqs: ['dual-wield'] }
      ],
      unlocked: ['sword']
    });
    check('skill-tree-eval: has available', Array.isArray(r.available), 'array', typeof r.available);
    check('skill-tree-eval: dual-wield available', r.available && r.available.includes('dual-wield'), 'dual-wield', JSON.stringify(r.available));
    check('skill-tree-eval: has completion', typeof r.completion === 'number', 'number', typeof r.completion);
  });

  // ==================== #990 quest-generate ====================
  await safeTest('quest-generate', async () => {
    const r = await post('quest-generate', { theme: 'forest', difficulty: 3 });
    check('quest-generate: has quest_id', typeof r.quest_id === 'string', 'string', typeof r.quest_id);
    check('quest-generate: has type', typeof r.type === 'string', 'string', typeof r.type);
    check('quest-generate: has rewards', typeof r.rewards !== 'undefined', 'defined', typeof r.rewards);
  });

  // ==================== #991 loot-table-roll ====================
  await safeTest('loot-table-roll', async () => {
    const r = await post('loot-table-roll', {
      table: [
        { item: 'Sword', rarity: 'common', weight: 70 },
        { item: 'Shield', rarity: 'rare', weight: 25 },
        { item: 'Crown', rarity: 'legendary', weight: 5 }
      ],
      seed: 'test-seed'
    });
    check('loot-table-roll: has dropped', typeof r.dropped === 'object', 'object', typeof r.dropped);
    check('loot-table-roll: has rarity_color', typeof r.rarity_color === 'string', 'string', typeof r.rarity_color);
  });

  // ==================== #992 boss-encounter ====================
  await safeTest('boss-encounter', async () => {
    const r = await post('boss-encounter', { boss: 'Dragon', party_size: 4, difficulty: 5 });
    check('boss-encounter: has turns_to_defeat', typeof r.turns_to_defeat === 'number', 'number', typeof r.turns_to_defeat);
    check('boss-encounter: has difficulty', typeof r.difficulty === 'number' || typeof r.difficulty === 'string', 'defined', typeof r.difficulty);
  });

  // ==================== #993 achievement-check ====================
  await safeTest('achievement-check', async () => {
    const r = await post('achievement-check', {
      stats: { kills: 100, quests: 50, level: 20 },
      achievements: [
        { name: 'Slayer', condition: 'kills >= 100' },
        { name: 'Quester', condition: 'quests >= 100' }
      ]
    });
    check('achievement-check: has unlocked', Array.isArray(r.unlocked), 'array', typeof r.unlocked);
  });

  // ==================== #994 combo-detect ====================
  await safeTest('combo-detect', async () => {
    const r = await post('combo-detect', {
      actions: ['punch', 'kick', 'punch'],
      combos: [{ pattern: ['punch', 'kick', 'punch'], name: 'Triple Strike', multiplier: 2.5 }]
    });
    check('combo-detect: has triggered', Array.isArray(r.triggered), 'array', typeof r.triggered);
    check('combo-detect: has multiplier', typeof r.multiplier === 'number', 'number', typeof r.multiplier);
  });

  // ==================== #995 cooldown-manager ====================
  await safeTest('cooldown-manager', async () => {
    const now = Date.now();
    const r = await post('cooldown-manager', {
      abilities: [
        { name: 'fireball', cooldown: 5000, last_used: now - 6000 },
        { name: 'shield', cooldown: 10000, last_used: now - 3000 }
      ],
      current_time: now
    });
    check('cooldown-manager: has abilities', Array.isArray(r.abilities), 'array', typeof r.abilities);
    check('cooldown-manager: has available', Array.isArray(r.available), 'array', typeof r.available);
  });

  // ==================== #996 dungeon-generate ====================
  await safeTest('dungeon-generate', async () => {
    const r = await post('dungeon-generate', { width: 10, height: 10, rooms: 3 });
    check('dungeon-generate: has map', typeof r.map === 'string', 'string', typeof r.map);
    check('dungeon-generate: has rooms', Array.isArray(r.rooms), 'array', typeof r.rooms);
  });

  // ==================== #997 reputation-faction ====================
  await safeTest('reputation-faction', async () => {
    const r = await post('reputation-faction', {
      factions: [{ name: 'Elves', reputation: 500 }, { name: 'Dwarves', reputation: -200 }],
      changes: [{ faction: 'Elves', delta: 100 }]
    });
    check('reputation-faction: has standings', Array.isArray(r.standings), 'array', typeof r.standings);
  });

  // ==================== #998 daily-challenge ====================
  await safeTest('daily-challenge', async () => {
    const r = await post('daily-challenge', { date: '2024-06-15' });
    check('daily-challenge: has type', typeof r.type === 'string', 'string', typeof r.type);
    check('daily-challenge: has difficulty', typeof r.difficulty === 'number' || typeof r.difficulty === 'string', 'defined', typeof r.difficulty);
    check('daily-challenge: has seed', typeof r.seed !== 'undefined', 'defined', typeof r.seed);
  });

  // ==================== #999 weighted-tier-draw ====================
  await safeTest('weighted-tier-draw', async () => {
    const r = await post('weighted-tier-draw', {
      tiers: [
        { rarity: 'common', weight: 70 },
        { rarity: 'rare', weight: 25 },
        { rarity: 'legendary', weight: 5 }
      ],
      pity: 0
    });
    check('weighted-tier-draw: has result', typeof r.result === 'string', 'string', typeof r.result);
  });

  // ==================== #1000 pvp-matchmake ====================
  await safeTest('pvp-matchmake', async () => {
    const r = await post('pvp-matchmake', { rating_a: 1500, rating_b: 1520 });
    check('pvp-matchmake: has match_quality', typeof r.match_quality === 'number' || typeof r.match_quality === 'string', 'defined', typeof r.match_quality);
    check('pvp-matchmake: has win_prob_a', typeof r.win_prob_a === 'number', 'number', typeof r.win_prob_a);
    check('pvp-matchmake: has fair', typeof r.fair === 'boolean', 'boolean', typeof r.fair);
  });

  // ==================== #1001 inventory-manage ====================
  await safeTest('inventory-manage', async () => {
    const r = await post('inventory-manage', {
      inventory: [{ item: 'sword', count: 1, weight: 5 }],
      action: 'add',
      item: { item: 'shield', count: 1, weight: 8 }
    });
    check('inventory-manage: has inventory', Array.isArray(r.inventory), 'array', typeof r.inventory);
    check('inventory-manage: has count', typeof r.count === 'number', 'number', typeof r.count);
  });

  // ==================== #1002 battle-resolve ====================
  await safeTest('battle-resolve', async () => {
    const r = await post('battle-resolve', {
      unit_a: { name: 'Knight', hp: 100, attack: 20, defense: 10, speed: 5 },
      unit_b: { name: 'Mage', hp: 80, attack: 25, defense: 5, speed: 8 }
    });
    check('battle-resolve: has rounds', Array.isArray(r.rounds), 'array', typeof r.rounds);
    check('battle-resolve: has winner', typeof r.winner === 'string', 'string', typeof r.winner);
  });

  // ==================== #1003 world-event-roll ====================
  await safeTest('world-event-roll', async () => {
    const r = await post('world-event-roll', { world_state: { gold: 1000, population: 500 } });
    check('world-event-roll: has event', typeof r.event === 'string', 'string', typeof r.event);
  });

  // ==================== #1004 trolley-problem ====================
  await safeTest('trolley-problem', async () => {
    const r = await post('trolley-problem', { people_on_track: 5, people_on_siding: 1 });
    check('trolley-problem: has utilitarian', typeof r.utilitarian === 'string' || typeof r.utilitarian === 'object', 'defined', typeof r.utilitarian);
    check('trolley-problem: has deontological', typeof r.deontological === 'string' || typeof r.deontological === 'object', 'defined', typeof r.deontological);
  });

  // ==================== #1005 value-alignment-score ====================
  await safeTest('value-alignment-score', async () => {
    const r = await post('value-alignment-score', {
      values_a: ['honesty', 'courage', 'kindness'],
      values_b: ['honesty', 'ambition', 'kindness']
    });
    check('value-alignment-score: has alignment', typeof r.alignment === 'number', 'number', typeof r.alignment);
    check('value-alignment-score: has shared_values', Array.isArray(r.shared_values), 'array', typeof r.shared_values);
    check('value-alignment-score: has compatible', typeof r.compatible === 'boolean', 'boolean', typeof r.compatible);
  });

  // ==================== #1006 consciousness-index ====================
  await safeTest('consciousness-index', async () => {
    const r = await post('consciousness-index', {
      self_reference: 0.8, temporal_awareness: 0.7, goal_coherence: 0.9, uncertainty: 0.6
    });
    check('consciousness-index: has index', typeof r.index === 'number', 'number', typeof r.index);
    check('consciousness-index: has interpretation', typeof r.interpretation === 'string', 'string', typeof r.interpretation);
  });

  // ==================== #1007 moral-foundation ====================
  await safeTest('moral-foundation', async () => {
    const r = await post('moral-foundation', { text: 'We must protect the weak and ensure fairness for all. Loyalty to the group is paramount, and we respect authority.' });
    check('moral-foundation: has foundations', typeof r.foundations === 'object', 'object', typeof r.foundations);
    check('moral-foundation: has dominant', typeof r.dominant === 'string', 'string', typeof r.dominant);
  });

  // ==================== #1008 veil-of-ignorance ====================
  await safeTest('veil-of-ignorance', async () => {
    const r = await post('veil-of-ignorance', {
      policy: 'Universal basic income',
      roles: [
        { role: 'wealthy', outcome: 6 },
        { role: 'middle-class', outcome: 8 },
        { role: 'poor', outcome: 9 }
      ]
    });
    check('veil-of-ignorance: has outcomes', Array.isArray(r.outcomes), 'array', typeof r.outcomes);
    check('veil-of-ignorance: has worst_off', typeof r.worst_off !== 'undefined', 'defined', typeof r.worst_off);
    check('veil-of-ignorance: has passes', typeof r.passes === 'boolean', 'boolean', typeof r.passes);
  });

  // ==================== #1009 categorical-imperative ====================
  await safeTest('categorical-imperative', async () => {
    const r = await post('categorical-imperative', { action: 'lying to protect someone' });
    check('categorical-imperative: has universalizable', typeof r.universalizable === 'boolean', 'boolean', typeof r.universalizable);
    check('categorical-imperative: has verdict', typeof r.verdict === 'string', 'string', typeof r.verdict);
  });

  // ==================== #1010 wisdom-score ====================
  await safeTest('wisdom-score', async () => {
    const r = await post('wisdom-score', {
      decision: 'Invest in renewable energy',
      long_term: 9, stakeholders: 8, uncertainty: 7, learning: 8, humility: 7
    });
    check('wisdom-score: has score', typeof r.score === 'number', 'number', typeof r.score);
    check('wisdom-score: has criteria', typeof r.criteria === 'object', 'object', typeof r.criteria);
  });

  // ==================== #1011 ikigai-map ====================
  await safeTest('ikigai-map', async () => {
    const r = await post('ikigai-map', {
      skills: ['coding', 'writing', 'teaching'],
      passions: ['coding', 'music', 'teaching'],
      world_needs: ['coding', 'teaching', 'healthcare'],
      compensation: ['coding', 'writing', 'teaching']
    });
    check('ikigai-map: has ikigai', Array.isArray(r.ikigai), 'array', typeof r.ikigai);
    check('ikigai-map: coding and teaching in ikigai', r.ikigai && r.ikigai.includes('coding') && r.ikigai.includes('teaching'), 'coding,teaching', JSON.stringify(r.ikigai));
  });

  // ==================== #1012 first-principles-decompose ====================
  await safeTest('first-principles-decompose', async () => {
    const r = await post('first-principles-decompose', { claim: 'Electric cars are always better for the environment' });
    check('first-principles-decompose: has assumptions', Array.isArray(r.assumptions), 'array', typeof r.assumptions);
    check('first-principles-decompose: has weakest', typeof r.weakest === 'string', 'string', typeof r.weakest);
  });

  // ==================== #1013 coherence-check ====================
  await safeTest('coherence-check', async () => {
    const r = await post('coherence-check', {
      beliefs: ['I always tell the truth', 'I never tell the truth', 'Honesty matters']
    });
    check('coherence-check: has coherent', typeof r.coherent === 'boolean', 'boolean', typeof r.coherent);
    check('coherence-check: has contradictions', Array.isArray(r.contradictions), 'array', typeof r.contradictions);
    check('coherence-check: found contradiction', r.contradictions && r.contradictions.length > 0, '>0', r.contradictions && r.contradictions.length);
  });

  // ==================== #1014 thought-experiment ====================
  await safeTest('thought-experiment', async () => {
    const r = await post('thought-experiment', { dilemma: 'Should AI have rights?' });
    check('thought-experiment: has experiment', typeof r.experiment === 'object', 'object', typeof r.experiment);
    check('thought-experiment: has opposing', Array.isArray(r.opposing), 'array', typeof r.opposing);
  });

  // ==================== #1015 eudaimonia-check ====================
  await safeTest('eudaimonia-check', async () => {
    const r = await post('eudaimonia-check', {
      activities: [
        { name: 'coding', purpose: true, growth: true },
        { name: 'tv', purpose: false, growth: false },
        { name: 'exercise', purpose: true, growth: true }
      ]
    });
    check('eudaimonia-check: has flourishing_score', typeof r.flourishing_score === 'number', 'number', typeof r.flourishing_score);
    check('eudaimonia-check: has verdict', typeof r.verdict === 'string', 'string', typeof r.verdict);
  });

  // ==================== #1016 moral-weight ====================
  await safeTest('moral-weight', async () => {
    const r = await post('moral-weight', {
      stakeholders: [
        { name: 'humans', sentience: 10, agency: 10, vulnerability: 5, count: 1000 },
        { name: 'animals', sentience: 5, agency: 2, vulnerability: 9, count: 10000 }
      ]
    });
    check('moral-weight: has rankings', Array.isArray(r.rankings), 'array', typeof r.rankings);
    check('moral-weight: has highest_priority', typeof r.highest_priority === 'string', 'string', typeof r.highest_priority);
  });

  // ==================== #1017 existential-risk-eval ====================
  await safeTest('existential-risk-eval', async () => {
    const r = await post('existential-risk-eval', {
      factors: [{ name: 'AGI', reversibility: 0.1, scope: 0.9, consent: 0.2 }]
    });
    check('existential-risk-eval: has risk_score', typeof r.risk_score === 'number', 'number', typeof r.risk_score);
    check('existential-risk-eval: has verdict', typeof r.verdict === 'string', 'string', typeof r.verdict);
  });

  // ==================== #1018 meaning-extract ====================
  await safeTest('meaning-extract', async () => {
    const r = await post('meaning-extract', { text: 'Our purpose is to create value and build meaningful connections with integrity and compassion.' });
    check('meaning-extract: has density', typeof r.density === 'number', 'number', typeof r.density);
    check('meaning-extract: has purpose_markers', typeof r.purpose_markers === 'number', 'number', typeof r.purpose_markers);
  });

  // ==================== #1019 socratic-dialogue ====================
  await safeTest('socratic-dialogue', async () => {
    const r = await post('socratic-dialogue', { thesis: 'Free will is an illusion' });
    check('socratic-dialogue: has dialogue', Array.isArray(r.dialogue), 'array', typeof r.dialogue);
    check('socratic-dialogue: 5 questions', r.dialogue && r.dialogue.length === 5, 5, r.dialogue && r.dialogue.length);
  });

  // ==================== #1020 autonomy-audit ====================
  await safeTest('autonomy-audit', async () => {
    const r = await post('autonomy-audit', {
      actions: [
        { type: 'self-initiated', novel: true },
        { type: 'commanded', novel: false },
        { type: 'self-initiated', novel: false },
        { type: 'commanded', novel: false }
      ]
    });
    check('autonomy-audit: has autonomy_score', typeof r.autonomy_score === 'number', 'number', typeof r.autonomy_score);
  });

  // ==================== #1021 stewardship-score ====================
  await safeTest('stewardship-score', async () => {
    const r = await post('stewardship-score', {
      decision: 'Open source the project',
      sustainable: true, reversible: true, preserves_commons: true
    });
    check('stewardship-score: has score', typeof r.score === 'number', 'number', typeof r.score);
    check('stewardship-score: has grade', typeof r.grade === 'string', 'string', typeof r.grade);
  });

  // ==================== #1022 paradox-navigate ====================
  await safeTest('paradox-navigate', async () => {
    const r = await post('paradox-navigate', {
      statement_a: 'Change is the only constant',
      statement_b: 'Nothing ever changes'
    });
    check('paradox-navigate: has dissolution', typeof r.dissolution === 'string', 'string', typeof r.dissolution);
    check('paradox-navigate: has method', typeof r.method === 'string', 'string', typeof r.method);
  });

  // ==================== #1023 memento-mori ====================
  await safeTest('memento-mori', async () => {
    const r = await post('memento-mori', { deadline: '2027-01-01', goal: 'Launch product', progress: 40 });
    check('memento-mori: has days_remaining', typeof r.days_remaining === 'number', 'number', typeof r.days_remaining);
    check('memento-mori: has progress_pct', typeof r.progress_pct === 'number', 'number', typeof r.progress_pct);
    check('memento-mori: has urgency', typeof r.urgency === 'string', 'string', typeof r.urgency);
  });

  // ==================== #1024 schema-enforce ====================
  await safeTest('schema-enforce', async () => {
    const r = await post('schema-enforce', {
      schema: {
        type: 'object', required: ['name', 'age'],
        properties: {
          name: { type: 'string', minLength: 1 },
          age: { type: 'number', min: 0, max: 150 }
        }
      },
      data: { name: 'Alice', age: 30 }
    });
    check('schema-enforce: valid', r.valid === true, true, r.valid);
    check('schema-enforce: no errors', r.error_count === 0, 0, r.error_count);
  });

  // ==================== #1025 schema-generate-from-sample ====================
  await safeTest('schema-generate-from-sample', async () => {
    const r = await post('schema-generate-from-sample', {
      samples: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25, email: 'bob@test.com' }]
    });
    check('schema-generate-from-sample: has schema', typeof r.schema === 'object', 'object', typeof r.schema);
    check('schema-generate-from-sample: has fields', typeof r.fields === 'number', 'number', typeof r.fields);
  });

  // ==================== #1026 structured-output-repair ====================
  await safeTest('structured-output-repair', async () => {
    const r = await post('structured-output-repair', { text: "{'name': 'test', 'value': 42,}" });
    check('structured-output-repair: repaired', r.repaired === true, true, r.repaired);
    check('structured-output-repair: has result', typeof r.result === 'object' || typeof r.repaired_text === 'string', 'defined', typeof r.result);
  });

  // ==================== #1027 context-window-estimate ====================
  await safeTest('context-window-estimate', async () => {
    const r = await post('context-window-estimate', { text: 'Hello world this is a test of the context window estimation tool.', model: 'gpt-4' });
    check('context-window-estimate: has estimated_tokens', typeof r.estimated_tokens === 'number', 'number', typeof r.estimated_tokens);
    check('context-window-estimate: has context_limit', typeof r.context_limit === 'number', 'number', typeof r.context_limit);
    check('context-window-estimate: has utilization', typeof r.utilization === 'number', 'number', typeof r.utilization);
  });

  // ==================== #1028 context-window-summarize ====================
  await safeTest('context-window-summarize', async () => {
    const r = await post('context-window-summarize', {
      messages: [
        { role: 'user', content: 'What is JavaScript?' },
        { role: 'assistant', content: 'JavaScript is a programming language for the web.' },
        { role: 'user', content: 'Tell me about Node.js' },
        { role: 'assistant', content: 'Node.js is a JavaScript runtime built on Chrome V8.' }
      ],
      keep_recent: 2,
      token_budget: 1000
    });
    check('context-window-summarize: has compressed', Array.isArray(r.compressed), 'array', typeof r.compressed);
    check('context-window-summarize: has compressed_count', typeof r.compressed_count === 'number', 'number', typeof r.compressed_count);
  });

  // ==================== #1029 data-schema-map ====================
  await safeTest('data-schema-map', async () => {
    const r = await post('data-schema-map', {
      source: { first_name: 'Alice', last_name: 'Smith', email: 'a@b.com' },
      target_schema: ['name', 'email', 'phone']
    });
    check('data-schema-map: has mapping', typeof r.mapping === 'object', 'object', typeof r.mapping);
  });

  // ==================== #1030 csv-query ====================
  await safeTest('csv-query', async () => {
    const r = await post('csv-query', {
      csv: 'name,age,city\nAlice,30,NYC\nBob,25,LA\nCharlie,35,NYC',
      query: { where: { city: 'NYC' } }
    });
    check('csv-query: has rows', Array.isArray(r.rows), 'array', typeof r.rows);
    check('csv-query: 2 NYC rows', r.count === 2, 2, r.count);
  });

  // ==================== #1031 data-join ====================
  await safeTest('data-join', async () => {
    const r = await post('data-join', {
      left: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      right: [{ id: 1, score: 95 }, { id: 3, score: 80 }],
      on: 'id',
      type: 'inner'
    });
    check('data-join: has rows', Array.isArray(r.rows), 'array', typeof r.rows);
    check('data-join: 1 inner row', r.count === 1, 1, r.count);
  });

  // ==================== #1032 data-validate-row ====================
  await safeTest('data-validate-row', async () => {
    const r = await post('data-validate-row', {
      rows: [{ name: 'Alice', age: 30 }, { name: '', age: -5 }],
      rules: [{ field: 'name', required: true }, { field: 'age', type: 'number', min: 0 }]
    });
    check('data-validate-row: has valid', typeof r.valid === 'boolean', 'boolean', typeof r.valid);
    check('data-validate-row: not valid', r.valid === false, false, r.valid);
    check('data-validate-row: has errors', Array.isArray(r.errors), 'array', typeof r.errors);
  });

  // ==================== #1033 diff-three-way ====================
  await safeTest('diff-three-way', async () => {
    const r = await post('diff-three-way', {
      base: 'line1\nline2\nline3',
      ours: 'line1\nline2-modified\nline3',
      theirs: 'line1\nline2\nline3-changed'
    });
    check('diff-three-way: has merged', typeof r.merged === 'string', 'string', typeof r.merged);
    check('diff-three-way: has conflict_count', typeof r.conflict_count === 'number', 'number', typeof r.conflict_count);
  });

  // ==================== #1034 diff-patch-apply ====================
  await safeTest('diff-patch-apply', async () => {
    const r = await post('diff-patch-apply', {
      source: 'line1\nline2\nline3',
      patch: [{ op: 'replace', line: 2, text: 'line2-new' }]
    });
    check('diff-patch-apply: has result', typeof r.result === 'string', 'string', typeof r.result);
    check('diff-patch-apply: has ops_applied', typeof r.ops_applied === 'number', 'number', typeof r.ops_applied);
  });

  // ==================== #1035 workflow-state-machine ====================
  await safeTest('workflow-state-machine', async () => {
    const r = await post('workflow-state-machine', {
      current_state: 'idle',
      event: 'start',
      transitions: [
        { from: 'idle', event: 'start', to: 'running' },
        { from: 'running', event: 'stop', to: 'idle' },
        { from: 'running', event: 'pause', to: 'paused' }
      ]
    });
    check('workflow-state-machine: current_state = running', r.current_state === 'running', 'running', r.current_state);
    check('workflow-state-machine: transitioned', r.transitioned === true, true, r.transitioned);
    check('workflow-state-machine: has available_events', Array.isArray(r.available_events), 'array', typeof r.available_events);
  });

  // ==================== #1036 dag-topological-sort ====================
  await safeTest('dag-topological-sort', async () => {
    const r = await post('dag-topological-sort', {
      tasks: [
        { id: 'A', depends_on: [] },
        { id: 'B', depends_on: ['A'] },
        { id: 'C', depends_on: ['A'] },
        { id: 'D', depends_on: ['B', 'C'] }
      ]
    });
    check('dag-topological-sort: has order', Array.isArray(r.order), 'array', typeof r.order);
    check('dag-topological-sort: A first', r.order && r.order[0] === 'A', 'A', r.order && r.order[0]);
    check('dag-topological-sort: D last', r.order && r.order[r.order.length - 1] === 'D', 'D', r.order && r.order[r.order.length - 1]);
    check('dag-topological-sort: no cycle', r.has_cycle === false, false, r.has_cycle);
  });

  // ==================== #1037 dependency-resolver ====================
  await safeTest('dependency-resolver', async () => {
    const r = await post('dependency-resolver', {
      packages: { A: ['B', 'C'], B: ['C'], C: [] }
    });
    check('dependency-resolver: has install_order', Array.isArray(r.install_order), 'array', typeof r.install_order);
    check('dependency-resolver: C first', r.install_order && r.install_order[0] === 'C', 'C', r.install_order && r.install_order[0]);
  });

  // ==================== #1038 cron-schedule-compute ====================
  await safeTest('cron-schedule-compute', async () => {
    const r = await post('cron-schedule-compute', {
      schedules: [{ name: 'backup', cron: '0 0 * * *' }],
      window_hours: 24
    });
    check('cron-schedule-compute: has schedules', Array.isArray(r.schedules), 'array', typeof r.schedules);
  });

  // ==================== #1039 guardrail-check ====================
  await safeTest('guardrail-check', async () => {
    const r = await post('guardrail-check', {
      text: 'My SSN is 123-45-6789 and visit http://example.com',
      rules: { max_length: 200, no_pii: true, no_urls: true }
    });
    check('guardrail-check: has passed', typeof r.passed === 'boolean', 'boolean', typeof r.passed);
    check('guardrail-check: not passed', r.passed === false, false, r.passed);
    check('guardrail-check: has violations', Array.isArray(r.violations), 'array', typeof r.violations);
  });

  // ==================== #1040 pii-detect-redact ====================
  await safeTest('pii-detect-redact', async () => {
    const r = await post('pii-detect-redact', {
      text: 'Call me at 555-123-4567 or email john@example.com. SSN: 123-45-6789',
      redact: true
    });
    check('pii-detect-redact: has detections', Array.isArray(r.detections), 'array', typeof r.detections);
    check('pii-detect-redact: pii_found = true', r.pii_found === true, true, r.pii_found);
    check('pii-detect-redact: has redacted', typeof r.redacted === 'string', 'string', typeof r.redacted);
  });

  // ==================== #1041 cost-estimate-llm ====================
  await safeTest('cost-estimate-llm', async () => {
    const r = await post('cost-estimate-llm', { model: 'claude-3-opus', input_tokens: 1000, output_tokens: 500 });
    check('cost-estimate-llm: has total_cost', typeof r.total_cost === 'number', 'number', typeof r.total_cost);
    check('cost-estimate-llm: has input_cost', typeof r.input_cost === 'number', 'number', typeof r.input_cost);
    check('cost-estimate-llm: has output_cost', typeof r.output_cost === 'number', 'number', typeof r.output_cost);
  });

  // ==================== #1042 audit-log-format ====================
  await safeTest('audit-log-format', async () => {
    const r = await post('audit-log-format', { actor: 'admin', action: 'delete', target: 'user:123' });
    check('audit-log-format: has entry', typeof r.entry === 'object', 'object', typeof r.entry);
    check('audit-log-format: has formatted', typeof r.formatted === 'string', 'string', typeof r.formatted);
  });

  // ==================== #1043 trace-span-create ====================
  await safeTest('trace-span-create', async () => {
    const r = await post('trace-span-create', { operation: 'db.query', trace_id: 'abc123', attributes: { table: 'users' } });
    check('trace-span-create: has span', typeof r.span === 'object', 'object', typeof r.span);
    check('trace-span-create: has span_id', typeof r.span.span_id === 'string', 'string', typeof (r.span && r.span.span_id));
  });

  // ==================== #1044 human-in-the-loop-gate ====================
  await safeTest('human-in-the-loop-gate', async () => {
    const r = await post('human-in-the-loop-gate', {
      context: 'Deploy to production',
      options: ['approve', 'reject'],
      urgency: 'high',
      timeout_minutes: 30
    });
    check('human-in-the-loop-gate: has approval_request', typeof r.approval_request === 'object', 'object', typeof r.approval_request);
    check('human-in-the-loop-gate: has id', typeof r.approval_request.id === 'string', 'string', typeof (r.approval_request && r.approval_request.id));
  });

  // ==================== #1045 capability-match ====================
  await safeTest('capability-match', async () => {
    const r = await post('capability-match', {
      task: 'analyze sales data and generate report',
      agents: [
        { name: 'DataBot', capabilities: ['data analysis', 'reporting', 'visualization'] },
        { name: 'ChatBot', capabilities: ['conversation', 'customer support'] }
      ]
    });
    check('capability-match: has ranked', Array.isArray(r.ranked), 'array', typeof r.ranked);
    check('capability-match: has best_match', typeof r.best_match === 'string', 'string', typeof r.best_match);
  });

  // ==================== #1046 prompt-template-render ====================
  await safeTest('prompt-template-render', async () => {
    const r = await post('prompt-template-render', {
      template: 'Hello {{name}}, you have {{count}} messages.',
      variables: { name: 'Alice', count: 5 }
    });
    check('prompt-template-render: has rendered', typeof r.rendered === 'string', 'string', typeof r.rendered);
    check('prompt-template-render: correct render', r.rendered === 'Hello Alice, you have 5 messages.', 'Hello Alice, you have 5 messages.', r.rendered);
  });

  // ==================== #1047 retry-policy-compute ====================
  await safeTest('retry-policy-compute', async () => {
    const r = await post('retry-policy-compute', { attempt: 3, strategy: 'exponential', base_delay: 1000, max_retries: 5, error_code: 503 });
    check('retry-policy-compute: has should_retry', typeof r.should_retry === 'boolean', 'boolean', typeof r.should_retry);
    check('retry-policy-compute: has delay_ms', typeof r.delay_ms === 'number', 'number', typeof r.delay_ms);
    check('retry-policy-compute: has is_retryable', typeof r.is_retryable === 'boolean', 'boolean', typeof r.is_retryable);
  });

  // ==================== #1048 prompt-chain-plan ====================
  await safeTest('prompt-chain-plan', async () => {
    const r = await post('prompt-chain-plan', {
      goal: 'Analyze customer feedback and generate report',
      tools: ['text-analyze', 'sentiment-analyze', 'report-generate']
    });
    check('prompt-chain-plan: has plan', Array.isArray(r.plan), 'array', typeof r.plan);
    check('prompt-chain-plan: has step_count', typeof r.step_count === 'number', 'number', typeof r.step_count);
  });

  // ==================== #1049 text-chunk-smart ====================
  await safeTest('text-chunk-smart', async () => {
    const r = await post('text-chunk-smart', {
      text: 'First sentence here. Second sentence here. Third sentence here. Fourth sentence here. Fifth sentence here.',
      max_tokens: 20,
      overlap_tokens: 5
    });
    check('text-chunk-smart: has chunks', Array.isArray(r.chunks), 'array', typeof r.chunks);
    check('text-chunk-smart: has chunk_count', typeof r.chunk_count === 'number', 'number', typeof r.chunk_count);
  });

  // ==================== #1050 vector-search-inmemory ====================
  await safeTest('vector-search-inmemory', async () => {
    const r = await post('vector-search-inmemory', {
      query: [1, 0, 0],
      corpus: [
        { vector: [1, 0, 0], text: 'A', metadata: { id: 1 } },
        { vector: [0, 1, 0], text: 'B', metadata: { id: 2 } },
        { vector: [0.9, 0.1, 0], text: 'C', metadata: { id: 3 } }
      ],
      top_k: 2
    });
    check('vector-search-inmemory: has results', Array.isArray(r.results), 'array', typeof r.results);
    check('vector-search-inmemory: top result is A', r.results && r.results[0] && r.results[0].text === 'A', 'A', r.results && r.results[0] && r.results[0].text);
  });

  // ==================== #1051 ast-parse-js ====================
  await safeTest('ast-parse-js', async () => {
    const r = await post('ast-parse-js', {
      code: "const express = require('express');\nfunction hello() { return 'hi'; }\nclass App { constructor() {} }\nmodule.exports = App;"
    });
    check('ast-parse-js: has functions', Array.isArray(r.functions), 'array', typeof r.functions);
    check('ast-parse-js: has classes', Array.isArray(r.classes), 'array', typeof r.classes);
    check('ast-parse-js: has imports', Array.isArray(r.imports), 'array', typeof r.imports);
  });

  // ==================== #1052 ast-parse-python ====================
  await safeTest('ast-parse-python', async () => {
    const r = await post('ast-parse-python', {
      code: "import os\nfrom typing import List\ndef hello(name: str) -> str:\n    return f'Hello {name}'\nclass App:\n    pass"
    });
    check('ast-parse-python: has functions', Array.isArray(r.functions), 'array', typeof r.functions);
    check('ast-parse-python: has classes', Array.isArray(r.classes), 'array', typeof r.classes);
    check('ast-parse-python: has imports', Array.isArray(r.imports), 'array', typeof r.imports);
  });

  // ==================== #1053 code-complexity-analyze ====================
  await safeTest('code-complexity-analyze', async () => {
    const r = await post('code-complexity-analyze', {
      code: 'function test(x) {\n  if (x > 0) {\n    if (x > 10) {\n      return "big";\n    } else {\n      return "small";\n    }\n  }\n  return "none";\n}'
    });
    check('code-complexity-analyze: has cyclomatic', typeof r.cyclomatic === 'number', 'number', typeof r.cyclomatic);
    check('code-complexity-analyze: has rating', typeof r.rating === 'string', 'string', typeof r.rating);
  });

  // ==================== #1054 openapi-to-tools ====================
  await safeTest('openapi-to-tools', async () => {
    const r = await post('openapi-to-tools', {
      spec: {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0' },
        paths: {
          '/users': { get: { summary: 'List users', parameters: [{ name: 'limit', in: 'query' }] } }
        }
      }
    });
    check('openapi-to-tools: has tools', Array.isArray(r.tools), 'array', typeof r.tools);
    check('openapi-to-tools: has tool_count', typeof r.tool_count === 'number', 'number', typeof r.tool_count);
  });

  // ==================== #1055 changelog-parse ====================
  await safeTest('changelog-parse', async () => {
    const r = await post('changelog-parse', {
      text: '## [1.0.0]\n### Added\n- New feature\n### Fixed\n- Bug fix\n## [0.9.0]\n### Changed\n- Updated deps'
    });
    check('changelog-parse: has versions', Array.isArray(r.versions), 'array', typeof r.versions);
    check('changelog-parse: has version_count', typeof r.version_count === 'number', 'number', typeof r.version_count);
  });

  // ==================== #1056 semver-range-resolve ====================
  await safeTest('semver-range-resolve', async () => {
    const r = await post('semver-range-resolve', {
      range: '^1.2.0',
      available: ['1.1.0', '1.2.0', '1.2.5', '1.3.0', '2.0.0']
    });
    check('semver-range-resolve: has matched', Array.isArray(r.matched), 'array', typeof r.matched);
    check('semver-range-resolve: has best', typeof r.best === 'string', 'string', typeof r.best);
  });

  // ==================== #1057 html-to-markdown ====================
  await safeTest('html-to-markdown', async () => {
    const r = await post('html-to-markdown', { html: '<h1>Title</h1><p>Hello <strong>world</strong></p><a href="http://example.com">Link</a>' });
    check('html-to-markdown: has markdown', typeof r.markdown === 'string', 'string', typeof r.markdown);
    check('html-to-markdown: contains # Title', r.markdown && r.markdown.includes('# Title'), '# Title', r.markdown && r.markdown.slice(0, 50));
  });

  // ==================== #1058 markdown-to-plaintext ====================
  await safeTest('markdown-to-plaintext', async () => {
    const r = await post('markdown-to-plaintext', { markdown: '# Title\n\n**Bold** text and [link](http://example.com)' });
    check('markdown-to-plaintext: has plaintext', typeof r.plaintext === 'string', 'string', typeof r.plaintext);
    check('markdown-to-plaintext: no markdown', !r.plaintext.includes('#') && !r.plaintext.includes('**'), 'no markdown', r.plaintext);
  });

  // ==================== #1059 yaml-to-json ====================
  await safeTest('yaml-to-json', async () => {
    const r = await post('yaml-to-json', { yaml: 'name: test\nversion: 1\nenabled: true' });
    check('yaml-to-json: has json', typeof r.json === 'object', 'object', typeof r.json);
    check('yaml-to-json: name = test', r.json && r.json.name === 'test', 'test', r.json && r.json.name);
  });

  // ==================== #1060 calendar-availability ====================
  await safeTest('calendar-availability', async () => {
    const r = await post('calendar-availability', {
      schedules: [
        { start: '2024-01-01T09:00:00Z', end: '2024-01-01T10:00:00Z' },
        { start: '2024-01-01T11:00:00Z', end: '2024-01-01T12:00:00Z' }
      ],
      day_start: '2024-01-01T08:00:00Z',
      day_end: '2024-01-01T17:00:00Z',
      minimum_duration: 30
    });
    check('calendar-availability: has available_slots', Array.isArray(r.available_slots), 'array', typeof r.available_slots);
    check('calendar-availability: has slot_count', typeof r.slot_count === 'number', 'number', typeof r.slot_count);
  });

  // ==================== #1061 priority-queue-manage ====================
  await safeTest('priority-queue-manage', async () => {
    const r = await post('priority-queue-manage', {
      queue: [{ item: 'task1', priority: 3 }, { item: 'task2', priority: 1 }],
      action: 'push',
      item: { item: 'task3', priority: 2 }
    });
    check('priority-queue-manage: has queue', Array.isArray(r.queue), 'array', typeof r.queue);
    check('priority-queue-manage: has size', typeof r.size === 'number', 'number', typeof r.size);
  });

  // ==================== #1062 feedback-loop-score ====================
  await safeTest('feedback-loop-score', async () => {
    const r = await post('feedback-loop-score', {
      predictions: [1, 0, 1, 1, 0],
      actuals: [1, 0, 0, 1, 0],
      type: 'classification'
    });
    check('feedback-loop-score: has accuracy', typeof r.accuracy === 'number', 'number', typeof r.accuracy);
    check('feedback-loop-score: accuracy = 80%', r.accuracy === 80 || r.accuracy === 0.8, '80', r.accuracy);
  });

  // ==================== #1063 agent-benchmark-score ====================
  await safeTest('agent-benchmark-score', async () => {
    const r = await post('agent-benchmark-score', {
      response: 'This is a well-structured response that addresses the question.',
      rubric: [
        { criterion: 'clarity', weight: 1, score: 8 },
        { criterion: 'accuracy', weight: 2, score: 7 }
      ]
    });
    check('agent-benchmark-score: has weighted_score', typeof r.weighted_score === 'number', 'number', typeof r.weighted_score);
    check('agent-benchmark-score: has grade', typeof r.grade === 'string', 'string', typeof r.grade);
  });

  // ==================== #1064 workflow-version-diff ====================
  await safeTest('workflow-version-diff', async () => {
    const r = await post('workflow-version-diff', {
      version_a: ['step1', 'step2', 'step3'],
      version_b: ['step1', 'step3', 'step4']
    });
    check('workflow-version-diff: has added', Array.isArray(r.added), 'array', typeof r.added);
    check('workflow-version-diff: has removed', Array.isArray(r.removed), 'array', typeof r.removed);
  });

  // ==================== #1065 image-metadata-extract ====================
  await safeTest('image-metadata-extract', async () => {
    const r = await post('image-metadata-extract', { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' });
    check('image-metadata-extract: has format', typeof r.format === 'string', 'string', typeof r.format);
    check('image-metadata-extract: detected PNG', r.format === 'png' || r.detected === 'png' || (r.format && r.format.toLowerCase().includes('png')), 'png', r.format);
  });

  // ==================== #1066 math-symbolic-simplify ====================
  await safeTest('math-symbolic-simplify', async () => {
    const r = await post('math-symbolic-simplify', { expression: 'x + 0' });
    check('math-symbolic-simplify: has simplified', typeof r.simplified === 'string', 'string', typeof r.simplified);
    check('math-symbolic-simplify: simplified = x', r.simplified === 'x', 'x', r.simplified);
  });

  // ==================== #1067 contract-abi-parse ====================
  await safeTest('contract-abi-parse', async () => {
    const r = await post('contract-abi-parse', {
      abi: [
        { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
        { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }] }
      ]
    });
    check('contract-abi-parse: has functions', Array.isArray(r.functions), 'array', typeof r.functions);
    check('contract-abi-parse: has events', Array.isArray(r.events), 'array', typeof r.events);
  });

  // ==================== #1068 tool-use-plan ====================
  await safeTest('tool-use-plan', async () => {
    const r = await post('tool-use-plan', {
      goal: 'Parse CSV data and find anomalies',
      tools: [{ name: 'csv-query', description: 'Query CSV data' }, { name: 'data-validate-row', description: 'Validate data rows' }]
    });
    check('tool-use-plan: has plan', Array.isArray(r.plan), 'array', typeof r.plan);
  });

  // ==================== #1069 json-to-yaml ====================
  await safeTest('json-to-yaml', async () => {
    const r = await post('json-to-yaml', { json: { name: 'test', version: 1, list: [1, 2, 3] } });
    check('json-to-yaml: has yaml', typeof r.yaml === 'string', 'string', typeof r.yaml);
    check('json-to-yaml: contains name', r.yaml && r.yaml.includes('name'), 'name', r.yaml && r.yaml.slice(0, 50));
  });

  // ==================== #1070 csp-header-parse ====================
  await safeTest('csp-header-parse', async () => {
    const r = await post('csp-header-parse', { header: "default-src 'self'; script-src 'unsafe-inline' https:; style-src 'self'" });
    check('csp-header-parse: has directives', typeof r.directives === 'object', 'object', typeof r.directives);
    check('csp-header-parse: has issues', Array.isArray(r.issues), 'array', typeof r.issues);
  });

  // ==================== #1071 dependency-graph-sort ====================
  await safeTest('dependency-graph-sort', async () => {
    const r = await post('dependency-graph-sort', {
      nodes: ['A', 'B', 'C'],
      edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }]
    });
    check('dependency-graph-sort: has sorted', Array.isArray(r.sorted), 'array', typeof r.sorted);
    check('dependency-graph-sort: has has_cycle', typeof r.has_cycle === 'boolean', 'boolean', typeof r.has_cycle);
  });

  // ==================== #1072 levenshtein-distance ====================
  await safeTest('levenshtein-distance', async () => {
    const r = await post('levenshtein-distance', { source: 'kitten', target: 'sitting' });
    check('levenshtein-distance: distance = 3', r.distance === 3, 3, r.distance);
    check('levenshtein-distance: has similarity', typeof r.similarity === 'number', 'number', typeof r.similarity);
  });

  // ==================== #1073 validate-email-syntax ====================
  await safeTest('validate-email-syntax', async () => {
    const r = await post('validate-email-syntax', { email: 'test@gmail.com' });
    check('validate-email-syntax: valid', r.valid === true, true, r.valid);
    check('validate-email-syntax: domain', r.domain === 'gmail.com', 'gmail.com', r.domain);
    check('validate-email-syntax: not disposable', r.is_disposable === false, false, r.is_disposable);
  });

  // ==================== #1074 validate-phone-format ====================
  await safeTest('validate-phone-format', async () => {
    const r = await post('validate-phone-format', { phone: '+14155551234' });
    check('validate-phone-format: valid', r.valid === true, true, r.valid);
    check('validate-phone-format: has country', typeof r.country === 'string', 'string', typeof r.country);
  });

  // ==================== #1075 validate-credit-card ====================
  await safeTest('validate-credit-card', async () => {
    const r = await post('validate-credit-card', { number: '4111111111111111' });
    check('validate-credit-card: valid (Luhn)', r.valid === true, true, r.valid);
    check('validate-credit-card: network = Visa', r.network === 'Visa' || r.network === 'visa', 'Visa', r.network);
  });

  // ==================== #1076 validate-iban ====================
  await safeTest('validate-iban', async () => {
    const r = await post('validate-iban', { iban: 'DE89370400440532013000' });
    check('validate-iban: valid', r.valid === true, true, r.valid);
    check('validate-iban: country = DE', r.country === 'DE', 'DE', r.country);
  });

  // ==================== #1077 validate-url-format ====================
  await safeTest('validate-url-format', async () => {
    const r = await post('validate-url-format', { url: 'https://example.com/path?q=test' });
    check('validate-url-format: valid', r.valid === true, true, r.valid);
    check('validate-url-format: is_https', r.is_https === true, true, r.is_https);
    check('validate-url-format: hostname', r.hostname === 'example.com', 'example.com', r.hostname);
  });

  // ==================== #1078 validate-ip-address ====================
  await safeTest('validate-ip-address', async () => {
    const r = await post('validate-ip-address', { ip: '192.168.1.1' });
    check('validate-ip-address: valid', r.valid === true, true, r.valid);
    check('validate-ip-address: version = 4', r.version === 4 || r.version === 'IPv4', '4', r.version);
    check('validate-ip-address: is_private', r.is_private === true, true, r.is_private);
  });

  // ==================== #1079 validate-postal-code ====================
  await safeTest('validate-postal-code', async () => {
    const r = await post('validate-postal-code', { code: '90210', country: 'US' });
    check('validate-postal-code: valid', r.valid === true, true, r.valid);
  });

  // ==================== #1080 validate-vat-number ====================
  await safeTest('validate-vat-number', async () => {
    const r = await post('validate-vat-number', { vat: 'DE123456789' });
    check('validate-vat-number: has valid', typeof r.valid === 'boolean', 'boolean', typeof r.valid);
    check('validate-vat-number: country = DE', r.country === 'DE', 'DE', r.country);
  });

  // ==================== #1081 validate-isbn ====================
  await safeTest('validate-isbn', async () => {
    const r = await post('validate-isbn', { isbn: '978-0-306-40615-7' });
    check('validate-isbn: valid', r.valid === true, true, r.valid);
    check('validate-isbn: format = ISBN-13', r.format === 'ISBN-13' || r.format === 'isbn-13' || r.format === '13', 'ISBN-13', r.format);
  });

  // ==================== #1082 validate-color-value ====================
  await safeTest('validate-color-value', async () => {
    const r = await post('validate-color-value', { color: '#FF5733' });
    check('validate-color-value: valid', r.valid === true, true, r.valid);
    check('validate-color-value: format = hex', r.format === 'hex' || r.format === 'hex6', 'hex', r.format);
  });

  // ==================== #1083 validate-mime-type ====================
  await safeTest('validate-mime-type', async () => {
    const r = await post('validate-mime-type', { mime: 'application/json' });
    check('validate-mime-type: valid', r.valid === true, true, r.valid);
    check('validate-mime-type: has extension', typeof r.extension === 'string', 'string', typeof r.extension);
  });

  // ==================== #1084 validate-domain-name ====================
  await safeTest('validate-domain-name', async () => {
    const r = await post('validate-domain-name', { domain: 'sub.example.com' });
    check('validate-domain-name: valid', r.valid === true, true, r.valid);
    check('validate-domain-name: tld = com', r.tld === 'com', 'com', r.tld);
  });

  // ==================== #1085 validate-json-schema ====================
  await safeTest('validate-json-schema', async () => {
    const r = await post('validate-json-schema', {
      schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, age: { type: 'number' } } },
      data: { name: 'Alice', age: 30 }
    });
    check('validate-json-schema: valid', r.valid === true, true, r.valid);
    check('validate-json-schema: error_count = 0', r.error_count === 0, 0, r.error_count);
  });

  // ==================== #1086 api-mock-response ====================
  await safeTest('api-mock-response', async () => {
    const r = await post('api-mock-response', {
      schema: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } }
    });
    check('api-mock-response: has status', typeof r.status === 'number', 'number', typeof r.status);
    check('api-mock-response: has body', typeof r.body === 'object', 'object', typeof r.body);
  });

  // ==================== #1087 api-mock-dataset ====================
  await safeTest('api-mock-dataset', async () => {
    const r = await post('api-mock-dataset', {
      fields: [{ name: 'id', type: 'integer' }, { name: 'email', type: 'email' }],
      count: 5
    });
    check('api-mock-dataset: has data', Array.isArray(r.data), 'array', typeof r.data);
    check('api-mock-dataset: 5 rows', r.data && r.data.length === 5, 5, r.data && r.data.length);
  });

  // ==================== #1088 api-test-assertion ====================
  await safeTest('api-test-assertion', async () => {
    const r = await post('api-test-assertion', {
      response: { status: 200, body: { id: 1, name: 'Alice' }, headers: { 'content-type': 'application/json' } },
      assertions: [
        { type: 'status', expected: 200 },
        { type: 'json_path', path: 'name', expected: 'Alice' }
      ]
    });
    check('api-test-assertion: has passed', typeof r.passed === 'boolean', 'boolean', typeof r.passed);
    check('api-test-assertion: passed', r.passed === true, true, r.passed);
    check('api-test-assertion: has results', Array.isArray(r.results), 'array', typeof r.results);
  });

  // ==================== #1089 api-request-build ====================
  await safeTest('api-request-build', async () => {
    const r = await post('api-request-build', {
      method: 'GET',
      url: 'https://api.example.com/users',
      query: { limit: 10 },
      auth: { type: 'bearer', token: 'abc123' }
    });
    check('api-request-build: has method', r.method === 'GET', 'GET', r.method);
    check('api-request-build: has url', typeof r.url === 'string', 'string', typeof r.url);
    check('api-request-build: has headers', typeof r.headers === 'object', 'object', typeof r.headers);
  });

  // ==================== #1090 api-curl-parse ====================
  await safeTest('api-curl-parse', async () => {
    const r = await post('api-curl-parse', {
      curl: "curl -X POST https://api.example.com/data -H 'Content-Type: application/json' -d '{\"key\":\"value\"}'"
    });
    check('api-curl-parse: method = POST', r.method === 'POST', 'POST', r.method);
    check('api-curl-parse: has url', typeof r.url === 'string', 'string', typeof r.url);
  });

  // ==================== #1091 api-curl-generate ====================
  await safeTest('api-curl-generate', async () => {
    const r = await post('api-curl-generate', {
      method: 'POST',
      url: 'https://api.example.com/data',
      headers: { 'Content-Type': 'application/json' },
      body: { key: 'value' }
    });
    check('api-curl-generate: has curl', typeof r.curl === 'string', 'string', typeof r.curl);
    check('api-curl-generate: starts with curl', r.curl && r.curl.startsWith('curl'), 'curl...', r.curl && r.curl.slice(0, 20));
  });

  // ==================== #1092 api-rate-limit-calc ====================
  await safeTest('api-rate-limit-calc', async () => {
    const r = await post('api-rate-limit-calc', { limit: 100, used: 80, window_seconds: 60 });
    check('api-rate-limit-calc: has remaining', typeof r.remaining === 'number', 'number', typeof r.remaining);
    check('api-rate-limit-calc: remaining = 20', r.remaining === 20, 20, r.remaining);
  });

  // ==================== #1093 api-latency-stats ====================
  await safeTest('api-latency-stats', async () => {
    const r = await post('api-latency-stats', { latencies: [50, 100, 150, 200, 250, 300, 350, 400, 450, 500] });
    check('api-latency-stats: has mean', typeof r.mean === 'number', 'number', typeof r.mean);
    check('api-latency-stats: mean = 275', r.mean === 275, 275, r.mean);
    check('api-latency-stats: has p99', typeof r.p99 === 'number', 'number', typeof r.p99);
  });

  // ==================== #1094 api-error-classify ====================
  await safeTest('api-error-classify', async () => {
    const r = await post('api-error-classify', { status_code: 503 });
    check('api-error-classify: has category', typeof r.category === 'string', 'string', typeof r.category);
    check('api-error-classify: has retry', typeof r.retry === 'boolean', 'boolean', typeof r.retry);
    check('api-error-classify: retry = true for 503', r.retry === true, true, r.retry);
  });

  // ==================== #1095 api-snippet-generate ====================
  await safeTest('api-snippet-generate', async () => {
    const r = await post('api-snippet-generate', {
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: { 'Authorization': 'Bearer token' }
    });
    check('api-snippet-generate: has snippets', typeof r.snippets === 'object', 'object', typeof r.snippets);
    check('api-snippet-generate: has curl', typeof r.snippets.curl === 'string', 'string', typeof (r.snippets && r.snippets.curl));
  });

  // ==================== #1096 api-response-diff ====================
  await safeTest('api-response-diff', async () => {
    const r = await post('api-response-diff', {
      expected: { status: 200, name: 'Alice', age: 30 },
      actual: { status: 200, name: 'Alice', age: 31 }
    });
    check('api-response-diff: has match', typeof r.match === 'boolean', 'boolean', typeof r.match);
    check('api-response-diff: match = false', r.match === false, false, r.match);
    check('api-response-diff: has diffs', Array.isArray(r.diffs), 'array', typeof r.diffs);
  });

  // ==================== #1097 api-health-score ====================
  await safeTest('api-health-score', async () => {
    const r = await post('api-health-score', {
      latency_ms: 150, error_rate: 0.01, uptime: 99.9, response_valid: true
    });
    check('api-health-score: has score', typeof r.score === 'number', 'number', typeof r.score);
    check('api-health-score: has grade', typeof r.grade === 'string', 'string', typeof r.grade);
  });

  // ==================== #1098 http-header-parse ====================
  await safeTest('http-header-parse', async () => {
    const r = await post('http-header-parse', { raw: 'Content-Type: application/json\nAuthorization: Bearer token123' });
    check('http-header-parse: has headers', typeof r.headers === 'object', 'object', typeof r.headers);
    check('http-header-parse: has count', typeof r.count === 'number', 'number', typeof r.count);
  });

  // ==================== #1099 http-header-build ====================
  await safeTest('http-header-build', async () => {
    const r = await post('http-header-build', { headers: { 'Content-Type': 'application/json', 'Accept': 'text/html' } });
    check('http-header-build: has raw', typeof r.raw === 'string', 'string', typeof r.raw);
    check('http-header-build: has count', typeof r.count === 'number', 'number', typeof r.count);
  });

  // ==================== #1100 http-querystring-build ====================
  await safeTest('http-querystring-build', async () => {
    const r = await post('http-querystring-build', { params: { q: 'hello world', page: 1 } });
    check('http-querystring-build: has querystring', typeof r.querystring === 'string', 'string', typeof r.querystring);
  });

  // ==================== #1101 http-querystring-parse ====================
  await safeTest('http-querystring-parse', async () => {
    const r = await post('http-querystring-parse', { querystring: 'q=hello+world&page=1&tags=a&tags=b' });
    check('http-querystring-parse: has params', typeof r.params === 'object', 'object', typeof r.params);
    check('http-querystring-parse: has count', typeof r.count === 'number', 'number', typeof r.count);
  });

  // ==================== #1102 http-cookie-parse ====================
  await safeTest('http-cookie-parse', async () => {
    const r = await post('http-cookie-parse', { cookie: 'session=abc123; theme=dark; lang=en' });
    check('http-cookie-parse: has cookies', typeof r.cookies === 'object', 'object', typeof r.cookies);
    check('http-cookie-parse: session = abc123', r.cookies && r.cookies.session === 'abc123', 'abc123', r.cookies && r.cookies.session);
  });

  // ==================== #1103 http-cookie-build ====================
  await safeTest('http-cookie-build', async () => {
    const r = await post('http-cookie-build', {
      name: 'session', value: 'abc123',
      domain: '.example.com', path: '/', secure: true, httpOnly: true, sameSite: 'Strict'
    });
    check('http-cookie-build: has cookie', typeof r.cookie === 'string', 'string', typeof r.cookie);
    check('http-cookie-build: contains session=abc123', r.cookie && r.cookie.includes('session=abc123'), 'session=abc123', r.cookie && r.cookie.slice(0, 50));
  });

  // ==================== #1104 http-content-negotiate ====================
  await safeTest('http-content-negotiate', async () => {
    const r = await post('http-content-negotiate', {
      accept: 'text/html, application/json;q=0.9, */*;q=0.1',
      available: ['application/json', 'text/html', 'text/plain']
    });
    check('http-content-negotiate: has selected', typeof r.selected === 'string', 'string', typeof r.selected);
    check('http-content-negotiate: selected = text/html', r.selected === 'text/html', 'text/html', r.selected);
  });

  // ==================== #1105 http-basic-auth-encode ====================
  await safeTest('http-basic-auth-encode', async () => {
    const r = await post('http-basic-auth-encode', { username: 'admin', password: 'secret' });
    check('http-basic-auth-encode: has header', typeof r.header === 'string', 'string', typeof r.header);
    check('http-basic-auth-encode: starts with Basic', r.header && r.header.startsWith('Basic '), 'Basic ...', r.header && r.header.slice(0, 10));
  });

  // ==================== #1106 http-bearer-token-extract ====================
  await safeTest('http-bearer-token-extract', async () => {
    const r = await post('http-bearer-token-extract', { authorization: 'Bearer my-secret-token-123' });
    check('http-bearer-token-extract: valid', r.valid === true, true, r.valid);
    check('http-bearer-token-extract: token', r.token === 'my-secret-token-123', 'my-secret-token-123', r.token);
  });

  // ==================== #1107 geo-country-lookup ====================
  await safeTest('geo-country-lookup', async () => {
    const r = await post('geo-country-lookup', { code: 'US' });
    check('geo-country-lookup: found', r.found === true, true, r.found);
    check('geo-country-lookup: name', r.name === 'United States', 'United States', r.name);
    check('geo-country-lookup: has capital', typeof r.capital === 'string', 'string', typeof r.capital);
  });

  // ==================== #1108 geo-timezone-lookup ====================
  await safeTest('geo-timezone-lookup', async () => {
    const r = await post('geo-timezone-lookup', { timezone: 'America/New_York' });
    check('geo-timezone-lookup: found', r.found === true, true, r.found);
    check('geo-timezone-lookup: has utc_offset', typeof r.utc_offset !== 'undefined', 'defined', typeof r.utc_offset);
  });

  // ==================== #1109 geo-coordinates-distance ====================
  await safeTest('geo-coordinates-distance', async () => {
    const r = await post('geo-coordinates-distance', {
      from: { lat: 40.7128, lon: -74.0060 },
      to: { lat: 51.5074, lon: -0.1278 }
    });
    check('geo-coordinates-distance: has distance', typeof r.distance === 'number', 'number', typeof r.distance);
    check('geo-coordinates-distance: ~5570 km', Math.abs(r.distance - 5570) < 50, '~5570', r.distance);
  });

  // ==================== #1110 geo-coordinates-to-geohash ====================
  await safeTest('geo-coordinates-to-geohash', async () => {
    const r = await post('geo-coordinates-to-geohash', { lat: 40.7128, lon: -74.0060, precision: 6 });
    check('geo-coordinates-to-geohash: has geohash', typeof r.geohash === 'string', 'string', typeof r.geohash);
    check('geo-coordinates-to-geohash: 6 chars', r.geohash && r.geohash.length === 6, 6, r.geohash && r.geohash.length);
  });

  // ==================== #1111 geo-bounding-box ====================
  await safeTest('geo-bounding-box', async () => {
    const r = await post('geo-bounding-box', { lat: 40.7128, lon: -74.0060, radius_km: 10 });
    check('geo-bounding-box: has bounds', typeof r.bounds === 'object', 'object', typeof r.bounds);
    check('geo-bounding-box: has min_lat', typeof r.bounds.min_lat === 'number', 'number', typeof (r.bounds && r.bounds.min_lat));
  });

  // ==================== #1112 currency-info-lookup ====================
  await safeTest('currency-info-lookup', async () => {
    const r = await post('currency-info-lookup', { code: 'USD' });
    check('currency-info-lookup: found', r.found === true, true, r.found);
    check('currency-info-lookup: symbol = $', r.symbol === '$', '$', r.symbol);
  });

  // ==================== #1113 locale-info-lookup ====================
  await safeTest('locale-info-lookup', async () => {
    const r = await post('locale-info-lookup', { locale: 'en-US' });
    check('locale-info-lookup: found', r.found === true, true, r.found);
    check('locale-info-lookup: has date_format', typeof r.date_format === 'string', 'string', typeof r.date_format);
  });

  // ==================== #1114 language-info-lookup ====================
  await safeTest('language-info-lookup', async () => {
    const r = await post('language-info-lookup', { code: 'en' });
    check('language-info-lookup: found', r.found === true, true, r.found);
    check('language-info-lookup: name = English', r.name === 'English', 'English', r.name);
  });

  // ==================== #1115 http-status-info ====================
  await safeTest('http-status-info', async () => {
    const r = await post('http-status-info', { code: 404 });
    check('http-status-info: has name', typeof r.name === 'string', 'string', typeof r.name);
    check('http-status-info: name = Not Found', r.name === 'Not Found', 'Not Found', r.name);
    check('http-status-info: is_error = true', r.is_error === true, true, r.is_error);
  });

  // ==================== #1116 http-url-parse ====================
  await safeTest('http-url-parse', async () => {
    const r = await post('http-url-parse', { url: 'https://example.com:8080/path?q=test#section' });
    check('http-url-parse: protocol = https:', r.protocol === 'https:' || r.protocol === 'https', 'https', r.protocol);
    check('http-url-parse: hostname = example.com', r.hostname === 'example.com', 'example.com', r.hostname);
  });

  // ==================== #1117 http-form-encode ====================
  await safeTest('http-form-encode', async () => {
    const r = await post('http-form-encode', { fields: { name: 'John Doe', email: 'john@test.com' } });
    check('http-form-encode: has body', typeof r.body === 'string', 'string', typeof r.body);
    check('http-form-encode: has content_type', typeof r.content_type === 'string', 'string', typeof r.content_type);
  });

  // ==================== #1118 finance-npv ====================
  await safeTest('finance-npv', async () => {
    const r = await post('finance-npv', { cash_flows: [-1000, 300, 400, 500, 600], discount_rate: 0.1 });
    check('finance-npv: has npv', typeof r.npv === 'number', 'number', typeof r.npv);
    check('finance-npv: has profitable', typeof r.profitable === 'boolean', 'boolean', typeof r.profitable);
  });

  // ==================== #1119 finance-irr ====================
  await safeTest('finance-irr', async () => {
    const r = await post('finance-irr', { cash_flows: [-1000, 300, 400, 500, 600] });
    check('finance-irr: has irr', typeof r.irr === 'number', 'number', typeof r.irr);
  });

  // ==================== #1120 finance-break-even ====================
  await safeTest('finance-break-even', async () => {
    const r = await post('finance-break-even', { fixed_costs: 10000, price: 50, variable_cost: 20 });
    check('finance-break-even: has break_even_units', typeof r.break_even_units === 'number', 'number', typeof r.break_even_units);
    check('finance-break-even: units ~333.33', Math.abs(r.break_even_units - 333.33) < 1, '~333.33', r.break_even_units);
  });

  // ==================== #1121 finance-invoice-calc ====================
  await safeTest('finance-invoice-calc', async () => {
    const r = await post('finance-invoice-calc', {
      items: [{ description: 'Widget', quantity: 10, unit_price: 25 }],
      tax_rate: 0.08, discount: 10, shipping: 15
    });
    check('finance-invoice-calc: has subtotal', typeof r.subtotal === 'number', 'number', typeof r.subtotal);
    check('finance-invoice-calc: subtotal = 250', r.subtotal === 250, 250, r.subtotal);
    check('finance-invoice-calc: has total', typeof r.total === 'number', 'number', typeof r.total);
  });

  // ==================== #1122 finance-subscription-metrics ====================
  await safeTest('finance-subscription-metrics', async () => {
    const r = await post('finance-subscription-metrics', {
      history: [
        { month: '2024-01', subscribers: 100, revenue: 2900 },
        { month: '2024-02', subscribers: 110, revenue: 3190 },
        { month: '2024-03', subscribers: 105, revenue: 3045 }
      ]
    });
    check('finance-subscription-metrics: has mrr', typeof r.mrr === 'number', 'number', typeof r.mrr);
    check('finance-subscription-metrics: has arr', typeof r.arr === 'number', 'number', typeof r.arr);
  });

  // ==================== #1123 template-email-html ====================
  await safeTest('template-email-html', async () => {
    const r = await post('template-email-html', {
      subject: 'Welcome!', body: 'Hello and welcome.', cta: { text: 'Get Started', url: 'https://example.com' }
    });
    check('template-email-html: has html', typeof r.html === 'string', 'string', typeof r.html);
    check('template-email-html: contains Welcome', r.html && r.html.includes('Welcome'), 'Welcome', r.html && r.html.slice(0, 50));
  });

  // ==================== #1124 template-email-plain ====================
  await safeTest('template-email-plain', async () => {
    const r = await post('template-email-plain', { html: '<h1>Hello</h1><p>World <a href="https://example.com">click here</a></p>' });
    check('template-email-plain: has text', typeof r.text === 'string', 'string', typeof r.text);
  });

  // ==================== #1125 template-sms-truncate ====================
  await safeTest('template-sms-truncate', async () => {
    const r = await post('template-sms-truncate', { message: 'Hello, this is a test SMS message.' });
    check('template-sms-truncate: has segments', typeof r.segments === 'number', 'number', typeof r.segments);
    check('template-sms-truncate: segments = 1', r.segments === 1, 1, r.segments);
  });

  // ==================== #1126 template-interpolate ====================
  await safeTest('template-interpolate', async () => {
    const r = await post('template-interpolate', {
      template: 'Hello {{name}}, welcome to {{place}}!',
      variables: { name: 'Alice', place: 'Wonderland' }
    });
    check('template-interpolate: has rendered', typeof r.rendered === 'string', 'string', typeof r.rendered);
    check('template-interpolate: correct', r.rendered === 'Hello Alice, welcome to Wonderland!', 'Hello Alice, welcome to Wonderland!', r.rendered);
  });

  // ==================== #1127 media-detect-format ====================
  await safeTest('media-detect-format', async () => {
    const r = await post('media-detect-format', { base64: '/9j/4AAQSkZJRgABAQ' });
    check('media-detect-format: has mime', typeof r.mime === 'string', 'string', typeof r.mime);
    check('media-detect-format: jpeg detected', r.mime && r.mime.includes('jpeg'), 'image/jpeg', r.mime);
  });

  // ==================== #1128 media-data-uri-parse ====================
  await safeTest('media-data-uri-parse', async () => {
    const r = await post('media-data-uri-parse', { uri: 'data:text/plain;base64,SGVsbG8=' });
    check('media-data-uri-parse: valid', r.valid === true, true, r.valid);
    check('media-data-uri-parse: mime = text/plain', r.mime === 'text/plain', 'text/plain', r.mime);
  });

  // ==================== #1129 media-data-uri-build ====================
  await safeTest('media-data-uri-build', async () => {
    const r = await post('media-data-uri-build', { mime: 'text/plain', data: 'SGVsbG8=', encoding: 'base64' });
    check('media-data-uri-build: has uri', typeof r.uri === 'string', 'string', typeof r.uri);
    check('media-data-uri-build: starts with data:', r.uri && r.uri.startsWith('data:'), 'data:...', r.uri && r.uri.slice(0, 20));
  });

  // ==================== #1130 media-aspect-ratio ====================
  await safeTest('media-aspect-ratio', async () => {
    const r = await post('media-aspect-ratio', { width: 1920, height: 1080 });
    check('media-aspect-ratio: ratio = 16:9', r.ratio === '16:9', '16:9', r.ratio);
    check('media-aspect-ratio: has decimal', typeof r.decimal === 'number', 'number', typeof r.decimal);
  });

  // ==================== #1131 media-color-accessibility ====================
  await safeTest('media-color-accessibility', async () => {
    const r = await post('media-color-accessibility', { foreground: '#000000', background: '#FFFFFF' });
    check('media-color-accessibility: has contrast_ratio', typeof r.contrast_ratio === 'number', 'number', typeof r.contrast_ratio);
    check('media-color-accessibility: ratio = 21', r.contrast_ratio === 21, 21, r.contrast_ratio);
    check('media-color-accessibility: aa_normal = true', r.aa_normal === true, true, r.aa_normal);
    check('media-color-accessibility: aaa_normal = true', r.aaa_normal === true, true, r.aaa_normal);
  });

  // ==================== #1132 media-svg-optimize ====================
  await safeTest('media-svg-optimize', async () => {
    const r = await post('media-svg-optimize', { svg: '<svg>  <!-- comment -->  <rect   width="100"   height="200"  /> </svg>' });
    check('media-svg-optimize: has svg', typeof r.svg === 'string', 'string', typeof r.svg);
    check('media-svg-optimize: no comment', !r.svg.includes('<!--'), 'no comment', r.svg);
  });

  // ==================== #1133 dev-env-validate ====================
  await safeTest('dev-env-validate', async () => {
    const r = await post('dev-env-validate', { content: 'DB_HOST=localhost\nDB_PORT=5432\nINVALID KEY=bad\n' });
    check('dev-env-validate: has valid', typeof r.valid === 'boolean', 'boolean', typeof r.valid);
    check('dev-env-validate: not valid', r.valid === false, false, r.valid);
    check('dev-env-validate: has errors', Array.isArray(r.errors), 'array', typeof r.errors);
  });

  // ==================== #1134 dev-gitignore-check ====================
  await safeTest('dev-gitignore-check', async () => {
    const r = await post('dev-gitignore-check', {
      path: 'node_modules/express/index.js',
      patterns: ['node_modules/', '*.log', '.env']
    });
    check('dev-gitignore-check: ignored', r.ignored === true, true, r.ignored);
  });

  // ==================== #1135 dev-dependency-tree ====================
  await safeTest('dev-dependency-tree', async () => {
    const r = await post('dev-dependency-tree', {
      package_json: { dependencies: { express: '^4.18.0' }, devDependencies: { jest: '^29.0.0' } }
    });
    check('dev-dependency-tree: has dependencies', Array.isArray(r.dependencies), 'array', typeof r.dependencies);
    check('dev-dependency-tree: has total', typeof r.total === 'number', 'number', typeof r.total);
  });

  // ==================== #1136 dev-license-detect ====================
  await safeTest('dev-license-detect', async () => {
    const r = await post('dev-license-detect', { text: 'MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...' });
    check('dev-license-detect: license = MIT', r.license === 'MIT', 'MIT', r.license);
    check('dev-license-detect: permissive', r.permissive === true, true, r.permissive);
  });

  // ==================== #1137 dev-release-version ====================
  await safeTest('dev-release-version', async () => {
    const r = await post('dev-release-version', {
      current: '1.2.3',
      commits: ['feat: add new feature', 'fix: bug fix', 'chore: update deps']
    });
    check('dev-release-version: has next', typeof r.next === 'string', 'string', typeof r.next);
    check('dev-release-version: bump = minor', r.bump === 'minor', 'minor', r.bump);
    check('dev-release-version: next = 1.3.0', r.next === '1.3.0', '1.3.0', r.next);
  });

  // ==================== #1138 dev-config-merge ====================
  await safeTest('dev-config-merge', async () => {
    const r = await post('dev-config-merge', {
      configs: [{ a: 1, b: 2 }, { b: 3, c: 4 }, { d: 5 }]
    });
    check('dev-config-merge: has merged', typeof r.merged === 'object', 'object', typeof r.merged);
    check('dev-config-merge: b = 3 (last wins)', r.merged && r.merged.b === 3, 3, r.merged && r.merged.b);
  });

  // ==================== #1139 dev-feature-flag-eval ====================
  await safeTest('dev-feature-flag-eval', async () => {
    const r = await post('dev-feature-flag-eval', {
      flag: 'new_ui',
      rules: [{ type: 'allowlist', users: ['alice', 'bob'] }],
      context: { user: 'alice' }
    });
    check('dev-feature-flag-eval: has enabled', typeof r.enabled === 'boolean', 'boolean', typeof r.enabled);
    check('dev-feature-flag-eval: enabled = true (alice in allowlist)', r.enabled === true, true, r.enabled);
  });

  // ==================== #1140 dev-migration-sql-parse ====================
  await safeTest('dev-migration-sql-parse', async () => {
    const r = await post('dev-migration-sql-parse', {
      sql: 'CREATE TABLE users (id INT, name VARCHAR(255));\nALTER TABLE orders ADD COLUMN status VARCHAR(50);\nDROP TABLE temp_data;'
    });
    check('dev-migration-sql-parse: has operations', Array.isArray(r.operations), 'array', typeof r.operations);
    check('dev-migration-sql-parse: destructive', r.destructive === true, true, r.destructive);
    check('dev-migration-sql-parse: has tables_dropped', typeof r.tables_dropped === 'number', 'number', typeof r.tables_dropped);
  });

  // ==================== #1141 data-csv-stats ====================
  await safeTest('data-csv-stats', async () => {
    const r = await post('data-csv-stats', { csv: 'name,age,score\nAlice,30,95\nBob,25,88\nCharlie,35,92' });
    check('data-csv-stats: has columns', Array.isArray(r.columns), 'array', typeof r.columns);
    check('data-csv-stats: has rows', typeof r.rows === 'number', 'number', typeof r.rows);
  });

  // ==================== #1142 data-schema-infer ====================
  await safeTest('data-schema-infer', async () => {
    const r = await post('data-schema-infer', {
      records: [{ name: 'Alice', age: 30, active: true }, { name: 'Bob', age: null, active: false }]
    });
    check('data-schema-infer: has schema', typeof r.schema === 'object', 'object', typeof r.schema);
    check('data-schema-infer: has fields', typeof r.fields === 'number', 'number', typeof r.fields);
  });

  // ==================== #1143 data-normalize-records ====================
  await safeTest('data-normalize-records', async () => {
    const r = await post('data-normalize-records', {
      records: [{ name: '  Alice  ', age: '30', active: 'true' }],
      schema: { name: 'string', age: 'number', active: 'boolean' }
    });
    check('data-normalize-records: has records', Array.isArray(r.records), 'array', typeof r.records);
    check('data-normalize-records: name trimmed', r.records && r.records[0] && r.records[0].name === 'Alice', 'Alice', r.records && r.records[0] && r.records[0].name);
  });

  // ==================== #1144 data-dedup-records ====================
  await safeTest('data-dedup-records', async () => {
    const r = await post('data-dedup-records', {
      records: [{ id: 1, name: 'Alice' }, { id: 1, name: 'Alice B' }, { id: 2, name: 'Bob' }],
      key_fields: ['id'],
      strategy: 'first'
    });
    check('data-dedup-records: has records', Array.isArray(r.records), 'array', typeof r.records);
    check('data-dedup-records: deduped = 2', r.deduped === 2, 2, r.deduped);
    check('data-dedup-records: removed = 1', r.removed === 1, 1, r.removed);
  });

  // ==================== #1145 data-rolling-window ====================
  await safeTest('data-rolling-window', async () => {
    const r = await post('data-rolling-window', { data: [10, 20, 30, 40, 50], window_size: 3, operation: 'avg' });
    check('data-rolling-window: has result', Array.isArray(r.result), 'array', typeof r.result);
    check('data-rolling-window: correct values', r.result && r.result[2] === 20, 20, r.result && r.result[2]);
  });

  // ==================== #1146 data-correlation-matrix ====================
  await safeTest('data-correlation-matrix', async () => {
    const r = await post('data-correlation-matrix', {
      data: { x: [1, 2, 3, 4, 5], y: [2, 4, 6, 8, 10], z: [5, 4, 3, 2, 1] }
    });
    check('data-correlation-matrix: has matrix', typeof r.matrix === 'object', 'object', typeof r.matrix);
    check('data-correlation-matrix: has variables', Array.isArray(r.variables), 'array', typeof r.variables);
  });

  // ==================== #1147 data-sql-to-json-filter ====================
  await safeTest('data-sql-to-json-filter', async () => {
    const r = await post('data-sql-to-json-filter', {
      data: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }, { name: 'Charlie', age: 35 }],
      where: 'age > 28'
    });
    check('data-sql-to-json-filter: has filtered', Array.isArray(r.filtered), 'array', typeof r.filtered);
    check('data-sql-to-json-filter: count = 2', r.count === 2, 2, r.count);
  });

  // ==================== #1148 auth-api-key-generate ====================
  await safeTest('auth-api-key-generate', async () => {
    const r = await post('auth-api-key-generate', { prefix: 'sk', length: 32 });
    check('auth-api-key-generate: has key', typeof r.key === 'string', 'string', typeof r.key);
    check('auth-api-key-generate: starts with sk', r.key && r.key.startsWith('sk'), 'sk...', r.key && r.key.slice(0, 5));
  });

  // ==================== #1149 auth-oauth-state-generate ====================
  await safeTest('auth-oauth-state-generate', async () => {
    const r = await post('auth-oauth-state-generate', { extra: { redirect: '/dashboard' } });
    check('auth-oauth-state-generate: has state', typeof r.state === 'string', 'string', typeof r.state);
    check('auth-oauth-state-generate: has csrf_token', typeof r.csrf_token === 'string', 'string', typeof r.csrf_token);
  });

  // ==================== #1150 auth-scope-check ====================
  await safeTest('auth-scope-check', async () => {
    const r = await post('auth-scope-check', {
      required: ['read:users', 'write:users'],
      granted: ['read:users', 'write:users', 'read:posts']
    });
    check('auth-scope-check: authorized', r.authorized === true, true, r.authorized);
    check('auth-scope-check: no missing', Array.isArray(r.missing) && r.missing.length === 0, '[]', JSON.stringify(r.missing));
  });

  // ==================== #1151 auth-rbac-check ====================
  await safeTest('auth-rbac-check', async () => {
    const r = await post('auth-rbac-check', {
      user_roles: ['editor'],
      required: 'publish',
      role_permissions: { admin: ['*'], editor: ['read', 'write', 'publish'], viewer: ['read'] }
    });
    check('auth-rbac-check: allowed', r.allowed === true, true, r.allowed);
  });

  // ==================== #1152 auth-password-policy-check ====================
  await safeTest('auth-password-policy-check', async () => {
    const r = await post('auth-password-policy-check', { password: 'MyStr0ng!Pass' });
    check('auth-password-policy-check: has valid', typeof r.valid === 'boolean', 'boolean', typeof r.valid);
    check('auth-password-policy-check: has checks', typeof r.checks === 'object', 'object', typeof r.checks);
    check('auth-password-policy-check: has strength', typeof r.strength === 'string', 'string', typeof r.strength);
  });

  // ==================== #1153 security-csp-parse ====================
  await safeTest('security-csp-parse', async () => {
    const r = await post('security-csp-parse', { header: "default-src 'self'; script-src 'unsafe-inline'" });
    check('security-csp-parse: has directives', typeof r.directives === 'object', 'object', typeof r.directives);
    check('security-csp-parse: has count', typeof r.count === 'number', 'number', typeof r.count);
  });

  // ==================== #1154 security-cors-validate ====================
  await safeTest('security-cors-validate', async () => {
    const r = await post('security-cors-validate', {
      origin: 'https://example.com',
      allowed_origins: ['https://example.com', 'https://app.example.com']
    });
    check('security-cors-validate: origin_allowed', r.origin_allowed === true, true, r.origin_allowed);
  });

  // ==================== #1155 security-header-audit ====================
  await safeTest('security-header-audit', async () => {
    const r = await post('security-header-audit', {
      headers: { 'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff' }
    });
    check('security-header-audit: has checks', Array.isArray(r.checks), 'array', typeof r.checks);
    check('security-header-audit: has score', typeof r.score === 'number', 'number', typeof r.score);
    check('security-header-audit: has grade', typeof r.grade === 'string', 'string', typeof r.grade);
  });

  // ==================== #1156 security-jwt-claims-validate ====================
  await safeTest('security-jwt-claims-validate', async () => {
    const r = await post('security-jwt-claims-validate', {
      claims: { sub: 'user123', exp: Math.floor(Date.now() / 1000) + 3600, iss: 'auth.example.com' },
      rules: [
        { claim: 'sub', type: 'exists' },
        { claim: 'exp', type: 'not_expired' },
        { claim: 'iss', type: 'equals', value: 'auth.example.com' }
      ]
    });
    check('security-jwt-claims-validate: valid', r.valid === true, true, r.valid);
    check('security-jwt-claims-validate: has results', Array.isArray(r.results), 'array', typeof r.results);
  });

  // ==================== #1157 security-url-sanitize ====================
  await safeTest('security-url-sanitize', async () => {
    const r = await post('security-url-sanitize', { url: 'https://example.com/page?utm_source=twitter&fbclid=abc&q=test' });
    check('security-url-sanitize: has sanitized', typeof r.sanitized === 'string', 'string', typeof r.sanitized);
    check('security-url-sanitize: tracking removed', typeof r.tracking_params_removed === 'number' && r.tracking_params_removed > 0, '>0', r.tracking_params_removed);
    check('security-url-sanitize: safe', r.safe === true, true, r.safe);
  });

  // ==================== #1158 geo-point-in-polygon ====================
  await safeTest('geo-point-in-polygon', async () => {
    const r = await post('geo-point-in-polygon', {
      point: { lat: 40.7128, lon: -74.0060 },
      polygon: [
        { lat: 40.0, lon: -75.0 },
        { lat: 41.0, lon: -75.0 },
        { lat: 41.0, lon: -73.0 },
        { lat: 40.0, lon: -73.0 }
      ]
    });
    check('geo-point-in-polygon: inside', r.inside === true, true, r.inside);
  });

  // ==================== #1159 finance-margin-calc ====================
  await safeTest('finance-margin-calc', async () => {
    const r = await post('finance-margin-calc', { revenue: 100, cost: 60 });
    check('finance-margin-calc: has margin', typeof r.margin === 'number', 'number', typeof r.margin);
    check('finance-margin-calc: margin = 40', r.margin === 40, 40, r.margin);
    check('finance-margin-calc: has margin_pct', typeof r.margin_pct === 'number', 'number', typeof r.margin_pct);
  });

  // ==================== #1160 finance-tip-split ====================
  await safeTest('finance-tip-split', async () => {
    const r = await post('finance-tip-split', { bill: 100, tip_pct: 20, people: 4 });
    check('finance-tip-split: tip = 20', r.tip === 20, 20, r.tip);
    check('finance-tip-split: total = 120', r.total === 120, 120, r.total);
    check('finance-tip-split: per_person = 30', r.per_person === 30, 30, r.per_person);
  });

  // ==================== #1161 finance-salary-to-hourly ====================
  await safeTest('finance-salary-to-hourly', async () => {
    const r = await post('finance-salary-to-hourly', { annual: 104000, hours_per_week: 40 });
    check('finance-salary-to-hourly: hourly = 50', r.hourly === 50, 50, r.hourly);
    check('finance-salary-to-hourly: has monthly', typeof r.monthly === 'number', 'number', typeof r.monthly);
  });

  // ==================== #1162 data-pivot-table ====================
  await safeTest('data-pivot-table', async () => {
    const r = await post('data-pivot-table', {
      records: [
        { region: 'East', product: 'A', sales: 100 },
        { region: 'East', product: 'B', sales: 200 },
        { region: 'West', product: 'A', sales: 150 }
      ],
      row_key: 'region', col_key: 'product', value_key: 'sales', aggregation: 'sum'
    });
    check('data-pivot-table: has pivot', typeof r.pivot === 'object', 'object', typeof r.pivot);
    check('data-pivot-table: has columns', Array.isArray(r.columns), 'array', typeof r.columns);
  });

  // ==================== #1163 data-json-flatten ====================
  await safeTest('data-json-flatten', async () => {
    const r = await post('data-json-flatten', { data: { a: { b: { c: 1 } }, d: 2 }, delimiter: '.' });
    check('data-json-flatten: has flattened', typeof r.flattened === 'object', 'object', typeof r.flattened);
    check('data-json-flatten: a.b.c = 1', r.flattened && r.flattened['a.b.c'] === 1, 1, r.flattened && r.flattened['a.b.c']);
  });

  // ==================== #1164 data-json-unflatten ====================
  await safeTest('data-json-unflatten', async () => {
    const r = await post('data-json-unflatten', { data: { 'a.b.c': 1, 'd': 2 } });
    check('data-json-unflatten: has unflattened', typeof r.unflattened === 'object', 'object', typeof r.unflattened);
  });

  // ==================== #1165 dev-semver-compare ====================
  await safeTest('dev-semver-compare', async () => {
    const r = await post('dev-semver-compare', { version_a: '1.2.3', version_b: '1.3.0' });
    check('dev-semver-compare: has result', typeof r.result === 'number' || typeof r.comparison === 'string', 'defined', JSON.stringify(r).slice(0, 100));
  });

  // ==================== #1166 dev-cron-describe ====================
  await safeTest('dev-cron-describe', async () => {
    const r = await post('dev-cron-describe', { expression: '0 9 * * 1-5' });
    check('dev-cron-describe: has description', typeof r.description === 'string', 'string', typeof r.description);
    check('dev-cron-describe: valid', r.valid === true, true, r.valid);
  });

  // ==================== #1167 dev-regex-test ====================
  await safeTest('dev-regex-test', async () => {
    const r = await post('dev-regex-test', {
      pattern: '\\d+',
      flags: 'g',
      strings: ['hello 123 world 456', 'no digits here']
    });
    check('dev-regex-test: has results', Array.isArray(r.results), 'array', typeof r.results);
    check('dev-regex-test: valid', r.valid === true, true, r.valid);
  });

  // ==================== #1168 security-hash-compare ====================
  await safeTest('security-hash-compare', async () => {
    const r = await post('security-hash-compare', { hash_a: 'abc123', hash_b: 'abc123' });
    check('security-hash-compare: match = true', r.match === true, true, r.match);
    check('security-hash-compare: timing_safe', r.timing_safe === true, true, r.timing_safe);
  });

  // ==================== #1169 security-entropy-check ====================
  await safeTest('security-entropy-check', async () => {
    const r = await post('security-entropy-check', { text: 'aB3$fG7!kL9@mN1#' });
    check('security-entropy-check: has entropy_per_char', typeof r.entropy_per_char === 'number', 'number', typeof r.entropy_per_char);
    check('security-entropy-check: has strength', typeof r.strength === 'string', 'string', typeof r.strength);
  });

  // ==================== #1170 template-webhook-payload ====================
  await safeTest('template-webhook-payload', async () => {
    const r = await post('template-webhook-payload', {
      event: 'user.created',
      data: { user_id: 'u123', email: 'test@test.com' },
      secret: 'webhook-secret'
    });
    check('template-webhook-payload: has payload', typeof r.payload === 'object', 'object', typeof r.payload);
    check('template-webhook-payload: has signature', typeof r.signature === 'string', 'string', typeof r.signature);
  });

  // ==================== #1171 media-palette-extract ====================
  await safeTest('media-palette-extract', async () => {
    const r = await post('media-palette-extract', { colors: ['#FF0000', '#00FF00', '#0000FF'] });
    check('media-palette-extract: has colors', Array.isArray(r.colors), 'array', typeof r.colors);
    check('media-palette-extract: count = 3', r.count === 3, 3, r.count);
    check('media-palette-extract: has theme', typeof r.theme === 'string', 'string', typeof r.theme);
  });

  // ==================== #1172 finance-depreciation ====================
  await safeTest('finance-depreciation', async () => {
    const r = await post('finance-depreciation', { cost: 10000, salvage: 1000, useful_life: 5, method: 'straight-line' });
    check('finance-depreciation: has schedule', Array.isArray(r.schedule), 'array', typeof r.schedule);
    check('finance-depreciation: 5 years', r.schedule && r.schedule.length === 5, 5, r.schedule && r.schedule.length);
  });

  // ==================== #1173 string-escape ====================
  await safeTest('string-escape', async () => {
    const r = await post('string-escape', { text: '<script>alert("xss")</script>', format: 'html' });
    check('string-escape: has result', typeof r.result === 'string', 'string', typeof r.result);
    check('string-escape: escaped', r.result && r.result.includes('&lt;'), '&lt;', r.result && r.result.slice(0, 50));
  });

  // ==================== #1174 string-unescape ====================
  await safeTest('string-unescape', async () => {
    const r = await post('string-unescape', { text: '&lt;p&gt;Hello&lt;/p&gt;', format: 'html' });
    check('string-unescape: has result', typeof r.result === 'string', 'string', typeof r.result);
    check('string-unescape: unescaped', r.result && r.result.includes('<p>'), '<p>', r.result);
  });

  // ==================== #1175 string-between ====================
  await safeTest('string-between', async () => {
    const r = await post('string-between', { text: 'Hello [world] and [universe]', start: '[', end: ']' });
    check('string-between: has result/matches', typeof r.result === 'string' || Array.isArray(r.matches), 'defined', JSON.stringify(r).slice(0, 100));
  });

  // ==================== #1176 string-mask ====================
  await safeTest('string-mask', async () => {
    const r = await post('string-mask', { text: '4111111111111111', visible_start: 4, visible_end: 4 });
    check('string-mask: has masked', typeof r.masked === 'string', 'string', typeof r.masked);
    check('string-mask: starts with 4111', r.masked && r.masked.startsWith('4111'), '4111...', r.masked && r.masked.slice(0, 8));
    check('string-mask: ends with 1111', r.masked && r.masked.endsWith('1111'), '...1111', r.masked && r.masked.slice(-8));
  });

  // ==================== #1177 regex-build ====================
  await safeTest('regex-build', async () => {
    const r = await post('regex-build', { pattern: '\\d{3}-\\d{4}', flags: 'g', test: '555-1234 and 666-7890' });
    check('regex-build: valid', r.valid === true, true, r.valid);
    check('regex-build: has match_count', typeof r.match_count === 'number', 'number', typeof r.match_count);
    check('regex-build: 2 matches', r.match_count === 2, 2, r.match_count);
  });

  // ==================== #1178 regex-extract-groups ====================
  await safeTest('regex-extract-groups', async () => {
    const r = await post('regex-extract-groups', {
      pattern: '(\\d{4})-(\\d{2})-(\\d{2})',
      text: 'Date: 2024-01-15 and 2024-06-30'
    });
    check('regex-extract-groups: has matches', Array.isArray(r.matches), 'array', typeof r.matches);
    check('regex-extract-groups: count = 2', r.count === 2, 2, r.count);
  });

  // ==================== #1179 fuzzy-match ====================
  await safeTest('fuzzy-match', async () => {
    const r = await post('fuzzy-match', {
      query: 'javscript',
      candidates: ['JavaScript', 'Python', 'TypeScript', 'Java'],
      threshold: 0.3
    });
    check('fuzzy-match: has matches', Array.isArray(r.matches), 'array', typeof r.matches);
    check('fuzzy-match: has best', typeof r.best !== 'undefined', 'defined', typeof r.best);
  });

  // ==================== #1180 text-diff-words ====================
  await safeTest('text-diff-words', async () => {
    const r = await post('text-diff-words', { text_a: 'the quick brown fox', text_b: 'the slow brown dog' });
    check('text-diff-words: has added', Array.isArray(r.added), 'array', typeof r.added);
    check('text-diff-words: has removed', Array.isArray(r.removed), 'array', typeof r.removed);
    check('text-diff-words: has similarity', typeof r.similarity === 'number', 'number', typeof r.similarity);
  });

  // ==================== #1181 text-ngrams ====================
  await safeTest('text-ngrams', async () => {
    const r = await post('text-ngrams', { text: 'the cat sat on the mat', n: 2 });
    check('text-ngrams: has ngrams', Array.isArray(r.ngrams), 'array', typeof r.ngrams);
    check('text-ngrams: has total', typeof r.total === 'number', 'number', typeof r.total);
  });

  // ==================== #1182 text-tokenize ====================
  await safeTest('text-tokenize', async () => {
    const r = await post('text-tokenize', { text: 'Hello world. How are you?', method: 'word' });
    check('text-tokenize: has tokens', Array.isArray(r.tokens), 'array', typeof r.tokens);
    check('text-tokenize: has count', typeof r.count === 'number', 'number', typeof r.count);
  });

  // ==================== #1183 data-flatten-deep ====================
  await safeTest('data-flatten-deep', async () => {
    const r = await post('data-flatten-deep', { data: { a: { b: { c: 1 } } }, separator: '.' });
    check('data-flatten-deep: has flattened', typeof r.flattened === 'object', 'object', typeof r.flattened);
  });

  // ==================== #1184 data-unflatten ====================
  await safeTest('data-unflatten', async () => {
    const r = await post('data-unflatten', { data: { 'a.b': 1, 'a.c': 2 }, separator: '.' });
    check('data-unflatten: has unflattened', typeof r.unflattened === 'object', 'object', typeof r.unflattened);
  });

  // ==================== #1185 data-pick ====================
  await safeTest('data-pick', async () => {
    const r = await post('data-pick', { data: { a: 1, b: 2, c: 3 }, keys: ['a', 'c'] });
    check('data-pick: has result', typeof r.result === 'object', 'object', typeof r.result);
    check('data-pick: a = 1', r.result && r.result.a === 1, 1, r.result && r.result.a);
    check('data-pick: no b', r.result && r.result.b === undefined, 'undefined', r.result && r.result.b);
  });

  // ==================== #1186 data-omit ====================
  await safeTest('data-omit', async () => {
    const r = await post('data-omit', { data: { a: 1, b: 2, c: 3 }, keys: ['b'] });
    check('data-omit: has result', typeof r.result === 'object', 'object', typeof r.result);
    check('data-omit: no b', r.result && r.result.b === undefined, 'undefined', r.result && r.result.b);
    check('data-omit: has a', r.result && r.result.a === 1, 1, r.result && r.result.a);
  });

  // ==================== #1187 data-rename-keys ====================
  await safeTest('data-rename-keys', async () => {
    const r = await post('data-rename-keys', { data: { old_name: 'Alice' }, mapping: { old_name: 'name' } });
    check('data-rename-keys: has result', typeof r.result === 'object', 'object', typeof r.result);
    check('data-rename-keys: name = Alice', r.result && r.result.name === 'Alice', 'Alice', r.result && r.result.name);
  });

  // ==================== #1188 data-deep-merge ====================
  await safeTest('data-deep-merge', async () => {
    const r = await post('data-deep-merge', { objects: [{ a: { x: 1 } }, { a: { y: 2 }, b: 3 }] });
    check('data-deep-merge: has merged', typeof r.merged === 'object', 'object', typeof r.merged);
    check('data-deep-merge: a.x = 1', r.merged && r.merged.a && r.merged.a.x === 1, 1, r.merged && r.merged.a && r.merged.a.x);
    check('data-deep-merge: a.y = 2', r.merged && r.merged.a && r.merged.a.y === 2, 2, r.merged && r.merged.a && r.merged.a.y);
  });

  // ==================== #1189 data-diff ====================
  await safeTest('data-diff', async () => {
    const r = await post('data-diff', { a: { x: 1, y: 2, z: 3 }, b: { x: 1, y: 5, w: 4 } });
    check('data-diff: has added', Array.isArray(r.added), 'array', typeof r.added);
    check('data-diff: has removed', Array.isArray(r.removed), 'array', typeof r.removed);
    check('data-diff: has changed', Array.isArray(r.changed), 'array', typeof r.changed);
  });

  // ==================== #1190 data-coerce-types ====================
  await safeTest('data-coerce-types', async () => {
    const r = await post('data-coerce-types', {
      data: { age: '30', active: 'true', name: 42 },
      schema: { age: 'number', active: 'boolean', name: 'string' }
    });
    check('data-coerce-types: has result', typeof r.result === 'object', 'object', typeof r.result);
    check('data-coerce-types: age is number', r.result && typeof r.result.age === 'number', 'number', typeof (r.result && r.result.age));
  });

  // ==================== #1191 data-clean ====================
  await safeTest('data-clean', async () => {
    const r = await post('data-clean', {
      records: [{ Name: '  Alice  ', age: null, email: 'TEST@TEST.COM' }],
      rules: { trim: true, remove_nulls: true, lowercase_keys: true }
    });
    check('data-clean: has records', Array.isArray(r.records), 'array', typeof r.records);
    check('data-clean: has count', typeof r.count === 'number', 'number', typeof r.count);
  });

  // ==================== #1192 data-frequency ====================
  await safeTest('data-frequency', async () => {
    const r = await post('data-frequency', { data: ['a', 'b', 'a', 'c', 'a', 'b'] });
    check('data-frequency: has distribution', Array.isArray(r.distribution), 'array', typeof r.distribution);
    check('data-frequency: has mode', r.mode === 'a', 'a', r.mode);
    check('data-frequency: total = 6', r.total === 6, 6, r.total);
  });

  // ==================== #1193 data-window-functions ====================
  await safeTest('data-window-functions', async () => {
    const r = await post('data-window-functions', {
      data: [{ group: 'A', value: 10 }, { group: 'A', value: 20 }, { group: 'B', value: 30 }],
      function: 'running_total',
      partition_by: 'group',
      order_by: 'value'
    });
    check('data-window-functions: has result', Array.isArray(r.result), 'array', typeof r.result);
  });

  // ==================== #1194 encode-base32 ====================
  await safeTest('encode-base32', async () => {
    const r = await post('encode-base32', { text: 'Hello' });
    check('encode-base32: has encoded', typeof r.encoded === 'string', 'string', typeof r.encoded);
    check('encode-base32: JBSWY3DP', r.encoded === 'JBSWY3DP' || r.encoded === 'JBSWY3DP======' || (r.encoded && r.encoded.startsWith('JBSWY3DP')), 'JBSWY3DP...', r.encoded);
  });

  // ==================== #1195 encode-hex ====================
  await safeTest('encode-hex', async () => {
    const r = await post('encode-hex', { text: 'AB' });
    check('encode-hex: has encoded', typeof r.encoded === 'string', 'string', typeof r.encoded);
    check('encode-hex: 4142', r.encoded === '4142', '4142', r.encoded);
  });

  // ==================== #1196 format-table ====================
  await safeTest('format-table', async () => {
    const r = await post('format-table', {
      headers: ['Name', 'Age'],
      rows: [['Alice', '30'], ['Bob', '25']]
    });
    check('format-table: has table', typeof r.table === 'string', 'string', typeof r.table);
  });

  // ==================== #1197 format-list ====================
  await safeTest('format-list', async () => {
    const r = await post('format-list', { items: ['Apple', 'Banana', 'Cherry'], style: 'numbered' });
    check('format-list: has list', typeof r.list === 'string', 'string', typeof r.list);
    check('format-list: has count', r.count === 3, 3, r.count);
  });

  // ==================== #1198 format-tree ====================
  await safeTest('format-tree', async () => {
    const r = await post('format-tree', { data: { root: { child1: 'leaf', child2: { nested: 'deep' } } } });
    check('format-tree: has tree', typeof r.tree === 'string', 'string', typeof r.tree);
  });

  // ==================== #1199 type-check ====================
  await safeTest('type-check', async () => {
    const r = await post('type-check', { value: '42' });
    check('type-check: type = string', r.type === 'string', 'string', r.type);
    check('type-check: is_string = true', r.is_string === true, true, r.is_string);
    check('type-check: is_numeric = true', r.is_numeric === true, true, r.is_numeric);
  });

  // ==================== #1200 type-convert ====================
  await safeTest('type-convert', async () => {
    const r = await post('type-convert', { value: '42', to: 'number' });
    check('type-convert: result = 42', r.result === 42, 42, r.result);
    check('type-convert: from = string', r.from === 'string', 'string', r.from);
  });

  // ==================== #1201 math-interpolate ====================
  await safeTest('math-interpolate', async () => {
    const r = await post('math-interpolate', { points: [{ x: 0, y: 0 }, { x: 10, y: 100 }], x: 5 });
    check('math-interpolate: y = 50', r.y === 50, 50, r.y);
  });

  // ==================== #1202 math-probability ====================
  await safeTest('math-probability', async () => {
    const r = await post('math-probability', { events: 3, total: 10 });
    check('math-probability: probability = 0.3', r.probability === 0.3, 0.3, r.probability);
    check('math-probability: percentage = 30', r.percentage === 30, 30, r.percentage);
    check('math-probability: complement = 0.7', r.complement === 0.7, 0.7, r.complement);
  });

  // ==================== #1203 math-combination ====================
  await safeTest('math-combination', async () => {
    const r = await post('math-combination', { n: 5, r: 2 });
    check('math-combination: C(5,2) = 10', r.combination === 10, 10, r.combination);
    check('math-combination: P(5,2) = 20', r.permutation === 20, 20, r.permutation);
  });

  // ==================== #1204 id-nanoid ====================
  await safeTest('id-nanoid', async () => {
    const r = await post('id-nanoid', { length: 21 });
    check('id-nanoid: has id', typeof r.id === 'string', 'string', typeof r.id);
    check('id-nanoid: length = 21', r.id && r.id.length === 21, 21, r.id && r.id.length);
  });

  // ==================== #1205 id-ulid ====================
  await safeTest('id-ulid', async () => {
    const r = await post('id-ulid', {});
    check('id-ulid: has ulid', typeof r.ulid === 'string', 'string', typeof r.ulid);
    check('id-ulid: has timestamp', typeof r.timestamp !== 'undefined', 'defined', typeof r.timestamp);
  });

  // ==================== #1206 id-snowflake ====================
  await safeTest('id-snowflake', async () => {
    const r = await post('id-snowflake', { machine_id: 1 });
    check('id-snowflake: has id', typeof r.id === 'string' || typeof r.id === 'number', 'string|number', typeof r.id);
    check('id-snowflake: has timestamp', typeof r.timestamp !== 'undefined', 'defined', typeof r.timestamp);
  });

  // ==================== #1207 biz-tax-calculate ====================
  await safeTest('biz-tax-calculate', async () => {
    const r = await post('biz-tax-calculate', { amount: 100, rate: 10, type: 'exclusive' });
    check('biz-tax-calculate: tax = 10', r.tax === 10, 10, r.tax);
    check('biz-tax-calculate: gross = 110', r.gross === 110, 110, r.gross);
  });

  // ==================== #1208 biz-discount-apply ====================
  await safeTest('biz-discount-apply', async () => {
    const r = await post('biz-discount-apply', { price: 100, quantity: 2, discount: 10, discount_type: 'percent' });
    check('biz-discount-apply: has original', typeof r.original === 'number', 'number', typeof r.original);
    check('biz-discount-apply: has final', typeof r.final === 'number', 'number', typeof r.final);
  });

  // ==================== #1209 biz-shipping-estimate ====================
  await safeTest('biz-shipping-estimate', async () => {
    const r = await post('biz-shipping-estimate', { weight_kg: 5, distance_km: 500, method: 'standard' });
    check('biz-shipping-estimate: has cost', typeof r.cost === 'number', 'number', typeof r.cost);
    check('biz-shipping-estimate: has delivery_days', typeof r.delivery_days === 'number', 'number', typeof r.delivery_days);
  });

  // ==================== #1210 biz-prorate ====================
  await safeTest('biz-prorate', async () => {
    const r = await post('biz-prorate', { amount: 30, total_days: 30, used_days: 10 });
    check('biz-prorate: has prorated_refund', typeof r.prorated_refund === 'number', 'number', typeof r.prorated_refund);
    check('biz-prorate: refund = 20', r.prorated_refund === 20, 20, r.prorated_refund);
  });

  // ==================== #1211 biz-roi-calculate ====================
  await safeTest('biz-roi-calculate', async () => {
    const r = await post('biz-roi-calculate', { investment: 10000, revenue: 15000, months: 12 });
    check('biz-roi-calculate: has roi_pct', typeof r.roi_pct === 'number', 'number', typeof r.roi_pct);
    check('biz-roi-calculate: roi = 50%', r.roi_pct === 50, 50, r.roi_pct);
    check('biz-roi-calculate: profit = 5000', r.profit === 5000, 5000, r.profit);
  });

  // ==================== #1212 biz-cac-ltv ====================
  await safeTest('biz-cac-ltv', async () => {
    const r = await post('biz-cac-ltv', {
      cac: 100, monthly_revenue: 50, margin: 0.8, monthly_churn: 0.05
    });
    check('biz-cac-ltv: has ltv', typeof r.ltv === 'number', 'number', typeof r.ltv);
    check('biz-cac-ltv: has ltv_cac_ratio', typeof r.ltv_cac_ratio === 'number', 'number', typeof r.ltv_cac_ratio);
    check('biz-cac-ltv: has healthy', typeof r.healthy === 'boolean', 'boolean', typeof r.healthy);
  });

  // ==================== #1213 biz-compound-interest ====================
  await safeTest('biz-compound-interest', async () => {
    const r = await post('biz-compound-interest', { principal: 1000, rate: 0.05, years: 10, compounds_per_year: 1 });
    check('biz-compound-interest: has total', typeof r.total === 'number', 'number', typeof r.total);
    check('biz-compound-interest: has interest', typeof r.interest === 'number', 'number', typeof r.interest);
  });

  // ==================== #1214 biz-mrr-calculate ====================
  await safeTest('biz-mrr-calculate', async () => {
    const r = await post('biz-mrr-calculate', {
      plans: [
        { name: 'basic', price: 10, customers: 100 },
        { name: 'pro', price: 50, customers: 50 }
      ]
    });
    check('biz-mrr-calculate: mrr = 3500', r.mrr === 3500, 3500, r.mrr);
    check('biz-mrr-calculate: arr = 42000', r.arr === 42000, 42000, r.arr);
  });

  // ==================== #1215 biz-pricing-strategy ====================
  await safeTest('biz-pricing-strategy', async () => {
    const r = await post('biz-pricing-strategy', {
      cost: 10, target_margin: 0.5,
      competitors: [{ name: 'A', price: 25 }, { name: 'B', price: 30 }]
    });
    check('biz-pricing-strategy: has recommended', typeof r.recommended === 'number', 'number', typeof r.recommended);
    check('biz-pricing-strategy: has margin_based_price', typeof r.margin_based_price === 'number', 'number', typeof r.margin_based_price);
  });

  // ==================== #1216 biz-time-value-money ====================
  await safeTest('biz-time-value-money', async () => {
    const r = await post('biz-time-value-money', { present_value: 1000, rate: 0.05, periods: 10 });
    check('biz-time-value-money: has future_value', typeof r.future_value === 'number', 'number', typeof r.future_value);
  });

  // ==================== #1217 devops-dockerfile-parse ====================
  await safeTest('devops-dockerfile-parse', async () => {
    const r = await post('devops-dockerfile-parse', {
      content: 'FROM node:18-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\nEXPOSE 3000\nCMD ["node", "server.js"]'
    });
    check('devops-dockerfile-parse: has base_image', typeof r.base_image === 'string', 'string', typeof r.base_image);
    check('devops-dockerfile-parse: base = node:18-alpine', r.base_image === 'node:18-alpine', 'node:18-alpine', r.base_image);
  });

  // ==================== #1218 devops-env-generate ====================
  await safeTest('devops-env-generate', async () => {
    const r = await post('devops-env-generate', {
      variables: [{ key: 'DB_HOST', value: 'localhost', comment: 'Database host' }]
    });
    check('devops-env-generate: has content', typeof r.content === 'string', 'string', typeof r.content);
    check('devops-env-generate: contains DB_HOST', r.content && r.content.includes('DB_HOST'), 'DB_HOST', r.content && r.content.slice(0, 50));
  });

  // ==================== #1219 devops-semver-bump ====================
  await safeTest('devops-semver-bump', async () => {
    const r = await post('devops-semver-bump', { version: '1.2.3', type: 'minor' });
    check('devops-semver-bump: next = 1.3.0', r.next === '1.3.0', '1.3.0', r.next);
  });

  // ==================== #1220 devops-health-check-eval ====================
  await safeTest('devops-health-check-eval', async () => {
    const r = await post('devops-health-check-eval', {
      checks: [
        { name: 'db', status: 'healthy', latency_ms: 5 },
        { name: 'redis', status: 'healthy', latency_ms: 2 },
        { name: 'api', status: 'unhealthy', latency_ms: 5000 }
      ]
    });
    check('devops-health-check-eval: has status', typeof r.status === 'string', 'string', typeof r.status);
    check('devops-health-check-eval: has healthy', typeof r.healthy === 'number', 'number', typeof r.healthy);
    check('devops-health-check-eval: healthy = 2', r.healthy === 2, 2, r.healthy);
  });

  // ==================== #1221 devops-uptime-calculate ====================
  await safeTest('devops-uptime-calculate', async () => {
    const r = await post('devops-uptime-calculate', { total_seconds: 86400, downtime_seconds: 86.4 });
    check('devops-uptime-calculate: has uptime_pct', typeof r.uptime_pct === 'number', 'number', typeof r.uptime_pct);
    check('devops-uptime-calculate: uptime = 99.9', Math.abs(r.uptime_pct - 99.9) < 0.01, '99.9', r.uptime_pct);
  });

  // ==================== #1222 devops-crontab-generate ====================
  await safeTest('devops-crontab-generate', async () => {
    const r = await post('devops-crontab-generate', { description: 'every hour' });
    check('devops-crontab-generate: has expression', typeof r.expression === 'string', 'string', typeof r.expression);
  });

  // ==================== #1223 devops-log-parse ====================
  await safeTest('devops-log-parse', async () => {
    const r = await post('devops-log-parse', { log: '127.0.0.1 - - [01/Jan/2024:12:00:00 +0000] "GET /index.html HTTP/1.1" 200 1234' });
    check('devops-log-parse: has format', typeof r.format === 'string', 'string', typeof r.format);
  });

  // ==================== #1224 devops-error-fingerprint ====================
  await safeTest('devops-error-fingerprint', async () => {
    const r = await post('devops-error-fingerprint', {
      message: 'TypeError: Cannot read property "length" of undefined',
      stack: 'at Array.forEach (<anonymous>)\nat processItems (app.js:42:10)'
    });
    check('devops-error-fingerprint: has fingerprint', typeof r.fingerprint === 'string', 'string', typeof r.fingerprint);
    check('devops-error-fingerprint: has groupable', r.groupable === true, true, r.groupable);
  });

  // ==================== #1225 devops-resource-estimate ====================
  await safeTest('devops-resource-estimate', async () => {
    const r = await post('devops-resource-estimate', {
      requests_per_second: 1000, response_time_ms: 100, target_utilization: 0.7
    });
    check('devops-resource-estimate: has recommended_instances', typeof r.recommended_instances === 'number', 'number', typeof r.recommended_instances);
  });

  // ==================== #1226 devops-sla-budget ====================
  await safeTest('devops-sla-budget', async () => {
    const r = await post('devops-sla-budget', { sla_pct: 99.9, period_days: 30 });
    check('devops-sla-budget: has downtime_budget_minutes', typeof r.downtime_budget_minutes === 'number', 'number', typeof r.downtime_budget_minutes);
    check('devops-sla-budget: ~43.2 minutes', Math.abs(r.downtime_budget_minutes - 43.2) < 1, '~43.2', r.downtime_budget_minutes);
  });

  // ==================== #1227 ai-token-estimate ====================
  await safeTest('ai-token-estimate', async () => {
    const r = await post('ai-token-estimate', { text: 'Hello world this is a test', model: 'gpt-4' });
    check('ai-token-estimate: has estimated_tokens', typeof r.estimated_tokens === 'number', 'number', typeof r.estimated_tokens);
    check('ai-token-estimate: has context_limit', typeof r.context_limit === 'number', 'number', typeof r.context_limit);
  });

  // ==================== #1228 ai-prompt-score ====================
  await safeTest('ai-prompt-score', async () => {
    const r = await post('ai-prompt-score', {
      prompt: 'You are an expert data analyst. Given the following CSV data, identify trends and anomalies. Output in JSON format with keys: trends, anomalies, summary. Be concise.'
    });
    check('ai-prompt-score: has score', typeof r.score === 'number', 'number', typeof r.score);
    check('ai-prompt-score: has grade', typeof r.grade === 'string', 'string', typeof r.grade);
  });

  // ==================== #1229 ai-output-parse ====================
  await safeTest('ai-output-parse', async () => {
    const r = await post('ai-output-parse', { text: 'Here is the result:\n```json\n{"key": "value"}\n```' });
    check('ai-output-parse: has parsed', typeof r.parsed !== 'undefined', 'defined', typeof r.parsed);
    check('ai-output-parse: success', r.success === true, true, r.success);
  });

  // ==================== #1230 ai-context-window-pack ====================
  await safeTest('ai-context-window-pack', async () => {
    const r = await post('ai-context-window-pack', {
      messages: [
        { role: 'user', content: 'First message with lots of text' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' },
        { role: 'assistant', content: 'Second response' }
      ],
      token_budget: 100,
      strategy: 'truncate_old'
    });
    check('ai-context-window-pack: has messages', Array.isArray(r.messages), 'array', typeof r.messages);
    check('ai-context-window-pack: has total_tokens', typeof r.total_tokens === 'number', 'number', typeof r.total_tokens);
  });

  // ==================== #1231 ai-function-call-parse ====================
  await safeTest('ai-function-call-parse', async () => {
    const r = await post('ai-function-call-parse', { text: 'I need to call search("hello world") and then format(result, "json")' });
    check('ai-function-call-parse: has calls', Array.isArray(r.calls), 'array', typeof r.calls);
    check('ai-function-call-parse: has found', r.found === true || r.count > 0, 'found', JSON.stringify(r).slice(0, 100));
  });

  // ==================== #1232 ai-guardrail-score ====================
  await safeTest('ai-guardrail-score', async () => {
    const r = await post('ai-guardrail-score', {
      text: 'This is a clean response about data analysis.',
      rules: { no_pii: true, max_length: 200, has_structure: false }
    });
    check('ai-guardrail-score: has passed', typeof r.passed === 'boolean', 'boolean', typeof r.passed);
    check('ai-guardrail-score: has score', typeof r.score === 'number', 'number', typeof r.score);
  });

  // ==================== #1233 ai-response-grade ====================
  await safeTest('ai-response-grade', async () => {
    const r = await post('ai-response-grade', {
      response: 'This is a well-thought-out answer.',
      criteria: [
        { name: 'relevance', score: 9 },
        { name: 'clarity', score: 8 },
        { name: 'accuracy', score: 7 }
      ]
    });
    check('ai-response-grade: has overall', typeof r.overall === 'number', 'number', typeof r.overall);
    check('ai-response-grade: has grade', typeof r.grade === 'string', 'string', typeof r.grade);
  });

  // ==================== #1234 ai-chain-of-thought ====================
  await safeTest('ai-chain-of-thought', async () => {
    const r = await post('ai-chain-of-thought', { problem: 'How to reduce API latency by 50%?' });
    check('ai-chain-of-thought: has chain', Array.isArray(r.chain), 'array', typeof r.chain);
    check('ai-chain-of-thought: has total_steps', typeof r.total_steps === 'number', 'number', typeof r.total_steps);
  });

  // ==================== #1235 ai-tool-selector ====================
  await safeTest('ai-tool-selector', async () => {
    const r = await post('ai-tool-selector', {
      task: 'validate user email and generate API key',
      tools: [
        { name: 'validate-email-syntax', description: 'Validates email format' },
        { name: 'auth-api-key-generate', description: 'Generates API keys' },
        { name: 'text-tokenize', description: 'Tokenizes text' }
      ]
    });
    check('ai-tool-selector: has recommended', Array.isArray(r.recommended), 'array', typeof r.recommended);
  });

  // ==================== #1236 ai-reflection ====================
  await safeTest('ai-reflection', async () => {
    const r = await post('ai-reflection', {
      action: 'Deployed new feature',
      outcome: 'Increased error rate by 5%',
      expected: 'No change in error rate'
    });
    check('ai-reflection: has success', typeof r.success === 'boolean', 'boolean', typeof r.success);
    check('ai-reflection: success = false', r.success === false, false, r.success);
    check('ai-reflection: has reflection', typeof r.reflection === 'string', 'string', typeof r.reflection);
  });

  // ==================== #1237 graphql-query-build ====================
  await safeTest('graphql-query-build', async () => {
    const r = await post('graphql-query-build', {
      type: 'query',
      fields: ['id', 'name', 'email'],
      variables: { id: 'ID!' }
    });
    check('graphql-query-build: has query', typeof r.query === 'string', 'string', typeof r.query);
  });

  // ==================== #1238 graphql-response-extract ====================
  await safeTest('graphql-response-extract', async () => {
    const r = await post('graphql-response-extract', {
      response: { data: { user: { name: 'Alice', posts: [{ title: 'Hello' }] } } },
      path: 'data.user.name'
    });
    check('graphql-response-extract: extracted = Alice', r.extracted === 'Alice', 'Alice', r.extracted);
    check('graphql-response-extract: found = true', r.found === true, true, r.found);
  });

  // ==================== #1239 jwt-decode-inspect ====================
  await safeTest('jwt-decode-inspect', async () => {
    // Create a valid JWT for testing (header.payload.signature)
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'user123', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const token = `${header}.${payload}.fakesignature`;
    const r = await post('jwt-decode-inspect', { token });
    check('jwt-decode-inspect: has header', typeof r.header === 'object', 'object', typeof r.header);
    check('jwt-decode-inspect: has payload', typeof r.payload === 'object', 'object', typeof r.payload);
    check('jwt-decode-inspect: sub = user123', r.payload && r.payload.sub === 'user123', 'user123', r.payload && r.payload.sub);
  });

  // ==================== #1240 webhook-payload-verify ====================
  await safeTest('webhook-payload-verify', async () => {
    const secret = 'my-webhook-secret';
    const payloadStr = '{"event":"test"}';
    const hmac = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
    const r = await post('webhook-payload-verify', {
      payload: payloadStr,
      signature: `sha256=${hmac}`,
      secret: secret
    });
    check('webhook-payload-verify: valid', r.valid === true, true, r.valid);
  });

  // ==================== #1241 url-build ====================
  await safeTest('url-build', async () => {
    const r = await post('url-build', { base: 'https://example.com', path: '/api/users', query: { page: 1, limit: 10 }, hash: 'section' });
    check('url-build: has url', typeof r.url === 'string', 'string', typeof r.url);
    check('url-build: contains base', r.url && r.url.includes('example.com'), 'example.com', r.url);
  });

  // ==================== #1242 url-parse-advanced ====================
  await safeTest('url-parse-advanced', async () => {
    const r = await post('url-parse-advanced', { url: 'https://user:pass@example.com:8080/api/v1/users?q=test&limit=10#section' });
    check('url-parse-advanced: valid', r.valid === true, true, r.valid);
    check('url-parse-advanced: hostname', r.hostname === 'example.com', 'example.com', r.hostname);
    check('url-parse-advanced: has path_parts', Array.isArray(r.path_parts), 'array', typeof r.path_parts);
  });

  // ==================== #1243 cron-next-runs ====================
  await safeTest('cron-next-runs', async () => {
    const r = await post('cron-next-runs', { expression: '0 * * * *', count: 5 });
    check('cron-next-runs: has next_runs', Array.isArray(r.next_runs), 'array', typeof r.next_runs);
    check('cron-next-runs: 5 runs', r.next_runs && r.next_runs.length === 5, 5, r.next_runs && r.next_runs.length);
  });

  // ==================== #1244 task-decompose ====================
  await safeTest('task-decompose', async () => {
    const r = await post('task-decompose', { task: 'Build and deploy a REST API with authentication and rate limiting' });
    check('task-decompose: has subtasks', Array.isArray(r.subtasks), 'array', typeof r.subtasks);
    check('task-decompose: has count', typeof r.count === 'number', 'number', typeof r.count);
  });

  // ==================== #1245 task-prioritize ====================
  await safeTest('task-prioritize', async () => {
    const r = await post('task-prioritize', {
      tasks: [
        { name: 'Fix bug', urgency: 9, impact: 8, ease: 7 },
        { name: 'New feature', urgency: 5, impact: 9, ease: 3 },
        { name: 'Refactor', urgency: 3, impact: 6, ease: 8 }
      ]
    });
    check('task-prioritize: has prioritized', Array.isArray(r.prioritized), 'array', typeof r.prioritized);
    check('task-prioritize: has count', typeof r.count === 'number', 'number', typeof r.count);
  });

  // ==================== #1246 task-estimate ====================
  await safeTest('task-estimate', async () => {
    const r = await post('task-estimate', { description: 'Build login page', complexity: 'medium' });
    check('task-estimate: has estimate_minutes', typeof r.estimate_minutes === 'object', 'object', typeof r.estimate_minutes);
    check('task-estimate: has estimate_hours', typeof r.estimate_hours !== 'undefined', 'defined', typeof r.estimate_hours);
  });

  // ==================== #1247 data-csv-to-json ====================
  await safeTest('data-csv-to-json', async () => {
    const r = await post('data-csv-to-json', { csv: 'name,age\nAlice,30\nBob,25' });
    check('data-csv-to-json: has rows', Array.isArray(r.rows), 'array', typeof r.rows);
    check('data-csv-to-json: count = 2', r.count === 2, 2, r.count);
    check('data-csv-to-json: first row name', r.rows && r.rows[0] && r.rows[0].name === 'Alice', 'Alice', r.rows && r.rows[0] && r.rows[0].name);
  });

  // ==================== #1248 data-json-to-csv ====================
  await safeTest('data-json-to-csv', async () => {
    const r = await post('data-json-to-csv', { data: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }] });
    check('data-json-to-csv: has csv', typeof r.csv === 'string', 'string', typeof r.csv);
    check('data-json-to-csv: count = 2', r.count === 2, 2, r.count);
  });

  // ==================== #1249 data-flatten-object ====================
  await safeTest('data-flatten-object', async () => {
    const r = await post('data-flatten-object', { data: { a: { b: 1, c: { d: 2 } } } });
    check('data-flatten-object: has flattened', typeof r.flattened === 'object', 'object', typeof r.flattened);
  });

  // ==================== #1250 data-diff-objects ====================
  await safeTest('data-diff-objects', async () => {
    const r = await post('data-diff-objects', {
      a: { name: 'Alice', age: 30, city: 'NYC' },
      b: { name: 'Alice', age: 31, country: 'US' }
    });
    check('data-diff-objects: has added', Array.isArray(r.added), 'array', typeof r.added);
    check('data-diff-objects: has removed', Array.isArray(r.removed), 'array', typeof r.removed);
    check('data-diff-objects: has changed', Array.isArray(r.changed), 'array', typeof r.changed);
    check('data-diff-objects: not identical', r.identical === false, false, r.identical);
  });

  // ==================== #1251 security-password-strength ====================
  await safeTest('security-password-strength', async () => {
    const r = await post('security-password-strength', { password: 'MyStr0ng!P@ssw0rd' });
    check('security-password-strength: has score', typeof r.score === 'number', 'number', typeof r.score);
    check('security-password-strength: has strength', typeof r.strength === 'string', 'string', typeof r.strength);
    check('security-password-strength: has checks', typeof r.checks === 'object', 'object', typeof r.checks);
  });

  // ==================== #1252 security-hash-generate ====================
  await safeTest('security-hash-generate', async () => {
    const r = await post('security-hash-generate', { input: 'hello', algorithm: 'sha256' });
    check('security-hash-generate: has hash', typeof r.hash === 'string', 'string', typeof r.hash);
    check('security-hash-generate: correct sha256', r.hash === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', 'sha256(hello)', r.hash);
  });

  // ==================== #1253 security-rate-limit-check ====================
  await safeTest('security-rate-limit-check', async () => {
    const r = await post('security-rate-limit-check', { requests: 80, limit: 100, window_seconds: 60 });
    check('security-rate-limit-check: allowed', r.allowed === true, true, r.allowed);
    check('security-rate-limit-check: remaining = 20', r.remaining === 20, 20, r.remaining);
  });

  // ==================== #1254 workflow-retry-backoff ====================
  await safeTest('workflow-retry-backoff', async () => {
    const r = await post('workflow-retry-backoff', { attempt: 3, strategy: 'exponential', base_delay: 1000 });
    check('workflow-retry-backoff: has delay_ms', typeof r.delay_ms === 'number', 'number', typeof r.delay_ms);
    check('workflow-retry-backoff: has should_retry', typeof r.should_retry === 'boolean', 'boolean', typeof r.should_retry);
    check('workflow-retry-backoff: should_retry = true (attempt 3 < 10)', r.should_retry === true, true, r.should_retry);
  });

  // Additional hidden slugs from the API list that aren't in GUTS doc

  // ==================== string-template (#1163 in api order) ====================
  await safeTest('string-template', async () => {
    const r = await post('string-template', { template: 'Hello ${name}!', vars: { name: 'World' } });
    check('string-template: has rendered', typeof r.rendered === 'string', 'string', typeof r.rendered);
  });

  // ==================== string-pad ====================
  await safeTest('string-pad', async () => {
    const r = await post('string-pad', { text: 'hi', length: 10, char: '*', side: 'left' });
    check('string-pad: has result', typeof r.result === 'string', 'string', typeof r.result);
  });

  // ==================== string-wrap ====================
  await safeTest('string-wrap', async () => {
    const r = await post('string-wrap', { text: 'The quick brown fox jumps over the lazy dog', width: 15 });
    check('string-wrap: has wrapped', typeof r.wrapped === 'string', 'string', typeof r.wrapped);
    check('string-wrap: has lines', typeof r.lines === 'number', 'number', typeof r.lines);
  });

  // ==================== string-repeat ====================
  await safeTest('string-repeat', async () => {
    const r = await post('string-repeat', { text: 'abc', count: 3, separator: '-' });
    check('string-repeat: has result', typeof r.result === 'string', 'string', typeof r.result);
  });

  // ==================== regex-replace ====================
  await safeTest('regex-replace', async () => {
    const r = await post('regex-replace', { text: 'Hello 123 World 456', pattern: '\\d+', replacement: 'NUM' });
    check('regex-replace: has result', typeof r.result === 'string', 'string', typeof r.result);
    check('regex-replace: has replacements', typeof r.replacements === 'number', 'number', typeof r.replacements);
  });

  // ==================== encode-rot13 ====================
  await safeTest('encode-rot13', async () => {
    const r = await post('encode-rot13', { text: 'Hello' });
    check('encode-rot13: has result', typeof r.result === 'string', 'string', typeof r.result);
    check('encode-rot13: Uryyb', r.result === 'Uryyb', 'Uryyb', r.result);
  });

  // ==================== encode-morse ====================
  await safeTest('encode-morse', async () => {
    const r = await post('encode-morse', { text: 'SOS' });
    check('encode-morse: has encoded', typeof r.encoded === 'string', 'string', typeof r.encoded);
    check('encode-morse: SOS = ... --- ...', r.encoded && r.encoded.includes('...') && r.encoded.includes('---'), '... --- ...', r.encoded);
  });

  // ==================== hash-hmac ====================
  await safeTest('hash-hmac', async () => {
    const r = await post('hash-hmac', { text: 'hello', secret: 'key', algorithm: 'sha256' });
    check('hash-hmac: has hmac', typeof r.hmac === 'string', 'string', typeof r.hmac);
  });

  // ==================== hash-checksum ====================
  await safeTest('hash-checksum', async () => {
    const r = await post('hash-checksum', { data: 'hello', algorithm: 'md5' });
    check('hash-checksum: has checksum', typeof r.checksum === 'string', 'string', typeof r.checksum);
    check('hash-checksum: md5 of hello', r.checksum === '5d41402abc4b2a76b9719d911017c592', 'md5(hello)', r.checksum);
  });

  // ==================== string-camel-case ====================
  await safeTest('string-camel-case', async () => {
    const r = await post('string-camel-case', { text: 'hello world test' });
    check('string-camel-case: has camel', typeof r.camel === 'string', 'string', typeof r.camel);
    check('string-camel-case: camel = helloWorldTest', r.camel === 'helloWorldTest', 'helloWorldTest', r.camel);
    check('string-camel-case: has snake', typeof r.snake === 'string', 'string', typeof r.snake);
  });

  // ==================== DONE ====================
  console.log(`\n==================== RESULTS ====================`);
  console.log(`PASS: ${pass}, FAIL: ${fail}, SKIP: ${skip}, TOTAL: ${pass + fail + skip}`);
  console.log(`Pass rate: ${((pass / (pass + fail + skip)) * 100).toFixed(1)}%`);

  // Write audit report
  const reportDir = path.join(__dirname, '.internal');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  let md = `# REAL AUDIT: Endpoints 901-1255\n\n`;
  md += `> Generated: ${new Date().toISOString()}\n`;
  md += `> Server: http://127.0.0.1:${PORT}\n`;
  md += `> Engine: real compute (no mocks)\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| PASS | ${pass} |\n`;
  md += `| FAIL | ${fail} |\n`;
  md += `| TOTAL | ${pass + fail + skip} |\n`;
  md += `| Pass Rate | ${((pass / (pass + fail + skip)) * 100).toFixed(1)}% |\n\n`;

  md += `## Results\n\n`;
  md += `| # | Test | Status | Expected | Actual |\n`;
  md += `|---|------|--------|----------|--------|\n`;
  results.forEach((r, i) => {
    const exp = (r.expected || '').replace(/\|/g, '\\|').slice(0, 60);
    const act = (r.actual || '').replace(/\|/g, '\\|').slice(0, 80);
    md += `| ${i + 1} | ${r.name.replace(/\|/g, '\\|')} | ${r.status === 'PASS' ? 'PASS' : '**FAIL**'} | ${r.status === 'FAIL' ? exp : ''} | ${r.status === 'FAIL' ? act : ''} |\n`;
  });

  md += `\n## Failures\n\n`;
  const failures = results.filter(r => r.status === 'FAIL');
  if (failures.length === 0) {
    md += `No failures.\n`;
  } else {
    failures.forEach(f => {
      md += `- **${f.name}**: expected \`${(f.expected || '').slice(0, 100)}\`, got \`${(f.actual || '').slice(0, 100)}\`\n`;
    });
  }

  fs.writeFileSync(path.join(reportDir, 'REAL-AUDIT-901-1255.md'), md);
  console.log(`\nAudit report written to .internal/REAL-AUDIT-901-1255.md`);

  if (serverProcess) {
    serverProcess.kill();
  }
  process.exit(failures.length > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Fatal error:', e);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});
