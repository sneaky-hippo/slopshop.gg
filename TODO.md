# SLOPSHOP.GG - Launch Checklist

## Status: Website live at slopshop.gg. API server ready. 407/420 APIs unlockable.

---

## YOUR TO-DO (things only you can do)

### CRITICAL (do these to go live)

- [ ] **Deploy API server to Railway** (5 min)
  ```bash
  cd Desktop/agent-apis
  npm install -g @railway/cli
  railway login
  railway init
  railway up
  ```
  Then set env vars in Railway dashboard:
  ```
  ANTHROPIC_API_KEY=sk-ant-api03-Vqcl...
  STRIPE_SECRET_KEY=sk_test_51TEu...
  PORT=3000
  BASE_URL=https://your-railway-url.up.railway.app
  ```

- [ ] **Get Railway URL and update Vercel rewrites**
  After `railway up`, you get a URL like `slopshop-production-xxxx.up.railway.app`.
  Tell me that URL and I update vercel.json to proxy API calls there.

- [ ] **Create Stripe webhook**
  Go to dashboard.stripe.com → Developers → Webhooks → Add endpoint
  URL: `https://your-railway-url/v1/stripe/webhook`
  Events: `checkout.session.completed`
  Copy the webhook signing secret → set as `STRIPE_WEBHOOK_SECRET` in Railway

- [ ] **Point slopshop.gg DNS** (if not already done)
  Your domain registrar → DNS settings:
  - A record: `76.76.21.21` (Vercel)
  - CNAME www: `cname.vercel-dns.com`

### GROWTH (do these for distribution)

- [ ] **Create GitHub repo**
  ```bash
  cd Desktop/agent-apis
  git init
  git add -A
  git commit -m "🦞 slopshop.gg - 420 real APIs for agents"
  ```
  Then: github.com → New repo → "slopshop" → push

- [ ] **Publish to npm**
  ```bash
  npm login
  npm publish --access public
  ```
  Now anyone can: `npm install -g slopshop`

- [ ] **Publish to MCP registry**
  ```bash
  curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" | tar xz
  sudo mv mcp-publisher /usr/local/bin/
  mcp-publisher login github
  mcp-publisher publish
  ```

- [ ] **Publish Python SDK to PyPI**
  ```bash
  cd sdk/python
  pip install build twine
  python -m build
  twine upload dist/*
  ```

### LAUNCH (do these on launch day)

- [ ] **Post X thread** (copy from LAUNCH.md)
- [ ] **Post on Hacker News** (copy from LAUNCH.md)
- [ ] **Post on Reddit** (r/programming, r/node, r/artificial, r/selfhosted)
- [ ] **Submit to Product Hunt**
- [ ] **Post on Lobste.rs**

### OPTIONAL SERVICE KEYS (each unlocks 1-3 more APIs)

- [ ] GITHUB_TOKEN → github.com/settings/tokens (unlocks 2 APIs)
- [ ] SLACK_WEBHOOK_URL → api.slack.com/messaging/webhooks (1 API)
- [ ] DISCORD_WEBHOOK_URL → Discord server → Integrations (1 API)
- [ ] SENDGRID_API_KEY → app.sendgrid.com (1 API)
- [ ] TELEGRAM_BOT_TOKEN → @BotFather on Telegram (1 API)
- [ ] OPENAI_API_KEY → platform.openai.com/api-keys (1 API)
- [ ] NOTION_API_KEY → notion.so/my-integrations (1 API)
- [ ] LINEAR_API_KEY → linear.app/settings/api (1 API)
- [ ] GOOGLE_API_KEY + GOOGLE_CX → console.cloud.google.com (1 API)
- [ ] TWILIO_SID + TWILIO_TOKEN → twilio.com/console (1 API)
- [ ] AWS_ACCESS_KEY_ID + AWS_SECRET → aws console (1 API)

---

## DONE (what's already built)

- [x] 420 APIs registered, 442 handlers
- [x] 407 functional with your Anthropic + Stripe keys
- [x] Website live at slopshop.gg with embedded catalog
- [x] Docs page at /docs
- [x] Dashboard at /dashboard
- [x] Real auth (signup/login/rotate-key)
- [x] Real payments (Stripe checkout wired, needs deploy)
- [x] SQLite persistence (keys, credits, audit log, state)
- [x] CLI tool (slop call/pipe/search/list)
- [x] Python SDK + Node SDK
- [x] MCP server for Claude Code
- [x] Zapier integration
- [x] 14 pre-built pipes
- [x] Per-API input/output schemas
- [x] Mobile responsive
- [x] SEO (OG, Twitter, JSON-LD, sitemap, robots.txt)
- [x] Agent discovery (/.well-known/ai-tools.json)
- [x] Margin-safe pricing (every API profitable at every tier)
- [x] Launch plan (LAUNCH.md - X thread, HN, Reddit, PH copy)
- [x] QA: 68/68 pass, 0 breaks
