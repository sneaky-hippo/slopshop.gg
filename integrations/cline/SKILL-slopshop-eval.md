# Slopshop Eval Skill

Use Slopshop MCP for evaluation and testing — run assertions, benchmarks, regression tests, and quality checks on agent outputs or code.

## When to use
- Validating agent outputs against expected results
- Running regression tests on API responses
- Benchmarking performance of different approaches
- Scoring and ranking outputs from multiple agents

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-eval-assert
Run assertions against a value — equality, contains, regex, type checks.
```
call slop-eval-assert with {value: "hello world", assertions: [{"type": "contains", "expected": "hello"}]}
```

### slop-eval-compare
Compare two values and get a detailed diff.
```
call slop-eval-compare with {actual: {"a": 1, "b": 2}, expected: {"a": 1, "b": 3}}
```

### slop-eval-benchmark
Run a tool multiple times and report timing statistics.
```
call slop-eval-benchmark with {tool: "slop-crypto-hash", input: {data: "test"}, iterations: 100}
```

### slop-eval-score
Score a text output on configurable dimensions (relevance, accuracy, completeness).
```
call slop-eval-score with {output: "The capital of France is Paris.", dimensions: ["accuracy", "completeness"]}
```

### slop-eval-suite
Run a predefined test suite against a tool or workflow.
```
call slop-eval-suite with {suite: "api-health", target: "https://api.example.com"}
```

## Example usage
Validate a refactored workflow:
1. `slop-eval-suite` with your test cases before and after changes
2. `slop-eval-compare` old vs new outputs for regressions
3. `slop-eval-benchmark` to confirm no performance degradation

## Best practices
- Write eval suites for critical workflows and store them in memory
- Use `slop-eval-score` to compare competing agent outputs objectively
- Combine with `slop-chain-loop` to iterate until eval scores pass a threshold
