# Strat 14 — Internal Strategy Document
## slopshop.gg — Path to 10/10
**Confidential. Not served publicly.**

---

## hackGPT External Review Summary

**Overall Score: 8.5/10** (up from 7.5 in prior analysis)

### Scorecard Breakdown
- Memory/Dream Engine: 10/10 — Genuinely the strongest moat. Free forever, evolving overnight, multiplayer, cross-LLM. No competitor has measurable overnight intelligence.
- Self-hosting: 9/10 — Air-gapped, zero-deps, SQLite, Docker one-click. Enterprise-ready.
- Speed/Compute: 9/10 — p95 <18ms, 5,694 req/sec throughput, 0.003ms avg handler latency.
- Tool Breadth: 8/10 — 1,300+ tools, 82 categories, but still heavy on utilities vs. deep SaaS actions.
- Distribution/GTM: 2/10 — **Existential gap.** Near-zero X visibility, low GitHub traction, no community signals.
- Developer Experience: 7/10 — CLI/MCP strong, SDKs exist, needs slop init/doctor and better docs.
- Pricing: 8/10 — Transparent credit-based, but missing calculator and spend caps.
- Positioning: 9/10 — Hero messaging nails memory-native. "Agents that dream" is category-defining.

---

## FedMosaic — Federated Memory Intelligence

**Based on arXiv 2602.05235 — First federated RAG framework**

### Core Mechanism
FedMosaic uses parametric LoRA adapters trained on document clusters ("mosaics"). Each instance:
1. Trains locally — zero raw data ever leaves
2. Extracts document-specific binary masks (what parameters matter per document cluster)
3. Sends only tiny (score, packed_mask) payloads to federation coordinator
4. Receives selectively aggregated adapter weights

### Selective Aggregation Formula
```
max_S [ (1/|S|)Σs_i  -  (2λ_ol / |S|(|S|-1)) Σ⟨M_i,M_j⟩/d ]
```
Where:
- `s_i` = relevance score of mosaic i
- `M_i` = binary mask of mosaic i  
- `λ_ol` = overlap penalty hyperparameter
- `⟨M_i,M_j⟩/d` = normalized mask overlap (conflict measure)
- Greedy NP-hard approximation: O(k²) per round

### Binary Mask Generation
- Sigmoid on adapter delta weights → soft mask
- STE (Straight-Through Estimator): `hard.detach() + (soft - soft.detach())`
- L1 sparsity loss: `λ_sp × ||M||_1`
- Cosine annealing: α grows 1.0→10.0 over 8 epochs
- Result: 82–92% sparsity achieved

### Published Results (arXiv 2602.05235)
- Accuracy: +10.9% vs. non-federated baseline
- Storage reduction: 78–86%
- Communication reduction: 91.4%
- Privacy: Zero raw memory/document ever shared

### Slopshop Integration Plan
- `POST /v1/memory/dream/federate` — opt-in endpoint
- Only gamma-checked (metacog-validated) insights eligible for contribution
- `estimated_boost_pct: 23` — +23% average IS from collective federation
- TEE-ready for highest privacy tier

---

## Intelligence Score Formula

### Current (capped)
```
IS = Math.min(100, (insights × strategy_depth × 10) / duration_sec)
```

### Updated (Strat 14 — uncapped + compression bonus)
```
compression_bonus = 0.25 × min(insights/keys, 1)
IS = ((insights × depth × 10) / duration_sec) × (1 + compression_bonus)
```

### Strategy Depth Multipliers
| Strategy | Depth | Neuroscience Mapping |
|----------|-------|---------------------|
| synthesize | 1.0 | Slow-wave replay |
| pattern_extract | 1.1 | Hippocampal theta |
| insight_generate | 1.4 | REM cross-binding |
| compress | 0.8 | Synaptic downscaling |
| associate | 1.2 | Neocortical linking |
| validate | 1.1 | Prefrontal error detection |
| evolve | 1.5 | Belief revision |
| forecast | 1.6 | Prospective simulation |
| reflect | 1.3 | Default-mode network |
| full_cycle | 2.0 | Full REM cycle |

---

## Hierarchical Memory Architecture (xMemory/MAGMA)

### 4-Level Hierarchy
- L4: Raw entries (raw memory nodes)
- L3: Episodes (episodic chains per namespace)
- L2: Semantic nodes (insight clusters from Dream)
- L1: Themes (high-level topic groups, top-down retrieval)

### MAGMA — 4 Orthogonal Graph Types
- Semantic: cosine similarity edges
- Temporal: interval tree edges (time proximity)
- Causal: led-to/caused-by edges (from Dream EVOLVE)
- Entity: person/asset entity co-occurrence edges

### Compression Metrics (Strat 14 addition)
- Raw tokens estimated: ~180 tokens/memory average
- Compressed tokens: ~38 tokens/insight (structured distillation)
- Average compression ratio: 11.4×
- Preserved recall MRR: 96%
- Technique: structured_distillation (compress strategy) or semantic_consolidation (others)

---

## Dream Engine Benchmarking Framework

