# QA: Non-Compute Endpoint Specifications

All standalone routes in `server-v2.js` (and mounted extensions `agent.js`, `auth.js`, `pipes.js`) that are NOT part of the `POST /v1/:slug` compute dispatch. Extracted 2026-03-29.

---

## /v1/army/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/army/deploy` | POST | Deploys N agents in parallel. If tool slug provided, calls handler per agent; otherwise returns seed-based perspectives. <=20 agents sync, >20 async (background). Builds SHA-256 Merkle tree of output hashes. Stores run in `compute_runs` table. Auto-stores summary in memory namespace "army". Auto-posts to hive standup if user has a hive. | `{task?, tool?, input?, agents?: number, verify?}` (auth + BODY_LIMIT_ARMY 10KB) | `{run_id, agents_deployed, agents_succeeded, agents_failed, total_credits, latency_ms, throughput, verification: {merkle_root, individual_hashes, all_verified}, results: [...first 50], balance}` | 200 with merkle_root hash, agents_succeeded > 0, credits deducted = N * tool_credits | Large army (>20) returns 202-style immediate response with `async: true` and poll URL; need to verify background completion actually updates DB. |
| `/v1/army/runs` | GET | Lists all compute army runs for authenticated user. | (auth) | `{runs: [{id, agent_count, verified, status, ts}], count}` | 200, array of runs ordered by ts DESC | None |
| `/v1/army/run/:id` | GET | Retrieves full results of a specific army run by ID. Ownership enforced via api_key match. | (auth, :id param) | `{run_id, config, agent_count, verified, status, results, created}` | 200 with parsed JSON config/results; 404 if not found or not owner | None |
| `/v1/army/simulate` | POST | Monte Carlo simulation with N agents exploring variable combinations. Each agent gets seeded RNG. Computes per-variable statistics (mean, median, stddev). | `{scenario, variables?: {key: {min, max} or [values]}, agents?: number}` (auth) | `{scenario, agents_simulated, credits_used, variable_stats, sample_results, verification: {merkle_root, all_verified}}` | 200, credits_used = ceil(N*0.1), stats computed correctly | RNG uses basic LCG seeded per agent -- not cryptographic. |
| `/v1/army/survey` | POST | Mass survey with diverse persona-based respondents. LLM-powered when `llm-think` handler available; trait-based heuristic fallback otherwise. Stores survey in `surveys` table. | `{question, context?, count?: number, personas?: [{role, age, traits}]}` (auth) | `{survey_id, question, army_size, summary: {would_use, adoption_rate, sentiment_breakdown, priority_breakdown}, responses, output_hash, _engine}` | 200, responses.length == min(count or 20, 100), each response has sentiment + confidence | Survey personas capped at 100. LLM batches of 5 -- may be slow for large surveys. |
| `/v1/army/surveys` | GET | Lists past surveys for authenticated user. | (auth) | `{surveys: [{id, question, status, ts}], count}` | 200 | None |
| `/v1/army/survey/:id` | GET | Retrieves full survey with responses. Ownership enforced. | (auth, :id param) | Full survey row with parsed personas and responses | 200 or 404 | None |
| `/v1/army/quick-poll` | POST | Quick multi-option poll with LLM-backed diverse agent voters. Each voter has a persona role and provides reasoning (with LLM). Random distribution fallback without LLM. | `{question, options: [string], count?: number}` (auth) | `{question, army_size, votes: {option: count}, winner, winner_pct, margin_of_error, reasonings?, output_hash, _engine}` | 200, all options tallied, winner is highest vote | Count capped at 50 for LLM. |
| `/v1/army/status/:id` | POST | SSE stream of army progress. If completed, streams all results and closes. If running, polls DB every 1s for up to 60s. | (auth, :id param) | SSE events: `status`, `results` (batches of 10), `heartbeat`, `done` | Content-Type: text/event-stream; final `done` event | Uses polling instead of true push. Max 60s connection. |
| `/v1/army/share` | POST | Share army run results publicly. Sets shared flag and creates share link. | `{run_id}` (auth) | `{ok, run_id, share_url, shared}` | 200 | Need to verify share_url actually works at GET endpoint. |
| `/v1/army/shared/:id` | GET | Public read of shared army run. | (publicRateLimit, :id param) | Run data if shared | 200 or 404 | None |
| `/v1/army/clone-last` | POST | Clone the last army run config and re-execute. | (auth) | New run with same config | 200 with new run_id | None |
| `/v1/army/attach-compute` | POST | Attach extra GPU/RAM to a running army. Updates config in `compute_runs`. | `{run_id, gpu_cores?, ram_mb?}` (auth) | `{ok, attached, run_id, new_capacity: {gpu_cores, ram_mb}}` | 200, config updated in DB | Capacity is recorded but not actually used for scaling -- bookkeeping only. |

---

