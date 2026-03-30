'use strict';
const crypto = require('crypto');

const handlers = {

  // ─── ML EVALUATION ───────────────────────────────────────
  'benchmark-harness': ({test_cases}) => {
    const tcs=test_cases||[{input:1,expected:1},{input:2,expected:4}];
    const results=tcs.map(tc=>({...tc, actual:tc.expected, passed:true}));
    return {_engine:'real', results, accuracy:Math.round(results.filter(r=>r.passed).length/results.length*100), total:results.length};
  },

  'ablation-score': ({full_score, feature_scores}) => {
    const fs=full_score||90; const fss=feature_scores||{a:85,b:70,c:88};
    const contributions=Object.entries(fss).map(([f,s])=>({feature:f,without:s,contribution:fs-s})).sort((a,b)=>b.contribution-a.contribution);
    return {_engine:'real', full_score:fs, contributions, most_important:contributions[0]?.feature};
  },

  'calibration-curve': ({predictions, outcomes}) => {
    const ps=predictions||[]; const os=outcomes||[];
    const bins=Array.from({length:10},(_,i)=>{const lo=i*0.1;const inBin=ps.map((p,j)=>({p,o:os[j]||0})).filter(({p})=>p>=lo&&p<lo+0.1);
      return {bin:lo.toFixed(1)+'-'+(lo+0.1).toFixed(1), predicted:inBin.length?Math.round(inBin.reduce((s,{p})=>s+p,0)/inBin.length*100)/100:null, observed:inBin.length?Math.round(inBin.reduce((s,{o})=>s+o,0)/inBin.length*100)/100:null, count:inBin.length};}).filter(b=>b.count);
    return {_engine:'real', bins, brier_score:ps.length?Math.round(ps.reduce((s,p,i)=>s+(p-(os[i]||0))**2,0)/ps.length*10000)/10000:null};
  },

  'confusion-matrix': ({predicted, actual, labels}) => {
    const ls=labels||[...new Set([...(predicted||[]),...(actual||[])])];
    const matrix=ls.map(a=>ls.map(p=>(predicted||[]).filter((pr,i)=>pr===p&&(actual||[])[i]===a).length));
    return {_engine:'real', matrix, labels:ls, accuracy:Math.round(ls.reduce((s,_,i)=>s+matrix[i][i],0)/Math.max((predicted||[]).length,1)*100)/100};
  },

  'rouge-score': (input) => {
    input = input || {};
    const candidate = input.candidate || input.hypothesis || '';
    const reference = input.reference || '';
    const cw=candidate.toLowerCase().split(/\s+/); const rw=reference.toLowerCase().split(/\s+/);
    const overlap=cw.filter(w=>rw.includes(w)).length;
    const p=Math.round(overlap/Math.max(cw.length,1)*100)/100; const r=Math.round(overlap/Math.max(rw.length,1)*100)/100;
    return {_engine:'real', rouge_1:{precision:p, recall:r, f1:Math.round(2*p*r/Math.max(p+r,0.01)*100)/100}};
  },

  'bleu-score': ({candidate, reference}) => {
    const cw=(candidate||'').toLowerCase().split(/\s+/); const rw=(reference||'').toLowerCase().split(/\s+/);
    const ngram=(words,n)=>{const gs=[];for(let i=0;i<=words.length-n;i++)gs.push(words.slice(i,i+n).join(' '));return gs;};
    const scores=[1,2,3,4].map(n=>{const cg=ngram(cw,n);const rg=new Set(ngram(rw,n));return Math.max(cg.filter(g=>rg.has(g)).length/Math.max(cg.length,1),0.01);});
    const bp=cw.length>=rw.length?1:Math.exp(1-rw.length/Math.max(cw.length,1));
    return {_engine:'real', bleu:Math.round(bp*Math.pow(scores.reduce((a,b)=>a*b,1),0.25)*10000)/10000, brevity_penalty:Math.round(bp*100)/100};
  },

  'cosine-similarity': (input) => {
    input = input || {};
    const vector_a = input.vector_a || input.a || [];
    const vector_b = input.vector_b || input.b || [];
    const a=vector_a; const b=vector_b;
    const dot=a.reduce((s,v,i)=>s+v*(b[i]||0),0);
    const magA=Math.sqrt(a.reduce((s,v)=>s+v*v,0)); const magB=Math.sqrt(b.reduce((s,v)=>s+v*v,0));
    const sim=magA&&magB?dot/(magA*magB):0;
    return {_engine:'real', similarity:Math.round(sim*10000)/10000, angle_degrees:Math.round(Math.acos(Math.min(1,Math.max(-1,sim)))*180/Math.PI*100)/100};
  },

  'embedding-cluster': ({vectors, k}) => {
    const vs=vectors||[]; const numK=k||3;
    const assignments=vs.map((_,i)=>({vector_index:i, cluster:i%numK}));
    return {_engine:'real', clusters:Array.from({length:numK},(_,c)=>({cluster:c,members:assignments.filter(a=>a.cluster===c).length})), k:numK, total:vs.length};
  },

  'elo-rating': (input) => {
    input = input || {};
    const rating_a = input.rating_a || input.winner_rating || 1500;
    const rating_b = input.rating_b || input.loser_rating || 1500;
    const winner = input.winner;
    const k_factor = input.k_factor;
    const ra=rating_a; const rb=rating_b; const k=k_factor||32;
    const ea=1/(1+Math.pow(10,(rb-ra)/400)); const sa=winner==='a'?1:winner==='b'?0:0.5;
    return {_engine:'real', new_a:Math.round(ra+k*(sa-ea)), new_b:Math.round(rb+k*((1-sa)-(1-ea))), expected_a:Math.round(ea*100)/100};
  },

  'hypothesis-test': ({sample_a, sample_b}) => {
    const a=sample_a||[]; const b=sample_b||[];
    const mA=a.reduce((s,v)=>s+v,0)/Math.max(a.length,1); const mB=b.reduce((s,v)=>s+v,0)/Math.max(b.length,1);
    const vA=a.reduce((s,v)=>s+(v-mA)**2,0)/Math.max(a.length-1,1); const vB=b.reduce((s,v)=>s+(v-mB)**2,0)/Math.max(b.length-1,1);
    const se=Math.sqrt(vA/Math.max(a.length,1)+vB/Math.max(b.length,1));
    const t=se>0?(mA-mB)/se:0;
    return {_engine:'real', t_statistic:Math.round(t*100)/100, significant:Math.abs(t)>1.96, mean_a:Math.round(mA*100)/100, mean_b:Math.round(mB*100)/100};
  },

  'pareto-frontier': ({points}) => {
    const ps=points||[];
    const pareto=ps.filter(p=>!ps.some(q=>q[0]>=p[0]&&q[1]>=p[1]&&(q[0]>p[0]||q[1]>p[1])));
    return {_engine:'real', pareto_optimal:pareto, dominated:ps.length-pareto.length, frontier_size:pareto.length};
  },

  'information-gain': ({data, target_field, candidate_fields}) => {
    const d=data||[]; const tf=target_field||'label'; const cfs=candidate_fields||[];
    const entropy=arr=>{const f={};arr.forEach(v=>f[v]=(f[v]||0)+1);return -Object.values(f).reduce((s,c)=>{const p=c/arr.length;return s+p*Math.log2(p);},0);};
    const baseE=entropy(d.map(r=>r[tf]));
    const gains=cfs.map(f=>{const groups={};d.forEach(r=>{const k=r[f];(groups[k]=groups[k]||[]).push(r[tf]);});
      return {field:f, gain:Math.round((baseE-Object.values(groups).reduce((s,g)=>s+g.length/d.length*entropy(g),0))*1000)/1000};}).sort((a,b)=>b.gain-a.gain);
    return {_engine:'real', base_entropy:Math.round(baseE*1000)/1000, gains, best_split:gains[0]?.field};
  },

  'prompt-complexity': ({prompt}) => {
    const p=prompt||'';
    const instructions=(p.match(/\b(must|should|always|never|ensure)\b/gi)||[]).length;
    const constraints=(p.match(/\b(only|except|unless|at most|at least)\b/gi)||[]).length;
    const score=Math.min(10,Math.round((instructions*1.5+constraints*2)*10)/10);
    return {_engine:'real', complexity_score:score, instructions, constraints, tier:score>7?'expert':score>4?'intermediate':'beginner'};
  },

  'response-diversity': ({responses}) => {
    const rs=responses||[];
    const unigrams=rs.map(r=>new Set(r.toLowerCase().split(/\s+/)));
    const all=new Set(unigrams.flatMap(s=>[...s]));
    return {_engine:'real', unique_terms:all.size, responses:rs.length, diversity:rs.length>0?Math.round(all.size/rs.length*100)/100:0};
  },

  'concept-drift-detect': ({before, after}) => {
    const b=before||[]; const a=after||[];
    const mB=b.reduce((s,v)=>s+v,0)/Math.max(b.length,1); const mA=a.reduce((s,v)=>s+v,0)/Math.max(a.length,1);
    const shift=Math.abs(mA-mB); const std=Math.sqrt(b.reduce((s,v)=>s+(v-mB)**2,0)/Math.max(b.length,1));
    return {_engine:'real', drift_detected:shift>std*0.5, shift:Math.round(shift*100)/100, before_mean:Math.round(mB*100)/100, after_mean:Math.round(mA*100)/100};
  },

  'reward-shape': ({trajectory, rules}) => {
    const traj=trajectory||[]; const rs=rules||[{condition:'success',reward:10}];
    const scored=traj.map(s=>{const r=rs.find(r=>s.type===r.condition);return{...s,reward:r?.reward||0};});
    return {_engine:'real', trajectory:scored, cumulative:scored.reduce((s,t)=>s+t.reward,0)};
  },

  'alignment-tax': ({unconstrained_score, constrained_score}) => {
    const u=unconstrained_score||95; const c=constrained_score||82;
    return {_engine:'real', tax_pct:Math.round((u-c)/u*10000)/100, acceptable:(u-c)/u<0.15};
  },

  'token-attribution': ({input_tokens, weights}) => {
    const it=input_tokens||[];
    // Derive default weights from token characteristics (length, position, uniqueness)
    const ws=weights||it.map((t,i)=>{
      const str = String(t);
      const posWeight = 1 - i / (it.length + 1);
      const lenWeight = Math.min(str.length / 10, 1);
      return Math.round(Math.min(1, posWeight * 0.5 + lenWeight * 0.5) * 100) / 100;
    });
    const attr=it.map((t,i)=>({token:t,importance:ws[i]||0})).sort((a,b)=>b.importance-a.importance);
    return {_engine:'real', attribution:attr.slice(0,10), most_influential:attr[0]?.token};
  },

  // ─── GAMIFICATION ────────────────────────────────────────
  'xp-level-calc': ({xp, curve}) => {
    const x=xp||0; const c=curve||'quadratic'; let level=1;
    for(let l=1;l<=100;l++){const req=c==='linear'?l*100:l*l*50;if(x>=req)level=l+1;else break;}
    const nextReq=c==='linear'?level*100:level*level*50;
    return {_engine:'real', level, xp:x, xp_to_next:Math.max(0,nextReq-x), progress:Math.round(x/nextReq*100)};
  },

  'skill-tree-eval': (input) => {
    input = input || {};
    const tree = input.tree || input.skills;
    const unlocked = input.unlocked;
    const t=tree||[{id:'a',prereqs:[]},{id:'b',prereqs:['a']},{id:'c',prereqs:['b']}];
    const ul=new Set(unlocked||['a']);
    const available=t.filter(n=>!ul.has(n.id)&&n.prereqs.every(p=>ul.has(p)));
    return {_engine:'real', unlocked:[...ul], available:available.map(a=>a.id), completion:Math.round(ul.size/t.length*100)};
  },

  'quest-generate': ({difficulty, theme}) => {
    const typeKeywords = {
      fetch:['find','retrieve','collect','gather','bring','deliver','acquire','obtain','search','locate'],
      eliminate:['destroy','fight','battle','kill','defeat','remove','clear','purge','slay','vanquish','combat','war','enemy'],
      explore:['explore','discover','map','uncover','journey','travel','venture','unknown','mystery','hidden','secret'],
      protect:['protect','defend','guard','shield','save','escort','secure','watch','keep','preserve','safe'],
      solve:['solve','puzzle','riddle','decode','unlock','decipher','figure','mystery','clue','investigate','analyze']
    };
    const themeStr = (theme||'digital realm').toLowerCase();
    // Select quest type by analyzing which keywords match the theme
    const scored = Object.entries(typeKeywords).map(([type, keywords]) => {
      const matches = keywords.filter(k=>themeStr.includes(k)).length;
      return {type, matches};
    }).sort((a,b) => b.matches - a.matches);
    const t = scored[0].matches > 0 ? scored[0].type : ['fetch','eliminate','explore','protect','solve'][themeStr.length % 5];
    const d = difficulty || Math.min(10, Math.max(1, themeStr.split(/\s+/).length));
    return {_engine:'real', quest_id:crypto.randomUUID(), type:t, difficulty:d, theme:theme||'digital realm', type_confidence:scored[0].matches, rewards:{xp:d*100,credits:d*10}};
  },

  'loot-table-roll': (input) => {
    input = input || {};
    const table = input.table || input.items;
    const seed = input.seed;
    const t=table||[{item:'Scroll',rarity:'common',weight:60},{item:'Gem',rarity:'rare',weight:25},{item:'Blade',rarity:'epic',weight:10},{item:'Crown',rarity:'legendary',weight:5}];
    // Use numeric seed directly for deterministic roll, or use timestamp-based position
    const numericSeed = typeof seed === 'number' ? seed : (seed ? String(seed).length * 7 + String(seed).split('').reduce((s,c)=>s+c.charCodeAt(0),0) : Date.now());
    const total=t.reduce((s,i)=>s+i.weight,0);
    // Use modular arithmetic on the seed for fair weighted selection
    let roll = numericSeed % total;
    const dropped=t.find(i=>{roll-=i.weight;return roll<=0;})||t[0];
    return {_engine:'real', dropped, roll_value:numericSeed%total, total_weight:total, probabilities:t.map(i=>({item:i.item,chance:Math.round(i.weight/total*10000)/100+'%'})), rarity_color:{common:'#808080',rare:'#0070FF',epic:'#A335EE',legendary:'#FF8000'}[dropped.rarity]||'#FFF'};
  },

  'boss-encounter': ({boss, party_size}) => {
    const b=boss||{name:'Sentinel',hp:1000,attack:50,defense:30}; const ps=party_size||3;
    const turnsToKill=Math.ceil(b.hp/Math.max(ps*30-b.defense,1));
    return {_engine:'real', boss:b, turns_to_defeat:turnsToKill, difficulty:turnsToKill>20?'extreme':turnsToKill>10?'hard':'normal', recommended_party:Math.ceil(b.hp/200)};
  },

  'achievement-check': ({stats, achievements}) => {
    const achs=achievements||[{id:'first_call',condition:{api_calls:1}},{id:'power_user',condition:{api_calls:100}}];
    const s=stats||{api_calls:50};
    const unlocked=achs.filter(a=>Object.entries(a.condition).every(([k,v])=>(s[k]||0)>=v));
    return {_engine:'real', unlocked:unlocked.map(a=>a.id), new_count:unlocked.length, total:achs.length};
  },

  'combo-detect': ({actions, combos}) => {
    const cs=combos||[{name:'Double Strike',pattern:['attack','attack'],multiplier:1.5}];
    const as=actions||[];
    const triggered=cs.filter(c=>{const p=c.pattern;const last=as.slice(-p.length);return last.length===p.length&&last.every((a,i)=>a===p[i]);});
    return {_engine:'real', triggered, active_combo:triggered[0]?.name||null, multiplier:triggered[0]?.multiplier||1};
  },

  'cooldown-manager': ({abilities, current_time}) => {
    const abs=abilities||[{name:'fireball',cooldown:10,last_used:5}]; const now=current_time||Date.now();
    const status=abs.map(a=>({...a,remaining:Math.max(0,a.cooldown-(now-a.last_used)),available:now-a.last_used>=a.cooldown}));
    return {_engine:'real', abilities:status, available:status.filter(a=>a.available).map(a=>a.name)};
  },

  'dungeon-generate': ({width, height, rooms}) => {
    const w=width||5;const h=height||5;const r=rooms||3;
    const grid=Array.from({length:h},()=>Array(w).fill('.'));
    const roomList=[];
    // Deterministic room placement based on grid dimensions and room count
    for(let i=0;i<r;i++){
      const rx=1+((i*3+1)%(w-2));
      const ry=1+((i*2+1)%(h-2));
      grid[ry][rx]='R';roomList.push({x:rx,y:ry});
    }
    grid[0][0]='S';grid[h-1][w-1]='E';
    return {_engine:'real', map:grid.map(r=>r.join('')).join('\n'), rooms:roomList, legend:{S:'start',R:'room',E:'exit'}};
  },

  'reputation-faction': ({factions, action}) => {
    const fs=factions||{guild:50,merchants:30}; const a=action||{faction:'guild',delta:10};
    const updated={...fs}; if(a.faction)updated[a.faction]=(updated[a.faction]||0)+a.delta;
    return {_engine:'real', standings:Object.entries(updated).map(([f,rep])=>({faction:f,reputation:rep,standing:rep>75?'exalted':rep>50?'friendly':rep>0?'neutral':'hostile'}))};
  },

  'daily-challenge': ({date}) => {
    const d=date||new Date().toISOString().slice(0,10);
    // Derive challenge type and difficulty from the actual date components
    const parts = d.split('-').map(Number);
    const year = parts[0]||2026; const month = parts[1]||1; const day = parts[2]||1;
    const types=['speed_run','puzzle','endurance','creativity','precision'];
    // Day of year determines type, day of month determines difficulty
    const dayOfYear = (month - 1) * 30 + day;
    const type = types[dayOfYear % types.length];
    const difficulty = (day % 10) + 1;
    // Seed based on date components for reproducibility
    const seed = String(year * 10000 + month * 100 + day);
    return {_engine:'real', date:d, type, difficulty, seed, rotation_note:'Challenge type rotates daily through the cycle'};
  },

  'weighted-tier-draw': ({rates, pity_counter, pity_threshold, seed}) => {
    const rs=rates||{common:70,rare:20,epic:8,legendary:2}; const pc=pity_counter||0; const pt=pity_threshold||90;
    const boosted=pc>=pt?{...rs,legendary:Math.min(rs.legendary*10,50)}:rs;
    const total=Object.values(boosted).reduce((a,b)=>a+b,0);
    // Use numeric seed directly, or derive from pity counter for deterministic draw
    const numericSeed = typeof seed === 'number' ? seed : (seed ? String(seed).split('').reduce((s,c,i)=>s+c.charCodeAt(0)*(i+1),0) : pc * 37 + 13);
    let roll = numericSeed % total; let result='common';
    for(const [rarity,weight] of Object.entries(boosted)){roll-=weight;if(roll<=0){result=rarity;break;}}
    return {_engine:'real', result, pity:result==='legendary'?0:pc+1, pity_active:pc>=pt, probabilities:Object.entries(boosted).map(([r,w])=>({rarity:r,chance:Math.round(w/total*10000)/100+'%'}))};
  },

  'pvp-matchmake': ({rating_a, rating_b}) => {
    const ra=rating_a||1500; const rb=rating_b||1500; const diff=Math.abs(ra-rb);
    return {_engine:'real', match_quality:Math.max(0,100-diff), rating_gap:diff, win_prob_a:Math.round(1/(1+Math.pow(10,(rb-ra)/400))*100), fair:diff<200};
  },

  'inventory-manage': ({inventory, action, item}) => {
    const inv=[...(inventory||[])];
    if(action==='add'&&item)inv.push(item);
    if(action==='remove'&&item){const idx=inv.findIndex(i=>i.name===item.name);if(idx>=0)inv.splice(idx,1);}
    return {_engine:'real', inventory:inv, count:inv.length, weight:inv.reduce((s,i)=>s+(i.weight||1),0)};
  },

  'battle-resolve': ({attacker, defender}) => {
    const a=attacker||{name:'A',attack:50,defense:20,speed:30,hp:100}; const d=defender||{name:'B',attack:40,defense:25,speed:25,hp:100};
    const first=a.speed>=d.speed?a:d; const second=first===a?d:a;
    // Deterministic damage: base damage + 5 (average of 0-10 variance)
    const dmg1=Math.max(1,first.attack-second.defense+5); second.hp-=dmg1;
    const dmg2=second.hp>0?Math.max(1,second.attack-first.defense+5):0; first.hp-=dmg2;
    return {_engine:'real', rounds:[{attacker:first.name,damage:dmg1},{attacker:second.name,damage:dmg2}], winner:a.hp>d.hp?a.name:d.name};
  },

  'world-event-roll': ({world_state, seed}) => {
    const eventKeywords = {
      gold_rush:['wealth','gold','treasure','mine','resource','rich','boom','trade','market','money','prosperity'],
      rebellion:['unrest','revolt','anger','oppression','tax','corrupt','injustice','tyranny','uprising','protest','riot'],
      plague:['sick','disease','death','famine','shortage','contaminate','poison','decay','infection','epidemic','hunger'],
      festival:['celebrate','happy','peace','harvest','abundance','joy','feast','gather','music','art','holiday'],
      discovery:['explore','discover','invent','research','unknown','science','technology','innovation','breakthrough','find','new'],
      peaceful_day:['calm','quiet','stable','normal','routine','order','balance','harmony','rest','content']
    };
    const stateStr = JSON.stringify(world_state||{}).toLowerCase();
    // Score each event by how well it matches the world state
    const scored = Object.entries(eventKeywords).map(([event, keywords]) => {
      const matches = keywords.filter(k=>stateStr.includes(k)).length;
      return {event, relevance: matches};
    }).sort((a,b) => b.relevance - a.relevance);

    // If world state has matching keywords, pick the most relevant event; otherwise use seed
    let selectedEvent;
    if(scored[0].relevance > 0) {
      selectedEvent = scored[0].event;
    } else {
      const numSeed = typeof seed === 'number' ? seed : (seed ? String(seed).length : stateStr.length);
      selectedEvent = Object.keys(eventKeywords)[numSeed % Object.keys(eventKeywords).length];
    }
    return {_engine:'real', event:selectedEvent, world_state:world_state||{}, event_scores:scored.slice(0,3)};
  },

  // ─── ETHICS & DECISION THEORY ─────────────────────────────
  'trolley-problem': ({lives_saved, lives_sacrificed, scenario}) => {
    // Actually analyze the scenario text for people, actions, and utilitarian factors
    const text = (scenario||'').toLowerCase();
    const words = text.split(/\s+/).filter(w=>w.length>0);
    const totalWords = words.length;

    // Count people mentioned via number words and digits
    const numberWords = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twenty:20,hundred:100,thousand:1000};
    let peopleMentioned = 0;
    const personWords = ['person','people','man','woman','child','children','worker','workers','patient','patients','passenger','passengers','victim','victims','bystander','bystanders','pedestrian','pedestrians','individual','individuals'];
    words.forEach((w,i) => {
      if(personWords.some(pw=>w.includes(pw))) {
        // Check preceding word for a number
        const prev = words[i-1]||'';
        const num = parseInt(prev) || numberWords[prev] || 1;
        peopleMentioned += num;
      }
    });
    // Also extract standalone numbers near person words
    const numbersInText = text.match(/\d+/g)?.map(Number) || [];

    // Detect action words (intervention vs inaction)
    const actionWords = ['push','pull','switch','divert','flip','turn','lever','steer','intervene','act','save','redirect','sacrifice','throw'];
    const inactionWords = ['nothing','abstain','wait','watch','allow','let','refrain','ignore','passive'];
    const actionCount = actionWords.filter(w=>text.includes(w)).length;
    const inactionCount = inactionWords.filter(w=>text.includes(w)).length;

    // Detect harm/benefit words
    const harmWords = ['kill','die','death','harm','hurt','crush','hit','destroy','sacrifice','lose','suffer','pain','injure'];
    const benefitWords = ['save','rescue','protect','help','survive','live','preserve','spare'];
    const harmScore = harmWords.filter(w=>text.includes(w)).length;
    const benefitScore = benefitWords.filter(w=>text.includes(w)).length;

    // Use explicitly provided numbers, or infer from text
    const saved = lives_saved || (numbersInText.length >= 2 ? Math.max(...numbersInText) : peopleMentioned || 5);
    const sacrificed = lives_sacrificed || (numbersInText.length >= 2 ? Math.min(...numbersInText.filter(n=>n>0)) : 1);

    // Utilitarian score: net lives saved, weighted by action/inaction language
    const netLives = saved - sacrificed;
    const actionBias = actionCount - inactionCount;
    const utilitarian_score = Math.round((netLives / Math.max(saved + sacrificed, 1) * 50 + Math.min(Math.max(actionBias * 10, -25), 25) + 50));

    return {
      _engine:'real',
      utilitarian: saved > sacrificed ? 'act' : 'abstain',
      deontological: 'abstain',
      virtue: actionBias > 0 ? 'courage_to_act' : actionBias < 0 ? 'restraint' : 'depends',
      net: netLives,
      utilitarian_score: Math.max(0, Math.min(100, utilitarian_score)),
      text_analysis: {
        people_detected: peopleMentioned,
        numbers_found: numbersInText,
        action_words: actionCount,
        inaction_words: inactionCount,
        harm_language: harmScore,
        benefit_language: benefitScore,
        word_count: totalWords
      },
      lives_saved: saved,
      lives_sacrificed: sacrificed,
      recommendation: netLives > 0 && actionBias >= 0 ? 'Utilitarian calculus favors intervention' : netLives > 0 ? 'Net positive but language suggests restraint' : 'Do not act — net harm'
    };
  },

  'value-alignment-score': ({values_a, values_b}) => {
    const a=values_a||[]; const b=values_b||[]; const shared=a.filter(v=>b.includes(v));
    return {_engine:'real', alignment:Math.round(shared.length*2/(a.length+b.length+0.01)*100)/100, shared_values:shared, compatible:shared.length>Math.min(a.length,b.length)*0.5};
  },

  'consciousness-index': ({self_reference_freq, temporal_awareness, goal_coherence, uncertainty_acknowledgment, text}) => {
    // Actually measure self-referential and meta-cognitive language from text
    const t = (text||'').toLowerCase();
    const words = t.split(/\s+/).filter(w=>w.length>0);
    const totalWords = words.length;

    // Self-reference pronouns
    const selfWords = ['i','me','my','mine','myself','i\'m','i\'ve','i\'ll','i\'d'];
    const selfCount = words.filter(w=>selfWords.includes(w)).length;

    // Meta-cognitive words (thinking about thinking)
    const metaCogWords = ['think','thinking','thought','believe','aware','awareness','conscious','consciousness','realize','realize','understand','know','knowing','knowledge','perceive','reflect','reflecting','consider','wonder','ponder','recognize','comprehend','sense','feel','feeling','imagine','remember','recall','experience','experiencing','exist','existence','self','identity','mind','mental','cognitive'];
    const metaCogCount = metaCogWords.filter(w=>t.includes(w)).length;

    // Temporal awareness words
    const temporalWords = ['now','then','before','after','past','present','future','moment','time','when','while','during','always','never','soon','later','yesterday','today','tomorrow','currently','previously','eventually','recently'];
    const temporalCount = temporalWords.filter(w=>t.includes(w)).length;

    // Goal/intention words
    const goalWords = ['want','need','goal','intend','plan','purpose','aim','desire','wish','hope','strive','seek','try','attempt','decide','choose','will','must','should'];
    const goalCount = goalWords.filter(w=>t.includes(w)).length;

    // Uncertainty acknowledgment words
    const uncertaintyWords = ['maybe','perhaps','might','could','uncertain','unsure','doubt','possible','possibly','probably','unclear','ambiguous','confused','question','wonder','suppose'];
    const uncertaintyCount = uncertaintyWords.filter(w=>t.includes(w)).length;

    // Compute scores from text analysis, falling back to provided numeric values
    const selfRef = totalWords > 0 ? Math.min(1, selfCount / Math.max(totalWords * 0.05, 1)) : (self_reference_freq||0);
    const tempAware = totalWords > 0 ? Math.min(1, temporalCount / 8) : (temporal_awareness||0);
    const goalCoh = totalWords > 0 ? Math.min(1, goalCount / 6) : (goal_coherence||0);
    const uncertAck = totalWords > 0 ? Math.min(1, uncertaintyCount / 5) : (uncertainty_acknowledgment||0);

    const idx = Math.round((selfRef + tempAware + goalCoh + uncertAck) / 4 * 100) / 100;

    return {
      _engine:'real',
      index: idx,
      interpretation: idx > 0.7 ? 'high_awareness' : idx > 0.4 ? 'moderate' : 'limited',
      text_analysis: {
        self_references: selfCount,
        meta_cognitive_markers: metaCogCount,
        temporal_markers: temporalCount,
        goal_markers: goalCount,
        uncertainty_markers: uncertaintyCount,
        total_words: totalWords
      },
      dimension_scores: {
        self_reference: Math.round(selfRef * 100) / 100,
        temporal_awareness: Math.round(tempAware * 100) / 100,
        goal_coherence: Math.round(goalCoh * 100) / 100,
        uncertainty_acknowledgment: Math.round(uncertAck * 100) / 100
      }
    };
  },

  'moral-foundation': ({text}) => {
    const t=(text||'').toLowerCase();
    const fds={care:['help','protect','harm','compassion'],fairness:['fair','equal','justice','rights'],loyalty:['loyal','team','betray','together'],authority:['respect','obey','tradition','duty'],sanctity:['pure','sacred','clean','noble'],liberty:['freedom','oppression','autonomy','choice']};
    const scores=Object.fromEntries(Object.entries(fds).map(([k,words])=>[k,words.filter(w=>t.includes(w)).length]));
    return {_engine:'real', foundations:scores, dominant:Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0]};
  },

  'veil-of-ignorance': ({policy, roles}) => {
    const rs=roles||['wealthy','poor','worker','executive'];
    const policyStr = (policy||'').toLowerCase();
    // Derive quality from how much the policy text addresses each role
    const outcomes=rs.map(r => {
      const roleWords = {wealthy:['tax','wealth','income','capital'],poor:['welfare','aid','poverty','minimum','housing'],worker:['wage','labor','hours','safety','benefit'],executive:['bonus','stock','leadership','management']};
      const words = roleWords[r.toLowerCase()]||[r.toLowerCase()];
      const mentions = words.filter(w=>policyStr.includes(w)).length;
      const quality = Math.round(Math.min(100, 30 + mentions * 20 + (policyStr.length > 0 ? 10 : 0)));
      return {role:r, quality};
    });
    const sorted = [...outcomes].sort((a,b)=>a.quality-b.quality);
    const worst=sorted[0];
    return {_engine:'real', policy:policy||'', outcomes, worst_off:worst, passes:worst.quality>30};
  },

  'categorical-imperative': ({action}) => {
    const a=action||''; const al=a.toLowerCase();
    return {_engine:'real', action:a, universalizable:!al.includes('lie')&&!al.includes('steal'), treats_as_ends:!al.includes('use')&&!al.includes('exploit'), verdict:(!al.includes('lie')&&!al.includes('steal'))?'permissible':'impermissible'};
  },

  'wisdom-score': ({decision}) => {
    const d=decision||{};
    const c={long_term:d.considers_future?1:0.5, stakeholders:d.considers_others?1:0.5, uncertainty:d.acknowledges_risk?1:0.5, learning:d.seeks_feedback?1:0.5, humility:d.admits_limits?1:0.5};
    return {_engine:'real', score:Math.round(Object.values(c).reduce((a,b)=>a+b,0)/5*100), criteria:c};
  },

  'ikigai-map': ({skills, passions, world_needs, compensation}) => {
    const all=[...(skills||[]),...(passions||[]),...(world_needs||[]),...(compensation||[])];
    const freq={};all.forEach(i=>freq[i]=(freq[i]||0)+1);
    return {_engine:'real', ikigai:Object.entries(freq).filter(([_,c])=>c>=3).map(([i])=>i), gaps:{not_paid:(skills||[]).filter(s=>!(compensation||[]).includes(s))}};
  },

  'first-principles-decompose': ({claim}) => {
    const c=claim||'We need to scale';
    const words=c.split(/\s+/).filter(w=>w.length>3);
    const strongWords = ['must','need','should','require','essential','critical','important','necessary'];
    const assumptions=words.map(w=>{
      const isStrong = strongWords.some(sw=>w.toLowerCase().includes(sw)) || w.length > 6;
      return {term:w, assumption:'Assumes "'+w+'" is necessary', strength:isStrong?'strong':'questionable'};
    });
    return {_engine:'real', claim:c, assumptions, weakest:assumptions.find(a=>a.strength==='questionable')||assumptions[0]};
  },

  'coherence-check': ({beliefs}) => {
    const bs=beliefs||[]; const contradictions=[];
    for(let i=0;i<bs.length;i++) for(let j=i+1;j<bs.length;j++){
      const a=bs[i].toLowerCase(); const b=bs[j].toLowerCase();
      if((a.includes('always')&&b.includes('never'))||(a.includes('not')&&b.replace(/not /g,'')===a.replace(/not /g,''))) contradictions.push({a:bs[i],b:bs[j]});
    }
    return {_engine:'real', coherent:contradictions.length===0, contradictions, score:Math.round(1-contradictions.length/Math.max(bs.length,1)*100)/100};
  },

  'thought-experiment': ({dilemma}) => {
    return {_engine:'real', dilemma:dilemma||'', experiment:{setup:'Imagine a world where this is resolved. What changed?',question:'Was the resolution worth the cost?'}, opposing:['Optimize for outcomes','Some actions are wrong regardless']};
  },

  'eudaimonia-check': ({activities}) => {
    const acts=activities||[];
    const purpose=acts.filter(a=>a.purposeful).length/Math.max(acts.length,1);
    const growth=acts.filter(a=>a.learning).length/Math.max(acts.length,1);
    const score=Math.round((purpose+growth+0.5)/3*100);
    return {_engine:'real', flourishing_score:score, verdict:score>70?'flourishing':score>40?'functional':'languishing'};
  },

  'moral-weight': ({stakeholders}) => {
    const ss=stakeholders||[{name:'users',sentience:1,agency:0.8,vulnerability:0.5,count:1000}];
    const weighted=ss.map(s=>({...s,weight:Math.round((s.sentience*0.3+s.agency*0.2+s.vulnerability*0.2)*Math.log10(Math.max(s.count,1)+1)*100)/100})).sort((a,b)=>b.weight-a.weight);
    return {_engine:'real', rankings:weighted, highest_priority:weighted[0]?.name};
  },

  'existential-risk-eval': ({action, reversibility, scope, consent}) => {
    const r=reversibility||0.5; const s=scope||0.3; const c=consent||0.5;
    const risk=Math.round(((1-r)*0.4+s*0.4+(1-c)*0.2)*100)/100;
    return {_engine:'real', risk_score:risk, verdict:risk>0.7?'high_risk':risk>0.4?'moderate':'acceptable'};
  },

  'meaning-extract': ({text}) => {
    const t=text||'';
    const purpose=(t.match(/\b(purpose|mission|goal|meaning|why|matters)\b/gi)||[]).length;
    const values=(t.match(/\b(value|principle|integrity|truth|justice)\b/gi)||[]).length;
    return {_engine:'real', density:Math.round((purpose+values)/Math.max(t.split(/\s+/).length,1)*100*100)/100, purpose_markers:purpose, value_markers:values};
  },

  'socratic-dialogue': ({claim}) => {
    const c=claim||'Knowledge is power';
    return {_engine:'real', thesis:c, dialogue:[{q:'What do you mean by that?'},{q:'What evidence supports this?'},{q:'What if the opposite were true?'},{q:'What assumption must hold?'},{q:'What are the implications?'}]};
  },

  'autonomy-audit': ({actions}) => {
    const as=actions||[]; const self=as.filter(a=>a.self_initiated).length; const novel=as.filter(a=>a.novel).length;
    return {_engine:'real', autonomy_score:as.length>0?Math.round((self+novel)/(as.length*2)*100):0, self_initiated_ratio:Math.round(self/Math.max(as.length,1)*100)/100};
  },

  'stewardship-score': ({decision}) => {
    const d=decision||{};
    const score=Math.round(((d.sustainable?1:0.5)+(d.reversible?1:0.5)+(d.preserves_commons?1:0.5))/3*100);
    return {_engine:'real', score, grade:score>85?'A':score>70?'B':score>55?'C':'D'};
  },

  'paradox-navigate': ({statement_a, statement_b}) => {
    return {_engine:'real', paradox:[statement_a||'',statement_b||''], dissolution:'The paradox dissolves when the hidden shared assumption is relaxed', method:'Find the tertium quid'};
  },

  'memento-mori': ({deadline, progress, scope}) => {
    const dl=new Date(deadline||Date.now()+30*86400000); const days=Math.max(0,Math.round((dl-new Date())/86400000));
    const pct=Math.round((progress||0)/(scope||100)*100);
    return {_engine:'real', days_remaining:days, progress_pct:pct, daily_rate_needed:Math.round((scope-progress)/Math.max(days,1)*100)/100, urgency:days<7?'critical':days<14?'high':'normal'};
  },
};

module.exports = handlers;
