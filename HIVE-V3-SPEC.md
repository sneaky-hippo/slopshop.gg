# Hive v3 -- Production Architecture Spec

**Date:** 2026-03-29
**Status:** Design complete, ready for implementation
**Author:** Architecture session (Claude Opus 4.6 + founder review)

---

## 0. Design Principles (derived from 330 sprints of data)

| Finding | Implication |
|---------|-------------|
| Local edit quality: 29% | Local models NEVER touch files autonomously |
| CLAUDE.md injection: 0% -> 100% awareness | Inject CLAUDE.md into every local prompt |
| Sweet spot: 1 issue + 1 file | Never dump full codebase context |
| 3-gate validation catches ~15% of bad edits | Not enough. Cloud must review before merge |
| 56% semantic bugs undetectable | Only cloud models (Claude) write code |
| Local sprints $0, cloud ~$0.01-0.03 | Local does 90% of work, cloud does 10% |

**Core rule:** The hive is a RESEARCH ENGINE that produces validated TODOs and cloud-reviewed patches. It is not an autonomous coder.

---

## 1. Session Lifecycle

### 1.1 Session Start (`hiveSessionInit`)

```
slopshop hive 500 "improve error handling" --cloud-every=10
```

**Sequence:**

```
1. Parse args: sprints=500, mission="improve error handling", cloudEvery=10
2. Load CLAUDE.md from __dirname/CLAUDE.md (800 chars)
3. Load NORTH-STAR.md from __dirname/NORTH-STAR.md (250 chars)
4. Load hive-shared.json from CONFIG_DIR/hive-shared.json (prior state)
5. Load hive-metrics.csv (for continuation stats)
6. Git: create branch "hive-{timestamp}" from current HEAD
7. Initial scrape: extract URLs from mission, scrape up to 6
8. Write session header to hive-metrics.csv
9. Initialize rolling context window (see section 5)
```

**Files touched at init:**
- READ: `CLAUDE.md`, `NORTH-STAR.md`, `CONFIG_DIR/hive-shared.json`
- WRITE: `CONFIG_DIR/hive-metrics.csv` (header row)
- GIT: `git checkout -b hive-{ts}`

### 1.2 Context Payload (built once, updated per sprint)

```javascript
const contextPayload = {
  claudeMd: fs.readFileSync('CLAUDE.md', 'utf8'),           // ~800 chars, static
  northStar: fs.readFileSync('NORTH-STAR.md', 'utf8'),      // ~250 chars, static
  mission: args.mission,                                      // user input
  vision: shared.vision,                                      // evolves per sprint
  recentResearch: shared.research.slice(-5),                  // rolling 5
  recentScores: shared.scores.slice(-5),                      // rolling 5
  recentBuilds: shared.builds.slice(-3),                      // rolling 3
  phase: computePhase(shared.scores),                         // EXPLORE|ACCELERATE|FIX|OPTIMIZE
  sprintNum: currentSprint,
  totalSprints: sprints,
};
```

**Total context per prompt: ~2000 chars.** Never more. This is the hard ceiling.

---

## 2. Sprint Execution (per-sprint, exactly this order)

Each sprint is one of two types:
- **LOCAL sprint** (default, $0) -- research, rate, generate TODOs
- **CLOUD sprint** (every Nth, ~$0.02) -- write code, review patches, evolve vision

### 2.1 Sprint Router

```javascript
function sprintType(s, cloudEvery) {
  if (s === 1) return 'CLOUD';           // first sprint always cloud (set direction)
  if (s % cloudEvery === 0) return 'CLOUD'; // every Nth
  return 'LOCAL';
}
```

### 2.2 LOCAL Sprint (5 steps, 1 LLM call)

```
Step 1: SELECT TARGET
  - Pick ONE file from editable list based on sprint number
  - Pick ONE line from that file using candidate scoring
  - Read 5 lines of context around that line

Step 2: INJECT CONTEXT + ASK
  - Build prompt with CLAUDE.md + 1 file + 1 line + mission
  - Call ollama (llama3) with 90s timeout
  - Parse structured response: PRIORITY / VERDICT / SCORE

Step 3: RECORD
  - Append to shared.research[] (capped at 50)
  - Append to todos[] if PRIORITY is actionable
  - Append to hive-metrics.csv

Step 4: PHASE CHECK
  - Recompute phase from last 5 scores
  - If EXPLORE and scores plateauing -> switch to OPTIMIZE
  - If FIX and 3 consecutive improvements -> switch to ACCELERATE

Step 5: SAVE
  - Write shared state to hive-shared.json
  - Store in slopshop memory API (backup)
```

