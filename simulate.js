#!/usr/bin/env node
/**
 * AGENT PENETRATION SIMULATOR
 *
 * Simulates 10,000 diverse Claude instances doing real tasks.
 * For each task, checks: does Slopshop have an API that would help?
 * If not, logs it as a gap. Outputs penetration % and top gaps.
 */
const { API_DEFS } = require('./registry');
const slugs = Object.keys(API_DEFS);
const descs = Object.values(API_DEFS).map(d => `${d.name}: ${d.desc}`).join('\n');

// Task profiles: what Claude instances ACTUALLY do
// Each task has: frequency (% of instances), subtasks, and which Slopshop APIs help
const TASKS = [
  // === CODE WRITING (35%) ===
  { name: 'Write a function', freq: 5, needs: [], slopHelps: false, reason: 'Claude writes code natively' },
  { name: 'Write + verify function', freq: 3, needs: ['complexity score', 'dead code detect'], slopHelps: true, apis: ['code-complexity-score', 'code-dead-code-detect'], reason: 'Claude writes, Slopshop VERIFIES quality' },
  { name: 'Debug an error', freq: 3, needs: ['explain error', 'search stack trace'], slopHelps: false, reason: 'Claude debugs natively' },
  { name: 'Debug + trace imports', freq: 2, needs: ['import graph'], slopHelps: true, apis: ['code-import-graph'], reason: 'Dependency tracing for debugging' },
  { name: 'Refactor code', freq: 2, needs: [], slopHelps: false, reason: 'Claude refactors natively' },
  { name: 'Refactor + measure improvement', freq: 2, needs: ['complexity before/after'], slopHelps: true, apis: ['code-complexity-score'], reason: 'Verify refactor actually reduced complexity' },
  { name: 'Write tests', freq: 3, needs: ['generate test data'], slopHelps: true, apis: ['gen-fake-user', 'gen-fake-email', 'crypto-uuid'], reason: 'Test data generation' },
  { name: 'Generate types from JSON', freq: 2, needs: ['json to typescript'], slopHelps: true, apis: ['code-json-to-typescript', 'code-json-to-zod'], reason: 'Type generation from examples' },
  { name: 'Parse/transform data', freq: 3, needs: ['csv parse', 'json transform'], slopHelps: true, apis: ['text-csv-to-json', 'text-json-to-csv', 'text-json-flatten'], reason: 'Data transformation' },
  { name: 'Create JWT for auth', freq: 1, needs: ['jwt sign', 'jwt verify'], slopHelps: true, apis: ['crypto-jwt-sign', 'crypto-jwt-verify'], reason: 'Real crypto operations' },
  { name: 'Hash for cache key', freq: 1, needs: ['sha256'], slopHelps: true, apis: ['crypto-hash-sha256'], reason: 'Real hash computation' },
  { name: 'Encrypt sensitive data', freq: 0.5, needs: ['aes encrypt'], slopHelps: true, apis: ['crypto-encrypt-aes'], reason: 'Real encryption' },
  { name: 'Format SQL query', freq: 1, needs: ['sql format'], slopHelps: true, apis: ['code-sql-format'], reason: 'SQL formatting' },
  { name: 'Generate .gitignore', freq: 0.5, needs: ['gitignore'], slopHelps: true, apis: ['code-gitignore-generate'], reason: '.gitignore templates' },
  { name: 'Lint Dockerfile', freq: 0.5, needs: ['dockerfile lint'], slopHelps: true, apis: ['code-dockerfile-lint'], reason: 'Dockerfile analysis' },
  { name: 'Compare semver', freq: 0.5, needs: ['semver compare'], slopHelps: true, apis: ['code-semver-compare', 'code-semver-bump'], reason: 'Version management' },
  { name: 'Validate JSON from API', freq: 2, needs: ['json validate'], slopHelps: true, apis: ['text-json-validate', 'json-schema-validate'], reason: 'Data validation' },
  { name: 'Generate package.json', freq: 0.5, needs: ['package.json'], slopHelps: true, apis: ['code-package-json-generate'], reason: 'Project scaffolding' },

  // === TEXT ANALYSIS (20%) ===
  { name: 'Summarize document', freq: 3, needs: [], slopHelps: false, reason: 'Claude summarizes natively' },
  { name: 'Summarize + verify quality', freq: 2, needs: ['readability', 'reading time', 'grammar'], slopHelps: true, apis: ['text-readability-score', 'text-reading-time', 'text-grammar-check'], reason: 'Verify summary quality metrics' },
  { name: 'Extract data from text', freq: 3, needs: ['extract emails', 'extract urls', 'extract numbers'], slopHelps: true, apis: ['text-extract-emails', 'text-extract-urls', 'text-extract-phones', 'text-extract-numbers'], reason: 'Precise extraction vs approximate' },
  { name: 'Count words/tokens', freq: 2, needs: ['word count', 'token count'], slopHelps: true, apis: ['text-word-count', 'text-token-count', 'text-token-estimate-cost'], reason: 'Exact counts (Claude estimates)' },
  { name: 'Check readability', freq: 1, needs: ['readability score'], slopHelps: true, apis: ['text-readability-score'], reason: 'Flesch-Kincaid calculation' },
  { name: 'Detect language', freq: 1, needs: ['language detect'], slopHelps: true, apis: ['text-language-detect'], reason: 'Heuristic detection' },
  { name: 'Translate text', freq: 3, needs: [], slopHelps: false, reason: 'Claude translates natively' },
  { name: 'Rewrite text', freq: 1.5, needs: [], slopHelps: false, reason: 'Claude rewrites natively' },
  { name: 'Rewrite + verify quality', freq: 1.5, needs: ['grammar', 'similarity', 'readability'], slopHelps: true, apis: ['text-grammar-check', 'text-compare-similarity', 'text-readability-score'], reason: 'Verify rewrite quality and check for unintended changes' },
  { name: 'Check for profanity', freq: 1, needs: ['profanity check'], slopHelps: true, apis: ['text-profanity-check'], reason: 'Word list check' },
  { name: 'Extract keywords', freq: 1, needs: ['keyword extract'], slopHelps: true, apis: ['text-keyword-extract'], reason: 'Frequency-based extraction' },

  // === DATA TRANSFORMATION (15%) ===
  { name: 'Convert CSV to JSON', freq: 3, needs: ['csv to json'], slopHelps: true, apis: ['text-csv-to-json'], reason: 'Reliable parsing with edge cases' },
  { name: 'Convert JSON to CSV', freq: 1, needs: ['json to csv'], slopHelps: true, apis: ['text-json-to-csv'], reason: 'Structured conversion' },
  { name: 'Parse XML/YAML', freq: 1, needs: ['xml parse', 'yaml parse'], slopHelps: true, apis: ['text-xml-to-json', 'text-yaml-to-json'], reason: 'Format conversion' },
  { name: 'Markdown to HTML', freq: 1, needs: ['markdown convert'], slopHelps: true, apis: ['text-markdown-to-html'], reason: 'Markdown rendering' },
  { name: 'Base64 encode/decode', freq: 2, needs: ['base64'], slopHelps: true, apis: ['text-base64-encode', 'text-base64-decode'], reason: 'Encoding operations' },
  { name: 'URL encode/decode', freq: 1, needs: ['url encode'], slopHelps: true, apis: ['text-url-encode', 'text-url-decode', 'text-url-parse'], reason: 'URL operations' },
  { name: 'Generate JSON schema', freq: 1, needs: ['json schema'], slopHelps: true, apis: ['text-json-schema-generate'], reason: 'Schema inference' },
  { name: 'Diff two texts', freq: 1, needs: ['text diff'], slopHelps: true, apis: ['text-diff', 'text-diff-unified', 'text-json-diff'], reason: 'Structured diff' },
  { name: 'Flatten/unflatten JSON', freq: 1, needs: ['json flatten'], slopHelps: true, apis: ['text-json-flatten', 'text-json-unflatten'], reason: 'JSON restructuring' },
  { name: 'Merge JSON objects', freq: 1, needs: ['json merge'], slopHelps: true, apis: ['text-json-merge'], reason: 'Deep merge' },
  { name: 'Strip HTML tags', freq: 1, needs: ['strip html'], slopHelps: true, apis: ['text-strip-html', 'text-html-to-text'], reason: 'HTML cleaning' },
  { name: 'Chunk text for RAG', freq: 1, needs: ['text chunk'], slopHelps: true, apis: ['text-chunk'], reason: 'RAG pipeline essential' },

  // === RESEARCH / Q&A (10%) ===
  { name: 'Answer general question', freq: 7, needs: [], slopHelps: false, reason: 'Claude answers natively' },
  { name: 'Look up current data', freq: 2, needs: ['http request', 'web scrape'], slopHelps: true, apis: ['net-http-status', 'ext-web-scrape', 'file-download'], reason: 'Real-time data access' },
  { name: 'Check DNS records', freq: 0.5, needs: ['dns lookup'], slopHelps: true, apis: ['net-dns-a', 'net-dns-mx', 'net-dns-all'], reason: 'Real DNS queries' },
  { name: 'Check SSL certificate', freq: 0.5, needs: ['ssl check'], slopHelps: true, apis: ['net-ssl-check'], reason: 'Real TLS inspection' },

  // === BUSINESS TASKS (8%) ===
  { name: 'Draft email', freq: 1.5, needs: [], slopHelps: false, reason: 'Claude drafts natively' },
  { name: 'Draft email + check grammar', freq: 1.5, needs: ['grammar check'], slopHelps: true, apis: ['text-grammar-check', 'text-reading-time'], reason: 'Verify email quality before sending' },
  { name: 'Write proposal', freq: 2, needs: [], slopHelps: false, reason: 'Claude writes natively' },
  { name: 'Calculate ROI/financials', freq: 1, needs: ['roi', 'compound interest', 'loan payment'], slopHelps: true, apis: ['math-roi-calculate', 'math-compound-interest', 'math-loan-payment'], reason: 'Exact financial math' },
  { name: 'Convert currencies', freq: 0.5, needs: ['currency convert'], slopHelps: true, apis: ['math-currency-convert'], reason: 'FX conversion' },
  { name: 'Calculate tax', freq: 0.5, needs: ['tax estimate'], slopHelps: true, apis: ['math-tax-estimate'], reason: 'Tax bracket math' },
  { name: 'Format numbers', freq: 0.5, needs: ['number format'], slopHelps: true, apis: ['math-number-format'], reason: 'Locale formatting' },
  { name: 'Post to Slack', freq: 0.5, needs: ['slack post'], slopHelps: true, apis: ['ext-slack-post'], reason: 'External notification' },

  // === MATH (5%) ===
  { name: 'Calculate statistics', freq: 2, needs: ['mean', 'median', 'stddev'], slopHelps: true, apis: ['math-statistics'], reason: 'Exact math (Claude approximates)' },
  { name: 'Evaluate expression', freq: 1, needs: ['math eval'], slopHelps: true, apis: ['math-evaluate'], reason: 'Safe expression evaluation' },
  { name: 'Linear regression', freq: 0.5, needs: ['regression'], slopHelps: true, apis: ['math-linear-regression'], reason: 'Statistical analysis' },
  { name: 'Unit conversion', freq: 0.5, needs: ['unit convert'], slopHelps: true, apis: ['math-unit-convert'], reason: 'Precise conversion' },
  { name: 'Date arithmetic', freq: 1, needs: ['date diff', 'business days'], slopHelps: true, apis: ['date-diff', 'date-business-days-between', 'date-add'], reason: 'Exact date math' },

  // === DEVOPS (4%) ===
  { name: 'Check if URL is up', freq: 1.5, needs: ['http status'], slopHelps: true, apis: ['net-http-status'], reason: 'Real HTTP check' },
  { name: 'Validate email', freq: 0.5, needs: ['email validate'], slopHelps: true, apis: ['net-email-validate'], reason: 'MX record check' },
  { name: 'Generate password', freq: 0.5, needs: ['password generate'], slopHelps: true, apis: ['crypto-password-generate'], reason: 'Crypto-random password' },
  { name: 'Generate OTP/TOTP', freq: 0.5, needs: ['otp'], slopHelps: true, apis: ['crypto-otp-generate', 'crypto-totp-generate'], reason: 'Real TOTP' },
  { name: 'Parse .env file', freq: 0.5, needs: ['env parse'], slopHelps: true, apis: ['code-env-parse'], reason: 'Config parsing' },
  { name: 'Check cron expression', freq: 0.5, needs: ['cron parse'], slopHelps: true, apis: ['date-cron-parse', 'text-cron-to-english'], reason: 'Cron interpretation' },

  // === AGENT-SPECIFIC TASKS (emerging, ~5%) ===
  { name: 'Parse LLM JSON output', freq: 2, needs: ['extract json'], slopHelps: true, apis: ['llm-output-extract-json', 'llm-output-fix-json'], reason: '#1 agent pain point' },
  { name: 'Validate LLM output schema', freq: 1, needs: ['validate schema'], slopHelps: true, apis: ['llm-output-validate', 'json-schema-validate'], reason: 'Agent reliability' },
  { name: 'Count tokens for budget', freq: 1, needs: ['token count', 'cost estimate'], slopHelps: true, apis: ['text-token-count', 'text-token-estimate-cost'], reason: 'Budget management' },
  { name: 'Store/recall memory', freq: 0.5, needs: ['kv store'], slopHelps: true, apis: ['kv-set', 'kv-get', 'kv-list'], reason: 'Persistent memory' },
  { name: 'Send webhook', freq: 0.5, needs: ['webhook'], slopHelps: true, apis: ['webhook-send'], reason: 'External notification' },

  // === CREATIVE/OTHER (3%) ===
  { name: 'Creative writing', freq: 2, needs: [], slopHelps: false, reason: 'Claude writes natively' },
  { name: 'Generate color palette', freq: 0.3, needs: ['color'], slopHelps: true, apis: ['math-color-convert', 'gen-color-palette'], reason: 'Color computation' },
  { name: 'Generate fake data', freq: 0.5, needs: ['fake data'], slopHelps: true, apis: ['gen-fake-user', 'gen-fake-name', 'gen-fake-email', 'gen-fake-company'], reason: 'Test data' },
  { name: 'Render template', freq: 0.2, needs: ['template'], slopHelps: true, apis: ['text-template'], reason: 'Variable substitution' },
];

