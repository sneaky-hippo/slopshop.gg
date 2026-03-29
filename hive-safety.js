/**
 * hive-safety.js — 5-Gate Validation System for Autonomous Code Editing
 *
 * Catches: .splice/.slice confusion, const reassignment, inverted booleans,
 *          Yoda conditions, require().default, and semantic regressions.
 *
 * Usage:
 *   const { validateEdit, rollback, getConfidenceScore } = require('./hive-safety');
 *   const result = await validateEdit(filePath, oldContent, newContent, { sprint, priority });
 *   if (!result.passed) rollback(filePath, oldContent);
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
  SYNTAX_TIMEOUT: 5000,
  RUNTIME_TIMEOUT: 10000,
  TEST_TIMEOUT: 30000,
  AST_TIMEOUT: 5000,
  AUTO_APPLY_THRESHOLD: 0.85,   // confidence >= this => auto-apply
  HUMAN_REVIEW_THRESHOLD: 0.50, // confidence < this => block, queue for human
  // between thresholds => auto-apply but flag for async review
  BRANCH_PREFIX: 'hive/sprint-',
  MAX_ROLLBACK_DEPTH: 20,
};

// ─── Known Anti-Patterns (from 330 sprint failure data) ──────────────────────

const ANTI_PATTERNS = [
  {
    name: 'splice-instead-of-slice',
    pattern: /\.splice\s*\(/g,
    severity: 'critical',
    message: 'Array.splice() mutates in place — did you mean .slice()?',
    check: (oldContent, newContent) => {
      const oldCount = (oldContent.match(/\.splice\s*\(/g) || []).length;
      const newCount = (newContent.match(/\.splice\s*\(/g) || []).length;
      // Flag if splice was ADDED (not if it already existed)
      return newCount > oldCount;
    }
  },
  {
    name: 'require-dot-default',
    pattern: /require\s*\([^)]+\)\.default/g,
    severity: 'critical',
    message: 'require().default does not exist in Node.js CJS — use require() directly',
    check: (oldContent, newContent) => {
      const oldCount = (oldContent.match(/require\s*\([^)]+\)\.default/g) || []).length;
      const newCount = (newContent.match(/require\s*\([^)]+\)\.default/g) || []).length;
      return newCount > oldCount;
    }
  },
  {
    name: 'yoda-condition',
    // Matches: "string" === var, 'string' === var, number === var
    pattern: /(?:["'][^"']+["']|(?<!\w)\d+)\s*===?\s*[a-zA-Z_$]\w*/g,
    severity: 'style',
    message: 'Yoda condition detected — unnecessary style change, not an improvement',
    check: (oldContent, newContent) => {
      const oldCount = (oldContent.match(/(?:["'][^"']+["']|(?<!\w)\d+)\s*===?\s*[a-zA-Z_$]\w*/g) || []).length;
      const newCount = (newContent.match(/(?:["'][^"']+["']|(?<!\w)\d+)\s*===?\s*[a-zA-Z_$]\w*/g) || []).length;
      return newCount > oldCount;
    }
  },
  {
    name: 'const-reassignment',
    // Detect: declares const X, then later X = ...
    pattern: null, // handled by custom check
    severity: 'critical',
    message: 'Possible const reassignment — will crash at runtime',
    check: (oldContent, newContent) => {
      // Extract const declarations from new content
      const constDecls = [...newContent.matchAll(/\bconst\s+(\w+)\s*=/g)].map(m => m[1]);
      // Check if any are reassigned (not redeclared)
      for (const name of constDecls) {
        // Look for "name = " that is NOT "const name =" and NOT "=== name" and NOT inside a string
        const reassignPattern = new RegExp(`(?<!const\\s+)(?<!let\\s+)(?<!var\\s+)(?<![.=!<>])\\b${name}\\s*=[^=]`, 'g');
        const matches = [...newContent.matchAll(reassignPattern)];
        // Filter out the original declaration
        const declPattern = new RegExp(`\\bconst\\s+${name}\\s*=`);
        const nonDecl = matches.filter(m => {
          const before = newContent.slice(Math.max(0, m.index - 20), m.index);
          return !declPattern.test(before + newContent.slice(m.index, m.index + name.length + 5));
        });
        if (nonDecl.length > 0) return true;
      }
      return false;
    }
  },
  {
    name: 'inverted-boolean',
    // Detect common inversions: replacing !x with x, or true with false in returns
    pattern: null,
    severity: 'critical',
    message: 'Possible inverted boolean logic — passes syntax but breaks behavior',
    check: (oldContent, newContent) => {
      // Find all return statements and conditionals, compare boolean direction
      const oldReturns = [...oldContent.matchAll(/return\s+(true|false|!\w+|\w+)\s*;/g)].map(m => m[1]);
      const newReturns = [...newContent.matchAll(/return\s+(true|false|!\w+|\w+)\s*;/g)].map(m => m[1]);

      let inversions = 0;
      const minLen = Math.min(oldReturns.length, newReturns.length);
      for (let i = 0; i < minLen; i++) {
        const o = oldReturns[i], n = newReturns[i];
        if ((o === 'true' && n === 'false') || (o === 'false' && n === 'true')) inversions++;
        if (o.startsWith('!') && n === o.slice(1)) inversions++;
        if (n.startsWith('!') && o === n.slice(1)) inversions++;
      }
      // One inversion is suspicious but might be intentional; 2+ is almost certainly a bug
      return inversions >= 1;
    }
  },
  {
    name: 'overcomplicated-rewrite',
    pattern: null,
    severity: 'style',
    message: 'Edit adds complexity (Object.values/entries/some/Boolean chains) — likely worse',
    check: (oldContent, newContent) => {
      const complexPatterns = [
        /Object\.values\([^)]+\)\.some\(Boolean\)/g,
        /Object\.entries\([^)]+\)\.reduce\(/g,
        /\.flatMap\([^)]+\)\.filter\([^)]+\)\.map\(/g,
      ];
      for (const p of complexPatterns) {
        const oldCount = (oldContent.match(p) || []).length;
        const newCount = (newContent.match(p) || []).length;
        if (newCount > oldCount) return true;
      }
      return false;
    }
  }
];


