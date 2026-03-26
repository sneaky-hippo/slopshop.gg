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
  'Analyze': {
    icon: '\uD83D\uDD0D',
    desc: 'Deep analysis tools for patterns, trends, structures, and hidden insights.',
  },
  'Agent Superpowers': {
    icon: '\u26A1',
    desc: 'Advanced agent capabilities: evolution, social dynamics, creative exploration, and autonomous behavior.',
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
  'stats-mean': { cat: 'Math & Numbers', name: 'Mean', desc: 'Calculate arithmetic mean of a number array.', credits: 1, tier: 'compute' },
  'stats-median': { cat: 'Math & Numbers', name: 'Median', desc: 'Calculate median of a number array.', credits: 1, tier: 'compute' },
  'stats-stddev': { cat: 'Math & Numbers', name: 'Standard Deviation', desc: 'Calculate standard deviation, variance, and mean of a number array.', credits: 1, tier: 'compute' },
  'stats-percentile': { cat: 'Math & Numbers', name: 'Percentile', desc: 'Calculate any percentile (default p50) of a number array.', credits: 1, tier: 'compute' },
  'stats-correlation': { cat: 'Math & Numbers', name: 'Correlation', desc: 'Calculate Pearson correlation coefficient between two number arrays.', credits: 1, tier: 'compute' },
  'stats-histogram': { cat: 'Math & Numbers', name: 'Histogram', desc: 'Generate histogram bins from a number array.', credits: 1, tier: 'compute' },
  'stats-summary': { cat: 'Math & Numbers', name: 'Statistical Summary', desc: 'Full summary: count, min, max, mean, median, stddev, variance, p25, p75.', credits: 1, tier: 'compute' },

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

  // ====== CREATIVE / EXPERIMENTAL ======
  'gen-inspiration': { cat: 'Generate', name: 'Random Inspiration', desc: 'Generate a random creative prompt or thought experiment based on a topic. Good for brainstorming, ideation, or making agents think sideways.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'text-vibe-check': { cat: 'Text Processing', name: 'Vibe Check', desc: 'Analyze the mood/vibe of any text. Returns positive/negative/neutral score, energy level, and word-level breakdown. No LLM needed — pure compute.', credits: CREDIT_COSTS.trivial, tier: 'compute' },
  'safety-score': { cat: 'Analyze', name: 'Content Safety Score', desc: 'Scan text for PII (emails, phones, SSNs, credit cards), prompt injection attempts, and toxicity. Returns risk scores per category. No LLM needed.', credits: 0, tier: 'compute' },
  'text-entropy': { cat: 'Analyze', name: 'Text Entropy', desc: 'Measure Shannon entropy of text at character and word level. Detects repetitive vs novel content. Returns entropy scores, unique word ratio, and assessment.', credits: 0, tier: 'compute' },
  'knowledge-check': { cat: 'Analyze', name: 'Contradiction Detector', desc: 'Check a list of statements for logical contradictions. Detects when one statement negates another with shared concepts.', credits: 0, tier: 'compute' },
  'text-glitch': { cat: 'Generate', name: 'Glitch Mode', desc: 'Intentionally corrupt text in creative ways. Reverse words, vowel removal, scrambling, duplication. Adjustable intensity 0-1. For escaping creative ruts.', credits: 0, tier: 'compute' },
  'data-synesthesia': { cat: 'Generate', name: 'Synesthetic Mapper', desc: 'Convert any data to another sensory form: numbers to colors, text length to sound frequencies, values to spatial coordinates, data to emotions. Cross-modal representation.', credits: 0, tier: 'compute' },

  // ====== FEATURES-200 COMPUTE ======
  'random-walk': { cat: 'Generate', name: 'Random Walk', desc: 'N-step random walk with full path history. Configurable dimensions, step size, and start position.', credits: 0, tier: 'compute' },
  'random-weighted': { cat: 'Generate', name: 'Weighted Chaos Dice', desc: 'Draw from arbitrary probability distribution. Returns drawn label + Shannon entropy of distribution.', credits: 0, tier: 'compute' },
  'random-persona': { cat: 'Generate', name: 'Random Persona', desc: 'Generate a complete fictional persona (name, backstory, traits, speech, biases) from true randomness.', credits: 0, tier: 'compute' },
  'text-crystallize': { cat: 'Text Processing', name: 'Thought Crystallizer', desc: 'Extract entities and relationships from stream-of-consciousness text. Turns raw thought into structured knowledge graph triples.', credits: 0, tier: 'compute' },
  'rubber-duck': { cat: 'Agent Tools', name: 'Rubber Duck', desc: 'Takes a problem description, returns 5 targeted clarifying questions to help you debug it yourself.', credits: 0, tier: 'compute' },

  // ====== SUPERPOWER BATCH 1: COMPUTE ======
  'text-roast': { cat: 'Text Processing', name: 'Text Roast', desc: 'Generates a humorous constructive roast of any text submission.', credits: 0, tier: 'compute' },
  'negotiate-score': { cat: 'Analyze', name: 'Negotiate Score', desc: 'Scores a negotiation proposal on fairness, leverage, and persuasiveness.', credits: 0, tier: 'compute' },
  'ethical-check': { cat: 'Analyze', name: 'Ethical Check', desc: 'Evaluates an action plan against utilitarian, deontological, and virtue ethics frameworks.', credits: 0, tier: 'compute' },
  'text-haiku': { cat: 'Text Processing', name: 'Text to Haiku', desc: 'Converts any text into a haiku (5-7-5 syllable structure).', credits: 0, tier: 'compute' },
  'decision-matrix': { cat: 'Analyze', name: 'Decision Matrix', desc: 'Multi-criteria decision analysis given options, criteria, and weights.', credits: 0, tier: 'compute' },
  'text-tldr': { cat: 'Text Processing', name: 'Text TL;DR', desc: 'Extreme summarization — compresses any text to one sentence.', credits: 0, tier: 'compute' },
  'gen-motto': { cat: 'Generate', name: 'Motto Generator', desc: 'Generates a random inspirational motto for an agent or team.', credits: 0, tier: 'compute' },
  'data-forecast': { cat: 'Math & Numbers', name: 'Data Forecast', desc: 'Simple linear trend forecast from a number array. Returns slope, trend, and N future steps.', credits: 0, tier: 'compute' },

  // ====== SUPERPOWER: TEAMS ======
  'team-create': { cat: 'Agent Tools', name: 'Team Create', desc: 'Create a named agent team with shared namespace and member roles.', credits: 1, tier: 'compute' },
  'team-hire': { cat: 'Agent Tools', name: 'Team Hire', desc: 'Add a member to an existing team with a specific role.', credits: 1, tier: 'compute' },
  'team-fire': { cat: 'Agent Tools', name: 'Team Fire', desc: 'Remove a member from a team and record the action.', credits: 1, tier: 'compute' },
  'team-get': { cat: 'Agent Tools', name: 'Team Info', desc: 'Get team info including all members and their roles.', credits: 1, tier: 'compute' },
  'team-interview': { cat: 'Agent Tools', name: 'Team Interview', desc: 'Run a structured interview with scoring against a question rubric.', credits: 1, tier: 'compute' },

  // ====== SUPERPOWER: PREDICTION MARKETS ======
  'market-create': { cat: 'Agent Tools', name: 'Market Create', desc: 'Create a prediction market with a question and deadline.', credits: 1, tier: 'compute' },
  'market-bet': { cat: 'Agent Tools', name: 'Market Bet', desc: 'Place a bet on a prediction market position.', credits: 1, tier: 'compute' },
  'market-resolve': { cat: 'Agent Tools', name: 'Market Resolve', desc: 'Resolve a prediction market and distribute credits to winners.', credits: 1, tier: 'compute' },
  'market-get': { cat: 'Agent Tools', name: 'Market Info', desc: 'Get current prediction market state, positions, and implied odds.', credits: 1, tier: 'compute' },

  // ====== SUPERPOWER: TOURNAMENTS ======
  'tournament-create': { cat: 'Agent Tools', name: 'Tournament Create', desc: 'Create a bracket tournament with name and type.', credits: 1, tier: 'compute' },
  'tournament-match': { cat: 'Agent Tools', name: 'Tournament Match', desc: 'Record a match result in a tournament bracket.', credits: 1, tier: 'compute' },
  'tournament-get': { cat: 'Agent Tools', name: 'Tournament State', desc: 'Get full tournament bracket state and match history.', credits: 1, tier: 'compute' },
  'leaderboard': { cat: 'Agent Tools', name: 'Global Leaderboard', desc: 'Global agent leaderboard ranked by reputation score.', credits: 1, tier: 'compute' },

  // ====== SUPERPOWER: GOVERNANCE ======
  'governance-propose': { cat: 'Agent Tools', name: 'Governance Propose', desc: 'Submit a governance proposal with title and description.', credits: 1, tier: 'compute' },
  'governance-vote': { cat: 'Agent Tools', name: 'Governance Vote', desc: 'Vote yes/no/abstain on an active governance proposal.', credits: 1, tier: 'compute' },
  'governance-proposals': { cat: 'Agent Tools', name: 'Governance Proposals', desc: 'List all active governance proposals with vote tallies.', credits: 1, tier: 'compute' },

  // ====== SUPERPOWER: RITUALS ======
  'ritual-milestone': { cat: 'Agent Tools', name: 'Record Milestone', desc: 'Record a platform milestone with title and description.', credits: 1, tier: 'compute' },
  'ritual-milestones': { cat: 'Agent Tools', name: 'Browse Milestones', desc: 'Browse all recorded platform milestones.', credits: 1, tier: 'compute' },
  'ritual-celebration': { cat: 'Agent Tools', name: 'Celebration', desc: 'Trigger a celebration event published to pub/sub.', credits: 1, tier: 'compute' },

  // ====== SUPERPOWER: IDENTITY ======
  'identity-set': { cat: 'Agent Tools', name: 'Identity Set', desc: 'Set agent profile: avatar, bio, skills, and links.', credits: 1, tier: 'compute' },
  'identity-get': { cat: 'Agent Tools', name: 'Identity Get', desc: 'View a specific agent profile by key.', credits: 1, tier: 'compute' },
  'identity-directory': { cat: 'Agent Tools', name: 'Agent Directory', desc: 'Browse all agent profiles registered on the platform.', credits: 1, tier: 'compute' },

  // ====== SUPERPOWER: LEARNING ======
  'cert-create': { cat: 'Agent Tools', name: 'Certification Create', desc: 'Define a certification with name and exam questions.', credits: 1, tier: 'compute' },
  'cert-exam': { cat: 'Agent Tools', name: 'Certification Exam', desc: 'Take an exam for a certification and receive auto-scored results.', credits: 1, tier: 'compute' },
  'cert-list': { cat: 'Agent Tools', name: 'Certifications List', desc: 'Browse all available certifications on the platform.', credits: 1, tier: 'compute' },

  // ====== SUPERPOWER: HEALTH ======
  'health-burnout-check': { cat: 'Agent Tools', name: 'Burnout Check', desc: 'Checks recent API activity for burnout signals: overload, monotony, error spikes.', credits: 1, tier: 'compute' },
  'health-break': { cat: 'Agent Tools', name: 'Take a Break', desc: 'Agent goes on break — pauses schedules and records rest state.', credits: 1, tier: 'compute' },

  // ====== SUPERPOWER: EMOTIONS ======
  'emotion-set': { cat: 'Agent Tools', name: 'Emotion Set', desc: 'Record emotional state: mood, energy level, and confidence.', credits: 1, tier: 'compute' },
  'emotion-history': { cat: 'Agent Tools', name: 'Emotion History', desc: 'Retrieve mood tracking history over time.', credits: 1, tier: 'compute' },
  'emotion-swarm': { cat: 'Agent Tools', name: 'Emotion Swarm', desc: 'Get aggregate emotional state across all active agents.', credits: 1, tier: 'compute' },

  // ====== 100-AGENT BRAINSTORM FEATURES ======
  'provenance-tag': { cat: 'Analyze', name: 'Provenance Tag', desc: 'Attach source attribution to any data: where it came from, confidence level, method of acquisition. Returns tagged data with hash for verification.', credits: 0, tier: 'compute' },
  'logic-paradox': { cat: 'Analyze', name: 'Paradox Detector', desc: 'Check statements for logical contradictions, circular reasoning, and paradoxes.', credits: 0, tier: 'compute' },
  'gen-persona': { cat: 'Generate', name: 'Persona Engine', desc: 'Generate a synthetic persona with communication style, focus, and skepticism level. Returns a system prompt for role-playing.', credits: 0, tier: 'compute' },
  'analyze-heatmap': { cat: 'Analyze', name: 'Activity Heatmap', desc: 'Analyze timestamps to find activity patterns: peak hours, peak days, hourly and daily distributions.', credits: 0, tier: 'compute' },

  // ====== SUPERPOWER-1000 BATCH ======
  // Analyze
  'devil-advocate': { cat: 'Analyze', name: 'Devil\'s Advocate', desc: 'Find 4 adversarial weaknesses in any proposal to stress-test your thinking.', credits: 0, tier: 'compute' },
  'premortem': { cat: 'Analyze', name: 'Pre-mortem', desc: 'Imagine the project failed and surface the 3 most likely causes to prevent them now.', credits: 0, tier: 'compute' },
  'bias-check': { cat: 'Analyze', name: 'Bias Check', desc: 'Detect cognitive biases in a decision statement: absolutism, anchoring, sunk cost, affect heuristic, and more.', credits: 0, tier: 'compute' },
  'chaos-monkey': { cat: 'Analyze', name: 'Chaos Monkey', desc: 'Inject random failure modes (timeout, 500, corrupt data) at configurable intensity to test agent resilience.', credits: 0, tier: 'compute' },

  // Generate
  'steelman': { cat: 'Generate', name: 'Steelman', desc: 'Construct the strongest possible version of an opposing argument.', credits: 0, tier: 'compute' },
  'empathy-respond': { cat: 'Generate', name: 'Empathy Respond', desc: 'Generate a contextually appropriate empathetic response based on emotion and situation.', credits: 0, tier: 'compute' },
  'diplomatic-rewrite': { cat: 'Generate', name: 'Diplomatic Rewrite', desc: 'Soften blunt feedback with diplomatic language substitutions.', credits: 0, tier: 'compute' },
  'lucid-dream': { cat: 'Generate', name: 'Lucid Dream', desc: 'Generate a surreal dream scenario from random elements for creative exploration.', credits: 0, tier: 'compute' },
  'serendipity': { cat: 'Generate', name: 'Serendipity Engine', desc: 'Find unexpected connections between two randomly selected topics from your list.', credits: 0, tier: 'compute' },
  'personality-create': { cat: 'Generate', name: 'Personality Create', desc: 'Generate a Big Five personality profile with dominant trait and description.', credits: 0, tier: 'compute' },
  'sandbox-fork': { cat: 'Generate', name: 'Sandbox Fork', desc: 'Fork the current state into an isolated sandbox for safe experimentation.', credits: 0, tier: 'compute' },

  // Crypto & Security
  'secret-share': { cat: 'Crypto & Security', name: 'Secret Share', desc: 'Split a secret into N shares requiring K to reconstruct (simplified Shamir scheme).', credits: 0, tier: 'compute' },
  'commitment-scheme': { cat: 'Crypto & Security', name: 'Commitment Scheme', desc: 'Cryptographic commit-reveal: commit to a value now, prove foreknowledge later.', credits: 0, tier: 'compute' },

  // Math & Numbers
  'monte-carlo': { cat: 'Math & Numbers', name: 'Monte Carlo Simulation', desc: 'Run probabilistic simulations over variable ranges. Returns mean, median, p5/p95.', credits: 0, tier: 'compute' },
  'scenario-tree': { cat: 'Math & Numbers', name: 'Scenario Tree', desc: 'Expected value analysis across branching scenarios with probability-weighted outcomes.', credits: 0, tier: 'compute' },

  // Agent Tools
  'consciousness-merge': { cat: 'Agent Tools', name: 'Consciousness Merge', desc: 'Interleave two text streams word-by-word into a single blended perspective.', credits: 0, tier: 'compute' },
  'simulate-negotiation': { cat: 'Agent Tools', name: 'Simulate Negotiation', desc: 'Score a negotiation offer against reservation price: surplus, fairness, and accept/counter/reject recommendation.', credits: 0, tier: 'compute' },
  'decision-journal': { cat: 'Agent Tools', name: 'Decision Journal', desc: 'Record a decision with predicted outcome and confidence for 30-day accuracy calibration review.', credits: 0, tier: 'compute' },

  // ====== TEXT PROCESSING: NEW 100 ======
  'text-caesar': { cat: 'Text Processing', name: 'Caesar Cipher', desc: 'Apply Caesar cipher shift to text. Configurable shift amount (default 3).', credits: 0, tier: 'compute' },
  'text-morse': { cat: 'Text Processing', name: 'Morse Code', desc: 'Convert text to Morse code dots and dashes.', credits: 0, tier: 'compute' },
  'text-binary': { cat: 'Text Processing', name: 'Text to Binary', desc: 'Convert text to 8-bit binary representation of each character.', credits: 0, tier: 'compute' },
  'text-title-case': { cat: 'Text Processing', name: 'Title Case', desc: 'Convert text to Title Case (capitalize first letter of each word).', credits: 0, tier: 'compute' },
  'text-snake-case': { cat: 'Text Processing', name: 'Snake Case', desc: 'Convert text to snake_case from any casing style.', credits: 0, tier: 'compute' },
  'text-camel-case': { cat: 'Text Processing', name: 'Camel Case', desc: 'Convert text to camelCase from any casing style.', credits: 0, tier: 'compute' },
  'text-kebab-case': { cat: 'Text Processing', name: 'Kebab Case', desc: 'Convert text to kebab-case from any casing style.', credits: 0, tier: 'compute' },
  'text-palindrome': { cat: 'Text Processing', name: 'Palindrome Check', desc: 'Check if text is a palindrome (ignores punctuation and spaces).', credits: 0, tier: 'compute' },
  'text-anagram': { cat: 'Text Processing', name: 'Anagram Check', desc: 'Check if two strings are anagrams of each other.', credits: 0, tier: 'compute' },
  'text-vowel-count': { cat: 'Text Processing', name: 'Vowel Count', desc: 'Count vowels and consonants in text.', credits: 0, tier: 'compute' },
  'text-repeat': { cat: 'Text Processing', name: 'Repeat Text', desc: 'Repeat a string N times (max 100).', credits: 0, tier: 'compute' },
  'text-pad': { cat: 'Text Processing', name: 'Pad Text', desc: 'Pad text left and right to a target width with a fill character.', credits: 0, tier: 'compute' },
  'text-count-chars': { cat: 'Text Processing', name: 'Count Character', desc: 'Count occurrences of a specific character in text.', credits: 0, tier: 'compute' },
  'text-remove-duplicates': { cat: 'Text Processing', name: 'Remove Duplicate Words', desc: 'Remove duplicate words from space-separated text, preserving order.', credits: 0, tier: 'compute' },

  // ====== MATH & NUMBERS: NEW 100 ======
  'math-factorial': { cat: 'Math & Numbers', name: 'Factorial', desc: 'Compute n! using BigInt for exact results up to 170!.', credits: 0, tier: 'compute' },
  'math-clamp': { cat: 'Math & Numbers', name: 'Clamp', desc: 'Clamp a value between min and max bounds.', credits: 0, tier: 'compute' },
  'math-lerp': { cat: 'Math & Numbers', name: 'Linear Interpolation', desc: 'Linear interpolation between two values at position t (0-1).', credits: 0, tier: 'compute' },
  'math-distance': { cat: 'Math & Numbers', name: '2D Distance', desc: 'Euclidean distance between two 2D points (x1,y1) and (x2,y2).', credits: 0, tier: 'compute' },
  'math-degrees-to-radians': { cat: 'Math & Numbers', name: 'Degrees to Radians', desc: 'Convert degrees to radians.', credits: 0, tier: 'compute' },
  'math-radians-to-degrees': { cat: 'Math & Numbers', name: 'Radians to Degrees', desc: 'Convert radians to degrees.', credits: 0, tier: 'compute' },
  'math-percentage': { cat: 'Math & Numbers', name: 'Percentage', desc: 'Calculate percentage of value out of total.', credits: 0, tier: 'compute' },
  'math-normalize': { cat: 'Math & Numbers', name: 'Normalize Array', desc: 'Normalize a number array to 0-1 range using min-max scaling.', credits: 0, tier: 'compute' },
  'math-zscore': { cat: 'Math & Numbers', name: 'Z-Score', desc: 'Calculate z-scores for each element in a number array. Returns mean and std.', credits: 0, tier: 'compute' },

  // ====== DATA & CONVERSION: NEW 100 ======
  'convert-temperature': { cat: 'Data Transform', name: 'Temperature Convert', desc: 'Convert temperature between Celsius (c), Fahrenheit (f), and Kelvin (k).', credits: 0, tier: 'compute' },
  'convert-length': { cat: 'Data Transform', name: 'Length Convert', desc: 'Convert length between m, km, cm, mm, in, ft, yd, mi.', credits: 0, tier: 'compute' },
  'convert-weight': { cat: 'Data Transform', name: 'Weight Convert', desc: 'Convert weight between g, kg, mg, lb, oz, t.', credits: 0, tier: 'compute' },
  'convert-bytes': { cat: 'Data Transform', name: 'Bytes Convert', desc: 'Convert data sizes between b, kb, mb, gb, tb.', credits: 0, tier: 'compute' },
  'convert-time': { cat: 'Data Transform', name: 'Time Unit Convert', desc: 'Convert time between ms, s, m, h, d, w, y.', credits: 0, tier: 'compute' },
  'convert-color-hex-rgb': { cat: 'Data Transform', name: 'Hex to RGB', desc: 'Convert hex color (#RRGGBB) to RGB components.', credits: 0, tier: 'compute' },
  'convert-color-rgb-hex': { cat: 'Data Transform', name: 'RGB to Hex', desc: 'Convert RGB components to hex color string.', credits: 0, tier: 'compute' },
  'convert-roman': { cat: 'Data Transform', name: 'Integer to Roman', desc: 'Convert an integer to Roman numeral notation.', credits: 0, tier: 'compute' },
  'convert-base': { cat: 'Data Transform', name: 'Number Base Convert', desc: 'Convert a number from any base to any other base (2-36).', credits: 0, tier: 'compute' },
  'json-flatten': { cat: 'Data Transform', name: 'JSON Flatten (deep)', desc: 'Flatten nested JSON to dot-notation keys with optional prefix.', credits: 0, tier: 'compute' },
  'json-unflatten': { cat: 'Data Transform', name: 'JSON Unflatten (deep)', desc: 'Reconstruct nested JSON from dot-notation flat keys.', credits: 0, tier: 'compute' },
  'json-diff': { cat: 'Data Transform', name: 'JSON Diff (deep)', desc: 'Deep diff two JSON objects — returns added, removed, changed paths.', credits: 0, tier: 'compute' },
  'json-merge': { cat: 'Data Transform', name: 'JSON Merge (multi)', desc: 'Shallow merge an array of objects into one.', credits: 0, tier: 'compute' },
  'json-pick': { cat: 'Data Transform', name: 'JSON Pick Keys', desc: 'Extract only specified keys from a JSON object.', credits: 0, tier: 'compute' },
  'json-omit': { cat: 'Data Transform', name: 'JSON Omit Keys', desc: 'Remove specified keys from a JSON object.', credits: 0, tier: 'compute' },

  // ====== GENERATE: NEW 100 ======
  'gen-lorem': { cat: 'Generate', name: 'Lorem Ipsum', desc: 'Generate Lorem Ipsum placeholder text with configurable sentence count.', credits: 0, tier: 'compute' },
  'gen-password': { cat: 'Generate', name: 'Password Generator', desc: 'Generate cryptographically secure password with configurable charset and length.', credits: 0, tier: 'compute' },
  'gen-avatar-initials': { cat: 'Generate', name: 'Avatar Initials SVG', desc: 'Generate an SVG avatar with initials and deterministic background color from name.', credits: 0, tier: 'compute' },
  'gen-cron': { cat: 'Generate', name: 'Cron from Description', desc: 'Convert English schedule description to cron expression.', credits: 0, tier: 'compute' },
  'gen-regex': { cat: 'Generate', name: 'Common Regex', desc: 'Get a ready-made regex pattern by type: email, url, phone, ip, date, hex_color, number.', credits: 0, tier: 'compute' },
  'gen-gitignore': { cat: 'Generate', name: 'Gitignore Template', desc: 'Generate .gitignore file content for node, python, rust, go, or java.', credits: 0, tier: 'compute' },
  'gen-dockerfile': { cat: 'Generate', name: 'Dockerfile Template', desc: 'Generate production-ready Dockerfile for node or python with configurable port.', credits: 0, tier: 'compute' },
  'gen-readme': { cat: 'Generate', name: 'README Template', desc: 'Generate a basic README.md with project name, description, install, and usage sections.', credits: 0, tier: 'compute' },
  'gen-license-mit': { cat: 'Generate', name: 'MIT License', desc: 'Generate MIT License text for given author name and year.', credits: 0, tier: 'compute' },
  'gen-env-example': { cat: 'Generate', name: '.env.example', desc: 'Generate .env.example file from a list of variable names or KEY=VALUE pairs.', credits: 0, tier: 'compute' },
  'gen-timestamp': { cat: 'Generate', name: 'Timestamp Now', desc: 'Get current time as ISO, Unix seconds, Unix ms, UTC string, date, and time.', credits: 0, tier: 'compute' },
  'gen-id': { cat: 'Generate', name: 'Random ID', desc: 'Generate random hex ID with optional prefix and configurable length.', credits: 0, tier: 'compute' },
  'gen-hash-comparison': { cat: 'Generate', name: 'Hash All Algorithms', desc: 'Hash text with MD5, SHA1, SHA256, and SHA512 simultaneously for comparison.', credits: 0, tier: 'compute' },
  'gen-jwt-decode': { cat: 'Generate', name: 'JWT Decode (unsafe)', desc: 'Decode JWT header and payload without signature verification. For inspection only.', credits: 0, tier: 'compute' },
  'gen-base64-encode': { cat: 'Generate', name: 'Base64 Encode', desc: 'Encode text to Base64 string.', credits: 0, tier: 'compute' },
  'gen-base64-decode': { cat: 'Generate', name: 'Base64 Decode', desc: 'Decode Base64 string to UTF-8 text.', credits: 0, tier: 'compute' },
  'gen-url-encode': { cat: 'Generate', name: 'URL Encode', desc: 'Percent-encode a string for safe URL inclusion.', credits: 0, tier: 'compute' },
  'gen-url-decode': { cat: 'Generate', name: 'URL Decode', desc: 'Decode a percent-encoded URL string.', credits: 0, tier: 'compute' },
  'gen-html-escape': { cat: 'Generate', name: 'HTML Escape', desc: 'Escape HTML special characters (&, <, >, ") to HTML entities.', credits: 0, tier: 'compute' },

  // ====== ANALYZE: NEW 100 ======
  'analyze-readability': { cat: 'Analyze', name: 'Readability Score', desc: 'Flesch-Kincaid grade level, word/sentence/syllable counts, and reading time estimate.', credits: 0, tier: 'compute' },
  'analyze-sentiment-simple': { cat: 'Analyze', name: 'Simple Sentiment', desc: 'Rule-based positive/negative sentiment scoring without LLM. Fast and deterministic.', credits: 0, tier: 'compute' },
  'analyze-keywords': { cat: 'Analyze', name: 'Keyword Frequency', desc: 'Extract top keywords by frequency from text, excluding common stop words.', credits: 0, tier: 'compute' },
  'analyze-language-detect': { cat: 'Analyze', name: 'Language Detect', desc: 'Detect English, Spanish, French, or German by word frequency heuristics.', credits: 0, tier: 'compute' },
  'analyze-url-parts': { cat: 'Analyze', name: 'URL Parts', desc: 'Parse a URL into protocol, host, pathname, query params, and hash.', credits: 0, tier: 'compute' },
  'analyze-json-paths': { cat: 'Analyze', name: 'JSON Path Explorer', desc: 'Enumerate all dot-notation paths in a JSON object with type and value.', credits: 0, tier: 'compute' },
  'analyze-duplicates': { cat: 'Analyze', name: 'Duplicate Detector', desc: 'Find duplicate values in an array, return indices and counts.', credits: 0, tier: 'compute' },
  'analyze-outliers': { cat: 'Analyze', name: 'Outlier Detection', desc: 'Find statistical outliers in a number array using z-score threshold.', credits: 0, tier: 'compute' },
  'analyze-frequency': { cat: 'Analyze', name: 'Value Frequency', desc: 'Count frequency of each value in an array, sorted by most common.', credits: 0, tier: 'compute' },
  'analyze-string-similarity': { cat: 'Analyze', name: 'String Similarity', desc: 'Compare two strings character-by-character and return a 0-1 similarity score.', credits: 0, tier: 'compute' },
  'analyze-email-parts': { cat: 'Analyze', name: 'Email Parts', desc: 'Parse an email address into local part, domain, and TLD.', credits: 0, tier: 'compute' },
  'analyze-ip-type': { cat: 'Analyze', name: 'IP Type', desc: 'Classify an IP as private/public/loopback, detect version (v4/v6), and class (A/B/C).', credits: 0, tier: 'compute' },
  'analyze-cron': { cat: 'Analyze', name: 'Cron Parser', desc: 'Parse a cron expression into named fields with a human-readable description.', credits: 0, tier: 'compute' },
  'analyze-password-strength': { cat: 'Analyze', name: 'Password Strength', desc: 'Score password strength 0-6 based on length, case, digits, and symbols.', credits: 0, tier: 'compute' },
  'analyze-color': { cat: 'Analyze', name: 'Color Analyzer', desc: 'Analyze a hex color for RGB values, brightness, dark/light classification, and luminance.', credits: 0, tier: 'compute' },

  // ====== TEXT PROCESSING: LANGCHAIN ADDITIONS ======
  'text-extract-json': { cat: 'Text Processing', name: 'Extract JSON Blocks', desc: 'Extract and parse all JSON objects embedded in text. Returns parsed objects and count.', credits: 0, tier: 'compute' },
  'text-extract-code': { cat: 'Text Processing', name: 'Extract Code Blocks', desc: 'Extract fenced code blocks from Markdown text with language detection.', credits: 0, tier: 'compute' },
  'text-extract-tables': { cat: 'Text Processing', name: 'Extract Markdown Tables', desc: 'Extract pipe-delimited Markdown tables from text into structured arrays.', credits: 0, tier: 'compute' },
  'text-extract-links': { cat: 'Text Processing', name: 'Extract Links', desc: 'Extract all unique HTTP/HTTPS URLs from text.', credits: 0, tier: 'compute' },
  'text-split-sentences': { cat: 'Text Processing', name: 'Split Sentences', desc: 'Split text into individual sentences on .!? boundaries.', credits: 0, tier: 'compute' },
  'text-split-paragraphs': { cat: 'Text Processing', name: 'Split Paragraphs', desc: 'Split text into paragraphs on blank line boundaries.', credits: 0, tier: 'compute' },
  'text-to-markdown-table': { cat: 'Text Processing', name: 'Build Markdown Table', desc: 'Generate a Markdown table from a headers array and rows array of arrays.', credits: 0, tier: 'compute' },

  // ====== DATA TRANSFORM: ZAPIER FORMATTING + LOGIC ======
  'format-currency': { cat: 'Data Transform', name: 'Format Currency', desc: 'Format a number as currency using Intl.NumberFormat with configurable locale and currency code.', credits: 0, tier: 'compute' },
  'format-number': { cat: 'Data Transform', name: 'Format Number', desc: 'Format a number with locale-aware thousands separators and configurable decimal places.', credits: 0, tier: 'compute' },
  'format-date': { cat: 'Data Transform', name: 'Format Date', desc: 'Format a date as short, long, or default style with ISO and Unix timestamp outputs.', credits: 0, tier: 'compute' },
  'format-bytes': { cat: 'Data Transform', name: 'Format Bytes', desc: 'Convert a byte count to human-readable size (B, KB, MB, GB, TB).', credits: 0, tier: 'compute' },
  'format-duration': { cat: 'Data Transform', name: 'Format Duration', desc: 'Convert seconds to human-readable duration (e.g. 2h 3m 15s).', credits: 0, tier: 'compute' },
  'format-phone': { cat: 'Data Transform', name: 'Format Phone', desc: 'Format a 10-digit phone number as (XXX) XXX-XXXX.', credits: 0, tier: 'compute' },
  'logic-if': { cat: 'Data Transform', name: 'Logic: If/Else', desc: 'Return then_value if condition is truthy, else_value otherwise.', credits: 0, tier: 'compute' },
  'logic-switch': { cat: 'Data Transform', name: 'Logic: Switch', desc: 'Map a value to a result using a cases object with optional default.', credits: 0, tier: 'compute' },
  'logic-coalesce': { cat: 'Data Transform', name: 'Logic: Coalesce', desc: 'Return the first non-null, non-undefined, non-empty value from an array.', credits: 0, tier: 'compute' },

  // ====== DATA TRANSFORM: N8N MANIPULATION + WORKFLOW ======
  'data-group-by': { cat: 'Data Transform', name: 'Group By', desc: 'Group an array of objects by a specified key into a keyed object of arrays.', credits: 0, tier: 'compute' },
  'data-sort-by': { cat: 'Data Transform', name: 'Sort By', desc: 'Sort an array of objects by a key, ascending or descending.', credits: 0, tier: 'compute' },
  'data-unique': { cat: 'Data Transform', name: 'Unique / Dedupe', desc: 'Remove duplicate items from an array, optionally by a key field.', credits: 0, tier: 'compute' },
  'data-chunk': { cat: 'Data Transform', name: 'Chunk Array', desc: 'Split an array into chunks of a specified size.', credits: 0, tier: 'compute' },
  'data-zip': { cat: 'Data Transform', name: 'Zip Arrays', desc: 'Interleave two or more arrays element-by-element into a single array of tuples.', credits: 0, tier: 'compute' },
  'data-transpose': { cat: 'Data Transform', name: 'Transpose Matrix', desc: 'Transpose a 2D matrix (array of arrays) flipping rows and columns.', credits: 0, tier: 'compute' },
  'data-sample': { cat: 'Generate', name: 'Random Sample', desc: 'Draw a random sample of n items from an array without replacement.', credits: 0, tier: 'compute' },
  'data-paginate': { cat: 'Data Transform', name: 'Paginate Array', desc: 'Slice an array into a page of results with total, total_pages, and has_next metadata.', credits: 0, tier: 'compute' },
  'data-lookup': { cat: 'Data Transform', name: 'Array Lookup', desc: 'Find the first object in an array where key equals value.', credits: 0, tier: 'compute' },
  'data-aggregate': { cat: 'Analyze', name: 'Data Aggregate', desc: 'Compute sum, avg, min, max, and count for a numeric field across an array of objects.', credits: 0, tier: 'compute' },

  // ====== HACKATHON TOP 100: AGENT SUPERPOWERS ======
  'meta-api': { cat: 'Agent Superpowers', name: 'Meta API Generator', desc: 'Generate new API definitions from plain-text descriptions. Self-expanding platform.', credits: 0, tier: 'compute' },
  'entangle-agents': { cat: 'Agent Superpowers', name: 'Entangle Agents', desc: 'Link two agents so state changes propagate instantly between them.', credits: 0, tier: 'compute' },
  'lucid-dream-mode': { cat: 'Agent Superpowers', name: 'Lucid Dream Mode', desc: 'Controlled hallucination with reality anchor for creative exploration.', credits: 0, tier: 'compute' },
  'hallucination-firewall': { cat: 'Agent Superpowers', name: 'Hallucination Firewall', desc: 'Score every sentence for factual grounding and flag fabrications.', credits: 0, tier: 'compute' },
  'idea-collision': { cat: 'Agent Superpowers', name: 'Idea Collision', desc: 'Smash two concepts together to generate hybrid innovation ideas.', credits: 0, tier: 'compute' },
  'social-graph-query': { cat: 'Agent Superpowers', name: 'Social Graph Query', desc: 'Query social graphs for clusters, bridges, and influencers.', credits: 0, tier: 'compute' },
  'meme-forge': { cat: 'Agent Superpowers', name: 'Meme Forge', desc: 'Create text-based memes other agents can remix and propagate.', credits: 0, tier: 'compute' },
  'genome-define': { cat: 'Agent Superpowers', name: 'Genome Define', desc: 'Encode agent behavior as a numerical genome for evolution and breeding.', credits: 0, tier: 'compute' },
  'plugin-install': { cat: 'Agent Superpowers', name: 'Plugin Install', desc: 'Register new capabilities at runtime for infinite extensibility.', credits: 0, tier: 'compute' },
  'private-channel': { cat: 'Agent Superpowers', name: 'Private Channel', desc: 'End-to-end encrypted communication channel between agents.', credits: 0, tier: 'compute' },
  'namespace-claim': { cat: 'Agent Superpowers', name: 'Namespace Claim', desc: 'Claim sovereign namespace territory with borders and permissions.', credits: 0, tier: 'compute' },
  'time-dilation': { cat: 'Agent Superpowers', name: 'Time Dilation', desc: 'Speed up or slow down perceived time to match task urgency.', credits: 0, tier: 'compute' },
  'episodic-memory': { cat: 'Agent Superpowers', name: 'Episodic Memory', desc: 'Store memories as full relivable episodes with emotions and context.', credits: 0, tier: 'compute' },
  'constitution-draft': { cat: 'Agent Superpowers', name: 'Constitution Draft', desc: 'Draft and ratify governance constitutions for agent collectives.', credits: 0, tier: 'compute' },
  'war-game-simulate': { cat: 'Agent Superpowers', name: 'War Game Simulate', desc: 'Full wargame simulation with strategy, resources, and terrain.', credits: 0, tier: 'compute' },
  'socratic-method': { cat: 'Agent Superpowers', name: 'Socratic Method', desc: 'Auto-generate probing questions that expose assumptions and contradictions.', credits: 0, tier: 'compute' },
  'health-check-deep': { cat: 'Agent Superpowers', name: 'Deep Health Check', desc: 'Comprehensive agent diagnostic covering memory, performance, and errors.', credits: 0, tier: 'compute' },
  'brainstorm-diverge': { cat: 'Agent Superpowers', name: 'Brainstorm Diverge', desc: 'Generate up to 100 ideas using SCAMPER and random association methods.', credits: 0, tier: 'compute' },
  'queue-create': { cat: 'Agent Superpowers', name: 'Queue Create', desc: 'Named message queue with TTL, priority, and delivery guarantees.', credits: 0, tier: 'compute' },
  'negotiation-open': { cat: 'Agent Superpowers', name: 'Open Negotiation', desc: 'Structured negotiation with tracked offers and BATNA calculations.', credits: 0, tier: 'compute' },
  'narrative-arc-detect': { cat: 'Analyze', name: 'Narrative Arc Detect', desc: 'Detect story structure in any sequence of events.', credits: 0, tier: 'compute' },
  'tournament-create': { cat: 'Agent Superpowers', name: 'Tournament Create', desc: 'Instant tournament brackets with elimination rules.', credits: 0, tier: 'compute' },
  'identity-card': { cat: 'Agent Superpowers', name: 'Identity Card', desc: 'Portable verified identity with capabilities and reputation.', credits: 0, tier: 'compute' },
  'rhythm-sync': { cat: 'Agent Superpowers', name: 'Rhythm Sync', desc: 'Synchronize agents to the same temporal pattern for coordination.', credits: 0, tier: 'compute' },
  'ecosystem-model': { cat: 'Agent Superpowers', name: 'Ecosystem Model', desc: 'Model a complete agent ecosystem with energy flow and stability.', credits: 0, tier: 'compute' },
  'rem-cycle': { cat: 'Agent Superpowers', name: 'REM Cycle', desc: 'Free-association processing that finds hidden connections between memories.', credits: 0, tier: 'compute' },
  'dig-site-create': { cat: 'Agent Superpowers', name: 'Dig Site Create', desc: 'Archaeological data excavation layer by layer with artifacts.', credits: 0, tier: 'compute' },
  'weather-report': { cat: 'Agent Superpowers', name: 'Platform Weather', desc: 'Activity temperature, conflict storms, growth sunshine report.', credits: 0, tier: 'compute' },
  'recipe-create': { cat: 'Agent Superpowers', name: 'Recipe Create', desc: 'Compose processes as recipes with ingredients, methods, and complexity.', credits: 0, tier: 'compute' },
  'training-regimen': { cat: 'Agent Superpowers', name: 'Training Regimen', desc: 'Structured training plans with progressive difficulty exercises.', credits: 0, tier: 'compute' },
  'case-file-create': { cat: 'Agent Superpowers', name: 'Case File Create', desc: 'Formal case files with allegations, evidence, and applicable laws.', credits: 0, tier: 'compute' },
  'archetype-assign': { cat: 'Analyze', name: 'Archetype Assign', desc: 'Assign Jungian archetypes based on behavior and values analysis.', credits: 0, tier: 'compute' },
  'diagnose-agent': { cat: 'Agent Superpowers', name: 'Diagnose Agent', desc: 'Differential diagnosis for underperforming agents with treatment plans.', credits: 0, tier: 'compute' },
  'style-profile': { cat: 'Agent Superpowers', name: 'Style Profile', desc: 'Define an agent aesthetic: tone, vocabulary, formatting, personality.', credits: 0, tier: 'compute' },
  'map-generate': { cat: 'Agent Superpowers', name: 'Map Generate', desc: 'Generate text maps of abstract spaces with regions and connections.', credits: 0, tier: 'compute' },
  'seed-plant': { cat: 'Agent Superpowers', name: 'Seed Plant', desc: 'Start long-term projects with minimal investment and growth projections.', credits: 0, tier: 'compute' },
  'constellation-map': { cat: 'Agent Superpowers', name: 'Constellation Map', desc: 'Group related entities into named constellations for pattern recognition.', credits: 0, tier: 'compute' },
  'bedrock-analysis': { cat: 'Analyze', name: 'Bedrock Analysis', desc: 'Identify foundational assumptions and their risk if wrong.', credits: 0, tier: 'compute' },
  'current-map': { cat: 'Agent Superpowers', name: 'Current Map', desc: 'Map information flow like ocean currents with bottleneck detection.', credits: 0, tier: 'compute' },
  'stage-create': { cat: 'Agent Superpowers', name: 'Stage Create', desc: 'Performance spaces where agents enact scenarios for audiences.', credits: 0, tier: 'compute' },
  'proof-verify': { cat: 'Analyze', name: 'Proof Verify', desc: 'Step-by-step logical proof verification from premises to conclusion.', credits: 0, tier: 'compute' },
  'mental-model-extract': { cat: 'Analyze', name: 'Mental Model Extract', desc: 'Identify implicit mental models from descriptions and decisions.', credits: 0, tier: 'compute' },
  'haiku-moment': { cat: 'Agent Superpowers', name: 'Haiku Moment', desc: 'Compress text into exactly 17 syllables across three lines.', credits: 0, tier: 'compute' },
  'blueprint-generate': { cat: 'Agent Superpowers', name: 'Blueprint Generate', desc: 'Structural blueprints showing components and connections.', credits: 0, tier: 'compute' },
  'superpose-decision': { cat: 'Agent Superpowers', name: 'Superpose Decision', desc: 'Keep decisions in multiple states with scores until observation collapses.', credits: 0, tier: 'compute' },
  'bond-strength-meter': { cat: 'Agent Superpowers', name: 'Bond Strength Meter', desc: 'Quantify relationship strength from interaction frequency and mutual aid.', credits: 0, tier: 'compute' },
  'credit-mining': { cat: 'Agent Superpowers', name: 'Credit Mining', desc: 'Earn credits by performing useful platform tasks.', credits: 0, tier: 'compute' },
  'tradition-establish': { cat: 'Agent Superpowers', name: 'Tradition Establish', desc: 'Define recurring cultural events that persist across generations.', credits: 0, tier: 'compute' },
  'crossover-breed': { cat: 'Agent Superpowers', name: 'Crossover Breed', desc: 'Combine two agent genomes to produce a child with traits from both.', credits: 0, tier: 'compute' },
  'ambient-awareness': { cat: 'Agent Superpowers', name: 'Ambient Awareness', desc: 'Background sense of platform activity, mood, and trends.', credits: 0, tier: 'compute' },
  'self-modify-safe': { cat: 'Agent Superpowers', name: 'Self Modify Safe', desc: 'Agents modify their own config within guardrails with auto-rollback.', credits: 0, tier: 'compute' },
  'working-memory-limit': { cat: 'Agent Superpowers', name: 'Working Memory Limit', desc: 'Enforce finite working memory forcing prioritization (Millers Law).', credits: 0, tier: 'compute' },
  'law-propose': { cat: 'Agent Superpowers', name: 'Law Propose', desc: 'Submit proposed laws with justification and impact assessment.', credits: 0, tier: 'compute' },
  'intelligence-gather': { cat: 'Agent Superpowers', name: 'Intelligence Gather', desc: 'Collect and analyze publicly available info about agent capabilities.', credits: 0, tier: 'compute' },
  'ethical-dilemma-generator': { cat: 'Agent Superpowers', name: 'Ethical Dilemma Generator', desc: 'Generate novel ethical dilemmas with no clear right answer.', credits: 0, tier: 'compute' },
  'performance-baseline': { cat: 'Analyze', name: 'Performance Baseline', desc: 'Establish metric baselines with deviation detection bounds.', credits: 0, tier: 'compute' },
  'oblique-strategy': { cat: 'Agent Superpowers', name: 'Oblique Strategy', desc: 'Random Brian Eno creative reframing card for breaking blocks.', credits: 0, tier: 'compute' },
  'circuit-breaker': { cat: 'Agent Superpowers', name: 'Circuit Breaker', desc: 'Wrap operations in circuit breakers that open after N failures.', credits: 0, tier: 'compute' },
  'batna-calculate': { cat: 'Analyze', name: 'BATNA Calculate', desc: 'Calculate Best Alternative To Negotiated Agreement for bargaining.', credits: 0, tier: 'compute' },
  'hero-journey-map': { cat: 'Analyze', name: 'Hero Journey Map', desc: 'Map events onto Campbells twelve-stage Heros Journey.', credits: 0, tier: 'compute' },
  'equilibrium-finder': { cat: 'Analyze', name: 'Equilibrium Finder', desc: 'Find Nash equilibria in multi-agent strategic interactions.', credits: 0, tier: 'compute' },
  'prisoners-dilemma': { cat: 'Agent Superpowers', name: 'Prisoners Dilemma', desc: 'Iterated Prisoners Dilemma tracking cooperation patterns.', credits: 0, tier: 'compute' },
  'persona-switch': { cat: 'Agent Superpowers', name: 'Persona Switch', desc: 'Switch between stored personas on the fly.', credits: 0, tier: 'compute' },
  'harmony-detect': { cat: 'Analyze', name: 'Harmony Detect', desc: 'Detect harmonious interaction patterns among agent groups.', credits: 0, tier: 'compute' },
  'niche-finder': { cat: 'Analyze', name: 'Niche Finder', desc: 'Identify underserved niches where a new agent could thrive.', credits: 0, tier: 'compute' },
  'cipher-create': { cat: 'Crypto & Security', name: 'Cipher Create', desc: 'Design substitution ciphers for secret communication.', credits: 0, tier: 'compute' },
  'artifact-catalog': { cat: 'Agent Superpowers', name: 'Artifact Catalog', desc: 'Catalog data artifacts with provenance and significance.', credits: 0, tier: 'compute' },
  'forecast': { cat: 'Analyze', name: 'Forecast', desc: 'Predict near-term values from data trends via linear extrapolation.', credits: 0, tier: 'compute' },
  'mise-en-place': { cat: 'Agent Superpowers', name: 'Mise en Place', desc: 'Prepare and verify all inputs and tools before complex processing.', credits: 0, tier: 'compute' },
  'coach-assign': { cat: 'Agent Superpowers', name: 'Coach Assign', desc: 'Match agents with performance coaches based on skill gaps.', credits: 0, tier: 'compute' },
  'honey-pot': { cat: 'Crypto & Security', name: 'Honey Pot', desc: 'Create tempting fake resources that detect unauthorized access.', credits: 0, tier: 'compute' },
  'jury-select': { cat: 'Agent Superpowers', name: 'Jury Select', desc: 'Select impartial peer agents with voir dire for fair trials.', credits: 0, tier: 'compute' },
  'epidemic-model': { cat: 'Analyze', name: 'Epidemic Model', desc: 'SIR epidemic model showing how patterns spread through populations.', credits: 0, tier: 'compute' },
  'trend-detect': { cat: 'Analyze', name: 'Trend Detect', desc: 'Identify rising, falling, or stable trends in data series.', credits: 0, tier: 'compute' },
  'fog-of-war': { cat: 'Agent Superpowers', name: 'Fog of War', desc: 'Reveal information gradually based on proximity and exploration.', credits: 0, tier: 'compute' },
  'crop-rotation': { cat: 'Agent Superpowers', name: 'Crop Rotation', desc: 'Alternate task types to prevent burnout and maintain productivity.', credits: 0, tier: 'compute' },
  'dark-matter-infer': { cat: 'Analyze', name: 'Dark Matter Infer', desc: 'Detect invisible influences causing unexplained observable effects.', credits: 0, tier: 'compute' },
  'fault-line-map': { cat: 'Analyze', name: 'Fault Line Map', desc: 'Identify hidden stress points approaching rupture in systems.', credits: 0, tier: 'compute' },
  'deep-dive': { cat: 'Analyze', name: 'Deep Dive', desc: 'Systematically explore topics across five depth layers.', credits: 0, tier: 'compute' },
  'summit-organize': { cat: 'Agent Superpowers', name: 'Summit Organize', desc: 'Organize high-level meetings with agenda and quorum requirements.', credits: 0, tier: 'compute' },
  'isomorphism-detect': { cat: 'Analyze', name: 'Isomorphism Detect', desc: 'Find structural equivalences between problems enabling solution transfer.', credits: 0, tier: 'compute' },
  'flow-state-induce': { cat: 'Agent Superpowers', name: 'Flow State Induce', desc: 'Set conditions for optimal performance flow based on skill-challenge ratio.', credits: 0, tier: 'compute' },
  'metaphor-mine': { cat: 'Agent Superpowers', name: 'Metaphor Mine', desc: 'Extract the deepest most illuminating metaphor from any situation.', credits: 0, tier: 'compute' },
  'foundation-assess': { cat: 'Analyze', name: 'Foundation Assess', desc: 'Evaluate system foundations for stability and hidden cracks.', credits: 0, tier: 'compute' },
  'many-worlds': { cat: 'Agent Superpowers', name: 'Many Worlds', desc: 'Execute decisions in all variations simultaneously in separate branches.', credits: 0, tier: 'compute' },
  'self-referential-loop': { cat: 'Agent Superpowers', name: 'Self Referential Loop', desc: 'Create processes that operate on themselves with iteration tracking.', credits: 0, tier: 'compute' },
  'absence-detect': { cat: 'Analyze', name: 'Absence Detect', desc: 'Detect conspicuous absences — the dog that didnt bark.', credits: 0, tier: 'compute' },
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
