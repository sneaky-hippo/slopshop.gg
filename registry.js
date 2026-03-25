/**
 * SLOPSHOP API REGISTRY
 *
 * This is the source of truth. The catalog is built FROM the handlers,
 * not the other way around. If there's no handler, there's no API.
 *
 * Three tiers:
 *   compute  - pure computation, always works, no external deps
 *   llm      - needs ANTHROPIC_API_KEY or OPENAI_API_KEY
 *   network  - uses Node.js built-in dns/http/tls modules
 */

const CREDIT_COSTS = {
  trivial: 1,    // uuid gen, base64, hash
  simple: 1,     // text processing, validation
  medium: 3,     // CSV parse, diff, statistics
  complex: 5,    // network calls, multi-step compute
  llm_small: 10, // short LLM call - min 10cr to guarantee margin at all tiers
  llm_medium: 10, // medium LLM call
  llm_large: 20,  // long LLM call (blog posts, code gen)
};

// Category definitions with human descriptions
const CATEGORIES = {
  'Text Processing': {
    icon: '\uD83D\uDCDD',
    desc: 'Extract, transform, analyze, and manipulate text. Every API actually processes your input.',
  },
  'Crypto & Security': {
    icon: '\uD83D\uDD10',
    desc: 'Hashing, encryption, JWT, passwords, random generation. Real cryptographic operations.',
  },
  'Math & Numbers': {
    icon: '\uD83E\uDDEE',
    desc: 'Statistics, conversions, financial calculations. Actual math on your data.',
  },
  'Date & Time': {
    icon: '\uD83D\uDCC5',
    desc: 'Parse, format, diff, and calculate dates. Real date arithmetic.',
  },
  'Data Transform': {
    icon: '\uD83D\uDD04',
    desc: 'JSON, CSV, XML, YAML, Markdown conversions. Actually transforms your data.',
  },
  'Code Utilities': {
    icon: '\uD83D\uDCBB',
    desc: 'JSON to TypeScript, SQL formatting, semver, diff stats. Real code tools.',
  },
  'Generate': {
    icon: '\u2728',
    desc: 'UUIDs, passwords, fake data, color palettes, short IDs. Real generation.',
  },
  'Network & DNS': {
    icon: '\uD83C\uDF10',
    desc: 'DNS lookups, HTTP checks, SSL inspection, email validation. Real network calls.',
  },
  'AI: Content': {
    icon: '\uD83E\uDD16',
    desc: 'Blog posts, emails, ad copy, social posts. Powered by Claude/GPT. Requires ANTHROPIC_API_KEY or OPENAI_API_KEY.',
  },
  'AI: Analysis': {
    icon: '\uD83E\uDDE0',
    desc: 'Summarize, classify, extract, translate, sentiment. Real LLM analysis of your text.',
  },
  'AI: Code': {
    icon: '\u2699\uFE0F',
    desc: 'Generate code, review, test, document, convert. LLM-powered dev tools.',
  },
  'AI: Business': {
    icon: '\uD83D\uDCBC',
    desc: 'Meeting prep, proposals, job descriptions, contract analysis. LLM-powered business tools.',
  },
  'Agent Tools': {
    icon: '\uD83E\uDD16',
    desc: 'Tools agents CANNOT do without: JSON extraction/validation, webhooks, file download, persistent memory. The 50% penetration tier.',
  },
  'External: Web': {
    icon: '\uD83C\uDF10',
    desc: 'Screenshots, scraping, search. Need external service keys.',
  },
  'External: Comms': {
    icon: '\uD83D\uDCE8',
    desc: 'Email, SMS, Slack, Discord, Telegram. Need service API keys.',
  },
  'External: Dev': {
    icon: '\uD83D\uDEE0\uFE0F',
    desc: 'GitHub, Linear issue creation. Need service tokens.',
  },
  'External: Productivity': {
    icon: '\uD83D\uDCDD',
    desc: 'Notion, Airtable. Need service API keys.',
  },
  'External: Storage': {
    icon: '\uD83D\uDCE6',
    desc: 'S3/R2 file upload. Need AWS credentials.',
  },
  'External: AI': {
    icon: '\uD83E\uDD16',
    desc: 'OpenAI embeddings, custom Claude messages. Need AI service keys.',
  },
};

