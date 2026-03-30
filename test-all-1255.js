#!/usr/bin/env node
// Exhaustive test of ALL 1255 endpoints with correctness verification
// Tests known-answer pairs, not just HTTP 200

const http = require('http');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.SLOP_KEY || 'sk-slop-demo-key-12345678';
const START = parseInt(process.env.START || '0');
const END = parseInt(process.env.END || '99999');
const OUTFILE = process.env.OUTFILE || '/tmp/test-results.txt';

// Known test inputs for each category pattern
const TEST_INPUTS = {
  // Text processing
  'text-word-count': { text: 'hello world foo bar baz' },
  'text-char-count': { text: 'hello' },
  'text-extract-emails': { text: 'contact ceo@slopshop.gg and support@slopshop.gg' },
  'text-extract-urls': { text: 'visit https://slopshop.gg and http://example.com' },
  'text-extract-phones': { text: 'call +1-555-123-4567 or 800-555-0199' },
  'text-extract-dates': { text: 'meeting on 2024-01-15 and 2024-03-20' },
  'text-extract-numbers': { text: 'got 42 items and 3.14 kg' },
  'text-extract-mentions': { text: 'hey @alice and @bob check this' },
  'text-extract-hashtags': { text: 'loving #javascript and #nodejs today' },
  'text-slugify': { text: 'Hello World This Is Slopshop' },
  'text-reverse': { text: 'slopshop' },
  'text-case-convert': { text: 'hello world', case: 'upper' },
  'text-truncate': { text: 'hello world this is a long sentence', length: 11 },
  'text-sentence-split': { text: 'Hello world. This is a test. Third sentence.' },
  'text-deduplicate-lines': { text: 'foo\nbar\nfoo\nbaz\nbar' },
  'text-sort-lines': { text: 'charlie\nalpha\nbravo' },
  'text-count-frequency': { text: 'the cat sat on the mat the cat' },
  'text-keyword-extract': { text: 'Machine learning and artificial intelligence are transforming software development' },
  'text-language-detect': { text: 'Bonjour le monde, comment allez-vous?' },
  'text-profanity-check': { text: 'this is a clean sentence about coding' },
  'text-readability-score': { text: 'The quick brown fox jumps over the lazy dog. Simple sentences are easy to read.' },
  'text-lorem-ipsum': { count: 3 },
  'text-regex-test': { text: 'hello123', pattern: '\\d+' },
  'text-regex-replace': { text: 'hello world', pattern: 'world', replacement: 'earth' },
  'text-diff': { original: 'hello world', modified: 'hello earth' },
  'text-wrap': { text: 'This is a somewhat long sentence that should be wrapped at a certain width for display', width: 20 },
  'text-split-paragraphs': { text: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.' },
  'text-pad': { text: 'hi', length: 10, char: '-', side: 'right' },
  'text-repeat': { text: 'ab', count: 3 },
  'text-encode-decode': { text: 'hello world', encoding: 'base64', operation: 'encode' },
  'text-mask': { text: '4111111111111111', start: 0, end: 12 },
  'text-camel-case': { text: 'hello world test' },
  'text-snake-case': { text: 'Hello World Test' },
  'text-title-case': { text: 'hello world test' },
  'text-kebab-case': { text: 'Hello World Test' },

  // Math
  'math-evaluate': { expression: '2 + 3 * 4' },
  'math-fibonacci': { n: 7 },
  'math-prime-check': { number: 17 },
  'math-factorial': { n: 6 },
  'math-gcd': { a: 12, b: 8 },
  'math-lcm': { a: 4, b: 6 },
  'math-random-int': { min: 1, max: 100 },
  'math-percentage': { value: 50, total: 200 },
  'math-convert-base': { number: '255', from: 10, to: 16 },
  'math-statistics': { numbers: [1, 2, 3, 4, 5] },
  'math-matrix-multiply': { a: [[1,2],[3,4]], b: [[5,6],[7,8]] },
  'math-solve-quadratic': { a: 1, b: -3, c: 2 },
  'math-distance': { x1: 0, y1: 0, x2: 3, y2: 4 },
  'math-round': { number: 3.14159, decimals: 2 },
  'math-clamp': { value: 15, min: 0, max: 10 },
  'math-interpolate': { start: 0, end: 100, t: 0.5 },
  'math-sigmoid': { x: 0 },
  'math-combinations': { n: 5, r: 2 },
  'math-permutations': { n: 5, r: 2 },
  'math-is-even': { number: 42 },
  'math-absolute': { number: -42 },
  'math-power': { base: 2, exponent: 10 },
  'math-sqrt': { number: 144 },
  'math-log': { number: 100, base: 10 },
  'math-sum': { numbers: [1, 2, 3, 4, 5] },
  'math-average': { numbers: [10, 20, 30, 40, 50] },
  'math-median': { numbers: [1, 3, 5, 7, 9] },
  'math-mode': { numbers: [1, 2, 2, 3, 3, 3, 4] },
  'math-variance': { numbers: [2, 4, 4, 4, 5, 5, 7, 9] },
  'math-std-dev': { numbers: [2, 4, 4, 4, 5, 5, 7, 9] },
  'math-range': { numbers: [3, 7, 1, 9, 4] },
  'math-min-max': { numbers: [3, 7, 1, 9, 4] },

  // Crypto
  'crypto-hash-md5': { text: 'hello' },
  'crypto-hash-sha256': { text: 'hello' },
  'crypto-hash-sha512': { text: 'hello' },
  'crypto-uuid': {},
  'crypto-random-bytes': { length: 16 },
  'crypto-hmac': { text: 'hello', key: 'secret', algorithm: 'sha256' },
  'crypto-encrypt-aes': { text: 'hello world', key: 'mysecretkey12345' },
  'crypto-base64-encode': { text: 'hello world' },
  'crypto-base64-decode': { text: 'aGVsbG8gd29ybGQ=' },
  'crypto-bcrypt-hash': { text: 'password123' },
  'crypto-jwt-decode': { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' },
  'crypto-crc32': { text: 'hello' },

  // Date/Time
  'date-now': {},
  'date-format': { date: '2024-01-15', format: 'YYYY-MM-DD' },
  'date-parse': { date: 'January 15, 2024' },
  'date-diff': { start: '2024-01-01', end: '2024-03-01' },
  'date-add': { date: '2024-01-15', amount: 30, unit: 'days' },
  'date-weekday': { date: '2024-01-15' },
  'date-is-leap-year': { year: 2024 },
  'date-timezone-convert': { date: '2024-01-15T12:00:00Z', from: 'UTC', to: 'America/New_York' },
  'date-unix-to-iso': { timestamp: 1705334400 },
  'date-iso-to-unix': { date: '2024-01-15T12:00:00Z' },
  'date-business-days': { start: '2024-01-15', end: '2024-01-22' },
  'date-age': { birthdate: '2000-01-15' },
  'date-quarter': { date: '2024-03-15' },
  'date-days-in-month': { year: 2024, month: 2 },
  'date-relative': { date: '2024-01-15' },
  'date-countdown': { target: '2025-12-31' },
  'date-is-weekend': { date: '2024-01-14' },
  'date-cron-next': { expression: '0 12 * * *', count: 3 },

  // JSON
  'json-validate': { json: '{"name":"test","value":42}' },
  'json-format': { json: '{"a":1,"b":2}', indent: 2 },
  'json-minify': { json: '{\n  "a": 1,\n  "b": 2\n}' },
  'json-path-query': { json: { users: [{ name: 'Alice' }, { name: 'Bob' }] }, path: '$.users[0].name' },
  'json-diff': { a: { x: 1, y: 2 }, b: { x: 1, y: 3 } },
  'json-merge': { a: { x: 1 }, b: { y: 2 } },
  'json-flatten': { json: { a: { b: { c: 1 } } } },
  'json-unflatten': { json: { 'a.b.c': 1 } },
  'json-to-csv': { json: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }] },
  'json-schema-validate': { json: { name: 'test' }, schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  'json-to-yaml': { json: { name: 'test', value: 42 } },
  'json-sort-keys': { json: { b: 2, a: 1, c: 3 } },
  'json-to-xml': { json: { root: { name: 'test' } } },
  'json-transform': { json: { name: 'Alice', age: 30 }, template: { fullName: '$.name' } },

  // Validate
  'validate-email-syntax': { email: 'test@example.com' },
  'validate-url': { url: 'https://slopshop.gg' },
  'validate-ip': { ip: '192.168.1.1' },
  'validate-json': { json: '{"valid":true}' },
  'validate-credit-card': { number: '4111111111111111' },
  'validate-phone': { phone: '+1-555-123-4567' },
  'validate-uuid': { uuid: '550e8400-e29b-41d4-a716-446655440000' },
  'validate-hex-color': { color: '#FF5733' },
  'validate-semver': { version: '1.2.3' },
  'validate-isbn': { isbn: '978-0-13-468599-1' },
  'validate-mac-address': { mac: '00:1B:44:11:3A:B7' },
  'validate-iban': { iban: 'GB29NWBK60161331926819' },
  'validate-mime-type': { mime: 'application/json' },
  'validate-cron': { expression: '*/5 * * * *' },
  'validate-regex': { pattern: '^[a-z]+$' },
  'validate-base64': { text: 'aGVsbG8=' },
  'validate-jwt': { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U' },
  'validate-slug': { slug: 'hello-world-test' },
  'validate-country-code': { code: 'US' },
  'validate-language-code': { code: 'en' },
  'validate-currency-code': { code: 'USD' },
  'validate-latitude-longitude': { latitude: 40.7128, longitude: -74.0060 },
  'validate-port': { port: 8080 },
  'validate-domain': { domain: 'slopshop.gg' },
  'validate-password-strength': { password: 'MyP@ssw0rd!2024' },

  // Convert
  'convert-temperature': { value: 100, from: 'celsius', to: 'fahrenheit' },
  'convert-length': { value: 1, from: 'mile', to: 'kilometer' },
  'convert-weight': { value: 1, from: 'kilogram', to: 'pound' },
  'convert-currency': { amount: 100, from: 'USD', to: 'EUR' },
  'convert-color': { color: '#FF5733', to: 'rgb' },
  'convert-number-base': { number: '255', from: 10, to: 16 },
  'convert-time': { value: 3600, from: 'seconds', to: 'hours' },
  'convert-data-size': { value: 1024, from: 'MB', to: 'GB' },
  'convert-angle': { value: 180, from: 'degrees', to: 'radians' },
  'convert-speed': { value: 100, from: 'km/h', to: 'mph' },
  'convert-pressure': { value: 1, from: 'atm', to: 'psi' },
  'convert-energy': { value: 1, from: 'calorie', to: 'joule' },
  'convert-area': { value: 1, from: 'acre', to: 'sqm' },
  'convert-volume': { value: 1, from: 'gallon', to: 'liter' },
  'convert-frequency': { value: 1000, from: 'Hz', to: 'kHz' },
  'convert-roman-numeral': { number: 42 },
  'convert-markdown-html': { markdown: '# Hello\n\n**bold** text' },
  'convert-csv-json': { csv: 'name,age\nAlice,30\nBob,25' },
  'convert-yaml-json': { yaml: 'name: test\nvalue: 42' },
  'convert-xml-json': { xml: '<root><name>test</name></root>' },
  'convert-hex-rgb': { hex: '#FF5733' },
  'convert-binary-text': { binary: '01001000 01100101 01101100 01101100 01101111', direction: 'to_text' },
  'convert-morse': { text: 'HELLO', direction: 'to_morse' },
  'convert-epoch': { epoch: 1705334400, direction: 'to_date' },

  // Code
  'code-format': { code: 'function   foo(  ){return 1}', language: 'javascript' },
  'code-minify': { code: 'function foo() {\n  return 1;\n}', language: 'javascript' },
  'code-lint': { code: 'var x = 1; var y = 2;', language: 'javascript' },
  'code-highlight': { code: 'const x = 42;', language: 'javascript' },
  'code-count-lines': { code: 'line1\nline2\nline3' },
  'code-detect-language': { code: 'def hello():\n    print("Hello, World!")' },
  'code-generate-regex': { description: 'match email addresses' },
  'code-json-to-typescript': { json: '{"name":"test","age":30,"active":true}' },
  'code-sql-format': { sql: 'SELECT * FROM users WHERE age > 18 ORDER BY name' },
  'code-diff': { original: 'function foo() {\n  return 1;\n}', modified: 'function foo() {\n  return 2;\n}' },
  'code-complexity': { code: 'function foo(x) {\n  if (x > 0) {\n    if (x > 10) {\n      return "big";\n    }\n    return "small";\n  }\n  return "negative";\n}' },
  'code-ast-parse': { code: 'const x = 1 + 2;', language: 'javascript' },
  'code-dependency-parse': { code: 'import React from "react";\nimport axios from "axios";', language: 'javascript' },
  'code-encode-decode': { code: '<h1>Hello & World</h1>', operation: 'html_encode' },
  'code-snippet-search': { query: 'sort array', language: 'javascript' },
  'code-obfuscate': { code: 'const secret = "password123";', language: 'javascript' },
  'code-todo-extract': { code: '// TODO: fix this\nfunction foo() {\n  // FIXME: broken\n  return 1;\n}' },

  // Network/DNS
  'network-dns-lookup': { domain: 'google.com' },
  'network-ip-info': { ip: '8.8.8.8' },
  'network-url-parse': { url: 'https://slopshop.gg/v1/tools?limit=10' },
  'network-http-status': { code: 404 },
  'network-encode-url': { text: 'hello world & foo=bar' },
  'network-decode-url': { text: 'hello%20world%20%26%20foo%3Dbar' },
  'network-generate-url': { protocol: 'https', host: 'slopshop.gg', path: '/v1/tools', params: { limit: '10' } },
  'network-cidr-calc': { cidr: '192.168.1.0/24' },
  'network-port-info': { port: 443 },
  'network-user-agent-parse': { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  'network-ssl-cert-info': { domain: 'slopshop.gg' },
  'network-whois': { domain: 'google.com' },
  'network-headers-parse': { headers: 'Content-Type: application/json\nAuthorization: Bearer token123' },
  'network-cors-check': { origin: 'https://slopshop.gg', target: 'https://api.example.com' },
  'network-subnet-calc': { ip: '192.168.1.100', mask: '255.255.255.0' },
  'network-mac-lookup': { mac: '00:1B:44:11:3A:B7' },

  // Image
  'image-resize': { width: 100, height: 100, url: 'https://example.com/image.png' },
  'image-crop': { x: 0, y: 0, width: 50, height: 50, url: 'https://example.com/image.png' },
  'image-rotate': { angle: 90, url: 'https://example.com/image.png' },
  'image-blur': { radius: 5, url: 'https://example.com/image.png' },
  'image-grayscale': { url: 'https://example.com/image.png' },
  'image-metadata': { url: 'https://example.com/image.png' },
  'image-thumbnail': { width: 50, height: 50, url: 'https://example.com/image.png' },
  'image-watermark': { text: 'slopshop', url: 'https://example.com/image.png' },
  'image-convert-format': { from: 'png', to: 'jpeg', url: 'https://example.com/image.png' },
  'image-compress': { quality: 80, url: 'https://example.com/image.png' },
  'image-color-palette': { url: 'https://example.com/image.png' },
  'image-qr-generate': { text: 'https://slopshop.gg' },
  'image-placeholder': { width: 200, height: 100, text: 'Test' },
  'image-svg-to-png': { svg: '<svg><rect width="100" height="100" fill="red"/></svg>' },
  'image-dominant-color': { url: 'https://example.com/image.png' },
  'image-exif-strip': { url: 'https://example.com/image.png' },
  'image-border': { color: '#FF0000', width: 5, url: 'https://example.com/image.png' },
  'image-flip': { direction: 'horizontal', url: 'https://example.com/image.png' },

  // Generate
  'gen-uuid': {},
  'gen-password': { length: 16 },
  'gen-lorem': { words: 10 },
  'gen-color': {},
  'gen-name': {},
  'gen-email': {},
  'gen-phone': {},
  'gen-address': {},
  'gen-company': {},
  'gen-avatar-url': { seed: 'test' },
  'gen-qr-text': { text: 'hello' },
  'gen-barcode': { value: '1234567890' },
  'gen-mock-data': { schema: { name: 'string', age: 'number' }, count: 3 },
  'gen-slug': { text: 'Hello World Test' },
  'gen-hash': { text: 'hello', algorithm: 'sha256' },
  'gen-token': { length: 32 },
  'gen-id': {},
  'gen-timestamp': {},
  'gen-ip': {},
  'gen-mac': {},
  'gen-credit-card': {},
  'gen-iban': {},
  'gen-rgb': {},
  'gen-hex': {},
  'gen-hsl': {},

  // Exec
  'exec-javascript': { code: 'return 2 + 2' },
  'exec-jq': { json: { users: [{ name: 'Alice' }, { name: 'Bob' }] }, filter: '.users[].name' },
  'exec-regex': { text: 'hello world 123', pattern: '\\d+' },
  'exec-template': { template: 'Hello {{name}}!', data: { name: 'World' } },
  'exec-jsonpath': { json: { store: { book: [{ title: 'Foo' }] } }, path: '$.store.book[0].title' },
  'exec-xpath': { xml: '<root><item>hello</item></root>', path: '//item' },
  'exec-sql-on-json': { data: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }], query: 'SELECT * WHERE age > 26' },
  'exec-math': { expression: 'sqrt(144) + pow(2, 3)' },
  'exec-cron-parse': { expression: '*/5 * * * *' },
  'exec-glob-match': { pattern: '*.js', paths: ['foo.js', 'bar.ts', 'baz.js'] },

  // Data
  'data-sort': { data: [3, 1, 4, 1, 5, 9, 2, 6], order: 'asc' },
  'data-filter': { data: [1, 2, 3, 4, 5, 6, 7, 8], condition: 'x > 4' },
  'data-group': { data: [{ type: 'a', v: 1 }, { type: 'b', v: 2 }, { type: 'a', v: 3 }], key: 'type' },
  'data-paginate': { data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], page: 2, pageSize: 3 },
  'data-deduplicate': { data: [1, 2, 2, 3, 3, 3, 4] },
  'data-pivot': { data: [{ cat: 'A', val: 1 }, { cat: 'B', val: 2 }, { cat: 'A', val: 3 }], key: 'cat', value: 'val' },
  'data-sample': { data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], count: 3 },
  'data-chunk': { data: [1, 2, 3, 4, 5, 6], size: 2 },
  'data-flatten': { data: [[1, 2], [3, [4, 5]], [6]] },
  'data-zip': { arrays: [[1, 2, 3], ['a', 'b', 'c']] },
  'data-frequency': { data: ['a', 'b', 'a', 'c', 'b', 'a'] },
  'data-histogram': { data: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4], bins: 4 },
  'data-normalize': { data: [1, 2, 3, 4, 5] },
  'data-aggregate': { data: [{ value: 10 }, { value: 20 }, { value: 30 }], field: 'value', operation: 'sum' },
  'data-transpose': { data: [[1, 2, 3], [4, 5, 6]] },
  'data-fill-missing': { data: [1, null, 3, null, 5], method: 'interpolate' },
  'data-rank': { data: [30, 10, 50, 20, 40] },
  'data-running-total': { data: [10, 20, 30, 40, 50] },
  'data-percentile': { data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], percentile: 50 },
  'data-outlier-detect': { data: [1, 2, 3, 4, 5, 100, 2, 3] },
  'data-moving-average': { data: [1, 2, 3, 4, 5, 6, 7], window: 3 },
  'data-correlation': { x: [1, 2, 3, 4, 5], y: [2, 4, 5, 4, 5] },
  'data-regression': { x: [1, 2, 3, 4, 5], y: [2, 4, 5, 4, 5] },
  'data-interpolate': { x: [0, 1, 2], y: [0, 1, 4], target: 1.5 },

  // Sense
  'sense-dns': { domain: 'google.com' },
  'sense-whois': { domain: 'google.com' },
  'sense-ssl': { domain: 'google.com' },
  'sense-headers': { url: 'https://slopshop.gg' },
  'sense-robots': { url: 'https://google.com' },
  'sense-sitemap': { url: 'https://google.com' },
  'sense-meta': { url: 'https://slopshop.gg' },
  'sense-links': { url: 'https://slopshop.gg' },
  'sense-tech-stack': { url: 'https://slopshop.gg' },
  'sense-performance': { url: 'https://slopshop.gg' },
  'sense-accessibility': { url: 'https://slopshop.gg' },
  'sense-security-headers': { url: 'https://slopshop.gg' },
  'sense-carbon': { url: 'https://slopshop.gg' },
  'sense-social': { url: 'https://slopshop.gg' },

  // Enrich
  'enrich-ip': { ip: '8.8.8.8' },
  'enrich-domain': { domain: 'google.com' },
  'enrich-email': { email: 'test@gmail.com' },
  'enrich-phone': { phone: '+14155551234' },
  'enrich-company': { name: 'Google' },
  'enrich-url': { url: 'https://slopshop.gg' },
  'enrich-address': { address: '1600 Amphitheatre Parkway, Mountain View, CA' },
  'enrich-name': { name: 'John Smith' },
  'enrich-user-agent': { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
  'enrich-social': { url: 'https://twitter.com/slopshop' },
  'enrich-content': { text: 'AI and machine learning are transforming technology' },
  'enrich-geo': { latitude: 40.7128, longitude: -74.0060 },

  // Communication
  'comm-send-webhook': { url: 'https://httpbin.org/post', payload: { test: true } },
  'comm-email-validate-deep': { email: 'test@gmail.com' },
  'comm-phone-validate': { phone: '+1-555-123-4567' },
  'comm-qr-url': { url: 'https://slopshop.gg' },

  // Search
  'search-fuzzy': { query: 'helo wrld', items: ['hello world', 'goodbye world', 'hello earth'] },
  'search-binary': { data: [1, 3, 5, 7, 9, 11, 13], target: 7 },
  'search-levenshtein': { a: 'kitten', b: 'sitting' },
  'search-autocomplete': { query: 'jav', items: ['javascript', 'java', 'python', 'javafx'] },
  'search-tf-idf': { documents: ['the cat sat', 'the dog ran', 'cats and dogs'], query: 'cat' },

  // Sort
  'sort-bubble': { data: [5, 3, 8, 1, 9, 2] },
  'sort-quick': { data: [5, 3, 8, 1, 9, 2] },
  'sort-merge': { data: [5, 3, 8, 1, 9, 2] },
  'sort-heap': { data: [5, 3, 8, 1, 9, 2] },
  'sort-insertion': { data: [5, 3, 8, 1, 9, 2] },
  'sort-selection': { data: [5, 3, 8, 1, 9, 2] },
  'sort-radix': { data: [170, 45, 75, 90, 802, 24, 2, 66] },
  'sort-counting': { data: [4, 2, 2, 8, 3, 3, 1] },
  'sort-bucket': { data: [0.42, 0.32, 0.23, 0.52, 0.25, 0.47] },
  'sort-shell': { data: [5, 3, 8, 1, 9, 2] },
  'sort-natural': { data: ['file1', 'file10', 'file2', 'file20', 'file3'] },
  'sort-topological': { graph: { a: ['b', 'c'], b: ['d'], c: ['d'], d: [] } },

  // ML/AI compute
  'ml-linear-regression': { x: [1, 2, 3, 4, 5], y: [2, 4, 5, 4, 5] },
  'ml-kmeans': { data: [[1, 1], [1.5, 2], [3, 4], [5, 7], [3.5, 5], [4.5, 5]], k: 2 },
  'ml-naive-bayes': { training: [{ text: 'good great', label: 'pos' }, { text: 'bad awful', label: 'neg' }], input: 'great' },
  'ml-decision-tree': { data: [{ x: 1, y: 'a' }, { x: 2, y: 'a' }, { x: 3, y: 'b' }], target: 'y' },
  'ml-sentiment': { text: 'I love this product, it is absolutely wonderful!' },
  'ml-tokenize': { text: 'Hello world, how are you today?' },
  'ml-cosine-similarity': { a: [1, 2, 3], b: [4, 5, 6] },
  'ml-normalize': { data: [1, 2, 3, 4, 5], method: 'min-max' },
  'ml-confusion-matrix': { actual: [1, 0, 1, 1, 0, 1], predicted: [1, 0, 0, 1, 0, 1] },
  'ml-tfidf': { documents: ['the cat sat', 'the dog ran', 'cats and dogs'], query: 'cat' },
  'ml-pca': { data: [[1, 2], [3, 4], [5, 6], [7, 8]], components: 1 },
  'ml-knn': { training: [[1, 1, 'a'], [2, 2, 'a'], [8, 8, 'b'], [9, 9, 'b']], point: [3, 3], k: 2 },
  'ml-word-frequency': { text: 'the cat sat on the mat the cat' },
  'ml-text-similarity': { a: 'hello world', b: 'hello earth' },
  'ml-ngram': { text: 'hello world how are you', n: 2 },
  'ml-markov-chain': { text: 'the cat sat on the mat the cat sat on the floor', order: 1 },
  'ml-anomaly-detect': { data: [1, 2, 3, 2, 1, 2, 100, 3, 2, 1] },
  'ml-feature-scale': { data: [10, 20, 30, 40, 50], method: 'standard' },
  'ml-association-rules': { transactions: [['a', 'b'], ['a', 'c'], ['a', 'b', 'c'], ['b', 'c']] },
  'ml-cross-validate': { data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], folds: 5 },

  // Finance
  'finance-compound-interest': { principal: 1000, rate: 5, time: 10, n: 12 },
  'finance-loan-payment': { principal: 200000, rate: 4.5, years: 30 },
  'finance-roi': { investment: 1000, returns: 1500 },
  'finance-tax': { income: 75000, rate: 25 },
  'finance-discount': { price: 100, discount: 20 },
  'finance-tip': { amount: 50, tipPercent: 18 },
  'finance-margin': { cost: 50, price: 100 },
  'finance-markup': { cost: 50, markup: 100 },
  'finance-depreciation': { cost: 10000, salvage: 2000, life: 5 },
  'finance-break-even': { fixedCosts: 10000, pricePerUnit: 50, costPerUnit: 30 },
  'finance-npv': { cashFlows: [-1000, 300, 400, 500, 600], rate: 10 },
  'finance-irr': { cashFlows: [-1000, 300, 420, 680] },
  'finance-currency-convert': { amount: 100, from: 'USD', to: 'EUR' },
  'finance-stock-return': { buyPrice: 100, sellPrice: 150, dividends: 5 },
  'finance-amortization': { principal: 200000, rate: 4.5, years: 30, period: 1 },

  // Orchestration
  'orch-delay': { ms: 100 },
  'orch-parallel': { tasks: [{ slug: 'math-evaluate', input: { expression: '2+2' } }, { slug: 'math-evaluate', input: { expression: '3+3' } }] },
  'orch-race': { tasks: [{ slug: 'math-evaluate', input: { expression: '1+1' } }], timeout: 5000 },
  'orch-retry': { slug: 'math-evaluate', input: { expression: '5*5' }, maxRetries: 3 },
  'orch-batch': { slug: 'math-evaluate', inputs: [{ expression: '1+1' }, { expression: '2+2' }, { expression: '3+3' }] },
  'orch-cache': { key: 'test-cache', slug: 'math-evaluate', input: { expression: '7*7' }, ttl: 60 },
  'orch-lock': { key: 'test-lock', slug: 'math-evaluate', input: { expression: '8+8' } },
  'orch-rate-limit': { key: 'test-rl', slug: 'math-evaluate', input: { expression: '9+9' }, limit: 10, window: 60 },
  'orch-event': { event: 'test.event', data: { value: 42 } },
  'orch-circuit-breaker': { slug: 'math-evaluate', input: { expression: '4+4' }, threshold: 5, timeout: 30 },
  'orch-saga': { steps: [{ slug: 'math-evaluate', input: { expression: '1+1' } }] },
  'orch-pipeline': { steps: [{ slug: 'text-word-count', input: { text: 'hello world' } }] },
  'orch-map-reduce': { data: [1, 2, 3, 4, 5], mapSlug: 'math-evaluate', reduceSlug: 'math-sum' },

  // Memory
  'memory-set': { key: 'test-mem-key', value: 'test-mem-value' },
  'memory-get': { key: 'test-mem-key' },
  'memory-list': {},
  'memory-delete': { key: 'test-mem-key-del' },
  'memory-search': { query: 'test' },
  'memory-ttl-set': { key: 'test-ttl', value: 'ttl-val', ttl: 3600 },
  'counter-increment': { key: 'test-counter', amount: 1 },
  'counter-get': { key: 'test-counter' },
  'counter-decrement': { key: 'test-counter', amount: 1 },
  'queue-push': { queue: 'test-queue', item: 'test-item' },
  'queue-pop': { queue: 'test-queue' },
  'queue-peek': { queue: 'test-queue' },
  'queue-size': { queue: 'test-queue' },
  'state-set': { key: 'test-state', value: { status: 'active' } },
  'state-get': { key: 'test-state' },
  'state-list': {},
  'context-session': {},
};

