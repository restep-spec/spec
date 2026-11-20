#!/usr/bin/env node
// restep-check · Conformance checker for Restep 1 (core, query and writes profiles, oauth extension).
// Node 18 or later, no dependencies.  Specification: https://restep.wubytes.com/1/  (draft 5)
//
//   node restep-check.mjs https://api.example.com/ [options]
//
// By default it only reads (GET and HEAD, plus a PATCH {} to a collection, which has no effect
// either way). With --writes it also creates, changes and deletes items, touching only the ones it
// created, and removes them at the end. Every check names its section of the specification.
// Run it with --help for the options.
//
//   npx restep-check --schema discovery https://api.example.com/
//
// validates documents against the JSON Schemas instead. That mode needs ajv, which the npm package
// brings; the rest of the checker has no dependencies.

const VERSION = '0.5.0';
const SPEC = 'https://restep.wubytes.com/1/';
const ANCHORS = {
  1.1: 'restep-versions', 1.2: 'dependencies', 3: 'data', 4.1: 'profile-header', 4.2: 'discovery', 4.3: 'describing', 4.4: 'health',
  5.1: 'resources', 5.2: 'collections', 5.3: 'reserved', 5.4: 'errors', 5.5: 'versions', 5.6: 'language',
  6.1: 'filters', 6.2: 'sorting', 6.3: 'fields', 6.4: 'pagination', 6.5: 'counts',
  7.1: 'idempotency', 7.2: 'concurrency', 7.3: 'caching', 7.4: 'minimal', 9: 'sync', '10.5': 'oauth', 11: 'conformance',
};
const sectionUrl = (s) => `${SPEC}#${ANCHORS[s] ?? 'conformance'}`;

// ── Catalogue: every check, its section, its level and what it verifies ──────
// A failed MUST is a fail; a failed SHOULD is a warn.
const CHECKS = {
  'passive.json': ['3', 'MUST', 'Every body is valid JSON in UTF-8'],
  'passive.error.media-type': ['5.4', 'MUST', '4xx and 5xx bodies use application/problem+json'],
  'passive.error.members': ['5.4', 'MUST', 'Errors carry type, title, status (equal to the response’s) and code'],
  'passive.error.code': ['5.4', 'MUST', 'code comes from the table, the IANA registry or http_NNN'],
  'passive.error.type': ['5.4', 'SHOULD', 'type is the Restep error URI for the code, another URI or about:blank'],
  'passive.error.401': ['5.4', 'MUST', 'A 401 carries WWW-Authenticate'],
  'passive.error.405': ['5.1', 'MUST', 'A 405 carries Allow'],
  'passive.error.retry-after': ['5.4', 'SHOULD', '429 and 503 carry Retry-After'],
  'passive.error.parameter': ['5.3', 'MUST', 'invalid_parameter and unsupported_parameter name the parameter in parameter'],
  'passive.error.detail': ['5.4', 'SHOULD', 'Errors carry detail'],
  'passive.error.reason': ['5.4', 'MUST', 'Where discovery declares reasons, every reason is declared, with its code'],
  'passive.no-error-in-200': ['5.4', 'MUST', 'No problem object inside a 2xx'],
  'passive.profile-link': ['4.1', 'SHOULD', 'Responses carry a rel="profile" link per announced profile'],
  'passive.cache-control': ['7.3', 'MUST', 'Every GET or HEAD response, errors included, carries Cache-Control'],
  'passive.cache-private': ['7.3', 'MUST', 'Responses to requests with credentials are private or no-store'],
  'passive.links': ['3', 'MUST', 'next and href are absolute URIs or absolute paths under the API root'],

  'discovery.present': ['4.2', 'MUST', 'The API root serves a discovery document'],
  'discovery.version': ['1.1', 'MUST', 'restep is 1.x and version an integer string'],
  'discovery.dependencies': ['1.2', 'MUST', 'No profile or extension without the ones it requires'],
  'discovery.link-agrees': ['4.1', 'SHOULD', 'The profile links agree with the document'],
  'discovery.types': ['4.2', 'MUST', 'Filter types come from the vocabulary; enum carries values'],
  'discovery.ops': ['6.1', 'MUST', 'Operators come from the list; boolean only takes eq, ne and null'],
  'discovery.sync-id': ['9', 'MUST', 'A synced collection declares id in filter with in'],
  'discovery.idempotency-ttl': ['7.1', 'SHOULD', 'writes declares idempotency.ttl, at least 86400'],
  'discovery.deprecations': ['5.5', 'MUST', 'Deprecations have a valid kind, a name and an RFC 3339 sunset'],
  'discovery.reasons': ['5.4', 'MUST', 'reasons is an object of snake_case reasons, each with a code from the table, the IANA registry or http_NNN'],
  'discovery.service-doc': ['4.2', 'SHOULD', 'The discovery response, or the root’s without one, links the documentation with rel="service-doc"'],
  'discovery.no-underscore-fields': ['3', 'MUST', 'No declared field starts with _'],
  'discovery.describing': ['4.3', 'MUST', 'methods, descriptions, schemas and action declarations have the right shape'],
  'discovery.language-maps': ['4.2', 'MUST', 'language_maps is an object of objects, keyed by top-level fields that are not relations'],
  'discovery.inherit': ['5.7', 'MUST', 'inherit gives each effective field an own field and to-one relations declared in relations, none of them id, a relation or a language map'],

  'core.collection.shape': ['5.2', 'MUST', 'A collection responds {items, next} with next present'],
  'core.collection.traversal': ['5.2', 'MUST', 'Following next until null returns every item once'],
  'core.collection.deterministic': ['5.2', 'MUST', 'Two traversals return the same order'],
  'core.item.id': ['3', 'MUST', 'Every id is a non-empty string of unreserved characters'],
  'core.item.get': ['5.1', 'MUST', 'GET on an item returns it with no envelope'],
  'core.item.decimal': ['3', 'MUST', 'Decimal fields are strings'],
  'core.item.dates': ['3', 'MUST', 'datetime fields are RFC 3339 with an offset; date fields full-date'],
  'core.not-found': ['5.4', 'MUST', 'A missing item gives 404 not_found'],
  'core.error-order': ['5.4', 'MUST', 'A missing item or an unsupported method is reported before a bad parameter'],
  'core.head': ['5.1', 'MUST', 'HEAD works wherever GET does, with the same status and headers'],
  'core.method-not-allowed': ['5.1', 'MUST', 'An unsupported method gives 405 with Allow'],
  'core.put': ['5.1', 'MUST', 'PUT on an item gives 405'],
  'core.methods.allow': ['4.3', 'MUST', 'Declared methods and item_methods agree with the Allow of a 405'],
  'core.schema.create': ['4.3', 'MUST', 'A POST without a property the create schema requires gives 422'],
  'core.schema.update': ['4.3', 'MUST', 'A PATCH with a member a closed update schema does not allow gives 422, even when it is null'],
  'core.status': ['4.4', 'MUST', 'A declared status answers GET and HEAD with 200 or 503, with Cache-Control: no-store'],
  'core.language.fallback': ['5.6', 'MUST', 'An Accept-Language not offered, or malformed, gives the same code as none, never 406 or 400'],
  'core.language.vary': ['5.6', 'MUST', 'Discovery and errors whose body changes with Accept-Language carry Vary: Accept-Language and an ETag per language'],
  'core.language.data': ['3', 'MUST', 'An item gives the same body (and, with writes, ETag) under any Accept-Language'],
  'core.language.maps': ['3', 'MUST', 'Each declared language map in an item is an object of strings keyed by well-formed lowercase tags'],
  'core.inherit.read': ['5.7', 'MUST', 'An item carries its own field and the effective one, equal to the own value when there is one; _inherited, if present, names every inherited field with href, default or hidden, and href points at the item that holds the value'],
  'core.reserved.get': ['5.3', 'MUST', 'An unimplemented reserved parameter on a collection gives unsupported_parameter'],
  'core.reserved.item': ['5.3', 'MUST', 'An unimplemented reserved parameter on an item gives unsupported_parameter'],
  'core.reserved.forms': ['5.3', 'MUST', 'An unsupported parameter form gives unsupported_parameter'],
  'core.reserved.dollar': ['5.3', 'MUST', 'A $ parameter gives unsupported_parameter'],
  'core.reserved.writes': ['5.3', 'MUST', 'Writes with a reserved parameter give 400 and have no effect'],
  'core.post': ['5.1', 'MUST', 'POST gives 201 with Location and the created item'],
  'core.post.id': ['5.1', 'MUST', 'POST with an id gives 422 invalid'],
  'core.patch': ['5.1', 'MUST', 'PATCH with merge-patch+json gives 200 and the whole item'],
  'core.patch.json': ['5.1', 'SHOULD', 'PATCH also accepts application/json'],
  'core.patch.not-object': ['5.1', 'MUST', 'A patch that is not an object gives 400 bad_request'],
  'core.patch.id': ['5.1', 'MUST', 'PATCH with a different id gives 422 invalid with a read_only entry at /id'],
  'core.patch.underscore': ['5.1', 'MUST', 'A write ignores members starting with _'],
  'core.patch.merge': ['5.1', 'MUST', 'null deletes a field and absence leaves it untouched (RFC 7396)'],
  'core.patch.roundtrip': ['5.1', 'MUST', 'A PATCH with the item\'s read-only fields as read changes neither its body nor its ETag'],
  'core.patch.read-only': ['5.1', 'MUST', 'Another value in a property the item schema marks readOnly gives 422 invalid with a read_only entry, and changes nothing'],
  'core.415': ['5.1', 'SHOULD', 'A PATCH with an unsupported type gives 415 with Accept-Patch'],
  'core.delete': ['5.1', 'MUST', 'DELETE gives 204 and the item is gone'],
  'core.language.format': ['3', 'MUST', 'A PATCH with an uppercase tag, even set to null, gives 422 with a format entry at /field/TAG'],
  'core.language.merge': ['3', 'MUST', 'null deletes one translation and keeps the rest, putting it back restores it, and {"field": null} leaves {}'],
  'core.inherit.roundtrip': ['5.7', 'MUST', 'A PATCH with only the effective fields as read, without the own fields, changes neither its body nor its ETag'],
  'core.inherit.read-only': ['5.7', 'MUST', 'Another value in an effective field gives 422 invalid with a read_only entry at its pointer, and changes nothing'],
  'core.inherit.own': ['5.7', 'MUST', 'A value in the own field becomes the effective one; null in it inherits again'],
  'core.inherit.post': ['5.7', 'MUST', 'A POST with an effective field other than the value that would result gives 422 invalid with a read_only entry'],
  'core.inherit.fields': ['5.7', 'MUST', 'With fields, _inherited only names effective fields that are in the response'],
  'core.inherit.cycle': ['5.7', 'MUST', 'A link that would make an item its own ancestor gives 422 invalid'],
  'core.inherit.source': ['5.7', 'MUST', 'Changing the source changes the effective value and the ETag of an item that inherits from it'],
  'core.inherit.stale': ['5.7', 'MUST', 'After the source changes, If-Match with the old ETag gives 412 and the old effective value gives read_only'],
  'evolution.deprecation-header': ['5.5', 'MUST', 'What is deprecated carries Deprecation and a deprecation link'],
  'evolution.after-sunset': ['5.5', 'MUST', 'After its sunset, what is retired responds as 5.5 says'],
  'evolution.version-links': ['5.5', 'MUST', 'A version 2 or later links its predecessor'],

  'query.filter.match': ['6.1', 'MUST', 'Each declared filter returns exactly the matching items, compared by type'],
  'query.filter.eq-shorthand': ['6.1', 'MUST', 'filter[f]=v is the same as filter[f][eq]=v'],
  'query.filter.and': ['6.1', 'MUST', 'Several filters combine with AND'],
  'query.filter.same-field': ['6.1', 'MUST', 'Two operators on one field are two filters, combined with AND'],
  'query.filter.absent': ['6.1', 'MUST', 'No operator but null matches absent or null values'],
  'query.filter.undeclared': ['6.1', 'MUST', 'An undeclared field or operator gives unsupported_parameter'],
  'query.filter.bad-value': ['6.1', 'MUST', 'A wrong value, an empty in or a repeated filter gives invalid_parameter'],
  'query.filter.duration-years': ['6.1', 'MUST', 'A duration with years gives invalid_parameter'],
  'query.sort.order': ['6.2', 'MUST', 'sort orders by type, with missing values last both ways'],
  'query.sort.stable': ['6.2', 'MUST', 'Ties break stably across pages'],
  'query.sort.undeclared': ['6.2', 'MUST', 'An undeclared sort key gives unsupported_parameter'],
  'query.language.declared': ['6.1', 'MUST', 'No language map, nor a path that ends in or goes through one, is declared in filter or sort'],
  'query.language.exact': ['6.1', 'MUST', 'A field.tag filter or sort reads only that key: items without it count as absent'],
  'query.fields': ['6.3', 'MUST', 'fields returns only those fields, id and _ members'],
  'query.fields.unknown': ['6.3', 'MUST', 'A field that does not exist, or a path into a language map, gives invalid_parameter'],
  'query.limit': ['6.4', 'MUST', 'limit sets the page size, up to max_limit'],
  'query.limit.range': ['6.4', 'MUST', 'limit out of range gives invalid_parameter, not a silent clamp'],
  'query.cursor.keeps-params': ['6.4', 'MUST', 'next carries cursor and keeps the other parameters'],
  'query.cursor.tampered': ['6.4', 'MUST', 'A tampered cursor gives invalid_parameter on cursor'],
  'query.cursor.other-query': ['6.4', 'MUST', 'A cursor reused with another query gives invalid_parameter on cursor'],
  'query.cursor.page-params': ['6.4', 'MUST', 'Changing limit or fields between pages keeps the cursor valid'],
  'query.count': ['6.5', 'MUST', 'count=true adds total (and total_estimated when estimated)'],
  'query.count.false': ['6.5', 'MUST', 'count=false is the same as leaving it out'],
  'query.count.undeclared': ['6.5', 'MUST', 'count=true without count declared gives unsupported_parameter'],

  'writes.etag.strong': ['7.2', 'MUST', 'A full item carries a strong ETag'],
  'writes.etag.fields': ['7.2', 'MUST', 'An item with fields carries the item ETag in _etag'],
  'writes.if-none-match.get': ['7.3', 'MUST', 'If-None-Match with the current ETag gives 304 to GET and HEAD'],
  'writes.if-none-match.write': ['7.3', 'MUST', 'If-None-Match with the current ETag gives 412 to a write'],
  'writes.if-match.stale': ['7.2', 'MUST', 'If-Match with an old ETag gives 412'],
  'writes.if-match.list': ['7.2', 'MUST', 'If-Match with a list holding the current ETag, or *, succeeds'],
  'writes.if-match.race': ['7.2', 'MUST', 'Of two simultaneous writes with the same If-Match, one gets 412'],
  'writes.write-ignores-underscore': ['7.2', 'MUST', 'A representation read back with _etag can be written'],
  'writes.idempotency.replay': ['7.1', 'MUST', 'The same Idempotency-Key returns the same response and creates nothing new'],
  'writes.idempotency.replayed-header': ['7.1', 'SHOULD', 'A replay carries Idempotent-Replayed: true'],
  'writes.idempotency.replay-precondition': ['7.1', 'MUST', 'A replay returns the stored response even if a precondition no longer holds'],
  'writes.idempotency.json-equality': ['7.1', 'MUST', 'Bodies equal as JSON values are the same request'],
  'writes.idempotency.mismatch': ['7.1', 'MUST', 'The same key with another body gives 422 idempotency_mismatch'],
  'writes.idempotency.malformed': ['7.1', 'MUST', 'A malformed key gives 400 bad_request'],
  'writes.minimal': ['7.4', 'MUST', 'A minimal response carries Location and ETag'],
  'writes.minimal.applied': ['7.4', 'SHOULD', 'A minimal response carries Preference-Applied'],

  'oauth.metadata': ['10.5', 'MUST', 'The metadata is at the URL RFC 9728 forms from the root, public JSON whose resource is the root, with an authorization server'],
  'oauth.metadata.recommended': ['10.5', 'SHOULD', 'The metadata carries Cache-Control: public with max-age, and scopes_supported'],
  'oauth.challenge': ['10.5', 'MUST', 'A 401 to the root carries the metadata URL in resource_metadata'],
  'oauth.challenge.elsewhere': ['10.5', 'MUST', 'A 401 elsewhere does not point resource_metadata at the root’s metadata'],
};
const GROUPS = [['passive', 'Every response'], ['discovery', 'Discovery'], ['core', 'core'],
  ['evolution', 'Evolution'], ['query', 'query'], ['writes', 'writes'], ['oauth', 'oauth']];

const NOT_CHECKED = [
  'Atomicity when the server fails between the effect and storing the response (7.1).',
  'That an Idempotency-Key lasts 24 hours (7.1).',
  'That GET and HEAD have no visible effects (5.1).',
  'That a cursor is bound to the principal that received it (6.4).',
  'The insufficient_scope challenge on a 403: it needs a token without some scope (10.5).',
  'Which languages the server offers, so neither the lookup of Accept-Language (5.6) nor the unknown code for a tag it does not take (3).',
  'Inherited values the client cannot see the source of ("hidden"), which need a principal without that permission; and, after a source changes, the sync notices and cache groups of the items that inherit from it (5.7).',
  'relations, sync and the extensions other than oauth: a later version of this checker.',
];

// ── Options ───────────────────────────────────────────────────────────────────
const HELP = `restep-check ${VERSION} · Restep 1 conformance checker (core, query, writes, oauth)

Usage: node restep-check.mjs <api-root> [options]
       npx restep-check --schema <discovery|problem> <file|url|->...

  -H, --header "Name: value"   Send this header on every request (repeatable)
  --writes                     Also create, change and delete items (only its own)
  --fixture <coll>=<json|@file> A valid POST body for that collection (repeatable)
  --collection <name>          Only check this collection (repeatable)
  --path <name>=</path>        Declare a collection when the server has no discovery document
  --max-items <n>              Stop traversing a collection after n items (default 500)
  --timeout <ms>               Per request (default 10000)
  --json | --junit             Machine-readable output for CI
  --verbose                    Also list the checks that passed
  -h, --help                   This help

With --schema it validates each document against that JSON Schema of Restep 1 (a URL is
fetched with GET, - reads standard input). Only that mode needs ajv: npx restep-check brings it.

Exit code: 0 when no MUST fails, 1 when one does, 2 when the checker cannot run.`;

