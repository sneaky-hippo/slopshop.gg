'use strict';

const crypto = require('crypto');
const url = require('url');

// ---------------------------------------------------------------------------
// Built-in lookup tables
// ---------------------------------------------------------------------------

const PHONE_PREFIXES = [
  { prefix: '+1',   country: 'United States', code: 'US' },
  { prefix: '+44',  country: 'United Kingdom', code: 'GB' },
  { prefix: '+49',  country: 'Germany', code: 'DE' },
  { prefix: '+33',  country: 'France', code: 'FR' },
  { prefix: '+39',  country: 'Italy', code: 'IT' },
  { prefix: '+34',  country: 'Spain', code: 'ES' },
  { prefix: '+81',  country: 'Japan', code: 'JP' },
  { prefix: '+86',  country: 'China', code: 'CN' },
  { prefix: '+91',  country: 'India', code: 'IN' },
  { prefix: '+55',  country: 'Brazil', code: 'BR' },
  { prefix: '+7',   country: 'Russia', code: 'RU' },
  { prefix: '+61',  country: 'Australia', code: 'AU' },
  { prefix: '+82',  country: 'South Korea', code: 'KR' },
  { prefix: '+52',  country: 'Mexico', code: 'MX' },
  { prefix: '+31',  country: 'Netherlands', code: 'NL' },
  { prefix: '+46',  country: 'Sweden', code: 'SE' },
  { prefix: '+41',  country: 'Switzerland', code: 'CH' },
  { prefix: '+47',  country: 'Norway', code: 'NO' },
  { prefix: '+45',  country: 'Denmark', code: 'DK' },
  { prefix: '+48',  country: 'Poland', code: 'PL' },
];

const COUNTRIES = [
  { name: 'Afghanistan', iso2: 'AF', iso3: 'AFG' },
  { name: 'Argentina', iso2: 'AR', iso3: 'ARG' },
  { name: 'Australia', iso2: 'AU', iso3: 'AUS' },
  { name: 'Austria', iso2: 'AT', iso3: 'AUT' },
  { name: 'Belgium', iso2: 'BE', iso3: 'BEL' },
  { name: 'Brazil', iso2: 'BR', iso3: 'BRA' },
  { name: 'Canada', iso2: 'CA', iso3: 'CAN' },
  { name: 'Chile', iso2: 'CL', iso3: 'CHL' },
  { name: 'China', iso2: 'CN', iso3: 'CHN' },
  { name: 'Colombia', iso2: 'CO', iso3: 'COL' },
  { name: 'Denmark', iso2: 'DK', iso3: 'DNK' },
  { name: 'Egypt', iso2: 'EG', iso3: 'EGY' },
  { name: 'Finland', iso2: 'FI', iso3: 'FIN' },
  { name: 'France', iso2: 'FR', iso3: 'FRA' },
  { name: 'Germany', iso2: 'DE', iso3: 'DEU' },
  { name: 'Greece', iso2: 'GR', iso3: 'GRC' },
  { name: 'India', iso2: 'IN', iso3: 'IND' },
  { name: 'Indonesia', iso2: 'ID', iso3: 'IDN' },
  { name: 'Ireland', iso2: 'IE', iso3: 'IRL' },
  { name: 'Israel', iso2: 'IL', iso3: 'ISR' },
  { name: 'Italy', iso2: 'IT', iso3: 'ITA' },
  { name: 'Japan', iso2: 'JP', iso3: 'JPN' },
  { name: 'Mexico', iso2: 'MX', iso3: 'MEX' },
  { name: 'Netherlands', iso2: 'NL', iso3: 'NLD' },
  { name: 'New Zealand', iso2: 'NZ', iso3: 'NZL' },
  { name: 'Nigeria', iso2: 'NG', iso3: 'NGA' },
  { name: 'Norway', iso2: 'NO', iso3: 'NOR' },
  { name: 'Pakistan', iso2: 'PK', iso3: 'PAK' },
  { name: 'Poland', iso2: 'PL', iso3: 'POL' },
  { name: 'Portugal', iso2: 'PT', iso3: 'PRT' },
  { name: 'Russia', iso2: 'RU', iso3: 'RUS' },
  { name: 'Saudi Arabia', iso2: 'SA', iso3: 'SAU' },
  { name: 'South Africa', iso2: 'ZA', iso3: 'ZAF' },
  { name: 'South Korea', iso2: 'KR', iso3: 'KOR' },
  { name: 'Spain', iso2: 'ES', iso3: 'ESP' },
  { name: 'Sweden', iso2: 'SE', iso3: 'SWE' },
  { name: 'Switzerland', iso2: 'CH', iso3: 'CHE' },
  { name: 'Turkey', iso2: 'TR', iso3: 'TUR' },
  { name: 'Ukraine', iso2: 'UA', iso3: 'UKR' },
  { name: 'United Arab Emirates', iso2: 'AE', iso3: 'ARE' },
  { name: 'United Kingdom', iso2: 'GB', iso3: 'GBR' },
  { name: 'United States', iso2: 'US', iso3: 'USA' },
  { name: 'Vietnam', iso2: 'VN', iso3: 'VNM' },
  { name: 'Bangladesh', iso2: 'BD', iso3: 'BGD' },
  { name: 'Ethiopia', iso2: 'ET', iso3: 'ETH' },
  { name: 'Philippines', iso2: 'PH', iso3: 'PHL' },
  { name: 'Tanzania', iso2: 'TZ', iso3: 'TZA' },
  { name: 'Kenya', iso2: 'KE', iso3: 'KEN' },
  { name: 'Ghana', iso2: 'GH', iso3: 'GHA' },
  { name: 'Peru', iso2: 'PE', iso3: 'PER' },
];

