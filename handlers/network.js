'use strict';

const dns = require('dns');
const http = require('http');
const https = require('https');
const url = require('url');
const net = require('net');
const tls = require('tls');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ENGINE = 'real';
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Make an HTTP/HTTPS request with timeout support.
 * Returns a promise resolving with { statusCode, headers, timing, body? }.
 * @param {string} rawUrl
 * @param {string} method  - HTTP method
 * @param {boolean} captureBody - whether to collect the response body
 * @param {object} reqHeaders - extra request headers
 * @param {string|Buffer} reqBody - optional request body
 */
function makeRequest(rawUrl, method = 'GET', captureBody = false, reqHeaders = {}, reqBody = null) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${rawUrl}`));
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    const port = parsedUrl.port
      ? parseInt(parsedUrl.port, 10)
      : (isHttps ? 443 : 80);

    const options = {
      hostname: parsedUrl.hostname,
      port,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'User-Agent': 'Slopshop-NetworkHandler/1.0',
        'Accept': '*/*',
        ...reqHeaders,
      },
    };

    if (reqBody) {
      const bodyBuf = Buffer.isBuffer(reqBody) ? reqBody : Buffer.from(reqBody);
      options.headers['Content-Length'] = bodyBuf.length;
    }

    const start = Date.now();
    let settled = false;

    const req = lib.request(options, (res) => {
      const timing = Date.now() - start;
      if (captureBody) {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          if (settled) return;
          settled = true;
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ statusCode: res.statusCode, headers: res.headers, timing, url: rawUrl, body });
        });
      } else {
        // Drain body so connection can be reused / closed
        res.on('data', () => {});
        res.on('end', () => {
          if (settled) return;
          settled = true;
          resolve({ statusCode: res.statusCode, headers: res.headers, timing, url: rawUrl });
        });
      }
      res.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    });

    // Explicit socket timeout
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      req.destroy(new Error('Request timed out'));
    }, DEFAULT_TIMEOUT_MS);

    req.on('error', (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(err);
    });

    req.on('close', () => clearTimeout(timer));

    if (reqBody) {
      req.write(reqBody);
    }

    req.end();
  });
}

/**
 * Follow redirect chain manually; returns array of { url, statusCode }.
 */
async function followRedirectChain(startUrl, maxRedirects = 10) {
  const chain = [];
  let currentUrl = startUrl;

  for (let i = 0; i <= maxRedirects; i++) {
    let result;
    try {
      result = await makeRequest(currentUrl, 'HEAD', false);
    } catch (err) {
      chain.push({ url: currentUrl, error: err.message });
      break;
    }

    chain.push({ url: currentUrl, statusCode: result.statusCode });

    const isRedirect = [301, 302, 303, 307, 308].includes(result.statusCode);
    if (!isRedirect || !result.headers.location) break;

    // Resolve relative Location headers
    try {
      currentUrl = new URL(result.headers.location, currentUrl).toString();
    } catch (_) {
      chain.push({ url: result.headers.location, error: 'Invalid redirect URL' });
      break;
    }
  }

  return chain;
}

/**
 * Wrap a dns.promises call with a timeout.
 */
async function dnsWithTimeout(fn, ...args) {
  return Promise.race([
    fn(...args),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DNS timeout')), DEFAULT_TIMEOUT_MS)
    ),
  ]);
}

/**
 * Connect TCP socket with timeout; resolves true if open, false if closed/timeout.
 */
function tcpProbe(host, port, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (open) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.connect(port, host, () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

// ---------------------------------------------------------------------------
// DNS handlers
// ---------------------------------------------------------------------------

const netDnsA = async (input) => {
  try {
    const records = await dnsWithTimeout(dns.promises.resolve4, input.domain);
    return { _engine: ENGINE, domain: input.domain, type: 'A', records };
  } catch (err) {
    return { _engine: ENGINE, error: 'DNS resolution failed', message: err.message, code: err.code || 'EUNKNOWN' };
  }
};

const netDnsAAAA = async (input) => {
  try {
    const records = await dnsWithTimeout(dns.promises.resolve6, input.domain);
    return { _engine: ENGINE, domain: input.domain, type: 'AAAA', records };
  } catch (err) {
    return { _engine: ENGINE, error: 'DNS resolution failed', message: err.message, code: err.code || 'EUNKNOWN' };
  }
};

const netDnsMx = async (input) => {
  try {
    const records = await dnsWithTimeout(dns.promises.resolveMx, input.domain);
    return { _engine: ENGINE, domain: input.domain, type: 'MX', records };
  } catch (err) {
    return { _engine: ENGINE, error: 'DNS resolution failed', message: err.message, code: err.code || 'EUNKNOWN' };
  }
};

const netDnsTxt = async (input) => {
  try {
    const records = await dnsWithTimeout(dns.promises.resolveTxt, input.domain);
    // Each TXT record is an array of strings; join each chunk array
    const flat = records.map((r) => r.join(''));
    return { _engine: ENGINE, domain: input.domain, type: 'TXT', records: flat };
  } catch (err) {
    return { _engine: ENGINE, error: 'DNS resolution failed', message: err.message, code: err.code || 'EUNKNOWN' };
  }
};

const netDnsNs = async (input) => {
  try {
    const records = await dnsWithTimeout(dns.promises.resolveNs, input.domain);
    return { _engine: ENGINE, domain: input.domain, type: 'NS', records };
  } catch (err) {
    return { _engine: ENGINE, error: 'DNS resolution failed', message: err.message, code: err.code || 'EUNKNOWN' };
  }
};

const netDnsCname = async (input) => {
  try {
    const records = await dnsWithTimeout(dns.promises.resolveCname, input.domain);
    return { _engine: ENGINE, domain: input.domain, type: 'CNAME', records };
  } catch (err) {
    return { _engine: ENGINE, error: 'DNS resolution failed', message: err.message, code: err.code || 'EUNKNOWN' };
  }
};

const netDnsReverse = async (input) => {
  try {
    const hostnames = await dnsWithTimeout(dns.promises.reverse, input.ip || input.domain);
    return { _engine: ENGINE, ip: input.ip || input.domain, hostnames };
  } catch (err) {
    return { _engine: ENGINE, error: 'Reverse DNS lookup failed', message: err.message, code: err.code || 'EUNKNOWN' };
  }
};

const netDnsAll = async (input) => {
  const { domain } = input;
  const result = { _engine: ENGINE, domain };

  const settle = async (fn, ...args) => {
    try { return await dnsWithTimeout(fn, ...args); } catch (_) { return null; }
  };

  const [a, aaaa, mx, txt, ns, cname] = await Promise.all([
    settle(dns.promises.resolve4, domain),
    settle(dns.promises.resolve6, domain),
    settle(dns.promises.resolveMx, domain),
    settle(dns.promises.resolveTxt, domain),
    settle(dns.promises.resolveNs, domain),
    settle(dns.promises.resolveCname, domain),
  ]);

  result.A     = a     || [];
  result.AAAA  = aaaa  || [];
  result.MX    = mx    || [];
  result.TXT   = (txt  || []).map((r) => r.join(''));
  result.NS    = ns    || [];
  result.CNAME = cname || [];

  return result;
};

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

const HTTP_STATUS_CODES = {100:'Continue',101:'Switching Protocols',200:'OK',201:'Created',202:'Accepted',204:'No Content',301:'Moved Permanently',302:'Found',304:'Not Modified',307:'Temporary Redirect',308:'Permanent Redirect',400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',408:'Request Timeout',409:'Conflict',410:'Gone',413:'Payload Too Large',415:'Unsupported Media Type',422:'Unprocessable Entity',429:'Too Many Requests',500:'Internal Server Error',501:'Not Implemented',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout'};
const HTTP_STATUS_CAT = c => c<200?'Informational':c<300?'Success':c<400?'Redirection':c<500?'Client Error':'Server Error';

const netHttpStatus = async (input) => {
  // If code is provided (no URL), return status code info directly
  if (input.code !== undefined && !input.url) {
    const c = Number(input.code);
    const status = HTTP_STATUS_CODES[c];
    if (status) return { _engine: ENGINE, code: c, status, description: `${c} ${status}`, category: HTTP_STATUS_CAT(c) };
    return { _engine: ENGINE, code: c, status: 'Unknown', description: `${c} Unknown`, category: HTTP_STATUS_CAT(c) };
  }
  try {
    const { statusCode, headers, timing } = await makeRequest(input.url, 'HEAD', false);
    return { _engine: ENGINE, url: input.url, status_code: statusCode, headers, timing_ms: timing };
  } catch (err) {
    return { _engine: ENGINE, error: 'HTTP request failed', message: err.message };
  }
};

const netHttpHeaders = async (input) => {
  try {
    const { statusCode, headers, timing } = await makeRequest(input.url, 'HEAD', false);
    return { _engine: ENGINE, url: input.url, status_code: statusCode, headers, timing_ms: timing };
  } catch (err) {
    return { _engine: ENGINE, error: 'HTTP request failed', message: err.message };
  }
};

const netHttpRedirectChain = async (input) => {
  try {
    const chain = await followRedirectChain(input.url, 10);
    return { _engine: ENGINE, url: input.url, chain, hops: chain.length };
  } catch (err) {
    return { _engine: ENGINE, error: 'Redirect chain failed', message: err.message };
  }
};

const netHttpOptions = async (input) => {
  try {
    const { statusCode, headers } = await makeRequest(input.url, 'OPTIONS', false);
    const allowed = headers['allow'] || headers['Allow'] || null;
    const corsOrigin  = headers['access-control-allow-origin']  || null;
    const corsMethods = headers['access-control-allow-methods'] || null;
    const corsHeaders = headers['access-control-allow-headers'] || null;
    return {
      _engine: ENGINE,
      url: input.url,
      status_code: statusCode,
      allowed_methods: allowed ? allowed.split(',').map((s) => s.trim()) : null,
      cors: {
        allow_origin:  corsOrigin,
        allow_methods: corsMethods,
        allow_headers: corsHeaders,
      },
      raw_headers: headers,
    };
  } catch (err) {
    return { _engine: ENGINE, error: 'OPTIONS request failed', message: err.message };
  }
};

/**
 * net-http-get: Perform a GET request and return status, headers, and body.
 */
const netHttpGet = async (input) => {
  if (!input.url) return { _engine: ENGINE, ok: false, error: 'url is required' };
  try {
    const extraHeaders = input.headers || {};
    const { statusCode, headers, timing, body } = await makeRequest(
      input.url, 'GET', true, extraHeaders
    );
    const maxBody = input.max_body || 4096;
    return {
      _engine: ENGINE,
      url: input.url,
      status_code: statusCode,
      ok: statusCode >= 200 && statusCode < 300,
      headers,
      body: body ? body.slice(0, maxBody) : '',
      body_length: body ? body.length : 0,
      truncated: body ? body.length > maxBody : false,
      timing_ms: timing,
    };
  } catch (err) {
    return { _engine: ENGINE, ok: false, error: 'HTTP GET failed', message: err.message, url: input.url };
  }
};

/**
 * net-http-post: Perform a POST request and return status, headers, and body.
 */
const netHttpPost = async (input) => {
  if (!input.url) return { _engine: ENGINE, ok: false, error: 'url is required' };
  try {
    const extraHeaders = input.headers || {};
    let reqBody = '';
    let contentType = extraHeaders['Content-Type'] || extraHeaders['content-type'] || 'application/json';

    if (input.body !== undefined) {
      if (typeof input.body === 'object') {
        reqBody = JSON.stringify(input.body);
        contentType = 'application/json';
      } else {
        reqBody = String(input.body);
      }
    }

    const mergedHeaders = {
      'Content-Type': contentType,
      ...extraHeaders,
    };

    const { statusCode, headers, timing, body } = await makeRequest(
      input.url, 'POST', true, mergedHeaders, reqBody
    );
    const maxBody = input.max_body || 4096;
    return {
      _engine: ENGINE,
      url: input.url,
      status_code: statusCode,
      ok: statusCode >= 200 && statusCode < 300,
      headers,
      body: body ? body.slice(0, maxBody) : '',
      body_length: body ? body.length : 0,
      truncated: body ? body.length > maxBody : false,
      timing_ms: timing,
    };
  } catch (err) {
    return { _engine: ENGINE, ok: false, error: 'HTTP POST failed', message: err.message, url: input.url };
  }
};

// ---------------------------------------------------------------------------
// SSL/TLS handlers
// ---------------------------------------------------------------------------

/**
 * BUG FIX: original used tls.connect timeout option (not standard for all Node versions).
 * Now uses explicit setTimeout on the socket + destroy path.
 */
function tlsConnect(hostname, port = 443) {
  return new Promise((resolve, reject) => {
    let done = false;
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const cert = socket.getPeerCertificate(true);
        socket.destroy();
        resolve(cert);
      }
    );

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      socket.destroy();
      reject(new Error('TLS connection timed out'));
    }, DEFAULT_TIMEOUT_MS);

    socket.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

const netSslCheck = async (input) => {
  const hostname = input.host || input.hostname || input.domain;
  const port = input.port || 443;

  if (!hostname) {
    return { _engine: ENGINE, error: 'hostname/domain is required' };
  }

  try {
    const cert = await tlsConnect(hostname, port);

    if (!cert || !cert.subject) {
      return { _engine: ENGINE, error: 'No certificate returned', hostname };
    }

    const validFrom = new Date(cert.valid_from);
    const validTo   = new Date(cert.valid_to);
    const now       = new Date();
    const daysRemaining = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));

    return {
      _engine: ENGINE,
      hostname,
      subject: cert.subject,
      issuer:  cert.issuer,
      valid_from:      cert.valid_from,
      valid_to:        cert.valid_to,
      days_remaining:  daysRemaining,
      serial:          cert.serialNumber,
      fingerprint:     cert.fingerprint,
      fingerprint256:  cert.fingerprint256,
      san:             cert.subjectaltname || null,
      is_expired:      daysRemaining < 0,
    };
  } catch (err) {
    return { _engine: ENGINE, error: 'TLS connection failed', message: err.message, hostname };
  }
};

const netSslExpiry = async (input) => {
  const hostname = input.host || input.hostname || input.domain;
  const port = input.port || 443;

  if (!hostname) {
    return { _engine: ENGINE, error: 'hostname/domain is required' };
  }

  try {
    const cert = await tlsConnect(hostname, port);

    if (!cert || !cert.valid_to) {
      return { _engine: ENGINE, error: 'No certificate returned', hostname };
    }

    const validTo = new Date(cert.valid_to);
    const now     = new Date();
    const daysRemaining = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));

    return {
      _engine: ENGINE,
      hostname,
      expiry_date:    cert.valid_to,
      days_remaining: daysRemaining,
      is_expired:     daysRemaining < 0,
    };
  } catch (err) {
    return { _engine: ENGINE, error: 'TLS connection failed', message: err.message, hostname };
  }
};

// ---------------------------------------------------------------------------
// Ping (TCP-based, ICMP not available in sandboxed envs)
// ---------------------------------------------------------------------------

/**
 * net-ping: "ping" a host by probing TCP port 80 (HTTP) and 443 (HTTPS).
 * True ICMP ping requires raw socket privileges not available on Railway.
 * Falls back to TCP reachability check which is functionally equivalent
 * for "is this host alive?" use cases.
 */
const netPing = async (input) => {
  const host = input.host || input.domain || input.ip;
  if (!host) return { _engine: ENGINE, ok: false, error: 'host is required' };

  const probePorts = input.ports ? input.ports : [80, 443];
  const timeoutMs  = Math.min(input.timeout_ms || DEFAULT_TIMEOUT_MS, 10000);

  try {
    const results = await Promise.all(
      probePorts.map(async (port) => {
        const start = Date.now();
        const open  = await tcpProbe(host, port, timeoutMs);
        return { port, open, latency_ms: open ? Date.now() - start : null };
      })
    );

    const reachable = results.some((r) => r.open);

    return {
      _engine: ENGINE,
      host,
      reachable,
      method: 'tcp',
      note: 'ICMP ping requires raw socket privileges unavailable in this environment; TCP probe used.',
      probes: results,
    };
  } catch (err) {
    return { _engine: ENGINE, ok: false, error: 'Ping failed', message: err.message, host };
  }
};

// ---------------------------------------------------------------------------
// Port scan
// ---------------------------------------------------------------------------

const COMMON_PORT_NAMES = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
  80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 465: 'SMTPS',
  587: 'SMTP-submission', 993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL',
  3389: 'RDP', 5432: 'PostgreSQL', 5672: 'AMQP', 6379: 'Redis',
  8080: 'HTTP-alt', 8443: 'HTTPS-alt', 27017: 'MongoDB',
};

/**
 * net-port-scan: scan a list of TCP ports on a host.
 * Defaults to common ports if none supplied. Max 50 ports per call.
 */
const netPortScan = async (input) => {
  const host = input.host || input.domain || input.ip;
  if (!host) return { _engine: ENGINE, ok: false, error: 'host is required' };

  const defaultPorts = [21, 22, 23, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 3306, 3389, 5432, 6379, 8080, 8443];
  let ports = input.ports || defaultPorts;

  if (!Array.isArray(ports)) {
    // Accept comma-separated string or single int
    ports = String(ports).split(',').map((p) => parseInt(p.trim(), 10)).filter(Boolean);
  }

  // Clamp to 50 ports max to avoid abuse
  ports = ports.slice(0, 50);

  const timeoutMs = Math.min(input.timeout_ms || 3000, 10000);

  try {
    const results = await Promise.all(
      ports.map(async (port) => {
        const start = Date.now();
        const open  = await tcpProbe(host, port, timeoutMs);
        return {
          port,
          open,
          service: COMMON_PORT_NAMES[port] || null,
          latency_ms: open ? Date.now() - start : null,
        };
      })
    );

    const openPorts  = results.filter((r) => r.open);
    const closedPorts = results.filter((r) => !r.open);

    return {
      _engine: ENGINE,
      host,
      scanned: ports.length,
      open_count: openPorts.length,
      closed_count: closedPorts.length,
      open: openPorts,
      closed: closedPorts,
      results,
    };
  } catch (err) {
    return { _engine: ENGINE, ok: false, error: 'Port scan failed', message: err.message, host };
  }
};

// ---------------------------------------------------------------------------
// Validation handlers
// ---------------------------------------------------------------------------

/**
 * Validate email format (RFC 5322 simplified) and optionally check MX.
 */
const netEmailValidate = async (input) => {
  const email = input.email || '';
  // Basic RFC 5322 simplified regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  const formatValid = emailRegex.test(email);

  const atIdx  = email.lastIndexOf('@');
  const domain = atIdx !== -1 ? email.slice(atIdx + 1) : null;

  let mxRecords = null;
  let mxValid   = false;
  let mxError   = null;

  if (domain) {
    try {
      mxRecords = await dnsWithTimeout(dns.promises.resolveMx, domain);
      mxValid   = mxRecords.length > 0;
    } catch (err) {
      mxError = err.message;
      mxValid = false;
    }
  }

  return {
    _engine:       ENGINE,
    email,
    format_valid:  formatValid,
    domain,
    mx_valid:      mxValid,
    mx_records:    mxRecords,
    mx_error:      mxError,
    overall_valid: formatValid && mxValid,
  };
};

/**
 * Returns true if the IP falls in RFC 1918 / link-local / loopback private ranges.
 */
function isPrivateIp(ipStr) {
  // IPv4 private ranges
  if (net.isIPv4(ipStr)) {
    const parts = ipStr.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;           // loopback
    if (a === 169 && b === 254) return true; // link-local
    return false;
  }

  // IPv6 private / special ranges
  if (net.isIPv6(ipStr)) {
    const lower = ipStr.toLowerCase();
    if (lower === '::1') return true;                // loopback
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    if (lower.startsWith('fe80')) return true;       // link-local
    return false;
  }

  return false;
}

const netIpValidate = async (input) => {
  const ip = input.ip || '';
  const isV4 = net.isIPv4(ip);
  const isV6 = net.isIPv6(ip);
  const version = isV4 ? 4 : isV6 ? 6 : null;

  return {
    _engine: ENGINE,
    ip,
    is_valid:   isV4 || isV6,
    version,
    is_private: (isV4 || isV6) ? isPrivateIp(ip) : null,
  };
};

const netIpIsPrivate = async (input) => {
  const ip = input.ip || '';
  const isV4 = net.isIPv4(ip);
  const isV6 = net.isIPv6(ip);

  if (!isV4 && !isV6) {
    return { _engine: ENGINE, ip, error: 'Not a valid IP address' };
  }

  return {
    _engine: ENGINE,
    ip,
    is_private: isPrivateIp(ip),
    version: isV4 ? 4 : 6,
  };
};

/**
 * Convert a CIDR string to a { networkInt, maskInt } for IPv4.
 */
function parseCidr(cidr) {
  const [base, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);

  if (net.isIPv4(base)) {
    const ipInt = base.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
    const mask  = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return { family: 4, networkInt: (ipInt & mask) >>> 0, mask };
  }

  return null; // IPv6 CIDR not implemented (complex bigint math omitted for brevity)
}

const netCidrContains = async (input) => {
  const ip   = input.ip   || '';
  const cidr = input.cidr || '';

  if (!net.isIPv4(ip)) {
    return { _engine: ENGINE, error: 'Only IPv4 supported for CIDR check', ip, cidr };
  }

  try {
    const parsed = parseCidr(cidr);
    if (!parsed) {
      return { _engine: ENGINE, error: 'Invalid or unsupported CIDR notation', ip, cidr };
    }

    const ipInt = ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
    const contains = (ipInt & parsed.mask) >>> 0 === parsed.networkInt;

    return { _engine: ENGINE, ip, cidr, contains };
  } catch (err) {
    return { _engine: ENGINE, error: 'CIDR check failed', message: err.message, ip, cidr };
  }
};

const netDomainValidate = async (input) => {
  const domain = input.domain || '';

  // Basic domain syntax check
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  const syntaxValid = domainRegex.test(domain);

  let hasA    = false;
  let hasAAAA = false;
  let hasMx   = false;
  let hasNs   = false;
  let dnsError = null;

  if (syntaxValid) {
    const settle = async (fn, ...args) => {
      try { return await dnsWithTimeout(fn, ...args); } catch (e) { return null; }
    };

    const [a, aaaa, mx, ns] = await Promise.all([
      settle(dns.promises.resolve4,  domain),
      settle(dns.promises.resolve6,  domain),
      settle(dns.promises.resolveMx, domain),
      settle(dns.promises.resolveNs, domain),
    ]);

    hasA    = !!(a    && a.length);
    hasAAAA = !!(aaaa && aaaa.length);
    hasMx   = !!(mx   && mx.length);
    hasNs   = !!(ns   && ns.length);
  } else {
    dnsError = 'Domain syntax invalid; DNS lookup skipped';
  }

  const dnsResolvable = hasA || hasAAAA || hasMx || hasNs;

  return {
    _engine: ENGINE,
    domain,
    syntax_valid:    syntaxValid,
    dns_resolvable:  dnsResolvable,
    has_a:           hasA,
    has_aaaa:        hasAAAA,
    has_mx:          hasMx,
    has_ns:          hasNs,
    dns_error:       dnsError,
    overall_valid:   syntaxValid && dnsResolvable,
  };
};

// ---------------------------------------------------------------------------
// URL handlers
// ---------------------------------------------------------------------------

const netUrlParse = async (input) => {
  try {
    const parsed = new URL(input.url);

    // Collect query params as an object
    const queryParams = {};
    parsed.searchParams.forEach((value, key) => {
      if (Object.prototype.hasOwnProperty.call(queryParams, key)) {
        // Multiple values → array
        if (!Array.isArray(queryParams[key])) {
          queryParams[key] = [queryParams[key]];
        }
        queryParams[key].push(value);
      } else {
        queryParams[key] = value;
      }
    });

    return {
      _engine:   ENGINE,
      url:       input.url,
      protocol:  parsed.protocol,
      username:  parsed.username || null,
      password:  parsed.password || null,
      hostname:  parsed.hostname,
      port:      parsed.port || null,
      pathname:  parsed.pathname,
      search:    parsed.search || null,
      query_params: queryParams,
      hash:      parsed.hash || null,
      origin:    parsed.origin,
      href:      parsed.href,
    };
  } catch (err) {
    return { _engine: ENGINE, error: 'URL parse failed', message: err.message, url: input.url };
  }
};

const netUrlBuild = async (input) => {
  try {
    const {
      protocol = 'https:',
      hostname,
      port,
      pathname = '/',
      query_params,
      hash,
      username,
      password,
    } = input;

    if (!hostname) {
      return { _engine: ENGINE, error: 'hostname is required' };
    }

    const proto = protocol.endsWith(':') ? protocol : protocol + ':';
    const u = new URL(`${proto}//${hostname}`);

    if (port)     u.port     = String(port);
    if (pathname) u.pathname = pathname;
    if (username) u.username = username;
    if (password) u.password = password;
    if (hash)     u.hash     = hash;

    if (query_params && typeof query_params === 'object') {
      Object.entries(query_params).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          v.forEach((val) => u.searchParams.append(k, val));
        } else {
          u.searchParams.set(k, v);
        }
      });
    }

    return { _engine: ENGINE, url: u.toString() };
  } catch (err) {
    return { _engine: ENGINE, error: 'URL build failed', message: err.message };
  }
};

