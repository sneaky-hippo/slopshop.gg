# Slopshop Network Skill

Use Slopshop MCP for real network operations — DNS lookups, SSL certificate checks, HTTP header inspection, redirect tracing, and port scanning. Deterministic results, not LLM guesses.

## When to use
- Checking DNS records (A, AAAA, MX, TXT, CNAME, NS)
- Inspecting SSL certificates for expiry or misconfiguration
- Analyzing HTTP response headers and redirect chains
- Diagnosing connectivity or configuration issues

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-network-dns
Resolve DNS records for a domain.
```
call slop-network-dns with {domain: "example.com", type: "MX"}
```

### slop-network-ssl
Check SSL certificate details — issuer, expiry, chain validity.
```
call slop-network-ssl with {domain: "example.com"}
```

### slop-network-headers
Fetch HTTP response headers from a URL.
```
call slop-network-headers with {url: "https://example.com"}
```

### slop-network-redirects
Trace the full redirect chain for a URL.
```
call slop-network-redirects with {url: "http://example.com", max_redirects: 10}
```

### slop-network-whois
Look up WHOIS registration data for a domain.
```
call slop-network-whois with {domain: "example.com"}
```

## Example usage
Full domain health check:
1. `slop-network-dns` to verify A and MX records
2. `slop-network-ssl` to check certificate expiry
3. `slop-network-headers` to verify security headers (HSTS, CSP, etc.)
4. Store results with `slop-memory-set` for future comparison

## Best practices
- These are real network calls, not simulations — results are live and accurate
- Use for pre-deployment checks, security audits, and monitoring
- Combine with `slop-army-deploy` to check hundreds of domains in parallel
