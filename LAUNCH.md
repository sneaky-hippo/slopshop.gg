# SLOPSHOP.GG Launch Plan

## X/Twitter Launch Thread

Post this as a thread. Each numbered item is one tweet. Include the OG image on tweet 1.

---

**Tweet 1 (hook + image)**

I built 420 real APIs that AI agents can call with credits.

Zero mocks. Every response computed from your input.

SHA256 returns a real hash.
JWT returns a real token.
CSV parser returns real rows.
Statistics returns real math.

npm install -g slopshop

slopshop.gg

---

**Tweet 2 (live demo)**

Try it right now. No signup.

Go to slopshop.gg, pick an API, hit RUN.

That's a real SHA256 hash of YOUR data.
That's a real JWT signed with YOUR secret.
That's a real CSV parsed from YOUR input.

Every response says _engine: "real"

---

**Tweet 3 (what it is)**

What is Slopshop?

420 APIs in one credit-loaded package:
- 154 compute (hash, JWT, CSV, regex, stats, dates)
- 63 AI (summarize, code review, translate)
- 15 integrations (Slack, GitHub, Discord)
- 11 network (DNS, SSL, HTTP checks)

One API key. One credit balance. Everything.

---

**Tweet 4 (developer experience)**

How it works:

$ slop call crypto-hash-sha256 --data "hello"
{"_engine": "real", "hash": "2cf24dba..."}

$ slop call text-token-count --text "estimate my tokens"
{"_engine": "real", "tokens_estimated": 5}

$ slop pipe text-extract-emails text-word-count --text "email me@slopshop.gg"

---

**Tweet 5 (agent-native)**

Built for agents, not humans.

GET /v1/tools?format=anthropic → 420 tool definitions with real schemas
GET /v1/tools?format=mcp → MCP-native server

Every tool has typed parameters. Not just {input: string}.

An agent can discover, understand, and call any API without documentation.

---

**Tweet 6 (the moat)**

Why not just use RapidAPI? Or ApyHub?

RapidAPI: every API has different auth, billing, format. Chaos.
ApyHub: web-only. No CLI. No MCP. No self-hosting.
OpenRouter: LLM only. Can't hash a string.

Slopshop: one key, one format, CLI + MCP + Zapier, self-hostable, MIT.

---

**Tweet 7 (self-hostable)**

It's fully self-hostable. MIT license.

git clone https://github.com/slopshop/slopshop
npm install
node server-v2.js

Your machine. Your data. Fork it. Extend it.

165 APIs work with zero config.
Add ANTHROPIC_API_KEY → +63 AI APIs.
Add GITHUB_TOKEN → GitHub integration.

---

**Tweet 8 (top 10 APIs)**

Top 10 APIs agents actually call:

1. text-token-count (estimate context window)
2. crypto-hash-sha256 (cache keys)
3. text-chunk (RAG pipelines)
4. text-extract-emails (data extraction)
5. crypto-jwt-sign (auth tokens)
6. text-template (render {{variables}})
7. code-json-to-zod (type generation)
8. math-statistics (data analysis)
9. gen-fake-user (test data)
10. text-csv-to-json (data transform)

---

**Tweet 9 (pricing)**

Pricing:

1 credit = 1 simple API call.
Complex calls = 1-20 credits.

1K credits: $9 (Baby Lobster)
10K: $49 (Shore Crawler)
100K: $299 (Reef Boss)
1M: $1,999 (Leviathan)

Demo key with 10,000 free credits: sk-slop-demo-key-12345678

---

**Tweet 10 (CTA)**

slopshop.gg

- Live playground: try any API in your browser
- Full docs: every API documented with examples
- Live dashboard: real-time operational metrics
- CLI: npm install -g slopshop
- MCP: one config line for Claude Code
- MIT license: self-host forever

420 APIs. 0 mocks. Built with claws. 🦞

---

## Hacker News Post

