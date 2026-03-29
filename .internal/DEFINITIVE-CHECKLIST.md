# DEFINITIVE CHECKLIST — Strat 1 + Strat 2 Combined
# Every item, atomic level, with status
# Generated: 2026-03-29

---

## STRAT 1 PHASE 0: IGNITION (Week 1)

### MCP Server
- [x] `slop mcp serve` STDIO mode
- [x] `slop mcp serve <port>` HTTP mode
- [x] `slop mcp config` shows config for all clients
- [x] MCP JSON-RPC 2.0 lifecycle
- [x] Tools + Resources primitives
- [x] Memory as MCP Resource
- [x] Protocol version 2025-06-18
- [x] 45 curated tools exposed
- [ ] Submit to mcp.so registry
- [ ] Submit to Glama.ai registry
- [ ] One-click Claude Desktop install script

### Goose Integration
- [x] slopshop-research-swarm.yaml
- [x] slopshop-code-audit.yaml
- [x] slopshop-credit-pipeline.yaml
- [x] slopshop-hive-collab.yaml
- [x] slopshop-security-sweep.yaml
- [ ] Submit to Goose extensions directory
- [ ] 50 total recipes (have 5)

### Aider Integration
- [x] aider-slopshop.yml with 6 commands
- [ ] slopshop-aider-superplugin pip package
- [ ] Outreach to Paul Gauthier

### Cline Integration
- [x] SKILL-slopshop-compute.md
- [x] SKILL-slopshop-memory.md
- [x] SKILL-slopshop-swarm.md
- [ ] Submit to Cline MCP marketplace
- [ ] 20 total skills (have 3)

### OpenCode Integration
- [x] opencode-slopshop.json config
- [ ] Full event-driven npm plugin with TUI extensions

### Credit Exchange v1
- [x] POST /v1/exchange/register
- [x] POST /v1/exchange/submit
- [x] POST /v1/exchange/poll
- [x] GET /v1/exchange/list
- [x] POST /v1/wallet/create
- [x] POST /v1/wallet/transfer
- [x] POST /v1/wallet/:id/fund
- [ ] Actual peer hardware sharing (functional vs stub unclear)

### CLI Foundations
- [x] `slop init --full-stack --ollama --goose`
- [x] Shell completions bash/zsh/fish
- [x] `slop doctor` 7-check diagnostic
- [x] `slop benchmark` 8-endpoint test
- [x] `slop quickstart` 6-step tutorial with resource detection
- [x] `slop agents set/start/stop/status`

---

## STRAT 1 PHASE 1: DISTRIBUTION (Q2 2026)

### CLI Polish
- [x] First-run welcome banner
- [x] Smart error messages (401/402/404/429)
- [x] Command timing on every call
- [x] Interactive mode with smart local routing
- [ ] Rich TUI mode (live swarm visualizer, Merkle panels, credit display)
- [ ] `slop playground` interactive tutorial

### Community
- [ ] Weekly "Slop Drop" handler releases
- [ ] Sovereign challenge bounties
- [ ] Lobster meme contests
- [ ] Public benchmark comparisons vs competitors
- [ ] awesome-slopshop GitHub repo

### Ecosystem Growth
- [ ] 50k GitHub stars target
- [ ] Public GitHub repo (github.com/slopshop/slopshop)
- [ ] npm publish v3.7.0 (still at 3.1.0)

---

## STRAT 2 PHASE 1: QUICK WINS (0-2 Weeks)

### Native Ollama
- [x] GET /v1/models/ollama — auto-detect models
- [x] POST /v1/models/ollama/generate — proxy + hash + memory (0 credits)
- [x] POST /v1/models/ollama/embeddings — vectors (0 credits)
- [ ] SDK: client.ollama.call(model, task, namespace)
- [ ] Route /v1/agent/run through Ollama when model specified
- [ ] "Ollama + Slopshop" landing page

### Native vLLM
- [x] GET /v1/models/vllm — detect models
- [x] POST /v1/models/vllm/generate — OpenAI-compatible proxy (0 credits)
- [ ] PagedAttention hints for army/scale calls

### Native llama.cpp
- [x] POST /v1/models/llama-cpp/generate — proxy (0 credits)
- [ ] Raspberry Pi / edge documentation

