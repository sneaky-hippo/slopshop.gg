# Slopshop Crypto Skill

Use Slopshop MCP for real cryptographic operations — hashing, HMAC, encryption, key generation, and signature verification. Deterministic and correct, unlike LLM approximations.

## When to use
- Hashing data with SHA-256, SHA-512, MD5, or other algorithms
- Generating HMACs for API authentication
- Encrypting or decrypting data with AES
- Generating secure random tokens, UUIDs, or keypairs
- Verifying digital signatures

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-crypto-hash
Hash data with a specified algorithm.
```
call slop-crypto-hash with {data: "hello world", algorithm: "sha256"}
```

### slop-crypto-hmac
Generate an HMAC for API signing.
```
call slop-crypto-hmac with {data: "message", key: "secret", algorithm: "sha256"}
```

### slop-crypto-encrypt
Encrypt data with AES-256-GCM.
```
call slop-crypto-encrypt with {data: "sensitive info", key: "my-encryption-key"}
```

### slop-crypto-random
Generate cryptographically secure random values.
```
call slop-crypto-random with {type: "uuid"}
call slop-crypto-random with {type: "hex", length: 32}
```

### slop-crypto-verify
Verify a signature or hash.
```
call slop-crypto-verify with {data: "message", signature: "abc123...", key: "public-key"}
```

## Example usage
Sign an API request:
1. `slop-crypto-hmac` to generate the signature
2. Include the signature in your request headers
3. `slop-crypto-verify` on the response to confirm authenticity

## Best practices
- Never ask the LLM to compute hashes — always use these tools for correctness
- Use `slop-crypto-random` for tokens instead of pseudo-random alternatives
- Store encryption keys in memory with `slop-memory-set` for reuse