function parseArgs(argv) {
  const o = { headers: {}, writes: false, fixtures: {}, collections: [], paths: {}, maxItems: 500, timeout: 10000,
    format: 'text', verbose: false, root: null };
  const value = (i) => { if (argv[i + 1] === undefined) usage(`${argv[i]} needs a value.`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else if (a === '-H' || a === '--header') {
      const v = value(i++), c = v.indexOf(':');
      if (c < 1) usage(`Header without a colon: ${v}`);
      o.headers[v.slice(0, c).trim().toLowerCase()] = v.slice(c + 1).trim();
    } else if (a === '--writes') o.writes = true;
    else if (a === '--fixture' || a === '--path') {
      const v = value(i++), e = v.indexOf('=');
      if (e < 1) usage(`${a} takes name=value: ${v}`);
      const name = v.slice(0, e), rest = v.slice(e + 1);
      if (a === '--path') o.paths[name] = rest;
      else o.fixtures[name] = rest;
    } else if (a === '--collection') o.collections.push(value(i++));
    else if (a === '--max-items') o.maxItems = Number(value(i++));
    else if (a === '--timeout') o.timeout = Number(value(i++));
    else if (a === '--json') o.format = 'json';
    else if (a === '--junit') o.format = 'junit';
    else if (a === '--verbose' || a === '-v') o.verbose = true;
    else if (a.startsWith('-')) usage(`Unknown option ${a}`);
    else if (o.root) usage(`Only one API root: ${a}`);
    else o.root = a;
  }
  if (!o.root) usage('Missing the API root.');
  return o;
}
function usage(msg) { console.error(`${msg}\n\n${HELP}`); process.exit(2); }

// ── Results ───────────────────────────────────────────────────────────────────
const results = [];
function record(id, status, target, message = '', evidence, levelOverride) {
  const [section, catalogLevel] = CHECKS[id] ?? die(`Unknown check ${id}`);
  const level = levelOverride ?? catalogLevel;
  results.push({ id, status, level, section, target: target ?? null, message, evidence: evidence ?? null });
}
const pass = (id, target, message) => record(id, 'pass', target, message);
const skip = (id, target, reason) => record(id, 'skip', target, reason);
// A failed requirement: fail for MUST, warn for SHOULD.
const bad = (id, target, message, res) =>
  record(id, CHECKS[id][1] === 'SHOULD' ? 'warn' : 'fail', target, message, res && evidence(res));
const check = (id, target, problem, res, okMessage) => (problem ? bad(id, target, problem, res) : pass(id, target, okMessage));
function die(msg) { throw new Error(msg); }

// Passive checks run on every response; they are reported once each, with a few examples.
const passive = new Map(); // id → { seen, failures: [] }
function observe(id, problem, res) {
  const p = passive.get(id) ?? { seen: 0, failures: [] };
  passive.set(id, p);
  p.seen++;
  if (problem) p.failures.push(`${problem} (${evidence(res)})`);
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
let opts, root, rootPath, announced = ['core'], requests = 0;
let reasons = null, laterMinor = false; // 5.4: the declared reasons; 1.1: a minor version later than this checker's
// code and reason depend on discovery (its version and its reasons): errors seen before it is read wait for it.
let discovered = false;
const pendingErrors = [];
const resolvePath = (path) => new URL(rootPath.replace(/\/$/, '') + path, root.origin).href;
const enc = (s) => encodeURIComponent(s).replace(/%5B/g, '[').replace(/%5D/g, ']').replace(/%2C/g, ',').replace(/%24/g, '$');
const withQuery = (url, pairs) => (pairs.length ? `${url}${url.includes('?') ? '&' : '?'}${pairs.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&')}` : url);
const short = (url) => { const u = new URL(url); return u.origin === root.origin ? u.pathname + u.search : url; };
const evidence = (res) => `${res.method} ${short(res.url)} → ${res.status}`;

// anonymous: without the --header credentials. passive: false skips the passive checks, for
// documents that are not resources of the API (the oauth metadata, 10.5).
async function http(method, url, { headers = {}, json, body, anonymous = false, passive = true } = {}) {
  // 4.3: the credentials for the API go only to its origin, never to a schema or document elsewhere.
  const sameOrigin = new URL(url).origin === root.origin;
  const h = { accept: 'application/json', ...(anonymous || !sameOrigin ? {} : opts.headers), ...headers };
  let payload = body;
  if (json !== undefined) {
    payload = typeof json === 'string' ? json : JSON.stringify(json);
    if (!Object.keys(h).some((k) => k.toLowerCase() === 'content-type')) h['content-type'] = 'application/json';
  }
  requests++;
  let r;
  try {
    r = await fetch(url, { method, headers: h, body: payload, redirect: 'manual', signal: AbortSignal.timeout(opts.timeout) });
  } catch (e) {
    throw new Error(`${method} ${url}: ${e.cause?.code ?? e.name ?? ''} ${e.cause?.message ?? e.message}`.trim());
  }
  const buf = new Uint8Array(method === 'HEAD' ? new ArrayBuffer(0) : await r.arrayBuffer());
  const res = { method, url, status: r.status, headers: r.headers, size: buf.length, data: undefined, bodyError: null,
    reqHeaders: h };
  if (buf.length) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      try { res.data = JSON.parse(text); } catch { res.bodyError = 'the body is not JSON'; }
    } catch { res.bodyError = 'the body is not UTF-8'; }
  }
  if (passive) checkResponse(res);
  return res;
}

// ── Passive checks ────────────────────────────────────────────────────────────
// 5.4: codes from the table, by status. Statuses not in the table use the IANA description.
const TABLE = {
  400: ['bad_request', 'invalid_parameter', 'unsupported_parameter', 'idempotency_key_required'], 401: ['unauthenticated'],
  403: ['forbidden'], 404: ['not_found'], 405: ['method_not_allowed'], 406: ['not_acceptable'], 409: ['conflict'],
  410: ['state_expired', 'retired'], 412: ['precondition_failed'], 413: ['content_too_large'], 414: ['uri_too_long'],
  415: ['unsupported_media_type'], 422: ['invalid', 'idempotency_mismatch'], 424: ['not_executed'],
  428: ['precondition_required'], 429: ['rate_limited'], 500: ['internal'], 501: ['not_implemented'], 503: ['unavailable'],
};
const IANA = {
  402: 'payment_required', 407: 'proxy_authentication_required', 408: 'request_timeout', 411: 'length_required',
  416: 'range_not_satisfiable', 417: 'expectation_failed', 421: 'misdirected_request', 423: 'locked', 425: 'too_early',
  426: 'upgrade_required', 431: 'request_header_fields_too_large', 451: 'unavailable_for_legal_reasons',
  502: 'bad_gateway', 504: 'gateway_timeout', 505: 'http_version_not_supported', 506: 'variant_also_negotiates',
  507: 'insufficient_storage', 508: 'loop_detected', 510: 'not_extended', 511: 'network_authentication_required',
};
function expectedCodes(status) {
  return TABLE[status] ?? [IANA[status] ?? `http_${status}`];
}
// The reverse: whether a code can come with some 4xx or 5xx status (5.4). http_NNN only for statuses with no other code.
const KNOWN_CODES = new Set([...Object.values(TABLE).flat(), ...Object.values(IANA)]);
function possibleCode(code) {
  if (KNOWN_CODES.has(code)) return true;
  const n = /^http_([45]\d\d)$/.exec(code)?.[1];
  return !!n && !TABLE[n] && !IANA[n];
}
// A later minor version may add codes (1.1): one unknown to this checker, well formed and not taken, is not judged.
const futureCode = (code) => laterMinor && typeof code === 'string' && /^[a-z][a-z0-9_]*$/.test(code) && !KNOWN_CODES.has(code) && !/^http_\d{3}$/.test(code);
const mediaType = (res) => (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// RFC 8288: each link is <target> followed by ;-separated parameters, whose values may be quoted strings
// with commas, semicolons or escapes inside. Parameter names are case-insensitive; the first of each counts.
function parseLinks(res) {
  const h = res.headers.get('link') ?? '', out = [];
  let i = 0;
  const ws = () => { while (i < h.length && /[\s]/.test(h[i])) i++; };
  while (i < h.length) {
    ws();
    if (h[i] === ',') { i++; continue; }
    if (h[i] !== '<') { while (i < h.length && h[i] !== ',') i++; continue; } // not a link: skip to the next
    const end = h.indexOf('>', i);
    if (end < 0) break;
    const link = { target: h.slice(i + 1, end), params: {} };
    let broken = false;
    i = end + 1;
    for (;;) {
      ws();
      if (h[i] !== ';') break;
      i++; ws();
      const name = /^[^=;,\s]*/.exec(h.slice(i))[0].toLowerCase();
      i += name.length; ws();
      let value = '';
      if (h[i] === '=') {
        i++; ws();
        if (h[i] === '"') {
          i++;
          while (i < h.length && h[i] !== '"') { if (h[i] === '\\') i++; value += h[i++] ?? ''; }
          if (i >= h.length) { broken = true; break; } // an unclosed quoted string: not a link
          i++;
        } else { value = /^[^;,\s]*/.exec(h.slice(i))[0]; i += value.length; }
      }
      if (name && !Object.hasOwn(link.params, name)) link.params[name] = value;
    }
    if (!broken) out.push(link);
    while (i < h.length && h[i] !== ',') i++;
  }
  return out;
}
const linksWithRel = (res, rel) => parseLinks(res).filter((l) => (l.params.rel ?? '').toLowerCase().split(/\s+/).includes(rel));
function linkTargets(res, rel) { return linksWithRel(res, rel).map((l) => l.target); }
function checkLink(value, res) { // 3: absolute URI, or absolute path under the API root
  if (typeof value !== 'string') return `${JSON.stringify(value)} is not a string`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return `${value} is neither an absolute URI nor an absolute path`;
  if (!value.startsWith(rootPath) && rootPath !== '/') return `${value} does not include the API root’s path ${rootPath}`;
  return null;
}

function checkResponse(res) {
  const noBody = res.status === 204 || res.status === 304 || res.method === 'HEAD';
  if (!noBody && res.size) observe('passive.json', res.bodyError, res);
  const read = res.method === 'GET' || res.method === 'HEAD';
  if (announced.includes('writes') && read) observe('passive.cache-control', res.headers.has('cache-control') ? null : 'no Cache-Control', res);
  if (read && Object.keys(res.reqHeaders).includes('authorization') && res.headers.has('cache-control')) {
    const cc = res.headers.get('cache-control').toLowerCase();
    observe('passive.cache-private', /\b(private|no-store)\b/.test(cc) ? null : `Cache-Control: ${cc}`, res);
  }
  if (res.status !== 304) {
    const missing = announced.filter((p) => !linkTargets(res, 'profile').includes(`${SPEC}${p}`));
    observe('passive.profile-link', missing.length ? `missing profile links: ${missing.join(', ')}` : null, res);
  }
  if (res.status >= 400) {
    if (res.status === 401) observe('passive.error.401', res.headers.has('www-authenticate') ? null : 'no WWW-Authenticate', res);
    if (res.status === 405) observe('passive.error.405', res.headers.has('allow') ? null : 'no Allow', res);
    if (res.status === 429 || res.status === 503) observe('passive.error.retry-after', res.headers.has('retry-after') ? null : 'no Retry-After', res);
    if (res.method === 'HEAD' || !res.size) return;
    observe('passive.error.media-type', mediaType(res) === 'application/problem+json' ? null : `Content-Type: ${mediaType(res) || '(none)'}`, res);
    const d = res.data;
    if (!isObject(d)) return observe('passive.error.members', 'the body is not a JSON object', res);
    const missing = ['type', 'title', 'status', 'code'].filter((k) => d[k] === undefined);
    observe('passive.error.members', missing.length ? `missing ${missing.join(', ')}`
      : d.status !== res.status ? `status ${d.status} in a ${res.status} response` : null, res);
    observe('passive.error.detail', typeof d.detail === 'string' && d.detail ? null : 'no detail', res);
    if (d.code === 'invalid_parameter' || d.code === 'unsupported_parameter')
      observe('passive.error.parameter', typeof d.parameter === 'string' && d.parameter ? null : `${d.code} without parameter`, res);
    if (discovered) errorCodes(res, d); else pendingErrors.push([res, d]);
    if (typeof d.code === 'string') {
      if (typeof d.type === 'string')
        observe('passive.error.type', d.type === 'about:blank' || /^[a-z][a-z0-9+.-]*:/i.test(d.type) && (!d.type.startsWith(`${SPEC}errors#`) || d.type === `${SPEC}errors#${d.code}`)
          ? null : `type ${d.type} for code ${d.code}`, res);
    }
    return;
  }
  if (res.status >= 200 && res.status < 300 && isObject(res.data)) {
    const d = res.data;
    observe('passive.no-error-in-200', typeof d.code === 'string' && typeof d.type === 'string' && Number.isInteger(d.status) && d.status >= 400
      ? 'a problem object in a 2xx response' : null, res);
    if ('next' in d && 'items' in d && d.next !== null) observe('passive.links', checkLink(d.next, res), res);
    const actions = [d, ...(Array.isArray(d.items) ? d.items : [])].flatMap((x) => (isObject(x?._actions) ? Object.values(x._actions) : []));
    for (const a of actions) if (a?.href !== undefined) observe('passive.links', checkLink(a.href, res), res);
  }
}

// ── Typed values (3, 4.2, 6.1) ───────────────────────────────────────────────
const TYPES = ['string', 'integer', 'number', 'decimal', 'boolean', 'date', 'datetime', 'duration', 'enum'];
const OPS = ['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in', 'null'];
const DECIMAL = /^-?[0-9]+(\.[0-9]+)?$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;
const UNRESERVED = /^[A-Za-z0-9\-._~]+$/;
// 3: a well-formed language tag (the grammar of RFC 5646, 2.1) in lowercase, as language maps use.
const TAG = new RegExp('^(?:(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4,8})(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?' +
  '(?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?' +
  '|x(?:-[a-z0-9]{1,8})+|en-gb-oed|i-(?:ami|bnn|default|enochian|hak|klingon|lux|mingo|navajo|pwn|tao|tay|tsu)' +
  '|sgn-(?:be-fr|be-nl|ch-de)|art-lojban|cel-gaulish|no-bok|no-nyn|zh-(?:guoyu|hakka|min|min-nan|xiang))$');
// The fields a collection declares as language maps (4.2).
const languageMaps = (c) => (isObject(c?.language_maps) ? Object.keys(c.language_maps) : []);
// 5.7: the declared inherited fields, as [effective, rule] with a string own field.
const inherited = (c) => (isObject(c?.inherit) ? Object.entries(c.inherit).filter(([, d]) => isObject(d) && typeof d.own === 'string') : []);
// The same value: decimals compared exactly, anything else as JSON.
const decimal = (s) => {
  const [i, f = ''] = s.replace(/^-/, '').split('.');
  const digits = i.replace(/^0+(?=\d)/, '') + (f.replace(/0+$/, '') ? `.${f.replace(/0+$/, '')}` : '');
  return (s.startsWith('-') && /[1-9]/.test(s) ? '-' : '') + digits;
};
const sameValue = (a, b) => (typeof a === 'string' && typeof b === 'string' && DECIMAL.test(a) && DECIMAL.test(b)
  ? decimal(a) === decimal(b) : JSON.stringify(a) === JSON.stringify(b));
// JSON with sorted keys, to compare bodies whatever the order of their members.
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : isObject(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v));
function inheritReadProblems(c, it) {
  const out = [];
  const why = it?._inherited;
  if (why !== undefined && !isObject(why)) return [`${it?.id}._inherited is not an object`];
  for (const [f, d] of inherited(c)) {
    if (!(f in it) && !(d.own in it)) continue; // left out, by permissions
    if (!(d.own in it)) { out.push(`${it.id} carries ${f} but not its own field ${d.own}`); continue; }
    const own = it[d.own];
    if (!blank(own) && !sameValue(own, it[f])) out.push(`${it.id}.${f} is ${JSON.stringify(it[f])} but its own value is ${JSON.stringify(own)}`);
    if (blank(own) && d.default === true && blank(it[f])) out.push(`${it.id}.${f} is empty though the chain ends in a default`);
    if (!why) continue;
    if (!blank(own) && f in why) out.push(`${it.id}._inherited names ${f}, which has its own value`);
    if (blank(own) && f in it && !(f in why)) out.push(`${it.id}._inherited leaves out ${f}, which is inherited`);
    const from = why[f]?.from;
    if (f in why && !(from === 'default' || from === 'hidden' || (isObject(from) && typeof from.href === 'string')))
      out.push(`${it.id}._inherited.${f}.from is ${JSON.stringify(from)}, not {href}, "default" or "hidden"`);
  }
  return out;
}
// Two language maps with the same translations, whatever the order of their keys.
const sameMap = (a, b) => isObject(a) && isObject(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

function cmpDecimal(a, b) { // exact: compares digit strings, never through Number
  const neg = (s) => s.startsWith('-') && /[1-9]/.test(s);
  if (neg(a) !== neg(b)) return neg(a) ? -1 : 1;
  const sign = neg(a) ? -1 : 1;
  const [ai, af = ''] = a.replace('-', '').split('.'), [bi, bf = ''] = b.replace('-', '').split('.');
  const i1 = ai.replace(/^0+(?=\d)/, ''), i2 = bi.replace(/^0+(?=\d)/, '');
  if (i1.length !== i2.length) return sign * (i1.length - i2.length);
  if (i1 !== i2) return sign * (i1 < i2 ? -1 : 1);
  const n = Math.max(af.length, bf.length), f1 = af.padEnd(n, '0'), f2 = bf.padEnd(n, '0');
  return f1 === f2 ? 0 : sign * (f1 < f2 ? -1 : 1);
}
function cmpText(a, b) { // by Unicode code points
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}
function durationSeconds(s) {
  const m = String(s).match(DURATION);
  if (!m || m[1] || m[2]) return NaN; // years and months have no fixed length
  const n = (x) => (x ? parseFloat(x) : 0);
  return n(m[3]) * 604800 + n(m[4]) * 86400 + n(m[6]) * 3600 + n(m[7]) * 60 + n(m[8]);
}
// Comparable form of a value of that type; undefined when it does not fit the type.
function norm(type, v) {
  switch (type) {
    case 'decimal': return typeof v === 'string' && DECIMAL.test(v) ? v : undefined;
    case 'integer': { const n = typeof v === 'number' ? v : /^-?\d+$/.test(v) ? Number(v) : NaN; return Number.isInteger(n) ? n : undefined; }
    case 'number': { const n = typeof v === 'number' ? v : /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(v) ? Number(v) : NaN; return Number.isFinite(n) ? n : undefined; }
    case 'boolean': return v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined;
    case 'date': return DATE.test(v) ? Date.parse(`${v}T00:00:00Z`) : undefined;
    case 'datetime': return DATETIME.test(v) ? Date.parse(v) : undefined;
    case 'duration': { const s = durationSeconds(v); return Number.isNaN(s) ? undefined : s; }
    default: return typeof v === 'string' ? v : undefined;
  }
}
function cmp(type, a, b) {
  if (type === 'decimal') return cmpDecimal(a, b);
  if (type === 'boolean') return a === b ? 0 : a ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return cmpText(String(a), String(b));
}
const get = (item, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), item);
const blank = (v) => v === undefined || v === null;
// Whether an item matches filter[field][op]=raw, by 6.1.
function matches(type, op, value, raw) {
  if (op === 'null') return blank(value) === (raw === 'true');
  if (blank(value)) return false;
  const x = norm(type, value);
  if (x === undefined) return false;
  if (op === 'in') return raw.split(',').some((r) => cmp(type, x, norm(type, r)) === 0);
  const c = cmp(type, x, norm(type, raw));
  return { eq: c === 0, ne: c !== 0, lt: c < 0, le: c <= 0, gt: c > 0, ge: c >= 0 }[op];
}
const toRaw = (v) => (typeof v === 'string' ? v : String(v));