const netUrlNormalize = async (input) => {
  try {
    const parsed = new URL(input.url);

    // Lowercase scheme + host (URL already does this)
    // Remove default port
    const defaultPorts = { 'http:': '80', 'https:': '443', 'ftp:': '21' };
    if (parsed.port === defaultPorts[parsed.protocol]) {
      parsed.port = '';
    }

    // Sort query params
    parsed.searchParams.sort();

    // Remove trailing slash from pathname if it's the only character after hostname
    // (keep if there's a real path)
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.replace(/\/+$/, '');
      parsed.pathname = pathname;
    }

    return {
      _engine:    ENGINE,
      original:   input.url,
      normalized: parsed.toString(),
    };
  } catch (err) {
    return { _engine: ENGINE, error: 'URL normalize failed', message: err.message, url: input.url };
  }
};

/**
 * net-url-expand: follow redirects on a (possibly shortened) URL and return
 * the final destination URL plus the full redirect chain.
 */
const netUrlExpand = async (input) => {
  if (!input.url) return { _engine: ENGINE, ok: false, error: 'url is required' };

  // Ensure the URL has a protocol
  let startUrl = input.url;
  if (!/^https?:\/\//i.test(startUrl)) {
    startUrl = 'https://' + startUrl;
  }

  try {
    const chain = await followRedirectChain(startUrl, 15);
    const last  = chain[chain.length - 1];
    const finalUrl = last && !last.error ? last.url : null;
    const wasRedirected = chain.length > 1;

    return {
      _engine: ENGINE,
      original_url: input.url,
      final_url:    finalUrl,
      was_redirected: wasRedirected,
      hops: chain.length,
      chain,
    };
  } catch (err) {
    return { _engine: ENGINE, ok: false, error: 'URL expand failed', message: err.message, url: input.url };
  }
};

