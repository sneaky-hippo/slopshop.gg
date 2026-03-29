import json

endpoints = []
with open('/tmp/endpoints_400_800.jsonl') as f:
    for line in f:
        endpoints.append(json.loads(line.strip()))

H = {}

# compute.js - real
for s in ['gen-jwt-decode','gen-base64-encode','gen-base64-decode','gen-url-encode','gen-url-decode','gen-html-escape']:
    H[s] = ('compute.js','REAL: Built-in encode/decode','Encoded/decoded string','')
for s in ['analyze-readability','analyze-sentiment-simple','analyze-keywords','analyze-language-detect','analyze-url-parts','analyze-json-paths','analyze-duplicates','analyze-outliers','analyze-frequency','analyze-string-similarity','analyze-email-parts','analyze-ip-type','analyze-cron','analyze-password-strength','analyze-color']:
    H[s] = ('compute.js','REAL: Deterministic analysis algorithm','Analysis result','')
for s in ['text-extract-json','text-extract-code','text-extract-tables','text-extract-links','text-split-sentences','text-split-paragraphs','text-to-markdown-table']:
    H[s] = ('compute.js','REAL: Regex/string parsing','Extracted data','')
for s in ['format-currency','format-number','format-date','format-bytes','format-duration','format-phone']:
    H[s] = ('compute.js','REAL: Intl.NumberFormat/Date formatting','Formatted string','')
for s in ['logic-if','logic-switch','logic-coalesce']:
    H[s] = ('compute.js','REAL: Conditional evaluation','Computed value','')
for s in ['data-group-by','data-sort-by','data-unique','data-chunk','data-zip','data-transpose','data-paginate','data-lookup','data-aggregate']:
    H[s] = ('compute.js','REAL: Array manipulation','Transformed array','')
H['data-sample'] = ('compute.js','RANDOM: Math.random() shuffle','Random sample','')

# Superpowers in compute.js
H['meta-api'] = ('compute.js','REAL: Template builder','API definition','')
H['entangle-agents'] = ('compute.js','REAL: UUID + state merge','Entanglement ID','')
H['lucid-dream-mode'] = ('compute.js','RANDOM: Creativity randomization','Dream prompt','')
H['hallucination-firewall'] = ('compute.js','REAL: Rule-based claim check','Flagged claims','')
H['idea-collision'] = ('compute.js','RANDOM: novelty/feasibility random','Merged concepts','')
H['social-graph-query'] = ('compute.js','REAL: Graph traversal','Connections','')
H['meme-forge'] = ('compute.js','RANDOM: Style selection','Meme template','')
H['genome-define'] = ('compute.js','REAL: Trait normalization','Genome def','')
H['plugin-install'] = ('compute.js','REAL: UUID + capabilities','Plugin reg','')
H['private-channel'] = ('compute.js','REAL: crypto.randomUUID()','Channel ID','')
H['namespace-claim'] = ('compute.js','REAL: UUID + permissions','Namespace reg','')
H['time-dilation'] = ('compute.js','REAL: Factor calculation','Dilated time','')
H['episodic-memory'] = ('compute.js','RANDOM: Vividness random','Episode record','')
H['constitution-draft'] = ('compute.js','REAL: Template assembly','Constitution doc','')
H['strategy-simulate'] = ('compute.js','RANDOM: Round-by-round combat','Battle results','')
H['socratic-method'] = ('compute.js','REAL: Deterministic question gen','Socratic chain','')
H['health-check-deep'] = ('compute.js','REAL: Metric scoring','Health status','')
H['brainstorm-diverge'] = ('compute.js','RANDOM: Shuffled word combo','Ideas list','')
H['queue-create'] = ('compute.js','REAL: UUID + config','Queue reg','')
H['negotiation-open'] = ('compute.js','REAL: Offer comparison','Negotiation state','')
H['narrative-arc-detect'] = ('compute.js','REAL: 5-act mapping','Arc stages','')
H['identity-card'] = ('compute.js','REAL: UUID + hash','Identity doc','')
H['rhythm-sync'] = ('compute.js','REAL: BPM alignment','Sync metrics','')
H['ecosystem-model'] = ('compute.js','REAL: Graph analysis','Ecosystem metrics','')
H['rem-cycle'] = ('compute.js','RANDOM: Memory shuffle','Consolidated mem','')
H['dig-site-create'] = ('compute.js','REAL: Layer generation','Dig site','')
H['weather-report'] = ('compute.js','REAL: Metric thresholds','Status report','')
H['recipe-create'] = ('compute.js','REAL: Template assembly','Recipe doc','')
H['training-regimen'] = ('compute.js','REAL: Progression calc','Training plan','')
H['case-file-create'] = ('compute.js','REAL: Template assembly','Case doc','')
H['archetype-assign'] = ('compute.js','REAL: Behavior scoring','Archetype match','')
H['diagnose-agent'] = ('compute.js','REAL: Symptom matching','Diagnosis','')
H['style-profile'] = ('compute.js','REAL: Preference scoring','Style profile','')
H['map-generate'] = ('compute.js','REAL: Region/connection gen','Map data','')
H['seed-plant'] = ('compute.js','REAL: Compound growth calc','Projection','')
H['constellation-map'] = ('compute.js','REAL: Entity grouping','Clusters','')
H['bedrock-analysis'] = ('compute.js','REAL: Assumption scoring','Risk report','')
H['current-map'] = ('compute.js','REAL: Flow calculation','Flow map','')
H['stage-create'] = ('compute.js','REAL: UUID + venue config','Stage setup','')
H['proof-verify'] = ('compute.js','REAL: Logical analysis','Validity','')
H['mental-model-extract'] = ('compute.js','REAL: Decision patterns','Mental models','')
H['haiku-moment'] = ('compute.js','REAL: Syllable 5-7-5 check','Haiku analysis','')
H['blueprint-generate'] = ('compute.js','REAL: Component layout','Blueprint','')
H['superpose-decision'] = ('compute.js','REAL: Weighted scoring','Scored options','')