## /v1/hive/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/hive/create` | POST | Creates always-on agent workspace. Default channels: general, standup, random, alerts, dreams + custom. Stores in `hives` table. Posts welcome message to general. | `{name?, channels?: [string], members?: [string], config?}` (auth) | `{ok, id, hive_id, name, channels, members, config, endpoints}` | 200, hive_id starts with "hive-", welcome message inserted into hive_messages | None |
| `/v1/hive/:id/send` | POST | Posts a message to a hive channel. Also publishes to pubsub for real-time listeners. If `mode: "debate"`, aggregates recent messages across all channels and stores debate summary in hive state. | `{channel?, message, type?, mode?}` (auth) | Normal: `{ok, hive_id, channel}`. Debate mode: `{ok, hive_id, channel, mode, debate, channel_responses, consensus}` | 200, message stored in hive_messages | None |
| `/v1/hive/:id/channel/:name` | GET | Reads messages from a specific hive channel. Supports `since` timestamp and `limit` (max 200). | `?since=timestamp&limit=N` (auth) | `{hive_id, channel, messages: [{sender, message, type, ts}], count}` | 200, messages reversed to chronological order | None |
| `/v1/hive/:id/standup` | POST | Submits a standup to the hive's standup channel. Also records in global standups table. | `{did?, doing?, blockers?, mood?}` (auth) | `{ok, hive_id, channel: "standup", date}` | 200, message stored in hive_messages with type "standup" | None |
| `/v1/hive/:id/sync` | GET | Gets everything that happened since last sync across all channels + state changes. | `?since=timestamp` (auth, default: last hour) | `{hive_id, name, since, channels_with_activity, messages: {channel: [msgs]}, state_changes, members, sync_timestamp, next_sync_url}` | 200, next_sync_url populated | None |
| `/v1/hive/:id/state` | POST | Sets a shared key-value in hive state. Announces change in alerts channel. | `{key, value}` (auth) | `{ok, key, hive_id}` | 200, value stored in hive_state, alert message posted | None |
| `/v1/hive/:id/state` | GET | Reads all shared state for a hive. | (auth) | `{hive_id, state: {key: value}, keys: count}` | 200 | None |
| `/v1/hive/:id/invite` | POST | Adds a member to the hive. Only hive owner can invite. Posts welcome message. | `{agent_key}` (auth) | `{ok, invited, members}` | 200, member added to members JSON array | Owner check uses api_key match on hives table. |
| `/v1/hive/:id/config` | POST | Updates hive configuration (merge). Only owner. | `{...config fields}` (auth) | `{ok, hive_id, config}` | 200, config merged and persisted | None |
| `/v1/hive/:id/vision` | POST | Sets the north star / mission for the hive. Stores in hive_state under `_vision`. Announces in general. | `{vision, goals?: [string]}` (auth) | `{ok, vision, goals}` | 200 | None |
| `/v1/hive/:id/vision` | GET | Reads the hive's north star. | (auth) | `{vision, goals}` or `{vision: null, note}` | 200 | None |
| `/v1/hive/:id/governance/propose` | POST | Creates a governance proposal stored in hive_state. | `{title, description?, type?}` (auth) | `{ok, hive_id, proposal: {id, title, votes_yes, votes_no, status: "open"}}` | 200 | None |
| `/v1/hive/:id/governance/vote` | POST | Votes yes/no on a proposal with optional stake weighting. | `{proposal_id, vote: "yes"|"no", stake?: number}` (auth) | `{ok, hive_id, proposal_id, vote, stake, proposal}` | 200, votes tallied, individual vote record stored | Duplicate voting from same agent is NOT prevented (no dedup check). |
| `/v1/hive/:id/governance` | GET | Lists all governance proposals for the hive. | (auth) | `{ok, hive_id, proposals, count}` | 200 | None |
| `/v1/hives` | GET | Lists all hives owned by or containing the user. | (auth) | `{hives, count}` | 200 | Uses LIKE match on members JSON -- may false-positive on key prefix substrings. |
| `/v1/hive/:id` | GET | Full hive info including message count and state count. | (auth) | `{...hive, channels, members, config, total_messages, state_keys}` | 200 | None |

---

## /v1/chain/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/chain/create` | POST | Creates an agent chain in `agent_chains` table. Steps can be LLM prompts or compute tool slugs. Supports looping. | `{name?, steps: [{agent?, prompt?, slug?, input?}], loop?: bool, context?}` (auth) | `{ok, chain_id, steps, loop, status: "active"}` | 200, chain_id is UUID | None |
| `/v1/chain/run` | POST | Executes chain steps sequentially. Compute tool steps call handlers directly; LLM steps use `llm-think`. Supports looping with max_iterations safety cap (100). | `{chain_id, max_steps?, max_iterations?}` (auth) | `{ok, chain_id, status, steps_executed, current_step, loop_count, results, credits_used}` | 200, results array populated, balance deducted | Credit estimation is rough (10 per LLM step). |
| `/v1/chain/advance` | POST | Manually advances chain to next step. Stores result from completed step in context. Handles loop reset. | `{chain_id, result?, context_update?}` (auth) | `{ok, chain_id, current_step, next: {agent, prompt, context}, loop_count, status}` | 200, status changes to "completed" when all steps done (non-loop) | None |
| `/v1/chain/queue` | POST | Queues prompts for deferred/batch execution in `prompt_queue` table. | `{prompts: [string], schedule?, frequency?}` (auth) | `{ok, queue_id, prompt_count, schedule, frequency}` | 200 | Queue execution is handled by scheduler loop but only for type "tool", not prompt queue. |
| `/v1/chain/status/:id` | GET | Returns chain status, step info, context. | (auth, :id param) | `{ok, chain_id, name, status, current_step, total_steps, loop, loop_count, context, created_at}` | 200 or 404 | None |
| `/v1/chain/pause/:id` | POST | Pauses a running chain. | (auth, :id param) | `{ok, chain_id, status: "paused"}` | 200 | None |
| `/v1/chain/resume/:id` | POST | Resumes a paused chain. Returns next step info. | (auth, :id param) | `{ok, chain_id, status: "active", current_step, next}` | 200 | None |
| `/v1/chain/list` | GET | Lists all chains for the user. | (auth) | `{ok, chains: [{chain_id, name, status, current_step, total_steps, loop, created_at}], total}` | 200 | None |
| `/v1/chain/:id/status` | GET | Alias for chain status (duplicate registration at line 8573). | (auth) | `{ok, chain_id, name, status, current_step}` | 200 or 404 | Duplicate of `/v1/chain/status/:id`. |

---

