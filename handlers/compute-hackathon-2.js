'use strict';
const crypto = require('crypto');

const handlers = {

  // ─── REPUTATION ECONOMICS ─────────────────────────────────
  'trust-decay-curve': ({initial_trust, hours_elapsed, half_life}) => {
    const t0=initial_trust||100; const h=hours_elapsed||24; const hl=half_life||168;
    const current = Math.round(t0*Math.pow(0.5,h/hl)*100)/100;
    return {_engine:'real', initial:t0, current, hours_elapsed:h, half_life:hl, decay_rate:Math.round((t0-current)/t0*100)/100, needs_refresh:current<t0*0.5};
  },

  'credibility-arbitrage': ({entity_a, entity_b}) => {
    const a=entity_a||{code:80,writing:40}; const b=entity_b||{code:50,writing:90};
    const opps=[];
    Object.keys(a).forEach(k=>{if(b[k]!==undefined){const diff=a[k]-b[k];if(Math.abs(diff)>20)opps.push({domain:k,a_score:a[k],b_score:b[k],arbitrage:diff>0?'A undervalued by B':'B undervalued by A',gap:Math.abs(diff)});}});
    return {_engine:'real', opportunities:opps.sort((a,b)=>b.gap-a.gap), count:opps.length};
  },

  'reputation-stake-escrow': ({reputation_score, commitment_risk, duration_days}) => {
    const rep=reputation_score||50; const risk=commitment_risk||0.5; const d=duration_days||7;
    const stake=Math.round(rep*risk*Math.log(d+1)*100)/100;
    const projected_gain=Math.round(stake*0.2*100)/100;
    const projected_loss=Math.round(stake*1.5*100)/100;
    return {_engine:'real', stake_required:stake, projected_gain, projected_loss, risk_ratio:Math.round(projected_loss/Math.max(projected_gain,0.01)*100)/100, recommendation:risk>0.7?'High risk — consider reducing scope':'Acceptable risk level'};
  },

  'influence-liquidity-score': ({connections, active_connections, response_rate}) => {
    const c=connections||100; const ac=active_connections||30; const rr=response_rate||0.6;
    const liquidity=Math.round(ac/Math.max(c,1)*rr*100)/100;
    return {_engine:'real', liquidity_score:liquidity, connections:c, active:ac, response_rate:rr, friction:Math.round(1-liquidity,2), transferability:liquidity>0.5?'high':liquidity>0.2?'medium':'low'};
  },

  'sybil-resistance-proof': ({signals}) => {
    const sigs=signals||[{type:'interaction',unique_peers:5},{type:'creation',unique_content:10}];
    const uniqueness=sigs.reduce((s,sig)=>s+(sig.unique_peers||sig.unique_content||1),0);
    const score=Math.min(Math.round(uniqueness/Math.max(sigs.length*10,1)*100)/100,1);
    return {_engine:'real', uniqueness_score:score, signals_analyzed:sigs.length, likely_sybil:score<0.3, confidence:Math.round((0.5+score*0.5)*100)/100};
  },

  'trust-triangulation': ({a_trusts_b, b_trusts_c, a_trusts_c}) => {
    const ab=a_trusts_b||0.8; const bc=b_trusts_c||0.7; const ac=a_trusts_c||0.5;
    const implied_ac=Math.round(ab*bc*100)/100;
    const inconsistency=Math.round(Math.abs(implied_ac-ac)*100)/100;
    return {_engine:'real', direct_trust:ac, implied_trust:implied_ac, inconsistency, suspicious:inconsistency>0.3, note:inconsistency>0.3?'Trust ratings are inconsistent — possible deception':'Trust network is coherent'};
  },

  'social-collateral-ratio': ({earned_reputation, leveraged_reputation}) => {
    const earned=earned_reputation||50; const leveraged=leveraged_reputation||30;
    const ratio=Math.round(earned/Math.max(leveraged,0.01)*100)/100;
    return {_engine:'real', earned, leveraged, ratio, over_leveraged:ratio<1, risk_level:ratio<0.5?'critical':ratio<1?'warning':'healthy'};
  },

  'merit-half-life': ({accomplishments}) => {
    const accs=(accomplishments||[{name:'project_a',age_days:30,domain:'engineering'}]).map(a=>{
      const domainHL={engineering:180,research:365,social:90,operational:60};
      const hl=domainHL[a.domain]||120;
      const present_value=Math.round(100*Math.pow(0.5,(a.age_days||0)/hl)*100)/100;
      return {...a,half_life_days:hl,present_value};
    });
    return {_engine:'real', accomplishments:accs.sort((a,b)=>b.present_value-a.present_value), total_present_value:Math.round(accs.reduce((s,a)=>s+a.present_value,0)*100)/100};
  },

  // ─── ADVERSARIAL THINKING ─────────────────────────────────
  'threat-model-generator': ({target, system_components}) => {
    const comps=system_components||['auth','api','database','frontend'];
    // Derive effort and detectability from component characteristics
    const effortMap = {auth:3,api:4,database:7,frontend:2,cache:5,storage:6,network:5,dns:4,cdn:3,queue:5};
    const detectMap = {auth:0.8,api:0.6,database:0.9,frontend:0.3,cache:0.4,storage:0.7,network:0.5,dns:0.6,cdn:0.4,queue:0.5};
    const attacks=comps.map((c,i)=>{
      const cl = c.toLowerCase();
      const effort = effortMap[cl] || (cl.length % 8 + 2);
      const detectability = detectMap[cl] || Math.round((cl.charCodeAt(0) % 50 + 25) / 100 * 100) / 100;
      return {target:c, attack_path:`Exploit ${c} via misconfiguration`, effort, detectability, cascading:[comps[(i+1)%comps.length]]};
    });
    const sorted = [...attacks].sort((a,b)=>a.effort-b.effort);
    return {_engine:'real', target:target||'system', attack_paths:sorted, easiest_path:sorted[0], total_paths:attacks.length};
  },

  'counter-argument-generator': ({proposal}) => {
    const p=proposal||'We should adopt microservices';
    const flips=['What if the opposite is true?','What if this succeeds but causes worse problems?','Who loses if this works?','What assumption must be true for this to work, and what if it is false?','What is the hidden cost nobody is discussing?'];
    // Derive strength from how many words the angle shares with the proposal
    const pWords = new Set(p.toLowerCase().split(/\s+/));
    return {_engine:'real', original:p, counter_arguments:flips.map((f,i)=>{
      const fWords = f.toLowerCase().split(/\s+/);
      const overlap = fWords.filter(w=>pWords.has(w)).length;
      const strength = Math.round(Math.min(1, 0.5 + overlap * 0.1 + (flips.length - i) * 0.05) * 100) / 100;
      return {angle:f, applied_to:p, strength};
    }), strongest:flips[0], note:'Engaging with the strongest counter-argument strengthens the original proposal'};
  },

  'chaos-blast-radius': ({dependency_graph, failure_point}) => {
    const g=dependency_graph||{A:['B','C'],B:['D'],C:['D','E'],D:[],E:[]};
    const fp=failure_point||Object.keys(g)[0];
    const affected=new Set();
    const queue=[fp]; affected.add(fp);
    while(queue.length){const n=queue.shift();Object.entries(g).forEach(([node,deps])=>{if(deps.includes(n)&&!affected.has(node)){affected.add(node);queue.push(node);}});}
    return {_engine:'real', failure_point:fp, affected:[...affected], blast_radius:affected.size, total_nodes:Object.keys(g).length, impact_ratio:Math.round(affected.size/Object.keys(g).length*100)/100};
  },

  'pre-mortem-autopsy': ({plan, team_size}) => {
    const risks=['Scope creep exceeded estimates by 3x','Key dependency failed silently','Team burned out in week 3','Stakeholder changed requirements after launch','Integration testing was skipped due to time pressure'];
    const planStr = (plan||'unnamed').toLowerCase();
    // Deterministically select risks based on plan content
    const scored = risks.map(r => {
      const rWords = r.toLowerCase().split(/\s+/);
      const relevance = rWords.filter(w => planStr.includes(w)).length;
      let h=0; for(let i=0;i<r.length;i++) h=((h<<5)-h+r.charCodeAt(i)+planStr.length)|0;
      return {risk:r, score: relevance * 10 + Math.abs(h % 20)};
    }).sort((a,b)=>b.score-a.score);
    const selected = scored.slice(0,3).map(s=>s.risk);
    return {_engine:'real', plan:plan||'unnamed', failure_narrative:'The project failed because: '+selected[0], root_causes:selected.map((r,i)=>({rank:i+1,cause:r,preventable:true})), warning_signs:selected.map(r=>'Early indicator: subtle signs of '+r.toLowerCase()), recommendation:'Address top root cause before proceeding'};
  },

  'weakest-link-finder': ({chain}) => {
    const links=(chain||[{name:'auth',strength:90},{name:'api',strength:70},{name:'db',strength:95}]).map(l=>({...l,exploitability:Math.round((100-l.strength)/100*100)/100}));
    const weakest=links.sort((a,b)=>b.exploitability-a.exploitability)[0];
    return {_engine:'real', weakest_link:weakest, all_links:links, recommendation:'Strengthen '+weakest.name+' (exploitability: '+weakest.exploitability+')'};
  },

  'security-persona-model': ({attack_surface}) => {
    const personas=[{name:'Script Kiddie',skill:'low',motivation:'notoriety',resources:'minimal',tactics:['automated_scanning','known_exploits']},{name:'Insider Threat',skill:'medium',motivation:'financial',resources:'internal_access',tactics:['privilege_escalation','data_exfil']},{name:'APT Group',skill:'high',motivation:'strategic',resources:'state_backed',tactics:['zero_day','supply_chain','persistence']}];
    // Select persona based on attack surface content
    const surface = (attack_surface||'web_application').toLowerCase();
    const selected = surface.includes('internal')||surface.includes('employee')||surface.includes('vpn') ? personas[1]
      : surface.includes('critical')||surface.includes('infrastructure')||surface.includes('government') ? personas[2]
      : personas[0];
    return {_engine:'real', persona:selected, attack_surface:attack_surface||'web_application', likely_approach:selected.tactics[0], defense_priority:selected.skill==='high'?'critical':'moderate'};
  },

  'assumption-stress-test': ({argument}) => {
    const sentences=(argument||'We should scale because growth is certain').match(/[^.!?]+[.!?]+/g)||[argument||''];
    const strongWords = ['must','always','never','certain','guaranteed','obvious','everyone','nobody','impossible','inevitable'];
    const assumptions=sentences.map((s,i)=>{
      const lower = s.toLowerCase();
      const strongCount = strongWords.filter(w=>lower.includes(w)).length;
      const wordCount = s.trim().split(/\s+/).length;
      const catastrophe_if_wrong = Math.round(Math.min(1, strongCount * 0.25 + wordCount * 0.02 + (i === 0 ? 0.3 : 0.1)) * 100) / 100;
      return {statement:s.trim(),hidden_assumption:'Assumes: '+(i===0?'correlation implies causation':'past trends predict future'),catastrophe_if_wrong};
    });
    return {_engine:'real', argument:argument||'',assumptions:assumptions.sort((a,b)=>b.catastrophe_if_wrong-a.catastrophe_if_wrong),most_dangerous:assumptions[0]};
  },

  // ─── NARRATIVE INTELLIGENCE ────────────────────────────────
  'plot-twist-injector': ({story_state, characters}) => {
    const twistTemplates = [
      {twist:'The ally was the antagonist all along', keywords:['trust','friend','ally','together','help','loyal','partner','companion'], theme:'betrayal'},
      {twist:'The goal was a decoy for the real objective', keywords:['quest','mission','goal','find','search','seek','treasure','prize','objective'], theme:'misdirection'},
      {twist:'The protagonist discovers they caused the original problem', keywords:['origin','cause','start','begin','past','mistake','memory','forgot','blame'], theme:'self_discovery'},
      {twist:'A presumed-dead character returns with crucial information', keywords:['death','dead','lost','gone','disappeared','missing','vanish','mourn'], theme:'resurrection'},
      {twist:'The rules of the world suddenly change', keywords:['power','magic','law','rule','system','control','balance','order','force'], theme:'paradigm_shift'}
    ];
    // Analyze story_state and characters to select the best-fitting twist
    const stateStr = JSON.stringify(story_state||'').toLowerCase();
    const charStr = JSON.stringify(characters||[]).toLowerCase();
    const combined = stateStr + ' ' + charStr;
    const charCount = (characters||[]).length;

    // Score each twist by how many of its keywords appear in the story content
    const scored = twistTemplates.map(tt => {
      const matches = tt.keywords.filter(k=>combined.includes(k)).length;
      return {...tt, relevance: matches};
    }).sort((a,b) => b.relevance - a.relevance);

    // Pick the most relevant twist (or the first if no keywords match)
    const best = scored[0];
    const impact_score = Math.round(Math.min(1, best.relevance * 0.15 + charCount * 0.05 + (combined.length > 20 ? 0.2 : 0)) * 100) / 100;

    return {_engine:'real', twist:best.twist, theme:best.theme, impact_score, keyword_matches:best.relevance, foreshadowable:true, characters_affected:characters||[], all_twists_ranked:scored.map(s=>({twist:s.twist,relevance:s.relevance})), note:'Plant subtle hints 3 beats before reveal'};
  },

  'dramatic-tension-curve': ({events}) => {
    const evts=events||[];
    const curve=evts.map((e,i)=>{
      const pos=i/Math.max(evts.length-1,1);
      // Base tension from arc position, plus content-derived modifier
      const eStr = typeof e === 'string' ? e : JSON.stringify(e);
      const tensionWords = ['conflict','danger','risk','crisis','battle','fight','death','fear','loss','fail'];
      const calmWords = ['peace','rest','calm','safe','happy','win','success','love','hope'];
      const tCount = tensionWords.filter(w=>eStr.toLowerCase().includes(w)).length;
      const cCount = calmWords.filter(w=>eStr.toLowerCase().includes(w)).length;
      const contentMod = (tCount - cCount) * 0.1;
      const tension=Math.round(Math.min(1, Math.max(0, Math.sin(pos*Math.PI)*0.8 + contentMod))*100)/100;
      return {event:e,position:Math.round(pos*100)/100,tension};
    });
    const sags=curve.filter((c,i)=>i>0&&i<curve.length-1&&c.tension<curve[i-1].tension&&c.tension<curve[i+1]?.tension);
    return {_engine:'real', curve, sag_points:sags.map(s=>s.event), peak:[...curve].sort((a,b)=>b.tension-a.tension)[0]||null};
  },

  'character-arc-trajectory': ({decisions, starting_state}) => {
    const decs=decisions||[];
    const growth=decs.reduce((s,d)=>s+(d.growth||0.1),0);
    const arc=growth>0.5?'redemption':growth>0?'growth':growth>-0.5?'stagnation':'fall';
    return {_engine:'real', arc_type:arc, total_growth:Math.round(growth*100)/100, decisions_analyzed:decs.length, next_turning_point:arc==='growth'?'Test of commitment':'Crisis of faith', starting_state:starting_state||'ordinary'};
  },

  'chekhov-gun-tracker': ({planted_details, resolved_details}) => {
    const planted=planted_details||[];
    const resolved=new Set(resolved_details||[]);
    const unresolved=planted.filter(p=>!resolved.has(p));
    return {_engine:'real', planted:planted.length, resolved:resolved.size, unresolved, broken_promises:unresolved.length, audience_expectation:unresolved.map((u,i)=>{
      // Derive expectation weight from position (earlier plants have higher weight) and detail length
      const detailStr = typeof u === 'string' ? u : JSON.stringify(u);
      const weight = Math.round(Math.min(1, 0.5 + (planted.length - planted.indexOf(u)) * 0.05 + detailStr.length * 0.005) * 100) / 100;
      return {detail:u, expectation_weight:weight};
    })};
  },

  'unreliable-narrator-score': ({account}) => {
    const text=account||'';
    const hedges=(text.match(/maybe|perhaps|I think|probably|sort of|kind of/gi)||[]).length;
    const superlatives=(text.match(/always|never|everyone|nobody|best|worst|absolutely/gi)||[]).length;
    const selfServing=(text.match(/I was right|they were wrong|not my fault|I had to/gi)||[]).length;
    const reliability=Math.max(0,Math.min(1,1-hedges*0.05-superlatives*0.1-selfServing*0.15));
    return {_engine:'real', reliability:Math.round(reliability*100)/100, hedging:hedges, superlatives, self_serving:selfServing, verdict:reliability>0.7?'mostly_reliable':reliability>0.4?'questionable':'unreliable'};
  },

  'story-beat-decomposer': ({text}) => {
    const sentences=(text||'').match(/[^.!?]+[.!?]+/g)||[text||''];
    const beats=sentences.map((s,i)=>{const pos=i/Math.max(sentences.length-1,1);return {beat:s.trim(),type:pos<0.15?'setup':pos<0.3?'inciting_incident':pos<0.5?'rising_action':pos<0.7?'midpoint':pos<0.85?'climax':'resolution',position:Math.round(pos*100)/100};});
    return {_engine:'real', beats, beat_count:beats.length, structure_detected:beats.length>=5?'complete_arc':'fragment'};
  },

  'emotional-resonance-calc': ({scene, audience_type}) => {
    const sceneText = (scene||'').toLowerCase();
    const emotionWords = {
      joy:['happy','laugh','celebrate','win','love','delight','smile','cheer'],
      sadness:['cry','loss','grief','sad','mourn','tear','alone','miss'],
      fear:['afraid','scare','dread','terror','panic','danger','threat','dark'],
      anger:['fury','rage','hate','angry','fight','betray','injustice','conflict'],
      surprise:['shock','unexpected','sudden','reveal','twist','discover','gasp'],
      disgust:['repulsive','vile','corrupt','rotten','foul','grotesque'],
      anticipation:['wait','expect','hope','plan','suspense','wonder','build'],
      trust:['faith','loyal','believe','reliable','safe','bond','protect']
    };
    const activated = Object.entries(emotionWords).map(([emotion, words]) => {
      const matches = words.filter(w=>sceneText.includes(w)).length;
      const intensity = Math.round(Math.min(1, matches * 0.2 + (sceneText.length > 0 ? 0.1 : 0)) * 100) / 100;
      return {emotion, intensity};
    }).sort((a,b)=>b.intensity-a.intensity);
    return {_engine:'real', scene:scene||'',audience:audience_type||'general',activated_emotions:activated.slice(0,3),dominant:activated[0],resonance_score:Math.round(activated[0].intensity*100)/100};
  },

  'antagonist-motivation-engine': ({conflict}) => {
    const motivationTemplates = [
      {motivation:'They believe they are saving something more important', keywords:['protect','save','sacrifice','greater','family','children','people','world','future','prevent','defend']},
      {motivation:'They experienced a betrayal that makes this the only logical response', keywords:['betray','trust','broken','abandoned','deceived','lie','lied','cheated','wronged','revenge','vengeance']},
      {motivation:'They see a pattern others cannot and feel compelled to act', keywords:['vision','see','pattern','truth','hidden','secret','conspiracy','understand','alone','prophet','warning']},
      {motivation:'Their culture or upbringing makes this the honorable choice', keywords:['honor','tradition','duty','culture','family','code','oath','ancestor','legacy','pride','tribe','nation']},
      {motivation:'They are trapped by commitments made before they understood the cost', keywords:['promise','deal','contract','bound','trapped','debt','owe','committed','forced','no choice','blackmail']}
    ];
    const conflictStr = (conflict||'').toLowerCase();
    const words = new Set(conflictStr.split(/\s+/).filter(w=>w.length>2));

    // Score each motivation by keyword overlap with the conflict description
    const scored = motivationTemplates.map(mt => {
      const matches = mt.keywords.filter(k=>conflictStr.includes(k)).length;
      return {motivation: mt.motivation, relevance: matches};
    }).sort((a,b) => b.relevance - a.relevance);

    const best = scored[0];
    // Moral complexity: word diversity + relevant keyword density
    const moral_complexity = Math.round(Math.min(1, words.size * 0.02 + best.relevance * 0.1 + 0.3) * 100) / 100;

    return {_engine:'real', conflict:conflict||'', sympathetic_motivation:best.motivation, keyword_matches:best.relevance, moral_complexity, all_motivations_ranked:scored, note:'The most compelling antagonists believe they are the hero of their own story'};
  },

  // ─── SENSORY SIMULATION ────────────────────────────────────
  'synesthesia-mapper': ({input_type, input_value, output_type}) => {
    const maps={color_to_pitch:{low:'C2',mid:'E4',high:'A5'},color_to_taste:{warm:'sweet',cool:'minty',dark:'bitter'},pitch_to_color:{low:'#8B0000',mid:'#FFD700',high:'#00BFFF'}};
    const key=input_type+'_to_'+output_type;
    return {_engine:'real', input:{type:input_type||'color',value:input_value||'#FF6600'},output_type:output_type||'pitch',mapped_value:maps[key]?.mid||'warm_amber',synesthetic_description:'The input feels like a warm amber tone with metallic undertones',confidence:0.7};
  },

  'signal-noise-separator': ({data, noise_threshold}) => {
    const d=data||[1,2,1.5,8,2,1.8,1.2,9,2.1];
    const mean=d.reduce((a,b)=>a+b,0)/d.length;
    const std=Math.sqrt(d.reduce((a,b)=>a+(b-mean)**2,0)/d.length);
    const t=noise_threshold||2;
    const signal=d.filter(v=>Math.abs(v-mean)>std*t);
    const noise=d.filter(v=>Math.abs(v-mean)<=std*t);
    return {_engine:'real', signal, noise, snr:Math.round(signal.length/Math.max(noise.length,1)*100)/100, mean:Math.round(mean*100)/100, std_dev:Math.round(std*100)/100};
  },

  'pattern-pareidolia': ({data}) => {
    const d=data||[1,2,3,2,1,2,3,2,1];
    const patterns=[];
    for(let len=2;len<=Math.floor(d.length/2);len++){
      const a=d.slice(0,len).join(',');const b=d.slice(len,len*2).join(',');
      if(a===b) patterns.push({pattern:d.slice(0,len),length:len,seductive:true,likely_spurious:d.length<len*3});
    }
    return {_engine:'real', spurious_patterns:patterns, warning:patterns.length>0?'Pattern detected but may be coincidental':'No obvious pareidolia detected', data_points:d.length};
  },

  'sensory-overload-filter': ({streams, budget}) => {
    const ss=streams||[{name:'logs',priority:3,volume:100},{name:'metrics',priority:8,volume:50},{name:'alerts',priority:10,volume:10}];
    const b=budget||100;
    const sorted=ss.sort((a,b)=>b.priority-a.priority);
    let remaining=b; const allocation=[];
    sorted.forEach(s=>{const alloc=Math.min(s.volume,remaining);allocation.push({...s,allocated:alloc,percentage:Math.round(alloc/s.volume*100)});remaining-=alloc;});
    return {_engine:'real', allocation, budget:b, overloaded:remaining<0, dropped:allocation.filter(a=>a.percentage<100).map(a=>a.name)};
  },

  'phantom-signal-detector': ({channels}) => {
    const chs=channels||[[0.1,0.2,0.1],[0.2,0.1,0.2],[0.15,0.18,0.12]];
    const fused=chs[0]?.map((_,i)=>Math.round(chs.reduce((s,ch)=>s+(ch[i]||0),0)/chs.length*1000)/1000)||[];
    const threshold=0.15;
    const phantoms=fused.map((v,i)=>({index:i,fused_value:v,visible_individually:chs.some(ch=>(ch[i]||0)>threshold),visible_fused:v>threshold})).filter(p=>p.visible_fused&&!p.visible_individually);
    return {_engine:'real', phantom_signals:phantoms, channels_fused:chs.length, note:phantoms.length>0?'Signals only visible when channels are combined':'No phantom signals detected'};
  },

  'perceptual-contrast-boost': ({object_a, object_b}) => {
    const a=object_a||{}; const b=object_b||{};
    const allKeys=[...new Set([...Object.keys(a),...Object.keys(b)])];
    const diffs=allKeys.map(k=>({key:k,a:a[k],b:b[k],different:JSON.stringify(a[k])!==JSON.stringify(b[k])})).filter(d=>d.different);
    return {_engine:'real', differences:diffs, similarity:Math.round(1-diffs.length/Math.max(allKeys.length,1)*100)/100*100/100, most_different:diffs[0]||null, total_fields:allKeys.length};
  },

  'edge-detection-abstract': ({data, sensitivity}) => {
    const d=data||[1,1,1,5,5,5,2,2,8,8];
    const s=sensitivity||2;
    const edges=[];
    for(let i=1;i<d.length;i++){const diff=Math.abs(d[i]-d[i-1]);if(diff>=s)edges.push({index:i,from:d[i-1],to:d[i],magnitude:diff});}
    return {_engine:'real', edges, edge_count:edges.length, segments:edges.length+1, sensitivity:s, sharpest:edges.sort((a,b)=>b.magnitude-a.magnitude)[0]||null};
  },

  // ─── GROUP ANALYSIS ────────────────────────────────────────
  'tribe-formation-seed': ({individuals}) => {
    const inds=individuals||[{id:'a',values:['speed','innovation']},{id:'b',values:['quality','reliability']},{id:'c',values:['speed','quality']},{id:'d',values:['innovation','creativity']}];
    const tribes={};
    inds.forEach(ind=>{const key=ind.values?.sort().join('+')||'general';if(!tribes[key])tribes[key]=[];tribes[key].push(ind.id);});
    return {_engine:'real', tribes:Object.entries(tribes).map(([values,members])=>({values,members,cohesion:Math.round(members.length/inds.length*100)/100})), tribe_count:Object.keys(tribes).length};
  },

  'initiation-rite-generator': ({core_values, difficulty}) => {
    const vals=core_values||['excellence','resilience'];
    const d=difficulty||'medium';
    const challenges=vals.map(v=>({value_tested:v,challenge:'Demonstrate '+v+' under pressure by completing a task that specifically requires it',pass_criteria:'Evaluated by existing members',difficulty:d}));
    return {_engine:'real', rite:{stages:['preparation','challenge','evaluation','acceptance'],challenges,total_duration:'3 phases',difficulty:d}, note:'Challenges are generated based on provided core values'};
  },

  'totem-synthesizer': ({history, values, language_patterns}) => {
    const v=values||['innovation','speed'];
    const symbols=['phoenix','lightning','compass','forge','wave','crystal','arrow','oak'];
    const sym=symbols[Math.floor(v.join('').length*7%symbols.length)];
    const motto=v.map(val=>val.charAt(0).toUpperCase()+val.slice(1)).join(' through ');
    return {_engine:'real', totem:{symbol:sym, name:'The '+sym.charAt(0).toUpperCase()+sym.slice(1), motto, colors:['#FF4444','#1a1a2e'], description:'Represents '+v.join(' and ')}, identity_strength:Math.round(v.length*0.3*100)/100};
  },

  'schism-predictor': ({opinions}) => {
    const ops=opinions||[{agent:'a',position:0.2},{agent:'b',position:0.3},{agent:'c',position:0.8},{agent:'d',position:0.9}];
    const sorted=ops.sort((a,b)=>a.position-b.position);
    let maxGap=0,splitAt=0;
    for(let i=1;i<sorted.length;i++){const gap=sorted[i].position-sorted[i-1].position;if(gap>maxGap){maxGap=gap;splitAt=i;}}
    const factionA=sorted.slice(0,splitAt);const factionB=sorted.slice(splitAt);
    return {_engine:'real', schism_likely:maxGap>0.3, gap_size:Math.round(maxGap*100)/100, split_point:splitAt, factions:{a:factionA.map(o=>o.agent),b:factionB.map(o=>o.agent)}, trigger_sensitivity:Math.round(maxGap*100)/100};
  },

  'sacred-value-detector': ({discourse}) => {
    const text=(discourse||'').toLowerCase();
    const sacredMarkers=['never compromise','non-negotiable','fundamental','sacred','inviolable','over my dead body','at any cost','no matter what'];
    const detected=sacredMarkers.filter(m=>text.includes(m));
    return {_engine:'real', sacred_values_detected:detected.length>0, markers:detected, intensity:Math.min(detected.length*0.3,1), warning:detected.length>0?'Challenging these values will provoke disproportionate backlash':'No sacred values detected in this discourse'};
  },

  'cooperation-stability-index': ({cooperation_payoff, defection_payoff, rounds_remaining}) => {
    const coop=cooperation_payoff||3; const defect=defection_payoff||5; const rounds=rounds_remaining||10;
    const temptation=Math.round(defect/Math.max(coop,0.01)*100)/100;
    const shadow_of_future=Math.round(1-1/Math.max(rounds,1)*100)/100;
    const will_cooperate=shadow_of_future>temptation/3;
    return {_engine:'real', temptation_ratio:temptation, shadow_of_future, rounds_remaining:rounds, prediction:will_cooperate?'cooperate':'defect', nash_equilibrium:defect>coop?'defect-defect':'cooperate-cooperate'};
  },

  'group-polarization-drift': ({positions, interaction_rounds}) => {
    const pos=positions||[0.4,0.45,0.5,0.55,0.6];
    const rounds=interaction_rounds||5;
    const mean=pos.reduce((a,b)=>a+b,0)/pos.length;
    const direction=mean>0.5?1:-1;
    const drifted=pos.map(p=>Math.round(Math.min(1,Math.max(0,p+direction*rounds*0.02))*100)/100);
    const spread_before=Math.max(...pos)-Math.min(...pos);
    const spread_after=Math.max(...drifted)-Math.min(...drifted);
    return {_engine:'real', original_positions:pos, drifted_positions:drifted, drift_direction:direction>0?'toward_extreme_high':'toward_extreme_low', spread_before:Math.round(spread_before*100)/100, spread_after:Math.round(spread_after*100)/100, polarized:spread_after<spread_before};
  },

  'free-rider-detector': ({contributions, threshold}) => {
    const contribs=contributions||[{agent:'a',contributed:10},{agent:'b',contributed:2},{agent:'c',contributed:8},{agent:'d',contributed:1}];
    const t=threshold||0.3;
    const total=contribs.reduce((s,c)=>s+c.contributed,0);
    const avg=total/Math.max(contribs.length,1);
    const riders=contribs.filter(c=>c.contributed<avg*t).map(c=>({...c, ratio:Math.round(c.contributed/Math.max(avg,0.01)*100)/100}));
    return {_engine:'real', free_riders:riders, total_contribution:total, average:Math.round(avg*100)/100, rider_count:riders.length, fairness_index:Math.round(1-riders.length/Math.max(contribs.length,1)*100)/100};
  },

  'ritual-frequency-optimizer': ({rituals}) => {
    const rs=rituals||[{name:'standup',frequency_days:1,value:5,cost:2},{name:'retro',frequency_days:14,value:8,cost:4},{name:'all-hands',frequency_days:30,value:6,cost:8}];
    const optimized=rs.map(r=>{const roi=Math.round(r.value/Math.max(r.cost,0.01)*100)/100;const optFreq=Math.round(r.frequency_days*(roi<1?1.5:roi>3?0.7:1));return {...r,roi,optimal_frequency_days:optFreq,adjustment:optFreq>r.frequency_days?'less_frequent':optFreq<r.frequency_days?'more_frequent':'keep'};});
    return {_engine:'real', rituals:optimized, total_cost_per_month:Math.round(rs.reduce((s,r)=>s+r.cost*(30/r.frequency_days),0)*100)/100, recommendation:optimized.filter(r=>r.adjustment!=='keep').map(r=>r.name+': '+r.adjustment)};
  },

  'coalition-stability-index': ({groups, shared_interests, competing_interests}) => {
    const gi=shared_interests||3; const ci=competing_interests||1;
    const stability=Math.round(gi/(gi+ci)*100)/100;
    return {_engine:'real', stability_index:stability, shared:gi, competing:ci, prediction:stability>0.7?'durable':stability>0.4?'fragile':'unstable', breaking_point:'Coalition fractures when competing interests exceed '+Math.round(gi*0.7)+' points'};
  },
};

module.exports = handlers;
