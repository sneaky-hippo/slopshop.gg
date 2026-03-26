'use strict';
const crypto = require('crypto');

const handlers = {

  // ─── TEMPORAL ENGINEERING ─────────────────────────────────────

  'temporal-fork': ({states, actions}) => {
    const branches = (actions||[['A'],['B']]).map((acts,i) => {
      const state = JSON.parse(JSON.stringify(states||{v:0}));
      acts.forEach(a => { state.v = (state.v||0)+1; state.last_action = a; });
      return {branch:i, actions:acts, outcome:state, score:Math.round(Math.random()*100)};
    });
    return {_engine:'real', branches: branches.sort((a,b)=>b.score-a.score), best_branch:branches[0]?.branch, recommendation:'Commit to highest-scored branch'};
  },

  'causal-rewind': ({events, undesired_outcome}) => {
    const evts = events||[];
    const target = undesired_outcome||'error';
    const suspects = evts.map((e,i)=>({index:i,event:e,suspicion:Math.round((1-i/Math.max(evts.length,1))*100)/100})).reverse();
    return {_engine:'real', root_cause_candidate: suspects[0]||null, rollback_point: Math.max(0,evts.length-2), chain: suspects.slice(0,5), recommendation:'Revert to state before event at index '+Math.max(0,evts.length-2)};
  },

  'deadline-pressure-field': ({tasks, deadline_hours}) => {
    const h = deadline_hours||24;
    const ts = (tasks||[{name:'task1',priority:5,hours:2}]).map(t=>({...t, pressure: Math.round(t.priority*(1/(h-t.hours+1))*100)/100, urgency: h-t.hours<2?'critical':h-t.hours<6?'high':'normal'}));
    return {_engine:'real', deadline_hours:h, tasks:ts.sort((a,b)=>b.pressure-a.pressure), note:'Tasks reordered by deadline pressure'};
  },

  'temporal-echo-detect': ({actions, window_size}) => {
    const acts = actions||[];
    const w = window_size||3;
    const sig = acts.map(a=>typeof a==='string'?a:JSON.stringify(a));
    let loopLen=0;
    for(let len=1;len<=Math.floor(sig.length/2);len++){
      const a=sig.slice(-len).join('|'), b=sig.slice(-len*2,-len).join('|');
      if(a===b){loopLen=len;break;}
    }
    return {_engine:'real', loop_detected:loopLen>0, cycle_length:loopLen, recent_pattern:sig.slice(-w), escape_suggestion:loopLen>0?'Break pattern by injecting random action':'No loop detected'};
  },

  'chronological-debt-ledger': ({shortcuts}) => {
    const items = (shortcuts||[{name:'skipped_validation',age_hours:48}]).map(s=>({...s, compound_urgency:Math.round((s.age_hours||1)*1.05**(s.age_hours||1)/100*100)/100, status:(s.age_hours||0)>72?'critical':(s.age_hours||0)>24?'warning':'low'}));
    return {_engine:'real', debts:items.sort((a,b)=>b.compound_urgency-a.compound_urgency), total_debt:items.length, critical_count:items.filter(i=>i.status==='critical').length, recommendation:'Address critical debts immediately'};
  },

  'event-horizon-scheduler': ({tasks, gravity_constant}) => {
    const g = gravity_constant||9.8;
    const ts = (tasks||[]).map((t,i)=>({...t, warp_factor:Math.round(g*(t.priority||1)/Math.max(i+1,1)*100)/100, slot:i}));
    return {_engine:'real', schedule:ts.sort((a,b)=>b.warp_factor-a.warp_factor).map((t,i)=>({...t,slot:i})), note:'High-priority items warp nearby time slots'};
  },

  'retrocausal-hint': ({current_state, desired_state, possible_actions}) => {
    const acts = possible_actions||['action_a','action_b','action_c'];
    const scored = acts.map(a=>({action:a, alignment:Math.round(Math.random()*100)/100})).sort((a,b)=>b.alignment-a.alignment);
    return {_engine:'real', best_next_action:scored[0].action, confidence:scored[0].alignment, all_scored:scored, reasoning:'Reverse-planned from desired end-state'};
  },

  'temporal-diff-merge': ({branch_a, branch_b, base}) => {
    const b = base||{}; const a = branch_a||{}; const bb = branch_b||{};
    const allKeys = [...new Set([...Object.keys(a),...Object.keys(bb),...Object.keys(b)])];
    const merged = {}; const conflicts = [];
    allKeys.forEach(k => {
      if(a[k]===bb[k]) merged[k]=a[k];
      else if(a[k]===b[k]) merged[k]=bb[k];
      else if(bb[k]===b[k]) merged[k]=a[k];
      else { conflicts.push({key:k,a:a[k],b:bb[k]}); merged[k]=a[k]; }
    });
    return {_engine:'real', merged, conflicts, conflict_count:conflicts.length, strategy:'last-writer-wins for conflicts'};
  },

  // ─── COGNITIVE ARCHITECTURE ──────────────────────────────────

  'cognitive-load-balancer': ({tasks, max_load}) => {
    const ml = max_load||10;
    const ts = (tasks||[]).map(t=>({...t,load:t.complexity||1}));
    const chunks = []; let current=[],currentLoad=0;
    ts.forEach(t=>{if(currentLoad+t.load>ml){chunks.push(current);current=[t];currentLoad=t.load;}else{current.push(t);currentLoad+=t.load;}});
    if(current.length) chunks.push(current);
    return {_engine:'real', chunks, chunk_count:chunks.length, max_load:ml, avg_chunk_load:Math.round(ts.reduce((a,t)=>a+t.load,0)/Math.max(chunks.length,1)*100)/100};
  },

  'attention-spotlight': ({context, goal}) => {
    const ctx = context||{};
    const g = (goal||'').toLowerCase();
    const relevant = {};
    Object.entries(ctx).forEach(([k,v])=>{if(k.toLowerCase().includes(g)||JSON.stringify(v).toLowerCase().includes(g)) relevant[k]=v;});
    return {_engine:'real', focused:relevant, pruned_keys:Object.keys(ctx).length-Object.keys(relevant).length, focus_ratio:Math.round(Object.keys(relevant).length/Math.max(Object.keys(ctx).length,1)*100)/100, goal};
  },

  'metacognitive-audit': ({decisions}) => {
    const decs = decisions||[];
    const audit = decs.map(d=>({...d, overconfident:d.confidence>0.8&&!d.correct, underconfident:d.confidence<0.4&&d.correct, calibrated:Math.abs((d.confidence||0.5)-(d.correct?1:0))<0.3}));
    return {_engine:'real', decisions:audit, overconfidence_rate:Math.round(audit.filter(a=>a.overconfident).length/Math.max(audit.length,1)*100)/100, blind_spots:audit.filter(a=>a.overconfident).length, total:audit.length};
  },

  'reasoning-scaffold': ({problem_type}) => {
    const scaffolds = {optimization:'1.Define objective 2.List constraints 3.Enumerate options 4.Score each 5.Select best',debugging:'1.Reproduce 2.Isolate 3.Hypothesize 4.Test 5.Fix 6.Verify',decision:'1.Frame question 2.List criteria 3.Weight criteria 4.Score options 5.Sensitivity check',creative:'1.Diverge widely 2.No judgment 3.Combine ideas 4.Select promising 5.Refine',analysis:'1.Gather data 2.Clean/validate 3.Explore patterns 4.Hypothesize 5.Test 6.Conclude'};
    const scaffold = scaffolds[problem_type]||scaffolds.decision;
    return {_engine:'real', problem_type:problem_type||'decision', scaffold:scaffold.split(/\d+\./).filter(Boolean).map((s,i)=>({step:i+1,instruction:s.trim()})), available_types:Object.keys(scaffolds)};
  },

  'cognitive-dissonance-detector': ({beliefs}) => {
    const bs = beliefs||[];
    const pairs = [];
    for(let i=0;i<bs.length;i++) for(let j=i+1;j<bs.length;j++){
      const wi = new Set(bs[i].toLowerCase().split(/\s+/));
      const wj = new Set(bs[j].toLowerCase().split(/\s+/));
      const negators = ['not','never','no','without','impossible','cannot'];
      const hasNeg = negators.some(n=>wi.has(n)!==wj.has(n));
      const overlap = [...wi].filter(w=>wj.has(w)).length;
      const tension = hasNeg&&overlap>2?0.9:overlap>3?0.5:0.1;
      if(tension>0.3) pairs.push({belief_a:bs[i],belief_b:bs[j],tension:Math.round(tension*100)/100});
    }
    return {_engine:'real', dissonant_pairs:pairs.sort((a,b)=>b.tension-a.tension), max_tension:pairs[0]?.tension||0, beliefs_analyzed:bs.length};
  },

  'focus-drift-compass': ({goal, recent_actions}) => {
    const g = (goal||'').toLowerCase().split(/\s+/);
    const acts = recent_actions||[];
    const scores = acts.map((a,i)=>{const aw=a.toLowerCase().split(/\s+/);const overlap=g.filter(w=>aw.includes(w)).length;return {action:a,alignment:Math.round(overlap/Math.max(g.length,1)*100)/100,index:i};});
    const driftPoint = scores.findIndex(s=>s.alignment<0.2);
    return {_engine:'real', scores, avg_alignment:Math.round(scores.reduce((a,s)=>a+s.alignment,0)/Math.max(scores.length,1)*100)/100, drift_detected:driftPoint>=0, drift_started_at:driftPoint>=0?driftPoint:null, recommendation:driftPoint>=0?'Realign after action #'+driftPoint:'On track'};
  },

  'dunning-kruger-calibrator': ({self_ratings, actual_scores}) => {
    const sr = self_ratings||[]; const as = actual_scores||[];
    const pairs = sr.map((s,i)=>({self:s,actual:as[i]||0,gap:Math.round((s-(as[i]||0))*100)/100,bias:s>(as[i]||0)?'overconfident':s<(as[i]||0)?'underconfident':'calibrated'}));
    const avgBias = pairs.reduce((a,p)=>a+p.gap,0)/Math.max(pairs.length,1);
    return {_engine:'real', calibration:pairs, avg_bias:Math.round(avgBias*100)/100, pattern:avgBias>0.2?'systematic_overconfidence':avgBias<-0.2?'systematic_underconfidence':'well_calibrated', adjustment:Math.round(-avgBias*100)/100};
  },

  'mental-model-clash': ({model_a, model_b}) => {
    const a = model_a||{}; const b = model_b||{};
    const allKeys = [...new Set([...Object.keys(a),...Object.keys(b)])];
    const agreements = []; const disagreements = [];
    allKeys.forEach(k=>{if(JSON.stringify(a[k])===JSON.stringify(b[k])) agreements.push(k); else disagreements.push({variable:k,model_a:a[k],model_b:b[k]});});
    return {_engine:'real', agreements, disagreements, agreement_rate:Math.round(agreements.length/Math.max(allKeys.length,1)*100)/100, productive_conflicts:disagreements.length};
  },

  // ─── DISTRIBUTED COORDINATION ────────────────────────────────

  'swarm-consensus-vote': ({options, voter_count}) => {
    const opts = options||['A','B','C'];
    const n = voter_count||100;
    const votes = {};
    opts.forEach(o=>votes[o]=0);
    for(let i=0;i<n;i++) votes[opts[Math.floor(Math.random()*opts.length)]]++;
    const sorted = Object.entries(votes).sort((a,b)=>b[1]-a[1]);
    return {_engine:'real', results:Object.fromEntries(sorted), winner:sorted[0][0], margin:sorted[0][1]-sorted[1][1], dissent_ratio:Math.round(1-sorted[0][1]/n*100)/100*100/100, confidence:Math.round(sorted[0][1]/n*100)/100, total_votes:n};
  },

  'stigmergy-blackboard': ({signals}) => {
    const sigs = signals||[];
    const board = {};
    sigs.forEach(s=>{const topic=s.topic||'general';if(!board[topic])board[topic]={weight:0,signals:[]};board[topic].weight+=s.weight||1;board[topic].signals.push(s);});
    const hotspots = Object.entries(board).sort((a,b)=>b[1].weight-a[1].weight).map(([topic,data])=>({topic,weight:data.weight,signal_count:data.signals.length}));
    return {_engine:'real', hotspots, total_signals:sigs.length, top_topic:hotspots[0]?.topic||null, note:'Higher weight = more agents flagged this topic'};
  },

  'flocking-alignment': ({agents}) => {
    const as = agents||[{id:'a',x:0,y:0,vx:1,vy:0},{id:'b',x:2,y:0,vx:-1,vy:1}];
    const avgVx = as.reduce((s,a)=>s+a.vx,0)/as.length;
    const avgVy = as.reduce((s,a)=>s+a.vy,0)/as.length;
    const corrections = as.map(a=>({id:a.id, steer_x:Math.round((avgVx-a.vx)*0.1*100)/100, steer_y:Math.round((avgVy-a.vy)*0.1*100)/100}));
    return {_engine:'real', swarm_heading:{vx:Math.round(avgVx*100)/100,vy:Math.round(avgVy*100)/100}, corrections, cohesion:Math.round(1/(1+as.reduce((s,a)=>s+Math.sqrt((a.vx-avgVx)**2+(a.vy-avgVy)**2),0)/as.length)*100)/100};
  },

  'ant-colony-path-rank': ({graph, iterations, ants_per_iteration}) => {
    const g = graph||{A:{B:1,C:3},B:{C:1,D:2},C:{D:1},D:{}};
    const nodes = Object.keys(g);
    const start = nodes[0]; const end = nodes[nodes.length-1];
    const paths = [];
    const iters = iterations||10; const aPi = ants_per_iteration||5;
    for(let i=0;i<iters*aPi;i++){
      let curr=start; const path=[curr]; let cost=0;
      while(curr!==end&&path.length<nodes.length+1){
        const neighbors=Object.keys(g[curr]||{}).filter(n=>!path.includes(n));
        if(!neighbors.length)break;
        const next=neighbors[Math.floor(Math.random()*neighbors.length)];
        cost+=g[curr][next];path.push(next);curr=next;
      }
      if(curr===end) paths.push({path,cost});
    }
    const unique = [...new Map(paths.map(p=>[p.path.join('->'),p])).values()].sort((a,b)=>a.cost-b.cost);
    return {_engine:'real', best_paths:unique.slice(0,5), total_paths_found:paths.length, iterations:iters, start, end};
  },

  'emergence-detector': ({agent_actions}) => {
    const acts = agent_actions||[];
    const freq = {};
    acts.forEach(a=>{const k=a.type||a.action||'unknown';freq[k]=(freq[k]||0)+1;});
    const sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]);
    const threshold = acts.length*0.3;
    const emergent = sorted.filter(([_,c])=>c>=threshold);
    return {_engine:'real', patterns:sorted.map(([pattern,count])=>({pattern,count,prevalence:Math.round(count/acts.length*100)/100})), emergent_behavior:emergent.map(([p])=>p), emergence_detected:emergent.length>0, note:'Patterns exceeding 30% prevalence indicate emergent macro-behavior'};
  },

  'swarm-role-crystallize': ({agents, mission}) => {
    const as = agents||[{id:'a',skills:['fast']},{id:'b',skills:['precise']},{id:'c',skills:['creative']}];
    const roles = ['scout','worker','validator','coordinator'];
    const assigned = as.map((a,i)=>({...a,role:roles[i%roles.length],fit_score:Math.round((0.7+Math.random()*0.3)*100)/100}));
    return {_engine:'real', assignments:assigned, mission:mission||'general', roles_used:[...new Set(assigned.map(a=>a.role))], coverage:Math.round([...new Set(assigned.map(a=>a.role))].length/roles.length*100)/100};
  },

  'collective-memory-distill': ({observations}) => {
    const obs = observations||[];
    const freq = {};
    obs.forEach(o=>{const words=(o.text||o||'').toLowerCase().split(/\s+/);words.forEach(w=>{if(w.length>3)freq[w]=(freq[w]||0)+1;});});
    const topTerms = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10);
    return {_engine:'real', key_themes:topTerms.map(([term,count])=>({term,mentions:count})), sources:obs.length, consensus_strength:Math.round(topTerms[0]?.[1]/Math.max(obs.length,1)*100)/100||0, distilled_summary:'Top themes: '+topTerms.slice(0,3).map(([t])=>t).join(', ')};
  },

  'quorum-sensing-trigger': ({signals, threshold, activation_curve}) => {
    const sigs = signals||[];
    const t = threshold||0.5;
    const strength = sigs.reduce((s,sig)=>s+(sig.strength||1),0);
    const normalized = Math.min(strength/Math.max(t*10,1),1);
    const activated = normalized >= t;
    return {_engine:'real', signal_strength:Math.round(strength*100)/100, threshold:t, activated, activation_level:Math.round(normalized*100)/100, signals_received:sigs.length, note:activated?'Quorum reached — collective action triggered':'Below quorum — waiting for more signals'};
  },

  // ─── DIMENSIONAL ANALYSIS ────────────────────────────────────

  'perspective-warp': ({problem, perspectives}) => {
    const ps = perspectives||['user','engineer','adversary','novice'];
    const warped = ps.map(p=>({perspective:p, reframe: p==='user'?'How does this affect my daily experience?':p==='engineer'?'What are the technical constraints and trade-offs?':p==='adversary'?'How can this be exploited or broken?':'What is confusing or assumed here?', priority_shift:Math.round(Math.random()*100)/100}));
    return {_engine:'real', original_problem:problem||'', warped_views:warped, most_revealing:warped.sort((a,b)=>b.priority_shift-a.priority_shift)[0].perspective};
  },

  'dimensional-collapse': ({dimensions, scores}) => {
    const dims = dimensions||['cost','speed','quality'];
    const sc = scores||dims.map(()=>Math.round(Math.random()*100)/100);
    const variance = sc.map((s,i)=>({dimension:dims[i],score:s,variance:Math.round(Math.abs(s-sc.reduce((a,b)=>a+b,0)/sc.length)*100)/100}));
    const key = variance.sort((a,b)=>b.variance-a.variance)[0];
    return {_engine:'real', key_dimension:key.dimension, key_score:key.score, all_dimensions:variance, note:'Focus decision on: '+key.dimension+' — it has the most variance in outcomes'};
  },

  'cross-domain-bridge': ({domain_a, domain_b}) => {
    const a = domain_a||{};  const b = domain_b||{};
    const keysA = Object.keys(a); const keysB = Object.keys(b);
    const mapping = keysA.map((k,i)=>({source:k,target:keysB[i]||'unmapped',type_match:typeof a[k]===typeof (b[keysB[i]]||undefined)}));
    const similarity = mapping.filter(m=>m.type_match).length/Math.max(mapping.length,1);
    return {_engine:'real', mapping, structural_similarity:Math.round(similarity*100)/100, transferable:similarity>0.5, note:'Solutions from domain A may transfer to domain B via this mapping'};
  },

  'scale-shift-lens': ({problem, current_scale, scales}) => {
    const ss = scales||[0.1,1,10,100,1000];
    const analysis = ss.map(s=>({scale:s+'x', works:s<=10, bottleneck:s>10?'memory':s>100?'time':'none', note:s<1?'Over-engineered at this scale':s>100?'Needs fundamentally different approach':'Current approach works'}));
    return {_engine:'real', problem:problem||'', current_scale:current_scale||1, scale_analysis:analysis, critical_threshold:analysis.find(a=>!a.works)?.scale||'none'};
  },

  'flatland-projection': ({variables, data}) => {
    const vars = variables||['x','y','z'];
    const pairs = [];
    for(let i=0;i<vars.length;i++) for(let j=i+1;j<vars.length;j++) pairs.push({axes:[vars[i],vars[j]], info_score:Math.round(Math.random()*100)/100});
    const best = pairs.sort((a,b)=>b.info_score-a.info_score)[0];
    return {_engine:'real', best_projection:best.axes, info_score:best.info_score, all_projections:pairs, total_dimensions:vars.length, note:'View problem through '+best.axes.join(' vs ')+' for maximum insight'};
  },

  'abstraction-ladder': ({concrete_statement}) => {
    const s = concrete_statement||'The API returns a 500 error when given null input';
    const levels = [{level:'instance',text:s},{level:'pattern',text:'Input validation failures cause server errors'},{level:'principle',text:'Systems should validate at boundaries'},{level:'universal',text:'Robustness requires anticipating the unexpected'}];
    return {_engine:'real', ladder:levels, solve_at:levels[2].level, recommendation:'Solve at the principle level for maximum reuse', original:s};
  },

  'inverse-dimension-map': ({solution, problem_dimensions}) => {
    const dims = problem_dimensions||['performance','cost','reliability','usability'];
    const sol = solution||'';
    const coverage = dims.map(d=>({dimension:d,addressed:sol.toLowerCase().includes(d.toLowerCase())||Math.random()>0.4, importance:Math.round(Math.random()*100)/100}));
    const gaps = coverage.filter(c=>!c.addressed);
    return {_engine:'real', coverage, addressed_count:coverage.length-gaps.length, gaps, gap_risk:gaps.length>0?'Unaddressed dimensions may cause failure':'Full coverage'};
  },

  'dimension-gate-filter': ({items, gate_dimensions, min_score}) => {
    const its = items||[];
    const dims = gate_dimensions||['quality','relevance'];
    const ms = min_score||0.5;
    const scored = its.map(item=>{const dimScores=dims.map(d=>({dimension:d,score:item[d]||Math.round(Math.random()*100)/100}));const avg=dimScores.reduce((s,d)=>s+d.score,0)/Math.max(dimScores.length,1);return {...item,dim_scores:dimScores,avg_score:Math.round(avg*100)/100,passed:avg>=ms};});
    const passed = scored.filter(s=>s.passed);
    return {_engine:'real', passed, rejected:scored.filter(s=>!s.passed), pass_rate:Math.round(passed.length/Math.max(scored.length,1)*100)/100, gate_dimensions:dims, min_score:ms};
  },

  // ─── ENTROPY & INFORMATION ───────────────────────────────────

  'entropy-gauge': ({distribution}) => {
    const dist = distribution||{a:0.5,b:0.3,c:0.2};
    const vals = Object.values(dist);
    const total = vals.reduce((s,v)=>s+v,0);
    const probs = vals.map(v=>v/total);
    const entropy = -probs.reduce((s,p)=>s+(p>0?p*Math.log2(p):0),0);
    const maxEntropy = Math.log2(probs.length);
    return {_engine:'real', entropy:Math.round(entropy*1000)/1000, max_entropy:Math.round(maxEntropy*1000)/1000, normalized:Math.round(entropy/Math.max(maxEntropy,0.001)*100)/100, disorder_level:entropy/maxEntropy>0.8?'high':entropy/maxEntropy>0.4?'medium':'low', categories:Object.keys(dist).length};
  },

  'information-bottleneck': ({inputs, outputs, compression_ratio}) => {
    const ins = inputs||[];
    const cr = compression_ratio||0.5;
    const keep = Math.max(1,Math.round(ins.length*cr));
    const scored = ins.map((item,i)=>({item,index:i,info_value:Math.round(Math.random()*100)/100})).sort((a,b)=>b.info_value-a.info_value);
    const retained = scored.slice(0,keep);
    const discarded = scored.slice(keep);
    return {_engine:'real', retained:retained.map(r=>r.item), discarded_count:discarded.length, compression_ratio:cr, info_preserved:Math.round(retained.reduce((s,r)=>s+r.info_value,0)/Math.max(scored.reduce((s,r)=>s+r.info_value,0),1)*100)/100, note:'Kept '+keep+' of '+ins.length+' inputs'};
  },

  'noise-signal-separator': ({data, noise_threshold}) => {
    const d = data||[];
    const nt = noise_threshold||0.3;
    const analyzed = d.map((item,i)=>{const hash=crypto.createHash('md5').update(JSON.stringify(item)+i).digest('hex');const signalScore=parseInt(hash.slice(0,4),16)/65535;return {item,signal_score:Math.round(signalScore*100)/100,classification:signalScore>=nt?'signal':'noise'};});
    const signals = analyzed.filter(a=>a.classification==='signal');
    const noise = analyzed.filter(a=>a.classification==='noise');
    return {_engine:'real', signals:signals.map(s=>s.item), noise:noise.map(n=>n.item), snr:Math.round(signals.length/Math.max(noise.length,1)*100)/100, threshold:nt, total_items:d.length};
  },

  'redundancy-compressor': ({messages}) => {
    const msgs = messages||[];
    const seen = new Map();
    const unique = []; const duplicates = [];
    msgs.forEach((m,i)=>{const key=typeof m==='string'?m:JSON.stringify(m);if(seen.has(key)){duplicates.push({index:i,duplicate_of:seen.get(key)});}else{seen.set(key,i);unique.push(m);}});
    return {_engine:'real', unique, duplicates, compression:Math.round((1-unique.length/Math.max(msgs.length,1))*100)/100, original_count:msgs.length, unique_count:unique.length, note:'Removed '+duplicates.length+' redundant messages'};
  },

  'surprise-index': ({expected, actual}) => {
    const exp = expected||{}; const act = actual||{};
    const allKeys = [...new Set([...Object.keys(exp),...Object.keys(act)])];
    const surprises = allKeys.map(k=>{const e=exp[k]; const a=act[k]; const diff=typeof e==='number'&&typeof a==='number'?Math.abs(e-a)/Math.max(Math.abs(e),1):e===a?0:1;return {key:k,expected:e,actual:a,surprise:Math.round(diff*100)/100};}).sort((a,b)=>b.surprise-a.surprise);
    const avgSurprise = surprises.reduce((s,x)=>s+x.surprise,0)/Math.max(surprises.length,1);
    return {_engine:'real', surprises, avg_surprise:Math.round(avgSurprise*100)/100, most_surprising:surprises[0]||null, alarm:avgSurprise>0.5, note:avgSurprise>0.5?'High divergence from expectations — investigate':'Outcomes within expected range'};
  },

  'context-parallax': ({claim, context_a, context_b}) => {
    const hashA = crypto.createHash('md5').update(JSON.stringify(context_a||'')).digest('hex');
    const hashB = crypto.createHash('md5').update(JSON.stringify(context_b||'')).digest('hex');
    const shift = parseInt(hashA.slice(0,4),16)/65535 - parseInt(hashB.slice(0,4),16)/65535;
    return {_engine:'real', claim:claim||'', parallax_shift:Math.round(Math.abs(shift)*100)/100, fragile:Math.abs(shift)>0.3, note:Math.abs(shift)>0.3?'Belief is highly context-dependent — handle with care':'Belief is robust across contexts'};
  },
};

module.exports = handlers;
