# Slopshop Ollama Skill

Use Slopshop MCP to interact with local LLMs via Ollama — run inference, manage models, and build hybrid local/cloud AI workflows.

## When to use
- Running inference on local models for privacy-sensitive tasks
- Using small local models for fast classification or extraction
- Managing Ollama model lifecycle (pull, list, delete)
- Building hybrid workflows: local model for triage, cloud for complex tasks

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`
- Requires: Ollama running locally (`ollama serve`)

## Key tools

### slop-ollama-generate
Run inference on a local Ollama model.
```
call slop-ollama-generate with {model: "llama3", prompt: "Classify this text: ..."}
```

### slop-ollama-chat
Multi-turn chat with a local model.
```
call slop-ollama-chat with {model: "llama3", messages: [{"role": "user", "content": "Summarize this..."}]}
```

### slop-ollama-list
List all locally available models.
```
call slop-ollama-list with {}
```

### slop-ollama-pull
Download a new model from the Ollama registry.
```
call slop-ollama-pull with {model: "codellama:7b"}
```

### slop-ollama-embeddings
Generate embeddings from a local model.
```
call slop-ollama-embeddings with {model: "nomic-embed-text", input: "text to embed"}
```

## Example usage
Privacy-safe document processing:
1. `slop-ollama-list` to check available models
2. `slop-ollama-generate` to classify or extract from sensitive documents locally
3. Store results with `slop-memory-set` — data never leaves your machine

## Best practices
- Use small models (7B) for fast classification, larger models for generation
- Local models are zero-cost — no credits consumed
- Combine with cloud tools for hybrid workflows (local triage, cloud analysis)
- Embeddings from Ollama can feed into `slop-knowledge` graph operations
