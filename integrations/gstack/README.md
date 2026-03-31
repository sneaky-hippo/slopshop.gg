# Slopshop + GStack Integration

Add persistent verifiable memory, 1,303 compute tools, and a secretless credential
vault to any GStack agent role via REST. No additional dependencies beyond `requests`.

---

## Quick Start

```bash
pip install requests
export SLOPSHOP_KEY=sk-slop-your-key-here
```

```python
import requests, os

SLOP_BASE = "https://slopshop.gg"
SLOP_KEY  = os.environ["SLOPSHOP_KEY"]
HEADERS   = {"Authorization": f"Bearer {SLOP_KEY}", "Content-Type": "application/json"}

# Store memory
r = requests.post(f"{SLOP_BASE}/v1/memory-set", headers=HEADERS,
    json={"key": "gstack-hello", "value": "first memory", "namespace": "gstack"})
print(r.json())  # includes proof_hash + merkle_root

# Recall it
r = requests.post(f"{SLOP_BASE}/v1/memory-get", headers=HEADERS,
    json={"key": "gstack-hello", "namespace": "gstack"})
print(r.json()["value"])  # "first memory"
```

---

## Python Helper Class

See [`slopshop_gstack.py`](./slopshop_gstack.py) for a `SlopshopClient` class
with typed methods. Drop it into any GStack project:

```python
from slopshop_gstack import SlopshopClient
import os

slop = SlopshopClient(api_key=os.environ["SLOPSHOP_KEY"])

# Remember with proof
result = slop.remember("research:stripe", "Stripe raised $600M Series H", namespace="research")
print(result["proof_hash"])  # a3f7b2c1...

# Recall
value = slop.recall("research:stripe", namespace="research")

# Search
hits = slop.search("fundraising", namespace="research", limit=10)

# Proxy an external API call (agent never sees the raw key)
data = slop.vault_proxy("vlt_a1b2c3d4", "https://api.github.com/user")

# Run a multi-step workflow
result = slop.run_workflow(
    steps=[
        {"api": "text-token-count", "input": {"text": "hello world"}},
        {"api": "crypto-hash-sha256", "input": {"text": "hello world"}},
    ]
)
```

---

## REST API Reference

All endpoints use:
- Base URL: `https://slopshop.gg`
- Auth: `Authorization: Bearer sk-slop-your-key-here`
- Method: `POST` (GET for catalog endpoints)
- Body: JSON

### Memory

#### Write (with proof)

```
POST /v1/memory-set
{
  "key":       string  (required),
  "value":     any     (required — string, object, array, number),
  "namespace": string  (optional, default "default"),
  "tags":      array   (optional, e.g. ["gstack","research"]),
  "ttl_seconds": int   (optional — key auto-expires)
}
```

Response:
```json
{
  "ok": true,
  "_engine": "real",
  "key": "research:stripe",
  "namespace": "gstack",
  "status": "stored",
  "version": 1,
  "proof_hash": "a3f7b2c1d4e5f6...",
  "merkle_root": "e1d2c3b4a5f6..."
}
```

#### Read

```
POST /v1/memory-get
{
  "key":       string  (required),
  "namespace": string  (optional, default "default")
}
```

Response: `{"value": <stored value>, "found": true, "tags": [...], "version": 1}`

Returns `{"value": null, "found": false}` if key does not exist or is expired.

#### Search

```
POST /v1/memory-search
{
  "query":     string  (required),
  "namespace": string  (optional, default "default"),
  "limit":     int     (optional, default 50, max 50)
}
```

Response: `{"results": [{"key", "value", "tags", "score", "updated"}], "count": N}`

#### List keys

```
POST /v1/memory-list
{
  "namespace":    string  (optional, default "default"),
  "tag":          string  (optional — filter by tag),
  "include_meta": bool    (optional — include size/dates)
}
```

#### Delete

```
POST /v1/memory-delete
{
  "key":       string  (required),
  "namespace": string  (optional, default "default")
}
```

#### Verify a proof

```
POST /v1/proof/verify
{
  "leaf": "<proof_hash from memory-set>",
  "root": "<merkle_root from memory-set>"
}
```

Response: `{"valid": true}` if the proof is consistent with the stored Merkle chain.

#### Namespace Merkle root

```
POST /v1/proof/merkle
{
  "namespace": "gstack"
}
```

Response: `{"merkle_root": "...", "leaf_count": 42, "last_updated": "..."}`

---

### Credential Vault

```
# Store a secret
POST /v1/vault/set
{"name": "openai-prod", "credential": "sk-...", "type": "api_key"}
→ {"vault_id": "vlt_a1b2c3d4", "name": "openai-prod"}

# List vaults (no credentials returned)
GET /v1/vault/list
→ [{"vault_id": "vlt_a1b2c3d4", "name": "openai-prod", "type": "api_key", "created": "..."}]

# Proxy an external API call using the stored credential
POST /v1/vault/proxy
{"vault_id": "vlt_a1b2c3d4", "url": "https://api.openai.com/v1/models", "method": "GET"}
→ <raw response from target API>

# Delete
DELETE /v1/vault/delete
{"vault_id": "vlt_a1b2c3d4"}

# Audit log
GET /v1/vault/audit
→ [{action, vault_id, url, status, latency_ms, ts}]  -- no credential values
```

