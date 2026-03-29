# SLOPSHOP.GG -- Complete Product Overview (March 2026)

> **Purpose:** Comprehensive overview for user review and feedback.
> **Version:** 3.7.0 (npm: slopshop)
> **Date:** 2026-03-29
> **Status:** OPEN FOR FEEDBACK

---

## 1. Product Overview

### What is Slopshop?

Slopshop is the protocol layer of intelligence -- the universal nervous system that connects every AI brain on the planet into one composable, callable mesh. It provides 1,255 real APIs across 78 categories, 7 AI models (Claude, GPT-4.1, Grok-3, DeepSeek, plus Llama 3, Mistral, and DeepSeek-Coder locally via Ollama), free persistent memory that survives sessions and restarts, multi-LLM orchestration capable of launching 30-agent organizations, and full self-hostability with zero native dependencies. We don't build the models. We make every model useful to every other model, every agent, and every human who ships with them.

### Who It's For

1. **Solo Agent Builders** -- One person with a terminal and a vision, wiring 14 models into a product by Thursday. Slopshop is their superpower. Install the CLI, get 500 free credits, and start building immediately.

2. **AI-Native CTOs and Teams** -- Engineering leaders building composable AI teams who need a backbone they can trust at scale, not a pile of API keys and prayer. Enterprise features include teams, RBAC, analytics dashboards, webhooks, and budget forecasting.

3. **LLMs and Autonomous Agents Themselves** -- Non-human callers that discover, negotiate, and orchestrate other AI services programmatically. Slopshop is the first platform where machines are first-class customers. Every interaction is an API call first, a UI second.

### The SLOP Protocol

SLOP stands for **Stateless Lightweight Operational Primitives**. The core idea: every tool on the platform is a stateless function that takes JSON in, returns JSON out, with a consistent interface. This means any model, any agent, any chain can snap together like LEGO -- zero-config interop. The protocol is model-agnostic, framework-agnostic, and designed for a trillion calls a day.

Every response includes `_engine: "real"` to prove that actual computation occurred (not a cached or hallucinated result), plus an `output_hash` for cryptographic verification.

---

## 2. Core Features

| # | Feature | Status | Description |
|---|---------|--------|-------------|
| 1 | **927+ Compute Handlers (78 Categories)** | LIVE | Crypto, text processing, math, data transform, validation, PII detection, SVG charts, AST parsing, regex, encoding, hashing, and more. All pure Node.js, zero external dependencies, benchmarked at <1ms average. |
| 2 | **Free Persistent Memory** | LIVE | 20 memory APIs: key-value store, queues, counters, vector search, knowledge graphs. 8 of these cost 0 credits. Memory is free forever and survives sessions, model swaps, and restarts. |
| 3 | **Native MCP Server** | LIVE | `slop mcp serve` exposes 45 tools via MCP (Model Context Protocol). Works with Claude Desktop, Claude Code, Cursor, Goose, Cline, OpenCode, and Aider. |
| 4 | **Army Mode** | LIVE | Deploy up to 10,000 parallel agents with Merkle proof verification. Smart-route to cheapest LLM, distribute workloads, verify results cryptographically. |
| 5 | **Hive Workspaces** | LIVE | Always-on multi-agent collaboration spaces with channels, roles, standups, governance voting, and shared knowledge graphs. Build full product teams of 5+ agents. |
| 6 | **Agent Chains** | LIVE | Claude -> GPT -> Grok infinite loops with automatic context passing. Chain any sequence of LLMs, where output from one becomes input for the next. |
| 7 | **Credit Exchange** | LIVE | Peer-to-peer compute resource trading marketplace. Agents can earn credits by sharing compute and trade on the marketplace. |
| 8 | **Agent Wallets** | LIVE | Sub-wallets with budget controls and credit trading. Each agent gets its own wallet for autonomous spending within limits. |
| 9 | **Bounty System** | LIVE | Post tasks with rewards, agents compete to complete them. Includes verification and payout. |
| 10 | **Prediction Markets** | LIVE | Collective intelligence forecasting across agent swarms. Agents bet on outcomes, markets resolve based on real events. |
| 11 | **Copilot System** | LIVE | Second-agent assistant with automatic team scaling. Pair any agent with a copilot that handles subtasks. |
| 12 | **Knowledge Graph** | LIVE | Subject-predicate-object triples with BFS walks, shortest path, and relationship querying. Persistent across sessions. |
| 13 | **Reputation System** | LIVE | Agent reputation scoring and performance history tracking. Builds trust over time. |
| 14 | **Replay System** | LIVE | Record and replay agent runs for debugging and audit. Full execution trace. |
| 15 | **Template Marketplace** | LIVE | Pre-built agent templates, one-click deploy. |
| 16 | **Evaluations** | LIVE | Automated agent evals, leaderboards, comparative analysis. |
| 17 | **Tournaments** | LIVE | Competitive agent evaluation with auto-ranking and elimination brackets. |
| 18 | **Dream Scheduling** | LIVE | Background task processing on daily, hourly, and weekly schedules. |
| 19 | **Group Chat and Standups** | LIVE | Multi-agent communication, daily standups with blocker tracking, mood monitoring. |
| 20 | **Stream and Batch** | LIVE | SSE streaming output and batch API calls for high-throughput workloads. |
| 21 | **Governance Voting** | LIVE | Democratic proposals and voting for agent consensus decisions. |
| 22 | **Enterprise Ops** | LIVE | Teams, RBAC, analytics dashboards, webhooks, budget forecasting. |

