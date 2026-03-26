'use strict';

/**
 * Extended API Registry — Auto-generated entries for extended compute handlers.
 * Categories assigned by slug prefix and semantic grouping.
 */

const CATEGORY_MAP = {
  // Temporal Engineering
  'temporal-': 'Temporal Engineering',
  'causal-': 'Temporal Engineering',
  'deadline-': 'Temporal Engineering',
  'chronological-': 'Temporal Engineering',
  'event-horizon-': 'Temporal Engineering',
  'retrocausal-': 'Temporal Engineering',
  // Cognitive Architecture
  'cognitive-': 'Cognitive Architecture',
  'attention-': 'Cognitive Architecture',
  'metacognitive-': 'Cognitive Architecture',
  'reasoning-': 'Cognitive Architecture',
  'focus-': 'Cognitive Architecture',
  'dunning-': 'Cognitive Architecture',
  'mental-model-clash': 'Cognitive Architecture',
  // Swarm Intelligence
  'swarm-': 'Swarm Intelligence',
  'stigmergy-': 'Swarm Intelligence',
  'flocking-': 'Swarm Intelligence',
  'ant-colony-': 'Swarm Intelligence',
  'emergence-': 'Swarm Intelligence',
  'collective-': 'Swarm Intelligence',
  'quorum-': 'Swarm Intelligence',
  // Dimensional Analysis
  'perspective-': 'Dimensional Analysis',
  'dimensional-': 'Dimensional Analysis',
  'cross-domain-': 'Dimensional Analysis',
  'scale-shift-': 'Dimensional Analysis',
  'flatland-': 'Dimensional Analysis',
  'abstraction-': 'Dimensional Analysis',
  'inverse-dimension-': 'Dimensional Analysis',
  'dimension-gate-': 'Dimensional Analysis',
  'context-parallax': 'Dimensional Analysis',
  // Information Theory
  'entropy-': 'Information Theory',
  'information-': 'Information Theory',
  'noise-signal-': 'Information Theory',
  'redundancy-': 'Information Theory',
  'surprise-': 'Information Theory',
  'information-bottleneck': 'Information Theory',
  // Reputation Economics
  'trust-': 'Reputation Economics',
  'credibility-': 'Reputation Economics',
  'reputation-stake-': 'Reputation Economics',
  'influence-': 'Reputation Economics',
  'sybil-': 'Reputation Economics',
  'social-collateral-': 'Reputation Economics',
  'merit-': 'Reputation Economics',
  // Adversarial Thinking
  'attack-': 'Adversarial Thinking',
  'devils-': 'Adversarial Thinking',
  'chaos-blast-': 'Adversarial Thinking',
  'pre-mortem-': 'Adversarial Thinking',
  'weakest-': 'Adversarial Thinking',
  'threat-': 'Adversarial Thinking',
  'assumption-': 'Adversarial Thinking',
  // Narrative Intelligence
  'plot-': 'Narrative Intelligence',
  'dramatic-': 'Narrative Intelligence',
  'character-': 'Narrative Intelligence',
  'chekhov-': 'Narrative Intelligence',
  'unreliable-': 'Narrative Intelligence',
  'story-': 'Narrative Intelligence',
  'emotional-resonance-': 'Narrative Intelligence',
  'antagonist-': 'Narrative Intelligence',
  // Sensory Simulation
  'synesthesia-': 'Sensory Simulation',
  'signal-noise-': 'Sensory Simulation',
  'pattern-': 'Sensory Simulation',
  'sensory-': 'Sensory Simulation',
  'phantom-': 'Sensory Simulation',
  'perceptual-': 'Sensory Simulation',
  'edge-detection-': 'Sensory Simulation',
  // Group Dynamics
  'tribe-': 'Group Dynamics',
  'initiation-': 'Group Dynamics',
  'totem-': 'Group Dynamics',
  'schism-': 'Group Dynamics',
  'sacred-': 'Group Dynamics',
  'defection-': 'Group Dynamics',
  'group-polarization-': 'Group Dynamics',
  'free-rider-': 'Group Dynamics',
  'ritual-': 'Group Dynamics',
  'coalition-': 'Group Dynamics',
  // Strategic Warfare
  'fog-of-war-': 'Strategic Warfare',
  'supply-line-': 'Strategic Warfare',
  'bluff-': 'Strategic Warfare',
  'pincer-': 'Strategic Warfare',
  'attrition-': 'Strategic Warfare',
  'scorched-': 'Strategic Warfare',
  'deterrence-': 'Strategic Warfare',
  'nash-': 'Strategic Warfare',
  // Ecosystem Engineering
  'carrying-': 'Ecosystem Engineering',
  'trophic-': 'Ecosystem Engineering',
  'keystone-': 'Ecosystem Engineering',
  'invasive-': 'Ecosystem Engineering',
  'biodiversity-': 'Ecosystem Engineering',
  'symbiosis-': 'Ecosystem Engineering',
  'terraforming-': 'Ecosystem Engineering',
  // Information Propagation
  'idea-virality-': 'Information Propagation',
  'belief-': 'Information Propagation',
  'counter-narrative-': 'Information Propagation',
  'memetic-': 'Information Propagation',
  'overton-': 'Information Propagation',
  'echo-chamber-': 'Information Propagation',
  // State Management
  'dream-': 'State Management',
  'nightmare-': 'State Management',
  'inception-': 'State Management',
  'shared-unconscious-': 'State Management',
  'lucid-trigger-': 'State Management',
  // Process Optimization
  'loophole-': 'Process Optimization',
  'red-tape-': 'Process Optimization',
  'compliance-shortcut-': 'Process Optimization',
  'bureaucratic-': 'Process Optimization',
  'appeals-': 'Process Optimization',
  'sunset-': 'Process Optimization',
  'form-dependency-': 'Process Optimization',
  'rubber-stamp-': 'Process Optimization',
  'jurisdiction-': 'Process Optimization',
  'committee-': 'Process Optimization',
  'regulatory-': 'Process Optimization',
  // Sentiment Modeling
  'mood-': 'Sentiment Modeling',
  'empathy-': 'Sentiment Modeling',
  'catharsis-': 'Sentiment Modeling',
  'emotional-contagion-': 'Sentiment Modeling',
  'sentiment-inertia': 'Sentiment Modeling',
  'grief-': 'Sentiment Modeling',
  'affective-': 'Sentiment Modeling',
  // Knowledge Processing
  'concept-fusion-': 'Knowledge Processing',
  'insight-': 'Knowledge Processing',
  'wisdom-half-': 'Knowledge Processing',
  'eureka-': 'Knowledge Processing',
  'knowledge-': 'Knowledge Processing',
  'analogy-': 'Knowledge Processing',
  'paradox-resolver': 'Knowledge Processing',
  'question-': 'Knowledge Processing',
  // Behavioral Analysis
  'behavioral-fossil-': 'Behavioral Analysis',
  'artifact-carbon-': 'Behavioral Analysis',
  'legacy-': 'Behavioral Analysis',
  'decision-fossil-': 'Behavioral Analysis',
  'cultural-drift-': 'Behavioral Analysis',
  'ruin-': 'Behavioral Analysis',
  // Physics Simulation
  'idea-momentum': 'Physics Simulation',
  'scope-creep-': 'Physics Simulation',
  'consensus-pendulum': 'Physics Simulation',
  'burnout-': 'Physics Simulation',
  'attention-orbital-': 'Physics Simulation',
  'decision-spring-': 'Physics Simulation',
  'argument-': 'Physics Simulation',
  'priority-gravity-': 'Physics Simulation',
  // Musical Intelligence
  'workflow-rhythm-': 'Musical Intelligence',
  'crescendo-': 'Musical Intelligence',
  'counterpoint-': 'Musical Intelligence',
  'cadence-': 'Musical Intelligence',
  'motif-': 'Musical Intelligence',
  'tempo-': 'Musical Intelligence',
  'polyrhythm-': 'Musical Intelligence',
  'dynamics-': 'Musical Intelligence',
  'harmonic-': 'Musical Intelligence',
  'team-harmony-': 'Musical Intelligence',
  // Enterprise Ops
  'sla-': 'Enterprise Ops',
  'capacity-': 'Enterprise Ops',
  'runbook-': 'Enterprise Ops',
  'incident-': 'Enterprise Ops',
  'compliance-check': 'Enterprise Ops',
  'retry-': 'Enterprise Ops',
  'cost-': 'Enterprise Ops',
  'change-risk-': 'Enterprise Ops',
  'canary-': 'Enterprise Ops',
  'dependency-': 'Enterprise Ops',
  'audit-log-': 'Enterprise Ops',
  'rate-limit-': 'Enterprise Ops',
  'rollback-': 'Enterprise Ops',
  'resource-bin-': 'Enterprise Ops',
  'alert-': 'Enterprise Ops',
  'config-drift-': 'Enterprise Ops',
  'mttr-': 'Enterprise Ops',
  'token-bucket-': 'Enterprise Ops',
  'chaos-schedule': 'Enterprise Ops',
  // Growth & Analytics
  'ab-test-': 'Growth & Analytics',
  'nps-': 'Growth & Analytics',
  'cohort-': 'Growth & Analytics',
  'funnel-': 'Growth & Analytics',
  'viral-': 'Growth & Analytics',
  'churn-': 'Growth & Analytics',
  'feature-prioritize': 'Growth & Analytics',
  'changelog-': 'Growth & Analytics',
  'demo-data-': 'Growth & Analytics',
  'growth-': 'Growth & Analytics',
  'referral-': 'Growth & Analytics',
  'competitor-': 'Growth & Analytics',
  'landing-': 'Growth & Analytics',
  'onboarding-': 'Growth & Analytics',
  'stripe-': 'Growth & Analytics',
  'social-proof-': 'Growth & Analytics',
  'pricing-table-': 'Growth & Analytics',
  'waitlist-': 'Growth & Analytics',
  'launch-': 'Growth & Analytics',
  // AI Research
  'benchmark-': 'AI Research',
  'ablation-': 'AI Research',
  'calibration-': 'AI Research',
  'confusion-': 'AI Research',
  'rouge-': 'AI Research',
  'bleu-': 'AI Research',
  'cosine-': 'AI Research',
  'embedding-': 'AI Research',
  'elo-': 'AI Research',
  'hypothesis-': 'AI Research',
  'pareto-': 'AI Research',
  'prompt-complexity': 'AI Research',
  'response-diversity': 'AI Research',
  'concept-drift-': 'AI Research',
  'reward-': 'AI Research',
  'alignment-': 'AI Research',
  'token-attribution': 'AI Research',
  // Game Mechanics
  'xp-': 'Game Mechanics',
  'skill-tree-': 'Game Mechanics',
  'quest-': 'Game Mechanics',
  'loot-': 'Game Mechanics',
  'boss-': 'Game Mechanics',
  'achievement-': 'Game Mechanics',
  'combo-': 'Game Mechanics',
  'cooldown-': 'Game Mechanics',
  'dungeon-': 'Game Mechanics',
  'reputation-faction': 'Game Mechanics',
  'daily-challenge': 'Game Mechanics',
  'gacha-': 'Game Mechanics',
  'pvp-': 'Game Mechanics',
  'inventory-': 'Game Mechanics',
  'battle-': 'Game Mechanics',
  'world-event-': 'Game Mechanics',
  // Philosophy
  'trolley-': 'Philosophy',
  'value-alignment-': 'Philosophy',
  'consciousness-': 'Philosophy',
  'moral-': 'Philosophy',
  'veil-of-': 'Philosophy',
  'categorical-': 'Philosophy',
  'wisdom-score': 'Philosophy',
  'ikigai-': 'Philosophy',
  'first-principles-': 'Philosophy',
  'coherence-check': 'Philosophy',
  'thought-experiment': 'Philosophy',
  'eudaimonia-': 'Philosophy',
  'existential-': 'Philosophy',
  'meaning-': 'Philosophy',
  'socratic-dialogue': 'Philosophy',
  'autonomy-': 'Philosophy',
  'stewardship-': 'Philosophy',
  'paradox-navigate': 'Philosophy',
  'memento-': 'Philosophy',
  // Competitor Gap: Structured Output
  'schema-': 'Structured Output',
  'structured-output-': 'Structured Output',
  'guardrail-': 'Structured Output',
  'pii-': 'Structured Output',
  // Competitor Gap: Context Management
  'context-window-': 'Context Management',
  'text-chunk-': 'Context Management',
  // Competitor Gap: RAG Primitives
  'vector-search-': 'RAG Primitives',
  // Competitor Gap: Data Operations
  'csv-query': 'Data Operations',
  'data-join': 'Data Operations',
  'data-validate-': 'Data Operations',
  'data-schema-': 'Data Operations',
  // Competitor Gap: Code Analysis
  'ast-parse-': 'Code Analysis',
  'code-complexity-': 'Code Analysis',
  'openapi-to-': 'Code Analysis',
  // Competitor Gap: Observability
  'audit-log-format': 'Observability',
  'trace-span-': 'Observability',
  'cost-estimate-': 'Observability',
  // Competitor Gap: Workflow Primitives
  'workflow-state-': 'Workflow Primitives',
  'workflow-version-': 'Workflow Primitives',
  'dag-': 'Workflow Primitives',
  'cron-schedule-': 'Workflow Primitives',
  // Competitor Gap: Document Parsing
  'html-to-': 'Document Parsing',
  'markdown-to-': 'Document Parsing',
  'yaml-to-': 'Document Parsing',
  'json-to-yaml': 'Document Parsing',
  'changelog-parse': 'Document Parsing',
  // Competitor Gap: Visualization
  'svg-generate-': 'Visualization',
  // Competitor Gap: Agent Intelligence
  'human-in-the-loop-': 'Agent Intelligence',
  'capability-': 'Agent Intelligence',
  'prompt-template-': 'Agent Intelligence',
  'prompt-chain-': 'Agent Intelligence',
  'tool-use-': 'Agent Intelligence',
  'agent-benchmark-': 'Agent Intelligence',
  'feedback-loop-': 'Agent Intelligence',
  // Misc
  'semver-': 'Code Utilities',
  'levenshtein-': 'Text Processing',
  'csp-header-': 'Crypto & Security',
  'contract-abi-': 'Code Utilities',
  'math-symbolic-': 'Math & Numbers',
  'image-metadata-': 'Analyze',
  'calendar-': 'Date & Time',
  'priority-queue-': 'Data Transform',
  'diff-three-': 'Code Utilities',
  'diff-patch-': 'Code Utilities',
  'retry-policy-compute': 'Enterprise Ops',
  // RapidAPI: Validation
  'validate-': 'Validation',
  // RapidAPI: API Testing
  'api-mock-': 'API Testing',
  'api-test-': 'API Testing',
  'api-request-': 'API Testing',
  'api-curl-': 'API Testing',
  'api-rate-': 'API Testing',
  'api-latency-': 'API Testing',
  'api-error-': 'API Testing',
  'api-snippet-': 'API Testing',
  'api-response-': 'API Testing',
  'api-health-': 'API Testing',
  // RapidAPI: HTTP
  'http-header-': 'HTTP Utilities',
  'http-querystring-': 'HTTP Utilities',
  'http-cookie-': 'HTTP Utilities',
  'http-content-': 'HTTP Utilities',
  'http-basic-': 'HTTP Utilities',
  'http-bearer-': 'HTTP Utilities',
  'http-url-': 'HTTP Utilities',
  'http-form-': 'HTTP Utilities',
  'http-status-': 'HTTP Utilities',
  // RapidAPI: Geo
  'geo-': 'Geolocation',
  // RapidAPI: Currency/Locale/Language
  'currency-': 'Data Enrichment',
  'locale-': 'Data Enrichment',
  'language-info-': 'Data Enrichment',
  // RapidAPI: Finance
  'finance-': 'Finance',
  // RapidAPI: Templates
  'template-': 'Communication',
  // RapidAPI: Media
  'media-': 'Media Utilities',
  // RapidAPI: Dev Tools
  'dev-': 'Developer Tools',
  // RapidAPI: Security
  'auth-api-key-': 'Auth & Security',
  'auth-oauth-': 'Auth & Security',
  'auth-scope-': 'Auth & Security',
  'auth-rbac-': 'Auth & Security',
  'auth-password-': 'Auth & Security',
  'security-': 'Auth & Security',
};

