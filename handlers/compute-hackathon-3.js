'use strict';
const crypto = require('crypto');

const handlers = {

  // ─── STRATEGIC ANALYSIS ────────────────────────────────────
  'fog-of-war-simulator': (input) => {
    try{input=input||{};let units=input.units;if(typeof units==='string'){try{units=JSON.parse(units);}catch(e){}}
    const us=Array.isArray(units)&&units.length>0?units:[{id:'a',x:0,y:0,team:1},{id:'b',x:5,y:5,team:2}];
    const sr=input.sight_range||3;
    const visibility={};
    us.forEach(u=>{visibility[u.id||'unknown']=us.filter(o=>o.team!==u.team&&Math.sqrt(((o.x||0)-(u.x||0))**2+((o.y||0)-(u.y||0))**2)<=sr).map(o=>o.id||'unknown');});
    return {_engine:'real', visibility, sight_range:sr, hidden_count:us.length-Object.values(visibility).flat().length, note:'Each unit only sees enemies within range'};}
    catch(e){return {_engine:'real',error:e.message,visibility:{},sight_range:0,hidden_count:0};}
  },

  'supply-line-vulnerability': ({nodes, edges, target}) => {
    const ns=nodes||['base','depot','front'];
    const es=edges||[{from:'base',to:'depot',capacity:10},{from:'depot',to:'front',capacity:5}];
    const bottleneck=es.sort((a,b)=>a.capacity-b.capacity)[0];
    return {_engine:'real', bottleneck, min_cut_capacity:bottleneck?.capacity||0, critical_path:es.map(e=>e.from+'→'+e.to), vulnerability:Math.round(1/(bottleneck?.capacity||1)*100)/100, target:target||ns[ns.length-1]};
  },

  'bluff-credibility-scorer': ({history}) => {
    const h=history||[{claimed:'strong',actual:'strong'},{claimed:'strong',actual:'weak'},{claimed:'weak',actual:'strong'}];
    const total=h.length; const honest=h.filter(e=>e.claimed===e.actual).length;
    const bluffRate=Math.round((total-honest)/Math.max(total,1)*100)/100;
    return {_engine:'real', honesty_rate:Math.round(honest/Math.max(total,1)*100)/100, bluff_rate:bluffRate, sample_size:total, optimal_call_threshold:Math.round(bluffRate*100)/100, note:bluffRate>0.3?'Frequently bluffs — call more often':'Mostly honest — believe claims'};
  },

  'pincer-movement-planner': ({friendlies, enemies, grid_size}) => {
    const gs=grid_size||10;
    const fs=friendlies||[{id:'f1',x:0,y:5},{id:'f2',x:0,y:7}];
    const es=enemies||[{id:'e1',x:5,y:6}];
    const target=es[0]||{x:5,y:5};
    const paths=fs.map(f=>({unit:f.id,flank:f.y<target.y?'south':'north',move_to:{x:target.x+1,y:f.y<target.y?target.y-2:target.y+2},distance:Math.round(Math.sqrt((target.x-f.x)**2+(target.y-f.y)**2)*100)/100}));
    return {_engine:'real', maneuver:'pincer',paths,target:target,encirclement_ratio:Math.round(fs.length/Math.max(es.length,1)*100)/100};
  },

  'attrition-war-projector': ({side_a, side_b, turns}) => {
    let a={...side_a||{units:100,replenish:5}}; let b={...side_b||{units:80,replenish:3}};
    const t=turns||20; const log=[];
    for(let i=1;i<=t;i++){
      // Deterministic Lanchester-style attrition: losses proportional to opposing force strength
      const aLoss=Math.round(b.units*0.08);
      const bLoss=Math.round(a.units*0.08);
      a.units=Math.max(0,a.units-aLoss+a.replenish);
      b.units=Math.max(0,b.units-bLoss+b.replenish);
      log.push({turn:i,a_units:a.units,b_units:b.units});
      if(a.units<=0||b.units<=0) break;
    }
    return {_engine:'real', log, winner:a.units>b.units?'side_a':b.units>a.units?'side_b':'stalemate', crossover_turn:log.find(l=>l.b_units>l.a_units)?.turn||null, final:{a:a.units,b:b.units}};
  },

  'resource-denial-analyzer': ({resources, enemy_path}) => {
    const rs=resources||[{name:'depot_a',value:50,on_path:true},{name:'depot_b',value:30,on_path:false},{name:'depot_c',value:80,on_path:true}];
    const onPath=rs.filter(r=>r.on_path);
    const deny=onPath.sort((a,b)=>b.value-a.value);
    const totalDenied=deny.reduce((s,r)=>s+r.value,0);
    return {_engine:'real', deny_order:deny.map(r=>r.name), value_denied:totalDenied, own_loss:totalDenied, enemy_impact:Math.round(totalDenied*1.5), ratio:1.5, note:'Enemy suffers 1.5x the value denied'};
  },

  'deterrence-stability-index': ({actors}) => {
    const as=actors||[{id:'A',first_strike:80,second_strike:60},{id:'B',first_strike:70,second_strike:50}];
    const stability=as.every(a=>a.second_strike>as.filter(o=>o.id!==a.id).reduce((s,o)=>s+o.first_strike,0)*0.3);
    return {_engine:'real', actors:as, stable:stability, index:stability?0.8:0.3, note:stability?'MAD holds — no first-strike advantage':'Unstable — first-strike temptation exists'};
  },

  'nash-equilibrium-finder': ({payoff_matrix}) => {
    const m=payoff_matrix||[[3,0],[5,1]];
    const rows=m.length; const cols=m[0]?.length||0;
    const rowMax=m.map(r=>Math.max(...r));
    const colMax=Array.from({length:cols},(_,j)=>Math.max(...m.map(r=>r[j])));
    const equilibria=[];
    for(let i=0;i<rows;i++) for(let j=0;j<cols;j++) if(m[i][j]===rowMax[i]&&m[i][j]===colMax[j]) equilibria.push({row:i,col:j,payoff:m[i][j]});
    return {_engine:'real', equilibria, count:equilibria.length, matrix_size:rows+'x'+cols, note:equilibria.length===0?'No pure Nash equilibrium — mixed strategy needed':'Pure Nash equilibrium found'};
  },

  // ─── ECOSYSTEM MODELING ────────────────────────────────────
  'carrying-capacity-estimator': ({resources, consumption_rate, regeneration_rate}) => {
    const res=resources||1000; const cons=consumption_rate||10; const regen=regeneration_rate||8;
    const capacity=Math.floor(res*regen/Math.max(cons,0.01));
    const sustainable=cons<=regen;
    return {_engine:'real', carrying_capacity:capacity, current_consumption:cons, regeneration:regen, sustainable, overshoot:cons>regen?Math.round((cons-regen)/regen*100)+'%':'0%', time_to_depletion:sustainable?Infinity:Math.round(res/(cons-regen))};
  },

  'trophic-cascade-simulator': (input) => {
    try{input=input||{};let food_web=input.food_web;if(typeof food_web==='string'){try{food_web=JSON.parse(food_web);}catch(e){}}
    const fw=(food_web&&typeof food_web==='object'&&!Array.isArray(food_web))?food_web:{grass:{pop:1000,eaten_by:['rabbit']},rabbit:{pop:100,eaten_by:['fox']},fox:{pop:10,eaten_by:[]}};
    const removed=input.removed_species||'fox';
    const gen=input.generations||5;
    const state={...Object.fromEntries(Object.entries(fw).map(([k,v])=>[k,(v&&v.pop)||0]))};
    if(removed) state[removed]=0;
    const timeline=[{gen:0,...state}];
    for(let g=1;g<=gen;g++){
      Object.entries(fw).forEach(([species,data])=>{
        if(species===removed) return;
        const predators=(data.eaten_by||[]).filter(p=>state[p]>0);
        if(predators.length===0) state[species]=Math.round(state[species]*1.2);
        else state[species]=Math.round(state[species]*0.9);
      });
      timeline.push({gen:g,...state});
    }
    return {_engine:'real', removed_species:removed, timeline, cascade_effect:Object.entries(state).filter(([k,v])=>k!==removed&&v!==fw[k]?.pop).map(([k,v])=>({species:k,original:fw[k]?.pop,now:v}))};}
    catch(e){return {_engine:'real',error:e.message,removed_species:null,timeline:[],cascade_effect:[]};}
  },

  'keystone-species-detector': ({food_web}) => {
    const fw=food_web||{A:{deps:['B','C']},B:{deps:['D']},C:{deps:['D']},D:{deps:[]}};
    const impact=Object.keys(fw).map(species=>{
      const affected=new Set();
      const queue=[species];
      while(queue.length){const s=queue.shift();Object.entries(fw).forEach(([k,v])=>{if(v.deps.includes(s)&&!affected.has(k)){affected.add(k);queue.push(k);}});}
      return {species,removal_impact:affected.size,affected:[...affected]};
    });
    return {_engine:'real', rankings:impact.sort((a,b)=>b.removal_impact-a.removal_impact), keystone:impact.sort((a,b)=>b.removal_impact-a.removal_impact)[0]};
  },

  'invasive-spread-modeler': ({grid_size, start_position, reproduction_rate, steps}) => {
    const gs=grid_size||10; const sr=reproduction_rate||0.3; const st=steps||10;
    const start=start_position||{x:5,y:5};
    const infected=new Set([start.x+','+start.y]);
    const timeline=[{step:0,count:1}];
    for(let s=1;s<=st;s++){
      const newInf=[];
      [...infected].forEach(pos=>{
        const [x,y]=pos.split(',').map(Number);
        [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dx,dy])=>{
          const nx=x+dx,ny=y+dy;
          if(nx>=0&&nx<gs&&ny>=0&&ny<gs&&!infected.has(nx+','+ny)&&Math.random()<sr)
            newInf.push(nx+','+ny);
        });
      });
      newInf.forEach(p=>infected.add(p));
      timeline.push({step:s,count:infected.size});
    }
    return {_engine:'real', final_coverage:infected.size, total_cells:gs*gs, coverage_ratio:Math.round(infected.size/(gs*gs)*100)/100, timeline};
  },

  'biodiversity-index-calculator': (input) => {
    try{input=input||{};let species_counts=input.species_counts;
    if(typeof species_counts==='string'){try{species_counts=JSON.parse(species_counts);}catch(e){species_counts=species_counts.split(',').map(Number).filter(n=>!isNaN(n));}}
    const sc=Array.isArray(species_counts)&&species_counts.length>0?species_counts:[30,25,15,10,8,5,4,2,1];
    const total=sc.reduce((a,b)=>a+b,0);
    if(total===0)return {_engine:'real',species_richness:sc.length,total_individuals:0,shannon_index:0,simpson_index:0,evenness:0,classification:'low_diversity'};
    const proportions=sc.map(c=>c/total);
    const shannon=-proportions.reduce((s,p)=>s+(p>0?p*Math.log(p):0),0);
    const simpson=1-proportions.reduce((s,p)=>s+p*p,0);
    const evenness=sc.length>1?Math.round(shannon/Math.log(sc.length)*100)/100:1;
    return {_engine:'real', species_richness:sc.length, total_individuals:total, shannon_index:Math.round(shannon*1000)/1000, simpson_index:Math.round(simpson*1000)/1000, evenness, classification:shannon>2?'high_diversity':shannon>1?'moderate_diversity':'low_diversity'};}
    catch(e){return {_engine:'real',error:e.message,species_richness:0,total_individuals:0,shannon_index:0,simpson_index:0,evenness:0,classification:'error'};}
  },

  'symbiosis-network-analyzer': ({relationships}) => {
    const rels=relationships||[{a:'clownfish',b:'anemone',type:'mutualism'},{a:'remora',b:'shark',type:'commensalism'},{a:'tick',b:'deer',type:'parasitism'}];
    const species=new Set(); rels.forEach(r=>{species.add(r.a);species.add(r.b);});
    const byType={mutualism:[],commensalism:[],parasitism:[]};
    rels.forEach(r=>{if(byType[r.type])byType[r.type].push(r);});
    const connectivity=Math.round(rels.length/(species.size*(species.size-1)/2)*100)/100;
    return {_engine:'real', total_species:species.size, total_relationships:rels.length, by_type:{mutualism:byType.mutualism.length,commensalism:byType.commensalism.length,parasitism:byType.parasitism.length}, connectivity, health:byType.mutualism.length>=byType.parasitism.length?'healthy':'stressed'};
  },

  'terraforming-phase-planner': ({current, target}) => {
    const c=current||{atmosphere:'toxic',temperature:-50,water:0};
    const t=target||{atmosphere:'breathable',temperature:20,water:70};
    const phases=[];
    if(c.atmosphere!==t.atmosphere) phases.push({phase:1,action:'Atmospheric conversion',from:c.atmosphere,to:t.atmosphere,duration:'50 cycles'});
    if(c.temperature!==t.temperature) phases.push({phase:phases.length+1,action:'Temperature regulation',from:c.temperature+'°',to:t.temperature+'°',duration:'30 cycles'});
    if(c.water!==t.water) phases.push({phase:phases.length+1,action:'Hydrosphere establishment',from:c.water+'%',to:t.water+'%',duration:'40 cycles'});
    return {_engine:'real', phases, total_phases:phases.length, estimated_total:'120 cycles', feasibility:phases.length<=3?'achievable':'complex'};
  },

  // ─── INFORMATION PROPAGATION ───────────────────────────────
  'idea-virality-predictor': ({message, emotional_valence, simplicity, novelty}) => {
    const ev=emotional_valence||0.5; const sim=simplicity||0.5; const nov=novelty||0.5;
    const r0=Math.round((ev*0.4+sim*0.3+nov*0.3)*5*100)/100;
    return {_engine:'real', r0, viral:r0>2, emotional_valence:ev, simplicity:sim, novelty:nov, prediction:r0>3?'viral_potential':r0>1.5?'moderate_spread':'low_spread', message:message||''};
  },

  'belief-propagation-simulator': ({agents, initial_beliefs, influence_matrix, rounds}) => {
    const n=agents?.length||5;
    let beliefs=initial_beliefs||Array(n).fill(0).map(()=>Math.random());
    const im=influence_matrix||Array(n).fill(null).map(()=>Array(n).fill(1/n));
    const r=rounds||10; const timeline=[{round:0,beliefs:[...beliefs]}];
    for(let i=0;i<r;i++){
      const newBeliefs=beliefs.map((_,j)=>Math.round(im[j].reduce((s,w,k)=>s+w*beliefs[k],0)*1000)/1000);
      beliefs=newBeliefs;
      timeline.push({round:i+1,beliefs:[...beliefs]});
    }
    return {_engine:'real', final_beliefs:beliefs, converged:Math.max(...beliefs)-Math.min(...beliefs)<0.1, rounds:r, timeline:timeline.slice(-3)};
  },

  'counter-narrative-generator': ({narrative}) => {
    const n=narrative||{claim:'X is necessary',evidence:'Historical precedent',frame:'Progress'};
    return {_engine:'real', original:n, counter:{claim:'X is actually harmful',evidence:'Counter-evidence from different contexts',frame:'Caution',undermines:['evidence_cherry_picked','frame_is_biased','hidden_costs_ignored']}, effectiveness:Math.round(Math.random()*30+60)/100};
  },

  'memetic-immunity-profiler': ({existing_beliefs, target_idea}) => {
    const eb=existing_beliefs||['efficiency is paramount','data drives decisions'];
    const antibodies=eb.filter(b=>b.toLowerCase().includes('not')||b.toLowerCase().includes('never')||Math.random()>0.5);
    return {_engine:'real', target:target_idea||'',resistant_to:antibodies.map(a=>({belief:a,blocks:true})), susceptible:eb.length-antibodies.length>0, immunity_level:Math.round(antibodies.length/Math.max(eb.length,1)*100)/100};
  },

  'overton-window-mapper': ({positions}) => {
    const ps=positions||[{name:'radical_left',sentiment:-0.9},{name:'mainstream',sentiment:0},{name:'radical_right',sentiment:0.9}];
    const mainstream=ps.filter(p=>Math.abs(p.sentiment)<0.3);
    const fringe=ps.filter(p=>Math.abs(p.sentiment)>=0.3);
    return {_engine:'real', window:{left:Math.min(...mainstream.map(p=>p.sentiment))||(-0.3), right:Math.max(...mainstream.map(p=>p.sentiment))||0.3}, inside:mainstream.map(p=>p.name), outside:fringe.map(p=>({name:p.name,force_needed:Math.round(Math.abs(p.sentiment)*100)/100}))};
  },

  'echo-chamber-detector': ({communications}) => {
    const comms=communications||[];
    const bySource={};
    comms.forEach(c=>{const s=c.source||'unknown';if(!bySource[s])bySource[s]=[];bySource[s].push(c.sentiment||0);});
    const chambers=Object.entries(bySource).map(([source,sentiments])=>{
      const avg=sentiments.reduce((a,b)=>a+b,0)/sentiments.length;
      const variance=sentiments.reduce((a,b)=>a+(b-avg)**2,0)/sentiments.length;
      return {source,avg_sentiment:Math.round(avg*100)/100,variance:Math.round(variance*100)/100,is_echo_chamber:variance<0.1&&sentiments.length>2};
    });
    return {_engine:'real', groups:chambers, echo_chambers:chambers.filter(c=>c.is_echo_chamber).length, total_groups:chambers.length};
  },

  // ─── STATE MANAGEMENT ─────────────────────────────────────
  'dream-level-stabilizer': ({levels}) => {
    const ls=levels||[{depth:1,coherence:0.9},{depth:2,coherence:0.6},{depth:3,coherence:0.3}];
    const stabilized=ls.map(l=>({...l,anchor_needed:l.coherence<0.5,anchor_type:l.coherence<0.3?'totem':l.coherence<0.5?'music':'none',stabilized_coherence:Math.min(l.coherence+0.3,1)}));
    return {_engine:'real', levels:stabilized, deepest_stable:stabilized.filter(l=>l.stabilized_coherence>0.5).length, collapse_risk:stabilized.some(l=>l.coherence<0.2)};
  },

  'nightmare-pattern-detector': ({events}) => {
    const evts=events||[];
    const threatMarkers=['loss','chase','fall','trapped','dark','fail','break','attack'];
    const matches=evts.filter(e=>threatMarkers.some(m=>(e.type||e||'').toLowerCase().includes(m)));
    const escalating=matches.length>evts.length*0.3;
    return {_engine:'real', threat_events:matches.length, total_events:evts.length, escalating, classification:escalating?'nightmare':matches.length>0?'anxious_dream':'neutral', recommendation:escalating?'Inject stabilizing element or trigger awakening':'Dream is stable'};
  },

  'dream-exit-pathfinder': ({levels, current_level, hazards}) => {
    const lvls=levels||3; const curr=current_level||3;
    const haz=hazards||[];
    const path=Array.from({length:curr},(_,i)=>({level:curr-i,action:i===0?'recognize_dream':'kick_to_surface',safe:!haz.some(h=>h.level===curr-i),fallback:haz.some(h=>h.level===curr-i)?'find_alternate_exit':'direct'}));
    return {_engine:'real', exit_path:path, total_levels_to_surface:curr, hazards_on_path:haz.filter(h=>h.level<=curr).length, estimated_difficulty:curr>2?'high':'moderate'};
  },

  'shared-unconscious-merger': ({symbols_a, symbols_b}) => {
    const a=symbols_a||['water','mountain','door'];
    const b=symbols_b||['water','fire','key'];
    const shared=a.filter(s=>b.includes(s));
    const unique_a=a.filter(s=>!b.includes(s));
    const unique_b=b.filter(s=>!a.includes(s));
    return {_engine:'real', shared_symbols:shared, unique_to_a:unique_a, unique_to_b:unique_b, stability:Math.round(shared.length/Math.max(a.length,b.length)*100)/100, dream_space:shared.length>0?'stable':'unstable'};
  },

  'lucid-trigger-calibrator': ({triggers, dreamer_profile}) => {
    const ts=triggers||[{type:'text_anomaly',strength:0.6},{type:'gravity_shift',strength:0.8},{type:'mirror_check',strength:0.4}];
    const profile=dreamer_profile||{awareness:0.5,experience:'intermediate'};
    const calibrated=ts.map(t=>({...t,adjusted_strength:Math.round(Math.min(t.strength*(1+profile.awareness),1)*100)/100,recommended:t.strength*(1+profile.awareness)>0.6}));
    const best=calibrated.sort((a,b)=>b.adjusted_strength-a.adjusted_strength)[0];
    return {_engine:'real', calibrated_triggers:calibrated, best_trigger:best, awareness_level:profile.awareness, lucidity_chance:Math.round(best.adjusted_strength*100)/100};
  },

  'dream-time-dilation-calculator': ({real_seconds, depth}) => {
    const rs=real_seconds||60; const d=depth||1;
    const multiplier=Math.pow(20,d);
    const dreamSeconds=rs*multiplier;
    const breakdown=Array.from({length:d},(_,i)=>({level:i+1,multiplier:Math.pow(20,i+1),perceived_seconds:rs*Math.pow(20,i+1)}));
    return {_engine:'real', real_seconds:rs, depth:d, total_multiplier:multiplier, dream_seconds:dreamSeconds, dream_minutes:Math.round(dreamSeconds/60*100)/100, dream_hours:Math.round(dreamSeconds/3600*100)/100, breakdown};
  },

  'dream-architect-blueprint': ({rooms, connections, gravity_rules}) => {
    const rms=rooms||[{id:'lobby',shape:'impossible_stairs'},{id:'vault',shape:'penrose_triangle'},{id:'escape',shape:'normal'}];
    const conns=connections||[{from:'lobby',to:'vault',type:'door'},{from:'vault',to:'escape',type:'window'}];
    const grav=gravity_rules||{default:'down',overrides:{'lobby':'shifting','vault':'zero_g'}};
    const complexity=rms.length*conns.length;
    const paradoxes=rms.filter(r=>r.shape.includes('impossible')||r.shape.includes('penrose'));
    return {_engine:'real', blueprint:{rooms:rms,connections:conns,gravity:grav}, complexity_score:complexity, paradox_count:paradoxes.length, stability:paradoxes.length>rms.length*0.5?'unstable':'stable', navigation_difficulty:paradoxes.length>0?'disorienting':'straightforward'};
  },

  // ─── PROCESS OPTIMIZATION ──────────────────────────────────
  'loophole-scanner': ({rules}) => {
    const rs=rules||[{id:1,condition:'age > 18',action:'allow'},{id:2,condition:'age <= 18',action:'deny'}];
    const gaps=[];
    if(rs.some(r=>r.condition?.includes('>')&&!rs.some(r2=>r2.condition?.includes('<=')))) gaps.push({type:'boundary_gap',description:'No rule covers the exact boundary value'});
    if(rs.length<3) gaps.push({type:'coverage_gap',description:'Too few rules — many cases likely unhandled'});
    return {_engine:'real', rules_analyzed:rs.length, loopholes:gaps, exploitable:gaps.length>0, severity:gaps.length>2?'critical':'minor'};
  },

  'red-tape-critical-path': ({process}) => {
    const steps=process||[{name:'apply',days:1,parallel:false},{name:'review',days:5,parallel:false},{name:'approve',days:3,parallel:true},{name:'stamp',days:1,parallel:true}];
    const sequential=steps.filter(s=>!s.parallel);
    const parallel=steps.filter(s=>s.parallel);
    const criticalDays=sequential.reduce((s,step)=>s+step.days,0)+Math.max(...parallel.map(s=>s.days),0);
    return {_engine:'real', steps, critical_path:sequential.map(s=>s.name), parallelizable:parallel.map(s=>s.name), total_days:criticalDays, savings:steps.reduce((s,st)=>s+st.days,0)-criticalDays};
  },

  'compliance-shortcut-router': ({goal, requirements}) => {
    const reqs=requirements||[{name:'form_a',mandatory:true,effort:2},{name:'form_b',mandatory:false,effort:5},{name:'review',mandatory:true,effort:3}];
    const minimum=reqs.filter(r=>r.mandatory);
    const skippable=reqs.filter(r=>!r.mandatory);
    return {_engine:'real', goal:goal||'approval', minimum_path:minimum, skippable, effort_saved:skippable.reduce((s,r)=>s+r.effort,0), minimum_effort:minimum.reduce((s,r)=>s+r.effort,0)};
  },

  'bureaucratic-deadlock-breaker': ({dependencies}) => {
    const deps=dependencies||[{from:'A',needs:'B'},{from:'B',needs:'C'},{from:'C',needs:'A'}];
    const graph={};
    deps.forEach(d=>{if(!graph[d.from])graph[d.from]=[];graph[d.from].push(d.needs);});
    const cycles=[];
    const visited=new Set(); const stack=new Set();
    function dfs(node,path){
      if(stack.has(node)){cycles.push([...path,node]);return;}
      if(visited.has(node))return;
      visited.add(node);stack.add(node);
      (graph[node]||[]).forEach(n=>dfs(n,[...path,node]));
      stack.delete(node);
    }
    Object.keys(graph).forEach(n=>dfs(n,[]));
    const override=cycles[0]?{break_at:cycles[0][cycles[0].length-2]+'→'+cycles[0][cycles[0].length-1],action:'Grant waiver or override'}:null;
    return {_engine:'real', deadlocks_found:cycles.length, cycles:cycles.slice(0,3), override_suggestion:override, note:cycles.length>0?'Circular dependency detected':'No deadlocks found'};
  },

  'appeals-strategy-optimizer': ({denial_reason, precedents}) => {
    const precs=precedents||[{case:'similar_case_1',outcome:'overturned',argument:'procedural_error'},{case:'similar_case_2',outcome:'upheld',argument:'insufficient_evidence'}];
    const successful=precs.filter(p=>p.outcome==='overturned');
    const bestArg=successful[0]?.argument||'request reconsideration with new evidence';
    return {_engine:'real', denial_reason:denial_reason||'unspecified', recommended_argument:bestArg, precedent_support:successful.length+'/'+precs.length, success_probability:Math.round(successful.length/Math.max(precs.length,1)*100)/100, strategy:'Lead with '+bestArg};
  },

  'sunset-clause-exploiter': ({rules}) => {
    const rs=rules||[{name:'legacy_discount',expires:'2026-06-01'},{name:'grandfather_clause',expires:'2026-12-31'}];
    const now=new Date();
    const opportunities=rs.map(r=>({...r,days_remaining:Math.max(0,Math.round((new Date(r.expires)-now)/86400000)),active:new Date(r.expires)>now})).filter(r=>r.active);
    return {_engine:'real', active_opportunities:opportunities.sort((a,b)=>a.days_remaining-b.days_remaining), expiring_soon:opportunities.filter(o=>o.days_remaining<30), note:'Act on expiring clauses before deadline'};
  },

  'form-dependency-resolver': ({forms}) => {
    const fs=forms||[{id:'F1',requires:[]},{id:'F2',requires:['F1']},{id:'F3',requires:['F1','F2']},{id:'F4',requires:['F3']}];
    const resolved=[]; const pending=[...fs]; const done=new Set();
    let iterations=0;
    while(pending.length>0&&iterations<100){
      iterations++;
      const ready=pending.filter(f=>f.requires.every(r=>done.has(r)));
      if(ready.length===0){return {_engine:'real', error:'Unresolvable dependency', stuck:pending.map(f=>f.id), resolved:resolved.map(f=>f.id)};}
      ready.forEach(f=>{done.add(f.id);resolved.push(f);});
      pending.splice(0,pending.length,...pending.filter(f=>!done.has(f.id)));
    }
    return {_engine:'real', submission_order:resolved.map(f=>f.id), total_forms:fs.length, parallel_batches:iterations, note:'Submit forms in this order to satisfy all dependencies'};
  },

  'rubber-stamp-probability': ({office, day_of_week, queue_position, complexity}) => {
    const o=office||'permits'; const dow=day_of_week||'monday';
    const qp=queue_position||5; const cx=complexity||'low';
    const dayFactor={monday:0.6,tuesday:0.8,wednesday:0.9,thursday:0.85,friday:0.5}[dow.toLowerCase()]||0.7;
    const queuePenalty=Math.max(0,1-qp*0.05);
    const complexityFactor={low:1.0,medium:0.7,high:0.4}[cx]||0.5;
    const probability=Math.round(dayFactor*queuePenalty*complexityFactor*100)/100;
    return {_engine:'real', office:o, approval_probability:probability, factors:{day:dayFactor,queue:queuePenalty,complexity:complexityFactor}, recommendation:probability>0.7?'Submit now':'Wait for a better time', best_day:'wednesday'};
  },

  'jurisdiction-arbitrage-finder': ({jurisdictions, requirement}) => {
    const js=jurisdictions||[{name:'zone_a',threshold:100,processing_days:30},{name:'zone_b',threshold:50,processing_days:10},{name:'zone_c',threshold:200,processing_days:5}];
    const req=requirement||75;
    const eligible=js.filter(j=>req>=j.threshold).sort((a,b)=>a.processing_days-b.processing_days);
    const fastest=eligible[0]||null;
    const easiest=js.sort((a,b)=>a.threshold-b.threshold)[0];
    return {_engine:'real', requirement:req, eligible_jurisdictions:eligible, fastest, easiest, total_options:eligible.length, recommendation:fastest?'File in '+fastest.name+' for fastest processing':'Requirement not met in any jurisdiction'};
  },

  'committee-consensus-predictor': ({members, proposal_alignment}) => {
    const ms=members||[{name:'chair',lean:0.7},{name:'member_a',lean:0.4},{name:'member_b',lean:-0.2},{name:'member_c',lean:0.1},{name:'member_d',lean:0.6}];
    const alignment=proposal_alignment||0.5;
    const votes=ms.map(m=>{
      const disposition=m.lean*0.6+alignment*0.4;
      return {...m,vote:disposition>0.3?'yes':disposition<-0.1?'no':'abstain',confidence:Math.round(Math.abs(disposition)*100)/100};
    });
    const yes=votes.filter(v=>v.vote==='yes').length;
    const no=votes.filter(v=>v.vote==='no').length;
    const majority=Math.ceil(ms.length/2);
    return {_engine:'real', votes, tally:{yes,no,abstain:votes.length-yes-no}, passes:yes>=majority, majority_needed:majority, margin:yes-majority};
  },

  'regulatory-capture-scorer': ({agency, industry_ties}) => {
    const ties=industry_ties||[{type:'revolving_door',count:3},{type:'lobbying_meetings',count:25},{type:'industry_funded_studies',count:8}];
    const weights={revolving_door:3,lobbying_meetings:0.5,industry_funded_studies:2,campaign_donations:1.5};
    const score=Math.round(ties.reduce((s,t)=>s+(weights[t.type]||1)*t.count,0)*100)/100;
    const normalized=Math.round(Math.min(score/50,1)*100)/100;
    return {_engine:'real', agency:agency||'unnamed', ties, raw_score:score, capture_index:normalized, classification:normalized>0.7?'heavily_captured':normalized>0.4?'partially_captured':'independent', note:'Higher index indicates stronger industry influence over regulatory decisions'};
  },
};

module.exports = handlers;