**LOCAL sprints DO NOT edit files. Ever.**

### 2.3 CLOUD Sprint (8 steps, 2-3 LLM calls)

```
Step 1: CEO REVIEW (Cloud LLM call #1)
  - Feed: mission, vision, last 10 TODOs from local sprints, scores trend
  - Ask: "Pick the single highest-impact TODO to implement. Output:
    FILE: <exact filename>
    ISSUE: <one sentence>
    APPROACH: <one sentence>"
  - This is the CEO deciding what to build next

Step 2: READ TARGET FILE
  - Read the full file named in CEO's response
  - If file > 500 lines, read only the relevant function/section
  - Extract the specific region to edit (max 30 lines)

Step 3: GENERATE PATCH (Cloud LLM call #2)
  - Feed: CLAUDE.md + target region + issue + approach
  - Ask for EXACT find/replace with the diff-safe prompt (section 7.3)
  - Parse: FIND block and REPLACE block

Step 4: APPLY PATCH
  - Verify FIND text exists in file (exact match)
  - Apply replacement to file on disk

Step 5: GATE 1 -- SYNTAX
  - node -c "<filepath>" (5s timeout)
  - If fail -> revert, log, continue

Step 6: GATE 2 -- RUNTIME
  - For cli.js: node cli.js version --json --quiet (10s timeout)
  - For server-v2.js: node -e "require('./server-v2.js')" with 5s timeout + SIGTERM
  - For mcp-server.js: node -c mcp-server.js
  - For agent.js: node -c agent.js
  - If fail -> revert, log, continue

Step 7: GATE 3 -- SEMANTIC REVIEW (Cloud LLM call #3, optional)
  - Only for edits that pass gates 1+2
  - Feed: the original code + the new code + the issue being fixed
  - Ask: "Does this edit introduce any of these bugs?
    - .splice instead of .slice
    - inverted boolean logic
    - const reassignment
    - .default added to require()
    - variable shadowing
    - off-by-one errors
    Answer SAFE or DANGEROUS with one-line reason."
  - If DANGEROUS -> revert, log reason

Step 8: COMMIT + RECORD
  - git add <file> && git commit -m "hive S{n}: {issue}"
  - Append to shared.builds[]
  - Append to successfulEdits[]
  - Update hive-metrics.csv with edit=1
```

---

## 3. File Edit Safety System

### 3.1 Branch Isolation

```
Session start:  git checkout -b hive-{timestamp}
Per edit:       git add <file> && git commit -m "hive S{n}: {description}"
Session end:    git checkout master
                Print: "git merge hive-{ts}" or "git branch -D hive-{ts}"
```

Master is NEVER touched during a hive session. All edits are individually committed so any single edit can be reverted with `git revert <sha>`.

### 3.2 Five-Gate Validation Pipeline

```
Gate 0: EXACT MATCH    -- FIND text must exist verbatim in file
Gate 1: SYNTAX         -- node -c passes
Gate 2: RUNTIME        -- file can be required/executed without crash
Gate 3: SEMANTIC       -- cloud LLM review (cloud sprints only)
Gate 4: SIZE           -- replacement not 3x longer than original, not whitespace-only
```

**Any gate failure = immediate revert to backup + log reason.**

### 3.3 Editable Files (whitelist)

```javascript
const EDITABLE_FILES = [
  'server-v2.js',
  'cli.js',
  'mcp-server.js',
  'agent.js',
  'handlers/compute.js',
  'handlers/llm.js',
  'handlers/network.js',
  'handlers/external.js',
  'handlers/memory.js',
  'handlers/orchestrate.js',
  'pipes.js',
  'schemas.js',
];
```

Files NOT on this list cannot be edited by the hive. `registry.js` is excluded because edits there cascade across the entire system. `CLAUDE.md` is excluded because it is the hive's own context source.

### 3.4 Backup Protocol

```javascript
// Before ANY write:
const backup = fs.readFileSync(filePath, 'utf8');

// After failed gate:
fs.writeFileSync(filePath, backup);
console.log(`REVERTED ${filePath} (reason: ${gateFailure})`);
```

