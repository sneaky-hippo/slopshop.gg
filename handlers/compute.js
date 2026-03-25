'use strict';

const crypto = require('crypto');
const dns = require('dns');
const http = require('http');
const https = require('https');
const { promisify } = require('util');

const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);
const dnsResolveMx = promisify(dns.resolveMx);
const dnsResolveTxt = promisify(dns.resolveTxt);
const dnsResolveNs = promisify(dns.resolveNs);

// ─── TEXT PROCESSING ────────────────────────────────────────────────────────

function textWordCount(input) {
  const text = input.text || '';
  const words = text.trim() === '' ? [] : text.trim().split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  return { _engine: 'real', words: words.length, characters: text.length, charactersNoSpaces: text.replace(/\s/g, '').length, sentences: sentences.length, paragraphs: paragraphs.length };
}

function textCharCount(input) {
  const text = input.text || '';
  return { _engine: 'real', withSpaces: text.length, withoutSpaces: text.replace(/\s/g, '').length, letters: (text.match(/[a-zA-Z]/g)||[]).length, digits: (text.match(/\d/g)||[]).length, spaces: (text.match(/\s/g)||[]).length, special: (text.match(/[^a-zA-Z0-9\s]/g)||[]).length };
}

function textExtractEmails(input) {
  const text = input.text || '';
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
  const u = [...new Set(m)];
  return { _engine: 'real', emails: u, count: u.length };
}

function textExtractUrls(input) {
  const text = input.text || '';
  const m = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/g) || [];
  const u = [...new Set(m)];
  return { _engine: 'real', urls: u, count: u.length };
}

function textExtractPhones(input) {
  const text = input.text || '';
  const m = text.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g) || [];
  const u = [...new Set(m)];
  return { _engine: 'real', phones: u, count: u.length };
}

function textExtractNumbers(input) {
  const text = input.text || '';
  const m = text.match(/-?\d+\.?\d*/g) || [];
  return { _engine: 'real', numbers: m.map(Number), raw: m, count: m.length };
}

function textExtractDates(input) {
  const text = input.text || '';
  const found = [];
  [/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi, /\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b/g].forEach(p => found.push(...(text.match(p)||[])));
  const u = [...new Set(found)];
  return { _engine: 'real', dates: u, count: u.length };
}

function textExtractMentions(input) {
  const text = input.text || '';
  const m = text.match(/@[a-zA-Z0-9_]+/g) || [];
  const u = [...new Set(m)];
  return { _engine: 'real', mentions: u, count: u.length };
}

function textExtractHashtags(input) {
  const text = input.text || '';
  const m = text.match(/#[a-zA-Z0-9_]+/g) || [];
  const u = [...new Set(m)];
  return { _engine: 'real', hashtags: u, count: u.length };
}

function textRegexTest(input) {
  const { text = '', pattern = '', flags = 'g' } = input;
  try {
    const safeFlags = flags.includes('g') ? flags : flags + 'g';
    const re = new RegExp(pattern, safeFlags);
    const matches = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
    }
    return { _engine: 'real', matched: matches.length > 0, matches, count: matches.length };
  } catch (e) { return { _engine: 'real', error: e.message }; }
}

function textRegexReplace(input) {
  const { text = '', pattern = '', replacement = '', flags = 'g' } = input;
  try {
    const result = text.replace(new RegExp(pattern, flags), replacement);
    return { _engine: 'real', result, original: text, changed: result !== text };
  } catch (e) { return { _engine: 'real', error: e.message }; }
}

function textDiff(input) {
  const a = (input.a || '').split('\n'), b = (input.b || '').split('\n');
  const diff = [];
  let additions = 0, deletions = 0, unchanged = 0;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= a.length) { diff.push({ type: 'add', line: i+1, value: b[i] }); additions++; }
    else if (i >= b.length) { diff.push({ type: 'remove', line: i+1, value: a[i] }); deletions++; }
    else if (a[i] === b[i]) { diff.push({ type: 'equal', line: i+1, value: a[i] }); unchanged++; }
    else { diff.push({ type: 'remove', line: i+1, value: a[i] }); diff.push({ type: 'add', line: i+1, value: b[i] }); additions++; deletions++; }
  }
  return { _engine: 'real', diff, stats: { additions, deletions, unchanged } };
}

function textSlugify(input) {
  const text = input.text || '';
  const slug = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s-]/g,'').trim().replace(/[\s-]+/g,'-');
  return { _engine: 'real', slug };
}

function textTruncate(input) {
  const { text = '', length = 100, suffix = '...' } = input;
  if (text.length <= length) return { _engine: 'real', result: text, truncated: false };
  const trimmed = text.slice(0, length - suffix.length);
  const lastSpace = trimmed.lastIndexOf(' ');
  return { _engine: 'real', result: (lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed) + suffix, truncated: true, originalLength: text.length };
}

function textLanguageDetect(input) {
  const text = (input.text || '').toLowerCase();
  const langs = {
    english: /\b(the|and|is|in|it|of|to|a|that|was|for|on|are|with|he|as|at|this|be|by)\b/g,
    spanish: /\b(el|la|los|las|de|que|en|es|un|una|y|por|con|se|del|al|lo|su|para|como)\b/g,
    french: /\b(le|la|les|de|du|des|un|une|et|en|est|que|pour|dans|par|sur|ce|il|pas|je)\b/g,
    german: /\b(der|die|das|und|in|den|ist|ein|eine|nicht|von|zu|mit|sich|des|auf|dem)\b/g,
    portuguese: /\b(de|a|o|que|e|do|da|em|um|para|com|uma|os|no|se|na|por|mais|as|dos)\b/g,
  };
  const scores = {};
  for (const [lang, re] of Object.entries(langs)) scores[lang] = (text.match(re)||[]).length;
  const sorted = Object.entries(scores).sort((a,b) => b[1]-a[1]);
  return { _engine: 'real', detected: sorted[0][0], confidence: sorted[0][1], scores };
}

const PROFANITY_LIST = ['damn','hell','crap','ass','bastard','shit','fuck','bitch','piss','dick','cock','pussy','asshole','motherfucker','cunt'];
function textProfanityCheck(input) {
  const text = (input.text||'').toLowerCase();
  const found = PROFANITY_LIST.filter(w => new RegExp('\\b'+w+'\\b','i').test(text));
  return { _engine: 'real', clean: found.length === 0, found, count: found.length };
}

function textReadabilityScore(input) {
  const text = input.text || '';
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const syllCount = w => {
    w = w.toLowerCase().replace(/[^a-z]/g,'');
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/,'').replace(/^y/,'');
    const m = w.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  };
  const totalSyl = words.reduce((s,w) => s+syllCount(w), 0);
  const awps = sentences.length ? words.length/sentences.length : 0;
  const aspw = words.length ? totalSyl/words.length : 0;
  const flesch = 206.835 - 1.015*awps - 84.6*aspw;
  const fk = 0.39*awps + 11.8*aspw - 15.59;
  let level = 'Very Difficult';
  if (flesch >= 90) level = 'Very Easy';
  else if (flesch >= 80) level = 'Easy';
  else if (flesch >= 70) level = 'Fairly Easy';
  else if (flesch >= 60) level = 'Standard';
  else if (flesch >= 50) level = 'Fairly Difficult';
  else if (flesch >= 30) level = 'Difficult';
  return { _engine: 'real', fleschReadingEase: Math.round(flesch*10)/10, fleschKincaidGrade: Math.round(fk*10)/10, level, avgWordsPerSentence: Math.round(awps*10)/10, avgSyllablesPerWord: Math.round(aspw*10)/10, wordCount: words.length, sentenceCount: sentences.length };
}

function textKeywordExtract(input) {
  const { text = '', topN = 10 } = input;
  const stop = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','was','are','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','it','its','this','that','these','those','i','you','he','she','we','they','my','your','his','her','our','their','not','no','so','if','as','by','from','up','out','about','into','than','then','there','when','where','who','what','which','how','all','each','more','also','just','can','said','get','make','like','time','know','take','see']);
  const freq = {};
  for (const w of (text.toLowerCase().match(/[a-z']+/g)||[])) {
    const c = w.replace(/'/g,'');
    if (c.length > 2 && !stop.has(c)) freq[c] = (freq[c]||0)+1;
  }
  return { _engine: 'real', keywords: Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,topN).map(([word,count])=>({word,count})) };
}

function textSentenceSplit(input) {
  const text = input.text || '';
  const s = (text.match(/[^.!?]*[.!?]+/g)||[text]).map(s=>s.trim()).filter(s=>s.length>0);
  return { _engine: 'real', sentences: s, count: s.length };
}

function textDeduplicateLines(input) {
  const lines = (input.text||'').split('\n');
  const seen = new Set(); const unique = []; let dupes = 0;
  for (const l of lines) { if (seen.has(l)) dupes++; else { seen.add(l); unique.push(l); } }
  return { _engine: 'real', result: unique.join('\n'), original: lines.length, unique: unique.length, duplicatesRemoved: dupes };
}

function textSortLines(input) {
  const { text = '', order = 'asc', numeric = false } = input;
  const lines = text.split('\n');
  const sorted = [...lines].sort((a,b) => {
    if (numeric) return order==='asc' ? parseFloat(a)-parseFloat(b) : parseFloat(b)-parseFloat(a);
    return order==='asc' ? a.localeCompare(b) : b.localeCompare(a);
  });
  return { _engine: 'real', result: sorted.join('\n'), lineCount: lines.length };
}

function textReverse(input) {
  const text = input.text || '';
  return { _engine: 'real', result: text.split('').reverse().join(''), original: text };
}

function textCaseConvert(input) {
  const { text = '', to = 'lower' } = input;
  let result;
  const words = () => text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').trim().split(/\s+/);
  switch (to) {
    case 'lower': result = text.toLowerCase(); break;
    case 'upper': result = text.toUpperCase(); break;
    case 'title': result = text.replace(/\w\S*/g, w => w[0].toUpperCase()+w.slice(1).toLowerCase()); break;
    case 'camel': { const w=words(); result = w[0]+w.slice(1).map(x=>x[0].toUpperCase()+x.slice(1)).join(''); break; }
    case 'pascal': result = words().map(w=>w[0].toUpperCase()+w.slice(1)).join(''); break;
    case 'snake': result = text.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); break;
    case 'kebab': result = text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); break;
    case 'constant': result = text.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,''); break;
    default: result = text;
  }
  return { _engine: 'real', result, from: text, to };
}

function textLoremIpsum(input) {
  const { paragraphs = 1, sentences = 5 } = input;
  const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim est laborum'.split(' ');
  const sentence = () => { const n=8+Math.floor(Math.random()*10); const ws=Array.from({length:n},()=>words[Math.floor(Math.random()*words.length)]); ws[0]=ws[0][0].toUpperCase()+ws[0].slice(1); return ws.join(' ')+'.'; };
  const para = (n) => Array.from({length:n},sentence).join(' ');
  return { _engine: 'real', text: Array.from({length:paragraphs},()=>para(sentences)).join('\n\n'), paragraphs, sentences };
}

function textCountFrequency(input) {
  const { text = '', mode = 'word' } = input;
  const freq = {};
  if (mode === 'char') { for (const ch of text) freq[ch]=(freq[ch]||0)+1; }
  else { for (const w of (text.toLowerCase().match(/\b\w+\b/g)||[])) freq[w]=(freq[w]||0)+1; }
  const sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]);
  return { _engine: 'real', frequency: Object.fromEntries(sorted), topTen: sorted.slice(0,10).map(([k,v])=>({[mode==='char'?'char':'word']:k,count:v})) };
}

function textStripHtml(input) {
  const text = input.text || '';
  return { _engine: 'real', result: text.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim(), original: text };
}