// API definitions: slug -> metadata
// The handler comes from the handler files, this is just the catalog entry
const API_DEFS = {
  // ====== TEXT PROCESSING ======
  'text-word-count': { cat: 'Text Processing', name: 'Word Count', desc: 'Count words, characters, sentences, and paragraphs in text.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-char-count': { cat: 'Text Processing', name: 'Character Count', desc: 'Count characters with and without spaces, by type.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-extract-emails': { cat: 'Text Processing', name: 'Extract Emails', desc: 'Extract all email addresses from text using pattern matching.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-extract-urls': { cat: 'Text Processing', name: 'Extract URLs', desc: 'Extract all URLs from text.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-extract-phones': { cat: 'Text Processing', name: 'Extract Phones', desc: 'Extract phone numbers from text.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-extract-numbers': { cat: 'Text Processing', name: 'Extract Numbers', desc: 'Extract all numeric values from text.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-extract-dates': { cat: 'Text Processing', name: 'Extract Dates', desc: 'Extract date-like strings from text.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-extract-mentions': { cat: 'Text Processing', name: 'Extract @Mentions', desc: 'Extract @mentions from text.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-extract-hashtags': { cat: 'Text Processing', name: 'Extract #Hashtags', desc: 'Extract #hashtags from text.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-regex-test': { cat: 'Text Processing', name: 'Regex Test', desc: 'Test a regex pattern against text. Returns all matches with positions.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-regex-replace': { cat: 'Text Processing', name: 'Regex Replace', desc: 'Find and replace using regex pattern.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-diff': { cat: 'Text Processing', name: 'Text Diff', desc: 'Line-by-line diff of two texts. Returns added, removed, unchanged.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-slugify': { cat: 'Text Processing', name: 'Slugify', desc: 'Convert text to URL-safe slug.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-truncate': { cat: 'Text Processing', name: 'Smart Truncate', desc: 'Truncate text at word boundary with ellipsis.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-language-detect': { cat: 'Text Processing', name: 'Language Detect', desc: 'Detect language of text using word frequency heuristics.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-profanity-check': { cat: 'Text Processing', name: 'Profanity Check', desc: 'Check text for profanity against word list.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-readability-score': { cat: 'Text Processing', name: 'Readability Score', desc: 'Flesch-Kincaid readability grade level and score.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-keyword-extract': { cat: 'Text Processing', name: 'Keyword Extract', desc: 'Extract top keywords by frequency, excluding stop words.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-sentence-split': { cat: 'Text Processing', name: 'Sentence Split', desc: 'Split text into individual sentences.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-deduplicate-lines': { cat: 'Text Processing', name: 'Deduplicate Lines', desc: 'Remove duplicate lines from text.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-sort-lines': { cat: 'Text Processing', name: 'Sort Lines', desc: 'Sort lines alphabetically or numerically.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-reverse': { cat: 'Text Processing', name: 'Reverse Text', desc: 'Reverse a string.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-case-convert': { cat: 'Text Processing', name: 'Case Convert', desc: 'Convert between camelCase, snake_case, UPPER, lower, Title Case, kebab-case.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-lorem-ipsum': { cat: 'Text Processing', name: 'Lorem Ipsum', desc: 'Generate placeholder text of specified length.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-count-frequency': { cat: 'Text Processing', name: 'Frequency Analysis', desc: 'Character and word frequency analysis.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-strip-html': { cat: 'Text Processing', name: 'Strip HTML', desc: 'Remove all HTML tags from text.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-escape-html': { cat: 'Text Processing', name: 'Escape HTML', desc: 'Escape HTML entities (&lt; &gt; &amp; etc).', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-unescape-html': { cat: 'Text Processing', name: 'Unescape HTML', desc: 'Convert HTML entities back to characters.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-rot13': { cat: 'Text Processing', name: 'ROT13', desc: 'ROT13 encode/decode text.', credits: CREDIT_COSTS.trivial, tier: 'compute' },

  // ====== DATA TRANSFORM ======
  'text-markdown-to-html': { cat: 'Data Transform', name: 'Markdown to HTML', desc: 'Convert Markdown to HTML.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-csv-to-json': { cat: 'Data Transform', name: 'CSV to JSON', desc: 'Parse CSV text into JSON array of objects.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-json-to-csv': { cat: 'Data Transform', name: 'JSON to CSV', desc: 'Convert JSON array to CSV text.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-xml-to-json': { cat: 'Data Transform', name: 'XML to JSON', desc: 'Parse XML to JSON object.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-yaml-to-json': { cat: 'Data Transform', name: 'YAML to JSON', desc: 'Parse YAML key:value pairs to JSON.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-json-validate': { cat: 'Data Transform', name: 'JSON Validate', desc: 'Validate JSON syntax, return errors if invalid.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-json-format': { cat: 'Data Transform', name: 'JSON Format', desc: 'Pretty-print or minify JSON.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-json-path': { cat: 'Data Transform', name: 'JSON Path Query', desc: 'Extract value at a dot-notation path from JSON.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-json-flatten': { cat: 'Data Transform', name: 'JSON Flatten', desc: 'Flatten nested JSON to dot-notation keys.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-json-unflatten': { cat: 'Data Transform', name: 'JSON Unflatten', desc: 'Unflatten dot-notation keys back to nested JSON.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-json-diff': { cat: 'Data Transform', name: 'JSON Diff', desc: 'Diff two JSON objects, return added/removed/changed keys.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-json-merge': { cat: 'Data Transform', name: 'JSON Deep Merge', desc: 'Deep merge two JSON objects.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-json-schema-generate': { cat: 'Data Transform', name: 'JSON Schema Generate', desc: 'Generate JSON Schema from example data.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-base64-encode': { cat: 'Data Transform', name: 'Base64 Encode', desc: 'Encode text to Base64.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-base64-decode': { cat: 'Data Transform', name: 'Base64 Decode', desc: 'Decode Base64 to text.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-url-encode': { cat: 'Data Transform', name: 'URL Encode', desc: 'URL-encode a string.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-url-decode': { cat: 'Data Transform', name: 'URL Decode', desc: 'URL-decode a string.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-url-parse': { cat: 'Data Transform', name: 'URL Parse', desc: 'Parse URL into protocol, host, port, path, query params, hash.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-hex-encode': { cat: 'Data Transform', name: 'Hex Encode', desc: 'Convert string to hexadecimal.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-hex-decode': { cat: 'Data Transform', name: 'Hex Decode', desc: 'Convert hexadecimal to string.', credits: CREDIT_COSTS.trivial, tier: 'compute' },

  // ====== CRYPTO & SECURITY ======
  'crypto-hash-sha256': { cat: 'Crypto & Security', name: 'SHA256 Hash', desc: 'Compute SHA256 hash of input data.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-hash-sha512': { cat: 'Crypto & Security', name: 'SHA512 Hash', desc: 'Compute SHA512 hash of input data.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-hash-md5': { cat: 'Crypto & Security', name: 'MD5 Hash', desc: 'Compute MD5 hash of input data.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-hmac': { cat: 'Crypto & Security', name: 'HMAC-SHA256', desc: 'Compute HMAC-SHA256 with secret key.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-uuid': { cat: 'Crypto & Security', name: 'UUID v4', desc: 'Generate cryptographically random UUID v4.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-nanoid': { cat: 'Crypto & Security', name: 'Nanoid', desc: 'Generate compact unique ID (21 chars, URL-safe).', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-password-generate': { cat: 'Crypto & Security', name: 'Generate Password', desc: 'Generate secure random password with configurable length and character sets.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-password-hash': { cat: 'Crypto & Security', name: 'Hash Password', desc: 'Hash password using PBKDF2 with random salt.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'crypto-password-verify': { cat: 'Crypto & Security', name: 'Verify Password', desc: 'Verify password against PBKDF2 hash.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'crypto-random-bytes': { cat: 'Crypto & Security', name: 'Random Bytes', desc: 'Generate cryptographic random bytes (hex output).', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-random-int': { cat: 'Crypto & Security', name: 'Random Integer', desc: 'Generate random integer in a range.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-jwt-sign': { cat: 'Crypto & Security', name: 'JWT Sign', desc: 'Create and sign a JWT with HS256.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'crypto-jwt-verify': { cat: 'Crypto & Security', name: 'JWT Verify', desc: 'Verify JWT signature and check expiry.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'crypto-jwt-decode': { cat: 'Crypto & Security', name: 'JWT Decode', desc: 'Decode JWT payload without verification (unsafe inspect).', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-otp-generate': { cat: 'Crypto & Security', name: 'Generate OTP', desc: 'Generate numeric one-time password.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'crypto-encrypt-aes': { cat: 'Crypto & Security', name: 'AES Encrypt', desc: 'AES-256-GCM encrypt data with key.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'crypto-decrypt-aes': { cat: 'Crypto & Security', name: 'AES Decrypt', desc: 'AES-256-GCM decrypt data with key.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'crypto-checksum': { cat: 'Crypto & Security', name: 'Checksum', desc: 'Compute MD5 + SHA256 checksums of content.', credits: CREDIT_COSTS.trivial, tier: 'compute' },

  // ====== MATH & NUMBERS ======
  'math-evaluate': { cat: 'Math & Numbers', name: 'Evaluate Expression', desc: 'Safely evaluate a math expression (no eval). Supports +,-,*,/,^,%,parentheses.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'math-statistics': { cat: 'Math & Numbers', name: 'Statistics', desc: 'Compute mean, median, mode, stddev, min, max, sum, count from number array.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'math-percentile': { cat: 'Math & Numbers', name: 'Percentile', desc: 'Calculate percentile value from number array.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'math-histogram': { cat: 'Math & Numbers', name: 'Histogram', desc: 'Build histogram bins from number array.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'math-currency-convert': { cat: 'Math & Numbers', name: 'Currency Convert', desc: 'Convert between currencies using rates (static rates, updated periodically).', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'math-unit-convert': { cat: 'Math & Numbers', name: 'Unit Convert', desc: 'Convert between units: length, weight, temperature, volume, speed, data.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'math-color-convert': { cat: 'Math & Numbers', name: 'Color Convert', desc: 'Convert between hex, RGB, and HSL color formats.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'math-number-format': { cat: 'Math & Numbers', name: 'Number Format', desc: 'Format numbers with locale, currency, percentage, scientific notation.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'math-compound-interest': { cat: 'Math & Numbers', name: 'Compound Interest', desc: 'Calculate compound interest with principal, rate, time, frequency.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'math-loan-payment': { cat: 'Math & Numbers', name: 'Loan Payment', desc: 'Calculate monthly loan payment, total interest, amortization.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'math-roi-calculate': { cat: 'Math & Numbers', name: 'ROI Calculator', desc: 'Calculate ROI, payback period from cost and revenue figures.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'math-percentage-change': { cat: 'Math & Numbers', name: 'Percentage Change', desc: 'Calculate percentage change between two values.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'math-fibonacci': { cat: 'Math & Numbers', name: 'Fibonacci', desc: 'Generate fibonacci sequence up to n terms.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'math-prime-check': { cat: 'Math & Numbers', name: 'Prime Check', desc: 'Check if a number is prime. Return true/false + nearest primes.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'math-gcd': { cat: 'Math & Numbers', name: 'GCD', desc: 'Greatest common divisor of two or more numbers.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'math-lcm': { cat: 'Math & Numbers', name: 'LCM', desc: 'Least common multiple of two or more numbers.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'math-base-convert': { cat: 'Math & Numbers', name: 'Base Convert', desc: 'Convert numbers between bases (binary, octal, decimal, hex).', credits: CREDIT_COSTS.trivial, tier: 'compute' },

  // ====== DATE & TIME ======
  'date-parse': { cat: 'Date & Time', name: 'Date Parse', desc: 'Parse any date string to structured output (ISO, unix, components).', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'date-format': { cat: 'Date & Time', name: 'Date Format', desc: 'Format date using pattern tokens (YYYY, MM, DD, HH, mm, ss).', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'date-diff': { cat: 'Date & Time', name: 'Date Diff', desc: 'Difference between two dates in days, hours, minutes, seconds.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'date-add': { cat: 'Date & Time', name: 'Date Add', desc: 'Add days/hours/minutes to a date.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'date-weekday': { cat: 'Date & Time', name: 'Weekday', desc: 'Get day of week for a date.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'date-is-business-day': { cat: 'Date & Time', name: 'Is Business Day', desc: 'Check if date is a weekday (M-F).', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'date-business-days-between': { cat: 'Date & Time', name: 'Business Days Between', desc: 'Count business days between two dates.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'date-cron-parse': { cat: 'Date & Time', name: 'Cron Parse', desc: 'Parse cron expression to human-readable description.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'date-cron-next': { cat: 'Date & Time', name: 'Cron Next Runs', desc: 'Calculate next N run times for a cron expression.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'date-unix-to-iso': { cat: 'Date & Time', name: 'Unix to ISO', desc: 'Convert unix timestamp to ISO 8601 string.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'date-iso-to-unix': { cat: 'Date & Time', name: 'ISO to Unix', desc: 'Convert ISO 8601 string to unix timestamp.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'date-relative': { cat: 'Date & Time', name: 'Relative Time', desc: 'Convert timestamp to "3 days ago" / "in 2 hours" format.', credits: CREDIT_COSTS.trivial, tier: 'compute' },

  // ====== CODE UTILITIES ======
  'code-json-to-typescript': { cat: 'Code Utilities', name: 'JSON to TypeScript', desc: 'Generate TypeScript interface from JSON example.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'code-json-to-python-class': { cat: 'Code Utilities', name: 'JSON to Python Class', desc: 'Generate Python dataclass from JSON example.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'code-json-to-go-struct': { cat: 'Code Utilities', name: 'JSON to Go Struct', desc: 'Generate Go struct from JSON example.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'code-sql-format': { cat: 'Code Utilities', name: 'SQL Format', desc: 'Format/indent SQL query with keyword capitalization.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'code-cron-explain': { cat: 'Code Utilities', name: 'Cron Explain', desc: 'Explain cron expression in plain English.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'code-regex-explain': { cat: 'Code Utilities', name: 'Regex Explain', desc: 'Explain regex pattern token by token in plain English.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'code-semver-compare': { cat: 'Code Utilities', name: 'Semver Compare', desc: 'Compare two semantic version strings.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'code-semver-bump': { cat: 'Code Utilities', name: 'Semver Bump', desc: 'Bump semver by patch, minor, or major.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'code-diff-stats': { cat: 'Code Utilities', name: 'Diff Stats', desc: 'Parse unified diff, return files changed, additions, deletions.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'code-env-parse': { cat: 'Code Utilities', name: 'Parse .env', desc: 'Parse .env file content to JSON object.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'code-jwt-inspect': { cat: 'Code Utilities', name: 'JWT Inspect', desc: 'Decode and display JWT header and claims with expiry check.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'code-openapi-validate': { cat: 'Code Utilities', name: 'OpenAPI Validate', desc: 'Validate OpenAPI/Swagger spec for required fields, paths, and structure.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'code-dockerfile-lint': { cat: 'Code Utilities', name: 'Dockerfile Lint', desc: 'Lint Dockerfile for common issues: missing FROM, latest tag, apt-get without -y, ADD vs COPY.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'code-gitignore-generate': { cat: 'Code Utilities', name: 'Gitignore Generate', desc: 'Generate .gitignore for languages: node, python, go, rust, java, ruby.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-cron-to-english': { cat: 'Code Utilities', name: 'Cron to English', desc: 'Convert cron expression to detailed plain English description.', credits: CREDIT_COSTS.simple, tier: 'compute' },

  // ====== TEXT PROCESSING (new) ======
  'text-html-to-text': { cat: 'Text Processing', name: 'HTML to Text', desc: 'Strip HTML tags, decode entities, normalize to clean readable text.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-table-format': { cat: 'Text Processing', name: 'Table Format', desc: 'Format JSON array into aligned ASCII table.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-tree-format': { cat: 'Text Processing', name: 'Tree Format', desc: 'Format nested object as ASCII tree (like tree command).', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-diff-unified': { cat: 'Text Processing', name: 'Unified Diff', desc: 'Generate unified diff format (like diff -u) between two texts.', credits: CREDIT_COSTS.medium, tier: 'compute' },

  // ====== MATH (new) ======
  'math-mortgage-amortize': { cat: 'Math & Numbers', name: 'Mortgage Amortize', desc: 'Full amortization schedule with monthly payments, principal, interest, balance.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'math-tax-estimate': { cat: 'Math & Numbers', name: 'Tax Estimate', desc: 'US federal income tax estimate by bracket for any income and filing status.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'math-matrix-multiply': { cat: 'Math & Numbers', name: 'Matrix Multiply', desc: 'Multiply two matrices. Validates dimensions.', credits: CREDIT_COSTS.medium, tier: 'compute' },

  // ====== DATE (new) ======
  'date-holidays': { cat: 'Date & Time', name: 'US Holidays', desc: 'List all US federal holidays for a given year.', credits: CREDIT_COSTS.simple, tier: 'compute' },

  // ====== GENERATE (new) ======
  'gen-avatar-svg': { cat: 'Generate', name: 'Avatar SVG', desc: 'Generate deterministic identicon SVG from any string (hash-based grid).', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'gen-qr-svg': { cat: 'Generate', name: 'QR Code SVG', desc: 'Generate QR-style visual matrix as SVG from input data.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'crypto-totp-generate': { cat: 'Crypto & Security', name: 'TOTP Generate', desc: 'Generate time-based OTP (Google Authenticator compatible).', credits: CREDIT_COSTS.simple, tier: 'compute' },

  // ====== GENERATE ======
  'gen-fake-name': { cat: 'Generate', name: 'Fake Name', desc: 'Generate realistic fake full name.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'gen-fake-email': { cat: 'Generate', name: 'Fake Email', desc: 'Generate fake email address.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'gen-fake-company': { cat: 'Generate', name: 'Fake Company', desc: 'Generate fake company name.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'gen-fake-address': { cat: 'Generate', name: 'Fake Address', desc: 'Generate fake US address.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'gen-fake-phone': { cat: 'Generate', name: 'Fake Phone', desc: 'Generate fake phone number.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'gen-fake-user': { cat: 'Generate', name: 'Fake User Profile', desc: 'Generate full fake user profile (name, email, company, address, phone).', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'gen-fake-credit-card': { cat: 'Generate', name: 'Fake Credit Card', desc: 'Generate Luhn-valid fake CC number (NOT real, for testing only).', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'gen-color-palette': { cat: 'Generate', name: 'Color Palette', desc: 'Generate harmonious color palette from base hex color.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'gen-short-id': { cat: 'Generate', name: 'Short ID', desc: 'Generate compact URL-safe unique ID.', credits: CREDIT_COSTS.trivial, tier: 'compute' },

  // ====== NETWORK & DNS ======
  'net-dns-a': { cat: 'Network & DNS', name: 'DNS A Lookup', desc: 'Resolve A records (IPv4) for a domain.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-dns-aaaa': { cat: 'Network & DNS', name: 'DNS AAAA Lookup', desc: 'Resolve AAAA records (IPv6) for a domain.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-dns-mx': { cat: 'Network & DNS', name: 'DNS MX Lookup', desc: 'Resolve MX records for a domain.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-dns-txt': { cat: 'Network & DNS', name: 'DNS TXT Lookup', desc: 'Resolve TXT records for a domain.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-dns-ns': { cat: 'Network & DNS', name: 'DNS NS Lookup', desc: 'Resolve nameserver records for a domain.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-dns-all': { cat: 'Network & DNS', name: 'DNS Full Lookup', desc: 'All record types (A, AAAA, MX, TXT, NS) for a domain.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-http-status': { cat: 'Network & DNS', name: 'HTTP Status Check', desc: 'HEAD request to URL, return status code, headers, timing.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-http-headers': { cat: 'Network & DNS', name: 'HTTP Headers', desc: 'Fetch all response headers for a URL.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-http-redirect-chain': { cat: 'Network & DNS', name: 'Redirect Chain', desc: 'Follow redirects and return full chain of URLs + status codes.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-ssl-check': { cat: 'Network & DNS', name: 'SSL Certificate Check', desc: 'Inspect SSL certificate: issuer, expiry, days remaining, validity.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-email-validate': { cat: 'Network & DNS', name: 'Email Validate', desc: 'Validate email format + check MX records exist for domain.', credits: CREDIT_COSTS.complex, tier: 'network' },
  'net-ip-validate': { cat: 'Network & DNS', name: 'IP Validate', desc: 'Validate IP address, detect version (v4/v6), check if private.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'net-cidr-contains': { cat: 'Network & DNS', name: 'CIDR Contains', desc: 'Check if an IP falls within a CIDR range.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'net-url-parse': { cat: 'Network & DNS', name: 'URL Parse', desc: 'Parse URL into structured components.', credits: CREDIT_COSTS.trivial, tier: 'compute' },

  // ====== AI: CONTENT (needs LLM key) ======
  'llm-blog-outline': { cat: 'AI: Content', name: 'Blog Outline', desc: 'Generate SEO blog outline from topic + keywords.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-blog-draft': { cat: 'AI: Content', name: 'Blog Draft', desc: 'Generate full blog post draft from topic or outline.', credits: CREDIT_COSTS.llm_large, tier: 'llm' },
  'llm-landing-page-copy': { cat: 'AI: Content', name: 'Landing Page Copy', desc: 'Generate headline, subheadline, bullets, CTA for landing page.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-product-description': { cat: 'AI: Content', name: 'Product Description', desc: 'Generate product description from specs and features.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-email-draft': { cat: 'AI: Content', name: 'Email Draft', desc: 'Draft email from context + intent.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-email-reply': { cat: 'AI: Content', name: 'Email Reply', desc: 'Draft reply to an email thread.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-cold-outreach': { cat: 'AI: Content', name: 'Cold Outreach', desc: 'Personalized cold outreach email from prospect info.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-ad-copy': { cat: 'AI: Content', name: 'Ad Copy', desc: 'Generate ad copy variants (headline + description).', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-social-post': { cat: 'AI: Content', name: 'Social Post', desc: 'Generate social media post for any platform.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-video-script': { cat: 'AI: Content', name: 'Video Script', desc: 'Generate video script with hook, body, CTA.', credits: CREDIT_COSTS.llm_large, tier: 'llm' },
  'llm-press-release': { cat: 'AI: Content', name: 'Press Release', desc: 'Generate press release from news/event info.', credits: CREDIT_COSTS.llm_large, tier: 'llm' },
  'llm-tagline': { cat: 'AI: Content', name: 'Tagline Generator', desc: 'Generate tagline options for brand/product.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },

  // ====== AI: ANALYSIS (needs LLM key) ======
  'llm-summarize': { cat: 'AI: Analysis', name: 'Summarize', desc: 'Summarize any text. Configurable length and format.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-summarize-thread': { cat: 'AI: Analysis', name: 'Thread Summary', desc: 'Summarize email/chat thread with decisions + action items.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-sentiment': { cat: 'AI: Analysis', name: 'Sentiment Analysis', desc: 'Analyze sentiment with aspect-level detail and confidence.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-classify': { cat: 'AI: Analysis', name: 'Text Classify', desc: 'Classify text into your provided categories.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-extract-entities': { cat: 'AI: Analysis', name: 'Entity Extraction', desc: 'Extract people, orgs, dates, amounts, locations from text.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-extract-action-items': { cat: 'AI: Analysis', name: 'Action Items', desc: 'Extract action items with owners and deadlines from text.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-extract-key-points': { cat: 'AI: Analysis', name: 'Key Points', desc: 'Extract key points and takeaways from document.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-tone-analyze': { cat: 'AI: Analysis', name: 'Tone Analysis', desc: 'Analyze writing tone (formal/casual/urgent/friendly/etc).', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-translate': { cat: 'AI: Analysis', name: 'Translate', desc: 'Translate text to any language, preserving tone.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-rewrite': { cat: 'AI: Analysis', name: 'Rewrite', desc: 'Rewrite text in different tone, style, or reading level.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-proofread': { cat: 'AI: Analysis', name: 'Proofread', desc: 'Check grammar and spelling, return corrections.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },

  // ====== AI: CODE (needs LLM key) ======
  'llm-explain-code': { cat: 'AI: Code', name: 'Explain Code', desc: 'Explain what code does in plain English.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-explain-error': { cat: 'AI: Code', name: 'Explain Error', desc: 'Explain error message with fix suggestions.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-explain-command': { cat: 'AI: Code', name: 'Explain Command', desc: 'Explain shell command in plain English.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-explain-regex': { cat: 'AI: Code', name: 'Explain Regex (AI)', desc: 'Explain regex pattern with examples using AI.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-explain-sql': { cat: 'AI: Code', name: 'Explain SQL', desc: 'Explain SQL query in plain English.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-code-generate': { cat: 'AI: Code', name: 'Code Generate', desc: 'Generate code from natural language description.', credits: CREDIT_COSTS.llm_large, tier: 'llm' },
  'llm-code-review': { cat: 'AI: Code', name: 'Code Review', desc: 'Review code for bugs, security issues, performance.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-code-refactor': { cat: 'AI: Code', name: 'Refactor Suggest', desc: 'Suggest refactoring for cleaner code.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-code-test-generate': { cat: 'AI: Code', name: 'Test Generate', desc: 'Generate unit tests for code.', credits: CREDIT_COSTS.llm_large, tier: 'llm' },
  'llm-code-document': { cat: 'AI: Code', name: 'Code Document', desc: 'Generate documentation and docstrings.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-code-convert': { cat: 'AI: Code', name: 'Code Convert', desc: 'Convert code between programming languages.', credits: CREDIT_COSTS.llm_large, tier: 'llm' },
  'llm-sql-generate': { cat: 'AI: Code', name: 'SQL Generate', desc: 'Generate SQL from natural language query.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-regex-generate': { cat: 'AI: Code', name: 'Regex Generate', desc: 'Generate regex from natural language description.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-commit-message': { cat: 'AI: Code', name: 'Commit Message', desc: 'Generate commit message from diff.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-pr-description': { cat: 'AI: Code', name: 'PR Description', desc: 'Generate pull request description from diff/commits.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },

  // ====== AI: BUSINESS (needs LLM key) ======
  'llm-meeting-prep': { cat: 'AI: Business', name: 'Meeting Prep', desc: 'Generate meeting prep notes from attendees + topic.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-decision-analyze': { cat: 'AI: Business', name: 'Decision Analysis', desc: 'Analyze pros/cons/risks of a business decision.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-job-description': { cat: 'AI: Business', name: 'Job Description', desc: 'Generate job description from role requirements.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-interview-questions': { cat: 'AI: Business', name: 'Interview Questions', desc: 'Generate interview questions for a specific role.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-performance-review': { cat: 'AI: Business', name: 'Performance Review', desc: 'Draft performance review from notes/observations.', credits: CREDIT_COSTS.llm_large, tier: 'llm' },
  'llm-proposal-draft': { cat: 'AI: Business', name: 'Proposal Draft', desc: 'Draft business proposal from specs/requirements.', credits: CREDIT_COSTS.llm_large, tier: 'llm' },
  'llm-contract-summarize': { cat: 'AI: Business', name: 'Contract Summary', desc: 'Summarize contract key terms, obligations, and risks.', credits: CREDIT_COSTS.llm_large, tier: 'llm' },
  'llm-legal-clause-explain': { cat: 'AI: Business', name: 'Legal Clause Explain', desc: 'Explain legal clause in plain English.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-support-reply': { cat: 'AI: Business', name: 'Support Reply', desc: 'Generate customer support reply from ticket context.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-competitor-brief': { cat: 'AI: Business', name: 'Competitor Brief', desc: 'Generate competitor analysis brief from company info.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },

  // ====== NEW TIER 1: Compute (20 new APIs) ======
  'text-token-count': { cat: 'Text Processing', name: 'Token Count', desc: 'Estimate LLM token count (~4 chars/token). Essential for context window management.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-chunk': { cat: 'Text Processing', name: 'Text Chunker', desc: 'Split text into chunks for RAG pipelines. By chars, sentences, or paragraphs with overlap.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-template': { cat: 'Text Processing', name: 'Template Render', desc: 'Render {{variable}} templates with data. Handlebars-lite.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-sanitize': { cat: 'Text Processing', name: 'Sanitize HTML', desc: 'Strip XSS: remove script tags, event handlers, javascript: URLs.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-markdown-toc': { cat: 'Text Processing', name: 'Markdown TOC', desc: 'Generate table of contents from markdown headings with anchor links.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-indent': { cat: 'Text Processing', name: 'Indent/Dedent', desc: 'Indent or dedent text by N spaces.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-wrap': { cat: 'Text Processing', name: 'Word Wrap', desc: 'Word-wrap text at specified column width.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-detect-encoding': { cat: 'Text Processing', name: 'Detect Encoding', desc: 'Detect if text is ASCII/UTF-8, has unicode, emoji, CJK characters.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-markdown-lint': { cat: 'Text Processing', name: 'Markdown Lint', desc: 'Lint markdown: trailing spaces, missing blank lines, inconsistent lists.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'code-json-to-zod': { cat: 'Code Utilities', name: 'JSON to Zod', desc: 'Generate Zod validation schema from JSON example. Essential for TypeScript.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'code-css-minify': { cat: 'Code Utilities', name: 'CSS Minify', desc: 'Minify CSS: strip comments, collapse whitespace, optimize.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'code-js-minify': { cat: 'Code Utilities', name: 'JS Minify', desc: 'Basic JavaScript minification: strip comments, collapse whitespace.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'code-html-minify': { cat: 'Code Utilities', name: 'HTML Minify', desc: 'Minify HTML: strip comments, collapse whitespace between tags.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'code-package-json-generate': { cat: 'Code Utilities', name: 'Package.json Generate', desc: 'Generate package.json from name, description, and dependencies.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'math-moving-average': { cat: 'Math & Numbers', name: 'Moving Average', desc: 'Compute moving average over a sliding window of numbers.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'math-linear-regression': { cat: 'Math & Numbers', name: 'Linear Regression', desc: 'Simple linear regression: slope, intercept, R-squared from x,y data.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'math-expression-to-latex': { cat: 'Math & Numbers', name: 'Expression to LaTeX', desc: 'Convert math expression to LaTeX notation.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'gen-cron-expression': { cat: 'Generate', name: 'English to Cron', desc: 'Convert English schedule to cron: "every weekday at 9am" -> "0 9 * * 1-5"', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'gen-lorem-code': { cat: 'Generate', name: 'Lorem Code', desc: 'Generate realistic placeholder code in JS, Python, Go, or Rust.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'crypto-hash-compare': { cat: 'Crypto & Security', name: 'Hash Compare', desc: 'Constant-time hash comparison (timing-attack safe).', credits: CREDIT_COSTS.trivial, tier: 'compute' },

  // ====== NEW TIER 2: LLM (15 more AI APIs) ======
  'llm-data-extract': { cat: 'AI: Analysis', name: 'Data Extract', desc: 'Extract structured data from unstructured text into a specified JSON schema.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-email-subject': { cat: 'AI: Content', name: 'Email Subject', desc: 'Generate compelling email subject lines from email body/context.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-seo-meta': { cat: 'AI: Content', name: 'SEO Meta Tags', desc: 'Generate SEO title, description, and keywords from page content.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-changelog': { cat: 'AI: Code', name: 'Changelog Entry', desc: 'Generate changelog entry from git diff or commit messages.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-api-doc': { cat: 'AI: Code', name: 'API Documentation', desc: 'Generate API endpoint documentation from code or route definition.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-bug-report': { cat: 'AI: Code', name: 'Bug Report', desc: 'Generate structured bug report from error log or user description.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-user-story': { cat: 'AI: Business', name: 'User Story', desc: 'Generate user stories from feature description: "As a X, I want Y, so that Z"', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-okr-generate': { cat: 'AI: Business', name: 'OKR Generate', desc: 'Generate objectives and key results from team goals.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-faq-generate': { cat: 'AI: Content', name: 'FAQ Generate', desc: 'Generate FAQ section from product/service description.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-persona-create': { cat: 'AI: Business', name: 'Persona Create', desc: 'Generate detailed user persona from target audience description.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-swot-analysis': { cat: 'AI: Business', name: 'SWOT Analysis', desc: 'Generate SWOT analysis (Strengths, Weaknesses, Opportunities, Threats).', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-executive-summary': { cat: 'AI: Analysis', name: 'Executive Summary', desc: 'Generate executive summary from detailed report or data.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-slack-summary': { cat: 'AI: Analysis', name: 'Slack Summary', desc: 'Summarize Slack channel messages into daily digest.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },
  'llm-meeting-agenda': { cat: 'AI: Business', name: 'Meeting Agenda', desc: 'Generate meeting agenda from topic, attendees, and goals.', credits: CREDIT_COSTS.llm_small, tier: 'llm' },
  'llm-release-notes': { cat: 'AI: Code', name: 'Release Notes', desc: 'Generate user-facing release notes from technical changelog/commits.', credits: CREDIT_COSTS.llm_medium, tier: 'llm' },

  // ====== TIER 3: External service APIs (need service API keys) ======
  // These are defined but return {_engine:'needs_key',_unlock:'Set X env var'} until configured
  'ext-web-screenshot': { cat: 'External: Web', name: 'Web Screenshot', desc: 'Screenshot any URL as PNG. Needs: npm install puppeteer + PUPPETEER=1', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-web-scrape': { cat: 'External: Web', name: 'Web Scrape', desc: 'Extract text/links/images from URL. Needs: npm install cheerio', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-email-send': { cat: 'External: Comms', name: 'Send Email', desc: 'Send email via SendGrid/Resend. Needs: SENDGRID_API_KEY', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-sms-send': { cat: 'External: Comms', name: 'Send SMS', desc: 'Send SMS via Twilio. Needs: TWILIO_SID + TWILIO_TOKEN', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-slack-post': { cat: 'External: Comms', name: 'Slack Post', desc: 'Post message to Slack channel. Needs: SLACK_WEBHOOK_URL', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-github-issue': { cat: 'External: Dev', name: 'GitHub Issue Create', desc: 'Create GitHub issue. Needs: GITHUB_TOKEN', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-github-pr-comment': { cat: 'External: Dev', name: 'GitHub PR Comment', desc: 'Comment on GitHub PR. Needs: GITHUB_TOKEN', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-notion-page': { cat: 'External: Productivity', name: 'Notion Page Create', desc: 'Create Notion page. Needs: NOTION_API_KEY', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-linear-issue': { cat: 'External: Dev', name: 'Linear Issue Create', desc: 'Create Linear issue. Needs: LINEAR_API_KEY', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-discord-post': { cat: 'External: Comms', name: 'Discord Post', desc: 'Post to Discord channel. Needs: DISCORD_WEBHOOK_URL', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-telegram-send': { cat: 'External: Comms', name: 'Telegram Send', desc: 'Send Telegram message. Needs: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-s3-upload': { cat: 'External: Storage', name: 'S3 Upload', desc: 'Upload to S3/R2. Needs: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + S3_BUCKET', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-openai-embedding': { cat: 'External: AI', name: 'OpenAI Embedding', desc: 'Generate embeddings via OpenAI. Needs: OPENAI_API_KEY', credits: CREDIT_COSTS.complex, tier: 'external' },
  'ext-anthropic-message': { cat: 'External: AI', name: 'Claude Message', desc: 'Send custom message to Claude. Needs: ANTHROPIC_API_KEY', credits: CREDIT_COSTS.llm_medium, tier: 'external' },
  'ext-google-search': { cat: 'External: Web', name: 'Google Search', desc: 'Search Google and return results. Needs: GOOGLE_API_KEY + GOOGLE_CX', credits: CREDIT_COSTS.complex, tier: 'external' },

  // ====== AGENT-CRITICAL APIs (the 50%+ penetration tier) ======
  'llm-output-extract-json': { cat: 'Agent Tools', name: 'Extract JSON from LLM', desc: 'Extract JSON from messy LLM output (markdown, code fences, explanation text). The #1 agent pain point solved.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'llm-output-validate': { cat: 'Agent Tools', name: 'Validate LLM Output', desc: 'Validate LLM output against a JSON schema. Check types, required fields, enums, patterns.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'llm-output-fix-json': { cat: 'Agent Tools', name: 'Fix Broken JSON', desc: 'Fix broken JSON from LLMs: single quotes, trailing commas, missing braces, JS comments.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'json-schema-validate': { cat: 'Agent Tools', name: 'JSON Schema Validate', desc: 'Validate data against JSON Schema (draft-07). Types, required, enum, min/max, pattern.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'text-token-estimate-cost': { cat: 'Agent Tools', name: 'Token Cost Estimate', desc: 'Estimate token count and USD cost for Claude, GPT-4o, Gemini. Essential for budget-aware agents.', credits: CREDIT_COSTS.simple, tier: 'compute' },
  'webhook-send': { cat: 'Agent Tools', name: 'Webhook Send', desc: 'POST to any URL with any JSON payload. Agents need this to notify external systems.', credits: CREDIT_COSTS.complex, tier: 'compute' },
  'file-download': { cat: 'Agent Tools', name: 'File Download', desc: 'Download file from URL, return content as string. Agents cannot fetch URLs natively.', credits: CREDIT_COSTS.complex, tier: 'compute' },
  'kv-get': { cat: 'Agent Tools', name: 'KV Get', desc: 'Get value from persistent key-value store. Survives across sessions.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'kv-set': { cat: 'Agent Tools', name: 'KV Set', desc: 'Set value in persistent key-value store. Survives across sessions.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'kv-list': { cat: 'Agent Tools', name: 'KV List Keys', desc: 'List all keys in a KV namespace.', credits: CREDIT_COSTS.trivial, tier: 'compute' },

  // ====== VERIFICATION LAYER (the 50%+ push) ======
  'code-complexity-score': { cat: 'Code Utilities', name: 'Complexity Score', desc: 'Compute cyclomatic + cognitive complexity of code. Claude estimates, Slopshop computes exactly.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-compare-similarity': { cat: 'Text Processing', name: 'Text Similarity', desc: 'Compare two texts: Jaccard similarity, Levenshtein ratio, word overlap. Dedup, plagiarism, relevance.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-grammar-check': { cat: 'Text Processing', name: 'Grammar Check', desc: 'Rule-based grammar/style checker. Double spaces, repeated words, passive voice, long sentences.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'code-import-graph': { cat: 'Code Utilities', name: 'Import Graph', desc: 'Parse imports/requires from JS/TS/Python code. Map dependencies, separate local vs external.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'data-pivot': { cat: 'Data Transform', name: 'Data Pivot', desc: 'Pivot tabular data: group by index, spread columns, aggregate values.', credits: CREDIT_COSTS.medium, tier: 'compute' },
  'text-reading-time': { cat: 'Text Processing', name: 'Reading Time', desc: 'Estimate reading time (238 wpm) and speaking time (150 wpm) from text.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'code-dead-code-detect': { cat: 'Code Utilities', name: 'Dead Code Detect', desc: 'Find unused variables, uncalled functions, unreachable code in JS/TS.', credits: CREDIT_COSTS.medium, tier: 'compute' },
};

function buildCatalog() {
  const cats = {};
  for (const [slug, def] of Object.entries(API_DEFS)) {
    const catName = def.cat;
    if (!cats[catName]) {
      const catMeta = CATEGORIES[catName] || { icon: '\uD83D\uDD27', desc: catName };
      cats[catName] = { name: catName, icon: catMeta.icon, desc: catMeta.desc, apis: [] };
    }
    cats[catName].apis.push({
      slug,
      name: def.name,
      desc: def.desc,
      credits: def.credits,
      tier: def.tier,
      status: 'GA',
      safe_retry: true,
      batch: true,
      async: def.tier === 'llm',
    });
  }
  return Object.values(cats);
}

module.exports = { API_DEFS, CATEGORIES, CREDIT_COSTS, buildCatalog };