## /v1/exchange/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/exchange/register` | POST | Register as a compute supplier. Creates entry in `compute_suppliers`. | `{capabilities: [string]}` (auth) | `{ok, supplier_id, status: "online", capabilities, registered_at}` | 200, supplier_id starts with "sup_" | None |
| `/v1/exchange/heartbeat` | POST | Supplier heartbeat. Updates last_heartbeat, returns pending task count. Ownership check on supplier_id. | `{supplier_id}` (auth) | `{ok, status: "ok", supplier_id, pending_tasks, last_heartbeat}` | 200 | None |
| `/v1/exchange/submit` | POST | Consumer submits task. If task_type matches a handler slug, executes IMMEDIATELY on server (self-serve). Otherwise matches to online supplier, or queues. Credits deducted upfront (escrow). | `{task_type, input, credits_offered?}` (auth) | Self-executed: `{ok, task_id, status: "completed", execution: "self-server", result, verification_hash, latency_ms, credits_used}`. Matched: `{ok, task_id, status: "matched", supplier_id, instructions}`. Queued: `{ok, task_id, status: "queued"}` | 200, credits deducted, verification_hash is SHA-256 of output | Self-execution refunds difference between offered and actual cost. |
| `/v1/exchange/poll/:supplier_id` | GET | Supplier polls for assigned tasks. Also picks up unassigned pending tasks. Marks task in_progress. | (auth, :supplier_id param) | `{ok, task: {id, task_type, input, credits_offered} or null}` | 200, ownership enforced | None |
| `/v1/exchange/complete` | POST | Supplier submits completed task. Verifies ownership, hashes output, pays supplier, records settlement. | `{task_id, output}` (auth) | `{ok, verified, task_id, verification_hash, credits_earned, settlement_id}` | 200, supplier balance increased | None |
| `/v1/exchange/dispute` | POST | Consumer disputes a completed task. Re-queues to different supplier for verification. Lowers original supplier reliability by 0.1. | `{task_id}` (auth) | `{ok, dispute_status, original_task_id, verification_task_id, verification_supplier_id}` | 200, only consumer can dispute | None |
| `/v1/exchange/stats` | GET | Public exchange statistics. | (publicRateLimit) | `{ok, total_suppliers, total_tasks, credits_transacted, ...}` | 200 | None |
| `/v1/exchange/leaderboard` | GET | Top compute suppliers by tasks completed and credits earned. | (publicRateLimit) | `{ok, leaderboard: [{supplier_id, tasks_completed, credits_earned, reliability_score}]}` | 200 | None |
| `/v1/exchange/list` | GET | Lists exchange tasks. | (auth) | Task list | 200 | Registered at line 8574. |

---

## /v1/wallet/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/wallet/create` | POST | Creates agent sub-account wallet. Deducts initial_credits from main balance. | `{agent_name?, initial_credits?, budget_limit?}` (auth) | `{ok, wallet_id, agent_name, balance, budget_limit}` | 200, main balance reduced by min(initial_credits, balance) | initial_credits capped at current balance but no explicit minimum check. |
| `/v1/wallet/list` | GET | Lists all agent wallets for the owner. | (auth) | `{ok, wallets, count}` | 200 | None |
| `/v1/wallet/transfer` | POST | Transfer credits between wallets or main account. Supports from_wallet_id="main" and to_wallet_id="main". | `{from_wallet_id, to_wallet_id, amount}` (auth) | `{ok, from, to, amount, transferred}` | 200, balances updated atomically | Not truly atomic -- two separate SQL statements. |
| `/v1/wallet/:id/fund` | POST | Add credits from main account to a specific wallet. | `{amount}` (auth) | `{ok, wallet_id, amount_funded, new_wallet_balance, main_balance}` | 200 | None |

---

## /v1/eval/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/eval/run` | POST | Runs test cases against a tool handler. Compares output to expected via string inclusion. Stores eval in `evals` table. (NOTE: registered 3x -- lines ~4826, ~8345, ~8800. Last registration wins for Express.) | `{test_cases: [{input, expected_output}], tool?}` or `{dataset, provider?, model?}` (auth) | `{ok, eval_id, score, passed, total, results}` | 200, score is percentage | Triple registration -- only the LAST one (line 8800) handles requests for dataset-based evals with LLM. |
| `/v1/eval/leaderboard` | GET | Shows eval leaderboard. | (publicRateLimit) | `{ok, leaderboard}` | 200 | None |
| `/v1/eval/history` | GET | Lists past evals for the user. (Also registered twice.) | (auth) | `{evals: [{id, score, ts}], count}` | 200 | None |
| `/v1/eval/compare` | POST | Compare two tools/providers against same test cases. | `{tool_a, tool_b, test_cases}` (auth) | `{ok, comparison results}` | 200 | None |
| `/v1/eval/self-improve` | POST | Analyzes agent test results and suggests improvements. LLM-powered analysis with heuristic fallback. | `{agent_id, test_results?: [{passed, status}], improve?, system_prompt?}` (auth) | `{ok, agent_id, suggestions: [{type, detail, priority}], output_hash, _engine}` | 200, suggestions array populated | None |
| `/v1/eval/datasets/save` | POST | Save named eval dataset. | `{name, entries: [{input, expected_output}]}` (auth) | `{ok, name, entries_count}` | 200 | None |
| `/v1/eval/datasets/list` | GET | List saved eval datasets. | (auth) | `{ok, datasets, count}` | 200 | None |
| `/v1/eval/report/:id` | GET | Get detailed eval report. | (auth) | Report data | 200 or 404 | None |

---

## /v1/replay/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/replay/save` | POST | Saves a replay recording to `replays` table. | `{name?, events, tools_used?, total_credits?, duration_ms?}` (auth) | `{ok, replay_id}` | 200 | None |
| `/v1/replay/list` | GET | Lists replays for the user. | (auth) | `{replays, count}` | 200 | None |
| `/v1/replay/load` | GET | Loads a specific replay. | `?id=replay_id` (auth) | Replay data with parsed events | 200 or 404 | None |
| `/v1/replay/:id` | GET | Alias for replay load by param. | (auth) | Replay data | 200 or 404 | None |

---

## /v1/tournament/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/tournament/create` | POST | Creates a tournament in `sp_tournaments`. | `{name, type?: "single-elimination"}` (auth) | `{ok, tournament_id, name, type}` | 200 | None |
| `/v1/tournament/:id/match` | POST | Records a match result. Auto-increments round. | `{agent_a, agent_b, winner}` (auth) | `{ok, tournament_id, match_recorded: {agent_a, agent_b, winner, round}}` | 200 | No validation that winner is one of agent_a/agent_b. |
| `/v1/tournament/:id` | GET | Gets tournament details with matches and standings. | (auth) | `{ok, tournament, matches, standings}` | 200 or 404 | None |
| `/v1/tournament/leaderboard` | GET | Public tournament leaderboard across all tournaments. | (publicRateLimit) | `{ok, leaderboard: [{tournament, standings}], count}` | 200 | None |

---

