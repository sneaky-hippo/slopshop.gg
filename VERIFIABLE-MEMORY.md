# Verifiable Persistent Memory

Every `POST /v1/memory-set` call in Slopshop v4.1+ returns a cryptographic proof.

## How it works

### proof_hash
SHA-256 of the write operation inputs:
```
proof_hash = SHA-256(namespace + ":" + key + ":" + JSON.stringify(value) + ":" + timestamp)
```

### merkle_root
A running Merkle chain root that ties all your writes together:
```
new_root = SHA-256(current_root + ":" + proof_hash)
```

The initial root is the zero hash (`0000...0000`).

## API

### Write with proof
```bash
curl -X POST https://slopshop.gg/v1/memory-set \
  -H "Authorization: Bearer $KEY" \
  -d '{"key":"findings","value":"React stack","namespace":"project"}'

# Response:
{
  "status": "stored",
  "key": "findings",
  "namespace": "project",
  "version": 1,
  "proof_hash": "a3f7b2c1d4e5f678...",
  "merkle_root": "e1d2c3b4a5f67890...",
  "_engine": "real"
}
```

### Retrieve proof
```bash
curl https://slopshop.gg/v1/memory/proof/findings \
  -H "Authorization: Bearer $KEY"
```

### Verify a proof
```bash
curl -X POST https://slopshop.gg/v1/proof/verify \
  -H "Authorization: Bearer $KEY" \
  -d '{"leaf":"a3f7b2c1...","root":"e1d2c3b4..."}'

# Response: {"verified": true, ...}
```

### CLI
```bash
slop proof memory --key findings
slop proof verify --leaf a3f7b2c1... --root e1d2c3b4...
```

## Offline verification

Since proof_hash is deterministic (SHA-256 with known inputs), you can verify any write offline:

```python
import hashlib, json

def verify_proof(namespace, key, value, timestamp, claimed_hash):
    data = f"{namespace}:{key}:{json.dumps(value, separators=(',', ':'))}:{timestamp}"
    computed = hashlib.sha256(data.encode()).hexdigest()
    return computed == claimed_hash
```

## Use cases

- **Audit trail**: Prove that a specific value was written at a specific time
- **Tamper detection**: Any post-write modification breaks the Merkle chain
- **Cross-session continuity**: Verify the same memory was used across sessions
- **Compliance**: Immutable proof of what your agent knew and when
