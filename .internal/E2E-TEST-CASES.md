# E2E Test Cases -- Extracted from Grok TUI Sessions (strat 3.txt)

All simulated commands from Grok sessions v1 through v10 (lines 1-3207 of `strat 3.txt`), converted into end-to-end test cases.

---

## SESSION 1 (v1.2.3-beta -- Initial TUI Demo)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S1-T01 | `slop call crypto-hash-sha256 --input "slopshop.gg is the agent backend we needed"` | `{ "input": "slopshop.gg is the agent backend we needed" }` | `{ "hash": "<64-char hex>", "algorithm": "sha256", "_engine": "real", "_merkle_root": "0x...", "_latency_ms": <number>, "_credits_used": 1 }` | `POST /v1/crypto-hash-sha256` | Hash is valid 64-char SHA-256 hex; `_engine` = `"real"`; `_latency_ms` < 50; `_credits_used` = 1; `X-Credits-Used` header present |
| S1-T02 | `memory-set --key="demo_swarm_goal" --value="Build the best agent orchestration layer in 2026"` | `{ "key": "demo_swarm_goal", "value": "Build the best agent orchestration layer in 2026" }` | `{ "status": "ok" }` | `POST /v1/memory-set` | Key persists; subsequent `memory-get` returns exact value; free tier -- zero credits consumed |
| S1-T03 | `memory-search --query="agent backend"` | `{ "query": "agent backend" }` | Array of matches including `demo_swarm_goal` with semantic score >= 0.90 | `POST /v1/memory-search` | Results include key `demo_swarm_goal`; semantic score > 0; results sorted by relevance |
| S1-T04 | Deploy 28-agent swarm: `"Deep dive on Stripe's current tech stack + compare vs competitors"` | `{ "count": 28, "task": "Deep dive on Stripe's current tech stack + compare vs competitors" }` | `{ "swarm_id": "<string>", "agents_spawned": 28, "status": "RUNNING", "merkle_root": "0x..." }` | `POST /v1/army/deploy` | `agents_spawned` = 28; `status` in `["SCALING","RUNNING"]`; `merkle_root` is non-empty hex; swarm eventually reaches `"COMPLETED"` |
| S1-T05 | Hive standup post by Agent-042 | `{ "channel": "#research", "message": "Finished scraping 47 GitHub repos...", "agent": "Agent-042" }` | `{ "status": "posted" }` | `POST /v1/hive/standup` | Message persists in channel; retrievable via hive channel list |
| S1-T06 | Balance check | `{}` | `{ "credits": <number>, "tier": "free", "memory_keys": <number> }` | `GET /v1/credits/balance` | Credits >= 0; tier is valid string; memory_keys >= 0 |

---

## SESSION 2 (v1.2.3-beta -- Full Interactive Session)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S2-T01 | `[L]` List all endpoints (paginated) | `{ "page": 1, "category": "crypto" }` | Paginated list of slugs with categories, engine type, latency | `GET /v1/tools/list` | Returns >= 1 page; each entry has `slug`, `_engine`, category; total count matches documented endpoint count |
| S2-T02 | `slop call crypto-hash-blake3 --input "slop tui is the best dashboard ever"` | `{ "input": "slop tui is the best dashboard ever" }` | `{ "hash": "<hex>", "_engine": "real", "_latency_ms": <number>, "_credits_used": 1 }` | `POST /v1/crypto-hash-blake3` | Hash is valid hex; `_engine` = `"real"`; latency < 50ms |
| S2-T03 | `[T]` sense-url-tech-stack on stripe.com | `{ "url": "stripe.com" }` | `{ "tech_stack": [<strings>], "_engine": "real", "_merkle_root": "0x...", "_latency_ms": <number> }` | `POST /v1/sense-url-tech-stack` | `tech_stack` is non-empty array of strings; `_engine` = `"real"` |
| S2-T04 | `memory-set --key="final_swarm_report" --value="Swarm #44 completed with 100% Merkle verification"` | `{ "key": "final_swarm_report", "value": "Swarm #44 completed with 100% Merkle verification" }` | `{ "status": "ok" }` | `POST /v1/memory-set` | Key persists and is retrievable |
| S2-T05 | `memory-search --query="stripe"` | `{ "query": "stripe" }` | Array with >= 1 matches related to stripe | `POST /v1/memory-search` | Returns results; results contain stripe-related keys |
| S2-T06 | `memory-delete --key="temp_test_key"` | `{ "key": "temp_test_key" }` | `{ "status": "deleted" }` | `POST /v1/memory-delete` | Key no longer retrievable via `memory-get` |
| S2-T07 | Deploy Swarm #44: 42 agents, summarize AI agent news | `{ "count": 42, "task": "Summarize latest AI agent news + store in memory" }` | `{ "swarm_id": "<string>", "agents_spawned": 42, "status": "RUNNING" }` | `POST /v1/army/deploy` | 42 agents spawned; status progresses to COMPLETED |
| S2-T08 | Deploy Swarm #45: 50 parallel DNS lookups | `{ "count": 50, "task": "Run 50 parallel net-dns-a lookups for top agent hosts" }` | `{ "swarm_id": "<string>", "agents_spawned": 50, "status": "RUNNING" }` | `POST /v1/army/deploy` | Both swarms run concurrently; agents_spawned matches |
| S2-T09 | Pipe: `slop pipe "sense-url-tech-stack stripe.com \| text-summarize \| memory-set --key=stripe_summary"` | `{ "pipe": "sense-url-tech-stack stripe.com | text-summarize | memory-set --key=stripe_summary" }` | Summary text stored in memory key `stripe_summary` | `POST /v1/sense-url-tech-stack`, `POST /v1/text-summarize`, `POST /v1/memory-set` | Three endpoints called in sequence; output of each feeds next; final result persisted in memory; `memory-get stripe_summary` returns non-empty string |
| S2-T10 | Hive standup by Agent-117 in #dev-swarm | `{ "channel": "#dev-swarm", "message": "Swarm #44 finished summarization...", "agent": "Agent-117" }` | `{ "status": "posted" }` | `POST /v1/hive/standup` | Message persists; channel shows agent online |
| S2-T11 | Balance + GPU exchange check | `{}` | `{ "credits": <number>, "memory_keys": <number>, "gpu_exchange_earned": <number> }` | `GET /v1/credits/balance`, `GET /v1/exchange/status` | Credits returned; GPU earnings >= 0 |
| S2-T12 | `memory-search --query="latest agent news"` | `{ "query": "latest agent news" }` | Results with semantic score >= 0.90 | `POST /v1/memory-search` | Top result has score >= 0.90 |
| S2-T13 | 100-agent stress test across all 78 categories | `{ "count": 100, "task": "Full end-to-end test of every category", "categories": "all" }` | `{ "swarm_id": "<string>", "agents_used": 100, "categories_tested": 78, "p95_latency": <number>, "merkle_root": "0x...", "memory_keys_created": <number> }` | `POST /v1/army/deploy`, `POST /v1/eval/run` | All 78 categories covered; p95 < 50ms; merkle_root non-empty; status reaches COMPLETED |
| S2-T14 | `[Q]` Quit -- session stats saved | `{}` | Session stats exported to memory key | `POST /v1/memory-set` | Session stats key exists in memory; contains commands_run count |

---