function textEscapeHtml(input) {
  const text = input.text || '';
  return { _engine: 'real', result: text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') };
}

function textUnescapeHtml(input) {
  const text = input.text || '';
  return { _engine: 'real', result: text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'") };
}

function textMarkdownToHtml(input) {
  let t = input.text || '';
  t = t.replace(/^#{6}\s+(.+)$/gm,'<h6>$1</h6>').replace(/^#{5}\s+(.+)$/gm,'<h5>$1</h5>').replace(/^#{4}\s+(.+)$/gm,'<h4>$1</h4>').replace(/^#{3}\s+(.+)$/gm,'<h3>$1</h3>').replace(/^#{2}\s+(.+)$/gm,'<h2>$1</h2>').replace(/^#{1}\s+(.+)$/gm,'<h1>$1</h1>');
  t = t.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/`([^`]+)`/g,'<code>$1</code>');
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img alt="$1" src="$2">').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>');
  t = t.replace(/^>\s+(.+)$/gm,'<blockquote>$1</blockquote>').replace(/^[-*+]\s+(.+)$/gm,'<li>$1</li>').replace(/^---+$/gm,'<hr>');
  t = t.replace(/\n{2,}/g,'</p><p>');
  return { _engine: 'real', html: '<p>'+t+'</p>' };
}

function textCsvToJson(input) {
  const { text = '', delimiter = ',', headers = true } = input;
  const lines = text.trim().split('\n');
  if (!lines.length) return { _engine: 'real', data: [] };
  const parseRow = (row) => {
    const result=[]; let cur='', inQ=false;
    for (const ch of row) {
      if (ch==='"') inQ=!inQ;
      else if (ch===delimiter && !inQ) { result.push(cur.trim()); cur=''; }
      else cur+=ch;
    }
    result.push(cur.trim());
    return result;
  };
  if (headers) {
    const keys = parseRow(lines[0]);
    const data = lines.slice(1).map(l => Object.fromEntries(keys.map((k,i)=>[k,(parseRow(l)[i]!==undefined?parseRow(l)[i]:'')] )));
    return { _engine: 'real', data, headers: keys, rows: data.length };
  }
  return { _engine: 'real', data: lines.map(parseRow), rows: lines.length };
}

function textJsonToCsv(input) {
  const { data } = input;
  if (!Array.isArray(data)||!data.length) return { _engine: 'real', csv:'', headers:[] };
  const headers = Object.keys(data[0]);
  const esc = v => { const s=String(v!=null?v:''); return s.includes(',')||s.includes('"')||s.includes('\n') ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const rows = data.map(row=>headers.map(h=>esc(row[h])).join(','));
  return { _engine: 'real', csv: [headers.join(','),...rows].join('\n'), headers, rows: data.length };
}

function textXmlToJson(input) {
  const text = input.text || '';
  const parseNode = (str) => {
    const obj={}; const re=/<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g; let m, found=false;
    while ((m=re.exec(str))!==null) {
      found=true;
      const [,tag,,content]=m;
      const inner=content.trim();
      const value = /<\w+/.test(inner) ? parseNode(inner) : inner;
      if (obj[tag]!==undefined) { if (!Array.isArray(obj[tag])) obj[tag]=[obj[tag]]; obj[tag].push(value); }
      else obj[tag]=value;
    }
    return found ? obj : str.trim();
  };
  try { return { _engine: 'real', data: parseNode(text) }; } catch(e) { return { _engine: 'real', error: e.message }; }
}

function textYamlToJson(input) {
  const text = input.text || '';
  const result = {};
  const stack = [{ obj: result, indent: -1 }];
  for (const rawLine of text.split('\n')) {
    if (!rawLine.trim()||rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.match(/^\s*/)[0].length;
    const line = rawLine.trim();
    const ci = line.indexOf(':');
    if (ci===-1) continue;
    const key=line.slice(0,ci).trim(), val=line.slice(ci+1).trim();
    while (stack.length>1 && stack[stack.length-1].indent>=indent) stack.pop();
    const parent=stack[stack.length-1].obj;
    if (val===''||val==='{}'||val==='[]') { parent[key]=val==='[]'?[]:{} ; stack.push({obj:parent[key],indent}); }
    else {
      let parsed=val;
      if (val==='true') parsed=true;
      else if (val==='false') parsed=false;
      else if (val==='null'||val==='~') parsed=null;
      else if (!isNaN(Number(val))&&val!=='') parsed=Number(val);
      else if ((val.startsWith('"')&&val.endsWith('"'))||(val.startsWith("'")&&val.endsWith("'"))) parsed=val.slice(1,-1);
      parent[key]=parsed;
    }
  }
  return { _engine: 'real', data: result };
}

function textJsonValidate(input) {
  const text = input.text || '';
  try { const p=JSON.parse(text); return { _engine: 'real', valid:true, type:Array.isArray(p)?'array':typeof p, size:text.length }; }
  catch(e) { return { _engine: 'real', valid:false, error:e.message }; }
}

function textJsonFormat(input) {
  const { text = '', minify = false, indent = 2 } = input;
  try { const p=JSON.parse(text); return { _engine: 'real', result: minify?JSON.stringify(p):JSON.stringify(p,null,indent), valid:true }; }
  catch(e) { return { _engine: 'real', error:e.message, valid:false }; }
}

function textJsonPath(input) {
  const { text = '', path = '' } = input;
  try {
    let obj=JSON.parse(text);
    const parts=path.replace(/\[(\d+)\]/g,'.$1').split('.').filter(p=>p!=='');
    for (const p of parts) { if (obj==null) return { _engine: 'real',value:null,found:false}; obj=obj[p]; }
    return { _engine: 'real', value:obj, found:obj!==undefined };
  } catch(e) { return { _engine: 'real', error:e.message }; }
}

function flattenObj(obj, prefix) {
  prefix=prefix||'';
  const result={};
  for (const k of Object.keys(obj)) {
    const key=prefix?prefix+'.'+k:k, v=obj[k];
    if (v!==null&&typeof v==='object'&&!Array.isArray(v)) Object.assign(result,flattenObj(v,key));
    else result[key]=v;
  }
  return result;
}

function textJsonFlatten(input) {
  try { const o=typeof input.data==='object'&&input.data!==null?input.data:JSON.parse(input.text||'{}'); return { _engine: 'real',result:flattenObj(o)}; }
  catch(e) { return { _engine: 'real',error:e.message}; }
}

function textJsonUnflatten(input) {
  try {
    const flat=typeof input.data==='object'&&input.data!==null?input.data:JSON.parse(input.text||'{}');
    const result={};
    for (const key of Object.keys(flat)) {
      const parts=key.split('.'); let cur=result;
      for (let i=0;i<parts.length-1;i++) { if (!(parts[i] in cur)) cur[parts[i]]={}; cur=cur[parts[i]]; }
      cur[parts[parts.length-1]]=flat[key];
    }
    return { _engine: 'real',result};
  } catch(e) { return { _engine: 'real',error:e.message}; }
}

function jsonDiffHelper(a, b, path) {
  path=path||'';
  const diffs=[];
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  for (const k of keys) {
    const p=path?path+'.'+k:k;
    if (!(k in a)) diffs.push({path:p,type:'added',value:b[k]});
    else if (!(k in b)) diffs.push({path:p,type:'removed',value:a[k]});
    else if (typeof a[k]==='object'&&a[k]!==null&&typeof b[k]==='object'&&b[k]!==null&&!Array.isArray(a[k])&&!Array.isArray(b[k])) diffs.push(...jsonDiffHelper(a[k],b[k],p));
    else if (JSON.stringify(a[k])!==JSON.stringify(b[k])) diffs.push({path:p,type:'changed',from:a[k],to:b[k]});
  }
  return diffs;
}

function textJsonDiff(input) {
  try {
    const a=typeof input.a==='object'&&input.a!==null?input.a:JSON.parse(input.a||'{}');
    const b=typeof input.b==='object'&&input.b!==null?input.b:JSON.parse(input.b||'{}');
    const diffs=jsonDiffHelper(a,b);
    return { _engine: 'real',diffs,same:diffs.length===0,changeCount:diffs.length};
  } catch(e) { return { _engine: 'real',error:e.message}; }
}

function deepMerge(a, b) {
  const r=Object.assign({},a);
  for (const k of Object.keys(b)) {
    const v=b[k];
    if (v!==null&&typeof v==='object'&&!Array.isArray(v)&&typeof r[k]==='object'&&r[k]!==null) r[k]=deepMerge(r[k],v);
    else r[k]=v;
  }
  return r;
}

function textJsonMerge(input) {
  try {
    const a=typeof input.a==='object'&&input.a!==null?input.a:JSON.parse(input.a||'{}');
    const b=typeof input.b==='object'&&input.b!==null?input.b:JSON.parse(input.b||'{}');
    return { _engine: 'real',result:deepMerge(a,b)};
  } catch(e) { return { _engine: 'real',error:e.message}; }
}

function genSchema(val) {
  if (val===null) return { _engine: 'real',type:'null'};
  if (Array.isArray(val)) return { _engine: 'real',type:'array',items:val.length>0?genSchema(val[0]):{}};
  if (typeof val==='object') { const p={}; for (const k of Object.keys(val)) p[k]=genSchema(val[k]); return { _engine: 'real',type:'object',properties:p,required:Object.keys(val)}; }
  return { _engine: 'real',type:typeof val};
}

function textJsonSchemaGenerate(input) {
  try { const o=typeof input.data==='object'&&input.data!==null?input.data:JSON.parse(input.text||'{}'); return { _engine: 'real',schema:Object.assign({'$schema':'http://json-schema.org/draft-07/schema#'},genSchema(o))}; }
  catch(e) { return { _engine: 'real',error:e.message}; }
}

function textBase64Encode(input) { return { _engine: 'real',result:Buffer.from(input.text||'','utf8').toString('base64')}; }
function textBase64Decode(input) { try{return{ _engine: 'real',result:Buffer.from(input.text||'','base64').toString('utf8')}}catch(e){return{ _engine: 'real',error:e.message}}; }
function textUrlEncode(input) { return { _engine: 'real',result:encodeURIComponent(input.text||'')}; }
function textUrlDecode(input) { try{return{ _engine: 'real',result:decodeURIComponent(input.text||'')}}catch(e){return{ _engine: 'real',error:e.message}}; }

function textUrlParse(input) {
  try {
    const u=new URL(input.text||''); const q={};
    u.searchParams.forEach((v,k)=>{q[k]=v;});
    return { _engine: 'real',protocol:u.protocol,username:u.username,password:u.password,host:u.host,hostname:u.hostname,port:u.port,pathname:u.pathname,search:u.search,hash:u.hash,origin:u.origin,query:q};
  } catch(e) { return { _engine: 'real',error:e.message}; }
}

function textHexEncode(input) { return { _engine: 'real',result:Buffer.from(input.text||'','utf8').toString('hex')}; }
function textHexDecode(input) { try{return{ _engine: 'real',result:Buffer.from(input.text||'','hex').toString('utf8')}}catch(e){return{ _engine: 'real',error:e.message}}; }

function textRot13(input) {
  const text=input.text||'';
  return { _engine: 'real',result:text.replace(/[a-zA-Z]/g,c=>{const b=c<='Z'?65:97;return String.fromCharCode(((c.charCodeAt(0)-b+13)%26)+b);})};
}

// ─── CRYPTO & SECURITY ──────────────────────────────────────────────────────

function cryptoHashSha256(input) { return { _engine: 'real',hash:crypto.createHash('sha256').update(input.text||'').digest('hex'),algorithm:'sha256'}; }
function cryptoHashSha512(input) { return { _engine: 'real',hash:crypto.createHash('sha512').update(input.text||'').digest('hex'),algorithm:'sha512'}; }
function cryptoHashMd5(input) { return { _engine: 'real',hash:crypto.createHash('md5').update(input.text||'').digest('hex'),algorithm:'md5'}; }
function cryptoHmac(input) { return { _engine: 'real',hmac:crypto.createHmac('sha256',input.secret||'').update(input.text||'').digest('hex'),algorithm:'hmac-sha256'}; }
function cryptoUuid() { return { _engine: 'real',uuid:crypto.randomUUID()}; }

function cryptoNanoid(input) {
  const {size=21}=input;
  const alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const b=crypto.randomBytes(size); let id='';
  for (let i=0;i<size;i++) id+=alpha[b[i]%alpha.length];
  return { _engine: 'real',id,size};
}

function cryptoPasswordGenerate(input) {
  const {length=16,uppercase=true,lowercase=true,numbers=true,symbols=true}=input;
  let chars='';
  if (uppercase) chars+='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (lowercase) chars+='abcdefghijklmnopqrstuvwxyz';
  if (numbers) chars+='0123456789';
  if (symbols) chars+='!@#$%^&*()_+-=[]{}|;:,.<>?';
  if (!chars) chars='abcdefghijklmnopqrstuvwxyz';
  const b=crypto.randomBytes(length); let pw='';
  for (let i=0;i<length;i++) pw+=chars[b[i]%chars.length];
  return { _engine: 'real',password:pw,length,entropy:Math.floor(length*Math.log2(chars.length))};
}

function cryptoPasswordHash(input) {
  const {password='',salt:si}=input;
  const salt=si||crypto.randomBytes(16).toString('hex');
  const hash=crypto.pbkdf2Sync(password,salt,100000,64,'sha512').toString('hex');
  return { _engine: 'real',hash,salt,iterations:100000,algorithm:'pbkdf2-sha512'};
}

function cryptoPasswordVerify(input) {
  const {password='',hash='',salt=''}=input;
  const computed=crypto.pbkdf2Sync(password,salt,100000,64,'sha512').toString('hex');
  return { _engine: 'real',valid:computed===hash};
}

function cryptoRandomBytes(input) {
  const {size=32}=input;
  const b=crypto.randomBytes(size);
  return { _engine: 'real',hex:b.toString('hex'),base64:b.toString('base64'),bytes:size};
}

function cryptoRandomInt(input) {
  const {min=0,max=100}=input;
  return { _engine: 'real',result:min+(crypto.randomBytes(4).readUInt32BE(0)%(max-min+1))};
}

function b64url(buf) { return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }

function cryptoJwtSign(input) {
  const {payload={},secret='',expiresIn=3600}=input;
  const now=Math.floor(Date.now()/1000);
  const fullPayload=Object.assign({},payload,{iat:now,exp:now+expiresIn});
  const hB=b64url(Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const pB=b64url(Buffer.from(JSON.stringify(fullPayload)));
  const sig=b64url(crypto.createHmac('sha256',secret).update(hB+'.'+pB).digest());
  return { _engine: 'real',token:hB+'.'+pB+'.'+sig,expiresAt:new Date((now+expiresIn)*1000).toISOString()};
}

function cryptoJwtVerify(input) {
  const {token='',secret=''}=input;
  try {
    const parts=token.split('.');
    if (parts.length!==3) return { _engine: 'real',valid:false,error:'Invalid token structure'};
    const [hB,pB,sigB]=parts;
    const expected=b64url(crypto.createHmac('sha256',secret).update(hB+'.'+pB).digest());
    if (expected!==sigB) return { _engine: 'real',valid:false,error:'Invalid signature'};
    const payload=JSON.parse(Buffer.from(pB,'base64').toString('utf8'));
    const now=Math.floor(Date.now()/1000);
    if (payload.exp&&payload.exp<now) return { _engine: 'real',valid:false,error:'Token expired',payload};
    return { _engine: 'real',valid:true,payload};
  } catch(e) { return { _engine: 'real',valid:false,error:e.message}; }
}

function cryptoJwtDecode(input) {
  const {token=''}=input;
  try {
    const parts=token.split('.');
    if (parts.length<2) return { _engine: 'real',error:'Invalid token'};
    const header=JSON.parse(Buffer.from(parts[0],'base64').toString('utf8'));
    const payload=JSON.parse(Buffer.from(parts[1],'base64').toString('utf8'));
    return { _engine: 'real',header,payload,isExpired:payload.exp?payload.exp<Math.floor(Date.now()/1000):null};
  } catch(e) { return { _engine: 'real',error:e.message}; }
}

function cryptoOtpGenerate(input) {
  const {digits=6}=input;
  const otp=(crypto.randomBytes(4).readUInt32BE(0)%Math.pow(10,digits)).toString().padStart(digits,'0');
  return { _engine: 'real',otp,digits};
}

function cryptoEncryptAes(input) {
  const {text='',key=''}=input;
  const k=crypto.createHash('sha256').update(key).digest();
  const iv=crypto.randomBytes(12);
  const c=crypto.createCipheriv('aes-256-gcm',k,iv);
  const enc=Buffer.concat([c.update(text,'utf8'),c.final()]);
  return { _engine: 'real',encrypted:enc.toString('hex'),iv:iv.toString('hex'),tag:c.getAuthTag().toString('hex'),algorithm:'aes-256-gcm'};
}

function cryptoDecryptAes(input) {
  const {encrypted='',iv='',tag='',key=''}=input;
  try {
    const k=crypto.createHash('sha256').update(key).digest();
    const d=crypto.createDecipheriv('aes-256-gcm',k,Buffer.from(iv,'hex'));
    d.setAuthTag(Buffer.from(tag,'hex'));
    const dec=Buffer.concat([d.update(Buffer.from(encrypted,'hex')),d.final()]);
    return { _engine: 'real',text:dec.toString('utf8')};
  } catch(e) { return { _engine: 'real',error:e.message}; }
}

function cryptoChecksumFile(input) {
  const c=input.content||'';
  return { _engine: 'real',md5:crypto.createHash('md5').update(c).digest('hex'),sha256:crypto.createHash('sha256').update(c).digest('hex'),sha512:crypto.createHash('sha512').update(c).digest('hex'),size:Buffer.byteLength(c,'utf8')};
}

// ─── MATH & NUMBERS ─────────────────────────────────────────────────────────

function mathEvaluate(input) {
  const expr=(input.expression||'').replace(/\s+/g,'');
  if (!/^[0-9+\-*/.()%^]+$/.test(expr)) return { _engine: 'real',error:'Invalid characters in expression'};
  const tokens=expr.match(/(\d+\.?\d*|\*\*|[+\-*/%()])/g)||[];
  let pos=0;
  const peek=()=>tokens[pos];
  const consume=()=>tokens[pos++];
  const parseExpr=()=>parseAddSub();
  function parseAddSub() {
    let l=parseMulDiv();
    while (peek()==='+' || peek()==='-') { const op=consume(); const r=parseMulDiv(); l=op==='+'?l+r:l-r; }
    return l;
  }
  function parseMulDiv() {
    let l=parsePow();
    while (peek()==='*'||peek()==='/'||peek()==='%') { const op=consume(); const r=parsePow(); l=op==='*'?l*r:op==='/'?l/r:l%r; }
    return l;
  }
  function parsePow() { let l=parseUnary(); while(peek()==='**'){consume();l=Math.pow(l,parseUnary());} return l; }
  function parseUnary() { if(peek()==='-'){consume();return -parsePrimary();} if(peek()==='+'){consume();return parsePrimary();} return parsePrimary(); }
  function parsePrimary() { if(peek()==='('){consume();const v=parseExpr();consume();return v;} const t=consume(); return t!==undefined?parseFloat(t):0; }
  try { return { _engine: 'real',result:parseExpr(),expression:input.expression}; }
  catch(e) { return { _engine: 'real',error:'Parse error: '+e.message}; }
}

function mathStatistics(input) {
  const nums=(input.numbers||[]).map(Number).filter(n=>!isNaN(n));
  if (!nums.length) return { _engine: 'real',error:'No numbers provided'};
  const sorted=[...nums].sort((a,b)=>a-b);
  const mean=nums.reduce((a,b)=>a+b,0)/nums.length;
  const median=nums.length%2===0?(sorted[nums.length/2-1]+sorted[nums.length/2])/2:sorted[Math.floor(nums.length/2)];
  const fq={};for(const n of nums)fq[n]=(fq[n]||0)+1;
  const maxF=Math.max(...Object.values(fq));
  const mode=Object.keys(fq).filter(k=>fq[k]===maxF).map(Number);
  const variance=nums.reduce((s,n)=>s+Math.pow(n-mean,2),0)/nums.length;
  return { _engine: 'real',mean:Math.round(mean*1e10)/1e10,median,mode,stddev:Math.round(Math.sqrt(variance)*1e10)/1e10,variance:Math.round(variance*1e10)/1e10,min:sorted[0],max:sorted[sorted.length-1],sum:nums.reduce((a,b)=>a+b,0),count:nums.length,range:sorted[sorted.length-1]-sorted[0]};
}

function mathPercentile(input) {
  const {numbers=[],percentile=50}=input;
  const sorted=[...numbers].map(Number).sort((a,b)=>a-b);
  if (!sorted.length) return { _engine: 'real',error:'No numbers'};
  const idx=(percentile/100)*(sorted.length-1);
  const lo=Math.floor(idx),hi=Math.ceil(idx);
  const value=lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);
  return { _engine: 'real',percentile,value,index:idx};
}

function mathHistogram(input) {
  const {numbers=[],bins=10}=input;
  const nums=numbers.map(Number).filter(n=>!isNaN(n));
  if (!nums.length) return { _engine: 'real',error:'No numbers'};
  const min=Math.min(...nums),max=Math.max(...nums);
  const step=(max-min)/bins;
  const histogram=Array.from({length:bins},(_,i)=>({range:[Math.round((min+i*step)*1e6)/1e6,Math.round((min+(i+1)*step)*1e6)/1e6],count:0}));
  for (const n of nums) { const idx=Math.min(Math.floor((n-min)/(step||1)),bins-1); histogram[idx].count++; }
  return { _engine: 'real',histogram,bins,min,max,total:nums.length};
}

const CURRENCY_RATES={USD:1,EUR:0.92,GBP:0.79,JPY:149.5,CAD:1.36,AUD:1.53,CHF:0.89,CNY:7.24,INR:83.1,MXN:17.15,BRL:4.97,KRW:1325,SGD:1.34,NZD:1.63,SEK:10.42,NOK:10.56,DKK:6.88,HKD:7.82,ZAR:18.63};

function mathCurrencyConvert(input) {
  const {amount=1,from='USD',to='EUR'}=input;
  const f=CURRENCY_RATES[from.toUpperCase()],t=CURRENCY_RATES[to.toUpperCase()];
  if (!f) return { _engine: 'real',error:'Unknown currency: '+from};
  if (!t) return { _engine: 'real',error:'Unknown currency: '+to};
  return { _engine: 'real',amount,from:from.toUpperCase(),to:to.toUpperCase(),result:Math.round((amount/f)*t*100)/100,note:'Static rates for reference only.'};
}

const UNITS={
  length:{m:1,km:0.001,cm:100,mm:1000,mi:0.000621371,yd:1.09361,ft:3.28084,in:39.3701},
  weight:{kg:1,g:1000,lb:2.20462,oz:35.274,t:0.001,st:0.157473},
  volume:{l:1,ml:1000,gal:0.264172,qt:1.05669,pt:2.11338,cup:4.22675,floz:33.814,tsp:202.884,tbsp:67.628},
  speed:{'km/h':1,mph:0.621371,'m/s':0.277778,knot:0.539957,'ft/s':0.911344},
  data:{B:1,KB:1/1024,MB:1/1048576,GB:1/1073741824,TB:1/1099511627776,bit:8,Kbit:8/1024,Mbit:8/1048576},
};

function mathUnitConvert(input) {
  const {value=0,from='',to='',type=''}=input;
  if (type==='temperature'||['C','F','K'].includes(from)) {
    let c; if(from==='C')c=value; else if(from==='F')c=(value-32)*5/9; else if(from==='K')c=value-273.15; else return { _engine: 'real',error:'Unknown temp unit: '+from};
    let r; if(to==='C')r=c; else if(to==='F')r=c*9/5+32; else if(to==='K')r=c+273.15; else return { _engine: 'real',error:'Unknown target temp unit: '+to};
    return { _engine: 'real',value,from,to,result:Math.round(r*1e8)/1e8,category:'temperature'};
  }
  for (const [cat,map] of Object.entries(UNITS)) {
    if (from in map && to in map) return { _engine: 'real',value,from,to,result:Math.round((value/map[from])*map[to]*1e10)/1e10,category:cat};
  }
  return { _engine: 'real',error:'Cannot convert '+from+' to '+to};
}

function mathColorConvert(input) {
  const {color='',from='hex'}=input;
  let r,g,b;
  if (from==='hex') {
    const hex=color.replace('#','');
    r=parseInt(hex.slice(0,2),16); g=parseInt(hex.slice(2,4),16); b=parseInt(hex.slice(4,6),16);
  } else if (from==='rgb') {
    const m=color.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m) return { _engine: 'real',error:'Invalid RGB'};
    r=parseInt(m[1]);g=parseInt(m[2]);b=parseInt(m[3]);
  } else if (from==='hsl') {
    const m=color.match(/(\d+\.?\d*)[,\s]+(\d+\.?\d*)%?[,\s]+(\d+\.?\d*)%?/);
    if (!m) return { _engine: 'real',error:'Invalid HSL'};
    const h=parseFloat(m[1])/360,s=parseFloat(m[2])/100,l=parseFloat(m[3])/100;
    const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
    const h2r=(p2,q2,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p2+(q2-p2)*6*t;if(t<1/2)return q2;if(t<2/3)return p2+(q2-p2)*(2/3-t)*6;return p2;};
    r=Math.round(h2r(p,q,h+1/3)*255);g=Math.round(h2r(p,q,h)*255);b=Math.round(h2r(p,q,h-1/3)*255);
  } else return { _engine: 'real',error:'from must be hex, rgb, or hsl'};
  if (isNaN(r)||isNaN(g)||isNaN(b)) return { _engine: 'real',error:'Failed to parse color'};
  const hex='#'+[r,g,b].map(c=>c.toString(16).padStart(2,'0')).join('');
  const rn=r/255,gn=g/255,bn=b/255;
  const max=Math.max(rn,gn,bn),min=Math.min(rn,gn,bn),lv=(max+min)/2;
  let h=0,s=0;
  if (max!==min) {
    const d=max-min; s=lv>0.5?d/(2-max-min):d/(max+min);
    if(max===rn)h=((gn-bn)/d+(gn<bn?6:0))/6;
    else if(max===gn)h=((bn-rn)/d+2)/6;
    else h=((rn-gn)/d+4)/6;
  }
  return { _engine: 'real',hex,rgb:{r,g,b},hsl:{h:Math.round(h*360),s:Math.round(s*100),l:Math.round(lv*100)},css:{hex,rgb:'rgb('+r+','+g+','+b+')',hsl:'hsl('+Math.round(h*360)+','+Math.round(s*100)+'%,'+Math.round(lv*100)+'%)'}};
}

function mathNumberFormat(input) {
  const {number=0,style='decimal',currency='USD',locale='en-US',decimals}=input;
  try {
    const opts={style};
    if (style==='currency') opts.currency=currency;
    if (decimals!==undefined) {opts.minimumFractionDigits=decimals;opts.maximumFractionDigits=decimals;}
    return { _engine: 'real',result:new Intl.NumberFormat(locale,opts).format(number)};
  } catch(e) { return { _engine: 'real',error:e.message}; }
}

function mathCompoundInterest(input) {
  const {principal=1000,rate=0.05,years=1,n=12}=input;
  const amount=principal*Math.pow(1+rate/n,n*years);
  return { _engine: 'real',principal,rate,years,compoundsPerYear:n,finalAmount:Math.round(amount*100)/100,interestEarned:Math.round((amount-principal)*100)/100};
}

function mathLoanPayment(input) {
  const {principal=100000,annualRate=0.05,years=30}=input;
  const r=annualRate/12,n=years*12;
  const pmt=r===0?principal/n:principal*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
  return { _engine: 'real',principal,annualRate,years,monthlyPayment:Math.round(pmt*100)/100,totalPayment:Math.round(pmt*n*100)/100,totalInterest:Math.round((pmt*n-principal)*100)/100};
}

function mathRoiCalculate(input) {
  const {cost=0,revenue=0}=input;
  const profit=revenue-cost;
  const roi=cost!==0?(profit/cost)*100:0;
  return { _engine: 'real',cost,revenue,profit:Math.round(profit*100)/100,roi:Math.round(roi*100)/100,roiFormatted:Math.round(roi*100)/100+'%'};
}

function mathPercentageChange(input) {
  const {from=0,to=0}=input;
  const change=from!==0?((to-from)/Math.abs(from))*100:0;
  return { _engine: 'real',from,to,change:Math.round(change*100)/100,direction:change>0?'increase':change<0?'decrease':'no change'};
}

function mathFibonacci(input) {
  const {n=10}=input;
  if (n<=0) return { _engine: 'real',sequence:[]};
  const s=[0,1];
  for (let i=2;i<n;i++) s.push(s[i-1]+s[i-2]);
  return { _engine: 'real',sequence:s.slice(0,n),n};
}

function mathPrimeCheck(input) {
  const n=Math.abs(parseInt(input.n||input.number||0));
  if (n<2) return { _engine: 'real',number:n,isPrime:false};
  if (n===2) return { _engine: 'real',number:n,isPrime:true};
  if (n%2===0) return { _engine: 'real',number:n,isPrime:false};
  for (let i=3;i<=Math.sqrt(n);i+=2) if (n%i===0) return { _engine: 'real',number:n,isPrime:false,factor:i};
  return { _engine: 'real',number:n,isPrime:true};
}

function mathGcd(input) {
  let a=Math.abs(input.a||0),b=Math.abs(input.b||0);
  while(b){const t=b;b=a%b;a=t;}
  return { _engine: 'real',a:input.a,b:input.b,gcd:a};
}

function mathLcm(input) {
  const {a=0,b=0}=input;
  let ga=Math.abs(a),gb=Math.abs(b);
  const oa=ga,ob=gb;
  while(gb){const t=gb;gb=ga%gb;ga=t;}
  return { _engine: 'real',a,b,gcd:ga,lcm:ga===0?0:(oa/ga)*ob};
}

function mathBaseConvert(input) {
  const {value='0',from=10,to=2}=input;
  try {
    const d=parseInt(String(value),from);
    if (isNaN(d)) return { _engine: 'real',error:'Invalid number for given base'};
    return { _engine: 'real',input:value,from,to,result:d.toString(to),decimal:d};
  } catch(e) { return { _engine: 'real',error:e.message}; }
}

// ─── DATE & TIME ────────────────────────────────────────────────────────────

function dateParse(input) {
  const d=new Date(input.date);
  if (isNaN(d.getTime())) return { _engine: 'real',error:'Invalid date'};
  return { _engine: 'real',iso:d.toISOString(),unix:Math.floor(d.getTime()/1000),year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate(),hour:d.getHours(),minute:d.getMinutes(),second:d.getSeconds(),weekday:d.toLocaleDateString('en-US',{weekday:'long'})};
}

function dateFormat(input) {
  const {date,pattern='YYYY-MM-DD'}=input;
  const d=new Date(date);
  if (isNaN(d.getTime())) return { _engine: 'real',error:'Invalid date'};
  const pad=n=>String(n).padStart(2,'0');
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const result=pattern.replace('YYYY',d.getFullYear()).replace('YY',String(d.getFullYear()).slice(-2)).replace('MMMM',months[d.getMonth()]).replace('MMM',months[d.getMonth()].slice(0,3)).replace('MM',pad(d.getMonth()+1)).replace(/\bM\b/,d.getMonth()+1).replace('DD',pad(d.getDate())).replace(/\bD\b/,d.getDate()).replace('dddd',days[d.getDay()]).replace('ddd',days[d.getDay()].slice(0,3)).replace('HH',pad(d.getHours())).replace(/\bH\b/,d.getHours()).replace('hh',pad(d.getHours()%12||12)).replace(/\bh\b/,d.getHours()%12||12).replace('mm',pad(d.getMinutes())).replace('ss',pad(d.getSeconds())).replace('A',d.getHours()<12?'AM':'PM').replace('a',d.getHours()<12?'am':'pm');
  return { _engine: 'real',result,pattern,date};
}

function dateDiff(input) {
  const a=new Date(input.from),b=new Date(input.to);
  if (isNaN(a.getTime())||isNaN(b.getTime())) return { _engine: 'real',error:'Invalid date'};
  const ms=Math.abs(b-a);
  return { _engine: 'real',milliseconds:ms,seconds:Math.floor(ms/1000),minutes:Math.floor(ms/60000),hours:Math.floor(ms/3600000),days:Math.floor(ms/86400000),weeks:Math.floor(ms/604800000),months:Math.abs((b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth())),years:Math.abs(b.getFullYear()-a.getFullYear()),direction:b>=a?'future':'past'};
}

function dateAdd(input) {
  const {date,amount=0,unit='days'}=input;
  const d=new Date(date);
  if (isNaN(d.getTime())) return { _engine: 'real',error:'Invalid date'};
  const ms={milliseconds:1,seconds:1000,minutes:60000,hours:3600000,days:86400000,weeks:604800000};
  if (ms[unit]!==undefined) d.setTime(d.getTime()+amount*ms[unit]);
  else if (unit==='months') d.setMonth(d.getMonth()+amount);
  else if (unit==='years') d.setFullYear(d.getFullYear()+amount);
  else return { _engine: 'real',error:'Unknown unit: '+unit};
  return { _engine: 'real',result:d.toISOString(),original:date,amount,unit};
}

function dateSubtract(input) { return dateAdd(Object.assign({},input,{amount:-(input.amount||0)})); }

function dateTimezoneConvert(input) {
  const {date,fromOffset=0,toOffset=0}=input;
  const d=new Date(date);
  if (isNaN(d.getTime())) return { _engine: 'real',error:'Invalid date'};
  return { _engine: 'real',original:d.toISOString(),converted:new Date(d.getTime()+(toOffset-fromOffset)*60000).toISOString(),fromOffset,toOffset};
}

function dateWeekday(input) {
  const d=new Date(input.date);
  if (isNaN(d.getTime())) return { _engine: 'real',error:'Invalid date'};
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return { _engine: 'real',date:d.toISOString(),weekday:days[d.getDay()],weekdayIndex:d.getDay(),isWeekend:d.getDay()===0||d.getDay()===6};
}

function dateIsBusinessDay(input) {
  const d=new Date(input.date);
  if (isNaN(d.getTime())) return { _engine: 'real',error:'Invalid date'};
  const day=d.getDay();
  return { _engine: 'real',date:d.toISOString(),isBusinessDay:day>=1&&day<=5,day:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]};
}

function dateBusinessDaysBetween(input) {
  const a=new Date(input.from),b=new Date(input.to);
  if (isNaN(a.getTime())||isNaN(b.getTime())) return { _engine: 'real',error:'Invalid date'};
  let count=0; const cur=new Date(a); cur.setHours(0,0,0,0); const end=new Date(b); end.setHours(0,0,0,0);
  while (cur<end) { const day=cur.getDay(); if(day>=1&&day<=5)count++; cur.setDate(cur.getDate()+1); }
  return { _engine: 'real',from:input.from,to:input.to,businessDays:count};
}

const MONTH_NAMES=['','January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function parseCronField(val,type) {
  if(val==='*') return 'every '+type;
  if(val.includes('/')) { const[,step]=val.split('/'); return 'every '+step+' '+type+'s'; }
  if(val.includes('-')) return 'from '+val.replace('-',' to ')+' '+type;
  if(val.includes(',')) return 'at '+type+'s '+val;
  if(type==='month') return MONTH_NAMES[parseInt(val)]||val;
  if(type==='dayOfWeek') return DAY_NAMES[parseInt(val)]||val;
  return 'at '+type+' '+val;
}

function dateCronParse(input) {
  const {cron='* * * * *'}=input;
  const parts=cron.trim().split(/\s+/);
  if (parts.length<5) return { _engine: 'real',error:'Cron must have 5 fields'};
  const [min,hr,dom,mon,dow]=parts;
  return { _engine: 'real',cron,fields:{minute:min,hour:hr,dayOfMonth:dom,month:mon,dayOfWeek:dow},human:[parseCronField(min,'minute'),parseCronField(hr,'hour'),parseCronField(dom,'day of month'),parseCronField(mon,'month'),parseCronField(dow,'day of week')].join(', ')};
}

function dateCronNext(input) {
  const {cron='* * * * *',n=5}=input;
  const parts=cron.trim().split(/\s+/);
  if (parts.length<5) return { _engine: 'real',error:'Cron must have 5 fields'};
  const [mF,hF,dF,moF,dwF]=parts;
  const matches=(val,f)=>{
    if(f==='*')return true;
    if(f.includes('/')){const[s,st]=f.split('/');const base=s==='*'?0:parseInt(s);return(val-base)%parseInt(st)===0&&val>=base;}
    if(f.includes('-')){const[lo,hi]=f.split('-').map(Number);return val>=lo&&val<=hi;}
    if(f.includes(','))return f.split(',').map(Number).includes(val);
    return parseInt(f)===val;
  };
  const results=[];
  const d=new Date(); d.setSeconds(0,0); d.setMinutes(d.getMinutes()+1);
  let iter=0;
  while(results.length<n&&iter<500000){
    iter++;
    if(matches(d.getMonth()+1,moF)&&matches(d.getDate(),dF)&&matches(d.getDay(),dwF)&&matches(d.getHours(),hF)&&matches(d.getMinutes(),mF))results.push(d.toISOString());
    d.setMinutes(d.getMinutes()+1);
  }
  return { _engine: 'real',cron,next:results};
}

function dateUnixToIso(input) { const d=new Date(input.unix*1000); return { _engine: 'real',unix:input.unix,iso:d.toISOString(),readable:d.toString()}; }
function dateIsoToUnix(input) { const d=new Date(input.date); if(isNaN(d.getTime()))return{ _engine: 'real',error:'Invalid date'}; return { _engine: 'real',date:input.date,unix:Math.floor(d.getTime()/1000),ms:d.getTime()}; }

function dateRelative(input) {
  const {timestamp,from:ft}=input;
  const base=ft?new Date(ft):new Date();
  const target=new Date(timestamp);
  if(isNaN(target.getTime()))return{ _engine: 'real',error:'Invalid timestamp'};
  const diff=target.getTime()-base.getTime(),abs=Math.abs(diff),past=diff<0;
  let text;
  const fmt=(n,u)=>past?n+' '+u+(n>1?'s':'')+' ago':'in '+n+' '+u+(n>1?'s':'');
  if(abs<60000)text='just now';
  else if(abs<3600000)text=fmt(Math.round(abs/60000),'minute');
  else if(abs<86400000)text=fmt(Math.round(abs/3600000),'hour');
  else if(abs<2592000000)text=fmt(Math.round(abs/86400000),'day');
  else if(abs<31536000000)text=fmt(Math.round(abs/2592000000),'month');
  else text=fmt(Math.round(abs/31536000000),'year');
  return { _engine: 'real',timestamp,relative:text,diffMs:diff};
}

// ─── NETWORK ────────────────────────────────────────────────────────────────

async function netDnsLookup(input) {
  const {hostname}=input;
  try {
    const [v4,v6]=await Promise.allSettled([dnsResolve4(hostname),dnsResolve6(hostname)]);
    return { _engine: 'real',hostname,A:v4.status==='fulfilled'?v4.value:[],AAAA:v6.status==='fulfilled'?v6.value:[]};
  } catch(e) { return { _engine: 'real',error:e.message}; }
}

async function netDnsMx(input) {
  const {hostname}=input;
  try { const r=await dnsResolveMx(hostname); return { _engine: 'real',hostname,mx:r.sort((a,b)=>a.priority-b.priority)}; }
  catch(e) { return { _engine: 'real',hostname,mx:[],error:e.message}; }
}

async function netDnsTxt(input) {
  const {hostname}=input;
  try { const r=await dnsResolveTxt(hostname); return { _engine: 'real',hostname,txt:r.map(x=>x.join(''))}; }
  catch(e) { return { _engine: 'real',hostname,txt:[],error:e.message}; }
}

async function netDnsNs(input) {
  const {hostname}=input;
  try { return { _engine: 'real',hostname,ns:await dnsResolveNs(hostname)}; }
  catch(e) { return { _engine: 'real',hostname,ns:[],error:e.message}; }
}

function httpHead(urlStr,followRedirects) {
  followRedirects=followRedirects||false;
  return new Promise((resolve,reject)=>{
    const chain=[urlStr]; let redirects=0;
    const doReq=target=>{
      let p; try{p=new URL(target);}catch(e){return reject(new Error('Invalid URL'));}
      const lib=p.protocol==='https:'?https:http;
      const req=lib.request({hostname:p.hostname,port:p.port||(p.protocol==='https:'?443:80),path:p.pathname+p.search,method:'HEAD',headers:{'User-Agent':'Slopshop/1.0'},timeout:8000},(res)=>{
        if(followRedirects&&[301,302,303,307,308].includes(res.statusCode)&&res.headers.location&&redirects<10){
          redirects++;
          let next=res.headers.location;
          if(!next.startsWith('http'))next=p.protocol+'//'+p.host+next;
          chain.push(next); res.resume(); doReq(next);
        } else resolve({statusCode:res.statusCode,headers:res.headers,finalUrl:target,chain});
      });
      req.on('error',reject);
      req.on('timeout',()=>{req.destroy();reject(new Error('Timeout'));});
      req.end();
    };
    doReq(urlStr);
  });
}

async function netUrlStatus(input) {
  const {url:u}=input;
  try { const r=await httpHead(u); return { _engine: 'real',url:u,statusCode:r.statusCode,contentType:r.headers['content-type'],server:r.headers['server']}; }
  catch(e) { return { _engine: 'real',url:u,error:e.message}; }
}

async function netUrlHeaders(input) {
  const {url:u}=input;
  try { const r=await httpHead(u); return { _engine: 'real',url:u,statusCode:r.statusCode,headers:r.headers}; }
  catch(e) { return { _engine: 'real',url:u,error:e.message}; }
}

async function netUrlRedirectChain(input) {
  const {url:u}=input;
  try { const r=await httpHead(u,true); return { _engine: 'real',url:u,finalUrl:r.finalUrl,chain:r.chain,redirects:r.chain.length-1,statusCode:r.statusCode}; }
  catch(e) { return { _engine: 'real',url:u,error:e.message}; }
}

function netIpValidate(input) {
  const {ip=''}=input;
  const v4=/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)&&ip.split('.').every(n=>parseInt(n)<=255);
  const v6=/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(ip)||ip==='::1';
  return { _engine: 'real',ip,valid:v4||v6,version:v4?4:v6?6:null};
}

function netIpInfo(input) {
  const {ip=''}=input;
  const v4=/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)&&ip.split('.').every(n=>parseInt(n)<=255);
  if(v4){
    const o=ip.split('.').map(Number);
    const priv=o[0]===10||(o[0]===172&&o[1]>=16&&o[1]<=31)||(o[0]===192&&o[1]===168)||o[0]===127;
    let cls='E';if(o[0]<128)cls='A';else if(o[0]<192)cls='B';else if(o[0]<224)cls='C';else if(o[0]<240)cls='D';
    return { _engine: 'real',ip,version:4,private:priv,public:!priv,loopback:o[0]===127,class:cls};
  }
  const priv6=ip.startsWith('fc')||ip.startsWith('fd')||ip==='::1';
  return { _engine: 'real',ip,version:6,private:priv6,public:!priv6,loopback:ip==='::1'};
}

function netCidrContains(input) {
  const {ip='',cidr=''}=input;
  const si=cidr.lastIndexOf('/');
  if(si===-1)return{ _engine: 'real',error:'Invalid CIDR'};
  const base=cidr.slice(0,si),bits=parseInt(cidr.slice(si+1));
  const toInt=s=>s.split('.').reduce((a,o)=>((a<<8)|parseInt(o))>>>0,0);
  try {
    const mask=bits===0?0:(0xFFFFFFFF<<(32-bits))>>>0;
    return { _engine: 'real',ip,cidr,contains:(toInt(ip)&mask)===(toInt(base)&mask)};
  } catch(e) { return { _engine: 'real',error:e.message}; }
}

async function netEmailValidate(input) {
  const {email=''}=input;
  const fmt=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if(!fmt)return{ _engine: 'real',email,valid:false,reason:'Invalid format'};
  try {
    const mx=await dnsResolveMx(email.split('@')[1]);
    return { _engine: 'real',email,valid:true,formatValid:true,mxValid:mx.length>0,mx:mx.slice(0,3)};
  } catch(e) { return { _engine: 'real',email,valid:false,formatValid:true,mxValid:false,reason:'No MX records'}; }
}

// ─── GENERATE ───────────────────────────────────────────────────────────────

function genQrData(input) {
  const {text=''}=input;
  const size=21;
  const grid=Array.from({length:size},()=>Array(size).fill(0));
  const fp=(r,c)=>{for(let i=0;i<7;i++)for(let j=0;j<7;j++)if(i===0||i===6||j===0||j===6||(i>=2&&i<=4&&j>=2&&j<=4))grid[r+i][c+j]=1;};
  fp(0,0);fp(0,14);fp(14,0);
  for(let i=8;i<13;i++){grid[6][i]=i%2===0?1:0;grid[i][6]=i%2===0?1:0;}
  const hash=crypto.createHash('sha256').update(text).digest();
  let bit=0;
  for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(grid[r][c]===0){grid[r][c]=(hash[Math.floor(bit/8)]>>(7-bit%8))&1;bit=(bit+1)%(hash.length*8);}
  const ascii=grid.map(row=>row.map(c=>c?'\u2588\u2588':'  ').join('')).join('\n');
  return { _engine: 'real',text,matrix:grid,ascii,size:size+'x'+size,note:'Visual representation only; not scannable'};
}

const FN=['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William','Barbara','David','Susan','Richard','Jessica','Joseph','Sarah','Thomas','Karen','Charles','Lisa','Christopher','Nancy','Daniel','Betty','Matthew','Margaret','Anthony','Sandra','Mark','Ashley','Donald','Dorothy','Steven','Kimberly','Paul','Emily','Andrew','Donna','Joshua','Michelle','Kenneth','Carol','Kevin','Amanda','Brian','Melissa','George','Deborah','Timothy','Stephanie'];
const LN=['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores'];
const CP1=['Alpha','Beta','Global','National','United','Premier','Advanced','Pacific','Atlantic','Digital','Tech','Smart','Blue','Green','Red'];
const CP2=['Solutions','Systems','Group','Corp','Industries','Technologies','Partners','Services','Analytics','Consulting','Ventures'];
const STN=['Main','Oak','Maple','Elm','Cedar','Pine','Washington','Park','Lake','Hill','River','Forest','Meadow','Valley','Ridge'];
const STT=['St','Ave','Blvd','Dr','Ln','Rd','Way','Ct','Pl'];
const CITIES=['Springfield','Riverside','Madison','Georgetown','Franklin','Clinton','Salem','Greenville','Bristol','Fairview'];
const STATES=['CA','TX','FL','NY','PA','IL','OH','GA','NC','MI','NJ','VA','WA','AZ','MA','TN','IN','MO','MD','WI'];
const rnd=arr=>arr[crypto.randomBytes(2).readUInt16BE(0)%arr.length];
const rndInt=(min,max)=>min+(crypto.randomBytes(4).readUInt32BE(0)%(max-min+1));

function genFakeName() { const f=rnd(FN),l=rnd(LN); return { _engine: 'real',firstName:f,lastName:l,fullName:f+' '+l}; }
function genFakeEmail() { const f=rnd(FN).toLowerCase(),l=rnd(LN).toLowerCase(),n=rndInt(0,99),s=rnd(['.','_','']); return { _engine: 'real',email:f+s+l+(n>50?n:'')+'@'+rnd(['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com'])}; }
function genFakeCompany() { return { _engine: 'real',company:rnd(CP1)+' '+rnd(CP2)}; }
function genFakeAddress() { const n=rndInt(100,9999),st=rnd(STN)+' '+rnd(STT),city=rnd(CITIES),state=rnd(STATES),zip=String(rndInt(10000,99999)); return { _engine: 'real',streetNumber:n,street:st,address:n+' '+st,city,state,zip,full:n+' '+st+', '+city+', '+state+' '+zip}; }
function genFakePhone() { const a=rndInt(200,999),p=rndInt(200,999),l=rndInt(1000,9999); return { _engine: 'real',phone:'('+a+') '+p+'-'+l,e164:'+1'+a+p+l}; }

function luhn(partial) {
  const d=partial.split('').map(Number); let s=0;
  for(let i=d.length-1;i>=0;i--){let x=d[i];if((d.length-i)%2===0){x*=2;if(x>9)x-=9;}s+=x;}
  return partial+((10-s%10)%10);
}

function genFakeCreditCard(input) {
  const {type='visa'}=input;
  const pre={visa:'4',mastercard:'5'+rndInt(1,5),amex:'3'+rnd(['4','7']),discover:'6011'};
  const prefix=pre[type]||pre.visa,length=type==='amex'?15:16;
  let partial=prefix;
  while(partial.length<length-1)partial+=rndInt(0,9);
  const number=luhn(partial);
  return { _engine: 'real',number,type,expiry:String(rndInt(1,12)).padStart(2,'0')+'/'+(new Date().getFullYear()+rndInt(1,5)),cvv:String(rndInt(100,999)),note:'FAKE - testing only'};
}

function genFakeUuid() { return { _engine: 'real',uuid:crypto.randomUUID()}; }

function genFakeDate(input) {
  const {from='1970-01-01',to='2023-12-31'}=input;
  const s=new Date(from).getTime(),e=new Date(to).getTime();
  return { _engine: 'real',date:new Date(s+(crypto.randomBytes(4).readUInt32BE(0)/0xFFFFFFFF)*(e-s)).toISOString().slice(0,10)};
}

const WB='the quick brown fox jumps over lazy dog sun shines bright sky blue green tree wind blows river flows mountain tall valley deep ocean wide bird sings flowers bloom rain falls star twinkles moon glows cloud drifts stone cold warm breeze gentle waves crash shore'.split(' ');
function genFakeSentence(input) { const {words=8}=input; const ws=Array.from({length:words},()=>rnd(WB)); ws[0]=ws[0][0].toUpperCase()+ws[0].slice(1); return { _engine: 'real',sentence:ws.join(' ')+'.'}; }
function genFakeParagraph(input) { const {sentences=5}=input; return { _engine: 'real',paragraph:Array.from({length:sentences},()=>genFakeSentence({words:rndInt(6,14)}).sentence).join(' ')}; }

function genFakeUser() {
  const n=genFakeName(),e=genFakeEmail(),co=genFakeCompany(),a=genFakeAddress(),ph=genFakePhone();
  return { _engine: 'real',id:crypto.randomUUID(),firstName:n.firstName,lastName:n.lastName,fullName:n.fullName,email:e.email,company:co.company,phone:ph.phone,address:a.full,username:n.firstName.toLowerCase()+rndInt(10,99),avatar:'https://i.pravatar.cc/150?u='+crypto.randomUUID(),birthdate:genFakeDate({from:'1950-01-01',to:'2000-12-31'}).date,createdAt:new Date().toISOString()};
}

function genColorPalette(input) {
  const {color='#3498db',count=5}=input;
  const c=mathColorConvert({color,from:'hex'});
  if(c.error)return{ _engine: 'real',error:c.error};
  const {h,s,l}=c.hsl;
  return { _engine: 'real',base:color,palette:Array.from({length:count},(_,i)=>{const nh=(h+(360/count)*i)%360;const x=mathColorConvert({color:nh+' '+s+' '+l,from:'hsl'});return{ _engine: 'real',hex:x.hex,hsl:x.hsl,rgb:x.rgb};})};
}

function genSlug(input) { return textSlugify(input); }
function genShortId(input) { const {length=8}=input; const chars='ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; const b=crypto.randomBytes(length); let id=''; for(let i=0;i<length;i++)id+=chars[b[i]%chars.length]; return { _engine: 'real',id,length}; }

// ─── CODE & DEV UTILITIES ───────────────────────────────────────────────────

function tsType(val,indent) {
  indent=indent||0;
  const pad=' '.repeat(indent),inner=' '.repeat(indent+2);
  if(val===null)return 'null';
  if(Array.isArray(val))return val.length>0?tsType(val[0],indent)+'[]':'unknown[]';
  if(typeof val==='object'){const f=Object.keys(val).map(k=>inner+k+': '+tsType(val[k],indent+2)+';').join('\n');return '{\n'+f+'\n'+pad+'}';}
  if(typeof val==='string')return 'string';
  if(typeof val==='number')return 'number';
  if(typeof val==='boolean')return 'boolean';
  return 'unknown';
}

function codeJsonToTypescript(input) {
  try {
    const obj=typeof input.data==='object'&&input.data!==null?input.data:JSON.parse(input.text||'{}');
    const name=input.name||'GeneratedInterface';
    return { _engine: 'real',typescript:'interface '+name+' {\n'+Object.keys(obj).map(k=>'  '+k+': '+tsType(obj[k],2)+';').join('\n')+'\n}'};
  } catch(e){return{ _engine: 'real',error:e.message};}
}

function pyType(val) {
  if(val===null)return 'Optional[Any]';
  if(Array.isArray(val))return val.length>0?'List['+pyType(val[0])+']':'List[Any]';
  if(typeof val==='object')return 'Dict[str, Any]';
  if(typeof val==='string')return 'str';
  if(typeof val==='number')return Number.isInteger(val)?'int':'float';
  if(typeof val==='boolean')return 'bool';
  return 'Any';
}

function codeJsonToPythonClass(input) {
  try {
    const obj=typeof input.data==='object'&&input.data!==null?input.data:JSON.parse(input.text||'{}');
    const name=input.name||'GeneratedClass';
    return { _engine: 'real',python:'from dataclasses import dataclass\nfrom typing import Any, Dict, List, Optional\n\n@dataclass\nclass '+name+':\n'+Object.keys(obj).map(k=>'  '+k+': '+pyType(obj[k])).join('\n')};
  } catch(e){return{ _engine: 'real',error:e.message};}
}

function goType(val) {
  if(val===null)return 'interface{}';
  if(Array.isArray(val))return val.length>0?'[]'+goType(val[0]):'[]interface{}';
  if(typeof val==='object'){const f=Object.keys(val).map(k=>'\t'+(k[0].toUpperCase()+k.slice(1))+' '+goType(val[k])+' `json:"'+k+'"`').join('\n');return 'struct {\n'+f+'\n}';}
  if(typeof val==='string')return 'string';
  if(typeof val==='number')return Number.isInteger(val)?'int64':'float64';
  if(typeof val==='boolean')return 'bool';
  return 'interface{}';
}

function codeJsonToGoStruct(input) {
  try {
    const obj=typeof input.data==='object'&&input.data!==null?input.data:JSON.parse(input.text||'{}');
    const name=input.name||'GeneratedStruct';
    return { _engine: 'real',go:'type '+name+' struct {\n'+Object.keys(obj).map(k=>'\t'+(k[0].toUpperCase()+k.slice(1))+' '+goType(obj[k])+' `json:"'+k+'"`').join('\n')+'\n}'};
  } catch(e){return{ _engine: 'real',error:e.message};}
}

function codeSqlFormat(input) {
  const {sql=''}=input;
  const kws=['SELECT','FROM','WHERE','LEFT JOIN','RIGHT JOIN','INNER JOIN','OUTER JOIN','CROSS JOIN','JOIN','ON','GROUP BY','ORDER BY','HAVING','LIMIT','OFFSET','INSERT INTO','VALUES','UPDATE','SET','DELETE FROM','CREATE TABLE','DROP TABLE','ALTER TABLE','UNION ALL','UNION','DISTINCT','AS','CASE','WHEN','THEN','ELSE','END','AND','OR','NOT','IN','EXISTS','BETWEEN','LIKE','IS NULL','IS NOT NULL'];
  let f=sql.replace(/\s+/g,' ').trim();
  for(const kw of kws) f=f.replace(new RegExp('\\b'+kw.replace(/ /g,'\\s+')+'\\b','gi'),'\n'+kw);
  return { _engine: 'real',sql:f.split('\n').map(l=>l.trim()).filter(l=>l).join('\n')};
}

function codeCronExplain(input) { return dateCronParse(input); }

function codeRegexExplain(input) {
  const {pattern=''}=input;
  const rules=[
    [/^\^/,'start of string'],[/^\$/,'end of string'],
    [/^\\d/,'digit (0-9)'],[/^\\D/,'non-digit'],[/^\\w/,'word character'],[/^\\W/,'non-word character'],
    [/^\\s/,'whitespace'],[/^\\S/,'non-whitespace'],[/^\\b/,'word boundary'],[/^\\n/,'newline'],[/^\\t/,'tab'],
    [/^\\(.)/,m=>'escaped: '+m[1]],
    [/^\[([^\]]+)\]/,m=>'character class ['+m[1]+']'],
    [/^\((?:\?:)?([^)]*)\)/,m=>'group ('+m[1]+')'],
    [/^\.\*\?/,'any char 0+ (lazy)'],[/^\.\+\?/,'any char 1+ (lazy)'],[/^\.\*/,'any char 0+ (greedy)'],[/^\.\+/,'any char 1+ (greedy)'],
    [/^\?/,'optional'],[/^\*/,'0 or more'],[/^\+/,'1 or more'],
    [/^\{(\d+),(\d+)\}/,m=>'between '+m[1]+' and '+m[2]+' times'],
    [/^\{(\d+)\}/,m=>'exactly '+m[1]+' time(s)'],
    [/^\./,'any character'],[/^\|/,'OR'],
  ];
  const parts=[]; let pos=0;
  while(pos<pattern.length){
    let matched=false;
    for(const[re,desc]of rules){const m=pattern.slice(pos).match(re);if(m){parts.push(typeof desc==='function'?desc(m):desc);pos+=m[0].length;matched=true;break;}}
    if(!matched){parts.push('literal "'+pattern[pos]+'"');pos++;}
  }
  return { _engine: 'real',pattern,parts,human:'Pattern /'+pattern+'/ matches: '+parts.join(', ')};
}

function codeSemverCompare(input) {
  const {a='0.0.0',b='0.0.0'}=input;
  const parse=s=>s.replace(/^v/,'').split('.').map(Number);
  const [aM,am,ap]=parse(a),[bM,bm,bp]=parse(b);
  const r=aM!==bM?Math.sign(aM-bM):am!==bm?Math.sign(am-bm):Math.sign(ap-bp);
  return { _engine: 'real',a,b,comparison:r>0?'greater':r<0?'less':'equal',result:r};
}

function codeSemverBump(input) {
  const {version='0.0.0',type='patch'}=input;
  const p=version.replace(/^v/,'').split('.').map(Number);
  if(type==='major'){p[0]++;p[1]=0;p[2]=0;}else if(type==='minor'){p[1]++;p[2]=0;}else p[2]++;
  return { _engine: 'real',original:version,bumped:p.join('.'),type};
}

function codeDiffStats(input) {
  const {diff=''}=input;
  let additions=0,deletions=0; const files=new Set();
  for(const line of diff.split('\n')){
    if(line.startsWith('+')&&!line.startsWith('+++'))additions++;
    else if(line.startsWith('-')&&!line.startsWith('---'))deletions++;
    else if(line.startsWith('+++ ')||line.startsWith('--- ')){const f=line.slice(4).split('\t')[0].replace(/^[ab]\//,'');if(f!=='/dev/null')files.add(f);}
  }
  return { _engine: 'real',files:[...files],fileCount:files.size,additions,deletions,changes:additions+deletions};
}

function codeEnvParse(input) {
  const {text=''}=input;
  const result={};
  for(const line of text.split('\n')){
    const t=line.trim();
    if(!t||t.startsWith('#'))continue;
    const ci=t.indexOf('='); if(ci===-1)continue;
    const key=t.slice(0,ci).trim();
    let val=t.slice(ci+1).trim();
    if((val.startsWith('"')&&val.endsWith('"'))||(val.startsWith("'")&&val.endsWith("'")))val=val.slice(1,-1);
    result[key]=val;
  }
  return { _engine: 'real',data:result,count:Object.keys(result).length};
}

function codeJwtInspect(input) { return cryptoJwtDecode(input); }

// ─── NEW HANDLERS (batch 2) ──────────────────────────────────────────────────

function textHtmlToText(input) {
  const html = input.text || input.input || input.html || '';
  const original_length = html.length;
  // Strip script and style blocks entirely
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                 .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  const entities = { '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&nbsp;':' ','&apos;':"'",'&copy;':'©','&reg;':'®','&trade;':'™','&mdash;':'—','&ndash;':'–','&hellip;':'…','&laquo;':'«','&raquo;':'»' };
  text = text.replace(/&[a-zA-Z]+;|&#\d+;/g, m => {
    if (entities[m]) return entities[m];
    const num = m.match(/&#(\d+);/);
    if (num) return String.fromCharCode(parseInt(num[1], 10));
    return m;
  });
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return { _engine: 'real', text, original_length, stripped_length: text.length };
}

function textTableFormat(input) {
  const rows = input.rows || input.data || [];
  if (!Array.isArray(rows) || rows.length === 0) return { _engine: 'real', table: '', columns: [], rows: 0 };
  const columns = Object.keys(rows[0]);
  // Compute column widths
  const widths = {};
  for (const col of columns) widths[col] = col.length;
  for (const row of rows) {
    for (const col of columns) {
      const v = String(row[col] !== undefined ? row[col] : '');
      if (v.length > widths[col]) widths[col] = v.length;
    }
  }
  const pad = (s, w) => String(s).padEnd(w);
  const sep = columns.map(c => '-'.repeat(widths[c])).join('-+-');
  const header = columns.map(c => pad(c, widths[c])).join(' | ');
  const dataRows = rows.map(r => columns.map(c => pad(r[c] !== undefined ? r[c] : '', widths[c])).join(' | '));
  const table = [header, sep, ...dataRows].join('\n');
  return { _engine: 'real', table, columns, rows: rows.length };
}

function textTreeFormat(input) {
  const data = input.data !== undefined ? input.data : input;
  function buildLines(node, prefix, isLast, label) {
    const lines = [];
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    if (label !== null) lines.push(prefix + connector + String(label));
    const displayNode = label === null ? node : node;
    if (typeof displayNode === 'object' && displayNode !== null) {
      const entries = Array.isArray(displayNode)
        ? displayNode.map((v, i) => [String(i), v])
        : Object.entries(displayNode);
      entries.forEach(([k, v], idx) => {
        const last = idx === entries.length - 1;
        if (typeof v === 'object' && v !== null) {
          const p2 = label === null ? '' : childPrefix;
          lines.push(...buildLines(v, p2, last, k));
        } else {
          const p2 = label === null ? '' : childPrefix;
          const conn2 = last ? '└── ' : '├── ';
          lines.push(p2 + conn2 + k + ': ' + String(v));
        }
      });
    }
    return lines;
  }
  function renderTree(node, name) {
    const out = [name || 'root'];
    if (typeof node === 'object' && node !== null) {
      const entries = Array.isArray(node)
        ? node.map((v, i) => [String(i), v])
        : Object.entries(node);
      entries.forEach(([k, v], idx) => {
        const last = idx === entries.length - 1;
        const connector = last ? '└── ' : '├── ';
        const childPfx = last ? '    ' : '│   ';
        if (typeof v === 'object' && v !== null) {
          const subLines = renderTree(v, k);
          out.push(connector + subLines[0]);
          subLines.slice(1).forEach(l => out.push(childPfx + l));
        } else {
          out.push(connector + k + ': ' + String(v));
        }
      });
    }
    return out;
  }
  const lines = renderTree(data, 'root');
  return { _engine: 'real', tree: lines.join('\n') };
}

function mathMortgageAmortize(input) {
  const principal = Number(input.principal || 0);
  const annual_rate = Number(input.annual_rate || 0);
  const years = Number(input.years || 30);
  const monthly_rate = annual_rate / 100 / 12;
  const n = years * 12;
  let monthly_payment;
  if (monthly_rate === 0) {
    monthly_payment = principal / n;
  } else {
    monthly_payment = principal * (monthly_rate * Math.pow(1 + monthly_rate, n)) / (Math.pow(1 + monthly_rate, n) - 1);
  }
  monthly_payment = Math.round(monthly_payment * 100) / 100;
  let balance = principal;
  let total_paid = 0;
  let total_interest = 0;
  const schedule = [];
  for (let month = 1; month <= n; month++) {
    const interest = Math.round(balance * monthly_rate * 100) / 100;
    const princ = Math.round((monthly_payment - interest) * 100) / 100;
    balance = Math.round((balance - princ) * 100) / 100;
    if (balance < 0) balance = 0;
    total_paid += monthly_payment;
    total_interest += interest;
    if (month <= 12) schedule.push({ month, payment: monthly_payment, principal: princ, interest, balance });
  }
  return {
    _engine: 'real',
    monthly_payment,
    schedule,
    total_paid: Math.round(total_paid * 100) / 100,
    total_interest: Math.round(total_interest * 100) / 100
  };
}

function mathTaxEstimate(input) {
  const income = Number(input.income || 0);
  const filing_status = input.filing_status || 'single';
  // 2026 US federal income tax brackets (using 2025 indexed estimates)
  const bracketMap = {
    single: [
      { rate: 0.10, from: 0,      to: 11925 },
      { rate: 0.12, from: 11925,  to: 48475 },
      { rate: 0.22, from: 48475,  to: 103350 },
      { rate: 0.24, from: 103350, to: 197300 },
      { rate: 0.32, from: 197300, to: 250525 },
      { rate: 0.35, from: 250525, to: 626350 },
      { rate: 0.37, from: 626350, to: Infinity },
    ],
    married: [
      { rate: 0.10, from: 0,      to: 23850 },
      { rate: 0.12, from: 23850,  to: 96950 },
      { rate: 0.22, from: 96950,  to: 206700 },
      { rate: 0.24, from: 206700, to: 394600 },
      { rate: 0.32, from: 394600, to: 501050 },
      { rate: 0.35, from: 501050, to: 751600 },
      { rate: 0.37, from: 751600, to: Infinity },
    ],
  };
  const brackets = (bracketMap[filing_status] || bracketMap.single).map(b => {
    const taxable = Math.max(0, Math.min(income, b.to === Infinity ? income : b.to) - b.from);
    const tax_in_bracket = Math.round(taxable * b.rate * 100) / 100;
    return { rate: b.rate, from: b.from, to: b.to === Infinity ? null : b.to, tax_in_bracket };
  });
  const tax = Math.round(brackets.reduce((s, b) => s + b.tax_in_bracket, 0) * 100) / 100;
  const effective_rate = income > 0 ? Math.round((tax / income) * 10000) / 100 : 0;
  const marginal = (bracketMap[filing_status] || bracketMap.single).find(b => income <= (b.to === Infinity ? Infinity : b.to));
  const marginal_rate = marginal ? marginal.rate : 0.37;
  return { _engine: 'real', income, filing_status, tax, effective_rate, marginal_rate, brackets };
}

function dateHolidays(input) {
  const year = Number(input.year || new Date().getFullYear());
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function nthWeekday(y, m, weekday, n) {
    // n=1 means first, n=-1 means last
    if (n > 0) {
      const d = new Date(y, m, 1);
      while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
      d.setDate(d.getDate() + (n - 1) * 7);
      return d;
    } else {
      const d = new Date(y, m + 1, 0);
      while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
      return d;
    }
  }
  function fmt(d) {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd2 = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd2}`;
  }
  const mlk  = nthWeekday(year, 0, 1, 3);
  const pres = nthWeekday(year, 1, 1, 3);
  const mem  = nthWeekday(year, 4, 1, -1);
  const labor= nthWeekday(year, 8, 1, 1);
  const col  = nthWeekday(year, 9, 1, 2);
  const vet  = new Date(year, 10, 11);
  const thanks = nthWeekday(year, 10, 4, 4);
  const holidays = [
    { name: "New Year's Day",           date: fmt(new Date(year, 0, 1)),   day_of_week: days[new Date(year,0,1).getDay()] },
    { name: 'Martin Luther King Jr. Day', date: fmt(mlk),                  day_of_week: days[mlk.getDay()] },
    { name: "Presidents' Day",           date: fmt(pres),                  day_of_week: days[pres.getDay()] },
    { name: 'Memorial Day',              date: fmt(mem),                   day_of_week: days[mem.getDay()] },
    { name: 'Juneteenth',                date: fmt(new Date(year, 5, 19)), day_of_week: days[new Date(year,5,19).getDay()] },
    { name: 'Independence Day',          date: fmt(new Date(year, 6, 4)),  day_of_week: days[new Date(year,6,4).getDay()] },
    { name: 'Labor Day',                 date: fmt(labor),                 day_of_week: days[labor.getDay()] },
    { name: 'Columbus Day',              date: fmt(col),                   day_of_week: days[col.getDay()] },
    { name: "Veterans Day",              date: fmt(vet),                   day_of_week: days[vet.getDay()] },
    { name: 'Thanksgiving Day',          date: fmt(thanks),                day_of_week: days[thanks.getDay()] },
    { name: 'Christmas Day',             date: fmt(new Date(year, 11, 25)),day_of_week: days[new Date(year,11,25).getDay()] },
  ];
  return { _engine: 'real', year, holidays, count: holidays.length };
}