const LANGUAGES = [
  { name: 'Afrikaans', code: 'af' },
  { name: 'Arabic', code: 'ar' },
  { name: 'Bengali', code: 'bn' },
  { name: 'Bulgarian', code: 'bg' },
  { name: 'Chinese', code: 'zh' },
  { name: 'Croatian', code: 'hr' },
  { name: 'Czech', code: 'cs' },
  { name: 'Danish', code: 'da' },
  { name: 'Dutch', code: 'nl' },
  { name: 'English', code: 'en' },
  { name: 'Finnish', code: 'fi' },
  { name: 'French', code: 'fr' },
  { name: 'German', code: 'de' },
  { name: 'Greek', code: 'el' },
  { name: 'Hebrew', code: 'he' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Hungarian', code: 'hu' },
  { name: 'Indonesian', code: 'id' },
  { name: 'Italian', code: 'it' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Korean', code: 'ko' },
  { name: 'Malay', code: 'ms' },
  { name: 'Norwegian', code: 'no' },
  { name: 'Persian', code: 'fa' },
  { name: 'Polish', code: 'pl' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Romanian', code: 'ro' },
  { name: 'Russian', code: 'ru' },
  { name: 'Spanish', code: 'es' },
  { name: 'Swedish', code: 'sv' },
];

const MIME_TYPES = {
  '.json':   { mime: 'application/json',          category: 'data' },
  '.xml':    { mime: 'application/xml',            category: 'data' },
  '.yaml':   { mime: 'application/x-yaml',         category: 'data' },
  '.yml':    { mime: 'application/x-yaml',         category: 'data' },
  '.csv':    { mime: 'text/csv',                   category: 'data' },
  '.txt':    { mime: 'text/plain',                 category: 'text' },
  '.md':     { mime: 'text/markdown',              category: 'text' },
  '.html':   { mime: 'text/html',                  category: 'text' },
  '.htm':    { mime: 'text/html',                  category: 'text' },
  '.css':    { mime: 'text/css',                   category: 'text' },
  '.js':     { mime: 'application/javascript',     category: 'code' },
  '.mjs':    { mime: 'application/javascript',     category: 'code' },
  '.ts':     { mime: 'application/typescript',     category: 'code' },
  '.py':     { mime: 'text/x-python',              category: 'code' },
  '.rb':     { mime: 'text/x-ruby',                category: 'code' },
  '.go':     { mime: 'text/x-go',                  category: 'code' },
  '.rs':     { mime: 'text/x-rust',                category: 'code' },
  '.java':   { mime: 'text/x-java-source',         category: 'code' },
  '.c':      { mime: 'text/x-csrc',                category: 'code' },
  '.cpp':    { mime: 'text/x-c++src',              category: 'code' },
  '.sh':     { mime: 'application/x-sh',           category: 'code' },
  '.png':    { mime: 'image/png',                  category: 'image' },
  '.jpg':    { mime: 'image/jpeg',                 category: 'image' },
  '.jpeg':   { mime: 'image/jpeg',                 category: 'image' },
  '.gif':    { mime: 'image/gif',                  category: 'image' },
  '.svg':    { mime: 'image/svg+xml',              category: 'image' },
  '.webp':   { mime: 'image/webp',                 category: 'image' },
  '.ico':    { mime: 'image/x-icon',               category: 'image' },
  '.pdf':    { mime: 'application/pdf',            category: 'document' },
  '.zip':    { mime: 'application/zip',            category: 'archive' },
  '.tar':    { mime: 'application/x-tar',          category: 'archive' },
  '.gz':     { mime: 'application/gzip',           category: 'archive' },
  '.mp3':    { mime: 'audio/mpeg',                 category: 'audio' },
  '.mp4':    { mime: 'video/mp4',                  category: 'video' },
  '.webm':   { mime: 'video/webm',                 category: 'video' },
  '.woff':   { mime: 'font/woff',                  category: 'font' },
  '.woff2':  { mime: 'font/woff2',                 category: 'font' },
  '.ttf':    { mime: 'font/ttf',                   category: 'font' },
  '.eot':    { mime: 'application/vnd.ms-fontobject', category: 'font' },
  '.ics':    { mime: 'text/calendar',              category: 'data' },
  '.vcf':    { mime: 'text/vcard',                 category: 'data' },
  '.sql':    { mime: 'application/sql',            category: 'code' },
  '.toml':   { mime: 'application/toml',           category: 'data' },
  '.ini':    { mime: 'text/plain',                 category: 'config' },
  '.env':    { mime: 'text/plain',                 category: 'config' },
  '.log':    { mime: 'text/plain',                 category: 'text' },
  '.wasm':   { mime: 'application/wasm',           category: 'binary' },
  '.proto':  { mime: 'text/plain',                 category: 'code' },
  '.graphql':{ mime: 'application/graphql',        category: 'code' },
  '.dockerfile': { mime: 'text/plain',             category: 'config' },
  '.makefile': { mime: 'text/x-makefile',          category: 'config' },
};

const HTTP_STATUSES = {
  100: { status: 'Continue', description: 'The server has received the request headers and the client should proceed.', category: 'Informational' },
  101: { status: 'Switching Protocols', description: 'The requester has asked the server to switch protocols.', category: 'Informational' },
  102: { status: 'Processing', description: 'The server has received and is processing the request but no response is available yet.', category: 'Informational' },
  200: { status: 'OK', description: 'The request has succeeded.', category: 'Success' },
  201: { status: 'Created', description: 'The request has been fulfilled and a new resource has been created.', category: 'Success' },
  202: { status: 'Accepted', description: 'The request has been accepted for processing but the processing has not been completed.', category: 'Success' },
  203: { status: 'Non-Authoritative Information', description: 'The request was successful but the response comes from a third-party.', category: 'Success' },
  204: { status: 'No Content', description: 'The server successfully processed the request and is not returning any content.', category: 'Success' },
  206: { status: 'Partial Content', description: 'The server is delivering only part of the resource due to a range header.', category: 'Success' },
  301: { status: 'Moved Permanently', description: 'The URL of the requested resource has been changed permanently.', category: 'Redirection' },
  302: { status: 'Found', description: 'The URI of requested resource has been changed temporarily.', category: 'Redirection' },
  304: { status: 'Not Modified', description: 'The resource has not been modified since the last request.', category: 'Redirection' },
  307: { status: 'Temporary Redirect', description: 'The request should be repeated with another URI but future requests can still use the original URI.', category: 'Redirection' },
  308: { status: 'Permanent Redirect', description: 'The resource is now permanently located at another URI.', category: 'Redirection' },
  400: { status: 'Bad Request', description: 'The server cannot process the request due to a client error.', category: 'Client Error' },
  401: { status: 'Unauthorized', description: 'Authentication is required and has failed or not been provided.', category: 'Client Error' },
  403: { status: 'Forbidden', description: 'The server understood the request but refuses to authorize it.', category: 'Client Error' },
  404: { status: 'Not Found', description: 'The requested resource could not be found.', category: 'Client Error' },
  405: { status: 'Method Not Allowed', description: 'The request method is not supported for the requested resource.', category: 'Client Error' },
  408: { status: 'Request Timeout', description: 'The server timed out waiting for the request.', category: 'Client Error' },
  409: { status: 'Conflict', description: 'The request conflicts with the current state of the server.', category: 'Client Error' },
  410: { status: 'Gone', description: 'The resource requested is no longer available and will not be available again.', category: 'Client Error' },
  413: { status: 'Payload Too Large', description: 'The request is larger than the server is willing or able to process.', category: 'Client Error' },
  415: { status: 'Unsupported Media Type', description: 'The media format of the requested data is not supported.', category: 'Client Error' },
  422: { status: 'Unprocessable Entity', description: 'The request was well-formed but contains semantic errors.', category: 'Client Error' },
  429: { status: 'Too Many Requests', description: 'The user has sent too many requests in a given amount of time (rate limiting).', category: 'Client Error' },
  500: { status: 'Internal Server Error', description: 'The server encountered an unexpected condition that prevented it from fulfilling the request.', category: 'Server Error' },
  501: { status: 'Not Implemented', description: 'The server does not support the functionality required to fulfill the request.', category: 'Server Error' },
  502: { status: 'Bad Gateway', description: 'The server received an invalid response from an inbound server.', category: 'Server Error' },
  503: { status: 'Service Unavailable', description: 'The server is not ready to handle the request.', category: 'Server Error' },
  504: { status: 'Gateway Timeout', description: 'The server did not receive a timely response from an upstream server.', category: 'Server Error' },
};

const PORT_SERVICES = {
  20:   { service: 'FTP Data',    protocol: 'TCP', description: 'File Transfer Protocol data transfer' },
  21:   { service: 'FTP',         protocol: 'TCP', description: 'File Transfer Protocol control' },
  22:   { service: 'SSH',         protocol: 'TCP', description: 'Secure Shell remote access' },
  23:   { service: 'Telnet',      protocol: 'TCP', description: 'Unencrypted text communications' },
  25:   { service: 'SMTP',        protocol: 'TCP', description: 'Simple Mail Transfer Protocol' },
  53:   { service: 'DNS',         protocol: 'TCP/UDP', description: 'Domain Name System' },
  67:   { service: 'DHCP',        protocol: 'UDP', description: 'Dynamic Host Configuration Protocol server' },
  68:   { service: 'DHCP',        protocol: 'UDP', description: 'Dynamic Host Configuration Protocol client' },
  80:   { service: 'HTTP',        protocol: 'TCP', description: 'Hypertext Transfer Protocol' },
  110:  { service: 'POP3',        protocol: 'TCP', description: 'Post Office Protocol 3' },
  143:  { service: 'IMAP',        protocol: 'TCP', description: 'Internet Message Access Protocol' },
  194:  { service: 'IRC',         protocol: 'TCP', description: 'Internet Relay Chat' },
  443:  { service: 'HTTPS',       protocol: 'TCP', description: 'HTTP over TLS/SSL' },
  465:  { service: 'SMTPS',       protocol: 'TCP', description: 'SMTP over SSL' },
  587:  { service: 'SMTP',        protocol: 'TCP', description: 'SMTP mail submission' },
  993:  { service: 'IMAPS',       protocol: 'TCP', description: 'IMAP over SSL' },
  995:  { service: 'POP3S',       protocol: 'TCP', description: 'POP3 over SSL' },
  1433: { service: 'MSSQL',       protocol: 'TCP', description: 'Microsoft SQL Server' },
  1521: { service: 'Oracle DB',   protocol: 'TCP', description: 'Oracle Database' },
  2181: { service: 'Zookeeper',   protocol: 'TCP', description: 'Apache ZooKeeper' },
  3000: { service: 'Dev Server',  protocol: 'TCP', description: 'Common development server port' },
  3306: { service: 'MySQL',       protocol: 'TCP', description: 'MySQL database' },
  5432: { service: 'PostgreSQL',  protocol: 'TCP', description: 'PostgreSQL database' },
  5672: { service: 'RabbitMQ',    protocol: 'TCP', description: 'RabbitMQ AMQP' },
  6379: { service: 'Redis',       protocol: 'TCP', description: 'Redis in-memory data store' },
  8080: { service: 'HTTP Alt',    protocol: 'TCP', description: 'Alternative HTTP port' },
  8443: { service: 'HTTPS Alt',   protocol: 'TCP', description: 'Alternative HTTPS port' },
  9200: { service: 'Elasticsearch', protocol: 'TCP', description: 'Elasticsearch REST API' },
  27017:{ service: 'MongoDB',     protocol: 'TCP', description: 'MongoDB database' },
};

const TIMEZONES = {
  'UTC':                  { utc_offset: '+00:00', region: 'Universal', cities: ['Reykjavik', 'Accra'] },
  'America/New_York':     { utc_offset: '-05:00', region: 'Americas', cities: ['New York', 'Miami', 'Toronto'] },
  'America/Chicago':      { utc_offset: '-06:00', region: 'Americas', cities: ['Chicago', 'Dallas', 'Houston'] },
  'America/Denver':       { utc_offset: '-07:00', region: 'Americas', cities: ['Denver', 'Phoenix'] },
  'America/Los_Angeles':  { utc_offset: '-08:00', region: 'Americas', cities: ['Los Angeles', 'San Francisco', 'Seattle'] },
  'America/Sao_Paulo':    { utc_offset: '-03:00', region: 'Americas', cities: ['Sao Paulo', 'Rio de Janeiro'] },
  'America/Buenos_Aires': { utc_offset: '-03:00', region: 'Americas', cities: ['Buenos Aires'] },
  'America/Mexico_City':  { utc_offset: '-06:00', region: 'Americas', cities: ['Mexico City'] },
  'America/Vancouver':    { utc_offset: '-08:00', region: 'Americas', cities: ['Vancouver'] },
  'Europe/London':        { utc_offset: '+00:00', region: 'Europe', cities: ['London', 'Dublin', 'Lisbon'] },
  'Europe/Paris':         { utc_offset: '+01:00', region: 'Europe', cities: ['Paris', 'Berlin', 'Madrid', 'Rome'] },
  'Europe/Helsinki':      { utc_offset: '+02:00', region: 'Europe', cities: ['Helsinki', 'Kyiv', 'Riga'] },
  'Europe/Moscow':        { utc_offset: '+03:00', region: 'Europe', cities: ['Moscow', 'Istanbul'] },
  'Asia/Dubai':           { utc_offset: '+04:00', region: 'Asia', cities: ['Dubai', 'Abu Dhabi'] },
  'Asia/Karachi':         { utc_offset: '+05:00', region: 'Asia', cities: ['Karachi', 'Islamabad'] },
  'Asia/Kolkata':         { utc_offset: '+05:30', region: 'Asia', cities: ['Mumbai', 'New Delhi', 'Bangalore'] },
  'Asia/Dhaka':           { utc_offset: '+06:00', region: 'Asia', cities: ['Dhaka'] },
  'Asia/Bangkok':         { utc_offset: '+07:00', region: 'Asia', cities: ['Bangkok', 'Jakarta', 'Hanoi'] },
  'Asia/Shanghai':        { utc_offset: '+08:00', region: 'Asia', cities: ['Shanghai', 'Beijing', 'Singapore', 'Hong Kong'] },
  'Asia/Tokyo':           { utc_offset: '+09:00', region: 'Asia', cities: ['Tokyo', 'Seoul', 'Osaka'] },
  'Australia/Sydney':     { utc_offset: '+10:00', region: 'Australia', cities: ['Sydney', 'Melbourne'] },
  'Pacific/Auckland':     { utc_offset: '+12:00', region: 'Pacific', cities: ['Auckland', 'Wellington'] },
};

const LICENSES = {
  'MIT': {
    type: 'Permissive',
    can_commercial: true,
    must_disclose_source: false,
    must_include_license: true,
    description: 'Very permissive. Can use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies. Must include copyright notice.',
  },
  'Apache-2.0': {
    type: 'Permissive',
    can_commercial: true,
    must_disclose_source: false,
    must_include_license: true,
    description: 'Permissive. Includes patent grant. Must include NOTICE file if one exists. Cannot use trademark.',
  },
  'GPL-2.0': {
    type: 'Copyleft',
    can_commercial: true,
    must_disclose_source: true,
    must_include_license: true,
    description: 'Strong copyleft. Derivative works must also be GPL. Must provide source code.',
  },
  'GPL-3.0': {
    type: 'Copyleft',
    can_commercial: true,
    must_disclose_source: true,
    must_include_license: true,
    description: 'Strong copyleft with explicit patent and anti-tivoization provisions.',
  },
  'LGPL-2.1': {
    type: 'Weak Copyleft',
    can_commercial: true,
    must_disclose_source: true,
    must_include_license: true,
    description: 'Allows linking from non-GPL software. Library modifications must be LGPL.',
  },
  'LGPL-3.0': {
    type: 'Weak Copyleft',
    can_commercial: true,
    must_disclose_source: true,
    must_include_license: true,
    description: 'Like LGPL-2.1 but built on GPL-3.0. More patent protection.',
  },
  'AGPL-3.0': {
    type: 'Network Copyleft',
    can_commercial: true,
    must_disclose_source: true,
    must_include_license: true,
    description: 'Like GPL-3.0 but also requires source disclosure if used over a network.',
  },
  'BSD-2-Clause': {
    type: 'Permissive',
    can_commercial: true,
    must_disclose_source: false,
    must_include_license: true,
    description: 'Permissive. Keep copyright notice. No endorsement restriction.',
  },
  'BSD-3-Clause': {
    type: 'Permissive',
    can_commercial: true,
    must_disclose_source: false,
    must_include_license: true,
    description: 'BSD-2-Clause plus no-endorsement clause (cannot use author name to promote).',
  },
  'ISC': {
    type: 'Permissive',
    can_commercial: true,
    must_disclose_source: false,
    must_include_license: true,
    description: 'Functionally equivalent to BSD-2-Clause. Very short and simple.',
  },
  'MPL-2.0': {
    type: 'Weak Copyleft',
    can_commercial: true,
    must_disclose_source: true,
    must_include_license: true,
    description: 'File-level copyleft. Modified files must remain MPL. Can combine with proprietary code.',
  },
  'CC0-1.0': {
    type: 'Public Domain',
    can_commercial: true,
    must_disclose_source: false,
    must_include_license: false,
    description: 'Public domain dedication. No rights reserved. Can do anything without attribution.',
  },
  'Unlicense': {
    type: 'Public Domain',
    can_commercial: true,
    must_disclose_source: false,
    must_include_license: false,
    description: 'Public domain. Even simpler than CC0. No conditions whatsoever.',
  },
};

const EMOJIS = {
  '😀': { name: 'Grinning Face', category: 'Smileys & Emotion', unicode: 'U+1F600' },
  '😂': { name: 'Face with Tears of Joy', category: 'Smileys & Emotion', unicode: 'U+1F602' },
  '🥰': { name: 'Smiling Face with Hearts', category: 'Smileys & Emotion', unicode: 'U+1F970' },
  '😍': { name: 'Smiling Face with Heart-Eyes', category: 'Smileys & Emotion', unicode: 'U+1F60D' },
  '😭': { name: 'Loudly Crying Face', category: 'Smileys & Emotion', unicode: 'U+1F62D' },
  '😡': { name: 'Pouting Face', category: 'Smileys & Emotion', unicode: 'U+1F621' },
  '🤔': { name: 'Thinking Face', category: 'Smileys & Emotion', unicode: 'U+1F914' },
  '👍': { name: 'Thumbs Up', category: 'People & Body', unicode: 'U+1F44D' },
  '👎': { name: 'Thumbs Down', category: 'People & Body', unicode: 'U+1F44E' },
  '👋': { name: 'Waving Hand', category: 'People & Body', unicode: 'U+1F44B' },
  '🙏': { name: 'Folded Hands', category: 'People & Body', unicode: 'U+1F64F' },
  '💪': { name: 'Flexed Biceps', category: 'People & Body', unicode: 'U+1F4AA' },
  '❤️': { name: 'Red Heart', category: 'Smileys & Emotion', unicode: 'U+2764' },
  '🔥': { name: 'Fire', category: 'Travel & Places', unicode: 'U+1F525' },
  '⭐': { name: 'Star', category: 'Travel & Places', unicode: 'U+2B50' },
  '✅': { name: 'Check Mark Button', category: 'Symbols', unicode: 'U+2705' },
  '❌': { name: 'Cross Mark', category: 'Symbols', unicode: 'U+274C' },
  '⚠️': { name: 'Warning', category: 'Symbols', unicode: 'U+26A0' },
  '💡': { name: 'Light Bulb', category: 'Objects', unicode: 'U+1F4A1' },
  '📌': { name: 'Pushpin', category: 'Objects', unicode: 'U+1F4CC' },
  '📎': { name: 'Paperclip', category: 'Objects', unicode: 'U+1F4CE' },
  '📝': { name: 'Memo', category: 'Objects', unicode: 'U+1F4DD' },
  '📊': { name: 'Bar Chart', category: 'Objects', unicode: 'U+1F4CA' },
  '📈': { name: 'Chart Increasing', category: 'Objects', unicode: 'U+1F4C8' },
  '📉': { name: 'Chart Decreasing', category: 'Objects', unicode: 'U+1F4C9' },
  '💰': { name: 'Money Bag', category: 'Objects', unicode: 'U+1F4B0' },
  '💻': { name: 'Laptop', category: 'Objects', unicode: 'U+1F4BB' },
  '📱': { name: 'Mobile Phone', category: 'Objects', unicode: 'U+1F4F1' },
  '🚀': { name: 'Rocket', category: 'Travel & Places', unicode: 'U+1F680' },
  '🎉': { name: 'Party Popper', category: 'Activities', unicode: 'U+1F389' },
  '🎯': { name: 'Bullseye', category: 'Activities', unicode: 'U+1F3AF' },
  '🏆': { name: 'Trophy', category: 'Activities', unicode: 'U+1F3C6' },
  '🌍': { name: 'Globe Showing Europe-Africa', category: 'Travel & Places', unicode: 'U+1F30D' },
  '🌎': { name: 'Globe Showing Americas', category: 'Travel & Places', unicode: 'U+1F30E' },
  '🌏': { name: 'Globe Showing Asia-Australia', category: 'Travel & Places', unicode: 'U+1F30F' },
  '🐛': { name: 'Bug', category: 'Animals & Nature', unicode: 'U+1F41B' },
  '🦄': { name: 'Unicorn', category: 'Animals & Nature', unicode: 'U+1F984' },
  '🎵': { name: 'Musical Note', category: 'Objects', unicode: 'U+1F3B5' },
  '☕': { name: 'Hot Beverage', category: 'Food & Drink', unicode: 'U+2615' },
  '🍕': { name: 'Pizza', category: 'Food & Drink', unicode: 'U+1F355' },
  '🍺': { name: 'Beer Mug', category: 'Food & Drink', unicode: 'U+1F37A' },
  '🏠': { name: 'House', category: 'Travel & Places', unicode: 'U+1F3E0' },
  '🔑': { name: 'Key', category: 'Objects', unicode: 'U+1F511' },
  '🔒': { name: 'Locked', category: 'Objects', unicode: 'U+1F512' },
  '🔓': { name: 'Unlocked', category: 'Objects', unicode: 'U+1F513' },
  '📧': { name: 'E-Mail', category: 'Objects', unicode: 'U+1F4E7' },
  '📞': { name: 'Telephone Receiver', category: 'Objects', unicode: 'U+1F4DE' },
  '🗓️': { name: 'Spiral Calendar', category: 'Objects', unicode: 'U+1F5D3' },
  '🔗': { name: 'Link', category: 'Objects', unicode: 'U+1F517' },
  '💬': { name: 'Speech Balloon', category: 'Smileys & Emotion', unicode: 'U+1F4AC' },
};

const FILE_EXTENSIONS = {
  '.js':    { name: 'JavaScript', category: 'Code', description: 'JavaScript source code, runs in browser and Node.js' },
  '.ts':    { name: 'TypeScript', category: 'Code', description: 'Typed superset of JavaScript, compiled to JS' },
  '.py':    { name: 'Python', category: 'Code', description: 'Python programming language source file' },
  '.rb':    { name: 'Ruby', category: 'Code', description: 'Ruby programming language source file' },
  '.go':    { name: 'Go', category: 'Code', description: 'Go programming language source file' },
  '.rs':    { name: 'Rust', category: 'Code', description: 'Rust programming language source file' },
  '.java':  { name: 'Java', category: 'Code', description: 'Java programming language source file' },
  '.c':     { name: 'C', category: 'Code', description: 'C programming language source file' },
  '.cpp':   { name: 'C++', category: 'Code', description: 'C++ programming language source file' },
  '.cs':    { name: 'C#', category: 'Code', description: 'C# programming language source file' },
  '.php':   { name: 'PHP', category: 'Code', description: 'PHP server-side scripting language' },
  '.swift': { name: 'Swift', category: 'Code', description: 'Swift programming language for Apple platforms' },
  '.kt':    { name: 'Kotlin', category: 'Code', description: 'Kotlin programming language, JVM-based' },
  '.html':  { name: 'HTML', category: 'Markup', description: 'HyperText Markup Language for web pages' },
  '.css':   { name: 'CSS', category: 'Stylesheet', description: 'Cascading Style Sheets for web styling' },
  '.scss':  { name: 'SCSS', category: 'Stylesheet', description: 'Sass CSS preprocessor syntax' },
  '.json':  { name: 'JSON', category: 'Data', description: 'JavaScript Object Notation data format' },
  '.xml':   { name: 'XML', category: 'Data', description: 'Extensible Markup Language data format' },
  '.yaml':  { name: 'YAML', category: 'Data', description: 'YAML Ain\'t Markup Language data format' },
  '.toml':  { name: 'TOML', category: 'Config', description: 'Tom\'s Obvious Minimal Language config format' },
  '.csv':   { name: 'CSV', category: 'Data', description: 'Comma-Separated Values spreadsheet format' },
  '.md':    { name: 'Markdown', category: 'Markup', description: 'Markdown lightweight markup language' },
  '.txt':   { name: 'Plain Text', category: 'Text', description: 'Plain text file with no formatting' },
  '.pdf':   { name: 'PDF', category: 'Document', description: 'Portable Document Format' },
  '.png':   { name: 'PNG Image', category: 'Image', description: 'Portable Network Graphics lossless image' },
  '.jpg':   { name: 'JPEG Image', category: 'Image', description: 'JPEG compressed image format' },
  '.svg':   { name: 'SVG', category: 'Image', description: 'Scalable Vector Graphics format' },
  '.sh':    { name: 'Shell Script', category: 'Code', description: 'Unix/Linux shell script' },
  '.sql':   { name: 'SQL', category: 'Code', description: 'Structured Query Language database script' },
  '.env':   { name: 'Environment File', category: 'Config', description: 'Environment variable definitions' },
};

const CSS_NAMED_COLORS = [
  { name: 'red',     hex: '#FF0000', r: 255, g: 0,   b: 0 },
  { name: 'green',   hex: '#008000', r: 0,   g: 128, b: 0 },
  { name: 'blue',    hex: '#0000FF', r: 0,   g: 0,   b: 255 },
  { name: 'yellow',  hex: '#FFFF00', r: 255, g: 255, b: 0 },
  { name: 'cyan',    hex: '#00FFFF', r: 0,   g: 255, b: 255 },
  { name: 'magenta', hex: '#FF00FF', r: 255, g: 0,   b: 255 },
  { name: 'white',   hex: '#FFFFFF', r: 255, g: 255, b: 255 },
  { name: 'black',   hex: '#000000', r: 0,   g: 0,   b: 0 },
  { name: 'orange',  hex: '#FFA500', r: 255, g: 165, b: 0 },
  { name: 'purple',  hex: '#800080', r: 128, g: 0,   b: 128 },
  { name: 'pink',    hex: '#FFC0CB', r: 255, g: 192, b: 203 },
  { name: 'brown',   hex: '#A52A2A', r: 165, g: 42,  b: 42 },
  { name: 'gray',    hex: '#808080', r: 128, g: 128, b: 128 },
  { name: 'silver',  hex: '#C0C0C0', r: 192, g: 192, b: 192 },
  { name: 'gold',    hex: '#FFD700', r: 255, g: 215, b: 0 },
  { name: 'navy',    hex: '#000080', r: 0,   g: 0,   b: 128 },
  { name: 'teal',    hex: '#008080', r: 0,   g: 128, b: 128 },
  { name: 'maroon',  hex: '#800000', r: 128, g: 0,   b: 0 },
  { name: 'lime',    hex: '#00FF00', r: 0,   g: 255, b: 0 },
  { name: 'olive',   hex: '#808000', r: 128, g: 128, b: 0 },
  { name: 'coral',   hex: '#FF7F50', r: 255, g: 127, b: 80 },
  { name: 'salmon',  hex: '#FA8072', r: 250, g: 128, b: 114 },
  { name: 'khaki',   hex: '#F0E68C', r: 240, g: 230, b: 140 },
  { name: 'indigo',  hex: '#4B0082', r: 75,  g: 0,   b: 130 },
  { name: 'violet',  hex: '#EE82EE', r: 238, g: 130, b: 238 },
  { name: 'crimson', hex: '#DC143C', r: 220, g: 20,  b: 60 },
  { name: 'turquoise', hex: '#40E0D0', r: 64, g: 224, b: 208 },
  { name: 'chocolate', hex: '#D2691E', r: 210, g: 105, b: 30 },
  { name: 'tomato',  hex: '#FF6347', r: 255, g: 99,  b: 71 },
  { name: 'lavender', hex: '#E6E6FA', r: 230, g: 230, b: 250 },
];

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'trashmail.com', '10minutemail.com', 'sharklasers.com',
  'guerrillamailblock.com', 'grr.la', 'guerrillamail.info', 'spam4.me',
  'temp-mail.org', 'dispostable.com', 'mailnull.com', 'spamgourmet.com',
  'maildrop.cc', 'mailnesia.com', 'trashmail.me', 'discard.email',
  'spamfree24.org', 'spamhereplease.com', 'spamspot.com', 'mt2014.com',
  'getonemail.net', 'mytrashmail.com', 'nospamfor.us', 'filzmail.com',
  'deadaddress.com', 'throwam.com', 'tempr.email', 'crazymailing.com',
  'bugmenot.com', 'spam.la', 'emailondeck.com', 'armyspy.com',
  'einrot.com', 'fleckens.hu', 'superrito.com', 'teleworm.us',
  'cuvox.de', 'dayrep.com', 'gustr.com', 'jourrapide.com',
  'rhyta.com', 'spamgourmet.net', 'throam.com', 'objectmail.com',
  'zetmail.com', 'fakeinbox.com',
]);

// ---------------------------------------------------------------------------
// 1. enrich-url-to-title
// ---------------------------------------------------------------------------
function enrichUrlToTitle(input) {
  const { url: rawUrl } = input || {};
  if (!rawUrl) return { _engine: 'real', error: 'missing_param', required: 'url', hint: 'Provide a URL to extract a title from' };
  let domain = rawUrl;
  try {
    const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl);
    domain = parsed.hostname;
  } catch (e) {
    domain = rawUrl.replace(/^https?:\/\//, '').split('/')[0];
  }
  const parts = domain.replace(/^www\./, '').split('.');
  const name = parts[0] || domain;
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  return { _engine: 'real', title, url: rawUrl };
}

// ---------------------------------------------------------------------------
// 2. enrich-domain-to-company
// ---------------------------------------------------------------------------
function enrichDomainToCompany(input) {
  input = input || {};
  const { domain } = input;
  if (!domain) return { _engine: 'real', error: 'missing_required_field', required: 'domain' };
  const clean = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const name = clean.split('.')[0] || clean;
  const company = name.charAt(0).toUpperCase() + name.slice(1);
  return { _engine: 'real', company, domain };
}

// ---------------------------------------------------------------------------
// 3. enrich-email-to-domain
// ---------------------------------------------------------------------------
function enrichEmailToDomain(input) {
  input = input || {};
  const { email } = input;
  if (!email) return { _engine: 'real', error: 'missing_required_field', required: 'email' };
  const parts = email.split('@');
  if (parts.length !== 2) return { _engine: 'real', error: 'invalid_format', message: 'Invalid email format' };
  return { _engine: 'real', domain: parts[1], local_part: parts[0] };
}

// ---------------------------------------------------------------------------
// 4. enrich-email-to-name
// ---------------------------------------------------------------------------
function enrichEmailToName(input) {
  input = input || {};
  const { email } = input;
  if (!email) return { _engine: 'real', error: 'missing_required_field', required: 'email' };
  const local = email.split('@')[0] || '';
  // Replace dots, dashes, underscores with spaces, then title-case each word
  const name = local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { _engine: 'real', name, email };
}

// ---------------------------------------------------------------------------
// 5. enrich-phone-to-country
// ---------------------------------------------------------------------------
function enrichPhoneToCountry(input) {
  const { phone } = input || {};
  if (!phone) return { _engine: 'real', error: 'missing_param', required: 'phone', hint: 'Provide a phone number with country prefix (e.g. +1555...)' };
  const normalized = phone.trim();
  // Sort by prefix length descending to match longest first
  const sorted = PHONE_PREFIXES.slice().sort((a, b) => b.prefix.length - a.prefix.length);
  for (const entry of sorted) {
    if (normalized.startsWith(entry.prefix)) {
      return { _engine: 'real', country: entry.country, code: entry.code, prefix: entry.prefix };
    }
  }
  return { _engine: 'real', country: 'Unknown', code: null, prefix: null };
}

// ---------------------------------------------------------------------------
// 6. enrich-ip-to-asn
// ---------------------------------------------------------------------------
function enrichIpToAsn(input) {
  const { ip } = input || {};
  if (!ip) return { _engine: 'real', error: 'missing_param', required: 'ip', hint: 'Provide an IP address (IPv4 or IPv6)' };
  const parts = ip.split('.').map(Number);
  const isIPv6 = ip.includes(':');
  if (isIPv6) {
    return { _engine: 'real', ip, is_private: ip.startsWith('::1') || ip.startsWith('fc') || ip.startsWith('fd'), network_class: 'IPv6' };
  }
  if (parts.length !== 4) return { _engine: 'real', error: 'invalid_format', message: 'Invalid IPv4 address' };
  const [a, b] = parts;
  const is_private =
    (a === 10) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 127) ||
    (a === 169 && b === 254);
  let network_class = 'Unknown';
  if (a >= 1 && a <= 126) network_class = 'Class A';
  else if (a === 127) network_class = 'Loopback';
  else if (a >= 128 && a <= 191) network_class = 'Class B';
  else if (a >= 192 && a <= 223) network_class = 'Class C';
  else if (a >= 224 && a <= 239) network_class = 'Class D (Multicast)';
  else if (a >= 240) network_class = 'Class E (Reserved)';
  return { _engine: 'real', ip, is_private, network_class };
}