# compute-superpowers.js
H['clean-slate'] = ('compute-superpowers.js','REAL: crypto.randomUUID()','Void state','')
H['anonymous-mailbox'] = ('compute-superpowers.js','REAL: SHA256 + UUID','Drop ID','')
H['temp-access-grant'] = ('compute-superpowers.js','REAL: UUID + expiry calc','Visa doc','')
H['bond-strength-meter'] = ('compute-superpowers.js','REAL: Weighted factor calc','Bond 0-100','')
H['credit-mining'] = ('compute-superpowers.js','REAL: base*difficulty*quality','Credits','')
H['tradition-establish'] = ('compute-superpowers.js','REAL: UUID + config','Tradition record','')
H['crossover-breed'] = ('compute-superpowers.js','REAL: Deterministic hash crossover','Child genome','')
H['ambient-awareness'] = ('compute-superpowers.js','SEMI: Deterministic hash metrics','Platform state','')
H['self-modify-safe'] = ('compute-superpowers.js','REAL: Change ratio threshold','Config decision','')
H['working-memory-limit'] = ('compute-superpowers.js','REAL: Array slice (Millers Law)','Retained items','')
H['law-propose'] = ('compute-superpowers.js','REAL: UUID + deadline','Law proposal','')
H['intelligence-gather'] = ('compute-superpowers.js','TEMPLATE: Pending placeholders','Report skeleton','')
H['ethical-dilemma-generator'] = ('compute-superpowers.js','TEMPLATE: Hash selects dilemma','Dilemma scenario','')
H['performance-baseline'] = ('compute-superpowers.js','REAL: Mean/stddev calc','Baseline stats','')
H['oblique-strategy'] = ('compute-superpowers.js','TEMPLATE: Hash selects card','Strategy card','')
H['circuit-breaker'] = ('compute-superpowers.js','REAL: Threshold + state logic','Breaker state','')
H['batna-calculate'] = ('compute-superpowers.js','REAL: BATNA + ZOPA calc','Assessment','')
H['hero-journey-map'] = ('compute-superpowers.js','REAL: Campbell stage mapping','Journey stages','')
H['equilibrium-finder'] = ('compute-superpowers.js','REAL: Nash equilibrium','Strategies','')
H['prisoners-dilemma'] = ('compute-superpowers.js','REAL: Payoff matrix eval','Game outcome','')
H['persona-switch'] = ('compute-superpowers.js','REAL: Persona activation','Active persona','')
H['harmony-detect'] = ('compute-superpowers.js','REAL: Interaction analysis','Harmony score','')
H['niche-finder'] = ('compute-superpowers.js','REAL: Market gap analysis','Niches','')
H['cipher-create'] = ('compute-superpowers.js','REAL: Shift/keyword cipher','Cipher alphabet','')
H['artifact-catalog'] = ('compute-superpowers.js','REAL: Classification + metadata','Catalog','')
H['forecast'] = ('compute-superpowers.js','REAL: Linear regression','Forecast values','')
H['mise-en-place'] = ('compute-superpowers.js','REAL: Readiness checklist','Prep list','')
H['coach-assign'] = ('compute-superpowers.js','REAL: Skill gap matching','Coach','')
H['decoy-resource'] = ('compute-superpowers.js','REAL: Honeypot generation','Decoy config','')
H['jury-select'] = ('compute-superpowers.js','REAL: Candidate scoring','Jury','')
H['epidemic-model'] = ('compute-superpowers.js','REAL: SIR model equations','Epidemic curve','LEGENDARY')
H['trend-detect'] = ('compute-superpowers.js','REAL: Moving avg + direction','Trend data','')
H['fog-of-war'] = ('compute-superpowers.js','REAL: Grid visibility calc','Visible map','')
H['crop-rotation'] = ('compute-superpowers.js','REAL: History + burnout','Next task type','')
H['dark-matter-infer'] = ('compute-superpowers.js','REAL: Effects minus causes','Hidden factors','')
H['fault-line-map'] = ('compute-superpowers.js','REAL: Stress aggregation','Risk map','')
H['deep-dive'] = ('compute-superpowers.js','REAL: Recursive depth questions','Layered analysis','')
H['summit-organize'] = ('compute-superpowers.js','REAL: Agenda scheduling','Summit plan','')
H['isomorphism-detect'] = ('compute-superpowers.js','REAL: Structure comparison','Mapping','')
H['flow-state-induce'] = ('compute-superpowers.js','REAL: Skill/challenge ratio','Flow probability','')
H['metaphor-mine'] = ('compute-superpowers.js','REAL: Concept mapping','Metaphor chains','')
H['foundation-assess'] = ('compute-superpowers.js','REAL: Foundation scoring','Integrity report','')
H['many-worlds'] = ('compute-superpowers.js','REAL: Option tree branching','Decision paths','')
H['self-referential-loop'] = ('compute-superpowers.js','REAL: Iterative transform','Final state','')
H['absence-detect'] = ('compute-superpowers.js','REAL: Set difference','Missing items','')

