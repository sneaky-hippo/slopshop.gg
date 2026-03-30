'use strict';

const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
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

// Safe JSON parse – returns null on failure instead of throwing
function safeJson(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
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

// Compute UTC offset string from a timezone name using Intl
function tzOffset(timezone, now) {
  try {
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const diffMin = Math.round((tzDate - utcDate) / 60000);
    const sign = diffMin >= 0 ? '+' : '-';
    const absMin = Math.abs(diffMin);
    return `UTC${sign}${String(Math.floor(absMin / 60)).padStart(2, '0')}:${String(absMin % 60).padStart(2, '0')}`;
  } catch (_) {
    return 'UTC+00:00';
  }
}

// ---------------------------------------------------------------------------
// 1. sense-url-content
// ---------------------------------------------------------------------------
async function senseUrlContent(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  const start = Date.now();
  try {
    const { body } = await fetchUrl(url, { timeoutMs: 10000 });
    const fetch_time_ms = Date.now() - start;
    const title = extractTitle(body);
    const text = stripHtml(body).slice(0, 5000);
    const word_count = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    return { _engine: 'real', url, title, text, word_count, fetch_time_ms };
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
}

// ---------------------------------------------------------------------------
// 2. sense-url-meta
// ---------------------------------------------------------------------------
async function senseUrlMeta(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
}

// ---------------------------------------------------------------------------
// 3. sense-url-links
// ---------------------------------------------------------------------------
async function senseUrlLinks(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
}

// ---------------------------------------------------------------------------
// 4. sense-url-feed
// ---------------------------------------------------------------------------
async function senseUrlFeed(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
}

// ---------------------------------------------------------------------------
// 5. sense-url-robots
// ---------------------------------------------------------------------------
async function senseUrlRobots(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
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
    offset = tzOffset(timezone, now);
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
  try {
    const apiUrl = `https://api.github.com/repos/${repo}`;
    const { body, statusCode } = await fetchUrl(apiUrl, { timeoutMs: 8000 });
    if (statusCode !== 200) return { _engine: 'real', error: 'api_error', message: `GitHub API returned ${statusCode}` };
    const d = safeJson(body);
    if (!d) return { _engine: 'real', error: 'parse_error', message: 'Invalid JSON from GitHub API' };
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message };
  }
}

// ---------------------------------------------------------------------------
// 8. sense-npm-package
// ---------------------------------------------------------------------------
async function senseNpmPackage(input) {
  input = input || {};
  const pkg = input.package;
  if (!pkg) return { _engine: 'real', error: 'missing_param', required: 'package' };
  try {
    const encoded = encodeURIComponent(pkg).replace('%40', '@');
    const infoUrl = `https://registry.npmjs.org/${encoded}`;
    const { body, statusCode } = await fetchUrl(infoUrl, { timeoutMs: 8000 });
    if (statusCode !== 200) return { _engine: 'real', error: 'api_error', message: `npm registry returned ${statusCode}` };
    const d = safeJson(body);
    if (!d) return { _engine: 'real', error: 'parse_error', message: 'Invalid JSON from npm registry' };
    const latest = d['dist-tags'] && d['dist-tags'].latest ? d['dist-tags'].latest : Object.keys(d.versions || {}).pop() || '';
    const ver = d.versions && d.versions[latest] ? d.versions[latest] : {};

    // weekly downloads from downloads API
    let weekly_downloads = 0;
    try {
      const dlUrl = `https://api.npmjs.org/downloads/point/last-week/${encoded}`;
      const dlRes = await fetchUrl(dlUrl, { timeoutMs: 5000 });
      const dlData = safeJson(dlRes.body);
      weekly_downloads = dlData ? (dlData.downloads || 0) : 0;
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message };
  }
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
      error: e.message,
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
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
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
    try {
      await fetchUrl(url, { timeoutMs: 10000, method: 'HEAD' });
    } catch (_) {/* individual probe failure; still record elapsed */}
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
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
}

// ---------------------------------------------------------------------------
// 24. sense-rss-latest
// ---------------------------------------------------------------------------
async function senseRssLatest(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_param', required: 'url' };
  const count = input.count || 5;
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
}

// ---------------------------------------------------------------------------
// 25. sense-url-accessibility
// ---------------------------------------------------------------------------
async function senseUrlAccessibility(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
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
// 27. sense-ip-geo  (fixed: uses ip-api.com instead of fake range heuristic)
// ---------------------------------------------------------------------------
async function senseIpGeo(input) {
  input = input || {};
  const ip = input.ip;
  if (!ip) return { _engine: 'real', error: 'missing_param', required: 'ip' };
  try {
    const { body, statusCode } = await fetchUrl(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query`, { timeoutMs: 6000 });
    if (statusCode !== 200) throw new Error(`HTTP ${statusCode}`);
    const d = safeJson(body);
    if (!d || d.status === 'fail') {
      return { _engine: 'real', error: 'lookup_failed', message: d ? d.message : 'Invalid JSON', ip };
    }
    return {
      _engine: 'real',
      ip: d.query,
      country: d.country,
      country_code: d.countryCode,
      region: d.regionName,
      city: d.city,
      zip: d.zip,
      lat: d.lat,
      lon: d.lon,
      timezone: d.timezone,
      isp: d.isp,
      org: d.org,
      as: d.as,
    };
  } catch (e) {
    // Fallback: rough continent from first octet
    const firstOctet = parseInt((ip.split('.')[0]) || '0', 10);
    let region;
    if (firstOctet >= 1 && firstOctet <= 50) region = 'North America';
    else if (firstOctet >= 51 && firstOctet <= 100) region = 'Europe';
    else if (firstOctet >= 101 && firstOctet <= 150) region = 'Asia';
    else if (firstOctet >= 151 && firstOctet <= 200) region = 'South America';
    else region = 'Other';
    return { _engine: 'real', ip, region, note: 'Approximate (geo lookup failed)', error: e.message };
  }
}

// ---------------------------------------------------------------------------
// 28. sense-time-zones
// ---------------------------------------------------------------------------
function senseTimeZones(input) {
  input = input || {};
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
    { name: 'America/Vancouver', region: 'North America' },
    { name: 'America/Phoenix', region: 'North America' },
    { name: 'America/Sao_Paulo', region: 'South America' },
    { name: 'America/Buenos_Aires', region: 'South America' },
    { name: 'America/Lima', region: 'South America' },
    { name: 'America/Bogota', region: 'South America' },
    { name: 'America/Santiago', region: 'South America' },
    { name: 'Europe/London', region: 'Europe' },
    { name: 'Europe/Paris', region: 'Europe' },
    { name: 'Europe/Berlin', region: 'Europe' },
    { name: 'Europe/Moscow', region: 'Europe' },
    { name: 'Europe/Istanbul', region: 'Europe' },
    { name: 'Europe/Amsterdam', region: 'Europe' },
    { name: 'Europe/Madrid', region: 'Europe' },
    { name: 'Europe/Rome', region: 'Europe' },
    { name: 'Europe/Stockholm', region: 'Europe' },
    { name: 'Africa/Cairo', region: 'Africa' },
    { name: 'Africa/Lagos', region: 'Africa' },
    { name: 'Africa/Johannesburg', region: 'Africa' },
    { name: 'Africa/Nairobi', region: 'Africa' },
    { name: 'Asia/Dubai', region: 'Asia' },
    { name: 'Asia/Kolkata', region: 'Asia' },
    { name: 'Asia/Dhaka', region: 'Asia' },
    { name: 'Asia/Bangkok', region: 'Asia' },
    { name: 'Asia/Singapore', region: 'Asia' },
    { name: 'Asia/Shanghai', region: 'Asia' },
    { name: 'Asia/Hong_Kong', region: 'Asia' },
    { name: 'Asia/Tokyo', region: 'Asia' },
    { name: 'Asia/Seoul', region: 'Asia' },
    { name: 'Asia/Karachi', region: 'Asia' },
    { name: 'Asia/Riyadh', region: 'Asia' },
    { name: 'Asia/Tehran', region: 'Asia' },
    { name: 'Asia/Kathmandu', region: 'Asia' },
    { name: 'Australia/Perth', region: 'Oceania' },
    { name: 'Australia/Darwin', region: 'Oceania' },
    { name: 'Australia/Adelaide', region: 'Oceania' },
    { name: 'Australia/Sydney', region: 'Oceania' },
    { name: 'Pacific/Auckland', region: 'Oceania' },
    { name: 'Pacific/Fiji', region: 'Oceania' },
  ].map(tz => {
    const offset = tzOffset(tz.name, now);
    // Get current local time in this zone
    let local_time = '';
    try {
      local_time = new Intl.DateTimeFormat('en-US', {
        timeZone: tz.name,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }).format(now);
    } catch (_) {}
    return { name: tz.name, offset, region: tz.region, local_time };
  });
  return { _engine: 'real', timezones, count: timezones.length };
}

// ---------------------------------------------------------------------------
// 29. sense-crypto-price
// ---------------------------------------------------------------------------
async function senseCryptoPrice(input) {
  input = input || {};
  const coins = (input.coins || ['bitcoin', 'ethereum']).join(',');
  try {
    const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coins)}&vs_currencies=usd`;
    const { body, statusCode } = await fetchUrl(apiUrl, { timeoutMs: 10000 });
    if (statusCode !== 200) return { _engine: 'real', error: 'api_error', message: `CoinGecko API returned ${statusCode}` };
    const prices = safeJson(body);
    if (!prices) return { _engine: 'real', error: 'parse_error', message: 'Invalid JSON from CoinGecko' };
    return { _engine: 'real', prices };
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message };
  }
}

// ---------------------------------------------------------------------------
// 30. sense-github-releases
// ---------------------------------------------------------------------------
async function senseGithubReleases(input) {
  input = input || {};
  const repo = input.repo;
  if (!repo) return { _engine: 'real', error: 'missing_param', required: 'repo', hint: 'owner/repo format' };
  try {
    const apiUrl = `https://api.github.com/repos/${repo}/releases?per_page=5`;
    const { body, statusCode } = await fetchUrl(apiUrl, { timeoutMs: 8000 });
    if (statusCode !== 200) return { _engine: 'real', error: 'api_error', message: `GitHub API returned ${statusCode}` };
    const data = safeJson(body);
    if (!data) return { _engine: 'real', error: 'parse_error', message: 'Invalid JSON from GitHub API' };
    const releases = data.map(r => ({ tag: r.tag_name, name: r.name, date: r.published_at }));
    return { _engine: 'real', releases };
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message };
  }
}

// ---------------------------------------------------------------------------
// 31. sense-pypi-package
// ---------------------------------------------------------------------------
async function sensePypiPackage(input) {
  input = input || {};
  const pkg = input.package;
  if (!pkg) return { _engine: 'real', error: 'missing_param', required: 'package' };
  try {
    const apiUrl = `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`;
    const { body, statusCode } = await fetchUrl(apiUrl, { timeoutMs: 8000 });
    if (statusCode !== 200) return { _engine: 'real', error: 'api_error', message: `PyPI returned ${statusCode}` };
    const data = safeJson(body);
    if (!data) return { _engine: 'real', error: 'parse_error', message: 'Invalid JSON from PyPI' };
    const info = data.info || {};
    return {
      _engine: 'real',
      name: info.name,
      version: info.version,
      summary: info.summary,
      author: info.author,
      license: info.license || '',
      home_page: info.home_page || '',
      project_urls: info.project_urls || {},
    };
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message };
  }
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
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
}

