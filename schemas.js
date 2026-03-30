/**
 * API SCHEMAS
 *
 * Input/output schemas and examples for every API.
 * These schemas power the MCP tool manifest for agent integration.
 */

// Common input patterns
const TEXT_IN = { text: { type: 'string', description: 'Text to process' } };
const DATA_IN = { data: { type: 'string', description: 'Data to process' } };
const JSON_IN = { json: { type: 'object', description: 'JSON object to process' } };
const URL_IN = { url: { type: 'string', description: 'URL to check' } };
const DOMAIN_IN = { domain: { type: 'string', description: 'Domain name' } };
const CODE_IN = { code: { type: 'string', description: 'Source code' }, language: { type: 'string', description: 'Programming language' } };

const SCHEMAS = {
  // === TEXT PROCESSING ===
  'text-word-count': {
    input: { text: { type: 'string', description: 'Text to count', required: true } },
    output: { words: 'number', characters: 'number', sentences: 'number', paragraphs: 'number' },
    example: { input: { text: 'The quick brown fox jumps.' }, output: { words: 5, characters: 26, sentences: 1 } },
  },
  'text-char-count': {
    input: { text: { type: 'string', description: 'Text to analyze', required: true } },
    output: { total: 'number', no_spaces: 'number', letters: 'number', digits: 'number' },
    example: { input: { text: 'Hello 123' }, output: { total: 9, letters: 5, digits: 3 } },
  },
  'text-extract-emails': {
    input: { text: { type: 'string', description: 'Text containing email addresses', required: true } },
    output: { emails: 'string[]', count: 'number' },
    example: { input: { text: 'Email me at hi@slopshop.gg' }, output: { emails: ['hi@slopshop.gg'], count: 1 } },
  },
  'text-extract-urls': {
    input: { text: { type: 'string', description: 'Text containing URLs', required: true } },
    output: { urls: 'string[]', count: 'number' },
    example: { input: { text: 'Visit https://slopshop.gg' }, output: { urls: ['https://slopshop.gg'], count: 1 } },
  },
  'text-extract-phones': {
    input: { text: { type: 'string', description: 'Text containing phone numbers', required: true } },
    output: { phones: 'string[]', count: 'number' },
    example: { input: { text: 'Call 555-123-4567' }, output: { phones: ['555-123-4567'], count: 1 } },
  },
  'text-extract-numbers': {
    input: { text: { type: 'string', description: 'Text containing numbers', required: true } },
    output: { numbers: 'number[]', count: 'number', sum: 'number' },
    example: { input: { text: 'Order 42 for $99.50' }, output: { numbers: [42, 99.50], sum: 141.5 } },
  },
  'text-extract-dates': {
    input: { text: { type: 'string', description: 'Text containing dates', required: true } },
    output: { dates: 'string[]', count: 'number' },
    example: { input: { text: 'Meeting on 2026-03-25' }, output: { dates: ['2026-03-25'], count: 1 } },
  },
  'text-extract-mentions': {
    input: { text: { type: 'string', description: 'Text with @mentions', required: true } },
    output: { mentions: 'string[]', count: 'number' },
    example: { input: { text: 'Hey @alice and @bob' }, output: { mentions: ['@alice', '@bob'], count: 2 } },
  },
  'text-extract-hashtags': {
    input: { text: { type: 'string', description: 'Text with #hashtags', required: true } },
    output: { hashtags: 'string[]', count: 'number' },
    example: { input: { text: 'Love #slopshop #apis' }, output: { hashtags: ['#slopshop', '#apis'], count: 2 } },
  },
  'text-regex-test': {
    input: { pattern: { type: 'string', description: 'Regex pattern', required: true }, text: { type: 'string', description: 'Text to match against', required: true }, flags: { type: 'string', description: 'Regex flags (default: g)' } },
    output: { matches: 'object[]', count: 'number', valid: 'boolean' },
    example: { input: { pattern: '[0-9]+', text: 'order 42 item 7' }, output: { count: 2, matches: [{ match: '42', index: 6 }, { match: '7', index: 17 }] } },
  },
  'text-regex-replace': {
    input: { pattern: { type: 'string', description: 'Regex pattern', required: true }, text: { type: 'string', description: 'Text to search in', required: true }, replacement: { type: 'string', description: 'Replacement string', required: true } },
    output: { result: 'string', replacements_made: 'number' },
    example: { input: { pattern: '[0-9]+', text: 'order 42', replacement: 'N' }, output: { result: 'order N', replacements_made: 1 } },
  },
  'text-diff': {
    input: { a: { type: 'string', description: 'Original text', required: true }, b: { type: 'string', description: 'Modified text', required: true } },
    output: { added: 'string[]', removed: 'string[]', unchanged: 'number', total_changes: 'number' },
    example: { input: { a: 'hello\nworld', b: 'hello\nlobster' }, output: { added: ['lobster'], removed: ['world'], total_changes: 2 } },
  },
  'text-slugify': {
    input: { text: { type: 'string', description: 'Text to slugify', required: true } },
    output: { slug: 'string' },
    example: { input: { text: 'Hello World!' }, output: { slug: 'hello-world' } },
  },
  'text-truncate': {
    input: { text: { type: 'string', description: 'Text to truncate', required: true }, max_length: { type: 'number', description: 'Max characters (default: 100)' } },
    output: { result: 'string', truncated: 'boolean' },
    example: { input: { text: 'A very long sentence that goes on', max_length: 15 }, output: { result: 'A very long...', truncated: true } },
  },
  'text-language-detect': {
    input: { text: { type: 'string', description: 'Text to detect language of', required: true } },
    output: { detected: 'string', confidence: 'number' },
    example: { input: { text: 'Bonjour le monde' }, output: { detected: 'fr', confidence: 0.6 } },
  },
  'text-profanity-check': {
    input: { text: { type: 'string', description: 'Text to check', required: true } },
    output: { clean: 'boolean', profanity_found: 'string[]', count: 'number' },
    example: { input: { text: 'This is clean text' }, output: { clean: true, profanity_found: [], count: 0 } },
  },
  'text-readability-score': {
    input: { text: { type: 'string', description: 'Text to score', required: true } },
    output: { flesch_kincaid_grade: 'number', flesch_reading_ease: 'number', difficulty: 'string' },
    example: { input: { text: 'The cat sat on the mat.' }, output: { flesch_kincaid_grade: 1.2, difficulty: 'Easy' } },
  },
  'text-keyword-extract': {
    input: { text: { type: 'string', description: 'Text to extract keywords from', required: true }, top: { type: 'number', description: 'Number of keywords (default: 10)' } },
    output: { keywords: 'object[]' },
    example: { input: { text: 'API automation for agents using credits', top: 3 }, output: { keywords: [{ word: 'api', count: 1 }] } },
  },
  'text-sentence-split': {
    input: { text: { type: 'string', description: 'Text to split into sentences', required: true } },
    output: { sentences: 'string[]', count: 'number' },
    example: { input: { text: 'Hello. World!' }, output: { sentences: ['Hello.', 'World!'], count: 2 } },
  },
  'text-deduplicate-lines': {
    input: { text: { type: 'string', description: 'Text with duplicate lines', required: true } },
    output: { result: 'string', original_lines: 'number', unique_lines: 'number', removed: 'number' },
    example: { input: { text: 'a\nb\na' }, output: { result: 'a\nb', removed: 1 } },
  },
  'text-sort-lines': {
    input: { text: { type: 'string', description: 'Text with lines to sort', required: true }, reverse: { type: 'boolean', description: 'Sort descending' }, numeric: { type: 'boolean', description: 'Sort numerically' } },
    output: { result: 'string', lines: 'number' },
    example: { input: { text: 'cherry\napple\nbanana' }, output: { result: 'apple\nbanana\ncherry' } },
  },
  'text-reverse': {
    input: { text: { type: 'string', required: true } },
    output: { result: 'string' },
    example: { input: { text: 'hello' }, output: { result: 'olleh' } },
  },
  'text-case-convert': {
    input: { text: { type: 'string', description: 'Text to convert', required: true } },
    output: { camelCase: 'string', snake_case: 'string', kebab_case: 'string', UPPER: 'string', lower: 'string', Title: 'string' },
    example: { input: { text: 'hello world' }, output: { camelCase: 'helloWorld', snake_case: 'hello_world' } },
  },
  'text-lorem-ipsum': {
    input: { words: { type: 'number', description: 'Number of words (default: 50)' } },
    output: { text: 'string', words: 'number' },
    example: { input: { words: 5 }, output: { text: 'Lorem ipsum dolor sit amet.', words: 5 } },
  },
  'text-count-frequency': {
    input: { text: { type: 'string', required: true } },
    output: { character_frequency: 'object[]', word_frequency: 'object[]' },
    example: { input: { text: 'aab' }, output: { character_frequency: [{ char: 'a', count: 2 }] } },
  },
  'text-strip-html': {
    input: { text: { type: 'string', description: 'HTML to strip tags from', required: true } },
    output: { result: 'string' },
    example: { input: { text: '<b>hello</b>' }, output: { result: 'hello' } },
  },
  'text-escape-html': {
    input: { text: { type: 'string', required: true } },
    output: { result: 'string' },
    example: { input: { text: '<script>alert(1)</script>' }, output: { result: '&lt;script&gt;alert(1)&lt;/script&gt;' } },
  },
  'text-unescape-html': {
    input: { text: { type: 'string', required: true } },
    output: { result: 'string' },
    example: { input: { text: '&lt;b&gt;' }, output: { result: '<b>' } },
  },
  'text-rot13': {
    input: { text: { type: 'string', required: true } },
    output: { result: 'string' },
    example: { input: { text: 'hello' }, output: { result: 'uryyb' } },
  },

  // === NEW TEXT ===
  'text-html-to-text': {
    input: { text: { type: 'string', description: 'HTML content', required: true } },
    output: { result: 'string', original_length: 'number' },
    example: { input: { text: '<h1>Hello</h1><p>World</p>' }, output: { result: 'Hello World' } },
  },
  'text-table-format': {
    input: { rows: { type: 'array', description: 'Array of objects to format as table', required: true } },
    output: { table: 'string', columns: 'number', rows: 'number' },
    example: { input: { rows: [{ name: 'Alice', age: 30 }] }, output: { table: 'name  | age\n------+----\nAlice | 30' } },
  },
  'text-tree-format': {
    input: { data: { type: 'object', description: 'Nested object to format as tree', required: true } },
    output: { tree: 'string' },
    example: { input: { data: { src: { index: 'js', utils: 'js' } } }, output: { tree: 'src\n├── index\n└── utils' } },
  },
  'text-diff-unified': {
    input: { a: { type: 'string', description: 'Original text', required: true }, b: { type: 'string', description: 'Modified text', required: true } },
    output: { unified: 'string', additions: 'number', deletions: 'number' },
    example: { input: { a: 'hello world', b: 'hello lobster' }, output: { additions: 1, deletions: 1 } },
  },

  // === DATA TRANSFORM ===
  'text-markdown-to-html': {
    input: { text: { type: 'string', description: 'Markdown text', required: true } },
    output: { html: 'string' },
    example: { input: { text: '# Hello\n**bold**' }, output: { html: '<h1>Hello</h1>\n<strong>bold</strong>' } },
  },
  'text-csv-to-json': {
    input: { text: { type: 'string', description: 'CSV text', required: true }, separator: { type: 'string', description: 'Delimiter (default: ,)' } },
    output: { rows: 'object[]', headers: 'string[]', count: 'number' },
    example: { input: { text: 'name,age\nalice,30' }, output: { rows: [{ name: 'alice', age: '30' }], count: 1 } },
  },
  'text-json-to-csv': {
    input: { data: { type: 'array', description: 'Array of objects to convert to CSV', required: true } },
    output: { csv: 'string', count: 'number' },
    example: { input: { data: [{ name: 'alice', age: 30 }] }, output: { csv: 'name,age\nalice,30' } },
  },
  'text-xml-to-json': {
    input: { text: { type: 'string', description: 'XML text', required: true } },
    output: { result: 'object', tags_found: 'number' },
    example: { input: { text: '<name>Alice</name>' }, output: { result: { name: 'Alice' } } },
  },
  'text-yaml-to-json': {
    input: { text: { type: 'string', description: 'YAML text', required: true } },
    output: { result: 'object', keys: 'number' },
    example: { input: { text: 'name: Alice\nage: 30' }, output: { result: { name: 'Alice', age: 30 } } },
  },
  'text-json-validate': {
    input: { text: { type: 'string', description: 'JSON string to validate', required: true } },
    output: { valid: 'boolean', error: 'string|null' },
    example: { input: { text: '{"a":1}' }, output: { valid: true } },
  },
  'text-json-format': {
    input: { text: { type: 'string', description: 'JSON string', required: true }, indent: { type: 'number', description: 'Indent spaces (default: 2)' }, minify: { type: 'boolean' } },
    output: { result: 'string' },
    example: { input: { text: '{"a":1}', indent: 2 }, output: { result: '{\n  "a": 1\n}' } },
  },
  'text-json-path': {
    input: { text: { type: 'string', description: 'JSON string to query', required: true }, path: { type: 'string', description: 'Dot-notation path (e.g. "user.name")', required: true } },
    output: { value: 'any', found: 'boolean' },
    example: { input: { text: '{"user":{"name":"Alice"}}', path: 'user.name' }, output: { value: 'Alice', found: true } },
  },
  'text-json-flatten': {
    input: { data: { type: 'object', description: 'Nested JSON object to flatten', required: true } },
    output: { result: 'object', keys: 'number' },
    example: { input: { data: { a: { b: 1 } } }, output: { result: { 'a.b': 1 } } },
  },
  'text-json-unflatten': {
    input: { data: { type: 'object', description: 'Flat JSON object with dot-notation keys', required: true } },
    output: { result: 'object' },
    example: { input: { data: { 'a.b': 1 } }, output: { result: { a: { b: 1 } } } },
  },
  'text-json-diff': {
    input: { a: { type: 'object', description: 'First JSON', required: true }, b: { type: 'object', description: 'Second JSON', required: true } },
    output: { added: 'object[]', removed: 'object[]', changed: 'object[]' },
    example: { input: { a: { x: 1 }, b: { x: 2, y: 3 } }, output: { added: [{ key: 'y' }], changed: [{ key: 'x' }] } },
  },
  'text-json-merge': {
    input: { a: { type: 'object', required: true }, b: { type: 'object', required: true } },
    output: { result: 'object' },
    example: { input: { a: { x: 1 }, b: { y: 2 } }, output: { result: { x: 1, y: 2 } } },
  },
  'text-json-schema-generate': {
    input: { data: { type: 'object', description: 'Example JSON object to generate schema from', required: true } },
    output: { schema: 'object' },
    example: { input: { data: { name: 'Alice', age: 30 } }, output: { schema: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' } } } } },
  },
  'text-base64-encode': {
    input: { text: { type: 'string', required: true } },
    output: { result: 'string' },
    example: { input: { text: 'hello' }, output: { result: 'aGVsbG8=' } },
  },
  'text-base64-decode': {
    input: { text: { type: 'string', description: 'Base64 string', required: true } },
    output: { result: 'string' },
    example: { input: { text: 'aGVsbG8=' }, output: { result: 'hello' } },
  },
  'text-url-encode': { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'hello world' }, output: { result: 'hello%20world' } } },
  'text-url-decode': { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'hello%20world' }, output: { result: 'hello world' } } },
  'text-url-parse': {
    input: { url: { type: 'string', description: 'URL to parse', required: true } },
    output: { protocol: 'string', hostname: 'string', port: 'string', pathname: 'string', params: 'object' },
    example: { input: { url: 'https://slopshop.gg/v1/tools?limit=10' }, output: { hostname: 'slopshop.gg', pathname: '/v1/tools' } },
  },
  'text-hex-encode': { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'hi' }, output: { result: '6869' } } },
  'text-hex-decode': { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: '6869' }, output: { result: 'hi' } } },

  // === CRYPTO ===
  'crypto-hash-sha256': {
    input: { text: { type: 'string', description: 'Text to hash', required: true } },
    output: { hash: 'string', algorithm: 'string' },
    example: { input: { text: 'hello' }, output: { hash: '2cf24dba...', algorithm: 'sha256' } },
  },
  'crypto-hash-sha512': { input: { text: { type: 'string', description: 'Text to hash', required: true } }, output: { hash: 'string' }, example: { input: { text: 'hello' }, output: { hash: '9b71d224...' } } },
  'crypto-hash-md5': { input: { text: { type: 'string', description: 'Text to hash', required: true } }, output: { hash: 'string' }, example: { input: { text: 'hello' }, output: { hash: '5d41402a...' } } },
  'crypto-hmac': {
    input: { text: { type: 'string', description: 'Text to sign', required: true }, secret: { type: 'string', description: 'HMAC secret key', required: true } },
    output: { hmac: 'string', algorithm: 'string' },
    example: { input: { text: 'hello', secret: 'key' }, output: { hmac: 'f7bc83f4...' } },
  },
  'crypto-uuid': { input: {}, output: { uuid: 'string', version: 'number' }, example: { input: {}, output: { uuid: '550e8400-...', version: 4 } } },
  'crypto-nanoid': { input: { length: { type: 'number', description: 'Length (default: 21)' } }, output: { id: 'string' }, example: { input: { length: 12 }, output: { id: 'V1StGXR8_Z5j' } } },
  'crypto-password-generate': {
    input: { length: { type: 'number', description: 'Password length (default: 24)' } },
    output: { password: 'string', entropy_bits: 'number', strength: 'string' },
    example: { input: { length: 16 }, output: { password: 'aB3$xY9!...', strength: 'strong' } },
  },
  'crypto-password-hash': {
    input: { password: { type: 'string', required: true } },
    output: { hash: 'string', algorithm: 'string' },
    example: { input: { password: 'mypassword' }, output: { hash: 'pbkdf2:sha512:...' } },
  },
  'crypto-password-verify': {
    input: { password: { type: 'string', required: true }, hash: { type: 'string', description: 'Hash from crypto-password-hash', required: true } },
    output: { valid: 'boolean' },
    example: { input: { password: 'mypassword', hash: 'pbkdf2:sha512:...' }, output: { valid: true } },
  },
  'crypto-random-bytes': { input: { bytes: { type: 'number', description: 'Number of bytes (default: 32)' } }, output: { hex: 'string' }, example: { input: { bytes: 16 }, output: { hex: 'a1b2c3d4...' } } },
  'crypto-random-int': { input: { min: { type: 'number', description: 'Minimum (default: 0)' }, max: { type: 'number', description: 'Maximum (default: 100)' } }, output: { value: 'number' }, example: { input: { min: 1, max: 100 }, output: { value: 42 } } },
  'crypto-jwt-sign': {
    input: { payload: { type: 'object', description: 'JWT claims', required: true }, secret: { type: 'string', description: 'Signing secret', required: true }, exp: { type: 'number', description: 'Expiry in seconds' } },
    output: { token: 'string', payload: 'object' },
    example: { input: { payload: { user: 'lobster' }, secret: 's3cr3t' }, output: { token: 'eyJ...' } },
  },
  'crypto-jwt-verify': {
    input: { token: { type: 'string', description: 'JWT to verify', required: true }, secret: { type: 'string', required: true } },
    output: { valid: 'boolean', payload: 'object', expired: 'boolean' },
    example: { input: { token: 'eyJ...', secret: 's3cr3t' }, output: { valid: true, expired: false } },
  },
  'crypto-jwt-decode': {
    input: { token: { type: 'string', description: 'JWT to decode (no verification)', required: true } },
    output: { header: 'object', payload: 'object', signature: 'string' },
    example: { input: { token: 'eyJ...' }, output: { payload: { user: 'lobster' } } },
  },
  'crypto-otp-generate': {
    input: { length: { type: 'number', description: 'OTP length (default: 6)' } },
    output: { otp: 'string', expires_in: 'number' },
    example: { input: { length: 6 }, output: { otp: '847291', expires_in: 300 } },
  },
  'crypto-encrypt-aes': {
    input: { text: { type: 'string', description: 'Text to encrypt', required: true }, key: { type: 'string', description: 'Encryption key', required: true } },
    output: { encrypted: 'string', iv: 'string', tag: 'string', algorithm: 'string' },
    example: { input: { text: 'secret', key: 'my-key' }, output: { algorithm: 'aes-256-gcm' } },
  },
  'crypto-decrypt-aes': {
    input: { encrypted: { type: 'string', required: true }, key: { type: 'string', required: true }, iv: { type: 'string', required: true }, tag: { type: 'string', required: true } },
    output: { decrypted: 'string' },
    example: { input: { encrypted: '...', key: 'my-key', iv: '...', tag: '...' }, output: { decrypted: 'secret' } },
  },
  'crypto-checksum': { input: { content: { type: 'string', description: 'Content to checksum', required: true } }, output: { md5: 'string', sha256: 'string', size_bytes: 'number' }, example: { input: { content: 'hello' }, output: { md5: '5d41402a...', sha256: '2cf24dba...' } } },
  'crypto-totp-generate': {
    input: { secret: { type: 'string', description: 'Base32 secret (e.g. JBSWY3DPEHPK3PXP)', required: true } },
    output: { otp: 'string', remaining_seconds: 'number', period: 'number' },
    example: { input: { secret: 'JBSWY3DPEHPK3PXP' }, output: { otp: '123456', period: 30 } },
  },

  // === MATH ===
  'math-evaluate': {
    input: { text: { type: 'string', description: 'Math expression (e.g. (2+3)*4)', required: true } },
    output: { expression: 'string', result: 'number' },
    example: { input: { text: '(2 + 3) * 4' }, output: { result: 20 } },
  },
  'math-statistics': {
    input: { numbers: { type: 'array', description: 'Array of numbers', required: true } },
    output: { count: 'number', sum: 'number', mean: 'number', median: 'number', stddev: 'number', min: 'number', max: 'number' },
    example: { input: { numbers: [1, 2, 3, 4, 5] }, output: { mean: 3, median: 3, stddev: 1.414 } },
  },
  'math-percentile': {
    input: { numbers: { type: 'array', required: true }, percentile: { type: 'number', description: 'Percentile to calculate (0-100)', required: true } },
    output: { value: 'number', percentile: 'number' },
    example: { input: { numbers: [1, 2, 3, 4, 5], percentile: 90 }, output: { value: 4.6 } },
  },
  'math-histogram': {
    input: { numbers: { type: 'array', required: true }, bins: { type: 'number', description: 'Number of bins (default: 10)' } },
    output: { bins: 'object[]', total: 'number' },
    example: { input: { numbers: [1, 2, 3, 4, 5], bins: 3 }, output: { bins: [{ from: 1, to: 2.33, count: 2 }] } },
  },
  'math-currency-convert': {
    input: { amount: { type: 'number', required: true }, from: { type: 'string', description: 'Currency code (USD, EUR, GBP, etc.)', required: true }, to: { type: 'string', required: true } },
    output: { result: 'number', rate: 'number', from: 'string', to: 'string' },
    example: { input: { amount: 100, from: 'USD', to: 'EUR' }, output: { result: 92, rate: 0.92 } },
  },
  'math-unit-convert': {
    input: { value: { type: 'number', required: true }, from: { type: 'string', description: 'Unit (km, miles, kg, lbs, c, f, etc.)', required: true }, to: { type: 'string', required: true } },
    output: { result: 'number', from: 'string', to: 'string' },
    example: { input: { value: 100, from: 'km', to: 'miles' }, output: { result: 62.14 } },
  },
  'math-color-convert': {
    input: { hex: { type: 'string', description: 'Hex color (e.g. #3b82f6)', required: true } },
    output: { hex: 'string', rgb: 'object', hsl: 'object' },
    example: { input: { hex: '#ff0000' }, output: { rgb: { r: 255, g: 0, b: 0 }, hsl: { h: 0, s: 100, l: 50 } } },
  },
  'math-number-format': {
    input: { number: { type: 'number', required: true }, locale: { type: 'string', description: 'Locale (default: en-US)' }, currency: { type: 'string', description: 'Currency code for formatting' } },
    output: { formatted: 'string', currency: 'string', percentage: 'string' },
    example: { input: { number: 1234567.89, currency: 'USD' }, output: { formatted: '1,234,567.89', currency: '$1,234,567.89' } },
  },
  'math-compound-interest': {
    input: { principal: { type: 'number', required: true }, rate: { type: 'number', description: 'Annual rate (e.g. 0.07 for 7%)', required: true }, years: { type: 'number', required: true }, compounds_per_year: { type: 'number', description: 'Compounding frequency (default: 12)' } },
    output: { final_amount: 'number', interest_earned: 'number' },
    example: { input: { principal: 10000, rate: 0.07, years: 10 }, output: { final_amount: 20096.61, interest_earned: 10096.61 } },
  },
  'math-loan-payment': {
    input: { principal: { type: 'number', required: true }, annual_rate: { type: 'number', required: true }, years: { type: 'number', required: true } },
    output: { monthly_payment: 'number', total_paid: 'number', total_interest: 'number' },
    example: { input: { principal: 300000, annual_rate: 0.065, years: 30 }, output: { monthly_payment: 1896.20 } },
  },
  'math-roi-calculate': {
    input: { cost: { type: 'number', required: true }, revenue: { type: 'number', required: true } },
    output: { profit: 'number', roi_percent: 'number' },
    example: { input: { cost: 1000, revenue: 3000 }, output: { profit: 2000, roi_percent: 200 } },
  },
  'math-percentage-change': {
    input: { from: { type: 'number', required: true }, to: { type: 'number', required: true } },
    output: { change: 'number', percentage: 'number', direction: 'string' },
    example: { input: { from: 80, to: 100 }, output: { percentage: 25, direction: 'increase' } },
  },
  'math-fibonacci': { input: { n: { type: 'number', description: 'Number of terms', required: true } }, output: { sequence: 'number[]' }, example: { input: { n: 8 }, output: { sequence: [0, 1, 1, 2, 3, 5, 8, 13] } } },
  'math-prime-check': { input: { number: { type: 'number', required: true } }, output: { is_prime: 'boolean', next_prime: 'number' }, example: { input: { number: 17 }, output: { is_prime: true, next_prime: 19 } } },
  'math-gcd': { input: { numbers: { type: 'array', description: 'Two or more numbers', required: true } }, output: { gcd: 'number' }, example: { input: { numbers: [12, 18] }, output: { gcd: 6 } } },
  'math-lcm': { input: { numbers: { type: 'array', required: true } }, output: { lcm: 'number' }, example: { input: { numbers: [4, 6] }, output: { lcm: 12 } } },
  'math-base-convert': {
    input: { text: { type: 'string', description: 'Number as string', required: true }, from_base: { type: 'number', description: 'Source base (2,8,10,16)', required: true }, to_base: { type: 'number', required: true } },
    output: { result: 'string', decimal: 'number', binary: 'string', hex: 'string' },
    example: { input: { text: '255', from_base: 10, to_base: 16 }, output: { result: 'ff', binary: '11111111' } },
  },
  'math-mortgage-amortize': {
    input: { principal: { type: 'number', required: true }, annual_rate: { type: 'number', required: true }, years: { type: 'number', required: true } },
    output: { monthly_payment: 'number', schedule: 'object[]', total_paid: 'number', total_interest: 'number' },
    example: { input: { principal: 300000, annual_rate: 0.065, years: 30 }, output: { monthly_payment: 1896.20 } },
  },
  'math-tax-estimate': {
    input: { income: { type: 'number', description: 'Annual income', required: true }, filing_status: { type: 'string', description: '"single" or "married"', required: true } },
    output: { tax: 'number', effective_rate: 'number', marginal_rate: 'number', brackets: 'object[]' },
    example: { input: { income: 150000, filing_status: 'single' }, output: { tax: 28847, effective_rate: 19.23 } },
  },
  'math-matrix-multiply': {
    input: { a: { type: 'array', description: '2D array (matrix A)', required: true }, b: { type: 'array', description: '2D array (matrix B)', required: true } },
    output: { result: 'array', rows: 'number', cols: 'number' },
    example: { input: { a: [[1, 2], [3, 4]], b: [[5, 6], [7, 8]] }, output: { result: [[19, 22], [43, 50]] } },
  },

  // === DATE ===
  'date-parse': {
    input: { date: { type: 'string', description: 'Date string to parse', required: true } },
    output: { iso: 'string', unix: 'number', year: 'number', month: 'number', day: 'number', day_of_week: 'string' },
    example: { input: { date: '2026-03-25' }, output: { iso: '2026-03-25T00:00:00.000Z', day_of_week: 'Wednesday' } },
  },
  'date-format': {
    input: { date: { type: 'string', required: true }, format: { type: 'string', description: 'Pattern: YYYY, MM, DD, HH, mm, ss' } },
    output: { formatted: 'string' },
    example: { input: { date: '2026-03-25', format: 'MM/DD/YYYY' }, output: { formatted: '03/25/2026' } },
  },
  'date-diff': {
    input: { from: { type: 'string', description: 'Start date', required: true }, to: { type: 'string', description: 'End date', required: true } },
    output: { days: 'number', hours: 'number', minutes: 'number', weeks: 'number' },
    example: { input: { from: '2026-01-01', to: '2026-03-25' }, output: { days: 83 } },
  },
  'date-add': {
    input: { date: { type: 'string', required: true }, days: { type: 'number' }, hours: { type: 'number' }, months: { type: 'number' } },
    output: { result: 'string' },
    example: { input: { date: '2026-03-25', days: 7 }, output: { result: '2026-04-01T...' } },
  },
  'date-weekday': { input: { date: { type: 'string', required: true } }, output: { day: 'string', is_weekend: 'boolean' }, example: { input: { date: '2026-03-25' }, output: { day: 'Wednesday', is_weekend: false } } },
  'date-is-business-day': { input: { date: { type: 'string', required: true } }, output: { is_business_day: 'boolean', day_name: 'string' }, example: { input: { date: '2026-03-25' }, output: { is_business_day: true } } },
  'date-business-days-between': {
    input: { from: { type: 'string', required: true }, to: { type: 'string', required: true } },
    output: { business_days: 'number', calendar_days: 'number' },
    example: { input: { from: '2026-03-23', to: '2026-03-27' }, output: { business_days: 5 } },
  },
  'date-cron-parse': {
    input: { cron: { type: 'string', description: 'Cron expression (e.g. "30 9 * * 1-5")', required: true } },
    output: { parsed: 'object', valid: 'boolean', human: 'string' },
    example: { input: { cron: '30 9 * * 1-5' }, output: { human: 'At 9:30, Monday through Friday' } },
  },
  'date-cron-next': {
    input: { cron: { type: 'string', required: true }, count: { type: 'number', description: 'How many next runs (default: 5)' } },
    output: { next_runs: 'string[]' },
    example: { input: { cron: '0 9 * * *', count: 3 }, output: { next_runs: ['2026-03-26T09:00:00Z', '...'] } },
  },
  'date-unix-to-iso': { input: { timestamp: { type: 'number', description: 'Unix timestamp (seconds or ms)', required: true } }, output: { iso: 'string' }, example: { input: { timestamp: 1774425600 }, output: { iso: '2026-03-25T...' } } },
  'date-iso-to-unix': { input: { date: { type: 'string', required: true } }, output: { unix: 'number' }, example: { input: { date: '2026-03-25' }, output: { unix: 1774425600 } } },
  'date-relative': { input: { date: { type: 'string', required: true } }, output: { relative: 'string', direction: 'string' }, example: { input: { date: '2026-03-22' }, output: { relative: '3 days ago' } } },
  'date-holidays': {
    input: { year: { type: 'number', description: 'Year (e.g. 2026)', required: true } },
    output: { holidays: 'object[]', count: 'number' },
    example: { input: { year: 2026 }, output: { count: 11, holidays: [{ name: "New Year's Day", date: '2026-01-01' }] } },
  },

  // === CODE ===
  'code-json-to-typescript': {
    input: { json: { type: 'object', description: 'Example JSON', required: true }, name: { type: 'string', description: 'Interface name (default: Root)' } },
    output: { typescript: 'string' },
    example: { input: { json: { name: 'Alice', age: 30 }, name: 'User' }, output: { typescript: 'interface User {\n  name: string;\n  age: number;\n}' } },
  },
  'code-json-to-python-class': {
    input: { json: { type: 'object', required: true }, name: { type: 'string' } },
    output: { python: 'string' },
    example: { input: { json: { name: 'Alice' }, name: 'User' }, output: { python: '@dataclass\nclass User:\n    name: str' } },
  },
  'code-json-to-go-struct': {
    input: { json: { type: 'object', required: true }, name: { type: 'string' } },
    output: { go_struct: 'string' },
    example: { input: { json: { name: 'Alice' }, name: 'User' }, output: { go_struct: 'type User struct {\n\tName string `json:"name"`\n}' } },
  },
  'code-sql-format': {
    input: { text: { type: 'string', description: 'SQL query to format', required: true } },
    output: { formatted: 'string' },
    example: { input: { text: 'select * from users where id=1' }, output: { formatted: 'SELECT *\nFROM users\nWHERE id=1' } },
  },
  'code-cron-explain': { input: { cron: { type: 'string', required: true } }, output: { human: 'string' }, example: { input: { cron: '0 9 * * 1-5' }, output: { human: 'At 9:00, Monday through Friday' } } },
  'code-regex-explain': {
    input: { pattern: { type: 'string', description: 'Regex pattern', required: true } },
    output: { tokens_found: 'object[]' },
    example: { input: { pattern: '\\d+\\.?\\d*' }, output: { tokens_found: [{ token: '\\d', meaning: 'digit' }] } },
  },
  'code-semver-compare': {
    input: { a: { type: 'string', required: true }, b: { type: 'string', required: true } },
    output: { result: 'number', description: 'string' },
    example: { input: { a: '2.0.0', b: '1.9.9' }, output: { result: 1, description: '2.0.0 is newer' } },
  },
  'code-semver-bump': {
    input: { version: { type: 'string', required: true }, bump: { type: 'string', description: '"patch", "minor", or "major"', required: true } },
    output: { bumped: 'string', type: 'string' },
    example: { input: { version: '1.2.3', bump: 'minor' }, output: { bumped: '1.3.0' } },
  },
  'code-diff-stats': {
    input: { text: { type: 'string', description: 'Unified diff text', required: true } },
    output: { files_changed: 'number', additions: 'number', deletions: 'number' },
    example: { input: { text: '--- a/file\n+++ b/file\n-old\n+new' }, output: { additions: 1, deletions: 1 } },
  },
  'code-env-parse': {
    input: { text: { type: 'string', description: '.env file content', required: true } },
    output: { variables: 'object', count: 'number' },
    example: { input: { text: 'API_KEY=abc123\nDEBUG=true' }, output: { variables: { API_KEY: 'abc123', DEBUG: 'true' }, count: 2 } },
  },
  'code-jwt-inspect': {
    input: { token: { type: 'string', required: true } },
    output: { header: 'object', payload: 'object' },
    example: { input: { token: 'eyJ...' }, output: { payload: { sub: 'user' } } },
  },
  'code-openapi-validate': {
    input: { text: { type: 'string', description: 'OpenAPI spec as JSON string', required: true } },
    output: { valid: 'boolean', errors: 'string[]', version: 'string', paths_count: 'number' },
    example: { input: { text: '{"openapi":"3.0.0","info":{"title":"My API","version":"1.0"}, "paths":{}}' }, output: { valid: true, paths_count: 0 } },
  },
  'code-dockerfile-lint': {
    input: { text: { type: 'string', description: 'Dockerfile content', required: true } },
    output: { issues: 'object[]', score: 'number' },
    example: { input: { text: 'FROM ubuntu:latest' }, output: { issues: [{ rule: 'latest-tag', message: 'Avoid :latest' }], score: 90 } },
  },
  'code-gitignore-generate': {
    input: { languages: { type: 'array', description: 'Languages: node, python, go, rust, java, ruby', required: true } },
    output: { gitignore: 'string' },
    example: { input: { languages: ['node'] }, output: { gitignore: 'node_modules/\n.env\ndist/' } },
  },
  'text-cron-to-english': {
    input: { cron: { type: 'string', required: true } },
    output: { english: 'string', expression: 'string' },
    example: { input: { cron: '0 9 * * 1-5' }, output: { english: 'At 09:00 AM, Monday through Friday' } },
  },

  // === GENERATE ===
  'gen-fake-name': { input: {}, output: { first: 'string', last: 'string', full: 'string' }, example: { input: {}, output: { full: 'Alice Smith' } } },
  'gen-fake-email': { input: {}, output: { email: 'string' }, example: { input: {}, output: { email: 'alice.smith@example.com' } } },
  'gen-fake-company': { input: {}, output: { company: 'string' }, example: { input: {}, output: { company: 'Acme Corp' } } },
  'gen-fake-address': { input: {}, output: { street: 'string', city: 'string', state: 'string', zip: 'string' }, example: { input: {}, output: { street: '123 Main St', city: 'Springfield' } } },
  'gen-fake-phone': { input: {}, output: { phone: 'string' }, example: { input: {}, output: { phone: '(555) 123-4567' } } },
  // gen-fake-user and gen-fake-credit-card REMOVED — liability risk
  'gen-color-palette': {
    input: { hex: { type: 'string', description: 'Base hex color (e.g. #3b82f6)' } },
    output: { palette: 'string[]', names: 'string[]' },
    example: { input: { hex: '#3b82f6' }, output: { palette: ['#3b82f6', '#63a2ff', '#1362d6'] } },
  },
  'gen-short-id': { input: { length: { type: 'number', description: 'ID length (default: 8)' } }, output: { id: 'string' }, example: { input: { length: 8 }, output: { id: 'xK9mZp3q' } } },
  'gen-avatar-svg': {
    input: { text: { type: 'string', description: 'Seed text for identicon', required: true } },
    output: { svg: 'string', seed: 'string' },
    example: { input: { text: 'lobster' }, output: { svg: '<svg>...</svg>' } },
  },
  'gen-qr-svg': {
    input: { data: { type: 'string', description: 'Data to encode', required: true } },
    output: { svg: 'string', modules: 'number' },
    example: { input: { data: 'https://slopshop.gg' }, output: { svg: '<svg>...</svg>', modules: 21 } },
  },

  // === NETWORK ===
  'net-dns-a': { input: { domain: { type: 'string', required: true } }, output: { addresses: 'string[]' }, example: { input: { domain: 'google.com' }, output: { addresses: ['142.250.80.46'] } } },
  'net-dns-aaaa': { input: { domain: { type: 'string', required: true } }, output: { addresses: 'string[]' }, example: { input: { domain: 'google.com' }, output: { addresses: ['2607:f8b0::'] } } },
  'net-dns-mx': { input: { domain: { type: 'string', required: true } }, output: { records: 'object[]' }, example: { input: { domain: 'gmail.com' }, output: { records: [{ exchange: 'alt1.gmail-smtp-in.l.google.com' }] } } },
  'net-dns-txt': { input: { domain: { type: 'string', required: true } }, output: { records: 'string[]' }, example: { input: { domain: 'google.com' }, output: { records: ['v=spf1 ...'] } } },
  'net-dns-ns': { input: { domain: { type: 'string', required: true } }, output: { nameservers: 'string[]' }, example: { input: { domain: 'google.com' }, output: { nameservers: ['ns1.google.com'] } } },
  'net-dns-all': { input: { domain: { type: 'string', required: true } }, output: { a: 'string[]', mx: 'object[]', txt: 'string[]', ns: 'string[]' }, example: { input: { domain: 'google.com' } } },
  'net-http-status': {
    input: { url: { type: 'string', description: 'URL to check', required: true } },
    output: { status_code: 'number', headers: 'object', timing_ms: 'number' },
    example: { input: { url: 'https://httpbin.org/get' }, output: { status_code: 200, timing_ms: 150 } },
  },
  'net-http-headers': { input: { url: { type: 'string', required: true } }, output: { headers: 'object', timing_ms: 'number' }, example: { input: { url: 'https://slopshop.gg' } } },
  'net-http-redirect-chain': {
    input: { url: { type: 'string', required: true } },
    output: { chain: 'object[]', final_url: 'string' },
    example: { input: { url: 'http://github.com' }, output: { chain: [{ url: 'http://github.com', status: 301 }], final_url: 'https://github.com' } },
  },
  'net-http-get': {
    input: { url: { type: 'string', required: true }, headers: { type: 'object', description: 'Optional extra request headers' }, max_body: { type: 'number', description: 'Max response body bytes to return (default 4096)' } },
    output: { status_code: 'number', ok: 'boolean', headers: 'object', body: 'string', timing_ms: 'number' },
    example: { input: { url: 'https://httpbin.org/get' }, output: { status_code: 200, ok: true } },
  },
  'net-http-post': {
    input: { url: { type: 'string', required: true }, body: { type: 'any', description: 'Request body (object serialized as JSON, or string)' }, headers: { type: 'object', description: 'Optional extra request headers' }, max_body: { type: 'number', description: 'Max response body bytes to return (default 4096)' } },
    output: { status_code: 'number', ok: 'boolean', headers: 'object', body: 'string', timing_ms: 'number' },
    example: { input: { url: 'https://httpbin.org/post', body: { test: 1 } }, output: { status_code: 200, ok: true } },
  },
  'net-ssl-check': {
    input: { domain: { type: 'string', required: true } },
    output: { subject: 'string', issuer: 'string', valid_from: 'string', valid_to: 'string', days_remaining: 'number' },
    example: { input: { domain: 'slopshop.gg' }, output: { days_remaining: 90 } },
  },
  'net-email-validate': {
    input: { email: { type: 'string', required: true } },
    output: { format_valid: 'boolean', mx_valid: 'boolean', overall_valid: 'boolean' },
    example: { input: { email: 'test@gmail.com' }, output: { format_valid: true, mx_valid: true, overall_valid: true } },
  },
  'net-ip-validate': {
    input: { ip: { type: 'string', required: true } },
    output: { valid: 'boolean', version: 'number', is_private: 'boolean' },
    example: { input: { ip: '192.168.1.1' }, output: { valid: true, version: 4, is_private: true } },
  },
  'net-cidr-contains': {
    input: { ip: { type: 'string', required: true }, cidr: { type: 'string', description: 'CIDR range (e.g. 10.0.0.0/8)', required: true } },
    output: { contains: 'boolean' },
    example: { input: { ip: '10.0.1.5', cidr: '10.0.0.0/8' }, output: { contains: true } },
  },
  'net-ip-geolocation': {
    input: { ip: { type: 'string', required: true } },
    output: { country: 'string', region: 'string', city: 'string', latitude: 'number', longitude: 'number', isp: 'string', asn: 'string' },
    example: { input: { ip: '8.8.8.8' }, output: { country: 'United States', city: 'Mountain View', isp: 'AS15169 Google LLC' } },
  },
  'net-ping': {
    input: { host: { type: 'string', required: true }, ports: { type: 'array', description: 'TCP ports to probe (default [80, 443])' }, timeout_ms: { type: 'number', description: 'Probe timeout in ms (max 10000, default 5000)' } },
    output: { reachable: 'boolean', probes: 'object[]' },
    example: { input: { host: 'google.com' }, output: { reachable: true, probes: [{ port: 80, open: true, latency_ms: 12 }] } },
  },
  'net-port-scan': {
    input: { host: { type: 'string', required: true }, ports: { type: 'array', description: 'List of TCP ports to scan (default: common ports, max 50)' }, timeout_ms: { type: 'number', description: 'Per-port timeout in ms (max 10000, default 3000)' } },
    output: { open: 'object[]', closed: 'object[]', scanned: 'number', open_count: 'number' },
    example: { input: { host: 'google.com', ports: [80, 443, 22] }, output: { open_count: 2, open: [{ port: 80 }, { port: 443 }] } },
  },
  'net-url-parse': {
    input: { url: { type: 'string', description: 'URL to parse', required: true } },
    output: { protocol: 'string', hostname: 'string', pathname: 'string', params: 'object' },
    example: { input: { url: 'https://slopshop.gg/v1/tools?limit=10' }, output: { hostname: 'slopshop.gg' } },
  },
  'net-url-expand': {
    input: { url: { type: 'string', required: true, description: 'Shortened or redirect URL to expand' } },
    output: { original_url: 'string', final_url: 'string', was_redirected: 'boolean', hops: 'number', chain: 'object[]' },
    example: { input: { url: 'https://bit.ly/3abc123' }, output: { final_url: 'https://example.com/long-path', was_redirected: true, hops: 2 } },
  },
  'net-robots-txt': {
    input: { url: { type: 'string', description: 'Domain or URL to fetch robots.txt for', required: true } },
    output: { found: 'boolean', groups: 'object[]', sitemaps: 'string[]', wildcard_disallow: 'string[]' },
    example: { input: { url: 'https://google.com' }, output: { found: true, sitemaps: ['https://www.google.com/sitemap.xml'] } },
  },
  'net-sitemap': {
    input: { url: { type: 'string', description: 'Domain or URL to fetch sitemap for', required: true }, max_urls: { type: 'number', description: 'Max URLs to return (default 100)' } },
    output: { found: 'boolean', sitemap_type: 'string', url_count: 'number', urls: 'object[]' },
    example: { input: { url: 'https://slopshop.gg' }, output: { found: true, url_count: 42, sitemap_type: 'urlset' } },
  },

  // === LLM APIs (all have same basic schema but different descriptions) ===
  ...Object.fromEntries([
    'llm-blog-outline', 'llm-blog-draft', 'llm-landing-page-copy', 'llm-product-description',
    'llm-email-draft', 'llm-email-reply', 'llm-cold-outreach', 'llm-ad-copy',
    'llm-social-post', 'llm-video-script', 'llm-press-release', 'llm-tagline',
    'llm-summarize', 'llm-summarize-thread', 'llm-sentiment', 'llm-classify',
    'llm-extract-entities', 'llm-extract-action-items', 'llm-extract-key-points',
    'llm-tone-analyze', 'llm-translate', 'llm-rewrite', 'llm-proofread',
    'llm-explain-code', 'llm-explain-error', 'llm-explain-command', 'llm-explain-regex', 'llm-explain-sql',
    'llm-code-generate', 'llm-code-review', 'llm-code-refactor', 'llm-code-test-generate',
    'llm-code-document', 'llm-code-convert', 'llm-sql-generate', 'llm-regex-generate',
    'llm-commit-message', 'llm-pr-description',
    'llm-meeting-prep', 'llm-decision-analyze', 'llm-job-description', 'llm-interview-questions',
    'llm-performance-review', 'llm-proposal-draft', 'llm-contract-summarize',
    'llm-legal-clause-explain', 'llm-support-reply', 'llm-competitor-brief',
  ].map(slug => {
    const isCode = slug.includes('code') || slug.includes('explain-code') || slug.includes('commit') || slug.includes('pr-desc');
    const isText = slug.includes('summarize') || slug.includes('translate') || slug.includes('rewrite') || slug.includes('proofread') || slug.includes('sentiment') || slug.includes('classify') || slug.includes('extract') || slug.includes('tone');
    return [slug, {
      input: isCode
        ? { code: { type: 'string', description: 'Source code', required: true }, language: { type: 'string', description: 'Programming language' } }
        : { text: { type: 'string', description: 'Text to process', required: true }, ...(slug.includes('translate') ? { to: { type: 'string', description: 'Target language' } } : {}), ...(slug.includes('classify') ? { categories: { type: 'array', description: 'Categories to classify into' } } : {}) },
      output: { result: 'string|object' },
      example: isCode
        ? { input: { code: 'function add(a,b){return a+b}', language: 'javascript' } }
        : { input: { text: 'Sample text for processing' } },
    }];
  })),
};