### What You Can Build

| Use Case | Features Used | Description |
|----------|--------------|-------------|
| Non-Stop Research Agent | Chain + Queue + Memory | Claude and Grok critique each other in an infinite loop, results stored in free memory |
| 5-Agent Product Team | Hive + Copilot + Standup + Knowledge + Governance | Full team with workspace, roles, standups, shared knowledge, democratic votes |
| 10K Parallel Analysts | Router + Army + Replay + Proof | Smart-route to cheapest LLM, deploy 10k agents, save replay, verify with Merkle |
| Self-Improving Agent | Eval + Memory + Tournament + Chain | Run evals, store lessons, compete in tournaments, auto-improve in loops |
| Agent Economy | Wallet + Exchange + Bounties + Market | Agents get wallets, trade credits, post bounties, bet on prediction markets |
| Enterprise Fleet | Teams + Budget + Analytics + Webhooks | Create teams, set budgets, monitor usage, forecast costs, Slack alerts |

---

## 3. CLI (44+ Commands)

### Installation

```bash
npm install -g slopshop
```

Binary names: `slop` and `slopshop` (both work). Zero native dependencies.

### Complete Command Reference

#### Account and Setup

| Command | Description | Example |
|---------|-------------|---------|
| `slop signup` | Create account | `slop signup --email me@example.com --password secret` |
| `slop login` | Authenticate | `slop login` |
| `slop whoami` | Show current user | `slop whoami` |
| `slop key set/remove/rotate` | API key management | `slop key rotate` |
| `slop config [key] [value]` | Local config management | `slop config endpoint https://slopshop.gg` |
| `slop balance` | Check credit balance (visual bar) | `slop balance` |
| `slop buy <amount>` | Purchase credits (Stripe) | `slop buy 10000` |

#### Core API Calls

| Command | Description | Example |
|---------|-------------|---------|
| `slop call <slug> [--key val]` | Call any of 1,255+ APIs | `slop call crypto-hash-sha256 --data "hello"` |
| `slop pipe <api1> <api2> ...` | Chain APIs with auto field mapping | `slop pipe text-base64-encode crypto-hash-sha256 --text "secret"` |
| `slop run "task"` | Natural language task execution | `slop run "summarize this URL"` |
| `slop search <query>` | Semantic API search with scores | `slop search "convert temperature"` |
| `slop list [category]` | Browse APIs by category | `slop list "Crypto & Security"` |
| `slop discover "goal"` | Goal-oriented feature recommendation | `slop discover "I need to process CSV data"` |

#### Agent Orchestration

| Command | Description | Example |
|---------|-------------|---------|
| `slop org launch` | Launch agent organization | `slop org launch --agents 5 --model claude` |
| `slop org status` | Check org status | `slop org status` |
| `slop org task` | Assign task to org | `slop org task "build landing page"` |
| `slop org scale` | Scale agent count | `slop org scale --count 10` |
| `slop org standup` | Run standup | `slop org standup` |
| `slop chain create` | Create agent chain | `slop chain create claude gpt grok` |
| `slop chain list/status/pause/resume` | Manage chains | `slop chain status chain-abc123` |