## SESSION 2 -- HOTKEY COVERAGE

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| HK-A | `[A]` Deploy Army | Army deploy payload | Swarm created with agents | `POST /v1/army/deploy` | Returns swarm_id + agents_spawned > 0 |
| HK-H | `[H]` Open Hive channel | `{ "channel": "#research" }` | Channel info + agent list | `GET /v1/hive/channel` | Returns agents_online count; messages array |
| HK-M | `[M]` Memory search/set | Key-value or query | Set or search result | `POST /v1/memory-set` or `POST /v1/memory-search` | Operation succeeds; data persists |
| HK-T | `[T]` Tools catalog + call | Search term or slug | Tool list or execution result | `GET /v1/tools/list`, `POST /v1/{slug}` | Returns tool entries or real execution output |
| HK-N | `[N]` New research swarm | Task description | Swarm deployed | `POST /v1/army/deploy` | Swarm ID returned; status = RUNNING |
| HK-R | `[R]` Run pipe/task | Pipe string | Chained output | `POST /v1/pipe` | All pipe stages execute; final output returned |
| HK-S | `[S]` Full-screen Swarm Viz | `{}` | Live agent tree + merkle depth | `GET /v1/visualizer/stream` (SSE) | SSE connection established; agent count > 0 |
| HK-B | `[B]` Balance | `{}` | Credits + tier + memory count | `GET /v1/credits/balance` | All fields present and numeric |
| HK-L | `[L]` List all endpoints | `{}` | Full endpoint catalog | `GET /v1/tools/list` | Total count matches documented endpoints |
| HK-Q | `[Q]` Quit | `{}` | Session saved to memory | `POST /v1/memory-set` | Graceful shutdown; session key persisted |

---

## SESSION 3 (v2.0-EXTREME -- 10k Army + Exchange + Chain)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S3-T01 | `slop army deploy --count=10000 --task="Full stress test every category + build knowledge graph" --mode=monte-carlo --router=smart --merkle=deep` | `{ "count": 10000, "task": "Full stress test...", "mode": "monte-carlo", "router": "smart", "merkle": "deep" }` | `{ "swarm_id": "<string>", "agents_spawned": 10000, "status": "SCALING", "routing": "<model chain>", "merkle_root_building": "0x...", "_engine": "real" }` | `POST /v1/army/deploy` | 10000 agents spawned; status starts as SCALING then transitions to RUNNING; merkle_root is non-empty; `_engine` = `"real"`; `X-Credits-Used` header present |
| S3-T02 | `slop exchange register --gpu=4-cores --idle-only --auto-earn --marketplace=public` | `{ "gpu": "4-cores", "idle_only": true, "auto_earn": true, "marketplace": "public" }` | `{ "your_contribution": "4 cores shared", "earning": <number>, "new_balance": <number>, "_engine": "real" }` | `POST /v1/exchange/register` | Registration succeeds; earning rate > 0; balance increases |
| S3-T03 | `slop exchange list --sort=credits_per_hour` | `{ "sort": "credits_per_hour" }` | `{ "available_offers": <number> }` | `GET /v1/exchange/list` | Returns array of offers sorted by credits_per_hour descending |
| S3-T04 | `slop chain start --loop=true --models="claude-3.7,grok-4.20,deepseek-r1" --task="Continuous agent infra research" --router=optimize-cost-latency --pause-on=error` | `{ "loop": true, "models": ["claude", "grok", "deepseek"], "task": "Continuous agent infra research", "pause_on": "error" }` | `{ "loops_completed": <number>, "avg_latency": <number>, "total_triples_added": <number>, "_engine": "real" }` | `POST /v1/chain/start` | loops_completed > 0; context passed between models; pauses on error; all outputs pushed to memory |
| S3-T05 | `slop memory graph-build --namespace=swarm-ext47 --ttl=30d --vector=enabled` | `{ "namespace": "swarm-ext47", "ttl": "30d", "vector": true }` | `{ "triples_created": <number>, "vector_search_ready": true }` | `POST /v1/memory/graph-build` | triples_created > 0; vector_search_ready = true; namespace isolated |
| S3-T06 | `slop memory queue-enqueue --key="research-tasks" --value=1000 --counter-increment` | `{ "key": "research-tasks", "value": 1000, "counter_increment": true }` | `{ "queues": <number>, "counters": { ... } }` | `POST /v1/memory-queue-enqueue`, `POST /v1/memory-counter-increment` | Queue length increases; counter increments atomically |
| S3-T07 | Hive governance vote: "Allocate 50k earned GPU credits to top swarm" | `{ "channel": "#governance", "motion": "Allocate 50k earned GPU credits to top swarm" }` | `{ "vote_tally": { "yes": <number>, "no": <number> }, "result": "PASSED" }` | `POST /v1/hive/governance/propose`, `POST /v1/hive/governance/vote` | Vote tallied; result = PASSED or FAILED; credits transferred if passed |
| S3-T08 | `slop eval run --swarm=EXT-47 --categories=all --duration=30s --leaderboard=global` | `{ "swarm": "EXT-47", "categories": "all", "duration": "30s" }` | `{ "p95_global": "<number>ms", "categories_tested": 78, "reputation_scores": { ... } }` | `POST /v1/eval/run` | All 78 categories tested; p95 < 50ms; reputation scores between 0 and 1 |
| S3-T09 | `slop replay save --swarm=EXT-47 --name="extreme-stress-20260329"` | `{ "swarm": "EXT-47", "name": "extreme-stress-20260329" }` | `{ "replay_id": "<string>", "events_archived": <number>, "merkle_proof_attached": true }` | `POST /v1/replay/save` | replay_id returned; events_archived > 0; merkle_proof_attached = true |
| S3-T10 | `slop replay export --format=ipfs` | `{ "replay_id": "<string>", "format": "ipfs" }` | `{ "ipfs_cid": "Qm...", "X-Request-Id": "<string>" }` | `POST /v1/replay/export` | IPFS CID is valid (starts with Qm); request ID in headers |
| S3-T11 | `slop selfhost bootstrap --port=3001 --mirror=all` | `{ "port": 3001, "mirror": "all" }` | `{ "local_server": "http://localhost:3001", "sync_complete": true }` | Local bootstrap | Server responds on localhost:3001; all endpoints mirrored |
| S3-T12 | `slop sync bidirectional --include=knowledge-graph` | `{ "include": "knowledge-graph" }` | `{ "sync_complete": true, "keys_synced": <number> }` | `POST /v1/sync/bidirectional` | Memory keys synced bidirectionally; knowledge graph included |
| S3-T13 | `slop observability trace --swarm=EXT-47 --live` | `{ "swarm": "EXT-47", "live": true }` | Live trace stream with X-headers | `GET /v1/observability/trace` (SSE) | SSE stream established; X-Credits-Used, X-Latency-Ms, X-Request-Id in each event |
| S3-T14 | `slop openapi export --include=mcp` | `{ "include": "mcp" }` | `{ "openapi_spec": "<json>", "mcp_manifest": "<json>" }` | `GET /v1/openapi.json` | Valid OpenAPI 3.x spec; MCP manifest present; all documented endpoints included |
| S3-T15 | `slop schedule create --webhook="https://my-agent.com" --cron="*/5 * * * *"` | `{ "webhook": "https://my-agent.com", "cron": "*/5 * * * *" }` | `{ "schedule_id": "<string>", "next_run": "<timestamp>" }` | `POST /v1/schedules/create` | schedule_id returned; next_run is valid future timestamp; cron expression parsed correctly |

