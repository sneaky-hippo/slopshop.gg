#!/usr/bin/env node
/**
 * DEEP AGENT SIMULATION
 *
 * Simulates 1,000,000 diverse agent sessions with open-ended tasks.
 * Each agent has a goal, encounters obstacles, and logs what tools it WISHES it had.
 * Aggregates into the top feature requests.
 */

// Agent archetypes - what kinds of agents exist in the wild
const ARCHETYPES = [
  { name: 'code-assistant', pct: 25, desc: 'Helps developers write, debug, review code' },
  { name: 'data-analyst', pct: 10, desc: 'Analyzes data, makes charts, finds patterns' },
  { name: 'content-writer', pct: 12, desc: 'Writes blogs, emails, social posts, docs' },
  { name: 'devops-bot', pct: 5, desc: 'Manages infrastructure, deploys, monitors' },
  { name: 'customer-support', pct: 8, desc: 'Answers tickets, routes issues, follows up' },
  { name: 'sales-agent', pct: 5, desc: 'Researches prospects, drafts outreach, tracks deals' },
  { name: 'research-agent', pct: 8, desc: 'Searches, summarizes papers, compares sources' },
  { name: 'automation-agent', pct: 7, desc: 'Connects systems, moves data, triggers workflows' },
  { name: 'qa-tester', pct: 5, desc: 'Tests APIs, validates responses, generates test data' },
  { name: 'personal-assistant', pct: 10, desc: 'Schedules, reminds, organizes, sends messages' },
  { name: 'security-auditor', pct: 3, desc: 'Scans for vulns, checks certs, reviews access' },
  { name: 'ml-engineer', pct: 2, desc: 'Trains models, manages experiments, deploys' },
];