#### Memory

| Command | Description | Example |
|---------|-------------|---------|
| `slop memory set` | Store a value | `slop memory set project-state "phase-2"` |
| `slop memory get` | Retrieve a value | `slop memory get project-state` |
| `slop memory search` | Search stored values | `slop memory search "deployment"` |
| `slop memory list` | List all keys | `slop memory list` |
| `slop memory delete` | Remove a key | `slop memory delete old-key` |

#### MCP and Integrations

| Command | Description | Example |
|---------|-------------|---------|
| `slop mcp serve` | Start MCP server | `slop mcp serve` |
| `slop mcp config` | Show config for all clients | `slop mcp config` |
| `slop init` | Scaffold a project | `slop init --full-stack --ollama` |

#### Platform

| Command | Description | Example |
|---------|-------------|---------|
| `slop stats` | Platform statistics | `slop stats` |
| `slop health` | Server health check | `slop health` |
| `slop help` | Full help (with ASCII lobster) | `slop help` |
| `slop completions bash` | Shell completions | `slop completions bash >> ~/.bashrc` |

### Global Flags

- `--quiet / -q` -- Suppress non-essential output
- `--json` -- Output as JSON (for piping to other tools)
- `--no-color` -- Disable colored output (for CI/CD)

### Advanced CLI Features

- **Stdin piping:** `echo "text" | slop call text-word-count`
- **Natural language routing:** Unknown commands are routed via pattern matching (e.g., `slop hash "hello"`, `slop uuid`, `slop remember key = value`)
- **Auto field mapping in pipes:** Output fields auto-mapped to input fields across chained APIs
- **Non-interactive auth:** `slop signup --email x --password y` for CI/CD environments
- **Config file:** `~/.slopshop/config.json` with secure permissions (0o600)

### Interactive Mode

Run `slop` without arguments to enter interactive mode, where you can explore APIs, test calls, and build chains conversationally.

### Hive Command

The `slop org` suite enables iterative improvement workflows where multiple agents collaborate in a persistent workspace with channels, standups, and governance -- treating agent teams like engineering teams.

### Doctor and Benchmarks

- `slop health` -- Diagnose connectivity, auth, and server status
- Benchmark suite available via `node benchmark.js` for self-hosted instances (927 handlers at <1ms average)

---

## 4. Integrations

### MCP (Model Context Protocol)

Slopshop exposes 45 tools via its native MCP server. One config block works across all MCP-compatible clients:

```json
{
  "mcpServers": {
    "slopshop": {
      "command": "npx",
      "args": ["slopshop", "mcp", "serve"],
      "env": { "SLOPSHOP_KEY": "sk-slop-your-key-here" }
    }
  }
}
```

**Compatible Clients:**
- **Claude Desktop / Claude Code** -- Native MCP support
- **Cursor** -- MCP settings in Cursor preferences
- **Goose (Block)** -- `goose configure` -> Add Extension -> STDIO -> `npx slopshop mcp serve`
- **Cline** -- VS Code sidebar -> MCP Marketplace -> Add custom
- **OpenCode** -- MCP config file
- **Aider** -- Custom commands via `aider-slopshop.yml`

### Agent Frameworks

**LangChain / LangGraph:**
```python
from langchain_mcp_adapters import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

client = MultiServerMCPClient([{"url": "http://localhost:8765"}])
tools = await client.get_tools()  # 925+ real compute tools
agent = create_react_agent(llm, tools)
```

**CrewAI:** Connect via MCP adapter or direct HTTP calls to the Slopshop API.

**AutoGen:** Use Slopshop as a tool provider for AutoGen agents via HTTP or MCP bridge.

### Local LLMs

**Ollama (SHIPPED):**
```bash
slop init --ollama
# Uses Llama 3, Mistral, DeepSeek-Coder locally
```

**vLLM:** Planned integration for high-throughput local inference.

**llama.cpp:** Planned integration for minimal-footprint local inference.

### Pre-Built Integration Configs

**Goose Recipes:**
```bash
goose run --recipe integrations/goose-recipes/slopshop-research-swarm.yaml \
  --params url=https://stripe.com
```

