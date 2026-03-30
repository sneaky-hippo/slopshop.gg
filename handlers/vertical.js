'use strict';

const handlers = {};

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE
// ═══════════════════════════════════════════════════════════════════════════════

handlers['finance-compound-interest'] = async (input) => {
  const P = parseFloat(input.principal) || 0;
  const r = parseFloat(input.rate_percent) / 100;
  const t = parseFloat(input.years) || 0;
  const n = parseFloat(input.compounds_per_year) || 12;

  const final_amount = P * Math.pow(1 + r / n, n * t);
  const total_interest = final_amount - P;

  // Effective annual rate
  const effective_rate = (Math.pow(1 + r / n, n) - 1) * 100;

  // Monthly breakdown — show balance at each of the first 12 months (or up to t*12 months)
  const months = Math.min(12, Math.round(t * 12));
  const monthly_breakdown = [];
  for (let m = 1; m <= months; m++) {
    const year_frac = m / 12;
    const bal = P * Math.pow(1 + r / n, n * year_frac);
    monthly_breakdown.push({
      month: m,
      balance: Math.round(bal * 100) / 100,
      interest_earned: Math.round((bal - P) * 100) / 100,
    });
  }

  return {
    final_amount: Math.round(final_amount * 100) / 100,
    total_interest: Math.round(total_interest * 100) / 100,
    effective_rate: Math.round(effective_rate * 10000) / 10000,
    monthly_breakdown,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['finance-mortgage-calc'] = async (input) => {
  const principal_raw = parseFloat(input.principal) || 0;
  const down = parseFloat(input.down_payment) || 0;
  const P = principal_raw - down;
  const annual_rate = parseFloat(input.annual_rate_percent) / 100;
  const years = parseFloat(input.years) || 30;
  const r = annual_rate / 12;
  const n = years * 12;

  let monthly_payment;
  if (r === 0) {
    monthly_payment = P / n;
  } else {
    monthly_payment = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  const total_paid = monthly_payment * n + down;
  const total_interest = total_paid - principal_raw;

  // First 12 months amortization
  const amortization_schedule = [];
  let balance = P;
  for (let m = 1; m <= 12 && m <= n; m++) {
    const interest_portion = balance * r;
    const principal_portion = monthly_payment - interest_portion;
    balance -= principal_portion;
    amortization_schedule.push({
      month: m,
      payment: Math.round(monthly_payment * 100) / 100,
      principal: Math.round(principal_portion * 100) / 100,
      interest: Math.round(interest_portion * 100) / 100,
      balance: Math.round(Math.max(0, balance) * 100) / 100,
    });
  }

  return {
    monthly_payment: Math.round(monthly_payment * 100) / 100,
    total_paid: Math.round(total_paid * 100) / 100,
    total_interest: Math.round(total_interest * 100) / 100,
    loan_amount: Math.round(P * 100) / 100,
    amortization_schedule,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['finance-dcf-simple'] = async (input) => {
  const cash_flows = Array.isArray(input.cash_flows) ? input.cash_flows.map(Number) : [];
  const r = parseFloat(input.discount_rate_percent) / 100;
  const g = parseFloat(input.terminal_growth_rate_percent != null ? input.terminal_growth_rate_percent : 2) / 100;

  // NPV of explicit cash flows
  let npv = 0;
  for (let t = 0; t < cash_flows.length; t++) {
    npv += cash_flows[t] / Math.pow(1 + r, t + 1);
  }

  // Terminal value (Gordon Growth): TV = CF_last * (1+g) / (r - g), discounted to PV
  let terminal_value = 0;
  if (cash_flows.length > 0 && r > g) {
    const tv = cash_flows[cash_flows.length - 1] * (1 + g) / (r - g);
    terminal_value = tv / Math.pow(1 + r, cash_flows.length);
    npv += terminal_value;
  }

  // IRR estimate via bisection
  let irr_estimate = null;
  if (cash_flows.length > 0) {
    const npvAt = (rate) => {
      let v = 0;
      for (let t = 0; t < cash_flows.length; t++) {
        v += cash_flows[t] / Math.pow(1 + rate, t + 1);
      }
      return v;
    };
    let lo = -0.999, hi = 10;
    if (npvAt(lo) * npvAt(hi) < 0) {
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        if (npvAt(mid) > 0) lo = mid; else hi = mid;
      }
      irr_estimate = Math.round(((lo + hi) / 2) * 10000) / 100; // as percent
    }
  }

  // Payback period (cumulative sum of undiscounted cash flows)
  let payback_period_years = null;
  let cumulative = 0;
  for (let t = 0; t < cash_flows.length; t++) {
    cumulative += cash_flows[t];
    if (cumulative >= 0) { payback_period_years = t + 1; break; }
  }

  return {
    npv: Math.round(npv * 100) / 100,
    terminal_value_pv: Math.round(terminal_value * 100) / 100,
    irr_estimate_percent: irr_estimate,
    payback_period_years,
    cash_flows_count: cash_flows.length,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['finance-portfolio-return'] = async (input) => {
  const holdings = Array.isArray(input.holdings) ? input.holdings : [];

  let total_invested = 0;
  let current_value = 0;
  const holdings_summary = holdings.map(h => {
    const cost = (parseFloat(h.purchase_price) || 0) * (parseFloat(h.shares) || 0);
    const value = (parseFloat(h.current_price) || 0) * (parseFloat(h.shares) || 0);
    const ret_usd = value - cost;
    const ret_pct = cost > 0 ? (ret_usd / cost) * 100 : 0;
    total_invested += cost;
    current_value += value;
    return {
      symbol: h.symbol || 'UNKNOWN',
      shares: parseFloat(h.shares) || 0,
      purchase_price: parseFloat(h.purchase_price) || 0,
      current_price: parseFloat(h.current_price) || 0,
      cost_basis: Math.round(cost * 100) / 100,
      current_value: Math.round(value * 100) / 100,
      return_usd: Math.round(ret_usd * 100) / 100,
      return_percent: Math.round(ret_pct * 100) / 100,
    };
  });

  const total_return_usd = current_value - total_invested;
  const total_return_percent = total_invested > 0 ? (total_return_usd / total_invested) * 100 : 0;

  const sorted_by_ret = [...holdings_summary].sort((a, b) => b.return_percent - a.return_percent);

  return {
    total_invested: Math.round(total_invested * 100) / 100,
    current_value: Math.round(current_value * 100) / 100,
    total_return_usd: Math.round(total_return_usd * 100) / 100,
    total_return_percent: Math.round(total_return_percent * 100) / 100,
    best_performer: sorted_by_ret[0] || null,
    worst_performer: sorted_by_ret[sorted_by_ret.length - 1] || null,
    holdings_summary,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['finance-risk-score'] = async (input) => {
  const returns = Array.isArray(input.returns) ? input.returns.map(Number) : [];
  if (returns.length === 0) return { error: 'No returns provided' };

  const n = returns.length;
  const mean_return = returns.reduce((a, b) => a + b, 0) / n;

  const variance = returns.reduce((a, r) => a + Math.pow(r - mean_return, 2), 0) / (n > 1 ? n - 1 : 1);
  const std_deviation = Math.sqrt(variance);

  // Sharpe ratio (monthly risk-free = 0.05/12)
  const risk_free_monthly = 0.05 / 12;
  const sharpe_ratio = std_deviation > 0 ? (mean_return - risk_free_monthly) / std_deviation : 0;

  // Max drawdown
  let peak = -Infinity;
  let max_drawdown = 0;
  let cumulative = 1;
  for (const r of returns) {
    cumulative *= (1 + r);
    if (cumulative > peak) peak = cumulative;
    const drawdown = (peak - cumulative) / peak;
    if (drawdown > max_drawdown) max_drawdown = drawdown;
  }

  // VaR 95% — 5th percentile of returns
  const sorted = [...returns].sort((a, b) => a - b);
  const var_idx = Math.floor(n * 0.05);
  const var_95_percent = sorted[var_idx] * 100;

  return {
    mean_return: Math.round(mean_return * 100000) / 100000,
    std_deviation: Math.round(std_deviation * 100000) / 100000,
    sharpe_ratio: Math.round(sharpe_ratio * 10000) / 10000,
    max_drawdown_percent: Math.round(max_drawdown * 10000) / 100,
    var_95_percent: Math.round(var_95_percent * 10000) / 10000,
    sample_size: n,
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEVOPS
// ═══════════════════════════════════════════════════════════════════════════════

handlers['devops-docker-analyze'] = async (input) => {
  const dockerfile = String(input.dockerfile || '');
  const lines = dockerfile.split('\n');

  let base_image = null;
  const exposed_ports = [];
  const bad_practices = [];
  let layer_count = 0;
  let has_user = false;
  let run_count = 0;
  const run_line_nums = [];

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    const lineno = idx + 1;
    if (!line || line.startsWith('#')) return;

    const upper = line.toUpperCase();

    // Count image layers (instructions that produce layers)
    if (/^(RUN|COPY|ADD)\s/i.test(line)) layer_count++;

    if (/^FROM\s/i.test(line)) {
      base_image = line.replace(/^FROM\s+/i, '').split(/\s/)[0];
    }

    if (/^EXPOSE\s/i.test(line)) {
      const ports = line.replace(/^EXPOSE\s+/i, '').split(/\s+/);
      exposed_ports.push(...ports);
    }

    if (/^USER\s/i.test(line)) {
      has_user = true;
      const user = line.replace(/^USER\s+/i, '').trim();
      if (/^root$/i.test(user) || user === '0') {
        bad_practices.push({ line: lineno, issue: 'Running as root user', suggestion: 'Use a non-root USER instruction' });
      }
    }

    if (/^ADD\s/i.test(line)) {
      bad_practices.push({ line: lineno, issue: 'ADD used instead of COPY', suggestion: 'Prefer COPY over ADD unless you need tar extraction or URL support' });
    }

    if (/^RUN\s/i.test(line)) {
      run_count++;
      run_line_nums.push(lineno);
      if (/apt-get install/i.test(line) && !/apt-get install.*-y/i.test(line)) {
        bad_practices.push({ line: lineno, issue: 'apt-get install without -y flag', suggestion: 'Add -y to avoid interactive prompt: apt-get install -y ...' });
      }
    }
  });

  if (!has_user) {
    bad_practices.push({ line: null, issue: 'No USER instruction — container runs as root by default', suggestion: 'Add USER nonroot before CMD/ENTRYPOINT' });
  }

  if (run_count > 3) {
    bad_practices.push({
      line: run_line_nums[0],
      issue: `${run_count} separate RUN instructions increase image layers`,
      suggestion: 'Combine RUN commands with && to reduce layers',
    });
  }

  // Score: start 100, deduct per issue
  const score = Math.max(0, 100 - bad_practices.length * 12);

  return { layer_count, base_image, exposed_ports, bad_practices, score };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['devops-k8s-validate'] = async (input) => {
  const manifest = String(input.manifest || '');
  const issues = [];

  // Very minimal YAML key extraction (no external dep)
  const get = (key) => {
    const re = new RegExp(`^\\s*${key}:\\s*(.+)`, 'm');
    const m = manifest.match(re);
    return m ? m[1].trim() : null;
  };

  const apiVersion = get('apiVersion');
  const kind = get('kind');
  const name = get('metadata.name') || (() => {
    // Try to get name under metadata block
    const metaIdx = manifest.indexOf('metadata:');
    if (metaIdx === -1) return null;
    const sub = manifest.slice(metaIdx, metaIdx + 200);
    const nm = sub.match(/^\s{2}name:\s*(.+)/m);
    return nm ? nm[1].trim() : null;
  })();

  if (!apiVersion) issues.push({ field: 'apiVersion', severity: 'error', message: 'apiVersion is required' });
  if (!kind) issues.push({ field: 'kind', severity: 'error', message: 'kind is required' });
  if (!name) issues.push({ field: 'metadata.name', severity: 'error', message: 'metadata.name is required' });

  // Resource limits check
  if (!/resources:/i.test(manifest) || !/limits:/i.test(manifest)) {
    issues.push({ field: 'spec.containers[].resources.limits', severity: 'warning', message: 'No resource limits defined — may cause noisy neighbour issues' });
  }

  // Liveness probe check
  if (!/livenessProbe:/i.test(manifest)) {
    issues.push({ field: 'spec.containers[].livenessProbe', severity: 'warning', message: 'No liveness probe defined — Kubernetes cannot detect application hangs' });
  }

  // Readiness probe check
  if (!/readinessProbe:/i.test(manifest)) {
    issues.push({ field: 'spec.containers[].readinessProbe', severity: 'warning', message: 'No readiness probe defined — service may receive traffic before ready' });
  }

  const errors = issues.filter(i => i.severity === 'error').length;
  const valid = errors === 0;
  const score = Math.max(0, 100 - errors * 25 - issues.filter(i => i.severity === 'warning').length * 10);

  return { valid, issues, resource_type: kind || 'unknown', score };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['devops-semver-bump'] = async (input) => {
  const version = String(input.version || '0.0.0');
  const bump = String(input.bump || 'patch');
  const prerelease_tag = String(input.prerelease_tag || 'alpha');

  const semverRe = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?(?:\+([\w.]+))?$/;
  const match = version.match(semverRe);
  if (!match) return { error: `Invalid semver version: ${version}` };

  let [, major, minor, patch, pre] = match;
  major = parseInt(major); minor = parseInt(minor); patch = parseInt(patch);

  let new_version;
  if (bump === 'major') {
    new_version = `${major + 1}.0.0`;
  } else if (bump === 'minor') {
    new_version = `${major}.${minor + 1}.0`;
  } else if (bump === 'patch') {
    new_version = `${major}.${minor}.${patch + 1}`;
  } else if (bump === 'prerelease') {
    if (pre && pre.startsWith(prerelease_tag + '.')) {
      const num = parseInt(pre.split('.').pop()) || 0;
      new_version = `${major}.${minor}.${patch}-${prerelease_tag}.${num + 1}`;
    } else {
      new_version = `${major}.${minor}.${patch}-${prerelease_tag}.0`;
    }
  } else {
    return { error: `Unknown bump type: ${bump}. Use major, minor, patch, or prerelease` };
  }

  const today = new Date().toISOString().slice(0, 10);
  const changelog_header = `## [${new_version}] - ${today}\n\n### ${bump.charAt(0).toUpperCase() + bump.slice(1)}\n- Bumped from ${version} to ${new_version}`;

  return { old_version: version, new_version, bump, changelog_header };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['devops-log-parse'] = async (input) => {
  const log = String(input.log || '');
  const format_hint = String(input.format || 'auto');
  const lines = log.split('\n').filter(l => l.trim().length > 0);

  const entries = [];
  let errors = 0, warnings = 0, info = 0;

  // Regex patterns
  const PATTERNS = {
    json: /^\s*\{/,
    nginx: /^(\S+) - (\S+) \[([^\]]+)\] "([^"]*)" (\d+)/,
    apache: /^(\S+) (\S+) (\S+) \[([^\]]+)\] "([^"]+)" (\d+)/,
    syslog: /^(\w{3}\s+\d+\s+[\d:]+)\s+(\S+)\s+(.+)/,
    generic: /(ERRO?R?|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL|CRITI?C?A?L?)/i,
  };

  for (const rawLine of lines) {
    let entry = { ts: null, level: 'info', message: rawLine, source: null };

    if ((format_hint === 'auto' || format_hint === 'json') && PATTERNS.json.test(rawLine)) {
      try {
        const obj = JSON.parse(rawLine);
        entry.ts = obj.time || obj.timestamp || obj.ts || obj['@timestamp'] || null;
        entry.level = (obj.level || obj.severity || obj.lvl || 'info').toLowerCase();
        entry.message = obj.message || obj.msg || obj.text || rawLine;
        entry.source = obj.service || obj.source || obj.logger || null;
      } catch (_) { /* fall through */ }
    } else if ((format_hint === 'auto' || format_hint === 'nginx') && PATTERNS.nginx.test(rawLine)) {
      const m = rawLine.match(PATTERNS.nginx);
      entry = { ts: m[3], level: parseInt(m[5]) >= 500 ? 'error' : parseInt(m[5]) >= 400 ? 'warning' : 'info', message: `${m[4]} -> ${m[5]}`, source: m[1] };
    } else if ((format_hint === 'auto' || format_hint === 'apache') && PATTERNS.apache.test(rawLine)) {
      const m = rawLine.match(PATTERNS.apache);
      entry = { ts: m[4], level: parseInt(m[6]) >= 500 ? 'error' : parseInt(m[6]) >= 400 ? 'warning' : 'info', message: `${m[5]} -> ${m[6]}`, source: m[1] };
    } else if ((format_hint === 'auto' || format_hint === 'syslog') && PATTERNS.syslog.test(rawLine)) {
      const m = rawLine.match(PATTERNS.syslog);
      entry.ts = m[1]; entry.source = m[2]; entry.message = m[3];
      if (/error|crit|alert|emerg/i.test(m[3])) entry.level = 'error';
      else if (/warn/i.test(m[3])) entry.level = 'warning';
    } else {
      const lm = rawLine.match(PATTERNS.generic);
      if (lm) {
        const lv = lm[1].toLowerCase();
        if (/err|fatal|crit/.test(lv)) entry.level = 'error';
        else if (/warn/.test(lv)) entry.level = 'warning';
        else entry.level = 'info';
      }
      // Try to extract timestamp from front of line
      const tsMatch = rawLine.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
      if (tsMatch) entry.ts = tsMatch[1];
    }

    if (entry.level === 'error') errors++;
    else if (entry.level === 'warning') warnings++;
    else info++;

    entries.push(entry);
  }

  return {
    entries,
    summary: { errors, warnings, info, lines_total: lines.length },
    format_detected: format_hint === 'auto' ? 'generic' : format_hint,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['devops-env-validate'] = async (input) => {
  const env_content = String(input.env_content || '');
  const lines = env_content.split('\n');
  const issues = [];
  const seen = new Map();
  let variables_count = 0;
  let empty_count = 0;
  let has_secrets_pattern = false;

  const SECRET_RE = /API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|AUTH/i;

  lines.forEach((raw, idx) => {
    const lineno = idx + 1;
    const line = raw.trimEnd();

    if (!line || line.startsWith('#')) return;

    // Check for = sign
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      issues.push({ line: lineno, variable: line, issue: 'Line has no = sign — not a valid key=value pair' });
      return;
    }

    const key = line.slice(0, eqIdx);
    const value = line.slice(eqIdx + 1);

    variables_count++;

    // Spaces around =
    if (key.endsWith(' ') || value.startsWith(' ')) {
      issues.push({ line: lineno, variable: key.trim(), issue: 'Space around = sign — may cause parsing issues in some shells' });
    }

    // Empty value
    const trimVal = value.trim();
    if (trimVal === '' || trimVal === '""' || trimVal === "''") {
      empty_count++;
      issues.push({ line: lineno, variable: key.trim(), issue: 'Empty value — consider providing a default or documenting why it is empty' });
    }

    // Duplicate key
    const keyTrimmed = key.trim();
    if (seen.has(keyTrimmed)) {
      issues.push({ line: lineno, variable: keyTrimmed, issue: `Duplicate key (first defined on line ${seen.get(keyTrimmed)})` });
    } else {
      seen.set(keyTrimmed, lineno);
    }

    // Unquoted special chars in value (if not already quoted)
    if (!trimVal.startsWith('"') && !trimVal.startsWith("'") && /[$!&|;<>]/.test(trimVal)) {
      issues.push({ line: lineno, variable: keyTrimmed, issue: 'Value contains special characters that should be quoted' });
    }

    if (SECRET_RE.test(keyTrimmed)) has_secrets_pattern = true;
  });

  const valid = issues.filter(i => i.issue.includes('no =') || i.issue.includes('Duplicate')).length === 0;

  return {
    valid,
    issues,
    variables_count,
    empty_count,
    has_secrets_pattern,
    suggestion: 'Generate a .env.example with keys but empty values for documentation',
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// LEGAL (analysis only — NOT legal advice)
// ═══════════════════════════════════════════════════════════════════════════════

handlers['legal-contract-scan'] = async (input) => {
  const text = String(input.text || '');
  const lower = text.toLowerCase();
  const lines = text.split('\n');
  const DISCLAIMER = 'This is automated text analysis only, not legal advice. Consult a qualified attorney.';

  const CLAUSE_PATTERNS = [
    { type: 'termination', keywords: ['terminat'] },
    { type: 'arbitration', keywords: ['arbitrat'] },
    { type: 'limitation_of_liability', keywords: ['limitation of liability', 'limit.*liabilit'] },
    { type: 'indemnification', keywords: ['indemnif'] },
    { type: 'ip_assignment', keywords: ['intellectual property', 'ip assignment', 'assigns.*right', 'work for hire'] },
    { type: 'non_compete', keywords: ['non-compete', 'noncompete', 'non compete', 'covenant not to compete'] },
    { type: 'auto_renewal', keywords: ['auto.*renew', 'automatic.*renew', 'renew.*automatically', 'evergreen'] },
    { type: 'governing_law', keywords: ['governing law', 'choice of law', 'jurisdiction'] },
    { type: 'force_majeure', keywords: ['force majeure', 'act of god'] },
    { type: 'confidentiality', keywords: ['confidential', 'nda', 'non-disclosure'] },
  ];

  const found_clauses = [];
  for (const cp of CLAUSE_PATTERNS) {
    for (const kw of cp.keywords) {
      const re = new RegExp(kw, 'i');
      const idx = lower.search(re);
      if (idx !== -1) {
        // Find approx line number
        const before = text.slice(0, idx);
        const line_number_approx = before.split('\n').length;
        const excerpt = text.slice(Math.max(0, idx - 20), idx + 100).replace(/\n/g, ' ').trim();
        found_clauses.push({ clause_type: cp.type, excerpt, line_number_approx });
        break;
      }
    }
  }

  // Risk flags
  const risk_flags = [];
  if (!found_clauses.find(c => c.clause_type === 'limitation_of_liability')) {
    risk_flags.push({ flag: 'missing_liability_cap', description: 'No limitation of liability clause detected — unlimited exposure possible' });
  }
  if (found_clauses.find(c => c.clause_type === 'ip_assignment')) {
    risk_flags.push({ flag: 'ip_assignment_present', description: 'IP assignment clause found — review what IP is being transferred' });
  }
  if (found_clauses.find(c => c.clause_type === 'auto_renewal')) {
    risk_flags.push({ flag: 'auto_renewal', description: 'Auto-renewal clause detected — note cancellation deadline' });
  }
  if (found_clauses.find(c => c.clause_type === 'non_compete')) {
    risk_flags.push({ flag: 'non_compete', description: 'Non-compete clause present — check scope, duration, and geography' });
  }
  if (found_clauses.find(c => c.clause_type === 'arbitration')) {
    risk_flags.push({ flag: 'arbitration_required', description: 'Arbitration clause — may waive right to jury trial' });
  }

  const words = text.split(/\s+/).filter(w => w.length > 0);
  const word_count = words.length;
  const reading_time_minutes = Math.ceil(word_count / 238);

  return { found_clauses, risk_flags, word_count, reading_time_minutes, disclaimer: DISCLAIMER };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['legal-gdpr-scan'] = async (input) => {
  const text = String(input.text || '');
  const DISCLAIMER = 'Not legal advice. Consult a qualified data protection attorney.';

  const GDPR_ELEMENTS = [
    { element: 'data_subject_rights', keywords: ['right to access', 'right to erasure', 'right to rectification', 'right to portability', 'data subject right'] },
    { element: 'lawful_basis', keywords: ['lawful basis', 'legal basis', 'legitimate interest', 'consent', 'contractual necessity'] },
    { element: 'data_retention', keywords: ['data retention', 'retention period', 'retain.*data', 'stored.*period'] },
    { element: 'third_party_sharing', keywords: ['third party', 'data sharing', 'share.*personal', 'transfer.*data', 'processor'] },
    { element: 'dpo', keywords: ['data protection officer', 'dpo'] },
    { element: 'consent_language', keywords: ['by clicking', 'you consent', 'i agree', 'opt in', 'opt-in', 'withdraw consent'] },
    { element: 'privacy_policy_link', keywords: ['privacy policy', 'privacy notice'] },
    { element: 'data_breach', keywords: ['data breach', 'security incident', 'breach notification'] },
  ];

  const lower = text.toLowerCase();
  const gdpr_elements = [];
  for (const el of GDPR_ELEMENTS) {
    let found = false;
    let excerpt = null;
    for (const kw of el.keywords) {
      const idx = lower.indexOf(kw);
      if (idx !== -1) {
        found = true;
        excerpt = text.slice(Math.max(0, idx - 10), idx + 80).replace(/\n/g, ' ').trim();
        break;
      }
    }
    gdpr_elements.push({ element: el.element, found, excerpt: found ? excerpt : null });
  }

  const compliance_gaps = gdpr_elements
    .filter(e => !e.found)
    .map(e => `Missing: ${e.element.replace(/_/g, ' ')}`);

  const found_count = gdpr_elements.filter(e => e.found).length;
  const score = Math.round((found_count / GDPR_ELEMENTS.length) * 100);

  return { gdpr_elements, compliance_gaps, score, disclaimer: DISCLAIMER };
};

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTHCARE (PII-safe analysis)
// ═══════════════════════════════════════════════════════════════════════════════

handlers['health-bmi-calc'] = async (input) => {
  const DISCLAIMER = 'BMI is a general screening tool. Consult a healthcare provider for medical advice.';

  let weight_kg, height_m;

  if (input.weight_kg != null && input.height_cm != null) {
    weight_kg = parseFloat(input.weight_kg);
    height_m = parseFloat(input.height_cm) / 100;
  } else if (input.weight_lbs != null && input.height_inches != null) {
    weight_kg = parseFloat(input.weight_lbs) * 0.453592;
    height_m = parseFloat(input.height_inches) * 0.0254;
  } else {
    return { error: 'Provide weight_kg + height_cm OR weight_lbs + height_inches', disclaimer: DISCLAIMER };
  }

  if (height_m <= 0) return { error: 'Height must be greater than 0', disclaimer: DISCLAIMER };

  const bmi = weight_kg / (height_m * height_m);
  let category;
  if (bmi < 18.5) category = 'underweight';
  else if (bmi < 25) category = 'normal';
  else if (bmi < 30) category = 'overweight';
  else category = 'obese';

  // Healthy weight range for this height (BMI 18.5 - 24.9)
  const min_kg = Math.round(18.5 * height_m * height_m * 10) / 10;
  const max_kg = Math.round(24.9 * height_m * height_m * 10) / 10;

  return {
    bmi: Math.round(bmi * 10) / 10,
    category,
    healthy_weight_range_kg: { min: min_kg, max: max_kg },
    disclaimer: DISCLAIMER,
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['health-medication-schedule'] = async (input) => {
  const DISCLAIMER = 'Consult your healthcare provider before following any medication schedule.';
  const medications = Array.isArray(input.medications) ? input.medications : [];
  const wake_str = String(input.wake_time || '07:00');

  const [wakeH, wakeM] = wake_str.split(':').map(Number);
  const wakeMinutes = (wakeH || 7) * 60 + (wakeM || 0);

  // Frequency to time offsets from wake (in minutes)
  const FREQ_OFFSETS = {
    daily: [0],
    twice_daily: [0, 720],           // wake + 12h
    weekly: [0],                     // same time each week (simplified to daily slot)
    monthly: [0],                    // same time each month (simplified)
  };

  const timeSlots = new Map();

  for (const med of medications) {
    const freq = med.frequency || 'daily';
    const offsets = FREQ_OFFSETS[freq] || [0];
    for (const offset of offsets) {
      const totalMin = wakeMinutes + offset;
      const h = Math.floor(totalMin / 60) % 24;
      const m = totalMin % 60;
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (!timeSlots.has(timeStr)) timeSlots.set(timeStr, []);
      timeSlots.get(timeStr).push({
        name: med.name,
        with_food: med.with_food || false,
        frequency: freq,
      });
    }
  }

  const schedule = Array.from(timeSlots.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, meds]) => ({
      time,
      medications: meds.map(m => m.name),
      notes: meds.filter(m => m.with_food).length > 0 ? 'Take with food' : null,
    }));

  const reminders = schedule.map(s => `${s.time}: ${s.medications.join(', ')}${s.notes ? ' (' + s.notes + ')' : ''}`);

  return { schedule, reminders, disclaimer: DISCLAIMER };
};

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETING
// ═══════════════════════════════════════════════════════════════════════════════

handlers['marketing-headline-score'] = async (input) => {
  const headline = String(input.headline || '');
  const words = headline.split(/\s+/).filter(w => w.length > 0);
  const word_count = words.length;
  const char_count = headline.length;
  const has_number = /\d/.test(headline);

  const POWER_WORDS = [
    'free', 'new', 'proven', 'guaranteed', 'instant', 'exclusive', 'secret',
    'ultimate', 'powerful', 'amazing', 'incredible', 'limited', 'urgent',
    'now', 'today', 'discover', 'boost', 'save', 'earn', 'win', 'easy',
    'simple', 'fast', 'quick', 'best', 'top', 'essential', 'critical',
    'breakthrough', 'revolutionary', 'shocking', 'surprising',
  ];

  const EMOTIONAL_WORDS = [
    'love', 'hate', 'fear', 'joy', 'angry', 'happy', 'sad', 'excited',
    'worried', 'thrilled', 'devastated', 'inspired', 'motivated',
  ];

  const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z]/g, ''));
  const power_words_found = POWER_WORDS.filter(pw => lowerWords.includes(pw));
  const emotional_words_found = EMOTIONAL_WORDS.filter(ew => lowerWords.includes(ew));
  const is_question = headline.trim().endsWith('?');

  let score = 0;

  // Length score (max 25 pts)
  if (char_count >= 40 && char_count <= 70) score += 25;
  else if (char_count >= 30 && char_count <= 80) score += 15;
  else if (char_count >= 20) score += 5;

  // Power words (max 25 pts)
  score += Math.min(25, power_words_found.length * 8);

  // Number (10 pts)
  if (has_number) score += 10;

  // Question format (10 pts)
  if (is_question) score += 10;

  // Emotional words (15 pts)
  score += Math.min(15, emotional_words_found.length * 8);

  // Word count in ideal range (15 pts)
  if (word_count >= 6 && word_count <= 12) score += 15;
  else if (word_count >= 4 && word_count <= 15) score += 8;

  score = Math.min(100, score);

  const suggestions = [];
  if (char_count < 40) suggestions.push('Headline is short — aim for 40-70 characters');
  if (char_count > 80) suggestions.push('Headline is too long — trim to under 80 characters');
  if (power_words_found.length === 0) suggestions.push('Add a power word (free, proven, instant, etc.)');
  if (!has_number) suggestions.push('Add a specific number to increase credibility');
  if (word_count < 5) suggestions.push('Expand the headline — aim for 6-12 words');

  let grade;
  if (score >= 80) grade = 'A';
  else if (score >= 65) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 35) grade = 'D';
  else grade = 'F';

  return { score, word_count, char_count, has_number, power_words_found, emotional_words_found, is_question, suggestions, grade };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['marketing-ab-test-calc'] = async (input) => {
  const cv = parseInt(input.control_visitors) || 0;
  const cc = parseInt(input.control_conversions) || 0;
  const vv = parseInt(input.variant_visitors) || 0;
  const vc = parseInt(input.variant_conversions) || 0;

  const control_rate = cv > 0 ? cc / cv : 0;
  const variant_rate = vv > 0 ? vc / vv : 0;
  const relative_uplift = control_rate > 0 ? ((variant_rate - control_rate) / control_rate) * 100 : 0;

  // Two-proportion z-test (pooled)
  const p_pool = (cc + vc) / (cv + vv || 1);
  const se = Math.sqrt(p_pool * (1 - p_pool) * (1 / (cv || 1) + 1 / (vv || 1)));
  const z_score = se > 0 ? (variant_rate - control_rate) / se : 0;

  // 95% confidence => |z| >= 1.96
  const significance_95 = Math.abs(z_score) >= 1.96;

  let winner = 'inconclusive';
  if (significance_95) {
    winner = variant_rate > control_rate ? 'variant' : 'control';
  }

  const recommendation = significance_95
    ? `The ${winner} is statistically better at 95% confidence. Relative uplift: ${relative_uplift.toFixed(2)}%.`
    : `Results are not statistically significant (z=${z_score.toFixed(2)}). Need more data.`;

  return {
    control_rate: Math.round(control_rate * 10000) / 100,
    variant_rate: Math.round(variant_rate * 10000) / 100,
    relative_uplift_percent: Math.round(relative_uplift * 100) / 100,
    z_score: Math.round(z_score * 10000) / 10000,
    significance_95,
    winner,
    recommendation,
    control: { visitors: cv, conversions: cc },
    variant: { visitors: vv, conversions: vc },
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['seo-keyword-density'] = async (input) => {
  const text = String(input.text || '');
  const keywords = Array.isArray(input.keywords) ? input.keywords : [];

  const words_raw = text.split(/\s+/).filter(w => w.length > 0);
  const total_words = words_raw.length;
  const lower_text = text.toLowerCase();

  const keyword_analysis = keywords.map(kw => {
    const kw_lower = kw.toLowerCase();
    // Count non-overlapping occurrences
    let count = 0;
    let start = 0;
    while (true) {
      const idx = lower_text.indexOf(kw_lower, start);
      if (idx === -1) break;
      count++;
      start = idx + kw_lower.length;
    }
    const density_percent = total_words > 0 ? Math.round((count / total_words) * 10000) / 100 : 0;
    return {
      keyword: kw,
      count,
      density_percent,
      ideal_range: '1-3%',
      status: density_percent < 0.5 ? 'too_low' : density_percent > 4 ? 'too_high' : 'optimal',
    };
  });

  const optimal = keyword_analysis.filter(k => k.status === 'optimal').length;
  const overall_score = keywords.length > 0 ? Math.round((optimal / keywords.length) * 100) : 0;

  return { total_words, keyword_analysis, overall_score };
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = handlers;
