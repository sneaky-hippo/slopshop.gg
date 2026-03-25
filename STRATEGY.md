# Slopshop Strategy (Honest Version)

## The Hard Truth

Out of 420 APIs, here's how many a Claude Code instance would GENUINELY prefer over doing it natively or with bash:

### Tier A: Claude CANNOT do this (must use a tool)
These are the real product. Everything else is convenience.

| API | Why Claude can't do it natively |
|---|---|
| `net-http-status` | Claude cannot make HTTP requests from its tools |
| `net-ssl-check` | Claude cannot open TLS connections |
| `net-dns-a/mx/txt/ns/all` | Claude cannot query DNS |
| `net-http-headers` | Claude cannot fetch HTTP headers |
| `net-http-redirect-chain` | Claude cannot follow redirects |
| `net-email-validate` | Claude cannot verify MX records |
| `webhook-send` | Claude cannot POST to arbitrary URLs |
| `file-download` | Claude cannot fetch files from URLs |
| `ext-slack-post` | Claude cannot send Slack messages |
| `ext-discord-post` | Claude cannot send Discord messages |
| `ext-telegram-send` | Claude cannot send Telegram messages |
| `ext-github-issue` | Claude cannot create GitHub issues |
| `ext-github-pr-comment` | Claude cannot comment on PRs |
| `ext-email-send` | Claude cannot send emails |
| `ext-web-scrape` | Claude cannot scrape web pages |

**Count: 15 APIs that are genuinely irreplaceable**

### Tier B: Claude CAN do this but Slopshop is VERIFIABLY better
These return exact, computed results where Claude would estimate or approximate.

| API | Why Slopshop is better |
|---|---|
| `text-token-count` | Claude estimates tokens. Slopshop computes exactly. Critical for context window management. |
| `text-token-estimate-cost` | Claude guesses costs. Slopshop calculates from actual pricing. |
| `crypto-hash-sha256/512/md5` | Claude can use `bash echo -n x \| sha256sum` but structured JSON is cleaner. |
| `crypto-jwt-sign/verify` | Claude can use bash+node but JWT operations are multi-step. One API call is better. |
| `crypto-encrypt-aes/decrypt-aes` | Complex bash operation. One API call with structured output wins. |
| `crypto-totp-generate` | Can't easily do TOTP in bash. |
| `math-statistics` | Claude estimates mean/median. Slopshop computes exact stddev, variance. |
| `math-linear-regression` | Claude cannot do least-squares regression in its head. |
| `llm-output-extract-json` | THE critical one. When an LLM returns JSON wrapped in markdown, extracting it reliably needs code. |
| `llm-output-fix-json` | Fixing broken JSON (single quotes, trailing commas) is error-prone manually. |
| `json-schema-validate` | Schema validation requires exact type checking Claude can't do reliably. |
| `code-complexity-score` | Claude estimates complexity. Slopshop counts decision points exactly. |
| `code-dead-code-detect` | Claude might miss unused vars. Pattern matching catches them. |
| `code-import-graph` | Claude reads files one at a time. Import graph gives the whole picture. |
| `text-compare-similarity` | Claude says "these are similar." Slopshop says "Jaccard: 0.42, 67% word overlap." |

**Count: 15 APIs that are genuinely superior**

### Tier C: Convenience (nice to have, not essential)
Everything else. Claude CAN do these. Slopshop makes them slightly easier.
These are the remaining ~230 APIs. They exist. They work. But they won't
drive adoption. Nobody switches to Slopshop for `text-slugify`.

## Real Penetration Estimate

- Tier A (15 APIs): Would be used by 100% of instances that need side effects/network = ~15% of all instances
- Tier B (15 APIs): Would be used by ~30% of instances doing compute-heavy tasks = ~10% of all instances
- Tier C (230 APIs): Would be used by ~5% of power users who want structured output = ~2% of all instances

**Honest penetration: ~25% of Claude instances would benefit from Slopshop.**

## How to Get to 50%

The remaining 75% are doing text generation. Claude IS the tool.
You cannot make 50% of Claude instances use Slopshop by adding APIs.

The only path to 50%:
1. **Slopshop becomes the default MCP server in Claude Code.**
   If it ships pre-installed, penetration is 100% for Claude Code instances.
   That's a partnership with Anthropic, not a code problem.

2. **Agent frameworks embed Slopshop as the default tool provider.**
   If LangChain/CrewAI ship with Slopshop tools, every agent built on
   those frameworks uses it. That's a partnership, not a code problem.

3. **Slopshop becomes THE verification layer.**
   Every time Claude writes code → Slopshop checks complexity.
   Every time Claude generates JSON → Slopshop validates it.
   This requires MCP integration + Claude being taught to verify its own work.

## What to Actually Build Next

Stop adding APIs. Start improving the 30 that matter:

1. Better schemas (input/output types, examples) for Tier A + B
2. Better error messages (not just "error: bad input")
3. Better docs for the 30 essential APIs (not 420)
4. Better MCP integration (auto-setup, zero-config)
5. Better pipes that chain the 30 essential APIs

## Discovery Strategy

### For Claude Code instances:
1. `node setup-mcp.js` adds Slopshop to Claude Code settings
2. CLAUDE.md in project root tells Claude about available tools
3. MCP registry listing makes it discoverable globally

### For API agents:
1. npm package with tool definitions
2. LangChain/CrewAI tool provider packages
3. /v1/tools endpoint with real schemas

### For developers:
1. GitHub repo with stars
2. npm package with downloads
3. Hacker News / Twitter launch
4. "Slopshop" appearing in search results for "API tools for AI agents"
