# Hive Analytics — Internal Research Findings

## Date: 2026-03-29

## Experiment 1: 330 Sprint Edit Quality
- 200 sprints on self-improvement mission
- 131 sprints on competitor research mission
- Total: 331 sprints across 3 hive versions

### Results
- Local model edit success rate: 29% (server-v2.js)
- Syntax check catches: ~10% of bad edits
- Runtime check catches: ~5% of bad edits  
- Undetectable semantic bugs: ~56% of edits
- Worst bugs: .splice/.slice confusion, const reassignment, inverted booleans
- Cloud (Claude) edit success rate: ~60% (proven in test-edit.js)

### Common Local LLM Failures
1. Yoda conditions ("production" === x) — style change, not improvement
2. .splice instead of .slice — mutates array (catastrophic)
3. Overcomplicated rewrites (Object.values().some(Boolean))
4. Adding .default to require() — doesn't exist in Node
5. Inverted boolean logic — passes syntax, breaks runtime

## Experiment 2: Context Injection Quality
- Tested: llama3, mistral, deepseek-coder-v2
- With vs without codebase context (README, north star, file list, code sample)

### Results
| Metric | No Context | With Context |
|--------|-----------|-------------|
| Names real files | 0/3 | 0/3 |
| Names real endpoints | 2/3 | 1/3 |
| Specific action | 2/3 | 1/3 |
| Mentions known issues | 0/3 | 2/3 |
| Talks about real product | 0/3 | 3/3 |

### Thesis: Context helps with AWARENESS but hurts SPECIFICITY
- Local models know ABOUT the product with context
- But they get LESS specific (overwhelmed by information)
- Sweet spot: give them ONE known issue + ONE file, not everything

## Experiment 3: Cost Analysis
- 55 cloud sprints: ~$1 in API costs, 0 shipped code
- 200+ local sprints: $0, 56 commits (29% quality)
- Best ROI: local for research/TODO, cloud for code generation

## Recommendations for Hive v3 Architecture
1. Local models: ONLY for research, rating, and TODO generation
2. Cloud (Claude): ONLY for code edits, every 10th sprint max
3. Context injection: ONE issue + ONE file per prompt (not full codebase)
4. Safety: git branch + 3-gate validation + human/Claude review before merge
5. Metrics: CSV per sprint, running stats every 25, summary at end
6. The hive is a RESEARCH ENGINE, not an autonomous coder

## Experiment 3: CLAUDE.md Injection (2026-03-29)

### Setup
Injected CLAUDE.md (800 chars) into llama3 prompt as "CODEBASE KNOWLEDGE"

### Results
| Metric | Without | With CLAUDE.md |
|--------|---------|---------------|
| Names real file | 0% | 100% |
| Mentions real architecture | 0% | 100% |
| Specific to our codebase | 0% | 100% |
| Suggestion quality | generic | implementable |

### Example
Without: "add loading indicator to profile page" (we don't have a profile page)
With: "add morgan logging to server-v2.js" (real file, real improvement)

### Conclusion
CLAUDE.md injection is the cheapest, simplest way to make local models aware.
No RAG, no fine-tuning, no databases. Just prepend CLAUDE.md to every prompt.

### Action
Update hive to inject CLAUDE.md into every local model prompt.
