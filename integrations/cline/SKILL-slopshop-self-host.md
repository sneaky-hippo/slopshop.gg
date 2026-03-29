# Slopshop Self-Host Skill

Use Slopshop MCP tools to set up and manage a self-hosted Slopshop instance — full sovereignty over your data, compute, and agent infrastructure.

## When to use
- Deploying Slopshop on your own infrastructure
- Configuring self-hosted instance settings
- Monitoring health and performance of your instance
- Migrating data between cloud and self-hosted deployments

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-self-host-init
Initialize a new self-hosted Slopshop instance.
```
call slop-self-host-init with {port: 3000, data_dir: "/opt/slopshop/data", admin_email: "admin@example.com"}
```

### slop-self-host-status
Check health, uptime, and resource usage of your instance.
```
call slop-self-host-status with {}
```

### slop-self-host-config
View or update instance configuration.
```
call slop-self-host-config with {action: "set", key: "max_agents", value: 100}
```

### slop-self-host-backup
Create or restore a backup of your instance data.
```
call slop-self-host-backup with {action: "create", destination: "/backups/slopshop-2026-03-29.tar.gz"}
```

### slop-self-host-migrate
Migrate data between cloud and self-hosted instances.
```
call slop-self-host-migrate with {from: "cloud", to: "self-hosted", include: ["memory", "knowledge", "replays"]}
```

## Quick start
```bash
git clone https://github.com/slopshop/slopshop && cd slopshop
node server-v2.js  # starts on port 3000
```
Then point your MCP config to `http://localhost:3000/mcp` instead of the cloud endpoint.

## Best practices
- Run backups before any migration or major config change
- Self-hosted instances support all the same tools as cloud
- Use `slop-self-host-status` in a `slop-pipe` for automated health monitoring
- Full data sovereignty — nothing leaves your infrastructure
