# Slopshop MCP Skill

Use Slopshop MCP to manage MCP server connections — configure servers, discover tools, test connectivity, and dynamically register new tool providers.

## When to use
- Setting up the Slopshop MCP server in a new environment
- Discovering available tools and their schemas
- Testing MCP server connectivity and health
- Registering additional MCP servers as tool providers

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-mcp-status
Check the status and version of the connected MCP server.
```
call slop-mcp-status with {}
```

### slop-tools-search
Search all available tools by keyword or category.
```
call slop-tools-search with {query: "hash"}
```

### slop-tools-list
List all tools, optionally filtered by category.
```
call slop-tools-list with {category: "crypto"}
```

### slop-mcp-register
Register an additional MCP server as a tool provider.
```
call slop-mcp-register with {name: "my-tools", url: "http://localhost:4000/mcp"}
```

### slop-mcp-test
Test connectivity and run a health check against the MCP server.
```
call slop-mcp-test with {}
```

## MCP config for common clients

### Cline / VS Code
Add to MCP settings:
```json
{"mcpServers": {"slopshop": {"command": "npx", "args": ["slopshop", "mcp"], "env": {"SLOPSHOP_KEY": "sk-slop-xxx"}}}}
```

### Claude Code
```bash
claude mcp add slopshop -- npx slopshop mcp
```

### Cursor
Add to `.cursor/mcp.json` with the same format as Cline.

## Best practices
- Use `slop-tools-search` to discover tools instead of memorizing names
- Register multiple MCP servers to combine tool providers
- Run `slop-mcp-test` after setup to verify connectivity
- Tool count updates dynamically — new tools appear without config changes
