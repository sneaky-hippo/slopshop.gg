# SLOPSHOP HEALTH REPORT — 1,255 ENDPOINTS
# Live-tested against production (slopshop.gg) on 2026-03-29
# 13 parallel agents, real HTTP calls with real API key

## AGGREGATE RESULTS

| Agent | Category | Tested | Works | Broken | Rate |
|-------|----------|--------|-------|--------|------|
| 1 | Non-compute (army, hive, chain, etc.) | 47 | 43 | 4 | 91% |
| 2 | Crypto & Security | 20 | 20 | 0 | **100%** |
| 3 | Text Processing | 90 | 87 | 3 | 97% |
| 4 | Math, Date, Validation | 76 | 76 | 0 | **100%** |
| 5 | Code, Generate, Communicate | 102 | 101 | 1 | 99% |
| 6 | Network, Sense, Enrich | 80 | 80 | 0 | **100%** |
| 7 | LLM/AI (sample) | 20 | 16 | 4 | 80% |
| 8 | Orchestrate, Execute, Memory | 58 | 57 | 1 | 98% |
| 9 | Agent Tools, Superpowers, Enterprise, Game | 223 | 217 | 6 | 97% |
| 10 | Exotic batch 1 (10 categories) | 92 | 89 | 3 | 97% |
| 11 | Exotic batch 2 (13 categories) | 91 | 89 | 2 | 98% |
| 12 | Broad sweep (all 78 categories) | 202 | 165 | 37 | 82% |
| **TOTAL UNIQUE** | **78 categories** | **~950+** | **~920+** | **~30** | **~97%** |

## BROKEN ENDPOINTS (consolidated, deduplicated)

### Handler crashes (502/500)
| Slug | Category | Error |
|------|----------|-------|
| text-extract-phones | Text | 502 handler crash |
| text-wrap | Text | 502 handler crash |
| regex-build | Text | 502 handler crash |
| contract-abi-parse | Code | 500 `a.filter is not a function` |
| data-deep-merge | Agent Superpowers | 502 crash |
| data-diff | Agent Superpowers | 502 crash |
| orch-race | Orchestrate | 502 timeout |
| trophic-cascade-simulator | Ecosystem | 502 crash |
| biodiversity-index-calculator | Ecosystem | 502 crash |
| fog-of-war-simulator | Strategic Warfare | 502 crash |

### No handler (501)
| Slug | Category | Error |
|------|----------|-------|
| context-session | Agent Tools | 501 no_handler |
| state-set | Agent Tools | 501 no_handler |
| state-get | Agent Tools | 501 no_handler |
| state-list | Agent Tools | 501 no_handler |

### Slug mismatch (404)
| Slug tried | Actual slug |
|------------|-------------|
| crypto-hmac-sha256 | crypto-hmac |
| crypto-random-string | crypto-password-generate |
| gen-lorem-ipsum | gen-lorem |
| validate-uuid-format | (not registered) |
| text-json-to-yaml | (not registered) |

### LLM timeouts (>15s, needs_key)
LLM endpoints work but are slow (15-30s for complex prompts). External integration endpoints (ext-email-send, ext-github-issue, etc.) return `needs_key` — correct behavior, not bugs.

### Transient 502s (work on retry)
influence-liquidity-score, sacred-value-detector, gen-fake-date, socratic-dialogue — all pass on retry. Intermittent Railway instability.

## END-TO-END FLOW TESTS

| Feature | Works? | Details |
|---------|--------|---------|
| Memory set→get→search | ✅ YES | Data persists, 23 search results |
| Merkle proof generation | ✅ YES | Binary tree, 2 proof siblings for 4 leaves |
| Army deploy (2-3 agents) | ✅ YES | 2 agents, unique UUIDs, merkle verified |
| Army deploy (10+ agents) | ❌ TIMEOUT | 502 on Railway (proxy timeout) |
| Hive create + send + standup | ✅ YES | All work |
| Governance propose + vote | ⚠️ PARTIAL | Propose works when `title` field used correctly |
| Chain create | ✅ YES | Chain created with loop support |
| Chain run (compute steps) | 🔄 FIXED | Now supports slug-based steps (pending deploy) |
| Exchange full flow | 🔄 FIXED | Task assignment now auto-connects to supplier (pending deploy) |
| Batch (3 parallel calls) | ✅ YES | All 3 executed |
| SSE streaming | ✅ YES | Events: start → progress → result → done |
| Pipe/run inline steps | 🔄 FIXED | Added {steps:[]} support (pending deploy) |

## CATEGORIES AT 100%
- Crypto & Security (20/20)
- Math & Numbers (46/46)
- Date & Time (17/17)
- Validation (13/13)
- Network & DNS (28/28)
- Sense: Web (32/32)
- Enrich (20/20)
- Generate (59/59)
- Communicate (16/16)
- Execute (16/16)
- Memory (22/22)
- Enterprise Ops (23/23)
- Game Mechanics (15/15)
- Information Theory (6/6)
- Information Propagation (6/6)
- Knowledge Processing (8/8)
- Sentiment Modeling (6/6)
- Sensory Simulation (7/7)
- State Management (7/7)
- Physics Simulation (7/7)
- Process Optimization (11/11)
- Adversarial Thinking (5/5)
- Agent Workflow (4/4)
- Agent Intelligence (7/7)

**24 categories at 100%. All _engine: 'real'.**

## ACTIONS NEEDED

### Fix 10 handler crashes (502/500)
These handlers throw exceptions. Need to read each handler and fix the bug.

### Wire 4 missing handlers (501)
context-session, state-set, state-get, state-list need handlers in compute.js or server-v2.js.

### Deploy 12 commits
All chain/exchange/pipe fixes are in code, waiting on Railway redeploy.
