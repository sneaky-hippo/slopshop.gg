/**
 * SLOPSHOP EXTERNAL SERVICE HANDLERS
 *
 * These APIs call external services (Slack, GitHub, S3, etc.).
 * Each checks for the required env var. If missing, returns:
 *   { ok: false, error: "...", requires: ["ENV_VAR"] }
 *
 * When the env var IS set, the handler makes the REAL API call.
 *
 * Features:
 *  - Graceful missing-key errors (never crash)
 *  - 8-second timeout on all external HTTP calls
 *  - Exponential backoff retry (up to 3 attempts) for rate-limited (429) calls
 *  - AWS Signature V4 for S3
 *  - Standardized { ok, error, requires } shape on failure
 */

'use strict';

const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500; // base delay for exponential backoff

// ─── Utility: graceful missing-key response ───────────────────────────────────

/**
 * Returns a standardised error object when a required env var is absent.
 * Shape: { ok: false, error: "...", requires: ["VAR1", ...], _engine: "needs_key" }
 */
function needsKey(envVars, description) {
  const vars = Array.isArray(envVars) ? envVars : [envVars];
  return {
    ok: false,
    _engine: 'needs_key',
    error: `Missing required environment variable(s): ${vars.join(', ')}`,
    requires: vars,
    _unlock: description || `Set ${vars.join(' and ')} in your environment`,
  };
}

/**
 * Returns a standardised error response for runtime failures.
 * Shape: { ok: false, error: "..." }
 */
function runtimeError(message, extra = {}) {
  return { ok: false, _engine: 'real', error: message, ...extra };
}

// ─── Utility: sleep ───────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Core HTTP helper (POST + PUT) with timeout ────────────────────────────────

/**
 * Makes an HTTPS/HTTP request.
 * @param {string} hostname
 * @param {string} path
 * @param {object} headers
 * @param {object|string|Buffer} body
 * @param {object} [opts]  - { method, timeout, isFormEncoded }
 * @returns {Promise<{ status: number, body: any }>}
 */