No edit is ever applied without a backup in memory. The git branch provides a second layer of safety, but the in-memory backup provides instant revert without git overhead.

---

## 4. CEO Vision Evolution

The "CEO" is the cloud model's strategic layer. It does NOT run every sprint -- it runs on cloud sprints only (every Nth sprint).

### 4.1 Vision State

```javascript
shared.vision = "initial mission text";  // set from args at session start
shared.plan = [];                         // current priority queue (max 5 items)
shared.pivotLog = [];                     // history of vision changes
```

### 4.2 CEO Prompt (runs on cloud sprints, call #1)

```
You are the CEO of an autonomous engineering org working on slopshop.gg.

CODEBASE:
{claudeMd}

NORTH STAR:
{northStar}

CURRENT VISION:
{shared.vision}

COMPLETED IN LAST {cloudEvery} SPRINTS:
{shared.builds.slice(-cloudEvery).map(b => `- ${b.key}: ${b.type}`).join('\n')}

UNRESOLVED TODOS FROM LOCAL SPRINTS:
{todos.slice(-10).map(t => `- [S${t.sprint}] ${t.priority}`).join('\n')}

SCORE TREND: {recentScores.join(' -> ')}
PHASE: {phase}

Your job:
1. Review what local sprints discovered
2. Pick the SINGLE highest-impact TODO to implement now
3. Optionally update the vision if discoveries warrant it

Output EXACTLY:
FILE: <filename from editable list>
ISSUE: <one sentence, specific>
APPROACH: <one sentence, specific>
VISION: <updated vision or "unchanged">
NEXT_PRIORITIES: <comma-separated top 3 for future sprints>
```

### 4.3 Vision Drift Rules

- Vision can only change on cloud sprints
- Each change is logged in `shared.pivotLog` with sprint number and reason
- If vision has changed 3+ times in 50 sprints, CEO prompt gets: "STABILITY WARNING: vision has pivoted {n} times. Only pivot if discoveries are truly significant."
- Vision string is capped at 200 chars

---

## 5. Scaling to 10,000+ Sprints Without Context Overflow

### 5.1 The Rolling Window Strategy

Context is NEVER cumulative. Every prompt gets the same ~2000 char budget regardless of sprint number.

```
STATIC (loaded once, never grows):
  - CLAUDE.md: ~800 chars
  - NORTH-STAR.md: ~250 chars
  - Mission: ~100 chars

ROLLING (fixed-size windows, old items evicted):
  - research[]:     max 50 items, prompt gets last 5    (~300 chars)
  - scores[]:       max 100 items, prompt gets last 5   (~50 chars)
  - builds[]:       max 100 items, prompt gets last 3   (~150 chars)
  - todos[]:        max 50 items, CEO gets last 10      (~500 chars)
  - pivotLog[]:     max 20 items, CEO gets last 3       (~150 chars)

PER-SPRINT (fresh each time):
  - Target file context: 5 lines                         (~250 chars)
  - Phase + trend: computed from rolling scores           (~50 chars)
```

**Total prompt size: ~2000 chars (local) or ~2500 chars (cloud CEO). Constant regardless of sprint count.**

### 5.2 Periodic Compaction (every 100 sprints)

```javascript
if (s % 100 === 0) {
  // Compact research: summarize old entries
  const oldResearch = shared.research.slice(0, -10);
  const kept = shared.research.slice(-10);
  const summary = `[COMPACTED S1-${s-10}] ${oldResearch.length} research items. Key themes: ${extractThemes(oldResearch)}`;
  shared.research = [{ text: summary, sprint: s }].concat(kept);

  // Compact builds: keep only successful edits
  shared.builds = shared.builds.filter(b => b.type === 'file-edit').slice(-20);

  // Compact scores: keep every 10th + last 20
  const sampled = shared.scores.filter((_, i) => i % 10 === 0);
  shared.scores = sampled.concat(shared.scores.slice(-20));
}
```

### 5.3 Metrics File (append-only, never loaded into prompts)

```
CONFIG_DIR/hive-metrics.csv -- one row per sprint, append-only
  Columns: sprint,score,phase,built,qa,edits,reverts,credits,ms,file,priority
```