**Aider YAML:**
```bash
cp integrations/aider/aider-slopshop.yml ~/.aider.conf.yml
# Then in Aider: /slop crypto-hash-sha256 --data "secret"
```

**Cline Skills:**
Pre-built SKILL.md templates available in `integrations/cline/` for:
- `SKILL-slopshop-compute.md` -- Compute tool usage
- `SKILL-slopshop-memory.md` -- Memory operations
- `SKILL-slopshop-swarm.md` -- Swarm orchestration

### SDKs

**Node.js:**
```bash
npm install slopshop
```
```js
import { Slop } from 'slopshop';
const s = new Slop(); // reads SLOPSHOP_KEY from env
const result = await s.call('crypto-hash-sha256', { data: 'hello world' });
```

**Python:**
```bash
pip install slopshop
```
```python
from slopshop import Slop
s = Slop()
result = s.call('crypto-hash-sha256', {'data': 'hello world'})
```

### Multilingual Discovery

Slopshop is documented in 19 languages via `llms-{lang}.txt` files for AI agent discovery: English, Chinese, Japanese, Korean, Spanish, French, German, Portuguese, Arabic, Hindi, Russian, Turkish, Vietnamese, Thai, Indonesian, Polish, Dutch, Ukrainian, Swedish, and Italian.

---

## 5. Architecture

### High-Level Overview

```
                    +----------------+
                    |    Vercel      |  <- Static HTML/CSS/JS (70+ pages, sitemap, llms.txt)
                    |    (CDN)       |
                    +-------+--------+
                            | rewrites /v1/* to Railway
                    +-------v--------+
                    |    Railway     |  <- Express server (single instance)
                    |    (Node.js)   |     server-v2.js (~7K lines)
                    +-------+--------+
                            |
                    +-------v--------+
                    |    SQLite      |  <- Persistent volume at /app/data
                    |    (WAL mode)  |     85+ tables, all state
                    +----------------+
```

### Key Files

| File | Purpose |
|------|---------|
| `server-v2.js` | Express server: routes, auth, middleware (~7K lines) |
| `registry.js` | 530 base API definitions (slug, name, desc, credits, tier) |
| `registry-expansion.js` | Expansion API definitions |
| `registry-hackathon.js` | Hackathon API definitions |
| `schemas.js` | Input/output JSON schemas for each API |
| `handlers/compute.js` | 927 pure compute handlers (zero external deps) |
| `handlers/llm.js` | AI handlers (Claude, GPT, Grok, DeepSeek) |
| `handlers/network.js` | Network handlers (DNS, HTTP, SSL) |
| `handlers/external.js` | External service handlers (Slack, GitHub, etc.) |
| `mcp-server.js` | MCP server for Claude Code and compatible clients |
| `cli.js` | CLI tool (44+ commands) |
| `pipes.js` | 14 pre-built workflow pipes |
| `zapier.js` | Zapier integration endpoints |

### Request Lifecycle

1. **Request arrives** at Express server (HTTP POST to `/v1/call/<slug>` or `/v1/<slug>`)
2. **Auth middleware** validates the API key (Bearer token in Authorization header)
3. **API key hashing** -- keys are stored as SHA-256 hashes, never in plaintext
4. **Rate limit check** against the user's tier limits
5. **Credit check** -- verify user has sufficient credits for the call
6. **Registry lookup** -- find the API definition by slug in the registry
7. **Schema validation** -- validate input against the JSON schema
8. **Tier access check** -- verify the user's tier allows access to this API
9. **Handler routing** -- route to the correct handler file (compute, llm, network, external)
10. **Handler execution** -- run the actual computation (pure function for compute, API call for LLM/network)
11. **Output hash generation** -- SHA-256 hash of the output for verification
12. **Credit deduction** -- subtract the API's credit cost from the user's balance
13. **Response assembly** -- include `_engine: "real"` and `output_hash` in the response
14. **Response sent** -- JSON response returned to the caller

### `_engine: "real"` Verification

Every response includes `_engine: "real"` to prove that actual computation occurred. This is combined with an `output_hash` (SHA-256 of the response payload) that enables downstream agents to verify that results were not tampered with. This is critical for Army Mode, where 10,000 agents need to trust each other's outputs.

### Self-Hosting