**Title:** Show HN: Slopshop – 420 real APIs for AI agents, credit-based, self-hostable

**Text:**

I built Slopshop because I was tired of AI agents calling APIs that return mocked data or require 15 different API keys.

Slopshop is 420 APIs behind one API key and one credit balance. Every API actually computes from your input - `_engine: "real"` in every response.

**What's in it:**
- 154 pure compute APIs (hash, JWT, AES encrypt, CSV/JSON transforms, regex, statistics, linear regression, token counting for LLMs, text chunking for RAG)
- 63 AI-powered APIs (summarize, translate, code review, sentiment analysis - gated on ANTHROPIC_API_KEY)
- 15 external integrations (Slack, GitHub, Discord, email - each gated on their own key)
- 11 network APIs (DNS lookup, SSL check, HTTP status, email validation)

**How agents use it:**
- MCP server: every API is a native tool in Claude Code
- GET /v1/tools?format=anthropic returns typed schemas with examples
- POST /v1/resolve {"query": "hash something"} finds the right API semantically

**How developers use it:**
- CLI: `slop call crypto-hash-sha256 --data "hello"`
- Pipes: `slop pipe text-extract-emails text-word-count --text "..."`
- Python/Node SDKs
- Zapier integration

**Self-hostable:** `git clone && npm install && node server-v2.js`. MIT license. 165 APIs work with zero config. SQLite persistence.

**What's NOT in it:**
- Mocks. Zero. Every API computes or calls a real service.
- Vendor lock-in. It's MIT. Fork it.
- Surprise pricing. Credits are credits. 1 credit = 1 simple call.

Live demo with playground: https://slopshop.gg
GitHub: https://github.com/slopshop/slopshop
npm: `npm install -g slopshop`

---

## Reddit Posts

**r/programming:**
"I built 420 real APIs behind one credit system. Every response says _engine: 'real'. No mocks. Self-hostable. MIT."

**r/node:**
"Show r/node: Slopshop - 420 APIs in one Express server with SQLite, MCP, Zapier, and a CLI. 442 handlers, 0 external deps for compute tier."

**r/artificial:**
"Built an API bazaar for AI agents - 420 tools with typed MCP schemas. Agents discover, understand, and call any API without docs."

**r/selfhosted:**
"Slopshop: self-hostable API server with 420 real APIs. git clone, npm install, done. Hash, JWT, CSV, regex, AI content, DNS - all in one binary."

---

## Product Hunt

**Tagline:** 420 real APIs for AI agents. Zero mocks. One credit balance.

**Description:** Slopshop is the Stripe for agent functionality. 420 APIs behind one API key: crypto, text processing, AI content, network tools, code utilities. Every response is computed from your input. Self-hostable, MCP-native, with CLI, SDKs, and Zapier.

**Topics:** Developer Tools, APIs, Artificial Intelligence, Open Source, SaaS

---

## SEO Blockers (what you need to do)

1. **Deploy to slopshop.gg** → Google can't index localhost
2. **Generate og.png** from og.svg → Twitter needs PNG, not SVG. Use any SVG-to-PNG tool or screenshot the SVG at 1200x630
3. **Submit to Google Search Console** → after deploy, submit sitemap
4. **npm publish** → so "npm install slopshop" works and npm page links back
5. **GitHub repo** → backlinks from GitHub improve domain authority

## SEO Already Done (in the code)

- `<title>` with keywords: "420 Real APIs for AI Agents | Hash, JWT, CSV, Regex, AI, DNS"
- `<meta description>` with long-tail keywords
- `<meta keywords>` tag
- `<link rel="canonical">`
- Open Graph tags (og:title, og:description, og:image, og:url)
- Twitter Card tags (summary_large_image)
- JSON-LD structured data (SoftwareApplication schema)
- robots.txt with agent discovery hints
- /.well-known/ai-tools.json for agent crawlers
- Semantic HTML structure