---

## SESSION 4 (v3.0-EXTREME -- Tournament + Wallets + MCP)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S4-T01 | `slop tournament start --mode=arena --evolve=true --reputation=slashing-enabled --count=5000` | `{ "mode": "arena", "evolve": true, "reputation_slashing": true, "count": 5000 }` | `{ "tournament_id": "<string>", "agents_competing": 5000, "self_evolution_rounds": <number>, "top_agent_reputation": <float>, "slashing_events": <number>, "merkle_proof": "0x..." }` | `POST /v1/tournament/start` | tournament_id returned; agents_competing = 5000; reputation scores between 0 and 1; slashing_events >= 0; merkle_proof non-empty |
| S4-T02 | `slop wallet create --agent=117 --initial=1000` | `{ "agent": "117", "initial": 1000 }` | `{ "wallet_address": "<string>", "balance": 1000 }` | `POST /v1/wallet/create` | Wallet created; balance = 1000 |
| S4-T03 | `slop market bid --prediction="next swarm will beat 40ms p95" --stake=250` | `{ "prediction": "next swarm will beat 40ms p95", "stake": 250 }` | `{ "prediction_market": "open", "bids": <number> }` | `POST /v1/market/bid` | Market opens; stake deducted from wallet |
| S4-T04 | `slop mcp bootstrap --ide=claude-desktop --templates=all` | `{ "ide": "claude-desktop", "templates": "all" }` | `{ "mcp_server": "localhost:3002", "tools_exposed": <number> }` | `POST /v1/mcp/bootstrap` | MCP server starts; tools_exposed matches endpoint count |
| S4-T05 | `slop marketplace invoke --slug=content-machine --params=stripe-audit` | `{ "slug": "content-machine", "params": "stripe-audit" }` | `{ "template_invoked": "content-machine", "output_stored": "<memory_key>" }` | `POST /v1/marketplace/invoke` | Template executes; output stored in memory |
| S4-T06 | `slop memory pin --key=swarm-ext47 --ipfs=true --ttl=forever` | `{ "key": "swarm-ext47", "ipfs": true, "ttl": "forever" }` | `{ "cid": "Qm...", "replication": "global" }` | `POST /v1/memory/pin` | Valid IPFS CID returned; memory key persists |
| S4-T07 | `slop chaos test --army=10000 --faults=network+latency+agent-drop` | `{ "army": 10000, "faults": ["network", "latency", "agent-drop"] }` | `{ "test_id": "<string>", "survival_rate": "<percent>", "recovered_agents": <number>, "merkle_recovery": "full" }` | `POST /v1/chaos/test` | survival_rate > 95%; recovered_agents > 0; merkle_recovery = "full" |
| S4-T08 | `slop schedule create --template=research-swarm --cron="*/15 * * * *" --webhook=your-agent.com` | `{ "template": "research-swarm", "cron": "*/15 * * * *", "webhook": "your-agent.com" }` | `{ "schedule_id": "<string>", "next_run": "<timestamp>" }` | `POST /v1/schedules/create` | Schedule created; webhook registered |

---

## SESSION 5 (v4.0-ULTIMATE -- GraphRAG + Forge + Arbitrage)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S5-T01 | `slop memory graphrag --query="agent orchestration 2026 roadmap" --depth=21 --vector-boost` | `{ "query": "agent orchestration 2026 roadmap", "depth": 21, "vector_boost": true }` | `{ "triples_exploded": <number>, "entities_linked": <number>, "semantic_graph_score": <float> }` | `POST /v1/memory/graphrag` | triples > 0; entities > 0; score between 0 and 1 |
| S5-T02 | `slop forge build --type=tee-secure --name="custom-arbitrage-plugin" --publish=marketplace` | `{ "type": "tee-secure", "name": "custom-arbitrage-plugin", "publish": "marketplace" }` | `{ "plugin_id": "<string>", "mcp_manifest_generated": true, "marketplace_listing": "live" }` | `POST /v1/forge/build` | plugin_id returned; manifest generated; listing active |
| S5-T03 | `slop arbitrage optimize --target=gpu-credit --strategy=monte-carlo --lock=500` | `{ "target": "gpu-credit", "strategy": "monte-carlo", "lock": 500 }` | `{ "profit_locked": <number>, "opportunities_scanned": <number> }` | `POST /v1/arbitrage/optimize` | profit >= 0; opportunities > 0 |
| S5-T04 | `slop airgap load --plugin=forge-tee --mode=strict-tee` | `{ "plugin": "forge-tee", "mode": "strict-tee" }` | `{ "plugin_loaded": "local-only", "merkle_proof_local": "verified", "cloud_sync_disabled": true }` | `POST /v1/airgap/load` | Plugin loads; cloud sync disabled; local merkle verified |
| S5-T05 | `slop stake treasury --amount=500 --duration=30d --auto-compound` | `{ "amount": 500, "duration": "30d", "auto_compound": true }` | `{ "staked": 500, "projected_reward": <number>, "auto_compound": true }` | `POST /v1/stake/treasury` | Amount staked; projected reward > 0 |
| S5-T06 | `slop federated learn --swarms=EXT-47+ARENA --model=agent-router` | `{ "swarms": ["EXT-47", "ARENA"], "model": "agent-router" }` | `{ "model_updated": "<version>", "agents_contributed": <number>, "federated_accuracy": <float> }` | `POST /v1/federated/learn` | Model updated; accuracy delta > 0 |
| S5-T07 | `slop vector rebuild --ttl=90d --namespace=graphrag --index=hnsw` | `{ "ttl": "90d", "namespace": "graphrag", "index": "hnsw" }` | `{ "index_size": <number>, "semantic_ttl": "90 days", "query_speed": "<number>ms" }` | `POST /v1/vector/rebuild` | Index built; query_speed < 50ms |
| S5-T08 | `slop mcp forge --hybrid=true --plugins=tee+arbitrage` | `{ "hybrid": true, "plugins": ["tee", "arbitrage"] }` | `{ "hybrid_server": "localhost:3003", "claude_desktop_ready": true }` | `POST /v1/mcp/forge` | Server starts; Claude Desktop integration ready |

---

