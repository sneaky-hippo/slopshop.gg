# Slopshop Market Audit: vs. Stripe / Vercel / Supabase Tier

**Date:** 2026-03-27
**Analyst:** Product audit comparing slopshop.gg against market-leading developer platforms
**Codebase reviewed:** server-v2.js, auth.js, stripe.js, mcp-server.js, cli.js, sdk/python/slopshop.py, Dockerfile, docker-compose.yml, README.md, index.html

---

## 1. SIGNUP / ONBOARDING

**Market Standard (10/10):** Stripe: Email signup -> dashboard -> API key visible -> copy-paste example -> working response in <60 seconds. Beautiful onboarding wizard. Sandbox environment with test data pre-loaded. Interactive getting-started guide with progress tracking.

**Slopshop Current (5/10):**
- `POST /v1/auth/signup` with email+password returns an API key with 2,000 free credits. Functional.
- `POST /v1/keys` creates an anonymous key with 0 credits (no email required). Fast but useless without credits.
- Demo key `sk-slop-demo-key-12345678` is hardcoded and available immediately. Good for tire-kicking.
- `/v1/quickstart` endpoint returns a JSON blob of steps. Not a visual experience.
- No email verification. No onboarding wizard. No dashboard walkthrough.
- The quickstart references `POST /v1/auth/signup` in curl format -- not beginner-friendly.

**Gap:**
1. **No visual signup flow.** There is no web-based signup page with a form. Users must POST to an API endpoint to get started, which is a cold start for anyone who is not already comfortable with curl.
2. **No onboarding wizard / progress tracker.** Stripe shows "Step 1 of 4: Get your API key" with checkmarks. Slopshop dumps you into the void.
3. **No email verification or account recovery.** The auth.js signup stores email+password with PBKDF2 (good), but there is no verification email, no password reset, no magic link. Lose your password and the account is gone.

**Top 3 Improvements:**
1. Build a web-based signup page at `/signup` with email/password form that returns the key on-screen and copies it to clipboard
2. Add an interactive quickstart wizard (3 steps: signup -> first call -> see result) embedded in the dashboard
3. Implement email verification and password reset flow

**Removed functionality:** None detected -- this was never built.

---

## 2. API KEY MANAGEMENT

**Market Standard (10/10):** Stripe: Multiple keys per account, test/live mode toggle, restricted keys with granular permissions (read-only, specific endpoints), key rotation, revocation, expiration dates, key labels, usage per key.

**Slopshop Current (4/10):**
- One key per account (created at signup). Anonymous keys via `POST /v1/keys`.
- `scope` field exists on keys -- supports tier/category restrictions (e.g. `compute,network`). Basic but functional.
- `label` field exists but no UI/endpoint to set it.
- `max_credits` field exists (budget cap per key) but no management endpoint.
- Team keys via `POST /v1/keys/create-team-key` -- scoped, labeled, budget-limited. Decent.
- Deadman switch (`POST /v1/deadman/register`) -- auto-revoke if heartbeat missed. Unique feature.
- **No key rotation.** No `POST /v1/keys/rotate` endpoint.
- **No key listing.** No `GET /v1/keys` to see all your keys.
- **No key revocation.** No `DELETE /v1/keys/:key` endpoint.
- **No test/live mode.** Everything is live. No sandbox environment.

**Gap:**
1. **No key rotation** -- a security fundamental. If a key leaks, users cannot rotate without creating a brand new account.
2. **No test/live mode** -- developers want to test integrations without spending real credits or hitting production data.
3. **No key management dashboard** -- you cannot list, label, revoke, or inspect your keys via any endpoint or UI.

**Top 3 Improvements:**
1. Add `POST /v1/keys/rotate` that generates a new key, deprecates old key (with grace period), and returns the new one
2. Add `GET /v1/keys` to list all keys for an account, `DELETE /v1/keys/:key` for revocation
3. Implement test mode: `sk-slop-test-*` keys that use a separate namespace, don't deduct real credits, and return real but sandboxed results

**Removed functionality:** None detected.