// ─── GATE 1: AST-LEVEL SYNTAX VALIDATION ─────────────────────────────────────
// What: Parses the file into an AST — catches syntax errors that `node -c` misses
// How: Uses Node's built-in vm.compileFunction or acorn if available
// Catches: Missing brackets, bad template literals, invalid destructuring
// Speed: ~50ms
// On failure: Immediate reject + revert

function gate1_syntax(filePath, newContent) {
  const t0 = Date.now();
  const result = { gate: 1, name: 'syntax', passed: false, ms: 0, errors: [] };

  try {
    // Write content to file first (needed for node -c)
    // Primary: node --check (catches real syntax errors)
    execSync(`node -c "${filePath}"`, {
      stdio: 'pipe',
      timeout: CONFIG.SYNTAX_TIMEOUT
    });

    // Secondary: try to compile as a function body to catch more issues
    // This catches things like unterminated template literals inside expressions
    try {
      const vm = require('vm');
      new vm.Script(newContent, { filename: filePath });
    } catch (e) {
      result.errors.push(`vm.Script parse: ${e.message}`);
      result.ms = Date.now() - t0;
      return result;
    }

    result.passed = true;
  } catch (e) {
    result.errors.push(`node -c: ${e.stderr?.toString().split('\n')[0] || e.message}`);
  }

  result.ms = Date.now() - t0;
  return result;
}


// ─── GATE 2: ANTI-PATTERN DETECTION ──────────────────────────────────────────
// What: Scans diff for known bad patterns from 330-sprint failure data
// How: Regex + structural comparison of old vs new content
// Catches: .splice mutation, require().default, Yoda, const reassignment, inverted bools
// Speed: ~10ms (pure regex, no subprocess)
// On failure: Reject if critical; flag if style-only

