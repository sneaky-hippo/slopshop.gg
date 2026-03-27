#!/usr/bin/env node
/**
 * generate-seo.js
 * Generates SEO-optimized HTML pages for all 1,250 Slopshop APIs.
 * Run: node generate-seo.js
 */

const fs = require('fs');
const path = require('path');

// ─── Load all API definitions ──────────────────────────────────────────────

const { API_DEFS } = require('./registry.js');
const { EXPANSION_DEFS } = require('./registry-expansion.js');
const ALL_APIS = { ...API_DEFS, ...EXPANSION_DEFS };

// ─── SEO content database ─────────────────────────────────────────────────
// For every slug we define: seoTitle, metaDesc, keywords[], h1, lead,
// howItWorks, useCases[], inputParams[], exampleResponse, relatedSlugs[]
// For unmapped APIs the generator falls back to smart defaults.

const SEO_OVERRIDES = {
  'crypto-hash-sha256': {
    seoTitle: 'SHA256 Hash API - Compute SHA256 Online',
    metaDesc: 'Compute SHA256 hash of any string or data via API. Returns hex digest instantly. 1 credit per call. curl, Python, Node.js examples.',
    keywords: ['sha256 api', 'sha256 hash api', 'compute sha256', 'sha256 online', 'hash api', 'generate sha256'],
    lead: 'Compute cryptographic SHA256 hashes programmatically via a simple REST API. Send any string or binary data and receive the 64-character hex digest — the same output as <code>openssl dgst -sha256</code> or Python\'s <code>hashlib.sha256</code>.',
    howItWorks: 'POST your input data as a JSON string. The API computes a SHA-256 digest using Node.js\'s built-in <code>crypto</code> module (no external dependencies) and returns the lowercase hex-encoded 32-byte hash. Processing is deterministic: the same input always produces the same output.',
    useCases: [
      'Verify file integrity — hash a downloaded file and compare to a published checksum',
      'Generate cache keys — create a stable identifier for any piece of content',
      'Build content-addressable storage systems or deduplication pipelines',
      'Implement API request signing where SHA256 is the required digest algorithm',
      'Generate unique identifiers from composite fields without a database sequence',
    ],
  },
  'crypto-hash-sha512': {
    seoTitle: 'SHA512 Hash API - Compute SHA512 Online',
    metaDesc: 'Compute SHA512 hash via API. Returns 128-char hex digest. 1 credit per call. Stronger than SHA256 for password-adjacent use cases.',
    keywords: ['sha512 api', 'sha512 hash api', 'compute sha512', 'sha512 online'],
    lead: 'Generate SHA-512 hashes via REST API. SHA-512 produces a 128-character hex digest and is preferred when longer collision resistance is needed — such as HMAC keys, document fingerprinting, or blockchain-adjacent applications.',
    howItWorks: 'POST your input string to receive the 64-byte SHA-512 digest in lowercase hexadecimal. Uses Node.js built-in crypto — no third-party library, no external network call.',
    useCases: [
      'Generate longer-strength fingerprints for large documents or datasets',
      'Create HMAC keys where SHA-512 is the specified digest algorithm',
      'Build audit trails where tamper-evident hashing is required',
      'File deduplication in storage systems with higher collision-safety requirements',
    ],
  },
  'crypto-hash-md5': {
    seoTitle: 'MD5 Hash API - Compute MD5 Checksum Online',
    metaDesc: 'Compute MD5 hash of any string via API. Returns 32-char hex digest. 1 credit. Fast, deterministic. Not for passwords — use crypto-password-hash instead.',
    keywords: ['md5 api', 'md5 hash api', 'compute md5', 'md5 checksum api', 'md5 online'],
    lead: 'Generate MD5 checksums via REST API. While MD5 is not cryptographically secure for password hashing, it remains the standard for non-security checksums: file integrity checks, etag generation, and cache key generation where speed matters more than collision resistance.',
    howItWorks: 'POST any string and receive its 32-character MD5 hex digest. Fast and deterministic. For password hashing, use the <a href="/api/crypto-password-hash">crypto-password-hash</a> API which uses PBKDF2 with a random salt.',
    useCases: [
      'Generate ETag headers for HTTP cache validation',
      'Compute legacy checksums to match third-party systems that require MD5',
      'Build deduplication keys for large datasets where speed matters',
      'Verify file downloads from older systems that publish MD5 checksums',
    ],
  },
  'crypto-hmac': {
    seoTitle: 'HMAC-SHA256 API - Generate HMAC Signature Online',
    metaDesc: 'Compute HMAC-SHA256 message authentication code via API. Provide secret key + data, get hex MAC. Used in webhook verification, API signing. 1 credit.',
    keywords: ['hmac api', 'hmac sha256 api', 'generate hmac', 'webhook signature api', 'message authentication code api'],
    lead: 'Generate HMAC-SHA256 message authentication codes via REST API. HMAC is the standard mechanism for verifying that a message was created by a party holding a shared secret key — used in webhook signature verification (Stripe, GitHub, Shopify), AWS request signing, and JWT validation.',
    howItWorks: 'POST your message data and a secret key. The API computes HMAC-SHA256 using Node.js crypto and returns the hex-encoded MAC. To verify a webhook, compute the HMAC of the request body with your webhook secret and compare it to the signature in the request header.',
    useCases: [
      'Verify incoming Stripe, GitHub, or Shopify webhook signatures',
      'Sign API requests with a shared secret for authentication',
      'Generate time-limited tokens that can be verified without a database lookup',
      'Implement request integrity checking in microservice communication',
    ],
  },
  'crypto-uuid': {
    seoTitle: 'UUID v4 Generator API - Generate Random UUID Online',
    metaDesc: 'Generate cryptographically random UUID v4 via API. RFC 4122 compliant. 1 credit per call. Perfect for database primary keys, idempotency tokens.',
    keywords: ['uuid api', 'generate uuid', 'uuid v4 api', 'random uuid generator', 'uuid generator online api'],
    lead: 'Generate RFC 4122 compliant UUID v4 identifiers via REST API. Each UUID is a 128-bit random value formatted as <code>xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx</code>. Generated using Node.js <code>crypto.randomUUID()</code> — cryptographically random, not Math.random().',
    howItWorks: 'POST an empty JSON object (or any input) and receive a new UUID v4. Each call generates a fresh UUID using the system CSPRNG. The API also supports batch generation — request up to 100 UUIDs in a single call.',
    useCases: [
      'Generate database primary keys before insert — no round-trip to the database',
      'Create idempotency keys for payment requests or distributed operations',
      'Generate correlation IDs for distributed tracing across microservices',
      'Produce unique session identifiers, file names, or upload tokens',
      'Create reproducible test fixtures where deterministic IDs are needed',
    ],
  },
  'crypto-jwt-sign': {
    seoTitle: 'JWT Sign API - Create and Sign JWT Tokens Online',
    metaDesc: 'Create and sign JWT tokens via API using HS256. Provide payload + secret, get signed JWT. Test JWT signing without a library. 1 credit per call.',
    keywords: ['jwt sign api', 'create jwt api', 'sign jwt token', 'generate jwt', 'jwt hs256 api'],
    lead: 'Create and sign JSON Web Tokens (JWT) via REST API. Provide a payload object and a secret key, and receive a signed HS256 JWT ready to use as a Bearer token, session token, or API key. Useful for testing JWT-based auth flows without setting up a full auth library.',
    howItWorks: 'POST a JSON payload object and a secret string. The API signs the payload with HMAC-SHA256 (HS256), adds standard claims (iat, exp if you provide expiresIn), and returns the complete JWT string in three base64url-encoded parts.',
    useCases: [
      'Generate test JWTs for API endpoint testing in CI/CD pipelines',
      'Create service-to-service authentication tokens for microservices',
      'Issue short-lived tokens for one-time operations like email verification',
      'Prototype JWT-based auth flows before implementing a full auth library',
    ],
  },
  'crypto-jwt-verify': {
    seoTitle: 'JWT Verify API - Verify JWT Signature and Expiry',
    metaDesc: 'Verify JWT token signature and check expiry via API. Returns decoded payload if valid, error if tampered or expired. 1 credit per call.',
    keywords: ['jwt verify api', 'verify jwt token', 'jwt validation api', 'check jwt signature', 'jwt decode verify'],
    lead: 'Verify JSON Web Token signatures and check expiry via REST API. Submit a JWT and the secret key used to sign it — the API confirms the signature is valid, the token has not expired, and returns the decoded payload claims.',
    howItWorks: 'POST the JWT string and the secret. The API splits the token, recomputes the expected HMAC-SHA256 signature, compares it in constant time (timing-attack safe), checks the <code>exp</code> claim against the current time, and returns the decoded payload or a structured error.',
    useCases: [
      'Validate JWTs from untrusted sources before trusting their claims',
      'Debug JWT authentication failures in development',
      'Check token expiry in serverless functions without importing a JWT library',
      'Verify third-party JWTs during API integration testing',
    ],
  },
  'crypto-jwt-decode': {
    seoTitle: 'JWT Decode API - Decode JWT Payload Without Verification',
    metaDesc: 'Decode JWT token payload without signature verification. Inspect claims, expiry, and header. 1 credit. Unsafe inspection only — use jwt-verify for production.',
    keywords: ['jwt decode api', 'decode jwt', 'read jwt payload', 'jwt inspector', 'parse jwt online'],
    lead: 'Decode and inspect JWT token contents without verifying the signature. Useful for debugging — quickly see what claims a token contains, when it expires, and what algorithm was used — without needing the secret key.',
    howItWorks: 'POST the JWT string. The API base64url-decodes the header and payload sections and returns them as JSON objects, plus a human-readable expiry time and age. No secret required — this is intentionally unsafe inspection for debugging purposes only.',
    useCases: [
      'Debug JWT auth issues by inspecting what claims the token contains',
      'Check token expiry during troubleshooting without the signing secret',
      'Inspect JWTs from third-party providers to understand their claim structure',
      'Build JWT debugging tools or dashboards',
    ],
  },
  'crypto-encrypt-aes': {
    seoTitle: 'AES Encrypt API - AES-256-GCM Encryption Online',
    metaDesc: 'Encrypt data with AES-256-GCM via API. Authenticated encryption with random IV. Returns ciphertext + auth tag. 1 credit per call.',
    keywords: ['aes encrypt api', 'aes 256 encryption api', 'encrypt data api', 'aes gcm api', 'symmetric encryption api'],
    lead: 'Encrypt data using AES-256-GCM authenticated encryption via REST API. AES-256-GCM provides both confidentiality and integrity — the authentication tag detects any tampering with the ciphertext. Each call generates a random IV for semantic security.',
    howItWorks: 'POST your plaintext and a 256-bit key (64 hex characters). The API generates a random 12-byte IV, encrypts with AES-256-GCM, and returns the IV, ciphertext, and authentication tag as hex strings. Store all three together — you need them all to decrypt.',
    useCases: [
      'Encrypt sensitive data fields before storing in a database',
      'Protect API keys and secrets in transit or at rest',
      'Build end-to-end encrypted messaging or file storage',
      'Encrypt configuration values in environment-agnostic ways',
    ],
  },
  'crypto-decrypt-aes': {
    seoTitle: 'AES Decrypt API - AES-256-GCM Decryption Online',
    metaDesc: 'Decrypt AES-256-GCM encrypted data via API. Verifies authentication tag before decryption. Returns plaintext or error if tampered. 1 credit.',
    keywords: ['aes decrypt api', 'aes 256 decryption api', 'decrypt data api', 'aes gcm decrypt'],
    lead: 'Decrypt AES-256-GCM ciphertext via REST API. Verifies the authentication tag before decryption — if the ciphertext has been tampered with, the API returns an error rather than silently returning corrupted data.',
    howItWorks: 'POST the key, IV, ciphertext, and authentication tag (all as hex). The API verifies the GCM auth tag first (preventing padding oracle attacks), then decrypts and returns the original plaintext.',
    useCases: [
      'Decrypt database fields that were encrypted with crypto-encrypt-aes',
      'Decrypt configuration secrets retrieved from secure storage',
      'Build decryption services in serverless functions without crypto library dependencies',
    ],
  },
  'crypto-password-generate': {
    seoTitle: 'Password Generator API - Generate Secure Random Passwords',
    metaDesc: 'Generate cryptographically secure random passwords via API. Configurable length, character sets. Returns password + entropy bits. 1 credit per call.',
    keywords: ['password generator api', 'generate secure password api', 'random password api', 'strong password generator api'],
    lead: 'Generate cryptographically secure random passwords via REST API. Configure length (8–128 chars), character sets (uppercase, lowercase, digits, symbols), and minimum requirements. The API reports entropy bits so you know exactly how strong the generated password is.',
    howItWorks: 'POST your password requirements: length, whether to include uppercase letters, lowercase letters, numbers, and/or symbols. The API uses Node.js <code>crypto.randomBytes()</code> to select characters — not Math.random(). Returns the password and its entropy in bits.',
    useCases: [
      'Generate initial passwords for new user accounts in a registration flow',
      'Create API keys and access tokens for developer credentials',
      'Generate temporary passwords for password-reset flows',
      'Produce test passwords with known complexity for security testing',
    ],
  },
  'crypto-password-hash': {
    seoTitle: 'Password Hashing API - Secure PBKDF2 Password Hash',
    metaDesc: 'Hash passwords with PBKDF2-SHA256 and random salt via API. Returns hash + salt for secure storage. Never store plaintext passwords. 1 credit per call.',
    keywords: ['password hash api', 'hash password api', 'pbkdf2 api', 'secure password storage api', 'bcrypt alternative api'],
    lead: 'Hash passwords securely using PBKDF2-SHA256 with a cryptographically random salt via REST API. The output is safe to store in a database — without the original password, the hash cannot be reversed. Use <a href="/api/crypto-password-verify">crypto-password-verify</a> to check passwords at login.',
    howItWorks: 'POST the plaintext password. The API generates a 32-byte random salt, runs 100,000 iterations of PBKDF2-SHA256, and returns the hash and salt as hex strings. Store both. At login time, use the verify endpoint with the original salt.',
    useCases: [
      'Hash user passwords before storing in a database during registration',
      'Migrate from weak MD5 password hashes to PBKDF2 in a batch process',
      'Hash PINs and passcodes for any authentication system',
    ],
  },
  'crypto-password-verify': {
    seoTitle: 'Password Verify API - Verify Password Against PBKDF2 Hash',
    metaDesc: 'Verify a password against a stored PBKDF2 hash via API. Constant-time comparison prevents timing attacks. Returns true/false. 1 credit per call.',
    keywords: ['password verify api', 'verify password hash api', 'pbkdf2 verify api', 'check password hash'],
    lead: 'Verify a user-submitted password against a stored PBKDF2 hash via REST API. Uses constant-time comparison to prevent timing-based attacks — an attacker cannot determine if a password is close to correct by measuring response time.',
    howItWorks: 'POST the plaintext password, the stored hash, and the stored salt. The API recomputes the PBKDF2-SHA256 hash with the same parameters and compares using <code>crypto.timingSafeEqual()</code>. Returns <code>{"valid": true}</code> or <code>{"valid": false}</code>.',
    useCases: [
      'Verify passwords at login in a serverless auth function',
      'Check passwords during password-change flows (verify old before setting new)',
      'Build authentication APIs without importing bcrypt or argon2',
    ],
  },
  'text-token-count': {
    seoTitle: 'Token Counter API - Count LLM Tokens for GPT-4, Claude',
    metaDesc: 'Estimate LLM token count for any text via API. Essential for context window management with GPT-4, Claude, Gemini. 1 credit per call.',
    keywords: ['token counter api', 'count tokens api', 'llm token count', 'gpt token counter', 'context window tokens', 'token estimate api'],
    lead: 'Estimate LLM token counts for any text via REST API. Essential for managing context windows in GPT-4, Claude, Gemini, and other LLMs — know before you send whether your input fits, and how much of your context budget remains.',
    howItWorks: 'POST your text string. The API applies the ~4 characters-per-token heuristic (accurate to ±10% for English prose, ±20% for code) and returns the estimated token count, character count, and word count. Faster and cheaper than calling the LLM to count.',
    useCases: [
      'Check if a document fits within a model\'s context window before sending',
      'Implement context-aware chunking — split text at exact token boundaries',
      'Estimate LLM API costs before making a call based on input token count',
      'Build RAG pipelines that fill context windows optimally without overflow',
      'Validate user inputs are within token limits before processing',
    ],
  },
  'text-token-estimate-cost': {
    seoTitle: 'LLM Token Cost Estimator API - Estimate GPT-4, Claude Costs',
    metaDesc: 'Estimate token count and USD cost for Claude, GPT-4o, Gemini via API. Budget-aware agent development. 1 credit per call.',
    keywords: ['llm cost estimator api', 'token cost api', 'gpt4 cost calculator api', 'claude cost estimate', 'ai api cost calculator'],
    lead: 'Estimate LLM API costs before making calls to Claude, GPT-4o, Gemini, or other models. Submit text and a model name — get back estimated token count, input cost, and projected output cost at current per-token pricing.',
    howItWorks: 'POST your text and optionally a model name (e.g., <code>gpt-4o</code>, <code>claude-3-5-sonnet</code>). The API estimates tokens and multiplies by the model\'s current published pricing. Pricing table is updated periodically.',
    useCases: [
      'Build budget-aware agent pipelines that skip expensive calls when cost exceeds threshold',
      'Compare model costs for a given task before choosing which to use',
      'Log estimated costs per agent session for billing or analytics',
      'Alert when a prompt would exceed a cost limit before sending it',
    ],
  },
  'exec-javascript': {
    seoTitle: 'JavaScript Sandbox API - Run JS Code Safely via API',
    metaDesc: 'Execute JavaScript in a secure Node.js VM sandbox via API. No filesystem or network access. Returns result + console output + execution time. 5 credits.',
    keywords: ['javascript sandbox api', 'run js online api', 'execute javascript api', 'js code runner api', 'node.js sandbox api'],
    lead: 'Execute JavaScript code strings in an isolated, sandboxed Node.js VM environment via REST API. The sandbox has no access to the filesystem, network, or Node.js process — making it safe to run untrusted or user-provided code and return the result.',
    howItWorks: 'POST a JavaScript code string. The API executes it inside a <code>vm.runInNewContext()</code> sandbox with a configurable timeout (default 5 seconds). Returns the return value of the last expression, all <code>console.log</code> output captured as an array, execution time in milliseconds, and any thrown errors.',
    useCases: [
      'Run user-submitted JavaScript formulas in a no-code tool or spreadsheet',
      'Execute transformation logic in an ETL pipeline without deploying code',
      'Test JavaScript snippets in CI without spinning up a full Node.js environment',
      'Build a code playground or REPL in a web app without server infrastructure',
      'Run agent-generated code safely to verify its output before deployment',
    ],
  },
  'llm-summarize': {
    seoTitle: 'Text Summarization API - AI Summary with Claude',
    metaDesc: 'Summarize any text with AI via API. Configurable length and format. Powered by Claude. Extract key points from articles, documents, emails. 10 credits.',
    keywords: ['summarize api', 'text summarization api', 'ai summary api', 'summarize text online', 'document summarizer api', 'article summarizer api'],
    lead: 'Summarize any text with Claude-powered AI via REST API. Submit an article, document, email, or meeting transcript and get a concise summary back. Configurable length (one sentence to full paragraphs) and format (prose, bullet points, TLDR).',
    howItWorks: 'POST your text and optional parameters: <code>length</code> (short/medium/long), <code>format</code> (prose/bullets/tldr), and <code>focus</code> (what aspects to emphasize). The API sends your text to Claude with a carefully engineered prompt and returns a clean summary.',
    useCases: [
      'Summarize long articles or research papers into key takeaways',
      'Generate TLDR sections for documentation or blog posts',
      'Condense email threads into action items and decisions',
      'Summarize meeting transcripts into structured notes',
      'Build content digests that summarize multiple sources daily',
    ],
  },
  'llm-sentiment': {
    seoTitle: 'Sentiment Analysis API - AI Sentiment with Aspect-Level Detail',
    metaDesc: 'Analyze sentiment with AI via API. Returns positive/negative/neutral with confidence and aspect-level detail. Claude-powered. 10 credits per call.',
    keywords: ['sentiment analysis api', 'sentiment api', 'text sentiment api', 'nlp sentiment api', 'opinion mining api'],
    lead: 'Perform deep sentiment analysis on any text using Claude-powered AI. Unlike simple positive/negative classifiers, this API provides aspect-level sentiment — detecting which specific topics or features are positive or negative in a review or feedback item.',
    howItWorks: 'POST your text. The API returns an overall sentiment (positive/negative/neutral/mixed) with a confidence score, a list of detected sentiment aspects with their individual scores, and key phrases that drove the sentiment classification.',
    useCases: [
      'Analyze product reviews to find which features customers love or hate',
      'Monitor social media mentions for brand sentiment tracking',
      'Triage customer support tickets by emotional urgency',
      'Analyze employee survey responses for HR insights',
      'Build real-time sentiment dashboards for customer feedback streams',
    ],
  },
  'llm-translate': {
    seoTitle: 'Translation API - Translate Text to Any Language with AI',
    metaDesc: 'Translate text to any language via API. Tone-preserving. Claude-powered. Handles idioms and context better than rule-based systems. 10 credits per call.',
    keywords: ['translation api', 'translate text api', 'language translation api', 'ai translation api', 'multilingual api'],
    lead: 'Translate text to any of 100+ languages via REST API, powered by Claude. Preserves tone, handles idiomatic expressions, and understands context — producing more natural-sounding translations than rule-based systems for marketing copy, support responses, and documentation.',
    howItWorks: 'POST your text and target language (English name or ISO 639-1 code). Optionally specify source language (auto-detected if omitted) and tone preservation level. The API returns the translated text and detected source language.',
    useCases: [
      'Localize product descriptions and marketing copy for international markets',
      'Translate customer support tickets before routing to support teams',
      'Build multilingual chatbots that respond in the user\'s language',
      'Translate documentation into multiple languages automatically',
      'Process multilingual survey responses for unified analysis',
    ],
  },
  'llm-classify': {
    seoTitle: 'Text Classification API - Classify Text into Custom Categories',
    metaDesc: 'Classify any text into your custom categories via AI API. Provide categories, get back classification + confidence. Claude-powered. 10 credits.',
    keywords: ['text classification api', 'classify text api', 'nlp classification api', 'ai classifier api', 'text categorization api'],
    lead: 'Classify text into any categories you define using Claude AI via REST API. Unlike pre-trained classifiers locked to fixed categories (spam/not-spam, positive/negative), this API works with any categories you specify — making it useful for routing, tagging, and organizing any type of content.',
    howItWorks: 'POST your text and an array of category names. The API uses Claude to classify the text into the best matching category, returning the category name, a confidence score (0–1), and a brief explanation of why it was classified that way.',
    useCases: [
      'Route support tickets to the right team (billing/technical/account)',
      'Tag blog posts or articles with content categories automatically',
      'Classify customer feedback by product area or feature request type',
      'Sort job applications into role-fit categories for initial screening',
      'Categorize transactions by type in financial data processing',
    ],
  },
  'llm-extract-entities': {
    seoTitle: 'Named Entity Extraction API - Extract People, Orgs, Dates from Text',
    metaDesc: 'Extract named entities from text via AI API. Returns people, organizations, dates, locations, amounts. Claude-powered. 10 credits per call.',
    keywords: ['entity extraction api', 'ner api', 'named entity recognition api', 'extract entities from text', 'nlp entity api'],
    lead: 'Extract structured named entities from unstructured text using Claude AI via REST API. Returns people, organizations, dates, monetary amounts, locations, and custom entity types — structured as a JSON object, not a tagged string.',
    howItWorks: 'POST any text. The API returns a categorized list of extracted entities: each with its value, type, and position in the text. Handles complex cases like partial names, relative dates ("next Tuesday"), and implicit organizations.',
    useCases: [
      'Extract contract parties, dates, and amounts from legal documents',
      'Parse unstructured company data from news articles or press releases',
      'Extract action items and owners from meeting notes automatically',
      'Build knowledge graphs by extracting entities from large document sets',
      'Preprocess customer emails to extract order numbers and customer names',
    ],
  },
  'sense-url-content': {
    seoTitle: 'URL Content API - Fetch & Extract Clean Text from Any URL',
    metaDesc: 'Fetch any URL and extract clean readable text via API. Strips HTML, scripts, ads. Returns title + body text + word count. 3 credits per call.',
    keywords: ['fetch url api', 'extract text from url', 'scrape url api', 'url to text api', 'web scraping api', 'clean text from url'],
    lead: 'Fetch any public URL and extract clean, human-readable text via REST API. Strips HTML tags, JavaScript, CSS, navigation menus, and ads — returning just the main textual content of the page, like what a screen reader would present.',
    howItWorks: 'POST a URL. The API makes an HTTP GET request, parses the HTML, removes boilerplate elements (nav, footer, scripts, styles), and returns the main content as clean text. Also returns the page title, word count, and a list of headings.',
    useCases: [
      'Feed web content into LLM prompts without HTML noise',
      'Build content monitoring that detects when a page changes',
      'Extract article text for summarization or translation pipelines',
      'Scrape competitor pricing pages or product descriptions programmatically',
      'Power research agents that can read and process any web page',
    ],
  },
  'sense-url-meta': {
    seoTitle: 'URL Metadata API - Extract Open Graph, SEO Meta Tags from URL',
    metaDesc: 'Fetch Open Graph tags, meta description, Twitter cards from any URL via API. Returns structured SEO metadata. 3 credits per call.',
    keywords: ['url metadata api', 'open graph api', 'og tags api', 'meta tags from url', 'seo metadata api', 'fetch og tags'],
    lead: 'Extract SEO and social metadata from any URL via REST API. Returns the page title, meta description, Open Graph tags (og:title, og:image, og:description), Twitter Card tags, canonical URL, and any structured data markup on the page.',
    howItWorks: 'POST a URL. The API fetches the page head, parses all <code>&lt;meta&gt;</code> tags, link tags, and JSON-LD script blocks, and returns them as a structured JSON object organized by type.',
    useCases: [
      'Generate rich link previews for URLs shared in a chat application',
      'Audit Open Graph tags across a site for social sharing quality',
      'Validate that published pages have the correct SEO metadata',
      'Build URL preview components for content editors or CMS tools',
    ],
  },
  'sense-github-repo': {
    seoTitle: 'GitHub Repo Info API - Fetch Repository Stats via API',
    metaDesc: 'Fetch GitHub repository stats via API: stars, forks, issues, language, topics, license. No auth required for public repos. 3 credits per call.',
    keywords: ['github api wrapper', 'github repo info api', 'get github stars api', 'github repository metadata api'],
    lead: 'Fetch public GitHub repository information via REST API without needing a GitHub token. Returns star count, fork count, open issue count, primary language, topics, license, description, and last push date — all from the public GitHub API.',
    howItWorks: 'POST a repository identifier (<code>owner/repo</code> format). The API calls the GitHub public API, normalizes the response, and returns the key repository metadata you need in a consistent structure.',
    useCases: [
      'Display live GitHub stats on a portfolio or project page',
      'Monitor dependency repository health (stars, open issues, last update)',
      'Build competitive analysis tools that compare repository metrics',
      'Populate a company\'s open-source project dashboard',
    ],
  },
  'memory-set': {
    seoTitle: 'Agent Memory Store API - Persist State Across AI Agent Sessions',
    metaDesc: 'Store named memory values that persist across AI agent sessions. Namespaced, taggable, TTL support. 1 credit per call. Essential for stateful agents.',
    keywords: ['agent memory api', 'persistent memory api', 'ai agent state api', 'store agent memory', 'stateful ai agent api'],
    lead: 'Give your AI agents persistent memory across sessions via REST API. Store any JSON value under a named key — it survives context resets, container restarts, and new conversations. The fundamental building block for stateful agent applications.',
    howItWorks: 'POST a key, value, and optional namespace and tags. The value is stored in a persistent SQLite database, namespaced by your API key. Subsequent calls to <a href="/api/memory-get">memory-get</a> with the same key return the stored value, even in a completely new agent session.',
    useCases: [
      'Remember user preferences across multiple conversations',
      'Store the current step in a multi-stage workflow the agent is executing',
      'Cache expensive computation results that can be reused in future sessions',
      'Persist counters, lists, and structured state for long-running agent tasks',
      'Share state between multiple agent instances working on the same task',
    ],
  },
  'memory-get': {
    seoTitle: 'Agent Memory Retrieve API - Read Persistent Agent State',
    metaDesc: 'Retrieve stored agent memory by key. Returns value + timestamps. Works across sessions. 1 credit per call. Pair with memory-set for stateful agents.',
    keywords: ['retrieve agent memory api', 'read persistent memory api', 'agent state retrieval api', 'ai memory lookup'],
    lead: 'Retrieve persistent memory values stored by your AI agent via REST API. Designed to be the companion to <a href="/api/memory-set">memory-set</a> — together they give your agents stateful memory that outlasts any individual conversation or session.',
    howItWorks: 'POST a key and optional namespace. Returns the stored value, creation timestamp, last-updated timestamp, associated tags, and TTL if set. Returns <code>null</code> with a clear indicator if the key does not exist (rather than throwing an error).',
    useCases: [
      'Retrieve user preferences at the start of each conversation',
      'Read the last-saved state of a workflow to resume where it left off',
      'Check if a computed result is already cached before recalculating',
      'Load agent configuration that was set up in a previous session',
    ],
  },
  'text-csv-to-json': {
    seoTitle: 'CSV to JSON API - Convert CSV to JSON Online via API',
    metaDesc: 'Parse CSV text to JSON array of objects via API. Handles headers, quoted values, custom delimiters. 3 credits. curl, Python, Node.js examples.',
    keywords: ['csv to json api', 'convert csv to json', 'parse csv api', 'csv parser api', 'csv json converter api'],
    lead: 'Convert CSV data to a JSON array of objects via REST API. Handles RFC 4180 CSV including quoted fields with embedded commas, escaped quotes, custom delimiters, and optional header rows. Returns structured JSON ready for further processing.',
    howItWorks: 'POST a CSV string. The API parses the first row as column headers (unless you specify <code>noHeader: true</code>), then parses each subsequent row into an object with those keys. Handles quoted fields, escaped quotes (<code>""</code>), and custom delimiters via the <code>delimiter</code> parameter.',
    useCases: [
      'Transform exported spreadsheet data into JSON for API consumption',
      'Convert database exports to structured objects for processing pipelines',
      'Parse CSV webhook payloads before storing in a document database',
      'Preprocess data files for LLM analysis or visualization',
    ],
  },
  'text-json-to-csv': {
    seoTitle: 'JSON to CSV API - Convert JSON Array to CSV Online',
    metaDesc: 'Convert JSON array to CSV text via API. Handles nested objects, custom delimiters, Excel-compatible output. 3 credits per call.',
    keywords: ['json to csv api', 'convert json to csv', 'export json as csv', 'json csv converter api'],
    lead: 'Convert JSON arrays to CSV format via REST API. Takes a JSON array of objects and produces properly escaped RFC 4180 CSV with headers derived from the object keys. Optional parameters for custom delimiter, quote character, and Excel BOM compatibility.',
    howItWorks: 'POST a JSON array of objects. The API extracts all unique keys as column headers, then serializes each object into a CSV row. Nested objects are flattened with dot notation by default. Empty fields produce empty CSV cells.',
    useCases: [
      'Export API response data as CSV for spreadsheet analysis',
      'Generate CSV reports from database query results',
      'Convert structured JSON logs to CSV for Excel-based analysis',
      'Produce CSV downloads in a web app from JSON API data',
    ],
  },
  'text-markdown-to-html': {
    seoTitle: 'Markdown to HTML API - Convert Markdown Online via API',
    metaDesc: 'Convert Markdown to HTML via API. Supports GFM, tables, code blocks, syntax highlighting. 1 credit per call. Returns clean, sanitized HTML.',
    keywords: ['markdown to html api', 'convert markdown api', 'markdown parser api', 'md to html api', 'markdown renderer api'],
    lead: 'Convert Markdown to HTML via REST API. Supports GitHub Flavored Markdown (GFM) including tables, task lists, strikethrough, fenced code blocks, and inline HTML. Returns clean, sanitized HTML ready to render in a browser.',
    howItWorks: 'POST a Markdown string. The API parses it and returns equivalent HTML. Supports standard Markdown headings, bold, italic, links, images, code blocks (with optional language hint), blockquotes, ordered and unordered lists, and horizontal rules.',
    useCases: [
      'Render Markdown content in a CMS or blog platform',
      'Convert README files to HTML for documentation sites',
      'Process LLM outputs (often in Markdown) for display in web apps',
      'Generate HTML email bodies from Markdown templates',
    ],
  },
  'math-statistics': {
    seoTitle: 'Statistics API - Compute Mean, Median, StdDev, Percentiles via API',
    metaDesc: 'Compute descriptive statistics (mean, median, mode, stddev, min, max, percentiles) from a number array via API. 3 credits. No library required.',
    keywords: ['statistics api', 'descriptive statistics api', 'mean median api', 'standard deviation api', 'statistical analysis api'],
    lead: 'Compute comprehensive descriptive statistics from any array of numbers via REST API. Returns mean, median, mode, standard deviation, variance, min, max, sum, count, range, and common percentiles (p25, p50, p75, p90, p95, p99) in a single call.',
    howItWorks: 'POST a JSON array of numbers. The API computes all standard descriptive statistics and returns them as a structured object. Handles arrays of any size up to the API input limit.',
    useCases: [
      'Summarize numeric data in analytics dashboards without a stats library',
      'Validate data distributions before training ML models',
      'Compute SLO/SLA statistics from latency measurement arrays',
      'Generate statistical summaries for data QA pipelines',
      'Add descriptive stats to reports generated by AI agents',
    ],
  },
  'net-dns-a': {
    seoTitle: 'DNS A Record Lookup API - Resolve IPv4 for Any Domain',
    metaDesc: 'Resolve DNS A records (IPv4 addresses) for any domain via API. Returns all A records with TTL. Real DNS lookup — not cached. 5 credits per call.',
    keywords: ['dns lookup api', 'dns a record api', 'resolve domain api', 'get ip from domain api', 'dns resolver api'],
    lead: 'Perform live DNS A record lookups for any domain via REST API. Returns all IPv4 addresses and their TTL values from a real DNS resolution — useful for infrastructure monitoring, network diagnostics, and verifying DNS configuration after changes.',
    howItWorks: 'POST a domain name. The API performs a live DNS query using Node.js\'s <code>dns.resolve4()</code> (with TTL option), returning all A records with their IPv4 addresses and TTL values in seconds.',
    useCases: [
      'Verify DNS A record configuration after pointing a domain to a new server',
      'Monitor DNS changes as part of infrastructure automation',
      'Check if a domain resolves before making HTTP requests in agent workflows',
      'Audit A records across multiple domains for security reviews',
    ],
  },
  'net-ssl-check': {
    seoTitle: 'SSL Certificate Check API - Inspect SSL Cert Expiry Online',
    metaDesc: 'Inspect SSL certificates via API: issuer, expiry date, days remaining, SANs, validity. Get alerted before certs expire. 5 credits per call.',
    keywords: ['ssl check api', 'ssl certificate api', 'check ssl expiry api', 'tls certificate api', 'ssl inspector api'],
    lead: 'Inspect SSL/TLS certificates for any HTTPS host via REST API. Returns issuer, subject, valid-from and valid-to dates, days remaining until expiry, Subject Alternative Names (SANs), and validity status — without needing openssl on the command line.',
    howItWorks: 'POST a hostname (without https://). The API establishes a TLS connection, extracts the certificate details, computes days until expiry, and returns a structured object with all relevant certificate fields.',
    useCases: [
      'Monitor SSL certificate expiry across your infrastructure with automated alerts',
      'Verify certificate configuration after installing a new cert',
      'Audit SANs to ensure a certificate covers all required subdomains',
      'Check third-party service certificates before integrating with them',
    ],
  },
  'llm-code-generate': {
    seoTitle: 'Code Generation API - AI Code Generator from Natural Language',
    metaDesc: 'Generate code from natural language descriptions via API. Claude-powered. Any language. Returns code + explanation. 20 credits per call.',
    keywords: ['code generation api', 'ai code generator api', 'generate code from description api', 'natural language to code api', 'llm code api'],
    lead: 'Generate working code from natural language descriptions via REST API using Claude. Describe what you want the code to do, specify the programming language, and receive production-ready code with comments explaining the implementation.',
    howItWorks: 'POST a description of the code you need and a target language (JavaScript, Python, Go, Rust, SQL, etc.). Optionally specify framework constraints or style requirements. Returns the generated code and an explanation of how it works.',
    useCases: [
      'Prototype functions quickly from specifications in agent workflows',
      'Generate boilerplate code for common patterns (CRUD, auth, validation)',
      'Create code examples for documentation or tutorials automatically',
      'Convert pseudocode or algorithm descriptions into working implementations',
      'Generate scripts for DevOps automation from plain-English descriptions',
    ],
  },
  'llm-code-review': {
    seoTitle: 'Code Review API - AI Code Review for Bugs and Security Issues',
    metaDesc: 'Review code for bugs, security issues, and performance problems via AI API. Claude-powered. Returns structured findings. 10 credits per call.',
    keywords: ['code review api', 'ai code review api', 'automated code review api', 'static analysis ai api', 'security code review api'],
    lead: 'Automatically review code for bugs, security vulnerabilities, and performance issues using Claude AI via REST API. Submit any code snippet or function and receive structured findings with severity ratings and suggested fixes.',
    howItWorks: 'POST a code string and optional language hint. The API sends it to Claude with a code-review system prompt that identifies bugs (logic errors, null pointer risks), security issues (injection, hardcoded secrets, insecure defaults), performance problems, and style issues.',
    useCases: [
      'Integrate AI code review into CI/CD pipelines as a quality gate',
      'Review code submitted by contractors or new team members automatically',
      'Audit legacy codebases for security vulnerabilities in bulk',
      'Build code quality dashboards that score PRs before human review',
    ],
  },
  'llm-blog-draft': {
    seoTitle: 'Blog Writing API - AI Blog Post Generator',
    metaDesc: 'Generate full blog post drafts from a topic or outline via AI API. Claude-powered. 800-2000 words. SEO-optimized structure. 20 credits per call.',
    keywords: ['blog writing api', 'ai blog generator api', 'blog post api', 'content generation api', 'ai content writer api'],
    lead: 'Generate complete blog post drafts from a topic description using Claude AI via REST API. Produces structured posts with a compelling headline, introduction, H2-organized body sections, and a conclusion — typically 800–2000 words depending on your length setting.',
    howItWorks: 'POST a topic, optional keywords to target, desired length (short/medium/long), and tone (professional/casual/technical). The API generates a full blog draft with proper heading hierarchy, natural paragraph flow, and optional internal linking suggestions.',
    useCases: [
      'Generate first drafts for content teams to edit and publish',
      'Produce SEO-targeted content for long-tail keyword clusters',
      'Create documentation articles from feature specifications',
      'Build content pipelines that produce blog posts from product data',
    ],
  },
  'gen-fake-user': {
    seoTitle: 'Fake User Generator API - Generate Realistic Test User Data',
    metaDesc: 'Generate realistic fake user profiles (name, email, phone, address, company) via API. For testing and development. 1 credit per call.',
    keywords: ['fake user generator api', 'test data generator api', 'mock user api', 'fake data api', 'generate test users api'],
    lead: 'Generate realistic fake user profiles for testing and development via REST API. Each profile includes a full name, email address, phone number, postal address, company name, job title, and username — all internally consistent and realistic-looking.',
    howItWorks: 'POST an empty object (or specify locale for localized names). The API generates a coherent fake profile where the email matches the name, the phone number is in the correct format for the region, and the address uses real city/state/ZIP combinations.',
    useCases: [
      'Seed test databases with realistic user records for development',
      'Generate sample data for UI mockups and screenshots',
      'Create test accounts in staging environments without using real PII',
      'Populate load testing scenarios with varied but realistic user data',
    ],
  },
  'json-schema-validate': {
    seoTitle: 'JSON Schema Validate API - Validate JSON Against Schema',
    metaDesc: 'Validate any JSON against a JSON Schema (draft-07) via API. Returns all validation errors with paths. 1 credit per call. Essential for agent output validation.',
    keywords: ['json schema validate api', 'json validation api', 'validate json api', 'json schema checker', 'ajv api', 'json schema draft-07 api'],
    lead: 'Validate JSON data against a JSON Schema (draft-07) via REST API. Returns all validation errors with JSON Pointer paths, making it easy to identify exactly which field failed and why — essential for validating LLM outputs, API responses, and user-submitted data.',
    howItWorks: 'POST a JSON data object and a JSON Schema object. The API runs full draft-07 validation including type checking, required fields, enum constraints, min/max, pattern matching, and array item validation. Returns <code>valid: true</code> or an array of error objects with paths and messages.',
    useCases: [
      'Validate structured data extracted from LLM outputs before using it',
      'Check API request payloads against a schema in a middleware layer',
      'Validate configuration files or user-submitted JSON in web apps',
      'Build data quality gates in ETL pipelines',
    ],
  },
  'webhook-send': {
    seoTitle: 'Webhook Send API - POST to Any URL from an Agent',
    metaDesc: 'POST to any webhook URL with any JSON payload via API. Agents use this to notify external systems. Returns HTTP status + response. 5 credits.',
    keywords: ['webhook api', 'send webhook api', 'post to url api', 'http post api', 'agent webhook api', 'outbound webhook api'],
    lead: 'Send HTTP POST requests to any URL with any JSON payload via REST API. AI agents cannot make outbound HTTP calls natively — this API bridges that gap, allowing agents to trigger Zapier zaps, notify Slack via webhooks, update external systems, or call any REST API.',
    howItWorks: 'POST the target URL, payload, and optional headers. The API makes an HTTP POST request to the target, waits for a response, and returns the HTTP status code, response headers, and response body. Supports custom headers for authentication.',
    useCases: [
      'Trigger Zapier or Make.com automations from an AI agent workflow',
      'Send Slack or Discord notifications when an agent completes a task',
      'Update a CRM or project management tool at the end of a workflow',
      'Call any REST API from an agent that cannot make outbound requests directly',
    ],
  },
  'llm-output-extract-json': {
    seoTitle: 'Extract JSON from LLM Output API - Parse Messy LLM Responses',
    metaDesc: 'Extract clean JSON from messy LLM output: markdown code fences, explanation text, single quotes, trailing commas. The #1 agent pain point solved. 1 credit.',
    keywords: ['extract json from llm output', 'parse llm json api', 'llm json extractor', 'fix llm json api', 'clean llm response api'],
    lead: 'Extract valid JSON from messy LLM outputs via REST API. LLMs frequently wrap JSON in markdown code fences, add explanatory text before and after, use single quotes, or include trailing commas — this API strips all of that and returns clean, parseable JSON.',
    howItWorks: 'POST the raw LLM output string. The API tries multiple extraction strategies in order: strip markdown code fences, extract the largest JSON-like substring, fix common syntax errors (single quotes, trailing commas, missing braces), and return valid JSON.',
    useCases: [
      'Parse structured data from LLM responses in agent pipelines reliably',
      'Handle inconsistent JSON formatting across different model providers',
      'Build robust agent tool call parsers that handle malformed outputs',
      'Pre-process LLM outputs before passing to JSON Schema validation',
    ],
  },
  'date-diff': {
    seoTitle: 'Date Difference API - Calculate Days Between Dates',
    metaDesc: 'Calculate the difference between two dates in days, hours, minutes, seconds via API. Handles timezones. 1 credit per call.',
    keywords: ['date difference api', 'days between dates api', 'date calc api', 'calculate date diff', 'date arithmetic api'],
    lead: 'Calculate the precise difference between two dates via REST API. Returns the difference broken down into years, months, weeks, days, hours, minutes, and seconds — and handles timezone-aware date strings correctly.',
    howItWorks: 'POST two date strings (ISO 8601, Unix timestamps, or natural language dates). The API parses both, computes the absolute difference, and returns it in multiple units simultaneously.',
    useCases: [
      'Calculate age from a birthdate for user verification',
      'Compute SLA duration from ticket open/close timestamps',
      'Calculate project duration in business days for scheduling',
      'Determine subscription age or time-since-signup for churn analysis',
    ],
  },
  'text-word-count': {
    seoTitle: 'Word Count API - Count Words, Characters, Sentences via API',
    metaDesc: 'Count words, characters (with/without spaces), sentences, and paragraphs in any text via API. 1 credit. Returns detailed text statistics.',
    keywords: ['word count api', 'count words api', 'text statistics api', 'character count api', 'sentence count api'],
    lead: 'Count words, characters, sentences, and paragraphs in any text via REST API. Returns a comprehensive text statistics breakdown in a single call — useful for content length validation, readability analysis, and billing by word count.',
    howItWorks: 'POST any text string. Returns: word count (splitting on whitespace), character count with spaces, character count without spaces, sentence count (splitting on terminal punctuation), paragraph count (splitting on double newlines), and average word length.',
    useCases: [
      'Validate that user-submitted content meets minimum or maximum length requirements',
      'Compute reading time estimates from word count in CMS systems',
      'Bill customers by word count for translation or editing services',
      'Analyze document length distribution across a corpus',
    ],
  },
  'text-case-convert': {
    seoTitle: 'Case Convert API - camelCase, snake_case, kebab-case Converter',
    metaDesc: 'Convert text between camelCase, snake_case, UPPER_CASE, kebab-case, Title Case via API. 1 credit. Essential for code generation and data transformation.',
    keywords: ['case convert api', 'camelcase to snakecase api', 'string case converter api', 'kebab case api', 'case transformation api'],
    lead: 'Convert text between any naming convention via REST API: camelCase, snake_case, UPPER_SNAKE_CASE, kebab-case, PascalCase, Title Case, and lowercase. Essential for code generation, API response normalization, and data transformation pipelines.',
    howItWorks: 'POST a string and the target case format. The API parses word boundaries intelligently (handles existing camelCase, snake_case, spaces, and hyphens), then re-joins in the target format.',
    useCases: [
      'Normalize database column names to JavaScript camelCase in API responses',
      'Convert user-typed labels to URL-safe kebab-case slugs',
      'Transform JSON keys between snake_case (Python APIs) and camelCase (JS)',
      'Generate variable names in the correct convention during code generation',
    ],
  },
  'code-json-to-typescript': {
    seoTitle: 'JSON to TypeScript Interface API - Generate TypeScript Types from JSON',
    metaDesc: 'Generate TypeScript interfaces from JSON example data via API. Infers types, handles nested objects and arrays. 3 credits per call.',
    keywords: ['json to typescript api', 'generate typescript interface api', 'json to ts types api', 'typescript interface generator', 'infer typescript types'],
    lead: 'Generate TypeScript interface definitions from JSON example data via REST API. Infers types from values, handles nested objects (generates nested interfaces), handles arrays (infers element types), and handles optional fields across multiple example objects.',
    howItWorks: 'POST a JSON object or array. The API inspects the structure and value types, generates appropriate TypeScript interface names from context, handles <code>null</code> as <code>T | null</code>, and returns a complete <code>.ts</code> compatible interface definition.',
    useCases: [
      'Generate TypeScript types for API responses during integration',
      'Create type definitions for JSON configuration files',
      'Bootstrap TypeScript types for third-party API data in new projects',
      'Automate type generation in code scaffolding tools',
    ],
  },
  'llm-proofread': {
    seoTitle: 'Proofreading API - AI Grammar and Spell Check via API',
    metaDesc: 'Check grammar, spelling, and style via AI API. Returns corrections with explanations. Claude-powered. 10 credits per call.',
    keywords: ['proofreading api', 'grammar check api', 'spell check api', 'ai proofreader api', 'grammar correction api'],
    lead: 'Proofread text for grammar, spelling, punctuation, and style issues using Claude AI via REST API. Returns specific corrections with explanations — not just red underlines, but the corrected text and a human-readable explanation of each change.',
    howItWorks: 'POST any text. The API returns: the corrected version of the full text, a list of individual corrections each with the original text, corrected text, issue type (grammar/spelling/style), and explanation.',
    useCases: [
      'Proofread user-generated content before publishing in a CMS',
      'Check marketing copy and emails for errors before sending',
      'Validate LLM-generated content for quality before delivering to users',
      'Build writing assistance tools that surface grammar issues inline',
    ],
  },
};

