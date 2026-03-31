# Slopshop + OpenClaw Integration

Connect Slopshop to OpenClaw via MCP. Every OpenClaw skill gets:
- Persistent verifiable memory with cryptographic proofs (`proof_hash` + `merkle_root`)
- 1,303 real compute tools available as native MCP tool calls
- Secretless credential vault (AES-256-GCM) — skills reference `vault_id`, never raw keys
- Zero-trust agent identity (SPIFFE/SVID)

---

## Setup (2 minutes)

### Step 1: Install Slopshop and get your key

```bash
npm install -g slopshop
slop signup
# Outputs: Your API key: sk-slop-xxxxxxxxxxxxxxxx
# 500 free credits on signup. Memory APIs are always free.
```

### Step 2: Add Slopshop to OpenClaw's MCP config

OpenClaw reads MCP server config from `~/.openclaw/mcp.json` (or your project's
`openclaw.config.json`). Paste the following — replace the key:

```json
{
  "mcpServers": {
    "slopshop": {
      "command": "slop",
      "args": ["mcp", "serve"],
      "env": {
        "SLOPSHOP_KEY": "sk-slop-your-key-here",
        "SLOPSHOP_BASE": "https://slopshop.gg"
      }
    }
  }
}
```

The ready-to-paste file is at [`mcp-config.json`](./mcp-config.json) in this directory.

### Step 3: Restart OpenClaw

OpenClaw will connect to the Slopshop MCP server on startup. You should see
`slopshop: connected (1303 tools)` in the MCP status panel.

---

## Verifiable Memory Pattern

Every `memory-set` call returns a `proof_hash` and `merkle_root`. These are
cryptographic commitments — you can verify any write was untampered at any time.

### Writing memory from a skill

```
POST https://slopshop.gg/v1/memory-set
Authorization: Bearer sk-slop-your-key-here
Content-Type: application/json

{
  "key": "skill-result-2026-03-31",
  "value": "OpenClaw completed the analysis task",
  "namespace": "openclaw",
  "tags": ["skill", "analysis"]
}
```

Response:
```json
{
  "ok": true,
  "_engine": "real",
  "key": "skill-result-2026-03-31",
  "namespace": "openclaw",
  "status": "stored",
  "version": 1,
  "proof_hash": "a3f7b2c1d4e5f6a789b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2",
  "merkle_root": "e1d2c3b4a5f67890123456789abcdef01234567890abcdef01234567890abcdef0"
}
```

### Reading memory in a skill

```
POST https://slopshop.gg/v1/memory-get
Authorization: Bearer sk-slop-your-key-here
Content-Type: application/json

{
  "key": "skill-result-2026-03-31",
  "namespace": "openclaw"
}
```

Response:
```json
{
  "ok": true,
  "_engine": "real",
  "key": "skill-result-2026-03-31",
  "namespace": "openclaw",
  "value": "OpenClaw completed the analysis task",
  "found": true,
  "tags": ["skill", "analysis"],
  "version": 1,
  "created": "2026-03-31T10:00:00.000Z",
  "updated": "2026-03-31T10:00:00.000Z"
}
```

### Searching across skill memory

```
POST https://slopshop.gg/v1/memory-search
Authorization: Bearer sk-slop-your-key-here
Content-Type: application/json

{
  "query": "analysis task",
  "namespace": "openclaw",
  "limit": 20
}
```

### Verifying a proof later

```
POST https://slopshop.gg/v1/proof/verify
Authorization: Bearer sk-slop-your-key-here
Content-Type: application/json

{
  "leaf": "a3f7b2c1d4e5f6a789b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2",
  "root": "e1d2c3b4a5f67890123456789abcdef01234567890abcdef01234567890abcdef0"
}
```

Response:
```json
{
  "ok": true,
  "valid": true,
  "leaf": "a3f7b2c1...",
  "root": "e1d2c3b4...",
  "found_in_namespace": "openclaw"
}
```

### Getting the Merkle root for a namespace

```
POST https://slopshop.gg/v1/proof/merkle
Authorization: Bearer sk-slop-your-key-here
Content-Type: application/json

{
  "namespace": "openclaw"
}
```

---

## Vault Pattern for OpenClaw API Keys

