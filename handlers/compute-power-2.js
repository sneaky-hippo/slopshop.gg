'use strict';
const crypto = require('crypto');

const handlers = {
  // ─── BUSINESS LOGIC ───────────────────────────────────────
  'biz-tax-calculate': ({amount, rate, inclusive}) => {
    const a=amount||100;const r=rate||0;
    if(inclusive){const net=Math.round(a/(1+r/100)*100)/100;return {_engine:'real',gross:a,net,tax:Math.round((a-net)*100)/100,rate:r,type:'inclusive'};}
    const tax=Math.round(a*r/100*100)/100;return {_engine:'real',net:a,tax,gross:Math.round((a+tax)*100)/100,rate:r,type:'exclusive'};
  },

  'biz-discount-apply': ({price, discount_type, discount_value, quantity}) => {
    const p=price||100;const dt=discount_type||'percent';const dv=discount_value||10;const q=quantity||1;
    const subtotal=p*q;
    const discount=dt==='percent'?Math.round(subtotal*dv/100*100)/100:Math.min(dv,subtotal);
    return {_engine:'real',original:subtotal,discount,final:Math.round((subtotal-discount)*100)/100,savings_pct:Math.round(discount/subtotal*100)};
  },

  'biz-shipping-estimate': ({weight_kg, distance_km, method}) => {
    const w=weight_kg||1;const d=distance_km||100;const m=method||'standard';
    const rates={express:{base:15,per_kg:3,per_km:0.02,days:'1-2'},standard:{base:5,per_kg:1.5,per_km:0.01,days:'3-5'},economy:{base:2,per_kg:0.8,per_km:0.005,days:'7-14'}};
    const r=rates[m]||rates.standard;
    const cost=Math.round((r.base+w*r.per_kg+d*r.per_km)*100)/100;
    return {_engine:'real',cost,method:m,delivery_days:r.days,weight_kg:w,distance_km:d};
  },

  'biz-prorate': ({amount, total_days, used_days, method}) => {
    const a=amount||100;const td=total_days||30;const ud=used_days||15;const m=method||'daily';
    const daily=a/td;const prorated=Math.round(daily*(td-ud)*100)/100;const used=Math.round(daily*ud*100)/100;
    return {_engine:'real',original:a,prorated_refund:prorated,amount_used:used,daily_rate:Math.round(daily*100)/100,days_remaining:td-ud};
  },

  'biz-roi-calculate': ({investment, revenue, period_months}) => {
    const i=investment||1000;const r=revenue||1500;const p=period_months||12;
    const profit=r-i;const roi=Math.round(profit/i*10000)/100;
    const monthly_roi=Math.round(roi/p*100)/100;
    return {_engine:'real',investment:i,revenue:r,profit,roi_pct:roi,monthly_roi_pct:monthly_roi,payback_months:profit>0?Math.round(i/(profit/p)*10)/10:Infinity};
  },

  'biz-cac-ltv': ({acquisition_cost, monthly_revenue, churn_rate_pct, gross_margin_pct}) => {
    const cac=acquisition_cost||100;const mr=monthly_revenue||50;const cr=churn_rate_pct||5;const gm=gross_margin_pct||70;
    const ltv=cr>0?Math.round(mr*(gm/100)/(cr/100)*100)/100:0;
    const ratio=Math.round(ltv/Math.max(cac,1)*100)/100;
    return {_engine:'real',cac,ltv,ltv_cac_ratio:ratio,healthy:ratio>3,avg_lifetime_months:cr>0?Math.round(100/cr*10)/10:Infinity};
  },

  'biz-compound-interest': ({principal, rate, years, compounds_per_year}) => {
    const p=principal||1000;const r=rate||5;const y=years||10;const n=compounds_per_year||12;
    const total=Math.round(p*Math.pow(1+r/100/n,n*y)*100)/100;
    const interest=Math.round((total-p)*100)/100;
    return {_engine:'real',principal:p,total,interest,rate:r,years:y,multiplier:Math.round(total/p*100)/100+'x'};
  },

  'biz-mrr-calculate': ({customers}) => {
    const cs=customers||[{plan:'pro',price:29,quantity:50},{plan:'enterprise',price:99,quantity:10}];
    const mrr=cs.reduce((s,c)=>(c.price||0)*(c.quantity||0)+s,0);
    return {_engine:'real',mrr,arr:mrr*12,customers:cs.reduce((s,c)=>s+(c.quantity||0),0),arpu:Math.round(mrr/Math.max(cs.reduce((s,c)=>s+(c.quantity||0),0),1)*100)/100,plans:cs.map(c=>({plan:c.plan,revenue:c.price*c.quantity,pct:Math.round(c.price*c.quantity/Math.max(mrr,1)*100)}))};
  },

  'biz-pricing-strategy': ({cost, target_margin, competitor_prices}) => {
    const c=cost||50;const tm=target_margin||30;const cp=competitor_prices||[];
    const margin_price=Math.round(c/(1-tm/100)*100)/100;
    const avg_competitor=cp.length?Math.round(cp.reduce((a,b)=>a+b,0)/cp.length*100)/100:null;
    return {_engine:'real',cost:c,margin_based_price:margin_price,competitor_avg:avg_competitor,recommended:avg_competitor?Math.round((margin_price+avg_competitor)/2*100)/100:margin_price,floor:c,ceiling:avg_competitor?Math.max(...cp):margin_price*1.5};
  },

  'biz-time-value-money': ({present_value, future_value, rate, periods}) => {
    const r=(rate||5)/100;const n=periods||10;
    if(present_value){const fv=Math.round(present_value*Math.pow(1+r,n)*100)/100;return {_engine:'real',present_value,future_value:fv,rate:rate||5,periods:n};}
    if(future_value){const pv=Math.round(future_value/Math.pow(1+r,n)*100)/100;return {_engine:'real',present_value:pv,future_value,rate:rate||5,periods:n};}
    return {_engine:'real',error:'Provide present_value or future_value'};
  },

  // ─── DEVOPS & INFRASTRUCTURE ──────────────────────────────
  'devops-dockerfile-parse': ({dockerfile}) => {
    const lines=(dockerfile||'').split('\n').filter(l=>l.trim()&&!l.trim().startsWith('#'));
    const instructions=lines.map(l=>{const match=l.match(/^(\w+)\s+(.*)/);return match?{instruction:match[1],args:match[2].trim()}:{instruction:'UNKNOWN',args:l};});
    const base=instructions.find(i=>i.instruction==='FROM')?.args||'unknown';
    const ports=instructions.filter(i=>i.instruction==='EXPOSE').map(i=>i.args);
    const envs=instructions.filter(i=>i.instruction==='ENV').map(i=>i.args);
    return {_engine:'real',instructions:instructions.length,base_image:base,exposed_ports:ports,env_vars:envs.length,has_healthcheck:instructions.some(i=>i.instruction==='HEALTHCHECK'),stages:instructions.filter(i=>i.instruction==='FROM').length};
  },

  'devops-env-generate': ({variables}) => {
    const vs=variables||[{key:'DATABASE_URL',value:'postgresql://localhost/db',comment:'Main database'},{key:'API_KEY',value:'',comment:'Required'}];
    const content=vs.map(v=>(v.comment?'# '+v.comment+'\n':'')+v.key+'='+(v.value||'')).join('\n\n');
    return {_engine:'real',content,variables:vs.length};
  },

  'devops-semver-bump': ({version, type}) => {
    const v=version||'1.0.0';const t=type||'patch';
    const [major,minor,patch]=v.split('.').map(Number);
    const bumped=t==='major'?(major+1)+'.0.0':t==='minor'?major+'.'+(minor+1)+'.0':major+'.'+minor+'.'+(patch+1);
    return {_engine:'real',previous:v,next:bumped,type:t};
  },

  'devops-health-check-eval': ({checks}) => {
    const cs=checks||[{name:'api',status:'up',latency_ms:50},{name:'db',status:'up',latency_ms:20},{name:'cache',status:'down',latency_ms:0}];
    const healthy=cs.filter(c=>c.status==='up');const unhealthy=cs.filter(c=>c.status!=='up');
    const avgLatency=healthy.length?Math.round(healthy.reduce((s,c)=>s+c.latency_ms,0)/healthy.length):0;
    return {_engine:'real',status:unhealthy.length===0?'healthy':unhealthy.length<cs.length?'degraded':'down',checks:cs,healthy:healthy.length,unhealthy:unhealthy.length,avg_latency_ms:avgLatency};
  },

  'devops-uptime-calculate': ({total_seconds, downtime_seconds}) => {
    const t=total_seconds||2592000;const d=downtime_seconds||1800;
    const uptime=Math.round((1-d/t)*100000)/1000;
    const nines=uptime>=99.999?'five nines':uptime>=99.99?'four nines':uptime>=99.9?'three nines':uptime>=99?'two nines':'below two nines';
    return {_engine:'real',uptime_pct:uptime,downtime_seconds:d,nines,monthly_downtime_budget:Math.round((t*(1-uptime/100))*100)/100+'s'};
  },

  'devops-crontab-generate': ({description}) => {
    const d=(description||'').toLowerCase();
    const mappings={'every minute':'* * * * *','every hour':'0 * * * *','every day':'0 0 * * *','every day at midnight':'0 0 * * *','every monday':'0 0 * * 1','every weekday':'0 9 * * 1-5','every month':'0 0 1 * *','every sunday':'0 0 * * 0','twice a day':'0 0,12 * * *','every 5 minutes':'*/5 * * * *','every 15 minutes':'*/15 * * * *','every 30 minutes':'*/30 * * * *'};
    const match=Object.entries(mappings).find(([k])=>d.includes(k));
    return {_engine:'real',expression:match?match[1]:'* * * * *',description:match?match[0]:'every minute',matched:!!match};
  },

  'devops-log-parse': ({log_line, format}) => {
    const l=log_line||'';const f=format||'auto';
    // Try common log format
    const clf=l.match(/^(\S+) \S+ \S+ \[([^\]]+)\] "(\w+) ([^"]+)" (\d+) (\d+)/);
    if(clf)return {_engine:'real',format:'clf',ip:clf[1],timestamp:clf[2],method:clf[3],path:clf[4],status:Number(clf[5]),bytes:Number(clf[6])};
    // Try JSON log
    try{const j=JSON.parse(l);return {_engine:'real',format:'json',parsed:j};}catch(e){}
    // Try syslog
    const syslog=l.match(/^(\w+\s+\d+\s+[\d:]+)\s+(\S+)\s+(\S+?):\s+(.*)/);
    if(syslog)return {_engine:'real',format:'syslog',timestamp:syslog[1],host:syslog[2],service:syslog[3],message:syslog[4]};
    return {_engine:'real',format:'unknown',raw:l};
  },

  'devops-error-fingerprint': ({error_message, stack_trace}) => {
    const msg=(error_message||'').replace(/\d+/g,'N').replace(/0x[0-9a-f]+/gi,'0xN').trim();
    const firstFrame=(stack_trace||'').split('\n').find(l=>l.includes('at '))||'';
    const fp=crypto.createHash('md5').update(msg+firstFrame).digest('hex').slice(0,12);
    return {_engine:'real',fingerprint:fp,normalized_message:msg,first_frame:firstFrame.trim(),groupable:true};
  },

  'devops-resource-estimate': ({requests_per_second, avg_response_ms, target_utilization}) => {
    const rps=requests_per_second||100;const arm=avg_response_ms||50;const tu=target_utilization||70;
    const concurrent=Math.ceil(rps*arm/1000);
    const instances=Math.ceil(concurrent/(tu/100));
    return {_engine:'real',requests_per_second:rps,concurrent_connections:concurrent,recommended_instances:instances,target_utilization:tu,headroom_pct:100-tu};
  },

  'devops-sla-budget': ({sla_pct, period_days}) => {
    const sla=sla_pct||99.9;const pd=period_days||30;
    const totalMin=pd*24*60;const budgetMin=Math.round(totalMin*(1-sla/100)*100)/100;
    return {_engine:'real',sla_pct:sla,period_days:pd,downtime_budget_minutes:budgetMin,downtime_budget_seconds:Math.round(budgetMin*60),per_day_seconds:Math.round(budgetMin*60/pd*100)/100};
  },

  // ─── AI/ML UTILITIES ──────────────────────────────────────
  'ai-token-estimate': ({text, model}) => {
    const t=text||'';const m=model||'gpt-4';
    // ~4 chars per token for English
    const chars=t.length;const words=t.split(/\s+/).filter(Boolean).length;
    const tokenEst=Math.ceil(chars/3.8);
    const limits={'gpt-4':128000,'gpt-4o':128000,'gpt-4o-mini':128000,'claude-3-opus':200000,'claude-3-sonnet':200000,'claude-4-opus':200000,'claude-4-sonnet':200000,'claude-opus-4-6':200000,'claude-sonnet-4-6':200000,'claude-haiku-4-5':200000,'llama-3-70b':128000,'gemini-pro':1000000};
    return {_engine:'real',estimated_tokens:tokenEst,chars,words,model:m,context_limit:limits[m]||128000,utilization:Math.round(tokenEst/(limits[m]||128000)*10000)/100};
  },

  'ai-prompt-score': ({prompt}) => {
    const p=prompt||'';
    const clarity=(p.match(/\b(must|should|always|exactly|specifically|return|output|format)\b/gi)||[]).length;
    const structure=p.includes('\n')?1:0;const hasExamples=p.toLowerCase().includes('example')||p.includes('```')?1:0;
    const hasConstraints=(p.match(/\b(only|never|at most|at least|between|no more than|do not)\b/gi)||[]).length;
    const length=p.length;
    const score=Math.min(100,Math.round((clarity*5+structure*10+hasExamples*15+hasConstraints*5+Math.min(length/10,30))*100)/100);
    return {_engine:'real',score,clarity_signals:clarity,has_structure:!!structure,has_examples:!!hasExamples,constraint_count:hasConstraints,length,grade:score>70?'A':score>50?'B':score>30?'C':'D',tips:score<70?['Add specific output format','Include an example','Add constraints']:[]};
  },

  'ai-output-parse': ({text, expected_format}) => {
    const t=text||'';const f=expected_format||'json';
    if(f==='json'){
      // Try direct parse
      try{return {_engine:'real',parsed:JSON.parse(t),format:'json',success:true};}catch(e){}
      // Try extracting JSON block
      const match=t.match(/```(?:json)?\s*([\s\S]*?)```/)||t.match(/(\{[\s\S]*\})/)||t.match(/(\[[\s\S]*\])/);
      if(match)try{return {_engine:'real',parsed:JSON.parse(match[1]),format:'json',success:true,extracted:true};}catch(e){}
      return {_engine:'real',parsed:null,format:'json',success:false,raw:t};
    }
    if(f==='list'){const items=t.split('\n').map(l=>l.replace(/^[-*\d.)\s]+/,'')).filter(Boolean);return {_engine:'real',parsed:items,format:'list',success:items.length>0,count:items.length};}
    if(f==='yaml'){const result={};t.split('\n').forEach(l=>{const m=l.match(/^(\w+):\s*(.*)/);if(m)result[m[1]]=m[2];});return {_engine:'real',parsed:result,format:'yaml',success:Object.keys(result).length>0};}
    return {_engine:'real',parsed:t,format:f,success:true};
  },

  'ai-context-window-pack': ({messages, max_tokens, strategy}) => {
    const msgs=messages||[];const mt=max_tokens||4000;const s=strategy||'truncate_old';
    const estimated=msgs.map(m=>({...m,tokens:Math.ceil((m.content||'').length/4)}));
    const total=estimated.reduce((s,m)=>s+m.tokens,0);
    if(total<=mt)return {_engine:'real',messages:msgs,total_tokens:total,truncated:false};
    if(s==='truncate_old'){
      let budget=mt;const kept=[];
      for(let i=estimated.length-1;i>=0;i--){if(budget>=estimated[i].tokens){kept.unshift(msgs[i]);budget-=estimated[i].tokens;}else break;}
      return {_engine:'real',messages:kept,total_tokens:mt-budget,truncated:true,removed:msgs.length-kept.length};
    }
    return {_engine:'real',messages:msgs.slice(-Math.ceil(msgs.length/2)),truncated:true,strategy:s};
  },

  'ai-function-call-parse': ({text}) => {
    const t=text||'';
    // Try to extract function call patterns
    const patterns=[
      /(\w+)\(([\s\S]*?)\)/g,  // func(args)
      /\{"name":\s*"(\w+)",\s*"arguments":\s*(\{[\s\S]*?\})\}/g, // OpenAI format
      /<function_call>\s*(\w+)\s*([\s\S]*?)<\/function_call>/g, // XML format
    ];
    const calls=[];
    patterns.forEach(p=>{let m;while((m=p.exec(t))!==null){let args;try{args=JSON.parse(m[2]);}catch(e){args=m[2];}calls.push({name:m[1],arguments:args});}});
    return {_engine:'real',calls,count:calls.length,found:calls.length>0};
  },

  'ai-guardrail-score': ({text, rules}) => {
    const t=text||'';const rs=rules||['no_pii','no_profanity','max_length_5000','has_structure'];
    const violations=[];
    rs.forEach(r=>{
      if(r==='no_pii'&&/\b\d{3}-\d{2}-\d{4}\b|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(t))violations.push('pii_detected');
      if(r==='no_profanity'&&/\b(damn|shit|fuck|ass|hell)\b/i.test(t))violations.push('profanity_detected');
      if(r.startsWith('max_length_')&&t.length>parseInt(r.split('_')[2]))violations.push('too_long');
      if(r==='has_structure'&&!t.includes('\n')&&t.length>200)violations.push('no_structure');
    });
    return {_engine:'real',passed:violations.length===0,violations,score:Math.round((1-violations.length/Math.max(rs.length,1))*100),rules_checked:rs.length};
  },

  'ai-response-grade': ({response, criteria}) => {
    const r=response||'';const cs=criteria||['relevance','completeness','clarity','accuracy'];
    const scores=cs.map(c=>{let s=50;
      if(c==='relevance')s=Math.min(100,r.length>10?70+Math.min(r.length/50,30):20);
      if(c==='completeness')s=r.length>200?85:r.length>50?60:30;
      if(c==='clarity')s=r.includes('\n')||r.length<100?80:50;
      if(c==='accuracy')s=70;
      return {criterion:c,score:Math.round(s)};
    });
    const avg=Math.round(scores.reduce((s,c)=>s+c.score,0)/scores.length);
    return {_engine:'real',scores,overall:avg,grade:avg>80?'A':avg>60?'B':avg>40?'C':'D'};
  },

  'ai-chain-of-thought': ({problem, steps}) => {
    const stps=steps||['Understand the problem','Identify key information','Consider approaches','Choose best approach','Execute step by step','Verify answer'];
    return {_engine:'real',problem:problem||'',chain:stps.map((s,i)=>({step:i+1,instruction:s,status:'pending'})),total_steps:stps.length,note:'Execute each step sequentially, updating status to completed'};
  },

  'ai-tool-selector': ({task, tools}) => {
    const t=(task||'').toLowerCase();const ts=tools||[];
    const scored=ts.map(tool=>{
      const desc=((tool.description||'')+(tool.name||'')).toLowerCase();
      const words=t.split(/\s+/).filter(w=>w.length>3);
      const matches=words.filter(w=>desc.includes(w)).length;
      return {...tool,relevance:Math.round(matches/Math.max(words.length,1)*100)/100};
    }).filter(tool=>tool.relevance>0).sort((a,b)=>b.relevance-a.relevance);
    return {_engine:'real',recommended:scored.slice(0,5),total_evaluated:ts.length,matches:scored.length};
  },

  'ai-reflection': ({action, outcome, expected}) => {
    const success=outcome===expected||(!expected&&outcome);
    return {_engine:'real',action:action||'',outcome:outcome||'',expected:expected||'',success:!!success,reflection:success?'Action achieved expected outcome':'Action did not achieve expected outcome — consider alternative approaches',adjustments:success?[]:['Try a different tool','Modify input parameters','Break into smaller steps','Add validation before executing']};
  },

  // ─── PROTOCOL HELPERS ─────────────────────────────────────
  'graphql-query-build': ({type, fields, variables, filters}) => {
    const t=type||'query';const fs=fields||['id','name'];const vs=variables||{};const fl=filters||{};
    const filterStr=Object.entries(fl).length?'('+Object.entries(fl).map(([k,v])=>k+': '+JSON.stringify(v)).join(', ')+')':'';
    const varStr=Object.entries(vs).length?'('+Object.entries(vs).map(([k,v])=>'$'+k+': '+v).join(', ')+')':'';
    const query=t+varStr+' {\n  data'+filterStr+' {\n    '+fs.join('\n    ')+'\n  }\n}';
    return {_engine:'real',query,type:t,fields:fs.length,variables:Object.keys(vs).length};
  },

  'graphql-response-extract': ({response, path}) => {
    const r=response||{};const p=(path||'data').split('.');
    let val=r;p.forEach(k=>{if(val)val=val[k];});
    return {_engine:'real',extracted:val,path:p.join('.'),found:val!==undefined};
  },

  'jwt-decode-inspect': ({token}) => {
    const t=token||'';const parts=t.split('.');
    if(parts.length!==3)return {_engine:'real',valid:false,error:'Not a valid JWT (need 3 parts)'};
    try{
      const header=JSON.parse(Buffer.from(parts[0],'base64url').toString());
      const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString());
      const expired=payload.exp?payload.exp<Math.floor(Date.now()/1000):false;
      return {_engine:'real',valid:true,header,payload,expired,issued:payload.iat?new Date(payload.iat*1000).toISOString():null,expires:payload.exp?new Date(payload.exp*1000).toISOString():null};
    }catch(e){return {_engine:'real',valid:false,error:e.message};}
  },

  'webhook-payload-verify': ({payload, signature, secret, algorithm}) => {
    const p=typeof payload==='string'?payload:JSON.stringify(payload||{});
    const s=secret||'';const a=algorithm||'sha256';
    const expected=crypto.createHmac(a,s).update(p).digest('hex');
    const sig=(signature||'').replace(/^sha256=/,'');
    const valid=sig.length>0&&sig===expected;
    return {_engine:'real',valid,expected_prefix:expected.slice(0,12)+'...',algorithm:a};
  },

  'url-build': ({base, path, query, hash}) => {
    let url=(base||'https://api.example.com').replace(/\/$/,'');
    if(path)url+='/'+path.replace(/^\//,'');
    if(query&&Object.keys(query).length)url+='?'+Object.entries(query).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
    if(hash)url+='#'+hash;
    return {_engine:'real',url};
  },

  'url-parse-advanced': ({url}) => {
    try{const u=new URL(url||'');
    const pathParts=u.pathname.split('/').filter(Boolean);
    const queryParams=Object.fromEntries(u.searchParams);
    return {_engine:'real',valid:true,protocol:u.protocol,host:u.host,hostname:u.hostname,port:u.port||null,pathname:u.pathname,path_parts:pathParts,query:queryParams,hash:u.hash,origin:u.origin,is_https:u.protocol==='https:',has_query:u.search.length>1,has_hash:u.hash.length>1};}
    catch(e){return {_engine:'real',valid:false,error:'Invalid URL'};}
  },

  'cron-next-runs': ({expression, count, from}) => {
    const parts=(expression||'* * * * *').split(/\s+/);
    const n=Math.min(count||5,20);
    const start=from?new Date(from):new Date();
    const min=parts[0]==='*'?null:parts[0].includes('/')?(p=>({every:parseInt(p[1]),start:parseInt(p[0])||0}))(parts[0].split('/')):parseInt(parts[0]);
    const hour=parts[1]==='*'?null:parseInt(parts[1]);
    const runs=[];let t=new Date(start);t.setSeconds(0);t.setMilliseconds(0);
    while(runs.length<n&&runs.length<1000){
      t=new Date(t.getTime()+60000);
      const minMatch=min===null?true:typeof min==='object'?(t.getMinutes()-min.start)%min.every===0:t.getMinutes()===min;
      const hourMatch=hour===null||t.getHours()===hour;
      if(minMatch&&hourMatch)runs.push(t.toISOString());
    }
    return {_engine:'real',expression,next_runs:runs,count:runs.length};
  },

  // ─── TASK DECOMPOSITION ───────────────────────────────────
  'task-decompose': ({task, max_subtasks}) => {
    const t=task||'';const ms=max_subtasks||5;
    const words=t.split(/\s+/);
    const verbs=words.filter(w=>['create','build','analyze','test','deploy','fix','update','review','optimize','implement','write','design','research','validate'].includes(w.toLowerCase()));
    const subtasks=verbs.length?verbs.map((v,i)=>({id:i+1,action:v,description:v+' '+words.slice(words.indexOf(v)+1).join(' ').slice(0,50),status:'pending',priority:i+1})):
      [{id:1,action:'analyze',description:'Understand: '+t.slice(0,50),status:'pending'},{id:2,action:'plan',description:'Plan approach',status:'pending'},{id:3,action:'execute',description:'Execute plan',status:'pending'},{id:4,action:'verify',description:'Verify results',status:'pending'}];
    return {_engine:'real',task:t,subtasks:subtasks.slice(0,ms),count:Math.min(subtasks.length,ms)};
  },

  'task-prioritize': ({tasks}) => {
    const ts=tasks||[];
    const scored=ts.map(t=>({...t,
      urgency_score:t.deadline?Math.max(0,10-Math.round((new Date(t.deadline)-Date.now())/86400000)):5,
      impact_score:t.impact||5,
      effort_score:10-(t.effort||5),
      total:0
    }));
    scored.forEach(t=>t.total=t.urgency_score*0.4+t.impact_score*0.4+t.effort_score*0.2);
    return {_engine:'real',prioritized:scored.sort((a,b)=>b.total-a.total),count:scored.length};
  },

  'task-estimate': ({description, complexity}) => {
    const c=complexity||'medium';
    const estimates={trivial:{min:5,likely:15,max:30},easy:{min:15,likely:30,max:60},medium:{min:30,likely:120,max:240},hard:{min:120,likely:480,max:960},extreme:{min:480,likely:1440,max:2880}};
    const e=estimates[c]||estimates.medium;
    const pert=Math.round((e.min+4*e.likely+e.max)/6);
    return {_engine:'real',description:description||'',complexity:c,estimate_minutes:{optimistic:e.min,likely:e.likely,pessimistic:e.max,pert},estimate_hours:{optimistic:Math.round(e.min/60*10)/10,likely:Math.round(e.likely/60*10)/10,pessimistic:Math.round(e.max/60*10)/10,pert:Math.round(pert/60*10)/10}};
  },

  // ─── DATA & CONVERSION UTILITIES ────────────────────────
  'data-csv-to-json': ({csv, delimiter, has_header}) => {
    const d=delimiter||',';const hh=has_header!==false;
    const lines=(csv||'').split('\n').filter(l=>l.trim());
    if(!lines.length)return {_engine:'real',rows:[],count:0};
    const headers=hh?lines[0].split(d).map(h=>h.trim()):lines[0].split(d).map((_,i)=>'col_'+i);
    const dataLines=hh?lines.slice(1):lines;
    const rows=dataLines.map(l=>{const vals=l.split(d);const obj={};headers.forEach((h,i)=>obj[h]=(vals[i]||'').trim());return obj;});
    return {_engine:'real',rows,count:rows.length,columns:headers};
  },

  'data-json-to-csv': ({data, columns}) => {
    const d=data||[];if(!d.length)return {_engine:'real',csv:'',count:0};
    const cols=columns||Object.keys(d[0]);
    const header=cols.join(',');
    const rows=d.map(r=>cols.map(c=>{const v=String(r[c]||'');return v.includes(',')?'"'+v+'"':v;}).join(','));
    return {_engine:'real',csv:header+'\n'+rows.join('\n'),count:d.length,columns:cols};
  },

  'data-flatten-object': ({obj, delimiter}) => {
    const sep=delimiter||'.';
    const flatten=(o,prefix='')=>{const result={};for(const [k,v] of Object.entries(o||{})){const key=prefix?prefix+sep+k:k;if(v&&typeof v==='object'&&!Array.isArray(v))Object.assign(result,flatten(v,key));else result[key]=v;}return result;};
    const flat=flatten(obj||{});
    return {_engine:'real',flattened:flat,keys:Object.keys(flat).length,max_depth:Math.max(...Object.keys(flat).map(k=>k.split(sep).length))};
  },

  'data-diff-objects': ({a, b}) => {
    const objA=a||{};const objB=b||{};
    const allKeys=[...new Set([...Object.keys(objA),...Object.keys(objB)])];
    const added=allKeys.filter(k=>!(k in objA)&&k in objB);
    const removed=allKeys.filter(k=>k in objA&&!(k in objB));
    const changed=allKeys.filter(k=>k in objA&&k in objB&&JSON.stringify(objA[k])!==JSON.stringify(objB[k]));
    const unchanged=allKeys.filter(k=>k in objA&&k in objB&&JSON.stringify(objA[k])===JSON.stringify(objB[k]));
    return {_engine:'real',added,removed,changed:changed.map(k=>({key:k,from:objA[k],to:objB[k]})),unchanged:unchanged.length,total_differences:added.length+removed.length+changed.length,identical:added.length+removed.length+changed.length===0};
  },

  'data-schema-infer': ({sample}) => {
    const infer=(v)=>{if(v===null||v===undefined)return 'null';if(Array.isArray(v))return {type:'array',items:v.length?infer(v[0]):'unknown',length:v.length};if(typeof v==='object')return {type:'object',properties:Object.fromEntries(Object.entries(v).map(([k,val])=>[k,infer(val)]))};return typeof v;};
    const schema=infer(sample);
    return {_engine:'real',schema,root_type:Array.isArray(sample)?'array':typeof sample};
  },

  // ─── SECURITY UTILITIES ───────────────────────────────────
  'security-password-strength': ({password}) => {
    const p=password||'';const checks={length:p.length>=12,uppercase:/[A-Z]/.test(p),lowercase:/[a-z]/.test(p),numbers:/\d/.test(p),symbols:/[^A-Za-z0-9]/.test(p),no_common:!/(password|123456|qwerty|admin)/i.test(p)};
    const passed=Object.values(checks).filter(Boolean).length;const total=Object.keys(checks).length;
    const score=Math.round(passed/total*100);
    return {_engine:'real',score,strength:score>=80?'strong':score>=50?'moderate':'weak',checks,length:p.length,entropy_bits:Math.round(p.length*Math.log2(new Set(p.split('')).size||1))};
  },

  'security-hash-generate': ({input, algorithm}) => {
    const i=input||'';const a=algorithm||'sha256';
    const hash=crypto.createHash(a).update(i).digest('hex');
    return {_engine:'real',hash,algorithm:a,input_length:i.length};
  },

  'security-rate-limit-check': ({requests, window_seconds, limit}) => {
    const r=requests||0;const w=window_seconds||60;const l=limit||100;
    const remaining=Math.max(0,l-r);const exceeded=r>l;const rate=Math.round(r/w*100)/100;
    return {_engine:'real',allowed:!exceeded,requests:r,limit:l,remaining,window_seconds:w,rate_per_second:rate,retry_after:exceeded?Math.ceil(w-w*(l/r)):0};
  },

  'security-cors-validate': ({origin, allowed_origins, allowed_methods}) => {
    const o=origin||'';const ao=allowed_origins||['*'];const am=allowed_methods||['GET','POST','OPTIONS'];
    const allowed=ao.includes('*')||ao.includes(o);
    return {_engine:'real',allowed,origin:o,matched:allowed?ao.includes('*')?'*':o:null,allowed_origins:ao,allowed_methods:am,headers:{'Access-Control-Allow-Origin':allowed?(ao.includes('*')?'*':o):'','Access-Control-Allow-Methods':am.join(', '),'Access-Control-Max-Age':'86400'}};
  },

  'workflow-retry-backoff': ({attempt, base_delay_ms, max_delay_ms, strategy}) => {
    const a=attempt||1;const bd=base_delay_ms||1000;const md=max_delay_ms||30000;const s=strategy||'exponential';
    let delay;
    if(s==='exponential')delay=Math.min(bd*Math.pow(2,a-1),md);
    else if(s==='linear')delay=Math.min(bd*a,md);
    else if(s==='fibonacci'){let f1=bd,f2=bd;for(let i=2;i<a;i++){const t=f1+f2;f1=f2;f2=t;}delay=Math.min(f2,md);}
    else delay=bd;
    const jitter=Math.round(delay*0.1*((a*7+3)%10)/10);
    return {_engine:'real',attempt:a,delay_ms:delay,with_jitter_ms:delay+jitter,strategy:s,max_delay_ms:md,should_retry:a<=10};
  },
};

module.exports = handlers;