// ---------------------------------------------------------------------------
// IP Geolocation (ipapi.co — free, no key required, 1k req/day)
// ---------------------------------------------------------------------------

/**
 * net-ip-geolocation: get geo info for an IP address.
 * Uses ipapi.co free tier (no API key needed, 1000 req/day).
 * Falls back to pure IP math for RFC 1918 / special ranges.
 */
const netIpGeolocation = async (input) => {
  const ip = input.ip || '';

  if (!ip) return { _engine: ENGINE, ok: false, error: 'ip is required' };

  const isV4 = net.isIPv4(ip);
  const isV6 = net.isIPv6(ip);

  if (!isV4 && !isV6) {
    return { _engine: ENGINE, ok: false, error: 'Invalid IP address', ip };
  }

  // Short-circuit for private/loopback IPs — no geo data possible
  if (isPrivateIp(ip)) {
    return {
      _engine: ENGINE,
      ip,
      is_private: true,
      country: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      isp: null,
      org: null,
      note: 'Private/reserved IP — no geolocation data available',
    };
  }

  try {
    const { statusCode, body } = await makeRequest(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      'GET', true,
      { 'User-Agent': 'Slopshop-NetworkHandler/1.0' }
    );

    if (statusCode !== 200) {
      return { _engine: ENGINE, ok: false, error: `Geo API returned ${statusCode}`, ip };
    }

    let geo;
    try {
      geo = JSON.parse(body);
    } catch (_) {
      return { _engine: ENGINE, ok: false, error: 'Failed to parse geo response', ip };
    }

    if (geo.error) {
      return { _engine: ENGINE, ok: false, error: geo.reason || 'Geo lookup failed', ip };
    }

    return {
      _engine: ENGINE,
      ip,
      is_private: false,
      country:        geo.country_name || null,
      country_code:   geo.country_code || null,
      region:         geo.region       || null,
      region_code:    geo.region_code  || null,
      city:           geo.city         || null,
      postal:         geo.postal       || null,
      latitude:       geo.latitude     || null,
      longitude:      geo.longitude    || null,
      timezone:       geo.timezone     || null,
      utc_offset:     geo.utc_offset   || null,
      isp:            geo.org          || null,
      asn:            geo.asn          || null,
    };
  } catch (err) {
    return { _engine: ENGINE, ok: false, error: 'Geo lookup failed', message: err.message, ip };
  }
};

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

