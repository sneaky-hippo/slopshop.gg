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
 * Returns a promise that resolves with { statusCode, headers, timing }.
 * @param {string} rawUrl
 * @param {string} method  - HTTP method (HEAD, GET, OPTIONS …)
 * @param {boolean} followRedirects - follow 3xx automatically
 * @param {number} maxRedirects
 */
function makeRequest(rawUrl, method = 'GET', followRedirects = false, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(rawUrl);
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
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Slopshop-NetworkHandler/1.0',
        'Accept': '*/*',
      },
    };

    const start = Date.now();

    const req = lib.request(options, (res) => {
      const timing = Date.now() - start;
      // Drain body so connection can be reused / closed
      res.on('data', () => {});
      res.on('end', () => {});
      resolve({ statusCode: res.statusCode, headers: res.headers, timing, url: rawUrl });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });

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

  const [a, aaaa, mx, txt, ns] = await Promise.all([
    settle(dns.promises.resolve4, domain),
    settle(dns.promises.resolve6, domain),
    settle(dns.promises.resolveMx, domain),
    settle(dns.promises.resolveTxt, domain),
    settle(dns.promises.resolveNs, domain),
  ]);

  result.A    = a    || [];
  result.AAAA = aaaa || [];
  result.MX   = mx   || [];
  result.TXT  = (txt || []).map((r) => r.join(''));
  result.NS   = ns   || [];

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
    const { statusCode, headers, timing } = await makeRequest(input.url, 'HEAD');
    return { _engine: ENGINE, url: input.url, status_code: statusCode, headers, timing_ms: timing };
  } catch (err) {
    return { _engine: ENGINE, error: 'HTTP request failed', message: err.message };
  }
};

const netHttpHeaders = async (input) => {
  try {
    const { statusCode, headers, timing } = await makeRequest(input.url, 'HEAD');
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
    const { statusCode, headers } = await makeRequest(input.url, 'OPTIONS');
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

// ---------------------------------------------------------------------------
// SSL/TLS handlers
// ---------------------------------------------------------------------------

function tlsConnect(hostname, port = 443) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, timeout: DEFAULT_TIMEOUT_MS },
      () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        resolve(cert);
      }
    );
    socket.on('timeout', () => socket.destroy(new Error('TLS connection timed out')));
    socket.on('error', reject);
  });
}

const netSslCheck = async (input) => {
  const hostname = input.host || input.hostname || input.domain;
  const port = input.port || 443;

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

// ---------------------------------------------------------------------------
// WHOIS Lookup
// ---------------------------------------------------------------------------

const netWhois = async ({ domain }) => {
  if (!domain) return { _engine: 'real', error: 'Provide domain' };
  const net = require('net');
  return new Promise((resolve) => {
    const client = net.createConnection({ host: 'whois.iana.org', port: 43 }, () => {
      client.write(domain + '\r\n');
    });
    let data = '';
    client.on('data', (chunk) => { data += chunk.toString(); });
    client.on('end', () => {
      // Parse the refer field to find the right WHOIS server
      const refer = data.match(/refer:\s+(\S+)/i)?.[1];
      if (refer) {
        const client2 = net.createConnection({ host: refer, port: 43 }, () => { client2.write(domain + '\r\n'); });
        let data2 = '';
        client2.on('data', (c) => { data2 += c.toString(); });
        client2.on('end', () => { resolve({ _engine: 'real', domain, whois_server: refer, raw: data2.trim().slice(0, 4000) }); });
        client2.on('error', () => { resolve({ _engine: 'real', domain, raw: data.trim().slice(0, 4000) }); });
        client2.setTimeout(10000, () => { client2.destroy(); resolve({ _engine: 'real', domain, raw: data.trim().slice(0, 4000) }); });
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

  'net-ssl-check':          netSslCheck,
  'net-ssl-expiry':         netSslExpiry,

  'net-email-validate':     netEmailValidate,
  'net-ip-validate':        netIpValidate,
  'net-ip-is-private':      netIpIsPrivate,
  'net-cidr-contains':      netCidrContains,
  'net-domain-validate':    netDomainValidate,

  'net-url-parse':          netUrlParse,
  'net-url-build':          netUrlBuild,
  'net-url-normalize':      netUrlNormalize,

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
