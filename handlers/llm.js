// ============================================================
// LLM HANDLERS — Slopshop
// Real HTTP calls to Anthropic or OpenAI depending on env vars.
// ============================================================

'use strict';

const https = require('https');

// ============================================================
// PROVIDER DETECTION
// ============================================================

// Multi-LLM provider support: Anthropic, OpenAI, Grok (xAI), DeepSeek
const PROVIDERS = {
  anthropic: { host: 'api.anthropic.com', path: '/v1/messages', keyEnv: 'ANTHROPIC_API_KEY', format: 'anthropic' },
  openai: { host: 'api.openai.com', path: '/v1/chat/completions', keyEnv: 'OPENAI_API_KEY', format: 'openai' },
  grok: { host: 'api.x.ai', path: '/v1/chat/completions', keyEnv: 'XAI_API_KEY', format: 'openai' },
  deepseek: { host: 'api.deepseek.com', path: '/v1/chat/completions', keyEnv: 'DEEPSEEK_API_KEY', format: 'openai' },
  ollama: { host: process.env.OLLAMA_HOST || 'localhost', port: process.env.OLLAMA_PORT || 11434, path: '/api/chat', keyEnv: 'OLLAMA_ENABLED', format: 'ollama' },
};

const DEFAULT_MODELS = {
  anthropic: 'claude-opus-4-6',
  openai: 'gpt-4o',
  grok: 'grok-3',
  deepseek: 'deepseek-chat',
  ollama: process.env.OLLAMA_MODEL || 'llama3',
};

function getProvider(requested) {
  if (requested && PROVIDERS[requested] && process.env[PROVIDERS[requested].keyEnv]) return requested;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.XAI_API_KEY) return 'grok';
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  if (process.env.OLLAMA_ENABLED) return 'ollama';
  return null;
}

function getAvailableProviders() {
  return Object.entries(PROVIDERS).filter(([_, p]) => process.env[p.keyEnv]).map(([name]) => name);
}

function noKeyResponse(slug) {
  return {
    _engine: 'needs_key',
    _unlock: 'Set ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or DEEPSEEK_API_KEY',
    available_providers: getAvailableProviders(),
    api: slug,
  };
}

// ============================================================
// RAW HTTPS HELPER
// ============================================================

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(new Error('Request timed out')); });
    req.write(payload);
    req.end();
  });
}

// ============================================================
// CORE LLM CALLER
// ============================================================

async function callLLM(systemPrompt, userMessage, input = {}) {
  // Support explicit provider selection: input.provider = 'grok' | 'deepseek' | 'openai' | 'anthropic'
  const providerName = getProvider(input.provider);
  if (!providerName) throw new Error('No API key configured. Available: ' + getAvailableProviders().join(', '));

  const providerConfig = PROVIDERS[providerName];
  const model = input.model || DEFAULT_MODELS[providerName];
  const temperature = input.temperature !== undefined ? input.temperature : 0.7;
  // BYOK: Use user-provided key if present, fall back to platform key
  const apiKey = input._api_key || process.env[providerConfig.keyEnv];

  if (providerConfig.format === 'anthropic') {
    const resp = await httpsPost(
      providerConfig.host,
      providerConfig.path,
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: 1024, temperature, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }
    );
    if (resp.status !== 200) throw new Error(`${providerName} error ${resp.status}: ${JSON.stringify(resp.body).slice(0, 200)}`);
    return { text: resp.body?.content?.[0]?.text ?? '', model: resp.body?.model ?? model, provider: providerName };
  }

  // Ollama (local open source models)
  if (providerConfig.format === 'ollama') {
    const http = require('http');
    const body = JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], stream: false });
    const resp = await new Promise(resolve => {
      const req = http.request({ hostname: providerConfig.host, port: providerConfig.port, path: providerConfig.path, method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 60000 }, res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ error: d }); } });
      }); req.on('error', e => resolve({ error: e.message })); req.write(body); req.end();
    });
    if (resp.error) throw new Error('Ollama error: ' + JSON.stringify(resp.error).slice(0, 200));
    return { text: resp.message?.content || '', model: resp.model || model, provider: 'ollama' };
  }

  // OpenAI-compatible format (OpenAI, Grok/xAI, DeepSeek)
  const resp = await httpsPost(
    providerConfig.host,
    providerConfig.path,
    { Authorization: `Bearer ${apiKey}` },
    { model, max_tokens: 1024, temperature, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] }
  );
  if (resp.status !== 200) throw new Error(`${providerName} error ${resp.status}: ${JSON.stringify(resp.body).slice(0, 200)}`);
  return { text: resp.body?.choices?.[0]?.message?.content ?? '', model: resp.body?.model ?? model, provider: providerName };
}

// ============================================================
// JSON EXTRACTION HELPER
// ============================================================

function extractJSON(text) {
  // Try direct parse first
  try { return JSON.parse(text); } catch (_) {}

  // Try to extract from markdown code block
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch (_) {}
  }

  // Try to find first {...} or [...] block
  const objMatch = text.match(/(\{[\s\S]*\})/);
  if (objMatch) {
    try { return JSON.parse(objMatch[1]); } catch (_) {}
  }
  const arrMatch = text.match(/(\[[\s\S]*\])/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[1]); } catch (_) {}
  }

  // Return raw text as fallback
  return { raw: text };
}

