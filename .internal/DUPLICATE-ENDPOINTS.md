# Duplicate Endpoint Audit

Generated: 2026-03-29
Source: ENDPOINT-SPEC.md Section 4.1 (QA audit found 15 duplicate pairs)

## Resolution Strategy

Both slugs in each pair continue to work. The **alias** slug delegates to the **canonical** handler
at runtime via the `_aliasOf` field in the registry definition. Alias responses include
`_canonical` and `_alias` metadata fields so callers can discover the preferred slug.

## Duplicate Pairs

| Canonical Slug | Alias Slug | Handler | Notes |
|----------------|------------|---------|-------|
| `crypto-hmac` | `hash-hmac` | `cryptoHmac` (compute.js:507) + power-1 fallback | `hash-hmac` adds `input_length` field. Now delegates to canonical. |
| `crypto-checksum` | `hash-checksum` | `cryptoChecksumFile` (compute.js:620) + power-1 fallback | `hash-checksum` is MD5-only variant. Now delegates to canonical. |
| `crypto-checksum` | `crypto-checksum-file` | `cryptoChecksumFile` (compute.js:620) | Already shared same handler. Adds SHA-512. Marked as alias. |
| `text-regex-replace` | `regex-replace` | `textRegexReplace` (compute.js:113) + power-1 fallback | Same behavior. Now delegates to canonical. |
| `text-sentence-split` | `text-split-sentences` | `textSentenceSplit` (compute.js:210) + inline (compute.js:4370) | Same behavior. Now delegates to canonical. |
| `text-rot13` | `encode-rot13` | `textRot13` (compute.js:497) + power-1 fallback | Same behavior. Now delegates to canonical. |
| `text-morse` | `encode-morse` | inline (compute.js:3879) + power-1 fallback | Same behavior. Now delegates to canonical. |
| `text-repeat` | `string-repeat` | inline (compute.js:3934) + power-1 fallback | Different default count (2 vs 3). Now delegates to canonical (default=2). |
| `text-pad` | `string-pad` | inline (compute.js:3939) + power-1 fallback | Different output format. Now delegates to canonical. |
| `text-wrap` | `string-wrap` | `textWrap` (compute.js:2019) + power-1 fallback | Different output field names. Now delegates to canonical. |
| `text-template` | `string-template` | `textTemplate` (compute.js:1945) + power-1 fallback | Different param names (`variables` vs `vars`). Now delegates to canonical. |
| `text-camel-case` | `string-camel-case` | inline (compute.js:3909) + power-1 fallback | `string-camel-case` returns all case variants. Now delegates to canonical. |
| `text-extract-urls` | `text-extract-links` | `textExtractUrls` (compute.js:51) + inline (compute.js:4368) | `extract-links` deduplicates. Now delegates to canonical. |
| `math-percentile` | `stats-percentile` | `mathPercentile` (compute.js:665) + `statsPercentile` (compute.js:850) | Different input key (`numbers` vs `data`). Now delegates to canonical. |
| `math-histogram` | `stats-histogram` | `mathHistogram` (compute.js:675) + `statsHistogram` (compute.js:869) | Different output format. Now delegates to canonical. |
| `math-statistics` | `stats-summary` | `mathStatistics` (compute.js:652) + `statsSummary` (compute.js:880) | `stats-summary` adds p25/p75. Now delegates to canonical. |

## Implementation Details

1. **Registry**: Each alias has `_aliasOf: '<canonical-slug>'` in its registry definition
   - 10 aliases added to `registry-expansion.js` (hash-hmac, hash-checksum, regex-replace, encode-rot13, encode-morse, string-repeat, string-pad, string-wrap, string-template, string-camel-case)
   - 5 aliases tagged in existing entries (stats-percentile, stats-histogram, stats-summary in registry.js; text-extract-links, text-split-sentences in registry.js; crypto-checksum-file in registry-expansion.js)

2. **Handler redirect**: `server-v2.js` iterates all `_aliasOf` entries after registry merge and overwrites alias handlers to delegate to the canonical handler, appending `_canonical` and `_alias` fields to the response.

3. **No breaking changes**: Both slugs continue to work. Callers using alias slugs will see the extra metadata fields but otherwise get the same results.

## Recommendations

- Deprecation notices could be added to alias responses in a future release
- API docs / catalog UI should show aliases grouped under canonical entries
- The `GET /v1/tools` response could include an `aliases` array on canonical entries
