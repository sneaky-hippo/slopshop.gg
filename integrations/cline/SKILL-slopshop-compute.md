# Slopshop Compute Skill

Use Slopshop MCP for real deterministic compute operations. 925+ handlers across 78 categories.

## When to use
- Hashing, encryption, data transforms (real compute, not LLM estimation)
- Network operations (DNS, SSL, HTTP headers, redirects)
- Persistent memory across sessions
- Parallel agent swarms with Merkle verification
- PII detection and redaction

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Example usage
- Hash data: call `slop-crypto-hash-sha256` with `{data: "input"}`
- Store memory: call `slop-memory-set` with `{key: "name", value: "data"}`
- Search tools: call `slop-tools-search` with `{query: "convert temperature"}`
- Deploy swarm: call `slop-army-deploy` with `{task: "analyze", count: 50}`
