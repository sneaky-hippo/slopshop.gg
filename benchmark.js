'use strict';

const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const { performance } = require('perf_hooks');

// ─── Configuration ──────────────────────────────────────────────────────────

const HANDLER_FILES = [
  'handlers/compute.js',
  'handlers/compute-superpowers.js',
  'handlers/compute-hackathon-1.js',
  'handlers/compute-hackathon-2.js',
  'handlers/compute-hackathon-3.js',
  'handlers/compute-hackathon-4.js',
  'handlers/compute-hackathon-5a.js',
  'handlers/compute-hackathon-5b.js',
  'handlers/compute-competitor-1.js',
  'handlers/compute-competitor-2.js',
  'handlers/compute-rapidapi-1.js',
  'handlers/compute-rapidapi-2.js',
  'handlers/compute-rapidapi-3.js',
  'handlers/compute-power-1.js',
  'handlers/compute-power-2.js',
];

const TIMING_ITERATIONS = 10;
const WARN_LATENCY_MS = 50;
const FAIL_LATENCY_MS = 100;
const WORKER_TIMEOUT_MS = 5000;   // 5s max per handler (all 3 tests)
const WORKER_MEMORY_MB = 128;     // 128MB max per worker
const CONCURRENCY = 4;            // Run up to 4 workers in parallel

// ─── Worker Entry Point ─────────────────────────────────────────────────────
// When this file is run as a child process with --worker flag, it tests a
// single handler and sends results back via IPC.

if (process.argv.includes('--worker')) {
  const handlerFile = process.argv[process.argv.indexOf('--file') + 1];
  const handlerName = process.argv[process.argv.indexOf('--name') + 1];

  const mod = require(path.join(__dirname, handlerFile));
  const fn = mod[handlerName];

  if (typeof fn !== 'function') {
    process.send({ error: 'Handler not found or not a function' });
    process.exit(1);
  }

  function safeCallSync(fn, input) {
    try {
      const result = fn(input);
      return result;
    } catch (err) {
      return { _error: true, message: err.message };
    }
  }

  function isError(r) { return r && r._error === true; }
  function isPromise(r) { return r && typeof r.then === 'function'; }

  // Test 1: Default (empty input)
  const defaultResult = safeCallSync(fn, {});
  let defaultTest;
  if (isPromise(defaultResult)) {
    defaultTest = { crashed: false, error: null, hasEngineReal: false, async: true };
  } else {
    const crashed = isError(defaultResult);
    defaultTest = {
      crashed,
      error: crashed ? defaultResult.message : null,
      hasEngineReal: !crashed && defaultResult && defaultResult._engine === 'real',
      async: false,
    };
  }

  // Test 2: Null fields
  const nullResult = safeCallSync(fn, { text: null, data: null });
  let nullTest;
  if (isPromise(nullResult)) {
    nullTest = { crashed: false, error: null, async: true };
  } else {
    const crashed = isError(nullResult);
    nullTest = { crashed, error: crashed ? nullResult.message : null, async: false };
  }

  // Test 3: Timing (only if sync and non-crashing)
  let timingTest;
  if (defaultTest.async || defaultTest.crashed) {
    timingTest = { avgMs: 0, minMs: 0, maxMs: 0, iterations: 0, slow: false, tooSlow: false, async: defaultTest.async };
  } else {
    const times = [];
    for (let i = 0; i < TIMING_ITERATIONS; i++) {
      const start = performance.now();
      safeCallSync(fn, {});
      const end = performance.now();
      times.push(end - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    timingTest = {
      avgMs: Math.round(avg * 1000) / 1000,
      minMs: Math.round(Math.min(...times) * 1000) / 1000,
      maxMs: Math.round(Math.max(...times) * 1000) / 1000,
      iterations: TIMING_ITERATIONS,
      slow: avg > WARN_LATENCY_MS,
      tooSlow: avg > FAIL_LATENCY_MS,
      async: false,
    };
  }

  process.send({ defaultTest, nullTest, timingTest });
  process.exit(0);
}

// ─── Main Process ───────────────────────────────────────────────────────────

function loadHandlerList() {
  const allHandlers = [];
  for (const file of HANDLER_FILES) {
    const fullPath = path.join(__dirname, file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`  [SKIP] File not found: ${file}`);
      continue;
    }
    let mod;
    try {
      mod = require(fullPath);
    } catch (err) {
      console.warn(`  [SKIP] Failed to require ${file}: ${err.message}`);
      continue;
    }
    for (const key of Object.keys(mod)) {
      if (typeof mod[key] === 'function') {
        allHandlers.push({ name: key, file });
      }
    }
  }
  return allHandlers;
}

function testHandler(handler) {
  return new Promise((resolve) => {
    const args = ['--worker', '--file', handler.file, '--name', handler.name];
    const child = fork(__filename, args, {
      execArgv: [`--max-old-space-size=${WORKER_MEMORY_MB}`],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      timeout: WORKER_TIMEOUT_MS,
    });

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill('SIGKILL');
        resolve({
          defaultTest: { crashed: true, error: `Worker timed out after ${WORKER_TIMEOUT_MS}ms (likely infinite loop or OOM)`, hasEngineReal: false, async: false },
          nullTest: { crashed: true, error: 'Skipped due to timeout', async: false },
          timingTest: { avgMs: WORKER_TIMEOUT_MS, minMs: 0, maxMs: 0, iterations: 0, slow: true, tooSlow: true, async: false },
        });
      }
    }, WORKER_TIMEOUT_MS);

    child.on('message', (msg) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        if (msg.error) {
          resolve({
            defaultTest: { crashed: true, error: msg.error, hasEngineReal: false, async: false },
            nullTest: { crashed: true, error: msg.error, async: false },
            timingTest: { avgMs: 0, minMs: 0, maxMs: 0, iterations: 0, slow: false, tooSlow: false, async: false },
          });
        } else {
          resolve(msg);
        }
      }
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          defaultTest: { crashed: true, error: err.message, hasEngineReal: false, async: false },
          nullTest: { crashed: true, error: err.message, async: false },
          timingTest: { avgMs: 0, minMs: 0, maxMs: 0, iterations: 0, slow: false, tooSlow: false, async: false },
        });
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        if (code !== 0) {
          resolve({
            defaultTest: { crashed: true, error: `Worker exited with code ${code} (likely OOM or crash)`, hasEngineReal: false, async: false },
            nullTest: { crashed: true, error: 'Worker crashed', async: false },
            timingTest: { avgMs: 0, minMs: 0, maxMs: 0, iterations: 0, slow: false, tooSlow: false, async: false },
          });
        }
      }
    });
  });
}

