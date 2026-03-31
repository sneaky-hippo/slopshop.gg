# Credential Vault

The Slopshop Credential Vault lets agents store API keys and credentials encrypted at rest. Agents reference credentials by `vault_id` -- they never see the raw key.

## Security design

- **AES-256-GCM** -- authenticated encryption. The auth_tag prevents tampering.
- **scrypt key derivation** -- `scryptSync(INTERNAL_SECRET, 'vault-salt-v1', 32, {N: 16384})` -- resistant to brute force
- **SSRF protection** -- vault proxy blocks all RFC-1918 (10.x, 172.16-31.x, 192.168.x), loopback (127.x), and link-local (169.254.x) addresses. HTTPS-only.
- **Credential never returned** -- after the initial `vault/set` call, the raw credential is never returned in any response, log, or error message
- **Full audit trail** -- all vault operations logged to `vault_audit_log` (action, vault_id, url, status, latency -- no credential value)

## Endpoints

### Store a credential
```bash
curl -X POST https://slopshop.gg/v1/vault/set \
  -H "Authorization: Bearer $KEY" \
  -d '{"name":"openai-prod","credential":"sk-...","type":"api_key"}'

# Returns vault_id -- share this, not the key
```

### List vaults (no credentials)
```bash
curl https://slopshop.gg/v1/vault/list \
  -H "Authorization: Bearer $KEY"
```

### Proxy a call (agent never sees key)
```bash
curl -X POST https://slopshop.gg/v1/vault/proxy \
  -H "Authorization: Bearer $KEY" \
  -d '{"vault_id":"vlt_abc123","url":"https://api.openai.com/v1/models","method":"GET"}'
```

### Delete
```bash
curl -X DELETE https://slopshop.gg/v1/vault/delete \
  -H "Authorization: Bearer $KEY" \
  -d '{"vault_id":"vlt_abc123"}'
```

### Audit log
```bash
curl https://slopshop.gg/v1/vault/audit \
  -H "Authorization: Bearer $KEY"
```

## CLI

```bash
slop vault set --name openai-prod --credential sk-xxx
slop vault list
slop vault proxy --vault-id vlt_abc123 --url https://api.openai.com/v1/models
slop vault delete --vault-id vlt_abc123
```

## The secretless agent pattern

```
1. Human stores credential once: POST /v1/vault/set
   | Returns: vault_id (safe to share)

2. Agent workflow uses vault_id, never raw key:
   POST /v1/vault/proxy {vault_id, url, body}
   | Slopshop decrypts server-side, injects header, returns response

3. Agent gets API response without ever seeing the key
4. Full audit trail in vault_audit_log
```

## SPIFFE/Identity binding

Vault operations are scoped to your API key hash. Future: bind vault access to SVID identity for multi-agent permission control.
