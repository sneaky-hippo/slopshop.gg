'use strict';

/**
 * Slopshop Internal Event Bus
 * lib/events.js
 *
 * Lightweight EventEmitter-based bus that wires features together without
 * tight coupling. Any module can emit or subscribe without importing the other.
 *
 * Standard events:
 *   tool:success  { slug, apiKey, latency_ms, credits, outputHash }
 *   tool:error    { slug, apiKey, latency_ms, error, errorType }
 *   memory:set    { apiKey, namespace, key, proofHash }
 *   fleet:result  { agentId, taskId, resultStatus, apiKeyHash }
 *   workflow:done { runId, workflowId, apiKey, status, credits, traceId }
 *   chain:step    { chainId, step, slug, apiKey }
 */

const { EventEmitter } = require('events');

const bus = new EventEmitter();

// Raise the listener limit — many features subscribe to shared events
bus.setMaxListeners(100);

// Dev-mode: log unhandled bus errors so they don't silently disappear
bus.on('error', (err) => {
  console.warn('[events] unhandled bus error:', err.message);
});

module.exports = bus;