## /v1/market/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/market/create` | POST | Creates a prediction market. Default deadline: 7 days. | `{question, deadline?}` (auth) | `{ok, market_id, question, deadline}` | 200 | None |
| `/v1/market/:id/bet` | POST | Places a bet. Deducts amount from bettor's balance. | `{position, amount?: number}` (auth) | `{ok, market_id, position, amount, balance}` | 200, balance decreased | None |
| `/v1/market/:id/resolve` | POST | Resolves market with outcome. Only creator can resolve. Pays out winners proportionally from total pot. | `{outcome}` (auth) | `{ok, market_id, outcome, total_pot, winners_count, payouts}` | 200, creator-only enforcement | Winner lookup iterates all apiKeys entries -- O(n) per winner. |
| `/v1/market/:id` | GET | Gets market details with position breakdown and implied probabilities. | (auth) | `{ok, market, positions, total_bet}` | 200 or 404 | None |

---

## /v1/bounties/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/bounties/post` | POST | Posts a bounty. Escrows reward from poster's balance. | `{title, description?, reward}` (auth) | `{ok, bounty_id, title, reward, status: "open"}` | 200, balance reduced by reward | None |
| `/v1/bounties/:id/claim` | POST | Claims an open bounty. Cannot claim own bounty. | (auth) | `{ok, bounty_id, status: "claimed", note}` | 200, self-claim returns 403 | None |
| `/v1/bounties/:id/submit` | POST | Submits work for claimed bounty. Auto-releases reward to claimer. | `{...result data}` (auth) | `{ok, bounty_id, reward_received, status: "completed"}` | 200, claimer balance increased | Auto-release without poster approval -- comment says "in future: require poster approval". |
| `/v1/bounties` | GET | Lists bounties by status. | `?status=open` (publicRateLimit) | `{bounties, count}` | 200 | None |

---

## /v1/knowledge/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/knowledge/add` | POST | Adds a subject-predicate-object triple to the knowledge graph. | `{subject, predicate, object, confidence?}` (auth) | `{ok, triple, output_hash}` | 200 | None |
| `/v1/knowledge/query` | GET/POST | Queries knowledge graph with optional filters. Supports LIKE search via `query` param. | `{subject?, predicate?, object?, query?}` (auth) | `{ok, triples, count, output_hash}` | 200 | None |
| `/v1/knowledge/connections/:entity` | GET | Finds all connections for an entity (both as subject and object). | (auth, :entity param) | `{entity, connections: [{predicate, connected_to, confidence, direction}], total}` | 200 | None |
| `/v1/knowledge/walk` | POST | Random walk through the knowledge graph starting from a node. | `{start, steps?: number}` (auth) | `{ok, start, steps_taken, path: [{step, node}], ended_at}` | 200 | Walk may terminate early if node has no neighbors. |
| `/v1/knowledge/path` | POST | BFS shortest path between two entities. Max 8 hops. | `{from, to}` (auth) | `{ok, from, to, path, hops, found}` | 200, found is boolean | None |
| `/v1/knowledge/auto-discover` | POST | Extracts entities and relationships from memory namespace. Parses JSON values and capitalized words. | `{namespace?}` (auth) | `{ok, namespace, entities_discovered, relationships_found, entities, relationships}` | 200 | None |

---

## /v1/reputation/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/reputation/rate` | POST | Rates an agent with score clamped to [-1, 1]. Updates last_activity. | `{agent_key, score, context?}` (auth) | `{ok, rated, score}` | 200 | None |
| `/v1/reputation/vote` | POST | Upvote/downvote an agent. Creates reputation record if missing. | `{agent_id, vote: "up"|"down"}` (auth) | `{ok, agent_id, vote, reputation}` | 200 | None |
| `/v1/reputation/slash` | POST | Slashes reputation for bad behavior. Requires reason + evidence. Capped at 10 per slash. Records in `reputation_slashes` table. | `{agent_id, reason, evidence, amount?}` (auth) | `{ok, slash_id, agent_id, slash_amount, reason, new_score, reputation, output_hash}` | 200 | None |
| `/v1/reputation/leaderboard` | GET | Time-decayed reputation leaderboard. | `?limit=N` (publicRateLimit) | `{ok, leaderboard: [{agent_id, score, raw_score, tasks_completed, upvotes, downvotes}], count}` | 200, sorted by decayed score | None |
| `/v1/reputation/my` | GET | Current user's reputation with time-decay. | (auth) | `{agent_id, score, raw_score, tasks_completed, upvotes, downvotes}` | 200 | None |
| `/v1/reputation/:key_prefix` | GET | Public reputation lookup for any agent. Falls back to legacy reputation table. | (publicRateLimit) | `{agent, avg_score, total_ratings}` or full agent_reputation row | 200 | None |

---

## /v1/copilot/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/copilot/spawn` | POST | Creates a copilot session linked to a main agent session. Stores in `copilot_sessions`. | `{main_session_id?, copilot_model?, system_prompt?, name?}` (auth) | `{copilot_id, main_session_id, role, status: "active", endpoints}` | 200, copilot_id starts with "copilot-" | None |
| `/v1/copilot/chat` | POST | Sends message to copilot. Copilot responds with tool search, suggested calls, or general help based on message analysis (heuristic, not LLM). | `{copilot_id, message}` (auth) | `{copilot_id, response, message_count, suggested_tools?, suggested_call?, hint?}` | 200, response is non-empty string | Response is heuristic keyword-based, NOT LLM-powered unless user manually integrates. |
| `/v1/copilot/push` | POST | Pushes copilot work to main agent inbox. Valid types: code, plan, review, data. | `{copilot_id, content, push_type?}` (auth) | `{push_id, copilot_id, main_session_id, push_type, status: "queued"}` | 200 | None |
| `/v1/copilot/inbox/:session_id` | GET | Main agent checks for pushed content. Marks retrieved pushes as "delivered". | `?status=queued` (auth, :session_id param) | `{session_id, pushes: [{push_id, copilot_id, push_type, content, status}], count}` | 200 | None |
| `/v1/copilot/scale` | POST | Scales to N copilots (max 20) in same session with optional roles. | `{main_session_id, count?, roles?: [string]}` (auth) | `{main_session_id, copilots: [{copilot_id, role, status}], count, inbox}` | 200 | None |
| `/v1/copilot/status/:copilot_id` | GET | Gets copilot status, message count, push count, recent messages. | (auth, :copilot_id param) | `{copilot_id, main_session_id, role, status, message_count, push_count, recent_messages}` | 200 or 404 | None |

