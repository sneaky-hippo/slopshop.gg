# Slopshop Development Guide

**Slopshop — The Living Agentic Backend OS.**
**North Star: Dream Engine + Multiplayer Memory.**

Agents that synthesize knowledge overnight (Dream Engine). Teams that share intelligence in real time (Multiplayer Memory). Self-hostable, multi-model, open forever.

> "Living, breathing memory — free, multiplayer, self-growing — on any model, forever yours."

## Headline Products

- **Dream Engine** — 9-stage REM-cycle memory consolidation. All 9 strategies: synthesize, pattern_extract, insight_generate, compress, associate, validate, evolve, forecast, reflect. `POST /v1/memory/dream/start` → `GET /v1/memory/dream/status/:id` → `GET /v1/memory/dream/report/:id`
- **Multiplayer Memory** — Shared memory spaces with collaborator invites. Collective Dream runs across hive namespaces. `POST /v1/memory/share/create` → `POST /v1/memory/collaborator/invite` → `POST /v1/memory/dream/collective`
- **TMR (Targeted Memory Reactivation)** — Priority-weighted memory reactivation. `POST /v1/memory/tmr/queue` → `GET /v1/memory/tmr/cues`
- **Intelligence Score** — KPI metric: (insights × strategy_depth × 10) / duration_sec. Returned by `GET /v1/memory/dream/report/:id`

## New Frontend Pages (Strat 12)

- `/memory-hub` — Brain Cockpit dashboard (Intelligence Score, sessions, quick launcher, TMR)
- `/dream-studio` — Dream Engine Studio (9-stage config, recipe gallery, SDK generator)
- `/dream-reports` — Morning Intelligence Brief (session analytics, trends, procedural skills)
- `/team-hives` — Multiplayer Living Memory (hive management, collective dreams, team score)
- `/memory-explorer` — Visual Knowledge Graph (force-directed, real API calls)
- `/skills-forge` — Procedural Skills Library (extracted skills, system prompt builder)

API definitions live in four registries: `registry.js` (530 base), `registry-expansion.js`, `registry-hackathon.js`, and `registry-new.js` (vision/vertical/memory-upgrade).

## Strat 13 Features (2026-04-01)

### Dream Engine v2 (`routes/dream-engine-v2.js`)
- **Pre-Dream Prep** — `POST /v1/memory/dream/prep` — questionnaire-based readiness scoring (0–100) + recommended strategy selection
- **TDI Mode** — `POST /v1/memory/dream/incubate` — Targeted Dream Incubation with metacognitive check + affective profiling
- **Metacognitive Check** — pure-JS simulation of prefrontal tACS (40 Hz gamma binding) + alpha-theta phase-amplitude coupling; returns `prefrontal_binding_score`, `alpha_theta_pac_score`, `theta_gamma_coupling`, `memory_consolidation_readiness`, `recommended_depth`, `stage_weights`
- **Emotional Intelligence Layer** — `POST /v1/memory/dream/emotional-tag` — affective tagging (valence/arousal/dominance/primary_emotion/consolidation_bias) stored in `memory_emotional_tags`
- **Incubation Status** — `GET /v1/memory/dream/incubate/:incubation_id`

### Brain Glow Score (`routes/brain-glow.js`)
- **Score** — `GET /v1/memory/score` — Brain Glow formula: `(insights × relevance × dream_depth × emotional_depth × user_shaping × collective_boost) / duration_sec`, capped 0–100; ranks: Spark→Ember→Flame→Blaze→Inferno
- **Force Compute** — `POST /v1/memory/score/compute`
- **Morning Briefing** — `GET /v1/memory/briefing` — brain_glow + dream_recap + top_insights + tmr_cues + emotional_summary + recommended_strategies
- **History** — `GET /v1/memory/score/history?limit=30&days=90`
- **Streak Check-in** — `POST /v1/memory/score/streak/checkin`

### Background Extractors (`routes/background-extractors.js`)
- **Extract** — `POST /v1/memory/background/extract` — tokenize → entity extraction → density score → Jaccard clustering → memory chunks; optional `auto_dream` queuing
- **Discovery Scan** — `POST /v1/memory/discovery/scan` — multi-source scan (text/url_hint/key_value_pairs) with threshold filtering
- **Runs** — `GET /v1/memory/background/runs`, `GET /v1/memory/background/runs/:run_id`, `DELETE /v1/memory/background/runs/:run_id`
- **Memories** — `GET /v1/memory/background/memories`

### Voice + Wearable (`routes/voice-wearable.js`)
- **Voice Store** — `POST /v1/voice/transcribe-and-store` — accepts pre-transcribed text, computes speaking_rate + key_phrases + memory_value_score, optional chunk extraction
- **Voice List/Delete** — `GET /v1/voice/transcripts`, `DELETE /v1/voice/transcript/:id`
- **Wearable Sync** — `POST /v1/wearable/sync` — ingests biometrics (Oura/Whoop/Garmin/Apple Watch), computes `memory_consolidation_index` from REM/deep sleep, auto-schedules TMR if MCI > 60
- **Wearable Data/Correlation** — `GET /v1/wearable/data`, `GET /v1/wearable/sleep-correlation`
- **Multiplayer Voice Rooms** — `POST /v1/voice/multiplayer/room`, `GET /v1/voice/multiplayer/room/:id`, `POST /v1/voice/multiplayer/room/:id/join`, `POST /v1/voice/multiplayer/room/:id/transcript`, `GET /v1/voice/multiplayer/room/:id/transcripts`