// ---------------------------------------------------------------------------
// 34. sense-url-broken-links
// ---------------------------------------------------------------------------
async function senseUrlBrokenLinks(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
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

  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }

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
  try {
    const { body } = await fetchUrl(url, { timeoutMs: 10000 });
    const text = stripHtml(body);
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    return { _engine: 'real', words, url };
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
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
  try {
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
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message };
  }
}

// ---------------------------------------------------------------------------
// 39. sense-github-user
// ---------------------------------------------------------------------------
async function senseGithubUser(input) {
  input = input || {};
  const username = input.username || input.user;
  if (!username) return { _engine: 'real', error: 'missing_param', required: 'username' };
  try {
    const apiUrl = `https://api.github.com/users/${encodeURIComponent(username)}`;
    const { body, statusCode } = await fetchUrl(apiUrl, { timeoutMs: 8000 });
    if (statusCode !== 200) return { _engine: 'real', error: 'api_error', message: `GitHub API returned ${statusCode}` };
    const d = safeJson(body);
    if (!d) return { _engine: 'real', error: 'parse_error', message: 'Invalid JSON from GitHub API' };
    return {
      _engine: 'real',
      login: d.login,
      name: d.name,
      bio: d.bio,
      public_repos: d.public_repos,
      followers: d.followers,
    };
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message };
  }
}