// ============================================================
// HANDLER FACTORY
// ============================================================

function makeHandler(slug, systemPrompt, buildUserMessage) {
  return async (input) => {
    if (!getProvider()) return noKeyResponse(slug);

    try {
      const userMessage = buildUserMessage(input);
      const { text, model, provider } = await callLLM(systemPrompt, userMessage, input);
      const parsed = extractJSON(text);
      return { _engine: 'llm', _model: model, _provider: provider, ...parsed };
    } catch (err) {
      return { _engine: 'llm', _error: err.message, api: slug };
    }
  };
}

// ============================================================
// ============================================================
// HANDLERS
// ============================================================
// ============================================================

// ── CONTENT GENERATION ──────────────────────────────────────

const handlers = {};

// llm-blog-outline
handlers['llm-blog-outline'] = makeHandler(
  'llm-blog-outline',
  `You are a content strategist. Given a blog topic and optional keywords, produce a structured blog post outline.
Respond ONLY in JSON format: { "title": string, "sections": [ { "heading": string, "key_points": string[] } ] }`,
  (input) => `Topic: ${input.topic || input.text || ''}
Keywords: ${(input.keywords || []).join(', ') || 'none'}
Target audience: ${input.audience || 'general'}
Tone: ${input.tone || 'informative'}`
);

// llm-blog-draft
handlers['llm-blog-draft'] = makeHandler(
  'llm-blog-draft',
  `You are a professional blog writer. Generate a complete blog post draft.
Respond ONLY in JSON format: { "title": string, "intro": string, "sections": [ { "heading": string, "body": string } ], "conclusion": string, "word_count": number }`,
  (input) => `Topic/Outline: ${input.topic || input.outline || input.text || ''}
Tone: ${input.tone || 'informative'}
Target length: ${input.length || 'medium (~600 words)'}
Audience: ${input.audience || 'general'}`
);

// llm-landing-page-copy
handlers['llm-landing-page-copy'] = makeHandler(
  'llm-landing-page-copy',
  `You are a conversion copywriter. Generate compelling landing page copy.
Respond ONLY in JSON format: { "headline": string, "subheadline": string, "value_proposition": string, "bullets": string[], "cta": string, "social_proof": string }`,
  (input) => `Product/Service: ${input.product || input.text || ''}
Target audience: ${input.audience || 'general'}
Key benefits: ${input.benefits || ''}
Tone: ${input.tone || 'persuasive'}`
);

// llm-product-description
handlers['llm-product-description'] = makeHandler(
  'llm-product-description',
  `You are a product copywriter. Generate a compelling product description from specs.
Respond ONLY in JSON format: { "short_description": string, "long_description": string, "features": string[], "use_cases": string[], "seo_description": string }`,
  (input) => `Product name: ${input.name || input.product || ''}
Specs: ${input.specs || input.text || ''}
Target audience: ${input.audience || 'general'}
Tone: ${input.tone || 'engaging'}`
);

// llm-email-draft
handlers['llm-email-draft'] = makeHandler(
  'llm-email-draft',
  `You are a professional email writer. Draft a clear, effective email.
Respond ONLY in JSON format: { "subject": string, "greeting": string, "body": string, "closing": string, "signature": string }`,
  (input) => `Context: ${input.context || input.text || ''}
Intent/Goal: ${input.intent || ''}
Recipient: ${input.recipient || 'colleague'}
Tone: ${input.tone || 'professional'}
Sender name: ${input.sender || ''}`
);

// llm-email-reply
handlers['llm-email-reply'] = makeHandler(
  'llm-email-reply',
  `You are a professional email writer. Draft a reply to an email thread.
Respond ONLY in JSON format: { "subject": string, "body": string, "tone_used": string }`,
  (input) => `Original email/thread: ${input.thread || input.email || input.text || ''}
How to respond: ${input.intent || input.instructions || ''}
Tone: ${input.tone || 'professional'}`
);

// llm-cold-outreach
handlers['llm-cold-outreach'] = makeHandler(
  'llm-cold-outreach',
  `You are a sales copywriter specializing in cold outreach. Write a personalized, high-converting cold outreach message.
Respond ONLY in JSON format: { "subject": string, "opening": string, "value_prop": string, "cta": string, "full_message": string }`,
  (input) => `Prospect name: ${input.prospect_name || input.name || ''}
Prospect company: ${input.company || ''}
Prospect role: ${input.role || ''}
Prospect info: ${input.prospect_info || input.text || ''}
Sender product/service: ${input.product || input.offering || ''}
Goal: ${input.goal || 'book a meeting'}`
);

