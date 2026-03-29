# Slopshop Chain Skill

Use Slopshop MCP for agent chaining and loops — pipe one agent's output into the next to build multi-step reasoning flows.

## When to use
- Breaking complex tasks into sequential agent steps
- Building reasoning chains where each step refines the previous
- Looping until a convergence condition is met
- Creating feedback loops (generate -> critique -> revise)

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-chain-create
Create a new agent chain with ordered steps.
```
call slop-chain-create with {steps: ["research", "analyze", "summarize"], input: "AI pricing trends"}
```

### slop-chain-status
Check progress of a running chain.
```
call slop-chain-status with {chain_id: "chain-abc123"}
```

### slop-chain-loop
Run a chain in a loop until a condition is met or max iterations reached.
```
call slop-chain-loop with {steps: ["draft", "critique"], max_iterations: 5, stop_when: "score > 0.9"}
```

### slop-chain-collect
Collect final output and intermediate results from a completed chain.
```
call slop-chain-collect with {chain_id: "chain-abc123"}
```

## Example usage
Build a research-then-write chain:
1. `slop-chain-create` with steps: research -> outline -> draft -> edit
2. `slop-chain-status` to monitor progress
3. `slop-chain-collect` to get the final polished output

## Best practices
- Keep chains under 10 steps to avoid context degradation
- Use loops for iterative refinement (draft/critique cycles)
- Store intermediate results in memory with `slop-memory-set`
- Combine with `slop-army-deploy` for parallel steps within a chain