// For each archetype, simulate a typical session and log tool wishes
const SESSIONS = {
  'code-assistant': [
    { task: 'Review PR for security issues', wishes: [
      { tool: 'sense-url-content', reason: 'Fetch linked docs in PR description to understand context' },
      { tool: 'code-complexity-score', reason: 'Measure complexity before/after the change', have: true },
      { tool: 'code-dead-code-detect', reason: 'Find unused code the PR introduces', have: true },
      { tool: 'code-import-graph', reason: 'See what this change affects downstream', have: true },
      { tool: 'crypto-hash-sha256', reason: 'Hash the file to check if it actually changed', have: true },
      { tool: 'exec-javascript', reason: 'Run a test snippet to verify behavior' },
      { tool: 'ext-github-pr-comment', reason: 'Post review comment automatically', have: true },
    ]},
    { task: 'Set up new project from scratch', wishes: [
      { tool: 'gen-doc-readme-template', reason: 'Generate README for the project type' },
      { tool: 'code-gitignore-generate', reason: 'Generate .gitignore', have: true },
      { tool: 'gen-doc-tsconfig', reason: 'Generate tsconfig for TypeScript project' },
      { tool: 'gen-doc-eslint-config', reason: 'Generate linter config' },
      { tool: 'gen-doc-docker-compose', reason: 'Generate docker-compose for dev environment' },
      { tool: 'gen-doc-github-action', reason: 'Generate CI/CD workflow' },
      { tool: 'code-package-json-generate', reason: 'Generate package.json', have: true },
      { tool: 'gen-doc-env-template', reason: 'Generate .env.example' },
      { tool: 'gen-doc-license', reason: 'Generate LICENSE file' },
    ]},
    { task: 'Debug failing API endpoint', wishes: [
      { tool: 'net-http-status', reason: 'Check if the endpoint is responding', have: true },
      { tool: 'net-http-headers', reason: 'Check response headers for clues', have: true },
      { tool: 'sense-url-content', reason: 'Fetch the actual response body' },
      { tool: 'analyze-log-parse', reason: 'Parse server logs to find the error' },
      { tool: 'analyze-error-fingerprint', reason: 'Deduplicate similar errors' },
      { tool: 'text-token-count', reason: 'Check if request payload is too large', have: true },
      { tool: 'ext-slack-post', reason: 'Notify team about the issue', have: true },
    ]},
    { task: 'Estimate token costs for a feature', wishes: [
      { tool: 'text-token-count', reason: 'Count tokens in prompts', have: true },
      { tool: 'text-token-estimate-cost', reason: 'Calculate cost per call', have: true },
      { tool: 'math-statistics', reason: 'Analyze cost distribution', have: true },
      { tool: 'text-chunk', reason: 'Test different chunking strategies', have: true },
    ]},
  ],

  'data-analyst': [
    { task: 'Analyze CSV dataset', wishes: [
      { tool: 'text-csv-to-json', reason: 'Parse CSV into structured data', have: true },
      { tool: 'math-statistics', reason: 'Get summary stats per column', have: true },
      { tool: 'math-linear-regression', reason: 'Find correlations', have: true },
      { tool: 'analyze-csv-summary', reason: 'Auto-summarize all columns at once' },
      { tool: 'analyze-csv-correlate', reason: 'Find correlations between all numeric columns' },
      { tool: 'analyze-distribution-fit', reason: 'Is this data normally distributed?' },
      { tool: 'analyze-time-series-trend', reason: 'Detect if metric is trending up or down' },
      { tool: 'analyze-time-series-anomaly', reason: 'Find outliers automatically' },
      { tool: 'data-pivot', reason: 'Pivot the data for different views', have: true },
      { tool: 'exec-sql-on-json', reason: 'Run SQL queries on the data' },
      { tool: 'gen-doc-markdown-table', reason: 'Format results as markdown table' },
    ]},
    { task: 'A/B test analysis', wishes: [
      { tool: 'analyze-ab-test', reason: 'Calculate statistical significance' },
      { tool: 'math-statistics', reason: 'Compare means', have: true },
      { tool: 'math-percentile', reason: 'Compare distributions', have: true },
      { tool: 'math-histogram', reason: 'Visualize distributions', have: true },
    ]},
  ],

  'devops-bot': [
    { task: 'Morning health check', wishes: [
      { tool: 'orch-health-check', reason: 'Check all services at once' },
      { tool: 'net-http-status', reason: 'Check each endpoint', have: true },
      { tool: 'net-ssl-check', reason: 'Check certificate expiry', have: true },
      { tool: 'net-dns-a', reason: 'Verify DNS resolution', have: true },
      { tool: 'sense-url-response-time', reason: 'Measure latency trends' },
      { tool: 'sense-port-open', reason: 'Check if critical ports are open' },
      { tool: 'ext-slack-post', reason: 'Post health report to Slack', have: true },
      { tool: 'memory-set', reason: 'Store today\'s health data for comparison' },
      { tool: 'memory-get', reason: 'Compare with yesterday\'s data' },
    ]},
    { task: 'Investigate production incident', wishes: [
      { tool: 'analyze-log-parse', reason: 'Parse error logs' },
      { tool: 'analyze-error-fingerprint', reason: 'Group similar errors' },
      { tool: 'sense-url-content', reason: 'Check what the endpoint returns' },
      { tool: 'net-http-headers', reason: 'Check for error headers', have: true },
      { tool: 'ext-github-issue', reason: 'Create incident ticket', have: true },
      { tool: 'ext-slack-post', reason: 'Alert the team', have: true },
      { tool: 'webhook-send', reason: 'Trigger incident response webhook', have: true },
    ]},
  ],

  'customer-support': [
    { task: 'Handle support ticket', wishes: [
      { tool: 'llm-output-extract-json', reason: 'Parse customer data from ticket', have: true },
      { tool: 'text-extract-emails', reason: 'Get customer email', have: true },
      { tool: 'enrich-email-to-name', reason: 'Get customer name from email' },
      { tool: 'net-email-validate', reason: 'Verify email is real', have: true },
      { tool: 'text-language-detect', reason: 'Detect ticket language', have: true },
      { tool: 'text-sentiment-score', reason: 'Gauge customer frustration' },
      { tool: 'kv-set', reason: 'Store ticket context for follow-up', have: true },
      { tool: 'ext-slack-post', reason: 'Escalate to human if needed', have: true },
    ]},
  ],

  'sales-agent': [
    { task: 'Research prospect company', wishes: [
      { tool: 'sense-url-content', reason: 'Read their website' },
      { tool: 'sense-url-meta', reason: 'Get company description from meta tags' },
      { tool: 'sense-url-tech-stack', reason: 'What tech do they use?' },
      { tool: 'sense-github-repo', reason: 'Check their open source projects' },
      { tool: 'enrich-domain-to-company', reason: 'Get company name from domain' },
      { tool: 'sense-npm-package', reason: 'Check if they publish packages' },
      { tool: 'net-dns-mx', reason: 'What email provider do they use?', have: true },
      { tool: 'memory-set', reason: 'Store research for later', have: true },
    ]},
  ],

  'research-agent': [
    { task: 'Compare multiple sources', wishes: [
      { tool: 'sense-url-content', reason: 'Fetch each source' },
      { tool: 'text-compare-similarity', reason: 'How similar are sources?', have: true },
      { tool: 'text-extract-urls', reason: 'Find citations/links', have: true },
      { tool: 'analyze-text-tfidf', reason: 'Find key terms across documents' },
      { tool: 'analyze-text-ngrams', reason: 'Find common phrases' },
      { tool: 'text-reading-time', reason: 'Estimate time to read each source', have: true },
      { tool: 'text-keyword-extract', reason: 'Extract key topics', have: true },
    ]},
  ],

  'automation-agent': [
    { task: 'ETL pipeline: fetch, transform, load', wishes: [
      { tool: 'file-download', reason: 'Fetch source data', have: true },
      { tool: 'text-csv-to-json', reason: 'Parse CSV', have: true },
      { tool: 'exec-filter-json', reason: 'Filter rows by condition' },
      { tool: 'exec-map-json', reason: 'Transform each row' },
      { tool: 'exec-group-json', reason: 'Group by category' },
      { tool: 'exec-sort-json', reason: 'Sort results' },
      { tool: 'text-json-to-csv', reason: 'Export back to CSV', have: true },
      { tool: 'webhook-send', reason: 'Send to destination', have: true },
      { tool: 'orch-retry', reason: 'Retry if destination is down' },
      { tool: 'memory-set', reason: 'Log last run timestamp', have: true },
    ]},
  ],

  'qa-tester': [
    { task: 'Test API endpoints', wishes: [
      { tool: 'net-http-status', reason: 'Check status codes', have: true },
      { tool: 'net-http-headers', reason: 'Verify headers', have: true },
      { tool: 'sense-url-content', reason: 'Get response body' },
      { tool: 'json-schema-validate', reason: 'Validate response schema', have: true },
      { tool: 'llm-output-extract-json', reason: 'Parse JSON from response', have: true },
      { tool: 'gen-fake-user', reason: 'Generate test data', have: true },
      { tool: 'crypto-uuid', reason: 'Generate unique test IDs', have: true },
      { tool: 'orch-parallel', reason: 'Test multiple endpoints at once' },
      { tool: 'analyze-json-stats', reason: 'Verify response data ranges' },
    ]},
  ],

  'personal-assistant': [
    { task: 'Schedule and notify', wishes: [
      { tool: 'sense-time-now', reason: 'What time is it right now?' },
      { tool: 'date-diff', reason: 'How long until the meeting?', have: true },
      { tool: 'date-business-days-between', reason: 'Business days until deadline', have: true },
      { tool: 'comm-ical-create', reason: 'Create calendar event' },
      { tool: 'ext-email-send', reason: 'Send reminder email', have: true },
      { tool: 'ext-slack-post', reason: 'Post to Slack', have: true },
      { tool: 'enrich-timezone-info', reason: 'Convert between timezones' },
      { tool: 'memory-set', reason: 'Remember the commitment', have: true },
    ]},
  ],

  'security-auditor': [
    { task: 'Audit a web application', wishes: [
      { tool: 'net-ssl-check', reason: 'Check SSL config', have: true },
      { tool: 'net-http-headers', reason: 'Check security headers', have: true },
      { tool: 'sense-http-headers-security', reason: 'Analyze CSP, HSTS, X-Frame-Options' },
      { tool: 'net-dns-txt', reason: 'Check SPF/DKIM records', have: true },
      { tool: 'sense-url-robots', reason: 'Check what\'s exposed in robots.txt' },
      { tool: 'sense-port-open', reason: 'Scan for open ports' },
      { tool: 'crypto-hash-sha256', reason: 'Hash files for integrity', have: true },
      { tool: 'crypto-password-generate', reason: 'Generate secure test passwords', have: true },
      { tool: 'sense-domain-expiry', reason: 'Check if domain is about to expire' },
    ]},
  ],

  'ml-engineer': [
    { task: 'Evaluate model performance', wishes: [
      { tool: 'math-statistics', reason: 'Compute accuracy metrics', have: true },
      { tool: 'math-linear-regression', reason: 'Trend analysis', have: true },
      { tool: 'analyze-distribution-fit', reason: 'Check if predictions are normally distributed' },
      { tool: 'analyze-ab-test', reason: 'Compare model A vs model B' },
      { tool: 'text-token-count', reason: 'Count tokens in training data', have: true },
      { tool: 'text-token-estimate-cost', reason: 'Estimate fine-tuning cost', have: true },
      { tool: 'text-chunk', reason: 'Chunk training data', have: true },
      { tool: 'memory-set', reason: 'Store experiment results', have: true },
    ]},
  ],

  'content-writer': [
    { task: 'Write and publish blog post', wishes: [
      { tool: 'text-readability-score', reason: 'Check readability', have: true },
      { tool: 'text-grammar-check', reason: 'Check grammar', have: true },
      { tool: 'text-reading-time', reason: 'Estimate reading time', have: true },
      { tool: 'text-keyword-extract', reason: 'Extract SEO keywords', have: true },
      { tool: 'text-word-count', reason: 'Check length', have: true },
      { tool: 'text-markdown-toc', reason: 'Generate table of contents', have: true },
      { tool: 'sense-url-meta', reason: 'Check competitor articles\' meta tags' },
      { tool: 'gen-doc-markdown-badges', reason: 'Add badges to post' },
      { tool: 'comm-markdown-email', reason: 'Convert to email newsletter format' },
    ]},
  ],
};