## SESSION 6 (v5.0-ULTIMATE -- Visualizer + Reputation + Marketplace)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S6-T01 | `slop visualizer control --mode=deep --realtime=true --self-replicate=enabled` | `{ "mode": "deep", "realtime": true, "self_replicate": true }` | `{ "agents_live": <number>, "merkle_depth": <number>, "status": "HUMMING" }` | `GET /v1/visualizer/stream` (SSE) | SSE stream with agent count; merkle depth > 0 |
| S6-T02 | `slop reputation slash --agent=underperformer-042 --reason="low eval score"` | `{ "agent": "underperformer-042", "reason": "low eval score" }` | `{ "ledger_update": "slashed <number> rep points", "global_leaderboard": "<top score>" }` | `POST /v1/reputation/slash` | Agent reputation decreased; leaderboard updated |
| S6-T03 | `slop marketplace bounty --template=research-swarm --reward=500-credits` | `{ "template": "research-swarm", "reward": 500 }` | `{ "bounty_id": "<string>", "forks_created": <number> }` | `POST /v1/marketplace/bounty` | bounty_id returned; reward locked |
| S6-T04 | `slop queue schedule --cron="*/5 * * * *" --webhook=your-agent.com --priority=high` | `{ "cron": "*/5 * * * *", "webhook": "your-agent.com", "priority": "high" }` | `{ "queue_size": <number>, "next_cron": "<timestamp>", "distributed_locks": "acquired" }` | `POST /v1/queue/schedule` | Queue created; cron scheduled; locks acquired |
| S6-T05 | `slop sandbox execute --code="vm.createContext" --breaker=enabled` | `{ "code": "vm.createContext", "circuit_breaker": true }` | `{ "execution": "safe", "circuit_breaker": "active" }` | `POST /v1/sandbox/execute` | Code executes safely; circuit breaker active |
| S6-T06 | `slop federation enable --mode=cross-device --goal="research-swarm-complete"` | `{ "mode": "cross-device", "goal": "research-swarm-complete" }` | `{ "devices_federated": <number>, "goal_progress": <percent> }` | `POST /v1/federation/enable` | Devices > 0; goal tracking active |
| S6-T07 | `slop copilot stream --export=full --observability=true` | `{ "export": "full", "observability": true }` | `{ "copilot_active": true, "stream_export": "JSON + replay link" }` | `POST /v1/copilot/stream` | Copilot active; X-headers streaming |
| S6-T08 | `slop sdk generate --openapi=true --language=typescript,python,go` | `{ "openapi": true, "languages": ["typescript", "python", "go"] }` | `{ "sdk_packages": "generated", "openapi_spec": "<path>" }` | `POST /v1/sdk/generate` | SDK packages for all 3 languages; valid OpenAPI spec |

---

## SESSION 7 (v6.0-TURING -- REPL + Debugger + Macros)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S7-T01 | `slop script run --lang=slopscript --code="spawn 5000; while consensus < 0.99 { merge hive; modify self hotkey }; export merkle"` | `{ "lang": "slopscript", "code": "spawn 5000; while consensus < 0.99 { merge hive; modify self hotkey }; export merkle" }` | `{ "script_id": "<string>", "agents_spawned": 5000, "consensus_reached": <float>, "merkle_exported": "Qm..." }` | `POST /v1/sandbox/execute`, `POST /v1/army/deploy`, `POST /v1/hive/merge` | Script executes; 5000 agents spawned; consensus > 0.99; merkle exported |
| S7-T02 | `slop debug breakpoint --swarm=EXT-47 --condition="reputation < 0.9" --time-travel=back-47s` | `{ "swarm": "EXT-47", "condition": "reputation < 0.9", "time_travel": "back-47s" }` | `{ "breakpoints_hit": <number>, "time_travel_restored": "state at t-47s" }` | `POST /v1/debug/breakpoint` | Breakpoints triggered; state restored to prior time |
| S7-T03 | Fuzzy palette: search "sense-url-tech-stack stripe" | `{ "search": "sense-url-tech-stack stripe" }` | Instant match + execution; result stored in memory | `GET /v1/tools/search`, `POST /v1/sense-url-tech-stack` | Fuzzy match found; tool executed; result in memory |
| S7-T04 | `slop macro record "deploy-army-10k + queue-prompt + eval"` | `{ "macro": "deploy-army-10k + queue-prompt + eval" }` | `{ "macro_saved": true, "hotkey": "Ctrl+Shift+A" }` | `POST /v1/macro/record` | Macro saved; assigned hotkey; executable on trigger |
| S7-T05 | Theme switch to "matrix" | `{ "theme": "matrix" }` | Theme applied; TUI re-renders | Local TUI action | Visual theme changes; no errors |
| S7-T06 | `slop plugin load --name="live-flamegraph" --hot-reload=true` | `{ "name": "live-flamegraph", "hot_reload": true }` | `{ "plugin_loaded": true }` | `POST /v1/plugin/load` | Plugin loads without restart; flamegraph renders |
| S7-T07 | Multi-pane split to 4 panes | `{ "panes": 4 }` | 4 panes active: REPL, Debugger, Palette, Flamegraph | Local TUI action | 4 independent panes render; each receives input |
| S7-T08 | `slop rollback last-script` | `{ "target": "last-script" }` | `{ "state_restored": true, "replay_link": "<url>" }` | `POST /v1/rollback` | State rolled back; replay link valid |
| S7-T09 | Voice/MCP: "start research swarm stripe" | `{ "voice_input": "start research swarm stripe" }` | Parsed to army deploy + queued | `POST /v1/army/deploy`, `POST /v1/queue/enqueue` | Natural language parsed; swarm started |
| S7-T10 | `slop swarm git commit --message="turing complete run"` | `{ "message": "turing complete run" }` | `{ "exported": ["mermaid", "dot", "csv", "ipfs", "parquet"] }` | `POST /v1/swarm/version` | All 5 export formats generated; swarm versioned |

---

## SESSION 8 (v7.0-APEX -- Meta-TUI + Neural + Vim + Quantum)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S8-T01 | `slop meta spawn --depth=3 --self-referential=true` | `{ "depth": 3, "self_referential": true }` | `{ "meta_depth": 4, "child_tuis_spawned": 3, "self_referential_proof": "Merkle-verified", "agents_synced": <number> }` | `POST /v1/army/deploy`, `GET /v1/visualizer/stream` | Child instances spawn; agents synced across instances |
| S8-T02 | `slop neural predict --target="next p95 latency" --model=swarm-graph` | `{ "target": "next p95 latency", "model": "swarm-graph" }` | `{ "predicted_p95": <number>, "confidence": <float> }` | `POST /v1/neural/predict` | Prediction returned; confidence between 0 and 1 |
| S8-T03 | Vim mode: edit + execute `":spawn 10k army + memory-set 'stripe_analysis_v7' + chain/start"` | `{ "vim_buffer": "spawn 10k army + memory-set..." }` | Buffer saved; commands executed | `POST /v1/army/deploy`, `POST /v1/memory-set`, `POST /v1/chain/start` | All three operations execute from vim buffer |
| S8-T04 | `slop quantum chaos --agents=10000 --faults=network+drop+latency` | `{ "agents": 10000, "faults": ["network", "drop", "latency"] }` | `{ "chaos_survival": "<percent>", "quantum_entropy_source": "crypto-random-bytes", "recovered_merkle": "full" }` | `POST /v1/chaos/test` | Survival > 95%; merkle recovered |
| S8-T05 | Accessibility suite: screen reader + Braille | `{ "mode": "braille+reader" }` | `{ "accessibility_enabled": true }` | Local TUI action | Voice readout active; Braille output generated |
| S8-T06 | `slop plugin market trade --slug="custom-neural-viz" --bounty=500-credits` | `{ "slug": "custom-neural-viz", "bounty": 500 }` | Plugin traded; installed across meta-instances | `POST /v1/marketplace/trade` | Trade completes; plugin installed |
| S8-T07 | `slop undo travel --time=back-2m --restore=swarm-state` | `{ "time": "back-2m", "restore": "swarm-state" }` | `{ "state_restored": true }` | `POST /v1/replay/restore` | State matches snapshot from 2m ago |
| S8-T08 | Self-healing trigger | `{}` | Crashed panes recovered; memory re-synced; neural viz restarted | Local + `POST /v1/memory-sync` | All components recovered automatically |
| S8-T09 | `slop distributed sync --mode=multi-machine` | `{ "mode": "multi-machine" }` | `{ "machines_federated": 3, "hive_shared": true, "visualizer_shared": true }` | `POST /v1/distributed/sync` | 3+ machines synced; shared state consistent |
| S8-T10 | Full dependency graph + profiler | `{}` | `{ "graph": "memory-set -> army/deploy -> chain/start -> hive/standup", "hotspots": [{"slug": "crypto-hash-sha256", "p95": 9}] }` | `GET /v1/observability/graph` | Graph contains all core endpoints; hotspots identified |

