# SlopShop.gg Endpoint Engineering Specification

> Generated 2026-03-29 via live API probing. Covers all 168 endpoints across Crypto & Security (32), Text Processing (90), and Math & Numbers (46).

**Base URL**: `POST https://slopshop.gg/v1/{slug}`
**Auth**: `Authorization: Bearer <api-key>`
**Content-Type**: `application/json`

Every successful response wraps in: `{ ok: true, data: { _engine, ...fields }, meta: { api, credits_used, balance, latency_ms, engine, confidence, output_hash }, guarantees: { schema_valid, validated, fallback_used, output_hash } }`

---

## Table of Contents

1. [Crypto & Security (32 endpoints)](#1-crypto--security-32-endpoints)
2. [Text Processing (90 endpoints)](#2-text-processing-90-endpoints)
3. [Math & Numbers (46 endpoints)](#3-math--numbers-46-endpoints)
4. [Cross-Cutting Issues](#4-cross-cutting-issues)

---

## 1. Crypto & Security (32 endpoints)

### 1.1 Hashing

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `crypto-hash-sha256` | `{ text: string (required) }` | `{ hash: string, algorithm: "sha256" }` | Hash must be exactly 64 lowercase hex characters. Identical input must always produce identical output. Reference: Node.js `crypto.createHash('sha256')`. | deterministic, cryptographic | None known. |
| `crypto-hash-sha512` | `{ text: string (required) }` | `{ hash: string }` | Hash must be exactly 128 lowercase hex characters. | deterministic, cryptographic | Output schema missing `algorithm` field (inconsistent with sha256 endpoint). |
| `crypto-hash-md5` | `{ text: string (required) }` | `{ hash: string }` | Hash must be exactly 32 lowercase hex characters. MD5 is broken for collision resistance -- endpoint should carry a deprecation warning for security contexts. | deterministic, cryptographic | No deprecation notice in API response. |
| `crypto-hmac` | `{ text: string (required), secret: string (required) }` | `{ hmac: string, algorithm: "hmac-sha256" }` | HMAC-SHA256 output must be 64 hex chars. Same text+secret must always produce same HMAC. Matches `crypto.createHmac('sha256', secret).update(text).digest('hex')`. | deterministic, cryptographic | None known. |
| `crypto-checksum` | `{ content: string (required) }` | `{ md5: string, sha256: string, size_bytes: number }` | MD5 must be 32 hex, SHA-256 must be 64 hex. `size_bytes` must equal UTF-8 byte length of `content`. | deterministic, cryptographic | None known. |
| `crypto-hash-compare` | `{ a: string (required), b: string (required) }` | `{ equal: boolean, method: "timing_safe" }` | Must use constant-time comparison. `equal` is true iff `a === b` byte-for-byte. | deterministic, cryptographic | None known. |
| `crypto-checksum-file` | `{ content: string (required) }` | `{ md5: string, sha256: string, sha512: string, size: number }` | MD5=32hex, SHA-256=64hex, SHA-512=128hex. `size` = byte length. | deterministic, cryptographic | Accepts `content` string despite name implying file upload. No actual file upload support. |
| `hash-hmac` | `{ text: string (required), secret: string (required) }` | `{ hmac: string, algorithm: "sha256", input_length: number }` | 64 hex chars. Identical to `crypto-hmac` output for same inputs. | deterministic, cryptographic | Duplicate of `crypto-hmac`. `input_length` is extra field. |
| `hash-checksum` | `{ text: string (required) }` | `{ checksum: string, algorithm: "md5", input_length: number }` | 32 hex chars (MD5). | deterministic, cryptographic | Only produces MD5. No algorithm selection. Partial duplicate of `crypto-checksum`. |

### 1.2 Password Operations

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `crypto-password-generate` | `{ length: number (optional, default 24) }` | `{ password: string, entropy_bits: number, strength: string }` | Password length must equal requested length. Must contain mix of character classes. `entropy_bits` should be >= `length * log2(charset_size)`. `strength` in `["weak","medium","strong","very_strong"]`. | cryptographic (CSPRNG) | None known. |
| `crypto-password-hash` | `{ password: string (required) }` | `{ hash: string, algorithm: string }` | Hash format: `pbkdf2:sha512:{iterations}:{salt}:{hash}`. Must use random salt per call (same password must produce different hashes). | cryptographic | None known. |
| `crypto-password-verify` | `{ password: string (required), hash: string (required) }` | `{ valid: boolean }` | `valid: true` only if password matches the PBKDF2 hash. Must be timing-safe. | cryptographic | None known. |

### 1.3 Random Generation

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `crypto-uuid` | `{}` (no required params) | `{ uuid: string, version: 4 }` | UUID must match `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`. Version must be 4. Each call must return a unique value. | cryptographic (CSPRNG) | None known. |
| `crypto-nanoid` | `{ length: number (optional, default 21) }` | `{ id: string }` | ID length must equal requested length. Characters must be URL-safe: `[A-Za-z0-9_-]`. | cryptographic (CSPRNG) | None known. |
| `crypto-random-bytes` | `{ bytes: number (optional, default 32) }` | `{ hex: string }` | Hex string length must equal `bytes * 2`. Each call must produce different output. | cryptographic (CSPRNG) | None known. |
| `crypto-random-int` | `{ min: number (optional, default 0), max: number (optional, default 100) }` | `{ value: number }` | `value` must be integer where `min <= value <= max`. | cryptographic (CSPRNG) | None known. |
| `crypto-otp-generate` | `{ length: number (optional, default 6) }` | `{ otp: string, expires_in: number }` | OTP must be numeric string of requested length. `expires_in` in seconds. | cryptographic (CSPRNG) | OTP has no server-side storage/verification -- `expires_in` is advisory only. |

### 1.4 JWT Operations

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `crypto-jwt-sign` | `{ payload: object (required), secret: string (required), exp: number (optional, seconds) }` | `{ token: string, payload: object }` | Token must be valid JWT with 3 dot-separated base64url segments. Header: `{"alg":"HS256","typ":"JWT"}`. Payload must include all input claims + `iat`. If `exp` provided, payload must include `exp` claim. | deterministic, cryptographic | None known. |
| `crypto-jwt-verify` | `{ token: string (required), secret: string (required) }` | `{ valid: boolean, payload: object, expired: boolean }` | `valid: true` only if signature matches secret. `expired: true` if `exp` claim is in the past. Must reject tampered tokens. | deterministic, cryptographic | None known. |
| `crypto-jwt-decode` | `{ token: string (required) }` | `{ header: object, payload: object, signature: string }` | Must decode without verification. Header and payload must be parsed JSON. Signature is raw base64url string. | deterministic | No security warning in response that this is unsafe. |

### 1.5 TOTP

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `crypto-totp-generate` | `{ secret: string (required, base32) }` | `{ otp: string, remaining_seconds: number, period: number }` | OTP must be 6-digit numeric string. Must match RFC 6238 TOTP for the current 30-second window. `remaining_seconds` must be 0-30. `period` must be 30. | cryptographic, time-dependent | Output changes every 30 seconds by design -- not cacheable. |

### 1.6 Encryption / Decryption

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `crypto-encrypt-aes` | `{ text: string (required), key: string (required) }` | `{ encrypted: string, iv: string, tag: string, algorithm: "aes-256-gcm" }` | All three output fields required for decryption. `iv` must be unique per call. `encrypted` is hex or base64. `tag` is the GCM auth tag. | cryptographic | Key derivation method unclear -- short keys presumably padded/hashed internally. |
| `crypto-decrypt-aes` | `{ encrypted: string (required), key: string (required), iv: string (required), tag: string (required) }` | `{ decrypted: string }` | `decrypted` must exactly equal the original plaintext. Must fail on wrong key/tampered tag. | cryptographic | None known. |

### 1.7 Advanced Crypto

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `secret-share` | `{ secret: string (required), n: number (required, total shares), k: number (required, threshold) }` | `{ shares: [{share_id, data}], threshold: number, total_shares: number, note: string }` | Must produce exactly `n` shares. Any `k` shares must reconstruct the secret. Fewer than `k` shares must not reveal information. | cryptographic | Self-describes as "simplified" -- NOT proper Shamir SSS. The note explicitly warns against production use. |
| `commitment-scheme` | `{ action: "commit"\|"reveal" (required), value: string (required for commit), commitment: string (required for reveal), nonce: string (required for reveal), value: string (required for reveal) }` | Commit: `{ commitment: string, nonce: string, note: string }`. Reveal: `{ valid: boolean, value: string }` | Commitment must be deterministic hash of `value + nonce`. Reveal must verify that `hash(value + nonce) === commitment`. | cryptographic | Two-phase operation -- no server-side state between commit and reveal. Client must store nonce. |
| `cipher-create` | `{ type: string (optional, default "caesar"), shift: number (optional, default 13), text: string (optional) }` | `{ type: string, shift: number, cipher_table: object, decipher_table: object, encrypted?: string }` | Cipher table must be complete a-z mapping. `decipher_table` must be exact inverse of `cipher_table`. If `text` provided, `encrypted` must match applying the cipher. | deterministic | Only supports Caesar cipher. |
| `decoy-resource` | `{}` (no required params, optionally `{ resource_name, resource_type }`) | `{ honeypot_id: string(uuid), resource_name: string, resource_type: string, appears_as: string, actually: string, alert_on_access: boolean, created_at: string(ISO), access_log: array, status: string }` | Must return unique `honeypot_id` per call. `status` must be "active". | cryptographic (UUID gen) | No actual monitoring infrastructure -- this is a schema/metadata generator only. `access_log` is always empty. |

### 1.8 Encoding

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `encode-base32` | `{ text: string (required) }` | `{ encoded: string, original_length: number }` | Must be valid RFC 4648 Base32. Decoding `encoded` must yield original `text`. `original_length` must equal input byte length. | deterministic | None known. |
| `encode-hex` | `{ text: string (required) }` | `{ encoded: string }` | Must be lowercase hex. Length must be `text.length * 2` for ASCII. Decoding must yield original. | deterministic | None known. |
| `encode-rot13` | `{ text: string (required) }` | `{ result: string }` | Must apply ROT13 to A-Z/a-z only. Non-alpha chars unchanged. Applying twice must return original. | deterministic | Duplicate functionality with `text-rot13`. |
| `encode-morse` | `{ text: string (required) }` | `{ encoded: string }` | Dots (`.`) and dashes (`-`), letters separated by spaces, words by 3+ spaces. Must match standard ITU Morse code. | deterministic | Duplicate functionality with `text-morse`. |

### 1.9 Security Analysis

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `csp-header-parse` | `{ header: string (required) }` | `{ directives: object, directive_count: number, issues: string[], issue_count: number, grade: string }` | Must correctly parse CSP directives. `grade` in `["A","B","C","D","F"]`. Issues must flag known weaknesses (missing frame-ancestors, unsafe-inline, etc.). | deterministic | None known. |

---

## 2. Text Processing (90 endpoints)

### 2.1 Counting & Analysis

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-word-count` | `{ text: string (required) }` | `{ words: number, characters: number, sentences: number, paragraphs: number }` | `words` must equal whitespace-delimited token count. `characters` must equal `text.length`. `sentences` must match `.!?` boundary count. `paragraphs` must match double-newline-delimited block count. | deterministic | Sentence detection is heuristic (abbreviations like "Mr." may cause miscounts). |
| `text-char-count` | `{ text: string (required) }` | `{ total: number, no_spaces: number, letters: number, digits: number }` | `total` = `text.length`. `no_spaces` = total minus whitespace chars. `letters` = count of `/[a-zA-Z]/g` matches. `digits` = count of `/[0-9]/g` matches. | deterministic | Does not count Unicode letters (accented chars, CJK) as "letters". |
| `text-count-frequency` | `{ text: string (required) }` | `{ character_frequency: [{char, count}], word_frequency: [{word, count}] }` | Frequencies must be accurate and sorted descending by count. Every character/word in input must appear exactly once in output. Sum of all counts must equal total chars/words. | deterministic | None known. |
| `text-vowel-count` | `{ text: string (required) }` | `{ vowels: number, consonants: number }` | Vowels = count of `[aeiouAEIOU]`. Consonants = count of `[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]`. Non-alpha chars excluded from both counts. | deterministic | None known. |
| `text-count-chars` | `{ text: string (required), char?: string }` | `{ count: number }` | If `char` provided, count occurrences of that character. If not, counts total characters. | deterministic | When no `char` provided, behavior overlaps with `text-char-count`. |
| `text-token-count` | `{ text: string (required) }` | `{ tokens_estimated: number, characters: number, method: "char_ratio", note: string }` | `tokens_estimated` ~ `characters / 4` (approximate). `characters` must equal `text.length`. | deterministic (heuristic) | This is a rough estimate (~4 chars/token). Not actual tokenizer. Will be inaccurate for code, non-English text, or special characters. |
| `text-reading-time` | `{ text: string (required) }` | `{ words: number, reading_time_minutes: number, reading_time_seconds: number, speaking_time_minutes: number, speaking_time_seconds: number, pace: string }` | `reading_time = words / 238`. `speaking_time = words / 150`. Seconds must be rounded integers. Minutes must be precise to 2 decimal places. | deterministic | Fixed WPM rates; no language-specific adjustment. |
| `text-readability-score` | `{ text: string (required) }` | `{ flesch_kincaid_grade: number, flesch_reading_ease: number, difficulty: string }` | Flesch-Kincaid grade must follow standard formula: `0.39*(words/sentences) + 11.8*(syllables/words) - 15.59`. Reading ease: `206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)`. `difficulty` in `["Very Easy","Easy","Fairly Easy","Standard","Fairly Difficult","Difficult","Very Confusing"]`. | statistical | Syllable counting is heuristic and will be inaccurate for some words. |

### 2.2 Extraction

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-extract-emails` | `{ text: string (required) }` | `{ emails: string[], count: number }` | Must match standard email regex. `count` must equal `emails.length`. Must not produce false positives on things like `user@` or `@domain`. | deterministic | May miss edge cases like plus-addressed emails or IP-literal domains. |
| `text-extract-urls` | `{ text: string (required) }` | `{ urls: string[], count: number }` | Must extract `http://` and `https://` URLs. `count` = `urls.length`. | deterministic | May not extract URLs without protocol prefix. |
| `text-extract-phones` | `{ text: string (required) }` | `{ phones: string[], count: number }` | Must match common phone formats: `(555) 123-4567`, `555-123-4567`, `+1-555-123-4567`. | deterministic | US-centric. International formats may not be recognized. |
| `text-extract-numbers` | `{ text: string (required) }` | `{ numbers: number[], count: number, sum: number }` | Must extract all numeric values including decimals. `sum` must equal mathematical sum of all extracted numbers. `count` = `numbers.length`. | deterministic | None known. |
| `text-extract-dates` | `{ text: string (required) }` | `{ dates: string[], count: number }` | Must match ISO dates (`YYYY-MM-DD`), US format (`MM/DD/YYYY`), and natural dates. | deterministic | Heuristic extraction; may produce false positives on number sequences. |
| `text-extract-mentions` | `{ text: string (required) }` | `{ mentions: string[], count: number }` | Must extract `@username` patterns. The `@` prefix must be included in each result. | deterministic | None known. |
| `text-extract-hashtags` | `{ text: string (required) }` | `{ hashtags: string[], count: number }` | Must extract `#tag` patterns. The `#` prefix must be included in each result. | deterministic | None known. |
| `text-extract-json` | `{ text: string (required) }` | `{ extracted: object[], count: number }` | Must find and parse all valid JSON objects/arrays embedded in text. Each extracted item must be valid parsed JSON. `count` = `extracted.length`. | deterministic | May fail on nested JSON or JSON with escaped braces. |
| `text-extract-code` | `{ text: string (required) }` | `{ code_blocks: [{code, language?}], count: number }` | Must extract fenced code blocks (triple backtick). Language tag must be captured if present. | deterministic | None known. |
| `text-extract-tables` | `{ text: string (required) }` | `{ tables: array[], count: number }` | Must extract pipe-delimited Markdown tables into structured row arrays. | deterministic | None known. |
| `text-extract-links` | `{ text: string (required) }` | `{ links: string[], count: number }` | Must extract unique HTTP/HTTPS URLs. Deduplicated. | deterministic | Overlaps with `text-extract-urls`. |

### 2.3 Regex Operations

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-regex-test` | `{ pattern: string (required), text: string (required), flags: string (optional, default "g") }` | `{ matches: [{match, index}], count: number, valid: boolean }` | `valid` must be true if pattern is syntactically correct regex. `count` = number of matches. Each match must include `index` (0-based position). | deterministic | Malicious regex (ReDoS) not explicitly guarded in docs. |
| `text-regex-replace` | `{ pattern: string (required), text: string (required), replacement: string (required) }` | `{ result: string, replacements_made: number }` | Result must equal `text.replace(new RegExp(pattern, 'g'), replacement)`. `replacements_made` must be accurate count. | deterministic | None known. |
| `regex-build` | `{ pattern: string (required), flags?: string, text?: string }` | `{ regex: string, pattern: string, flags: string, valid: boolean, test_matches: array, match_count: number }` | `valid` must reflect regex syntax validity. If `text` provided, `test_matches` must contain actual matches. `regex` must be formatted as `/pattern/flags`. | deterministic | None known. |
| `regex-extract-groups` | `{ text: string (required), pattern: string (required) }` | `{ matches: [{groups}], count: number }` | Must capture named and positional groups. `count` = number of full matches. | deterministic | None known. |
| `regex-replace` | `{ text: string (required), pattern: string (required), replacement: string (required) }` | `{ result: string, replacements: number }` | Same as `text-regex-replace` but under different slug. | deterministic | Duplicate of `text-regex-replace`. |

### 2.4 Text Transformation

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-slugify` | `{ text: string (required) }` | `{ slug: string }` | Lowercase, alphanumeric + hyphens only. No leading/trailing hyphens. No consecutive hyphens. Spaces become hyphens. Special chars removed. | deterministic | None known. |
| `text-reverse` | `{ text: string (required) }` | `{ result: string }` | `result` must equal `text.split('').reverse().join('')`. Reversing twice must yield original. | deterministic | May break Unicode combining characters and emoji sequences. |
| `text-case-convert` | `{ text: string (required) }` | `{ camelCase: string, snake_case: string, kebab_case: string, UPPER: string, lower: string, Title: string }` | Each case must be correctly applied. `UPPER` = all uppercase. `lower` = all lowercase. `Title` = first letter of each word capitalized. | deterministic | None known. |
| `text-title-case` | `{ text: string (required) }` | `{ result: string }` | First letter of each word capitalized, rest lowercase. | deterministic | Does not handle articles/prepositions (e.g., "a", "the", "of") per AP/Chicago style. |
| `text-snake-case` | `{ text: string (required) }` | `{ result: string }` | All lowercase, spaces/separators replaced with underscores. | deterministic | Includes punctuation in output (e.g., periods become `._`). |
| `text-camel-case` | `{ text: string (required) }` | `{ result: string }` | PascalCase (first letter capitalized). Words joined without separator. | deterministic | Actually produces PascalCase, not camelCase (first letter is capitalized). |
| `text-kebab-case` | `{ text: string (required) }` | `{ result: string }` | All lowercase, spaces replaced with hyphens. | deterministic | Includes punctuation in output (e.g., `hello-world.--this`). |
| `string-camel-case` | `{ text: string (required) }` | `{ camel: string, snake: string, kebab: string, pascal: string, original: string }` | `camel` = first word lowercase, rest capitalized. `pascal` = all words capitalized. `snake` = underscore-separated. `kebab` = hyphen-separated. | deterministic | More complete than the individual `text-*-case` endpoints. |
| `text-rot13` | `{ text: string (required) }` | `{ result: string }` | ROT13 applied to A-Z/a-z. Non-alpha unchanged. Applying twice must return original input. | deterministic | Duplicate of `encode-rot13`. |
| `text-caesar` | `{ text: string (required), shift?: number (default 3) }` | `{ result: string }` | Caesar shift applied to letters only. Shift of 13 must equal ROT13. Shift of 0 must return original. Negative shifts must work. | deterministic | None known. |
| `text-morse` | `{ text: string (required) }` | `{ morse: string }` | Standard ITU Morse. Letters separated by spaces, words by 3+ spaces. `.` and `-` only (plus space separators). | deterministic | Duplicate of `encode-morse`. Punctuation handling varies. |
| `text-binary` | `{ text: string (required) }` | `{ binary: string }` | Each character as 8-bit binary, space-separated. Must match character code values. | deterministic | ASCII only (8-bit). Unicode chars above 255 will be truncated/incorrect. |
| `text-leetspeak` | `{ text: string (required) }` | `{ result: string }` | Common leet substitutions: a->4, e->3, i->1, o->0, s->5, t->7 (or similar). Non-substituted chars pass through. | deterministic | Specific substitution map not documented. |
| `text-pig-latin` | `{ text: string (required) }` | `{ result: string }` | Consonant-initial words: move leading consonant cluster to end + "ay". Vowel-initial words: add "way" or "yay" to end. | deterministic | Punctuation handling may be inconsistent (e.g., `world.` -> `orld.way`). |

### 2.5 Text Splitting

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-sentence-split` | `{ text: string (required) }` | `{ sentences: string[], count: number }` | Split on `.!?` boundaries. `count` = `sentences.length`. Concatenating all sentences must approximately reconstruct original. | deterministic | Abbreviations (Mr., Dr., etc.) may cause false splits. |
| `text-split-sentences` | `{ text: string (required) }` | `{ sentences: string[], count: number }` | Same behavior as `text-sentence-split`. | deterministic | Duplicate of `text-sentence-split`. |
| `text-split-paragraphs` | `{ text: string (required) }` | `{ paragraphs: string[], count: number }` | Split on blank line (`\n\n`) boundaries. | deterministic | Returned 502 during testing -- may be unstable. |
| `text-chunk` | `{ text: string (required), chunk_size?: number (default 500), overlap?: number (default 0), method?: string (default "chars") }` | `{ chunks: string[], count: number, chunk_size: number, overlap: number }` | Each chunk's length must be <= `chunk_size`. Overlap regions must match between adjacent chunks. `count` = `chunks.length`. | deterministic | Chunking by "chars" may split mid-word. No "sentences" or "paragraphs" method documented/tested. |
| `text-tokenize` | `{ text: string (required), method?: string (default "word") }` | `{ tokens: string[], count: number, method: string }` | Word tokenization splits on whitespace. `count` = `tokens.length`. | deterministic | None known. |

### 2.6 Text Comparison

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-diff` | `{ a: string (required), b: string (required) }` | `{ added: string[], removed: string[], unchanged: number, total_changes: number }` | Line-by-line diff. `added` = lines in b not in a. `removed` = lines in a not in b. `total_changes` = `added.length + removed.length`. | deterministic | None known. |
| `text-diff-unified` | `{ a: string (required), b: string (required) }` | `{ unified: string, additions: number, deletions: number }` | `unified` must be valid unified diff format (starts with `---`/`+++`, uses `@@ @@` hunks). `additions` and `deletions` must be accurate. | deterministic | None known. |
| `text-diff-words` | `{ a: string (required), b: string (required) }` | `{ added: string[], removed: string[], common: number, similarity: number }` | Word-level diff. `similarity` is 0-1 ratio. `common` = count of shared words. | deterministic | In testing, single-field `text` input returns `similarity: 1` -- must provide both `a` and `b`. |
| `text-compare-similarity` | `{ a: string (required), b: string (required) }` | `{ jaccard: number, levenshtein_ratio: number, word_overlap_pct: number, common_words: string[], unique_to_a: string[], unique_to_b: string[], verdict: string }` | `jaccard` in [0,1]. `levenshtein_ratio` in [0,1]. `word_overlap_pct` in [0,100]. `verdict` in `["identical","similar","different","unrelated"]`. | statistical | None known. |
| `levenshtein-distance` | `{ source: string (required), target: string (required) }` | `{ distance: number, similarity: number, source_length: number, target_length: number }` | `distance` = minimum edit operations. `similarity` = `1 - (distance / max(source_length, target_length))`. | deterministic | None known. |

### 2.7 HTML Processing

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-strip-html` | `{ text: string (required) }` | `{ result: string }` | All HTML tags removed. Text content preserved. Entities NOT decoded. | deterministic | None known. |
| `text-escape-html` | `{ text: string (required) }` | `{ result: string }` | `<` -> `&lt;`, `>` -> `&gt;`, `&` -> `&amp;`, `"` -> `&quot;`, `'` -> `&#39;`. | deterministic | None known. |
| `text-unescape-html` | `{ text: string (required) }` | `{ result: string }` | Inverse of `text-escape-html`. Named and numeric entities decoded. | deterministic | None known. |
| `text-html-to-text` | `{ text: string (required) }` | `{ result: string, original_length: number }` | Tags stripped AND entities decoded. Whitespace normalized. `original_length` = input string length. | deterministic | None known. |
| `text-sanitize` | `{ text: string (required) }` | `{ result: string, threats_removed: number }` | Removes `<script>` tags, `on*` event handlers, `javascript:` URLs. Safe HTML preserved. `threats_removed` = count of removed threats. | deterministic | None known. |

### 2.8 Formatting

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-truncate` | `{ text: string (required), max_length: number (optional, default 100) }` | `{ result: string, truncated: boolean }` | If `text.length <= max_length`, return unchanged with `truncated: false`. Otherwise, truncate at word boundary and append `...`. Result length must be <= `max_length`. | deterministic | None known. |
| `text-lorem-ipsum` | `{ words: number (optional, default 50) }` | `{ text: string, words: number }` | Generated text must contain approximately `words` words. Must start with "Lorem ipsum". | deterministic | None known. |
| `text-table-format` | `{ rows: array of objects (required) }` | `{ table: string, columns: number, rows: number }` | ASCII table with pipe-delimited columns, aligned. Header row + separator + data rows. | deterministic | None known. |
| `text-tree-format` | `{ data: object (required) }` | `{ tree: string }` | ASCII tree using `+--`, `|`, indentation characters. Nested objects become child branches. | deterministic | None known. |
| `text-to-markdown-table` | `{ headers: string[] (required), rows: string[][] (required) }` | `{ markdown: string }` | Valid Markdown pipe table with header, separator row (`| --- |`), and data rows. | deterministic | None known. |
| `text-indent` | `{ text: string (required), spaces?: number (default 2) }` | `{ result: string, lines: number }` | Each line prepended with `spaces` number of space characters. `lines` = number of lines. | deterministic | None known. |
| `text-wrap` | `{ text: string (required), width?: number (default 80) }` | `{ result: string, lines: number }` | Word-wrap at `width` columns. No line exceeds `width` unless a single word is longer. `lines` = resulting line count. | deterministic | None known. |
| `text-pad` | `{ text: string (required), width?: number (default 20), char?: string (default " "), side?: string (default "right") }` | `{ left: string, right: string }` | `left` = left-padded to `width`. `right` = right-padded to `width`. Padding char used as fill. | deterministic | Always returns both left and right regardless of `side` param. |
| `text-repeat` | `{ text: string (required), count?: number (default 2) }` | `{ result: string }` | `result` = `text` concatenated `count` times. Max count = 100. | deterministic | No separator between repetitions. |
| `string-pad` | `{ text: string (required), width?: number (default 20), char?: string (default "*") }` | `{ result: string, original_length: number, padded_length: number }` | Right-padded with `char` to `width`. | deterministic | Overlaps with `text-pad`. |
| `string-wrap` | `{ text: string (required), width?: number (default 80) }` | `{ wrapped: string, lines: number, width: number }` | Word-wrap at column width. | deterministic | Duplicate of `text-wrap`. |
| `string-repeat` | `{ text: string (required), count?: number (default 3) }` | `{ result: string, length: number }` | `result` = text repeated `count` times. `length` = result string length. | deterministic | Duplicate of `text-repeat`. Different default count. |

### 2.9 Line Operations

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-deduplicate-lines` | `{ text: string (required) }` | `{ result: string, original_lines: number, unique_lines: number, removed: number }` | Duplicate lines removed, first occurrence kept. `removed` = `original_lines - unique_lines`. Order preserved. | deterministic | None known. |
| `text-sort-lines` | `{ text: string (required), reverse?: boolean, numeric?: boolean }` | `{ result: string, lines: number }` | If `numeric: false`, sort alphabetically (case-sensitive). If `numeric: true`, sort by numeric value. If `reverse: true`, descending. | deterministic | None known. |
| `text-remove-duplicates` | `{ text: string (required) }` | `{ result: string }` | Removes duplicate words (space-separated), preserving first occurrence order. | deterministic | Operates on words, not lines (despite potential confusion with `text-deduplicate-lines`). |

### 2.10 Template & String Utilities

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-template` | `{ template: string (required), variables: object (required) }` | `{ result: string, variables_replaced: number, variables_missing: string[] }` | All `{{key}}` placeholders replaced with corresponding `variables[key]` values. `variables_missing` lists unreplaced keys. | deterministic | Must use `variables` key, NOT `data`. |
| `string-template` | `{ template: string (required), vars: object (required) }` | `{ rendered: string, vars_applied: number, unresolved: number }` | Same as `text-template` but uses `vars` key. | deterministic | Duplicate of `text-template` with different param name. |
| `string-escape` | `{ text: string (required), format?: string (default "json") }` | `{ result: string, format: string, original_length: number }` | Escapes special characters for the specified format (JSON, HTML, URL, etc.). | deterministic | None known. |
| `string-unescape` | `{ text: string (required), format?: string (default "json") }` | `{ result: string, format: string }` | Reverse of `string-escape`. | deterministic | None known. |
| `string-between` | `{ text: string (required), start: string (required), end: string (required) }` | `{ result: string\|null, found: boolean }` | Extracts substring between first occurrence of `start` and first subsequent `end`. `found: false` if delimiters not found. | deterministic | None known. |
| `string-mask` | `{ text: string (required), char?: string (default "*"), keep_start?: number, keep_end?: number }` | `{ masked: string, original_length: number }` | Middle portion replaced with mask char. First `keep_start` and last `keep_end` chars preserved. | deterministic | Default keep amounts not documented. |

### 2.11 Quality & Linting

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-profanity-check` | `{ text: string (required) }` | `{ clean: boolean, profanity_found: string[], count: number }` | `clean: true` if no profanity detected. `count` = `profanity_found.length`. Word list-based matching. | deterministic | Limited word list. Will miss creative spellings, other languages, or context-dependent profanity. |
| `text-keyword-extract` | `{ text: string (required), top?: number (default 10) }` | `{ keywords: [{word, count}] }` | Top N keywords by frequency, excluding stop words ("the", "a", "is", etc.). Sorted descending by count. | deterministic | Stop word list is English-only. |
| `text-language-detect` | `{ text: string (required) }` | `{ detected: string, confidence: number }` | `detected` is ISO 639-1 code (e.g., "en", "fr", "es"). `confidence` in [0,1]. | statistical (heuristic) | Word-frequency heuristic, not ML-based. Low accuracy on short texts or mixed-language content. |
| `text-markdown-toc` | `{ text: string (required) }` | `{ toc: string, headings: array }` | Generates Markdown TOC from `#`-prefixed headings. Anchor links generated from heading text. | deterministic | None known. |
| `text-markdown-lint` | `{ text: string (required) }` | `{ issues: [{rule, line, message}], score: number }` | `score` 0-100 (100 = no issues). Issues include: trailing whitespace, missing blank lines, inconsistent list markers. | deterministic | Limited rule set compared to markdownlint. |
| `text-grammar-check` | `{ text: string (required) }` | `{ issues: [{type, message, position?}], score: number, stats: {sentences, avg_sentence_length, passive_count} }` | Rule-based checks: double spaces, repeated words, passive voice, long sentences. `score` 0-100. | deterministic | Not an LLM grammar checker. Limited to pattern-based rules. Will miss most real grammar errors. |
| `text-detect-encoding` | `{ text: string (required) }` | `{ encoding: string, has_unicode: boolean, has_emoji: boolean, has_cjk: boolean, byte_length: number }` | `encoding` in `["ascii","utf-8"]`. Boolean flags must be accurate. `byte_length` = UTF-8 byte size. | deterministic | None known. |

### 2.12 Sentiment & AI-Adjacent

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-vibe-check` | `{ text: string (required) }` | `{ vibe: string, score: number, energy: string, positive_words: number, negative_words: number, intensity: number, word_count: number }` | `vibe` in `["positive","negative","neutral"]`. `score` in [-1,1]. `energy` in `["low","medium","high"]`. Word-level sentiment analysis using lexicon. | statistical (lexicon) | Not LLM-based. Lexicon approach misses sarcasm, context, and nuance. |
| `text-crystallize` | `{ text: string (required) }` | `{ entities: [{entity, frequency, type}], relationships: [{subject, predicate, object, sentence}] }` | Extracts entities (nouns/concepts) and co-occurrence relationships. `type` typically "concept". | statistical (NLP heuristic) | Simple frequency + co-occurrence, not true NER or knowledge graph extraction. |
| `text-roast` | `{ text: string (required) }` | `{ roast: string, constructive_note: string, word_count: number, avg_word_length: number }` | `roast` is a humorous critique. `constructive_note` is encouraging. Stats must be accurate. | deterministic (template) | Template-based, not LLM. Humor quality varies. |
| `text-haiku` | `{ text: string (required) }` | `{ haiku: string, lines: [{text, target_syllables}] }` | Three lines targeting 5-7-5 syllable structure. Content derived from input text. | statistical (heuristic) | Syllable counting is approximate. Does not guarantee correct 5-7-5 counts. |
| `text-tldr` | `{ text: string (required) }` | `{ tldr: string, original_length: number, compression_ratio: string, method: "frequency_ranking" }` | Single-sentence summary. `compression_ratio` as percentage string. | statistical (extractive) | Not LLM-based. Extractive summarization by sentence scoring. Quality limited on complex text. |

### 2.13 Checks

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `text-palindrome` | `{ text: string (required) }` | `{ is_palindrome: boolean, cleaned: string }` | `cleaned` = lowercase, non-alphanumeric removed. `is_palindrome` = true iff `cleaned === cleaned.reverse()`. | deterministic | None known. |
| `text-anagram` | `{ a: string (required), b: string (required) }` | `{ is_anagram: boolean }` | `is_anagram: true` iff sorted lowercase letters of `a` equal sorted lowercase letters of `b`. | deterministic | When only `text` provided (no `a`/`b`), returns `true` -- must provide both fields explicitly. |

### 2.14 Fuzzy & N-Gram

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `fuzzy-match` | `{ query: string (required), candidates: string[] (required) }` | `{ matches: [{candidate, score}], count: number, best: {candidate, score}, query: string }` | `score` in [0,1] for each candidate. Sorted descending by score. `best` = highest scoring match. | statistical | None known. |
| `text-ngrams` | `{ text: string (required), n?: number (default 2) }` | `{ ngrams: string[], frequencies: [{ngram, count}], total: number, unique: number }` | N-grams of word sequences of length `n`. `total` = total n-gram count. `unique` = distinct n-grams. | deterministic | None known. |

---

## 3. Math & Numbers (46 endpoints)

### 3.1 Basic Math

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `math-evaluate` | `{ text: string (required) }` | `{ expression: string, result: number }` | Safe evaluation (no `eval`). Supports `+,-,*,/,^,%,()`. `expression` echoes input. `result` must be mathematically correct. | deterministic | No variable support. Exponent operator may be `^` not `**`. |
| `math-factorial` | `{ n: number (required) }` | `{ result: number\|string }` | `result` = `n!`. Uses BigInt for n > 20. Must be exact for n <= 170. | deterministic | Returns Infinity or errors for n > 170. |
| `math-fibonacci` | `{ n: number (required) }` | `{ sequence: number[] }` | Array of first `n` Fibonacci numbers starting from [0, 1, 1, 2, ...]. Length must equal `n`. | deterministic | Large `n` may hit precision limits. |
| `math-prime-check` | `{ number: number (required) }` | `{ is_prime: boolean, next_prime: number }` | Correct primality test. `next_prime` must be the smallest prime > `number`. | deterministic | Performance may degrade for very large numbers. |
| `math-gcd` | `{ numbers: number[] (required, 2+) }` | `{ gcd: number }` | Greatest common divisor via Euclidean algorithm. Must handle 2+ numbers. | deterministic | None known. |
| `math-lcm` | `{ numbers: number[] (required, 2+) }` | `{ lcm: number }` | Least common multiple. `lcm(a,b) = abs(a*b) / gcd(a,b)`. Must handle 2+ numbers. | deterministic | Potential overflow for large numbers. |
| `math-percentage` | `{ value: number (required), total: number (required) }` | `{ percentage: number }` | `percentage = (value / total) * 100`. | deterministic | None known. |
| `math-percentage-change` | `{ from: number (required), to: number (required) }` | `{ change: number, percentage: number, direction: string }` | `percentage = ((to - from) / from) * 100`. `direction` in `["increase","decrease","unchanged"]`. `change` = `to - from`. | deterministic | Division by zero if `from` is 0. |
| `math-clamp` | `{ value: number (required), min: number (required), max: number (required) }` | `{ result: number }` | `result = Math.max(min, Math.min(max, value))`. | deterministic | None known. |
| `math-lerp` | `{ a: number (required), b: number (required), t: number (required, 0-1) }` | `{ result: number }` | `result = a + (b - a) * t`. When t=0 returns a, when t=1 returns b. | deterministic | None known. |
| `math-distance` | `{ x1: number, y1: number, x2: number, y2: number }` | `{ distance: number }` | Euclidean: `sqrt((x2-x1)^2 + (y2-y1)^2)`. | deterministic | 2D only. |
| `math-combination` | `{ n: number (required), r: number (required) }` | `{ combination: number, permutation: number, n: number, r: number }` | `combination = n! / (r! * (n-r)!)`. `permutation = n! / (n-r)!`. | deterministic | None known. |
| `math-probability` | `{ favorable: number (required), total: number (required) }` | `{ probability: number, odds: string, percentage: number, complement: number }` | `probability = favorable / total`. `complement = 1 - probability`. `percentage = probability * 100`. | deterministic | None known. |

### 3.2 Conversion

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `math-base-convert` | `{ text: string (required), from_base: number (required, 2\|8\|10\|16), to_base: number (required) }` | `{ result: string, decimal: number, binary: string, hex: string }` | Correct base conversion. `decimal` always included as intermediary. `binary` and `hex` always populated regardless of target base. | deterministic | None known. |
| `math-unit-convert` | `{ value: number (required), from: string (required), to: string (required) }` | `{ result: number, from: string, to: string }` | Correct conversion factors for length (km, miles, m, ft), weight (kg, lbs, g, oz), temp (c, f, k), volume (l, gal), speed (mph, kph), data (b, kb, mb, gb, tb). | deterministic | Static conversion factors. Temperature requires formula, not just multiplication. |
| `math-currency-convert` | `{ amount: number (required), from: string (required), to: string (required) }` | `{ result: number, rate: number, from: string, to: string }` | `result = amount * rate`. Rates are static/periodically updated. | deterministic (with stale data) | Exchange rates are NOT real-time. Rates updated "periodically" (frequency unknown). |
| `math-color-convert` | `{ hex: string (required) }` | `{ hex: string, rgb: {r,g,b}, hsl: {h,s,l} }` | Correct hex-to-RGB and hex-to-HSL conversion. RGB values 0-255. HSL: h=0-360, s=0-100, l=0-100. | deterministic | Input is hex-only. Cannot input RGB or HSL and convert to hex. |
| `math-number-format` | `{ number: number (required), locale?: string (default "en-US"), currency?: string }` | `{ formatted: string, currency: string, percentage: string }` | Locale-aware formatting with thousands separators. `currency` formatted with symbol. `percentage` = number as percent. | deterministic | None known. |
| `math-degrees-to-radians` | `{ degrees: number (required) }` | `{ radians: number }` | `radians = degrees * (PI / 180)`. Must be precise to at least 10 decimal places. | deterministic | None known. |
| `math-radians-to-degrees` | `{ radians: number (required) }` | `{ degrees: number }` | `degrees = radians * (180 / PI)`. | deterministic | Floating point precision (e.g., PI -> 179.99985 instead of 180). |
| `math-expression-to-latex` | `{ expression: string (required) }` | `{ latex: string }` | Convert math expression to LaTeX. `*` -> `\cdot`, `^` -> superscript, etc. | deterministic | Limited transformation rules. Complex expressions may not convert correctly. |

### 3.3 Statistics

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `math-statistics` | `{ numbers: number[] (required) }` | `{ count, sum, mean, median, stddev, min, max }` | All values must be mathematically correct. `stddev` = population standard deviation. `median` = middle value (average of two middle for even-length). | statistical | None known. |
| `math-percentile` | `{ numbers: number[] (required), percentile: number (required, 0-100) }` | `{ value: number, percentile: number }` | Correct percentile via linear interpolation. P50 = median. P0 = min. P100 = max. | statistical | None known. |
| `math-histogram` | `{ numbers: number[] (required), bins?: number (default 10) }` | `{ bins: [{from, to, count}], total: number }` | Bins must cover full range [min, max]. Sum of all bin counts must equal total array length. | statistical | None known. |
| `stats-mean` | `{ data: number[] (required) }` | `{ mean: number, count: number }` | `mean = sum(data) / data.length`. | statistical | Input key is `data`, not `numbers`. |
| `stats-median` | `{ data: number[] (required) }` | `{ median: number, count: number }` | Middle value of sorted array. Average of two middle values for even-length arrays. | statistical | Input key is `data`. |
| `stats-stddev` | `{ data: number[] (required) }` | `{ stddev: number, variance: number, mean: number, count: number }` | Population stddev. `variance = stddev^2`. | statistical | Input key is `data`. |
| `stats-percentile` | `{ data: number[] (required), percentile?: number (default 50) }` | `{ percentile: number, value: number, count: number }` | Same computation as `math-percentile`. | statistical | Duplicate of `math-percentile` with different input format. |
| `stats-correlation` | `{ x: number[] (required), y: number[] (required) }` | `{ correlation: number, n: number }` | Pearson correlation coefficient in [-1, 1]. `n` = array length. Arrays must be same length. | statistical | None known. |
| `stats-histogram` | `{ data: number[] (required), bins?: number (default 10) }` | `{ histogram: number[], min, max, bin_width, count }` | `histogram` = array of counts per bin. `bin_width = (max - min) / bins`. | statistical | Different output format from `math-histogram` (array vs objects). |
| `stats-summary` | `{ data: number[] (required) }` | `{ count, min, max, mean, median, stddev, variance, p25, p75 }` | Complete statistical summary. All values mathematically correct. `p25` and `p75` are 25th and 75th percentiles. | statistical | None known. |

### 3.4 Financial

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `math-compound-interest` | `{ principal: number (required), rate: number (required, e.g. 0.07), years: number (required), compounds_per_year?: number (default 12) }` | `{ final_amount: number, interest_earned: number }` | `final_amount = principal * (1 + rate/n)^(n*years)`. `interest_earned = final_amount - principal`. | deterministic | None known. |
| `math-loan-payment` | `{ principal: number (required), annual_rate: number (required), years: number (required) }` | `{ monthly_payment: number, total_paid: number, total_interest: number }` | Standard amortization formula. `total_paid = monthly_payment * years * 12`. `total_interest = total_paid - principal`. | deterministic | None known. |
| `math-mortgage-amortize` | `{ principal: number (required), annual_rate: number (required), years: number (required) }` | `{ monthly_payment: number, schedule: [{month, payment, principal, interest, balance}], total_paid: number, total_interest: number }` | Full amortization schedule month-by-month. Final balance must be 0 (or near-zero due to rounding). `schedule.length = years * 12`. | deterministic | Large schedules (30yr = 360 entries) -- response may be large. |
| `math-roi-calculate` | `{ cost: number (required), revenue: number (required) }` | `{ profit: number, roi_percent: number }` | `profit = revenue - cost`. `roi_percent = (profit / cost) * 100`. | deterministic | None known. |
| `math-tax-estimate` | `{ income: number (required), filing_status: string (required, "single"\|"married") }` | `{ tax: number, effective_rate: number, marginal_rate: number, brackets: [{rate, income, tax}] }` | US federal brackets applied correctly. `effective_rate = (tax / income) * 100`. `marginal_rate` = top bracket rate applicable. | deterministic | Tax brackets may be outdated. Does not account for deductions, credits, state tax, FICA. |

### 3.5 Data Analysis

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `math-linear-regression` | `{ x: number[] (required), y: number[] (required) }` | `{ slope: number, intercept: number, r_squared: number, equation: string, n: number }` | Least squares regression. `equation` format: `"y = {slope}x + {intercept}"`. `r_squared` in [0,1]. Arrays must be same length. | statistical | None known. |
| `math-moving-average` | `{ data: number[] (required), window?: number (default 2) }` | `{ result: number[], window: number, points: number }` | Simple moving average. `result.length = data.length - window + 1`. Each value = mean of `window`-sized sliding window. | statistical | Input key is `data`. |
| `math-normalize` | `{ data: number[] (required) }` | `{ result: number[], min: number, max: number, method: "minmax" }` | Min-max normalization: `(x - min) / (max - min)`. All values in [0,1]. Min maps to 0, max maps to 1. | statistical | Only supports min-max method (no z-score normalization). |
| `math-zscore` | `{ data: number[] (required) }` | `{ zscores: number[], mean: number, std: number }` | `zscore[i] = (data[i] - mean) / std`. Mean of z-scores should be ~0. | statistical | Input key is `data` (confirmed via error message "array"). |
| `data-forecast` | `{ data: number[] (required), steps?: number (default 3) }` | `{ trend: string, slope: number, intercept: number, forecast: [{step, value}], input_points: number }` | Linear trend extrapolation. `trend` in `["upward","downward","flat"]`. `forecast` contains `steps` future predictions. | statistical | Simple linear extrapolation only -- not suitable for nonlinear trends. |
| `math-interpolate` | `{ points: number[][] (required, [[x,y],...]), x_target?: number }` | `{ x: number, y: number, method: "linear", points: number }` | Linear interpolation between provided points. If `x_target` given, returns interpolated `y` at that `x`. | statistical | Linear only. No spline/polynomial interpolation. |
| `math-symbolic-simplify` | `{ expression: string (required) }` | `{ original: string, simplified: string, evaluated: number, rules_applied: string }` | Attempts algebraic simplification. `evaluated` is numeric evaluation (substituting x=3 or similar default). | deterministic | Very limited simplification engine. In testing, `2*x + 3*x + 5 - 2` was NOT simplified to `5*x + 3`. `rules_applied: "none"` in most cases. |

### 3.6 Simulation

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `monte-carlo` | `{ model: { variables: { [name]: {min, max} } }, iterations?: number (default 1000) }` | `{ iterations: number, mean: number, ... }` | Runs N random simulations over variable ranges. Returns statistical summary (mean, median, p5, p95). | statistical (stochastic) | In testing, returned `mean: 0` -- expression/formula field appears to be missing or broken. The API accepts the model but does not compute a derived metric. |
| `scenario-tree` | `{ root: string (required), branches: [{name, probability, value}] (required) }` | `{ root: string, expected_value: number, probability_sum: number, best_branch: string, branches: [{name, probability, value, weighted_value}] }` | `expected_value = sum(probability * value)`. `probability_sum` should equal 1.0. `weighted_value = probability * value` for each branch. `best_branch` = highest weighted value. | deterministic | Does not support nested/multi-level trees despite "tree" name. |

### 3.7 Matrix

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `math-matrix-multiply` | `{ a: number[][] (required), b: number[][] (required) }` | `{ result: number[][], rows: number, cols: number }` | Standard matrix multiplication. `a` cols must equal `b` rows. Result dimensions: `a.rows x b.cols`. Each cell `result[i][j] = sum(a[i][k] * b[k][j])`. | deterministic | None known. |

---

## 4. Cross-Cutting Issues

### 4.1 Duplicate Endpoints

The following pairs/groups are functional duplicates with different slugs:

| Primary | Duplicate(s) | Notes |
|---------|-------------|-------|
| `crypto-hmac` | `hash-hmac` | `hash-hmac` adds `input_length` field |
| `crypto-checksum` | `hash-checksum`, `crypto-checksum-file` | `hash-checksum` is MD5-only; `crypto-checksum-file` adds SHA-512 |
| `text-regex-replace` | `regex-replace` | Same behavior |
| `text-sentence-split` | `text-split-sentences` | Same behavior |
| `text-rot13` | `encode-rot13` | Same behavior |
| `text-morse` | `encode-morse` | Same behavior |
| `text-repeat` | `string-repeat` | Different default count (2 vs 3) |
| `text-pad` | `string-pad` | Different output format |
| `text-wrap` | `string-wrap` | Different output field names |
| `text-template` | `string-template` | Different param names (`variables` vs `vars`) |
| `text-camel-case` | `string-camel-case` | `string-camel-case` returns all case variants |
| `text-extract-urls` | `text-extract-links` | `extract-links` deduplicates |
| `math-percentile` | `stats-percentile` | Different input key (`numbers` vs `data`) |
| `math-histogram` | `stats-histogram` | Different output format (objects vs array) |
| `math-statistics` | `stats-summary` | `stats-summary` adds p25/p75 |

### 4.2 Endpoints That Returned Errors During Testing

| Slug | Error | Status |
|------|-------|--------|
| `text-split-paragraphs` | 502 Bad Gateway ("Application failed to respond") | Possibly broken or timing out. |

### 4.3 Endpoints With Misleading Names

| Slug | Issue |
|------|-------|
| `crypto-checksum-file` | Accepts `content` string, not actual file upload |
| `text-camel-case` | Produces PascalCase (uppercase first letter), not true camelCase |
| `monte-carlo` | Accepts model structure but returns `mean: 0` -- formula evaluation appears non-functional |
| `math-symbolic-simplify` | Reports `rules_applied: "none"` for simplifiable expressions like `2*x + 3*x` |
| `decoy-resource` | No actual monitoring -- just generates honeypot metadata |

### 4.4 Input Field Name Inconsistencies

| Pattern | Endpoints Using It |
|---------|--------------------|
| `text` (string input) | Most text and crypto endpoints |
| `content` | `crypto-checksum`, `crypto-checksum-file` |
| `numbers` (array) | `math-statistics`, `math-percentile`, `math-histogram`, `math-gcd`, `math-lcm` |
| `data` (array) | `stats-mean`, `stats-median`, `stats-stddev`, `stats-percentile`, `stats-histogram`, `stats-summary`, `math-moving-average`, `math-normalize`, `math-zscore`, `data-forecast` |
| `a` / `b` (comparison) | `text-diff`, `text-diff-unified`, `text-diff-words`, `text-compare-similarity`, `text-anagram`, `math-matrix-multiply` |
| `source` / `target` | `levenshtein-distance` |
| `template` + `variables` | `text-template` |
| `template` + `vars` | `string-template` |

### 4.5 Credit Costs

| Cost | Endpoints |
|------|-----------|
| 0 credits | All `encode-*`, `hash-*`, `secret-share`, `commitment-scheme`, `cipher-create`, `decoy-resource`, `csp-header-parse`, all `text-caesar` through `text-binary`, all `text-palindrome` through `text-extract-tables`, `string-*`, `regex-*`, `fuzzy-match`, `text-diff-words`, `text-ngrams`, `text-tokenize`, `text-crystallize`, `text-roast`, `text-haiku`, `text-tldr`, `text-to-markdown-table`, `levenshtein-distance`, all `math-` zero-credit endpoints, `data-forecast`, `monte-carlo`, `scenario-tree` |
| 1 credit | Most core crypto/text/math endpoints |
| 3 credits | `text-diff`, `text-diff-unified`, `text-compare-similarity`, `text-grammar-check`, `text-keyword-extract`, `text-chunk`, `math-statistics`, `math-histogram`, `math-mortgage-amortize`, `math-tax-estimate`, `math-expression-to-latex` |