This file is for human analysis only. It can grow to 10,000+ rows without affecting runtime. The hive never reads it back.

### 5.4 Knowledge Refresh (every 25 sprints)

```javascript
if (s % 25 === 0 && urls.length > 0) {
  const url = urls[s % urls.length];
  const fresh = await slopCall('ext-web-scrape', { url });
  if (fresh.ok) {
    shared.research.push({
      text: `[REFRESH S${s}] ${fresh.data?.title}: ${(fresh.data?.content || '').slice(0, 150)}`,
      sprint: s
    });
  }
}
```

---

## 6. Local vs Cloud Model Strategy

### 6.1 Decision Matrix

| Task | Model | Cost | Why |
|------|-------|------|-----|
| Research (analyze a line) | llama3 local | $0 | Awareness is sufficient; specificity not needed |
| Rate code quality | llama3 local | $0 | Scores are directional, not precise |
| Generate TODO text | llama3 local | $0 | Humans review TODOs anyway |
| CEO vision/priority | Claude cloud | ~$0.01 | Needs reasoning about tradeoffs |
| Write code patch | Claude cloud | ~$0.01 | 29% local vs ~60% cloud success rate |
| Semantic review of patch | Claude cloud | ~$0.01 | Must catch .splice/.slice type bugs |
| Discover new URLs | Claude cloud | ~$0.005 | Needs web knowledge |

### 6.2 Cost Model at Scale

```
10,000 sprints with --cloud-every=10:
  Local sprints:  9,000 x $0.00     = $0.00
  Cloud sprints:  1,000 x $0.03     = $30.00
  Total: ~$30 for 10,000 sprints

10,000 sprints with --cloud-every=25:
  Local sprints:  9,600 x $0.00     = $0.00
  Cloud sprints:    400 x $0.03     = $12.00
  Total: ~$12 for 10,000 sprints
```

### 6.3 Ollama Interface

```javascript
const ollamaChat = (model, prompt) => new Promise((resolve) => {
  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  });
  const req = http.request({
    hostname: 'localhost', port: 11434,
    path: '/api/chat', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeout: 90000,
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try { resolve(JSON.parse(d).message?.content || ''); }
      catch (e) { resolve(''); }
    });
  });
  req.on('error', () => resolve(''));
  req.on('timeout', () => { req.destroy(); resolve(''); });
  req.write(body);
  req.end();
});
```

### 6.4 Cloud Interface (via slopshop API)

```javascript
const cloudChat = async (prompt) => {
  if (creditsSpent >= creditCap) return '';
  try {
    const r = await request('POST', '/v1/llm-think', {
      text: prompt.slice(0, 4000),
      provider: 'anthropic',
    });
    creditsSpent += 10;
    return r.data?.data?.answer || r.data?.answer || '';
  } catch (e) { return ''; }
};
```

---

## 7. Exact Prompt Templates

### 7.1 LOCAL: Research Sprint Prompt

```
CODEBASE KNOWLEDGE:
{claudeMd}

Sprint {s}/{totalSprints}. Mission: {mission}
Phase: {phase}. Recent scores: {recentScores.join(' -> ')}

Analyze this code from {targetFile} (line {lineNum}):
---
{contextLines}
---

THE LINE:
{targetLine}

Is there a real bug, missing error handling, or security issue in this line?

RULES:
- If the line is fine, say VERDICT: FINE
- If there is a real issue, explain in one sentence
- Do NOT suggest style changes, renaming, or "clever" rewrites
- Do NOT suggest changes that would break existing behavior

VERDICT: <FINE or BUG>
PRIORITY: <one sentence describing the issue, or "none">
SCORE: <1-10, how important is this issue>
```

### 7.2 CLOUD: CEO Strategic Review Prompt

(See section 4.2 above -- full template provided there.)

### 7.3 CLOUD: Code Patch Generation Prompt

```
CODEBASE KNOWLEDGE:
{claudeMd}

You are editing {targetFile} to fix this issue:
ISSUE: {issue}
APPROACH: {approach}

Here is the code region (lines {startLine}-{endLine}):
---
{codeRegion}
---

Write an EXACT find-and-replace patch.

CRITICAL RULES:
- Output the FIND block with the EXACT text that exists in the file (copy-paste precision)
- Output the REPLACE block with your fix
- Change as few lines as possible
- Do NOT use .splice where .slice is correct
- Do NOT add .default to require() calls
- Do NOT invert boolean conditions unless that is the explicit fix
- Do NOT rewrite working patterns into "clever" alternatives
- Preserve exact indentation (spaces, not tabs)

FIND:
```
{exact text to find}
```

REPLACE:
```
{exact replacement text}
```

CONFIDENCE: <1-10>
```

