/**
 * SLOPSHOP PRE-BUILT PIPES
 *
 * Ready-made workflows that chain APIs together.
 * Each pipe defines the steps, input mapping, and total credit cost.
 *
 * Mount with: require('./pipes')(app, allHandlers, API_DEFS, auth)
 */

const PIPES = {
  'lead-from-text': {
    name: 'Lead from Text',
    desc: 'Extract emails from text, validate they exist, generate prospect profiles.',
    steps: ['text-extract-emails', 'net-email-validate', 'gen-fake-name'],
    credits: 7,
    category: 'Sales',
    example_input: { text: 'Hey reach out to alice@acme.com and bob@example.org about the deal' },
  },
  'content-machine': {
    name: 'Content Machine',
    desc: 'Generate blog outline, draft the post, score readability.',
    steps: ['llm-blog-outline', 'llm-blog-draft', 'text-readability-score'],
    credits: 35,
    category: 'Content',
    example_input: { topic: 'How AI agents use APIs', keywords: 'slopshop, automation, credits' },
  },
  'security-audit': {
    name: 'Security Audit',
    desc: 'Checksum content, validate JSON, check SSL certificate.',
    steps: ['crypto-checksum', 'text-json-validate', 'net-ssl-check'],
    credits: 7,
    category: 'Security',
    example_input: { data: '{"api_key":"test"}', domain: 'slopshop.gg' },
  },
  'code-ship': {
    name: 'Code Ship',
    desc: 'Review code, generate tests, get diff stats.',
    steps: ['llm-code-review', 'llm-code-test-generate', 'code-diff-stats'],
    credits: 35,
    category: 'Dev',
    example_input: { code: 'function add(a,b) { return a + b; }', language: 'javascript' },
  },
  'data-clean': {
    name: 'Data Clean',
    desc: 'Parse CSV to JSON, deduplicate, validate output.',
    steps: ['text-csv-to-json', 'text-deduplicate-lines', 'text-json-validate'],
    credits: 5,
    category: 'Data',
    example_input: { data: 'name,score\nalice,90\nbob,85\nalice,90' },
  },
  'email-intel': {
    name: 'Email Intelligence',
    desc: 'Extract emails from text, extract URLs, extract phone numbers, get word stats.',
    steps: ['text-extract-emails', 'text-extract-urls', 'text-extract-phones', 'text-word-count'],
    credits: 4,
    category: 'Analysis',
    example_input: { text: 'Call John at 555-123-4567 or email john@acme.com. Details at https://acme.com/deal' },
  },
  'hash-everything': {
    name: 'Hash Everything',
    desc: 'Compute MD5, SHA256, SHA512, and full checksum of input data.',
    steps: ['crypto-hash-md5', 'crypto-hash-sha256', 'crypto-hash-sha512', 'crypto-checksum'],
    credits: 4,
    category: 'Security',
    example_input: { data: 'important document content here' },
  },
  'text-analyze': {
    name: 'Text Analyzer',
    desc: 'Word count, readability score, keyword extraction, language detection.',
    steps: ['text-word-count', 'text-readability-score', 'text-keyword-extract', 'text-language-detect'],
    credits: 4,
    category: 'Analysis',
    example_input: { text: 'The quick brown fox jumps over the lazy dog. This sentence tests readability and keyword extraction.' },
  },
  'json-pipeline': {
    name: 'JSON Pipeline',
    desc: 'Validate JSON, format it, generate schema, flatten to dot-notation.',
    steps: ['text-json-validate', 'text-json-format', 'text-json-schema-generate', 'text-json-flatten'],
    credits: 5,
    category: 'Data',
    example_input: { data: '{"user":{"name":"Alice","age":30},"scores":[90,85,92]}' },
  },
  'meeting-to-actions': {
    name: 'Meeting to Actions',
    desc: 'Summarize meeting notes, extract action items, draft follow-up email.',
    steps: ['llm-summarize', 'llm-extract-action-items', 'llm-email-draft'],
    credits: 20,
    category: 'Business',
    example_input: { text: 'Meeting notes: discussed Q2 targets. Alice to prepare the deck by Friday. Bob to review the contract. Follow up with client next week.' },
  },
  'code-explain': {
    name: 'Code Explainer',
    desc: 'Explain code, document it, generate tests.',
    steps: ['llm-explain-code', 'llm-code-document', 'llm-code-test-generate'],
    credits: 30,
    category: 'Dev',
    example_input: { code: 'function fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }', language: 'javascript' },
  },
  'crypto-toolkit': {
    name: 'Crypto Toolkit',
    desc: 'Generate UUID, password, OTP, and a random encryption key.',
    steps: ['crypto-uuid', 'crypto-password-generate', 'crypto-otp-generate', 'crypto-random-bytes'],
    credits: 4,
    category: 'Security',
    example_input: {},
  },
  'domain-recon': {
    name: 'Domain Recon',
    desc: 'DNS lookup, SSL check, HTTP status, email validation for a domain.',
    steps: ['net-dns-a', 'net-ssl-check', 'net-http-status', 'net-email-validate'],
    credits: 20,
    category: 'Network',
    example_input: { domain: 'slopshop.gg', url: 'https://slopshop.gg', email: 'dev@slopshop.gg' },
  },
  'onboarding-pack': {
    name: 'Onboarding Pack',
    desc: 'Generate test name, create a JWT for them, hash their password.',
    steps: ['gen-fake-name', 'crypto-jwt-sign', 'crypto-password-hash'],
    credits: 3,
    category: 'Dev',
    example_input: { secret: 'my-app-secret' },
  },

  // === OUTCOME-FOCUSED PIPES ===

  'website-report': {
    name: 'Website Report',
    desc: 'Full analysis of any website: content summary, tech stack, SSL grade, response time, sitemap check, and link extraction. Returns a complete report.',
    steps: ['sense-url-content', 'sense-url-tech-stack', 'sense-ssl-check', 'sense-url-response-time', 'sense-url-links'],
    credits: 15,
    category: 'Research',
    example_input: { url: 'https://stripe.com' },
  },
  'data-clean': {
    name: 'Data Clean & Analyze',
    desc: 'Take raw JSON data, compute statistics, filter outliers, sort by key field, and return clean analyzed data.',
    steps: ['analyze-json-stats', 'exec-filter-json', 'exec-sort-json'],
    credits: 5,
    category: 'Data',
    example_input: { data: [{"name":"a","score":95},{"name":"b","score":12},{"name":"c","score":87}], sort_key: 'score', filter: 'score > 50' },
  },
  'competitor-snapshot': {
    name: 'Competitor Snapshot',
    desc: 'Quick competitive intelligence: fetch a competitor URL, detect their tech stack, check their SSL and performance, extract all outbound links.',
    steps: ['sense-url-tech-stack', 'sense-url-response-time', 'sense-ssl-check', 'sense-url-links', 'sense-url-meta'],
    credits: 15,
    category: 'Research',
    example_input: { url: 'https://competitor.com' },
  },
  'hash-everything': {
    name: 'Hash Everything',
    desc: 'Hash input data with SHA-256, SHA-512, MD5, and generate a checksum. Returns all hashes for verification.',
    steps: ['crypto-hash-sha256', 'crypto-hash-sha512', 'crypto-hash-md5', 'crypto-checksum'],
    credits: 4,
    category: 'Security',
    example_input: { data: 'important document content' },
  },
  'text-intelligence': {
    name: 'Text Intelligence',
    desc: 'Full text analysis: word count, readability score, token count, extract all emails/URLs/numbers, and detect language.',
    steps: ['text-word-count', 'text-readability-score', 'text-token-count', 'text-extract-emails', 'text-extract-urls'],
    credits: 5,
    category: 'Content',
    example_input: { text: 'Contact us at hello@example.com or visit https://example.com for more info. We process over 10000 requests daily.' },
  },
};