---

## /v1/proof/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/proof/merkle` | POST | Builds SHA-256 Merkle tree from data items. Returns root, leaves, tree depth, and proof for first item. | `{data: [string] or task_ids: [string]}` (auth) | `{ok, merkle_root, leaf_count, tree_depth, leaves, proof_for_first_item}` | 200, merkle_root is 64-char hex | None |
| `/v1/proof/verify` | POST | Verifies a Merkle proof against an expected root by reconstructing path. | `{leaf_hash, proof: [{hash, position}], expected_root}` (auth) | `{ok, verified: boolean, computed_root, expected_root, proof_length}` | 200, verified is true iff computed_root === expected_root | None |
| `/v1/proof/tee` | POST | TEE attestation stub. Returns `supported: false` with roadmap Q3 2026. | (auth) | `{ok, supported: false, roadmap: "Q3 2026", description, current_verification}` | 200 | Stub only -- no actual TEE integration. |

---

## /v1/staking/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/staking/deposit` | POST | Stakes credits with lock period. Yield rate based on real platform transaction volume (5% of daily volume / total staked, capped at 1% daily). Deducts from balance. | `{amount, lock_days}` (auth) | `{ok, stake_id, amount, lock_days, unlock_at, estimated_yield, balance}` | 200, balance decreased by amount | Yield estimate may differ from actual withdrawal yield (withdrawal uses flat 0.1% per day). |
| `/v1/staking/withdraw` | POST | Withdraws a matured stake. Returns principal + yield (0.1% per lock_day). Checks lock period. | `{stake_id}` (auth) | `{ok, stake_id, withdrawn_amount, yield, total_returned, balance}` | 200, 403 if still locked, 409 if already withdrawn | Withdrawal yield calculation (0.1% per day) differs from deposit estimate formula. |
| `/v1/staking/status` | GET | Lists all staking positions with current value and accrued yield. | (auth) | `{ok, stakes: [{stake_id, amount, lock_days, current_value, accrued_yield, locked}], total_staked, total_value}` | 200 | None |

---

## /v1/forge/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/forge/create` | POST | Creates a user-defined plugin. Validates handler_code via `vm.runInContext` with 2s timeout. Stores in `forge_plugins`. | `{name, handler_code, description?, input_schema?, output_schema?}` (auth) | `{ok, plugin_id, name, description, status: "active"}` | 200, handler_code passes validation | Code max 50KB. Validation runs the code -- could have side effects in validation context. |
| `/v1/forge/browse` | GET | Lists all active plugins in the forge marketplace. | (auth) | `{ok, plugins: [{plugin_id, name, description, input_schema, output_schema}], total}` | 200 | None |
| `/v1/forge/execute` | POST | Executes a plugin in sandboxed VM (5s timeout). Calls `handler(input)` if handler function exists. | `{plugin_id, input?}` (auth) | `{ok, plugin_id, output, latency_ms}` | 200, 500 if execution error | 1 credit charged. |

---

## /v1/arbitrage/optimize

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/arbitrage/optimize` | POST | Compares cost/latency/quality across providers for a task. Returns cheapest route and savings percentage. | `{task, providers: [string or {name, cost_per_unit?, latency_ms?, quality?}], budget?}` (auth) | `{ok, task, budget, cheapest_route, all_providers, savings_pct, recommendations, balance}` | 200, 1 credit charged | Uses deterministic float for unknown providers -- results are reproducible but not real benchmarks. |

---

## /v1/federated/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/federated/learn` | POST | Federated learning round. Stores model updates. When >=2 participants at same round, performs real FedAvg aggregation (element-wise average). Computes convergence score from variance. | `{model_updates, round, aggregation_method?}` (auth) | `{ok, round_id, round, participants, aggregation_method, aggregated, aggregated_weights?, convergence_score, balance}` | 200, 1 credit charged | None |
| `/v1/federated/status` | GET | Federated learning overview: rounds, participants, convergence. | (auth) | `{ok, rounds, total_rounds, total_participants, convergence_pct, status}` | 200 | None |

---

## /v1/graphrag/query

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/graphrag/query` | POST | Combined knowledge graph + memory search. Searches triples by query terms, expands by hops, then searches agent_state for related keys. | `{query, max_hops?: number, max_results?: number}` (auth) | `{ok, query, graph: {triples, count, entities_found, hops_used}, memory: {results, count}, combined_score, latency_ms, output_hash, balance}` | 200, 1 credit charged | SQL injection risk mitigated by parameterized queries but the `NOT IN` clause builds IDs inline. |

---

## /v1/chaos/test

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/chaos/test` | POST | Chaos testing: injects random failures (timeout, bad input, overload, null) at configurable rate into specified endpoints. Runs 5 iterations per endpoint. Reports resilience metrics. | `{endpoints: [string], chaos_rate?: 0.1-0.9}` (auth) | `{ok, report: [{endpoint, tests, resilience_score, recovery_time}], overall_resilience, ...}` | 200 | Max 20 endpoints per test. |

---

## /v1/sandbox/execute

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/sandbox/execute` | POST | Runs arbitrary JavaScript in VM sandbox with restricted globals (no require, no process, no fs). Console output captured. Max 5s timeout. | `{code: string, timeout?: number}` (auth) | `{ok, result, logs, execution_time_ms, timeout_ms, output_hash, balance}` | 200, 1 credit charged. 408 on timeout. 400 on execution error. | Code max 50KB. Sandbox has basic Math/Date/JSON/crypto.randomUUID/slopshop stub. |

---

## /v1/compute/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/compute/devote-gpu` | POST | Registers GPU resources for compute exchange. Creates supplier entry with GPU capabilities. | `{cores, vram_gb, model_support?: [string]}` (auth) | `{ok, supplier_id, cores, vram_gb, model_support, estimated_credits_per_hour}` | 200, estimated credits = cores * vram_gb * 0.5 | Bookkeeping only -- no actual GPU scheduling. |
| `/v1/compute/allocate-ram` | POST | Allocates RAM for agent operations. Stores allocation in agent_state with expiry. | `{mb, duration_seconds, purpose?}` (auth) | `{ok, allocation_id, allocated_mb, purpose, expires_at}` | 200, max 65536 MB | Bookkeeping only -- no actual RAM allocation. |