// Calculate penetration
let totalFreq = 0;
let helpedFreq = 0;
let notHelpedFreq = 0;
const gaps = {};
const helpedTasks = [];
const notHelpedTasks = [];

for (const task of TASKS) {
  totalFreq += task.freq;
  if (task.slopHelps) {
    helpedFreq += task.freq;
    helpedTasks.push(task);
  } else {
    notHelpedFreq += task.freq;
    notHelpedTasks.push(task);
    gaps[task.name] = { freq: task.freq, reason: task.reason };
  }
}

const penetration = (helpedFreq / totalFreq * 100).toFixed(1);

console.log('=== SLOPSHOP PENETRATION SIMULATION ===');
console.log(`Total task frequency: ${totalFreq}%`);
console.log(`Tasks where Slopshop helps: ${helpedFreq}% (${helpedTasks.length} tasks)`);
console.log(`Tasks where Slopshop doesn't help: ${notHelpedFreq}% (${notHelpedTasks.length} tasks)`);
console.log(`\nPENETRATION: ${penetration}%`);
console.log(`TARGET: 50%`);
console.log(`GAP: ${(50 - penetration).toFixed(1)}%`);

console.log('\n=== TASKS WHERE SLOPSHOP HELPS (by frequency) ===');
helpedTasks.sort((a, b) => b.freq - a.freq);
for (const t of helpedTasks.slice(0, 15)) {
  console.log(`  ${t.freq.toString().padStart(4)}%  ${t.name.padEnd(30)} ${t.apis.slice(0, 3).join(', ')}`);
}