/**
 * Parse a robots.txt body into structured form.
 */
function parseRobotsTxt(body) {
  const lines  = body.split(/\r?\n/);
  const groups = [];
  let current  = null;
  const sitemaps = [];

  for (const raw of lines) {
    const line = raw.split('#')[0].trim(); // strip comments
    if (!line) {
      if (current) { groups.push(current); current = null; }
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === 'user-agent') {
      if (!current || current.disallow.length > 0 || current.allow.length > 0) {
        if (current) groups.push(current);
        current = { user_agents: [], allow: [], disallow: [], crawl_delay: null };
      }
      if (current) current.user_agents.push(value);
    } else if (field === 'disallow' && current) {
      if (value) current.disallow.push(value);
    } else if (field === 'allow' && current) {
      if (value) current.allow.push(value);
    } else if (field === 'crawl-delay' && current) {
      current.crawl_delay = parseFloat(value) || null;
    } else if (field === 'sitemap') {
      sitemaps.push(value);
    }
  }

  if (current) groups.push(current);

  // Find wildcard rule
  const wildcardGroup = groups.find((g) => g.user_agents.includes('*'));

  return {
    groups,
    sitemaps,
    wildcard_disallow: wildcardGroup ? wildcardGroup.disallow : [],
    wildcard_allow:    wildcardGroup ? wildcardGroup.allow    : [],
  };
}