---

## 3. DOCUMENTATION

**Market Standard (10/10):** Stripe: Interactive API reference with live requests, language tabs (curl/Node/Python/Go/Ruby/PHP), expandable response objects, error code reference, search, versioned docs, "Try it" buttons, webhook testing tools.

**Slopshop Current (4/10):**
- `docs.html` exists as a static page.
- `/v1/tools` and `/v1/tools/:slug` return structured JSON with schemas, descriptions, and examples. Good for machines.
- `llms.txt` file and `.well-known/ai-tools.json` manifest -- excellent for AI agent discovery.
- `api-reference.html` exists. `examples.html` has 16+ worked examples.
- Integration guides for Claude, GPT, Gemini, Cohere, CrewAI, Together, DeepSeek. Solid breadth.
- OpenAPI generation script in package.json (`npm run openapi`).
- **No interactive "Try it" console.** `/v1/tools/:slug/try` exists but returns JSON, not a visual sandbox.
- **No language tabs.** Examples are mostly curl-only.
- **No error code reference page.** Errors are scattered across endpoint implementations.
- **No versioned docs.** No `/v2/docs` vs `/v1/docs`.

**Gap:**
1. **No interactive API explorer.** Stripe's "Try it" panel lets you fill in fields and see real responses. Slopshop's docs are read-only.
2. **No unified error reference.** There are ~20+ distinct error codes (`auth_required`, `invalid_key`, `insufficient_credits`, `rate_limited`, `scope_denied`, `api_not_found`, etc.) scattered through server-v2.js with no central reference.
3. **No multi-language examples.** The Node SDK exists in cli.js, Python SDK in sdk/python/slopshop.py, but docs don't show parallel Node/Python/curl examples.

**Top 3 Improvements:**
1. Build an interactive API explorer page where users can select a tool, fill in params, and see a live response (authenticated with their key)
2. Create a unified error code reference page listing every error code, HTTP status, cause, and resolution
3. Add language tabs to all examples (curl / Node / Python at minimum)

**Removed functionality:** None detected.

---

## 4. ERROR HANDLING

**Market Standard (10/10):** Stripe: Consistent error envelope `{ "error": { "type": "...", "code": "...", "message": "...", "doc_url": "..." } }`. Every error links to its documentation page. Machine-parseable error types. Idempotency support.

**Slopshop Current (5/10):**
- Consistent error envelope: `{ error: { code: '...', message: '...' } }`. Good.
- Error codes are descriptive: `auth_required`, `invalid_key`, `insufficient_credits`, `rate_limited`, `scope_denied`, `api_not_found`, `invalid_batch`, `max_50_per_batch`. Good variety.
- Auth errors helpfully include `demo_key` and `signup` fields pointing to the demo key and signup endpoint. Nice touch.
- `failure_journal` table logs errors per key. Good for debugging.
- **No `doc_url` in errors.** Errors don't link to documentation.
- **No error type hierarchy.** Stripe has `card_error`, `api_error`, `authentication_error`, etc. Slopshop has flat codes.
- **No idempotency keys.** Retrying a request could double-charge credits.
- Some errors return bare strings: `res.status(404).send('Not found')` (lines 398-414) instead of JSON -- inconsistent.

**Gap:**
1. **No doc_url in error responses.** Every Stripe error includes a link to the exact help page. Slopshop errors are self-contained but don't point anywhere.
2. **Inconsistent error format.** Some 404s return plain text `'Not found'` instead of the JSON error envelope.
3. **No idempotency support.** Credit-deducting operations have no idempotency key, so retries can double-charge.

**Top 3 Improvements:**
1. Add `doc_url` field to every error response, pointing to `https://slopshop.gg/docs/errors#<code>`
2. Fix all plain-text error responses to use the standard JSON error envelope
3. Add `X-Idempotency-Key` header support for credit-deducting endpoints (POST /v1/:slug, /v1/batch, /v1/pipe)

**Removed functionality:** None detected.

---

## 5. RATE LIMITING