async function runBatch(handlers, startIdx) {
  const batch = handlers.slice(startIdx, startIdx + CONCURRENCY);
  return Promise.all(batch.map(h => testHandler(h)));
}

async function main() {
  console.log('='.repeat(72));
  console.log('  SLOPSHOP.GG COMPREHENSIVE HANDLER BENCHMARK');
  console.log('='.repeat(72));
  console.log();

  console.log('Loading handler list...');
  const handlers = loadHandlerList();
  console.log(`Found ${handlers.length} handlers across ${HANDLER_FILES.length} files.`);
  console.log(`Running tests with ${CONCURRENCY} concurrent workers, ${WORKER_TIMEOUT_MS}ms timeout, ${WORKER_MEMORY_MB}MB memory limit each.`);
  console.log();

  const results = [];
  let passCount = 0;
  let failCount = 0;
  const crashedHandlers = [];
  const noEngineHandlers = [];
  const slowHandlers = [];
  const tooSlowHandlers = [];
  const asyncHandlers = [];

  const overallStart = performance.now();

  // Process in batches
  for (let i = 0; i < handlers.length; i += CONCURRENCY) {
    const batch = handlers.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(h => testHandler(h)));

    for (let j = 0; j < batch.length; j++) {
      const h = batch[j];
      const idx = i + j;
      const progress = `[${idx + 1}/${handlers.length}]`;
      const { defaultTest, nullTest, timingTest } = batchResults[j];

      // Track async handlers
      if (defaultTest.async || nullTest.async) {
        asyncHandlers.push({ name: h.name, file: h.file });
      }

      // Determine pass/fail
      const crashed = defaultTest.crashed || nullTest.crashed;
      const compliant = defaultTest.hasEngineReal;
      const isAsync = defaultTest.async;
      const passed = !crashed && (compliant || isAsync) && !timingTest.tooSlow;

      if (passed) passCount++;
      else failCount++;

      // Track issues
      if (defaultTest.crashed) {
        crashedHandlers.push({ name: h.name, file: h.file, error: defaultTest.error, test: 'empty_input' });
      }
      if (nullTest.crashed && !defaultTest.crashed) {
        crashedHandlers.push({ name: h.name, file: h.file, error: nullTest.error, test: 'null_input' });
      }
      if (!defaultTest.crashed && !compliant && !isAsync) {
        noEngineHandlers.push({ name: h.name, file: h.file });
      }
      if (timingTest.slow && !timingTest.async) {
        slowHandlers.push({ name: h.name, file: h.file, avgMs: timingTest.avgMs });
      }
      if (timingTest.tooSlow && !timingTest.async) {
        tooSlowHandlers.push({ name: h.name, file: h.file, avgMs: timingTest.avgMs });
      }

      const issues = [];
      if (defaultTest.crashed) issues.push('CRASH(empty)');
      if (nullTest.crashed && !defaultTest.crashed) issues.push('CRASH(null)');
      if (!compliant && !defaultTest.crashed && !isAsync) issues.push('NO_ENGINE');
      if (isAsync) issues.push('ASYNC');
      if (timingTest.tooSlow) issues.push(`SLOW(${timingTest.avgMs}ms)`);
      else if (timingTest.slow && !timingTest.async) issues.push(`WARN(${timingTest.avgMs}ms)`);

      if (!passed) {
        console.log(`${progress} FAIL  ${h.name}  [${issues.join(', ')}]`);
      } else if (issues.length > 0) {
        console.log(`${progress} PASS* ${h.name}  [${issues.join(', ')}]`);
      }

      results.push({
        name: h.name,
        file: h.file,
        status: passed ? 'PASS' : 'FAIL',
        defaultTest,
        nullTest,
        timingTest,
        issues,
      });
    }

    // Progress indicator every 50 handlers
    if ((i + CONCURRENCY) % 100 < CONCURRENCY) {
      const elapsed = Math.round(performance.now() - overallStart);
      console.log(`  ... ${Math.min(i + CONCURRENCY, handlers.length)}/${handlers.length} tested (${elapsed}ms elapsed)`);
    }
  }

  const overallEnd = performance.now();
  const totalTime = Math.round(overallEnd - overallStart);

  // ─── Summary ────────────────────────────────────────────────────────────

  console.log();
  console.log('='.repeat(72));
  console.log('  RESULTS SUMMARY');
  console.log('='.repeat(72));
  console.log();
  console.log(`  Total handlers tested:  ${handlers.length}`);
  console.log(`  Passed:                 ${passCount}`);
  console.log(`  Failed:                 ${failCount}`);
  console.log(`  Async handlers:         ${asyncHandlers.length} (need network/external deps)`);
  console.log(`  Total benchmark time:   ${totalTime}ms`);
  console.log();

  // Handlers per file
  const fileCounts = {};
  for (const h of handlers) {
    fileCounts[h.file] = (fileCounts[h.file] || 0) + 1;
  }
  console.log('  Handlers per file:');
  for (const [file, count] of Object.entries(fileCounts)) {
    console.log(`    ${file}: ${count}`);
  }
  console.log();

  // Crashed handlers
  if (crashedHandlers.length > 0) {
    console.log('-'.repeat(72));
    console.log(`  CRASHED HANDLERS (${crashedHandlers.length}):`);
    console.log('-'.repeat(72));
    for (const c of crashedHandlers) {
      console.log(`  [${c.test}] ${c.name} (${c.file})`);
      console.log(`    Error: ${c.error}`);
    }
    console.log();
  }

  // Non-compliant handlers (no _engine:'real')
  if (noEngineHandlers.length > 0) {
    console.log('-'.repeat(72));
    console.log(`  NON-COMPLIANT HANDLERS - missing _engine:'real' (${noEngineHandlers.length}):`);
    console.log('-'.repeat(72));
    for (const h of noEngineHandlers) {
      console.log(`    ${h.name} (${h.file})`);
    }
    console.log();
  }

  // Slow handlers (>50ms warning)
  if (slowHandlers.length > 0) {
    console.log('-'.repeat(72));
    console.log(`  SLOW HANDLERS >50ms avg (${slowHandlers.length}):`);
    console.log('-'.repeat(72));
    for (const h of slowHandlers) {
      console.log(`    ${h.name}: ${h.avgMs}ms avg (${h.file})`);
    }
    console.log();
  }

  // Async handlers
  if (asyncHandlers.length > 0) {
    console.log('-'.repeat(72));
    console.log(`  ASYNC HANDLERS - return promises, need network/external deps (${asyncHandlers.length}):`);
    console.log('-'.repeat(72));
    for (const h of asyncHandlers) {
      console.log(`    ${h.name} (${h.file})`);
    }
    console.log();
  }

  // ─── Removal Candidates ──────────────────────────────────────────────────

  const removalSet = new Map();
  for (const c of crashedHandlers) {
    if (!removalSet.has(c.name)) removalSet.set(c.name, { name: c.name, file: c.file, reasons: [] });
    removalSet.get(c.name).reasons.push(`Crashes on ${c.test}: ${c.error}`);
  }
  for (const h of noEngineHandlers) {
    if (!removalSet.has(h.name)) removalSet.set(h.name, { name: h.name, file: h.file, reasons: [] });
    removalSet.get(h.name).reasons.push("Returns without _engine:'real' (non-compliant)");
  }
  for (const h of tooSlowHandlers) {
    if (!removalSet.has(h.name)) removalSet.set(h.name, { name: h.name, file: h.file, reasons: [] });
    removalSet.get(h.name).reasons.push(`Average latency ${h.avgMs}ms exceeds 100ms threshold`);
  }

  if (removalSet.size > 0) {
    console.log('='.repeat(72));
    console.log(`  REMOVAL CANDIDATES (${removalSet.size} handlers):`);
    console.log('  These handlers should be fixed or removed:');
    console.log('='.repeat(72));
    for (const [name, info] of removalSet) {
      console.log(`  ${name} (${info.file})`);
      for (const r of info.reasons) {
        console.log(`    - ${r}`);
      }
    }
    console.log();
  } else {
    console.log('  No handlers flagged for removal.');
    console.log();
  }

  // ─── Save JSON Results ────────────────────────────────────────────────────

  const summary = {
    timestamp: new Date().toISOString(),
    totalHandlers: handlers.length,
    passed: passCount,
    failed: failCount,
    asyncHandlers: asyncHandlers.length,
    totalTimeMs: totalTime,
    handlersPerFile: fileCounts,
    crashedHandlers: crashedHandlers.map(c => ({ name: c.name, file: c.file, test: c.test, error: c.error })),
    nonCompliantHandlers: noEngineHandlers.map(h => ({ name: h.name, file: h.file })),
    slowHandlers: slowHandlers.map(h => ({ name: h.name, file: h.file, avgMs: h.avgMs })),
    tooSlowHandlers: tooSlowHandlers.map(h => ({ name: h.name, file: h.file, avgMs: h.avgMs })),
    removalCandidates: Array.from(removalSet.values()),
    results: results.map(r => ({
      name: r.name,
      file: r.file,
      status: r.status,
      crashed: r.defaultTest.crashed || r.nullTest.crashed,
      hasEngineReal: r.defaultTest.hasEngineReal,
      isAsync: r.defaultTest.async,
      avgMs: r.timingTest.avgMs,
      issues: r.issues,
    })),
  };

  const outPath = path.join(__dirname, 'benchmark-results.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`Results saved to: ${outPath}`);
  console.log();

  // Exit code: 0 if all pass, 1 if any fail
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(2);
});