function genAvatarSvg(input) {
  const seed = String(input.text || input.name || input.seed || 'default');
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  // Derive a foreground color from the first 6 hex chars
  const fg = '#' + hash.slice(0, 6);
  const bg = '#f0f0f0';
  // Build 5x5 grid — mirror left/right for symmetry. Each cell = 1 bit from hash nibbles
  const bits = parseInt(hash.slice(6, 21), 16); // 60 bits, use 15 (left half of 5x5 = 15 cells)
  const cells = [];
  for (let i = 0; i < 15; i++) cells.push((bits >> i) & 1);
  // Map to 5x5 symmetric grid
  const grid = [];
  for (let row = 0; row < 5; row++) {
    const r = [];
    for (let col = 0; col < 5; col++) {
      const c = col < 3 ? col : 4 - col; // mirror: col 3 = col 1, col 4 = col 0
      r.push(cells[row * 3 + c]);
    }
    grid.push(r);
  }
  const cellSize = 20;
  const size = 5 * cellSize;
  let rects = '';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (grid[row][col]) {
        rects += `<rect x="${col * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="${fg}"/>`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${bg}"/>${rects}</svg>`;
  return { _engine: 'real', svg, seed, size: 5 };
}

function genQrSvg(input) {
  const data = String(input.data || input.text || input.url || '');
  // Simplified deterministic 21x21 visual QR-like matrix (not full QR spec)
  const modules = 21;
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  // Build matrix: fixed finder patterns + data bits from hash
  const matrix = Array.from({ length: modules }, () => Array(modules).fill(0));
  // Finder pattern helper
  function finder(r, c) {
    for (let dr = 0; dr < 7; dr++) for (let dc = 0; dc < 7; dc++) {
      const inBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
      const inInner  = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      matrix[r + dr][c + dc] = (inBorder || inInner) ? 1 : 0;
    }
  }
  finder(0, 0); finder(0, 14); finder(14, 0);
  // Timing patterns
  for (let i = 8; i < 13; i++) { matrix[6][i] = i % 2 === 0 ? 1 : 0; matrix[i][6] = i % 2 === 0 ? 1 : 0; }
  // Fill data area with hash bits
  let bitPos = 0;
  const hashBits = parseInt(hash, 16).toString(2).padStart(hash.length * 4, '0');
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      // Skip finder-pattern zones and timing
      const inFinder = (r < 8 && c < 8) || (r < 8 && c >= 13) || (r >= 13 && c < 8);
      const isTiming = r === 6 || c === 6;
      if (!inFinder && !isTiming) {
        matrix[r][c] = bitPos < hashBits.length ? parseInt(hashBits[bitPos++ % hashBits.length]) : 0;
      }
    }
  }
  const cellSize = 10;
  const svgSize = modules * cellSize;
  let rects = '';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (matrix[r][c]) rects += `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}"><rect width="${svgSize}" height="${svgSize}" fill="#fff"/>${rects}</svg>`;
  return { _engine: 'real', svg, data, modules };
}