// ── Collections ───────────────────────────────────────────────────────────────
const isCollection = (d) => isObject(d) && Array.isArray(d.items) && 'next' in d;
async function traverse(url, max = opts.maxItems) {
  const items = [], pages = [];
  const seen = new Set();
  let next = url;
  while (next) {
    const res = await http('GET', next);
    pages.push(res);
    if (res.status !== 200 || !isCollection(res.data)) return { items, pages, complete: false, error: res };
    items.push(...res.data.items);
    if (res.data.next === null) return { items, pages, complete: true };
    if (typeof res.data.next !== 'string') return { items, pages, complete: false, error: res };
    if (items.length >= max) return { items, pages, complete: false };
    next = new URL(res.data.next, next).href;
    if (seen.has(next)) return { items, pages, complete: false, loop: next };
    seen.add(next);
  }
}
const ids = (items) => items.map((i) => i?.id);
const dupes = (list) => [...new Set(list.filter((x, i) => list.indexOf(x) !== i))];
function setDiff(got, want) {
  const g = new Set(got), w = new Set(want);
  const extra = [...g].filter((x) => !w.has(x)), missing = [...w].filter((x) => !g.has(x));
  return extra.length || missing.length
    ? [missing.length && `missing ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`,
      extra.length && `unexpected ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? '…' : ''}`].filter(Boolean).join('; ')
    : null;
}
// What is wrong with a response that should be a problem with that status, code and parameter.
function problemMismatch(res, status, code, parameter) {
  if (res.status !== status) return `got ${res.status}${res.data?.code ? ` ${res.data.code}` : ''}, expected ${status} ${code}`;
  if (res.data?.code !== code) return `code ${JSON.stringify(res.data?.code)}, expected "${code}"`;
  if (parameter !== undefined && res.data?.parameter !== parameter)
    return `parameter ${JSON.stringify(res.data?.parameter)}, expected ${JSON.stringify(parameter)}`;
  return null;
}
const rand = () => Math.random().toString(36).slice(2, 10);

// passive.error.code and passive.error.reason, once discovery has given the version and the reasons.
function errorCodes(res, d) {
  if (typeof d.code === 'string') {
    const codes = expectedCodes(res.status);
    observe('passive.error.code', codes.includes(d.code) || futureCode(d.code) ? null : `code "${d.code}" for ${res.status}, expected ${codes.join(' or ')}`, res);
  }
  if (reasons && d.reason !== undefined)
    observe('passive.error.reason', typeof d.reason !== 'string' || !/^[a-z][a-z0-9_]*$/.test(d.reason) ? `reason ${JSON.stringify(d.reason)} is not a snake_case string`
      : !Object.hasOwn(reasons, d.reason) ? `reason ${d.reason} is not in discovery’s reasons`
      : reasons[d.reason]?.code !== d.code ? `reason ${d.reason} with code ${JSON.stringify(d.code)}, declared with ${JSON.stringify(reasons[d.reason]?.code)}` : null, res);
}
function discoveryDone() {
  discovered = true;
  for (const [res, d] of pendingErrors.splice(0)) errorCodes(res, d);
}

// ── Discovery ─────────────────────────────────────────────────────────────────
const REQUIRES = { query: ['core'], writes: ['core'], relations: ['core'], sync: ['core', 'query'], actions: ['core'],
  batch: ['core'], 'filter-expr': ['query'], 'query-method': ['query'], oauth: ['core'] };
const KNOWN_PROFILES = ['core', 'query', 'writes', 'relations', 'sync'];
const KNOWN_EXTENSIONS = ['actions', 'batch', 'filter-expr', 'query-method', 'oauth'];
const DEPRECATION_KINDS = ['version', 'collection', 'field', 'filter', 'sort', 'relation', 'action', 'method', 'item_method'];

async function discover() {
  let res = await http('GET', root.href);
  let doc = res.status >= 200 && res.status < 300 && isObject(res.data) && typeof res.data.restep === 'string' ? res.data : null;
  let denied = null; // a service-desc candidate that asked for credentials or refused them
  if (!doc) {
    // 4.2: there may be several service-desc links (an OpenAPI document, say): the first discovery document wins.
    // A candidate that fails, or that is another kind of document, is skipped without judging it.
    for (const desc of linkTargets(res, 'service-desc')) {
      const r = await (async () => http('GET', new URL(desc, root).href, { passive: false }))().catch(() => null);
      if (r?.status === 401 || r?.status === 403) denied = r;
      if (r?.status >= 200 && r.status < 300 && isObject(r.data) && typeof r.data.restep === 'string') { checkResponse(r); res = r; doc = r.data; break; }
    }
  }
  const linked = linkTargets(res, 'profile').filter((u) => u.startsWith(SPEC)).map((u) => u.slice(SPEC.length));
  if (!doc && res.status === 401) { // the root may ask for credentials (10.5): not a missing document
    skip('discovery.present', null, 'the root answers 401: run with --header to check the API itself');
    skip('discovery.service-doc', null, 'the root answers 401: whether it serves discovery is unknown');
    return { doc: null, res, linked };
  }
  if (!doc) {
    // Without access, whether there is a discovery document (and so where service-doc goes) is unknown.
    if (denied || res.status === 403) skip('discovery.service-doc', null, `${denied ? 'a service-desc target' : 'the root'} answers ${(denied ?? res).status}: run with --header to check it`);
    else serviceDoc(res, true);
    const beyond = linked.filter((p) => p !== 'core');
    if (beyond.length) bad('discovery.present', null, `No discovery document, but the profile links announce ${beyond.join(', ')}`, res);
    else record('discovery.present', 'warn', null, 'No discovery document: a core-only server SHOULD serve one. Assuming core only.', evidence(res), 'SHOULD');
    return { doc: null, res };
  }
  pass('discovery.present', null, short(res.url));
  check('discovery.version', null, !/^1\.\d+$/.test(doc.restep) ? `restep is ${JSON.stringify(doc.restep)}, expected 1.x`
    : doc.version !== undefined && !/^[1-9]\d*$/.test(doc.version) ? `version is ${JSON.stringify(doc.version)}` : null, res);
  laterMinor = /^1\.\d+$/.test(doc.restep) && Number(doc.restep.split('.')[1]) > 0;
  serviceDoc(res, false);
  // 5.4: the catalogue of reasons, at the root.
  if (doc.reasons !== undefined) {
    const problems = [];
    if (!isObject(doc.reasons)) problems.push('reasons is not an object');
    else for (const [r, d] of Object.entries(doc.reasons)) {
      if (!/^[a-z][a-z0-9_]*$/.test(r)) problems.push(`reason ${JSON.stringify(r)} is not snake_case`);
      if (!isObject(d)) { problems.push(`reasons.${r} is not an object`); continue; }
      if (typeof d.code !== 'string') problems.push(`reasons.${r} has no code`);
      else if (!possibleCode(d.code) && !futureCode(d.code)) problems.push(`reasons.${r}: code ${d.code} is not in the table, the IANA registry or http_NNN for a status with no other code`);
      if (d.description !== undefined && (typeof d.description !== 'string' || !d.description)) problems.push(`reasons.${r}.description is not a non-empty string`);
    }
    check('discovery.reasons', null, problems.join('; ') || null, res);
    if (isObject(doc.reasons)) reasons = doc.reasons;
  }

  const profiles = Array.isArray(doc.profiles) ? doc.profiles : [];
  const extensions = Array.isArray(doc.extensions) ? doc.extensions : [];
  const all = ['core', ...profiles, ...extensions];
  const unmet = [...profiles, ...extensions].flatMap((p) => (REQUIRES[p] ?? []).filter((r) => !all.includes(r)).map((r) => `${p} without ${r}`));
  check('discovery.dependencies', null, unmet.length ? unmet.join('; ') : null, res);
  const unknown = [...profiles.filter((p) => !KNOWN_PROFILES.includes(p)), ...extensions.filter((p) => !KNOWN_EXTENSIONS.includes(p))];
  if (unknown.length) record('discovery.dependencies', 'skip', null, `Unknown to this checker (a later minor version?): ${unknown.join(', ')}`);
  const declared = [...new Set(['core', ...profiles, ...extensions])];
  const disagree = [...declared.filter((p) => !linked.includes(p)), ...linked.filter((p) => !declared.includes(p))];
  check('discovery.link-agrees', null, disagree.length ? `the profile links and the document differ on: ${disagree.join(', ')}` : null, res);

  const colls = isObject(doc.collections) ? doc.collections : {};
  const typeProblems = [], opProblems = [], underscore = [], deprecations = [];
  for (const [name, c] of Object.entries(colls)) {
    for (const [field, f] of Object.entries(isObject(c.filter) ? c.filter : {})) {
      if (!TYPES.includes(f?.type)) typeProblems.push(`${name}.${field}: type ${JSON.stringify(f?.type)}`);
      else if (f.type === 'enum' && !Array.isArray(f.values)) typeProblems.push(`${name}.${field}: enum without values`);
      const ops = Array.isArray(f?.ops) ? f.ops : [];
      if (!ops.length) opProblems.push(`${name}.${field}: no ops`);
      for (const op of ops) if (!OPS.includes(op)) opProblems.push(`${name}.${field}: operator ${op}`);
      if (f?.type === 'boolean' && ops.some((op) => !['eq', 'ne', 'null'].includes(op))) opProblems.push(`${name}.${field}: boolean with ${ops.join(', ')}`);
      if (field.split('.').some((p) => p.startsWith('_'))) underscore.push(`${name}.${field}`);
    }
    for (const s of Array.isArray(c.sort) ? c.sort : []) if (String(s).startsWith('_')) underscore.push(`${name} sort ${s}`);
    if (c.sync !== undefined && !(c.filter?.id?.ops ?? []).includes('in'))
      bad('discovery.sync-id', name, 'a collection with sync must declare id in filter with in', res);
    for (const d of Array.isArray(c.deprecations) ? c.deprecations : []) deprecations.push([name, d]);
  }
  for (const d of Array.isArray(doc.deprecations) ? doc.deprecations : []) deprecations.push([null, d]);
  const describing = describingProblems(colls);
  if (describing.checked) check('discovery.describing', null, describing.problems.join('; ') || null, res);
  // 4.2 and 6.1: language_maps, where some collection declares it.
  const withMaps = Object.entries(colls).filter(([, c]) => c?.language_maps !== undefined);
  if (withMaps.length) {
    const problems = withMaps.flatMap(([name, c]) => {
      if (!isObject(c.language_maps)) return [`${name}.language_maps is not an object`];
      return Object.entries(c.language_maps).flatMap(([f, d]) => [
        ...(!isObject(d) ? [`${name}.language_maps.${f} is not an object`] : []),
        ...(f.includes('.') ? [`${name}.language_maps.${f}: only top-level fields can be language maps`] : []),
        ...(isObject(c.relations) && Object.hasOwn(c.relations, f) ? [`${name}.${f} is both a language map and a relation`] : []),
      ]);
    });
    check('discovery.language-maps', null, problems.join('; ') || null, res);
  }
  // 5.7: inherit, where some collection declares it.
  const withInherit = Object.entries(colls).filter(([, c]) => c?.inherit !== undefined);
  if (withInherit.length) {
    const problems = withInherit.flatMap(([name, c]) => {
      if (!isObject(c.inherit)) return [`${name}.inherit is not an object`];
      const rels = isObject(c.relations) ? c.relations : {};
      const banned = (f) => f === 'id' || f.includes('.') || Object.hasOwn(rels, f) || (isObject(c.language_maps) && Object.hasOwn(c.language_maps, f));
      return Object.entries(c.inherit).flatMap(([f, d]) => {
        if (!isObject(d)) return [`${name}.inherit.${f} is not an object`];
        const out = [];
        if (typeof d.own !== 'string' || !d.own || d.own === f) out.push(`${name}.inherit.${f}.own must name another field`);
        for (const x of [f, d.own].filter((x) => typeof x === 'string' && banned(x))) out.push(`${name}.inherit.${f}: ${x} is id, a relation, a language map or not top-level`);
        if (d.from !== undefined && (!Array.isArray(d.from) || d.from.some((r) => typeof r !== 'string'))) out.push(`${name}.inherit.${f}.from is not a list of relation names`);
        for (const r of Array.isArray(d.from) ? d.from.filter((r) => typeof r === 'string') : []) {
          if (!Object.hasOwn(rels, r)) out.push(`${name}.inherit.${f}.from names ${r}, not declared in relations`);
          else if (rels[r]?.many) out.push(`${name}.inherit.${f}.from names ${r}, a to-many relation`);
        }
        if (d.default !== undefined && typeof d.default !== 'boolean') out.push(`${name}.inherit.${f}.default is not a boolean`);
        return out;
      });
    });
    check('discovery.inherit', null, problems.join('; ') || null, res);
  }
  check('discovery.types', null, typeProblems.join('; ') || null, res);
  check('discovery.ops', null, opProblems.join('; ') || null, res);
  check('discovery.no-underscore-fields', null, underscore.length ? `fields starting with _: ${underscore.join(', ')}` : null, res);
  if (profiles.includes('writes')) {
    const ttl = doc.idempotency?.ttl;
    if (ttl === undefined) bad('discovery.idempotency-ttl', null, 'idempotency.ttl is not declared', res);
    else if (!(Number.isInteger(ttl) && ttl >= 86400)) record('discovery.idempotency-ttl', 'fail', null, `idempotency.ttl is ${ttl}: keys MUST last at least 86400 seconds`, evidence(res), 'MUST');
    else pass('discovery.idempotency-ttl', null, `${ttl} s`);
  }
  const depProblems = deprecations.flatMap(([coll, d]) => {
    const where = coll ? `${coll}: ` : '';
    if (!isObject(d)) return [`${where}${JSON.stringify(d)} is not an object`];
    const p = [];
    if (!DEPRECATION_KINDS.includes(d.kind)) p.push(`${where}kind ${JSON.stringify(d.kind)}`);
    if (typeof d.name !== 'string' && d.kind !== 'version') p.push(`${where}${d.kind} without name`);
    if (d.sunset !== undefined && !DATETIME.test(d.sunset)) p.push(`${where}sunset ${JSON.stringify(d.sunset)} is not RFC 3339`);
    if (!coll && !['version', 'collection'].includes(d.kind)) p.push(`a ${d.kind} deprecation belongs in its collection`);
    return p;
  });
  if (deprecations.length) check('discovery.deprecations', null, depProblems.join('; ') || null, res);
  return { doc, res, deprecations };
}

// 4.2: a link to the documentation for people, on the response that served discovery or, without one, the root's
// (with the root as anchor if it is an error). The target is not fetched: it may redirect or ask for a login.
function serviceDoc(res, isRoot) {
  // A URI reference (RFC 3986) has no spaces or controls and is not empty here; one that does not resolve is no link.
  const resolve = (a) => { if (!a || /[\s\x00-\x1f]|%(?![0-9a-f]{2})/i.test(a)) return null; try { return new URL(a, res.url).href; } catch { return null; } };
  const links = linksWithRel(res, 'service-doc').filter((l) => resolve(l.target));
  // RFC 8288, 3.2: the context is the anchor if there is one; otherwise the request URL, which an error does not identify.
  const about = links.filter((l) => l.params.anchor !== undefined ? [root.href, res.url].includes(resolve(l.params.anchor)) : !(isRoot && res.status >= 400));
  const where = isRoot ? 'the root’s response' : 'the discovery document’s response';
  check('discovery.service-doc', null, !links.length ? `no Link with rel="service-doc" in ${where}`
    : !about.length ? (isRoot && res.status >= 400 ? `the root answers ${res.status}, and no service-doc link has the API root as anchor` : 'every service-doc link is anchored elsewhere')
    : null, res, about.map((l) => l.target).join(', '));
}

// 4.3: the optional members that describe operations, when a collection declares any.
const FOUR = ['GET', 'POST', 'PATCH', 'DELETE'];
const isSchemaRef = (v) => isObject(v) || (typeof v === 'string' && /^(\/|[a-z][a-z0-9+.-]*:)/i.test(v));
function describingProblems(colls) {
  const problems = [];
  let checked = false;
  const desc = (where, v) => { if (v !== undefined) { checked = true; if (typeof v !== 'string' || !v) problems.push(`${where}: description is not a non-empty string`); } };
  for (const [name, c] of Object.entries(colls)) {
    if (!isObject(c)) continue;
    desc(name, c.description);
    for (const key of ['methods', 'item_methods']) {
      if (c[key] === undefined) continue;
      checked = true;
      if (!Array.isArray(c[key]) || c[key].some((m) => !FOUR.includes(m)) || new Set(c[key]).size !== c[key].length)
        problems.push(`${name}.${key}: ${JSON.stringify(c[key])} is not a list of distinct methods out of ${FOUR.join(', ')}`);
    }
    if (c.schemas !== undefined) {
      checked = true;
      if (!isObject(c.schemas)) problems.push(`${name}.schemas is not an object`);
      else for (const [k, v] of Object.entries(c.schemas))
        if (['item', 'create', 'update'].includes(k) && !isSchemaRef(v)) problems.push(`${name}.schemas.${k} is neither a schema object nor an absolute link`);
    }
    for (const [f, d] of Object.entries(isObject(c.filter) ? c.filter : {})) desc(`${name}.filter.${f}`, d?.description);
    for (const [r, d] of Object.entries(isObject(c.relations) ? c.relations : {})) desc(`${name}.relations.${r}`, d?.description);
    for (const [f, d] of Object.entries(isObject(c.inherit) ? c.inherit : {})) desc(`${name}.inherit.${f}`, d?.description);
    for (const [a, d] of Object.entries(isObject(c.actions) ? c.actions : {})) {
      if (!isObject(d)) continue;
      desc(`${name}.actions.${a}`, d.description);
      if (d.method !== undefined) {
        checked = true;
        if (!['GET', 'POST'].includes(d.method)) problems.push(`${name}.actions.${a}: method ${JSON.stringify(d.method)}`);
        else if (d.method === 'GET' && d.safe !== true) problems.push(`${name}.actions.${a}: GET on an action that is not safe`);
        else if (d.method === 'GET' && d.input !== undefined) problems.push(`${name}.actions.${a}: a GET action with input`);
      }
      if (d.input !== undefined) { checked = true; if (!isSchemaRef(d.input)) problems.push(`${name}.actions.${a}.input is neither a schema object nor an absolute link`); }
    }
  }
  return { checked, problems };
}
// 4.3: a declared list of methods agrees with the Allow of a 405 on the four methods Restep defines.
function allowProblem(res, declared) {
  if (res.status !== 405 || !res.headers.has('allow')) return null; // core.method-not-allowed and core.put report that
  const allow = res.headers.get('allow').split(',').map((m) => m.trim().toUpperCase()).filter((m) => FOUR.includes(m));
  const missing = declared.filter((m) => !allow.includes(m)), extra = allow.filter((m) => !declared.includes(m));
  return missing.length || extra.length
    ? `Allow: ${res.headers.get('allow')}, declared ${declared.join(', ')}${missing.length ? `; missing ${missing.join(', ')}` : ''}${extra.length ? `; not declared ${extra.join(', ')}` : ''}` : null;
}
// A schema of 4.3, inline or behind its link (absolute, as links in bodies are, section 3).
async function loadSchema(v) {
  if (isObject(v)) return v;
  if (typeof v !== 'string') return null;
  const res = await http('GET', new URL(v, root).href);
  return isObject(res.data) ? res.data : null;
}