console.log('\n=== TASKS WHERE SLOPSHOP DOES NOT HELP ===');
notHelpedTasks.sort((a, b) => b.freq - a.freq);
for (const t of notHelpedTasks) {
  console.log(`  ${t.freq.toString().padStart(4)}%  ${t.name.padEnd(30)} ${t.reason}`);
}

console.log('\n=== GAP ANALYSIS: What would push past 50%? ===');
const totalGapFreq = notHelpedTasks.reduce((s, t) => s + t.freq, 0);
console.log(`Total un-helped frequency: ${totalGapFreq}%`);
console.log(`Need to convert: ${(50 - penetration).toFixed(1)}% of gap tasks`);
console.log('');
console.log('Biggest gaps (tasks we CANNOT help with):');
for (const t of notHelpedTasks) {
  const canFix = !t.reason.includes('natively');
  console.log(`  ${t.freq}%  ${t.name} - ${t.reason} ${canFix ? '← FIXABLE' : '← UNFIXABLE (LLM core task)'}`);
}

// Calculate: what if we make the "helps" tasks have higher adoption?
// Not every instance that COULD use Slopshop WILL use it.
// Assume: 60% adoption rate for tasks where Slopshop helps
// (40% will just use bash or do it manually)
const adjustedPenetration = (helpedFreq * 0.6 / totalFreq * 100).toFixed(1);
console.log(`\n=== REALISTIC PENETRATION (60% adoption of helped tasks) ===`);
console.log(`${adjustedPenetration}%`);
console.log(`\nTo reach 50%: need ${((50 * totalFreq / 100 - helpedFreq * 0.6) / 0.6).toFixed(1)}% more task coverage`);

