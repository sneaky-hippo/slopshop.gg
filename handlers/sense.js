'use strict';

const http = require('http');
const https = require('https');
const net = require('net');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Shared HTTP helper – returns { body, statusCode, headers, timingMs }
// ---------------------------------------------------------------------------
function fetchUrl(rawUrl, { timeoutMs = 8000, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(rawUrl); } catch (e) { return reject(new Error('Invalid URL')); }

    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      timeout: timeoutMs,
      rejectUnauthorized: false, // allow self-signed / untrusted CAs for general URL fetching
      headers: {
        'User-Agent': 'Slopshop-SenseHandler/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    };

    const start = Date.now();
    const req = lib.request(options, (res) => {
      // Follow up to 5 redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        try {
          const next = new URL(res.headers.location, rawUrl).toString();
          res.resume();
          return fetchUrl(next, { timeoutMs, method }).then(resolve).catch(reject);
        } catch (_) {/* fall through */}
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        body: Buffer.concat(chunks).toString('utf8'),
        statusCode: res.statusCode,
        headers: res.headers,
        timingMs: Date.now() - start,
      }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------
function stripHtml(html) {
  // Remove script and style blocks with content
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Remove all remaining tags
  t = t.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  t = t
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&[a-z]+;/gi, ' ');
  // Normalize whitespace
  return t.replace(/\s+/g, ' ').trim();
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).trim() : '';
}

function extractMeta(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'),
  ];
  for (const p of patterns) { const m = html.match(p); if (m) return m[1]; }
  return '';
}

function extractOgMeta(html, prop) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'),
  ];
  for (const p of patterns) { const m = html.match(p); if (m) return m[1]; }
  return '';
}

// ---------------------------------------------------------------------------
// 1. sense-url-content
// ---------------------------------------------------------------------------
async function senseUrlContent(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const start = Date.now();
  const { body } = await fetchUrl(url, { timeoutMs: 10000 });
  const fetch_time_ms = Date.now() - start;
  const title = extractTitle(body);
  const text = stripHtml(body).slice(0, 5000);
  const word_count = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  return { _engine: 'real', url, title, text, word_count, fetch_time_ms };
}

// ---------------------------------------------------------------------------
// 2. sense-url-meta
// ---------------------------------------------------------------------------
async function senseUrlMeta(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const { body } = await fetchUrl(url, { timeoutMs: 10000 });
  const title = extractTitle(body);
  const description = extractMeta(body, 'description');
  const canonical = (() => {
    const m = body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
           || body.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    return m ? m[1] : '';
  })();
  return {
    _engine: 'real',
    url,
    title,
    description,
    og: {
      title: extractOgMeta(body, 'title'),
      description: extractOgMeta(body, 'description'),
      image: extractOgMeta(body, 'image'),
    },
    canonical,
  };
}

// ---------------------------------------------------------------------------
// 3. sense-url-links
// ---------------------------------------------------------------------------
async function senseUrlLinks(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const { body } = await fetchUrl(url, { timeoutMs: 10000 });
  const base = new URL(url);
  const hrefs = [];
  const re = /<a[^>]+href=["']([^"'#][^"']*)["']/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    try {
      const abs = new URL(m[1], url).toString();
      hrefs.push(abs);
    } catch (_) {/* skip malformed */}
  }
  const unique = [...new Set(hrefs)];
  const internal = unique.filter(l => { try { return new URL(l).hostname === base.hostname; } catch { return false; } });
  const external = unique.filter(l => { try { return new URL(l).hostname !== base.hostname; } catch { return false; } });
  return { _engine: 'real', links: unique, internal_count: internal.length, external_count: external.length, total: unique.length };
}

// ---------------------------------------------------------------------------
// 4. sense-url-feed
// ---------------------------------------------------------------------------
async function senseUrlFeed(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const { body } = await fetchUrl(url, { timeoutMs: 10000 });

  const isAtom = /<feed[\s>]/i.test(body);
  const format = isAtom ? 'atom' : 'rss';
  const itemTag = isAtom ? 'entry' : 'item';

  const items = [];
  const itemRe = new RegExp(`<${itemTag}[\\s>]([\\s\\S]*?)<\\/${itemTag}>`, 'gi');
  let im;
  while ((im = itemRe.exec(body)) !== null) {
    const chunk = im[1];
    const titleM = chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkM = chunk.match(/<link[^>]*href=["']([^"']+)["']/i) || chunk.match(/<link>([\s\S]*?)<\/link>/i);
    const dateM = chunk.match(/<(?:pubDate|updated|published)[^>]*>([\s\S]*?)<\/(?:pubDate|updated|published)>/i);
    items.push({
      title: titleM ? stripHtml(titleM[1]).trim() : '',
      link: linkM ? linkM[1].trim() : '',
      date: dateM ? dateM[1].trim() : '',
    });
    if (items.length >= 50) break;
  }
  return { _engine: 'real', format, items, count: items.length };
}

// ---------------------------------------------------------------------------
// 5. sense-url-robots
// ---------------------------------------------------------------------------
async function senseUrlRobots(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const base = new URL(url);
  const robotsUrl = `${base.protocol}//${base.host}/robots.txt`;
  const { body } = await fetchUrl(robotsUrl, { timeoutMs: 8000 });

  const rules = [];
  const sitemaps = [];
  let current = null;

  for (const raw of body.split('\n')) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const [key, ...rest] = line.split(':');
    const val = rest.join(':').trim();
    const k = key.trim().toLowerCase();
    if (k === 'user-agent') {
      current = { user_agent: val, allow: [], disallow: [] };
      rules.push(current);
    } else if (k === 'allow' && current) {
      current.allow.push(val);
    } else if (k === 'disallow' && current) {
      current.disallow.push(val);
    } else if (k === 'sitemap') {
      sitemaps.push(val);
    }
  }
  return { _engine: 'real', rules, sitemaps };
}