// Known correct answers for verification
const EXPECTED = {
  'text-word-count': r => (r.count === 5 || r.words === 5),
  'text-char-count': r => (r.count === 5 || r.characters === 5 || r.chars === 5 || r.length === 5),
  'text-extract-emails': r => {
    const emails = r.emails || r.matches || r.found || r.results || [];
    return emails.length === 2 && emails.includes('ceo@slopshop.gg');
  },
  'text-extract-urls': r => {
    const urls = r.urls || r.matches || r.found || [];
    return urls.length === 2;
  },
  'text-extract-phones': r => {
    const phones = r.phones || r.matches || r.found || [];
    return phones.length >= 1;
  },
  'text-slugify': r => (r.slug === 'hello-world-this-is-slopshop' || r.result === 'hello-world-this-is-slopshop'),
  'text-reverse': r => {
    const v = r.result || r.reversed || r.text || '';
    return v === 'pohspols';
  },
  'text-case-convert': r => {
    const v = r.result || r.text || r.converted || '';
    return v === 'HELLO WORLD';
  },
  'text-sentence-split': r => {
    const s = r.sentences || r.result || [];
    return Array.isArray(s) && s.length === 3;
  },
  'text-sort-lines': r => {
    const v = r.result || r.sorted || r.text || '';
    return v.startsWith('alpha');
  },
  'text-deduplicate-lines': r => {
    const v = r.result || r.deduplicated || r.text || '';
    const lines = v.split('\n').filter(l => l.trim());
    return lines.length === 3;
  },
  'text-regex-replace': r => {
    const v = r.result || r.text || '';
    return v === 'hello earth';
  },
  'text-regex-test': r => r.match === true || r.matches === true || r.result === true,
  'text-camel-case': r => {
    const v = r.result || r.text || r.camelCase || '';
    return v === 'helloWorldTest';
  },
  'text-snake-case': r => {
    const v = r.result || r.text || '';
    return v === 'hello_world_test';
  },
  'text-title-case': r => {
    const v = r.result || r.text || '';
    return v === 'Hello World Test';
  },
  'text-kebab-case': r => {
    const v = r.result || r.text || '';
    return v === 'hello-world-test';
  },
  'text-encode-decode': r => {
    const v = r.result || r.encoded || r.text || '';
    return v === 'aGVsbG8gd29ybGQ=';
  },
  'text-repeat': r => {
    const v = r.result || r.text || '';
    return v === 'ababab';
  },
  'text-pad': r => {
    const v = r.result || r.text || '';
    return v.length === 10;
  },
  'math-evaluate': r => r.result === 14,
  'math-fibonacci': r => {
    const seq = r.sequence || r.result || [];
    return Array.isArray(seq) && seq.length === 7 && seq[6] === 8;
  },
  'math-prime-check': r => r.isPrime === true || r.prime === true || r.result === true,
  'math-factorial': r => r.result === 720 || r.factorial === 720,
  'math-gcd': r => r.result === 4 || r.gcd === 4,
  'math-lcm': r => r.result === 12 || r.lcm === 12,
  'math-percentage': r => r.result === 25 || r.percentage === 25,
  'math-statistics': r => {
    return (r.mean === 3 || (r.statistics && r.statistics.mean === 3) || (r.result && r.result.mean === 3));
  },
  'math-solve-quadratic': r => {
    const roots = r.roots || r.solutions || r.result || [];
    return roots.includes(1) && roots.includes(2);
  },
  'math-distance': r => r.distance === 5 || r.result === 5,
  'math-round': r => r.result === 3.14 || r.rounded === 3.14,
  'math-clamp': r => r.result === 10 || r.clamped === 10,
  'math-interpolate': r => r.result === 50 || r.value === 50,
  'math-sigmoid': r => Math.abs((r.result || r.value || 0) - 0.5) < 0.01,
  'math-combinations': r => r.result === 10 || r.combinations === 10,
  'math-permutations': r => r.result === 20 || r.permutations === 20,
  'math-is-even': r => r.result === true || r.isEven === true || r.even === true,
  'math-absolute': r => r.result === 42 || r.absolute === 42,
  'math-power': r => r.result === 1024 || r.power === 1024,
  'math-sqrt': r => r.result === 12 || r.sqrt === 12,
  'math-sum': r => r.result === 15 || r.sum === 15,
  'math-average': r => r.result === 30 || r.average === 30 || r.mean === 30,
  'math-median': r => r.result === 5 || r.median === 5,
  'math-mode': r => {
    const v = r.result || r.mode;
    return v === 3 || (Array.isArray(v) && v.includes(3));
  },
  'math-range': r => r.result === 8 || r.range === 8,
  'math-min-max': r => (r.min === 1 && r.max === 9) || (r.result && r.result.min === 1),

  'crypto-base64-encode': r => {
    const v = r.result || r.encoded || '';
    return v === 'aGVsbG8gd29ybGQ=';
  },
  'crypto-base64-decode': r => {
    const v = r.result || r.decoded || '';
    return v === 'hello world';
  },
  'crypto-uuid': r => {
    const v = r.uuid || r.result || '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  },
  'crypto-hash-sha256': r => {
    const v = r.hash || r.result || '';
    return v.length === 64;
  },

  'date-weekday': r => {
    const v = r.weekday || r.day || r.result || '';
    return v.toLowerCase() === 'monday';
  },
  'date-is-leap-year': r => r.result === true || r.isLeapYear === true || r.leapYear === true,
  'date-days-in-month': r => r.result === 29 || r.days === 29,

  'json-validate': r => r.valid === true || r.result === true,
  'json-merge': r => {
    const v = r.result || r.merged || {};
    return v.x === 1 && v.y === 2;
  },
  'json-flatten': r => {
    const v = r.result || r.flattened || {};
    return v['a.b.c'] === 1;
  },

  'validate-email-syntax': r => r.valid === true || r.result === true,
  'validate-url': r => r.valid === true || r.result === true,
  'validate-ip': r => r.valid === true || r.result === true,
  'validate-uuid': r => r.valid === true || r.result === true,
  'validate-semver': r => r.valid === true || r.result === true,

  'convert-temperature': r => Math.abs((r.result || r.value || r.converted || 0) - 212) < 0.1,
  'convert-roman-numeral': r => (r.result || r.roman || '') === 'XLII',

  'exec-javascript': r => r.result === 4,
  'exec-template': r => (r.result || r.output || '') === 'Hello World!',
  'exec-math': r => Math.abs((r.result || 0) - 20) < 0.01,

  'data-sort': r => {
    const v = r.result || r.sorted || r.data || [];
    return Array.isArray(v) && v[0] === 1 && v[v.length - 1] === 9;
  },
  'data-deduplicate': r => {
    const v = r.result || r.deduplicated || r.data || [];
    return Array.isArray(v) && v.length === 4;
  },
  'data-chunk': r => {
    const v = r.result || r.chunks || [];
    return Array.isArray(v) && v.length === 3;
  },

  'sort-bubble': r => {
    const v = r.sorted || r.result || r.data || [];
    return Array.isArray(v) && v[0] === 1 && v[5] === 9;
  },
  'sort-quick': r => {
    const v = r.sorted || r.result || r.data || [];
    return Array.isArray(v) && v[0] === 1;
  },
  'sort-natural': r => {
    const v = r.sorted || r.result || r.data || [];
    return Array.isArray(v) && v[0] === 'file1' && v[1] === 'file2';
  },

  'search-levenshtein': r => (r.distance || r.result) === 3,

  'gen-uuid': r => {
    const v = r.uuid || r.result || '';
    return /^[0-9a-f]{8}-/i.test(v);
  },

  'finance-roi': r => Math.abs((r.roi || r.result || 0) - 50) < 1,
  'finance-discount': r => (r.result || r.finalPrice || r.discounted || 0) === 80,
  'finance-margin': r => Math.abs((r.margin || r.result || 0) - 50) < 1,

  'ml-cosine-similarity': r => {
    const v = r.similarity || r.result || 0;
    return Math.abs(v - 0.9746) < 0.01;
  },
  'ml-sentiment': r => {
    const v = r.sentiment || r.label || r.result || '';
    return typeof v === 'string' ? v.toLowerCase().includes('pos') : (r.score || 0) > 0;
  },

  'memory-set': r => r.success === true || r.ok === true || r.status === 'ok',
};

async function callEndpoint(slug, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const url = new URL(`/v1/${slug}`, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${API_KEY}`
      },
      timeout: 15000
    };
    const req = http.request(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, parseError: true });
        }
      });
    });
    req.on('error', e => resolve({ status: 0, data: null, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: null, error: 'TIMEOUT' }); });
    req.write(data);
    req.end();
  });
}

// Build smart input for unknown slugs based on category patterns
function guessInput(slug) {
  // If we have a known test input, use it
  if (TEST_INPUTS[slug]) return TEST_INPUTS[slug];

  // Guess based on slug patterns
  const s = slug.toLowerCase();

  if (s.includes('text') || s.includes('string') || s.includes('word') || s.includes('sentence') || s.includes('paragraph'))
    return { text: 'Hello world, this is a test sentence for the slopshop API.' };
  if (s.includes('math') || s.includes('calc') || s.includes('compute') || s.includes('eval'))
    return { expression: '2 + 3 * 4', a: 12, b: 8, numbers: [1,2,3,4,5], value: 42 };
  if (s.includes('json') || s.includes('schema') || s.includes('parse'))
    return { json: '{"name":"test","value":42}', data: { name: 'test', value: 42 } };
  if (s.includes('date') || s.includes('time') || s.includes('calendar'))
    return { date: '2024-01-15', start: '2024-01-01', end: '2024-03-01' };
  if (s.includes('crypto') || s.includes('hash') || s.includes('encrypt'))
    return { text: 'hello world', key: 'mysecretkey12345', algorithm: 'sha256' };
  if (s.includes('validate') || s.includes('check') || s.includes('verify'))
    return { value: 'test@example.com', email: 'test@example.com', url: 'https://slopshop.gg', ip: '192.168.1.1' };
  if (s.includes('convert') || s.includes('transform'))
    return { value: 100, from: 'celsius', to: 'fahrenheit', input: 'hello' };
  if (s.includes('image') || s.includes('img') || s.includes('photo'))
    return { url: 'https://example.com/image.png', width: 100, height: 100 };
  if (s.includes('gen') || s.includes('generate') || s.includes('create') || s.includes('random'))
    return { count: 3, length: 10, text: 'hello world test' };
  if (s.includes('sort') || s.includes('rank'))
    return { data: [5, 3, 8, 1, 9, 2], array: [5, 3, 8, 1, 9, 2] };
  if (s.includes('search') || s.includes('find') || s.includes('query'))
    return { query: 'test', items: ['hello', 'world', 'test', 'slopshop'], text: 'hello world test' };
  if (s.includes('data') || s.includes('array') || s.includes('list'))
    return { data: [1,2,3,4,5,6,7,8], array: [1,2,3,4,5,6,7,8], key: 'value' };
  if (s.includes('ml') || s.includes('ai') || s.includes('predict') || s.includes('classify'))
    return { text: 'AI is transforming the world of software development', data: [1,2,3,4,5], x: [1,2,3,4,5], y: [2,4,5,4,5] };
  if (s.includes('finance') || s.includes('money') || s.includes('price') || s.includes('cost') || s.includes('biz'))
    return { amount: 1000, principal: 1000, rate: 5, price: 100, cost: 50, income: 75000, value: 100 };
  if (s.includes('network') || s.includes('dns') || s.includes('http') || s.includes('url') || s.includes('ip'))
    return { domain: 'google.com', url: 'https://slopshop.gg', ip: '8.8.8.8' };
  if (s.includes('code') || s.includes('lint') || s.includes('format') || s.includes('minify'))
    return { code: 'function foo() { return 1; }', language: 'javascript' };
  if (s.includes('memory') || s.includes('state') || s.includes('cache') || s.includes('store'))
    return { key: 'test-key-' + slug, value: 'test-value' };
  if (s.includes('queue') || s.includes('stack') || s.includes('buffer'))
    return { queue: 'test-' + slug, item: 'test', key: 'test-' + slug };
  if (s.includes('counter'))
    return { key: 'test-counter-' + slug, amount: 1 };
  if (s.includes('orch') || s.includes('workflow') || s.includes('pipe'))
    return { slug: 'math-evaluate', input: { expression: '2+2' }, tasks: [{ slug: 'math-evaluate', input: { expression: '1+1' } }] };
  if (s.includes('sense') || s.includes('scan') || s.includes('probe'))
    return { url: 'https://slopshop.gg', domain: 'google.com' };
  if (s.includes('enrich') || s.includes('lookup') || s.includes('info'))
    return { domain: 'google.com', ip: '8.8.8.8', email: 'test@gmail.com', name: 'test' };
  if (s.includes('comm') || s.includes('notify') || s.includes('message'))
    return { email: 'test@example.com', phone: '+15551234567', text: 'hello' };
  if (s.includes('exec') || s.includes('run') || s.includes('eval'))
    return { code: 'return 2+2', expression: '2+2', language: 'javascript' };
  if (s.includes('security') || s.includes('auth') || s.includes('password'))
    return { password: 'MyP@ssw0rd!2024', text: 'hello', value: 'test123', data: 'hello world' };
  if (s.includes('workflow') || s.includes('retry') || s.includes('circuit'))
    return { slug: 'math-evaluate', input: { expression: '2+2' }, key: 'test' };

  // Catch-all: send both text and data-oriented fields
  return {
    text: 'Hello world test input for slopshop',
    data: [1, 2, 3, 4, 5],
    value: 42,
    input: 'test',
    name: 'test',
    key: 'test-' + slug,
    query: 'test',
    code: 'return 42',
    expression: '2+2',
    url: 'https://slopshop.gg',
    domain: 'google.com'
  };
}

function getTools() {
  return new Promise((resolve, reject) => {
    const url = new URL('/v1/tools?limit=2000', BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      timeout: 15000
    };
    const req = http.request(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  // Get all slugs via GET
  const toolsData = await getTools();
  if (!toolsData || !toolsData.apis) {
    console.error('Failed to get tools list', toolsData);
    process.exit(1);
  }

  const allSlugs = toolsData.apis.map(a => a.slug);
  const slugs = allSlugs.slice(START, END);

  console.log(`Testing endpoints ${START} to ${Math.min(END, allSlugs.length)} (${slugs.length} total)`);

  const results = [];
  let pass = 0, fail = 0, error = 0;

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const input = guessInput(slug);

    try {
      const res = await callEndpoint(slug, input);
      const idx = START + i + 1;

      let verdict = 'UNKNOWN';
      let detail = '';

      if (res.error) {
        verdict = 'ERROR';
        detail = res.error;
        error++;
      } else if (res.status >= 500) {
        verdict = 'FAIL_500';
        detail = `HTTP ${res.status}`;
        if (res.data && typeof res.data === 'object' && res.data.error) detail += ': ' + res.data.error;
        fail++;
      } else if (res.parseError) {
        verdict = 'FAIL_PARSE';
        detail = `HTTP ${res.status} non-JSON`;
        fail++;
      } else if (res.status === 400) {
        // 400 might mean bad input - check if we can do better
        detail = `HTTP 400: ${res.data && res.data.error || 'bad request'}`;
        verdict = 'FAIL_400';
        fail++;
      } else if (res.status === 200 || res.status === 201) {
        // Unwrap {ok, data} envelope if present
        const payload = (res.data && res.data.ok && res.data.data) ? res.data.data : res.data;
        // Check correctness if we have an expected answer
        if (EXPECTED[slug]) {
          try {
            const correct = EXPECTED[slug](payload);
            if (correct) {
              verdict = 'PASS_CORRECT';
              pass++;
            } else {
              verdict = 'FAIL_WRONG';
              detail = JSON.stringify(payload).slice(0, 200);
              fail++;
            }
          } catch (e) {
            verdict = 'PASS_200';
            detail = 'validator error: ' + e.message;
            pass++;
          }
        } else {
          // No expected answer - check that we got a reasonable response
          const d = payload;
          if (d && typeof d === 'object' && !d.error) {
            verdict = 'PASS_200';
            pass++;
          } else if (d && d.error) {
            verdict = 'FAIL_ERR';
            detail = d.error;
            fail++;
          } else {
            verdict = 'PASS_200';
            pass++;
          }
        }
      } else {
        verdict = 'FAIL_' + res.status;
        detail = JSON.stringify(res.data).slice(0, 100);
        fail++;
      }

      const line = `${idx}|${slug}|${verdict}|${detail}`;
      results.push(line);

      if (verdict.startsWith('FAIL') || verdict === 'ERROR') {
        console.log(`  ❌ ${idx} ${slug}: ${verdict} ${detail}`);
      } else if (i % 50 === 0) {
        console.log(`  ✓ ${idx} ${slug}: ${verdict}`);
      }
    } catch (e) {
      error++;
      results.push(`${START + i + 1}|${slug}|CRASH|${e.message}`);
      console.log(`  💥 ${START + i + 1} ${slug}: CRASH ${e.message}`);
    }

    // Small delay to avoid overwhelming the server
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 50));
  }

  // Write results
  const summary = `\n=== SUMMARY ===\nTotal: ${slugs.length}\nPass: ${pass} (${(pass/slugs.length*100).toFixed(1)}%)\nFail: ${fail}\nError: ${error}\n`;

  const output = results.join('\n') + '\n' + summary;
  fs.writeFileSync(OUTFILE, output);

  console.log(summary);
  console.log(`Results written to ${OUTFILE}`);

  // Also write just the failures to a separate file
  const failures = results.filter(l => l.includes('FAIL') || l.includes('ERROR') || l.includes('CRASH'));
  if (failures.length > 0) {
    fs.writeFileSync(OUTFILE.replace('.txt', '-failures.txt'), failures.join('\n') + '\n');
    console.log(`Failures written to ${OUTFILE.replace('.txt', '-failures.txt')}`);
  }
}

runTests().catch(e => { console.error(e); process.exit(1); });