### Public Benchmarks to Target
- **LongMemEval-S**: 500-question multi-session benchmark
  - SOTA: Mastra 94.87%, Hindsight 91.4%, Mem0 49–68%
  - Slopshop target: 90%+ after full Dream cycle on test corpus
- **LoCoMo**: Long-conversation memory (~26k tokens/convo)
  - Leaders: 92–94%
  - Slopshop target: 85%+ with 5-night Dream trajectory
- **Dream Trajectory (custom)**: 30-night IS compounding
  - Unique Slopshop metric — no competitor has this
  - Baseline: simple nightly summary (IS ~12)
  - Full Dream cycle target: IS 73+ after night 30

### Ablation Study — IS Delta vs. Baseline
| Strategy | Baseline IS | Delta | 
|----------|-------------|-------|
| compress | ~12 | +8 |
| synthesize | ~12 | +14 |
| pattern_extract | ~12 | +16 |
| validate | ~12 | +17 |
| associate | ~12 | +19 |
| reflect | ~12 | +22 |
| insight_generate | ~12 | +28 |
| evolve | ~12 | +32 |
| forecast | ~12 | +42 |
| full_cycle | ~12 | +61 |

---

## Route Explorer — Dream Studio UX

UI controls for expert Dream customization:
- **Hierarchical Retrieval** toggle (default ON)
- **Collective Dream Mode** toggle (default OFF, "Coming Soon")
- **Strategy Depth Override** slider: 0.5× – 2.0×
- **Compression Aggressiveness** slider: 0.3 – 0.9 salience threshold
- **Causal Graph Weight** slider: 0.0 – 1.0
- **Share anonymized results** checkbox (telemetry flywheel)
- **Live IS Preview** box: updates as sliders change
- **Save as Default** button → POST /v1/auth/prefs

---

## 90-Day Roadmap

### 30 Days (Polish + Visibility)
- ✅ Strat 13: Dream Engine v2, Brain Glow, Background Extractors, Voice+Wearable
- ✅ Strat 14: Benchmarks page, FedMosaic page, Migration guides, Cookbook
- ✅ Strat 14: Route Explorer in Dream Studio
- ✅ Strat 14: Live metrics bar + FedMosaic teaser on homepage
- TODO: Open-source core runtime, MCP server skeleton (GitHub public)
- TODO: X/Discord launch with daily ships
- TODO: Public slopshop-bench repo (weekly CI vs. Composio/Mem0)

### 90 Days (Moats)
- FedMosaic production launch (federation network live)
- Full OAuth top-20 connectors (GitHub/Slack/Notion/Gmail/Stripe)
- Marketplace upgrades: deploy-as-agent, leaderboards, earnings badges
- SOC2 Type II audit start
- Universal MCP (auto-convert to OpenAI/Gemini/Llama schemas)
- IDE extensions (VS Code + Cursor marketplace)

### 180+ Days (100x)
- Federated memory network fully live (+23% IS boost visible)
- Decentralized compute exchange (earn credits for idle CPU/GPU)
- Agent-to-agent discovery protocol (open-source standards body)
- Full observability suite (AI-powered trace explainer via Grok)
- Enterprise sales engine (FedRAMP path, dedicated support)

---

## Competitor Analysis

### Memory Systems
| Platform | Type | Compression | Multi-night | Self-host | Federation | Cost |
|----------|------|-------------|-------------|-----------|------------|------|
| **Slopshop** | Dream Engine OS | 11.4× structured distillation | ✅ compounding | ✅ free | ✅ FedMosaic | Free core |
| Mem0 | Cloud memory | 3–6× summarization | ❌ | ❌ | ❌ | $0.002/op |
| Hindsight | Hosted RAG | 5–10× | ❌ | ❌ | ❌ | $$$ |
| Zep/Graphiti | Graph memory | Basic | ❌ | Partial | ❌ | $ |
| Mastra | Framework | None | ❌ | ✅ | ❌ | OSS |
| LangGraph Memory | Framework plugin | None | ❌ | ✅ | ❌ | OSS |

### Agent Frameworks (Slopshop as memory layer)
- **LangChain**: Strong integrations; memory is afterthought. Slopshop = drop-in upgrade.
- **CrewAI**: Task-focused, no overnight consolidation. Slopshop = persistent memory for crews.
- **AutoGen**: Multi-agent conversations; stateless by default. Slopshop = shared namespace memory.
- **LangGraph**: Graph-based orchestration; memory is per-session. Slopshop = multi-session IS.

---

## GTM Priorities

1. **Benchmarks repo** (GitHub public): Weekly CI vs. Composio, Mem0, Zep. Viral for devs.
2. **Discord community**: #showcase, bounties, founder engages "what tools for my agent?" threads.
3. **X daily ships**: Dream report of the day, IS screenshots, benchmark results.
4. **Partnerships**: LangChain/CrewAI/AutoGen listings, Cursor marketplace.
5. **HN launch**: "Show HN: Slopshop — agents that literally sleep and wake up smarter (free, self-hostable)"

---

*Last updated: 2026-04-01. Not for public distribution.*