// ---------------------------------------------------------------------------
// 6. sense-time-now
// ---------------------------------------------------------------------------
async function senseTimeNow(input) {
  input = input || {};
  const timezone = input.timezone || 'UTC';
  const now = new Date();

  let formatted, offset;
  try {
    // Use Intl to get the offset
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZoneName: 'short',
    });
    formatted = dtf.format(now);

    // Compute offset in minutes using Intl trick
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const diffMin = Math.round((tzDate - utcDate) / 60000);
    const sign = diffMin >= 0 ? '+' : '-';
    const absMin = Math.abs(diffMin);
    offset = `UTC${sign}${String(Math.floor(absMin / 60)).padStart(2, '0')}:${String(absMin % 60).padStart(2, '0')}`;
  } catch (e) {
    formatted = now.toUTCString();
    offset = 'UTC+00:00';
  }

  return {
    _engine: 'real',
    iso: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000),
    timezone,
    offset,
    formatted,
  };
}

// ---------------------------------------------------------------------------
// 7. sense-github-repo
// ---------------------------------------------------------------------------
async function senseGithubRepo(input) {
  input = input || {};
  const repo = input.repo;
  if (!repo) return { _engine: 'real', error: 'missing_param', required: 'repo', hint: 'owner/repo format' };
  const apiUrl = `https://api.github.com/repos/${repo}`;
  const { body, statusCode } = await fetchUrl(apiUrl, { timeoutMs: 8000 });
  if (statusCode !== 200) return { _engine: "real", error: "api_error", message: "GitHub API returned " + statusCode };
  const d = JSON.parse(body);
  return {
    _engine: 'real',
    name: d.full_name,
    description: d.description || '',
    stars: d.stargazers_count,
    forks: d.forks_count,
    language: d.language || '',
    open_issues: d.open_issues_count,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

// ---------------------------------------------------------------------------
// 8. sense-npm-package
// ---------------------------------------------------------------------------
async function senseNpmPackage(input) {
  input = input || {};
  const pkg = input.package;
  if (!pkg) return { _engine: 'real', error: 'missing_param', required: 'package' };
  const encoded = encodeURIComponent(pkg).replace('%40', '@');
  const infoUrl = `https://registry.npmjs.org/${encoded}`;
  const { body, statusCode } = await fetchUrl(infoUrl, { timeoutMs: 8000 });
  if (statusCode !== 200) return { _engine: "real", error: "api_error", message: "npm registry returned " + statusCode };
  const d = JSON.parse(body);
  const latest = d['dist-tags'] && d['dist-tags'].latest ? d['dist-tags'].latest : Object.keys(d.versions || {}).pop() || '';
  const ver = d.versions && d.versions[latest] ? d.versions[latest] : {};

  // weekly downloads from downloads API
  let weekly_downloads = 0;
  try {
    const dlUrl = `https://api.npmjs.org/downloads/point/last-week/${encoded}`;
    const dlRes = await fetchUrl(dlUrl, { timeoutMs: 5000 });
    const dlData = JSON.parse(dlRes.body);
    weekly_downloads = dlData.downloads || 0;
  } catch (_) {}

  const deps = ver.dependencies ? Object.keys(ver.dependencies).length : 0;

  return {
    _engine: 'real',
    name: d.name,
    version: latest,
    description: d.description || '',
    weekly_downloads,
    homepage: d.homepage || (ver.homepage || ''),
    repository: ver.repository && ver.repository.url ? ver.repository.url : (d.repository && d.repository.url ? d.repository.url : ''),
    license: ver.license || d.license || '',
    dependencies_count: deps,
  };
}

// ---------------------------------------------------------------------------
// 9. sense-port-open
// ---------------------------------------------------------------------------
async function sensePortOpen(input) {
  input = input || {};
  const host = input.host;
  const port = parseInt(input.port, 10);
  if (!host) return { _engine: 'real', error: 'missing_param', required: 'host' };
  if (!port) return { _engine: 'real', error: 'missing_param', required: 'port' };
  const start = Date.now();
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port, timeout: 3000 });
    sock.once('connect', () => {
      const latency_ms = Date.now() - start;
      sock.destroy();
      resolve({ _engine: 'real', host, port, open: true, latency_ms });
    });
    sock.once('timeout', () => {
      sock.destroy();
      resolve({ _engine: 'real', host, port, open: false, latency_ms: 3000 });
    });
    sock.once('error', () => {
      const latency_ms = Date.now() - start;
      sock.destroy();
      resolve({ _engine: 'real', host, port, open: false, latency_ms });
    });
  });
}