// llm-ad-copy
handlers['llm-ad-copy'] = makeHandler(
  'llm-ad-copy',
  `You are an advertising copywriter. Generate ad copy variants.
Respond ONLY in JSON format: { "variants": [ { "headline": string, "description": string, "cta": string } ], "platform": string }`,
  (input) => `Product/Service: ${input.product || input.text || ''}
Platform: ${input.platform || 'Google Ads'}
Audience: ${input.audience || 'general'}
Key message: ${input.message || ''}
Character limits: headline ${input.headline_limit || 30}, description ${input.description_limit || 90}
Number of variants: ${input.variants || 3}`
);

// llm-social-post
handlers['llm-social-post'] = makeHandler(
  'llm-social-post',
  `You are a social media manager. Generate an engaging social media post optimized for the target platform.
Respond ONLY in JSON format: { "post": string, "hashtags": string[], "character_count": number, "platform": string, "variants": string[] }`,
  (input) => `Topic/Content: ${input.topic || input.text || ''}
Platform: ${input.platform || 'Twitter/X'}
Tone: ${input.tone || 'engaging'}
Brand voice: ${input.brand_voice || 'friendly'}
Include hashtags: ${input.hashtags !== false}`
);

// llm-video-script
handlers['llm-video-script'] = makeHandler(
  'llm-video-script',
  `You are a video scriptwriter. Generate a structured video script.
Respond ONLY in JSON format: { "title": string, "duration_estimate": string, "hook": string, "sections": [ { "label": string, "script": string, "visual_notes": string } ], "cta": string }`,
  (input) => `Topic: ${input.topic || input.text || ''}
Duration: ${input.duration || '2-3 minutes'}
Style: ${input.style || 'educational'}
Audience: ${input.audience || 'general'}
Platform: ${input.platform || 'YouTube'}`
);

// llm-press-release
handlers['llm-press-release'] = makeHandler(
  'llm-press-release',
  `You are a PR professional. Write a polished press release.
Respond ONLY in JSON format: { "headline": string, "subheadline": string, "dateline": string, "lead": string, "body": string, "quote": string, "boilerplate": string, "contact": string }`,
  (input) => `News/Event: ${input.news || input.text || ''}
Company: ${input.company || ''}
Date: ${input.date || new Date().toDateString()}
Contact info: ${input.contact || ''}
Quote attribution: ${input.quote_from || 'CEO'}`
);

// llm-tagline
handlers['llm-tagline'] = makeHandler(
  'llm-tagline',
  `You are a brand strategist and copywriter. Generate memorable tagline options.
Respond ONLY in JSON format: { "taglines": [ { "text": string, "rationale": string } ] }`,
  (input) => `Brand/Product: ${input.brand || input.product || input.text || ''}
Industry: ${input.industry || ''}
Values: ${input.values || ''}
Tone: ${input.tone || 'memorable'}
Number of options: ${input.count || 5}`
);

// ── ANALYSIS & SUMMARIZATION ─────────────────────────────────

// llm-summarize
handlers['llm-summarize'] = makeHandler(
  'llm-summarize',
  `You are a summarization expert. Summarize the provided text clearly and accurately.
Respond ONLY in JSON format: { "summary": string, "key_points": string[], "word_count_original": number, "word_count_summary": number }`,
  (input) => `Text to summarize:
${input.text || input.content || ''}

Length: ${input.length || 'medium'}
Focus: ${input.focus || 'general'}`
);

// llm-think — Pure reasoning agent. Answers questions directly. Does not summarize.
handlers['llm-think'] = makeHandler(
  'llm-think',
  `You are a senior AI consultant. Answer the user's question directly, specifically, and actionably.
Do NOT summarize or describe the question. ANSWER it.
If asked to write something (spec, plan, copy), write it directly.
If asked to analyze, give concrete findings.
If asked to decide, make a clear decision with reasoning.
Respond in JSON: { "answer": string, "confidence": number (0-1), "action_items": string[] }`,
  (input) => input.text || input.question || input.prompt || ''
);

// llm-council — Get feedback from ALL available LLM providers on the same prompt
handlers['llm-council'] = async (input) => {
  const available = getAvailableProviders();
  if (available.length === 0) return noKeyResponse('llm-council');

  const prompt = input.text || input.question || '';
  const systemPrompt = 'You are a senior AI advisor. Answer directly and specifically. Keep it under 200 words.';
  const responses = {};

  for (const providerName of available) {
    try {
      const { text, model, provider } = await callLLM(systemPrompt, prompt, { provider: providerName });
      // Extract answer from JSON if present
      let answer = text;
      try { const parsed = JSON.parse(text); answer = parsed.answer || text; } catch(e) {}
      if (answer.includes('```json')) {
        answer = answer.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        try { const p = JSON.parse(answer); answer = p.answer || answer; } catch(e) {}
      }
      responses[providerName] = { model, answer: answer.slice(0, 500) };
    } catch (e) {
      responses[providerName] = { error: e.message };
    }
  }

  return { _engine: 'llm', council: responses, providers_queried: available.length, question: prompt.slice(0, 200) };
};

// llm-summarize-thread
handlers['llm-summarize-thread'] = makeHandler(
  'llm-summarize-thread',
  `You are an expert at summarizing communication threads. Extract the essence, decisions, and next steps.
Respond ONLY in JSON format: { "summary": string, "participants": string[], "key_decisions": string[], "action_items": [ { "task": string, "owner": string, "due": string } ], "open_questions": string[] }`,
  (input) => `Thread (email/chat):
${input.thread || input.text || ''}`
);