// ─── Real-world examples per API (3 per slug) ─────────────────────────────
// Each entry: [{ title, desc, input }]

const EXAMPLES = {
  'crypto-hash-sha256': [
    { title: 'Hash a password', desc: 'Generate a SHA256 digest of a user password for comparison (use crypto-password-hash for actual storage).', input: '{"data": "mysecretpassword"}' },
    { title: 'Generate cache key', desc: 'Create a stable cache key from a composite identifier.', input: '{"data": "user:42:profile:settings"}' },
    { title: 'Verify file integrity', desc: 'Hash a file\'s contents to check for tampering or corruption.', input: '{"data": "contents of important document..."}' },
  ],
  'crypto-hash-sha512': [
    { title: 'Document fingerprint', desc: 'Create a strong fingerprint for a large document before archiving.', input: '{"data": "Full text of legal contract..."}' },
    { title: 'HMAC key derivation', desc: 'Derive a 512-bit key from a passphrase for use in HMAC operations.', input: '{"data": "my-application-secret-passphrase"}' },
    { title: 'Audit trail entry', desc: 'Hash a transaction record to create a tamper-evident log entry.', input: '{"data": "txn:8821 user:99 action:delete amount:500"}' },
  ],
  'crypto-hash-md5': [
    { title: 'Generate ETag', desc: 'Create an HTTP ETag header value from response content.', input: '{"data": "<html><body>Hello World</body></html>"}' },
    { title: 'Legacy system checksum', desc: 'Compute an MD5 checksum to match a third-party system requirement.', input: '{"data": "order_id=12345&amount=99.99&currency=USD"}' },
    { title: 'Deduplication key', desc: 'Generate a fast dedup key for a batch of records.', input: '{"data": "john.doe@example.com|2024-01-15|purchase"}' },
  ],
  'crypto-hmac': [
    { title: 'Verify Stripe webhook', desc: 'Validate an incoming Stripe webhook payload signature.', input: '{"data": "{\\"id\\":\\"evt_123\\",\\"type\\":\\"payment_intent.succeeded\\"}", "key": "whsec_your_stripe_secret"}' },
    { title: 'Sign API request', desc: 'Sign a request body with a shared secret before sending to a partner API.', input: '{"data": "POST /api/orders 1705312800 {\"sku\":\"ABC123\"}", "key": "partner-api-secret"}' },
    { title: 'Generate one-time token', desc: 'Create a time-limited token for a password reset link.', input: '{"data": "user:42:reset:1705312800", "key": "app-reset-secret"}' },
  ],
  'crypto-uuid': [
    { title: 'Database primary key', desc: 'Generate a UUID to use as a primary key before inserting a new record.', input: '{}' },
    { title: 'Idempotency key for payment', desc: 'Create a unique key to prevent duplicate payment processing.', input: '{}' },
    { title: 'Distributed trace ID', desc: 'Generate a correlation ID to trace a request across microservices.', input: '{}' },
  ],
  'crypto-jwt-sign': [
    { title: 'Issue user session token', desc: 'Sign a JWT for a logged-in user with their ID and role.', input: '{"payload": {"user_id": 42, "role": "admin"}, "secret": "my-app-secret", "expiresIn": "24h"}' },
    { title: 'Service-to-service auth', desc: 'Issue a short-lived token for a backend microservice call.', input: '{"payload": {"service": "billing", "scope": "read:invoices"}, "secret": "internal-secret", "expiresIn": "5m"}' },
    { title: 'Email verification link', desc: 'Create a token to embed in a verification email link.', input: '{"payload": {"email": "user@example.com", "action": "verify"}, "secret": "verify-secret", "expiresIn": "1h"}' },
  ],
  'crypto-jwt-verify': [
    { title: 'Verify login token', desc: 'Check that a Bearer token from a request header is valid and unexpired.', input: '{"token": "eyJhbGciOiJIUzI1NiJ9...", "secret": "my-app-secret"}' },
    { title: 'Debug expired token', desc: 'Diagnose why authentication is failing for a specific token.', input: '{"token": "eyJhbGciOiJIUzI1NiJ9...", "secret": "my-app-secret"}' },
    { title: 'Validate third-party integration', desc: 'Verify tokens issued by a partner service before processing their events.', input: '{"token": "eyJhbGciOiJIUzI1NiJ9...", "secret": "partner-shared-secret"}' },
  ],
  'crypto-jwt-decode': [
    { title: 'Inspect production token', desc: 'Decode a production JWT to see its claims without needing the signing secret.', input: '{"token": "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjo0Mn0.abc"}' },
    { title: 'Check token expiry', desc: 'See when a token expires to debug authentication timeouts.', input: '{"token": "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3MDUzMTI4MDB9.xyz"}' },
    { title: 'Inspect third-party JWT structure', desc: 'Understand the claim structure of a JWT from an OAuth provider.', input: '{"token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.eyJzdWIiOiIxMjM0In0.sig"}' },
  ],
  'crypto-encrypt-aes': [
    { title: 'Encrypt API credentials', desc: 'Encrypt a third-party API key before storing it in the database.', input: '{"plaintext": "sk-openai-abc123xyz", "key": "0000000000000000000000000000000000000000000000000000000000000001"}' },
    { title: 'Encrypt PII field', desc: 'Encrypt a Social Security Number before saving to a record.', input: '{"plaintext": "123-45-6789", "key": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"}' },
    { title: 'Encrypt config value', desc: 'Encrypt a database password to store in a config file.', input: '{"plaintext": "prod-db-password-super-secret", "key": "cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe"}' },
  ],
  'crypto-decrypt-aes': [
    { title: 'Decrypt stored API key', desc: 'Retrieve and decrypt an API key that was stored encrypted in the database.', input: '{"key": "0000000000000000000000000000000000000000000000000000000000000001", "iv": "aabbccddeeff0011", "ciphertext": "...", "tag": "..."}' },
    { title: 'Decrypt PII for processing', desc: 'Temporarily decrypt an encrypted SSN field for a compliance report.', input: '{"key": "deadbeef...", "iv": "112233445566", "ciphertext": "...", "tag": "..."}' },
    { title: 'Decrypt config at startup', desc: 'Decrypt an encrypted config value when the application boots.', input: '{"key": "cafebabe...", "iv": "ffeeddccbbaa", "ciphertext": "...", "tag": "..."}' },
  ],
  'crypto-password-generate': [
    { title: 'New user initial password', desc: 'Generate a strong default password for a newly created account.', input: '{"length": 16, "uppercase": true, "lowercase": true, "numbers": true, "symbols": false}' },
    { title: 'High-security admin password', desc: 'Generate a complex password for an admin or root account.', input: '{"length": 32, "uppercase": true, "lowercase": true, "numbers": true, "symbols": true}' },
    { title: 'PIN for SMS verification', desc: 'Generate a 6-digit numeric PIN to send via SMS.', input: '{"length": 6, "uppercase": false, "lowercase": false, "numbers": true, "symbols": false}' },
  ],
  'crypto-password-hash': [
    { title: 'Hash new user password', desc: 'Hash a password during user registration before storing in the database.', input: '{"password": "MySecurePassword123!"}' },
    { title: 'Hash a PIN', desc: 'Hash a numeric PIN before storing for a mobile app.', input: '{"password": "492817"}' },
    { title: 'Migrate from MD5 hash', desc: 'Re-hash a password that was previously stored as MD5 using PBKDF2.', input: '{"password": "legacy_user_password"}' },
  ],
  'crypto-password-verify': [
    { title: 'Login verification', desc: 'Check a submitted password against the stored hash during login.', input: '{"password": "MySecurePassword123!", "hash": "stored_hash_hex", "salt": "stored_salt_hex"}' },
    { title: 'Password change flow', desc: 'Verify the old password before allowing the user to set a new one.', input: '{"password": "OldPassword456", "hash": "stored_hash_hex", "salt": "stored_salt_hex"}' },
    { title: 'PIN verification', desc: 'Check a submitted PIN against its stored PBKDF2 hash.', input: '{"password": "492817", "hash": "stored_pin_hash", "salt": "stored_pin_salt"}' },
  ],
  'text-token-count': [
    { title: 'Check if document fits context window', desc: 'Count tokens before sending a long document to an LLM.', input: '{"text": "The quarterly revenue report for Q3 2024 shows a 15% increase..."}' },
    { title: 'Estimate prompt cost', desc: 'Count tokens in a system prompt to estimate API spend.', input: '{"text": "You are a helpful assistant that specializes in financial analysis..."}' },
    { title: 'Split at token boundary', desc: 'Count tokens in a chunk to ensure it stays under a 4096-token limit.', input: '{"text": "Chapter 1: Introduction to machine learning and its applications in modern data science..."}' },
  ],
  'text-token-estimate-cost': [
    { title: 'Estimate GPT-4o cost', desc: 'Calculate what a long document analysis will cost on GPT-4o.', input: '{"text": "Full 10-page contract text...", "model": "gpt-4o"}' },
    { title: 'Compare Claude vs GPT pricing', desc: 'Estimate cost for the same prompt on Claude 3.5 Sonnet.', input: '{"text": "Full 10-page contract text...", "model": "claude-3-5-sonnet"}' },
    { title: 'Budget check before agent run', desc: 'Estimate total tokens for an agent system prompt + user message.', input: '{"text": "System: You are an expert analyst... User: Analyze the following 500 rows of data...", "model": "gpt-4o-mini"}' },
  ],
  'exec-javascript': [
    { title: 'Run a transformation function', desc: 'Execute a data transformation written in JS on the fly.', input: '{"code": "const data = [1,2,3,4,5]; return data.map(x => x * 2).filter(x => x > 4);"}' },
    { title: 'Evaluate a user formula', desc: 'Execute a user-provided formula from a no-code tool safely.', input: '{"code": "const revenue = 150000; const cost = 87000; return ((revenue - cost) / revenue * 100).toFixed(2) + \'%\';"}' },
    { title: 'Test a sorting algorithm', desc: 'Run an agent-generated sorting implementation to verify correctness.', input: '{"code": "function bubbleSort(arr) { for(let i=0;i<arr.length;i++) for(let j=0;j<arr.length-i-1;j++) if(arr[j]>arr[j+1]) [arr[j],arr[j+1]]=[arr[j+1],arr[j]]; return arr; } return bubbleSort([5,3,8,1,9,2]);"}' },
  ],
  'llm-summarize': [
    { title: 'Summarize a news article', desc: 'Extract the key points from a long news article.', input: '{"text": "BRUSSELS — European regulators on Tuesday announced sweeping new rules...", "length": "short", "format": "bullets"}' },
    { title: 'Summarize meeting transcript', desc: 'Condense a 1-hour meeting into action items.', input: '{"text": "Alice: Let\'s discuss the Q4 roadmap. Bob: I think we should prioritize...", "length": "medium", "format": "bullets"}' },
    { title: 'TLDR for documentation', desc: 'Generate a one-sentence TLDR for a long technical doc.', input: '{"text": "This library provides a comprehensive set of utilities for...", "length": "short", "format": "tldr"}' },
  ],
  'llm-sentiment': [
    { title: 'Analyze product review', desc: 'Detect sentiment and which product aspects are positive or negative.', input: '{"text": "The battery life is incredible but the camera is disappointing compared to competitors."}' },
    { title: 'Monitor support ticket tone', desc: 'Classify an incoming support email as frustrated, neutral, or happy.', input: '{"text": "I\'ve been waiting 3 days for a response and my order still hasn\'t shipped. This is unacceptable."}' },
    { title: 'Analyze employee survey', desc: 'Extract sentiment from an open-ended survey response.', input: '{"text": "I love the flexible work hours, but the communication between teams could definitely be improved."}' },
  ],
  'llm-translate': [
    { title: 'Translate product description', desc: 'Localize an English product description into Spanish for a Latin American market.', input: '{"text": "Premium wireless headphones with 40-hour battery life and noise cancellation.", "target": "Spanish"}' },
    { title: 'Translate support ticket', desc: 'Translate a French customer complaint to English before routing.', input: '{"text": "Mon colis est arrivé endommagé et je souhaite un remboursement immédiat.", "target": "English"}' },
    { title: 'Localize UI copy', desc: 'Translate a button label and error message for a German interface.', input: '{"text": "Submit your order\nPayment failed. Please try again.", "target": "German"}' },
  ],
  'llm-classify': [
    { title: 'Route support ticket', desc: 'Classify an incoming ticket to the right team automatically.', input: '{"text": "I was charged twice for my subscription this month.", "categories": ["billing", "technical", "account", "shipping"]}' },
    { title: 'Tag blog post', desc: 'Assign a content category to an article for the editorial CMS.', input: '{"text": "New research shows intermittent fasting may reduce inflammation markers...", "categories": ["health", "technology", "finance", "travel", "science"]}' },
    { title: 'Classify job application', desc: 'Sort a resume into a role-fit tier for initial screening.', input: '{"text": "5 years Python, 3 years ML, published papers in NeurIPS...", "categories": ["senior_engineer", "mid_level", "junior", "not_a_fit"]}' },
  ],
  'llm-extract-entities': [
    { title: 'Extract contract parties and dates', desc: 'Pull structured data from a legal contract preamble.', input: '{"text": "This agreement is entered into on January 15, 2025 between Acme Corp, a Delaware corporation, and Beta LLC."}' },
    { title: 'Parse news article entities', desc: 'Extract people, organizations, and locations from a news story.', input: '{"text": "Apple CEO Tim Cook announced in Cupertino yesterday that the company will invest $500 million in a new facility in Texas."}' },
    { title: 'Extract action items from meeting notes', desc: 'Identify owners and tasks from raw meeting minutes.', input: '{"text": "John will send the revised proposal by Friday. Sarah needs to review the budget with finance by EOD Wednesday."}' },
  ],
  'sense-url-content': [
    { title: 'Feed article into LLM', desc: 'Fetch clean article text from a URL to use as context for summarization.', input: '{"url": "https://techcrunch.com/2024/01/15/some-article"}' },
    { title: 'Monitor competitor page', desc: 'Fetch a competitor\'s pricing page to detect content changes.', input: '{"url": "https://competitor.com/pricing"}' },
    { title: 'Scrape product description', desc: 'Extract product text from an e-commerce page for catalog enrichment.', input: '{"url": "https://store.example.com/products/widget-pro"}' },
  ],
  'sense-url-meta': [
    { title: 'Generate link preview', desc: 'Fetch OG tags to render a rich preview when a URL is shared in chat.', input: '{"url": "https://github.com/openai/openai-python"}' },
    { title: 'Audit SEO metadata', desc: 'Check that a published page has a proper meta description and OG image.', input: '{"url": "https://mysite.com/blog/new-post"}' },
    { title: 'Extract structured data', desc: 'Check if a recipe page has JSON-LD schema markup.', input: '{"url": "https://cooking.example.com/pasta-carbonara"}' },
  ],
  'sense-github-repo': [
    { title: 'Display live star count', desc: 'Show real-time GitHub stars on a project\'s landing page.', input: '{"repo": "facebook/react"}' },
    { title: 'Monitor dependency health', desc: 'Check if an open-source dependency is still actively maintained.', input: '{"repo": "lodash/lodash"}' },
    { title: 'Competitive analysis', desc: 'Compare star counts and issue counts for competitor libraries.', input: '{"repo": "vercel/next.js"}' },
  ],
  'memory-set': [
    { title: 'Store user preference', desc: 'Save a user\'s language preference across agent sessions.', input: '{"key": "user_language", "value": "es", "namespace": "user:42"}' },
    { title: 'Checkpoint workflow progress', desc: 'Save the current step of a multi-stage agent workflow.', input: '{"key": "workflow_step", "value": {"step": 3, "completed": ["fetch", "analyze"], "next": "generate"}, "namespace": "job:8821"}' },
    { title: 'Cache expensive computation', desc: 'Store a computed result with a 1-hour TTL to avoid recomputing.', input: '{"key": "report_2024_q3", "value": {"summary": "Revenue up 15%..."}, "ttl": 3600}' },
  ],
  'memory-get': [
    { title: 'Load user preferences', desc: 'Retrieve a user\'s stored preferences at the start of a session.', input: '{"key": "user_language", "namespace": "user:42"}' },
    { title: 'Resume workflow checkpoint', desc: 'Fetch the last-saved step to resume a paused agent workflow.', input: '{"key": "workflow_step", "namespace": "job:8821"}' },
    { title: 'Check for cached result', desc: 'See if a previously cached report is still available before regenerating.', input: '{"key": "report_2024_q3"}' },
  ],
  'text-csv-to-json': [
    { title: 'Parse spreadsheet export', desc: 'Convert a CSV exported from Excel into JSON for an import pipeline.', input: '{"csv": "name,email,role\\nAlice,alice@example.com,admin\\nBob,bob@example.com,user"}' },
    { title: 'Process webhook CSV payload', desc: 'Parse a CSV body from an incoming webhook before storing records.', input: '{"csv": "order_id,sku,qty,price\\n1001,ABC-123,2,29.99\\n1002,XYZ-789,1,49.99"}' },
    { title: 'Convert data for LLM analysis', desc: 'Turn a CSV of metrics into JSON objects to feed into a prompt.', input: '{"csv": "date,sessions,conversions,revenue\\n2024-01-01,1200,48,1440.00\\n2024-01-02,980,41,1230.00"}' },
  ],
  'text-json-to-csv': [
    { title: 'Export API data as CSV', desc: 'Turn a JSON array of user records into a downloadable CSV file.', input: '{"data": [{"name": "Alice", "email": "alice@example.com", "plan": "pro"}, {"name": "Bob", "email": "bob@example.com", "plan": "free"}]}' },
    { title: 'Generate CSV report', desc: 'Convert database query results to CSV for an Excel-based report.', input: '{"data": [{"month": "Jan", "revenue": 42000, "costs": 31000}, {"month": "Feb", "revenue": 51000, "costs": 34000}]}' },
    { title: 'Export for spreadsheet analysis', desc: 'Convert structured JSON logs to CSV for pivot table analysis.', input: '{"data": [{"api": "llm-summarize", "calls": 142, "credits": 1420}, {"api": "crypto-hash-sha256", "calls": 891, "credits": 891}]}' },
  ],
  'text-markdown-to-html': [
    { title: 'Render LLM output', desc: 'Convert Markdown returned by Claude into HTML for display in a web app.', input: '{"markdown": "## Summary\\n\\nThe analysis shows **three key findings**:\\n\\n1. Revenue increased 15%\\n2. Costs decreased 8%\\n3. Net margin improved to 22%"}' },
    { title: 'Render README as docs page', desc: 'Convert a project README.md to HTML for a documentation site.', input: '{"markdown": "# My Library\\n\\nInstall with:\\n\\n```bash\\nnpm install my-library\\n```\\n\\n## Usage\\n\\nSee [docs](https://docs.example.com) for details."}' },
    { title: 'Render email body', desc: 'Convert a Markdown template into HTML for an email campaign.', input: '{"markdown": "Hi {{name}},\\n\\nYour **trial expires in 3 days**. [Upgrade now](https://app.example.com/upgrade) to keep access."}' },
  ],
  'math-statistics': [
    { title: 'Analyze API latencies', desc: 'Compute p50/p95/p99 from a sample of API response time measurements.', input: '{"numbers": [12, 45, 23, 67, 89, 34, 12, 56, 78, 23, 44, 102, 15, 33, 28]}' },
    { title: 'Summarize sales data', desc: 'Get mean, median, and standard deviation of monthly sales figures.', input: '{"numbers": [42000, 51000, 38000, 67000, 59000, 44000, 71000, 55000, 48000, 62000, 49000, 73000]}' },
    { title: 'Validate data distribution', desc: 'Check if a set of model confidence scores has expected distribution before training.', input: '{"numbers": [0.92, 0.87, 0.45, 0.91, 0.23, 0.78, 0.88, 0.61, 0.95, 0.33, 0.72, 0.84]}' },
  ],
  'net-dns-a': [
    { title: 'Verify DNS after migration', desc: 'Check A records after pointing a domain to a new server to confirm propagation.', input: '{"domain": "example.com"}' },
    { title: 'Pre-flight check in agent', desc: 'Verify a domain resolves before making HTTP requests in an automation workflow.', input: '{"domain": "api.github.com"}' },
    { title: 'Audit infrastructure DNS', desc: 'Check that all production subdomains resolve to expected IPs.', input: '{"domain": "app.myproduct.com"}' },
  ],
  'net-ssl-check': [
    { title: 'Monitor cert expiry', desc: 'Check days remaining on an SSL certificate before it expires.', input: '{"host": "github.com"}' },
    { title: 'Verify cert after renewal', desc: 'Confirm a new certificate is installed and covers all required SANs.', input: '{"host": "api.myproduct.com"}' },
    { title: 'Audit third-party service cert', desc: 'Check certificate details of an external API before integrating.', input: '{"host": "api.stripe.com"}' },
  ],
  'llm-code-generate': [
    { title: 'Generate a CRUD handler', desc: 'Generate an Express.js route handler for a REST resource.', input: '{"description": "Express POST /users route that validates email and password, hashes the password with bcrypt, and inserts into a PostgreSQL users table", "language": "javascript"}' },
    { title: 'Generate a Python data transform', desc: 'Create a function to normalize a nested JSON structure.', input: '{"description": "Python function that takes a list of user dicts with nested address objects and flattens them to a CSV-compatible format", "language": "python"}' },
    { title: 'Generate a SQL migration', desc: 'Write a migration to add a new table with indexes.', input: '{"description": "PostgreSQL migration to create a marketplace_submissions table with slug, name, credits, status, and created_at columns, with a unique index on slug", "language": "sql"}' },
  ],
  'llm-code-review': [
    { title: 'Review authentication code', desc: 'Check an auth function for security vulnerabilities before shipping.', input: '{"code": "function login(user, pass) {\\n  const row = db.query(`SELECT * FROM users WHERE email=\'${user}\'`);\\n  if (row.password === pass) return generateToken(row);\\n}", "language": "javascript"}' },
    { title: 'Review data processing logic', desc: 'Audit a data transformation function for bugs and edge cases.', input: '{"code": "def calculate_discount(price, coupon):\\n  if coupon == \'SAVE10\':\\n    return price * 0.9\\n  if coupon == \'HALF\':\\n    return price / 2\\n  return price", "language": "python"}' },
    { title: 'Review CI script', desc: 'Check a deployment script for reliability issues.', input: '{"code": "rm -rf ./dist && npm run build && cp -r ./dist /var/www/html && echo Done", "language": "bash"}' },
  ],
  'llm-blog-draft': [
    { title: 'Write a technical tutorial', desc: 'Draft a how-to article targeting developers searching for a specific solution.', input: '{"topic": "How to implement JWT authentication in a Node.js Express API", "keywords": ["jwt auth nodejs", "express jwt tutorial"], "length": "medium", "tone": "technical"}' },
    { title: 'Write a product launch post', desc: 'Generate a launch announcement blog post for a new feature.', input: '{"topic": "Announcing real-time collaboration in our design tool", "keywords": ["design collaboration", "real-time editing"], "length": "medium", "tone": "professional"}' },
    { title: 'Write an SEO landing article', desc: 'Draft a keyword-targeting article for organic search traffic.', input: '{"topic": "Best API tools for AI agent development in 2025", "keywords": ["api tools for ai agents", "ai agent apis"], "length": "long", "tone": "casual"}' },
  ],
  'gen-fake-user': [
    { title: 'Seed test database', desc: 'Generate a realistic user profile to seed a development database.', input: '{"locale": "en_US"}' },
    { title: 'Populate UI mockup', desc: 'Generate a user profile for a realistic-looking UI screenshot.', input: '{"locale": "en_GB"}' },
    { title: 'Create load test user', desc: 'Generate a test account with realistic data for a load testing scenario.', input: '{"locale": "de_DE"}' },
  ],
  'json-schema-validate': [
    { title: 'Validate LLM structured output', desc: 'Verify that a JSON object extracted from an LLM response has the expected shape.', input: '{"data": {"name": "Alice", "email": "alice@example.com", "role": "admin"}, "schema": {"type": "object", "required": ["name", "email", "role"], "properties": {"name": {"type": "string"}, "email": {"type": "string", "format": "email"}, "role": {"type": "string", "enum": ["admin", "user"]}}}}' },
    { title: 'Validate incoming webhook payload', desc: 'Check that a webhook payload has all required fields before processing.', input: '{"data": {"event": "order.created", "order_id": 1234}, "schema": {"type": "object", "required": ["event", "order_id"], "properties": {"event": {"type": "string"}, "order_id": {"type": "number"}}}}' },
    { title: 'Validate user-submitted config', desc: 'Reject invalid configuration JSON from a user before saving it.', input: '{"data": {"timeout": "30s", "retries": 5}, "schema": {"type": "object", "properties": {"timeout": {"type": "number"}, "retries": {"type": "number", "maximum": 10}}}}' },
  ],
  'webhook-send': [
    { title: 'Trigger Zapier automation', desc: 'Send an agent result to a Zapier webhook to update a Google Sheet.', input: '{"url": "https://hooks.zapier.com/hooks/catch/12345/abcdef", "payload": {"user": "alice@example.com", "action": "signup", "plan": "pro"}}' },
    { title: 'Send Slack notification', desc: 'Post a message to a Slack channel when an agent task completes.', input: '{"url": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX", "payload": {"text": "Agent completed: Report generated for Q3 2024. 142 records processed."}}' },
    { title: 'Update external CRM', desc: 'Send enriched lead data to a CRM via its REST API after processing.', input: '{"url": "https://api.hubspot.com/crm/v3/objects/contacts", "payload": {"properties": {"email": "lead@company.com", "firstname": "John"}}, "headers": {"Authorization": "Bearer hspot-token"}}' },
  ],
  'llm-output-extract-json': [
    { title: 'Parse fenced code block', desc: 'Extract JSON from an LLM response that wrapped it in a markdown code block.', input: '{"text": "Here is the structured data:\\n```json\\n{\\"name\\": \\"Alice\\", \\"score\\": 92}\\n```\\nLet me know if you need anything else."}' },
    { title: 'Fix single-quoted JSON', desc: 'Extract and fix JSON where the LLM used single quotes instead of double quotes.', input: '{"text": "{\'name\': \'Bob\', \'active\': true, \'score\': 88}"}' },
    { title: 'Extract from verbose response', desc: 'Pull the JSON object out of a long explanation with embedded JSON.', input: '{"text": "Based on my analysis, the sentiment data is: {\\"sentiment\\": \\"positive\\", \\"confidence\\": 0.94, \\"aspects\\": [\\"battery\\", \\"design\\"]}. These results indicate a strong positive response."}' },
  ],
  'date-diff': [
    { title: 'Calculate user account age', desc: 'Find how long a user has been a customer since their signup date.', input: '{"date1": "2022-03-15", "date2": "2025-03-26"}' },
    { title: 'Compute SLA duration', desc: 'Calculate how long a support ticket was open from open to close timestamps.', input: '{"date1": "2025-03-24T09:15:00Z", "date2": "2025-03-26T14:30:00Z"}' },
    { title: 'Subscription duration check', desc: 'Determine if a subscription has been active for more than 30 days.', input: '{"date1": "2025-02-01", "date2": "2025-03-26"}' },
  ],
  'text-word-count': [
    { title: 'Validate content length', desc: 'Check that a blog post meets a minimum 500-word requirement.', input: '{"text": "In the fast-evolving world of software development, API-first design has become the cornerstone of modern application architecture..."}' },
    { title: 'Calculate reading time', desc: 'Estimate reading time for an article to display on a blog homepage.', input: '{"text": "Artificial intelligence is transforming how businesses operate across every industry..."}' },
    { title: 'Bill by word count', desc: 'Count words in a translated document to compute the invoice amount.', input: '{"text": "Le chiffre d\'affaires trimestriel de la société a augmenté de 15% par rapport au trimestre précédent..."}' },
  ],
  'text-case-convert': [
    { title: 'Normalize API response keys', desc: 'Convert snake_case database column names to camelCase for a JavaScript API response.', input: '{"text": "user_created_at", "to": "camelCase"}' },
    { title: 'Generate URL slug', desc: 'Convert a blog post title to a URL-safe kebab-case slug.', input: '{"text": "Top 10 API Tools for AI Agents in 2025", "to": "kebab-case"}' },
    { title: 'Convert for Python variable', desc: 'Turn a camelCase JS variable name into a Python-style snake_case variable.', input: '{"text": "userProfileSettings", "to": "snake_case"}' },
  ],
  'code-json-to-typescript': [
    { title: 'Type an API response', desc: 'Generate a TypeScript interface from a real API response object.', input: '{"json": {"id": 42, "name": "Alice", "email": "alice@example.com", "created_at": "2025-01-15T10:30:00Z", "plan": {"type": "pro", "expires": "2026-01-15"}}}' },
    { title: 'Type a config file', desc: 'Generate TypeScript types for a JSON configuration structure.', input: '{"json": {"server": {"port": 3000, "host": "localhost"}, "database": {"url": "postgres://...", "pool": 10}, "features": {"enableBeta": false}}}' },
    { title: 'Type an event payload', desc: 'Create a TypeScript interface for a webhook event payload.', input: '{"json": {"event": "order.created", "order_id": 1234, "customer": {"id": 99, "email": "bob@example.com"}, "total": 149.99, "items": [{"sku": "ABC", "qty": 2}]}}' },
  ],
  'llm-proofread': [
    { title: 'Proofread marketing email', desc: 'Fix grammar and style in a marketing email before sending to subscribers.', input: '{"text": "We\'re exited to anounce our newest feature that going to change how you work with data forever!"}' },
    { title: 'Proofread LLM output', desc: 'Catch errors in AI-generated content before delivering it to a user.', input: '{"text": "The quarterly report show a 15% increasing in revenue. This represent a significant improvment over previuos period."}' },
    { title: 'Proofread user review', desc: 'Clean up grammar in a user-generated review before publishing on a site.', input: '{"text": "i really like this product alot, its way better then i expected the quality is really good"}' },
  ],
};