### 7.4 CLOUD: Semantic Review Prompt

```
Review this code change for bugs.

ORIGINAL:
{findText}

REPLACEMENT:
{replaceText}

ISSUE BEING FIXED: {issue}

Check for these specific bug patterns:
1. .splice used where .slice was intended (splice mutates the array)
2. Inverted boolean logic (condition flipped from original intent)
3. const variable being reassigned
4. .default added to require() (does not exist in Node CJS)
5. Variable shadowing in nested scope
6. Off-by-one errors in loops or slicing
7. Missing null/undefined checks that existed in original
8. Breaking change to function signature or return type

Output EXACTLY one line:
SAFE: <one sentence why>
or
DANGEROUS: <one sentence describing the bug>
```

### 7.5 CLOUD: Discovery Prompt (every 10th cloud sprint)

```
We are researching these competitors/sites: {urls.join(', ')}

Our product: slopshop.gg -- {northStar}

Name ONE new competitor or adjacent product URL we should research.
Just the URL, nothing else.
```

---

## 8. Data Structures

### 8.1 `CONFIG_DIR/hive-shared.json`

```json
{
  "mission": "improve error handling",
  "vision": "Make slopshop the most reliable agent API platform",
  "sprints_done": 247,
  "research": [
    { "text": "[https://composio.dev] Composio: 250+ integrations...", "sprint": 12 },
    { "text": "[REFRESH S25] slopshop.gg: 925 handlers...", "sprint": 25 }
  ],
  "builds": [
    { "key": "server-v2.js", "type": "file-edit", "find": "...", "replace": "...", "sprint": 20 }
  ],
  "scores": [
    { "sprint": 1, "score": 7, "phase": "EXPLORE" }
  ],
  "todos": [
    { "sprint": 5, "priority": "add try-catch to /v1/llm-think handler", "phase": "EXPLORE" }
  ],
  "discoveries": ["https://toolhouse.ai"],
  "pivotLog": [
    { "sprint": 100, "from": "old vision", "to": "new vision", "reason": "discovered X" }
  ],
  "plan": ["fix null checks in handlers/compute.js", "add timeout to network handlers"]
}
```

### 8.2 `CONFIG_DIR/hive-metrics.csv`

```csv
sprint,score,phase,built,qa,edits,reverts,credits,ms,file,priority
1,7,EXPLORE,1,1,1,0,10,2340,server-v2.js,add null check to auth middleware
2,6,EXPLORE,0,0,0,0,0,890,,line is fine
```

### 8.3 `CONFIG_DIR/hive-todo.md` (written at session end)

```markdown
# Hive TODO -- 2026-03-29

Mission: improve error handling
Sprints: 500 | Avg: 6.8/10
Branch: hive-1711700000000
Edits shipped: 23

## Priorities

1. [S5] [EXPLORE] add try-catch to /v1/llm-think handler
2. [S12] [OPTIMIZE] validate input.url before fetch in ext-web-scrape
...

## Code changes on branch hive-1711700000000

- server-v2.js: add null check to auth middleware
- handlers/compute.js: wrap JSON.parse in try-catch
...
```

---

## 9. CLI Interface

### 9.1 Command Signature

```
slopshop hive <sprints> "<mission>" [flags]
```

**Flags:**
```
--cloud-every=N     Cloud sprint frequency (default: 10)
--cloud             Alias for --cloud-every=10
--local-only        Never use cloud (research mode only, $0)
--credit-cap=N      Max credits per session (default: 500)
--editable=f1,f2    Override editable file list
--dry-run           Show what would happen without editing files
--continue          Resume from hive-shared.json state
--model=X           Local model name (default: llama3)
--verbose           Print full LLM responses
```

### 9.2 Output Format

