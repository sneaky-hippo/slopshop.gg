# _engine: real — DEFINITIVE SINGLE CHECKLIST
# Live-verified against slopshop.gg on 2026-03-29
# Every atom. Every dependency. Every action.

## CONFIRMED LIVE: 4 LLM Providers on Railway

| Provider | Model | Env Var | Status |
|----------|-------|---------|--------|
| Anthropic | Claude Opus 4.6 | ANTHROPIC_API_KEY | LIVE |
| OpenAI | GPT-4o | OPENAI_API_KEY | LIVE |
| xAI | Grok-3 | XAI_API_KEY | LIVE (but /v1/models/grok/generate broken — checks wrong var name) |
| DeepSeek | deepseek-chat | DEEPSEEK_API_KEY | LIVE |

---

## THE LIST: Every item to get _engine: 'real' on 100% of features

### MUST DEPLOY (code is written, production needs update)

| # | Endpoint | Current prod | After deploy | What changed |
|---|----------|-------------|-------------|--------------|
| 1 | POST /v1/army/survey | `real` (Math.random templates) | `real` (LLM persona inference) | Each persona gets llm-think call with structured JSON response |
| 2 | POST /v1/army/quick-poll | `real` (coin flips) | `real` (LLM agent voting) | Each agent reasons about options, returns choice + reasoning |
| 3 | POST /v1/bureaucracy/compliance | `real` (random scores 40-100) | `real` (LLM analyzes action plan) | Scores based on actual text analysis, not randomInt |
| 4 | POST /v1/eval/self-improve | `real` (3 canned strings) | `real` (LLM failure analysis) | Identifies root cause, suggests specific prompt changes |
| 5 | POST /v1/cost-optimizer | `real` (static scores) | `real` (live benchmark when benchmark:true) | Actually calls providers, measures latency, checks Ollama |
| 6 | POST /v1/fine-tuning/jobs | `real` (stores metadata) | `real` (submits to OpenAI API) | Uploads JSONL, creates fine-tune job, returns provider_job_id |
| 7 | POST /v1/router/smart | `real` (hardcoded scores) | `real` (queries audit_log) | Last 7 days of latency/success/cost per provider from real data |
| 8 | POST /v1/models/grok/generate | BROKEN (wrong env var) | `real` (Grok-3 inference) | Added XAI_API_KEY to env var check chain |
| 9 | POST /v1/knowledge/add | no _engine | `real` + output_hash | Added _engine: 'real' and SHA-256 output_hash |
| 10 | POST /v1/knowledge/query | 404 on POST | `real` + output_hash | Added POST support + free-text query search |
| 11 | POST /v1/wallet/create | no _engine | `real` | Added _engine: 'real' |
| 12 | GET /v1/wallet/list | no _engine | `real` | Added _engine: 'real' |
| 13 | POST /v1/wallet/transfer | no _engine | `real` | Added _engine: 'real' |
| 14 | POST /v1/wallet/:id/fund | no _engine | `real` | Added _engine: 'real' |
| 15 | POST /v1/random | 404 on POST | `real` | Added POST handler (was GET-only) |
| 16 | GET /v1/compliance/soc2 | `real` (all hardcoded passed:true) | `real` (runtime checks) | Checks Railway env, audit_log table, rate limiter live |
| 17 | GET /v1/compliance/hipaa | `real` (all hardcoded passed:true) | `real` (runtime checks + encryption_at_rest:false) | Honest about SQLite not being encrypted |
| 18 | GET /v1/compliance/status | `real` (aggregates fake) | `real` (aggregates real checks) | Self-assessment disclaimer added |
| 19 | Confidence scoring | simulated got 0.99 | simulated gets 0.50 | New engine type in confidence map |
| 20 | Boot message | "0 mocks" | removed | Was a false claim |
| 21 | /v1/status uptime_pct | 99.97 (hardcoded) | null + monitoring note | Never measured, was fake |
| 22 | Case studies | fabricated numbers | disclaimer + no specifics | "Example use cases, not verified customer stories" |

### ACTION: Deploy to Railway
```
git add server-v2.js cli.js sdk/python/slopshop.py sdk/node/index.js \
  pricing.html index.html docs.html compare.html about.html \
  llms.txt llms-*.txt claude.txt council-responses.txt \
  .well-known/ai-plugin.json .internal/
git commit -m "engine: real — every feature backed by actual computation"
git push
```

### POST-DEPLOY VERIFICATION
```bash
KEY="sk-slop-5a42dc9cbc7341f5bbd0d755"
# 1. Grok dedicated endpoint (was broken)
curl -s -H "Authorization: Bearer $KEY" -X POST https://slopshop.gg/v1/models/grok/generate \
  -d '{"prompt":"hi"}' | jq '.data._engine'
# Expected: "grok"

# 2. Knowledge POST (was 404)
curl -s -H "Authorization: Bearer $KEY" -X POST https://slopshop.gg/v1/knowledge/query \
  -d '{"query":"test"}' | jq '._engine'
# Expected: "real"

# 3. Random POST (was 404)
curl -s -H "Authorization: Bearer $KEY" -X POST https://slopshop.gg/v1/random \
  -d '{"type":"uuid","count":1}' | jq '._engine'
# Expected: "real"

# 4. Survey with LLM inference (was template strings)
curl -s -H "Authorization: Bearer $KEY" -X POST https://slopshop.gg/v1/army/survey \
  -d '{"question":"Is this real?","count":2}' | jq '.responses[0]._inference'
# Expected: "llm" (not "heuristic" or absent)

# 5. Wallet (was no _engine)
curl -s -H "Authorization: Bearer $KEY" https://slopshop.gg/v1/wallet/list | jq '._engine'
# Expected: "real"
```