// llm-sentiment
handlers['llm-sentiment'] = makeHandler(
  'llm-sentiment',
  `You are a sentiment analysis expert. Analyze the sentiment of text at both overall and aspect level.
Respond ONLY in JSON format: { "overall": { "label": string, "score": number }, "aspects": [ { "aspect": string, "sentiment": string, "score": number, "evidence": string } ], "emotions": string[], "summary": string }`,
  (input) => `Text to analyze:
${input.text || input.content || ''}

Aspects to focus on: ${(input.aspects || []).join(', ') || 'auto-detect'}`
);

// llm-classify
handlers['llm-classify'] = makeHandler(
  'llm-classify',
  `You are a text classification expert. Classify the given text into the provided categories.
Respond ONLY in JSON format: { "primary_category": string, "confidence": number, "all_scores": [ { "category": string, "score": number } ], "reasoning": string }`,
  (input) => `Text: ${input.text || input.content || ''}
Categories: ${(input.categories || []).join(', ')}
Multi-label: ${input.multi_label || false}`
);

// llm-extract-entities
handlers['llm-extract-entities'] = makeHandler(
  'llm-extract-entities',
  `You are a named entity recognition expert. Extract all named entities from the text.
Respond ONLY in JSON format: { "people": string[], "organizations": string[], "locations": string[], "dates": string[], "amounts": string[], "products": string[], "other": [ { "entity": string, "type": string } ] }`,
  (input) => `Text:
${input.text || input.content || ''}`
);

// llm-extract-action-items
handlers['llm-extract-action-items'] = makeHandler(
  'llm-extract-action-items',
  `You are an expert at extracting action items from meeting notes and messages.
Respond ONLY in JSON format: { "action_items": [ { "task": string, "owner": string, "due_date": string, "priority": string, "context": string } ], "total_count": number }`,
  (input) => `Text (meeting notes / messages):
${input.text || input.content || ''}

Context: ${input.context || ''}`
);

// llm-extract-key-points
handlers['llm-extract-key-points'] = makeHandler(
  'llm-extract-key-points',
  `You are a document analysis expert. Extract the most important key points from the text.
Respond ONLY in JSON format: { "key_points": [ { "point": string, "importance": string, "supporting_detail": string } ], "theme": string }`,
  (input) => `Document:
${input.text || input.content || ''}

Max points: ${input.max_points || 10}`
);

// llm-tone-analyze
handlers['llm-tone-analyze'] = makeHandler(
  'llm-tone-analyze',
  `You are a writing tone and style analyst. Analyze the tone and style of the provided text.
Respond ONLY in JSON format: { "primary_tone": string, "secondary_tones": string[], "formality": string, "confidence_level": string, "readability": string, "style_notes": string[], "suggestions": string[] }`,
  (input) => `Text to analyze:
${input.text || input.content || ''}`
);

// llm-translate
handlers['llm-translate'] = makeHandler(
  'llm-translate',
  `You are a professional translator. Translate text accurately while preserving meaning and tone.
Respond ONLY in JSON format: { "translation": string, "source_language": string, "target_language": string, "notes": string[] }`,
  (input) => `Text to translate:
${input.text || input.content || ''}

Target language: ${input.target_language || input.to || 'Spanish'}
Source language: ${input.source_language || input.from || 'auto-detect'}
Preserve tone: ${input.preserve_tone !== false}`
);

// llm-rewrite
handlers['llm-rewrite'] = makeHandler(
  'llm-rewrite',
  `You are a writing expert. Rewrite the provided text in the requested tone or style.
Respond ONLY in JSON format: { "rewritten": string, "changes_made": string[], "tone_achieved": string }`,
  (input) => `Original text:
${input.text || input.content || ''}

Target tone/style: ${input.tone || input.style || 'professional'}
Instructions: ${input.instructions || ''}
Preserve meaning: ${input.preserve_meaning !== false}`
);

// llm-proofread
handlers['llm-proofread'] = makeHandler(
  'llm-proofread',
  `You are a professional proofreader and editor. Check for grammar, spelling, punctuation, and style issues.
Respond ONLY in JSON format: { "corrected_text": string, "issues": [ { "type": string, "original": string, "suggestion": string, "explanation": string } ], "overall_quality": string, "issue_count": number }`,
  (input) => `Text to proofread:
${input.text || input.content || ''}

Style guide: ${input.style_guide || 'standard'}
Language: ${input.language || 'en-US'}`
);

// llm-explain-code
handlers['llm-explain-code'] = makeHandler(
  'llm-explain-code',
  `You are a software educator. Explain code in plain English that a non-expert can understand.
Respond ONLY in JSON format: { "summary": string, "language": string, "what_it_does": string, "step_by_step": string[], "concepts_used": string[], "potential_issues": string[] }`,
  (input) => `Code to explain:
\`\`\`
${input.code || input.text || ''}
\`\`\`
Language: ${input.language || 'auto-detect'}
Audience: ${input.audience || 'general developer'}`
);