// 4.4: the service status is outside the API, so the passive checks (problem+json, profile links) skip it.
async function checkStatus(link) {
  if (typeof link !== 'string' || !/^(\/|[a-z][a-z0-9+.-]*:)/i.test(link)) return bad('core.status', null, `status ${JSON.stringify(link)} is not an absolute link`);
  const url = new URL(link, root).href;
  const problems = [], refused = [];
  let last;
  for (const method of ['GET', 'HEAD']) {
    last = await http(method, url, { passive: false });
    const cc = (last.headers.get('cache-control') ?? '').toLowerCase();
    if ([401, 403, 429].includes(last.status)) refused.push(`${method} ${last.status}`);
    else if (![200, 503].includes(last.status)) problems.push(`${method} got ${last.status}, expected 200 or 503`);
    else if (!/\bno-store\b/.test(cc)) problems.push(`${method} Cache-Control: ${cc || '(none)'}`);
  }
  if (!problems.length && refused.length === 2) return skip('core.status', short(url), `refused: ${refused.join(', ')}`);
  check('core.status', short(url), problems.join('; ') || null, last);
}

// 5.6: the API's own texts (errors, discovery) may follow Accept-Language; the code of an error never does.
const LANGUAGE_PROBES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'zh'];
const hasVary = (res, name) => (res.headers.get('vary') ?? '').split(',').map((v) => v.trim().toLowerCase()).some((v) => v === name || v === '*');
async function checkLanguage(disc, ctx) {
  const s = ctx.collections[0];
  const missingUrl = s ? `${s.url.replace(/\/$/, '')}/restep-check-${rand()}` : resolvePath(`/restep-check-${rand()}`);
  const targets = [['a missing item', missingUrl], ...(s ? [['a $ parameter', withQuery(s.url, [['$restep_check', '1']])]] : [])];
  const problems = [];
  let last;
  const what = (r) => `${r.status}${r.data?.code ? ` ${r.data.code}` : ''}`;
  for (const [label, u] of targets) {
    const base = await http('GET', u);
    if (base.status < 400) continue;
    // One range nobody offers (qaa is for local use) and two malformed headers.
    for (const al of ['qaa-x-restepcheck', 'es;q=abc, ;;, -x-, *;q=2', '123456789-ES']) {
      last = await http('GET', u, { headers: { 'accept-language': al } });
      if (last.status !== base.status || last.data?.code !== base.data?.code) {
        problems.push(`${label} with Accept-Language: ${al} got ${what(last)}, without it ${what(base)}`); problems.ev ??= last;
      }
    }
  }
  if (!last) skip('core.language.fallback', null, 'found no error to ask for');
  else check('core.language.fallback', null, problems.join('; ') || null, problems.ev ?? last);

  // Where the body changes with the language: Vary on every response, the default included, and one ETag per body.
  const vary = [], tried = [];
  for (const [label, u] of [...(disc.doc ? [['discovery', disc.res.url]] : []), ['an error', missingUrl]]) {
    const got = [];
    for (const al of [null, ...LANGUAGE_PROBES]) got.push([al ?? '(none)', await http('GET', u, { headers: al ? { 'accept-language': al } : {} })]);
    const bodies = new Set(got.map(([, r]) => JSON.stringify(r.data)));
    if (bodies.size < 2) { tried.push(label); continue; }
    const without = got.filter(([, r]) => !hasVary(r, 'accept-language'));
    if (without.length) { vary.push(`${label} changes with Accept-Language but has no Vary: Accept-Language with ${without.map(([al]) => al).join(', ')}`); vary.ev ??= without[0][1]; }
    const byTag = new Map();
    for (const [al, r] of got) {
      const tag = r.headers.get('etag'), body = JSON.stringify(r.data);
      if (!tag) continue;
      if (byTag.has(tag) && byTag.get(tag)[1] !== body) { vary.push(`${label}: the same ETag ${tag} for ${byTag.get(tag)[0]} and ${al}, with different bodies`); vary.ev ??= r; break; }
      byTag.set(tag, [al, body]);
    }
    vary.last = got.at(-1)[1];
  }
  if (!vary.last) skip('core.language.vary', null, `${tried.join(' and ')} did not change with Accept-Language (tried ${LANGUAGE_PROBES.join(', ')})`);
  else check('core.language.vary', null, vary.join('; ') || null, vary.ev ?? vary.last);
}

// ── core ──────────────────────────────────────────────────────────────────────
const RESERVED = ['filter', 'sort', 'fields', 'include', 'count', 'limit', 'cursor', 'since', 'languages'];
const SAMPLE = { filter: ['filter[restep_check]', '1'], sort: ['sort', 'id'], fields: ['fields', 'id'], include: ['include', 'restep_check'],
  count: ['count', 'true'], limit: ['limit', '1'], cursor: ['cursor', 'restep-check'], since: ['since', 'restep-check'], languages: ['languages', 'en'] };

// Which reserved parameters a collection, or one of its items, implements on GET.
function implemented(c, onItem) {
  const out = [];
  if (announced.includes('query')) {
    out.push('fields');
    if (!onItem) {
      out.push('limit', 'cursor');
      if (isObject(c.filter) && Object.keys(c.filter).length) out.push('filter');
      if (Array.isArray(c.sort) && c.sort.length) out.push('sort');
      if (c.count) out.push('count');
    }
  }
  if (announced.includes('relations') && isObject(c.relations) && Object.values(c.relations).some((r) => r?.include)) out.push('include');
  return out;
}

async function checkCollection(name, c, ctx) {
  const url = resolvePath(c.path);
  const full = await traverse(url);
  const first = full.pages[0];
  if (!first || first.status !== 200 || !isCollection(first.data)) {
    bad('core.collection.shape', name, first?.status === 200 ? 'the body is not {items, next}' : `got ${first?.status}`, first);
    return null;
  }
  const shapeErr = full.pages.find((p) => !isCollection(p.data) || !(p.data.next === null || typeof p.data.next === 'string'));
  check('core.collection.shape', name, shapeErr ? 'a page is not {items, next} with next a string or null' : null, shapeErr);
  const list = ids(full.items);
  const repeated = dupes(list);
  if (full.loop) bad('core.collection.traversal', name, `next loops back to ${short(full.loop)}`, full.pages.at(-1));
  else if (full.error) bad('core.collection.traversal', name, 'a page in the traversal failed', full.error);
  else if (repeated.length) bad('core.collection.traversal', name, `repeated ids: ${repeated.slice(0, 5).join(', ')}`, first);
  else if (!full.complete) skip('core.collection.traversal', name, `stopped at --max-items ${opts.maxItems} with no repeats`);
  else pass('core.collection.traversal', name, `${list.length} items in ${full.pages.length} page(s)`);

  const again = await traverse(url);
  const same = ids(again.items).slice(0, list.length).join('\u0000') === list.slice(0, again.items.length).join('\u0000');
  check('core.collection.deterministic', name, same ? null : 'two traversals returned different orders', again.pages[0]);

  const badIds = list.filter((id) => typeof id !== 'string' || !UNRESERVED.test(id));
  if (!list.length) skip('core.item.id', name, 'the collection is empty');
  else check('core.item.id', name, badIds.length ? `ids that are not unreserved strings: ${badIds.slice(0, 5).map((x) => JSON.stringify(x)).join(', ')}` : null, first);

  const types = Object.fromEntries(Object.entries(isObject(c.filter) ? c.filter : {}).map(([f, d]) => [f, d?.type]));
  const typed = (type) => Object.entries(types).filter(([, t]) => t === type).map(([f]) => f);
  const typeErrors = (fields, test, label) => full.items.flatMap((it) => fields.filter((f) => !blank(get(it, f)) && !test(get(it, f)))
    .map((f) => `${it.id}.${f} = ${JSON.stringify(get(it, f))} ${label}`));
  if (typed('decimal').length) {
    const e = typeErrors(typed('decimal'), (v) => typeof v === 'string' && DECIMAL.test(v), 'is not a decimal string');
    check('core.item.decimal', name, e.slice(0, 3).join('; ') || null, first);
  } else skip('core.item.decimal', name, 'no field declared as decimal');
  if (typed('datetime').length || typed('date').length) {
    const e = [...typeErrors(typed('datetime'), (v) => DATETIME.test(v), 'is not an RFC 3339 date-time with an offset'),
      ...typeErrors(typed('date'), (v) => DATE.test(v), 'is not a full-date')];
    check('core.item.dates', name, e.slice(0, 3).join('; ') || null, first);
  } else skip('core.item.dates', name, 'no field declared as date or datetime');

  // 3: each declared language map is an object of strings keyed by well-formed lowercase tags. Absent is
  // allowed, because permissions may leave a field out; null is not.
  const maps = languageMaps(c);
  if (maps.length && !full.items.length) skip('core.language.maps', name, 'the collection is empty');
  else if (maps.length) {
    const e = full.items.flatMap((it) => maps.filter((f) => it?.[f] !== undefined).flatMap((f) => {
      const v = it[f];
      if (!isObject(v)) return [`${it.id}.${f} is ${JSON.stringify(v)}, not an object`];
      return Object.entries(v).flatMap(([k, x]) => [
        ...(!TAG.test(k) ? [`${it.id}.${f} has the key ${JSON.stringify(k)}, not a well-formed lowercase tag`] : []),
        ...(typeof x !== 'string' ? [`${it.id}.${f}.${k} is ${JSON.stringify(x)}, not a string`] : []),
      ]);
    }));
    check('core.language.maps', name, e.slice(0, 3).join('; ') || null, first, `${maps.join(', ')} in ${full.items.length} items`);
  }

  // 5.7: inherited values as read.
  if (inherited(c).length) {
    if (!full.items.length) skip('core.inherit.read', name, 'the collection is empty');
    else {
      const e = full.items.flatMap((it) => inheritReadProblems(c, it));
      // href points at the item that holds the value: its own field is set and equal to it.
      const via = full.items.flatMap((it) => inherited(c).filter(([f]) => isObject(it?._inherited?.[f]?.from)).map(([f, d]) => [it, f, d])).slice(0, 3);
      for (const [it, f, d] of via) {
        const href = it._inherited[f].from.href;
        if (typeof href !== 'string' || !/^(\/|https?:)/.test(href)) { e.push(`${it.id}._inherited.${f}.from.href is not an absolute link`); continue; }
        const src = await http('GET', new URL(href, url).href);
        const rule = Object.values(isObject(ctx.doc?.collections) ? ctx.doc.collections : {}).find((cc) => isObject(cc?.inherit?.[f]) && src.data && cc.inherit[f].own in src.data)?.inherit?.[f] ?? d;
        if (src.status !== 200) e.push(`${href}, the source of ${it.id}.${f}, gives ${src.status}`);
        else if (blank(src.data?.[rule.own]) || !sameValue(src.data[rule.own], it[f])) e.push(`${href}, the source of ${it.id}.${f}, does not hold ${JSON.stringify(it[f])} as its own value`);
      }
      check('core.inherit.read', name, e.slice(0, 3).join('; ') || null, first, `${inherited(c).map(([f]) => f).join(', ')} in ${full.items.length} items`);
    }
  }

  const sample = full.items[0];
  const itemUrl = sample ? `${url.replace(/\/$/, '')}/${encodeURIComponent(sample.id)}` : null;
  let itemRes = null;
  if (sample) {
    itemRes = await http('GET', itemUrl);
    check('core.item.get', name, itemRes.status !== 200 ? `got ${itemRes.status}`
      : !isObject(itemRes.data) || itemRes.data.id !== sample.id ? 'the body is not the item with that id' : null, itemRes);
  } else skip('core.item.get', name, 'the collection is empty');

  // 3: data never depends on Accept-Language. identity, so the ETag does not change with the encoding.
  if (itemRes?.status === 200) {
    const probe = (al) => http('GET', itemUrl, { headers: { 'accept-encoding': 'identity', ...(al && { 'accept-language': al }) } });
    const base = await probe(null);
    const problems = [];
    let last = base;
    for (const al of ['es', 'fr', 'ja', 'es-MX', 'en;q=0.1, de']) {
      last = await probe(al);
      if (last.status !== base.status || JSON.stringify(last.data) !== JSON.stringify(base.data)) { problems.push(`Accept-Language: ${al} changed the body`); problems.ev ??= last; }
      else if (announced.includes('writes') && last.headers.get('etag') !== base.headers.get('etag')) {
        problems.push(`Accept-Language: ${al} changed the ETag from ${base.headers.get('etag')} to ${last.headers.get('etag')}`); problems.ev ??= last;
      }
    }
    check('core.language.data', name, problems.slice(0, 3).join('; ') || null, problems.ev ?? last);
  }

  const missingUrl = `${url.replace(/\/$/, '')}/restep-check-${rand()}`;
  const missing = await http('GET', missingUrl);
  check('core.not-found', name, problemMismatch(missing, 404, 'not_found'), missing);
  // 5.4: 404 and 405 come before 400. PATCH {} on a collection has no effect either way.
  const both = await http('GET', withQuery(missingUrl, [['filter[restep_check]', '1']]));
  // Where discovery declares PATCH on the collection, only the 404 half applies.
  const patchDeclared = Array.isArray(c.methods) && c.methods.includes('PATCH');
  const wrongBoth = patchDeclared ? null : await http('PATCH', withQuery(url, [['filter[restep_check]', '1']]), { json: '{}', headers: { 'content-type': 'application/merge-patch+json' } });
  const orderWhy = problemMismatch(both, 404, 'not_found') ?? (wrongBoth && wrongBoth.status !== 405 ? `PATCH on a collection with a reserved parameter got ${wrongBoth.status}${wrongBoth.data?.code ? ` ${wrongBoth.data.code}` : ''}, expected 405` : null);
  check('core.error-order', name, orderWhy, problemMismatch(both, 404, 'not_found') || !wrongBoth ? both : wrongBoth);

  // 5.3: every unimplemented reserved parameter fails loudly.
  for (const [target, u, onItem] of [[name, url, false], [`${name}/{id}`, itemUrl, true]]) {
    if (!u) continue;
    const id = onItem ? 'core.reserved.item' : 'core.reserved.get';
    const supported = implemented(c, onItem);
    const problems = [];
    let last;
    for (const p of RESERVED.filter((r) => !supported.includes(r))) {
      const [k, v] = SAMPLE[p];
      last = await http('GET', withQuery(u, [[k, v]]));
      const why = problemMismatch(last, 400, 'unsupported_parameter', k);
      if (why) { problems.push(`${k}: ${why}`); problems.ev ??= last; }
    }
    check(id, target, problems.join('; ') || null, problems.ev ?? last, `${RESERVED.length - supported.length} parameters`);
    const dollar = await http('GET', withQuery(u, [['$restep_check', '1']]));
    check('core.reserved.dollar', target, problemMismatch(dollar, 400, 'unsupported_parameter', '$restep_check'), dollar);
  }
  const forms = [];
  if (implemented(c, false).includes('sort')) forms.push(['sort[id]', 'asc']);
  if (implemented(c, false).includes('filter') && !announced.includes('filter-expr')) forms.push(['filter', 'id = "1"']);
  if (forms.length) {
    const problems = [];
    let last;
    for (const [k, v] of forms) {
      last = await http('GET', withQuery(url, [[k, v]]));
      const why = problemMismatch(last, 400, 'unsupported_parameter', k);
      if (why) { problems.push(`${k}: ${why}`); problems.ev ??= last; }
    }
    check('core.reserved.forms', name, problems.join('; ') || null, problems.ev ?? last);
  }

  // PATCH {} on a collection: 5.1 defines no PATCH there, so it changes nothing. Not sent where discovery declares it.
  if (Array.isArray(c.methods) && c.methods.includes('PATCH')) skip('core.method-not-allowed', name, 'methods declares PATCH on the collection');
  else {
    const wrong = await http('PATCH', url, { json: '{}', headers: { 'content-type': 'application/merge-patch+json' } });
    check('core.method-not-allowed', name, wrong.status !== 405 ? `PATCH on a collection got ${wrong.status}`
      : !wrong.headers.has('allow') ? '405 without Allow' : null, wrong);
    if (Array.isArray(c.methods)) check('core.methods.allow', name, allowProblem(wrong, c.methods), wrong);
  }

  // HEAD wherever GET works: same status and the headers that describe the representation.
  const heads = [[url, first], [itemUrl, itemRes], [missingUrl, missing]].filter(([u, r]) => u && r);
  const headProblems = [];
  let lastHead;
  for (const [u, g] of heads) {
    lastHead = await http('HEAD', u);
    if (lastHead.status !== g.status) { headProblems.push(`${short(u)}: HEAD ${lastHead.status}, GET ${g.status}`); headProblems.ev ??= lastHead; }
    for (const h of ['content-type', 'etag', 'cache-control'])
      if (g.headers.has(h) && !lastHead.headers.has(h)) { headProblems.push(`${short(u)}: HEAD without ${h}`); headProblems.ev ??= lastHead; }
  }
  check('core.head', name, headProblems.join('; ') || null, headProblems.ev ?? lastHead);

  return { name, c, url, full, first, sample, itemUrl, itemRes, types };
}

