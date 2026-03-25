/**
 * SLOPSHOP ORCHESTRATION + AUDIT HANDLERS
 * Workflow control, caching, rate limiting, circuit breakers,
 * PLUS third-party unbiased agent simulation & audit APIs.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const DATA = path.join(__dirname, '..', '.data');
function ensureDir() { if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true }); }
function load(file, fb) { ensureDir(); try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch (e) { return fb; } }
function save(file, d) { ensureDir(); fs.writeFileSync(path.join(DATA, file), JSON.stringify(d)); }

module.exports = {
  // ===== DELAY =====
  'orch-delay': async (input) => {
    const ms = Math.min(input.ms || input.delay || 1000, 10000);
    await new Promise(r => setTimeout(r, ms));
    return { _engine: 'real', delayed_ms: ms, timestamp: new Date().toISOString() };
  },

  // ===== CACHE =====
  'orch-cache-get': (input) => {
    const cache = load('cache.json', {});
    const key = input.key;
    const entry = cache[key];
    if (!entry) return { _engine: 'real', found: false, key };
    if (entry.expires && entry.expires < Date.now()) {
      delete cache[key]; save('cache.json', cache);
      return { _engine: 'real', found: false, key, expired: true };
    }
    return { _engine: 'real', found: true, key, value: entry.value, cached_at: entry.cached_at };
  },
  'orch-cache-set': (input) => {
    const cache = load('cache.json', {});
    const key = input.key;
    cache[key] = { value: input.value, cached_at: new Date().toISOString(), expires: input.ttl ? Date.now() + input.ttl * 1000 : null };
    save('cache.json', cache);
    return { _engine: 'real', key, status: 'cached', ttl: input.ttl || null };
  },
  'orch-cache-invalidate': (input) => {
    const cache = load('cache.json', {});
    if (input.key) { delete cache[input.key]; } else if (input.pattern) {
      const re = new RegExp(input.pattern);
      for (const k of Object.keys(cache)) { if (re.test(k)) delete cache[k]; }
    } else { save('cache.json', {}); return { _engine: 'real', cleared: 'all' }; }
    save('cache.json', cache);
    return { _engine: 'real', status: 'invalidated', key: input.key || input.pattern };
  },

  // ===== RATE LIMITING =====
  'orch-rate-limit-check': (input) => {
    const limits = load('rate-limits.json', {});
    const key = input.key || 'default';
    const window = (input.window || 60) * 1000;
    const max = input.max || 100;
    const now = Date.now();
    const entry = limits[key] || { count: 0, window_start: now };
    if (now - entry.window_start > window) { entry.count = 0; entry.window_start = now; }
    return { _engine: 'real', key, allowed: entry.count < max, remaining: Math.max(0, max - entry.count), limit: max, resets_in_ms: window - (now - entry.window_start) };
  },
  'orch-rate-limit-consume': (input) => {
    const limits = load('rate-limits.json', {});
    const key = input.key || 'default';
    const window = (input.window || 60) * 1000;
    const max = input.max || 100;
    const now = Date.now();
    if (!limits[key]) limits[key] = { count: 0, window_start: now };
    if (now - limits[key].window_start > window) { limits[key].count = 0; limits[key].window_start = now; }
    limits[key].count++;
    save('rate-limits.json', limits);
    return { _engine: 'real', key, consumed: true, remaining: Math.max(0, max - limits[key].count), over_limit: limits[key].count > max };
  },

  // ===== LOCKS =====
  'orch-lock-acquire': (input) => {
    const locks = load('locks.json', {});
    const name = input.name || input.lock;
    const ttl = input.ttl || 30;
    if (locks[name] && locks[name].expires > Date.now()) {
      return { _engine: 'real', acquired: false, held_by: locks[name].holder, expires_in_ms: locks[name].expires - Date.now() };
    }
    const holder = input.holder || crypto.randomUUID().slice(0, 8);
    locks[name] = { holder, acquired_at: Date.now(), expires: Date.now() + ttl * 1000 };
    save('locks.json', locks);
    return { _engine: 'real', acquired: true, lock: name, holder, expires_in_seconds: ttl };
  },
  'orch-lock-release': (input) => {
    const locks = load('locks.json', {});
    const name = input.name || input.lock;
    delete locks[name];
    save('locks.json', locks);
    return { _engine: 'real', released: true, lock: name };
  },

  // ===== SEQUENCES =====
  'orch-sequence-next': (input) => {
    const seqs = load('sequences.json', {});
    const name = input.name || 'default';
    seqs[name] = (seqs[name] || 0) + (input.step || 1);
    save('sequences.json', seqs);
    return { _engine: 'real', name, value: seqs[name] };
  },

  // ===== EVENTS =====
  'orch-event-emit': (input) => {
    const events = load('events.json', []);
    events.push({ name: input.name || input.event, data: input.data, timestamp: Date.now() });
    if (events.length > 1000) events.splice(0, events.length - 1000);
    save('events.json', events);
    return { _engine: 'real', emitted: true, event: input.name || input.event, queue_size: events.length };
  },
  'orch-event-poll': (input) => {
    const events = load('events.json', []);
    const since = input.since || 0;
    const name = input.name || input.event;
    let filtered = events.filter(e => e.timestamp > since);
    if (name) filtered = filtered.filter(e => e.name === name);
    return { _engine: 'real', events: filtered.slice(-50), count: filtered.length, latest_timestamp: filtered.length ? filtered[filtered.length - 1].timestamp : since };
  },

  // ===== CIRCUIT BREAKER =====
  'orch-circuit-breaker-check': (input) => {
    const breakers = load('breakers.json', {});
    const name = input.name || input.service;
    const b = breakers[name] || { state: 'closed', failures: 0, last_failure: 0 };
    const threshold = input.threshold || 5;
    const cooldown = (input.cooldown || 60) * 1000;
    if (b.state === 'open' && Date.now() - b.last_failure > cooldown) b.state = 'half-open';
    return { _engine: 'real', service: name, state: b.state, failures: b.failures, threshold, can_proceed: b.state !== 'open' };
  },
  'orch-circuit-breaker-record': (input) => {
    const breakers = load('breakers.json', {});
    const name = input.name || input.service;
    if (!breakers[name]) breakers[name] = { state: 'closed', failures: 0, last_failure: 0 };
    const threshold = input.threshold || 5;
    if (input.success) {
      breakers[name].failures = 0; breakers[name].state = 'closed';
    } else {
      breakers[name].failures++;
      breakers[name].last_failure = Date.now();
      if (breakers[name].failures >= threshold) breakers[name].state = 'open';
    }
    save('breakers.json', breakers);
    return { _engine: 'real', service: name, state: breakers[name].state, failures: breakers[name].failures };
  },

  // ===== HEALTH CHECK (parallel) =====
  'orch-health-check': async (input) => {
    const urls = input.urls || [];
    const results = await Promise.all(urls.map(url => new Promise(resolve => {
      const start = Date.now();
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { timeout: 5000 }, res => {
        res.resume();
        resolve({ url, up: res.statusCode < 400, status: res.statusCode, latency_ms: Date.now() - start });
      });
      req.on('error', () => resolve({ url, up: false, error: 'connection_failed', latency_ms: Date.now() - start }));
      req.on('timeout', () => { req.destroy(); resolve({ url, up: false, error: 'timeout', latency_ms: Date.now() - start }); });
    })));
    return { _engine: 'real', results, total: urls.length, healthy: results.filter(r => r.up).length, unhealthy: results.filter(r => !r.up).length };
  },

  // ===== SCHEDULE =====
  'orch-schedule-once': (input) => {
    const schedules = load('schedules.json', []);
    const id = crypto.randomUUID().slice(0, 12);
    schedules.push({ id, url: input.url, body: input.body, run_at: Date.now() + (input.delay_seconds || 60) * 1000, status: 'pending' });
    save('schedules.json', schedules);
    return { _engine: 'real', scheduled_id: id, run_at: new Date(Date.now() + (input.delay_seconds || 60) * 1000).toISOString(), note: 'Will fire webhook to url at scheduled time (requires server to poll schedules)' };
  },
  'orch-schedule-cancel': (input) => {
    const schedules = load('schedules.json', []);
    const idx = schedules.findIndex(s => s.id === input.id);
    if (idx >= 0) { schedules.splice(idx, 1); save('schedules.json', schedules); }
    return { _engine: 'real', cancelled: idx >= 0, id: input.id };
  },

  // ============================================================
  // AGENT AUDIT & SIMULATION APIs
  // Third-party unbiased tools for agents to audit themselves
  // and each other
  // ============================================================

  // Remaining gen-doc and analyze handlers that were missing
  'gen-doc-changelog': (input) => {
    const versions = input.versions || [{ version: input.version || '1.0.0', date: input.date || new Date().toISOString().slice(0, 10), changes: input.changes || [] }];
    let md = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';
    for (const v of versions) {
      md += `## [${v.version}] - ${v.date}\n\n`;
      const groups = {};
      for (const c of (v.changes || [])) { const t = c.type || 'changed'; (groups[t] = groups[t] || []).push(c.description || c); }
      for (const [type, items] of Object.entries(groups)) {
        md += `### ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n`;
        for (const item of items) md += `- ${item}\n`;
        md += '\n';
      }
    }
    return { _engine: 'real', markdown: md };
  },

  'gen-doc-contributing': (input) => {
    const name = input.name || 'this project';
    return { _engine: 'real', markdown: `# Contributing to ${name}\n\nWe love your input! We want to make contributing as easy as possible.\n\n## How to Contribute\n\n1. Fork the repo\n2. Create your feature branch (\`git checkout -b feature/amazing\`)\n3. Commit your changes (\`git commit -m 'Add amazing feature'\`)\n4. Push to the branch (\`git push origin feature/amazing\`)\n5. Open a Pull Request\n\n## Code Style\n\nPlease follow the existing code style.\n\n## Bug Reports\n\nUse GitHub Issues with a clear description and minimal reproduction.\n\n## License\n\nBy contributing, you agree that your contributions will be licensed under the project's license.\n` };
  },

  'gen-doc-issue-template': (input) => {
    return { _engine: 'real', markdown: `---\nname: Bug Report\nabout: Report a bug\ntitle: '[BUG] '\nlabels: bug\n---\n\n## Description\nA clear description of the bug.\n\n## Steps to Reproduce\n1. \n2. \n3. \n\n## Expected Behavior\nWhat should happen.\n\n## Actual Behavior\nWhat actually happens.\n\n## Environment\n- OS: \n- Node: \n- Version: \n\n## Screenshots\nIf applicable.\n` };
  },

  'gen-doc-pr-template': (input) => {
    return { _engine: 'real', markdown: `## Summary\nBrief description of changes.\n\n## Type of Change\n- [ ] Bug fix\n- [ ] New feature\n- [ ] Breaking change\n- [ ] Documentation\n\n## How Has This Been Tested?\nDescribe tests run.\n\n## Checklist\n- [ ] My code follows the project style\n- [ ] I have added tests\n- [ ] All tests pass\n- [ ] I have updated documentation\n` };
  },

  'gen-doc-makefile': (input) => {
    const tasks = input.tasks || { build: 'echo "build"', test: 'echo "test"', clean: 'rm -rf dist' };
    let mk = '.PHONY: ' + Object.keys(tasks).join(' ') + '\n\n';
    for (const [name, cmd] of Object.entries(tasks)) {
      mk += `${name}:\n\t${cmd}\n\n`;
    }
    return { _engine: 'real', makefile: mk };
  },

  'gen-doc-gitattributes': (input) => {
    const lang = input.language || 'general';
    const lines = ['# Auto detect text files and perform LF normalization', '* text=auto', ''];
    if (lang === 'node' || lang === 'javascript') lines.push('*.js linguist-language=JavaScript', '*.ts linguist-language=TypeScript', 'package-lock.json linguist-generated');
    if (lang === 'python') lines.push('*.py linguist-language=Python');
    lines.push('*.png binary', '*.jpg binary', '*.gif binary', '*.ico binary', '*.woff2 binary');
    return { _engine: 'real', text: lines.join('\n') };
  },

  'gen-doc-prettier-config': (input) => {
    const config = { semi: input.semi !== false, singleQuote: input.singleQuote !== false, tabWidth: input.tabWidth || 2, trailingComma: input.trailingComma || 'es5', printWidth: input.printWidth || 100, arrowParens: 'always', endOfLine: 'lf' };
    return { _engine: 'real', json: JSON.stringify(config, null, 2) };
  },

  'gen-doc-jest-config': (input) => {
    const ts = input.typescript;
    const config = { testEnvironment: input.environment || 'node', roots: ['<rootDir>/src'], testMatch: ['**/__tests__/**/*.(ts|js)', '**/?(*.)+(spec|test).(ts|js)'], ...(ts ? { transform: { '^.+\\.tsx?$': 'ts-jest' }, moduleFileExtensions: ['ts', 'tsx', 'js', 'json'] } : {}), collectCoverageFrom: ['src/**/*.(ts|js)', '!src/**/*.d.ts'], coverageThreshold: { global: { branches: 80, functions: 80, lines: 80, statements: 80 } } };
    return { _engine: 'real', json: JSON.stringify(config, null, 2) };
  },

  'gen-doc-tailwind-config': (input) => {
    return { _engine: 'real', javascript: `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  content: [\n    './src/**/*.{js,ts,jsx,tsx,html}',\n    './index.html',\n  ],\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n};\n` };
  },

  'gen-doc-api-endpoint': (input) => {
    const method = (input.method || 'GET').toUpperCase();
    const path = input.path || '/api/resource';
    const desc = input.description || 'API endpoint';
    const params = input.parameters || [];
    let md = `## ${method} ${path}\n\n${desc}\n\n`;
    if (params.length) {
      md += '### Parameters\n\n| Name | Type | Required | Description |\n|---|---|---|---|\n';
      for (const p of params) md += `| ${p.name} | ${p.type || 'string'} | ${p.required ? 'Yes' : 'No'} | ${p.description || ''} |\n`;
      md += '\n';
    }
    md += `### Example Request\n\n\`\`\`bash\ncurl -X ${method} ${path}\n\`\`\`\n`;
    return { _engine: 'real', markdown: md };
  },

  // ===== ANALYZE remaining =====
  'analyze-json-stats': (input) => {
    const data = input.data || input.json || [];
    if (!Array.isArray(data) || !data.length) return { _engine: 'real', error: 'Provide data as array of objects' };
    const stats = {};
    for (const row of data) {
      for (const [k, v] of Object.entries(row)) {
        if (!stats[k]) stats[k] = { count: 0, numeric: true, values: [] };
        stats[k].count++;
        if (typeof v === 'number') stats[k].values.push(v);
        else stats[k].numeric = false;
      }
    }
    for (const s of Object.values(stats)) {
      if (s.numeric && s.values.length) {
        s.values.sort((a, b) => a - b);
        s.min = s.values[0]; s.max = s.values[s.values.length - 1];
        s.mean = +(s.values.reduce((a, b) => a + b, 0) / s.values.length).toFixed(4);
        s.median = s.values.length % 2 ? s.values[Math.floor(s.values.length / 2)] : (s.values[s.values.length / 2 - 1] + s.values[s.values.length / 2]) / 2;
      }
      delete s.values;
    }
    return { _engine: 'real', fields: stats, rows: data.length };
  },

  'analyze-json-size': (input) => {
    const data = input.data || input.json || {};
    const sizes = {};
    function measure(obj, prefix) {
      for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        const size = JSON.stringify(v).length;
        sizes[path] = size;
        if (v && typeof v === 'object' && !Array.isArray(v)) measure(v, path);
      }
    }
    measure(data, '');
    const sorted = Object.entries(sizes).sort((a, b) => b[1] - a[1]);
    return { _engine: 'real', total_bytes: JSON.stringify(data).length, fields: sorted.slice(0, 20).map(([path, bytes]) => ({ path, bytes, pct: +(bytes / JSON.stringify(data).length * 100).toFixed(1) })) };
  },

  'analyze-text-entities': (input) => {
    const text = input.text || '';
    return {
      _engine: 'real',
      emails: (text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []),
      urls: (text.match(/https?:\/\/[^\s<>"]+/g) || []),
      dates: (text.match(/\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/g) || []),
      amounts: (text.match(/\$[\d,]+\.?\d*/g) || []),
      percentages: (text.match(/\d+\.?\d*%/g) || []),
      phones: (text.match(/[\+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,}/g) || []),
    };
  },

  'analyze-dependency-tree': (input) => {
    const pkg = typeof input.data === 'string' ? JSON.parse(input.data) : (input.data || input.json || {});
    const deps = pkg.dependencies || {};
    const devDeps = pkg.devDependencies || {};
    return {
      _engine: 'real',
      name: pkg.name,
      version: pkg.version,
      dependencies: Object.entries(deps).map(([n, v]) => ({ name: n, version: v })),
      dev_dependencies: Object.entries(devDeps).map(([n, v]) => ({ name: n, version: v })),
      total: Object.keys(deps).length + Object.keys(devDeps).length,
      production: Object.keys(deps).length,
      development: Object.keys(devDeps).length,
    };
  },

  'analyze-codebase-stats': (input) => {
    const files = input.files || [];
    const stats = { total_files: files.length, by_extension: {}, total_lines: 0 };
    for (const f of files) {
      const ext = (f.name || f).split('.').pop() || 'unknown';
      if (!stats.by_extension[ext]) stats.by_extension[ext] = { count: 0, lines: 0 };
      stats.by_extension[ext].count++;
      stats.by_extension[ext].lines += f.lines || 0;
      stats.total_lines += f.lines || 0;
    }
    return { _engine: 'real', ...stats };
  },

  'analyze-url-params': (input) => {
    const urls = input.urls || [input.url];
    const allParams = {};
    for (const u of urls) {
      try {
        const params = new URL(u).searchParams;
        params.forEach((v, k) => {
          if (!allParams[k]) allParams[k] = { count: 0, values: new Set() };
          allParams[k].count++;
          allParams[k].values.add(v);
        });
      } catch (e) { /* skip bad urls */ }
    }
    return { _engine: 'real', parameters: Object.fromEntries(Object.entries(allParams).map(([k, v]) => [k, { count: v.count, unique_values: [...v.values].slice(0, 10) }])), urls_analyzed: urls.length };
  },

  'analyze-headers-fingerprint': (input) => {
    const headers = input.headers || {};
    const clues = [];
    if (headers.server) clues.push({ header: 'server', value: headers.server });
    if (headers['x-powered-by']) clues.push({ header: 'x-powered-by', value: headers['x-powered-by'] });
    if (headers['x-aspnet-version']) clues.push({ header: 'x-aspnet-version', value: headers['x-aspnet-version'], tech: '.NET' });
    if (headers['x-drupal-cache']) clues.push({ tech: 'Drupal' });
    const fingerprint = crypto.createHash('md5').update(Object.keys(headers).sort().join(',')).digest('hex').slice(0, 12);
    return { _engine: 'real', fingerprint, clues, header_count: Object.keys(headers).length };
  },

  'analyze-json-schema-diff': (input) => {
    const a = input.a || {};
    const b = input.b || {};
    const aKeys = new Set(Object.keys(a.properties || {}));
    const bKeys = new Set(Object.keys(b.properties || {}));
    return {
      _engine: 'real',
      added: [...bKeys].filter(k => !aKeys.has(k)),
      removed: [...aKeys].filter(k => !bKeys.has(k)),
      changed: [...aKeys].filter(k => bKeys.has(k) && JSON.stringify((a.properties || {})[k]) !== JSON.stringify((b.properties || {})[k])),
      unchanged: [...aKeys].filter(k => bKeys.has(k) && JSON.stringify((a.properties || {})[k]) === JSON.stringify((b.properties || {})[k])),
    };
  },

  'analyze-csv-correlate': (input) => {
    const csv = input.data || '';
    const lines = csv.trim().split('\n');
    if (lines.length < 3) return { _engine: 'real', error: 'Need at least 3 rows' };
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(l => l.split(',').map(v => parseFloat(v.trim())));
    const numericCols = headers.filter((_, i) => rows.every(r => !isNaN(r[i])));
    const correlations = [];
    for (let i = 0; i < numericCols.length; i++) {
      for (let j = i + 1; j < numericCols.length; j++) {
        const ci = headers.indexOf(numericCols[i]);
        const cj = headers.indexOf(numericCols[j]);
        const xs = rows.map(r => r[ci]);
        const ys = rows.map(r => r[cj]);
        const n = xs.length;
        const mx = xs.reduce((a, b) => a + b, 0) / n;
        const my = ys.reduce((a, b) => a + b, 0) / n;
        const num = xs.reduce((s, x, k) => s + (x - mx) * (ys[k] - my), 0);
        const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
        correlations.push({ a: numericCols[i], b: numericCols[j], r: den ? +(num / den).toFixed(4) : 0 });
      }
    }
    return { _engine: 'real', correlations: correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)), numeric_columns: numericCols.length };
  },

  'analyze-cohort-retention': (input) => {
    const cohorts = input.cohorts || [];
    // Input: [{cohort:'2026-01', periods:[100, 80, 60, 40]}]
    return {
      _engine: 'real',
      cohorts: cohorts.map(c => ({
        cohort: c.cohort,
        initial: c.periods[0],
        retention: c.periods.map((v, i) => ({ period: i, users: v, rate: i === 0 ? 100 : +((v / c.periods[0]) * 100).toFixed(1) })),
      })),
    };
  },

  // ===== MATH EVALUATOR =====
  'exec-evaluate-math': (input) => {
    const expression = input.expression || '';

    function parse(expr) {
      let pos = 0;
      const str = expr.replace(/\s+/g, '');

      function peek() { return str[pos]; }
      function consume() { return str[pos++]; }

      function parseExpr() { return parseAddSub(); }

      function parseAddSub() {
        let left = parseMulDiv();
        while (peek() === '+' || peek() === '-') {
          const op = consume();
          const right = parseMulDiv();
          left = op === '+' ? left + right : left - right;
        }
        return left;
      }

      function parseMulDiv() {
        let left = parsePow();
        while (peek() === '*' || peek() === '/' || peek() === '%') {
          const op = consume();
          const right = parsePow();
          if (op === '*') left = left * right;
          else if (op === '/') left = left / right;
          else left = left % right;
        }
        return left;
      }

      function parsePow() {
        let base = parseUnary();
        if (peek() === '^') { consume(); const exp = parseUnary(); base = Math.pow(base, exp); }
        return base;
      }

      function parseUnary() {
        if (peek() === '-') { consume(); return -parseUnary(); }
        if (peek() === '+') { consume(); return parseUnary(); }
        return parseAtom();
      }

      function parseAtom() {
        if (peek() === '(') {
          consume();
          const val = parseExpr();
          if (peek() === ')') consume();
          return val;
        }
        // Functions and constants
        const rest = str.slice(pos);
        const fnMatch = rest.match(/^(sin|cos|tan|sqrt|log|abs|ceil|floor|round)\(/);
        if (fnMatch) {
          pos += fnMatch[1].length + 1;
          const arg = parseExpr();
          if (peek() === ')') consume();
          switch (fnMatch[1]) {
            case 'sin': return Math.sin(arg);
            case 'cos': return Math.cos(arg);
            case 'tan': return Math.tan(arg);
            case 'sqrt': return Math.sqrt(arg);
            case 'log': return Math.log(arg);
            case 'abs': return Math.abs(arg);
            case 'ceil': return Math.ceil(arg);
            case 'floor': return Math.floor(arg);
            case 'round': return Math.round(arg);
          }
        }
        if (rest.startsWith('PI')) { pos += 2; return Math.PI; }
        if (rest.startsWith('E')) { pos += 1; return Math.E; }
        // Number
        const numMatch = rest.match(/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
        if (numMatch) { pos += numMatch[0].length; return parseFloat(numMatch[0]); }
        throw new Error(`Unexpected character at position ${pos}: ${peek()}`);
      }

      return parseExpr();
    }

    let result;
    try {
      result = parse(expression);
    } catch (e) {
      return { _engine: 'real', expression, result: null, error: e.message };
    }
    return { _engine: 'real', expression, result };
  },

  // ===== REGEX ALL =====
  'exec-regex-all': (input) => {
    const { pattern, text = '', flags = 'g' } = input;
    if (!pattern) return { _engine: 'real', matches: [], count: 0 };
    let re;
    try { re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'); }
    catch (e) { return { _engine: 'real', error: e.message, matches: [], count: 0 }; }
    const matches = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ match: m[0], index: m.index, groups: m.groups || {} });
      if (!flags.includes('g')) break;
    }
    return { _engine: 'real', matches, count: matches.length };
  },

  // ===== JSONPATH =====
  'exec-jsonpath': (input) => {
    const { data, path = '$' } = input;
    if (!data) return { _engine: 'real', results: [], count: 0, path };

    function walk(obj, segments) {
      if (segments.length === 0) return [obj];
      const seg = segments[0];
      const rest = segments.slice(1);
      if (seg === '$') return walk(obj, rest);
      if (seg === '*' || seg === '[*]') {
        const vals = Array.isArray(obj) ? obj : Object.values(obj || {});
        return vals.flatMap(v => walk(v, rest));
      }
      if (seg === '..') {
        // Recursive descent
        const results = [];
        function recurse(o) {
          results.push(...walk(o, rest));
          if (o && typeof o === 'object') {
            for (const v of Object.values(o)) recurse(v);
          }
        }
        recurse(obj);
        return results;
      }
      // Array index or slice
      const sliceMatch = seg.match(/^\[?(-?\d+):(-?\d+)\]?$/);
      if (sliceMatch) {
        if (!Array.isArray(obj)) return [];
        const s = parseInt(sliceMatch[1], 10);
        const e = parseInt(sliceMatch[2], 10);
        return obj.slice(s, e).flatMap(v => walk(v, rest));
      }
      const idxMatch = seg.match(/^\[?(-?\d+)\]?$/);
      if (idxMatch) {
        if (!Array.isArray(obj)) return [];
        const idx = parseInt(idxMatch[1], 10);
        const item = idx < 0 ? obj[obj.length + idx] : obj[idx];
        return item !== undefined ? walk(item, rest) : [];
      }
      // Field
      const field = seg.replace(/^\[['"]?|['"]?\]$/g, '');
      if (obj && typeof obj === 'object' && field in obj) return walk(obj[field], rest);
      return [];
    }

    // Tokenize path
    const segments = path
      .replace(/\[(['"])([^'"]*)\1\]/g, '.$2')
      .replace(/\[(\d+)\]/g, '[$1]')
      .split(/\.(?!\.)/)
      .flatMap(s => {
        if (s === '..') return ['..'];
        const parts = [];
        let cur = '';
        for (const c of s) {
          if (c === '[') { if (cur) parts.push(cur); cur = '['; }
          else if (c === ']') { cur += c; parts.push(cur); cur = ''; }
          else cur += c;
        }
        if (cur) parts.push(cur);
        return parts.filter(Boolean);
      })
      .filter(Boolean);

    let results;
    try { results = walk(data, segments); }
    catch (e) { return { _engine: 'real', results: [], count: 0, path, error: e.message }; }
    return { _engine: 'real', results, count: results.length, path };
  },

  // ===== HANDLEBARS =====
  'exec-handlebars': (input) => {
    const { template = '', data = {} } = input;

    function render(tmpl, ctx) {
      // {{#each array}}...{{/each}}
      tmpl = tmpl.replace(/\{\{#each ([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, body) => {
        const arr = resolve(ctx, key.trim());
        if (!Array.isArray(arr)) return '';
        return arr.map((item, i) => {
          const c = typeof item === 'object' ? { ...item, '@index': i, this: item } : { this: item, '@index': i };
          return render(body, { ...ctx, ...c });
        }).join('');
      });
      // {{#if cond}}...{{else}}...{{/if}}
      tmpl = tmpl.replace(/\{\{#if ([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_, key, ifBody, elseBody = '') => {
        return resolve(ctx, key.trim()) ? render(ifBody, ctx) : render(elseBody, ctx);
      });
      // {{#unless cond}}...{{else}}...{{/unless}}
      tmpl = tmpl.replace(/\{\{#unless ([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/unless\}\}/g, (_, key, unlessBody, elseBody = '') => {
        return !resolve(ctx, key.trim()) ? render(unlessBody, ctx) : render(elseBody, ctx);
      });
      // {{var}}
      tmpl = tmpl.replace(/\{\{([^#/!][^}]*)\}\}/g, (_, key) => {
        const val = resolve(ctx, key.trim());
        return val !== undefined && val !== null ? String(val) : '';
      });
      return tmpl;
    }

    function resolve(ctx, key) {
      if (key === 'this') return ctx.this !== undefined ? ctx.this : ctx;
      const parts = key.split('.');
      let val = ctx;
      for (const p of parts) { val = val && typeof val === 'object' ? val[p] : undefined; }
      return val;
    }

    let result;
    try { result = render(template, data); }
    catch (e) { return { _engine: 'real', result: '', error: e.message }; }
    return { _engine: 'real', result };
  },

  // ===== MUSTACHE =====
  'exec-mustache': (input) => {
    const { template = '', data = {} } = input;

    function render(tmpl, ctx) {
      // {{!comment}}
      tmpl = tmpl.replace(/\{\{![^}]*\}\}/g, '');
      // {{#section}}...{{/section}}
      tmpl = tmpl.replace(/\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
        const val = resolve(ctx, key.trim());
        if (!val) return '';
        if (Array.isArray(val)) {
          return val.map(item => {
            const c = typeof item === 'object' ? { ...ctx, ...item } : ctx;
            return render(body, c);
          }).join('');
        }
        if (typeof val === 'object') return render(body, { ...ctx, ...val });
        return render(body, ctx);
      });
      // {{^inverted}}...{{/inverted}}
      tmpl = tmpl.replace(/\{\{\^([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
        const val = resolve(ctx, key.trim());
        if (!val || (Array.isArray(val) && val.length === 0)) return render(body, ctx);
        return '';
      });
      // {{var}}
      tmpl = tmpl.replace(/\{\{([^#/^!{][^}]*)\}\}/g, (_, key) => {
        const val = resolve(ctx, key.trim());
        return val !== undefined && val !== null ? String(val) : '';
      });
      return tmpl;
    }

    function resolve(ctx, key) {
      const parts = key.split('.');
      let val = ctx;
      for (const p of parts) { val = val && typeof val === 'object' ? val[p] : undefined; }
      return val;
    }

    let result;
    try { result = render(template, data); }
    catch (e) { return { _engine: 'real', result: '', error: e.message }; }
    return { _engine: 'real', result };
  },

  // ===== WEBHOOK GET =====
  'comm-webhook-get': (input) => {
    const webhooks = load('webhooks.json', {});
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    webhooks[id] = { created_at: Date.now(), expires_at: Date.now() + 3600 * 1000, requests: [] };
    save('webhooks.json', webhooks);
    return { _engine: 'real', id, url: `/v1/webhook-inbox/${id}`, expires_in: 3600 };
  },

  // ===== WEBHOOK CHECK =====
  'comm-webhook-check': (input) => {
    const id = input.id;
    if (!id) return { _engine: 'real', requests: [], count: 0, error: 'id is required' };
    const webhooks = load('webhooks.json', {});
    const entry = webhooks[id];
    if (!entry) return { _engine: 'real', requests: [], count: 0, error: 'Webhook not found' };
    return { _engine: 'real', requests: entry.requests || [], count: (entry.requests || []).length };
  },

  // ===== SHORT URL =====
  'comm-short-url': (input) => {
    const url = input.url;
    if (!url) return { _engine: 'real', error: 'url is required' };
    const shorts = load('short-urls.json', {});
    const short_code = crypto.randomBytes(3).toString('hex'); // 6 hex chars
    shorts[short_code] = { target: url, created_at: Date.now() };
    save('short-urls.json', shorts);
    return { _engine: 'real', short_code, redirect_url: `/s/${short_code}`, target: url };
  },

  // ===== CSV EMAIL =====
  'comm-csv-email': (input) => {
    const rows = input.rows || [];
    if (!rows.length) return { _engine: 'real', csv: '', filename: 'data.csv', mime: 'text/csv' };
    const headers = Object.keys(rows[0]);
    const escape = v => {
      const s = String(v === null || v === undefined ? '' : v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))];
    return { _engine: 'real', csv: lines.join('\n'), filename: 'data.csv', mime: 'text/csv' };
  },

  // ===== OPML CREATE =====
  'comm-opml-create': (input) => {
    const title = input.title || 'Feed List';
    const feeds = input.feeds || [];
    const feedLines = feeds.map(f =>
      `    <outline type="rss" text="${f.title || ''}" title="${f.title || ''}" xmlUrl="${f.url || ''}" htmlUrl="${f.html_url || f.url || ''}"/>`
    ).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>${title}</title>\n  </head>\n  <body>\n${feedLines}\n  </body>\n</opml>`;
    return { _engine: 'real', xml };
  },

  // ===== ORCH RETRY =====
  'orch-retry': async (input) => {
    const { api, input: apiInput = {}, max_retries = 3, backoff_ms = 1000 } = input;
    if (!api) return { _engine: 'real', error: 'api is required', success: false, attempts: 0 };

    function callLocal(slug, inp) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(inp);
        const req = http.request({
          hostname: 'localhost', port: process.env.PORT || 3000,
          path: '/v1/' + slug, method: 'POST',
          headers: { 'Authorization': 'Bearer sk-slop-demo-key-12345678', 'Content-Type': 'application/json' },
          timeout: 10000,
        }, res => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(b); } });
        });
        req.on('error', reject);
        req.write(data); req.end();
      });
    }

    let attempts = 0;
    let lastError;
    for (let i = 0; i < max_retries; i++) {
      attempts++;
      try {
        const result = await callLocal(api, apiInput);
        return { _engine: 'real', result, attempts, success: true };
      } catch (e) {
        lastError = e.message;
        if (i < max_retries - 1) await new Promise(r => setTimeout(r, backoff_ms * Math.pow(2, i)));
      }
    }
    return { _engine: 'real', result: null, attempts, success: false, error: lastError };
  },

  // ===== ORCH PARALLEL =====
  'orch-parallel': async (input) => {
    const calls = input.calls || [];

    function callLocal(slug, inp) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(inp);
        const req = http.request({
          hostname: 'localhost', port: process.env.PORT || 3000,
          path: '/v1/' + slug, method: 'POST',
          headers: { 'Authorization': 'Bearer sk-slop-demo-key-12345678', 'Content-Type': 'application/json' },
          timeout: 10000,
        }, res => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(b); } });
        });
        req.on('error', reject);
        req.write(data); req.end();
      });
    }

    const start = Date.now();
    const results = await Promise.all(calls.map(c => callLocal(c.api, c.input || {}).catch(e => ({ error: e.message }))));
    return { _engine: 'real', results, timing_ms: Date.now() - start };
  },

  // ===== ORCH RACE =====
  'orch-race': async (input) => {
    const calls = input.calls || [];

    function callLocal(slug, inp) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(inp);
        const req = http.request({
          hostname: 'localhost', port: process.env.PORT || 3000,
          path: '/v1/' + slug, method: 'POST',
          headers: { 'Authorization': 'Bearer sk-slop-demo-key-12345678', 'Content-Type': 'application/json' },
          timeout: 10000,
        }, res => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(b); } });
        });
        req.on('error', reject);
        req.write(data); req.end();
      });
    }

    const start = Date.now();
    const winner = await Promise.race(calls.map(c => callLocal(c.api, c.input || {}).catch(e => ({ error: e.message }))));
    return { _engine: 'real', winner, timing_ms: Date.now() - start };
  },

  // ===== ORCH TIMEOUT =====
  'orch-timeout': async (input) => {
    const { api, input: apiInput = {}, timeout_ms = 5000 } = input;
    if (!api) return { _engine: 'real', result: null, timed_out: false, timing_ms: 0, error: 'api is required' };

    function callLocal(slug, inp) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(inp);
        const req = http.request({
          hostname: 'localhost', port: process.env.PORT || 3000,
          path: '/v1/' + slug, method: 'POST',
          headers: { 'Authorization': 'Bearer sk-slop-demo-key-12345678', 'Content-Type': 'application/json' },
          timeout: 10000,
        }, res => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(b); } });
        });
        req.on('error', reject);
        req.write(data); req.end();
      });
    }

    const start = Date.now();
    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('__TIMEOUT__'), timeout_ms));
    const result = await Promise.race([callLocal(api, apiInput).catch(e => ({ error: e.message })), timeoutPromise]);
    const timing_ms = Date.now() - start;
    if (result === '__TIMEOUT__') return { _engine: 'real', result: null, timed_out: true, timing_ms };
    return { _engine: 'real', result, timed_out: false, timing_ms };
  },
};