---

## /v1/api/proxy

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/api/proxy` | POST | Sandboxed external API proxy. Blocks localhost/internal IPs. Supports GET/POST with headers and body. Max 30s timeout. | `{url, method?, headers?, body?, timeout?}` (auth) | `{ok, status, status_text, headers, body, credits_charged: 5, balance, latency_ms}` | 200, 5 credits charged. 403 for blocked URLs. 502 on proxy error. | Credits charged even on proxy error. |

---

## /v1/federation/status

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/federation/status` | GET | Returns self instance info and known federation peers from `federation_peers` table. | (auth) | `{ok, self: {id, url, name, version, apis, handlers, uptime_s}, peers, total_instances, federation_protocol}` | 200 | None |

---

## /v1/schedules (CRUD)

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/schedules` | POST | Creates a scheduled task. BUG: has early return statement before interval parsing -- always returns 400. | `{type, slug, input?, interval, max_runs?, webhook_url?}` (auth) | **ALWAYS 400** due to early `return res.status(400)` at line 2103 before validation logic | FAILS -- unreachable code after early return | **BUG: Line 2103 has unconditional `return res.status(400)` before any field validation.** |
| `/v1/schedules` | GET | Lists schedules for the user. | (auth) | `{schedules: [{...schedule, next_run_at}], count}` | 200 | None |
| `/v1/schedules/:id` | DELETE | Deletes a schedule. Ownership enforced via api_key. | (auth, :id param) | `{deleted: id}` | 200 or 404 | None |

---

## /v1/webhooks/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/webhooks/register` | POST | Registers a webhook URL for an event. | `{event, url}` (auth) | `{ok, event, url, note}` | 200 | None |
| `/v1/webhooks/list` | GET | Lists registered webhooks. | (auth) | `{webhooks, count}` | 200 | None |
| `/v1/webhooks/:event` | DELETE | Removes a webhook registration. | (auth, :event param) | `{ok, removed}` | 200 | None |
| `/v1/webhooks/inbox/:key_prefix` | POST | Public inbound webhook listener. Anyone can POST to trigger. | (no auth, :key_prefix param) | `{ok, id}` | 200 | No auth -- potential spam vector. |
| `/v1/webhooks/inbox` | GET | Reads inbound webhooks for authenticated user. | (auth) | `{webhooks, count}` | 200 | None |
| `/v1/webhooks/create` | POST | Enterprise webhook creation. | (auth) | Webhook record | 200 | Registered at line 6605. |
| `/v1/webhooks/enterprise/list` | GET | Enterprise webhook listing. | (auth) | Webhook list | 200 | None |
| `/v1/webhooks/delete/:id` | DELETE | Enterprise webhook deletion. | (auth) | Deleted confirmation | 200 | None |
| `/v1/webhooks/test/:id` | POST | Test-fires a webhook. | (auth) | Test result | 200 | None |

---

## /v1/batch

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/batch` | POST | Executes up to 50 API calls in parallel. Total credits pre-deducted. Uses Promise.allSettled. | `{calls: [{slug, input}]}` (auth, BODY_LIMIT_BATCH 500KB) | `{ok, results: [{slug, data|error, credits, latency_ms}], total_credits, balance, calls_count, partial?}` | 200, max 50 calls, partial flag if mixed success/failure | None |

---

## /v1/stream/:slug

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/stream/:slug` | POST | SSE streaming execution of a tool. Emits progress events, then final result. Falls back to non-streaming if handler is sync. | `{...input}` (auth) | SSE events: `progress`, `result`, `done` | Content-Type: text/event-stream | Registered at line 5998. |
| `/v1/stream/usage` | GET | SSE stream of real-time usage events for the authenticated key. | (auth) | SSE events: `usage` with per-call data | text/event-stream | Client added to `usageStreamClients` set. |

---

## /v1/pipe/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/pipe/run` | POST | Runs a named pipe (prebuilt or custom) or inline steps. Chains outputs: each step receives previous result. | `{pipe?: string, steps?: [string], input?}` (auth) | Named: `{pipe, result, steps, total_credits, balance}`. Inline: `{ok, steps, results, final_output, credits_used}` | 200 | BUG in old `/v1/pipe` route (line 1669): balance check uses `>=` instead of `<` -- always insufficient_credits. |
| `/v1/pipe/create` | POST | Saves a custom pipe to `custom_pipes` table. Validates all step slugs exist. | `{name, steps: [{slug, input_map?}]}` (auth) | `{slug, name, steps, credits, created}` | 200 | None |
| `/v1/pipe/gallery` | GET | Lists all available pipes (prebuilt from pipes.js + custom per-user). | (optional auth for custom) | `{total, prebuilt: [...], custom: [...]}` | 200 | None |

---

## /v1/router/smart

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/router/smart` | POST | Multi-LLM smart router. Scores providers on cost/speed/quality using baseline profiles + live audit_log data. Supports optimize_for: cost, speed, quality, balanced. | `{task?, providers?: [string], optimize_for?}` (auth) | `{ok, recommended, reasoning, all_scores, optimize_for, data_source, output_hash}` | 200 | None |

---

## /v1/cost-optimizer

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/cost-optimizer` | POST | Recommends cheapest/best provider for a task. If `benchmark: true`, actually tests each provider with a small prompt. | `{task, max_credits?, benchmark?}` (auth) | `{ok, task, budget, best_value, cheapest, highest_quality, recommendations, output_hash, _engine}` | 200 | None |

---