// ── query ─────────────────────────────────────────────────────────────────────
// 6.1: why a declared filter or sort path may not be there, following relations to other collections.
function languagePathProblem(colls, c, path) {
  const segs = path.split('.');
  let col = c;
  for (let i = 0; i < segs.length; i++) {
    if (languageMaps(col).includes(segs[i])) {
      if (i === 0 && segs.length === 2) return TAG.test(segs[1]) ? null : `is field.tag with a tag that is not a well-formed lowercase tag`;
      return i === segs.length - 1 ? 'ends in a language map' : 'goes through a language map';
    }
    const to = isObject(col?.relations) ? col.relations[segs[i]]?.to : undefined;
    col = typeof to === 'string' ? colls[to] : undefined;
    if (!col) return null;
  }
  return null;
}
async function checkQuery(s, ctx) {
  const { name, c, url, full, types } = s;
  const all = full.items;
  const complete = full.complete;
  const filters = isObject(c.filter) ? c.filter : {};
  const sorts = Array.isArray(c.sort) ? c.sort : [];
  const maxLimit = Number.isInteger(c.max_limit) ? c.max_limit : null;

  // Filters: compare against the expected result computed locally.
  const matchProblems = [], absentProblems = [];
  let matchRuns = 0, absentSeen = false, lastMatch;
  for (const [field, decl] of Object.entries(filters)) {
    const type = decl?.type;
    const ops = Array.isArray(decl?.ops) ? decl.ops : [];
    const values = all.map((it) => get(it, field)).filter((v) => !blank(v) && norm(type, v) !== undefined);
    if (all.some((it) => blank(get(it, field)))) absentSeen = true;
    const sorted = [...new Set(values.map(toRaw))].sort((a, b) => cmp(type, norm(type, a), norm(type, b)));
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const op of ops) {
      let raws;
      if (op === 'null') raws = ['true', 'false'];
      else if (op === 'in') raws = sorted.length ? [[sorted[0], sorted.at(-1)].filter((v) => !v.includes(',')).join(',')] : [];
      else raws = median === undefined ? [] : [median];
      for (const raw of raws.filter(Boolean)) {
        if (!complete) continue;
        const key = op === 'eq' ? `filter[${field}][eq]` : `filter[${field}][${op}]`;
        const got = await traverse(withQuery(url, [[key, raw]]));
        lastMatch = got.pages.at(-1);
        matchRuns++;
        if (got.error) { matchProblems.push(`${key}=${raw}: got ${got.error.status}${got.error.data?.code ? ` ${got.error.data.code}` : ''}`); continue; }
        const want = all.filter((it) => matches(type, op, get(it, field), raw)).map((it) => it.id);
        const diff = setDiff(ids(got.items), want);
        if (diff) matchProblems.push(`${key}=${raw}: ${diff}`);
        if (op !== 'null') {
          const leaked = got.items.filter((it) => blank(get(it, field))).map((it) => it.id);
          if (leaked.length) absentProblems.push(`${key}=${raw} returned ${leaked.join(', ')} with ${field} absent or null`);
        }
      }
    }
  }
  if (!Object.keys(filters).length) skip('query.filter.match', name, 'no filters declared');
  else if (!complete) skip('query.filter.match', name, 'the collection is larger than --max-items: no expected result to compare with');
  else if (!matchRuns) skip('query.filter.match', name, 'no values in the data to filter by');
  else check('query.filter.match', name, matchProblems.slice(0, 5).join('; ') || null, lastMatch, `${matchRuns} filters`);
  if (matchRuns && absentSeen) check('query.filter.absent', name, absentProblems.join('; ') || null, lastMatch);
  else if (Object.keys(filters).length) skip('query.filter.absent', name, 'no item has a filtered field absent or null');

  const firstValue = (field) => all.map((it) => get(it, field)).find((v) => !blank(v) && norm(filters[field].type, v) !== undefined);
  const eqField = Object.keys(filters).find((f) => filters[f].ops?.includes('eq') && firstValue(f) !== undefined);
  if (eqField) {
    const raw = toRaw(firstValue(eqField));
    const a = await traverse(withQuery(url, [[`filter[${eqField}]`, raw]]));
    const b = await traverse(withQuery(url, [[`filter[${eqField}][eq]`, raw]]));
    check('query.filter.eq-shorthand', name, a.error || b.error ? `got ${(a.error ?? b.error).status}`
      : setDiff(ids(a.items), ids(b.items)), a.error ?? b.error ?? a.pages[0]);
  } else if (Object.keys(filters).length) skip('query.filter.eq-shorthand', name, 'no filter with eq and a value to try');

  // AND: two filters on different fields.
  const pair = Object.keys(filters).filter((f) => filters[f].ops?.includes('eq') || filters[f].ops?.includes('null')).slice(0, 2);
  if (pair.length === 2 && complete) {
    const params = pair.map((f) => (filters[f].ops.includes('null') ? [`filter[${f}][null]`, 'false'] : [`filter[${f}]`, toRaw(firstValue(f))]));
    if (params.every(([, v]) => v !== 'undefined')) {
      const got = await traverse(withQuery(url, params));
      const want = all.filter((it) => params.every(([k, v], i) => matches(filters[pair[i]].type, k.endsWith('[null]') ? 'null' : 'eq', get(it, pair[i]), v))).map((it) => it.id);
      check('query.filter.and', name, got.error ? `got ${got.error.status}` : setDiff(ids(got.items), want), got.error ?? got.pages[0]);
    }
  } else if (Object.keys(filters).length) skip('query.filter.and', name, pair.length < 2 ? 'fewer than two filters with eq or null' : 'the collection is larger than --max-items');

  // Two operators on the same field are two filters (6.1): a range.
  const ranged = Object.keys(filters).find((f) => ['ge', 'gt'].some((o) => filters[f].ops?.includes(o)) && ['le', 'lt'].some((o) => filters[f].ops?.includes(o)));
  if (ranged && complete) {
    const type = filters[ranged].type;
    const vals = [...new Set(all.map((it) => get(it, ranged)).filter((v) => !blank(v) && norm(type, v) !== undefined).map(toRaw))]
      .sort((a, b) => cmp(type, norm(type, a), norm(type, b)));
    if (vals.length) {
      const lo = filters[ranged].ops.includes('ge') ? 'ge' : 'gt', hi = filters[ranged].ops.includes('le') ? 'le' : 'lt';
      const low = vals[Math.floor(vals.length / 4)], high = vals[Math.floor((3 * vals.length) / 4)];
      const params = [[`filter[${ranged}][${lo}]`, low], [`filter[${ranged}][${hi}]`, high]];
      const got = await traverse(withQuery(url, params));
      const want = all.filter((it) => matches(type, lo, get(it, ranged), low) && matches(type, hi, get(it, ranged), high)).map((it) => it.id);
      check('query.filter.same-field', name, got.error ? `got ${got.error.status}${got.error.data?.code ? ` ${got.error.data.code}` : ''}` : setDiff(ids(got.items), want),
        got.error ?? got.pages[0], `${ranged} between ${low} and ${high}`);
    }
  } else if (Object.keys(filters).length) skip('query.filter.same-field', name, ranged ? 'the collection is larger than --max-items' : 'no field with both a lower and an upper bound operator');

  if (Object.keys(filters).length) {
    const problems = [];
    let last;
    const tryUnsupported = async (k, v) => {
      last = await http('GET', withQuery(url, [[k, v]]));
      const why = problemMismatch(last, 400, 'unsupported_parameter', k);
      if (why) { problems.push(`${k}: ${why}`); problems.ev ??= last; }
    };
    await tryUnsupported('filter[restep_check_undeclared]', '1');
    const [f0, d0] = Object.entries(filters)[0];
    await tryUnsupported(`filter[${f0}][like]`, '1');
    const missingOp = OPS.find((op) => !(d0.ops ?? []).includes(op) && op !== 'null');
    if (missingOp) await tryUnsupported(`filter[${f0}][${missingOp}]`, toRaw(firstValue(f0) ?? '1'));
    check('query.filter.undeclared', name, problems.join('; ') || null, problems.ev ?? last);

    const invalid = [];
    const tryInvalid = async (k, v, extra = []) => {
      last = await http('GET', withQuery(url, [[k, v], ...extra]));
      const why = problemMismatch(last, 400, 'invalid_parameter');
      if (why) { invalid.push(`${k}=${v}${extra.length ? ' twice' : ''}: ${why}`); invalid.ev ??= last; }
    };
    const WRONG = { integer: '1.5', number: 'abc', decimal: '1e3', boolean: 'maybe', date: '2026-13-45', datetime: '2026-11-19', duration: 'ninety' };
    const typedField = Object.entries(filters).find(([, d]) => WRONG[d?.type] && d.ops?.some((op) => op !== 'in' && op !== 'null'));
    if (typedField) {
      const [f, d] = typedField;
      const op = d.ops.find((o) => o !== 'in' && o !== 'null');
      await tryInvalid(`filter[${f}][${op}]`, WRONG[d.type]);
    }
    const inField = Object.entries(filters).find(([, d]) => d?.ops?.includes('in'));
    if (inField) await tryInvalid(`filter[${inField[0]}][in]`, '');
    const op0 = (d0.ops ?? [])[0];
    if (op0) {
      const v0 = op0 === 'null' ? 'true' : toRaw(firstValue(f0) ?? '1');
      await tryInvalid(`filter[${f0}][${op0}]`, v0, [[`filter[${f0}][${op0}]`, v0]]);
    }
    const nullField = Object.entries(filters).find(([, d]) => d?.ops?.includes('null'));
    if (nullField) await tryInvalid(`filter[${nullField[0]}][null]`, 'maybe');
    const eqField = Object.keys(filters).find((f) => filters[f].ops?.includes('eq') && firstValue(f) !== undefined);
    if (eqField) { // filter[f] and filter[f][eq] are the same filter (6.1)
      const v = toRaw(firstValue(eqField));
      await tryInvalid(`filter[${eqField}]`, v, [[`filter[${eqField}][eq]`, v]]);
    }
    check('query.filter.bad-value', name, invalid.join('; ') || null, invalid.ev ?? last);
  }
  const durField = Object.entries(filters).find(([, d]) => d?.type === 'duration' && d.ops?.some((op) => op !== 'null'));
  if (durField) {
    const op = durField[1].ops.find((o) => o !== 'null');
    const res = await http('GET', withQuery(url, [[`filter[${durField[0]}][${op}]`, op === 'in' ? 'P1Y,PT1S' : 'P1Y']]));
    check('query.filter.duration-years', name, problemMismatch(res, 400, 'invalid_parameter'), res);
  }

  // Sorting.
  if (sorts.length) {
    const problems = [];
    let last;
    for (const key of sorts) {
      const type = types[key] ?? (all.every((it) => blank(get(it, key)) || typeof get(it, key) === 'number') ? 'number' : 'string');
      for (const desc of [false, true]) {
        const got = await traverse(withQuery(url, [['sort', `${desc ? '-' : ''}${key}`]]));
        last = got.pages.at(-1);
        if (got.error) { problems.push(`sort=${desc ? '-' : ''}${key}: got ${got.error.status}`); problems.ev ??= last; continue; }
        const vals = got.items.map((it) => get(it, key));
        for (let i = 1; i < vals.length; i++) {
          const a = vals[i - 1], b = vals[i];
          if (blank(a) && !blank(b)) { problems.push(`sort=${desc ? '-' : ''}${key}: a missing value comes before ${JSON.stringify(b)}`); problems.ev ??= last; break; }
          if (blank(a) || blank(b)) continue;
          const d = cmp(type, norm(type, a) ?? a, norm(type, b) ?? b);
          if (desc ? d < 0 : d > 0) { problems.push(`sort=${desc ? '-' : ''}${key}: ${JSON.stringify(a)} before ${JSON.stringify(b)}`); problems.ev ??= last; break; }
        }
      }
    }
    check('query.sort.order', name, problems.slice(0, 5).join('; ') || null, problems.ev ?? last, `${sorts.length} keys, both ways`);

    const ties = (key) => { const v = all.map((it) => JSON.stringify(get(it, key))); return v.length - new Set(v).size; };
    const key = [...sorts].sort((a, b) => ties(b) - ties(a))[0];
    // One item per page, twice: ties broken at random show up as repeats, gaps or another order.
    const pageUrl = withQuery(url, [['sort', key], ['limit', '1']]);
    const got = await traverse(pageUrl, Math.max(opts.maxItems, all.length + 1));
    const twice = got.error ? null : await traverse(pageUrl, Math.max(opts.maxItems, all.length + 1));
    const rep = dupes(ids(got.items));
    check('query.sort.stable', name, got.error ? `got ${got.error.status}` : rep.length ? `repeated across pages: ${rep.join(', ')}`
      : complete && got.complete && setDiff(ids(got.items), ids(all)) ? setDiff(ids(got.items), ids(all))
        : ids(twice.items).join() !== ids(got.items).join() ? 'two traversals with the same sort returned different orders' : null,
    got.error ?? got.pages.at(-1), `sort=${key}, limit=1`);
    const undeclared = await http('GET', withQuery(url, [['sort', 'restep_check_undeclared']]));
    check('query.sort.undeclared', name, problemMismatch(undeclared, 400, 'unsupported_parameter', 'sort'), undeclared);
  }

  // 6.1: translations are filtered and sorted only as field.tag of the collection's own maps.
  const maps = languageMaps(c);
  const colls = isObject(ctx.doc?.collections) ? ctx.doc.collections : {};
  const declaredKeys = [...Object.keys(filters).map((f) => ['filter', f]), ...sorts.map((f) => ['sort', String(f)])];
  const pathProblems = declaredKeys.flatMap(([where, path]) => {
    const why = languagePathProblem(colls, c, path);
    return why ? [`${where} ${path} ${why}`] : [];
  });
  if (maps.length || pathProblems.length) check('query.language.declared', name, pathProblems.join('; ') || null, s.first);
  const translations = [...new Set(declaredKeys.map(([, p]) => p))].filter((p) => {
    const [m, tag, ...more] = p.split('.');
    return maps.includes(m) && tag !== undefined && !more.length && TAG.test(tag);
  });
  if (translations.length && !complete) skip('query.language.exact', name, 'the collection is larger than --max-items');
  else if (translations.length) {
    const problems = [];
    let last, runs = 0;
    for (const path of translations) {
      const [m, tag] = path.split('.');
      // An item without that key but with another translation, which a fallback would read.
      const lacking = all.filter((it) => blank(get(it, path)) && isObject(it[m]) && Object.keys(it[m]).length);
      if (!lacking.length) continue;
      const ops = Array.isArray(filters[path]?.ops) ? filters[path].ops : [];
      const op = ['eq', 'in'].find((o) => ops.includes(o));
      if (op) {
        const it = lacking[0];
        const near = Object.keys(it[m]).sort((a, b) => (tag.startsWith(`${b}-`) ? 1 : 0) - (tag.startsWith(`${a}-`) ? 1 : 0))[0]; // es before others for es-mx
        const v = it[m][near];
        if (typeof v === 'string' && !(op === 'in' && v.includes(','))) {
          const got = await traverse(withQuery(url, [[`filter[${path}][${op}]`, v]]));
          last = got.pages.at(-1);
          runs++;
          const want = all.filter((x) => get(x, path) === v).map((x) => x.id);
          if (got.error) { problems.push(`filter[${path}][${op}]=${v}: got ${got.error.status}`); problems.ev ??= last; }
          else if (setDiff(ids(got.items), want)) { problems.push(`filter[${path}][${op}]=${v}: ${setDiff(ids(got.items), want)} (${it.id} has ${m}.${near}, not ${path})`); problems.ev ??= last; }
        }
      }
      if (sorts.includes(path)) {
        for (const desc of [false, true]) {
          const key = `${desc ? '-' : ''}${path}`;
          const got = await traverse(withQuery(url, [['sort', key]]));
          last = got.pages.at(-1);
          runs++;
          if (got.error) { problems.push(`sort=${key}: got ${got.error.status}`); problems.ev ??= last; continue; }
          const firstBlank = got.items.findIndex((it) => blank(get(it, path)));
          const after = firstBlank < 0 ? [] : got.items.slice(firstBlank).filter((it) => !blank(get(it, path)));
          if (after.length) { problems.push(`sort=${key}: ${got.items[firstBlank].id}, without ${path}, comes before ${after[0].id}`); problems.ev ??= last; }
        }
      }
    }
    if (!runs) skip('query.language.exact', name, `every item with a translation has ${translations.join(', ')}`);
    else check('query.language.exact', name, problems.slice(0, 3).join('; ') || null, problems.ev ?? last, `${translations.join(', ')}`);
  }

  // fields.
  const sampleKeys = all.length ? Object.keys(all[0]).filter((k) => k !== 'id' && !k.startsWith('_')).slice(0, 2) : [];
  if (sampleKeys.length) {
    const allowed = new Set(['id', ...sampleKeys]);
    const extra = (obj) => Object.keys(obj ?? {}).filter((k) => !allowed.has(k) && !k.startsWith('_'));
    const coll = await http('GET', withQuery(url, [['fields', sampleKeys.join(',')]]));
    const problems = [];
    if (coll.status !== 200 || !isCollection(coll.data)) problems.push(`collection: got ${coll.status}`);
    else { const e = coll.data.items.flatMap(extra); if (e.length) problems.push(`collection items carry ${[...new Set(e)].join(', ')}`); }
    const item = await http('GET', withQuery(s.itemUrl, [['fields', sampleKeys.join(',')]]));
    if (item.status !== 200) problems.push(`item: got ${item.status}`);
    else if (extra(item.data).length) problems.push(`the item carries ${extra(item.data).join(', ')}`);
    check('query.fields', name, problems.join('; ') || null, item, `fields=${sampleKeys.join(',')}`);
  } else skip('query.fields', name, 'no item with fields to choose');
  const unknownField = await http('GET', withQuery(url, [['fields', 'restep_check_nonexistent']]));
  // A language map is one field (6.3): a path into it is not.
  const intoMap = maps.length ? await http('GET', withQuery(url, [['fields', `${maps[0]}.en`]])) : null;
  check('query.fields.unknown', name, problemMismatch(unknownField, 400, 'invalid_parameter', 'fields')
    ?? (intoMap && problemMismatch(intoMap, 400, 'invalid_parameter', 'fields') && `fields=${maps[0]}.en: ${problemMismatch(intoMap, 400, 'invalid_parameter', 'fields')}`),
  problemMismatch(unknownField, 400, 'invalid_parameter', 'fields') || !intoMap ? unknownField : intoMap);

  // limit and cursors.
  const one = await http('GET', withQuery(url, [['limit', '1']]));
  if (maxLimit === null) bad('query.limit', name, 'max_limit is not declared', s.first);
  else {
    const top = await http('GET', withQuery(url, [['limit', String(maxLimit)]]));
    check('query.limit', name, one.status !== 200 || !isCollection(one.data) ? `limit=1: got ${one.status}`
      : one.data.items.length > 1 ? `limit=1 returned ${one.data.items.length} items`
        : top.status !== 200 ? `limit=${maxLimit} (max_limit): got ${top.status}` : null, top);
    const problems = [];
    let last;
    for (const v of ['0', String(maxLimit + 1), 'abc']) {
      last = await http('GET', withQuery(url, [['limit', v]]));
      const why = problemMismatch(last, 400, 'invalid_parameter', 'limit');
      if (why) { problems.push(`limit=${v}: ${why}`); problems.ev ??= last; }
    }
    check('query.limit.range', name, problems.join('; ') || null, problems.ev ?? last);
  }
  const nextRaw = one.data?.next;
  if (typeof nextRaw === 'string') {
    const nextUrl = new URL(nextRaw, one.url);
    const cursor = nextUrl.searchParams.get('cursor');
    check('query.cursor.keeps-params', name, !cursor ? 'next has no cursor parameter'
      : nextUrl.searchParams.get('limit') !== '1' ? 'next lost limit=1' : null, one);
    if (cursor) {
      // Several tamperings: a signature usually sits at the end, the payload at the start or middle.
      const flip = (i) => cursor.slice(0, i) + (cursor[i] === 'A' ? 'B' : 'A') + cursor.slice(i + 1);
      const tamperings = [...new Set([flip(0), flip(Math.floor(cursor.length / 2)), flip(cursor.length - 1), cursor.slice(0, -1)])];
      const problems = [];
      let tampered;
      for (const t of tamperings) {
        const u = new URL(nextUrl);
        u.searchParams.set('cursor', t);
        tampered = await http('GET', u.href);
        const why = problemMismatch(tampered, 400, 'invalid_parameter', 'cursor');
        if (why) { problems.push(`cursor=${t}: ${why}`); break; }
      }
      check('query.cursor.tampered', name, problems.join('; ') || null, tampered, `${tamperings.length} tamperings`);
      const reused = [];
      let last;
      const reuse = async (label, base, extra) => {
        last = await http('GET', withQuery(base, [...extra, ['limit', '1'], ['cursor', cursor]]));
        const why = problemMismatch(last, 400, 'invalid_parameter', 'cursor');
        if (why) { reused.push(`${label}: ${why}`); reused.ev ??= last; }
      };
      const otherSort = sorts.find((k) => k !== 'id') ?? (sorts.includes('id') ? '-id' : null);
      if (otherSort) await reuse(`with sort=${otherSort}`, url, [['sort', otherSort]]);
      const nf = Object.keys(filters).find((f) => filters[f].ops?.includes('null'));
      if (nf) await reuse(`with filter[${nf}][null]`, url, [[`filter[${nf}][null]`, 'false']]);
      const other = ctx.collections.find((o) => o.name !== name);
      if (other) await reuse(`on ${other.name}`, other.url, []);
      if (last) check('query.cursor.other-query', name, reused.join('; ') || null, reused.ev ?? last);
      else skip('query.cursor.other-query', name, 'no other sort, filter or collection to try');

      // What each page carries is not part of the cursor (6.4): limit and fields may change.
      const keep = new URL(nextUrl);
      keep.searchParams.set('limit', String(Math.min(2, maxLimit ?? 2)));
      const field = Object.keys(all[0] ?? {}).find((k) => k !== 'id' && !k.startsWith('_'));
      if (field) keep.searchParams.set('fields', field);
      const page = await http('GET', keep.href);
      check('query.cursor.page-params', name, page.status !== 200 ? `next with another limit${field ? ' and fields' : ''} got ${page.status}${page.data?.code ? ` ${page.data.code}` : ''}` : null, page);
    }
  } else {
    for (const id of ['query.cursor.keeps-params', 'query.cursor.tampered', 'query.cursor.other-query', 'query.cursor.page-params'])
      skip(id, name, 'fewer than two items: limit=1 gives no next page');
  }

  // count.
  if (c.count) {
    const res = await http('GET', withQuery(url, [['count', 'true']]));
    const d = res.data ?? {};
    check('query.count', name, res.status !== 200 ? `got ${res.status}`
      : !Number.isInteger(d.total) ? 'no integer total'
        : c.count === 'estimated' && d.total_estimated !== true && d.total !== all.length ? 'estimated count without total_estimated: true'
          : c.count === 'exact' && complete && d.total !== all.length ? `total ${d.total}, the traversal found ${all.length}` : null, res);
    const off = await http('GET', withQuery(url, [['count', 'false']]));
    check('query.count.false', name, off.status !== 200 ? `got ${off.status}` : 'total' in (off.data ?? {}) ? 'count=false still adds total'
      : ids(off.data.items).join() !== ids(s.first.data.items).join() ? 'a different first page than without count' : null, off);
  } else {
    const res = await http('GET', withQuery(url, [['count', 'true']]));
    check('query.count.undeclared', name, problemMismatch(res, 400, 'unsupported_parameter', 'count'), res);
  }
}

