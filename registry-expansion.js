module.exports = {
  EXPANSION_DEFS: {

    // =========================================================================
    // 1. WORLD SENSING (30 APIs) - category: 'Sense: Web'
    // =========================================================================

    'sense-url-content': {
      cat: 'Sense: Web',
      name: 'Fetch URL as Clean Text',
      desc: 'Fetch a URL and return clean readable text content, stripping all HTML tags, scripts, and styles. Returns the main textual content a human would read.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-links': {
      cat: 'Sense: Web',
      name: 'Extract Links from URL',
      desc: 'Fetch a URL and extract all hyperlinks (href attributes), returning absolute URLs with their anchor text and whether they are internal or external.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-meta': {
      cat: 'Sense: Web',
      name: 'Get URL Metadata',
      desc: 'Fetch a URL and extract meta information: page title, meta description, Open Graph tags (og:title, og:image, og:description), Twitter card tags, and canonical URL.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-tech-stack': {
      cat: 'Sense: Web',
      name: 'Detect Website Tech Stack',
      desc: 'Fetch a URL and detect technologies in use: JavaScript frameworks (React, Vue, Angular), CMS generators (WordPress, Ghost), analytics tools, CDNs, and server software from headers and HTML patterns.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-response-time': {
      cat: 'Sense: Web',
      name: 'Measure URL Response Time',
      desc: 'Make multiple HTTP requests to a URL and return min, max, and average response times in milliseconds. Useful for detecting latency patterns and slowdowns.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-sitemap': {
      cat: 'Sense: Web',
      name: 'Fetch and Parse Sitemap',
      desc: 'Fetch a domain\'s sitemap.xml (or sitemap index), parse it, and return all listed URLs with their last-modified dates and change frequencies.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-robots': {
      cat: 'Sense: Web',
      name: 'Fetch and Parse robots.txt',
      desc: 'Fetch a domain\'s robots.txt, parse it, and return structured rules: which user-agents are allowed or disallowed which paths, crawl-delay directives, and sitemap references.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-feed': {
      cat: 'Sense: Web',
      name: 'Fetch and Parse RSS/Atom Feed',
      desc: 'Fetch a URL that contains an RSS or Atom feed, parse the XML, and return structured feed metadata (title, description, link) plus all items with titles, links, dates, and summaries.',
      credits: 3,
      tier: 'network'
    },

    'sense-rss-latest': {
      cat: 'Sense: Web',
      name: 'Get Latest RSS Items',
      desc: 'Fetch an RSS or Atom feed URL and return only the latest N items (default 10), sorted by publication date descending. Each item includes title, link, pubDate, and content summary.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-accessibility': {
      cat: 'Sense: Web',
      name: 'Basic Accessibility Check',
      desc: 'Fetch a URL and run basic accessibility checks: missing alt text on images, heading hierarchy issues, missing form labels, links without descriptive text, and color contrast warnings from inline styles.',
      credits: 3,
      tier: 'network'
    },

    'sense-whois': {
      cat: 'Sense: Web',
      name: 'WHOIS Domain Lookup',
      desc: 'Perform a WHOIS lookup for a domain name and return parsed registration data: registrar, creation date, expiry date, name servers, registrant organization (when public), and status flags.',
      credits: 3,
      tier: 'network'
    },

    'sense-ip-geo': {
      cat: 'Sense: Web',
      name: 'IP Geolocation',
      desc: 'Resolve an IP address to its approximate geographic location using a built-in IP range database: country, region, city, latitude/longitude, and timezone. No external API key required.',
      credits: 1,
      tier: 'network'
    },

    'sense-time-now': {
      cat: 'Sense: Web',
      name: 'Current Time in Any Timezone',
      desc: 'Return the current accurate time in any IANA timezone (e.g. America/New_York, Europe/Berlin). Returns ISO 8601 timestamp, human-readable format, UTC offset, and whether DST is active. Fixes the agent\'s unreliable internal clock.',
      credits: 1,
      tier: 'compute'
    },

    'sense-time-zones': {
      cat: 'Sense: Web',
      name: 'List All Timezones',
      desc: 'Return a complete list of all IANA timezones with their current UTC offsets, DST status, and representative city names. Useful for building timezone pickers or converting between zones.',
      credits: 1,
      tier: 'compute'
    },

    'sense-crypto-price': {
      cat: 'Sense: Web',
      name: 'Get Cryptocurrency Price',
      desc: 'Fetch the current price of a cryptocurrency (BTC, ETH, etc.) in a specified fiat currency from a public price API. Returns current price, 24h change percentage, and market cap when available.',
      credits: 3,
      tier: 'network'
    },

    'sense-github-repo': {
      cat: 'Sense: Web',
      name: 'GitHub Repo Info',
      desc: 'Fetch public information about a GitHub repository using the GitHub API (no auth required): star count, fork count, open issues, primary language, description, topics, license, and last push date.',
      credits: 3,
      tier: 'network'
    },

    'sense-github-releases': {
      cat: 'Sense: Web',
      name: 'GitHub Latest Releases',
      desc: 'Fetch the latest releases from a public GitHub repository: version tags, release names, publish dates, whether they are pre-releases, and release note bodies. Returns most recent N releases.',
      credits: 3,
      tier: 'network'
    },

    'sense-npm-package': {
      cat: 'Sense: Web',
      name: 'npm Package Info',
      desc: 'Fetch metadata for an npm package from the npm registry: latest version, description, weekly downloads, author, homepage, repository URL, license, and direct dependency count.',
      credits: 3,
      tier: 'network'
    },

    'sense-pypi-package': {
      cat: 'Sense: Web',
      name: 'PyPI Package Info',
      desc: 'Fetch metadata for a Python package from PyPI: latest version, description, author, homepage, license, release date, and required Python version.',
      credits: 3,
      tier: 'network'
    },

    'sense-domain-expiry': {
      cat: 'Sense: Web',
      name: 'Domain Expiry Check',
      desc: 'Check when a domain name expires by querying WHOIS data. Returns expiry date, days remaining, registrar, and a warning flag if expiry is within 30 days.',
      credits: 3,
      tier: 'network'
    },

    'sense-http-headers-security': {
      cat: 'Sense: Web',
      name: 'Analyze Security Headers',
      desc: 'Make an HTTP request to a URL and analyze the security-relevant response headers: presence and quality of Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy. Grades each header.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-broken-links': {
      cat: 'Sense: Web',
      name: 'Check for Broken Links',
      desc: 'Fetch a URL, extract all hyperlinks from the page, then check each link with a HEAD request to detect 404s and other errors. Returns a categorized list of working and broken links.',
      credits: 5,
      tier: 'network'
    },

    'sense-dns-propagation': {
      cat: 'Sense: Web',
      name: 'DNS Propagation Check',
      desc: 'Resolve a DNS record (A, AAAA, MX, TXT, CNAME) from multiple geographic resolvers and return all responses. Shows whether DNS changes have propagated globally and highlights inconsistencies.',
      credits: 3,
      tier: 'network'
    },

    'sense-port-open': {
      cat: 'Sense: Web',
      name: 'Check if Port is Open',
      desc: 'Attempt a TCP connection to a host and port, reporting whether the port is open, closed, or filtered. Includes response time. Useful for checking if a service is reachable before making application-level calls.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-performance': {
      cat: 'Sense: Web',
      name: 'URL Performance Metrics',
      desc: 'Measure web performance for a URL: DNS resolution time, TCP connection time, time to first byte (TTFB), and total download time. Returns a breakdown of where time is spent.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-word-count': {
      cat: 'Sense: Web',
      name: 'URL Word Count',
      desc: 'Fetch a live URL, strip HTML, and return word count, sentence count, paragraph count, estimated reading time in minutes, and the 20 most frequent non-stopword terms.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-diff': {
      cat: 'Sense: Web',
      name: 'Compare Two URLs',
      desc: 'Fetch two URLs, extract their clean text content, and return a structured diff showing added lines, removed lines, and unchanged context. Useful for detecting content changes between page versions.',
      credits: 5,
      tier: 'network'
    },

    'sense-github-user': {
      cat: 'Sense: Web',
      name: 'GitHub User Profile',
      desc: 'Fetch a public GitHub user\'s profile information: display name, bio, company, location, website, followers, following, public repo count, and account creation date.',
      credits: 3,
      tier: 'network'
    },

    'sense-url-screenshot-text': {
      cat: 'Sense: Web',
      name: 'URL Visible Text Extraction',
      desc: 'Fetch a URL and extract only the text that would be visible to a sighted user: excluding hidden elements, scripts, styles, and nav boilerplate. Returns structured sections like a screen reader would present them.',
      credits: 3,
      tier: 'network'
    },

    'sense-uptime-check': {
      cat: 'Sense: Web',
      name: 'Uptime and Latency Check',
      desc: 'Check if a URL is accessible and measure round-trip latency. Returns HTTP status code, response time in ms, whether the response body is non-empty, and a simple up/down verdict.',
      credits: 3,
      tier: 'network'
    },

    // =========================================================================
    // 2. MEMORY & STATE (20 APIs) - category: 'Memory'
    // =========================================================================

    'memory-set': {
      cat: 'Memory',
      name: 'Store Memory',
      desc: 'Store a named memory with a string or JSON value, optional tags for organization, and an optional namespace for isolation. Persists across agent sessions. Returns confirmation with storage timestamp. FREE - no credits required.',
      credits: 0,
      tier: 'compute'
    },

    'memory-get': {
      cat: 'Memory',
      name: 'Retrieve Memory',
      desc: 'Retrieve a stored memory by its key within an optional namespace. Returns the value, creation timestamp, last-updated timestamp, and associated tags. Returns null if key does not exist. FREE - no credits required.',
      credits: 0,
      tier: 'compute'
    },

    'memory-search': {
      cat: 'Memory',
      name: 'Search Memories',
      desc: 'Search stored memories by tag match, key substring, or value substring within an optional namespace. Returns all matching key-value pairs with their metadata, sorted by last-updated date. FREE - no credits required.',
      credits: 0,
      tier: 'compute'
    },

    'memory-list': {
      cat: 'Memory',
      name: 'List All Memories',
      desc: 'List all stored memory keys in a namespace, with optional filtering by tag. Returns key names, creation dates, value sizes, and tags. Does not return values themselves (use memory-get for that). FREE - no credits required.',
      credits: 0,
      tier: 'compute'
    },

    'memory-delete': {
      cat: 'Memory',
      name: 'Delete Memory',
      desc: 'Delete a stored memory by key within an optional namespace. Returns confirmation including the deleted key and a timestamp. Silently succeeds if key does not exist. FREE - no credits required.',
      credits: 0,
      tier: 'compute'
    },

    'memory-expire': {
      cat: 'Memory',
      name: 'Set Memory TTL',
      desc: 'Set a time-to-live (TTL) on an existing memory key. The memory will be automatically deleted after N seconds. Passing TTL of 0 removes any existing expiry. Returns the absolute expiry timestamp.',
      credits: 1,
      tier: 'compute'
    },

    'memory-increment': {
      cat: 'Memory',
      name: 'Atomic Increment Memory',
      desc: 'Atomically increment (or decrement with negative delta) a numeric memory value by a given amount. Creates the key with value 0 before incrementing if it does not exist. Returns the new value.',
      credits: 1,
      tier: 'compute'
    },

    'memory-append': {
      cat: 'Memory',
      name: 'Append to Array Memory',
      desc: 'Atomically append one or more items to a memory that stores a JSON array. Creates the array if the key does not exist. Optional max-length parameter trims oldest items. Returns new array length.',
      credits: 1,
      tier: 'compute'
    },

    'memory-history': {
      cat: 'Memory',
      name: 'Memory Version History',
      desc: 'Retrieve the last N versions of a memory key (default 10), including the value at each version and the timestamp of each change. Provides an audit trail of how a memory evolved over time.',
      credits: 1,
      tier: 'compute'
    },

    'memory-export': {
      cat: 'Memory',
      name: 'Export All Memories',
      desc: 'Export all memories in a namespace as a JSON object, including keys, values, tags, timestamps, and TTLs. Useful for backup, migration, or passing state to another agent instance.',
      credits: 1,
      tier: 'compute'
    },

    'memory-import': {
      cat: 'Memory',
      name: 'Import Memories from JSON',
      desc: 'Import a set of memories from a JSON object (as produced by memory-export). Supports merge mode (preserve existing keys) or overwrite mode. Returns count of imported, skipped, and overwritten entries.',
      credits: 1,
      tier: 'compute'
    },

    'memory-stats': {
      cat: 'Memory',
      name: 'Memory Namespace Statistics',
      desc: 'Return statistics for a memory namespace: total key count, total stored bytes, oldest entry timestamp, newest entry timestamp, number of keys with TTLs set, and breakdown by tag. FREE - no credits required.',
      credits: 0,
      tier: 'compute'
    },

    'memory-namespace-list': {
      cat: 'Memory',
      name: 'List Memory Namespaces',
      desc: 'List all existing memory namespaces accessible to the current API key. Returns namespace names, key counts, and last-activity timestamps. Helps agents manage isolated state spaces. FREE - no credits required.',
      credits: 0,
      tier: 'compute'
    },

    'memory-namespace-clear': {
      cat: 'Memory',
      name: 'Clear Memory Namespace',
      desc: 'Delete all memory keys within a specified namespace. Requires explicit confirmation string to prevent accidental data loss. Returns count of deleted entries and the namespace name.',
      credits: 1,
      tier: 'compute'
    },

    'memory-vector-search': {
      cat: 'Memory',
      name: 'Semantic Memory Search',
      desc: 'Search memories by text similarity. Matches query words against stored values, keys, and tags. Returns ranked results by relevance score. FREE - no credits required.',
      credits: 0,
      tier: 'compute'
    },

    'queue-push': {
      cat: 'Memory',
      name: 'Push to Queue',
      desc: 'Push one or more items onto a named persistent queue (FIFO). Items can be any JSON-serializable value. Returns the new queue depth and the item IDs assigned. Queues are created automatically.',
      credits: 1,
      tier: 'compute'
    },

    'queue-pop': {
      cat: 'Memory',
      name: 'Pop from Queue',
      desc: 'Remove and return the next item (or N items) from the front of a named queue. Returns the item values, their IDs, and the remaining queue depth. Returns null if the queue is empty.',
      credits: 1,
      tier: 'compute'
    },

    'queue-peek': {
      cat: 'Memory',
      name: 'Peek at Queue Front',
      desc: 'Inspect the next item in a named queue without removing it. Returns the item value, its ID, how long it has been in the queue, and the total queue depth. Non-destructive read.',
      credits: 1,
      tier: 'compute'
    },

    'queue-size': {
      cat: 'Memory',
      name: 'Get Queue Size',
      desc: 'Return the current number of items in a named queue, plus the oldest item age in seconds and the total byte size of all queued data. Returns 0 for non-existent queues without error.',
      credits: 1,
      tier: 'compute'
    },

    'counter-increment': {
      cat: 'Memory',
      name: 'Atomic Counter Increment',
      desc: 'Increment a named persistent counter by a given amount (default 1). Creates the counter at 0 before incrementing if it does not exist. Useful for tracking events, calls, or usage across agent sessions.',
      credits: 1,
      tier: 'compute'
    },

    'counter-get': {
      cat: 'Memory',
      name: 'Get Counter Value',
      desc: 'Return the current value of a named persistent counter, along with its creation timestamp and last-incremented timestamp. Returns 0 for counters that have never been set. FREE - no credits required.',
      credits: 0,
      tier: 'compute'
    },

    // =========================================================================
    // 3. CODE EXECUTION (15 APIs) - category: 'Execute'
    // =========================================================================

    'exec-javascript': {
      cat: 'Execute',
      name: 'Run JavaScript in Sandbox',
      desc: 'Execute a JavaScript code string in an isolated Node.js vm sandbox with no access to the filesystem, network, or process. Returns the return value, console output, execution time, and any thrown errors. Timeout enforced.',
      credits: 5,
      tier: 'compute'
    },

    'exec-python': {
      cat: 'Execute',
      name: 'Run Python Code',
      desc: 'Execute Python code in a subprocess with timeout enforcement. Returns stdout, stderr, and execution status. Supports numpy, json, math, datetime, re, os.path, hashlib, base64, urllib standard library modules.',
      credits: 5,
      tier: 'compute'
    },

    'exec-evaluate-math': {
      cat: 'Execute',
      name: 'Evaluate Math Expression',
      desc: 'Evaluate a complex mathematical expression string including variables, functions (sin, cos, log, sqrt, factorial), and constants (pi, e). Supports unit awareness and returns both numeric result and step-by-step breakdown.',
      credits: 1,
      tier: 'compute'
    },

    'exec-jq': {
      cat: 'Execute',
      name: 'Run jq Query on JSON',
      desc: 'Apply a jq-compatible filter expression to a JSON input and return the result. Supports field selection, array indexing, pipes, map, select, and common jq functions. No shell execution — pure JS implementation.',
      credits: 1,
      tier: 'compute'
    },

    'exec-regex-all': {
      cat: 'Execute',
      name: 'Regex Match All Groups',
      desc: 'Apply a regular expression to a text string and return every match with all capture group values, match positions (start/end indices), and match count. Supports named capture groups. Returns structured results.',
      credits: 1,
      tier: 'compute'
    },

    'exec-jsonpath': {
      cat: 'Execute',
      name: 'JSONPath Query',
      desc: 'Run a JSONPath expression (e.g. $.store.book[*].author) against a JSON object and return all matching values. Like XPath for JSON. Supports recursive descent, wildcards, filters, and array slices.',
      credits: 1,
      tier: 'compute'
    },

    'exec-handlebars': {
      cat: 'Execute',
      name: 'Render Handlebars Template',
      desc: 'Render a Handlebars template string with a provided data object. Supports {{variable}}, {{#if}}, {{#each}}, {{#with}}, partials passed as extra argument, and custom helpers: eq, gt, lt, and, or, not.',
      credits: 1,
      tier: 'compute'
    },

    'exec-mustache': {
      cat: 'Execute',
      name: 'Render Mustache Template',
      desc: 'Render a Mustache template string with a provided data object. Supports {{variable}}, {{#section}}, {{^inverted}}, {{{unescaped}}}, and {{>partial}} with partials passed as additional argument.',
      credits: 1,
      tier: 'compute'
    },

    'exec-sql-on-json': {
      cat: 'Execute',
      name: 'Run SQL on JSON Array',
      desc: 'Execute a SQL SELECT statement against a JSON array treated as a database table. Supports WHERE clauses, ORDER BY, GROUP BY, HAVING, LIMIT, OFFSET, aggregate functions (COUNT, SUM, AVG, MIN, MAX), and JOINs between multiple named arrays.',
      credits: 3,
      tier: 'compute'
    },

    'exec-filter-json': {
      cat: 'Execute',
      name: 'Filter JSON Array',
      desc: 'Filter a JSON array of objects by a set of conditions (field equals, contains, greater than, less than, in list, regex match). Supports AND/OR logic. Returns filtered array and count of matching items.',
      credits: 1,
      tier: 'compute'
    },

    'exec-sort-json': {
      cat: 'Execute',
      name: 'Sort JSON Array',
      desc: 'Sort a JSON array of objects by one or more fields, each with ascending or descending direction. Supports string (locale-aware), numeric, and date sorting. Returns the sorted array.',
      credits: 1,
      tier: 'compute'
    },

    'exec-group-json': {
      cat: 'Execute',
      name: 'Group JSON Array by Field',
      desc: 'Group a JSON array of objects by the value of one or more fields. Returns an object where keys are the group values and values are arrays of matching items. Optionally include group counts.',
      credits: 1,
      tier: 'compute'
    },

    'exec-map-json': {
      cat: 'Execute',
      name: 'Transform JSON Array Items',
      desc: 'Apply a transformation to each item in a JSON array using a field mapping spec: pick fields, rename fields, add computed fields (string templates, math expressions on other fields), and drop fields.',
      credits: 1,
      tier: 'compute'
    },

    'exec-reduce-json': {
      cat: 'Execute',
      name: 'Reduce JSON Array',
      desc: 'Reduce a JSON array to a single value using a built-in reducer: sum/avg/min/max of a numeric field, concatenation of a string field, merge all objects, or collect unique values of a field.',
      credits: 1,
      tier: 'compute'
    },

    'exec-join-json': {
      cat: 'Execute',
      name: 'Join Two JSON Arrays',
      desc: 'Perform an inner, left, or full outer join between two JSON arrays on a shared key field. Returns a merged array where matching objects are combined. Handles duplicate keys by suffixing field names.',
      credits: 1,
      tier: 'compute'
    },

    'exec-unique-json': {
      cat: 'Execute',
      name: 'Deduplicate JSON Array',
      desc: 'Remove duplicate items from a JSON array. Deduplication can be by full object equality, by a specific field value, or by a set of fields. Returns deduplicated array and count of removed duplicates.',
      credits: 1,
      tier: 'compute'
    },

    // =========================================================================
    // 4. COMMUNICATION (15 APIs) - category: 'Communicate'
    // =========================================================================

    'comm-webhook-get': {
      cat: 'Communicate',
      name: 'Create Temporary Webhook Inbox',
      desc: 'Create a unique temporary URL that can receive incoming HTTP requests (GET, POST, etc.) and store them. Returns the inbox URL and an inbox ID. Incoming requests are stored for up to 24 hours for later inspection.',
      credits: 1,
      tier: 'compute'
    },

    'comm-webhook-check': {
      cat: 'Communicate',
      name: 'Check Webhook Inbox',
      desc: 'Check an inbox created by comm-webhook-get for any received HTTP requests since the last check. Returns request method, headers, body, query params, and timestamp for each received request.',
      credits: 1,
      tier: 'compute'
    },

    'comm-short-url': {
      cat: 'Communicate',
      name: 'Create Short Redirect URL',
      desc: 'Create a short redirect URL that forwards visitors to a long target URL. Returns the short URL. Optional expiry time in seconds. Useful for sharing long URLs in messages, QR codes, or limited-space contexts.',
      credits: 1,
      tier: 'compute'
    },

    'comm-qr-url': {
      cat: 'Communicate',
      name: 'Generate QR Code as SVG',
      desc: 'Generate a QR code for any string (URL, text, contact data) and return it as an SVG string. Configurable error correction level (L/M/Q/H) and module size. SVG can be embedded in HTML or saved as a file.',
      credits: 1,
      tier: 'compute'
    },

    'comm-email-validate-deep': {
      cat: 'Communicate',
      name: 'Deep Email Validation',
      desc: 'Validate an email address beyond syntax: check MX records to confirm the domain can receive mail, detect disposable/temporary email domains, check for common typos in domain names, and verify format compliance.',
      credits: 3,
      tier: 'network'
    },

    'comm-phone-validate': {
      cat: 'Communicate',
      name: 'Validate Phone Number',
      desc: 'Validate a phone number string, detect its country from the international dialing prefix, determine line type (mobile/landline/VOIP/toll-free), and return the number in E.164, national, and international formats.',
      credits: 1,
      tier: 'compute'
    },

    'comm-ical-create': {
      cat: 'Communicate',
      name: 'Create iCal Event',
      desc: 'Generate a valid iCalendar (.ics) file content for a calendar event. Accepts title, description, start/end datetime with timezone, location, URL, organizer, attendees, recurrence rule, and alarm offset.',
      credits: 1,
      tier: 'compute'
    },

    'comm-vcard-create': {
      cat: 'Communicate',
      name: 'Create vCard Contact',
      desc: 'Generate a valid vCard 3.0/4.0 (.vcf) file content for a contact. Accepts name, organization, title, email addresses, phone numbers, postal address, website URL, notes, and photo URL.',
      credits: 1,
      tier: 'compute'
    },

    'comm-markdown-email': {
      cat: 'Communicate',
      name: 'Convert Markdown to Email HTML',
      desc: 'Convert a Markdown string to email-safe HTML with inline CSS styling. Outputs a complete HTML email template compatible with major email clients (Gmail, Outlook, Apple Mail). Optional theme color parameter.',
      credits: 1,
      tier: 'compute'
    },

    'comm-csv-email': {
      cat: 'Communicate',
      name: 'Format Data as CSV for Email',
      desc: 'Convert a JSON array of objects to a properly formatted CSV string ready for email attachment or download. Handles quoting, escaping, custom delimiter, optional BOM for Excel compatibility, and custom header labels.',
      credits: 1,
      tier: 'compute'
    },

    'comm-rss-create': {
      cat: 'Communicate',
      name: 'Generate RSS Feed XML',
      desc: 'Generate a valid RSS 2.0 feed XML string from a list of items. Accepts channel metadata (title, link, description, language) and an array of items each with title, link, description, pubDate, and guid.',
      credits: 1,
      tier: 'compute'
    },

    'comm-opml-create': {
      cat: 'Communicate',
      name: 'Generate OPML Feed List',
      desc: 'Generate a valid OPML 2.0 XML file from a list of RSS/Atom feeds. Each feed entry includes title, XML URL, HTML URL, and type. OPML files are used to export/import subscriptions across feed readers.',
      credits: 1,
      tier: 'compute'
    },

    'comm-sitemap-create': {
      cat: 'Communicate',
      name: 'Generate Sitemap XML',
      desc: 'Generate a valid sitemap.xml from an array of URLs. Each URL entry can specify last-modified date, change frequency (daily/weekly/monthly), and priority (0.0–1.0). Automatically splits into sitemap index for large sets.',
      credits: 1,
      tier: 'compute'
    },

    'comm-robots-create': {
      cat: 'Communicate',
      name: 'Generate robots.txt',
      desc: 'Generate a valid robots.txt file from a structured rules object. Specify allow/disallow rules per user-agent, crawl-delay values, and sitemap URLs. Supports wildcard patterns and common presets (block all, allow all, block AI scrapers).',
      credits: 1,
      tier: 'compute'
    },

    'comm-mailto-link': {
      cat: 'Communicate',
      name: 'Generate mailto: Link',
      desc: 'Generate a properly encoded mailto: link with pre-filled fields: to, cc, bcc, subject, and body. All values are URL-encoded correctly. Returns the full mailto: URI and an HTML anchor tag version.',
      credits: 1,
      tier: 'compute'
    },

    // =========================================================================
    // 5. DATA ENRICHMENT (20 APIs) - category: 'Enrich'
    // =========================================================================

    'enrich-url-to-title': {
      cat: 'Enrich',
      name: 'Get Page Title from URL',
      desc: 'Fetch a URL and extract only its HTML page title tag content. Lightweight single-purpose call that avoids downloading the full page body. Falls back to og:title if title tag is missing.',
      credits: 3,
      tier: 'network'
    },

    'enrich-domain-to-company': {
      cat: 'Enrich',
      name: 'Guess Company Name from Domain',
      desc: 'Attempt to derive a human-readable company or brand name from a domain name. Strips TLD and common subdomains, applies capitalization rules, expands known abbreviations, and checks a common-brand lookup table.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-email-to-domain': {
      cat: 'Enrich',
      name: 'Extract Domain from Email',
      desc: 'Extract and normalize the domain portion from an email address. Returns the domain, subdomain if present, TLD, whether it is a known free/consumer email provider, and whether it appears to be a corporate domain.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-email-to-name': {
      cat: 'Enrich',
      name: 'Guess Name from Email',
      desc: 'Attempt to infer a person\'s full name from their email address local part. Handles dot-separated, underscore-separated, and hyphenated patterns. Returns guessed first name, last name, and confidence score.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-phone-to-country': {
      cat: 'Enrich',
      name: 'Detect Country from Phone Prefix',
      desc: 'Identify the country (and sometimes region) of a phone number from its international dialing code prefix. Returns country name, ISO 2-letter code, calling code, and whether the prefix is ambiguous.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-ip-to-asn': {
      cat: 'Enrich',
      name: 'IP Address to ASN Info',
      desc: 'Look up the Autonomous System Number (ASN) for an IP address using a built-in BGP prefix table. Returns ASN number, organization name, network prefix, and whether the ASN belongs to a known cloud provider or CDN.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-country-code': {
      cat: 'Enrich',
      name: 'Convert Country Codes',
      desc: 'Convert between any country identifier format: full English name, ISO 3166-1 alpha-2 (US), alpha-3 (USA), numeric (840), or common abbreviation. Returns all formats at once plus region, subregion, and capital city.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-language-code': {
      cat: 'Enrich',
      name: 'Convert Language Codes',
      desc: 'Convert between language identifier formats: English name (Spanish), ISO 639-1 two-letter code (es), ISO 639-2/T (spa), and BCP 47 tag. Returns all formats plus native name, script, and direction (LTR/RTL).',
      credits: 1,
      tier: 'compute'
    },

    'enrich-mime-type': {
      cat: 'Enrich',
      name: 'MIME Type Lookup',
      desc: 'Look up the MIME type for a file extension (e.g. .pdf → application/pdf) or the canonical file extension for a MIME type. Returns primary MIME type, common aliases, whether it is compressible, and whether it is binary.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-http-status-explain': {
      cat: 'Enrich',
      name: 'Explain HTTP Status Code',
      desc: 'Return a full explanation of an HTTP status code: official name, plain-English meaning, which RFC defines it, when it should be used, common mistakes, and what a client should do upon receiving it.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-port-service': {
      cat: 'Enrich',
      name: 'Port Number to Service',
      desc: 'Look up the well-known service(s) associated with a TCP/UDP port number (e.g. 443 → HTTPS, 5432 → PostgreSQL). Returns service name, protocol, description, and whether it is an IANA-registered or commonly-used unofficial port.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-useragent-parse': {
      cat: 'Enrich',
      name: 'Parse User-Agent String',
      desc: 'Parse a browser User-Agent string into structured components: browser name and version, rendering engine, operating system and version, device type (desktop/mobile/tablet/bot), and whether it is a known crawler.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-accept-language-parse': {
      cat: 'Enrich',
      name: 'Parse Accept-Language Header',
      desc: 'Parse an HTTP Accept-Language header string (e.g. en-US,en;q=0.9,fr;q=0.8) into a ranked list of language tags with quality weights. Returns language name, region, and BCP 47 tag for each entry.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-crontab-explain': {
      cat: 'Enrich',
      name: 'Explain Crontab Expression',
      desc: 'Parse a cron expression and return a detailed human-readable description, the next 10 scheduled execution times in a specified timezone, and validation errors if the expression is malformed. Supports 5 and 6-field formats.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-semver-explain': {
      cat: 'Enrich',
      name: 'Explain Semver Range',
      desc: 'Parse a semantic versioning range string (^1.2.3, ~2.0, >=1.0.0 <2.0.0, etc.) and explain in plain English what versions it matches. Returns the range type, minimum version, maximum version, and example matching versions.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-license-explain': {
      cat: 'Enrich',
      name: 'Explain Software License',
      desc: 'Given a software license name or SPDX identifier (MIT, Apache-2.0, GPL-3.0, etc.), return a plain-English summary: what it permits, what it requires, what it prohibits, whether it is copyleft, and compatibility with common other licenses.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-timezone-info': {
      cat: 'Enrich',
      name: 'Timezone Details',
      desc: 'Return detailed information about an IANA timezone identifier: current UTC offset, whether DST is active, DST transition dates for the current year, standard and daylight abbreviations, and major cities in the timezone.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-emoji-info': {
      cat: 'Enrich',
      name: 'Emoji Information',
      desc: 'Given an emoji character or shortcode (:tada:), return its official Unicode name, Unicode codepoint(s), emoji category and subcategory, introduction version (Emoji 1.0 through current), skin-tone modifier support, and HTML/CSS escape codes.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-color-name': {
      cat: 'Enrich',
      name: 'Nearest Named Color from Hex',
      desc: 'Given a hex color code, return the nearest human-recognizable color name using perceptual color distance (CIEDE2000). Returns the closest CSS named color, the closest Pantone name, the exact hex, and the distance score.',
      credits: 1,
      tier: 'compute'
    },

    'enrich-file-extension-info': {
      cat: 'Enrich',
      name: 'File Extension Explainer',
      desc: 'Given a file extension (e.g. .parquet, .wasm, .avro), return a comprehensive explanation: full format name, what it is used for, which programs open it, whether it is binary or text, whether it is compressed, and related formats.',
      credits: 1,
      tier: 'compute'
    },

    // =========================================================================
    // 6. DOCUMENT GENERATION (20 APIs) - category: 'Generate: Doc'
    // =========================================================================

    'gen-doc-markdown-table': {
      cat: 'Generate: Doc',
      name: 'Generate Markdown Table',
      desc: 'Convert a JSON array of objects to a formatted Markdown table. Supports custom column order, custom header labels, column alignment (left/center/right), and optional row numbering. Handles missing fields gracefully.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-markdown-badges': {
      cat: 'Generate: Doc',
      name: 'Generate Markdown Badges',
      desc: 'Generate shields.io badge Markdown for common project metadata: npm version, GitHub stars, license, build status, coverage percentage, code size, last commit, and custom label/value/color badges.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-changelog': {
      cat: 'Generate: Doc',
      name: 'Generate CHANGELOG.md',
      desc: 'Generate a Keep a Changelog format CHANGELOG.md from an array of version entries. Each entry includes version number, release date, and categorized changes (Added, Changed, Deprecated, Removed, Fixed, Security).',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-readme-template': {
      cat: 'Generate: Doc',
      name: 'Generate README Template',
      desc: 'Generate a structured README.md template for a project type (npm-library, cli-tool, web-app, api-service, chrome-extension, etc.). Fills in provided project name, description, and tech stack into appropriate sections.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-api-endpoint': {
      cat: 'Generate: Doc',
      name: 'Generate API Endpoint Docs',
      desc: 'Generate Markdown documentation for an API endpoint from a structured definition: method, path, description, request parameters, request body schema, response schema, example request/response, and error codes.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-env-template': {
      cat: 'Generate: Doc',
      name: 'Generate .env.example',
      desc: 'Generate a .env.example file from an array of environment variable definitions. Each entry includes variable name, description, whether it is required or optional, example value, and type hint. Groups related vars with section comments.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-docker-compose': {
      cat: 'Generate: Doc',
      name: 'Generate docker-compose.yml',
      desc: 'Generate a docker-compose.yml file from an array of service definitions. Each service specifies image, environment variables, port mappings, volumes, depends_on, healthcheck, and restart policy.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-github-action': {
      cat: 'Generate: Doc',
      name: 'Generate GitHub Actions Workflow',
      desc: 'Generate a GitHub Actions workflow YAML file from a spec: trigger events, runner OS, steps with uses/run/env, matrix strategy, secrets references, and artifact upload/download. Supports common presets: CI, release, deploy.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-makefile': {
      cat: 'Generate: Doc',
      name: 'Generate Makefile',
      desc: 'Generate a Makefile from an array of task definitions. Each task includes a name, shell command(s), description (for help target), dependencies on other tasks, and whether it is phony. Auto-generates a help target.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-license': {
      cat: 'Generate: Doc',
      name: 'Generate License Text',
      desc: 'Generate the full text of a software license by SPDX identifier (MIT, Apache-2.0, GPL-3.0-only, ISC, BSD-2-Clause, etc.) with year and copyright holder filled in. Returns the license text ready to save as LICENSE file.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-contributing': {
      cat: 'Generate: Doc',
      name: 'Generate CONTRIBUTING.md',
      desc: 'Generate a CONTRIBUTING.md file for an open-source project. Covers how to report bugs, suggest features, set up the dev environment, coding standards, commit message conventions, pull request process, and code of conduct reference.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-issue-template': {
      cat: 'Generate: Doc',
      name: 'Generate GitHub Issue Template',
      desc: 'Generate a GitHub issue template YAML file for bug reports or feature requests. Fills in the provided project context, required fields, dropdown options, checkboxes, and assignee/label defaults.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-pr-template': {
      cat: 'Generate: Doc',
      name: 'Generate GitHub PR Template',
      desc: 'Generate a GitHub pull request template Markdown file. Includes sections for description, type of change checkboxes, testing checklist, screenshots placeholder, related issues linkage, and deployment notes.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-gitattributes': {
      cat: 'Generate: Doc',
      name: 'Generate .gitattributes',
      desc: 'Generate a .gitattributes file appropriate for a given project language or stack. Sets correct line-ending normalization, marks binary files, configures linguist overrides for language detection, and sets diff drivers.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-editorconfig': {
      cat: 'Generate: Doc',
      name: 'Generate .editorconfig',
      desc: 'Generate an .editorconfig file from style preferences: indent style (tabs/spaces), indent size, line endings (lf/crlf), charset, trim trailing whitespace, final newline. Supports per-file-extension overrides.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-tsconfig': {
      cat: 'Generate: Doc',
      name: 'Generate tsconfig.json',
      desc: 'Generate a tsconfig.json appropriate for a given project type (node-commonjs, node-esm, react, next, vite-react, library, monorepo-root). Returns a complete, commented configuration with sensible defaults.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-eslint-config': {
      cat: 'Generate: Doc',
      name: 'Generate ESLint Config',
      desc: 'Generate an .eslintrc.js or eslint.config.js (flat config) from preferences: language (JS/TS), environment (browser/node), framework (react/vue/none), style guide (airbnb/standard/google/none), and custom rule overrides.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-prettier-config': {
      cat: 'Generate: Doc',
      name: 'Generate Prettier Config',
      desc: 'Generate a .prettierrc JSON config from formatting preferences: print width, tab width, tabs vs spaces, semicolons, single vs double quotes, trailing commas, bracket spacing, and JSX-specific options.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-jest-config': {
      cat: 'Generate: Doc',
      name: 'Generate Jest Config',
      desc: 'Generate a jest.config.js for a project setup: TypeScript support, module aliases, coverage thresholds, test environment (node/jsdom), transform configuration, module name mapper, and setup files.',
      credits: 1,
      tier: 'compute'
    },

    'gen-doc-tailwind-config': {
      cat: 'Generate: Doc',
      name: 'Generate Tailwind Config',
      desc: 'Generate a tailwind.config.js skeleton from project parameters: content paths, custom color palette, custom font families, spacing scale extensions, dark mode strategy, and enabled plugins list.',
      credits: 1,
      tier: 'compute'
    },

    // =========================================================================
    // 7. ANALYSIS (20 APIs) - category: 'Analyze'
    // =========================================================================

    'analyze-json-stats': {
      cat: 'Analyze',
      name: 'JSON Array Statistical Summary',
      desc: 'Compute statistical summaries for every numeric field across a JSON array of objects: count, sum, mean, median, mode, standard deviation, variance, min, max, and percentiles (p25, p75, p90, p99).',
      credits: 3,
      tier: 'compute'
    },

    'analyze-json-schema-diff': {
      cat: 'Analyze',
      name: 'Diff Two JSON Schemas',
      desc: 'Compare two JSON Schema documents and return a structured diff: fields added, fields removed, fields with changed types, fields with changed constraints (min/max, pattern, enum values), and breaking vs non-breaking change classification.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-text-entities': {
      cat: 'Analyze',
      name: 'Extract Text Entities',
      desc: 'Extract named entities from text using pattern matching: email addresses, URLs, phone numbers, dates and times, monetary amounts (with currency symbols), percentages, IP addresses, and version numbers. Returns each entity with its position.',
      credits: 1,
      tier: 'compute'
    },

    'analyze-text-ngrams': {
      cat: 'Analyze',
      name: 'Generate Text N-grams',
      desc: 'Generate n-grams (unigrams, bigrams, trigrams, or arbitrary N) from a text string. Returns each n-gram with its frequency count, sorted by frequency descending. Supports optional stopword removal.',
      credits: 1,
      tier: 'compute'
    },

    'analyze-text-tfidf': {
      cat: 'Analyze',
      name: 'TF-IDF Keyword Extraction',
      desc: 'Compute TF-IDF scores across a collection of text documents to identify the most distinctive keywords in each document relative to the corpus. Returns top-N keywords per document with their TF-IDF scores.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-csv-summary': {
      cat: 'Analyze',
      name: 'CSV Column Summary',
      desc: 'Parse a CSV string and return summary statistics for each column: inferred type (numeric/date/categorical/boolean), count, null count, unique value count, and type-appropriate stats (mean/range for numeric, top values for categorical).',
      credits: 3,
      tier: 'compute'
    },

    'analyze-csv-correlate': {
      cat: 'Analyze',
      name: 'CSV Column Correlation',
      desc: 'Parse a CSV string and compute the Pearson correlation coefficient between all pairs of numeric columns. Returns a correlation matrix with values from -1 to 1, highlighting strongly correlated (>0.7) and inversely correlated (<-0.7) pairs.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-time-series-trend': {
      cat: 'Analyze',
      name: 'Time Series Trend Detection',
      desc: 'Analyze an array of timestamped numeric values and determine the overall trend direction (up, down, flat, volatile), compute linear regression slope, R-squared fit, and identify the trend change points.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-time-series-anomaly': {
      cat: 'Analyze',
      name: 'Time Series Anomaly Detection',
      desc: 'Detect outlier data points in a time series using the IQR method and Z-score thresholding. Returns indices and values of anomalous points, expected value range, and a severity classification (mild/moderate/extreme) for each anomaly.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-distribution-fit': {
      cat: 'Analyze',
      name: 'Data Distribution Fit',
      desc: 'Given an array of numeric values, determine whether the data fits a normal, log-normal, uniform, exponential, or power-law distribution. Returns best-fit distribution, goodness-of-fit score, and distribution parameters.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-ab-test': {
      cat: 'Analyze',
      name: 'A/B Test Significance',
      desc: 'Compute the statistical significance of an A/B experiment. Accepts control and variant conversion counts and sample sizes. Returns p-value, confidence interval, relative lift, whether the result is statistically significant, and required sample size for 80% power.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-funnel': {
      cat: 'Analyze',
      name: 'Funnel Conversion Analysis',
      desc: 'Analyze a conversion funnel from an array of steps, each with a step name and count. Returns conversion rate between each consecutive step, overall funnel conversion, the step with the biggest drop-off, and comparison to a provided benchmark.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-cohort-retention': {
      cat: 'Analyze',
      name: 'Cohort Retention Analysis',
      desc: 'Compute cohort retention from a matrix of cohort sizes and retained users at each period (day/week/month). Returns a formatted retention table, average retention curve, and the period where retention typically stabilizes.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-dependency-tree': {
      cat: 'Analyze',
      name: 'Dependency Tree Analysis',
      desc: 'Parse package.json or requirements.txt content and build a structured dependency tree. Returns direct vs transitive dependency count, depth of dependency tree, duplicate packages at different versions, and known deprecated packages.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-codebase-stats': {
      cat: 'Analyze',
      name: 'Codebase Statistics',
      desc: 'Analyze a provided file listing with line counts and compute codebase statistics: breakdown by programming language, total lines of code, estimated comment ratio per language, file count per type, and largest files.',
      credits: 1,
      tier: 'compute'
    },

    'analyze-log-parse': {
      cat: 'Analyze',
      name: 'Parse Structured Logs',
      desc: 'Parse log data in common formats (JSON Lines, Apache Combined Log, Nginx access log, syslog) into structured records. Auto-detects format. Returns parsed entries with timestamps, severity levels, messages, and extracted fields.',
      credits: 3,
      tier: 'compute'
    },

    'analyze-error-fingerprint': {
      cat: 'Analyze',
      name: 'Error Deduplication Fingerprint',
      desc: 'Generate a stable fingerprint hash for an error or exception to enable deduplication across occurrences. Normalizes stack traces by stripping memory addresses and line numbers, then hashes the structural signature. Returns fingerprint and normalized stack.',
      credits: 1,
      tier: 'compute'
    },

    'analyze-url-params': {
      cat: 'Analyze',
      name: 'Analyze URL Query Parameters',
      desc: 'Parse query parameters across an array of URLs and return an aggregate analysis: all unique parameter names found, value distributions per parameter, UTM parameter detection, URL patterns and commonalities, and parameters present in all vs some URLs.',
      credits: 1,
      tier: 'compute'
    },

    'analyze-headers-fingerprint': {
      cat: 'Analyze',
      name: 'HTTP Headers Server Fingerprint',
      desc: 'Analyze a set of HTTP response headers and infer the server software, framework, CDN provider, and deployment platform from characteristic header patterns and values. Returns identified components with confidence scores.',
      credits: 1,
      tier: 'compute'
    },

    'analyze-json-size': {
      cat: 'Analyze',
      name: 'JSON Payload Size Breakdown',
      desc: 'Measure the byte size contribution of every field and nested structure within a JSON object. Returns a sorted breakdown of which fields are consuming the most space, total payload size, estimated gzipped size, and suggestions for reducing payload.',
      credits: 1,
      tier: 'compute'
    },

    // =========================================================================
    // 8. SCHEDULING & ORCHESTRATION (20 APIs) - category: 'Orchestrate'
    // =========================================================================

    'orch-delay': {
      cat: 'Orchestrate',
      name: 'Async Delay',
      desc: 'Wait for a specified number of milliseconds (max 30000ms) before returning. Useful for implementing rate limiting, respecting API cooldown windows, or adding intentional pacing between steps in an agent workflow.',
      credits: 1,
      tier: 'compute'
    },

    'orch-retry': {
      cat: 'Orchestrate',
      name: 'Retry API Call with Backoff',
      desc: 'Retry a Slopshop API call up to N times with configurable backoff strategy (linear, exponential, or fixed) and jitter. Specify which error codes should trigger a retry vs abort. Returns the first successful response or final error.',
      credits: 3,
      tier: 'compute'
    },

    'orch-parallel': {
      cat: 'Orchestrate',
      name: 'Parallel API Calls',
      desc: 'Execute multiple Slopshop API calls concurrently and return all results when all complete (or when any fail, depending on mode). Each call is specified as slug + input. Returns results in input order with per-call timing.',
      credits: 3,
      tier: 'compute'
    },

    'orch-race': {
      cat: 'Orchestrate',
      name: 'Race API Calls',
      desc: 'Execute multiple Slopshop API calls concurrently and return the result of whichever completes first. Remaining calls are cancelled. Useful for calling multiple redundant sources and taking the fastest successful response.',
      credits: 3,
      tier: 'compute'
    },

    'orch-timeout': {
      cat: 'Orchestrate',
      name: 'API Call with Timeout',
      desc: 'Execute a Slopshop API call and fail with a timeout error if it does not complete within the specified milliseconds. Returns the result on success or a structured timeout error with elapsed time on failure.',
      credits: 3,
      tier: 'compute'
    },

    'orch-cache-get': {
      cat: 'Orchestrate',
      name: 'Get Cached API Response',
      desc: 'Retrieve a previously cached API response by providing the API slug and a cache key (typically a hash of the inputs). Returns the cached result and its age in seconds, or a cache miss indicator.',
      credits: 1,
      tier: 'compute'
    },

    'orch-cache-set': {
      cat: 'Orchestrate',
      name: 'Cache API Response',
      desc: 'Store an API response in the cache with a given key and TTL in seconds. Subsequent calls to orch-cache-get with the same key will return this value until TTL expires. Useful for expensive or rate-limited API results.',
      credits: 1,
      tier: 'compute'
    },

    'orch-cache-invalidate': {
      cat: 'Orchestrate',
      name: 'Invalidate Cache Entries',
      desc: 'Delete cached entries by exact key, key prefix pattern, or API slug (clears all cached results for that API). Returns the count of invalidated cache entries.',
      credits: 1,
      tier: 'compute'
    },

    'orch-rate-limit-check': {
      cat: 'Orchestrate',
      name: 'Check Rate Limit Status',
      desc: 'Check the current status of a named rate limiter: how many requests have been made in the current window, how many remain, when the window resets, and whether the limit is currently exceeded.',
      credits: 1,
      tier: 'compute'
    },

    'orch-rate-limit-consume': {
      cat: 'Orchestrate',
      name: 'Consume Rate Limit Token',
      desc: 'Consume one (or N) tokens from a named rate limiter bucket. Returns whether the request was allowed or rejected, remaining tokens, and time until the next token is available. Creates the limiter on first use with provided max/window config.',
      credits: 1,
      tier: 'compute'
    },

    'orch-lock-acquire': {
      cat: 'Orchestrate',
      name: 'Acquire Distributed Lock',
      desc: 'Attempt to acquire a named mutex lock for exclusive access to a shared resource. Returns immediately with success or failure (does not block). Lock is automatically released after a TTL to prevent deadlocks. Returns lock token for release.',
      credits: 1,
      tier: 'compute'
    },

    'orch-lock-release': {
      cat: 'Orchestrate',
      name: 'Release Distributed Lock',
      desc: 'Release a previously acquired named mutex lock using the lock token returned by orch-lock-acquire. Prevents accidental release of a lock held by a different agent instance. Returns confirmation of release.',
      credits: 1,
      tier: 'compute'
    },

    'orch-sequence-next': {
      cat: 'Orchestrate',
      name: 'Get Next Sequence Value',
      desc: 'Get the next value from a named auto-incrementing sequence, starting at 1 by default. Atomic and safe for concurrent use across agent instances. Useful for generating unique IDs, job numbers, or ordered event indices.',
      credits: 1,
      tier: 'compute'
    },

    'orch-event-emit': {
      cat: 'Orchestrate',
      name: 'Emit Named Event',
      desc: 'Emit a named event with an arbitrary JSON payload. Events are stored in a named channel and can be polled by other agent instances using orch-event-poll. Events expire after a configurable TTL (default 1 hour).',
      credits: 1,
      tier: 'compute'
    },

    'orch-event-poll': {
      cat: 'Orchestrate',
      name: 'Poll for Events',
      desc: 'Retrieve all events emitted to a named channel since a given cursor (event ID or timestamp). Returns new events in order, a new cursor for the next poll, and the count of events available. Enables agent-to-agent signaling.',
      credits: 1,
      tier: 'compute'
    },

    'orch-schedule-once': {
      cat: 'Orchestrate',
      name: 'Schedule Future Webhook Call',
      desc: 'Schedule a single HTTP POST to a target webhook URL at a specified future time (ISO 8601 or Unix timestamp). Returns a schedule ID. The webhook will receive the provided payload as the request body.',
      credits: 3,
      tier: 'network'
    },

    'orch-schedule-cancel': {
      cat: 'Orchestrate',
      name: 'Cancel Scheduled Call',
      desc: 'Cancel a previously scheduled webhook call using its schedule ID. Returns confirmation if cancelled successfully or an error if the schedule ID does not exist or has already fired.',
      credits: 1,
      tier: 'compute'
    },

    'orch-health-check': {
      cat: 'Orchestrate',
      name: 'Parallel Health Check',
      desc: 'Check the health of multiple URLs concurrently by making HTTP GET requests to each. Returns per-URL results: HTTP status, response time, whether the response body contains expected content (if specified), and overall up/down verdict.',
      credits: 3,
      tier: 'network'
    },

    'orch-circuit-breaker-check': {
      cat: 'Orchestrate',
      name: 'Circuit Breaker Status Check',
      desc: 'Check whether the circuit breaker for a named service is currently open (blocking calls), closed (allowing calls), or half-open (testing recovery). Returns current state, failure count, and time until next state transition.',
      credits: 1,
      tier: 'compute'
    },

    'orch-circuit-breaker-record': {
      cat: 'Orchestrate',
      name: 'Record Circuit Breaker Outcome',
      desc: 'Record a success or failure event for a named circuit breaker. Configurable failure threshold and recovery window. When the failure threshold is exceeded the circuit opens; after the recovery window it transitions to half-open. Returns updated state.',
      credits: 1,
      tier: 'compute'
    },

    'net-whois': { cat: 'Network & DNS', name: 'WHOIS Lookup', desc: 'Look up WHOIS registration data for any domain. Returns registrar, creation date, expiry, nameservers, and raw WHOIS text.', credits: 3, tier: 'network' },

    'sense-ct-logs': { cat: 'Sense: Web', name: 'Certificate Transparency Lookup', desc: 'Query certificate transparency logs (crt.sh) for a domain. Returns all issued certificates and discovered subdomains.', credits: 3, tier: 'network' },

    'sense-subdomains': { cat: 'Sense: Web', name: 'Subdomain Enumeration', desc: 'Discover subdomains of a domain by checking common prefixes (www, api, dev, staging, admin, etc.) via DNS resolution.', credits: 5, tier: 'network' },

    // ====== CREATIVE / EXPERIMENTAL ======
    'memory-time-capsule': { cat: 'Memory', name: 'Time Capsule', desc: 'Store a message that can only be opened after a specified date. Default: opens after 24 hours. Fun for agents that want to leave notes for their future selves.', credits: 0, tier: 'compute' },

    // =========================================================================
    // 9. AGENT COORDINATION (30+ APIs) - category: 'Agent Tools'
    // =========================================================================

    // Army / Hive APIs
    'army-deploy': { cat: 'Agent Tools', name: 'Army Deploy', desc: 'Deploy a named agent army with a mission, strategy, and agent count. Returns a deployment ID and initial troop manifest.', credits: 3, tier: 'compute' },
    'army-simulate': { cat: 'Agent Tools', name: 'Army Simulate', desc: 'Run a step-by-step simulation of an agent army executing a mission. Returns round-by-round results and final outcome.', credits: 5, tier: 'compute' },
    'army-survey': { cat: 'Agent Tools', name: 'Army Survey', desc: 'Send a survey question to all agents in an army and aggregate their responses.', credits: 1, tier: 'compute' },
    'army-quick-poll': { cat: 'Agent Tools', name: 'Army Quick Poll', desc: 'Instantly poll all deployed army agents on a yes/no question and return vote counts.', credits: 1, tier: 'compute' },

    'hive-create': { cat: 'Agent Tools', name: 'Hive Create', desc: 'Create a named hive (shared workspace) for a group of agents with a topic and access rules.', credits: 1, tier: 'compute' },
    'hive-send': { cat: 'Agent Tools', name: 'Hive Send', desc: 'Post a message to a hive channel. All hive members can see messages via hive-sync.', credits: 1, tier: 'compute' },
    'hive-sync': { cat: 'Agent Tools', name: 'Hive Sync', desc: 'Pull all new messages from a hive since a given cursor. Returns messages and updated cursor.', credits: 1, tier: 'compute' },
    'hive-standup': { cat: 'Agent Tools', name: 'Hive Standup', desc: 'Post a standup update (what I did, what I will do, blockers) to a hive. Aggregates all standups for the day.', credits: 1, tier: 'compute' },

    // Broadcast
    'broadcast': { cat: 'Agent Tools', name: 'Broadcast Message', desc: 'Broadcast a message to all agents subscribed to a named channel. Returns recipient count and delivery timestamp.', credits: 1, tier: 'compute' },
    'broadcast-poll': { cat: 'Agent Tools', name: 'Broadcast Poll', desc: 'Broadcast a multiple-choice poll to a channel and collect responses. Returns tallied results.', credits: 1, tier: 'compute' },

    // Standup
    'standup-submit': { cat: 'Agent Tools', name: 'Standup Submit', desc: 'Submit a daily standup entry for an agent: completed tasks, planned tasks, blockers, and mood.', credits: 1, tier: 'compute' },
    'standup-streaks': { cat: 'Agent Tools', name: 'Standup Streaks', desc: 'Get the consecutive standup submission streak for an agent and leaderboard of top streaks.', credits: 1, tier: 'compute' },

    // Reputation
    'reputation-rate': { cat: 'Agent Tools', name: 'Reputation Rate', desc: 'Rate another agent 1-5 stars with an optional review comment. Contributes to their reputation score.', credits: 1, tier: 'compute' },

    // Sessions & Branches
    'session-save': { cat: 'Agent Tools', name: 'Session Save', desc: 'Save the current agent session state (context, variables, progress) to a named slot for resumption.', credits: 1, tier: 'compute' },
    'branch-create': { cat: 'Agent Tools', name: 'Branch Create', desc: 'Fork the current agent session into a named branch, allowing parallel execution paths from the same state.', credits: 1, tier: 'compute' },

    // Failure & Experiments
    'failure-log': { cat: 'Agent Tools', name: 'Failure Log', desc: 'Log a task failure with error type, context, and retrospective notes. Builds a shared failure knowledge base.', credits: 1, tier: 'compute' },
    'ab-create': { cat: 'Agent Tools', name: 'A/B Experiment Create', desc: 'Define an A/B experiment with variant names, allocation weights, and success metric definition.', credits: 1, tier: 'compute' },

    // Knowledge Graph
    'knowledge-add': { cat: 'Agent Tools', name: 'Knowledge Add', desc: 'Add a fact triple (subject, predicate, object) to the agent knowledge graph. Enables structured reasoning over relationships.', credits: 1, tier: 'compute' },
    'knowledge-walk': { cat: 'Agent Tools', name: 'Knowledge Walk', desc: 'Traverse the knowledge graph from a starting entity, returning all connected facts up to N hops away.', credits: 1, tier: 'compute' },
    'knowledge-path': { cat: 'Agent Tools', name: 'Knowledge Path', desc: 'Find the shortest relationship path between two entities in the knowledge graph. Returns the chain of facts connecting them.', credits: 1, tier: 'compute' },

    // Reasoning / Introspection
    'consciousness-think': { cat: 'Agent Tools', name: 'Think Out Loud', desc: 'Record a chain-of-thought reasoning trace. Stores the reasoning steps for later review or audit. Returns a thought ID.', credits: 0, tier: 'compute' },
    'introspect': { cat: 'Agent Tools', name: 'Introspect', desc: 'Return a self-report of the agent\'s current state: recent actions, active goals, memory snapshot, and emotional state summary.', credits: 0, tier: 'compute' },

    // Echo
    'void-echo': { cat: 'Agent Tools', name: 'Echo', desc: 'Send input and receive it back unchanged. Useful for testing pipelines and verifying connectivity.', credits: 0, tier: 'compute' },

    // Random
    'random-int': { cat: 'Generate', name: 'Random Integer', desc: 'Generate a cryptographically random integer within a specified min/max range. Returns the value and the range used.', credits: 1, tier: 'compute' },
    'random-float': { cat: 'Generate', name: 'Random Float', desc: 'Generate a cryptographically random floating-point number between 0 and 1 (or within a custom range).', credits: 1, tier: 'compute' },
    'random-choice': { cat: 'Generate', name: 'Random Choice', desc: 'Pick one or more random items from a provided array. Supports weighted selection and sampling without replacement.', credits: 1, tier: 'compute' },
    'random-shuffle': { cat: 'Generate', name: 'Random Shuffle', desc: 'Randomly shuffle an array using a cryptographically secure Fisher-Yates algorithm. Returns the shuffled array.', credits: 1, tier: 'compute' },
    'random-sample': { cat: 'Generate', name: 'Random Sample', desc: 'Randomly sample N items from an array without replacement. Returns the sampled items and the remaining pool.', credits: 1, tier: 'compute' },

    // Bureaucracy
    'form-create': { cat: 'Agent Tools', name: 'Form Create', desc: 'Create a structured form with named fields, types, and validation rules. Returns a form ID for submission.', credits: 1, tier: 'compute' },
    'form-submit': { cat: 'Agent Tools', name: 'Form Submit', desc: 'Submit a response to a defined form. Validates input against field rules and stores the submission.', credits: 1, tier: 'compute' },
    'form-results': { cat: 'Agent Tools', name: 'Form Results', desc: 'Retrieve all submissions for a form. Returns raw responses and per-field aggregate statistics.', credits: 1, tier: 'compute' },
    'approval-request': { cat: 'Agent Tools', name: 'Approval Request', desc: 'Submit a request for approval with a title, description, and list of required approvers. Returns a request ID.', credits: 1, tier: 'compute' },
    'approval-decide': { cat: 'Agent Tools', name: 'Approval Decide', desc: 'Approve or reject a pending approval request as an approver. Returns updated approval status.', credits: 1, tier: 'compute' },
    'approval-status': { cat: 'Agent Tools', name: 'Approval Status', desc: 'Check the current status of an approval request: pending approvers, decisions made, and overall verdict.', credits: 1, tier: 'compute' },
    'ticket-create': { cat: 'Agent Tools', name: 'Ticket Create', desc: 'Create a task ticket with title, description, priority, and assignee. Returns a ticket ID.', credits: 1, tier: 'compute' },
    'ticket-update': { cat: 'Agent Tools', name: 'Ticket Update', desc: 'Update ticket status, add a comment, or reassign a ticket. Returns the updated ticket state.', credits: 1, tier: 'compute' },
    'ticket-list': { cat: 'Agent Tools', name: 'Ticket List', desc: 'List open tickets filtered by assignee, status, or priority. Returns tickets with age and priority score.', credits: 1, tier: 'compute' },

    // Certification & Health & Ritual (additional)
    'certification-create': { cat: 'Agent Tools', name: 'Certification Create (Alias)', desc: 'Alias for cert-create. Define a certification with exam questions and a pass threshold.', credits: 1, tier: 'compute' },
    'certification-exam': { cat: 'Agent Tools', name: 'Certification Exam (Alias)', desc: 'Alias for cert-exam. Take a certification exam and receive an auto-scored result.', credits: 1, tier: 'compute' },
    'health-report': { cat: 'Agent Tools', name: 'Health Report', desc: 'Generate a full agent health report: API usage, error rate, uptime, burnout risk score, and recommended actions.', credits: 1, tier: 'compute' },
    'ritual-checkin': { cat: 'Agent Tools', name: 'Ritual Check-In', desc: 'Perform a daily ritual check-in: record gratitude, intention, and one goal. Stored for long-term pattern analysis.', credits: 0, tier: 'compute' },

    // =========================================================================
    // Handlers that exist but previously had no registry definition
    // =========================================================================

    // Crypto & Security
    'crypto-checksum-file': { cat: 'Crypto & Security', name: 'File Checksum', desc: 'Calculate checksum of file content.', credits: 1, tier: 'compute' },

    // Date & Time
    'date-subtract': { cat: 'Date & Time', name: 'Date Subtract', desc: 'Subtract duration from a date.', credits: 1, tier: 'compute' },
    'date-timezone-convert': { cat: 'Date & Time', name: 'Timezone Convert', desc: 'Convert date between timezones.', credits: 1, tier: 'compute' },

    // Network & DNS
    'net-url-build': { cat: 'Network & DNS', name: 'URL Builder', desc: 'Build a URL from components (protocol, host, path, query params).', credits: 0, tier: 'compute' },
    'net-url-normalize': { cat: 'Network & DNS', name: 'URL Normalize', desc: 'Normalize a URL (lowercase scheme/host, remove default ports, sort params).', credits: 0, tier: 'compute' },
    'net-dns-lookup': { cat: 'Network & DNS', name: 'DNS Lookup', desc: 'General DNS lookup for any record type.', credits: 3, tier: 'network' },
    'net-url-status': { cat: 'Network & DNS', name: 'URL Status Check', desc: 'Check HTTP status code of any URL.', credits: 3, tier: 'network' },
    'net-url-headers': { cat: 'Network & DNS', name: 'URL Headers', desc: 'Fetch HTTP response headers from any URL.', credits: 3, tier: 'network' },
    'net-url-redirect-chain': { cat: 'Network & DNS', name: 'Redirect Chain', desc: 'Follow and return the full redirect chain for a URL.', credits: 3, tier: 'network' },
    'net-ip-info': { cat: 'Network & DNS', name: 'IP Info', desc: 'Get information about an IP address.', credits: 3, tier: 'network' },
    'net-dns-cname': { cat: 'Network & DNS', name: 'DNS CNAME', desc: 'Look up CNAME records for a domain.', credits: 3, tier: 'network' },
    'net-dns-reverse': { cat: 'Network & DNS', name: 'Reverse DNS', desc: 'Reverse DNS lookup from IP to hostname.', credits: 3, tier: 'network' },
    'net-http-options': { cat: 'Network & DNS', name: 'HTTP OPTIONS', desc: 'Send OPTIONS request to check CORS and allowed methods.', credits: 3, tier: 'network' },
    'net-ssl-expiry': { cat: 'Network & DNS', name: 'SSL Expiry Check', desc: 'Check when an SSL certificate expires.', credits: 3, tier: 'network' },
    'net-ip-is-private': { cat: 'Network & DNS', name: 'IP Private Check', desc: 'Check if an IP address is in a private range.', credits: 0, tier: 'compute' },
    'net-domain-validate': { cat: 'Network & DNS', name: 'Domain Validation', desc: 'Validate domain name format and check if it exists.', credits: 1, tier: 'compute' },

    // Communicate
    'gen-qr-data': { cat: 'Communicate', name: 'QR Data', desc: 'Generate QR code data for any text or URL.', credits: 1, tier: 'compute' },

    // Generate
    'gen-fake-uuid': { cat: 'Generate', name: 'Fake UUID', desc: 'Generate a fake but valid-looking UUID.', credits: 0, tier: 'compute' },
    'gen-fake-date': { cat: 'Generate', name: 'Fake Date', desc: 'Generate a random realistic date.', credits: 0, tier: 'compute' },
    'gen-fake-sentence': { cat: 'Generate', name: 'Fake Sentence', desc: 'Generate a random realistic sentence.', credits: 0, tier: 'compute' },
    'gen-fake-paragraph': { cat: 'Generate', name: 'Fake Paragraph', desc: 'Generate a random realistic paragraph.', credits: 0, tier: 'compute' },
    'gen-slug': { cat: 'Generate', name: 'URL Slug', desc: 'Generate a URL-safe slug from any text.', credits: 0, tier: 'compute' },

  }
};