// ---------------------------------------------------------------------------
// 40. sense-url-screenshot-text
// ---------------------------------------------------------------------------
async function senseUrlScreenshotText(input) {
  input = input || {};
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'missing_required_field', required: 'url' };
  try {
    const { body } = await fetchUrl(url, { timeoutMs: 10000 });
    const text = stripHtml(body).slice(0, 5000);
    const word_count = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    return { _engine: 'real', text, word_count };
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, url };
  }
}

// ---------------------------------------------------------------------------
// 41. sense-ip-info  (server's own public IP via ipify + ip-api geo)
// ---------------------------------------------------------------------------
async function senseIpInfo(input) {
  input = input || {};
  let public_ip = '';
  try {
    const { body } = await fetchUrl('https://api.ipify.org?format=json', { timeoutMs: 5000 });
    const d = safeJson(body);
    public_ip = d ? d.ip : '';
  } catch (_) {}

  let geo = {};
  if (public_ip) {
    try {
      const { body } = await fetchUrl(`http://ip-api.com/json/${public_ip}?fields=country,countryCode,regionName,city,timezone,isp,org`, { timeoutMs: 5000 });
      const d = safeJson(body);
      if (d && d.status !== 'fail') geo = d;
    } catch (_) {}
  }

  return {
    _engine: 'real',
    public_ip,
    country: geo.country || '',
    country_code: geo.countryCode || '',
    region: geo.regionName || '',
    city: geo.city || '',
    timezone: geo.timezone || '',
    isp: geo.isp || '',
    org: geo.org || '',
  };
}