Skills that need external API keys (GitHub, Slack, OpenAI, etc.) should use the
Vault pattern: store credentials once, then skills receive only the `vault_id`.
The raw key never appears in skill code, logs, or memory.

### Step 1: Store a credential (done once by the operator)

```bash
# CLI
slop vault set --name github-token --credential ghp_xxxxxxxxxxxxxxxxxxxx

# Or via REST
curl -X POST https://slopshop.gg/v1/vault/set \
  -H "Authorization: Bearer $SLOPSHOP_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"github-token","credential":"ghp_xxxxxxxxxxxx","type":"api_key"}'
```

Response:
```json
{
  "ok": true,
  "vault_id": "vlt_a1b2c3d4e5f6",
  "name": "github-token",
  "type": "api_key"
}
```

Share `vault_id` with your skill. The raw credential is never returned again.

### Step 2: Use vault_id in a skill to proxy API calls

The skill sends a `vault/proxy` request — Slopshop decrypts the credential
server-side, injects it into the outbound Authorization header, and returns
the response. The skill never sees the raw key.

```
POST https://slopshop.gg/v1/vault/proxy
Authorization: Bearer sk-slop-your-key-here
Content-Type: application/json

{
  "vault_id": "vlt_a1b2c3d4e5f6",
  "url": "https://api.github.com/repos/owner/repo/issues",
  "method": "POST",
  "body": {
    "title": "Bug found by OpenClaw skill",
    "body": "Details here..."
  }
}
```

The response is the raw JSON from the target API (GitHub in this case).

### Step 3: List vaults (no credentials returned)

```bash
curl https://slopshop.gg/v1/vault/list \
  -H "Authorization: Bearer $SLOPSHOP_KEY"
```

### Vault audit trail

Every vault proxy call is logged automatically:

```bash
curl https://slopshop.gg/v1/vault/audit \
  -H "Authorization: Bearer $SLOPSHOP_KEY"
```

---

## Using MCP Tools Directly in Skills

Once Slopshop is connected as an MCP server, any skill can call Slopshop tools
as native MCP tool invocations. OpenClaw surfaces them with the `slop-` prefix.

Examples of available tool names (from the 1,303 total):
- `slop-crypto-hash-sha256` — hash any text
- `slop-text-token-count` — count LLM tokens
- `slop-llm-summarize` — summarize text via Claude
- `slop-memory-set` — store with proof
- `slop-memory-search` — search stored memories
- `slop-net-http-status` — check any URL's HTTP status
- `slop-net-ssl-check` — inspect TLS certificate
- `slop-crypto-jwt-sign` — sign a JWT
- `slop-vault-set` — store a credential
- `slop-army-deploy` — deploy N parallel agents

Browse the full catalog: `GET https://slopshop.gg/v1/tools`

---

## Namespace Strategy

Use namespaces to isolate memory per skill, user, session, or project:

| Namespace | Use Case |
|-----------|----------|
| `openclaw` | Shared skill state across all skills |
| `openclaw:skill-name` | Isolated per skill |
| `openclaw:user-id` | Isolated per user |
| `openclaw:session-id` | Ephemeral per session |

All namespaces are scoped by API key — you cannot read another user's namespaces.

---

## Per-Key TTL (Optional)

Memory keys expire automatically when `ttl_seconds` is set:

```json
{
  "key": "session-cache",
  "value": "...",
  "namespace": "openclaw",
  "ttl_seconds": 3600
}
```

The response includes `expires_at` as an ISO timestamp. Expired keys are
deleted on next access.

---

## Self-Hosting

Point the MCP config at your own instance:

```json
{
  "mcpServers": {
    "slopshop": {
      "command": "slop",
      "args": ["mcp", "serve"],
      "env": {
        "SLOPSHOP_KEY": "sk-slop-your-key-here",
        "SLOPSHOP_BASE": "http://localhost:3000"
      }
    }
  }
}
```

Run the server: `node server-v2.js` (requires Node 18+, no external deps).

---

## Links

- [Slopshop docs](https://slopshop.gg/docs.html)
- [API explorer](https://slopshop.gg/v1/docs/overview)
- [Full tool catalog](https://slopshop.gg/v1/tools)
- [Vault design](https://slopshop.gg/vault.html)
- [Verifiable memory explainer](https://slopshop.gg/verifiable-memory.html)