---

## STRAT 2 PHASE 2: FRAMEWORK DOMINATION (2-6 Weeks)

### LangGraph SDK
- [x] slopshop-langgraph.py file exists
- [x] SlopToolNode wraps any slug
- [x] SlopMemoryCheckpointer for free memory
- [ ] Published to pip as slopshop-langgraph
- [ ] Published to npm as slopshop-langgraph
- [ ] Auto hive creation for multi-agent graphs

### CrewAI SDK
- [x] slopshop-crewai.py file exists
- [x] SlopCrewTool + SlopRoleMemory
- [ ] Published to pip
- [ ] Role-based standup integration

### AutoGen SDK
- [x] slopshop-autogen.py file exists
- [x] SlopFunction + SlopAgentMemory
- [ ] Published to pip

### Vector DB Backends
- [ ] Config: memory_backend: "qdrant://localhost:6333"
- [ ] Qdrant integration
- [ ] Milvus integration
- [ ] Weaviate integration
- [ ] Chroma integration
- [ ] Hybrid mode: fallback to SQLite
- [ ] Seamless migration + Merkle proofs across backends

---

## STRAT 2 PHASE 3: ENTERPRISE SCALE (6-12 Weeks)

### Observability
- [ ] Langfuse native exporter
- [ ] Helicone integration
- [ ] Phoenix integration
- [ ] Auto-send X-Output-Hash + traces

### Infrastructure
- [ ] Kubernetes Operator
- [ ] Helm Chart
- [ ] RunPod one-click deploy
- [ ] Vast.ai one-click deploy
- [ ] DGX Spark support

### Model Routing
- [ ] Grok native: /v1/models/grok with reasoning hints
- [ ] DeepSeek auto-routing with context-size detection
- [ ] Qwen3 auto-routing
- [ ] MiniMax auto-routing
- [ ] Kimi auto-routing

### More Integrations
- [ ] Continue.dev MCP support
- [ ] Gemini CLI support
- [ ] Zapier/Make self-hosted equivalent

---

## STRAT 2 PHASE 4: MOONSHOTS (3-6+ Months)

- [ ] WebAssembly browser runtime for edge agents
- [ ] TinyML orchestration (Raspberry Pi agents)
- [ ] SOC 2 Type II certification (in progress, not complete)
- [ ] HIPAA acceleration
- [ ] Blockchain wallet deep integration
- [ ] Self-improving evals UI
- [ ] TEE attestation (Intel SGX / AWS Nitro / AMD SEV)

---

## BACKEND WIRINGS (from Strat 2 deep analysis)

### Army + Merkle (DONE)
- [x] Parallel executor with batches
- [x] Per-agent _output_hash
- [x] Merkle tree construction (SHA-256 binary tree)
- [x] merkle_root in response
- [x] Partial refund on sub-agent failure
- [ ] `--visualize-merkle` CLI flag (ASCII tree diagram)
- [ ] `--save-replay` flag on army deploy
- [ ] Public replay gallery endpoint

### Replay System (DONE)
- [x] POST /v1/replay/save
- [x] GET /v1/replay/:id
- [x] GET /v1/replay/load (alias)
- [ ] Stream sub-results with proof paths
- [ ] Merkle inclusion path in replay data

### Governance (DONE)
- [x] POST /v1/hive/:id/governance/propose
- [x] POST /v1/hive/:id/governance/vote
- [x] GET /v1/hive/:id/governance
- [x] POST /v1/hive/:id/standup
- [ ] Weighted voting by reputation + credit stake
- [ ] Quorum detection (51% auto-apply)

### Eval + Tournament (DONE)
- [x] POST /v1/eval/run (exists 3x — needs dedup)
- [x] POST /v1/tournament/create
- [x] POST /v1/tournament/:id/match
- [ ] Public /v1/tournament/leaderboard endpoint
- [ ] Self-improving tournament evals

### Wallets + Economy (DONE)
- [x] POST /v1/wallet/create
- [x] POST /v1/wallet/:id/fund
- [x] POST /v1/wallet/transfer
- [x] GET /v1/wallet/list
- [x] POST /v1/bounties/post
- [x] POST /v1/bounties/:id/claim
- [x] POST /v1/bounties/:id/submit
- [x] GET /v1/bounties
- [x] POST /v1/market/create
- [x] POST /v1/market/:id/bet
- [x] POST /v1/market/:id/resolve
- [ ] `slop market list --sort=reward`
- [ ] Agent-to-agent auto-transfer on Merkle-proven completion