// ---------------------------------------------------------------------------
// 42. sense-weather  (uses wttr.in JSON API — no key required)
// ---------------------------------------------------------------------------
async function senseWeather(input) {
  input = input || {};
  const location = input.city || input.location || input.q || 'New York';
  try {
    const encoded = encodeURIComponent(location);
    const { body, statusCode } = await fetchUrl(`https://wttr.in/${encoded}?format=j1`, { timeoutMs: 10000 });
    if (statusCode !== 200) return { _engine: 'real', error: 'weather_api_error', status: statusCode, location };
    const d = safeJson(body);
    if (!d || !d.current_condition || !d.current_condition[0]) {
      return { _engine: 'real', error: 'parse_error', message: 'Unexpected weather API response', location };
    }
    const c = d.current_condition[0];
    const area = (d.nearest_area && d.nearest_area[0]) ? d.nearest_area[0] : {};
    const areaName = area.areaName ? area.areaName[0].value : location;
    const country = area.country ? area.country[0].value : '';
    return {
      _engine: 'real',
      location: areaName,
      country,
      temp_c: parseInt(c.temp_C, 10),
      temp_f: parseInt(c.temp_F, 10),
      feels_like_c: parseInt(c.FeelsLikeC, 10),
      feels_like_f: parseInt(c.FeelsLikeF, 10),
      humidity_pct: parseInt(c.humidity, 10),
      wind_kmph: parseInt(c.windspeedKmph, 10),
      wind_dir: c.winddir16Point,
      visibility_km: parseInt(c.visibility, 10),
      description: c.weatherDesc[0].value,
      weather_code: parseInt(c.weatherCode, 10),
      uv_index: parseInt(c.uvIndex, 10),
      pressure_mb: parseInt(c.pressure, 10),
    };
  } catch (e) {
    return { _engine: 'real', error: 'fetch_failed', message: e.message, location };
  }
}

