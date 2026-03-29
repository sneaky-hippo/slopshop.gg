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