// ─── Fallback: generate category-aware examples for unmapped APIs ──────────

function generateCategoryExamples(slug, def) {
  const name = def.name;
  const cat = def.cat;
  const tier = def.tier;

  if (tier === 'llm' || cat.startsWith('AI')) {
    return [
      { title: `Analyze text with ${name}`, desc: `Submit a document or string for ${name.toLowerCase()} processing.`, input: `{"text": "This is a sample document or input text for processing."}` },
      { title: `Process a customer message`, desc: `Run ${name.toLowerCase()} on an incoming customer support message.`, input: `{"text": "Hello, I need help with my account. I can't seem to log in and the password reset isn't working."}` },
      { title: `Batch process content`, desc: `Apply ${name.toLowerCase()} to a piece of marketing content.`, input: `{"text": "Introducing our revolutionary product that transforms the way teams collaborate on complex projects."}` },
    ];
  }
  if (cat === 'Crypto & Security') {
    return [
      { title: `Hash a string`, desc: `Compute ${name.toLowerCase()} on a plain text input.`, input: `{"input": "hello world"}` },
      { title: `Hash a user identifier`, desc: `Generate a ${name.toLowerCase()} for a user email or ID.`, input: `{"input": "user@example.com"}` },
      { title: `Hash a composite key`, desc: `Create a stable identifier from multiple fields.`, input: `{"input": "user:42:session:abc123"}` },
    ];
  }
  if (cat === 'Math & Numbers') {
    return [
      { title: `Compute on sample data`, desc: `Run ${name.toLowerCase()} on a numeric dataset.`, input: `{"numbers": [10, 25, 38, 42, 15, 88, 67, 31]}` },
      { title: `Process a metrics array`, desc: `Apply ${name.toLowerCase()} to server latency measurements.`, input: `{"numbers": [12, 45, 23, 78, 34, 56, 89, 11, 44, 67]}` },
      { title: `Analyze financial data`, desc: `Use ${name.toLowerCase()} on monthly revenue figures.`, input: `{"numbers": [42000, 51000, 38000, 67000, 59000, 44000]}` },
    ];
  }
  if (cat === 'Network & DNS' || cat === 'Sense: Web') {
    return [
      { title: `Query a production domain`, desc: `Look up ${name.toLowerCase()} data for a live production domain.`, input: `{"domain": "example.com"}` },
      { title: `Check an API endpoint domain`, desc: `Run ${name.toLowerCase()} on an external API host.`, input: `{"domain": "api.github.com"}` },
      { title: `Monitor your own infrastructure`, desc: `Check ${name.toLowerCase()} for your application domain.`, input: `{"domain": "app.yourproduct.com"}` },
    ];
  }
  if (cat === 'Date & Time') {
    return [
      { title: `Process today's date`, desc: `Use ${name.toLowerCase()} with the current date.`, input: `{"date": "2025-03-26"}` },
      { title: `Process a timestamp`, desc: `Apply ${name.toLowerCase()} to an ISO 8601 datetime.`, input: `{"date": "2025-03-26T14:30:00Z"}` },
      { title: `Process a Unix timestamp`, desc: `Run ${name.toLowerCase()} on a Unix epoch value.`, input: `{"date": "1742900000"}` },
    ];
  }
  if (cat === 'Text Processing' || cat === 'Data Transform') {
    return [
      { title: `Process a short string`, desc: `Apply ${name.toLowerCase()} to a simple input.`, input: `{"text": "Hello, world!"}` },
      { title: `Process a longer document`, desc: `Run ${name.toLowerCase()} on a paragraph of text.`, input: `{"text": "The quarterly revenue report shows a significant increase across all major product lines compared to the previous year."}` },
      { title: `Process code or structured text`, desc: `Use ${name.toLowerCase()} on a structured or technical string.`, input: `{"text": "function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }"}` },
    ];
  }
  if (cat === 'Memory') {
    return [
      { title: `Store a simple value`, desc: `Persist a string value for retrieval in a future session.`, input: `{"key": "my_key", "value": "hello world"}` },
      { title: `Store structured data`, desc: `Save a JSON object as agent state.`, input: `{"key": "user_preferences", "value": {"theme": "dark", "language": "en", "notifications": true}}` },
      { title: `Store with namespace`, desc: `Save a value under a specific namespace for isolation.`, input: `{"key": "session_data", "value": {"step": 2, "completed": true}, "namespace": "agent:session:xyz"}` },
    ];
  }
  if (cat === 'Execute') {
    return [
      { title: `Run a simple expression`, desc: `Execute a basic JavaScript expression in the sandbox.`, input: `{"code": "return 2 + 2;"}` },
      { title: `Run a data transformation`, desc: `Execute an array transformation in the sandboxed environment.`, input: `{"code": "const data = [1, 2, 3, 4, 5]; return data.map(x => x * x);"}` },
      { title: `Run a string operation`, desc: `Execute string manipulation code safely in the sandbox.`, input: `{"code": "const s = 'hello world'; return s.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');"}` },
    ];
  }
  // Generic fallback
  return [
    { title: `Basic usage`, desc: `Call ${name} with a simple input.`, input: `{"input": "sample input data"}` },
    { title: `Use in an agent pipeline`, desc: `Call ${name} as a step in an automated workflow.`, input: `{"input": "agent workflow input for ${name.toLowerCase()}"}` },
    { title: `Use from a serverless function`, desc: `Invoke ${name} from a cloud function with real data.`, input: `{"input": "production data payload"}` },
  ];
}