**Market Standard (10/10):** Stripe: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response. 429 responses include `Retry-After` header. Tiered limits (test mode is more generous). Documented limits per endpoint.

**Slopshop Current (7/10):**
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers are set on every authenticated and public request. Good.
- 429 responses include `Retry-After: 60`. Good.
- Authenticated: 60 req/min. Public: 30 req/min. Reasonable defaults.
- In-memory rate limiting with IP-based tracking and periodic cleanup. Works but won't survive restarts or multi-instance deploys.
- **No per-tier rate limits.** Free and Leviathan ($1,999) users get the same 60 req/min.
- **No per-endpoint limits.** Expensive LLM calls and cheap compute calls share the same bucket.
- **No documentation of limits.**

**Gap:**
1. **No tiered rate limits.** Paying customers should get higher limits. The 60 req/min flat limit will frustrate high-volume users.
2. **In-memory only.** Rate limit state is lost on server restart and doesn't work across multiple instances. Need Redis or SQLite-based tracking.
3. **No documented rate limit page.** Users discover limits only when they hit 429.

**Top 3 Improvements:**
1. Implement tiered rate limits: free=60/min, baby-lobster=120/min, shore-crawler=300/min, reef-boss=600/min, leviathan=1200/min
2. Move rate limit state to SQLite (already available) for persistence across restarts
3. Document rate limits on a dedicated page and in the API reference

**Removed functionality:** None detected.

---

## 6. BILLING / CREDITS

**Market Standard (10/10):** Stripe: Usage dashboard with graphs, downloadable invoices, spending alerts, monthly billing summaries, payment method management, auto-reload, refund handling, tax documentation.

**Slopshop Current (5/10):**
- Credit balance via `GET /v1/credits/balance`. Basic.
- Credit purchase tiers: 1K/$9, 10K/$49, 100K/$299, 1M/$1,999. Clear pricing.
- Stripe Checkout integration in `stripe.js` -- real payment processing with webhook fulfillment. Production-grade when STRIPE_SECRET_KEY is configured.
- Credit transfer between keys: `POST /v1/credits/transfer`. Unique social feature.
- Credit codes: `POST /v1/credits/redeem`. Good for promotions.
- Auto-reload config exists: `POST /v1/credits/auto-reload` with threshold + amount. Good.
- Usage tracking: `GET /v1/usage` shows calls and credits by API. Functional.
- Credit trading marketplace exists for peer-to-peer credit exchange.
- **No spending alerts.** No email/webhook when balance is low.
- **No invoices.** No downloadable receipt or invoice PDF.
- **No usage graphs / visual dashboard.** `/v1/dashboard` returns JSON, not a visual page.
- **No refund mechanism.**

**Gap:**
1. **No spending alerts.** Users find out they're out of credits when a call fails with `insufficient_credits`. Stripe sends email at 80% usage.
2. **No visual billing dashboard.** The data exists (`/v1/usage`, `/v1/dashboard`) but there's no visual consumption over time. `dashboard.html` may exist but is not a billing-focused view.
3. **No invoices or receipts.** Enterprise customers need downloadable invoices for expense reports.

