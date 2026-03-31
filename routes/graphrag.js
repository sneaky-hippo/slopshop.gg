'use strict';

/**
 * GraphRAG — Knowledge Graph with Retrieval-Augmented Generation
 * routes/graphrag.js
 *
 * SQLite-backed nodes/edges graph with Jaccard token-overlap search
 * and multi-hop BFS traversal. All data is scoped to the API key.
 *
 * Endpoints:
 *   POST /v1/graphrag/add     — add a node
 *   POST /v1/graphrag/query   — semantic search + multi-hop traversal
 *   POST /v1/graphrag/link    — add an edge between two nodes
 *   DELETE /v1/graphrag/node  — delete a node (and its edges)
 *   GET  /v1/graphrag/stats   — count nodes/edges/namespaces
 */

const crypto = require('crypto');

function requireAuth(req, res, apiKeys) {
  const key = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!key || !apiKeys.get(key)) {
    res.status(401).json({ ok: false, error: { code: 'auth_required', message: 'Set Authorization: Bearer <key>' } });
    return null;
  }
  return key;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function ok(res, data) { res.json({ ok: true, ...data }); }
function err(res, status, code, message) {
  res.status(status).json({ ok: false, error: { code, message } });
}

// Jaccard token overlap score [0..1]
function jaccardScore(a, b) {
  if (!a && !b) return 0;
  const tokA = new Set((a || '').toLowerCase().split(/\W+/).filter(t => t.length > 1));
  const tokB = new Set((b || '').toLowerCase().split(/\W+/).filter(t => t.length > 1));
  if (tokA.size === 0 && tokB.size === 0) return 0;
  const intersection = [...tokA].filter(t => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : intersection / union;
}

module.exports = function (app, db, apiKeys) {

  // ── Schema bootstrap ──────────────────────────────────────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS graphrag_nodes (
      id           TEXT PRIMARY KEY,
      api_key_hash TEXT NOT NULL,
      namespace    TEXT NOT NULL DEFAULT 'default',
      label        TEXT NOT NULL,
      value        TEXT,
      metadata     TEXT,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_grag_nodes_key_ns ON graphrag_nodes(api_key_hash, namespace);

    CREATE TABLE IF NOT EXISTS graphrag_edges (
      id           TEXT PRIMARY KEY,
      api_key_hash TEXT NOT NULL,
      from_id      TEXT NOT NULL,
      to_id        TEXT NOT NULL,
      relation     TEXT NOT NULL DEFAULT 'related',
      weight       REAL NOT NULL DEFAULT 1.0,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_grag_edges_from ON graphrag_edges(api_key_hash, from_id);
    CREATE INDEX IF NOT EXISTS idx_grag_edges_to   ON graphrag_edges(api_key_hash, to_id);
  `);

  // ── POST /v1/graphrag/add ─────────────────────────────────────────────────

  app.post('/v1/graphrag/add', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { label, value, namespace = 'default', metadata } = req.body;
    if (!label || typeof label !== 'string' || label.length > 512) {
      return err(res, 422, 'invalid_label', 'label is required (max 512 chars)');
    }

    const api_key_hash = hashKey(apiKey);
    const node_id = 'n_' + crypto.randomUUID().replace(/-/g, '');
    const now = Date.now();

    db.prepare(`
      INSERT INTO graphrag_nodes (id, api_key_hash, namespace, label, value, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(node_id, api_key_hash, namespace, label, value || null, metadata ? JSON.stringify(metadata) : null, now);

    ok(res, {
      node_id,
      label,
      namespace,
      created_at: new Date(now).toISOString(),
    });
  });

  // ── POST /v1/graphrag/query ───────────────────────────────────────────────

  app.post('/v1/graphrag/query', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { query, namespace = 'default', depth = 1, limit = 20 } = req.body;
    if (!query || typeof query !== 'string') {
      return err(res, 422, 'missing_field', 'query is required');
    }

    const api_key_hash = hashKey(apiKey);
    const maxDepth = Math.min(Math.max(1, parseInt(depth) || 1), 3);
    const maxLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100);

    // Stage 1: Jaccard scoring on all nodes in namespace
    const allNodes = db.prepare(`
      SELECT id, label, value, metadata, created_at
      FROM graphrag_nodes
      WHERE api_key_hash = ? AND namespace = ?
    `).all(api_key_hash, namespace);

    const scored = allNodes.map(n => {
      const corpus = (n.label || '') + ' ' + (n.value || '');
      const score = jaccardScore(query, corpus);
      return { ...n, score };
    }).filter(n => n.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxLimit);

    if (scored.length === 0) {
      return ok(res, { results: [], edges: [], count: 0, query, depth: maxDepth });
    }

    // Apply recency decay to seed nodes before BFS (14-day half-life)
    const nowMs = Date.now();
    for (const n of scored) {
      const ageDays = (nowMs - n.created_at) / 86400000;
      n.score *= Math.exp(-0.05 * ageDays);
    }

    // Stage 2: Multi-hop BFS expansion
    // nodeScoreMap tracks the best score for each visited node so neighbor scores
    // can be propagated from their parent with edge-weight damping.
    const nodeScoreMap = new Map(scored.map(n => [n.id, n.score]));
    const visitedIds = new Set(scored.map(n => n.id));
    let frontier = [...visitedIds];
    const edges = [];
    const DAMPING = 0.6; // score decay per hop

    for (let hop = 0; hop < maxDepth; hop++) {
      if (frontier.length === 0) break;
      const frontierSet = new Set(frontier);
      const placeholders = frontier.map(() => '?').join(',');
      const hopEdges = db.prepare(`
        SELECT id, from_id, to_id, relation, weight
        FROM graphrag_edges
        WHERE api_key_hash = ? AND (from_id IN (${placeholders}) OR to_id IN (${placeholders}))
      `).all(api_key_hash, ...frontier, ...frontier);

      // Build inherited scores: best(parent_score * DAMPING * edge.weight) per new node
      const inheritedScore = new Map();
      const newFrontier = [];
      for (const edge of hopEdges) {
        edges.push(edge);
        // Determine which end is the frontier (parent) and which is new (child)
        const pairs = [
          { parent: edge.from_id, child: edge.to_id },
          { parent: edge.to_id,   child: edge.from_id },
        ];
        for (const { parent, child } of pairs) {
          if (!frontierSet.has(parent) || visitedIds.has(child)) continue;
          const parentScore = nodeScoreMap.get(parent) || 0;
          const propagated = parentScore * DAMPING * (edge.weight || 1.0);
          if (!inheritedScore.has(child) || propagated > inheritedScore.get(child)) {
            inheritedScore.set(child, propagated);
          }
        }
        // Mark both ends as visited and queue new ones
        for (const nid of [edge.from_id, edge.to_id]) {
          if (!visitedIds.has(nid)) {
            visitedIds.add(nid);
            newFrontier.push(nid);
          }
        }
      }

      // Fetch new neighbor nodes and attach propagated scores
      if (newFrontier.length > 0) {
        const np = newFrontier.map(() => '?').join(',');
        const neighbors = db.prepare(`
          SELECT id, label, value, metadata, created_at FROM graphrag_nodes WHERE id IN (${np})
        `).all(...newFrontier);
        for (const n of neighbors) {
          const propagatedScore = inheritedScore.get(n.id) || 0;
          nodeScoreMap.set(n.id, propagatedScore);
          scored.push({ ...n, score: propagatedScore, hop: hop + 1 });
        }
      }
      frontier = newFrontier;
    }

    // Deduplicate edges
    const seenEdges = new Set();
    const uniqueEdges = edges.filter(e => {
      if (seenEdges.has(e.id)) return false;
      seenEdges.add(e.id);
      return true;
    });

    ok(res, {
      results: scored.map(n => ({
        node_id: n.id,
        label: n.label,
        value: n.value || null,
        metadata: n.metadata ? JSON.parse(n.metadata) : null,
        score: parseFloat((n.score || 0).toFixed(4)),
        hop: n.hop || 0,
        created_at: new Date(n.created_at).toISOString(),
      })),
      edges: uniqueEdges.map(e => ({
        edge_id: e.id,
        from_id: e.from_id,
        to_id: e.to_id,
        relation: e.relation,
        weight: e.weight,
      })),
      count: scored.length,
      edge_count: uniqueEdges.length,
      query,
      depth: maxDepth,
    });
  });

  // ── POST /v1/graphrag/link ────────────────────────────────────────────────

  app.post('/v1/graphrag/link', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { from_id, to_id, relation = 'related', weight = 1.0 } = req.body;
    if (!from_id || !to_id) {
      return err(res, 422, 'missing_fields', 'from_id and to_id are required');
    }

    const api_key_hash = hashKey(apiKey);

    // Verify both nodes exist and belong to this key
    const fromNode = db.prepare('SELECT id FROM graphrag_nodes WHERE id = ? AND api_key_hash = ?').get(from_id, api_key_hash);
    const toNode   = db.prepare('SELECT id FROM graphrag_nodes WHERE id = ? AND api_key_hash = ?').get(to_id, api_key_hash);
    if (!fromNode) return err(res, 404, 'node_not_found', `Node ${from_id} not found`);
    if (!toNode)   return err(res, 404, 'node_not_found', `Node ${to_id} not found`);

    const edge_id = 'e_' + crypto.randomUUID().replace(/-/g, '');
    const now = Date.now();

    db.prepare(`
      INSERT INTO graphrag_edges (id, api_key_hash, from_id, to_id, relation, weight, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(edge_id, api_key_hash, from_id, to_id, relation, parseFloat(weight) || 1.0, now);

    ok(res, {
      edge_id,
      from_id,
      to_id,
      relation,
      weight: parseFloat(weight) || 1.0,
      created_at: new Date(now).toISOString(),
    });
  });

  // ── DELETE /v1/graphrag/node ──────────────────────────────────────────────

  app.delete('/v1/graphrag/node', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const { node_id } = req.body;
    if (!node_id) return err(res, 422, 'missing_field', 'node_id is required');

    const api_key_hash = hashKey(apiKey);
    const node = db.prepare('SELECT id FROM graphrag_nodes WHERE id = ? AND api_key_hash = ?').get(node_id, api_key_hash);
    if (!node) return err(res, 404, 'node_not_found', 'Node not found');

    db.prepare('DELETE FROM graphrag_nodes WHERE id = ?').run(node_id);
    const edgesDeleted = db.prepare(
      'DELETE FROM graphrag_edges WHERE api_key_hash = ? AND (from_id = ? OR to_id = ?)'
    ).run(api_key_hash, node_id, node_id);

    ok(res, { deleted: true, node_id, edges_removed: edgesDeleted.changes });
  });

  // ── GET /v1/graphrag/stats ────────────────────────────────────────────────

  app.get('/v1/graphrag/stats', (req, res) => {
    const apiKey = requireAuth(req, res, apiKeys);
    if (!apiKey) return;

    const api_key_hash = hashKey(apiKey);

    const nodeStats = db.prepare(`
      SELECT COUNT(*) as count, COUNT(DISTINCT namespace) as namespaces
      FROM graphrag_nodes WHERE api_key_hash = ?
    `).get(api_key_hash);

    const edgeStats = db.prepare(`
      SELECT COUNT(*) as count FROM graphrag_edges WHERE api_key_hash = ?
    `).get(api_key_hash);

    const topLabels = db.prepare(`
      SELECT label, COUNT(*) as freq FROM graphrag_nodes
      WHERE api_key_hash = ?
      GROUP BY label ORDER BY freq DESC LIMIT 10
    `).all(api_key_hash);

    const nsList = db.prepare(`
      SELECT namespace, COUNT(*) as count FROM graphrag_nodes
      WHERE api_key_hash = ? GROUP BY namespace
    `).all(api_key_hash);

    ok(res, {
      node_count: nodeStats.count,
      edge_count: edgeStats.count,
      namespace_count: nodeStats.namespaces,
      namespaces: nsList.map(r => ({ namespace: r.namespace, count: r.count })),
      top_labels: topLabels.map(r => ({ label: r.label, count: r.freq })),
    });
  });
};