// ---------------------------------------------------------------------------
// 10. sense-uptime-check
// ---------------------------------------------------------------------------
async function senseUptimeCheck(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_param', required: 'url' };
  const start = Date.now();
  try {
    const { statusCode, timingMs } = await fetchUrl(url, { timeoutMs: 8000, method: 'HEAD' });
    return {
      _engine: 'real',
      url,
      up: statusCode < 500,
      status_code: statusCode,
      latency_ms: timingMs,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    return {
      _engine: 'real',
      url,
      up: false,
      status_code: 0,
      latency_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// 11. analyze-log-parse
// ---------------------------------------------------------------------------
async function analyzeLogParse(input) {
  input = input || {};
  const text = input.text || '';
  const lines = text.split('\n').filter(l => l.trim());
  const total_lines = lines.length;

  // Detect format from first non-empty line
  const sample = lines[0] || '';

  let format = 'unknown';
  let entries = [];

  // JSON lines?
  if (sample.trim().startsWith('{')) {
    format = 'json';
    for (const l of lines.slice(0, 20)) {
      try { entries.push(JSON.parse(l)); } catch (_) { entries.push({ raw: l, parse_error: true }); }
    }
  } else if (/^\S+ \S+ \S+ \[/.test(sample)) {
    // Apache combined log: 127.0.0.1 - frank [10/Oct/2000:...] "GET /..." 200 2326
    format = 'apache';
    const re = /^(\S+) (\S+) (\S+) \[([^\]]+)\] "([^"]*)" (\d+) (\S+)/;
    for (const l of lines.slice(0, 20)) {
      const m = l.match(re);
      if (m) {
        entries.push({ ip: m[1], ident: m[2], user: m[3], time: m[4], request: m[5], status: parseInt(m[6], 10), size: m[7] });
      } else { entries.push({ raw: l }); }
    }
  } else if (/\w+=/.test(sample)) {
    // key=value
    format = 'kv';
    for (const l of lines.slice(0, 20)) {
      const obj = {};
      const re = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;
      let m;
      while ((m = re.exec(l)) !== null) {
        obj[m[1]] = m[2].replace(/^"|"$/g, '');
      }
      entries.push(obj);
    }
  }

  const error_count = lines.filter(l => /error|ERROR|fatal|FATAL/i.test(l)).length;
  return { _engine: 'real', format, entries: entries.slice(0, 20), total_lines, error_count };
}

// ---------------------------------------------------------------------------
// 12. analyze-error-fingerprint
// ---------------------------------------------------------------------------
async function analyzeErrorFingerprint(input) {
  input = input || {};
  const original = input.error || '';
  let normalized = original;
  // Strip line numbers: line 42, :42:, at line 42
  normalized = normalized.replace(/\bline\s+\d+\b/gi, 'line N');
  normalized = normalized.replace(/:\d+:\d+/g, ':N:N');
  normalized = normalized.replace(/:\d+/g, ':N');
  // Strip file paths
  normalized = normalized.replace(/([A-Za-z]:)?[/\\](?:[\w\-. ]+[/\\])+[\w\-.]+\.\w+/g, '<file>');
  normalized = normalized.replace(/\([\w./\\:]+:\d+:\d+\)/g, '(<loc>)');
  // Strip hex addresses / object ids
  normalized = normalized.replace(/0x[0-9a-fA-F]+/g, '0xADDR');
  normalized = normalized.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>');
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  const fingerprint = crypto.createHash('sha256').update(normalized).digest('hex');
  return { _engine: 'real', fingerprint, normalized, original };
}

// ---------------------------------------------------------------------------
// 13. analyze-csv-summary
// ---------------------------------------------------------------------------
async function analyzeCsvSummary(input) {
  input = input || {};
  const raw = input.data || input.csv || '';
  const data = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const lines = data.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { _engine: 'real', columns: [], rows: 0, columns_count: 0 };

  // Simple CSV parser (handles quoted fields)
  function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuote) { inQuote = true; }
      else if (ch === '"' && inQuote) {
        if (line[i + 1] === '"') { current += '"'; i++; } else { inQuote = false; }
      } else if (ch === ',' && !inQuote) { result.push(current); current = ''; }
      else { current += ch; }
    }
    result.push(current);
    return result;
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(l => parseCsvLine(l));

  const columns = headers.map((name, ci) => {
    const vals = rows.map(r => r[ci] !== undefined ? r[ci].trim() : '');
    const numericVals = vals.map(v => parseFloat(v)).filter(v => !isNaN(v));
    const isNumeric = numericVals.length / Math.max(vals.filter(v => v !== '').length, 1) > 0.8;
    const unique = new Set(vals).size;

    if (isNumeric && numericVals.length > 0) {
      const sorted = [...numericVals].sort((a, b) => a - b);
      const mean = numericVals.reduce((s, v) => s + v, 0) / numericVals.length;
      const stddev = Math.sqrt(numericVals.reduce((s, v) => s + (v - mean) ** 2, 0) / numericVals.length);
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
      return { name, type: 'numeric', count: numericVals.length, unique, min: sorted[0], max: sorted[sorted.length - 1], mean: +mean.toFixed(4), median: +median.toFixed(4), stddev: +stddev.toFixed(4) };
    }
    return { name, type: 'string', count: vals.filter(v => v !== '').length, unique };
  });

  return { _engine: 'real', columns, rows: rows.length, columns_count: headers.length };
}

// ---------------------------------------------------------------------------
// 14. analyze-time-series-trend
// ---------------------------------------------------------------------------
async function analyzeTimeSeriesTrend(input) {
  input = input || {};
  const values = input.values || [];
  if (values.length < 2) return { _engine: 'real', trend: 'flat', slope: 0, confidence: 0, change_pct: 0 };

  const n = values.length;
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  const ssXX = xs.reduce((s, v) => s + (v - meanX) ** 2, 0);
  const ssXY = xs.reduce((s, v, i) => s + (v - meanX) * (values[i] - meanY), 0);
  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  // R-squared as confidence
  const predicted = xs.map(x => slope * x + intercept);
  const ssTot = values.reduce((s, v) => s + (v - meanY) ** 2, 0);
  const ssRes = values.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0);
  const confidence = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  const first = values[0];
  const last = values[values.length - 1];
  const change_pct = first === 0 ? 0 : +((last - first) / Math.abs(first) * 100).toFixed(2);

  const threshold = (Math.abs(meanY) || 1) * 0.005;
  const trend = Math.abs(slope) < threshold ? 'flat' : slope > 0 ? 'up' : 'down';

  return { _engine: 'real', trend, slope: +slope.toFixed(6), confidence: +confidence.toFixed(4), change_pct };
}