// ---------------------------------------------------------------------------
// 7. enrich-country-code
// ---------------------------------------------------------------------------
function enrichCountryCode(input) {
  input = input || {};
  const { query } = input;
  if (!query) return { _engine: 'real', error: 'missing_required_field', required: 'query' };
  const q = query.trim().toLowerCase();
  const found = COUNTRIES.find(c =>
    c.name.toLowerCase() === q ||
    c.iso2.toLowerCase() === q ||
    c.iso3.toLowerCase() === q
  );
  if (found) return { _engine: 'real', name: found.name, iso2: found.iso2, iso3: found.iso3, found: true };
  return { _engine: 'real', name: null, iso2: null, iso3: null, found: false };
}

// ---------------------------------------------------------------------------
// 8. enrich-language-code
// ---------------------------------------------------------------------------
function enrichLanguageCode(input) {
  input = input || {};
  const { query } = input;
  if (!query) return { _engine: 'real', error: 'missing_required_field', required: 'query' };
  const q = query.trim().toLowerCase();
  const found = LANGUAGES.find(l =>
    l.name.toLowerCase() === q ||
    l.code.toLowerCase() === q
  );
  if (found) return { _engine: 'real', name: found.name, code: found.code, found: true };
  return { _engine: 'real', name: null, code: null, found: false };
}