**Top 3 Improvements:**
1. Add low-balance webhook/email alerts at configurable thresholds (e.g. 100, 500, 1000 credits remaining)
2. Build a visual usage dashboard showing credit consumption over time, top APIs, daily/weekly trends
3. Generate downloadable invoice PDFs for each Stripe payment (can use Stripe's built-in invoice feature)

**Removed functionality:** None detected.

---

## 7. SDKs

**Market Standard (10/10):** Stripe: TypeScript SDK with full types, auto-completion, typed error classes, automatic retry with exponential backoff, pagination helpers, webhook signature verification, comprehensive test mocks, published on npm/PyPI with frequent updates, Go/Ruby/PHP/Java SDKs.

**Slopshop Current (3/10):**
- **Node SDK:** The CLI (`cli.js`) doubles as the npm package. Has `call`, `batch`, `agent`, `memory` commands. Well-structured with color output and config file support. No programmatic Node.js SDK separate from CLI.
- **Python SDK:** `sdk/python/slopshop.py` -- minimal but functional. Uses `urllib` (no requests dependency). Has `call()`, `batch()`, `agent()`, `memory_set/get/search()`, `balance()`, `health()`. ~80 lines. Custom `SlopshopError` exception.
- **No TypeScript types.** No `.d.ts` files, no typed responses.
- **No retry logic.** Neither SDK retries on 429 or 5xx.
- **No pagination helpers.** Tools list supports `offset/limit` but SDKs don't abstract it.
- **No webhook verification helper.**
- **No Go/Ruby/PHP/Java SDKs.**
- Python SDK uses `urllib` instead of `requests`/`httpx` -- unusual but zero-dependency.

**Gap:**
1. **No TypeScript types.** Modern Node.js developers expect full auto-completion. The package ships no types at all.
2. **No retry logic.** Both SDKs will fail permanently on transient errors. Stripe's SDK retries 429s with exponential backoff automatically.
3. **No programmatic Node.js SDK.** The npm package is a CLI tool. There's no `const slop = require('slopshop'); slop.call('sha256', {...})` equivalent for Node.

**Top 3 Improvements:**
1. Create a proper Node.js SDK (`sdk/node/index.ts`) with TypeScript types, auto-completion for all 1,250 tools, and typed error classes
2. Add automatic retry with exponential backoff (on 429 and 5xx) to both Node and Python SDKs
3. Publish Python SDK to PyPI as a proper package with typed stubs (`.pyi` files)

**Removed functionality:** None detected -- SDKs were always minimal.

---

## 8. TRUST & VERIFICATION

**Market Standard (10/10):** Stripe: SOC 2 Type II certified, PCI DSS Level 1, GDPR compliant, public status page (status.stripe.com), incident history, 99.999% uptime SLA, security whitepaper, bug bounty program, third-party penetration tests.

**Slopshop Current (2/10):**
- SOC 2 Type II listed as "in progress" with audit scheduled Q3 2026. Not yet certified.
- No public status page. `/v1/uptime` returns JSON with uptime since last restart -- not historical availability.
- No incident history or postmortem archive.
- No SLA documented anywhere.
- No security whitepaper or architecture documentation.
- No bug bounty program.
- HTTPS via Railway (TLS 1.3). Data encrypted at rest in SQLite WAL. Basic but not documented.
- The user's concern ("the source of trust is still you") is valid: slopshop is a single-person operation with no third-party verification.
- Enterprise page mentions SOC 2 in progress, DPA available on request, self-hosting for data sovereignty. Good intent, not yet delivered.

**Gap:**
1. **No third-party trust signals.** No SOC 2 cert, no independent audit, no compliance badge. Enterprise buyers cannot get security team approval.
2. **No public status page.** When things break, users have no way to check if it's them or you. This is table-stakes for any API provider.
3. **No SLA or uptime commitment.** The `uptime_pct: 99.97` in the health endpoint is a self-reported number with no contractual backing.

**Top 3 Improvements:**
1. Launch a public status page (use Upptime, Instatus, or Betterstack -- free tier is fine) with real monitoring from external probes
2. Publish a security practices page documenting: encryption at rest/transit, auth mechanism (PBKDF2 100K iterations), data isolation, backup policy, incident response
3. Accelerate SOC 2 Type II and publish the report. In the meantime, publish a trust center page with what you DO have (encryption, auth, data isolation, self-host option).

**Removed functionality:** None detected.

---

## 9. SELF-HOSTING

**Market Standard (10/10):** Supabase: `docker compose up` with a single `.env` file. All env vars documented. Migration scripts included. Backup/restore documented. Air-gap deployment guide. Kubernetes Helm chart.

**Slopshop Current (6/10):**
- Dockerfile exists: Node 20 slim, installs Python3 for exec-python handler, `npm ci --production`, healthcheck included. Clean and minimal.
- docker-compose.yml exists: single service, port 3000, persistent volume for `.data/`, restart policy. Works.
- `node server-v2.js` starts everything. Single binary. Zero external dependencies for compute APIs. Genuinely impressive simplicity.
- SQLite for persistence (no Postgres/Redis required). Very easy to self-host.
- `.env` documentation is sparse. The README mentions `PORT`, `ANTHROPIC_API_KEY`, and `DB_PATH`. But `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_SECRET`, `INTERNAL_SECRET`, `CORS_ORIGIN`, `BASE_URL` are undocumented.
- **No Kubernetes manifests or Helm chart.**
- **No backup/restore documentation.**
- **No migration scripts.** SQLite schema is auto-created but there's no versioned migration system.
- **No `.env.example` file.**

**Gap:**
1. **No `.env.example` with all variables documented.** Users must read source code to discover what env vars exist.
2. **No backup/restore guide.** SQLite makes this trivial (copy the .db file) but it's not documented.
3. **No Kubernetes deployment option.** Docker Compose is fine for small deployments but enterprises need K8s manifests.

**Top 3 Improvements:**
1. Create `.env.example` listing every env var with descriptions, defaults, and whether it's required
2. Add a backup/restore section to docs: `cp .data/slopshop.db backup.db` and volume mount instructions
3. Add Kubernetes manifests (Deployment + Service + PVC) and a Helm chart for enterprise self-hosting

**Removed functionality:** None detected.

---

## 10. MCP INTEGRATION

**Market Standard (8/10):** (MCP is new, so "market standard" is emerging.) Best MCP servers: Curated tool list (not dumping hundreds of tools), proper input schemas with types and descriptions, error handling that returns useful messages to the LLM, streaming support, auth via env vars.

**Slopshop Current (7/10):**
- `mcp-server.js` implements MCP protocol over stdio. Correct approach.
- **Smart curation:** Only 30 "essential" tools exposed via MCP (not all 1,250). Explicitly avoids context bloat. References agentpmt.com/articles/bloat-tax. Excellent design decision.
- Tools are tiered: Tier A (things Claude CANNOT do: network, external), Tier B (Slopshop is verifiably better: crypto, stats, token counting).
- Proper input schemas built from the server's schema definitions.
- Tool names prefixed with `slop-` for namespace clarity.
- Cost shown in description: `[5cr] SHA256 hash`. Transparent.
- Protocol version `2024-11-05`. Current.
- Auth via `SLOPSHOP_KEY` env var. Standard.
- `npx -y slopshop mcp` for zero-install usage. Good DX.
- **No streaming support.** MCP supports streaming but this server doesn't implement it.
- **No resource/prompt primitives.** Only `tools` capability. MCP also supports `resources` and `prompts` which could expose memory and templates.
- **30-second timeout.** May be too short for LLM-backed tools.

**Gap:**
1. **No MCP resources.** Memory keys could be exposed as MCP resources, letting Claude browse stored state natively.
2. **No MCP prompts.** Template marketplace entries could be exposed as MCP prompts, giving Claude pre-built workflows.
3. **No streaming.** Long-running tools (LLM summarize, code execution) would benefit from streaming progress back to the MCP client.

**Top 3 Improvements:**
1. Add MCP `resources` capability to expose memory keys as browsable resources
2. Add MCP `prompts` capability to expose popular templates as reusable prompts
3. Implement streaming for long-running tool calls via MCP's streaming protocol

**Removed functionality:** None detected.

---

## SCORECARD SUMMARY

| Area | Market Standard | Slopshop Score | Delta |
|------|:-:|:-:|:-:|
| 1. Signup/Onboarding | 10 | 5 | -5 |
| 2. API Key Management | 10 | 4 | -6 |
| 3. Documentation | 10 | 4 | -6 |
| 4. Error Handling | 10 | 5 | -5 |
| 5. Rate Limiting | 10 | 7 | -3 |
| 6. Billing/Credits | 10 | 5 | -5 |
| 7. SDKs | 10 | 3 | -7 |
| 8. Trust & Verification | 10 | 2 | -8 |
| 9. Self-Hosting | 10 | 6 | -4 |
| 10. MCP Integration | 8 | 7 | -1 |
| **Average** | **9.8** | **4.8** | **-5.0** |

---

## TOP 20 PRIORITIZED IMPROVEMENTS

Ranked by (trust impact x conversion impact x implementation feasibility):

| # | Improvement | Area | Impact | Effort |
|---|------------|------|--------|--------|
| 1 | **Launch a public status page** (Betterstack/Upptime) with uptime monitoring from external probes | Trust | Critical | 2 hours |
| 2 | **Build a web-based signup page** at `/signup` with email form, key display, and clipboard copy | Onboarding | Critical | 4 hours |
| 3 | **Create `.env.example`** listing every env var with descriptions and defaults | Self-Host | High | 1 hour |
| 4 | **Add `POST /v1/keys/rotate`** endpoint for key rotation | Key Mgmt | Critical | 2 hours |
| 5 | **Publish a security practices page** documenting encryption, auth, data isolation, and incident response | Trust | Critical | 3 hours |
| 6 | **Create a TypeScript SDK** with typed responses, auto-completion, and retry logic | SDKs | High | 2 days |
| 7 | **Fix inconsistent error responses** -- replace all plain-text 404s with JSON error envelope | Errors | High | 1 hour |
| 8 | **Add `doc_url` to all error responses** pointing to error reference page | Errors | High | 2 hours |
| 9 | **Add key listing and revocation** endpoints (`GET /v1/keys`, `DELETE /v1/keys/:key`) | Key Mgmt | High | 3 hours |
| 10 | **Build an interactive API explorer** page with live request/response | Docs | High | 1 day |
| 11 | **Implement tiered rate limits** based on payment tier | Rate Limits | Medium | 3 hours |
| 12 | **Add low-balance alerts** via webhook when credits drop below threshold | Billing | High | 3 hours |
| 13 | **Add retry logic with exponential backoff** to Node and Python SDKs | SDKs | Medium | 4 hours |
| 14 | **Create a unified error code reference page** listing all error codes, causes, and resolutions | Docs | Medium | 3 hours |
| 15 | **Implement test mode** with `sk-slop-test-*` keys that don't deduct real credits | Key Mgmt | High | 1 day |
| 16 | **Add `X-Idempotency-Key` support** for credit-deducting endpoints | Errors | Medium | 4 hours |
| 17 | **Add email verification and password reset** to auth flow | Onboarding | Medium | 1 day |
| 18 | **Build a visual usage dashboard** showing credit consumption over time with charts | Billing | Medium | 1 day |
| 19 | **Add MCP resources capability** to expose memory as browsable resources | MCP | Medium | 4 hours |
| 20 | **Document rate limits** on a dedicated page and in API reference | Rate Limits | Medium | 2 hours |

---

## KEY OBSERVATIONS

**What slopshop does BETTER than market standard:**
- **Zero-dependency self-hosting.** Single Node.js binary + SQLite. No Postgres, no Redis, no external services. This is genuinely simpler than Supabase self-hosting.
- **MCP tool curation.** The 30-tool essential list with explicit tiering logic is smarter than competitors who dump everything into context.
- **Free persistent memory.** No other API platform offers this as a wedge. It is a legitimate differentiator.
- **Credit trading / agent wallets.** Unique economic layer that no competitor has.
- **`_engine: "real"` proof in every response.** Signals authenticity at the protocol level.

**What MUST change for enterprise adoption:**
- Trust signals are almost entirely absent. No SOC 2, no status page, no SLA, no security documentation. This is the #1 blocker.
- SDK story is incomplete. The npm package is a CLI, not a library. The Python SDK is 80 lines with no types and no retry logic.
- Key management is primitive. No rotation, no revocation, no listing. This will fail any security review.

**Critical finding:** The auth error messages reference `POST /v1/auth/signup` but the quickstart in the README shows `export SLOPSHOP_KEY="sk-slop-demo-key-12345678"` -- there is a disconnect between the "real signup" path and the "demo key" path. New users will not understand which to use.
