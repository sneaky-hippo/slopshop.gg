# SLOPSHOP.GG Infrastructure Audit

**Date:** 2026-03-27
**Auditors:** 5 Senior Backend Engineers + 2 PMs (simulated)
**Goal:** Assess readiness to scale from current state to 100M users
**Verdict:** Not ready. But fixable in phases. Read on.

---

## CURRENT ARCHITECTURE SUMMARY

| Component | What Exists |
|-----------|------------|
| **Runtime** | Single Node.js Express process (`server-v2.js`, 6,556 lines) |
| **Database** | SQLite via `better-sqlite3`, WAL mode, single `.db` file |
| **Tables** | ~98 `CREATE TABLE` statements scattered throughout the file |
| **Endpoints** | ~349 route registrations (`app.get`, `app.post`, etc.) |
| **Dependencies** | 5 production deps: express, cors, helmet, better-sqlite3, stripe |
| **Hosting** | Railway (single instance) |
| **Caching** | In-memory `Map` objects (response cache, idempotency, rate limits) |
| **Auth** | API keys loaded into memory `Map` at startup, checked per-request |
| **Rate Limiting** | In-memory `Map`, per-IP and per-key, cleaned via `setInterval` |
| **Background Jobs** | `setInterval` loops (scheduler every 30s, cache cleanup every 60s) |
| **State** | 9+ in-memory `Map`/`Set` objects holding critical runtime state |
| **Scaling** | None. Zero horizontal scaling capability. |
| **Monitoring** | Structured JSON logging to stdout. No metrics, no alerting. |
| **Backups** | None. SQLite file is ephemeral on Railway deploys. |

---

## SCORECARD

### 1. Database (SQLite) -- Score: 2/10

**The good:**
- WAL mode enabled (concurrent reads, OK for low traffic)
- Prepared statements used consistently (prevents SQL injection, good perf)
- Zero external dependency (no Postgres to manage)

**The fatal:**
- **Single-writer lock.** SQLite allows ONE writer at a time. At 1K concurrent write requests, you get `SQLITE_BUSY` errors and 5-second default timeouts. At 10K, the server is effectively down.
- **98 tables in one file.** No schema management. Tables are created inline throughout a 6,556-line file with `CREATE TABLE IF NOT EXISTS`. Some tables are created inside route handlers (lines 701, 720, 975, 3307, etc.) meaning they only exist after that endpoint is first hit. This is a ticking time bomb.
- **No migrations.** One manual `ALTER TABLE` block for `api_keys` (lines 158-161). Everything else is "hope the schema matches."
- **No replication.** Database lives on one disk. If Railway's volume dies, everything is gone.
- **No backups.** Zero backup strategy. A bad deploy or disk failure = total data loss.
- **Railway ephemeral storage.** Unless a persistent volume is explicitly configured, the SQLite file is destroyed on every deploy. This may already be causing silent data loss.

### 2. Server Architecture -- Score: 2/10

**The good:**
- Express is battle-tested. The code is functional.
- Handler pattern (separate files per domain) is reasonable.
- Helmet security headers configured.
- Request ID middleware is present.

**The fatal:**
- **6,556 lines in one file.** This is a monolith inside a monolith. 349 routes, 98 tables, business logic, auth, caching, scheduling -- all in one file. Any change risks breaking everything.
- **9+ in-memory Maps/Sets hold critical state.** `apiKeys`, `jobs`, `ipLimits`, `responseCache`, `idempotencyCache`, `usageStreamClients` -- all lost on restart, all prevent horizontal scaling.
- **Cannot run two instances.** If you put a load balancer in front of two Railway instances, rate limiting breaks (each has its own Map), API key cache diverges, response cache is inconsistent, SSE streams disconnect, and scheduled jobs run twice.
- **No connection pooling, no worker threads.** A single CPU-bound handler blocks the entire event loop for all 349 endpoints.
- **Sync SQLite calls on the event loop.** `better-sqlite3` is synchronous. Heavy queries block all other requests.

### 3. Auth & Security -- Score: 5/10

**The good:**
- API key auth is simple and works.
- Scope enforcement exists (key-level permissions).
- Helmet configured with reasonable CSP.
- Static file serving has an allowlist (blocks source code, dotfiles).
- HTTPS redirect in production.
- Prepared statements everywhere (SQL injection resistant).
- 1MB request body limit.