// ---------------------------------------------------------------------------
// 9. enrich-mime-type
// ---------------------------------------------------------------------------
function enrichMimeType(input) {
  const { extension, mime } = input || {};
  if (!extension && !mime) return { _engine: 'real', error: 'missing_param', required: 'extension or mime', hint: 'Provide a file extension (e.g. .json) or a MIME type (e.g. application/json)' };
  if (extension) {
    const ext = extension.startsWith('.') ? extension.toLowerCase() : '.' + extension.toLowerCase();
    const info = MIME_TYPES[ext];
    if (info) return { _engine: 'real', extension: ext, mime: info.mime, category: info.category };
    return { _engine: 'real', extension: ext, mime: 'application/octet-stream', category: 'binary' };
  }
  if (mime) {
    const m = mime.toLowerCase();
    const entry = Object.entries(MIME_TYPES).find(([, v]) => v.mime === m);
    if (entry) return { _engine: 'real', extension: entry[0], mime: entry[1].mime, category: entry[1].category };
    return { _engine: 'real', extension: null, mime, category: 'unknown' };
  }
}

// ---------------------------------------------------------------------------
// 10. enrich-http-status-explain
// ---------------------------------------------------------------------------
function enrichHttpStatusExplain(input) {
  const { code } = input || {};
  if (code == null) return { _engine: 'real', error: 'missing_param', required: 'code', hint: 'Provide an HTTP status code (e.g. 200, 404)' };
  const c = Number(code);
  const info = HTTP_STATUSES[c];
  if (info) return { _engine: 'real', code: c, status: info.status, description: info.description, category: info.category };
  return { _engine: 'real', code: c, status: 'Unknown', description: 'No information available for this status code.', category: 'Unknown' };
}

// ---------------------------------------------------------------------------
// 11. enrich-port-service
// ---------------------------------------------------------------------------
function enrichPortService(input) {
  input = input || {};
  const { port } = input;
  if (port == null) return { _engine: 'real', error: 'missing_required_field', required: 'port' };
  const p = Number(port);
  const info = PORT_SERVICES[p];
  if (info) return { _engine: 'real', port: p, service: info.service, protocol: info.protocol, description: info.description };
  return { _engine: 'real', port: p, service: 'Unknown', protocol: 'Unknown', description: 'No known service for this port.' };
}

// ---------------------------------------------------------------------------
// 12. enrich-useragent-parse
// ---------------------------------------------------------------------------
function enrichUseragentParse(input) {
  input = input || {};
  const { useragent } = input;
  if (!useragent) return { _engine: 'real', error: 'missing_required_field', required: 'useragent' };
  const ua = useragent;

  let browser = 'Unknown';
  let version = null;
  let os = 'Unknown';
  let device = 'Desktop';

  // Browser detection
  const browsers = [
    { name: 'Edg',      re: /Edg\/([0-9.]+)/ },
    { name: 'OPR',      re: /OPR\/([0-9.]+)/ },
    { name: 'Chrome',   re: /Chrome\/([0-9.]+)/ },
    { name: 'Firefox',  re: /Firefox\/([0-9.]+)/ },
    { name: 'Safari',   re: /Version\/([0-9.]+).*Safari/ },
    { name: 'MSIE',     re: /MSIE ([0-9.]+)/ },
    { name: 'Trident',  re: /Trident\/.*rv:([0-9.]+)/ },
    { name: 'curl',     re: /curl\/([0-9.]+)/ },
    { name: 'Python',   re: /python-requests\/([0-9.]+)/ },
  ];
  for (const b of browsers) {
    const m = ua.match(b.re);
    if (m) { browser = b.name === 'Edg' ? 'Edge' : b.name === 'OPR' ? 'Opera' : b.name === 'Trident' ? 'IE' : b.name; version = m[1]; break; }
  }

  // OS detection
  if (/Windows NT 10/.test(ua)) os = 'Windows 10';
  else if (/Windows NT 11/.test(ua)) os = 'Windows 11';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) { const m = ua.match(/Mac OS X ([0-9_]+)/); os = 'macOS' + (m ? ' ' + m[1].replace(/_/g, '.') : ''); }
  else if (/Android/.test(ua)) { const m = ua.match(/Android ([0-9.]+)/); os = 'Android' + (m ? ' ' + m[1] : ''); }
  else if (/iPhone OS|iPad/.test(ua)) { const m = ua.match(/OS ([0-9_]+)/); os = 'iOS' + (m ? ' ' + m[1].replace(/_/g, '.') : ''); }
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';

  // Device type
  if (/Mobile|Android.*Mobile|iPhone/.test(ua)) device = 'Mobile';
  else if (/iPad|Tablet/.test(ua)) device = 'Tablet';
  else if (/bot|crawler|spider/i.test(ua)) device = 'Bot';

  return { _engine: 'real', browser, version, os, device };
}

// ---------------------------------------------------------------------------
// 13. enrich-accept-language-parse
// ---------------------------------------------------------------------------
function enrichAcceptLanguageParse(input) {
  const { header } = input || {};
  if (!header) return { _engine: 'real', error: 'missing_param', required: 'header', hint: 'Provide an Accept-Language header string (e.g. en-US,en;q=0.9)' };
  const languages = header.split(',').map(part => {
    const [lang, q] = part.trim().split(';q=');
    return { code: lang.trim(), quality: q ? parseFloat(q) : 1.0 };
  }).sort((a, b) => b.quality - a.quality);
  return { _engine: 'real', languages };
}

// ---------------------------------------------------------------------------
// 14. enrich-crontab-explain
// ---------------------------------------------------------------------------
function enrichCrontabExplain(input) {
  input = input || {};
  const { cron } = input;
  if (!cron) return { _engine: 'real', error: 'missing_required_field', required: 'cron' };
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return { _engine: 'real', error: 'invalid_format', message: 'Invalid cron expression (need 5 fields)' };
  const [minute, hour, dom, month, dow] = parts;

  function explainField(val, unit, names) {
    if (val === '*') return `every ${unit}`;
    if (val.startsWith('*/')) return `every ${val.slice(2)} ${unit}s`;
    if (val.includes(',')) return val.split(',').map(v => names ? (names[v] || v) : v).join(', ');
    if (val.includes('-')) { const [s, e] = val.split('-'); return `${s} through ${e}`; }
    return names ? (names[val] || val) : val;
  }

  const monthNames = { '1':'January','2':'February','3':'March','4':'April','5':'May','6':'June','7':'July','8':'August','9':'September','10':'October','11':'November','12':'December' };
  const dowNames = { '0':'Sunday','1':'Monday','2':'Tuesday','3':'Wednesday','4':'Thursday','5':'Friday','6':'Saturday' };

  const explanation = `At minute ${explainField(minute, 'minute')}, hour ${explainField(hour, 'hour')}, on day ${explainField(dom, 'day')} of month ${explainField(month, 'month', monthNames)}, on ${explainField(dow, 'day', dowNames)}.`;
  return { _engine: 'real', cron, explanation, fields: { minute, hour, dom, month, dow } };
}