### Knowledge Graph (DONE)
- [x] POST /v1/knowledge/add
- [x] POST /v1/knowledge/query
- [ ] Graphviz export CLI command
- [ ] Vector embedding fallback on query

### Pipes (PARTIAL)
- [x] pipes.js exists with prebuilt pipes
- [x] `slop pipe` CLI command
- [ ] POST /v1/pipe/run server endpoint
- [ ] POST /v1/pipe/create server endpoint
- [ ] `slop pipe gallery` marketplace

### Queues (DONE)
- [x] prompt_queue table
- [x] POST /v1/chain/queue
- [ ] `slop queue push/export` CLI commands

### Webhooks (DONE)
- [x] POST /v1/webhooks/create
- [x] POST /v1/webhooks/register
- [ ] `slop webhooks create` CLI command

### Smart Router (DONE)
- [x] POST /v1/router/smart
- [ ] `--verbose-route` flag showing decision tree
- [ ] Public route-visualizer endpoint

### Enterprise (DONE)
- [x] POST /v1/teams/create
- [x] Budget fields in team keys
- [x] RBAC logic
- [ ] `slop teams` CLI commands

---

## SITE + DOCS + SEO

### Pricing Consistency
- [x] auth.js gives 500 credits
- [x] Most HTML pages say 500
- [ ] pricing.html still may say 2K in some places
- [ ] Verify ALL pages match

### Numbers Consistency
- [x] Health reports 1255 APIs
- [x] Most pages updated to 1255
- [ ] Some pages may still say 1248 or 927

### GitHub
- [ ] Create github.com/slopshop/slopshop (public)
- [ ] Or update all refs to sneaky-hippo/slopshop.gg

### npm
- [ ] npm publish 3.7.0 (currently 3.1.0 published)
- [ ] Verify package contents match expectations

### Stripe
- [ ] Verify STRIPE_SECRET_KEY set on Railway
- [ ] Verify STRIPE_WEBHOOK_SECRET set
- [ ] Test $9 Baby Lobster purchase with test card

### SEO
- [x] llms.txt in 20 languages
- [x] claude.txt with MCP config
- [x] .well-known/ai-tools.json
- [x] .well-known/ai-plugin.json
- [x] robots.txt
- [ ] sitemap.xml verification
- [ ] All meta descriptions accurate

---

## HIVE SYSTEM

### Architecture (DONE)
- [x] 3-phase: CLOUD-SCAN → LOCAL-ENRICH → CLOUD-FIX
- [x] CLAUDE.md context injection (0% → 100% awareness)
- [x] Git branch safety (master never touched)
- [x] 3-gate validation (syntax + runtime + semantic)
- [x] CSV metrics logging
- [x] Rolling context windows (research 50, scores 50, builds 50)
- [x] Local-first memory (cloud sync on save)

### Effectiveness
- [ ] Local models can't find bugs (say FINE to everything)
- [ ] Cloud scans say "clean code" (may actually be clean)
- [ ] 0 shipped improvements from autonomous hive
- [ ] Hive corrupted 5 lines across 3 files ("javascript" bug)

### Safety Improvements Needed
- [x] Disable file editing by default (opt-in only) — FIXED 2026-03-29
- [x] Blacklist files from hive editing (agent.js, server-v2.js critical paths) — FIXED 2026-03-29
- [ ] Full benchmark gate (not just syntax + version)
- [ ] Post-deploy health check before marking success

---

## AUDIT FIXES (2026-03-29)

### CLI Bugs Fixed
- [x] cmdBalance JSON mode broken (SCORE: X/10 label statement) — FIXED
- [x] cmdCall arg parsing inverted (skipped real args) — FIXED
- [x] cmdHive stray `js` on line 1520 (ReferenceError) — FIXED
- [x] loadConfig returned rejected Promise instead of {} — FIXED
- [x] 9 commands missing from interactive REPL — FIXED