function request(hostname, path, headers, body, opts = {}) {
  return new Promise((resolve, reject) => {
    const method = opts.method || 'POST';
    const timeoutMs = opts.timeout || DEFAULT_TIMEOUT_MS;

    let data;
    let contentType = 'application/json';
    if (opts.isFormEncoded) {
      data = typeof body === 'string' ? body : new URLSearchParams(body).toString();
      contentType = 'application/x-www-form-urlencoded';
    } else if (Buffer.isBuffer(body)) {
      data = body;
      contentType = headers['Content-Type'] || 'application/octet-stream';
    } else {
      data = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    const reqHeaders = {
      'Content-Type': contentType,
      'Content-Length': buf.length,
      ...headers,
    };

    const mod = hostname.includes('localhost') ? http : https;
    const reqOpts = { hostname, path, method, headers: reqHeaders };

    const req = mod.request(reqOpts, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (_) {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    // Timeout: destroy the socket and reject
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`Request to ${hostname} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on('error', e => {
      clearTimeout(timer);
      reject(e);
    });

    req.on('close', () => clearTimeout(timer));

    req.write(buf);
    req.end();
  });
}

/** Convenience POST wrapper */
function post(hostname, path, headers, body, opts = {}) {
  return request(hostname, path, headers, body, { method: 'POST', ...opts });
}

// ─── Retry with exponential backoff for rate-limited calls ────────────────────

/**
 * Calls fn() and retries on 429 (rate limited) or 503 (service unavailable),
 * using exponential backoff. Non-retriable errors propagate immediately.
 */
async function withRetry(fn, maxRetries = MAX_RETRIES, baseDelayMs = RETRY_BASE_MS) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      // Retry on rate-limit or server-unavailable HTTP responses
      if (result && (result.status === 429 || result.status === 503)) {
        if (attempt === maxRetries) return result; // exhausted retries, return last result
        const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
        await sleep(delayMs);
        continue;
      }
      return result;
    } catch (e) {
      lastError = e;
      if (attempt === maxRetries) throw e;
      const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
      await sleep(delayMs);
    }
  }
  throw lastError;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

const handlers = {};

// ===== SLACK: post a message =====
handlers['ext-slack-post'] = async (input) => {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return needsKey('SLACK_WEBHOOK_URL', 'Slack incoming webhook URL from api.slack.com/apps');
  let u;
  try { u = new URL(url); } catch (_) {
    return runtimeError('SLACK_WEBHOOK_URL is not a valid URL');
  }
  const text = input.text || input.message || input.input;
  if (!text) return runtimeError('Provide text, message, or input');
  try {
    const res = await withRetry(() =>
      post(u.hostname, u.pathname + (u.search || ''), {}, { text })
    );
    return { ok: res.status === 200, _engine: 'real', status: res.status === 200 ? 'sent' : 'failed', http_status: res.status, response: res.body };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== SLACK: list channels =====
handlers['ext-slack-channel-list'] = async (input) => {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return needsKey('SLACK_BOT_TOKEN', 'Slack Bot OAuth token (xoxb-...) from api.slack.com/apps');
  const limit = input.limit || 200;
  const cursor = input.cursor || '';
  const url = `/api/conversations.list?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}&exclude_archived=${input.exclude_archived !== false ? 'true' : 'false'}&types=${input.types || 'public_channel'}`;
  try {
    const res = await withRetry(() =>
      request('slack.com', url, { Authorization: `Bearer ${token}` }, null, { method: 'GET' })
    );
    if (!res.body.ok) return runtimeError(res.body.error || 'Slack API error', { slack_error: res.body.error });
    return {
      ok: true,
      _engine: 'real',
      channels: (res.body.channels || []).map(c => ({
        id: c.id,
        name: c.name,
        is_private: c.is_private,
        is_archived: c.is_archived,
        num_members: c.num_members,
        topic: c.topic?.value || '',
        purpose: c.purpose?.value || '',
      })),
      count: res.body.channels?.length || 0,
      next_cursor: res.body.response_metadata?.next_cursor || null,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== DISCORD: post a message =====
handlers['ext-discord-post'] = async (input) => {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return needsKey('DISCORD_WEBHOOK_URL', 'Discord webhook URL from server channel settings');
  let u;
  try { u = new URL(url); } catch (_) {
    return runtimeError('DISCORD_WEBHOOK_URL is not a valid URL');
  }
  const content = input.text || input.message || input.input || input.content;
  if (!content) return runtimeError('Provide text, message, or content');
  try {
    const res = await withRetry(() =>
      post(u.hostname, u.pathname + (u.search || ''), {}, {
        content,
        username: input.username || undefined,
        avatar_url: input.avatar_url || undefined,
        embeds: input.embeds || undefined,
      })
    );
    // Discord returns 204 No Content on success
    return { ok: res.status === 204 || res.status === 200, _engine: 'real', status: (res.status === 204 || res.status === 200) ? 'sent' : 'failed', http_status: res.status };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== GITHUB: create an issue =====
handlers['ext-github-issue'] = async (input) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return needsKey('GITHUB_TOKEN', 'GitHub personal access token or fine-grained token with issues:write scope');
  const repo = input.repo || input.repository;
  if (!repo || !repo.includes('/')) return runtimeError('Provide repo as "owner/repo"');
  try {
    const res = await withRetry(() =>
      post('api.github.com', `/repos/${repo}/issues`, {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'slopshop/2.0',
        Accept: 'application/vnd.github.v3+json',
      }, {
        title: input.title || 'New Issue',
        body: input.body || input.text || '',
        labels: input.labels || [],
        assignees: input.assignees || [],
        milestone: input.milestone || undefined,
      })
    );
    if (res.status >= 400) return runtimeError(`GitHub API error ${res.status}: ${res.body?.message || JSON.stringify(res.body)}`, { http_status: res.status });
    return {
      ok: true,
      _engine: 'real',
      issue_number: res.body.number,
      url: res.body.html_url,
      state: res.body.state,
      id: res.body.id,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== GITHUB: list issues =====
handlers['ext-github-issues-list'] = async (input) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return needsKey('GITHUB_TOKEN', 'GitHub personal access token with repo read scope');
  const repo = input.repo || input.repository;
  if (!repo || !repo.includes('/')) return runtimeError('Provide repo as "owner/repo"');
  const state = input.state || 'open';
  const perPage = Math.min(input.per_page || 30, 100);
  const page = input.page || 1;
  const labelFilter = input.labels ? `&labels=${encodeURIComponent(input.labels)}` : '';
  const assigneeFilter = input.assignee ? `&assignee=${encodeURIComponent(input.assignee)}` : '';
  const path = `/repos/${repo}/issues?state=${state}&per_page=${perPage}&page=${page}${labelFilter}${assigneeFilter}`;
  try {
    const res = await withRetry(() =>
      request('api.github.com', path, {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'slopshop/2.0',
        Accept: 'application/vnd.github.v3+json',
      }, null, { method: 'GET' })
    );
    if (res.status >= 400) return runtimeError(`GitHub API error ${res.status}: ${res.body?.message || JSON.stringify(res.body)}`, { http_status: res.status });
    const issues = Array.isArray(res.body) ? res.body : [];
    return {
      ok: true,
      _engine: 'real',
      issues: issues.map(i => ({
        number: i.number,
        title: i.title,
        state: i.state,
        url: i.html_url,
        created_at: i.created_at,
        updated_at: i.updated_at,
        user: i.user?.login,
        labels: (i.labels || []).map(l => l.name),
        assignees: (i.assignees || []).map(a => a.login),
        comments: i.comments,
        body_preview: (i.body || '').slice(0, 200),
      })),
      count: issues.length,
      page,
      per_page: perPage,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== GITHUB: create a PR =====
handlers['ext-github-pr-create'] = async (input) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return needsKey('GITHUB_TOKEN', 'GitHub personal access token with repo/pull_requests:write scope');
  const repo = input.repo || input.repository;
  if (!repo || !repo.includes('/')) return runtimeError('Provide repo as "owner/repo"');
  if (!input.head) return runtimeError('Provide head branch (the branch with your changes)');
  if (!input.base) return runtimeError('Provide base branch (the branch to merge into, e.g. "main")');
  try {
    const res = await withRetry(() =>
      post('api.github.com', `/repos/${repo}/pulls`, {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'slopshop/2.0',
        Accept: 'application/vnd.github.v3+json',
      }, {
        title: input.title || `Merge ${input.head} into ${input.base}`,
        body: input.body || input.text || '',
        head: input.head,
        base: input.base,
        draft: input.draft === true,
        maintainer_can_modify: input.maintainer_can_modify !== false,
      })
    );
    if (res.status >= 400) return runtimeError(`GitHub API error ${res.status}: ${res.body?.message || JSON.stringify(res.body)}`, { http_status: res.status });
    return {
      ok: true,
      _engine: 'real',
      pr_number: res.body.number,
      url: res.body.html_url,
      state: res.body.state,
      draft: res.body.draft,
      head: res.body.head?.ref,
      base: res.body.base?.ref,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== GITHUB: comment on a PR =====
handlers['ext-github-pr-comment'] = async (input) => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return needsKey('GITHUB_TOKEN', 'GitHub personal access token with issues:write scope');
  const repo = input.repo;
  const pr = input.pr || input.pull_request;
  if (!repo || !repo.includes('/')) return runtimeError('Provide repo as "owner/repo"');
  if (!pr) return runtimeError('Provide pr (PR number)');
  const body = input.body || input.comment || input.text || '';
  if (!body) return runtimeError('Provide body, comment, or text for the comment');
  try {
    const res = await withRetry(() =>
      post('api.github.com', `/repos/${repo}/issues/${pr}/comments`, {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'slopshop/2.0',
        Accept: 'application/vnd.github.v3+json',
      }, { body })
    );
    if (res.status >= 400) return runtimeError(`GitHub API error ${res.status}: ${res.body?.message || JSON.stringify(res.body)}`, { http_status: res.status });
    return {
      ok: true,
      _engine: 'real',
      comment_id: res.body.id,
      url: res.body.html_url,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== TELEGRAM: send a message =====
handlers['ext-telegram-send'] = async (input) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return needsKey('TELEGRAM_BOT_TOKEN', 'Telegram bot token from @BotFather');
  const chatId = process.env.TELEGRAM_CHAT_ID || input.chat_id;
  if (!chatId) return runtimeError('Set TELEGRAM_CHAT_ID env var or provide chat_id in input');
  const text = input.text || input.message || input.input;
  if (!text) return runtimeError('Provide text or message');
  try {
    const res = await withRetry(() =>
      post('api.telegram.org', `/bot${token}/sendMessage`, {},
        {
          chat_id: chatId,
          text,
          parse_mode: input.parse_mode || 'Markdown',
          disable_web_page_preview: input.disable_preview !== false,
        }
      )
    );
    if (!res.body?.ok) return runtimeError(res.body?.description || `Telegram error ${res.status}`, { http_status: res.status });
    return {
      ok: true,
      _engine: 'real',
      sent: true,
      message_id: res.body.result?.message_id,
      chat_id: chatId,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== SENDGRID: send an email =====
handlers['ext-email-send'] = async (input) => {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return needsKey('SENDGRID_API_KEY', 'SendGrid API key from app.sendgrid.com/settings/api_keys');
  const to = input.to;
  if (!to) return runtimeError('Provide to (recipient email address)');
  const text = input.text || input.body || input.input;
  if (!text && !input.html) return runtimeError('Provide text, html, or body for the email content');
  try {
    const content = [];
    if (text) content.push({ type: 'text/plain', value: text });
    if (input.html) content.push({ type: 'text/html', value: input.html });
    const res = await withRetry(() =>
      post('api.sendgrid.com', '/v3/mail/send', {
        Authorization: `Bearer ${key}`,
      }, {
        personalizations: [{ to: [{ email: to, name: input.to_name || undefined }] }],
        from: { email: input.from || process.env.SENDGRID_FROM_EMAIL || 'noreply@slopshop.gg', name: input.from_name || 'Slopshop' },
        subject: input.subject || 'Message from Slopshop',
        content,
        ...(input.reply_to ? { reply_to: { email: input.reply_to } } : {}),
      })
    );
    // SendGrid returns 202 Accepted on success, with empty body
    const ok = res.status === 202;
    return {
      ok,
      _engine: 'real',
      status: ok ? 'sent' : 'failed',
      http_status: res.status,
      ...(ok ? {} : { error: typeof res.body === 'object' ? (res.body?.errors?.[0]?.message || JSON.stringify(res.body)) : res.body }),
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== TWILIO: send an SMS =====
handlers['ext-sms-send'] = async (input) => {
  const sid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_TOKEN;
  const fromDefault = process.env.TWILIO_FROM;
  if (!sid) return needsKey(['TWILIO_SID', 'TWILIO_TOKEN'], 'Twilio Account SID and Auth Token from twilio.com/console');
  if (!authToken) return needsKey(['TWILIO_SID', 'TWILIO_TOKEN'], 'Twilio Account SID and Auth Token from twilio.com/console');
  const to = input.to || input.phone;
  if (!to) return runtimeError('Provide to phone number (E.164 format, e.g. +15555550100)');
  const from = input.from || fromDefault;
  if (!from) return runtimeError('Provide from phone number or set TWILIO_FROM env var');
  const body = input.text || input.message || input.input;
  if (!body) return runtimeError('Provide text or message');
  try {
    const auth = Buffer.from(`${sid}:${authToken}`).toString('base64');
    const formBody = `To=${encodeURIComponent(to)}&From=${encodeURIComponent(from)}&Body=${encodeURIComponent(body)}`;
    const res = await withRetry(() =>
      post('api.twilio.com', `/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        formBody,
        { isFormEncoded: true }
      )
    );
    if (res.status >= 400) return runtimeError(`Twilio error ${res.status}: ${res.body?.message || JSON.stringify(res.body)}`, { http_status: res.status });
    return {
      ok: true,
      _engine: 'real',
      status: res.body.status,
      sid: res.body.sid,
      to: res.body.to,
      from: res.body.from,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== NOTION: create a page =====
// Handles both database-parent and page-parent inputs
handlers['ext-notion-page'] = async (input) => {
  const key = process.env.NOTION_API_KEY;
  if (!key) return needsKey('NOTION_API_KEY', 'Notion integration token from notion.so/my-integrations');
  const parent = input.parent_id || input.database_id || input.page_id;
  if (!parent) return runtimeError('Provide parent_id (database ID or page ID to create the page under)');
  // Determine parent type: if explicitly set, use it; default to database_id for backward compat
  const parentType = input.parent_type === 'page' ? 'page_id' : 'database_id';
  const parentObj = { [parentType]: parent };
  const title = input.title || input.text || 'New Page';
  const propertiesObj = input.properties || {
    title: { title: [{ text: { content: title } }] },
  };
  try {
    const payload = {
      parent: parentObj,
      properties: propertiesObj,
    };
    if (input.children) payload.children = input.children;
    const res = await withRetry(() =>
      post('api.notion.com', '/v1/pages', {
        Authorization: `Bearer ${key}`,
        'Notion-Version': '2022-06-28',
      }, payload)
    );
    if (res.status >= 400) return runtimeError(`Notion API error ${res.status}: ${res.body?.message || res.body?.code || JSON.stringify(res.body)}`, { http_status: res.status });
    return {
      ok: true,
      _engine: 'real',
      page_id: res.body.id,
      url: res.body.url,
      created_time: res.body.created_time,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== NOTION: create page (alias) =====
handlers['ext-notion-page-create'] = handlers['ext-notion-page'];

// ===== LINEAR: create an issue =====
handlers['ext-linear-issue'] = async (input) => {
  const key = process.env.LINEAR_API_KEY;
  if (!key) return needsKey('LINEAR_API_KEY', 'Linear API key from linear.app/settings/api');
  if (!input.team_id) return runtimeError('Provide team_id (Linear team ID)');
  const query = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
          title
          state { name }
          priority
        }
      }
    }
  `;
  const variables = {
    input: {
      title: input.title || 'New Issue',
      description: input.body || input.description || input.text || '',
      teamId: input.team_id,
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assignee_id ? { assigneeId: input.assignee_id } : {}),
      ...(input.label_ids ? { labelIds: input.label_ids } : {}),
      ...(input.state_id ? { stateId: input.state_id } : {}),
      ...(input.estimate !== undefined ? { estimate: input.estimate } : {}),
    },
  };
  try {
    const res = await withRetry(() =>
      post('api.linear.app', '/graphql', {
        Authorization: key,
      }, { query, variables })
    );
    if (res.status >= 400) return runtimeError(`Linear API error ${res.status}: ${JSON.stringify(res.body)}`, { http_status: res.status });
    if (res.body?.errors) return runtimeError(`Linear GraphQL error: ${res.body.errors[0]?.message || JSON.stringify(res.body.errors)}`, { graphql_errors: res.body.errors });
    const issue = res.body?.data?.issueCreate?.issue;
    return {
      ok: !!res.body?.data?.issueCreate?.success,
      _engine: 'real',
      issue,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== LINEAR: create issue (alias) =====
handlers['ext-linear-issue-create'] = handlers['ext-linear-issue'];

// ===== WEBHOOK: send a POST to any URL =====
handlers['ext-webhook-send'] = async (input) => {
  const url = input.url || input.webhook_url;
  if (!url) return runtimeError('Provide url (the webhook endpoint to POST to)');
  let u;
  try { u = new URL(url); } catch (_) {
    return runtimeError('url is not a valid URL');
  }
  const hostname = u.hostname;
  const path = u.pathname + (u.search || '');
  const method = (input.method || 'POST').toUpperCase();
  const payload = input.payload || input.body || input.data || {};
  const extraHeaders = input.headers || {};
  // Support optional HMAC signing of the payload
  let signatureHeader = {};
  if (input.secret) {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', input.secret).update(payloadStr).digest('hex');
    signatureHeader = { 'X-Hub-Signature-256': `sha256=${sig}` };
  }
  try {
    const res = await withRetry(() =>
      request(hostname, path, {
        'User-Agent': 'slopshop-webhook/2.0',
        ...signatureHeader,
        ...extraHeaders,
      }, payload, { method, timeout: input.timeout_ms || DEFAULT_TIMEOUT_MS })
    );
    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      _engine: 'real',
      http_status: res.status,
      response: res.body,
      ...(input.secret ? { signed: true } : {}),
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== WEB SCREENSHOT (needs puppeteer) =====
handlers['ext-web-screenshot'] = async (input) => {
  const url = input.url;
  if (!url) return runtimeError('Provide url');
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: input.width || 1280, height: input.height || 720 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    const screenshot = await page.screenshot({ encoding: 'base64', fullPage: input.full_page === true });
    await browser.close();
    return {
      ok: true,
      _engine: 'real',
      screenshot_base64: screenshot,
      width: input.width || 1280,
      height: input.height || 720,
      url,
    };
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') return needsKey('PUPPETEER=1', 'Run npm install puppeteer to enable screenshots');
    return runtimeError(e.message);
  }
};

// ===== WEB SCRAPE =====
handlers['ext-web-scrape'] = async (input) => {
  const url = input.url;
  if (!url) return runtimeError('Provide url');
  let u;
  try { u = new URL(url); } catch (_) {
    return runtimeError('url is not a valid URL');
  }
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const req = mod.get(url, { timeout: DEFAULT_TIMEOUT_MS, headers: { 'User-Agent': 'slopshop/2.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const title = (data.match(/<title[^>]*>(.*?)<\/title>/i) || [])[1] || '';
        const description = (data.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/) || [])[1] || '';
        const h1s = (data.match(/<h1[^>]*>(.*?)<\/h1>/gi) || []).map(h => h.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
        const links = (data.match(/href="(https?:\/\/[^"]+)"/gi) || []).map(l => (l.match(/href="([^"]+)"/)||[])[1]).filter(Boolean).slice(0, 20);
        const text = data
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 5000);
        resolve({
          ok: true,
          _engine: 'real',
          url,
          title: title.replace(/<[^>]*>/g, '').trim(),
          description,
          headings: h1s,
          links_count: links.length,
          links: links.slice(0, 10),
          text_preview: text.slice(0, 500),
        });
      });
    });
    req.on('error', e => resolve(runtimeError(e.message)));
    req.on('timeout', () => { req.destroy(); resolve(runtimeError(`Request to ${u.hostname} timed out`)); });
  });
};

// ===== S3 UPLOAD (AWS Signature V4) =====
handlers['ext-s3-upload'] = async (input) => {
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET || input.bucket;
  const region = process.env.AWS_REGION || input.region || 'us-east-1';
  const missing = [];
  if (!accessKey) missing.push('AWS_ACCESS_KEY_ID');
  if (!secretKey) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!bucket) missing.push('S3_BUCKET');
  if (missing.length) return needsKey(missing, 'AWS credentials and S3 bucket name');

  const key = input.key || input.filename || `upload-${Date.now()}`;
  const rawBody = input.content || input.data || '';
  const contentType = input.content_type || 'text/plain';
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));

  // AWS Signature V4
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const s3Path = `/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
  const payloadHash = crypto.createHash('sha256').update(bodyBuf).digest('hex');

  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = ['PUT', s3Path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + secretKey, dateStamp), region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      req.destroy();
      resolve(runtimeError(`S3 upload to ${host} timed out after ${DEFAULT_TIMEOUT_MS}ms`));
    }, DEFAULT_TIMEOUT_MS);

    const req = https.request({
      hostname: host,
      path: s3Path,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': bodyBuf.length,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        Authorization: authHeader,
      },
    }, (res) => {
      clearTimeout(timer);
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve({
            ok: true,
            _engine: 'real',
            key,
            bucket,
            region,
            url: `https://${host}/${key}`,
            size_bytes: bodyBuf.length,
            content_type: contentType,
          });
        } else {
          resolve(runtimeError(`S3 returned ${res.statusCode}: ${d.slice(0, 300)}`, { http_status: res.statusCode }));
        }
      });
    });
    req.on('error', (e) => { clearTimeout(timer); resolve(runtimeError(e.message)); });
    req.write(bodyBuf);
    req.end();
  });
};

