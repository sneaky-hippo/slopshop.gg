# Slopshop Queue Skill

Use Slopshop MCP for task queuing — batch prompts and jobs for deferred, sequential, or priority-based execution. Ideal for overnight workloads and background processing.

## When to use
- Queuing tasks for overnight or off-peak execution
- Batch processing large lists of items sequentially
- Priority-based job scheduling
- Rate-limited operations that need controlled throughput

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-queue-add
Add a task to the queue with optional priority and scheduling.
```
call slop-queue-add with {task: "Analyze repo security", priority: "high", schedule: "2026-03-30T02:00:00Z"}
```

### slop-queue-batch
Add multiple tasks at once from a list.
```
call slop-queue-batch with {tasks: ["audit site-a.com", "audit site-b.com", "audit site-c.com"], priority: "normal"}
```

### slop-queue-status
Check the queue status — pending, running, and completed counts.
```
call slop-queue-status with {}
```

### slop-queue-results
Fetch results from completed queue tasks.
```
call slop-queue-results with {status: "completed", limit: 20}
```

### slop-queue-cancel
Cancel pending or running tasks.
```
call slop-queue-cancel with {task_id: "task-abc123"}
```

## Example usage
Overnight batch analysis:
1. `slop-queue-batch` with 100 URLs to analyze
2. `slop-queue-status` to confirm they are queued
3. Check back later with `slop-queue-results` to collect all outputs

## Best practices
- Use `schedule` to defer expensive tasks to off-peak hours
- Set `priority: "high"` for urgent tasks that should jump the queue
- Combine with `slop-webhook-create` to get notified when queued tasks complete
- Queue tasks persist across sessions — safe to disconnect and return later
