'use strict';

// ─── vision.js ───────────────────────────────────────────────────────────────
// Vision & media processing handlers for Slopshop.
// All handlers accept EITHER:
//   - data_b64: raw base64 string (with or without data: URI prefix)
//   - url: HTTP(S) URL to fetch (10 s AbortController timeout)
// Optional deps (sharp, canvas, puppeteer, qrcode, jsqr, bwip-js, pdf2pic)
// degrade gracefully — each handler returns a structured fallback if the lib
// is not installed.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const https = require('https');
const http = require('http');

// ─── Lazy-load optional deps ─────────────────────────────────────────────────
let _sharp = null;
let _qrcode = null;
let _jsqr = null;
let _bwip = null;

function trySharp() {
  if (_sharp === null) {
    try { _sharp = require('sharp'); } catch (_) { _sharp = false; }
  }
  return _sharp || null;
}
function tryQrcode() {
  if (_qrcode === null) {
    try { _qrcode = require('qrcode'); } catch (_) { _qrcode = false; }
  }
  return _qrcode || null;
}
function tryJsqr() {
  if (_jsqr === null) {
    try { _jsqr = require('jsqr'); } catch (_) { _jsqr = false; }
  }
  return _jsqr || null;
}
function tryBwip() {
  if (_bwip === null) {
    try { _bwip = require('bwip-js'); } catch (_) { _bwip = false; }
  }
  return _bwip || null;
}