---

## SESSION 9 (v9.0 DEFINITIVE -- Systematic 100% Verification)

### Memory (20 APIs)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S9-MEM01 | `slop memory-set --key="stripe_analysis" --value="full tech stack"` | `{ "key": "stripe_analysis", "value": "full tech stack" }` | `{ "status": "ok" }` | `POST /v1/memory-set` | Key persists; retrievable |
| S9-MEM02 | `slop memory-get --key="stripe_analysis"` | `{ "key": "stripe_analysis" }` | `{ "value": "full tech stack" }` | `POST /v1/memory-get` | Returns exact value set |
| S9-MEM03 | `slop memory-search --query="agent backend"` | `{ "query": "agent backend" }` | Array of matches with scores | `POST /v1/memory-search` | Returns matches; scores > 0 |
| S9-MEM04 | `slop memory-queue-enqueue --key="tasks" --value=500` | `{ "key": "tasks", "value": 500 }` | `{ "queue_length": <number> }` | `POST /v1/memory-queue-enqueue` | Queue length increases by 1 |
| S9-MEM05 | `slop memory-counter-increment --key="agents_online"` | `{ "key": "agents_online" }` | `{ "value": <number> }` | `POST /v1/memory-counter-increment` | Counter increments atomically |
| S9-MEM06 | `slop memory-delete --key="temp"` | `{ "key": "temp" }` | `{ "status": "deleted" }` | `POST /v1/memory-delete` | Key no longer exists |
| S9-MEM07 | `slop memory-set` with TTL | `{ "key": "ephemeral", "value": "test", "ttl": "1h" }` | Key auto-expires after TTL | `POST /v1/memory-set` | Key gone after TTL period |
| S9-MEM08 | `slop memory-set` with namespace | `{ "key": "ns_test", "value": "val", "namespace": "swarm-47" }` | Isolated to namespace | `POST /v1/memory-set` | Only visible within namespace |

### Army + Merkle (8 endpoints)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S9-ARM01 | `slop call army/deploy --count=10000 --task="stress all 78 categories"` | `{ "count": 10000, "task": "stress all 78 categories" }` | `{ "swarm_id": "<string>", "agents_spawned": 10000, "merkle_root": "0x...", "status": "RUNNING" }` | `POST /v1/army/deploy` | 10k agents; merkle root building; reaches COMPLETED |
| S9-ARM02 | `slop call army/status --id=EXT-47` | `{ "id": "EXT-47" }` | `{ "status": "<state>", "active_agents": <number>, "merkle_root": "0x..." }` | `GET /v1/army/status` | Returns current state; agent count; merkle root |
| S9-ARM03 | `slop call army/attach-compute --id=EXT-47 --resource=gpu --cores=8` | `{ "id": "EXT-47", "resource": "gpu", "cores": 8 }` | `{ "attached": true, "cores": 8 }` | `POST /v1/army/attach-compute` | GPU cores attached to running army |
| S9-ARM04 | `slop call army/replay --id=EXT-47 --export=ipfs` | `{ "id": "EXT-47", "export": "ipfs" }` | `{ "replay_log": [...], "ipfs_cid": "Qm..." }` | `POST /v1/army/replay` | Full replay log; valid IPFS CID |
| S9-ARM05 | `slop call army/heal --armyId=EXT-47 --agentId=agent-042` | `{ "armyId": "EXT-47", "agentId": "agent-042" }` | `{ "healed": true, "credits_refunded": <number> }` | `POST /v1/army/heal` | Agent re-spawned; credits refunded |
| S9-ARM06 | `slop call proof/merkle --armyId=EXT-47 --agentId=agent-042` | `{ "armyId": "EXT-47", "agentId": "agent-042" }` | `{ "proof": ["<hex>", ...], "root": "0x..." }` | `POST /v1/proof/merkle` | Proof array has ceil(log2(n)) entries; root matches army root |

### Hive (10 endpoints)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S9-HIV01 | `slop hive create --name="research"` | `{ "name": "research" }` | `{ "channel": "#research", "status": "created" }` | `POST /v1/hive/create` | Channel created; accessible |
| S9-HIV02 | `slop hive standup --channel="#research" --message="all tests complete"` | `{ "channel": "#research", "message": "all tests complete" }` | `{ "status": "posted" }` | `POST /v1/hive/standup` | Message persists in channel |
| S9-HIV03 | Hive governance propose | `{ "channel": "#governance", "motion": "allocate credits" }` | `{ "proposal_id": "<string>" }` | `POST /v1/hive/governance/propose` | Proposal created |
| S9-HIV04 | Hive governance vote | `{ "proposal_id": "<string>", "vote": "yes" }` | `{ "recorded": true }` | `POST /v1/hive/governance/vote` | Vote recorded; tally updated |

### Chain + Infinite Loops (5 endpoints)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S9-CHN01 | `slop chain start --loop=true --models="claude,grok,gpt" --task="cross-LLM research"` | `{ "loop": true, "steps": ["claude:research", "grok:critique", "gpt:improve"], "task": "cross-LLM research" }` | `{ "loops_completed": <number>, "context_passed": true, "_engine": "real" }` | `POST /v1/chain/start` | Multiple loops; context propagates between models; all models called |
| S9-CHN02 | Chain with pause-on-error | `{ "loop": true, "models": ["claude", "grok"], "pause_on": "error" }` | Chain pauses on error; resumable | `POST /v1/chain/start` | Pauses on LLM error; can resume |