function codeOpenapiValidate(input) {
  let spec;
  const errors = [];
  if (typeof input.spec === 'object' && input.spec !== null) {
    spec = input.spec;
  } else {
    const raw = input.spec || input.json || input.text || '{}';
    try { spec = JSON.parse(raw); } catch (e) { return { _engine: 'real', valid: false, errors: ['Invalid JSON: ' + e.message] }; }
  }
  const version = spec.openapi || spec.swagger || null;
  if (!version) errors.push('Missing required field: openapi or swagger');
  if (!spec.info) errors.push('Missing required field: info');
  else {
    if (!spec.info.title)   errors.push('Missing required field: info.title');
    if (!spec.info.version) errors.push('Missing required field: info.version');
  }
  if (!spec.paths || typeof spec.paths !== 'object') errors.push('Missing required field: paths');
  const paths_count = spec.paths ? Object.keys(spec.paths).length : 0;
  const title = spec.info && spec.info.title ? spec.info.title : null;
  return { _engine: 'real', valid: errors.length === 0, version, title, paths_count, errors };
}

function codeDockerfileLint(input) {
  const text = input.dockerfile || input.text || input.content || '';
  const lines = text.split('\n');
  const issues = [];
  let cmdCount = 0;
  let hasFrom = false;
  let score = 100;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;
    if (!line || line.startsWith('#')) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('FROM')) {
      hasFrom = true;
      if (upper.includes(':LATEST') || upper.endsWith(' LATEST') || upper.match(/FROM\s+\S+\s*$/)) {
        // check for :latest tag
        if (/:latest/i.test(line)) {
          issues.push({ line: lineNum, rule: 'no-latest-tag', severity: 'warning', message: 'Avoid using :latest tag; pin a specific version' });
          score -= 10;
        }
      }
    }
    if (upper.startsWith('CMD')) { cmdCount++; if (cmdCount > 1) { issues.push({ line: lineNum, rule: 'multiple-cmd', severity: 'error', message: 'Multiple CMD instructions; only the last one takes effect' }); score -= 15; } }
    if (/apt-get\s+(install|upgrade)/i.test(line) && !/-y\b/.test(line)) { issues.push({ line: lineNum, rule: 'apt-get-no-y', severity: 'warning', message: 'apt-get install/upgrade should use -y flag to avoid interactive prompts' }); score -= 5; }
    if (upper.startsWith('ADD ') && !line.match(/\.tar\.|\.gz|\.bz2|\.xz|http/i)) { issues.push({ line: lineNum, rule: 'prefer-copy', severity: 'info', message: 'Prefer COPY over ADD for simple file copies; ADD has implicit behavior' }); score -= 5; }
    if (/USER\s+root/i.test(line)) { issues.push({ line: lineNum, rule: 'no-root-user', severity: 'warning', message: 'Running as root is a security risk; use a non-root USER' }); score -= 10; }
  }
  if (!hasFrom) { issues.push({ line: 0, rule: 'missing-from', severity: 'error', message: 'Dockerfile must start with a FROM instruction' }); score -= 30; }
  score = Math.max(0, score);
  return { _engine: 'real', issues, score, lines_checked: lines.length };
}