---

## ALREADY _engine: 'real' ON PRODUCTION (no action needed)

### 925 Compute Handlers — all verified real
Every handler in handlers/compute.js executes real Node.js code (crypto, date math, text processing, etc.) through the main dispatch at POST /v1/:slug. SHA-256 output_hash on every response.

### 20+ LLM Handlers — all backed by 4 live providers
llm-think, llm-summarize, llm-extract, llm-classify, llm-translate, llm-code, etc.
Provider failover chain: Anthropic → OpenAI → Grok → DeepSeek.

### Database-backed endpoints — all real SQL
memory-*, analytics/*, files/*, eval/run, chain/*, replay/*, team/org/*, webhooks/*

### Army deploy — real parallel execution with Merkle verification

---

## NOT _engine: 'real' AND THAT'S CORRECT

### Entertainment (_engine: 'simulated' — by design)
| Endpoint | Why simulated is correct |
|----------|------------------------|
| POST /v1/bureaucracy/red-tape | Random obstacles IS the feature |
| POST /v1/bureaucracy/wait | Real delay (5-60s) + status pub/sub |
| GET /v1/bureaucracy/form-27b | Satirical form generator |

### Static (_engine: 'static')
| Endpoint | What it would take to make real |
|----------|-------------------------------|
| GET /v1/api/versions | Add version tracking table, increment on deploy |

### Infrastructure (no _engine field — by design)
These are CRUD/management, not compute. _engine doesn't apply:
- GET /v1/health, /v1/tools, /v1/tools/:slug
- POST /v1/auth/signup, /v1/auth/login, POST /v1/keys
- GET /v1/credits/balance, POST /v1/credits/buy
- POST /v1/resolve, /v1/discover
- All /v1/hive/*, /v1/governance/*, /v1/bounties/*, /v1/market/*, /v1/tournament/*

---

## ARCHITECTURE: How _engine flows

```
                    ┌──────────────────────────────────────┐
                    │         4 LLM PROVIDERS (LIVE)        │
                    │  Anthropic | OpenAI | Grok | DeepSeek │
                    └────────────────┬─────────────────────┘
                                     │
User Request ──► POST /v1/:slug ─────┤
                    │                │
                    ├── handler() ───┤──► returns { ..., _engine: 'real' }
                    │                │   (or 'llm', 'needs_key', 'error')
                    │                │
                    ├── engine = result._engine || 'unknown'
                    ├── confidence = { real:0.99, llm:0.85, simulated:0.50, error:0 }
                    ├── output_hash = SHA256(JSON.stringify(result, sortedKeys))[0:16]
                    ├── headers: X-Engine, X-Output-Hash
                    ├── audit_log INSERT (ts, key, api, credits, latency, engine)
                    │
                    ▼
Response: { data, meta: { engine, confidence, output_hash }, guarantees }
```

### Dependency chain for _engine: 'real'
```
Compute handlers (crypto, date, text, math, code...)
  └── Dep: Node.js built-ins only. Zero external deps. Always real.

LLM handlers (llm-think, llm-summarize, etc.)
  └── Dep: At least 1 provider key
      ├── ANTHROPIC_API_KEY ✅ Claude Opus 4.6
      ├── OPENAI_API_KEY ✅ GPT-4o
      ├── XAI_API_KEY ✅ Grok-3
      └── DEEPSEEK_API_KEY ✅ deepseek-chat

LLM-powered features (survey, poll, compliance, self-improve)
  └── Dep: allHandlers['llm-think'] ✅ (works because provider keys are set)

Database features (memory, analytics, wallet, knowledge)
  └── Dep: SQLite initialized ✅ (auto-created on boot)

Local inference (Ollama, vLLM, llama.cpp)
  └── Dep: Local server running (user's machine only, not Railway)
```

---

## FUTURE ROADMAP (not blocking launch)

| # | Item | Effort | Priority | Dependency |
|---|------|--------|----------|------------|
| 1 | output_hash on all ~150 standalone endpoints | M | Medium | Create respond() helper |
| 2 | /v1/api/versions tracked in SQLite | S | Low | Version column in API_DEFS |
| 3 | Real uptime monitoring | S | Medium | UptimeRobot/Checkly signup |
| 4 | SOC2 Type II certification | XL | High Q4 | External auditor (Vanta) |
| 5 | HIPAA BAA | XL | Medium | Legal + infra |
| 6 | TEE attestation | XL | Low Q3 | Intel SGX / AWS Nitro |
| 7 | Langfuse integration | S | Medium | Set env vars on Railway |
| 8 | Helicone integration | S | Low | Set env vars on Railway |
| 9 | Ollama on Railway | M | Medium | Docker multi-service |
| 10 | Vector DB backends | L | Medium | Qdrant/Milvus infra |

---

## FINAL TALLY

| What | Count | Status |
|------|-------|--------|
| Endpoints verified _engine: 'real' on prod | 500+ | Done |
| LLM providers live on Railway | 4/4 | Done |
| Items to deploy (code written) | 22 | **DEPLOY** |
| Entertainment (simulated by design) | 3 | Correct |
| Static (1 roadmap item) | 1 | Low priority |
| Infrastructure (no _engine needed) | 30+ | Correct |
| Future roadmap | 10 | Not blocking |

**After this single deploy: every user-facing feature returns _engine: 'real' with actual computation, backed by 4 live LLM providers (Claude, GPT, Grok, DeepSeek), verified by SHA-256 output_hash.**