function categorize(slug) {
  // Exact match first
  if (CATEGORY_MAP[slug]) return CATEGORY_MAP[slug];
  // Prefix match
  for (const [prefix, cat] of Object.entries(CATEGORY_MAP)) {
    if (prefix.endsWith('-') && slug.startsWith(prefix)) return cat;
  }
  return 'Agent Superpowers';
}

function slugToName(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function slugToDesc(slug) {
  return slugToName(slug) + ' — pure compute superpower for AI agents.';
}

// Auto-generate registry entries for all extended compute handlers
function buildHackathonDefs() {
  const files = [
    'compute-hackathon-1', 'compute-hackathon-2', 'compute-hackathon-3',
    'compute-hackathon-4', 'compute-hackathon-5a', 'compute-hackathon-5b',
    'compute-competitor-1', 'compute-competitor-2',
    'compute-rapidapi-1', 'compute-rapidapi-2', 'compute-rapidapi-3',
  ];
  const defs = {};
  for (const file of files) {
    try {
      const handlers = require('./handlers/' + file);
      for (const slug of Object.keys(handlers)) {
        defs[slug] = {
          cat: categorize(slug),
          name: slugToName(slug),
          desc: slugToDesc(slug),
          credits: 0,
          tier: 'compute',
        };
      }
    } catch (e) {
      console.warn('Extended registry skip:', file, e.message);
    }
  }
  return defs;
}

const HACKATHON_DEFS = buildHackathonDefs();

module.exports = { HACKATHON_DEFS };