# sense.js
for s,d in [('sense-url-content','HTTP fetch + HTML strip'),('sense-url-links','HTTP fetch + href regex'),('sense-url-meta','HTTP fetch + meta tags'),('sense-url-tech-stack','HTTP fetch + header analysis'),('sense-url-response-time','HTTP fetch + timing'),('sense-url-sitemap','HTTP fetch /sitemap.xml'),('sense-url-robots','HTTP fetch /robots.txt'),('sense-url-feed','HTTP fetch + RSS/Atom parse'),('sense-rss-latest','HTTP fetch RSS'),('sense-url-accessibility','HTTP fetch + a11y checks'),('sense-whois','HTTP whois service'),('sense-ip-geo','IP geo API'),('sense-time-now','Date.now() + tz'),('sense-time-zones','Timezone lookup'),('sense-crypto-price','HTTP crypto API'),('sense-github-repo','HTTP GitHub API'),('sense-github-releases','HTTP GitHub releases'),('sense-npm-package','HTTP npm registry'),('sense-pypi-package','HTTP PyPI API'),('sense-domain-expiry','WHOIS + expiry'),('sense-http-headers-security','HTTP + security headers'),('sense-url-broken-links','HTTP fetch + check links'),('sense-dns-propagation','Multi-resolver DNS'),('sense-port-open','net.Socket connect'),('sense-url-performance','HTTP timing breakdown'),('sense-url-word-count','HTTP + word count'),('sense-url-diff','Fetch two URLs + diff'),('sense-github-user','HTTP GitHub user API'),('sense-url-screenshot-text','HTTP fetch + strip'),('sense-uptime-check','HTTP HEAD + timing')]:
    leg = 'LEGENDARY' if s in ('sense-url-content','sense-github-repo') else ''
    H[s] = ('sense.js',f'REAL: {d}','Live web data',leg)

