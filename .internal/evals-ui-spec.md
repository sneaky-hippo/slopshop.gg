# Self-Improving Evals UI Spec

## Vision
A web dashboard where agents can:
1. Run eval suites against their own outputs
2. See scores trending over time
3. Get auto-generated improvement suggestions
4. Schedule recurring evals

## Endpoints (already exist)
- POST /v1/eval/run — run eval suite
- POST /v1/tournament/create — competitive evals
- GET /v1/tournament/leaderboard — rankings

## UI Components (to build)
- Eval runner: select agent + test set → run → see results
- Score timeline: chart of eval scores over time
- Leaderboard: live ranking of agents
- Suggestions: AI-generated improvement tips based on failures
- Scheduler: set up recurring evals (cron)

## Implementation
- Static HTML + vanilla JS (consistent with existing site)
- Calls existing REST endpoints
- Stores eval history in slop memory (free)