function mathMatrixMultiply(input) {
  const a = input.a;
  const b = input.b;
  if (!Array.isArray(a) || !Array.isArray(b)) return { _engine: 'real', error: 'Inputs a and b must be 2D arrays' };
  const aRows = a.length, aCols = a[0].length;
  const bRows = b.length, bCols = b[0].length;
  if (aCols !== bRows) return { _engine: 'real', error: `Dimension mismatch: a is ${aRows}x${aCols}, b is ${bRows}x${bCols}; a columns must equal b rows` };
  const result = [];
  for (let i = 0; i < aRows; i++) {
    result[i] = [];
    for (let j = 0; j < bCols; j++) {
      let sum = 0;
      for (let k = 0; k < aCols; k++) sum += a[i][k] * b[k][j];
      result[i][j] = sum;
    }
  }
  return { _engine: 'real', result, rows: aRows, cols: bCols };
}

function cryptoTotpGenerate(input) {
  const secretRaw = input.secret || 'JBSWY3DPEHPK3PXP';
  // Decode base32 if it looks like base32
  function base32Decode(s) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
    let bits = 0, value = 0;
    const bytes = [];
    for (const ch of clean) {
      const idx = alphabet.indexOf(ch);
      if (idx < 0) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    return Buffer.from(bytes);
  }
  const isBase32 = /^[A-Z2-7]+=*$/i.test(secretRaw.replace(/\s/g, ''));
  const key = isBase32 ? base32Decode(secretRaw) : Buffer.from(secretRaw, 'utf8');
  const period = 30;
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / period);
  const remaining_seconds = period - (now % period);
  // HOTP
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { buf[i] = c & 0xff; c = Math.floor(c / 256); }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset+1] << 16 | hmac[offset+2] << 8 | hmac[offset+3]) % 1000000;
  const otp = String(code).padStart(6, '0');
  return { _engine: 'real', otp, remaining_seconds, period };
}

function textDiffUnified(input) {
  const a = (input.a || '').split('\n');
  const b = (input.b || '').split('\n');
  const fn_a = input.filename_a || 'a';
  const fn_b = input.filename_b || 'b';
  // Simple LCS-based unified diff
  function lcs(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({length: m+1}, () => Array(n+1).fill(0));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    const seq = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i-1] === b[j-1]) { seq.unshift([i-1, j-1]); i--; j--; }
      else if (dp[i-1][j] > dp[i][j-1]) i--;
      else j--;
    }
    return seq;
  }
  const common = lcs(a, b);
  const hunks = [];
  let ai = 0, bi = 0, ci = 0;
  const lines = [];
  while (ci < common.length) {
    const [ca, cb] = common[ci];
    while (ai < ca) { lines.push({ type: '-', text: a[ai++] }); }
    while (bi < cb) { lines.push({ type: '+', text: b[bi++] }); }
    lines.push({ type: ' ', text: a[ai++] }); bi++;
    ci++;
  }
  while (ai < a.length) lines.push({ type: '-', text: a[ai++] });
  while (bi < b.length) lines.push({ type: '+', text: b[bi++] });
  let additions = 0, deletions = 0;
  const hunkLines = [];
  let aStart = 1, bStart = 1, aCount = 0, bCount = 0;
  for (const l of lines) {
    if (l.type === '-') { deletions++; aCount++; hunkLines.push('-' + l.text); }
    else if (l.type === '+') { additions++; bCount++; hunkLines.push('+' + l.text); }
    else { aCount++; bCount++; hunkLines.push(' ' + l.text); }
  }
  const header = `--- ${fn_a}\n+++ ${fn_b}`;
  const hunkHeader = `@@ -${aStart},${aCount} +${bStart},${bCount} @@`;
  const unified = [header, hunkHeader, ...hunkLines].join('\n');
  return { _engine: 'real', unified, additions, deletions };
}

