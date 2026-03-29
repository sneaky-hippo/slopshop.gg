# STRAT 3 — SURGICAL IMPLEMENTATION CHECKLIST
# 578 items extracted from 3207-line Grok review by 4 parallel agents
# Triple-column audit: ADDRESSED | BACKEND REAL | SHIPPED
# Audited 2026-03-29 against live codebase + production API

---

## TOTALS

| Status | Count | % |
|--------|-------|---|
| ✅ Fully addressed + backend real | ~320 | 55% |
| 🔄 Code written, pending Railway deploy | ~80 | 14% |
| ⚠️ Partial (exists but incomplete) | ~45 | 8% |
| ❌ Not implemented (aspirational) | ~133 | 23% |

---

## CRITICAL DISCREPANCIES TO FIX

| # | Issue | Current | Expected | Priority |
|---|-------|---------|----------|----------|
| 1 | Army Merkle = flat hash | `sha256(hashes.join(''))` | SHA-256 binary tree | **HIGH** |
| 2 | Army cap = 100 | `Math.min(agents,100)` | 1000+ agents | **HIGH** |
| 3 | No proof verification endpoint | /v1/proof/merkle generates only | Accept proof + verify boolean | **HIGH** |
| 4 | Army-Hive disconnected | Separate systems | Auto-post standup on completion | **MEDIUM** |
| 5 | Army-Memory disconnected | Results in compute_runs only | Auto memory-set per agent | **MEDIUM** |
| 6 | No army SSE stream | No progress stream | Live agent progress via SSE | **MEDIUM** |

## WHAT'S FULLY REAL (320+ items)

Core compute (925 handlers), 4 LLM providers, full memory system, army deploy, hive workspaces with governance, chain system, exchange, wallets, markets, tournaments, bounties, knowledge graph, replay, eval, reputation, copilot, schedules, webhooks, MCP server, OpenAPI, SSE streaming, self-hosting, 50+ CLI commands, TUI dashboard with 14 hotkeys.

## WHAT'S PENDING DEPLOY (80 items)

All today's fixes: LLM inference on survey/poll/compliance/self-improve, Grok env var fix, knowledge POST, wallet _engine, random POST, TUI dashboard, 9 CLI bug fixes, 26 site pages fixed.

## ASPIRATIONAL FROM GROK (133 items — not building)

React/Ink TUI (v4-v8), fractal neuro-kernel, ZK consensus, neural prediction, quantum chaos, embedded Vim, Plugin Forge, GraphRAG, federated learning, staking treasury, credit arbitrage, IPFS, Redis Streams, worker threads, vm sandboxes, self-healing, chaos testing, distributed multi-TUI sync, macro recorder, flamegraphs, transactional rollback, voice input, swarm git versioning.