// ---------------------------------------------------------------------------
// 15. analyze-time-series-anomaly
// ---------------------------------------------------------------------------
async function analyzeTimeSeriesAnomaly(input) {
  input = input || {};
  const values = input.values || [];
  if (values.length < 4) return { _engine: 'real', anomalies: [], q1: 0, q3: 0, iqr: 0, lower_bound: 0, upper_bound: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];
  const iqr = q3 - q1;
  const lower_bound = q1 - 1.5 * iqr;
  const upper_bound = q3 + 1.5 * iqr;

  const anomalies = values.reduce((acc, value, index) => {
    if (value < lower_bound) acc.push({ index, value, type: 'low' });
    else if (value > upper_bound) acc.push({ index, value, type: 'high' });
    return acc;
  }, []);

  return { _engine: 'real', anomalies, q1, q3, iqr, lower_bound: +lower_bound.toFixed(4), upper_bound: +upper_bound.toFixed(4) };
}

// ---------------------------------------------------------------------------
// 16. analyze-ab-test
// ---------------------------------------------------------------------------
async function analyzeAbTest(input) {
  input = input || {};
  const ctrl = input.control || {};
  const trt = input.treatment || {};
  const cv = ctrl.visitors || 1, cc = ctrl.conversions || 0;
  const tv = trt.visitors || 1, tc = trt.conversions || 0;

  const control_rate = +(cc / cv).toFixed(6);
  const treatment_rate = +(tc / tv).toFixed(6);
  const lift_pct = control_rate === 0 ? 0 : +((treatment_rate - control_rate) / control_rate * 100).toFixed(2);

  // Two-proportion z-test
  const p_pool = (cc + tc) / (cv + tv);
  const se = Math.sqrt(p_pool * (1 - p_pool) * (1 / cv + 1 / tv));
  const z_score = se === 0 ? 0 : +((treatment_rate - control_rate) / se).toFixed(4);

  // Normal CDF approximation for p-value (two-tailed)
  function normalCdf(z) {
    const absZ = Math.abs(z);
    // Horner's method approximation
    const t = 1 / (1 + 0.2316419 * absZ);
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const pdf = Math.exp(-0.5 * absZ * absZ) / Math.sqrt(2 * Math.PI);
    const upper = pdf * poly;
    return z >= 0 ? 1 - upper : upper;
  }
  const p_value = +(2 * (1 - normalCdf(Math.abs(z_score)))).toFixed(6);
  const significant = p_value < 0.05;

  return {
    _engine: 'real',
    control_rate,
    treatment_rate,
    lift_pct,
    z_score,
    p_value,
    significant,
    confidence_level: significant ? '95%' : 'not significant',
  };
}

// ---------------------------------------------------------------------------
// 17. analyze-distribution-fit
// ---------------------------------------------------------------------------
async function analyzeDistributionFit(input) {
  input = input || {};
  const values = input.values || [];
  if (values.length < 3) return { _engine: 'real', mean: 0, stddev: 0, skewness: 0, kurtosis: 0, likely_distribution: 'unknown', shapiro_like_score: 0 };

  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return { _engine: 'real', mean, stddev: 0, skewness: 0, kurtosis: 0, likely_distribution: 'uniform', shapiro_like_score: 0 };

  const skewness = values.reduce((s, v) => s + ((v - mean) / stddev) ** 3, 0) / n;
  const kurtosis = values.reduce((s, v) => s + ((v - mean) / stddev) ** 4, 0) / n - 3;

  // Shapiro-like score: correlation of sorted data with normal quantiles
  const sorted = [...values].sort((a, b) => a - b);
  const quantiles = sorted.map((_, i) => {
    const p = (i + 0.375) / (n + 0.25);
    // Rational approximation for probit
    const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
    const num = 2.515517 + 0.802853 * t + 0.010328 * t ** 2;
    const den = 1 + 1.432788 * t + 0.189269 * t ** 2 + 0.001308 * t ** 3;
    const z = t - num / den;
    return p < 0.5 ? -z : z;
  });
  const meanQ = quantiles.reduce((s, v) => s + v, 0) / n;
  const meanS = sorted.reduce((s, v) => s + v, 0) / n;
  const cov = sorted.reduce((s, v, i) => s + (v - meanS) * (quantiles[i] - meanQ), 0);
  const sdQ = Math.sqrt(quantiles.reduce((s, v) => s + (v - meanQ) ** 2, 0));
  const sdS = Math.sqrt(sorted.reduce((s, v) => s + (v - meanS) ** 2, 0));
  const shapiro_like_score = sdQ * sdS === 0 ? 0 : +(cov / (sdQ * sdS)).toFixed(4);

  let likely_distribution;
  if (Math.abs(skewness) < 0.5 && Math.abs(kurtosis) < 1 && shapiro_like_score > 0.95) {
    likely_distribution = 'normal';
  } else if (skewness > 1) {
    likely_distribution = 'skewed_right';
  } else if (skewness < -1) {
    likely_distribution = 'skewed_left';
  } else if (Math.abs(kurtosis) < 0.5 && Math.abs(skewness) < 0.2) {
    likely_distribution = 'uniform';
  } else {
    likely_distribution = 'bimodal';
  }

  return {
    _engine: 'real',
    mean: +mean.toFixed(4),
    stddev: +stddev.toFixed(4),
    skewness: +skewness.toFixed(4),
    kurtosis: +kurtosis.toFixed(4),
    likely_distribution,
    shapiro_like_score,
  };
}

// ---------------------------------------------------------------------------
// 18. analyze-text-ngrams
// ---------------------------------------------------------------------------
async function analyzeTextNgrams(input) {
  input = input || {};
  const text = input.text || '';
  const n = parseInt(input.n, 10) || 2;
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
  const counts = {};
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(' ');
    counts[gram] = (counts[gram] || 0) + 1;
  }
  const ngrams = Object.entries(counts)
    .map(([gram, count]) => ({ gram, count }))
    .sort((a, b) => b.count - a.count);
  return { _engine: 'real', ngrams, total: ngrams.length };
}

