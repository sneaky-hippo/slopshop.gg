# SLOPSHOP Competitor Gap Analysis: 200 New High-Value Tools

> Competitive analysis against Composio (600+ tools), LangChain Community Tools,
> CrewAI Tools, Toolhouse.ai, OpenAI Responses API, Anthropic Tool Use, Google Gemini,
> Vercel AI SDK, Dify.ai, Flowise, Superagent, AgentGPT, BabyAGI, MetaGPT.
>
> Every tool below is a pure compute handler (JSON in, JSON out, no external deps)
> unless explicitly noted. All are MISSING from Slopshop's current 1,248 APIs.

---

## Category 1: String & Text Power Tools (30 tools)

Competitors like Composio and LangChain provide regex builders, template engines, and NLP primitives that agents call hundreds of times per session. Slopshop has basic regex test/replace but lacks the builder/composition layer.

| # | Slug | Description | Difficulty |
|---|------|-------------|------------|
| 1 | `text-regex-build` | Build a regex from natural-language description (e.g., "email with .edu domain") — returns pattern + flags + test cases | medium |
| 2 | `text-regex-compose` | Combine multiple regex patterns with AND/OR/NOT logic into a single compiled pattern | medium |
| 3 | `text-fuzzy-match` | Fuzzy string matching using Levenshtein, Jaro-Winkler, and Dice coefficient — returns similarity scores + best match from candidates | easy |
| 4 | `text-fuzzy-search` | Search an array of strings for fuzzy matches to a query, ranked by relevance score with configurable threshold | easy |
| 5 | `text-template-render` | Mustache/Handlebars-style template rendering — pass template + data, get rendered string (no eval, safe sandbox) | easy |
| 6 | `text-template-extract` | Reverse of template render: given a template and a filled string, extract the variable values back out | medium |
| 7 | `text-diff-words` | Word-level diff (not line-level) — highlights exact word changes between two texts | easy |
| 8 | `text-diff-chars` | Character-level diff with colorized output markers for surgical edit comparison | easy |
| 9 | `text-diff-semantic` | Semantic diff that groups related changes and ignores whitespace/formatting differences | medium |
| 10 | `text-ngram-extract` | Extract n-grams (unigrams through 5-grams) with frequency counts from text | easy |
| 11 | `text-stem-words` | Porter stemmer — reduce words to stems (running→run, studies→studi) for NLP pipelines | easy |
| 12 | `text-lemmatize` | Rule-based lemmatization (better→good, ran→run, mice→mouse) using English dictionary rules | medium |
| 13 | `text-pos-tag` | Rule-based part-of-speech tagging — returns each word tagged as noun/verb/adj/adv/etc | medium |
| 14 | `text-ner-extract` | Rule-based named entity recognition — extract PERSON, ORG, LOCATION, DATE, MONEY from text using pattern heuristics | medium |
| 15 | `text-tokenize` | Multi-mode tokenizer: word, sentence, paragraph, whitespace, regex-delimited — returns tokens + offsets | easy |
| 16 | `text-normalize` | Normalize unicode (NFC/NFD/NFKC/NFKD), strip diacritics, collapse whitespace, fix smart quotes | easy |
| 17 | `text-transliterate` | Transliterate non-Latin characters to ASCII (e.g., "München" → "Munchen", "東京" → "Tokyo") | medium |
| 18 | `text-wrap-columns` | Wrap text to N columns with proper word breaking, indent support, and hanging indent option | trivial |
| 19 | `text-align-columns` | Align text into columns (left/right/center) from delimited input — like column -t but configurable | easy |
| 20 | `text-interleave` | Interleave lines from two or more texts (A1, B1, A2, B2...) — useful for building parallel corpora | trivial |
| 21 | `text-mask-pii` | Mask PII in text: emails→[EMAIL], phones→[PHONE], SSNs→[SSN], credit cards→[CC], names→[NAME] | medium |
| 22 | `text-encode-detect` | Detect text encoding (UTF-8, ASCII, Latin-1, etc.) from byte patterns and BOM markers | easy |
| 23 | `text-string-distance` | Compute multiple string distance metrics at once: edit distance, Hamming, Damerau-Levenshtein, longest common subsequence | easy |
| 24 | `text-phonetic-encode` | Encode words as Soundex, Metaphone, and Double Metaphone for phonetic matching/search | easy |
| 25 | `text-spell-suggest` | Simple spell-checker using edit distance against a word dictionary — returns top N corrections | medium |
| 26 | `text-markov-generate` | Build Markov chain from input text and generate N words of output — lightweight text generation | easy |
| 27 | `text-glob-match` | Test if strings match glob patterns (*, **, ?) — useful for file path and URL matching | trivial |
| 28 | `text-wildcard-replace` | Find-and-replace using wildcard patterns (not regex) for simpler pattern matching | easy |
| 29 | `text-cloze-fill` | Fill in [BLANK] tokens in text using context heuristics (frequency-based, no LLM) | medium |
| 30 | `text-fingerprint` | Generate a locality-sensitive hash (simhash/minhash) of text for near-duplicate detection | medium |

