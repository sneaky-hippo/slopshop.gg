'use strict';

const vm = require('vm');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// 1. gen-doc-readme-template
// ---------------------------------------------------------------------------
async function genDocReadmeTemplate(input) {
  const name = input.name || 'my-project';
  const description = input.description || 'A project.';
  const language = input.language || 'node';
  const features = input.features || [];

  const badgeMap = {
    node: `[![npm version](https://img.shields.io/npm/v/${name}.svg)](https://npmjs.com/package/${name}) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)`,
    python: `[![PyPI version](https://img.shields.io/pypi/v/${name}.svg)](https://pypi.org/project/${name}) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)`,
    go: `[![Go Report Card](https://goreportcard.com/badge/github.com/user/${name})](https://goreportcard.com/report/github.com/user/${name}) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)`,
  };

  const installMap = {
    node: `\`\`\`bash\nnpm install ${name}\n\`\`\``,
    python: `\`\`\`bash\npip install ${name}\n\`\`\``,
    go: `\`\`\`bash\ngo get github.com/user/${name}\n\`\`\``,
  };

  const usageMap = {
    node: `\`\`\`javascript\nconst ${name.replace(/-/g, '_')} = require('${name}');\n\n// TODO: add usage example\n\`\`\``,
    python: `\`\`\`python\nimport ${name.replace(/-/g, '_')}\n\n# TODO: add usage example\n\`\`\``,
    go: `\`\`\`go\nimport "github.com/user/${name}"\n\n// TODO: add usage example\n\`\`\``,
  };

  const featureList = features.length > 0
    ? features.map(f => `- ${f}`).join('\n')
    : '- Fast and lightweight\n- Easy to use\n- Well documented';

  const markdown = [
    `# ${name}`,
    '',
    badgeMap[language] || badgeMap.node,
    '',
    `> ${description}`,
    '',
    '## Features',
    '',
    featureList,
    '',
    '## Installation',
    '',
    installMap[language] || installMap.node,
    '',
    '## Usage',
    '',
    usageMap[language] || usageMap.node,
    '',
    '## API',
    '',
    'See [docs](./docs) for full API reference.',
    '',
    '## Contributing',
    '',
    'Pull requests are welcome. For major changes, please open an issue first.',
    '',
    '## License',
    '',
    `[MIT](LICENSE) © ${new Date().getFullYear()}`,
    '',
  ].join('\n');

  return { _engine: 'real', markdown };
}

// ---------------------------------------------------------------------------
// 2. gen-doc-license
// ---------------------------------------------------------------------------
async function genDocLicense(input) {
  const license = input.license || 'MIT';
  const author = input.author || 'Author';
  const year = input.year || new Date().getFullYear();

  const templates = {
    'MIT': {
      spdx_id: 'MIT',
      text: `MIT License\n\nCopyright (c) ${year} ${author}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`,
    },
    'Apache-2.0': {
      spdx_id: 'Apache-2.0',
      text: `Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/\n\nCopyright ${year} ${author}\n\nLicensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.`,
    },
    'GPL-3.0': {
      spdx_id: 'GPL-3.0-only',
      text: `GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n\nCopyright (C) ${year} ${author}\n\nThis program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.\n\nThis program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.\n\nYou should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.`,
    },
    'BSD-3': {
      spdx_id: 'BSD-3-Clause',
      text: `BSD 3-Clause License\n\nCopyright (c) ${year}, ${author}\nAll rights reserved.\n\nRedistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\n1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
    },
    'ISC': {
      spdx_id: 'ISC',
      text: `ISC License\n\nCopyright (c) ${year}, ${author}\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,
    },
  };

  const tpl = templates[license] || templates['MIT'];
  return { _engine: 'real', text: tpl.text, spdx_id: tpl.spdx_id };
}

