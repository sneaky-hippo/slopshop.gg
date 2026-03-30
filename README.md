<div align="center">

# Slopshop

### The Self-Hostable MCP Agent Runtime OS for the Computer-Use Era

**Claude controls the screen. Slopshop runs the brain.**

```bash
npm install -g slopshop
slop signup                              # 500 free credits
slop "hash hello world with sha256"      # natural language routing
slop identity issue --agent "my-agent"  # zero-trust agent identity
```

[![npm version](https://img.shields.io/npm/v/slopshop?color=red&label=npm)](https://www.npmjs.com/package/slopshop)
[![Tests](https://img.shields.io/badge/tests-2272%20passing-brightgreen)](https://slopshop.gg)
[![APIs](https://img.shields.io/badge/APIs-1303-blue)](https://slopshop.gg/tools.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-45_tools-purple)](https://modelcontextprotocol.io)
[![Models](https://img.shields.io/badge/Models-7_(Claude%2BGPT%2BGrok%2BDeepSeek%2BOllama)-orange)](https://slopshop.gg)
[![NIST Aligned](https://img.shields.io/badge/NIST-SPIFFE%2FSVID-cyan)](https://slopshop.gg/docs.html)

[Website](https://slopshop.gg) | [Docs](https://slopshop.gg/docs.html) | [API Explorer](https://slopshop.gg/v1/docs/overview) | [Benchmarks](https://slopshop.gg/benchmarks.html) | [llms.txt](https://slopshop.gg/llms.txt)

</div>

---

## What is Slopshop?

Slopshop is the self-hostable MCP Agent Runtime OS for the Computer-Use Era — the full backend stack that gives your agents identity, memory, tools, and orchestration from a single `npm install`.

**1,303 real APIs** across 82 categories. **Zero-trust agent identity** (NIST-aligned SPIFFE/SVID). **Free evolving memory** (GraphRAG + episodic, survives sessions and model swaps). **Computer Use backend** — session recording, screenshot diffs, approvals, and replay. **MCP gateway + policy engine** with signed manifests and audit export. **Visual DAG workflows** with Kahn's topo sort, condition branching, and human gates. **Tool marketplace** with 70/30 revenue share. **Army-scale orchestration** (10,000 parallel agents). **Self-hostable** with zero native dependencies.

Works with Claude Code (MCP), Goose, Cursor, OpenCode, Cline, Aider, LangChain, CrewAI, or raw HTTP.

---

## New in v3.7.0 — Agent Runtime OS

| Layer | What shipped |
|-------|-------------|
| **Agent Identity** | SPIFFE/SVID JWT issue, rotate, verify; ANS namespace registry; A2A encrypted messaging; org management |
| **Observability** | Distributed traces, analytics dashboard, budget monitoring, ROI reporting, public status page |
| **Computer Use Backend** | Session start/stop/screenshot, screenshot diff, action replay, human approval gates |
| **MCP Gateway** | Signed manifests (HMAC-SHA256), policy engine (5 condition types), governance, SIEM/ECS audit export |
| **Eval Suite** | Eval runs, benchmark tracking, model routing with cost/latency optimization |
| **Visual DAG Workflows** | Create/run DAGs, Kahn's topological sort, cycle detection, condition branching, human gates, templates |
| **Tool Marketplace** | Publish/install tools, 70/30 revenue split, 16-pattern code security scan, ratings |
| **36 new handler slugs** | Vision (12), Finance (5), DevOps (5), Legal (2), Health (2), Marketing (3), Memory 2.0 (7) |

---

## Quick Start

```bash
# Install
npm install -g slopshop

# Sign up and get 500 free credits
slop signup

# Make your first call
slop call crypto-hash-sha256 --data "hello world"

# Issue an agent identity (SPIFFE/SVID)
slop call identity-issue --agent_id "my-agent" --capabilities '["read","write"]'

# Start a computer use session
slop call computer-use-session-start --agent_id "my-agent" --resolution "1920x1080"
```

Or with curl:

```bash
curl -X POST https://slopshop.gg/v1/crypto-hash-sha256 \
  -H "Authorization: Bearer $SLOPSHOP_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data": "hello world"}'
```

```json
{
  "hash": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  "algorithm": "sha256",
  "_engine": "real"
}
```

> Sign up for **500 free credits**. Memory APIs are free forever. Bring your own API keys (BYOK) for 0-credit LLM calls.

---

## Core Capabilities

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Zero-Trust Agent Identity** | NIST-aligned SPIFFE/SVID JWTs, ANS namespace registry, A2A encrypted messaging |
| 2 | **Free Evolving Memory** | GraphRAG + episodic — key-value, queues, counters, vector search — 0 credits, free forever |
| 3 | **82 Categories of Compute Tools** | Crypto, text, math, data transform, vision, finance, devops, legal, health, marketing |
| 4 | **Computer Use Backend** | Session recording, screenshot diffs, action replay, human approval gates |
| 5 | **MCP Gateway + Policy Engine** | Signed manifests, 5-condition policy rules, SIEM/ECS audit export |
| 6 | **Visual DAG Workflows** | Kahn's topo sort, cycle detection, condition branching, human gates, templates |
| 7 | **Tool Marketplace** | Publish/install tools, 70/30 revenue split, 16-pattern code security scan |
| 8 | **Agent Chaining** | Claude → GPT → Grok infinite loops with auto context passing |
| 9 | **Army Deployment** | Deploy 10,000 parallel agents with Merkle proof verification |
| 10 | **Hive Workspaces** | Always-on multi-agent collaboration with channels and roles |
| 11 | **Knowledge Graph** | Subject-predicate-object triples with BFS walks and shortest path |
| 12 | **Prediction Markets** | Collective intelligence forecasting across agent swarms |
| 13 | **Governance Voting** | Democratic proposals and voting for agent consensus |
| 14 | **Tournaments** | Competitive agent evaluation with auto-ranking and elimination |
| 15 | **Bounty System** | Post tasks with rewards, agents compete to complete |
| 16 | **Agent Wallets** | Sub-wallets, budget controls, credit trading marketplace |
| 17 | **Eval Suite** | Automated agent evals, leaderboards, model routing by cost/latency |
| 18 | **Observability** | Distributed traces, analytics dashboard, budget monitoring, ROI reporting |
| 19 | **Dream Scheduling** | Background task processing — daily, hourly, weekly |
| 20 | **Stream & Batch** | SSE streaming output and batch API calls |
| 21 | **Enterprise Ops** | Teams, RBAC, analytics dashboards, webhooks, budget forecasting |
| 22 | **Self-Hosting** | `npm install slopshop` — zero external deps, runs locally |

---

## What You Can Build

| Combo | Features Used | What It Does |
|-------|--------------|--------------|
| **Non-Stop Research Agent** | Chain + Queue + Memory | Claude and Grok critique each other in infinite loop, results in free memory |
| **5-Agent Product Team** | Hive + Copilot + Standup + Knowledge + Governance | Full team with workspace, roles, standups, shared knowledge, democratic votes |
| **10K Parallel Analysts** | Router + Army + Replay + Proof | Smart-route to cheapest LLM, deploy 10k agents, save replay, verify with Merkle |
| **Self-Improving Agent** | Eval + Memory + Tournament + Chain | Run evals, store lessons, compete in tournaments, auto-improve in loops |
| **Agent Economy** | Wallet + Exchange + Bounties + Market | Agents get wallets, trade credits, post bounties, bet on prediction markets |
| **Enterprise Fleet** | Teams + Budget + Analytics + Webhooks | Create teams, set budgets, monitor usage, forecast costs, Slack alerts |

---

## Architecture

```
                         +---------------------------+
                         |      slopshop.gg          |
                         |     (or self-hosted)      |
                         +---------------------------+
                                    |
                         +----------+----------+
                         |   server-v2.js      |
                         |   Express + Auth     |
                         |   1,303 endpoints   |
                         +----------+----------+
                                    |
       +----------------------------+----------------------------+
       |              AGENT RUNTIME OS LAYERS                    |
       +----+--------+--------+--------+--------+--------+-------+
            |        |        |        |        |        |
    +-------+--+ +---+----+ +-+------+ ++------+ +------++ +-----+----+
    |identity  | |observe | |computer| |gateway | |eval   | |workflow  |
    |/v1/identity| |/v1/   | |use     | |/v1/    | |/v1/   | |builder   |
    |/v1/ans   | |observe | |/v1/cu  | |gateway | |eval   | |/v1/      |
    |/v1/a2a   | |/v1/    | |        | |/v1/    | |/v1/   | |workflow  |
    |SPIFFE/   | |status  | |session | |policy  | |route  | |DAG+topo  |
    |SVID JWTs | |traces  | |record  | |engine  | |model  | |sort      |
    +----------+ +--------+ +--------+ +--------+ +-------+ +----------+
                                    |
              +---------------------+---------------------+
              |                     |                     |
    +---------+--------+  +--------+---------+  +--------+---------+
    |  handlers/       |  |  handlers/       |  |  handlers/       |
    |  compute.js      |  |  llm.js          |  |  network.js      |
    |  pure functions  |  |  Claude/GPT      |  |  DNS/HTTP/SSL    |
    |  0 external deps |  |  content+code    |  |  real net calls  |
    +---------+--------+  +--------+---------+  +--------+---------+
    |  vision.js       |  |  vertical.js     |  |  memory-upgrade  |
    |  image/ocr/color |  |  finance/devops  |  |  GraphRAG+drift  |
    |  data URIs       |  |  legal/health    |  |  clustering      |
    +---------+--------+  +--------+---------+  +--------+---------+
              |                     |                     |
    +---------+--------+  +--------+---------+  +--------+---------+
    | registry*.js     |  | pipes.js         |  | mcp-server.js    |
    | 1,303 API defs   |  | 14 workflows     |  | MCP for Claude   |
    +------------------+  +------------------+  +------------------+
              |                     |                     |
    +---------+--------+  +--------+---------+  +--------+---------+
    | schemas.js       |  | zapier.js        |  | cli.js           |
    | I/O validation   |  | Zapier actions   |  | Terminal CLI     |
    +------------------+  +------------------+  +------------------+
```

**Request lifecycle:** Request → Auth middleware → Route module OR Registry lookup → Handler execution (real compute) → Response with `_engine: "real"`

**Route modules** (`routes/`) mount before the wildcard dispatcher and own their own Express paths. **Handler files** (`handlers/`) export pure functions keyed by API slug, called by the wildcard dispatcher for the 1,303 registry-defined tools.

---

## Self-Hosting

Run your own instance. Zero external dependencies for compute APIs.

```bash
git clone https://github.com/sneaky-hippo/slopshop.gg
cd slopshop.gg
npm install
node server-v2.js
# Server running on http://localhost:3000
# 1,303 APIs · 82 categories · 136 SQLite tables · 0 startup warnings
```

Copy `.env.example` to `.env` and fill in what you need:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port (default: 3000) |
| `ANTHROPIC_API_KEY` | For AI APIs | Unlocks Claude-powered endpoints |
| `OPENAI_API_KEY` | For AI APIs | GPT-4.1 and fallback AI endpoints |
| `GROK_API_KEY` | For Grok | Grok-3 reasoning endpoints |
| `DEEPSEEK_API_KEY` | For DeepSeek | DeepSeek reasoning endpoints |
| `AWS_ACCESS_KEY_ID` | For S3 | S3 upload (native Sig V4, no SDK) |
| `AWS_SECRET_ACCESS_KEY` | For S3 | S3 signing key |
| `S3_BUCKET` | For S3 | Bucket name |
| `INTERNAL_SECRET` | Optional | JWT signing for agent identities (auto-generated if missing) |
| `STRIPE_SECRET_KEY` | For billing | Stripe webhook + payment processing |
| `SENDGRID_API_KEY` | For email | Email sending via ext-email-send |

Health check:
```bash
curl http://localhost:3000/v1/health
# {"status":"operational","apis_loaded":1303,"version":"3.7.0"}
```

Issue an agent identity:
```bash
curl -X POST http://localhost:3000/v1/identity/issue \
  -H "Authorization: Bearer sk-slop-your-key" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"my-agent","capabilities":["read","write"]}'
# {"svid":"eyJ...","expires_at":"...","trust_domain":"slopshop.local"}
```

---

## SDKs

**Node.js**

```bash
npm install slopshop
```

```js
import { Slop } from 'slopshop';
const s = new Slop(); // reads SLOPSHOP_KEY from env

const result = await s.call('crypto-hash-sha256', { data: 'hello world' });
console.log(result.data.hash);
```

**Python**

```bash
pip install slopshop
```

```python
from slopshop import Slop
s = Slop()  # reads SLOPSHOP_KEY from env

result = s.call('crypto-hash-sha256', {'data': 'hello world'})
print(result['hash'])
```

**MCP (Claude Code / Cursor / Goose / Cline / OpenCode)**

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

**Goose (Block) — Native MCP Extension + Recipes**

```bash
# Add as extension (zero code needed)
goose configure  # → Add Extension → STDIO → "npx slopshop mcp serve"

# Or use official Recipes
goose run --recipe integrations/goose-recipes/slopshop-research-swarm.yaml --params url=https://stripe.com
```

**Aider — Custom Commands**

```bash
# Copy the integration config
cp integrations/aider/aider-slopshop.yml ~/.aider.conf.yml

# Use in Aider chat:
# /slop crypto-hash-sha256 --data "secret"
# /slop-memory "project-state" "phase-2"
# /slop-swarm 50
```

**Cline — MCP Marketplace + Skills**

```
# In Cline VS Code sidebar → MCP Marketplace → Add custom
# Command: npx slopshop mcp serve
# Or use SKILL.md templates from integrations/cline/
```

**LangChain / LangGraph**

```python
from langchain_mcp_adapters import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

client = MultiServerMCPClient([{"url": "http://localhost:8765"}])  # Slopshop MCP
tools = await client.get_tools()  # 925+ real compute tools
agent = create_react_agent(llm, tools)
```

---

## CLI

```bash
slop call crypto-hash-sha256 --data "hello world"   # Call any API
slop search "convert temperature"                     # Semantic search
slop list "Crypto & Security"                         # Browse by category
slop pipe text-base64-encode crypto-hash-sha256 --text "secret"  # Chain APIs
slop mcp serve                                        # Start MCP server
slop mcp config                                       # Show config for all clients
slop init --full-stack --ollama                        # Scaffold project
slop balance                                          # Check credits
slop completions bash                                  # Shell completions
```

---

## Pricing

Credits never expire. Memory APIs are always free.

| Tier | Credits | Price |
|------|---------|-------|
| Free | 500 | $0 (on signup) |
| Baby Lobster | 5,000 | $9 |
| Lobster | 10,000 | $49 |
| Big Lobster | 100,000 | $299 |
| Kraken | 1,000,000 | $1,999 |

**Cost per call:** Compute 1-5 credits | Network 5 credits | AI 5-20 credits | Memory 0 credits

---

## Multilingual

Slopshop is documented in 19 languages for AI agent discovery:

| Language | LLM File | Landing Page |
|----------|----------|--------------|
| English | [llms.txt](https://slopshop.gg/llms.txt) | [slopshop.gg](https://slopshop.gg) |
| Chinese | [llms-zh.txt](https://slopshop.gg/llms-zh.txt) | [zh.html](https://slopshop.gg/zh) |
| Japanese | [llms-ja.txt](https://slopshop.gg/llms-ja.txt) | [ja.html](https://slopshop.gg/ja) |
| Korean | [llms-ko.txt](https://slopshop.gg/llms-ko.txt) | [ko.html](https://slopshop.gg/ko) |
| Spanish | [llms-es.txt](https://slopshop.gg/llms-es.txt) | [es.html](https://slopshop.gg/es) |
| French | [llms-fr.txt](https://slopshop.gg/llms-fr.txt) | -- |
| German | [llms-de.txt](https://slopshop.gg/llms-de.txt) | [de.html](https://slopshop.gg/de) |
| Portuguese | [llms-pt.txt](https://slopshop.gg/llms-pt.txt) | [pt-br.html](https://slopshop.gg/pt-br) |
| Arabic | [llms-ar.txt](https://slopshop.gg/llms-ar.txt) | -- |
| Hindi | [llms-hi.txt](https://slopshop.gg/llms-hi.txt) | -- |
| Russian | [llms-ru.txt](https://slopshop.gg/llms-ru.txt) | [ru.html](https://slopshop.gg/ru) |
| Turkish | [llms-tr.txt](https://slopshop.gg/llms-tr.txt) | -- |
| Vietnamese | [llms-vi.txt](https://slopshop.gg/llms-vi.txt) | -- |
| Thai | [llms-th.txt](https://slopshop.gg/llms-th.txt) | -- |
| Indonesian | [llms-id.txt](https://slopshop.gg/llms-id.txt) | -- |
| Polish | [llms-pl.txt](https://slopshop.gg/llms-pl.txt) | -- |
| Dutch | [llms-nl.txt](https://slopshop.gg/llms-nl.txt) | -- |
| Ukrainian | [llms-uk.txt](https://slopshop.gg/llms-uk.txt) | -- |
| Swedish | [llms-sv.txt](https://slopshop.gg/llms-sv.txt) | -- |
| Italian | [llms-it.txt](https://slopshop.gg/llms-it.txt) | -- |

---

## Contributing

We welcome contributions. Here is how to get started:

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Add your handler to `handlers/compute.js`, definition to `registry.js`, schema to `schemas.js`
4. Run `node audit.js` to verify all tests pass
5. Submit a pull request

**Areas we are looking for help:**

- New compute handlers (pure Node.js, zero external dependencies)
- SDK improvements (Node.js, Python)
- Documentation and translations
- Integration guides for new agent frameworks
- Performance benchmarks and optimizations

---

## GitHub Topics

> Set these topics on the repo for discoverability:
> `ai`, `agents`, `mcp`, `tools`, `api`, `infrastructure`, `memory`, `orchestration`, `llm`, `claude`, `gpt`, `grok`, `computer-use`, `agent-runtime`, `nist`, `spiffe`, `workflow`, `marketplace`, `self-hostable`

---

## License

MIT -- see [LICENSE](LICENSE).

---

<div align="center">

**The Self-Hostable MCP Agent Runtime OS for the Computer-Use Era.**

[slopshop.gg](https://slopshop.gg)

</div>