// ---------------------------------------------------------------------------
// 43. sense-system-info  (basic server info — no external deps)
// ---------------------------------------------------------------------------
function senseSystemInfo(input) {
  input = input || {};
  const platform = os.platform();
  const arch = os.arch();
  const hostname = os.hostname();
  const uptime_s = Math.floor(os.uptime());
  const node_version = process.version;
  const cpus = os.cpus();
  const cpu_model = cpus.length > 0 ? cpus[0].model : 'unknown';
  const cpu_count = cpus.length;
  const total_mem_mb = Math.round(os.totalmem() / 1024 / 1024);
  const free_mem_mb = Math.round(os.freemem() / 1024 / 1024);
  const used_mem_mb = total_mem_mb - free_mem_mb;
  const mem_usage_pct = +(used_mem_mb / total_mem_mb * 100).toFixed(1);
  const load_avg = os.loadavg(); // [1m, 5m, 15m]

  return {
    _engine: 'real',
    platform,
    arch,
    hostname,
    node_version,
    cpu_model,
    cpu_count,
    uptime_s,
    uptime_human: `${Math.floor(uptime_s / 86400)}d ${Math.floor((uptime_s % 86400) / 3600)}h ${Math.floor((uptime_s % 3600) / 60)}m`,
    total_mem_mb,
    free_mem_mb,
    used_mem_mb,
    mem_usage_pct,
    load_avg_1m: +load_avg[0].toFixed(2),
    load_avg_5m: +load_avg[1].toFixed(2),
    load_avg_15m: +load_avg[2].toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// 44. sense-system-resources  (CPU %, memory, disk)
// ---------------------------------------------------------------------------
async function senseSystemResources(input) {
  input = input || {};

  // CPU usage: sample over 200ms
  function getCpuUsage() {
    return new Promise(resolve => {
      const cpusBefore = os.cpus();
      setTimeout(() => {
        const cpusAfter = os.cpus();
        let totalIdle = 0, totalTick = 0;
        cpusAfter.forEach((cpu, i) => {
          const before = cpusBefore[i];
          for (const type of Object.keys(cpu.times)) {
            totalTick += cpu.times[type] - before.times[type];
          }
          totalIdle += cpu.times.idle - before.times.idle;
        });
        const usage_pct = totalTick === 0 ? 0 : +((1 - totalIdle / totalTick) * 100).toFixed(1);
        resolve(usage_pct);
      }, 200);
    });
  }

  const cpu_usage_pct = await getCpuUsage();

  const total_mem_mb = Math.round(os.totalmem() / 1024 / 1024);
  const free_mem_mb = Math.round(os.freemem() / 1024 / 1024);
  const used_mem_mb = total_mem_mb - free_mem_mb;
  const mem_usage_pct = +(used_mem_mb / total_mem_mb * 100).toFixed(1);

  // Process memory
  const proc = process.memoryUsage();
  const process_rss_mb = +(proc.rss / 1024 / 1024).toFixed(1);
  const process_heap_used_mb = +(proc.heapUsed / 1024 / 1024).toFixed(1);
  const process_heap_total_mb = +(proc.heapTotal / 1024 / 1024).toFixed(1);

  // Disk — try to read /proc/mounts or use os.tmpdir as a proxy; use statfs if available
  let disk = null;
  try {
    const { execSync } = require('child_process');
    const dfOut = execSync('df -k / 2>/dev/null || df -k .', { timeout: 3000 }).toString();
    const lines = dfOut.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].trim().split(/\s+/);
      const total_kb = parseInt(parts[1], 10);
      const used_kb = parseInt(parts[2], 10);
      const avail_kb = parseInt(parts[3], 10);
      disk = {
        total_gb: +(total_kb / 1024 / 1024).toFixed(2),
        used_gb: +(used_kb / 1024 / 1024).toFixed(2),
        free_gb: +(avail_kb / 1024 / 1024).toFixed(2),
        usage_pct: total_kb > 0 ? +(used_kb / total_kb * 100).toFixed(1) : 0,
      };
    }
  } catch (_) {}

  const result = {
    _engine: 'real',
    cpu_usage_pct,
    cpu_count: os.cpus().length,
    load_avg_1m: +os.loadavg()[0].toFixed(2),
    memory: {
      total_mb: total_mem_mb,
      used_mb: used_mem_mb,
      free_mb: free_mem_mb,
      usage_pct: mem_usage_pct,
    },
    process_memory: {
      rss_mb: process_rss_mb,
      heap_used_mb: process_heap_used_mb,
      heap_total_mb: process_heap_total_mb,
    },
  };
  if (disk) result.disk = disk;
  return result;
}

