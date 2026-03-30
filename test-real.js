#!/usr/bin/env node
const http = require('http');
const fs = require('fs');

function post(slug, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body || {});
    const req = http.request({
      hostname: 'localhost', port: 3000,
      path: '/v1/' + slug, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Authorization': 'Bearer sk-slop-demo-key-12345678' },
      timeout: 10000
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, d: JSON.parse(b) }); }
        catch(e) { resolve({ s: res.statusCode, raw: b.slice(0,100) }); }
      });
    });
    req.on('error', e => resolve({ s: 0, err: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ s: 0, err: 'TIMEOUT' }); });
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve) => {
    http.get('http://localhost:3000' + path, {headers:{'Authorization':'Bearer sk-slop-demo-key-12345678'}}, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

function guess(slug) {
  const s = slug.toLowerCase();
  if (s.startsWith('text-') || s.includes('string') || s.includes('word-') || s.includes('sentence'))
    return {text:'Hello world, this is a test sentence for slopshop API endpoint verification. Another sentence here.',input:'Hello world test',value:'hello world test',case:'upper',length:20,pattern:'\\d+',replacement:'X',original:'hello world',modified:'hello earth',width:20,count:3,char:'-',side:'right',encoding:'base64',operation:'encode',start:0,end:5};
  if (s.startsWith('math-'))
    return {expression:'2+3*4',a:12,b:8,numbers:[1,2,3,4,5],number:17,value:42,n:6,base:2,exponent:10,x:0,decimals:2,min:0,max:100,start:0,end:100,t:0.5,r:2,from:10,to:16};
  if (s.startsWith('json-'))
    return {json:'{"name":"test","value":42}',data:{name:'test',value:42},a:{x:1,y:2},b:{x:1,y:3},path:'$.name',indent:2,schema:{type:'object',properties:{name:{type:'string'}}},template:{fullName:'$.name'}};
  if (s.startsWith('date-'))
    return {date:'2024-01-15',start:'2024-01-01',end:'2024-03-01',year:2024,month:2,timestamp:1705334400,amount:30,unit:'days',from:'UTC',to:'America/New_York',format:'YYYY-MM-DD',birthdate:'2000-01-15',target:'2025-12-31',expression:'0 12 * * *',count:3};
  if (s.startsWith('crypto-'))
    return {text:'hello world',key:'mysecretkey12345',algorithm:'sha256',length:16,token:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'};
  if (s.startsWith('validate-'))
    return {value:'test@example.com',email:'test@example.com',url:'https://slopshop.gg',ip:'192.168.1.1',number:'4111111111111111',phone:'+15551234567',uuid:'550e8400-e29b-41d4-a716-446655440000',password:'MyP@ss!2024',version:'1.2.3',color:'#FF5733',slug:'hello-world',code:'US',port:8080,domain:'slopshop.gg',mac:'00:1B:44:11:3A:B7',expression:'*/5 * * * *',pattern:'^[a-z]+$',iban:'GB29NWBK60161331926819',latitude:40.7128,longitude:-74.006,json:'{"valid":true}',text:'aGVsbG8=',mime:'application/json',token:'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.x'};
  if (s.startsWith('convert-'))
    return {value:100,from:'celsius',to:'fahrenheit',number:'42',input:'hello',amount:100,color:'#FF5733',text:'HELLO',markdown:'# Hello\n\n**bold** text',csv:'name,age\nAlice,30\nBob,25',yaml:'name: test\nvalue: 42',xml:'<root><name>test</name></root>',binary:'01001000 01100101',hex:'#FF5733',epoch:1705334400,direction:'to_text'};
  if (s.startsWith('code-'))
    return {code:'function foo() { return 1; }',language:'javascript',sql:'SELECT * FROM users WHERE age > 18',json:'{"name":"test","age":30,"active":true}',original:'function foo() {\n  return 1;\n}',modified:'function foo() {\n  return 2;\n}',query:'sort array',operation:'html_encode',description:'match email addresses'};
  if (s.startsWith('network-'))
    return {domain:'google.com',url:'https://slopshop.gg/v1/tools?limit=10',ip:'8.8.8.8',code:404,text:'hello%20world',cidr:'192.168.1.0/24',port:443,userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',headers:'Content-Type: application/json\nAuthorization: Bearer token',origin:'https://slopshop.gg',target:'https://api.example.com',mac:'00:1B:44:11:3A:B7',mask:'255.255.255.0',protocol:'https',host:'slopshop.gg',path:'/v1/tools',params:{limit:'10'}};
  if (s.startsWith('image-'))
    return {url:'https://via.placeholder.com/150',width:100,height:100,text:'Test',angle:90,radius:5,quality:80,from:'png',to:'jpeg',svg:'<svg><rect width="10" height="10"/></svg>',direction:'horizontal',color:'#FF0000',x:0,y:0,seed:'test'};
  if (s.startsWith('gen-'))
    return {count:3,length:16,text:'Hello World Test',seed:'test',schema:{name:'string',age:'number'},value:'1234567890',algorithm:'sha256',words:10};
  if (s.startsWith('exec-'))
    return {code:'return 2+2',expression:'2+2',language:'javascript',json:{users:[{name:'Alice'}]},filter:'.users[].name',template:'Hello {{name}}!',data:[{name:'Alice',age:30},{name:'Bob',age:25}],text:'hello 123',pattern:'\\d+',path:'$.users',xml:'<root><item>hi</item></root>',paths:['foo.js','bar.ts','baz.js'],query:'SELECT * WHERE age > 26',rows:[{name:'Alice',age:30}]};
  if (s.startsWith('data-'))
    return {data:[5,3,8,1,9,2,6,4],array:[5,3,8,1,9,2],key:'type',order:'asc',condition:'x > 4',page:1,pageSize:3,size:2,count:3,field:'value',operation:'sum',method:'interpolate',percentile:50,window:3,x:[1,2,3,4,5],y:[2,4,5,4,5],target:3,arrays:[[1,2,3],['a','b','c']],bins:4,a:{x:1,y:2},b:{x:1,z:3},original:{a:1},modified:{a:2}};
  if (s.startsWith('sort-'))
    return {data:[5,3,8,1,9,2],array:[5,3,8,1,9,2],graph:{a:['b','c'],b:['d'],c:['d'],d:[]}};
  if (s.startsWith('search-'))
    return {query:'helo',items:['hello world','goodbye','hello earth'],text:'hello world test',a:'kitten',b:'sitting',data:[1,3,5,7,9,11],target:7,documents:['the cat sat','the dog ran','cats and dogs']};
  if (s.startsWith('ml-'))
    return {text:'I love this product, it is wonderful and amazing!',data:[[1,1],[1.5,2],[3,4],[5,7],[3.5,5]],x:[1,2,3,4,5],y:[2,4,5,4,5],a:[1,2,3],b:[4,5,6],k:2,n:2,documents:['the cat sat','the dog ran','cats and dogs'],query:'cat',training:[{text:'good great',label:'pos'},{text:'bad awful',label:'neg'}],input:'great',method:'min-max',actual:[1,0,1,1,0],predicted:[1,0,0,1,0],point:[3,3],components:1,order:1,transactions:[['a','b'],['a','c'],['b','c']],folds:5};
  if (s.startsWith('finance-'))
    return {amount:1000,principal:1000,rate:5,time:10,n:12,years:30,investment:1000,returns:1500,income:75000,price:100,cost:50,discount:20,tipPercent:18,markup:100,salvage:2000,life:5,fixedCosts:10000,pricePerUnit:50,costPerUnit:30,cashFlows:[-1000,300,400,500,600],from:'USD',to:'EUR',buyPrice:100,sellPrice:150,dividends:5,period:1,value:100};
  if (s.startsWith('sense-'))
    return {url:'https://slopshop.gg',domain:'google.com'};
  if (s.startsWith('enrich-'))
    return {domain:'google.com',ip:'8.8.8.8',email:'test@gmail.com',phone:'+14155551234',name:'Google',url:'https://slopshop.gg',address:'Mountain View CA',userAgent:'Mozilla/5.0',text:'AI is transforming technology',latitude:40.7128,longitude:-74.006};
  if (s.startsWith('comm-'))
    return {url:'https://httpbin.org/post',payload:{test:true},email:'test@gmail.com',phone:'+15551234567',text:'hello'};
  if (s.startsWith('memory-'))
    return {key:'test-'+slug,value:'test-val-123',query:'test',ttl:3600};
  if (s.startsWith('queue-'))
    return {queue:'test-q',item:'test-item',key:'test-q'};
  if (s.startsWith('counter-'))
    return {key:'test-ctr',amount:1,name:'test-ctr'};
  if (s.startsWith('state-'))
    return {key:'test-state',value:{status:'active'}};
  if (s.startsWith('context-'))
    return {};
  if (s.startsWith('orch-'))
    return {slug:'math-evaluate',input:{expression:'2+2'},tasks:[{slug:'math-evaluate',input:{expression:'1+1'}}],steps:[{slug:'math-evaluate',input:{expression:'1+1'}}],key:'test-orch-'+slug,ms:100,event:'test.event',data:{v:42},maxRetries:3,inputs:[{expression:'1+1'},{expression:'2+2'}],ttl:60,limit:10,window:60,threshold:5,timeout:5};
  if (s.includes('security') || s.includes('password'))
    return {password:'MyP@ssw0rd!2024',text:'hello',value:'test123',data:'hello world',algorithm:'sha256',key:'test-sec'};
  if (s.includes('workflow'))
    return {slug:'math-evaluate',input:{expression:'2+2'},key:'test',maxRetries:3,initialDelay:100,maxDelay:1000,backoffFactor:2};
  // Superpowers and exotic handlers - generic input
  return {text:'Hello world test input for slopshop endpoint verification',data:[1,2,3,4,5],value:42,input:'test verification input',name:'test',key:'test-'+slug,query:'test query',code:'return 42',expression:'2+2',url:'https://slopshop.gg',domain:'google.com',count:3,length:10,topic:'artificial intelligence',description:'test description',prompt:'analyze this test input',items:['alpha','beta','gamma'],options:['option-a','option-b'],tags:['test','verification'],category:'test',type:'default',format:'json',mode:'default',threshold:0.5,limit:10,offset:0,seed:'test-seed',context:'testing slopshop endpoints',message:'hello from test suite'};
}

async function main() {
  const tools = await get('/v1/tools?limit=2000');
  if (!tools || !tools.apis) { console.log('FATAL: cannot get tools'); return; }
  const slugs = tools.apis.map(a=>a.slug);
  console.log('Total slugs: ' + slugs.length);

  const START = parseInt(process.env.START||'0');
  const END = Math.min(parseInt(process.env.END||slugs.length), slugs.length);
  const batch = slugs.slice(START, END);
  console.log('Testing ' + START + ' to ' + END + ' (' + batch.length + ' endpoints)');

  let pass=0, fail=0, err=0;
  const failures = [];

  for (let i=0; i<batch.length; i++) {
    const slug = batch[i];
    const input = guess(slug);
    let res = await post(slug, input);
    // Retry on rate limit (429)
    if (res.s === 429) {
      await new Promise(r => setTimeout(r, 2000));
      res = await post(slug, input);
    }
    if (res.s === 429) {
      await new Promise(r => setTimeout(r, 5000));
      res = await post(slug, input);
    }
    const idx = START+i+1;

    if (res.err || res.s === 0) {
      err++;
      failures.push(idx+'|'+slug+'|ERR|'+(res.err||'no response'));
    } else if (res.s >= 500) {
      fail++;
      const msg = res.d ? (res.d.error?.message || res.d.error || JSON.stringify(res.d).slice(0,120)) : (res.raw||'');
      failures.push(idx+'|'+slug+'|500|'+msg);
    } else if (res.s === 400) {
      fail++;
      const msg = res.d ? (res.d.error?.message || res.d.error || JSON.stringify(res.d).slice(0,120)) : (res.raw||'');
      failures.push(idx+'|'+slug+'|400|'+msg);
    } else if (res.s === 200 || res.s === 201) {
      if (res.d && (res.d.ok || res.d.data || res.d.result !== undefined)) {
        pass++;
      } else if (res.d && res.d.error) {
        fail++;
        failures.push(idx+'|'+slug+'|ERR_RESP|'+JSON.stringify(res.d.error).slice(0,120));
      } else {
        pass++; // got 200 with some response
      }
    } else {
      fail++;
      failures.push(idx+'|'+slug+'|HTTP'+res.s+'|'+JSON.stringify(res.d||res.raw).slice(0,100));
    }

    if (i % 100 === 99) process.stdout.write('  progress: '+(i+1)+'/'+batch.length+' pass='+pass+' fail='+fail+' err='+err+'\n');
    // Pace requests to avoid 429 rate limits (120/min = 2/sec)
    await new Promise(r=>setTimeout(r, 100));
  }

  const summary = '\n=== BATCH '+START+'-'+END+' ===\nTotal: '+batch.length+'\nPass: '+pass+' ('+((pass/batch.length)*100).toFixed(1)+'%)\nFail: '+fail+'\nError: '+err;
  console.log(summary);

  if (failures.length > 0) {
    console.log('\n=== ALL FAILURES ===');
    failures.forEach(f => console.log(f));
  }

  const outfile = '/tmp/batch-'+START+'-'+END+'.txt';
  fs.writeFileSync(outfile, 'Pass:'+pass+' Fail:'+fail+' Err:'+err+'\n'+failures.join('\n')+'\n');
  console.log('\nWritten to ' + outfile);
}

main().catch(e => { console.error(e); process.exit(1); });
