# Slopshop Army Swarm Skill

Use Slopshop MCP to deploy parallel agent swarms with Merkle-verified results. Launch multiple agents that work simultaneously on a task, then collect and verify their outputs cryptographically.

## When to use
- Parallelizing research across multiple sources or angles
- Running the same analysis with different parameters simultaneously
- Verifying results by having multiple independent agents confirm findings
- Large-scale data processing that benefits from parallel execution
- Any task where speed matters and work can be divided

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Available tools

### slop-army-deploy
Deploy a swarm of parallel agents to work on a task. Each agent runs independently and results are Merkle-verified.
```
call slop-army-deploy with {task: "Research competitor pricing", count: 10}
```

### slop-army-status
Check the status of a running swarm deployment.
```
call slop-army-status with {army_id: "army-abc123"}
```

### slop-army-collect
Collect results from a completed swarm. Returns all agent outputs with their Merkle proofs.
```
call slop-army-collect with {army_id: "army-abc123"}
```

### slop-army-verify
Verify the Merkle proof of a swarm result to confirm no results were tampered with.
```
call slop-army-verify with {army_id: "army-abc123", merkle_root: "sha256-..."}
```

### slop-army-cancel
Cancel a running swarm deployment.
```
call slop-army-cancel with {army_id: "army-abc123"}
```

## How Merkle verification works
1. Each agent in the swarm produces an output.
2. Each output is hashed with SHA-256.
3. Hashes are combined into a Merkle tree.
4. The Merkle root provides a single hash that verifies all results.
5. Any tampering with any single result changes the root hash, making it detectable.

## Example workflows

### Parallel research
Deploy 5 agents to research different aspects of a topic, then merge findings:
```
1. call slop-army-deploy with {task: "Research AI agent frameworks", count: 5, subtasks: ["architecture", "pricing", "adoption", "limitations", "roadmap"]}
2. call slop-army-collect with {army_id: "army-abc123"}
3. call slop-army-verify with {army_id: "army-abc123"}
4. Merge verified results into a comprehensive report
```

### Consensus verification
Deploy 3 agents to independently answer the same question, then compare:
```
1. call slop-army-deploy with {task: "Calculate optimal batch size for this workload", count: 3, mode: "consensus"}
2. call slop-army-collect with {army_id: "army-abc123"}
3. Compare results — if all 3 agree, high confidence; if they diverge, investigate
```

## Best practices
- Use swarm sizes of 3-5 for verification tasks (odd numbers break ties)
- Use swarm sizes of 10-50 for parallel research or processing
- Always verify Merkle proofs before trusting swarm results
- Store swarm results in persistent memory for future reference
- Combine with Hive workspaces for multi-stage collaborative workflows
