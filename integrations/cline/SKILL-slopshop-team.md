# Slopshop Team Skill

Use Slopshop MCP for team management and role-based access control (RBAC) — manage users, assign roles, set permissions, and audit access across your organization.

## When to use
- Adding team members and assigning roles
- Restricting which tools or resources a role can access
- Auditing who accessed what and when
- Managing API keys and permissions for different environments

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx` (requires admin role)

## Key tools

### slop-team-invite
Invite a team member with a specific role.
```
call slop-team-invite with {email: "dev@example.com", role: "developer"}
```

### slop-team-roles
List or create roles with specific permissions.
```
call slop-team-roles with {action: "create", name: "auditor", permissions: ["memory:read", "eval:*", "replay:*"]}
```

### slop-team-members
List all team members and their roles.
```
call slop-team-members with {}
```

### slop-team-audit
View the access audit log — who called what tool and when.
```
call slop-team-audit with {filter: "tool:slop-crypto-*", limit: 50}
```

### slop-team-keys
Manage API keys — create scoped keys, rotate, or revoke.
```
call slop-team-keys with {action: "create", name: "ci-key", role: "developer", expires: "2026-06-01"}
```

## Example usage
Set up a team with least-privilege access:
1. `slop-team-roles` to create custom roles (admin, developer, viewer)
2. `slop-team-invite` each member with the appropriate role
3. `slop-team-keys` to create scoped API keys for CI/CD
4. `slop-team-audit` to regularly review access patterns

## Best practices
- Follow least-privilege: give each role only the permissions it needs
- Use scoped API keys for CI/CD instead of your personal admin key
- Review audit logs regularly for unexpected access patterns
- Rotate keys on a schedule with `slop-team-keys` action: "rotate"
