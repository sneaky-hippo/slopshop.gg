# Slopshop Development Guide

**Slopshop — The Living Agentic Backend OS.**
**North Star: Dream Engine + Multiplayer Memory.**

Agents that synthesize knowledge overnight (Dream Engine). Teams that share intelligence in real time (Multiplayer Memory). Self-hostable, multi-model, open forever.

> "Claude controls the screen. Slopshop runs the brain — openly, on any model, forever."

## Headline Products

- **Dream Engine** — REM-style memory consolidation. Agents synthesize, compress, and evolve their memory on a schedule. `POST /v1/memory/dream/start` → `GET /v1/memory/dream/status/:id`
- **Multiplayer Memory** — Shared memory spaces with collaborator invites. Real-time team intelligence. `POST /v1/memory/share/create` → `POST /v1/memory/collaborator/invite`

Everything else (1,421+ APIs, 82 categories, visual DAG workflows, hive coordination, GraphRAG, northstar goal-anchoring) supports and extends these two primitives.

API definitions live in four registries: `registry.js` (530 base), `registry-expansion.js`, `registry-hackathon.js`, and `registry-new.js` (vision/vertical/memory-upgrade).

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