// ===== OPENAI EMBEDDING =====
handlers['ext-openai-embedding'] = async (input) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return needsKey('OPENAI_API_KEY', 'OpenAI API key from platform.openai.com/api-keys');
  const text = input.text || input.input;
  if (!text) return runtimeError('Provide text or input to embed');
  try {
    const res = await withRetry(() =>
      post('api.openai.com', '/v1/embeddings', {
        Authorization: `Bearer ${key}`,
      }, {
        model: input.model || 'text-embedding-3-small',
        input: text,
      })
    );
    if (res.status >= 400) return runtimeError(`OpenAI API error ${res.status}: ${res.body?.error?.message || JSON.stringify(res.body)}`, { http_status: res.status });
    const embedding = res.body.data?.[0]?.embedding;
    return {
      ok: true,
      _engine: 'real',
      embedding_preview: embedding?.slice(0, 10),
      dimensions: embedding?.length,
      model: res.body.model,
      usage: res.body.usage,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== ANTHROPIC MESSAGE =====
handlers['ext-anthropic-message'] = async (input) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return needsKey('ANTHROPIC_API_KEY', 'Anthropic API key from console.anthropic.com/settings/keys');
  const content = input.text || input.message || input.input;
  if (!content) return runtimeError('Provide text, message, or input');
  try {
    const res = await withRetry(() =>
      post('api.anthropic.com', '/v1/messages', {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      }, {
        model: input.model || 'claude-sonnet-4-6-20250514',
        max_tokens: input.max_tokens || 1024,
        messages: [{ role: 'user', content }],
        ...(input.system ? { system: input.system } : {}),
      })
    );
    if (res.status >= 400) return runtimeError(`Anthropic API error ${res.status}: ${res.body?.error?.message || JSON.stringify(res.body)}`, { http_status: res.status });
    return {
      ok: true,
      _engine: 'real',
      text: res.body.content?.[0]?.text,
      model: res.body.model,
      usage: res.body.usage,
    };
  } catch (e) {
    return runtimeError(e.message);
  }
};

// ===== GOOGLE CUSTOM SEARCH =====
handlers['ext-google-search'] = async (input) => {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;
  const missing = [];
  if (!key) missing.push('GOOGLE_API_KEY');
  if (!cx) missing.push('GOOGLE_CX');
  if (missing.length) return needsKey(missing, 'Google Custom Search API key and CX (Search Engine ID) from programmablesearchengine.google.com');
  const q = input.query || input.text || input.input;
  if (!q) return runtimeError('Provide query, text, or input');
  const num = Math.min(input.num || 5, 10);
  const qs = `key=${key}&cx=${cx}&q=${encodeURIComponent(q)}&num=${num}${input.start ? `&start=${input.start}` : ''}`;
  return new Promise((resolve) => {
    const req = https.get(`https://www.googleapis.com/customsearch/v1?${qs}`, { timeout: DEFAULT_TIMEOUT_MS }, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (res.statusCode >= 400) {
            resolve(runtimeError(`Google API error ${res.statusCode}: ${j?.error?.message || d.slice(0, 200)}`, { http_status: res.statusCode }));
            return;
          }
          resolve({
            ok: true,
            _engine: 'real',
            results: (j.items || []).map(i => ({
              title: i.title,
              url: i.link,
              snippet: i.snippet,
              display_link: i.displayLink,
            })),
            total: j.searchInformation?.totalResults,
            search_time: j.searchInformation?.searchTime,
          });
        } catch (e) {
          resolve(runtimeError('Failed to parse Google API response'));
        }
      });
    });
    req.on('error', e => resolve(runtimeError(e.message)));
    req.on('timeout', () => { req.destroy(); resolve(runtimeError('Google search request timed out')); });
  });
};

module.exports = handlers;
