# Security Policy

## Reporting Vulnerabilities

Report security issues to the maintainer privately. Do not open public GitHub issues for vulnerabilities.

## Secret Management

**No secrets are hardcoded in the codebase.** All sensitive values come from environment variables:

| Variable | Purpose | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude AI | For AI tools |
| `OPENAI_API_KEY` | GPT-4 | For llm-council |
| `GROK_API_KEY` | Grok | For llm-think/provider=grok |
| `DEEPSEEK_API_KEY` | DeepSeek | For llm-think/provider=deepseek |
| `SENDGRID_API_KEY` | Email | For ext-email-send |
| `AWS_ACCESS_KEY_ID` | S3 | For ext-s3-upload |
| `AWS_SECRET_ACCESS_KEY` | S3 | For ext-s3-upload |
| `S3_BUCKET` | S3 bucket | For ext-s3-upload |
| `ORCHESTRATE_API_KEY` | Self-call auth | Defaults to demo key |
| `INTERNAL_SECRET` | JWT signing | Auto-generated 32 bytes if missing |
| `DB_PATH` | SQLite path | Defaults to .data/slopshop.db |
| `STRIPE_SECRET_KEY` | Payments | For billing |

## Security Controls

**Authentication**
- All API routes require a bearer token (`Authorization: Bearer sk-slop-...`)
- Keys are stored as HMAC-SHA256 hashes — plaintext never persisted after creation
- Rate limiting per IP (public) and per key (authenticated)

**Injection Prevention**
- GraphQL queries use parameterized `variables: {}` — no string interpolation
- SQLite queries use prepared statements throughout
- Condition evaluation in workflow builder uses a pure string parser — `eval()` is never used

**Agent Identities**
- SVID tokens are HMAC-SHA256 signed JWTs with short TTL (24h default)
- Tokens are scoped to specific capabilities and issuing API key
- Revocation is immediate via the revoke endpoint

**Marketplace Code Scanning**
- Handler code submitted to the marketplace is scanned against 16 dangerous-pattern regexes
- Blocked patterns: `eval`, `Function()`, `child_process`, `require('fs')`, `require('net')`, prototype pollution, etc.

**AWS S3**
- S3 upload uses native AWS Signature V4 (HMAC-SHA256 signing chain) — no AWS SDK dependency
- Credentials never logged or exposed in responses

## Threat Model

| Threat | Mitigation |
|---|---|
| Key theft | Keys hashed at rest; prefix-only logging |
| SQL injection | Prepared statements everywhere |
| GraphQL injection | Parameterized variables |
| SSRF via network tools | Hostnames resolved before request |
| Malicious marketplace handlers | 16-pattern code scan at publish time |
| Agent identity forgery | HMAC-signed JWTs with INTERNAL_SECRET |
| Rate abuse | Per-IP and per-key limits with sliding windows |

## Demo Key

The demo key `sk-slop-demo-key-12345678` is a public development key with a baby-lobster tier rate limit. It is intentionally public for testing. Production deployments should rotate or disable it.

## Rotation Policy

Rotate `INTERNAL_SECRET` to invalidate all issued agent identity tokens. Keys in the `api_keys` table can be revoked via `DELETE /v1/auth/key/:key_id`. S3 and third-party credentials should be rotated on a 90-day cycle.