**The bad:**
- **Rate limiting is in-memory only.** Restart = all limits reset. Two instances = limits don't sync.
- **API keys cached in memory at startup.** `loadKeysFromDB()` runs once. New keys from concurrent requests could create race conditions with the in-memory cache.
- **No password hashing.** API keys stored as plaintext in SQLite. If the DB leaks, every key is compromised.
- **Demo key is hardcoded** (`sk-slop-demo-key-12345678`). Fine for now, but it's in the source code.
- **No request signing, no JWT, no OAuth.** Bearer token only.
- **CORS is `*` by default** (env var override available but probably not set).

### 4. Caching -- Score: 2/10

**The good:**
- Response cache exists with TTL (5 min) and max size (5,000 entries).
- Idempotency cache prevents duplicate mutations (24hr TTL).
- Cache key generation is deterministic (MD5 of request body).

**The fatal:**
- **All in-memory.** Restart = cold cache = thundering herd on a cold start.
- **No CDN for API responses.** Every request hits the Node process.
- **No cache invalidation strategy.** 5-min TTL is the only mechanism.
- **Cache size is unbounded in practice.** The 5,000 max triggers a `clear()` (nuclear option), not LRU eviction.
- **No shared cache across instances.** Horizontal scaling = N independent caches = N times the DB load.

### 5. Monitoring & Observability -- Score: 3/10

**The good:**
- Structured JSON logging (`log.info`, `log.warn`, `log.error`).
- Audit log table tracks every API call with timestamp, latency, and engine.
- `/v1/tools/:slug/stats` endpoint provides per-tool reliability metrics from audit log.
- Health check and doctor endpoints exist.

**The bad:**
- **No external metrics system.** No Prometheus, Datadog, New Relic, or even StatsD.
- **No alerting.** Nobody gets paged when the server goes down.
- **No distributed tracing.** Request IDs exist but aren't sent to any tracing backend.
- **Error tracking is `console.error`.** No Sentry, no Bugsnag.
- **Audit log is in the same SQLite file.** At scale, the audit log will be the largest table and will slow down the entire database. There's no log rotation or archival.

### 6. Reliability -- Score: 4/10

**The good:**
- Graceful shutdown handler (SIGTERM/SIGINT) closes HTTP server and DB.
- 10-second forced shutdown timeout.
- Health check endpoints exist.
- Railway auto-restarts on crash.
- Error handling in handler loading (try/catch with fallback).

**The bad:**
- **No circuit breakers at infra level.** Code has some retry logic but no proper circuit breaking.
- **No readiness/liveness probes beyond basic health check.**
- **setInterval jobs are fire-and-forget.** If the scheduler loop throws, it silently stops.
- **No graceful drain of in-flight requests.** Server close is abrupt after 10s.
- **Single point of failure everywhere.** One process, one DB file, one server.

### 7. Data Persistence -- Score: 1/10

**This is the single biggest risk to the business.**

- **Railway ephemeral filesystem.** Unless a Railway Volume is explicitly attached, the SQLite file is destroyed on every deploy. Every. Single. Deploy.
- **No backups.** If the Volume (if it exists) corrupts, everything is gone.
- **No point-in-time recovery.** No WAL archiving, no snapshots.
- **No data export.** No way to dump the database for migration.
- **Credit balances, API keys, audit logs, user data -- ALL in one file** that may not survive the next deploy.
- **Financial data (credit balances, transactions) with zero durability guarantees.** If a user pays for credits via Stripe and the DB is lost, those credits are gone with no recovery path.

### 8. Queue / Background Jobs -- Score: 1/10

- **Scheduler runs on `setInterval(fn, 30000)`.** Dies on restart. Misses all scheduled jobs during downtime. No catch-up mechanism.
- **Dream subscriptions processed in the same interval loop.** A crash in dream processing could kill the scheduler.
- **`jobs` Map is in-memory.** Background job results are lost on restart.
- **No dead letter queue.** Failed jobs disappear.
- **No job deduplication across restarts.** After restart, the same jobs could run again (or never run).
- **No backpressure.** If 10,000 schedules are due simultaneously, the loop tries to run them all synchronously.

---

## OVERALL SCORE: 2.5 / 10

