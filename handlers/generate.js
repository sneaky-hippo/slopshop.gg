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
// ---------------------------------------------------------------------------
async function genDocDockerCompose(input) {
  const services = input.services || [];

  const lines = ['version: "3.9"', 'services:'];
  for (const svc of services) {
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
    const script = new vm.Script(code, { filename: 'exec.js' });
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
// ---------------------------------------------------------------------------
async function execPython(input) {
  const { execFile } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const { code, timeout } = input;
  if (!code) return { _engine: 'real', error: 'No code provided' };

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
          resolve({ _engine: 'real', error: stderr || err.message, stdout: stdout || '' });
        } else {
          resolve({ _engine: 'real', stdout: stdout.trim(), stderr: stderr.trim() || null, execution_time_ms: Date.now() });
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
  if (!selectMatch) throw new Error('Invalid SELECT query');

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
  const data = input.data || [];
  const query = input.query || '';
  if (!Array.isArray(data)) throw new Error('data must be an array');

  const { fieldsRaw, whereClause, groupBy, orderBy, limit } = parseSqlSelect(query);

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
// ---------------------------------------------------------------------------
async function execFilterJson(input) {
  const data = input.data || [];
  const where = input.where || {};
  const original_count = data.length;

  const { field, op, value } = where;

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
// ---------------------------------------------------------------------------
async function execSortJson(input) {
  const data = input.data || [];
  const by = input.by;
  const order = (input.order || 'asc').toLowerCase();

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
// ---------------------------------------------------------------------------
async function execGroupJson(input) {
  const data = input.data || [];
  const by = input.by;

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
// ---------------------------------------------------------------------------
async function execMapJson(input) {
  const data = input.data || [];
  const select = input.select || null;
  const rename = input.rename || {};

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
// ---------------------------------------------------------------------------
async function execReduceJson(input) {
  const data = input.data || [];
  const field = input.field;
  const operation = input.operation || 'sum';

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
// ---------------------------------------------------------------------------
async function execJoinJson(input) {
  const left = input.left || [];
  const right = input.right || [];
  const on = input.on;
  const type = (input.type || 'inner').toLowerCase();

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
// ---------------------------------------------------------------------------
async function execJq(input) {
  const data = input.data;
  const query = (input.query || '.').trim();

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
};
