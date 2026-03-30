'use strict';
const crypto = require('crypto');

const handlers = {
  // ─── STRING POWER TOOLS ───────────────────────────────────
  'string-template': ({template, vars}) => {
    let t=template||'';const v=vars||{};
    t=t.replace(/\$\{(\w+)\}/g,(_,k)=>v[k]!==undefined?String(v[k]):_);
    t=t.replace(/\{\{(\w+)\}\}/g,(_,k)=>v[k]!==undefined?String(v[k]):_);
    t=t.replace(/%\{(\w+)\}/g,(_,k)=>v[k]!==undefined?String(v[k]):_);
    const unresolved=(t.match(/[\$%]?\{?\{(\w+)\}?\}/g)||[]).length;
    return {_engine:'real', rendered:t, vars_applied:Object.keys(v).length, unresolved};
  },

  'string-pad': ({text, length, char, direction}) => {
    const t=String(text||'');const l=length||20;const c=(char||' ')[0];const d=direction||'right';
    return {_engine:'real', result:d==='left'?t.padStart(l,c):d==='center'?t.padStart(Math.floor((l+t.length)/2),c).padEnd(l,c):t.padEnd(l,c), original_length:t.length, padded_length:l};
  },

  'string-wrap': ({text, width}) => {
    const t=text||'';const w=width||80;
    const words=t.split(/\s+/);const lines=[];let line='';
    words.forEach(word=>{if((line+' '+word).trim().length>w){lines.push(line.trim());line=word;}else line+=(line?' ':'')+word;});
    if(line)lines.push(line.trim());
    return {_engine:'real', wrapped:lines.join('\n'), lines:lines.length, width:w};
  },

  'string-escape': ({text, format}) => {
    const t=text||'';const f=format||'json';
    const escaped={json:JSON.stringify(t).slice(1,-1), html:t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'), xml:t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&apos;').replace(/"/g,'&quot;'), regex:t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), url:encodeURIComponent(t), sql:t.replace(/'/g,"''"), csv:t.includes(',')||t.includes('"')||t.includes('\n')?'"'+t.replace(/"/g,'""')+'"':t};
    return {_engine:'real', result:escaped[f]||escaped.json, format:f, original_length:t.length};
  },

  'string-unescape': ({text, format}) => {
    const t=text||'';const f=format||'json';
    let result=t;
    if(f==='html')result=t.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    if(f==='url')result=decodeURIComponent(t);
    if(f==='json')try{result=JSON.parse('"'+t+'"');}catch(e){}
    return {_engine:'real', result, format:f};
  },

  'string-between': ({text, start, end, all}) => {
    const t=text||'';const s=start||'';const e=end||'';
    if(all){const regex=new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(.*?)'+e.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gs');const matches=[...t.matchAll(regex)].map(m=>m[1]);return {_engine:'real',matches,count:matches.length};}
    const si=t.indexOf(s);if(si<0)return {_engine:'real',result:null,found:false};
    const ei=t.indexOf(e,si+s.length);if(ei<0)return {_engine:'real',result:null,found:false};
    return {_engine:'real',result:t.slice(si+s.length,ei),found:true};
  },

  'string-mask': ({text, visible_start, visible_end, mask_char}) => {
    const t=text||'';const vs=visible_start||4;const ve=visible_end||4;const mc=mask_char||'*';
    if(t.length<=vs+ve)return {_engine:'real',masked:mc.repeat(t.length),original_length:t.length};
    return {_engine:'real',masked:t.slice(0,vs)+mc.repeat(t.length-vs-ve)+t.slice(-ve),original_length:t.length};
  },

  'string-repeat': ({text, count, separator}) => {
    const t=text||'';const c=Math.min(count||1,1000);const s=separator||'';
    return {_engine:'real',result:Array(c).fill(t).join(s),length:t.length*c+s.length*(c-1)};
  },

  'regex-build': (input) => {
    try{input=input||{};const {pattern, flags, test_string}=input;const r=new RegExp(pattern||'',flags||'g');const ts=typeof test_string==='string'?test_string:'';const matches=ts?(ts.match(r)||[]):[];
    return {_engine:'real',regex:r.toString(),pattern:pattern||'',flags:flags||'g',valid:true,test_matches:matches,match_count:matches.length};}
    catch(e){return {_engine:'real',valid:false,error:e.message};}
  },

  'regex-extract-groups': ({text, pattern, flags}) => {
    try{const r=new RegExp(pattern||'(\\w+)',flags||'g');const matches=[...text.matchAll(r)].map(m=>({full:m[0],groups:m.slice(1),index:m.index}));
    return {_engine:'real',matches,count:matches.length};}
    catch(e){return {_engine:'real',error:e.message,matches:[]};}
  },

  'regex-replace': ({text, pattern, replacement, flags}) => {
    try{const r=new RegExp(pattern||'',flags||'g');const result=(text||'').replace(r,replacement||'');
    return {_engine:'real',result,replacements:(text||'').split(r).length-1};}
    catch(e){return {_engine:'real',error:e.message,result:text||''};}
  },

  'fuzzy-match': ({query, candidates, threshold}) => {
    const q=(query||'').toLowerCase();const cs=candidates||[];const t=threshold||0.3;
    function similarity(a,b){if(!a||!b)return 0;const longer=a.length>b.length?a:b;const shorter=a.length>b.length?b:a;if(!longer.length)return 1;
      let matches=0;for(let i=0;i<shorter.length;i++)if(longer.includes(shorter[i]))matches++;return matches/longer.length;}
    const scored=cs.map(c=>({candidate:c,score:Math.round(similarity(q,String(c).toLowerCase())*100)/100})).filter(c=>c.score>=t).sort((a,b)=>b.score-a.score);
    return {_engine:'real',matches:scored,count:scored.length,best:scored[0]||null,query:q};
  },

  'text-diff-words': ({text_a, text_b}) => {
    const a=(text_a||'').split(/\s+/);const b=(text_b||'').split(/\s+/);
    const added=b.filter(w=>!a.includes(w));const removed=a.filter(w=>!b.includes(w));const common=a.filter(w=>b.includes(w));
    return {_engine:'real',added,removed,common:common.length,similarity:Math.round(common.length/Math.max(a.length,b.length,1)*100)/100};
  },

  'text-ngrams': ({text, n}) => {
    const words=(text||'').split(/\s+/).filter(Boolean);const size=n||2;
    const ngrams=[];for(let i=0;i<=words.length-size;i++)ngrams.push(words.slice(i,i+size).join(' '));
    const freq={};ngrams.forEach(g=>freq[g]=(freq[g]||0)+1);
    return {_engine:'real',ngrams:[...new Set(ngrams)],frequencies:Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([g,c])=>({ngram:g,count:c})),total:ngrams.length,unique:new Set(ngrams).size};
  },

  'text-tokenize': ({text, method}) => {
    const t=text||'';const m=method||'word';
    let tokens;
    if(m==='word')tokens=t.match(/\b\w+\b/g)||[];
    else if(m==='sentence')tokens=t.match(/[^.!?]+[.!?]+/g)||[t];
    else if(m==='char')tokens=t.split('');
    else if(m==='line')tokens=t.split('\n').filter(Boolean);
    else tokens=t.split(/\s+/).filter(Boolean);
    return {_engine:'real',tokens,count:tokens.length,method:m};
  },

  // ─── DATA WRANGLING ───────────────────────────────────────
  'data-flatten-deep': ({data, prefix, separator}) => {
    const sep=separator||'.';const result={};
    function flatten(obj,pre){Object.entries(obj||{}).forEach(([k,v])=>{const key=pre?pre+sep+k:k;if(v&&typeof v==='object'&&!Array.isArray(v))flatten(v,key);else result[key]=v;});}
    flatten(data||{},prefix||'');
    return {_engine:'real',flattened:result,keys:Object.keys(result).length};
  },

  'data-unflatten': ({data, separator}) => {
    const sep=separator||'.';const result={};
    Object.entries(data||{}).forEach(([key,val])=>{const parts=key.split(sep);let cur=result;parts.forEach((p,i)=>{if(i===parts.length-1)cur[p]=val;else{if(!cur[p])cur[p]={};cur=cur[p];}});});
    return {_engine:'real',unflattened:result,keys:Object.keys(data||{}).length};
  },

  'data-pick': ({data, keys}) => {
    const d=data||{};const ks=keys||[];
    const picked=Object.fromEntries(ks.filter(k=>d[k]!==undefined).map(k=>[k,d[k]]));
    return {_engine:'real',result:picked,picked:Object.keys(picked).length,total:Object.keys(d).length};
  },

  'data-omit': ({data, keys}) => {
    const d={...(data||{})};(keys||[]).forEach(k=>delete d[k]);
    return {_engine:'real',result:d,remaining:Object.keys(d).length};
  },

  'data-rename-keys': ({data, mapping}) => {
    const d=data||{};const m=mapping||{};
    const result=Object.fromEntries(Object.entries(d).map(([k,v])=>[m[k]||k,v]));
    return {_engine:'real',result,renamed:Object.keys(m).filter(k=>d[k]!==undefined).length};
  },

  'data-deep-merge': (input) => {
    try{input=input||{};let objects=input.objects;if(typeof objects==='string'){try{objects=JSON.parse(objects);}catch(e){}}if(!Array.isArray(objects))objects=[];
    function merge(target,source){Object.entries(source).forEach(([k,v])=>{if(v&&typeof v==='object'&&!Array.isArray(v)&&target[k]&&typeof target[k]==='object')merge(target[k],v);else target[k]=v;});return target;}
    const result=objects.reduce((acc,obj)=>merge(acc,JSON.parse(JSON.stringify(obj))),{});
    return {_engine:'real',merged:result,sources:objects.length};}
    catch(e){return {_engine:'real',merged:{},sources:0,error:e.message};}
  },

  'data-diff': (input) => {
    try{input=input||{};let before=input.before,after=input.after;
    if(typeof before==='string'){try{before=JSON.parse(before);}catch(e){}}if(typeof after==='string'){try{after=JSON.parse(after);}catch(e){}}
    const b=before&&typeof before==='object'?before:{};const a=after&&typeof after==='object'?after:{};
    const allKeys=[...new Set([...Object.keys(b),...Object.keys(a)])];
    const added=allKeys.filter(k=>b[k]===undefined&&a[k]!==undefined).map(k=>({key:k,value:a[k]}));
    const removed=allKeys.filter(k=>b[k]!==undefined&&a[k]===undefined).map(k=>({key:k,value:b[k]}));
    const changed=allKeys.filter(k=>b[k]!==undefined&&a[k]!==undefined&&JSON.stringify(b[k])!==JSON.stringify(a[k])).map(k=>({key:k,before:b[k],after:a[k]}));
    return {_engine:'real',added,removed,changed,unchanged:allKeys.length-added.length-removed.length-changed.length};}
    catch(e){return {_engine:'real',added:[],removed:[],changed:[],unchanged:0,error:e.message};}
  },

  'data-coerce-types': ({data, schema}) => {
    const d=data||{};const s=schema||{};
    const result={};
    Object.entries(d).forEach(([k,v])=>{const type=s[k]||'string';
      if(type==='number')result[k]=Number(v)||0;
      else if(type==='boolean')result[k]=v==='true'||v===true||v===1;
      else if(type==='string')result[k]=String(v==null?'':v);
      else if(type==='date')result[k]=new Date(v).toISOString();
      else if(type==='array')result[k]=Array.isArray(v)?v:v?[v]:[];
      else result[k]=v;
    });
    return {_engine:'real',result,coerced:Object.keys(s).length};
  },

  'data-clean': ({records, rules}) => {
    const rs=records||[];const ru=rules||{trim:true,remove_nulls:true,lowercase_keys:false};
    const cleaned=rs.map(r=>{const out={};Object.entries(r).forEach(([k,v])=>{
      let key=ru.lowercase_keys?k.toLowerCase():k;
      let val=v;
      if(ru.remove_nulls&&(val===null||val===undefined||val===''))return;
      if(ru.trim&&typeof val==='string')val=val.trim();
      out[key]=val;
    });return out;});
    return {_engine:'real',records:cleaned,count:cleaned.length,rules_applied:Object.keys(ru).filter(k=>ru[k]).length};
  },

  'data-frequency': ({data, key}) => {
    const d=data||[];
    const freq={};d.forEach(item=>{const val=key?item[key]:item;const k=String(val);freq[k]=(freq[k]||0)+1;});
    const sorted=Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([value,count])=>({value,count,percentage:Math.round(count/d.length*10000)/100}));
    return {_engine:'real',distribution:sorted,unique:sorted.length,total:d.length,mode:sorted[0]?.value};
  },

  'data-window-functions': ({data, partition_by, order_by, function: fn}) => {
    const d=data||[];const pb=partition_by;const ob=order_by;const f=fn||'row_number';
    let sorted=ob?[...d].sort((a,b)=>String(a[ob]).localeCompare(String(b[ob]))):d;
    const partitions={};
    sorted.forEach((row,i)=>{const pk=pb?row[pb]:'all';if(!partitions[pk])partitions[pk]=[];partitions[pk].push({...row,_idx:i});});
    const result=[];
    Object.values(partitions).forEach(rows=>{rows.forEach((row,i)=>{
      const out={...row};delete out._idx;
      if(f==='row_number')out._row_number=i+1;
      if(f==='rank')out._rank=i+1;
      if(f==='running_total'&&ob)out._running_total=rows.slice(0,i+1).reduce((s,r)=>s+(Number(r[ob])||0),0);
      result.push(out);
    });});
    return {_engine:'real',result,partitions:Object.keys(partitions).length,function:f};
  },

  // ─── ENCODING / FORMAT ────────────────────────────────────
  'encode-base32': ({text}) => {
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';const bytes=Buffer.from(text||'');
    let bits='';bytes.forEach(b=>bits+=b.toString(2).padStart(8,'0'));
    while(bits.length%5)bits+='0';
    let encoded='';for(let i=0;i<bits.length;i+=5)encoded+=alphabet[parseInt(bits.slice(i,i+5),2)];
    while(encoded.length%8)encoded+='=';
    return {_engine:'real',encoded,original_length:(text||'').length};
  },

  'encode-hex': ({text, decode}) => {
    if(decode)return {_engine:'real',decoded:Buffer.from(text||'','hex').toString('utf8')};
    return {_engine:'real',encoded:Buffer.from(text||'').toString('hex')};
  },

  'encode-rot13': ({text}) => {
    const t=(text||'').replace(/[a-zA-Z]/g,c=>{const base=c<='Z'?65:97;return String.fromCharCode((c.charCodeAt(0)-base+13)%26+base);});
    return {_engine:'real',result:t};
  },

  'encode-morse': ({text, decode}) => {
    const map={'A':'.-','B':'-...','C':'-.-.','D':'-..','E':'.','F':'..-.','G':'--.','H':'....','I':'..','J':'.---','K':'-.-','L':'.-..','M':'--','N':'-.','O':'---','P':'.--.','Q':'--.-','R':'.-.','S':'...','T':'-','U':'..-','V':'...-','W':'.--','X':'-..-','Y':'-.--','Z':'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',' ':'/'};
    if(decode){const rev=Object.fromEntries(Object.entries(map).map(([k,v])=>[v,k]));return {_engine:'real',decoded:(text||'').split(' ').map(c=>rev[c]||'?').join('')};}
    return {_engine:'real',encoded:(text||'').toUpperCase().split('').map(c=>map[c]||'').filter(Boolean).join(' ')};
  },

  'format-table': ({headers, rows, format}) => {
    const h=headers||[];const r=rows||[];const f=format||'markdown';
    if(f==='markdown'){const hdr='| '+h.join(' | ')+' |';const sep='| '+h.map(()=>'---').join(' | ')+' |';const body=r.map(row=>'| '+row.join(' | ')+' |').join('\n');return {_engine:'real',table:hdr+'\n'+sep+'\n'+body};}
    if(f==='csv')return {_engine:'real',table:h.join(',')+'\n'+r.map(row=>row.join(',')).join('\n')};
    if(f==='tsv')return {_engine:'real',table:h.join('\t')+'\n'+r.map(row=>row.join('\t')).join('\n')};
    return {_engine:'real',table:JSON.stringify({headers:h,rows:r})};
  },

  'format-list': ({items, style, indent}) => {
    const is=items||[];const s=style||'bullet';const ind=indent||0;
    const prefix='  '.repeat(ind);
    const formatted=is.map((item,i)=>{
      if(s==='bullet')return prefix+'- '+item;
      if(s==='number')return prefix+(i+1)+'. '+item;
      if(s==='letter')return prefix+String.fromCharCode(97+i)+') '+item;
      if(s==='checkbox')return prefix+'- [ ] '+item;
      return prefix+item;
    }).join('\n');
    return {_engine:'real',list:formatted,count:is.length,style:s};
  },

  'format-tree': ({data, indent}) => {
    const ind=indent||2;
    function render(obj,depth){let out='';Object.entries(obj||{}).forEach(([k,v],i,arr)=>{
      const prefix=i===arr.length-1?'\u2514':'\u251C';const line=' '.repeat(depth*ind)+(depth>0?prefix+'\u2500 ':'')+k;
      if(v&&typeof v==='object'&&!Array.isArray(v)){out+=line+'\n'+render(v,depth+1);}
      else out+=line+': '+JSON.stringify(v)+'\n';
    });return out;}
    return {_engine:'real',tree:render(data||{},0).trim()};
  },

  // ─── TYPE CHECKING ────────────────────────────────────────
  'type-check': ({value}) => {
    const v=value;
    const type=v===null?'null':Array.isArray(v)?'array':typeof v;
    const checks={is_string:type==='string',is_number:type==='number',is_boolean:type==='boolean',is_array:type==='array',is_object:type==='object'&&v!==null,is_null:v===null,is_undefined:v===undefined,is_empty:v===''||v===null||v===undefined||(Array.isArray(v)&&v.length===0)||(type==='object'&&v!==null&&Object.keys(v).length===0),is_numeric:!isNaN(v)&&v!==null&&v!==''&&v!==true&&v!==false};
    return {_engine:'real',type,...checks};
  },

  'type-convert': ({value, to}) => {
    const v=value;const t=to||'string';
    let result;
    if(t==='string')result=v===null||v===undefined?'':String(v);
    else if(t==='number')result=Number(v)||0;
    else if(t==='boolean')result=!!v&&v!=='false'&&v!=='0'&&v!=='null';
    else if(t==='array')result=Array.isArray(v)?v:v?[v]:[];
    else if(t==='object')try{result=typeof v==='string'?JSON.parse(v):v;}catch(e){result={value:v};}
    else result=v;
    return {_engine:'real',result,from:typeof value,to:t};
  },

  // ─── MATH POWER TOOLS ────────────────────────────────────
  'math-matrix-multiply': ({a, b}) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return { _engine: 'real', error: 'Inputs a and b must be 2D arrays' };
    const A=a;const B=b;
    if (!A.length || !Array.isArray(A[0]) || !B.length || !Array.isArray(B[0])) return { _engine: 'real', error: 'Inputs must be 2D arrays' };
    const rows=A.length;const cols=B[0].length;const inner=B.length;
    const result=Array.from({length:rows},()=>Array(cols).fill(0));
    for(let i=0;i<rows;i++)for(let j=0;j<cols;j++)for(let k=0;k<inner;k++)result[i][j]+=A[i][k]*B[k][j];
    return {_engine:'real',result,dimensions:{rows,cols}};
  },

  'math-linear-regression': ({x, y}) => {
    const xs=x||[];const ys=y||[];const n=Math.min(xs.length,ys.length);
    if(n<2)return {_engine:'real',error:'Need at least 2 points'};
    const sumX=xs.reduce((a,b)=>a+b,0);const sumY=ys.reduce((a,b)=>a+b,0);
    const sumXY=xs.reduce((a,xi,i)=>a+xi*ys[i],0);const sumX2=xs.reduce((a,xi)=>a+xi*xi,0);
    const slope=Math.round((n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX)*10000)/10000;
    const intercept=Math.round((sumY-slope*sumX)/n*10000)/10000;
    const r2_num=xs.reduce((a,xi,i)=>a+(slope*xi+intercept-sumY/n)**2,0);
    const r2_den=ys.reduce((a,yi)=>a+(yi-sumY/n)**2,0);
    return {_engine:'real',slope,intercept,r_squared:Math.round(r2_num/Math.max(r2_den,0.001)*10000)/10000,equation:`y = ${slope}x + ${intercept}`,n};
  },

  'math-moving-average': ({data, window}) => {
    const d=data||[];const w=window||3;
    const result=d.map((_,i)=>{if(i<w-1)return null;const slice=d.slice(i-w+1,i+1);return Math.round(slice.reduce((a,b)=>a+b,0)/w*100)/100;});
    return {_engine:'real',result:result.filter(v=>v!==null),window:w,points:d.length};
  },

  'math-normalize': ({data, method}) => {
    const d=data||[];const m=method||'minmax';
    if(!d.length)return {_engine:'real',result:[],method:m};
    if(m==='minmax'){const min=Math.min(...d);const max=Math.max(...d);const range=max-min||1;return {_engine:'real',result:d.map(v=>Math.round((v-min)/range*10000)/10000),min,max,method:m};}
    const mean=d.reduce((a,b)=>a+b,0)/d.length;const std=Math.sqrt(d.reduce((a,b)=>a+(b-mean)**2,0)/d.length)||1;
    return {_engine:'real',result:d.map(v=>Math.round((v-mean)/std*10000)/10000),mean:Math.round(mean*100)/100,std:Math.round(std*100)/100,method:'zscore'};
  },

  'math-interpolate': ({x, points}) => {
    const ps=points||[[0,0],[1,1],[2,4]];const xv=x||1.5;
    // Linear interpolation between nearest points
    const sorted=[...ps].sort((a,b)=>a[0]-b[0]);
    let lo=sorted[0],hi=sorted[sorted.length-1];
    for(let i=0;i<sorted.length-1;i++){if(sorted[i][0]<=xv&&sorted[i+1][0]>=xv){lo=sorted[i];hi=sorted[i+1];break;}}
    const t=(xv-lo[0])/(hi[0]-lo[0]||1);
    const y=Math.round((lo[1]+t*(hi[1]-lo[1]))*10000)/10000;
    return {_engine:'real',x:xv,y,method:'linear',points:ps.length};
  },

  'math-probability': ({event, total, complement}) => {
    const e=event||1;const t=total||6;
    const p=Math.round(e/t*10000)/10000;
    return {_engine:'real',probability:p,odds:Math.round(e/(t-e)*100)/100+':1',percentage:Math.round(p*10000)/100,complement:Math.round((1-p)*10000)/10000};
  },

  'math-combination': ({n, r}) => {
    const N=n||10;const R=r||3;
    function factorial(x){let f=1;for(let i=2;i<=x;i++)f*=i;return f;}
    const c=Math.round(factorial(N)/(factorial(R)*factorial(N-R)));
    const p=Math.round(factorial(N)/factorial(N-R));
    return {_engine:'real',combination:c,permutation:p,n:N,r:R};
  },

  // ─── HASH & ID GENERATION ────────────────────────────────
  'id-nanoid': ({length, alphabet}) => {
    const l=length||21;const a=alphabet||'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const bytes=crypto.randomBytes(l);
    const id=Array.from(bytes).map(b=>a[b%a.length]).join('');
    return {_engine:'real',id,length:l};
  },

  'id-ulid': () => {
    const t=Date.now().toString(36).padStart(10,'0');
    const r=crypto.randomBytes(10).toString('hex').slice(0,16);
    return {_engine:'real',ulid:(t+r).toUpperCase().slice(0,26),timestamp:Date.now()};
  },

  'id-snowflake': ({machine_id}) => {
    const mid=machine_id||1;const ts=Date.now()-1609459200000;
    const id=BigInt(ts)<<22n|BigInt(mid)<<12n|BigInt(ts%4096);
    return {_engine:'real',id:id.toString(),timestamp:Date.now(),machine_id:mid};
  },

  'hash-hmac': ({data, secret, algorithm}) => {
    const d=typeof data==='string'?data:JSON.stringify(data||'');
    const s=secret||'default-secret';const a=algorithm||'sha256';
    const hmac=crypto.createHmac(a,s).update(d).digest('hex');
    return {_engine:'real',hmac,algorithm:a,input_length:d.length};
  },

  'string-camel-case': ({text}) => {
    const t=text||'';
    const camel=t.replace(/[-_\s]+(.)?/g,(_,c)=>c?c.toUpperCase():'').replace(/^[A-Z]/,c=>c.toLowerCase());
    const snake=t.replace(/([a-z])([A-Z])/g,'$1_$2').replace(/[-\s]+/g,'_').toLowerCase();
    const kebab=t.replace(/([a-z])([A-Z])/g,'$1-$2').replace(/[_\s]+/g,'-').toLowerCase();
    const pascal=camel.replace(/^[a-z]/,c=>c.toUpperCase());
    return {_engine:'real',camel,snake,kebab,pascal,original:t};
  },

  'data-group-by': ({data, key}) => {
    const d=data||[];const k=key||'id';
    const groups={};d.forEach(item=>{const gk=String(item[k]||'unknown');if(!groups[gk])groups[gk]=[];groups[gk].push(item);});
    const summary=Object.entries(groups).map(([g,items])=>({group:g,count:items.length}));
    return {_engine:'real',groups,summary,group_count:Object.keys(groups).length,total:d.length};
  },

  'math-percentile': ({data, percentiles}) => {
    const d=[...(data||[])].sort((a,b)=>a-b);const ps=percentiles||[25,50,75,90,95,99];
    if(!d.length)return {_engine:'real',result:{},count:0};
    const result={};ps.forEach(p=>{const idx=(p/100)*(d.length-1);const lo=Math.floor(idx);const hi=Math.ceil(idx);const frac=idx-lo;result['p'+p]=Math.round((d[lo]*(1-frac)+(d[hi]||d[lo])*frac)*10000)/10000;});
    return {_engine:'real',result,count:d.length,min:d[0],max:d[d.length-1]};
  },

  'hash-checksum': ({data, algorithm}) => {
    const d=typeof data==='string'?data:JSON.stringify(data||'');
    const a=algorithm||'md5';
    const hash=crypto.createHash(a).update(d).digest('hex');
    return {_engine:'real',checksum:hash,algorithm:a,input_length:d.length};
  },
};

module.exports = handlers;
