#!/usr/bin/env node
const https=require('https'),fs=require('fs'),path=require('path');
const KEY=(()=>{try{return JSON.parse(fs.readFileSync(path.join(require('os').homedir(),'.slopshop','config.json'),'utf8')).api_key}catch(e){return''}})();
function api(m,p,b){return new Promise(r=>{const o={hostname:'slopshop.gg',path:p,method:m,timeout:60000,headers:{'Authorization':'Bearer '+KEY,'Content-Type':'application/json','Accept-Encoding':'identity'}};const req=https.request(o,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{r(JSON.parse(d))}catch(e){r({error:d.slice(0,80)})}})});req.on('error',e=>r({error:e.message}));req.on('timeout',()=>{req.destroy();r({error:'timeout'})});if(b)req.write(JSON.stringify(b));req.end()});}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

const TASKS=[
  t=>({task:'Hash '+t+' with SHA-256',v:d=>d.hash}),
  t=>({task:'Generate a UUID',v:d=>d.uuid}),
  t=>({task:'Count the words in: '+t,v:d=>d.words}),
  t=>({task:'Reverse the string: '+t,v:d=>d.result}),
  t=>({task:'Generate a password with 24 characters',v:d=>d.password}),
  t=>({task:'Slugify: '+t,v:d=>d.slug}),
  t=>({task:'Base64 encode: '+t,v:d=>d.result}),
  t=>({task:'Generate a random number between 1 and 99999',v:d=>d.result!==undefined}),
  t=>({task:'Validate this email: test@'+t+'.gg',v:d=>d.valid!==undefined}),
  t=>({task:'Count characters in: '+t,v:d=>d.withSpaces||d.characters}),
];
const AGENTS=['CEO','CTO','VP-Eng','VP-Prod','EM-1','Eng-1','Eng-2','Eng-3','QA-1','Sec-1','DevOps','PM-1'];

async function main(){
  console.log('10,000-SPRINT ENGINE — '+AGENTS.length+' agents, smart routing, LLM synthesis');
  const b=await api('GET','/v1/credits/balance');
  console.log('Balance: '+((b.data||b).balance||0).toLocaleString()+'cr\n');
  
  const org=await api('POST','/v1/org/launch',{name:'10K Sprint Engine',
    agents:AGENTS.map((n,i)=>({name:n,role:n.toLowerCase(),model:['claude','gpt','grok'][i%3],skills:['compute']})),
    channels:['general','standups','results'],auto_handoff:true});
  const hive=(org.data||org).hive_id||'hive-'+((org.data||org).org_id||'').slice(0,8);

  let ok=0,fail=0,cr=0,streak=0,maxStreak=0;
  
  for(let s=1;s<=10000;s++){
    const agent=AGENTS[s%AGENTS.length];
    const taskFn=TASKS[s%TASKS.length];
    const context='sprint-'+s+'-'+agent+'-'+Date.now();
    const{task,v}=taskFn(context);
    
    const res=await api('POST','/v1/agent/run',{task});
    const data=res.data||res;
    const steps=data.steps||[];
    const firstResult=steps[0]?.result||{};
    const credits=data.total_credits||0;
    cr+=credits;
    
    if(v(firstResult)){ok++;streak++;if(streak>maxStreak)maxStreak=streak;}
    else{fail++;streak=0;}
    
    // Post to hive every 10th sprint
    if(s%10===0){
      await api('POST','/v1/hive/'+hive+'/send',{channel:'standups',from:agent,
        message:'S'+s+': '+ok+'/'+(ok+fail)+' ('+Math.round(ok/(ok+fail)*100)+'%) streak:'+streak+' cr:'+cr});
    }
    
    // Checkpoint every 100
    if(s%100===0){
      await api('POST','/v1/memory-set',{key:'10k-cp-'+s,value:JSON.stringify({s,ok,fail,cr,streak,maxStreak,ts:new Date().toISOString()})});
    }
    
    // Print every 50
    if(s<=5||s%50===0||s===10000){
      console.log('S'+String(s).padStart(5)+' | '+ok+'/'+(ok+fail)+' ('+Math.round(ok/(ok+fail)*100)+'%) | '+cr+'cr | streak:'+streak+' max:'+maxStreak+' | '+agent+':'+steps[0]?.api);
    }
    
    await sleep(4000);
  }
  
  console.log('\n═══ 10,000 SPRINTS COMPLETE ═══');
  console.log('OK:'+ok+' Fail:'+fail+' Rate:'+Math.round(ok/(ok+fail)*100)+'% Credits:'+cr+' MaxStreak:'+maxStreak);
  const fb=await api('GET','/v1/credits/balance');
  console.log('Balance: '+((fb.data||fb).balance||0).toLocaleString()+'cr');
}
main().catch(e=>console.error('Fatal:',e.message));
