/**
 * SLOPSHOP EXTERNAL SERVICE HANDLERS
 *
 * These APIs call external services (Slack, GitHub, etc.).
 * Each checks for the required env var. If missing, returns
 * { _engine: 'needs_key', _unlock: 'Set ENV_VAR_NAME' }
 *
 * When the env var IS set, the handler makes the REAL API call.
 */

const https = require('https');
const http = require('http');

function post(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = { hostname, path, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, timeout: 15000 };
    const mod = hostname.includes('localhost') ? http : https;
    const req = mod.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch (e) { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

function needsKey(envVar, description) {
  return { _engine: 'needs_key', _unlock: `Set ${envVar} environment variable`, _description: description };
}

const handlers = {};

// ===== SLACK =====
handlers['ext-slack-post'] = async (input) => {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return needsKey('SLACK_WEBHOOK_URL', 'Slack incoming webhook URL');
  try {
    const u = new URL(url);
    const res = await post(u.hostname, u.pathname, {}, { text: input.text || input.message || input.input });
    return { _engine: 'real', status: res.status === 200 ? 'sent' : 'failed', response: res.body };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

// ===== DISCORD =====
handlers['ext-discord-post'] = async (input) => {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return needsKey('DISCORD_WEBHOOK_URL', 'Discord webhook URL');
  try {
    const u = new URL(url);
    const res = await post(u.hostname, u.pathname, {}, { content: input.text || input.message || input.input });
    return { _engine: 'real', status: res.status === 204 ? 'sent' : 'failed' };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

// ===== GITHUB =====
handlers['ext-github-issue'] = async (input) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return needsKey('GITHUB_TOKEN', 'GitHub personal access token');
  const repo = input.repo || input.repository; // format: "owner/repo"
  if (!repo) return { _engine: 'real', error: 'Provide repo as "owner/repo"' };
  try {
    const res = await post('api.github.com', `/repos/${repo}/issues`, {
      Authorization: `Bearer ${token}`, 'User-Agent': 'slopshop', Accept: 'application/vnd.github.v3+json',
    }, { title: input.title || 'New Issue', body: input.body || input.text || '', labels: input.labels || [] });
    return { _engine: 'real', issue_number: res.body.number, url: res.body.html_url, state: res.body.state };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

handlers['ext-github-pr-comment'] = async (input) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return needsKey('GITHUB_TOKEN', 'GitHub personal access token');
  const repo = input.repo;
  const pr = input.pr || input.pull_request;
  if (!repo || !pr) return { _engine: 'real', error: 'Provide repo ("owner/repo") and pr (number)' };
  try {
    const res = await post('api.github.com', `/repos/${repo}/issues/${pr}/comments`, {
      Authorization: `Bearer ${token}`, 'User-Agent': 'slopshop',
    }, { body: input.body || input.comment || input.text || '' });
    return { _engine: 'real', comment_id: res.body.id, url: res.body.html_url };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

// ===== TELEGRAM =====
handlers['ext-telegram-send'] = async (input) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || input.chat_id;
  if (!token) return needsKey('TELEGRAM_BOT_TOKEN', 'Telegram bot token from @BotFather');
  if (!chatId) return { _engine: 'real', error: 'Set TELEGRAM_CHAT_ID or provide chat_id' };
  try {
    const res = await post('api.telegram.org', `/bot${token}/sendMessage`, {},
      { chat_id: chatId, text: input.text || input.message || input.input, parse_mode: input.parse_mode || 'Markdown' });
    return { _engine: 'real', sent: res.body.ok, message_id: res.body.result?.message_id };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

// ===== SENDGRID EMAIL =====
handlers['ext-email-send'] = async (input) => {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return needsKey('SENDGRID_API_KEY', 'SendGrid API key');
  try {
    const res = await post('api.sendgrid.com', '/v3/mail/send', { Authorization: `Bearer ${key}` }, {
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: input.from || 'noreply@slopshop.gg' },
      subject: input.subject || 'Message from Slopshop',
      content: [{ type: 'text/plain', value: input.text || input.body || input.input }],
    });
    return { _engine: 'real', status: res.status === 202 ? 'sent' : 'failed', http_status: res.status };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

// ===== SMS (TWILIO) =====
handlers['ext-sms-send'] = async (input) => {
  const sid = process.env.TWILIO_SID;
  const token = process.env.TWILIO_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token) return needsKey('TWILIO_SID + TWILIO_TOKEN', 'Twilio account SID and auth token');
  const to = input.to || input.phone;
  if (!to) return { _engine: 'real', error: 'Provide "to" phone number' };
  try {
    const body = `To=${encodeURIComponent(to)}&From=${encodeURIComponent(from || '+10000000000')}&Body=${encodeURIComponent(input.text || input.message || input.input)}`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await post('api.twilio.com', `/2010-04-01/Accounts/${sid}/Messages.json`,
      { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body);
    return { _engine: 'real', status: res.body.status, sid: res.body.sid };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

// ===== NOTION =====
handlers['ext-notion-page'] = async (input) => {
  const key = process.env.NOTION_API_KEY;
  if (!key) return needsKey('NOTION_API_KEY', 'Notion integration token');
  const parent = input.parent_id || input.database_id;
  if (!parent) return { _engine: 'real', error: 'Provide parent_id (page or database ID)' };
  try {
    const res = await post('api.notion.com', '/v1/pages', {
      Authorization: `Bearer ${key}`, 'Notion-Version': '2022-06-28',
    }, {
      parent: { database_id: parent },
      properties: { title: { title: [{ text: { content: input.title || input.text || 'New Page' } }] } },
    });
    return { _engine: 'real', page_id: res.body.id, url: res.body.url };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

// ===== LINEAR =====
handlers['ext-linear-issue'] = async (input) => {
  const key = process.env.LINEAR_API_KEY;
  if (!key) return needsKey('LINEAR_API_KEY', 'Linear API key');
  try {
    const res = await post('api.linear.app', '/graphql', {
      Authorization: key, 'Content-Type': 'application/json',
    }, {
      query: `mutation { issueCreate(input: { title: "${(input.title || 'New Issue').replace(/"/g, '\\"')}", description: "${(input.body || input.text || '').replace(/"/g, '\\"')}", teamId: "${input.team_id || ''}" }) { success issue { id identifier url } } }`
    });
    return { _engine: 'real', issue: res.body?.data?.issueCreate?.issue };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

// ===== WEB SCREENSHOT (needs puppeteer) =====
handlers['ext-web-screenshot'] = async (input) => {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: input.width || 1280, height: input.height || 720 });
    await page.goto(input.url, { waitUntil: 'networkidle2', timeout: 15000 });
    const screenshot = await page.screenshot({ encoding: 'base64' });
    await browser.close();
    return { _engine: 'real', screenshot_base64: screenshot, width: input.width || 1280, height: input.height || 720, url: input.url };
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') return needsKey('PUPPETEER=1', 'npm install puppeteer');
    return { _engine: 'real', error: e.message };
  }
};

// ===== WEB SCRAPE (needs cheerio) =====
handlers['ext-web-scrape'] = async (input) => {
  const url = input.url;
  if (!url) return { _engine: 'real', error: 'Provide url' };
  // Use built-in https to fetch, then extract text
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 10000, headers: { 'User-Agent': 'slopshop/2.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // Basic scraping with regex (no cheerio needed for basic extraction)
        const title = (data.match(/<title[^>]*>(.*?)<\/title>/i) || [])[1] || '';
        const description = (data.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/) || [])[1] || '';
        const h1s = (data.match(/<h1[^>]*>(.*?)<\/h1>/gi) || []).map(h => h.replace(/<[^>]*>/g, ''));
        const links = (data.match(/href="(https?:\/\/[^"]+)"/gi) || []).map(l => l.match(/href="([^"]+)"/)[1]).slice(0, 20);
        const text = data.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
        resolve({ _engine: 'real', url, title, description, headings: h1s, links_count: links.length, links: links.slice(0, 10), text_preview: text.slice(0, 500) });
      });
    }).on('error', e => resolve({ _engine: 'real', error: e.message }));
  });
};

// ===== S3 UPLOAD =====
handlers['ext-s3-upload'] = async (input) => {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!accessKey || !secretKey || !bucket) return needsKey('AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + S3_BUCKET', 'AWS credentials and S3 bucket');
  return { _engine: 'needs_key', _unlock: 'S3 upload requires AWS SDK. Set credentials and use aws-sdk.', note: 'Will implement with @aws-sdk/client-s3 when credentials are provided.' };
};

// ===== OPENAI EMBEDDING =====
handlers['ext-openai-embedding'] = async (input) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return needsKey('OPENAI_API_KEY', 'OpenAI API key');
  try {
    const res = await post('api.openai.com', '/v1/embeddings', { Authorization: `Bearer ${key}` },
      { model: input.model || 'text-embedding-3-small', input: input.text || input.input });
    return { _engine: 'real', embedding: res.body.data?.[0]?.embedding?.slice(0, 10), dimensions: res.body.data?.[0]?.embedding?.length, model: input.model || 'text-embedding-3-small', usage: res.body.usage };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

// ===== ANTHROPIC MESSAGE =====
handlers['ext-anthropic-message'] = async (input) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return needsKey('ANTHROPIC_API_KEY', 'Anthropic API key');
  try {
    const res = await post('api.anthropic.com', '/v1/messages', {
      'x-api-key': key, 'anthropic-version': '2023-06-01',
    }, {
      model: input.model || 'claude-sonnet-4-20250514',
      max_tokens: input.max_tokens || 1024,
      messages: [{ role: 'user', content: input.text || input.message || input.input }],
      ...(input.system ? { system: input.system } : {}),
    });
    return { _engine: 'real', text: res.body.content?.[0]?.text, model: res.body.model, usage: res.body.usage };
  } catch (e) { return { _engine: 'real', error: e.message }; }
};

// ===== GOOGLE SEARCH =====
handlers['ext-google-search'] = async (input) => {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;
  if (!key || !cx) return needsKey('GOOGLE_API_KEY + GOOGLE_CX', 'Google Custom Search API key and CX');
  const q = encodeURIComponent(input.query || input.text || input.input);
  return new Promise((resolve) => {
    https.get(`https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${q}&num=${input.num || 5}`, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve({ _engine: 'real', results: (j.items || []).map(i => ({ title: i.title, url: i.link, snippet: i.snippet })), total: j.searchInformation?.totalResults });
        } catch (e) { resolve({ _engine: 'real', error: 'Parse error' }); }
      });
    }).on('error', e => resolve({ _engine: 'real', error: e.message }));
  });
};

module.exports = handlers;
