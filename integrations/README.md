# Slopshop Ecosystem Integrations

Official integrations for every major AI agent framework and CLI tool. Slopshop's MCP server (`slop mcp serve`) is the universal entry point — it works with any MCP-compatible client out of the box.

## Quick Start (Universal MCP)

```bash
npm install -g slopshop
export SLOPSHOP_KEY=sk-slop-your-key-here
slop mcp serve  # STDIO mode — works with Goose, Cursor, Claude Desktop, Cline, etc.
```

Or show config for any specific client:
```bash
slop mcp config
```

---

## Goose (Block) — Native MCP + Recipes

Goose treats every extension as an MCP server. Zero code needed.

**Add as extension:**
```
goose configure → Add Extension → STDIO → "npx slopshop mcp serve"
```

**Use official Recipes:**
```bash
goose run --recipe integrations/goose-recipes/slopshop-research-swarm.yaml --params url=https://stripe.com
goose run --recipe integrations/goose-recipes/slopshop-security-sweep.yaml --params domain=example.com
```

Available Recipes:
- `slopshop-research-swarm.yaml` — Research URL with optional parallel verification
- `slopshop-security-sweep.yaml` — DNS, SSL, HTTP headers, redirect chain audit
- `slopshop-code-audit.yaml` — PII detection, integrity hashing, sandbox execution
- `slopshop-hive-collab.yaml` — Multi-agent Hive workspace with shared memory
- `slopshop-credit-pipeline.yaml` — Automated credit earning via compute sharing

---

## Aider — Custom Commands

Copy the integration config to your home directory:
```bash
cp integrations/aider/aider-slopshop.yml ~/.aider.conf.yml
```

Then in Aider chat:
```
/slop crypto-hash-sha256 --data "secret"     # Call any handler
/slop-memory "project-state" "phase-2"        # Persistent memory
/slop-swarm 50                                 # Launch verification swarm
/slop-search "convert temperature"             # Find the right tool
/slop-credit                                   # Check balance
```

---

## OpenCode — Plugin Config

Add to your `opencode.json`:
```json
{
  "plugins": ["@slopshop/opencode-plugin"]
}
```

Or use the MCP server directly. See `integrations/opencode/opencode-slopshop.json` for the full plugin definition.

---

## Cline — MCP Marketplace + Skills

**MCP Marketplace:**
In Cline VS Code sidebar → MCP Marketplace → Add custom → command: `npx slopshop mcp serve`

**Skills (SKILL.md templates):**
- `SKILL-slopshop-compute.md` — 1,273+ real compute handlers (hash, crypto, data transforms, network)
- `SKILL-slopshop-memory.md` — Free persistent memory across sessions
- `SKILL-slopshop-swarm.md` — Army Mode parallel agents with Merkle verification

Copy Skills to your project's `.cline/skills/` directory.

---

## Claude Desktop / Cursor / VS Code Copilot

Add to your MCP settings:
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

---

## LangChain / LangGraph

```python
from langchain_mcp_adapters import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

client = MultiServerMCPClient([{"url": "http://localhost:8765"}])
tools = await client.get_tools()  # 1,273+ real compute tools + memory + swarms
agent = create_react_agent(llm, tools)
```

Or use the Python SDK directly:
```python
from slopshop import Slop
s = Slop()
result = s.call('crypto-hash-sha256', {'data': 'hello world'})
```

---

## CrewAI

```python
from slopshop.integrations.crewai import SlopshopCrewTools
tools = SlopshopCrewTools(api_key="sk-slop-...").get_tools()

from crewai import Agent
researcher = Agent(role="Researcher", tools=tools)
```

---

## Project Scaffolding

Initialize a new Slopshop-powered project:
```bash
slop init                              # Basic setup
slop init --full-stack --ollama        # Full stack with Docker + Ollama
slop init --goose                       # Include Goose Recipe template
```

This creates `.slopshop/mcp.json`, `.env`, and optional `docker-compose.yml` and `recipe.yaml`.
