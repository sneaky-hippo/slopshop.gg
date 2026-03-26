# Slopshop Development Guide

This project is Slopshop - an API platform with 1,244 real tools across 287 endpoints.

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

- `server-v2.js` - Express server, routes, auth, SQLite persistence
- `registry.js` - API definitions (slug, name, desc, credits, tier)
- `schemas.js` - Input/output schemas for each API
- `handlers/compute.js` - Pure compute handlers (no external deps)
- `handlers/llm.js` - AI handlers (need ANTHROPIC_API_KEY)
- `handlers/network.js` - Network handlers (DNS, HTTP, SSL)
- `handlers/external.js` - External service handlers (Slack, GitHub, etc.)
- `zapier.js` - Zapier integration endpoints
- `pipes.js` - Pre-built workflow pipes
- `mcp-server.js` - MCP server for Claude Code
- `cli.js` - CLI tool

## Adding a new API

1. Add handler to `handlers/compute.js` (or appropriate handler file)
2. Add definition to `registry.js` in `API_DEFS`
3. Add schema to `schemas.js` in `SCHEMAS`
4. Restart server and test
