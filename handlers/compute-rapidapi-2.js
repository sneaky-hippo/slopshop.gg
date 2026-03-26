'use strict';

const handlers = {
  // ─── HTTP TRANSFORMATION ──────────────────────────────────
  'http-header-parse': ({raw}) => {
    const lines=(raw||'').split(/\r?\n/).filter(Boolean);
    const headers={};
    lines.forEach(l=>{const [k,...v]=l.split(':');if(k)headers[k.trim().toLowerCase()]=v.join(':').trim();});
    return {_engine:'real', headers, count:Object.keys(headers).length};
  },

  'http-header-build': ({headers}) => {
    const h=headers||{};
    const raw=Object.entries(h).map(([k,v])=>k+': '+v).join('\r\n');
    return {_engine:'real', raw, count:Object.keys(h).length};
  },

  'http-querystring-build': ({params}) => {
    const p=params||{};
    const qs=Object.entries(p).map(([k,v])=>Array.isArray(v)?v.map(i=>encodeURIComponent(k)+'='+encodeURIComponent(i)).join('&'):encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
    return {_engine:'real', querystring:qs, params:Object.keys(p).length};
  },

  'http-querystring-parse': ({querystring}) => {
    const qs=(querystring||'').replace(/^\?/,'');
    const params={};
    qs.split('&').filter(Boolean).forEach(p=>{const [k,v]=p.split('=');const dk=decodeURIComponent(k);const dv=decodeURIComponent(v||'');if(params[dk]){if(!Array.isArray(params[dk]))params[dk]=[params[dk]];params[dk].push(dv);}else params[dk]=dv;});
    return {_engine:'real', params, count:Object.keys(params).length};
  },

  'http-cookie-parse': ({cookie_string}) => {
    const cs=cookie_string||'';
    const cookies={};
    cs.split(';').map(s=>s.trim()).filter(Boolean).forEach(c=>{const [k,...v]=c.split('=');if(k)cookies[k.trim()]=v.join('=').trim();});
    return {_engine:'real', cookies, count:Object.keys(cookies).length};
  },

  'http-cookie-build': ({name, value, domain, path, expires, secure, httponly, samesite}) => {
    let cookie=(name||'key')+'='+(value||'val');
    if(domain)cookie+='; Domain='+domain;
    if(path)cookie+='; Path='+path;
    if(expires)cookie+='; Expires='+expires;
    if(secure)cookie+='; Secure';
    if(httponly)cookie+='; HttpOnly';
    if(samesite)cookie+='; SameSite='+samesite;
    return {_engine:'real', cookie};
  },

  'http-content-negotiate': ({accept, available}) => {
    const avail=available||['application/json','text/html','text/plain'];
    const prefs=(accept||'*/*').split(',').map(s=>{const [type,...params]=s.trim().split(';');const q=params.find(p=>p.trim().startsWith('q='));return {type:type.trim(),q:q?parseFloat(q.split('=')[1]):1};}).sort((a,b)=>b.q-a.q);
    const match=prefs.find(p=>avail.includes(p.type)||p.type==='*/*');
    return {_engine:'real', selected:match?match.type==='*/*'?avail[0]:match.type:null, preferences:prefs, available:avail};
  },

  'http-basic-auth-encode': ({username, password}) => {
    const encoded=Buffer.from((username||'')+':'+(password||'')).toString('base64');
    return {_engine:'real', header:'Basic '+encoded, encoded, username:username||'', decoded:username+':'+password};
  },

  'http-bearer-token-extract': ({authorization}) => {
    const auth=authorization||'';
    const match=auth.match(/^Bearer\s+(\S+)/i);
    return {_engine:'real', valid:!!match, token:match?match[1]:null, type:'bearer'};
  },

  // ─── DATA ENRICHMENT & LOOKUP ─────────────────────────────
  'geo-country-lookup': ({code}) => {
    const countries={US:{name:'United States',capital:'Washington, D.C.',currency:'USD',phone:'+1',continent:'North America',flag:'\u{1F1FA}\u{1F1F8}'},GB:{name:'United Kingdom',capital:'London',currency:'GBP',phone:'+44',continent:'Europe',flag:'\u{1F1EC}\u{1F1E7}'},DE:{name:'Germany',capital:'Berlin',currency:'EUR',phone:'+49',continent:'Europe',flag:'\u{1F1E9}\u{1F1EA}'},FR:{name:'France',capital:'Paris',currency:'EUR',phone:'+33',continent:'Europe',flag:'\u{1F1EB}\u{1F1F7}'},JP:{name:'Japan',capital:'Tokyo',currency:'JPY',phone:'+81',continent:'Asia',flag:'\u{1F1EF}\u{1F1F5}'},CN:{name:'China',capital:'Beijing',currency:'CNY',phone:'+86',continent:'Asia',flag:'\u{1F1E8}\u{1F1F3}'},IN:{name:'India',capital:'New Delhi',currency:'INR',phone:'+91',continent:'Asia',flag:'\u{1F1EE}\u{1F1F3}'},BR:{name:'Brazil',capital:'Bras\u00edlia',currency:'BRL',phone:'+55',continent:'South America',flag:'\u{1F1E7}\u{1F1F7}'},AU:{name:'Australia',capital:'Canberra',currency:'AUD',phone:'+61',continent:'Oceania',flag:'\u{1F1E6}\u{1F1FA}'},CA:{name:'Canada',capital:'Ottawa',currency:'CAD',phone:'+1',continent:'North America',flag:'\u{1F1E8}\u{1F1E6}'},KR:{name:'South Korea',capital:'Seoul',currency:'KRW',phone:'+82',continent:'Asia',flag:'\u{1F1F0}\u{1F1F7}'},MX:{name:'Mexico',capital:'Mexico City',currency:'MXN',phone:'+52',continent:'North America',flag:'\u{1F1F2}\u{1F1FD}'},RU:{name:'Russia',capital:'Moscow',currency:'RUB',phone:'+7',continent:'Europe/Asia',flag:'\u{1F1F7}\u{1F1FA}'},SG:{name:'Singapore',capital:'Singapore',currency:'SGD',phone:'+65',continent:'Asia',flag:'\u{1F1F8}\u{1F1EC}'},IL:{name:'Israel',capital:'Jerusalem',currency:'ILS',phone:'+972',continent:'Asia',flag:'\u{1F1EE}\u{1F1F1}'},AE:{name:'UAE',capital:'Abu Dhabi',currency:'AED',phone:'+971',continent:'Asia',flag:'\u{1F1E6}\u{1F1EA}'}};
    const c=(code||'US').toUpperCase();
    const info=countries[c];
    return {_engine:'real', found:!!info, code:c, ...(info||{name:'Unknown',capital:'Unknown',currency:'Unknown',phone:'Unknown',continent:'Unknown',flag:'\u{1F3F3}\u{FE0F}'})};
  },

  'geo-timezone-lookup': ({timezone}) => {
    const zones={'America/New_York':{utc:-5,dst:true},'America/Chicago':{utc:-6,dst:true},'America/Denver':{utc:-7,dst:true},'America/Los_Angeles':{utc:-8,dst:true},'Europe/London':{utc:0,dst:true},'Europe/Paris':{utc:1,dst:true},'Europe/Berlin':{utc:1,dst:true},'Asia/Tokyo':{utc:9,dst:false},'Asia/Shanghai':{utc:8,dst:false},'Asia/Singapore':{utc:8,dst:false},'Australia/Sydney':{utc:11,dst:true},'Pacific/Auckland':{utc:12,dst:true},'Asia/Dubai':{utc:4,dst:false},'Asia/Kolkata':{utc:5.5,dst:false}};
    const tz=timezone||'America/New_York';
    const info=zones[tz];
    const now=new Date();
    return {_engine:'real', timezone:tz, found:!!info, utc_offset:info?.utc||0, has_dst:info?.dst||false, current_time:now.toISOString(), abbreviation:tz.split('/').pop().replace(/_/g,' ')};
  },

  'geo-coordinates-distance': ({lat1, lon1, lat2, lon2, unit}) => {
    const R=unit==='mi'?3959:6371;
    const dLat=(lat2-lat1)*Math.PI/180;
    const dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    const d=R*c;
    return {_engine:'real', distance:Math.round(d*100)/100, unit:unit||'km', from:{lat:lat1,lon:lon1}, to:{lat:lat2,lon:lon2}, formula:'haversine'};
  },

  'geo-coordinates-to-geohash': ({lat, lon, precision}) => {
    const p=precision||6;
    const base32='0123456789bcdefghjkmnpqrstuvwxyz';
    let minLat=-90,maxLat=90,minLon=-180,maxLon=180;
    let hash='';let bit=0;let ch=0;let isLon=true;
    while(hash.length<p){
      if(isLon){const mid=(minLon+maxLon)/2;if(lon>mid){ch|=1<<(4-bit);minLon=mid;}else maxLon=mid;}
      else{const mid=(minLat+maxLat)/2;if(lat>mid){ch|=1<<(4-bit);minLat=mid;}else maxLat=mid;}
      isLon=!isLon;bit++;
      if(bit===5){hash+=base32[ch];bit=0;ch=0;}
    }
    return {_engine:'real', geohash:hash, lat, lon, precision:p};
  },

  'geo-bounding-box': ({lat, lon, radius_km}) => {
    const r=radius_km||10;const R=6371;
    const dLat=r/R*180/Math.PI;
    const dLon=r/(R*Math.cos(lat*Math.PI/180))*180/Math.PI;
    return {_engine:'real', center:{lat,lon}, radius_km:r, bounds:{min_lat:Math.round((lat-dLat)*10000)/10000, max_lat:Math.round((lat+dLat)*10000)/10000, min_lon:Math.round((lon-dLon)*10000)/10000, max_lon:Math.round((lon+dLon)*10000)/10000}};
  },

  'currency-info-lookup': ({code}) => {
    const currencies={USD:{name:'US Dollar',symbol:'$',decimals:2,countries:['US','PR','GU']},EUR:{name:'Euro',symbol:'\u20AC',decimals:2,countries:['DE','FR','IT','ES','NL']},GBP:{name:'British Pound',symbol:'\u00A3',decimals:2,countries:['GB']},JPY:{name:'Japanese Yen',symbol:'\u00A5',decimals:0,countries:['JP']},CNY:{name:'Chinese Yuan',symbol:'\u00A5',decimals:2,countries:['CN']},INR:{name:'Indian Rupee',symbol:'\u20B9',decimals:2,countries:['IN']},BRL:{name:'Brazilian Real',symbol:'R$',decimals:2,countries:['BR']},CAD:{name:'Canadian Dollar',symbol:'CA$',decimals:2,countries:['CA']},AUD:{name:'Australian Dollar',symbol:'A$',decimals:2,countries:['AU']},KRW:{name:'South Korean Won',symbol:'\u20A9',decimals:0,countries:['KR']},CHF:{name:'Swiss Franc',symbol:'CHF',decimals:2,countries:['CH']},SGD:{name:'Singapore Dollar',symbol:'S$',decimals:2,countries:['SG']},BTC:{name:'Bitcoin',symbol:'\u20BF',decimals:8,countries:[]}};
    const c=(code||'USD').toUpperCase();
    const info=currencies[c];
    return {_engine:'real', found:!!info, code:c, ...(info||{name:'Unknown',symbol:'?',decimals:2,countries:[]})};
  },

  'locale-info-lookup': ({locale}) => {
    const locales={'en-US':{date_format:'MM/DD/YYYY',number_decimal:'.',number_thousands:',',first_day:'sunday',currency:'USD'},'en-GB':{date_format:'DD/MM/YYYY',number_decimal:'.',number_thousands:',',first_day:'monday',currency:'GBP'},'de-DE':{date_format:'DD.MM.YYYY',number_decimal:',',number_thousands:'.',first_day:'monday',currency:'EUR'},'ja-JP':{date_format:'YYYY/MM/DD',number_decimal:'.',number_thousands:',',first_day:'sunday',currency:'JPY'},'zh-CN':{date_format:'YYYY-MM-DD',number_decimal:'.',number_thousands:',',first_day:'monday',currency:'CNY'},'fr-FR':{date_format:'DD/MM/YYYY',number_decimal:',',number_thousands:' ',first_day:'monday',currency:'EUR'},'pt-BR':{date_format:'DD/MM/YYYY',number_decimal:',',number_thousands:'.',first_day:'sunday',currency:'BRL'}};
    const l=locale||'en-US';
    return {_engine:'real', locale:l, found:!!locales[l], ...(locales[l]||locales['en-US'])};
  },

  'language-info-lookup': ({code}) => {
    const langs={en:{name:'English',native:'English',script:'Latin',direction:'ltr'},es:{name:'Spanish',native:'Espa\u00F1ol',script:'Latin',direction:'ltr'},fr:{name:'French',native:'Fran\u00E7ais',script:'Latin',direction:'ltr'},de:{name:'German',native:'Deutsch',script:'Latin',direction:'ltr'},ja:{name:'Japanese',native:'\u65E5\u672C\u8A9E',script:'CJK',direction:'ltr'},zh:{name:'Chinese',native:'\u4E2D\u6587',script:'CJK',direction:'ltr'},ar:{name:'Arabic',native:'\u0627\u0644\u0639\u0631\u0628\u064A\u0629',script:'Arabic',direction:'rtl'},he:{name:'Hebrew',native:'\u05E2\u05D1\u05E8\u05D9\u05EA',script:'Hebrew',direction:'rtl'},ko:{name:'Korean',native:'\uD55C\uAD6D\uC5B4',script:'Hangul',direction:'ltr'},hi:{name:'Hindi',native:'\u0939\u093F\u0928\u094D\u0926\u0940',script:'Devanagari',direction:'ltr'},ru:{name:'Russian',native:'\u0420\u0443\u0441\u0441\u043A\u0438\u0439',script:'Cyrillic',direction:'ltr'},pt:{name:'Portuguese',native:'Portugu\u00EAs',script:'Latin',direction:'ltr'}};
    const c=(code||'en').toLowerCase();
    return {_engine:'real', code:c, found:!!langs[c], ...(langs[c]||{name:'Unknown',native:'Unknown',script:'Unknown',direction:'ltr'})};
  },

  'http-status-info': ({code}) => {
    const codes={200:{name:'OK',meaning:'Request succeeded',retry:false},201:{name:'Created',meaning:'Resource created',retry:false},204:{name:'No Content',meaning:'Success, no body',retry:false},301:{name:'Moved Permanently',meaning:'Resource moved, update URL',retry:false},304:{name:'Not Modified',meaning:'Use cached version',retry:false},400:{name:'Bad Request',meaning:'Invalid request format',retry:false},401:{name:'Unauthorized',meaning:'Authentication required',retry:false},403:{name:'Forbidden',meaning:'Insufficient permissions',retry:false},404:{name:'Not Found',meaning:'Resource does not exist',retry:false},405:{name:'Method Not Allowed',meaning:'HTTP method not supported',retry:false},409:{name:'Conflict',meaning:'Resource state conflict',retry:false},422:{name:'Unprocessable Entity',meaning:'Valid syntax, invalid semantics',retry:false},429:{name:'Too Many Requests',meaning:'Rate limit exceeded',retry:true},500:{name:'Internal Server Error',meaning:'Server failed unexpectedly',retry:true},502:{name:'Bad Gateway',meaning:'Upstream server error',retry:true},503:{name:'Service Unavailable',meaning:'Server temporarily down',retry:true},504:{name:'Gateway Timeout',meaning:'Upstream server timeout',retry:true}};
    const c=code||200;
    const info=codes[c]||{name:'HTTP '+c,meaning:'Unknown status code',retry:c>=500};
    return {_engine:'real', code:c, ...info, category:c<200?'informational':c<300?'success':c<400?'redirection':c<500?'client_error':'server_error'};
  },

  'http-url-parse': ({url}) => {
    const u=url||'https://example.com/path?q=1#frag';
    const m=u.match(/^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/);
    const host=m?.[4]||'';const [hostname,port]=(host.includes(':')?host.split(':'):[host,'']);
    return {_engine:'real', protocol:m?.[2]||'', host, hostname, port:port||null, pathname:m?.[5]||'/', search:m?.[7]||'', hash:m?.[9]||'', original:u};
  },

  'http-form-encode': ({fields}) => {
    const f=fields||{name:'test',value:'hello world'};
    const encoded=Object.entries(f).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
    return {_engine:'real', content_type:'application/x-www-form-urlencoded', body:encoded, field_count:Object.keys(f).length};
  },

  // ─── FINANCE ──────────────────────────────────────────────
  'finance-npv': ({cash_flows, discount_rate}) => {
    const cf=cash_flows||[-1000,300,400,500,600]; const r=discount_rate||0.1;
    const npv=cf.reduce((sum,cf,t)=>sum+cf/Math.pow(1+r,t),0);
    return {_engine:'real', npv:Math.round(npv*100)/100, cash_flows:cf, discount_rate:r, periods:cf.length, profitable:npv>0};
  },

  'finance-irr': ({cash_flows}) => {
    const cf=cash_flows||[-1000,300,400,500,600];
    let rate=0.1;
    for(let i=0;i<100;i++){
      const npv=cf.reduce((s,c,t)=>s+c/Math.pow(1+rate,t),0);
      const dnpv=cf.reduce((s,c,t)=>s-t*c/Math.pow(1+rate,t+1),0);
      if(Math.abs(dnpv)<0.0001)break;
      rate=rate-npv/dnpv;
    }
    return {_engine:'real', irr:Math.round(rate*10000)/100, cash_flows:cf, periods:cf.length};
  },

  'finance-break-even': ({fixed_costs, price_per_unit, variable_cost_per_unit}) => {
    const fc=fixed_costs||10000;const p=price_per_unit||50;const vc=variable_cost_per_unit||20;
    const units=Math.ceil(fc/(p-vc));
    const revenue=units*p;
    return {_engine:'real', break_even_units:units, break_even_revenue:revenue, contribution_margin:p-vc, fixed_costs:fc};
  },

  'finance-invoice-calc': ({items, tax_rate, discount_pct, shipping}) => {
    const is=items||[{description:'Item',quantity:1,unit_price:100}];
    const subtotal=is.reduce((s,i)=>(i.quantity||1)*(i.unit_price||0)+s,0);
    const discount=Math.round(subtotal*(discount_pct||0)/100*100)/100;
    const taxable=subtotal-discount;
    const tax=Math.round(taxable*(tax_rate||0)/100*100)/100;
    const total=Math.round((taxable+tax+(shipping||0))*100)/100;
    return {_engine:'real', items:is.length, subtotal:Math.round(subtotal*100)/100, discount, taxable, tax, shipping:shipping||0, total, currency:'USD'};
  },

  'finance-subscription-metrics': ({mrr_history, churn_count, total_subscribers}) => {
    const h=mrr_history||[1000,1200,1500]; const cc=churn_count||5; const ts=total_subscribers||100;
    const mrr=h[h.length-1]||0;
    const arr=mrr*12;
    const churnRate=Math.round(cc/Math.max(ts,1)*10000)/100;
    const ltv=churnRate>0?Math.round(mrr/ts/(churnRate/100)*100)/100:0;
    const growth=h.length>=2?Math.round((h[h.length-1]-h[h.length-2])/Math.max(h[h.length-2],1)*10000)/100:0;
    return {_engine:'real', mrr, arr, churn_rate_pct:churnRate, ltv, mom_growth_pct:growth, subscribers:ts};
  },
};

module.exports = handlers;
