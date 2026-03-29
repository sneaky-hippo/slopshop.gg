'use strict';
const crypto = require('crypto');

const handlers = {
  'validate-email-syntax': ({email}) => {
    const e=email||'';
    const rfc=/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    const valid=rfc.test(e);
    const disposable=['mailinator.com','tempmail.com','throwaway.email','guerrillamail.com','yopmail.com','10minutemail.com','trashmail.com'];
    const domain=e.split('@')[1]||'';
    const isDisposable=disposable.includes(domain.toLowerCase());
    const typos={'gamil.com':'gmail.com','gmial.com':'gmail.com','gnail.com':'gmail.com','hotmal.com':'hotmail.com','yaho.com':'yahoo.com','outloo.com':'outlook.com'};
    const suggestion=typos[domain.toLowerCase()]?e.replace(domain,typos[domain.toLowerCase()]):null;
    return {_engine:'real', valid, email:e, domain, is_disposable:isDisposable, suggestion, parts:{local:e.split('@')[0]||'',domain}};
  },

  'validate-phone-format': ({phone, country}) => {
    const p=(phone||'').replace(/[\s()-]/g,'');
    const formats={US:{regex:/^\+?1?\d{10}$/,code:'+1'},UK:{regex:/^\+?44\d{10}$/,code:'+44'},DE:{regex:/^\+?49\d{10,11}$/,code:'+49'},FR:{regex:/^\+?33\d{9}$/,code:'+33'},JP:{regex:/^\+?81\d{9,10}$/,code:'+81'},IN:{regex:/^\+?91\d{10}$/,code:'+91'},AU:{regex:/^\+?61\d{9}$/,code:'+61'},CA:{regex:/^\+?1\d{10}$/,code:'+1'}};
    const c=country||'US';
    const fmt=formats[c]||formats.US;
    const valid=fmt.regex.test(p);
    const digits=p.replace(/\D/g,'');
    const e164=digits.length>=10?fmt.code+digits.slice(-10):p;
    return {_engine:'real', valid, phone:p, e164, country:c, digits:digits.length, type:digits.length===10?'likely_mobile':'unknown'};
  },

  'validate-credit-card': (input) => {
    input=input||{};
    const number=input.number||input.value||input.card||'';
    const n=(number).replace(/[\s-]/g,'');
    // Luhn check
    let sum=0,alt=false;
    for(let i=n.length-1;i>=0;i--){let d=parseInt(n[i],10);if(alt){d*=2;if(d>9)d-=9;}sum+=d;alt=!alt;}
    const luhnValid=sum%10===0&&n.length>=13;
    const networks=[{name:'Visa',regex:/^4/,lengths:[13,16,19]},{name:'Mastercard',regex:/^5[1-5]|^2[2-7]/,lengths:[16]},{name:'Amex',regex:/^3[47]/,lengths:[15]},{name:'Discover',regex:/^6(?:011|5)/,lengths:[16,19]},{name:'Diners',regex:/^3(?:0[0-5]|[68])/,lengths:[14]},{name:'JCB',regex:/^35/,lengths:[15,16]}];
    const detected=networks.find(net=>net.regex.test(n)&&net.lengths.includes(n.length));
    return {_engine:'real', valid:luhnValid, number_masked:'****'+n.slice(-4), network:detected?.name||'unknown', digits:n.length, luhn:luhnValid};
  },

  'validate-iban': ({iban}) => {
    const i=(iban||'').replace(/\s/g,'').toUpperCase();
    const country=i.slice(0,2);
    const check=i.slice(2,4);
    const bban=i.slice(4);
    const lengths={DE:22,FR:27,GB:22,ES:24,IT:27,NL:18,BE:16,AT:20,CH:21,PL:28,SE:24,NO:15,DK:18,FI:18,PT:25,IE:22,LU:20};
    const validLength=lengths[country]?i.length===lengths[country]:i.length>=15&&i.length<=34;
    // Check digit validation
    const rearranged=bban+country+check;
    const numeric=rearranged.split('').map(c=>c>='A'&&c<='Z'?c.charCodeAt(0)-55:c).join('');
    let remainder=numeric.slice(0,9);
    for(let j=9;j<numeric.length;j+=7){remainder=String(parseInt(remainder,10)%97)+numeric.slice(j,j+7);}
    const checkValid=parseInt(remainder,10)%97===1;
    return {_engine:'real', valid:validLength&&checkValid, iban:i, country, check_digits:check, bban, valid_length:validLength, valid_check:checkValid};
  },

  'validate-url-format': ({url}) => {
    const u=url||'';
    try{const parsed=new URL(u);return {_engine:'real', valid:true, url:u, protocol:parsed.protocol, hostname:parsed.hostname, port:parsed.port||null, pathname:parsed.pathname, search:parsed.search, hash:parsed.hash, is_https:parsed.protocol==='https:'};}
    catch(e){return {_engine:'real', valid:false, url:u, error:'Invalid URL format'};}
  },

  'validate-ip-address': ({ip}) => {
    const i=ip||'';
    const v4=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(i)&&i.split('.').every(o=>parseInt(o)<=255);
    const v6=/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(i);
    const parts=i.split('.').map(Number);
    const isPrivate=v4&&(parts[0]===10||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168));
    const isLoopback=v4&&parts[0]===127;
    const isMulticast=v4&&parts[0]>=224&&parts[0]<=239;
    return {_engine:'real', valid:v4||v6, ip:i, version:v4?4:v6?6:null, is_private:isPrivate, is_loopback:isLoopback, is_multicast:isMulticast, type:isPrivate?'private':isLoopback?'loopback':isMulticast?'multicast':'public'};
  },

  'validate-postal-code': ({code, country}) => {
    const c=(code||'').trim();const cc=country||'US';
    const patterns={US:/^\d{5}(-\d{4})?$/,UK:/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,CA:/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,DE:/^\d{5}$/,FR:/^\d{5}$/,JP:/^\d{3}-?\d{4}$/,AU:/^\d{4}$/,IN:/^\d{6}$/,BR:/^\d{5}-?\d{3}$/,IT:/^\d{5}$/};
    const pat=patterns[cc];
    return {_engine:'real', valid:pat?pat.test(c):c.length>0, code:c, country:cc, format_known:!!pat};
  },

  'validate-vat-number': ({vat}) => {
    const v=(vat||'').replace(/\s/g,'').toUpperCase();
    const country=v.slice(0,2);
    const number=v.slice(2);
    const patterns={DE:/^\d{9}$/,FR:/^[0-9A-Z]{2}\d{9}$/,GB:/^\d{9}$|^\d{12}$/,IT:/^\d{11}$/,ES:/^[A-Z]\d{7}[A-Z0-9]$/,NL:/^\d{9}B\d{2}$/,BE:/^0\d{9}$/,AT:/^U\d{8}$/,PL:/^\d{10}$/};
    const pat=patterns[country];
    return {_engine:'real', valid:pat?pat.test(number):number.length>=8, vat:v, country, number, format_known:!!pat};
  },

  'validate-isbn': ({isbn}) => {
    const i=(isbn||'').replace(/[-\s]/g,'');
    let valid10=false,valid13=false;
    if(i.length===10){let sum=0;for(let j=0;j<9;j++)sum+=parseInt(i[j])*(10-j);const check=i[9]==='X'?10:parseInt(i[9]);valid10=(sum+check)%11===0;}
    if(i.length===13){let sum=0;for(let j=0;j<12;j++)sum+=parseInt(i[j])*(j%2===0?1:3);valid13=(10-sum%10)%10===parseInt(i[12]);}
    return {_engine:'real', valid:valid10||valid13, isbn:i, format:valid10?'ISBN-10':valid13?'ISBN-13':'unknown', digits:i.length};
  },

  'validate-color-value': ({color}) => {
    const c=(color||'').trim();
    const isHex=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c);
    const isRgb=/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(c);
    const isHsl=/^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/.test(c);
    const named=['red','blue','green','black','white','yellow','orange','purple','pink','gray','cyan','magenta','lime','navy','teal','silver','maroon','olive','aqua','fuchsia'];
    const isNamed=named.includes(c.toLowerCase());
    return {_engine:'real', valid:isHex||isRgb||isHsl||isNamed, color:c, format:isHex?'hex':isRgb?'rgb':isHsl?'hsl':isNamed?'named':'unknown'};
  },

  'validate-mime-type': ({mime}) => {
    const m=(mime||'').toLowerCase();
    const valid=/^(application|audio|font|image|message|model|multipart|text|video)\/[\w.+-]+$/.test(m);
    const extMap={'application/json':'.json','application/pdf':'.pdf','text/html':'.html','text/css':'.css','text/javascript':'.js','image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/svg+xml':'.svg','application/zip':'.zip','text/csv':'.csv','application/xml':'.xml','text/plain':'.txt','application/octet-stream':'.bin'};
    return {_engine:'real', valid, mime:m, extension:extMap[m]||null, category:m.split('/')[0]||'unknown'};
  },

  'validate-domain-name': ({domain}) => {
    const d=(domain||'').toLowerCase();
    const valid=/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d);
    const parts=d.split('.');
    const tld=parts[parts.length-1]||'';
    const sld=parts.length>=2?parts[parts.length-2]:'';
    return {_engine:'real', valid, domain:d, tld, sld, subdomain:parts.length>2?parts.slice(0,-2).join('.'):null, levels:parts.length};
  },

  // ─── API TESTING & MOCKING ────────────────────────────────
  'api-mock-response': ({schema, status}) => {
    function mockFromSchema(s){
      if(!s)return null;
      if(s.type==='string')return s.example||s.enum?.[0]||'mock_string';
      if(s.type==='number'||s.type==='integer')return s.example||s.minimum||42;
      if(s.type==='boolean')return s.example||true;
      if(s.type==='array')return [mockFromSchema(s.items)];
      if(s.type==='object'){const obj={};Object.entries(s.properties||{}).forEach(([k,v])=>obj[k]=mockFromSchema(v));return obj;}
      return null;
    }
    return {_engine:'real', status:status||200, body:mockFromSchema(schema||{type:'object',properties:{id:{type:'integer'},name:{type:'string'}}}), headers:{'content-type':'application/json','x-mock':'true'}};
  },

  'api-mock-dataset': ({fields, count}) => {
    const n=Math.min(count||10,1000);
    const fs=fields||[{name:'id',type:'integer'},{name:'name',type:'string'},{name:'email',type:'email'}];
    const names=['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Hank','Iris','Jack'];
    const domains=['example.com','test.org','demo.net'];
    const gen={integer:(i)=>i+1,string:(i)=>names[i%names.length],email:(i)=>names[i%names.length].toLowerCase()+'@'+domains[i%domains.length],boolean:(i)=>i%2===0,float:(i)=>Math.round(((i*73+17)%1000))/100,date:(i)=>new Date(1700000000000-((i*73+17)%365)*86400000).toISOString().slice(0,10)};
    const rows=Array.from({length:n},(_,i)=>Object.fromEntries(fs.map(f=>[f.name,(gen[f.type]||gen.string)(i)])));
    return {_engine:'real', data:rows, count:n, fields:fs.map(f=>f.name)};
  },

  'api-test-assertion': ({response, assertions}) => {
    const r=response||{}; const as=assertions||[];
    const results=as.map(a=>{
      let passed=false;
      if(a.type==='status') passed=(r.status||200)===a.expected;
      else if(a.type==='jsonpath'){const parts=(a.path||'').split('.');let val=r.body||r;parts.forEach(p=>{if(val)val=val[p];});passed=a.expected!==undefined?val===a.expected:val!==undefined;}
      else if(a.type==='header') passed=r.headers?.[a.key]===a.expected;
      else if(a.type==='regex') passed=new RegExp(a.pattern||'').test(JSON.stringify(r.body||r));
      return {...a, passed, actual:a.type==='status'?r.status:undefined};
    });
    return {_engine:'real', passed:results.every(r=>r.passed), results, total:results.length, failures:results.filter(r=>!r.passed).length};
  },

  'api-request-build': ({method, url, headers, query, body, auth}) => {
    const u=new URL(url||'https://api.example.com/v1/resource');
    if(query)Object.entries(query).forEach(([k,v])=>u.searchParams.set(k,String(v)));
    const h={'Content-Type':'application/json',...(headers||{})};
    if(auth?.type==='bearer')h['Authorization']='Bearer '+auth.token;
    if(auth?.type==='basic')h['Authorization']='Basic '+Buffer.from((auth.username||'')+':'+(auth.password||'')).toString('base64');
    if(auth?.type==='api_key')h[auth.header||'X-API-Key']=auth.key;
    return {_engine:'real', method:(method||'GET').toUpperCase(), url:u.toString(), headers:h, body:body||null};
  },

  'api-curl-parse': ({curl}) => {
    const c=curl||'';
    const method=(c.match(/-X\s+(\w+)/)||[])[1]||'GET';
    const url=(c.match(/curl\s+['"]?(https?:\/\/\S+?)['"]?\s/)||c.match(/curl\s+(\S+)/)||[])[1]||'';
    const headers={};
    const headerMatches=c.matchAll(/-H\s+['"]([^:]+):\s*([^'"]+)['"]/g);
    for(const m of headerMatches)headers[m[1].trim()]=m[2].trim();
    const bodyMatch=c.match(/-d\s+['"](.+?)['"]/s);
    let body=null;
    if(bodyMatch)try{body=JSON.parse(bodyMatch[1]);}catch(e){body=bodyMatch[1];}
    return {_engine:'real', method, url, headers, body, has_auth:!!headers['Authorization']};
  },

  'api-curl-generate': ({method, url, headers, body}) => {
    let cmd='curl';
    if(method&&method!=='GET')cmd+=' -X '+method;
    Object.entries(headers||{}).forEach(([k,v])=>cmd+=` -H '${k}: ${v}'`);
    if(body)cmd+=` -d '${typeof body==='string'?body:JSON.stringify(body)}'`;
    cmd+=' '+(url||'https://api.example.com');
    return {_engine:'real', curl:cmd};
  },

  'api-rate-limit-calc': ({requests_per_window, window_seconds, current_count, burst_limit}) => {
    const rpw=requests_per_window||100;const ws=window_seconds||60;const cc=current_count||0;const bl=burst_limit||rpw;
    const remaining=Math.max(0,rpw-cc);
    const rps=rpw/ws;
    return {_engine:'real', allowed:cc<rpw, remaining, limit:rpw, window_seconds:ws, requests_per_second:Math.round(rps*100)/100, burst_limit:bl, reset_in_seconds:remaining<=0?ws:0, utilization:Math.round(cc/rpw*100)};
  },

  'api-latency-stats': ({latencies}) => {
    const ls=(latencies||[]).sort((a,b)=>a-b);
    if(!ls.length)return {_engine:'real', error:'No data'};
    const sum=ls.reduce((a,b)=>a+b,0);
    const p=(pct)=>ls[Math.min(Math.floor(ls.length*pct/100),ls.length-1)];
    return {_engine:'real', count:ls.length, min:ls[0], max:ls[ls.length-1], mean:Math.round(sum/ls.length*100)/100, median:p(50), p50:p(50), p90:p(90), p95:p(95), p99:p(99), std_dev:Math.round(Math.sqrt(ls.reduce((s,v)=>s+(v-sum/ls.length)**2,0)/ls.length)*100)/100};
  },

  'api-error-classify': ({status_code}) => {
    const s=status_code||500;
    const classes={400:{category:'client_error',name:'Bad Request',retry:false,action:'Fix request parameters'},401:{category:'auth_error',name:'Unauthorized',retry:false,action:'Check API key/token'},403:{category:'auth_error',name:'Forbidden',retry:false,action:'Check permissions'},404:{category:'client_error',name:'Not Found',retry:false,action:'Check endpoint URL'},408:{category:'timeout',name:'Request Timeout',retry:true,action:'Retry with backoff'},429:{category:'rate_limit',name:'Too Many Requests',retry:true,action:'Wait for Retry-After header'},500:{category:'server_error',name:'Internal Server Error',retry:true,action:'Retry with exponential backoff'},502:{category:'server_error',name:'Bad Gateway',retry:true,action:'Retry after brief delay'},503:{category:'server_error',name:'Service Unavailable',retry:true,action:'Wait and retry'},504:{category:'timeout',name:'Gateway Timeout',retry:true,action:'Retry with longer timeout'}};
    const info=classes[s]||{category:s<400?'success':s<500?'client_error':'server_error',name:'HTTP '+s,retry:s>=500,action:'Check documentation'};
    return {_engine:'real', status_code:s, ...info};
  },

  'api-snippet-generate': ({method, url, headers, body, language}) => {
    const m=method||'GET';const u=url||'https://api.example.com';const h=headers||{};const b=body;const l=language||'curl';
    const snippets={};
    // curl
    let curl='curl';if(m!=='GET')curl+=' -X '+m;Object.entries(h).forEach(([k,v])=>curl+=` \\\n  -H '${k}: ${v}'`);if(b)curl+=` \\\n  -d '${JSON.stringify(b)}'`;curl+=' \\\n  '+u;
    snippets.curl=curl;
    // fetch
    const fetchOpts=m==='GET'?'':`{\n  method: '${m}',\n  headers: ${JSON.stringify(h,null,2)},${b?`\n  body: JSON.stringify(${JSON.stringify(b)}),`:''}\n}`;
    snippets.javascript=`const response = await fetch('${u}'${fetchOpts?', '+fetchOpts:''});\nconst data = await response.json();`;
    // python
    snippets.python=`import requests\nresponse = requests.${m.toLowerCase()}('${u}'${b?`, json=${JSON.stringify(b)}`:''}${Object.keys(h).length?`, headers=${JSON.stringify(h)}`:''})`;
    return {_engine:'real', snippets, language:l, primary:snippets[l]||snippets.curl};
  },

  'validate-json-schema': ({data, schema}) => {
    const d=data; const s=schema||{};
    const errors=[];
    function validate(val, sch, path='$'){
      if(!sch)return;
      if(sch.type){
        const t=Array.isArray(val)?'array':val===null?'null':typeof val;
        if(sch.type==='integer'){if(!Number.isInteger(val))errors.push({path,message:`Expected integer, got ${t}`});}
        else if(t!==sch.type)errors.push({path,message:`Expected ${sch.type}, got ${t}`});
      }
      if(sch.required&&sch.type==='object'&&val&&typeof val==='object'){
        sch.required.forEach(r=>{if(!(r in val))errors.push({path:path+'.'+r,message:'Required field missing'});});
      }
      if(sch.properties&&val&&typeof val==='object'){
        Object.entries(sch.properties).forEach(([k,v])=>validate(val[k],v,path+'.'+k));
      }
      if(sch.minLength&&typeof val==='string'&&val.length<sch.minLength)errors.push({path,message:`String too short (min ${sch.minLength})`});
      if(sch.maxLength&&typeof val==='string'&&val.length>sch.maxLength)errors.push({path,message:`String too long (max ${sch.maxLength})`});
      if(sch.minimum!==undefined&&typeof val==='number'&&val<sch.minimum)errors.push({path,message:`Value below minimum ${sch.minimum}`});
      if(sch.maximum!==undefined&&typeof val==='number'&&val>sch.maximum)errors.push({path,message:`Value above maximum ${sch.maximum}`});
      if(sch.enum&&!sch.enum.includes(val))errors.push({path,message:`Value not in enum [${sch.enum.join(',')}]`});
    }
    validate(d,s);
    return {_engine:'real', valid:errors.length===0, errors, error_count:errors.length};
  },

  'api-response-diff': ({expected, actual}) => {
    const exp=expected||{};const act=actual||{};
    const diffs=[];
    function diff(e,a,path='$'){
      if(typeof e!==typeof a){diffs.push({path,type:'type_mismatch',expected:typeof e,actual:typeof a});return;}
      if(Array.isArray(e)&&Array.isArray(a)){
        if(e.length!==a.length)diffs.push({path,type:'array_length',expected:e.length,actual:a.length});
        const len=Math.min(e.length,a.length);
        for(let i=0;i<len;i++)diff(e[i],a[i],path+'['+i+']');
      } else if(e&&typeof e==='object'&&a&&typeof a==='object'){
        const allKeys=new Set([...Object.keys(e),...Object.keys(a)]);
        allKeys.forEach(k=>{
          if(!(k in e))diffs.push({path:path+'.'+k,type:'added'});
          else if(!(k in a))diffs.push({path:path+'.'+k,type:'removed'});
          else diff(e[k],a[k],path+'.'+k);
        });
      } else if(e!==a){diffs.push({path,type:'value_changed',expected:e,actual:a});}
    }
    diff(exp,act);
    return {_engine:'real', match:diffs.length===0, diffs, diff_count:diffs.length};
  },

  'api-health-score': ({latency_ms, error_rate, uptime_pct, response_valid}) => {
    const lat=latency_ms||0;const err=error_rate||0;const up=uptime_pct||100;const rv=response_valid!==false;
    let score=100;
    // Latency penalties
    if(lat>5000)score-=40;else if(lat>2000)score-=25;else if(lat>1000)score-=15;else if(lat>500)score-=5;
    // Error rate penalties
    score-=Math.min(err*100,40);
    // Uptime penalties
    if(up<99)score-=20;else if(up<99.9)score-=10;else if(up<99.99)score-=5;
    // Response validity
    if(!rv)score-=15;
    score=Math.max(0,Math.round(score));
    const grade=score>=90?'A':score>=80?'B':score>=70?'C':score>=60?'D':'F';
    return {_engine:'real', score, grade, factors:{latency_ms:lat,error_rate:err,uptime_pct:up,response_valid:rv}, status:score>=70?'healthy':score>=50?'degraded':'unhealthy'};
  },
};

module.exports = handlers;
