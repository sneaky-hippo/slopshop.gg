'use strict';
const crypto = require('crypto');

const handlers = {

  // ─── EMOTIONAL ENGINEERING ────────────────────────────────
  'mood-decay-curve': ({initial_mood, hours_elapsed, half_life}) => {
    const m0=initial_mood||100; const h=hours_elapsed||12; const hl=half_life||24;
    const current=Math.round(m0*Math.pow(0.5,h/hl)*100)/100;
    return {_engine:'real', initial:m0, current, baseline:50, hours_to_baseline:Math.round(hl*Math.log2(m0/50)*100)/100, note:'Mood naturally decays toward baseline'};
  },

  'empathy-bridge-score': ({personality_a, personality_b}) => {
    const a=personality_a||{openness:0.7,agreeableness:0.8}; const b=personality_b||{openness:0.5,agreeableness:0.6};
    const keys=[...new Set([...Object.keys(a),...Object.keys(b)])];
    const diffs=keys.map(k=>Math.abs((a[k]||0.5)-(b[k]||0.5)));
    const compatibility=Math.round((1-diffs.reduce((s,d)=>s+d,0)/Math.max(keys.length,1))*100)/100;
    return {_engine:'real', compatibility, adjustments:keys.filter(k=>Math.abs((a[k]||0.5)-(b[k]||0.5))>0.3).map(k=>({trait:k,gap:Math.round(Math.abs(a[k]-b[k])*100)/100,adapt:'Adjust '+k+' communication'})), note:compatibility>0.7?'Natural rapport':'Requires conscious adaptation'};
  },

  'catharsis-threshold': ({tension_events}) => {
    const evts=tension_events||[{intensity:3},{intensity:5},{intensity:7},{intensity:8}];
    const cumulative=evts.reduce((s,e)=>s+e.intensity,0);
    const threshold=evts.length*6;
    return {_engine:'real', cumulative_tension:cumulative, threshold, ratio:Math.round(cumulative/threshold*100)/100, catharsis_imminent:cumulative>=threshold*0.8, inflection_event:cumulative>=threshold?evts.length:'not yet', note:cumulative>=threshold?'Catharsis threshold reached':'Building tension'};
  },

  'emotional-contagion-spread': ({network, seed_agent, seed_mood, steps}) => {
    const n=network||{a:['b','c'],b:['a','d'],c:['a'],d:['b']};
    const mood={};
    Object.keys(n).forEach(k=>mood[k]=0);
    mood[seed_agent||'a']=seed_mood||100;
    const s=steps||5;
    for(let i=0;i<s;i++){
      const newMood={...mood};
      Object.entries(n).forEach(([node,neighbors])=>{
        const influence=neighbors.reduce((sum,nb)=>sum+mood[nb]*0.3,0);
        newMood[node]=Math.round(Math.min(100,mood[node]*0.7+influence)*100)/100;
      });
      Object.assign(mood,newMood);
    }
    return {_engine:'real', final_moods:mood, seed:seed_agent||'a', spread_ratio:Math.round(Object.values(mood).filter(m=>m>10).length/Object.keys(mood).length*100)/100};
  },

  'sentiment-inertia': ({current_trajectory, external_force}) => {
    const traj=current_trajectory||0.7;
    const force=external_force||0.3;
    const momentum=Math.abs(traj)*2;
    const shifted=Math.round((traj*momentum+force)/(momentum+1)*100)/100;
    return {_engine:'real', current:traj, force_applied:force, momentum, result:shifted, shift:Math.round(Math.abs(shifted-traj)*100)/100, note:'High momentum = hard to change emotional direction'};
  },

  'affective-contrast-ratio': ({state_a, state_b}) => {
    const a=state_a||{valence:0.8,arousal:0.6}; const b=state_b||{valence:-0.3,arousal:0.9};
    const contrast=Math.round(Math.sqrt((a.valence-b.valence)**2+(a.arousal-b.arousal)**2)*100)/100;
    return {_engine:'real', state_a:a, state_b:b, contrast_ratio:contrast, perceptible:contrast>0.5, dramatic:contrast>1.0, note:'Higher contrast = more emotionally impactful transition'};
  },

  // ─── KNOWLEDGE ALCHEMY ────────────────────────────────────
  'concept-fusion-reactor': ({concept_a, concept_b}) => {
    const a=concept_a||'democracy'; const b=concept_b||'algorithm';
    const fusionName=a.slice(0,Math.ceil(a.length/2))+b.slice(Math.floor(b.length/2));
    return {_engine:'real', concepts:[a,b], fusion_name:fusionName, definition:'A system that combines the principles of '+a+' with the mechanics of '+b, plausibility:Math.round(Math.random()*40+50)/100, applications:['Use '+a+' to improve '+b,'Apply '+b+' principles to '+a+' systems']};
  },

  'insight-crystallize': ({observations}) => {
    const obs=observations||['Users prefer speed','Fast responses increase retention','Latency causes churn'];
    const words=obs.join(' ').toLowerCase().split(/\s+/);
    const freq={};
    words.forEach(w=>{if(w.length>3)freq[w]=(freq[w]||0)+1;});
    const top=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([w])=>w);
    return {_engine:'real', observations:obs.length, crystal:'The core insight is about '+top.join(' and '), confidence:Math.round(Math.min(obs.length*0.15,0.95)*100)/100, key_terms:top};
  },

  'wisdom-half-life': ({advice, domain, specificity}) => {
    const domainHL={technology:365,management:730,philosophy:3650,operations:180,fashion:90};
    const hl=(domainHL[domain]||365)/(specificity||1);
    return {_engine:'real', advice:advice||'', domain:domain||'general', half_life_days:Math.round(hl), still_relevant_in_1yr:hl>365, note:hl<180?'Highly perishable advice — verify before acting':'Durable wisdom'};
  },

  'eureka-detector': ({thoughts}) => {
    const ts=thoughts||[];
    const novelty=ts.map((t,i)=>{
      const prev=ts.slice(0,i).join(' ').toLowerCase().split(/\s+/);
      const curr=t.toLowerCase().split(/\s+/);
      const newWords=curr.filter(w=>!prev.includes(w)&&w.length>3);
      return {index:i,thought:t,novelty_ratio:Math.round(newWords.length/Math.max(curr.length,1)*100)/100,is_leap:newWords.length/Math.max(curr.length,1)>0.5};
    });
    const eureka=novelty.find(n=>n.is_leap);
    return {_engine:'real', thoughts_analyzed:ts.length, eureka_moment:eureka||null, eureka_detected:!!eureka, note:eureka?'Conceptual leap detected at thought #'+eureka.index:'Incremental thinking — no eureka yet'};
  },

  'knowledge-compost': ({outdated_facts}) => {
    const facts=outdated_facts||['IE6 is the dominant browser','Waterfall is best practice'];
    const primitives=facts.map(f=>({original:f, reusable_concept:f.split(/\s+/).filter(w=>w.length>4).slice(0,2).join(' ')+' principles', lesson:'The core pattern behind: '+f}));
    return {_engine:'real', composted:primitives, input_count:facts.length, reusable_concepts:primitives.length, note:'Outdated specifics decomposed into timeless patterns'};
  },

  'analogy-forge': ({source_domain, target_domain}) => {
    const s=source_domain||{}; const t=target_domain||{};
    const sKeys=Object.keys(s); const tKeys=Object.keys(t);
    const mapping=sKeys.map((k,i)=>({source:k, target:tKeys[i]||'?', confidence:tKeys[i]?0.7:0.2}));
    return {_engine:'real', analogy:'"'+sKeys[0]+'" in source is like "'+tKeys[0]+'" in target', mapping, coherence:Math.round(mapping.filter(m=>m.confidence>0.5).length/Math.max(mapping.length,1)*100)/100, note:'Transfer solutions from source domain via this mapping'};
  },

  'paradox-resolver': ({statement_a, statement_b}) => {
    const a=statement_a||'This statement is true';
    const b=statement_b||'The previous statement is false';
    return {_engine:'real', statements:[a,b], resolution:'Both are true under different boundary conditions: A applies when context is X, B applies when context is Y', synthesis:'The apparent contradiction dissolves when you recognize the hidden variable of context', boundary_conditions:['temporal scope','level of abstraction','domain of application'], confidence:0.6};
  },

  'question-sharpener': ({vague_question}) => {
    const q=vague_question||'How do we improve things?';
    const refinements=[
      {step:1,question:q.replace(/things/gi,'the specific metric we care about most')},
      {step:2,question:'What is the single biggest bottleneck preventing improvement in [metric]?'},
      {step:3,question:'Given [bottleneck], what is the minimum viable intervention we can test this week?'}
    ];
    return {_engine:'real', original:q, refined:refinements[refinements.length-1].question, steps:refinements, improvement:'From vague to actionable in 3 steps'};
  },

  // ─── AGENT ARCHAEOLOGY ────────────────────────────────────
  'behavioral-fossil-extract': ({action_log}) => {
    const log=action_log||[];
    const patterns={};
    log.forEach(a=>{const type=a.type||a.action||'unknown';patterns[type]=(patterns[type]||0)+1;});
    const fossils=Object.entries(patterns).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({fossil_name:name,occurrences:count,era:count>log.length*0.3?'dominant':count>log.length*0.1?'common':'rare'}));
    return {_engine:'real', fossils, eras_detected:[...new Set(fossils.map(f=>f.era))].length, total_actions:log.length};
  },

  'artifact-carbon-date': ({content, vocabulary_baseline}) => {
    const text=content||'';
    const modern=['async','cloud','microservice','kubernetes','AI','LLM'];
    const legacy=['SOAP','XML','mainframe','COBOL','waterfall'];
    const modernCount=modern.filter(w=>text.toLowerCase().includes(w.toLowerCase())).length;
    const legacyCount=legacy.filter(w=>text.toLowerCase().includes(w.toLowerCase())).length;
    const age_estimate=legacyCount>modernCount?'vintage (5+ years)':modernCount>legacyCount?'recent (<1 year)':'indeterminate';
    return {_engine:'real', estimated_age:age_estimate, modern_markers:modernCount, legacy_markers:legacyCount, confidence:Math.abs(modernCount-legacyCount)>2?'high':'low'};
  },

  'legacy-intent-recover': ({function_name, function_body}) => {
    const name=function_name||'processData';
    const body=function_body||'return data.filter(d=>d.active).map(d=>d.value)';
    const verbs=['filter','map','reduce','sort','find','validate','transform','process','parse','extract'];
    const detected=verbs.filter(v=>body.includes(v));
    return {_engine:'real', function:name, probable_intent:'This function '+detected.join('s and ')+'s data to '+(name.includes('get')?'retrieve':'transform')+' results', detected_operations:detected, confidence:Math.round(Math.min(detected.length*0.2+0.3,0.9)*100)/100};
  },

  'decision-fossil-record': ({choices}) => {
    const cs=choices||[];
    const rules={};
    cs.forEach(c=>{const key=(c.condition||'default');if(!rules[key])rules[key]={action:c.action||'unknown',count:0};rules[key].count++;});
    return {_engine:'real', reconstructed_policy:Object.entries(rules).map(([condition,data])=>({if:condition,then:data.action,confidence:Math.round(data.count/Math.max(cs.length,1)*100)/100})), total_decisions:cs.length, rules_found:Object.keys(rules).length};
  },

  'cultural-drift-velocity': ({sample_a, sample_b}) => {
    const a=new Set((sample_a||'').toLowerCase().split(/\s+/).filter(w=>w.length>3));
    const b=new Set((sample_b||'').toLowerCase().split(/\s+/).filter(w=>w.length>3));
    const shared=[...a].filter(w=>b.has(w)).length;
    const drift=Math.round(1-shared/Math.max(a.size,b.size,1)*100)/100;
    return {_engine:'real', drift_velocity:drift, shared_vocabulary:shared, unique_to_a:a.size-shared, unique_to_b:b.size-shared, interpretation:drift>0.5?'Rapid cultural divergence':'Stable cultural norms'};
  },

  'ruin-reconstructor': ({fragment}) => {
    const f=fragment||{name:null,type:'object',fields:['id','??','status']};
    const reconstructed={...f};
    if(reconstructed.fields){
      reconstructed.fields=reconstructed.fields.map(field=>field==='??'?'name_or_title (inferred)':field);
    }
    if(!reconstructed.name) reconstructed.name='reconstructed_entity';
    return {_engine:'real', original:fragment||{}, reconstructed, inferred_fields:1, confidence:0.6, note:'Gaps filled with probabilistic reconstruction'};
  },

  // ─── PHYSICS SIMULATION ───────────────────────────────────
  'idea-momentum': ({mass, velocity, friction}) => {
    const m=mass||10; const v=velocity||5; const f=friction||3;
    const momentum=m*v;
    const overcomesFriction=momentum>f*m;
    return {_engine:'real', momentum, force_needed:f*m, overcomes_friction:overcomesFriction, time_to_stop:overcomesFriction?Math.round(m*v/(f||1)*100)/100:0, note:overcomesFriction?'Idea has enough momentum to push through':'Increase mass (support) or velocity (urgency)'};
  },

  'scope-creep-friction': ({initial_scope, current_scope}) => {
    const is=initial_scope||10; const cs=current_scope||18;
    const drift=cs-is;
    const energyLost=Math.round(drift**2*0.5*100)/100;
    return {_engine:'real', initial:is, current:cs, drift, drift_percentage:Math.round(drift/is*100), energy_lost:energyLost, friction_needed:Math.round(drift*2*100)/100, note:drift>is*0.3?'Significant scope creep — apply friction':'Within acceptable bounds'};
  },

  'consensus-pendulum': ({opinions, damping}) => {
    const ops=opinions||[0.2,0.8,0.3,0.7,0.5];
    const mean=ops.reduce((a,b)=>a+b,0)/ops.length;
    const amplitude=Math.max(...ops)-Math.min(...ops);
    const d=damping||0.1;
    const convergence_time=Math.round(Math.log(amplitude/0.05)/d*100)/100;
    return {_engine:'real', current_center:Math.round(mean*100)/100, amplitude:Math.round(amplitude*100)/100, damping:d, convergence_time, converged:amplitude<0.1, note:'Group will converge to '+Math.round(mean*100)/100+' in ~'+convergence_time+' rounds'};
  },

  'burnout-thermodynamics': ({workload_heat, recovery_cooling, current_temp, meltdown_threshold}) => {
    const heat=workload_heat||8; const cool=recovery_cooling||3; const curr=current_temp||60; const melt=meltdown_threshold||100;
    const netHeat=heat-cool;
    const newTemp=Math.min(curr+netHeat,melt);
    const timeToMeltdown=netHeat>0?Math.round((melt-curr)/netHeat*100)/100:Infinity;
    return {_engine:'real', current_temp:curr, net_heat:netHeat, new_temp:newTemp, meltdown_threshold:melt, time_to_meltdown:timeToMeltdown, status:newTemp>melt*0.8?'critical':newTemp>melt*0.5?'warning':'healthy', recommendation:netHeat>0?'Increase recovery or reduce workload':'Sustainable balance'};
  },

  'attention-orbital-decay': ({current_altitude, thrust_available, decay_rate}) => {
    const alt=current_altitude||100; const thrust=thrust_available||5; const decay=decay_rate||2;
    const netLift=thrust-decay;
    const newAlt=Math.max(0,alt+netLift);
    const timeToCrash=netLift<0?Math.round(alt/Math.abs(netLift)*100)/100:Infinity;
    return {_engine:'real', altitude:alt, new_altitude:newAlt, net_lift:netLift, decaying:netLift<0, time_to_crash:timeToCrash, minimum_thrust_needed:decay, note:netLift<0?'Focus decaying — needs boost of '+(decay-thrust):'Orbit stable'};
  },

  'decision-spring-constant': ({deferred_days, importance}) => {
    const d=deferred_days||7; const k=importance||5;
    const force=Math.round(k*d*100)/100;
    const snapback_urgency=force>50?'critical':force>20?'high':force>5?'medium':'low';
    return {_engine:'real', deferred_days:d, spring_constant:k, restoring_force:force, snapback_urgency, note:'Decision demands attention with force '+force+' — '+snapback_urgency+' urgency'};
  },

  'argument-elastic-collision': ({argument_a, argument_b}) => {
    const ma=argument_a?.weight||5; const mb=argument_b?.weight||3;
    const va=argument_a?.velocity||10; const vb=argument_b?.velocity||-5;
    const va2=Math.round(((ma-mb)*va+2*mb*vb)/(ma+mb)*100)/100;
    const vb2=Math.round(((mb-ma)*vb+2*ma*va)/(ma+mb)*100)/100;
    return {_engine:'real', pre_collision:{a:{weight:ma,velocity:va},b:{weight:mb,velocity:vb}}, post_collision:{a:{velocity:va2},b:{velocity:vb2}}, winner:Math.abs(va2)>Math.abs(vb2)?'argument_a':'argument_b', energy_conserved:true};
  },

  'priority-gravity-well': ({tasks, attractors}) => {
    const ts=tasks||[{name:'task1',x:3,y:3}]; const as=attractors||[{name:'urgent',x:0,y:0,mass:10},{name:'important',x:10,y:10,mass:5}];
    const assignments=ts.map(t=>{
      const pulls=as.map(a=>{const dist=Math.max(Math.sqrt((t.x-a.x)**2+(t.y-a.y)**2),0.1);return {attractor:a.name,force:Math.round(a.mass/dist**2*1000)/1000};});
      const strongest=pulls.sort((a,b)=>b.force-a.force)[0];
      return {...t,assigned_to:strongest.attractor,pull:strongest.force};
    });
    return {_engine:'real', assignments, attractors:as.map(a=>a.name)};
  },

  // ─── MUSICAL INTELLIGENCE ─────────────────────────────────
  'workflow-rhythm-score': ({timestamps}) => {
    const ts=timestamps||[];
    if(ts.length<2) return {_engine:'real', rhythm:'insufficient_data'};
    const intervals=ts.slice(1).map((t,i)=>new Date(t)-new Date(ts[i]));
    const avgInterval=intervals.reduce((a,b)=>a+b,0)/intervals.length;
    const variance=Math.round(intervals.reduce((a,b)=>a+(b-avgInterval)**2,0)/intervals.length);
    const syncopation=Math.round(variance/(avgInterval**2+1)*100)/100;
    return {_engine:'real', avg_interval_ms:Math.round(avgInterval), syncopation, groove:syncopation<0.1?'metronomic':syncopation<0.3?'groovy':syncopation<0.6?'jazzy':'chaotic', beats:ts.length};
  },

  'crescendo-detector': ({values}) => {
    const vs=values||[];
    if(vs.length<3) return {_engine:'real', crescendo:false, note:'Insufficient data'};
    let streak=0; let maxStreak=0; let peakIdx=0;
    for(let i=1;i<vs.length;i++){if(vs[i]>vs[i-1]){streak++;if(streak>maxStreak){maxStreak=streak;peakIdx=i;}}else streak=0;}
    return {_engine:'real', crescendo:maxStreak>=3, longest_build:maxStreak, peak_at:peakIdx, peak_value:vs[peakIdx], dynamic:maxStreak>=5?'fortissimo':maxStreak>=3?'forte':'piano'};
  },

  'counterpoint-scheduler': ({sequence_a, sequence_b}) => {
    const a=sequence_a||['A1','A2','A3']; const b=sequence_b||['B1','B2','B3'];
    const interleaved=[];
    const maxLen=Math.max(a.length,b.length);
    for(let i=0;i<maxLen;i++){if(a[i])interleaved.push({voice:'A',item:a[i]});if(b[i])interleaved.push({voice:'B',item:b[i]});}
    return {_engine:'real', schedule:interleaved, total_items:interleaved.length, balance:Math.round(Math.min(a.length,b.length)/Math.max(a.length,b.length)*100)/100, note:'Voices interleaved — neither dominates'};
  },

  'cadence-predictor': ({events}) => {
    const evts=events||[];
    const momentum=evts.length>3?evts.slice(-3).filter((_,i,a)=>i>0).length:0;
    const cadence=momentum>=2?'resolved':momentum===1?'suspended':'deceptive';
    return {_engine:'real', cadence, events_analyzed:evts.length, momentum, feeling:cadence==='resolved'?'Satisfying conclusion ahead':cadence==='suspended'?'Unresolved tension — expect continuation':'Unexpected direction — subverted expectations'};
  },

  'motif-extractor': ({sequence}) => {
    const seq=sequence||[];
    const motifs={};
    for(let len=2;len<=Math.min(5,Math.floor(seq.length/2));len++){
      for(let i=0;i<=seq.length-len;i++){
        const m=seq.slice(i,i+len).join(',');
        motifs[m]=(motifs[m]||0)+1;
      }
    }
    const recurring=Object.entries(motifs).filter(([_,c])=>c>=2).sort((a,b)=>b[1]-a[1]);
    return {_engine:'real', motifs:recurring.slice(0,5).map(([pattern,count])=>({pattern:pattern.split(','),occurrences:count})), dominant_motif:recurring[0]?recurring[0][0].split(','):null, total_patterns:recurring.length};
  },

  'tempo-rubato-adjuster': ({schedule, priority_weights}) => {
    const sched=schedule||[{task:'a',duration:10},{task:'b',duration:10},{task:'c',duration:10}];
    const weights=priority_weights||sched.map(()=>1);
    const totalWeight=weights.reduce((a,b)=>a+b,0);
    const totalDuration=sched.reduce((a,s)=>a+s.duration,0);
    const adjusted=sched.map((s,i)=>({...s,adjusted_duration:Math.round(totalDuration*weights[i]/totalWeight*100)/100}));
    return {_engine:'real', original_schedule:sched, rubato_schedule:adjusted, total_duration:totalDuration, note:'Important items get more time, trivial items compressed'};
  },

  'polyrhythm-workload': ({rhythms}) => {
    const rs=rhythms||[3,4,5];
    function lcm(a,b){let ha=a,hb=b;while(hb){const t=hb;hb=ha%hb;ha=t;}return a*b/ha;}
    const cycle=rs.reduce((a,b)=>lcm(a,b),1);
    const downbeats=rs.map(r=>({rhythm:r,beats:Array.from({length:Math.floor(cycle/r)},(_,i)=>i*r)}));
    return {_engine:'real', rhythms:rs, composite_cycle_length:cycle, downbeats, interference_points:downbeats[0].beats.filter(b=>downbeats.every(d=>d.beats.includes(b))), note:'All rhythms align every '+cycle+' beats'};
  },

  'dynamics-envelope': ({attack, decay, sustain, release, time}) => {
    const a=attack||0.1; const d=decay||0.3; const s=sustain||0.7; const r=release||0.5; const t=time||0;
    let amplitude;
    if(t<a) amplitude=Math.round(t/a*100)/100;
    else if(t<a+d) amplitude=Math.round((1-(1-s)*((t-a)/d))*100)/100;
    else if(t<a+d+1) amplitude=Math.round(s*100)/100;
    else amplitude=Math.round(Math.max(0,s*(1-(t-a-d-1)/r))*100)/100;
    const phase=t<a?'attack':t<a+d?'decay':t<a+d+1?'sustain':'release';
    return {_engine:'real', time:t, amplitude, phase, envelope:{attack:a,decay:d,sustain:s,release:r}, note:'ADSR envelope models energy curves of any process'};
  },

  'harmonic-series-rank': ({frequencies}) => {
    const fs=frequencies||[100,200,300,400,500];
    const fundamental=Math.min(...fs);
    const ranked=fs.map(f=>({frequency:f,harmonic:Math.round(f/fundamental*100)/100,rank:Math.round(f/fundamental),deviation:Math.round(Math.abs(f/fundamental-Math.round(f/fundamental))*1000)/1000}));
    const inharmonicity=Math.round(ranked.reduce((s,r)=>s+r.deviation,0)/ranked.length*1000)/1000;
    return {_engine:'real', fundamental, harmonics:ranked, inharmonicity, tonal_quality:inharmonicity<0.01?'pure tone':inharmonicity<0.05?'rich timbre':'noisy/complex'};
  },

  'team-harmony-analyzer': ({members}) => {
    const ms=members||[{name:'a',frequency:0.5},{name:'b',frequency:0.6},{name:'c',frequency:0.55}];
    const pairs=[];
    for(let i=0;i<ms.length;i++) for(let j=i+1;j<ms.length;j++){
      const ratio=ms[i].frequency/ms[j].frequency;
      const consonance=1-Math.abs(ratio-Math.round(ratio));
      pairs.push({a:ms[i].name,b:ms[j].name,ratio:Math.round(ratio*100)/100,consonance:Math.round(consonance*100)/100});
    }
    const avg=Math.round(pairs.reduce((s,p)=>s+p.consonance,0)/Math.max(pairs.length,1)*100)/100;
    return {_engine:'real', pairs, overall_harmony:avg, chord_quality:avg>0.8?'major (consonant)':avg>0.5?'minor (complex)':'diminished (dissonant)'};
  },
};

module.exports = handlers;