// ─── URL fetch helper (10 s timeout, follows redirects, returns Buffer) ───────
async function fetchImageBuffer(url) {
  // Use native fetch (Node 18+) with AbortController
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Slopshop-Vision/1.0' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    const arrayBuf = await resp.arrayBuffer();
    return Buffer.from(arrayBuf);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Resolve input to Buffer: handles url / data_b64 / data URI prefix ────────
async function resolveBuffer(input) {
  if (input.url && typeof input.url === 'string') {
    return fetchImageBuffer(input.url);
  }
  // Accept data_b64 with or without "data:...;base64," prefix
  let b64 = String(input.data_b64 || input.data || '');
  const commaIdx = b64.indexOf(',');
  if (b64.startsWith('data:') && commaIdx !== -1) {
    b64 = b64.slice(commaIdx + 1);
  }
  return Buffer.from(b64, 'base64');
}

// ─── Detect image format from magic bytes ────────────────────────────────────
function detectFormat(buf) {
  if (buf.length < 2) return 'unknown';
  const magic4 = buf.length >= 4 ? buf.slice(0, 4).toString('hex') : '';
  const magic2 = buf.slice(0, 2).toString('hex');
  if (magic4.startsWith('89504e47')) return 'png';
  if (magic2 === 'ffd8') return 'jpeg';
  if (magic4.startsWith('47494638')) return 'gif';
  if (magic4.startsWith('25504446')) return 'pdf';
  if (magic4.startsWith('52494646') && buf.length >= 12 && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (magic4.startsWith('504b0304')) return 'zip';
  if (magic4.startsWith('1a45dfa3')) return 'webm';
  return 'unknown';
}

// ─── Parse PNG/JPEG dimensions without sharp ─────────────────────────────────
function parseDimensions(buf, format) {
  try {
    if (format === 'png' && buf.length >= 24) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (format === 'jpeg') {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if ((marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        if (i + 3 < buf.length) {
          const len = buf.readUInt16BE(i + 2);
          i += 2 + len;
        } else break;
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

const handlers = {};

// ─── VISION / MULTIMODAL ─────────────────────────────────────────────────────

// BUG FIX: was ignoring `url` input entirely — now resolves URL first
handlers['vision-base64-info'] = async (input) => {
  const buf = await resolveBuffer(input);
  const size = buf.length;

  const format = detectFormat(buf);
  const mime_map = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', pdf: 'application/pdf', webp: 'image/webp', zip: 'application/zip', webm: 'video/webm' };
  const mime_type_detected = mime_map[format] || 'application/octet-stream';

  const sha256_hash = crypto.createHash('sha256').update(buf).digest('hex');
  const first_100_bytes_hex = buf.slice(0, 100).toString('hex');
  const dims = parseDimensions(buf, format);

  return {
    file_size_bytes: size,
    mime_type_detected,
    sha256_hash,
    first_100_bytes_hex,
    dimensions: dims,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-extract-text'] = async (input) => {
  let text = '';
  if (input.text) {
    text = input.text;
  } else {
    const buf = await resolveBuffer(input);
    text = buf.toString('latin1');
  }

  const runs = text.match(/[ -~]{3,}/g) || [];
  const text_blocks = runs.map(r => r.trim()).filter(r => r.length > 0);

  const joined = text_blocks.join(' ');
  const words = joined.split(/\s+/).filter(w => w.length > 0);
  const char_count = joined.replace(/\s/g, '').length;
  const has_numbers = /\d/.test(joined);
  const has_emails = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(joined);
  const has_urls = /https?:\/\/[^\s]+/.test(joined);

  return {
    text_blocks,
    word_count: words.length,
    char_count,
    has_numbers,
    has_emails,
    has_urls,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

// BUG FIX 1: was ignoring `url` input — returned empty hash for URL
// BUG FIX 2: data URI prefix not stripped — Buffer.from("data:image/png;base64,AAAA") produced garbage
handlers['vision-image-hash'] = async (input) => {
  const buf = await resolveBuffer(input);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  const format = detectFormat(buf);

  // Perceptual hash: downsample to 8x8 greyscale buckets from raw bytes, compute DCT-like pHash
  // Works on raw bytes as a heuristic when no sharp is available
  let phash = null;
  const sharp = trySharp();
  if (sharp) {
    try {
      const raw = await sharp(buf).resize(8, 8).greyscale().raw().toBuffer();
      const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
      phash = raw.map(v => (v >= mean ? '1' : '0')).join('');
    } catch (_) { /* fallback below */ }
  }
  if (!phash) {
    // Byte-sampling fallback: sample 64 evenly-spaced bytes
    const samples = [];
    const step = Math.max(1, Math.floor(buf.length / 64));
    for (let i = 0; i < 64; i++) samples.push(buf[Math.min(i * step, buf.length - 1)] || 0);
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    phash = samples.map(v => (v >= mean ? '1' : '0')).join('');
  }

  return { sha256, md5, phash, size_bytes: buf.length, format };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-screenshot-diff'] = async (input) => {
  const before = Buffer.from(input.before_b64 || '', 'base64');
  const after = Buffer.from(input.after_b64 || '', 'base64');

  const len = Math.min(before.length, after.length);
  let diff_bytes = 0;
  for (let i = 0; i < len; i++) {
    if (before[i] !== after[i]) diff_bytes++;
  }
  diff_bytes += Math.abs(before.length - after.length);

  const total_bytes = Math.max(before.length, after.length);
  const diff_percent = total_bytes > 0 ? (diff_bytes / total_bytes) * 100 : 0;
  const changed_significantly = diff_percent > 5;
  const identical = diff_bytes === 0 && before.length === after.length;

  return {
    diff_bytes,
    diff_percent: Math.round(diff_percent * 100) / 100,
    changed_significantly,
    identical,
    before_size_bytes: before.length,
    after_size_bytes: after.length,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-metadata-strip'] = async (input) => {
  const buf = await resolveBuffer(input);

  const magic2 = buf.length >= 2 ? buf.slice(0, 2).toString('hex') : '';
  if (magic2 !== 'ffd8') {
    return {
      has_exif: false,
      exif_size_bytes: 0,
      clean_image_b64: buf.toString('base64'),
      detected_markers: [],
      note: 'Not a JPEG file; EXIF/metadata detection only supported for JPEG',
    };
  }

  const detected_markers = [];
  let has_exif = false;
  let exif_size_bytes = 0;
  let i = 2;

  while (i < buf.length - 3) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const markerHex = 'FF' + marker.toString(16).toUpperCase().padStart(2, '0');

    if (marker === 0xe1) {
      const segLen = buf.readUInt16BE(i + 2);
      has_exif = true;
      exif_size_bytes += segLen;
      detected_markers.push({ marker: markerHex, name: 'EXIF/XMP (APP1)', offset: i, size: segLen });
      i += 2 + segLen;
    } else if (marker === 0xe0) {
      const segLen = buf.readUInt16BE(i + 2);
      detected_markers.push({ marker: markerHex, name: 'JFIF (APP0)', offset: i, size: segLen });
      i += 2 + segLen;
    } else if (marker === 0xda) {
      detected_markers.push({ marker: markerHex, name: 'SOS (Start of Scan)', offset: i });
      break;
    } else if (marker === 0xd9) {
      detected_markers.push({ marker: markerHex, name: 'EOI (End of Image)', offset: i });
      break;
    } else if (i + 3 < buf.length && marker >= 0xe2 && marker <= 0xef) {
      const segLen = buf.readUInt16BE(i + 2);
      detected_markers.push({ marker: markerHex, name: `APP${marker - 0xe0}`, offset: i, size: segLen });
      i += 2 + segLen;
    } else if (i + 3 < buf.length) {
      try {
        const segLen = buf.readUInt16BE(i + 2);
        i += 2 + (segLen > 0 ? segLen : 1);
      } catch (_) { break; }
    } else break;
  }

  // Strip EXIF (APP1) segments using sharp if available
  let clean_image_b64 = buf.toString('base64');
  const sharp = trySharp();
  if (sharp && has_exif) {
    try {
      const stripped = await sharp(buf).withMetadata({}).toBuffer();
      clean_image_b64 = stripped.toString('base64');
    } catch (_) { /* fallback to original */ }
  }

  return {
    has_exif,
    exif_size_bytes,
    clean_image_b64,
    detected_markers,
    note: has_exif && !trySharp()
      ? 'clean_image_b64 is original — install sharp for actual EXIF stripping'
      : has_exif
        ? 'EXIF stripped via sharp'
        : 'No EXIF found',
  };
};

// ─────────────────────────────────────────────────────────────────────────────

// BUG FIX: vision-color-palette was ignoring `url` input — returned empty palette
// IMPROVEMENT: strip data URI prefix before decode, use URL fetch with timeout
handlers['vision-color-palette'] = async (input) => {
  const buf = await resolveBuffer(input);

  if (buf.length < 10) {
    return { palette: [], dominant_color_hex: '#000000', note: 'Insufficient image data' };
  }

  const N = Math.max(1, Math.floor(buf.length / 300));
  const samples = [];
  for (let i = 0; i + 2 < buf.length; i += N) {
    samples.push([buf[i], buf[i + 1], buf[i + 2]]);
  }

  const K = 5;
  let centroids = [];
  for (let k = 0; k < K; k++) {
    const v = Math.round((k / (K - 1)) * 255);
    centroids.push([v, v, v]);
  }

  for (let iter = 0; iter < 10; iter++) {
    const clusters = Array.from({ length: K }, () => []);
    for (const s of samples) {
      let best = 0;
      let bestDist = Infinity;
      for (let k = 0; k < K; k++) {
        const dr = s[0] - centroids[k][0];
        const dg = s[1] - centroids[k][1];
        const db = s[2] - centroids[k][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; best = k; }
      }
      clusters[best].push(s);
    }
    for (let k = 0; k < K; k++) {
      if (clusters[k].length === 0) continue;
      const sum = clusters[k].reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]);
      centroids[k] = [
        Math.round(sum[0] / clusters[k].length),
        Math.round(sum[1] / clusters[k].length),
        Math.round(sum[2] / clusters[k].length),
      ];
    }
  }

  const freq = new Array(K).fill(0);
  for (const s of samples) {
    let best = 0;
    let bestDist = Infinity;
    for (let k = 0; k < K; k++) {
      const dr = s[0] - centroids[k][0];
      const dg = s[1] - centroids[k][1];
      const db = s[2] - centroids[k][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) { bestDist = dist; best = k; }
    }
    freq[best]++;
  }

  const total = samples.length || 1;
  const toHex = (r, g, b) =>
    '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

  const palette = centroids.map((c, k) => ({
    r: c[0], g: c[1], b: c[2],
    hex: toHex(c[0], c[1], c[2]),
    frequency_percent: Math.round((freq[k] / total) * 10000) / 100,
  })).sort((a, b) => b.frequency_percent - a.frequency_percent);

  return {
    palette,
    dominant_color_hex: palette[0] ? palette[0].hex : '#000000',
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-text-boxes'] = async (input) => {
  let text_blocks = [];

  if (Array.isArray(input.text_blocks)) {
    text_blocks = input.text_blocks;
  } else {
    const buf = await resolveBuffer(input);
    const text = buf.toString('latin1');
    const runs = text.match(/[ -~]{3,}/g) || [];
    text_blocks = runs.map(r => r.trim()).filter(r => r.length > 0);
  }

  const URL_RE = /https?:\/\/[^\s]+/;
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
  const CODE_RE = /[{};()=><[\]\\|]|function |const |var |let |def |import |#include/;
  const NUMBER_BLOCK_RE = /^[\d\s\-+.,()$%]+$/;
  const HEADING_RE = /^[A-Z0-9 :!?.-]{3,80}$/;

  const sections = text_blocks.map(block => {
    const words = block.split(/\s+/).filter(w => w.length > 0);
    let type = 'paragraph';
    if (URL_RE.test(block)) type = 'url';
    else if (EMAIL_RE.test(block)) type = 'email';
    else if (CODE_RE.test(block)) type = 'code';
    else if (NUMBER_BLOCK_RE.test(block)) type = 'number';
    else if (words.length <= 8 && HEADING_RE.test(block)) type = 'heading';

    return { type, content: block, word_count: words.length };
  });

  return { sections };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-image-metadata — extract dimensions, format, file size, color depth
// Accepts url or data_b64
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-image-metadata'] = async (input) => {
  const buf = await resolveBuffer(input);
  const format = detectFormat(buf);
  const dims = parseDimensions(buf, format);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  const mime_map = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', pdf: 'application/pdf', webp: 'image/webp' };
  const mime_type = mime_map[format] || 'application/octet-stream';

  let extra = {};
  const sharp = trySharp();
  if (sharp) {
    try {
      const meta = await sharp(buf).metadata();
      extra = {
        channels: meta.channels,
        depth: meta.depth,
        density: meta.density,
        has_alpha: meta.hasAlpha,
        color_space: meta.space,
        orientation: meta.orientation,
        exif_present: !!meta.exif,
        icc_present: !!meta.icc,
      };
      if (meta.width && meta.height) {
        dims.width = meta.width;
        dims.height = meta.height;
      }
    } catch (_) { /* ignore */ }
  }

  return {
    format,
    mime_type,
    file_size_bytes: buf.length,
    dimensions: dims,
    sha256,
    ...extra,
    engine: sharp ? 'sharp' : 'heuristic',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-image-resize — resize image to given dimensions
// Requires sharp; graceful fallback if not available
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-image-resize'] = async (input) => {
  const sharp = trySharp();
  if (!sharp) {
    return {
      ok: false,
      error: 'sharp not installed',
      note: 'Install sharp (npm install sharp) to enable image resizing',
    };
  }

  const buf = await resolveBuffer(input);
  const width = parseInt(input.width) || null;
  const height = parseInt(input.height) || null;
  const fit = input.fit || 'cover'; // cover | contain | fill | inside | outside
  const format_out = (input.format || 'jpeg').toLowerCase();

  if (!width && !height) {
    return { ok: false, error: 'Provide at least one of: width, height' };
  }

  let pipeline = sharp(buf).resize(width, height, { fit });
  if (format_out === 'png') pipeline = pipeline.png();
  else if (format_out === 'webp') pipeline = pipeline.webp({ quality: parseInt(input.quality) || 85 });
  else pipeline = pipeline.jpeg({ quality: parseInt(input.quality) || 85 });

  const outBuf = await pipeline.toBuffer();
  const meta = await sharp(outBuf).metadata();

  return {
    ok: true,
    data_b64: outBuf.toString('base64'),
    format: format_out,
    width: meta.width,
    height: meta.height,
    size_bytes: outBuf.length,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-image-thumbnail — create a thumbnail (default 128x128)
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-image-thumbnail'] = async (input) => {
  const sharp = trySharp();
  if (!sharp) {
    return {
      ok: false,
      error: 'sharp not installed',
      note: 'Install sharp (npm install sharp) to enable thumbnail generation',
    };
  }

  const buf = await resolveBuffer(input);
  const size = parseInt(input.size) || 128;
  const format_out = (input.format || 'jpeg').toLowerCase();
  const quality = parseInt(input.quality) || 80;

  let pipeline = sharp(buf).resize(size, size, { fit: 'cover', position: 'centre' });
  if (format_out === 'png') pipeline = pipeline.png({ compressionLevel: 7 });
  else if (format_out === 'webp') pipeline = pipeline.webp({ quality });
  else pipeline = pipeline.jpeg({ quality });

  const outBuf = await pipeline.toBuffer();

  return {
    ok: true,
    data_b64: outBuf.toString('base64'),
    data_uri: `data:image/${format_out};base64,${outBuf.toString('base64')}`,
    format: format_out,
    size,
    size_bytes: outBuf.length,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-ocr — extract text from image using Claude vision API
// Falls back to byte-scanning heuristic if no API key
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-ocr'] = async (input) => {
  const buf = await resolveBuffer(input);
  const format = detectFormat(buf);
  const imageMediaType = format === 'png' ? 'image/png' : format === 'gif' ? 'image/gif' : format === 'webp' ? 'image/webp' : 'image/jpeg';

  // Try Claude vision API if key available
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: imageMediaType, data: buf.toString('base64') },
              },
              {
                type: 'text',
                text: 'Extract all visible text from this image. Return only the raw text content, preserving line breaks. If there is no text, return an empty string.',
              },
            ],
          }],
        }),
      });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        const text = data.content?.[0]?.text || '';
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        return {
          ok: true,
          text,
          lines,
          line_count: lines.length,
          char_count: text.length,
          engine: 'claude-vision',
        };
      }
    } catch (_) { /* fall through */ }
  }

  // Heuristic fallback: extract printable ASCII runs
  const text = buf.toString('latin1');
  const runs = text.match(/[ -~]{4,}/g) || [];
  const text_blocks = runs.map(r => r.trim()).filter(r => r.length >= 3 && !/^[\x00-\x1f]+$/.test(r));
  const joined = text_blocks.join('\n');

  return {
    ok: true,
    text: joined,
    lines: text_blocks,
    line_count: text_blocks.length,
    char_count: joined.length,
    engine: 'heuristic',
    note: 'Set ANTHROPIC_API_KEY for accurate OCR via Claude vision',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-data-uri — fetch URL or decode b64 and return as data URI
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-data-uri'] = async (input) => {
  const buf = await resolveBuffer(input);
  const format = detectFormat(buf);
  const mime_map = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
  const mime_type = input.mime_type || mime_map[format] || 'application/octet-stream';
  const b64 = buf.toString('base64');
  const data_uri = `data:${mime_type};base64,${b64}`;

  return {
    data_uri,
    mime_type,
    format,
    size_bytes: buf.length,
    data_uri_length: data_uri.length,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-image-compare — compare two images and return similarity score
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-image-compare'] = async (input) => {
  // Accept url_a/url_b or data_b64_a/data_b64_b
  const bufA = await resolveBuffer({ url: input.url_a, data_b64: input.data_b64_a });
  const bufB = await resolveBuffer({ url: input.url_b, data_b64: input.data_b64_b });

  const hashA = crypto.createHash('sha256').update(bufA).digest('hex');
  const hashB = crypto.createHash('sha256').update(bufB).digest('hex');
  const identical = hashA === hashB;

  // Compute pHash for both
  function computePhash(buf) {
    const step = Math.max(1, Math.floor(buf.length / 64));
    const samples = [];
    for (let i = 0; i < 64; i++) samples.push(buf[Math.min(i * step, buf.length - 1)] || 0);
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    return samples.map(v => (v >= mean ? 1 : 0));
  }

  const phashA = computePhash(bufA);
  const phashB = computePhash(bufB);

  // Hamming distance between pHashes
  let hamming = 0;
  for (let i = 0; i < 64; i++) if (phashA[i] !== phashB[i]) hamming++;
  const similarity_score = Math.round(((64 - hamming) / 64) * 10000) / 100;

  // Byte-level diff
  const minLen = Math.min(bufA.length, bufB.length);
  let byte_diffs = 0;
  for (let i = 0; i < minLen; i++) if (bufA[i] !== bufB[i]) byte_diffs++;
  byte_diffs += Math.abs(bufA.length - bufB.length);
  const byte_diff_percent = Math.round((byte_diffs / Math.max(bufA.length, bufB.length, 1)) * 10000) / 100;

  // Use sharp for pixel-accurate comparison if available
  let pixel_similarity = null;
  const sharp = trySharp();
  if (sharp && !identical) {
    try {
      const [rawA, rawB] = await Promise.all([
        sharp(bufA).resize(32, 32).greyscale().raw().toBuffer(),
        sharp(bufB).resize(32, 32).greyscale().raw().toBuffer(),
      ]);
      const pixels = Math.min(rawA.length, rawB.length);
      let pixDiff = 0;
      for (let i = 0; i < pixels; i++) pixDiff += Math.abs(rawA[i] - rawB[i]);
      const maxDiff = pixels * 255;
      pixel_similarity = Math.round(((maxDiff - pixDiff) / maxDiff) * 10000) / 100;
    } catch (_) { /* ignore */ }
  }

  return {
    identical,
    similarity_score,
    pixel_similarity: pixel_similarity !== null ? pixel_similarity : similarity_score,
    hamming_distance: hamming,
    byte_diff_percent,
    size_a_bytes: bufA.length,
    size_b_bytes: bufB.length,
    sha256_a: hashA,
    sha256_b: hashB,
    engine: sharp ? 'sharp+phash' : 'phash-heuristic',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-screenshot — take screenshot via Puppeteer (graceful fallback)
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-screenshot'] = async (input) => {
  let puppeteer = null;
  try { puppeteer = require('puppeteer'); } catch (_) { /* not installed */ }

  if (!puppeteer) {
    return {
      ok: false,
      error: 'puppeteer not installed',
      note: 'Install puppeteer (npm install puppeteer) to enable screenshot capture',
      url: input.url,
    };
  }

  const url = String(input.url || 'https://example.com');
  const width = parseInt(input.width) || 1280;
  const height = parseInt(input.height) || 800;
  const full_page = input.full_page !== false;
  const format_out = input.format === 'png' ? 'png' : 'jpeg';

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const screenshotBuf = await page.screenshot({
      type: format_out,
      fullPage: full_page,
      quality: format_out === 'jpeg' ? (parseInt(input.quality) || 85) : undefined,
    });

    const b64 = screenshotBuf.toString('base64');
    return {
      ok: true,
      data_b64: b64,
      data_uri: `data:image/${format_out};base64,${b64}`,
      format: format_out,
      width,
      height,
      size_bytes: screenshotBuf.length,
      url,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-qr-generate — generate real QR code as SVG, PNG data URI, or ASCII
// Uses qrcode lib if available; falls back to deterministic ASCII art
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-qr-generate'] = async (input) => {
  const content = String(input.text || input.url || input.content || input.input || '');
  if (!content) return { ok: false, error: 'Provide text, url, or content to encode' };

  const format = (input.format || 'svg').toLowerCase(); // svg | png | ascii
  const qrcode = tryQrcode();

  if (qrcode) {
    try {
      if (format === 'svg') {
        const svg = await qrcode.toString(content, { type: 'svg', errorCorrectionLevel: input.error_correction || 'M' });
        return {
          ok: true,
          format: 'svg',
          svg,
          content,
          scannable: true,
        };
      } else if (format === 'png') {
        const buf = await qrcode.toBuffer(content, {
          type: 'png',
          errorCorrectionLevel: input.error_correction || 'M',
          width: parseInt(input.size) || 200,
          margin: parseInt(input.margin) || 1,
        });
        const b64 = buf.toString('base64');
        return {
          ok: true,
          format: 'png',
          data_b64: b64,
          data_uri: `data:image/png;base64,${b64}`,
          content,
          scannable: true,
        };
      } else {
        // ascii via qrcode
        const ascii = await qrcode.toString(content, { type: 'utf8', errorCorrectionLevel: input.error_correction || 'M' });
        return { ok: true, format: 'ascii', qr_ascii: ascii, content, scannable: true };
      }
    } catch (e) {
      return { ok: false, error: e.message, content };
    }
  }

  // Fallback: deterministic ASCII art (not scannable — labeled as such)
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const size = Math.max(21, Math.min(177, parseInt(input.size) || 21));
  let bits = '';
  let seed = hash;
  while (bits.length < size * size) {
    const next = crypto.createHash('sha256').update(seed).digest('hex');
    seed = next;
    for (const c of next) {
      const nibble = parseInt(c, 16);
      bits += nibble.toString(2).padStart(4, '0');
    }
  }
  const rows = ['█'.repeat(size)];
  for (let row = 1; row < size - 1; row++) {
    let line = '█';
    for (let col = 1; col < size - 1; col++) {
      const bitIdx = (row * (size - 2) + (col - 1)) % bits.length;
      line += bits[bitIdx] === '1' ? '█' : ' ';
    }
    line += '█';
    rows.push(line);
  }
  rows.push('█'.repeat(size));

  return {
    ok: true,
    format: 'ascii',
    qr_ascii: rows.join('\n'),
    content,
    scannable: false,
    note: 'Install qrcode (npm install qrcode) for a real scannable QR code',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-qr-decode — decode QR code from image URL or base64
// Uses jsqr if available; returns structured fallback if not
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-qr-decode'] = async (input) => {
  const jsqr = tryJsqr();
  const sharp = trySharp();

  if (!jsqr) {
    return {
      ok: false,
      error: 'jsqr not installed',
      note: 'Install jsqr (npm install jsqr) and sharp (npm install sharp) to enable QR decoding',
    };
  }
  if (!sharp) {
    return {
      ok: false,
      error: 'sharp not installed',
      note: 'Install sharp (npm install sharp) along with jsqr for QR decoding',
    };
  }

  const buf = await resolveBuffer(input);

  // Decode via sharp (get raw RGBA pixels) + jsqr
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const result = jsqr(new Uint8ClampedArray(data), info.width, info.height);

  if (!result) {
    return { ok: false, found: false, error: 'No QR code detected in image' };
  }

  return {
    ok: true,
    found: true,
    data: result.data,
    location: result.location,
    version: result.version,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-barcode-generate — generate barcode (Code128, EAN13, etc.)
// Uses bwip-js if available; graceful fallback
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-barcode-generate'] = async (input) => {
  const bwip = tryBwip();
  if (!bwip) {
    return {
      ok: false,
      error: 'bwip-js not installed',
      note: 'Install bwip-js (npm install bwip-js) to enable barcode generation',
      symbology: input.symbology || 'code128',
      text: input.text || input.value || '',
    };
  }

  const text = String(input.text || input.value || input.content || '');
  if (!text) return { ok: false, error: 'Provide text or value to encode' };

  const symbology = input.symbology || 'code128'; // code128 | ean13 | qrcode | upca | datamatrix
  const scale = parseInt(input.scale) || 3;
  const height = parseInt(input.height) || 10;
  const include_text = input.include_text !== false;

  try {
    const png = await bwip.toBuffer({
      bcid: symbology,
      text,
      scale,
      height,
      includetext: include_text,
      textxalign: 'center',
    });

    const b64 = png.toString('base64');
    return {
      ok: true,
      data_b64: b64,
      data_uri: `data:image/png;base64,${b64}`,
      format: 'png',
      symbology,
      text,
      size_bytes: png.length,
    };
  } catch (e) {
    return { ok: false, error: e.message, symbology, text };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-pdf-to-image — convert PDF page to image
// Uses pdf2pic if available; graceful fallback
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-pdf-to-image'] = async (input) => {
  let pdf2pic = null;
  try { pdf2pic = require('pdf2pic'); } catch (_) { /* not installed */ }

  if (!pdf2pic) {
    return {
      ok: false,
      error: 'pdf2pic not installed',
      note: 'Install pdf2pic (npm install pdf2pic) and GraphicsMagick/Ghostscript to enable PDF-to-image conversion',
    };
  }

  const buf = await resolveBuffer(input);
  const format = detectFormat(buf);
  if (format !== 'pdf') {
    return { ok: false, error: 'Input does not appear to be a PDF file' };
  }

  const page = parseInt(input.page) || 1;
  const dpi = parseInt(input.dpi) || 150;
  const format_out = (input.format || 'png').toLowerCase();

  try {
    const convert = pdf2pic.fromBuffer(buf, {
      density: dpi,
      saveFilename: 'page',
      savePath: '/tmp',
      format: format_out,
      width: parseInt(input.width) || 1200,
      height: parseInt(input.height) || 1600,
    });

    const result = await convert(page, { responseType: 'base64' });
    const b64 = result.base64;
    return {
      ok: true,
      data_b64: b64,
      data_uri: `data:image/${format_out};base64,${b64}`,
      format: format_out,
      page,
      dpi,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: vision-image-describe — describe image using Claude vision API
// Graceful fallback if no API key
// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-image-describe'] = async (input) => {
  const buf = await resolveBuffer(input);
  const format = detectFormat(buf);
  const mime_map = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
  const imageMediaType = mime_map[format] || 'image/jpeg';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: 'ANTHROPIC_API_KEY not set',
      note: 'Set ANTHROPIC_API_KEY environment variable to enable image description via Claude vision',
      format,
      size_bytes: buf.length,
    };
  }

  const prompt = String(input.prompt || 'Describe this image in detail. Include: main subjects, colors, composition, text visible, and any notable features.');
  const max_tokens = parseInt(input.max_tokens) || 1024;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.model || 'claude-opus-4-5',
        max_tokens,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageMediaType, data: buf.toString('base64') },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      return { ok: false, error: `Claude API error ${resp.status}: ${err}` };
    }

    const data = await resp.json();
    const description = data.content?.[0]?.text || '';

    return {
      ok: true,
      description,
      model: data.model,
      usage: data.usage,
      format,
      size_bytes: buf.length,
    };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// KEPT: gen-qr-text (legacy ASCII art, non-scannable — kept for backward compat)
// ─────────────────────────────────────────────────────────────────────────────

handlers['gen-qr-text'] = async (input) => {
  const content = String(input.text || input.input || '');
  const size = Math.max(21, Math.min(177, parseInt(input.size) || 21));

  const hash = crypto.createHash('sha256').update(content).digest('hex');
  let bits = '';
  let seed = hash;
  while (bits.length < size * size) {
    const next = crypto.createHash('sha256').update(seed).digest('hex');
    seed = next;
    for (const c of next) {
      const nibble = parseInt(c, 16);
      bits += nibble.toString(2).padStart(4, '0');
    }
  }

  const rows = ['█'.repeat(size)];
  for (let row = 1; row < size - 1; row++) {
    let line = '█';
    for (let col = 1; col < size - 1; col++) {
      const bitIdx = (row * (size - 2) + (col - 1)) % bits.length;
      line += bits[bitIdx] === '1' ? '█' : ' ';
    }
    line += '█';
    rows.push(line);
  }
  rows.push('█'.repeat(size));

  return {
    qr_ascii: rows.join('\n'),
    size,
    content,
    format: 'ascii',
    note: 'Deterministic ASCII art grid based on SHA-256 of content — not a scannable QR code. Use vision-qr-generate for a real QR code.',
  };
};

// ─── AUDIO ────────────────────────────────────────────────────────────────────

handlers['audio-duration-estimate'] = async (input) => {
  const buf = await resolveBuffer(input);
  const file_size_bytes = buf.length;

  if (file_size_bytes < 4) {
    return { format: 'unknown', estimated_duration_seconds: 0, file_size_bytes, bitrate_estimate: null };
  }

  const magic4 = buf.slice(0, 4).toString('ascii');
  let format = 'unknown';
  let estimated_duration_seconds = 0;
  let bitrate_estimate = null;

  if (magic4 === 'RIFF' && buf.length >= 44) {
    format = 'wav';
    const byte_rate = buf.readUInt32LE(28);
    let data_size = 0;
    let i = 12;
    while (i + 7 < buf.length) {
      const chunk_id = buf.slice(i, i + 4).toString('ascii');
      const chunk_size = buf.readUInt32LE(i + 4);
      if (chunk_id === 'data') { data_size = chunk_size; break; }
      i += 8 + chunk_size;
    }
    if (byte_rate > 0 && data_size > 0) {
      estimated_duration_seconds = Math.round((data_size / byte_rate) * 100) / 100;
    } else if (byte_rate > 0) {
      estimated_duration_seconds = Math.round(((file_size_bytes - 44) / byte_rate) * 100) / 100;
    }
    bitrate_estimate = byte_rate > 0 ? `${Math.round(byte_rate * 8 / 1000)}kbps` : null;
  } else {
    const id3 = buf.slice(0, 3).toString('ascii');
    const sync2 = buf.slice(0, 2).toString('hex');
    if (id3 === 'ID3' || sync2 === 'fffb' || sync2 === 'fff3' || sync2 === 'fff2') {
      format = 'mp3';
      let kbps = 128;
      for (let i = id3 === 'ID3' ? 10 : 0; i < Math.min(buf.length - 3, 4096); i++) {
        if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
          const b3 = buf[i + 2];
          const bitrate_index = (b3 >> 4) & 0xf;
          const bitrate_table = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
          const b2 = buf[i + 1];
          const mpeg_version = (b2 >> 3) & 0x3;
          if (mpeg_version !== 0 && bitrate_index > 0 && bitrate_index < 15) {
            kbps = bitrate_table[bitrate_index];
          }
          break;
        }
      }
      bitrate_estimate = `${kbps}kbps`;
      const bytes_per_sec = (kbps * 1000) / 8;
      estimated_duration_seconds = Math.round((file_size_bytes / bytes_per_sec) * 100) / 100;
    }
  }

  return { format, estimated_duration_seconds, file_size_bytes, bitrate_estimate };
};

// ─── FILE MAGIC DETECT ────────────────────────────────────────────────────────

handlers['file-magic-detect'] = async (input) => {
  let prefix;
  if (input.hex_prefix) {
    prefix = Buffer.from(input.hex_prefix.replace(/\s/g, ''), 'hex');
  } else {
    const buf = await resolveBuffer(input);
    prefix = buf.slice(0, 16);
  }

  const hex = prefix.toString('hex');
  const ascii4 = prefix.length >= 4 ? prefix.slice(0, 4).toString('ascii') : '';

  const MAGIC = [
    { sig: '89504e47', type: 'PNG Image', mime: 'image/png', ext: 'png', conf: 'high' },
    { sig: 'ffd8ff', type: 'JPEG Image', mime: 'image/jpeg', ext: 'jpg', conf: 'high' },
    { sig: '47494638', type: 'GIF Image', mime: 'image/gif', ext: 'gif', conf: 'high' },
    { sig: '25504446', type: 'PDF Document', mime: 'application/pdf', ext: 'pdf', conf: 'high' },
    { sig: '504b0304', type: 'ZIP Archive (or DOCX/XLSX/PPTX)', mime: 'application/zip', ext: 'zip', conf: 'high' },
    { sig: '52494646', type: 'RIFF Container (WAV/AVI/WebP)', mime: 'application/octet-stream', ext: 'riff', conf: 'medium' },
    { sig: '1a45dfa3', type: 'WebM/MKV Video', mime: 'video/webm', ext: 'webm', conf: 'high' },
    { sig: 'fffb', type: 'MP3 Audio', mime: 'audio/mpeg', ext: 'mp3', conf: 'high' },
    { sig: 'fff3', type: 'MP3 Audio', mime: 'audio/mpeg', ext: 'mp3', conf: 'high' },
    { sig: 'fff2', type: 'MP3 Audio', mime: 'audio/mpeg', ext: 'mp3', conf: 'high' },
    { sig: '494433', type: 'MP3 Audio (ID3)', mime: 'audio/mpeg', ext: 'mp3', conf: 'high' },
    { sig: '000000', type: 'MP4 Video (possible)', mime: 'video/mp4', ext: 'mp4', conf: 'low' },
  ];

  for (const m of MAGIC) {
    if (hex.startsWith(m.sig)) {
      if (m.sig === '52494646' && prefix.length >= 12) {
        const sub = prefix.slice(8, 12).toString('ascii');
        if (sub === 'WAVE') return { detected_type: 'WAV Audio', mime_type: 'audio/wav', extension: 'wav', confidence: 'high' };
        if (sub === 'WEBP') return { detected_type: 'WebP Image', mime_type: 'image/webp', extension: 'webp', confidence: 'high' };
        if (sub === 'AVI ') return { detected_type: 'AVI Video', mime_type: 'video/avi', extension: 'avi', confidence: 'high' };
      }
      if (m.sig === '504b0304') {
        return { detected_type: 'ZIP / Office Document', mime_type: 'application/zip', extension: 'zip', confidence: 'high' };
      }
      if (m.sig === '000000' && prefix.length >= 8 && prefix.slice(4, 8).toString('ascii') === 'ftyp') {
        return { detected_type: 'MP4 Video', mime_type: 'video/mp4', extension: 'mp4', confidence: 'high' };
      }
      return { detected_type: m.type, mime_type: m.mime, extension: m.ext, confidence: m.conf };
    }
  }

  if (prefix.length >= 8 && prefix.slice(4, 8).toString('ascii') === 'ftyp') {
    return { detected_type: 'MP4 Video', mime_type: 'video/mp4', extension: 'mp4', confidence: 'high' };
  }
  if (ascii4.startsWith('ID3')) {
    return { detected_type: 'MP3 Audio (ID3)', mime_type: 'audio/mpeg', extension: 'mp3', confidence: 'high' };
  }

  return { detected_type: 'Unknown', mime_type: 'application/octet-stream', extension: 'bin', confidence: 'low' };
};

// ─── DATA URI ─────────────────────────────────────────────────────────────────

handlers['data-uri-parse'] = async (input) => {
  const uri = String(input.uri || '');
  if (!uri.startsWith('data:')) {
    return { error: 'Not a data URI — must start with "data:"' };
  }

  const commaIdx = uri.indexOf(',');
  if (commaIdx === -1) {
    return { error: 'Malformed data URI — no comma separator found' };
  }

  const header = uri.slice(5, commaIdx);
  const dataStr = uri.slice(commaIdx + 1);

  const parts = header.split(';');
  const mime_type = parts[0] || 'text/plain';
  let encoding = 'none';
  let charset = null;
  for (const p of parts.slice(1)) {
    if (p === 'base64') encoding = 'base64';
    else if (p.startsWith('charset=')) charset = p.slice(8);
  }

  let data_b64 = dataStr;
  let data_size_bytes = 0;
  if (encoding === 'base64') {
    const buf = Buffer.from(dataStr, 'base64');
    data_size_bytes = buf.length;
  } else {
    data_b64 = Buffer.from(decodeURIComponent(dataStr)).toString('base64');
    data_size_bytes = decodeURIComponent(dataStr).length;
  }

  return { mime_type, charset, encoding, data_b64, data_size_bytes };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['data-uri-create'] = async (input) => {
  const data_b64 = String(input.data_b64 || '');
  const mime_type = String(input.mime_type || 'application/octet-stream');
  const uri = `data:${mime_type};base64,${data_b64}`;
  const buf = Buffer.from(data_b64, 'base64');
  return { uri, length: uri.length, mime_type, data_size_bytes: buf.length };
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = handlers;