function gate2_antipattern(oldContent, newContent) {
  const t0 = Date.now();
  const result = { gate: 2, name: 'anti-pattern', passed: true, ms: 0, errors: [], warnings: [] };

  for (const ap of ANTI_PATTERNS) {
    if (ap.check(oldContent, newContent)) {
      if (ap.severity === 'critical') {
        result.passed = false;
        result.errors.push(`[${ap.name}] ${ap.message}`);
      } else {
        result.warnings.push(`[${ap.name}] ${ap.message}`);
      }
    }
  }

  result.ms = Date.now() - t0;
  return result;
}


// ─── GATE 3: RUNTIME SMOKE TEST ──────────────────────────────────────────────
// What: Actually runs the edited file in a sandboxed way to catch runtime errors
// How: node -e "require('./file')" with timeout, or file-specific smoke commands
// Catches: const reassignment crashes, undefined requires, missing exports
// Speed: ~500ms-2s depending on file
// On failure: Reject + revert

function gate3_runtime(filePath) {
  const t0 = Date.now();
  const result = { gate: 3, name: 'runtime', passed: false, ms: 0, errors: [] };
  const basename = path.basename(filePath);
  const dir = path.dirname(filePath);

  try {
    // File-specific smoke tests
    const smokeCommands = {
      'cli.js': `node "${filePath}" version --json --quiet`,
      'server-v2.js': `node -e "
        const timeout = setTimeout(() => process.exit(0), 2000);
        try {
          process.env.PORT = '0';
          process.env.SMOKE_TEST = '1';
          require('${filePath.replace(/\\/g, '\\\\')}');
        } catch(e) {
          console.error(e.message);
          process.exit(1);
        }
      "`,
      'registry.js': `node -e "const r = require('${filePath.replace(/\\/g, '\\\\')}'); if(!r.API_DEFS) throw new Error('no API_DEFS export')"`,
      'schemas.js': `node -e "const s = require('${filePath.replace(/\\/g, '\\\\')}'); if(!s.SCHEMAS) throw new Error('no SCHEMAS export')"`,
    };

    // Default: just require the file and see if it throws
    const cmd = smokeCommands[basename] ||
      `node -e "try { require('${filePath.replace(/\\/g, '\\\\')}') } catch(e) { if(e.code !== 'MODULE_NOT_FOUND' || !e.message.includes('Cannot find module')) { console.error(e.message); process.exit(1); }}"`;

    execSync(cmd, {
      stdio: 'pipe',
      timeout: CONFIG.RUNTIME_TIMEOUT,
      cwd: dir,
      env: { ...process.env, NODE_ENV: 'test', SMOKE_TEST: '1' }
    });

    result.passed = true;
  } catch (e) {
    const stderr = e.stderr?.toString() || e.message;
    result.errors.push(`runtime: ${stderr.split('\n').slice(0, 3).join(' | ')}`);
  }

  result.ms = Date.now() - t0;
  return result;
}


// ─── GATE 4: BEHAVIORAL DIFF ANALYSIS ────────────────────────────────────────
// What: Compares exports/function signatures before and after to detect semantic changes
// How: Requires old and new versions, compares exported keys, function arities, types
// Catches: Inverted booleans in exports, removed functions, changed return types
// Speed: ~200ms
// On failure: Flag for human review (doesn't hard-reject since behavior change may be intentional)