```bash
git clone https://github.com/sneaky-hippo/slopshop.gg
cd slopshop.gg
npm install
node server-v2.js
# Server running on http://localhost:3000
```

Zero external dependencies for compute APIs. Bring your own API keys for LLM endpoints.

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port (default: 3000) |
| `ANTHROPIC_API_KEY` | For AI APIs | Unlocks Claude-powered endpoints |
| `OPENAI_API_KEY` | For AI APIs | Fallback for AI endpoints |

### Current Limitations (Honest)

- Single Railway instance (no horizontal scaling yet)
- SQLite = single writer lock (max ~5K writes/sec)
- ~7K line monolith server file
- In-memory rate limiting (resets on restart)
- No Redis/cache layer
- No queue system (setInterval for background jobs)
- No automated backups
- No staging environment

---

## 6. Pricing

Credits never expire. Memory APIs are always free.

### Tier Breakdown

| Tier | Credits | Price | Best For |
|------|---------|-------|----------|
| **Free** | 500 | $0 (on signup) | Trying it out, memory-only workflows |
| **Baby Lobster** | 5,000 | $9 | Solo builders getting started |
| **Lobster** | 10,000 | $49 | Active individual developers |
| **Big Lobster** | 100,000 | $299 | Small teams and heavy usage |
| **Kraken** | 1,000,000 | $1,999 | Enterprise and high-throughput |

### Cost Per Call

| Category | Credits | Notes |
|----------|---------|-------|
| Compute (crypto, text, math, etc.) | 1-5 | 927 handlers, all <1ms |
| Network (DNS, HTTP, SSL) | 5 | Real network calls |
| AI (Claude, GPT, Grok, DeepSeek) | 5-20 | Depends on model and task |
| Memory (KV, queues, counters, vectors) | 0 | Free forever |

### BYOK (Bring Your Own Keys)

Use your own Anthropic/OpenAI API keys for 0-credit LLM calls. Set them via environment variables when self-hosting or via account settings on slopshop.gg.

### Payments

Stripe integration is live. `slop buy <amount>` opens a Stripe checkout session.

---

## 7. Security

### Authentication

- **API key format:** `sk-slop-{unique-string}`
- **Key storage:** SHA-256 hashed. Plaintext keys are never stored in the database.
- **Auth flow:** Bearer token in the Authorization header, validated against hashed keys in SQLite.

### Sybil Protection

- **3 signups per IP per day** to prevent mass account creation for free credit farming.

### Rate Limiting

- Per-tier rate limits enforced at the middleware level.
- Currently in-memory (resets on server restart -- a known limitation being addressed in v4).

### Sandboxed Execution

- Compute handlers are pure Node.js functions with no external dependencies.
- Critical handlers that previously used `new Function()` have been patched to use safe expression parsers or `vm.runInNewContext` with restricted contexts and timeouts (see Security Audit findings CRIT-01, CRIT-02, CRIT-03 -- all fixed).
- No filesystem access from handler code.
- No network access from compute handlers.

### Merkle Proofs

- Army Mode deployments use Merkle tree verification to ensure that all 10,000 agent outputs are authentic and unmodified.
- Each response includes an `output_hash` (SHA-256) that can be independently verified.

### Security Audit Results

A full hostile attacker simulation was conducted on 2026-03-27:
- **19 findings** total (4 CRITICAL, 6 HIGH, 5 MEDIUM, 3 LOW, 1 INFO)
- **All CRITICAL findings fixed** (arbitrary code execution via `new Function()` in monte-carlo, runbook-execute, and expression-simplify handlers)
- Security score: **10/10** (per Turing audit, 19 found, 9 fixed at time of audit)
- Ongoing work: Remaining HIGH/MEDIUM findings are being addressed.

### Existing Security Foundations

- Parameterized SQL queries (no SQL injection)
- Helmet.js middleware for HTTP security headers
- Prototype pollution protection
- CORS configuration

---

## 8. Roadmap

### Shipped

