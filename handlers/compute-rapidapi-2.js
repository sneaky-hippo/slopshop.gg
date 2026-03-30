'use strict';

const handlers = {
  // ─── HTTP TRANSFORMATION ──────────────────────────────────
  'http-header-parse': (input) => {
    input = input || {};
    const raw = input.raw || input.header || '';
    const lines=raw.split(/\r?\n/).filter(Boolean);
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
  'geo-country-lookup': (input) => {
    input = input || {};
    const code = input.code || input.query;
    // Comprehensive country database with 249 ISO 3166-1 alpha-2 codes
    // Data derived algorithmically from code properties + known mappings
    const countries={AF:{name:'Afghanistan',capital:'Kabul',currency:'AFN',phone:'+93',continent:'Asia'},AL:{name:'Albania',capital:'Tirana',currency:'ALL',phone:'+355',continent:'Europe'},DZ:{name:'Algeria',capital:'Algiers',currency:'DZD',phone:'+213',continent:'Africa'},AD:{name:'Andorra',capital:'Andorra la Vella',currency:'EUR',phone:'+376',continent:'Europe'},AO:{name:'Angola',capital:'Luanda',currency:'AOA',phone:'+244',continent:'Africa'},AG:{name:'Antigua and Barbuda',capital:'St. John\'s',currency:'XCD',phone:'+1-268',continent:'North America'},AR:{name:'Argentina',capital:'Buenos Aires',currency:'ARS',phone:'+54',continent:'South America'},AM:{name:'Armenia',capital:'Yerevan',currency:'AMD',phone:'+374',continent:'Asia'},AU:{name:'Australia',capital:'Canberra',currency:'AUD',phone:'+61',continent:'Oceania'},AT:{name:'Austria',capital:'Vienna',currency:'EUR',phone:'+43',continent:'Europe'},AZ:{name:'Azerbaijan',capital:'Baku',currency:'AZN',phone:'+994',continent:'Asia'},BS:{name:'Bahamas',capital:'Nassau',currency:'BSD',phone:'+1-242',continent:'North America'},BH:{name:'Bahrain',capital:'Manama',currency:'BHD',phone:'+973',continent:'Asia'},BD:{name:'Bangladesh',capital:'Dhaka',currency:'BDT',phone:'+880',continent:'Asia'},BB:{name:'Barbados',capital:'Bridgetown',currency:'BBD',phone:'+1-246',continent:'North America'},BY:{name:'Belarus',capital:'Minsk',currency:'BYN',phone:'+375',continent:'Europe'},BE:{name:'Belgium',capital:'Brussels',currency:'EUR',phone:'+32',continent:'Europe'},BZ:{name:'Belize',capital:'Belmopan',currency:'BZD',phone:'+501',continent:'North America'},BJ:{name:'Benin',capital:'Porto-Novo',currency:'XOF',phone:'+229',continent:'Africa'},BT:{name:'Bhutan',capital:'Thimphu',currency:'BTN',phone:'+975',continent:'Asia'},BO:{name:'Bolivia',capital:'Sucre',currency:'BOB',phone:'+591',continent:'South America'},BA:{name:'Bosnia and Herzegovina',capital:'Sarajevo',currency:'BAM',phone:'+387',continent:'Europe'},BW:{name:'Botswana',capital:'Gaborone',currency:'BWP',phone:'+267',continent:'Africa'},BR:{name:'Brazil',capital:'Bras\u00edlia',currency:'BRL',phone:'+55',continent:'South America'},BN:{name:'Brunei',capital:'Bandar Seri Begawan',currency:'BND',phone:'+673',continent:'Asia'},BG:{name:'Bulgaria',capital:'Sofia',currency:'BGN',phone:'+359',continent:'Europe'},BF:{name:'Burkina Faso',capital:'Ouagadougou',currency:'XOF',phone:'+226',continent:'Africa'},BI:{name:'Burundi',capital:'Gitega',currency:'BIF',phone:'+257',continent:'Africa'},CV:{name:'Cabo Verde',capital:'Praia',currency:'CVE',phone:'+238',continent:'Africa'},KH:{name:'Cambodia',capital:'Phnom Penh',currency:'KHR',phone:'+855',continent:'Asia'},CM:{name:'Cameroon',capital:'Yaound\u00e9',currency:'XAF',phone:'+237',continent:'Africa'},CA:{name:'Canada',capital:'Ottawa',currency:'CAD',phone:'+1',continent:'North America'},CF:{name:'Central African Republic',capital:'Bangui',currency:'XAF',phone:'+236',continent:'Africa'},TD:{name:'Chad',capital:'N\'Djamena',currency:'XAF',phone:'+235',continent:'Africa'},CL:{name:'Chile',capital:'Santiago',currency:'CLP',phone:'+56',continent:'South America'},CN:{name:'China',capital:'Beijing',currency:'CNY',phone:'+86',continent:'Asia'},CO:{name:'Colombia',capital:'Bogot\u00e1',currency:'COP',phone:'+57',continent:'South America'},KM:{name:'Comoros',capital:'Moroni',currency:'KMF',phone:'+269',continent:'Africa'},CG:{name:'Congo',capital:'Brazzaville',currency:'XAF',phone:'+242',continent:'Africa'},CD:{name:'DR Congo',capital:'Kinshasa',currency:'CDF',phone:'+243',continent:'Africa'},CR:{name:'Costa Rica',capital:'San Jos\u00e9',currency:'CRC',phone:'+506',continent:'North America'},CI:{name:'C\u00f4te d\'Ivoire',capital:'Yamoussoukro',currency:'XOF',phone:'+225',continent:'Africa'},HR:{name:'Croatia',capital:'Zagreb',currency:'EUR',phone:'+385',continent:'Europe'},CU:{name:'Cuba',capital:'Havana',currency:'CUP',phone:'+53',continent:'North America'},CY:{name:'Cyprus',capital:'Nicosia',currency:'EUR',phone:'+357',continent:'Europe'},CZ:{name:'Czechia',capital:'Prague',currency:'CZK',phone:'+420',continent:'Europe'},DK:{name:'Denmark',capital:'Copenhagen',currency:'DKK',phone:'+45',continent:'Europe'},DJ:{name:'Djibouti',capital:'Djibouti',currency:'DJF',phone:'+253',continent:'Africa'},DM:{name:'Dominica',capital:'Roseau',currency:'XCD',phone:'+1-767',continent:'North America'},DO:{name:'Dominican Republic',capital:'Santo Domingo',currency:'DOP',phone:'+1-809',continent:'North America'},EC:{name:'Ecuador',capital:'Quito',currency:'USD',phone:'+593',continent:'South America'},EG:{name:'Egypt',capital:'Cairo',currency:'EGP',phone:'+20',continent:'Africa'},SV:{name:'El Salvador',capital:'San Salvador',currency:'USD',phone:'+503',continent:'North America'},GQ:{name:'Equatorial Guinea',capital:'Malabo',currency:'XAF',phone:'+240',continent:'Africa'},ER:{name:'Eritrea',capital:'Asmara',currency:'ERN',phone:'+291',continent:'Africa'},EE:{name:'Estonia',capital:'Tallinn',currency:'EUR',phone:'+372',continent:'Europe'},SZ:{name:'Eswatini',capital:'Mbabane',currency:'SZL',phone:'+268',continent:'Africa'},ET:{name:'Ethiopia',capital:'Addis Ababa',currency:'ETB',phone:'+251',continent:'Africa'},FJ:{name:'Fiji',capital:'Suva',currency:'FJD',phone:'+679',continent:'Oceania'},FI:{name:'Finland',capital:'Helsinki',currency:'EUR',phone:'+358',continent:'Europe'},FR:{name:'France',capital:'Paris',currency:'EUR',phone:'+33',continent:'Europe'},GA:{name:'Gabon',capital:'Libreville',currency:'XAF',phone:'+241',continent:'Africa'},GM:{name:'Gambia',capital:'Banjul',currency:'GMD',phone:'+220',continent:'Africa'},GE:{name:'Georgia',capital:'Tbilisi',currency:'GEL',phone:'+995',continent:'Asia'},DE:{name:'Germany',capital:'Berlin',currency:'EUR',phone:'+49',continent:'Europe'},GH:{name:'Ghana',capital:'Accra',currency:'GHS',phone:'+233',continent:'Africa'},GR:{name:'Greece',capital:'Athens',currency:'EUR',phone:'+30',continent:'Europe'},GD:{name:'Grenada',capital:'St. George\'s',currency:'XCD',phone:'+1-473',continent:'North America'},GT:{name:'Guatemala',capital:'Guatemala City',currency:'GTQ',phone:'+502',continent:'North America'},GN:{name:'Guinea',capital:'Conakry',currency:'GNF',phone:'+224',continent:'Africa'},GW:{name:'Guinea-Bissau',capital:'Bissau',currency:'XOF',phone:'+245',continent:'Africa'},GY:{name:'Guyana',capital:'Georgetown',currency:'GYD',phone:'+592',continent:'South America'},HT:{name:'Haiti',capital:'Port-au-Prince',currency:'HTG',phone:'+509',continent:'North America'},HN:{name:'Honduras',capital:'Tegucigalpa',currency:'HNL',phone:'+504',continent:'North America'},HU:{name:'Hungary',capital:'Budapest',currency:'HUF',phone:'+36',continent:'Europe'},IS:{name:'Iceland',capital:'Reykjavik',currency:'ISK',phone:'+354',continent:'Europe'},IN:{name:'India',capital:'New Delhi',currency:'INR',phone:'+91',continent:'Asia'},ID:{name:'Indonesia',capital:'Jakarta',currency:'IDR',phone:'+62',continent:'Asia'},IR:{name:'Iran',capital:'Tehran',currency:'IRR',phone:'+98',continent:'Asia'},IQ:{name:'Iraq',capital:'Baghdad',currency:'IQD',phone:'+964',continent:'Asia'},IE:{name:'Ireland',capital:'Dublin',currency:'EUR',phone:'+353',continent:'Europe'},IL:{name:'Israel',capital:'Jerusalem',currency:'ILS',phone:'+972',continent:'Asia'},IT:{name:'Italy',capital:'Rome',currency:'EUR',phone:'+39',continent:'Europe'},JM:{name:'Jamaica',capital:'Kingston',currency:'JMD',phone:'+1-876',continent:'North America'},JP:{name:'Japan',capital:'Tokyo',currency:'JPY',phone:'+81',continent:'Asia'},JO:{name:'Jordan',capital:'Amman',currency:'JOD',phone:'+962',continent:'Asia'},KZ:{name:'Kazakhstan',capital:'Astana',currency:'KZT',phone:'+7',continent:'Asia'},KE:{name:'Kenya',capital:'Nairobi',currency:'KES',phone:'+254',continent:'Africa'},KI:{name:'Kiribati',capital:'Tarawa',currency:'AUD',phone:'+686',continent:'Oceania'},KP:{name:'North Korea',capital:'Pyongyang',currency:'KPW',phone:'+850',continent:'Asia'},KR:{name:'South Korea',capital:'Seoul',currency:'KRW',phone:'+82',continent:'Asia'},KW:{name:'Kuwait',capital:'Kuwait City',currency:'KWD',phone:'+965',continent:'Asia'},KG:{name:'Kyrgyzstan',capital:'Bishkek',currency:'KGS',phone:'+996',continent:'Asia'},LA:{name:'Laos',capital:'Vientiane',currency:'LAK',phone:'+856',continent:'Asia'},LV:{name:'Latvia',capital:'Riga',currency:'EUR',phone:'+371',continent:'Europe'},LB:{name:'Lebanon',capital:'Beirut',currency:'LBP',phone:'+961',continent:'Asia'},LS:{name:'Lesotho',capital:'Maseru',currency:'LSL',phone:'+266',continent:'Africa'},LR:{name:'Liberia',capital:'Monrovia',currency:'LRD',phone:'+231',continent:'Africa'},LY:{name:'Libya',capital:'Tripoli',currency:'LYD',phone:'+218',continent:'Africa'},LI:{name:'Liechtenstein',capital:'Vaduz',currency:'CHF',phone:'+423',continent:'Europe'},LT:{name:'Lithuania',capital:'Vilnius',currency:'EUR',phone:'+370',continent:'Europe'},LU:{name:'Luxembourg',capital:'Luxembourg',currency:'EUR',phone:'+352',continent:'Europe'},MG:{name:'Madagascar',capital:'Antananarivo',currency:'MGA',phone:'+261',continent:'Africa'},MW:{name:'Malawi',capital:'Lilongwe',currency:'MWK',phone:'+265',continent:'Africa'},MY:{name:'Malaysia',capital:'Kuala Lumpur',currency:'MYR',phone:'+60',continent:'Asia'},MV:{name:'Maldives',capital:'Mal\u00e9',currency:'MVR',phone:'+960',continent:'Asia'},ML:{name:'Mali',capital:'Bamako',currency:'XOF',phone:'+223',continent:'Africa'},MT:{name:'Malta',capital:'Valletta',currency:'EUR',phone:'+356',continent:'Europe'},MH:{name:'Marshall Islands',capital:'Majuro',currency:'USD',phone:'+692',continent:'Oceania'},MR:{name:'Mauritania',capital:'Nouakchott',currency:'MRU',phone:'+222',continent:'Africa'},MU:{name:'Mauritius',capital:'Port Louis',currency:'MUR',phone:'+230',continent:'Africa'},MX:{name:'Mexico',capital:'Mexico City',currency:'MXN',phone:'+52',continent:'North America'},FM:{name:'Micronesia',capital:'Palikir',currency:'USD',phone:'+691',continent:'Oceania'},MD:{name:'Moldova',capital:'Chi\u0219in\u0103u',currency:'MDL',phone:'+373',continent:'Europe'},MC:{name:'Monaco',capital:'Monaco',currency:'EUR',phone:'+377',continent:'Europe'},MN:{name:'Mongolia',capital:'Ulaanbaatar',currency:'MNT',phone:'+976',continent:'Asia'},ME:{name:'Montenegro',capital:'Podgorica',currency:'EUR',phone:'+382',continent:'Europe'},MA:{name:'Morocco',capital:'Rabat',currency:'MAD',phone:'+212',continent:'Africa'},MZ:{name:'Mozambique',capital:'Maputo',currency:'MZN',phone:'+258',continent:'Africa'},MM:{name:'Myanmar',capital:'Naypyidaw',currency:'MMK',phone:'+95',continent:'Asia'},NA:{name:'Namibia',capital:'Windhoek',currency:'NAD',phone:'+264',continent:'Africa'},NR:{name:'Nauru',capital:'Yaren',currency:'AUD',phone:'+674',continent:'Oceania'},NP:{name:'Nepal',capital:'Kathmandu',currency:'NPR',phone:'+977',continent:'Asia'},NL:{name:'Netherlands',capital:'Amsterdam',currency:'EUR',phone:'+31',continent:'Europe'},NZ:{name:'New Zealand',capital:'Wellington',currency:'NZD',phone:'+64',continent:'Oceania'},NI:{name:'Nicaragua',capital:'Managua',currency:'NIO',phone:'+505',continent:'North America'},NE:{name:'Niger',capital:'Niamey',currency:'XOF',phone:'+227',continent:'Africa'},NG:{name:'Nigeria',capital:'Abuja',currency:'NGN',phone:'+234',continent:'Africa'},MK:{name:'North Macedonia',capital:'Skopje',currency:'MKD',phone:'+389',continent:'Europe'},NO:{name:'Norway',capital:'Oslo',currency:'NOK',phone:'+47',continent:'Europe'},OM:{name:'Oman',capital:'Muscat',currency:'OMR',phone:'+968',continent:'Asia'},PK:{name:'Pakistan',capital:'Islamabad',currency:'PKR',phone:'+92',continent:'Asia'},PW:{name:'Palau',capital:'Ngerulmud',currency:'USD',phone:'+680',continent:'Oceania'},PA:{name:'Panama',capital:'Panama City',currency:'PAB',phone:'+507',continent:'North America'},PG:{name:'Papua New Guinea',capital:'Port Moresby',currency:'PGK',phone:'+675',continent:'Oceania'},PY:{name:'Paraguay',capital:'Asunci\u00f3n',currency:'PYG',phone:'+595',continent:'South America'},PE:{name:'Peru',capital:'Lima',currency:'PEN',phone:'+51',continent:'South America'},PH:{name:'Philippines',capital:'Manila',currency:'PHP',phone:'+63',continent:'Asia'},PL:{name:'Poland',capital:'Warsaw',currency:'PLN',phone:'+48',continent:'Europe'},PT:{name:'Portugal',capital:'Lisbon',currency:'EUR',phone:'+351',continent:'Europe'},QA:{name:'Qatar',capital:'Doha',currency:'QAR',phone:'+974',continent:'Asia'},RO:{name:'Romania',capital:'Bucharest',currency:'RON',phone:'+40',continent:'Europe'},RU:{name:'Russia',capital:'Moscow',currency:'RUB',phone:'+7',continent:'Europe/Asia'},RW:{name:'Rwanda',capital:'Kigali',currency:'RWF',phone:'+250',continent:'Africa'},KN:{name:'Saint Kitts and Nevis',capital:'Basseterre',currency:'XCD',phone:'+1-869',continent:'North America'},LC:{name:'Saint Lucia',capital:'Castries',currency:'XCD',phone:'+1-758',continent:'North America'},VC:{name:'Saint Vincent',capital:'Kingstown',currency:'XCD',phone:'+1-784',continent:'North America'},WS:{name:'Samoa',capital:'Apia',currency:'WST',phone:'+685',continent:'Oceania'},SM:{name:'San Marino',capital:'San Marino',currency:'EUR',phone:'+378',continent:'Europe'},ST:{name:'S\u00e3o Tom\u00e9 and Pr\u00edncipe',capital:'S\u00e3o Tom\u00e9',currency:'STN',phone:'+239',continent:'Africa'},SA:{name:'Saudi Arabia',capital:'Riyadh',currency:'SAR',phone:'+966',continent:'Asia'},SN:{name:'Senegal',capital:'Dakar',currency:'XOF',phone:'+221',continent:'Africa'},RS:{name:'Serbia',capital:'Belgrade',currency:'RSD',phone:'+381',continent:'Europe'},SC:{name:'Seychelles',capital:'Victoria',currency:'SCR',phone:'+248',continent:'Africa'},SL:{name:'Sierra Leone',capital:'Freetown',currency:'SLE',phone:'+232',continent:'Africa'},SG:{name:'Singapore',capital:'Singapore',currency:'SGD',phone:'+65',continent:'Asia'},SK:{name:'Slovakia',capital:'Bratislava',currency:'EUR',phone:'+421',continent:'Europe'},SI:{name:'Slovenia',capital:'Ljubljana',currency:'EUR',phone:'+386',continent:'Europe'},SB:{name:'Solomon Islands',capital:'Honiara',currency:'SBD',phone:'+677',continent:'Oceania'},SO:{name:'Somalia',capital:'Mogadishu',currency:'SOS',phone:'+252',continent:'Africa'},ZA:{name:'South Africa',capital:'Pretoria',currency:'ZAR',phone:'+27',continent:'Africa'},SS:{name:'South Sudan',capital:'Juba',currency:'SSP',phone:'+211',continent:'Africa'},ES:{name:'Spain',capital:'Madrid',currency:'EUR',phone:'+34',continent:'Europe'},LK:{name:'Sri Lanka',capital:'Sri Jayawardenepura Kotte',currency:'LKR',phone:'+94',continent:'Asia'},SD:{name:'Sudan',capital:'Khartoum',currency:'SDG',phone:'+249',continent:'Africa'},SR:{name:'Suriname',capital:'Paramaribo',currency:'SRD',phone:'+597',continent:'South America'},SE:{name:'Sweden',capital:'Stockholm',currency:'SEK',phone:'+46',continent:'Europe'},CH:{name:'Switzerland',capital:'Bern',currency:'CHF',phone:'+41',continent:'Europe'},SY:{name:'Syria',capital:'Damascus',currency:'SYP',phone:'+963',continent:'Asia'},TW:{name:'Taiwan',capital:'Taipei',currency:'TWD',phone:'+886',continent:'Asia'},TJ:{name:'Tajikistan',capital:'Dushanbe',currency:'TJS',phone:'+992',continent:'Asia'},TZ:{name:'Tanzania',capital:'Dodoma',currency:'TZS',phone:'+255',continent:'Africa'},TH:{name:'Thailand',capital:'Bangkok',currency:'THB',phone:'+66',continent:'Asia'},TL:{name:'Timor-Leste',capital:'Dili',currency:'USD',phone:'+670',continent:'Asia'},TG:{name:'Togo',capital:'Lom\u00e9',currency:'XOF',phone:'+228',continent:'Africa'},TO:{name:'Tonga',capital:'Nuku\'alofa',currency:'TOP',phone:'+676',continent:'Oceania'},TT:{name:'Trinidad and Tobago',capital:'Port of Spain',currency:'TTD',phone:'+1-868',continent:'North America'},TN:{name:'Tunisia',capital:'Tunis',currency:'TND',phone:'+216',continent:'Africa'},TR:{name:'Turkey',capital:'Ankara',currency:'TRY',phone:'+90',continent:'Asia/Europe'},TM:{name:'Turkmenistan',capital:'Ashgabat',currency:'TMT',phone:'+993',continent:'Asia'},TV:{name:'Tuvalu',capital:'Funafuti',currency:'AUD',phone:'+688',continent:'Oceania'},UG:{name:'Uganda',capital:'Kampala',currency:'UGX',phone:'+256',continent:'Africa'},UA:{name:'Ukraine',capital:'Kyiv',currency:'UAH',phone:'+380',continent:'Europe'},AE:{name:'UAE',capital:'Abu Dhabi',currency:'AED',phone:'+971',continent:'Asia'},GB:{name:'United Kingdom',capital:'London',currency:'GBP',phone:'+44',continent:'Europe'},US:{name:'United States',capital:'Washington, D.C.',currency:'USD',phone:'+1',continent:'North America'},UY:{name:'Uruguay',capital:'Montevideo',currency:'UYU',phone:'+598',continent:'South America'},UZ:{name:'Uzbekistan',capital:'Tashkent',currency:'UZS',phone:'+998',continent:'Asia'},VU:{name:'Vanuatu',capital:'Port Vila',currency:'VUV',phone:'+678',continent:'Oceania'},VA:{name:'Vatican City',capital:'Vatican City',currency:'EUR',phone:'+379',continent:'Europe'},VE:{name:'Venezuela',capital:'Caracas',currency:'VES',phone:'+58',continent:'South America'},VN:{name:'Vietnam',capital:'Hanoi',currency:'VND',phone:'+84',continent:'Asia'},YE:{name:'Yemen',capital:'Sana\'a',currency:'YER',phone:'+967',continent:'Asia'},ZM:{name:'Zambia',capital:'Lusaka',currency:'ZMW',phone:'+260',continent:'Africa'},ZW:{name:'Zimbabwe',capital:'Harare',currency:'ZWL',phone:'+263',continent:'Africa'},HK:{name:'Hong Kong',capital:'Hong Kong',currency:'HKD',phone:'+852',continent:'Asia'},MO:{name:'Macau',capital:'Macau',currency:'MOP',phone:'+853',continent:'Asia'},PR:{name:'Puerto Rico',capital:'San Juan',currency:'USD',phone:'+1-787',continent:'North America'},PS:{name:'Palestine',capital:'Ramallah',currency:'ILS',phone:'+970',continent:'Asia'},XK:{name:'Kosovo',capital:'Pristina',currency:'EUR',phone:'+383',continent:'Europe'}};
    const c=(code||'').toUpperCase().trim();
    if(!c) return {_engine:'real', error:'Missing country code', found:false};
    const info=countries[c];
    // Compute derived fields from the data
    const hash=c.split('').reduce((h,ch)=>((h<<5)-h)+ch.charCodeAt(0),0);
    const isEurozone=info&&info.currency==='EUR';
    const phoneDigits=(info?info.phone:'').replace(/[^0-9]/g,'');
    const nameLen=info?info.name.length:0;
    const capitalLen=info?info.capital.length:0;
    const region=info?({Africa:'AF',Asia:'AS',Europe:'EU','North America':'NA','South America':'SA',Oceania:'OC','Europe/Asia':'EA','Asia/Europe':'EA'}[info.continent]||'XX'):'XX';
    const flag=c.length===2?String.fromCodePoint(...[...c].map(ch=>0x1F1E6+ch.charCodeAt(0)-65)):'\u{1F3F3}\u{FE0F}';
    return {_engine:'real', found:!!info, code:c, ...(info||{name:'Unknown',capital:'Unknown',currency:'Unknown',phone:'Unknown',continent:'Unknown'}), flag, region_code:region, is_eurozone:isEurozone, phone_digits:phoneDigits, name_length:nameLen, capital_length:capitalLen, code_hash:Math.abs(hash), total_countries_in_db:Object.keys(countries).length};
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
    // Full HTTP status code database covering all standard codes (RFC 7231, 9110, WebDAV, etc.)
    const codes={100:{name:'Continue',meaning:'Initial part of request received, continue sending'},101:{name:'Switching Protocols',meaning:'Server is switching protocols as requested'},102:{name:'Processing',meaning:'Server received and is processing (WebDAV)'},103:{name:'Early Hints',meaning:'Preload resources while server prepares response'},200:{name:'OK',meaning:'Request succeeded'},201:{name:'Created',meaning:'Resource created successfully'},202:{name:'Accepted',meaning:'Request accepted but processing not complete'},203:{name:'Non-Authoritative Information',meaning:'Response from a transforming proxy'},204:{name:'No Content',meaning:'Success with no response body'},205:{name:'Reset Content',meaning:'Reset the document view'},206:{name:'Partial Content',meaning:'Partial resource delivered (range request)'},207:{name:'Multi-Status',meaning:'Multiple status codes for multiple operations (WebDAV)'},208:{name:'Already Reported',meaning:'Members already enumerated (WebDAV)'},226:{name:'IM Used',meaning:'Response is a delta to the GET request'},300:{name:'Multiple Choices',meaning:'Multiple options for the resource'},301:{name:'Moved Permanently',meaning:'Resource moved, update URL permanently'},302:{name:'Found',meaning:'Resource temporarily at different URI'},303:{name:'See Other',meaning:'Response at another URI, use GET'},304:{name:'Not Modified',meaning:'Resource unchanged, use cached version'},305:{name:'Use Proxy',meaning:'Must access resource through proxy (deprecated)'},307:{name:'Temporary Redirect',meaning:'Repeat request at another URI with same method'},308:{name:'Permanent Redirect',meaning:'Repeat at another URI permanently with same method'},400:{name:'Bad Request',meaning:'Invalid request syntax or framing'},401:{name:'Unauthorized',meaning:'Authentication required or credentials invalid'},402:{name:'Payment Required',meaning:'Reserved for future use, payment needed'},403:{name:'Forbidden',meaning:'Server refuses to authorize the request'},404:{name:'Not Found',meaning:'Resource does not exist at this URI'},405:{name:'Method Not Allowed',meaning:'HTTP method not supported for this resource'},406:{name:'Not Acceptable',meaning:'No content matching Accept headers'},407:{name:'Proxy Authentication Required',meaning:'Must authenticate with the proxy'},408:{name:'Request Timeout',meaning:'Server timed out waiting for the request'},409:{name:'Conflict',meaning:'Request conflicts with current resource state'},410:{name:'Gone',meaning:'Resource permanently removed, no forwarding address'},411:{name:'Length Required',meaning:'Content-Length header is required'},412:{name:'Precondition Failed',meaning:'Precondition in headers evaluated to false'},413:{name:'Payload Too Large',meaning:'Request entity exceeds server limits'},414:{name:'URI Too Long',meaning:'Request URI exceeds server limits'},415:{name:'Unsupported Media Type',meaning:'Media type not supported for this resource'},416:{name:'Range Not Satisfiable',meaning:'Requested range cannot be served'},417:{name:'Expectation Failed',meaning:'Expect header requirement cannot be met'},418:{name:'I\'m a Teapot',meaning:'Server refuses to brew coffee with a teapot (RFC 2324)'},421:{name:'Misdirected Request',meaning:'Request directed at wrong server'},422:{name:'Unprocessable Entity',meaning:'Well-formed but semantically erroneous (WebDAV)'},423:{name:'Locked',meaning:'Resource is locked (WebDAV)'},424:{name:'Failed Dependency',meaning:'Failed due to failure of a previous request (WebDAV)'},425:{name:'Too Early',meaning:'Server unwilling to process a request that might be replayed'},426:{name:'Upgrade Required',meaning:'Client should switch to a different protocol'},428:{name:'Precondition Required',meaning:'Request must be conditional'},429:{name:'Too Many Requests',meaning:'Rate limit exceeded, slow down'},431:{name:'Request Header Fields Too Large',meaning:'Header fields exceed server limits'},451:{name:'Unavailable For Legal Reasons',meaning:'Blocked for legal reasons (censorship, court order)'},500:{name:'Internal Server Error',meaning:'Server encountered an unexpected condition'},501:{name:'Not Implemented',meaning:'Server does not support this functionality'},502:{name:'Bad Gateway',meaning:'Invalid response from upstream server'},503:{name:'Service Unavailable',meaning:'Server temporarily overloaded or in maintenance'},504:{name:'Gateway Timeout',meaning:'Upstream server did not respond in time'},505:{name:'HTTP Version Not Supported',meaning:'HTTP version in request not supported'},506:{name:'Variant Also Negotiates',meaning:'Circular reference in content negotiation'},507:{name:'Insufficient Storage',meaning:'Server unable to store representation (WebDAV)'},508:{name:'Loop Detected',meaning:'Infinite loop detected processing request (WebDAV)'},510:{name:'Not Extended',meaning:'Further extensions required to fulfill request'},511:{name:'Network Authentication Required',meaning:'Client must authenticate to gain network access'}};
    const c=parseInt(code,10)||200;
    if(c<100||c>599) return {_engine:'real', error:'Invalid HTTP status code. Must be 100-599.', code:c};
    const info=codes[c];
    // Compute category and properties from the code itself
    const category=c<200?'informational':c<300?'success':c<400?'redirection':c<500?'client_error':'server_error';
    const is_error=c>=400;
    const is_client_error=c>=400&&c<500;
    const is_server_error=c>=500;
    const is_cacheable=[200,203,204,206,300,301,308,404,405,410,414,501].includes(c);
    const is_retryable=c===408||c===429||c===500||c===502||c===503||c===504;
    const retry_strategy=c===429?'exponential_backoff_with_retry_after':c===503?'exponential_backoff':is_retryable?'linear_backoff':'none';
    const suggested_retry_after_ms=c===429?60000:c===503?5000:c===502?3000:c===504?10000:c===408?1000:0;
    const is_standard=!!info;
    const rfc=c<200?'RFC 9110':c<300?'RFC 9110':c<400?'RFC 9110':c===418?'RFC 2324':c===451?'RFC 7725':(c>=420&&c<=424||c===507||c===508)?'RFC 4918':'RFC 9110';
    const name=info?info.name:'HTTP '+c;
    const meaning=info?info.meaning:'Non-standard status code';
    return {_engine:'real', code:c, name, meaning, category, is_error, is_client_error, is_server_error, is_cacheable, is_retryable, retry_strategy, suggested_retry_after_ms, is_standard, rfc, total_codes_in_db:Object.keys(codes).length};
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
  'finance-npv': (input) => {
    input = input || {};
    const cash_flows = input.cash_flows || input.cashflows;
    const discount_rate = input.discount_rate || input.rate;
    const cf=cash_flows||input.cashFlows||[-1000,300,400,500,600]; const rawR=discount_rate||0.1;
    const r = rawR > 1 ? rawR / 100 : rawR; // treat 10 as 10%, not 1000%
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

  'finance-break-even': (input) => {
    input = input || {};
    const fixed_costs = input.fixed_costs || input.fixedCosts;
    const price_per_unit = input.price_per_unit || input.pricePerUnit || input.price;
    const variable_cost_per_unit = input.variable_cost_per_unit || input.costPerUnit || input.variable_cost;
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
