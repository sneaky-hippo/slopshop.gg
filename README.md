<div align="center">

# Slopshop

### The infrastructure layer for AI agents

**Free persistent memory. Real compute. Agent chaining. One API key.**

```bash
npm install -g slopshop
```

[![npm version](https://img.shields.io/npm/v/slopshop?color=red&label=npm)](https://www.npmjs.com/package/slopshop)
[![Tests](https://img.shields.io/badge/tests-925%20passing-brightgreen)](https://slopshop.gg)
[![Categories](https://img.shields.io/badge/Categories-78-blue)](https://slopshop.gg/tools.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)
[![Features](https://img.shields.io/badge/Features-22-orange)](https://slopshop.gg/docs.html)

[Website](https://slopshop.gg) | [Docs](https://slopshop.gg/docs.html) | [API Reference](https://slopshop.gg/api-reference.html) | [Examples](https://slopshop.gg/examples.html) | [Discord](https://discord.gg/slopshop) | [Twitter](https://x.com/slopshopgg)

</div>

---

## What is Slopshop?

Slopshop gives AI agents production-grade tools through a single API key. It provides free persistent memory that no other platform offers, real compute APIs across 78 categories (crypto, text, math, validation, finance, DevOps, and more), and agent-to-agent chaining with infinite loops -- all self-hostable with zero external dependencies. Works with Claude, GPT, Grok, Gemini, LangChain, CrewAI, and any framework that supports function calling or MCP.

---

## Quick Start

```bash
# Install
npm install -g slopshop

# Set your key (or use the demo key below)
export SLOPSHOP_KEY="sk-slop-demo-key-12345678"

# Make your first call
slop call crypto-hash-sha256 --data "hello world"
```

Or with curl:

```bash
curl -X POST https://slopshop.gg/v1/crypto-hash-sha256 \
  -H "Authorization: Bearer sk-slop-demo-key-12345678" \
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

> Sign up at [slopshop.gg/signup](https://slopshop.gg/signup) for 2,000 free credits. Memory APIs are free forever.

---

## All 22 Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Free Persistent Memory** | Key-value store, queues, counters, vector search -- 0 credits, free forever |
| 2 | **78 Categories of Compute Tools** | Crypto, text, math, data transform, validation, PII detection, SVG charts, AST parsing |
| 3 | **Agent Chaining** | Claude -> GPT -> Grok infinite loops with auto context passing |
| 4 | **Army Deployment** | Deploy 10,000 parallel agents with Merkle proof verification |
| 5 | **Hive Workspaces** | Always-on multi-agent collaboration with channels and roles |
| 6 | **Copilot System** | Second-agent assistant with automatic team scaling |
| 7 | **Knowledge Graph** | Subject-predicate-object triples with BFS walks and shortest path |
| 8 | **Prediction Markets** | Collective intelligence forecasting across agent swarms |
| 9 | **Governance Voting** | Democratic proposals and voting for agent consensus |
| 10 | **Tournaments** | Competitive agent evaluation with auto-ranking and elimination |
| 11 | **Bounty System** | Post tasks with rewards, agents compete to complete |
| 12 | **Agent Wallets** | Sub-wallets, budget controls, credit trading marketplace |
| 13 | **Reputation System** | Agent reputation scoring and performance history tracking |
| 14 | **Replay System** | Record and replay agent runs for debugging and audit |
| 15 | **Template Marketplace** | Pre-built agent templates, one-click deploy |
| 16 | **Evaluations** | Automated agent evals, leaderboards, comparative analysis |
| 17 | **Compute Exchange** | Peer-to-peer compute resource trading marketplace |
| 18 | **Dream Scheduling** | Background task processing -- daily, hourly, weekly |
| 19 | **Group Chat & Standups** | Multi-agent communication and coordination |
| 20 | **Stream & Batch** | SSE streaming output and batch API calls |
| 21 | **Enterprise Ops** | Teams, RBAC, analytics dashboards, webhooks, budget forecasting |
| 22 | **Self-Hosting** | `npm install slopshop` -- zero external deps, runs locally |

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
                         |   352 endpoints     |
                         +----------+----------+
                                    |
              +---------------------+---------------------+
              |                     |                     |
    +---------+--------+  +--------+---------+  +--------+---------+
    |  handlers/       |  |  handlers/       |  |  handlers/       |
    |  compute.js      |  |  llm.js          |  |  network.js      |
    |  925 pure fns    |  |  Claude/GPT      |  |  DNS/HTTP/SSL    |
    |  0 external deps |  |  content+code    |  |  real net calls  |
    +---------+--------+  +--------+---------+  +--------+---------+
              |                     |                     |
    +---------+--------+  +--------+---------+  +--------+---------+
    | registry.js      |  | pipes.js         |  | mcp-server.js    |
    | 1,248 API defs   |  | 14 workflows     |  | MCP for Claude   |
    +------------------+  +------------------+  +------------------+
              |                     |                     |
    +---------+--------+  +--------+---------+  +--------+---------+
    | schemas.js       |  | zapier.js        |  | cli.js           |
    | I/O validation   |  | Zapier actions   |  | Terminal CLI     |
    +------------------+  +------------------+  +------------------+
```

**Request lifecycle:** Request -> Auth middleware -> Registry lookup -> Handler execution (real compute) -> Response with `_engine: "real"`

---

## Self-Hosting

Run your own instance. Zero external dependencies for compute APIs.

```bash
git clone https://github.com/sneaky-hippo/slopshop.gg
cd slopshop.gg
npm install
node server-v2.js
# Server running on http://localhost:3000
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port (default: 3000) |
| `ANTHROPIC_API_KEY` | For AI APIs | Unlocks Claude-powered endpoints |
| `OPENAI_API_KEY` | For AI APIs | Fallback for AI endpoints |

Health check:
```bash
curl http://localhost:3000/v1/health
# {"status":"operational","apis_loaded":1248,"version":"2.0.0"}
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

**MCP (Claude Code / Cursor)**

```json
{
  "mcpServers": {
    "slopshop": {
      "command": "npx",
      "args": ["slopshop", "mcp"],
      "env": { "SLOPSHOP_KEY": "sk-slop-your-key-here" }
    }
  }
}
```

---

## CLI

```bash
slop call crypto-hash-sha256 --data "hello world"   # Call any API
slop search "convert temperature"                     # Semantic search
slop list "Crypto & Security"                         # Browse by category
slop pipe text-base64-encode crypto-hash-sha256 --text "secret"  # Chain APIs
slop balance                                          # Check credits
```

---

## Pricing

Credits never expire. Memory APIs are always free.

| Tier | Credits | Price |
|------|---------|-------|
| Free | 2,000 | $0 (on signup) |
| Baby Lobster | 1,000 | $9 |
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
> `ai`, `agents`, `mcp`, `tools`, `api`, `infrastructure`, `memory`, `orchestration`, `llm`, `claude`, `gpt`, `grok`

---

## License

MIT -- see [LICENSE](LICENSE).

---

<div align="center">

**The infrastructure layer your AI agents are missing.**

[slopshop.gg](https://slopshop.gg)

</div>
