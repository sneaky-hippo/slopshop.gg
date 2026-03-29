# Slopshop Pipe Skill

Use Slopshop MCP for multi-step workflow pipes — pre-built and custom pipelines that chain tools together with data flowing between steps automatically.

## When to use
- Running pre-built workflow templates (SEO audit, security scan, etc.)
- Building custom pipelines that chain multiple tools
- Automating repetitive multi-step processes
- Creating reusable workflow definitions

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-pipe-run
Execute a pre-built or custom pipe.
```
call slop-pipe-run with {pipe: "seo-audit", input: {url: "https://example.com"}}
```

### slop-pipe-list
List all available pre-built pipes.
```
call slop-pipe-list with {}
```

### slop-pipe-create
Define a custom pipe with ordered steps.
```
call slop-pipe-create with {name: "my-pipeline", steps: [
  {tool: "slop-network-headers", map: {url: "$input.url"}},
  {tool: "slop-network-ssl", map: {domain: "$input.domain"}},
  {tool: "slop-eval-assert", map: {value: "$prev.valid", assertions: [{"type": "equals", "expected": true}]}}
]}
```

### slop-pipe-status
Check the status of a running pipe execution.
```
call slop-pipe-status with {pipe_run_id: "run-abc123"}
```

## Example usage
Run a full security audit pipe:
1. `slop-pipe-list` to see available pipes
2. `slop-pipe-run` with pipe: "security-audit" and target URL
3. Results flow automatically: headers -> SSL -> DNS -> vulnerability check

## Best practices
- Use `$input` to reference pipe input, `$prev` for the previous step's output
- Save custom pipes for reuse across projects
- Combine pipes with `slop-chain` for conditional branching between pipes
- Pre-built pipes are optimized and tested — prefer them over manual tool chains