// ── writes: the checks that only read ────────────────────────────────────────
async function checkWritesRead(s) {
  const { name, itemUrl } = s;
  if (!itemUrl) { skip('writes.etag.strong', name, 'the collection is empty'); return; }
  const res = await http('GET', itemUrl, { headers: { 'accept-encoding': 'identity' } });
  const tag = res.headers.get('etag');
  check('writes.etag.strong', name, !tag ? 'no ETag' : tag.startsWith('W/') ? `weak ETag ${tag}` : null, res);
  if (!tag) return;
  const problems = [];
  let last;
  for (const [method, value] of [['GET', tag], ['GET', `W/${tag.replace(/^W\//, '')}`], ['HEAD', tag]]) {
    last = await http(method, itemUrl, { headers: { 'if-none-match': value } });
    if (last.status !== 304) { problems.push(`${method} with If-None-Match: ${value} got ${last.status}`); problems.ev ??= last; }
  }
  check('writes.if-none-match.get', name, problems.join('; ') || null, problems.ev ?? last);
  if (announced.includes('query')) {
    const field = Object.keys(res.data ?? {}).find((k) => k !== 'id' && !k.startsWith('_'));
    if (field) {
      const part = await http('GET', withQuery(itemUrl, [['fields', field]]), { headers: { 'accept-encoding': 'identity' } });
      check('writes.etag.fields', name, part.status !== 200 ? `got ${part.status}` : part.data?._etag !== tag
        ? `_etag is ${JSON.stringify(part.data?._etag)}, the item’s ETag is ${tag}` : null, part);
    }
  }
}

// ── Writes (--writes) ─────────────────────────────────────────────────────────
const created = []; // URLs of items this run created, deleted at the end
const MERGE = { 'content-type': 'application/merge-patch+json' };

function fixtureFor(s) {
  const f = opts.fixtures[s.name];
  if (f !== undefined) {
    const text = f.startsWith('@') ? readFile(f.slice(1)) : f;
    try { return JSON.parse(text); } catch { die(`--fixture ${s.name}: not valid JSON`); }
  }
  if (!s.sample) return null;
  return Object.fromEntries(Object.entries(s.sample).filter(([k]) => k !== 'id' && !k.startsWith('_')));
}
let readFile;

// An item this checker created, if it is on the API's origin: only then is it written to, and deleted at the end.
function ownItem(where, name) {
  if (!where) return null;
  if (!where.startsWith(root.href)) { console.error(`  ${name}: ${where} is outside the API root; it will not be touched`); return null; }
  if (!created.includes(where)) created.push(where);
  return where;
}
async function create(s, body, headers = {}) {
  const res = await http('POST', s.url, { json: body, headers });
  if (res.status === 201) {
    const loc = res.headers.get('location');
    const where = loc ? new URL(loc, res.url).href : res.data?.id ? `${s.url.replace(/\/$/, '')}/${encodeURIComponent(res.data.id)}` : null;
    res.where = ownItem(where, s.name);
  }
  return res;
}
const etagOf = async (url) => (await http('GET', url, { headers: { 'accept-encoding': 'identity' } })).headers.get('etag');

// Values that change a field without leaving its type, to find something writable.
function variants(v) {
  if (typeof v === 'string') return DECIMAL.test(v) ? [v.includes('.') ? `${v}1` : `${v}.5`] : [`${v} ·`, `${v}x`];
  if (Number.isInteger(v)) return [v + 1];
  if (typeof v === 'number') return [v / 2];
  if (typeof v === 'boolean') return [!v];
  return [];
}
// Finds a patch that changes the item: returns { patch, restore } or null.
async function findMutation(itemUrl, item) {
  for (const [k, v] of Object.entries(item)) {
    if (k === 'id' || k.startsWith('_')) continue;
    for (const nv of variants(v)) {
      const res = await http('PATCH', itemUrl, { json: { [k]: nv }, headers: MERGE });
      if (res.status === 200 || res.status === 204) return { field: k, value: nv, original: v };
    }
  }
  return null;
}

// 5.1: top-level properties that the item schema marks readOnly directly in properties (not id).
const readOnlyCache = new Map();
async function schemaReadOnly(s) {
  if (!readOnlyCache.has(s.name)) {
    const schema = s.c.schemas?.item === undefined ? null : await loadSchema(s.c.schemas.item);
    const props = isObject(schema?.properties) ? schema.properties : {};
    readOnlyCache.set(s.name, { schema, props: Object.keys(props).filter((k) => k !== 'id' && isObject(props[k]) && props[k].readOnly === true) });
  }
  return readOnlyCache.get(s.name);
}
// Fields no client can change: id, the effective fields (5.7) and the readOnly properties of the item schema.
async function readOnlyFields(s) {
  return ['id', ...inherited(s.c).map(([f]) => f), ...(await schemaReadOnly(s)).props];
}
const isRelation = (c, k) => isObject(c?.relations) && Object.hasOwn(c.relations, k);

// What a --writes run checks on a collection: skipped together when the collection cannot be written.
const WRITE_CHECKS = ['core.post', 'core.post.id', 'core.reserved.writes', 'core.put', 'core.schema.create', 'core.schema.update',
  'core.patch', 'core.patch.json', 'core.patch.not-object', 'core.patch.id', 'core.patch.underscore', 'core.patch.merge',
  'core.patch.roundtrip', 'core.patch.read-only', 'core.delete',
  'writes.idempotency.replay', 'writes.idempotency.replayed-header', 'writes.idempotency.replay-precondition',
  'writes.idempotency.json-equality', 'writes.idempotency.mismatch', 'writes.idempotency.malformed', 'writes.if-match.stale',
  'writes.if-match.list', 'writes.if-match.race', 'writes.if-none-match.write', 'writes.write-ignores-underscore',
  'writes.minimal', 'writes.minimal.applied', 'core.language.format', 'core.language.merge',
  'core.inherit.roundtrip', 'core.inherit.read-only', 'core.inherit.own', 'core.inherit.post', 'core.inherit.fields',
  'core.inherit.cycle', 'core.inherit.source', 'core.inherit.stale'].filter((id) => CHECKS[id]);
async function checkWrites(s, ctx) {
  const { name } = s;
  const missing = [...(Array.isArray(s.c.methods) && !s.c.methods.includes('POST') ? ['POST'] : []),
    ...(Array.isArray(s.c.item_methods) ? ['PATCH', 'DELETE'].filter((m) => !s.c.item_methods.includes(m)) : [])];
  if (missing.length) {
    for (const id of WRITE_CHECKS) skip(id, name, `the declared methods leave out ${missing.join(', ')} (4.3)`);
    return;
  }
  let body = fixtureFor(s);
  if (body && opts.fixtures[s.name] === undefined) {
    // A copied item: leave out what no client writes (5.1), except what the create schema requires.
    const createSchema = s.c.schemas?.create === undefined ? null : await loadSchema(s.c.schemas.create);
    const required = Array.isArray(createSchema?.required) ? createSchema.required : [];
    const ro = await readOnlyFields(s);
    body = Object.fromEntries(Object.entries(body).filter(([k]) => !ro.includes(k) || required.includes(k)));
  }
  if (!body) {
    for (const id of ['core.post', 'writes.idempotency.replay'])
      skip(id, name, 'no item to copy and no --fixture for this collection');
    return;
  }
  const post = await create(s, body);
  const postProblem = post.status !== 201 ? `got ${post.status}${post.data?.code ? ` ${post.data.code}` : ''}`
    : !post.headers.has('location') ? '201 without Location'
      : !isObject(post.data) || typeof post.data.id !== 'string' ? 'the body is not the created item with its id' : null;
  check('core.post', name, postProblem, post);
  if (post.status !== 201 || !post.where) {
    console.error(`  ${name}: could not create an item (${evidence(post)}); pass a valid body with --fixture ${name}=@file.json`);
    return;
  }
  const item = post.where;

  const withId = await create(s, { ...body, id: `restep-check-${rand()}` });
  check('core.post.id', name, problemMismatch(withId, 422, 'invalid'), withId);

  // A second item of our own, the target of the writes with a reserved parameter.
  const reservedProblems = [];
  const P = 'filter[restep_check]';
  const reservedWrite = async (label, method, url, init) => {
    const res = await http(method, withQuery(url, [[P, '1']]), init);
    const why = problemMismatch(res, 400, 'unsupported_parameter', P);
    if (why) reservedProblems.push(`${label}: ${why}`);
    return [res, why];
  };
  const [pPost] = await reservedWrite('POST', 'POST', s.url, { json: body });
  if (pPost.status === 201 && pPost.headers.get('location')) ownItem(new URL(pPost.headers.get('location'), pPost.url).href, name);
  const rp = await create(s, body);
  if (!rp.where) reservedProblems.push(`could not create a second item: ${evidence(rp)}`);
  else {
    await reservedWrite('PATCH', 'PATCH', rp.where, { json: {}, headers: MERGE });
    const [, why] = await reservedWrite('DELETE', 'DELETE', rp.where);
    if (!why && (await http('GET', rp.where)).status !== 200) reservedProblems.push('DELETE with a reserved parameter removed the item');
  }
  check('core.reserved.writes', name, reservedProblems.join('; ') || null, pPost);

  // 4.3: a closed update schema rejects an unknown member, even a null one that would vanish when merged.
  if (s.c.schemas?.update !== undefined) {
    const schema = await loadSchema(s.c.schemas.update);
    const member = 'restep_check_unknown';
    const admitted = isObject(schema?.properties) && member in schema.properties
      || Object.keys(isObject(schema?.patternProperties) ? schema.patternProperties : {}).some((p) => { try { return new RegExp(p, 'u').test(member); } catch { return true; } });
    if (schema?.additionalProperties !== false || admitted) skip('core.schema.update', name, 'the update schema does not reject an unknown member');
    else {
      const res = await http('PATCH', item, { json: { [member]: null }, headers: { ...MERGE, 'if-match': '*' } });
      check('core.schema.update', name, problemMismatch(res, 422, 'invalid'), res);
    }
  }

  const put = await http('PUT', item, { json: body });
  check('core.put', name, put.status !== 405 ? `got ${put.status}` : null, put);
  if (Array.isArray(s.c.item_methods)) check('core.methods.allow', `${name} items`, allowProblem(put, s.c.item_methods), put);

  // 4.3: a declared create schema is binding: leaving out a property it requires gives 422.
  if (s.c.schemas?.create !== undefined) {
    const schema = await loadSchema(s.c.schemas.create);
    const required = Array.isArray(schema?.required) ? schema.required.filter((k) => k in body) : [];
    if (!schema) bad('core.schema.create', name, 'the create schema could not be read');
    else if (!required.length) skip('core.schema.create', name, 'the create schema requires nothing the test body carries');
    else {
      const { [required[0]]: _, ...without } = body;
      const key = announced.includes('writes') ? { 'idempotency-key': `"restep-check-${rand()}"` } : {}; // a resource may require one (7.1)
      const res = await create(s, without, key);
      check('core.schema.create', name, problemMismatch(res, 422, 'invalid'), res, `without ${required[0]}`);
    }
  }

  const patch = await http('PATCH', item, { json: {}, headers: MERGE });
  check('core.patch', name, patch.status !== 200 ? `got ${patch.status}` : !isObject(patch.data) || patch.data.id === undefined
    ? 'the body is not the whole item' : null, patch);
  const asJson = await http('PATCH', item, { json: {}, headers: { 'content-type': 'application/json' } });
  check('core.patch.json', name, asJson.status !== 200 ? `got ${asJson.status}` : null, asJson);
  const arr = await http('PATCH', item, { json: '[]', headers: MERGE });
  check('core.patch.not-object', name, problemMismatch(arr, 400, 'bad_request'), arr);
  const otherId = await http('PATCH', item, { json: { id: `restep-check-${rand()}` }, headers: MERGE });
  check('core.patch.id', name, problemMismatch(otherId, 422, 'invalid') ?? (!(Array.isArray(otherId.data?.errors) && otherId.data.errors.some((e) => e?.pointer === '/id' && e?.code === 'read_only'))
    ? 'no errors entry with pointer /id and code read_only' : null), otherId);
  const under = await http('PATCH', item, { json: { _restep_check: 1 }, headers: MERGE });
  const reread = await http('GET', item);
  check('core.patch.underscore', name, under.status !== 200 ? `got ${under.status}` : '_restep_check' in (reread.data ?? {})
    ? 'the server stored _restep_check' : null, under);
  const plain = await http('PATCH', item, { body: 'hello', headers: { 'content-type': 'text/plain' } });
  check('core.415', name, plain.status !== 415 ? `got ${plain.status}` : !plain.headers.has('accept-patch') ? '415 without Accept-Patch' : null, plain);

  // Merge Patch: null deletes an optional field, absence leaves the rest untouched. A language map
  // is left as {} instead (3): core.language.merge covers it.
  const before = reread.data ?? {};
  const maps = languageMaps(s.c);
  const ro = await readOnlyFields(s);
  const tied = inherited(s.c).flatMap(([f, d]) => [f, d.own]); // an own field or a link also changes an effective field (5.7)
  // Independent writable fields: sent in the POST and kept as sent (an updated_at or a total may move).
  const writable = (k) => !k.startsWith('_') && !ro.includes(k) && !isRelation(s.c, k);
  const kept = Object.keys(body).filter((x) => writable(x) && !tied.includes(x) && x in before && canonical(before[x]) === canonical(body[x]));
  let merged = false;
  for (const [k, v] of Object.entries(before)) {
    if (!writable(k) || blank(v) || maps.includes(k)) continue;
    const res = await http('PATCH', item, { json: { [k]: null }, headers: MERGE });
    if (res.status === 422 || res.status === 400) continue; // a required field
    const after = (await http('GET', item)).data ?? {};
    const others = kept.filter((x) => x !== k);
    const changed = others.filter((x) => JSON.stringify(after[x]) !== JSON.stringify(before[x]));
    check('core.patch.merge', name, res.status !== 200 ? `PATCH {"${k}": null} got ${res.status}`
      : !blank(after[k]) ? `{"${k}": null} did not delete ${k}` : changed.length ? `{"${k}": null} also changed ${changed.join(', ')}` : null, res, `with ${k}`);
    await http('PATCH', item, { json: { [k]: v }, headers: MERGE });
    merged = true;
    break;
  }
  if (!merged) skip('core.patch.merge', name, 'every field of the item seems required');
  if (maps.length) await checkLanguageWrites(s, item, maps);
  if (inherited(s.c).length) await checkInheritWrites(s, item, body, ctx);
  await checkReadOnlyWrites(s, item, body, kept);

  if (announced.includes('writes')) await checkWritesWrite(s, body, item);

  const del = await http('DELETE', item);
  const gone = await http('GET', item);
  check('core.delete', name, del.status !== 204 ? `got ${del.status}` : gone.status !== 404 ? `GET after DELETE got ${gone.status}` : null, del);
  if (del.status === 204) created.splice(created.indexOf(item), 1);
}