/**
 * net-robots-txt: fetch and parse robots.txt for a domain or URL.
 */
const netRobotsTxt = async (input) => {
  let targetUrl = input.url || input.domain;
  if (!targetUrl) return { _engine: ENGINE, ok: false, error: 'url or domain is required' };

  // Normalize to a robots.txt URL
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  let baseUrl;
  try {
    baseUrl = new URL(targetUrl);
  } catch (_) {
    return { _engine: ENGINE, ok: false, error: 'Invalid URL', url: targetUrl };
  }

  const robotsUrl = `${baseUrl.protocol}//${baseUrl.host}/robots.txt`;

  try {
    const { statusCode, body } = await makeRequest(robotsUrl, 'GET', true);

    if (statusCode === 404) {
      return {
        _engine: ENGINE,
        url: robotsUrl,
        found: false,
        status_code: 404,
        note: 'robots.txt not found — all paths allowed by convention',
      };
    }

    if (statusCode !== 200) {
      return { _engine: ENGINE, ok: false, error: `robots.txt returned HTTP ${statusCode}`, url: robotsUrl };
    }

    const parsed = parseRobotsTxt(body);

    return {
      _engine: ENGINE,
      url: robotsUrl,
      found: true,
      status_code: statusCode,
      raw: body.slice(0, 8192),
      ...parsed,
    };
  } catch (err) {
    return { _engine: ENGINE, ok: false, error: 'robots.txt fetch failed', message: err.message, url: robotsUrl };
  }
};

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