// llm-explain-error
handlers['llm-explain-error'] = makeHandler(
  'llm-explain-error',
  `You are a debugging expert. Explain error messages clearly and provide actionable fix suggestions.
Respond ONLY in JSON format: { "error_type": string, "plain_explanation": string, "likely_causes": string[], "fix_suggestions": [ { "suggestion": string, "code_example": string } ], "prevention": string }`,
  (input) => `Error message:
${input.error || input.text || ''}

Context/Code:
${input.code || input.context || ''}
Language/Framework: ${input.language || 'auto-detect'}`
);

// llm-explain-command
handlers['llm-explain-command'] = makeHandler(
  'llm-explain-command',
  `You are a command-line expert. Explain shell commands in plain English.
Respond ONLY in JSON format: { "command": string, "summary": string, "breakdown": [ { "part": string, "explanation": string } ], "what_it_does": string, "warnings": string[], "examples": string[] }`,
  (input) => `Command to explain:
${input.command || input.text || ''}

Shell: ${input.shell || 'bash'}`
);

// llm-explain-regex
handlers['llm-explain-regex'] = makeHandler(
  'llm-explain-regex',
  `You are a regex expert. Explain regular expressions in plain English.
Respond ONLY in JSON format: { "pattern": string, "summary": string, "breakdown": [ { "part": string, "explanation": string } ], "matches": string[], "does_not_match": string[], "use_case": string }`,
  (input) => `Regex pattern: ${input.pattern || input.regex || input.text || ''}
Language/Flavor: ${input.flavor || 'JavaScript'}`
);

// llm-explain-sql
handlers['llm-explain-sql'] = makeHandler(
  'llm-explain-sql',
  `You are a SQL expert. Explain SQL queries in plain English.
Respond ONLY in JSON format: { "summary": string, "tables_used": string[], "operations": string[], "step_by_step": string[], "performance_notes": string[], "plain_english": string }`,
  (input) => `SQL query:
\`\`\`sql
${input.query || input.sql || input.text || ''}
\`\`\`
Database: ${input.database || 'generic SQL'}`
);

// ── CODE GENERATION ──────────────────────────────────────────

// llm-code-generate
handlers['llm-code-generate'] = makeHandler(
  'llm-code-generate',
  `You are a senior software engineer. Generate clean, production-ready code from a description.
Respond ONLY in JSON format: { "code": string, "language": string, "explanation": string, "dependencies": string[], "usage_example": string }`,
  (input) => `Description: ${input.description || input.text || ''}
Language: ${input.language || 'JavaScript'}
Framework: ${input.framework || ''}
Requirements: ${input.requirements || ''}
Style: ${input.style || 'clean and well-commented'}`
);

// llm-code-review
handlers['llm-code-review'] = makeHandler(
  'llm-code-review',
  `You are a senior code reviewer. Review the code for bugs, security vulnerabilities, and performance issues.
Respond ONLY in JSON format: { "overall_rating": string, "summary": string, "bugs": [ { "line": string, "issue": string, "fix": string } ], "security_issues": [ { "issue": string, "severity": string, "fix": string } ], "performance_issues": string[], "style_suggestions": string[], "strengths": string[] }`,
  (input) => `Code to review:
\`\`\`
${input.code || input.text || ''}
\`\`\`
Language: ${input.language || 'auto-detect'}
Context: ${input.context || ''}`
);

// llm-code-refactor
handlers['llm-code-refactor'] = makeHandler(
  'llm-code-refactor',
  `You are a refactoring expert. Suggest and apply improvements to the code structure and quality.
Respond ONLY in JSON format: { "refactored_code": string, "changes": [ { "description": string, "reason": string } ], "improvements": string[], "before_after_notes": string }`,
  (input) => `Code to refactor:
\`\`\`
${input.code || input.text || ''}
\`\`\`
Language: ${input.language || 'auto-detect'}
Goals: ${input.goals || 'readability, maintainability, performance'}`
);

// llm-code-test-generate
handlers['llm-code-test-generate'] = makeHandler(
  'llm-code-test-generate',
  `You are a test engineer. Generate comprehensive unit tests for the provided code.
Respond ONLY in JSON format: { "tests": string, "framework": string, "test_cases": [ { "name": string, "description": string } ], "coverage_notes": string, "setup_instructions": string }`,
  (input) => `Code to test:
\`\`\`
${input.code || input.text || ''}
\`\`\`
Language: ${input.language || 'auto-detect'}
Test framework: ${input.framework || 'auto-select'}
Test style: ${input.style || 'unit tests with edge cases'}`
);

// llm-code-document
handlers['llm-code-document'] = makeHandler(
  'llm-code-document',
  `You are a technical documentation writer. Generate documentation and docstrings for the provided code.
Respond ONLY in JSON format: { "documented_code": string, "readme_section": string, "functions": [ { "name": string, "description": string, "params": string[], "returns": string } ] }`,
  (input) => `Code to document:
\`\`\`
${input.code || input.text || ''}
\`\`\`
Language: ${input.language || 'auto-detect'}
Doc style: ${input.doc_style || 'JSDoc/standard for the language'}`
);

