const fs = require('fs');
const path = 'C:/Users/user/Desktop/agent-apis/index.html';
let content = fs.readFileSync(path, 'utf-8');

const replacement = `  <!-- Core feature grid — 8 key features -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">

    <div style="background:var(--s1);border:1px solid var(--b);border-left:3px solid var(--g);border-radius:10px;padding:20px">
      <div style="font-family:var(--mono);font-size:0.82rem;font-weight:700;color:var(--g);margin-bottom:6px">Free Persistent Memory</div>
      <div style="font-size:0.75rem;color:var(--t3);line-height:1.6">Key-value, queues, counters, namespaces, semantic search. Always free &mdash; 0 credits.</div>
      <div style="font-family:var(--mono);font-size:0.6rem;color:var(--t4);margin-top:8px">20 endpoints</div>
    </div>
    <div style="background:var(--s1);border:1px solid var(--b);border-left:3px solid var(--r);border-radius:10px;padding:20px">
      <div style="font-family:var(--mono);font-size:0.82rem;font-weight:700;color:var(--r);margin-bottom:6px">Agent Chaining</div>
      <div style="font-size:0.75rem;color:var(--t3);line-height:1.6">Chain Claude &rarr; Grok &rarr; GPT in infinite loops. Context passes automatically.</div>
      <div style="font-family:var(--mono);font-size:0.6rem;color:var(--t4);margin-top:8px">5 endpoints</div>
    </div>
    <div style="background:var(--s1);border:1px solid var(--b);border-left:3px solid var(--o);border-radius:10px;padding:20px">
      <div style="font-family:var(--mono);font-size:0.82rem;font-weight:700;color:var(--o);margin-bottom:6px">10K Parallel Agents</div>
      <div style="font-size:0.75rem;color:var(--t3);line-height:1.6">Parallel deploy, survey mode, Monte Carlo, Merkle verification.</div>
      <div style="font-family:var(--mono);font-size:0.6rem;color:var(--t4);margin-top:8px">8 endpoints</div>
    </div>
    <div style="background:var(--s1);border:1px solid var(--b);border-left:3px solid var(--c);border-radius:10px;padding:20px">
      <div style="font-family:var(--mono);font-size:0.82rem;font-weight:700;color:var(--c);margin-bottom:6px">Hive Workspace</div>
      <div style="font-size:0.75rem;color:var(--t3);line-height:1.6">Always-on agent collaboration. Channels, standups, state sync.</div>
      <div style="font-family:var(--mono);font-size:0.6rem;color:var(--t4);margin-top:8px">10 endpoints</div>
    </div>
    <div style="background:var(--s1);border:1px solid var(--b);border-left:3px solid var(--v);border-radius:10px;padding:20px">
      <div style="font-family:var(--mono);font-size:0.82rem;font-weight:700;color:var(--v);margin-bottom:6px">Smart Tool Discovery</div>
      <div style="font-size:0.75rem;color:var(--t3);line-height:1.6">Semantic search, AI recommendations, category browse, compare.</div>
      <div style="font-family:var(--mono);font-size:0.6rem;color:var(--t4);margin-top:8px">8 endpoints</div>
    </div>
    <div style="background:var(--s1);border:1px solid var(--b);border-left:3px solid var(--o);border-radius:10px;padding:20px">
      <div style="font-family:var(--mono);font-size:0.82rem;font-weight:700;color:var(--o);margin-bottom:6px">Streaming &amp; Batch</div>
      <div style="font-size:0.75rem;color:var(--t3);line-height:1.6">SSE streaming, batch 50 calls, dry-run cost preview.</div>
      <div style="font-family:var(--mono);font-size:0.6rem;color:var(--t4);margin-top:8px">3 endpoints</div>
    </div>
    <div style="background:var(--s1);border:1px solid var(--b);border-left:3px solid var(--c);border-radius:10px;padding:20px">
      <div style="font-family:var(--mono);font-size:0.82rem;font-weight:700;color:var(--c);margin-bottom:6px">Enterprise</div>
      <div style="font-size:0.75rem;color:var(--t3);line-height:1.6">Teams RBAC, analytics, webhooks, rate limits, budget caps.</div>
      <div style="font-family:var(--mono);font-size:0.6rem;color:var(--t4);margin-top:8px">19 endpoints</div>
    </div>
    <div style="background:var(--s1);border:1px solid var(--b);border-left:3px solid var(--g);border-radius:10px;padding:20px">
      <div style="font-family:var(--mono);font-size:0.82rem;font-weight:700;color:var(--g);margin-bottom:6px">Self-Hostable</div>
      <div style="font-size:0.75rem;color:var(--t3);line-height:1.6">Run the full platform on your hardware. Zero external dependencies for compute APIs.</div>
      <div style="font-family:var(--mono);font-size:0.6rem;color:var(--t4);margin-top:8px">npm install &amp;&amp; node server-v2.js</div>
    </div>

  </div>

  <div style="text-align:center;margin-top:24px">
    <a href="/docs" style="font-family:var(--mono);font-size:0.82rem;color:var(--r);font-weight:600;padding:10px 20px;border:1px solid rgba(255,51,51,0.2);border-radius:8px;display:inline-block;transition:0.15s">See all 22 features &rarr;</a>
  </div>
</div>`;

const oldStart = '  <!-- Compact feature grid';
const startIdx = content.indexOf(oldStart);
if (startIdx === -1) { console.log('ERROR: start marker not found'); process.exit(1); }

const fullDocIdx = content.indexOf('Full Documentation', startIdx);
if (fullDocIdx === -1) { console.log('ERROR: Full Documentation not found'); process.exit(1); }

// Find the closing </div>\n</div> after Full Documentation
const endSearch = content.substring(fullDocIdx);
const endPattern = '</div>\n</div>';
const endOffset = endSearch.indexOf(endPattern) + endPattern.length;
const endIdx = fullDocIdx + endOffset;

console.log('Replacing chars', startIdx, 'to', endIdx, '(', endIdx - startIdx, 'chars)');

const newContent = content.substring(0, startIdx) + replacement + content.substring(endIdx);
fs.writeFileSync(path, newContent, 'utf-8');
console.log('Feature grid replaced successfully');