/**
 * Very lightweight XML-to-object parser for sitemaps — no external deps.
 * Handles <urlset> (regular) and <sitemapindex> (sitemap of sitemaps).
 */
function parseSitemap(xml) {
  const isSitemapIndex = /<sitemapindex/i.test(xml);
  const urls = [];

  if (isSitemapIndex) {
    // Extract <sitemap><loc>...</loc>...</sitemap> entries
    const sitemapRe = /<sitemap>([\s\S]*?)<\/sitemap>/gi;
    let m;
    while ((m = sitemapRe.exec(xml)) !== null) {
      const locMatch = /<loc>([\s\S]*?)<\/loc>/i.exec(m[1]);
      const lastmod  = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(m[1]);
      if (locMatch) {
        urls.push({
          loc:     locMatch[1].trim(),
          lastmod: lastmod ? lastmod[1].trim() : null,
          type:    'sitemap',
        });
      }
    }
    return { type: 'sitemapindex', urls };
  }

  // Regular urlset
  const urlRe = /<url>([\s\S]*?)<\/url>/gi;
  let m;
  while ((m = urlRe.exec(xml)) !== null) {
    const locMatch      = /<loc>([\s\S]*?)<\/loc>/i.exec(m[1]);
    const lastmod       = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(m[1]);
    const changefreq    = /<changefreq>([\s\S]*?)<\/changefreq>/i.exec(m[1]);
    const priority      = /<priority>([\s\S]*?)<\/priority>/i.exec(m[1]);
    if (locMatch) {
      urls.push({
        loc:        locMatch[1].trim(),
        lastmod:    lastmod     ? lastmod[1].trim()     : null,
        changefreq: changefreq  ? changefreq[1].trim()  : null,
        priority:   priority    ? parseFloat(priority[1]) : null,
      });
    }
  }

  return { type: 'urlset', urls };
}

