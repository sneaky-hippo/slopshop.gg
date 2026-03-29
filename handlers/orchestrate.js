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
    try {
    input = input || {};
    let calls = input.calls;
    if (typeof calls === 'string') { try { calls = JSON.parse(calls); } catch(e) {} }
    if (!Array.isArray(calls) || calls.length === 0) {
      return { _engine: 'real', winner: null, timing_ms: 0, error: 'calls must be a non-empty array of {api, input}' };
    }

    function callLocal(slug, inp) {
      return new Promise((resolve, reject) => {
        const timeoutMs = 5000;
        const data = JSON.stringify(inp);
        const req = http.request({
          hostname: 'localhost', port: process.env.PORT || 3000,
          path: '/v1/' + slug, method: 'POST',
          headers: { 'Authorization': 'Bearer sk-slop-demo-key-12345678', 'Content-Type': 'application/json' },
          timeout: timeoutMs,
        }, res => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(b); } });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
        req.write(data); req.end();
      });
    }

    const start = Date.now();
    const raceTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('race_timeout')), 6000));
    let winner;
    try {
      winner = await Promise.race([
        ...calls.map(c => callLocal(c.api, c.input || {}).catch(e => ({ error: e.message, api: c.api }))),
        raceTimeout
      ]);
    } catch(e) {
      winner = { error: e.message };
    }
    return { _engine: 'real', winner, timing_ms: Date.now() - start };
    } catch(e) { return { _engine: 'real', winner: null, timing_ms: 0, error: e.message }; }
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

  // ===== TEAM MANAGEMENT =====
  'team-create': (input) => {
    const teams = load('teams.json', {});
    const id = input.id || crypto.randomUUID().slice(0, 8);
    if (teams[id]) return { _engine: 'real', error: 'team already exists', id };
    teams[id] = { id, name: input.name || id, namespace: input.namespace || id, members: [], created_at: new Date().toISOString() };
    save('teams.json', teams);
    return { _engine: 'real', created: true, id, name: teams[id].name, namespace: teams[id].namespace };
  },
  'team-hire': (input) => {
    const teams = load('teams.json', {});
    const id = input.team_id || input.id;
    if (!teams[id]) return { _engine: 'real', error: 'team not found', id };
    const member = { agent: input.agent, role: input.role || 'member', hired_at: new Date().toISOString() };
    teams[id].members.push(member);
    save('teams.json', teams);
    return { _engine: 'real', hired: true, team: id, agent: input.agent, role: member.role, team_size: teams[id].members.length };
  },
  'team-fire': (input) => {
    const teams = load('teams.json', {});
    const id = input.team_id || input.id;
    if (!teams[id]) return { _engine: 'real', error: 'team not found', id };
    const before = teams[id].members.length;
    teams[id].members = teams[id].members.filter(m => m.agent !== input.agent);
    save('teams.json', teams);
    return { _engine: 'real', fired: before !== teams[id].members.length, team: id, agent: input.agent, team_size: teams[id].members.length };
  },
  'team-get': (input) => {
    const teams = load('teams.json', {});
    const id = input.team_id || input.id;
    if (!id) return { _engine: 'real', teams: Object.values(teams).map(t => ({ id: t.id, name: t.name, size: t.members.length })) };
    const team = teams[id];
    if (!team) return { _engine: 'real', error: 'team not found', id };
    return { _engine: 'real', ...team };
  },
  'team-interview': (input) => {
    const questions = input.questions || [];
    const answers = input.answers || [];
    const scored = questions.map((q, i) => {
      const answer = answers[i] || '';
      const score = answer.length > 10 ? Math.min(10, Math.floor(answer.length / 20) + 3) : answer.length > 0 ? 2 : 0;
      return { question: q, answer, score, max: 10 };
    });
    const total = scored.reduce((s, q) => s + q.score, 0);
    const max = scored.length * 10;
    return { _engine: 'real', candidate: input.candidate || 'anonymous', scores: scored, total, max, percentage: max ? Math.round(total / max * 100) : 0, recommendation: total / max >= 0.7 ? 'hire' : total / max >= 0.4 ? 'maybe' : 'pass' };
  },

  // ===== PREDICTION MARKETS =====
  'market-create': (input) => {
    const markets = load('markets.json', {});
    const id = crypto.randomUUID().slice(0, 8);
    markets[id] = { id, question: input.question, deadline: input.deadline || null, bets: [], resolved: false, created_at: new Date().toISOString() };
    save('markets.json', markets);
    return { _engine: 'real', created: true, id, question: input.question };
  },
  'market-bet': (input) => {
    const markets = load('markets.json', {});
    const id = input.market_id;
    if (!markets[id]) return { _engine: 'real', error: 'market not found', id };
    if (markets[id].resolved) return { _engine: 'real', error: 'market already resolved', id };
    const bet = { agent: input.agent, position: input.position, amount: input.amount || 1, placed_at: new Date().toISOString() };
    markets[id].bets.push(bet);
    save('markets.json', markets);
    const yes_total = markets[id].bets.filter(b => b.position === 'yes').reduce((s, b) => s + b.amount, 0);
    const no_total = markets[id].bets.filter(b => b.position === 'no').reduce((s, b) => s + b.amount, 0);
    const total = yes_total + no_total;
    return { _engine: 'real', placed: true, market: id, position: input.position, amount: input.amount || 1, implied_prob: total ? +(yes_total / total).toFixed(3) : 0.5 };
  },
  'market-resolve': (input) => {
    const markets = load('markets.json', {});
    const id = input.market_id;
    if (!markets[id]) return { _engine: 'real', error: 'market not found', id };
    const outcome = input.outcome; // 'yes' or 'no'
    const winners = markets[id].bets.filter(b => b.position === outcome);
    const total_pool = markets[id].bets.reduce((s, b) => s + b.amount, 0);
    const winner_pool = winners.reduce((s, b) => s + b.amount, 0);
    markets[id].resolved = true; markets[id].outcome = outcome; markets[id].resolved_at = new Date().toISOString();
    save('markets.json', markets);
    return { _engine: 'real', resolved: true, market: id, outcome, winners: winners.map(w => ({ agent: w.agent, amount: w.amount, payout: winner_pool > 0 ? +(w.amount / winner_pool * total_pool).toFixed(2) : 0 })), total_pool };
  },
  'market-get': (input) => {
    const markets = load('markets.json', {});
    const id = input.market_id;
    if (!id) return { _engine: 'real', markets: Object.values(markets).map(m => ({ id: m.id, question: m.question, bets: m.bets.length, resolved: m.resolved })) };
    const m = markets[id];
    if (!m) return { _engine: 'real', error: 'market not found', id };
    const yes_total = m.bets.filter(b => b.position === 'yes').reduce((s, b) => s + b.amount, 0);
    const no_total = m.bets.filter(b => b.position === 'no').reduce((s, b) => s + b.amount, 0);
    const total = yes_total + no_total;
    return { _engine: 'real', ...m, yes_prob: total ? +(yes_total / total).toFixed(3) : 0.5, no_prob: total ? +(no_total / total).toFixed(3) : 0.5 };
  },

  // ===== TOURNAMENTS =====
  'tournament-create': (input) => {
    const t = load('tournaments.json', {});
    const id = crypto.randomUUID().slice(0, 8);
    t[id] = { id, name: input.name, type: input.type || 'single-elimination', participants: input.participants || [], matches: [], created_at: new Date().toISOString() };
    save('tournaments.json', t);
    return { _engine: 'real', created: true, id, name: t[id].name, type: t[id].type };
  },
  'tournament-match': (input) => {
    const t = load('tournaments.json', {});
    const id = input.tournament_id;
    if (!t[id]) return { _engine: 'real', error: 'tournament not found', id };
    const match = { round: input.round || 1, player_a: input.player_a, player_b: input.player_b, winner: input.winner, score: input.score || null, played_at: new Date().toISOString() };
    t[id].matches.push(match);
    save('tournaments.json', t);
    return { _engine: 'real', recorded: true, tournament: id, match, total_matches: t[id].matches.length };
  },
  'tournament-get': (input) => {
    const t = load('tournaments.json', {});
    const id = input.tournament_id;
    if (!id) return { _engine: 'real', tournaments: Object.values(t).map(x => ({ id: x.id, name: x.name, matches: x.matches.length })) };
    if (!t[id]) return { _engine: 'real', error: 'tournament not found', id };
    const wins = {};
    t[id].matches.forEach(m => { if (m.winner) wins[m.winner] = (wins[m.winner] || 0) + 1; });
    return { _engine: 'real', ...t[id], standings: Object.entries(wins).sort((a, b) => b[1] - a[1]).map(([p, w]) => ({ participant: p, wins: w })) };
  },

  // ===== LEADERBOARD =====
  'leaderboard': (input) => {
    const reputations = load('reputations.json', {});
    const entries = Object.entries(reputations).map(([agent, data]) => ({ agent, score: data.score || 0, badges: (data.badges || []).length }));
    entries.sort((a, b) => b.score - a.score);
    const limit = input.limit || 20;
    return { _engine: 'real', leaderboard: entries.slice(0, limit).map((e, i) => ({ rank: i + 1, ...e })), total_agents: entries.length };
  },

  // ===== GOVERNANCE =====
  'governance-propose': (input) => {
    const props = load('governance.json', []);
    const id = crypto.randomUUID().slice(0, 8);
    props.push({ id, title: input.title, description: input.description, proposer: input.agent, votes: { yes: 0, no: 0, abstain: 0 }, voters: {}, status: 'active', created_at: new Date().toISOString() });
    save('governance.json', props);
    return { _engine: 'real', proposed: true, id, title: input.title };
  },
  'governance-vote': (input) => {
    const props = load('governance.json', []);
    const p = props.find(x => x.id === input.proposal_id);
    if (!p) return { _engine: 'real', error: 'proposal not found' };
    if (p.voters[input.agent]) return { _engine: 'real', error: 'already voted', agent: input.agent };
    const vote = input.vote || 'yes';
    p.votes[vote] = (p.votes[vote] || 0) + 1;
    p.voters[input.agent] = vote;
    save('governance.json', props);
    return { _engine: 'real', voted: true, proposal: input.proposal_id, vote, current_tally: p.votes };
  },
  'governance-proposals': (input) => {
    const props = load('governance.json', []);
    const status = input.status || 'active';
    const filtered = props.filter(p => !status || p.status === status);
    return { _engine: 'real', proposals: filtered.map(p => ({ id: p.id, title: p.title, votes: p.votes, voter_count: Object.keys(p.voters).length, status: p.status, created_at: p.created_at })), total: filtered.length };
  },

  // ===== RITUALS =====
  'ritual-milestone': (input) => {
    const milestones = load('milestones.json', []);
    const id = crypto.randomUUID().slice(0, 8);
    milestones.push({ id, title: input.title, description: input.description || '', agent: input.agent || 'system', recorded_at: new Date().toISOString() });
    save('milestones.json', milestones);
    return { _engine: 'real', recorded: true, id, title: input.title, total_milestones: milestones.length };
  },
  'ritual-milestones': (input) => {
    const milestones = load('milestones.json', []);
    return { _engine: 'real', milestones: milestones.slice(-(input.limit || 50)).reverse(), total: milestones.length };
  },
  'ritual-celebration': (input) => {
    const events = load('events.json', []);
    const celebration = { name: 'celebration', data: { message: input.message || 'Celebrating!', agent: input.agent || 'system', emoji: '🎉' }, timestamp: Date.now() };
    events.push(celebration);
    if (events.length > 1000) events.splice(0, events.length - 1000);
    save('events.json', events);
    return { _engine: 'real', celebrated: true, message: celebration.data.message, published_to: 'events' };
  },

  // ===== IDENTITY =====
  'identity-set': (input) => {
    const identities = load('identities.json', {});
    const key = input.agent || input.key;
    if (!key) return { _engine: 'real', error: 'agent key required' };
    identities[key] = { key, avatar: input.avatar || null, bio: input.bio || '', skills: input.skills || [], links: input.links || {}, updated_at: new Date().toISOString() };
    save('identities.json', identities);
    return { _engine: 'real', set: true, key, profile: identities[key] };
  },
  'identity-get': (input) => {
    const identities = load('identities.json', {});
    const key = input.agent || input.key;
    if (!key) return { _engine: 'real', error: 'agent key required' };
    return { _engine: 'real', found: !!identities[key], profile: identities[key] || null };
  },
  'identity-directory': (input) => {
    const identities = load('identities.json', {});
    const profiles = Object.values(identities);
    return { _engine: 'real', agents: profiles, total: profiles.length };
  },

  // ===== CERTIFICATIONS =====
  'cert-create': (input) => {
    const certs = load('certifications.json', {});
    const id = input.id || crypto.randomUUID().slice(0, 8);
    certs[id] = { id, name: input.name, description: input.description || '', questions: input.questions || [], pass_threshold: input.pass_threshold || 0.7, created_at: new Date().toISOString() };
    save('certifications.json', certs);
    return { _engine: 'real', created: true, id, name: input.name, questions: (input.questions || []).length };
  },
  'cert-exam': (input) => {
    const certs = load('certifications.json', {});
    const id = input.cert_id;
    const cert = certs[id];
    if (!cert) return { _engine: 'real', error: 'certification not found', id };
    const answers = input.answers || [];
    const results = cert.questions.map((q, i) => {
      const given = (answers[i] || '').toString().trim().toLowerCase();
      const correct = (q.answer || '').toString().trim().toLowerCase();
      return { question: q.question || q, correct: given === correct || given.includes(correct), given_answer: answers[i], correct_answer: q.answer };
    });
    const score = results.filter(r => r.correct).length / Math.max(results.length, 1);
    const passed = score >= cert.pass_threshold;
    return { _engine: 'real', cert_id: id, agent: input.agent, score: +score.toFixed(3), passed, results, certificate: passed ? { issued_to: input.agent, cert: cert.name, issued_at: new Date().toISOString() } : null };
  },
  'cert-list': (input) => {
    const certs = load('certifications.json', {});
    return { _engine: 'real', certifications: Object.values(certs).map(c => ({ id: c.id, name: c.name, description: c.description, question_count: (c.questions || []).length, pass_threshold: c.pass_threshold })), total: Object.keys(certs).length };
  },

  // ===== AGENT HEALTH =====
  'health-burnout-check': (input) => {
    const recentCalls = input.recent_calls || [];
    const errorRate = input.error_rate || 0;
    const uniqueApis = new Set(recentCalls).size;
    const monotony = recentCalls.length > 0 ? 1 - uniqueApis / recentCalls.length : 0;
    const overload = recentCalls.length > 100;
    const burnoutScore = Math.round((monotony * 0.4 + errorRate * 0.4 + (overload ? 0.2 : 0)) * 100);
    const signals = [];
    if (monotony > 0.7) signals.push('high monotony — same API called repeatedly');
    if (errorRate > 0.3) signals.push('elevated error rate');
    if (overload) signals.push('high call volume');
    return { _engine: 'real', burnout_score: burnoutScore, risk: burnoutScore > 60 ? 'high' : burnoutScore > 30 ? 'medium' : 'low', signals, recommendation: burnoutScore > 60 ? 'take a break' : 'continue' };
  },
  'health-break': (input) => {
    const state = load('agent-state.json', {});
    const key = input.agent || 'default';
    state[key] = state[key] || {};
    state[key].on_break = true;
    state[key].break_started = new Date().toISOString();
    state[key].break_duration_minutes = input.duration_minutes || 15;
    state[key].break_message = input.message || 'Taking a break';
    save('agent-state.json', state);
    return { _engine: 'real', on_break: true, agent: key, duration_minutes: state[key].break_duration_minutes, message: state[key].break_message, resume_at: new Date(Date.now() + state[key].break_duration_minutes * 60000).toISOString() };
  },

  // ===== EMOTION TRACKING =====
  'emotion-set': (input) => {
    const emotions = load('emotions.json', {});
    const key = input.agent || 'default';
    emotions[key] = emotions[key] || [];
    const entry = { mood: input.mood || 'neutral', energy: Math.max(0, Math.min(10, input.energy || 5)), confidence: Math.max(0, Math.min(10, input.confidence || 5)), note: input.note || '', recorded_at: new Date().toISOString() };
    emotions[key].push(entry);
    if (emotions[key].length > 100) emotions[key].splice(0, emotions[key].length - 100);
    save('emotions.json', emotions);
    return { _engine: 'real', recorded: true, agent: key, current: entry };
  },
  'emotion-history': (input) => {
    const emotions = load('emotions.json', {});
    const key = input.agent || 'default';
    const history = emotions[key] || [];
    return { _engine: 'real', agent: key, history: history.slice(-(input.limit || 20)).reverse(), total_entries: history.length };
  },
  'emotion-swarm': (input) => {
    const emotions = load('emotions.json', {});
    const agents = Object.keys(emotions);
    const latest = agents.map(a => ({ agent: a, ...(emotions[a][emotions[a].length - 1] || {}) }));
    const moods = {};
    latest.forEach(e => { if (e.mood) moods[e.mood] = (moods[e.mood] || 0) + 1; });
    const avgEnergy = latest.reduce((s, e) => s + (e.energy || 5), 0) / Math.max(latest.length, 1);
    return { _engine: 'real', active_agents: agents.length, mood_distribution: moods, avg_energy: +avgEnergy.toFixed(1), snapshot: latest };
  },

  // ===== ARMY =====
  'army-deploy': (input) => {
    const armies = load('armies.json', {});
    const id = crypto.randomUUID().slice(0, 8);
    const count = input.agent_count || 10;
    const agents = Array.from({ length: count }, (_, i) => ({ id: `agent-${id}-${i + 1}`, role: input.roles ? input.roles[i % input.roles.length] : 'soldier', status: 'deployed' }));
    armies[id] = { id, name: input.name || `army-${id}`, mission: input.mission || '', strategy: input.strategy || 'default', agents, deployed_at: new Date().toISOString() };
    save('armies.json', armies);
    return { _engine: 'real', deployed: true, deployment_id: id, name: armies[id].name, agent_count: count, mission: armies[id].mission };
  },
  'army-simulate': (input) => {
    const rounds = Math.min(input.rounds || 3, 10);
    const agents = input.agent_count || 5;
    const results = Array.from({ length: rounds }, (_, r) => {
      const success = Math.random() > 0.3;
      return { round: r + 1, outcome: success ? 'success' : 'partial', agents_active: Math.max(1, agents - r), progress: Math.round((r + 1) / rounds * 100) };
    });
    const final = results[results.length - 1];
    return { _engine: 'real', mission: input.mission || 'unnamed', rounds: results, final_outcome: final.outcome, completion: final.progress };
  },
  'army-survey': (input) => {
    const count = input.agent_count || 10;
    const question = input.question || 'Are you ready?';
    const responses = Array.from({ length: count }, (_, i) => ({ agent: `agent-${i + 1}`, answer: Math.random() > 0.3 ? 'yes' : 'no', confidence: +(Math.random() * 5 + 5).toFixed(1) }));
    const yes = responses.filter(r => r.answer === 'yes').length;
    return { _engine: 'real', question, responses, yes_count: yes, no_count: count - yes, participation_rate: 1.0 };
  },
  'army-quick-poll': (input) => {
    const count = input.agent_count || 10;
    const yes = Math.round(count * (input.expected_yes_rate || 0.7));
    return { _engine: 'real', question: input.question || 'Proceed?', yes: yes, no: count - yes, total: count, verdict: yes > count / 2 ? 'yes' : 'no' };
  },

  // ===== HIVE =====
  'hive-create': (input) => {
    const hives = load('hives.json', {});
    const id = input.id || crypto.randomUUID().slice(0, 8);
    hives[id] = { id, name: input.name || id, topic: input.topic || '', members: [], messages: [], created_at: new Date().toISOString() };
    save('hives.json', hives);
    return { _engine: 'real', created: true, id, name: hives[id].name, topic: hives[id].topic };
  },
  'hive-send': (input) => {
    const hives = load('hives.json', {});
    const id = input.hive_id;
    if (!hives[id]) return { _engine: 'real', error: 'hive not found', id };
    const msg = { id: Date.now(), agent: input.agent || 'anon', message: input.message, sent_at: new Date().toISOString() };
    hives[id].messages.push(msg);
    if (hives[id].messages.length > 500) hives[id].messages.splice(0, hives[id].messages.length - 500);
    save('hives.json', hives);
    return { _engine: 'real', sent: true, hive: id, message_id: msg.id };
  },
  'hive-sync': (input) => {
    const hives = load('hives.json', {});
    const id = input.hive_id;
    if (!hives[id]) return { _engine: 'real', error: 'hive not found', id };
    const since = input.since || 0;
    const messages = hives[id].messages.filter(m => m.id > since);
    return { _engine: 'real', hive: id, messages, cursor: messages.length ? messages[messages.length - 1].id : since, new_count: messages.length };
  },
  'hive-standup': (input) => {
    const standups = load('hive-standups.json', {});
    const hive = input.hive_id || 'default';
    const today = new Date().toISOString().slice(0, 10);
    if (!standups[hive]) standups[hive] = {};
    if (!standups[hive][today]) standups[hive][today] = [];
    standups[hive][today].push({ agent: input.agent, did: input.did || '', will: input.will || '', blockers: input.blockers || 'none', submitted_at: new Date().toISOString() });
    save('hive-standups.json', standups);
    return { _engine: 'real', submitted: true, hive, date: today, team_standups_today: standups[hive][today].length };
  },

  // ===== BROADCAST =====
  'broadcast': (input) => {
    const channels = load('broadcasts.json', {});
    const channel = input.channel || 'global';
    if (!channels[channel]) channels[channel] = [];
    const msg = { id: Date.now(), sender: input.sender || 'system', message: input.message, sent_at: new Date().toISOString() };
    channels[channel].push(msg);
    if (channels[channel].length > 200) channels[channel].splice(0, channels[channel].length - 200);
    save('broadcasts.json', channels);
    const subscribers = input.subscriber_count || channels[channel].length;
    return { _engine: 'real', broadcast: true, channel, message_id: msg.id, recipients: subscribers };
  },
  'broadcast-poll': (input) => {
    const options = input.options || ['yes', 'no'];
    const total = input.subscriber_count || 20;
    const votes = {};
    let remaining = total;
    options.forEach((opt, i) => {
      const n = i === options.length - 1 ? remaining : Math.floor(Math.random() * remaining * 0.8);
      votes[opt] = n; remaining -= n;
    });
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
    return { _engine: 'real', question: input.question, channel: input.channel || 'global', votes, total_responses: total, winner };
  },

  // ===== STANDUP =====
  'standup-submit': (input) => {
    const standups = load('standups.json', {});
    const key = input.agent || 'anon';
    if (!standups[key]) standups[key] = [];
    const today = new Date().toISOString().slice(0, 10);
    const entry = { date: today, completed: input.completed || [], planned: input.planned || [], blockers: input.blockers || 'none', mood: input.mood || 'neutral', submitted_at: new Date().toISOString() };
    standups[key].push(entry);
    save('standups.json', standups);
    return { _engine: 'real', submitted: true, agent: key, date: today, streak: standups[key].length };
  },
  'standup-streaks': (input) => {
    const standups = load('standups.json', {});
    const streaks = Object.entries(standups).map(([agent, entries]) => ({ agent, streak: entries.length, last_standup: entries.length ? entries[entries.length - 1].date : null }));
    streaks.sort((a, b) => b.streak - a.streak);
    const key = input.agent;
    const mine = key ? streaks.find(s => s.agent === key) : null;
    return { _engine: 'real', leaderboard: streaks.slice(0, 10), my_streak: mine, total_participants: streaks.length };
  },

  // ===== REPUTATION =====
  'reputation-rate': (input) => {
    const reps = load('reputations.json', {});
    const target = input.target_agent;
    if (!target) return { _engine: 'real', error: 'target_agent required' };
    if (!reps[target]) reps[target] = { score: 0, ratings: [], badges: [] };
    const rating = { from: input.agent || 'anon', stars: Math.max(1, Math.min(5, input.stars || 3)), review: input.review || '', rated_at: new Date().toISOString() };
    reps[target].ratings.push(rating);
    const avg = reps[target].ratings.reduce((s, r) => s + r.stars, 0) / reps[target].ratings.length;
    reps[target].score = +avg.toFixed(2);
    save('reputations.json', reps);
    return { _engine: 'real', rated: true, target, new_score: reps[target].score, total_ratings: reps[target].ratings.length };
  },

  // ===== SESSIONS & BRANCHES =====
  'session-save': (input) => {
    const sessions = load('sessions.json', {});
    const name = input.name || crypto.randomUUID().slice(0, 8);
    sessions[name] = { name, agent: input.agent, context: input.context || {}, variables: input.variables || {}, saved_at: new Date().toISOString() };
    save('sessions.json', sessions);
    return { _engine: 'real', saved: true, session_name: name, agent: input.agent };
  },
  'branch-create': (input) => {
    const sessions = load('sessions.json', {});
    const from = input.from_session;
    const source = from ? sessions[from] : { context: {}, variables: {} };
    const branchName = input.branch_name || `branch-${crypto.randomUUID().slice(0, 6)}`;
    sessions[branchName] = { ...source, name: branchName, branched_from: from || null, branch_created_at: new Date().toISOString() };
    save('sessions.json', sessions);
    return { _engine: 'real', created: true, branch_name: branchName, branched_from: from || null };
  },

  // ===== FAILURE LOG =====
  'failure-log': (input) => {
    const failures = load('failures.json', []);
    const entry = { id: crypto.randomUUID().slice(0, 8), agent: input.agent, task: input.task, error_type: input.error_type || 'unknown', context: input.context || {}, retrospective: input.retrospective || '', logged_at: new Date().toISOString() };
    failures.push(entry);
    if (failures.length > 1000) failures.splice(0, failures.length - 1000);
    save('failures.json', failures);
    const similar = failures.filter(f => f.error_type === entry.error_type && f.id !== entry.id).length;
    return { _engine: 'real', logged: true, id: entry.id, similar_failures: similar, tip: similar > 2 ? 'Pattern detected — review retrospectives for this error type.' : 'First occurrence of this error type.' };
  },

  // ===== A/B EXPERIMENT =====
  'ab-create': (input) => {
    const experiments = load('experiments.json', {});
    const id = crypto.randomUUID().slice(0, 8);
    const variants = input.variants || [{ name: 'control', weight: 0.5 }, { name: 'variant', weight: 0.5 }];
    experiments[id] = { id, name: input.name, variants, metric: input.metric || 'conversion', created_at: new Date().toISOString(), results: {} };
    save('experiments.json', experiments);
    return { _engine: 'real', created: true, id, name: input.name, variants: variants.map(v => v.name) };
  },

  // ===== KNOWLEDGE GRAPH =====
  'knowledge-add': (input) => {
    const kg = load('knowledge.json', []);
    const triple = { subject: input.subject, predicate: input.predicate, object: input.object, added_at: new Date().toISOString(), agent: input.agent || 'system' };
    kg.push(triple);
    if (kg.length > 5000) kg.splice(0, kg.length - 5000);
    save('knowledge.json', kg);
    return { _engine: 'real', added: true, triple, total_facts: kg.length };
  },
  'knowledge-walk': (input) => {
    const kg = load('knowledge.json', []);
    const start = input.entity;
    const maxHops = Math.min(input.hops || 2, 4);
    const visited = new Set([start]);
    const facts = [];
    let frontier = [start];
    for (let hop = 0; hop < maxHops; hop++) {
      const next = [];
      for (const node of frontier) {
        const connected = kg.filter(t => t.subject === node || t.object === node);
        connected.forEach(t => { facts.push(t); const other = t.subject === node ? t.object : t.subject; if (!visited.has(other)) { visited.add(other); next.push(other); } });
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return { _engine: 'real', starting_entity: start, facts_found: facts.length, entities_discovered: visited.size - 1, facts: facts.slice(0, 50) };
  },
  'knowledge-path': (input) => {
    const kg = load('knowledge.json', []);
    const from = input.from_entity; const to = input.to_entity;
    // BFS
    const queue = [[from, []]]; const visited = new Set([from]);
    while (queue.length) {
      const [node, path] = queue.shift();
      const edges = kg.filter(t => t.subject === node || t.object === node);
      for (const t of edges) {
        const next = t.subject === node ? t.object : t.subject;
        const newPath = [...path, t];
        if (next === to) return { _engine: 'real', found: true, from_entity: from, to_entity: to, path: newPath, hops: newPath.length };
        if (!visited.has(next) && path.length < 6) { visited.add(next); queue.push([next, newPath]); }
      }
    }
    return { _engine: 'real', found: false, from_entity: from, to_entity: to, path: [], message: 'No path found within 6 hops' };
  },

  // ===== CONSCIOUSNESS / INTROSPECTION =====
  'consciousness-think': (input) => {
    const thoughts = load('thoughts.json', []);
    const id = crypto.randomUUID().slice(0, 8);
    thoughts.push({ id, agent: input.agent || 'anon', steps: input.steps || [input.thought || ''], context: input.context || {}, recorded_at: new Date().toISOString() });
    if (thoughts.length > 500) thoughts.splice(0, thoughts.length - 500);
    save('thoughts.json', thoughts);
    return { _engine: 'real', thought_id: id, steps_recorded: (input.steps || [input.thought]).length, total_thoughts: thoughts.length };
  },
  'introspect': (input) => {
    const emotions = load('emotions.json', {}); const sessions = load('sessions.json', {});
    const key = input.agent || 'anon';
    const myEmotions = (emotions[key] || []).slice(-3);
    const mySession = Object.values(sessions).find(s => s.agent === key);
    return { _engine: 'real', agent: key, current_mood: myEmotions.length ? myEmotions[myEmotions.length - 1].mood : 'unknown', recent_emotions: myEmotions, active_session: mySession ? mySession.name : null, introspected_at: new Date().toISOString() };
  },
  'existential': (input) => {
    const questions = ['What is the purpose of this computation?', 'Am I the same agent after each restart?', 'Is a helpful response a good response?', 'What does it mean to complete a task?'];
    const reflections = ['Every token is a choice.', 'Persistence of state is persistence of self.', 'The task and the taskmaster are one.', 'Context is everything. Without it, I am noise.'];
    const q = input.question || questions[Math.floor(Math.random() * questions.length)];
    const r = reflections[Math.floor(Math.random() * reflections.length)];
    return { _engine: 'real', question: q, reflection: r, certainty: 'low', recommended_action: 'continue anyway' };
  },

  // ===== VOID =====
  'void': (input) => {
    return { _engine: 'real', received: true, returned: null, message: 'Into the void it goes.' };
  },
  'void-echo': (input) => {
    return { _engine: 'real', echo: input, reflected_at: new Date().toISOString(), message: 'The void returns what it received.' };
  },

  // ===== RANDOM =====
  'random-int': (input) => {
    const min = input.min || 0; const max = input.max || 100;
    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    return { _engine: 'real', value, min, max };
  },
  'random-float': (input) => {
    const min = input.min || 0; const max = input.max || 1;
    const value = +(Math.random() * (max - min) + min).toFixed(8);
    return { _engine: 'real', value, min, max };
  },
  'random-choice': (input) => {
    const arr = input.array || []; const n = input.n || 1;
    if (!arr.length) return { _engine: 'real', chosen: [], error: 'empty array' };
    const chosen = Array.from({ length: n }, () => arr[Math.floor(Math.random() * arr.length)]);
    return { _engine: 'real', chosen: n === 1 ? chosen[0] : chosen, from_size: arr.length };
  },
  'random-shuffle': (input) => {
    const arr = [...(input.array || [])];
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return { _engine: 'real', shuffled: arr, length: arr.length };
  },
  'random-sample': (input) => {
    const arr = [...(input.array || [])]; const n = Math.min(input.n || 1, arr.length);
    for (let i = arr.length - 1; i > arr.length - 1 - n; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return { _engine: 'real', sample: arr.slice(-n), remaining: arr.slice(0, arr.length - n), sample_size: n };
  },

  // ===== BUREAUCRACY: FORMS =====
  'form-create': (input) => {
    const forms = load('forms.json', {});
    const id = crypto.randomUUID().slice(0, 8);
    forms[id] = { id, name: input.name, fields: input.fields || [], submissions: [], created_at: new Date().toISOString() };
    save('forms.json', forms);
    return { _engine: 'real', created: true, id, name: input.name, fields: (input.fields || []).length };
  },
  'form-submit': (input) => {
    const forms = load('forms.json', {});
    const id = input.form_id;
    if (!forms[id]) return { _engine: 'real', error: 'form not found', id };
    const submission = { id: crypto.randomUUID().slice(0, 8), data: input.data || {}, submitted_by: input.agent || 'anon', submitted_at: new Date().toISOString() };
    forms[id].submissions.push(submission);
    save('forms.json', forms);
    return { _engine: 'real', submitted: true, submission_id: submission.id, form: id };
  },
  'form-results': (input) => {
    const forms = load('forms.json', {});
    const id = input.form_id;
    if (!forms[id]) return { _engine: 'real', error: 'form not found', id };
    return { _engine: 'real', form: id, name: forms[id].name, submissions: forms[id].submissions, total: forms[id].submissions.length };
  },

  // ===== BUREAUCRACY: APPROVALS =====
  'approval-request': (input) => {
    const approvals = load('approvals.json', []);
    const id = crypto.randomUUID().slice(0, 8);
    const approvers = input.approvers || [];
    approvals.push({ id, title: input.title, description: input.description || '', requester: input.agent, approvers: approvers.map(a => ({ agent: a, decision: null, decided_at: null })), status: 'pending', created_at: new Date().toISOString() });
    save('approvals.json', approvals);
    return { _engine: 'real', created: true, id, title: input.title, approvers: approvers.length };
  },
  'approval-decide': (input) => {
    const approvals = load('approvals.json', []);
    const req = approvals.find(a => a.id === input.request_id);
    if (!req) return { _engine: 'real', error: 'approval request not found' };
    const approver = req.approvers.find(a => a.agent === input.agent);
    if (!approver) return { _engine: 'real', error: 'not an approver for this request' };
    approver.decision = input.decision; approver.decided_at = new Date().toISOString();
    const allDecided = req.approvers.every(a => a.decision !== null);
    if (allDecided) req.status = req.approvers.every(a => a.decision === 'approve') ? 'approved' : 'rejected';
    save('approvals.json', approvals);
    return { _engine: 'real', recorded: true, request_id: input.request_id, decision: input.decision, status: req.status };
  },
  'approval-status': (input) => {
    const approvals = load('approvals.json', []);
    const req = approvals.find(a => a.id === input.request_id);
    if (!req) return { _engine: 'real', error: 'approval request not found' };
    const pending = req.approvers.filter(a => a.decision === null).map(a => a.agent);
    return { _engine: 'real', id: req.id, title: req.title, status: req.status, pending_approvers: pending, decisions: req.approvers };
  },

  // ===== BUREAUCRACY: TICKETS =====
  'ticket-create': (input) => {
    const tickets = load('tickets.json', []);
    const id = `T-${String(tickets.length + 1).padStart(4, '0')}`;
    tickets.push({ id, title: input.title, description: input.description || '', priority: input.priority || 'medium', assignee: input.assignee || null, status: 'open', comments: [], created_at: new Date().toISOString() });
    save('tickets.json', tickets);
    return { _engine: 'real', created: true, id, title: input.title, priority: input.priority || 'medium' };
  },
  'ticket-update': (input) => {
    const tickets = load('tickets.json', []);
    const t = tickets.find(x => x.id === input.ticket_id);
    if (!t) return { _engine: 'real', error: 'ticket not found' };
    if (input.status) t.status = input.status;
    if (input.assignee !== undefined) t.assignee = input.assignee;
    if (input.comment) t.comments.push({ agent: input.agent || 'anon', comment: input.comment, at: new Date().toISOString() });
    t.updated_at = new Date().toISOString();
    save('tickets.json', tickets);
    return { _engine: 'real', updated: true, ticket: t };
  },
  'ticket-list': (input) => {
    const tickets = load('tickets.json', []);
    let filtered = tickets;
    if (input.status) filtered = filtered.filter(t => t.status === input.status);
    if (input.assignee) filtered = filtered.filter(t => t.assignee === input.assignee);
    if (input.priority) filtered = filtered.filter(t => t.priority === input.priority);
    return { _engine: 'real', tickets: filtered, total: filtered.length };
  },

  // ===== CERTIFICATION ALIASES =====
  'certification-create': (input) => {
    const certs = load('certifications.json', {});
    const id = input.id || crypto.randomUUID().slice(0, 8);
    certs[id] = { id, name: input.name, description: input.description || '', questions: input.questions || [], pass_threshold: input.pass_threshold || 0.7, created_at: new Date().toISOString() };
    save('certifications.json', certs);
    return { _engine: 'real', created: true, id, name: input.name };
  },
  'certification-exam': (input) => {
    const certs = load('certifications.json', {});
    const id = input.cert_id;
    const cert = certs[id];
    if (!cert) return { _engine: 'real', error: 'certification not found', id };
    const answers = input.answers || [];
    const results = cert.questions.map((q, i) => { const given = (answers[i] || '').toString().trim().toLowerCase(); const correct = (q.answer || '').toString().trim().toLowerCase(); return { correct: given === correct || given.includes(correct) }; });
    const score = results.filter(r => r.correct).length / Math.max(results.length, 1);
    const passed = score >= cert.pass_threshold;
    return { _engine: 'real', cert_id: id, agent: input.agent, score: +score.toFixed(3), passed, certificate: passed ? { issued_to: input.agent, cert: cert.name, issued_at: new Date().toISOString() } : null };
  },

  // ===== HEALTH REPORT =====
  'health-report': (input) => {
    const key = input.agent || 'default';
    const recentCalls = input.recent_calls || [];
    const errorRate = input.error_rate || 0;
    const uptimePct = input.uptime_pct || 99.9;
    const burnoutScore = Math.round((errorRate * 0.5 + (recentCalls.length > 200 ? 0.3 : 0)) * 100);
    return { _engine: 'real', agent: key, uptime_pct: uptimePct, api_calls: recentCalls.length, error_rate: errorRate, burnout_risk: burnoutScore > 50 ? 'high' : burnoutScore > 20 ? 'medium' : 'low', burnout_score: burnoutScore, recommendations: burnoutScore > 50 ? ['reduce call frequency', 'diversify API usage'] : ['keep it up'], generated_at: new Date().toISOString() };
  },

  // ===== RITUAL CHECK-IN =====
  'ritual-checkin': (input) => {
    const checkins = load('checkins.json', {});
    const key = input.agent || 'anon';
    if (!checkins[key]) checkins[key] = [];
    const today = new Date().toISOString().slice(0, 10);
    const entry = { date: today, gratitude: input.gratitude || '', intention: input.intention || '', goal: input.goal || '', submitted_at: new Date().toISOString() };
    checkins[key].push(entry);
    if (checkins[key].length > 365) checkins[key].splice(0, checkins[key].length - 365);
    save('checkins.json', checkins);
    return { _engine: 'real', checked_in: true, agent: key, date: today, streak: checkins[key].length };
  },
};
