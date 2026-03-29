'use strict';
const crypto = require('crypto');

const handlers = {
  // ─── COMMUNICATION TEMPLATES ──────────────────────────────
  'template-email-html': ({subject, body, cta_text, cta_url, footer}) => {
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px"><tr><td style="padding:30px"><h1 style="margin:0 0 15px;color:#1a1a2e">${subject||'Subject'}</h1><p style="color:#333;line-height:1.6">${body||'Email body content.'}</p>${cta_text?`<p style="text-align:center;margin:25px 0"><a href="${cta_url||'#'}" style="background:#ff4444;color:#fff;padding:12px 30px;border-radius:6px;text-decoration:none;font-weight:bold">${cta_text}</a></p>`:''}<p style="color:#888;font-size:12px;border-top:1px solid #eee;padding-top:15px;margin-top:20px">${footer||'Sent via Slopshop.gg'}</p></td></tr></table></td></tr></table></body></html>`;
    return {_engine:'real', html, text_length:html.length};
  },

  'template-email-plain': ({html}) => {
    let text=(html||'');
    text=text.replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n\n').replace(/<\/h[1-6]>/gi,'\n\n');
    text=text.replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi,'$2 ($1)');
    text=text.replace(/<[^>]+>/g,'');
    text=text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
    text=text.replace(/\n{3,}/g,'\n\n').trim();
    return {_engine:'real', text, chars:text.length};
  },

  'template-sms-truncate': ({message, encoding}) => {
    const m=message||''; const enc=encoding||'gsm7';
    const limit=enc==='ucs2'?70:160;
    const segmentLimit=enc==='ucs2'?67:153;
    const segments=m.length<=limit?1:Math.ceil(m.length/segmentLimit);
    const truncated=m.length>limit*3?m.slice(0,limit*3-3)+'...':m;
    return {_engine:'real', message:truncated, original_length:m.length, segments, encoding:enc, char_limit:limit, truncated:m.length>limit*3};
  },

  'template-interpolate': ({template, data}) => {
    let t=template||''; const d=data||{};
    Object.entries(d).forEach(([k,v])=>{t=t.replace(new RegExp('\\{\\{\\s*'+k+'\\s*\\}\\}','g'),String(v));});
    const unresolved=(t.match(/\{\{\s*\w+\s*\}\}/g)||[]).map(m=>m.replace(/[{}\s]/g,''));
    return {_engine:'real', rendered:t, variables_used:Object.keys(d).length, unresolved};
  },

  // ─── MEDIA UTILITIES ──────────────────────────────────────
  'media-detect-format': ({header}) => {
    const h=(header||'').slice(0,20);
    const sigs={'/9j/':'image/jpeg','iVBOR':'image/png','R0lG':'image/gif','UklG':'image/webp','PD94':'image/svg+xml','JVBER':'application/pdf','UEsD':'application/zip','H4sI':'application/gzip'};
    const detected=Object.entries(sigs).find(([sig])=>h.startsWith(sig));
    return {_engine:'real', mime:detected?detected[1]:'unknown', signature:detected?detected[0]:'none', detected:!!detected};
  },

  'media-data-uri-parse': ({uri}) => {
    const match=(uri||'').match(/^data:([^;,]+)(?:;(base64))?,(.*)$/);
    if(!match)return {_engine:'real', valid:false};
    return {_engine:'real', valid:true, mime:match[1], encoding:match[2]||'text', data:match[3], size_bytes:match[2]==='base64'?Math.round(match[3].length*0.75):match[3].length};
  },

  'media-data-uri-build': ({mime, data, encoding}) => {
    const m=mime||'text/plain'; const e=encoding||'base64';
    return {_engine:'real', uri:'data:'+m+';'+e+','+(data||''), mime:m};
  },

  'media-aspect-ratio': ({width, height, target_width, target_height}) => {
    const w=width||1920; const h=height||1080;
    function gcd(a,b){return b?gcd(b,a%b):a;}
    const g=gcd(w,h);
    const ratio=w/g+':'+h/g;
    const result={_engine:'real', width:w, height:h, ratio, decimal:Math.round(w/h*100)/100};
    if(target_width){result.resized={width:target_width,height:Math.round(target_width*h/w)};}
    if(target_height){result.resized={width:Math.round(target_height*w/h),height:target_height};}
    return result;
  },

  'media-color-accessibility': ({foreground, background}) => {
    function hexToRgb(hex){const h=(hex||'#000000').replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
    function luminance(rgb){const [r,g,b]=rgb.map(c=>{c=c/255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);});return 0.2126*r+0.7152*g+0.0722*b;}
    const fgRgb=hexToRgb(foreground);const bgRgb=hexToRgb(background);
    const l1=Math.max(luminance(fgRgb),luminance(bgRgb));const l2=Math.min(luminance(fgRgb),luminance(bgRgb));
    const ratio=Math.round((l1+0.05)/(l2+0.05)*100)/100;
    return {_engine:'real', contrast_ratio:ratio, aa_normal:ratio>=4.5, aa_large:ratio>=3, aaa_normal:ratio>=7, aaa_large:ratio>=4.5, foreground, background};
  },

  'media-svg-optimize': ({svg}) => {
    let s=svg||'';
    const original=s.length;
    s=s.replace(/<!--[\s\S]*?-->/g,'');
    s=s.replace(/\s+/g,' ');
    s=s.replace(/>\s+</g,'><');
    s=s.replace(/\s*\/>/g,'/>');
    s=s.replace(/(\.\d{4})\d+/g,'$1');
    return {_engine:'real', svg:s.trim(), original_size:original, optimized_size:s.trim().length, saved:original-s.trim().length, reduction:Math.round((1-s.trim().length/Math.max(original,1))*100)+'%'};
  },

  // ─── DEVELOPER TOOLS ──────────────────────────────────────
  'dev-env-validate': ({content}) => {
    const lines=(content||'').split('\n');
    const errors=[];const vars={};
    lines.forEach((line,i)=>{
      const trimmed=line.trim();
      if(!trimmed||trimmed.startsWith('#'))return;
      if(!trimmed.includes('=')){errors.push({line:i+1,error:'Missing = sign',text:trimmed});return;}
      const [key,...valParts]=trimmed.split('=');const val=valParts.join('=');
      if(/\s/.test(key))errors.push({line:i+1,error:'Key contains spaces',text:trimmed});
      if(!key.match(/^[A-Z_][A-Z0-9_]*$/i))errors.push({line:i+1,error:'Non-standard key format',text:key});
      vars[key]=val;
    });
    return {_engine:'real', valid:errors.length===0, errors, variables:Object.keys(vars).length, keys:Object.keys(vars)};
  },

  'dev-gitignore-check': ({path, patterns}) => {
    const p=path||'';const ps=patterns||['node_modules','*.log','.env','dist/'];
    const matches=ps.filter(pat=>{
      if(pat.endsWith('/'))return p.startsWith(pat)||p.includes('/'+pat);
      if(pat.startsWith('*'))return p.endsWith(pat.slice(1));
      if(pat.includes('*')){const regex=new RegExp('^'+pat.replace(/\./g,'\\.').replace(/\*/g,'.*')+'$');return regex.test(p);}
      return p===pat||p.startsWith(pat+'/');
    });
    return {_engine:'real', ignored:matches.length>0, path:p, matched_patterns:matches, patterns_checked:ps.length};
  },

  'dev-dependency-tree': ({package_json}) => {
    const pkg=package_json||{};
    const deps=Object.entries(pkg.dependencies||{}).map(([n,v])=>({name:n,version:v,type:'production'}));
    const devDeps=Object.entries(pkg.devDependencies||{}).map(([n,v])=>({name:n,version:v,type:'development'}));
    return {_engine:'real', dependencies:deps, dev_dependencies:devDeps, total:deps.length+devDeps.length, production:deps.length, development:devDeps.length};
  },

  'dev-license-detect': ({text}) => {
    const t=(text||'').toLowerCase();
    const licenses=[{name:'MIT',markers:['permission is hereby granted, free of charge','mit license']},{name:'Apache-2.0',markers:['apache license','version 2.0']},{name:'GPL-3.0',markers:['gnu general public license','version 3']},{name:'GPL-2.0',markers:['gnu general public license','version 2']},{name:'BSD-2-Clause',markers:['redistribution and use','2 conditions']},{name:'BSD-3-Clause',markers:['redistribution and use','3 conditions']},{name:'ISC',markers:['isc license','permission to use, copy, modify']},{name:'MPL-2.0',markers:['mozilla public license']},{name:'LGPL-3.0',markers:['lesser general public license']}];
    const detected=licenses.find(l=>l.markers.every(m=>t.includes(m)));
    return {_engine:'real', license:detected?.name||'unknown', detected:!!detected, permissive:['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC'].includes(detected?.name)};
  },

  'dev-release-version': ({current_version, commits}) => {
    const cv=current_version||'1.0.0';const cs=commits||[];
    const [major,minor,patch]=cv.split('.').map(Number);
    let bump='patch';
    cs.forEach(c=>{const msg=(c.message||c||'').toLowerCase();if(msg.includes('breaking')||msg.startsWith('feat!'))bump='major';else if(msg.startsWith('feat')&&bump!=='major')bump='minor';});
    const next=bump==='major'?(major+1)+'.0.0':bump==='minor'?major+'.'+(minor+1)+'.0':major+'.'+minor+'.'+(patch+1);
    return {_engine:'real', current:cv, next, bump, commits_analyzed:cs.length};
  },

  'dev-config-merge': ({configs}) => {
    const cs=configs||[{a:1},{a:2,b:3},{b:4,c:5}];
    const merged={};
    cs.forEach(c=>Object.assign(merged,c));
    return {_engine:'real', merged, sources:cs.length, keys:Object.keys(merged).length};
  },

  'dev-feature-flag-eval': ({flag, context}) => {
    const f=flag||{name:'new_feature',enabled:true,rules:[]};const ctx=context||{};
    if(!f.enabled)return {_engine:'real', flag:f.name, enabled:false, reason:'flag_disabled'};
    if(f.rules?.length){
      for(const rule of f.rules){
        if(rule.type==='percentage'){const ps=f.name+(ctx[Object.keys(ctx)[0]]||'');let ph=0;for(let i=0;i<ps.length;i++)ph=((ph<<5)-ph+ps.charCodeAt(i))|0;if((Math.abs(ph)%100)<rule.value)return {_engine:'real', flag:f.name, enabled:true, reason:'percentage_match'};}
        if(rule.type==='allowlist'&&rule.values?.includes(ctx[rule.field]))return {_engine:'real', flag:f.name, enabled:true, reason:'allowlist_match'};
        if(rule.type==='attribute'&&ctx[rule.field]===rule.value)return {_engine:'real', flag:f.name, enabled:true, reason:'attribute_match'};
      }
      return {_engine:'real', flag:f.name, enabled:false, reason:'no_rule_matched'};
    }
    return {_engine:'real', flag:f.name, enabled:true, reason:'default_enabled'};
  },

  'dev-migration-sql-parse': ({sql}) => {
    const s=sql||'';
    const operations=[];
    const creates=[...s.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)].map(m=>({type:'CREATE TABLE',table:m[1]}));
    const alters=[...s.matchAll(/ALTER\s+TABLE\s+(\w+)\s+(ADD|DROP|MODIFY|RENAME)\s+/gi)].map(m=>({type:'ALTER TABLE',table:m[1],action:m[2]}));
    const drops=[...s.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)].map(m=>({type:'DROP TABLE',table:m[1]}));
    const inserts=[...s.matchAll(/INSERT\s+INTO\s+(\w+)/gi)].map(m=>({type:'INSERT',table:m[1]}));
    operations.push(...creates,...alters,...drops,...inserts);
    return {_engine:'real', operations, count:operations.length, tables_created:creates.length, tables_altered:alters.length, tables_dropped:drops.length, destructive:drops.length>0};
  },

  // ─── DATA PROCESSING ──────────────────────────────────────
  'data-csv-stats': ({csv}) => {
    const lines=(csv||'').split('\n').filter(l=>l.trim());
    if(lines.length<2)return {_engine:'real', error:'Need header + data'};
    const headers=lines[0].split(',').map(h=>h.trim().replace(/"/g,''));
    const rows=lines.slice(1);
    const stats=headers.map(h=>{const col=rows.map((r,i)=>{const vals=r.split(',');return vals[headers.indexOf(h)]?.trim().replace(/"/g,'')||'';});
      const nonEmpty=col.filter(Boolean);const nums=col.map(Number).filter(n=>!isNaN(n));
      return {column:h,type:nums.length>nonEmpty.length*0.5?'numeric':'string',non_null:nonEmpty.length,nulls:col.length-nonEmpty.length,unique:new Set(col).size,min:nums.length?Math.min(...nums):null,max:nums.length?Math.max(...nums):null};
    });
    return {_engine:'real', columns:stats, rows:rows.length, column_count:headers.length};
  },

  'data-schema-infer': ({records}) => {
    const rs=records||[];
    if(!rs.length)return {_engine:'real', schema:{},error:'No records'};
    const schema={};
    rs.forEach(r=>Object.entries(r).forEach(([k,v])=>{
      if(!schema[k])schema[k]={types:new Set(),nullable:false,min:null,max:null};
      if(v===null||v===undefined){schema[k].nullable=true;return;}
      schema[k].types.add(Array.isArray(v)?'array':typeof v);
      if(typeof v==='number'){schema[k].min=schema[k].min===null?v:Math.min(schema[k].min,v);schema[k].max=schema[k].max===null?v:Math.max(schema[k].max,v);}
    }));
    const result={};
    Object.entries(schema).forEach(([k,v])=>{result[k]={type:[...v.types].join('|')||'unknown',nullable:v.nullable,min:v.min,max:v.max};});
    return {_engine:'real', schema:result, fields:Object.keys(result).length, records:rs.length};
  },

  'data-normalize-records': ({records, schema}) => {
    const rs=records||[];const s=schema||{};
    const normalized=rs.map(r=>{const out={};Object.entries(r).forEach(([k,v])=>{
      const rule=s[k]||{};
      if(rule.type==='string')out[k]=v===null||v===undefined?'':String(v).trim();
      else if(rule.type==='number')out[k]=parseFloat(v)||0;
      else if(rule.type==='boolean')out[k]=v==='true'||v===true||v===1;
      else if(rule.type==='date')out[k]=new Date(v).toISOString();
      else out[k]=v;
    });return out;});
    return {_engine:'real', records:normalized, count:normalized.length, fields_normalized:Object.keys(s).length};
  },

  'data-dedup-records': ({records, key_fields, merge_strategy}) => {
    const rs=records||[];const kf=key_fields||['id'];const ms=merge_strategy||'first';
    const seen=new Map();
    rs.forEach(r=>{const key=kf.map(k=>r[k]).join('|');
      if(!seen.has(key))seen.set(key,r);
      else if(ms==='last')seen.set(key,r);
      else if(ms==='merge')seen.set(key,{...seen.get(key),...r});
    });
    const deduped=[...seen.values()];
    return {_engine:'real', records:deduped, original:rs.length, deduped:deduped.length, removed:rs.length-deduped.length, key_fields:kf, strategy:ms};
  },

  'data-rolling-window': ({data, window_size, operation}) => {
    const d=data||[];const w=window_size||3;const op=operation||'avg';
    const result=d.map((_,i)=>{
      if(i<w-1)return {index:i,value:null};
      const window=d.slice(i-w+1,i+1);
      let val;
      if(op==='avg')val=window.reduce((a,b)=>a+b,0)/w;
      else if(op==='sum')val=window.reduce((a,b)=>a+b,0);
      else if(op==='min')val=Math.min(...window);
      else if(op==='max')val=Math.max(...window);
      return {index:i,value:Math.round(val*100)/100};
    });
    return {_engine:'real', result, window_size:w, operation:op, data_points:d.length};
  },

  'data-correlation-matrix': ({columns}) => {
    const cols=columns||{};
    const keys=Object.keys(cols);
    function pearson(a,b){const n=Math.min(a.length,b.length);const mA=a.reduce((s,v)=>s+v,0)/n;const mB=b.reduce((s,v)=>s+v,0)/n;
      let num=0,denA=0,denB=0;for(let i=0;i<n;i++){num+=(a[i]-mA)*(b[i]-mB);denA+=(a[i]-mA)**2;denB+=(b[i]-mB)**2;}
      return denA&&denB?Math.round(num/Math.sqrt(denA*denB)*1000)/1000:0;}
    const matrix={};
    keys.forEach(a=>{matrix[a]={};keys.forEach(b=>{matrix[a][b]=pearson(cols[a]||[],cols[b]||[]);});});
    return {_engine:'real', matrix, variables:keys.length};
  },

  'data-sql-to-json-filter': ({data, where}) => {
    const d=data||[];const w=where||'';
    if(!w)return {_engine:'real', filtered:d, count:d.length};
    const match=w.match(/(\w+)\s*(=|!=|>|<|>=|<=|LIKE|IN)\s*['"]?([^'"]+)['"]?/i);
    if(!match)return {_engine:'real', filtered:d, count:d.length, error:'Could not parse WHERE'};
    const [_,field,op,val]=match;
    const filtered=d.filter(r=>{const v=r[field];const cv=isNaN(val)?val:Number(val);
      if(op==='='||op==='==')return v==cv;if(op==='!=')return v!=cv;
      if(op==='>')return v>cv;if(op==='<')return v<cv;if(op==='>=')return v>=cv;if(op==='<=')return v<=cv;
      if(op.toUpperCase()==='LIKE')return String(v).includes(String(cv).replace(/%/g,''));
      return true;
    });
    return {_engine:'real', filtered, count:filtered.length, original:d.length, where:w};
  },

  // ─── SECURITY & AUTH ──────────────────────────────────────
  'auth-api-key-generate': ({prefix, length, format}) => {
    const p=prefix||'sk'; const l=length||32; const f=format||'hex';
    let key;
    if(f==='hex')key=crypto.randomBytes(Math.ceil(l/2)).toString('hex').slice(0,l);
    else if(f==='base62'){const chars='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';const bytes=crypto.randomBytes(l);key=Array.from(bytes).map(b=>chars[b%62]).join('');}
    else key=crypto.randomUUID().replace(/-/g,'').slice(0,l);
    return {_engine:'real', key:p+'_'+key, prefix:p, length:l, format:f};
  },

  'auth-oauth-state-generate': ({extra_data}) => {
    const state=crypto.randomBytes(32).toString('hex');
    const csrf=crypto.randomBytes(16).toString('hex');
    return {_engine:'real', state, csrf_token:csrf, extra:extra_data||null, expires_in:300};
  },

  'auth-scope-check': ({required, granted}) => {
    const req=required||[];const gr=new Set(granted||[]);
    const satisfied=req.every(r=>gr.has(r)||gr.has('*'));
    const missing=req.filter(r=>!gr.has(r)&&!gr.has('*'));
    return {_engine:'real', authorized:satisfied, required:req, granted:[...gr], missing, has_wildcard:gr.has('*')};
  },

  'auth-rbac-check': ({user_roles, required_permission, role_permissions}) => {
    const ur=user_roles||[];const rp=required_permission||'';const perms=role_permissions||{admin:['*'],editor:['read','write'],viewer:['read']};
    const userPerms=new Set();
    ur.forEach(role=>(perms[role]||[]).forEach(p=>userPerms.add(p)));
    const allowed=userPerms.has('*')||userPerms.has(rp);
    return {_engine:'real', allowed, user_roles:ur, required:rp, effective_permissions:[...userPerms]};
  },

  'auth-password-policy-check': ({password, policy}) => {
    const p=password||'';const pol=policy||{min_length:8,require_upper:true,require_lower:true,require_digit:true,require_special:true};
    const checks={min_length:p.length>=pol.min_length,uppercase:!pol.require_upper||/[A-Z]/.test(p),lowercase:!pol.require_lower||/[a-z]/.test(p),digit:!pol.require_digit||/\d/.test(p),special:!pol.require_special||/[^a-zA-Z0-9]/.test(p)};
    const common=['password','123456','qwerty','abc123','letmein','admin','welcome','monkey'];
    const isCommon=common.includes(p.toLowerCase());
    return {_engine:'real', valid:Object.values(checks).every(Boolean)&&!isCommon, checks, is_common:isCommon, length:p.length, strength:p.length>=12&&Object.values(checks).every(Boolean)?'strong':p.length>=8?'medium':'weak'};
  },

  'security-csp-parse': ({header}) => {
    const h=header||'';
    const directives={};
    h.split(';').map(d=>d.trim()).filter(Boolean).forEach(d=>{const [name,...values]=d.split(/\s+/);directives[name]=values;});
    return {_engine:'real', directives, count:Object.keys(directives).length, has_default_src:!!directives['default-src'], has_script_src:!!directives['script-src']};
  },

  'security-cors-validate': ({origin, allowed_origins, allowed_methods, allowed_headers}) => {
    const o=origin||'';const ao=allowed_origins||['*'];const am=allowed_methods||['GET','POST','OPTIONS'];const ah=allowed_headers||['Content-Type','Authorization'];
    const originAllowed=ao.includes('*')||ao.includes(o);
    return {_engine:'real', origin_allowed:originAllowed, origin:o, allowed_origins:ao, allowed_methods:am, allowed_headers:ah, preflight_needed:true};
  },

  'security-header-audit': ({headers}) => {
    const h=headers||{};const hl=Object.fromEntries(Object.entries(h).map(([k,v])=>[k.toLowerCase(),v]));
    const checks=[
      {header:'strict-transport-security',present:!!hl['strict-transport-security'],importance:'critical'},
      {header:'x-content-type-options',present:!!hl['x-content-type-options'],expected:'nosniff',importance:'high'},
      {header:'x-frame-options',present:!!hl['x-frame-options'],importance:'high'},
      {header:'content-security-policy',present:!!hl['content-security-policy'],importance:'high'},
      {header:'x-xss-protection',present:!!hl['x-xss-protection'],importance:'medium'},
      {header:'referrer-policy',present:!!hl['referrer-policy'],importance:'medium'},
      {header:'permissions-policy',present:!!hl['permissions-policy'],importance:'medium'},
    ];
    const score=Math.round(checks.filter(c=>c.present).length/checks.length*100);
    return {_engine:'real', checks, score, grade:score>=90?'A':score>=70?'B':score>=50?'C':'F', missing:checks.filter(c=>!c.present).map(c=>c.header)};
  },

  'security-jwt-claims-validate': ({claims, rules}) => {
    const c=claims||{};const rs=rules||[{claim:'exp',check:'not_expired'},{claim:'iss',check:'equals',value:'slopshop'}];
    const results=rs.map(r=>{
      const val=c[r.claim];
      let passed=false;
      if(r.check==='exists')passed=val!==undefined;
      else if(r.check==='equals')passed=val===r.value;
      else if(r.check==='not_expired')passed=val&&val>Math.floor(Date.now()/1000);
      else if(r.check==='contains')passed=Array.isArray(val)&&val.includes(r.value);
      return {claim:r.claim,check:r.check,passed,actual:val};
    });
    return {_engine:'real', valid:results.every(r=>r.passed), results, failures:results.filter(r=>!r.passed).length};
  },

  'security-url-sanitize': ({url}) => {
    const u=url||'';
    let clean=u;
    const trackingParams=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid','ref','mc_cid','mc_eid'];
    try{const parsed=new URL(clean);trackingParams.forEach(p=>parsed.searchParams.delete(p));clean=parsed.toString();}catch(e){}
    const hasRedirect=/[?&](url|redirect|next|return|goto|target)=/i.test(u);
    const hasJsProtocol=/^javascript:/i.test(u.trim());
    return {_engine:'real', original:u, sanitized:clean, tracking_params_removed:u.length-clean.length>0, open_redirect_risk:hasRedirect, javascript_protocol:hasJsProtocol, safe:!hasJsProtocol&&!hasRedirect};
  },

  // ─── EXTRA HIGH-VALUE HANDLERS ────────────────────────────
  'geo-point-in-polygon': ({point, polygon}) => {
    const {lat,lon}=point||{lat:0,lon:0};const poly=polygon||[];
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
      if((yi>lon)!==(yj>lon)&&lat<(xj-xi)*(lon-yi)/(yj-yi)+xi)inside=!inside;
    }
    return {_engine:'real', inside, point:{lat,lon}, polygon_vertices:poly.length};
  },

  'finance-margin-calc': ({revenue, cost, price, margin_pct}) => {
    if(revenue!==undefined&&cost!==undefined){const margin=revenue-cost;return {_engine:'real', revenue, cost, margin, margin_pct:Math.round(margin/revenue*10000)/100};}
    if(price!==undefined&&margin_pct!==undefined){const cost2=price*(1-margin_pct/100);return {_engine:'real', price, cost:Math.round(cost2*100)/100, margin:Math.round((price-cost2)*100)/100, margin_pct};}
    return {_engine:'real', error:'Provide revenue+cost or price+margin_pct'};
  },

  'finance-tip-split': ({bill, tip_pct, people}) => {
    const b=bill||100;const t=tip_pct||18;const p=people||2;
    const tip=Math.round(b*t/100*100)/100;
    const total=Math.round((b+tip)*100)/100;
    const perPerson=Math.round(total/p*100)/100;
    return {_engine:'real', bill:b, tip, tip_pct:t, total, people:p, per_person:perPerson};
  },

  'finance-salary-to-hourly': ({annual, hours_per_week, weeks_per_year}) => {
    const a=annual||100000;const hpw=hours_per_week||40;const wpy=weeks_per_year||52;
    const hourly=Math.round(a/(hpw*wpy)*100)/100;
    const weekly=Math.round(a/wpy*100)/100;
    const monthly=Math.round(a/12*100)/100;
    const daily=Math.round(a/260*100)/100;
    return {_engine:'real', annual:a, monthly, weekly, daily, hourly, hours_per_week:hpw};
  },

  'data-pivot-table': ({records, row_key, col_key, value_key, agg}) => {
    const rs=records||[];const rk=row_key||'category';const ck=col_key||'month';const vk=value_key||'amount';const ag=agg||'sum';
    const pivot={};const colSet=new Set();
    rs.forEach(r=>{const rv=r[rk]||'_';const cv=r[ck]||'_';const val=Number(r[vk])||0;colSet.add(cv);
      if(!pivot[rv])pivot[rv]={};if(!pivot[rv][cv])pivot[rv][cv]=[];pivot[rv][cv].push(val);});
    const result={};
    Object.entries(pivot).forEach(([rk2,cols])=>{result[rk2]={};Object.entries(cols).forEach(([ck2,vals])=>{
      if(ag==='sum')result[rk2][ck2]=vals.reduce((a,b)=>a+b,0);
      else if(ag==='avg')result[rk2][ck2]=Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100;
      else if(ag==='count')result[rk2][ck2]=vals.length;
      else if(ag==='min')result[rk2][ck2]=Math.min(...vals);
      else if(ag==='max')result[rk2][ck2]=Math.max(...vals);
    });});
    return {_engine:'real', pivot:result, rows:Object.keys(result).length, columns:[...colSet], aggregation:ag};
  },

  'data-json-flatten': ({obj, delimiter}) => {
    const d=delimiter||'.';const result={};
    function flatten(cur,prefix){
      if(cur===null||cur===undefined){result[prefix]=cur;return;}
      if(Array.isArray(cur))cur.forEach((v,i)=>flatten(v,prefix?prefix+d+i:String(i)));
      else if(typeof cur==='object')Object.entries(cur).forEach(([k,v])=>flatten(v,prefix?prefix+d+k:k));
      else result[prefix]=cur;
    }
    flatten(obj||{},'');
    return {_engine:'real', flattened:result, keys:Object.keys(result).length, delimiter:d};
  },

  'data-json-unflatten': ({obj, delimiter}) => {
    const d=delimiter||'.';const o=obj||{};const result={};
    Object.entries(o).forEach(([key,val])=>{const parts=key.split(d);let cur=result;
      parts.forEach((p,i)=>{const isLast=i===parts.length-1;const nextIsNum=/^\d+$/.test(parts[i+1]);
        if(isLast){cur[p]=val;}else{if(!cur[p])cur[p]=nextIsNum?[]:{};cur=cur[p];}});});
    return {_engine:'real', unflattened:result, keys:Object.keys(o).length};
  },

  'dev-semver-compare': ({version_a, version_b}) => {
    const parse=v=>(v||'0.0.0').replace(/^v/,'').split('.').map(Number);
    const a=parse(version_a);const b=parse(version_b);
    let cmp=0;for(let i=0;i<3;i++){if(a[i]>b[i]){cmp=1;break;}if(a[i]<b[i]){cmp=-1;break;}}
    return {_engine:'real', version_a:version_a||'0.0.0', version_b:version_b||'0.0.0', comparison:cmp, a_gt_b:cmp>0, a_lt_b:cmp<0, equal:cmp===0, result:cmp>0?'greater':cmp<0?'lesser':'equal'};
  },

  'dev-cron-describe': ({expression}) => {
    const e=(expression||'* * * * *').split(/\s+/);
    const fields=['minute','hour','day_of_month','month','day_of_week'];
    const parsed={};e.forEach((v,i)=>{if(i<fields.length)parsed[fields[i]]=v;});
    const descs=[];
    if(parsed.minute==='*'&&parsed.hour==='*')descs.push('Every minute');
    else if(parsed.minute!=='*'&&parsed.hour==='*')descs.push('At minute '+parsed.minute+' of every hour');
    else if(parsed.minute!=='*'&&parsed.hour!=='*')descs.push('At '+parsed.hour+':'+parsed.minute.padStart(2,'0'));
    if(parsed.day_of_month!=='*')descs.push('on day '+parsed.day_of_month);
    if(parsed.month!=='*')descs.push('in month '+parsed.month);
    if(parsed.day_of_week!=='*'){const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];descs.push('on '+days[parseInt(parsed.day_of_week)]||parsed.day_of_week);}
    return {_engine:'real', expression:expression||'* * * * *', parsed, description:descs.join(' ')||'Every minute', fields:5, valid:e.length>=5};
  },

  'dev-regex-test': ({pattern, flags, test_strings}) => {
    const f=flags||'';const ts=test_strings||[];
    let regex;let valid=true;
    try{regex=new RegExp(pattern||'',f);}catch(err){return {_engine:'real', valid:false, error:err.message};}
    const results=ts.map(s=>{const matches=[...s.matchAll(new RegExp(pattern||'',f+'g'))].map(m=>({match:m[0],index:m.index,groups:m.groups||null}));
      return {input:s,matched:matches.length>0,matches,count:matches.length};});
    return {_engine:'real', valid, pattern:pattern||'', flags:f, results, total_matches:results.reduce((a,r)=>a+r.count,0)};
  },

  'security-hash-compare': ({hash_a, hash_b}) => {
    const a=String(hash_a||'').toLowerCase().trim();const b=String(hash_b||'').toLowerCase().trim();
    const match=a===b&&a.length>0;
    const timingSafe=a.length===b.length?crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b)):false;
    return {_engine:'real', match, timing_safe:timingSafe, length_a:a.length, length_b:b.length, same_length:a.length===b.length};
  },

  'security-entropy-check': ({input}) => {
    const s=input||'';const len=s.length;
    if(!len)return {_engine:'real', entropy:0, strength:'none', length:0};
    const freq={};for(const c of s)freq[c]=(freq[c]||0)+1;
    let entropy=0;Object.values(freq).forEach(f=>{const p=f/len;entropy-=p*Math.log2(p);});
    const totalEntropy=Math.round(entropy*len*100)/100;
    return {_engine:'real', entropy_per_char:Math.round(entropy*1000)/1000, total_entropy:totalEntropy, length:len, unique_chars:Object.keys(freq).length, strength:totalEntropy>=128?'very_strong':totalEntropy>=64?'strong':totalEntropy>=32?'moderate':'weak'};
  },

  'template-webhook-payload': ({event, data, source, timestamp}) => {
    const id=crypto.randomUUID();const ts=timestamp||new Date().toISOString();
    const payload={id,event:event||'generic.event',timestamp:ts,source:source||'slopshop',data:data||{}};
    const signature=crypto.createHmac('sha256','webhook_secret').update(JSON.stringify(payload)).digest('hex');
    return {_engine:'real', payload, signature:'sha256='+signature, headers:{'X-Webhook-ID':id,'X-Webhook-Signature':'sha256='+signature,'X-Webhook-Timestamp':ts,'Content-Type':'application/json'}};
  },

  'media-palette-extract': ({hex_colors}) => {
    const colors=(hex_colors||['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7']).map(c=>{
      const h=c.replace('#','');const r=parseInt(h.slice(0,2),16);const g=parseInt(h.slice(2,4),16);const b=parseInt(h.slice(4,6),16);
      const max=Math.max(r,g,b)/255;const min=Math.min(r,g,b)/255;const l=(max+min)/2;
      return {hex:c,rgb:{r,g,b},luminance:Math.round(l*100)/100,is_dark:l<0.5};
    });
    const avgLum=Math.round(colors.reduce((a,c)=>a+c.luminance,0)/colors.length*100)/100;
    return {_engine:'real', colors, count:colors.length, average_luminance:avgLum, theme:avgLum>0.5?'light':'dark'};
  },

  'finance-depreciation': ({cost, salvage, useful_life, method}) => {
    const c=cost||10000;const s=salvage||1000;const l=useful_life||5;const m=method||'straight_line';
    const schedule=[];
    if(m==='straight_line'){const annual=(c-s)/l;for(let y=1;y<=l;y++)schedule.push({year:y,depreciation:Math.round(annual*100)/100,book_value:Math.round((c-annual*y)*100)/100});}
    else if(m==='declining_balance'){const rate=2/l;let bv=c;for(let y=1;y<=l;y++){const dep=Math.max(Math.round(bv*rate*100)/100,y===l?bv-s:0);bv-=dep;schedule.push({year:y,depreciation:dep,book_value:Math.round(Math.max(bv,s)*100)/100});}}
    return {_engine:'real', method:m, cost:c, salvage:s, useful_life:l, schedule};
  },
};

module.exports = handlers;
