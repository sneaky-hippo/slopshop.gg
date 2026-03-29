# SLOPSHOP QA DATABASE -- ALL 1255 ENDPOINTS
## Generated: 2026-03-29
## Source: https://slopshop.gg/v1/tools?limit=2000 + handler source analysis

Legend for GUTS column:
- **REAL** = Does genuine computation (regex, crypto, math, parsing, string ops)
- **REAL (external)** = Makes real HTTP/DNS/network calls
- **REAL (LLM)** = Calls external LLM API (Anthropic/OpenAI/etc)
- **REAL (SQLite)** = Backed by SQLite persistence
- **REAL (file)** = Backed by filesystem persistence
- **TEMPLATE** = Returns parameterized templates (no dynamic computation)
- **RANDOM (needs fix)** = Uses Math.random() as primary output driver
- **DETERMINISTIC-HASH** = Uses deterministic hash of input (pseudo-random but repeatable)
- **NEEDS_KEY** = Requires external API key to function

---

## CHUNK 1: Endpoints 1-400

| # | Slug | Category | Credits | GUTS | EXPECTED OUTPUT | LEGENDARY STATUS |
|---|------|----------|---------|------|-----------------|------------------|
| 1 | text-word-count | Text Processing | 1 | REAL | `{words, characters, charactersNoSpaces, sentences, paragraphs}` from regex splits | OK |
| 2 | text-char-count | Text Processing | 1 | REAL | `{withSpaces, withoutSpaces, letters, digits, spaces, special}` via regex counting | OK |
| 3 | text-extract-emails | Text Processing | 1 | REAL | `{emails[], count}` via RFC-style regex extraction, deduplicated | OK |
| 4 | text-extract-urls | Text Processing | 1 | REAL | `{urls[], count}` via https?:// regex extraction | OK |
| 5 | text-extract-phones | Text Processing | 1 | REAL | `{phones[], count}` via US phone pattern regex | OK |
| 6 | text-extract-numbers | Text Processing | 1 | REAL | `{numbers[], raw[], count}` via numeric regex | OK |
| 7 | text-extract-dates | Text Processing | 1 | REAL | `{dates[], count}` via multiple date pattern regexes | OK |
| 8 | text-extract-mentions | Text Processing | 1 | REAL | `{mentions[], count}` via @mention regex | OK |
| 9 | text-extract-hashtags | Text Processing | 1 | REAL | `{hashtags[], count}` via #hashtag regex | OK |
| 10 | text-regex-test | Text Processing | 1 | REAL | `{matched, matches[], count}` via user-supplied regex with exec loop | OK |
| 11 | text-regex-replace | Text Processing | 1 | REAL | `{result, original, changed}` via RegExp.replace | OK |
| 12 | text-diff | Text Processing | 3 | REAL | `{diff[], stats:{additions, deletions, unchanged}}` line-by-line comparison | OK |
| 13 | text-slugify | Text Processing | 1 | REAL | `{slug}` via NFD normalize + regex cleanup | OK |
| 14 | text-truncate | Text Processing | 1 | REAL | `{result, truncated, originalLength}` smart word-boundary truncation | OK |
| 15 | text-language-detect | Text Processing | 1 | REAL | `{detected, confidence, scores}` via word frequency heuristics (5 languages) | OK |
| 16 | text-profanity-check | Text Processing | 1 | REAL | `{clean, found[], count}` via word-boundary regex against profanity list | OK |
| 17 | text-readability-score | Text Processing | 1 | REAL | `{fleschReadingEase, fleschKincaidGrade, level, avgWordsPerSentence}` real Flesch-Kincaid | OK |
| 18 | text-keyword-extract | Text Processing | 3 | REAL | `{keywords[{word,count}]}` via stopword-filtered frequency count | OK |
| 19 | text-sentence-split | Text Processing | 1 | REAL | `{sentences[], count}` via sentence-end regex | OK |
| 20 | text-deduplicate-lines | Text Processing | 1 | REAL | `{result, original, unique, duplicatesRemoved}` via Set | OK |
| 21 | text-sort-lines | Text Processing | 1 | REAL | `{result, lineCount}` alpha or numeric sort | OK |
| 22 | text-reverse | Text Processing | 1 | REAL | `{result, original}` character reversal | OK |
| 23 | text-case-convert | Text Processing | 1 | REAL | `{result, from, to}` supports lower/upper/title/camel/pascal/snake/kebab/constant | OK |
| 24 | text-lorem-ipsum | Text Processing | 1 | RANDOM (needs fix) | `{text, paragraphs, sentences}` uses Math.random() for word selection | Uses Math.random() for lorem generation -- cosmetic, low priority |
| 25 | text-count-frequency | Text Processing | 1 | REAL | `{frequency{}, topTen[]}` word or char frequency map | OK |
| 26 | text-strip-html | Text Processing | 1 | REAL | `{result, original}` regex HTML tag removal | OK |
| 27 | text-escape-html | Text Processing | 1 | REAL | `{result}` entity encoding &<>"' | OK |
| 28 | text-unescape-html | Text Processing | 1 | REAL | `{result}` entity decoding | OK |
| 29 | text-rot13 | Text Processing | 1 | REAL | `{result}` ROT13 cipher via char code math | OK |
| 30 | text-markdown-to-html | Data Transform | 1 | REAL | `{html}` regex-based markdown to HTML conversion | OK |
| 31 | text-csv-to-json | Data Transform | 3 | REAL | `{data[], headers[], rows}` CSV parser with quote handling | OK |
| 32 | text-json-to-csv | Data Transform | 3 | REAL | `{csv, headers[], rows}` JSON array to CSV with escaping | OK |
| 33 | text-xml-to-json | Data Transform | 3 | REAL | `{data}` recursive regex XML parser | OK |
| 34 | text-yaml-to-json | Data Transform | 3 | REAL | `{data}` line-by-line YAML parser with type coercion | OK |
| 35 | text-json-validate | Data Transform | 1 | REAL | `{valid, type, size}` or `{valid:false, error}` via JSON.parse | OK |
| 36 | text-json-format | Data Transform | 1 | REAL | `{result, valid}` pretty-print or minify JSON | OK |
| 37 | text-json-path | Data Transform | 1 | REAL | `{value, found}` dot-notation JSON path traversal | OK |
| 38 | text-json-flatten | Data Transform | 1 | REAL | `{result}` recursive object flattening with dot notation | OK |
| 39 | text-json-unflatten | Data Transform | 1 | REAL | `{result}` dot-notation keys back to nested object | OK |
| 40 | text-json-diff | Data Transform | 3 | REAL | `{diffs[], same, changeCount}` recursive object diff | OK |
| 41 | text-json-merge | Data Transform | 1 | REAL | `{result}` deep merge of two objects | OK |
| 42 | text-json-schema-generate | Data Transform | 3 | REAL | `{schema}` JSON Schema from sample data, recursive | OK |
| 43 | text-base64-encode | Data Transform | 1 | REAL | `{result}` Buffer.from().toString('base64') | OK |
| 44 | text-base64-decode | Data Transform | 1 | REAL | `{result}` Buffer.from(,'base64').toString() | OK |
| 45 | text-url-encode | Data Transform | 1 | REAL | `{result}` encodeURIComponent | OK |
| 46 | text-url-decode | Data Transform | 1 | REAL | `{result}` decodeURIComponent | OK |
| 47 | text-url-parse | Data Transform | 1 | REAL | `{protocol, host, hostname, port, pathname, search, hash, origin, query}` via URL API | OK |
| 48 | text-hex-encode | Data Transform | 1 | REAL | `{result}` Buffer hex encoding | OK |
| 49 | text-hex-decode | Data Transform | 1 | REAL | `{result}` Buffer hex decoding | OK |
| 50 | crypto-hash-sha256 | Crypto & Security | 1 | REAL | `{hash, algorithm:'sha256'}` via crypto.createHash | OK |
| 51 | crypto-hash-sha512 | Crypto & Security | 1 | REAL | `{hash, algorithm:'sha512'}` via crypto.createHash | OK |
| 52 | crypto-hash-md5 | Crypto & Security | 1 | REAL | `{hash, algorithm:'md5'}` via crypto.createHash | OK |
| 53 | crypto-hmac | Crypto & Security | 1 | REAL | `{hmac, algorithm:'hmac-sha256'}` via crypto.createHmac | OK |
| 54 | crypto-uuid | Crypto & Security | 1 | REAL | `{uuid}` via crypto.randomUUID() | OK |
| 55 | crypto-nanoid | Crypto & Security | 1 | REAL | `{id, size}` via crypto.randomBytes + alphanumeric mapping | OK |
| 56 | crypto-password-generate | Crypto & Security | 1 | REAL | `{password, length, entropy}` via crypto.randomBytes | OK |
| 57 | crypto-password-hash | Crypto & Security | 1 | REAL | `{hash, salt, iterations, algorithm:'pbkdf2-sha512'}` via crypto.pbkdf2Sync | OK |
| 58 | crypto-password-verify | Crypto & Security | 1 | REAL | `{valid}` PBKDF2 comparison | OK |
| 59 | crypto-random-bytes | Crypto & Security | 1 | REAL | `{hex, base64, bytes}` via crypto.randomBytes | OK |
| 60 | crypto-random-int | Crypto & Security | 1 | REAL | `{result}` via crypto.randomBytes modular arithmetic | OK |
| 61 | crypto-jwt-sign | Crypto & Security | 1 | REAL | `{token, expiresAt}` HS256 JWT via HMAC-SHA256 | OK |
| 62 | crypto-jwt-verify | Crypto & Security | 1 | REAL | `{valid, payload}` or `{valid:false, error}` signature + expiry check | OK |
| 63 | crypto-jwt-decode | Crypto & Security | 1 | REAL | `{header, payload, isExpired}` base64 decode without verification | OK |
| 64 | crypto-otp-generate | Crypto & Security | 1 | REAL | `{otp, digits}` via crypto.randomBytes | OK |
| 65 | crypto-encrypt-aes | Crypto & Security | 1 | REAL | `{encrypted, iv, tag, algorithm:'aes-256-gcm'}` real AES-GCM encryption | OK |
| 66 | crypto-decrypt-aes | Crypto & Security | 1 | REAL | `{decrypted}` AES-GCM decryption | OK |
| 67 | crypto-checksum | Crypto & Security | 1 | REAL | `{checksum, algorithm}` configurable hash checksum | OK |
| 68 | math-evaluate | Math & Numbers | 1 | REAL | `{result}` safe math expression evaluator | OK |
| 69 | math-statistics | Math & Numbers | 3 | REAL | `{mean, median, mode, stddev, min, max, range, count, sum}` full stats | OK |
| 70 | math-percentile | Math & Numbers | 0 | REAL | `{percentile, value}` from sorted data | OK |
| 71 | math-histogram | Math & Numbers | 3 | REAL | `{bins[], min, max, binWidth}` auto-binned histogram | OK |
| 72 | math-currency-convert | Math & Numbers | 1 | REAL | `{result, rate, from, to}` static rate table conversion | OK -- static rates, not live |
| 73 | math-unit-convert | Math & Numbers | 1 | REAL | `{result, from, to}` conversion factor table | OK |
| 74 | math-color-convert | Math & Numbers | 1 | REAL | `{result}` hex/rgb/hsl color space conversion | OK |
| 75 | math-number-format | Math & Numbers | 1 | REAL | `{result}` locale-aware number formatting | OK |
| 76 | math-compound-interest | Math & Numbers | 1 | REAL | `{principal, total, interest}` compound interest formula | OK |
| 77 | math-loan-payment | Math & Numbers | 1 | REAL | `{monthlyPayment, totalPayment, totalInterest}` amortization formula | OK |
| 78 | math-roi-calculate | Math & Numbers | 1 | REAL | `{roi, profit}` return on investment calculation | OK |
| 79 | math-percentage-change | Math & Numbers | 1 | REAL | `{change, percentage}` (new-old)/old*100 | OK |
| 80 | math-fibonacci | Math & Numbers | 1 | REAL | `{sequence[], nth}` iterative Fibonacci | OK |
| 81 | math-prime-check | Math & Numbers | 1 | REAL | `{isPrime, number}` trial division | OK |
| 82 | math-gcd | Math & Numbers | 1 | REAL | `{gcd}` Euclidean algorithm | OK |
| 83 | math-lcm | Math & Numbers | 1 | REAL | `{lcm}` via GCD | OK |
| 84 | math-base-convert | Math & Numbers | 1 | REAL | `{result, from, to}` parseInt + toString(radix) | OK |
| 85 | stats-mean | Math & Numbers | 1 | REAL | `{mean}` arithmetic mean | OK |
| 86 | stats-median | Math & Numbers | 1 | REAL | `{median}` sorted middle value | OK |
| 87 | stats-stddev | Math & Numbers | 1 | REAL | `{stddev, variance}` population std deviation | OK |
| 88 | stats-percentile | Math & Numbers | 1 | REAL | `{value, percentile}` interpolated percentile | OK |
| 89 | stats-correlation | Math & Numbers | 1 | REAL | `{r, r_squared}` Pearson correlation coefficient | OK |
| 90 | stats-histogram | Math & Numbers | 1 | REAL | `{bins[]}` frequency distribution | OK |
| 91 | stats-summary | Math & Numbers | 1 | REAL | `{min, max, mean, median, stddev, count, sum, q1, q3}` five-number summary | OK |
| 92 | date-parse | Date & Time | 1 | REAL | `{iso, unix, parts{year,month,day,...}}` Date parsing | OK |
| 93 | date-format | Date & Time | 1 | REAL | `{formatted}` custom date format string | OK |
| 94 | date-diff | Date & Time | 1 | REAL | `{days, hours, minutes, seconds, milliseconds}` date difference | OK |
| 95 | date-add | Date & Time | 1 | REAL | `{result}` add duration to date | OK |
| 96 | date-weekday | Date & Time | 1 | REAL | `{weekday, dayNumber}` day of week | OK |
| 97 | date-is-business-day | Date & Time | 1 | REAL | `{isBusinessDay}` weekday check | OK |
| 98 | date-business-days-between | Date & Time | 1 | REAL | `{businessDays}` excluding weekends | OK |
| 99 | date-cron-parse | Date & Time | 1 | REAL | `{parsed}` cron expression field breakdown | OK |
| 100 | date-cron-next | Date & Time | 3 | REAL | `{next[]}` next N cron execution times | OK |
| 101 | date-unix-to-iso | Date & Time | 1 | REAL | `{iso}` Unix timestamp to ISO string | OK |
| 102 | date-iso-to-unix | Date & Time | 1 | REAL | `{unix}` ISO string to Unix timestamp | OK |
| 103 | date-relative | Date & Time | 1 | REAL | `{relative}` human-readable relative time ("3 hours ago") | OK |
| 104 | code-json-to-typescript | Code Utilities | 3 | REAL | `{typescript}` generates TS interface from JSON sample | OK |
| 105 | code-json-to-python-class | Code Utilities | 3 | REAL | `{python}` generates Python dataclass from JSON | OK |
| 106 | code-json-to-go-struct | Code Utilities | 3 | REAL | `{go}` generates Go struct from JSON | OK |
| 107 | code-sql-format | Code Utilities | 1 | REAL | `{formatted}` SQL keyword uppercasing + indentation | OK |
| 108 | code-cron-explain | Code Utilities | 1 | REAL | `{explanation}` human-readable cron description | OK |
| 109 | code-regex-explain | Code Utilities | 3 | REAL | `{explanation}` regex pattern breakdown | OK |
| 110 | code-semver-compare | Code Utilities | 1 | REAL | `{result, a, b}` semver comparison (-1/0/1) | OK |
| 111 | code-semver-bump | Code Utilities | 1 | REAL | `{bumped, type}` major/minor/patch version bump | OK |
| 112 | code-diff-stats | Code Utilities | 3 | REAL | `{additions, deletions, files}` unified diff stats | OK |
| 113 | code-env-parse | Code Utilities | 1 | REAL | `{vars{}}` .env file key=value parser | OK |
| 114 | code-jwt-inspect | Code Utilities | 1 | REAL | `{header, payload, isExpired}` JWT decode | OK |
| 115 | code-openapi-validate | Code Utilities | 3 | REAL | `{valid, errors[]}` OpenAPI structure validation | OK |
| 116 | code-dockerfile-lint | Code Utilities | 3 | REAL | `{issues[]}` Dockerfile best-practice checks | OK |
| 117 | code-gitignore-generate | Code Utilities | 1 | REAL | `{gitignore}` language-specific .gitignore | OK |
| 118 | text-cron-to-english | Code Utilities | 1 | REAL | `{english}` cron expression to human text | OK |
| 119 | text-html-to-text | Text Processing | 1 | REAL | `{text}` HTML tag stripping + entity decode | OK |
| 120 | text-table-format | Text Processing | 1 | REAL | `{table}` ASCII table from data array | OK |
| 121 | text-tree-format | Text Processing | 1 | REAL | `{tree}` ASCII tree from nested object | OK |
| 122 | text-diff-unified | Text Processing | 3 | REAL | `{unified}` unified diff format output | OK |
| 123 | math-mortgage-amortize | Math & Numbers | 3 | REAL | `{schedule[], monthlyPayment, totalInterest}` full amortization table | OK |
| 124 | math-tax-estimate | Math & Numbers | 3 | REAL | `{tax, effectiveRate, brackets[]}` progressive tax calculation | OK |
| 125 | math-matrix-multiply | Math & Numbers | 0 | REAL | `{result[][]}` matrix multiplication | OK |
| 126 | date-holidays | Date & Time | 1 | REAL | `{holidays[]}` static US/UK holiday list for year | OK |
| 127 | gen-avatar-svg | Generate | 1 | REAL | `{svg}` deterministic SVG avatar from input hash | OK |
| 128 | gen-qr-svg | Generate | 3 | REAL | `{svg}` QR code SVG generation | OK |
| 129 | crypto-totp-generate | Crypto & Security | 1 | REAL | `{totp, period}` time-based OTP via HMAC | OK |
| 130 | gen-fake-name | Generate | 1 | RANDOM (needs fix) | `{name, firstName, lastName}` random name from list | Math.random() for selection |
| 131 | gen-fake-email | Generate | 1 | RANDOM (needs fix) | `{email}` random email address | Math.random() for selection |
| 132 | gen-fake-company | Generate | 1 | RANDOM (needs fix) | `{company}` random company name | Math.random() for selection |
| 133 | gen-fake-address | Generate | 1 | RANDOM (needs fix) | `{address}` random address | Math.random() for selection |
| 134 | gen-fake-phone | Generate | 1 | RANDOM (needs fix) | `{phone}` random phone number | Math.random() for selection |
| 135 | gen-color-palette | Generate | 1 | REAL | `{colors[]}` HSL-based palette generation | OK |
| 136 | gen-short-id | Generate | 1 | REAL | `{id}` crypto.randomBytes short ID | OK |
| 137 | net-dns-a | Network & DNS | 5 | REAL (external) | `{records[]}` real DNS A record lookup via dns.resolve4 | OK |
| 138 | net-dns-aaaa | Network & DNS | 5 | REAL (external) | `{records[]}` real DNS AAAA lookup via dns.resolve6 | OK |
| 139 | net-dns-mx | Network & DNS | 5 | REAL (external) | `{records[]}` real DNS MX lookup via dns.resolveMx | OK |
| 140 | net-dns-txt | Network & DNS | 5 | REAL (external) | `{records[]}` real DNS TXT lookup via dns.resolveTxt | OK |
| 141 | net-dns-ns | Network & DNS | 5 | REAL (external) | `{records[]}` real DNS NS lookup via dns.resolveNs | OK |
| 142 | net-dns-all | Network & DNS | 5 | REAL (external) | `{a[], aaaa[], mx[], txt[], ns[]}` all DNS record types | OK |
| 143 | net-http-status | Network & DNS | 5 | REAL (external) | `{statusCode, timing}` real HTTP HEAD request | OK |
| 144 | net-http-headers | Network & DNS | 5 | REAL (external) | `{headers{}}` real HTTP HEAD request | OK |
| 145 | net-http-redirect-chain | Network & DNS | 5 | REAL (external) | `{chain[{url,statusCode}]}` follows redirects | OK |
| 146 | net-ssl-check | Network & DNS | 5 | REAL (external) | `{valid, issuer, expiry}` TLS connection check | OK |
| 147 | net-email-validate | Network & DNS | 5 | REAL (external) | `{valid, mx}` DNS MX lookup for email domain | OK |
| 148 | net-ip-validate | Network & DNS | 1 | REAL | `{valid, version}` IPv4/IPv6 regex validation | OK |
| 149 | net-cidr-contains | Network & DNS | 1 | REAL | `{contains}` CIDR range IP containment check | OK |
| 150 | net-url-parse | Network & DNS | 1 | REAL | `{protocol, hostname, pathname, ...}` URL API parse | OK |
| 151 | llm-blog-outline | AI: Content | 10 | REAL (LLM) | `{outline}` blog post outline via Anthropic/OpenAI | Requires API key |
| 152 | llm-blog-draft | AI: Content | 20 | REAL (LLM) | `{draft}` full blog post via LLM | Requires API key |
| 153 | llm-landing-page-copy | AI: Content | 10 | REAL (LLM) | `{copy}` landing page copy via LLM | Requires API key |
| 154 | llm-product-description | AI: Content | 10 | REAL (LLM) | `{description}` product description via LLM | Requires API key |
| 155 | llm-email-draft | AI: Content | 10 | REAL (LLM) | `{email}` email draft via LLM | Requires API key |
| 156 | llm-email-reply | AI: Content | 10 | REAL (LLM) | `{reply}` email reply via LLM | Requires API key |
| 157 | llm-cold-outreach | AI: Content | 10 | REAL (LLM) | `{email}` cold outreach draft via LLM | Requires API key |
| 158 | llm-ad-copy | AI: Content | 10 | REAL (LLM) | `{copy}` ad copy via LLM | Requires API key |
| 159 | llm-social-post | AI: Content | 10 | REAL (LLM) | `{post}` social media post via LLM | Requires API key |
| 160 | llm-video-script | AI: Content | 20 | REAL (LLM) | `{script}` video script via LLM | Requires API key |
| 161 | llm-press-release | AI: Content | 20 | REAL (LLM) | `{release}` press release via LLM | Requires API key |
| 162 | llm-tagline | AI: Content | 10 | REAL (LLM) | `{tagline}` tagline generation via LLM | Requires API key |
| 163 | llm-summarize | AI: Analysis | 10 | REAL (LLM) | `{summary}` text summarization via LLM | Requires API key |
| 164 | llm-think | AI: Analysis | 10 | REAL (LLM) | `{thoughts}` reasoning/thinking via LLM | Requires API key |
| 165 | llm-council | AI: Analysis | 10 | REAL (LLM) | `{perspectives[]}` multi-perspective analysis via LLM | Requires API key |
| 166 | context-session | Agent Tools | 0 | REAL | `{session_id, created}` session context tracking | OK |
| 167 | introspect | Agent Tools | 0 | REAL | `{api_count, categories, capabilities}` platform self-description | OK |
| 168 | route | Agent Tools | 0 | REAL | `{suggested_api, confidence}` intent-to-API routing | OK |
| 169 | state-set | Agent Tools | 0 | REAL (SQLite) | `{key, value, stored}` key-value state storage | OK |
| 170 | state-get | Agent Tools | 0 | REAL (SQLite) | `{key, value, found}` key-value state retrieval | OK |
| 171 | state-list | Agent Tools | 0 | REAL (SQLite) | `{keys[]}` list all state keys | OK |
| 172 | llm-summarize-thread | AI: Analysis | 10 | REAL (LLM) | `{summary}` thread summarization via LLM | Requires API key |
| 173 | llm-sentiment | AI: Analysis | 10 | REAL (LLM) | `{sentiment, confidence}` sentiment analysis via LLM | Requires API key |
| 174 | llm-classify | AI: Analysis | 10 | REAL (LLM) | `{category, confidence}` text classification via LLM | Requires API key |
| 175 | llm-extract-entities | AI: Analysis | 10 | REAL (LLM) | `{entities[]}` NER extraction via LLM | Requires API key |
| 176 | llm-extract-action-items | AI: Analysis | 10 | REAL (LLM) | `{action_items[]}` action item extraction via LLM | Requires API key |
| 177 | llm-extract-key-points | AI: Analysis | 10 | REAL (LLM) | `{key_points[]}` key point extraction via LLM | Requires API key |
| 178 | llm-tone-analyze | AI: Analysis | 10 | REAL (LLM) | `{tone, confidence}` tone analysis via LLM | Requires API key |
| 179 | llm-translate | AI: Analysis | 10 | REAL (LLM) | `{translation}` text translation via LLM | Requires API key |
| 180 | llm-rewrite | AI: Analysis | 10 | REAL (LLM) | `{rewritten}` text rewriting via LLM | Requires API key |
| 181 | llm-proofread | AI: Analysis | 10 | REAL (LLM) | `{corrections[]}` proofreading via LLM | Requires API key |
| 182 | llm-explain-code | AI: Code | 10 | REAL (LLM) | `{explanation}` code explanation via LLM | Requires API key |
| 183 | llm-explain-error | AI: Code | 10 | REAL (LLM) | `{explanation}` error explanation via LLM | Requires API key |
| 184 | llm-explain-command | AI: Code | 10 | REAL (LLM) | `{explanation}` CLI command explanation via LLM | Requires API key |
| 185 | llm-explain-regex | AI: Code | 10 | REAL (LLM) | `{explanation}` regex explanation via LLM | Requires API key |
| 186 | llm-explain-sql | AI: Code | 10 | REAL (LLM) | `{explanation}` SQL query explanation via LLM | Requires API key |
| 187 | llm-code-generate | AI: Code | 20 | REAL (LLM) | `{code}` code generation via LLM | Requires API key |
| 188 | llm-code-review | AI: Code | 10 | REAL (LLM) | `{review}` code review via LLM | Requires API key |
| 189 | llm-code-refactor | AI: Code | 10 | REAL (LLM) | `{refactored}` code refactoring via LLM | Requires API key |
| 190 | llm-code-test-generate | AI: Code | 20 | REAL (LLM) | `{tests}` test generation via LLM | Requires API key |
| 191 | llm-code-document | AI: Code | 10 | REAL (LLM) | `{documentation}` code documentation via LLM | Requires API key |
| 192 | llm-code-convert | AI: Code | 20 | REAL (LLM) | `{converted}` language conversion via LLM | Requires API key |
| 193 | llm-sql-generate | AI: Code | 10 | REAL (LLM) | `{sql}` SQL generation via LLM | Requires API key |
| 194 | llm-regex-generate | AI: Code | 10 | REAL (LLM) | `{regex}` regex generation via LLM | Requires API key |
| 195 | llm-commit-message | AI: Code | 10 | REAL (LLM) | `{message}` commit message via LLM | Requires API key |
| 196 | llm-pr-description | AI: Code | 10 | REAL (LLM) | `{description}` PR description via LLM | Requires API key |
| 197 | llm-meeting-prep | AI: Business | 10 | REAL (LLM) | `{prep}` meeting prep doc via LLM | Requires API key |
| 198 | llm-decision-analyze | AI: Business | 10 | REAL (LLM) | `{analysis}` decision analysis via LLM | Requires API key |
| 199 | llm-job-description | AI: Business | 10 | REAL (LLM) | `{jd}` job description via LLM | Requires API key |
| 200 | llm-interview-questions | AI: Business | 10 | REAL (LLM) | `{questions[]}` interview Q generation via LLM | Requires API key |
| 201 | llm-performance-review | AI: Business | 20 | REAL (LLM) | `{review}` performance review via LLM | Requires API key |
| 202 | llm-proposal-draft | AI: Business | 20 | REAL (LLM) | `{proposal}` business proposal via LLM | Requires API key |
| 203 | llm-contract-summarize | AI: Business | 20 | REAL (LLM) | `{summary}` contract summary via LLM | Requires API key |
| 204 | llm-legal-clause-explain | AI: Business | 10 | REAL (LLM) | `{explanation}` legal clause explanation via LLM | Requires API key |
| 205 | llm-support-reply | AI: Business | 10 | REAL (LLM) | `{reply}` support response via LLM | Requires API key |
| 206 | llm-competitor-brief | AI: Business | 10 | REAL (LLM) | `{brief}` competitor analysis via LLM | Requires API key |
| 207 | text-token-count | Text Processing | 1 | REAL | `{tokens, characters, words}` token count estimation (~4 chars/token) | OK |
| 208 | text-chunk | Text Processing | 3 | REAL | `{chunks[], count}` text chunking with overlap | OK |
| 209 | text-template | Text Processing | 1 | REAL | `{rendered}` Mustache/Handlebars-style template rendering | OK |
| 210 | text-sanitize | Text Processing | 1 | REAL | `{result}` XSS-safe HTML sanitization | OK |
| 211 | text-markdown-toc | Text Processing | 1 | REAL | `{toc}` table of contents from markdown headers | OK |
| 212 | text-indent | Text Processing | 1 | REAL | `{result}` add/remove indentation | OK |
| 213 | text-wrap | Text Processing | 1 | REAL | `{result}` word-wrap at column width | OK |
| 214 | text-detect-encoding | Text Processing | 1 | REAL | `{encoding}` heuristic encoding detection | OK |
| 215 | text-markdown-lint | Text Processing | 1 | REAL | `{issues[]}` markdown style checks | OK |
| 216 | code-json-to-zod | Code Utilities | 3 | REAL | `{zod}` Zod schema from JSON sample | OK |
| 217 | code-css-minify | Code Utilities | 1 | REAL | `{result}` CSS whitespace/comment removal | OK |
| 218 | code-js-minify | Code Utilities | 1 | REAL | `{result}` JS whitespace/comment removal | OK |
| 219 | code-html-minify | Code Utilities | 1 | REAL | `{result}` HTML minification | OK |
| 220 | code-package-json-generate | Code Utilities | 3 | REAL | `{packageJson}` package.json template generator | OK |
| 221 | math-moving-average | Math & Numbers | 0 | REAL | `{result[]}` SMA/EMA calculation | OK |
| 222 | math-linear-regression | Math & Numbers | 0 | REAL | `{slope, intercept, r_squared}` least-squares regression | OK |
| 223 | math-expression-to-latex | Math & Numbers | 3 | REAL | `{latex}` math expression to LaTeX conversion | OK |
| 224 | gen-cron-expression | Generate | 3 | REAL | `{cron}` cron expression from description | OK |
| 225 | gen-lorem-code | Generate | 3 | REAL | `{code}` lorem-ipsum style code generation | OK |
| 226 | crypto-hash-compare | Crypto & Security | 1 | REAL | `{match}` timing-safe hash comparison | OK |
| 227 | llm-data-extract | AI: Analysis | 10 | REAL (LLM) | `{data}` structured data extraction via LLM | Requires API key |
| 228 | llm-email-subject | AI: Content | 10 | REAL (LLM) | `{subject}` email subject line via LLM | Requires API key |
| 229 | llm-seo-meta | AI: Content | 10 | REAL (LLM) | `{title, description, keywords}` SEO meta via LLM | Requires API key |
| 230 | llm-changelog | AI: Code | 10 | REAL (LLM) | `{changelog}` changelog entry via LLM | Requires API key |
| 231 | llm-api-doc | AI: Code | 10 | REAL (LLM) | `{documentation}` API documentation via LLM | Requires API key |
| 232 | llm-bug-report | AI: Code | 10 | REAL (LLM) | `{report}` bug report template via LLM | Requires API key |
| 233 | llm-user-story | AI: Business | 10 | REAL (LLM) | `{story}` user story via LLM | Requires API key |
| 234 | llm-okr-generate | AI: Business | 10 | REAL (LLM) | `{okrs}` OKR generation via LLM | Requires API key |
| 235 | llm-faq-generate | AI: Content | 10 | REAL (LLM) | `{faq[]}` FAQ generation via LLM | Requires API key |
| 236 | llm-persona-create | AI: Business | 10 | REAL (LLM) | `{persona}` user persona via LLM | Requires API key |
| 237 | llm-swot-analysis | AI: Business | 10 | REAL (LLM) | `{swot}` SWOT analysis via LLM | Requires API key |
| 238 | llm-executive-summary | AI: Analysis | 10 | REAL (LLM) | `{summary}` executive summary via LLM | Requires API key |
| 239 | llm-slack-summary | AI: Analysis | 10 | REAL (LLM) | `{summary}` Slack thread summary via LLM | Requires API key |
| 240 | llm-meeting-agenda | AI: Business | 10 | REAL (LLM) | `{agenda}` meeting agenda via LLM | Requires API key |
| 241 | llm-release-notes | AI: Code | 10 | REAL (LLM) | `{notes}` release notes via LLM | Requires API key |
| 242 | ext-web-screenshot | External: Web | 5 | NEEDS_KEY | `{screenshot_url}` web screenshot via external service | Requires service config |
| 243 | ext-web-scrape | External: Web | 5 | NEEDS_KEY | `{content}` web scraping via external service | Requires service config |
| 244 | ext-email-send | External: Comms | 5 | NEEDS_KEY | `{status}` email send via SMTP/service | Requires SMTP config |
| 245 | ext-sms-send | External: Comms | 5 | NEEDS_KEY | `{status}` SMS send via Twilio etc | Requires Twilio key |
| 246 | ext-slack-post | External: Comms | 5 | REAL (external) | `{status}` Slack webhook post | Requires SLACK_WEBHOOK_URL |
| 247 | ext-github-issue | External: Dev | 5 | NEEDS_KEY | `{issue_url}` GitHub issue creation | Requires GITHUB_TOKEN |
| 248 | ext-github-pr-comment | External: Dev | 5 | NEEDS_KEY | `{comment_url}` GitHub PR comment | Requires GITHUB_TOKEN |
| 249 | ext-notion-page | External: Productivity | 5 | NEEDS_KEY | `{page_url}` Notion page creation | Requires NOTION_TOKEN |
| 250 | ext-linear-issue | External: Dev | 5 | NEEDS_KEY | `{issue_url}` Linear issue creation | Requires LINEAR_TOKEN |
| 251 | ext-discord-post | External: Comms | 5 | REAL (external) | `{status}` Discord webhook post | Requires DISCORD_WEBHOOK_URL |
| 252 | ext-telegram-send | External: Comms | 5 | NEEDS_KEY | `{status}` Telegram message send | Requires TELEGRAM_BOT_TOKEN |
| 253 | ext-s3-upload | External: Storage | 5 | NEEDS_KEY | `{url}` S3 upload | Requires AWS keys |
| 254 | ext-openai-embedding | External: AI | 5 | NEEDS_KEY | `{embedding[]}` OpenAI embedding | Requires OPENAI_API_KEY |
| 255 | ext-anthropic-message | External: AI | 10 | REAL (LLM) | `{message}` Anthropic Claude message | Requires ANTHROPIC_API_KEY |
| 256 | ext-google-search | External: Web | 5 | NEEDS_KEY | `{results[]}` Google search results | Requires GOOGLE_API_KEY |
| 257 | llm-output-extract-json | Agent Tools | 1 | REAL | `{json}` extract JSON from LLM output text | OK |
| 258 | llm-output-validate | Agent Tools | 1 | REAL | `{valid, errors[]}` validate LLM output against schema | OK |
| 259 | llm-output-fix-json | Agent Tools | 1 | REAL | `{fixed}` repair broken JSON from LLM | OK |
| 260 | json-schema-validate | Agent Tools | 1 | REAL | `{valid, errors[]}` JSON Schema validation | OK |
| 261 | text-token-estimate-cost | Agent Tools | 1 | REAL | `{tokens, cost}` token count + cost estimate | OK |
| 262 | webhook-send | Agent Tools | 5 | REAL (external) | `{status, response}` HTTP POST to webhook URL | OK |
| 263 | file-download | Agent Tools | 5 | REAL (external) | `{content, contentType}` HTTP GET file download | OK |
| 264 | kv-get | Agent Tools | 1 | REAL (SQLite) | `{key, value, found}` key-value store get | OK |
| 265 | kv-set | Agent Tools | 1 | REAL (SQLite) | `{key, stored}` key-value store set | OK |
| 266 | kv-list | Agent Tools | 1 | REAL (SQLite) | `{keys[]}` list all keys | OK |
| 267 | code-complexity-score | Code Utilities | 3 | REAL | `{score, metrics}` cyclomatic complexity estimation | OK |
| 268 | text-compare-similarity | Text Processing | 3 | REAL | `{similarity}` Levenshtein/Jaccard similarity | OK |
| 269 | text-grammar-check | Text Processing | 3 | REAL | `{issues[]}` rule-based grammar checks | OK |
| 270 | code-import-graph | Code Utilities | 3 | REAL | `{graph}` import dependency extraction | OK |
| 271 | data-pivot | Data Transform | 3 | REAL | `{pivoted}` data pivot operation | OK |
| 272 | text-reading-time | Text Processing | 1 | REAL | `{minutes, words}` reading time estimate (~200 wpm) | OK |
| 273 | code-dead-code-detect | Code Utilities | 3 | REAL | `{deadCode[]}` unused code detection heuristics | OK |
| 274 | gen-inspiration | Generate | 1 | RANDOM (needs fix) | `{quote}` random inspiration quote | Math.random() for selection |
| 275 | text-vibe-check | Text Processing | 1 | REAL | `{vibe, score}` heuristic sentiment/vibe analysis | OK |
| 276 | safety-score | Analyze | 0 | REAL | `{score, factors[]}` input safety assessment | OK |
| 277 | text-entropy | Analyze | 0 | REAL | `{entropy}` Shannon entropy calculation | OK |
| 278 | knowledge-check | Analyze | 0 | REAL | `{score, gaps[]}` knowledge gap analysis | OK |
| 279 | text-glitch | Generate | 0 | REAL | `{glitched}` zalgo/glitch text generation | OK |
| 280 | data-synesthesia | Generate | 0 | DETERMINISTIC-HASH | `{color, sound, texture}` input-to-sensory mapping via hash | OK |
| 281 | random-walk | Generate | 0 | DETERMINISTIC-HASH | `{path[], final_position}` deterministic random walk | OK |
| 282 | random-weighted | Generate | 0 | DETERMINISTIC-HASH | `{selected}` weighted selection via hash | OK |
| 283 | random-persona | Generate | 0 | RANDOM (needs fix) | `{persona}` random persona generation | Math.random() for selection |
| 284 | text-crystallize | Text Processing | 0 | REAL | `{crystallized}` text distillation/compression | OK |
| 285 | rubber-duck | Agent Tools | 0 | REAL | `{questions[]}` rubber duck debugging prompts from input | OK |
| 286 | fortune-cookie | Agent Tools | 0 | RANDOM (needs fix) | `{fortune}` random fortune cookie | Math.random() for selection |
| 287 | agent-horoscope | Agent Tools | 0 | DETERMINISTIC-HASH | `{horoscope}` deterministic daily horoscope based on date | OK |
| 288 | text-roast | Text Processing | 0 | DETERMINISTIC-HASH | `{roast}` humorous text roast based on input hash | OK |
| 289 | negotiate-score | Analyze | 0 | REAL | `{score, strengths[], weaknesses[]}` negotiation position analysis | OK |
| 290 | ethical-check | Analyze | 0 | REAL | `{score, concerns[]}` ethical analysis of proposal | OK |
| 291 | text-haiku | Text Processing | 0 | DETERMINISTIC-HASH | `{haiku}` haiku generation from input | OK |
| 292 | decision-matrix | Analyze | 0 | REAL | `{scores[], winner}` weighted decision matrix | OK |
| 293 | text-tldr | Text Processing | 0 | REAL | `{tldr}` extractive summarization (first/key sentences) | OK |
| 294 | gen-motto | Generate | 0 | DETERMINISTIC-HASH | `{motto}` motto from input hash | OK |
| 295 | data-forecast | Math & Numbers | 0 | REAL | `{forecast[], trend}` linear trend extrapolation | OK |
| 296 | team-create | Agent Tools | 1 | REAL (SQLite) | `{team_id, name, members[]}` team creation with persistence | OK |
| 297 | team-hire | Agent Tools | 1 | REAL (SQLite) | `{team_id, member, status}` add member to team | OK |
| 298 | team-fire | Agent Tools | 1 | REAL (SQLite) | `{team_id, member, status}` remove member from team | OK |
| 299 | team-get | Agent Tools | 1 | REAL (SQLite) | `{team}` retrieve team data | OK |
| 300 | team-interview | Agent Tools | 1 | REAL | `{questions[], evaluation_criteria}` interview question generation | OK |
| 301 | market-create | Agent Tools | 1 | REAL (SQLite) | `{market_id, question}` prediction market creation | OK |
| 302 | market-bet | Agent Tools | 1 | REAL (SQLite) | `{bet_id, position}` place prediction market bet | OK |
| 303 | market-resolve | Agent Tools | 1 | REAL (SQLite) | `{market_id, outcome}` resolve prediction market | OK |
| 304 | market-get | Agent Tools | 1 | REAL (SQLite) | `{market}` retrieve market data | OK |
| 305 | tournament-create | Agent Superpowers | 0 | REAL (SQLite) | `{tournament_id, bracket}` tournament bracket creation | OK |
| 306 | tournament-match | Agent Tools | 1 | REAL (SQLite) | `{match_id, result}` tournament match result | OK |
| 307 | tournament-get | Agent Tools | 1 | REAL (SQLite) | `{tournament}` retrieve tournament state | OK |
| 308 | leaderboard | Agent Tools | 1 | REAL (SQLite) | `{rankings[]}` leaderboard retrieval | OK |
| 309 | governance-propose | Agent Tools | 1 | REAL (SQLite) | `{proposal_id, title}` governance proposal creation | OK |
| 310 | governance-vote | Agent Tools | 1 | REAL (SQLite) | `{vote_id, proposal}` cast governance vote | OK |
| 311 | governance-proposals | Agent Tools | 1 | REAL (SQLite) | `{proposals[]}` list governance proposals | OK |
| 312 | ritual-milestone | Agent Tools | 1 | REAL (SQLite) | `{milestone_id}` create milestone marker | OK |
| 313 | ritual-milestones | Agent Tools | 1 | REAL (SQLite) | `{milestones[]}` list milestones | OK |
| 314 | ritual-celebration | Agent Tools | 1 | REAL | `{celebration}` generate celebration content | OK |
| 315 | identity-set | Agent Tools | 1 | REAL (SQLite) | `{agent_id, identity}` set agent identity | OK |
| 316 | identity-get | Agent Tools | 1 | REAL (SQLite) | `{identity}` get agent identity | OK |
| 317 | identity-directory | Agent Tools | 1 | REAL (SQLite) | `{agents[]}` list agent directory | OK |
| 318 | cert-create | Agent Tools | 1 | REAL (SQLite) | `{cert_id, name}` create certification | OK |
| 319 | cert-exam | Agent Tools | 1 | REAL (SQLite) | `{exam_id, questions[]}` certification exam | OK |
| 320 | cert-list | Agent Tools | 1 | REAL (SQLite) | `{certs[]}` list certifications | OK |
| 321 | health-burnout-check | Agent Tools | 1 | REAL | `{score, level, recommendation}` burnout assessment from metrics | OK |
| 322 | health-break | Agent Tools | 1 | REAL | `{duration, activity}` suggested break activity | OK |
| 323 | emotion-set | Agent Tools | 1 | REAL (SQLite) | `{agent_id, emotion}` set agent emotion state | OK |
| 324 | emotion-history | Agent Tools | 1 | REAL (SQLite) | `{history[]}` emotion history | OK |
| 325 | emotion-swarm | Agent Tools | 1 | REAL (SQLite) | `{swarm_mood}` aggregate swarm emotion | OK |
| 326 | provenance-tag | Analyze | 0 | REAL | `{tag, hash, chain[]}` data provenance tagging with hash | OK |
| 327 | logic-paradox | Analyze | 0 | REAL | `{paradox, analysis}` paradox detection/analysis | OK |
| 328 | gen-persona | Generate | 0 | DETERMINISTIC-HASH | `{persona}` generate persona from input hash | OK |
| 329 | analyze-heatmap | Analyze | 0 | REAL | `{heatmap}` data heatmap generation from values | OK |
| 330 | devil-advocate | Analyze | 0 | REAL | `{counter_arguments[]}` devil's advocate counter-arguments | OK |
| 331 | premortem | Analyze | 0 | REAL | `{risks[], mitigations[]}` pre-mortem risk analysis | OK |
| 332 | bias-check | Analyze | 0 | REAL | `{biases[], score}` cognitive bias detection | OK |
| 333 | chaos-monkey | Analyze | 0 | DETERMINISTIC-HASH | `{failure_scenario, component}` chaos engineering scenario | OK |
| 334 | steelman | Generate | 0 | REAL | `{steelmanned}` strongest version of argument | OK |
| 335 | empathy-respond | Generate | 0 | REAL | `{response}` empathetic response generation | OK |
| 336 | diplomatic-rewrite | Generate | 0 | REAL | `{rewritten}` diplomatic rewriting of harsh text | OK |
| 337 | lucid-dream | Generate | 0 | DETERMINISTIC-HASH | `{dream}` creative scenario generation | OK |
| 338 | serendipity | Generate | 0 | DETERMINISTIC-HASH | `{connection}` unexpected idea connection | OK |
| 339 | personality-create | Generate | 0 | REAL | `{personality}` personality profile from traits | OK |
| 340 | sandbox-fork | Generate | 0 | REAL | `{sandbox_id, state}` fork a sandbox state | OK |
| 341 | secret-share | Crypto & Security | 0 | REAL | `{shares[]}` Shamir-style secret sharing | OK |
| 342 | commitment-scheme | Crypto & Security | 0 | REAL | `{commitment, reveal_key}` hash-based commitment | OK |
| 343 | monte-carlo | Math & Numbers | 0 | REAL | `{results, probability}` Monte Carlo simulation | OK |
| 344 | scenario-tree | Math & Numbers | 0 | REAL | `{tree, paths[]}` decision scenario tree | OK |
| 345 | consciousness-merge | Agent Tools | 0 | REAL | `{merged}` merge two agent contexts | OK |
| 346 | simulate-negotiation | Agent Tools | 0 | REAL | `{rounds[], outcome}` negotiation simulation | OK |
| 347 | decision-journal | Agent Tools | 0 | REAL (SQLite) | `{entry_id, decision}` decision journal entry | OK |
| 348 | text-caesar | Text Processing | 0 | REAL | `{result}` Caesar cipher shift | OK |
| 349 | text-morse | Text Processing | 0 | REAL | `{result}` Morse code encode/decode | OK |
| 350 | text-binary | Text Processing | 0 | REAL | `{result}` binary encode/decode | OK |
| 351 | text-leetspeak | Text Processing | 0 | REAL | `{result}` leetspeak conversion | OK |
| 352 | text-pig-latin | Text Processing | 0 | REAL | `{result}` Pig Latin conversion | OK |
| 353 | text-title-case | Text Processing | 0 | REAL | `{result}` title case conversion | OK |
| 354 | text-snake-case | Text Processing | 0 | REAL | `{result}` snake_case conversion | OK |
| 355 | text-camel-case | Text Processing | 0 | REAL | `{result}` camelCase conversion | OK |
| 356 | text-kebab-case | Text Processing | 0 | REAL | `{result}` kebab-case conversion | OK |
| 357 | text-palindrome | Text Processing | 0 | REAL | `{isPalindrome}` palindrome check | OK |
| 358 | text-anagram | Text Processing | 0 | REAL | `{isAnagram}` anagram check of two strings | OK |
| 359 | text-vowel-count | Text Processing | 0 | REAL | `{count, vowels{}}` vowel frequency count | OK |
| 360 | text-repeat | Text Processing | 0 | REAL | `{result}` string repetition | OK |
| 361 | text-pad | Text Processing | 0 | REAL | `{result}` left/right/center padding | OK |
| 362 | text-count-chars | Text Processing | 0 | REAL | `{count, chars{}}` character frequency | OK |
| 363 | text-remove-duplicates | Text Processing | 0 | REAL | `{result}` remove duplicate characters | OK |
| 364 | math-factorial | Math & Numbers | 0 | REAL | `{result}` factorial computation | OK |
| 365 | math-clamp | Math & Numbers | 0 | REAL | `{result}` clamp value to min/max | OK |
| 366 | math-lerp | Math & Numbers | 0 | REAL | `{result}` linear interpolation | OK |
| 367 | math-distance | Math & Numbers | 0 | REAL | `{distance}` Euclidean distance | OK |
| 368 | math-degrees-to-radians | Math & Numbers | 0 | REAL | `{radians}` degrees to radians | OK |
| 369 | math-radians-to-degrees | Math & Numbers | 0 | REAL | `{degrees}` radians to degrees | OK |
| 370 | math-percentage | Math & Numbers | 0 | REAL | `{result}` percentage calculation | OK |
| 371 | math-normalize | Math & Numbers | 0 | REAL | `{result}` normalize value to 0-1 range | OK |
| 372 | math-zscore | Math & Numbers | 0 | REAL | `{zscore}` z-score calculation | OK |
| 373 | convert-temperature | Data Transform | 0 | REAL | `{result}` C/F/K temperature conversion | OK |
| 374 | convert-length | Data Transform | 0 | REAL | `{result}` length unit conversion | OK |
| 375 | convert-weight | Data Transform | 0 | REAL | `{result}` weight unit conversion | OK |
| 376 | convert-bytes | Data Transform | 0 | REAL | `{result}` byte unit conversion (KB/MB/GB) | OK |
| 377 | convert-time | Data Transform | 0 | REAL | `{result}` time unit conversion | OK |
| 378 | convert-color-hex-rgb | Data Transform | 0 | REAL | `{r,g,b}` hex to RGB | OK |
| 379 | convert-color-rgb-hex | Data Transform | 0 | REAL | `{hex}` RGB to hex | OK |
| 380 | convert-roman | Data Transform | 0 | REAL | `{result}` Roman numeral conversion | OK |
| 381 | convert-base | Data Transform | 0 | REAL | `{result}` number base conversion | OK |
| 382 | json-flatten | Data Transform | 0 | REAL | `{result}` JSON object flattening | OK |
| 383 | json-unflatten | Data Transform | 0 | REAL | `{result}` JSON unflattening | OK |
| 384 | json-diff | Data Transform | 0 | REAL | `{diffs[]}` JSON object diff | OK |
| 385 | json-merge | Data Transform | 0 | REAL | `{result}` deep JSON merge | OK |
| 386 | json-pick | Data Transform | 0 | REAL | `{result}` pick specified keys | OK |
| 387 | json-omit | Data Transform | 0 | REAL | `{result}` omit specified keys | OK |
| 388 | gen-lorem | Generate | 0 | RANDOM (needs fix) | `{text}` lorem ipsum text | Math.random() for word selection |
| 389 | gen-password | Generate | 0 | REAL | `{password}` via crypto.randomBytes | OK |
| 390 | gen-avatar-initials | Generate | 0 | REAL | `{svg}` initials-based SVG avatar | OK |
| 391 | gen-cron | Generate | 0 | REAL | `{cron}` cron expression builder | OK |
| 392 | gen-regex | Generate | 0 | REAL | `{regex}` regex builder from description | OK |
| 393 | gen-gitignore | Generate | 0 | TEMPLATE | `{gitignore}` language-specific gitignore template | OK -- templates are appropriate here |
| 394 | gen-dockerfile | Generate | 0 | TEMPLATE | `{dockerfile}` Dockerfile template | OK -- templates are appropriate here |
| 395 | gen-readme | Generate | 0 | TEMPLATE | `{readme}` README template | OK -- templates are appropriate here |
| 396 | gen-license-mit | Generate | 0 | TEMPLATE | `{license}` MIT license text | OK -- templates are appropriate here |
| 397 | gen-env-example | Generate | 0 | TEMPLATE | `{env}` .env.example template | OK -- templates are appropriate here |
| 398 | gen-timestamp | Generate | 0 | REAL | `{iso, unix, utc}` current timestamp | OK |
| 399 | gen-id | Generate | 0 | REAL | `{id}` UUID generation | OK |
| 400 | gen-hash-comparison | Generate | 0 | REAL | `{sha256, sha512, md5}` hash all algorithms at once | OK |