---

## Category 2: Data Wrangling (30 tools)

Composio, Dify, and LangChain all provide data manipulation primitives. Slopshop has basic pivot/group-by but lacks the ETL pipeline tools agents need for real data work.

| # | Slug | Description | Difficulty |
|---|------|-------------|------------|
| 31 | `data-pivot-table` | Full pivot table: rows, columns, values, aggregation function (sum/avg/count/min/max) from JSON array | medium |
| 32 | `data-unpivot` | Reverse pivot (melt) — convert wide-format data to long-format with id/variable/value columns | easy |
| 33 | `data-clean-nulls` | Remove or fill null/undefined/NaN values with configurable strategy (drop, fill-zero, fill-mean, fill-forward, fill-backward) | easy |
| 34 | `data-clean-whitespace` | Trim, collapse, and normalize whitespace across all string fields in a dataset | trivial |
| 35 | `data-clean-types` | Auto-coerce types: "123"→123, "true"→true, "2024-01-01"→Date, "null"→null across all fields | easy |
| 36 | `data-deduplicate` | Remove duplicate records from dataset with configurable key fields and keep-first/keep-last strategy | easy |
| 37 | `data-join` | SQL-style JOIN (inner, left, right, full) of two JSON arrays on specified key fields | medium |
| 38 | `data-union` | Union two datasets, optionally deduplicating, with schema alignment | easy |
| 39 | `data-intersect` | Return only records present in both datasets based on key fields | easy |
| 40 | `data-difference` | Return records in dataset A that are NOT in dataset B based on key fields | easy |
| 41 | `data-rename-fields` | Rename fields across a dataset using a mapping object {old: new} | trivial |
| 42 | `data-add-computed` | Add a computed column using a safe expression (field math, string concat, conditionals) | medium |
| 43 | `data-filter-expression` | Filter dataset rows using a safe expression language (field > 10 AND status = "active") | medium |
| 44 | `data-window-function` | Compute window functions: row_number, rank, running_sum, running_avg, lag, lead over sorted data | medium |
| 45 | `data-fill-series` | Fill gaps in time series data with interpolation (linear, forward-fill, backward-fill) | medium |
| 46 | `data-bin-numeric` | Bin numeric values into ranges (equal-width, equal-frequency, custom breaks) with labels | easy |
| 47 | `data-one-hot-encode` | One-hot encode categorical fields into binary columns | easy |
| 48 | `data-label-encode` | Convert categorical values to numeric labels with a mapping table | easy |
| 49 | `data-normalize-minmax` | Min-max normalize numeric columns to [0,1] range | easy |
| 50 | `data-normalize-zscore` | Z-score normalize numeric columns (mean=0, stddev=1) | easy |
| 51 | `data-schema-infer` | Infer a schema (field names, types, nullable, unique, min/max) from a dataset sample | medium |
| 52 | `data-schema-diff` | Compare two schemas and return added/removed/changed fields with type changes | easy |
| 53 | `data-schema-migrate` | Generate migration steps to transform data from schema A to schema B (renames, type casts, drops) | medium |
| 54 | `data-validate-rows` | Validate every row against a schema/rules, return valid rows + error rows with reasons | medium |
| 55 | `data-crosstab` | Cross-tabulation (contingency table) of two categorical fields with counts/percentages | easy |
| 56 | `data-describe` | Pandas-style describe(): count, unique, top, freq for categorical; mean/std/min/max/quartiles for numeric | medium |
| 57 | `data-sql-query` | Run a SQL SELECT query against an in-memory JSON dataset (supports WHERE, GROUP BY, ORDER BY, JOIN, HAVING) | medium |
| 58 | `data-reshape-wide` | Reshape long-format data to wide-format (spread/pivot) by a key column | easy |
| 59 | `data-flatten-nested` | Flatten deeply nested JSON arrays/objects into a flat tabular dataset | easy |
| 60 | `data-etl-pipeline` | Define and execute a multi-step ETL pipeline: filter → transform → aggregate → output in one call | medium |