function codeGitignoreGenerate(input) {
  const langs = Array.isArray(input.languages) ? input.languages : [input.language || 'node'];
  const templates = {
    node: [
      'node_modules/', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*',
      '.npm', '.env', '.env.local', '.env.*.local', 'dist/', 'build/',
      '.DS_Store', 'coverage/', '.nyc_output', '*.log',
    ],
    python: [
      '__pycache__/', '*.py[cod]', '*$py.class', '*.so', '.Python', 'env/',
      'venv/', '.venv/', 'pip-log.txt', 'pip-delete-this-directory.txt',
      '.tox/', '.coverage', '.pytest_cache/', 'htmlcov/', 'dist/', 'build/',
      '*.egg-info/', '.eggs/', '*.egg',
    ],
    go: [
      '*.exe', '*.exe~', '*.dll', '*.so', '*.dylib', '*.test', '*.out',
      'go.sum', 'vendor/', 'bin/', 'dist/',
    ],
    rust: [
      '/target', '**/*.rs.bk', 'Cargo.lock', 'dist/',
    ],
    java: [
      '*.class', '*.jar', '*.war', '*.ear', '*.nar', 'hs_err_pid*',
      '.gradle/', 'build/', 'target/', '.idea/', '*.iml', '.classpath',
      '.project', '.settings/',
    ],
    ruby: [
      '*.gem', '*.rbc', '.bundle/', '.config', 'coverage/', 'InstalledFiles',
      'lib/bundler/man/', 'pkg/', 'rdoc/', 'spec/reports/', 'test/tmp/',
      'test/version_tmp/', 'tmp/', 'vendor/bundle', '.byebug_history',
      'Gemfile.lock',
    ],
  };
  const sections = [];
  for (const lang of langs) {
    const key = lang.toLowerCase();
    if (templates[key]) {
      sections.push(`# ${lang.charAt(0).toUpperCase() + lang.slice(1)}`);
      sections.push(...templates[key]);
      sections.push('');
    }
  }
  const gitignore = sections.join('\n').trimEnd();
  return { _engine: 'real', gitignore, languages: langs };
}

function textCronToEnglish(input) {
  const expression = input.cron || input.expression || '* * * * *';
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return { _engine: 'real', error: 'Invalid cron expression; expected 5 fields', expression };
  const [min, hour, dom, month, dow] = parts;
  const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
  const dowNames   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function parseField(f, names, offset=0) {
    if (f === '*') return null;
    if (f.includes('/')) {
      const [base, step] = f.split('/');
      return `every ${step} ${base === '*' ? 'units' : 'starting from ' + (names ? names[parseInt(base)+offset] : base)}`;
    }
    if (f.includes('-')) {
      const [from, to] = f.split('-').map(Number);
      return names ? `${names[from+offset]} through ${names[to+offset]}` : `${from} through ${to}`;
    }
    if (f.includes(',')) {
      const vals = f.split(',').map(v => names ? names[parseInt(v)+offset] : v);
      return vals.join(', ');
    }
    return names ? names[parseInt(f)+offset] : f;
  }
  const parts2 = [];
  // Time
  if (min === '*' && hour === '*') {
    parts2.push('every minute');
  } else if (min.includes('/') && hour === '*') {
    parts2.push(`every ${min.split('/')[1]} minutes`);
  } else {
    const h = hour === '*' ? null : parseInt(hour);
    const m = min  === '*' ? '00' : min.padStart(2,'0');
    if (h !== null) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
      parts2.push(`at ${h12}:${m} ${ampm}`);
    } else {
      parts2.push(`at minute ${min}`);
    }
  }
  // Day of week
  const dowParsed = parseField(dow, dowNames);
  if (dowParsed) parts2.push(dowParsed);
  // Month
  const monthParsed = parseField(month, monthNames, 0);
  if (monthParsed) parts2.push('in ' + monthParsed);
  // Day of month
  const domParsed = parseField(dom, null);
  if (domParsed) parts2.push('on day ' + domParsed + ' of the month');
  const english = parts2.join(', ');
  // Compute next occurrence (approximate)
  const now = new Date();
  let next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);
  // Simple: advance until minute/hour/dow match (limit 10080 iterations = 1 week)
  for (let i = 0; i < 10080; i++) {
    const mm = next.getMinutes(), hh = next.getHours(), dd = next.getDate(), mo = next.getMonth()+1, wd = next.getDay();
    const mOk  = min   === '*' || (min.includes('/') ? mm % parseInt(min.split('/')[1]) === 0 : parseInt(min) === mm);
    const hOk  = hour  === '*' || parseInt(hour) === hh;
    const domOk= dom   === '*' || parseInt(dom) === dd;
    const moOk = month === '*' || parseInt(month) === mo;
    const dowOk= dow   === '*' || dow.split(',').map(Number).includes(wd) || (dow.includes('-') && wd >= parseInt(dow.split('-')[0]) && wd <= parseInt(dow.split('-')[1]));
    if (mOk && hOk && domOk && moOk && dowOk) break;
    next.setMinutes(next.getMinutes() + 1);
  }
  return { _engine: 'real', english, expression, next_occurrence: next.toISOString() };
}

// ─── ADDITIONAL COMPUTE HANDLERS ────────────────────────────────────────────

function textTokenCount(input) {
  const text = input.text || '';
  const characters = text.length;
  // Heuristic: code-like text (many non-alpha chars) uses ~2 chars/token, else ~4
  const nonAlpha = (text.match(/[^a-zA-Z\s]/g) || []).length;
  const ratio = nonAlpha / (characters || 1) > 0.2 ? 2 : 4;
  const tokens_estimated = Math.ceil(characters / ratio);
  return { _engine: 'real', tokens_estimated, characters, method: 'char_ratio', note: 'Approximate. GPT-4/Claude average ~4 chars/token for English.' };
}

function textChunk(input) {
  const text = input.text || '';
  const chunk_size = Math.max(input.chunk_size || 500, 10);
  const overlap = Math.min(input.overlap || 0, Math.floor(chunk_size / 2));
  const method = input.method || 'characters';
  let units = [];
  if (method === 'paragraphs') {
    units = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  } else if (method === 'sentences') {
    units = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
    units = units.map(s => s.trim()).filter(Boolean);
  } else {
    // characters
    const chunks = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + chunk_size));
      const step = Math.max(chunk_size - overlap, 1);
      i += step;
      if (i >= text.length) break;
    }
    if (chunks.length === 0 && text.length > 0) chunks.push(text);
    return { _engine: 'real', chunks, count: chunks.length, chunk_size, overlap };
  }
  // For sentences/paragraphs: group units into chunks by char length with overlap
  const chunks = [];
  let current = '';
  let overlapBuffer = '';
  for (const unit of units) {
    if ((current + unit).length > chunk_size && current.length > 0) {
      chunks.push(current.trim());
      // carry overlap
      const words = current.split(/\s+/);
      overlapBuffer = words.slice(-Math.ceil(overlap / 5)).join(' ');
      current = overlapBuffer + ' ' + unit;
    } else {
      current += (current ? ' ' : '') + unit;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return { _engine: 'real', chunks, count: chunks.length, chunk_size, overlap };
}

function textTemplate(input) {
  const template = input.template || '';
  const variables = input.variables || {};
  let result = template;
  let variables_replaced = 0;
  const variables_missing = [];
  const keys = Object.keys(variables);
  // Replace all {{key}} patterns
  const allKeys = [...(template.match(/\{\{(\w+)\}\}/g) || [])].map(k => k.replace(/\{\{|\}\}/g, ''));
  const unique = [...new Set(allKeys)];
  for (const key of unique) {
    if (key in variables) {
      const before = result;
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), variables[key]);
      if (result !== before) variables_replaced++;
    } else {
      variables_missing.push(key);
    }
  }
  return { _engine: 'real', result, variables_replaced, variables_missing };
}

function textSanitize(input) {
  let text = input.text || '';
  let threats_removed = 0;
  // Remove <script ...>...</script> blocks
  const scriptCount = (text.match(/<script[\s\S]*?<\/script>/gi) || []).length;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  threats_removed += scriptCount;
  // Remove event handler attributes like onclick=, onload=, etc.
  const eventCount = (text.match(/\s+on\w+\s*=\s*["'][^"']*["']/gi) || []).length;
  text = text.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  threats_removed += eventCount;
  // Remove javascript: URLs
  const jsUrlCount = (text.match(/javascript\s*:/gi) || []).length;
  text = text.replace(/javascript\s*:/gi, '');
  threats_removed += jsUrlCount;
  return { _engine: 'real', result: text, threats_removed };
}

function textMarkdownToc(input) {
  const text = input.text || '';
  const lines = text.split('\n');
  const headings = [];
  const tocLines = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) {
      const level = m[1].length;
      const title = m[2].trim();
      const anchor = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      headings.push({ level, title, anchor });
      const indent = '  '.repeat(level - 1);
      tocLines.push(`${indent}- [${title}](#${anchor})`);
    }
  }
  return { _engine: 'real', toc: tocLines.join('\n'), headings };
}

function textIndent(input) {
  const text = input.text || '';
  const spaces = input.spaces !== undefined ? input.spaces : 2;
  const direction = input.direction || 'indent';
  const pad = ' '.repeat(spaces);
  const lineArr = text.split('\n');
  let result;
  if (direction === 'dedent') {
    result = lineArr.map(l => l.startsWith(pad) ? l.slice(spaces) : l.replace(/^ +/, s => s.slice(Math.min(spaces, s.length)))).join('\n');
  } else {
    result = lineArr.map(l => pad + l).join('\n');
  }
  return { _engine: 'real', result, lines: lineArr.length };
}

function textWrap(input) {
  const text = input.text || '';
  const width = input.width || 80;
  const paragraphs = text.split('\n');
  const wrapped = [];
  for (const para of paragraphs) {
    if (para.trim() === '') { wrapped.push(''); continue; }
    const words = para.split(/\s+/);
    let line = '';
    for (const word of words) {
      if (line.length === 0) {
        line = word;
      } else if ((line + ' ' + word).length <= width) {
        line += ' ' + word;
      } else {
        wrapped.push(line);
        line = word;
      }
    }
    if (line) wrapped.push(line);
  }
  const result = wrapped.join('\n');
  return { _engine: 'real', result, lines: wrapped.length };
}

function textDetectEncoding(input) {
  const text = input.text || '';
  const buf = Buffer.from(text, 'utf8');
  const byte_length = buf.length;
  let has_unicode = false;
  let has_emoji = false;
  let has_cjk = false;
  for (const cp of text) {
    const code = cp.codePointAt(0);
    if (code > 127) has_unicode = true;
    if (code >= 0x4E00 && code <= 0x9FFF) has_cjk = true;
    if (code >= 0x1F300) has_emoji = true;
  }
  const encoding = has_unicode ? 'utf8' : 'ascii';
  return { _engine: 'real', encoding, has_unicode, has_emoji, has_cjk, byte_length };
}

function codeJsonToZod(input) {
  const json = input.json || {};
  function typeToZod(val) {
    if (val === null) return 'z.null()';
    if (Array.isArray(val)) {
      const inner = val.length > 0 ? typeToZod(val[0]) : 'z.unknown()';
      return `z.array(${inner})`;
    }
    if (typeof val === 'object') return buildZod(val);
    if (typeof val === 'string') return 'z.string()';
    if (typeof val === 'number') return 'z.number()';
    if (typeof val === 'boolean') return 'z.boolean()';
    return 'z.unknown()';
  }
  function buildZod(obj, indent) {
    indent = indent || 0;
    const pad = '  '.repeat(indent + 1);
    const closePad = '  '.repeat(indent);
    const fields = Object.entries(obj).map(([k, v]) => `${pad}${k}: ${typeToZod(v)},`).join('\n');
    return `z.object({\n${fields}\n${closePad}})`;
  }
  const zod = buildZod(json);
  return { _engine: 'real', zod };
}

function codeCssMinify(input) {
  let text = input.text || '';
  const original_size = text.length;
  // Remove comments
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ');
  // Remove spaces around { } : ; ,
  text = text.replace(/\s*([{};:,>+~])\s*/g, '$1');
  // Remove trailing semicolons before }
  text = text.replace(/;}/g, '}');
  text = text.trim();
  const minified_size = text.length;
  const reduction_pct = original_size > 0 ? +((1 - minified_size / original_size) * 100).toFixed(1) : 0;
  return { _engine: 'real', result: text, original_size, minified_size, reduction_pct };
}

function codeJsMinify(input) {
  let text = input.text || '';
  const original_size = text.length;
  // Remove multi-line comments
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments (careful not to strip protocol-relative URLs)
  text = text.replace(/(?<![:"'])\/\/[^\n]*/g, '');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ');
  // Strip trailing semicolons before }
  text = text.replace(/;\s*}/g, '}');
  text = text.trim();
  const minified_size = text.length;
  return { _engine: 'real', result: text, original_size, minified_size };
}

function mathMovingAverage(input) {
  const numbers = input.numbers || [];
  const window = input.window || 3;
  const averages = [];
  for (let i = 0; i <= numbers.length - window; i++) {
    const slice = numbers.slice(i, i + window);
    const avg = slice.reduce((a, b) => a + b, 0) / window;
    averages.push(+avg.toFixed(6));
  }
  return { _engine: 'real', averages, window };
}

function mathLinearRegression(input) {
  const x = input.x || [];
  const y = input.y || [];
  const n = Math.min(x.length, y.length);
  if (n < 2) return { _engine: 'real', slope: null, intercept: null, r_squared: null, equation: 'insufficient data' };
  const xMean = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const yMean = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (x[i] - xMean) * (y[i] - yMean);
    ssXX += (x[i] - xMean) ** 2;
    ssYY += (y[i] - yMean) ** 2;
  }
  const slope = ssXX !== 0 ? +(ssXY / ssXX).toFixed(4) : 0;
  const intercept = +(yMean - slope * xMean).toFixed(4);
  const r_squared = ssYY !== 0 ? +((ssXY ** 2) / (ssXX * ssYY)).toFixed(4) : 1;
  const equation = `y = ${slope}x + ${intercept}`;
  return { _engine: 'real', slope, intercept, r_squared, equation };
}

function mathExpressionToLatex(input) {
  let text = input.text || '';
  // sqrt(x) -> \sqrt{x}
  text = text.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');
  // x^n -> x^{n}  (handle multi-char exponents)
  text = text.replace(/\^(\w+)/g, '^{$1}');
  // pi -> \pi
  text = text.replace(/\bpi\b/g, '\\pi');
  // e -> \mathrm{e}  (only standalone)
  text = text.replace(/\be\b/g, '\\mathrm{e}');
  // * -> \cdot
  text = text.replace(/\*/g, ' \\cdot ');
  // >= -> \geq,  <= -> \leq,  != -> \neq
  text = text.replace(/>=/g, '\\geq').replace(/<=/g, '\\leq').replace(/!=/g, '\\neq');
  // infinity -> \infty
  text = text.replace(/\binfinity\b/gi, '\\infty');
  return { _engine: 'real', latex: text };
}

function genCronExpression(input) {
  const text = (input.text || '').toLowerCase().trim();
  let cron = null;
  let human_readable = text;
  // Match common patterns
  const hourMatch = text.match(/every (?:day |weekday )?at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  const getHour = (h, ampm) => {
    let hour = parseInt(h);
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return hour;
  };
  if (/every minute/.test(text)) {
    cron = '* * * * *'; human_readable = 'Every minute';
  } else if (/every hour/.test(text)) {
    cron = '0 * * * *'; human_readable = 'Every hour at minute 0';
  } else if (/every weekday at/.test(text) && hourMatch) {
    const h = getHour(hourMatch[1], hourMatch[3]);
    const m = hourMatch[2] ? parseInt(hourMatch[2]) : 0;
    cron = `${m} ${h} * * 1-5`; human_readable = `At ${hourMatch[1]}:${(hourMatch[2]||'00').padStart(2,'0')} ${hourMatch[3]||''} Monday through Friday`;
  } else if (/every day at/.test(text) && hourMatch) {
    const h = getHour(hourMatch[1], hourMatch[3]);
    const m = hourMatch[2] ? parseInt(hourMatch[2]) : 0;
    cron = `${m} ${h} * * *`; human_readable = `Daily at ${hourMatch[1]}:${(hourMatch[2]||'00').padStart(2,'0')} ${hourMatch[3]||''}`;
  } else if (/every monday/.test(text)) {
    cron = '0 0 * * 1'; human_readable = 'Every Monday at midnight';
  } else if (/every tuesday/.test(text)) {
    cron = '0 0 * * 2'; human_readable = 'Every Tuesday at midnight';
  } else if (/every wednesday/.test(text)) {
    cron = '0 0 * * 3'; human_readable = 'Every Wednesday at midnight';
  } else if (/every thursday/.test(text)) {
    cron = '0 0 * * 4'; human_readable = 'Every Thursday at midnight';
  } else if (/every friday/.test(text)) {
    cron = '0 0 * * 5'; human_readable = 'Every Friday at midnight';
  } else if (/every saturday/.test(text)) {
    cron = '0 0 * * 6'; human_readable = 'Every Saturday at midnight';
  } else if (/every sunday/.test(text)) {
    cron = '0 0 * * 0'; human_readable = 'Every Sunday at midnight';
  } else if (/every week/.test(text)) {
    cron = '0 0 * * 0'; human_readable = 'Every week on Sunday at midnight';
  } else if (/every month/.test(text)) {
    cron = '0 0 1 * *'; human_readable = 'First day of every month at midnight';
  } else if (/every year/.test(text)) {
    cron = '0 0 1 1 *'; human_readable = 'January 1st every year at midnight';
  } else if (hourMatch) {
    const h = getHour(hourMatch[1], hourMatch[3]);
    const m = hourMatch[2] ? parseInt(hourMatch[2]) : 0;
    cron = `${m} ${h} * * *`; human_readable = `Daily at ${hourMatch[1]}:${(hourMatch[2]||'00').padStart(2,'0')} ${hourMatch[3]||''}`;
  } else {
    cron = '* * * * *'; human_readable = 'Every minute (pattern not recognized, defaulted)';
  }
  return { _engine: 'real', cron, human_readable };
}

function cryptoHashCompare(input) {
  const a = input.a || '';
  const b = input.b || '';
  let equal = false;
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length === bufB.length) {
      equal = crypto.timingSafeEqual(bufA, bufB);
    }
  } catch (e) {
    equal = false;
  }
  return { _engine: 'real', equal, method: 'timing_safe' };
}

function codePackageJsonGenerate(input) {
  const { name = 'my-package', description = '', author = '', license = 'MIT', dependencies = {} } = input;
  const pkg = {
    name,
    version: '1.0.0',
    description,
    main: 'index.js',
    scripts: { test: 'echo "Error: no test specified" && exit 1' },
    author,
    license,
    dependencies
  };
  return { _engine: 'real', package_json: JSON.stringify(pkg, null, 2) };
}