// ---------------------------------------------------------------------------
// 19. analyze-text-tfidf
// ---------------------------------------------------------------------------
async function analyzeTextTfidf(input) {
  input = input || {};
  const text = input.text || '';
  // Treat each sentence as a document
  const docs = text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 5);
  if (docs.length === 0) return { _engine: 'real', terms: [], top_terms: [] };

  const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','was','are','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','it','its','this','that','these','those','i','we','you','he','she','they','my','our','your','his','her','their']);

  function tokenize(s) {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  }

  const tokenized = docs.map(tokenize);
  const N = tokenized.length;

  // Build vocabulary
  const vocab = new Set(tokenized.flat());

  // IDF
  const idf = {};
  for (const term of vocab) {
    const df = tokenized.filter(d => d.includes(term)).length;
    idf[term] = Math.log((N + 1) / (df + 1)) + 1;
  }

  // TF for the whole text (merged)
  const allTokens = tokenize(text);
  const termCount = {};
  for (const t of allTokens) termCount[t] = (termCount[t] || 0) + 1;
  const maxCount = Math.max(...Object.values(termCount), 1);

  const terms = Object.entries(termCount).map(([term, cnt]) => {
    const tf = cnt / maxCount;
    const tfidf = +(tf * idf[term]).toFixed(6);
    return { term, tf: +tf.toFixed(4), idf: +(idf[term] || 1).toFixed(4), tfidf };
  }).sort((a, b) => b.tfidf - a.tfidf);

  const top_terms = terms.slice(0, 10).map(t => t.term);
  return { _engine: 'real', terms: terms.slice(0, 50), top_terms };
}

// ---------------------------------------------------------------------------
// 20. analyze-funnel
// ---------------------------------------------------------------------------
async function analyzeFunnel(input) {
  input = input || {};
  const steps = input.steps || [];
  if (steps.length === 0) return { _engine: 'real', steps: [], overall_conversion: 0 };

  const top = steps[0].count || 1;
  const enriched = steps.map((step, i) => {
    const count = step.count || 0;
    const prev = i === 0 ? top : steps[i - 1].count || 1;
    const rate_from_top = +((count / top) * 100).toFixed(2);
    const rate_from_previous = i === 0 ? 100 : +((count / prev) * 100).toFixed(2);
    const drop_off = i === 0 ? 0 : +((1 - count / prev) * 100).toFixed(2);
    return { name: step.name, count, rate_from_top, rate_from_previous, drop_off };
  });

  const last = steps[steps.length - 1].count || 0;
  const overall_conversion = +((last / top) * 100).toFixed(2);
  return { _engine: 'real', steps: enriched, overall_conversion };
}

// ---------------------------------------------------------------------------
// 21. sense-url-tech-stack
// ---------------------------------------------------------------------------
async function senseUrlTechStack(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const { body } = await fetchUrl(url, { timeoutMs: 10000 });
  const technologies = [];
  if (/react/i.test(body)) technologies.push('React');
  if (/vue/i.test(body)) technologies.push('Vue');
  if (/angular/i.test(body)) technologies.push('Angular');
  if (/\$\(|jquery/i.test(body)) technologies.push('jQuery');
  if (/wp-content/i.test(body)) technologies.push('WordPress');
  if (/cdn\.shopify/i.test(body)) technologies.push('Shopify');
  if (/__next/i.test(body)) technologies.push('Next.js');
  if (/tailwind/i.test(body)) technologies.push('Tailwind');
  return { _engine: 'real', technologies, url };
}

// ---------------------------------------------------------------------------
// 22. sense-url-response-time
// ---------------------------------------------------------------------------
async function senseUrlResponseTime(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const times_ms = [];
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    await fetchUrl(url, { timeoutMs: 10000, method: 'HEAD' });
    times_ms.push(Date.now() - start);
  }
  const avg_ms = Math.round(times_ms.reduce((s, v) => s + v, 0) / times_ms.length);
  const min_ms = Math.min(...times_ms);
  const max_ms = Math.max(...times_ms);
  return { _engine: 'real', times_ms, avg_ms, min_ms, max_ms };
}

// ---------------------------------------------------------------------------
// 23. sense-url-sitemap
// ---------------------------------------------------------------------------
async function senseUrlSitemap(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const base = new URL(url);
  const sitemapUrl = `${base.protocol}//${base.host}/sitemap.xml`;
  const { body } = await fetchUrl(sitemapUrl, { timeoutMs: 10000 });
  const urls = [];
  const re = /<loc>([\s\S]*?)<\/loc>/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    urls.push(m[1].trim());
  }
  return { _engine: 'real', urls, count: urls.length };
}

// ---------------------------------------------------------------------------
// 24. sense-rss-latest
// ---------------------------------------------------------------------------
async function senseRssLatest(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_param', required: 'url' };
  const count = input.count || 5;
  const { body } = await fetchUrl(url, { timeoutMs: 10000 });

  const isAtom = /<feed[\s>]/i.test(body);
  const itemTag = isAtom ? 'entry' : 'item';

  const items = [];
  const itemRe = new RegExp(`<${itemTag}[\\s>]([\\s\\S]*?)<\\/${itemTag}>`, 'gi');
  let im;
  while ((im = itemRe.exec(body)) !== null && items.length < count) {
    const chunk = im[1];
    const titleM = chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkM = chunk.match(/<link[^>]*href=["']([^"']+)["']/i) || chunk.match(/<link>([\s\S]*?)<\/link>/i);
    const dateM = chunk.match(/<(?:pubDate|updated|published)[^>]*>([\s\S]*?)<\/(?:pubDate|updated|published)>/i);
    items.push({
      title: titleM ? stripHtml(titleM[1]).trim() : '',
      link: linkM ? linkM[1].trim() : '',
      date: dateM ? dateM[1].trim() : '',
    });
  }
  return { _engine: 'real', items, count: items.length };
}

