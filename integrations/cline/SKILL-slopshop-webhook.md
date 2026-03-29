# Slopshop Webhook Skill

Use Slopshop MCP for webhook management — create endpoints, receive events, inspect payloads, and trigger workflows from external services.

## When to use
- Creating webhook endpoints for GitHub, Stripe, Slack, etc.
- Inspecting incoming webhook payloads for debugging
- Triggering agent workflows from external events
- Building event-driven automation pipelines

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-webhook-create
Create a new webhook endpoint with an optional trigger.
```
call slop-webhook-create with {name: "github-push", trigger: "slop-pipe-run", trigger_input: {pipe: "ci-check"}}
```

### slop-webhook-list
List all your webhook endpoints.
```
call slop-webhook-list with {}
```

### slop-webhook-inspect
View recent payloads received by a webhook.
```
call slop-webhook-inspect with {webhook_id: "wh-abc123", limit: 5}
```

### slop-webhook-test
Send a test payload to your webhook endpoint.
```
call slop-webhook-test with {webhook_id: "wh-abc123", payload: {"event": "push", "branch": "main"}}
```

### slop-webhook-delete
Delete a webhook endpoint.
```
call slop-webhook-delete with {webhook_id: "wh-abc123"}
```

## Example usage
Auto-trigger analysis on GitHub push:
1. `slop-webhook-create` with trigger pointing to your analysis pipe
2. Configure GitHub to send push events to the webhook URL
3. `slop-webhook-inspect` to verify payloads are arriving correctly

## Best practices
- Each webhook gets a unique URL scoped to your SLOPSHOP_KEY
- Use triggers to automatically run pipes or chains on incoming events
- Inspect payloads first when debugging integration issues
- Webhooks persist until deleted — no expiration