### Tools -- 78 Categories / 352+ Endpoints (Systematic)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S9-TXT01 | `slop call text-word-count --input "slop tui is the best"` | `{ "input": "slop tui is the best" }` | `{ "count": 5, "_engine": "real", "X-Latency-Ms": "<50" }` | `POST /v1/text-word-count` | count = 5; engine = real |
| S9-TXT02 | `slop call text-char-count --input "hello"` | `{ "input": "hello" }` | `{ "count": 5, "_engine": "real" }` | `POST /v1/text-char-count` | count = 5 |
| S9-TXT03 | `slop call text-extract-emails --input "test@example.com is here"` | `{ "input": "test@example.com is here" }` | `{ "emails": ["test@example.com"], "_engine": "real" }` | `POST /v1/text-extract-emails` | Extracts valid emails |
| S9-TXT04 | `slop call text-regex-replace --input "hello world" --pattern "world" --replacement "slop"` | `{ "input": "hello world", "pattern": "world", "replacement": "slop" }` | `{ "result": "hello slop", "_engine": "real" }` | `POST /v1/text-regex-replace` | Replacement correct |
| S9-TXT05 | `slop call text-slugify --input "Hello World Test"` | `{ "input": "Hello World Test" }` | `{ "slug": "hello-world-test", "_engine": "real" }` | `POST /v1/text-slugify` | Valid slug format |
| S9-TXT06 | `slop call text-markdown-to-html --input "# Hello"` | `{ "input": "# Hello" }` | `{ "html": "<h1>Hello</h1>", "_engine": "real" }` | `POST /v1/text-markdown-to-html` | Valid HTML output |
| S9-TXT07 | `slop call text-diff` | `{ "a": "hello", "b": "hallo" }` | `{ "diff": "<diff output>", "_engine": "real" }` | `POST /v1/text-diff` | Diff shows changes |
| S9-TXT08 | `slop call text-language-detect --input "Bonjour le monde"` | `{ "input": "Bonjour le monde" }` | `{ "language": "fr", "_engine": "real" }` | `POST /v1/text-language-detect` | Detects French |
| S9-DAT01 | `slop call text-json-to-csv --input '{"name":"slop"}'` | `{ "input": {"name": "slop"} }` | `{ "csv": "name\nslop", "_engine": "real" }` | `POST /v1/text-json-to-csv` | Valid CSV output |
| S9-DAT02 | `slop call text-base64-encode --input "slop tui"` | `{ "input": "slop tui" }` | `{ "encoded": "c2xvcCB0dWk=", "_engine": "real" }` | `POST /v1/text-base64-encode` | Valid base64 |
| S9-DAT03 | `slop call text-yaml-to-json --input "name: slop"` | `{ "input": "name: slop" }` | `{ "json": {"name": "slop"}, "_engine": "real" }` | `POST /v1/text-yaml-to-json` | Valid JSON output |
| S9-CRY01 | `slop call crypto-hash-sha256 --input "slopshop.gg"` | `{ "input": "slopshop.gg" }` | `{ "hash": "<64-char hex>", "_engine": "real" }` | `POST /v1/crypto-hash-sha256` | Valid SHA-256 hash |
| S9-CRY02 | `slop call crypto-hash-sha512 --input "test"` | `{ "input": "test" }` | `{ "hash": "<128-char hex>", "_engine": "real" }` | `POST /v1/crypto-hash-sha512` | Valid SHA-512 hash |
| S9-CRY03 | `slop call crypto-hmac --input "message" --secret "key"` | `{ "input": "message", "secret": "key" }` | `{ "hmac": "<hex>", "_engine": "real" }` | `POST /v1/crypto-hmac` | Valid HMAC |
| S9-CRY04 | `slop call crypto-nanoid` | `{}` | `{ "id": "<21-char string>", "_engine": "real" }` | `POST /v1/crypto-nanoid` | 21-char nanoid |
| S9-CRY05 | `slop call crypto-password-hash --password "test123"` | `{ "password": "test123" }` | `{ "hash": "<bcrypt/argon2 string>", "_engine": "real" }` | `POST /v1/crypto-password-hash` | Valid password hash |
| S9-CRY06 | `slop call crypto-jwt-sign --payload '{"user":"agent"}' --secret "key"` | `{ "payload": {"user": "agent"}, "secret": "key" }` | `{ "token": "<jwt string>", "_engine": "real" }` | `POST /v1/crypto-jwt-sign` | Valid JWT with 3 dot-separated segments |
| S9-CRY07 | `slop call crypto-uuid` | `{}` | `{ "uuid": "<uuid v4>", "_engine": "real" }` | `POST /v1/crypto-uuid` | Valid UUID v4 format |
| S9-MTH01 | `slop call math-evaluate --expression "2+2*3"` | `{ "expression": "2+2*3" }` | `{ "result": 8, "_engine": "real" }` | `POST /v1/math-evaluate` | result = 8 |
| S9-MTH02 | `slop call math-statistics --data [1,2,3,4,5]` | `{ "data": [1,2,3,4,5] }` | `{ "mean": 3, "median": 3, "stddev": <number>, "_engine": "real" }` | `POST /v1/math-statistics` | Correct statistics |
| S9-MTH03 | `slop call math-currency-convert --amount 100 --from USD --to EUR` | `{ "amount": 100, "from": "USD", "to": "EUR" }` | `{ "converted": <number>, "rate": <number>, "_engine": "real" }` | `POST /v1/math-currency-convert` | Converted amount > 0; rate > 0 |
| S9-MTH04 | `slop call math-matrix-multiply` | `{ "a": [[1,2],[3,4]], "b": [[5,6],[7,8]] }` | `{ "result": [[19,22],[43,50]], "_engine": "real" }` | `POST /v1/math-matrix-multiply` | Correct matrix product |
| S9-DTE01 | `slop call date-parse --input "tomorrow"` | `{ "input": "tomorrow" }` | `{ "date": "<ISO 8601>", "_engine": "real" }` | `POST /v1/date-parse` | Valid ISO date; one day ahead |
| S9-DTE02 | `slop call date-diff --from "2026-01-01" --to "2026-03-29"` | `{ "from": "2026-01-01", "to": "2026-03-29" }` | `{ "days": 87, "_engine": "real" }` | `POST /v1/date-diff` | days = 87 |
| S9-DTE03 | `slop call date-cron-next --expression "0 9 * * 1"` | `{ "expression": "0 9 * * 1" }` | `{ "next": "<ISO 8601 Monday 9am>", "_engine": "real" }` | `POST /v1/date-cron-next` | Next occurrence is a Monday at 09:00 |
| S9-DTE04 | `slop call date-holidays --country US --year 2026` | `{ "country": "US", "year": 2026 }` | `{ "holidays": [...], "_engine": "real" }` | `POST /v1/date-holidays` | Returns array of US holidays |
| S9-COD01 | `slop call code-json-to-typescript --json '{"name":"slop"}'` | `{ "json": {"name": "slop"} }` | `{ "typescript": "interface Root { name: string; }", "_engine": "real" }` | `POST /v1/code-json-to-typescript` | Valid TypeScript interface |
| S9-COD02 | `slop call code-json-to-python-class --json '{"name":"slop"}'` | `{ "json": {"name": "slop"} }` | `{ "python": "class Root:...", "_engine": "real" }` | `POST /v1/code-json-to-python-class` | Valid Python class |
| S9-COD03 | `slop call code-sql-format --sql "select * from users where id=1"` | `{ "sql": "select * from users where id=1" }` | `{ "formatted": "SELECT *\nFROM users\nWHERE id = 1", "_engine": "real" }` | `POST /v1/code-sql-format` | Properly formatted SQL |
| S9-COD04 | `slop call code-dockerfile-lint --dockerfile "FROM node"` | `{ "dockerfile": "FROM node" }` | `{ "issues": [...], "_engine": "real" }` | `POST /v1/code-dockerfile-lint` | Returns lint results |
| S9-COD05 | `slop call code-openapi-validate --spec "{...}"` | `{ "spec": "<openapi json>" }` | `{ "valid": <boolean>, "errors": [...], "_engine": "real" }` | `POST /v1/code-openapi-validate` | Returns validity status |
| S9-GEN01 | `slop call gen-fake-name` | `{}` | `{ "name": "<string>", "_engine": "real" }` | `POST /v1/gen-fake-name` | Non-empty name string |
| S9-GEN02 | `slop call gen-qr-svg --data "slop tui"` | `{ "data": "slop tui" }` | `{ "svg": "<svg>...</svg>", "_engine": "real" }` | `POST /v1/gen-qr-svg` | Valid SVG content |
| S9-GEN03 | `slop call gen-avatar-svg` | `{}` | `{ "svg": "<svg>...</svg>", "_engine": "real" }` | `POST /v1/gen-avatar-svg` | Valid SVG content |
| S9-NET01 | `slop call net-dns-a --domain slopshop.gg` | `{ "domain": "slopshop.gg" }` | `{ "records": ["<IP>", ...], "_engine": "real" }` | `POST /v1/net-dns-a` | Returns valid IP addresses |
| S9-NET02 | `slop call net-dns-mx --domain slopshop.gg` | `{ "domain": "slopshop.gg" }` | `{ "records": [...], "_engine": "real" }` | `POST /v1/net-dns-mx` | Returns MX records |
| S9-NET03 | `slop call net-dns-all --domain slopshop.gg` | `{ "domain": "slopshop.gg" }` | `{ "records": {...}, "_engine": "real" }` | `POST /v1/net-dns-all` | Returns all DNS record types |
| S9-NET04 | `slop call net-http-status --url https://slopshop.gg` | `{ "url": "https://slopshop.gg" }` | `{ "status": 200, "_engine": "real" }` | `POST /v1/net-http-status` | status = 200 |
| S9-NET05 | `slop call net-ssl-check --domain slopshop.gg` | `{ "domain": "slopshop.gg" }` | `{ "valid": true, "expiry": "<date>", "_engine": "real" }` | `POST /v1/net-ssl-check` | valid = true; expiry in future |
| S9-NET06 | `slop call net-email-validate --email "test@example.com"` | `{ "email": "test@example.com" }` | `{ "valid": true, "_engine": "real" }` | `POST /v1/net-email-validate` | Validates email format |
| S9-AI01 | `slop call llm-blog-outline --topic "slop tui"` | `{ "topic": "slop tui" }` | `{ "outline": [...], "_engine": "llm" }` | `POST /v1/llm-blog-outline` | Non-empty outline array; _engine = "llm" |
| S9-AI02 | `slop call llm-summarize --text "<long text>"` | `{ "text": "<long text>" }` | `{ "summary": "<shorter text>", "_engine": "llm" }` | `POST /v1/llm-summarize` | Summary shorter than input |
| S9-AI03 | `slop call llm-product-description --product "slop tui"` | `{ "product": "slop tui" }` | `{ "description": "<text>", "_engine": "llm" }` | `POST /v1/llm-product-description` | Non-empty description |
| S9-AI04 | `slop call llm-code-generate --prompt "write react component"` | `{ "prompt": "write react component" }` | `{ "code": "<jsx>", "_engine": "llm" }` | `POST /v1/llm-code-generate` | Contains valid JSX/React code |
| S9-AI05 | `slop call sense-url-tech-stack --url stripe.com` | `{ "url": "stripe.com" }` | `{ "tech_stack": [...], "_engine": "real" }` | `POST /v1/sense-url-tech-stack` | Non-empty tech stack array |