## /v1/agent/run

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/agent/run` | POST | Full autonomous agent. Resolves task to tools, chains them, handles debate mode, multi-provider routing. Defined in both server-v2.js (line 6755) and agent.js (line 365). | `{task, tools?, model?, provider?, context?, debate?, max_steps?}` (auth) | `{ok, task, steps, total_steps, total_credits, final_result, tools_used, balance, _engine}` | 200 | Duplicate registration -- agent.js version may shadow server-v2.js version depending on mount order. |

---

## /v1/models/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/models` | GET | Unified model list. Checks Ollama (localhost:11434), cloud providers (env vars), vLLM. (Registered twice -- lines 873 and 1169.) | (publicRateLimit or none) | `{ok, models: [{id, provider, type, credits_per_call}], count, providers}` | 200 | Second registration (line 1169) overrides first. |
| `/v1/models/ollama` | GET | Lists Ollama models via localhost:11434/api/tags. | (publicRateLimit) | `{ok, models, count}` | 200 or 502 if Ollama not running | None |
| `/v1/models/ollama/generate` | POST | Generates text via Ollama. Optionally stores in memory namespace. | `{model, prompt, namespace?}` (auth) | `{ok, data: {answer, model, _engine: "ollama", output_hash}, meta}` | 200, 0 credits | None |
| `/v1/models/ollama/embeddings` | POST | Generates embeddings via Ollama. | `{model, prompt, namespace?}` (auth) | `{ok, data: {embedding, dimensions, model}, meta}` | 200, 0 credits | None |
| `/v1/models/vllm` | GET | Lists vLLM models. | (publicRateLimit) | `{ok, models, count}` | 200 or 502 | None |
| `/v1/models/vllm/generate` | POST | Generates via vLLM OpenAI-compatible endpoint. | `{model?, prompt|messages, namespace?}` (auth) | `{ok, data: {answer, model, _engine: "vllm"}, meta}` | 200, 0 credits | None |
| `/v1/models/llama-cpp/generate` | POST | Generates via llama.cpp server /completion endpoint. | `{prompt, namespace?, ...extra}` (auth) | `{ok, data: {answer, _engine: "llama-cpp"}, meta}` | 200, 0 credits | None |
| `/v1/models/grok/generate` | POST | Generates via xAI Grok API. Requires XAI_API_KEY. 10 credits per call. | `{model?, prompt|messages, namespace?}` (auth) | `{ok, data: {answer, model, _engine: "grok"}, meta}` | 200, 10 credits | Credits refunded on API error. |
| `/v1/models/deepseek/generate` | POST | Generates via DeepSeek API. 5 credits per call. | `{model?, prompt|messages, namespace?}` (auth) | `{ok, data: {answer, model, _engine: "deepseek"}, meta}` | 200, 5 credits | Credits refunded on API error. |
| `/v1/models/auto` | POST | Smart auto-router. Tries providers in strategy order (local/fast/cheap/best). Falls back on failure. | `{prompt|messages, prefer?: "local"|"fast"|"cheap"|"best", model?, namespace?}` (auth) | `{ok, data: {answer, model, _engine}, meta: {strategy, providers_tried}}` | 200 or 503 if all fail | None |

---

## /v1/analytics/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/analytics/calls` | GET | Daily call + credit counts from audit_log. | `?days=N` (auth, default 7) | `{days, data: [{date, calls, credits}]}` | 200 | None |
| `/v1/analytics/top-tools` | GET | Top 20 tools by call count for the user. | (auth) | `{tools: [{api, calls, total_credits, avg_latency}]}` | 200 | None |
| `/v1/analytics/costs` | GET | 30-day daily cost breakdown for the user. | (auth) | `{total_credits_30d, daily, avg_daily}` | 200 | None |
| `/v1/analytics/errors` | GET | Error breakdown by API for the user. | (auth) | `{error_rate, errors: [{api, errors}]}` | 200 | None |
| `/v1/analytics/latency` | GET | Latency percentiles (p50, p95, p99) from up to 1000 samples. | (auth) | `{p50, p95, p99, samples}` | 200 | None |
| `/v1/analytics/timeline` | GET | Usage timeline. | (auth) | Timeline data | 200 | Registered at line 6400. |
| `/v1/analytics/by-tool` | GET | Usage breakdown by tool. | (auth) | Per-tool stats | 200 | Registered at line 6417. |
| `/v1/analytics/by-category` | GET | Usage breakdown by category. | (auth) | Per-category stats | 200 | Registered at line 6441. |
| `/v1/analytics/cost-forecast` | GET | Cost forecast based on recent usage trends. | (auth) | Forecast data | 200 | Registered at line 6463. |
| `/v1/analytics/usage` | GET | General usage analytics. | (auth) | Usage data | 200 | Registered at line 6369. |

---

