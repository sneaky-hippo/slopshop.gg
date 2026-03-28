'use strict';
const fs = require('fs');
const {API_DEFS, CATEGORIES} = require('./registry');
try { const {EXPANSION_DEFS} = require('./registry-expansion'); Object.assign(API_DEFS, EXPANSION_DEFS); } catch(e) {}
const {HACKATHON_DEFS} = require('./registry-hackathon');
Object.assign(API_DEFS, HACKATHON_DEFS);
const {SCHEMAS} = require('./schemas');

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Slopshop API',
    description: 'The infrastructure layer for AI agents. ' + Object.keys(API_DEFS).length + ' real compute APIs.',
    version: require('./package.json').version,
    contact: { email: 'dev@slopshop.gg', url: 'https://slopshop.gg' },
    license: { name: 'MIT' }
  },
  servers: [{ url: 'https://slopshop.gg', description: 'Production' }, { url: 'http://localhost:3000', description: 'Local' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }
  },
  security: [{ bearerAuth: [] }],
  tags: [...new Set(Object.values(API_DEFS).map(d => d.cat))].sort().map(c => ({ name: c })),
  paths: {}
};

// Generate paths for every API
Object.entries(API_DEFS).forEach(([slug, def]) => {
  const schema = SCHEMAS?.[slug];
  const path = '/v1/' + slug;
  spec.paths[path] = {
    post: {
      summary: def.name,
      description: def.desc,
      tags: [def.cat],
      operationId: slug,
      requestBody: schema?.input ? {
        content: { 'application/json': { schema: schema.input } }
      } : { content: { 'application/json': { schema: { type: 'object' } } } },
      responses: {
        '200': {
          description: 'Success',
          content: { 'application/json': { schema: schema?.output || { type: 'object', properties: { _engine: { type: 'string', example: 'real' } } } } }
        },
        '402': { description: 'Insufficient credits' },
        '404': { description: 'API not found' },
        '500': { description: 'Handler error (credits refunded)' }
      }
    }
  };
});

// Add key platform endpoints
const platformPaths = {
  '/v1/auth/signup': { post: { summary: 'Create account', tags: ['Auth'], security: [], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } }, responses: { '200': { description: 'Account created with API key and 500 free credits' } } } },
  '/v1/auth/login': { post: { summary: 'Log in', tags: ['Auth'], security: [], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } }, responses: { '200': { description: 'API key returned' } } } },
  '/v1/auth/me': { get: { summary: 'Get account info', tags: ['Auth'], responses: { '200': { description: 'Email, balance, tier' } } } },
  '/v1/agent/run': { post: { summary: 'Run agent task', tags: ['Agent'], description: 'Describe a task in natural language. Auto-discovers and chains relevant tools.', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['task'], properties: { task: { type: 'string' }, tools: { type: 'array', items: { type: 'string' } }, max_steps: { type: 'integer', default: 5 } } } } } }, responses: { '200': { description: 'Chain of tool executions with final result' } } } },
  '/v1/batch': { post: { summary: 'Batch execute', tags: ['Batch'], description: 'Execute up to 50 API calls in parallel.', responses: { '200': { description: 'Array of results' } } } },
  '/v1/tools/search': { post: { summary: 'Search tools', tags: ['Discovery'], security: [], description: 'Semantic search across all APIs.', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' }, category: { type: 'string' }, max_results: { type: 'integer' } } } } } }, responses: { '200': { description: 'Matching tools with relevance scores' } } } },
  '/v1/stats': { get: { summary: 'Platform statistics', tags: ['Discovery'], security: [], responses: { '200': { description: 'API count, categories, features' } } } },
  '/v1/health': { get: { summary: 'Health check', tags: ['System'], security: [], responses: { '200': { description: 'Server health and feature status' } } } },
};
Object.assign(spec.paths, platformPaths);

fs.writeFileSync('openapi.json', JSON.stringify(spec, null, 2));
console.log('Generated openapi.json with ' + Object.keys(spec.paths).length + ' paths');
