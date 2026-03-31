# Slopshop Memory SDK

The official SDK for the [Slopshop](https://slopshop.gg) memory platform.
Covers all 9 memory techniques in a single package for Python and Node.js.

## Installation

### Python

```bash
pip install slopshop-memory
```

Requires Python 3.8+. Dependencies: `requests`.

For async support also install `aiohttp`:

```bash
pip install slopshop-memory aiohttp
```

### Node.js

```bash
npm install slopshop-memory
```

Works in Node.js 14+. No runtime dependencies — uses the built-in `http`/`https` modules.

---

## API Key Setup

Get your API key from [slopshop.gg/dashboard](https://slopshop.gg/dashboard).

**Recommended: set it as an environment variable.**

```bash
export SLOPSHOP_API_KEY=sk-slop-your-key
```

Then read it in code:

```python
import os
api_key = os.environ["SLOPSHOP_API_KEY"]
```

```js
const apiKey = process.env.SLOPSHOP_API_KEY;
```

---

## 5-Minute Quickstart

### Python

```python
from slopshop_memory import SlopshopMemory, SlopshopError
import os

mem = SlopshopMemory(os.environ["SLOPSHOP_API_KEY"])
```

### Node.js

```js
const { SlopshopMemory, SlopshopError } = require('slopshop-memory');
const mem = new SlopshopMemory({ apiKey: process.env.SLOPSHOP_API_KEY });
```

---

## Technique 1 — Persistent Memory

Store, retrieve, delete, list, and search key-value memories.

**Endpoints:** `POST /v1/memory/store`, `/v1/memory/retrieve`, `/v1/memory/delete`, `/v1/memory/list`, `/v1/memory/search`

```python
# Python
mem.memory.store('user:name', 'Alice', namespace='profile', tags=['user'])
result = mem.memory.retrieve('user:name', namespace='profile')
print(result['value'])  # Alice

items = mem.memory.list(namespace='profile', limit=20)
found = mem.memory.search('user preferences', top_k=5)
mem.memory.delete('user:name', namespace='profile')
```

```js
// Node.js
await mem.memory.store('user:name', 'Alice', { namespace: 'profile', tags: ['user'] });
const result = await mem.memory.retrieve('user:name', { namespace: 'profile' });
console.log(result.value); // Alice

const { items } = await mem.memory.list({ namespace: 'profile', limit: 20 });
const { results } = await mem.memory.search('user preferences', { topK: 5 });
await mem.memory.delete('user:name', { namespace: 'profile' });
```

---

## Technique 2 — Dream Engine

REM-style memory consolidation. Synthesises, compresses, and evolves memories on demand.

**Endpoints:** `POST /v1/memory/dream/start`, `GET /v1/memory/dream/status/:id`

```python
# Python
job = mem.dream.start(namespace='default', strategy='consolidate')
print(job['dream_id'])

import time
while True:
    status = mem.dream.status(job['dream_id'])
    if status['status'] in ('complete', 'failed'):
        print(status.get('summary'))
        break
    time.sleep(2)
```

```js
// Node.js
const job = await mem.dream.start({ strategy: 'consolidate' });
console.log(job.dream_id);

// Poll until done
const poll = async (id) => {
  const s = await mem.dream.status(id);
  if (s.status === 'complete') return s.summary;
  await new Promise(r => setTimeout(r, 2000));
  return poll(id);
};
const summary = await poll(job.dream_id);
```

Strategies: `'consolidate'` (default), `'compress'`, `'evolve'`, `'prune'`.

---

## Technique 3 — Multiplayer Memory

Share a memory namespace with team members or other agents.

**Endpoints:** `POST /v1/memory/share/create`, `POST /v1/memory/collaborator/invite`

```python
# Python
share = mem.multiplayer.create_share(namespace='default', name='Team Alpha')
print(share['invite_url'])

mem.multiplayer.invite_collaborator(
    share['share_id'],
    email='alice@example.com',
    permissions='read-write',
)

# For agent-to-agent sharing
mem.multiplayer.invite_collaborator(
    share['share_id'],
    agent_id='agent:xyz-123',
)
```

```js
// Node.js
const share = await mem.multiplayer.createShare({ name: 'Team Alpha' });
console.log(share.invite_url);

await mem.multiplayer.inviteCollaborator(share.share_id, {
  email: 'alice@example.com',
  permissions: 'read-write',
});
```

---

## Technique 4 — Snapshot Branching

Version your memory namespace. Create snapshots, restore from them, merge branches.

**Endpoints:** `POST /v1/memory/snapshot`, `POST /v1/memory/restore/:id`, `POST /v1/memory/merge`

```python
# Python
snap = mem.snapshot.create(namespace='default', label='pre-experiment')
print(snap['snapshot_id'])

# ... run experiment ...

# Roll back
mem.snapshot.restore(snap['snapshot_id'])

# Or merge two namespaces
mem.snapshot.merge('experiment', 'default', strategy='union')

# List all snapshots
snaps = mem.snapshot.list(namespace='default')
```

```js
// Node.js
const snap = await mem.snapshot.create({ label: 'pre-experiment' });

// Roll back
await mem.snapshot.restore(snap.snapshot_id);

// Merge
await mem.snapshot.merge('experiment', 'default', { strategy: 'union' });
```

Merge strategies: `'union'` (keep all), `'intersection'` (common keys only), `'source-wins'`.

---

## Technique 5 — Bayesian Calibration

Attach confidence scores to memories and update them with new evidence.

**Endpoint:** `POST /v1/memory/bayesian/update`

```python
# Python
result = mem.bayesian.update(
    key='user:trust',
    evidence='Completed 5 consecutive tasks without errors',
    namespace='default',
)
print(f"Prior: {result['prior']}, Posterior: {result['posterior']}")

# Check current confidence
conf = mem.bayesian.query_confidence('user:trust')
print(conf['confidence'])
```

```js
// Node.js
const result = await mem.bayesian.update(
  'user:trust',
  'Completed 5 consecutive tasks without errors',
);
console.log(`${result.prior} -> ${result.posterior}`);

const conf = await mem.bayesian.queryConfidence('user:trust');
```

---

## Technique 6 — Episodic Chains

Link memory entries into ordered narratives for timeline replay.

**Endpoint:** `POST /v1/memory/chain`

```python
# Python
chain = mem.chain.create(
    title='User Onboarding Journey',
    entries=[
        {'content': 'User signed up', 'role': 'system'},
        {'content': 'User stored first memory', 'role': 'user'},
        {'content': 'User ran first dream', 'role': 'system'},
    ],
    namespace='default',
)
print(chain['chain_id'])

# Add more episodes later
mem.chain.append(chain['chain_id'], {'content': 'User invited teammate'})

# Replay the full journey
replay = mem.chain.replay(chain['chain_id'])
print(replay['narrative'])
```

```js
// Node.js
const chain = await mem.chain.create('User Onboarding Journey', [
  { content: 'User signed up', role: 'system' },
  { content: 'User stored first memory', role: 'user' },
]);
await mem.chain.append(chain.chain_id, { content: 'User invited teammate' });
const replay = await mem.chain.replay(chain.chain_id);
```

---

## Technique 7 — Memory Triggers

Register event-driven callbacks that fire when memory events occur.

**Endpoint:** `POST /v1/memory/trigger`

```python
# Python — webhook on any write to keys matching 'agent:*'
trig = mem.trigger.create(
    event='memory.write',
    action='https://hooks.example.com/notify',
    namespace='default',
    condition={'key_pattern': 'agent:*'},
)
print(trig['trigger_id'])

# List and clean up
triggers = mem.trigger.list()
mem.trigger.delete(trig['trigger_id'])
```

```js
// Node.js
const trig = await mem.trigger.create(
  'memory.write',
  'https://hooks.example.com/notify',
  { condition: { key_pattern: 'agent:*' } },
);

await mem.trigger.delete(trig.trigger_id);
```

Supported events: `'memory.write'`, `'memory.delete'`, `'dream.complete'`,
`'confidence.drop'`, `'chain.append'`.

---

## Technique 8 — Procedural Memory

Teach the agent reusable tool chains it can recall and execute later.

**Endpoint:** `POST /v1/memory/procedure/learn`

```python
# Python
proc = mem.procedure.learn(
    name='daily-synthesis',
    description='Compress and consolidate daily memories',
    steps=[
        {'tool': 'memory-list', 'input': {'namespace': 'work'}},
        {'tool': 'memory/dream/start', 'input': {'strategy': 'compress'}},
    ],
    tags=['daily', 'maintenance'],
)
print(proc['procedure_id'])

# Recall and run it
recalled = mem.procedure.recall(name='daily-synthesis')
run = mem.procedure.run(recalled['procedure']['id'])
print(run['status'])
```

```js
// Node.js
const proc = await mem.procedure.learn('daily-synthesis', [
  { tool: 'memory-list', input: { namespace: 'work' } },
  { tool: 'memory/dream/start', input: { strategy: 'compress' } },
], { description: 'Compress daily memories', tags: ['daily'] });

const { procedure } = await mem.procedure.recall({ name: 'daily-synthesis' });
const run = await mem.procedure.run(procedure.id);
```

---

## Technique 9 — Swarm Orchestration

Deploy a parallel agent army to tackle large tasks, pooling results into shared memory.

**Endpoint:** `POST /v1/swarm/orchestrate`

```python
# Python
swarm = mem.swarm.orchestrate(
    task='Research the top 10 AI memory architectures and rank by adoption',
    agents=10,
    strategy='parallel',
    memory_namespace='research',
    timeout=300,
)
print(swarm['swarm_id'])

# Poll for completion
import time
while True:
    s = mem.swarm.status(swarm['swarm_id'])
    print(f"{s['completed_agents']}/{s['total_agents']} done")
    if s['status'] == 'complete':
        print(s['synthesis'])
        break
    time.sleep(5)
```

```js
// Node.js
const swarm = await mem.swarm.orchestrate(
  'Research the top 10 AI memory architectures',
  { agents: 10, strategy: 'parallel', memoryNamespace: 'research' },
);

const result = await mem.swarm.status(swarm.swarm_id);
```

Strategies: `'parallel'` (all agents run simultaneously), `'pipeline'`
(agents pass output forward), `'vote'` (agents vote on best answer).

---

## Error Handling

Both SDKs throw `SlopshopError` on API or network failures.

```python
# Python
from slopshop_memory import SlopshopError

try:
    mem.memory.retrieve('missing-key')
except SlopshopError as err:
    print(err.status_code)  # e.g. 404
    print(str(err))         # message
    print(err.body)         # full response dict
```

```js
// Node.js
const { SlopshopError } = require('slopshop-memory');

try {
  await mem.memory.retrieve('missing-key');
} catch (err) {
  if (err instanceof SlopshopError) {
    console.log(err.statusCode); // e.g. 404
    console.log(err.message);
    console.log(err.body);
  }
}
```

---

## Async Python

```python
import asyncio
from slopshop_memory import AsyncSlopshopMemory
import os

async def main():
    async with AsyncSlopshopMemory(os.environ["SLOPSHOP_API_KEY"]) as mem:
        await mem.memory.store('hello', 'world')
        job = await mem.dream.start(strategy='compress')
        print(job['dream_id'])

asyncio.run(main())
```

---

## Links

- API Reference: [slopshop.gg/api-reference](https://slopshop.gg/api-reference)
- Dashboard: [slopshop.gg/dashboard](https://slopshop.gg/dashboard)
- GitHub: [github.com/slopshop](https://github.com/slopshop)
- Status: [status.slopshop.gg](https://status.slopshop.gg)