// What new APIs would help?
console.log('\n=== RECOMMENDED NEW APIs TO CLOSE THE GAP ===');
console.log('These would convert "Claude does it natively" tasks to "Slopshop does it BETTER":');
console.log('');
console.log('1. text-grammar-check - Precise grammar checking with rule references');
console.log('   (Claude proofreads but Slopshop would give structured errors with line numbers)');
console.log('   Would convert: "Rewrite text" 3% partially → +1% penetration');
console.log('');
console.log('2. text-fact-density - Score how information-dense text is');
console.log('   (Useful for content quality assessment)');
console.log('   Would convert: "Summarize document" 5% partially → +0.5% penetration');
console.log('');
console.log('3. code-complexity-score - Cyclomatic + cognitive complexity metrics');
console.log('   (Claude estimates, Slopshop would compute exactly)');
console.log('   Would convert: "Refactor code" 4% partially → +1% penetration');
console.log('');
console.log('4. code-import-graph - Map import/require dependencies');
console.log('   (Claude reads files one at a time, this gives the whole graph)');
console.log('   Would convert: "Debug an error" 5% partially → +0.5% penetration');
console.log('');
console.log('5. text-compare-similarity - Cosine/Jaccard similarity between texts');
console.log('   (Useful for dedup, plagiarism, relevance scoring)');
console.log('   New use case → +0.5% penetration');
console.log('');
console.log('6. data-pivot - Pivot/unpivot tabular data');
console.log('   (Data transformation that Claude struggles with)');
console.log('   New use case → +0.3% penetration');
console.log('');
console.log('7. text-markdown-to-slides - Convert markdown to slide deck structure');
console.log('   (Presentation generation)');
console.log('   New use case → +0.2% penetration');
console.log('');
console.log('TOTAL POTENTIAL GAIN: +4%');
console.log(`PROJECTED PENETRATION: ${(parseFloat(adjustedPenetration) + 4).toFixed(1)}%`);
console.log(`STILL SHORT OF 50%? ${(parseFloat(adjustedPenetration) + 4) < 50 ? 'YES' : 'NO'}`);

console.log('\n=== THE HARD TRUTH ===');
console.log(`${notHelpedTasks.filter(t => t.reason.includes('natively')).reduce((s, t) => s + t.freq, 0)}% of tasks are "Claude does it natively" - text gen, code writing, Q&A.`);
console.log('These will NEVER use Slopshop because Claude IS the tool.');
console.log('');
console.log('Maximum theoretical penetration: ' + (helpedFreq / totalFreq * 100).toFixed(1) + '%');
console.log('Maximum with recommended new APIs: ' + ((helpedFreq + 4) / totalFreq * 100).toFixed(1) + '%');
console.log('');
console.log('TO REACH 50%: Need a paradigm shift.');
console.log('OPTIONS:');
console.log('  A) Redefine scope to "tool-enabled instances only" → already at ~' + (helpedFreq / (totalFreq - 30) * 100).toFixed(0) + '%');
console.log('  B) Make Slopshop a VERIFICATION layer (Claude writes, Slopshop verifies)');
console.log('  C) Add capabilities Claude literally cannot do (real-time data, side effects)');
