'use strict';
const crypto = require('crypto');

const handlers = {

  // ─── STRUCTURED OUTPUT & SCHEMA ───────────────────────────
  'schema-enforce': ({data, schema}) => {
    const d = data || {}; const s = schema || {type:'object',required:[],properties:{}};
    const errors = [];
    if (s.required) s.required.forEach(r => { if (d[r] === undefined) errors.push({path:r, error:'required field missing'}); });
    if (s.properties) Object.entries(s.properties).forEach(([k,v]) => {
      if (d[k] !== undefined && v.type) {
        const actual = Array.isArray(d[k]) ? 'array' : typeof d[k];
        if (actual !== v.type && !(v.type === 'integer' && typeof d[k] === 'number' && Number.isInteger(d[k])))
          errors.push({path:k, error:'expected '+v.type+' got '+actual});
        if (v.type === 'string' && v.pattern && !new RegExp(v.pattern).test(d[k]))
          errors.push({path:k, error:'does not match pattern '+v.pattern});
        if (v.type === 'number' && v.minimum !== undefined && d[k] < v.minimum)
          errors.push({path:k, error:'below minimum '+v.minimum});
        if (v.type === 'number' && v.maximum !== undefined && d[k] > v.maximum)
          errors.push({path:k, error:'above maximum '+v.maximum});
        if (v.type === 'string' && v.minLength && d[k].length < v.minLength)
          errors.push({path:k, error:'shorter than minLength '+v.minLength});
        if (v.type === 'string' && v.maxLength && d[k].length > v.maxLength)
          errors.push({path:k, error:'longer than maxLength '+v.maxLength});
        if (v.enum && !v.enum.includes(d[k]))
          errors.push({path:k, error:'not in enum ['+v.enum.join(',')+']'});
      }
    });
    return {_engine:'real', valid:errors.length===0, errors, error_count:errors.length, data:d};
  },

  'schema-generate-from-sample': ({samples}) => {
    const ss = samples || [{}];
    const schema = {type:'object', properties:{}, required:[]};
    const allKeys = new Set();
    const keyTypes = {};
    ss.forEach(s => {
      Object.entries(s).forEach(([k,v]) => {
        allKeys.add(k);
        const t = Array.isArray(v)?'array':v===null?'null':typeof v;
        if(!keyTypes[k]) keyTypes[k] = new Set();
        keyTypes[k].add(t);
      });
    });
    const keysInAll = [...allKeys].filter(k => ss.every(s => s[k] !== undefined));
    schema.required = keysInAll;
    allKeys.forEach(k => {
      const types = [...(keyTypes[k]||['string'])];
      schema.properties[k] = {type: types.length===1?types[0]:'string'};
    });
    return {_engine:'real', schema, sample_count:ss.length, fields:[...allKeys].length};
  },

  'structured-output-repair': ({text}) => {
    let t = text || '';
    // Common JSON repairs
    t = t.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'); // trailing commas
    t = t.replace(/'/g, '"'); // single to double quotes
    t = t.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":'); // unquoted keys
    t = t.replace(/:\s*'([^']*)'/g, ': "$1"'); // single-quoted values
    t = t.replace(/\n/g, '\\n').replace(/\t/g, '\\t'); // escape newlines in strings
    // Try to extract JSON from surrounding text
    const match = t.match(/[{[]([\s\S]*)[}\]]/);
    if (match) t = t.slice(t.indexOf(match[0]));
    let parsed = null; let success = false;
    try { parsed = JSON.parse(t); success = true; } catch(e) {
      // Try wrapping in braces
      try { parsed = JSON.parse('{'+t+'}'); success = true; } catch(e2) {}
    }
    return {_engine:'real', repaired: success, result: parsed, repaired_text: success?JSON.stringify(parsed,null,2):t, original_length:(text||'').length};
  },

  // ─── CONTEXT WINDOW MANAGEMENT ────────────────────────────
  'context-window-estimate': ({text, model}) => {
    const t = text || '';
    // Rough tokenizer: ~4 chars per token for English
    const charCount = t.length;
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    const estimates = {
      'gpt-4': Math.ceil(charCount/4),
      'gpt-4o': Math.ceil(charCount/3.8),
      'claude-3': Math.ceil(charCount/3.9),
      'claude-4': Math.ceil(charCount/3.9),
      'llama-3': Math.ceil(charCount/4.1),
    };
    const modelLimits = {'gpt-4':128000,'gpt-4o':128000,'claude-3':200000,'claude-4':200000,'llama-3':128000};
    const m = model || 'claude-4';
    const est = estimates[m] || Math.ceil(charCount/4);
    const limit = modelLimits[m] || 128000;
    return {_engine:'real', estimated_tokens:est, model:m, context_limit:limit, remaining:limit-est, utilization:Math.round(est/limit*10000)/100, chars:charCount, words:wordCount};
  },

  'context-window-summarize': ({messages, max_tokens, keep_recent}) => {
    const msgs = messages || [];
    const mt = max_tokens || 4000;
    const kr = keep_recent || 5;
    const recent = msgs.slice(-kr);
    const old = msgs.slice(0, -kr);
    // Estimate tokens per message (~4 chars/token)
    const recentTokens = recent.reduce((s,m) => s + Math.ceil((m.content||m||'').length/4), 0);
    const budget = mt - recentTokens;
    // Compress old messages
    const oldText = old.map(m => m.content||m||'').join(' ');
    const words = oldText.split(/\s+/);
    const targetWords = Math.max(50, Math.floor(budget));
    const summary = words.slice(0, targetWords).join(' ') + (words.length > targetWords ? '...' : '');
    const result = [{role:'system', content:'[Summary of '+old.length+' earlier messages]: '+summary}, ...recent];
    return {_engine:'real', compressed:result, original_count:msgs.length, compressed_count:result.length, estimated_tokens:Math.ceil(JSON.stringify(result).length/4), budget:mt};
  },

  // ─── DATA OPERATIONS ──────────────────────────────────────
  'data-schema-map': ({source_schema, target_schema, source_data}) => {
    const ss = source_schema || {}; const ts = target_schema || {}; const sd = source_data || {};
    const sourceKeys = Object.keys(ss.properties||ss); const targetKeys = Object.keys(ts.properties||ts);
    // Auto-map by name similarity
    const mapping = {};
    targetKeys.forEach(tk => {
      const match = sourceKeys.find(sk => sk.toLowerCase() === tk.toLowerCase()) ||
        sourceKeys.find(sk => sk.toLowerCase().includes(tk.toLowerCase()) || tk.toLowerCase().includes(sk.toLowerCase()));
      if (match) mapping[match] = tk;
    });
    const mapped = {};
    Object.entries(mapping).forEach(([from,to]) => { if(sd[from]!==undefined) mapped[to] = sd[from]; });
    return {_engine:'real', mapping, mapped_data:mapped, unmapped_source:sourceKeys.filter(k=>!mapping[k]), unmapped_target:targetKeys.filter(k=>!Object.values(mapping).includes(k))};
  },

  'csv-query': ({csv, query}) => {
    // Parse CSV
    const lines = (csv||'').split('\n').filter(l=>l.trim());
    if(lines.length<2) return {_engine:'real', error:'Need header + data rows', rows:[]};
    const headers = lines[0].split(',').map(h=>h.trim().replace(/"/g,''));
    const data = lines.slice(1).map(l => {
      const vals = l.split(',').map(v=>v.trim().replace(/"/g,''));
      return Object.fromEntries(headers.map((h,i)=>[h, isNaN(vals[i])?vals[i]:Number(vals[i])]));
    });
    // Simple query parser
    const q = (query||'').toLowerCase();
    let result = data;
    // WHERE clause
    const whereMatch = q.match(/where\s+(\w+)\s*(=|>|<|>=|<=|!=|contains)\s*['"]?([^'"]+)['"]?/i);
    if(whereMatch) {
      const [_,field,op,val] = whereMatch;
      result = result.filter(r => {
        const v = r[field]; const cv = isNaN(val)?val:Number(val);
        if(op==='='||op==='==') return v==cv;
        if(op==='>') return v>cv; if(op==='<') return v<cv;
        if(op==='>=') return v>=cv; if(op==='<=') return v<=cv;
        if(op==='!=') return v!=cv;
        if(op==='contains') return String(v).includes(String(cv));
        return true;
      });
    }
    // ORDER BY
    const orderMatch = q.match(/order\s+by\s+(\w+)\s*(asc|desc)?/i);
    if(orderMatch) {
      const [_,field,dir] = orderMatch;
      result.sort((a,b) => dir==='desc'?String(b[field]).localeCompare(String(a[field])):String(a[field]).localeCompare(String(b[field])));
    }
    // LIMIT
    const limitMatch = q.match(/limit\s+(\d+)/i);
    if(limitMatch) result = result.slice(0, Number(limitMatch[1]));
    return {_engine:'real', rows:result, count:result.length, columns:headers};
  },

  'data-join': ({left, right, left_key, right_key, join_type}) => {
    const l = left||[]; const r = right||[]; const lk = left_key||'id'; const rk = right_key||'id';
    const jt = join_type || 'inner';
    const rMap = {};
    r.forEach(row => { const k=row[rk]; if(!rMap[k])rMap[k]=[]; rMap[k].push(row); });
    const results = [];
    l.forEach(lRow => {
      const matches = rMap[lRow[lk]] || [];
      if(matches.length) matches.forEach(rRow => results.push({...lRow,...rRow}));
      else if(jt==='left'||jt==='full') results.push({...lRow});
    });
    if(jt==='right'||jt==='full') {
      const lKeys = new Set(l.map(row=>row[lk]));
      r.filter(row=>!lKeys.has(row[rk])).forEach(row=>results.push({...row}));
    }
    return {_engine:'real', rows:results, count:results.length, join_type:jt, left_count:l.length, right_count:r.length};
  },

  'data-validate-row': ({data, rules}) => {
    const d = data||[]; const rs = rules||[];
    const errors = [];
    d.forEach((row,i) => {
      rs.forEach(r => {
        const val = row[r.field];
        if(r.required && (val===undefined||val===null||val==='')) errors.push({row:i,field:r.field,error:'required'});
        if(r.type && val!==undefined && typeof val!==r.type) errors.push({row:i,field:r.field,error:'expected '+r.type});
        if(r.min!==undefined && val<r.min) errors.push({row:i,field:r.field,error:'below min '+r.min});
        if(r.max!==undefined && val>r.max) errors.push({row:i,field:r.field,error:'above max '+r.max});
        if(r.pattern && !new RegExp(r.pattern).test(String(val||''))) errors.push({row:i,field:r.field,error:'pattern mismatch'});
      });
    });
    return {_engine:'real', valid:errors.length===0, errors, error_count:errors.length, rows_checked:d.length, rules_applied:rs.length};
  },

  // ─── DIFF & MERGE ─────────────────────────────────────────
  'diff-three-way': ({base, ours, theirs}) => {
    const bLines = (base||'').split('\n'); const oLines = (ours||'').split('\n'); const tLines = (theirs||'').split('\n');
    const merged = []; const conflicts = [];
    const maxLen = Math.max(bLines.length, oLines.length, tLines.length);
    for(let i=0;i<maxLen;i++) {
      const b=bLines[i]||''; const o=oLines[i]||''; const t=tLines[i]||'';
      if(o===t) merged.push(o);
      else if(o===b) merged.push(t);
      else if(t===b) merged.push(o);
      else { conflicts.push({line:i,ours:o,theirs:t,base:b}); merged.push('<<<<<<< OURS\n'+o+'\n=======\n'+t+'\n>>>>>>> THEIRS'); }
    }
    return {_engine:'real', merged:merged.join('\n'), conflicts, conflict_count:conflicts.length, clean:conflicts.length===0};
  },

  'diff-patch-apply': ({source, patch}) => {
    const lines = (source||'').split('\n');
    const ops = patch || [];
    const result = [...lines];
    // Apply ops in reverse to preserve line numbers
    [...ops].sort((a,b)=>b.line-a.line).forEach(op => {
      if(op.type==='add') result.splice(op.line,0,op.text);
      if(op.type==='remove') result.splice(op.line,1);
      if(op.type==='replace') result[op.line]=op.text;
    });
    return {_engine:'real', result:result.join('\n'), ops_applied:ops.length, lines_before:lines.length, lines_after:result.length};
  },

  // ─── WORKFLOW ENGINE PRIMITIVES ───────────────────────────
  'workflow-state-machine': ({states, transitions, current_state, event}) => {
    const ss = states||['idle','running','done','error'];
    const ts = transitions||[{from:'idle',event:'start',to:'running'},{from:'running',event:'complete',to:'done'},{from:'running',event:'fail',to:'error'}];
    const curr = current_state||ss[0]; const evt = event||'';
    const match = ts.find(t=>t.from===curr&&t.event===evt);
    const newState = match?match.to:curr;
    const available = ts.filter(t=>t.from===newState).map(t=>t.event);
    return {_engine:'real', previous_state:curr, event:evt, current_state:newState, transitioned:!!match, available_events:available, all_states:ss};
  },

  'dag-topological-sort': ({tasks}) => {
    const ts = tasks||[{id:'a',deps:[]},{id:'b',deps:['a']},{id:'c',deps:['a']},{id:'d',deps:['b','c']}];
    const graph = {}; const inDeg = {};
    ts.forEach(t => { graph[t.id]=t.deps||[]; inDeg[t.id]=0; });
    ts.forEach(t => (t.deps||[]).forEach(d => { inDeg[t.id]=(inDeg[t.id]||0)+1; }));
    // Kahn's algorithm
    const queue = ts.filter(t=>inDeg[t.id]===0).map(t=>t.id);
    const order = []; const groups = [];
    while(queue.length) {
      const batch = [...queue]; queue.length = 0;
      groups.push(batch);
      batch.forEach(n => {
        order.push(n);
        ts.forEach(t => { if((t.deps||[]).includes(n)) { inDeg[t.id]--; if(inDeg[t.id]===0) queue.push(t.id); } });
      });
    }
    const hasCycle = order.length < ts.length;
    return {_engine:'real', order, parallel_groups:groups, has_cycle:hasCycle, total_tasks:ts.length};
  },

  'dependency-resolver': ({items}) => {
    const is = items||[{id:'a',deps:[]},{id:'b',deps:['a']},{id:'c',deps:['b']}];
    const resolved = []; const seen = new Set(); const resolving = new Set();
    let cycle = null;
    function resolve(id) {
      if(resolved.includes(id)) return;
      if(resolving.has(id)) { cycle = id; return; }
      resolving.add(id);
      const item = is.find(i=>i.id===id);
      if(item) (item.deps||[]).forEach(d=>resolve(d));
      resolving.delete(id);
      if(!resolved.includes(id)) resolved.push(id);
    }
    is.forEach(i=>resolve(i.id));
    return {_engine:'real', install_order:resolved, cycle_detected:!!cycle, cycle_at:cycle, total:resolved.length};
  },

  'cron-schedule-compute': ({expressions, window_hours}) => {
    const exprs = expressions||['0 * * * *']; const wh = window_hours||24;
    const now = Date.now(); const end = now + wh*3600000;
    // Simple cron: minute hour dom month dow
    function nextRuns(expr, from, until) {
      const parts = expr.split(/\s+/);
      const min = parts[0]==='*'?null:Number(parts[0]);
      const hour = parts[1]==='*'?null:Number(parts[1]);
      const runs = [];
      let t = new Date(from); t.setSeconds(0); t.setMilliseconds(0);
      while(t.getTime()<until && runs.length<100) {
        const matches = (min===null||t.getMinutes()===min)&&(hour===null||t.getHours()===hour);
        if(matches) runs.push(new Date(t).toISOString());
        t = new Date(t.getTime()+60000);
      }
      return runs;
    }
    const schedules = exprs.map(e=>({expression:e, runs:nextRuns(e,now,end)}));
    // Detect conflicts (runs within 1 minute of each other across expressions)
    const allRuns = schedules.flatMap((s,i)=>s.runs.map(r=>({expr:i,time:new Date(r).getTime()})));
    const conflicts = [];
    for(let i=0;i<allRuns.length;i++) for(let j=i+1;j<allRuns.length;j++) {
      if(allRuns[i].expr!==allRuns[j].expr && Math.abs(allRuns[i].time-allRuns[j].time)<60000)
        conflicts.push({expressions:[allRuns[i].expr,allRuns[j].expr],time:new Date(allRuns[i].time).toISOString()});
    }
    return {_engine:'real', schedules, conflicts:conflicts.slice(0,10), total_runs:allRuns.length};
  },

  // ─── GUARDRAILS & SAFETY ──────────────────────────────────
  'guardrail-check': ({text, rules}) => {
    const t = text||''; const rs = rules||[{type:'max_length',value:10000},{type:'no_pii'},{type:'no_urls'}];
    const violations = [];
    rs.forEach(r => {
      if(r.type==='max_length'&&t.length>r.value) violations.push({rule:'max_length',detail:'Text is '+t.length+' chars, max '+r.value});
      if(r.type==='no_pii') {
        if(/\b\d{3}-\d{2}-\d{4}\b/.test(t)) violations.push({rule:'no_pii',detail:'SSN pattern detected'});
        if(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(t)) violations.push({rule:'no_pii',detail:'Credit card pattern detected'});
      }
      if(r.type==='no_urls'&&/https?:\/\//.test(t)) violations.push({rule:'no_urls',detail:'URL detected'});
      if(r.type==='required_format'&&r.pattern&&!new RegExp(r.pattern).test(t)) violations.push({rule:'required_format',detail:'Does not match required pattern'});
    });
    return {_engine:'real', passed:violations.length===0, violations, violation_count:violations.length, rules_checked:rs.length};
  },

  'pii-detect-redact': ({text, redact}) => {
    const t = text||''; const doRedact = redact!==false;
    const patterns = [
      {type:'ssn',regex:/\b\d{3}-\d{2}-\d{4}\b/g,mask:'[SSN]'},
      {type:'credit_card',regex:/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,mask:'[CARD]'},
      {type:'email',regex:/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,mask:'[EMAIL]'},
      {type:'phone',regex:/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,mask:'[PHONE]'},
      {type:'ip_address',regex:/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,mask:'[IP]'},
    ];
    const detections = [];
    let redacted = t;
    patterns.forEach(p => {
      const matches = t.match(p.regex)||[];
      matches.forEach(m => detections.push({type:p.type, value:doRedact?p.mask:m, position:t.indexOf(m)}));
      if(doRedact) redacted = redacted.replace(p.regex, p.mask);
    });
    return {_engine:'real', detections, pii_found:detections.length>0, count:detections.length, redacted:doRedact?redacted:undefined};
  },

  'cost-estimate-llm': ({prompt, model, max_tokens}) => {
    const p = prompt||''; const m = model||'claude-4-sonnet';
    const inputTokens = Math.ceil(p.length/4);
    const outputTokens = max_tokens||1000;
    const pricing = {
      'claude-4-sonnet':{input:3,output:15},'claude-4-opus':{input:15,output:75},'claude-4-haiku':{input:0.25,output:1.25},
      'gpt-4o':{input:2.5,output:10},'gpt-4o-mini':{input:0.15,output:0.6},'gpt-4-turbo':{input:10,output:30},
      'llama-3-70b':{input:0.9,output:0.9},'gemini-2-flash':{input:0.075,output:0.3},
    };
    const pr = pricing[m]||pricing['claude-4-sonnet'];
    const inputCost = inputTokens/1000000*pr.input;
    const outputCost = outputTokens/1000000*pr.output;
    return {_engine:'real', model:m, input_tokens:inputTokens, output_tokens:outputTokens, input_cost:'$'+inputCost.toFixed(6), output_cost:'$'+outputCost.toFixed(6), total_cost:'$'+(inputCost+outputCost).toFixed(6), pricing_per_1m:pr};
  },

  // ─── OBSERVABILITY ────────────────────────────────────────
  'audit-log-format': ({actor, action, target, inputs, outputs, result}) => {
    const entry = {
      timestamp: new Date().toISOString(),
      trace_id: crypto.randomUUID(),
      actor: actor||'agent',
      action: action||'unknown',
      target: target||'unknown',
      inputs_hash: crypto.createHash('sha256').update(JSON.stringify(inputs||{})).digest('hex').slice(0,16),
      outputs_hash: crypto.createHash('sha256').update(JSON.stringify(outputs||{})).digest('hex').slice(0,16),
      result: result||'success',
      metadata: {inputs_size:JSON.stringify(inputs||{}).length, outputs_size:JSON.stringify(outputs||{}).length}
    };
    return {_engine:'real', entry, formatted:JSON.stringify(entry)};
  },

  'trace-span-create': ({operation, parent_span_id, attributes}) => {
    const spanId = crypto.randomBytes(8).toString('hex');
    const traceId = parent_span_id ? undefined : crypto.randomBytes(16).toString('hex');
    return {_engine:'real', span:{
      trace_id: traceId||'inherited',
      span_id: spanId,
      parent_span_id: parent_span_id||null,
      operation: operation||'unknown',
      start_time: new Date().toISOString(),
      end_time: null,
      status: 'in_progress',
      attributes: attributes||{},
    }, format:'opentelemetry_compatible'};
  },

  // ─── HUMAN IN THE LOOP ────────────────────────────────────
  'human-in-the-loop-gate': ({context, options, urgency, timeout_minutes}) => {
    const id = crypto.randomUUID();
    return {_engine:'real', approval_request:{
      id, context:context||'Action requires approval',
      options: options||['approve','reject'],
      urgency: urgency||'normal',
      timeout_minutes: timeout_minutes||60,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now()+(timeout_minutes||60)*60000).toISOString(),
      status: 'pending',
    }};
  },

  // ─── AGENT MATCHING ───────────────────────────────────────
  'capability-match': ({task_description, agents}) => {
    const desc = (task_description||'').toLowerCase().split(/\s+/);
    const as = agents||[];
    const scored = as.map(a => {
      const caps = (a.capabilities||[]).join(' ').toLowerCase().split(/\s+/);
      const overlap = desc.filter(w => caps.some(c => c.includes(w) || w.includes(c))).length;
      return {...a, score:Math.round(overlap/Math.max(desc.length,1)*100)/100};
    }).sort((a,b)=>b.score-a.score);
    return {_engine:'real', ranked:scored, best_match:scored[0]||null, matches_found:scored.filter(s=>s.score>0.1).length};
  },

  // ─── PROMPT ENGINEERING ───────────────────────────────────
  'prompt-template-render': ({template, variables}) => {
    let t = template||'';
    const v = variables||{};
    // Replace {{variable}} patterns
    Object.entries(v).forEach(([key,val]) => {
      t = t.replace(new RegExp('\\{\\{\\s*'+key+'\\s*\\}\\}','g'), String(val));
    });
    // Handle {{#if var}}...{{/if}}
    t = t.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, content) => v[key] ? content : '');
    // Handle {{#each var}}...{{/each}}
    t = t.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, content) => {
      return Array.isArray(v[key]) ? v[key].map(item => content.replace(/\{\{this\}\}/g, String(item))).join('') : '';
    });
    // Clean up unresolved variables
    const unresolved = (t.match(/\{\{(\w+)\}\}/g)||[]).map(m=>m.replace(/[{}]/g,''));
    return {_engine:'real', rendered:t, variables_used:Object.keys(v).length, unresolved};
  },

  'retry-policy-compute': ({max_retries, strategy, base_delay_ms, attempt, error_code}) => {
    const mr = max_retries||5; const strat = strategy||'exponential_backoff'; const bd = base_delay_ms||1000;
    const att = Math.min(attempt||1, mr);
    let delay;
    if(strat==='exponential_backoff') delay = bd * Math.pow(2, att-1);
    else if(strat==='linear') delay = bd * att;
    else if(strat==='fixed') delay = bd;
    else delay = bd * Math.pow(2, att-1);
    // Add jitter (deterministic based on attempt for reproducibility)
    const jitter = Math.round(delay * 0.1 * (att % 3));
    delay += jitter;
    const shouldRetry = att < mr;
    const retryableErrors = [429, 500, 502, 503, 504, 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
    const isRetryable = error_code ? retryableErrors.includes(error_code) : true;
    return {_engine:'real', attempt:att, max_retries:mr, should_retry:shouldRetry&&isRetryable, delay_ms:delay, strategy:strat, is_retryable:isRetryable, total_wait_if_all_retries:Array.from({length:mr},(_,i)=>bd*Math.pow(2,i)).reduce((a,b)=>a+b,0)};
  },

  'prompt-chain-plan': ({goal, available_tools}) => {
    const tools = available_tools||[];
    const words = (goal||'').toLowerCase().split(/\s+/);
    // Simple planning: match tools to goal keywords
    const steps = tools.map((t,i) => {
      const relevance = words.filter(w => (t.name||t||'').toLowerCase().includes(w)).length;
      return {step:i+1, tool:t.name||t, relevance};
    }).filter(s=>s.relevance>0).sort((a,b)=>b.relevance-a.relevance).map((s,i)=>({...s,step:i+1}));
    return {_engine:'real', goal, plan:steps, step_count:steps.length, note:'Execute steps in order, passing output of each as input to next'};
  },
};

module.exports = handlers;