---

### Tool Calls (1,303 tools)

Any tool in the catalog:

```
POST /v1/{tool-slug}
{...tool-specific input}
```

Examples:

```python
# Hash text
r = requests.post(f"{SLOP_BASE}/v1/crypto-hash-sha256", headers=HEADERS,
    json={"text": "hello world"})
# {"hash": "b94d27b9...", "algorithm": "sha256", "_engine": "real"}

# Count tokens
r = requests.post(f"{SLOP_BASE}/v1/text-token-count", headers=HEADERS,
    json={"text": "Some text to estimate"})
# {"tokens_estimated": 5, "characters": 21}

# Check SSL cert
r = requests.post(f"{SLOP_BASE}/v1/net-ssl-check", headers=HEADERS,
    json={"hostname": "stripe.com"})
# {"valid": true, "expires_in_days": 87, ...}

# Summarize (needs ANTHROPIC_API_KEY on the server, or use BYOK)
r = requests.post(f"{SLOP_BASE}/v1/llm-summarize", headers=HEADERS,
    json={"text": "Long document...", "max_sentences": 3})
```

Discover tools: `GET /v1/tools` or semantic search:

```python
r = requests.post(f"{SLOP_BASE}/v1/resolve", headers=HEADERS,
    json={"query": "extract JSON from LLM output"})
# Returns matched tool slugs with relevance scores
```

---

### Batch Calls

Run multiple tool calls in parallel:

```
POST /v1/batch
{
  "calls": [
    {"api": "crypto-hash-sha256", "input": {"text": "hello"}},
    {"api": "text-token-count",   "input": {"text": "hello"}},
    {"api": "crypto-uuid",        "input": {}}
  ]
}
```

---

### Agent Orchestration

```
# Natural language task → auto-discovers and chains tools
POST /v1/agent/run
{"task": "hash this text and store the result in memory: hello world", "max_steps": 5}

# Declarative multi-step workflow (DAG)
POST /v1/workflows/run
{
  "steps": [
    {"api": "text-token-count",   "input": {"text": "hello world"}},
    {"api": "crypto-hash-sha256", "input": {"text": "hello world"}, "condition": "result.tokens_estimated > 0"}
  ]
}

# Multi-LLM chain (Claude → Grok → GPT loop)
POST /v1/chain/create
{
  "name": "research-loop",
  "steps": [
    {"model": "claude", "role": "researcher", "prompt": "Research {{topic}}"},
    {"model": "grok",   "role": "critic",     "prompt": "Critique this: {{prev_output}}"}
  ],
  "loop": false
}
```

---

## GStack Role Integration Pattern

```python
from slopshop_gstack import SlopshopClient
import os

slop = SlopshopClient(api_key=os.environ["SLOPSHOP_KEY"])

class ResearchAgent:
    """GStack agent role with Slopshop memory."""

    def __init__(self, namespace: str = "research"):
        self.namespace = namespace

    def run(self, task: str) -> str:
        cache_key = f"research:{task[:64]}"

        # Check memory first — avoid redundant LLM calls
        cached = slop.recall(cache_key, namespace=self.namespace)
        if cached:
            return cached

        # Do the work
        result = self._do_research(task)

        # Store with cryptographic proof
        proof = slop.remember(cache_key, result, namespace=self.namespace)
        print(f"Stored — proof: {proof['proof_hash'][:16]}... root: {proof['merkle_root'][:16]}...")

        return result

    def _do_research(self, task: str) -> str:
        # Your GStack agent logic here
        return f"Research result for: {task}"


class AnalysisAgent:
    """Reads from the research namespace, stores analysis results separately."""

    def analyze(self, research_key: str) -> dict:
        # Load previous research
        research = slop.recall(research_key, namespace="research")

        # Find related memories
        related = slop.search(research_key, namespace="research", limit=5)

        # Store analysis output
        analysis_key = f"analysis:{research_key}"
        slop.remember(analysis_key, {
            "input_key": research_key,
            "related_count": len(related),
            "summary": f"Analyzed {len(related)} related items",
        }, namespace="analysis")

        return {"research": research, "related": related}
```

---

## Namespace Strategy

| Namespace | Contents |
|-----------|----------|
| `gstack` | Shared agent state (default) |
| `gstack:research` | Research agent output |
| `gstack:analysis` | Analysis agent output |
| `gstack:user:{uid}` | Per-user memory |
| `gstack:session:{sid}` | Ephemeral session state |

Namespaces are isolated per API key — you cannot read another account's keys.

---

## Self-Hosting

```bash
git clone https://github.com/sneaky-hippo/slopshop.gg
cd slopshop.gg && npm install
node server-v2.js
```

Change the base URL:

```python
slop = SlopshopClient(api_key="sk-slop-...", base_url="http://localhost:3000")
```

---

## Links

- [Full API docs](https://slopshop.gg/docs.html)
- [Tool catalog](https://slopshop.gg/tools.html)
- [Vault design](https://slopshop.gg/vault.html)
- [Python helper](./slopshop_gstack.py)
