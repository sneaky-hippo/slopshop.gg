'use strict';

const crypto = require('crypto');

const handlers = {};

// ─── VISION / MULTIMODAL ────────────────────────────────────────────────────

handlers['vision-base64-info'] = async (input) => {
  const raw = input.data_b64 || input.data || '';
  const buf = Buffer.from(raw, 'base64');
  const size = buf.length;

  // Magic byte detection
  const magic4 = buf.length >= 4 ? buf.slice(0, 4).toString('hex') : '';
  const magic2 = buf.length >= 2 ? buf.slice(0, 2).toString('hex') : '';
  let mime_type_detected = 'application/octet-stream';
  if (magic4.startsWith('89504e47')) mime_type_detected = 'image/png';
  else if (magic2 === 'ffd8') mime_type_detected = 'image/jpeg';
  else if (magic4.startsWith('47494638')) mime_type_detected = 'image/gif';
  else if (magic4.startsWith('25504446')) mime_type_detected = 'application/pdf';
  else if (magic4.startsWith('52494646') && buf.length >= 12 && buf.slice(8, 12).toString('ascii') === 'WEBP') mime_type_detected = 'image/webp';
  else if (magic4.startsWith('504b0304')) mime_type_detected = 'application/zip';

  const sha256_hash = crypto.createHash('sha256').update(buf).digest('hex');
  const first_100_bytes_hex = buf.slice(0, 100).toString('hex');

  // Dimension parsing
  let width = null;
  let height = null;
  if (mime_type_detected === 'image/png' && buf.length >= 24) {
    width = buf.readUInt32BE(16);
    height = buf.readUInt32BE(20);
  } else if (mime_type_detected === 'image/jpeg') {
    // Scan for SOF markers (FFC0..FFC3, FFC5..FFCB, FFCD..FFCF)
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        height = buf.readUInt16BE(i + 5);
        width = buf.readUInt16BE(i + 7);
        break;
      }
      if (i + 3 < buf.length) {
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      } else break;
    }
  }

  return {
    file_size_bytes: size,
    mime_type_detected,
    sha256_hash,
    first_100_bytes_hex,
    dimensions: width && height ? { width, height } : null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-extract-text'] = async (input) => {
  let text = '';
  if (input.text) {
    text = input.text;
  } else if (input.data_b64) {
    const buf = Buffer.from(input.data_b64, 'base64');
    text = buf.toString('latin1');
  }

  // Extract printable ASCII runs of 3+ chars
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

handlers['vision-image-hash'] = async (input) => {
  const buf = Buffer.from(input.data_b64 || '', 'base64');
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const md5 = crypto.createHash('md5').update(buf).digest('hex');

  const magic4 = buf.length >= 4 ? buf.slice(0, 4).toString('hex') : '';
  const magic2 = buf.length >= 2 ? buf.slice(0, 2).toString('hex') : '';
  let format = 'unknown';
  if (magic4.startsWith('89504e47')) format = 'png';
  else if (magic2 === 'ffd8') format = 'jpeg';
  else if (magic4.startsWith('47494638')) format = 'gif';
  else if (magic4.startsWith('25504446')) format = 'pdf';
  else if (magic4.startsWith('52494646') && buf.length >= 12 && buf.slice(8, 12).toString('ascii') === 'WEBP') format = 'webp';
  else if (magic4.startsWith('504b0304')) format = 'zip';

  return { sha256, md5, size_bytes: buf.length, format };
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
  // Also count bytes present in one but not the other
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
  const buf = Buffer.from(input.data_b64 || '', 'base64');

  // Only inspect JPEG files
  const magic2 = buf.length >= 2 ? buf.slice(0, 2).toString('hex') : '';
  if (magic2 !== 'ffd8') {
    return {
      has_exif: false,
      exif_size_bytes: 0,
      clean_image_b64: input.data_b64 || '',
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
      // Start of scan — rest is image data, stop scanning
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

  return {
    has_exif,
    exif_size_bytes,
    clean_image_b64: input.data_b64 || '',
    detected_markers,
    note: 'clean_image_b64 is original — stripping EXIF requires a native image library',
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['gen-qr-text'] = async (input) => {
  const content = String(input.text || input.input || '');
  const size = Math.max(21, Math.min(177, parseInt(input.size) || 21));

  // Generate a deterministic ASCII QR-like grid from SHA-256 of content
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  // Expand hash to enough bits by hashing in rounds
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

  const rows = [];
  // Top finder-pattern row
  rows.push('█'.repeat(size));

  for (let row = 1; row < size - 1; row++) {
    let line = '█'; // left border
    for (let col = 1; col < size - 1; col++) {
      const bitIdx = (row * (size - 2) + (col - 1)) % bits.length;
      line += bits[bitIdx] === '1' ? '█' : ' ';
    }
    line += '█'; // right border
    rows.push(line);
  }

  // Bottom finder-pattern row
  rows.push('█'.repeat(size));

  const qr_ascii = rows.join('\n');

  return {
    qr_ascii,
    size,
    content,
    format: 'ascii',
    note: 'Deterministic ASCII art grid based on SHA-256 of content — not a scannable QR code',
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['vision-color-palette'] = async (input) => {
  const buf = Buffer.from(input.data_b64 || '', 'base64');

  if (buf.length < 10) {
    return { palette: [], dominant_color_hex: '#000000', note: 'Insufficient image data' };
  }

  // Sample ~300 byte triplets from throughout the buffer
  const N = Math.max(1, Math.floor(buf.length / 300));
  const samples = [];
  for (let i = 0; i + 2 < buf.length; i += N) {
    samples.push([buf[i], buf[i + 1], buf[i + 2]]);
  }

  // Start with 5 evenly-spaced centroids across 0-255
  const K = 5;
  let centroids = [];
  for (let k = 0; k < K; k++) {
    const v = Math.round((k / (K - 1)) * 255);
    centroids.push([v, v, v]);
  }

  // Run a few iterations of k-means
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
    // Update centroids
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

  // Final assignment for frequency
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
  } else if (input.data_b64) {
    const buf = Buffer.from(input.data_b64, 'base64');
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
    else if (EMAIL_RE.test(block)) type = 'url';
    else if (CODE_RE.test(block)) type = 'code';
    else if (NUMBER_BLOCK_RE.test(block)) type = 'number';
    else if (words.length <= 8 && HEADING_RE.test(block)) type = 'heading';

    return { type, content: block, word_count: words.length };
  });

  return { sections };
};

// ─── AUDIO ───────────────────────────────────────────────────────────────────

handlers['audio-duration-estimate'] = async (input) => {
  const buf = Buffer.from(input.data_b64 || '', 'base64');
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
    // sample_rate at bytes 24-27 (little-endian)
    const sample_rate = buf.readUInt32LE(24);
    const byte_rate = buf.readUInt32LE(28);
    // Find data chunk
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
    void sample_rate;
  } else {
    // Check for ID3 (MP3)
    const id3 = buf.slice(0, 3).toString('ascii');
    const sync2 = buf.slice(0, 2).toString('hex');
    if (id3 === 'ID3' || sync2 === 'fffb' || sync2 === 'fff3' || sync2 === 'fff2') {
      format = 'mp3';
      // Estimate by file size — try 128kbps first, detect from first frame header if possible
      let kbps = 128;
      // Look for sync word 0xFFE* or 0xFFF* to find first frame
      for (let i = id3 === 'ID3' ? 10 : 0; i < Math.min(buf.length - 3, 4096); i++) {
        if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
          const b2 = buf[i + 1];
          const b3 = buf[i + 2];
          const mpeg_version = (b2 >> 3) & 0x3;
          const bitrate_index = (b3 >> 4) & 0xf;
          const bitrate_table = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
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

// ─── FILE MAGIC DETECT ───────────────────────────────────────────────────────

handlers['file-magic-detect'] = async (input) => {
  let prefix;
  if (input.hex_prefix) {
    prefix = Buffer.from(input.hex_prefix.replace(/\s/g, ''), 'hex');
  } else {
    const buf = Buffer.from(input.data_b64 || '', 'base64');
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
      // Disambiguate RIFF
      if (m.sig === '52494646' && prefix.length >= 12) {
        const sub = prefix.slice(8, 12).toString('ascii');
        if (sub === 'WAVE') return { detected_type: 'WAV Audio', mime_type: 'audio/wav', extension: 'wav', confidence: 'high' };
        if (sub === 'WEBP') return { detected_type: 'WebP Image', mime_type: 'image/webp', extension: 'webp', confidence: 'high' };
        if (sub === 'AVI ') return { detected_type: 'AVI Video', mime_type: 'video/avi', extension: 'avi', confidence: 'high' };
      }
      // Disambiguate ZIP (DOCX/XLSX check would need zip entry scan — report as zip)
      if (m.sig === '504b0304') {
        // Can't distinguish DOCX/XLSX without reading zip entries, report as zip
        return { detected_type: 'ZIP / Office Document', mime_type: 'application/zip', extension: 'zip', confidence: 'high' };
      }
      // MP4 check: look for 'ftyp' at offset 4
      if (m.sig === '000000' && prefix.length >= 8 && prefix.slice(4, 8).toString('ascii') === 'ftyp') {
        return { detected_type: 'MP4 Video', mime_type: 'video/mp4', extension: 'mp4', confidence: 'high' };
      }
      return { detected_type: m.type, mime_type: m.mime, extension: m.ext, confidence: m.conf };
    }
  }

  // Check for ftyp at offset 4 with any leading 4 bytes (variable box size)
  if (prefix.length >= 8 && prefix.slice(4, 8).toString('ascii') === 'ftyp') {
    return { detected_type: 'MP4 Video', mime_type: 'video/mp4', extension: 'mp4', confidence: 'high' };
  }

  // Check for ID3 tag
  if (ascii4.startsWith('ID3')) {
    return { detected_type: 'MP3 Audio (ID3)', mime_type: 'audio/mpeg', extension: 'mp3', confidence: 'high' };
  }

  return { detected_type: 'Unknown', mime_type: 'application/octet-stream', extension: 'bin', confidence: 'low' };
};

// ─── DATA URI ────────────────────────────────────────────────────────────────

handlers['data-uri-parse'] = async (input) => {
  const uri = String(input.uri || '');
  if (!uri.startsWith('data:')) {
    return { error: 'Not a data URI — must start with "data:"' };
  }

  const commaIdx = uri.indexOf(',');
  if (commaIdx === -1) {
    return { error: 'Malformed data URI — no comma separator found' };
  }

  const header = uri.slice(5, commaIdx); // strip "data:"
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
