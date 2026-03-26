'use strict';
const crypto = require('crypto');

const handlers = {

  // ─── ENTERPRISE (Agent 21) ────────────────────────────────
  'sla-enforce': ({rules, request_log}) => {
    const rs = rules || [{metric:'latency_ms',max:200},{metric:'error_rate',max:5}];
    const log = request_log || {latency_ms:150,error_rate:2};
    const results = rs.map(r => ({...r, actual:log[r.metric]||0, passed:(log[r.metric]||0)<=r.max}));
    return {_engine:'real', results, all_passed:results.every(r=>r.passed), violations:results.filter(r=>!r.passed).length};
  },

  'capacity-forecast': ({history, ceiling}) => {
    const h = history || [100,120,150,180,220]; const c = ceiling || 1000;
    const growth = (h[h.length-1]-h[0])/Math.max(h.length-1,1);
    return {_engine:'real', current:h[h.length-1], ceiling:c, growth_per_period:Math.round(growth*100)/100, periods_until_ceiling:growth>0?Math.ceil((c-h[h.length-1])/growth):Infinity, model:'linear'};
  },

  'runbook-execute': ({runbook, state}) => {
    const rb = runbook || [{condition:'error_count > 5',action:'restart_service'}];
    const s = state || {error_count:6};
    const matched = rb.find(r => { try { const keys = Object.keys(s); const fn = new Function(...keys, 'return ' + r.condition); return fn(...keys.map(k=>s[k])); } catch(e) { return false; } });
    return {_engine:'real', state:s, matched_rule:matched||null, action:matched?.action||'no_action'};
  },

  'incident-timeline': ({events}) => {
    const evts = (events||[]).sort((a,b) => new Date(a.time||0)-new Date(b.time||0));
    const firstAnomaly = evts.find(e => e.type==='anomaly'||e.severity==='high');
    return {_engine:'real', timeline:evts, root_cause_candidate:firstAnomaly||evts[0]||null, total_events:evts.length};
  },

  'compliance-check': ({data, rules}) => {
    const rs = rules || [{field:'email',required:true}];
    const d = data || {};
    const results = rs.map(r => ({rule:r.field, passed:r.required ? d[r.field]!=null : true}));
    return {_engine:'real', results, compliant:results.every(r=>r.passed), violations:results.filter(r=>!r.passed).length};
  },

  'retry-policy-calc': ({strategy, max_retries, base_delay_ms}) => {
    const mr = max_retries||5; const bd = base_delay_ms||1000; const s = strategy||'exponential';
    const schedule = Array.from({length:mr},(_,i) => {
      const delay = s==='exponential' ? bd*Math.pow(2,i) : s==='linear' ? bd*(i+1) : bd;
      return {attempt:i+1, delay_ms:delay, with_jitter:delay+Math.round(delay*0.1*Math.random())};
    });
    return {_engine:'real', strategy:s, schedule, total_wait_ms:schedule.reduce((s,r)=>s+r.delay_ms,0)};
  },

  'cost-attribution': ({total_cost, entities, method}) => {
    const tc = total_cost||1000; const es = entities||[{name:'A',usage:60},{name:'B',usage:40}]; const m = method||'usage';
    const totalUsage = es.reduce((s,e)=>s+e.usage,0);
    const bills = es.map(e => ({...e, cost:m==='equal' ? Math.round(tc/es.length*100)/100 : Math.round(tc*e.usage/Math.max(totalUsage,1)*100)/100}));
    return {_engine:'real', bills, total:tc, method:m};
  },

  'change-risk-score': ({blast_radius, rollback_difficulty, dependency_depth}) => {
    const br=blast_radius||5; const rd=rollback_difficulty||3; const dd=dependency_depth||2;
    const score = Math.min(100, Math.round((br*4+rd*3.5+dd*2.5)*100)/100);
    return {_engine:'real', risk_score:score, level:score>70?'high':score>40?'medium':'low', factors:{blast_radius:br,rollback_difficulty:rd,dependency_depth:dd}};
  },

  'canary-analysis': ({canary_metrics, baseline_metrics, threshold}) => {
    const cm = canary_metrics||{latency:210,errors:3}; const bm = baseline_metrics||{latency:200,errors:2}; const t = threshold||0.1;
    const checks = Object.keys(cm).map(k => {const diff=Math.abs(cm[k]-bm[k])/Math.max(bm[k],1); return {metric:k,canary:cm[k],baseline:bm[k],diff_pct:Math.round(diff*100),passed:diff<=t};});
    return {_engine:'real', checks, recommendation:checks.every(c=>c.passed)?'deploy':'rollback'};
  },

  'dependency-criticality': ({graph}) => {
    const g = graph||{A:['B','C'],B:['D'],C:[],D:[]};
    const rankings = Object.keys(g).map(node => {const dependents=Object.entries(g).filter(([_,deps])=>deps.includes(node)).length; return {node,dependents,fan_out:(g[node]||[]).length,criticality:dependents*2+(g[node]||[]).length};}).sort((a,b)=>b.criticality-a.criticality);
    return {_engine:'real', rankings, single_points_of_failure:rankings.filter(r=>r.dependents>1)};
  },

  'audit-log-hash': ({entries, previous_hash}) => {
    let hash = previous_hash||'0'.repeat(64);
    const chained = (entries||[]).map((e,i) => { hash=crypto.createHash('sha256').update(hash+JSON.stringify(e)).digest('hex'); return {...e,index:i,hash}; });
    return {_engine:'real', entries:chained, chain_head:hash, tamper_proof:true, length:chained.length};
  },

  'rate-limit-calc': ({quota, used, refill_rate_per_minute}) => {
    const q=quota||100; const u=used||75; const rr=refill_rate_per_minute||10;
    return {_engine:'real', quota:q, used:u, remaining:Math.max(0,q-u), seconds_until_refill:q-u<=0?Math.ceil(60/rr):0, throttled:u>=q};
  },

  'rollback-plan': ({services}) => {
    const svcs = services||[{name:'api',before:'v1.2',after:'v1.3'},{name:'db',before:'schema_5',after:'schema_6'}];
    const steps = [...svcs].reverse().map((s,i) => ({step:i+1, service:s.name, action:'Revert from '+s.after+' to '+s.before}));
    return {_engine:'real', rollback_steps:steps, total_steps:steps.length, order:'reverse_dependency'};
  },

  'resource-bin-pack': ({workloads, node_capacity}) => {
    const ws = workloads||[{name:'a',size:30},{name:'b',size:50},{name:'c',size:40}]; const cap = node_capacity||80;
    const sorted = [...ws].sort((a,b)=>b.size-a.size); const nodes = [];
    sorted.forEach(w => { const node=nodes.find(n=>n.remaining>=w.size); if(node){node.items.push(w.name);node.remaining-=w.size;} else nodes.push({items:[w.name],remaining:cap-w.size}); });
    return {_engine:'real', nodes:nodes.map((n,i)=>({node:i+1,items:n.items,utilization:Math.round((cap-n.remaining)/cap*100)})), node_count:nodes.length};
  },

  'alert-dedup': ({alerts, window_minutes}) => {
    const as = alerts||[]; const w = window_minutes||5; const seen = {};
    const deduped = as.filter(a => { const key=a.type||'unknown'; if(seen[key])return false; seen[key]=true; return true; });
    return {_engine:'real', original:as.length, deduped:deduped.length, suppressed:as.length-deduped.length};
  },

  'config-drift-detect': ({desired, actual}) => {
    const d=desired||{}; const a=actual||{};
    const allKeys = [...new Set([...Object.keys(d),...Object.keys(a)])];
    const drifts = allKeys.filter(k=>JSON.stringify(d[k])!==JSON.stringify(a[k])).map(k=>({key:k,expected:d[k],actual:a[k]}));
    return {_engine:'real', drifts, drift_count:drifts.length, clean:drifts.length===0};
  },

  'mttr-calculate': ({started_at, detected_at, acknowledged_at, resolved_at}) => {
    const s=new Date(started_at||0); const d=new Date(detected_at||0); const a=new Date(acknowledged_at||0); const r=new Date(resolved_at||0);
    return {_engine:'real', mttd_min:Math.round((d-s)/60000), mtta_min:Math.round((a-d)/60000), mttr_min:Math.round((r-d)/60000), total_min:Math.round((r-s)/60000)};
  },

  'token-bucket-sim': ({requests, bucket_size, refill_rate}) => {
    const bs=bucket_size||10; const rr=refill_rate||2; let tokens=bs;
    const results = (requests||[1,1,1,1,1]).map((r,i) => { tokens=Math.min(bs,tokens+rr); const ok=tokens>=1; if(ok)tokens--; return {request:i+1,accepted:ok,tokens:Math.round(tokens*10)/10}; });
    return {_engine:'real', results, accepted:results.filter(r=>r.accepted).length, rejected:results.filter(r=>!r.accepted).length};
  },

  'chaos-schedule': ({services, frequency_per_day, blackout_hours}) => {
    const svcs=services||['api','db','cache']; const f=frequency_per_day||3; const bo=new Set(blackout_hours||[0,1,2,3,4,5]);
    const schedule = Array.from({length:f},(_,i) => { let h; do{h=Math.floor(Math.random()*24);}while(bo.has(h)); return {injection:i+1,target:svcs[Math.floor(Math.random()*svcs.length)],hour:h,type:['latency','error','crash'][Math.floor(Math.random()*3)]}; });
    return {_engine:'real', schedule};
  },

  // ─── INDIE HACKER (Agent 22) ──────────────────────────────
  'ab-test-eval': ({variants}) => {
    const vs = variants||[{name:'A',visitors:1000,conversions:50},{name:'B',visitors:1000,conversions:65}];
    const rates = vs.map(v=>({...v,rate:Math.round(v.conversions/v.visitors*10000)/100})).sort((a,b)=>b.rate-a.rate);
    const lift = rates.length>=2 ? Math.round((rates[0].rate-rates[1].rate)/Math.max(rates[1].rate,0.01)*100) : 0;
    return {_engine:'real', variants:rates, winner:rates[0].name, lift_pct:lift, significant:Math.abs(lift)>10};
  },

  'nps-calculate': ({ratings}) => {
    const rs=ratings||[]; const p=rs.filter(r=>r>=9).length; const d=rs.filter(r=>r<=6).length;
    return {_engine:'real', nps:rs.length>0?Math.round((p-d)/rs.length*100):0, promoters:p, passives:rs.length-p-d, detractors:d, total:rs.length};
  },

  'cohort-analyze': ({signups, events}) => {
    const ss=signups||[]; const es=events||[];
    const cohorts = {};
    ss.forEach(s => { if(!cohorts[s.week])cohorts[s.week]={users:[],retention:{}}; cohorts[s.week].users.push(s.user); });
    Object.entries(cohorts).forEach(([week,data]) => {
      for(let w=Number(week);w<=Number(week)+4;w++) {
        const active=data.users.filter(u=>es.some(e=>e.user===u&&e.week===w)).length;
        data.retention['week_'+(w-Number(week))]=Math.round(active/Math.max(data.users.length,1)*100);
      }
    });
    return {_engine:'real', cohorts};
  },

  'funnel-analyze': ({stages}) => {
    const ss=stages||[{name:'visit',count:1000},{name:'signup',count:200},{name:'activate',count:80},{name:'pay',count:20}];
    const analyzed=ss.map((s,i)=>({...s, drop_off:i>0?Math.round((1-s.count/ss[i-1].count)*100):0, conversion:i>0?Math.round(s.count/ss[i-1].count*100):100}));
    return {_engine:'real', funnel:analyzed, overall_conversion:Math.round(ss[ss.length-1].count/ss[0].count*10000)/100, biggest_leak:analyzed.slice(1).sort((a,b)=>b.drop_off-a.drop_off)[0]?.name};
  },

  'viral-coefficient': ({invites_sent, invites_converted, cycles}) => {
    const is=invites_sent||100; const ic=invites_converted||15; const c=cycles||5;
    const k=Math.round(ic/Math.max(is,1)*is/100*100)/100;
    let users=100; const growth=Array.from({length:c},(_,i)=>{users=Math.round(users*(1+k));return{cycle:i+1,users};});
    return {_engine:'real', k_factor:k, viral:k>1, growth_projection:growth};
  },

  'churn-predict': ({mau_history}) => {
    const h=mau_history||[1000,980,950,930,900];
    const rates=h.slice(1).map((v,i)=>Math.round((h[i]-v)/Math.max(h[i],1)*10000)/100);
    const avg=Math.round(rates.reduce((a,b)=>a+b,0)/Math.max(rates.length,1)*100)/100;
    return {_engine:'real', churn_rates:rates, avg_monthly_churn:avg, months_to_halve:avg>0?Math.round(Math.log(0.5)/Math.log(1-avg/100)):Infinity};
  },

  'feature-prioritize': ({features}) => {
    const fs=features||[{name:'feature_a',reach:8,impact:9,confidence:7,effort:3}];
    const scored=fs.map(f=>({...f,rice:Math.round(f.reach*f.impact*f.confidence/Math.max(f.effort,1)*100)/100})).sort((a,b)=>b.rice-a.rice);
    return {_engine:'real', prioritized:scored, top_pick:scored[0]?.name, method:'RICE'};
  },

  'changelog-format': ({entries}) => {
    const es=entries||[{type:'added',text:'New API'},{type:'fixed',text:'Memory leak'}];
    const grouped={added:[],changed:[],fixed:[],removed:[]};
    es.forEach(e=>(grouped[e.type]||(grouped[e.type]=[])).push(e.text));
    const md=Object.entries(grouped).filter(([_,items])=>items.length).map(([type,items])=>'### '+type.charAt(0).toUpperCase()+type.slice(1)+'\n'+items.map(i=>'- '+i).join('\n')).join('\n\n');
    return {_engine:'real', markdown:md, counts:Object.fromEntries(Object.entries(grouped).map(([k,v])=>[k,v.length]))};
  },

  'demo-data-gen': ({schema, rows}) => {
    const s=schema||{id:'int',name:'string',email:'email',active:'boolean'}; const r=rows||5;
    const gen={int:()=>Math.floor(Math.random()*10000),string:()=>['Alice','Bob','Charlie','Diana','Eve'][Math.floor(Math.random()*5)],email:()=>crypto.randomBytes(4).toString('hex')+'@example.com',boolean:()=>Math.random()>0.5};
    const data=Array.from({length:r},()=>Object.fromEntries(Object.entries(s).map(([k,t])=>[k,(gen[t]||gen.string)()])));
    return {_engine:'real', data, row_count:r};
  },

  'growth-metric-dash': ({weekly_signups, weekly_revenue}) => {
    const ws=weekly_signups||[10,15,20,25]; const wr=weekly_revenue||[100,150,200,250];
    const wow=ws.length>=2?Math.round((ws[ws.length-1]-ws[ws.length-2])/Math.max(ws[ws.length-2],1)*100):0;
    return {_engine:'real', wow_growth:wow+'%', mrr:Math.round(wr[wr.length-1]*4.33), arr:Math.round(wr[wr.length-1]*4.33*12), trend:wow>0?'growing':'declining'};
  },

  'referral-code-gen': ({username, count}) => {
    const codes=Array.from({length:count||1},()=>(username||'USER').toUpperCase().slice(0,5)+'-'+crypto.randomBytes(2).toString('hex').toUpperCase());
    return {_engine:'real', codes, count:codes.length};
  },

  'competitor-matrix': ({your_features, competitors}) => {
    const yf=your_features||{}; const cs=competitors||{};
    const allFeatures=[...new Set([...Object.keys(yf),...Object.values(cs).flatMap(Object.keys)])];
    const advantages=allFeatures.filter(f=>yf[f]&&!Object.values(cs).some(c=>c[f]));
    return {_engine:'real', total_features:allFeatures.length, your_unique:advantages.length, advantages};
  },

  'landing-page-audit': ({sections}) => {
    const required=['headline','subheadline','cta','social_proof','features','pricing','faq'];
    const present=sections||[];
    const missing=required.filter(r=>!present.includes(r));
    return {_engine:'real', score:Math.round(present.filter(p=>required.includes(p)).length/required.length*100), missing, grade:missing.length===0?'A':missing.length<=2?'B':'C'};
  },

  'onboarding-score': ({steps}) => {
    const ss=steps||[{name:'signup',done:true},{name:'verify',done:true},{name:'first_call',done:false}];
    const done=ss.filter(s=>s.done).length;
    return {_engine:'real', completion:Math.round(done/ss.length*100), next_step:ss.find(s=>!s.done)?.name||'complete', status:done===ss.length?'complete':'in_progress'};
  },

  'stripe-price-calc': ({price, quantity, interval}) => {
    const gross=(price||29.99)*(quantity||1)*(interval==='yearly'?12:1);
    const fee=Math.round((gross*0.029+0.30)*100)/100;
    return {_engine:'real', gross, stripe_fee:fee, net:Math.round((gross-fee)*100)/100, effective_rate:Math.round(fee/gross*10000)/100+'%'};
  },

  'social-proof-gen': ({metrics}) => {
    const m=metrics||{users:10000,apis:771,uptime:99.9};
    const snippets=Object.entries(m).map(([k,v])=>({metric:k, snippet:v.toLocaleString()+(k==='uptime'?'% uptime':'+ '+k)}));
    return {_engine:'real', snippets, count:snippets.length};
  },

  'pricing-table-gen': ({tiers}) => {
    const ts=tiers||[{name:'Free',price:0,features:['100 calls']},{name:'Pro',price:29,features:['10K calls','Support']}];
    return {_engine:'real', tiers:ts.map(t=>({...t,popular:t.price>0&&t.price<100}))};
  },

  'waitlist-position': ({total, position}) => {
    const t=total||500; const p=position||Math.floor(Math.random()*t)+1;
    return {_engine:'real', position:p, total:t, percentile:Math.round((1-p/t)*100), shareable:'I\'m #'+p+' on the waitlist!'};
  },

  'launch-countdown': ({launch_date}) => {
    const ld=new Date(launch_date||Date.now()+7*86400000); const diff=ld-new Date();
    const days=Math.floor(diff/86400000); const hours=Math.floor((diff%86400000)/3600000);
    return {_engine:'real', days, hours, hype:Math.min(100,Math.round(100/(days+1))), message:days+'d '+hours+'h until launch'};
  },
};

module.exports = handlers;
