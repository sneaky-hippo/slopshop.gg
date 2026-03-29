const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const KEY = JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.slopshop', 'config.json'), 'utf8')).api_key;

// Read 10 lines from server-v2.js
const allLines = fs.readFileSync('server-v2.js', 'utf8').split('\n');
const start = 947;
const sample = allLines.slice(start, start + 10).join('\n');

console.log('Sample (lines ' + start + '-' + (start + 10) + '):');
console.log(sample.slice(0, 200) + '...\n');

// Call slop API directly to avoid shell escaping
const body = JSON.stringify({
  text: `Code from server-v2.js lines ${start}-${start+10}:\n${sample}\n\nFind ONE specific improvement. Output EXACTLY:\nFIND: <copy exact text from above to replace>\nREPLACE: <your improved version>`,
  provider: 'anthropic',
  model: 'claude-sonnet-4-6'
});

const req = https.request({
  hostname: 'slopshop.gg', path: '/v1/llm-think', method: 'POST',
  headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity' },
  timeout: 30000,
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(d);
      const answer = (parsed.data || parsed).answer || '';
      console.log('Response:', answer.length, 'chars\n');

      if (answer.includes('FIND:') && answer.includes('REPLACE:')) {
        const findText = answer.split('FIND:')[1].split('REPLACE:')[0].trim();
        const replaceText = answer.split('REPLACE:')[1].trim().split('\n\n')[0];

        console.log('FIND:', findText.slice(0, 100));
        console.log('REPLACE:', replaceText.slice(0, 100));

        // Verify
        const fullFile = fs.readFileSync('server-v2.js', 'utf8');
        const exists = fullFile.includes(findText);
        console.log('\nFIND exists in file:', exists);

        if (exists) {
          console.log('✓ THIS EDIT WOULD WORK — the hive CAN edit files');
        } else {
          console.log('✗ Find text not in file — hallucinated');
        }
      } else {
        console.log('No FIND/REPLACE found in response');
        console.log(answer.slice(0, 300));
      }
    } catch(e) { console.log('Parse error:', e.message, d.slice(0, 200)); }
  });
});
req.on('error', e => console.log('Error:', e.message));
req.write(body);
req.end();