/**
 * net-sitemap: fetch and parse sitemap.xml for a domain or URL.
 * Checks /sitemap.xml and /sitemap_index.xml. Also parses Sitemap: lines from robots.txt.
 */
const netSitemap = async (input) => {
  let targetUrl = input.url || input.domain;
  if (!targetUrl) return { _engine: ENGINE, ok: false, error: 'url or domain is required' };

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  let baseUrl;
  try {
    baseUrl = new URL(targetUrl);
  } catch (_) {
    return { _engine: ENGINE, ok: false, error: 'Invalid URL', url: targetUrl };
  }

  const base = `${baseUrl.protocol}//${baseUrl.host}`;

  // Check robots.txt for a Sitemap: directive first
  let sitemapUrl = input.url && /sitemap/i.test(input.url) ? input.url : null;

  if (!sitemapUrl) {
    try {
      const { statusCode, body } = await makeRequest(`${base}/robots.txt`, 'GET', true);
      if (statusCode === 200) {
        const sitemapLine = body.match(/^Sitemap:\s*(\S+)/im);
        if (sitemapLine) sitemapUrl = sitemapLine[1];
      }
    } catch (_) { /* ignore */ }
  }

  const candidates = sitemapUrl
    ? [sitemapUrl]
    : [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`];

  for (const candidate of candidates) {
    try {
      const { statusCode, body } = await makeRequest(candidate, 'GET', true);

      if (statusCode === 200 && body.trim().startsWith('<')) {
        const parsed   = parseSitemap(body);
        const maxUrls  = input.max_urls || 100;

        return {
          _engine: ENGINE,
          url: candidate,
          found: true,
          status_code: statusCode,
          sitemap_type: parsed.type,
          url_count: parsed.urls.length,
          urls: parsed.urls.slice(0, maxUrls),
          truncated: parsed.urls.length > maxUrls,
        };
      }
    } catch (_) { /* try next */ }
  }

  return {
    _engine: ENGINE,
    url: candidates[0],
    found: false,
    note: 'No sitemap found at /sitemap.xml or /sitemap_index.xml',
  };
};

// ---------------------------------------------------------------------------
// WHOIS Lookup — fixed: inner client2 timeout now resolves with data2, not data
// ---------------------------------------------------------------------------

const netWhois = async ({ domain }) => {
  if (!domain) return { _engine: 'real', error: 'Provide domain' };
  const netMod = require('net'); // use local alias to avoid shadowing outer `net`
  return new Promise((resolve) => {
    const client = netMod.createConnection({ host: 'whois.iana.org', port: 43 }, () => {
      client.write(domain + '\r\n');
    });
    let data = '';
    client.on('data', (chunk) => { data += chunk.toString(); });
    client.on('end', () => {
      // Parse the refer field to find the right WHOIS server
      const refer = data.match(/refer:\s+(\S+)/i)?.[1];
      if (refer) {
        const client2 = netMod.createConnection({ host: refer, port: 43 }, () => {
          client2.write(domain + '\r\n');
        });
        let data2 = '';
        client2.on('data', (c) => { data2 += c.toString(); });
        // BUG FIX: was resolving with `data` (IANA raw) instead of `data2` (registrar raw)
        client2.on('end', () => {
          resolve({ _engine: 'real', domain, whois_server: refer, raw: data2.trim().slice(0, 4000) });
        });
        client2.on('error', (e) => {
          resolve({ _engine: 'real', domain, whois_server: refer, error: e.message, raw: data.trim().slice(0, 4000) });
        });
        // BUG FIX: was resolving with `data` (IANA) on timeout; should be `data2`
        client2.setTimeout(10000, () => {
          client2.destroy();
          resolve({ _engine: 'real', domain, whois_server: refer, raw: data2.trim().slice(0, 4000) || data.trim().slice(0, 4000) });
        });
      } else {
        resolve({ _engine: 'real', domain, raw: data.trim().slice(0, 4000) });
      }
    });
    client.on('error', (e) => { resolve({ _engine: 'real', domain, error: e.message }); });
    client.setTimeout(10000, () => { client.destroy(); resolve({ _engine: 'real', domain, error: 'Timeout' }); });
  });
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  'net-dns-a':              netDnsA,
  'net-dns-aaaa':           netDnsAAAA,
  'net-dns-mx':             netDnsMx,
  'net-dns-txt':            netDnsTxt,
  'net-dns-ns':             netDnsNs,
  'net-dns-cname':          netDnsCname,
  'net-dns-reverse':        netDnsReverse,
  'net-dns-all':            netDnsAll,

  'net-http-status':        netHttpStatus,
  'net-http-headers':       netHttpHeaders,
  'net-http-redirect-chain': netHttpRedirectChain,
  'net-http-options':       netHttpOptions,
  'net-http-get':           netHttpGet,
  'net-http-post':          netHttpPost,

  'net-ssl-check':          netSslCheck,
  'net-ssl-expiry':         netSslExpiry,

  'net-ping':               netPing,
  'net-port-scan':          netPortScan,

  'net-email-validate':     netEmailValidate,
  'net-ip-validate':        netIpValidate,
  'net-ip-is-private':      netIpIsPrivate,
  'net-ip-geolocation':     netIpGeolocation,
  'net-cidr-contains':      netCidrContains,
  'net-domain-validate':    netDomainValidate,

  'net-url-parse':          netUrlParse,
  'net-url-build':          netUrlBuild,
  'net-url-normalize':      netUrlNormalize,
  'net-url-expand':         netUrlExpand,

  'net-robots-txt':         netRobotsTxt,
  'net-sitemap':            netSitemap,

  'net-whois':              netWhois,

  'sense-ct-logs': async ({ domain }) => {
    if (!domain) return { _engine: 'real', error: 'Provide domain' };
    const https = require('https');
    return new Promise((resolve) => {
      const req = https.get(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, { timeout: 15000 }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const certs = JSON.parse(data).slice(0, 50);
            const domains = [...new Set(certs.map(c => c.name_value).flatMap(n => n.split('\n')))];
            resolve({ _engine: 'real', domain, certificates: certs.length, unique_domains: domains.length, domains: domains.slice(0, 100), source: 'crt.sh' });
          } catch(e) { resolve({ _engine: 'real', domain, error: 'Could not parse CT data', raw: data.slice(0, 500) }); }
        });
      });
      req.on('error', e => resolve({ _engine: 'real', domain, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ _engine: 'real', domain, error: 'Timeout' }); });
    });
  },
};