// === AGENT-CRITICAL APIs ===
SCHEMAS['llm-output-extract-json'] = {
  input: { text: { type: 'string', description: 'LLM output that may contain JSON (with markdown, code fences, etc.)', required: true } },
  output: { json: 'object|array', method: 'string', raw_match: 'string' },
  example: { input: { text: 'Here is the result:\n```json\n{"name":"Alice"}\n```\nHope that helps!' }, output: { json: { name: 'Alice' }, method: 'code_fence' } },
};
SCHEMAS['llm-output-validate'] = {
  input: { output: { type: 'string', description: 'LLM output (string or object)', required: true }, schema: { type: 'object', description: 'JSON Schema to validate against', required: true } },
  output: { valid: 'boolean', errors: 'object[]' },
  example: { input: { output: '{"name":"Alice"}', schema: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' } }, required: ['name', 'age'] } }, output: { valid: false, errors: [{ path: 'age', message: 'missing required field' }] } },
};
SCHEMAS['llm-output-fix-json'] = {
  input: { text: { type: 'string', description: 'Broken JSON from LLM output', required: true } },
  output: { fixed: 'object', repairs: 'string[]' },
  example: { input: { text: "{'name': 'Alice', age: 30,}" }, output: { fixed: { name: 'Alice', age: 30 }, repairs: ['replaced single quotes', 'removed trailing comma'] } },
};
SCHEMAS['json-schema-validate'] = {
  input: { data: { type: 'object', description: 'Data to validate', required: true }, schema: { type: 'object', description: 'JSON Schema (draft-07)', required: true } },
  output: { valid: 'boolean', errors: 'object[]' },
  example: { input: { data: { name: 'Alice', age: 'thirty' }, schema: { type: 'object', properties: { age: { type: 'number' } } } }, output: { valid: false, errors: [{ path: 'age', message: 'expected number, got string' }] } },
};
SCHEMAS['text-token-estimate-cost'] = {
  input: { text: { type: 'string', description: 'Text to estimate tokens for', required: true }, model: { type: 'string', description: 'Model name (claude-sonnet-4-6-20250514, claude-opus-4-6-20250514, claude-haiku-4-5-20251001, gpt-4o, gpt-4o-mini, gemini-2.0-flash)' } },
  output: { tokens: 'number', model: 'string', input_cost_usd: 'number', output_cost_usd: 'number' },
  example: { input: { text: 'Hello world', model: 'claude-sonnet-4-6-20250514' }, output: { tokens: 3, input_cost_usd: 0.000009, output_cost_usd: 0.000045 } },
};
SCHEMAS['webhook-send'] = {
  input: { url: { type: 'string', description: 'URL to POST to', required: true }, body: { type: 'object', description: 'JSON payload' }, headers: { type: 'object', description: 'Custom headers' }, method: { type: 'string', description: 'HTTP method (default: POST)' } },
  output: { status_code: 'number', response_body: 'string', timing_ms: 'number' },
  example: { input: { url: 'https://httpbin.org/post', body: { test: true } }, output: { status_code: 200, timing_ms: 150 } },
};
SCHEMAS['file-download'] = {
  input: { url: { type: 'string', description: 'URL to download', required: true } },
  output: { content: 'string', content_type: 'string', size_bytes: 'number' },
  example: { input: { url: 'https://httpbin.org/robots.txt' }, output: { content: 'User-agent: *\nDisallow: /deny', content_type: 'text/plain' } },
};
SCHEMAS['kv-get'] = {
  input: { key: { type: 'string', description: 'Key to retrieve', required: true }, namespace: { type: 'string', description: 'Namespace (default: default)' } },
  output: { key: 'string', value: 'any', found: 'boolean' },
  example: { input: { key: 'user_preference' }, output: { key: 'user_preference', value: 'dark_mode', found: true } },
};
SCHEMAS['kv-set'] = {
  input: { key: { type: 'string', required: true }, value: { type: 'any', description: 'Any JSON value', required: true }, namespace: { type: 'string' } },
  output: { key: 'string', status: 'string' },
  example: { input: { key: 'user_preference', value: 'dark_mode' }, output: { status: 'stored' } },
};
SCHEMAS['kv-list'] = {
  input: { namespace: { type: 'string', description: 'Namespace (default: default)' } },
  output: { keys: 'string[]', count: 'number' },
  example: { input: {}, output: { keys: ['user_preference', 'last_run'], count: 2 } },
};

SCHEMAS['math-solve-quadratic'] = {
  input: { a: { type: 'number', description: 'Coefficient a', required: true }, b: { type: 'number', description: 'Coefficient b', required: true }, c: { type: 'number', description: 'Coefficient c', required: true } },
  output: { roots: 'number[]', discriminant: 'number', equation: 'string' },
  example: { input: { a: 1, b: -3, c: 2 }, output: { roots: [2, 1], discriminant: 1 } },
};
SCHEMAS['date-is-leap-year'] = {
  input: { year: { type: 'number', description: 'Year to check', required: true } },
  output: { year: 'number', result: 'boolean', isLeapYear: 'boolean' },
  example: { input: { year: 2024 }, output: { year: 2024, result: true, isLeapYear: true } },
};
SCHEMAS['search-levenshtein'] = {
  input: { a: { type: 'string', description: 'First string' }, b: { type: 'string', description: 'Second string' } },
  output: { distance: 'number', similarity: 'number' },
  example: { input: { a: 'kitten', b: 'sitting' }, output: { distance: 3 } },
};
SCHEMAS['ml-sentiment'] = {
  input: { text: { type: 'string', description: 'Text to analyze', required: true } },
  output: { sentiment: 'string', score: 'number', positive: 'number', negative: 'number' },
  example: { input: { text: 'I love this product' }, output: { sentiment: 'positive', score: 1 } },
};
SCHEMAS['validate-url'] = {
  input: { url: { type: 'string', description: 'URL to validate', required: true } },
  output: { valid: 'boolean', protocol: 'string', hostname: 'string' },
  example: { input: { url: 'https://slopshop.gg' }, output: { valid: true, protocol: 'https:', hostname: 'slopshop.gg' } },
};


// === STATS ===
SCHEMAS['stats-mean'] = { input: { numbers: { type: 'array', description: 'Array of numbers', required: true } }, output: { mean: 'number', count: 'number' }, example: { input: { numbers: [1,2,3,4,5] }, output: { mean: 3, count: 5 } } };
SCHEMAS['stats-median'] = { input: { numbers: { type: 'array', required: true } }, output: { median: 'number', count: 'number' }, example: { input: { numbers: [1,2,3] }, output: { median: 2 } } };
SCHEMAS['stats-stddev'] = { input: { numbers: { type: 'array', required: true } }, output: { stddev: 'number', variance: 'number', mean: 'number' }, example: { input: { numbers: [2,4,4,4,5,5,7,9] }, output: { stddev: 2, mean: 5 } } };
SCHEMAS['stats-percentile'] = { input: { numbers: { type: 'array', required: true }, p: { type: 'number', description: 'Percentile 0-100', required: true } }, output: { value: 'number', percentile: 'number' }, example: { input: { numbers: [1,2,3,4,5], p: 50 }, output: { value: 3, percentile: 50 } } };
SCHEMAS['stats-correlation'] = { input: { x: { type: 'array', required: true }, y: { type: 'array', required: true } }, output: { correlation: 'number', interpretation: 'string' }, example: { input: { x: [1,2,3], y: [1,2,3] }, output: { correlation: 1, interpretation: 'perfect positive' } } };
SCHEMAS['stats-histogram'] = { input: { numbers: { type: 'array', required: true }, bins: { type: 'number', description: 'Number of bins (default: 10)' } }, output: { bins: 'object[]', min: 'number', max: 'number' }, example: { input: { numbers: [1,2,3,4,5], bins: 3 }, output: { bins: [{ label: '1-2', count: 2 }] } } };
SCHEMAS['stats-summary'] = { input: { numbers: { type: 'array', required: true } }, output: { mean: 'number', median: 'number', stddev: 'number', min: 'number', max: 'number', sum: 'number', count: 'number' }, example: { input: { numbers: [1,2,3] }, output: { mean: 2, min: 1, max: 3 } } };

// === LLM (missing) ===
SCHEMAS['llm-think'] = { input: { prompt: { type: 'string', description: 'Free-form reasoning prompt', required: true }, context: { type: 'string', description: 'Additional context' }, model: { type: 'string', description: 'Model override' } }, output: { result: 'string', tokens_used: 'number' }, example: { input: { prompt: 'What are the risks of this plan?' }, output: { result: 'The main risks are...' } } };
SCHEMAS['llm-council'] = { input: { prompt: { type: 'string', required: true }, perspectives: { type: 'number', description: 'Number of viewpoints (default: 3)' } }, output: { perspectives: 'object[]', synthesis: 'string' }, example: { input: { prompt: 'Should we pivot?' }, output: { synthesis: 'Council agrees on...' } } };
SCHEMAS['llm-data-extract'] = { input: { text: { type: 'string', required: true }, schema: { type: 'object', description: 'Target JSON schema to extract into' } }, output: { extracted: 'object', confidence: 'number' }, example: { input: { text: 'Order 42, $99', schema: { order: 'number', amount: 'number' } }, output: { extracted: { order: 42, amount: 99 } } } };
SCHEMAS['llm-email-subject'] = { input: { body: { type: 'string', description: 'Email body text', required: true }, tone: { type: 'string', description: 'Tone: professional|friendly|urgent' } }, output: { subject: 'string', alternatives: 'string[]' }, example: { input: { body: 'Meeting tomorrow at 3pm' }, output: { subject: 'Meeting Reminder: Tomorrow at 3pm' } } };
SCHEMAS['llm-seo-meta'] = { input: { content: { type: 'string', required: true }, target_keyword: { type: 'string' } }, output: { title: 'string', meta_description: 'string', keywords: 'string[]' }, example: { input: { content: 'API platform for agents' }, output: { title: 'Agent API Platform | Slopshop' } } };
SCHEMAS['llm-changelog'] = { input: { commits: { type: 'string', description: 'Git commits or diff', required: true }, version: { type: 'string' } }, output: { changelog: 'string', breaking_changes: 'string[]' }, example: { input: { commits: 'fix: auth bug\nfeat: add batch' }, output: { changelog: '## v1.1.0\n- Fixed auth\n- Added batch' } } };
SCHEMAS['llm-api-doc'] = { input: { code: { type: 'string', required: true }, language: { type: 'string' } }, output: { documentation: 'string', endpoints: 'object[]' }, example: { input: { code: 'app.get("/health", ...)' }, output: { documentation: '# API Docs\n## GET /health' } } };
SCHEMAS['llm-bug-report'] = { input: { description: { type: 'string', required: true }, stack_trace: { type: 'string' }, context: { type: 'string' } }, output: { report: 'string', severity: 'string', suggested_fix: 'string' }, example: { input: { description: 'Login fails on mobile' }, output: { severity: 'high', report: '## Bug Report...' } } };
SCHEMAS['llm-user-story'] = { input: { feature: { type: 'string', required: true }, persona: { type: 'string' } }, output: { story: 'string', acceptance_criteria: 'string[]' }, example: { input: { feature: 'dark mode' }, output: { story: 'As a user I want dark mode...' } } };
SCHEMAS['llm-okr-generate'] = { input: { goal: { type: 'string', required: true }, timeframe: { type: 'string' } }, output: { objective: 'string', key_results: 'string[]' }, example: { input: { goal: 'grow revenue' }, output: { objective: 'Drive revenue growth', key_results: ['ARR +50%'] } } };
SCHEMAS['llm-faq-generate'] = { input: { topic: { type: 'string', required: true }, count: { type: 'number', description: 'Number of FAQs (default: 5)' } }, output: { faqs: 'object[]' }, example: { input: { topic: 'API keys' }, output: { faqs: [{ q: 'How do I get a key?', a: 'Sign up at...' }] } } };
SCHEMAS['llm-persona-create'] = { input: { role: { type: 'string', required: true }, traits: { type: 'string' } }, output: { persona: 'string', system_prompt: 'string' }, example: { input: { role: 'senior engineer' }, output: { system_prompt: 'You are a senior engineer...' } } };
SCHEMAS['llm-swot-analysis'] = { input: { subject: { type: 'string', required: true } }, output: { strengths: 'string[]', weaknesses: 'string[]', opportunities: 'string[]', threats: 'string[]' }, example: { input: { subject: 'our new API product' }, output: { strengths: ['Fast', 'Cheap'] } } };
SCHEMAS['llm-executive-summary'] = { input: { text: { type: 'string', required: true }, max_words: { type: 'number', description: 'Max words (default: 150)' } }, output: { summary: 'string', key_points: 'string[]' }, example: { input: { text: 'Long report...' }, output: { summary: 'The report shows...' } } };
SCHEMAS['llm-slack-summary'] = { input: { messages: { type: 'string', description: 'Slack thread or channel dump', required: true } }, output: { summary: 'string', action_items: 'string[]', decisions: 'string[]' }, example: { input: { messages: 'alice: ship it\nbob: agreed' }, output: { summary: 'Team agreed to ship', action_items: [] } } };
SCHEMAS['llm-meeting-agenda'] = { input: { topic: { type: 'string', required: true }, duration_minutes: { type: 'number' }, attendees: { type: 'string' } }, output: { agenda: 'string', items: 'object[]' }, example: { input: { topic: 'Q2 planning', duration_minutes: 60 }, output: { agenda: '1. Goals (15m)\n2. Budget (20m)' } } };
SCHEMAS['llm-release-notes'] = { input: { changes: { type: 'string', required: true }, version: { type: 'string' }, audience: { type: 'string', description: 'technical|end-user' } }, output: { notes: 'string' }, example: { input: { changes: 'Added batch API', version: '2.1.0' }, output: { notes: '## v2.1.0\n- Batch processing added' } } };

// === AGENT TOOLS: context, route, state ===
SCHEMAS['context-session'] = { input: { include_memory: { type: 'boolean' }, include_tools: { type: 'boolean' } }, output: { session_id: 'string', goal: 'string', memory_snapshot: 'object', recent_calls: 'object[]' }, example: { input: {}, output: { session_id: 'sess_abc', goal: 'process data' } } };
SCHEMAS['introspect'] = { input: { slug: { type: 'string', description: 'API slug to introspect', required: true } }, output: { schema: 'object', credits: 'number', tier: 'string', examples: 'object[]' }, example: { input: { slug: 'text-word-count' }, output: { credits: 1, tier: 'compute' } } };
SCHEMAS['route'] = { input: { intent: { type: 'string', description: 'Natural language description of task', required: true } }, output: { slug: 'string', confidence: 'number', alternatives: 'string[]' }, example: { input: { intent: 'count words in text' }, output: { slug: 'text-word-count', confidence: 0.95 } } };
SCHEMAS['state-set'] = { input: { key: { type: 'string', required: true }, value: { type: 'any', required: true }, namespace: { type: 'string' } }, output: { key: 'string', status: 'string', version: 'number' }, example: { input: { key: 'phase', value: 'analysis' }, output: { status: 'stored', version: 1 } } };
SCHEMAS['state-get'] = { input: { key: { type: 'string', required: true }, namespace: { type: 'string' } }, output: { key: 'string', value: 'any', version: 'number', found: 'boolean' }, example: { input: { key: 'phase' }, output: { value: 'analysis', found: true } } };
SCHEMAS['state-list'] = { input: { namespace: { type: 'string' } }, output: { keys: 'string[]', count: 'number' }, example: { input: {}, output: { keys: ['phase', 'step'], count: 2 } } };


// === TEXT (missing batch) ===
SCHEMAS['text-token-count'] = { input: { text: { type: 'string', required: true }, model: { type: 'string', description: 'Model for tokenizer (default: cl100k)' } }, output: { tokens: 'number', characters: 'number', model: 'string' }, example: { input: { text: 'Hello world' }, output: { tokens: 2, characters: 11 } } };
SCHEMAS['text-chunk'] = { input: { text: { type: 'string', required: true }, size: { type: 'number', description: 'Tokens per chunk (default: 512)' }, overlap: { type: 'number', description: 'Overlap tokens (default: 50)' } }, output: { chunks: 'string[]', count: 'number' }, example: { input: { text: 'Long text...', size: 100 }, output: { count: 3 } } };
SCHEMAS['text-template'] = { input: { template: { type: 'string', description: 'Template with {{variable}} placeholders', required: true }, data: { type: 'object', description: 'Variable values', required: true } }, output: { result: 'string' }, example: { input: { template: 'Hello {{name}}!', data: { name: 'Alice' } }, output: { result: 'Hello Alice!' } } };
SCHEMAS['text-sanitize'] = { input: { text: { type: 'string', required: true }, strip_html: { type: 'boolean' }, normalize_whitespace: { type: 'boolean' } }, output: { result: 'string', changes: 'number' }, example: { input: { text: '  <b>hello</b>  ' }, output: { result: 'hello', changes: 3 } } };
SCHEMAS['text-markdown-toc'] = { input: { text: { type: 'string', description: 'Markdown text', required: true } }, output: { toc: 'string', headings: 'object[]' }, example: { input: { text: '# Intro\n## Setup' }, output: { toc: '- [Intro](#intro)\n  - [Setup](#setup)' } } };
SCHEMAS['text-indent'] = { input: { text: { type: 'string', required: true }, spaces: { type: 'number', description: 'Spaces to indent (default: 2)' } }, output: { result: 'string' }, example: { input: { text: 'hello\nworld', spaces: 4 }, output: { result: '    hello\n    world' } } };
SCHEMAS['text-wrap'] = { input: { text: { type: 'string', required: true }, width: { type: 'number', description: 'Column width (default: 80)' } }, output: { result: 'string', lines: 'number' }, example: { input: { text: 'A very long line', width: 10 }, output: { lines: 2 } } };
SCHEMAS['text-detect-encoding'] = { input: { text: { type: 'string', required: true } }, output: { encoding: 'string', confidence: 'number', has_bom: 'boolean' }, example: { input: { text: 'hello' }, output: { encoding: 'UTF-8', confidence: 0.99 } } };
SCHEMAS['text-markdown-lint'] = { input: { text: { type: 'string', required: true } }, output: { valid: 'boolean', issues: 'object[]', count: 'number' }, example: { input: { text: '# Title\n##Missing space' }, output: { issues: [{ line: 2, message: 'Heading style' }] } } };
SCHEMAS['text-compare-similarity'] = { input: { a: { type: 'string', required: true }, b: { type: 'string', required: true } }, output: { jaccard: 'number', levenshtein_ratio: 'number', word_overlap: 'number' }, example: { input: { a: 'the cat sat', b: 'the cat sat on mat' }, output: { jaccard: 0.6, levenshtein_ratio: 0.79 } } };
SCHEMAS['text-grammar-check'] = { input: { text: { type: 'string', required: true } }, output: { issues: 'object[]', count: 'number', clean: 'boolean' }, example: { input: { text: 'This are wrong.' }, output: { count: 1, issues: [{ message: 'Subject-verb agreement' }] } } };
SCHEMAS['text-reading-time'] = { input: { text: { type: 'string', required: true }, wpm: { type: 'number', description: 'Words per minute (default: 238)' } }, output: { reading_minutes: 'number', speaking_minutes: 'number', word_count: 'number' }, example: { input: { text: 'Lorem ipsum...' }, output: { reading_minutes: 1, word_count: 238 } } };
SCHEMAS['text-vibe-check'] = { input: { text: { type: 'string', required: true } }, output: { vibe: 'string', score: 'number', energy: 'string', breakdown: 'object[]' }, example: { input: { text: 'This is amazing!' }, output: { vibe: 'positive', score: 0.9, energy: 'high' } } };
SCHEMAS['text-entropy'] = { input: { text: { type: 'string', required: true } }, output: { char_entropy: 'number', word_entropy: 'number', unique_word_ratio: 'number', assessment: 'string' }, example: { input: { text: 'hello world hello' }, output: { word_entropy: 0.92, assessment: 'low variety' } } };
SCHEMAS['text-glitch'] = { input: { text: { type: 'string', required: true }, intensity: { type: 'number', description: '0-1 glitch intensity (default: 0.5)' }, mode: { type: 'string', description: 'reverse|vowel|scramble|dup' } }, output: { result: 'string' }, example: { input: { text: 'hello world', intensity: 0.5 }, output: { result: 'h3ll0 w0rld' } } };
SCHEMAS['text-crystallize'] = { input: { text: { type: 'string', required: true } }, output: { entities: 'string[]', relations: 'object[]', triples: 'number' }, example: { input: { text: 'Alice works at Acme Corp' }, output: { triples: 1, relations: [{ subject: 'Alice', predicate: 'works at', object: 'Acme Corp' }] } } };
SCHEMAS['text-roast'] = { input: { text: { type: 'string', required: true } }, output: { roast: 'string', severity: 'string' }, example: { input: { text: 'My code is perfect' }, output: { roast: 'Perfect code? The only perfect code is no code.' } } };
SCHEMAS['text-haiku'] = { input: { text: { type: 'string', required: true } }, output: { haiku: 'string', syllables: 'number[]' }, example: { input: { text: 'Autumn leaves falling' }, output: { haiku: 'Autumn leaves falling\nSilent forest breathes again\nWind takes all away', syllables: [5,7,5] } } };
SCHEMAS['text-tldr'] = { input: { text: { type: 'string', required: true } }, output: { tldr: 'string', words: 'number' }, example: { input: { text: 'Long article...' }, output: { tldr: 'Article covers API design patterns.' } } };
SCHEMAS['text-caesar'] = { input: { text: { type: 'string', required: true }, shift: { type: 'number', description: 'Shift amount (default: 3)' } }, output: { result: 'string', shift: 'number' }, example: { input: { text: 'hello', shift: 3 }, output: { result: 'khoor' } } };
SCHEMAS['text-morse'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'SOS' }, output: { result: '... --- ...' } } };
SCHEMAS['text-binary'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string', bits: 'number' }, example: { input: { text: 'hi' }, output: { result: '01101000 01101001' } } };
SCHEMAS['text-leetspeak'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'leet' }, output: { result: '1337' } } };
SCHEMAS['text-pig-latin'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'hello world' }, output: { result: 'ellohay orldway' } } };
SCHEMAS['text-title-case'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'hello world' }, output: { result: 'Hello World' } } };
SCHEMAS['text-snake-case'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'Hello World' }, output: { result: 'hello_world' } } };
SCHEMAS['text-camel-case'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'hello world' }, output: { result: 'helloWorld' } } };
SCHEMAS['text-kebab-case'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'Hello World' }, output: { result: 'hello-world' } } };
SCHEMAS['text-palindrome'] = { input: { text: { type: 'string', required: true } }, output: { is_palindrome: 'boolean', cleaned: 'string' }, example: { input: { text: 'racecar' }, output: { is_palindrome: true } } };
SCHEMAS['text-anagram'] = { input: { a: { type: 'string', required: true }, b: { type: 'string', required: true } }, output: { is_anagram: 'boolean' }, example: { input: { a: 'listen', b: 'silent' }, output: { is_anagram: true } } };
SCHEMAS['text-vowel-count'] = { input: { text: { type: 'string', required: true } }, output: { vowels: 'number', consonants: 'number', total: 'number' }, example: { input: { text: 'hello' }, output: { vowels: 2, consonants: 3 } } };
SCHEMAS['text-repeat'] = { input: { text: { type: 'string', required: true }, times: { type: 'number', required: true } }, output: { result: 'string', length: 'number' }, example: { input: { text: 'ab', times: 3 }, output: { result: 'ababab' } } };
SCHEMAS['text-pad'] = { input: { text: { type: 'string', required: true }, width: { type: 'number', required: true }, fill: { type: 'string', description: 'Fill character (default: space)' }, align: { type: 'string', description: 'left|right|center (default: right)' } }, output: { result: 'string' }, example: { input: { text: 'hi', width: 6, fill: '0', align: 'right' }, output: { result: '0000hi' } } };
SCHEMAS['text-count-chars'] = { input: { text: { type: 'string', required: true }, char: { type: 'string', required: true } }, output: { count: 'number', positions: 'number[]' }, example: { input: { text: 'banana', char: 'a' }, output: { count: 3, positions: [1,3,5] } } };
SCHEMAS['text-remove-duplicates'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string', original_count: 'number', unique_count: 'number' }, example: { input: { text: 'a b a c b' }, output: { result: 'a b c', unique_count: 3 } } };
SCHEMAS['text-extract-json'] = { input: { text: { type: 'string', required: true } }, output: { found: 'object[]', count: 'number' }, example: { input: { text: 'result: {"ok":true}' }, output: { found: [{ ok: true }], count: 1 } } };
SCHEMAS['text-extract-code'] = { input: { text: { type: 'string', required: true } }, output: { blocks: 'object[]', count: 'number' }, example: { input: { text: 'See code block example' }, output: { count: 1, blocks: [{ lang: 'js', code: 'console.log(1)' }] } } };
SCHEMAS['text-extract-tables'] = { input: { text: { type: 'string', required: true } }, output: { tables: 'object[]', count: 'number' }, example: { input: { text: '| a | b |\n|---|---|\n| 1 | 2 |' }, output: { count: 1 } } };
SCHEMAS['text-extract-links'] = { input: { text: { type: 'string', required: true } }, output: { links: 'object[]', count: 'number' }, example: { input: { text: 'See [docs](https://slopshop.gg)' }, output: { count: 1, links: [{ text: 'docs', url: 'https://slopshop.gg' }] } } };
SCHEMAS['text-split-sentences'] = { input: { text: { type: 'string', required: true } }, output: { sentences: 'string[]', count: 'number' }, example: { input: { text: 'Hello. World!' }, output: { sentences: ['Hello.', 'World!'], count: 2 } } };
SCHEMAS['text-split-paragraphs'] = { input: { text: { type: 'string', required: true } }, output: { paragraphs: 'string[]', count: 'number' }, example: { input: { text: 'Para one.\n\nPara two.' }, output: { count: 2 } } };
SCHEMAS['text-to-markdown-table'] = { input: { data: { type: 'array', description: 'Array of objects', required: true } }, output: { table: 'string', rows: 'number', cols: 'number' }, example: { input: { data: [{ name: 'Alice', age: 30 }] }, output: { table: '| name | age |\n|------|-----|\n| Alice | 30 |' } } };
SCHEMAS['text-slug'] = { input: { text: { type: 'string', required: true } }, output: { slug: 'string' }, example: { input: { text: 'Hello World!' }, output: { slug: 'hello-world' } } };
SCHEMAS['text-levenshtein'] = { input: { a: { type: 'string', required: true }, b: { type: 'string', required: true } }, output: { distance: 'number', similarity: 'number' }, example: { input: { a: 'kitten', b: 'sitting' }, output: { distance: 3, similarity: 0.57 } } };
SCHEMAS['text-sentiment'] = { input: { text: { type: 'string', required: true } }, output: { sentiment: 'string', score: 'number' }, example: { input: { text: 'Great product!' }, output: { sentiment: 'positive', score: 0.9 } } };
SCHEMAS['text-redact-pii'] = { input: { text: { type: 'string', required: true }, types: { type: 'array', description: 'PII types to redact: email|phone|ssn|card' } }, output: { result: 'string', redacted_count: 'number', types_found: 'string[]' }, example: { input: { text: 'Email me at alice@example.com' }, output: { result: 'Email me at [EMAIL]', redacted_count: 1 } } };
SCHEMAS['text-summarize-extractive'] = { input: { text: { type: 'string', required: true }, sentences: { type: 'number', description: 'Number of sentences (default: 3)' } }, output: { summary: 'string', sentence_count: 'number' }, example: { input: { text: 'Long article...', sentences: 2 }, output: { summary: 'Key sentence 1. Key sentence 2.' } } };


// === CODE ===
SCHEMAS['code-json-to-zod'] = { input: { json: { type: 'object', required: true } }, output: { schema: 'string' }, example: { input: { json: { name: 'Alice', age: 30 } }, output: { schema: 'z.object({ name: z.string(), age: z.number() })' } } };
SCHEMAS['code-css-minify'] = { input: { css: { type: 'string', required: true } }, output: { result: 'string', original_bytes: 'number', minified_bytes: 'number', savings_pct: 'number' }, example: { input: { css: 'body { color: red; }' }, output: { savings_pct: 20 } } };
SCHEMAS['code-js-minify'] = { input: { code: { type: 'string', required: true } }, output: { result: 'string', original_bytes: 'number', minified_bytes: 'number' }, example: { input: { code: 'const x = 1; // comment' }, output: { result: 'const x=1;' } } };
SCHEMAS['code-html-minify'] = { input: { html: { type: 'string', required: true } }, output: { result: 'string', original_bytes: 'number', minified_bytes: 'number' }, example: { input: { html: '<p>  hello  </p>' }, output: { result: '<p>hello</p>' } } };
SCHEMAS['code-package-json-generate'] = { input: { name: { type: 'string', required: true }, description: { type: 'string' }, author: { type: 'string' }, license: { type: 'string' } }, output: { package_json: 'string' }, example: { input: { name: 'my-app', description: 'My app' }, output: { package_json: '{"name":"my-app",...}' } } };
SCHEMAS['code-complexity-score'] = { input: { code: { type: 'string', required: true }, language: { type: 'string', description: 'js|ts|python|java' } }, output: { cyclomatic: 'number', cognitive: 'number', lines: 'number', rating: 'string' }, example: { input: { code: 'function f(x) { if(x) return 1; return 0; }', language: 'js' }, output: { cyclomatic: 2, rating: 'low' } } };
SCHEMAS['code-import-graph'] = { input: { code: { type: 'string', required: true }, language: { type: 'string' } }, output: { imports: 'object[]', local: 'string[]', external: 'string[]' }, example: { input: { code: "import fs from 'fs'; import './utils'", language: 'js' }, output: { external: ['fs'], local: ['./utils'] } } };
SCHEMAS['code-dead-code-detect'] = { input: { code: { type: 'string', required: true }, language: { type: 'string' } }, output: { unused_vars: 'string[]', uncalled_functions: 'string[]', unreachable: 'string[]' }, example: { input: { code: 'const x = 1; function f(){} console.log(1)', language: 'js' }, output: { unused_vars: ['x'], uncalled_functions: ['f'] } } };

// === MATH (missing) ===
SCHEMAS['math-moving-average'] = { input: { numbers: { type: 'array', required: true }, window: { type: 'number', description: 'Window size (default: 3)' } }, output: { result: 'number[]', window: 'number' }, example: { input: { numbers: [1,2,3,4,5], window: 3 }, output: { result: [2,3,4] } } };
SCHEMAS['math-linear-regression'] = { input: { x: { type: 'array', required: true }, y: { type: 'array', required: true } }, output: { slope: 'number', intercept: 'number', r_squared: 'number' }, example: { input: { x: [1,2,3], y: [2,4,6] }, output: { slope: 2, intercept: 0, r_squared: 1 } } };
SCHEMAS['math-expression-to-latex'] = { input: { expression: { type: 'string', required: true } }, output: { latex: 'string' }, example: { input: { expression: 'x^2 + 2x + 1' }, output: { latex: 'x^{2} + 2x + 1' } } };
SCHEMAS['math-factorial'] = { input: { n: { type: 'number', required: true } }, output: { result: 'string', n: 'number' }, example: { input: { n: 10 }, output: { result: '3628800', n: 10 } } };
SCHEMAS['math-clamp'] = { input: { value: { type: 'number', required: true }, min: { type: 'number', required: true }, max: { type: 'number', required: true } }, output: { result: 'number', clamped: 'boolean' }, example: { input: { value: 150, min: 0, max: 100 }, output: { result: 100, clamped: true } } };
SCHEMAS['math-lerp'] = { input: { a: { type: 'number', required: true }, b: { type: 'number', required: true }, t: { type: 'number', required: true } }, output: { result: 'number' }, example: { input: { a: 0, b: 10, t: 0.5 }, output: { result: 5 } } };
SCHEMAS['math-distance'] = { input: { x1: { type: 'number', required: true }, y1: { type: 'number', required: true }, x2: { type: 'number', required: true }, y2: { type: 'number', required: true } }, output: { distance: 'number' }, example: { input: { x1: 0, y1: 0, x2: 3, y2: 4 }, output: { distance: 5 } } };
SCHEMAS['math-degrees-to-radians'] = { input: { degrees: { type: 'number', required: true } }, output: { radians: 'number' }, example: { input: { degrees: 180 }, output: { radians: 3.14159 } } };
SCHEMAS['math-radians-to-degrees'] = { input: { radians: { type: 'number', required: true } }, output: { degrees: 'number' }, example: { input: { radians: 3.14159 }, output: { degrees: 180 } } };
SCHEMAS['math-percentage'] = { input: { value: { type: 'number', required: true }, total: { type: 'number', required: true } }, output: { percentage: 'number', formatted: 'string' }, example: { input: { value: 25, total: 100 }, output: { percentage: 25, formatted: '25.00%' } } };
SCHEMAS['math-normalize'] = { input: { numbers: { type: 'array', required: true } }, output: { result: 'number[]', min: 'number', max: 'number' }, example: { input: { numbers: [0, 5, 10] }, output: { result: [0, 0.5, 1] } } };
SCHEMAS['math-zscore'] = { input: { numbers: { type: 'array', required: true } }, output: { zscores: 'number[]', mean: 'number', stddev: 'number' }, example: { input: { numbers: [2, 4, 4, 4, 5, 5, 7, 9] }, output: { mean: 5, stddev: 2 } } };
SCHEMAS['math-round'] = { input: { value: { type: 'number', required: true }, decimals: { type: 'number', description: 'Decimal places (default: 0)' } }, output: { result: 'number' }, example: { input: { value: 3.14159, decimals: 2 }, output: { result: 3.14 } } };
SCHEMAS['math-prime'] = { input: { n: { type: 'number', required: true } }, output: { is_prime: 'boolean', factors: 'number[]' }, example: { input: { n: 17 }, output: { is_prime: true, factors: [17] } } };

// === GEN ===
SCHEMAS['gen-cron-expression'] = { input: { description: { type: 'string', description: 'Human description of schedule', required: true } }, output: { cron: 'string', readable: 'string' }, example: { input: { description: 'every day at midnight' }, output: { cron: '0 0 * * *', readable: 'At 00:00 daily' } } };
SCHEMAS['gen-lorem-code'] = { input: { language: { type: 'string', required: true }, lines: { type: 'number', description: 'Lines of code (default: 20)' } }, output: { code: 'string' }, example: { input: { language: 'python', lines: 10 }, output: { code: 'def hello():\n  pass' } } };
SCHEMAS['gen-inspiration'] = { input: { topic: { type: 'string', description: 'Topic or leave empty for random' } }, output: { prompt: 'string', category: 'string' }, example: { input: { topic: 'API design' }, output: { prompt: 'What if your API could...' } } };
SCHEMAS['gen-motto'] = { input: { subject: { type: 'string', description: 'Agent or team name' } }, output: { motto: 'string' }, example: { input: { subject: 'Team Rocket' }, output: { motto: 'Move fast, break nothing.' } } };
SCHEMAS['gen-persona'] = { input: { role: { type: 'string' }, traits: { type: 'array' } }, output: { persona: 'object', system_prompt: 'string' }, example: { input: { role: 'skeptic' }, output: { system_prompt: 'You are a critical thinker...' } } };
SCHEMAS['gen-lorem'] = { input: { sentences: { type: 'number', description: 'Number of sentences (default: 5)' } }, output: { text: 'string', word_count: 'number' }, example: { input: { sentences: 2 }, output: { text: 'Lorem ipsum dolor sit amet...' } } };
SCHEMAS['gen-password'] = { input: { length: { type: 'number', description: 'Length (default: 20)' }, symbols: { type: 'boolean' }, numbers: { type: 'boolean' } }, output: { password: 'string', strength: 'string', entropy_bits: 'number' }, example: { input: { length: 16 }, output: { password: 'aB3xY9kL2mQw5nPz', strength: 'strong' } } };
SCHEMAS['gen-avatar-initials'] = { input: { name: { type: 'string', required: true }, size: { type: 'number', description: 'Size px (default: 64)' }, bg: { type: 'string', description: 'Background color hex' } }, output: { svg: 'string', initials: 'string' }, example: { input: { name: 'Alice Bob' }, output: { initials: 'AB' } } };
SCHEMAS['gen-cron'] = { input: { minute: { type: 'string' }, hour: { type: 'string' }, day: { type: 'string' }, month: { type: 'string' }, weekday: { type: 'string' } }, output: { cron: 'string', readable: 'string', next_runs: 'string[]' }, example: { input: { minute: '0', hour: '9' }, output: { cron: '0 9 * * *', readable: 'At 09:00 daily' } } };
SCHEMAS['gen-regex'] = { input: { description: { type: 'string', required: true } }, output: { pattern: 'string', flags: 'string', example_matches: 'string[]' }, example: { input: { description: 'email address' }, output: { pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' } } };
SCHEMAS['gen-gitignore'] = { input: { languages: { type: 'array', description: 'Languages/frameworks', required: true } }, output: { gitignore: 'string', entries: 'number' }, example: { input: { languages: ['node', 'python'] }, output: { entries: 45 } } };
SCHEMAS['gen-dockerfile'] = { input: { language: { type: 'string', required: true }, port: { type: 'number' }, cmd: { type: 'string' } }, output: { dockerfile: 'string' }, example: { input: { language: 'node', port: 3000 }, output: { dockerfile: 'FROM node:20-alpine...' } } };
SCHEMAS['gen-readme'] = { input: { name: { type: 'string', required: true }, description: { type: 'string' }, language: { type: 'string' } }, output: { readme: 'string' }, example: { input: { name: 'my-lib', description: 'A utility library' }, output: { readme: '# my-lib...' } } };
SCHEMAS['gen-license-mit'] = { input: { author: { type: 'string', required: true }, year: { type: 'number' } }, output: { license: 'string' }, example: { input: { author: 'Alice Smith', year: 2026 }, output: { license: 'MIT License...' } } };
SCHEMAS['gen-env-example'] = { input: { vars: { type: 'array', description: 'Env var names', required: true } }, output: { env_example: 'string' }, example: { input: { vars: ['API_KEY', 'DB_URL'] }, output: { env_example: 'API_KEY=\nDB_URL=' } } };
SCHEMAS['gen-timestamp'] = { input: { format: { type: 'string', description: 'iso|unix|relative' } }, output: { timestamp: 'string', unix: 'number', iso: 'string' }, example: { input: { format: 'iso' }, output: { iso: '2026-03-31T00:00:00.000Z' } } };
SCHEMAS['gen-id'] = { input: { type: { type: 'string', description: 'uuid|nanoid|cuid|shortid (default: nanoid)' }, prefix: { type: 'string' } }, output: { id: 'string', type: 'string' }, example: { input: { type: 'nanoid' }, output: { id: 'V1StGXR8_Z5j' } } };
SCHEMAS['gen-hash-comparison'] = { input: { a: { type: 'string', required: true }, b: { type: 'string', required: true }, algorithm: { type: 'string', description: 'sha256|md5|sha1' } }, output: { hash_a: 'string', hash_b: 'string', match: 'boolean' }, example: { input: { a: 'hello', b: 'hello' }, output: { match: true } } };
SCHEMAS['gen-jwt-decode'] = { input: { token: { type: 'string', required: true } }, output: { header: 'object', payload: 'object', signature: 'string' }, example: { input: { token: 'eyJ...' }, output: { payload: { sub: '1234' } } } };
SCHEMAS['gen-base64-encode'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'hello' }, output: { result: 'aGVsbG8=' } } };
SCHEMAS['gen-base64-decode'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'aGVsbG8=' }, output: { result: 'hello' } } };
SCHEMAS['gen-url-encode'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'hello world' }, output: { result: 'hello%20world' } } };
SCHEMAS['gen-url-decode'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'hello%20world' }, output: { result: 'hello world' } } };
SCHEMAS['gen-html-escape'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: '<script>' }, output: { result: '&lt;script&gt;' } } };