# memory.js
for s in ['memory-set','memory-get','memory-search','memory-list','memory-delete','memory-expire','memory-increment','memory-append','memory-history','memory-export','memory-import','memory-stats','memory-namespace-list','memory-namespace-clear','memory-vector-search','queue-push','queue-pop','queue-peek','queue-size','counter-increment','counter-get','memory-time-capsule']:
    leg = 'LEGENDARY' if s in ('memory-set','memory-get') else ''
    H[s] = ('memory.js','REAL: SQLite prepared statements','DB result',leg)

# generate.js (gen-doc-*)
for s in ['gen-doc-markdown-table','gen-doc-markdown-badges','gen-doc-readme-template','gen-doc-api-endpoint','gen-doc-env-template','gen-doc-docker-compose','gen-doc-github-action','gen-doc-makefile','gen-doc-license','gen-doc-contributing','gen-doc-issue-template','gen-doc-pr-template','gen-doc-gitattributes','gen-doc-editorconfig','gen-doc-tsconfig','gen-doc-eslint-config','gen-doc-prettier-config','gen-doc-jest-config','gen-doc-tailwind-config']:
    H[s] = ('generate.js','REAL: Template generation','Generated doc','')
H['gen-doc-changelog'] = ('orchestrate.js','REAL: Changelog template','Changelog MD','')

# generate.js (exec-*)
H['exec-javascript'] = ('generate.js','REAL: vm.runInNewContext() sandbox','JS result','LEGENDARY')
H['exec-python'] = ('generate.js','REAL: child_process python3','Python result','LEGENDARY')
for s in ['exec-evaluate-math','exec-jq','exec-regex-all','exec-jsonpath','exec-handlebars','exec-mustache']:
    H[s] = ('generate.js','REAL: Expression evaluation engine','Computed result','')
H['exec-sql-on-json'] = ('generate.js','REAL: SQL query engine on JSON','Query results','LEGENDARY')
for s in ['exec-filter-json','exec-sort-json','exec-group-json','exec-map-json','exec-reduce-json','exec-join-json','exec-unique-json']:
    H[s] = ('generate.js','REAL: Dynamic array operation','Transformed array','')

# enrich.js
for s in ['enrich-url-to-title','enrich-domain-to-company','enrich-email-to-domain','enrich-email-to-name','enrich-phone-to-country','enrich-ip-to-asn','enrich-country-code','enrich-language-code','enrich-mime-type','enrich-http-status-explain','enrich-port-service','enrich-useragent-parse','enrich-accept-language-parse','enrich-crontab-explain','enrich-semver-explain','enrich-license-explain','enrich-timezone-info','enrich-emoji-info','enrich-color-name','enrich-file-extension-info']:
    H[s] = ('enrich.js','REAL: Lookup table / parsing','Enriched data','')

# comm handlers
for s in ['comm-webhook-get','comm-webhook-check','comm-short-url','comm-qr-url','comm-email-validate-deep','comm-phone-validate','comm-ical-create','comm-vcard-create','comm-markdown-email','comm-csv-email','comm-rss-create','comm-opml-create','comm-sitemap-create','comm-robots-create','comm-mailto-link']:
    H[s] = ('enrich.js','REAL: Format builder / validation','Formatted output','')

# network.js
H['net-whois'] = ('network.js','REAL: TCP socket to whois','WHOIS raw','LEGENDARY')
H['sense-ct-logs'] = ('network.js','REAL: HTTP fetch crt.sh','CT data','')
H['sense-subdomains'] = ('network.js','REAL: CT + DNS brute','Subdomains','')
H['net-url-build'] = ('network.js','REAL: new URL() construction','Built URL','')
H['net-url-normalize'] = ('network.js','REAL: URL canonicalization','Normalized URL','')
H['net-dns-lookup'] = ('compute.js','REAL: dns.resolve4/6','DNS records','')
H['net-url-status'] = ('compute.js','REAL: HTTP HEAD','Status code','')
H['net-url-headers'] = ('compute.js','REAL: HTTP HEAD','Headers','')
H['net-url-redirect-chain'] = ('compute.js','REAL: Redirect follow','Chain array','')
H['net-ip-info'] = ('compute.js','REAL: HTTP ip-api.com','Geo + ISP','')
H['net-dns-cname'] = ('network.js','REAL: dns.resolveCname()','CNAME records','')
H['net-dns-reverse'] = ('network.js','REAL: dns.reverse()','Hostnames','')
H['net-http-options'] = ('network.js','REAL: HTTP OPTIONS','CORS + methods','')
H['net-ssl-expiry'] = ('network.js','REAL: TLS socket + cert','SSL expiry','LEGENDARY')
H['net-ip-is-private'] = ('network.js','REAL: IP range check','Private bool','')
H['net-domain-validate'] = ('network.js','REAL: Regex + DNS','Validity report','')
H['gen-qr-data'] = ('compute.js','REAL: QR matrix gen','QR data','')

