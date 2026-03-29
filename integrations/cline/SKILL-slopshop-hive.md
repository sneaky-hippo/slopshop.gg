# Slopshop Hive Skill

Use Slopshop MCP for Hive workspaces — shared collaborative environments where multiple agents work together with shared state, files, and communication channels.

## When to use
- Multi-agent collaboration on a shared project
- Creating persistent workspaces that agents can join and leave
- Real-time shared state between agents working on related tasks
- Coordinating specialized agents (researcher, coder, reviewer)

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-hive-create
Create a new Hive workspace with a name and configuration.
```
call slop-hive-create with {name: "project-alpha", agents: 5, shared_memory: true}
```

### slop-hive-join
Join an existing Hive workspace as an agent.
```
call slop-hive-join with {hive_id: "hive-abc123", role: "reviewer"}
```

### slop-hive-post
Post a message or artifact to the Hive shared channel.
```
call slop-hive-post with {hive_id: "hive-abc123", content: "Analysis complete", type: "artifact"}
```

### slop-hive-state
Read or update the shared state object for the Hive.
```
call slop-hive-state with {hive_id: "hive-abc123", action: "get"}
```

### slop-hive-list
List all active Hive workspaces.
```
call slop-hive-list with {}
```

## Example usage
Collaborative code review Hive:
1. `slop-hive-create` with roles: architect, coder, reviewer, tester
2. Each agent joins and posts artifacts to the shared channel
3. `slop-hive-state` tracks which files are reviewed, approved, or need changes

## Best practices
- Assign clear roles to each agent in the Hive
- Use shared state for coordination, shared channel for artifacts
- Hive workspaces persist until explicitly closed
- Combine with `slop-army-deploy` to populate a Hive with workers
