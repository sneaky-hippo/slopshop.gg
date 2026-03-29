const http = require('http');
const fs = require('fs');

const claudeMd = fs.readFileSync('CLAUDE.md', 'utf8').slice(0, 800);
const prompt = `CODEBASE KNOWLEDGE:\n${claudeMd}\n\nBased on this, suggest ONE specific improvement to the slopshop codebase. Name the exact file, function or endpoint, and what to change. Be specific enough to implement in 30 minutes.`;

const body = JSON.stringify({ model: 'llama3', messages: [{ role: 'user', content: prompt }], stream: false });
const req = http.request({ hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
  headers: { 'Content-Type': 'application/json' }, timeout: 60000 }, res => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', () => {
    const answer = JSON.parse(d).message?.content || '';
    console.log('WITH CLAUDE.md:');
    console.log(answer.slice(0, 400));
    console.log();
    console.log('Names real file:', /server-v2|cli\.js|mcp-server|agent\.js|handlers|registry|schemas/i.test(answer));
    console.log('Names real endpoint:', /\/v1\/|memory-|crypto-|text-|auth/i.test(answer));
    console.log('Mentions real architecture:', /express|sqlite|handlers|compute\.js|llm\.js/i.test(answer));
  });
});
req.on('error', e => console.error(e));
req.write(body);
req.end();
