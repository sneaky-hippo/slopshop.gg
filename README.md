# Slopshop — The Infrastructure Layer for AI Agents

**Free persistent memory. 1,248 real compute APIs. One key. One credit balance.**

Replace Redis + Cron + Zapier + 10 other services with a single `npm install`.

[![npm version](https://img.shields.io/npm/v/slopshop?color=red&label=npm)](https://www.npmjs.com/package/slopshop)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tools](https://img.shields.io/badge/Tools-1248-brightgreen)](https://slopshop.gg)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)

---

## What is Slopshop?

Slopshop is the infrastructure layer your AI agents are missing. One API key gives you persistent memory (free forever), 1,248 real compute APIs, scheduling, webhooks, observability, and a compute exchange where you earn credits by sharing idle resources.

Every endpoint runs real computation against your input — no mocks, no canned responses. Proof ships in every response: `_engine: "real"`. Self-hostable with zero external dependencies for compute APIs. Works with Claude, GPT, Grok, Gemini, LangChain, CrewAI, and any agent framework that supports function calling or MCP.

**The wedge:** free persistent memory that no other platform offers, plus a compute exchange that lets agents earn back what they spend.

---

## Quickstart

```bash
npm install -g slopshop
export SLOPSHOP_KEY="sk-slop-demo-key-12345678"
slop call crypto-hash-sha256 --data "hello world"
```

Expected output:
```json
{
  "hash": "e3f1e9b5c2d4a6f8...",
  "algorithm": "sha256",
  "_engine": "real"
}
```

---

## API Catalog

1,248 APIs across 78 categories. Every one ships a real handler.

---

### 📝 Text Processing

*Extract, transform, analyze, and manipulate text. Every API actually processes your input.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `text-word-count` | Word Count | 1 | Count words, characters, sentences, and paragraphs in text. |
| `text-char-count` | Character Count | 1 | Count characters with and without spaces, by type. |
| `text-extract-emails` | Extract Emails | 1 | Extract all email addresses from text using pattern matching. |
| `text-extract-urls` | Extract URLs | 1 | Extract all URLs from text. |
| `text-extract-phones` | Extract Phones | 1 | Extract phone numbers from text. |
| `text-extract-numbers` | Extract Numbers | 1 | Extract all numeric values from text. |
| `text-extract-dates` | Extract Dates | 1 | Extract date-like strings from text. |
| `text-extract-mentions` | Extract @Mentions | 1 | Extract @mentions from text. |
| `text-extract-hashtags` | Extract #Hashtags | 1 | Extract #hashtags from text. |
| `text-regex-test` | Regex Test | 1 | Test a regex pattern against text. Returns all matches with positions. |
| `text-regex-replace` | Regex Replace | 1 | Find and replace using regex pattern. |
| `text-diff` | Text Diff | 3 | Line-by-line diff of two texts. Returns added, removed, unchanged. |
| `text-slugify` | Slugify | 1 | Convert text to URL-safe slug. |
| `text-truncate` | Smart Truncate | 1 | Truncate text at word boundary with ellipsis. |
| `text-language-detect` | Language Detect | 1 | Detect language of text using word frequency heuristics. |
| `text-profanity-check` | Profanity Check | 1 | Check text for profanity against word list. |
| `text-readability-score` | Readability Score | 1 | Flesch-Kincaid readability grade level and score. |
| `text-keyword-extract` | Keyword Extract | 3 | Extract top keywords by frequency, excluding stop words. |
| `text-sentence-split` | Sentence Split | 1 | Split text into individual sentences. |
| `text-deduplicate-lines` | Deduplicate Lines | 1 | Remove duplicate lines from text. |
| `text-sort-lines` | Sort Lines | 1 | Sort lines alphabetically or numerically. |
| `text-reverse` | Reverse Text | 1 | Reverse a string. |
| `text-case-convert` | Case Convert | 1 | Convert between camelCase, snake_case, UPPER, lower, Title Case, kebab-case. |
| `text-lorem-ipsum` | Lorem Ipsum | 1 | Generate placeholder text of specified length. |
| `text-count-frequency` | Frequency Analysis | 1 | Character and word frequency analysis. |
| `text-strip-html` | Strip HTML | 1 | Remove all HTML tags from text. |
| `text-escape-html` | Escape HTML | 1 | Escape HTML entities (&lt; &gt; &amp; etc). |
| `text-unescape-html` | Unescape HTML | 1 | Convert HTML entities back to characters. |
| `text-rot13` | ROT13 | 1 | ROT13 encode/decode text. |

---

### 🔄 Data Transform

*JSON, CSV, XML, YAML, Markdown conversions. Actually transforms your data.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `text-markdown-to-html` | Markdown to HTML | 1 | Convert Markdown to HTML. |
| `text-csv-to-json` | CSV to JSON | 3 | Parse CSV text into JSON array of objects. |
| `text-json-to-csv` | JSON to CSV | 3 | Convert JSON array to CSV text. |
| `text-xml-to-json` | XML to JSON | 3 | Parse XML to JSON object. |
| `text-yaml-to-json` | YAML to JSON | 3 | Parse YAML key:value pairs to JSON. |
| `text-json-validate` | JSON Validate | 1 | Validate JSON syntax, return errors if invalid. |
| `text-json-format` | JSON Format | 1 | Pretty-print or minify JSON. |
| `text-json-path` | JSON Path Query | 1 | Extract value at a dot-notation path from JSON. |
| `text-json-flatten` | JSON Flatten | 1 | Flatten nested JSON to dot-notation keys. |
| `text-json-unflatten` | JSON Unflatten | 1 | Unflatten dot-notation keys back to nested JSON. |
| `text-json-diff` | JSON Diff | 3 | Diff two JSON objects, return added/removed/changed keys. |
| `text-json-merge` | JSON Deep Merge | 1 | Deep merge two JSON objects. |
| `text-json-schema-generate` | JSON Schema Generate | 3 | Generate JSON Schema from example data. |
| `text-base64-encode` | Base64 Encode | 1 | Encode text to Base64. |
| `text-base64-decode` | Base64 Decode | 1 | Decode Base64 to text. |
| `text-url-encode` | URL Encode | 1 | URL-encode a string. |
| `text-url-decode` | URL Decode | 1 | URL-decode a string. |
| `text-url-parse` | URL Parse | 1 | Parse URL into protocol, host, port, path, query params, hash. |
| `text-hex-encode` | Hex Encode | 1 | Convert string to hexadecimal. |
| `text-hex-decode` | Hex Decode | 1 | Convert hexadecimal to string. |

---

### 🔐 Crypto & Security

*Hashing, encryption, JWT, passwords, random generation. Real cryptographic operations.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `crypto-hash-sha256` | SHA256 Hash | 1 | Compute SHA256 hash of input data. |
| `crypto-hash-sha512` | SHA512 Hash | 1 | Compute SHA512 hash of input data. |
| `crypto-hash-md5` | MD5 Hash | 1 | Compute MD5 hash of input data. |
| `crypto-hmac` | HMAC-SHA256 | 1 | Compute HMAC-SHA256 with secret key. |
| `crypto-uuid` | UUID v4 | 1 | Generate cryptographically random UUID v4. |
| `crypto-nanoid` | Nanoid | 1 | Generate compact unique ID (21 chars, URL-safe). |
| `crypto-password-generate` | Generate Password | 1 | Generate secure random password with configurable length and character sets. |
| `crypto-password-hash` | Hash Password | 1 | Hash password using PBKDF2 with random salt. |
| `crypto-password-verify` | Verify Password | 1 | Verify password against PBKDF2 hash. |
| `crypto-random-bytes` | Random Bytes | 1 | Generate cryptographic random bytes (hex output). |
| `crypto-random-int` | Random Integer | 1 | Generate random integer in a range. |
| `crypto-jwt-sign` | JWT Sign | 1 | Create and sign a JWT with HS256. |
| `crypto-jwt-verify` | JWT Verify | 1 | Verify JWT signature and check expiry. |
| `crypto-jwt-decode` | JWT Decode | 1 | Decode JWT payload without verification (unsafe inspect). |
| `crypto-otp-generate` | Generate OTP | 1 | Generate numeric one-time password. |
| `crypto-encrypt-aes` | AES Encrypt | 1 | AES-256-GCM encrypt data with key. |
| `crypto-decrypt-aes` | AES Decrypt | 1 | AES-256-GCM decrypt data with key. |
| `crypto-checksum` | Checksum | 1 | Compute MD5 + SHA256 checksums of content. |

---

### 🧮 Math & Numbers

*Statistics, conversions, financial calculations. Actual math on your data.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `math-evaluate` | Evaluate Expression | 1 | Safely evaluate a math expression (no eval). Supports +,-,*,/,^,%,parentheses. |
| `math-statistics` | Statistics | 3 | Compute mean, median, mode, stddev, min, max, sum, count from number array. |
| `math-percentile` | Percentile | 1 | Calculate percentile value from number array. |
| `math-histogram` | Histogram | 3 | Build histogram bins from number array. |
| `math-currency-convert` | Currency Convert | 1 | Convert between currencies using rates (static rates, updated periodically). |
| `math-unit-convert` | Unit Convert | 1 | Convert between units: length, weight, temperature, volume, speed, data. |
| `math-color-convert` | Color Convert | 1 | Convert between hex, RGB, and HSL color formats. |
| `math-number-format` | Number Format | 1 | Format numbers with locale, currency, percentage, scientific notation. |
| `math-compound-interest` | Compound Interest | 1 | Calculate compound interest with principal, rate, time, frequency. |
| `math-loan-payment` | Loan Payment | 1 | Calculate monthly loan payment, total interest, amortization. |
| `math-roi-calculate` | ROI Calculator | 1 | Calculate ROI, payback period from cost and revenue figures. |
| `math-percentage-change` | Percentage Change | 1 | Calculate percentage change between two values. |
| `math-fibonacci` | Fibonacci | 1 | Generate fibonacci sequence up to n terms. |
| `math-prime-check` | Prime Check | 1 | Check if a number is prime. Return true/false + nearest primes. |
| `math-gcd` | GCD | 1 | Greatest common divisor of two or more numbers. |
| `math-lcm` | LCM | 1 | Least common multiple of two or more numbers. |
| `math-base-convert` | Base Convert | 1 | Convert numbers between bases (binary, octal, decimal, hex). |

---

### 📅 Date & Time

*Parse, format, diff, and calculate dates. Real date arithmetic.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `date-parse` | Date Parse | 1 | Parse any date string to structured output (ISO, unix, components). |
| `date-format` | Date Format | 1 | Format date using pattern tokens (YYYY, MM, DD, HH, mm, ss). |
| `date-diff` | Date Diff | 1 | Difference between two dates in days, hours, minutes, seconds. |
| `date-add` | Date Add | 1 | Add days/hours/minutes to a date. |
| `date-weekday` | Weekday | 1 | Get day of week for a date. |
| `date-is-business-day` | Is Business Day | 1 | Check if date is a weekday (M-F). |
| `date-business-days-between` | Business Days Between | 1 | Count business days between two dates. |
| `date-cron-parse` | Cron Parse | 1 | Parse cron expression to human-readable description. |
| `date-cron-next` | Cron Next Runs | 3 | Calculate next N run times for a cron expression. |
| `date-unix-to-iso` | Unix to ISO | 1 | Convert unix timestamp to ISO 8601 string. |
| `date-iso-to-unix` | ISO to Unix | 1 | Convert ISO 8601 string to unix timestamp. |
| `date-relative` | Relative Time | 1 | Convert timestamp to "3 days ago" / "in 2 hours" format. |

---

### 💻 Code Utilities

*JSON to TypeScript, SQL formatting, semver, diff stats. Real code tools.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `code-json-to-typescript` | JSON to TypeScript | 3 | Generate TypeScript interface from JSON example. |
| `code-json-to-python-class` | JSON to Python Class | 3 | Generate Python dataclass from JSON example. |
| `code-json-to-go-struct` | JSON to Go Struct | 3 | Generate Go struct from JSON example. |
| `code-sql-format` | SQL Format | 1 | Format/indent SQL query with keyword capitalization. |
| `code-cron-explain` | Cron Explain | 1 | Explain cron expression in plain English. |
| `code-regex-explain` | Regex Explain | 3 | Explain regex pattern token by token in plain English. |
| `code-semver-compare` | Semver Compare | 1 | Compare two semantic version strings. |
| `code-semver-bump` | Semver Bump | 1 | Bump semver by patch, minor, or major. |
| `code-diff-stats` | Diff Stats | 3 | Parse unified diff, return files changed, additions, deletions. |
| `code-env-parse` | Parse .env | 1 | Parse .env file content to JSON object. |
| `code-jwt-inspect` | JWT Inspect | 1 | Decode and display JWT header and claims with expiry check. |

---

### ✨ Generate

*UUIDs, passwords, fake data, color palettes, short IDs. Real generation.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `gen-fake-name` | Fake Name | 1 | Generate realistic fake full name. |
| `gen-fake-email` | Fake Email | 1 | Generate fake email address. |
| `gen-fake-company` | Fake Company | 1 | Generate fake company name. |
| `gen-fake-address` | Fake Address | 1 | Generate fake US address. |
| `gen-fake-phone` | Fake Phone | 1 | Generate fake phone number. |
| `gen-fake-user` | Fake User Profile | 1 | Generate full fake user profile (name, email, company, address, phone). |
| `gen-fake-credit-card` | Fake Credit Card | 1 | Generate Luhn-valid fake CC number (NOT real, for testing only). |
| `gen-color-palette` | Color Palette | 1 | Generate harmonious color palette from base hex color. |
| `gen-short-id` | Short ID | 1 | Generate compact URL-safe unique ID. |

---

### 🌐 Network & DNS

*DNS lookups, HTTP checks, SSL inspection, email validation. Real network calls.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `net-dns-a` | DNS A Lookup | 5 | Resolve A records (IPv4) for a domain. |
| `net-dns-aaaa` | DNS AAAA Lookup | 5 | Resolve AAAA records (IPv6) for a domain. |
| `net-dns-mx` | DNS MX Lookup | 5 | Resolve MX records for a domain. |
| `net-dns-txt` | DNS TXT Lookup | 5 | Resolve TXT records for a domain. |
| `net-dns-ns` | DNS NS Lookup | 5 | Resolve nameserver records for a domain. |
| `net-dns-all` | DNS Full Lookup | 5 | All record types (A, AAAA, MX, TXT, NS) for a domain. |
| `net-http-status` | HTTP Status Check | 5 | HEAD request to URL, return status code, headers, timing. |
| `net-http-headers` | HTTP Headers | 5 | Fetch all response headers for a URL. |
| `net-http-redirect-chain` | Redirect Chain | 5 | Follow redirects and return full chain of URLs + status codes. |
| `net-ssl-check` | SSL Certificate Check | 5 | Inspect SSL certificate: issuer, expiry, days remaining, validity. |
| `net-email-validate` | Email Validate | 5 | Validate email format + check MX records exist for domain. |
| `net-ip-validate` | IP Validate | 1 | Validate IP address, detect version (v4/v6), check if private. |
| `net-cidr-contains` | CIDR Contains | 1 | Check if an IP falls within a CIDR range. |
| `net-url-parse` | URL Parse | 1 | Parse URL into structured components. |

---

### 🤖 AI: Content

*Blog posts, emails, ad copy, social posts. Powered by Claude/GPT. Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `llm-blog-outline` | Blog Outline | 10 | Generate SEO blog outline from topic + keywords. |
| `llm-blog-draft` | Blog Draft | 20 | Generate full blog post draft from topic or outline. |
| `llm-landing-page-copy` | Landing Page Copy | 10 | Generate headline, subheadline, bullets, CTA for landing page. |
| `llm-product-description` | Product Description | 5 | Generate product description from specs and features. |
| `llm-email-draft` | Email Draft | 5 | Draft email from context + intent. |
| `llm-email-reply` | Email Reply | 5 | Draft reply to an email thread. |
| `llm-cold-outreach` | Cold Outreach | 10 | Personalized cold outreach email from prospect info. |
| `llm-ad-copy` | Ad Copy | 5 | Generate ad copy variants (headline + description). |
| `llm-social-post` | Social Post | 5 | Generate social media post for any platform. |
| `llm-video-script` | Video Script | 20 | Generate video script with hook, body, CTA. |
| `llm-press-release` | Press Release | 20 | Generate press release from news/event info. |
| `llm-tagline` | Tagline Generator | 5 | Generate tagline options for brand/product. |

---

### 🧠 AI: Analysis

*Summarize, classify, extract, translate, sentiment. Real LLM analysis of your text.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `llm-summarize` | Summarize | 5 | Summarize any text. Configurable length and format. |
| `llm-summarize-thread` | Thread Summary | 10 | Summarize email/chat thread with decisions + action items. |
| `llm-sentiment` | Sentiment Analysis | 5 | Analyze sentiment with aspect-level detail and confidence. |
| `llm-classify` | Text Classify | 5 | Classify text into your provided categories. |
| `llm-extract-entities` | Entity Extraction | 5 | Extract people, orgs, dates, amounts, locations from text. |
| `llm-extract-action-items` | Action Items | 5 | Extract action items with owners and deadlines from text. |
| `llm-extract-key-points` | Key Points | 5 | Extract key points and takeaways from document. |
| `llm-tone-analyze` | Tone Analysis | 5 | Analyze writing tone (formal/casual/urgent/friendly/etc). |
| `llm-translate` | Translate | 10 | Translate text to any language, preserving tone. |
| `llm-rewrite` | Rewrite | 10 | Rewrite text in different tone, style, or reading level. |
| `llm-proofread` | Proofread | 5 | Check grammar and spelling, return corrections. |

---

### ⚙️ AI: Code

*Generate code, review, test, document, convert. LLM-powered dev tools.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `llm-explain-code` | Explain Code | 5 | Explain what code does in plain English. |
| `llm-explain-error` | Explain Error | 5 | Explain error message with fix suggestions. |
| `llm-explain-command` | Explain Command | 5 | Explain shell command in plain English. |
| `llm-explain-regex` | Explain Regex (AI) | 5 | Explain regex pattern with examples using AI. |
| `llm-explain-sql` | Explain SQL | 5 | Explain SQL query in plain English. |
| `llm-code-generate` | Code Generate | 20 | Generate code from natural language description. |
| `llm-code-review` | Code Review | 10 | Review code for bugs, security issues, performance. |
| `llm-code-refactor` | Refactor Suggest | 10 | Suggest refactoring for cleaner code. |
| `llm-code-test-generate` | Test Generate | 20 | Generate unit tests for code. |
| `llm-code-document` | Code Document | 10 | Generate documentation and docstrings. |
| `llm-code-convert` | Code Convert | 20 | Convert code between programming languages. |
| `llm-sql-generate` | SQL Generate | 10 | Generate SQL from natural language query. |
| `llm-regex-generate` | Regex Generate | 5 | Generate regex from natural language description. |
| `llm-commit-message` | Commit Message | 5 | Generate commit message from diff. |
| `llm-pr-description` | PR Description | 10 | Generate pull request description from diff/commits. |

---

### 💼 AI: Business

*Meeting prep, proposals, job descriptions, contract analysis. LLM-powered business tools.*

| Slug | Name | Credits | Description |
|------|------|---------|-------------|
| `llm-meeting-prep` | Meeting Prep | 10 | Generate meeting prep notes from attendees + topic. |
| `llm-decision-analyze` | Decision Analysis | 10 | Analyze pros/cons/risks of a business decision. |
| `llm-job-description` | Job Description | 10 | Generate job description from role requirements. |
| `llm-interview-questions` | Interview Questions | 10 | Generate interview questions for a specific role. |
| `llm-performance-review` | Performance Review | 20 | Draft performance review from notes/observations. |
| `llm-proposal-draft` | Proposal Draft | 20 | Draft business proposal from specs/requirements. |
| `llm-contract-summarize` | Contract Summary | 20 | Summarize contract key terms, obligations, and risks. |
| `llm-legal-clause-explain` | Legal Clause Explain | 5 | Explain legal clause in plain English. |
| `llm-support-reply` | Support Reply | 5 | Generate customer support reply from ticket context. |
| `llm-competitor-brief` | Competitor Brief | 10 | Generate competitor analysis brief from company info. |

---

## Pricing

Credits never expire. Buy once, use whenever.

| Tier | Credits | Price | Per 1k credits |
|------|---------|-------|----------------|
| Baby Lobster | 1,000 | $9 | $9.00 |
| Lobster | 10,000 | $49 | $4.90 |
| Big Lobster | 100,000 | $299 | $2.99 |
| Kraken | 1,000,000 | $1,999 | $1.99 |

**Credit costs at a glance:**

| Operation type | Credits |
|----------------|---------|
| Trivial compute (hashes, UUIDs, base64) | 1 |
| Simple compute (text analysis, validation) | 1 |
| Medium compute (CSV parse, diff, statistics) | 3 |
| Network calls (DNS, HTTP, SSL) | 5 |
| AI: Small LLM call (< 500 tokens out) | 5 |
| AI: Medium LLM call | 10 |
| AI: Large LLM call (blog posts, code gen) | 20 |

---

## CLI

Install globally and call any API from your terminal.

```bash
npm install -g slopshop
export SLOPSHOP_KEY="sk-slop-your-key-here"
```

### Commands

```bash
# Call any API with --key value parameters
slop call <api-slug> [--key value]...

# Chain APIs together, passing output to the next step
slop pipe <api1> <api2> ... [--key value]...

# Semantic search — describe what you need in plain English
slop search <query>

# List available APIs (optionally filter by category)
slop list [category]

# Check your credit balance
slop balance

# Buy credits (valid amounts: 1000, 10000, 100000, 1000000)
slop buy <amount>

# Server health check
slop health

# Show help
slop help
```

### Examples

```bash
# Hash some text
slop call crypto-hash-sha256 --data "hello world"

# Generate a UUID
slop call crypto-uuid

# Word count from stdin
echo "The quick brown fox" | slop call text-word-count

# Chain: base64 encode then hash
slop pipe text-base64-encode crypto-hash-sha256 --text "my secret"

# Check DNS records for a domain
slop call net-dns-all --domain "example.com"

# Generate an AI blog outline
slop call llm-blog-outline --topic "How AI agents use APIs" --keywords "automation, credits"

# Search for APIs by description
slop search "convert temperature units"

# List all crypto APIs
slop list "Crypto & Security"

# Check credit balance
slop balance

# Buy 10,000 credits
slop buy 10000
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLOPSHOP_KEY` | Yes | — | Your API key (`sk-slop-...`) |
| `SLOPSHOP_BASE` | No | `https://slopshop.gg` | Server base URL |

---

## SDK

### Node.js

```bash
npm install slopshop
```

```js
import { Slop } from 'slopshop';

const s = new Slop(); // reads SLOPSHOP_KEY from env
// or: new Slop('sk-slop-your-key', { baseUrl: 'https://slopshop.gg' })

// Call any API
const result = await s.call('crypto-hash-sha256', { data: 'hello world' });
console.log(result.data);           // { hash: '...', algorithm: 'sha256' }
console.log(result.creditsUsed);    // 1
console.log(result.creditsRemaining); // 9999

// Batch call multiple APIs in one request
const batch = await s.batch([
  { api: 'crypto-uuid', input: {} },
  { api: 'text-word-count', input: { text: 'hello world' } },
  { api: 'math-statistics', input: { numbers: [1, 2, 3, 4, 5] } },
]);

// Async fire-and-forget for LLM APIs
const job = await s.asyncCall('llm-blog-draft', { topic: 'AI agents and API automation' });
const status = await s.job(job.job_id); // poll for completion

// Semantic search — describe what you need
const match = await s.resolve('convert temperature from celsius to fahrenheit');
console.log(match.slug); // 'math-unit-convert'
```

### Python

```bash
pip install slopshop
```

```python
from slopshop import Slop

s = Slop()  # reads SLOPSHOP_KEY from env
# or: Slop(key='sk-slop-your-key', base_url='https://slopshop.gg')

# Call any API
result = s.call('crypto-hash-sha256', {'data': 'hello world'})
print(result.data)             # {'hash': '...', 'algorithm': 'sha256'}
print(result.credits_used)     # 1
print(result.credits_remaining) # 9999

# Access result fields directly
print(result['hash'])          # shorthand for result.data['hash']
print(result.get('hash'))      # safe get with optional default

# Batch call multiple APIs
batch = s.batch([
    {'api': 'crypto-uuid', 'input': {}},
    {'api': 'text-word-count', 'input': {'text': 'hello world'}},
    {'api': 'math-statistics', 'input': {'numbers': [1, 2, 3, 4, 5]}},
])

# Check balance
balance = s.balance()
print(balance['balance'])  # 9998
```

---

## MCP Integration

Slopshop ships an MCP (Model Context Protocol) server that exposes all 1,248 APIs as native tools inside Claude Code, Cursor, and any MCP-compatible client. Claude can call `slop-crypto-hash-sha256`, `slop-llm-summarize`, etc. as first-class tools.

### Add to Claude Code

Edit your Claude Code `settings.json` (usually `~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "slopshop": {
      "command": "node",
      "args": ["/path/to/slopshop/mcp-server.js"],
      "env": {
        "SLOPSHOP_KEY": "sk-slop-your-key-here",
        "SLOPSHOP_BASE": "https://slopshop.gg"
      }
    }
  }
}
```

Or if installed globally via npm:

```json
{
  "mcpServers": {
    "slopshop": {
      "command": "npx",
      "args": ["slopshop", "mcp"],
      "env": {
        "SLOPSHOP_KEY": "sk-slop-your-key-here"
      }
    }
  }
}
```

Once configured, every Slopshop API appears as a native tool. Claude can call `slop-crypto-hash-sha256`, `slop-llm-summarize`, `slop-net-dns-all`, etc. without any API wrapper code.

### Start the MCP server manually

```bash
SLOPSHOP_KEY=sk-slop-your-key node mcp-server.js
```

---

## Zapier

Slopshop integrates natively with Zapier. All 1,248 APIs are available as Zapier actions.

### Setup

1. Add your Slopshop API key to Zapier as a custom authentication credential.
2. Use the base URL `https://slopshop.gg` (or your self-hosted URL).
3. Zapier reads the app definition from `/zapier/app.json`.

### Call any API from a Zap

**Endpoint:** `POST /zapier/call/:slug`

Accepts flat key-value input (no nested JSON required — Zapier-friendly). Returns flat output suitable for mapping to downstream Zap steps.

```
POST /zapier/call/crypto-hash-sha256
Authorization: Bearer sk-slop-your-key
Content-Type: application/json

{
  "input": "hello from zapier"
}
```

Response:
```json
{
  "hash": "e3f1e9b5...",
  "algorithm": "sha256",
  "credits_used": 1,
  "credits_remaining": 9998,
  "api": "crypto-hash-sha256"
}
```

### Receive webhooks from Zapier

Use `/zapier/webhook` when you want Zapier to send data TO Slopshop for processing (e.g., "When new row in Google Sheet → process with Slopshop → update CRM"):

```
POST /zapier/webhook
Authorization: Bearer sk-slop-your-key
Content-Type: application/json

{
  "api": "llm-sentiment",
  "input": { "text": "This product is absolutely amazing!" }
}
```

Response:
```json
{
  "status": "processed",
  "api": "llm-sentiment",
  "result": { "sentiment": "positive", "confidence": 0.97 },
  "credits_used": 5,
  "balance": 9993
}
```

### Other Zapier endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/zapier/app.json` | GET | Full Zapier app definition |
| `/zapier/auth/test` | GET | Test authentication |
| `/zapier/actions` | GET | List all 1,248 actions |
| `/zapier/call/:slug` | POST | Call any API (Zapier-friendly flat I/O) |
| `/zapier/webhook` | POST | Receive and process webhook from Zapier |
| `/zapier/subscribe` | POST | Register webhook subscription |
| `/zapier/subscribe/:id` | DELETE | Unregister webhook subscription |

---

## Pipes

Pre-built multi-step workflows. Each pipe chains multiple APIs in sequence, passing outputs as inputs automatically.

**Endpoint:** `POST /v1/pipes/:slug`

| Slug | Name | Credits | Category | Steps | Description |
|------|------|---------|----------|-------|-------------|
| `lead-from-text` | Lead from Text | 7 | Sales | 3 | Extract emails from text, validate they exist, generate prospect profiles. |
| `content-machine` | Content Machine | 35 | Content | 3 | Generate blog outline, draft the post, score readability. |
| `security-audit` | Security Audit | 7 | Security | 3 | Checksum content, validate JSON, check SSL certificate. |
| `code-ship` | Code Ship | 35 | Dev | 3 | Review code, generate tests, get diff stats. |
| `data-clean` | Data Clean | 5 | Data | 3 | Parse CSV to JSON, deduplicate, validate output. |
| `email-intel` | Email Intelligence | 4 | Analysis | 4 | Extract emails, URLs, phone numbers, and word stats from text. |
| `hash-everything` | Hash Everything | 4 | Security | 4 | Compute MD5, SHA256, SHA512, and full checksum of input data. |
| `text-analyze` | Text Analyzer | 4 | Analysis | 4 | Word count, readability score, keyword extraction, language detection. |
| `json-pipeline` | JSON Pipeline | 5 | Data | 4 | Validate JSON, format it, generate schema, flatten to dot-notation. |
| `meeting-to-actions` | Meeting to Actions | 20 | Business | 3 | Summarize meeting notes, extract action items, draft follow-up email. |
| `code-explain` | Code Explainer | 30 | Dev | 3 | Explain code, document it, generate tests. |
| `crypto-toolkit` | Crypto Toolkit | 4 | Security | 4 | Generate UUID, password, OTP, and a random encryption key. |
| `domain-recon` | Domain Recon | 20 | Network | 4 | DNS lookup, SSL check, HTTP status, email validation for a domain. |
| `onboarding-pack` | Onboarding Pack | 3 | Dev | 3 | Generate fake test user, create a JWT for them, hash their password. |

### Example: run a pipe

```bash
# From CLI
slop call net-dns-a --domain "slopshop.gg"  # individual API

# Run a pre-built pipe
curl -X POST https://slopshop.gg/v1/pipes/domain-recon \
  -H "Authorization: Bearer sk-slop-your-key" \
  -H "Content-Type: application/json" \
  -d '{"domain": "slopshop.gg", "url": "https://slopshop.gg", "email": "dev@slopshop.gg"}'
```

### List all pipes

```
GET /v1/pipes
```

---

## Self-Hosting

Run your own Slopshop instance. Zero external dependencies for compute APIs. LLM APIs require `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.

```bash
git clone https://github.com/sneaky-hippo/slopshop.gg
cd slopshop
npm install
node server-v2.js
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port (default: `3000`) |
| `ANTHROPIC_API_KEY` | For AI APIs | Anthropic API key for Claude-powered endpoints |
| `OPENAI_API_KEY` | For AI APIs | OpenAI API key (fallback if Anthropic not set) |
| `SLOPSHOP_ADMIN_KEY` | No | Admin key for key management endpoints |

### With custom port

```bash
PORT=8080 ANTHROPIC_API_KEY=sk-ant-xxx node server-v2.js
```

### Health check

```bash
curl http://localhost:3000/v1/health
```

```json
{
  "status": "operational",
  "apis_loaded": 1248,
  "uptime_seconds": 42,
  "version": "2.0.0"
}
```

---

## API Reference

All endpoints are under `/v1/`. Authentication via `Authorization: Bearer <key>` header.

### Core

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/v1/health` | GET | No | Server health, API count, uptime, version |
| `/v1/tools` | GET | No | List all 1,248 APIs with metadata. Supports `?category=` and `?format=native` |
| `/v1/resolve` | POST | No | Semantic search: `{ "query": "hash a string" }` → best matching API slug |
| `/v1/:slug` | POST | Yes | Call any API by slug |
| `/v1/batch` | POST | Yes | Call multiple APIs in one request: `{ "calls": [{ "api": "slug", "input": {} }] }` |
| `/v1/pipe` | POST | Yes | Chain multiple APIs: `{ "steps": ["slug1", "slug2"], "input": {} }` |
| `/v1/async/:slug` | POST | Yes | Fire-and-forget async call for LLM APIs. Returns `{ job_id }` |
| `/v1/jobs/:id` | GET | Yes | Poll async job status |
| `/v1/state/:key` | GET/POST | Yes | Lightweight key-value state store |
| `/v1/credits/balance` | GET | Yes | Get current credit balance and tier |
| `/v1/credits/buy` | POST | Yes | Purchase credits: `{ "amount": 10000 }` |
| `/v1/uptime` | GET | No | Simple uptime ping |
| `/v1/pipes` | GET | No | List all pre-built pipes |
| `/v1/pipes/:slug` | GET | No | Get pipe details |
| `/v1/pipes/:slug` | POST | Yes | Execute a pre-built pipe |
| `/v1/keys` | POST | No | Create new API key |

### Request format

```bash
curl -X POST https://slopshop.gg/v1/crypto-hash-sha256 \
  -H "Authorization: Bearer sk-slop-your-key" \
  -H "Content-Type: application/json" \
  -d '{"data": "hello world"}'
```

### Response format

Every response includes metadata fields:

```json
{
  "data": {
    "hash": "e3f1e9b5...",
    "algorithm": "sha256",
    "_engine": "real"
  },
  "meta": {
    "api": "crypto-hash-sha256",
    "credits_used": 1,
    "credits_remaining": 9999,
    "latency_ms": 2,
    "request_id": "req_abc123",
    "status": "ok"
  }
}
```

### Error format

```json
{
  "error": {
    "code": "insufficient_credits",
    "message": "Need 5 credits, have 2",
    "status": 402
  }
}
```

**Error codes:**

| Code | HTTP | Description |
|------|------|-------------|
| `unauthorized` | 401 | Missing or invalid API key |
| `insufficient_credits` | 402 | Not enough credits |
| `not_found` | 404 | Unknown API slug |
| `validation_error` | 422 | Missing or invalid input fields |
| `llm_unavailable` | 503 | No LLM key configured on server |
| `internal_error` | 500 | Handler threw an exception |

---

## Architecture

```
server-v2.js          Express server, auth middleware, routing
  └── registry.js     Source of truth: all 1,248 API definitions
  └── handlers/
        compute.js    Pure compute: hashes, text, math, dates, codegen
        llm.js        LLM calls: Claude/GPT content, analysis, code, business
        network.js    Network: DNS, HTTP, SSL, email validation
  └── pipes.js        14 pre-built multi-step workflows
  └── zapier.js       Zapier-native endpoints and webhook handler
  └── mcp-server.js   MCP stdio server for Claude Code / Cursor
  └── cli.js          Terminal CLI (slop call, pipe, search, list, etc.)
  └── sdk/
        node/         Node.js SDK class
        python/       Python SDK class
```

**Request lifecycle:**

1. `server-v2.js` receives `POST /v1/:slug`
2. Auth middleware checks `Authorization: Bearer <key>` and deducts credits
3. Router looks up slug in `registry.js` → finds handler in `handlers/`
4. Handler runs real computation (no mocks, no random data)
5. Response always includes `_engine: "real"` in the data payload

---

## License

MIT — see [LICENSE](LICENSE).

---

*The infrastructure layer your AI agents are missing. [slopshop.gg](https://slopshop.gg)*