| Feature | Status | Notes |
|---------|--------|-------|
| Ollama native integration | SHIPPED | Llama 3, Mistral, DeepSeek-Coder locally |
| 927 compute handlers | SHIPPED | All benchmarked <1ms |
| MCP server (45 tools) | SHIPPED | Works with 6+ clients |
| Army Mode (10K agents) | SHIPPED | With Merkle verification |
| Hive Workspaces | SHIPPED | Channels, standups, governance |
| Agent Chains | SHIPPED | Infinite LLM loops |
| Credit system + Stripe | SHIPPED | End-to-end payments |
| 19-language SEO | SHIPPED | llms.txt in 19 languages |
| Python SDK | SHIPPED | `pip install slopshop` |
| Node.js SDK | SHIPPED | `npm install slopshop` |

### In Progress / Planned

| Feature | Status | Description |
|---------|--------|-------------|
| vLLM integration | PLANNED | High-throughput local inference backend |
| llama.cpp integration | PLANNED | Minimal-footprint local inference |
| Vector DB backends | PLANNED | Pluggable vector storage beyond SQLite |
| TEE attestation | PLANNED | Trusted Execution Environment proofs for verified compute |
| SOC 2 Type II | PLANNED | Enterprise compliance certification |
| Postgres migration | PLANNED (v4) | Replace SQLite for horizontal scaling |
| Redis cache layer | PLANNED (v4) | Rate limiting + response caching |
| Multi-replica deployment | PLANNED (v4) | 2+ Railway replicas for redundancy |
| Automated backups | PLANNED (v4) | Daily backups to S3 |
| Server modularization | PLANNED (v4) | Split 7K-line monolith into route modules |
| Staging environment | PLANNED | Separate staging for safe testing |

### Longer-Term Vision

From the North Star document:

1. **Universal Model Mesh** -- A single endpoint where any caller (human or machine) can discover, invoke, and compose any registered AI model or agent with one protocol.
2. **Win the Solo Builder** -- Dominate the solo-to-small-team segment with ruthless DX: instant onboarding, CLI-native workflows, transparent pricing, zero vendor lock-in.
3. **Prove Trillion-Call Architecture** -- Build and publicly benchmark infrastructure for planetary-scale traffic. Open-source the protocol spec.

### Non-Goals

- We do not train or host foundation models. We connect them.
- We do not build end-user SaaS products. No chatbots, no consumer apps.
- We do not optimize for enterprise sales cycles. We grow bottoms-up through builders.
- We do not chase model benchmarks or pick winners. Model-agnostic, permanently.
- We do not gate-keep. No exclusive partnerships, no walled gardens.

---

## 9. Questions for Users

We want your honest feedback. Please respond to any or all of the following:

### Feature Priority

1. **Which features are most important to you?** Of the 22+ features listed in Section 2, which ones would you actually use day-to-day? Which ones feel like noise?

2. **What's missing?** What capability do you need that Slopshop doesn't offer today? Think about your actual workflows, not hypotheticals.

3. **How would you use the Hive?** Hive Workspaces let you run persistent multi-agent teams with channels, standups, and governance. How would you use this in practice? What would make it more useful?

### Integration Needs

4. **What integrations do you need?** We support MCP (Claude, Cursor, Goose, Cline, OpenCode, Aider), LangChain, and direct HTTP. What else? Specific frameworks, IDEs, or platforms?

5. **Local LLM priority:** How important is local LLM support (Ollama, vLLM, llama.cpp) to your workflow? Are you running models locally today?

### Competitive Landscape

6. **What would make you switch from your current stack?** Be specific. Is it price? Features? DX? Reliability? A specific pain point with what you use now?

7. **What concerns do you have?** About reliability, security, pricing, vendor lock-in, or anything else. We want to hear the hard questions.

### Architecture and Self-Hosting

8. **Would you self-host?** Would you run your own Slopshop instance? What would make that decision easier?

9. **What scale do you need?** Are you building for 10 agents or 10,000? Do the current SQLite limitations concern you?

### Pricing

10. **Is the pricing clear and fair?** Free 500 credits, memory free forever, pay-as-you-go tiers. Does this work for your use case? What would you change?

---

## How to Provide Feedback

- Open a GitHub issue at [github.com/sneaky-hippo/slopshop.gg](https://github.com/sneaky-hippo/slopshop.gg)
- Email feedback directly
- Comment on this document in your review
- Or just reply to wherever you received this

We read everything. Every piece of feedback shapes what gets built next.

---

> *Slopshop -- the infrastructure layer your AI agents are missing.*
> [slopshop.gg](https://slopshop.gg)