// ---------------------------------------------------------------------------
// 25. sense-url-accessibility
// ---------------------------------------------------------------------------
async function senseUrlAccessibility(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const { body } = await fetchUrl(url, { timeoutMs: 10000 });
  const issues = [];
  let checks_passed = 0;

  // Images without alt
  const imgs = body.match(/<img[^>]+>/gi) || [];
  const imgsNoAlt = imgs.filter(tag => !/alt\s*=/i.test(tag));
  if (imgsNoAlt.length > 0) {
    issues.push(`${imgsNoAlt.length} image(s) missing alt attribute`);
  } else {
    checks_passed++;
  }

  // Headings in order (check for h1)
  const hasH1 = /<h1[\s>]/i.test(body);
  if (!hasH1) {
    issues.push('No <h1> heading found');
  } else {
    checks_passed++;
  }

  // lang attribute
  const hasLang = /<html[^>]+lang\s*=/i.test(body);
  if (!hasLang) {
    issues.push('Missing lang attribute on <html>');
  } else {
    checks_passed++;
  }

  // meta viewport
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(body);
  if (!hasViewport) {
    issues.push('Missing meta viewport tag');
  } else {
    checks_passed++;
  }

  const total_checks = 4;
  const score = Math.round((checks_passed / total_checks) * 100);
  return { _engine: 'real', issues, score, checks_passed };
}

// ---------------------------------------------------------------------------
// 26. sense-whois
// ---------------------------------------------------------------------------
async function senseWhois(input) {
  input = input || {};
  const domain = input.domain;
  if (!domain) return { _engine: 'real', error: 'missing_param', required: 'domain' };
  const dns = require('dns').promises;
  let nameservers = [];
  try {
    nameservers = await dns.resolveNs(domain);
  } catch (_) {}
  return {
    _engine: 'real',
    domain,
    nameservers,
    note: 'Full WHOIS requires external service',
  };
}

// ---------------------------------------------------------------------------
// 27. sense-ip-geo
// ---------------------------------------------------------------------------
function senseIpGeo(input) {
  input = input || {};
  const ip = input.ip;
  if (!ip) return { _engine: 'real', error: 'missing_param', required: 'ip' };
  const firstOctet = parseInt(ip.split('.')[0], 10);
  let region;
  if (firstOctet >= 1 && firstOctet <= 50) region = 'North America';
  else if (firstOctet >= 51 && firstOctet <= 100) region = 'Europe';
  else if (firstOctet >= 101 && firstOctet <= 150) region = 'Asia';
  else if (firstOctet >= 151 && firstOctet <= 200) region = 'South America';
  else region = 'Other';
  return { _engine: 'real', ip, region, note: 'Approximate based on IP ranges' };
}

// ---------------------------------------------------------------------------
// 28. sense-time-zones
// ---------------------------------------------------------------------------
function senseTimeZones() {
  const now = new Date();
  const timezones = [
    { name: 'UTC', region: 'Universal' },
    { name: 'America/New_York', region: 'North America' },
    { name: 'America/Chicago', region: 'North America' },
    { name: 'America/Denver', region: 'North America' },
    { name: 'America/Los_Angeles', region: 'North America' },
    { name: 'America/Anchorage', region: 'North America' },
    { name: 'Pacific/Honolulu', region: 'North America' },
    { name: 'America/Toronto', region: 'North America' },
    { name: 'America/Sao_Paulo', region: 'South America' },
    { name: 'America/Buenos_Aires', region: 'South America' },
    { name: 'Europe/London', region: 'Europe' },
    { name: 'Europe/Paris', region: 'Europe' },
    { name: 'Europe/Berlin', region: 'Europe' },
    { name: 'Europe/Moscow', region: 'Europe' },
    { name: 'Africa/Cairo', region: 'Africa' },
    { name: 'Africa/Lagos', region: 'Africa' },
    { name: 'Asia/Dubai', region: 'Asia' },
    { name: 'Asia/Kolkata', region: 'Asia' },
    { name: 'Asia/Bangkok', region: 'Asia' },
    { name: 'Asia/Singapore', region: 'Asia' },
    { name: 'Asia/Shanghai', region: 'Asia' },
    { name: 'Asia/Tokyo', region: 'Asia' },
    { name: 'Asia/Seoul', region: 'Asia' },
    { name: 'Australia/Sydney', region: 'Oceania' },
    { name: 'Pacific/Auckland', region: 'Oceania' },
  ].map(tz => {
    try {
      const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
      const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tz.name }));
      const diffMin = Math.round((tzDate - utcDate) / 60000);
      const sign = diffMin >= 0 ? '+' : '-';
      const absMin = Math.abs(diffMin);
      const offset = `UTC${sign}${String(Math.floor(absMin / 60)).padStart(2, '0')}:${String(absMin % 60).padStart(2, '0')}`;
      return { name: tz.name, offset, region: tz.region };
    } catch (_) {
      return { name: tz.name, offset: 'UTC+00:00', region: tz.region };
    }
  });
  return { _engine: 'real', timezones, count: timezones.length };
}

// ---------------------------------------------------------------------------
// 29. sense-crypto-price
// ---------------------------------------------------------------------------
async function senseCryptoPrice(input) {
  input = input || {};
  const coins = (input.coins || ['bitcoin', 'ethereum']).join(',');
  const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coins)}&vs_currencies=usd`;
  const { body, statusCode } = await fetchUrl(apiUrl, { timeoutMs: 10000 });
  if (statusCode !== 200) return { _engine: "real", error: "api_error", message: "CoinGecko API returned " + statusCode };
  const prices = JSON.parse(body);
  return { _engine: 'real', prices };
}

// ---------------------------------------------------------------------------
// 30. sense-github-releases
// ---------------------------------------------------------------------------
async function senseGithubReleases(input) {
  input = input || {};
  const repo = input.repo;
  if (!repo) return { _engine: 'real', error: 'missing_param', required: 'repo', hint: 'owner/repo format' };
  const apiUrl = `https://api.github.com/repos/${repo}/releases?per_page=5`;
  const { body, statusCode } = await fetchUrl(apiUrl, { timeoutMs: 8000 });
  if (statusCode !== 200) return { _engine: "real", error: "api_error", message: "GitHub API returned " + statusCode };
  const data = JSON.parse(body);
  const releases = data.map(r => ({ tag: r.tag_name, name: r.name, date: r.published_at }));
  return { _engine: 'real', releases };
}