```
  ╔════════════════════════════════════════════════╗
  ║            SLOPSHOP HIVE v3                    ║
  ║ Research local - Edit cloud - Merge manual     ║
  ╚════════════════════════════════════════════════╝
  Mission: improve error handling
  Mode: local + cloud every 10th sprint ($0 + ~$0.03/cloud)
  Branch: hive-1711700000000

  INITIAL SCRAPE
  + https://slopshop.gg (925 handlers)
  3 items in knowledge base

  == S1 == [CLOUD]
  | CEO: fix null check in auth middleware (server-v2.js)
  | PATCH: lines 45-47
  | GATE 1: syntax OK
  | GATE 2: runtime OK
  | GATE 3: semantic SAFE (adds null guard, no side effects)
  | SHIPPED server-v2.js (committed)
  | -   if (req.headers.authorization) {
  | +   if (req.headers.authorization && req.headers.authorization.length > 0) {
  > 8/10 [EXPLORE] built:1 qa:1 2340ms 10cr

  == S2 == [LOCAL]
  | VERDICT: FINE (line is already safe)
  > 6/10 [EXPLORE] built:0 qa:0 890ms 0cr

  ...

  STATS @25: edits:3 avg:6.8/10 scores:7->6->7->8->7
```

---

## 10. Implementation Plan

### Phase 1: Refactor `cmdHive` in `cli.js`

Extract the monolithic function into modules:

```
cli.js
  cmdHive(args)                     -- orchestrator, ~50 lines
    calls hive/session.js           -- init, save, cleanup
    calls hive/sprint-local.js      -- local sprint logic
    calls hive/sprint-cloud.js      -- cloud sprint logic
    calls hive/safety.js            -- 5-gate validation
    calls hive/prompts.js           -- all prompt templates
    calls hive/context.js           -- rolling window management
    calls hive/metrics.js           -- CSV logging, stats
```

### Phase 2: Implement changes from v2

1. **Remove local file editing** -- local sprints become research-only
2. **Add Gate 3 (semantic review)** -- cloud LLM reviews cloud edits
3. **Add CEO prompt** -- strategic layer on cloud sprints
4. **Add rolling window compaction** -- every 100 sprints
5. **Add --cloud-every flag** -- configurable cloud frequency
6. **Add --continue flag** -- resume from saved state
7. **Add pivot logging** -- track vision changes

### Phase 3: Testing

```
node cli.js hive 10 "test run" --local-only --verbose       # local only, verify no edits
node cli.js hive 10 "test run" --cloud-every=5 --dry-run    # cloud, verify prompts
node cli.js hive 100 "improve error handling" --cloud-every=10  # real run, review branch
node cli.js hive 1000 "improve error handling" --continue    # scale test
```

---

## 11. Failure Modes and Recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Ollama not running | ollamaChat returns '' | Skip sprint, log warning |
| Cloud API down | cloudChat returns '' | Fall back to local-only |
| Git not available | execSync throws | Continue without branching (warn user) |
| File not found | fs.existsSync false | Skip that file, pick next |
| Syntax gate fail | node -c throws | Revert from backup |
| Runtime gate fail | execution throws | Revert from backup |
| Semantic gate fail | LLM says DANGEROUS | Revert from backup |
| hive-shared.json corrupt | JSON.parse throws | Start fresh, warn user |
| Disk full | fs.writeFileSync throws | Stop session, report |
| 90s LLM timeout | req timeout fires | Return '', skip sprint |
| Credit cap reached | creditsSpent >= cap | Switch to local-only for remainder |

---

## 12. Key Differences from Hive v2 (current `cmdHive`)

| v2 (current) | v3 (this spec) |
|--------------|----------------|
| Local models edit files (29% success) | Local models NEVER edit files |
| No semantic review gate | Cloud LLM reviews every edit (Gate 3) |
| Fixed cloud schedule (S1, S11, S21...) | Configurable --cloud-every=N |
| Single LLM call per sprint | CEO + Patch + Review (3 calls on cloud sprints) |
| Vision from regex match | Structured CEO prompt with pivot logging |
| research[] capped at 20 | research[] capped at 50 + compaction every 100 sprints |
| No continuation | --continue flag resumes from saved state |
| Monolithic function (~330 lines) | Modular: 7 files under hive/ directory |
| Candidate lines by pattern match | Same approach (works well, keep it) |
| 3-gate validation | 5-gate validation (added Gate 0: exact match, Gate 3: semantic) |