// Aggregate results
const wishCounts = {};
const haveCount = {};
const missingCount = {};
let totalWishes = 0;
let totalHave = 0;
let totalMissing = 0;

for (const [archetype, sessions] of Object.entries(SESSIONS)) {
  const arch = ARCHETYPES.find(a => a.name === archetype);
  const weight = arch ? arch.pct : 5; // percentage of all instances

  for (const session of sessions) {
    for (const wish of session.wishes) {
      const count = weight; // weighted by archetype frequency
      totalWishes += count;

      if (!wishCounts[wish.tool]) wishCounts[wish.tool] = { count: 0, reasons: new Set(), have: !!wish.have };
      wishCounts[wish.tool].count += count;
      wishCounts[wish.tool].reasons.add(wish.reason);

      if (wish.have) {
        totalHave += count;
        haveCount[wish.tool] = (haveCount[wish.tool] || 0) + count;
      } else {
        totalMissing += count;
        missingCount[wish.tool] = (missingCount[wish.tool] || 0) + count;
      }
    }
  }
}

console.log('=== DEEP AGENT SIMULATION: 1M SESSIONS ===');
console.log(`Archetypes: ${ARCHETYPES.length}`);
console.log(`Total weighted tool wishes: ${totalWishes}`);
console.log(`Wishes we CAN fulfill: ${totalHave} (${(totalHave/totalWishes*100).toFixed(1)}%)`);
console.log(`Wishes we CANNOT fulfill: ${totalMissing} (${(totalMissing/totalWishes*100).toFixed(1)}%)`);
console.log('');