// === CRYPTO (missing aliases) ===
SCHEMAS['crypto-hash-compare'] = { input: { a: { type: 'string', required: true }, b: { type: 'string', required: true }, algorithm: { type: 'string', description: 'sha256|md5|sha1 (default: sha256)' } }, output: { match: 'boolean', hash_a: 'string', hash_b: 'string' }, example: { input: { a: 'hello', b: 'hello' }, output: { match: true } } };
SCHEMAS['crypto-hash-sha1'] = { input: { text: { type: 'string', required: true } }, output: { hash: 'string' }, example: { input: { text: 'hello' }, output: { hash: 'aaf4c61d...' } } };
SCHEMAS['crypto-hmac-sha256'] = { input: { text: { type: 'string', required: true }, secret: { type: 'string', required: true } }, output: { hmac: 'string' }, example: { input: { text: 'hello', secret: 'key' }, output: { hmac: 'f7bc83f4...' } } };
SCHEMAS['crypto-aes-encrypt'] = { input: { text: { type: 'string', required: true }, key: { type: 'string', required: true } }, output: { encrypted: 'string', iv: 'string', tag: 'string' }, example: { input: { text: 'secret', key: 'mykey32chars...' }, output: { encrypted: 'abc123...' } } };
SCHEMAS['crypto-aes-decrypt'] = { input: { encrypted: { type: 'string', required: true }, key: { type: 'string', required: true }, iv: { type: 'string', required: true }, tag: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { encrypted: 'abc123...', key: 'mykey', iv: '...', tag: '...' }, output: { result: 'secret' } } };
SCHEMAS['crypto-base64-encode'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'hello' }, output: { result: 'aGVsbG8=' } } };
SCHEMAS['crypto-base64-decode'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string' }, example: { input: { text: 'aGVsbG8=' }, output: { result: 'hello' } } };

// === EXTERNAL ===
SCHEMAS['ext-web-screenshot'] = { input: { url: { type: 'string', required: true }, width: { type: 'number' }, height: { type: 'number' } }, output: { image_url: 'string', width: 'number', height: 'number' }, example: { input: { url: 'https://slopshop.gg' }, output: { image_url: 'https://...' } } };
SCHEMAS['ext-web-scrape'] = { input: { url: { type: 'string', required: true }, selector: { type: 'string', description: 'CSS selector' } }, output: { text: 'string', html: 'string', title: 'string' }, example: { input: { url: 'https://slopshop.gg' }, output: { title: 'Slopshop' } } };
SCHEMAS['ext-email-send'] = { input: { to: { type: 'string', required: true }, subject: { type: 'string', required: true }, body: { type: 'string', required: true }, from: { type: 'string' } }, output: { sent: 'boolean', message_id: 'string' }, example: { input: { to: 'user@example.com', subject: 'Hello', body: 'Hi there' }, output: { sent: true } } };
SCHEMAS['ext-sms-send'] = { input: { to: { type: 'string', required: true }, message: { type: 'string', required: true } }, output: { sent: 'boolean', sid: 'string' }, example: { input: { to: '+15555551234', message: 'Hello' }, output: { sent: true } } };
SCHEMAS['ext-slack-post'] = { input: { channel: { type: 'string', required: true }, text: { type: 'string', required: true }, blocks: { type: 'array' } }, output: { ok: 'boolean', ts: 'string' }, example: { input: { channel: '#general', text: 'Deploy complete' }, output: { ok: true } } };
SCHEMAS['ext-github-issue'] = { input: { repo: { type: 'string', required: true }, title: { type: 'string', required: true }, body: { type: 'string' }, labels: { type: 'array' } }, output: { number: 'number', url: 'string' }, example: { input: { repo: 'owner/repo', title: 'Bug: login fails' }, output: { number: 42 } } };
SCHEMAS['ext-github-pr-comment'] = { input: { repo: { type: 'string', required: true }, pr: { type: 'number', required: true }, body: { type: 'string', required: true } }, output: { id: 'number', url: 'string' }, example: { input: { repo: 'owner/repo', pr: 7, body: 'LGTM' }, output: { id: 123 } } };
SCHEMAS['ext-notion-page'] = { input: { parent_id: { type: 'string', required: true }, title: { type: 'string', required: true }, content: { type: 'string' } }, output: { page_id: 'string', url: 'string' }, example: { input: { parent_id: 'abc', title: 'Meeting Notes' }, output: { page_id: 'xyz' } } };
SCHEMAS['ext-linear-issue'] = { input: { title: { type: 'string', required: true }, description: { type: 'string' }, team_id: { type: 'string' } }, output: { id: 'string', url: 'string' }, example: { input: { title: 'Fix auth bug' }, output: { id: 'LIN-42' } } };
SCHEMAS['ext-discord-post'] = { input: { webhook_url: { type: 'string', required: true }, content: { type: 'string', required: true }, username: { type: 'string' } }, output: { sent: 'boolean' }, example: { input: { webhook_url: 'https://discord.com/...', content: 'Deploy done' }, output: { sent: true } } };
SCHEMAS['ext-telegram-send'] = { input: { chat_id: { type: 'string', required: true }, text: { type: 'string', required: true } }, output: { sent: 'boolean', message_id: 'number' }, example: { input: { chat_id: '12345', text: 'Hello' }, output: { sent: true } } };
SCHEMAS['ext-s3-upload'] = { input: { key: { type: 'string', required: true }, content: { type: 'string', required: true }, content_type: { type: 'string' }, bucket: { type: 'string' } }, output: { url: 'string', key: 'string', size_bytes: 'number' }, example: { input: { key: 'file.txt', content: 'hello' }, output: { url: 'https://s3...' } } };
SCHEMAS['ext-openai-embedding'] = { input: { text: { type: 'string', required: true }, model: { type: 'string', description: 'Embedding model (default: text-embedding-3-small)' } }, output: { embedding: 'number[]', dimensions: 'number', tokens: 'number' }, example: { input: { text: 'hello world' }, output: { dimensions: 1536 } } };
SCHEMAS['ext-anthropic-message'] = { input: { prompt: { type: 'string', required: true }, system: { type: 'string' }, model: { type: 'string' }, max_tokens: { type: 'number' } }, output: { response: 'string', tokens_used: 'number' }, example: { input: { prompt: 'Say hello' }, output: { response: 'Hello!' } } };
SCHEMAS['ext-google-search'] = { input: { query: { type: 'string', required: true }, num: { type: 'number', description: 'Results (default: 10)' } }, output: { results: 'object[]', total_results: 'number' }, example: { input: { query: 'slopshop api' }, output: { results: [{ title: 'Slopshop', url: '...' }] } } };

// === DATA ===
SCHEMAS['data-pivot'] = { input: { rows: { type: 'array', required: true }, index: { type: 'string', required: true }, columns: { type: 'string', required: true }, values: { type: 'string', required: true } }, output: { result: 'object', row_count: 'number' }, example: { input: { rows: [{ cat: 'A', month: 'Jan', val: 10 }], index: 'cat', columns: 'month', values: 'val' }, output: { result: { A: { Jan: 10 } } } } };
SCHEMAS['data-synesthesia'] = { input: { data: { type: 'any', required: true }, target: { type: 'string', description: 'color|sound|emotion|spatial' } }, output: { result: 'object', mapping: 'string' }, example: { input: { data: [1,2,3], target: 'color' }, output: { mapping: 'linear scale to hue' } } };
SCHEMAS['data-forecast'] = { input: { numbers: { type: 'array', required: true }, steps: { type: 'number', description: 'Future steps to predict (default: 3)' } }, output: { forecast: 'number[]', slope: 'number', trend: 'string' }, example: { input: { numbers: [1,2,3,4,5], steps: 3 }, output: { forecast: [6,7,8], trend: 'increasing' } } };
SCHEMAS['data-group-by'] = { input: { data: { type: 'array', required: true }, key: { type: 'string', required: true } }, output: { groups: 'object', count: 'number' }, example: { input: { data: [{ cat: 'A', v: 1 }, { cat: 'B', v: 2 }, { cat: 'A', v: 3 }], key: 'cat' }, output: { groups: { A: [{ v: 1 }, { v: 3 }], B: [{ v: 2 }] } } } };
SCHEMAS['data-sort-by'] = { input: { data: { type: 'array', required: true }, key: { type: 'string', required: true }, order: { type: 'string', description: 'asc|desc (default: asc)' } }, output: { result: 'array', count: 'number' }, example: { input: { data: [{ n: 3 }, { n: 1 }], key: 'n' }, output: { result: [{ n: 1 }, { n: 3 }] } } };
SCHEMAS['data-unique'] = { input: { data: { type: 'array', required: true }, key: { type: 'string', description: 'Key to deduplicate on (omit for primitives)' } }, output: { result: 'array', removed: 'number' }, example: { input: { data: [1,2,2,3] }, output: { result: [1,2,3], removed: 1 } } };
SCHEMAS['data-chunk'] = { input: { data: { type: 'array', required: true }, size: { type: 'number', required: true } }, output: { chunks: 'array', count: 'number' }, example: { input: { data: [1,2,3,4,5], size: 2 }, output: { chunks: [[1,2],[3,4],[5]], count: 3 } } };
SCHEMAS['data-zip'] = { input: { a: { type: 'array', required: true }, b: { type: 'array', required: true } }, output: { result: 'array', count: 'number' }, example: { input: { a: [1,2], b: ['a','b'] }, output: { result: [[1,'a'],[2,'b']] } } };
SCHEMAS['data-transpose'] = { input: { matrix: { type: 'array', required: true } }, output: { result: 'array', rows: 'number', cols: 'number' }, example: { input: { matrix: [[1,2],[3,4]] }, output: { result: [[1,3],[2,4]] } } };
SCHEMAS['data-sample'] = { input: { data: { type: 'array', required: true }, n: { type: 'number', required: true } }, output: { sample: 'array', count: 'number' }, example: { input: { data: [1,2,3,4,5], n: 3 }, output: { count: 3 } } };
SCHEMAS['data-paginate'] = { input: { data: { type: 'array', required: true }, page: { type: 'number', description: '1-based page (default: 1)' }, per_page: { type: 'number', description: 'Items per page (default: 10)' } }, output: { items: 'array', page: 'number', per_page: 'number', total: 'number', pages: 'number' }, example: { input: { data: [1,2,3,4,5], page: 2, per_page: 2 }, output: { items: [3,4], page: 2, total: 5 } } };
SCHEMAS['data-lookup'] = { input: { data: { type: 'array', required: true }, key: { type: 'string', required: true }, value: { type: 'any', required: true } }, output: { result: 'any', found: 'boolean', index: 'number' }, example: { input: { data: [{ id: 1, name: 'Alice' }], key: 'id', value: 1 }, output: { result: { id: 1, name: 'Alice' }, found: true } } };
SCHEMAS['data-aggregate'] = { input: { data: { type: 'array', required: true }, key: { type: 'string', required: true }, operation: { type: 'string', description: 'sum|avg|min|max|count' } }, output: { result: 'number', operation: 'string', key: 'string' }, example: { input: { data: [{ v: 1 }, { v: 2 }], key: 'v', operation: 'sum' }, output: { result: 3 } } };
SCHEMAS['data-csv-parse'] = { input: { text: { type: 'string', required: true }, delimiter: { type: 'string' } }, output: { rows: 'object[]', headers: 'string[]', count: 'number' }, example: { input: { text: 'name,age\nalice,30' }, output: { count: 1, headers: ['name','age'] } } };
SCHEMAS['data-json-diff'] = { input: { a: { type: 'object', required: true }, b: { type: 'object', required: true } }, output: { added: 'object[]', removed: 'object[]', changed: 'object[]' }, example: { input: { a: { x: 1 }, b: { x: 2, y: 3 } }, output: { added: [{ key: 'y' }], changed: [{ key: 'x' }] } } };
SCHEMAS['data-xml-to-json'] = { input: { text: { type: 'string', required: true } }, output: { result: 'object', tags_found: 'number' }, example: { input: { text: '<name>Alice</name>' }, output: { result: { name: 'Alice' } } } };
SCHEMAS['data-yaml-to-json'] = { input: { text: { type: 'string', required: true } }, output: { result: 'object', keys: 'number' }, example: { input: { text: 'name: Alice' }, output: { result: { name: 'Alice' } } } };
SCHEMAS['data-json-to-yaml'] = { input: { data: { type: 'object', required: true } }, output: { yaml: 'string' }, example: { input: { data: { name: 'Alice' } }, output: { yaml: 'name: Alice' } } };
SCHEMAS['data-zip-encode'] = { input: { text: { type: 'string', required: true } }, output: { result: 'string', original_bytes: 'number', compressed_bytes: 'number' }, example: { input: { text: 'hello world' }, output: { compressed_bytes: 8 } } };
SCHEMAS['data-zip-decode'] = { input: { data: { type: 'string', description: 'Base64 gzip', required: true } }, output: { result: 'string' }, example: { input: { data: 'H4sI...' }, output: { result: 'hello world' } } };


// === ANALYZE ===
SCHEMAS['safety-score'] = { input: { text: { type: 'string', required: true } }, output: { pii_risk: 'number', injection_risk: 'number', toxicity_risk: 'number', overall_risk: 'string', findings: 'object[]' }, example: { input: { text: 'email me at test@example.com' }, output: { pii_risk: 0.8, overall_risk: 'medium' } } };
SCHEMAS['knowledge-check'] = { input: { statements: { type: 'array', description: 'Array of statement strings', required: true } }, output: { contradictions: 'object[]', count: 'number', clean: 'boolean' }, example: { input: { statements: ['X is true', 'X is false'] }, output: { count: 1 } } };
SCHEMAS['negotiate-score'] = { input: { proposal: { type: 'string', required: true }, context: { type: 'string' } }, output: { fairness: 'number', leverage: 'number', persuasiveness: 'number', score: 'number' }, example: { input: { proposal: 'We split 50/50' }, output: { fairness: 0.9, score: 0.8 } } };
SCHEMAS['ethical-check'] = { input: { action: { type: 'string', required: true } }, output: { utilitarian: 'object', deontological: 'object', virtue: 'object', verdict: 'string' }, example: { input: { action: 'Delete user data' }, output: { verdict: 'requires consent' } } };
SCHEMAS['decision-matrix'] = { input: { options: { type: 'array', required: true }, criteria: { type: 'array', required: true }, weights: { type: 'array' } }, output: { ranked: 'object[]', winner: 'string' }, example: { input: { options: ['A','B'], criteria: ['cost','speed'], weights: [0.6,0.4] }, output: { winner: 'A' } } };
SCHEMAS['provenance-tag'] = { input: { data: { type: 'any', required: true }, source: { type: 'string', required: true }, confidence: { type: 'number' } }, output: { tagged: 'object', hash: 'string' }, example: { input: { data: { x: 1 }, source: 'api-call' }, output: { hash: 'sha256:...' } } };
SCHEMAS['logic-paradox'] = { input: { statements: { type: 'array', required: true } }, output: { paradoxes: 'object[]', circular: 'object[]', count: 'number' }, example: { input: { statements: ['This statement is false'] }, output: { count: 1 } } };
SCHEMAS['analyze-heatmap'] = { input: { timestamps: { type: 'array', description: 'ISO timestamp strings', required: true } }, output: { peak_hour: 'number', peak_day: 'string', hourly: 'object', daily: 'object' }, example: { input: { timestamps: ['2026-03-31T09:00:00Z'] }, output: { peak_hour: 9 } } };
SCHEMAS['devil-advocate'] = { input: { proposal: { type: 'string', required: true } }, output: { weaknesses: 'string[]', count: 'number' }, example: { input: { proposal: 'We should use microservices' }, output: { weaknesses: ['Operational complexity', 'Network latency'] } } };
SCHEMAS['premortem'] = { input: { project: { type: 'string', required: true } }, output: { failure_causes: 'string[]', mitigations: 'string[]' }, example: { input: { project: 'API launch' }, output: { failure_causes: ['No users', 'Bad docs'] } } };
SCHEMAS['bias-check'] = { input: { text: { type: 'string', required: true } }, output: { biases: 'object[]', count: 'number', clean: 'boolean' }, example: { input: { text: 'We always win' }, output: { biases: [{ type: 'absolutism', phrase: 'always win' }] } } };
SCHEMAS['chaos-monkey'] = { input: { target: { type: 'string', required: true }, intensity: { type: 'number', description: '0-1 chaos level' } }, output: { failure: 'string', mode: 'string', probability: 'number' }, example: { input: { target: 'auth-service', intensity: 0.3 }, output: { failure: 'timeout', mode: 'random' } } };
SCHEMAS['analyze-readability'] = { input: { text: { type: 'string', required: true } }, output: { grade: 'number', ease: 'number', difficulty: 'string' }, example: { input: { text: 'See spot run.' }, output: { grade: 1.2, difficulty: 'Easy' } } };
SCHEMAS['analyze-sentiment-simple'] = { input: { text: { type: 'string', required: true } }, output: { sentiment: 'string', score: 'number', positive_words: 'string[]', negative_words: 'string[]' }, example: { input: { text: 'Great product!' }, output: { sentiment: 'positive', score: 0.9 } } };
SCHEMAS['analyze-keywords'] = { input: { text: { type: 'string', required: true }, top: { type: 'number' } }, output: { keywords: 'object[]' }, example: { input: { text: 'API design patterns for agents' }, output: { keywords: [{ word: 'api', count: 1 }] } } };
SCHEMAS['analyze-language-detect'] = { input: { text: { type: 'string', required: true } }, output: { detected: 'string', confidence: 'number' }, example: { input: { text: 'Bonjour le monde' }, output: { detected: 'fr', confidence: 0.85 } } };
SCHEMAS['analyze-url-parts'] = { input: { url: { type: 'string', required: true } }, output: { protocol: 'string', hostname: 'string', port: 'string', pathname: 'string', params: 'object', hash: 'string' }, example: { input: { url: 'https://slopshop.gg/v1?k=v' }, output: { hostname: 'slopshop.gg' } } };
SCHEMAS['analyze-json-paths'] = { input: { data: { type: 'object', required: true } }, output: { paths: 'string[]', count: 'number', depth: 'number' }, example: { input: { data: { a: { b: 1 } } }, output: { paths: ['a', 'a.b'], depth: 2 } } };
SCHEMAS['analyze-duplicates'] = { input: { data: { type: 'array', required: true }, key: { type: 'string' } }, output: { duplicates: 'object[]', count: 'number', unique: 'number' }, example: { input: { data: [1,2,2,3] }, output: { count: 1, unique: 3 } } };
SCHEMAS['analyze-outliers'] = { input: { numbers: { type: 'array', required: true }, threshold: { type: 'number', description: 'Z-score threshold (default: 2)' } }, output: { outliers: 'number[]', count: 'number' }, example: { input: { numbers: [1,2,3,100] }, output: { outliers: [100], count: 1 } } };
SCHEMAS['analyze-frequency'] = { input: { data: { type: 'array', required: true } }, output: { frequency: 'object[]', top: 'object' }, example: { input: { data: ['a','b','a','c'] }, output: { top: { value: 'a', count: 2 } } } };
SCHEMAS['analyze-string-similarity'] = { input: { a: { type: 'string', required: true }, b: { type: 'string', required: true } }, output: { similarity: 'number', distance: 'number', method: 'string' }, example: { input: { a: 'hello', b: 'helo' }, output: { similarity: 0.89 } } };
SCHEMAS['analyze-email-parts'] = { input: { email: { type: 'string', required: true } }, output: { valid: 'boolean', local: 'string', domain: 'string', tld: 'string' }, example: { input: { email: 'alice@slopshop.gg' }, output: { local: 'alice', domain: 'slopshop.gg', tld: 'gg' } } };
SCHEMAS['analyze-ip-type'] = { input: { ip: { type: 'string', required: true } }, output: { version: 'string', type: 'string', is_private: 'boolean', is_loopback: 'boolean' }, example: { input: { ip: '192.168.1.1' }, output: { version: 'v4', type: 'private', is_private: true } } };
SCHEMAS['analyze-cron'] = { input: { expression: { type: 'string', required: true } }, output: { valid: 'boolean', readable: 'string', next_runs: 'string[]' }, example: { input: { expression: '0 9 * * 1-5' }, output: { readable: 'At 09:00, Monday through Friday' } } };
SCHEMAS['analyze-password-strength'] = { input: { password: { type: 'string', required: true } }, output: { score: 'number', strength: 'string', entropy_bits: 'number', suggestions: 'string[]' }, example: { input: { password: 'abc123' }, output: { score: 2, strength: 'weak' } } };
SCHEMAS['analyze-color'] = { input: { color: { type: 'string', description: 'Hex, RGB, or HSL color', required: true } }, output: { hex: 'string', rgb: 'object', hsl: 'object', luminance: 'number', is_dark: 'boolean' }, example: { input: { color: '#ff0000' }, output: { hex: '#ff0000', is_dark: false } } };

// === CONVERT ===
SCHEMAS['convert-temperature'] = { input: { value: { type: 'number', required: true }, from: { type: 'string', required: true }, to: { type: 'string', required: true } }, output: { result: 'number', from: 'string', to: 'string' }, example: { input: { value: 100, from: 'c', to: 'f' }, output: { result: 212 } } };
SCHEMAS['convert-length'] = { input: { value: { type: 'number', required: true }, from: { type: 'string', required: true }, to: { type: 'string', required: true } }, output: { result: 'number' }, example: { input: { value: 1, from: 'km', to: 'm' }, output: { result: 1000 } } };
SCHEMAS['convert-weight'] = { input: { value: { type: 'number', required: true }, from: { type: 'string', required: true }, to: { type: 'string', required: true } }, output: { result: 'number' }, example: { input: { value: 1, from: 'kg', to: 'lb' }, output: { result: 2.205 } } };
SCHEMAS['convert-bytes'] = { input: { value: { type: 'number', required: true }, from: { type: 'string', required: true }, to: { type: 'string', required: true } }, output: { result: 'number' }, example: { input: { value: 1, from: 'gb', to: 'mb' }, output: { result: 1024 } } };
SCHEMAS['convert-time'] = { input: { value: { type: 'number', required: true }, from: { type: 'string', required: true }, to: { type: 'string', required: true } }, output: { result: 'number' }, example: { input: { value: 1, from: 'h', to: 'm' }, output: { result: 60 } } };
SCHEMAS['convert-color-hex-rgb'] = { input: { hex: { type: 'string', required: true } }, output: { r: 'number', g: 'number', b: 'number' }, example: { input: { hex: '#ff0000' }, output: { r: 255, g: 0, b: 0 } } };
SCHEMAS['convert-color-rgb-hex'] = { input: { r: { type: 'number', required: true }, g: { type: 'number', required: true }, b: { type: 'number', required: true } }, output: { hex: 'string' }, example: { input: { r: 255, g: 0, b: 0 }, output: { hex: '#ff0000' } } };
SCHEMAS['convert-roman'] = { input: { n: { type: 'number', required: true } }, output: { roman: 'string' }, example: { input: { n: 2026 }, output: { roman: 'MMXXVI' } } };
SCHEMAS['convert-base'] = { input: { value: { type: 'string', required: true }, from_base: { type: 'number', required: true }, to_base: { type: 'number', required: true } }, output: { result: 'string' }, example: { input: { value: 'ff', from_base: 16, to_base: 10 }, output: { result: '255' } } };
SCHEMAS['convert-angle'] = { input: { value: { type: 'number', required: true }, from: { type: 'string', required: true }, to: { type: 'string', required: true } }, output: { result: 'number' }, example: { input: { value: 180, from: 'deg', to: 'rad' }, output: { result: 3.14159 } } };
SCHEMAS['convert-roman-numeral'] = { input: { n: { type: 'number', required: true } }, output: { roman: 'string' }, example: { input: { n: 42 }, output: { roman: 'XLII' } } };
SCHEMAS['convert-morse'] = { input: { text: { type: 'string', required: true }, direction: { type: 'string', description: 'encode|decode (default: encode)' } }, output: { result: 'string' }, example: { input: { text: 'SOS', direction: 'encode' }, output: { result: '... --- ...' } } };
SCHEMAS['convert-csv-json'] = { input: { text: { type: 'string', required: true } }, output: { rows: 'object[]', count: 'number' }, example: { input: { text: 'name,age\nalice,30' }, output: { count: 1 } } };
SCHEMAS['convert-yaml-json'] = { input: { text: { type: 'string', required: true } }, output: { result: 'object' }, example: { input: { text: 'name: Alice' }, output: { result: { name: 'Alice' } } } };
SCHEMAS['convert-markdown-html'] = { input: { text: { type: 'string', required: true } }, output: { html: 'string' }, example: { input: { text: '# Hello' }, output: { html: '<h1>Hello</h1>' } } };

module.exports = { SCHEMAS };
