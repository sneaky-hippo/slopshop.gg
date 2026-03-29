# Slopshop Replay Skill

Use Slopshop MCP for replay and verification — record tool calls, replay them for regression testing, and verify outputs match expected results.

## When to use
- Recording a sequence of tool calls for later replay
- Regression testing after changes to prompts or workflows
- Debugging by replaying a failed sequence step by step
- Creating reproducible demos of agent workflows

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-replay-record
Start recording all tool calls in the current session.
```
call slop-replay-record with {name: "my-workflow", action: "start"}
```

### slop-replay-stop
Stop recording and save the replay.
```
call slop-replay-stop with {name: "my-workflow"}
```

### slop-replay-run
Replay a saved recording and compare outputs to the original.
```
call slop-replay-run with {name: "my-workflow", verify: true}
```

### slop-replay-list
List all saved replays.
```
call slop-replay-list with {}
```

### slop-replay-diff
Show differences between a replay result and the original recording.
```
call slop-replay-diff with {name: "my-workflow", run_id: "run-abc123"}
```

## Example usage
Regression test a workflow:
1. `slop-replay-record` to start recording
2. Run your workflow normally (any sequence of slop tools)
3. `slop-replay-stop` to save the recording
4. After making changes, `slop-replay-run` with verify: true
5. `slop-replay-diff` to see what changed

## Best practices
- Record critical workflows so you can replay after prompt changes
- Use `verify: true` to automatically flag output differences
- Store replay names in memory for easy discovery later
- Combine with `slop-eval-assert` for strict pass/fail verification
