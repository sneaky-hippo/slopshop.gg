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
  'net-url-parse': {
    input: { url: { type: 'string', description: 'URL to parse', required: true } },
    output: { protocol: 'string', hostname: 'string', pathname: 'string', params: 'object' },
    example: { input: { url: 'https://slopshop.gg/v1/tools?limit=10' }, output: { hostname: 'slopshop.gg' } },
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
  input: { text: { type: 'string', description: 'Text to estimate tokens for', required: true }, model: { type: 'string', description: 'Model name (claude-sonnet-4-20250514, gpt-4o, gpt-4o-mini, gemini-2.0-flash)' } },
  output: { tokens: 'number', model: 'string', input_cost_usd: 'number', output_cost_usd: 'number' },
  example: { input: { text: 'Hello world', model: 'claude-sonnet-4-20250514' }, output: { tokens: 3, input_cost_usd: 0.000009, output_cost_usd: 0.000045 } },
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

module.exports = { SCHEMAS };