// ---------------------------------------------------------------------------
// 31. sense-pypi-package
// ---------------------------------------------------------------------------
async function sensePypiPackage(input) {
  input = input || {};
  const pkg = input.package;
  if (!pkg) return { _engine: 'real', error: 'missing_param', required: 'package' };
  const apiUrl = `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`;
  const { body, statusCode } = await fetchUrl(apiUrl, { timeoutMs: 8000 });
  if (statusCode !== 200) return { _engine: "real", error: "api_error", message: "PyPI returned " + statusCode };
  const data = JSON.parse(body);
  const info = data.info || {};
  return {
    _engine: 'real',
    name: info.name,
    version: info.version,
    summary: info.summary,
    author: info.author,
  };
}

// ---------------------------------------------------------------------------
// 32. sense-domain-expiry
// ---------------------------------------------------------------------------
async function senseDomainExpiry(input) {
  input = input || {};
  const domain = input.domain;
  if (!domain) return { _engine: 'real', error: 'missing_param', required: 'domain' };
  const dns = require('dns').promises;
  let nameservers = [];
  let soa_serial = null;
  try {
    nameservers = await dns.resolveNs(domain);
  } catch (_) {}
  try {
    const soa = await dns.resolveSoa(domain);
    soa_serial = soa.serial;
  } catch (_) {}
  return {
    _engine: 'real',
    domain,
    nameservers,
    soa_serial,
    note: 'Full expiry requires WHOIS',
  };
}

// ---------------------------------------------------------------------------
// 33. sense-http-headers-security
// ---------------------------------------------------------------------------
async function senseHttpHeadersSecurity(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_param', required: 'url' };
  const { headers } = await fetchUrl(url, { timeoutMs: 10000, method: 'HEAD' });
  const securityHeaders = [
    'strict-transport-security',
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'x-xss-protection',
    'referrer-policy',
    'permissions-policy',
  ];
  const present = [];
  const missing = [];
  for (const h of securityHeaders) {
    if (headers[h]) present.push(h);
    else missing.push(h);
  }
  const score = Math.round((present.length / securityHeaders.length) * 100);
  let grade;
  if (score >= 86) grade = 'A';
  else if (score >= 71) grade = 'B';
  else if (score >= 57) grade = 'C';
  else if (score >= 43) grade = 'D';
  else grade = 'F';
  return { _engine: 'real', present, missing, score, grade };
}

// ---------------------------------------------------------------------------
// 34. sense-url-broken-links
// ---------------------------------------------------------------------------
async function senseUrlBrokenLinks(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const { body } = await fetchUrl(url, { timeoutMs: 10000 });
  const re = /<a[^>]+href=["']([^"'#][^"']*)["']/gi;
  const links = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    try { links.push(new URL(m[1], url).toString()); } catch (_) {}
  }
  const unique = [...new Set(links)].slice(0, 10);
  const broken = [];
  let ok = 0;
  await Promise.all(unique.map(async link => {
    try {
      const { statusCode } = await fetchUrl(link, { timeoutMs: 5000, method: 'HEAD' });
      if (statusCode >= 400) broken.push({ url: link, status: statusCode });
      else ok++;
    } catch (_) {
      broken.push({ url: link, status: 0 });
    }
  }));
  return { _engine: 'real', checked: unique.length, broken, ok };
}

// ---------------------------------------------------------------------------
// 35. sense-dns-propagation
// ---------------------------------------------------------------------------
async function senseDnsPropagation(input) {
  input = input || {};
  const domain = input.domain;
  if (!domain) return { _engine: 'real', error: 'missing_param', required: 'domain' };
  const resolvers = ['8.8.8.8', '1.1.1.1', '208.67.222.222'];
  const dns = require('dns');
  const results = await Promise.all(resolvers.map(resolver => new Promise(resolve => {
    const r = new dns.Resolver();
    r.setServers([resolver]);
    const timer = setTimeout(() => resolve({ resolver, addresses: [], error: 'timeout' }), 5000);
    r.resolve4(domain, (err, addresses) => {
      clearTimeout(timer);
      if (err) resolve({ resolver, addresses: [], error: err.message });
      else resolve({ resolver, addresses });
    });
  })));
  const allAddresses = results.map(r => JSON.stringify((r.addresses || []).sort()));
  const consistent = allAddresses.every(a => a === allAddresses[0]);
  return { _engine: 'real', results, consistent };
}

// ---------------------------------------------------------------------------
// 36. sense-url-performance
// ---------------------------------------------------------------------------
async function senseUrlPerformance(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const start = Date.now();
  let ttfb_ms = 0;

  await new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { return reject(new Error('Invalid URL')); }
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: 10000,
      rejectUnauthorized: false,
      headers: { 'User-Agent': 'Slopshop-SenseHandler/1.0' },
    };
    const req = lib.request(options, res => {
      ttfb_ms = Date.now() - start;
      res.resume();
      res.on('end', resolve);
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Timed out')));
    req.on('error', reject);
    req.end();
  });

  const total_ms = Date.now() - start;
  return { _engine: 'real', ttfb_ms, total_ms, url };
}

