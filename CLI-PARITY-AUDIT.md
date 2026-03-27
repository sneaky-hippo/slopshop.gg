# SLOPSHOP CLI -- FEATURE PARITY AUDIT vs. 10 Leading CLIs

> Generated 2026-03-28. Exhaustive comparison of the `slop` CLI against the top AI/cloud/dev CLIs.

---

## TABLE OF CONTENTS

1. [Slopshop CLI Current Feature Inventory](#1-slopshop-cli-current-feature-inventory)
2. [Competitor-by-Competitor Breakdown (Top 10 Features Each)](#2-competitor-breakdown)
3. [Feature Parity Matrix](#3-feature-parity-matrix)
4. [TOP 30 Missing Features Ranked by Impact](#4-top-30-missing-features)
5. [CLI Command Specs for Each Missing Feature](#5-cli-command-specs)
6. [Public Benchmarks & How to Compete](#6-benchmarks)
7. [Sources](#7-sources)

---

## 1. SLOPSHOP CLI CURRENT FEATURE INVENTORY

Binary: `slop` / `slopshop` (Node.js, zero native deps)
Version: 3.3.0 | ~1,250 APIs across 78 categories

### Core Commands

| Command | Description |
|---------|-------------|
| `slop call <slug> [--key val]` | Call any of 1,250+ APIs with typed params |
| `slop pipe <api1> <api2> ...` | Chain APIs sequentially, auto-mapping outputs |
| `slop run "task"` | Natural-language task execution (agent mode) |
| `slop search <query>` | Semantic API search with confidence scores |
| `slop list [category]` | List/filter all available APIs |
| `slop discover "goal"` | Goal-oriented feature recommendation |
| `slop org launch/status/task/scale/standup` | Agent organization management |
| `slop chain create/list/status/pause/resume` | Agent-to-agent chain orchestration |
| `slop memory set/get/search/list/delete` | Persistent key-value memory |
| `slop signup / login / whoami` | Account lifecycle |
| `slop key set/remove/rotate` | API key management |
| `slop config [key] [value]` | Local config file management |
| `slop balance` | Credit balance with visual bar |
| `slop buy <amount>` | Purchase credits (Stripe checkout) |
| `slop stats` | Platform statistics & usage |
| `slop health` | Server health check |
| `slop mcp` | Set up MCP server for Claude Code |
| `slop help` | Full help with ASCII lobster art |

### Global Flags

`--quiet / -q`, `--json`, `--no-color`

### Advanced Features

- **Stdin piping**: `echo "text" | slop call text-word-count`
- **Natural language routing**: Unknown commands routed via pattern matching (e.g., `slop hash "hello"`, `slop uuid`, `slop remember key = value`)
- **Auto field mapping in pipes**: Output fields auto-mapped to input fields across chained APIs
- **Non-interactive auth**: `slop signup --email x --password y` for CI/CD
- **Config file**: `~/.slopshop/config.json` with secure permissions (0o600)
- **MCP integration**: Full MCP server setup for Claude Code

### API Categories (78 categories, 1,250+ tools)

Text Processing, Crypto & Security, Math & Numbers, Date & Time, Data Transform, Code Utilities, Generate, Network & DNS, AI: Content, AI: Analysis, AI: Code, AI: Business, Agent Tools, External: Web/Comms/Dev/Productivity/Storage/AI, Analyze, Agent Superpowers, Orchestration, Memory, Knowledge Graphs, Pub/Sub, and more.

---

## 2. COMPETITOR BREAKDOWN

---

### 2.1 CLAUDE CODE CLI (Anthropic)

The agentic coding tool that lives in your terminal. Default model: Opus 4.6 (1M context).

| # | Feature | Slopshop Has? | Notes |
|---|---------|---------------|-------|
| 1 | **Agentic code editing** -- reads codebase, edits files, runs tests autonomously | :x: | Slopshop has `slop run` for task execution but not file-system-level code editing |
| 2 | **Git workflow automation** -- commits, PRs, branch management from natural language | :x: | No git integration |
| 3 | **Voice mode** -- push-to-talk via `/voice` (March 2026) | :x: | No voice input |
| 4 | **MCP server ecosystem** -- connect to any tool/service via MCP | :white_check_mark: | `slop mcp` sets up MCP server |
| 5 | **Slash commands** -- `/init`, `/compact`, `/review`, `/agents`, `/context`, `/cost`, `/doctor`, `/rewind` | :x: | No interactive slash command system |
| 6 | **Custom skills/commands** -- `.claude/commands/` and `.claude/skills/` with frontmatter | :x: | No extensible command system |
| 7 | **Conversation compaction** -- `/compact` summarizes long sessions to save context | :x: | No conversation state |
| 8 | **Subagent orchestration** -- `/agents` delegates to specialized sub-agents | :white_check_mark: | `slop org` and `slop chain` provide agent orchestration |
| 9 | **Context window management** -- `/context` shows usage, effort levels (high/medium/low) | :x: | No context/token management |
| 10 | **Multi-IDE integration** -- VS Code, JetBrains, Vim/Neovim hooks | :x: | CLI-only, no IDE plugins |

**Score: 2/10**

---

### 2.2 OPENAI CODEX CLI

Full-screen terminal UI for coding. Default model: GPT-5.4.

| # | Feature | Slopshop Has? | Notes |
|---|---------|---------------|-------|
| 1 | **Full-screen TUI** -- rich terminal interface with scrolling, panels | :x: | Standard line-mode CLI |
| 2 | **Codex Cloud** -- launch cloud tasks, hand off work, resume later | :x: | No cloud task handoff |
| 3 | **`codex exec`** -- non-interactive mode with JSONL streaming | :white_check_mark: | `slop call --json` provides JSON output; stdin piping works |
| 4 | **`/fork`** -- clone conversation into parallel thread | :x: | No conversation forking |
| 5 | **`/review`** -- code review of working tree | :x: | Has AI code review APIs but not local working-tree review |
| 6 | **`/diff`** -- inspect git diff inside CLI | :x: | Has `text-diff` API but not git-aware |
| 7 | **`/mention`** -- add files to conversation context | :x: | No file context system |
| 8 | **MCP server management** -- `codex mcp list/add/remove/auth` | :white_check_mark: | `slop mcp` provides MCP setup |
| 9 | **Model switching** -- `/model` changes model mid-session | :x: | No model selection (uses platform default) |
| 10 | **Session resume** -- resume previous sessions with `--resume` | :x: | No session persistence |

**Score: 2/10**

---

### 2.3 GITHUB COPILOT CLI (`gh copilot`)

Autonomous coding agent with planning. GA since Feb 2026.

| # | Feature | Slopshop Has? | Notes |
|---|---------|---------------|-------|
| 1 | **Plan mode** -- structured implementation planning before coding | :x: | `slop run` executes but doesn't plan |
| 2 | **Autopilot mode** -- fully autonomous multi-step execution | :white_check_mark: | `slop run` + `slop pipe` provide autonomous execution |
| 3 | **Multi-model selection** -- Claude, GPT, Gemini models available | :x: | Fixed platform model |
| 4 | **Specialized agents** -- Explore, Task, Code Review, Plan auto-delegated | :white_check_mark: | `slop org` has templated agent teams |
| 5 | **Plugin system** -- `/plugin install owner/repo` from GitHub | :x: | No plugin marketplace |
| 6 | **Built-in GitHub MCP server** -- deep GitHub integration | :x: | Has GitHub issue creation API but not deep MCP integration |
| 7 | **Explain command** -- `gh copilot explain "command"` | :x: | `slop discover` is similar but for APIs, not shell commands |
| 8 | **Suggest command** -- `gh copilot suggest "task"` | :white_check_mark: | `slop search` + `slop discover` provide suggestions |
| 9 | **Cross-platform installers** -- npm, Homebrew, WinGet, standalone | :white_check_mark: | npm install (`npx slopshop`) |
| 10 | **PR creation & review** -- end-to-end PR workflow | :x: | No git/PR integration |

**Score: 4/10**

---

### 2.4 AWS CLI (`aws`)

The cloud infrastructure CLI. Relevant AI/compute features.

| # | Feature | Slopshop Has? | Notes |
|---|---------|---------------|-------|
| 1 | **Bedrock model invocation** -- `aws bedrock-runtime invoke-model` | :white_check_mark: | `slop call llm-*` invokes AI models |
| 2 | **~100 foundation models** -- Claude, GPT, Llama, Mistral, etc. | :x: | Platform-managed model, no model marketplace |
| 3 | **Knowledge Bases** -- multimodal RAG with documents, video, audio | :white_check_mark: | Knowledge graph and memory APIs |
| 4 | **AgentCore** -- agent policy controls, guardrails | :white_check_mark: | `slop org` has agent management; approval workflows exist |
| 5 | **Structured output** -- `--output json/table/text/yaml` | :white_check_mark: | `--json`, `--quiet` modes |
| 6 | **Profiles & SSO** -- `--profile`, `aws sso login` | :x: | Single profile only |
| 7 | **Pagination & auto-paging** -- `--page-size`, `--max-items` | :x: | No pagination controls |
| 8 | **Waiters** -- `aws ... wait` for async operations | :x: | No built-in waiters |
| 9 | **S3 sync/transfer** -- `aws s3 sync`, multipart upload | :x: | Has S3 upload API but no sync |
| 10 | **CloudFormation/IaC** -- `aws cloudformation deploy` | :x: | No infrastructure-as-code |

**Score: 4/10**

---

### 2.5 VERCEL CLI (`vercel`)

Deployment and development platform CLI.

| # | Feature | Slopshop Has? | Notes |
|---|---------|---------------|-------|
| 1 | **One-command deploy** -- `vercel` deploys preview, `vercel --prod` for production | :x: | No deployment commands |
| 2 | **Environment variable management** -- `vercel env add/remove/pull` | :x: | Has config but no env var lifecycle |
| 3 | **Log streaming & querying** -- `vercel logs` with filters | :x: | `slop stats` shows usage but no log streaming |
| 4 | **Domain management** -- `vercel domains add/rm/inspect` | :x: | No domain management |
| 5 | **Activity tracking** -- `vercel activity` for event timeline | :white_check_mark: | `slop stats` provides usage/activity data |
| 6 | **Marketplace integration** -- `vercel discover`, `vercel guide` | :white_check_mark: | `slop discover` + `slop search` are equivalent |
| 7 | **Direct API access** -- `vercel api ls`, `vercel api [endpoint]` | :white_check_mark: | `slop call <any-slug>` is exactly this |
| 8 | **OAuth 2.0 login flow** -- device flow authentication | :x: | Email/password auth only |
| 9 | **Rollback/promote** -- `vercel rollback`, `vercel promote` | :x: | No deployment lifecycle |
| 10 | **Local dev server** -- `vercel dev` runs local preview | :x: | Server runs via `node server-v2.js` but no `slop dev` command |

**Score: 3/10**

---

### 2.6 SUPABASE CLI (`supabase`)

Database, auth, and backend CLI.

| # | Feature | Slopshop Has? | Notes |
|---|---------|---------------|-------|
| 1 | **Local stack** -- `supabase start` runs Postgres, Auth, Storage locally via Docker | :x: | No local database stack |
| 2 | **Database migrations** -- `supabase migration new/up/repair` | :x: | No migration system |
| 3 | **Type generation** -- `supabase gen types typescript` from DB schema | :x: | Has JSON-to-TypeScript API but not DB-driven |
| 4 | **Edge Functions** -- `supabase functions serve/deploy/delete` | :x: | No serverless function deployment |
| 5 | **Auth management** -- users, sessions, providers | :white_check_mark: | `slop signup/login/whoami/key` provides auth lifecycle |
| 6 | **Project linking** -- `supabase link --project-ref` | :x: | `slop config base_url` is partial equivalent |
| 7 | **Database branching** -- preview branches for schema changes | :x: | No database branching |
| 8 | **Storage management** -- bucket create/list, object upload | :x: | Has S3 upload API but not managed storage |
| 9 | **Seed data** -- `supabase db seed` | :x: | Has fake data generation APIs |
| 10 | **Multi-environment** -- dev/staging/prod environment management | :x: | Single environment via `base_url` |

**Score: 1/10**

---

### 2.7 STRIPE CLI (`stripe`)

Payment infrastructure CLI.

| # | Feature | Slopshop Has? | Notes |
|---|---------|---------------|-------|
| 1 | **Webhook listening** -- `stripe listen --forward-to localhost:3000` | :x: | No webhook listener |
| 2 | **Event triggering** -- `stripe trigger payment_intent.succeeded` | :x: | Has webhook trigger API but not Stripe-specific |
| 3 | **Log tailing** -- `stripe logs tail` real-time API logs | :x: | No real-time log tailing |
| 4 | **Resource CRUD** -- `stripe customers create --email x` | :white_check_mark: | `slop call` with params is equivalent pattern |
| 5 | **Multi-profile login** -- `stripe login list`, `stripe login switch` | :x: | Single profile |
| 6 | **Non-interactive mode** -- `--non-interactive`, `--complete` flags | :white_check_mark: | `--quiet`, `--json` flags serve same purpose |
| 7 | **Fixtures** -- `stripe fixtures` for test data setup | :x: | Has fake data APIs but no fixture system |
| 8 | **API resource explorer** -- interactive shell for API exploration | :white_check_mark: | `slop search` + `slop call --help` serve this purpose |
| 9 | **Samples** -- `stripe samples create` for starter code | :x: | No code sample generation |
| 10 | **Apps management** -- `stripe apps create/start/upload` | :x: | No app packaging system |

**Score: 3/10**

---

### 2.8 RAILWAY CLI (`railway`)

Cloud deployment platform CLI.

| # | Feature | Slopshop Has? | Notes |
|---|---------|---------------|-------|
| 1 | **One-command deploy** -- `railway deploy` (or `railway up`) | :x: | No deployment |
| 2 | **Live shell access** -- `railway shell` into running service | :x: | No remote shell |
| 3 | **Log streaming** -- `railway logs` with filtering | :x: | No log streaming |
| 4 | **Environment management** -- `railway environment` create/switch | :x: | Single environment |
| 5 | **Secret/variable management** -- `railway variables set/get` | :white_check_mark: | `slop memory set/get` is functionally similar |
| 6 | **Domain management** -- `railway domain` custom domains | :x: | No domain management |
| 7 | **Volume management** -- `railway volume add/list/delete` | :x: | No volume/storage management |
| 8 | **Service linking** -- `railway link` to connect local to cloud | :x: | `slop config base_url` is partial |
| 9 | **Local run with cloud env** -- `railway run <cmd>` | :x: | No env injection |
| 10 | **Rollback** -- `railway redeploy` previous versions | :x: | No version management |

**Score: 1/10**

---

### 2.9 CURSOR CLI

AI coding agent in the terminal. Launched Jan 2026.

| # | Feature | Slopshop Has? | Notes |
|---|---------|---------------|-------|
| 1 | **Plan mode** -- design approach before coding | :x: | No planning mode |
| 2 | **Ask mode** -- explore code without making changes | :x: | `slop search`/`slop discover` explore APIs, not code |
| 3 | **Cloud handoff** -- prepend `&` to send task to cloud agent | :x: | No cloud handoff |
| 4 | **Word-level diff highlighting** -- precise inline diffs | :x: | Has text-diff API but no inline terminal rendering |
| 5 | **Mermaid diagram rendering** -- ASCII diagrams in terminal | :x: | No diagram rendering |
| 6 | **MCP server management** -- `/mcp enable/disable` | :white_check_mark: | `slop mcp` provides MCP setup |
| 7 | **Model switching** -- `/models`, `--list-models` | :x: | Fixed model |
| 8 | **Rules management** -- `/rules` create/edit rules | :x: | No rules/constraints system |
| 9 | **Multi-mode operation** -- agent/plan/ask modes | :x: | Single mode (call/run) |
| 10 | **Background tasks** -- `/bashes` manage background processes | :x: | No background task management |

**Score: 1/10**

---

### 2.10 WARP TERMINAL

Modern terminal with built-in AI agent (Oz).

| # | Feature | Slopshop Has? | Notes |
|---|---------|---------------|-------|
| 1 | **AI command suggestions** -- natural language to shell commands | :white_check_mark: | `slop run` + natural language routing |
| 2 | **Error debugging** -- AI explains and fixes errors | :x: | No error debugging |
| 3 | **Workflow blocks** -- group commands into reusable blocks | :white_check_mark: | `slop pipe` chains APIs into workflows |
| 4 | **AI search** -- search terminal history with AI | :x: | No terminal history search |
| 5 | **Oz agent** -- full terminal use + computer use agent | :x: | No computer-use agent |
| 6 | **Command palette** -- searchable command index | :white_check_mark: | `slop search` + `slop discover` |
| 7 | **Collaborative terminals** -- shared sessions | :x: | No shared terminal sessions |
| 8 | **Notebook-style output** -- blocks with copy/share | :x: | Standard terminal output |
| 9 | **Custom themes/keybindings** -- full UI customization | :x: | Only `--no-color` flag |
| 10 | **Privacy-first** -- no data retention, no training on input | :white_check_mark: | Self-hostable, data stays on your infra |

**Score: 4/10**

---

## 3. FEATURE PARITY MATRIX

Legend: Y = slopshop has it | -- = missing | ~ = partial

| Feature Domain | Claude Code | Codex CLI | GH Copilot | AWS CLI | Vercel | Supabase | Stripe | Railway | Cursor | Warp |
|----------------|:-----------:|:---------:|:----------:|:-------:|:------:|:--------:|:------:|:-------:|:------:|:----:|
| **Auth & Account** | | | | | | | | | | |
| Signup/login/whoami | -- | -- | -- | ~ | Y | Y | ~ | ~ | -- | -- |
| API key management | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Multi-profile | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| OAuth/SSO login | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| **API/Tool Calling** | | | | | | | | | | |
| Call any API by slug | -- | -- | -- | Y | Y | -- | Y | -- | -- | -- |
| Chain/pipe APIs | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Natural language task | Y | Y | Y | -- | -- | -- | -- | -- | Y | Y |
| Semantic API search | -- | -- | -- | -- | Y | -- | -- | -- | -- | -- |
| Goal-based discovery | -- | -- | -- | -- | Y | -- | -- | -- | -- | -- |
| **AI Coding** | | | | | | | | | | |
| File editing | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Code review | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Git integration | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Plan mode | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Model switching | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| **Agent Orchestration** | | | | | | | | | | |
| Org management | -- | -- | ~ | -- | -- | -- | -- | -- | -- | -- |
| Chain management | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Agent memory | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Broadcast/swarm | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| **Infrastructure** | | | | | | | | | | |
| Deploy | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Log streaming | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Env/secret mgmt | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Rollback | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| **Developer UX** | | | | | | | | | | |
| JSON output mode | -- | Y | -- | Y | -- | -- | Y | -- | -- | -- |
| Quiet/scripting mode | -- | -- | -- | -- | -- | -- | Y | -- | -- | -- |
| Stdin piping | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| MCP integration | Y | Y | Y | -- | -- | -- | -- | -- | Y | -- |
| **Payments** | | | | | | | | | | |
| Credit balance | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Buy credits | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
| Webhook listening | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |

**Overall slopshop parity scores:**

| Competitor | Slopshop Has | Missing | Parity % |
|------------|:------------:|:-------:|:--------:|
| Claude Code | 2/10 | 8 | 20% |
| Codex CLI | 2/10 | 8 | 20% |
| GH Copilot | 4/10 | 6 | 40% |
| AWS CLI (AI) | 4/10 | 6 | 40% |
| Vercel | 3/10 | 7 | 30% |
| Supabase | 1/10 | 9 | 10% |
| Stripe | 3/10 | 7 | 30% |
| Railway | 1/10 | 9 | 10% |
| Cursor | 1/10 | 9 | 10% |
| Warp | 4/10 | 6 | 40% |

---

## 4. TOP 30 MISSING FEATURES RANKED BY IMPACT

Ranked by: (1) how many competitors have it, (2) developer demand, (3) feasibility with existing slopshop APIs.

| Rank | Feature | Competitors with it | Impact | Feasibility |
|------|---------|:-------------------:|:------:|:-----------:|
| 1 | **Local file read/write** -- read and edit files on disk | 5 (CC, Codex, GHC, Cursor, Warp) | CRITICAL | Medium -- new handler |
| 2 | **Git integration** -- status, diff, commit, push, PR | 4 (CC, Codex, GHC, Cursor) | CRITICAL | Medium -- shell exec |
| 3 | **Plan mode** -- plan before executing, approve steps | 3 (GHC, Codex, Cursor) | HIGH | Easy -- new command wrapping `slop run` |
| 4 | **Deploy command** -- `slop deploy` to push to Fly/Railway/Vercel | 3 (Vercel, Railway, Supabase) | HIGH | Medium -- call external CLIs |
| 5 | **Log streaming/tailing** -- real-time server logs | 4 (Vercel, Stripe, Railway, AWS) | HIGH | Easy -- SSE from `/v1/logs/stream` |
| 6 | **Model selection** -- choose which AI model to use | 4 (CC, Codex, GHC, Cursor) | HIGH | Easy -- `--model` flag to existing LLM APIs |
| 7 | **Session persistence** -- resume previous conversations | 3 (CC, Codex, Cursor) | HIGH | Medium -- local SQLite |
| 8 | **Multi-profile support** -- switch between accounts/envs | 3 (AWS, Stripe, Supabase) | MEDIUM | Easy -- expand config.json |
| 9 | **Interactive TUI** -- full-screen terminal UI | 2 (Codex, Warp) | MEDIUM | Hard -- needs blessed/ink |
| 10 | **Plugin/extension system** -- install community commands | 2 (GHC, CC) | HIGH | Medium -- load from ~/.slopshop/plugins/ |
| 11 | **Webhook listener** -- `slop listen` forward events locally | 2 (Stripe, Vercel) | HIGH | Medium -- HTTP server in CLI |
| 12 | **Cloud task handoff** -- send task to cloud, resume later | 2 (Codex, Cursor) | MEDIUM | Easy -- existing API queue |
| 13 | **Code review** -- review working tree or staged changes | 3 (CC, Codex, GHC) | HIGH | Medium -- read files + LLM API |
| 14 | **Error debugging** -- explain and fix terminal errors | 2 (Warp, CC) | MEDIUM | Easy -- pipe stderr to LLM API |
| 15 | **Env variable management** -- `slop env set/get/pull` | 3 (Vercel, Railway, Supabase) | MEDIUM | Easy -- extend memory or new namespace |
| 16 | **OAuth/device flow login** -- modern auth flow | 2 (Vercel, AWS) | MEDIUM | Medium -- OAuth implementation |
| 17 | **Voice input** -- push-to-talk | 1 (CC) | MEDIUM | Hard -- needs audio capture |
| 18 | **Local dev server** -- `slop dev` runs server locally | 2 (Vercel, Supabase) | MEDIUM | Easy -- already have `node server-v2.js` |
| 19 | **Watch mode** -- re-run on file changes | 2 (Vercel, Supabase) | LOW | Easy -- fs.watch wrapper |
| 20 | **Type generation** -- generate types from API schema | 2 (Supabase, AWS) | MEDIUM | Easy -- existing openapi.json |
| 21 | **Conversation forking** -- explore alternatives in parallel | 1 (Codex) | LOW | Medium -- session branching |
| 22 | **Diagram rendering** -- Mermaid/ASCII diagrams in terminal | 1 (Cursor) | LOW | Easy -- text rendering |
| 23 | **Pagination controls** -- `--limit`, `--offset` on list commands | 2 (AWS, Vercel) | MEDIUM | Easy -- pass through to API |
| 24 | **Custom themes** -- color schemes, prompt customization | 1 (Warp) | LOW | Easy -- config file |
| 25 | **Completion scripts** -- bash/zsh/fish autocompletion | 3 (AWS, Railway, Stripe) | MEDIUM | Easy -- generate completions |
| 26 | **Batch execution** -- `slop batch file.json` run many calls | 2 (AWS, Stripe) | MEDIUM | Easy -- existing `/v1/batch` endpoint |
| 27 | **Cost estimation** -- preview cost before running | 2 (CC, AWS) | MEDIUM | Easy -- existing dry-run endpoint |
| 28 | **Rollback** -- undo last operation | 2 (Vercel, Railway) | LOW | Medium -- operation log |
| 29 | **Progress indicators** -- spinners, progress bars | 4 (Vercel, Railway, Stripe, AWS) | MEDIUM | Easy -- terminal spinners |
| 30 | **Alias system** -- `slop alias hash="call crypto-hash-sha256"` | 1 (Warp) | LOW | Easy -- config file |

---

## 5. CLI COMMAND SPECS FOR EACH MISSING FEATURE

### #1 -- Local File Read/Write

```
slop file read <path>              # Read file contents
slop file write <path> --content "..." # Write to file
slop file edit <path> --find "old" --replace "new"
```

**API endpoint:** New handler `handlers/filesystem.js`
- `POST /v1/file-read` -- `{ path }` -> `{ content, size, modified }`
- `POST /v1/file-write` -- `{ path, content }` -> `{ ok, bytes_written }`
- Requires local-mode flag (`--local`) for security

### #2 -- Git Integration

```
slop git status                     # Show working tree status
slop git diff [--staged]            # Show changes
slop git commit "message"           # Commit with message
slop git push                       # Push to remote
slop git pr "title" --body "desc"   # Create PR via gh CLI
slop git log [--limit N]            # Recent commits
```

**API endpoint:** New handler `handlers/git.js`
- Wraps `child_process.execSync` for git commands
- Local-only, no API credits needed
- `POST /v1/git-status` -> `{ branch, staged, unstaged, untracked }`
- `POST /v1/git-commit` -- `{ message }` -> `{ sha, message }`

### #3 -- Plan Mode

```
slop plan "build a REST API for users"  # Generate plan without executing
slop plan --execute                     # Execute the approved plan
slop plan --show                        # Show last plan
```

**API endpoint:** `POST /v1/agent/plan` -- `{ task }` -> `{ steps[], estimated_credits, estimated_time }`
Uses existing `llm-*` handlers to generate plan, existing `slop run` to execute.

### #4 -- Deploy Command

```
slop deploy                         # Deploy to configured platform
slop deploy --platform fly          # Deploy to Fly.io
slop deploy --platform railway      # Deploy to Railway
slop deploy --platform vercel       # Deploy to Vercel
slop deploy status                  # Check deployment status
slop deploy rollback                # Rollback to previous
```

**API endpoint:** New handler `handlers/deploy.js`
- Wraps platform CLIs (`flyctl`, `railway`, `vercel`)
- `POST /v1/deploy` -- `{ platform, config }` -> `{ url, status, deployment_id }`
- `POST /v1/deploy-status` -- `{ deployment_id }` -> `{ status, url, created_at }`

### #5 -- Log Streaming

```
slop logs                           # Stream server logs
slop logs --follow                  # Continuous tail
slop logs --filter "error"          # Filter by pattern
slop logs --since 1h                # Last hour
slop logs --json                    # JSON format
```

**API endpoint:** `GET /v1/logs/stream` (SSE endpoint)
- New SSE handler in `server-v2.js`
- `GET /v1/logs?since=1h&filter=error` -> `{ entries[] }`
- CLI uses EventSource or raw HTTP streaming

### #6 -- Model Selection

```
slop models                         # List available models
slop models set claude-opus-4.6     # Set default model
slop call llm-summarize --model gpt-5.4 --text "..."  # Per-call model
slop config default_model claude-sonnet-4.6
```

**API endpoint:** Extend existing `/v1/llm-*` endpoints
- Add `model` parameter to all LLM handler inputs
- `GET /v1/models` -> `{ models: [{ id, name, provider, cost_multiplier }] }`
- Store in config: `default_model` key

### #7 -- Session Persistence

```
slop session list                   # List saved sessions
slop session resume <id>            # Resume a session
slop session save "name"            # Save current session
slop session delete <id>            # Delete session
slop run --resume "continue where I left off"
```

**API endpoint:** Extend `memory-*` endpoints with session namespace
- `POST /v1/session/save` -- `{ name, context }` -> `{ session_id }`
- `POST /v1/session/resume` -- `{ session_id }` -> `{ context, history }`
- Local SQLite storage in `~/.slopshop/sessions.db`

### #8 -- Multi-Profile Support

```
slop profile list                   # Show all profiles
slop profile add <name>             # Create new profile
slop profile switch <name>          # Switch active profile
slop profile remove <name>          # Delete profile
slop call --profile staging text-word-count --text "test"
```

**API endpoint:** No API needed -- pure CLI config
- Expand `~/.slopshop/config.json` to support `profiles: { name: { api_key, base_url, email } }`
- `--profile <name>` flag overrides active profile

### #9 -- Interactive TUI

```
slop tui                            # Launch full-screen terminal UI
slop interactive                    # Alias
```

**API endpoint:** No new API -- wraps existing commands
- Use `blessed` or `ink` for React-like terminal UI
- Panels: API browser, call builder, results, memory, logs
- Keyboard navigation, search, inline help

### #10 -- Plugin/Extension System

```
slop plugin install <github-url>    # Install from GitHub
slop plugin list                    # List installed plugins
slop plugin remove <name>           # Remove plugin
slop plugin create <name>           # Scaffold new plugin
```

**API endpoint:** No API needed -- file system operations
- Plugins stored in `~/.slopshop/plugins/`
- Each plugin: `{ name, commands: [...], handlers: [...] }`
- Loaded at CLI startup, merged into command dispatch

### #11 -- Webhook Listener

```
slop listen                         # Listen for all webhook events
slop listen --forward-to localhost:3000/webhook
slop listen --events "memory.set,chain.complete"
slop listen --filter "org:my-org-id"
```

**API endpoint:** `GET /v1/events/stream` (SSE)
- Subscribe to platform events via server-sent events
- CLI spins up local HTTP proxy to forward events
- `POST /v1/webhooks/register` -- `{ url, events[] }` -> `{ webhook_id }`

### #12 -- Cloud Task Handoff

```
slop cloud run "refactor auth module"   # Send task to cloud
slop cloud status <task-id>             # Check progress
slop cloud list                         # List cloud tasks
slop cloud pull <task-id>               # Pull results locally
```

**API endpoint:** Extend existing `POST /v1/agent/run`
- `POST /v1/agent/run` with `{ async: true }` returns `{ task_id }`
- `GET /v1/agent/task/<id>` -> `{ status, progress, result }`
- Leverages existing prompt queue infrastructure

### #13 -- Code Review

```
slop review                         # Review staged changes
slop review <file>                  # Review specific file
slop review --pr 42                 # Review a PR
slop review --severity high         # Only high-severity issues
```

**API endpoint:** `POST /v1/llm-code-review`
- Existing API: combine `git diff` output with LLM analysis
- `{ code, language, context }` -> `{ issues[], summary, score }`

### #14 -- Error Debugging

```
slop debug "error message here"             # Explain an error
slop debug --last                           # Debug last command's stderr
command 2>&1 | slop debug                   # Pipe errors directly
```

**API endpoint:** `POST /v1/llm-debug-error`
- `{ error, context, language }` -> `{ explanation, fix, command }`
- Existing LLM infrastructure handles this

### #15 -- Environment Variable Management

```
slop env list                       # List env vars for project
slop env set KEY=value              # Set env var
slop env get KEY                    # Get env var
slop env pull                       # Pull remote env vars to .env
slop env push                       # Push local .env to remote
```

**API endpoint:** Extend `memory-*` with `env:` namespace
- `POST /v1/env/set` -- `{ key, value, environment }` -> `{ ok }`
- `POST /v1/env/list` -- `{ environment }` -> `{ vars: {} }`
- Stored as `env:<project>:<key>` in memory system

### #16 -- OAuth/Device Flow Login

```
slop login --oauth                  # Opens browser for OAuth flow
slop login --device                 # Device code flow for headless
```

**API endpoint:** `POST /v1/auth/device-code` -> `{ device_code, user_code, verification_uri }`
- `POST /v1/auth/device-token` -- `{ device_code }` -> `{ api_key }` (polls until approved)

### #17 -- Voice Input

```
slop voice                          # Start voice mode
slop run --voice                    # Voice-activated task execution
```

**API endpoint:** No new API -- local audio capture + existing STT
- Use system microphone via `node-record-lpcm16` or similar
- Send audio to Whisper API or `POST /v1/llm-transcribe`
- Feed transcription into `slop run`

### #18 -- Local Dev Server

```
slop dev                            # Start local dev server
slop dev --port 8080                # Custom port
slop dev --watch                    # Auto-restart on changes
```

**API endpoint:** No new API -- wraps `node server-v2.js`
- Simple wrapper around existing server startup
- Adds file watching with `fs.watch` or `chokidar`
- Shows colored log output with request details

### #19 -- Watch Mode

```
slop watch <slug> --file input.txt  # Re-run API when file changes
slop watch "slop pipe a b c" --dir ./src
```

**API endpoint:** No new API -- CLI-only feature
- `fs.watch` on specified files/dirs
- Re-executes command on change
- Debounced (300ms default)

### #20 -- Type Generation

```
slop types                          # Generate TypeScript types for all APIs
slop types --output ./types.d.ts    # Save to file
slop types --lang go                # Generate Go types
slop types <slug>                   # Types for specific API
```

**API endpoint:** `GET /v1/types?format=typescript` or use existing `openapi.json`
- Parse `openapi.json` schemas into TypeScript interfaces
- Extend `openapi-gen.js` to output type definitions
- Support TypeScript, Go, Python, Rust

### #21 -- Conversation Forking

```
slop fork                           # Fork current session into parallel thread
slop fork --from <session-id>       # Fork from a saved session
```

**API endpoint:** Extend session system (#7)
- Clone session context into new session ID
- Both sessions continue independently

### #22 -- Diagram Rendering

```
slop diagram "flowchart of auth flow"   # Generate ASCII diagram
slop call llm-diagram --desc "..."      # Via API
```

**API endpoint:** `POST /v1/llm-diagram`
- `{ description, format }` -> `{ diagram, mermaid_source }`
- Render Mermaid to ASCII in terminal using `cli-diagram` or similar

### #23 -- Pagination Controls

```
slop list --limit 20 --offset 40    # Paginate API list
slop list --page 3                  # Page-based navigation
```

**API endpoint:** Already supported by `/v1/tools?limit=20&offset=40`
- Pass through `--limit` and `--offset` flags to API
- Display page info: "Showing 41-60 of 1250"

### #24 -- Custom Themes

```
slop theme list                     # Show available themes
slop theme set dracula              # Apply theme
slop config theme monokai           # Set via config
```

**API endpoint:** No API -- CLI config only
- Theme presets in `themes/` directory
- Config: `theme: "dracula"` in config.json
- Override colors for output, errors, highlights

### #25 -- Shell Completion Scripts

```
slop completion bash > /etc/bash_completion.d/slop
slop completion zsh > ~/.zsh/completions/_slop
slop completion fish > ~/.config/fish/completions/slop.fish
```

**API endpoint:** No API needed -- generated from command list
- Static completion scripts generated from command structure
- Dynamic completion for `slop call <TAB>` queries `/v1/tools`

### #26 -- Batch Execution

```
slop batch calls.json               # Execute batch from file
slop batch --parallel 5 calls.json  # Parallel execution
echo '[{"slug":"..","input":{}}]' | slop batch --stdin
```

**API endpoint:** Existing `POST /v1/batch`
- `{ calls: [{ slug, input }] }` -> `{ results: [...] }`
- CLI reads JSON file, sends to batch endpoint
- Shows progress: "3/10 complete..."

### #27 -- Cost Estimation

```
slop cost <slug>                    # Show credit cost for API
slop cost "slop pipe a b c"        # Estimate pipe cost
slop call <slug> --dry-run          # Preview without executing
```

**API endpoint:** Existing `POST /v1/dry-run/<slug>`
- Already implemented server-side
- CLI just needs to surface it as `--dry-run` flag and `slop cost` command

### #28 -- Rollback

```
slop rollback                       # Undo last memory/chain operation
slop rollback <operation-id>        # Undo specific operation
slop history                        # Show operation history
```

**API endpoint:** `POST /v1/operations/rollback` -- `{ operation_id }` -> `{ ok, rolled_back }`
- Track operations in SQLite with before/after state
- `GET /v1/operations/history` -> `{ operations[] }`

### #29 -- Progress Indicators

No API needed. CLI enhancement only.
- Add ora-style spinners during API calls
- Progress bars for batch operations
- Elapsed time display

### #30 -- Alias System

```
slop alias set hash "call crypto-hash-sha256"
slop alias set uuid "call crypto-uuid"
slop alias list
slop alias remove <name>
slop hash --text "hello"            # Runs the alias
```

**API endpoint:** No API -- config file only
- Store aliases in `~/.slopshop/config.json` under `aliases: {}`
- Resolve aliases before command dispatch in `main()`

---

## 6. PUBLIC BENCHMARKS & HOW TO COMPETE

### Existing Benchmarks

| Benchmark | What It Measures | Leaders | Slopshop Relevance |
|-----------|-----------------|---------|-------------------|
| **SWE-bench** | Autonomous code repair from GitHub issues | Claude Code (67% quality wins) | LOW -- slopshop is an API platform, not a code agent |
| **Figma-to-Code cloning** | Frontend code generation from designs | Codex CLI (4x token efficiency) | LOW -- different domain |
| **AI Coding Agent rankings** (LogRocket, NxCode, MorphLLM) | Overall coding agent quality, speed, cost | Claude Code #1 quality, Codex #1 speed | MEDIUM -- `slop run` could be benchmarked |
| **Hyperfine CLI benchmarks** | Command execution time, startup latency | ripgrep, fd, bat | HIGH -- measure `slop call` latency |
| **API response time benchmarks** | P50/P95/P99 latency | Varies | HIGH -- slopshop can compete directly |

### Benchmarks Slopshop Should Create & Publish

1. **API Call Latency Benchmark**
   - Measure P50/P95/P99 for `slop call` across all 1,250 APIs
   - Compare against raw `curl` to same endpoints
   - Target: <50ms P50 for compute APIs, <200ms for LLM APIs
   - Tool: `hyperfine 'slop call crypto-uuid --json'`

2. **CLI Startup Time Benchmark**
   - Measure cold start and warm start times
   - Compare against competitors: `hyperfine 'slop help' 'gh copilot --help' 'vercel --help'`
   - Target: <100ms cold start (Node.js CLI overhead)
   - Current advantage: zero native deps, pure JS

3. **Pipe Throughput Benchmark**
   - Measure `slop pipe` with 5-10 step chains
   - Compare total wall time vs. sum of individual calls
   - Quantify overhead per pipe step

4. **API Breadth Benchmark** (unique to slopshop)
   - "How many distinct operations can you do from a single CLI?"
   - slopshop: 1,250+ | Stripe: ~200 | AWS: ~300 (AI subset) | Vercel: ~30
   - Publish as "API density" metric

5. **Agent Orchestration Benchmark**
   - Measure org launch time, chain execution latency, memory read/write speed
   - No direct competitor benchmark exists -- define the category

6. **Natural Language Routing Accuracy**
   - Test 100 natural language inputs against `slop <natural language>`
   - Measure % correctly routed to intended API
   - Compare against `gh copilot suggest` accuracy

### How to Compete on Benchmarks

| Strategy | Action |
|----------|--------|
| **Own "API breadth"** | Nobody else has 1,250 tools in one CLI. Publish the number prominently. |
| **Own "zero-dep startup"** | Node.js with no native modules = fast install, fast start. Benchmark against Go-based CLIs. |
| **Own "pipe composability"** | No other CLI chains arbitrary APIs. Benchmark pipe throughput and publish. |
| **Own "agent orchestration from terminal"** | Org/chain/memory from CLI is unique. Create benchmark category. |
| **Avoid coding benchmarks** | SWE-bench etc. are not slopshop's domain. Don't compete there. |
| **Create a leaderboard** | Host at slopshop.gg/benchmarks with live numbers, invite community contributions. |

---

## 7. SOURCES

- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code Slash Commands](https://code.claude.com/docs/en/slash-commands)
- [Claude Code March 2026 Updates](https://pasqualepillitteri.it/en/news/381/claude-code-march-2026-updates)
- [OpenAI Codex CLI Features](https://developers.openai.com/codex/cli/features)
- [OpenAI Codex CLI Command Reference](https://developers.openai.com/codex/cli/reference)
- [Codex CLI Slash Commands](https://developers.openai.com/codex/cli/slash-commands)
- [GitHub Copilot CLI](https://github.com/features/copilot/cli)
- [GitHub Copilot CLI GA Announcement](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/)
- [GitHub Copilot CLI: Plan Before You Build](https://github.blog/changelog/2026-01-21-github-copilot-cli-plan-before-you-build-steer-as-you-go/)
- [Vercel CLI Overview](https://vercel.com/docs/cli)
- [Vercel CLI API Command](https://vercel.com/changelog/introducing-the-vercel-api-cli-command)
- [Vercel CLI Logs for Agents](https://vercel.com/changelog/vercel-logs-cli-command-now-optimized-for-agents-with-historical-log-querying)
- [Supabase CLI Getting Started](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli/introduction)
- [Stripe CLI Documentation](https://docs.stripe.com/stripe-cli)
- [Stripe CLI GitHub Releases](https://github.com/stripe/stripe-cli/releases)
- [Railway CLI Documentation](https://docs.railway.com/cli)
- [Railway CLI Reference](https://docs.railway.com/reference/cli-api)
- [Cursor CLI Jan 2026 Update](https://cursor.com/changelog/cli-jan-08-2026)
- [Cursor CLI Jan 16 2026 Update](https://cursor.com/changelog/cli-jan-16-2026)
- [Cursor CLI Features](https://cursor.com/features)
- [Warp Terminal All Features](https://www.warp.dev/all-features)
- [Warp Terminal AI 2.0 Review 2026](https://www.bestaitoolswiki.com/tools/warp-terminal-ai-2)
- [Amazon Bedrock](https://aws.amazon.com/bedrock/)
- [AWS CLI AI Features 2026](https://dev.to/learnwithprashik/aws-ai-in-2026-what-every-developer-needs-to-know-4am2)
- [AI Dev Tool Power Rankings March 2026 (LogRocket)](https://blog.logrocket.com/ai-dev-tool-power-rankings/)
- [Claude Code vs Codex CLI 2026 (NxCode)](https://www.nxcode.io/resources/news/claude-code-vs-codex-cli-terminal-coding-comparison-2026)
- [Best AI Coding CLI Tools 2026 (Awesome Agents)](https://awesomeagents.ai/tools/best-ai-coding-cli-tools-2026/)
- [15 AI Coding Agents Tested (MorphLLM)](https://www.morphllm.com/ai-coding-agent)

---

## EXECUTIVE SUMMARY

**Slopshop's unique strengths:**
- 1,250+ real APIs callable from a single CLI (no competitor comes close)
- API chaining/piping as a first-class primitive (unique)
- Agent orchestration (org, chain, memory) from the terminal (unique)
- Natural language routing to APIs without explicit commands (rare)
- Self-hostable, zero native dependencies
- MCP integration for Claude Code

**Critical gaps (implement first):**
1. Local file read/write (5 competitors have this)
2. Git integration (4 competitors)
3. Plan mode (3 competitors)
4. Log streaming (4 competitors)
5. Model selection (4 competitors)
6. Shell completion scripts (3 competitors, easy win)
7. Progress indicators (4 competitors, easy win)
8. Batch execution (already have the API endpoint)
9. Cost estimation / dry-run (already have the API endpoint)
10. Pagination controls (already supported by API)

**Quick wins (can ship in <1 day each):**
- `slop dev` (wrap existing server startup)
- `slop cost` / `--dry-run` (existing endpoint)
- `slop batch` (existing `/v1/batch` endpoint)
- `slop completion bash/zsh/fish` (generate from command list)
- Pagination flags on `slop list`
- Progress spinners on all network calls
- `slop alias` (config file aliases)
- `slop profile` (multi-profile in config)

**Estimated effort to reach 70% parity with all 10 competitors: ~15-20 features, ~2-3 weeks of focused CLI development.**