// 5.1: read-only fields sent back as read change nothing; another value in a readOnly property gives read_only.
async function checkReadOnlyWrites(s, item, body, kept) {
  const { name } = s;
  const read = async () => http('GET', item, { headers: { 'accept-encoding': 'identity' } });
  const r0 = await read();
  const before = r0.data ?? {};
  const tag0 = r0.headers.get('etag');
  const unchanged = async (label) => {
    const r1 = await read();
    if (canonical(r1.data) !== canonical(before)) return `${label} changed the item to ${JSON.stringify(r1.data)}`;
    if (tag0 && r1.headers.get('etag') !== tag0) return `${label} changed the ETag`;
    return null;
  };
  const ro = (await readOnlyFields(s)).filter((k) => k in before);
  const back = Object.fromEntries(ro.map((k) => [k, before[k]]));
  const rt = await http('PATCH', item, { json: back, headers: { ...MERGE, ...(tag0 ? { 'if-match': tag0 } : {}) } });
  check('core.patch.roundtrip', name, rt.status !== 200 && rt.status !== 204 ? `got ${rt.status}${rt.data?.code ? ` ${rt.data.code}` : ''}`
    : await unchanged(`the read-only fields as read (${ro.join(', ')})`), rt);

  const { schema, props } = await schemaReadOnly(s);
  if (!schema) return skip('core.patch.read-only', name, 'no item schema');
  const targets = props.filter((k) => !isRelation(s.c, k) && !inherited(s.c).some(([f]) => f === k));
  if (!targets.length) return skip('core.patch.read-only', name, 'the item schema marks no other top-level property readOnly');
  // A writable change in the same PATCH shows that nothing of the request is applied.
  const w = kept.find((k) => variants(before[k]).length);
  const extra = w ? { [w]: variants(before[w])[0] } : {};
  let ran = false;
  for (const k of targets) {
    if (!(k in before)) { skip('core.patch.read-only', name, `${k} is not in the item read`); continue; }
    const p = schema.properties[k];
    const other = Array.isArray(p.enum) ? p.enum.find((v) => canonical(v) !== canonical(before[k]))
      : 'const' in p ? undefined : variants(before[k])[0];
    if (other === undefined) { skip('core.patch.read-only', name, `no other valid value to try for ${k}`); continue; }
    const res = await http('PATCH', item, { json: { [k]: other, ...extra }, headers: MERGE });
    const why = problemMismatch(res, 422, 'invalid') ?? (!(Array.isArray(res.data?.errors) && res.data.errors.some((e) => e?.pointer === pointer(k) && e?.code === 'read_only'))
      ? `no errors entry with pointer ${pointer(k)} and code read_only` : null) ?? (await unchanged(`{"${k}": ${JSON.stringify(other)}}`));
    check('core.patch.read-only', name, why, res, k);
    ran = true;
  }
  return ran;
}

// 5.7: inherited values in a PATCH, on an item this checker created.
async function checkInheritWrites(s, item, body, ctx) {
  const { name } = s;
  const read = async () => http('GET', item, { headers: { 'accept-encoding': 'identity' } });
  const r0 = await read();
  const before = r0.data ?? {};
  const tag0 = r0.headers.get('etag');
  const unchanged = async (label, res) => {
    const r1 = await read();
    if (canonical(r1.data) !== canonical(before)) return `${label} changed the item to ${JSON.stringify(r1.data)}`;
    if (tag0 && r1.headers.get('etag') !== tag0) return `${label} changed the ETag`;
    return res.status !== 200 && res.status !== 204 ? `${label} got ${res.status}${res.data?.code ? ` ${res.data.code}` : ''}` : null;
  };
  // Sending back the effective fields as read, without the own fields, changes nothing.
  const effective = Object.fromEntries(Object.entries(before).filter(([k]) => k === 'id' || inherited(s.c).some(([f]) => f === k)));
  const whole = await http('PATCH', item, { json: effective, headers: { ...MERGE, ...(tag0 ? { 'if-match': tag0 } : {}) } });
  check('core.inherit.roundtrip', name, await unchanged('the effective fields as read', whole), whole);

  const [f, d] = inherited(s.c).find(([g]) => !blank(before[g])) ?? [];
  const LATER = ['core.inherit.read-only', 'core.inherit.own', 'core.inherit.post', 'core.inherit.fields', 'core.inherit.cycle', 'core.inherit.source', 'core.inherit.stale'];
  if (!f) { for (const id of LATER) skip(id, name, 'no effective field with a value in the test item'); return; }
  const other = variants(before[f])[0];
  if (other === undefined) { for (const id of LATER) skip(id, name, `no other value to try for ${f}`); return; }
  // Another value in the effective field: read_only, and nothing changes.
  const ro = await http('PATCH', item, { json: { [f]: other }, headers: MERGE });
  const where = pointer(f);
  const why = problemMismatch(ro, 422, 'invalid') ?? (!(Array.isArray(ro.data?.errors) && ro.data.errors.some((e) => e?.pointer === where && e?.code === 'read_only'))
    ? `no errors entry with pointer ${where} and code read_only` : null) ?? (await unchanged(`{"${f}": ${JSON.stringify(other)}}`, { status: 200 }));
  check('core.inherit.read-only', name, why, ro, `{"${f}": ${JSON.stringify(other)}}`);

  // The own field: a value becomes the effective one; null inherits again.
  const own = [];
  const set = await http('PATCH', item, { json: { [d.own]: other }, headers: MERGE });
  const a = (await read()).data ?? {};
  if (set.status !== 200 && set.status !== 204) own.push(`{"${d.own}": ${JSON.stringify(other)}} got ${set.status}`);
  else if (!sameValue(a[f], other)) own.push(`after {"${d.own}": ${JSON.stringify(other)}}, ${f} is ${JSON.stringify(a[f])}`);
  else if (isObject(a._inherited) && f in a._inherited) own.push(`after {"${d.own}": ${JSON.stringify(other)}}, _inherited still names ${f}`);
  const reset = await http('PATCH', item, { json: { [d.own]: null }, headers: MERGE });
  const b = (await read()).data ?? {};
  if (reset.status !== 200 && reset.status !== 204) own.push(`{"${d.own}": null} got ${reset.status}`);
  else if (!blank(b[d.own])) own.push(`after {"${d.own}": null}, ${d.own} is ${JSON.stringify(b[d.own])}`);
  else if (blank(before[d.own]) && !sameValue(b[f], before[f])) own.push(`after {"${d.own}": null}, ${f} is ${JSON.stringify(b[f])}, not the inherited ${JSON.stringify(before[f])}`);
  else if (isObject(b._inherited) && !(f in b._inherited)) own.push(`after {"${d.own}": null}, _inherited does not name ${f}`);
  await http('PATCH', item, { json: { [d.own]: before[d.own] ?? null }, headers: MERGE });
  check('core.inherit.own', name, own.join('; ') || null, set, d.own);

  // A POST with another value in the effective field than the one that would result.
  const key = () => (announced.includes('writes') ? { 'idempotency-key': `"restep-check-${rand()}"` } : {});
  const { [f]: _f, ...base } = body; // the fixture without the effective field, for the items created below
  const posted = await create(s, { ...body, [d.own]: null, [f]: other }, key());
  check('core.inherit.post', name, problemMismatch(posted, 422, 'invalid') ?? (!(Array.isArray(posted.data?.errors) && posted.data.errors.some((e) => e?.pointer === pointer(f) && e?.code === 'read_only'))
    ? `no errors entry with pointer ${pointer(f)} and code read_only` : null), posted);

  // fields: _inherited only speaks of what the response carries.
  if (!announced.includes('query')) skip('core.inherit.fields', name, 'the server does not announce query');
  else {
    const g = Object.keys(before).find((k) => k !== 'id' && !k.startsWith('_') && k !== f && k !== d.own) ?? 'id';
    const fp = [];
    let ev;
    for (const want of [g, f]) {
      const res = ev = await http('GET', withQuery(item, [['fields', want]]));
      const why = res.data?._inherited;
      const extra = isObject(why) ? Object.keys(why).filter((k) => !(k in res.data)) : [];
      if (res.status !== 200) fp.push(`fields=${want} got ${res.status}`);
      else if (extra.length) fp.push(`fields=${want}: _inherited names ${extra.join(', ')}, not in the response`);
    }
    check('core.inherit.fields', name, fp.join('; ') || null, ev, `fields=${g} and fields=${f}`);
  }

  const decls = isObject(ctx.doc?.collections) ? ctx.doc.collections : {};
  const toOf = (r) => { const to = s.c.relations?.[r]?.to; return Array.isArray(to) ? to[0] : to; };
  // A cycle: a child of our item, then our item linked under it.
  const self = (d.from ?? []).find((r) => toOf(r) === name);
  if (!self) skip('core.inherit.cycle', name, 'no relation in from points at this same collection');
  else {
    const child = await create(s, { ...base, [d.own]: null, [self]: { id: before.id } }, key());
    if (!child.where) skip('core.inherit.cycle', name, `could not create a child item: ${evidence(child)}`);
    else {
      const res = await http('PATCH', item, { json: { [self]: { id: child.data?.id ?? decodeURIComponent(child.where.split('/').pop()) } }, headers: MERGE });
      check('core.inherit.cycle', name, problemMismatch(res, 422, 'invalid'), res, `${self} under its own child`);
      if (res.status === 200 || res.status === 204) await http('PATCH', item, { json: { [self]: before[self] ?? null }, headers: MERGE });
    }
  }

  // A source of our own: link our item to it, change it, and see the change arrive.
  const r = (d.from ?? []).find((x) => ctx.collections.some((o) => o.name === toOf(x)));
  const ts = r && ctx.collections.find((o) => o.name === toOf(r));
  const srcBody = ts && fixtureFor(ts);
  if (!r || !srcBody) { for (const id of ['core.inherit.source', 'core.inherit.stale']) skip(id, name, 'no source collection to create an item in'); return; }
  const srcRule = isObject(decls[ts.name]?.inherit?.[f]) ? decls[ts.name].inherit[f] : null;
  const { [f]: _s, ...srcBase } = srcBody;
  const src = await create(ts, srcRule ? { ...srcBase, [srcRule.own]: before[f] } : { ...srcBody, [f]: before[f] }, key());
  if (!src.where) { for (const id of ['core.inherit.source', 'core.inherit.stale']) skip(id, name, `could not create an item in ${ts.name}: ${evidence(src)}`); return; }
  const srcId = src.data?.id ?? decodeURIComponent(src.where.split('/').pop());
  const linked = await http('PATCH', item, { json: { [r]: { id: srcId }, [d.own]: null }, headers: MERGE });
  const r1 = await read();
  const tag1 = r1.headers.get('etag');
  const changed = await http('PATCH', src.where, { json: { [srcRule ? srcRule.own : f]: other }, headers: MERGE });
  const r2 = await read();
  const sp = [];
  if (linked.status !== 200 && linked.status !== 204) sp.push(`linking to ${ts.name} ${srcId} got ${linked.status}`);
  else if (!sameValue(r1.data?.[f], before[f])) sp.push(`linked to a source holding ${JSON.stringify(before[f])}, ${f} is ${JSON.stringify(r1.data?.[f])}`);
  else if (changed.status !== 200 && changed.status !== 204) sp.push(`changing the source got ${changed.status}`);
  else if (!sameValue(r2.data?.[f], other)) sp.push(`after the source changed to ${JSON.stringify(other)}, ${f} is ${JSON.stringify(r2.data?.[f])}`);
  else if (tag1 && r2.headers.get('etag') === tag1) sp.push(`after the source changed, the ETag is still ${tag1}`);
  check('core.inherit.source', name, sp.join('; ') || null, changed, `${r} → ${ts.name}`);
  if (sp.length) skip('core.inherit.stale', name, 'the source change did not reach the item');
  else {
    const st = [];
    let ev = null;
    if (announced.includes('writes') && tag1) {
      const res = ev = await http('PATCH', item, { json: {}, headers: { ...MERGE, 'if-match': tag1 } });
      if (res.status !== 412) st.push(`If-Match with the ETag from before the source changed got ${res.status}`);
    }
    const res = await http('PATCH', item, { json: { [f]: before[f] }, headers: MERGE });
    ev ??= res;
    const why = problemMismatch(res, 422, 'invalid') ?? (!(Array.isArray(res.data?.errors) && res.data.errors.some((e) => e?.pointer === pointer(f) && e?.code === 'read_only'))
      ? `no errors entry with pointer ${pointer(f)} and code read_only` : null);
    if (why) st.push(`{"${f}": ${JSON.stringify(before[f])}}, the value before the source changed: ${why}`);
    check('core.inherit.stale', name, st.join('; ') || null, ev);
  }
  await http('PATCH', item, { json: { [r]: before[r] ?? null, [d.own]: before[d.own] ?? null }, headers: MERGE });
}

// 3: language maps in a PATCH. Only the item's own translations are used, so no tag the API may not take.
const pointer = (...parts) => parts.map((p) => `/${p.replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
async function checkLanguageWrites(s, item, maps) {
  const { name } = s;
  const read = async () => (await http('GET', item)).data ?? {};
  const current = await read();
  const f = maps.find((m) => isObject(current[m]) && Object.keys(current[m]).length) ?? maps[0];
  const tag = Object.keys(isObject(current[f]) ? current[f] : {})[0] ?? 'en';
  const upper = tag.toUpperCase();
  const problems = [];
  let last;
  // Validated before merging: an uppercase key that only deletes is rejected too.
  for (const v of ['restep-check', null]) {
    last = await http('PATCH', item, { json: { [f]: { [upper]: v } }, headers: MERGE });
    const where = pointer(f, upper);
    const why = problemMismatch(last, 422, 'invalid') ?? (!(Array.isArray(last.data?.errors) && last.data.errors.some((e) => e?.pointer === where && e?.code === 'format'))
      ? `no errors entry with pointer ${where} and code format` : null);
    if (why) { problems.push(`{"${f}": {"${upper}": ${JSON.stringify(v)}}}: ${why}`); problems.ev ??= last; }
  }
  const after = await read();
  if (!sameMap(after[f], current[f]) && !(after[f] === current[f])) problems.push(`the rejected patches changed ${f} to ${JSON.stringify(after[f])}`);
  check('core.language.format', name, problems.join('; ') || null, problems.ev ?? last, `${f}/${upper}`);

  const g = maps.find((m) => isObject(current[m]) && Object.keys(current[m]).length >= 2);
  if (!g) return skip('core.language.merge', name, 'no language map with two translations in the test item');
  const original = current[g];
  const [k] = Object.keys(original);
  const { [k]: _, ...rest } = original;
  const merge = [];
  const patch = async (json, want, label) => {
    const res = await http('PATCH', item, { json, headers: MERGE });
    const got = (await read())[g];
    if (res.status !== 200 && res.status !== 204) { merge.push(`${label} got ${res.status}${res.data?.code ? ` ${res.data.code}` : ''}`); merge.ev ??= res; }
    else if (!sameMap(got, want)) { merge.push(`${label} left ${g} as ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); merge.ev ??= res; }
    return res;
  };
  await patch({ [g]: { [k]: null } }, rest, `{"${g}": {"${k}": null}}`);
  await patch({ [g]: { [k]: original[k] } }, original, `putting ${k} back`);
  const res = await patch({ [g]: null }, {}, `{"${g}": null}`);
  await http('PATCH', item, { json: { [g]: original }, headers: MERGE });
  check('core.language.merge', name, merge.join('; ') || null, merge.ev ?? res, `${g}.${k}`);
}