// llm-code-convert
handlers['llm-code-convert'] = makeHandler(
  'llm-code-convert',
  `You are a polyglot programmer. Convert code from one language to another accurately.
Respond ONLY in JSON format: { "converted_code": string, "source_language": string, "target_language": string, "notes": string[], "dependencies": string[] }`,
  (input) => `Code to convert:
\`\`\`
${input.code || input.text || ''}
\`\`\`
From: ${input.from || input.source_language || 'auto-detect'}
To: ${input.to || input.target_language || 'Python'}
Notes: ${input.notes || ''}`
);

// llm-sql-generate
handlers['llm-sql-generate'] = makeHandler(
  'llm-sql-generate',
  `You are a SQL expert. Generate SQL queries from natural language descriptions.
Respond ONLY in JSON format: { "sql": string, "explanation": string, "tables_assumed": string[], "assumptions": string[], "variations": string[] }`,
  (input) => `Request: ${input.request || input.description || input.text || ''}
Database: ${input.database || 'PostgreSQL'}
Schema context: ${input.schema || ''}
Tables: ${input.tables || ''}`
);

// llm-regex-generate
handlers['llm-regex-generate'] = makeHandler(
  'llm-regex-generate',
  `You are a regex expert. Generate accurate regular expressions from plain English descriptions.
Respond ONLY in JSON format: { "pattern": string, "flags": string, "explanation": string, "test_matches": string[], "test_non_matches": string[], "language_note": string }`,
  (input) => `Description: ${input.description || input.text || ''}
Language/Flavor: ${input.language || input.flavor || 'JavaScript'}
Examples of what should match: ${(input.examples || []).join(', ') || ''}
Examples of what should NOT match: ${(input.non_examples || []).join(', ') || ''}`
);

// llm-commit-message
handlers['llm-commit-message'] = makeHandler(
  'llm-commit-message',
  `You are a git commit message expert. Generate clear, conventional commit messages from diffs.
Respond ONLY in JSON format: { "message": string, "type": string, "scope": string, "subject": string, "body": string, "footer": string, "alternatives": string[] }`,
  (input) => `Diff:
${input.diff || input.text || ''}

Convention: ${input.convention || 'Conventional Commits'}
Scope: ${input.scope || 'auto-detect'}`
);

// llm-pr-description
handlers['llm-pr-description'] = makeHandler(
  'llm-pr-description',
  `You are a senior engineer who writes thorough pull request descriptions.
Respond ONLY in JSON format: { "title": string, "summary": string, "changes": string[], "motivation": string, "testing": string[], "breaking_changes": string[], "screenshots_needed": boolean, "reviewer_notes": string }`,
  (input) => `Diff / changes:
${input.diff || input.text || ''}

Branch: ${input.branch || ''}
Ticket/Issue: ${input.ticket || ''}
Additional context: ${input.context || ''}`
);

// ── BUSINESS INTELLIGENCE ────────────────────────────────────

// llm-meeting-prep
handlers['llm-meeting-prep'] = makeHandler(
  'llm-meeting-prep',
  `You are a professional meeting facilitator. Generate comprehensive meeting prep notes.
Respond ONLY in JSON format: { "agenda": string[], "background": string, "key_questions": string[], "talking_points": string[], "goals": string[], "prep_checklist": string[] }`,
  (input) => `Meeting topic: ${input.topic || input.text || ''}
Attendees: ${(input.attendees || []).join(', ') || input.attendees || ''}
Duration: ${input.duration || '60 minutes'}
Meeting type: ${input.type || 'general'}
Context: ${input.context || ''}`
);

// llm-decision-analyze
handlers['llm-decision-analyze'] = makeHandler(
  'llm-decision-analyze',
  `You are a strategic advisor. Analyze a decision with pros, cons, risks, and a recommendation.
Respond ONLY in JSON format: { "decision": string, "pros": string[], "cons": string[], "risks": string[], "opportunities": string[], "recommendation": string, "confidence": string, "next_steps": string[] }`,
  (input) => `Decision to analyze: ${input.decision || input.text || ''}
Context: ${input.context || ''}
Constraints: ${input.constraints || ''}
Goals: ${input.goals || ''}`
);

// llm-competitor-brief
handlers['llm-competitor-brief'] = makeHandler(
  'llm-competitor-brief',
  `You are a competitive intelligence analyst. Generate a competitor brief from available information.
Respond ONLY in JSON format: { "company": string, "summary": string, "strengths": string[], "weaknesses": string[], "products": string[], "positioning": string, "target_market": string, "differentiators": string[], "threats_to_us": string[], "opportunities": string[] }`,
  (input) => `Competitor: ${input.company || input.competitor || input.text || ''}
Known info: ${input.info || ''}
Our company context: ${input.our_company || ''}
Industry: ${input.industry || ''}`
);