// ---------------------------------------------------------------------------
// 3. gen-doc-docker-compose
// FIX: guard against missing service.name to prevent crash
// ---------------------------------------------------------------------------
async function genDocDockerCompose(input) {
  const services = input.services || [];

  const lines = ['version: "3.9"', 'services:'];
  for (const svc of services) {
    // BUG FIX: skip services without a name instead of crashing
    if (!svc || typeof svc.name !== 'string' || !svc.name.trim()) continue;
    lines.push(`  ${svc.name}:`);
    if (svc.image) lines.push(`    image: ${svc.image}`);
    if (svc.ports && svc.ports.length > 0) {
      lines.push('    ports:');
      for (const p of svc.ports) lines.push(`      - "${p}"`);
    }
    if (svc.env && Object.keys(svc.env).length > 0) {
      lines.push('    environment:');
      for (const [k, v] of Object.entries(svc.env)) lines.push(`      ${k}: "${v}"`);
    }
    if (svc.volumes && svc.volumes.length > 0) {
      lines.push('    volumes:');
      for (const v of svc.volumes) lines.push(`      - ${v}`);
    }
    if (svc.depends_on && svc.depends_on.length > 0) {
      lines.push('    depends_on:');
      for (const d of svc.depends_on) lines.push(`      - ${d}`);
    }
    if (svc.command) lines.push(`    command: ${svc.command}`);
    if (svc.restart) lines.push(`    restart: ${svc.restart}`);
  }

  return { _engine: 'real', yaml: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// 4. gen-doc-github-action
// ---------------------------------------------------------------------------
async function genDocGithubAction(input) {
  const name = input.name || 'CI';
  const on = input.on || 'push';
  const node_version = input.node_version || '22';
  const steps = input.steps || ['install', 'test'];

  const stepMap = {
    install: '      - name: Install dependencies\n        run: npm ci',
    test: '      - name: Run tests\n        run: npm test',
    build: '      - name: Build\n        run: npm run build',
    lint: '      - name: Lint\n        run: npm run lint',
    deploy: '      - name: Deploy\n        run: npm run deploy',
  };

  const stepYaml = steps.map(s => stepMap[s] || `      - name: ${s}\n        run: npm run ${s}`).join('\n');

  const yaml = [
    `name: ${name}`,
    '',
    `on: [${on}]`,
    '',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    `      - name: Use Node.js ${node_version}`,
    '        uses: actions/setup-node@v4',
    '        with:',
    `          node-version: '${node_version}'`,
    '          cache: npm',
    stepYaml,
  ].join('\n');

  return { _engine: 'real', yaml };
}

// ---------------------------------------------------------------------------
// 5. gen-doc-env-template
// ---------------------------------------------------------------------------
async function genDocEnvTemplate(input) {
  const vars = input.vars || [];
  const lines = ['# Environment Variables', '# Copy to .env and fill in your values', ''];

  for (const v of vars) {
    if (v.description) lines.push(`# ${v.description}`);
    lines.push(`${v.name}=${v.example || ''}`);
    lines.push('');
  }

  return { _engine: 'real', text: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// 6. gen-doc-tsconfig
// ---------------------------------------------------------------------------
async function genDocTsconfig(input) {
  const target = input.target || 'ESNext';
  const module_ = input.module || 'NodeNext';
  const strict = input.strict !== false;
  const outDir = input.outdir || 'dist';

  const config = {
    compilerOptions: {
      target,
      module: module_,
      moduleResolution: module_.toLowerCase().includes('node') ? 'NodeNext' : 'bundler',
      outDir,
      rootDir: 'src',
      strict,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', outDir, '**/*.test.ts', '**/*.spec.ts'],
  };

  return { _engine: 'real', json: JSON.stringify(config, null, 2) };
}

// ---------------------------------------------------------------------------
// 7. gen-doc-eslint-config
// ---------------------------------------------------------------------------
async function genDocEslintConfig(input) {
  const style = input.style || 'recommended';
  const typescript = input.typescript !== false;
  const react = input.react === true;

  const extendsArr = [];
  if (style === 'strict') {
    extendsArr.push('eslint:all');
  } else {
    extendsArr.push('eslint:recommended');
  }
  if (typescript) {
    extendsArr.push('plugin:@typescript-eslint/recommended');
    if (style === 'strict') extendsArr.push('plugin:@typescript-eslint/strict');
  }
  if (react) {
    extendsArr.push('plugin:react/recommended');
    extendsArr.push('plugin:react-hooks/recommended');
  }

  const plugins = [];
  if (typescript) plugins.push('@typescript-eslint');
  if (react) plugins.push('react', 'react-hooks');

  const rules = {};
  if (style === 'strict') {
    rules['no-console'] = 'warn';
    rules['no-unused-vars'] = 'error';
    if (typescript) rules['@typescript-eslint/explicit-function-return-type'] = 'error';
  }

  const config = {
    env: { es2022: true, node: true, ...(react ? { browser: true } : {}) },
    extends: extendsArr,
    ...(plugins.length > 0 ? { plugins } : {}),
    parser: typescript ? '@typescript-eslint/parser' : undefined,
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ...(react ? { ecmaFeatures: { jsx: true } } : {}) },
    rules,
  };

  // Remove undefined keys
  if (!config.parser) delete config.parser;

  return { _engine: 'real', json: JSON.stringify(config, null, 2) };
}

// ---------------------------------------------------------------------------
// 8. gen-doc-markdown-table
// ---------------------------------------------------------------------------
async function genDocMarkdownTable(input) {
  const rows = input.rows || [];
  const align = input.align || 'left';
  if (rows.length === 0) return { _engine: 'real', markdown: '' };

  const headers = Object.keys(rows[0]);
  const alignChar = align === 'center' ? ':---:' : align === 'right' ? '---:' : ':---';

  const headerRow = '| ' + headers.join(' | ') + ' |';
  const separatorRow = '| ' + headers.map(() => alignChar).join(' | ') + ' |';
  const dataRows = rows.map(row =>
    '| ' + headers.map(h => String(row[h] !== undefined ? row[h] : '')).join(' | ') + ' |'
  );

  const markdown = [headerRow, separatorRow, ...dataRows].join('\n');
  return { _engine: 'real', markdown };
}

// ---------------------------------------------------------------------------
// 9. gen-doc-markdown-badges
// ---------------------------------------------------------------------------
async function genDocMarkdownBadges(input) {
  const badges = input.badges || [];
  const parts = badges.map(b => {
    const label = encodeURIComponent(b.label || '').replace(/-/g, '--');
    const value = encodeURIComponent(b.value || '').replace(/-/g, '--');
    const color = b.color || 'blue';
    const url = `https://img.shields.io/badge/${label}-${value}-${color}`;
    const alt = `${b.label}: ${b.value}`;
    const link = b.link ? `[![${alt}](${url})](${b.link})` : `![${alt}](${url})`;
    return link;
  });
  return { _engine: 'real', markdown: parts.join(' ') };
}

// ---------------------------------------------------------------------------
// 10. gen-doc-editorconfig
// ---------------------------------------------------------------------------
async function genDocEditorconfig(input) {
  const indent = input.indent || 'spaces';
  const size = input.size || 2;
  const eol = input.end_of_line || 'lf';

  const text = [
    '# EditorConfig: https://editorconfig.org',
    'root = true',
    '',
    '[*]',
    `indent_style = ${indent === 'tabs' ? 'tab' : 'space'}`,
    `indent_size = ${size}`,
    `end_of_line = ${eol}`,
    'charset = utf-8',
    'trim_trailing_whitespace = true',
    'insert_final_newline = true',
    '',
    '[*.md]',
    'trim_trailing_whitespace = false',
    '',
    '[Makefile]',
    'indent_style = tab',
  ].join('\n');

  return { _engine: 'real', text };
}

// ---------------------------------------------------------------------------
// 11. exec-javascript
// ---------------------------------------------------------------------------
async function execJavascript(input) {
  const code = input.code || '';
  const timeout = Math.min(parseInt(input.timeout, 10) || 5000, 120000); // Default 5s, user-configurable up to 120s

  const logs = [];
  const context = vm.createContext({
    console: {
      log: (...args) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      error: (...args) => logs.push('[error] ' + args.join(' ')),
      warn: (...args) => logs.push('[warn] ' + args.join(' ')),
    },
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Date,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    undefined,
    null: null,
    Infinity,
    NaN,
  });

  const start = Date.now();
  let result = undefined;
  let error = null;

  try {
    // Wrap in IIFE if code contains 'return' (bare return is invalid in script context)
    const wrapped = code.includes('return ') || code.includes('return;') ? `(function(){${code}})()` : code;
    const script = new vm.Script(wrapped, { filename: 'exec.js' });
    result = script.runInContext(context, { timeout });
    // Serialize if needed
    if (result !== undefined && typeof result === 'object') {
      try { result = JSON.parse(JSON.stringify(result)); } catch (_) { result = String(result); }
    }
  } catch (e) {
    error = e.message;
  }

  const execution_time_ms = Date.now() - start;
  return {
    _engine: 'real',
    result: result !== undefined ? result : null,
    stdout: logs.join('\n'),
    error,
    execution_time_ms,
  };
}

// ---------------------------------------------------------------------------
// 11b. exec-python
// FIX: execution_time_ms was set to Date.now() (epoch timestamp) not elapsed ms
// ---------------------------------------------------------------------------
async function execPython(input) {
  const { execFile } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  input = input || {};
  const code = input.code || input.script || null;
  const timeout = input.timeout;
  if (!code || typeof code !== 'string' || !code.trim()) {
    return { _engine: 'error', error: 'Missing required parameter: code (string). Pass { "code": "print(1+1)" }' };
  }
  // Guard against excessively large inputs that would cause timeouts
  const MAX_CODE_SIZE = 50000; // 50KB
  if (code.length > MAX_CODE_SIZE) {
    return { _engine: 'error', error: `Code too large (${code.length} chars). Maximum allowed: ${MAX_CODE_SIZE} characters.` };
  }

  // Block dangerous operations
  const blocked = ['os.environ', 'subprocess', 'socket', '__import__', 'eval(', 'exec(', 'open(', 'os.system', 'os.popen', 'shutil', 'pathlib', 'importlib', 'sys.modules', 'ctypes', 'compile(', 'breakpoint', 'os.walk', 'os.listdir', 'os.remove', 'os.rename', 'os.mkdir', 'signal', 'multiprocessing', 'threading'];
  const lowerCode = code.toLowerCase();
  for (const b of blocked) {
    if (lowerCode.includes(b.toLowerCase())) {
      return { _engine: 'real', error: `Blocked: '${b}' is not allowed in sandboxed execution`, blocked: true };
    }
  }

  const timeoutMs = Math.min(timeout || 10000, 30000); // max 30s
  const tmpFile = path.join(os.tmpdir(), 'slop-py-' + Date.now() + '.py');

  fs.writeFileSync(tmpFile, code);

  // BUG FIX: capture start time so execution_time_ms is elapsed ms, not epoch timestamp
  const execStart = Date.now();

  function tryExec(cmd) {
    return new Promise((resolve) => {
      execFile(cmd, [tmpFile], { timeout: timeoutMs, maxBuffer: 1024 * 512, env: { PATH: process.env.PATH, HOME: '/tmp', LANG: 'en_US.UTF-8' } }, (err, stdout, stderr) => {
        if (err && err.code === 'ENOENT') {
          resolve({ notFound: true });
          return;
        }
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        if (err && err.killed) {
          resolve({ _engine: 'real', error: 'Timeout exceeded', timeout_ms: timeoutMs });
        } else if (err) {
          resolve({ _engine: 'real', error: stderr || err.message, stdout: stdout || '', execution_time_ms: Date.now() - execStart });
        } else {
          // BUG FIX: was Date.now() (raw epoch), now correctly elapsed time
          resolve({ _engine: 'real', stdout: stdout.trim(), stderr: stderr.trim() || null, execution_time_ms: Date.now() - execStart });
        }
      });
    });
  }

  // Try python3 first, fall back to python for Windows compatibility
  let result = await tryExec('python3');
  if (result.notFound) {
    result = await tryExec('python');
    if (result.notFound) {
      try { fs.unlinkSync(tmpFile); } catch (e) {}
      return { _engine: 'real', error: 'Python interpreter not found (tried python3 and python)' };
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// SQL helpers for exec-sql-on-json
// ---------------------------------------------------------------------------
function parseSqlSelect(query) {
  // SELECT <fields> FROM data [WHERE <cond>] [GROUP BY <field>] [ORDER BY <field> [ASC|DESC]] [LIMIT <n>]
  const q = query.trim();

  const selectMatch = q.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+\w+/i);
  if (!selectMatch) return { error: 'Invalid SELECT query' };

  const fieldsRaw = selectMatch[1];

  // Parse WHERE
  const whereMatch = q.match(/WHERE\s+([\s\S]+?)(?:\s+GROUP BY|\s+ORDER BY|\s+LIMIT|$)/i);
  const whereClause = whereMatch ? whereMatch[1].trim() : null;

  // Parse GROUP BY
  const groupByMatch = q.match(/GROUP BY\s+([\w,\s]+?)(?:\s+ORDER BY|\s+LIMIT|$)/i);
  const groupBy = groupByMatch ? groupByMatch[1].trim().split(/\s*,\s*/) : null;

  // Parse ORDER BY
  const orderByMatch = q.match(/ORDER BY\s+(\w+)\s*(ASC|DESC)?/i);
  const orderBy = orderByMatch ? { field: orderByMatch[1], dir: (orderByMatch[2] || 'ASC').toUpperCase() } : null;

  // Parse LIMIT
  const limitMatch = q.match(/LIMIT\s+(\d+)/i);
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : null;

  return { fieldsRaw, whereClause, groupBy, orderBy, limit };
}

function evaluateWhere(row, whereClause) {
  if (!whereClause) return true;
  // Handle simple conditions: field op value [AND/OR field op value]
  // Split on AND/OR
  const andParts = whereClause.split(/\bAND\b/i);
  for (const part of andParts) {
    const orParts = part.split(/\bOR\b/i);
    const orResult = orParts.some(cond => evalSingleCond(row, cond.trim()));
    if (!orResult) return false;
  }
  return true;
}

function evalSingleCond(row, cond) {
  // field op value
  const m = cond.match(/^(\w+)\s*(>=|<=|!=|<>|>|<|=|LIKE|IN|IS NOT NULL|IS NULL)\s*(.*)$/i);
  if (!m) return true;
  const [, field, op, rawVal] = m;
  const rowVal = row[field];
  const opU = op.toUpperCase();

  if (opU === 'IS NULL') return rowVal === null || rowVal === undefined || rowVal === '';
  if (opU === 'IS NOT NULL') return rowVal !== null && rowVal !== undefined && rowVal !== '';

  let val = rawVal.trim().replace(/^['"]|['"]$/g, '');
  const numVal = parseFloat(val);
  const compVal = isNaN(numVal) ? val : numVal;
  const rowNum = parseFloat(rowVal);
  const rowComp = isNaN(rowNum) ? rowVal : rowNum;

  if (opU === '=' || opU === '==') return rowComp == compVal;
  if (opU === '!=' || opU === '<>') return rowComp != compVal;
  if (opU === '>') return rowComp > compVal;
  if (opU === '<') return rowComp < compVal;
  if (opU === '>=') return rowComp >= compVal;
  if (opU === '<=') return rowComp <= compVal;
  if (opU === 'LIKE') {
    const pattern = val.replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp(`^${pattern}$`, 'i').test(String(rowVal));
  }
  if (opU === 'IN') {
    const vals = rawVal.replace(/^\(|\)$/g, '').split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
    return vals.includes(String(rowVal));
  }

  return true;
}

function parseAggField(expr) {
  const m = expr.trim().match(/^(AVG|SUM|COUNT|MIN|MAX)\((\*|\w+)\)(?:\s+AS\s+(\w+))?$/i);
  if (m) return { agg: m[1].toUpperCase(), field: m[2], alias: m[3] || `${m[1].toLowerCase()}_${m[2]}` };
  const asM = expr.trim().match(/^(\w+)(?:\s+AS\s+(\w+))?$/i);
  if (asM) return { agg: null, field: asM[1], alias: asM[2] || asM[1] };
  return { agg: null, field: expr.trim(), alias: expr.trim() };
}

// ---------------------------------------------------------------------------
// 12. exec-sql-on-json
// ---------------------------------------------------------------------------
async function execSqlOnJson(input) {
  input = input || {};
  const data = input.data || input.rows || [];
  const query = input.query || input.sql || '';
  if (!query || typeof query !== 'string' || !query.trim()) {
    return { _engine: 'error', error: 'Missing required parameter: query (SQL string). Pass { "query": "SELECT * FROM data", "data": [...] }' };
  }
  if (!Array.isArray(data)) {
    return { _engine: 'error', error: 'Invalid parameter: data must be an array of objects. Pass { "query": "SELECT * FROM data", "data": [{"col": "val"}] }' };
  }
  if (data.length === 0) {
    return { _engine: 'real', results: [], row_count: 0, note: 'Empty data set provided' };
  }

  let fieldsRaw, whereClause, groupBy, orderBy, limit;
  try {
    const parsed = parseSqlSelect(query);
    if (parsed && parsed.error) {
      return { _engine: 'real', error: 'invalid_sql', message: parsed.error };
    }
    ({ fieldsRaw, whereClause, groupBy, orderBy, limit } = parsed);
  } catch (e) {
    return { _engine: 'real', error: 'invalid_sql', message: e.message };
  }

  // Parse field list
  const fieldDefs = fieldsRaw.split(',').map(f => parseAggField(f.trim()));
  const hasAgg = fieldDefs.some(f => f.agg !== null);

  // Filter rows
  let rows = data.filter(row => evaluateWhere(row, whereClause));

  let results;

  if (hasAgg && groupBy) {
    // GROUP BY aggregation
    const groups = {};
    for (const row of rows) {
      const key = groupBy.map(g => row[g]).join('|');
      if (!groups[key]) groups[key] = { _rows: [], _key: key };
      groups[key]._rows.push(row);
      for (const g of groupBy) groups[key][g] = row[g];
    }

    results = Object.values(groups).map(grp => {
      const out = {};
      for (const g of groupBy) out[g] = grp[g];
      for (const fd of fieldDefs) {
        if (fd.agg) {
          const vals = grp._rows.map(r => parseFloat(r[fd.field])).filter(v => !isNaN(v));
          if (fd.agg === 'COUNT') out[fd.alias] = fd.field === '*' ? grp._rows.length : vals.length;
          else if (fd.agg === 'SUM') out[fd.alias] = vals.reduce((s, v) => s + v, 0);
          else if (fd.agg === 'AVG') out[fd.alias] = vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(4) : null;
          else if (fd.agg === 'MIN') out[fd.alias] = vals.length ? Math.min(...vals) : null;
          else if (fd.agg === 'MAX') out[fd.alias] = vals.length ? Math.max(...vals) : null;
        } else if (!groupBy.includes(fd.field)) {
          out[fd.alias] = grp._rows[0][fd.field];
        }
      }
      return out;
    });
  } else if (hasAgg) {
    // Global aggregation
    const out = {};
    for (const fd of fieldDefs) {
      if (fd.agg) {
        const vals = rows.map(r => parseFloat(r[fd.field])).filter(v => !isNaN(v));
        if (fd.agg === 'COUNT') out[fd.alias] = fd.field === '*' ? rows.length : vals.length;
        else if (fd.agg === 'SUM') out[fd.alias] = vals.reduce((s, v) => s + v, 0);
        else if (fd.agg === 'AVG') out[fd.alias] = vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(4) : null;
        else if (fd.agg === 'MIN') out[fd.alias] = vals.length ? Math.min(...vals) : null;
        else if (fd.agg === 'MAX') out[fd.alias] = vals.length ? Math.max(...vals) : null;
      } else {
        out[fd.alias] = null;
      }
    }
    results = [out];
  } else {
    // Simple SELECT
    const isSelectAll = fieldsRaw.trim() === '*';
    results = rows.map(row => {
      if (isSelectAll) return row;
      const out = {};
      for (const fd of fieldDefs) out[fd.alias] = row[fd.field];
      return out;
    });
  }

  // ORDER BY
  if (orderBy) {
    results.sort((a, b) => {
      const av = a[orderBy.field], bv = b[orderBy.field];
      const dir = orderBy.dir === 'DESC' ? -1 : 1;
      if (av == null) return dir;
      if (bv == null) return -dir;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }

  // LIMIT
  if (limit !== null) results = results.slice(0, limit);

  const columns = results.length > 0 ? Object.keys(results[0]) : [];
  return { _engine: 'real', results, columns, count: results.length };
}

// ---------------------------------------------------------------------------
// 13. exec-filter-json
// FIX: validate inputs; guard against missing field/op/value; guard non-array data
// ---------------------------------------------------------------------------
async function execFilterJson(input) {
  const data = input.data || [];
  const where = input.where || input.filter || {};
  const original_count = Array.isArray(data) ? data.length : 0;

  // BUG FIX: data must be an array
  if (!Array.isArray(data)) {
    return { _engine: 'error', error: 'Invalid parameter: data must be an array of objects.' };
  }

  const { field, op, value } = where;

  // BUG FIX: return validation error when filter criteria is missing/incomplete
  if (!field || typeof field !== 'string') {
    return { _engine: 'error', error: 'Missing required filter field: where.field (string). Example: { "where": { "field": "age", "op": ">", "value": 18 } }' };
  }
  if (!op || typeof op !== 'string') {
    return { _engine: 'error', error: 'Missing required filter operator: where.op. Valid ops: >, <, >=, <=, ==, !=, contains, startsWith, endsWith' };
  }
  if (value === undefined || value === null) {
    return { _engine: 'error', error: 'Missing required filter value: where.value. Provide the value to compare against.' };
  }

  const results = data.filter(item => {
    const v = item[field];
    switch (op) {
      case '>': return parseFloat(v) > parseFloat(value);
      case '<': return parseFloat(v) < parseFloat(value);
      case '>=': return parseFloat(v) >= parseFloat(value);
      case '<=': return parseFloat(v) <= parseFloat(value);
      case '==': return String(v) === String(value);
      case '!=': return String(v) !== String(value);
      case 'contains': return String(v).includes(String(value));
      case 'startsWith': return String(v).startsWith(String(value));
      case 'endsWith': return String(v).endsWith(String(value));
      default: return true;
    }
  });

  return { _engine: 'real', results, count: results.length, original_count };
}

// ---------------------------------------------------------------------------
// 14. exec-sort-json
// FIX: validate that 'by' field is provided
// ---------------------------------------------------------------------------
async function execSortJson(input) {
  const data = input.data || [];
  const by = input.by || input.sort_by;
  const order = (input.order || 'asc').toLowerCase();

  // BUG FIX: require 'by' field
  if (!by || typeof by !== 'string') {
    return { _engine: 'error', error: 'Missing required parameter: by (field name to sort by). Example: { "data": [...], "by": "age", "order": "asc" }' };
  }
  if (!Array.isArray(data)) {
    return { _engine: 'error', error: 'Invalid parameter: data must be an array of objects.' };
  }

  const results = [...data].sort((a, b) => {
    const av = a[by], bv = b[by];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const dir = order === 'desc' ? -1 : 1;
    const na = parseFloat(av), nb = parseFloat(bv);
    if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
    return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
  });

  return { _engine: 'real', results, count: results.length };
}

// ---------------------------------------------------------------------------
// 15. exec-group-json
// FIX: validate that 'by' field is provided; guard non-array data
// ---------------------------------------------------------------------------
async function execGroupJson(input) {
  const data = input.data || [];
  const by = input.by;

  // BUG FIX: require 'by' field
  if (!by || typeof by !== 'string') {
    return { _engine: 'error', error: 'Missing required parameter: by (field name to group by). Example: { "data": [...], "by": "category" }' };
  }
  if (!Array.isArray(data)) {
    return { _engine: 'error', error: 'Invalid parameter: data must be an array of objects.' };
  }

  const groups = {};
  for (const item of data) {
    const key = String(item[by] !== undefined ? item[by] : '__undefined__');
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  return { _engine: 'real', groups, group_count: Object.keys(groups).length };
}

// ---------------------------------------------------------------------------
// 16. exec-map-json
// FIX: guard non-array data
// ---------------------------------------------------------------------------
async function execMapJson(input) {
  const data = input.data || [];
  const select = input.select || null;
  const rename = input.rename || {};

  // BUG FIX: data must be an array
  if (!Array.isArray(data)) {
    return { _engine: 'error', error: 'Invalid parameter: data must be an array of objects.' };
  }

  const results = data.map(item => {
    const fields = select || Object.keys(item);
    const out = {};
    for (const f of fields) {
      const newKey = rename[f] || f;
      out[newKey] = item[f];
    }
    return out;
  });

  return { _engine: 'real', results, count: results.length };
}

// ---------------------------------------------------------------------------
// 17. exec-reduce-json
// FIX: validate 'field' is provided
// ---------------------------------------------------------------------------
async function execReduceJson(input) {
  const data = input.data || [];
  const field = input.field;
  const operation = input.operation || 'sum';

  // BUG FIX: require 'field'
  if (!field || typeof field !== 'string') {
    return { _engine: 'error', error: 'Missing required parameter: field (field name to reduce). Example: { "data": [...], "field": "price", "operation": "sum" }' };
  }
  if (!Array.isArray(data)) {
    return { _engine: 'error', error: 'Invalid parameter: data must be an array of objects.' };
  }

  const nums = data.map(item => parseFloat(item[field])).filter(v => !isNaN(v));

  let result;
  switch (operation) {
    case 'sum':   result = nums.reduce((s, v) => s + v, 0); break;
    case 'avg':   result = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0; break;
    case 'min':   result = nums.length ? Math.min(...nums) : null; break;
    case 'max':   result = nums.length ? Math.max(...nums) : null; break;
    case 'count': result = data.length; break;
    default:      result = null;
  }

  return { _engine: 'real', result: typeof result === 'number' ? +result.toFixed(6) : result, field, operation };
}

// ---------------------------------------------------------------------------
// 18. exec-join-json
// FIX: validate 'on' is provided; guard non-array inputs
// ---------------------------------------------------------------------------
async function execJoinJson(input) {
  const left = input.left || [];
  const right = input.right || [];
  const on = input.on;
  const type = (input.type || 'inner').toLowerCase();

  // BUG FIX: require 'on' join key
  if (!on || typeof on !== 'string') {
    return { _engine: 'error', error: 'Missing required parameter: on (field name to join on). Example: { "left": [...], "right": [...], "on": "id", "type": "inner" }' };
  }
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return { _engine: 'error', error: 'Invalid parameter: left and right must be arrays of objects.' };
  }

  const rightMap = new Map();
  for (const r of right) {
    const key = String(r[on]);
    if (!rightMap.has(key)) rightMap.set(key, []);
    rightMap.get(key).push(r);
  }

  const results = [];
  for (const l of left) {
    const key = String(l[on]);
    const matches = rightMap.get(key) || [];
    if (matches.length > 0) {
      for (const r of matches) results.push({ ...l, ...r });
    } else if (type === 'left') {
      results.push({ ...l });
    }
  }

  return { _engine: 'real', results, count: results.length };
}

// ---------------------------------------------------------------------------
// 19. exec-unique-json
// ---------------------------------------------------------------------------
async function execUniqueJson(input) {
  const data = input.data || [];
  const by = input.by;

  if (!Array.isArray(data)) {
    return { _engine: 'error', error: 'Invalid parameter: data must be an array of objects.' };
  }

  const seen = new Set();
  const results = [];
  for (const item of data) {
    const key = by ? String(item[by]) : JSON.stringify(item);
    if (!seen.has(key)) { seen.add(key); results.push(item); }
  }

  return { _engine: 'real', results, count: results.length, duplicates_removed: data.length - results.length };
}

// ---------------------------------------------------------------------------
// 20. exec-jq
// FIX: guard undefined data input
// ---------------------------------------------------------------------------
async function execJq(input) {
  // BUG FIX: guard undefined data — was crashing with evalQuery on undefined ctx for non-identity queries
  const data = (input.data !== undefined) ? input.data : (input.json !== undefined ? input.json : null);
  const query = (input.query || input.filter || input.expression || '.').trim();

  // Evaluate jq-like expressions
  function evalQuery(q, ctx) {
    q = q.trim();

    // Pipeline: split on | (but not inside parens)
    const pipes = splitPipes(q);
    if (pipes.length > 1) {
      let current = ctx;
      for (const pipe of pipes) {
        const pipeExpr = pipe.trim();
        // If current context is an array, fan-out: apply next expr to each element
        // Exception: aggregate ops that take the whole array (length, add, min, max, sort, unique, keys, reverse, flatten, first, last)
        const aggregateOps = new Set(['length','add','min','max','sort','unique','keys','values','reverse','flatten','first','last','to_entries','from_entries','type','not']);
        if (Array.isArray(current) && !aggregateOps.has(pipeExpr) && !pipeExpr.startsWith('map(') && !pipeExpr.startsWith('.[') && pipeExpr !== '.[]') {
          const mapped = current.map(item => evalQuery(pipeExpr, item)).filter(v => v !== undefined);
          current = mapped;
        } else {
          current = evalQuery(pipeExpr, current);
        }
      }
      return current;
    }

    // Identity
    if (q === '.') return ctx;

    // keys
    if (q === 'keys') {
      if (Array.isArray(ctx)) return ctx.map((_, i) => i);
      return Object.keys(ctx || {});
    }

    // length
    if (q === 'length') {
      if (ctx == null) return 0;
      if (typeof ctx === 'string' || Array.isArray(ctx)) return ctx.length;
      return Object.keys(ctx).length;
    }

    // values
    if (q === 'values') {
      return Array.isArray(ctx) ? ctx : Object.values(ctx || {});
    }

    // to_entries
    if (q === 'to_entries') {
      return Object.entries(ctx || {}).map(([k, v]) => ({ key: k, value: v }));
    }

    // from_entries
    if (q === 'from_entries') {
      if (!Array.isArray(ctx)) return {};
      const out = {};
      for (const e of ctx) out[e.key || e.name] = e.value;
      return out;
    }

    // type
    if (q === 'type') {
      if (ctx === null) return 'null';
      if (Array.isArray(ctx)) return 'array';
      return typeof ctx;
    }

    // not
    if (q === 'not') return !ctx;

    // reverse
    if (q === 'reverse') {
      if (Array.isArray(ctx)) return [...ctx].reverse();
      if (typeof ctx === 'string') return ctx.split('').reverse().join('');
      return ctx;
    }

    // unique
    if (q === 'unique') {
      if (!Array.isArray(ctx)) return ctx;
      return [...new Set(ctx.map(JSON.stringify))].map(s => JSON.parse(s));
    }

    // flatten
    if (q === 'flatten') return Array.isArray(ctx) ? ctx.flat(Infinity) : ctx;

    // first / last
    if (q === 'first') return Array.isArray(ctx) ? ctx[0] : ctx;
    if (q === 'last') return Array.isArray(ctx) ? ctx[ctx.length - 1] : ctx;

    // add
    if (q === 'add') {
      if (!Array.isArray(ctx)) return ctx;
      if (ctx.length === 0) return null;
      if (typeof ctx[0] === 'number') return ctx.reduce((s, v) => s + v, 0);
      if (typeof ctx[0] === 'string') return ctx.join('');
      if (Array.isArray(ctx[0])) return ctx.flat(1);
      return ctx.reduce((acc, v) => ({ ...acc, ...v }), {});
    }

    // min / max / sort
    if (q === 'min') return Array.isArray(ctx) ? Math.min(...ctx) : ctx;
    if (q === 'max') return Array.isArray(ctx) ? Math.max(...ctx) : ctx;
    if (q === 'sort') return Array.isArray(ctx) ? [...ctx].sort() : ctx;

    // map(expr)
    const mapM = q.match(/^map\(([\s\S]+)\)$/);
    if (mapM && Array.isArray(ctx)) {
      return ctx.map(item => evalQuery(mapM[1], item));
    }

    // select(expr)
    const selM = q.match(/^select\(([\s\S]+)\)$/);
    if (selM) {
      return evalCondition(selM[1], ctx) ? ctx : undefined;
    }

    // has(key)
    const hasM = q.match(/^has\(["']?(\w+)["']?\)$/);
    if (hasM) {
      return ctx != null && hasM[1] in Object(ctx);
    }

    // in(obj) - skip, complex

    // contains(val) - skip, complex

    // .[] - iterate
    if (q === '.[]') {
      if (Array.isArray(ctx)) return ctx;
      return Object.values(ctx || {});
    }

    // .[].field... - iterate then access remaining
    const iterFieldM = q.match(/^\.\[\](.+)$/);
    if (iterFieldM) {
      const rest = iterFieldM[1];
      const items = Array.isArray(ctx) ? ctx : Object.values(ctx || {});
      return items.map(item => evalQuery('.' + rest.replace(/^\./, ''), item)).filter(v => v !== undefined);
    }

    // .[n]
    const idxM = q.match(/^\.\[(\d+)\]$/);
    if (idxM) return (ctx || [])[parseInt(idxM[1], 10)];

    // .[n:m]
    const sliceM = q.match(/^\.\[(\d*):(\d*)\]$/);
    if (sliceM) {
      const arr = Array.isArray(ctx) ? ctx : String(ctx);
      const s = sliceM[1] !== '' ? parseInt(sliceM[1], 10) : 0;
      const e = sliceM[2] !== '' ? parseInt(sliceM[2], 10) : arr.length;
      return arr.slice(s, e);
    }

    // .field[].rest - field access then iterate then continue
    const fieldIterM = q.match(/^\.(\w+)\[\](.*)$/);
    if (fieldIterM) {
      const field = fieldIterM[1];
      const rest = fieldIterM[2];
      const val = ctx != null ? ctx[field] : undefined;
      const items = Array.isArray(val) ? val : Object.values(val || {});
      if (!rest) return items;
      return items.map(item => evalQuery('.' + rest.replace(/^\./, ''), item)).filter(v => v !== undefined);
    }

    // .field.subfield... or .field
    const fieldM = q.match(/^\.(\w+)((?:\.[\w\[\]0-9]+)*)(.*)$/);
    if (fieldM) {
      const field = fieldM[1];
      const rest = fieldM[2] + fieldM[3];
      const val = ctx != null ? ctx[field] : undefined;
      return rest ? evalQuery('.' + rest.replace(/^\./, ''), val) : val;
    }

    // Literal string
    const strM = q.match(/^["'](.*)["']$/);
    if (strM) return strM[1];

    // Literal number
    const numM = q.match(/^-?\d+(\.\d+)?$/);
    if (numM) return parseFloat(q);

    // null/true/false
    if (q === 'null') return null;
    if (q === 'true') return true;
    if (q === 'false') return false;

    // Fallback – try as field access
    if (/^\w+$/.test(q) && ctx != null) return ctx[q];

    return undefined;
  }

  function evalCondition(expr, ctx) {
    expr = expr.trim();
    // comparison: lhs op rhs
    const cmpM = expr.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (cmpM) {
      const lv = evalQuery(cmpM[1].trim(), ctx);
      const rv = evalQuery(cmpM[3].trim(), ctx);
      switch (cmpM[2]) {
        case '==': return lv == rv;
        case '!=': return lv != rv;
        case '>':  return lv > rv;
        case '<':  return lv < rv;
        case '>=': return lv >= rv;
        case '<=': return lv <= rv;
      }
    }
    const v = evalQuery(expr, ctx);
    return v !== null && v !== undefined && v !== false;
  }

  function splitPipes(q) {
    const parts = [];
    let depth = 0, current = '';
    for (let i = 0; i < q.length; i++) {
      const ch = q[i];
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (ch === '|' && depth === 0) { parts.push(current); current = ''; continue; }
      current += ch;
    }
    if (current) parts.push(current);
    return parts;
  }

  let result;
  try {
    result = evalQuery(query, data);
    // If result contains undefined items (from select), filter them out of arrays
    if (Array.isArray(result)) result = result.filter(v => v !== undefined);
    if (result === undefined) result = null;
  } catch (e) {
    return { _engine: 'real', result: null, error: e.message };
  }

  return { _engine: 'real', result };
}

// ===========================================================================
// NEW FEATURES
// ===========================================================================

// ---------------------------------------------------------------------------
// Shared fake-data word banks (used across multiple new handlers)
// ---------------------------------------------------------------------------
const _FN = ['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William','Barbara','David','Susan','Richard','Jessica','Joseph','Sarah','Thomas','Karen','Charles','Lisa','Christopher','Nancy','Daniel','Betty','Matthew','Margaret','Anthony','Sandra','Mark','Ashley','Donald','Dorothy','Steven','Kimberly','Paul','Emily','Andrew','Donna','Joshua','Michelle','Kenneth','Carol','Kevin','Amanda','Brian','Melissa','George','Deborah','Timothy','Stephanie','Ronald','Rebecca','Edward','Sharon','Jason','Laura','Jeffrey','Cynthia','Ryan','Kathleen'];
const _LN = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts'];
const _CP1 = ['Acme','Apex','Blue','Bright','Core','Delta','Eagle','Fast','Global','Green','High','Iron','Key','Lite','Mega','Neo','Nova','Open','Peak','Prime','Quick','Red','Sharp','Smart','Solar','Star','Swift','Techno','Ultra','Velo','Wave','Zen'];
const _CP2 = ['Analytics','Bridge','Cloud','Corp','Digital','Dynamics','Edge','Engineering','Engines','Group','Hub','Inc','Innovations','Labs','Media','Networks','Partners','Pro','Sciences','Services','Solutions','Systems','Technologies','Ventures','Works'];
const _STREETS = ['Main','Oak','Pine','Maple','Cedar','Elm','Washington','Lake','Hill','Park','River','Sunset','Forest','Meadow','Valley','Highland','Ridge','Spring','Willow','Birch'];
const _STYPES = ['St','Ave','Blvd','Dr','Ln','Rd','Way','Ct','Pl','Terrace'];
const _CITIES = ['Springfield','Riverside','Fairview','Madison','Georgetown','Franklin','Bristol','Clinton','Greenville','Salem','Burlington','Arlington','Manchester','Lexington','Oakland'];
const _STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const _DOMAINS = ['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','protonmail.com','fastmail.com','example.com'];
const _TLDS = ['com','net','org','io','co','app','dev'];
const _INDUSTRIES = ['Technology','Healthcare','Finance','Retail','Manufacturing','Education','Entertainment','Transportation','Energy','Consulting'];
const _LOREM_WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip commodo consequat duis aute irure reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim est laborum'.split(' ');

function _rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function _rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function _rndBytes(n) { return crypto.randomBytes(n); }

// ---------------------------------------------------------------------------
// 21. gen-fake-user — realistic fake user profile (sample/test data)
// Clearly labeled as SAMPLE DATA — not real PII
// ---------------------------------------------------------------------------
async function genFakeUser(input) {
  input = input || {};
  const count = Math.min(parseInt(input.count, 10) || 1, 100);
  const locale = input.locale || 'en-US';

  function makeUser(index) {
    const first = _rnd(_FN);
    const last = _rnd(_LN);
    const full = `${first} ${last}`;
    const slug = (first + '.' + last + _rndInt(1, 999)).toLowerCase();
    const email = slug + '@' + _rnd(_DOMAINS);
    const streetNum = _rndInt(100, 9999);
    const street = `${_rnd(_STREETS)} ${_rnd(_STYPES)}`;
    const city = _rnd(_CITIES);
    const state = _rnd(_STATES);
    const zip = String(_rndInt(10000, 99999));
    const dobYear = _rndInt(1950, 2005);
    const dobMonth = String(_rndInt(1, 12)).padStart(2, '0');
    const dobDay = String(_rndInt(1, 28)).padStart(2, '0');
    const id = crypto.randomUUID();
    // Deterministic color from name hash for avatar
    const hash = crypto.createHash('md5').update(full).digest('hex');
    const bg = '#' + hash.slice(0, 6);
    const initials = first[0] + last[0];

    return {
      id,
      firstName: first,
      lastName: last,
      fullName: full,
      email,
      username: slug,
      dateOfBirth: `${dobYear}-${dobMonth}-${dobDay}`,
      phone: `+1-${_rndInt(200,999)}-${_rndInt(200,999)}-${_rndInt(1000,9999)}`,
      address: {
        street: `${streetNum} ${street}`,
        city,
        state,
        zip,
        country: 'US',
        full: `${streetNum} ${street}, ${city}, ${state} ${zip}, US`,
      },
      avatar: {
        initials,
        bg,
        url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(full)}&backgroundColor=${bg.slice(1)}`,
      },
      _sample: true,
      _note: 'SAMPLE DATA — not a real person',
    };
  }

  if (count === 1) {
    return { _engine: 'real', ...makeUser(0) };
  }
  return { _engine: 'real', users: Array.from({ length: count }, (_, i) => makeUser(i)), count };
}

// ---------------------------------------------------------------------------
// 22. gen-fake-company — realistic fake company profile (sample/test data)
// ---------------------------------------------------------------------------
async function genFakeCompany(input) {
  input = input || {};
  const count = Math.min(parseInt(input.count, 10) || 1, 100);

  function makeCompany() {
    const name = `${_rnd(_CP1)} ${_rnd(_CP2)}`;
    const industry = _rnd(_INDUSTRIES);
    const tld = _rnd(_TLDS);
    const domainSlug = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
    const domain = `${domainSlug}.${tld}`;
    const founded = _rndInt(1980, 2023);
    const employees = _rnd([5, 12, 25, 50, 120, 250, 500, 1200, 5000, 20000]);
    const streetNum = _rndInt(100, 9999);
    const street = `${_rnd(_STREETS)} ${_rnd(_STYPES)}`;
    const city = _rnd(_CITIES);
    const state = _rnd(_STATES);
    const zip = String(_rndInt(10000, 99999));
    const ceo = `${_rnd(_FN)} ${_rnd(_LN)}`;
    const ticker = name.split(' ').map(w => w[0]).join('').slice(0, 4).toUpperCase();
    const id = crypto.randomUUID();

    return {
      id,
      name,
      industry,
      domain,
      email: `contact@${domain}`,
      website: `https://www.${domain}`,
      founded,
      employees,
      ceo,
      ticker,
      address: {
        street: `${streetNum} ${street}`,
        city,
        state,
        zip,
        country: 'US',
        full: `${streetNum} ${street}, ${city}, ${state} ${zip}, US`,
      },
      _sample: true,
      _note: 'SAMPLE DATA — not a real company',
    };
  }

  if (count === 1) {
    return { _engine: 'real', ...makeCompany() };
  }
  return { _engine: 'real', companies: Array.from({ length: count }, makeCompany), count };
}

// ---------------------------------------------------------------------------
// 23. gen-test-credit-card — Luhn-valid test card numbers
// CLEARLY labeled as TEST DATA only — follows standard test card conventions
// ---------------------------------------------------------------------------
async function genTestCreditCard(input) {
  input = input || {};
  const brand = (input.brand || 'visa').toLowerCase();
  const count = Math.min(parseInt(input.count, 10) || 1, 20);

  // Standard test card prefixes (same as Stripe/PayPal test docs)
  const brandConfig = {
    visa:       { prefix: '4', length: 16, name: 'Visa' },
    mastercard: { prefix: '5', length: 16, name: 'Mastercard' },
    amex:       { prefix: '3', length: 15, name: 'American Express' },
    discover:   { prefix: '6011', length: 16, name: 'Discover' },
    jcb:        { prefix: '3530', length: 16, name: 'JCB' },
  };
  const cfg = brandConfig[brand] || brandConfig.visa;

  function luhnComplete(partial) {
    // BUG FIX: double every second digit from right of partial (rightmost digit of partial
    // will be at position 1 from right in the full number, so it gets doubled)
    const digits = partial.split('').map(Number).reverse();
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let x = digits[i];
      if (i % 2 === 0) { x *= 2; if (x > 9) x -= 9; }
      sum += x;
    }
    const check = (10 - (sum % 10)) % 10;
    return partial + check;
  }

  function makeCard() {
    const remaining = cfg.length - cfg.prefix.length - 1;
    const mid = Array.from({ length: remaining }, () => _rndInt(0, 9)).join('');
    const partial = cfg.prefix + mid;
    const number = luhnComplete(partial);
    // Format for display
    const formatted = cfg.length === 15
      ? `${number.slice(0,4)} ${number.slice(4,10)} ${number.slice(10)}`
      : `${number.slice(0,4)} ${number.slice(4,8)} ${number.slice(8,12)} ${number.slice(12)}`;
    const expMonth = String(_rndInt(1, 12)).padStart(2, '0');
    const expYear = new Date().getFullYear() + _rndInt(1, 5);
    const cvv = cfg.length === 15
      ? String(_rndInt(100, 9999)).padStart(4, '0')
      : String(_rndInt(100, 999)).padStart(3, '0');

    return {
      brand: cfg.name,
      number,
      formatted,
      expMonth,
      expYear: String(expYear),
      expiry: `${expMonth}/${String(expYear).slice(-2)}`,
      cvv,
      _test: true,
      _warning: 'TEST DATA ONLY — do not use for real transactions. Luhn-valid for testing payment form validation only.',
    };
  }

  if (count === 1) {
    return { _engine: 'real', ...makeCard() };
  }
  return { _engine: 'real', cards: Array.from({ length: count }, makeCard), count };
}

// ---------------------------------------------------------------------------
// 24. gen-lorem-ipsum — configurable lorem ipsum text generator
// Aliases: paragraphs, sentences, words modes
// ---------------------------------------------------------------------------
async function genLoremIpsum(input) {
  input = input || {};
  const mode = input.mode || input.type || 'paragraphs';
  const count = Math.min(parseInt(input.count || input.paragraphs || input.sentences || input.words, 10) || 3, 200);
  const wordsPerSentence = input.words_per_sentence || input.wordsPerSentence || null; // null = random 8-16
  const sentencesPerParagraph = input.sentences_per_paragraph || input.sentencesPerParagraph || null; // null = random 4-8
  const startWithLorem = input.start_with_lorem !== false; // default true

  function makeWord() { return _rnd(_LOREM_WORDS); }

  function makeSentence(wordCount) {
    const n = wordCount || _rndInt(8, 16);
    const words = Array.from({ length: n }, makeWord);
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    return words.join(' ') + '.';
  }

  function makeParagraph(sentenceCount) {
    const n = sentenceCount || _rndInt(4, 8);
    return Array.from({ length: n }, () => makeSentence(wordsPerSentence)).join(' ');
  }

  let text, items;

  if (mode === 'words') {
    const words = Array.from({ length: count }, makeWord);
    if (startWithLorem && words.length >= 2) { words[0] = 'Lorem'; words[1] = 'ipsum'; }
    text = words.join(' ');
    items = words;
  } else if (mode === 'sentences') {
    items = Array.from({ length: count }, () => makeSentence(wordsPerSentence));
    if (startWithLorem) items[0] = 'Lorem ipsum ' + items[0].charAt(0).toLowerCase() + items[0].slice(1);
    text = items.join(' ');
  } else {
    // paragraphs (default)
    items = Array.from({ length: count }, () => makeParagraph(sentencesPerParagraph));
    if (startWithLorem) items[0] = 'Lorem ipsum ' + items[0].charAt(0).toLowerCase() + items[0].slice(1);
    text = items.join('\n\n');
  }

  return {
    _engine: 'real',
    text,
    [mode]: items,
    count,
    word_count: text.split(/\s+/).length,
    char_count: text.length,
  };
}

// ---------------------------------------------------------------------------
// 25. gen-color-palette — n accessible colors with hex/rgb/hsl
// Generates a harmonious palette from a base hue with WCAG contrast check
// ---------------------------------------------------------------------------
async function genColorPalette(input) {
  input = input || {};
  const n = Math.min(parseInt(input.n || input.count || input.colors, 10) || 5, 20);
  const scheme = input.scheme || 'analogous'; // analogous | complementary | triadic | tetradic | monochromatic | random
  const baseHex = input.base || input.color || null;

  function hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
  }

  function hslToRgb(h, s, l) {
    const hex = hslToHex(h, s, l);
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  function luminance(r, g, b) {
    const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrastRatio(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const L = luminance(r, g, b);
    const whiteLum = 1, blackLum = 0;
    const wcW = (whiteLum + 0.05) / (L + 0.05);
    const wcB = (L + 0.05) / (blackLum + 0.05);
    return { onWhite: +wcW.toFixed(2), onBlack: +wcB.toFixed(2), bestText: wcW >= wcB ? '#000000' : '#ffffff' };
  }

  // Determine base hue
  let baseH, baseS, baseL;
  if (baseHex && /^#[0-9a-fA-F]{6}$/.test(baseHex)) {
    const hsl = hexToHsl(baseHex);
    baseH = hsl.h; baseS = hsl.s; baseL = hsl.l;
  } else {
    baseH = _rndInt(0, 359);
    baseS = _rndInt(50, 80);
    baseL = _rndInt(40, 60);
  }

  // Generate hue angles based on scheme
  let hues;
  if (scheme === 'complementary') {
    hues = [baseH, (baseH + 180) % 360];
  } else if (scheme === 'triadic') {
    hues = [baseH, (baseH + 120) % 360, (baseH + 240) % 360];
  } else if (scheme === 'tetradic') {
    hues = [baseH, (baseH + 90) % 360, (baseH + 180) % 360, (baseH + 270) % 360];
  } else if (scheme === 'monochromatic') {
    hues = Array.from({ length: n }, (_, i) => baseH);
  } else if (scheme === 'random') {
    hues = Array.from({ length: n }, () => _rndInt(0, 359));
  } else {
    // analogous (default): evenly spaced within 60 degrees
    const spread = Math.min(60, 360 / n);
    hues = Array.from({ length: n }, (_, i) => (baseH + (i - Math.floor(n / 2)) * spread + 360) % 360);
  }

  // Expand to n colors
  const palette = Array.from({ length: n }, (_, i) => {
    const h = hues[i % hues.length];
    const s = scheme === 'monochromatic'
      ? Math.max(20, Math.min(90, baseS + (i - Math.floor(n / 2)) * 10))
      : baseS + _rndInt(-10, 10);
    const l = scheme === 'monochromatic'
      ? Math.max(20, Math.min(80, 30 + i * (50 / Math.max(n - 1, 1))))
      : baseL + _rndInt(-10, 10);
    const hs = Math.max(10, Math.min(95, s));
    const hl = Math.max(15, Math.min(85, l));
    const hex = hslToHex(h, hs, hl);
    const rgb = hslToRgb(h, hs, hl);
    const contrast = contrastRatio(hex);
    return {
      hex,
      rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      rgb_values: rgb,
      hsl: `hsl(${h}, ${hs}%, ${hl}%)`,
      hsl_values: { h, s: hs, l: hl },
      contrast_on_white: contrast.onWhite,
      contrast_on_black: contrast.onBlack,
      accessible_text: contrast.bestText,
      wcag_aa: contrast.onWhite >= 4.5 || contrast.onBlack >= 4.5,
    };
  });

  return {
    _engine: 'real',
    palette,
    count: palette.length,
    scheme,
    base_hue: baseH,
    css_vars: palette.map((c, i) => `--color-${i + 1}: ${c.hex};`).join('\n'),
  };
}

// ---------------------------------------------------------------------------
// 26. gen-avatar-svg — SVG avatar from initials with deterministic bg color
// Supports: name, initials, bg, fg, size, shape (circle|square|rounded)
// ---------------------------------------------------------------------------
async function genAvatarSvg(input) {
  input = input || {};
  const name = input.name || input.text || 'User';
  const size = Math.min(parseInt(input.size, 10) || 128, 512);
  const shape = input.shape || 'circle'; // circle | square | rounded
  const fontSize = Math.round(size * 0.4);

  // Derive initials
  let initials = input.initials;
  if (!initials) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else {
      initials = name.slice(0, 2).toUpperCase();
    }
  }
  initials = initials.slice(0, 2).toUpperCase();

  // Determine bg — deterministic from name if not provided
  let bg = input.bg || input.background || input.backgroundColor;
  if (!bg) {
    const hash = crypto.createHash('md5').update(name).digest('hex');
    // Use a saturated color from hash
    const h = parseInt(hash.slice(0, 2), 16) * 360 / 255;
    const s = 55 + parseInt(hash.slice(2, 4), 16) % 25; // 55-80%
    const l = 40 + parseInt(hash.slice(4, 6), 16) % 20; // 40-60%
    bg = `hsl(${Math.round(h)},${s}%,${l}%)`;
  }

  // Determine fg — auto contrast
  let fg = input.fg || input.color || input.foreground;
  if (!fg) {
    // Simple luminance check: use white for dark bg, black for light bg
    if (bg.startsWith('#')) {
      const r = parseInt(bg.slice(1, 3), 16);
      const g = parseInt(bg.slice(3, 5), 16);
      const b = parseInt(bg.slice(5, 7), 16);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      fg = lum > 0.5 ? '#000000' : '#ffffff';
    } else {
      fg = '#ffffff'; // default white text for hsl colors
    }
  }

  // Shape clip
  let clipPath;
  if (shape === 'circle') {
    clipPath = `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" />`;
  } else if (shape === 'rounded') {
    const r = Math.round(size * 0.2);
    clipPath = `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" />`;
  } else {
    clipPath = `<rect width="${size}" height="${size}" />`;
  }

  const bgShape = shape === 'circle'
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${bg}" />`
    : shape === 'rounded'
      ? `<rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" ry="${Math.round(size * 0.2)}" fill="${bg}" />`
      : `<rect width="${size}" height="${size}" fill="${bg}" />`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bgShape}
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle" dominant-baseline="middle"
    font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    font-size="${fontSize}" font-weight="600" fill="${fg}">${initials}</text>
</svg>`;

  return {
    _engine: 'real',
    svg,
    initials,
    bg,
    fg,
    size,
    shape,
    data_uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  };
}

// ---------------------------------------------------------------------------
// 27. gen-mock-api-response — generate realistic mock JSON for a given schema
// schema: object with field: type pairs (string|number|boolean|array|object|uuid|email|name|date|url|phone)
// ---------------------------------------------------------------------------
async function genMockApiResponse(input) {
  input = input || {};
  const schema = input.schema || input.fields || {};
  const count = Math.min(parseInt(input.count, 10) || 1, 100);
  const wrapKey = input.wrap || input.key || null; // e.g. "data" -> { data: [...] }
  const includeMetadata = input.meta !== false;

  if (typeof schema !== 'object' || Array.isArray(schema)) {
    return { _engine: 'error', error: 'Invalid parameter: schema must be an object mapping field names to types. Example: { "schema": { "id": "uuid", "name": "name", "age": "number", "active": "boolean" } }' };
  }

  function generateValue(type, fieldName) {
    const t = (type || 'string').toLowerCase().trim();
    switch (t) {
      case 'uuid':       return crypto.randomUUID();
      case 'id':         return crypto.randomUUID();
      case 'name':       return `${_rnd(_FN)} ${_rnd(_LN)}`;
      case 'firstname':
      case 'first_name': return _rnd(_FN);
      case 'lastname':
      case 'last_name':  return _rnd(_LN);
      case 'email':      return (_rnd(_FN) + '.' + _rnd(_LN) + _rndInt(1, 99) + '@' + _rnd(_DOMAINS)).toLowerCase();
      case 'phone':      return `+1-${_rndInt(200,999)}-${_rndInt(200,999)}-${_rndInt(1000,9999)}`;
      case 'url':        return `https://${_rnd(_CP1).toLowerCase()}${_rnd(_CP2).toLowerCase()}.${_rnd(_TLDS)}`;
      case 'image':
      case 'avatar':     return `https://picsum.photos/seed/${_rndInt(1,1000)}/200/200`;
      case 'date':       return new Date(_rndInt(2018, 2026), _rndInt(0, 11), _rndInt(1, 28)).toISOString().slice(0, 10);
      case 'datetime':   return new Date(_rndInt(Date.now() - 1e11, Date.now())).toISOString();
      case 'timestamp':  return _rndInt(1577836800, 1735689600);
      case 'number':
      case 'float':      return +(_rndInt(0, 10000) + Math.random()).toFixed(2);
      case 'int':
      case 'integer':    return _rndInt(0, 10000);
      case 'boolean':
      case 'bool':       return Math.random() > 0.5;
      case 'string':     return _rnd(_LOREM_WORDS).charAt(0).toUpperCase() + _rnd(_LOREM_WORDS).slice(1) + ' ' + _rnd(_LOREM_WORDS);
      case 'text':       return Array.from({ length: _rndInt(3, 8) }, () => _rnd(_LOREM_WORDS)).join(' ');
      case 'address':    return `${_rndInt(100,9999)} ${_rnd(_STREETS)} ${_rnd(_STYPES)}, ${_rnd(_CITIES)}, ${_rnd(_STATES)} ${_rndInt(10000,99999)}`;
      case 'company':    return `${_rnd(_CP1)} ${_rnd(_CP2)}`;
      case 'array':      return Array.from({ length: _rndInt(1, 5) }, () => _rndInt(1, 100));
      case 'object':     return { id: crypto.randomUUID(), value: _rndInt(1, 100) };
      case 'null':       return null;
      default: {
        // Try to infer from field name
        const fn = fieldName.toLowerCase();
        if (fn.includes('id')) return crypto.randomUUID();
        if (fn.includes('email')) return (_rnd(_FN) + '@' + _rnd(_DOMAINS)).toLowerCase();
        if (fn.includes('name')) return `${_rnd(_FN)} ${_rnd(_LN)}`;
        if (fn.includes('phone')) return `+1-${_rndInt(200,999)}-${_rndInt(200,999)}-${_rndInt(1000,9999)}`;
        if (fn.includes('url') || fn.includes('image') || fn.includes('avatar')) return `https://example.com/${fn}`;
        if (fn.includes('date') || fn.includes('time')) return new Date().toISOString();
        if (fn.includes('count') || fn.includes('age') || fn.includes('price') || fn.includes('amount')) return _rndInt(1, 1000);
        if (fn.includes('active') || fn.includes('enabled') || fn.includes('verified')) return Math.random() > 0.3;
        return _rnd(_LOREM_WORDS);
      }
    }
  }

  function generateRecord() {
    const record = {};
    for (const [field, type] of Object.entries(schema)) {
      record[field] = generateValue(type, field);
    }
    return record;
  }

  const records = Array.from({ length: count }, generateRecord);
  const result = count === 1 ? records[0] : records;

  let response;
  if (wrapKey) {
    response = { [wrapKey]: result };
    if (includeMetadata && count > 1) {
      response.total = count;
      response.page = 1;
      response.per_page = count;
    }
  } else {
    response = result;
  }

  if (includeMetadata && !wrapKey) {
    return { _engine: 'real', data: response, count, schema_fields: Object.keys(schema) };
  }
  return { _engine: 'real', data: response, count, schema_fields: Object.keys(schema) };
}

// ---------------------------------------------------------------------------
// 28. gen-test-data — generate arrays of fake records from a template
// template: object with field: { type, min, max, values, format } pairs
// ---------------------------------------------------------------------------
async function genTestData(input) {
  input = input || {};
  const template = input.template || input.schema || input.fields || {};
  const count = Math.min(parseInt(input.count || input.rows || input.n, 10) || 10, 1000);
  const format = (input.format || 'array').toLowerCase(); // array | csv | ndjson

  if (typeof template !== 'object' || Array.isArray(template)) {
    return { _engine: 'error', error: 'Invalid parameter: template must be an object. Example: { "template": { "id": { "type": "sequence" }, "name": { "type": "name" }, "score": { "type": "int", "min": 0, "max": 100 } }, "count": 50 }' };
  }

  function generateField(fieldSpec, index) {
    if (typeof fieldSpec === 'string') {
      // Simple type string shorthand
      fieldSpec = { type: fieldSpec };
    }
    const { type = 'string', min, max, values, prefix = '', suffix = '', format: fmt } = fieldSpec;
    const t = type.toLowerCase();

    // Enum/values selection
    if (values && Array.isArray(values) && values.length > 0) {
      return _rnd(values);
    }

    switch (t) {
      case 'sequence':
      case 'index':
      case 'rownum':
        return (min || 1) + index;
      case 'uuid':        return crypto.randomUUID();
      case 'name':        return `${_rnd(_FN)} ${_rnd(_LN)}`;
      case 'first_name':
      case 'firstname':   return _rnd(_FN);
      case 'last_name':
      case 'lastname':    return _rnd(_LN);
      case 'email':       return (_rnd(_FN) + '.' + _rnd(_LN) + _rndInt(1, 99) + '@' + _rnd(_DOMAINS)).toLowerCase();
      case 'phone':       return `+1-${_rndInt(200,999)}-${_rndInt(200,999)}-${_rndInt(1000,9999)}`;
      case 'company':     return `${_rnd(_CP1)} ${_rnd(_CP2)}`;
      case 'address':     return `${_rndInt(100,9999)} ${_rnd(_STREETS)} ${_rnd(_STYPES)}, ${_rnd(_CITIES)}, ${_rnd(_STATES)}`;
      case 'city':        return _rnd(_CITIES);
      case 'state':       return _rnd(_STATES);
      case 'zip':         return String(_rndInt(10000, 99999));
      case 'country':     return 'US';
      case 'url':         return `https://${_rnd(_CP1).toLowerCase()}.${_rnd(_TLDS)}`;
      case 'int':
      case 'integer': {
        const lo = min !== undefined ? min : 0;
        const hi = max !== undefined ? max : 1000;
        return _rndInt(lo, hi);
      }
      case 'float':
      case 'number':
      case 'decimal': {
        const lo = min !== undefined ? min : 0;
        const hi = max !== undefined ? max : 1000;
        const precision = fieldSpec.precision || 2;
        return +(lo + Math.random() * (hi - lo)).toFixed(precision);
      }
      case 'boolean':
      case 'bool': {
        const p = fieldSpec.probability !== undefined ? fieldSpec.probability : 0.5;
        return Math.random() < p;
      }
      case 'date': {
        const from = min || '2020-01-01';
        const to = max || new Date().toISOString().slice(0, 10);
        const s = new Date(from).getTime(), e = new Date(to).getTime();
        const d = new Date(s + Math.random() * (e - s));
        return d.toISOString().slice(0, 10);
      }
      case 'datetime': {
        const from = min ? new Date(min).getTime() : Date.now() - 1e11;
        const to = max ? new Date(max).getTime() : Date.now();
        return new Date(from + Math.random() * (to - from)).toISOString();
      }
      case 'timestamp': {
        const lo = min || 1577836800;
        const hi = max || 1735689600;
        return _rndInt(lo, hi);
      }
      case 'lorem':
      case 'text': {
        const words = min || 5;
        return Array.from({ length: _rndInt(words, max || words * 2) }, () => _rnd(_LOREM_WORDS)).join(' ');
      }
      case 'word':
      case 'string':
      default:
        return prefix + _rnd(_LOREM_WORDS) + suffix;
    }
  }

  function generateRecord(index) {
    const record = {};
    for (const [field, spec] of Object.entries(template)) {
      record[field] = generateField(spec, index);
    }
    return record;
  }

  const records = Array.from({ length: count }, (_, i) => generateRecord(i));

  if (format === 'csv') {
    const headers = Object.keys(template);
    const csvRows = [
      headers.join(','),
      ...records.map(r => headers.map(h => {
        const v = r[h];
        const s = String(v === null || v === undefined ? '' : v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')),
    ];
    return { _engine: 'real', csv: csvRows.join('\n'), count, columns: headers };
  }

  if (format === 'ndjson') {
    const ndjson = records.map(r => JSON.stringify(r)).join('\n');
    return { _engine: 'real', ndjson, count };
  }

  return { _engine: 'real', records, count, columns: Object.keys(template) };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  'gen-doc-readme-template':  genDocReadmeTemplate,
  'gen-doc-license':          genDocLicense,
  'gen-doc-docker-compose':   genDocDockerCompose,
  'gen-doc-github-action':    genDocGithubAction,
  'gen-doc-env-template':     genDocEnvTemplate,
  'gen-doc-tsconfig':         genDocTsconfig,
  'gen-doc-eslint-config':    genDocEslintConfig,
  'gen-doc-markdown-table':   genDocMarkdownTable,
  'gen-doc-markdown-badges':  genDocMarkdownBadges,
  'gen-doc-editorconfig':     genDocEditorconfig,
  'exec-javascript':          execJavascript,
  'exec-python':              execPython,
  'exec-sql-on-json':         execSqlOnJson,
  'exec-filter-json':         execFilterJson,
  'exec-sort-json':           execSortJson,
  'exec-group-json':          execGroupJson,
  'exec-map-json':            execMapJson,
  'exec-reduce-json':         execReduceJson,
  'exec-join-json':           execJoinJson,
  'exec-unique-json':         execUniqueJson,
  'exec-jq':                  execJq,
  // New handlers
  'gen-fake-user':            genFakeUser,
  'gen-fake-user-profile':    genFakeUser,       // alias
  'gen-fake-company-full':    genFakeCompany,
  'gen-fake-company-profile': genFakeCompany,    // alias
  'gen-test-credit-card':     genTestCreditCard,
  'gen-lorem-ipsum':          genLoremIpsum,
  'gen-lorem-ipsum-text':     genLoremIpsum,     // alias
  'gen-color-palette-hsl':    genColorPalette,
  'gen-accessible-palette':   genColorPalette,   // alias
  'gen-avatar-svg-initials':  genAvatarSvg,
  'gen-mock-api-response':    genMockApiResponse,
  'gen-mock-api':             genMockApiResponse, // alias
  'gen-test-data':            genTestData,
  'gen-test-dataset':         genTestData,       // alias
};
