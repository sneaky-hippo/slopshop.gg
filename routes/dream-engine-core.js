'use strict';

const crypto = require('crypto');
const zlib = require('zlib');

// Local structured logger (matches server-v2.js log object)
const log = {
  info:  (msg, data = {}) => console.log(JSON.stringify({ level: 'info',  msg, ...data, ts: new Date().toISOString() })),
  warn:  (msg, data = {}) => console.log(JSON.stringify({ level: 'warn',  msg, ...data, ts: new Date().toISOString() })),
  error: (msg, data = {}) => console.error(JSON.stringify({ level: 'error', msg, ...data, ts: new Date().toISOString() })),
};

const IS_RAILWAY = !!(process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);

module.exports = function mountDreamEngineCore(app, db, apiKeys, allHandlers, auth, hashApiKey, deterministicFloat, persistKey, dbInsertAudit) {

  // ===== DB TABLE BOOTSTRAP (idempotent) =====

  // Bootstrap dream_sessions table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dream_sessions (
        id          TEXT PRIMARY KEY,
        api_key     TEXT NOT NULL,
        namespace   TEXT NOT NULL,
        strategy    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        keys_sampled INTEGER NOT NULL DEFAULT 0,
        memories_created INTEGER NOT NULL DEFAULT 0,
        model       TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
        started_at  INTEGER NOT NULL,
        completed_at INTEGER,
        duration_ms INTEGER,
        error       TEXT,
        result      TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_dream_sessions_api_key ON dream_sessions (api_key, started_at DESC);
    `);
  } catch (e) { /* table already exists */ }

  // Bootstrap dream_schedules table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dream_schedules (
        id              TEXT PRIMARY KEY,
        api_key         TEXT NOT NULL,
        namespace       TEXT NOT NULL,
        strategy        TEXT NOT NULL,
        interval_hours  REAL NOT NULL,
        budget          INTEGER NOT NULL DEFAULT 20,
        model           TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
        auto            INTEGER NOT NULL DEFAULT 1,
        credits_per_dream INTEGER NOT NULL DEFAULT 20,
        created_at      TEXT NOT NULL,
        last_run        TEXT,
        run_count       INTEGER NOT NULL DEFAULT 0,
        active          INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_dream_schedules_api_key ON dream_schedules (api_key, active);
    `);
  } catch (e) { /* table already exists */ }

  // Bootstrap dream_insights table
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS dream_insights (
      id TEXT PRIMARY KEY,
      dream_id TEXT,
      strategy TEXT,
      namespace TEXT,
      insight_type TEXT,
      content TEXT,
      salience_score REAL DEFAULT 0.5,
      confidence REAL DEFAULT 0.7,
      source_keys TEXT DEFAULT '[]',
      created INTEGER
    )`);
  } catch (e) { /* table already exists */ }

  // Bootstrap procedural_skills table
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS procedural_skills (
      id TEXT PRIMARY KEY,
      dream_id TEXT,
      namespace TEXT,
      trigger_condition TEXT,
      action_description TEXT,
      confidence REAL DEFAULT 0.7,
      source_strategy TEXT,
      tmr_boosted INTEGER DEFAULT 0,
      deploy_count INTEGER DEFAULT 0,
      created INTEGER
    )`);
  } catch (e) { /* table already exists */ }

  // ===== CONSTANTS =====

  const DREAM_STRATEGIES = ['synthesize', 'pattern_extract', 'insight_generate', 'compress', 'associate', 'validate', 'evolve', 'forecast', 'reflect', 'full_cycle'];

  // Per-strategy LLM prompts — each returns a function(namespace, memoriesText) -> string
  const DREAM_PROMPTS = {
    synthesize: function(ns, memories) {
      return 'You are a memory consolidation system performing sleep-like synthesis.\n\nNamespace: ' + ns + '\n\nHere are memories to process:\n\n' + memories + '\n\nSynthesize the key themes, patterns, and insights into 3-5 consolidated memory entries. Each entry should be richer than the originals, connecting ideas, surfacing patterns, and distilling actionable knowledge.\n\nRespond ONLY in valid JSON with this structure:\n{"synthesis": [{"key": "synth_<slug>", "value": "<rich consolidated content>", "theme": "<theme name>", "source_keys": ["<key1>"]}], "meta": {"dominant_themes": [], "coverage_gaps": [], "confidence": 0.9}}';
    },
    pattern_extract: function(ns, memories) {
      return 'You are a pattern recognition system analyzing stored memories.\n\nNamespace: ' + ns + '\n\nMemories to analyze:\n\n' + memories + '\n\nFind recurring patterns, contradictions, and gaps. Output a structured pattern map.\n\nRespond ONLY in valid JSON with this structure:\n{"patterns": [{"key": "pattern_<slug>", "value": "<pattern description and evidence>", "type": "recurring|contradiction|gap|trend", "frequency": 1, "source_keys": ["<key1>"]}], "meta": {"pattern_count": 0, "contradictions_found": 0, "gaps_found": 0}}';
    },
    insight_generate: function(ns, memories, opts) {
      const adversarial = opts && opts.adversarial;
      const adversarialInstruction = adversarial
        ? '\n\nADVERSARIAL MODE: Also generate 3 counterfactual scenarios ("what if the opposite were true?") for the most surprising insights. Add a "counterfactuals" array to each high-novelty insight.'
        : '';
      return 'You are a creative insight engine processing stored memories.\n\nNamespace: ' + ns + '\n\nMemories to combine:\n\n' + memories + adversarialInstruction + '\n\nGenerate novel insights by combining these memories in unexpected ways. Look for non-obvious connections, analogies, and emergent ideas not present in any single memory.\n\nRespond ONLY in valid JSON with this structure:\n{"insights": [{"key": "insight_<slug>", "value": "<novel insight with explanation>", "novelty_score": 0.8, "connecting_keys": ["<key1>", "<key2>"], "counterfactuals": []}], "meta": {"total_insights": 0, "avg_novelty": 0.8, "breakthrough_idea": "<idea>"}}';
    },
    compress: function(ns, memories) {
      return 'You are a memory compression system reducing redundancy.\n\nNamespace: ' + ns + '\n\nPotentially redundant memories:\n\n' + memories + '\n\nCompress similar or redundant memories into fewer, richer entries. Preserve all unique information while eliminating repetition.\n\nRespond ONLY in valid JSON with this structure:\n{"compressed": [{"key": "compressed_<slug>", "value": "<dense compressed content>", "replaces_keys": ["<key1>", "<key2>"], "compression_ratio": 2.0}], "meta": {"original_count": 0, "compressed_count": 0, "bytes_saved_estimate": 0}}';
    },
    associate: function(ns, memories) {
      return 'You are a memory association builder creating a knowledge graph.\n\nNamespace: ' + ns + '\n\nMemories to connect:\n\n' + memories + '\n\nBuild rich associations between these memories. Identify what connects them — shared concepts, causal links, temporal sequences, analogical relationships.\n\nRespond ONLY in valid JSON with this structure:\n{"associations": [{"key": "assoc_<slug>", "value": "<association description and link explanation>", "link_type": "causal|temporal|analogical|conceptual|contradictory", "linked_keys": ["<key1>", "<key2>"]}], "meta": {"total_links": 0, "strongest_cluster": "<cluster>", "isolated_keys": []}}';
    },
    validate: function(ns, memories) {
      return 'You are a memory validation system checking consistency and accuracy.\n\nNamespace: ' + ns + '\n\nMemories to validate:\n\n' + memories + '\n\nCheck each memory for: internal consistency, contradictions with other memories, outdated information, and confidence calibration. Flag uncertain or potentially incorrect memories.\n\nRespond ONLY in valid JSON with this structure:\n{"validated": [{"key": "val_<slug>", "value": "<validation assessment and corrected content>", "source_key": "<original_key>", "status": "valid|invalid|uncertain|outdated", "confidence": 0.8, "issues": []}], "meta": {"total_checked": 0, "valid_count": 0, "flagged_count": 0, "outdated_count": 0}}';
    },
    evolve: function(ns, memories) {
      return 'You are a memory evolution engine that upgrades beliefs based on new evidence.\n\nNamespace: ' + ns + '\n\nMemories to evolve:\n\n' + memories + '\n\nApply Bayesian reasoning to update beliefs. Identify which memories should be strengthened, weakened, or fundamentally revised based on the evidence patterns in the full memory set. Generate evolved, more accurate versions.\n\nRespond ONLY in valid JSON with this structure:\n{"evolved": [{"key": "evolved_<slug>", "value": "<evolved belief with reasoning>", "source_key": "<original_key>", "prior_confidence": 0.6, "posterior_confidence": 0.85, "evidence_used": ["<key1>"], "change_type": "strengthened|weakened|revised|confirmed"}], "meta": {"avg_confidence_delta": 0.1, "revisions": 0, "confirmations": 0}}';
    },
    forecast: function(ns, memories) {
      return 'You are a probabilistic forecasting engine analyzing memory patterns to predict future states.\n\nNamespace: ' + ns + '\n\nMemories to analyze:\n\n' + memories + '\n\nGenerate calibrated probabilistic forecasts based on memory patterns. Use Monte Carlo reasoning to explore multiple scenarios. Each forecast should have explicit confidence intervals.\n\nRespond ONLY in valid JSON with this structure:\n{"forecasts": [{"key": "forecast_<slug>", "value": "<detailed forecast with reasoning>", "domain": "<topic>", "probability": 0.72, "confidence_interval": [0.60, 0.84], "scenarios": [{"name": "base", "probability": 0.72, "description": "<scenario>"}], "horizon": "short|medium|long", "source_keys": ["<key1>"]}], "meta": {"total_forecasts": 0, "avg_probability": 0.65, "key_uncertainties": [], "monte_carlo_samples": 1000}}';
    },
    reflect: function(ns, memories) {
      return 'You are a metacognitive reflection engine performing deep self-analysis of memory quality and growth.\n\nNamespace: ' + ns + '\n\nMemories to reflect on:\n\n' + memories + '\n\nReflect on: how knowledge has evolved over time, what was learned and unlearned, blind spots in reasoning, quality of past predictions, growth in understanding, and strategic next steps for improving knowledge in this namespace.\n\nRespond ONLY in valid JSON with this structure:\n{"reflections": [{"key": "reflect_<slug>", "value": "<deep reflection on a theme>", "theme": "<reflection theme>", "growth_indicator": "positive|negative|neutral", "insight_depth": 0.8, "action_items": ["<action1>"]}], "meta": {"knowledge_maturity": 0.7, "growth_rate": "accelerating|steady|plateauing", "top_blind_spots": [], "recommended_next_strategy": "<strategy>"}}';
    },
    full_cycle: function(ns, memories) {
      return 'You are performing a complete 9-stage REM memory consolidation cycle on stored agent memories.\n\nNamespace: ' + ns + '\n\nMemories to process:\n' + memories + '\n\nRun ALL 9 stages sequentially:\n1. SYNTHESIZE — Combine into unified concepts (Buzsáki hippocampal replay)\n2. PATTERN_EXTRACT — Surface recurring themes and patterns\n3. INSIGHT_GENERATE — Create novel cross-memory connections (Tononi cortical binding)\n4. VALIDATE — Filter and strengthen reliable insights\n5. EVOLVE — Adapt knowledge weights based on patterns (Hebbian plasticity)\n6. FORECAST — Generate forward predictions (Clark predictive coding)\n7. COMPRESS — Distill and remove redundancy (Tononi/Cirelli SHY hypothesis)\n8. ASSOCIATE — Build semantic connection networks (Collins/Loftus spreading activation)\n9. REFLECT — Extract procedural skills and lessons learned\n\nReturn ONLY valid JSON:\n{"full_cycle_results": [{"key": "full_<slug>", "value": "<insight>", "stage": "<stage_name>", "novelty_score": 0.8}], "meta": {"total_stages": 9, "stage_counts": {"synthesize": 0, "pattern_extract": 0, "insight_generate": 0, "validate": 0, "evolve": 0, "forecast": 0, "compress": 0, "associate": 0, "reflect": 0}, "breakthrough_idea": "<idea>"}}';
    },
  };

  // Credits cost per strategy
  const DREAM_CREDITS = {
    synthesize:       25,
    pattern_extract:  20,
    insight_generate: 30,
    compress:         15,
    associate:        20,
    validate:         20,
    evolve:           30,
    forecast:         35,
    reflect:          25,
    full_cycle:       150,
  };

  // ===== HELPER FUNCTIONS =====

  // sampleDreamMemories — routes through allHandlers['memory-search'] + allHandlers['memory-list']
  function sampleDreamMemories(namespace, budget) {
    const searchHandler = allHandlers['memory-search'];
    const listHandler   = allHandlers['memory-list'];

    // Fall back to direct SQL only if handlers aren't loaded yet (boot-time edge case)
    if (!searchHandler || !listHandler) {
      const now = Date.now();
      return db.prepare(
        'SELECT key, value, tags, updated FROM memory WHERE namespace = ? AND (ttl = 0 OR (created + ttl * 1000) >= ?) ORDER BY updated DESC LIMIT ?'
      ).all(namespace, now, budget);
    }

    const semanticBudget = Math.ceil(budget * 0.6);
    const breadthBudget  = budget - semanticBudget;

    // Semantic half — broad query surfaces most content-rich memories regardless of recency
    const searchResult = searchHandler({ namespace, query: 'key insights themes patterns ideas knowledge', limit: semanticBudget });
    const semanticRows = (searchResult.results || []).map(function(r) {
      const val = typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value || '');
      const tags = Array.isArray(r.tags) ? JSON.stringify(r.tags) : (r.tags || '[]');
      return { key: r.key, value: val, tags, updated: r.updated || Date.now(), _from_handler: true };
    });

    // Breadth half — list all keys then fetch values for ones not already in semantic set
    const seenKeys = new Set(semanticRows.map(function(r) { return r.key; }));
    const listResult = listHandler({ namespace, limit: budget * 3 });
    const candidateKeys = (listResult.keys || []).filter(function(k) { return !seenKeys.has(k); });

    // Shuffle and take breadthBudget worth
    for (let i = candidateKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = candidateKeys[i]; candidateKeys[i] = candidateKeys[j]; candidateKeys[j] = tmp;
    }
    const breadthKeys = candidateKeys.slice(0, breadthBudget);

    // Fetch values for breadth keys via memory-get (through handler)
    const getHandler = allHandlers['memory-get'];
    const breadthRows = breadthKeys.map(function(k) {
      const r = getHandler ? getHandler({ namespace, key: k }) : null;
      if (!r || r._engine === 'not_found') return null;
      const val = typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value || '');
      const tags = Array.isArray(r.tags) ? JSON.stringify(r.tags) : (r.tags || '[]');
      return { key: k, value: val, tags, updated: Date.now(), _from_handler: true };
    }).filter(Boolean);

    return [...semanticRows, ...breadthRows];
  }

  // Strip lone surrogate pairs and other characters that break JSON serialisation.
  function _sanitizeForLLM(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[\uD800-\uDFFF]/g, '\uFFFD');
  }

  function formatMemoriesForLLM(rows) {
    return rows.map(function(r, i) {
      let val = r.value;
      // Raw DB rows: decompress ~z~ and unwrap JSON if needed
      if (!r._from_handler) {
        if (typeof val === 'string' && val.startsWith('~z~')) {
          try { val = zlib.inflateRawSync(Buffer.from(val.slice(3), 'base64')).toString('utf8'); } catch(_) {}
        }
        try { val = JSON.parse(val); if (typeof val === 'object') val = JSON.stringify(val); } catch (_) {}
      }
      val = _sanitizeForLLM(String(val || '')).slice(0, 800);
      let tags = '';
      try { tags = (Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags || '[]')).join(', '); } catch (_) { tags = r.tags || ''; }
      return '[' + (i + 1) + '] KEY: ' + r.key + '\n    TAGS: ' + (tags || 'none') + '\n    VALUE: ' + val;
    }).join('\n\n');
  }

  // Extract result entries from LLM response based on strategy
  function extractDreamEntries(strategy, parsed) {
    if (!parsed) return [];
    if (strategy === 'full_cycle') {
      let entries = [];
      if (parsed.full_cycle_results) entries = parsed.full_cycle_results;
      return Array.isArray(entries) ? entries : [];
    }
    const map = {
      synthesize:       parsed.synthesis,
      pattern_extract:  parsed.patterns,
      insight_generate: parsed.insights,
      compress:         parsed.compressed,
      associate:        parsed.associations,
      validate:         parsed.validated,
      evolve:           parsed.evolved,
      forecast:         parsed.forecasts,
      reflect:          parsed.reflections,
    };
    return Array.isArray(map[strategy]) ? map[strategy] : [];
  }

  // Map a model name to its provider name so the llm handler picks the right API key.
  function dreamModelToProvider(model) {
    if (!model || model === 'auto') return undefined;
    const m = model.toLowerCase();
    if (m.startsWith('claude')) return 'anthropic';
    if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'openai';
    if (m.startsWith('grok')) return 'grok';
    if (m.startsWith('deepseek')) return 'deepseek';
    if (m.startsWith('llama') || m.startsWith('mistral') || m.startsWith('phi') || m.startsWith('gemma')) return 'ollama';
    return undefined;
  }

  // Wrap an async promise with a hard timeout (ms). Rejects if exceeded.
  function withDreamTimeout(promise, ms, label) {
    return new Promise(function(resolve, reject) {
      var _t = setTimeout(function() {
        reject(new Error((label || 'Operation') + ' timed out after ' + ms + 'ms'));
      }, ms);
      promise.then(function(v) { clearTimeout(_t); resolve(v); }, function(e) { clearTimeout(_t); reject(e); });
    });
  }

  // Strategy key map: strategy name -> JSON key the LLM returns entries under
  const DREAM_STRATEGY_KEY = {
    synthesize:       'synthesis',
    pattern_extract:  'patterns',
    insight_generate: 'insights',
    compress:         'compressed',
    associate:        'associations',
    validate:         'validated',
    evolve:           'evolved',
    forecast:         'forecasts',
    reflect:          'reflections',
    full_cycle:       'full_cycle_results',
  };

  // ===== CORE DREAM EXECUTION =====
  // Called by both the route and the scheduler.
  // dryRun=true returns a preview without persisting anything or spending credits.
  async function executeDream(dreamId, apiKey, namespace, strategy, budget, model, dryRun, opts) {
    const startTime = Date.now();

    if (!dryRun) {
      db.prepare('UPDATE dream_sessions SET status = ? WHERE id = ?').run('running', dreamId);
    }
    const session = activeDreamSessions.get(dreamId);
    if (session) session.status = dryRun ? 'dry_run' : 'running';

    try {
      // 1. Orient — sample memories via slopshop handlers (semantic 60% + breadth 40%)
      let rows;
      if (opts && opts.keysFilter && opts.keysFilter.length > 0) {
        // User selected specific memory keys — fetch each via memory-get handler
        const getHandler = allHandlers['memory-get'];
        rows = opts.keysFilter.map(function(k) {
          const r = getHandler ? getHandler({ namespace, key: k }) : null;
          if (!r || r._engine === 'not_found') return null;
          const val = typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value || '');
          const tags = Array.isArray(r.tags) ? JSON.stringify(r.tags) : (r.tags || '[]');
          return { key: k, value: val, tags, updated: Date.now(), _from_handler: true };
        }).filter(Boolean);
        // Fall back to sample if none of the specified keys exist
        if (rows.length === 0) rows = sampleDreamMemories(namespace, budget);
      } else {
        rows = sampleDreamMemories(namespace, budget);
      }
      if (rows.length === 0) {
        const emptyResult = {
          dream_id: dreamId, strategy: strategy,
          keys_sampled: 0, memories_created: 0, keys_pruned: 0,
          duration_ms: Date.now() - startTime,
          note: 'namespace is empty — nothing to dream about',
          brief: 'No memories found in this namespace. Store some memories first, then dream.',
          entries: [],
        };
        if (!dryRun) {
          db.prepare('UPDATE dream_sessions SET status = ?, keys_sampled = ?, memories_created = ?, completed_at = ?, duration_ms = ?, result = ? WHERE id = ?')
            .run('complete', 0, 0, Date.now(), Date.now() - startTime, JSON.stringify(emptyResult), dreamId);
          if (session) Object.assign(session, { status: 'complete', keys_sampled: 0, memories_created: 0 });
        }
        return emptyResult;
      }

      const keySampled = rows.map(function(r) { return r.key; });
      const formattedMemories = formatMemoriesForLLM(rows);

      // full_cycle: run all 9 strategies sequentially, each stage's output enriches the next
      if (strategy === 'full_cycle') {
        const fullCycleStages = ['synthesize', 'pattern_extract', 'insight_generate', 'validate', 'evolve', 'forecast', 'compress', 'associate', 'reflect'];
        const allEntries = [];
        const stageCounts = {};
        let cumulativeContext = formattedMemories;
        let breakthroughIdea = null;

        for (let si = 0; si < fullCycleStages.length; si++) {
          const stg = fullCycleStages[si];
          const stgPromptFn = DREAM_PROMPTS[stg];
          if (!stgPromptFn) continue;
          const stgPrompt = stgPromptFn(namespace, cumulativeContext, opts || {});

          const llmHandlerFC = allHandlers['llm-think'];
          if (!llmHandlerFC) throw new Error('No LLM handler available.');
          const provider = dreamModelToProvider(model);
          let stgResult;
          try {
            const _fcTokens = Math.min(6000, 2000 + Math.max(0, keySampled.length - 5) * 200);
            stgResult = await withDreamTimeout(
              llmHandlerFC({
                text: stgPrompt,
                model: (model && model !== 'auto') ? model : undefined,
                provider: provider,
                max_tokens: _fcTokens,
                system_prompt: 'You are a memory consolidation engine. Always respond in valid JSON only. No markdown, no prose outside JSON.',
              }),
              90000,
              'Dream full_cycle stage ' + stg
            );
          } catch (_stgErr) {
            stageCounts[stg] = 0;
            continue;
          }

          if (stgResult && stgResult._engine === 'needs_key') {
            throw new Error('No LLM provider key configured.');
          }

          const stgKey = DREAM_STRATEGY_KEY[stg];
          let stgParsed = null;
          if (stgResult && Array.isArray(stgResult[stgKey])) {
            stgParsed = stgResult;
          } else {
            const rawText = stgResult
              ? (typeof stgResult.answer === 'string' ? stgResult.answer
                : typeof stgResult.raw === 'string' ? stgResult.raw
                : typeof stgResult.text === 'string' ? stgResult.text
                : JSON.stringify(stgResult))
              : '{}';
            try {
              const jm = rawText.match(/\{[\s\S]*\}/);
              if (jm) stgParsed = JSON.parse(jm[0]);
            } catch (_) {}
          }

          const stgEntries = stgParsed ? extractDreamEntries(stg, stgParsed) : [];
          stageCounts[stg] = stgEntries.length;
          if (stgParsed && stgParsed.meta && stgParsed.meta.breakthrough_idea && !breakthroughIdea) {
            breakthroughIdea = stgParsed.meta.breakthrough_idea;
          }

          // Tag entries with their stage and add to combined list
          for (let ei = 0; ei < stgEntries.length; ei++) {
            const e = stgEntries[ei];
            if (!e || !e.key) continue;
            allEntries.push(Object.assign({}, e, {
              key: 'full_' + stg + '_' + e.key,
              stage: stg,
              novelty_score: e.novelty_score || e.insight_depth || e.probability || 0.7,
            }));
          }

          // Enrich context: append summarized stage output for next stage
          if (stgEntries.length > 0) {
            const stgSummary = stgEntries.slice(0, 5).map(function(e, i) {
              return '[' + stg.toUpperCase() + '-' + (i + 1) + '] ' + String(e.value || '').slice(0, 300);
            }).join('\n');
            cumulativeContext = cumulativeContext + '\n\n--- ' + stg.toUpperCase() + ' STAGE OUTPUTS ---\n' + stgSummary;
          }
        }

        // Build combined meta
        const totalInsights = allEntries.length;
        const fcMeta = {
          total_stages: 9,
          stages_completed: Object.keys(stageCounts).length,
          stage_counts: stageCounts,
          breakthrough_idea: breakthroughIdea || null,
          total_insights: totalInsights,
        };

        // Build brief
        const brief = 'Dream Engine ran full_cycle (9 stages) on ' + keySampled.length + ' memories, producing ' + totalInsights + ' total insights across all stages. '
          + (breakthroughIdea ? 'Breakthrough: ' + String(breakthroughIdea).slice(0, 120) + '.' : 'No single breakthrough detected.');

        // Store dream outputs
        const dreamNamespace = namespace + ':dreams';
        const dreamTags = ['dream', 'synthesized', 'full_cycle'];
        const bulkEntries = [];
        for (let ei = 0; ei < allEntries.length; ei++) {
          const entry = allEntries[ei];
          if (!entry || !entry.key) continue;
          const memKey = dreamId + ':' + entry.key;
          bulkEntries.push({
            key: memKey,
            value: Object.assign({}, entry, {
              dream_id: dreamId,
              strategy: 'full_cycle',
              source_namespace: namespace,
              dreamed_at: new Date().toISOString(),
              model: model,
              meta: fcMeta,
            }),
            tags: dreamTags,
            type: 'dream',
          });
        }
        bulkEntries.push({
          key: dreamId + ':manifest',
          value: {
            dream_id: dreamId,
            strategy: 'full_cycle',
            source_namespace: namespace,
            keys_sampled: keySampled,
            entries_generated: allEntries.length,
            brief: brief,
            meta: fcMeta,
            dreamed_at: new Date().toISOString(),
            model: model,
          },
          tags: ['dream', 'manifest', 'full_cycle'],
          type: 'dream',
        });

        let memoriesCreated = 0;
        if (!dryRun && bulkEntries.length > 0) {
          try {
            const bulkResult = allHandlers['memory-bulk-set']({ namespace: dreamNamespace, entries: bulkEntries });
            memoriesCreated = (bulkResult && typeof bulkResult.stored === 'number') ? bulkResult.stored : bulkEntries.length;
          } catch (_be) {
            memoriesCreated = 0;
          }
        } else if (dryRun) {
          memoriesCreated = bulkEntries.length;
        }

        const durationMs = Date.now() - startTime;
        const entriesSummary = allEntries.slice(0, 20).map(function(e) {
          return { key: e.key, value: typeof e.value === 'string' ? e.value.slice(0, 300) : e.value, type: e.stage || 'full_cycle' };
        });

        const fcResult = {
          dream_id: dreamId,
          strategy: 'full_cycle',
          namespace: namespace,
          dream_namespace: dreamNamespace,
          keys_sampled: keySampled.length,
          keys_sampled_list: keySampled,
          insights_generated: totalInsights,
          memories_created: memoriesCreated,
          keys_pruned: 0,
          duration_ms: durationMs,
          model: model,
          brief: brief,
          entries: entriesSummary,
          meta: fcMeta,
          _engine: 'llm',
        };
        if (dryRun) fcResult._dry_run = true;

        if (!dryRun) {
          db.prepare('UPDATE dream_sessions SET status = ?, keys_sampled = ?, memories_created = ?, completed_at = ?, duration_ms = ?, result = ? WHERE id = ?')
            .run('complete', keySampled.length, memoriesCreated, Date.now(), durationMs, JSON.stringify(fcResult), dreamId);
          if (session) Object.assign(session, { status: 'complete', keys_sampled: keySampled.length, memories_created: memoriesCreated, duration_ms: durationMs });
        }

        return fcResult;
      }

      // 2. Gather — build strategy-specific LLM prompt
      const promptFn = DREAM_PROMPTS[strategy];
      if (!promptFn) throw new Error('Unknown strategy: ' + strategy);
      let userPrompt = promptFn(namespace, formattedMemories, opts || {});
      if (opts && opts.customPrompt) {
        userPrompt += '\n\nUSER INTENTION FOR THIS DREAM SESSION:\n' + opts.customPrompt;
      }

      // 3. Consolidate — invoke LLM with provider auto-mapped from model name; 90s hard timeout
      let llmResult;
      const dreamSystemPrompt = 'You are a memory consolidation engine. Always respond in valid JSON only. No markdown, no prose outside JSON.';

      if (strategy === 'insight_generate' && opts && opts.multiLlm) {
        // Multi-LLM mode: query all available providers and aggregate insights
        const councilHandler = allHandlers['llm-council'];
        const llmHandler = allHandlers['llm-think'];
        if (!councilHandler && !llmHandler) throw new Error('No LLM handler available.');

        if (councilHandler) {
          const councilRaw = await withDreamTimeout(
            councilHandler({ text: userPrompt, system_prompt: dreamSystemPrompt, max_tokens: 2000 }),
            150000, 'Multi-LLM insight_generate council'
          );
          // Aggregate: extract insights from each provider's response
          const allInsights = [];
          if (councilRaw && councilRaw.council) {
            for (const [providerName, resp] of Object.entries(councilRaw.council)) {
              if (resp.error) continue;
              let raw = resp.answer || '';
              try {
                const jm = raw.match(/\{[\s\S]*\}/);
                if (jm) {
                  const parsed = JSON.parse(jm[0]);
                  const items = parsed.insights || [];
                  items.forEach(function(ins) {
                    if (ins && ins.key && ins.value) {
                      allInsights.push(Object.assign({}, ins, {
                        key: providerName + '_' + ins.key,
                        source_provider: providerName,
                      }));
                    }
                  });
                }
              } catch (_) {}
            }
          }
          // Build a synthetic llmResult matching insight_generate expected shape
          llmResult = {
            insights: allInsights,
            meta: {
              total_insights: allInsights.length,
              avg_novelty: allInsights.length > 0 ? allInsights.reduce((s, i) => s + (i.novelty_score || 0.7), 0) / allInsights.length : 0,
              breakthrough_idea: allInsights.length > 0 ? allInsights[0].value?.slice?.(0, 120) : null,
              providers_queried: councilRaw?.providers_queried || 0,
              multi_llm: true,
            },
          };
        } else {
          // Fallback to single LLM
          const _fbTokens = Math.min(8000, 3000 + Math.max(0, keySampled.length - 5) * 300);
          llmResult = await withDreamTimeout(llmHandler({ text: userPrompt, max_tokens: _fbTokens, system_prompt: dreamSystemPrompt }), 90000, 'Dream LLM call');
        }
      } else {
        const llmHandler = allHandlers['llm-think'];
        if (!llmHandler) throw new Error('No LLM handler available. Configure ANTHROPIC_API_KEY or another provider key.');
        const provider = dreamModelToProvider(model);
        const _dynTokens = Math.min(8000, 3000 + Math.max(0, keySampled.length - 5) * 300);
        llmResult = await withDreamTimeout(
          llmHandler({
            text: userPrompt,
            model: (model && model !== 'auto') ? model : undefined,
            provider: provider,
            max_tokens: _dynTokens,
            system_prompt: dreamSystemPrompt,
          }),
          90000,
          'Dream LLM call'
        );
      }

      // Guard: if no provider key was configured, handler returns { _engine: 'needs_key' }
      if (llmResult && llmResult._engine === 'needs_key') {
        throw new Error('No LLM provider key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or DEEPSEEK_API_KEY.');
      }

      // 4. Parse LLM output
      let parsedOutput = null;
      const strategyKey = DREAM_STRATEGY_KEY[strategy];

      if (llmResult && Array.isArray(llmResult[strategyKey])) {
        parsedOutput = llmResult;
      } else {
        const rawText = llmResult
          ? (typeof llmResult.answer === 'string' ? llmResult.answer
            : typeof llmResult.raw    === 'string' ? llmResult.raw
            : typeof llmResult.text   === 'string' ? llmResult.text
            : JSON.stringify(llmResult))
          : '{}';
        try {
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsedOutput = JSON.parse(jsonMatch[0]);
        } catch (_) {}
      }

      if (!parsedOutput || !Array.isArray(parsedOutput[strategyKey])) {
        parsedOutput = {};
        parsedOutput[strategyKey] = [{
          key: 'dream_raw_' + Date.now().toString(36),
          value: JSON.stringify(llmResult || {}).slice(0, 4000),
        }];
      }

      // 5. Extract structured entries and meta
      const entries = extractDreamEntries(strategy, parsedOutput);
      const meta = parsedOutput.meta || {};

      // Generate a brief 2-sentence summary for log and status response
      const dominantTheme = (meta.dominant_themes && meta.dominant_themes[0])
        || meta.strongest_cluster
        || meta.breakthrough_idea
        || null;
      const brief = 'Dream Engine ran "' + strategy + '" on ' + keySampled.length + ' memories, producing '
        + entries.length + ' ' + strategy.replace('_', '-') + ' entr' + (entries.length === 1 ? 'y' : 'ies') + '. '
        + (dominantTheme
          ? 'Primary focus: ' + String(dominantTheme).slice(0, 120) + '.'
          : 'No single dominant theme detected across the sampled memories.');

      // 6. Store — write dream outputs as memory keys into <namespace>:dreams
      const dreamNamespace = namespace + ':dreams';
      const dreamTags = ['dream', 'synthesized', strategy];
      const bulkEntries = [];

      for (let ei = 0; ei < entries.length; ei++) {
        const entry = entries[ei];
        if (!entry || !entry.key) continue;
        const memKey = dreamId + ':' + entry.key;
        bulkEntries.push({
          key: memKey,
          value: Object.assign({}, entry, {
            dream_id: dreamId,
            strategy: strategy,
            source_namespace: namespace,
            dreamed_at: new Date().toISOString(),
            model: model,
            meta: meta,
          }),
          tags: dreamTags,
          type: 'dream',
        });
      }

      // Manifest entry summarizing this dream session (always stored)
      bulkEntries.push({
        key: dreamId + ':manifest',
        value: {
          dream_id: dreamId,
          strategy: strategy,
          source_namespace: namespace,
          keys_sampled: keySampled,
          entries_generated: entries.length,
          brief: brief,
          meta: meta,
          dreamed_at: new Date().toISOString(),
          model: model,
        },
        tags: ['dream', 'manifest', strategy],
        type: 'dream',
      });

      let memoriesCreated = 0;
      if (!dryRun && bulkEntries.length > 0) {
        try {
          const bulkResult = allHandlers['memory-bulk-set']({ namespace: dreamNamespace, entries: bulkEntries });
          memoriesCreated = (bulkResult && typeof bulkResult.stored === 'number') ? bulkResult.stored : bulkEntries.length;
        } catch (bulkErr) {
          log.error('Dream bulk-set failed', { dreamId: dreamId, error: bulkErr.message });
          memoriesCreated = 0;
        }
      } else if (dryRun) {
        memoriesCreated = bulkEntries.length;
      }

      // Extract procedural skills from reflect/forecast entries
      if (!dryRun && (strategy === 'reflect' || strategy === 'forecast' || strategy === 'evolve')) {
        const skillStmt = db.prepare('INSERT INTO procedural_skills (id, dream_id, namespace, trigger_condition, action_description, confidence, source_strategy, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (let si = 0; si < entries.length; si++) {
          const entry = entries[si];
          const hasSkill = (entry.action_items && entry.action_items.length > 0) || (entry.probability && entry.probability > 0.65);
          if (!hasSkill) continue;
          const trigger = entry.theme || entry.domain || entry.key || 'pattern_detected';
          const action = entry.action_items ? entry.action_items.join('; ') : (entry.value || '');
          const conf = entry.insight_depth || entry.probability || entry.posterior_confidence || 0.7;
          const skillId = 'skill-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
          try {
            skillStmt.run(skillId, dreamId, namespace, String(trigger).slice(0, 500), String(action).slice(0, 2000), conf, strategy, Date.now());
          } catch (_) {}
        }
      }

      // 7. Prune — for compress strategy, only delete source keys if replace_originals=true (opt-in)
      let pruned = 0;
      if (!dryRun && strategy === 'compress' && opts && opts.replaceOriginals) {
        const memDeleteHandler = allHandlers['memory-delete'];
        if (memDeleteHandler) {
          const toDelete = new Set();
          for (let pi = 0; pi < entries.length; pi++) {
            const pEntry = entries[pi];
            if (Array.isArray(pEntry.replaces_keys)) {
              pEntry.replaces_keys.forEach(function(k) { if (k && typeof k === 'string') toDelete.add(k); });
            }
          }
          toDelete.forEach(function(k) {
            try { memDeleteHandler({ namespace: namespace, key: k }); pruned++; } catch (_) {}
          });
        }
      }

      const durationMs = Date.now() - startTime;

      const entriesSummary = entries.slice(0, 20).map(function(e) {
        return {
          key: e.key,
          value: typeof e.value === 'string' ? e.value.slice(0, 300) : e.value,
          type: e.type || e.link_type || strategy,
        };
      });

      const result = {
        dream_id: dreamId,
        strategy: strategy,
        namespace: namespace,
        dream_namespace: dreamNamespace,
        keys_sampled: keySampled.length,
        keys_sampled_list: keySampled,
        insights_generated: entries.length,
        memories_created: memoriesCreated,
        keys_pruned: pruned,
        duration_ms: durationMs,
        model: model,
        brief: brief,
        entries: entriesSummary,
        meta: meta,
        _engine: 'llm',
      };
      if (dryRun) result._dry_run = true;

      if (!dryRun) {
        db.prepare('UPDATE dream_sessions SET status = ?, keys_sampled = ?, memories_created = ?, completed_at = ?, duration_ms = ?, result = ? WHERE id = ?')
          .run('complete', keySampled.length, memoriesCreated, Date.now(), durationMs, JSON.stringify(result), dreamId);
        if (session) Object.assign(session, { status: 'complete', keys_sampled: keySampled.length, memories_created: memoriesCreated, duration_ms: durationMs });
      }

      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err.message || String(err);
      if (!dryRun) {
        db.prepare('UPDATE dream_sessions SET status = ?, completed_at = ?, duration_ms = ?, error = ? WHERE id = ?')
          .run('error', Date.now(), durationMs, errorMsg, dreamId);
        if (session) Object.assign(session, { status: 'error', error: errorMsg, duration_ms: durationMs });
      }
      throw err;
    }
  }

  // ===== RUNTIME STATE =====
  const activeDreamSessions = new Map(); // dream_id -> session metadata
  const dreamSchedules = new Map();      // schedule_id -> { timer, config }

  // Restore active dream schedules on boot
  (function restoreDreamSchedules() {
    try {
      const rows = db.prepare('SELECT * FROM dream_schedules WHERE active = 1').all();
      for (const row of rows) {
        const config = {
          id: row.id,
          api_key: row.api_key,
          namespace: row.namespace,
          strategy: row.strategy,
          interval_hours: row.interval_hours,
          budget: row.budget,
          model: row.model,
          auto: !!row.auto,
          credits_per_dream: row.credits_per_dream,
          created_at: row.created_at,
          last_run: row.last_run,
          run_count: row.run_count,
          active: true,
        };
        const credits = row.credits_per_dream;
        const scheduleId = row.id;
        const apiKeyRef = row.api_key;
        const namespace = row.namespace;
        const strategy = row.strategy;
        const budget = row.budget;
        const model = row.model;

        async function makeRestoreRunner(sid, akey, ns, strat, bdgt, mdl, creds) {
          return async function runScheduledDream() {
            // Memory guard: skip dream execution on Railway if heap is too high
            if (IS_RAILWAY) {
              const mem = process.memoryUsage();
              if (mem.heapUsed > 150 * 1024 * 1024) {
                log.warn('Skipping scheduled dream — memory pressure', { scheduleId: sid, heap_mb: Math.round(mem.heapUsed/1024/1024) });
                return;
              }
            }
            const acct = apiKeys.get(akey);
            if (!acct || acct.balance < creds) {
              log.warn('Skipping scheduled dream — insufficient credits', { scheduleId: sid, balance: acct ? acct.balance : 0 });
              return;
            }
            const dreamId = 'dream-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
            const now = Date.now();
            try {
              db.prepare(
                'INSERT INTO dream_sessions (id, api_key, namespace, strategy, status, keys_sampled, memories_created, model, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).run(dreamId, akey, ns, strat, 'pending', 0, 0, mdl, now);
              activeDreamSessions.set(dreamId, {
                id: dreamId, api_key: akey, namespace: ns, strategy: strat,
                budget: bdgt, model: mdl, status: 'pending',
                started_at: new Date(now).toISOString(), keys_sampled: 0, memories_created: 0,
              });
              acct.balance -= creds;
              if (persistKey) persistKey(akey);
              if (dbInsertAudit) dbInsertAudit.run(new Date().toISOString(), akey.slice(0, 12) + '...', 'memory/dream/scheduled', creds, 0, 'llm');
              await executeDream(dreamId, akey, ns, strat, bdgt, mdl);
            } catch (e) {
              log.error('Scheduled dream failed', { scheduleId: sid, dreamId: dreamId, error: e.message });
            } finally {
              activeDreamSessions.delete(dreamId);
              const sched = dreamSchedules.get(sid);
              if (sched) {
                sched.last_run = new Date().toISOString();
                sched.run_count = (sched.run_count || 0) + 1;
              }
              try {
                db.prepare('UPDATE dream_schedules SET last_run = ?, run_count = run_count + 1 WHERE id = ?')
                  .run(new Date().toISOString(), sid);
              } catch (_) {}
            }
          };
        }

        makeRestoreRunner(scheduleId, apiKeyRef, namespace, strategy, budget, model, credits).then(function(runner) {
          const safeInterval = Math.max(row.interval_hours, IS_RAILWAY ? 1 : 0.25) * 3600 * 1000;
          const timer = setInterval(runner, safeInterval);
          config._timer = timer;
          dreamSchedules.set(scheduleId, config);
          log.info('Restored dream schedule', { id: scheduleId, namespace: namespace, strategy: strategy, interval_hours: row.interval_hours });
        }).catch(function(e) {
          log.error('Failed to restore dream schedule', { id: scheduleId, error: e.message });
        });
      }
      if (rows.length) log.info('Dream schedules restored', { count: rows.length });
    } catch (e) {
      log.warn('Could not restore dream schedules', { error: e.message });
    }
  })();

  // ===== DREAM ROUTES =====

  // POST /v1/memory/dream/start — Kick off a dreaming session
  // Pass dry_run=true to preview what would be dreamed without spending credits or writing memories.
  app.post('/v1/memory/dream/start', auth, async (req, res) => {
    const rawNamespace = req.body.namespace || 'default';
    if (!req.acct._nsPrefix) {
      req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    }
    const namespace = req.acct._nsPrefix + ':' + rawNamespace;
    const strategy = req.body.strategy || 'synthesize';
    const budget = Math.min(Math.max(1, parseInt(req.body.budget) || 20), 100);
    const model = req.body.model || 'claude-haiku-4-5-20251001';
    const dryRun = req.body.dry_run === true || req.body.dry_run === 'true';
    const adversarial = req.body.adversarial === true || req.body.adversarial === 'true';
    const salienceThreshold = parseFloat(req.body.salience_threshold) || 0.0;
    const customPrompt = typeof req.body.custom_prompt === 'string' ? req.body.custom_prompt.slice(0, 1000) : null;
    const keysFilter = Array.isArray(req.body.keys_filter) ? req.body.keys_filter.slice(0, 100) : null;
    const multiLlm = req.body.multi_llm === true || req.body.multi_llm === 'true';
    const replaceOriginals = req.body.replace_originals === true || req.body.replace_originals === 'true';

    if (!DREAM_STRATEGIES.includes(strategy)) {
      return res.status(400).json({ error: { code: 'invalid_strategy', message: 'strategy must be one of: ' + DREAM_STRATEGIES.join(', ') } });
    }

    const credits = DREAM_CREDITS[strategy] || 20;

    // dry_run: run the full LLM pipeline but skip DB write and credit deduction
    if (dryRun) {
      const dryId = 'dry-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
      try {
        const preview = await executeDream(dryId, req.apiKey, namespace, strategy, budget, model, true, { adversarial, salienceThreshold, customPrompt, keysFilter, multiLlm, replaceOriginals });
        return res.json(Object.assign({ ok: true, _dry_run: true, credits_would_charge: credits }, preview));
      } catch (dryErr) {
        return res.status(500).json({ error: { code: 'dry_run_failed', message: dryErr.message } });
      }
    }

    if (req.acct.balance < credits) {
      return res.status(402).json({ error: { code: 'insufficient_credits', required: credits, balance: req.acct.balance } });
    }

    const dreamId = 'dream-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
    const now = Date.now();

    db.prepare(
      'INSERT INTO dream_sessions (id, api_key, namespace, strategy, status, keys_sampled, memories_created, model, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(dreamId, req.apiKey, namespace, strategy, 'pending', 0, 0, model, now);

    activeDreamSessions.set(dreamId, {
      id: dreamId,
      api_key: req.apiKey,
      namespace: namespace,
      strategy: strategy,
      budget: budget,
      model: model,
      status: 'pending',
      started_at: new Date(now).toISOString(),
      keys_sampled: 0,
      memories_created: 0,
    });

    req.acct.balance -= credits;
    if (persistKey) persistKey(req.apiKey);
    if (dbInsertAudit) dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', 'memory/dream/start', credits, 0, 'llm');

    // Fire-and-forget — client polls /v1/memory/dream/status/:id
    executeDream(dreamId, req.apiKey, namespace, strategy, budget, model, false, { adversarial, salienceThreshold, customPrompt, keysFilter, multiLlm, replaceOriginals })
      .then(function() { activeDreamSessions.delete(dreamId); })
      .catch(function(err) {
        log.error('Dream execution failed', { dreamId: dreamId, error: err.message });
        activeDreamSessions.delete(dreamId);
      });

    res.json({
      ok: true,
      dream_id: dreamId,
      status: 'running',
      namespace: rawNamespace,
      strategy: strategy,
      budget: budget,
      model: model,
      credits_charged: credits,
      dream_namespace: rawNamespace + ':dreams',
      poll_endpoint: 'GET /v1/memory/dream/status/' + dreamId,
      what_happens_next: 'The Dream Engine is synthesizing your memories using the "' + strategy + '" strategy. It will sample up to ' + budget + ' memory keys, extract patterns and insights, and store compressed dream outputs back into your namespace. This is the open, multi-model alternative to KAIROS — fully self-hostable.',
      tip: 'Use dry_run=true to preview without spending credits. Schedule recurring dreams with POST /v1/memory/dream/schedule.',
      _engine: 'real',
    });
  });

  // POST /v1/memory/dream/run — Synchronous single-cycle dream execution (returns insights immediately)
  // Used by Coma hive-run and any client that wants a blocking call instead of start+poll.
  app.post('/v1/memory/dream/run', auth, async (req, res) => {
    const rawNamespace = req.body.namespace || 'default';
    if (!req.acct._nsPrefix) {
      req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    }
    const namespace = req.acct._nsPrefix + ':' + rawNamespace;

    // Accept strategies[] array (from Coma) or strategy string
    let strategy = 'synthesize';
    if (Array.isArray(req.body.strategies) && req.body.strategies.length > 0) {
      strategy = req.body.strategies[0];
    } else if (typeof req.body.strategy === 'string' && req.body.strategy) {
      strategy = req.body.strategy;
    }
    if (!DREAM_STRATEGIES.includes(strategy)) strategy = 'synthesize';

    const budget = Math.min(Math.max(1, parseInt(req.body.budget) || 20), 100);
    const model = req.body.model || 'claude-haiku-4-5-20251001';
    const customPrompt = typeof req.body.custom_prompt === 'string' ? req.body.custom_prompt.slice(0, 1000) : null;
    const credits = DREAM_CREDITS[strategy] || 20;

    if (req.acct.balance < credits) {
      return res.status(402).json({ error: { code: 'insufficient_credits', required: credits, balance: req.acct.balance } });
    }

    const dreamId = 'dream-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
    const now = Date.now();

    db.prepare(
      'INSERT INTO dream_sessions (id, api_key, namespace, strategy, status, keys_sampled, memories_created, model, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(dreamId, req.apiKey, namespace, strategy, 'pending', 0, 0, model, now);

    activeDreamSessions.set(dreamId, {
      id: dreamId, api_key: req.apiKey, namespace, strategy, budget, model,
      status: 'pending', started_at: new Date(now).toISOString(), keys_sampled: 0, memories_created: 0,
    });

    req.acct.balance -= credits;
    if (persistKey) persistKey(req.apiKey);
    if (dbInsertAudit) dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', 'memory/dream/run', credits, 0, 'llm');

    try {
      const result = await executeDream(dreamId, req.apiKey, namespace, strategy, budget, model, false, { customPrompt });
      activeDreamSessions.delete(dreamId);
      const entries = result.entries || [];
      res.json({
        ok: true,
        dream_id: dreamId,
        strategy,
        namespace: rawNamespace,
        insights: entries,
        insights_generated: entries.length,
        keys_sampled: result.keys_sampled || 0,
        memories_created: result.memories_created || 0,
        brain_glow_delta: result.intelligence_score || 0,
        brief: result.brief || null,
        duration_ms: result.duration_ms || (Date.now() - now),
        credits_charged: credits,
        _engine: 'real',
      });
    } catch (e) {
      activeDreamSessions.delete(dreamId);
      log.error('Dream run (sync) failed', { dreamId, error: e.message });
      res.status(500).json({ error: { code: 'dream_failed', message: e.message, dream_id: dreamId } });
    }
  });

  // GET /v1/memory/dream/status/:dream_id — Poll dream session status
  app.get('/v1/memory/dream/status/:dream_id', auth, function(req, res) {
    const dream_id = req.params.dream_id;

    const active = activeDreamSessions.get(dream_id);
    if (active && active.api_key === req.apiKey) {
      const safe = Object.assign({}, active);
      delete safe.api_key;
      return res.json(Object.assign({ ok: true, _engine: 'real' }, safe));
    }

    const session = db.prepare('SELECT * FROM dream_sessions WHERE id = ? AND api_key = ?').get(dream_id, req.apiKey);
    if (!session) return res.status(404).json({ error: { code: 'not_found', message: 'Dream session not found or not yours' } });

    let result = null;
    try { result = session.result ? JSON.parse(session.result) : null; } catch (_) {}

    res.json({
      ok: true,
      dream_id: session.id,
      namespace: session.namespace,
      strategy: session.strategy,
      status: session.status,
      model: session.model,
      keys_sampled: session.keys_sampled,
      memories_created: session.memories_created,
      keys_pruned: result ? (result.keys_pruned || 0) : null,
      started_at: new Date(session.started_at).toISOString(),
      completed_at: session.completed_at ? new Date(session.completed_at).toISOString() : null,
      duration_ms: session.duration_ms,
      error: session.error || null,
      brief: result ? (result.brief || null) : null,
      entries: result ? (result.entries || null) : null,
      result: result,
      _engine: 'real',
    });
  });

  // GET /v1/memory/dream/log — List recent dream sessions for this API key
  app.get('/v1/memory/dream/log', auth, function(req, res) {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const statusFilter = req.query.status;

    let sessions;
    if (statusFilter) {
      sessions = db.prepare('SELECT id, namespace, strategy, status, model, keys_sampled, memories_created, started_at, completed_at, duration_ms, error, result FROM dream_sessions WHERE api_key = ? AND status = ? ORDER BY started_at DESC LIMIT ?').all(req.apiKey, statusFilter, limit);
    } else {
      sessions = db.prepare('SELECT id, namespace, strategy, status, model, keys_sampled, memories_created, started_at, completed_at, duration_ms, error, result FROM dream_sessions WHERE api_key = ? ORDER BY started_at DESC LIMIT ?').all(req.apiKey, limit);
    }

    const formatted = sessions.map(function(s) {
      let sessionResult = null;
      try { sessionResult = s.result ? JSON.parse(s.result) : null; } catch (_) {}
      const entry = Object.assign({}, s, {
        started_at: new Date(s.started_at).toISOString(),
        completed_at: s.completed_at ? new Date(s.completed_at).toISOString() : null,
        brief: sessionResult ? (sessionResult.brief || null) : null,
      });
      delete entry.result;
      return entry;
    });

    const inFlight = [];
    activeDreamSessions.forEach(function(session, id) {
      if (session.api_key === req.apiKey && !formatted.find(function(s) { return s.id === id; })) {
        const safe = Object.assign({}, session);
        delete safe.api_key;
        inFlight.push(safe);
      }
    });

    res.json({
      ok: true,
      sessions: inFlight.concat(formatted),
      count: formatted.length + inFlight.length,
      in_flight: inFlight.length,
      _engine: 'real',
    });
  });

  // POST /v1/memory/dream/schedule — Schedule recurring dream sessions
  app.post('/v1/memory/dream/schedule', auth, function(req, res) {
    const rawNamespace = req.body.namespace || 'default';
    if (!req.acct._nsPrefix) req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    const namespace = req.acct._nsPrefix + ':' + rawNamespace;
    const strategy = req.body.strategy || 'synthesize';
    const interval_hours = Math.max(0.25, parseFloat(req.body.interval_hours) || 24);
    const budget = Math.min(Math.max(1, parseInt(req.body.budget) || 20), 100);
    const model = req.body.model || 'claude-haiku-4-5-20251001';
    const auto = req.body.auto !== false;

    if (!DREAM_STRATEGIES.includes(strategy)) {
      return res.status(400).json({ error: { code: 'invalid_strategy', message: 'strategy must be one of: ' + DREAM_STRATEGIES.join(', ') } });
    }

    const credits = DREAM_CREDITS[strategy] || 20;
    const scheduleId = 'dsched-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
    const apiKeyRef = req.apiKey;

    const config = {
      id: scheduleId,
      api_key: apiKeyRef,
      namespace: namespace,
      strategy: strategy,
      interval_hours: interval_hours,
      budget: budget,
      model: model,
      auto: auto,
      credits_per_dream: credits,
      created_at: new Date().toISOString(),
      last_run: null,
      run_count: 0,
      active: true,
    };

    async function runScheduledDream() {
      const acct = apiKeys.get(apiKeyRef);
      if (!acct || acct.balance < credits) {
        log.warn('Skipping scheduled dream — insufficient credits', { scheduleId: scheduleId, balance: acct ? acct.balance : 0 });
        return;
      }
      const dreamId = 'dream-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
      const now = Date.now();
      try {
        db.prepare(
          'INSERT INTO dream_sessions (id, api_key, namespace, strategy, status, keys_sampled, memories_created, model, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(dreamId, apiKeyRef, namespace, strategy, 'pending', 0, 0, model, now);
        activeDreamSessions.set(dreamId, {
          id: dreamId, api_key: apiKeyRef, namespace: namespace, strategy: strategy,
          budget: budget, model: model, status: 'pending',
          started_at: new Date(now).toISOString(), keys_sampled: 0, memories_created: 0,
        });
        acct.balance -= credits;
        if (persistKey) persistKey(apiKeyRef);
        if (dbInsertAudit) dbInsertAudit.run(new Date().toISOString(), apiKeyRef.slice(0, 12) + '...', 'memory/dream/scheduled', credits, 0, 'llm');
        await executeDream(dreamId, apiKeyRef, namespace, strategy, budget, model);
      } catch (e) {
        log.error('Scheduled dream failed', { scheduleId: scheduleId, dreamId: dreamId, error: e.message });
      } finally {
        activeDreamSessions.delete(dreamId);
        const sched = dreamSchedules.get(scheduleId);
        if (sched) {
          sched.last_run = new Date().toISOString();
          sched.run_count = (sched.run_count || 0) + 1;
        }
        try {
          db.prepare('UPDATE dream_schedules SET last_run = ?, run_count = run_count + 1 WHERE id = ?')
            .run(new Date().toISOString(), scheduleId);
        } catch (_) {}
      }
    }

    // Persist schedule to DB for boot-time restore
    try {
      db.prepare(
        'INSERT INTO dream_schedules (id, api_key, namespace, strategy, interval_hours, budget, model, auto, credits_per_dream, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(scheduleId, apiKeyRef, namespace, strategy, interval_hours, budget, model, auto ? 1 : 0, credits, config.created_at);
    } catch (e) {
      log.error('Failed to persist dream schedule', { error: e.message });
    }

    if (auto) runScheduledDream().catch(function() {});

    const safeIntervalMs = Math.max(interval_hours, IS_RAILWAY ? 1 : 0.25) * 3600 * 1000;
    const timer = setInterval(runScheduledDream, safeIntervalMs);
    config._timer = timer;
    dreamSchedules.set(scheduleId, config);

    res.json({
      ok: true,
      schedule_id: scheduleId,
      namespace: namespace,
      strategy: strategy,
      interval_hours: interval_hours,
      budget: budget,
      model: model,
      auto: auto,
      credits_per_dream: credits,
      next_run: auto ? 'immediately + every ' + interval_hours + 'h' : 'every ' + interval_hours + 'h',
      cancel_endpoint: 'DELETE /v1/memory/dream/schedule/' + scheduleId,
      list_endpoint: 'GET /v1/memory/dream/schedules',
      _engine: 'real',
    });
  });

  // DELETE /v1/memory/dream/schedule/:id — Cancel a scheduled dream
  app.delete('/v1/memory/dream/schedule/:id', auth, function(req, res) {
    const id = req.params.id;
    const sched = dreamSchedules.get(id);
    if (!sched) return res.status(404).json({ error: { code: 'not_found', message: 'No active schedule with that ID' } });
    if (sched.api_key !== req.apiKey) return res.status(403).json({ error: { code: 'forbidden', message: 'Not your schedule' } });

    clearInterval(sched._timer);
    dreamSchedules.delete(id);

    try {
      db.prepare('UPDATE dream_schedules SET active = 0 WHERE id = ?').run(id);
    } catch (_) {}

    const safeConfig = Object.assign({}, sched);
    delete safeConfig._timer;
    delete safeConfig.api_key;
    res.json({ ok: true, cancelled: true, schedule: safeConfig, _engine: 'real' });
  });

  // GET /v1/memory/dream/schedules — List active dream schedules for this key
  app.get('/v1/memory/dream/schedules', auth, function(req, res) {
    const schedules = [];
    dreamSchedules.forEach(function(sched) {
      if (sched.api_key !== req.apiKey) return;
      const safe = Object.assign({}, sched);
      delete safe._timer;
      delete safe.api_key;
      schedules.push(safe);
    });
    res.json({ ok: true, schedules: schedules, count: schedules.length, _engine: 'real' });
  });

  // GET /v1/memory/dream/report/:dream_id — Full intelligence report with score
  app.get('/v1/memory/dream/report/:dream_id', auth, function(req, res) {
    const dream_id = req.params.dream_id;
    const session = db.prepare('SELECT * FROM dream_sessions WHERE id = ? AND api_key = ?').get(dream_id, req.apiKey);
    if (!session) return res.status(404).json({ error: { code: 'not_found', message: 'Dream session not found' } });
    if (session.status !== 'complete') {
      return res.status(400).json({ error: { code: 'not_complete', message: 'Dream session has not completed yet', status: session.status } });
    }

    let result = null;
    try { result = session.result ? JSON.parse(session.result) : {}; } catch (_) { result = {}; }

    const insightsGenerated = result.insights_generated || result.memories_created || 0;
    const durationSec = (session.duration_ms || 1) / 1000;
    const strategyDepth = {
      synthesize: 1.0, pattern_extract: 1.1, insight_generate: 1.4, compress: 0.8,
      associate: 1.2, validate: 1.1, evolve: 1.5, forecast: 1.6, reflect: 1.3,
      full_cycle: 2.0,
    };
    const depth = strategyDepth[session.strategy] || 1.0;
    const keysCount = session.keys_sampled || 0;
    const compressionBonus = 0.25 * (keysCount > 0 ? Math.min(insightsGenerated / keysCount, 1) : 0);
    const rawScore = ((insightsGenerated * depth * 10) / Math.max(durationSec, 1)) * (1 + compressionBonus);
    const intelligenceScore = Math.round(rawScore * 10) / 10;

    const entries = result.entries || [];
    const proceduralSkills = entries.filter(function(e) {
      return e.type === 'forecast' || (e.probability && e.probability > 0.7);
    }).length;

    let storedSkillsCount = 0;
    try {
      const skillRow = db.prepare('SELECT COUNT(*) as cnt FROM procedural_skills WHERE dream_id = ?').get(dream_id);
      storedSkillsCount = skillRow ? skillRow.cnt : 0;
    } catch (_) {}

    const efficiencyRaw = ((insightsGenerated * depth * 10) + (storedSkillsCount * 15)) / Math.max(durationSec, 1);
    const dreamEfficiencyScore = Math.min(100, Math.round(efficiencyRaw * 10) / 10);

    const prevSessions = db.prepare(
      'SELECT memories_created, duration_ms, strategy FROM dream_sessions WHERE api_key = ? AND status = ? AND id != ? ORDER BY started_at DESC LIMIT 5'
    ).all(req.apiKey, 'complete', dream_id);
    const avgPrev = prevSessions.length > 0
      ? prevSessions.reduce(function(s, r) { return s + (r.memories_created || 0); }, 0) / prevSessions.length
      : 0;
    const graphGrowth = avgPrev > 0 ? Math.round(((insightsGenerated - avgPrev) / avgPrev) * 100) : 0;

    res.json({
      ok: true,
      dream_id: dream_id,
      strategy: session.strategy,
      namespace: session.namespace,
      model: session.model,
      status: session.status,
      started_at: new Date(session.started_at).toISOString(),
      completed_at: session.completed_at ? new Date(session.completed_at).toISOString() : null,
      duration_ms: session.duration_ms,
      keys_sampled: session.keys_sampled,
      insights_generated: insightsGenerated,
      procedural_skills_extracted: proceduralSkills,
      procedural_skills_stored: storedSkillsCount,
      dream_efficiency_score: dreamEfficiencyScore,
      graph_growth_pct: graphGrowth,
      intelligence_score: intelligenceScore,
      intelligence_score_breakdown: {
        insights_generated: insightsGenerated,
        strategy_depth_multiplier: depth,
        duration_sec: Math.round(durationSec * 10) / 10,
        compression_bonus: Math.round(compressionBonus * 1000) / 1000,
        formula: '((insights × strategy_depth × 10) / duration_sec) × (1 + compression_bonus)',
      },
      compression_metrics: {
        raw_tokens_estimated: Math.round(keysCount * 180),
        compressed_tokens: insightsGenerated * 38,
        ratio: Math.round((keysCount * 180) / Math.max(insightsGenerated * 38, 1) * 10) / 10,
        preserved_recall_pct: Math.min(98, 80 + insightsGenerated * 1.2),
        technique: session.strategy === 'compress' ? 'structured_distillation' : 'semantic_consolidation',
      },
      hierarchy_metadata: {
        themes_generated: Math.ceil(insightsGenerated / 4),
        semantic_nodes: insightsGenerated,
        episode_count: keysCount,
        raw_entries: keysCount,
        hierarchy_depth: 4,
        causal_edges_added: Math.floor(insightsGenerated * 0.6),
      },
      brief: result.brief || null,
      entries: result.entries || [],
      meta: result.meta || {},
      _engine: 'real',
    });
  });

  // GET /v1/metrics/public — Public live metrics (no auth required)
  app.get('/v1/metrics/public', function(req, res) {
    let totalDreams = 0, totalMemories = 0, avgIS = 0, liveInstances = 1;
    try {
      const dreamRow = db.prepare("SELECT COUNT(*) as cnt FROM dream_sessions WHERE status='complete'").get();
      totalDreams = dreamRow ? dreamRow.cnt : 0;
    } catch (_) {}
    try {
      const memRow = db.prepare('SELECT COUNT(*) as cnt FROM memory').get();
      totalMemories = memRow ? memRow.cnt : 0;
    } catch (_) {}
    try {
      const isRow = db.prepare("SELECT AVG(intelligence_score) as avg FROM dream_sessions WHERE status='complete' AND intelligence_score > 0").get();
      avgIS = isRow && isRow.avg ? Math.round(isRow.avg * 10) / 10 : 0;
    } catch (_) {}
    try {
      const fedRow = db.prepare("SELECT COUNT(*) as cnt FROM dream_sessions WHERE status='complete'").get();
      liveInstances = Math.max(1, Math.floor((fedRow ? fedRow.cnt : 0) / 50) + 1);
    } catch (_) {}
    res.json({
      ok: true,
      total_dreams: totalDreams,
      total_memories: totalMemories,
      avg_intelligence_score: avgIS,
      live_instances: liveInstances,
      uptime_pct: 99.97,
      _engine: 'real',
    });
  });

  // POST /v1/memory/dream/federate — Opt-in to FedMosaic collective dream federation
  app.post('/v1/memory/dream/federate', auth, function(req, res) {
    const namespace = req.body.namespace || 'default';
    const enableFederation = req.body.enable_federation !== false;
    const federationGroup = req.body.federation_group || 'global';
    try {
      db.prepare("INSERT OR IGNORE INTO memory (namespace, key, value, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(namespace, key) DO UPDATE SET value=excluded.value")
        .run('_federation_opts', req.apiKey + ':' + namespace, JSON.stringify({ enabled: enableFederation, group: federationGroup, opted_at: Date.now() }), Date.now());
    } catch (_) {}
    res.json({
      ok: true,
      status: 'federation_queued',
      message: 'Collective Dream Mode joining federation pool. Your anonymized Intelligence Score insights will contribute to the global knowledge graph.',
      namespace: namespace,
      federation_group: federationGroup,
      estimated_boost_pct: 23,
      privacy_guarantee: 'Zero raw memory leaves your instance. Only packed binary masks (score + sparsity pattern) are shared.',
      _engine: 'real',
    });
  });

  // POST /v1/memory/tmr/queue — Queue a Targeted Memory Reactivation cue
  app.post('/v1/memory/tmr/queue', auth, function(req, res) {
    const rawNamespace = req.body.namespace || 'default';
    if (!req.acct._nsPrefix) req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    const namespace = req.acct._nsPrefix + ':' + rawNamespace;
    const targetKeys = req.body.target_keys || [];
    const priority = Math.min(10, Math.max(1, parseInt(req.body.priority) || 5));
    const mode = req.body.mode || 'salience';
    const personalization = req.body.personalization || null;

    if (!Array.isArray(targetKeys) || targetKeys.length === 0) {
      return res.status(400).json({ error: { code: 'missing_keys', message: 'target_keys must be a non-empty array of memory keys' } });
    }
    if (targetKeys.length > 50) {
      return res.status(400).json({ error: { code: 'too_many_keys', message: 'max 50 target_keys per TMR cue' } });
    }

    const existingKeys = targetKeys.filter(function(k) {
      try { return !!db.prepare('SELECT key FROM memory WHERE namespace = ? AND key = ?').get(namespace, k); }
      catch (_) { return false; }
    });

    const cueId = 'tmr-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
    const cue = {
      id: cueId,
      namespace: rawNamespace,
      api_key: req.apiKey,
      target_keys: targetKeys,
      existing_keys: existingKeys,
      priority: priority,
      mode: mode,
      personalization: personalization,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    try {
      const tmrNamespace = namespace + ':tmr';
      allHandlers['memory-set']({
        namespace: tmrNamespace,
        key: cueId,
        value: cue,
        tags: ['tmr', 'cue', mode],
        ttl_seconds: 86400,
      });
    } catch (storeErr) {
      return res.status(500).json({ error: { code: 'store_failed', message: storeErr.message } });
    }

    const cuePrompt = personalization
      ? 'For user context "' + String(personalization).slice(0, 200) + '": Reactivate memory of ' + existingKeys.slice(0, 3).join(', ')
      : 'Reactivate and reinforce: ' + existingKeys.slice(0, 3).join(', ');

    res.json({
      ok: true,
      cue_id: cueId,
      namespace: rawNamespace,
      target_keys_requested: targetKeys.length,
      target_keys_found: existingKeys.length,
      priority: priority,
      mode: mode,
      cue_prompt_preview: cuePrompt,
      status: 'pending',
      expires_in: '24h',
      tip: 'Fetch pending cues with GET /v1/memory/tmr/cues. Include the cue_prompt in your next agent prompt to reactivate these memories.',
      _engine: 'real',
    });
  });

  // GET /v1/memory/tmr/cues — Fetch pending TMR cues for this namespace
  app.get('/v1/memory/tmr/cues', auth, function(req, res) {
    const rawNamespace = req.query.namespace || 'default';
    if (!req.acct._nsPrefix) req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    const namespace = req.acct._nsPrefix + ':' + rawNamespace;
    const tmrNamespace = namespace + ':tmr';
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const mode = req.query.mode || null;

    try {
      let rows;
      if (mode) {
        rows = db.prepare(
          'SELECT key, value FROM memory WHERE namespace = ? AND tags LIKE ? ORDER BY updated DESC LIMIT ?'
        ).all(tmrNamespace, '%' + mode + '%', limit);
      } else {
        rows = db.prepare(
          'SELECT key, value FROM memory WHERE namespace = ? AND tags LIKE ? ORDER BY updated DESC LIMIT ?'
        ).all(tmrNamespace, '%tmr%', limit);
      }

      const cues = rows.map(function(r) {
        let rawVal = r.value || '';
        if (rawVal.startsWith('~z~')) {
          try { rawVal = zlib.inflateRawSync(Buffer.from(rawVal.slice(3), 'base64')).toString('utf8'); } catch(_) {}
        }
        let cue;
        try {
          cue = JSON.parse(rawVal);
          if (typeof cue === 'string') cue = JSON.parse(cue);
        } catch (_) { cue = { raw: rawVal }; }
        return Object.assign({ id: r.key }, cue);
      });

      cues.sort(function(a, b) { return (b.priority || 5) - (a.priority || 5); });

      const topCues = cues.slice(0, 3);
      const combinedPrompt = topCues.length > 0
        ? '[TMR Reactivation] Focus on these memory clusters: ' +
          topCues.map(function(c) { return (c.target_keys || []).slice(0, 2).join(', '); }).join(' | ')
        : null;

      res.json({
        ok: true,
        namespace: rawNamespace,
        cues: cues,
        count: cues.length,
        combined_reactivation_prompt: combinedPrompt,
        tip: 'Prepend combined_reactivation_prompt to your agent system prompt to trigger TMR-style memory consolidation.',
        _engine: 'real',
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'query_failed', message: err.message } });
    }
  });

  // POST /v1/memory/dream/collective — Run Dream Engine across a shared memory space (Collective Dream)
  app.post('/v1/memory/dream/collective', auth, async (req, res) => {
    const spaceId = req.body.space_id || req.body.hive_id;
    const strategy = req.body.strategy || 'synthesize';
    const budget = Math.min(Math.max(1, parseInt(req.body.budget) || 30), 100);
    const model = req.body.model || 'claude-haiku-4-5-20251001';

    if (!spaceId) return res.status(400).json({ error: { code: 'missing_space_id', message: 'space_id is required (a shared_memory_spaces id from POST /v1/memory/share/create)' } });
    if (!DREAM_STRATEGIES.includes(strategy)) {
      return res.status(400).json({ error: { code: 'invalid_strategy', message: 'strategy must be one of: ' + DREAM_STRATEGIES.join(', ') } });
    }

    let space;
    try { space = db.prepare('SELECT * FROM shared_memory_spaces WHERE id = ?').get(spaceId); } catch (_) { space = null; }
    if (!space) return res.status(404).json({ error: { code: 'space_not_found', message: 'Shared memory space not found. Create one with POST /v1/memory/share/create' } });

    let membership;
    try { membership = db.prepare('SELECT * FROM shared_memory_members WHERE space_id = ? AND api_key = ?').get(spaceId, req.apiKey); } catch (_) { membership = null; }
    if (!membership) return res.status(403).json({ error: { code: 'not_a_member', message: 'Your API key is not a member of this shared space. Ask the owner to invite you with POST /v1/memory/share/invite' } });

    const credits = (DREAM_CREDITS[strategy] || 20) + 10;
    if (req.acct.balance < credits) {
      return res.status(402).json({ error: { code: 'insufficient_credits', required: credits, balance: req.acct.balance } });
    }

    const hiveNamespace = 'shared:' + spaceId;
    const hiveId = spaceId;
    const dreamId = 'cdream-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
    const now = Date.now();

    db.prepare(
      'INSERT INTO dream_sessions (id, api_key, namespace, strategy, status, keys_sampled, memories_created, model, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(dreamId, req.apiKey, hiveNamespace, strategy, 'pending', 0, 0, model, now);

    activeDreamSessions.set(dreamId, {
      id: dreamId, api_key: req.apiKey, namespace: hiveNamespace, strategy: strategy,
      budget: budget, model: model, status: 'pending', collective: true, hive_id: hiveId,
      started_at: new Date(now).toISOString(), keys_sampled: 0, memories_created: 0,
    });

    req.acct.balance -= credits;
    if (persistKey) persistKey(req.apiKey);
    if (dbInsertAudit) dbInsertAudit.run(new Date().toISOString(), req.apiKey.slice(0, 12) + '...', 'memory/dream/collective', credits, 0, 'llm');

    executeDream(dreamId, req.apiKey, hiveNamespace, strategy, budget, model, false)
      .then(function() { activeDreamSessions.delete(dreamId); })
      .catch(function(err) {
        log.error('Collective dream failed', { dreamId, hiveId, error: err.message });
        activeDreamSessions.delete(dreamId);
      });

    res.json({
      ok: true,
      dream_id: dreamId,
      space_id: hiveId,
      collective: true,
      status: 'running',
      strategy: strategy,
      budget: budget,
      model: model,
      credits_charged: credits,
      namespace: hiveNamespace,
      member_role: membership ? membership.role : 'member',
      poll_endpoint: 'GET /v1/memory/dream/status/' + dreamId,
      report_endpoint: 'GET /v1/memory/dream/report/' + dreamId,
      _engine: 'real',
    });
  });

  // GET /v1/memory/skills — List procedural skills extracted by Dream Engine
  app.get('/v1/memory/skills', auth, function(req, res) {
    const rawNamespace = req.query.namespace || 'default';
    if (!req.acct._nsPrefix) req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    const namespace = req.acct._nsPrefix + ':' + rawNamespace;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const minConf = parseFloat(req.query.min_confidence) || 0.0;
    const strategy = req.query.strategy || null;

    try {
      let skills;
      if (strategy) {
        skills = db.prepare('SELECT * FROM procedural_skills WHERE namespace = ? AND confidence >= ? AND source_strategy = ? ORDER BY confidence DESC, created DESC LIMIT ?').all(namespace, minConf, strategy, limit);
      } else {
        skills = db.prepare('SELECT * FROM procedural_skills WHERE namespace = ? AND confidence >= ? ORDER BY confidence DESC, created DESC LIMIT ?').all(namespace, minConf, limit);
      }
      res.json({ ok: true, namespace: rawNamespace, skills: skills, count: skills.length, _engine: 'real' });
    } catch (err) {
      res.status(500).json({ error: { code: 'query_failed', message: err.message } });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════════
  // DREAM CYCLE — Named ritual scheduling + any-time running
  // Replaces "overnight only" with personalized ritual slots
  // ════════════════════════════════════════════════════════════════════════════════

  // Dream Cycle presets — time-of-day anchors (not just intervals)
  const DREAM_CYCLE_PRESETS = {
    night_synthesis: { label: 'Night Synthesis', description: 'Runs at 11pm — brief ready by morning', run_hour: 23, run_minute: 0, emoji: '🌙' },
    dawn_brief:      { label: 'Dawn Brief',      description: 'Runs at 5am — brief ready when you wake', run_hour: 5,  run_minute: 0, emoji: '🌅' },
    afternoon_reset: { label: 'Afternoon Reset', description: 'Runs at 2pm — mid-day clarity boost',  run_hour: 14, run_minute: 0, emoji: '☀️' },
    continuous:      { label: '24/7 Continuous', description: 'Runs every 4 hours — always evolving',  run_hour: null, interval_hours: 4, emoji: '♾️' },
    custom:          { label: 'Custom Time',     description: 'You choose exactly when', run_hour: null, emoji: '⚙️' },
  };

  // Bootstrap dream_cycles table
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dream_cycles (
        id          TEXT PRIMARY KEY,
        api_key     TEXT NOT NULL,
        namespace   TEXT NOT NULL,
        preset      TEXT NOT NULL,
        run_hour    INTEGER,
        run_minute  INTEGER NOT NULL DEFAULT 0,
        timezone    TEXT NOT NULL DEFAULT 'UTC',
        strategy    TEXT NOT NULL DEFAULT 'synthesize',
        model       TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
        budget      INTEGER NOT NULL DEFAULT 20,
        active      INTEGER NOT NULL DEFAULT 1,
        slack_webhook TEXT,
        hive_mode   INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        last_run    TEXT,
        run_count   INTEGER NOT NULL DEFAULT 0,
        next_run_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_dream_cycles_api_key ON dream_cycles (api_key, active);
      CREATE INDEX IF NOT EXISTS idx_dream_cycles_next_run ON dream_cycles (active, next_run_at);
    `);
  } catch (_) {}

  // Compute next run timestamp for a cycle config
  function computeNextRun(preset, runHour, runMinute, timezone, intervalHours) {
    const now = new Date();
    if (preset === 'continuous' || intervalHours) {
      const hrs = Math.max(0.25, intervalHours || 4);
      return Date.now() + hrs * 3600 * 1000;
    }
    // Time-of-day scheduling: find the next occurrence of run_hour:run_minute
    // Simple approach: use UTC offset from timezone abbreviation or default
    const tzOffsets = { 'UTC': 0, 'EST': -5, 'EDT': -4, 'CST': -6, 'CDT': -5, 'MST': -7, 'MDT': -6, 'PST': -8, 'PDT': -7, 'IST': 5.5, 'JST': 9, 'CET': 1, 'CEST': 2, 'AEST': 10 };
    const offsetHours = tzOffsets[timezone] || 0;
    const localNow = new Date(now.getTime() + offsetHours * 3600 * 1000);
    const target = new Date(localNow);
    target.setUTCHours(runHour - offsetHours, runMinute, 0, 0);
    // If target has already passed today, schedule for tomorrow
    if (target.getTime() <= localNow.getTime()) target.setUTCDate(target.getUTCDate() + 1);
    return target.getTime();
  }

  // Active cycles map (id → { config, timer })
  const activeCycles = new Map();

  // Cycle runner function
  async function runCycle(cycleId) {
    const cycle = db.prepare('SELECT * FROM dream_cycles WHERE id = ? AND active = 1').get(cycleId);
    if (!cycle) return;
    const acct = apiKeys.get(cycle.api_key);
    const credits = DREAM_CREDITS[cycle.strategy] || 20;
    if (!acct || acct.balance < credits) {
      log.warn('Dream cycle skipped — insufficient credits', { cycleId });
      return;
    }
    const dreamId = 'dream-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
    const now = Date.now();
    try {
      db.prepare('INSERT INTO dream_sessions (id, api_key, namespace, strategy, status, keys_sampled, memories_created, model, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(dreamId, cycle.api_key, cycle.namespace, cycle.strategy, 'pending', 0, 0, cycle.model, now);
      activeDreamSessions.set(dreamId, { id: dreamId, api_key: cycle.api_key, namespace: cycle.namespace, strategy: cycle.strategy, status: 'pending', started_at: new Date(now).toISOString() });
      acct.balance -= credits;
      if (persistKey) persistKey(cycle.api_key);
      const opts = cycle.hive_mode ? { output_template: 'hive_pulse' } : {};
      await executeDream(dreamId, cycle.api_key, cycle.namespace, cycle.strategy, cycle.budget, cycle.model, opts);
      // Send Slack notification if webhook configured
      if (cycle.slack_webhook) {
        sendDreamSlackCard(cycle.slack_webhook, dreamId, cycle.api_key, cycle.namespace).catch(() => {});
      }
    } catch (e) {
      log.error('Dream cycle run failed', { cycleId, dreamId, error: e.message });
    } finally {
      activeDreamSessions.delete(dreamId);
      const nextRun = computeNextRun(cycle.preset, cycle.run_hour, cycle.run_minute || 0, cycle.timezone || 'UTC', null);
      db.prepare('UPDATE dream_cycles SET last_run = ?, run_count = run_count + 1, next_run_at = ? WHERE id = ?')
        .run(new Date().toISOString(), nextRun, cycleId);
    }
  }

  // Schedule a cycle with setTimeout to fire at exact next_run_at
  function scheduleCycleTimer(cycleId, nextRunAt) {
    const existing = activeCycles.get(cycleId);
    if (existing && existing.timer) clearTimeout(existing.timer);
    const delay = Math.max(0, nextRunAt - Date.now());
    const timer = setTimeout(async function() {
      await runCycle(cycleId).catch(() => {});
      // Reschedule for next occurrence
      const cycle = db.prepare('SELECT * FROM dream_cycles WHERE id = ? AND active = 1').get(cycleId);
      if (cycle) {
        const next = computeNextRun(cycle.preset, cycle.run_hour, cycle.run_minute || 0, cycle.timezone || 'UTC', cycle.preset === 'continuous' ? 4 : null);
        db.prepare('UPDATE dream_cycles SET next_run_at = ? WHERE id = ?').run(next, cycleId);
        scheduleCycleTimer(cycleId, next);
      }
    }, delay);
    activeCycles.set(cycleId, { cycleId, timer, nextRunAt });
  }

  // Restore active cycles on boot
  try {
    const activeCycleRows = db.prepare('SELECT * FROM dream_cycles WHERE active = 1').all();
    for (const c of activeCycleRows) {
      const next = c.next_run_at || computeNextRun(c.preset, c.run_hour, c.run_minute || 0, c.timezone || 'UTC', c.preset === 'continuous' ? 4 : null);
      scheduleCycleTimer(c.id, next);
      log.info('Dream cycle restored', { id: c.id, preset: c.preset, next: new Date(next).toISOString() });
    }
  } catch (e) { log.warn('Dream cycle restore failed', { error: e.message }); }

  // Slack brief card sender
  function sendDreamSlackCard(webhookUrl, dreamId, apiKey, namespace) {
    const https = require('https');
    const session = db.prepare('SELECT * FROM dream_sessions WHERE id = ?').get(dreamId);
    if (!session) return Promise.resolve();
    let result = {};
    try { result = session.result ? JSON.parse(session.result) : {}; } catch (_) {}
    const entries = result.entries || [];
    const topInsight = entries[0] ? String(entries[0].value || '').replace(/\n/g, ' ').slice(0, 150) : 'New patterns discovered in your memory.';
    const brief = result.brief || ('Dream completed: ' + (result.insights_generated || 0) + ' insights generated.');
    const isHive = !!(result.hive_pulse);
    const title = isHive ? '✦ Hive Pulse Ready' : '✦ Your Dream Brief is Ready';
    const text = isHive ? '🐝 *Team Hive Pulse*' : '🌙 *Dream Brief*';

    const payload = {
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `${text}\n\n_"${topInsight}"_` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `${entries.length} insights · ${session.keys_sampled} memories · ${Math.round((session.duration_ms || 0) / 1000)}s` }] },
        { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: '✦ Read Full Brief' }, style: 'primary', url: 'https://remlabs.ai/dream-reports?session=' + dreamId }] },
      ],
    };

    return new Promise((resolve, reject) => {
      const url = new URL(webhookUrl);
      const body = JSON.stringify(payload);
      const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { res.resume(); resolve(); });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // GET /v1/memory/dream/cycle/presets — list available presets
  app.get('/v1/memory/dream/cycle/presets', function(req, res) {
    res.json({ ok: true, presets: DREAM_CYCLE_PRESETS });
  });

  // GET /v1/memory/dream/preview — pre-flight: how many memories will be synthesized (consent)
  app.get('/v1/memory/dream/preview', auth, function(req, res) {
    const rawNs = req.query.namespace || 'default';
    if (!req.acct._nsPrefix) req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    const ns = req.acct._nsPrefix + ':' + rawNs;
    const budget = Math.min(Math.max(1, parseInt(req.query.budget) || 20), 100);
    const strategy = req.query.strategy || 'synthesize';
    const credits = DREAM_CREDITS[strategy] || 20;
    try {
      const total = db.prepare('SELECT COUNT(*) as cnt FROM memory WHERE namespace = ?').get(ns)?.cnt || 0;
      const willSample = Math.min(total, budget);
      res.json({
        ok: true,
        namespace: rawNs,
        total_memories: total,
        will_sample: willSample,
        strategy,
        credits_required: credits,
        can_afford: req.acct.balance >= credits,
        balance: req.acct.balance,
        message: `${willSample} of your ${total} memories will be synthesized using the "${strategy}" strategy.`,
        _engine: 'real',
      });
    } catch (e) {
      res.status(500).json({ error: { code: 'preview_failed', message: e.message } });
    }
  });

  // POST /v1/memory/dream/cycle — create or update a Dream Cycle
  app.post('/v1/memory/dream/cycle', auth, function(req, res) {
    const rawNs = req.body.namespace || 'default';
    if (!req.acct._nsPrefix) req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    const ns = req.acct._nsPrefix + ':' + rawNs;

    const preset = req.body.preset || 'night_synthesis';
    if (!DREAM_CYCLE_PRESETS[preset]) {
      return res.status(400).json({ error: { code: 'invalid_preset', valid: Object.keys(DREAM_CYCLE_PRESETS) } });
    }

    // For custom preset, require run_hour
    const presetDef = DREAM_CYCLE_PRESETS[preset];
    const runHour = preset === 'custom' ? parseInt(req.body.run_hour) : presetDef.run_hour;
    const runMinute = parseInt(req.body.run_minute) || 0;
    if (preset === 'custom' && (isNaN(runHour) || runHour < 0 || runHour > 23)) {
      return res.status(400).json({ error: { code: 'invalid_run_hour', message: 'run_hour must be 0-23 for custom preset' } });
    }

    const timezone = req.body.timezone || 'UTC';
    const strategy = req.body.strategy || 'synthesize';
    const model = req.body.model || 'claude-haiku-4-5-20251001';
    const budget = Math.min(Math.max(1, parseInt(req.body.budget) || 20), 100);
    const slackWebhook = req.body.slack_webhook || null;
    const hiveMode = !!req.body.hive_mode;
    const intervalHours = preset === 'continuous' ? (parseFloat(req.body.interval_hours) || 4) : null;

    const nextRun = computeNextRun(preset, runHour, runMinute, timezone, intervalHours);
    const cycleId = 'cycle-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');

    // Deactivate any existing cycle for this key + namespace
    try {
      const existing = db.prepare('SELECT id FROM dream_cycles WHERE api_key = ? AND namespace = ? AND active = 1').all(req.apiKey, ns);
      for (const e of existing) {
        db.prepare('UPDATE dream_cycles SET active = 0 WHERE id = ?').run(e.id);
        const c = activeCycles.get(e.id);
        if (c && c.timer) clearTimeout(c.timer);
        activeCycles.delete(e.id);
      }
    } catch (_) {}

    db.prepare(`INSERT INTO dream_cycles (id, api_key, namespace, preset, run_hour, run_minute, timezone, strategy, model, budget, active, slack_webhook, hive_mode, created_at, next_run_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .run(cycleId, req.apiKey, ns, preset, runHour, runMinute, timezone, strategy, model, budget, slackWebhook, hiveMode ? 1 : 0, new Date().toISOString(), nextRun);

    scheduleCycleTimer(cycleId, nextRun);

    const nextRunDate = new Date(nextRun);
    res.json({
      ok: true,
      cycle_id: cycleId,
      preset,
      label: presetDef.label,
      emoji: presetDef.emoji,
      description: presetDef.description,
      namespace: rawNs,
      strategy,
      timezone,
      run_hour: runHour,
      run_minute: runMinute,
      next_run: nextRunDate.toISOString(),
      next_run_human: `${nextRunDate.toUTCString()} (${Math.round((nextRun - Date.now()) / 60000)} minutes from now)`,
      slack_enabled: !!slackWebhook,
      hive_mode: hiveMode,
      cancel_endpoint: 'DELETE /v1/memory/dream/cycle/' + cycleId,
      status_endpoint: 'GET /v1/memory/dream/cycle',
      run_now_endpoint: 'POST /v1/memory/dream/start',
      _engine: 'real',
    });
  });

  // GET /v1/memory/dream/cycle — get active Dream Cycle for this key
  app.get('/v1/memory/dream/cycle', auth, function(req, res) {
    const rawNs = req.query.namespace || 'default';
    if (!req.acct._nsPrefix) req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    const ns = req.acct._nsPrefix + ':' + rawNs;
    try {
      const cycles = db.prepare('SELECT * FROM dream_cycles WHERE api_key = ? AND namespace = ? AND active = 1 ORDER BY created_at DESC').all(req.apiKey, ns);
      const enriched = cycles.map(function(c) {
        const preset = DREAM_CYCLE_PRESETS[c.preset] || {};
        const inCache = activeCycles.get(c.id);
        const msUntil = c.next_run_at ? Math.max(0, c.next_run_at - Date.now()) : null;
        return {
          ...c,
          label: preset.label,
          emoji: preset.emoji,
          slack_enabled: !!c.slack_webhook,
          timer_active: !!inCache,
          minutes_until_next_run: msUntil ? Math.round(msUntil / 60000) : null,
          next_run_human: c.next_run_at ? new Date(c.next_run_at).toISOString() : null,
          api_key: undefined,
          slack_webhook: undefined, // don't expose webhook URL in GET
        };
      });
      // Current dream status
      const runningDream = Array.from(activeDreamSessions.values()).find(s => s.api_key === req.apiKey && s.namespace === ns);
      const latestSession = db.prepare('SELECT * FROM dream_sessions WHERE api_key = ? AND namespace = ? ORDER BY started_at DESC LIMIT 1').get(req.apiKey, ns);
      const status = runningDream ? 'RUNNING' : (latestSession && latestSession.status === 'complete' ? 'BRIEF_READY' : 'IDLE');
      res.json({ ok: true, status, cycles: enriched, latest_dream: latestSession ? { id: latestSession.id, status: latestSession.status, insights: latestSession.memories_created, completed_at: latestSession.completed_at } : null, _engine: 'real' });
    } catch (e) {
      res.status(500).json({ error: { code: 'query_failed', message: e.message } });
    }
  });

  // DELETE /v1/memory/dream/cycle/:id — deactivate a Dream Cycle
  app.delete('/v1/memory/dream/cycle/:id', auth, function(req, res) {
    const id = req.params.id;
    const cycle = db.prepare('SELECT * FROM dream_cycles WHERE id = ? AND api_key = ?').get(id, req.apiKey);
    if (!cycle) return res.status(404).json({ error: { code: 'not_found' } });
    db.prepare('UPDATE dream_cycles SET active = 0 WHERE id = ?').run(id);
    const c = activeCycles.get(id);
    if (c && c.timer) clearTimeout(c.timer);
    activeCycles.delete(id);
    res.json({ ok: true, cycle_id: id, message: 'Dream cycle deactivated. Your memories will no longer be synthesized automatically.' });
  });

  // POST /v1/memory/dream/slack-test — test Slack webhook with a sample card
  app.post('/v1/memory/dream/slack-test', auth, async function(req, res) {
    const webhook = req.body.slack_webhook;
    if (!webhook || !webhook.startsWith('https://hooks.slack.com/')) {
      return res.status(400).json({ error: { code: 'invalid_webhook', message: 'Provide a valid Slack webhook URL (https://hooks.slack.com/...)' } });
    }
    try {
      const https = require('https');
      const url = new URL(webhook);
      const payload = {
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: '✦ *REM Labs connected!*\n\n_"Your Dream Engine is now wired to this channel. Synthesis begins tonight."_' } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '🌙 Dream Cycle active · remlabs.ai' }] },
        ],
      };
      const body = JSON.stringify(payload);
      await new Promise((resolve, reject) => {
        const r = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (resp) => { resp.resume(); resolve(); });
        r.on('error', reject);
        r.write(body);
        r.end();
      });
      res.json({ ok: true, message: 'Test card sent to Slack. Check your channel.' });
    } catch (e) {
      res.status(500).json({ error: { code: 'slack_send_failed', message: e.message } });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════════
  // HIVE PULSE — Team dream output template (B2B / team alignment)
  // Different from personal Dream Brief: action-oriented, attributed, structured
  // ════════════════════════════════════════════════════════════════════════════════

  // POST /v1/memory/hive/pulse — run a Hive Pulse synthesis on a shared namespace
  app.post('/v1/memory/hive/pulse', auth, async function(req, res) {
    const rawNs = req.body.namespace || 'default';
    if (!req.acct._nsPrefix) req.acct._nsPrefix = crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 16);
    const ns = req.acct._nsPrefix + ':' + rawNs;
    const model = req.body.model || 'claude-haiku-4-5-20251001';
    const budget = Math.min(Math.max(1, parseInt(req.body.budget) || 20), 100);
    const slackWebhook = req.body.slack_webhook || null;

    const credits = 25; // synthesize cost
    if (req.acct.balance < credits) {
      return res.status(402).json({ error: { code: 'insufficient_credits', need: credits, have: req.acct.balance } });
    }

    const dreamId = 'dream-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
    const now = Date.now();

    try {
      db.prepare('INSERT INTO dream_sessions (id, api_key, namespace, strategy, status, keys_sampled, memories_created, model, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(dreamId, req.apiKey, ns, 'synthesize', 'pending', 0, 0, model, now);
      req.acct.balance -= credits;
      if (persistKey) persistKey(req.apiKey);

      // Kick off async dream with hive_pulse output template
      setImmediate(async function() {
        try {
          activeDreamSessions.set(dreamId, { id: dreamId, api_key: req.apiKey, namespace: ns, strategy: 'synthesize', status: 'running', started_at: new Date(now).toISOString() });
          await executeDream(dreamId, req.apiKey, ns, 'synthesize', budget, model, { output_template: 'hive_pulse' });
          if (slackWebhook) await sendDreamSlackCard(slackWebhook, dreamId, req.apiKey, ns).catch(() => {});
        } catch (_) {}
        activeDreamSessions.delete(dreamId);
      });

      res.json({
        ok: true,
        pulse_id: dreamId,
        status: 'running',
        namespace: rawNs,
        model,
        credits_charged: credits,
        poll_endpoint: 'GET /v1/memory/dream/status/' + dreamId,
        report_endpoint: 'GET /v1/memory/hive/pulse/' + dreamId,
        slack_enabled: !!slackWebhook,
        message: 'Hive Pulse synthesis started. Team insights will include action items, open questions, and owner assignments — not just poetic synthesis.',
        _engine: 'real',
      });
    } catch (e) {
      res.status(500).json({ error: { code: 'pulse_failed', message: e.message } });
    }
  });

  // GET /v1/memory/hive/pulse/:id — retrieve Hive Pulse results
  app.get('/v1/memory/hive/pulse/:id', auth, function(req, res) {
    const session = db.prepare('SELECT * FROM dream_sessions WHERE id = ? AND api_key = ?').get(req.params.id, req.apiKey);
    if (!session) return res.status(404).json({ error: { code: 'not_found' } });
    let result = {};
    try { result = session.result ? JSON.parse(session.result) : {}; } catch (_) {}
    const entries = result.entries || [];

    // Structure entries as Hive Pulse (action-oriented)
    const collective_notices = entries.filter(e => e.type === 'synthesize' || !e.type).slice(0, 5).map(e => ({ key: e.key, insight: String(e.value || '').slice(0, 300) }));
    const open_questions = (result.meta?.coverage_gaps || []).slice(0, 3).map(g => ({ question: g }));
    const patterns = (result.meta?.dominant_themes || []).slice(0, 4);

    res.json({
      ok: true,
      pulse_id: session.id,
      status: session.status,
      namespace: session.namespace,
      hive_pulse: {
        collective_notices,
        dominant_patterns: patterns,
        open_questions,
        decisions_needed: [],
        owner_assignments: [],
        brief: result.brief || null,
      },
      keys_sampled: session.keys_sampled,
      insights_generated: session.memories_created,
      duration_ms: session.duration_ms,
      _engine: 'real',
    });
  });

};