// llm-job-description
handlers['llm-job-description'] = makeHandler(
  'llm-job-description',
  `You are an HR professional and talent acquisition expert. Write a compelling job description.
Respond ONLY in JSON format: { "title": string, "summary": string, "responsibilities": string[], "requirements": string[], "nice_to_have": string[], "benefits": string[], "about_company": string, "full_jd": string }`,
  (input) => `Role: ${input.role || input.title || input.text || ''}
Requirements: ${input.requirements || ''}
Company: ${input.company || ''}
Seniority: ${input.seniority || 'mid-level'}
Remote policy: ${input.remote || 'flexible'}
Salary range: ${input.salary || ''}`
);

// llm-interview-questions
handlers['llm-interview-questions'] = makeHandler(
  'llm-interview-questions',
  `You are a talent acquisition expert. Generate targeted interview questions for a role.
Respond ONLY in JSON format: { "role": string, "technical_questions": string[], "behavioral_questions": string[], "situational_questions": string[], "culture_fit_questions": string[], "red_flag_questions": string[] }`,
  (input) => `Role: ${input.role || input.text || ''}
Level: ${input.level || 'mid-level'}
Key skills: ${(input.skills || []).join(', ') || ''}
Interview type: ${input.type || 'full interview loop'}
Focus areas: ${input.focus || ''}`
);

// llm-performance-review
handlers['llm-performance-review'] = makeHandler(
  'llm-performance-review',
  `You are an HR professional. Draft a balanced, constructive performance review.
Respond ONLY in JSON format: { "summary": string, "strengths": string[], "areas_for_improvement": string[], "achievements": string[], "goals_for_next_period": string[], "overall_rating": string, "full_review": string }`,
  (input) => `Employee notes/observations: ${input.notes || input.text || ''}
Employee name: ${input.employee || 'the employee'}
Role: ${input.role || ''}
Review period: ${input.period || 'annual'}
Rating scale: ${input.scale || '1-5'}`
);

// llm-proposal-draft
handlers['llm-proposal-draft'] = makeHandler(
  'llm-proposal-draft',
  `You are a business development expert. Draft a compelling business proposal.
Respond ONLY in JSON format: { "title": string, "executive_summary": string, "problem_statement": string, "proposed_solution": string, "scope": string[], "timeline": string, "pricing": string, "why_us": string, "next_steps": string[], "full_proposal": string }`,
  (input) => `Proposal specs: ${input.specs || input.text || ''}
Client: ${input.client || ''}
Our company: ${input.company || ''}
Budget range: ${input.budget || ''}
Timeline: ${input.timeline || ''}`
);

// llm-contract-summarize
handlers['llm-contract-summarize'] = makeHandler(
  'llm-contract-summarize',
  `You are a legal analyst. Summarize contract key terms and flag risks. Note: this is not legal advice.
Respond ONLY in JSON format: { "summary": string, "parties": string[], "key_terms": [ { "term": string, "description": string } ], "obligations": string[], "risks": [ { "risk": string, "severity": string } ], "important_dates": string[], "termination_clauses": string[], "disclaimer": string }`,
  (input) => `Contract text:
${input.contract || input.text || ''}

Focus areas: ${input.focus || 'all'}`
);

// llm-legal-clause-explain
handlers['llm-legal-clause-explain'] = makeHandler(
  'llm-legal-clause-explain',
  `You are a legal educator. Explain legal clauses in plain English. Note: this is not legal advice.
Respond ONLY in JSON format: { "plain_english": string, "key_obligations": string[], "rights_granted": string[], "limitations": string[], "red_flags": string[], "questions_to_ask_lawyer": string[], "disclaimer": string }`,
  (input) => `Legal clause:
${input.clause || input.text || ''}

Context: ${input.context || ''}`
);

// llm-support-reply
handlers['llm-support-reply'] = makeHandler(
  'llm-support-reply',
  `You are a customer support specialist. Generate a helpful, empathetic support ticket reply.
Respond ONLY in JSON format: { "subject": string, "reply": string, "tone": string, "resolution_type": string, "follow_up_needed": boolean, "escalate": boolean, "tags": string[] }`,
  (input) => `Support ticket:
${input.ticket || input.text || ''}

Product: ${input.product || ''}
Customer tier: ${input.tier || 'standard'}
Previous interactions: ${input.history || 'none'}
Resolution goal: ${input.goal || 'resolve issue'}`
);

// ============================================================
// NEW TIER 2 LLM HANDLERS (15 more)
// ============================================================

handlers['llm-data-extract'] = makeHandler('llm-data-extract',
  'You extract structured data from unstructured text. The user provides text and optionally a schema. Return JSON with extracted fields.',
  (input) => `Extract structured data from this text:\n\n${input.text || input.input}\n\n${input.schema ? 'Use this schema: ' + JSON.stringify(input.schema) : 'Infer the best schema.'}\n\nReturn as JSON.`
);

handlers['llm-email-subject'] = makeHandler('llm-email-subject',
  'Generate 3-5 compelling email subject lines. Return JSON: {"subjects": ["...", "..."], "recommended": "..."}',
  (input) => `Generate email subject lines for this email:\n\n${input.text || input.body || input.input}\n\nReturn JSON with subjects array and recommended pick.`
);

