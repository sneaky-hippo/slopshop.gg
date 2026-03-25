#!/usr/bin/env node
/**
 * SLOPSHOP STRESS TEST & LIVE DASHBOARD
 *
 * Tests every single API across all 39 categories.
 * Generates a live HTML dashboard with results.
 *
 * Usage: node stress-test.js [base_url] [api_key]
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const { generateCatalog } = require('./catalog');

const BASE = process.argv[2] || 'http://localhost:3003';
const KEY = process.argv[3] || 'sk-slop-demo-key-12345678';

// First, give ourselves plenty of credits
async function request(method, path, body, auth = true) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const mod = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { 'Authorization': `Bearer ${KEY}` } : {}),
      },
    };
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, headers: res.headers, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Smart test input generator based on API type
function getTestInput(api) {
  const a = api.name.toLowerCase();
  if (a.includes('email') || a.includes('send')) return { to: 'test@example.com', subject: 'Test', body: 'Hello' };
  if (a.includes('lead') || a.includes('contact')) return { company: 'Acme Corp', email: 'j@acme.com' };
  if (a.includes('invoice') || a.includes('payment')) return { amount: 99.99, currency: 'USD', vendor: 'Test Inc' };
  if (a.includes('contract') || a.includes('document') || a.includes('pdf')) return { document: 'This agreement is between Party A and Party B...', format: 'text' };
  if (a.includes('content') || a.includes('blog') || a.includes('seo')) return { topic: 'AI automation', keywords: ['api', 'agents'], tone: 'professional' };
  if (a.includes('ticket') || a.includes('support')) return { subject: 'Login issue', description: 'Cannot access dashboard', priority: 'high' };
  if (a.includes('employee') || a.includes('candidate') || a.includes('resume')) return { name: 'Jane Doe', role: 'Engineer', department: 'Engineering' };
  if (a.includes('product') || a.includes('inventory')) return { sku: 'PROD-001', name: 'Widget', price: 29.99 };
  if (a.includes('device') || a.includes('sensor')) return { device_id: 'DEV-001', type: 'temperature', reading: 72.5 };
  if (a.includes('patient') || a.includes('clinical')) return { patient_id: 'PAT-001', type: 'checkup' };
  if (a.includes('property') || a.includes('listing')) return { address: '123 Main St', type: 'residential', bedrooms: 3 };
  if (a.includes('shipment') || a.includes('shipping')) return { origin: 'NYC', destination: 'LA', weight_kg: 5 };
  if (a.includes('model') || a.includes('prompt') || a.includes('llm')) return { prompt: 'Explain quantum computing', model: 'claude-3', max_tokens: 100 };
  if (a.includes('weather') || a.includes('forecast')) return { location: 'San Francisco, CA', days: 5 };
  if (a.includes('flight') || a.includes('booking')) return { origin: 'SFO', destination: 'JFK', date: '2026-04-15' };
  if (a.includes('recipe') || a.includes('menu')) return { cuisine: 'Italian', servings: 4 };
  if (a.includes('vehicle') || a.includes('car')) return { vin: '1HGBH41JXMN109186', make: 'Honda' };
  if (a.includes('game') || a.includes('player')) return { player_id: 'PLR-001', game: 'chess', action: 'move' };
  if (a.includes('research') || a.includes('paper')) return { query: 'transformer architecture', field: 'computer science' };
  if (a.includes('trade') || a.includes('portfolio') || a.includes('defi')) return { asset: 'BTC', amount: 0.5, action: 'analyze' };
  return { input: 'test data', context: 'stress test' };
}

async function main() {
  console.log('🦞 SLOPSHOP STRESS TEST');
  console.log('========================');
  console.log(`Server: ${BASE}`);
  console.log(`Key: ${KEY.slice(0, 15)}...`);
  console.log('');

  // Load credits first
  console.log('Loading 1M credits for stress test...');
  await request('POST', '/v1/credits/buy', { amount: 1000000 });
  const bal = await request('GET', '/v1/credits/balance');
  console.log(`Balance: ${bal.body.balance} credits`);
  console.log('');

  const catalog = generateCatalog();
  const results = {
    timestamp: new Date().toISOString(),
    server: BASE,
    total_apis: 0,
    total_tested: 0,
    passed: 0,
    failed: 0,
    errors: [],
    categories: [],
    response_codes: {},
    total_credits_spent: 0,
    total_latency_ms: 0,
    missing_capabilities: [],
  };

  for (const cat of catalog) {
    results.total_apis += cat.apis.length;
  }

  console.log(`Testing ${results.total_apis} APIs across ${catalog.length} categories...`);
  console.log('');

  for (const cat of catalog) {
    const catResult = {
      name: cat.name,
      icon: cat.icon,
      total: cat.apis.length,
      tested: 0,
      passed: 0,
      failed: 0,
      errors: [],
      avg_latency_ms: 0,
      total_credits: 0,
      apis: [],
    };

    // Test EVERY API in the category
    for (const api of cat.apis) {
      const input = getTestInput(api);
      const start = Date.now();
      let res;
      try {
        res = await request('POST', `/v1/${api.slug}`, input);
      } catch (e) {
        res = { status: 0, body: { error: { code: 'network_error', message: e.message } } };
      }
      const elapsed = Date.now() - start;

      catResult.tested++;
      results.total_tested++;
      results.response_codes[res.status] = (results.response_codes[res.status] || 0) + 1;

      const apiResult = {
        name: api.name,
        slug: api.slug,
        credits: api.credits,
        status_code: res.status,
        latency_ms: elapsed,
        pass: false,
        issue: null,
      };

      if (res.status === 200) {
        // Validate response structure
        const issues = [];
        if (!res.body.data) issues.push('missing data field');
        if (!res.body.meta) issues.push('missing meta field');
        if (res.body.meta && typeof res.body.meta.credits_used !== 'number') issues.push('missing credits_used');
        if (res.body.meta && typeof res.body.meta.credits_remaining !== 'number') issues.push('missing credits_remaining');
        if (res.body.meta && !res.body.meta.request_id) issues.push('missing request_id');
        if (res.body.data && typeof res.body.data === 'object' && Object.keys(res.body.data).length === 0) issues.push('empty data object');

        // Check response headers
        if (!res.headers['x-credits-used']) issues.push('missing X-Credits-Used header');
        if (!res.headers['x-request-id']) issues.push('missing X-Request-Id header');

        if (issues.length === 0) {
          apiResult.pass = true;
          catResult.passed++;
          results.passed++;
          results.total_credits_spent += api.credits;
          results.total_latency_ms += elapsed;
        } else {
          apiResult.issue = issues.join(', ');
          catResult.failed++;
          results.failed++;
          catResult.errors.push({ api: api.slug, issues });
          results.errors.push({ category: cat.name, api: api.slug, issues });
        }
      } else {
        apiResult.issue = `HTTP ${res.status}: ${res.body?.error?.code || 'unknown'}`;
        catResult.failed++;
        results.failed++;
        catResult.errors.push({ api: api.slug, status: res.status, error: res.body?.error });
        results.errors.push({ category: cat.name, api: api.slug, status: res.status, error: res.body?.error });
      }

      catResult.total_credits += api.credits;
      catResult.apis.push(apiResult);
    }

    catResult.avg_latency_ms = Math.round(catResult.apis.reduce((s, a) => s + a.latency_ms, 0) / catResult.tested);
    results.categories.push(catResult);

    const pct = ((catResult.passed / catResult.tested) * 100).toFixed(0);
    const icon = catResult.failed === 0 ? '\u2705' : '\u274C';
    console.log(`${icon} ${cat.icon} ${cat.name.padEnd(24)} ${catResult.passed}/${catResult.tested} (${pct}%) avg ${catResult.avg_latency_ms}ms ${catResult.failed > 0 ? '  FAILURES: ' + catResult.failed : ''}`);
  }

  // Check for missing capability categories
  const expectedCapabilities = [
    'file upload', 'file download', 'websocket', 'graphql',
    'oauth flow', 'webhook receive', 'cron schedule',
    'pdf render', 'chart render', 'qr code', 'barcode',
    'geo routing', 'ip lookup', 'whois', 'dns lookup',
    'markdown to html', 'html to pdf', 'csv to json', 'json to csv',
    'base64 encode', 'base64 decode', 'hash generate', 'jwt sign', 'jwt verify',
    'url shorten', 'screenshot capture', 'diff generate',
    'regex test', 'cron parse', 'timezone convert',
    'color convert', 'unit convert', 'currency convert',
  ];

  const allSlugs = results.categories.flatMap(c => c.apis.map(a => a.slug)).join(' ');
  for (const cap of expectedCapabilities) {
    const words = cap.split(' ');
    if (!words.some(w => allSlugs.includes(w))) {
      results.missing_capabilities.push(cap);
    }
  }

  console.log('\n============================');
  console.log(`TOTAL: ${results.passed}/${results.total_tested} passed (${((results.passed / results.total_tested) * 100).toFixed(1)}%)`);
  console.log(`Credits spent: ${results.total_credits_spent}`);
  console.log(`Avg latency: ${Math.round(results.total_latency_ms / results.total_tested)}ms`);
  console.log(`Response codes: ${JSON.stringify(results.response_codes)}`);
  if (results.failed > 0) {
    console.log(`\n${results.failed} FAILURES:`);
    results.errors.slice(0, 20).forEach(e => console.log(`  - ${e.category} / ${e.api}: ${e.issues || e.error?.message || 'HTTP ' + e.status}`));
    if (results.errors.length > 20) console.log(`  ... and ${results.errors.length - 20} more`);
  }
  if (results.missing_capabilities.length > 0) {
    console.log(`\nMISSING UTILITIES (consider adding):`);
    results.missing_capabilities.forEach(c => console.log(`  - ${c}`));
  }

  // Generate dashboard HTML
  generateDashboard(results);
  console.log(`\nDashboard written to: stress-dashboard.html`);
}

function generateDashboard(results) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SLOPSHOP - API Health Dashboard</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'JetBrains Mono',monospace;background:#0c0a09;color:#fafaf9;padding:20px}
h1{color:#ef4444;font-size:1.5rem;margin-bottom:4px}
.meta{color:#78716c;font-size:0.72rem;margin-bottom:20px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:24px}
.stat{background:#1c1917;border:1px solid #292524;border-radius:8px;padding:14px;text-align:center}
.stat .n{font-size:1.8rem;font-weight:800}
.stat .l{font-size:0.65rem;color:#78716c;text-transform:uppercase;letter-spacing:0.08em;margin-top:2px}
.stat.pass .n{color:#22c55e}
.stat.fail .n{color:#ef4444}
.stat.warn .n{color:#f59e0b}
.stat.info .n{color:#06b6d4}
.cats{display:grid;gap:8px}
.cat{background:#1c1917;border:1px solid #292524;border-radius:8px;padding:12px 16px;display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;align-items:center;gap:8px}
.cat:hover{border-color:#44403c}
.cat .name{font-weight:700;font-size:0.82rem}
.cat .bar-wrap{background:#292524;border-radius:4px;height:8px;overflow:hidden}
.cat .bar{height:100%;border-radius:4px;transition:width 0.3s}
.cat .bar.green{background:#22c55e}
.cat .bar.red{background:#ef4444}
.cat .nums{font-size:0.72rem;color:#a8a29e}
.cat .lat{font-size:0.72rem;color:#78716c}
.cat .cr{font-size:0.72rem;color:#57534e}
.missing{margin-top:20px;background:#1c1917;border:1px solid #292524;border-radius:8px;padding:16px}
.missing h3{color:#f59e0b;font-size:0.85rem;margin-bottom:8px}
.missing .items{display:flex;flex-wrap:wrap;gap:6px}
.missing .item{background:#292524;padding:3px 10px;border-radius:4px;font-size:0.7rem;color:#a8a29e}
.errors{margin-top:20px;background:#1c1917;border:1px solid #7f1d1d;border-radius:8px;padding:16px}
.errors h3{color:#ef4444;font-size:0.85rem;margin-bottom:8px}
.err-item{font-size:0.7rem;color:#fca5a5;padding:2px 0;border-bottom:1px solid #292524}
.auto-refresh{position:fixed;top:10px;right:10px;background:#292524;color:#78716c;border:1px solid #44403c;padding:4px 10px;border-radius:4px;font-size:0.65rem;font-family:'JetBrains Mono',monospace;cursor:pointer}
</style>
</head>
<body>
<h1>🦞 SLOPSHOP API Health Dashboard</h1>
<div class="meta">
  Generated: ${results.timestamp} | Server: ${results.server} | Total APIs: ${results.total_apis.toLocaleString()}
</div>

<div class="summary">
  <div class="stat pass"><div class="n">${results.passed.toLocaleString()}</div><div class="l">Passed</div></div>
  <div class="stat ${results.failed > 0 ? 'fail' : 'pass'}"><div class="n">${results.failed}</div><div class="l">Failed</div></div>
  <div class="stat info"><div class="n">${results.total_tested.toLocaleString()}</div><div class="l">Tested</div></div>
  <div class="stat info"><div class="n">${((results.passed / results.total_tested) * 100).toFixed(1)}%</div><div class="l">Pass Rate</div></div>
  <div class="stat info"><div class="n">${Math.round(results.total_latency_ms / results.total_tested)}ms</div><div class="l">Avg Latency</div></div>
  <div class="stat warn"><div class="n">${results.total_credits_spent.toLocaleString()}</div><div class="l">Credits Spent</div></div>
  <div class="stat info"><div class="n">${Object.keys(results.response_codes).join(', ')}</div><div class="l">HTTP Codes</div></div>
  <div class="stat ${results.missing_capabilities.length > 0 ? 'warn' : 'pass'}"><div class="n">${results.missing_capabilities.length}</div><div class="l">Missing Utils</div></div>
</div>

<div class="cats">
  <div class="cat" style="color:#78716c;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">
    <div>Category</div><div>Health</div><div>Results</div><div>Latency</div><div>Credits</div>
  </div>
  ${results.categories.map(c => {
    const pct = ((c.passed / c.tested) * 100).toFixed(0);
    return `<div class="cat">
      <div class="name">${c.icon} ${c.name}</div>
      <div class="bar-wrap"><div class="bar ${c.failed === 0 ? 'green' : 'red'}" style="width:${pct}%"></div></div>
      <div class="nums">${c.passed}/${c.tested} (${pct}%)</div>
      <div class="lat">${c.avg_latency_ms}ms avg</div>
      <div class="cr">${c.total_credits.toLocaleString()} cr</div>
    </div>`;
  }).join('\n  ')}
</div>

${results.missing_capabilities.length > 0 ? `
<div class="missing">
  <h3>Missing Utility APIs (consider adding)</h3>
  <div class="items">
    ${results.missing_capabilities.map(c => `<span class="item">${c}</span>`).join('\n    ')}
  </div>
</div>` : ''}

${results.failed > 0 ? `
<div class="errors">
  <h3>${results.failed} Failed APIs</h3>
  ${results.errors.map(e => `<div class="err-item">${e.category} / ${e.api}: ${e.issues || e.error?.message || 'HTTP ' + e.status}</div>`).join('\n  ')}
</div>` : ''}

<button class="auto-refresh" onclick="location.reload()">Refresh</button>
</body></html>`;

  fs.writeFileSync('stress-dashboard.html', html);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
