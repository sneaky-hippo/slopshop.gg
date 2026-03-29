# Slopshop Army Skill

Use Slopshop MCP to deploy parallel agent armies at scale. Launch dozens or hundreds of agents simultaneously with task distribution and result aggregation.

## When to use
- Massively parallel data processing or analysis
- Distributing workload across many agents with different configs
- Load testing or stress testing scenarios
- Any task that benefits from horizontal scaling

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-army-deploy
Deploy an army of agents with a shared task or individual subtasks.
```
call slop-army-deploy with {task: "Audit security headers", count: 50, targets: ["site1.com", "site2.com", ...]}
```

### slop-army-scale
Dynamically scale a running army up or down.
```
call slop-army-scale with {army_id: "army-abc123", count: 100}
```

### slop-army-broadcast
Send a message or updated instructions to all running agents.
```
call slop-army-broadcast with {army_id: "army-abc123", message: "Focus on critical severity only"}
```

### slop-army-collect
Collect and aggregate results from all agents with Merkle verification.
```
call slop-army-collect with {army_id: "army-abc123", format: "summary"}
```

## Example usage
Audit 200 URLs for SSL issues:
1. `slop-army-deploy` with count: 200, one URL per agent
2. `slop-army-status` to watch progress
3. `slop-army-collect` to get aggregated findings

## Best practices
- Use `mode: "distribute"` to split a list across agents automatically
- Set `timeout` per agent to prevent runaway costs
- Combine with `slop-chain` for multi-phase army operations
- Always verify results with Merkle proofs before acting on them