| Area | Score |
|------|-------|
| Database | 2/10 |
| Server Architecture | 2/10 |
| Auth & Security | 5/10 |
| Caching | 2/10 |
| Monitoring & Observability | 3/10 |
| Reliability | 4/10 |
| Data Persistence | 1/10 |
| Queue / Background Jobs | 1/10 |
| **Overall** | **2.5/10** |

This is a prototype running in production. It works for demos and low traffic. It will not survive the first Hacker News front page or a viral moment.

---

## THE PLAN: Phased, Realistic for a Solo Founder

### PHASE 0: STOP THE BLEEDING (Do This TODAY -- 2-4 hours)

These are not optimizations. These are "your business might lose all data tomorrow" fixes.

#### P0-1: Verify Railway Volume is Attached
```
Railway Dashboard -> Project -> Service -> Settings -> Volumes
```
If no volume is mounted at `/app/.data/` (or wherever `DB_PATH` points), **your database is destroyed on every deploy.** Attach a volume NOW.

#### P0-2: Add Automated SQLite Backups
Add a `setInterval` that copies the DB file to a second location every hour. Minimal, but better than nothing.

Better: Add a daily backup to S3/R2 (Cloudflare R2 is free for 10GB/month):

```js
// Add to server-v2.js
const { execSync } = require('child_process');
setInterval(() => {
  try {
    const backupPath = DB_PATH + '.backup-' + new Date().toISOString().slice(0,10);
    db.backup(backupPath); // better-sqlite3 has built-in online backup
    log.info('Database backup created', { path: backupPath });
    // TODO: Upload to R2/S3
  } catch(e) { log.error('Backup failed', { error: e.message }); }
}, 3600000); // hourly
```

