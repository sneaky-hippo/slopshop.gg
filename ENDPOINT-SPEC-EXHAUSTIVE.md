# SlopShop.gg Exhaustive Endpoint Specification

**Generated**: 2026-03-29
**Base URL**: `https://slopshop.gg/v1/{slug}`
**Auth**: `Authorization: Bearer <api-key>`
**Method**: `POST` with JSON body

All responses wrap in: `{ ok: true, data: { ... }, meta: { api, credits_used, latency_ms, engine, confidence, output_hash }, guarantees: { schema_valid, validated, fallback_used, output_hash } }`

---

## Table of Contents

1. [Network & DNS (28)](#1-network--dns-28-endpoints)
2. [Sense: Web (32)](#2-sense-web-32-endpoints)
3. [Enrich (20)](#3-enrich-20-endpoints)
4. [Code Utilities (27)](#4-code-utilities-27-endpoints)
5. [Generate (59)](#5-generate-59-endpoints)
6. [Communicate (16)](#6-communicate-16-endpoints)

---

## 1. Network & DNS (28 endpoints)

### DNS Resolution

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `net-dns-a` | `{ "domain": string }` (required) | `{ domain, type: "A", records: string[] }` | Each record must be a valid IPv4 address (dotted-quad notation). Empty array is valid if domain has no A records. | network | None known |
| `net-dns-aaaa` | `{ "domain": string }` (required) | `{ domain, type: "AAAA", records: string[] }` | Each record must be a valid IPv6 address. Empty array is valid. | network | None known |
| `net-dns-mx` | `{ "domain": string }` (required) | `{ domain, type: "MX", records: [{ exchange: string, priority: number }] }` | Each exchange must be a valid hostname. Priority must be non-negative integer. Empty exchange with priority 0 indicates no MX configured. | network | Returns `{ exchange: "", priority: 0 }` for domains without MX instead of empty array |
| `net-dns-txt` | `{ "domain": string }` (required) | `{ domain, type: "TXT", records: string[] }` | Records are raw TXT strings (SPF, DKIM, DMARC, verification tokens, etc.). Must be verbatim DNS content. | network | None known |
| `net-dns-ns` | `{ "domain": string }` (required) | `{ domain, type: "NS", records: string[] }` | Each record must be a valid nameserver FQDN. | network | None known |
| `net-dns-all` | `{ "domain": string }` (required) | `{ domain, A: string[], AAAA: string[], MX: [{ exchange, priority }], TXT: string[], NS: string[] }` | Combined output of A + AAAA + MX + TXT + NS lookups. All individual record rules apply. | network | None known |
| `net-dns-cname` | `{ "domain": string }` (required) | `{ domain, type: "CNAME", records: string[] }` | Returns the CNAME target hostname. ENODATA error is normal for domains without CNAME records. | network | Returns `{ error: "DNS resolution failed", code: "ENODATA" }` instead of empty records for non-CNAME domains |
| `net-dns-reverse` | `{ "ip": string }` (required) | `{ ip, hostnames: string[] }` | Each hostname must be a valid FQDN. Requires IP input, not domain. | network | Returns confusing `getHostByAddr EINVAL` error if domain is passed instead of IP |
| `net-dns-lookup` | `{ "domain": string, "type"?: string }` | `{ A: string[], AAAA: string[] }` | General-purpose DNS lookup. Returns A and AAAA by default. | network | Type parameter appears to be ignored; always returns A + AAAA only |
| `net-dns-propagation` | See Sense: Web `sense-dns-propagation` | -- | -- | -- | Duplicate - see Sense: Web |

### HTTP Inspection

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `net-http-status` | `{ "url": string }` (required, full URL with protocol) | `{ url, status_code: number, headers: object, timing_ms: number }` | Status code must be valid HTTP status (100-599). Timing must be non-negative. | network | Returns 502 error for some HTTPS targets due to server-side TLS cert validation failure ("unable to get local issuer certificate") |
| `net-http-headers` | `{ "url": string }` (required) | `{ url, headers: object, timing_ms: number }` | Headers object must contain standard HTTP response headers as key-value pairs. | network | Same TLS certificate validation bug as net-http-status |
| `net-http-redirect-chain` | `{ "url": string }` (required) | `{ url, chain: [{ url, status? , error? }], final_url: string, hops: number }` | Chain must show each redirect hop with URL and status code. Final URL is the terminal destination. | network | TLS cert validation errors propagate into chain entries instead of actual redirect data |
| `net-http-options` | `{ "url": string }` (required) | `{ url, methods: string[], cors_headers: object }` | Must return allowed HTTP methods and CORS headers (Access-Control-Allow-*). | network | TLS cert issue same as other HTTP endpoints |
| `net-url-status` | `{ "url": string }` (required) | `{ url, status_code: number, timing_ms: number }` | Lightweight version of net-http-status. Returns status code only. | network | TLS cert issue same as other HTTP endpoints |
| `net-url-headers` | `{ "url": string }` (required) | `{ url, headers: object }` | Same as net-http-headers but 3 credits instead of 5. | network | TLS cert issue same as other HTTP endpoints |
| `net-url-redirect-chain` | `{ "url": string }` (required) | `{ url, chain: object[], final_url: string }` | Same as net-http-redirect-chain but 3 credits instead of 5. | network | TLS cert issue same as other HTTP endpoints |

### SSL / TLS

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `net-ssl-check` | `{ "domain": string }` (required, bare domain, no protocol) | `{ subject, issuer, valid_from, valid_to, days_remaining: number, hostname }` | Subject and issuer must be valid X.509 distinguished names. Days remaining must be computed against current date. | network | TLS connection fails with "unable to get local issuer certificate" for many domains due to server-side CA trust store issue |
| `net-ssl-expiry` | `{ "domain": string }` (required) | `{ domain, valid_to, days_remaining, hostname }` | Lightweight SSL check focused on expiry date only. | network | Same TLS trust store issue as net-ssl-check |

### Email & IP Validation

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `net-email-validate` | `{ "email": string }` (required) | `{ email, format_valid: bool, domain, mx_valid: bool, mx_records: [{ exchange, priority }], mx_error, overall_valid: bool }` | Format validation must check RFC 5322 compliance. MX check must do real DNS lookup. Overall valid requires both format and MX. | network | None known |
| `net-ip-validate` | `{ "ip": string }` (required) | `{ ip, is_valid: bool, version: 4\|6, is_private: bool }` | Must correctly identify IPv4 vs IPv6. Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7. | compute | None known |
| `net-ip-is-private` | `{ "ip": string }` (required) | `{ ip, is_private: bool, version: 4\|6 }` | Must return true for RFC 1918 (v4) or ULA (v6) addresses. | compute | None known |
| `net-ip-info` | `{ "ip": string }` (required) | `{ ip, version: 4\|6, private: bool, public: bool, loopback: bool, class: string }` | Class must be A/B/C/D/E for IPv4. Loopback must be true for 127.0.0.0/8. | network | None known |

### CIDR / URL Utilities

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `net-cidr-contains` | `{ "ip": string, "cidr": string }` (both required) | `{ ip, cidr, contains: bool }` | Must correctly compute whether IP falls within the CIDR prefix. | compute | None known |
| `net-url-parse` | `{ "url": string }` (required) | `{ url, protocol, username, password, hostname, port, pathname, search, query_params: object, hash, origin, href }` | Must correctly decompose all URL components per WHATWG URL spec. | compute | None known |
| `net-url-build` | `{ "hostname": string }` (required) + `{ "protocol"?: string, "path"?: string, "query"?: object }` | `{ url: string }` | Must produce a valid, well-formed URL from components. | compute | Protocol and path params may not be applied; returned URL was just `https://example.com/` ignoring path and query |
| `net-url-normalize` | `{ "url": string }` (required) | `{ original, normalized: string }` | Must lowercase scheme and host, remove default ports (80/443), sort query params alphabetically. | compute | None known |

### WHOIS & Domain

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `net-whois` | `{ "domain": string }` (required) | `{ domain, raw: string }` | Raw WHOIS text from registry. Must include registrar, creation date, expiry, nameservers when available. | network | Returns IANA WHOIS for some TLDs rather than the registrar-level WHOIS. Partial data only. |
| `net-domain-validate` | `{ "domain": string }` (required) | `{ domain, syntax_valid: bool, dns_resolvable: bool, has_a: bool, has_aaaa: bool, has_mx: bool, has_ns: bool, dns_error, overall_valid: bool }` | Syntax validation must check label lengths, allowed chars, TLD existence. DNS checks must be real lookups. | compute + network | None known |

---

## 2. Sense: Web (32 endpoints)

### URL Content Extraction

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `sense-url-content` | `{ "url": string }` (required, full URL) | `{ url, title, text: string, word_count: number, fetch_time_ms }` | Text must be stripped of all HTML, scripts, styles. Must represent the readable content a human would see. Word count must match actual words in text. | network | None known |
| `sense-url-links` | `{ "url": string }` (required) | `{ links: string[], internal_count: number, external_count: number, total: number }` | Links must be absolute URLs. Internal/external classification must be based on hostname comparison. Total must equal internal_count + external_count. | network | Links returned as flat string array without anchor text or internal/external flag per link (description promises richer output) |
| `sense-url-meta` | `{ "url": string }` (required) | `{ url, title, description, og: { title, description, image }, canonical }` | Title must match HTML `<title>` tag. OG values must come from `<meta property="og:*">` tags. Canonical from `<link rel="canonical">`. Empty string if absent. | network | None known |
| `sense-url-tech-stack` | `{ "url": string }` (required) | `{ technologies: string[], url }` | Must detect real technologies from HTML patterns, JS globals, HTTP headers. Technologies must be real framework/library/service names. | network | Returns empty array for simple sites; detection relies on known pattern signatures |
| `sense-url-screenshot-text` | `{ "url": string }` (required) | `{ text: string, word_count: number }` | Visible-text extraction excluding hidden elements, nav boilerplate, scripts, styles. Structured as screen reader would present. | network | Output appears identical to sense-url-content for simple pages; no structural section markers |
| `sense-url-word-count` | `{ "url": string }` (required) | `{ words: number, url }` | Word count of visible text content after stripping HTML. | network | Does not return sentence count, paragraph count, reading time, or frequent terms as described in catalog |
| `sense-url-diff` | `{ "url_a": string, "url_b": string }` (both required) | `{ similarity: number, added_lines: number, removed_lines: number }` | Similarity should be 0-1 float (1 = identical). Added/removed must be non-negative. | network | Note: input field names are `url_a` and `url_b`, not `url1`/`url2` |

### Performance & Uptime

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `sense-url-response-time` | `{ "url": string }` (required) | `{ times_ms: number[], avg_ms, min_ms, max_ms }` | Multiple HTTP requests (typically 3). All values in milliseconds, non-negative. avg_ms must be arithmetic mean of times_ms array. | network | None known |
| `sense-url-performance` | `{ "url": string }` (required) | `{ ttfb_ms, total_ms, url }` | TTFB (time to first byte) must be less than or equal to total_ms. Both non-negative. | network | Does not return DNS resolution time or TCP connection time as described in catalog |
| `sense-uptime-check` | `{ "url": string }` (required) | `{ url, up: bool, status_code: number, latency_ms, timestamp: ISO8601 }` | `up` must be true for 2xx/3xx status codes. Timestamp must be current server time. | network | None known |
| `sense-port-open` | `{ "host": string, "port": number }` (both required) | `{ host, port, open: bool, latency_ms }` | TCP connection attempt. Open = true if connection succeeds. Latency in milliseconds. | network | None known |

### SEO & Web Standards

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `sense-url-sitemap` | `{ "url": string }` (required, domain or sitemap URL) | `{ urls: string[], count: number }` | Must fetch and parse sitemap.xml. URLs must be valid. Count must match array length. | network | Does not return lastmod, changefreq, or priority per URL as described |
| `sense-url-robots` | `{ "url": string }` (required) | `{ rules: object[], sitemaps: string[] }` | Must fetch and parse robots.txt. Rules structured by user-agent with allow/disallow paths. | network | None known |
| `sense-url-feed` | `{ "url": string }` (required, feed URL) | `{ format: "rss"\|"atom", items: object[], count: number }` | Must parse RSS or Atom XML. Items should have title, link, date, summary. | network | Returns empty items array if URL is not actually a feed; no error reported |
| `sense-rss-latest` | `{ "url": string, "count"?: number }` (url required) | `{ items: [{ title, link, date }], count: number }` | Items sorted by publication date descending. Count defaults to 10. Title may be empty string. | network | Title extraction sometimes returns empty strings for valid feed items |
| `sense-url-accessibility` | `{ "url": string }` (required) | `{ issues: object[], score: number, checks_passed: number }` | Score 0-100. Issues include missing alt text, heading hierarchy, missing form labels. | network | None known |
| `sense-url-broken-links` | `{ "url": string }` (required) | `{ checked: number, broken: object[], ok: number }` | Extracts all links from page, checks each with HEAD request. Broken array contains URLs returning 4xx/5xx. | network | High latency (checks all links sequentially). 5 credits. |
| `sense-http-headers-security` | `{ "url": string }` (required) | `{ present: string[], missing: string[], score: number, grade: string }` | Checks: strict-transport-security, content-security-policy, x-frame-options, x-content-type-options, x-xss-protection, referrer-policy, permissions-policy. Grade A-F based on presence count. | network | None known |

### DNS & Domain Intelligence

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `sense-whois` | `{ "domain": string }` (required) | `{ domain, nameservers: string[], note }` | Returns parsed WHOIS data: nameservers at minimum. | network | Returns only nameservers and a note saying "Full WHOIS requires external service". Does not return registrar, dates, registrant as described. |
| `sense-domain-expiry` | `{ "domain": string }` (required) | `{ domain, nameservers: string[], soa_serial, note }` | Should return expiry date and days remaining. | network | Does not return expiry date, days remaining, or warning flag as described. Returns only nameservers and SOA serial with note "Full expiry requires WHOIS". |
| `sense-dns-propagation` | `{ "domain": string, "type"?: string }` (domain required) | `{ results: [{ resolver, addresses: string[] }], consistent: bool }` | Queries multiple public resolvers (8.8.8.8, 1.1.1.1, 208.67.222.222). Consistent = true when all resolvers return same records. | network | None known |
| `sense-ct-logs` | `{ "domain": string }` (required) | `{ domain, certificates?: object[], subdomains?: string[] }` | Queries crt.sh certificate transparency logs. Returns issued certificates and discovered subdomains. | network | Frequently times out (15s+ latency). Returns `{ error: "Timeout" }` in data for popular domains. |
| `sense-subdomains` | `{ "domain": string }` (required) | `{ domain, found: number, subdomains: [{ subdomain, ips: string[] }] }` | Brute-force subdomain enumeration via DNS. Checks common prefixes (www, api, dev, staging, admin, etc.). | network | 5 credits. Limited to a predefined prefix list; does not use certificate transparency or other advanced methods. |

### IP & Geolocation

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `sense-ip-geo` | `{ "ip": string }` (required) | `{ ip, region, note }` | Returns approximate geographic region for IP. | network | Returns only broad region (e.g., "North America"), not country, city, lat/lng, or timezone as described in catalog. Note says "Approximate based on IP ranges". |

### Time

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `sense-time-now` | `{ "timezone": string }` (required, IANA timezone ID) | `{ iso, unix, timezone, offset, formatted }` | ISO must be valid ISO 8601. Unix must be epoch seconds. Offset must match timezone's current UTC offset (accounting for DST). Formatted must be human-readable in the requested timezone. | compute | None known |
| `sense-time-zones` | `{}` (no required params) | `{ timezones: [{ name, offset, region }] }` | Must include all major IANA timezones. Offsets must be current (DST-aware). | compute | Does not appear to include all IANA timezones; returns a curated subset |

### Crypto & Package Registries

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `sense-crypto-price` | `{ "symbol"?: string, "currency"?: string }` | `{ prices: { bitcoin: { usd: number }, ethereum: { usd: number } } }` | Uses CoinGecko API. Prices must be current (within 5 min). | network | Always returns both BTC and ETH regardless of symbol param. Ignores currency param (always USD). |
| `sense-github-repo` | `{ "repo": string }` (required, format "owner/name") | `{ name, description, stars, forks, language, open_issues, created_at, updated_at }` | Data from GitHub API. Star/fork counts must be non-negative integers. Dates must be ISO 8601. | network | Input must be "owner/name" format (not separate owner + repo fields). Returns 404 if format is wrong. |
| `sense-github-releases` | `{ "repo": string, "count"?: number }` (repo required) | `{ releases: [{ tag, name, date }] }` | Returns latest N releases. Tags must match actual GitHub release tags. | network | Same "owner/name" format requirement as sense-github-repo |
| `sense-github-user` | `{ "username": string }` (required) | `{ login, name, bio, public_repos, followers }` | Public GitHub profile data. Followers/repos must be non-negative. | network | Returns minimal fields compared to full GitHub user API (missing company, location, website, following, created_at) |
| `sense-npm-package` | `{ "package": string }` (required) | `{ name, version, description, weekly_downloads, homepage, repository, license, dependencies_count }` | Data from npm registry. Version must be valid semver. Downloads must be non-negative. | network | None known |
| `sense-pypi-package` | `{ "package": string }` (required) | `{ name, version, summary, author }` | Data from PyPI JSON API. Version must be valid. | network | Returns only 4 fields; missing homepage, license, release_date, required_python as described |

---

## 3. Enrich (20 endpoints)

### URL & Domain Enrichment

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `enrich-url-to-title` | `{ "url": string }` (required) | `{ title, url }` | Returns page `<title>` tag content. Falls back to og:title. | network | Returned "Example" instead of "Example Domain" for example.com (truncated) |
| `enrich-domain-to-company` | `{ "domain": string }` (required) | `{ company, domain }` | Must return recognized brand/company name. Strips TLD, applies known-brand lookup table, capitalization rules. | compute | Works well for known brands. Unknown domains get naive capitalization of domain label. |

### Email Enrichment

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `enrich-email-to-domain` | `{ "email": string }` (required) | `{ domain, local_part }` | Must correctly split email at @ sign. Domain normalized to lowercase. | compute | Does not return TLD, subdomain, free provider flag, or corporate flag as described |
| `enrich-email-to-name` | `{ "email": string }` (required) | `{ name, email }` | Must parse local part for dot/underscore/hyphen separated names. Capitalize first letters. | compute | Does not return separate first/last name or confidence score as described |

### Phone & IP

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `enrich-phone-to-country` | `{ "phone": string }` (required, E.164 format with + prefix) | `{ country, code, prefix }` | Must correctly identify country from international dialing code. | compute | Does not return ISO code (returns "GB" not full info), or ambiguity flag as described |
| `enrich-ip-to-asn` | `{ "ip": string }` (required) | `{ ip, is_private, network_class }` | Should return ASN number and organization name. | compute | Does NOT return ASN number, organization name, or network prefix. Returns only is_private and network_class (e.g., "Class A"). Fundamentally incomplete. |

### Code / Format Lookups

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `enrich-country-code` | `{ "query": string }` (required -- name, ISO2, ISO3, or numeric) | `{ name, iso2, iso3, found: bool }` | Must convert between country identifier formats. Found = false if no match. | compute | Does not return numeric code, region, subregion, or capital as described. Returns only name + iso2 + iso3. |
| `enrich-language-code` | `{ "query": string }` (required -- name or ISO 639-1/2 code) | `{ name, code, found: bool }` | Must convert between language identifier formats. | compute | Does not return native name, script, direction (LTR/RTL), BCP 47 tag, or ISO 639-2/T as described |
| `enrich-mime-type` | `{ "extension": string }` or `{ "mime": string }` (one required) | `{ extension, mime, category }` | Must map file extensions to MIME types and vice versa. Category like "document", "image", "audio". | compute | Does not return compressible flag, binary flag, or common aliases as described |
| `enrich-http-status-explain` | `{ "code": number }` (required) | `{ code, status, description, category }` | Must return official HTTP status name and plain-English description. Category: Informational/Success/Redirection/Client Error/Server Error. | compute | Does not return RFC reference, common mistakes, or client guidance as described |
| `enrich-port-service` | `{ "port": number }` (required) | `{ port, service, protocol, description }` | Must return well-known service name for standard ports (e.g., 443 = HTTPS). | compute | Does not return IANA registration status or whether it is unofficial as described |
| `enrich-useragent-parse` | `{ "useragent": string }` (required -- note field name is `useragent`) | `{ browser, version, os, device }` | Must detect browser name, OS, device type (Desktop/Mobile/Tablet/Bot). | compute | Browser detection is weak; returns "Unknown" for partial UA strings. Does not return rendering engine or crawler flag as described. |
| `enrich-accept-language-parse` | `{ "header": string }` (required) | `{ languages: [{ code, quality: number }] }` | Must parse Accept-Language header per RFC 7231. Quality weights 0-1. Sorted by quality descending. | compute | Does not return language name, region, or BCP 47 tag per entry as described |
| `enrich-crontab-explain` | `{ "cron": string }` (required, 5 or 6 field format) | `{ cron, explanation, fields: { minute, hour, dom, month, dow } }` | Plain English explanation must correctly describe schedule. Fields must be parsed components. | compute | Does not return next 10 execution times or timezone support as described |
| `enrich-semver-explain` | `{ "range": string }` (required) | `{ range, explanation, min_version, max_version }` | Must explain what versions the range matches. Min/max must be correct bounds. | compute | None known |
| `enrich-license-explain` | `{ "license": string }` (required -- name or SPDX ID) | `{ license, type, can_commercial: bool, must_disclose_source: bool, must_include_license: bool, description }` | Must correctly classify permissive vs copyleft. Permissions/requirements must be accurate to actual license terms. | compute | None known |
| `enrich-timezone-info` | `{ "timezone": string }` (required, IANA ID) | `{ timezone, utc_offset, region, cities: string[] }` | Must return current UTC offset (DST-aware). Cities must be real cities in the timezone. | compute | Does not return DST transition dates, standard/daylight abbreviations as described |
| `enrich-emoji-info` | `{ "emoji": string }` (required, emoji character or shortcode) | `{ emoji, name, category, unicode }` | Must return official Unicode name, category, and codepoint(s). | compute | Fails on actual emoji characters (returns "Unknown" for all fields). Likely a UTF-8 encoding issue with the emoji reaching the server. |
| `enrich-color-name` | `{ "hex": string }` (required, with # prefix) | `{ hex, nearest_name, nearest_hex, distance: number }` | Must use perceptual color distance. Nearest name should be recognizable (CSS named color or Pantone). Distance = 0 means exact match. | compute | Returned "turquoise" for #3B82F6 (which is cornflower blue). Color distance algorithm may not be CIEDE2000. No Pantone name returned as described. |
| `enrich-file-extension-info` | `{ "extension": string }` (required, with dot prefix) | `{ extension, name, category, description }` | Must return format name and description. Category like "document", "code", "archive". | compute | Returns "Unknown" for many valid extensions (.parquet, .wasm, .avro). Lookup database is very limited. |

---

## 4. Code Utilities (27 endpoints)

### Code Generation from JSON

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `code-json-to-typescript` | `{ "json": object, "name"?: string }` (json required) | `{ typescript: string }` | Must produce valid TypeScript interface. All JSON types mapped correctly (string, number, boolean, null, nested objects, arrays). Name defaults to "Root". | transform | None known |
| `code-json-to-python-class` | `{ "json": object, "name"?: string }` (json required) | `{ python: string }` | Must produce valid Python `@dataclass` class definition. Types mapped to Python equivalents (str, int, float, bool, Optional, List). | transform | None known |
| `code-json-to-go-struct` | `{ "json": object, "name"?: string }` (json required) | `{ go_struct: string }` | Must produce valid Go struct with json struct tags. Types mapped to Go equivalents. Exported field names (capitalized). | transform | None known |
| `code-json-to-zod` | `{ "json": object, "name"?: string }` (json required) | `{ zod: string }` | Must produce valid Zod schema using z.object(), z.string(), z.number(), etc. | transform | None known |

### Code Formatting & Minification

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `code-sql-format` | `{ "text": string }` (required) | `{ formatted: string }` | SQL keywords must be uppercased (SELECT, FROM, WHERE, etc.). Proper indentation. | transform | None known |
| `code-css-minify` | `{ "text": string }` (required) | `{ result, original_size, minified_size, reduction_pct }` | Must strip comments, collapse whitespace, preserve functionality. Reduction percentage must be accurate. | transform | None known |
| `code-js-minify` | `{ "text": string }` (required) | `{ result, original_size, minified_size }` | Must strip comments and collapse whitespace. Must not break JS semantics. | transform | Basic minification only (whitespace + comments). No variable shortening or dead code elimination. |
| `code-html-minify` | `{ "text": string }` (required) | `{ result, original_size, minified_size }` | Must strip comments, collapse whitespace between tags. Must not break HTML structure. | transform | May drop closing tags (returned `<div><p> Hello </div>` with missing `</p>`). Potentially lossy. |

### Code Analysis

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `code-regex-explain` | `{ "pattern": string }` (required) | `{ tokens_found: [{ token, meaning }] }` | Must tokenize regex and explain each component in plain English. | parse | None known |
| `code-cron-explain` | `{ "cron": string }` (required) | `{ human: string }` | Must produce accurate plain English description of cron schedule. | parse | None known |
| `text-cron-to-english` | `{ "cron": string }` (required) | `{ english, expression }` | Same as code-cron-explain but different output format. Returns both English and original expression. | parse | Duplicate functionality with code-cron-explain |
| `code-complexity-score` | `{ "code": string, "language"?: string }` (code required) | `{ cyclomatic_complexity, cognitive_complexity, lines, decision_points: [{ line, type }], rating }` | Cyclomatic complexity counts independent paths. Cognitive complexity measures nesting difficulty. Rating: simple/moderate/complex/very complex. | parse | None known |
| `code-import-graph` | `{ "code": string, "language"?: string }` (code required) | `{ imports: [{ module, type, line }], external: string[], local: string[], count }` | Must parse import/require statements. External = npm/pip packages. Local = relative paths (./). | parse | None known |
| `code-dead-code-detect` | `{ "code": string, "language"?: string }` (code required) | `{ issues: [{ line, type, name, message }], score: number }` | Must detect unused variables, uncalled functions, unreachable code. Score 0-100 (100 = no dead code). | parse | None known |

### Semver & Diff

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `code-semver-compare` | `{ "a": string, "b": string }` (both required) | `{ result: -1\|0\|1, description }` | 1 = a > b, 0 = equal, -1 = a < b. Must follow semver spec (major.minor.patch). | compute | None known |
| `code-semver-bump` | `{ "version": string, "bump": "patch"\|"minor"\|"major" }` (both required) | `{ bumped: string, type }` | Major: X+1.0.0, Minor: X.Y+1.0, Patch: X.Y.Z+1. Pre-release tags must be stripped on bump. | compute | None known |

### Dev Config Tools

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `code-diff-stats` | `{ "text": string }` (required, unified diff format) | `{ files_changed, additions, deletions }` | Must parse unified diff headers and count +/- lines. | parse | None known |
| `code-env-parse` | `{ "text": string }` (required, .env file content) | `{ variables: object, count: number }` | Must parse KEY=VALUE pairs, handle comments (#), handle quotes, handle multiline. Count must match number of variables. | parse | None known |
| `code-jwt-inspect` | `{ "token": string }` (required) | `{ header: object, payload: object }` | Must base64-decode header and payload. No signature verification (unsafe inspect). Check exp claim against current time. | parse | None known |
| `code-openapi-validate` | `{ "text": string }` (required, OpenAPI JSON string) | `{ valid: bool, errors: string[], version, paths_count }` | Must validate OpenAPI 3.x / Swagger 2.x structure. Check required fields (info, paths). | parse | None known |
| `code-dockerfile-lint` | `{ "text": string }` (required, Dockerfile content) | `{ issues: [{ rule, message }], score: number }` | Must check: missing FROM, :latest tag, apt-get without -y, ADD vs COPY, multiple CMD. Score 0-100. | parse | None known |
| `code-gitignore-generate` | `{ "languages": string[] }` (required, e.g., ["node","python"]) | `{ gitignore: string }` | Must include standard ignore patterns for each language. Supported: node, python, go, rust, java, ruby. | compute | None known |
| `code-package-json-generate` | `{ "name": string, "description"?: string, "dependencies"?: string[] }` (name required) | `{ package_json: string }` | Must produce valid JSON. Includes standard fields (name, version, description, main, scripts, license). | compute | Dependencies rendered as array instead of object with version ranges |

### Diff & Merge (Agent Superpowers)

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `diff-three-way` | `{ "base": string, "ours": string, "theirs": string }` (all required) | `{ merged, conflicts: array, conflict_count, clean: bool }` | Must perform three-way merge. Clean = true when no conflicts. Conflicts array contains conflicting sections. | compute | 0 credits (free) |
| `diff-patch-apply` | `{ "original": string, "patch": string }` (both required) | `{ result, ops_applied, lines_before, lines_after }` | Must apply unified diff patch to original text. Result is patched output. | compute | Returns empty result string for simple patches; patch format requirements unclear. 0 credits (free). |
| `semver-range-resolve` | `{ "range": string, "versions": string[] }` (both required) | `{ range, matched: string[], best, total_available }` | Must resolve which versions from the list match the semver range. Best = highest matching version. | compute | Returns empty matched array and total_available: 0 even with valid input. Input format for versions array may require different structure. 0 credits (free). |
| `contract-abi-parse` | `{ "abi": array }` (required, Solidity ABI JSON array) | `{ functions: [{ name, signature, inputs, outputs, state_mutability, readable }], events: [], function_count, event_count, total_items }` | Must parse Solidity/EVM contract ABI. Functions and events must be correctly classified. Signature must be canonical form (e.g., "transfer(address,uint256)"). | compute | Input must be parsed JSON array, not a JSON string. Passing string causes "a.filter is not a function" error. 0 credits (free). |

---

## 5. Generate (59 endpoints)

### Identity & Data Generation

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `gen-fake-name` | `{}` (no required params) | `{ firstName, lastName, fullName }` | Must return plausible human names. fullName = firstName + " " + lastName. | compute | None known |
| `gen-fake-email` | `{}` | `{ email }` | Must return syntactically valid email address. | compute | May return real-looking domains (outlook.com) rather than safe example.com domains |
| `gen-fake-company` | `{}` | `{ company }` | Must return plausible company name. | compute | None known |
| `gen-fake-address` | `{}` | `{ streetNumber, street, address, city, state, zip, full }` | Must return plausible US address. State must be valid 2-letter code. ZIP must be 5 digits. | compute | ZIP codes may not correspond to actual state |
| `gen-fake-phone` | `{}` | `{ phone, e164 }` | Phone in human format (xxx) xxx-xxxx. E.164 with +1 prefix. | compute | None known |
| `gen-fake-uuid` | `{}` | `{ uuid }` | Must be valid UUID v4 format (8-4-4-4-12 hex). | compute | 0 credits |
| `gen-fake-date` | `{}` | `{ date }` | ISO 8601 date (YYYY-MM-DD). Must be a valid calendar date. | compute | 0 credits |
| `gen-fake-sentence` | `{}` | `{ sentence }` | Random sentence with capitalized first word and period. | compute | Generated sentences are nonsensical word combinations, not grammatically correct. 0 credits. |
| `gen-fake-paragraph` | `{}` | `{ paragraph }` | Multiple random sentences forming a paragraph. | compute | Same nonsensical word quality as gen-fake-sentence. 0 credits. |

### Visual Generation

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `gen-avatar-svg` | `{ "text": string }` (required, seed string) | `{ svg: string }` | Valid SVG XML. Deterministic: same input always produces same identicon. Grid-based pattern from hash. | compute | None known |
| `gen-avatar-initials` | `{ "name": string }` (required) | `{ initials, background, svg }` | SVG with initials (first letter of each word). Background color deterministic from name hash. | compute | 0 credits |
| `gen-qr-svg` | `{ "data": string }` (required) | `{ svg: string, modules: number }` | Valid SVG containing QR code matrix. Must be scannable. Modules = QR grid size. | compute | None known |
| `gen-color-palette` | `{ "hex": string }` (required, base color with # prefix) | `{ base, palette: [{ hex, hsl, rgb }] }` | Must generate harmonious colors (complementary, analogous, or triadic). All hex codes valid. HSL/RGB values in correct ranges. | compute | Base color in output may differ slightly from input (e.g., input #3b82f6, output base #3498db) |

### IDs & Tokens

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `gen-short-id` | `{ "length"?: number }` (default 8) | `{ id, length }` | URL-safe characters only (a-z, A-Z, 0-9). Length must match requested. | compute | None known |
| `gen-id` | `{ "prefix"?: string, "length"?: number }` | `{ id }` | Random hex ID. Prefix prepended if provided. | compute | 0 credits |
| `gen-password` | `{ "length"?: number }` (default varies) | `{ password, length, entropy }` | Must include mixed case, digits, special chars. Entropy in bits. Cryptographically secure. | compute | 0 credits |
| `id-nanoid` | `{ "length"?: number }` (default 21) | `{ id, length }` | NanoID format. URL-safe, compact. | compute | 0 credits |
| `id-ulid` | `{}` | `{ ulid, timestamp }` | Valid ULID (26 chars, Crockford Base32). Timestamp must be current. Lexicographically sortable. | compute | 0 credits |
| `id-snowflake` | `{}` | `{ id, timestamp, machine_id }` | Twitter Snowflake format. 64-bit integer as string. Timestamp embedded. | compute | 0 credits |

### Encoding & Hashing

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `gen-base64-encode` | `{ "text": string }` (required) | `{ encoded }` | Must be valid Base64 (A-Z, a-z, 0-9, +, /, = padding). Decodable back to original. | compute | 0 credits |
| `gen-base64-decode` | `{ "text": string }` (required, Base64 input) | `{ decoded }` | Must decode Base64 to UTF-8 string. | compute | Returns empty string for valid Base64 input. Likely a field name issue (may expect different param name). 0 credits. |
| `gen-url-encode` | `{ "text": string }` (required) | `{ encoded }` | Must percent-encode special characters per RFC 3986. | compute | 0 credits |
| `gen-url-decode` | `{ "text": string }` (required) | `{ decoded }` | Must decode percent-encoded string. | compute | Returns empty string for valid input. Same issue as gen-base64-decode. 0 credits. |
| `gen-html-escape` | `{ "text": string }` (required) | `{ escaped }` | Must escape &, <, >, ", '. Output safe for HTML embedding. | compute | 0 credits |
| `gen-hash-comparison` | `{ "text": string }` (required) | `{ md5, sha1, sha256, sha512 }` | All hashes must be lowercase hex strings. Lengths: MD5=32, SHA1=40, SHA256=64, SHA512=128. Must be correct for input. | compute | 0 credits |
| `gen-jwt-decode` | `{ "token": string }` (required, JWT string) | `{ header, payload, signature }` | Must decode JWT parts without verification. Header and payload as objects. Signature truncated. | compute | 0 credits. Duplicate functionality with code-jwt-inspect. |

### Time & Cron

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `gen-timestamp` | `{}` | `{ iso, unix, unix_ms, utc, date, time }` | All timestamp formats must represent the same current moment. ISO 8601, Unix seconds, Unix milliseconds. | compute | 0 credits |
| `gen-cron-expression` | `{ "description": string }` (required, English text) | `{ cron, human_readable }` | Must convert English schedule description to valid 5-field cron expression. | compute | Defaults to `* * * * *` (every minute) when pattern is not recognized. Very limited NLP parsing. 3 credits. |
| `gen-cron` | `{ "description": string }` (required) | `{ cron, description, all_patterns: object }` | Same as gen-cron-expression but also returns a dictionary of all known pattern templates. | compute | Defaults to `0 * * * *` (every hour) when not recognized. Returns full pattern dictionary regardless. 0 credits. |

### Code & Template Generation

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `gen-lorem-code` | `{ "language": string, "lines"?: number }` (language required) | `{ code, language, lines }` | Must produce syntactically plausible placeholder code in requested language. Supported: python, javascript, go, rust. | compute | Code is very basic lorem-ipsum style, not realistic application code. 3 credits. |
| `gen-lorem` | `{ "sentences"?: number }` | `{ text }` | Standard Lorem Ipsum text. Sentence count matches requested. | compute | 0 credits |
| `gen-regex` | `{ "type": string }` (required: email, url, phone, ip, date, hex_color, number) | `{ pattern, name, all }` | Must return working regex pattern for the requested type. Also returns all available patterns. | compute | 0 credits |
| `gen-gitignore` | `{ "language": string }` (required: node, python, rust, go, java) | `{ gitignore, language }` | Must include standard ignore patterns for the language. | compute | 0 credits. Duplicate of code-gitignore-generate (which takes array). |
| `gen-dockerfile` | `{ "language": string, "port"?: number }` (language required: node, python) | `{ dockerfile }` | Must produce production-ready Dockerfile. Multi-stage if applicable. EXPOSE matches port param. | compute | 0 credits |
| `gen-readme` | `{ "name": string, "description"?: string }` (name required) | `{ readme }` | Must include project name, description, install, usage, license sections in Markdown. | compute | 0 credits |
| `gen-license-mit` | `{ "author"?: string, "year"?: number }` | `{ license }` | Must be full MIT license text with correct author and year. | compute | Author defaults to "Author" if not provided. 0 credits. |
| `gen-env-example` | `{ "vars": string[] }` (required) | `{ env }` | Must produce valid .env format with each variable and empty value. | compute | 0 credits |
| `gen-package-json-generate` | See Code Utilities `code-package-json-generate` | -- | -- | -- | Duplicate |
| `gen-slug` | `{ "text": string }` (required) | `{ slug }` | Must lowercase, replace spaces with hyphens, strip special chars. URL-safe output. | compute | 0 credits |

### Randomness & Sampling

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `random-int` | `{ "min": number, "max": number }` (both required) | `{ value, min, max }` | Cryptographically random integer in [min, max] range inclusive. | compute | 1 credit |
| `random-float` | `{ "min"?: number, "max"?: number }` (defaults 0-1) | `{ value, min, max }` | Cryptographically random float in [min, max) range. | compute | 1 credit |
| `random-choice` | `{ "array": array }` (required) | `{ chosen, from_size }` | Must pick one random element from array. | compute | Input field name is `array`, not `items`. Returns error for `items` param. 1 credit. |
| `random-shuffle` | `{ "array": array }` (required) | `{ shuffled: array, length }` | Fisher-Yates shuffle. Output must contain same elements as input. Length must match. | compute | Input field name is `array`. 1 credit. |
| `random-sample` | `{ "array": array, "n": number }` (both required) | `{ sample: array, remaining: array, sample_size }` | Without replacement. sample_size must equal n. sample + remaining = original array. | compute | Input field name is `array`. 1 credit. |
| `data-sample` | `{ "data": array, "n": number }` (both required) | `{ sample: array, sample_size, total }` | Same as random-sample but field name is `data` and no `remaining` returned. | compute | 0 credits |
| `random-walk` | `{ "steps": number, "dimensions"?: number, "step_size"?: number }` (steps required) | `{ steps, dimensions, step_size, path: [{ step, position: number[] }], final_position, distance_from_origin }` | Path must have steps+1 entries (including start). Each step moves by step_size in one axis. | compute | 0 credits |
| `random-weighted` | `{ "items": string[], "weights": number[] }` (both required) | `{ drawn, probability, shannon_entropy, total_weight, options }` | Drawn item selected according to weight distribution. Shannon entropy must be correct for the distribution. | compute | Returns index ("0") instead of the actual item label. 0 credits. |

### Creative / AI Agent Tools

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `gen-inspiration` | `{ "topic"?: string }` | `{ prompt, topic }` | Creative prompt related to the topic. Must be thought-provoking. | compute | 1 credit |
| `text-glitch` | `{ "text": string, "intensity"?: number }` (text required) | `{ original_length, glitched, intensity, mutations }` | Intentional text corruption. Intensity 0-1 controls severity. Higher = more mutations. | compute | 0 credits |
| `data-synesthesia` | `{ "data": any, "target": string }` (both required) | `{ input_value, normalized, mapping_type, result: object }` | Cross-modal mapping. Target "color" returns RGB/hex. Other targets may include "sound", "spatial", "emotion". | compute | Only maps the last element of an array, not the full dataset. 0 credits. |
| `random-persona` | `{}` | `{ name, backstory, personality_traits: string[], speech_patterns, cognitive_biases: string[] }` | Complete fictional persona. All fields must be present and coherent. | compute | 0 credits |
| `gen-motto` | `{}` | `{ motto, theme, generated_at }` | Randomly generated motto/catchphrase. | compute | Grammar can be awkward ("Transparent minds optimizes Clarity"). 0 credits. |
| `gen-persona` | `{}` | `{ persona: { style, focus, skepticism, role, custom_traits, system_prompt } }` | Generates a system prompt for agent role-playing. | compute | 0 credits |
| `steelman` | `{ "argument": string }` (required) | `{ original, steelmanned, note }` | Must construct the strongest possible version of the argument. | compute | Output is templated and shallow rather than genuinely constructing a strong argument. 0 credits. |
| `empathy-respond` | `{ "emotion": string, "situation": string }` (both required) | `{ situation, emotion, response }` | Contextually appropriate empathetic response. | compute | Responses are generic templates. 0 credits. |
| `diplomatic-rewrite` | `{ "text": string }` (required) | `{ original, diplomatic, changes }` | Must soften blunt language while preserving meaning. | compute | Returns text unchanged with "already diplomatic" for clearly blunt input ("This code is terrible"). 0 credits. |
| `lucid-dream` | `{}` | `{ dream, elements: string[] }` | Random creative scenario for brainstorming. Dream is narrative text, elements is constituent parts. | compute | 0 credits |
| `serendipity` | `{ "topics": string[] }` (required, 2+ topics) | `{ topic_a, topic_b, connection }` | Must find unexpected connection between two topics. | compute | Connections are very generic ("has never been explored"). 0 credits. |
| `personality-create` | `{}` | `{ name, personality: { openness, conscientiousness, extraversion, agreeableness, neuroticism }, dominant_trait, description }` | Big Five traits each 0-1. Dominant trait must be the highest-valued trait. | compute | 0 credits |
| `sandbox-fork` | `{}` | `{ sandbox_id, state: object, note, forked_at }` | Creates isolated sandbox for safe experimentation. | compute | State is always empty object. sandbox_id is unique per call. 0 credits. |

---

## 6. Communicate (16 endpoints)

### Webhook & URL Shortening

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `comm-webhook-get` | `{}` (no required params) | `{ id, url: string, expires_in: number }` | Creates a unique inbox. URL is relative path to the inbox endpoint. Expires in seconds (typically 3600). | compute | URL is a relative path (e.g., `/v1/webhook-inbox/abc123`) not a full URL. Must prepend base URL. |
| `comm-webhook-check` | `{ "id": string }` (required, inbox ID from comm-webhook-get) | `{ requests: array, count: number }` | Returns all HTTP requests received at the inbox since last check. Each request includes method, headers, body, query, timestamp. | compute | Returns 502 timeout errors intermittently. When working, returns empty array if no requests received. |
| `comm-short-url` | `{ "url": string }` (required, target URL) | `{ short_code, redirect_url, target }` | Short code is 6-char alphanumeric. Redirect URL is relative path /s/{code}. Target is the original URL. | compute | Redirect URL is relative, not a full short URL. Must prepend base domain. |

### QR Codes

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `comm-qr-url` | `{ "url": string }` (required -- note: field name is `url`, not `data`) | `{ svg }` | Valid SVG string containing QR code for the URL. Must be scannable. | compute | Input field is `url`, not `data` or `text`. Returns error "url is required" with wrong field name. |
| `gen-qr-data` | `{ "data": string }` (required) | `{ text, matrix: number[][] }` | Returns raw QR code matrix (2D array of 0s and 1s). 1 = dark module. Matrix dimensions match QR version. | compute | Returns raw matrix data, not SVG. Useful for custom rendering. |

### Validation

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `comm-email-validate-deep` | `{ "email": string }` (required) | `{ valid_format: bool, is_disposable: bool, domain, suggestion }` | Must check syntax, MX records, disposable domain database. Suggestion for typos (e.g., "gmial.com" -> "gmail.com"). | network | None known |
| `comm-phone-validate` | `{ "phone": string }` (required, E.164 format preferred) | `{ valid: bool, formatted, country }` | Must validate format and detect country from prefix. Formatted in national format. | compute | Does not return line type (mobile/landline/VOIP) as described |

### Calendar & Contact

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `comm-ical-create` | `{ "title": string, "start": string, "end": string, "timezone"?: string, "description"?: string, "location"?: string, "url"?: string }` (title, start, end required) | `{ ical: string }` | Must produce valid iCalendar (.ics) content. BEGIN:VCALENDAR/END:VCALENDAR envelope. DTSTART/DTEND in ISO format. UID must be unique. | compute | Timezone param may not be applied to DTSTART/DTEND (events may default to UTC). Does not support recurrence rules, attendees, or alarms. |
| `comm-vcard-create` | `{ "name": string, "email"?: string, "phone"?: string, "organization"?: string, "title"?: string, "url"?: string }` (name required) | `{ vcard: string }` | Must produce valid vCard 3.0 (.vcf) content. BEGIN:VCARD/END:VCARD envelope. FN and N fields required. | compute | None known |

### Content Conversion

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `comm-markdown-email` | `{ "markdown": string }` (required) | `{ html: string }` | Must convert Markdown to email-safe HTML with inline CSS. Compatible with Gmail, Outlook, Apple Mail. | compute | HTML structure can be malformed (e.g., `<p>` wrapping `<h1>` is invalid nesting) |
| `comm-csv-email` | `{ "rows": array }` (required, array of objects) | `{ csv, filename, mime }` | Must produce valid CSV with headers from object keys. Proper quoting/escaping. MIME is text/csv. | compute | Input field name is `rows`, not `data` (empty CSV with `data` param). Filename always "data.csv". |

### Feed & Web Standard Generation

| Slug | Expected Input | Expected Output | Acceptable Result | Computation Type | Outstanding Issues |
|------|---------------|-----------------|-------------------|------------------|--------------------|
| `comm-rss-create` | `{ "title": string, "link": string, "items": [{ "title": string, "link": string, "description"?: string, "pubDate"?: string }] }` (title, link, items required) | `{ xml: string }` | Must produce valid RSS 2.0 XML. Channel must have title, link, description, lastBuildDate. Each item must have title and link. | compute | None known |
| `comm-opml-create` | `{ "title": string, "feeds": [{ "title": string, "xmlUrl": string, "htmlUrl"?: string }] }` (title, feeds required) | `{ xml: string }` | Must produce valid OPML 2.0 XML. Each outline element must have text and xmlUrl attributes. | compute | xmlUrl and htmlUrl are empty in output despite being provided in input |
| `comm-sitemap-create` | `{ "urls": [{ "url": string, "lastmod"?: string, "changefreq"?: string, "priority"?: number }] }` (urls required) | `{ xml: string }` | Must produce valid sitemap.xml per sitemaps.org schema. Each URL in `<url><loc>` element. | compute | `<loc>` element is empty in output; URL not being written into the loc tag. Major bug. |
| `comm-robots-create` | `{ "rules": [{ "user_agent": string, "disallow": string[] }], "sitemaps"?: string[] }` (rules required) | `{ text: string }` | Must produce valid robots.txt format. One User-agent/Disallow block per rule. Sitemap directives at end. | compute | None known |
| `comm-mailto-link` | `{ "to": string, "subject"?: string, "body"?: string, "cc"?: string, "bcc"?: string }` (to required) | `{ link: string }` | Must produce properly percent-encoded mailto: URI. All field values URL-encoded. | compute | None known |

---

## Cross-Category Issues Summary

### Systemic Bugs

1. **TLS Certificate Validation Failure**: All HTTP-based Network & DNS endpoints (`net-http-status`, `net-http-headers`, `net-http-redirect-chain`, `net-http-options`, `net-url-status`, `net-url-headers`, `net-url-redirect-chain`, `net-ssl-check`, `net-ssl-expiry`) fail with "unable to get local issuer certificate" for HTTPS URLs. The server's Node.js process likely has an incomplete CA certificate store. This affects all endpoints that make outbound HTTPS requests from the `handlers/network.js` layer.

2. **Decode Endpoints Return Empty**: `gen-base64-decode` and `gen-url-decode` return empty `decoded` field despite valid input. Likely a parameter name mismatch between what the handler expects and what is documented.

3. **Sitemap URL Rendering**: `comm-sitemap-create` produces empty `<loc>` elements. The URL from input is not being written into the XML output.

4. **OPML Feed URL Loss**: `comm-opml-create` drops xmlUrl and htmlUrl values from feed entries.

### Feature Gaps (Described vs Actual)

| Endpoint | Missing vs Description |
|----------|----------------------|
| `sense-ip-geo` | Only returns broad region, not country/city/lat/lng/timezone |
| `sense-whois` | Only returns nameservers, not registrar/dates/registrant |
| `sense-domain-expiry` | Does not return expiry date or days remaining |
| `sense-url-word-count` | Missing sentence count, paragraph count, reading time, frequent terms |
| `sense-url-performance` | Missing DNS resolution and TCP connection time breakdown |
| `sense-pypi-package` | Missing homepage, license, release_date, required_python |
| `sense-github-user` | Missing company, location, website, following, created_at |
| `enrich-ip-to-asn` | Does not return ASN number or organization; only returns network class |
| `enrich-email-to-domain` | Missing TLD, subdomain, free provider flag, corporate flag |
| `enrich-email-to-name` | Missing separate first/last name fields, confidence score |
| `enrich-country-code` | Missing numeric code, region, subregion, capital |
| `enrich-language-code` | Missing native name, script, direction, BCP 47, ISO 639-2/T |
| `enrich-crontab-explain` | Missing next 10 execution times |
| `enrich-useragent-parse` | Missing rendering engine, crawler detection |
| `enrich-file-extension-info` | Returns "Unknown" for many valid extensions |
| `enrich-emoji-info` | Fails on actual emoji characters (encoding issue) |
| `enrich-color-name` | Color distance algorithm questionable; no Pantone names |
| `comm-phone-validate` | Missing line type detection |

### Duplicate Endpoints

| Endpoint A | Endpoint B | Notes |
|-----------|-----------|-------|
| `net-http-status` (5 cr) | `net-url-status` (3 cr) | Same functionality, different price |
| `net-http-headers` (5 cr) | `net-url-headers` (3 cr) | Same functionality, different price |
| `net-http-redirect-chain` (5 cr) | `net-url-redirect-chain` (3 cr) | Same functionality, different price |
| `code-cron-explain` | `text-cron-to-english` | Same functionality, different output field names |
| `gen-cron-expression` (3 cr) | `gen-cron` (0 cr) | Similar English-to-cron, gen-cron is free |
| `code-gitignore-generate` (1 cr) | `gen-gitignore` (0 cr) | Same output, different input format |
| `code-jwt-inspect` (1 cr) | `gen-jwt-decode` (0 cr) | Same JWT decoding |
| `enrich-crontab-explain` | `code-cron-explain` | Cron explanation in two categories |
| `random-sample` (1 cr) | `data-sample` (0 cr) | Same sampling with different param names |

---

## Endpoint Count Verification

| Category | Catalog Count | Documented |
|----------|:------------:|:----------:|
| Network & DNS | 28 | 28 |
| Sense: Web | 32 | 32 |
| Enrich | 20 | 20 |
| Code Utilities | 27 | 27 |
| Generate | 59 | 59 |
| Communicate | 16 | 16 |
| **Total** | **182** | **182** |
