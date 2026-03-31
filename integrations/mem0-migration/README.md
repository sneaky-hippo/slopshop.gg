# Migrating from Mem0 to Slopshop

Slopshop is a drop-in self-hostable alternative to Mem0. It covers every Mem0 API
call with equivalent endpoints, adds cryptographic memory proofs, and adds
capabilities Mem0 does not have (credential vault, agent identity, tool catalog).

---

## Why Migrate

| | Mem0 | Slopshop |
|---|---|---|
| Self-hostable | No — AWS only | Yes — `npm install slopshop` |
| Verifiable writes | No | Yes — `proof_hash` + `merkle_root` per write |
| Cloud lock-in | AWS vendor lock | None |
| Free tier | 1,000 memories / month | Core memory always free |
| Agent identity | No | NIST-aligned SPIFFE/SVID |
| Credential vault | No | AES-256-GCM, SSRF-protected proxy |
| GraphRAG | Proprietary | Yes — subject/predicate/object triples + BFS walks |
| Open source | Partial | MIT |
| 1,300+ compute tools | No | Yes — hash, crypto, text, math, network, AI |

---

## Side-by-Side API Comparison

### Add a memory

```python
# Mem0
from mem0 import MemoryClient
m = MemoryClient()
m.add(messages=[{"role": "user", "content": "I like Python"}], user_id="alice")
```

```python
# Slopshop
import requests
requests.post("https://slopshop.gg/v1/memory-set",
    headers={"Authorization": "Bearer $SLOPSHOP_KEY"},
    json={"key": "preference-language", "value": "I like Python", "namespace": "alice"})
# Returns: {"status": "stored", "proof_hash": "a3f7...", "merkle_root": "e1d2..."}
```

---

### Search memories

```python
# Mem0
results = m.search("programming preferences", user_id="alice")
```

```python
# Slopshop
r = requests.post("https://slopshop.gg/v1/memory-search",
    headers={"Authorization": "Bearer $SLOPSHOP_KEY"},
    json={"query": "programming preferences", "namespace": "alice", "limit": 10})
results = r.json()["results"]
# Each result: {"key": ..., "value": ..., "score": 0.94, "tags": [...], "updated": "..."}
```

---

### Get all memories

```python
# Mem0
all_memories = m.get_all(user_id="alice")
```

```python
# Slopshop — list keys
r = requests.post("https://slopshop.gg/v1/memory-list",
    headers={"Authorization": "Bearer $SLOPSHOP_KEY"},
    json={"namespace": "alice", "include_meta": True})
entries = r.json()["entries"]
# Each entry: {"key": ..., "size": ..., "tags": [...], "created": "...", "updated": "..."}
```

---

### Get a specific memory

```python
# Mem0
memory = m.get(memory_id="mem_abc123")
```

```python
# Slopshop
r = requests.post("https://slopshop.gg/v1/memory-get",
    headers={"Authorization": "Bearer $SLOPSHOP_KEY"},
    json={"key": "mem_abc123", "namespace": "alice"})
value = r.json()["value"]
```

---

### Delete a memory

```python
# Mem0
m.delete(memory_id="mem_abc123")
```

```python
# Slopshop
requests.post("https://slopshop.gg/v1/memory-delete",
    headers={"Authorization": "Bearer $SLOPSHOP_KEY"},
    json={"key": "mem_abc123", "namespace": "alice"})
```

---

### Delete all memories for a user

```python
# Mem0
m.delete_all(user_id="alice")
```

```python
# Slopshop — list all keys then delete each
r = requests.post("https://slopshop.gg/v1/memory-list",
    headers={"Authorization": "Bearer $SLOPSHOP_KEY"},
    json={"namespace": "alice"})
for key in r.json()["keys"]:
    requests.post("https://slopshop.gg/v1/memory-delete",
        headers={"Authorization": "Bearer $SLOPSHOP_KEY"},
        json={"key": key, "namespace": "alice"})
```

---

## Full Endpoint Mapping

| Mem0 Method | Slopshop Endpoint | Notes |
|------------|-------------------|-------|
| `m.add(messages, user_id=uid)` | `POST /v1/memory-set` | `namespace` = `uid`, `key` = your choice |
| `m.search(query, user_id=uid)` | `POST /v1/memory-search` | `namespace` = `uid` |
| `m.get_all(user_id=uid)` | `POST /v1/memory-list` | `namespace` = `uid` |
| `m.get(memory_id)` | `POST /v1/memory-get` | `key` = `memory_id` |
| `m.update(memory_id, data)` | `POST /v1/memory-set` | Re-set the same key (version increments) |
| `m.delete(memory_id)` | `POST /v1/memory-delete` | `key` = `memory_id` |
| `m.delete_all(user_id=uid)` | list + delete loop | See above |
| `m.history(memory_id)` | `GET /v1/memory/proof/:key?namespace=uid` | Returns proof_hash + merkle history |

---

## Migration Guide (Zero-Downtime)

The migration approach is: run both systems in parallel until Slopshop is verified,
then cut over.

### Phase 1: Setup

```bash
npm install -g slopshop
slop signup
export SLOPSHOP_KEY=sk-slop-your-key-here
```

### Phase 2: Export from Mem0