---

## Category 3: Math & Science (20 tools)

MetaGPT and CrewAI include scientific computation tools. OpenAI's code interpreter handles math natively. Slopshop has basics but lacks linear algebra, probability, and optimization.

| # | Slug | Description | Difficulty |
|---|------|-------------|------------|
| 61 | `math-matrix-inverse` | Compute inverse of a square matrix (up to 10x10) with determinant | medium |
| 62 | `math-matrix-determinant` | Compute determinant of a square matrix using cofactor expansion | easy |
| 63 | `math-matrix-transpose` | Transpose a matrix | trivial |
| 64 | `math-matrix-eigenvalues` | Compute eigenvalues of a 2x2 or 3x3 matrix using characteristic polynomial | medium |
| 65 | `math-solve-linear-system` | Solve system of linear equations (Ax=b) using Gaussian elimination | medium |
| 66 | `math-polynomial-roots` | Find roots of polynomials up to degree 4 using quadratic/cubic/quartic formulas | medium |
| 67 | `math-polynomial-evaluate` | Evaluate polynomial at a point, compute derivative/integral coefficients | easy |
| 68 | `math-probability-distribution` | Compute PDF, CDF, mean, variance for Normal, Poisson, Binomial, Exponential, Uniform distributions | medium |
| 69 | `math-hypothesis-test` | Perform t-test, z-test, chi-squared test — returns test statistic, p-value, conclusion | medium |
| 70 | `math-confidence-interval` | Compute confidence interval (90/95/99%) for a sample mean | easy |
| 71 | `math-regression-polynomial` | Fit polynomial regression (degree 1-5) to data points, return coefficients and R-squared | medium |
| 72 | `math-interpolate` | Interpolate value at a point using linear, cubic spline, or nearest-neighbor from data points | medium |
| 73 | `math-numerical-integrate` | Numerical integration (trapezoidal, Simpson's rule) of tabular data or expression over interval | medium |
| 74 | `math-numerical-derivative` | Numerical differentiation of tabular data or expression at a point | easy |
| 75 | `math-optimize-minimize` | Find minimum of a single-variable function on an interval using golden-section search | medium |
| 76 | `math-combinatorics` | Compute permutations, combinations, arrangements, Bell numbers, Catalan numbers for given n, k | easy |
| 77 | `math-vector-ops` | Vector operations: add, subtract, dot product, cross product, magnitude, normalize, angle between | easy |
| 78 | `math-complex-arithmetic` | Complex number arithmetic: add, subtract, multiply, divide, polar form, conjugate, modulus | easy |
| 79 | `math-fourier-dft` | Compute discrete Fourier transform of a signal array — returns magnitude and phase spectra | medium |
| 80 | `math-ode-euler` | Solve simple ODE (dy/dx = f(x,y)) using Euler's method over an interval with step size | medium |

---

## Category 4: Business Logic (25 tools)

Composio and Toolhouse bundle business calculation tools. Agents handling SaaS, e-commerce, and finance tasks call these constantly.

| # | Slug | Description | Difficulty |
|---|------|-------------|------------|
| 81 | `biz-sales-tax` | Calculate sales tax for US states/territories — input: amount + state code, output: tax rate, tax amount, total | easy |
| 82 | `biz-vat-calculate` | Calculate VAT for EU countries — input: amount + country code, output: rate, net, VAT, gross | easy |
| 83 | `biz-shipping-estimate` | Estimate shipping cost by weight, dimensions, origin/destination zone using configurable rate tables | medium |
| 84 | `biz-pricing-tier` | Compute tiered/volume pricing — given qty and tier breakpoints, return unit price and total | easy |
| 85 | `biz-discount-stack` | Apply multiple discounts (percentage, flat, BOGO) in sequence or parallel with final price | easy |
| 86 | `biz-invoice-generate` | Generate structured invoice JSON from line items with tax, discount, subtotal, total, due date | medium |
| 87 | `biz-invoice-validate` | Validate invoice math: verify line totals, subtotals, tax calculations, and grand total are consistent | easy |
| 88 | `biz-subscription-prorate` | Calculate prorated subscription charges for mid-cycle plan changes (upgrade/downgrade) | medium |
| 89 | `biz-subscription-mrr` | Compute MRR, ARR, expansion/contraction/churn MRR from a list of subscription events | medium |
| 90 | `biz-ltv-calculate` | Calculate customer LTV from ARPU, gross margin, and churn rate using standard formulas | easy |
| 91 | `biz-cac-payback` | Calculate CAC payback period from acquisition cost and monthly revenue per customer | easy |
| 92 | `biz-churn-rate` | Compute churn rate (customer and revenue) from period start/end counts and lost counts | easy |
| 93 | `biz-cohort-retention` | Build a cohort retention table from a list of user signup dates and activity dates | medium |
| 94 | `biz-nps-calculate` | Calculate Net Promoter Score from array of ratings (0-10) with promoter/passive/detractor breakdown | easy |
| 95 | `biz-break-even` | Calculate break-even point in units and revenue from fixed costs, variable cost per unit, and price | easy |
| 96 | `biz-margin-calculate` | Compute gross margin, net margin, markup from cost and selling price | trivial |
| 97 | `biz-depreciation` | Calculate asset depreciation using straight-line, declining balance, or sum-of-years methods | easy |
| 98 | `biz-payroll-calculate` | Estimate US payroll: gross → federal tax, state tax, FICA, Medicare, net pay | medium |
| 99 | `biz-runway-calculate` | Calculate startup runway in months from current cash, monthly burn, and optional revenue | easy |
| 100 | `biz-cap-table` | Model simple cap table: founders, investors, option pool — compute ownership percentages post-dilution | medium |
| 101 | `biz-unit-economics` | Compute full unit economics: CAC, LTV, LTV/CAC ratio, payback, gross margin per unit | easy |
| 102 | `biz-pricing-ab-test` | Evaluate A/B pricing test: compute revenue lift, statistical significance, and recommendation | medium |
| 103 | `biz-funnel-convert` | Compute funnel conversion rates between stages, drop-off rates, and bottleneck identification | easy |
| 104 | `biz-forecast-linear` | Simple revenue/growth forecast using linear extrapolation from historical monthly data | easy |
| 105 | `biz-currency-round` | Banker's rounding for currency: round to 2 decimals with configurable rounding mode (half-even, half-up, half-down) | trivial |

---

## Category 5: DevOps & Infrastructure (25 tools)

CrewAI, Composio, and LangChain all have DevOps tool integrations. These are pure-compute helpers agents use for config generation, validation, and analysis.

| # | Slug | Description | Difficulty |
|---|------|-------------|------------|
| 106 | `devops-dockerfile-generate` | Generate Dockerfile from language + framework + config spec (Node, Python, Go, Rust, Java) | medium |
| 107 | `devops-compose-generate` | Generate docker-compose.yml from a service dependency graph (app + db + cache + queue) | medium |
| 108 | `devops-compose-validate` | Validate docker-compose.yml structure: required fields, port conflicts, volume syntax, dependency cycles | medium |
| 109 | `devops-nginx-config` | Generate nginx config block for common patterns: reverse proxy, static files, SSL, rate limiting | medium |
| 110 | `devops-github-actions-generate` | Generate GitHub Actions workflow YAML from build/test/deploy spec | medium |
| 111 | `devops-github-actions-validate` | Validate GitHub Actions YAML structure and catch common errors (missing runs-on, bad indentation) | medium |
| 112 | `devops-terraform-validate` | Validate Terraform HCL syntax and catch common issues (missing providers, duplicate resources) | medium |
| 113 | `devops-k8s-manifest-generate` | Generate Kubernetes deployment + service YAML from app spec (image, replicas, ports, env) | medium |
| 114 | `devops-k8s-manifest-validate` | Validate K8s YAML manifests for required fields, API version, label selectors, resource limits | medium |
| 115 | `devops-helm-values-merge` | Deep merge multiple Helm values.yaml files with override precedence | easy |
| 116 | `devops-env-diff` | Diff two .env files and show added/removed/changed variables | easy |
| 117 | `devops-env-validate` | Validate .env file against a schema: required vars, type constraints, value patterns | easy |
| 118 | `devops-port-conflict-check` | Given a list of service port mappings, detect conflicts and suggest alternatives | easy |
| 119 | `devops-cron-schedule-conflicts` | Detect overlapping cron schedules that might cause resource contention | medium |
| 120 | `devops-log-parse` | Parse common log formats (Apache, Nginx, JSON, syslog) into structured JSON records | medium |
| 121 | `devops-log-analyze` | Analyze parsed logs: error rate, top errors, requests per minute, latency percentiles | medium |
| 122 | `devops-alert-rule-generate` | Generate alerting rules (Prometheus/Grafana format) from plain-language conditions | medium |
| 123 | `devops-sla-calculate` | Calculate SLA metrics: uptime %, allowed downtime per month/year, error budget remaining | easy |
| 124 | `devops-incident-timeline` | Build incident timeline from a list of events — sorts, computes duration, identifies gaps | easy |
| 125 | `devops-resource-estimate` | Estimate CPU/memory requirements for a service from requests-per-second and response-time targets | medium |
| 126 | `devops-toml-validate` | Validate TOML syntax and structure against an expected schema | easy |
| 127 | `devops-yaml-lint` | Lint YAML files for common issues: wrong indentation, duplicate keys, trailing spaces | easy |
| 128 | `devops-makefile-parse` | Parse a Makefile and extract targets, dependencies, and variable definitions as JSON | medium |
| 129 | `devops-systemd-generate` | Generate systemd service unit file from app spec (command, user, restart policy, env) | easy |
| 130 | `devops-ssl-expiry-calc` | Calculate days until SSL cert expiry from a PEM-encoded certificate string | easy |

---

## Category 6: AI/ML Utilities (25 tools)

This is the biggest gap. Every competitor (Vercel AI SDK, Composio, LangChain, Dify) provides prompt engineering and token management tools. Agents building AI pipelines need these constantly.

| # | Slug | Description | Difficulty |
|---|------|-------------|------------|
| 131 | `ai-prompt-template` | Render a prompt template with variables, system/user/assistant roles, and optional few-shot examples | easy |
| 132 | `ai-prompt-optimize` | Analyze a prompt and suggest improvements: reduce token count, add constraints, improve specificity (rule-based) | medium |
| 133 | `ai-prompt-decompose` | Break a complex prompt into a chain-of-thought sequence of simpler sub-prompts | medium |
| 134 | `ai-token-count` | Count tokens for text using tiktoken-compatible BPE for GPT-4, Claude, Llama models | medium |
| 135 | `ai-token-truncate` | Truncate text to fit within a token budget while preserving complete sentences | medium |
| 136 | `ai-token-split` | Split long text into chunks that fit within token limits with configurable overlap | medium |
| 137 | `ai-context-window-fit` | Given system prompt + messages + tools, compute tokens used and remaining context window budget | medium |
| 138 | `ai-message-format` | Format messages into OpenAI, Anthropic, or Google message format from a universal schema | easy |
| 139 | `ai-tool-schema-generate` | Generate OpenAI/Anthropic tool-use JSON schema from a function signature description | medium |
| 140 | `ai-tool-call-parse` | Parse and validate tool call responses from different LLM providers into a unified format | easy |
| 141 | `ai-tool-result-format` | Format tool execution results back into the expected message format for each provider | easy |
| 142 | `ai-eval-exact-match` | Evaluate LLM output against expected answer: exact match, contains, starts-with, regex match | easy |
| 143 | `ai-eval-similarity` | Score LLM output similarity to reference using string similarity metrics (no embeddings needed) | easy |
| 144 | `ai-eval-json-match` | Evaluate if LLM JSON output matches expected schema and values with partial credit scoring | medium |
| 145 | `ai-eval-rubric` | Score LLM output against a rubric of criteria with weighted scoring and pass/fail thresholds | medium |
| 146 | `ai-guardrail-pii` | Check if LLM output contains PII (emails, phones, SSNs, addresses) and optionally redact | easy |
| 147 | `ai-guardrail-injection` | Detect prompt injection patterns in user input using rule-based heuristics | medium |
| 148 | `ai-guardrail-topic` | Check if text stays on-topic by comparing keyword overlap against allowed/blocked topic lists | easy |
| 149 | `ai-guardrail-length` | Enforce output length constraints: min/max chars, words, sentences, paragraphs | trivial |
| 150 | `ai-guardrail-format` | Validate LLM output matches expected format: JSON, Markdown, CSV, numbered list, etc. | easy |
| 151 | `ai-cost-estimate` | Estimate API cost for a prompt+completion given model, input tokens, output tokens, and provider pricing | easy |
| 152 | `ai-model-compare` | Compare model specs: context window, pricing, speed tier, capabilities for model selection decisions | easy |
| 153 | `ai-embedding-cosine` | Compute cosine similarity between two embedding vectors | trivial |
| 154 | `ai-embedding-search` | Find top-K nearest neighbors from a list of embedding vectors using cosine similarity | easy |
| 155 | `ai-embedding-cluster` | K-means clustering of embedding vectors — returns cluster assignments and centroids | medium |

---

## Category 7: Protocol & Format (20 tools)

Composio and LangChain support GraphQL, protobuf, and WebSocket tooling. Slopshop has zero protocol-level utilities.

| # | Slug | Description | Difficulty |
|---|------|-------------|------------|
| 156 | `proto-graphql-parse` | Parse GraphQL query/mutation string into AST JSON — extract fields, variables, fragments | medium |
| 157 | `proto-graphql-validate` | Validate GraphQL query against a schema definition — return errors with locations | medium |
| 158 | `proto-graphql-schema-generate` | Generate GraphQL schema from a JSON data example (infer types, relations) | medium |
| 159 | `proto-graphql-to-rest` | Convert GraphQL query to equivalent REST API endpoint description with query params | medium |
| 160 | `proto-protobuf-to-json` | Convert a .proto schema definition to equivalent JSON Schema | medium |
| 161 | `proto-protobuf-validate` | Validate .proto file syntax: message definitions, field numbers, types, imports | medium |
| 162 | `proto-grpc-service-describe` | Parse a .proto service definition and return a structured API description with methods, input/output types | medium |
| 163 | `proto-openapi-to-graphql` | Convert OpenAPI spec to GraphQL schema definition | medium |
| 164 | `proto-json-schema-to-openapi` | Convert JSON Schema to OpenAPI 3.x component schema | easy |
| 165 | `proto-openapi-merge` | Merge multiple OpenAPI specs into one (combine paths, components, tags) | medium |
| 166 | `proto-mqtt-topic-match` | Test if MQTT topics match subscription patterns (wildcards +, #) | easy |
| 167 | `proto-mqtt-topic-validate` | Validate MQTT topic syntax and structure rules | trivial |
| 168 | `proto-websocket-frame-parse` | Parse WebSocket frame structure: opcode, mask, payload length, FIN bit | easy |
| 169 | `proto-http2-header-encode` | HPACK encode/decode HTTP/2 headers for debugging and analysis | medium |
| 170 | `proto-msgpack-to-json` | Convert MessagePack hex/base64 to JSON and vice versa | easy |
| 171 | `proto-avro-schema-validate` | Validate Apache Avro schema definition for correctness | medium |
| 172 | `proto-csv-dialect-detect` | Auto-detect CSV dialect: delimiter, quote char, escape char, line terminator, has-header | easy |
| 173 | `proto-ndjson-validate` | Validate newline-delimited JSON — check each line parses and optionally validate against schema | easy |
| 174 | `proto-sse-format` | Format data into Server-Sent Events format (event, data, id, retry fields) | trivial |
| 175 | `proto-jwt-claims-validate` | Validate JWT claims against a policy: required claims, audience, issuer, not-before, expiry | easy |

---

## Category 8: Agent Workflow (25 tools)

This is what MetaGPT, BabyAGI, AgentGPT, and CrewAI are fundamentally built on. Slopshop has orchestration primitives but lacks the planning, reflection, and context management tools that make agents autonomous.

| # | Slug | Description | Difficulty |
|---|------|-------------|------------|
| 176 | `agent-task-decompose` | Break a complex task description into a DAG of subtasks with dependencies, estimated effort, and execution order | medium |
| 177 | `agent-task-prioritize` | Prioritize a task list using Eisenhower matrix (urgent/important), MoSCoW, or weighted scoring | easy |
| 178 | `agent-task-estimate` | Estimate time/complexity for tasks based on keyword heuristics and historical patterns | easy |
| 179 | `agent-plan-validate` | Validate an execution plan: check for circular deps, missing inputs, unreachable steps, deadlocks | medium |
| 180 | `agent-plan-critical-path` | Compute critical path through a task DAG — identify bottleneck tasks and total minimum duration | medium |
| 181 | `agent-reflect-summarize` | Summarize what was accomplished, what failed, and what to try next from a list of step results | easy |
| 182 | `agent-reflect-score` | Score agent performance on a task: completion %, efficiency, error rate, tool call count vs optimal | easy |
| 183 | `agent-reflect-lessons` | Extract reusable lessons/patterns from a completed task execution trace | medium |
| 184 | `agent-tool-select` | Given a task description and available tool list, rank tools by relevance using keyword matching and heuristics | medium |
| 185 | `agent-tool-chain-suggest` | Suggest a chain of tool calls to accomplish a goal, with data flow between tools | medium |
| 186 | `agent-context-compress` | Compress conversation context by extracting key facts, decisions, and pending items — reduce tokens while preserving state | medium |
| 187 | `agent-context-merge` | Merge context from multiple agent threads into a unified state object, resolving conflicts | medium |
| 188 | `agent-context-diff` | Diff two context states and return what changed — useful for understanding state evolution | easy |
| 189 | `agent-memory-index` | Build a searchable keyword index from a list of memory entries for fast retrieval | easy |
| 190 | `agent-memory-rank` | Rank memory entries by relevance to a query using TF-IDF scoring (no embeddings) | medium |
| 191 | `agent-memory-decay` | Apply time-based decay to memory entries — reduce importance scores based on age and access patterns | easy |
| 192 | `agent-goal-track` | Track progress toward a goal: check off sub-goals, compute completion %, identify blockers | easy |
| 193 | `agent-goal-decompose` | Break a high-level goal into SMART sub-goals with measurable success criteria | medium |
| 194 | `agent-state-machine` | Define and step through a finite state machine: states, transitions, guards, actions — returns current state | medium |
| 195 | `agent-retry-strategy` | Compute retry delay using exponential backoff, jitter, and circuit breaker logic from attempt count and error type | easy |
| 196 | `agent-consensus-vote` | Tally votes from multiple agents using configurable rules: majority, supermajority, unanimous, ranked-choice | easy |
| 197 | `agent-delegation-plan` | Assign tasks to agents based on capability matching, workload balancing, and priority | medium |
| 198 | `agent-output-merge` | Merge outputs from parallel agent executions — concatenate, deduplicate, or consensus-pick results | easy |
| 199 | `agent-rollback-plan` | Generate a rollback plan from an execution trace — reverse each step that was completed | medium |
| 200 | `agent-workflow-validate` | Validate a full agent workflow definition: check schema, dependencies, loops, resource conflicts, and terminal conditions | medium |

---

## Summary Statistics

| Category | Count | Trivial | Easy | Medium |
|----------|-------|---------|------|--------|
| String & Text Power Tools | 30 | 3 | 15 | 12 |
| Data Wrangling | 30 | 2 | 14 | 14 |
| Math & Science | 20 | 1 | 6 | 13 |
| Business Logic | 25 | 2 | 14 | 9 |
| DevOps & Infrastructure | 25 | 0 | 9 | 16 |
| AI/ML Utilities | 25 | 2 | 12 | 11 |
| Protocol & Format | 20 | 3 | 7 | 10 |
| Agent Workflow | 25 | 0 | 11 | 14 |
| **Total** | **200** | **13** | **88** | **99** |

## Competitor Coverage Matrix

| Tool Category | Composio | LangChain | CrewAI | Toolhouse | Dify | MetaGPT | BabyAGI | Slopshop (current) |
|---------------|----------|-----------|--------|-----------|------|---------|---------|-------------------|
| Text Power Tools | Partial | Partial | None | None | None | None | None | Basic (regex, diff) |
| Data Wrangling | Good | Good | Basic | Basic | Good | None | None | Basic (pivot, group) |
| Math & Science | None | Partial | None | None | None | Good | None | Basic (stats, matrix mul) |
| Business Logic | Good | None | None | Good | None | None | None | Basic (ROI, loan, tax) |
| DevOps & Infra | Good | Good | Good | Good | Good | None | None | Basic (Dockerfile lint) |
| AI/ML Utilities | Good | Excellent | Good | Good | Good | Good | None | None |
| Protocol & Format | Good | Partial | None | None | Partial | None | None | None |
| Agent Workflow | Partial | Partial | Good | None | Partial | Excellent | Good | Basic (orchestration) |

## Implementation Priority

**Sprint 1 (Week 1): Highest agent call frequency — ship first**
- AI/ML Utilities (#131-155): Every AI agent needs token counting, prompt templates, and guardrails
- Agent Workflow (#176-200): The metacognitive tools that make agents autonomous

**Sprint 2 (Week 2): Daily driver utilities**
- String & Text Power Tools (#1-30): Fuzzy match, templates, PII masking
- Data Wrangling (#31-60): Join, filter, clean, describe

**Sprint 3 (Week 3): Domain-specific value**
- Business Logic (#81-105): SaaS metrics, invoicing, pricing
- DevOps & Infrastructure (#106-130): Config generation, validation, log analysis

**Sprint 4 (Week 4): Protocol completeness**
- Math & Science (#61-80): Linear algebra, probability, optimization
- Protocol & Format (#156-175): GraphQL, protobuf, OpenAPI

---

*All 200 tools are pure compute handlers (JSON in, JSON out, no external dependencies).*
*This would bring Slopshop from 1,248 to 1,352 APIs.*