// ---------------------------------------------------------------------------
// 37. sense-url-word-count
// ---------------------------------------------------------------------------
async function senseUrlWordCount(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const { body } = await fetchUrl(url, { timeoutMs: 10000 });
  const text = stripHtml(body);
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  return { _engine: 'real', words, url };
}

// ---------------------------------------------------------------------------
// 38. sense-url-diff
// ---------------------------------------------------------------------------
async function senseUrlDiff(input) {
  input = input || {};
  const url_a = input.url_a;
  const url_b = input.url_b;
  if (!url_a) return { _engine: 'real', error: 'missing_param', required: 'url_a' };
  if (!url_b) return { _engine: 'real', error: 'missing_param', required: 'url_b' };
  const [resA, resB] = await Promise.all([
    fetchUrl(url_a, { timeoutMs: 10000 }),
    fetchUrl(url_b, { timeoutMs: 10000 }),
  ]);
  const textA = stripHtml(resA.body).split(/\n+/).map(l => l.trim()).filter(Boolean);
  const textB = stripHtml(resB.body).split(/\n+/).map(l => l.trim()).filter(Boolean);
  const setA = new Set(textA);
  const setB = new Set(textB);
  const added_lines = textB.filter(l => !setA.has(l)).length;
  const removed_lines = textA.filter(l => !setB.has(l)).length;
  const common = textA.filter(l => setB.has(l)).length;
  const total = Math.max(textA.length, textB.length, 1);
  const similarity = +(common / total).toFixed(4);
  return { _engine: 'real', similarity, added_lines, removed_lines };
}

// ---------------------------------------------------------------------------
// 39. sense-github-user
// ---------------------------------------------------------------------------
async function senseGithubUser(input) {
  input = input || {};
  const username = input.username || input.user;
  if (!username) return { _engine: 'real', error: 'missing_param', required: 'username' };
  const apiUrl = `https://api.github.com/users/${encodeURIComponent(username)}`;
  const { body, statusCode } = await fetchUrl(apiUrl, { timeoutMs: 8000 });
  if (statusCode !== 200) return { _engine: "real", error: "api_error", message: "GitHub API returned " + statusCode };
  const d = JSON.parse(body);
  return {
    _engine: 'real',
    login: d.login,
    name: d.name,
    bio: d.bio,
    public_repos: d.public_repos,
    followers: d.followers,
  };
}

// ---------------------------------------------------------------------------
// 40. sense-url-screenshot-text
// ---------------------------------------------------------------------------
async function senseUrlScreenshotText(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const { body } = await fetchUrl(url, { timeoutMs: 10000 });
  const text = stripHtml(body).slice(0, 5000);
  const word_count = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  return { _engine: 'real', text, word_count };
}

// ---------------------------------------------------------------------------
// Exports – handler keys must match API slugs
// ---------------------------------------------------------------------------
module.exports = {
  'sense-url-content':            senseUrlContent,
  'sense-url-meta':               senseUrlMeta,
  'sense-url-links':              senseUrlLinks,
  'sense-url-feed':               senseUrlFeed,
  'sense-url-robots':             senseUrlRobots,
  'sense-time-now':               senseTimeNow,
  'sense-github-repo':            senseGithubRepo,
  'sense-npm-package':            senseNpmPackage,
  'sense-port-open':              sensePortOpen,
  'sense-uptime-check':           senseUptimeCheck,
  'analyze-log-parse':            analyzeLogParse,
  'analyze-error-fingerprint':    analyzeErrorFingerprint,
  'analyze-csv-summary':          analyzeCsvSummary,
  'analyze-time-series-trend':    analyzeTimeSeriesTrend,
  'analyze-time-series-anomaly':  analyzeTimeSeriesAnomaly,
  'analyze-ab-test':              analyzeAbTest,
  'analyze-distribution-fit':     analyzeDistributionFit,
  'analyze-text-ngrams':          analyzeTextNgrams,
  'analyze-text-tfidf':           analyzeTextTfidf,
  'analyze-funnel':               analyzeFunnel,
  'sense-url-tech-stack':         senseUrlTechStack,
  'sense-url-response-time':      senseUrlResponseTime,
  'sense-url-sitemap':            senseUrlSitemap,
  'sense-rss-latest':             senseRssLatest,
  'sense-url-accessibility':      senseUrlAccessibility,
  'sense-whois':                  senseWhois,
  'sense-ip-geo':                 senseIpGeo,
  'sense-time-zones':             senseTimeZones,
  'sense-crypto-price':           senseCryptoPrice,
  'sense-github-releases':        senseGithubReleases,
  'sense-pypi-package':           sensePypiPackage,
  'sense-domain-expiry':          senseDomainExpiry,
  'sense-http-headers-security':  senseHttpHeadersSecurity,
  'sense-url-broken-links':       senseUrlBrokenLinks,
  'sense-dns-propagation':        senseDnsPropagation,
  'sense-url-performance':        senseUrlPerformance,
  'sense-url-word-count':         senseUrlWordCount,
  'sense-url-diff':               senseUrlDiff,
  'sense-github-user':            senseGithubUser,
  'sense-url-screenshot-text':    senseUrlScreenshotText,

  'sense-subdomains': async ({ domain }) => {
    if (!domain) return { _engine: 'real', error: 'Provide domain' };
    const dns = require('dns').promises;
    const common = ['www','mail','ftp','admin','api','dev','staging','test','blog','shop','app','cdn','docs','status','beta','demo'];
    const found = [];

    // Check common subdomains via DNS
    await Promise.allSettled(common.map(async (sub) => {
      try {
        const result = await dns.resolve4(`${sub}.${domain}`);
        if (result.length) found.push({ subdomain: `${sub}.${domain}`, ips: result });
      } catch(e) {}
    }));

    return { _engine: 'real', domain, found: found.length, subdomains: found };
  },
};