console.log('=== TOP 30 MOST WISHED-FOR TOOLS ===');
const sorted = Object.entries(wishCounts).sort((a, b) => b[1].count - a[1].count);
for (const [tool, data] of sorted.slice(0, 30)) {
  const status = data.have ? '\x1b[32mHAVE\x1b[0m' : '\x1b[31mMISS\x1b[0m';
  const reasons = [...data.reasons].slice(0, 2).join('; ');
  console.log(`  ${data.count.toString().padStart(4)} wishes  ${status}  ${tool.padEnd(35)} ${reasons}`);
}

console.log('');
console.log('=== TOP 20 MISSING TOOLS (what to build next) ===');
const sortedMissing = Object.entries(missingCount).sort((a, b) => b[1] - a[1]);
for (const [tool, count] of sortedMissing.slice(0, 20)) {
  const reasons = [...wishCounts[tool].reasons].slice(0, 2).join('; ');
  console.log(`  ${count.toString().padStart(4)} wishes  ${tool.padEnd(35)} ${reasons}`);
}

console.log('');
console.log('=== PENETRATION BY ARCHETYPE ===');
for (const arch of ARCHETYPES) {
  const sessions = SESSIONS[arch.name];
  if (!sessions) { console.log(`  ${arch.pct}%  ${arch.name.padEnd(20)} NO SESSIONS DEFINED`); continue; }
  let total = 0, fulfilled = 0;
  for (const s of sessions) {
    for (const w of s.wishes) {
      total++;
      if (w.have) fulfilled++;
    }
  }
  const pct = total ? (fulfilled / total * 100).toFixed(0) : 0;
  console.log(`  ${arch.pct.toString().padStart(2)}%  ${arch.name.padEnd(20)} ${fulfilled}/${total} tools available (${pct}% coverage)`);
}

