# Strat 2 Implementation Checklist

## Phase 1: Quick Wins (0-2 Weeks)
- [ ] Native Ollama Integration: POST /v1/models/ollama endpoint
- [ ] Auto-detect local Ollama models + context sizes
- [ ] Route /v1/agent/run through Ollama when model specified
- [ ] SDK: client.ollama.call(model, task, namespace)
- [ ] vLLM Production Endpoint: POST /v1/models/vllm
- [ ] llama.cpp edge support (bonus)
- [ ] "Ollama + Slopshop" landing page + blog post

## Phase 2: Agent Framework Domination (2-6 Weeks)
- [ ] LangGraph Official SDK (slopshop-langgraph npm/pip)
- [ ] SlopToolNode auto-wraps any slug
- [ ] Persistent checkpoints via memory APIs
- [ ] CrewAI deep wrapper (role-based memory namespaces)
- [ ] AutoGen wrapper
- [ ] Vector DB pluggable backends (Qdrant primary)
- [ ] Config: memory_backend: "qdrant://localhost:6333"
- [ ] Hybrid mode: fallback to SQLite

## Phase 3: Enterprise Scale (6-12 Weeks)
- [ ] Langfuse observability exporter
- [ ] Helicone integration
- [ ] Kubernetes Operator + Helm Chart
- [ ] RunPod/Vast.ai marketplace deployments
- [ ] Grok native: /v1/models/grok with reasoning hints
- [ ] DeepSeek/Qwen3/MiniMax auto-routing
- [ ] Continue.dev MCP support
- [ ] Gemini CLI support

## Phase 4: Moonshots (3-6+ Months)
- [ ] WebAssembly browser runtime
- [ ] TinyML orchestration
- [ ] SOC 2 Type II completion
- [ ] HIPAA acceleration
- [ ] Blockchain wallet + agent economy
- [ ] Self-improving evals UI

## Backend Wirings to Complete
- [ ] Army deploy: true parallel with Merkle tree verification
- [ ] Replay system: stream sub-results with proof paths
- [ ] Governance: hive voting + standups working end-to-end
- [ ] Eval/Run + Tournament system
- [ ] Wallet economy: bounties, markets, credit trading, exchange
- [ ] Knowledge graph: /knowledge/add working
- [ ] Pipes: prebuilt + custom
- [ ] Advanced queues + prompt queue
- [ ] Webhooks working end-to-end
- [ ] Smart router with model-specific hints
- [ ] Enterprise teams/budgets

## Immediate (Today)
- [ ] Fix pricing consistency (500 everywhere)
- [ ] Fix GitHub URL (create github.com/slopshop/slopshop or update refs)
- [ ] npm publish 3.7.0
- [ ] Verify Stripe env vars on Railway
- [ ] Top up demo key
- [ ] Run full deployment verification