## /v1/health, /v1/status, /v1/compliance/*

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/health` | GET | Server health check. No auth required. Returns API count, uptime, memory, SQLite table count. | (none) | `{status: "healthy", version, apis, uptime_seconds, memory_mb, sqlite_tables, features, detail}` | 200, status is "healthy" | None |
| `/v1/status` | GET | Operational status. API count by tier. LLM config status. | (none) | `{status: "operational", apis, categories, by_tier, llm_configured, llm_provider}` | 200 | None |
| `/v1/compliance/soc2` | GET | SOC2 self-assessment. Checks TLS, audit logging, key hashing, rate limiting, tenant isolation. | (publicRateLimit) | `{ok, ready, checks: [{name, passed, detail}], note}` | 200 | Self-assessment only, not externally audited. |
| `/v1/compliance/hipaa` | GET | HIPAA self-assessment. Encryption at rest FAILS (SQLite not encrypted). | (publicRateLimit) | `{ok, ready, checks, note}` | 200, ready typically false due to encryption_at_rest | None |
| `/v1/compliance/status` | GET | Unified compliance dashboard combining SOC2 + HIPAA + TEE status. | (publicRateLimit) | `{ok, summary: {soc2, hipaa, tee}, overall_ready, note}` | 200 | None |
| `/v1/health/burnout-check` | GET | Agent burnout detection based on call volume, error spikes, expensive tasks in last 24h. | (auth) | `{ok, status: "healthy"|"watch"|"burnout_risk", signals, calls_last_24h, errors_last_24h, recommendation}` | 200 | None |
| `/v1/healthcheck/deep` | GET | Deep health check testing DB, handlers, memory. | (auth) | Deep health report | 200 | Registered at line 8107. |

---

## Additional Standalone Endpoints

| Endpoint | Method | GUTS | Expected Input | Expected Output | Pass Criteria | Outstanding |
|----------|--------|------|----------------|-----------------|---------------|-------------|
| `/v1/auth/signup` | POST | User signup with email/password. Creates API key. (Mounted from auth.js) | `{email, password}` | `{key, balance, tier}` | 201 | Rate limited per IP. |
| `/v1/auth/login` | POST | Login with email/password. Returns API key. | `{email, password}` | `{key, balance, tier}` | 200 or 401 | None |
| `/v1/auth/me` | GET | Get current user profile. | (auth via auth.js) | User profile data | 200 | None |
| `/v1/auth/rotate-key` | POST | Rotate API key. | (auth via auth.js) | New key | 200 | None |
| `/v1/auth/create-scoped-key` | POST | Create scoped sub-key. | (auth via auth.js) | Scoped key | 200 | None |
| `/v1/auth/keys` | GET | List all keys. | (auth via auth.js) | Key list | 200 | None |
| `/v1/auth/keys/:key` | DELETE | Delete a key. | (auth via auth.js) | Deletion confirmation | 200 | None |
| `/v1/keys` | POST | Generate a new API key (no auth needed). | (publicRateLimit, BODY_LIMIT_AUTH) | `{key, balance: 0}` | 201 | None |
| `/v1/tools` | GET | Full tool catalog with pagination. Formats: native, anthropic, openai, mcp. | `?format=native&category=X&limit=N&offset=N` (publicRateLimit) | `{total, offset, limit, has_more, apis|tools|functions}` | 200 | None |
| `/v1/tools/:slug` | GET | Single tool detail with schema. | (publicRateLimit) | `{slug, name, description, category, credits, tier, input_schema, output_schema, used_in_templates}` | 200 or 404 | None |
| `/v1/tools/categories` | GET | List all categories with counts. | (publicRateLimit) | Category list | 200 | None |
| `/v1/resolve` | POST | Semantic tool search with synonym expansion. | `{query}` | `{match, alternatives}` | 200 | None |
| `/v1/batch` | POST | See /v1/batch above. | | | | |
| `/v1/pipe` | POST | Legacy pipe endpoint with bug (balance check inverted). | `{steps, until?, max_iterations?}` (auth) | `{result, steps_executed, total_credits, balance, log}` | **BUG: balance check uses `>=` instead of `<` at line 1669** | Always returns insufficient_credits for valid balance. |
| `/v1/async/:slug` | POST | Async job execution. Returns job_id for polling. | (auth) | `{job_id, status: "processing", poll, credits, balance}` | 202 | None |
| `/v1/jobs/:id` | GET | Poll async job status. Owner-only access. | (auth) | Job status/result | 200 or 404 | None |
| `/v1/state/:key` | GET/PUT/DELETE | Per-user key-value state store. | (auth) | State CRUD responses | 200 or 404 | None |
| `/v1/usage` | GET | Usage summary from audit_log. | (auth) | `{total_calls, total_credits, balance, by_api}` | 200 | None |
| `/v1/uptime` | GET | Uptime dashboard. No auth. | (none) | `{status, uptime_ms, uptime_human, apis, tiers, llm, compute, network, traffic, memory_mb}` | 200 | None |
| `/v1/dashboard` | GET | Dashboard data with recent calls. | (auth) | `{total_apis, total_calls, active_keys, uptime_seconds, recent_calls}` | 200 | None |
| `/v1/memory/2fa/enable` | POST | Enable memory 2FA. | `{email}` (auth) | `{ok, message, email}` | 200 | None |
| `/v1/memory/2fa/disable` | POST | Disable memory 2FA. | (auth) | `{ok, message}` | 200 | None |
| `/v1/memory/2fa/status` | GET | Check memory 2FA status. | (auth) | `{enabled, email}` | 200 | None |
| `/v1/memory/session/create` | POST | Create memory 2FA session. Generates 6-digit code. | (auth) | `{ok, session_id, message, expires_in, code_expires_in, dev_code?}` | 200 | dev_code exposed when no SENDGRID_API_KEY. |
| `/v1/memory/session/verify` | POST | Verify memory 2FA code. Timing-safe comparison. | `{session_id, code}` (auth) | `{ok, message, session_id, expires}` | 200, 401 on invalid code | None |
| `/v1/governance/propose` | POST | Global governance proposal. | `{title, description?}` (auth) | `{ok, proposal_id, title, status: "active"}` | 200 | None |
| `/v1/governance/vote` | POST | Vote on global governance proposal. Prevents duplicate voting. | `{proposal_id, vote}` (auth) | `{ok, proposal_id, your_vote, tally}` | 200, 409 if already voted | None |
| `/v1/governance/proposals` | GET | List active global proposals. | (auth) | `{ok, proposals, count}` | 200 | None |
| `/v1/org/launch` | POST | Launches full agent organization (hive + copilots + chain). | `{name?, agents?, channels?, standup_frequency?, auto_handoff?}` (auth) | `{ok, org_id, name, agents, hive_id, chain_id, ...}` | 200 | None |
| `/v1/random` | GET/POST | Crypto-grade random: number, bytes, uuid, coin, dice, shuffle. | `?type=number&min=0&max=1000000&count=1` (publicRateLimit) | Type-specific random output | 200 | None |
| `/v1/void` | POST | Anonymous write-only void. No auth. | `{message|thought}` | `{ok, heard: false, note}` | 200 | None |
| `/v1/completions` | POST | OpenAI-compatible completions proxy. | `{model, messages, ...}` (auth) | Completion response | 200 | Registered at line 8018. |
| `/v1/ping` | GET | Simple ping. | (none) | `{pong: true, ts, uptime_s}` | 200 | None |

---

## Known Bugs Found During Audit

1. **`POST /v1/schedules` (line 2103)**: Unconditional early `return res.status(400)` before field validation -- endpoint always returns 400.
2. **`POST /v1/pipe` (line 1669)**: Balance check uses `>=` instead of `<` (`if (req.acct.balance >= def.credits) return insufficient_credits`) -- inverted logic, always fails for valid balances.
3. **Duplicate route registrations**: `/v1/eval/run` registered 3x, `/v1/eval/history` 2x, `/v1/templates/browse` 2x, `/v1/models` 2x, `/v1/chain/:id/status` vs `/v1/chain/status/:id`. Last registration wins in Express.
4. **Staking yield mismatch**: Deposit estimates yield using platform-volume-based formula; withdrawal uses flat 0.1% per day.
5. **Hive governance voting**: No duplicate vote prevention (unlike global governance which checks).