async function checkWritesWrite(s, body, item) {
  const { name } = s;
  // Conditional writes: we need a patch that really changes the item.
  const current = (await http('GET', item)).data ?? {};
  const old = await etagOf(item);
  const mutation = old && await findMutation(item, current);
  if (!mutation) {
    for (const id of ['writes.if-match.stale', 'writes.if-match.race'])
      skip(id, name, old ? 'found no field that a PATCH can change' : 'no ETag on the item');
  } else {
    const now = await etagOf(item);
    const problems = [];
    const p = await http('PATCH', item, { json: { [mutation.field]: mutation.original }, headers: { ...MERGE, 'if-match': old } });
    if (now === old) problems.push('the ETag did not change after a write');
    else if (problemMismatch(p, 412, 'precondition_failed')) problems.push(`PATCH: ${problemMismatch(p, 412, 'precondition_failed')}`);
    const d = await http('DELETE', item, { headers: { 'if-match': old } });
    if (problemMismatch(d, 412, 'precondition_failed')) problems.push(`DELETE: ${problemMismatch(d, 412, 'precondition_failed')}`);
    check('writes.if-match.stale', name, problems.join('; ') || null, d);
    if (d.status === 204) { created.splice(created.indexOf(item), 1); return; }

    const list = await http('PATCH', item, { json: {}, headers: { ...MERGE, 'if-match': `"restep-check-old", ${now}` } });
    const star = await http('PATCH', item, { json: {}, headers: { ...MERGE, 'if-match': '*' } });
    check('writes.if-match.list', name, list.status !== 200 ? `a list holding the current ETag got ${list.status}`
      : star.status !== 200 ? `If-Match: * got ${star.status}` : null, list.status !== 200 ? list : star);

    const tag = await etagOf(item);
    // Both send the same patch, which changes the item (it holds mutation.value now): a PATCH that
    // changes nothing may keep the ETag (5.1), so it could not lose the race.
    const race = await Promise.all([0, 1].map(() =>
      http('PATCH', item, { json: { [mutation.field]: mutation.original }, headers: { ...MERGE, 'if-match': tag } })));
    const statuses = race.map((r) => r.status).sort();
    check('writes.if-match.race', name, statuses.join() === '200,412' ? null : `the two writes got ${statuses.join(' and ')}`, race[1]);
  }

  const tag = await etagOf(item);
  if (tag) {
    const inm = await http('PATCH', item, { json: {}, headers: { ...MERGE, 'if-none-match': tag } });
    check('writes.if-none-match.write', name, problemMismatch(inm, 412, 'precondition_failed'), inm);
  }
  const full = await http('GET', item);
  const back = await http('PATCH', item, { json: { ...full.data, _etag: tag, _restep_check: 1 }, headers: MERGE });
  if (back.status === 422 && (back.data?.errors ?? []).some((e) => !String(e.pointer ?? '').startsWith('/_')))
    skip('writes.write-ignores-underscore', name, 'the server rejects some read-only field of its own; only _ members are covered');
  else check('writes.write-ignores-underscore', name, back.status !== 200 ? `sending back the item read with _etag got ${back.status}` : null, back);

  // Idempotency-Key.
  const key = `"restep-check-${rand()}"`;
  const a = await create(s, body, { 'idempotency-key': key });
  if (a.status !== 201) {
    bad('writes.idempotency.replay', name, `the first POST with Idempotency-Key got ${a.status}`, a);
  } else {
    const b = await create(s, body, { 'idempotency-key': key });
    check('writes.idempotency.replay', name, b.status !== a.status ? `the replay got ${b.status}`
      : b.where !== a.where ? `the replay created another item: ${short(b.where)}`
        : JSON.stringify(b.data) !== JSON.stringify(a.data) ? 'the replay returned another body' : null, b);
    check('writes.idempotency.replayed-header', name, b.headers.get('idempotent-replayed') === 'true' ? null : 'no Idempotent-Replayed: true', b);
    // Preconditions belong to the first request (7.1): If-None-Match: * fails now that the collection exists.
    const p = await create(s, body, { 'idempotency-key': key, 'if-none-match': '*' });
    check('writes.idempotency.replay-precondition', name, p.status !== a.status || p.where !== a.where
      ? `the replay with If-None-Match: * got ${p.status}${p.data?.code ? ` ${p.data.code}` : ''}, expected the stored ${a.status}` : null, p);
    const reordered = `{ ${Object.entries(body).reverse().map(([k, v]) => `${JSON.stringify(k)} : ${JSON.stringify(v)}`).join(' ,\n ')} }`;
    const c = await create(s, reordered, { 'idempotency-key': key });
    check('writes.idempotency.json-equality', name, c.status !== a.status || c.where !== a.where
      ? `the same JSON with another member order and spacing got ${c.status}${c.where && c.where !== a.where ? ' and a new item' : ''}` : null, c);
    const stringField = Object.keys(body).find((k) => typeof body[k] === 'string');
    const different = stringField ? { ...body, [stringField]: `${body[stringField]} ·` } : { ...body, _restep_check: rand() };
    const m = await create(s, different, { 'idempotency-key': key });
    check('writes.idempotency.mismatch', name, problemMismatch(m, 422, 'idempotency_mismatch'), m);
  }
  const malformed = await create(s, body, { 'idempotency-key': 'restep-check-unquoted' });
  check('writes.idempotency.malformed', name, problemMismatch(malformed, 400, 'bad_request'), malformed);

  // Prefer: return=minimal.
  const min = await create(s, body, { prefer: 'return=minimal' });
  if (min.status === 201 && !min.size) {
    check('writes.minimal', name, !min.headers.has('location') ? 'no Location' : !min.headers.has('etag') ? 'no ETag' : null, min);
    check('writes.minimal.applied', name, /return=minimal/.test(min.headers.get('preference-applied') ?? '') ? null : 'no Preference-Applied', min);
  } else if (min.status === 201) pass('writes.minimal', name, 'the server returns the representation (it MAY)');
  else bad('writes.minimal', name, `POST with Prefer: return=minimal got ${min.status}`, min);
}

// ── Evolution ─────────────────────────────────────────────────────────────────
async function checkEvolution(disc, ctx) {
  const now = Date.now();
  for (const [collName, d] of disc.deprecations ?? []) {
    if (!isObject(d)) continue;
    const s = ctx.collections.find((x) => x.name === collName);
    const past = d.sunset && Date.parse(d.sunset) <= now;
    const target = collName ? `${collName} ${d.kind} ${d.name ?? ''}`.trim() : `version ${d.name ?? ''}`.trim();
    let url;
    if (d.kind === 'version') url = root.href;
    else if (!s && d.kind !== 'collection') continue;
    else if (d.kind === 'collection') url = resolvePath(disc.doc.collections?.[d.name]?.path ?? `/${d.name}`);
    else if (d.kind === 'field') url = s.url;
    else if (d.kind === 'filter') url = withQuery(s.url, [[`filter[${d.name}][null]`, 'false']]);
    else if (d.kind === 'sort') url = withQuery(s.url, [['sort', d.name]]);
    else { skip('evolution.deprecation-header', target, `${d.kind} deprecations need a later version of this checker`); continue; }
    const res = await http('GET', url);
    if (past) {
      const why = ['collection', 'version'].includes(d.kind) ? problemMismatch(res, 410, 'retired')
        : ['filter', 'sort'].includes(d.kind) ? problemMismatch(res, 400, 'unsupported_parameter')
          : (res.data?.items ?? []).some((it) => d.name in it) ? `${d.name} still appears after its sunset` : null;
      check('evolution.after-sunset', target, why, res);
    } else {
      const whole = ['collection', 'version'].includes(d.kind);
      check('evolution.deprecation-header', target, !res.headers.has('deprecation') ? 'no Deprecation header'
        : !linkTargets(res, 'deprecation').length ? 'no Link with rel="deprecation"'
          : whole && d.sunset && !res.headers.has('sunset') ? 'no Sunset header, and the sunset has a date' : null, res);
    }
  }
  const v = Number(disc.doc?.version);
  if (v >= 2) check('evolution.version-links', null, linkTargets(disc.res, 'predecessor-version').length ? null : 'no Link with rel="predecessor-version"', disc.res);
}

// ── oauth (10.5) ──────────────────────────────────────────────────────────────
// RFC 9728, 3.1: the well-known suffix goes between the host and the root's path.
const metadataUrl = () => new URL(`/.well-known/oauth-protected-resource${rootPath === '/' ? '' : rootPath}`, root.origin).href;
// The whole parameter name: x-resource_metadata is not it.
const resourceMetadata = (res) => [...(res.headers.get('www-authenticate') ?? '').matchAll(/(?:^|[\s,])resource_metadata\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
// RFC 8414, 2: an issuer is an https URL without query or fragment.
const isIssuer = (i) => { try { return typeof i === 'string' && !/[?#]/.test(i) && new URL(i).protocol === 'https:'; } catch { return false; } };

async function checkOauth(ctx) {
  const url = metadataUrl();
  const res = await http('GET', url, { anonymous: true, passive: false });
  const d = res.data;
  const issuers = Array.isArray(d?.authorization_servers) ? d.authorization_servers : [];
  check('oauth.metadata', short(url), res.status !== 200 ? `status ${res.status} without credentials`
    : mediaType(res) !== 'application/json' ? `Content-Type: ${mediaType(res) || '(none)'}`
      : !isObject(d) ? 'the body is not a JSON object'
        : d.resource !== root.href ? `resource is ${JSON.stringify(d.resource)}, expected exactly ${root.href}`
          : !issuers.length ? 'authorization_servers does not list an issuer'
            : !issuers.every(isIssuer) ? `authorization_servers has something that is not an issuer (an https URL): ${JSON.stringify(issuers)}` : null, res);
  if (res.status !== 200 || !isObject(d)) skip('oauth.metadata.recommended', short(url), 'the metadata is not there');
  else {
    const cc = (res.headers.get('cache-control') ?? '').toLowerCase();
    check('oauth.metadata.recommended', short(url), !/\bpublic\b/.test(cc) || !/\bmax-age=\d+/.test(cc) ? `Cache-Control: ${cc || '(none)'}`
      : !Array.isArray(d.scopes_supported) ? 'no scopes_supported' : null, res);
  }
  const rootRes = await http('GET', root.href, { anonymous: true });
  if (rootRes.status !== 401) skip('oauth.challenge', null, `the root answers ${rootRes.status} without credentials`);
  else check('oauth.challenge', null, resourceMetadata(rootRes).includes(url) ? null
    : `WWW-Authenticate does not carry resource_metadata="${url}"`, rootRes);
  if (!ctx.collections.length) skip('oauth.challenge.elsewhere', null, 'no collections to ask');
  for (const s of ctx.collections) {
    const other = await http('GET', s.url, { anonymous: true });
    if (other.status !== 401) skip('oauth.challenge.elsewhere', s.name, `the collection answers ${other.status} without credentials`);
    else check('oauth.challenge.elsewhere', s.name, resourceMetadata(other).includes(url)
      ? 'resource_metadata points at the root’s metadata, whose resource is not this URL (RFC 9728, 3.3)' : null, other);
  }
}

// ── Output ────────────────────────────────────────────────────────────────────
function finishPassive() {
  for (const id of Object.keys(CHECKS).filter((k) => k.startsWith('passive.'))) {
    const p = passive.get(id);
    if (!p) continue;
    if (p.failures.length) bad(id, null, `${p.failures.length} of ${p.seen} responses: ${p.failures.slice(0, 3).join('; ')}${p.failures.length > 3 ? '; …' : ''}`);
    else pass(id, null, `${p.seen} responses`);
  }
}
const ORDER = { fail: 0, warn: 1, skip: 2, pass: 3 };
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const LABEL = { pass: paint(32, 'PASS'), fail: paint('1;31', 'FAIL'), warn: paint(33, 'WARN'), skip: paint(90, 'SKIP') };

function printText(meta) {
  const counts = Object.fromEntries(Object.keys(ORDER).map((k) => [k, results.filter((r) => r.status === k).length]));
  console.log(`restep-check ${VERSION} · ${meta.root}`);
  console.log(`Profiles: ${meta.profiles.join(', ')}${meta.extensions.length ? ` · extensions: ${meta.extensions.join(', ')}` : ''}` +
    ` · ${meta.writes ? 'with --writes' : 'read only'} · ${requests} requests\n`);
  for (const [prefix, title] of GROUPS) {
    const group = results.filter((r) => r.id.split('.')[0] === prefix && (opts.verbose || r.status !== 'pass'))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    const all = results.filter((r) => r.id.split('.')[0] === prefix);
    if (!all.length) continue;
    const passed = all.filter((r) => r.status === 'pass').length;
    console.log(paint(1, `${title}`) + paint(90, `  ${passed}/${all.length} passed`));
    for (const r of group) {
      const target = r.target ? paint(90, ` [${r.target}]`) : '';
      console.log(`  ${LABEL[r.status]} ${r.id}${target}  ${CHECKS[r.id][2]}`);
      if (r.message && r.status !== 'pass') console.log(`       ${r.message}`);
      if (r.message && r.status === 'pass' && opts.verbose) console.log(paint(90, `       ${r.message}`));
      if (r.evidence) console.log(paint(90, `       ${r.evidence}`));
      if (r.status === 'fail' || r.status === 'warn') console.log(paint(90, `       ${r.level} · §${r.section} ${sectionUrl(r.section)}`));
    }
    console.log('');
  }
  console.log(paint(90, `Not checked from outside:\n${NOT_CHECKED.map((x) => `  · ${x}`).join('\n')}\n`));
  console.log(`${counts.fail ? paint('1;31', `${counts.fail} failed`) : paint(32, '0 failed')} · ${counts.warn} warning${counts.warn === 1 ? '' : 's'} · ` +
    `${counts.pass} passed · ${counts.skip} skipped`);
}
const xml = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
function printJunit() {
  const fails = results.filter((r) => r.status === 'fail').length;
  console.log('<?xml version="1.0" encoding="UTF-8"?>');
  console.log(`<testsuite name="restep-check" tests="${results.length}" failures="${fails}" skipped="${results.filter((r) => r.status === 'skip').length}">`);
  for (const r of results) {
    const name = xml(`${r.id}${r.target ? ` [${r.target}]` : ''}`);
    const detail = xml(`${r.message}${r.evidence ? `\n${r.evidence}` : ''}\n${r.level} §${r.section} ${sectionUrl(r.section)}`);
    console.log(`  <testcase classname="restep.${r.id.split('.')[0]}" name="${name}">` +
      (r.status === 'fail' ? `<failure message="${xml(r.message)}">${detail}</failure>`
        : r.status === 'skip' ? `<skipped message="${xml(r.message)}"/>`
          : r.status === 'warn' ? `<system-out>WARN: ${detail}</system-out>` : '') + '</testcase>');
  }
  console.log('</testsuite>');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (process.argv[2] === '--schema') return schemaMain(process.argv.slice(2));
  opts = parseArgs(process.argv.slice(2));
  if (Object.values(opts.fixtures).some((f) => f.startsWith('@'))) {
    const { readFileSync } = await import('node:fs');
    readFile = (p) => readFileSync(p, 'utf8');
  }
  try { root = new URL(opts.root); } catch { usage(`Not a URL: ${opts.root}`); }
  if (!root.pathname.endsWith('/')) root.pathname += '/';
  root.search = '';
  rootPath = root.pathname;

  const disc = await discover();
  discoveryDone();
  const doc = disc.doc;
  const profiles = doc ? ['core', ...(doc.profiles ?? []).filter((p) => p !== 'core')] : ['core'];
  // Without credentials the profile links of a 401 can still announce oauth, which needs none.
  const extensions = doc?.extensions ?? (disc.linked ?? []).filter((p) => p === 'oauth');
  announced = [...profiles, ...extensions];

  let decls = Object.entries(isObject(doc?.collections) ? doc.collections : {});
  for (const [n, p] of Object.entries(opts.paths)) decls.push([n, { path: p }]);
  if (opts.collections.length) decls = decls.filter(([n]) => opts.collections.includes(n));
  const ctx = { collections: [], doc };
  if (!decls.length) console.error('No collections to check: the server declares none. Use --path name=/path.');
  for (const [name, c] of decls) {
    if (typeof c?.path !== 'string' || c.path.includes('{')) {
      skip('core.collection.shape', name, 'a subcollection (URI template): a later version of this checker');
      continue;
    }
    const s = await checkCollection(name, c, ctx);
    if (s) ctx.collections.push(s);
  }
  for (const s of ctx.collections) {
    if (profiles.includes('query')) await checkQuery(s, ctx);
    if (profiles.includes('writes')) await checkWritesRead(s);
  }
  if (opts.writes) for (const s of ctx.collections) await checkWrites(s, ctx);
  else if (ctx.collections.length) console.error('Read only: run with --writes to also check POST, PATCH, DELETE, If-Match and Idempotency-Key.');
  if (doc?.status !== undefined) await checkStatus(doc.status);
  await checkLanguage(disc, ctx);
  if (doc) await checkEvolution(disc, ctx);
  if (extensions.includes('oauth')) await checkOauth(ctx);
  finishPassive();

  const meta = { root: root.href, profiles, extensions, writes: opts.writes, version: VERSION, spec: SPEC };
  if (opts.format === 'json') console.log(JSON.stringify({ ...meta, requests, results, not_checked: NOT_CHECKED }, null, 2));
  else if (opts.format === 'junit') printJunit();
  else printText(meta);
  return results.some((r) => r.status === 'fail') ? 1 : 0;
}

// ── --schema: documents against the JSON Schemas ──────────────────────────────
// The schemas travel next to this file (npm package, skills) or come from the site.
const SCHEMAS = ['discovery', 'problem'];
async function schemaMain(argv) {
  const [, name, ...targets] = argv;
  const json = targets.includes('--json');
  const docs = targets.filter((t) => t !== '--json');
  if (!SCHEMAS.includes(name)) usage(`--schema takes ${SCHEMAS.join(' or ')}, not ${name ?? 'nothing'}.`);
  if (!docs.length) usage('--schema needs at least one file, URL or -.');
  const { readFile: read } = await import('node:fs/promises');
  let schema;
  try { schema = JSON.parse(await read(new URL(`./schema/${name}.json`, import.meta.url), 'utf8')); }
  catch {
    const r = await fetch(`${SPEC}schema/${name}.json`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Could not get the ${name} schema (${r.status}).`);
    schema = await r.json();
  }
  let Ajv, addFormats;
  try {
    Ajv = (await import('ajv/dist/2020.js')).default;
    addFormats = (await import('ajv-formats')).default;
  } catch {
    throw new Error('--schema needs ajv: run it as npx restep-check, or npm install ajv ajv-formats next to this file.');
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const out = [];
  for (const d of docs) {
    let data;
    try {
      const text = d === '-' ? await new Response(process.stdin).text()
        : /^https?:\/\//.test(d) ? await (await fetch(d, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) })).text()
          : await read(d, 'utf8');
      data = JSON.parse(text);
    } catch (e) { out.push({ document: d, valid: false, errors: [{ path: '', message: `not readable as JSON: ${e.message}` }] }); continue; }
    const valid = validate(data);
    out.push({ document: d, valid, errors: valid ? [] : validate.errors.map((e) => ({ path: e.instancePath, message: e.message })) });
  }
  if (json) console.log(JSON.stringify({ version: VERSION, schema: `${SPEC}schema/${name}.json`, results: out }, null, 2));
  else for (const r of out) {
    console.log(`${r.valid ? LABEL.pass : LABEL.fail}  ${r.document}  (${name}.json)`);
    for (const e of r.errors) console.log(`      ${e.path || '/'}: ${e.message}`);
  }
  return out.every((r) => r.valid) ? 0 : 1;
}

// Global so the cleanup runs whatever happens.
async function cleanup() {
  for (const url of created.splice(0)) {
    // http() sends the credentials only to the API's origin; If-Match: * satisfies a resource that requires it (7.2).
    const res = await http('DELETE', url, { passive: false, headers: { 'if-match': '*' } }).catch(() => null);
    if (!res || (res.status >= 300 && res.status !== 404 && res.status !== 410)) console.error(`Could not delete ${url}${res ? ` (${res.status})` : ''}: remove it by hand.`);
  }
}

main().then(async (code) => { await cleanup(); process.exit(code); }, async (e) => {
  console.error(`restep-check: ${e.message}`);
  if (opts) await cleanup();
  process.exit(2);
});
