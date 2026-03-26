#!/usr/bin/env node
/**
 * SLOPSHOP MCP SETUP
 *
 * Adds Slopshop as an MCP server to Claude Code settings.
 * Run: node setup-mcp.js
 *
 * This makes every Slopshop API available as a native tool
 * in Claude Code. Zero friction. Automatic discovery.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const MCP_SERVER_PATH = path.resolve(__dirname, 'mcp-server.js');

console.log('🦞 Slopshop MCP Setup');
console.log('');

// Check if settings file exists
let settings = {};
if (fs.existsSync(SETTINGS_PATH)) {
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    console.log('Found existing Claude Code settings.');
  } catch (e) {
    console.log('Warning: Could not parse existing settings, creating fresh.');
  }
} else {
  // Create .claude directory if needed
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log('No existing settings found. Creating new.');
}

// Add or update MCP server config
if (!settings.mcpServers) settings.mcpServers = {};

const existing = settings.mcpServers.slopshop;
if (existing) {
  console.log('Slopshop MCP server already configured. Updating path.');
}

settings.mcpServers.slopshop = {
  command: 'node',
  args: [MCP_SERVER_PATH],
  env: {
    SLOPSHOP_KEY: process.env.SLOPSHOP_KEY || '',
    SLOPSHOP_BASE: process.env.SLOPSHOP_BASE || 'https://slopshop.gg',
  },
};

// Write settings
fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));

console.log('');
console.log('Done! Slopshop MCP server added to Claude Code.');
console.log(`Settings file: ${SETTINGS_PATH}`);
console.log(`MCP server: ${MCP_SERVER_PATH}`);
console.log('');
console.log('Next steps:');
console.log('  1. Start the Slopshop server: node server-v2.js');
console.log('  2. Open a new Claude Code session');
console.log('  3. Claude will automatically have access to all Slopshop tools');
console.log('');
console.log('Try asking Claude: "hash the string hello with SHA256"');
console.log('Claude will call slop-crypto-hash-sha256 automatically.');