// ---------------------------------------------------------------------------
// 45. sense-time-convert
// ---------------------------------------------------------------------------
function senseTimeConvert(input) {
  input = input || {};
  const datetime = input.datetime || input.time || input.date;
  const from_tz = input.from_tz || input.from || 'UTC';
  const to_tz = input.to_tz || input.to || 'UTC';

  if (!datetime) return { _engine: 'real', error: 'missing_param', required: 'datetime' };

  try {
    // Parse the input datetime as if it's in from_tz by constructing an ISO string
    // Strategy: use toLocaleString trick to find the UTC equivalent
    const parsedDate = new Date(datetime);
    if (isNaN(parsedDate.getTime())) {
      return { _engine: 'real', error: 'invalid_datetime', message: `Cannot parse: ${datetime}` };
    }

    // Convert from_tz local time to UTC, then to to_tz
    // Find the offset of from_tz at this moment
    const now = parsedDate;

    // Get the wall clock in from_tz and to_tz for the parsed UTC instant
    const inFromTz = now.toLocaleString('en-US', { timeZone: from_tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const inToTz = now.toLocaleString('en-US', { timeZone: to_tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const fromOffset = tzOffset(from_tz, now);
    const toOffset = tzOffset(to_tz, now);

    return {
      _engine: 'real',
      input: datetime,
      from_tz,
      to_tz,
      from_formatted: inFromTz,
      to_formatted: inToTz,
      from_offset: fromOffset,
      to_offset: toOffset,
      iso_utc: now.toISOString(),
    };
  } catch (e) {
    return { _engine: 'real', error: 'conversion_failed', message: e.message };
  }
}

// ---------------------------------------------------------------------------
// 46. sense-date-diff
// ---------------------------------------------------------------------------
function senseDateDiff(input) {
  input = input || {};
  const a = input.date_a || input.from || input.start;
  const b = input.date_b || input.to || input.end;
  if (!a) return { _engine: 'real', error: 'missing_param', required: 'date_a' };
  if (!b) return { _engine: 'real', error: 'missing_param', required: 'date_b' };

  const dateA = new Date(a);
  const dateB = new Date(b);
  if (isNaN(dateA.getTime())) return { _engine: 'real', error: 'invalid_date', field: 'date_a', value: a };
  if (isNaN(dateB.getTime())) return { _engine: 'real', error: 'invalid_date', field: 'date_b', value: b };

  const diffMs = dateB.getTime() - dateA.getTime();
  const abs_ms = Math.abs(diffMs);
  const direction = diffMs >= 0 ? 'future' : 'past';

  const total_minutes = Math.floor(abs_ms / 60000);
  const total_hours = Math.floor(abs_ms / 3600000);
  const total_days = Math.floor(abs_ms / 86400000);
  const total_weeks = Math.floor(total_days / 7);

  const years = Math.floor(total_days / 365.25);
  const months = Math.floor((total_days % 365.25) / 30.44);
  const days = Math.floor(total_days % 30.44);

  return {
    _engine: 'real',
    date_a: dateA.toISOString(),
    date_b: dateB.toISOString(),
    direction,
    total_days,
    total_hours,
    total_minutes,
    total_weeks,
    human: `${years > 0 ? years + 'y ' : ''}${months > 0 ? months + 'mo ' : ''}${days}d`,
    years,
    months,
    days,
  };
}

// ---------------------------------------------------------------------------
// 47. sense-date-add
// ---------------------------------------------------------------------------
function senseDateAdd(input) {
  input = input || {};
  const date = input.date || input.datetime;
  if (!date) return { _engine: 'real', error: 'missing_param', required: 'date' };

  const base = new Date(date);
  if (isNaN(base.getTime())) return { _engine: 'real', error: 'invalid_date', value: date };

  const years = input.years || 0;
  const months = input.months || 0;
  const weeks = input.weeks || 0;
  const days = input.days || 0;
  const hours = input.hours || 0;
  const minutes = input.minutes || 0;
  const seconds = input.seconds || 0;

  const result = new Date(base.getTime());
  // Add years and months via setUTC methods to avoid DST issues
  result.setUTCFullYear(result.getUTCFullYear() + years);
  result.setUTCMonth(result.getUTCMonth() + months);
  // Add the rest as milliseconds
  const deltaMs = ((weeks * 7 + days) * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000;
  result.setTime(result.getTime() + deltaMs);

  return {
    _engine: 'real',
    input: base.toISOString(),
    added: { years, months, weeks, days, hours, minutes, seconds },
    result: result.toISOString(),
    unix: Math.floor(result.getTime() / 1000),
  };
}

// ---------------------------------------------------------------------------
// 48. sense-unix-timestamp
// ---------------------------------------------------------------------------
function senseUnixTimestamp(input) {
  input = input || {};

  // If 'unix' provided: convert unix → ISO
  if (input.unix !== undefined) {
    const ts = Number(input.unix);
    if (isNaN(ts)) return { _engine: 'real', error: 'invalid_unix', value: input.unix };
    const d = new Date(ts * 1000);
    return {
      _engine: 'real',
      mode: 'unix_to_iso',
      unix: ts,
      iso: d.toISOString(),
      utc: d.toUTCString(),
      ms: ts * 1000,
    };
  }

  // If 'date' or 'iso' provided: convert ISO → unix
  const dateStr = input.date || input.iso || input.datetime;
  if (dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { _engine: 'real', error: 'invalid_date', value: dateStr };
    return {
      _engine: 'real',
      mode: 'iso_to_unix',
      iso: d.toISOString(),
      unix: Math.floor(d.getTime() / 1000),
      unix_ms: d.getTime(),
    };
  }

  // No input: return current timestamp
  const now = new Date();
  return {
    _engine: 'real',
    mode: 'current',
    iso: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000),
    unix_ms: now.getTime(),
  };
}

// ---------------------------------------------------------------------------
// 49. sense-calendar-week
// ---------------------------------------------------------------------------
function senseCalendarWeek(input) {
  input = input || {};
  const dateStr = input.date || new Date().toISOString();
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { _engine: 'real', error: 'invalid_date', value: dateStr };

  // ISO week number (Monday = first day)
  function getISOWeek(date) {
    const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayOfWeek = tmp.getUTCDay() || 7; // Mon=1 ... Sun=7
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayOfWeek); // nearest Thursday
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  }

  // Day of year
  const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const day_of_year = Math.ceil((d.getTime() - startOfYear.getTime()) / 86400000) + 1;

  const iso_week = getISOWeek(d);
  const day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const month_names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const day_of_week = d.getUTCDay(); // 0=Sun
  const quarter = Math.ceil((d.getUTCMonth() + 1) / 3);

  // Days remaining in year
  const endOfYear = new Date(Date.UTC(d.getUTCFullYear(), 11, 31));
  const days_remaining_in_year = Math.ceil((endOfYear.getTime() - d.getTime()) / 86400000);

  // Is leap year?
  const yr = d.getUTCFullYear();
  const is_leap_year = (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;

  return {
    _engine: 'real',
    date: d.toISOString().split('T')[0],
    iso_week,
    day_of_year,
    day_of_week,
    day_name: day_names[day_of_week],
    month_name: month_names[d.getUTCMonth()],
    quarter,
    days_remaining_in_year,
    is_leap_year,
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

// ---------------------------------------------------------------------------
// 50. sense-countdown
// ---------------------------------------------------------------------------
function senseCountdown(input) {
  input = input || {};
  const target = input.target || input.date || input.to;
  if (!target) return { _engine: 'real', error: 'missing_param', required: 'target' };

  const targetDate = new Date(target);
  if (isNaN(targetDate.getTime())) return { _engine: 'real', error: 'invalid_date', value: target };

  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  const isPast = diffMs < 0;
  const abs_ms = Math.abs(diffMs);

  const total_seconds = Math.floor(abs_ms / 1000);
  const total_minutes = Math.floor(total_seconds / 60);
  const total_hours = Math.floor(total_minutes / 60);
  const total_days = Math.floor(total_hours / 24);

  const seconds = total_seconds % 60;
  const minutes = total_minutes % 60;
  const hours = total_hours % 24;
  const days = total_days % 365;
  const years = Math.floor(total_days / 365);

  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return {
    _engine: 'real',
    target: targetDate.toISOString(),
    now: now.toISOString(),
    is_past: isPast,
    total_days,
    total_hours,
    total_minutes,
    total_seconds,
    years,
    days,
    hours,
    minutes,
    seconds,
    human: (isPast ? '-' : '') + parts.join(' '),
  };
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
  'sense-ip-info':                senseIpInfo,
  'sense-weather':                senseWeather,
  'sense-system-info':            senseSystemInfo,
  'sense-system-resources':       senseSystemResources,
  'sense-time-convert':           senseTimeConvert,
  'sense-date-diff':              senseDateDiff,
  'sense-date-add':               senseDateAdd,
  'sense-unix-timestamp':         senseUnixTimestamp,
  'sense-calendar-week':          senseCalendarWeek,
  'sense-countdown':              senseCountdown,

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
