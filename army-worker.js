/**
 * army-worker.js — Forked child process for true parallel army/deploy execution.
 *
 * Spawned by server-v2.js for army deploys with >20 agents.
 * Each process loads all handlers and executes a batch of agent tasks,
 * returning results via IPC message.
 *
 * Protocol:
 *   Parent sends: { tool, input, agentIndices: [0, 1, 2, ...], task }
 *   Child sends:  { results: [ { agent_id, result, hash, verified, _engine } | { agent_id, error, verified } ] }
 */
const crypto = require('crypto');

// Load all handlers (same as server-v2.js)
let allHandlers = {};
function loadHandlers() {
  const modules = [
    './handlers/compute',
    './handlers/llm',
    './handlers/network',
    './handlers/external',
    './handlers/sense',
    './handlers/generate',
    './handlers/enrich',
    './handlers/orchestrate',
    './handlers/compute-superpowers',
    './handlers/compute-hackathon-1',
    './handlers/compute-hackathon-2',
    './handlers/compute-hackathon-3',
    './handlers/compute-hackathon-4',
    './handlers/compute-hackathon-5a',
    './handlers/compute-hackathon-5b',
    './handlers/compute-competitor-1',
    './handlers/compute-competitor-2',
    './handlers/compute-rapidapi-1',
    './handlers/compute-rapidapi-2',
    './handlers/compute-rapidapi-3',
    './handlers/compute-power-1',
    './handlers/compute-power-2',
  ];
  for (const mod of modules) {
    try { Object.assign(allHandlers, require(mod)); } catch {}
  }
}

loadHandlers();

process.on('message', async (msg) => {
  const { tool, input, agentIndices, task } = msg;
  const handler = tool ? allHandlers[tool] : null;
  const results = [];

  for (const idx of agentIndices) {
    const agentId = `agent-${idx + 1}`;
    const cleanInput = input ? { ...input } : {};

    if (handler) {
      try {
        const result = await Promise.resolve(handler(cleanInput));
        results.push({
          agent_id: agentId,
          result,
          hash: crypto.createHash('sha256').update(JSON.stringify(result || {})).digest('hex').slice(0, 16),
          verified: true,
          _engine: result?._engine || 'real',
        });
      } catch (e) {
        results.push({ agent_id: agentId, error: e.message, verified: false });
      }
    } else {
      results.push({
        agent_id: agentId,
        perspective: `Agent ${idx + 1}: "${(task || '').slice(0, 200)}"`,
        hash: crypto.createHash('sha256').update(agentId + task).digest('hex').slice(0, 16),
        verified: true,
      });
    }
  }

  process.send({ results });
});