// ---------------------------------------------------------------------------
// 15. enrich-semver-explain
// ---------------------------------------------------------------------------
function enrichSemverExplain(input) {
  const { range } = input || {};
  if (!range) return { _engine: 'real', error: 'missing_param', required: 'range', hint: 'Provide a semver range string (e.g. ^1.2.3, ~2.0.0)' };
  const r = range.trim();

  let explanation = '';
  let min_version = null;
  let max_version = null;

  if (r.startsWith('^')) {
    const ver = r.slice(1);
    const [major] = ver.split('.');
    min_version = ver;
    max_version = `${Number(major) + 1}.0.0 (exclusive)`;
    explanation = `Compatible with ${ver}. Allows patch and minor updates, but not major version changes. Equivalent to >=${ver} <${Number(major) + 1}.0.0.`;
  } else if (r.startsWith('~')) {
    const ver = r.slice(1);
    const [major, minor] = ver.split('.');
    min_version = ver;
    max_version = `${major}.${Number(minor) + 1}.0 (exclusive)`;
    explanation = `Approximately equivalent to ${ver}. Allows only patch updates. Equivalent to >=${ver} <${major}.${Number(minor) + 1}.0.`;
  } else if (r.startsWith('>=')) {
    min_version = r.slice(2).trim().split(' ')[0];
    const upper = r.match(/<([^\s]+)/);
    max_version = upper ? upper[1] + ' (exclusive)' : 'any';
    explanation = `At least version ${min_version}${upper ? ` and less than ${upper[1]}` : ''}.`;
  } else if (r.startsWith('>')) {
    min_version = r.slice(1) + ' (exclusive)';
    max_version = 'any';
    explanation = `Greater than version ${r.slice(1)}.`;
  } else if (r.startsWith('<=')) {
    min_version = '0.0.0';
    max_version = r.slice(2);
    explanation = `Any version up to and including ${r.slice(2)}.`;
  } else if (r.startsWith('<')) {
    min_version = '0.0.0';
    max_version = r.slice(1) + ' (exclusive)';
    explanation = `Any version less than ${r.slice(1)}.`;
  } else if (r === '*' || r === 'x') {
    min_version = '0.0.0';
    max_version = 'any';
    explanation = 'Matches any version.';
  } else if (/^\d/.test(r)) {
    min_version = r;
    max_version = r;
    explanation = `Exactly version ${r}.`;
  } else {
    explanation = `Range "${r}" — could not parse automatically.`;
  }

  return { _engine: 'real', range, explanation, min_version, max_version };
}

// ---------------------------------------------------------------------------
// 16. enrich-license-explain
// ---------------------------------------------------------------------------
function enrichLicenseExplain(input) {
  const { license } = input || {};
  if (!license) return { _engine: 'real', error: 'missing_param', required: 'license', hint: 'Provide an SPDX license identifier (e.g. MIT, GPL-3.0)' };
  const key = Object.keys(LICENSES).find(k => k.toLowerCase() === license.trim().toLowerCase());
  if (!key) return { _engine: 'real', license, type: 'Unknown', can_commercial: null, must_disclose_source: null, must_include_license: null, description: 'License not found in built-in table.' };
  const info = LICENSES[key];
  return { _engine: 'real', license: key, type: info.type, can_commercial: info.can_commercial, must_disclose_source: info.must_disclose_source, must_include_license: info.must_include_license, description: info.description };
}

// ---------------------------------------------------------------------------
// 17. enrich-timezone-info
// ---------------------------------------------------------------------------
function enrichTimezoneInfo(input) {
  const { timezone } = input || {};
  if (!timezone) return { _engine: 'real', error: 'missing_param', required: 'timezone', hint: 'Provide an IANA timezone name (e.g. America/New_York, UTC)' };
  const q = timezone.trim();
  // Exact match
  const exact = TIMEZONES[q];
  if (exact) return { _engine: 'real', timezone: q, utc_offset: exact.utc_offset, region: exact.region, cities: exact.cities };
  // Case-insensitive search
  const key = Object.keys(TIMEZONES).find(k => k.toLowerCase() === q.toLowerCase());
  if (key) {
    const info = TIMEZONES[key];
    return { _engine: 'real', timezone: key, utc_offset: info.utc_offset, region: info.region, cities: info.cities };
  }
  // Partial match
  const partial = Object.keys(TIMEZONES).find(k => k.toLowerCase().includes(q.toLowerCase()));
  if (partial) {
    const info = TIMEZONES[partial];
    return { _engine: 'real', timezone: partial, utc_offset: info.utc_offset, region: info.region, cities: info.cities };
  }
  return { _engine: 'real', timezone, utc_offset: null, region: null, cities: [] };
}

// ---------------------------------------------------------------------------
// 18. enrich-emoji-info
// ---------------------------------------------------------------------------
function enrichEmojiInfo(input) {
  const { emoji } = input || {};
  if (!emoji) return { _engine: 'real', error: 'missing_param', required: 'emoji', hint: 'Provide an emoji character or name to look up' };

  // Direct lookup (exact emoji char key)
  const info = EMOJIS[emoji];
  if (info) return { _engine: 'real', emoji, name: info.name, category: info.category, unicode: info.unicode };

  // BUG FIX: emoji chars can arrive with corrupted encoding (e.g. "??" instead of "🔥").
  // Try matching via Unicode code point: convert input codepoints to U+XXXX and match against the
  // unicode field in each EMOJIS entry.
  const codePoints = [];
  for (const cp of emoji) {
    const hex = cp.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    codePoints.push(`U+${hex}`);
  }
  const cpString = codePoints.join('');
  const byCodepoint = Object.entries(EMOJIS).find(([, v]) =>
    v.unicode && v.unicode.replace(/\s/g, '') === cpString
  );
  if (byCodepoint) return { _engine: 'real', emoji: byCodepoint[0], name: byCodepoint[1].name, category: byCodepoint[1].category, unicode: byCodepoint[1].unicode };

  // Fallback: search by name (handles plain-text queries like "fire", "thumbs up")
  const query = emoji.trim().toLowerCase();
  const found = Object.entries(EMOJIS).find(([, v]) => v.name.toLowerCase().includes(query));
  if (found) return { _engine: 'real', emoji: found[0], name: found[1].name, category: found[1].category, unicode: found[1].unicode };

  return { _engine: 'real', emoji, name: 'Unknown', category: 'Unknown', unicode: null };
}

// ---------------------------------------------------------------------------
// 19. enrich-color-name
// ---------------------------------------------------------------------------
function enrichColorName(input) {
  let { hex } = input || {};
  if (!hex) return { _engine: 'real', error: 'missing_param', required: 'hex', hint: 'Provide a hex color code (e.g. #FF0000 or FF0000)' };
  hex = hex.replace('#', '').trim();
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length !== 6) return { _engine: 'real', error: 'invalid_format', message: 'Invalid hex color' };
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  let nearest = null;
  let minDist = Infinity;
  for (const color of CSS_NAMED_COLORS) {
    const dist = Math.sqrt(Math.pow(r - color.r, 2) + Math.pow(g - color.g, 2) + Math.pow(b - color.b, 2));
    if (dist < minDist) { minDist = dist; nearest = color; }
  }

  return { _engine: 'real', hex: '#' + hex.toUpperCase(), nearest_name: nearest ? nearest.name : null, nearest_hex: nearest ? nearest.hex : null, distance: Math.round(minDist) };
}

// ---------------------------------------------------------------------------
// 20. enrich-file-extension-info
// ---------------------------------------------------------------------------
function enrichFileExtensionInfo(input) {
  const { extension } = input || {};
  if (!extension) return { _engine: 'real', error: 'missing_param', required: 'extension', hint: 'Provide a file extension (e.g. .js, .py, .json)' };
  const ext = (extension.startsWith('.') ? extension : '.' + extension).toLowerCase();
  const info = FILE_EXTENSIONS[ext];
  if (info) return { _engine: 'real', extension: ext, name: info.name, category: info.category, description: info.description };
  return { _engine: 'real', extension: ext, name: 'Unknown', category: 'Unknown', description: 'No information available for this extension.' };
}

// ---------------------------------------------------------------------------
// 21. comm-qr-url  (SVG grid approximation, hash-based)
// ---------------------------------------------------------------------------
function commQrUrl(input) {
  const rawUrl = (input || {}).url || (input || {}).text || null;
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { _engine: 'real', error: 'missing_param', required: 'url', hint: 'Provide a URL or text string. Pass { "url": "https://example.com" }' };
  }

  const hash = crypto.createHash('sha256').update(rawUrl).digest('hex');
  const SIZE = 21;
  const CELL = 10;
  const QUIET = 2;
  const TOTAL = (SIZE + QUIET * 2) * CELL;

  // Build bit grid from hash bytes
  const bits = [];
  for (const ch of hash) {
    const nibble = parseInt(ch, 16);
    for (let i = 3; i >= 0; i--) bits.push((nibble >> i) & 1);
  }
  // Pad/repeat to SIZE*SIZE
  const grid = [];
  for (let r = 0; r < SIZE; r++) {
    grid.push([]);
    for (let c = 0; c < SIZE; c++) {
      grid[r].push(bits[(r * SIZE + c) % bits.length]);
    }
  }
  // Force finder pattern corners (3x3) - top-left, top-right, bottom-left
  const fp = (rr, cc) => {
    for (let dr = 0; dr < 7 && rr + dr < SIZE; dr++) {
      for (let dc = 0; dc < 7 && cc + dc < SIZE; dc++) {
        const edge = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const center = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        grid[rr + dr][cc + dc] = (edge || center) ? 1 : 0;
      }
    }
  };
  fp(0, 0);
  fp(0, SIZE - 7);
  fp(SIZE - 7, 0);

  // Build SVG rects
  let rects = '';
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c]) {
        const x = (QUIET + c) * CELL;
        const y = (QUIET + r) * CELL;
        rects += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="#000"/>`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TOTAL}" height="${TOTAL}" viewBox="0 0 ${TOTAL} ${TOTAL}"><rect width="${TOTAL}" height="${TOTAL}" fill="#fff"/>${rects}</svg>`;
  return { _engine: 'real', svg, url: rawUrl };
}

// ---------------------------------------------------------------------------
// 22. comm-ical-create
// ---------------------------------------------------------------------------
function commIcalCreate(input) {
  input = input || {};
  const { title = 'Event', start, end, location = '', description = '' } = input;
  if (!start) {
    return { _engine: 'real', error: 'missing_param', required: 'start', hint: 'Provide an ISO 8601 datetime. Pass { "start": "2025-06-01T10:00:00Z", "end": "2025-06-01T11:00:00Z" }' };
  }
  if (!end) {
    return { _engine: 'real', error: 'missing_param', required: 'end', hint: 'Provide an ISO 8601 datetime. Pass { "start": "2025-06-01T10:00:00Z", "end": "2025-06-01T11:00:00Z" }' };
  }

  function toIcalDate(d) {
    const dt = new Date(d);
    return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  const uid = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex') + '@slopshop';
  const now = toIcalDate(new Date());

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Slopshop//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcalDate(start)}`,
    `DTEND:${toIcalDate(end)}`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location}` : '',
    description ? `DESCRIPTION:${description}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');

  return { _engine: 'real', ical };
}

// ---------------------------------------------------------------------------
// 23. comm-vcard-create
// ---------------------------------------------------------------------------
function commVcardCreate(input) {
  const { name = '', email = '', phone = '', company = '', title = '' } = input;
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `N:${name.split(' ').reverse().join(';')};;;`,
    email ? `EMAIL:${email}` : '',
    phone ? `TEL:${phone}` : '',
    company ? `ORG:${company}` : '',
    title ? `TITLE:${title}` : '',
    'END:VCARD',
  ].filter(Boolean).join('\r\n');
  return { _engine: 'real', vcard: lines };
}