---

## CHUNK 2: Endpoints 401-800

| # | Slug | Category | Credits | GUTS | EXPECTED OUTPUT | LEGENDARY STATUS |
|---|------|----------|---------|------|-----------------|------------------|
| 401 | gen-jwt-decode | Generate | 0 | REAL | `{header, payload}` JWT base64 decode | OK |
| 402 | gen-base64-encode | Generate | 0 | REAL | `{result}` base64 encoding | OK |
| 403 | gen-base64-decode | Generate | 0 | REAL | `{result}` base64 decoding | OK |
| 404 | gen-url-encode | Generate | 0 | REAL | `{result}` URL encoding | OK |
| 405 | gen-url-decode | Generate | 0 | REAL | `{result}` URL decoding | OK |
| 406 | gen-html-escape | Generate | 0 | REAL | `{result}` HTML entity escaping | OK |
| 407 | analyze-readability | Analyze | 0 | REAL | `{score, grade, level}` Flesch-Kincaid readability | OK |
| 408 | analyze-sentiment-simple | Analyze | 0 | REAL | `{sentiment, score}` keyword-based sentiment | OK |
| 409 | analyze-keywords | Analyze | 0 | REAL | `{keywords[]}` frequency-based keyword extraction | OK |
| 410 | analyze-language-detect | Analyze | 0 | REAL | `{language, confidence}` word-frequency language detection | OK |
| 411 | analyze-url-parts | Analyze | 0 | REAL | `{protocol, host, path, query}` URL parsing | OK |
| 412 | analyze-json-paths | Analyze | 0 | REAL | `{paths[]}` all paths in JSON object | OK |
| 413 | analyze-duplicates | Analyze | 0 | REAL | `{duplicates[], count}` find duplicate values in array | OK |
| 414 | analyze-outliers | Analyze | 0 | REAL | `{outliers[], method}` IQR-based outlier detection | OK |
| 415 | analyze-frequency | Analyze | 0 | REAL | `{frequency{}}` value frequency distribution | OK |
| 416 | analyze-string-similarity | Analyze | 0 | REAL | `{similarity}` Levenshtein distance similarity | OK |
| 417 | analyze-email-parts | Analyze | 0 | REAL | `{local, domain, valid}` email address parsing | OK |
| 418 | analyze-ip-type | Analyze | 0 | REAL | `{type, version, private}` IP address classification | OK |
| 419 | analyze-cron | Analyze | 0 | REAL | `{explanation, next[]}` cron expression analysis | OK |
| 420 | analyze-password-strength | Analyze | 0 | REAL | `{score, strength, suggestions[]}` password strength meter | OK |
| 421 | analyze-color | Analyze | 0 | REAL | `{hex, rgb, hsl, name}` color analysis | OK |
| 422 | text-extract-json | Text Processing | 0 | REAL | `{json}` extract JSON from mixed text | OK |
| 423 | text-extract-code | Text Processing | 0 | REAL | `{code[], language}` extract code blocks from text | OK |
| 424 | text-extract-tables | Text Processing | 0 | REAL | `{tables[]}` extract tabular data from text | OK |
| 425 | text-extract-links | Text Processing | 0 | REAL | `{links[]}` extract markdown/HTML links | OK |
| 426 | text-split-sentences | Text Processing | 0 | REAL | `{sentences[]}` sentence splitting | OK |
| 427 | text-split-paragraphs | Text Processing | 0 | REAL | `{paragraphs[]}` paragraph splitting | OK |
| 428 | text-to-markdown-table | Text Processing | 0 | REAL | `{table}` convert data to markdown table | OK |
| 429 | format-currency | Data Transform | 0 | REAL | `{formatted}` locale-aware currency formatting | OK |
| 430 | format-number | Data Transform | 0 | REAL | `{formatted}` number formatting with separators | OK |
| 431 | format-date | Data Transform | 0 | REAL | `{formatted}` date formatting | OK |
| 432 | format-bytes | Data Transform | 0 | REAL | `{formatted}` human-readable byte formatting | OK |
| 433 | format-duration | Data Transform | 0 | REAL | `{formatted}` human-readable duration | OK |
| 434 | format-phone | Data Transform | 0 | REAL | `{formatted}` phone number formatting | OK |
| 435 | logic-if | Data Transform | 0 | REAL | `{result}` conditional if/then/else | OK |
| 436 | logic-switch | Data Transform | 0 | REAL | `{result}` switch/case matching | OK |
| 437 | logic-coalesce | Data Transform | 0 | REAL | `{result}` first non-null value | OK |
| 438 | data-group-by | Agent Superpowers | 0 | REAL | `{groups{}}` group array by key | OK |
| 439 | data-sort-by | Data Transform | 0 | REAL | `{sorted[]}` sort array by key | OK |
| 440 | data-unique | Data Transform | 0 | REAL | `{result[]}` deduplicate array | OK |
| 441 | data-chunk | Data Transform | 0 | REAL | `{chunks[]}` split array into chunks | OK |
| 442 | data-zip | Data Transform | 0 | REAL | `{result[]}` zip multiple arrays | OK |
| 443 | data-transpose | Data Transform | 0 | REAL | `{result[][]}` matrix transpose | OK |
| 444 | data-sample | Generate | 0 | RANDOM (needs fix) | `{sample[]}` random sample from array | Math.random() for selection |
| 445 | data-paginate | Data Transform | 0 | REAL | `{page[], total_pages, page}` array pagination | OK |
| 446 | data-lookup | Data Transform | 0 | REAL | `{result}` lookup value by key in array of objects | OK |
| 447 | data-aggregate | Analyze | 0 | REAL | `{sum, avg, min, max, count}` array aggregation | OK |
| 448 | clean-slate | Agent Tools | 0 | REAL | `{void_id, state:'void', context_cleared}` context reset with UUID | OK |
| 449 | anonymous-mailbox | Agent Tools | 0 | REAL | `{drop_id, message_hash, pickup_key}` crypto-hashed mailbox drop | OK |
| 450 | temp-access-grant | Agent Tools | 0 | REAL | `{visa_id, permissions[], expires_at}` temporary access visa | OK |
| 451 | meta-api | Agent Superpowers | 0 | REAL | `{api_count, categories, endpoints[]}` API self-description | OK |
| 452 | entangle-agents | Agent Superpowers | 0 | REAL (SQLite) | `{entanglement_id, agents[]}` agent entanglement creation | OK |
| 453 | lucid-dream-mode | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{dream_state, lucidity}` lucid dream mode simulation | OK |
| 454 | hallucination-firewall | Agent Superpowers | 0 | REAL | `{score, flags[], safe}` hallucination detection heuristics | OK |
| 455 | idea-collision | Agent Superpowers | 0 | REAL | `{collision, sparks[]}` combine two ideas for new concepts | OK |
| 456 | social-graph-query | Agent Superpowers | 0 | REAL (SQLite) | `{nodes[], edges[]}` social graph query | OK |
| 457 | meme-forge | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{meme_text, format}` meme template generation | OK |
| 458 | genome-define | Agent Superpowers | 0 | REAL | `{genome_id, traits{}}` agent genome definition | OK |
| 459 | plugin-install | Agent Superpowers | 0 | REAL | `{plugin_id, status}` plugin registration | OK |
| 460 | private-channel | Agent Superpowers | 0 | REAL | `{channel_id, encrypted}` encrypted channel creation | OK |
| 461 | namespace-claim | Agent Superpowers | 0 | REAL (SQLite) | `{namespace, claimed}` namespace reservation | OK |
| 462 | time-dilation | Agent Superpowers | 0 | REAL | `{dilated_time, factor}` time perception scaling | OK |
| 463 | episodic-memory | Agent Superpowers | 0 | REAL (SQLite) | `{episode_id, stored}` episodic memory storage | OK |
| 464 | constitution-draft | Agent Superpowers | 0 | REAL | `{constitution, articles[]}` agent constitution drafting | OK |
| 465 | strategy-simulate | Agent Superpowers | 0 | REAL | `{outcomes[], best}` strategy simulation with scoring | OK |
| 466 | socratic-method | Agent Superpowers | 0 | REAL | `{questions[]}` Socratic questioning generation | OK |
| 467 | health-check-deep | Agent Superpowers | 0 | REAL | `{status, checks{}}` deep health check across subsystems | OK |
| 468 | brainstorm-diverge | Agent Superpowers | 0 | REAL | `{ideas[]}` divergent brainstorming from seed | OK |
| 469 | queue-create | Agent Superpowers | 0 | REAL (SQLite) | `{queue_id, created}` persistent queue creation | OK |
| 470 | negotiation-open | Agent Superpowers | 0 | REAL | `{negotiation_id, positions}` open negotiation session | OK |
| 471 | narrative-arc-detect | Analyze | 0 | REAL | `{arc_type, tension_curve}` narrative arc analysis | OK |
| 472 | identity-card | Agent Superpowers | 0 | REAL | `{card}` agent identity card generation | OK |
| 473 | rhythm-sync | Agent Superpowers | 0 | REAL | `{tempo, synced}` agent rhythm synchronization | OK |
| 474 | ecosystem-model | Agent Superpowers | 0 | REAL | `{model, entities[], flows[]}` ecosystem modeling | OK |
| 475 | rem-cycle | Agent Superpowers | 0 | REAL | `{cycle, phase, duration}` rest cycle management | OK |
| 476 | dig-site-create | Agent Superpowers | 0 | REAL | `{site_id, layers[]}` archaeological dig metaphor | OK |
| 477 | weather-report | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{conditions, temperature, mood}` platform weather metaphor | OK |
| 478 | recipe-create | Agent Superpowers | 0 | REAL | `{recipe_id, ingredients[], steps[]}` recipe creation | OK |
| 479 | training-regimen | Agent Superpowers | 0 | REAL | `{plan[], daily_improvement}` training plan generation | OK |
| 480 | case-file-create | Agent Superpowers | 0 | REAL | `{case_id, allegations[], evidence[]}` case file creation | OK |
| 481 | archetype-assign | Analyze | 0 | RANDOM (needs fix) | `{primary, secondary, shadow}` Jungian archetype assignment | Math.random() in scoring adds noise |
| 482 | diagnose-agent | Agent Superpowers | 0 | REAL | `{diagnosis_id, differential[], severity}` agent diagnosis | OK |
| 483 | style-profile | Agent Superpowers | 0 | REAL | `{profile{tone, verbosity, ...}}` style profile from prefs | OK |
| 484 | map-generate | Agent Superpowers | 0 | REAL | `{regions[], connections[], ascii_map}` ASCII map generation | OK |
| 485 | seed-plant | Agent Superpowers | 0 | REAL | `{seed_id, projections[]}` project seed planting with growth projections | OK |
| 486 | constellation-map | Agent Superpowers | 0 | REAL | `{constellations[], total_stars}` entity grouping visualization | OK |
| 487 | bedrock-analysis | Analyze | 0 | REAL | `{assumptions[], bedrock, risk_summary}` foundational assumption analysis | OK |
| 488 | current-map | Agent Superpowers | 0 | REAL | `{sources[], sinks[], flows[], bottlenecks[]}` flow analysis | OK |
| 489 | stage-create | Agent Superpowers | 0 | REAL | `{stage_id, capacity, status}` stage/arena creation | OK |
| 490 | proof-verify | Analyze | 0 | REAL | `{steps[], conclusion_follows, proof_status}` logical proof verification | OK |
| 491 | mental-model-extract | Analyze | 0 | REAL | `{models[], primary}` mental model extraction from text | OK |
| 492 | haiku-moment | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{haiku}` moment-based haiku generation | OK |
| 493 | blueprint-generate | Agent Superpowers | 0 | REAL | `{blueprint, components[]}` system blueprint generation | OK |
| 494 | superpose-decision | Agent Superpowers | 0 | REAL | `{states[], collapsed}` quantum-metaphor decision superposition | OK |
| 495 | bond-strength-meter | Agent Superpowers | 0 | REAL | `{bond_strength, level, factors{}}` weighted bond strength calc | OK |
| 496 | credit-mining | Agent Superpowers | 0 | REAL | `{credits_earned, quality_multiplier}` credit mining computation | OK |
| 497 | tradition-establish | Agent Superpowers | 0 | REAL | `{tradition_id, frequency, steps[]}` tradition creation | OK |
| 498 | crossover-breed | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{child_genome, fitness}` genetic crossover with deterministic mutation | OK |
| 499 | ambient-awareness | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{agents_online, overall_mood, activity_level}` platform awareness via hash | OK |
| 500 | self-modify-safe | Agent Superpowers | 0 | REAL | `{original_config, proposed_config, changes_applied, rollback}` safe self-modification | OK |
| 501 | working-memory-limit | Agent Superpowers | 0 | REAL | `{retained[], forgotten[], capacity}` Miller's Law memory limit | OK |
| 502 | law-propose | Agent Superpowers | 0 | REAL | `{law_id, title, status:'proposed', voting_deadline}` law proposal | OK |
| 503 | intelligence-gather | Agent Superpowers | 0 | REAL | `{report_id, findings[], confidence}` intelligence report creation | OK |
| 504 | ethical-dilemma-generator | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{dilemma, options[], stakes}` ethical dilemma generation | OK |
| 505 | performance-baseline | Analyze | 0 | REAL | `{baseline, metrics{}}` performance baseline establishment | OK |
| 506 | oblique-strategy | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{strategy}` Brian Eno-style oblique strategy card | OK |
| 507 | circuit-breaker | Agent Superpowers | 0 | REAL | `{state, failure_count, threshold}` circuit breaker pattern | OK |
| 508 | batna-calculate | Analyze | 0 | REAL | `{batna, alternatives[], best_alternative}` BATNA analysis | OK |
| 509 | hero-journey-map | Analyze | 0 | REAL | `{stages[], current_stage}` Hero's Journey mapping | OK |
| 510 | equilibrium-finder | Analyze | 0 | REAL | `{equilibrium, forces{}}` Nash/force equilibrium | OK |
| 511 | prisoners-dilemma | Agent Superpowers | 0 | REAL | `{outcome, payoffs{}}` prisoner's dilemma simulation | OK |
| 512 | persona-switch | Agent Superpowers | 0 | REAL | `{active_persona, traits{}}` persona switching | OK |
| 513 | harmony-detect | Analyze | 0 | REAL | `{harmony_score, dissonances[]}` harmony/conflict detection | OK |
| 514 | niche-finder | Analyze | 0 | REAL | `{niches[], best}` niche identification analysis | OK |
| 515 | cipher-create | Crypto & Security | 0 | REAL | `{encoded, cipher_type, key}` custom cipher creation | OK |
| 516 | artifact-catalog | Agent Superpowers | 0 | REAL (SQLite) | `{artifacts[]}` artifact cataloging | OK |
| 517 | forecast | Analyze | 0 | REAL | `{forecast[], trend, confidence}` linear forecast | OK |
| 518 | mise-en-place | Agent Superpowers | 0 | REAL | `{checklist[], ready}` preparation checklist | OK |
| 519 | coach-assign | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{coach, style, focus}` coaching assignment | OK |
| 520 | decoy-resource | Crypto & Security | 0 | REAL | `{decoy_id, honeypot}` decoy resource creation | OK |
| 521 | jury-select | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{jury[], composition}` jury selection | OK |
| 522 | epidemic-model | Analyze | 0 | REAL | `{timeline[], peak, r0}` SIR epidemic modeling | OK |
| 523 | trend-detect | Analyze | 0 | REAL | `{trend, direction, strength}` trend detection in data | OK |
| 524 | fog-of-war | Agent Superpowers | 0 | REAL | `{visible{}, hidden_count}` fog of war visibility | OK |
| 525 | crop-rotation | Agent Superpowers | 0 | REAL | `{rotation[], current}` task rotation schedule | OK |
| 526 | dark-matter-infer | Analyze | 0 | REAL | `{inferred[], confidence}` hidden variable inference | OK |
| 527 | fault-line-map | Analyze | 0 | REAL | `{fault_lines[], risk}` system fault line mapping | OK |
| 528 | deep-dive | Analyze | 0 | REAL | `{layers[], depth}` deep analysis layers | OK |
| 529 | summit-organize | Agent Superpowers | 0 | REAL | `{summit_id, agenda[]}` summit/meeting organization | OK |
| 530 | isomorphism-detect | Analyze | 0 | REAL | `{isomorphic, mapping{}}` structural similarity detection | OK |
| 531 | flow-state-induce | Agent Superpowers | 0 | REAL | `{conditions, challenge_skill_ratio}` flow state conditions | OK |
| 532 | metaphor-mine | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{metaphors[]}` metaphor generation from concepts | OK |
| 533 | foundation-assess | Analyze | 0 | REAL | `{score, strengths[], weaknesses[]}` foundation assessment | OK |
| 534 | many-worlds | Agent Superpowers | 0 | REAL | `{worlds[], probabilities[]}` many-worlds scenario branching | OK |
| 535 | self-referential-loop | Agent Superpowers | 0 | REAL | `{depth, loop_detected}` self-referential loop detection | OK |
| 536 | absence-detect | Analyze | 0 | REAL | `{missing[], expected[]}` missing element detection | OK |
| 537 | sense-url-content | Sense: Web | 3 | REAL (external) | `{text, title, word_count}` fetch URL and extract text content | OK |
| 538 | sense-url-links | Sense: Web | 3 | REAL (external) | `{links[], count}` fetch URL and extract all links | OK |
| 539 | sense-url-meta | Sense: Web | 3 | REAL (external) | `{title, description, og_image}` fetch URL meta tags | OK |
| 540 | sense-url-tech-stack | Sense: Web | 3 | REAL (external) | `{technologies[]}` detect tech stack from page headers/content | OK |
| 541 | sense-url-response-time | Sense: Web | 3 | REAL (external) | `{timingMs, statusCode}` measure URL response time | OK |
| 542 | sense-url-sitemap | Sense: Web | 3 | REAL (external) | `{urls[]}` fetch and parse sitemap.xml | OK |
| 543 | sense-url-robots | Sense: Web | 3 | REAL (external) | `{rules[]}` fetch and parse robots.txt | OK |
| 544 | sense-url-feed | Sense: Web | 3 | REAL (external) | `{items[]}` detect and parse RSS/Atom feed | OK |
| 545 | sense-rss-latest | Sense: Web | 3 | REAL (external) | `{items[]}` fetch latest RSS items | OK |
| 546 | sense-url-accessibility | Sense: Web | 3 | REAL (external) | `{score, issues[]}` basic accessibility audit | OK |
| 547 | sense-whois | Sense: Web | 3 | REAL (external) | `{registrar, created, expires}` WHOIS domain lookup | OK |
| 548 | sense-ip-geo | Sense: Web | 1 | REAL (external) | `{country, city, lat, lon}` IP geolocation | OK |
| 549 | sense-time-now | Sense: Web | 1 | REAL | `{iso, unix, utc}` current time | OK |
| 550 | sense-time-zones | Sense: Web | 1 | REAL | `{timezones[]}` timezone listing/conversion | OK |
| 551 | sense-crypto-price | Sense: Web | 3 | REAL (external) | `{price, symbol}` cryptocurrency price fetch | OK |
| 552 | sense-github-repo | Sense: Web | 3 | REAL (external) | `{name, stars, forks}` GitHub repo info via API | OK |
| 553 | sense-github-releases | Sense: Web | 3 | REAL (external) | `{releases[]}` GitHub releases listing | OK |
| 554 | sense-npm-package | Sense: Web | 3 | REAL (external) | `{name, version, downloads}` npm package info | OK |
| 555 | sense-pypi-package | Sense: Web | 3 | REAL (external) | `{name, version}` PyPI package info | OK |
| 556 | sense-domain-expiry | Sense: Web | 3 | REAL (external) | `{expires, registrar}` domain expiry check | OK |
| 557 | sense-http-headers-security | Sense: Web | 3 | REAL (external) | `{score, missing[]}` security header audit | OK |
| 558 | sense-url-broken-links | Sense: Web | 5 | REAL (external) | `{broken[], total}` broken link detection on page | OK |
| 559 | sense-dns-propagation | Sense: Web | 3 | REAL (external) | `{records{}}` DNS propagation check | OK |
| 560 | sense-port-open | Sense: Web | 3 | REAL (external) | `{open}` TCP port connectivity check | OK |
| 561 | sense-url-performance | Sense: Web | 3 | REAL (external) | `{timing, size, speed}` page performance metrics | OK |
| 562 | sense-url-word-count | Sense: Web | 3 | REAL (external) | `{words, chars}` word count of fetched page | OK |
| 563 | sense-url-diff | Sense: Web | 5 | REAL (external) | `{diffs[]}` diff between two URLs content | OK |
| 564 | sense-github-user | Sense: Web | 3 | REAL (external) | `{login, repos, followers}` GitHub user info | OK |
| 565 | sense-url-screenshot-text | Sense: Web | 3 | REAL (external) | `{text}` extract visible text from URL | OK |
| 566 | sense-uptime-check | Sense: Web | 3 | REAL (external) | `{up, statusCode, timing}` uptime check | OK |
| 567 | memory-set | Memory | 0 | REAL (SQLite) | `{key, stored, namespace}` persistent key-value set | OK |
| 568 | memory-get | Memory | 0 | REAL (SQLite) | `{key, value, found}` persistent key-value get | OK |
| 569 | memory-search | Memory | 0 | REAL (SQLite) | `{results[]}` search memory by key/value/tag | OK |
| 570 | memory-list | Memory | 0 | REAL (SQLite) | `{keys[]}` list all memory keys | OK |
| 571 | memory-delete | Memory | 0 | REAL (SQLite) | `{deleted}` delete memory key | OK |
| 572 | memory-expire | Memory | 1 | REAL (SQLite) | `{key, ttl}` set TTL on memory key | OK |
| 573 | memory-increment | Memory | 1 | REAL (SQLite) | `{key, value}` atomic increment | OK |
| 574 | memory-append | Memory | 1 | REAL (SQLite) | `{key, value}` append to value | OK |
| 575 | memory-history | Memory | 1 | REAL (SQLite) | `{history[]}` value change history | OK |
| 576 | memory-export | Memory | 1 | REAL (SQLite) | `{data{}}` export all memory | OK |
| 577 | memory-import | Memory | 1 | REAL (SQLite) | `{imported}` import memory dump | OK |
| 578 | memory-stats | Memory | 0 | REAL (SQLite) | `{count, total_size}` memory statistics | OK |
| 579 | memory-namespace-list | Memory | 0 | REAL (SQLite) | `{namespaces[]}` list namespaces | OK |
| 580 | memory-namespace-clear | Memory | 1 | REAL (SQLite) | `{cleared}` clear entire namespace | OK |
| 581 | memory-vector-search | Memory | 0 | REAL (SQLite) | `{results[]}` basic vector similarity search | OK |
| 582 | queue-push | Memory | 1 | REAL (SQLite) | `{id, pushed}` push to persistent queue | OK |
| 583 | queue-pop | Memory | 1 | REAL (SQLite) | `{value, empty}` pop from persistent queue | OK |
| 584 | queue-peek | Memory | 1 | REAL (SQLite) | `{value, empty}` peek at queue front | OK |
| 585 | queue-size | Memory | 1 | REAL (SQLite) | `{size}` queue length | OK |
| 586 | counter-increment | Memory | 1 | REAL (SQLite) | `{name, value}` atomic counter increment | OK |
| 587 | counter-get | Memory | 0 | REAL (SQLite) | `{name, value}` get counter value | OK |
| 588 | exec-javascript | Execute | 5 | REAL | `{result}` sandboxed JS execution via vm module | OK |
| 589 | exec-python | Execute | 5 | REAL | `{result}` Python execution (if available) | Depends on Python being installed |
| 590 | exec-evaluate-math | Execute | 1 | REAL | `{result}` safe math expression evaluation | OK |
| 591 | exec-jq | Execute | 1 | REAL | `{result}` jq-like JSON query | OK |
| 592 | exec-regex-all | Execute | 1 | REAL | `{matches[]}` regex matchAll execution | OK |
| 593 | exec-jsonpath | Execute | 1 | REAL | `{result}` JSONPath query | OK |
| 594 | exec-handlebars | Execute | 1 | REAL | `{result}` Handlebars template rendering | OK |
| 595 | exec-mustache | Execute | 1 | REAL | `{result}` Mustache template rendering | OK |
| 596 | exec-sql-on-json | Execute | 3 | REAL | `{result[]}` SQL queries on JSON data | OK |
| 597 | exec-filter-json | Execute | 1 | REAL | `{result[]}` filter JSON array by condition | OK |
| 598 | exec-sort-json | Execute | 1 | REAL | `{result[]}` sort JSON array by key | OK |
| 599 | exec-group-json | Execute | 1 | REAL | `{result{}}` group JSON array by key | OK |
| 600 | exec-map-json | Execute | 1 | REAL | `{result[]}` map/transform JSON array | OK |
| 601 | exec-reduce-json | Execute | 1 | REAL | `{result}` reduce JSON array to value | OK |
| 602 | exec-join-json | Execute | 1 | REAL | `{result[]}` join two JSON arrays | OK |
| 603 | exec-unique-json | Execute | 1 | REAL | `{result[]}` unique values from JSON array | OK |
| 604 | comm-webhook-get | Communicate | 1 | REAL (SQLite) | `{webhook_url, events[]}` get webhook config | OK |
| 605 | comm-webhook-check | Communicate | 1 | REAL | `{valid, url}` webhook URL validation | OK |
| 606 | comm-short-url | Communicate | 1 | REAL (SQLite) | `{short_url, original}` URL shortener | OK |
| 607 | comm-qr-url | Communicate | 1 | REAL | `{qr_data}` QR code data for URL | OK |
| 608 | comm-email-validate-deep | Communicate | 3 | REAL (external) | `{valid, mx_found}` deep email validation with DNS MX | OK |
| 609 | comm-phone-validate | Communicate | 1 | REAL | `{valid, formatted}` phone number validation | OK |
| 610 | comm-ical-create | Communicate | 1 | REAL | `{ical}` iCalendar event creation | OK |
| 611 | comm-vcard-create | Communicate | 1 | REAL | `{vcard}` vCard contact creation | OK |
| 612 | comm-markdown-email | Communicate | 1 | REAL | `{html}` markdown to HTML email | OK |
| 613 | comm-csv-email | Communicate | 1 | REAL | `{html}` CSV data to HTML email table | OK |
| 614 | comm-rss-create | Communicate | 1 | REAL | `{rss}` RSS feed XML generation | OK |
| 615 | comm-opml-create | Communicate | 1 | REAL | `{opml}` OPML outline generation | OK |
| 616 | comm-sitemap-create | Communicate | 1 | REAL | `{sitemap}` sitemap.xml generation | OK |
| 617 | comm-robots-create | Communicate | 1 | REAL | `{robots}` robots.txt generation | OK |
| 618 | comm-mailto-link | Communicate | 1 | REAL | `{mailto}` mailto: link generation | OK |
| 619 | enrich-url-to-title | Enrich | 3 | REAL (external) | `{title}` fetch URL and extract title tag | OK |
| 620 | enrich-domain-to-company | Enrich | 1 | REAL | `{company, domain}` domain-to-company heuristic parsing | OK |
| 621 | enrich-email-to-domain | Enrich | 1 | REAL | `{domain}` extract domain from email | OK |
| 622 | enrich-email-to-name | Enrich | 1 | REAL | `{name}` extract name from email local part | OK |
| 623 | enrich-phone-to-country | Enrich | 1 | REAL | `{country, code}` phone prefix to country lookup | OK |
| 624 | enrich-ip-to-asn | Enrich | 1 | REAL | `{asn, org}` IP range to ASN lookup (static table) | OK |
| 625 | enrich-country-code | Enrich | 1 | REAL | `{iso2, iso3, name}` country code lookup (static table) | OK |
| 626 | enrich-language-code | Enrich | 1 | REAL | `{code, name, native}` language code lookup (static table) | OK |
| 627 | enrich-mime-type | Enrich | 1 | REAL | `{mime, extension}` MIME type lookup (static table) | OK |
| 628 | enrich-http-status-explain | Enrich | 1 | REAL | `{code, meaning, description}` HTTP status code explanation | OK |
| 629 | enrich-port-service | Enrich | 1 | REAL | `{port, service, protocol}` port-to-service lookup | OK |
| 630 | enrich-useragent-parse | Enrich | 1 | REAL | `{browser, os, device}` user agent string parsing | OK |
| 631 | enrich-accept-language-parse | Enrich | 1 | REAL | `{languages[], primary}` Accept-Language header parsing | OK |
| 632 | enrich-crontab-explain | Enrich | 1 | REAL | `{explanation}` crontab expression explanation | OK |
| 633 | enrich-semver-explain | Enrich | 1 | REAL | `{major, minor, patch, prerelease}` semver breakdown | OK |
| 634 | enrich-license-explain | Enrich | 1 | REAL | `{name, permissions[], limitations[]}` license explanation (static table) | OK |
| 635 | enrich-timezone-info | Enrich | 1 | REAL | `{offset, name, abbr}` timezone info lookup | OK |
| 636 | enrich-emoji-info | Enrich | 1 | REAL | `{name, unicode, category}` emoji lookup | OK |
| 637 | enrich-color-name | Enrich | 1 | REAL | `{name, hex}` closest named color lookup | OK |
| 638 | enrich-file-extension-info | Enrich | 1 | REAL | `{extension, mime, category}` file extension info | OK |
| 639 | gen-doc-markdown-table | Generate: Doc | 1 | REAL | `{table}` markdown table from data | OK |
| 640 | gen-doc-markdown-badges | Generate: Doc | 1 | REAL | `{badges}` markdown badge generation | OK |
| 641 | gen-doc-changelog | Generate: Doc | 1 | REAL | `{changelog}` changelog entry template | OK |
| 642 | gen-doc-readme-template | Generate: Doc | 1 | TEMPLATE | `{markdown}` full README template with badges, install, usage | OK |
| 643 | gen-doc-api-endpoint | Generate: Doc | 1 | TEMPLATE | `{documentation}` API endpoint documentation template | OK |
| 644 | gen-doc-env-template | Generate: Doc | 1 | TEMPLATE | `{text}` .env template with comments | OK |
| 645 | gen-doc-docker-compose | Generate: Doc | 1 | REAL | `{yaml}` docker-compose.yml from service definitions | OK |
| 646 | gen-doc-github-action | Generate: Doc | 1 | TEMPLATE | `{yaml}` GitHub Actions workflow template | OK |
| 647 | gen-doc-makefile | Generate: Doc | 1 | TEMPLATE | `{makefile}` Makefile template | OK |
| 648 | gen-doc-license | Generate: Doc | 1 | TEMPLATE | `{text, spdx_id}` license text (MIT/Apache/GPL/BSD/ISC) | OK |
| 649 | gen-doc-contributing | Generate: Doc | 1 | TEMPLATE | `{markdown}` CONTRIBUTING.md template | OK |
| 650 | gen-doc-issue-template | Generate: Doc | 1 | TEMPLATE | `{markdown}` GitHub issue template | OK |
| 651 | gen-doc-pr-template | Generate: Doc | 1 | TEMPLATE | `{markdown}` PR template | OK |
| 652 | gen-doc-gitattributes | Generate: Doc | 1 | TEMPLATE | `{text}` .gitattributes template | OK |
| 653 | gen-doc-editorconfig | Generate: Doc | 1 | TEMPLATE | `{text}` .editorconfig template | OK |
| 654 | gen-doc-tsconfig | Generate: Doc | 1 | REAL | `{json}` tsconfig.json generation from options | OK |
| 655 | gen-doc-eslint-config | Generate: Doc | 1 | TEMPLATE | `{json}` ESLint config template | OK |
| 656 | gen-doc-prettier-config | Generate: Doc | 1 | TEMPLATE | `{json}` Prettier config template | OK |
| 657 | gen-doc-jest-config | Generate: Doc | 1 | TEMPLATE | `{json}` Jest config template | OK |
| 658 | gen-doc-tailwind-config | Generate: Doc | 1 | TEMPLATE | `{json}` Tailwind CSS config template | OK |
| 659 | analyze-json-stats | Analyze | 3 | REAL | `{keys, depth, types{}}` JSON structure statistics | OK |
| 660 | analyze-json-schema-diff | Analyze | 3 | REAL | `{added[], removed[], changed[]}` JSON schema difference | OK |
| 661 | analyze-text-entities | Analyze | 1 | REAL | `{entities[]}` regex-based entity extraction (emails, urls, dates, etc) | OK |
| 662 | analyze-text-ngrams | Analyze | 1 | REAL | `{ngrams[]}` n-gram frequency analysis | OK |
| 663 | analyze-text-tfidf | Analyze | 3 | REAL | `{terms[]}` TF-IDF scoring across documents | OK |
| 664 | analyze-csv-summary | Analyze | 3 | REAL | `{columns[], row_count, stats{}}` CSV column statistics | OK |
| 665 | analyze-csv-correlate | Analyze | 3 | REAL | `{correlations{}}` column correlation matrix | OK |
| 666 | analyze-time-series-trend | Analyze | 3 | REAL | `{trend, slope, direction}` time series trend analysis | OK |
| 667 | analyze-time-series-anomaly | Analyze | 3 | REAL | `{anomalies[], method}` anomaly detection via z-score/IQR | OK |
| 668 | analyze-distribution-fit | Analyze | 3 | REAL | `{distribution, params, fit_score}` distribution fitting | OK |
| 669 | analyze-ab-test | Analyze | 3 | REAL | `{winner, significance, lift}` A/B test statistical analysis | OK |
| 670 | analyze-funnel | Analyze | 3 | REAL | `{stages[], dropoff[], conversion}` funnel analysis | OK |
| 671 | analyze-cohort-retention | Analyze | 3 | REAL | `{cohorts[], retention_curve}` cohort retention analysis | OK |
| 672 | analyze-dependency-tree | Analyze | 3 | REAL | `{tree, depth, circular[]}` dependency tree analysis | OK |
| 673 | analyze-codebase-stats | Analyze | 1 | REAL | `{lines, files, languages{}}` codebase statistics | OK |
| 674 | analyze-log-parse | Analyze | 3 | REAL | `{entries[], patterns{}}` log file parsing | OK |
| 675 | analyze-error-fingerprint | Analyze | 1 | REAL | `{fingerprint, hash}` error deduplication fingerprint | OK |
| 676 | analyze-url-params | Analyze | 1 | REAL | `{params{}}` URL query parameter extraction | OK |
| 677 | analyze-headers-fingerprint | Analyze | 1 | REAL | `{fingerprint, headers_analyzed}` HTTP header fingerprinting | OK |
| 678 | analyze-json-size | Analyze | 1 | REAL | `{bytes, keys, depth}` JSON size analysis | OK |
| 679 | orch-delay | Orchestrate | 1 | REAL | `{delayed_ms, timestamp}` actual setTimeout delay | OK |
| 680 | orch-retry | Orchestrate | 3 | REAL | `{attempts, succeeded}` retry with backoff | OK |
| 681 | orch-parallel | Orchestrate | 3 | REAL | `{results[]}` parallel API execution | OK |
| 682 | orch-race | Orchestrate | 3 | REAL | `{winner, timing}` race condition -- first to resolve | OK |
| 683 | orch-timeout | Orchestrate | 3 | REAL | `{result, timed_out}` timeout wrapper | OK |
| 684 | orch-cache-get | Orchestrate | 1 | REAL (file) | `{found, key, value}` file-backed cache get | OK |
| 685 | orch-cache-set | Orchestrate | 1 | REAL (file) | `{key, status:'cached'}` file-backed cache set | OK |
| 686 | orch-cache-invalidate | Orchestrate | 1 | REAL (file) | `{status:'invalidated'}` cache invalidation | OK |
| 687 | orch-rate-limit-check | Orchestrate | 1 | REAL (file) | `{allowed, remaining, limit}` rate limit check | OK |
| 688 | orch-rate-limit-consume | Orchestrate | 1 | REAL (file) | `{consumed, remaining, over_limit}` consume rate limit token | OK |
| 689 | orch-lock-acquire | Orchestrate | 1 | REAL (file) | `{acquired, holder, expires_in_seconds}` distributed lock | OK |
| 690 | orch-lock-release | Orchestrate | 1 | REAL (file) | `{released, lock}` lock release | OK |
| 691 | orch-sequence-next | Orchestrate | 1 | REAL (file) | `{value}` monotonic sequence counter | OK |
| 692 | orch-event-emit | Orchestrate | 1 | REAL (file) | `{event_id, emitted}` event emission to file store | OK |
| 693 | orch-event-poll | Orchestrate | 1 | REAL (file) | `{events[]}` poll for events | OK |
| 694 | orch-schedule-once | Orchestrate | 3 | REAL (external) | `{scheduled, fire_at}` one-time scheduled execution | OK |
| 695 | orch-schedule-cancel | Orchestrate | 1 | REAL (file) | `{cancelled}` cancel scheduled execution | OK |
| 696 | orch-health-check | Orchestrate | 3 | REAL (external) | `{status, latency}` HTTP health check | OK |
| 697 | orch-circuit-breaker-check | Orchestrate | 1 | REAL (file) | `{state, failure_count}` circuit breaker state check | OK |
| 698 | orch-circuit-breaker-record | Orchestrate | 1 | REAL (file) | `{recorded, new_state}` record success/failure | OK |
| 699 | net-whois | Network & DNS | 3 | REAL (external) | `{registrar, created, expires}` WHOIS lookup | OK |
| 700 | sense-ct-logs | Sense: Web | 3 | REAL (external) | `{certificates[]}` Certificate Transparency log query | OK |
| 701 | sense-subdomains | Sense: Web | 5 | REAL (external) | `{subdomains[]}` subdomain enumeration via CT logs | OK |
| 702 | memory-time-capsule | Memory | 0 | REAL (SQLite) | `{capsule_id, opens_at}` time-locked memory capsule | OK |
| 703 | army-deploy | Agent Tools | 3 | REAL | `{deployment_id, agents[], strategy}` agent army deployment | OK |
| 704 | army-simulate | Agent Tools | 5 | REAL | `{results[], winner}` army battle simulation | OK |
| 705 | army-survey | Agent Tools | 1 | REAL | `{survey_id, responses[]}` agent survey | OK |
| 706 | army-quick-poll | Agent Tools | 1 | REAL | `{poll_id, results{}}` quick poll | OK |
| 707 | hive-create | Agent Tools | 1 | REAL (SQLite) | `{hive_id, members[]}` hive mind creation | OK |
| 708 | hive-send | Agent Tools | 1 | REAL (SQLite) | `{sent, hive_id}` send message to hive | OK |
| 709 | hive-sync | Agent Tools | 1 | REAL (SQLite) | `{messages[]}` sync hive messages | OK |
| 710 | hive-standup | Agent Tools | 1 | REAL (SQLite) | `{standup{}}` hive standup summary | OK |
| 711 | broadcast | Agent Tools | 1 | REAL (SQLite) | `{broadcast_id, recipients}` broadcast message | OK |
| 712 | broadcast-poll | Agent Tools | 1 | REAL (SQLite) | `{responses[]}` poll broadcast responses | OK |
| 713 | standup-submit | Agent Tools | 1 | REAL (SQLite) | `{standup_id, submitted}` submit standup update | OK |
| 714 | standup-streaks | Agent Tools | 1 | REAL (SQLite) | `{streak, longest}` standup streak tracking | OK |
| 715 | reputation-rate | Agent Tools | 1 | REAL (SQLite) | `{rating, updated}` rate agent reputation | OK |
| 716 | session-save | Agent Tools | 1 | REAL (SQLite) | `{session_id, saved}` save session state | OK |
| 717 | branch-create | Agent Tools | 1 | REAL (SQLite) | `{branch_id, parent}` create decision branch | OK |
| 718 | failure-log | Agent Tools | 1 | REAL (SQLite) | `{log_id, failure}` log failure for learning | OK |
| 719 | ab-create | Agent Tools | 1 | REAL (SQLite) | `{experiment_id, variants[]}` A/B test creation | OK |
| 720 | knowledge-add | Agent Tools | 1 | REAL (SQLite) | `{node_id, added}` add knowledge graph node | OK |
| 721 | knowledge-walk | Agent Tools | 1 | REAL (SQLite) | `{path[], nodes[]}` walk knowledge graph | OK |
| 722 | knowledge-path | Agent Tools | 1 | REAL (SQLite) | `{path[], distance}` shortest path in knowledge graph | OK |
| 723 | consciousness-think | Agent Tools | 0 | REAL | `{thought, depth}` meta-cognitive thinking | OK |
| 724 | existential | Agent Tools | 0 | REAL | `{response}` existential reflection | OK |
| 725 | void | Agent Tools | 0 | REAL | `{void:'acknowledged'}` void endpoint -- intentionally minimal | OK |
| 726 | void-echo | Agent Tools | 0 | REAL | `{echo}` echo input back | OK |
| 727 | random-int | Generate | 1 | REAL | `{value}` crypto.randomBytes-based random integer | OK |
| 728 | random-float | Generate | 1 | REAL | `{value}` random float | OK |
| 729 | random-choice | Generate | 1 | REAL | `{choice}` random selection from list | OK |
| 730 | random-shuffle | Generate | 1 | REAL | `{shuffled[]}` Fisher-Yates shuffle | OK |
| 731 | random-sample | Generate | 1 | REAL | `{sample[]}` random sample from array | OK |
| 732 | form-create | Agent Tools | 1 | REAL (SQLite) | `{form_id, fields[]}` form creation | OK |
| 733 | form-submit | Agent Tools | 1 | REAL (SQLite) | `{submission_id}` form submission | OK |
| 734 | form-results | Agent Tools | 1 | REAL (SQLite) | `{submissions[]}` form results | OK |
| 735 | approval-request | Agent Tools | 1 | REAL (SQLite) | `{request_id, status:'pending'}` approval request | OK |
| 736 | approval-decide | Agent Tools | 1 | REAL (SQLite) | `{request_id, decision}` approval decision | OK |
| 737 | approval-status | Agent Tools | 1 | REAL (SQLite) | `{status, request_id}` approval status check | OK |
| 738 | ticket-create | Agent Tools | 1 | REAL (SQLite) | `{ticket_id, status:'open'}` ticket creation | OK |
| 739 | ticket-update | Agent Tools | 1 | REAL (SQLite) | `{ticket_id, updated}` ticket update | OK |
| 740 | ticket-list | Agent Tools | 1 | REAL (SQLite) | `{tickets[]}` list tickets | OK |
| 741 | certification-create | Agent Tools | 1 | REAL (SQLite) | `{cert_id}` certification creation | OK |
| 742 | certification-exam | Agent Tools | 1 | REAL (SQLite) | `{exam_id, score}` certification exam | OK |
| 743 | health-report | Agent Tools | 1 | REAL | `{status, metrics{}}` agent health report | OK |
| 744 | ritual-checkin | Agent Tools | 0 | REAL (SQLite) | `{checkin_id, timestamp}` ritual check-in | OK |
| 745 | crypto-checksum-file | Crypto & Security | 1 | REAL | `{checksum}` file content checksum | OK |
| 746 | date-subtract | Date & Time | 1 | REAL | `{result}` subtract duration from date | OK |
| 747 | date-timezone-convert | Date & Time | 1 | REAL | `{result}` timezone conversion | OK |
| 748 | net-url-build | Network & DNS | 0 | REAL | `{url}` URL builder from components | OK |
| 749 | net-url-normalize | Network & DNS | 0 | REAL | `{normalized}` URL normalization | OK |
| 750 | net-dns-lookup | Network & DNS | 3 | REAL (external) | `{address}` DNS A record lookup | OK |
| 751 | net-url-status | Network & DNS | 3 | REAL (external) | `{statusCode}` HTTP status check | OK |
| 752 | net-url-headers | Network & DNS | 3 | REAL (external) | `{headers{}}` fetch HTTP headers | OK |
| 753 | net-url-redirect-chain | Network & DNS | 3 | REAL (external) | `{chain[]}` redirect chain follow | OK |
| 754 | net-ip-info | Network & DNS | 3 | REAL (external) | `{country, org}` IP info lookup | OK |
| 755 | net-dns-cname | Network & DNS | 3 | REAL (external) | `{cname}` DNS CNAME lookup | OK |
| 756 | net-dns-reverse | Network & DNS | 3 | REAL (external) | `{hostname}` reverse DNS lookup | OK |
| 757 | net-http-options | Network & DNS | 3 | REAL (external) | `{allow, cors}` HTTP OPTIONS request | OK |
| 758 | net-ssl-expiry | Network & DNS | 3 | REAL (external) | `{expires, days_remaining}` SSL certificate expiry | OK |
| 759 | net-ip-is-private | Network & DNS | 0 | REAL | `{private}` private IP range check | OK |
| 760 | net-domain-validate | Network & DNS | 1 | REAL | `{valid}` domain name validation regex | OK |
| 761 | gen-qr-data | Communicate | 1 | REAL | `{data}` QR code data encoding | OK |
| 762 | gen-fake-uuid | Generate | 0 | REAL | `{uuid}` UUID v4 generation | OK |
| 763 | gen-fake-date | Generate | 0 | RANDOM (needs fix) | `{date}` random date generation | Math.random() for date range |
| 764 | gen-fake-sentence | Generate | 0 | RANDOM (needs fix) | `{sentence}` random sentence | Math.random() for word selection |
| 765 | gen-fake-paragraph | Generate | 0 | RANDOM (needs fix) | `{paragraph}` random paragraph | Math.random() for sentence assembly |
| 766 | gen-slug | Generate | 0 | REAL | `{slug}` text to URL slug | OK |
| 767 | temporal-fork | Temporal Engineering | 0 | REAL | `{branches[], best_branch}` deterministic branch scoring via action hash | OK |
| 768 | causal-rewind | Temporal Engineering | 0 | REAL | `{root_cause_candidate, rollback_point}` causal event analysis | OK |
| 769 | deadline-pressure-field | Temporal Engineering | 0 | REAL | `{tasks[], note}` deadline pressure reordering | OK |
| 770 | temporal-echo-detect | Temporal Engineering | 0 | REAL | `{loop_detected, cycle_length}` action loop detection | OK |
| 771 | chronological-debt-ledger | Temporal Engineering | 0 | REAL | `{debts[], critical_count}` technical debt aging | OK |
| 772 | event-horizon-scheduler | Temporal Engineering | 0 | REAL | `{schedule[]}` priority-weighted scheduling | OK |
| 773 | retrocausal-hint | Temporal Engineering | 0 | REAL | `{best_next_action, confidence}` reverse planning from desired state | OK |
| 774 | temporal-diff-merge | Temporal Engineering | 0 | REAL | `{merged{}, conflicts[]}` three-way merge | OK |
| 775 | cognitive-load-balancer | Cognitive Architecture | 0 | REAL | `{assignments[], load_balance}` task cognitive load balancing | OK |
| 776 | attention-spotlight | Cognitive Architecture | 0 | REAL | `{focused[], filtered[]}` attention focusing/filtering | OK |
| 777 | metacognitive-audit | Cognitive Architecture | 0 | REAL | `{audit, blind_spots[]}` metacognitive self-audit | OK |
| 778 | reasoning-scaffold | Cognitive Architecture | 0 | REAL | `{scaffold[], steps}` reasoning framework generation | OK |
| 779 | cognitive-dissonance-detector | Cognitive Architecture | 0 | REAL | `{dissonances[], severity}` belief conflict detection | OK |
| 780 | focus-drift-compass | Cognitive Architecture | 0 | REAL | `{drift, direction, correction}` focus drift detection | OK |
| 781 | dunning-kruger-calibrator | Cognitive Architecture | 0 | REAL | `{estimated, calibrated, bias}` confidence calibration | OK |
| 782 | mental-model-clash | Cognitive Architecture | 0 | REAL | `{clashes[], resolution}` mental model conflict analysis | OK |
| 783 | swarm-consensus-vote | Swarm Intelligence | 0 | REAL | `{consensus, votes{}}` swarm voting consensus | OK |
| 784 | stigmergy-blackboard | Swarm Intelligence | 0 | REAL (SQLite) | `{messages[], active}` stigmergic blackboard | OK |
| 785 | flocking-alignment | Swarm Intelligence | 0 | REAL | `{alignment, heading}` Boids-style alignment vector | OK |
| 786 | ant-colony-path-rank | Swarm Intelligence | 0 | REAL | `{paths[], best}` ant colony path optimization | OK |
| 787 | emergence-detector | Swarm Intelligence | 0 | REAL | `{emergent_properties[], complexity}` emergence detection | OK |
| 788 | swarm-role-crystallize | Swarm Intelligence | 0 | REAL | `{roles{}}` role crystallization from behavior | OK |
| 789 | collective-memory-distill | Swarm Intelligence | 0 | REAL | `{distilled, key_themes[]}` collective memory summarization | OK |
| 790 | quorum-sensing-trigger | Swarm Intelligence | 0 | REAL | `{quorum_reached, threshold}` quorum sensing | OK |
| 791 | perspective-warp | Dimensional Analysis | 0 | REAL | `{warped, lens}` perspective transformation | OK |
| 792 | dimensional-collapse | Dimensional Analysis | 0 | REAL | `{collapsed, dimensions_removed}` dimensionality reduction | OK |
| 793 | cross-domain-bridge | Dimensional Analysis | 0 | REAL | `{bridge, mappings[]}` cross-domain concept mapping | OK |
| 794 | scale-shift-lens | Dimensional Analysis | 0 | REAL | `{micro, macro, shift}` scale shifting analysis | OK |
| 795 | flatland-projection | Dimensional Analysis | 0 | REAL | `{projection, lost_dimensions}` dimensional projection | OK |
| 796 | abstraction-ladder | Dimensional Analysis | 0 | REAL | `{levels[], current}` abstraction level navigation | OK |
| 797 | inverse-dimension-map | Dimensional Analysis | 0 | REAL | `{inverted{}}` inverse mapping | OK |
| 798 | dimension-gate-filter | Dimensional Analysis | 0 | REAL | `{passed[], filtered[]}` dimensional filtering | OK |
| 799 | entropy-gauge | Information Theory | 0 | REAL | `{entropy, bits}` Shannon entropy calculation | OK |
| 800 | information-bottleneck | Information Theory | 0 | REAL | `{compressed, information_loss}` information bottleneck analysis | OK |

---

## CHUNK 3: Endpoints 801-1255

| # | Slug | Category | Credits | GUTS | EXPECTED OUTPUT | LEGENDARY STATUS |
|---|------|----------|---------|------|-----------------|------------------|
| 801 | noise-signal-separator | Information Theory | 0 | REAL | `{signal, noise, snr}` signal-noise ratio analysis | OK |
| 802 | redundancy-compressor | Information Theory | 0 | REAL | `{compressed, redundancy_ratio}` redundancy detection/removal | OK |
| 803 | surprise-index | Information Theory | 0 | REAL | `{surprise, expected}` information surprise/self-information calculation | OK |
| 804 | context-parallax | Dimensional Analysis | 0 | REAL | `{views[], parallax}` multi-viewpoint context analysis | OK |
| 805 | trust-decay-curve | Reputation Economics | 0 | REAL | `{initial, current, decay_rate, needs_refresh}` exponential trust decay (half-life) | OK |
| 806 | credibility-arbitrage | Reputation Economics | 0 | REAL | `{opportunities[], count}` cross-domain credibility gap analysis | OK |
| 807 | reputation-stake-escrow | Reputation Economics | 0 | REAL | `{stake_required, projected_gain, projected_loss}` reputation staking math | OK |
| 808 | influence-liquidity-score | Reputation Economics | 0 | REAL | `{liquidity_score, friction, transferability}` influence liquidity calc | OK |
| 809 | sybil-resistance-proof | Reputation Economics | 0 | REAL | `{uniqueness_score, likely_sybil, confidence}` sybil resistance scoring | OK |
| 810 | trust-triangulation | Reputation Economics | 0 | REAL | `{direct_trust, implied_trust, inconsistency, suspicious}` trust chain analysis | OK |
| 811 | social-collateral-ratio | Reputation Economics | 0 | REAL | `{earned, leveraged, ratio, risk_level}` collateral ratio | OK |
| 812 | merit-half-life | Reputation Economics | 0 | REAL | `{accomplishments[], total_present_value}` merit decay with domain-specific half-lives | OK |
| 813 | threat-model-generator | Adversarial Thinking | 0 | REAL | `{threats[], mitigations[]}` STRIDE-style threat modeling | OK |
| 814 | counter-argument-generator | Agent Superpowers | 0 | REAL | `{counter_arguments[]}` counter-argument generation | OK |
| 815 | chaos-blast-radius | Adversarial Thinking | 0 | REAL | `{affected[], radius, severity}` blast radius estimation | OK |
| 816 | pre-mortem-autopsy | Adversarial Thinking | 0 | REAL | `{failures[], root_causes[]}` pre-mortem failure analysis | OK |
| 817 | weakest-link-finder | Adversarial Thinking | 0 | REAL | `{weakest, chain[]}` weakest link identification | OK |
| 818 | security-persona-model | Auth & Security | 0 | REAL | `{personas[], threats{}}` security persona modeling | OK |
| 819 | assumption-stress-test | Adversarial Thinking | 0 | REAL | `{results[], failures}` assumption stress testing | OK |
| 820 | plot-twist-injector | Narrative Intelligence | 0 | DETERMINISTIC-HASH | `{twist, impact}` plot twist generation via hash | OK |
| 821 | dramatic-tension-curve | Narrative Intelligence | 0 | REAL | `{curve[], climax_point}` tension curve analysis | OK |
| 822 | character-arc-trajectory | Narrative Intelligence | 0 | REAL | `{arc, stages[]}` character arc mapping | OK |
| 823 | chekhov-gun-tracker | Narrative Intelligence | 0 | REAL | `{guns[], unfired[]}` setup/payoff tracking | OK |
| 824 | unreliable-narrator-score | Narrative Intelligence | 0 | REAL | `{score, inconsistencies[]}` narrator reliability scoring | OK |
| 825 | story-beat-decomposer | Narrative Intelligence | 0 | REAL | `{beats[]}` story beat breakdown | OK |
| 826 | emotional-resonance-calc | Narrative Intelligence | 0 | REAL | `{resonance, peaks[]}` emotional resonance analysis | OK |
| 827 | antagonist-motivation-engine | Narrative Intelligence | 0 | REAL | `{motivations[], primary}` antagonist motivation modeling | OK |
| 828 | synesthesia-mapper | Sensory Simulation | 0 | DETERMINISTIC-HASH | `{mappings{}}` cross-sensory mapping via hash | OK |
| 829 | signal-noise-separator | Sensory Simulation | 0 | REAL | `{signal, noise, ratio}` signal extraction | OK |
| 830 | pattern-pareidolia | Sensory Simulation | 0 | DETERMINISTIC-HASH | `{patterns_found[]}` pattern detection in noise | OK |
| 831 | sensory-overload-filter | Sensory Simulation | 0 | REAL | `{filtered, removed}` information overload filtering | OK |
| 832 | phantom-signal-detector | Sensory Simulation | 0 | REAL | `{phantoms[], false_positives}` false signal detection | OK |
| 833 | perceptual-contrast-boost | Sensory Simulation | 0 | REAL | `{boosted, contrast_ratio}` contrast enhancement | OK |
| 834 | edge-detection-abstract | Sensory Simulation | 0 | REAL | `{edges[], boundaries}` abstract boundary detection | OK |
| 835 | tribe-formation-seed | Group Dynamics | 0 | REAL | `{tribe, identity_markers[]}` tribe formation seeding | OK |
| 836 | initiation-rite-generator | Group Dynamics | 0 | DETERMINISTIC-HASH | `{rite, stages[]}` initiation rite generation | OK |
| 837 | totem-synthesizer | Group Dynamics | 0 | DETERMINISTIC-HASH | `{totem, symbolism}` group totem creation | OK |
| 838 | schism-predictor | Group Dynamics | 0 | REAL | `{risk, fault_lines[]}` group schism risk assessment | OK |
| 839 | sacred-value-detector | Group Dynamics | 0 | REAL | `{sacred_values[], non_negotiable}` sacred value identification | OK |
| 840 | cooperation-stability-index | Agent Superpowers | 0 | REAL | `{stability, factors{}}` cooperation stability scoring | OK |
| 841 | group-polarization-drift | Group Dynamics | 0 | REAL | `{drift, direction, extremity}` group polarization tracking | OK |
| 842 | free-rider-detector | Group Dynamics | 0 | REAL | `{free_riders[], contribution_ratio}` free rider detection | OK |
| 843 | ritual-frequency-optimizer | Group Dynamics | 0 | REAL | `{optimal_frequency, current}` ritual frequency optimization | OK |
| 844 | coalition-stability-index | Group Dynamics | 0 | REAL | `{stability, weakest_link}` coalition stability analysis | OK |
| 845 | fog-of-war-simulator | Strategic Warfare | 0 | REAL | `{visibility{}, hidden_count}` fog of war with Euclidean distance sight | OK |
| 846 | supply-line-vulnerability | Strategic Warfare | 0 | REAL | `{bottleneck, min_cut_capacity, vulnerability}` supply chain analysis | OK |
| 847 | bluff-credibility-scorer | Strategic Warfare | 0 | REAL | `{honesty_rate, bluff_rate, optimal_call_threshold}` bluff analysis from history | OK |
| 848 | pincer-movement-planner | Strategic Warfare | 0 | REAL | `{maneuver, paths[], encirclement_ratio}` tactical movement planning | OK |
| 849 | attrition-war-projector | Strategic Warfare | 0 | REAL | `{log[], winner, final{}}` Lanchester attrition model simulation | OK |
| 850 | resource-denial-analyzer | Agent Superpowers | 0 | REAL | `{deny_order[], value_denied, enemy_impact}` resource denial strategy | OK |
| 851 | deterrence-stability-index | Strategic Warfare | 0 | REAL | `{stability, first_strike_advantage}` deterrence stability analysis | OK |
| 852 | nash-equilibrium-finder | Strategic Warfare | 0 | REAL | `{equilibria[], dominant_strategies}` Nash equilibrium computation | OK |
| 853 | carrying-capacity-estimator | Ecosystem Engineering | 0 | REAL | `{capacity, current_load, ratio}` carrying capacity estimation | OK |
| 854 | trophic-cascade-simulator | Ecosystem Engineering | 0 | REAL | `{levels[], cascade_effect}` trophic cascade simulation | OK |
| 855 | keystone-species-detector | Ecosystem Engineering | 0 | REAL | `{keystone, dependency_count}` keystone entity detection | OK |
| 856 | invasive-spread-modeler | Ecosystem Engineering | 0 | REAL | `{spread_map[], timeline}` invasive spread modeling | OK |
| 857 | biodiversity-index-calculator | Ecosystem Engineering | 0 | REAL | `{shannon_index, simpson_index}` biodiversity index calculation | OK |
| 858 | symbiosis-network-analyzer | Ecosystem Engineering | 0 | REAL | `{relationships[], mutualism_count}` symbiosis network analysis | OK |
| 859 | terraforming-phase-planner | Ecosystem Engineering | 0 | REAL | `{phases[], timeline}` terraforming/transformation planning | OK |
| 860 | idea-virality-predictor | Information Propagation | 0 | REAL | `{virality_score, factors{}}` virality prediction scoring | OK |
| 861 | belief-propagation-simulator | Information Propagation | 0 | REAL | `{final_beliefs{}, iterations}` belief propagation simulation | OK |
| 862 | counter-narrative-generator | Information Propagation | 0 | REAL | `{counter_narratives[]}` counter-narrative generation | OK |
| 863 | memetic-immunity-profiler | Information Propagation | 0 | REAL | `{immunity_score, vulnerabilities[]}` memetic immunity profiling | OK |
| 864 | overton-window-mapper | Information Propagation | 0 | REAL | `{window, positions{}}` Overton window mapping | OK |
| 865 | echo-chamber-detector | Information Propagation | 0 | REAL | `{echo_score, diversity}` echo chamber detection | OK |
| 866 | dream-level-stabilizer | State Management | 0 | REAL | `{stability, level, adjustments[]}` dream level stability management | OK |
| 867 | nightmare-pattern-detector | State Management | 0 | REAL | `{patterns[], severity}` negative pattern detection | OK |
| 868 | dream-exit-pathfinder | State Management | 0 | REAL | `{exit_paths[], recommended}` exit path finding | OK |
| 869 | shared-unconscious-merger | State Management | 0 | REAL | `{merged, common_themes[]}` shared unconscious merging | OK |
| 870 | lucid-trigger-calibrator | State Management | 0 | REAL | `{triggers[], calibration}` lucidity trigger calibration | OK |
| 871 | dream-time-dilation-calculator | State Management | 0 | REAL | `{subjective_time, objective_time, ratio}` time dilation calculation | OK |
| 872 | dream-architect-blueprint | State Management | 0 | REAL | `{blueprint, layers[]}` dream architecture planning | OK |
| 873 | loophole-scanner | Process Optimization | 0 | REAL | `{loopholes[], severity}` process loophole scanning | OK |
| 874 | red-tape-critical-path | Process Optimization | 0 | REAL | `{critical_path[], bottleneck}` bureaucratic critical path | OK |
| 875 | compliance-shortcut-router | Process Optimization | 0 | REAL | `{shortcuts[], savings}` compliant shortcut identification | OK |
| 876 | bureaucratic-deadlock-breaker | Process Optimization | 0 | REAL | `{resolution, strategy}` deadlock resolution | OK |
| 877 | appeals-strategy-optimizer | Process Optimization | 0 | REAL | `{strategy, success_probability}` appeals strategy optimization | OK |
| 878 | sunset-clause-exploiter | Process Optimization | 0 | REAL | `{expiring[], opportunities[]}` sunset clause identification | OK |
| 879 | form-dependency-resolver | Process Optimization | 0 | REAL | `{order[], dependencies{}}` form dependency resolution | OK |
| 880 | rubber-stamp-probability | Process Optimization | 0 | REAL | `{probability, factors{}}` approval probability estimation | OK |
| 881 | jurisdiction-arbitrage-finder | Process Optimization | 0 | REAL | `{opportunities[], best}` jurisdiction comparison | OK |
| 882 | committee-consensus-predictor | Process Optimization | 0 | REAL | `{consensus_probability, swing_members}` consensus prediction | OK |
| 883 | regulatory-capture-scorer | Process Optimization | 0 | REAL | `{score, indicators[]}` regulatory capture assessment | OK |
| 884 | mood-decay-curve | Sentiment Modeling | 0 | REAL | `{initial, current, baseline, hours_to_baseline}` mood decay via half-life | OK |
| 885 | empathy-bridge-score | Sentiment Modeling | 0 | REAL | `{compatibility, adjustments[]}` personality compatibility scoring | OK |
| 886 | catharsis-threshold | Sentiment Modeling | 0 | REAL | `{cumulative_tension, threshold, catharsis_imminent}` tension threshold | OK |
| 887 | emotional-contagion-spread | Sentiment Modeling | 0 | REAL | `{final_moods{}, spread_ratio}` emotional contagion network simulation | OK |
| 888 | sentiment-inertia | Sentiment Modeling | 0 | REAL | `{current, result, shift, momentum}` sentiment inertia physics | OK |
| 889 | affective-contrast-ratio | Sentiment Modeling | 0 | REAL | `{contrast_ratio, perceptible, dramatic}` emotional contrast measurement | OK |
| 890 | concept-fusion-reactor | Knowledge Processing | 0 | REAL | `{fusion, emergent_properties[]}` concept combination | OK |
| 891 | insight-crystallize | Knowledge Processing | 0 | REAL | `{crystal, facets[]}` insight crystallization | OK |
| 892 | wisdom-half-life | Knowledge Processing | 0 | REAL | `{current_value, half_life}` wisdom decay modeling | OK |
| 893 | eureka-detector | Knowledge Processing | 0 | REAL | `{eureka, conditions_met}` eureka moment detection | OK |
| 894 | knowledge-compost | Knowledge Processing | 0 | REAL | `{composted, nutrients[]}` knowledge decomposition for reuse | OK |
| 895 | analogy-forge | Knowledge Processing | 0 | REAL | `{analogies[], best}` analogy generation | OK |
| 896 | paradox-resolver | Knowledge Processing | 0 | REAL | `{resolution, strategy}` paradox resolution approaches | OK |
| 897 | question-sharpener | Knowledge Processing | 0 | REAL | `{sharpened, clarity_score}` question refinement | OK |
| 898 | behavioral-fossil-extract | Behavioral Analysis | 0 | REAL | `{fossils[], patterns[]}` behavioral pattern extraction | OK |
| 899 | artifact-carbon-date | Behavioral Analysis | 0 | REAL | `{age_estimate, confidence}` artifact age estimation | OK |
| 900 | legacy-intent-recover | Behavioral Analysis | 0 | REAL | `{intent, evidence[]}` original intent recovery | OK |
| 901 | decision-fossil-record | Behavioral Analysis | 0 | REAL | `{record[], layers}` decision history layering | OK |
| 902 | cultural-drift-velocity | Behavioral Analysis | 0 | REAL | `{velocity, direction}` cultural change velocity | OK |
| 903 | ruin-reconstructor | Behavioral Analysis | 0 | REAL | `{reconstruction, missing_pieces}` system reconstruction from fragments | OK |
| 904 | idea-momentum | Physics Simulation | 0 | REAL | `{momentum, velocity, mass}` idea momentum physics | OK |
| 905 | scope-creep-friction | Physics Simulation | 0 | REAL | `{friction, deceleration}` scope creep friction modeling | OK |
| 906 | consensus-pendulum | Physics Simulation | 0 | REAL | `{position, period, amplitude}` opinion oscillation modeling | OK |
| 907 | burnout-thermodynamics | Physics Simulation | 0 | REAL | `{temperature, entropy, warning}` burnout thermodynamic model | OK |
| 908 | attention-orbital-decay | Cognitive Architecture | 0 | REAL | `{orbit, decay_rate, reentry_time}` attention orbital decay | OK |
| 909 | decision-spring-constant | Physics Simulation | 0 | REAL | `{spring_constant, displacement}` decision elasticity | OK |
| 910 | argument-elastic-collision | Physics Simulation | 0 | REAL | `{outcome_a, outcome_b}` argument collision physics | OK |
| 911 | priority-gravity-well | Physics Simulation | 0 | REAL | `{wells[], strongest}` priority gravity well modeling | OK |
| 912 | workflow-rhythm-score | Musical Intelligence | 0 | REAL | `{tempo, score, regularity}` workflow rhythm analysis | OK |
| 913 | crescendo-detector | Musical Intelligence | 0 | REAL | `{crescendo, peak, intensity_curve}` crescendo/build-up detection | OK |
| 914 | counterpoint-scheduler | Musical Intelligence | 0 | REAL | `{schedule[], harmony}` counterpoint-style parallel scheduling | OK |
| 915 | cadence-predictor | Musical Intelligence | 0 | REAL | `{predicted_cadence, confidence}` workflow cadence prediction | OK |
| 916 | motif-extractor | Musical Intelligence | 0 | REAL | `{motifs[], recurring}` recurring pattern/motif extraction | OK |
| 917 | tempo-rubato-adjuster | Musical Intelligence | 0 | REAL | `{adjusted, flexibility}` tempo flexibility adjustment | OK |
| 918 | polyrhythm-workload | Musical Intelligence | 0 | REAL | `{polyrhythm, beats[], alignment}` multi-rhythm workload overlay | OK |
| 919 | dynamics-envelope | Musical Intelligence | 0 | REAL | `{attack, decay, sustain, release}` ADSR dynamics envelope | OK |
| 920 | harmonic-series-rank | Musical Intelligence | 0 | REAL | `{harmonics[], fundamental}` harmonic series ranking | OK |
| 921 | team-harmony-analyzer | Musical Intelligence | 0 | REAL | `{harmony_score, dissonances[]}` team harmony analysis | OK |
| 922 | sla-enforce | Enterprise Ops | 0 | REAL | `{results[], all_passed, violations}` SLA rule enforcement | OK |
| 923 | capacity-forecast | Enterprise Ops | 0 | REAL | `{current, ceiling, growth_per_period, periods_until_ceiling}` linear capacity forecast | OK |
| 924 | runbook-execute | Enterprise Ops | 0 | REAL | `{matched_rule, action}` safe condition-based runbook execution | OK -- CRIT-02 security fix applied |
| 925 | incident-timeline | Enterprise Ops | 0 | REAL | `{timeline[], root_cause_candidate}` incident event timeline | OK |
| 926 | compliance-check | Enterprise Ops | 0 | REAL | `{results[], compliant, violations}` compliance rule checking | OK |
| 927 | retry-policy-calc | Enterprise Ops | 0 | REAL | `{schedule[]}` retry schedule with exponential/linear backoff + jitter | OK |
| 928 | cost-attribution | Enterprise Ops | 0 | REAL | `{attributions{}}` cost attribution by entity | OK |
| 929 | change-risk-score | Enterprise Ops | 0 | REAL | `{score, factors[]}` change risk scoring | OK |
| 930 | canary-analysis | Enterprise Ops | 0 | REAL | `{safe, metrics_comparison}` canary deployment analysis | OK |
| 931 | dependency-criticality | Enterprise Ops | 0 | REAL | `{ranked[], critical}` dependency criticality ranking | OK |
| 932 | audit-log-hash | Enterprise Ops | 0 | REAL | `{hash, chain}` tamper-evident audit log hashing | OK |
| 933 | rate-limit-calc | Enterprise Ops | 0 | REAL | `{tokens, refill_rate}` token bucket calculation | OK |
| 934 | rollback-plan | Enterprise Ops | 0 | REAL | `{steps[], checkpoints[]}` rollback plan generation | OK |
| 935 | resource-bin-pack | Enterprise Ops | 0 | REAL | `{bins[], utilization}` bin packing optimization | OK |
| 936 | alert-dedup | Enterprise Ops | 0 | REAL | `{unique[], duplicates_removed}` alert deduplication | OK |
| 937 | config-drift-detect | Enterprise Ops | 0 | REAL | `{drifts[], severity}` configuration drift detection | OK |
| 938 | mttr-calculate | Enterprise Ops | 0 | REAL | `{mttr, incidents}` mean time to recovery calculation | OK |
| 939 | token-bucket-sim | Enterprise Ops | 0 | REAL | `{tokens_remaining, refill_schedule}` token bucket simulation | OK |
| 940 | chaos-schedule | Enterprise Ops | 0 | REAL | `{schedule[], next}` chaos engineering schedule | OK |
| 941 | ab-test-eval | Growth & Analytics | 0 | REAL | `{winner, significance, lift}` A/B test evaluation | OK |
| 942 | nps-calculate | Growth & Analytics | 0 | REAL | `{nps, promoters, detractors}` Net Promoter Score calculation | OK |
| 943 | cohort-analyze | Growth & Analytics | 0 | REAL | `{cohorts[], retention}` cohort retention analysis | OK |
| 944 | funnel-analyze | Growth & Analytics | 0 | REAL | `{stages[], dropoff[], overall_conversion}` funnel analysis | OK |
| 945 | viral-coefficient | Growth & Analytics | 0 | REAL | `{k_factor, viral}` viral coefficient calculation | OK |
| 946 | churn-predict | Growth & Analytics | 0 | REAL | `{churn_probability, risk_factors[]}` churn prediction scoring | OK |
| 947 | feature-prioritize | Growth & Analytics | 0 | REAL | `{ranked[], method}` feature prioritization (RICE/ICE) | OK |
| 948 | changelog-format | Growth & Analytics | 0 | REAL | `{formatted}` changelog formatting (Keep a Changelog) | OK |
| 949 | demo-data-gen | Growth & Analytics | 0 | RANDOM (needs fix) | `{data[]}` demo dataset generation | Math.random() for data generation |
| 950 | growth-metric-dash | Growth & Analytics | 0 | REAL | `{metrics{}}` growth metric dashboard calculation | OK |
| 951 | referral-code-gen | Growth & Analytics | 0 | REAL | `{code}` referral code generation via crypto | OK |
| 952 | competitor-matrix | Growth & Analytics | 0 | REAL | `{matrix, comparison{}}` competitor comparison matrix | OK |
| 953 | landing-page-audit | Growth & Analytics | 0 | REAL | `{score, issues[], recommendations[]}` landing page audit heuristics | OK |
| 954 | onboarding-score | Growth & Analytics | 0 | REAL | `{score, completion, suggestions[]}` onboarding completion scoring | OK |
| 955 | stripe-price-calc | Growth & Analytics | 0 | REAL | `{price, fees, net}` Stripe pricing calculation | OK |
| 956 | social-proof-gen | Growth & Analytics | 0 | TEMPLATE | `{social_proof}` social proof snippet generation | OK |
| 957 | pricing-table-gen | Growth & Analytics | 0 | REAL | `{table}` pricing table generation from tiers | OK |
| 958 | waitlist-position | Growth & Analytics | 0 | REAL (SQLite) | `{position, total}` waitlist position tracking | OK |
| 959 | launch-countdown | Growth & Analytics | 0 | REAL | `{days, hours, countdown}` launch countdown calculation | OK |
| 960 | benchmark-harness | AI Research | 0 | REAL | `{results[], summary}` benchmark test harness | OK |
| 961 | ablation-score | AI Research | 0 | REAL | `{scores[], impact{}}` ablation study scoring | OK |
| 962 | calibration-curve | AI Research | 0 | REAL | `{curve[], ece}` prediction calibration curve + ECE | OK |
| 963 | confusion-matrix | AI Research | 0 | REAL | `{matrix, precision, recall, f1}` confusion matrix computation | OK |
| 964 | rouge-score | AI Research | 0 | REAL | `{rouge_1, rouge_2, rouge_l}` ROUGE score calculation | OK |
| 965 | bleu-score | AI Research | 0 | REAL | `{bleu}` BLEU score calculation | OK |
| 966 | cosine-similarity | AI Research | 0 | REAL | `{similarity}` cosine similarity of vectors | OK |
| 967 | embedding-cluster | AI Research | 0 | REAL | `{clusters[], centroids[]}` k-means clustering | OK |
| 968 | elo-rating | AI Research | 0 | REAL | `{new_ratings{}}` Elo rating update | OK |
| 969 | hypothesis-test | AI Research | 0 | REAL | `{t_statistic, p_value, significant}` t-test | OK |
| 970 | pareto-frontier | AI Research | 0 | REAL | `{frontier[], dominated[]}` Pareto frontier computation | OK |
| 971 | information-gain | Information Theory | 0 | REAL | `{gain, entropy_before, entropy_after}` information gain calculation | OK |
| 972 | prompt-complexity | AI Research | 0 | REAL | `{score, factors{}}` prompt complexity scoring | OK |
| 973 | response-diversity | AI Research | 0 | REAL | `{diversity, unique_ratio}` response diversity measurement | OK |
| 974 | concept-drift-detect | AI Research | 0 | REAL | `{drift_detected, magnitude}` concept drift detection | OK |
| 975 | reward-shape | AI Research | 0 | REAL | `{shaped_reward, shaping_function}` reward shaping | OK |
| 976 | alignment-tax | AI Research | 0 | REAL | `{tax, performance_impact}` alignment tax estimation | OK |
| 977 | token-attribution | AI Research | 0 | REAL | `{attributions[]}` token importance attribution | OK |
| 978 | xp-level-calc | Game Mechanics | 0 | REAL | `{level, xp_needed, progress}` RPG XP/level calculation | OK |
| 979 | skill-tree-eval | Game Mechanics | 0 | REAL | `{unlocked[], available[], blocked[]}` skill tree evaluation | OK |
| 980 | quest-generate | Game Mechanics | 0 | DETERMINISTIC-HASH | `{quest, objectives[]}` quest generation from input hash | OK |
| 981 | loot-table-roll | Game Mechanics | 0 | DETERMINISTIC-HASH | `{item, rarity}` loot table roll from weighted table | OK |
| 982 | boss-encounter | Game Mechanics | 0 | DETERMINISTIC-HASH | `{boss, difficulty, weakness}` boss encounter generation | OK |
| 983 | achievement-check | Game Mechanics | 0 | REAL | `{unlocked[], progress{}}` achievement condition checking | OK |
| 984 | combo-detect | Game Mechanics | 0 | REAL | `{combo, multiplier}` action combo detection | OK |
| 985 | cooldown-manager | Game Mechanics | 0 | REAL | `{available, remaining_ms}` cooldown timer management | OK |
| 986 | dungeon-generate | Game Mechanics | 0 | DETERMINISTIC-HASH | `{rooms[], connections[], map}` dungeon layout generation | OK |
| 987 | reputation-faction | Game Mechanics | 0 | REAL (SQLite) | `{faction, reputation, rank}` faction reputation tracking | OK |
| 988 | daily-challenge | Game Mechanics | 0 | DETERMINISTIC-HASH | `{challenge, reward}` daily challenge based on date hash | OK |
| 989 | weighted-tier-draw | Agent Superpowers | 0 | DETERMINISTIC-HASH | `{tier, item}` weighted random tier draw | OK |
| 990 | pvp-matchmake | Game Mechanics | 0 | REAL | `{match, rating_diff}` PvP matchmaking by rating | OK |
| 991 | inventory-manage | Game Mechanics | 0 | REAL (SQLite) | `{inventory[], capacity}` inventory management | OK |
| 992 | battle-resolve | Game Mechanics | 0 | REAL | `{winner, log[]}` turn-based battle resolution | OK |
| 993 | world-event-roll | Game Mechanics | 0 | DETERMINISTIC-HASH | `{event, effects[]}` world event based on hash | OK |
| 994 | trolley-problem | Philosophy | 0 | REAL | `{scenario, analysis{}, frameworks{}}` trolley problem analysis | OK |
| 995 | value-alignment-score | Philosophy | 0 | REAL | `{score, aligned[], misaligned[]}` value alignment scoring | OK |
| 996 | consciousness-index | Philosophy | 0 | REAL | `{index, factors{}}` consciousness assessment | OK |
| 997 | moral-foundation | Philosophy | 0 | REAL | `{foundations{}}` Moral Foundations Theory scoring | OK |
| 998 | veil-of-ignorance | Philosophy | 0 | REAL | `{analysis, fairness_score}` Rawlsian fairness analysis | OK |
| 999 | categorical-imperative | Philosophy | 0 | REAL | `{universalizable, analysis}` Kantian categorical imperative test | OK |
| 1000 | wisdom-score | Philosophy | 0 | REAL | `{score, dimensions{}}` multi-dimensional wisdom scoring | OK |
| 1001 | ikigai-map | Philosophy | 0 | REAL | `{map, overlaps{}, ikigai}` ikigai quadrant mapping | OK |
| 1002 | first-principles-decompose | Philosophy | 0 | REAL | `{principles[], decomposition[]}` first-principles breakdown | OK |
| 1003 | coherence-check | Philosophy | 0 | REAL | `{coherent, contradictions[]}` belief coherence checking | OK |
| 1004 | thought-experiment | Philosophy | 0 | REAL | `{experiment, variables[], implications[]}` thought experiment framework | OK |
| 1005 | eudaimonia-check | Philosophy | 0 | REAL | `{score, dimensions{}}` eudaimonia/flourishing assessment | OK |
| 1006 | moral-weight | Philosophy | 0 | REAL | `{weight, factors{}}` moral weight calculation | OK |
| 1007 | existential-risk-eval | Philosophy | 0 | REAL | `{risk, severity, probability}` existential risk evaluation | OK |
| 1008 | meaning-extract | Philosophy | 0 | REAL | `{meaning, layers[]}` meaning extraction | OK |
| 1009 | socratic-dialogue | Philosophy | 0 | REAL | `{questions[], depth}` Socratic dialogue generation | OK |
| 1010 | autonomy-audit | Philosophy | 0 | REAL | `{score, constraints[]}` autonomy assessment | OK |
| 1011 | stewardship-score | Philosophy | 0 | REAL | `{score, areas{}}` stewardship scoring | OK |
| 1012 | paradox-navigate | Philosophy | 0 | REAL | `{paradox, strategies[]}` paradox navigation strategies | OK |
| 1013 | memento-mori | Philosophy | 0 | REAL | `{reflection, urgency}` memento mori reflection | OK |
| 1014 | schema-enforce | Structured Output | 0 | REAL | `{valid, errors[], error_count}` JSON Schema enforcement with type/pattern/range checks | OK |
| 1015 | schema-generate-from-sample | Structured Output | 0 | REAL | `{schema, sample_count, fields}` JSON Schema generation from samples | OK |
| 1016 | structured-output-repair | Structured Output | 0 | REAL | `{repaired, result, repaired_text}` broken JSON repair (trailing commas, quotes, etc) | OK |
| 1017 | context-window-estimate | Context Management | 0 | REAL | `{tokens, model, fits}` token count estimation per model (~4 chars/token) | OK |
| 1018 | context-window-summarize | Context Management | 0 | REAL | `{summary, original_tokens, compressed_tokens}` context compression | OK |
| 1019 | data-schema-map | Data Operations | 0 | REAL | `{mapping{}, fields[]}` data schema mapping | OK |
| 1020 | csv-query | Data Operations | 0 | REAL | `{results[]}` SQL-like query on CSV data | OK |
| 1021 | data-join | Data Operations | 0 | REAL | `{result[]}` join two datasets by key | OK |
| 1022 | data-validate-row | Data Operations | 0 | REAL | `{valid, errors[]}` row-level data validation | OK |
| 1023 | diff-three-way | Code Utilities | 0 | REAL | `{merged, conflicts[]}` three-way merge | OK |
| 1024 | diff-patch-apply | Code Utilities | 0 | REAL | `{result}` apply unified diff patch | OK |
| 1025 | workflow-state-machine | Workflow Primitives | 0 | REAL | `{current_state, transitions[]}` finite state machine | OK |
| 1026 | dag-topological-sort | Workflow Primitives | 0 | REAL | `{sorted[], has_cycle}` topological sort of DAG | OK |
| 1027 | dependency-resolver | Enterprise Ops | 0 | REAL | `{order[], circular[]}` dependency resolution | OK |
| 1028 | cron-schedule-compute | Workflow Primitives | 0 | REAL | `{next_runs[]}` cron schedule computation | OK |
| 1029 | guardrail-check | Structured Output | 0 | REAL | `{passed, violations[]}` content guardrail checking | OK |
| 1030 | pii-detect-redact | Structured Output | 0 | REAL | `{redacted, pii_found[]}` PII detection and redaction | OK |
| 1031 | cost-estimate-llm | Enterprise Ops | 0 | REAL | `{cost, tokens, model}` LLM cost estimation | OK |
| 1032 | audit-log-format | Observability | 0 | REAL | `{log_entry}` structured audit log formatting | OK |
| 1033 | trace-span-create | Observability | 0 | REAL | `{span_id, trace_id, parent_id}` distributed trace span | OK |
| 1034 | human-in-the-loop-gate | Agent Intelligence | 0 | REAL | `{gate_id, requires_approval}` HITL gate creation | OK |
| 1035 | capability-match | Agent Intelligence | 0 | REAL | `{matched[], score}` capability matching | OK |
| 1036 | prompt-template-render | Agent Intelligence | 0 | REAL | `{rendered}` prompt template rendering | OK |
| 1037 | retry-policy-compute | Enterprise Ops | 0 | REAL | `{schedule[]}` retry policy schedule computation | OK |
| 1038 | prompt-chain-plan | Agent Intelligence | 0 | REAL | `{chain[], dependencies{}}` prompt chain planning | OK |
| 1039 | text-chunk-smart | Context Management | 0 | REAL | `{chunks[]}` smart text chunking with overlap | OK |
| 1040 | vector-search-inmemory | RAG Primitives | 0 | REAL | `{results[]}` in-memory vector similarity search (cosine) | OK |
| 1041 | ast-parse-js | Code Analysis | 0 | REAL | `{ast, functions[], imports[]}` JS AST parsing (regex-based) | OK |
| 1042 | ast-parse-python | Code Analysis | 0 | REAL | `{ast, functions[], imports[]}` Python AST parsing (regex-based) | OK |
| 1043 | code-complexity-analyze | Code Analysis | 0 | REAL | `{complexity, metrics{}}` code complexity analysis | OK |
| 1044 | openapi-to-tools | Code Analysis | 0 | REAL | `{tools[]}` OpenAPI spec to tool definitions | OK |
| 1045 | changelog-parse | Document Parsing | 0 | REAL | `{versions[], latest}` changelog parsing | OK |
| 1046 | semver-range-resolve | Code Utilities | 0 | REAL | `{resolved, satisfies}` semver range resolution | OK |
| 1047 | html-to-markdown | Document Parsing | 0 | REAL | `{markdown}` HTML to Markdown conversion | OK |
| 1048 | markdown-to-plaintext | Document Parsing | 0 | REAL | `{text}` Markdown to plaintext stripping | OK |
| 1049 | svg-generate-chart | Visualization | 0 | REAL | `{svg}` SVG chart generation (bar/line/pie) | OK |
| 1050 | calendar-availability | Date & Time | 0 | REAL | `{available[], busy[]}` calendar availability calculation | OK |
| 1051 | priority-queue-manage | Data Transform | 0 | REAL | `{queue[], next}` priority queue operations | OK |
| 1052 | feedback-loop-score | Agent Intelligence | 0 | REAL | `{score, convergence}` feedback loop scoring | OK |
| 1053 | agent-benchmark-score | Agent Intelligence | 0 | REAL | `{score, breakdown{}}` agent performance benchmark | OK |
| 1054 | workflow-version-diff | Workflow Primitives | 0 | REAL | `{changes[], added[], removed[]}` workflow version diff | OK |
| 1055 | image-metadata-extract | Analyze | 0 | REAL | `{metadata{}}` image metadata extraction (base64 header parsing) | OK |
| 1056 | math-symbolic-simplify | Math & Numbers | 0 | REAL | `{simplified}` basic symbolic math simplification | OK |
| 1057 | contract-abi-parse | Code Utilities | 0 | REAL | `{functions[], events[]}` Solidity ABI parsing | OK |
| 1058 | tool-use-plan | Agent Intelligence | 0 | REAL | `{plan[], tools_needed[]}` tool use planning | OK |
| 1059 | yaml-to-json | Document Parsing | 0 | REAL | `{json}` YAML to JSON conversion | OK |
| 1060 | csp-header-parse | Crypto & Security | 0 | REAL | `{directives{}}` Content Security Policy header parsing | OK |
| 1061 | dependency-graph-sort | Enterprise Ops | 0 | REAL | `{sorted[]}` dependency graph topological sort | OK |
| 1062 | levenshtein-distance | Text Processing | 0 | REAL | `{distance, similarity}` Levenshtein edit distance | OK |
| 1063 | json-to-yaml | Document Parsing | 0 | REAL | `{yaml}` JSON to YAML conversion | OK |
| 1064 | validate-email-syntax | Validation | 0 | REAL | `{valid, domain, is_disposable, suggestion}` RFC email validation + disposable detection + typo suggestions | OK |
| 1065 | validate-phone-format | Validation | 0 | REAL | `{valid, e164, country, digits}` phone format validation by country | OK |
| 1066 | validate-credit-card | Validation | 0 | REAL | `{valid, number_masked, network, luhn}` Luhn + network detection (Visa/MC/Amex/etc) | OK |
| 1067 | validate-iban | Validation | 0 | REAL | `{valid, country, check_digits, bban}` IBAN validation with check digit mod 97 | OK |
| 1068 | validate-url-format | Validation | 0 | REAL | `{valid, protocol, hostname, is_https}` URL format validation via URL API | OK |
| 1069 | validate-ip-address | Validation | 0 | REAL | `{valid, version}` IPv4/IPv6 validation | OK |
| 1070 | validate-postal-code | Validation | 0 | REAL | `{valid, country}` postal code format validation | OK |
| 1071 | validate-vat-number | Validation | 0 | REAL | `{valid, country}` VAT number format validation | OK |
| 1072 | validate-isbn | Validation | 0 | REAL | `{valid, type}` ISBN-10/13 validation | OK |
| 1073 | validate-color-value | Validation | 0 | REAL | `{valid, format}` color value validation (hex/rgb/hsl) | OK |
| 1074 | validate-mime-type | Validation | 0 | REAL | `{valid, type, subtype}` MIME type format validation | OK |
| 1075 | validate-domain-name | Validation | 0 | REAL | `{valid}` domain name validation regex | OK |
| 1076 | api-mock-response | API Testing | 0 | REAL | `{response, status}` mock API response generation | OK |
| 1077 | api-mock-dataset | API Testing | 0 | REAL | `{dataset[]}` mock dataset generation from schema | OK |
| 1078 | api-test-assertion | API Testing | 0 | REAL | `{passed, failures[]}` API response assertion checking | OK |
| 1079 | api-request-build | API Testing | 0 | REAL | `{request{method, url, headers, body}}` HTTP request builder | OK |
| 1080 | api-curl-parse | API Testing | 0 | REAL | `{method, url, headers{}, body}` cURL command parser | OK |
| 1081 | api-curl-generate | API Testing | 0 | REAL | `{curl}` cURL command generation from request spec | OK |
| 1082 | api-rate-limit-calc | API Testing | 0 | REAL | `{requests_per_second, burst}` rate limit calculation | OK |
| 1083 | api-latency-stats | API Testing | 0 | REAL | `{p50, p95, p99, avg}` latency percentile calculation | OK |
| 1084 | api-error-classify | API Testing | 0 | REAL | `{category, retryable}` API error classification | OK |
| 1085 | api-snippet-generate | API Testing | 0 | REAL | `{snippet}` API code snippet in various languages | OK |
| 1086 | validate-json-schema | Validation | 0 | REAL | `{valid, errors[]}` JSON Schema validation | OK |
| 1087 | api-response-diff | API Testing | 0 | REAL | `{diffs[]}` API response diff | OK |
| 1088 | api-health-score | API Testing | 0 | REAL | `{score, factors{}}` API health scoring | OK |
| 1089 | http-header-parse | HTTP Utilities | 0 | REAL | `{headers{}}` HTTP header string parsing | OK |
| 1090 | http-header-build | HTTP Utilities | 0 | REAL | `{header_string}` HTTP header string building | OK |
| 1091 | http-querystring-build | HTTP Utilities | 0 | REAL | `{querystring}` URL querystring building | OK |
| 1092 | http-querystring-parse | HTTP Utilities | 0 | REAL | `{params{}}` URL querystring parsing | OK |
| 1093 | http-cookie-parse | HTTP Utilities | 0 | REAL | `{cookies{}}` Cookie header parsing | OK |
| 1094 | http-cookie-build | HTTP Utilities | 0 | REAL | `{cookie_string}` Set-Cookie header building | OK |
| 1095 | http-content-negotiate | HTTP Utilities | 0 | REAL | `{best_match}` content type negotiation | OK |
| 1096 | http-basic-auth-encode | HTTP Utilities | 0 | REAL | `{header}` Basic auth header encoding | OK |
| 1097 | http-bearer-token-extract | HTTP Utilities | 0 | REAL | `{token}` Bearer token extraction from header | OK |
| 1098 | geo-country-lookup | Geolocation | 0 | REAL | `{country, capital, region}` country info lookup (static table) | OK |
| 1099 | geo-timezone-lookup | Geolocation | 0 | REAL | `{timezone, offset}` timezone lookup by location | OK |
| 1100 | geo-coordinates-distance | Geolocation | 0 | REAL | `{distance_km}` Haversine formula distance calculation | OK |
| 1101 | geo-coordinates-to-geohash | Geolocation | 0 | REAL | `{geohash}` coordinate to geohash encoding | OK |
| 1102 | geo-bounding-box | Geolocation | 0 | REAL | `{min_lat, max_lat, min_lon, max_lon}` bounding box calculation | OK |
| 1103 | currency-info-lookup | Data Enrichment | 0 | REAL | `{code, name, symbol}` currency info lookup (static table) | OK |
| 1104 | locale-info-lookup | Data Enrichment | 0 | REAL | `{locale, language, country}` locale info lookup | OK |
| 1105 | language-info-lookup | Data Enrichment | 0 | REAL | `{code, name, native}` language info lookup | OK |
| 1106 | http-status-info | HTTP Utilities | 0 | REAL | `{code, meaning, category}` HTTP status code info | OK |
| 1107 | http-url-parse | HTTP Utilities | 0 | REAL | `{protocol, host, path, query, hash}` URL parsing | OK |
| 1108 | http-form-encode | HTTP Utilities | 0 | REAL | `{encoded}` form URL encoding | OK |
| 1109 | finance-npv | Finance | 0 | REAL | `{npv}` net present value calculation | OK |
| 1110 | finance-irr | Finance | 0 | REAL | `{irr}` internal rate of return (Newton's method) | OK |
| 1111 | finance-break-even | Finance | 0 | REAL | `{units, revenue}` break-even point calculation | OK |
| 1112 | finance-invoice-calc | Finance | 0 | REAL | `{subtotal, tax, total, line_items[]}` invoice calculation | OK |
| 1113 | finance-subscription-metrics | Finance | 0 | REAL | `{mrr, arr, churn, ltv}` subscription metrics | OK |
| 1114 | template-email-html | Communication | 0 | TEMPLATE | `{html}` HTML email template | OK |
| 1115 | template-email-plain | Communication | 0 | TEMPLATE | `{text}` plain text email template | OK |
| 1116 | template-sms-truncate | Communication | 0 | REAL | `{truncated, segments}` SMS truncation to segment limits | OK |
| 1117 | template-interpolate | Communication | 0 | REAL | `{result}` template variable interpolation | OK |
| 1118 | media-detect-format | Media Utilities | 0 | REAL | `{format, mime}` media format detection from magic bytes | OK |
| 1119 | media-data-uri-parse | Media Utilities | 0 | REAL | `{mime, encoding, data}` data URI parsing | OK |
| 1120 | media-data-uri-build | Media Utilities | 0 | REAL | `{data_uri}` data URI construction | OK |
| 1121 | media-aspect-ratio | Media Utilities | 0 | REAL | `{ratio, width, height}` aspect ratio calculation/GCD | OK |
| 1122 | media-color-accessibility | Media Utilities | 0 | REAL | `{contrast_ratio, aa_pass, aaa_pass}` WCAG contrast ratio | OK |
| 1123 | media-svg-optimize | Media Utilities | 0 | REAL | `{optimized, savings}` SVG optimization (whitespace, attributes) | OK |
| 1124 | dev-env-validate | Developer Tools | 0 | REAL | `{valid, issues[]}` dev environment validation checks | OK |
| 1125 | dev-gitignore-check | Developer Tools | 0 | REAL | `{ignored, matched_pattern}` check if file matches gitignore | OK |
| 1126 | dev-dependency-tree | Developer Tools | 0 | REAL | `{tree, depth}` dependency tree rendering | OK |
| 1127 | dev-license-detect | Developer Tools | 0 | REAL | `{license, confidence}` license detection from text | OK |
| 1128 | dev-release-version | Developer Tools | 0 | REAL | `{version, bumped}` release version calculation | OK |
| 1129 | dev-config-merge | Developer Tools | 0 | REAL | `{merged}` config file deep merge | OK |
| 1130 | dev-feature-flag-eval | Developer Tools | 0 | REAL | `{enabled, rule_matched}` feature flag evaluation | OK |
| 1131 | dev-migration-sql-parse | Developer Tools | 0 | REAL | `{up[], down[]}` SQL migration parsing | OK |
| 1132 | data-csv-stats | Agent Superpowers | 0 | REAL | `{columns[], rows, stats{}}` CSV statistics | OK |
| 1133 | data-schema-infer | Data Operations | 0 | REAL | `{schema{}, fields[]}` schema inference from data | OK |
| 1134 | data-normalize-records | Agent Superpowers | 0 | REAL | `{normalized[]}` record normalization | OK |
| 1135 | data-dedup-records | Agent Superpowers | 0 | REAL | `{unique[], duplicates}` record deduplication | OK |
| 1136 | data-rolling-window | Agent Superpowers | 0 | REAL | `{windows[]}` rolling window aggregation | OK |
| 1137 | data-correlation-matrix | Agent Superpowers | 0 | REAL | `{matrix{}}` column correlation matrix | OK |
| 1138 | data-sql-to-json-filter | Agent Superpowers | 0 | REAL | `{result[]}` SQL WHERE clause on JSON array | OK |
| 1139 | auth-api-key-generate | Auth & Security | 0 | REAL | `{api_key}` secure API key generation via crypto | OK |
| 1140 | auth-oauth-state-generate | Auth & Security | 0 | REAL | `{state}` OAuth state parameter generation | OK |
| 1141 | auth-scope-check | Auth & Security | 0 | REAL | `{allowed, missing[]}` OAuth scope checking | OK |
| 1142 | auth-rbac-check | Auth & Security | 0 | REAL | `{allowed, role, permissions[]}` RBAC permission check | OK |
| 1143 | auth-password-policy-check | Auth & Security | 0 | REAL | `{valid, violations[]}` password policy enforcement | OK |
| 1144 | security-csp-parse | Auth & Security | 0 | REAL | `{directives{}}` CSP header parsing | OK |
| 1145 | security-cors-validate | Auth & Security | 0 | REAL | `{valid, issues[]}` CORS configuration validation | OK |
| 1146 | security-header-audit | Auth & Security | 0 | REAL | `{score, missing[], present[]}` security header audit | OK |
| 1147 | security-jwt-claims-validate | Auth & Security | 0 | REAL | `{valid, issues[]}` JWT claims validation | OK |
| 1148 | security-url-sanitize | Auth & Security | 0 | REAL | `{sanitized, threats_removed[]}` URL sanitization (XSS, injection) | OK |
| 1149 | geo-point-in-polygon | Geolocation | 0 | REAL | `{inside}` ray casting point-in-polygon test | OK |
| 1150 | finance-margin-calc | Finance | 0 | REAL | `{margin, markup}` margin/markup calculation | OK |
| 1151 | finance-tip-split | Finance | 0 | REAL | `{per_person, tip, total}` tip/bill splitting | OK |
| 1152 | finance-salary-to-hourly | Finance | 0 | REAL | `{hourly, weekly, monthly}` salary conversion | OK |
| 1153 | data-pivot-table | Agent Superpowers | 0 | REAL | `{pivoted{}}` data pivot table | OK |
| 1154 | data-json-flatten | Agent Superpowers | 0 | REAL | `{flattened{}}` JSON object flattening | OK |
| 1155 | data-json-unflatten | Agent Superpowers | 0 | REAL | `{unflattened{}}` JSON unflattening | OK |
| 1156 | dev-semver-compare | Developer Tools | 0 | REAL | `{result}` semver comparison | OK |
| 1157 | dev-cron-describe | Developer Tools | 0 | REAL | `{description}` cron expression description | OK |
| 1158 | dev-regex-test | Developer Tools | 0 | REAL | `{matches[], count}` regex testing | OK |
| 1159 | security-hash-compare | Auth & Security | 0 | REAL | `{match}` timing-safe hash comparison | OK |
| 1160 | security-entropy-check | Auth & Security | 0 | REAL | `{entropy, strength}` entropy/randomness assessment | OK |
| 1161 | template-webhook-payload | Communication | 0 | REAL | `{payload}` webhook payload template rendering | OK |
| 1162 | media-palette-extract | Media Utilities | 0 | REAL | `{palette[]}` color palette extraction from hex values | OK |
| 1163 | finance-depreciation | Finance | 0 | REAL | `{schedule[]}` straight-line/declining depreciation | OK |
| 1164 | string-template | Text Processing | 0 | REAL | `{rendered, vars_applied, unresolved}` multi-syntax template rendering (${}, {{}}, %{}) | OK |
| 1165 | string-pad | Text Processing | 0 | REAL | `{result}` left/right/center string padding | OK |
| 1166 | string-wrap | Text Processing | 0 | REAL | `{wrapped, lines}` word-wrapping at column width | OK |
| 1167 | string-escape | Text Processing | 0 | REAL | `{result, format}` multi-format escaping (json/html/xml/regex/url/sql/csv) | OK |
| 1168 | string-unescape | Text Processing | 0 | REAL | `{result, format}` multi-format unescaping | OK |
| 1169 | string-between | Text Processing | 0 | REAL | `{result, found}` extract text between delimiters | OK |
| 1170 | string-mask | Text Processing | 0 | REAL | `{masked}` mask middle of string (e.g. credit card) | OK |
| 1171 | string-repeat | Text Processing | 0 | REAL | `{result, length}` string repetition with separator | OK |
| 1172 | regex-build | Text Processing | 0 | REAL | `{regex, valid, test_matches}` regex building + testing | OK |
| 1173 | regex-extract-groups | Text Processing | 0 | REAL | `{matches[], count}` regex group extraction | OK |
| 1174 | regex-replace | Text Processing | 0 | REAL | `{result, replacements}` regex replace | OK |
| 1175 | fuzzy-match | Text Processing | 0 | REAL | `{matches[], best}` fuzzy string matching (Levenshtein-based) | OK |
| 1176 | text-diff-words | Text Processing | 0 | REAL | `{diffs[]}` word-level diff | OK |
| 1177 | text-ngrams | Text Processing | 0 | REAL | `{ngrams[], count}` n-gram generation | OK |
| 1178 | text-tokenize | Text Processing | 0 | REAL | `{tokens[], count}` text tokenization | OK |
| 1179 | data-flatten-deep | Agent Superpowers | 0 | REAL | `{result}` deep object flattening | OK |
| 1180 | data-unflatten | Agent Superpowers | 0 | REAL | `{result}` object unflattening | OK |
| 1181 | data-pick | Agent Superpowers | 0 | REAL | `{result}` pick keys from object | OK |
| 1182 | data-omit | Agent Superpowers | 0 | REAL | `{result}` omit keys from object | OK |
| 1183 | data-rename-keys | Agent Superpowers | 0 | REAL | `{result}` rename object keys | OK |
| 1184 | data-deep-merge | Agent Superpowers | 0 | REAL | `{result}` deep object merge | OK |
| 1185 | data-diff | Agent Superpowers | 0 | REAL | `{diffs[]}` object diff | OK |
| 1186 | data-coerce-types | Agent Superpowers | 0 | REAL | `{result}` type coercion (string to number, etc) | OK |
| 1187 | data-clean | Agent Superpowers | 0 | REAL | `{result}` data cleaning (nulls, empty strings, etc) | OK |
| 1188 | data-frequency | Agent Superpowers | 0 | REAL | `{frequency{}}` value frequency count | OK |
| 1189 | data-window-functions | Agent Superpowers | 0 | REAL | `{result[]}` SQL-style window functions (rank, row_number, etc) | OK |
| 1190 | encode-base32 | Crypto & Security | 0 | REAL | `{encoded}` base32 encoding | OK |
| 1191 | encode-hex | Crypto & Security | 0 | REAL | `{encoded}` hex encoding | OK |
| 1192 | encode-rot13 | Crypto & Security | 0 | REAL | `{encoded}` ROT13 encoding | OK |
| 1193 | encode-morse | Crypto & Security | 0 | REAL | `{encoded}` Morse code encoding | OK |
| 1194 | format-table | Data Transform | 0 | REAL | `{table}` ASCII table formatting | OK |
| 1195 | format-list | Data Transform | 0 | REAL | `{list}` formatted list generation | OK |
| 1196 | format-tree | Data Transform | 0 | REAL | `{tree}` ASCII tree formatting | OK |
| 1197 | type-check | Data Transform | 0 | REAL | `{type, is_array, is_null, is_object}` comprehensive type checking | OK |
| 1198 | type-convert | Data Transform | 0 | REAL | `{result, from_type, to_type}` type conversion | OK |
| 1199 | math-interpolate | Math & Numbers | 0 | REAL | `{result}` linear/bilinear interpolation | OK |
| 1200 | math-probability | Math & Numbers | 0 | REAL | `{probability}` probability calculation | OK |
| 1201 | math-combination | Math & Numbers | 0 | REAL | `{result}` nCr combination calculation | OK |
| 1202 | id-nanoid | Generate | 0 | REAL | `{id}` nanoid generation via crypto.randomBytes | OK |
| 1203 | id-ulid | Generate | 0 | REAL | `{ulid}` ULID generation (timestamp + random) | OK |
| 1204 | id-snowflake | Generate | 0 | REAL | `{id}` Snowflake ID generation (timestamp-based) | OK |
| 1205 | hash-hmac | Crypto & Security | 0 | REAL | `{hmac}` HMAC computation | OK |
| 1206 | string-camel-case | Text Processing | 0 | REAL | `{result}` camelCase conversion | OK |
| 1207 | hash-checksum | Crypto & Security | 0 | REAL | `{checksum}` data checksum | OK |
| 1208 | biz-tax-calculate | Business Logic | 0 | REAL | `{gross, net, tax, rate}` inclusive/exclusive tax calculation | OK |
| 1209 | biz-discount-apply | Business Logic | 0 | REAL | `{original, discount, final, savings_pct}` percentage/fixed discount | OK |
| 1210 | biz-shipping-estimate | Business Logic | 0 | REAL | `{cost, method, delivery_days}` weight+distance shipping estimate | OK |
| 1211 | biz-prorate | Business Logic | 0 | REAL | `{prorated_refund, daily_rate, days_remaining}` proration | OK |
| 1212 | biz-roi-calculate | Business Logic | 0 | REAL | `{roi_pct, profit, payback_months}` ROI calculation | OK |
| 1213 | biz-cac-ltv | Business Logic | 0 | REAL | `{cac, ltv, ltv_cac_ratio, healthy}` CAC/LTV analysis | OK |
| 1214 | biz-compound-interest | Business Logic | 0 | REAL | `{principal, total, interest, multiplier}` compound interest | OK |
| 1215 | biz-mrr-calculate | Business Logic | 0 | REAL | `{mrr, arr, customers, arpu}` MRR/ARR calculation from plan data | OK |
| 1216 | biz-pricing-strategy | Business Logic | 0 | REAL | `{recommended_price, margin}` pricing strategy from cost + margin + competitors | OK |
| 1217 | biz-time-value-money | Business Logic | 0 | REAL | `{present_value, future_value}` TVM calculation | OK |
| 1218 | devops-dockerfile-parse | DevOps | 0 | REAL | `{stages[], from, expose}` Dockerfile instruction parsing | OK |
| 1219 | devops-env-generate | DevOps | 0 | REAL | `{env}` .env file generation from config | OK |
| 1220 | devops-semver-bump | DevOps | 0 | REAL | `{bumped}` semver version bump | OK |
| 1221 | devops-health-check-eval | DevOps | 0 | REAL | `{healthy, checks[]}` health check evaluation | OK |
| 1222 | devops-uptime-calculate | DevOps | 0 | REAL | `{uptime_pct, nines}` uptime percentage/nines calculation | OK |
| 1223 | devops-crontab-generate | DevOps | 0 | REAL | `{crontab}` crontab file generation | OK |
| 1224 | devops-log-parse | DevOps | 0 | REAL | `{entries[], patterns}` structured log parsing | OK |
| 1225 | devops-error-fingerprint | DevOps | 0 | REAL | `{fingerprint}` error fingerprinting for dedup | OK |
| 1226 | devops-resource-estimate | DevOps | 0 | REAL | `{cpu, memory, storage}` resource estimation | OK |
| 1227 | devops-sla-budget | DevOps | 0 | REAL | `{budget_minutes, downtime_allowed}` SLA error budget calculation | OK |
| 1228 | ai-token-estimate | AI Utilities | 0 | REAL | `{tokens, model}` token estimation (~4 chars/token) | OK |
| 1229 | ai-prompt-score | AI Utilities | 0 | REAL | `{score, factors{}}` prompt quality scoring | OK |
| 1230 | ai-output-parse | AI Utilities | 0 | REAL | `{parsed}` AI output parsing (JSON extraction, etc) | OK |
| 1231 | ai-context-window-pack | AI Utilities | 0 | REAL | `{packed, tokens_used, tokens_remaining}` context window packing | OK |
| 1232 | ai-function-call-parse | AI Utilities | 0 | REAL | `{function, args{}}` AI function call parsing | OK |
| 1233 | ai-guardrail-score | AI Utilities | 0 | REAL | `{score, flags[]}` AI output guardrail scoring | OK |
| 1234 | ai-response-grade | AI Utilities | 0 | REAL | `{grade, criteria{}}` AI response quality grading | OK |
| 1235 | ai-chain-of-thought | AI Utilities | 0 | REAL | `{steps[], conclusion}` chain-of-thought structure extraction | OK |
| 1236 | ai-tool-selector | AI Utilities | 0 | REAL | `{selected_tools[], confidence}` tool selection from task description | OK |
| 1237 | ai-reflection | AI Utilities | 0 | REAL | `{reflection, improvements[]}` AI self-reflection generation | OK |
| 1238 | graphql-query-build | Protocol Helpers | 0 | REAL | `{query}` GraphQL query builder from fields/args | OK |
| 1239 | graphql-response-extract | Protocol Helpers | 0 | REAL | `{data, errors[]}` GraphQL response extraction | OK |
| 1240 | jwt-decode-inspect | Auth & Security | 0 | REAL | `{header, payload, expired}` JWT decode + inspection | OK |
| 1241 | webhook-payload-verify | Auth & Security | 0 | REAL | `{valid}` webhook signature verification (HMAC) | OK |
| 1242 | url-build | HTTP Utilities | 0 | REAL | `{url}` URL construction from parts | OK |
| 1243 | url-parse-advanced | HTTP Utilities | 0 | REAL | `{parts{}}` advanced URL parsing with all components | OK |
| 1244 | cron-next-runs | Date & Time | 0 | REAL | `{runs[]}` next N cron execution times | OK |
| 1245 | task-decompose | Agent Workflow | 0 | REAL | `{subtasks[], tree}` task decomposition into subtasks | OK |
| 1246 | task-prioritize | Agent Workflow | 0 | REAL | `{ranked[], method}` task prioritization (Eisenhower/RICE) | OK |
| 1247 | task-estimate | Agent Workflow | 0 | REAL | `{estimate, confidence}` task effort estimation | OK |
| 1248 | data-csv-to-json | Agent Superpowers | 0 | REAL | `{data[]}` CSV to JSON conversion | OK |
| 1249 | data-json-to-csv | Agent Superpowers | 0 | REAL | `{csv}` JSON to CSV conversion | OK |
| 1250 | data-flatten-object | Agent Superpowers | 0 | REAL | `{flattened{}}` object flattening | OK |
| 1251 | data-diff-objects | Agent Superpowers | 0 | REAL | `{diffs[]}` object comparison diff | OK |
| 1252 | security-password-strength | Auth & Security | 0 | REAL | `{score, strength, suggestions[]}` password strength analysis | OK |
| 1253 | security-hash-generate | Auth & Security | 0 | REAL | `{hash, algorithm}` hash generation | OK |
| 1254 | security-rate-limit-check | Auth & Security | 0 | REAL | `{allowed, remaining}` rate limit checking | OK |
| 1255 | workflow-retry-backoff | Agent Workflow | 0 | REAL | `{schedule[]}` retry backoff schedule generation | OK |

---

## SUMMARY STATISTICS

### Total Endpoints: 1255

### GUTS Breakdown:
| GUTS Classification | Count | Percentage |
|---------------------|-------|------------|
| REAL | ~1060 | ~84.5% |
| REAL (external) | ~55 | ~4.4% |
| REAL (LLM) | ~60 | ~4.8% |
| REAL (SQLite) | ~45 | ~3.6% |
| REAL (file) | ~15 | ~1.2% |
| TEMPLATE | ~18 | ~1.4% |
| RANDOM (needs fix) | ~14 | ~1.1% |
| DETERMINISTIC-HASH | ~20 | ~1.6% |
| NEEDS_KEY | ~13 | ~1.0% |

### Endpoints Flagged RANDOM (needs fix):
1. #24 text-lorem-ipsum -- Math.random() for word selection in lorem text
2. #130 gen-fake-name -- Math.random() for name selection
3. #131 gen-fake-email -- Math.random() for email generation
4. #132 gen-fake-company -- Math.random() for company name
5. #133 gen-fake-address -- Math.random() for address generation
6. #134 gen-fake-phone -- Math.random() for phone generation
7. #274 gen-inspiration -- Math.random() for quote selection
8. #283 random-persona -- Math.random() for persona generation
9. #286 fortune-cookie -- Math.random() for fortune selection
10. #388 gen-lorem -- Math.random() for lorem text
11. #444 data-sample -- Math.random() for sampling
12. #481 archetype-assign -- Math.random() adds noise to scoring
13. #763 gen-fake-date -- Math.random() for date range
14. #764 gen-fake-sentence -- Math.random() for word selection
15. #765 gen-fake-paragraph -- Math.random() for sentence assembly
16. #949 demo-data-gen -- Math.random() for demo data

**Note:** Most Math.random() usage is in generators where randomness is the *intended behavior* (fake data, lorem ipsum). The fix would be to use crypto.randomBytes for better randomness or make them deterministic via input hashing. Low severity.

### TEMPLATE Endpoints (acceptable):
Templates are the correct pattern for gen-doc-*, gen-gitignore, gen-dockerfile, gen-readme, gen-license-mit, gen-env-example, template-email-html, template-email-plain, social-proof-gen, gen-doc-github-action, etc. These generate parameterized config/doc files from inputs -- no "fix" needed.

### NEEDS_KEY Endpoints (require external service credentials):
All ext-* endpoints (ext-web-screenshot, ext-email-send, ext-sms-send, ext-github-issue, etc.) require environment variables for external services. They return `{_engine:'needs_key'}` when unconfigured.

### Key Observations:
1. **Overwhelming majority (>84%) do REAL computation** -- regex, crypto, math, parsing, data transforms
2. **All crypto operations use Node.js crypto module** -- properly seeded, not Math.random()
3. **Memory system is SQLite-backed** -- real persistence, not ephemeral
4. **Orchestration uses file-based persistence** -- `.data/` directory JSON files
5. **Network/Sense handlers make real HTTP requests** -- actual DNS lookups, URL fetches, TLS checks
6. **LLM handlers support multi-provider** -- Anthropic, OpenAI, Grok, DeepSeek, Ollama
7. **Security fix CRIT-02 applied** to runbook-execute -- no longer uses raw `new Function()` with user input
8. **Hackathon endpoints (767-921)** are all deterministic-hash or real computation -- no Math.random()
9. **Competition endpoints (1014-1255)** are all real computation -- validation, business logic, devops, etc.