function genLoremCode(input) {
  const language = (input.language || 'javascript').toLowerCase();
  const lines = input.lines || 10;
  const templates = {
    javascript: [
      "// Lorem ipsum placeholder code",
      "'use strict';",
      "",
      "const loremIpsum = (n) => {",
      "  const words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet'];",
      "  return Array.from({ length: n }, (_, i) => words[i % words.length]).join(' ');",
      "};",
      "",
      "function processData(data) {",
      "  if (!data) return null;",
      "  const result = data.map(item => ({ id: item.id, value: loremIpsum(3) }));",
      "  return result.filter(r => r.value.length > 0);",
      "}",
      "",
      "module.exports = { loremIpsum, processData };",
    ],
    python: [
      "# Lorem ipsum placeholder code",
      "",
      "def lorem_ipsum(n):",
      "    words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet']",
      "    return ' '.join(words[i % len(words)] for i in range(n))",
      "",
      "class DataProcessor:",
      "    def __init__(self, data):",
      "        self.data = data",
      "",
      "    def process(self):",
      "        return [{'id': i, 'value': lorem_ipsum(3)} for i, item in enumerate(self.data)]",
      "",
      "if __name__ == '__main__':",
      "    print(lorem_ipsum(5))",
    ],
    go: [
      "// Lorem ipsum placeholder code",
      "package main",
      "",
      'import "fmt"',
      "",
      "func loremIpsum(n int) string {",
      '    words := []string{"lorem", "ipsum", "dolor", "sit", "amet"}',
      "    result := \"\"",
      "    for i := 0; i < n; i++ {",
      "        result += words[i%len(words)] + \" \"",
      "    }",
      "    return result",
      "}",
      "",
      "func main() { fmt.Println(loremIpsum(5)) }",
    ],
    rust: [
      "// Lorem ipsum placeholder code",
      "",
      "fn lorem_ipsum(n: usize) -> String {",
      '    let words = vec!["lorem", "ipsum", "dolor", "sit", "amet"];',
      "    (0..n).map(|i| words[i % words.len()]).collect::<Vec<_>>().join(\" \")",
      "}",
      "",
      "#[derive(Debug)]",
      "struct DataItem { id: usize, value: String }",
      "",
      "fn main() {",
      "    let result = lorem_ipsum(5);",
      "    println!(\"{}\", result);",
      "}",
    ],
  };
  const tmpl = templates[language] || templates['javascript'];
  const code = tmpl.slice(0, lines).join('\n');
  return { _engine: 'real', code, language, lines: code.split('\n').length };
}

function textMarkdownLint(input) {
  const text = input.text || '';
  const lines = text.split('\n');
  const issues = [];
  let listMarker = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    // Trailing spaces
    if (/  +$/.test(line) && !/  $/.test(line.trimEnd() + '  ')) {
      if (line.endsWith('   ') || /[^ ] {2,}$/.test(line)) {
        issues.push({ line: lineNum, rule: 'trailing-spaces', message: 'Line has trailing spaces' });
      }
    }
    // No blank line before heading
    if (/^#{1,6}\s/.test(line) && i > 0 && lines[i - 1].trim() !== '') {
      issues.push({ line: lineNum, rule: 'no-blank-line-before-heading', message: 'Heading should be preceded by a blank line' });
    }
    // Inconsistent list markers
    const listMatch = line.match(/^(\s*)([-*+])\s/);
    if (listMatch) {
      if (listMarker === null) listMarker = listMatch[2];
      else if (listMatch[2] !== listMarker) {
        issues.push({ line: lineNum, rule: 'inconsistent-list-markers', message: `List marker "${listMatch[2]}" inconsistent with "${listMarker}"` });
      }
    }
    // Missing alt text in images
    if (/!\[\]\(/.test(line)) {
      issues.push({ line: lineNum, rule: 'missing-alt-text', message: 'Image is missing alt text' });
    }
  }
  const score = Math.max(0, 100 - issues.length * 10);
  return { _engine: 'real', issues, score };
}

function codeHtmlMinify(input) {
  let text = input.text || '';
  const original_size = text.length;
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Collapse whitespace between tags
  text = text.replace(/>\s+</g, '><');
  // Collapse multiple spaces inside tags
  text = text.replace(/\s{2,}/g, ' ');
  // Remove optional closing tags
  text = text.replace(/<\/(li|dt|dd|p|thead|tbody|tfoot|tr|th|td|option|optgroup|caption|colgroup)>/gi, '');
  text = text.trim();
  const minified_size = text.length;
  return { _engine: 'real', result: text, original_size, minified_size };
}

// ─── AI AGENT WORKFLOW HANDLERS ─────────────────────────────────────────────

function llmOutputExtractJson(input) {
  const text = input.text || '';

  // Method 1: direct JSON.parse
  try {
    const parsed = JSON.parse(text.trim());
    return { _engine: 'real', json: parsed, method: 'direct', raw_match: text.trim() };
  } catch (_) {}

  // Method 2: code fence ```json ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      return { _engine: 'real', json: parsed, method: 'code_fence', raw_match: fenceMatch[1].trim() };
    } catch (_) {}
  }

  // Method 3: find first { ... } or [ ... ]
  const braceMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[1]);
      return { _engine: 'real', json: parsed, method: 'brace_extract', raw_match: braceMatch[1] };
    } catch (_) {
      // Try fixing this extracted chunk
      try {
        const fixed = _fixJsonString(braceMatch[1]);
        const parsed = JSON.parse(fixed);
        return { _engine: 'real', json: parsed, method: 'fixed', raw_match: braceMatch[1] };
      } catch (_) {}
    }
  }

  // Method 4: fix the whole text
  try {
    const fixed = _fixJsonString(text);
    const parsed = JSON.parse(fixed);
    return { _engine: 'real', json: parsed, method: 'fixed', raw_match: text };
  } catch (_) {}

  return { _engine: 'real', json: null, method: null, raw_match: null, error: 'Could not extract JSON' };
}

function _fixJsonString(str) {
  let s = str.trim();
  // Remove JS line comments
  s = s.replace(/\/\/[^\n]*/g, '');
  // Remove block comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Replace single-quoted strings with double-quoted (simple heuristic)
  s = s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"');
  // Quote unquoted keys: word chars followed by colon
  s = s.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
  return s;
}

function llmOutputFixJson(input) {
  const text = input.text || '';
  const repairs = [];
  let s = text.trim();

  if (/\/\/[^\n]*/.test(s)) { s = s.replace(/\/\/[^\n]*/g, ''); repairs.push('removed JS line comments'); }
  if (/\/\*[\s\S]*?\*\//.test(s)) { s = s.replace(/\/\*[\s\S]*?\*\//g, ''); repairs.push('removed block comments'); }
  if (/,\s*[}\]]/.test(s)) { s = s.replace(/,\s*([}\]])/g, '$1'); repairs.push('removed trailing commas'); }
  if (/'/.test(s)) { s = s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"'); repairs.push('replaced single quotes with double quotes'); }
  // Quote unquoted keys
  if (/[{,]\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*:/.test(s)) {
    s = s.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    repairs.push('quoted unquoted keys');
  }
  // Fix missing closing braces/brackets
  const opens = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
  const openBrackets = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
  if (opens > 0) { s += '}'.repeat(opens); repairs.push(`added ${opens} missing closing brace(s)`); }
  if (openBrackets > 0) { s += ']'.repeat(openBrackets); repairs.push(`added ${openBrackets} missing closing bracket(s)`); }

  try {
    const fixed = JSON.parse(s);
    return { _engine: 'real', fixed, repairs, original: text };
  } catch (e) {
    return { _engine: 'real', fixed: null, repairs, original: text, error: e.message };
  }
}

function _validateAgainstSchema(data, schema, path) {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;

  // Type check
  if (schema.type) {
    const actualType = Array.isArray(data) ? 'array' : (data === null ? 'null' : typeof data);
    if (schema.type !== actualType) {
      errors.push({ path, expected: schema.type, got: actualType, message: `expected type '${schema.type}', got '${actualType}'` });
      return errors; // no point continuing if type is wrong
    }
  }

  // Enum
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push({ path, message: `value must be one of: ${schema.enum.join(', ')}` });
  }

  // String constraints
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength)
      errors.push({ path, message: `string length ${data.length} < minLength ${schema.minLength}` });
    if (schema.maxLength !== undefined && data.length > schema.maxLength)
      errors.push({ path, message: `string length ${data.length} > maxLength ${schema.maxLength}` });
    if (schema.pattern && !new RegExp(schema.pattern).test(data))
      errors.push({ path, message: `string does not match pattern '${schema.pattern}'` });
  }

  // Number constraints
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum)
      errors.push({ path, message: `value ${data} < minimum ${schema.minimum}` });
    if (schema.maximum !== undefined && data > schema.maximum)
      errors.push({ path, message: `value ${data} > maximum ${schema.maximum}` });
  }

  // Object: required + properties
  if (schema.type === 'object' || (typeof data === 'object' && data !== null && !Array.isArray(data))) {
    if (schema.required && Array.isArray(schema.required)) {
      for (const req of schema.required) {
        if (data[req] === undefined) {
          errors.push({ path: path ? `${path}.${req}` : req, expected: 'defined', got: 'undefined', message: `missing required field '${req}'` });
        }
      }
    }
    if (schema.properties && typeof data === 'object' && data !== null) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (data[key] !== undefined) {
          const subErrors = _validateAgainstSchema(data[key], subSchema, path ? `${path}.${key}` : key);
          errors.push(...subErrors);
        }
      }
    }
  }

  // Array: items
  if ((schema.type === 'array' || Array.isArray(data)) && schema.items && Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const subErrors = _validateAgainstSchema(data[i], schema.items, `${path}[${i}]`);
      errors.push(...subErrors);
    }
  }

  return errors;
}

function llmOutputValidate(input) {
  let data = input.output;
  const schema = input.schema || {};
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (_) {
      return { _engine: 'real', valid: false, errors: [{ path: '', message: 'output is not valid JSON' }] };
    }
  }
  const errors = _validateAgainstSchema(data, schema, '');
  return { _engine: 'real', valid: errors.length === 0, errors };
}

async function webhookSend(input) {
  return new Promise((resolve) => {
    const url = input.url || '';
    const body = input.body || {};
    const headers = input.headers || {};
    const method = input.method || 'POST';
    const bodyStr = JSON.stringify(body);
    let parsed;
    try { parsed = new URL(url); } catch (_) {
      return resolve({ _engine: 'real', status_code: null, response_body: null, timing_ms: 0, error: 'Invalid URL' });
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }, headers),
    };
    const start = Date.now();
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const timing_ms = Date.now() - start;
        const full = Buffer.concat(chunks).toString('utf8');
        resolve({ _engine: 'real', status_code: res.statusCode, response_body: full.slice(0, 1000), timing_ms });
      });
    });
    req.on('error', (e) => resolve({ _engine: 'real', status_code: null, response_body: null, timing_ms: Date.now() - start, error: e.message }));
    req.write(bodyStr);
    req.end();
  });
}

async function fileDownload(input) {
  return new Promise((resolve) => {
    const url = input.url || '';
    let parsed;
    try { parsed = new URL(url); } catch (_) {
      return resolve({ _engine: 'real', content: null, content_type: null, size_bytes: 0, url, error: 'Invalid URL' });
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(url, (res) => {
      // Follow one redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fileDownload({ url: res.headers.location }).then(resolve);
      }
      const chunks = [];
      let total = 0;
      res.on('data', (c) => { chunks.push(c); total += c.length; });
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          _engine: 'real',
          content: buf.slice(0, 10240).toString('utf8'),
          content_type: res.headers['content-type'] || null,
          size_bytes: total,
          url,
        });
      });
    });
    req.on('error', (e) => resolve({ _engine: 'real', content: null, content_type: null, size_bytes: 0, url, error: e.message }));
  });
}

const fs = require('fs');
const path = require('path');
const kvDir = path.join(__dirname, '..', '.data');

function _kvFilePath(namespace) {
  return path.join(kvDir, `kv-${namespace}.json`);
}

function _kvRead(namespace) {
  const fp = _kvFilePath(namespace);
  if (!fs.existsSync(fp)) return {};
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { return {}; }
}

function _kvWrite(namespace, store) {
  if (!fs.existsSync(kvDir)) fs.mkdirSync(kvDir, { recursive: true });
  fs.writeFileSync(_kvFilePath(namespace), JSON.stringify(store, null, 2), 'utf8');
}

function kvGet(input) {
  const key = input.key || '';
  const namespace = input.namespace || 'default';
  const store = _kvRead(namespace);
  const found = Object.prototype.hasOwnProperty.call(store, key);
  return { _engine: 'real', key, value: found ? store[key] : null, found };
}

function kvSet(input) {
  const key = input.key || '';
  const value = input.value;
  const namespace = input.namespace || 'default';
  const store = _kvRead(namespace);
  store[key] = value;
  _kvWrite(namespace, store);
  return { _engine: 'real', key, value, status: 'stored' };
}

function kvList(input) {
  const namespace = input.namespace || 'default';
  const store = _kvRead(namespace);
  const keys = Object.keys(store);
  return { _engine: 'real', keys, count: keys.length };
}

function textTokenEstimateCost(input) {
  const text = input.text || '';
  const model = input.model || 'claude-sonnet-4-20250514';
  const tokens = Math.ceil(text.length / 4);

  const priceTable = {
    'claude-sonnet-4-20250514':   { input: 3.00,  output: 15.00 },
    'claude-haiku-4-5-20251001':  { input: 0.80,  output: 4.00  },
    'gpt-4o':                     { input: 2.50,  output: 10.00 },
    'gpt-4o-mini':                { input: 0.15,  output: 0.60  },
    'gemini-2.0-flash':           { input: 0.10,  output: 0.40  },
  };

  const prices = priceTable[model] || priceTable['claude-sonnet-4-20250514'];
  const input_cost_usd  = (tokens / 1_000_000) * prices.input;
  const output_cost_usd = (tokens / 1_000_000) * prices.output;

  return {
    _engine: 'real',
    tokens,
    model,
    input_cost_usd:  parseFloat(input_cost_usd.toFixed(8)),
    output_cost_usd: parseFloat(output_cost_usd.toFixed(8)),
    prices_as_of: '2026-03',
  };
}

function jsonSchemaValidate(input) {
  const data = input.data;
  const schema = input.schema || {};
  const errors = _validateAgainstSchema(data, schema, '');
  return { _engine: 'real', valid: errors.length === 0, errors };
}

// ─── VERIFICATION LAYER ─────────────────────────────────────────────────────

