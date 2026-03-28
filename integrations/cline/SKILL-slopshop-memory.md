# Slopshop Memory Skill

Use Slopshop MCP for free persistent memory that survives across sessions, projects, and agents. Store, retrieve, search, and organize knowledge with zero cost and no expiration.

## When to use
- Storing research findings, decisions, or context that should persist across sessions
- Building a knowledge base that multiple agents or projects can access
- Semantic search across previously stored information
- Maintaining audit trails and decision logs
- Sharing context between different agent tools (Cline, Claude Code, Goose, etc.)

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Available tools

### slop-memory-set
Store a key-value pair in persistent memory. Values can be strings, JSON objects, or any serializable data.
```
call slop-memory-set with {key: "project/finding-1", value: "The API rate limits at 100 req/min"}
```

### slop-memory-get
Retrieve a specific memory entry by its key.
```
call slop-memory-get with {key: "project/finding-1"}
```

### slop-memory-search
Semantic search across all stored memories. Returns ranked results by relevance.
```
call slop-memory-search with {query: "rate limits"}
```

### slop-memory-list
List all memory keys, optionally filtered by prefix.
```
call slop-memory-list with {prefix: "project/"}
```

### slop-memory-delete
Remove a specific memory entry.
```
call slop-memory-delete with {key: "project/finding-1"}
```

## Best practices
- Use namespaced keys with forward slashes: `project-name/category/item`
- Store structured JSON for complex data: `{key: "audit/2026-03-29", value: {"findings": [...], "severity": "high"}}`
- Use semantic search when you do not remember the exact key
- Memory is scoped to your SLOPSHOP_KEY, so all your agents share the same memory pool
- No storage limits, no expiration, free forever