module.exports = function mountPipes(app, allHandlers, API_DEFS, auth) {

  // List all pipes
  app.get('/v1/pipes', (req, res) => {
    const pipes = Object.entries(PIPES).map(([slug, p]) => ({
      slug, name: p.name, desc: p.desc, steps: p.steps,
      credits: p.credits, category: p.category,
    }));
    res.json({ total: pipes.length, pipes });
  });

  // Get pipe detail
  app.get('/v1/pipes/:slug', (req, res) => {
    const pipe = PIPES[req.params.slug];
    if (!pipe) return res.status(404).json({ error: { code: 'pipe_not_found' } });
    res.json({
      slug: req.params.slug, ...pipe,
      steps_detail: pipe.steps.map(s => {
        const def = API_DEFS[s];
        return def ? { slug: s, name: def.name, credits: def.credits, tier: def.tier } : { slug: s, error: 'not_found' };
      }),
    });
  });

  // Execute a pre-built pipe
  app.post('/v1/pipes/:slug', auth, async (req, res) => {
    const pipe = PIPES[req.params.slug];
    if (!pipe) return res.status(404).json({ error: { code: 'pipe_not_found' } });

    // Check total credits
    let totalCredits = 0;
    for (const step of pipe.steps) {
      const def = API_DEFS[step];
      if (!def) return res.status(500).json({ error: { code: 'broken_pipe', step } });
      totalCredits += def.credits;
    }

    if (req.acct.balance < totalCredits) {
      return res.status(402).json({ error: { code: 'insufficient_credits', need: totalCredits, have: req.acct.balance } });
    }

    req.acct.balance -= totalCredits;

    // Execute steps
    let lastResult = null;
    const results = [];

    for (const step of pipe.steps) {
      const handler = allHandlers[step];
      if (!handler) {
        results.push({ step, error: 'no_handler' });
        continue;
      }

      // Build input: merge user input with previous step output
      const input = { ...(req.body || {}), ...(lastResult && typeof lastResult === 'object' ? { _previous: lastResult } : {}) };

      // For certain APIs, pass through specific fields from previous results
      if (lastResult) {
        if (lastResult.text) input.text = input.text || lastResult.text;
        if (lastResult.result) input.input = input.input || (typeof lastResult.result === 'string' ? lastResult.result : JSON.stringify(lastResult.result));
        if (lastResult.emails && lastResult.emails[0]) input.email = input.email || lastResult.emails[0];
        if (lastResult.hash) input.data = input.data || lastResult.hash;
        if (lastResult.output) input.text = input.text || lastResult.output;
        if (lastResult.summary) input.text = input.text || lastResult.summary;
        if (lastResult.name && lastResult.name.full) {
          input.payload = input.payload || { sub: lastResult.name.full, email: lastResult.email };
          input.password = input.password || lastResult.email;
        }
      }

      try {
        lastResult = await handler(input);
        results.push({ step, data: lastResult, credits: API_DEFS[step].credits });
      } catch (e) {
        lastResult = { error: e.message };
        results.push({ step, error: e.message });
      }
    }

    res.json({
      pipe: req.params.slug,
      result: lastResult,
      steps: results,
      total_credits: totalCredits,
      balance: req.acct.balance,
    });
  });

  console.log(`  🔧 Pipes:    ${Object.keys(PIPES).length} pre-built workflows at /v1/pipes`);
};