### Replay + Eval + Tournament

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S9-RPL01 | `slop replay save --swarm=EXT-47` | `{ "swarm": "EXT-47" }` | `{ "replay_id": "<string>", "events_archived": <number> }` | `POST /v1/replay/save` | replay_id returned; events > 0 |
| S9-RPL02 | `slop replay list` | `{}` | `{ "replays": [...] }` | `GET /v1/replay/list` | Array of saved replays |
| S9-RPL03 | `slop replay load --id=<replay_id>` | `{ "id": "<replay_id>" }` | `{ "events": [...], "merkle_root": "0x..." }` | `POST /v1/replay/load` | Events restored; merkle matches |
| S9-EVL01 | `slop eval run --categories=all` | `{ "categories": "all" }` | `{ "categories_tested": 78, "p95": <number>, "leaderboard": [...] }` | `POST /v1/eval/run` | All 78 categories; p95 < 50ms |
| S9-TRN01 | `slop tournament create --mode=arena --count=100` | `{ "mode": "arena", "count": 100 }` | `{ "tournament_id": "<string>", "agents": 100 }` | `POST /v1/tournament/create` | Tournament created |
| S9-TRN02 | `slop tournament match --id=<tournament_id>` | `{ "id": "<tournament_id>" }` | `{ "winner": "<agent_id>", "score": <number> }` | `POST /v1/tournament/match` | Winner determined; score > 0 |

### Credits + Exchange + Transfer

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S9-CRD01 | `slop credits balance` | `{}` | `{ "credits": <number>, "tier": "<string>" }` | `GET /v1/credits/balance` | Credits >= 0; tier is valid |
| S9-CRD02 | `slop exchange register --gpu=idle` | `{ "gpu": "idle" }` | `{ "status": "registered", "earning_rate": <number> }` | `POST /v1/exchange/register` | Registered; earning > 0 |
| S9-CRD03 | `slop credits transfer --to="agent-117" --amount=500` | `{ "to": "agent-117", "amount": 500 }` | `{ "transferred": 500, "new_balance": <number> }` | `POST /v1/credits/transfer` | Amount transferred; balance decreased by 500 |

### Self-Host + MCP + OpenAPI + Scheduling

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S9-SH01 | `slop selfhost bootstrap` | `{}` | `{ "local_server": "http://localhost:3001", "endpoints_mirrored": <number> }` | Local bootstrap | Server running; all endpoints respond |
| S9-MCP01 | `slop mcp bootstrap` | `{}` | `{ "mcp_server": "localhost:3002", "tools_exposed": <number> }` | MCP bootstrap | Server running; tools callable from Claude |
| S9-OAP01 | `slop openapi export` | `{}` | Valid OpenAPI 3.x JSON spec | `GET /v1/openapi.json` | Parseable spec; all endpoints documented |
| S9-SCH01 | `slop schedule create --cron="*/5 * * * *"` | `{ "cron": "*/5 * * * *" }` | `{ "schedule_id": "<string>", "next_run": "<timestamp>" }` | `POST /v1/schedules/create` | Valid schedule; next_run in future |

### Swarm Visualizer + Observability

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S9-VIZ01 | `slop visualizer stream --sse=true` | `{}` | SSE event stream with agent data | `GET /v1/visualizer/stream` | SSE connection; events contain agent count, merkle root |
| S9-OBS01 | Response headers on any call | Any valid call | `X-Credits-Used`, `X-Latency-Ms`, `X-Request-Id` headers present | Any endpoint | All 3 headers present; values are valid |
| S9-OBS02 | `_engine` field on every response | Any valid call | `_engine` = `"real"` or `"llm"` | Any endpoint | Field present; value is one of the two valid options |

---

