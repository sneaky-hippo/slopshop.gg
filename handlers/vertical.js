'use strict';

const handlers = {};

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE
// ═══════════════════════════════════════════════════════════════════════════════

handlers['finance-compound-interest'] = async (input) => {
  const P = parseFloat(input.principal) || 0;
  // BUG FIX: was parseFloat(input.rate_percent)/100 with no fallback — NaN when omitted
  const r = (parseFloat(input.rate_percent) || 0) / 100;
  const t = parseFloat(input.years) || 0;
  const n = parseFloat(input.compounds_per_year) || 12;

  if (P <= 0) return { error: 'principal must be greater than 0' };
  if (r < 0) return { error: 'rate_percent cannot be negative' };
  if (t <= 0) return { error: 'years must be greater than 0' };

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
  // BUG FIX: was parseFloat(input.annual_rate_percent)/100 with no fallback — NaN when omitted
  const annual_rate = (parseFloat(input.annual_rate_percent) || 0) / 100;
  const years = parseFloat(input.years) || 30;
  const r = annual_rate / 12;
  const n = years * 12;

  if (P <= 0) return { error: 'principal must be greater than down_payment and both must be positive' };

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
  // BUG FIX: was parseFloat(input.discount_rate_percent)/100 — NaN when omitted
  const r = (parseFloat(input.discount_rate_percent) || 10) / 100;
  const g = parseFloat(input.terminal_growth_rate_percent != null ? input.terminal_growth_rate_percent : 2) / 100;

  if (cash_flows.length === 0) return { error: 'cash_flows array is required and must not be empty' };
  if (r <= 0) return { error: 'discount_rate_percent must be greater than 0' };

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

  if (holdings.length === 0) return { error: 'holdings array is required and must not be empty' };

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
  // BUG FIX: was returning plain { error } object — now throws for consistent dispatcher error handling
  if (returns.length === 0) throw new Error('returns array is required and must not be empty');

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

// ─────────────────────────────────────────────────────────────────────────────
// NEW: finance-loan-calculator

handlers['finance-loan-calculator'] = async (input) => {
  const loan_amount = parseFloat(input.loan_amount || input.amount) || 0;
  const annual_rate = (parseFloat(input.annual_rate_percent || input.rate_percent) || 0) / 100;
  const years = parseFloat(input.years) || 5;
  const extra_monthly = parseFloat(input.extra_monthly_payment) || 0;

  if (loan_amount <= 0) return { error: 'loan_amount must be greater than 0' };

  const r = annual_rate / 12;
  const n = years * 12;

  let monthly_payment;
  if (r === 0) {
    monthly_payment = loan_amount / n;
  } else {
    monthly_payment = loan_amount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  const total_payment = monthly_payment + extra_monthly;
  const total_paid_standard = monthly_payment * n;
  const total_interest_standard = total_paid_standard - loan_amount;

  // With extra payment: recalculate payoff months
  let balance_extra = loan_amount;
  let months_extra = 0;
  let total_interest_extra = 0;
  while (balance_extra > 0 && months_extra < n * 2) {
    const interest_charge = balance_extra * r;
    total_interest_extra += interest_charge;
    const principal_paid = total_payment - interest_charge;
    if (principal_paid <= 0) break; // can't pay off
    balance_extra -= principal_paid;
    months_extra++;
    if (balance_extra < 0) balance_extra = 0;
  }

  const interest_saved = extra_monthly > 0
    ? Math.max(0, Math.round((total_interest_standard - total_interest_extra) * 100) / 100)
    : null;

  const months_saved = extra_monthly > 0 ? Math.max(0, n - months_extra) : null;

  // First 12 months amortization
  const amortization_schedule = [];
  let balance = loan_amount;
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
    loan_amount: Math.round(loan_amount * 100) / 100,
    monthly_payment: Math.round(monthly_payment * 100) / 100,
    total_paid: Math.round(total_paid_standard * 100) / 100,
    total_interest: Math.round(total_interest_standard * 100) / 100,
    payoff_months: n,
    ...(extra_monthly > 0 && {
      with_extra_payment: {
        extra_monthly,
        payoff_months: months_extra,
        total_interest: Math.round(total_interest_extra * 100) / 100,
        interest_saved,
        months_saved,
      },
    }),
    amortization_schedule,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: finance-tax-estimate

handlers['finance-tax-estimate'] = async (input) => {
  const DISCLAIMER = 'This is an estimate only. Tax laws change. Consult a qualified tax professional.';
  const income = parseFloat(input.income || input.gross_income) || 0;
  const filing_status = String(input.filing_status || 'single').toLowerCase();
  const deductions = parseFloat(input.itemized_deductions) || 0;
  const year = parseInt(input.tax_year) || 2024;

  // 2024 US federal brackets
  const BRACKETS = {
    single: [
      { up_to: 11600, rate: 0.10 },
      { up_to: 47150, rate: 0.12 },
      { up_to: 100525, rate: 0.22 },
      { up_to: 191950, rate: 0.24 },
      { up_to: 243725, rate: 0.32 },
      { up_to: 609350, rate: 0.35 },
      { up_to: Infinity, rate: 0.37 },
    ],
    married_filing_jointly: [
      { up_to: 23200, rate: 0.10 },
      { up_to: 94300, rate: 0.12 },
      { up_to: 201050, rate: 0.22 },
      { up_to: 383900, rate: 0.24 },
      { up_to: 487450, rate: 0.32 },
      { up_to: 731200, rate: 0.35 },
      { up_to: Infinity, rate: 0.37 },
    ],
    married_filing_separately: [
      { up_to: 11600, rate: 0.10 },
      { up_to: 47150, rate: 0.12 },
      { up_to: 100525, rate: 0.22 },
      { up_to: 191950, rate: 0.24 },
      { up_to: 243725, rate: 0.32 },
      { up_to: 365600, rate: 0.35 },
      { up_to: Infinity, rate: 0.37 },
    ],
    head_of_household: [
      { up_to: 16550, rate: 0.10 },
      { up_to: 63100, rate: 0.12 },
      { up_to: 100500, rate: 0.22 },
      { up_to: 191950, rate: 0.24 },
      { up_to: 243700, rate: 0.32 },
      { up_to: 609350, rate: 0.35 },
      { up_to: Infinity, rate: 0.37 },
    ],
  };

  const STANDARD_DEDUCTIONS = {
    single: 14600,
    married_filing_jointly: 29200,
    married_filing_separately: 14600,
    head_of_household: 21900,
  };

  const brackets = BRACKETS[filing_status] || BRACKETS.single;
  const std_deduction = STANDARD_DEDUCTIONS[filing_status] || STANDARD_DEDUCTIONS.single;
  const effective_deduction = Math.max(std_deduction, deductions);
  const taxable_income = Math.max(0, income - effective_deduction);

  // Calculate tax with bracket breakdown
  let federal_tax = 0;
  let prev = 0;
  const bracket_breakdown = [];
  for (const bracket of brackets) {
    const chunk = Math.min(taxable_income, bracket.up_to) - prev;
    if (chunk <= 0) break;
    const tax_in_bracket = chunk * bracket.rate;
    federal_tax += tax_in_bracket;
    bracket_breakdown.push({
      rate_percent: bracket.rate * 100,
      income_in_bracket: Math.round(chunk * 100) / 100,
      tax: Math.round(tax_in_bracket * 100) / 100,
    });
    prev = bracket.up_to;
  }

  // FICA (Social Security 6.2% up to $168,600, Medicare 1.45% + 0.9% over $200k)
  const ss_tax = Math.min(income, 168600) * 0.062;
  const medicare_tax = income * 0.0145 + Math.max(0, income - 200000) * 0.009;
  const fica_total = ss_tax + medicare_tax;

  const total_tax = federal_tax + fica_total;
  const effective_rate = income > 0 ? (federal_tax / income) * 100 : 0;
  const marginal_rate = brackets.find(b => taxable_income <= b.up_to)?.rate * 100 || 37;

  return {
    gross_income: income,
    filing_status,
    standard_deduction: std_deduction,
    itemized_deductions: deductions,
    deduction_used: effective_deduction,
    taxable_income: Math.round(taxable_income * 100) / 100,
    federal_income_tax: Math.round(federal_tax * 100) / 100,
    fica_tax: Math.round(fica_total * 100) / 100,
    total_tax_estimate: Math.round(total_tax * 100) / 100,
    effective_rate_percent: Math.round(effective_rate * 100) / 100,
    marginal_rate_percent: marginal_rate,
    after_tax_income: Math.round((income - total_tax) * 100) / 100,
    bracket_breakdown,
    tax_year: year,
    disclaimer: DISCLAIMER,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: finance-portfolio-diversification-score

handlers['finance-portfolio-diversification-score'] = async (input) => {
  const holdings = Array.isArray(input.holdings) ? input.holdings : [];
  if (holdings.length === 0) return { error: 'holdings array is required' };

  // Normalize weights — accept weight or allocation_percent
  let total_weight = 0;
  const items = holdings.map(h => {
    const w = parseFloat(h.weight || h.allocation_percent || h.percent || 0);
    total_weight += w;
    return { ...h, _w: w };
  });

  // Normalize to sum=1 if weights don't already
  const normalized = items.map(h => ({ ...h, weight: total_weight > 0 ? h._w / total_weight : 1 / items.length }));

  // Herfindahl-Hirschman Index (HHI) — 0=perfect diversification, 1=single asset
  const hhi = normalized.reduce((sum, h) => sum + h.weight * h.weight, 0);
  const effective_n = hhi > 0 ? 1 / hhi : normalized.length;
  const diversification_score = Math.round((1 - hhi) * 100);

  // Sector concentration
  const sectors = {};
  for (const h of normalized) {
    const sector = String(h.sector || h.asset_class || h.category || 'unknown').toLowerCase();
    sectors[sector] = (sectors[sector] || 0) + h.weight;
  }

  const sector_breakdown = Object.entries(sectors)
    .sort((a, b) => b[1] - a[1])
    .map(([sector, weight]) => ({
      sector,
      allocation_percent: Math.round(weight * 10000) / 100,
    }));

  const top_sector = sector_breakdown[0];
  const is_concentrated = top_sector && top_sector.allocation_percent > 40;

  // Concentration risk flags
  const risk_flags = [];
  if (is_concentrated) {
    risk_flags.push(`High concentration in ${top_sector.sector} (${top_sector.allocation_percent}%) — consider rebalancing`);
  }
  if (normalized.length < 5) {
    risk_flags.push(`Only ${normalized.length} holdings — consider adding more assets for diversification`);
  }
  if (hhi > 0.25) {
    risk_flags.push('HHI > 0.25 — portfolio is concentrated, below institutional diversification standards');
  }

  let grade;
  if (diversification_score >= 85) grade = 'A';
  else if (diversification_score >= 70) grade = 'B';
  else if (diversification_score >= 55) grade = 'C';
  else if (diversification_score >= 40) grade = 'D';
  else grade = 'F';

  return {
    diversification_score,
    grade,
    hhi: Math.round(hhi * 10000) / 10000,
    effective_number_of_positions: Math.round(effective_n * 10) / 10,
    holdings_count: normalized.length,
    sector_breakdown,
    risk_flags,
    recommendation: diversification_score >= 70
      ? 'Portfolio is reasonably diversified.'
      : 'Consider spreading allocations more evenly across sectors and asset classes.',
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

  const score = Math.max(0, 100 - bad_practices.length * 12);

  return { layer_count, base_image, exposed_ports, bad_practices, score };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['devops-k8s-validate'] = async (input) => {
  const manifest = String(input.manifest || '');
  const issues = [];

  const get = (key) => {
    const re = new RegExp(`^\\s*${key}:\\s*(.+)`, 'm');
    const m = manifest.match(re);
    return m ? m[1].trim() : null;
  };

  const apiVersion = get('apiVersion');
  const kind = get('kind');
  const name = get('metadata.name') || (() => {
    const metaIdx = manifest.indexOf('metadata:');
    if (metaIdx === -1) return null;
    const sub = manifest.slice(metaIdx, metaIdx + 200);
    const nm = sub.match(/^\s{2}name:\s*(.+)/m);
    return nm ? nm[1].trim() : null;
  })();

  if (!apiVersion) issues.push({ field: 'apiVersion', severity: 'error', message: 'apiVersion is required' });
  if (!kind) issues.push({ field: 'kind', severity: 'error', message: 'kind is required' });
  if (!name) issues.push({ field: 'metadata.name', severity: 'error', message: 'metadata.name is required' });

  if (!/resources:/i.test(manifest) || !/limits:/i.test(manifest)) {
    issues.push({ field: 'spec.containers[].resources.limits', severity: 'warning', message: 'No resource limits defined — may cause noisy neighbour issues' });
  }

  if (!/livenessProbe:/i.test(manifest)) {
    issues.push({ field: 'spec.containers[].livenessProbe', severity: 'warning', message: 'No liveness probe defined — Kubernetes cannot detect application hangs' });
  }

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
  // BUG FIX: track actual detected format instead of always returning 'generic'
  const format_votes = { json: 0, nginx: 0, apache: 0, syslog: 0, generic: 0 };

  const PATTERNS = {
    json: /^\s*\{/,
    nginx: /^(\S+) - (\S+) \[([^\]]+)\] "([^"]*)" (\d+)/,
    apache: /^(\S+) (\S+) (\S+) \[([^\]]+)\] "([^"]+)" (\d+)/,
    syslog: /^(\w{3}\s+\d+\s+[\d:]+)\s+(\S+)\s+(.+)/,
    generic: /(ERRO?R?|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL|CRITI?C?A?L?)/i,
  };

  for (const rawLine of lines) {
    let entry = { ts: null, level: 'info', message: rawLine, source: null };
    let matched_format = 'generic';

    if ((format_hint === 'auto' || format_hint === 'json') && PATTERNS.json.test(rawLine)) {
      try {
        const obj = JSON.parse(rawLine);
        entry.ts = obj.time || obj.timestamp || obj.ts || obj['@timestamp'] || null;
        entry.level = (obj.level || obj.severity || obj.lvl || 'info').toLowerCase();
        entry.message = obj.message || obj.msg || obj.text || rawLine;
        entry.source = obj.service || obj.source || obj.logger || null;
        matched_format = 'json';
      } catch (_) { /* fall through */ }
    } else if ((format_hint === 'auto' || format_hint === 'nginx') && PATTERNS.nginx.test(rawLine)) {
      const m = rawLine.match(PATTERNS.nginx);
      entry = { ts: m[3], level: parseInt(m[5]) >= 500 ? 'error' : parseInt(m[5]) >= 400 ? 'warning' : 'info', message: `${m[4]} -> ${m[5]}`, source: m[1] };
      matched_format = 'nginx';
    } else if ((format_hint === 'auto' || format_hint === 'apache') && PATTERNS.apache.test(rawLine)) {
      const m = rawLine.match(PATTERNS.apache);
      entry = { ts: m[4], level: parseInt(m[6]) >= 500 ? 'error' : parseInt(m[6]) >= 400 ? 'warning' : 'info', message: `${m[5]} -> ${m[6]}`, source: m[1] };
      matched_format = 'apache';
    } else if ((format_hint === 'auto' || format_hint === 'syslog') && PATTERNS.syslog.test(rawLine)) {
      const m = rawLine.match(PATTERNS.syslog);
      entry.ts = m[1]; entry.source = m[2]; entry.message = m[3];
      if (/error|crit|alert|emerg/i.test(m[3])) entry.level = 'error';
      else if (/warn/i.test(m[3])) entry.level = 'warning';
      matched_format = 'syslog';
    } else {
      const lm = rawLine.match(PATTERNS.generic);
      if (lm) {
        const lv = lm[1].toLowerCase();
        if (/err|fatal|crit/.test(lv)) entry.level = 'error';
        else if (/warn/.test(lv)) entry.level = 'warning';
        else entry.level = 'info';
      }
      const tsMatch = rawLine.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
      if (tsMatch) entry.ts = tsMatch[1];
    }

    format_votes[matched_format] = (format_votes[matched_format] || 0) + 1;

    if (entry.level === 'error') errors++;
    else if (entry.level === 'warning') warnings++;
    else info++;

    entries.push(entry);
  }

  // BUG FIX: detect actual dominant format instead of always 'generic'
  let format_detected = format_hint === 'auto'
    ? Object.entries(format_votes).sort((a, b) => b[1] - a[1])[0][0]
    : format_hint;

  return {
    entries,
    summary: { errors, warnings, info, lines_total: lines.length },
    format_detected,
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

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      issues.push({ line: lineno, variable: line, issue: 'Line has no = sign — not a valid key=value pair' });
      return;
    }

    const key = line.slice(0, eqIdx);
    const value = line.slice(eqIdx + 1);

    variables_count++;

    if (key.endsWith(' ') || value.startsWith(' ')) {
      issues.push({ line: lineno, variable: key.trim(), issue: 'Space around = sign — may cause parsing issues in some shells' });
    }

    const trimVal = value.trim();
    if (trimVal === '' || trimVal === '""' || trimVal === "''") {
      empty_count++;
      issues.push({ line: lineno, variable: key.trim(), issue: 'Empty value — consider providing a default or documenting why it is empty' });
    }

    const keyTrimmed = key.trim();
    if (seen.has(keyTrimmed)) {
      issues.push({ line: lineno, variable: keyTrimmed, issue: `Duplicate key (first defined on line ${seen.get(keyTrimmed)})` });
    } else {
      seen.set(keyTrimmed, lineno);
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// NEW: devops-docker-image-scan (rule-based CVE check — no external calls)

handlers['devops-docker-image-scan'] = async (input) => {
  const image = String(input.image || input.image_name || '').trim();
  if (!image) return { error: 'image is required (e.g. "node:14", "python:3.8-slim")' };

  // Parse image:tag
  const colonIdx = image.lastIndexOf(':');
  const name = colonIdx === -1 ? image : image.slice(0, colonIdx);
  const tag = colonIdx === -1 ? 'latest' : image.slice(colonIdx + 1);

  // Known vulnerable base images and versions — rule-based, no external call
  const KNOWN_VULN = [
    { pattern: /^node:(0|4|6|8|10|12|14|15|16|17)\b/, severity: 'critical', cve: 'Multiple', desc: 'EOL Node.js version — no security patches. Upgrade to Node 18 LTS or 20 LTS.' },
    { pattern: /^node:latest$/, severity: 'warning', cve: 'N/A', desc: 'Using "latest" tag is non-deterministic — pin to a specific version.' },
    { pattern: /^python:(2\.\d|3\.[0-7])\b/, severity: 'critical', cve: 'Multiple', desc: 'EOL Python version. Upgrade to Python 3.11+.' },
    { pattern: /^python:latest$/, severity: 'warning', cve: 'N/A', desc: 'Using "latest" tag is non-deterministic.' },
    { pattern: /^ubuntu:(12|14|16|18)\.\d+/, severity: 'critical', cve: 'Multiple', desc: 'EOL Ubuntu release. Use Ubuntu 22.04 or 24.04 LTS.' },
    { pattern: /^debian:(7|8|9|10|jessie|stretch|buster)/, severity: 'high', cve: 'Multiple', desc: 'EOL Debian release. Use Debian 12 (bookworm).' },
    { pattern: /^alpine:(3\.[0-9])\b/, severity: 'high', cve: 'Multiple', desc: 'EOL Alpine version. Use Alpine 3.18 or 3.19.' },
    { pattern: /^centos:(6|7|8)\b/, severity: 'critical', cve: 'Multiple', desc: 'EOL CentOS. Migrate to Rocky Linux, AlmaLinux, or RHEL.' },
    { pattern: /^php:(5\.|7\.[0-3])\b/, severity: 'critical', cve: 'Multiple', desc: 'EOL PHP version. Upgrade to PHP 8.2+.' },
    { pattern: /^ruby:(2\.[0-6])\b/, severity: 'critical', cve: 'Multiple', desc: 'EOL Ruby version. Upgrade to Ruby 3.2+.' },
    { pattern: /^golang:(1\.(1[0-9]|20))\b/, severity: 'high', cve: 'Multiple', desc: 'Old Go version. Use Go 1.21+.' },
    { pattern: /^openjdk:(8|11|15|16|17-ea)\b/, severity: 'high', cve: 'Multiple', desc: 'Outdated or EA Java version. Use Eclipse Temurin 21 LTS.' },
    { pattern: /^mysql:(5\.\d)\b/, severity: 'critical', cve: 'Multiple', desc: 'EOL MySQL 5.x. Upgrade to MySQL 8.0+.' },
    { pattern: /^postgres:(9\.|10\.|11\.|12\.)/, severity: 'high', cve: 'Multiple', desc: 'EOL PostgreSQL version. Upgrade to PostgreSQL 15 or 16.' },
    { pattern: /^redis:[0-4]\b/, severity: 'high', cve: 'Multiple', desc: 'Old Redis version. Upgrade to Redis 7.x.' },
    { pattern: /^nginx:(1\.(1[0-7])\b)/, severity: 'high', cve: 'Multiple', desc: 'Old NGINX version. Use nginx:1.25 or nginx:alpine.' },
    { pattern: /^wordpress:(4\.|5\.[0-5])/, severity: 'critical', cve: 'Multiple', desc: 'Old WordPress version with known exploits.' },
  ];

  const findings = [];
  const full_image = image.toLowerCase();

  for (const rule of KNOWN_VULN) {
    if (rule.pattern.test(full_image)) {
      findings.push({
        severity: rule.severity,
        cve_reference: rule.cve,
        description: rule.desc,
        image_matched: image,
      });
    }
  }

  // Generic checks
  if (tag === 'latest') {
    const already = findings.find(f => f.description.includes('non-deterministic'));
    if (!already) {
      findings.push({ severity: 'warning', cve_reference: 'N/A', description: 'Using "latest" tag is non-deterministic — pin to a specific version for reproducible builds.', image_matched: image });
    }
  }

  const severity_order = { critical: 0, high: 1, medium: 2, warning: 3, info: 4 };
  findings.sort((a, b) => (severity_order[a.severity] ?? 5) - (severity_order[b.severity] ?? 5));

  const critical_count = findings.filter(f => f.severity === 'critical').length;
  const high_count = findings.filter(f => f.severity === 'high').length;
  const overall_risk = critical_count > 0 ? 'critical' : high_count > 0 ? 'high' : findings.length > 0 ? 'medium' : 'low';

  return {
    image,
    name,
    tag,
    overall_risk,
    findings_count: findings.length,
    findings,
    recommendation: findings.length === 0
      ? `No known EOL/vulnerability patterns detected for ${image}. Run a full scanner (Trivy, Grype) for CVE-level analysis.`
      : `${findings.length} issue(s) found. Address critical/high findings before deploying to production.`,
    note: 'Rule-based scan only. For comprehensive CVE scanning use Trivy (trivy image ' + image + ') or Grype.',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: devops-ci-pipeline-lint

handlers['devops-ci-pipeline-lint'] = async (input) => {
  const config = String(input.config || input.yaml || input.pipeline || '').trim();
  const platform = String(input.platform || 'auto').toLowerCase();

  if (!config) return { error: 'config (YAML string) is required' };

  const issues = [];
  const suggestions = [];
  const lines = config.split('\n');

  // Auto-detect platform
  let detected_platform = platform;
  if (platform === 'auto') {
    if (/^on:\s*$/m.test(config) || /runs-on:/m.test(config)) detected_platform = 'github_actions';
    else if (/^stages:/m.test(config)) detected_platform = 'gitlab_ci';
    else if (/^pipeline:/m.test(config) || /^agent\s/m.test(config)) detected_platform = 'jenkins';
    else if (/^trigger:/m.test(config) || /^steps:/m.test(config)) detected_platform = 'circleci';
    else detected_platform = 'generic';
  }

  // Generic checks (apply to all platforms)
  if (!/timeout/i.test(config)) {
    issues.push({ severity: 'warning', rule: 'no-timeout', message: 'No job timeout defined — runaway jobs can block the pipeline indefinitely', fix: 'Add timeout-minutes (GitHub Actions) or timeout (GitLab CI)' });
  }

  if (!/cache/i.test(config)) {
    suggestions.push('No cache configuration found — add caching for dependencies (node_modules, .pip, etc.) to speed up builds');
  }

  if (/password|secret|token|api_key/i.test(config) && !/\$\{\{.*secrets/i.test(config) && !/\$[A-Z_]+SECRET/i.test(config)) {
    issues.push({ severity: 'critical', rule: 'hardcoded-secret', message: 'Possible hardcoded secret detected in pipeline config', fix: 'Use environment secrets: ${{ secrets.MY_SECRET }} or CI/CD secret variables' });
  }

  // GitHub Actions specific
  if (detected_platform === 'github_actions') {
    if (!/actions\/checkout/i.test(config)) {
      issues.push({ severity: 'warning', rule: 'missing-checkout', message: 'No actions/checkout step found — source code may not be available', fix: 'Add: - uses: actions/checkout@v4' });
    }
    // Check for pinned action versions (SHA vs tag)
    const uses_lines = lines.filter(l => /uses:/i.test(l));
    const unpinned = uses_lines.filter(l => !/@[a-f0-9]{40}/.test(l) && /@v\d/.test(l));
    if (unpinned.length > 0) {
      suggestions.push(`${unpinned.length} action(s) use floating version tags (e.g. @v3) instead of pinned SHA — use SHA pinning for supply chain security`);
    }
    if (!/permissions:/i.test(config)) {
      suggestions.push('No explicit permissions block — consider adding permissions: { contents: read } to follow least-privilege principle');
    }
  }

  // GitLab CI specific
  if (detected_platform === 'gitlab_ci') {
    if (!/image:/i.test(config)) {
      suggestions.push('No Docker image specified — jobs will use the default runner image');
    }
    if (!/artifacts:/i.test(config)) {
      suggestions.push('No artifacts defined — test results and build outputs may not be persisted');
    }
    if (!/only:|except:|rules:/i.test(config)) {
      suggestions.push('No branch filters (only/except/rules) — all jobs will run on every push');
    }
  }

  const error_count = issues.filter(i => i.severity === 'critical' || i.severity === 'error').length;
  const warning_count = issues.filter(i => i.severity === 'warning').length;
  const score = Math.max(0, 100 - error_count * 25 - warning_count * 10 - suggestions.length * 5);

  return {
    valid: error_count === 0,
    platform: detected_platform,
    score,
    issues,
    suggestions,
    summary: { errors: error_count, warnings: warning_count, suggestions: suggestions.length },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: devops-infrastructure-cost-estimate

handlers['devops-infrastructure-cost-estimate'] = async (input) => {
  const resources = Array.isArray(input.resources) ? input.resources : [];
  const provider = String(input.provider || 'aws').toLowerCase();
  const region = String(input.region || 'us-east-1');

  if (resources.length === 0) return { error: 'resources array is required. Each item: { type, size/tier, count, hours_per_month }' };

  // Approximate monthly costs (USD) based on public list prices (2024)
  const PRICING = {
    aws: {
      ec2: { nano: 3.80, micro: 8.50, small: 17.00, medium: 34.00, large: 68.00, xlarge: 136.00, '2xlarge': 272.00 },
      rds: { micro: 15.00, small: 30.00, medium: 60.00, large: 120.00, xlarge: 240.00 },
      s3: { per_gb: 0.023, per_request_k: 0.005 },
      eks_node: { small: 35.00, medium: 70.00, large: 140.00 },
      lambda: { per_million_requests: 0.20, per_gb_second: 0.0000166667 },
      cloudfront: { per_tb: 8.50 },
      elb: { base: 16.20, per_lcu: 0.008 },
      nat_gateway: { base: 32.40, per_gb: 0.045 },
    },
    gcp: {
      compute: { micro: 6.00, small: 12.00, medium: 24.00, large: 48.00, xlarge: 96.00 },
      cloud_sql: { micro: 12.00, small: 25.00, medium: 50.00, large: 100.00 },
      gcs: { per_gb: 0.020 },
      gke_node: { small: 30.00, medium: 60.00, large: 120.00 },
    },
    azure: {
      vm: { b1s: 7.30, b2s: 29.20, b4ms: 58.40, d2s: 70.08, d4s: 140.16 },
      sql: { basic: 15.00, standard: 30.00, premium: 125.00 },
      blob: { per_gb: 0.018 },
      aks_node: { small: 32.00, medium: 64.00, large: 128.00 },
    },
  };

  const pricing = PRICING[provider] || PRICING.aws;

  let total_monthly = 0;
  const line_items = [];

  for (const res of resources) {
    const type = String(res.type || '').toLowerCase();
    const size = String(res.size || res.tier || 'medium').toLowerCase();
    const count = parseInt(res.count) || 1;
    const hours = parseFloat(res.hours_per_month) || 730; // full month
    const gb = parseFloat(res.storage_gb) || 0;

    let unit_cost = 0;
    let cost_basis = 'monthly';
    let notes = '';

    if (provider === 'aws') {
      if (type === 'ec2' || type === 'vm' || type === 'compute') {
        unit_cost = (pricing.ec2?.[size] || pricing.ec2?.medium || 34.00) * (hours / 730);
      } else if (type === 'rds' || type === 'database' || type === 'db') {
        unit_cost = pricing.rds?.[size] || pricing.rds?.medium || 60.00;
      } else if (type === 's3' || type === 'storage' || type === 'blob') {
        unit_cost = gb * (pricing.s3?.per_gb || 0.023);
        notes = `${gb} GB storage`;
      } else if (type === 'eks' || type === 'k8s' || type === 'kubernetes') {
        unit_cost = pricing.eks_node?.[size] || 70.00;
      } else if (type === 'elb' || type === 'load_balancer' || type === 'alb') {
        unit_cost = pricing.elb?.base || 16.20;
      } else if (type === 'nat_gateway' || type === 'nat') {
        unit_cost = pricing.nat_gateway?.base || 32.40;
      } else {
        unit_cost = 10.00;
        notes = 'estimated — unknown resource type';
      }
    } else if (provider === 'gcp') {
      if (type === 'compute' || type === 'vm' || type === 'ec2') {
        unit_cost = (pricing.compute?.[size] || 24.00) * (hours / 730);
      } else if (type === 'cloud_sql' || type === 'database' || type === 'db') {
        unit_cost = pricing.cloud_sql?.[size] || 50.00;
      } else if (type === 'gcs' || type === 'storage' || type === 'blob') {
        unit_cost = gb * (pricing.gcs?.per_gb || 0.020);
      } else {
        unit_cost = 10.00; notes = 'estimated';
      }
    } else if (provider === 'azure') {
      if (type === 'vm' || type === 'compute' || type === 'ec2') {
        unit_cost = (pricing.vm?.[size] || pricing.vm?.b2s || 29.20) * (hours / 730);
      } else if (type === 'sql' || type === 'database' || type === 'db') {
        unit_cost = pricing.sql?.[size] || pricing.sql?.standard || 30.00;
      } else if (type === 'blob' || type === 'storage' || type === 's3') {
        unit_cost = gb * (pricing.blob?.per_gb || 0.018);
      } else {
        unit_cost = 10.00; notes = 'estimated';
      }
    }

    const line_total = Math.round(unit_cost * count * 100) / 100;
    total_monthly += line_total;

    line_items.push({
      type,
      size,
      count,
      hours_per_month: hours,
      unit_cost_monthly: Math.round(unit_cost * 100) / 100,
      line_total,
      ...(notes && { notes }),
    });
  }

  const total_annual = total_monthly * 12;

  return {
    provider,
    region,
    total_monthly: Math.round(total_monthly * 100) / 100,
    total_annual: Math.round(total_annual * 100) / 100,
    line_items,
    disclaimer: 'Estimates based on public list prices. Actual costs vary by region, committed use discounts, data transfer, and usage patterns. Verify with the provider pricing calculator.',
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// LEGAL (analysis only — NOT legal advice)
// ═══════════════════════════════════════════════════════════════════════════════

handlers['legal-contract-scan'] = async (input) => {
  const text = String(input.text || input.contract || '');
  const lower = text.toLowerCase();
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
        const before = text.slice(0, idx);
        const line_number_approx = before.split('\n').length;
        const excerpt = text.slice(Math.max(0, idx - 20), idx + 100).replace(/\n/g, ' ').trim();
        found_clauses.push({ clause_type: cp.type, excerpt, line_number_approx });
        break;
      }
    }
  }

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
  const text = String(input.text || input.policy || '');
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

// ─────────────────────────────────────────────────────────────────────────────
// NEW: legal-gdpr-compliance-check (alias with richer output)

handlers['legal-gdpr-compliance-check'] = async (input) => {
  // Delegate to gdpr-scan and augment
  const base = await handlers['legal-gdpr-scan'](input);

  const article_mapping = {
    data_subject_rights: 'Art. 15-22 (Data Subject Rights)',
    lawful_basis: 'Art. 6 (Lawful Basis for Processing)',
    data_retention: 'Art. 5(1)(e) (Storage Limitation)',
    third_party_sharing: 'Art. 28 (Processor Agreements)',
    dpo: 'Art. 37-39 (Data Protection Officer)',
    consent_language: 'Art. 7 (Conditions for Consent)',
    privacy_policy_link: 'Art. 13-14 (Transparency / Privacy Notice)',
    data_breach: 'Art. 33-34 (Breach Notification)',
  };

  const enriched_elements = base.gdpr_elements.map(el => ({
    ...el,
    gdpr_article: article_mapping[el.element] || 'N/A',
    risk: el.found ? 'addressed' : 'gap',
  }));

  const risk_level = base.score >= 75 ? 'low' : base.score >= 50 ? 'medium' : 'high';

  return {
    ...base,
    gdpr_elements: enriched_elements,
    risk_level,
    overall_score: base.score,
    gaps_count: base.compliance_gaps.length,
    remediation_priority: enriched_elements
      .filter(e => !e.found)
      .map(e => ({ element: e.element, article: e.gdpr_article, action: `Document your ${e.element.replace(/_/g, ' ')} to comply with ${e.gdpr_article}` })),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: legal-terms-of-service-analyzer

handlers['legal-terms-of-service-analyzer'] = async (input) => {
  const text = String(input.text || input.tos || input.terms || '');
  const DISCLAIMER = 'Automated analysis only — not legal advice. Consult a qualified attorney.';

  if (!text.trim()) return { error: 'text (terms of service content) is required', disclaimer: DISCLAIMER };

  const lower = text.toLowerCase();

  // Clause detection patterns with user-friendliness scoring
  const TOS_CHECKS = [
    { id: 'unilateral_changes', label: 'Unilateral Changes', pattern: /we may (change|update|modify|amend).*(terms|agreement|policy)/i, risk: 'high', desc: 'Company can change terms without explicit user consent' },
    { id: 'data_sale', label: 'Data Selling', pattern: /sell.*(your|user|personal).*(data|information)/i, risk: 'critical', desc: 'Terms allow selling user data to third parties' },
    { id: 'broad_license', label: 'Broad Content License', pattern: /irrevocable|perpetual|royalty.?free|sublicensable/i, risk: 'high', desc: 'Broad, irrevocable license granted over user content' },
    { id: 'arbitration', label: 'Mandatory Arbitration', pattern: /binding arbitration|waive.*jury|class action waiver/i, risk: 'high', desc: 'Mandatory arbitration — waives right to jury trial and class action' },
    { id: 'governing_law', label: 'Governing Law', pattern: /governed by|jurisdiction of|laws of (the state of|the country of)/i, risk: 'info', desc: 'Governing law clause found' },
    { id: 'indemnification', label: 'User Indemnification', pattern: /you (will |agree to )?indemnify|indemnification by user/i, risk: 'high', desc: 'User must indemnify the company against claims' },
    { id: 'auto_renewal', label: 'Auto-Renewal', pattern: /auto.?renew|automatically renew|renewed automatically/i, risk: 'medium', desc: 'Subscription auto-renews without explicit confirmation' },
    { id: 'account_termination', label: 'Unilateral Account Termination', pattern: /terminate.*(account|access|service).*(any reason|our sole discretion|without notice)/i, risk: 'high', desc: 'Company can terminate your account without notice' },
    { id: 'content_removal', label: 'Content Removal Rights', pattern: /remove|delete.*(content|material|post).*(without notice|at our discretion|any reason)/i, risk: 'medium', desc: 'Company can remove content without notice' },
    { id: 'limitation_liability', label: 'Liability Limitation', pattern: /limitation of liability|not (be )?liable|liability.*capped/i, risk: 'info', desc: 'Liability limitation clause present — limits recourse' },
    { id: 'no_warranty', label: 'No Warranty', pattern: /as.?is|without warranty|disclaim.*warrant/i, risk: 'medium', desc: 'Service provided "as-is" with no warranty' },
    { id: 'privacy_reference', label: 'Privacy Policy Reference', pattern: /privacy policy|data.*collect/i, risk: 'info', desc: 'Privacy policy referenced — check separately' },
  ];

  const findings = [];
  for (const check of TOS_CHECKS) {
    const match = check.pattern.exec(text);
    if (match) {
      const idx = match.index;
      const excerpt = text.slice(Math.max(0, idx - 20), idx + 120).replace(/\n/g, ' ').trim();
      findings.push({
        id: check.id,
        label: check.label,
        risk: check.risk,
        description: check.desc,
        excerpt,
      });
    }
  }

  const risk_counts = { critical: 0, high: 0, medium: 0, info: 0 };
  findings.forEach(f => { risk_counts[f.risk] = (risk_counts[f.risk] || 0) + 1; });

  const user_friendliness_score = Math.max(0, 100
    - risk_counts.critical * 30
    - risk_counts.high * 15
    - risk_counts.medium * 5
  );

  const words = text.split(/\s+/).filter(w => w.length > 0).length;

  return {
    user_friendliness_score,
    risk_summary: risk_counts,
    findings: findings.sort((a, b) => {
      const ord = { critical: 0, high: 1, medium: 2, info: 3 };
      return (ord[a.risk] || 4) - (ord[b.risk] || 4);
    }),
    word_count: words,
    reading_time_minutes: Math.ceil(words / 238),
    disclaimer: DISCLAIMER,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: legal-license-compatibility-check

handlers['legal-license-compatibility-check'] = async (input) => {
  const license_a = String(input.license_a || input.license || '').trim().toUpperCase();
  const license_b = String(input.license_b || '').trim().toUpperCase();
  const use_case = String(input.use_case || 'include').toLowerCase(); // include | distribute | modify | commercial
  const DISCLAIMER = 'Not legal advice. Open source licensing is complex — consult a lawyer for commercial use.';

  if (!license_a) return { error: 'license_a is required (e.g. "MIT", "GPL-3.0", "Apache-2.0")', disclaimer: DISCLAIMER };

  // Normalize common aliases
  const normalize = (l) => {
    const MAP = {
      'GPL': 'GPL-3.0', 'GPL2': 'GPL-2.0', 'GPL3': 'GPL-3.0',
      'LGPL': 'LGPL-2.1', 'AGPL': 'AGPL-3.0',
      'APACHE': 'APACHE-2.0', 'APACHE2': 'APACHE-2.0',
      'BSD': 'BSD-3-CLAUSE', 'BSD2': 'BSD-2-CLAUSE', 'BSD3': 'BSD-3-CLAUSE',
      'CC0': 'CC0-1.0', 'UNLICENSE': 'UNLICENSE', 'PUBLIC DOMAIN': 'PUBLIC-DOMAIN',
    };
    return MAP[l] || l;
  };

  const a = normalize(license_a);
  const b = license_b ? normalize(license_b) : null;

  // License properties
  const LICENSE_INFO = {
    'MIT':            { copyleft: false, commercial: true, patent_grant: false, permissive: true, spdx: 'MIT' },
    'APACHE-2.0':     { copyleft: false, commercial: true, patent_grant: true,  permissive: true, spdx: 'Apache-2.0' },
    'BSD-2-CLAUSE':   { copyleft: false, commercial: true, patent_grant: false, permissive: true, spdx: 'BSD-2-Clause' },
    'BSD-3-CLAUSE':   { copyleft: false, commercial: true, patent_grant: false, permissive: true, spdx: 'BSD-3-Clause' },
    'ISC':            { copyleft: false, commercial: true, patent_grant: false, permissive: true, spdx: 'ISC' },
    'GPL-2.0':        { copyleft: true,  commercial: true, patent_grant: false, permissive: false, spdx: 'GPL-2.0-only' },
    'GPL-3.0':        { copyleft: true,  commercial: true, patent_grant: true,  permissive: false, spdx: 'GPL-3.0-only' },
    'LGPL-2.1':       { copyleft: 'weak',commercial: true, patent_grant: false, permissive: false, spdx: 'LGPL-2.1-only' },
    'LGPL-3.0':       { copyleft: 'weak',commercial: true, patent_grant: true,  permissive: false, spdx: 'LGPL-3.0-only' },
    'AGPL-3.0':       { copyleft: true,  commercial: true, patent_grant: true,  permissive: false, spdx: 'AGPL-3.0-only', network_copyleft: true },
    'MPL-2.0':        { copyleft: 'weak',commercial: true, patent_grant: true,  permissive: false, spdx: 'MPL-2.0' },
    'CC0-1.0':        { copyleft: false, commercial: true, patent_grant: true,  permissive: true, spdx: 'CC0-1.0' },
    'UNLICENSE':      { copyleft: false, commercial: true, patent_grant: false, permissive: true, spdx: 'Unlicense' },
    'PUBLIC-DOMAIN':  { copyleft: false, commercial: true, patent_grant: false, permissive: true, spdx: 'Public Domain' },
    'CC-BY-4.0':      { copyleft: false, commercial: true, patent_grant: false, permissive: true, spdx: 'CC-BY-4.0' },
    'CC-BY-SA-4.0':   { copyleft: true,  commercial: true, patent_grant: false, permissive: false, spdx: 'CC-BY-SA-4.0' },
    'CC-BY-NC-4.0':   { copyleft: false, commercial: false,patent_grant: false, permissive: false, spdx: 'CC-BY-NC-4.0' },
    'PROPRIETARY':    { copyleft: false, commercial: null, patent_grant: false, permissive: false, spdx: 'Proprietary' },
  };

  // Compatibility matrix — [a][b] = compatible?
  const COMPAT = {
    'MIT':         { 'MIT': true, 'APACHE-2.0': true, 'GPL-2.0': true, 'GPL-3.0': true, 'LGPL-2.1': true, 'LGPL-3.0': true, 'AGPL-3.0': true, 'MPL-2.0': true, 'BSD-2-CLAUSE': true, 'BSD-3-CLAUSE': true, 'ISC': true },
    'APACHE-2.0':  { 'MIT': true, 'APACHE-2.0': true, 'GPL-2.0': false, 'GPL-3.0': true, 'LGPL-3.0': true, 'AGPL-3.0': true, 'MPL-2.0': true, 'BSD-2-CLAUSE': true, 'BSD-3-CLAUSE': true },
    'GPL-2.0':     { 'MIT': true, 'GPL-2.0': true, 'LGPL-2.1': true, 'BSD-2-CLAUSE': true, 'BSD-3-CLAUSE': true, 'APACHE-2.0': false, 'GPL-3.0': false },
    'GPL-3.0':     { 'MIT': true, 'APACHE-2.0': true, 'GPL-2.0': false, 'GPL-3.0': true, 'LGPL-2.1': true, 'LGPL-3.0': true, 'BSD-2-CLAUSE': true, 'BSD-3-CLAUSE': true },
    'LGPL-2.1':    { 'MIT': true, 'APACHE-2.0': false, 'GPL-2.0': true, 'LGPL-2.1': true, 'BSD-2-CLAUSE': true },
    'LGPL-3.0':    { 'MIT': true, 'APACHE-2.0': true, 'GPL-3.0': true, 'LGPL-3.0': true, 'BSD-2-CLAUSE': true },
    'AGPL-3.0':    { 'MIT': true, 'APACHE-2.0': true, 'GPL-3.0': true, 'AGPL-3.0': true },
    'MPL-2.0':     { 'MIT': true, 'APACHE-2.0': true, 'GPL-2.0': true, 'GPL-3.0': true, 'MPL-2.0': true },
  };

  const info_a = LICENSE_INFO[a] || null;
  const info_b = b ? (LICENSE_INFO[b] || null) : null;

  let compatibility = null;
  let compatibility_notes = [];

  if (b) {
    const compat_row = COMPAT[a] || {};
    const is_compatible = compat_row[b];
    compatibility = is_compatible === true ? 'compatible' : is_compatible === false ? 'incompatible' : 'unknown';

    if (compatibility === 'incompatible') {
      compatibility_notes.push(`${a} and ${b} are generally incompatible for combined distribution.`);
      if (a === 'APACHE-2.0' && b === 'GPL-2.0') {
        compatibility_notes.push('Apache-2.0 patent termination clause conflicts with GPL-2.0. You cannot combine these in the same binary distributed under GPL-2.0.');
      }
    } else if (info_b?.copyleft && !info_a?.copyleft) {
      compatibility_notes.push(`Including ${b} (copyleft) in a ${a} project requires the combined work to be released under ${b}.`);
    }
  }

  // Use-case specific analysis
  const use_case_notes = [];
  if (use_case === 'commercial' && info_a?.commercial === false) {
    use_case_notes.push(`${a} prohibits commercial use.`);
  }
  if (info_a?.copyleft === true && (use_case === 'distribute' || use_case === 'modify')) {
    use_case_notes.push(`${a} is a copyleft license — derivative works must also be released under ${a}.`);
  }
  if (info_a?.copyleft === 'weak' && use_case === 'include') {
    use_case_notes.push(`${a} is a weak copyleft license — you can link against it without copyleft obligation, but modifications to the library itself must be shared.`);
  }
  if (info_a?.network_copyleft && use_case === 'include') {
    use_case_notes.push(`${a} has network copyleft — even SaaS/hosted use requires source disclosure.`);
  }

  return {
    license_a: a,
    license_b: b,
    use_case,
    license_a_info: info_a,
    license_b_info: info_b,
    compatibility,
    compatibility_notes,
    use_case_notes,
    patent_grant: info_a?.patent_grant ? `${a} includes an explicit patent grant.` : `${a} does not include an explicit patent grant.`,
    commercial_use: info_a?.commercial === false ? 'prohibited' : info_a?.commercial === true ? 'allowed' : 'check license terms',
    disclaimer: DISCLAIMER,
  };
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
  } else if (input.weight_lbs != null && input.height_cm != null) {
    // BUG FIX: mixed unit alias — weight_lbs + height_cm is a reasonable caller mistake
    weight_kg = parseFloat(input.weight_lbs) * 0.453592;
    height_m = parseFloat(input.height_cm) / 100;
  } else {
    return { error: 'Provide weight_kg + height_cm OR weight_lbs + height_inches', disclaimer: DISCLAIMER };
  }

  if (height_m <= 0) return { error: 'Height must be greater than 0', disclaimer: DISCLAIMER };
  if (weight_kg <= 0) return { error: 'Weight must be greater than 0', disclaimer: DISCLAIMER };

  const bmi = weight_kg / (height_m * height_m);
  let category;
  if (bmi < 18.5) category = 'underweight';
  else if (bmi < 25) category = 'normal';
  else if (bmi < 30) category = 'overweight';
  else category = 'obese';

  const min_kg = Math.round(18.5 * height_m * height_m * 10) / 10;
  const max_kg = Math.round(24.9 * height_m * height_m * 10) / 10;

  return {
    bmi: Math.round(bmi * 10) / 10,
    category,
    healthy_weight_range_kg: { min: min_kg, max: max_kg },
    healthy_weight_range_lbs: {
      min: Math.round(min_kg * 2.20462 * 10) / 10,
      max: Math.round(max_kg * 2.20462 * 10) / 10,
    },
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

  const FREQ_OFFSETS = {
    daily: [0],
    once_daily: [0],
    twice_daily: [0, 720],
    'two_times_daily': [0, 720],
    'bid': [0, 720],
    three_times_daily: [0, 480, 960],
    'tid': [0, 480, 960],
    four_times_daily: [0, 360, 720, 1080],
    'qid': [0, 360, 720, 1080],
    weekly: [0],
    monthly: [0],
  };

  const timeSlots = new Map();

  for (const med of medications) {
    const freq = (med.frequency || 'daily').toLowerCase().replace(/\s/g, '_');
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
        dose: med.dose || med.dosage || null,
      });
    }
  }

  const schedule = Array.from(timeSlots.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, meds]) => ({
      time,
      medications: meds.map(m => m.dose ? `${m.name} (${m.dose})` : m.name),
      notes: meds.filter(m => m.with_food).length > 0 ? 'Take with food' : null,
    }));

  const reminders = schedule.map(s => `${s.time}: ${s.medications.join(', ')}${s.notes ? ' (' + s.notes + ')' : ''}`);

  return { schedule, reminders, disclaimer: DISCLAIMER };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: health-calorie-estimate

handlers['health-calorie-estimate'] = async (input) => {
  const DISCLAIMER = 'Calorie estimates are approximations. Consult a registered dietitian for personalized nutrition advice.';

  const weight_kg = parseFloat(input.weight_kg || (parseFloat(input.weight_lbs) * 0.453592)) || 0;
  const height_cm = parseFloat(input.height_cm || (parseFloat(input.height_inches) * 2.54)) || 0;
  const age = parseInt(input.age) || 30;
  const sex = String(input.sex || input.gender || 'male').toLowerCase();
  const activity = String(input.activity_level || 'moderate').toLowerCase();
  const goal = String(input.goal || 'maintain').toLowerCase();

  if (weight_kg <= 0) return { error: 'weight_kg (or weight_lbs) is required', disclaimer: DISCLAIMER };
  if (height_cm <= 0) return { error: 'height_cm (or height_inches) is required', disclaimer: DISCLAIMER };

  // Mifflin-St Jeor BMR
  let bmr;
  if (sex === 'female' || sex === 'f' || sex === 'woman') {
    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;
  } else {
    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5;
  }

  const ACTIVITY_MULTIPLIERS = {
    sedentary: 1.2,
    light: 1.375,
    lightly_active: 1.375,
    moderate: 1.55,
    moderately_active: 1.55,
    active: 1.725,
    very_active: 1.725,
    extra_active: 1.9,
    athlete: 1.9,
  };

  const multiplier = ACTIVITY_MULTIPLIERS[activity.replace(/\s/g, '_')] || 1.55;
  const tdee = bmr * multiplier;

  const GOAL_ADJUSTMENTS = {
    lose: -500,
    lose_weight: -500,
    cut: -500,
    aggressive_cut: -1000,
    maintain: 0,
    maintenance: 0,
    gain: 300,
    gain_weight: 300,
    bulk: 500,
    lean_bulk: 300,
  };

  const adjustment = GOAL_ADJUSTMENTS[goal.replace(/\s/g, '_')] || 0;
  const target_calories = Math.round(tdee + adjustment);

  // Macro split (balanced)
  const protein_g = Math.round(weight_kg * 1.6); // 1.6g/kg for active
  const fat_g = Math.round((target_calories * 0.25) / 9);
  const carb_g = Math.round((target_calories - protein_g * 4 - fat_g * 9) / 4);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    target_calories,
    goal,
    activity_level: activity,
    macros: {
      protein_g,
      carbs_g: Math.max(0, carb_g),
      fat_g,
      protein_calories: protein_g * 4,
      carb_calories: Math.max(0, carb_g) * 4,
      fat_calories: fat_g * 9,
    },
    weight_change_per_week_kg: adjustment !== 0 ? Math.round((adjustment / 7700) * 10) / 10 : 0,
    disclaimer: DISCLAIMER,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: health-medication-interaction-check (rule-based — no external APIs)

handlers['health-medication-interaction-check'] = async (input) => {
  const DISCLAIMER = 'Rule-based interaction check only. Always verify with a pharmacist or physician before combining medications.';
  const medications = Array.isArray(input.medications) ? input.medications.map(m => String(m).toLowerCase().trim()) : [];

  if (medications.length < 2) return { error: 'At least 2 medications are required to check interactions', disclaimer: DISCLAIMER };

  // Known interaction pairs (drug_a, drug_b, severity, description)
  const INTERACTIONS = [
    { a: 'warfarin', b: 'aspirin', severity: 'major', effect: 'Increased bleeding risk — anticoagulant effect of warfarin enhanced by aspirin' },
    { a: 'warfarin', b: 'ibuprofen', severity: 'major', effect: 'NSAIDs increase bleeding risk with warfarin; avoid combination' },
    { a: 'warfarin', b: 'naproxen', severity: 'major', effect: 'NSAIDs increase bleeding risk with warfarin' },
    { a: 'warfarin', b: 'fluconazole', severity: 'major', effect: 'Fluconazole inhibits warfarin metabolism — INR can spike' },
    { a: 'ssri', b: 'maoi', severity: 'contraindicated', effect: 'Serotonin syndrome risk — life-threatening. Do not combine.' },
    { a: 'sertraline', b: 'maoi', severity: 'contraindicated', effect: 'Serotonin syndrome risk — life-threatening. 14-day washout required.' },
    { a: 'fluoxetine', b: 'maoi', severity: 'contraindicated', effect: 'Serotonin syndrome risk — life-threatening.' },
    { a: 'tramadol', b: 'ssri', severity: 'major', effect: 'Serotonin syndrome risk when combining tramadol with SSRIs' },
    { a: 'tramadol', b: 'sertraline', severity: 'major', effect: 'Serotonin syndrome risk' },
    { a: 'metformin', b: 'alcohol', severity: 'moderate', effect: 'Increased lactic acidosis risk; avoid heavy alcohol use with metformin' },
    { a: 'statins', b: 'niacin', severity: 'moderate', effect: 'Increased myopathy risk with high-dose niacin and statins' },
    { a: 'atorvastatin', b: 'clarithromycin', severity: 'major', effect: 'Clarithromycin increases statin levels — risk of rhabdomyolysis' },
    { a: 'simvastatin', b: 'clarithromycin', severity: 'major', effect: 'Clarithromycin inhibits simvastatin metabolism — rhabdomyolysis risk' },
    { a: 'digoxin', b: 'amiodarone', severity: 'major', effect: 'Amiodarone significantly increases digoxin levels — toxicity risk' },
    { a: 'lisinopril', b: 'potassium', severity: 'moderate', effect: 'ACE inhibitors + potassium supplements can cause hyperkalemia' },
    { a: 'methotrexate', b: 'nsaid', severity: 'major', effect: 'NSAIDs reduce methotrexate clearance — toxicity risk' },
    { a: 'methotrexate', b: 'ibuprofen', severity: 'major', effect: 'Ibuprofen reduces methotrexate clearance — toxicity risk' },
    { a: 'clopidogrel', b: 'omeprazole', severity: 'moderate', effect: 'Omeprazole reduces clopidogrel antiplatelet effect via CYP2C19 inhibition' },
    { a: 'levothyroxine', b: 'calcium', severity: 'moderate', effect: 'Calcium supplements reduce levothyroxine absorption — separate by 4 hours' },
    { a: 'levothyroxine', b: 'iron', severity: 'moderate', effect: 'Iron reduces levothyroxine absorption — separate by 4 hours' },
    { a: 'sildenafil', b: 'nitrates', severity: 'contraindicated', effect: 'Severe hypotension — do not combine PDE5 inhibitors with nitrates' },
    { a: 'tadalafil', b: 'nitrates', severity: 'contraindicated', effect: 'Severe hypotension — do not combine PDE5 inhibitors with nitrates' },
    { a: 'alcohol', b: 'benzodiazepine', severity: 'major', effect: 'CNS depression potentiated — risk of respiratory depression and death' },
    { a: 'alcohol', b: 'opioid', severity: 'major', effect: 'CNS/respiratory depression — potentially fatal combination' },
    { a: 'alcohol', b: 'acetaminophen', severity: 'moderate', effect: 'Hepatotoxicity risk increases significantly with chronic alcohol use' },
    { a: 'ssri', b: 'tramadol', severity: 'major', effect: 'Serotonin syndrome risk' },
  ];

  const found_interactions = [];
  const checked_pairs = new Set();

  for (let i = 0; i < medications.length; i++) {
    for (let j = i + 1; j < medications.length; j++) {
      const drug_a = medications[i];
      const drug_b = medications[j];
      const pair_key = [drug_a, drug_b].sort().join('|');
      if (checked_pairs.has(pair_key)) continue;
      checked_pairs.add(pair_key);

      for (const rule of INTERACTIONS) {
        const match_a = drug_a.includes(rule.a) || rule.a.includes(drug_a);
        const match_b = drug_b.includes(rule.b) || rule.b.includes(drug_b);
        const match_rev_a = drug_a.includes(rule.b) || rule.b.includes(drug_a);
        const match_rev_b = drug_b.includes(rule.a) || rule.a.includes(drug_b);

        if ((match_a && match_b) || (match_rev_a && match_rev_b)) {
          found_interactions.push({
            drug_a: medications[i],
            drug_b: medications[j],
            severity: rule.severity,
            effect: rule.effect,
          });
          break;
        }
      }
    }
  }

  const severity_order = { contraindicated: 0, major: 1, moderate: 2, minor: 3 };
  found_interactions.sort((a, b) => (severity_order[a.severity] || 4) - (severity_order[b.severity] || 4));

  const has_contraindicated = found_interactions.some(i => i.severity === 'contraindicated');
  const has_major = found_interactions.some(i => i.severity === 'major');

  return {
    medications_checked: medications,
    interactions_found: found_interactions.length,
    interactions: found_interactions,
    overall_risk: has_contraindicated ? 'contraindicated' : has_major ? 'major' : found_interactions.length > 0 ? 'moderate' : 'no_known_interactions',
    recommendation: has_contraindicated
      ? 'STOP — one or more contraindicated combinations detected. Do not take together without immediate physician consultation.'
      : has_major
        ? 'Major interaction(s) detected — consult your pharmacist or physician before combining.'
        : found_interactions.length > 0
          ? 'Moderate interaction(s) detected — discuss with your healthcare provider.'
          : 'No known interactions found in rule database. Always verify with a pharmacist.',
    disclaimer: DISCLAIMER,
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETING
// ═══════════════════════════════════════════════════════════════════════════════

handlers['marketing-headline-score'] = async (input) => {
  const headline = String(input.headline || input.title || input.text || '');
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

  if (char_count >= 40 && char_count <= 70) score += 25;
  else if (char_count >= 30 && char_count <= 80) score += 15;
  else if (char_count >= 20) score += 5;

  score += Math.min(25, power_words_found.length * 8);
  if (has_number) score += 10;
  if (is_question) score += 10;
  score += Math.min(15, emotional_words_found.length * 8);

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

  if (cv === 0 || vv === 0) return { error: 'control_visitors and variant_visitors must be greater than 0' };

  const control_rate = cv > 0 ? cc / cv : 0;
  const variant_rate = vv > 0 ? vc / vv : 0;
  const relative_uplift = control_rate > 0 ? ((variant_rate - control_rate) / control_rate) * 100 : 0;

  // Two-proportion z-test (pooled)
  const p_pool = (cc + vc) / (cv + vv || 1);
  const se = Math.sqrt(p_pool * (1 - p_pool) * (1 / (cv || 1) + 1 / (vv || 1)));
  const z_score = se > 0 ? (variant_rate - control_rate) / se : 0;

  const significance_95 = Math.abs(z_score) >= 1.96;
  const significance_99 = Math.abs(z_score) >= 2.576;

  // Approximate p-value from z-score using normal distribution approximation
  const approx_p_value = (() => {
    const z = Math.abs(z_score);
    if (z > 8) return 0;
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * z / Math.sqrt(2));
    const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
    const erfc = poly * Math.exp(-z * z / 2);
    return Math.round(erfc * 10000) / 10000;
  })();

  // Required sample size for 80% power at current rates
  const req_sample = (() => {
    if (control_rate <= 0 || control_rate >= 1) return null;
    const p1 = control_rate, p2 = variant_rate || control_rate * 1.1;
    const p_avg = (p1 + p2) / 2;
    const n = Math.ceil((1.96 * Math.sqrt(2 * p_avg * (1 - p_avg)) + 0.842 * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / ((p2 - p1) ** 2 || 0.0001));
    return n;
  })();

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
    p_value_approx: approx_p_value,
    significance_95,
    significance_99,
    winner,
    recommendation,
    required_sample_size_per_variant: req_sample,
    control: { visitors: cv, conversions: cc },
    variant: { visitors: vv, conversions: vc },
  };
};

// ─────────────────────────────────────────────────────────────────────────────

handlers['seo-keyword-density'] = async (input) => {
  const text = String(input.text || input.content || '');
  const keywords = Array.isArray(input.keywords) ? input.keywords : [];

  const words_raw = text.split(/\s+/).filter(w => w.length > 0);
  const total_words = words_raw.length;
  const lower_text = text.toLowerCase();

  const keyword_analysis = keywords.map(kw => {
    const kw_lower = kw.toLowerCase();
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
// NEW: marketing-readability-score

handlers['marketing-readability-score'] = async (input) => {
  const text = String(input.text || input.content || '');
  if (!text.trim()) return { error: 'text is required' };

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentence_count = sentences.length;
  const word_count = words.length;

  if (word_count === 0) return { error: 'text contains no words' };

  // Syllable count (heuristic)
  const countSyllables = (word) => {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 2) return 1;
    const syl = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
    return Math.max(1, syl ? syl.length : 1);
  };

  const total_syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avg_syllables_per_word = total_syllables / word_count;
  const avg_words_per_sentence = word_count / sentence_count;

  // Flesch Reading Ease: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
  const flesch = 206.835 - 1.015 * avg_words_per_sentence - 84.6 * avg_syllables_per_word;
  const flesch_score = Math.max(0, Math.min(100, Math.round(flesch * 10) / 10));

  // Flesch-Kincaid Grade Level
  const fk_grade = Math.max(0, Math.round((0.39 * avg_words_per_sentence + 11.8 * avg_syllables_per_word - 15.59) * 10) / 10);

  // Audience label from Flesch score
  let audience;
  if (flesch_score >= 90) audience = 'very_easy (5th grade)';
  else if (flesch_score >= 80) audience = 'easy (6th grade)';
  else if (flesch_score >= 70) audience = 'fairly_easy (7th grade)';
  else if (flesch_score >= 60) audience = 'standard (8th-9th grade)';
  else if (flesch_score >= 50) audience = 'fairly_difficult (10th-12th grade)';
  else if (flesch_score >= 30) audience = 'difficult (college)';
  else audience = 'very_difficult (college graduate)';

  // Passive voice heuristic
  const passive_matches = text.match(/\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi) || [];
  const passive_count = passive_matches.length;
  const passive_pct = Math.round((passive_count / sentence_count) * 100);

  // Long sentence count (> 25 words)
  const long_sentences = sentences.filter(s => s.split(/\s+/).filter(w => w.length > 0).length > 25).length;

  const suggestions = [];
  if (flesch_score < 60) suggestions.push('Text is difficult to read — simplify sentences and use shorter words');
  if (avg_words_per_sentence > 20) suggestions.push(`Average sentence is ${Math.round(avg_words_per_sentence)} words — aim for under 20`);
  if (long_sentences > 0) suggestions.push(`${long_sentences} sentence(s) exceed 25 words — consider splitting them`);
  if (passive_pct > 20) suggestions.push(`${passive_pct}% passive voice — use active voice for clearer writing`);
  if (avg_syllables_per_word > 1.6) suggestions.push('Many complex words — replace with simpler alternatives where possible');

  return {
    flesch_reading_ease: flesch_score,
    flesch_kincaid_grade: fk_grade,
    audience,
    word_count,
    sentence_count,
    avg_words_per_sentence: Math.round(avg_words_per_sentence * 10) / 10,
    avg_syllables_per_word: Math.round(avg_syllables_per_word * 100) / 100,
    passive_voice_count: passive_count,
    passive_voice_percent: passive_pct,
    long_sentences_count: long_sentences,
    suggestions,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW: marketing-ab-test-significance (alias for ab-test-calc with cleaner naming)

handlers['marketing-ab-test-significance'] = async (input) => {
  // Flexible field aliases so callers don't need to remember exact param names
  const normalized = {
    control_visitors: input.control_visitors || input.control_n || input.n_control,
    control_conversions: input.control_conversions || input.control_c || input.c_control,
    variant_visitors: input.variant_visitors || input.variant_n || input.n_variant || input.treatment_visitors,
    variant_conversions: input.variant_conversions || input.variant_c || input.c_variant || input.treatment_conversions,
  };
  return handlers['marketing-ab-test-calc'](normalized);
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = handlers;