// ---------------------------------------------------------------------------
// 24. comm-markdown-email
// ---------------------------------------------------------------------------
function commMarkdownEmail(input) {
  const { markdown = '' } = input;
  let html = markdown
    // Headings
    .replace(/^#{6}\s+(.+)$/gm, '<h6 style="font-family:sans-serif">$1</h6>')
    .replace(/^#{5}\s+(.+)$/gm, '<h5 style="font-family:sans-serif">$1</h5>')
    .replace(/^#{4}\s+(.+)$/gm, '<h4 style="font-family:sans-serif">$1</h4>')
    .replace(/^#{3}\s+(.+)$/gm, '<h3 style="font-family:sans-serif">$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2 style="font-family:sans-serif">$1</h2>')
    .replace(/^#{1}\s+(.+)$/gm, '<h1 style="font-family:sans-serif">$1</h1>')
    // Bold / italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Code
    .replace(/`(.+?)`/g, '<code style="background:#f4f4f4;padding:2px 4px;border-radius:3px">$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#0066cc">$1</a>')
    // Images
    .replace(/!\[(.+?)\]\((.+?)\)/g, '<img alt="$1" src="$2" style="max-width:100%"/>')
    // Horizontal rules
    .replace(/^---+$/gm, '<hr style="border:1px solid #ddd"/>')
    // Unordered lists
    .replace(/^[\-\*]\s+(.+)$/gm, '<li style="margin:4px 0">$1</li>')
    // Ordered lists
    .replace(/^\d+\.\s+(.+)$/gm, '<li style="margin:4px 0">$1</li>')
    // Blockquote
    .replace(/^>\s+(.+)$/gm, '<blockquote style="border-left:4px solid #ddd;margin:0;padding:0 16px;color:#666">$1</blockquote>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p style="font-family:sans-serif;line-height:1.6">');

  html = `<p style="font-family:sans-serif;line-height:1.6">${html}</p>`;
  // Wrap lists
  html = html.replace(/(<li[^>]*>.*?<\/li>)+/gs, match => `<ul style="padding-left:20px">${match}</ul>`);

  return { _engine: 'real', html };
}

// ---------------------------------------------------------------------------
// 25. comm-rss-create
// ---------------------------------------------------------------------------
function commRssCreate(input) {
  const { title = 'Feed', link = '', description = '', items = [] } = input;
  const itemsXml = items.map(item => `  <item>
    <title><![CDATA[${item.title || ''}]]></title>
    <link>${item.link || ''}</link>
    <description><![CDATA[${item.description || ''}]]></description>
    <pubDate>${item.date ? new Date(item.date).toUTCString() : new Date().toUTCString()}</pubDate>
  </item>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[${title}]]></title>
    <link>${link}</link>
    <description><![CDATA[${description}]]></description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`;
  return { _engine: 'real', xml };
}

// ---------------------------------------------------------------------------
// 26. comm-sitemap-create
// ---------------------------------------------------------------------------
function commSitemapCreate(input) {
  const { urls = [] } = input;
  const urlsXml = urls.map(u => `  <url>
    <loc>${u.loc || ''}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    ${u.priority != null ? `<priority>${u.priority}</priority>` : ''}
  </url>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>`;
  return { _engine: 'real', xml };
}

// ---------------------------------------------------------------------------
// 27. comm-robots-create
// ---------------------------------------------------------------------------
function commRobotsCreate(input) {
  const { rules = [], sitemaps = [] } = input;
  const lines = [];
  for (const rule of rules) {
    lines.push(`User-agent: ${rule.user_agent || '*'}`);
    for (const a of (rule.allow || [])) lines.push(`Allow: ${a}`);
    for (const d of (rule.disallow || [])) lines.push(`Disallow: ${d}`);
    lines.push('');
  }
  for (const sm of sitemaps) {
    lines.push(`Sitemap: ${sm}`);
  }
  return { _engine: 'real', text: lines.join('\n').trim() };
}

// ---------------------------------------------------------------------------
// 28. comm-mailto-link
// ---------------------------------------------------------------------------
function commMailtoLink(input) {
  const { to = '', subject = '', body = '', cc = '', bcc = '' } = input;
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  if (bcc) params.push(`bcc=${encodeURIComponent(bcc)}`);
  const link = `mailto:${encodeURIComponent(to)}${params.length ? '?' + params.join('&') : ''}`;
  return { _engine: 'real', link };
}

// ---------------------------------------------------------------------------
// 29. comm-phone-validate
// ---------------------------------------------------------------------------
function commPhoneValidate(input) {
  input = input || {};
  const phone = input.phone || input.number || input.tel || null;
  const country = input.country || null;
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return { _engine: 'real', error: 'missing_param', required: 'phone', hint: 'Provide a phone number string. Pass { "phone": "+15551234567" }' };
  }
  const stripped = phone.replace(/[\s\-().+]/g, '');
  const hasLetters = /[a-zA-Z]/.test(stripped);
  if (hasLetters) return { _engine: 'real', valid: false, formatted: null, country: country || null };

  const digits = stripped.replace(/\D/g, '');
  // Basic: E.164 numbers are 7-15 digits
  const valid = digits.length >= 7 && digits.length <= 15 && !hasLetters;

  let detectedCountry = country || null;
  let formatted = phone.trim();

  if (valid) {
    // Detect country from prefix if no country provided
    if (!detectedCountry && phone.startsWith('+')) {
      const sorted = PHONE_PREFIXES.slice().sort((a, b) => b.prefix.length - a.prefix.length);
      for (const entry of sorted) {
        if (phone.startsWith(entry.prefix)) { detectedCountry = entry.code; break; }
      }
    }
    // Basic formatting: +1 -> (XXX) XXX-XXXX
    if (digits.length === 11 && digits.startsWith('1')) {
      formatted = `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 10) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }

  return { _engine: 'real', valid, formatted: valid ? formatted : null, country: detectedCountry };
}

// ---------------------------------------------------------------------------
// 30. comm-email-validate-deep
// ---------------------------------------------------------------------------
function commEmailValidateDeep(input) {
  input = input || {};
  const email = input.email || input.address || null;
  if (!email || typeof email !== 'string' || !email.trim()) {
    return { _engine: 'real', error: 'missing_param', required: 'email', hint: 'Provide an email address string. Pass { "email": "user@example.com" }' };
  }
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  const valid_format = emailRegex.test(trimmed);

  const parts = trimmed.split('@');
  const domain = parts.length === 2 ? parts[1] : '';
  const is_disposable = DISPOSABLE_DOMAINS.has(domain);

  // Simple suggestion for common typos
  const commonDomains = { 'gmal.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gamil.com': 'gmail.com', 'hotmal.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'yahooo.com': 'yahoo.com' };
  const suggestion = commonDomains[domain] ? trimmed.replace(domain, commonDomains[domain]) : null;

  return { _engine: 'real', valid_format, is_disposable, domain, suggestion };
}

// ---------------------------------------------------------------------------
// 31. enrich-text-entities  (named entity extraction — no external deps)
// ---------------------------------------------------------------------------

// Curated seed lists for heuristic NER
const KNOWN_ORGS = new Set([
  'google','apple','microsoft','amazon','meta','tesla','netflix','uber','airbnb',
  'twitter','x','linkedin','facebook','instagram','youtube','tiktok','snapchat',
  'stripe','paypal','shopify','salesforce','oracle','ibm','intel','amd','nvidia',
  'openai','anthropic','deepmind','hugging face','spacex','nasa','un','eu',
  'the new york times','bbc','cnn','reuters','bloomberg','the guardian','techcrunch',
  'the washington post','wall street journal','wsj','github','gitlab','stackoverflow',
  'wikipedia','reddit','discord','slack','zoom','dropbox','atlassian','jira',
]);

const KNOWN_PLACES = new Set([
  'new york','los angeles','chicago','houston','phoenix','philadelphia','san antonio',
  'san diego','dallas','san jose','austin','jacksonville','san francisco','seattle',
  'london','paris','berlin','tokyo','beijing','shanghai','mumbai','delhi','sydney',
  'toronto','vancouver','dubai','singapore','amsterdam','barcelona','madrid','rome',
  'moscow','stockholm','oslo','copenhagen','zurich','vienna','brussels','warsaw',
  'cairo','lagos','nairobi','johannesburg','sao paulo','buenos aires','bogota',
  'united states','usa','uk','united kingdom','germany','france','china','india',
  'russia','brazil','canada','australia','japan','south korea','mexico','spain',
  'italy','netherlands','sweden','switzerland','poland','turkey','ukraine',
  'africa','europe','asia','americas','middle east','pacific','atlantic',
]);

function enrichTextEntities(input) {
  input = input || {};
  const text = input.text || input.content || '';
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { _engine: 'real', error: 'missing_param', required: 'text', hint: 'Provide a text string to extract named entities from' };
  }

  const people = [];
  const orgs = [];
  const places = [];
  const emails = [];
  const urls = [];
  const phones = [];

  // Extract emails
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  let m;
  while ((m = emailRe.exec(text)) !== null) emails.push(m[0]);

  // Extract URLs
  const urlRe = /https?:\/\/[^\s)>\]"']+/g;
  while ((m = urlRe.exec(text)) !== null) urls.push(m[0]);

  // Extract phones (loose: +digits, or (XXX) XXX-XXXX patterns)
  // BUG FIX: strip trailing punctuation from phone matches (e.g. trailing dot or comma)
  const phoneRe = /(?:\+\d[\d\s\-().]{6,}|\(\d{3}\)\s?\d{3}[\s\-]\d{4})/g;
  while ((m = phoneRe.exec(text)) !== null) phones.push(m[0].trim().replace(/[.,;!?]+$/, ''));

  // Tokenize on word boundaries for NER
  const lower = text.toLowerCase();

  // Orgs: match known org names (multi-word first, then single)
  // BUG FIX: use case-insensitive dedup to avoid "Google" and "google" both appearing
  const orgsSeenLower = new Set();
  for (const org of KNOWN_ORGS) {
    if (lower.includes(org)) {
      const re = new RegExp(org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
      while ((m = re.exec(text)) !== null) {
        const ml = m[0].toLowerCase();
        if (!orgsSeenLower.has(ml)) { orgsSeenLower.add(ml); orgs.push(m[0]); }
      }
    }
  }

  // Places: same approach with case-insensitive dedup
  const placesSeenLower = new Set();
  for (const place of KNOWN_PLACES) {
    if (lower.includes(place)) {
      const re = new RegExp(place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
      while ((m = re.exec(text)) !== null) {
        const ml = m[0].toLowerCase();
        if (!placesSeenLower.has(ml)) { placesSeenLower.add(ml); places.push(m[0]); }
      }
    }
  }

  // People heuristic: sequences of 2–3 Title-Cased words not in orgs/places and not at sentence start
  // (simplified: consecutive capitalized words preceded by lowercase context)
  const personRe = /(?<=[a-z,;:]\s{1,3}|\bby\s|\bfrom\s|\bwith\s|\bfor\s)([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2})/g;
  while ((m = personRe.exec(text)) !== null) {
    const candidate = m[1].trim();
    const cl = candidate.toLowerCase();
    if (!KNOWN_ORGS.has(cl) && !KNOWN_PLACES.has(cl) && !people.includes(candidate)) {
      people.push(candidate);
    }
  }

  return {
    _engine: 'real',
    entities: {
      people: [...new Set(people)],
      organizations: [...new Set(orgs)],
      places: [...new Set(places)],
      emails: [...new Set(emails)],
      urls: [...new Set(urls)],
      phones: [...new Set(phones)],
    },
    text_length: text.length,
    entity_count: people.length + orgs.length + places.length + emails.length + urls.length + phones.length,
  };
}

// ---------------------------------------------------------------------------
// 32. enrich-text-keywords  (TF-IDF-style keyword extraction, no external deps)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','up','about','into','through','during','before','after','above','below',
  'between','out','off','over','under','again','further','then','once','here',
  'there','when','where','why','how','all','both','each','few','more','most',
  'other','some','such','no','nor','not','only','own','same','so','than','too',
  'very','s','t','can','will','just','don','should','now','i','me','my','we',
  'our','you','your','he','him','his','she','her','it','its','they','them',
  'their','what','which','who','whom','this','that','these','those','am','is',
  'are','was','were','be','been','being','have','has','had','do','does','did',
  'doing','would','could','may','might','shall','must','need','dare','used','ought',
  'also','however','therefore','thus','hence','yet','still','already','since',
  'because','although','though','unless','until','while','whether','if','else',
]);

function enrichTextKeywords(input) {
  input = input || {};
  const text = input.text || input.content || '';
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { _engine: 'real', error: 'missing_param', required: 'text', hint: 'Provide a text string to extract keywords from' };
  }
  const limit = Math.min(Math.max(parseInt(input.limit) || 10, 1), 50);

  // Tokenize
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  // Count term frequency
  const tf = {};
  for (const w of words) tf[w] = (tf[w] || 0) + 1;

  // Score: TF weighted by word length (longer words tend to be more specific)
  const scored = Object.entries(tf)
    .map(([word, count]) => ({ word, count, score: count * Math.log(word.length + 2) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Also extract 2-gram phrases (bigrams)
  const bigrams = {};
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
      bigrams[bg] = (bigrams[bg] || 0) + 1;
    }
  }
  const topPhrases = Object.entries(bigrams)
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase, count]) => ({ phrase, count }));

  return {
    _engine: 'real',
    keywords: scored,
    phrases: topPhrases,
    word_count: words.length,
    unique_words: Object.keys(tf).length,
  };
}

// ---------------------------------------------------------------------------
// 33. enrich-text-language  (language detection — heuristic, no external deps)
// ---------------------------------------------------------------------------

// Characteristic high-frequency words per language (stopwords + function words)
const LANG_SIGNATURES = {
  en: ['the','and','is','in','it','of','to','that','was','he','for','on','are','with','as'],
  es: ['el','la','los','las','de','en','que','y','es','un','una','se','no','lo','le'],
  fr: ['le','la','les','de','des','en','et','est','un','une','que','qui','dans','il','pas'],
  de: ['der','die','das','und','ist','in','ein','eine','zu','den','von','des','mit','auf','ich'],
  pt: ['de','a','o','que','e','do','da','em','um','para','com','uma','os','no','se'],
  it: ['il','la','di','e','in','un','è','che','per','con','del','della','i','una','non'],
  nl: ['de','het','een','van','in','is','dat','op','en','te','zijn','met','er','aan','ook'],
  pl: ['i','w','z','się','na','to','nie','że','do','jak','ale','tak','go','co','po'],
  ru: ['в','и','не','на','я','что','он','с','как','это','по','но','все','за','из'],
  zh: ['的','了','在','是','我','有','和','就','不','都','一','人','上','出','来'],
  ja: ['の','は','に','を','た','が','で','と','も','です','ます','から','これ','あの','その'],
  ar: ['في','من','على','إلى','أن','هذا','هو','كان','قد','مع','لا','ما','عن','بعد','كل'],
  hi: ['है','का','की','के','और','में','को','से','एक','यह','हैं','पर','जो','था','वह'],
};

function enrichTextLanguage(input) {
  input = input || {};
  const text = input.text || input.content || '';
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { _engine: 'real', error: 'missing_param', required: 'text', hint: 'Provide a text string to detect language' };
  }
  if (text.trim().length < 10) {
    return { _engine: 'real', error: 'text_too_short', message: 'Text must be at least 10 characters for reliable detection' };
  }

  // Tokenize to lowercase words
  const tokens = new Set(text.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\u0900-\u097F]/g, '')).filter(Boolean));

  const scores = {};
  for (const [lang, sigs] of Object.entries(LANG_SIGNATURES)) {
    let hits = 0;
    for (const sig of sigs) {
      if (tokens.has(sig)) hits++;
    }
    scores[lang] = hits;
  }

  // Find winner
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = sorted[0];
  const [, secondScore] = sorted[1] || [null, 0];

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = total > 0 ? Math.min(0.99, (topScore - secondScore + 1) / (topScore + secondScore + 1)) : 0;

  // Name lookup
  const langInfo = LANGUAGES.find(l => l.code === topLang);
  const name = langInfo ? langInfo.name : topLang;

  return {
    _engine: 'real',
    language: topLang,
    language_name: name,
    confidence: parseFloat(confidence.toFixed(3)),
    alternatives: sorted.slice(1, 4).filter(([, s]) => s > 0).map(([code, score]) => {
      const li = LANGUAGES.find(l => l.code === code);
      return { code, name: li ? li.name : code, score };
    }),
    detected_via: 'heuristic',
    note: 'Heuristic detection using function-word signatures. For high-stakes use cases, pass text to an LLM handler.',
  };
}

// ---------------------------------------------------------------------------
// 34. enrich-domain-info  (domain registration + tech stack heuristics)
// ---------------------------------------------------------------------------

const KNOWN_DOMAIN_META = {
  'google.com':    { company: 'Google LLC', industry: 'Technology', employees: '100000+', founded: 1998, hq: 'Mountain View, CA' },
  'github.com':    { company: 'GitHub (Microsoft)', industry: 'Developer Tools', employees: '3000+', founded: 2008, hq: 'San Francisco, CA' },
  'stripe.com':    { company: 'Stripe Inc.', industry: 'Fintech', employees: '7000+', founded: 2010, hq: 'San Francisco, CA' },
  'shopify.com':   { company: 'Shopify Inc.', industry: 'E-commerce', employees: '10000+', founded: 2006, hq: 'Ottawa, Canada' },
  'openai.com':    { company: 'OpenAI', industry: 'AI Research', employees: '1000+', founded: 2015, hq: 'San Francisco, CA' },
  'anthropic.com': { company: 'Anthropic PBC', industry: 'AI Safety', employees: '500+', founded: 2021, hq: 'San Francisco, CA' },
  'vercel.com':    { company: 'Vercel Inc.', industry: 'Developer Tools', employees: '500+', founded: 2015, hq: 'San Francisco, CA' },
  'netlify.com':   { company: 'Netlify Inc.', industry: 'Developer Tools', employees: '200+', founded: 2014, hq: 'San Francisco, CA' },
  'cloudflare.com':{ company: 'Cloudflare Inc.', industry: 'CDN / Security', employees: '3000+', founded: 2009, hq: 'San Francisco, CA' },
  'aws.amazon.com':{ company: 'Amazon Web Services', industry: 'Cloud Computing', employees: '100000+', founded: 2006, hq: 'Seattle, WA' },
  'microsoft.com': { company: 'Microsoft Corporation', industry: 'Technology', employees: '220000+', founded: 1975, hq: 'Redmond, WA' },
  'apple.com':     { company: 'Apple Inc.', industry: 'Technology / Consumer Electronics', employees: '160000+', founded: 1976, hq: 'Cupertino, CA' },
  'meta.com':      { company: 'Meta Platforms Inc.', industry: 'Social Media / Technology', employees: '80000+', founded: 2004, hq: 'Menlo Park, CA' },
  'twitter.com':   { company: 'X Corp (Twitter)', industry: 'Social Media', employees: '2000+', founded: 2006, hq: 'San Francisco, CA' },
  'x.com':         { company: 'X Corp', industry: 'Social Media', employees: '2000+', founded: 2006, hq: 'San Francisco, CA' },
  'linkedin.com':  { company: 'LinkedIn (Microsoft)', industry: 'Professional Social Network', employees: '20000+', founded: 2003, hq: 'Sunnyvale, CA' },
  'notion.so':     { company: 'Notion Labs Inc.', industry: 'Productivity', employees: '400+', founded: 2016, hq: 'San Francisco, CA' },
  'figma.com':     { company: 'Figma Inc.', industry: 'Design Tools', employees: '800+', founded: 2012, hq: 'San Francisco, CA' },
  'railway.app':   { company: 'Railway Inc.', industry: 'Developer Tools / Hosting', employees: '50+', founded: 2020, hq: 'San Francisco, CA' },
};

// TLD to country/type mapping
const TLD_INFO = {
  '.com': { type: 'Commercial', country: null },
  '.net': { type: 'Network', country: null },
  '.org': { type: 'Organization', country: null },
  '.edu': { type: 'Education', country: 'United States' },
  '.gov': { type: 'Government', country: 'United States' },
  '.io':  { type: 'ccTLD / Tech-startup popular', country: 'British Indian Ocean Territory' },
  '.ai':  { type: 'ccTLD / AI startup popular', country: 'Anguilla' },
  '.co':  { type: 'Commercial (alt) / ccTLD', country: 'Colombia' },
  '.app': { type: 'Application gTLD', country: null },
  '.dev': { type: 'Developer gTLD', country: null },
  '.uk':  { type: 'ccTLD', country: 'United Kingdom' },
  '.de':  { type: 'ccTLD', country: 'Germany' },
  '.fr':  { type: 'ccTLD', country: 'France' },
  '.jp':  { type: 'ccTLD', country: 'Japan' },
  '.cn':  { type: 'ccTLD', country: 'China' },
  '.au':  { type: 'ccTLD', country: 'Australia' },
  '.ca':  { type: 'ccTLD', country: 'Canada' },
  '.in':  { type: 'ccTLD', country: 'India' },
  '.br':  { type: 'ccTLD', country: 'Brazil' },
  '.mx':  { type: 'ccTLD', country: 'Mexico' },
  '.ru':  { type: 'ccTLD', country: 'Russia' },
  '.gg':  { type: 'ccTLD / Gaming popular', country: 'Guernsey' },
  '.sh':  { type: 'ccTLD / Shell-script popular', country: 'Saint Helena' },
  '.so':  { type: 'ccTLD / Startup popular', country: 'Somalia' },
  '.vc':  { type: 'ccTLD / VC firm popular', country: 'Saint Vincent and the Grenadines' },
  '.xyz': { type: 'Generic gTLD', country: null },
  '.info':{ type: 'Information gTLD', country: null },
  '.biz': { type: 'Business gTLD', country: null },
};

function enrichDomainInfo(input) {
  input = input || {};
  const raw = input.domain || input.url || '';
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { _engine: 'real', error: 'missing_param', required: 'domain', hint: 'Provide a domain name (e.g. "stripe.com") or URL' };
  }

  // Normalize to bare domain
  // BUG FIX: handle email addresses passed as domain (strip local-part)
  let rawClean = raw.trim();
  if (rawClean.includes('@')) rawClean = rawClean.split('@')[1] || rawClean;
  let domain = rawClean.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0];

  // Extract TLD
  const parts = domain.split('.');
  const tld = parts.length >= 2 ? '.' + parts.slice(-1)[0] : '';
  const tldInfo = TLD_INFO[tld] || { type: 'Unknown', country: null };

  // Company name heuristic
  const companyName = (parts[0] || domain).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Known domain meta
  const known = KNOWN_DOMAIN_META[domain] || KNOWN_DOMAIN_META['www.' + domain] || null;

  // Likely tech stack heuristics based on TLD + known patterns
  const techHints = [];
  if (['.io', '.dev', '.app'].includes(tld)) techHints.push('Likely developer / SaaS');
  if (tld === '.ai') techHints.push('Likely AI / ML product');
  if (tld === '.gg') techHints.push('Likely gaming or esports');
  if (tld === '.edu') techHints.push('Academic institution');
  if (tld === '.gov') techHints.push('Government entity');

  // Disposable / free email domain check
  const isFreeEmail = ['gmail.com','yahoo.com','hotmail.com','outlook.com','protonmail.com','icloud.com','aol.com','mail.com'].includes(domain);
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);

  return {
    _engine: 'real',
    domain,
    tld,
    tld_type: tldInfo.type,
    tld_country: tldInfo.country,
    company_name: known ? known.company : companyName,
    industry: known ? known.industry : null,
    employees: known ? known.employees : null,
    founded: known ? known.founded : null,
    headquarters: known ? known.hq : null,
    is_free_email_provider: isFreeEmail,
    is_disposable_email_domain: isDisposable,
    tech_hints: techHints,
    data_source: known ? 'built-in-database' : 'heuristic',
    note: known ? null : 'Full WHOIS, Clearbit, and tech-stack data requires external API keys (CLEARBIT_API_KEY, WHOIS_API_KEY).',
    requires: known ? [] : ['CLEARBIT_API_KEY'],
  };
}

// ---------------------------------------------------------------------------
// 35. enrich-social-profile  (public social profile extraction from URL)
// ---------------------------------------------------------------------------

const SOCIAL_PLATFORMS = {
  'twitter.com':    { name: 'Twitter/X', handle_pattern: /twitter\.com\/([A-Za-z0-9_]+)/ },
  'x.com':          { name: 'X (Twitter)', handle_pattern: /x\.com\/([A-Za-z0-9_]+)/ },
  'linkedin.com':   { name: 'LinkedIn', handle_pattern: /linkedin\.com\/(?:in|company)\/([^/?#]+)/ },
  'github.com':     { name: 'GitHub', handle_pattern: /github\.com\/([A-Za-z0-9\-]+)/ },
  'instagram.com':  { name: 'Instagram', handle_pattern: /instagram\.com\/([A-Za-z0-9_.]+)/ },
  'facebook.com':   { name: 'Facebook', handle_pattern: /facebook\.com\/([A-Za-z0-9.]+)/ },
  'youtube.com':    { name: 'YouTube', handle_pattern: /youtube\.com\/(?:@|c\/|channel\/|user\/)?([^/?#]+)/ },
  'tiktok.com':     { name: 'TikTok', handle_pattern: /tiktok\.com\/@([A-Za-z0-9_.]+)/ },
  'reddit.com':     { name: 'Reddit', handle_pattern: /reddit\.com\/(?:u|r)\/([A-Za-z0-9_]+)/ },
  'medium.com':     { name: 'Medium', handle_pattern: /medium\.com\/@?([A-Za-z0-9_.\-]+)/ },
  'dev.to':         { name: 'DEV Community', handle_pattern: /dev\.to\/([A-Za-z0-9_]+)/ },
  'dribbble.com':   { name: 'Dribbble', handle_pattern: /dribbble\.com\/([A-Za-z0-9_\-]+)/ },
  'behance.net':    { name: 'Behance', handle_pattern: /behance\.net\/([A-Za-z0-9_\-]+)/ },
  'producthunt.com':{ name: 'Product Hunt', handle_pattern: /producthunt\.com\/@([A-Za-z0-9_\-]+)/ },
  'substack.com':   { name: 'Substack', handle_pattern: /([A-Za-z0-9\-]+)\.substack\.com/ },
};

function enrichSocialProfile(input) {
  input = input || {};
  const profileUrl = input.url || input.profile_url || '';
  if (!profileUrl || typeof profileUrl !== 'string' || !profileUrl.trim()) {
    return { _engine: 'real', error: 'missing_param', required: 'url', hint: 'Provide a social profile URL (e.g. "https://twitter.com/elonmusk")' };
  }

  const normalized = profileUrl.trim().toLowerCase();

  // Identify platform
  let platform = null;
  let platformName = null;
  let handle = null;
  let profileType = 'person';

  for (const [domain, meta] of Object.entries(SOCIAL_PLATFORMS)) {
    if (normalized.includes(domain)) {
      platform = domain;
      platformName = meta.name;
      const m = profileUrl.match(meta.handle_pattern);
      if (m) handle = m[1];
      break;
    }
  }

  if (!platform) {
    // Try to extract handle from any URL as fallback
    const parts = profileUrl.replace(/^https?:\/\//, '').split('/').filter(Boolean);
    const hostname = parts[0] || '';
    const pathHandle = parts[1] ? parts[1].replace(/^@/, '') : null;
    return {
      _engine: 'real',
      url: profileUrl,
      platform: hostname,
      platform_name: 'Unknown',
      handle: pathHandle,
      profile_type: null,
      public_data: null,
      note: 'Platform not recognized. Supported: ' + Object.values(SOCIAL_PLATFORMS).map(p => p.name).join(', '),
      requires: [],
    };
  }

  // Heuristics for profile type
  if (normalized.includes('/company/') || normalized.includes('/r/')) profileType = 'organization';
  else if (normalized.includes('/channel/') || normalized.includes('/c/')) profileType = 'channel';

  // Build canonical profile URL
  const canonical = platform === 'substack.com'
    ? `https://${handle}.substack.com`
    : `https://${platform}/${handle || ''}`;

  return {
    _engine: 'real',
    url: profileUrl,
    canonical_url: canonical,
    platform,
    platform_name: platformName,
    handle: handle ? handle.replace(/^@/, '') : null,
    profile_type: profileType,
    public_data: null,
    note: 'Static profile metadata only. Live follower counts, bio, and posts require OAuth or scraping APIs.',
    requires: [],
  };
}

// ---------------------------------------------------------------------------
// 36. enrich-image-labels  (image classification via heuristic + optional AI)
// ---------------------------------------------------------------------------

// Common image label categories based on URL/filename heuristics
const IMAGE_LABEL_HINTS = {
  // Patterns in URL or filename -> likely labels
  'logo':       ['logo', 'branding', 'corporate'],
  'avatar':     ['portrait', 'profile', 'person'],
  'photo':      ['photograph', 'real-world'],
  'screenshot': ['screenshot', 'ui', 'interface', 'software'],
  'banner':     ['banner', 'advertising', 'promotional'],
  'chart':      ['chart', 'data-visualization', 'infographic'],
  'graph':      ['graph', 'data-visualization', 'analytics'],
  'map':        ['map', 'geography', 'location'],
  'icon':       ['icon', 'ui', 'symbol'],
  'thumbnail':  ['thumbnail', 'preview'],
  'cover':      ['cover', 'hero', 'featured'],
  'profile':    ['portrait', 'profile', 'person'],
  'team':       ['group', 'people', 'team'],
  'product':    ['product', 'commercial', 'e-commerce'],
  'background': ['background', 'texture', 'abstract'],
  'diagram':    ['diagram', 'technical', 'documentation'],
};

function enrichImageLabels(input) {
  input = input || {};
  const imageUrl = input.url || input.image_url || '';
  const imageBase64 = input.base64 || input.image_base64 || '';

  if (!imageUrl && !imageBase64) {
    return {
      _engine: 'real',
      error: 'missing_param',
      required: 'url or base64',
      hint: 'Provide an image URL (url) or base64-encoded image (base64). For AI-powered labeling, an ANTHROPIC_API_KEY is required.',
    };
  }

  // If ANTHROPIC_API_KEY is available, we'd use vision — but we degrade gracefully
  const hasAiKey = !!process.env.ANTHROPIC_API_KEY;

  if (imageBase64 || hasAiKey) {
    // Signal that AI is needed for actual vision analysis
    return {
      _engine: 'real',
      url: imageUrl || null,
      labels: [],
      categories: [],
      confidence: null,
      note: 'AI-powered vision labeling requires ANTHROPIC_API_KEY to be configured on the server.',
      requires: ['ANTHROPIC_API_KEY'],
    };
  }

  // Heuristic-only mode: analyze URL/filename for hints
  const source = imageUrl.toLowerCase();
  const filename = source.split('/').pop().split('?')[0];
  const ext = filename.split('.').pop();

  const labels = new Set();
  const categories = new Set();

  // Extension-based labels
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    labels.add('image');
    if (ext === 'gif') labels.add('animated');
  }
  if (ext === 'svg') { labels.add('vector'); labels.add('scalable'); }

  // Filename/path-based labels
  for (const [keyword, tags] of Object.entries(IMAGE_LABEL_HINTS)) {
    if (source.includes(keyword)) {
      tags.forEach(t => labels.add(t));
    }
  }

  // Generic catch-all
  if (labels.size === 0) labels.add('image');

  // Category inference
  if (labels.has('portrait') || labels.has('person') || labels.has('people')) categories.add('People');
  if (labels.has('chart') || labels.has('graph') || labels.has('data-visualization')) categories.add('Data Visualization');
  if (labels.has('ui') || labels.has('interface') || labels.has('screenshot')) categories.add('Software / UI');
  if (labels.has('logo') || labels.has('branding')) categories.add('Branding');
  if (labels.has('map') || labels.has('geography')) categories.add('Geography');
  if (labels.has('product') || labels.has('commercial')) categories.add('Product / E-commerce');
  if (categories.size === 0) categories.add('General');

  return {
    _engine: 'real',
    url: imageUrl || null,
    labels: [...labels],
    categories: [...categories],
    confidence: 'low',
    method: 'heuristic-url-analysis',
    note: 'Labels derived from URL/filename heuristics. For accurate content-based labeling, provide ANTHROPIC_API_KEY.',
    requires: ['ANTHROPIC_API_KEY'],
  };
}

// ---------------------------------------------------------------------------
// 37. enrich-contact  (combine email + domain into a full contact record)
// ---------------------------------------------------------------------------

function enrichContact(input) {
  input = input || {};
  const email = input.email || '';
  const name = input.name || null;
  const phone = input.phone || null;
  const company = input.company || null;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return { _engine: 'real', error: 'missing_param', required: 'email', hint: 'Provide at minimum an email address to build a contact record' };
  }

  const trimmedEmail = email.trim().toLowerCase();

  // Validate email format
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~\-]+@[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { _engine: 'real', error: 'invalid_format', message: 'Invalid email address format' };
  }

  // Extract domain
  const domainResult = enrichEmailToDomain({ email: trimmedEmail });
  const domain = domainResult.domain || '';

  // Extract name from email if not provided
  const nameResult = enrichEmailToName({ email: trimmedEmail });
  const inferredName = name || nameResult.name || null;

  // Get domain/company info
  const domainInfo = enrichDomainInfo({ domain });

  // Validate phone if provided
  let phoneInfo = null;
  if (phone) {
    const pv = commPhoneValidate({ phone });
    phoneInfo = { number: phone, valid: pv.valid, formatted: pv.formatted, country: pv.country };
  }

  // Email quality signals
  const is_disposable = DISPOSABLE_DOMAINS.has(domain);
  const is_free_email = domainInfo.is_free_email_provider;
  const isBusiness = !is_disposable && !is_free_email;

  // Social profile guesses based on email handle
  const localPart = trimmedEmail.split('@')[0];
  const socialGuesses = [];
  if (domain === 'github.com') socialGuesses.push({ platform: 'GitHub', url: `https://github.com/${localPart}` });
  if (!is_free_email && !is_disposable) {
    socialGuesses.push({ platform: 'LinkedIn', url: `https://linkedin.com/in/${localPart}` });
  }

  return {
    _engine: 'real',
    email: trimmedEmail,
    name: inferredName,
    phone: phoneInfo,
    domain,
    company: company || domainInfo.company_name,
    industry: domainInfo.industry,
    headquarters: domainInfo.headquarters,
    email_quality: {
      valid_format: true,
      is_disposable,
      is_free_email_provider: is_free_email,
      is_business_email: isBusiness,
    },
    domain_info: {
      tld: domainInfo.tld,
      tld_type: domainInfo.tld_type,
      founded: domainInfo.founded,
      employees: domainInfo.employees,
      data_source: domainInfo.data_source,
    },
    social_profile_guesses: socialGuesses,
    note: 'Built from heuristics and local data. For verified enrichment (Clearbit, Hunter.io, etc.), external API keys are required.',
    requires: ['CLEARBIT_API_KEY'],
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  'enrich-url-to-title':          enrichUrlToTitle,
  'enrich-domain-to-company':     enrichDomainToCompany,
  'enrich-email-to-domain':       enrichEmailToDomain,
  'enrich-email-to-name':         enrichEmailToName,
  'enrich-phone-to-country':      enrichPhoneToCountry,
  'enrich-ip-to-asn':             enrichIpToAsn,
  'enrich-country-code':          enrichCountryCode,
  'enrich-language-code':         enrichLanguageCode,
  'enrich-mime-type':             enrichMimeType,
  'enrich-http-status-explain':   enrichHttpStatusExplain,
  'enrich-port-service':          enrichPortService,
  'enrich-useragent-parse':       enrichUseragentParse,
  'enrich-accept-language-parse': enrichAcceptLanguageParse,
  'enrich-crontab-explain':       enrichCrontabExplain,
  'enrich-semver-explain':        enrichSemverExplain,
  'enrich-license-explain':       enrichLicenseExplain,
  'enrich-timezone-info':         enrichTimezoneInfo,
  'enrich-emoji-info':            enrichEmojiInfo,
  'enrich-color-name':            enrichColorName,
  'enrich-file-extension-info':   enrichFileExtensionInfo,
  'comm-qr-url':                  commQrUrl,
  'comm-ical-create':             commIcalCreate,
  'comm-vcard-create':            commVcardCreate,
  'comm-markdown-email':          commMarkdownEmail,
  'comm-rss-create':              commRssCreate,
  'comm-sitemap-create':          commSitemapCreate,
  'comm-robots-create':           commRobotsCreate,
  'comm-mailto-link':             commMailtoLink,
  'comm-phone-validate':          commPhoneValidate,
  'comm-email-validate-deep':     commEmailValidateDeep,
  // New features (v2)
  'enrich-text-entities':         enrichTextEntities,
  'enrich-text-keywords':         enrichTextKeywords,
  'enrich-text-language':         enrichTextLanguage,
  'enrich-domain-info':           enrichDomainInfo,
  'enrich-social-profile':        enrichSocialProfile,
  'enrich-image-labels':          enrichImageLabels,
  'enrich-contact':               enrichContact,
};
