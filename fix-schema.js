// One-time migration: drop tables with stale schemas so route modules recreate them correctly
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH
  || (process.env.RAILWAY_ENVIRONMENT ? '/app/data/slopshop.db' : path.join(__dirname, '.data', 'slopshop.db'));
console.log('Opening DB at:', dbPath);
const db = new Database(dbPath);

const tables = [
  // identity route
  'agent_identities', 'ans_registry', 'a2a_messages', 'agent_orgs', 'org_members',
  // workflow-builder route
  'workflows', 'workflow_runs', 'workflow_run_steps', 'workflow_templates', 'workflow_approvals',
  // marketplace route
  'marketplace_listings', 'marketplace_installs', 'marketplace_ratings', 'marketplace_transactions',
];

for (const t of tables) {
  db.exec(`DROP TABLE IF EXISTS ${t}`);
  console.log('Dropped:', t);
}

db.close();
console.log('Done. Restart server to recreate tables with correct schema.');