#### P0-3: Add Litestream for Continuous Replication
[Litestream](https://litestream.io/) continuously replicates SQLite to S3/R2. Zero code changes. Add to your Dockerfile:

```dockerfile
# Install litestream
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin/

# Run litestream as a wrapper around your app
CMD ["litestream", "replicate", "-exec", "node server-v2.js"]
```

This is the **single highest-ROI change you can make**. 1 hour of work. Continuous backups to S3.

#### P0-4: Set CORS Origin
```
Railway Dashboard -> Variables -> CORS_ORIGIN=https://slopshop.gg
```

---

### PHASE 1: SURVIVE 10K CONCURRENT USERS (1-2 weeks)

This is your first real scale milestone. Target: handle the Hacker News hug of death.

#### P1-1: Move Rate Limiting to Upstash Redis (1 day)

**Why:** In-memory rate limiting dies on restart, doesn't work with multiple instances.

**What:** [Upstash Redis](https://upstash.com/) -- serverless Redis, pay-per-request, free tier has 10K commands/day.

```bash
npm install @upstash/redis @upstash/ratelimit
```

```js
const { Ratelimit } = require("@upstash/ratelimit");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "60 s"),
});
```

Cost: ~$0 to start (free tier), ~$10/month at moderate traffic.

#### P1-2: Move Response Cache to Upstash Redis (1 day)

Same Redis instance. Replace the in-memory `responseCache` Map with Redis `SET` with TTL. This gives you:
- Cache survives restarts
- Cache shared across instances
- Proper LRU eviction (Redis handles it)

#### P1-3: Move API Key Cache to Redis (0.5 days)

Replace the `apiKeys` Map with Redis. Read-through cache pattern:
1. Check Redis for key
2. If miss, query SQLite, write to Redis with 5-min TTL
3. On key creation/update, invalidate Redis entry

This unblocks horizontal scaling.

#### P1-4: Add Basic Error Tracking (0.5 days)

**Sentry** free tier: 5K errors/month. One npm install, one line of config.

```bash
npm install @sentry/node
```

```js
const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });
```

#### P1-5: Add Basic Uptime Monitoring (30 min)

**Better Stack** (formerly Better Uptime) or **UptimeRobot** free tier. Point it at your `/v1/health` endpoint. Get alerted when the server goes down.

#### P1-6: Extract Table Definitions (1-2 days)

Move all 98 `CREATE TABLE` statements into a single `migrations.js` or `schema.sql` file. Run them once at startup in order. Stop creating tables inside route handlers. This is a code health issue that will bite you during any future migration.

---

### PHASE 2: SURVIVE 100K CONCURRENT USERS (1-2 months)

At this point, SQLite becomes the bottleneck. Single-writer lock is the wall.

#### P2-1: Migrate from SQLite to Railway Postgres (1 week)

**Why now:** At 100K users, you'll have thousands of concurrent writes. SQLite can't handle it.

**How:**
1. Railway has one-click Postgres. $5/month for the starter tier.
2. Write a migration script that reads all SQLite tables and inserts into Postgres.
3. Replace `better-sqlite3` calls with `pg` (node-postgres) or Drizzle ORM.
4. Use connection pooling (`pg-pool` or PgBouncer on Railway).

**Key change:** All those prepared statements (`db.prepare(...)`) become parameterized queries with `$1, $2` syntax instead of `?`.

**Migration strategy:**
- Dual-write for 1 week (write to both SQLite and Postgres)
- Verify data consistency
- Switch reads to Postgres
- Remove SQLite

#### P2-2: Add a Job Queue (3-5 days)

Replace `setInterval` schedulers with a proper queue. For a solo founder, two realistic options:

**Option A: BullMQ + Upstash Redis** (if already using Upstash)
```bash
npm install bullmq
```
- Persistent job queue backed by Redis
- Retries, dead letter queue, job scheduling
- Dashboard via `bull-board`

**Option B: Trigger.dev** (managed, zero infra)
- Serverless background jobs
- Free tier: 25K runs/month
- No Redis needed

#### P2-3: Add Railway Horizontal Scaling (1 day, after P1-1 through P1-3)

Once all in-memory state is externalized to Redis:
```
Railway Dashboard -> Service -> Settings -> Scaling -> Enable horizontal scaling
```
Set min instances = 2, max = 5. Railway handles load balancing.

#### P2-4: Split the Monolith File (1 week)

`server-v2.js` at 6,556 lines is unmaintainable. Split into:
```
routes/
  auth.js          (signup, login, key management)
  tools.js         (the main /v1/tool/:slug endpoint)
  schedules.js     (cron/scheduling)
  admin.js         (admin endpoints)
  copilot.js       (copilot sessions)
  enterprise.js    (team management)
  exchange.js      (compute exchange)
middleware/
  auth.js
  rateLimit.js
  cache.js
db/
  schema.sql
  migrations/
  queries.js
```

This is not microservices. This is basic file organization. One Express app, many files.

#### P2-5: Add Prometheus Metrics (2 days)

```bash
npm install prom-client
```

Expose `/metrics` endpoint. Track:
- Request count by endpoint and status code
- Request latency histogram
- Active connections
- Cache hit/miss ratio
- Credit balance operations
- Queue depth

Railway can scrape Prometheus metrics. Or use Grafana Cloud free tier (10K series).

---

### PHASE 3: SURVIVE 1M CONCURRENT USERS (3-6 months)

#### P3-1: Add a CDN for API Responses (1 day)

Cloudflare in front of the API. Cache GET responses for public endpoints (tool catalog, categories, health). This offloads 60-70% of read traffic.

Free tier is sufficient. Set cache headers:
```js
res.set('Cache-Control', 'public, max-age=300'); // 5 min for catalog endpoints
```

#### P3-2: Read Replicas for Postgres (1 day on Railway)

Railway supports read replicas. Route all read queries to replicas, writes to primary.

#### P3-3: Separate Audit Log Storage (1 week)

The `audit_log` table will be the largest table by far. Move it to:
- A separate Postgres database, OR
- A time-series database (TimescaleDB on Railway), OR
- A log service (Better Stack, Axiom -- both have generous free tiers)

#### P3-4: Add Request Queuing for Heavy Endpoints (1 week)

LLM endpoints (`/v1/tool/llm-*`) can take 5-30 seconds. At 1M users, these will consume all available connections. Add:
- Request queuing (accept request, return job ID, poll for result)
- Webhook delivery for async results
- Connection limits per endpoint category

#### P3-5: Implement Proper Database Migrations (3 days)

Use `node-pg-migrate` or Drizzle Kit. Version-controlled schema changes. No more `CREATE TABLE IF NOT EXISTS` scattered across the codebase.

---

### PHASE 4: SURVIVE 100M USERS (6-12 months, requires a team)

At 100M users, you need a team. This is not a solo-founder scale problem.

#### P4-1: Multi-Region Deployment
- Deploy to 3+ regions (US, EU, APAC)
- Use CockroachDB or Neon Postgres for multi-region database
- Cloudflare Workers at the edge for routing
- Estimated cost: $500-2,000/month

#### P4-2: Event-Driven Architecture
- Replace synchronous credit deduction with event sourcing
- Kafka or Redpanda for event streaming
- CQRS for read/write separation
- This is a 3-6 month project with a team of 3+

#### P4-3: Dedicated Search Infrastructure
- Move catalog search to Typesense or Meilisearch
- Move audit log queries to Elasticsearch/OpenSearch

#### P4-4: SOC 2 / Security Hardening
- API key hashing (bcrypt/argon2 -- keys should NEVER be stored plaintext)
- Proper secrets management (Vault or cloud KMS)
- Penetration testing
- Audit logging to immutable storage

---

## COST ESTIMATES

| Phase | Timeline | Cost/Month | Effort |
|-------|----------|-----------|--------|
| Phase 0 | Today | $0 | 2-4 hours |
| Phase 1 | Week 1-2 | +$10 (Upstash) | 4-5 days |
| Phase 2 | Month 1-2 | +$25 (Postgres + Redis pro) | 2-3 weeks |
| Phase 3 | Month 3-6 | +$50-100 (CDN, replicas, logging) | 1-2 months |
| Phase 4 | Month 6-12 | +$500-2,000 (multi-region, team) | Requires team |

---

## RAILWAY-SPECIFIC CHANGES NEEDED NOW

### 1. Verify/Add Persistent Volume
```
Dashboard -> Your Service -> Settings -> Volumes
Mount path: /app/.data
Size: 1GB (expandable)
```

### 2. Set Environment Variables
```
CORS_ORIGIN=https://slopshop.gg
NODE_ENV=production
DB_PATH=/app/.data/slopshop.db
```

### 3. Add Health Check
```
Dashboard -> Your Service -> Settings -> Deploy
Health check path: /v1/health
Health check timeout: 10s
```

### 4. Enable Auto-Restart
```
Dashboard -> Your Service -> Settings -> Deploy
Restart policy: Always
```

### 5. Add Dockerfile with Litestream (Phase 0)
Create `Dockerfile`:
```dockerfile
FROM node:20-slim

# Install litestream for continuous SQLite backup
ADD https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin/ && rm /tmp/litestream.tar.gz

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .

# Litestream config
COPY litestream.yml /etc/litestream.yml

EXPOSE 3000
CMD ["litestream", "replicate", "-exec", "node server-v2.js"]
```

Create `litestream.yml`:
```yaml
dbs:
  - path: /app/.data/slopshop.db
    replicas:
      - type: s3
        bucket: your-backup-bucket
        path: slopshop
        endpoint: https://your-r2-endpoint.r2.cloudflarestorage.com
        access-key-id: ${LITESTREAM_ACCESS_KEY_ID}
        secret-access-key: ${LITESTREAM_SECRET_ACCESS_KEY}
```

---

## THE BRUTALLY HONEST SUMMARY

**What you have:** A working prototype with impressive feature breadth (1,250 tools, 349 endpoints). The code works. The product is real. That matters.

**What you don't have:** Any infrastructure for running a production service that handles money (credit system via Stripe). No backups, no redundancy, no monitoring, no ability to scale horizontally.

**The scariest finding:** 98 tables with financial data (credit balances, transactions, marketplace orders) stored in a SQLite file that may not survive deploys. If you are collecting money via Stripe and storing credit balances only in this SQLite file, you are one bad deploy away from a financial reconciliation nightmare.

**The minimum viable path:**

1. **Today (2 hours):** Verify Railway volume, add Litestream backup, set CORS_ORIGIN. This costs $0 and prevents catastrophic data loss.

2. **This week (4-5 days):** Add Upstash Redis for rate limiting + caching, add Sentry for error tracking, add uptime monitoring. This costs ~$10/month and makes the service production-grade for low traffic.

3. **This month (2-3 weeks):** Migrate to Postgres, add a job queue, split the monolith file. This costs ~$25/month and gets you to 100K users.

4. **Everything after that** depends on actual traffic numbers. Do NOT pre-optimize for 100M users. Get to 10K first. Then 100K. Then worry about the rest.

**The one thing that must happen before anything else: BACKUPS. TODAY.**

---

*Audit complete. Good luck, founder. The product is real. The infrastructure needs to catch up.*