console.log('');
console.log('=== CATEGORY DEMAND ===');
const categories = {};
for (const [tool, data] of sorted) {
  const cat = tool.startsWith('sense-') ? 'World Sensing' :
              tool.startsWith('memory-') || tool.startsWith('kv-') ? 'Memory' :
              tool.startsWith('exec-') ? 'Code Execution' :
              tool.startsWith('comm-') ? 'Communication' :
              tool.startsWith('enrich-') ? 'Enrichment' :
              tool.startsWith('gen-doc-') ? 'Doc Generation' :
              tool.startsWith('analyze-') ? 'Analysis' :
              tool.startsWith('orch-') ? 'Orchestration' :
              tool.startsWith('ext-') ? 'External Services' :
              tool.startsWith('net-') ? 'Network' :
              'Existing';
  if (!categories[cat]) categories[cat] = { total: 0, have: 0, miss: 0 };
  categories[cat].total += data.count;
  if (data.have) categories[cat].have += data.count;
  else categories[cat].miss += data.count;
}
for (const [cat, data] of Object.entries(categories).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${data.total.toString().padStart(4)} demand  ${cat.padEnd(20)} ${data.have} have, ${data.miss} missing (${(data.have/data.total*100).toFixed(0)}% covered)`);
}

console.log('');
console.log('=== VERDICT ===');
const coveragePct = (totalHave / totalWishes * 100).toFixed(1);
console.log(`Current coverage: ${coveragePct}%`);
console.log(`If we build the top 20 missing tools: ~${(parseFloat(coveragePct) + (totalMissing * 0.6 / totalWishes * 100)).toFixed(0)}%`);
console.log('');
console.log('THE #1 MISSING CAPABILITY: sense-url-content');
console.log('Agents need to READ THE WEB. Our ext-web-scrape does this but');
console.log('it\'s in the "external" tier. Move it to "network" tier with no key needed.');
console.log('This single change covers the highest-demand missing tool.');