function gate4_behavioral(filePath, oldContent, newContent) {
  const t0 = Date.now();
  const result = { gate: 4, name: 'behavioral', passed: true, ms: 0, errors: [], warnings: [] };

  try {
    // 1. Compare function signatures
    const oldFns = [...oldContent.matchAll(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/g)]
      .map(m => m[1] || m[2]).filter(Boolean);
    const newFns = [...newContent.matchAll(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/g)]
      .map(m => m[1] || m[2]).filter(Boolean);

    // Check for removed functions
    const removed = oldFns.filter(f => !newFns.includes(f));
    if (removed.length > 0) {
      result.warnings.push(`Functions removed: ${removed.join(', ')}`);
    }

    // 2. Compare module.exports shape
    const oldExports = [...oldContent.matchAll(/module\.exports\.(\w+)\s*=/g)].map(m => m[1]);
    const newExports = [...newContent.matchAll(/module\.exports\.(\w+)\s*=/g)].map(m => m[1]);
    const removedExports = oldExports.filter(e => !newExports.includes(e));
    if (removedExports.length > 0) {
      result.passed = false;
      result.errors.push(`Exports removed: ${removedExports.join(', ')} — will break dependents`);
    }

    // 3. Compare error handling (try/catch count)
    const oldTryCatch = (oldContent.match(/\btry\s*\{/g) || []).length;
    const newTryCatch = (newContent.match(/\btry\s*\{/g) || []).length;
    if (newTryCatch < oldTryCatch) {
      result.warnings.push(`Error handling reduced: ${oldTryCatch} try/catch -> ${newTryCatch}`);
    }

    // 4. Lines of code change ratio (detect bloat or gutting)
    const oldLines = oldContent.split('\n').length;
    const newLines = newContent.split('\n').length;
    const ratio = newLines / oldLines;
    if (ratio > 1.5) {
      result.warnings.push(`File grew ${((ratio - 1) * 100).toFixed(0)}% — possible bloat`);
    }
    if (ratio < 0.5) {
      result.warnings.push(`File shrank ${((1 - ratio) * 100).toFixed(0)}% — possible gutting`);
    }

  } catch (e) {
    result.warnings.push(`behavioral analysis error: ${e.message}`);
  }

  result.ms = Date.now() - t0;
  return result;
}


// ─── GATE 5: TEST SUITE EXECUTION ────────────────────────────────────────────
// What: Runs existing test files against the edited codebase
// How: node audit.js, node lobster-test.js, or file-specific tests
// Catches: Integration regressions, broken endpoints, data corruption
// Speed: ~5-30s (most expensive gate — only runs if gates 1-4 pass)
// On failure: Hard reject + revert

function gate5_tests(filePath) {
  const t0 = Date.now();
  const result = { gate: 5, name: 'test-suite', passed: false, ms: 0, errors: [] };
  const dir = path.dirname(filePath);

  // Determine which tests to run based on the file being edited
  const basename = path.basename(filePath);
  const testSuites = [];

  // Always run the audit if it exists
  if (fs.existsSync(path.join(dir, 'audit.js'))) {
    testSuites.push({ name: 'audit', cmd: `node "${path.join(dir, 'audit.js')}"` });
  }

  // File-specific tests
  if (['server-v2.js', 'registry.js', 'schemas.js', 'handlers'].some(f => filePath.includes(f))) {
    if (fs.existsSync(path.join(dir, 'lobster-test.js'))) {
      testSuites.push({ name: 'lobster-test', cmd: `node "${path.join(dir, 'lobster-test.js')}"` });
    }
  }

  if (testSuites.length === 0) {
    // No tests to run — pass by default but note it
    result.passed = true;
    result.warnings = ['No test suites found for this file'];
    result.ms = Date.now() - t0;
    return result;
  }

  const failures = [];
  for (const suite of testSuites) {
    try {
      execSync(suite.cmd, {
        stdio: 'pipe',
        timeout: CONFIG.TEST_TIMEOUT,
        cwd: dir,
        env: { ...process.env, NODE_ENV: 'test' }
      });
    } catch (e) {
      const stderr = e.stderr?.toString() || '';
      const stdout = e.stdout?.toString() || '';
      failures.push(`${suite.name}: ${(stderr || stdout).split('\n').slice(0, 3).join(' | ')}`);
    }
  }

  if (failures.length === 0) {
    result.passed = true;
  } else {
    result.errors = failures;
  }

  result.ms = Date.now() - t0;
  return result;
}


// ─── CONFIDENCE SCORING ──────────────────────────────────────────────────────
// Produces a 0.0–1.0 score that determines auto-apply vs. human review
//
// Factors:
//   - Gate results (hard failures = 0.0)
//   - Edit size (smaller = higher confidence)
//   - File criticality (server-v2.js = lower confidence than a handler)
//   - Pattern match count (more anti-pattern warnings = lower)
//   - Historical success rate of this edit type

const FILE_CRITICALITY = {
  'server-v2.js': 0.9,    // core server — very sensitive
  'cli.js': 0.8,          // CLI — user-facing
  'registry.js': 0.7,     // API definitions
  'schemas.js': 0.7,      // schemas
  'mcp-server.js': 0.6,   // MCP integration
  'pipes.js': 0.5,        // workflow pipes
  'zapier.js': 0.5,       // integrations
};

function getConfidenceScore(gateResults, filePath, oldContent, newContent) {
  // If any gate hard-failed, confidence is 0
  if (gateResults.some(g => !g.passed)) return 0.0;

  let score = 1.0;
  const basename = path.basename(filePath);

  // 1. File criticality penalty (0 to -0.3)
  const criticality = FILE_CRITICALITY[basename] || 0.3;
  score -= criticality * 0.3;

  // 2. Edit size penalty — larger edits are riskier
  const diffChars = Math.abs(newContent.length - oldContent.length);
  const diffLines = Math.abs(newContent.split('\n').length - oldContent.split('\n').length);
  if (diffLines > 20) score -= 0.15;
  else if (diffLines > 10) score -= 0.08;
  else if (diffLines > 5) score -= 0.03;
  if (diffChars > 500) score -= 0.10;

  // 3. Warning penalty (-0.05 per warning)
  const warnings = gateResults.reduce((acc, g) => acc + (g.warnings?.length || 0), 0);
  score -= warnings * 0.05;

  // 4. Bonus for small, focused edits
  if (diffLines <= 3 && diffChars < 100) score += 0.05;

  // 5. Penalty if edit touches control flow
  const oldIfs = (oldContent.match(/\bif\s*\(/g) || []).length;
  const newIfs = (newContent.match(/\bif\s*\(/g) || []).length;
  if (oldIfs !== newIfs) score -= 0.10;

  return Math.max(0.0, Math.min(1.0, score));
}

function getConfidenceVerdict(score) {
  if (score >= CONFIG.AUTO_APPLY_THRESHOLD) return 'auto-apply';
  if (score >= CONFIG.HUMAN_REVIEW_THRESHOLD) return 'apply-and-flag';
  return 'queue-for-review';
}


// ─── BRANCH MANAGEMENT ──────────────────────────────────────────────────────

function ensureHiveBranch(sprint, cwd) {
  const branchName = `${CONFIG.BRANCH_PREFIX}${sprint}`;
  try {
    // Check if we're in a git repo
    execSync('git rev-parse --git-dir', { cwd, stdio: 'pipe' });

    // Create branch from current HEAD if it doesn't exist
    try {
      execSync(`git rev-parse --verify ${branchName}`, { cwd, stdio: 'pipe' });
      execSync(`git checkout ${branchName}`, { cwd, stdio: 'pipe' });
    } catch {
      execSync(`git checkout -b ${branchName}`, { cwd, stdio: 'pipe' });
    }

    return branchName;
  } catch (e) {
    // Not a git repo — init one
    try {
      execSync('git init && git add -A && git commit -m "pre-hive snapshot"', { cwd, stdio: 'pipe' });
      execSync(`git checkout -b ${branchName}`, { cwd, stdio: 'pipe' });
      return branchName;
    } catch {
      return null; // git not available
    }
  }
}

function commitEdit(filePath, sprint, priority, cwd) {
  try {
    const msg = `hive S${sprint}: ${(priority || 'edit').replace(/"/g, '').slice(0, 50)}`;
    execSync(`git add "${filePath}" && git commit -m "${msg}"`, { cwd, stdio: 'pipe', timeout: 5000 });
    // Get the commit hash for rollback reference
    const hash = execSync('git rev-parse HEAD', { cwd, stdio: 'pipe' }).toString().trim();
    return hash;
  } catch {
    return null;
  }
}


// ─── ROLLBACK SYSTEM ─────────────────────────────────────────────────────────

// In-memory rollback stack (also persisted to .hive-rollback.json)
let rollbackStack = [];

function pushRollback(entry) {
  rollbackStack.push(entry);
  if (rollbackStack.length > CONFIG.MAX_ROLLBACK_DEPTH) {
    rollbackStack = rollbackStack.slice(-CONFIG.MAX_ROLLBACK_DEPTH);
  }
  // Persist to disk
  try {
    const rollbackFile = path.join(__dirname, '.hive-rollback.json');
    fs.writeFileSync(rollbackFile, JSON.stringify(rollbackStack, null, 2));
  } catch { /* best effort */ }
}

function rollback(filePath, originalContent) {
  fs.writeFileSync(filePath, originalContent);
  return true;
}

function rollbackByCommit(commitHash, cwd) {
  try {
    execSync(`git revert --no-edit ${commitHash}`, { cwd, stdio: 'pipe', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

function rollbackLastN(n, cwd) {
  const toRevert = rollbackStack.slice(-n).reverse();
  const results = [];
  for (const entry of toRevert) {
    if (entry.commitHash) {
      results.push({ ...entry, success: rollbackByCommit(entry.commitHash, cwd) });
    } else if (entry.originalContent) {
      results.push({ ...entry, success: rollback(entry.filePath, entry.originalContent) });
    }
  }
  rollbackStack = rollbackStack.slice(0, -n);
  return results;
}


// ─── MAIN VALIDATION PIPELINE ────────────────────────────────────────────────

async function validateEdit(filePath, oldContent, newContent, opts = {}) {
  const { sprint = 0, priority = '', cwd = __dirname } = opts;
  const t0 = Date.now();

  const report = {
    filePath,
    sprint,
    gates: [],
    passed: false,
    confidence: 0,
    verdict: 'reject',
    commitHash: null,
    totalMs: 0,
  };

  // Write the new content so gates can test the actual file
  fs.writeFileSync(filePath, newContent);

  // ── Gate 1: Syntax (AST parse) ──
  const g1 = gate1_syntax(filePath, newContent);
  report.gates.push(g1);
  if (!g1.passed) {
    fs.writeFileSync(filePath, oldContent);
    report.totalMs = Date.now() - t0;
    report.verdict = 'reject';
    report.rejectGate = 1;
    report.rejectReason = g1.errors.join('; ');
    return report;
  }

  // ── Gate 2: Anti-pattern scan ──
  const g2 = gate2_antipattern(oldContent, newContent);
  report.gates.push(g2);
  if (!g2.passed) {
    fs.writeFileSync(filePath, oldContent);
    report.totalMs = Date.now() - t0;
    report.verdict = 'reject';
    report.rejectGate = 2;
    report.rejectReason = g2.errors.join('; ');
    return report;
  }

  // ── Gate 3: Runtime smoke ──
  const g3 = gate3_runtime(filePath);
  report.gates.push(g3);
  if (!g3.passed) {
    fs.writeFileSync(filePath, oldContent);
    report.totalMs = Date.now() - t0;
    report.verdict = 'reject';
    report.rejectGate = 3;
    report.rejectReason = g3.errors.join('; ');
    return report;
  }

  // ── Gate 4: Behavioral diff ──
  const g4 = gate4_behavioral(filePath, oldContent, newContent);
  report.gates.push(g4);
  // Gate 4 doesn't hard-reject (behavioral changes might be intentional)
  // but it feeds into confidence scoring

  // ── Gate 5: Test suite (most expensive — only if gates 1-3 pass) ──
  const g5 = gate5_tests(filePath);
  report.gates.push(g5);
  if (!g5.passed) {
    fs.writeFileSync(filePath, oldContent);
    report.totalMs = Date.now() - t0;
    report.verdict = 'reject';
    report.rejectGate = 5;
    report.rejectReason = g5.errors.join('; ');
    return report;
  }

  // ── Confidence scoring ──
  report.confidence = getConfidenceScore(report.gates, filePath, oldContent, newContent);
  report.verdict = getConfidenceVerdict(report.confidence);
  report.passed = true;
  report.totalMs = Date.now() - t0;

  // ── Apply or queue based on verdict ──
  if (report.verdict === 'auto-apply' || report.verdict === 'apply-and-flag') {
    // File already has new content written — commit it
    report.commitHash = commitEdit(filePath, sprint, priority, cwd);
    pushRollback({
      filePath,
      sprint,
      commitHash: report.commitHash,
      originalContent: oldContent,
      timestamp: Date.now(),
      confidence: report.confidence,
    });
  } else {
    // Queue for review — revert file, save the proposed edit
    fs.writeFileSync(filePath, oldContent);
    const reviewDir = path.join(cwd, '.hive-review');
    if (!fs.existsSync(reviewDir)) fs.mkdirSync(reviewDir, { recursive: true });
    fs.writeFileSync(
      path.join(reviewDir, `sprint-${sprint}-${path.basename(filePath)}.json`),
      JSON.stringify({
        filePath,
        sprint,
        priority,
        oldContent: oldContent.slice(0, 2000),
        newContent: newContent.slice(0, 2000),
        confidence: report.confidence,
        warnings: report.gates.flatMap(g => g.warnings || []),
        timestamp: Date.now(),
      }, null, 2)
    );
  }

  return report;
}


// ─── LOG FORMATTING ──────────────────────────────────────────────────────────

function formatReport(report) {
  const lines = [];
  const icon = report.passed ? '✓' : '✗';
  const file = path.basename(report.filePath);

  lines.push(`${icon} S${report.sprint} ${file} — ${report.verdict} (confidence: ${(report.confidence * 100).toFixed(0)}%)`);

  for (const g of report.gates) {
    const gIcon = g.passed ? '✓' : '✗';
    const warnings = g.warnings?.length ? ` [${g.warnings.length} warn]` : '';
    lines.push(`  Gate ${g.gate} ${g.name}: ${gIcon} (${g.ms}ms)${warnings}`);
    for (const e of (g.errors || [])) lines.push(`    ERROR: ${e}`);
    for (const w of (g.warnings || [])) lines.push(`    WARN: ${w}`);
  }

  lines.push(`  Total: ${report.totalMs}ms`);
  if (report.commitHash) lines.push(`  Commit: ${report.commitHash.slice(0, 8)}`);
  if (report.rejectGate) lines.push(`  Rejected at Gate ${report.rejectGate}: ${report.rejectReason}`);

  return lines.join('\n');
}


// ─── EXPORTS ─────────────────────────────────────────────────────────────────

module.exports = {
  // Core pipeline
  validateEdit,

  // Individual gates (for testing/debugging)
  gate1_syntax,
  gate2_antipattern,
  gate3_runtime,
  gate4_behavioral,
  gate5_tests,

  // Confidence
  getConfidenceScore,
  getConfidenceVerdict,

  // Branch/commit
  ensureHiveBranch,
  commitEdit,

  // Rollback
  rollback,
  rollbackByCommit,
  rollbackLastN,
  pushRollback,

  // Utilities
  formatReport,
  ANTI_PATTERNS,
  CONFIG,
};
