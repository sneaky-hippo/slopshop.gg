# Slopshop WASM Runtime (Roadmap)

Run Slopshop compute handlers in the browser via WebAssembly.

## Status: In Development

The WASM runtime will allow:
- Running 925+ compute handlers directly in browser/edge
- Zero-latency for deterministic operations (hash, encode, validate)
- Offline-capable agent execution
- Same _engine: "real" + output_hash verification

## Architecture
- Handlers compiled to WASM via wasm-pack
- Loaded as ES modules in browser
- Same API surface as REST: slop.call('crypto-uuid')
- Memory operations sync to cloud when online

## Usage (future)
```html
<script type="module">
  import { Slopshop } from 'https://cdn.slopshop.gg/wasm/slopshop.js';
  const slop = new Slopshop();
  const uuid = await slop.call('crypto-uuid');
</script>
```

## Timeline
- Q3 2026: Core compute handlers (crypto, text, math)
- Q4 2026: Network handlers via Service Worker proxy
- 2027: Full offline agent runtime