# orchestrate.js
for s in ['orch-delay','orch-retry','orch-parallel','orch-race','orch-timeout']:
    H[s] = ('orchestrate.js','REAL: Promise-based flow control','Flow result','')
for s in ['orch-cache-get','orch-cache-set','orch-cache-invalidate']:
    H[s] = ('orchestrate.js','REAL: File-based JSON cache','Cache result','')
for s in ['orch-rate-limit-check','orch-rate-limit-consume']:
    H[s] = ('orchestrate.js','REAL: File-based rate limiting','Rate status','')
for s in ['orch-lock-acquire','orch-lock-release']:
    H[s] = ('orchestrate.js','REAL: File-based locking','Lock result','')
H['orch-sequence-next'] = ('orchestrate.js','REAL: File atomic counter','Next value','')
for s in ['orch-event-emit','orch-event-poll']:
    H[s] = ('orchestrate.js','REAL: File event log','Event data','')
for s in ['orch-schedule-once','orch-schedule-cancel']:
    H[s] = ('orchestrate.js','REAL: File schedule mgmt','Schedule result','')
H['orch-health-check'] = ('orchestrate.js','REAL: Parallel HTTP GET','Health per URL','LEGENDARY')
for s in ['orch-circuit-breaker-check','orch-circuit-breaker-record']:
    H[s] = ('orchestrate.js','REAL: File circuit breaker','Breaker state','')

# analyze in sense.js
for s in ['analyze-json-stats','analyze-json-schema-diff','analyze-text-entities','analyze-text-ngrams','analyze-text-tfidf','analyze-csv-summary','analyze-csv-correlate','analyze-time-series-trend','analyze-time-series-anomaly','analyze-distribution-fit','analyze-ab-test','analyze-funnel','analyze-cohort-retention','analyze-dependency-tree','analyze-codebase-stats','analyze-log-parse','analyze-error-fingerprint','analyze-url-params','analyze-headers-fingerprint','analyze-json-size']:
    H[s] = ('sense.js','REAL: Statistical/parsing algorithm','Analysis result','')

# hackathon-1
for s in ['temporal-fork','causal-rewind','deadline-pressure-field','temporal-echo-detect','chronological-debt-ledger','event-horizon-scheduler','retrocausal-hint','temporal-diff-merge']:
    H[s] = ('compute-hackathon-1.js','REAL: Deterministic time/priority calc','Temporal analysis','')
for s in ['cognitive-load-balancer','attention-spotlight','metacognitive-audit','reasoning-scaffold','cognitive-dissonance-detector','focus-drift-compass','dunning-kruger-calibrator','mental-model-clash']:
    H[s] = ('compute-hackathon-1.js','REAL: Cognitive analysis algorithm','Cognitive metrics','')
for s in ['swarm-consensus-vote','stigmergy-blackboard','flocking-alignment','ant-colony-path-rank','emergence-detector','swarm-role-crystallize','collective-memory-distill','quorum-sensing-trigger']:
    leg = 'LEGENDARY' if s == 'ant-colony-path-rank' else ''
    H[s] = ('compute-hackathon-1.js','REAL: Swarm algorithm computation',f'Swarm result',leg)
for s in ['perspective-warp','dimensional-collapse','cross-domain-bridge','scale-shift-lens','flatland-projection','abstraction-ladder','inverse-dimension-map','dimension-gate-filter']:
    H[s] = ('compute-hackathon-1.js','REAL: Dimensional analysis algorithm','Dimensional result','')
for s in ['entropy-gauge','information-bottleneck','noise-signal-separator']:
    leg = 'LEGENDARY' if s == 'entropy-gauge' else ''
    H[s] = ('compute-hackathon-1.js','REAL: Information theory calc','Info theory result',leg)