```bash
# Export via Mem0 Python client
python3 - <<'EOF'
from mem0 import MemoryClient
import json

m = MemoryClient()
# Export all memories — adjust user list as needed
all_memories = []
for user_id in ["alice", "bob", "shared"]:
    mems = m.get_all(user_id=user_id)
    for mem in mems:
        mem["_source_user_id"] = user_id
    all_memories.extend(mems)

with open("mem0_export.json", "w") as f:
    json.dump(all_memories, f, indent=2)
print(f"Exported {len(all_memories)} memories to mem0_export.json")
EOF
```

### Phase 3: Migrate to Slopshop

```bash
python3 migrate.py \
  --slop-key "$SLOPSHOP_KEY" \
  --input mem0_export.json \
  --namespace migrated \
  --dry-run    # preview first

python3 migrate.py \
  --slop-key "$SLOPSHOP_KEY" \
  --input mem0_export.json \
  --namespace migrated
# Outputs: migration_proofs.json with proof_hash for every write
```

### Phase 4: Dual-write (parallel run)

Update your application to write to both Mem0 and Slopshop. Keep reading from
Mem0 while you verify Slopshop data looks correct.

```python
def add_memory(user_id: str, content: str):
    # Write to Mem0 (existing)
    mem0_client.add([{"role": "user", "content": content}], user_id=user_id)

    # Write to Slopshop (new) — use same namespace as user_id
    key = f"mem-{int(time.time())}"
    result = slop.remember(key, content, namespace=user_id)
    # Log the proof for later verification
    logger.info("slopshop_write", key=key, proof=result["proof_hash"][:16])
```

### Phase 5: Verify Slopshop data

```bash
# Verify a sample of migration proofs
python3 - <<'EOF'
import json, requests

KEY = "sk-slop-your-key-here"
HEADERS = {"Authorization": f"Bearer {KEY}"}

with open("migration_proofs.json") as f:
    proofs = json.load(f)

ok = 0
for p in proofs[:20]:  # sample first 20
    r = requests.post("https://slopshop.gg/v1/proof/verify",
        headers=HEADERS,
        json={"leaf": p["proof_hash"], "root": p["merkle_root"]})
    if r.json().get("valid"):
        ok += 1
    else:
        print(f"FAILED: {p['key']}")

print(f"{ok}/{min(20, len(proofs))} proofs verified")
EOF
```

### Phase 6: Cut over

Switch reads from Mem0 to Slopshop:

```python
# Before
results = mem0_client.search(query, user_id=user_id)

# After
results = slop.search(query, namespace=user_id)
```

Stop dual-writing once confidence is high.

---

## Drop-in Wrapper

If you want a thin shim that maintains Mem0-like method names:

```python
from slopshop_gstack import SlopshopClient
import time

class Mem0Compat:
    """Mem0-compatible wrapper around SlopshopClient."""

    def __init__(self, api_key: str):
        self._slop = SlopshopClient(api_key=api_key)

    def add(self, messages: list, user_id: str) -> dict:
        content = " ".join(m.get("content", "") for m in messages)
        key = f"mem-{int(time.time() * 1000)}"
        return self._slop.remember(key, content, namespace=user_id)

    def search(self, query: str, user_id: str, limit: int = 10) -> list:
        return self._slop.search(query, namespace=user_id, limit=limit)

    def get_all(self, user_id: str) -> list:
        return self._slop.list_keys(namespace=user_id, include_meta=True)

    def get(self, memory_id: str, user_id: str = "default") -> dict:
        return self._slop.recall_full(memory_id, namespace=user_id)

    def update(self, memory_id: str, data: str, user_id: str = "default") -> dict:
        return self._slop.remember(memory_id, data, namespace=user_id)

    def delete(self, memory_id: str, user_id: str = "default") -> bool:
        return self._slop.forget(memory_id, namespace=user_id)

    def delete_all(self, user_id: str) -> int:
        keys = self._slop.list_keys(namespace=user_id)
        for k in keys:
            self._slop.forget(k, namespace=user_id)
        return len(keys)


# Usage:
# from mem0_compat import Mem0Compat
# m = Mem0Compat(api_key=os.environ["SLOPSHOP_KEY"])
# m.add([{"role": "user", "content": "I like Python"}], user_id="alice")
```

---

## Slopshop-Only Features (No Mem0 Equivalent)

Once migrated, you get capabilities Mem0 does not provide:

### Cryptographic proofs
Every write returns `proof_hash` and `merkle_root`. You can verify any write
was not tampered with at any point in the future.

### Credential vault
```python
vault_id = slop.vault_store("openai-prod", "sk-...")
# Later — call OpenAI without the key ever touching your code
response = slop.vault_proxy(vault_id, "https://api.openai.com/v1/models")
```

### 1,303 compute tools
```python
slop.call("crypto-hash-sha256", {"text": "hello"})
slop.call("net-ssl-check", {"hostname": "stripe.com"})
slop.call("llm-summarize", {"text": "long document..."})
```

### Agent orchestration
```python
slop.agent_run("research the latest AI news and store the results in memory")
slop.run_workflow(steps=[...])
```

### Self-hosting
```bash
node server-v2.js  # your data stays on your infrastructure
```

---

## Links

- [Migration script](./migrate.py)
- [GStack Python helper](../gstack/slopshop_gstack.py)
- [Slopshop docs](https://slopshop.gg/docs.html)
- [Verifiable memory](https://slopshop.gg/verifiable-memory.html)