## Running the server

```bash
node server-v2.js          # starts on port 3000
PORT=8080 node server-v2.js # custom port
ANTHROPIC_API_KEY=xxx node server-v2.js  # unlocks AI APIs
```

## Testing

```bash
node audit.js               # full system audit
node lobster-test.js         # edge case testing
node simulate.js             # penetration simulation
```

## Architecture

- `server-v2.js` - Express server, routes, auth, SQLite persistence (16,900+ lines)
- `registry.js` - API definitions (slug, name, desc, credits, tier) — 530 base tools
- `registry-expansion.js` - Expansion APIs (sense, generate, enrich categories)
- `registry-hackathon.js` - Hackathon superpower APIs
- `registry-new.js` - New tools: vision, finance, devops, legal, health, marketing, memory 2.0
- `schemas.js` - Input/output schemas for each API
- `handlers/compute.js` - Pure compute handlers (no external deps)
- `handlers/llm.js` - AI handlers (need ANTHROPIC_API_KEY)
- `handlers/network.js` - Network handlers (DNS, HTTP, SSL)
- `handlers/external.js` - External service handlers (Slack, GitHub, S3 with AWS Sig V4)
- `handlers/vision.js` - Vision/media handlers (image hash, OCR, color palette, data URI)
- `handlers/vertical.js` - Vertical domain handlers (finance, devops, legal, health, marketing)
- `handlers/memory-upgrade.js` - Memory 2.0 handlers (scoring, drift, clustering, knowledge graph)
- `routes/identity.js` - Agent identity (SVID/JWT), ANS registry, reputation, A2A messaging, orgs
- `routes/observe.js` - Observability: traces, dashboard, analytics, budget, ROI, status page
- `routes/computer-use.js` - Computer Use: session recording, screenshot diff, replay, approvals
- `routes/gateway.js` - MCP gateway, policy engine, governance, SIEM/audit export
- `routes/eval.js` - Eval suites, benchmarks, model routing
- `routes/workflow-builder.js` - Visual DAG workflows, Kahn's topo sort, human gates, templates
- `routes/marketplace.js` - Tool marketplace, 70/30 revenue share, handler code security scan
- `zapier.js` - Zapier integration endpoints
- `pipes.js` - Pre-built workflow pipes
- `mcp-server.js` - MCP server for Claude Code
- `cli.js` - CLI tool

## Agent Chaining & Prompt Queue (New)

- **Agent-to-agent chaining**: Agents can invoke other agents via the chain API, enabling infinite consciousness flows where output from one agent becomes input for the next.
- **Prompt queue**: Batch processing system for overnight or deferred workloads. Prompts are queued in SQLite and executed sequentially or in parallel depending on configuration.
- See `STRATEGY-2026.md` for full roadmap and implementation priorities.

## Adding a new API

1. Add handler to `handlers/compute.js` (or appropriate handler file)
2. Add definition to `registry.js` in `API_DEFS` (or `registry-new.js` for new categories)
3. Add schema to `schemas.js` in `SCHEMAS`
4. Restart server and test

## New Route Modules (2026-03-31)

All route modules in `routes/` are mounted in server-v2.js before the wildcard dispatcher:
```js
require('./routes/identity')(app, db, apiKeys);      // /v1/identity, /v1/ans, /v1/reputation, /v1/a2a, /v1/org
require('./routes/observe')(app, db, apiKeys, ipLimits); // /v1/observe, /v1/status
require('./routes/computer-use')(app, db, apiKeys);  // /v1/computer-use
require('./routes/gateway')(app, db, apiKeys);       // /v1/gateway, /v1/policy, /v1/governance
require('./routes/eval')(app, db, apiKeys);          // /v1/eval, /v1/route/...
require('./routes/workflow-builder')(app, db, apiKeys); // /v1/workflow, /v1/workflows
require('./routes/marketplace')(app, db, apiKeys);   // /v1/marketplace
```

## Environment Variables

```bash
ANTHROPIC_API_KEY=xxx   # Claude AI (llm handlers)
OPENAI_API_KEY=xxx      # GPT-4 (llm-council)
GROK_API_KEY=xxx        # Grok (llm-think with provider=grok)
DEEPSEEK_API_KEY=xxx    # DeepSeek (llm-think with provider=deepseek)
SENDGRID_API_KEY=xxx    # Email sending (ext-email-send)
AWS_ACCESS_KEY_ID=xxx   # S3 upload (ext-s3-upload)
AWS_SECRET_ACCESS_KEY=xxx
S3_BUCKET=xxx           # S3 bucket name
ORCHESTRATE_API_KEY=xxx # Self-referential orchestration (defaults to demo key)
INTERNAL_SECRET=xxx     # JWT signing for agent identities (auto-generated if missing)
DB_PATH=/data/slopshop.db # SQLite path (defaults to .data/slopshop.db)
```