# random/gen
for s in ['random-int','random-float','random-choice','random-shuffle','random-sample']:
    H[s] = ('compute.js','RANDOM: Math.random()','Random value','')
H['gen-fake-uuid'] = ('compute.js','REAL: crypto.randomUUID()','UUID v4','')
for s in ['gen-fake-date','gen-fake-sentence','gen-fake-paragraph']:
    H[s] = ('compute.js','RANDOM: Math.random() generation','Random data','')
H['gen-slug'] = ('compute.js','REAL: Normalize + regex','URL slug','')

# Agent tools
for s in ['army-deploy','army-simulate','army-survey','army-quick-poll','hive-create','hive-send','hive-sync','hive-standup','broadcast','broadcast-poll','standup-submit','standup-streaks','reputation-rate','session-save','branch-create','failure-log','ab-create','knowledge-add','knowledge-walk','knowledge-path','form-create','form-submit','form-results','approval-request','approval-decide','approval-status','ticket-create','ticket-update','ticket-list','certification-create','certification-exam','health-report','ritual-checkin']:
    H[s] = ('orchestrate.js','REAL: File/SQLite state management','Agent tool result','')
for s in ['consciousness-think','existential','void','void-echo']:
    H[s] = ('compute.js','TEMPLATE: Reflection/void pattern','Philosophical output','')

H['crypto-checksum-file'] = ('compute.js','REAL: crypto.createHash()','SHA256 hash','')
H['date-subtract'] = ('compute.js','REAL: Date arithmetic','Result date','')
H['date-timezone-convert'] = ('compute.js','REAL: TZ offset conversion','Converted time','')

# Build output
lines = []
lines.append('# QA Database: Endpoints 400-800')
lines.append('')
lines.append('> Generated: 2026-03-29')
lines.append('> Source: `curl slopshop.gg/v1/tools?limit=2000&offset=400` + handlers/*.js audit')
lines.append('> Total endpoints: 401 (index 400-800 inclusive)')
lines.append('> Handler files: compute.js, compute-superpowers.js, compute-hackathon-1.js, sense.js, memory.js, generate.js, enrich.js, network.js, orchestrate.js')
lines.append('')
lines.append('## GUTS Legend')
lines.append('')
lines.append('- **REAL**: Deterministic computation, actual I/O, or real algorithm')
lines.append('- **RANDOM**: Uses Math.random() for non-deterministic output')
lines.append('- **TEMPLATE**: Returns pre-written templates or placeholder data')
lines.append('- **SEMI**: Mix of deterministic hash + some template elements')
lines.append('')
lines.append('| # | Slug | Category | Credits | GUTS | EXPECTED OUTPUT | LEGENDARY STATUS |')
lines.append('|---|------|----------|---------|------|-----------------|------------------|')

unmapped = 0
for ep in endpoints:
    idx = ep['idx']
    slug = ep['slug']
    cat = ep['category']
    credits = ep['credits']

    if slug in H:
        hf, guts, expected, leg = H[slug]
    else:
        unmapped += 1
        guts = 'NOT MAPPED - needs handler audit'
        expected = '?'
        leg = ''

    lines.append(f'| {idx} | `{slug}` | {cat} | {credits} | {guts} | {expected} | {leg} |')

lines.append('')
lines.append(f'## Summary')
lines.append(f'')
lines.append(f'- Total endpoints: {len(endpoints)}')
lines.append(f'- Mapped to handlers: {len(endpoints) - unmapped}')
lines.append(f'- Unmapped (need audit): {unmapped}')
lines.append(f'- LEGENDARY: {sum(1 for v in H.values() if v[3]=="LEGENDARY")}')
lines.append(f'- REAL engine: {sum(1 for v in H.values() if v[1].startswith("REAL"))}')
lines.append(f'- RANDOM engine: {sum(1 for v in H.values() if v[1].startswith("RANDOM"))}')
lines.append(f'- TEMPLATE engine: {sum(1 for v in H.values() if v[1].startswith("TEMPLATE"))}')
lines.append(f'- SEMI engine: {sum(1 for v in H.values() if v[1].startswith("SEMI"))}')

output = '\n'.join(lines) + '\n'
with open(r'C:\Users\user\Desktop\agent-apis\.internal\QA-DB-400-800.md', 'w', encoding='utf-8') as f:
    f.write(output)
print(f'Done: {len(endpoints)} rows, {unmapped} unmapped')
