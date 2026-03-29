# GUTS AUDIT — What's actually real vs what's a label
# Brutally honest. No _engine: 'real' bullshit.
# 2026-03-29

## SCORING: GUTS READINESS

| # | Feature | Guts Status | What it does NOW | What it SHOULD do | Priority |
|---|---------|------------|-----------------|-------------------|----------|
| 1 | Compute Exchange | 🟢 FIXED | Self-executes tasks using server handlers when task_type is a valid slug. Falls back to supplier matching. Real execution + verification hash + credit settlement. | DONE |
| 2 | Army >3 agents | 🟢 FIXED | >20 agents: responds immediately with run_id, executes in background, poll for results. <=20: synchronous. Merkle tree built in background. | DONE |
| 3 | Chain looping | 🟡 PARTIAL | Code written for compute steps but not deployed/tested. | Execute slug chains with real output piping, loop N times, branch on conditions. | HIGH |
| 4 | Staking/Treasury | 🟢 FIXED | Yield based on real platform activity: 5% of daily transaction volume shared among stakers proportional to stake. Capped at 1% daily. | DONE |
| 5 | Federated Learning | 🔴 FAKE | Stores JSON blobs in SQLite. No ML. | Real gradient averaging, model versioning, convergence tracking. Or remove. | MEDIUM |
| 6 | Exotic handlers (100+) | 🟡 PARTIAL | Many are Math.random() + templates returning _engine:'real'. | Each should do genuine computation based on input analysis. | MEDIUM |
| 7 | Forge/Plugin execution | 🟢 REAL | vm.createContext sandbox with 5s timeout. Actually runs user code. | Working. Could add persistence for plugin state. | LOW |
| 8 | GraphRAG | 🟢 REAL | Combines knowledge graph triples + memory search. | Working. | DONE |
| 9 | Sandbox execution | 🟢 REAL | vm.createContext with timeout, security restrictions. | Working. | DONE |
| 10 | 925 compute handlers | 🟢 REAL | Actual Node.js computation (crypto, math, text, date, etc.) | Working. Verified 100% across all categories. | DONE |
| 11 | Memory system | 🟢 REAL | SQLite persistence, free forever, full CRUD. | Working. Verified round-trip. | DONE |
| 12 | LLM inference | 🟢 REAL | 4 live providers (Claude, GPT, Grok, DeepSeek). | Working. Verified. | DONE |
| 13 | Merkle proofs | 🟢 REAL | SHA-256 binary tree with sibling proofs. | Working. | DONE |
| 14 | Hive workspaces | 🟢 REAL | SQLite channels, messages, standups, governance. | Working. | DONE |
| 15 | Wallets/Markets | 🟢 REAL | SQLite balance tracking, transfers, bets. | Working. Credit math is real. | DONE |
| 16 | Reputation | 🟡 PARTIAL | Rating exists. Slashing added. No decay over time. | Add time-decay + weight by stake. | LOW |
| 17 | Chaos testing | 🟡 PARTIAL | Randomly injects failures. Returns resilience score. | Score calculation is simplistic. | LOW |
| 18 | Cost optimizer | 🟡 PARTIAL | Benchmarks providers when benchmark:true. Static otherwise. | Live benchmarking works. Static is honest fallback. | DONE |

## GUTS READINESS: 12/18 DONE, 4 PARTIAL, 2 FAKE-CRITICAL

## SPRINT PLAN: Fix guts one by one

### Sprint 1: Compute Exchange (CRITICAL)
### Sprint 2: Army at scale (CRITICAL)
### Sprint 3: Chain looping verification (HIGH)
### Sprint 4: Staking real economics (HIGH)
### Sprint 5: Federated learning or honest removal (MEDIUM)
### Sprint 6: Exotic handler audit (MEDIUM)