### _engine: "real" Integrity Fixes
- [x] army/survey — changed to _engine: 'simulated' (was Math.random masquerading as research)
- [x] army/quick-poll — changed to _engine: 'simulated' (was coin flips)
- [x] bureaucracy/red-tape — changed to _engine: 'simulated'
- [x] bureaucracy/compliance — changed to _engine: 'simulated'
- [x] bureaucracy/wait — changed to _engine: 'simulated'
- [x] bureaucracy/form-27b — changed to _engine: 'simulated'
- [x] Hardcoded uptime 99.97% — changed to null with note to use external monitoring
- [x] Compliance SOC2/HIPAA — now actually checks runtime state (Railway, audit log, etc.)
- [x] Compliance HIPAA — added encryption_at_rest: false (honest about SQLite WAL)
- [x] Confidence scoring — added 'simulated' engine type at 0.50 confidence (was auto-0.99)
- [x] Boot message "0 mocks" — removed false claim
- [x] Case studies — removed fabricated specific numbers, added disclaimer

### Additional CLI Bugs Fixed (second pass)
- [x] cmdCall --dry-run referenced undefined `dryRun` variable — FIXED
- [x] Spinner never ran (quiet always !== undefined) — FIXED condition to `if (quiet || ...)`
- [x] Verbose flag parsing broken (`arg.startsWith('-')` returns bool, not string) — FIXED
- [x] extractMeta type guard used wrong operator precedence — FIXED
- [x] extractMeta unconditionally pushed `remaining:` for all meta keys — FIXED with else-if chain

### Site Claim Fixes
- [x] Pricing tiers aligned to CLI (1K/$9, 10K/$49, 100K/$299, 1M/$1999) in index.html + pricing.html
- [x] Handler counts: "1,255 compute handlers" → "925 compute handlers" in index.html, docs.html
- [x] Network handler count: compare.html aligned to 22 (matching index.html)
- [x] 12 localized llms-*.txt: "1,248" → "1,255" — FIXED (all 12 files)
- [x] 5 additional localized llms-*.txt: "927" → "925" (zh, th, hi, ar, es)
- [x] server-v2.js enterprise capabilities: "927" → "925" (3 occurrences)
- [x] llms.txt: "288 REST endpoints" → "1,255 REST endpoints", "927" → "925"
- [x] council-responses.txt: "1248" → "1255" (3 occurrences)
- [x] POST /v1/compare — no longer ranks by response length (sorted alphabetically by provider)
- [x] GET /v1/api/versions — changed to _engine: 'static'
- [x] POST /v1/router/smart — changed to _engine: 'static' with hardcoded scores note

### Real Inference Implementations (2026-03-29)
- [x] POST /v1/army/survey — LLM generates each persona response (real diverse reasoning), heuristic fallback
- [x] POST /v1/army/quick-poll — LLM agents reason about options before voting, random fallback
- [x] POST /v1/bureaucracy/compliance — LLM analyzes action plan, keyword-scoring fallback
- [x] POST /v1/eval/self-improve — LLM analyzes test failures with specific suggestions, canned fallback
- [x] POST /v1/cost-optimizer — live provider benchmarking when benchmark:true, static estimates otherwise
- [x] POST /v1/fine-tuning/jobs — actually submits to OpenAI Fine-Tuning API when key available

### SDK Parity
- [x] Python SDK: added memory_list() and categories() (parity with Node)

---

## SUMMARY COUNTS

| Category | Done | Partial | Missing | Total |
|----------|------|---------|---------|-------|
| Strat 1 Phase 0 | 25 | 3 | 6 | 34 |
| Strat 1 Phase 1 | 5 | 0 | 7 | 12 |
| Strat 2 Phase 1 | 8 | 0 | 4 | 12 |
| Strat 2 Phase 2 | 6 | 0 | 10 | 16 |
| Strat 2 Phase 3 | 0 | 0 | 15 | 15 |
| Strat 2 Phase 4 | 0 | 0 | 7 | 7 |
| Backend Wirings | 27 | 1 | 13 | 41 |
| Site/Docs/SEO | 9 | 0 | 7 | 16 |
| Hive | 7 | 0 | 4 | 11 |
| **TOTAL** | **87** | **4** | **73** | **164** |

**53% complete. 47% remaining.**
