# Slopshop Knowledge Skill

Use Slopshop MCP for knowledge graph operations — build, query, and traverse structured knowledge graphs that connect concepts, entities, and relationships.

## When to use
- Mapping relationships between concepts, people, or systems
- Building structured knowledge from unstructured research
- Querying complex multi-hop relationships
- Maintaining a project ontology that agents can reason over

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-knowledge-add
Add a node or edge to the knowledge graph.
```
call slop-knowledge-add with {subject: "React", predicate: "used_by", object: "slopshop-frontend"}
```

### slop-knowledge-query
Query the graph with pattern matching.
```
call slop-knowledge-query with {pattern: "? used_by slopshop-frontend"}
```

### slop-knowledge-traverse
Traverse the graph from a starting node following a path pattern.
```
call slop-knowledge-traverse with {start: "React", depth: 3, direction: "outbound"}
```

### slop-knowledge-subgraph
Extract a subgraph around a topic.
```
call slop-knowledge-subgraph with {center: "authentication", radius: 2}
```

### slop-knowledge-merge
Merge new triples into the graph, deduplicating automatically.
```
call slop-knowledge-merge with {triples: [["Node.js", "runs", "server"], ["Express", "framework_for", "Node.js"]]}
```

## Example usage
Map a codebase architecture:
1. `slop-knowledge-add` nodes for each module and their dependencies
2. `slop-knowledge-traverse` to find all downstream dependents of a module
3. `slop-knowledge-query` to answer "what uses the auth module?"

## Best practices
- Use consistent predicate names (snake_case) across your graph
- Graphs persist across sessions via your SLOPSHOP_KEY
- Combine with `slop-memory` for unstructured notes alongside structured graphs