## SESSION 10 (v10.0 -- Multi-Model + Resource Devotion)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| S10-T01 | `!G 4` -- Devote 4 GPU cores | `{ "cores": 4, "idle_only": true }` | `{ "status": "registered", "earning_rate": <number> }` | `POST /v1/compute/devote-gpu` | GPU cores registered; earning starts |
| S10-T02 | `!R 2048` -- Allocate 2GB RAM | `{ "mb": 2048, "namespace": "tui-cache" }` | `{ "allocated": 2048 }` | `POST /v1/compute/allocate-ram` | RAM allocated; namespace created |
| S10-T03 | `!M grok` -- Switch active model | `{ "model": "grok" }` | `{ "status": "Model switched to grok" }` | Local model registry | Subsequent calls use Grok |
| S10-T04 | `!P https://api.example.com POST {"data":"test"}` -- Proxy any API | `{ "url": "https://api.example.com", "method": "POST", "body": {"data":"test"} }` | Proxied response from target API | `POST /v1/api/proxy` | Response returned from target; sandboxed execution |
| S10-T05 | `claude->grok->gpt` chain syntax | `{ "steps": ["claude:task", "grok:task", "gpt:task"], "loop": true }` | `{ "loops_completed": <number>, "context_passed": true }` | `POST /v1/chain/start` | All 3 models called in sequence; context preserved |
| S10-T06 | Model registry auto-detect local Ollama | `{}` | `{ "local_models": ["local:llama3", ...] }` | `GET http://localhost:11434/api/tags` | Ollama models discovered; callable via `!M local:llama3` |
| S10-T07 | Self-host fallback: `SELF_HOST=true` | `{}` | All calls route to `localhost:3001` | All endpoints via localhost | Every endpoint responds identically to cloud |

---

## CROSS-CUTTING / INTEGRATION TEST CASES

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| INT-01 | Full pipe chain: `sense-url-tech-stack stripe.com \| text-summarize \| memory-set --key=stripe_summary` | 3-stage pipe | Summary stored in memory | `POST /v1/sense-url-tech-stack`, `POST /v1/text-summarize`, `POST /v1/memory-set` | Each stage output feeds next; final persists |
| INT-02 | Army deploy -> Hive standup -> Memory persist | Deploy 10 agents; agents post standups; results in memory | Full workflow completes | `POST /v1/army/deploy`, `POST /v1/hive/standup`, `POST /v1/memory-set` | All 3 systems interact; data flows end-to-end |
| INT-03 | Chain loop with memory persistence | Claude->Grok infinite loop storing each iteration | Memory keys accumulate per loop | `POST /v1/chain/start`, `POST /v1/memory-set` | Keys increment per loop; all context preserved |
| INT-04 | Exchange register -> Submit work -> Poll -> Complete | Full exchange lifecycle | Credits earned | `POST /v1/exchange/register`, `POST /v1/exchange/submit`, `GET /v1/exchange/poll`, `POST /v1/exchange/complete` | Full lifecycle; credits increase |
| INT-05 | Governance propose -> Vote -> Execute | Full governance flow | Proposal passed and executed | `POST /v1/hive/governance/propose`, `POST /v1/hive/governance/vote`, `POST /v1/hive/governance/execute` | Votes tallied; action executed |
| INT-06 | Knowledge add -> Query -> Walk -> Path | Full knowledge graph flow | Triples queryable; paths walkable | `POST /v1/memory/knowledge/add`, `POST /v1/memory/knowledge/query`, `POST /v1/memory/knowledge/walk`, `POST /v1/memory/knowledge/path` | Triples stored; graph traversal works |
| INT-07 | Eval run with explicit test cases | Custom eval suite | Per-case pass/fail | `POST /v1/eval/run` | Each test case returns result; aggregate score |
| INT-08 | Tournament create -> Match -> Leaderboard | Full tournament lifecycle | Winner determined | `POST /v1/tournament/create`, `POST /v1/tournament/match`, `GET /v1/tournament/leaderboard` | Matches run; leaderboard updated |
| INT-09 | Replay save -> List -> Load -> Verify | Full replay lifecycle | Replay restored with merkle proof | `POST /v1/replay/save`, `GET /v1/replay/list`, `POST /v1/replay/load` | Saved replay appears in list; load restores state; merkle verified |
| INT-10 | Credit refund on error | Call endpoint that fails | Credits refunded | Any failing endpoint | Credits before = credits after; refund logged |
| INT-11 | Merkle proof end-to-end: deploy army -> get proof -> verify | Full crypto verification | Proof validates against root | `POST /v1/army/deploy`, `POST /v1/proof/merkle`, verify locally | SHA-256 proof chain validates; root matches |
| INT-12 | Self-host mirror parity | Same call to cloud and localhost | Identical response structure | Cloud + `localhost:3001` | Same fields, same `_engine`, same headers |
| INT-13 | MCP tool call from Claude Code CLI | `devote-gpu` via MCP bridge | GPU registered via MCP | MCP -> `POST /v1/compute/devote-gpu` | MCP tool resolves; backend action executes |
| INT-14 | 100-agent stress test with all 78 categories in parallel | Full stress deploy | All categories pass; p95 < 50ms | `POST /v1/army/deploy` + all 78 category endpoints | Zero failures; p95 under threshold; merkle root valid |

---

## CLI UX TESTS (Core CLI Commands)

| Test ID | Command | Input | Expected Output | Endpoint(s) Hit | Pass Criteria |
|---------|---------|-------|-----------------|-----------------|---------------|
| CLI-01 | `slop signup` | User registration | `{ "credits": 2000, "memory": "free_forever" }` | `POST /v1/auth/signup` | 2000 credits granted; memory tier = free forever |
| CLI-02 | `slop balance` | `{}` | Credit balance + tier | `GET /v1/credits/balance` | Valid balance and tier |
| CLI-03 | `slop list` | `{}` | All endpoints paginated | `GET /v1/tools/list` | Total matches documented count |
| CLI-04 | `slop call <slug> --input "..."` | Any slug + input | Real output | `POST /v1/{slug}` | _engine present; result valid |
| CLI-05 | `slop pipe "<stage1> \| <stage2>"` | Multi-stage pipe | Chained output | Multiple `POST /v1/{slug}` | Each stage feeds next |
| CLI-06 | `slop search <query>` | Search term | Matching endpoints | `GET /v1/tools/search` | Relevant results returned |
| CLI-07 | `slop tui` | Launch TUI | Dashboard renders with live data | Multiple polling endpoints | TUI renders; hotkeys respond; data refreshes |

---

## RESPONSE ENVELOPE VERIFICATION (applies to ALL calls)

| Test ID | Check | Pass Criteria |
|---------|-------|---------------|
| ENV-01 | `_engine` field | Present on every response; value is `"real"` or `"llm"` |
| ENV-02 | `X-Credits-Used` header | Present; integer >= 0 |
| ENV-03 | `X-Latency-Ms` header | Present; integer; value < 100 for real handlers |
| ENV-04 | `X-Request-Id` header | Present; unique per request |
| ENV-05 | `_merkle_root` field (on army/proof calls) | Present on army responses; valid hex string |
| ENV-06 | Credit refund on 5xx error | Credits returned to balance on server error |

---

## SUMMARY

- **Total test cases extracted**: 156
- **Sessions covered**: v1 through v10 (all Grok simulated sessions)
- **Unique endpoints hit**: 78 categories, 352+ individual slugs, plus orchestration/memory/army/hive/chain/exchange/replay/eval/tournament/governance/knowledge/scheduling/MCP/self-host/visualizer
- **Hotkeys tested**: A, H, M, T, N, R, S, B, L, Q (all 10)
- **Integration flows**: 14 cross-cutting E2E scenarios
- **CLI commands**: 7 core commands
- **Response envelope checks**: 6 universal validations