// ─── Category-level related APIs (for "Related APIs" section) ──────────────

const CATEGORY_RELATED = {};
for (const [slug, def] of Object.entries(ALL_APIS)) {
  const cat = def.cat;
  if (!CATEGORY_RELATED[cat]) CATEGORY_RELATED[cat] = [];
  CATEGORY_RELATED[cat].push(slug);
}

// ─── Price mapping ─────────────────────────────────────────────────────────
const CREDIT_TO_USD = {
  1: '$0.001',
  3: '$0.003',
  5: '$0.005',
  10: '$0.01',
  20: '$0.02',
};

// ─── Smart default SEO generation ─────────────────────────────────────────

function titleize(str) {
  return str.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function slugToWords(slug) {
  return slug.replace(/-/g, ' ');
}

function generateDefaultSEO(slug, def) {
  const name = def.name;
  const cat = def.cat;
  const desc = def.desc;
  const credits = def.credits;
  const usd = CREDIT_TO_USD[credits] || `$${(credits * 0.001).toFixed(3)}`;

  // Build SEO title
  let seoTitle = `${name} API`;
  if (cat.includes('AI:') || cat === 'AI') {
    seoTitle = `${name} API - AI-Powered ${name}`;
  } else if (cat === 'Crypto & Security') {
    seoTitle = `${name} API - Online ${name} Tool`;
  } else if (cat === 'Math & Numbers') {
    seoTitle = `${name} API - Calculate ${name} Online`;
  } else if (cat === 'Data Transform') {
    seoTitle = `${name} API - Convert Data Online`;
  } else if (cat === 'Network & DNS' || cat === 'Sense: Web') {
    seoTitle = `${name} API - Real-Time ${name}`;
  } else if (cat === 'Execute') {
    seoTitle = `${name} API - Run Code via API`;
  } else if (cat === 'Memory') {
    seoTitle = `${name} API - Persistent Agent State`;
  } else if (cat === 'Generate' || cat === 'Generate: Doc') {
    seoTitle = `${name} API - Generate ${name} Online`;
  } else if (cat === 'Analyze') {
    seoTitle = `${name} API - Analyze Data via API`;
  } else if (cat === 'Orchestrate') {
    seoTitle = `${name} API - Agent Workflow Orchestration`;
  } else if (cat === 'Enrich') {
    seoTitle = `${name} API - Data Enrichment via API`;
  } else if (cat === 'Communicate') {
    seoTitle = `${name} API - Communication via API`;
  }

  const metaDesc = `${desc} ${credits} credit${credits > 1 ? 's' : ''} per call. ${usd} per call. curl, Python, Node.js examples. Try it live at Slopshop.gg.`;

  // Build keywords from name and category
  const nameWords = slugToWords(slug).toLowerCase();
  const keywords = [
    `${nameWords} api`,
    `${name.toLowerCase()} api`,
    `online ${nameWords}`,
    `${nameWords} tool`,
  ];

  const lead = `${desc} Available as a simple REST API — POST your input, get structured JSON back. ${credits} credit${credits > 1 ? 's' : ''} per call, no rate limiting, works in any language with HTTP support.`;

  const howItWorks = `POST a JSON object with your input data to <code>/v1/${slug}</code>. The API processes your request server-side using real computation (not mocked data) and returns a structured JSON response with your results and metadata including credits used and processing time.`;

  const useCases = [
    `Use ${name} in automated pipelines without installing a library`,
    `Call ${name} from AI agent workflows via MCP or REST`,
    `Integrate ${name} into serverless functions with zero dependencies`,
    `Build ${name} functionality into any language that supports HTTP`,
  ];

  return { seoTitle, metaDesc, keywords, lead, howItWorks, useCases };
}

// ─── Input parameters table from known schema patterns ────────────────────

function getInputParams(slug, def) {
  const tier = def.tier;
  const cat = def.cat;

  // Generic params by category
  if (cat === 'Text Processing' || cat === 'Data Transform') {
    return [
      { name: 'text / input', type: 'string', req: true, desc: 'The text or data to process' },
    ];
  }
  if (cat === 'Crypto & Security') {
    return [
      { name: 'input / data', type: 'string', req: true, desc: 'The input data to hash or process' },
    ];
  }
  if (cat === 'Math & Numbers') {
    return [
      { name: 'input / numbers', type: 'number | array', req: true, desc: 'The number(s) to compute' },
    ];
  }
  if (tier === 'llm') {
    return [
      { name: 'text', type: 'string', req: true, desc: 'The text to process with AI' },
      { name: 'options', type: 'object', req: false, desc: 'Optional configuration (format, length, etc.)' },
    ];
  }
  if (cat === 'Network & DNS' || cat === 'Sense: Web') {
    return [
      { name: 'url / domain', type: 'string', req: true, desc: 'The URL or domain name to query' },
    ];
  }
  if (cat === 'Memory') {
    return [
      { name: 'key', type: 'string', req: true, desc: 'The memory key name' },
      { name: 'value', type: 'any', req: false, desc: 'The value to store (for set operations)' },
      { name: 'namespace', type: 'string', req: false, desc: 'Optional namespace for isolation' },
    ];
  }
  return [
    { name: 'input', type: 'string | object', req: true, desc: 'The input data to process' },
  ];
}

// ─── Example response ─────────────────────────────────────────────────────

function getExampleResponse(slug, def) {
  const cat = def.cat;
  const credits = def.credits;

  const base = (data) => JSON.stringify({
    data,
    meta: { credits_used: credits, engine: 'real', ms: 4 }
  }, null, 2);

  if (slug === 'crypto-hash-sha256') return base({ hash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', algorithm: 'sha256', input_length: 11 });
  if (slug === 'crypto-uuid') return base({ uuid: '550e8400-e29b-41d4-a716-446655440000' });
  if (slug === 'text-word-count') return base({ words: 142, characters: 832, characters_no_spaces: 695, sentences: 8, paragraphs: 3 });
  if (slug === 'text-token-count') return base({ tokens: 211, characters: 832, words: 142, model: 'gpt-4' });
  if (cat === 'Crypto & Security') return base({ result: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', algorithm: slug.replace('crypto-', '') });
  if (cat === 'Math & Numbers') return base({ result: 42.5, input: [10, 20, 75] });
  if (cat === 'Date & Time') return base({ result: '2025-01-15T10:30:00.000Z', formatted: 'January 15, 2025' });
  if (cat === 'Text Processing') return base({ result: 'processed output', count: 7 });
  if (cat === 'Data Transform') return base({ result: '[{"key":"value"}]', rows: 1 });
  if (def.tier === 'llm') return base({ result: 'AI-generated result based on your input.', model: 'claude-3-5-sonnet', tokens_used: 150 });
  if (cat === 'Network & DNS') return base({ records: ['93.184.216.34'], ttl: 86400 });
  if (cat === 'Memory') return base({ key: 'my-key', value: 'stored value', updated_at: '2025-01-15T10:30:00Z' });
  if (cat === 'Execute') return base({ result: 42, console: [], execution_ms: 3 });
  return base({ result: 'success', processed: true });
}

// ─── HTML template ────────────────────────────────────────────────────────

function buildPage(slug, def, seo) {
  const { seoTitle, metaDesc, keywords, lead, howItWorks, useCases } = seo;
  const name = def.name;
  const cat = def.cat;
  const credits = def.credits;
  const tier = def.tier;
  const usd = CREDIT_TO_USD[credits] || `$${(credits * 0.001).toFixed(3)}`;

  // Related APIs (same category, up to 5, excluding self)
  const related = (CATEGORY_RELATED[cat] || [])
    .filter(s => s !== slug)
    .slice(0, 5);

  const inputParams = getInputParams(slug, def);
  const exampleResponse = getExampleResponse(slug, def);

  // 3 real-world examples
  const examples = EXAMPLES[slug] || generateCategoryExamples(slug, def);

  const tierBadge = tier === 'llm' ? 'LLM' : tier === 'network' ? 'NETWORK' : tier === 'external' ? 'EXTERNAL' : 'COMPUTE';
  const tierColor = tier === 'llm' ? 'var(--v)' : tier === 'network' ? 'var(--c)' : tier === 'external' ? 'var(--o)' : 'var(--g)';

  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${name} API`,
    url: `https://slopshop.gg/api/${slug}`,
    description: metaDesc,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    provider: {
      '@type': 'Organization',
      name: 'Slopshop',
      url: 'https://slopshop.gg',
    },
    offers: {
      '@type': 'Offer',
      price: credits * 0.001,
      priceCurrency: 'USD',
      description: `${credits} credit${credits > 1 ? 's' : ''} per API call`,
    },
  });

  const curlExample = `curl -X POST https://slopshop.gg/v1/${slug} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "your data here"}'`;

  const pythonExample = `import requests

response = requests.post(
    "https://slopshop.gg/v1/${slug}",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={"input": "your data here"}
)
result = response.json()
print(result["data"])`;

  const nodeExample = `const response = await fetch("https://slopshop.gg/v1/${slug}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ input: "your data here" })
});
const { data } = await response.json();
console.log(data);`;

  const cliExample = `# Install the Slopshop CLI
npm install -g slopshop

# Set your API key
export SLOPSHOP_KEY=your_api_key

# Call ${slug}
slop ${slug} '{"input": "your data here"}'`;

  const relatedLinks = related.map(s => {
    const r = ALL_APIS[s];
    return `<li><a href="/api/${s}">${r ? r.name : s} API</a> — ${r ? r.desc : ''}</li>`;
  }).join('\n          ');

  const useCaseItems = useCases.map(u => `<li>${u}</li>`).join('\n          ');

  const paramRows = inputParams.map(p => `
            <tr>
              <td><code>${p.name}</code></td>
              <td>${p.type}</td>
              <td>${p.req ? '<span style="color:var(--r)">required</span>' : 'optional'}</td>
              <td>${p.desc}</td>
            </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${seoTitle} | Slopshop.gg</title>
<meta name="description" content="${metaDesc.replace(/"/g, '&quot;')}">
<meta name="keywords" content="${keywords.join(', ')}">
<link rel="canonical" href="https://slopshop.gg/api/${slug}">
<meta property="og:type" content="website">
<meta property="og:title" content="${seoTitle}">
<meta property="og:description" content="${metaDesc.replace(/"/g, '&quot;')}">
<meta property="og:url" content="https://slopshop.gg/api/${slug}">
<meta property="og:image" content="https://slopshop.gg/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${seoTitle}">
<meta name="twitter:description" content="${metaDesc.replace(/"/g, '&quot;')}">
<script type="application/ld+json">${structuredData}</script>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦞</text></svg>">
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#050505;--s1:#0f0f0f;--s2:#1a1a1a;--s3:#2a2a2a;
  --b:#1a1a1a;--b2:#2a2a2a;
  --t:#f5f5f5;--t2:#999;--t3:#666;--t4:#444;
  --r:#ff3333;--r2:#ff5555;--rg:rgba(255,51,51,0.08);
  --o:#ff8800;--og:rgba(255,136,0,0.1);
  --g:#00cc66;--gg:rgba(0,204,102,0.1);
  --c:#00aaff;--cg:rgba(0,170,255,0.1);
  --v:#8855ff;--vg:rgba(136,85,255,0.1);
  --mono:'JetBrains Mono',monospace;--sans:'Inter',system-ui,sans-serif;
}
body{font-family:var(--sans);background:var(--bg);color:var(--t);-webkit-font-smoothing:antialiased}
::selection{background:var(--r);color:#fff}
a{color:var(--r);text-decoration:none}a:hover{opacity:0.8}
nav{position:fixed;top:0;left:0;right:0;z-index:100;height:56px;background:rgba(5,5,5,0.8);backdrop-filter:blur(24px) saturate(180%);border-bottom:1px solid var(--b);display:flex;align-items:center;padding:0 32px}
.nv{max-width:1200px;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
.logo{font-family:var(--mono);font-weight:800;font-size:1rem;letter-spacing:0.1em;display:flex;align-items:center;gap:8px}
.logo .mark{color:var(--r)}.logo .gg{color:var(--t3);font-weight:500;font-size:0.7rem;margin-left:2px}
.nav-links{display:flex;gap:4px;align-items:center}
.nav-links a{color:var(--t3);font-size:0.75rem;font-weight:500;padding:6px 12px;border-radius:6px;transition:0.2s;font-family:var(--sans)}
.nav-links a:hover{color:var(--t);background:var(--s2);opacity:1}
main{max-width:860px;margin:0 auto;padding:88px 32px 64px}
.breadcrumb{font-family:var(--mono);font-size:0.7rem;color:var(--t4);margin-bottom:20px}
.breadcrumb a{color:var(--t3)}
.api-badge{display:inline-flex;align-items:center;gap:8px;margin-bottom:16px}
.badge{font-family:var(--mono);font-size:0.62rem;font-weight:700;padding:3px 10px;border-radius:4px;text-transform:uppercase}
.badge-cat{background:var(--s2);color:var(--t3)}
.badge-credits{background:var(--og);color:var(--o)}
h1{font-family:var(--mono);font-size:clamp(1.6rem,4vw,2.4rem);font-weight:800;letter-spacing:-0.02em;margin-bottom:16px;line-height:1.15}
.lead{font-size:1.05rem;color:var(--t2);line-height:1.8;margin-bottom:40px;max-width:720px}
.lead code{background:var(--s2);padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:0.88em;color:var(--t)}
.lead a{color:var(--r)}
h2{font-family:var(--mono);font-size:1.15rem;font-weight:700;margin:40px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--b)}
h3{font-family:var(--mono);font-size:0.9rem;font-weight:700;margin:20px 0 10px;color:var(--t2)}
p{color:var(--t2);line-height:1.8;margin-bottom:14px}
p code{background:var(--s2);padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:0.88em;color:var(--t)}
p a{color:var(--r)}
ul{color:var(--t2);padding-left:20px;line-height:2}
ul li{margin-bottom:4px}
pre{background:var(--s1);border:1px solid var(--b);border-radius:8px;padding:16px 18px;overflow-x:auto;margin:12px 0 20px}
pre code{font-family:var(--mono);font-size:0.78rem;line-height:1.8;color:var(--t2)}
table{width:100%;border-collapse:collapse;margin:12px 0 24px;font-size:0.82rem}
th{text-align:left;padding:8px 12px;border-bottom:1px solid var(--b2);font-family:var(--mono);font-size:0.7rem;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:0.06em}
td{padding:10px 12px;border-bottom:1px solid var(--b);color:var(--t2);vertical-align:top}
td code{background:var(--s2);padding:2px 6px;border-radius:4px;font-family:var(--mono);font-size:0.82em;color:var(--t)}
.pricing-box{background:var(--s1);border:1px solid var(--b);border-radius:10px;padding:24px;margin:12px 0 24px;display:flex;gap:40px;flex-wrap:wrap}
.pricing-item .label{font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--t4);font-family:var(--mono);margin-bottom:4px}
.pricing-item .value{font-family:var(--mono);font-size:1.3rem;font-weight:800;color:var(--o)}
.pricing-item .sub{font-size:0.7rem;color:var(--t4);margin-top:2px}
.tier-badge{display:inline-block;font-family:var(--mono);font-size:0.65rem;font-weight:700;padding:3px 10px;border-radius:4px;text-transform:uppercase;color:${tierColor};background:rgba(0,0,0,0.3);border:1px solid ${tierColor}30}
.related-grid{display:grid;grid-template-columns:1fr;gap:0}
.related-grid li{list-style:none;padding:10px 0;border-bottom:1px solid var(--b)}
.related-grid li:last-child{border-bottom:none}
.related-grid li a{font-family:var(--mono);font-size:0.82rem;font-weight:600}
.related-grid li{font-size:0.8rem;color:var(--t3)}
.try-btn{display:inline-block;background:var(--r);color:#fff;padding:12px 28px;border-radius:8px;font-family:var(--mono);font-size:0.82rem;font-weight:700;margin:16px 0 24px;transition:0.2s}
.try-btn:hover{background:#e62e2e;box-shadow:0 0 20px rgba(255,51,51,0.3);opacity:1}
.example-cards{display:grid;grid-template-columns:1fr;gap:16px;margin:16px 0 24px}
.example-card{background:var(--s1);border:1px solid var(--b);border-radius:10px;overflow:hidden}
.example-card-header{padding:14px 18px 10px;border-bottom:1px solid var(--b)}
.example-card-num{font-family:var(--mono);font-size:0.6rem;font-weight:700;color:var(--r);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px}
.example-card-title{font-family:var(--mono);font-size:0.88rem;font-weight:700;color:var(--t);margin-bottom:4px}
.example-card-desc{font-size:0.78rem;color:var(--t3);line-height:1.5}
.example-card pre{margin:0;border:none;border-radius:0;background:var(--bg);padding:14px 18px}
.example-card pre code{font-size:0.75rem}
footer{padding:40px 32px;text-align:center;border-top:1px solid var(--b)}
.f-brand{font-family:var(--mono);font-weight:800;font-size:1rem;margin-bottom:10px}
.f-brand .red{color:var(--r)}
footer p{font-size:0.68rem;color:var(--t4);line-height:2.2;font-family:var(--mono)}
footer a{color:var(--t3)}footer a:hover{color:var(--t);opacity:1}
@media(max-width:768px){nav{padding:0 16px}.nav-links a{display:none}main{padding:72px 16px 48px}h1{font-size:1.4rem}.lead{font-size:0.92rem}.pricing-box{gap:20px}}
</style>
</head>
<body>

<nav><div class="nv">
  <a href="/" class="logo"><span class="mark">&#129438; SLOP</span>SHOP<span class="gg">.GG</span></a>
  <div class="nav-links">
    <a href="/#playground">Playground</a>
    <a href="/#catalog">Catalog</a>
    <a href="/#pricing">Pricing</a>
    <a href="/docs">Docs</a>
    <a href="/dashboard">Dashboard</a>
    <a href="https://github.com/slopshop/slopshop">GitHub</a>
  </div>
</div></nav>

<main>
  <div class="breadcrumb">
    <a href="/">slopshop.gg</a> / <a href="/api/">API catalog</a> / ${slug}
  </div>

  <div class="api-badge">
    <span class="badge badge-cat">${cat}</span>
    <span class="badge badge-credits">${credits} credit${credits > 1 ? 's' : ''}</span>
    <span class="tier-badge">${tierBadge}</span>
  </div>

  <h1>${name} API</h1>

  <p class="lead">${lead}</p>

  <a href="https://slopshop.gg/#playground" class="try-btn">Try it live &#8594;</a>

  <h2>How it works</h2>
  <p>${howItWorks}</p>

  <h2>Use cases</h2>
  <ul>
    ${useCaseItems}
  </ul>

  <h2>API Reference</h2>
  <pre><code>POST https://slopshop.gg/v1/${slug}
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json</code></pre>

  <h3>Input parameters</h3>
  <table>
    <thead>
      <tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr>
    </thead>
    <tbody>${paramRows}
    </tbody>
  </table>

  <h3>Example response</h3>
  <pre><code>${exampleResponse.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>

  <h2>Examples</h2>
  <p>Three real-world scenarios showing how developers use ${name} in production.</p>
  <div class="example-cards">
${examples.map((ex, i) => `    <div class="example-card">
      <div class="example-card-header">
        <div class="example-card-num">Example ${i + 1}</div>
        <div class="example-card-title">${ex.title}</div>
        <div class="example-card-desc">${ex.desc}</div>
      </div>
      <pre><code>curl -X POST https://slopshop.gg/v1/${slug} \\
  -H "Authorization: Bearer $SLOPSHOP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${ex.input}'</code></pre>
    </div>`).join('\n')}
  </div>

  <h2>Code examples</h2>

  <h3>curl</h3>
  <pre><code>${curlExample}</code></pre>

  <h3>Python</h3>
  <pre><code>${pythonExample}</code></pre>

  <h3>Node.js</h3>
  <pre><code>${nodeExample}</code></pre>

  <h3>CLI</h3>
  <pre><code>${cliExample}</code></pre>

  <h2>Pricing</h2>
  <div class="pricing-box">
    <div class="pricing-item">
      <div class="label">Credits per call</div>
      <div class="value">${credits}</div>
      <div class="sub">credits</div>
    </div>
    <div class="pricing-item">
      <div class="label">Cost per call</div>
      <div class="value">${usd}</div>
      <div class="sub">at Starter tier</div>
    </div>
    <div class="pricing-item">
      <div class="label">Tier</div>
      <div class="value" style="font-size:0.9rem;color:${tierColor}">${tierBadge}</div>
      <div class="sub">${tier === 'llm' ? 'Requires LLM key' : tier === 'network' ? 'Makes network calls' : tier === 'external' ? 'Requires external key' : 'Pure compute'}</div>
    </div>
  </div>
  <p>Credits are purchased in bundles starting at $1 for 1,000 credits. All compute APIs like this one use ${credits} credit${credits > 1 ? 's' : ''} per call — that's ${usd}. <a href="/#pricing">See all pricing tiers</a>.</p>

  ${related.length > 0 ? `<h2>Related APIs in ${cat}</h2>
  <ul class="related-grid">
    ${relatedLinks}
  </ul>` : ''}

  <p style="margin-top:40px;font-size:0.8rem;color:var(--t4)">
    View the full <a href="/api/">API catalog</a> &middot;
    <a href="https://slopshop.gg/#playground">Try in playground</a> &middot;
    <a href="/docs">Documentation</a>
  </p>
</main>

<footer>
  <div class="f-brand">&#129438; <span class="red">SLOP</span>SHOP<span style="color:var(--t4)">.GG</span></div>
  <p>
    <a href="/docs">Docs</a> &middot; <a href="/dashboard">Dashboard</a> &middot; <a href="https://github.com/slopshop/slopshop">GitHub</a> &middot; <a href="/v1/tools">API</a> &middot; <a href="/v1/health">Status</a><br>
    1,250 APIs &middot; all real &middot; MIT License &middot; slopshop.gg
  </p>
</footer>

</body>
</html>`;
}

// ─── Index page ───────────────────────────────────────────────────────────

function buildIndexPage(allApis) {
  const byCategory = {};
  for (const [slug, def] of Object.entries(allApis)) {
    const cat = def.cat;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ slug, ...def });
  }

  const categorySections = Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b)).map(([cat, apis]) => {
    const items = apis.map(api => `
          <li>
            <a href="/api/${api.slug}">${api.name}</a>
            <span class="api-desc">${api.desc}</span>
            <span class="api-cr">${api.credits}cr</span>
          </li>`).join('');
    return `
      <section class="cat-section">
        <h2>${cat} <span class="cat-count">${apis.length}</span></h2>
        <ul class="api-list">
          ${items}
        </ul>
      </section>`;
  }).join('');

  const total = Object.keys(allApis).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>API Catalog - All ${total} APIs | Slopshop.gg</title>
<meta name="description" content="Browse all ${total} Slopshop APIs grouped by category. Crypto, AI, data transform, network, code execution, agent memory, and more. All real. Credit-based.">
<link rel="canonical" href="https://slopshop.gg/api/">
<meta property="og:title" content="Slopshop API Catalog - All ${total} APIs">
<meta property="og:description" content="Browse all ${total} Slopshop APIs. Crypto, AI, data transform, network, code execution, agent memory, and more.">
<meta property="og:url" content="https://slopshop.gg/api/">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦞</text></svg>">
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#050505;--s1:#0f0f0f;--s2:#1a1a1a;--s3:#2a2a2a;
  --b:#1a1a1a;--b2:#2a2a2a;
  --t:#f5f5f5;--t2:#999;--t3:#666;--t4:#444;
  --r:#ff3333;--r2:#ff5555;--rg:rgba(255,51,51,0.08);
  --o:#ff8800;--og:rgba(255,136,0,0.1);
  --g:#00cc66;--gg:rgba(0,204,102,0.1);
  --c:#00aaff;--cg:rgba(0,170,255,0.1);
  --v:#8855ff;--vg:rgba(136,85,255,0.1);
  --mono:'JetBrains Mono',monospace;--sans:'Inter',system-ui,sans-serif;
}
body{font-family:var(--sans);background:var(--bg);color:var(--t);-webkit-font-smoothing:antialiased}
a{color:var(--r);text-decoration:none}a:hover{opacity:0.8}
nav{position:fixed;top:0;left:0;right:0;z-index:100;height:56px;background:rgba(5,5,5,0.8);backdrop-filter:blur(24px) saturate(180%);border-bottom:1px solid var(--b);display:flex;align-items:center;padding:0 32px}
.nv{max-width:1200px;width:100%;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
.logo{font-family:var(--mono);font-weight:800;font-size:1rem;letter-spacing:0.1em}
.logo .mark{color:var(--r)}.logo .gg{color:var(--t3);font-weight:500;font-size:0.7rem}
.nav-links{display:flex;gap:4px}
.nav-links a{color:var(--t3);font-size:0.75rem;font-weight:500;padding:6px 12px;border-radius:6px;transition:0.2s}
.nav-links a:hover{color:var(--t);background:var(--s2);opacity:1}
main{max-width:1000px;margin:0 auto;padding:88px 32px 64px}
h1{font-family:var(--mono);font-size:2rem;font-weight:800;margin-bottom:8px}
.subtitle{color:var(--t3);margin-bottom:40px;font-size:0.9rem}
.search-bar{width:100%;background:var(--s1);border:1px solid var(--b);border-radius:8px;padding:12px 16px;color:var(--t);font-family:var(--mono);font-size:0.82rem;outline:none;margin-bottom:32px;transition:0.2s}
.search-bar:focus{border-color:var(--r);box-shadow:0 0 0 3px var(--rg)}
.cat-section{margin-bottom:40px}
h2{font-family:var(--mono);font-size:0.95rem;font-weight:700;color:var(--t3);margin-bottom:12px;padding:8px 0;border-bottom:1px solid var(--b);display:flex;align-items:center;gap:8px}
.cat-count{background:var(--s2);color:var(--t4);padding:2px 8px;border-radius:4px;font-size:0.65rem}
.api-list{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:4px}
.api-list li{background:var(--s1);border:1px solid var(--b);border-radius:6px;padding:10px 14px;display:flex;flex-direction:column;gap:3px;transition:0.2s}
.api-list li:hover{border-color:var(--r);box-shadow:0 2px 12px rgba(255,51,51,0.06)}
.api-list li a{font-family:var(--mono);font-size:0.78rem;font-weight:600;color:var(--t)}
.api-list li a:hover{color:var(--r);opacity:1}
.api-desc{font-size:0.72rem;color:var(--t3);line-height:1.5}
.api-cr{font-family:var(--mono);font-size:0.6rem;color:var(--o);font-weight:700;margin-top:2px}
footer{padding:40px 32px;text-align:center;border-top:1px solid var(--b)}
.f-brand{font-family:var(--mono);font-weight:800;font-size:1rem;margin-bottom:10px}
.f-brand .red{color:var(--r)}
footer p{font-size:0.68rem;color:var(--t4);line-height:2.2;font-family:var(--mono)}
footer a{color:var(--t3)}
@media(max-width:768px){nav{padding:0 16px}.nav-links a{display:none}main{padding:72px 16px 48px}.api-list{grid-template-columns:1fr}}
</style>
</head>
<body>

<nav><div class="nv">
  <a href="/" class="logo"><span class="mark">&#129438; SLOP</span>SHOP<span class="gg">.GG</span></a>
  <div class="nav-links">
    <a href="/#playground">Playground</a>
    <a href="/#catalog">Catalog</a>
    <a href="/#pricing">Pricing</a>
    <a href="/docs">Docs</a>
    <a href="/dashboard">Dashboard</a>
    <a href="https://github.com/slopshop/slopshop">GitHub</a>
  </div>
</div></nav>

<main>
  <h1>&#129438; API Catalog</h1>
  <p class="subtitle">${total} real APIs grouped by category &mdash; all computed from your actual input, no mocked data.</p>

  <input class="search-bar" type="search" id="search" placeholder="Search APIs by name, category, or description..." oninput="filterApis(this.value)">

  <div id="catalog">
    ${categorySections}
  </div>
</main>

<footer>
  <div class="f-brand">&#129438; <span class="red">SLOP</span>SHOP<span style="color:var(--t4)">.GG</span></div>
  <p>
    <a href="/docs">Docs</a> &middot; <a href="/dashboard">Dashboard</a> &middot; <a href="https://github.com/slopshop/slopshop">GitHub</a> &middot; <a href="/v1/tools">API</a><br>
    ${total} APIs &middot; all real &middot; MIT License &middot; slopshop.gg
  </p>
</footer>

<script>
function filterApis(q) {
  q = q.toLowerCase().trim();
  document.querySelectorAll('.api-list li').forEach(li => {
    const text = li.textContent.toLowerCase();
    li.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
  document.querySelectorAll('.cat-section').forEach(sec => {
    const visible = [...sec.querySelectorAll('.api-list li')].some(li => li.style.display !== 'none');
    sec.style.display = visible ? '' : 'none';
  });
}
</script>
</body>
</html>`;
}

// ─── Sitemap generation ───────────────────────────────────────────────────

function buildSitemap(slugs) {
  const today = new Date().toISOString().split('T')[0];
  const staticUrls = [
    `  <url><loc>https://slopshop.gg/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    `  <url><loc>https://slopshop.gg/docs.html</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>`,
    `  <url><loc>https://slopshop.gg/dashboard.html</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`,
    `  <url><loc>https://slopshop.gg/api/</loc><changefreq>weekly</changefreq><priority>0.9</priority><lastmod>${today}</lastmod></url>`,
  ];
  const apiUrls = slugs.map(slug =>
    `  <url><loc>https://slopshop.gg/api/${slug}</loc><changefreq>monthly</changefreq><priority>0.7</priority><lastmod>${today}</lastmod></url>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...apiUrls].join('\n')}
</urlset>
`;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const outDir = path.join(__dirname, 'api');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`Created directory: ${outDir}`);
  }

  const slugs = Object.keys(ALL_APIS);
  console.log(`Generating pages for ${slugs.length} APIs...`);

  let generated = 0;
  let skipped = 0;

  for (const slug of slugs) {
    const def = ALL_APIS[slug];
    if (!def) { skipped++; continue; }

    // Use override if available, otherwise generate defaults
    const override = SEO_OVERRIDES[slug] || {};
    const defaults = generateDefaultSEO(slug, def);
    const seo = {
      seoTitle: override.seoTitle || defaults.seoTitle,
      metaDesc: override.metaDesc || defaults.metaDesc,
      keywords: override.keywords || defaults.keywords,
      lead: override.lead || defaults.lead,
      howItWorks: override.howItWorks || defaults.howItWorks,
      useCases: override.useCases || defaults.useCases,
    };

    const html = buildPage(slug, def, seo);
    const outPath = path.join(outDir, `${slug}.html`);
    fs.writeFileSync(outPath, html, 'utf8');
    generated++;

    if (generated % 50 === 0) {
      console.log(`  ${generated}/${slugs.length} done...`);
    }
  }

  // Generate index page
  const indexHtml = buildIndexPage(ALL_APIS);
  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml, 'utf8');
  console.log(`Generated api/index.html`);

  // Update sitemap
  const sitemapPath = path.join(__dirname, 'sitemap.xml');
  const sitemap = buildSitemap(slugs);
  fs.writeFileSync(sitemapPath, sitemap, 'utf8');
  console.log(`Updated sitemap.xml with ${slugs.length} API URLs`);

  console.log(`\nDone! Generated ${generated} API pages + index. ${skipped > 0 ? `(${skipped} skipped)` : ''}`);
  console.log(`Output: ${outDir}/`);
  console.log(`\nFiles are served at:`);
  console.log(`  /api/index.html       → https://slopshop.gg/api/`);
  console.log(`  /api/{slug}.html      → https://slopshop.gg/api/{slug}`);
  console.log(`  (Vercel cleanUrls removes .html extension automatically)`);
}

main();
