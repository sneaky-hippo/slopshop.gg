# Slopshop Data Skill

Use Slopshop MCP for deterministic data transformations — CSV/JSON conversion, base64 encoding, URL encoding, format validation, and structured data manipulation.

## When to use
- Converting between data formats (CSV to JSON, JSON to YAML, etc.)
- Encoding/decoding base64, URL-encoded, or hex strings
- Validating data against schemas
- Parsing, filtering, or reshaping structured data

## Setup
Add the Slopshop MCP server:
- Command: `npx slopshop mcp`
- Env: `SLOPSHOP_KEY=sk-slop-xxx`

## Key tools

### slop-data-convert
Convert data between formats.
```
call slop-data-convert with {data: "name,age\nAlice,30", from: "csv", to: "json"}
```

### slop-data-base64
Encode or decode base64 strings.
```
call slop-data-base64 with {data: "hello world", action: "encode"}
```

### slop-data-url-encode
URL-encode or decode a string.
```
call slop-data-url-encode with {data: "hello world&foo=bar", action: "encode"}
```

### slop-data-validate
Validate data against a JSON schema.
```
call slop-data-validate with {data: {"name": "Alice"}, schema: {"required": ["name", "age"]}}
```

### slop-data-jq
Apply a jq-style filter to JSON data.
```
call slop-data-jq with {data: [{"name": "Alice"}, {"name": "Bob"}], filter: ".[].name"}
```

## Example usage
Process a CSV export:
1. `slop-data-convert` CSV to JSON
2. `slop-data-jq` to filter relevant fields
3. `slop-data-validate` against your expected schema
4. Store cleaned data with `slop-memory-set`

## Best practices
- Use deterministic transforms instead of asking the LLM to convert data
- Chain transforms with `slop-pipe` for multi-step data pipelines
- Validate data early to catch issues before downstream processing