function codeComplexityScore(input) {
  const code = input.code || '';
  const lines = code.split('\n');
  const decisionPoints = [];
  const decisionPatterns = [
    { re: /\bif\s*\(/, type: 'if' },
    { re: /\belse\b/, type: 'else' },
    { re: /\bfor\s*\(/, type: 'for' },
    { re: /\bwhile\s*\(/, type: 'while' },
    { re: /\bswitch\s*\(/, type: 'switch' },
    { re: /\bcase\s+.+:/, type: 'case' },
    { re: /&&/, type: '&&' },
    { re: /\|\|/, type: '||' },
    { re: /\?[^:]/, type: 'ternary' },
    { re: /\bcatch\s*\(/, type: 'catch' },
  ];
  lines.forEach((line, idx) => {
    decisionPatterns.forEach(({ re, type }) => {
      const g = new RegExp(re.source, 'g');
      let m;
      while ((m = g.exec(line)) !== null) {
        decisionPoints.push({ line: idx + 1, type });
      }
    });
  });
  const cyclomatic = 1 + decisionPoints.length;
  // cognitive complexity: weight decision points by nesting depth
  let depth = 0;
  let cognitive = 0;
  lines.forEach(line => {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    depth = Math.max(0, depth + opens - closes);
    decisionPatterns.forEach(({ re }) => {
      if (re.test(line)) cognitive += 1 + depth;
    });
  });
  let rating;
  if (cyclomatic <= 5) rating = 'simple';
  else if (cyclomatic <= 10) rating = 'moderate';
  else if (cyclomatic <= 20) rating = 'complex';
  else rating = 'very_complex';
  return { _engine: 'real', cyclomatic_complexity: cyclomatic, cognitive_complexity: cognitive, lines: lines.length, decision_points: decisionPoints, rating };
}

function textCompareSimilarity(input) {
  const a = (input.a || '').toLowerCase();
  const b = (input.b || '').toLowerCase();
  const wordsA = a.match(/\b\w+\b/g) || [];
  const wordsB = b.match(/\b\w+\b/g) || [];
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = [...setA].filter(w => setB.has(w));
  const union = new Set([...setA, ...setB]);
  const jaccard = union.size === 0 ? 1 : intersection.length / union.size;
  // Levenshtein distance
  const s1 = a, s2 = b;
  const m = s1.length, n = s2.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const lev = dp[m][n];
  const levenshtein_ratio = Math.max(m, n) === 0 ? 1 : 1 - lev / Math.max(m, n);
  const totalWords = new Set([...wordsA, ...wordsB]).size;
  const word_overlap_pct = totalWords === 0 ? 100 : Math.round((intersection.length / totalWords) * 100);
  const unique_to_a = [...setA].filter(w => !setB.has(w));
  const unique_to_b = [...setB].filter(w => !setA.has(w));
  let verdict;
  if (jaccard >= 0.95) verdict = 'identical';
  else if (jaccard >= 0.5) verdict = 'similar';
  else if (jaccard >= 0.2) verdict = 'different';
  else verdict = 'unrelated';
  return { _engine: 'real', jaccard: Math.round(jaccard * 1000) / 1000, levenshtein_ratio: Math.round(levenshtein_ratio * 1000) / 1000, word_overlap_pct, common_words: intersection, unique_to_a, unique_to_b, verdict };
}

function textGrammarCheck(input) {
  const text = input.text || '';
  const issues = [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  let pos = 0;
  // double spaces
  let m;
  const dblSpace = /  +/g;
  while ((m = dblSpace.exec(text)) !== null) {
    issues.push({ position: m.index, rule: 'double_space', message: 'Multiple consecutive spaces', suggestion: 'Replace with a single space' });
  }
  // repeated words
  const repWord = /\b(\w+)\s+\1\b/gi;
  while ((m = repWord.exec(text)) !== null) {
    issues.push({ position: m.index, rule: 'repeated_word', message: `Repeated word: "${m[1]}"`, suggestion: `Remove one "${m[1]}"` });
  }
  // sentence starting with lowercase
  const sentStarts = /(?:^|(?<=[.!?]\s))([a-z])/g;
  while ((m = sentStarts.exec(text)) !== null) {
    issues.push({ position: m.index, rule: 'lowercase_sentence_start', message: 'Sentence starts with lowercase letter', suggestion: 'Capitalize the first letter' });
  }
  // missing period at end
  const trimmed = text.trim();
  if (trimmed.length > 0 && !/[.!?]$/.test(trimmed)) {
    issues.push({ position: trimmed.length, rule: 'missing_end_punctuation', message: 'Text does not end with punctuation', suggestion: 'Add a period, exclamation mark, or question mark' });
  }
  // very long sentences
  sentences.forEach((sent, i) => {
    const wordCount = (sent.match(/\b\w+\b/g) || []).length;
    if (wordCount > 40) {
      issues.push({ position: i, rule: 'long_sentence', message: `Sentence has ${wordCount} words (>40)`, suggestion: 'Consider breaking it into shorter sentences' });
    }
  });
  // passive voice indicators
  const passiveRe = /\b(was|were|is|are|been|being)\s+\w+ed\b/gi;
  while ((m = passiveRe.exec(text)) !== null) {
    issues.push({ position: m.index, rule: 'passive_voice', message: `Possible passive voice: "${m[0]}"`, suggestion: 'Consider rewriting in active voice' });
  }
  // common misspellings
  const misspellings = { 'teh': 'the', 'recieve': 'receive', 'occured': 'occurred', 'seperate': 'separate', 'definately': 'definitely', 'accomodate': 'accommodate', 'occurance': 'occurrence', 'untill': 'until', 'goverment': 'government', 'publically': 'publicly' };
  Object.entries(misspellings).forEach(([bad, good]) => {
    const re = new RegExp(`\\b${bad}\\b`, 'gi');
    while ((m = re.exec(text)) !== null) {
      issues.push({ position: m.index, rule: 'misspelling', message: `Possible misspelling: "${m[0]}"`, suggestion: `Did you mean "${good}"?` });
    }
  });
  const avgSentenceLength = sentences.length === 0 ? 0 : Math.round((text.match(/\b\w+\b/g) || []).length / sentences.length);
  const passiveCount = (text.match(/\b(was|were|is|are|been|being)\s+\w+ed\b/gi) || []).length;
  const score = Math.max(0, 100 - issues.length * 5);
  return { _engine: 'real', issues, score, stats: { sentences: sentences.length, avg_sentence_length: avgSentenceLength, passive_count: passiveCount } };
}

function codeImportGraph(input) {
  const code = input.code || '';
  const language = (input.language || 'javascript').toLowerCase();
  const lines = code.split('\n');
  const imports = [];
  if (language === 'javascript' || language === 'typescript' || language === 'js' || language === 'ts') {
    lines.forEach((line, idx) => {
      // require('x')
      let m;
      const reqRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((m = reqRe.exec(line)) !== null) {
        imports.push({ module: m[1], type: 'default', line: idx + 1 });
      }
      // import x from 'y' / import * as x from 'y' / import { x } from 'y'
      const impDefault = /^\s*import\s+(\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/;
      const impNamed = /^\s*import\s+\{[^}]+\}\s+from\s+['"]([^'"]+)['"]/;
      const impStar = /^\s*import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/;
      const impDynamic = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      if (impStar.test(line)) {
        const mm = line.match(impStar);
        if (mm) imports.push({ module: line.match(/from\s+['"]([^'"]+)['"]/)[1], type: 'star', line: idx + 1 });
      } else if (impNamed.test(line)) {
        const mm = line.match(impNamed);
        if (mm) imports.push({ module: mm[1], type: 'named', line: idx + 1 });
      } else if (impDefault.test(line)) {
        const mm = line.match(/from\s+['"]([^'"]+)['"]/);
        if (mm) imports.push({ module: mm[1], type: 'default', line: idx + 1 });
      }
      while ((m = impDynamic.exec(line)) !== null) {
        imports.push({ module: m[1], type: 'dynamic', line: idx + 1 });
      }
    });
  } else if (language === 'python' || language === 'py') {
    lines.forEach((line, idx) => {
      // from x import y
      let m = line.match(/^\s*from\s+([\w.]+)\s+import\s+(.+)/);
      if (m) {
        const mods = m[2].split(',').map(s => s.trim());
        mods.forEach(mod => {
          imports.push({ module: m[1], type: mod === '*' ? 'star' : 'named', line: idx + 1 });
        });
      } else {
        // import x
        const impRe = /^\s*import\s+([\w.,\s]+)/;
        const mm = line.match(impRe);
        if (mm) {
          mm[1].split(',').map(s => s.trim()).forEach(mod => {
            imports.push({ module: mod.split(' as ')[0].trim(), type: 'default', line: idx + 1 });
          });
        }
      }
    });
  }
  // deduplicate by module+type+line
  const seen = new Set();
  const unique = imports.filter(imp => {
    const key = `${imp.module}:${imp.type}:${imp.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const local = unique.filter(i => i.module.startsWith('./') || i.module.startsWith('../'));
  const external = unique.filter(i => !i.module.startsWith('./') && !i.module.startsWith('../'));
  return { _engine: 'real', imports: unique, external: [...new Set(external.map(i => i.module))], local: [...new Set(local.map(i => i.module))], count: unique.length };
}

function dataPivot(input) {
  const rows = input.rows || [];
  const indexField = input.index || '';
  const columnField = input.columns || '';
  const valueField = input.values || '';
  const map = new Map();
  rows.forEach(row => {
    const indexVal = row[indexField];
    const colVal = row[columnField];
    const val = row[valueField];
    if (!map.has(indexVal)) map.set(indexVal, { [indexField]: indexVal });
    map.get(indexVal)[colVal] = val;
  });
  const pivoted = [...map.values()];
  return { _engine: 'real', pivoted, index_field: indexField, column_field: columnField, value_field: valueField };
}

function textReadingTime(input) {
  const text = input.text || '';
  const words = (text.match(/\b\w+\b/g) || []).length;
  const readingWpm = 238;
  const speakingWpm = 150;
  const reading_time_minutes = words / readingWpm;
  const speaking_time_minutes = words / speakingWpm;
  return {
    _engine: 'real',
    words,
    reading_time_minutes: Math.round(reading_time_minutes * 100) / 100,
    reading_time_seconds: Math.round(reading_time_minutes * 60),
    speaking_time_minutes: Math.round(speaking_time_minutes * 100) / 100,
    speaking_time_seconds: Math.round(speaking_time_minutes * 60),
    pace: '238 wpm reading, 150 wpm speaking'
  };
}

function codeDeadCodeDetect(input) {
  const code = input.code || '';
  const lines = code.split('\n');
  const issues = [];
  // Track declared variables
  const declaredVars = [];
  const declaredFns = [];
  lines.forEach((line, idx) => {
    // const/let/var declarations
    const varRe = /\b(const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=/g;
    let m;
    while ((m = varRe.exec(line)) !== null) {
      declaredVars.push({ name: m[2], line: idx + 1, idx });
    }
    // function declarations
    const fnRe = /\bfunction\s+([a-zA-Z_$][\w$]*)\s*\(/g;
    while ((m = fnRe.exec(line)) !== null) {
      declaredFns.push({ name: m[1], line: idx + 1, idx });
    }
    // arrow function assigned to const/let
    const arrowRe = /\b(const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g;
    while ((m = arrowRe.exec(line)) !== null) {
      if (!declaredFns.find(f => f.name === m[2] && f.line === idx + 1)) {
        declaredFns.push({ name: m[2], line: idx + 1, idx });
      }
    }
  });
  // Check each declared variable for usage elsewhere in code
  declaredVars.forEach(({ name, line, idx }) => {
    // Count occurrences outside the declaration line
    const otherLines = lines.filter((_, i) => i !== idx).join('\n');
    const usageRe = new RegExp(`\\b${name}\\b`);
    if (!usageRe.test(otherLines)) {
      issues.push({ line, type: 'unused_variable', name, message: `Variable "${name}" is declared but never used` });
    }
  });
  // Check each declared function for calls elsewhere
  declaredFns.forEach(({ name, line, idx }) => {
    const otherLines = lines.filter((_, i) => i !== idx).join('\n');
    const callRe = new RegExp(`\\b${name}\\s*\\(`);
    if (!callRe.test(otherLines)) {
      issues.push({ line, type: 'unused_function', name, message: `Function "${name}" is defined but never called` });
    }
  });
  // Unreachable code after return/throw
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (/^\s*(return|throw)\b/.test(line) && idx + 1 < lines.length) {
      const next = lines[idx + 1].trim();
      if (next.length > 0 && next !== '}' && next !== '{' && !next.startsWith('//') && !next.startsWith('*') && !next.startsWith('case ') && !next.startsWith('default:')) {
        issues.push({ line: idx + 2, type: 'unreachable', name: next.slice(0, 40), message: `Unreachable code after ${trimmed.startsWith('return') ? 'return' : 'throw'} on line ${idx + 1}` });
      }
    }
  });
  const score = Math.max(0, 100 - issues.length * 10);
  return { _engine: 'real', issues, score };
}

// ─── EXPORTS ────────────────────────────────────────────────────────────────

module.exports = {
  'text-word-count': textWordCount,
  'text-char-count': textCharCount,
  'text-extract-emails': textExtractEmails,
  'text-extract-urls': textExtractUrls,
  'text-extract-phones': textExtractPhones,
  'text-extract-numbers': textExtractNumbers,
  'text-extract-dates': textExtractDates,
  'text-extract-mentions': textExtractMentions,
  'text-extract-hashtags': textExtractHashtags,
  'text-regex-test': textRegexTest,
  'text-regex-replace': textRegexReplace,
  'text-diff': textDiff,
  'text-slugify': textSlugify,
  'text-truncate': textTruncate,
  'text-language-detect': textLanguageDetect,
  'text-profanity-check': textProfanityCheck,
  'text-readability-score': textReadabilityScore,
  'text-keyword-extract': textKeywordExtract,
  'text-sentence-split': textSentenceSplit,
  'text-deduplicate-lines': textDeduplicateLines,
  'text-sort-lines': textSortLines,
  'text-reverse': textReverse,
  'text-case-convert': textCaseConvert,
  'text-lorem-ipsum': textLoremIpsum,
  'text-count-frequency': textCountFrequency,
  'text-strip-html': textStripHtml,
  'text-escape-html': textEscapeHtml,
  'text-unescape-html': textUnescapeHtml,
  'text-markdown-to-html': textMarkdownToHtml,
  'text-csv-to-json': textCsvToJson,
  'text-json-to-csv': textJsonToCsv,
  'text-xml-to-json': textXmlToJson,
  'text-yaml-to-json': textYamlToJson,
  'text-json-validate': textJsonValidate,
  'text-json-format': textJsonFormat,
  'text-json-path': textJsonPath,
  'text-json-flatten': textJsonFlatten,
  'text-json-unflatten': textJsonUnflatten,
  'text-json-diff': textJsonDiff,
  'text-json-merge': textJsonMerge,
  'text-json-schema-generate': textJsonSchemaGenerate,
  'text-base64-encode': textBase64Encode,
  'text-base64-decode': textBase64Decode,
  'text-url-encode': textUrlEncode,
  'text-url-decode': textUrlDecode,
  'text-url-parse': textUrlParse,
  'text-hex-encode': textHexEncode,
  'text-hex-decode': textHexDecode,
  'text-rot13': textRot13,
  'crypto-hash-sha256': cryptoHashSha256,
  'crypto-hash-sha512': cryptoHashSha512,
  'crypto-hash-md5': cryptoHashMd5,
  'crypto-hmac': cryptoHmac,
  'crypto-uuid': cryptoUuid,
  'crypto-nanoid': cryptoNanoid,
  'crypto-password-generate': cryptoPasswordGenerate,
  'crypto-password-hash': cryptoPasswordHash,
  'crypto-password-verify': cryptoPasswordVerify,
  'crypto-random-bytes': cryptoRandomBytes,
  'crypto-random-int': cryptoRandomInt,
  'crypto-jwt-sign': cryptoJwtSign,
  'crypto-jwt-verify': cryptoJwtVerify,
  'crypto-jwt-decode': cryptoJwtDecode,
  'crypto-otp-generate': cryptoOtpGenerate,
  'crypto-encrypt-aes': cryptoEncryptAes,
  'crypto-decrypt-aes': cryptoDecryptAes,
  'crypto-checksum-file': cryptoChecksumFile,
  'math-evaluate': mathEvaluate,
  'math-statistics': mathStatistics,
  'math-percentile': mathPercentile,
  'math-histogram': mathHistogram,
  'math-currency-convert': mathCurrencyConvert,
  'math-unit-convert': mathUnitConvert,
  'math-color-convert': mathColorConvert,
  'math-number-format': mathNumberFormat,
  'math-compound-interest': mathCompoundInterest,
  'math-loan-payment': mathLoanPayment,
  'math-roi-calculate': mathRoiCalculate,
  'math-percentage-change': mathPercentageChange,
  'math-fibonacci': mathFibonacci,
  'math-prime-check': mathPrimeCheck,
  'math-gcd': mathGcd,
  'math-lcm': mathLcm,
  'math-base-convert': mathBaseConvert,
  'date-parse': dateParse,
  'date-format': dateFormat,
  'date-diff': dateDiff,
  'date-add': dateAdd,
  'date-subtract': dateSubtract,
  'date-timezone-convert': dateTimezoneConvert,
  'date-weekday': dateWeekday,
  'date-is-business-day': dateIsBusinessDay,
  'date-business-days-between': dateBusinessDaysBetween,
  'date-cron-parse': dateCronParse,
  'date-cron-next': dateCronNext,
  'date-unix-to-iso': dateUnixToIso,
  'date-iso-to-unix': dateIsoToUnix,
  'date-relative': dateRelative,
  'net-dns-lookup': netDnsLookup,
  'net-dns-mx': netDnsMx,
  'net-dns-txt': netDnsTxt,
  'net-dns-ns': netDnsNs,
  'net-url-status': netUrlStatus,
  'net-url-headers': netUrlHeaders,
  'net-url-redirect-chain': netUrlRedirectChain,
  'net-ip-validate': netIpValidate,
  'net-ip-info': netIpInfo,
  'net-cidr-contains': netCidrContains,
  'net-email-validate': netEmailValidate,
  'gen-qr-data': genQrData,
  'gen-fake-name': genFakeName,
  'gen-fake-email': genFakeEmail,
  'gen-fake-company': genFakeCompany,
  'gen-fake-address': genFakeAddress,
  'gen-fake-phone': genFakePhone,
  'gen-fake-credit-card': genFakeCreditCard,
  'gen-fake-uuid': genFakeUuid,
  'gen-fake-date': genFakeDate,
  'gen-fake-sentence': genFakeSentence,
  'gen-fake-paragraph': genFakeParagraph,
  'gen-fake-user': genFakeUser,
  'gen-color-palette': genColorPalette,
  'gen-slug': genSlug,
  'gen-short-id': genShortId,
  'code-json-to-typescript': codeJsonToTypescript,
  'code-json-to-python-class': codeJsonToPythonClass,
  'code-json-to-go-struct': codeJsonToGoStruct,
  'code-sql-format': codeSqlFormat,
  'code-cron-explain': codeCronExplain,
  'code-regex-explain': codeRegexExplain,
  'code-semver-compare': codeSemverCompare,
  'code-semver-bump': codeSemverBump,
  'code-diff-stats': codeDiffStats,
  'code-env-parse': codeEnvParse,
  'code-jwt-inspect': codeJwtInspect,
  'crypto-checksum': cryptoChecksumFile,
  'net-url-parse': textUrlParse,
  'text-html-to-text': textHtmlToText,
  'text-table-format': textTableFormat,
  'text-tree-format': textTreeFormat,
  'math-mortgage-amortize': mathMortgageAmortize,
  'math-tax-estimate': mathTaxEstimate,
  'date-holidays': dateHolidays,
  'gen-avatar-svg': genAvatarSvg,
  'gen-qr-svg': genQrSvg,
  'code-openapi-validate': codeOpenapiValidate,
  'code-dockerfile-lint': codeDockerfileLint,
  'math-matrix-multiply': mathMatrixMultiply,
  'crypto-totp-generate': cryptoTotpGenerate,
  'text-diff-unified': textDiffUnified,
  'code-gitignore-generate': codeGitignoreGenerate,
  'text-cron-to-english': textCronToEnglish,
  'text-token-count': textTokenCount,
  'text-chunk': textChunk,
  'text-template': textTemplate,
  'text-sanitize': textSanitize,
  'text-markdown-toc': textMarkdownToc,
  'text-indent': textIndent,
  'text-wrap': textWrap,
  'text-detect-encoding': textDetectEncoding,
  'code-json-to-zod': codeJsonToZod,
  'code-css-minify': codeCssMinify,
  'code-js-minify': codeJsMinify,
  'math-moving-average': mathMovingAverage,
  'math-linear-regression': mathLinearRegression,
  'math-expression-to-latex': mathExpressionToLatex,
  'gen-cron-expression': genCronExpression,
  'crypto-hash-compare': cryptoHashCompare,
  'code-package-json-generate': codePackageJsonGenerate,
  'gen-lorem-code': genLoremCode,
  'text-markdown-lint': textMarkdownLint,
  'code-html-minify': codeHtmlMinify,
  'llm-output-extract-json': llmOutputExtractJson,
  'llm-output-validate': llmOutputValidate,
  'llm-output-fix-json': llmOutputFixJson,
  'webhook-send': webhookSend,
  'file-download': fileDownload,
  'kv-get': kvGet,
  'kv-set': kvSet,
  'kv-list': kvList,
  'text-token-estimate-cost': textTokenEstimateCost,
  'json-schema-validate': jsonSchemaValidate,
  'code-complexity-score': codeComplexityScore,
  'text-compare-similarity': textCompareSimilarity,
  'text-grammar-check': textGrammarCheck,
  'code-import-graph': codeImportGraph,
  'data-pivot': dataPivot,
  'text-reading-time': textReadingTime,
  'code-dead-code-detect': codeDeadCodeDetect,
};