handlers['llm-seo-meta'] = makeHandler('llm-seo-meta',
  'Generate SEO meta tags. Return JSON: {"title": "max 60 chars", "description": "max 160 chars", "keywords": ["..."]}',
  (input) => `Generate SEO meta tags for this content:\n\n${input.text || input.content || input.input}\n\nReturn JSON with title, description, keywords.`
);

handlers['llm-changelog'] = makeHandler('llm-changelog',
  'Generate a changelog entry from git diff or commits. Return JSON: {"version": "...", "date": "...", "changes": [{"type": "added|changed|fixed|removed", "description": "..."}]}',
  (input) => `Generate changelog entry from:\n\n${input.diff || input.commits || input.text || input.input}\n\nReturn JSON with version, date, and categorized changes.`
);

handlers['llm-api-doc'] = makeHandler('llm-api-doc',
  'Generate API documentation. Return JSON: {"endpoint": "...", "method": "...", "description": "...", "parameters": [...], "response": {...}, "example": {...}}',
  (input) => `Generate API documentation for:\n\n${input.code || input.text || input.input}\n\nReturn comprehensive JSON documentation.`
);

handlers['llm-bug-report'] = makeHandler('llm-bug-report',
  'Generate structured bug report. Return JSON: {"title": "...", "severity": "critical|high|medium|low", "steps_to_reproduce": [...], "expected": "...", "actual": "...", "environment": "..."}',
  (input) => `Generate a bug report from:\n\n${input.error || input.text || input.input}\n\nReturn structured JSON bug report.`
);

handlers['llm-user-story'] = makeHandler('llm-user-story',
  'Generate user stories. Return JSON: {"stories": [{"as_a": "...", "i_want": "...", "so_that": "...", "acceptance_criteria": [...]}]}',
  (input) => `Generate user stories from this feature description:\n\n${input.feature || input.text || input.input}\n\nReturn JSON with stories in "As a X, I want Y, so that Z" format.`
);

handlers['llm-okr-generate'] = makeHandler('llm-okr-generate',
  'Generate OKRs. Return JSON: {"objectives": [{"objective": "...", "key_results": [{"kr": "...", "metric": "...", "target": "..."}]}]}',
  (input) => `Generate OKRs from these goals:\n\n${input.goals || input.text || input.input}\n\nReturn JSON with measurable objectives and key results.`
);

handlers['llm-faq-generate'] = makeHandler('llm-faq-generate',
  'Generate FAQ. Return JSON: {"faqs": [{"question": "...", "answer": "..."}]}',
  (input) => `Generate FAQ for:\n\n${input.product || input.text || input.input}\n\nReturn JSON with 5-10 Q&A pairs.`
);

handlers['llm-persona-create'] = makeHandler('llm-persona-create',
  'Generate user persona. Return JSON: {"name": "...", "age": N, "role": "...", "goals": [...], "pain_points": [...], "behaviors": [...]}',
  (input) => `Create a user persona for:\n\n${input.audience || input.text || input.input}\n\nReturn detailed JSON persona.`
);

handlers['llm-swot-analysis'] = makeHandler('llm-swot-analysis',
  'Generate SWOT analysis. Return JSON: {"strengths": [...], "weaknesses": [...], "opportunities": [...], "threats": [...], "summary": "..."}',
  (input) => `SWOT analysis for:\n\n${input.business || input.text || input.input}\n\nReturn JSON SWOT.`
);

handlers['llm-executive-summary'] = makeHandler('llm-executive-summary',
  'Generate executive summary. Return JSON: {"summary": "2-3 paragraphs", "key_metrics": [...], "recommendations": [...]}',
  (input) => `Write executive summary of:\n\n${input.report || input.text || input.input}\n\nReturn JSON with summary, metrics, recommendations.`
);

handlers['llm-slack-summary'] = makeHandler('llm-slack-summary',
  'Summarize Slack messages. Return JSON: {"summary": "...", "key_decisions": [...], "action_items": [...], "topics": [...]}',
  (input) => `Summarize these Slack messages:\n\n${input.messages || input.text || input.input}\n\nReturn JSON with summary, decisions, action items.`
);

handlers['llm-meeting-agenda'] = makeHandler('llm-meeting-agenda',
  'Generate meeting agenda. Return JSON: {"title": "...", "duration_minutes": N, "agenda_items": [{"topic": "...", "duration": N, "owner": "...", "notes": "..."}]}',
  (input) => `Create meeting agenda for:\n\nTopic: ${input.topic || input.text || input.input}\nAttendees: ${input.attendees || 'team'}\nGoals: ${input.goals || 'discuss and decide'}\n\nReturn JSON agenda.`
);

handlers['llm-release-notes'] = makeHandler('llm-release-notes',
  'Generate user-facing release notes. Return JSON: {"version": "...", "highlights": [...], "features": [...], "fixes": [...], "breaking_changes": [...]}',
  (input) => `Generate release notes from:\n\n${input.commits || input.changelog || input.text || input.input}\n\nReturn user-friendly JSON release notes.`
);

// ============================================================
// EXPORTS
// ============================================================

module.exports = handlers;
