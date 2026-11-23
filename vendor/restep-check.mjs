#!/usr/bin/env node
// restep-check · Conformance checker for Restep 1 (core, query, writes, cache and relations profiles; actions, oauth and inherit extensions).
// Node 18 or later, no dependencies.  Specification: https://restep.wubytes.com/1/  (draft 6)
//
//   node restep-check.mjs https://api.example.com/ [options]
//
// By default it only reads (GET and HEAD, plus a PATCH {} to a collection, which has no effect
// either way, OPTIONS preflights, and POST and DELETE with a reserved parameter to a singleton, which
// 5.4 rejects with 405 or 400 without effect). Where discovery does not say whether an item takes PATCH, it
// may also send a PATCH {} with a reserved parameter to one, which 5.3 rejects without effect. With --writes it also creates, changes and deletes items, touching only the ones it
// created, and removes them at the end. Every check names its section of the specification.
// Run it with --help for the options.
//
//   npx restep-check --schema discovery https://api.example.com/
//
// validates documents against the JSON Schemas instead and, for discovery, also runs the rules of the text
// that the schema cannot express and that need no request (the discovery checks and what filter and sort may
// declare), reported apart from the schema. That mode needs ajv and ajv-formats, which the
// npm package brings (the single file finds them next to it or in the current directory); the rest of
// the checker has no dependencies.

const VERSION = '0.9.1';
const PROFILE = 'https://w3id.org/restep/1/'; // identifier: the profile link and error types
const SPEC = 'https://restep.wubytes.com/1/'; // the page to read, and where the schemas are downloaded from
// The versions whose text this checker implements (1.1, 1.2): only under them does it use experimental parts.
const KNOWN_TEXTS = ['1.0-draft.6']; // the text of 1.0 does not exist yet
const ANCHORS = {
  1.1: 'restep-versions', 1.2: 'dependencies', 3: 'data', 4.1: 'profile-header', 4.2: 'discovery', 4.3: 'describing', 4.4: 'health',
  5.1: 'resources', 5.2: 'collections', 5.3: 'reserved', 5.4: 'errors', 5.5: 'versions', 5.6: 'language', 5.7: 'retries', 5.8: 'browser-clients', 5.9: 'singletons',
  6.1: 'filters', 6.2: 'sorting', 6.3: 'fields', 6.4: 'pagination', 6.5: 'counts',
  7.1: 'idempotency', 7.2: 'concurrency', 7.3: 'minimal', 8: 'cache', 9: 'relations', 10: 'sync', 11.5: 'oauth', 11.6: 'inheritance', 12: 'conformance',
};
const sectionUrl = (s) => `${SPEC}#${ANCHORS[s] ?? 'conformance'}`;

// ── Catalogue: every check, its section, its level and what it verifies ──────
// A failed MUST is a fail; a failed SHOULD is a warn.
const CHECKS = {
  'passive.json': ['3', 'MUST', 'Every body is valid JSON in UTF-8'],
  'passive.json-type': ['3', 'MUST', 'A 2xx with a body carries Content-Type: application/json (a JSON Schema may use application/schema+json)'],
  'passive.error.media-type': ['5.4', 'MUST', '4xx and 5xx bodies use application/problem+json'],
  'passive.error.members': ['5.4', 'MUST', 'Errors carry type, title, status (equal to the response’s) and code'],
  'passive.error.code': ['5.4', 'MUST', 'code comes from the table, the IANA registry or http_NNN'],
  'passive.error.type': ['5.4', 'SHOULD', 'type is the Restep error URI for the code, another URI or about:blank'],
  'passive.error.401': ['5.4', 'MUST', 'A 401 carries WWW-Authenticate'],
  'passive.error.private': ['5.1', 'MUST', 'A 401 or a 403 carries Cache-Control with private or no-store'],
  'passive.error.405': ['5.1', 'MUST', 'A 405 carries Allow'],
  'passive.error.retry-after': ['5.4', 'SHOULD', '429 and 503 carry Retry-After'],
  'passive.error.request-in-progress': ['7.1', 'SHOULD', 'A 409 request_in_progress carries Retry-After'],
  'passive.error.parameter': ['5.3', 'MUST', 'invalid_parameter and unsupported_parameter name the parameter in parameter'],
  'passive.error.detail': ['5.4', 'SHOULD', 'Errors carry detail'],
  'passive.error.reason': ['5.4', 'MUST', 'Where discovery declares reasons, every reason is declared, with its code'],
  'passive.no-error-in-200': ['5.4', 'MUST', 'No problem object inside a 2xx'],
  'passive.profile-link': ['4.1', 'SHOULD', 'Responses carry one rel="profile" link, to the version URI, and no other profile link'],
  'passive.links': ['3', 'MUST', 'next and href are absolute paths under the API root, or absolute URIs with https or the root’s scheme'],

  'discovery.present': ['4.2', 'MUST', 'The API root serves a discovery document'],
  'discovery.version': ['1.1', 'MUST', 'restep follows the grammar of 1.1 with major version 1, and version is an integer string'],
  'discovery.same': ['4.2', 'MUST', 'The document is the same in two reads and with and without credentials (unless 401 without them); served only with credentials, it is private or no-store'],
  'discovery.dependencies': ['1.2', 'MUST', 'No profile or extension without the ones it requires'],
  'discovery.names': ['3', 'MUST', 'Every name discovery declares (collections, singletons, fields, filters, sort keys, relations, actions, reasons) follows the grammar of names'],
  'discovery.members': ['4.2', 'MUST', 'Members Restep does not define, at the root and in collections and singletons, start with x-'],
  'discovery.types': ['4.2', 'MUST', 'Filter types come from the vocabulary; enum carries values'],
  'discovery.ops': ['6.1', 'MUST', 'Operators come from the list; boolean only takes eq, ne and null, and the id filter no order operator'],
  'discovery.sync-id': ['10', 'MUST', 'A synced collection declares id in filter with in'],
  'discovery.idempotency-ttl': ['7.1', 'SHOULD', 'writes declares idempotency.ttl, at least 86400'],
  'discovery.deprecations': ['5.5', 'MUST', 'Each notice has a kind valid where it is, the members its kind needs, an RFC 3339 announced and, if any, an RFC 3339 sunset'],
  'discovery.reasons': ['5.4', 'MUST', 'reasons is an object of snake_case reasons, each with a code from the table, the IANA registry or http_NNN'],
  'discovery.service-doc': ['4.2', 'SHOULD', 'The discovery response, or the root’s without one, links the documentation with rel="service-doc"'],
  'discovery.no-underscore-fields': ['3', 'MUST', 'No declared field starts with _'],
  'discovery.describing': ['4.3', 'MUST', 'methods, descriptions, schemas and action declarations have the right shape'],
  'discovery.language-maps': ['4.2', 'MUST', 'language_maps is an object of objects, keyed by top-level fields that are not relations'],
  'discovery.named-filters': ['6.1', 'MUST', 'named_filters is an object of objects with a description and, if typed, a type from the vocabulary; no name is a key of filter or has a dot'],
  'discovery.inherit': ['11.6', 'MUST', 'inherit appears only where extensions lists it, and gives each effective field an own field and to-one relations declared in relations, none of them id, a relation or a language map'],
  'discovery.id-from': ['5.1', 'MUST', 'id_from is server, client or either'],
  'discovery.collations': ['6.1', 'MUST', 'collations names string fields of filter or sort, never id, with codepoint or server'],
  'discovery.subcollections': ['4.2', 'MUST', 'A collection whose path is a template declares parent, its variables have distinct names, and its path starts with the parent’s path and its last variable'],
  'discovery.relations': ['9', 'MUST', 'Each relationship declares to with a declared collection (or a list of them), and many and include, if present, as booleans'],
  'discovery.actions': ['11.1', 'MUST', 'Each action declares on (item or collection), safe and idempotent as booleans, and no collection has one named changes'],
  'discovery.singletons': ['5.9', 'MUST', 'Each singleton has an absolute path that is not a template nor a path a collection or its items could have, and methods out of GET and PATCH'],

  'core.collection.shape': ['5.2', 'MUST', 'A collection responds {items, next} with next present'],
  'core.collection.traversal': ['5.2', 'MUST', 'Following next until null returns every item once'],
  'core.collection.deterministic': ['5.2', 'MUST', 'Two traversals return the same order'],
  'core.item.id': ['3', 'MUST', 'Every id is a non-empty string of unreserved characters'],
  'core.item.get': ['5.1', 'MUST', 'GET on an item returns it with no envelope'],
  'core.item.decimal': ['3', 'MUST', 'Decimal fields are strings'],
  'core.item.dates': ['3', 'MUST', 'datetime fields are RFC 3339 with an offset; date fields full-date'],
  'core.not-found': ['5.4', 'MUST', 'A missing item gives 404 not_found'],
  'core.not-found.id-form': ['3', 'MUST', 'The path of an item with its id in another form (a leading zero, another case) gives 404, unless an item has that id'],
  'core.subcollection.parent': ['4.2', 'MUST', 'A subcollection, or an item of it, under a parent item that does not exist gives 404'],
  'core.subcollection.delete': ['5.1', 'MUST', 'Once its parent item is deleted, a subcollection and its items give 404'],
  'core.error-order': ['5.4', 'MUST', 'A missing item or an unsupported method is reported before a bad parameter'],
  'core.head': ['5.1', 'MUST', 'HEAD works wherever GET does, with the same status and headers'],
  'core.method-not-allowed': ['5.1', 'MUST', 'An unsupported method gives 405 with Allow'],
  'core.put': ['5.1', 'MUST', 'PUT on an item gives 405'],
  'core.methods.allow': ['4.3', 'MUST', 'Declared methods and item_methods agree with the Allow of a 405'],
  'core.methods.left-out': ['4.3', 'MUST', 'Where methods or item_methods leaves out GET, GET and HEAD give 405 with an Allow that lists every declared method and not HEAD'],
  'core.schema.create': ['4.3', 'MUST', 'A POST without a property the create schema requires gives 422'],
  'core.schema.update': ['4.3', 'MUST', 'A PATCH with a member a closed update schema does not allow gives 422, even when it is null'],
  'core.status': ['4.4', 'MUST', 'A declared status answers GET and HEAD with 200 or 503, with Cache-Control: no-store'],
  'core.private': ['5.1', 'MUST', 'A GET whose status or body changes with the credentials sent carries Cache-Control with private or no-store'],
  'core.language.fallback': ['5.6', 'MUST', 'An Accept-Language not offered, or malformed, gives the same code as none, never 406 or 400'],
  'core.language.vary': ['5.6', 'MUST', 'Discovery and errors whose body changes with Accept-Language carry Vary: Accept-Language and an ETag per language'],
  'core.language.data': ['3', 'MUST', 'An item gives the same body (and, with writes or cache, ETag) under any Accept-Language'],
  'core.language.maps': ['3', 'MUST', 'Each declared language map in an item is an object of strings keyed by well-formed lowercase tags'],
  'core.reserved.get': ['5.3', 'MUST', 'An unimplemented reserved parameter on a collection gives unsupported_parameter'],
  'core.reserved.item': ['5.3', 'MUST', 'An unimplemented reserved parameter on an item gives unsupported_parameter'],
  'core.reserved.forms': ['5.3', 'MUST', 'A parameter form Restep does not define (filter[a][b][c], fields[], sort[x]) gives unsupported_parameter'],
  'core.reserved.dollar': ['5.3', 'MUST', 'A $ parameter gives unsupported_parameter'],
  'core.reserved.writes': ['5.3', 'MUST', 'Writes with a reserved parameter give 400 and have no effect'],
  'core.singleton': ['5.9', 'MUST', 'Each singleton answers GET and HEAD with a JSON object'],
  'core.singleton.methods': ['5.9', 'MUST', 'POST and DELETE on a singleton give 405, with an Allow that agrees with its methods'],
  'core.singleton.params': ['5.9', 'MUST', 'include and the other reserved parameters give unsupported_parameter on a singleton; with query, fields works'],
  'core.singleton.patch': ['5.9', 'MUST', 'A PATCH {} to a singleton gives 200 with the whole representation and keeps its ETag'],
  'core.post': ['5.1', 'MUST', 'POST gives 201 with Location and the created item'],
  'core.post.id': ['5.1', 'MUST', 'Where id_from is missing or server, a POST with an id gives 422 invalid with a read_only entry at /id'],
  'core.post.media-type': ['3', 'MUST', 'A POST with another media type, without Content-Type, with a charset other than UTF-8, or empty without Content-Type gives 415, and empty with application/json 400 bad_request'],
  'core.post.charset': ['3', 'MUST', 'A POST with charset=UTF-8 or charset="utf-8" is accepted'],
  'core.client-id': ['5.1', 'MUST', 'Where id_from is client or either, a POST with an id the client chose creates the item at that path'],
  'core.client-id.required': ['5.1', 'MUST', 'Where id_from is client, a POST without id gives 422 with a required entry at /id'],
  'core.client-id.format': ['5.1', 'MUST', 'Where the client chooses ids, one with a character outside section 3 gives 422 with an entry at /id'],
  'core.client-id.taken': ['5.1', 'MUST', 'An id in use, or that of a deleted item, gives 409 conflict with a taken entry at /id and creates nothing'],
  'core.patch': ['5.1', 'MUST', 'PATCH with merge-patch+json gives 200 and the whole item'],
  'core.patch.json': ['5.1', 'SHOULD', 'PATCH also accepts application/json'],
  'core.patch.not-object': ['5.1', 'MUST', 'A patch that is not an object gives 400 bad_request'],
  'core.patch.id': ['5.1', 'MUST', 'PATCH with a different id gives 422 invalid with a read_only entry at /id'],
  'core.patch.underscore': ['5.1', 'MUST', 'A write ignores members starting with _'],
  'core.patch.merge': ['5.1', 'MUST', 'null deletes a field and absence leaves it untouched (RFC 7396)'],
  'core.patch.roundtrip': ['5.1', 'MUST', 'A PATCH with the item\'s read-only fields as read changes neither its body nor its ETag'],
  'core.patch.read-only': ['5.1', 'MUST', 'Another value in a property the item schema marks readOnly gives 422 invalid with a read_only entry, and changes nothing'],
  'core.relation.unknown': ['5.1', 'MUST', 'A relationship to an item that does not exist gives 422 invalid with an unknown entry at its id'],
  'core.relation.replace': ['5.1', 'MUST', 'A relationship object is replaced whole: only its id is read, and other members are not stored'],
  'core.relation.href': ['5.1', 'MUST', 'A link to a subcollection’s item with an href that is not the path of an item of it, or that does not end in the id sent, gives 422'],
  'core.415': ['5.1', 'MUST', 'A PATCH with another media type, without one or with a charset other than UTF-8 gives 415'],
  'core.415.accept-patch': ['5.1', 'SHOULD', 'A 415 to a PATCH carries Accept-Patch'],
  'core.delete': ['5.1', 'MUST', 'DELETE gives 204 and the item is gone'],
  'core.language.format': ['3', 'MUST', 'A PATCH with an uppercase tag, even set to null, gives 422 with a format entry at /field/TAG'],
  'core.language.merge': ['3', 'MUST', 'null deletes one translation and keeps the rest, putting it back restores it, and {"field": null} leaves {}'],
  'core.cors.expose': ['5.8', 'SHOULD', 'With CORS, a collection GET lists in Access-Control-Expose-Headers the Restep headers it carries (ETag, Link…)'],
  'core.cors.errors': ['5.8', 'SHOULD', 'With CORS, a 400 from the same collection also carries Access-Control-Allow-Origin'],
  'core.cors.preflight': ['5.8', 'SHOULD', 'A preflight that opens the origin answers 2xx and allows the method and Restep request headers of a POST to the collection and a PATCH to an item'],
  'core.cors.vary': ['5.8', 'SHOULD', 'A response whose Access-Control-Allow-Origin repeats the Origin carries Vary: Origin'],
  'core.cors.credentials': ['5.8', 'SHOULD', 'Access-Control-Allow-Credentials: true never comes with Access-Control-Allow-Origin: *, and then * covers no header'],
  'evolution.deprecation-header': ['5.5', 'MUST', 'What is deprecated carries Deprecation and a deprecation link'],
  'evolution.after-sunset': ['5.5', 'MUST', 'After its sunset, what is retired responds as 5.5 says'],
  'evolution.announced': ['5.5', 'MUST', 'The announced instant of a notice does not change between two reads of discovery'],
  'evolution.version-links': ['5.5', 'MUST', 'A version 2 or later links its predecessor'],

  'query.filter.match': ['6.1', 'MUST', 'Each declared filter returns exactly the matching items, compared by type'],
  'query.filter.eq-shorthand': ['6.1', 'MUST', 'filter[f]=v is the same as filter[f][eq]=v'],
  'query.filter.and': ['6.1', 'MUST', 'Several filters combine with AND'],
  'query.filter.same-field': ['6.1', 'MUST', 'Two operators on one field are two filters, combined with AND'],
  'query.filter.absent': ['6.1', 'MUST', 'No operator but null matches absent or null values'],
  'query.filter.undeclared': ['6.1', 'MUST', 'An undeclared field or operator gives unsupported_parameter'],
  'query.filter.bad-value': ['6.1', 'MUST', 'A wrong value, an empty in or a repeated filter gives invalid_parameter'],
  'query.filter.duration-years': ['6.1', 'MUST', 'A duration with years gives invalid_parameter'],
  'query.filter.lists': ['6.1', 'MUST', 'No field holding a list, no path through a to-many relationship and no path to the id of a subcollection’s item is declared in filter or sort'],
  'query.named-filter.narrows': ['6.1', 'MUST', 'Each declared named filter answers a collection whose items are all in the unfiltered one'],
  'query.named-filter.and': ['6.1', 'MUST', 'A named filter combines with AND with another filter'],
  'query.named-filter.operator': ['6.1', 'MUST', 'A named filter with an operator gives unsupported_parameter'],
  'query.named-filter.bad-value': ['6.1', 'MUST', 'A switch with a value, a typed named filter without one or with a wrong one, or a repeated one gives invalid_parameter'],
  'query.plus': ['5.2', 'MUST', 'A + in the query is a space: filter[f]=a+b gives the same as filter[f]=a%20b'],
  'query.reencode': ['5.2', 'MUST', 'next with its parameters percent-encoded another way, or reordered, gives the same page'],
  'query.limits': ['5.3', 'MUST', 'An in list of a thousand values gives the full result, invalid_parameter, 413 or 414; never part of it'],
  'query.sort.order': ['6.2', 'MUST', 'sort orders by type, strings by code points unless collations says otherwise, with missing values last both ways'],
  'query.sort.stable': ['6.2', 'MUST', 'Ties break stably across pages'],
  'query.sort.undeclared': ['6.2', 'MUST', 'An undeclared sort key gives unsupported_parameter'],
  'query.language.declared': ['6.1', 'MUST', 'No language map, nor a path that ends in or goes through one, is declared in filter or sort'],
  'query.language.exact': ['6.1', 'MUST', 'A field.tag filter or sort reads only that key: items without it count as absent'],
  'query.fields': ['6.3', 'MUST', 'fields returns only those fields, id and _ members; fields=id is accepted'],
  'query.fields.unknown': ['6.3', 'MUST', 'A field that does not exist, or a path into a language map, gives invalid_parameter'],
  'query.fields.writes': ['6.3', 'MUST', 'fields or include on a POST or a PATCH gives unsupported_parameter'],
  'query.limit': ['6.4', 'MUST', 'limit sets the page size, up to max_limit; without max_limit, limit gives unsupported_parameter'],
  'query.limit.range': ['6.4', 'MUST', 'limit out of range gives invalid_parameter, not a silent clamp'],
  'query.cursor.keeps-params': ['6.4', 'MUST', 'next carries cursor and keeps the other parameters'],
  'query.cursor.tampered': ['6.4', 'MUST', 'A tampered cursor gives invalid_parameter on cursor'],
  'query.cursor.other-query': ['6.4', 'MUST', 'A cursor reused with another query gives invalid_parameter on cursor'],
  'query.cursor.page-params': ['6.4', 'MUST', 'Changing limit or fields between pages keeps the cursor valid'],
  'query.count': ['6.5', 'MUST', 'count=true adds total (and total_estimated when estimated)'],
  'query.count.false': ['6.5', 'MUST', 'count=false is the same as leaving it out'],
  'query.count.undeclared': ['6.5', 'MUST', 'count=true and count=false without count declared give unsupported_parameter'],

  'writes.etag.strong': ['7.2', 'MUST', 'A full item carries a strong ETag'],
  'writes.etag.member': ['7.2', 'MUST', 'Every response whose body is one item (full, with fields, under gzip) carries the item ETag in _etag'],
  'writes.etag.write': ['7.2', 'MUST', 'The bodies of a POST and a PATCH carry the item ETag in _etag'],
  'writes.etag.collection': ['7.2', 'SHOULD', 'Collection items that take PATCH or DELETE carry their item ETag in _etag; MUST where the collection declares sync'],
  'writes.if-none-match.write': ['7.2', 'MUST', 'If-None-Match with the current ETag gives 412 to a write'],
  'writes.if-match.stale': ['7.2', 'MUST', 'If-Match with an old ETag gives 412'],
  'writes.if-match.list': ['7.2', 'MUST', 'If-Match with a list holding the current ETag, or *, succeeds'],
  'writes.if-match.race': ['7.2', 'MUST', 'Of two simultaneous writes with the same If-Match, one gets 412'],
  'writes.if-match.post': ['7.2', 'MUST', 'If-Match with an invented entity tag on a POST to a collection gives 412 and creates nothing'],
  'writes.if-match.deleted': ['7.2', 'MUST', 'PATCH and DELETE with If-Match on an item just deleted give 404, not 412'],
  'writes.write-ignores-underscore': ['7.2', 'MUST', 'A representation read back with _etag can be written'],
  'writes.idempotency.replay': ['7.1', 'MUST', 'The same Idempotency-Key returns the same response and creates nothing new'],
  'writes.idempotency.replayed-header': ['7.1', 'SHOULD', 'A replay carries Idempotent-Replayed: true'],
  'writes.idempotency.replay-precondition': ['7.1', 'MUST', 'A replay returns the stored response even if a precondition no longer holds'],
  'writes.idempotency.json-equality': ['7.1', 'MUST', 'Bodies equal as JSON values are the same request'],
  'writes.idempotency.mismatch': ['7.1', 'MUST', 'The same key with another body, or with another query, gives 422 idempotency_mismatch'],
  'writes.idempotency.malformed': ['7.1', 'MUST', 'A malformed key, or one with parameters, gives 400 bad_request with an entry for the header'],
  'writes.idempotency.concurrent': ['7.1', 'MUST', 'Two simultaneous POSTs with the same key and body create one item'],
  'writes.idempotency.anonymous': ['7.1', 'MUST', 'Without credentials, a repeated key is replayed or, with idempotency.anonymous false, gets 400 with an entry for the header'],
  'writes.minimal': ['7.3', 'MUST', 'A minimal response carries Location and ETag'],
  'writes.minimal.applied': ['7.3', 'SHOULD', 'A minimal response carries Preference-Applied'],

  'cache.cache-control': ['8', 'MUST', 'Every GET or HEAD response, errors included, carries Cache-Control'],
  'cache.etag': ['8', 'MUST', 'A GET of a full item or a singleton carries an ETag (with writes, the strong item ETag)'],
  'cache.if-none-match': ['8', 'MUST', 'If-None-Match with the current ETag, strong or weak, gives 304 to GET and HEAD'],

  'relations.objects': ['9', 'MUST', 'Each declared relationship in an item is an object with an id, a list of them or null, with type where it points to several collections and href where its target is a subcollection'],
  'relations.href': ['9', 'MUST', 'The href of a relationship to a subcollection is the path of that item, and a GET answers it'],
  'relations.include': ['9', 'MUST', 'include on each declared expandable relationship fills its objects with the related item, in the collection and in an item'],
  'relations.include.unsupported': ['9', 'MUST', 'include on an undeclared or not expandable relationship, or deeper than include_depth, gives unsupported_parameter'],
  'relations.include.depth': ['9', 'MUST', 'Where include_depth is 2 or more, a dotted include fills the related item of the related item'],
  'relations.fields': ['9', 'MUST', 'With query, a dotted path in fields gives invalid_parameter without its relationship in include, and with it a projection of the related item'],

  'actions.undeclared': ['11.1', 'MUST', 'An undeclared action, or a declared one on the other kind of resource, gives 404 not_found'],
  'actions.method': ['11.1', 'MUST', 'A declared action with another method gives 405 with an Allow that names its method'],
  'actions.colon': ['11.1', 'MUST', 'The colon of an action is also accepted encoded as %3A'],
  'actions.get': ['11.1', 'MUST', 'A declared GET action answers GET and HEAD alike, with 200, 201 or 204'],
  'actions.listed': ['11.1', 'MUST', 'Every action in _actions is declared in its collection, on items, with the same method'],
  'actions.empty-body': ['11.1', 'MUST', 'A POST action on an item answers an empty body without Content-Type and {} alike'],
  'actions.response': ['11.1', 'MUST', 'A POST action that succeeds answers 200 with a JSON object, 201 with Location or 204'],
  'actions.idempotency-key': ['11.1', 'MUST', 'With writes, an action declared idempotent does not reject a request for carrying a well-formed Idempotency-Key'],

  'oauth.metadata': ['11.5', 'MUST', 'The metadata is at the URL RFC 9728 forms from the root, public JSON whose resource is the root, with an authorization server'],
  'oauth.metadata.recommended': ['11.5', 'SHOULD', 'The metadata carries Cache-Control: public with max-age, and scopes_supported'],
  'oauth.challenge': ['11.5', 'MUST', 'A 401 to the root carries the metadata URL in resource_metadata'],
  'oauth.challenge.elsewhere': ['11.5', 'MUST', 'A 401 elsewhere does not point resource_metadata at the root’s metadata'],

  'inherit.read': ['11.6', 'MUST', 'An item carries its own field and the effective one, equal to the own value when there is one; _inherited, if present, names every inherited field with href, default or hidden, and href points at the item that holds the value'],
  'inherit.roundtrip': ['11.6', 'MUST', 'A PATCH with only the effective fields as read, without the own fields, changes neither its body nor its ETag'],
  'inherit.read-only': ['11.6', 'MUST', 'Another value in an effective field gives 422 invalid with a read_only entry at its pointer, and changes nothing'],
  'inherit.own': ['11.6', 'MUST', 'A value in the own field becomes the effective one; null in it inherits again'],
  'inherit.post': ['11.6', 'MUST', 'A POST with an effective field other than the value that would result gives 422 invalid with a read_only entry'],
  'inherit.fields': ['11.6', 'MUST', 'With fields, _inherited only names effective fields that are in the response'],
  'inherit.cycle': ['11.6', 'MUST', 'A link that would make an item its own ancestor gives 422 invalid'],
  'inherit.source': ['11.6', 'MUST', 'Changing the source changes the effective value and the ETag of an item that inherits from it'],
  'inherit.stale': ['11.6', 'MUST', 'After the source changes, If-Match with the old ETag gives 412 and the old effective value gives read_only'],
};
const GROUPS = [['passive', 'Every response'], ['discovery', 'Discovery'], ['core', 'core'],
  ['evolution', 'Evolution'], ['query', 'query'], ['writes', 'writes'], ['cache', 'cache'], ['relations', 'relations'], ['actions', 'actions'], ['oauth', 'oauth'], ['inherit', 'inherit']];
// Checks observed on every response and reported once each.
const PASSIVE = [...Object.keys(CHECKS).filter((k) => k.startsWith('passive.')), 'cache.cache-control'];

const NOT_CHECKED = [
  'Atomicity when the server fails between the effect and storing the response (7.1).',
  'That an Idempotency-Key lasts 24 hours (7.1).',
  'That GET and HEAD have no visible effects (5.1).',
  'That a cursor is bound to the principal that received it (6.4).',
  'Anything that needs two principals: discovery equal for both, fields one of them cannot read in filters, sorts, fields and total (6.1, 6.3, 6.5), 403 or 409 for a field it may not change (5.1), concealed existence (5.4).',
  'That 429 and 503 leave no effect, which needs a way to provoke them (5.7).',
  'The Origin check of a server that takes cookies, HTTP authentication or client certificates: it needs such a session (5.8).',
  'The insufficient_scope challenge on a 403: it needs a token without some scope (11.5).',
  'How a collation "server" compares and sorts: only that the field is a declared string and not id (6.1).',
  'Which languages the server offers, so neither the lookup of Accept-Language (5.6) nor the unknown code for a tag it does not take (3).',
  'Inherited values the client cannot see the source of ("hidden"), which need a principal without that permission; and, after a source changes, the sync notices and cache groups of the items that inherit from it (11.6).',
  'CORS beyond one test origin, one collection and one item: other origins, cookies and the other operations (5.8).',
  'relations: that a related item this principal cannot see stays with only id, which needs two principals; that every relationship in an item is declared (9).',
  'actions: 409 when the item’s state does not allow one, 403 or 404 for a principal that may not use it, and POST actions on the collection, which act on data the checker did not create (11.1).',
  'sync, batch, filter-expr, query-method and subcollections of subcollections: a later version of this checker.',
];

// ── Options ───────────────────────────────────────────────────────────────────
const HELP = `restep-check ${VERSION} · Restep 1 conformance checker (core, query, writes, cache, relations, actions, oauth, inherit)

Usage: node restep-check.mjs <api-root> [options]
       npx restep-check --schema <discovery|problem> <file|url|->...

  -H, --header "Name: value"   Send this header on every request (repeatable)
  --writes                     Also create, change and delete items (only its own)
  --fixture <coll>=<json|@file> A valid POST body for that collection. Repeat it to give several,
                               used in turn. In strings, {{n}} becomes a value unique to each
                               POST and {{uuid}} a random UUID, for fields that must be unique
  --collection <name>          Only check this collection (repeatable)
  --path <name>=</path>        Declare a collection when the server has no discovery document
  --max-items <n>              Stop traversing a collection after n items (default 500)
  --timeout <ms>               Per request (default 10000)
  --json | --junit             Machine-readable output for CI
  --verbose                    Also list the checks that passed
  -h, --help                   This help

With --schema it validates each document against that JSON Schema of Restep 1 (a URL is
fetched with GET, - reads standard input). A discovery document also goes through the rules of
the text that a schema cannot express and that need no request (a named filter called like a
filter, a subcollection's path, a path through a to-many relationship…), reported apart.
Only that mode needs ajv and ajv-formats:
npx restep-check brings them; the single file finds them installed next to it or in the current directory.

Without --fixture it copies an item. If that POST gets 409 conflict (a unique field), it
retries once with every free-text string made unique, and otherwise skips the writes of that
collection instead of failing them. A resource that requires Idempotency-Key (400
idempotency_key_required) or If-Match (428) gets them on a retry.

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
      else (o.fixtures[name] ??= []).push(rest);
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
let currentDoc = null, reasons = null, laterMinor = false, knownText = true, askedCredentials = false; // 5.4: the declared reasons; 1.1: a minor version later than this checker's
// code and reason depend on discovery (its version and its reasons): errors seen before it is read wait for it.
let discovered = false;
const pendingErrors = [];
const resolvePath = (path) => new URL(rootPath.replace(/\/$/, '') + path, root.origin).href;
const enc = (s) => encodeURIComponent(s).replace(/%5B/g, '[').replace(/%5D/g, ']').replace(/%2C/g, ',').replace(/%24/g, '$');
const withQuery = (url, pairs) => (pairs.length ? `${url}${url.includes('?') ? '&' : '?'}${pairs.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&')}` : url);
const short = (url) => { const u = new URL(url); return u.origin === root.origin ? u.pathname + u.search : url; };
const evidence = (res) => `${res.method} ${short(res.url)} → ${res.status}`;

// anonymous: without the --header credentials. passive: false skips the passive checks, for
// documents that are not resources of the API (the oauth metadata, 11.5).
// Resources that require headers to write (7.1, 7.2): once one answers 400 idempotency_key_required or 428,
// its writes get Idempotency-Key or If-Match on a retry, and from then on up front.
const needsKey = new Set(), needsIfMatch = new Set();
const parentOf = (url) => { const u = new URL(url); u.search = ''; return u.href.replace(/\/[^/]*$/, ''); };
const hasHeader = (h, name) => Object.keys(h).some((k) => k.toLowerCase() === name);
const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${rand()}${rand()}-4${rand()}`);
async function http(method, url, init = {}) {
  const h = init.headers ?? {};
  const target = method === 'POST' ? new URL(url).origin + new URL(url).pathname : parentOf(url);
  if (method === 'POST' && needsKey.has(target) && !hasHeader(h, 'idempotency-key') && announced.includes('writes'))
    init = { ...init, headers: { ...h, 'idempotency-key': `"restep-check-${uuid()}"` } };
  if ((method === 'PATCH' || method === 'DELETE') && needsIfMatch.has(target) && !hasHeader(h, 'if-match')) {
    const tag = (await rawHttp('GET', url, { headers: { 'accept-encoding': 'identity' } })).headers.get('etag');
    if (tag) init = { ...init, headers: { ...h, 'if-match': tag } };
  }
  const res = await rawHttp(method, url, init);
  if (method === 'POST' && res.status === 400 && res.data?.code === 'idempotency_key_required' && !hasHeader(h, 'idempotency-key')) {
    needsKey.add(target);
    return http(method, url, init);
  }
  if ((method === 'PATCH' || method === 'DELETE') && res.status === 428 && !hasHeader(init.headers ?? {}, 'if-match')) {
    needsIfMatch.add(target);
    return http(method, url, init);
  }
  return res;
}
async function rawHttp(method, url, { headers = {}, json, body, anonymous = false, passive = true, schema = false } = {}) {
  // 3: a client never dereferences a link with a scheme other than http(s); passive.links reports it.
  if (!/^https?:$/.test(new URL(url).protocol)) return { method, url, status: 0, headers: new Headers(), size: 0, data: undefined, bodyError: null, reqHeaders: headers, schema };
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
    reqHeaders: h, schema };
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
  403: ['forbidden'], 404: ['not_found'], 405: ['method_not_allowed'], 406: ['not_acceptable'], 409: ['conflict', 'request_in_progress'],
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
function checkLink(value, res) { // 3: absolute URI with https or the root's scheme, or absolute path under the API root
  if (typeof value !== 'string') return `${JSON.stringify(value)} is not a string`;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (scheme) return scheme === 'https' || `${scheme}:` === root.protocol ? null : `${value} uses ${scheme}:, neither https nor the API root’s scheme`;
  if (!value.startsWith('/') || value.startsWith('//')) return `${value} is neither an absolute URI nor an absolute path`;
  if (!value.startsWith(rootPath) && rootPath !== '/') return `${value} does not include the API root’s path ${rootPath}`;
  return null;
}

function checkResponse(res) {
  const noBody = res.status === 204 || res.status === 304 || res.method === 'HEAD';
  if (!noBody && res.size) observe('passive.json', res.bodyError, res);
  const read = res.method === 'GET' || res.method === 'HEAD';
  if (announced.includes('cache') && read) observe('cache.cache-control', res.headers.has('cache-control') ? null : 'no Cache-Control', res);
  if (res.status === 401 || res.status === 403) { // 5.1: a status that depends on who asks
    const cc = (res.headers.get('cache-control') ?? '').toLowerCase();
    observe('passive.error.private', /\b(private|no-store)\b/.test(cc) ? null : `Cache-Control: ${cc || '(none)'}`, res);
  }
  // 3: a 2xx with a body is application/json; a JSON Schema may be application/schema+json.
  if (res.status >= 200 && res.status < 300 && !noBody && res.size) {
    const mt = mediaType(res);
    observe('passive.json-type', mt === 'application/json' || (res.schema && mt === 'application/schema+json') ? null : `Content-Type: ${mt || '(none)'}`, res);
  }
  if (res.status !== 304) {
    const links = linkTargets(res, 'profile');
    const extra = links.filter((u) => u.startsWith(PROFILE) && u !== PROFILE).map((u) => u.slice(PROFILE.length));
    observe('passive.profile-link', !links.includes(PROFILE) ? `no <${PROFILE}>; rel="profile"`
      : extra.length ? `lists profiles in the header (${extra.join(', ')}): only the version URI goes there` : null, res);
  }
  if (res.status >= 400) {
    if (res.status === 401) askedCredentials = true; // 5.8: the API asks for credentials, so a preflight may carry Authorization
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
    if (d.code === 'request_in_progress') observe('passive.error.request-in-progress', res.headers.has('retry-after') ? null : 'no Retry-After', res);
    observe('passive.error.detail', typeof d.detail === 'string' && d.detail ? null : 'no detail', res);
    if (d.code === 'invalid_parameter' || d.code === 'unsupported_parameter')
      observe('passive.error.parameter', typeof d.parameter === 'string' && d.parameter ? null : `${d.code} without parameter`, res);
    if (discovered) errorCodes(res, d); else pendingErrors.push([res, d]);
    if (typeof d.code === 'string') {
      if (typeof d.type === 'string')
        observe('passive.error.type', d.type === 'about:blank' || /^[a-z][a-z0-9+.-]*:/i.test(d.type) && (!d.type.startsWith(`${PROFILE}errors#`) || d.type === `${PROFILE}errors#${d.code}`)
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
// 11.6: the declared inherited fields, as [effective, rule] with a string own field.
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
const REQUIRES = { query: ['core'], writes: ['core'], cache: ['core'], relations: ['core'], sync: ['core', 'query'], actions: ['core'],
  batch: ['core'], 'filter-expr': ['query'], 'query-method': ['query'], oauth: ['core'], inherit: ['core'] };
const KNOWN_PROFILES = ['core', 'query', 'writes', 'cache', 'relations', 'sync'];
const KNOWN_EXTENSIONS = ['actions', 'batch', 'filter-expr', 'query-method', 'oauth', 'inherit'];
// 5.5: which kinds of notice go where.
const DEPRECATION_KINDS = {
  root: ['version', 'profile', 'extension', 'collection', 'singleton', 'reason'],
  collection: ['field', 'filter', 'operator', 'value', 'sort', 'relation', 'include', 'count', 'max_limit', 'action', 'method', 'item_method'],
  singleton: ['field', 'method'],
};
// 1.1: the grammar of restep, without leading zeros.
const RESTEP_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)(-(draft|rc)\.(0|[1-9]\d*))?$/;
// 3: the grammar of names; a dotted path joins names, and its last segment may be a lowercase language tag.
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const isPath = (p) => { const segs = String(p).split('.'); return segs.every((x, i) => NAME.test(x) || (i > 0 && i === segs.length - 1 && TAG.test(x))); };
// 4.2: the members Restep defines in the root, a collection and a singleton; others start with x-.
const MEMBERS = {
  root: ['restep', 'version', 'profiles', 'extensions', 'batch', 'idempotency', 'events', 'status', 'collections', 'singletons', 'deprecations', 'reasons'],
  collection: ['path', 'parent', 'description', 'methods', 'item_methods', 'schemas', 'id_from', 'filter', 'named_filters', 'sort', 'collations',
    'max_limit', 'count', 'relations', 'language_maps', 'inherit', 'include_depth', 'sync', 'actions', 'deprecations'],
  singleton: ['path', 'description', 'methods', 'schemas', 'deprecations'],
};

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
  const linked = linkTargets(res, 'profile').filter((u) => u.startsWith(PROFILE)).map((u) => u.slice(PROFILE.length));
  if (!doc && res.status === 401) { // the root may ask for credentials (11.5): not a missing document
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
  serviceDoc(res, false);
  return { doc, res, ...discoveryRules(doc, res) };
}

// The rules of the text about the document itself, which need no request: on a server's document (res is the
// response that served it) and, with --schema discovery, on a file (res is null).
function discoveryRules(doc, res) {
  const v = RESTEP_VERSION.exec(doc.restep);
  check('discovery.version', null, !v ? `restep is ${JSON.stringify(doc.restep)}, which does not follow major.minor[-draft.N|-rc.N] without leading zeros`
    : v[1] !== '1' ? `restep is ${doc.restep}: not a Restep 1 document`
      : doc.version !== undefined && !/^[1-9]\d*$/.test(doc.version) ? `version is ${JSON.stringify(doc.version)}` : null, res);
  laterMinor = !!v && v[1] === '1' && Number(v[2]) > 0;
  knownText = KNOWN_TEXTS.includes(doc.restep);
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

  const colls = isObject(doc.collections) ? doc.collections : {};
  const typeProblems = [], opProblems = [], underscore = [], deprecations = [], syncProblems = [];
  for (const [name, c] of Object.entries(colls)) {
    if (!isObject(c)) continue;
    for (const [field, f] of Object.entries(isObject(c.filter) ? c.filter : {})) {
      if (!TYPES.includes(f?.type)) typeProblems.push(`${name}.${field}: type ${JSON.stringify(f?.type)}`);
      else if (f.type === 'enum' && !Array.isArray(f.values)) typeProblems.push(`${name}.${field}: enum without values`);
      const ops = Array.isArray(f?.ops) ? f.ops : [];
      if (!ops.length) opProblems.push(`${name}.${field}: no ops`);
      for (const op of ops) if (!OPS.includes(op)) opProblems.push(`${name}.${field}: operator ${op}`);
      if (f?.type === 'boolean' && ops.some((op) => !['eq', 'ne', 'null'].includes(op))) opProblems.push(`${name}.${field}: boolean with ${ops.join(', ')}`);
      if (field === 'id' && ops.some((op) => ['lt', 'le', 'gt', 'ge'].includes(op))) opProblems.push(`${name}.id: order operators (${ops.join(', ')}), but the order of ids is the server’s`);
      if (field.split('.').some((p) => p.startsWith('_'))) underscore.push(`${name}.${field}`);
    }
    for (const s of Array.isArray(c.sort) ? c.sort : []) if (String(s).startsWith('_')) underscore.push(`${name} sort ${s}`);
    if (c?.sync !== undefined && !(c.filter?.id?.ops ?? []).includes('in')) syncProblems.push(`${name} declares sync without id in filter with in`);
    for (const d of Array.isArray(c?.deprecations) ? c.deprecations : []) deprecations.push([name, d, 'collection']);
  }
  // 10: reported like the other declarations, where some collection declares sync.
  if (Object.values(colls).some((c) => c?.sync !== undefined)) check('discovery.sync-id', null, syncProblems.join('; ') || null, res);
  for (const d of Array.isArray(doc.deprecations) ? doc.deprecations : []) deprecations.push([null, d, 'root']);
  const singles = isObject(doc.singletons) ? doc.singletons : {};
  for (const [name, sg] of Object.entries(singles)) for (const d of Array.isArray(sg?.deprecations) ? sg.deprecations : []) deprecations.push([name, d, 'singleton']);
  checkDeclarations(doc, colls, singles, extensions, res);
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
  // 6.1: named_filters, where some collection declares it.
  const withNamed = Object.entries(colls).filter(([, c]) => c?.named_filters !== undefined);
  if (withNamed.length) {
    const problems = withNamed.flatMap(([name, c]) => {
      if (!isObject(c.named_filters)) return [`${name}.named_filters is not an object`];
      return Object.entries(c.named_filters).flatMap(([f, d]) => {
        if (!isObject(d)) return [`${name}.named_filters.${f} is not an object`];
        const out = [];
        if (typeof d.description !== 'string' || !d.description) out.push(`${name}.named_filters.${f} has no description`);
        if (d.type !== undefined && !TYPES.includes(d.type)) out.push(`${name}.named_filters.${f}: type ${JSON.stringify(d.type)}`);
        if (d.type === 'enum' && (!Array.isArray(d.values) || !d.values.length)) out.push(`${name}.named_filters.${f}: enum without values`);
        if (f.includes('.')) out.push(`${name}.named_filters.${f} has a dot`);
        if (f.startsWith('_')) out.push(`${name}.named_filters.${f} starts with _`);
        if (isObject(c.filter) && Object.hasOwn(c.filter, f)) out.push(`${name}.${f} is both a filter and a named filter`);
        return out;
      });
    });
    check('discovery.named-filters', null, problems.join('; ') || null, res);
  }
  // 11.6: inherit, where some collection declares it.
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
    else if (!(Number.isInteger(ttl) && ttl >= 86400)) record('discovery.idempotency-ttl', 'fail', null, `idempotency.ttl is ${ttl}: keys MUST last at least 86400 seconds`, res && evidence(res), 'MUST');
    else pass('discovery.idempotency-ttl', null, `${ttl} s`);
  }
  const depProblems = deprecations.flatMap(([coll, d, at]) => {
    const where = coll ? `${coll}: ` : '';
    if (!isObject(d)) return [`${where}${JSON.stringify(d)} is not an object`];
    const p = [];
    const all = Object.values(DEPRECATION_KINDS).flat();
    if (!all.includes(d.kind)) { if (!laterMinor) p.push(`${where}kind ${JSON.stringify(d.kind)}`); return p; } // 4.2: a later minor may add kinds
    if (!DEPRECATION_KINDS[at].includes(d.kind)) p.push(`${where}a ${d.kind} notice does not go in the ${at === 'root' ? 'root' : at}`);
    if (typeof d.name !== 'string' && !['version', 'count'].includes(d.kind)) p.push(`${where}${d.kind} without name`);
    if (d.kind === 'operator' && !OPS.includes(d.op)) p.push(`${where}operator notice without a valid op`);
    if (d.kind === 'value' && d.value === undefined) p.push(`${where}value notice without value`);
    if (d.kind === 'max_limit' && !Number.isInteger(d.value)) p.push(`${where}max_limit notice without a numeric value`);
    if (d.kind === 'count' && d.value !== undefined && d.value !== 'estimated') p.push(`${where}count notice with value ${JSON.stringify(d.value)}`);
    if (typeof d.announced !== 'string' || !DATETIME.test(d.announced)) p.push(`${where}announced ${JSON.stringify(d.announced)} is not an RFC 3339 instant`);
    if (d.sunset !== undefined && !DATETIME.test(d.sunset)) p.push(`${where}sunset ${JSON.stringify(d.sunset)} is not RFC 3339`);
    return p;
  });
  if (deprecations.length) check('discovery.deprecations', null, depProblems.join('; ') || null, res);
  return { deprecations, singletons: singles };
}

// 6.1: what filter and sort may declare, from the declarations alone. On a server, checkQuery reports these
// with what the data adds (a field that holds a list); on a file, staticQueryRules does.
const declaredKeys = (c) => [...Object.keys(isObject(c?.filter) ? c.filter : {}).map((f) => ['filter', f]),
  ...(Array.isArray(c?.sort) ? c.sort : []).map((f) => ['sort', String(f)])];
function toManyProblems(colls, c) {
  const out = [];
  for (const k of [...new Set(declaredKeys(c).map(([, k]) => k))]) {
    let col = c;
    for (const seg of k.split('.').slice(0, -1)) {
      const r = isObject(col?.relations) ? col.relations[seg] : undefined;
      if (!r) break;
      if (r.many) { out.push(`${k} goes through the to-many relationship ${seg}`); break; }
      col = typeof r.to === 'string' ? colls[r.to] : undefined;
    }
    // The id of a subcollection's item identifies it only under its parent.
    if (k.endsWith('.id') && typeof col?.path === 'string' && col.path.includes('{')) out.push(`${k} ends in the id of an item of the subcollection ${k.split('.').at(-2)}`);
  }
  return out;
}
const languageDeclProblems = (colls, c) => declaredKeys(c).flatMap(([where, path]) => {
  const why = languagePathProblem(colls, c, path);
  return why ? [`${where} ${path} ${why}`] : [];
});
function staticQueryRules(doc) {
  if (!(Array.isArray(doc.profiles) && doc.profiles.includes('query'))) return;
  const colls = isObject(doc.collections) ? doc.collections : {};
  for (const [name, c] of Object.entries(colls)) {
    if (!isObject(c)) continue;
    if (declaredKeys(c).length) check('query.filter.lists', name, toManyProblems(colls, c).join('; ') || null);
    const lp = languageDeclProblems(colls, c);
    if (languageMaps(c).length || lp.length) check('query.language.declared', name, lp.join('; ') || null);
  }
}

// 3, 4.2, 5.1, 5.9, 6.1, 11.6: what the declarations themselves must look like.
function checkDeclarations(doc, colls, singles, extensions, res) {
  // Names.
  const names = [];
  const name = (where, n) => { if (!NAME.test(String(n))) names.push(`${where} ${JSON.stringify(n)}`); };
  const path = (where, n) => { if (!isPath(n)) names.push(`${where} ${JSON.stringify(n)}`); };
  for (const [k, c] of Object.entries(colls)) {
    name('collection', k);
    if (!isObject(c)) continue;
    for (const f of Object.keys(isObject(c.filter) ? c.filter : {})) path(`${k} filter`, f);
    for (const f of Array.isArray(c.sort) ? c.sort : []) path(`${k} sort`, f);
    for (const f of Object.keys(isObject(c.collations) ? c.collations : {})) path(`${k} collation`, f);
    for (const f of Object.keys(isObject(c.named_filters) ? c.named_filters : {})) name(`${k} named filter`, f);
    for (const f of Object.keys(isObject(c.language_maps) ? c.language_maps : {})) name(`${k} language map`, f);
    for (const f of Object.keys(isObject(c.relations) ? c.relations : {})) name(`${k} relation`, f);
    for (const f of Object.keys(isObject(c.actions) ? c.actions : {})) name(`${k} action`, f);
    for (const [f, d] of Object.entries(isObject(c.inherit) ? c.inherit : {})) { name(`${k} inherited field`, f); if (typeof d?.own === 'string') name(`${k} own field`, d.own); }
  }
  for (const k of Object.keys(singles)) name('singleton', k);
  for (const k of Object.keys(isObject(doc.reasons) ? doc.reasons : {})) name('reason', k);
  check('discovery.names', null, names.length ? `names outside the grammar: ${names.slice(0, 5).join(', ')}` : null, res);

  // Members Restep does not define, unless a later minor version may have added them.
  if (!laterMinor) {
    const extra = [];
    const look = (where, o, known) => { for (const k of Object.keys(isObject(o) ? o : {})) if (!known.includes(k) && !k.startsWith('x-')) extra.push(`${where}${k}`); };
    look('', doc, MEMBERS.root);
    for (const [k, c] of Object.entries(colls)) look(`collections.${k}.`, c, MEMBERS.collection);
    for (const [k, c] of Object.entries(singles)) look(`singletons.${k}.`, c, MEMBERS.singleton);
    check('discovery.members', null, extra.length ? `members without x-: ${extra.slice(0, 5).join(', ')}` : null, res);
  }

  // id_from and collations.
  const withIdFrom = Object.entries(colls).filter(([, c]) => c?.id_from !== undefined);
  if (withIdFrom.length) check('discovery.id-from', null, withIdFrom.filter(([, c]) => !['server', 'client', 'either'].includes(c.id_from) && !(laterMinor && typeof c.id_from === 'string'))
    .map(([k, c]) => `${k}.id_from is ${JSON.stringify(c.id_from)}`).join('; ') || null, res);
  const withColl = Object.entries(colls).filter(([, c]) => c?.collations !== undefined);
  if (withColl.length) {
    const problems = withColl.flatMap(([k, c]) => {
      if (!isObject(c.collations)) return [`${k}.collations is not an object`];
      return Object.entries(c.collations).flatMap(([f, v]) => {
        const out = [];
        // 6.1: a string field of filter, or a sort key that holds strings (an enum of strings too).
        const t = c.filter?.[f]?.type;
        const strings = t === 'string' || (Array.isArray(c.sort) && c.sort.includes(f) && (t === undefined || t === 'enum' || t === 'string'));
        if (f === 'id') out.push(`${k}: id has the server’s order and no collation`);
        else if (!strings) out.push(`${k}.collations.${f} is not a string field of filter or sort`);
        if (!['codepoint', 'server'].includes(v) && !(laterMinor && typeof v === 'string')) out.push(`${k}.collations.${f} is ${JSON.stringify(v)}`);
        return out;
      });
    });
    check('discovery.collations', null, problems.join('; ') || null, res);
  }

  // Subcollections: a path with a template.
  const templated = Object.entries(colls).filter(([, c]) => typeof c?.path === 'string' && c.path.includes('{'));
  if (templated.length) {
    const problems = templated.flatMap(([k, c]) => {
      const vars = [...c.path.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
      const out = [];
      if (vars.some((x) => !/^[A-Za-z0-9_]+$/.test(x))) out.push(`${k}: ${c.path} has a variable that is not a simple string`);
      if (new Set(vars).size !== vars.length) out.push(`${k}: ${c.path} repeats a variable name`);
      const parent = typeof c.parent === 'string' ? colls[c.parent] : undefined;
      if (!parent) out.push(`${k} has a template path but no parent that is a declared collection`);
      else if (typeof parent.path === 'string' && !c.path.startsWith(`${parent.path}/{${vars.at(-1)}}`))
        out.push(`${k}: ${c.path} does not start with its parent’s path ${parent.path}, / and its last variable`);
      return out;
    });
    check('discovery.subcollections', null, problems.join('; ') || null, res);
  }

  // 9: relations, where some collection declares them.
  const withRels = Object.entries(colls).filter(([, c]) => c?.relations !== undefined);
  if (withRels.length) {
    const problems = withRels.flatMap(([k, c]) => {
      if (!isObject(c.relations)) return [`${k}.relations is not an object`];
      return Object.entries(c.relations).flatMap(([r, d]) => {
        if (!isObject(d)) return [`${k}.relations.${r} is not an object`];
        const to = Array.isArray(d.to) ? d.to : [d.to];
        return [
          ...(!to.length || to.some((x) => typeof x !== 'string' || !isObject(colls[x])) ? [`${k}.relations.${r}.to is ${JSON.stringify(d.to)}, not a declared collection or a list of them`] : []),
          ...['many', 'include'].filter((m) => d[m] !== undefined && typeof d[m] !== 'boolean').map((m) => `${k}.relations.${r}.${m} is not a boolean`),
        ];
      });
    });
    check('discovery.relations', null, problems.join('; ') || null, res);
  }

  // 11.1: actions, where some collection declares them.
  const withActions = Object.entries(colls).filter(([, c]) => c?.actions !== undefined);
  if (withActions.length) {
    const problems = withActions.flatMap(([k, c]) => {
      if (!isObject(c.actions)) return [`${k}.actions is not an object`];
      return Object.entries(c.actions).flatMap(([a, d]) => {
        if (!isObject(d)) return [`${k}.actions.${a} is not an object`];
        return [
          ...(a === 'changes' ? [`${k} declares an action named changes, which sync uses`] : []),
          ...(!['item', 'collection'].includes(d.on) && !(laterMinor && typeof d.on === 'string') ? [`${k}.actions.${a}.on is ${JSON.stringify(d.on)}`] : []),
          ...['safe', 'idempotent'].filter((m) => typeof d[m] !== 'boolean').map((m) => `${k}.actions.${a}.${m} is not a boolean`),
        ];
      });
    });
    check('discovery.actions', null, problems.join('; ') || null, res);
  }

  // Singletons.
  if (Object.keys(singles).length || doc.singletons !== undefined) {
    const problems = [];
    if (doc.singletons !== undefined && !isObject(doc.singletons)) problems.push('singletons is not an object');
    const template = (p) => new RegExp(`^${p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]*\\?\}/g, '[^/]+')}(/[^/]+)?$`);
    for (const [k, sg] of Object.entries(singles)) {
      if (!isObject(sg)) { problems.push(`singletons.${k} is not an object`); continue; }
      if (typeof sg.path !== 'string' || !sg.path.startsWith('/')) problems.push(`singletons.${k}.path is not an absolute path`);
      else if (/[{}]/.test(sg.path)) problems.push(`singletons.${k}.path is a template`);
      else {
        const clash = Object.entries(colls).find(([, c]) => typeof c?.path === 'string' && template(c.path).test(sg.path));
        if (clash) problems.push(`singletons.${k}.path ${sg.path} is a path the collection ${clash[0]} or its items could have`);
      }
      if (sg.methods !== undefined && (!Array.isArray(sg.methods) || sg.methods.some((m) => !['GET', 'PATCH'].includes(m)) || !sg.methods.includes('GET')))
        problems.push(`singletons.${k}.methods ${JSON.stringify(sg.methods)} is not GET with, perhaps, PATCH`);
      if (sg.description !== undefined && (typeof sg.description !== 'string' || !sg.description)) problems.push(`singletons.${k}.description is not a non-empty string`);
      if (sg.schemas !== undefined && (!isObject(sg.schemas) || Object.entries(sg.schemas).some(([s2, v2]) => ['item', 'update'].includes(s2) && !isSchemaRef(v2))))
        problems.push(`singletons.${k}.schemas is not item and update schemas or links`);
    }
    check('discovery.singletons', null, problems.join('; ') || null, res);
  }

  // 11.6: inherit only with the extension announced.
  const inheriting = Object.entries(colls).filter(([, c]) => c?.inherit !== undefined).map(([k]) => k);
  if (inheriting.length && !extensions.includes('inherit'))
    bad('discovery.inherit', null, `${inheriting.join(', ')} declare inherit, but extensions does not list inherit`, res);
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
// 4.3: a declared list is exact. Where it leaves out GET, HEAD goes with it: both give 405, and the Allow lists
// every declared method and not HEAD, which that resource does not serve.
const NO_GET = (key) => `${key} leaves out GET (4.3)`;
const getsItems = (c) => !Array.isArray(c?.item_methods) || c.item_methods.includes('GET');
async function checkLeftOut(target, u, declared) {
  const problems = [];
  let last;
  for (const method of ['GET', 'HEAD']) {
    last = await http(method, u);
    const allow = last.headers.has('allow') ? last.headers.get('allow').split(',').map((m) => m.trim().toUpperCase()) : null;
    const why = last.status !== 405 ? `${method} got ${last.status}${last.data?.code ? ` ${last.data.code}` : ''}, expected 405`
      : !allow ? `${method}: 405 without Allow`
        : allowProblem(last, declared) ? `${method}: ${allowProblem(last, declared)}`
          : allow.includes('HEAD') ? `${method}: Allow: ${last.headers.get('allow')} lists HEAD, which gives 405` : null;
    if (why) { problems.push(why); problems.ev ??= last; }
  }
  check('core.methods.left-out', target, problems.join('; ') || null, problems.ev ?? last, `declared ${declared.join(', ') || 'none'}`);
}
async function loadSchema(v) {
  if (isObject(v)) return v;
  if (typeof v !== 'string') return null;
  const res = await http('GET', new URL(v, root).href, { schema: true });
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

// 5.9: each declared singleton. POST and DELETE go with a reserved parameter: 405 comes before 400 (5.4),
// and a server that took them would answer 400 to the parameter without any effect.
async function checkSingletons(singles) {
  for (const [name, sg] of Object.entries(singles)) {
    if (!isObject(sg) || typeof sg.path !== 'string' || /[{}]/.test(sg.path) || sg.parent !== undefined) continue; // 5.9: ignored by clients
    const url = resolvePath(sg.path);
    const target = `singleton ${name}`;
    const get = await http('GET', url, { headers: { 'accept-encoding': 'identity' } });
    const head = await http('HEAD', url);
    check('core.singleton', target, get.status !== 200 ? `GET got ${get.status}${get.data?.code ? ` ${get.data.code}` : ''}` : !isObject(get.data) ? 'GET did not give a JSON object'
      : head.status !== 200 ? `HEAD got ${head.status}` : null, get.status !== 200 ? get : head);
    if (get.status !== 200) continue;
    const P = 'filter[restep_check]';
    const problems = [];
    let last;
    for (const method of ['POST', 'DELETE']) {
      last = await http(method, withQuery(url, [[P, '1']]), method === 'POST' ? { json: {} } : {});
      if (last.status !== 405) { problems.push(`${method} got ${last.status}${last.data?.code ? ` ${last.data.code}` : ''}, expected 405`); problems.ev ??= last; }
      else if (Array.isArray(sg.methods)) { const why = allowProblem(last, sg.methods); if (why) { problems.push(why); problems.ev ??= last; } }
    }
    check('core.singleton.methods', target, problems.join('; ') || null, problems.ev ?? last);
    const pp = [];
    let lp;
    lp = await http('GET', withQuery(url, [['include', 'restep_check']]));
    const why = problemMismatch(lp, 400, 'unsupported_parameter', 'include');
    if (why) { pp.push(`include: ${why}`); pp.ev ??= lp; }
    for (const p of ['filter[restep_check]', 'sort', 'limit']) {
      const r = await http('GET', withQuery(url, [[p, p === 'limit' ? '1' : 'restep_check']]));
      const w = problemMismatch(r, 400, 'unsupported_parameter', p);
      if (w) { pp.push(`${p}: ${w}`); pp.ev ??= r; }
    }
    if (announced.includes('query')) {
      const field = Object.keys(get.data).find((k) => k !== 'id' && !k.startsWith('_'));
      if (field) {
        lp = await http('GET', withQuery(url, [['fields', field]]));
        const extra = Object.keys(lp.data ?? {}).filter((k) => k !== field && k !== 'id' && !k.startsWith('_'));
        if (lp.status !== 200) { pp.push(`fields=${field} got ${lp.status}`); pp.ev ??= lp; }
        else if (extra.length) { pp.push(`fields=${field} also carries ${extra.join(', ')}`); pp.ev ??= lp; }
      }
    }
    check('core.singleton.params', target, pp.join('; ') || null, pp.ev ?? lp);
    if (announced.includes('cache')) await checkCacheRead(target, url);
    if (announced.includes('writes')) await checkEtagMember(target, url, get, false);
    // A PATCH {} changes nothing (5.1), so it keeps the ETag; not where methods leaves PATCH out.
    if (!opts.writes) continue;
    if (Array.isArray(sg.methods) && !sg.methods.includes('PATCH')) { skip('core.singleton.patch', target, 'methods leaves out PATCH'); continue; }
    const tag = get.headers.get('etag');
    // 5.9 and 7.2: with writes, its PATCH evaluates If-Match against its ETag.
    const stale = announced.includes('writes') && tag ? await http('PATCH', url, { json: {}, headers: { ...MERGE, 'if-match': '"restep-check-stale"' } }) : null;
    const patch = await http('PATCH', url, { json: {}, headers: MERGE });
    const after = await http('GET', url, { headers: { 'accept-encoding': 'identity' } });
    const strip = (d) => Object.fromEntries(Object.entries(d ?? {}).filter(([k]) => !k.startsWith('_')));
    check('core.singleton.patch', target, patch.status === 405 && !Array.isArray(sg.methods) ? null
      : patch.status !== 200 ? `PATCH {} got ${patch.status}${patch.data?.code ? ` ${patch.data.code}` : ''}`
        : canonical(strip(patch.data)) !== canonical(strip(get.data)) ? 'PATCH {} did not return the whole representation'
          : tag && after.headers.get('etag') !== tag ? `PATCH {} changed the ETag from ${tag} to ${after.headers.get('etag')}`
            : stale && stale.status !== 412 ? `PATCH {} with a stale If-Match got ${stale.status}, expected 412` : null, stale && stale.status !== 412 ? stale : patch);
  }
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

// 4.2: one document for everyone, read twice and, given credentials, without them. 5.5: announced never changes.
const credentialed = () => Object.keys(opts.headers).length > 0;
const isPrivate = (r) => /\b(private|no-store)\b/i.test(r.headers.get('cache-control') ?? '');
async function checkDiscoverySame(disc) {
  const again = await http('GET', disc.res.url);
  const problems = [];
  if (again.status !== disc.res.status || canonical(again.data) !== canonical(disc.res.data)) problems.push('two reads gave different documents');
  if (credentialed()) {
    const anon = await http('GET', disc.res.url, { anonymous: true });
    if (anon.status === 401 || anon.status === 403) { if (!isPrivate(disc.res)) problems.push(`served only with credentials (${anon.status} without), but Cache-Control is ${disc.res.headers.get('cache-control') ?? '(none)'}`); }
    else if (canonical(anon.data) !== canonical(disc.res.data)) problems.push('the document without credentials differs from the one with them');
  }
  check('discovery.same', null, problems.join('; ') || null, again, credentialed() ? 'two reads, and without credentials' : 'two reads');
  const notices = (d) => {
    const out = new Map();
    const add = (where, list) => { for (const n of Array.isArray(list) ? list : []) if (isObject(n)) out.set(`${where} ${n.kind} ${n.name ?? ''} ${n.op ?? ''} ${JSON.stringify(n.value ?? null)}`, n.announced); };
    add('', d?.deprecations);
    for (const [k, c] of Object.entries(isObject(d?.collections) ? d.collections : {})) add(k, c?.deprecations);
    for (const [k, c] of Object.entries(isObject(d?.singletons) ? d.singletons : {})) add(`singleton ${k}`, c?.deprecations);
    return out;
  };
  const first = notices(disc.doc), second = notices(again.data);
  if (first.size) {
    const moved = [...first].filter(([k, a]) => second.has(k) && second.get(k) !== a).map(([k, a]) => `${k.trim()}: ${a} then ${second.get(k)}`);
    check('evolution.announced', null, moved.join('; ') || null, again, `${first.size} notices`);
  }
}

// 5.1: a response that depends on the credentials is private or no-store, whatever the profiles.
async function checkPrivate(ctx) {
  if (!credentialed()) return skip('core.private', null, 'no credentials given (--header)');
  const targets = [root.href, ...ctx.collections.slice(0, 3).flatMap((s) => [s.url, s.itemGet ? s.itemUrl : null].filter(Boolean))];
  const problems = [];
  let last, differ = 0;
  for (const u of targets) {
    const withCreds = last = await http('GET', u);
    const without = await http('GET', u, { anonymous: true });
    if (withCreds.status === without.status && canonical(withCreds.data) === canonical(without.data)) continue;
    differ++;
    if (!isPrivate(withCreds)) { problems.push(`${short(u)}: Cache-Control ${withCreds.headers.get('cache-control') ?? '(none)'}, though it changes without credentials`); problems.ev ??= withCreds; }
  }
  if (!differ) return skip('core.private', null, 'no response changed without the credentials');
  check('core.private', null, problems.join('; ') || null, problems.ev ?? last, `${differ} of ${targets.length} responses depend on the credentials`);
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
      if (Number.isInteger(c.max_limit)) out.push('limit'); // 6.4: without max_limit, limit is unsupported_parameter
      out.push('cursor');
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
  if (Array.isArray(c.methods) && !c.methods.includes('GET')) {
    // Nothing that lists it can be checked; what answers without GET still is.
    await checkLeftOut(name, url, c.methods);
    skip('core.collection.shape', name, `${NO_GET('methods')}: it cannot be listed, so nothing that needs its items is checked`);
    await checkCollectionPatch(name, c, url);
    return null;
  }
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

  // 11.6: inherited values as read, only with the extension announced (as actions): otherwise inherit is not
  // used (1.2), and discovery.inherit already reports the declaration.
  if (announced.includes('inherit') && inherited(c).length) {
    if (!knownText) skip('inherit.read', name, `inherit is experimental and the server declares ${currentDoc?.restep}, whose text this checker does not implement (1.2)`);
    else if (!full.items.length) skip('inherit.read', name, 'the collection is empty');
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
      check('inherit.read', name, e.slice(0, 3).join('; ') || null, first, `${inherited(c).map(([f]) => f).join(', ')} in ${full.items.length} items`);
    }
  }

  const sample = full.items[0];
  const itemUrl = sample ? `${url.replace(/\/$/, '')}/${encodeURIComponent(sample.id)}` : null;
  const itemGet = getsItems(c);
  let itemRes = null;
  if (sample && !itemGet) {
    await checkLeftOut(`${name}/{id}`, itemUrl, c.item_methods);
    skip('core.item.get', name, NO_GET('item_methods'));
  } else if (sample) {
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
      else if ((announced.includes('writes') || announced.includes('cache')) && last.headers.get('etag') !== base.headers.get('etag')) {
        problems.push(`Accept-Language: ${al} changed the ETag from ${base.headers.get('etag')} to ${last.headers.get('etag')}`); problems.ev ??= last;
      }
    }
    check('core.language.data', name, problems.slice(0, 3).join('; ') || null, problems.ev ?? last);
  }

  const missingUrl = `${url.replace(/\/$/, '')}/restep-check-${rand()}`;
  const missing = await http('GET', missingUrl);
  check('core.not-found', name, problemMismatch(missing, 404, 'not_found'), missing);
  // 3: ids are the same only code point by code point, so /books/07 is not /books/7.
  if (sample && typeof sample.id === 'string') {
    const other = /^\d+$/.test(sample.id) ? `0${sample.id}` : /[a-z]/.test(sample.id) ? sample.id.toUpperCase() : /[A-Z]/.test(sample.id) ? sample.id.toLowerCase() : null;
    if (!other) skip('core.not-found.id-form', name, `no other form of the id ${sample.id} to try`);
    else if (list.includes(other)) skip('core.not-found.id-form', name, `${other} is the id of another item`);
    else {
      const r = await http('GET', `${url.replace(/\/$/, '')}/${encodeURIComponent(other)}`);
      check('core.not-found.id-form', name, r.status === 200 && r.data?.id !== other ? `${other} answers 200 with the item ${JSON.stringify(r.data?.id)}`
        : r.status === 200 ? null : problemMismatch(r, 404, 'not_found'), r, `${other} for ${sample.id}`);
    }
  } else skip('core.not-found.id-form', name, 'the collection is empty');
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
    if (onItem && !itemGet) { skip(id, target, `${NO_GET('item_methods')}: a GET gives 405, which comes before 400`); continue; }
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
  // 5.3: bracketed forms Restep does not define, on a declared filter and on fields.
  const f0 = Object.entries(isObject(c.filter) ? c.filter : {}).find(([, d]) => Array.isArray(d?.ops) && d.ops.length);
  if (implemented(c, false).includes('filter') && f0) forms.push([`filter[${f0[0]}][${f0[1].ops[0]}][restep_check]`, '1']);
  if (implemented(c, false).includes('filter')) forms.push(['filter[]', '1']);
  if (implemented(c, false).includes('fields')) forms.push(['fields[]', 'id']);
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

  await checkCollectionPatch(name, c, url);

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

  return { name, c, url, full, first, sample, itemUrl, itemRes, types, itemGet };
}

// PATCH {} on a collection: 5.1 defines no PATCH there, so it changes nothing. Not sent where discovery declares it.
async function checkCollectionPatch(name, c, url) {
  if (Array.isArray(c.methods) && c.methods.includes('PATCH')) return skip('core.method-not-allowed', name, 'methods declares PATCH on the collection');
  const wrong = await http('PATCH', url, { json: '{}', headers: { 'content-type': 'application/merge-patch+json' } });
  check('core.method-not-allowed', name, wrong.status !== 405 ? `PATCH on a collection got ${wrong.status}`
    : !wrong.headers.has('allow') ? '405 without Allow' : null, wrong);
  if (Array.isArray(c.methods)) check('core.methods.allow', name, allowProblem(wrong, c.methods), wrong);
}

// 4.2 and 5.1: a subcollection is reached only under an item of its parent that exists.
async function checkSubcollection(s) {
  const { name, sub } = s;
  const missingParent = `restep-check-${rand()}`;
  const coll = resolvePath(sub.template.replace(/\{[^}]+\}/, missingParent));
  const a = await http('GET', coll);
  const b = s.sample ? await http('GET', `${coll}/${encodeURIComponent(s.sample.id)}`) : null;
  check('core.subcollection.parent', name, problemMismatch(a, 404, 'not_found') ?? (b && problemMismatch(b, 404, 'not_found') && `an item under it: ${problemMismatch(b, 404, 'not_found')}`),
    b && !problemMismatch(a, 404, 'not_found') ? b : a, `under ${sub.parent.name} ${missingParent}`);
}

// 5.1: a subcollection exists as long as its parent item does. On a parent item of our own, with an item
// of our own under it: once the parent is deleted, neither the subcollection nor that item answers.
async function checkSubcollectionDelete(s) {
  const id = 'core.subcollection.delete';
  const { name, sub } = s;
  const p = sub.parent;
  if ((Array.isArray(p.c.methods) && !p.c.methods.includes('POST')) || (Array.isArray(p.c.item_methods) && !p.c.item_methods.includes('DELETE')))
    return skip(id, name, `${p.name} does not take POST and DELETE`);
  const pr = await createNew(p);
  if (pr.status !== 201 || !pr.where) return conflicted(id, name, pr) || skip(id, name, `could not create an item in ${p.name}: ${evidence(pr)}`);
  const pid = pr.data?.id ?? decodeURIComponent(pr.where.split('/').pop());
  const subUrl = resolvePath(sub.template.replace(/\{[^}]+\}/, encodeURIComponent(pid)));
  const under = Object.create(s, { url: { value: subUrl } });
  const child = await createNew(under);
  if (child.status !== 201 || !child.where) return conflicted(id, name, child) || skip(id, name, `could not create an item under ${p.name} ${pid}: ${evidence(child)}`);
  const del = await http('DELETE', pr.where);
  if (del.status === 204) created.splice(created.indexOf(pr.where), 1);
  const gone = await http('GET', child.where), list = await http('GET', subUrl);
  check(id, name, del.status !== 204 && del.status !== 200 ? `deleting ${p.name} ${pid} got ${del.status}`
    : problemMismatch(gone, 404, 'not_found') ? `its item after the parent was deleted: ${problemMismatch(gone, 404, 'not_found')}`
      : problemMismatch(list, 404, 'not_found') ? `the subcollection after the parent was deleted: ${problemMismatch(list, 404, 'not_found')}` : null,
  problemMismatch(gone, 404, 'not_found') ? gone : list);
}

// ── actions (11.1) ────────────────────────────────────────────────────────────
const actionUrl = (base, name, colon = ':') => `${base.replace(/\/$/, '')}${colon}${name}`;
const declaredActions = (c) => Object.entries(isObject(c?.actions) ? c.actions : {}).filter(([, d]) => isObject(d) && ['item', 'collection'].includes(d.on));
// Without effect: undeclared actions and declared ones with the wrong method or on the wrong kind of
// resource are asked with GET (404 and 405 come first); GET actions are safe.
async function checkActionsRead(s) {
  const { name, c, url, itemUrl, full } = s;
  const acts = declaredActions(c);
  // _actions in the items read.
  const listed = full.items.filter(isObject).flatMap((it) => Object.entries(isObject(it._actions) ? it._actions : {}).map(([a, v]) => [it, a, v]));
  if (listed.length || acts.length) {
    const lp = listed.flatMap(([it, a, v]) => {
      const d = isObject(c.actions?.[a]) ? c.actions[a] : null;
      return !d ? [`${it.id}._actions.${a} is not declared`] : d.on !== 'item' ? [`${it.id}._actions.${a} is declared on ${d.on}`]
        : isObject(v) && v.method !== undefined && v.method !== (d.method ?? 'POST') ? [`${it.id}._actions.${a} says ${v.method}, declared ${d.method ?? 'POST'}`] : [];
    });
    if (!listed.length) skip('actions.listed', name, 'no item read lists _actions');
    else check('actions.listed', name, lp.slice(0, 3).join('; ') || null, s.first, `${listed.length} entries`);
  }
  if (!acts.length) return;
  const onItem = acts.filter(([, d]) => d.on === 'item'), onColl = acts.filter(([, d]) => d.on === 'collection');
  // Undeclared, and on the other kind of resource: 404.
  const up = [];
  let ul;
  const want404 = async (u, label) => { ul = await http('GET', u); const why = problemMismatch(ul, 404, 'not_found'); if (why) { up.push(`${label}: ${why}`); up.ev ??= ul; } };
  await want404(actionUrl(url, 'restep_check_undeclared'), 'an undeclared action on the collection');
  if (itemUrl) await want404(actionUrl(itemUrl, 'restep_check_undeclared'), 'an undeclared action on an item');
  if (onItem.length) await want404(actionUrl(url, onItem[0][0]), `${onItem[0][0]}, declared on items, on the collection`);
  if (onColl.length && itemUrl) await want404(actionUrl(itemUrl, onColl[0][0]), `${onColl[0][0]}, declared on the collection, on an item`);
  check('actions.undeclared', name, up.join('; ') || null, up.ev ?? ul);
  // Another method: 405 with Allow; and the colon as %3A.
  const target = (d) => (d.on === 'item' ? itemUrl : url);
  const post = acts.find(([, d]) => (d.method ?? 'POST') === 'POST' && target(d));
  const get = acts.find(([, d]) => d.method === 'GET' && target(d));
  const mp = [];
  let ml;
  const want405 = async (method, u, allowed, label) => {
    ml = await http(method, u, method === 'POST' ? { json: {} } : {});
    const allow = (ml.headers.get('allow') ?? '').split(',').map((x) => x.trim().toUpperCase());
    if (ml.status !== 405) { mp.push(`${label}: got ${ml.status}${ml.data?.code ? ` ${ml.data.code}` : ''}, expected 405`); mp.ev ??= ml; }
    else if (!allow.includes(allowed)) { mp.push(`${label}: Allow ${ml.headers.get('allow') ?? '(none)'} leaves out ${allowed}`); mp.ev ??= ml; }
    return ml;
  };
  if (post) await want405('GET', actionUrl(target(post[1]), post[0]), 'POST', `GET ${post[0]}`);
  if (get) await want405('POST', actionUrl(target(get[1]), get[0]), 'GET', `POST ${get[0]}`);
  if (!post && !get) skip('actions.method', name, 'no action with a resource to ask');
  else check('actions.method', name, mp.join('; ') || null, mp.ev ?? ml);
  if (post) {
    const enc = await http('GET', actionUrl(target(post[1]), post[0], '%3A'));
    check('actions.colon', name, enc.status !== 405 ? `GET ${post[0]} with %3A got ${enc.status}${enc.data?.code ? ` ${enc.data.code}` : ''}, as with a colon 405` : null, enc);
  } else if (get) {
    const a = await http('GET', actionUrl(target(get[1]), get[0])), b = await http('GET', actionUrl(target(get[1]), get[0], '%3A'));
    check('actions.colon', name, b.status !== a.status ? `${get[0]} with %3A got ${b.status}, with a colon ${a.status}` : null, b);
  }
  // GET actions: GET and HEAD alike, with a success.
  const gets = acts.filter(([, d]) => d.method === 'GET' && target(d));
  if (gets.length) {
    const gp = [];
    let gl;
    for (const [a, d] of gets) {
      const g = gl = await http('GET', actionUrl(target(d), a)), h = await http('HEAD', actionUrl(target(d), a));
      if (![200, 201, 204].includes(g.status)) gp.push(`GET ${a} got ${g.status}${g.data?.code ? ` ${g.data.code}` : ''}`);
      else if (h.status !== g.status) gp.push(`HEAD ${a} got ${h.status}, GET ${g.status}`);
    }
    check('actions.get', name, gp.join('; ') || null, gl);
  }
}
// A body that an input schema accepts, from its required members, or null if it cannot build one.
async function inputBody(d) {
  const schema = d.input === undefined ? null : await loadSchema(d.input);
  if (!schema) return {};
  const body = {};
  for (const k of Array.isArray(schema.required) ? schema.required : []) {
    const p = schema.properties?.[k] ?? {};
    if (p.default !== undefined) body[k] = p.default;
    else if (Array.isArray(p.enum)) body[k] = p.enum[0];
    else if (p.type === 'integer' || p.type === 'number') body[k] = Math.max(1, p.minimum ?? 1);
    else if (p.type === 'string' && !p.pattern && !p.format) body[k] = `restep-check-${rand()}`;
    else if (p.type === 'boolean') body[k] = true;
    else return null;
  }
  return body;
}
// On an item of our own: the POST actions declared on items.
async function checkActionsWrites(s, item) {
  const { name, c } = s;
  const acts = declaredActions(c).filter(([, d]) => d.on === 'item' && (d.method ?? 'POST') === 'POST');
  if (!acts.length) return;
  const ep = [], rp = [], kp = [];
  let el, rl, kl, ran = 0, keyed = 0;
  for (const [a, d] of acts) {
    const u = actionUrl(item, a);
    // An empty body and {}: the same answer (an action with required input gives the same 422 to both).
    const e1 = el = await http('POST', u, { body: new Uint8Array(0) });
    const e2 = await http('POST', u, { json: {} });
    if (e1.status !== e2.status) { ep.push(`${a}: an empty body got ${e1.status}${e1.data?.code ? ` ${e1.data.code}` : ''}, {} got ${e2.status}`); ep.ev ??= e1; }
    // A body its input accepts: 200 with the item, 201 with Location, or 204.
    const body = await inputBody(d);
    if (!body) continue;
    const r = rl = await http('POST', u, { json: body });
    if (r.status === 201 && r.headers.get('location')) ownItem(new URL(r.headers.get('location'), r.url).href, name);
    ran++;
    if (r.status === 409) continue; // 11.1: the item's state may not allow it
    if (!(r.status === 200 && isObject(r.data)) && !(r.status === 201 && r.headers.has('location')) && !(r.status === 204 && !r.size))
      { rp.push(`${a} with ${JSON.stringify(body)} got ${r.status}${r.data?.code ? ` ${r.data.code}` : ''}`); rp.ev ??= r; }
    // 11.1: an idempotent action does not reject a well-formed key.
    if (d.idempotent === true && announced.includes('writes')) {
      keyed++;
      const k = kl = await http('POST', u, { json: body, headers: { 'idempotency-key': `"restep-check-${rand()}"` } });
      if (k.status !== r.status && !(k.status >= 200 && k.status < 300 && r.status >= 200 && r.status < 300))
        { kp.push(`${a} with a well-formed Idempotency-Key got ${k.status}${k.data?.code ? ` ${k.data.code}` : ''}, without it ${r.status}`); kp.ev ??= k; }
    }
  }
  check('actions.empty-body', name, ep.join('; ') || null, ep.ev ?? el);
  if (!ran) skip('actions.response', name, 'could not build a body from any action’s input');
  else check('actions.response', name, rp.join('; ') || null, rp.ev ?? rl);
  if (!announced.includes('writes')) skip('actions.idempotency-key', name, 'the server does not announce writes');
  else if (!keyed) skip('actions.idempotency-key', name, 'no idempotent action on items that could be run');
  else check('actions.idempotency-key', name, kp.join('; ') || null, kp.ev ?? kl);
}

// ── relations (9) ─────────────────────────────────────────────────────────────
const relTargets = (d) => (Array.isArray(d?.to) ? d.to : [d?.to]);
const isSubColl = (name) => typeof currentDoc?.collections?.[name]?.path === 'string' && currentDoc.collections[name].path.includes('{');
// What is wrong with the value of relationship r in an item, by 3 and 9.
function linkProblems(it, r, d) {
  const v = it[r], out = [];
  if (v === undefined || v === null) return out;
  const many = d.many === true;
  if (many !== Array.isArray(v)) return [`${it.id}.${r} is ${JSON.stringify(v)}, not ${many ? 'a list' : 'an object or null'}`];
  for (const x of many ? v : [v]) {
    if (!isObject(x) || typeof x.id !== 'string') { out.push(`${it.id}.${r} has ${JSON.stringify(x)}, not an object with an id`); continue; }
    if (Array.isArray(d.to) && !d.to.includes(x.type)) out.push(`${it.id}.${r} {id: ${x.id}} has type ${JSON.stringify(x.type)}, not one of ${d.to.join(', ')}`);
    const target = Array.isArray(d.to) ? x.type : d.to;
    if (isSubColl(target) && typeof x.href !== 'string') out.push(`${it.id}.${r} {id: ${x.id}} points into the subcollection ${target} without href`);
  }
  return out;
}
async function checkRelations(s) {
  const { name, c, url, full } = s;
  const rels = Object.entries(isObject(c.relations) ? c.relations : {}).filter(([, d]) => isObject(d));
  if (!rels.length) return;
  const items = full.items.filter(isObject);
  // Objects with an id, type and href where they must.
  const op = items.flatMap((it) => rels.flatMap(([r, d]) => linkProblems(it, r, d)));
  if (!items.length) skip('relations.objects', name, 'the collection is empty');
  else check('relations.objects', name, op.slice(0, 3).join('; ') || null, s.first, `${rels.map(([r]) => r).join(', ')} in ${items.length} items`);

  // href to a subcollection's item: a GET answers that item.
  const readable = (d) => relTargets(d).every((t) => getsItems(currentDoc?.collections?.[t])); // 4.3: GET on the target's items
  const hrefs = items.flatMap((it) => rels.filter(([, d]) => relTargets(d).some(isSubColl) && readable(d))
    .flatMap(([r, d]) => [].concat(it[r] ?? []).filter((x) => isObject(x) && typeof x.href === 'string').map((x) => [r, x]))).slice(0, 3);
  if (rels.some(([, d]) => relTargets(d).some(isSubColl))) {
    if (!hrefs.length) skip('relations.href', name, rels.some(([, d]) => relTargets(d).some(isSubColl) && readable(d)) ? 'no relationship to a subcollection with a value' : `the target’s ${NO_GET('item_methods')}`);
    else {
      const hp = [];
      let last;
      for (const [r, x] of hrefs) {
        const why = checkLink(x.href);
        if (why) { hp.push(`${r}: ${why}`); continue; }
        last = await http('GET', new URL(x.href, url).href);
        if (last.status !== 200 || last.data?.id !== x.id) hp.push(`${r} href ${x.href} gives ${last.status}${last.data?.id !== undefined ? ` with id ${JSON.stringify(last.data.id)}` : ''}, not the item ${x.id}`);
        else if (!new URL(x.href, url).pathname.endsWith(`/${encodeURIComponent(x.id)}`)) hp.push(`${r} href ${x.href} does not end in its id`);
      }
      check('relations.href', name, hp.join('; ') || null, last ?? s.first, `${hrefs.length} links`);
    }
  }

  // include fills each expandable relationship, in the collection and in an item.
  const expandable = rels.filter(([, d]) => d.include === true);
  const filled = (x) => isObject(x) && Object.keys(x).some((k) => !['id', 'type', 'href'].includes(k));
  if (!expandable.length) skip('relations.include', name, 'no relationship declares include');
  else {
    const ip = [];
    let last;
    for (const [r, d] of expandable) {
      const sample = items.find((it) => [].concat(it[r] ?? []).length);
      if (!sample) continue;
      for (const u of [withQuery(url, [['include', r]]), ...(s.itemGet ? [withQuery(`${url.replace(/\/$/, '')}/${encodeURIComponent(sample.id)}`, [['include', r]])] : [])]) {
        last = await http('GET', u);
        const got = isCollection(last.data) ? last.data.items.find((x) => x?.id === sample.id) : last.data;
        if (last.status !== 200 || !isObject(got)) { ip.push(`include=${r}: got ${last.status}${last.data?.code ? ` ${last.data.code}` : ''}`); ip.ev ??= last; break; }
        const before = [].concat(sample[r]), after = [].concat(got[r] ?? []);
        if (after.length !== before.length || after.some((x, i) => !filled(x) || x.id !== before[i]?.id)) { ip.push(`include=${r}: ${sample.id}.${r} is ${JSON.stringify(got[r]).slice(0, 80)}, not filled`); ip.ev ??= last; break; }
      }
    }
    if (!last) skip('relations.include', name, 'no item with a value in an expandable relationship');
    else check('relations.include', name, ip.join('; ') || null, ip.ev ?? last, expandable.map(([r]) => r).join(', '));
  }

  // include that must fail loudly: undeclared, not expandable, too deep.
  const depth = Number.isInteger(c.include_depth) ? c.include_depth : 1;
  const colls = isObject(currentDoc?.collections) ? currentDoc.collections : {};
  const chain = (d0, n) => { // a path of n expandable to-one relationships starting here, if there is one
    let col = c, path = [];
    for (let i = 0; i < n; i++) {
      const next = Object.entries(isObject(col?.relations) ? col.relations : {}).find(([, d]) => d?.include === true && typeof d.to === 'string');
      if (!next) return null;
      path.push(next[0]);
      col = colls[next[1].to];
    }
    return path.join('.');
  };
  const tries = [['restep_check_undeclared', 'an undeclared relationship']];
  const notExp = rels.find(([, d]) => d.include !== true);
  if (notExp) tries.push([notExp[0], 'a relationship not declared expandable']);
  const deep = chain(null, depth + 1);
  if (deep) tries.push([deep, `${depth + 1} levels, over include_depth ${depth}`]);
  const up = [];
  let ul;
  for (const [v, label] of tries) {
    ul = await http('GET', withQuery(url, [['include', v]]));
    const why = problemMismatch(ul, 400, 'unsupported_parameter', 'include');
    if (why) { up.push(`include=${v} (${label}): ${why}`); up.ev ??= ul; }
  }
  check('relations.include.unsupported', name, up.join('; ') || null, up.ev ?? ul);

  // include_depth: a dotted include fills the related item of the related item.
  if (depth >= 2) {
    const two = chain(null, 2);
    const [r1, r2] = two ? two.split('.') : [];
    const sample = two && items.find((it) => isObject(it[r1]));
    if (!s.itemGet) skip('relations.include.depth', name, NO_GET('item_methods'));
    else if (!sample) skip('relations.include.depth', name, 'no item with two levels of expandable relationships to follow');
    else {
      const res = await http('GET', withQuery(`${url.replace(/\/$/, '')}/${encodeURIComponent(sample.id)}`, [['include', two]]));
      const inner = res.data?.[r1]?.[r2];
      check('relations.include.depth', name, res.status !== 200 ? `include=${two} got ${res.status}${res.data?.code ? ` ${res.data.code}` : ''}`
        : !filled(res.data?.[r1]) ? `include=${two} did not fill ${r1}` : inner !== null && inner !== undefined && !filled(inner) ? `include=${two} did not fill ${r1}.${r2}` : null, res, two);
    }
  }

  // fields with a dotted path: invalid without include, a projection with it.
  if (announced.includes('query') && expandable.length && !s.itemGet) skip('relations.fields', name, NO_GET('item_methods'));
  else if (announced.includes('query') && expandable.length) {
    const [r, d] = expandable.find(([x]) => items.some((it) => isObject(it[x]))) ?? expandable[0];
    const sample = items.find((it) => isObject(it[r]));
    const full2 = sample && (await http('GET', withQuery(`${url.replace(/\/$/, '')}/${encodeURIComponent(sample.id)}`, [['include', r]]))).data?.[r];
    const field = isObject(full2) && Object.keys(full2).find((k) => !['id', 'type', 'href'].includes(k) && !k.startsWith('_'));
    if (!field) skip('relations.fields', name, 'no included relationship with a field to project');
    else {
      const u = `${url.replace(/\/$/, '')}/${encodeURIComponent(sample.id)}`;
      const without = await http('GET', withQuery(u, [['fields', `${r}.${field}`]]));
      const withInc = await http('GET', withQuery(u, [['include', r], ['fields', `${r}.${field}`]]));
      const extra = Object.keys(isObject(withInc.data?.[r]) ? withInc.data[r] : {}).filter((k) => ![field, 'id', 'type', 'href'].includes(k) && !k.startsWith('_'));
      check('relations.fields', name, problemMismatch(without, 400, 'invalid_parameter', 'fields') ? `fields=${r}.${field} without include: ${problemMismatch(without, 400, 'invalid_parameter', 'fields')}`
        : withInc.status !== 200 ? `include=${r}&fields=${r}.${field} got ${withInc.status}`
          : !isObject(withInc.data?.[r]) || !(field in withInc.data[r]) ? `include=${r}&fields=${r}.${field} did not carry ${r}.${field}`
            : extra.length ? `include=${r}&fields=${r}.${field}: ${r} also carries ${extra.join(', ')}` : null,
      problemMismatch(without, 400, 'invalid_parameter', 'fields') ? without : withInc, `${r}.${field}`);
    }
  }
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
// 6.1: named filters. Their meaning is only in their description, so the checker cannot know which
// items they return: it checks that they narrow, combine with AND and fail loudly.
const NAMED_SAMPLE = { string: 'a', integer: '1', number: '1', decimal: '1', boolean: 'true', date: '2026-01-01',
  datetime: '2026-01-01T00:00:00Z', duration: 'PT1H' };
const NAMED_WRONG = { integer: '1.5', number: 'abc', decimal: '1e3', boolean: 'maybe', date: '2026-13-45', datetime: '2026-11-19', duration: 'ninety' };
const namedParam = (f, d) => [`filter[${f}]`, !d?.type ? '' : d.type === 'enum' ? String(d.values?.[0] ?? '') : NAMED_SAMPLE[d.type]];
async function checkNamedFilters(s, filters) {
  const { name, c, url, full } = s;
  const named = isObject(c.named_filters) ? Object.entries(c.named_filters).filter(([f, d]) => isObject(d) && !f.includes('.')) : [];
  if (!named.length) return;
  const all = ids(full.items);
  const results = {};
  const problems = [];
  let last;
  for (const [f, d] of named) {
    const param = namedParam(f, d);
    if (param[1] === undefined) continue;
    const got = await traverse(withQuery(url, [param]));
    last = got.error ?? got.pages[0];
    if (got.error) { problems.push(`${param[0]}${param[1] ? `=${param[1]}` : ''}: got ${got.error.status}${got.error.data?.code ? ` ${got.error.data.code}` : ''}`); problems.ev ??= got.error; continue; }
    results[f] = ids(got.items);
    const extra = full.complete ? results[f].filter((id) => !all.includes(id)) : [];
    if (extra.length) { problems.push(`${param[0]} returned ${extra.slice(0, 5).join(', ')}, not in the unfiltered collection`); problems.ev ??= got.pages[0]; }
  }
  if (!full.complete && !problems.length) skip('query.named-filter.narrows', name, 'the collection is larger than --max-items');
  else check('query.named-filter.narrows', name, problems.join('; ') || null, problems.ev ?? last, `${named.length} named filters`);

  // AND with a declared filter: the intersection of both results.
  const ready = named.find(([f]) => results[f]);
  const eq = Object.keys(filters).find((f) => filters[f]?.ops?.includes('eq') && full.items.some((it) => !blank(get(it, f))));
  if (ready && eq) {
    const raw = toRaw(full.items.map((it) => get(it, eq)).find((v) => !blank(v)));
    const alone = await traverse(withQuery(url, [[`filter[${eq}]`, raw]]));
    const both = await traverse(withQuery(url, [namedParam(...ready), [`filter[${eq}]`, raw]]));
    const err = alone.error ?? both.error;
    const want = alone.error ? [] : ids(alone.items).filter((id) => results[ready[0]].includes(id));
    check('query.named-filter.and', name, err ? `got ${err.status}${err.data?.code ? ` ${err.data.code}` : ''}` : setDiff(ids(both.items), want),
      err ?? both.pages[0], `filter[${ready[0]}] and filter[${eq}]=${raw}`);
  } else skip('query.named-filter.and', name, ready ? 'no declared filter with eq and a value to combine with' : 'no named filter answered');

  const [f0, d0] = named[0];
  const op = await http('GET', withQuery(url, [[`filter[${f0}][eq]`, namedParam(f0, d0)[1] || 'true']]));
  check('query.named-filter.operator', name, problemMismatch(op, 400, 'unsupported_parameter', `filter[${f0}][eq]`), op);

  const invalid = [];
  const tryInvalid = async (params, label) => {
    last = await http('GET', withQuery(url, params));
    const why = problemMismatch(last, 400, 'invalid_parameter');
    if (why) { invalid.push(`${label}: ${why}`); invalid.ev ??= last; }
  };
  const sw = named.find(([, d]) => d.type === undefined);
  if (sw) await tryInvalid([[`filter[${sw[0]}]`, 'restep-check']], `switch filter[${sw[0]}]=restep-check`);
  const typed = named.find(([, d]) => d.type !== undefined);
  if (typed) await tryInvalid([[`filter[${typed[0]}]`, '']], `filter[${typed[0]}] without a value`);
  const wrong = named.find(([, d]) => NAMED_WRONG[d.type]);
  if (wrong) await tryInvalid([[`filter[${wrong[0]}]`, NAMED_WRONG[wrong[1].type]]], `filter[${wrong[0]}]=${NAMED_WRONG[wrong[1].type]}`);
  const p0 = namedParam(f0, d0);
  if (p0[1] !== undefined) await tryInvalid([p0, p0], `filter[${f0}] twice`);
  check('query.named-filter.bad-value', name, invalid.join('; ') || null, invalid.ev ?? last);
}
async function checkQuery(s, ctx) {
  const { name, c, url, full, types } = s;
  const filters = isObject(c.filter) ? c.filter : {};
  // 6.1 and 9: a filter through a to-one relationship (author.name) compares the related item's field, which
  // the items carry only with include. Without an expandable relationship there is no local expectation.
  const relOf = (f) => (f.includes('.') && isObject(c.relations?.[f.split('.')[0]]) ? c.relations[f.split('.')[0]] : null);
  const viaRel = Object.keys(filters).filter((f) => relOf(f) && !f.endsWith('.id'));
  const opaque = new Set(viaRel.filter((f) => relOf(f).include !== true || !announced.includes('relations')));
  const expandRels = [...new Set(viaRel.filter((f) => !opaque.has(f)).map((f) => f.split('.')[0]))];
  let all = full.items;
  if (expandRels.length && full.complete) {
    const rich = await traverse(withQuery(url, [['include', expandRels.join(',')]]));
    if (rich.complete && rich.items.length === all.length) all = rich.items;
  }
  const complete = full.complete;
  const sorts = Array.isArray(c.sort) ? c.sort : [];
  const maxLimit = Number.isInteger(c.max_limit) ? c.max_limit : null;
  // 6.1: a field with the collation "server" compares and sorts as the server does: no local expectation.
  const serverCollated = (f) => isObject(c.collations) && Object.hasOwn(c.collations, f) && c.collations[f] !== 'codepoint';

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
      if ((op !== 'null' && serverCollated(field)) || opaque.has(field)) continue;
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
          const leaked = got.items.filter((it) => blank(get(all.find((x) => x?.id === it.id) ?? it, field))).map((it) => it.id);
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
  await checkNamedFilters(s, filters);

  // Sorting.
  if (sorts.length) {
    const problems = [];
    let last;
    for (const key of sorts) {
      const type = types[key] ?? (all.every((it) => blank(get(it, key)) || typeof get(it, key) === 'number') ? 'number' : 'string');
      const ordered = !serverCollated(key); // with "server", only missing values last
      for (const desc of [false, true]) {
        const got = await traverse(withQuery(url, [['sort', `${desc ? '-' : ''}${key}`]]));
        last = got.pages.at(-1);
        if (got.error) { problems.push(`sort=${desc ? '-' : ''}${key}: got ${got.error.status}`); problems.ev ??= last; continue; }
        const vals = got.items.map((it) => get(it, key));
        for (let i = 1; i < vals.length; i++) {
          const a = vals[i - 1], b = vals[i];
          if (blank(a) && !blank(b)) { problems.push(`sort=${desc ? '-' : ''}${key}: a missing value comes before ${JSON.stringify(b)}`); problems.ev ??= last; break; }
          if (blank(a) || blank(b) || !ordered) continue;
          const d = cmp(type, norm(type, a) ?? a, norm(type, b) ?? b);
          if (desc ? d < 0 : d > 0) { problems.push(`sort=${desc ? '-' : ''}${key}: ${JSON.stringify(a)} before ${JSON.stringify(b)}`); problems.ev ??= last; break; }
        }
      }
    }
    check('query.sort.order', name, problems.slice(0, 5).join('; ') || null, problems.ev ?? last, `${sorts.length} keys, both ways`);

    const ties = (key) => { const v = all.map((it) => JSON.stringify(get(it, key))); return v.length - new Set(v).size; };
    const key = [...sorts].sort((a, b) => ties(b) - ties(a))[0];
    // One item per page, twice: ties broken at random show up as repeats, gaps or another order. Without
    // max_limit, limit gives unsupported_parameter (6.4): then the server's own page size.
    const pageUrl = withQuery(url, [['sort', key], ...(maxLimit === null ? [] : [['limit', '1']])]);
    const got = await traverse(pageUrl, Math.max(opts.maxItems, all.length + 1));
    const twice = got.error ? null : await traverse(pageUrl, Math.max(opts.maxItems, all.length + 1));
    const rep = dupes(ids(got.items));
    check('query.sort.stable', name, got.error ? `got ${got.error.status}` : rep.length ? `repeated across pages: ${rep.join(', ')}`
      : complete && got.complete && setDiff(ids(got.items), ids(all)) ? setDiff(ids(got.items), ids(all))
        : ids(twice.items).join() !== ids(got.items).join() ? 'two traversals with the same sort returned different orders' : null,
    got.error ?? got.pages.at(-1), `sort=${key}, ${maxLimit === null ? 'the server\'s page size (no max_limit)' : 'limit=1'}`);
    const undeclared = await http('GET', withQuery(url, [['sort', 'restep_check_undeclared']]));
    check('query.sort.undeclared', name, problemMismatch(undeclared, 400, 'unsupported_parameter', 'sort'), undeclared);
  }

  // 6.1: translations are filtered and sorted only as field.tag of the collection's own maps.
  const maps = languageMaps(c);
  const colls = isObject(ctx.doc?.collections) ? ctx.doc.collections : {};
  const pathProblems = languageDeclProblems(colls, c);
  if (maps.length || pathProblems.length) check('query.language.declared', name, pathProblems.join('; ') || null, s.first);
  const translations = [...new Set(declaredKeys(c).map(([, p]) => p))].filter((p) => {
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
    const item = s.itemGet ? await http('GET', withQuery(s.itemUrl, [['fields', sampleKeys.join(',')]])) : coll;
    if (!s.itemGet) { /* 4.3: its items take no GET, so fields is tried on the collection only */ }
    else if (item.status !== 200) problems.push(`item: got ${item.status}`);
    else if (extra(item.data).length) problems.push(`the item carries ${extra(item.data).join(', ')}`);
    const onlyId = await http('GET', withQuery(url, [['fields', 'id']]));
    if (onlyId.status !== 200 || !isCollection(onlyId.data)) problems.push(`fields=id: got ${onlyId.status}${onlyId.data?.code ? ` ${onlyId.data.code}` : ''}`);
    else { const e = onlyId.data.items.flatMap((it) => Object.keys(it ?? {}).filter((k) => k !== 'id' && !k.startsWith('_'))); if (e.length) problems.push(`fields=id: items carry ${[...new Set(e)].join(', ')}`); }
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
  if (maxLimit === null) check('query.limit', name, problemMismatch(one, 400, 'unsupported_parameter', 'limit'), one, 'no max_limit declared');
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
      const reuse = async (label, base, extra, limit = true) => {
        last = await http('GET', withQuery(base, [...extra, ...(limit ? [['limit', '1']] : []), ['cursor', cursor]]));
        const why = problemMismatch(last, 400, 'invalid_parameter', 'cursor');
        if (why) { reused.push(`${label}: ${why}`); reused.ev ??= last; }
      };
      const otherSort = sorts.find((k) => k !== 'id') ?? (sorts.includes('id') ? '-id' : null);
      if (otherSort) await reuse(`with sort=${otherSort}`, url, [['sort', otherSort]]);
      const nf = Object.keys(filters).find((f) => filters[f].ops?.includes('null'));
      if (nf) await reuse(`with filter[${nf}][null]`, url, [[`filter[${nf}][null]`, 'false']]);
      const other = ctx.collections.find((o) => o.name !== name);
      if (other) await reuse(`on ${other.name}`, other.url, [], Number.isInteger(other.c?.max_limit)); // 6.4: limit only with max_limit
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
      skip(id, name, maxLimit === null ? 'no max_limit, so no limit=1' : 'fewer than two items: limit=1 gives no next page');
  }

  await checkQueryEncoding(s, filters, maxLimit);

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
    const off = await http('GET', withQuery(url, [['count', 'false']]));
    check('query.count.undeclared', name, problemMismatch(res, 400, 'unsupported_parameter', 'count')
      ?? (problemMismatch(off, 400, 'unsupported_parameter', 'count') && `count=false: ${problemMismatch(off, 400, 'unsupported_parameter', 'count')}`),
    problemMismatch(res, 400, 'unsupported_parameter', 'count') ? res : off);
  }
}

// 5.2, 5.3, 6.1: how the query is read, limits the server does not declare, and lists in filter or sort.
async function checkQueryEncoding(s, filters, maxLimit) {
  const { name, c, url, full } = s;
  const all = full.items;
  // 6.1: no list field, no path through a to-many relationship.
  const keys = [...new Set([...Object.keys(filters), ...(Array.isArray(c.sort) ? c.sort.map(String) : [])])];
  const colls = isObject(currentDoc?.collections) ? currentDoc.collections : {};
  const lp = [...keys.filter((k) => all.some((it) => Array.isArray(get(it, k)))).map((k) => `${k} holds a list`), ...toManyProblems(colls, c)];
  if (keys.length) check('query.filter.lists', name, lp.join('; ') || null, s.first);

  // 5.2: a + in the query is a space. A string filter with eq, or a named filter that takes a string.
  const words = (v) => typeof v === 'string' && /\S \S/.test(v);
  const strEq = Object.keys(filters).find((f) => filters[f]?.type === 'string' && filters[f].ops?.includes('eq') && !f.includes('.') && f !== 'id');
  const named = Object.entries(isObject(c.named_filters) ? c.named_filters : {}).find(([, d]) => d?.type === 'string');
  let key, value;
  if (strEq) { key = `filter[${strEq}]`; value = all.map((it) => get(it, strEq)).find(words) ?? 'restep check'; }
  else if (named) {
    key = `filter[${named[0]}]`;
    const text = all.flatMap((it) => Object.values(it ?? {})).find(words);
    value = text ? text.split(' ').slice(0, 2).join(' ').toLowerCase() : 'restep check';
  }
  if (!key) skip('query.plus', name, 'no string filter to try');
  else {
    const enc2 = (x) => encodeURIComponent(x).replace(/%5B/g, '[').replace(/%5D/g, ']');
    const a = await traverse(`${url}?${enc2(key)}=${value.split(' ').map(encodeURIComponent).join('+')}`);
    const b = await traverse(`${url}?${enc2(key)}=${value.split(' ').map(encodeURIComponent).join('%20')}`);
    const err = a.error ?? b.error;
    check('query.plus', name, err ? `got ${err.status}${err.data?.code ? ` ${err.data.code}` : ''}` : setDiff(ids(a.items), ids(b.items)), err ?? a.pages[0], `${key}=${value}`);
  }

  // 5.2: next encoded another way, or with its parameters reordered, is the same page.
  const fk = Object.keys(filters).find((f) => filters[f]?.ops?.includes('null')) ?? null;
  const sk = Array.isArray(c.sort) && c.sort.length ? String(c.sort[0]) : null; // two parameters that are not page ones, to reorder
  const base = withQuery(url, [...(fk ? [[`filter[${fk}][null]`, 'false']] : []), ...(sk ? [['sort', sk]] : []), ['limit', '1']]);
  let one = maxLimit === null ? null : await http('GET', base);
  if (one && fk && typeof one.data?.next !== 'string') one = await http('GET', withQuery(url, [...(sk ? [['sort', sk]] : []), ['limit', '1']]));
  if (!one || typeof one.data?.next !== 'string') skip('query.reencode', name, maxLimit === null ? 'no max_limit, so no limit=1' : 'limit=1 gives no next page');
  else {
    const next = new URL(one.data.next, one.url);
    const page = await http('GET', next.href);
    const pairs = [...next.searchParams].reverse();
    const other = `${next.origin}${next.pathname}?${pairs.map(([k, v]) => `${encodeURIComponent(k).replace(/%5B/g, '%5b')}=${encodeURIComponent(v)}`).join('&')}`;
    const again = await http('GET', other);
    check('query.reencode', name, again.status !== 200 ? `next reordered and encoded with %5b got ${again.status}${again.data?.code ? ` ${again.data.code}` : ''}`
      : ids(again.data?.items ?? []).join() !== ids(page.data?.items ?? []).join() ? 'next reordered and encoded with %5b gave another page' : null, again);
  }

  // 5.3: an in list of a thousand values: the whole result, invalid_parameter, 413 or 414; never part of it.
  const inField = Object.keys(filters).find((f) => filters[f]?.ops?.includes('in') && ['string', 'integer'].includes(filters[f]?.type));
  if (!inField) skip('query.limits', name, 'no string or integer filter with in');
  else if (!full.complete) skip('query.limits', name, 'the collection is larger than --max-items');
  else {
    const type = filters[inField].type;
    const real = [...new Set(all.map((it) => get(it, inField)).filter((v) => !blank(v)).map(toRaw))].filter((v) => !v.includes(','));
    const filler = Array.from({ length: 1000 }, (_, i) => (type === 'integer' ? String(900000000 + i) : `rc${i}`));
    const values = [...filler.slice(0, 500), ...real, ...filler.slice(500)];
    const k = `filter[${inField}][in]`;
    const got = await traverse(withQuery(url, [[k, values.join(',')]]));
    const r = got.error ?? got.pages[0];
    const want = all.filter((it) => matches(type, 'in', get(it, inField), values.join(','))).map((it) => it.id);
    if (r.status === 431) skip('query.limits', name, 'the HTTP server refused the request line with 431');
    else check('query.limits', name, [413, 414].includes(r.status) ? null
      : got.error ? problemMismatch(r, 400, 'invalid_parameter', k) : setDiff(ids(got.items), want), r, `${values.length} values`);
  }
}

// ── writes: the checks that only read ────────────────────────────────────────
async function checkWritesRead(s) {
  const { name, itemUrl } = s;
  await checkCollectionEtags(s);
  if (!itemUrl || !s.itemGet) { for (const id of ['writes.etag.strong', 'writes.etag.member']) skip(id, name, !itemUrl ? 'the collection is empty' : NO_GET('item_methods')); return; }
  const res = await http('GET', itemUrl, { headers: { 'accept-encoding': 'identity' } });
  const tag = res.headers.get('etag');
  check('writes.etag.strong', name, !tag ? 'no ETag' : tag.startsWith('W/') ? `weak ETag ${tag}` : null, res);
  await checkEtagMember(name, itemUrl, res, true);
}
// 7.2: every response whose body is one item carries the item ETag in _etag: full, under gzip, with fields.
async function checkEtagMember(target, itemUrl, res, item) {
  const tag = res.headers.get('etag');
  if (!tag) return skip('writes.etag.member', target, 'no ETag to compare with');
  const problems = [];
  let last = res;
  const look = (r, label) => { last = r; if (r.status !== 200) problems.push(`${label} got ${r.status}`); else if (r.data?._etag !== tag) problems.push(`${label}: _etag is ${JSON.stringify(r.data?._etag)}, the ETag is ${tag}`); };
  look(res, 'the full representation');
  look(await http('GET', itemUrl, { headers: { 'accept-encoding': 'gzip' } }), 'with Accept-Encoding: gzip');
  if (announced.includes('query')) {
    const field = Object.keys(res.data ?? {}).find((k) => k !== 'id' && !k.startsWith('_'));
    if (field) look(await http('GET', withQuery(itemUrl, [['fields', field]]), { headers: { 'accept-encoding': 'identity' } }), `fields=${field}`);
  }
  check('writes.etag.member', target, problems.join('; ') || null, last, item ? undefined : 'singleton');
}

// 8: the cache profile, on the first item of a collection or on a singleton.
async function checkCacheRead(target, itemUrl, why = 'the collection is empty') {
  if (!itemUrl) { for (const id of ['cache.etag', 'cache.if-none-match']) skip(id, target, why); return; }
  const res = await http('GET', itemUrl, { headers: { 'accept-encoding': 'identity' } });
  const tag = res.headers.get('etag');
  check('cache.etag', target, res.status !== 200 ? `got ${res.status}` : !tag ? 'no ETag'
    : announced.includes('writes') && tag.startsWith('W/') ? `weak ETag ${tag}, but with writes it is the item ETag` : null, res);
  if (!tag) return skip('cache.if-none-match', target, 'no ETag');
  const problems = [];
  let last;
  for (const [method, value] of [['GET', tag], ['GET', `W/${tag.replace(/^W\//, '')}`], ['HEAD', tag]]) {
    last = await http(method, itemUrl, { headers: { 'if-none-match': value } });
    if (last.status !== 304) { problems.push(`${method} with If-None-Match: ${value} got ${last.status}`); problems.ev ??= last; }
  }
  check('cache.if-none-match', target, problems.join('; ') || null, problems.ev ?? last);
}

// 7.2: whether the items of a collection take PATCH or DELETE: item_methods, or else Allow.
async function itemsWritable(s) {
  if (Array.isArray(s.c.item_methods)) return s.c.item_methods.includes('PATCH') || s.c.item_methods.includes('DELETE');
  const allowOf = (r) => (r?.headers.has('allow') ? r.headers.get('allow').split(',').map((m) => m.trim().toUpperCase()) : null);
  let allow = allowOf(s.itemRes);
  if (!allow) {
    // PATCH {} with a reserved parameter: 405 with Allow without PATCH, else 400 and no effect (5.3, 5.4).
    const r = await http('PATCH', withQuery(s.itemUrl, [['filter[restep_check]', '1']]), { json: '{}', headers: MERGE });
    if (r.status === 400) return true;
    if (r.status !== 405) return null;
    allow = allowOf(r) ?? [];
  }
  return allow.includes('PATCH') || allow.includes('DELETE');
}
// 7.2: listed items carry the item ETag in _etag (SHOULD); MUST where the collection declares sync (10).
// Compared with each item's own GET, identity.
async function checkCollectionEtags(s) {
  const id = 'writes.etag.collection';
  const { name, first, full } = s;
  if (!s.itemUrl) return skip(id, name, 'the collection is empty');
  if (!s.itemGet) return skip(id, name, `${NO_GET('item_methods')}: no item ETag to compare with`);
  const writable = await itemsWritable(s);
  if (writable === null) return skip(id, name, 'could not tell whether its items take PATCH or DELETE');
  if (!writable) return skip(id, name, 'its items take neither PATCH nor DELETE');
  const must = s.c.sync !== undefined; // 7.2 and 10: a collection that declares sync
  const fail = (message, res) => record(id, must ? 'fail' : 'warn', name, message, res && evidence(res), must ? 'MUST' : 'SHOULD');
  const lists = [first, ...full.pages.slice(1)].filter((p) => isCollection(p.data));
  // Also with fields, whatever the query parameters.
  const field = Object.keys(s.sample).find((k) => k !== 'id' && !k.startsWith('_'));
  if (announced.includes('query') && field) lists.push(await http('GET', withQuery(s.url, [['fields', field]])));
  for (const page of lists.filter((p) => isCollection(p.data))) {
    const without = page.data.items.filter((it) => isObject(it) && typeof it._etag !== 'string');
    if (without.length) return fail(`${without.length} of ${page.data.items.length} items carry no _etag (${without.slice(0, 3).map((it) => it.id).join(', ')})`, page);
  }
  // A difference may be a change in between: GET (E1), the listing, GET (E2). Only E1 ≠ E2 leaves it open.
  const tagOf = async (u) => (await http('GET', u, { headers: { 'accept-encoding': 'identity' } })).headers.get('etag');
  const problems = [];
  let compared = 0, open = 0, ev = first;
  for (const it of first.data.items.slice(0, 5)) {
    if (typeof it?.id !== 'string') continue;
    const u = `${s.url.replace(/\/$/, '')}/${encodeURIComponent(it.id)}`;
    const tag = await tagOf(u);
    if (!tag) continue;
    compared++;
    if (it._etag === tag) continue;
    const e1 = await tagOf(u);
    const again = await http('GET', first.url);
    const e2 = await tagOf(u);
    const listed = isCollection(again.data) ? again.data.items.find((x) => x?.id === it.id) : undefined;
    if (e1 !== e2 || !listed) { open++; continue; }
    if (listed._etag !== e1) { problems.push(`${it.id}: _etag ${JSON.stringify(listed._etag)}, its GET gives ${e1}`); ev = again; }
  }
  if (problems.length) return fail(problems.slice(0, 3).join('; '), ev);
  if (!compared) return skip(id, name, 'no item GET carried an ETag');
  if (open === compared) return skip(id, name, 'the items kept changing while being compared');
  pass(id, name, `${compared} items compared${must ? '; the collection declares sync, so MUST' : ''}`);
}

// ── Browser clients (5.8) ─────────────────────────────────────────────────────
// Only judged where a request with this Origin gets Access-Control-Allow-Origin for it.
const ORIGIN = 'https://restep-check.example';
const EXPOSABLE = ['etag', 'location', 'link', 'allow', 'accept-patch', 'retry-after', 'deprecation', 'sunset', 'idempotent-replayed',
  'preference-applied', 'accept-query'];
const CORS_CHECKS = ['core.cors.expose', 'core.cors.errors', 'core.cors.preflight', 'core.cors.vary', 'core.cors.credentials'];
const headerList = (res, name) => (res.headers.get(name) ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
async function checkCors(ctx) {
  const s = ctx.collections[0];
  if (!s) { for (const id of CORS_CHECKS) skip(id, null, 'no collection to ask'); return; }
  const { name } = s;
  const acao = (r) => (r.headers.get('access-control-allow-origin') ?? '').trim();
  const opens = (r) => acao(r) === ORIGIN || acao(r) === '*';
  const creds = (r) => (r.headers.get('access-control-allow-credentials') ?? '').trim().toLowerCase() === 'true';
  // * in a list counts only without credentials, and never covers Authorization (Fetch).
  const covers = (r, value, list) => { const l = headerList(r, list); return l.includes(value) || (l.includes('*') && !creds(r) && value !== 'authorization'); };
  const res = await http('GET', s.url, { headers: { origin: ORIGIN } });
  if (!opens(res)) {
    for (const id of CORS_CHECKS) skip(id, name, `a GET with Origin: ${ORIGIN} gets no Access-Control-Allow-Origin for it`);
    return;
  }
  const seen = [res];
  const extra = announced.includes('oauth') ? ['www-authenticate', 'dpop-nonce'] : []; // 11.5
  const want = [...EXPOSABLE, ...extra].filter((h) => res.headers.has(h));
  const hidden = want.filter((h) => !covers(res, h, 'access-control-expose-headers'));
  check('core.cors.expose', name, hidden.length ? `Access-Control-Expose-Headers: ${res.headers.get('access-control-expose-headers') ?? '(none)'} leaves out ${hidden.join(', ')}` : null,
    res, want.join(', '));

  const err = await http('GET', withQuery(s.url, [['$restep_check', '1']]), { headers: { origin: ORIGIN } });
  if (err.status !== 400) skip('core.cors.errors', name, `a $ parameter got ${err.status}, not 400`);
  else { seen.push(err); check('core.cors.errors', name, opens(err) ? null : 'no Access-Control-Allow-Origin for that origin on the 400', err); }

  // Preflights, without credentials: a POST to the collection and a PATCH to an item, with the headers Restep uses.
  const writes = announced.includes('writes');
  const auth = askedCredentials || announced.includes('oauth') ? ['authorization'] : [];
  const flights = [];
  if (!Array.isArray(s.c.methods) || s.c.methods.includes('POST'))
    flights.push(['POST', s.url, ['content-type', ...(writes ? ['idempotency-key'] : []), ...auth]]);
  if (!Array.isArray(s.c.item_methods) || s.c.item_methods.includes('PATCH'))
    flights.push(['PATCH', s.itemUrl ?? `${s.url.replace(/\/$/, '')}/restep-check-${rand()}`, ['content-type', ...(writes ? ['if-match', 'prefer'] : []), ...auth]]);
  const pf = [];
  let ran = 0, last;
  for (const [method, u, hdrs] of flights) {
    const r = last = await http('OPTIONS', u, { anonymous: true, passive: false,
      headers: { origin: ORIGIN, 'access-control-request-method': method, 'access-control-request-headers': hdrs.join(',') } });
    if (!opens(r)) continue; // only where the preflight itself opens that origin
    ran++;
    seen.push(r);
    const why = [];
    if (r.status < 200 || r.status > 299) why.push(`status ${r.status}, not 2xx`);
    if (method !== 'POST' && !covers(r, method.toLowerCase(), 'access-control-allow-methods'))
      why.push(`Access-Control-Allow-Methods: ${r.headers.get('access-control-allow-methods') ?? '(none)'} leaves out ${method}`);
    const missing = hdrs.filter((h) => !covers(r, h, 'access-control-allow-headers'));
    if (missing.length) why.push(`Access-Control-Allow-Headers: ${r.headers.get('access-control-allow-headers') ?? '(none)'} leaves out ${missing.join(', ')}`);
    if (why.length) { pf.push(`${method} ${short(u)}: ${why.join('; ')}`); pf.ev ??= r; }
  }
  if (!flights.length) skip('core.cors.preflight', name, 'neither POST on the collection nor PATCH on its items is declared');
  else if (!ran) skip('core.cors.preflight', name, 'no preflight got Access-Control-Allow-Origin for that origin');
  else check('core.cors.preflight', name, pf.join(' · ') || null, pf.ev ?? last, flights.map(([m]) => m).join(' and '));

  const echoed = seen.filter((r) => acao(r) === ORIGIN);
  const noVary = echoed.filter((r) => !hasVary(r, 'origin'));
  if (!echoed.length) skip('core.cors.vary', name, 'Access-Control-Allow-Origin is *, the same for every origin');
  else check('core.cors.vary', name, noVary.length ? `${noVary.map(evidence).join(', ')}: Access-Control-Allow-Origin repeats the Origin without Vary: Origin` : null, noVary[0] ?? res);

  if (!seen.some(creds)) skip('core.cors.credentials', name, 'no Access-Control-Allow-Credentials: true');
  else {
    const star = seen.filter((r) => creds(r) && acao(r) === '*');
    check('core.cors.credentials', name, star.length ? 'Access-Control-Allow-Origin: * with Access-Control-Allow-Credentials: true, which browsers reject' : null, star[0] ?? res);
  }
}

// ── Writes (--writes) ─────────────────────────────────────────────────────────
const created = []; // URLs of items this run created, deleted at the end
const MERGE = { 'content-type': 'application/merge-patch+json' };

// Bodies for a POST. --fixture gives one or more per collection, used in turn; in their strings {{n}}
// becomes a value unique to each POST and {{uuid}} a random UUID. Without --fixture, an item is copied;
// if that clashes with a unique field (409 conflict), every free-text string gets a unique suffix.
let made = 0;
const RUN = Math.random().toString(36).slice(2, 6);
const token = () => `${RUN}${++made}`;
function fill(v) {
  if (typeof v === 'string') return v.replace(/\{\{n\}\}/g, token).replace(/\{\{uuid\}\}/g, uuid);
  if (Array.isArray(v)) return v.map(fill);
  if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
  return v;
}
let readFile;
const parsedFixtures = new Map();
function fixtures(s) {
  if (!parsedFixtures.has(s.name)) parsedFixtures.set(s.name, (opts.fixtures[s.name] ?? []).map((f) => {
    const text = f.startsWith('@') ? readFile(f.slice(1)) : f;
    try { return JSON.parse(text); } catch { return die(`--fixture ${s.name}: not valid JSON`); }
  }));
  return parsedFixtures.get(s.name);
}
// The copied item: without what no client writes (5.1), except what the create schema requires.
async function prepareCopy(s) {
  if (s.copy !== undefined) return;
  s.copy = null;
  if (fixtures(s).length || !s.sample) return;
  const createSchema = s.c.schemas?.create === undefined ? null : await loadSchema(s.c.schemas.create);
  const required = Array.isArray(createSchema?.required) ? createSchema.required : [];
  const ro = await readOnlyFields(s);
  s.copy = Object.fromEntries(Object.entries(s.sample).filter(([k]) => k !== 'id' && !k.startsWith('_') && (!ro.includes(k) || required.includes(k))));
}
// A string that is free text: not an enum, a decimal, a date or a field of a declared type.
function uniquify(s, body) {
  const typed = (k) => s.c.filter?.[k]?.type && s.c.filter[k].type !== 'string';
  return Object.fromEntries(Object.entries(body).map(([k, v]) => [k,
    typeof v === 'string' && v && !typed(k) && !isRelation(s.c, k) && !DECIMAL.test(v) && !DATE.test(v.slice(0, 10)) ? `${v}-${token()}` : v]));
}
function fresh(s) {
  const list = fixtures(s);
  let body;
  if (list.length) { s.turn = ((s.turn ?? -1) + 1); body = fill(list[s.turn % list.length]); }
  else if (s.copy) body = s.uniquify ? uniquify(s, s.copy) : structuredClone(s.copy);
  else return null;
  if (s.c.id_from === 'client' && !('id' in body)) body.id = uuid(); // 5.1: the client chooses
  return body;
}
// 5.4: a 409 conflict to a POST that should create is a clash with data already there, not a fault.
function conflicted(id, target, res) {
  if (res.status !== 409 || res.data?.code !== 'conflict') return false;
  skip(id, target, `POST got 409 conflict, a clash with data already there (a unique field?): give bodies that differ with several --fixture, or a {{n}} template (${evidence(res)})`);
  return true;
}

// An item this checker created, if it is on the API's origin: only then is it written to, and deleted at the end.
function ownItem(where, name) {
  if (!where) return null;
  if (!where.startsWith(root.href)) { console.error(`  ${name}: ${where} is outside the API root; it will not be touched`); return null; }
  if (!created.includes(where)) created.push(where);
  return where;
}
async function create(s, body, headers = {}, init = {}) {
  const res = await http('POST', init.url ?? s.url, { json: body, headers, ...init });
  if (res.status === 201) {
    const loc = res.headers.get('location');
    const where = loc ? new URL(loc, res.url).href : res.data?.id ? `${s.url.replace(/\/$/, '')}/${encodeURIComponent(res.data.id)}` : null;
    res.where = ownItem(where, s.name);
  }
  return res;
}
// A new item from a fresh body, with extra members on top and some left out. A copied body that gets
// 409 conflict is made unique once, and from then on.
async function createNew(s, extra = {}, headers = {}, drop = []) {
  await prepareCopy(s);
  const make = () => { const b = { ...fresh(s), ...extra }; for (const k of drop) delete b[k]; return b; };
  if (!fixtures(s).length && !s.copy) return { status: 0, body: null, data: null, headers: new Headers(), method: 'POST', url: s.url };
  let body = make();
  let res = await create(s, body, headers);
  if (res.status === 409 && res.data?.code === 'conflict' && !fixtures(s).length && !s.uniquify && !hasHeader(headers, 'idempotency-key')) {
    s.uniquify = true;
    body = make();
    res = await create(s, body, headers);
  }
  res.body = body;
  return res;
}
const etagOf = async (url) => (await http('GET', url, { headers: { 'accept-encoding': 'identity' } })).headers.get('etag');
const entry = (res, where, code) => Array.isArray(res.data?.errors) && res.data.errors.some((e) => (where === undefined || e?.pointer === where) && (code === undefined || e?.code === code));
const headerEntry = (res) => Array.isArray(res.data?.errors) && res.data.errors.some((e) => String(e?.header ?? '').toLowerCase() === 'idempotency-key');

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
// Fields no client can change: id, the effective fields (11.6) and the readOnly properties of the item schema.
async function readOnlyFields(s) {
  return ['id', ...inherited(s.c).map(([f]) => f), ...(await schemaReadOnly(s)).props];
}
const isRelation = (c, k) => isObject(c?.relations) && Object.hasOwn(c.relations, k);

// What a --writes run checks on a collection: skipped together when the collection cannot be written.
const WRITE_CHECKS = ['core.post', 'core.post.id', 'core.post.media-type', 'core.post.charset', 'core.client-id', 'core.client-id.required',
  'core.client-id.format', 'core.client-id.taken', 'core.reserved.writes', 'core.put', 'core.schema.create', 'core.schema.update',
  'core.patch', 'core.patch.json', 'core.patch.not-object', 'core.patch.id', 'core.patch.underscore', 'core.patch.merge',
  'core.patch.roundtrip', 'core.patch.read-only', 'core.relation.unknown', 'core.relation.replace', 'core.relation.href', 'core.415', 'core.415.accept-patch', 'core.delete',
  'query.fields.writes', 'writes.etag.write',
  'writes.idempotency.replay', 'writes.idempotency.replayed-header', 'writes.idempotency.replay-precondition',
  'writes.idempotency.json-equality', 'writes.idempotency.mismatch', 'writes.idempotency.malformed', 'writes.idempotency.concurrent',
  'writes.idempotency.anonymous', 'writes.if-match.stale', 'writes.if-match.list', 'writes.if-match.race', 'writes.if-match.post',
  'writes.if-match.deleted', 'writes.if-none-match.write', 'writes.write-ignores-underscore',
  'writes.minimal', 'writes.minimal.applied', 'core.language.format', 'core.language.merge',
  'inherit.roundtrip', 'inherit.read-only', 'inherit.own', 'inherit.post', 'inherit.fields',
  'inherit.cycle', 'inherit.source', 'inherit.stale'].filter((id) => CHECKS[id]);
async function checkWrites(s, ctx) {
  const { name } = s;
  const missing = [...(Array.isArray(s.c.methods) && !s.c.methods.includes('POST') ? ['POST'] : []),
    ...(Array.isArray(s.c.item_methods) ? ['GET', 'PATCH', 'DELETE'].filter((m) => !s.c.item_methods.includes(m)) : [])];
  if (missing.length) {
    for (const id of WRITE_CHECKS) skip(id, name, `the declared methods leave out ${missing.join(', ')} (4.3)`);
    return;
  }
  await prepareCopy(s);
  if (!fixtures(s).length && !s.copy) {
    for (const id of ['core.post', 'writes.idempotency.replay']) skip(id, name, 'no item to copy and no --fixture for this collection');
    return;
  }
  const post = await createNew(s);
  if (conflicted('core.post', name, post)) {
    for (const id of WRITE_CHECKS.filter((x) => x !== 'core.post')) skip(id, name, 'no item could be created: see core.post');
    return;
  }
  const postProblem = post.status !== 201 ? `got ${post.status}${post.data?.code ? ` ${post.data.code}` : ''}`
    : !post.headers.has('location') ? '201 without Location'
      : !isObject(post.data) || typeof post.data.id !== 'string' ? 'the body is not the created item with its id' : null;
  check('core.post', name, postProblem, post, s.uniquify ? 'the copied item clashed (409), so its strings were made unique' : undefined);
  if (post.status !== 201 || !post.where) {
    console.error(`  ${name}: could not create an item (${evidence(post)}); pass a valid body with --fixture ${name}=@file.json`);
    return;
  }
  const item = post.where;
  const body = post.body;
  if (announced.includes('writes')) {
    const tag = await etagOf(item);
    s.postEtag = [post, tag];
  }

  await checkClientIds(s);
  await checkMediaTypes(s);

  // A second item of our own, the target of the writes with a reserved parameter.
  const reservedProblems = [];
  const P = 'filter[restep_check]';
  const reservedWrite = async (label, method, url, init) => {
    const res = await http(method, withQuery(url, [[P, '1']]), init);
    const why = problemMismatch(res, 400, 'unsupported_parameter', P);
    if (why) reservedProblems.push(`${label}: ${why}`);
    return [res, why];
  };
  const [pPost] = await reservedWrite('POST', 'POST', s.url, { json: fresh(s) });
  if (pPost.status === 201 && pPost.headers.get('location')) ownItem(new URL(pPost.headers.get('location'), pPost.url).href, name);
  const rp = await createNew(s);
  if (!rp.where) reservedProblems.push(`could not create a second item: ${evidence(rp)}`);
  else {
    await reservedWrite('PATCH', 'PATCH', rp.where, { json: {}, headers: MERGE });
    const [, why] = await reservedWrite('DELETE', 'DELETE', rp.where);
    if (!why && (await http('GET', rp.where)).status !== 200) reservedProblems.push('DELETE with a reserved parameter removed the item');
  }
  if (!rp.where && conflicted('core.reserved.writes', name, rp)) { /* reported as a skip */ }
  else check('core.reserved.writes', name, reservedProblems.join('; ') || null, pPost);

  // 6.3: fields and include only on reads.
  if (announced.includes('query')) {
    const fp = [];
    let ev;
    for (const [label, method, u, init, param] of [['PATCH with fields', 'PATCH', item, { json: {}, headers: MERGE }, 'fields'],
      ['PATCH with include', 'PATCH', item, { json: {}, headers: MERGE }, 'include'], ['POST with fields', 'POST', s.url, { json: fresh(s) }, 'fields']]) {
      const r = ev = await http(method, withQuery(u, [[param, 'id']]), init);
      if (r.status === 201 && r.headers.get('location')) ownItem(new URL(r.headers.get('location'), r.url).href, name);
      const why = problemMismatch(r, 400, 'unsupported_parameter', param);
      if (why) { fp.push(`${label}: ${why}`); fp.ev ??= r; }
    }
    check('query.fields.writes', name, fp.join('; ') || null, fp.ev ?? ev);
  }

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
      const { [required[0]]: _, ...without } = fresh(s);
      const res = await create(s, without);
      check('core.schema.create', name, problemMismatch(res, 422, 'invalid'), res, `without ${required[0]}`);
    }
  }

  const patch = await http('PATCH', item, { json: {}, headers: MERGE });
  check('core.patch', name, patch.status !== 200 ? `got ${patch.status}` : !isObject(patch.data) || patch.data.id === undefined
    ? 'the body is not the whole item' : null, patch);
  if (announced.includes('writes')) {
    const [p0, t0] = s.postEtag;
    const tagNow = await etagOf(item);
    check('writes.etag.write', name, !t0 ? 'the item has no ETag'
      : p0.data?._etag !== t0 ? `the POST body carries _etag ${JSON.stringify(p0.data?._etag)}, its GET gives ${t0}`
        : patch.status === 200 && patch.data?._etag !== tagNow ? `the PATCH body carries _etag ${JSON.stringify(patch.data?._etag)}, its GET gives ${tagNow}` : null, patch);
  }
  const asJson = await http('PATCH', item, { json: {}, headers: { 'content-type': 'application/json' } });
  check('core.patch.json', name, asJson.status !== 200 ? `got ${asJson.status}` : null, asJson);
  const arr = await http('PATCH', item, { json: '[]', headers: MERGE });
  check('core.patch.not-object', name, problemMismatch(arr, 400, 'bad_request'), arr);
  const otherId = await http('PATCH', item, { json: { id: `restep-check-${rand()}` }, headers: MERGE });
  check('core.patch.id', name, problemMismatch(otherId, 422, 'invalid') ?? (!entry(otherId, '/id', 'read_only')
    ? 'no errors entry with pointer /id and code read_only' : null), otherId);
  const under = await http('PATCH', item, { json: { _restep_check: 1 }, headers: MERGE });
  const reread = await http('GET', item);
  check('core.patch.underscore', name, under.status !== 200 ? `got ${under.status}` : '_restep_check' in (reread.data ?? {})
    ? 'the server stored _restep_check' : null, under);
  // 5.1 and 3: another media type, none, or another charset give 415; the body is valid JSON, so only 415 applies.
  const types = [['text/plain', 'text/plain'], ['no Content-Type', null], ['charset=latin1', 'application/merge-patch+json; charset=latin1']];
  const tp = [];
  let plain;
  for (const [label, type] of types) {
    const r = await http('PATCH', item, type ? { body: '{}', headers: { 'content-type': type } } : { body: new Uint8Array([123, 125]) });
    plain ??= r;
    if (r.status !== 415) tp.push(`${label}: got ${r.status}${r.data?.code ? ` ${r.data.code}` : ''}`);
  }
  check('core.415', name, tp.join('; ') || null, plain);
  if (plain.status === 415) check('core.415.accept-patch', name, plain.headers.has('accept-patch') ? null : '415 without Accept-Patch', plain);

  // Merge Patch: null deletes an optional field, absence leaves the rest untouched. A language map
  // is left as {} instead (3): core.language.merge covers it.
  const before = reread.data ?? {};
  const maps = languageMaps(s.c);
  const ro = await readOnlyFields(s);
  const tied = inherited(s.c).flatMap(([f, d]) => [f, d.own]); // an own field or a link also changes an effective field (11.6)
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
  if (announced.includes('inherit') && inherited(s.c).length) {
    if (!knownText) for (const id of ['inherit.roundtrip', 'inherit.read-only', 'inherit.own', 'inherit.post', 'inherit.fields', 'inherit.cycle', 'inherit.source', 'inherit.stale'])
      skip(id, name, `inherit is experimental and the server declares ${currentDoc?.restep}, whose text this checker does not implement (1.2)`);
    else await checkInheritWrites(s, item, body, ctx);
  }
  await checkReadOnlyWrites(s, item, body, kept);
  await checkRelationWrites(s, item, ctx);

  if (announced.includes('writes')) await checkWritesWrite(s, item);
  if (announced.includes('actions')) await checkActionsWrites(s, item);

  const lastTag = await etagOf(item);
  const del = await http('DELETE', item);
  const gone = await http('GET', item);
  check('core.delete', name, del.status !== 204 ? `got ${del.status}` : gone.status !== 404 ? `GET after DELETE got ${gone.status}` : null, del);
  if (del.status === 204) {
    created.splice(created.indexOf(item), 1);
    // 7.2: an item just deleted gives 404 whatever If-Match says.
    if (announced.includes('writes') && lastTag) {
      const p = await http('PATCH', item, { json: {}, headers: { ...MERGE, 'if-match': lastTag } });
      const d = await http('DELETE', item, { headers: { 'if-match': lastTag } });
      const why = problemMismatch(p, 404, 'not_found') ? `PATCH: ${problemMismatch(p, 404, 'not_found')}` : problemMismatch(d, 404, 'not_found') ? `DELETE: ${problemMismatch(d, 404, 'not_found')}` : null;
      check('writes.if-match.deleted', name, why, problemMismatch(p, 404, 'not_found') ? p : d);
    }
  }
}

// 5.1: who chooses the id.
async function checkClientIds(s) {
  const { name } = s;
  const from = s.c.id_from ?? 'server';
  const CLIENT = ['core.client-id', 'core.client-id.required', 'core.client-id.format', 'core.client-id.taken'];
  if (from === 'server') {
    const withId = await create(s, { ...fresh(s), id: `restep-check-${rand()}` });
    check('core.post.id', name, problemMismatch(withId, 422, 'invalid') ?? (!entry(withId, '/id', 'read_only') ? 'no errors entry with pointer /id and code read_only' : null), withId);
    for (const id of CLIENT) skip(id, name, 'the server assigns ids here (id_from)');
    return;
  }
  if (!['client', 'either'].includes(from)) { for (const id of ['core.post.id', ...CLIENT]) skip(id, name, `id_from is ${JSON.stringify(from)}, unknown to this checker: no id is sent`); return; }
  skip('core.post.id', name, `id_from is ${from}: the client may choose ids`);
  const id = uuid();
  const res = await createNew(s, { id });
  if (conflicted('core.client-id', name, res)) return;
  const at = res.where && new URL(res.where).pathname.split('/').pop();
  check('core.client-id', name, res.status !== 201 ? `got ${res.status}${res.data?.code ? ` ${res.data.code}` : ''}`
    : res.data?.id !== undefined && res.data.id !== id ? `the item got the id ${JSON.stringify(res.data.id)}, not ${id}`
      : decodeURIComponent(at ?? '') !== id ? `Location ${res.headers.get('location')} is not the path of ${id}` : null, res);
  if (from === 'client') {
    const b = fresh(s);
    delete b.id;
    const r = await create(s, b);
    check('core.client-id.required', name, problemMismatch(r, 422, 'invalid') ?? (!entry(r, '/id', 'required') ? 'no errors entry with pointer /id and code required' : null), r);
  } else skip('core.client-id.required', name, 'id_from is either: the id is optional');
  const fp = [];
  let fr;
  for (const bad of ['restep check', '..']) {
    const r = fr = await create(s, { ...fresh(s), id: bad });
    const why = problemMismatch(r, 422, 'invalid') ?? (!entry(r, '/id') ? 'no errors entry at /id' : null);
    if (why) { fp.push(`id ${JSON.stringify(bad)}: ${why}`); fp.ev ??= r; }
  }
  check('core.client-id.format', name, fp.join('; ') || null, fp.ev ?? fr);
  if (res.status !== 201 || !res.where) return skip('core.client-id.taken', name, 'no item created with an id of the client');
  const taken = [];
  const again = await create(s, { ...fresh(s), id });
  const takenWhy = (r) => problemMismatch(r, 409, 'conflict') ?? (!entry(r, '/id', 'taken') ? 'no errors entry with pointer /id and code taken' : null);
  if (takenWhy(again)) taken.push(`the same id again: ${takenWhy(again)}`);
  const del = await http('DELETE', res.where);
  let reused = null;
  if (del.status === 204) {
    created.splice(created.indexOf(res.where), 1);
    reused = await create(s, { ...fresh(s), id });
    if (takenWhy(reused)) taken.push(`the id of a deleted item: ${takenWhy(reused)}`);
    else if ((await http('GET', res.where)).status !== 404) taken.push('the deleted item is back');
  } else taken.push(`could not delete the item to reuse its id: ${evidence(del)}`);
  check('core.client-id.taken', name, taken.join('; ') || null, reused ?? again);
}

// 3: the media type of a POST.
async function checkMediaTypes(s) {
  const { name } = s;
  const problems = [];
  let last;
  const raw = (b) => new TextEncoder().encode(JSON.stringify(b));
  for (const [label, init, want] of [
    ['text/plain', { body: JSON.stringify(fresh(s)), headers: { 'content-type': 'text/plain' } }, 415],
    ['application/x-www-form-urlencoded', { body: JSON.stringify(fresh(s)), headers: { 'content-type': 'application/x-www-form-urlencoded' } }, 415],
    ['no Content-Type', { body: raw(fresh(s)) }, 415],
    ['charset=latin1', { body: JSON.stringify(fresh(s)), headers: { 'content-type': 'application/json; charset=latin1' } }, 415],
    ['an empty body without Content-Type', { body: new Uint8Array(0) }, 415],
    ['an empty body with application/json', { body: '', headers: { 'content-type': 'application/json' } }, 400],
  ]) {
    const r = last = await http('POST', s.url, init);
    if (r.status === 201 && r.headers.get('location')) ownItem(new URL(r.headers.get('location'), r.url).href, name);
    const why = want === 400 ? problemMismatch(r, 400, 'bad_request') : problemMismatch(r, 415, 'unsupported_media_type');
    if (why) { problems.push(`${label}: ${why}`); problems.ev ??= r; }
  }
  check('core.post.media-type', name, problems.join('; ') || null, problems.ev ?? last);
  const cp = [];
  let cl;
  for (const type of ['application/json; charset=UTF-8', 'application/json; charset="utf-8"']) {
    const r = cl = await create(s, fresh(s), { 'content-type': type });
    if (conflicted('core.post.charset', name, r)) return;
    if (r.status !== 201) { cp.push(`${type}: got ${r.status}${r.data?.code ? ` ${r.data.code}` : ''}`); cp.ev ??= r; }
  }
  check('core.post.charset', name, cp.join('; ') || null, cp.ev ?? cl);
}

// 5.1: to link an item of a subcollection the client sends its href; one that is not the path of an item of
// that collection, or that does not end in the id sent, gives 422.
async function checkRelationHref(s, item, ctx) {
  const { name } = s;
  const rels = Object.entries(isObject(s.c.relations) ? s.c.relations : {}).filter(([, d]) => isObject(d) && !d.many && typeof d.to === 'string' && isSubColl(d.to));
  if (!rels.length) return;
  const [r, d] = rels[0];
  const link = ctx.collections.find((o) => o.name === name)?.full.items.map((it) => it?.[r]).find((x) => isObject(x) && typeof x.href === 'string');
  if (!link) return skip('core.relation.href', name, `no item links ${r} to copy an href from`);
  const before = (await http('GET', item)).data ?? {};
  const template = currentDoc.collections[d.to].path;
  const bogus = new URL(resolvePath(template.replace(/\{[^}]+\}/g, `restep-check-${rand()}`))).pathname + `/${encodeURIComponent(link.id)}`;
  const hp = [];
  let last;
  for (const [label, v] of [[`href ${bogus}, under a parent that does not exist`, { id: link.id, href: bogus }], ['an href that does not end in the id sent', { id: `restep-check-${rand()}`, href: link.href }]]) {
    last = await http('PATCH', item, { json: { [r]: v }, headers: MERGE });
    if (problemMismatch(last, 422, 'invalid')) { hp.push(`${label}: ${problemMismatch(last, 422, 'invalid')}`); hp.ev ??= last; }
  }
  if (hp.length) await http('PATCH', item, { json: { [r]: before[r] ?? null }, headers: MERGE });
  check('core.relation.href', name, hp.join('; ') || null, hp.ev ?? last, r);
}

// 5.1: relationship objects in a write, on declared to-one relations whose target collection is checked.
async function checkRelationWrites(s, item, ctx) {
  const { name } = s;
  await checkRelationHref(s, item, ctx);
  const rels = Object.entries(isObject(s.c.relations) ? s.c.relations : {}).filter(([, r]) => isObject(r) && !r.many && typeof r.to === 'string');
  // A subcollection's item is linked by href, which core.relation.href covers: here only targets reached by id.
  const rel = rels.find(([, r]) => !isSubColl(r.to) && ctx.collections.some((o) => o.name === r.to && o.full.items.length));
  if (!rel) { for (const id of ['core.relation.unknown', 'core.relation.replace']) skip(id, name, 'no to-one relation to a checked collection, not a subcollection, with items'); return; }
  const [r, d] = rel;
  const ts = ctx.collections.find((o) => o.name === d.to);
  const before = (await http('GET', item)).data ?? {};
  const missingId = `restep-check-missing-${rand()}`;
  const unk = await http('PATCH', item, { json: { [r]: { id: missingId } }, headers: MERGE });
  const after = (await http('GET', item)).data ?? {};
  check('core.relation.unknown', name, problemMismatch(unk, 422, 'invalid') ?? (!entry(unk, pointer(r, 'id'), 'unknown') ? `no errors entry with pointer ${pointer(r, 'id')} and code unknown`
    : canonical(after) !== canonical(before) ? 'the rejected PATCH changed the item' : null), unk, `${r} → ${d.to} ${missingId}`);
  const own = new URL(item).pathname.split('/').pop();
  const target = ts.full.items.map((it) => it?.id).find((x) => typeof x === 'string' && x !== before[r]?.id && !(ts.name === name && x === decodeURIComponent(own)));
  if (!target) return skip('core.relation.replace', name, `no other item in ${d.to} to link to`);
  const targetUrl = `${ts.url.replace(/\/$/, '')}/${encodeURIComponent(target)}`;
  const t0 = (await http('GET', targetUrl)).data;
  const res = await http('PATCH', item, { json: { [r]: { id: target, restep_check_extra: 1 } }, headers: MERGE });
  if (res.status === 422) { skip('core.relation.replace', name, 'the server rejects the extra member (a declared update schema may)'); }
  else {
    const got = (await http('GET', item)).data ?? {};
    const t1 = (await http('GET', targetUrl)).data;
    check('core.relation.replace', name, res.status !== 200 && res.status !== 204 ? `got ${res.status}${res.data?.code ? ` ${res.data.code}` : ''}`
      : got[r]?.id !== target ? `${r} is ${JSON.stringify(got[r])}, not linked to ${target}`
        : isObject(got[r]) && 'restep_check_extra' in got[r] ? `${r} stored restep_check_extra` : canonical(t1) !== canonical(t0) ? `the related item ${target} changed` : null, res);
  }
  await http('PATCH', item, { json: { [r]: before[r] ?? null }, headers: MERGE });
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

// 11.6: inherited values in a PATCH, on an item this checker created.
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
  check('inherit.roundtrip', name, await unchanged('the effective fields as read', whole), whole);

  const [f, d] = inherited(s.c).find(([g]) => !blank(before[g])) ?? [];
  const LATER = ['inherit.read-only', 'inherit.own', 'inherit.post', 'inherit.fields', 'inherit.cycle', 'inherit.source', 'inherit.stale'];
  if (!f) { for (const id of LATER) skip(id, name, 'no effective field with a value in the test item'); return; }
  const other = variants(before[f])[0];
  if (other === undefined) { for (const id of LATER) skip(id, name, `no other value to try for ${f}`); return; }
  // Another value in the effective field: read_only, and nothing changes.
  const ro = await http('PATCH', item, { json: { [f]: other }, headers: MERGE });
  const where = pointer(f);
  const why = problemMismatch(ro, 422, 'invalid') ?? (!(Array.isArray(ro.data?.errors) && ro.data.errors.some((e) => e?.pointer === where && e?.code === 'read_only'))
    ? `no errors entry with pointer ${where} and code read_only` : null) ?? (await unchanged(`{"${f}": ${JSON.stringify(other)}}`, { status: 200 }));
  check('inherit.read-only', name, why, ro, `{"${f}": ${JSON.stringify(other)}}`);

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
  check('inherit.own', name, own.join('; ') || null, set, d.own);

  // A POST with another value in the effective field than the one that would result.
  const posted = await create(s, { ...fresh(s), [d.own]: null, [f]: other });
  check('inherit.post', name, problemMismatch(posted, 422, 'invalid') ?? (!(Array.isArray(posted.data?.errors) && posted.data.errors.some((e) => e?.pointer === pointer(f) && e?.code === 'read_only'))
    ? `no errors entry with pointer ${pointer(f)} and code read_only` : null), posted);

  // fields: _inherited only speaks of what the response carries.
  if (!announced.includes('query')) skip('inherit.fields', name, 'the server does not announce query');
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
    check('inherit.fields', name, fp.join('; ') || null, ev, `fields=${g} and fields=${f}`);
  }

  const decls = isObject(ctx.doc?.collections) ? ctx.doc.collections : {};
  const toOf = (r) => { const to = s.c.relations?.[r]?.to; return Array.isArray(to) ? to[0] : to; };
  // A cycle: a child of our item, then our item linked under it.
  const self = (d.from ?? []).find((r) => toOf(r) === name);
  if (!self) skip('inherit.cycle', name, 'no relation in from points at this same collection');
  else {
    const child = await createNew(s, { [d.own]: null, [self]: { id: before.id } }, {}, [f]);
    if (!child.where) skip('inherit.cycle', name, `could not create a child item: ${evidence(child)}`);
    else {
      const res = await http('PATCH', item, { json: { [self]: { id: child.data?.id ?? decodeURIComponent(child.where.split('/').pop()) } }, headers: MERGE });
      check('inherit.cycle', name, problemMismatch(res, 422, 'invalid'), res, `${self} under its own child`);
      if (res.status === 200 || res.status === 204) await http('PATCH', item, { json: { [self]: before[self] ?? null }, headers: MERGE });
    }
  }

  // A source of our own: link our item to it, change it, and see the change arrive.
  const r = (d.from ?? []).find((x) => ctx.collections.some((o) => o.name === toOf(x)));
  const ts = r && ctx.collections.find((o) => o.name === toOf(r));
  if (ts) await prepareCopy(ts);
  if (!r || (!fixtures(ts).length && !ts.copy)) { for (const id of ['inherit.source', 'inherit.stale']) skip(id, name, 'no source collection to create an item in'); return; }
  const srcRule = isObject(decls[ts.name]?.inherit?.[f]) ? decls[ts.name].inherit[f] : null;
  const src = await createNew(ts, srcRule ? { [srcRule.own]: before[f] } : { [f]: before[f] }, {}, srcRule ? [f] : []);
  if (!src.where) { for (const id of ['inherit.source', 'inherit.stale']) skip(id, name, `could not create an item in ${ts.name}: ${evidence(src)}`); return; }
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
  check('inherit.source', name, sp.join('; ') || null, changed, `${r} → ${ts.name}`);
  if (sp.length) skip('inherit.stale', name, 'the source change did not reach the item');
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
    check('inherit.stale', name, st.join('; ') || null, ev);
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

async function checkWritesWrite(s, item) {
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

  // 7.2: If-Match on a POST to the collection is evaluated against the collection's ETag, which an invented one is not.
  const pm = await create(s, fresh(s), { 'if-match': '"restep-check-invented"' });
  check('writes.if-match.post', name, problemMismatch(pm, 412, 'precondition_failed') && (pm.status === 201 ? 'got 201: the item was created' : problemMismatch(pm, 412, 'precondition_failed')), pm);

  // Idempotency-Key.
  const key = `"restep-check-${rand()}"`;
  const body = fresh(s);
  const a = await create(s, body, { 'idempotency-key': key });
  if (conflicted('writes.idempotency.replay', name, a)) { /* reported */ }
  else if (a.status !== 201) {
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
    // The same key with another body, or the same body with another query (7.1).
    const stringField = Object.keys(body).find((k) => typeof body[k] === 'string' && k !== 'id');
    const different = stringField ? { ...body, [stringField]: `${body[stringField]} ·` } : { ...body, _restep_check: rand() };
    const m = await create(s, different, { 'idempotency-key': key });
    const q = await create(s, body, { 'idempotency-key': key }, { url: withQuery(s.url, [['restep_check', '1']]) });
    const qRefused = q.status === 400 && q.data?.parameter === 'restep_check'; // the API's own parameter, which it may refuse
    check('writes.idempotency.mismatch', name, problemMismatch(m, 422, 'idempotency_mismatch')
      ?? (qRefused ? null : problemMismatch(q, 422, 'idempotency_mismatch') && `the same body with ?restep_check=1: ${problemMismatch(q, 422, 'idempotency_mismatch')}`),
    problemMismatch(m, 422, 'idempotency_mismatch') || qRefused ? m : q);
  }
  const mp = [];
  let ml;
  for (const k of ['restep-check-unquoted', '"restep-check";v=1']) {
    const r = ml = await create(s, fresh(s), { 'idempotency-key': k });
    const why = problemMismatch(r, 400, 'bad_request') ?? (!headerEntry(r) ? 'no errors entry with header Idempotency-Key' : null);
    if (why) { mp.push(`${k}: ${why}`); mp.ev ??= r; }
  }
  check('writes.idempotency.malformed', name, mp.join('; ') || null, mp.ev ?? ml);

  // Two at once with the same key and body: one item, never two (7.1).
  const k2 = `"restep-check-${rand()}"`, b2 = fresh(s);
  const both = await Promise.all([0, 1].map(() => create(s, b2, { 'idempotency-key': k2 })));
  const made2 = [...new Set(both.filter((r) => r.status === 201).map((r) => r.where))];
  const odd = both.filter((r) => r.status !== 201 && !(r.status === 409 && r.data?.code === 'request_in_progress'));
  if (both.every((r) => r.status === 409 && r.data?.code === 'conflict')) conflicted('writes.idempotency.concurrent', name, both[0]);
  else check('writes.idempotency.concurrent', name, made2.length > 1 ? `two items: ${made2.map(short).join(', ')}`
    : odd.length ? `got ${odd.map((r) => `${r.status}${r.data?.code ? ` ${r.data.code}` : ''}`).join(', ')}` : null, both[1]);

  // Without credentials: the anonymous principal's keys work as anyone's, unless discovery refuses them (7.1).
  const refuses = currentDoc?.idempotency?.anonymous === false;
  const k3 = `"restep-check-${rand()}"`, b3 = fresh(s);
  const an1 = await create(s, b3, { 'idempotency-key': k3 }, { anonymous: true });
  if (an1.status === 401 || an1.status === 403) skip('writes.idempotency.anonymous', name, `a POST without credentials gets ${an1.status}`);
  else if (refuses) {
    check('writes.idempotency.anonymous', name, problemMismatch(an1, 400, 'bad_request') ?? (!entry(an1, undefined, 'unknown') || !headerEntry(an1)
      ? 'no errors entry with header Idempotency-Key and code unknown' : null), an1, 'idempotency.anonymous is false');
  } else if (conflicted('writes.idempotency.anonymous', name, an1)) { /* reported */ }
  else {
    const an2 = await create(s, b3, { 'idempotency-key': k3 }, { anonymous: true });
    check('writes.idempotency.anonymous', name, an1.status !== 201 ? `the first POST without credentials got ${an1.status}${an1.data?.code ? ` ${an1.data.code}` : ''}`
      : an2.status !== 201 || an2.where !== an1.where ? `the repeated POST without credentials got ${an2.status}${an2.where && an2.where !== an1.where ? ' and another item' : ''}` : null, an2);
  }

  // Prefer: return=minimal.
  const min = await create(s, fresh(s), { prefer: 'return=minimal' });
  if (conflicted('writes.minimal', name, min)) return;
  if (min.status === 201 && !min.size) {
    check('writes.minimal', name, !min.headers.has('location') ? 'no Location' : !min.headers.has('etag') ? 'no ETag' : null, min);
    check('writes.minimal.applied', name, /return=minimal/.test(min.headers.get('preference-applied') ?? '') ? null : 'no Preference-Applied', min);
  } else if (min.status === 201) pass('writes.minimal', name, 'the server returns the representation (it MAY)');
  else bad('writes.minimal', name, `POST with Prefer: return=minimal got ${min.status}`, min);
}

// ── Evolution ─────────────────────────────────────────────────────────────────
async function checkEvolution(disc, ctx) {
  const now = Date.now();
  for (const [where, d, at] of disc.deprecations ?? []) {
    if (!isObject(d)) continue;
    const s = at === 'collection' ? ctx.collections.find((x) => x.name === where) : null;
    const past = d.sunset && Date.parse(d.sunset) <= now;
    const target = where ? `${at === 'singleton' ? 'singleton ' : ''}${where} ${d.kind} ${d.name ?? ''}`.trim() : `${d.kind} ${d.name ?? ''}`.trim();
    const sgPath = (n) => disc.doc.singletons?.[n]?.path;
    let url;
    if (['version', 'profile', 'extension'].includes(d.kind)) url = root.href;
    else if (d.kind === 'collection') url = resolvePath(disc.doc.collections?.[d.name]?.path ?? `/${d.name}`);
    else if (d.kind === 'singleton' && typeof sgPath(d.name) === 'string') url = resolvePath(sgPath(d.name));
    else if (at === 'singleton' && d.kind === 'field' && typeof sgPath(where) === 'string') url = resolvePath(sgPath(where));
    else if (!s) { skip('evolution.deprecation-header', target, `${d.kind} notices there need a later version of this checker`); continue; }
    else if (d.kind === 'field') url = s.url;
    else if (d.kind === 'filter') url = withQuery(s.url, [[`filter[${d.name}][null]`, 'false']]);
    else if (d.kind === 'operator') url = withQuery(s.url, [[`filter[${d.name}][${d.op}]`, d.op === 'null' ? 'false' : toRaw(s.full.items.map((it) => get(it, d.name)).find((v) => !blank(v)) ?? '1')]]);
    else if (d.kind === 'value') url = withQuery(s.url, [[`filter[${d.name}]`, toRaw(d.value)]]);
    else if (d.kind === 'sort') url = withQuery(s.url, [['sort', d.name]]);
    else if (d.kind === 'count') url = withQuery(s.url, [['count', 'true']]);
    else if (d.kind === 'max_limit' && Number.isInteger(d.value) && Number.isInteger(s.c.max_limit) && s.c.max_limit > d.value) url = withQuery(s.url, [['limit', String(d.value + 1)]]);
    else { skip('evolution.deprecation-header', target, `${d.kind} notices need a later version of this checker`); continue; }
    const res = await http('GET', url);
    if (past) {
      const why = ['collection', 'version', 'singleton'].includes(d.kind) ? problemMismatch(res, 410, 'retired')
        : d.kind === 'count' && d.value === 'estimated' ? (s.c.count !== 'estimated' ? `count is ${JSON.stringify(s.c.count)} after its sunset, not "estimated"`
          : res.status !== 200 || !Number.isInteger(res.data?.total) ? `count=true got ${res.status} without an integer total` : null)
        : ['filter', 'sort', 'operator', 'count'].includes(d.kind) ? problemMismatch(res, 400, 'unsupported_parameter')
          : ['value', 'max_limit'].includes(d.kind) ? problemMismatch(res, 400, 'invalid_parameter')
            : ['profile', 'extension'].includes(d.kind) ? ([...(disc.doc.profiles ?? []), ...(disc.doc.extensions ?? [])].includes(d.name) ? `${d.name} is still announced after its sunset` : null)
              : (res.data?.items ?? [res.data]).some((it) => isObject(it) && d.name in it) ? `${d.name} still appears after its sunset` : null;
      check('evolution.after-sunset', target, why, res);
    } else {
      const whole = ['collection', 'version', 'singleton'].includes(d.kind);
      check('evolution.deprecation-header', target, !res.headers.has('deprecation') ? 'no Deprecation header'
        : !linkTargets(res, 'deprecation').length ? 'no Link with rel="deprecation"'
          : whole && d.sunset && !res.headers.has('sunset') ? 'no Sunset header, and the sunset has a date' : null, res);
    }
  }
  const v = Number(disc.doc?.version);
  if (v >= 2) check('evolution.version-links', null, linkTargets(disc.res, 'predecessor-version').length ? null : 'no Link with rel="predecessor-version"', disc.res);
}

// ── oauth (11.5) ──────────────────────────────────────────────────────────────
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
  for (const id of PASSIVE) {
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
  if (Object.values(opts.fixtures).flat().some((f) => f.startsWith('@'))) {
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
  currentDoc = doc;
  const profiles = doc ? ['core', ...(doc.profiles ?? []).filter((p) => p !== 'core')] : ['core'];
  // Without credentials the profile links of a 401 can still announce oauth, which needs none.
  const extensions = doc?.extensions ?? (disc.linked ?? []).filter((p) => p === 'oauth');
  announced = [...profiles, ...extensions];

  let decls = Object.entries(isObject(doc?.collections) ? doc.collections : {});
  for (const [n, p] of Object.entries(opts.paths)) decls.push([n, { path: p }]);
  if (opts.collections.length) decls = decls.filter(([n]) => opts.collections.includes(n));
  const ctx = { collections: [], doc };
  if (!decls.length) console.error('No collections to check: the server declares none. Use --path name=/path.');
  const subs = [];
  for (const [name, c] of decls) {
    if (typeof c?.path !== 'string') { skip('core.collection.shape', name, 'no path'); continue; }
    if (c.path.includes('{')) { subs.push([name, c]); continue; }
    const s = await checkCollection(name, c, ctx);
    if (s) ctx.collections.push(s);
  }
  // 4.2: a subcollection, checked under an item of its parent (of the first ten, one with two items or the most).
  for (const [name, c] of subs) {
    const vars = c.path.match(/\{[^}]+\}/g) ?? [];
    const parent = ctx.collections.find((o) => o.name === c.parent);
    if (!parent || vars.length !== 1) { skip('core.collection.shape', name, !parent ? 'its parent is not a checked collection' : 'a subcollection under another subcollection: a later version of this checker'); continue; }
    if (!parent.full.items.length) { skip('core.collection.shape', name, `${parent.name} has no item to expand the template with`); continue; }
    const at = (pid) => c.path.replace(vars[0], encodeURIComponent(pid));
    let pid = parent.full.items[0].id, most = 0; // the one with the most items, so pagination can be tried
    for (const it of parent.full.items.slice(0, 10)) {
      const r = await http('GET', resolvePath(at(it.id)));
      const n = isCollection(r.data) ? r.data.items.length + (r.data.next ? 1 : 0) : 0;
      if (n > most) { pid = it.id; most = n; }
      if (n > 1) break;
    }
    const s = await checkCollection(name, { ...c, path: at(pid) }, ctx);
    if (!s) continue;
    s.sub = { parent, parentId: pid, template: c.path };
    ctx.collections.push(s);
    await checkSubcollection(s);
  }
  if (doc) await checkDiscoverySame(disc);
  for (const s of ctx.collections) {
    if (profiles.includes('query')) await checkQuery(s, ctx);
    if (profiles.includes('writes')) await checkWritesRead(s);
    if (profiles.includes('cache')) await checkCacheRead(s.name, s.itemGet ? s.itemUrl : null, s.itemUrl ? NO_GET('item_methods') : undefined);
    if (profiles.includes('relations')) await checkRelations(s);
    if (extensions.includes('actions')) await checkActionsRead(s);
  }
  if (doc) await checkSingletons(disc.singletons ?? {});
  await checkPrivate(ctx);
  if (opts.writes) for (const s of ctx.collections) await checkWrites(s, ctx);
  if (opts.writes) for (const s of ctx.collections.filter((x) => x.sub)) await checkSubcollectionDelete(s);
  else if (ctx.collections.length) console.error('Read only: run with --writes to also check POST, PATCH, DELETE, If-Match and Idempotency-Key.');
  if (doc?.status !== undefined) await checkStatus(doc.status);
  await checkLanguage(disc, ctx);
  if (doc) await checkEvolution(disc, ctx);
  if (extensions.includes('oauth')) await checkOauth(ctx);
  await checkCors(ctx);
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
  const { Ajv, addFormats } = await loadAjv(argv);
  const { readFile: read } = await import('node:fs/promises');
  let schema;
  // The schema that ships with this checker comes first: next to it (npm package) or, in a copy of the
  // site, in ../1/schema/. The published one is the last resort, since it may be another draft's.
  for (const dir of ['./schema/', '../1/schema/']) {
    try { schema = JSON.parse(await read(new URL(`${dir}${name}.json`, import.meta.url), 'utf8')); break; } catch {}
  }
  if (!schema) {
    console.error(`restep-check: using the published ${name} schema (${SPEC}schema/${name}.json), which may not be that of this checker's draft.`);
    const r = await fetch(`${SPEC}schema/${name}.json`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Could not get the ${name} schema (${r.status}).`);
    schema = await r.json();
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
    } catch (e) { out.push({ document: d, valid: false, errors: [{ path: '', message: `not readable as JSON: ${e.message}` }], rules: [] }); continue; }
    const valid = validate(data);
    out.push({ document: d, valid, errors: valid ? [] : validate.errors.map((e) => ({ path: e.instancePath, message: e.message })), rules: documentRules(name, data) });
  }
  const failed = (r) => !r.valid || r.rules.some((x) => x.status === 'fail');
  if (json) console.log(JSON.stringify({ version: VERSION, schema: schema.$id ?? `${PROFILE}schema/${name}.json`,
    results: out.map((r) => ({ ...r, conforms: !failed(r) })) }, null, 2));
  else for (const r of out) {
    console.log(`${failed(r) ? LABEL.fail : LABEL.pass}  ${r.document}`);
    console.log(`  Schema (${name}.json): ${r.valid ? 'valid' : `${r.errors.length} error${r.errors.length === 1 ? '' : 's'}`}`);
    for (const e of r.errors) console.log(`      ${e.path || '/'}: ${e.message}`);
    if (name !== 'discovery') continue;
    const n = (s) => r.rules.filter((x) => x.status === s).length;
    console.log(`  Rules of the text that the schema cannot express: ${n('fail')} failed · ${n('warn')} warning${n('warn') === 1 ? '' : 's'} · ${n('pass')} passed · ${n('skip')} skipped`);
    for (const x of r.rules.filter((x) => x.status !== 'pass').sort((a, b) => ORDER[a.status] - ORDER[b.status])) {
      console.log(`    ${LABEL[x.status]} ${x.id}${x.target ? paint(90, ` [${x.target}]`) : ''}  ${CHECKS[x.id][2]}`);
      if (x.message) console.log(`         ${x.message}`);
      if (x.status === 'fail' || x.status === 'warn') console.log(paint(90, `         ${x.level} · §${x.section} ${sectionUrl(x.section)}`));
    }
  }
  return out.some(failed) ? 1 : 0;
}

// --schema discovery: the rules of the text that need no request (the discovery.* checks, and what filter and
// sort may declare), run on the document as on a server's. Another document has none of these.
function documentRules(name, data) {
  if (name !== 'discovery' || !isObject(data) || typeof data.restep !== 'string') return [];
  results.length = 0;
  reasons = null;
  discoveryRules(data, null);
  staticQueryRules(data);
  return results.splice(0).map(({ evidence: _, ...r }) => r);
}

// ajv and ajv-formats: where Node finds them from this file (the npm package brings them) or else from the
// current directory, so a project that has them installed can run this file from anywhere, such as a copy of
// the site. Only --schema needs them.
async function loadAjv(argv) {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const fromCwd = createRequire(`${process.cwd()}/`);
  const load = async (spec) => {
    try { return (await import(spec)).default; } catch (e) { if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
    try { return (await import(pathToFileURL(fromCwd.resolve(spec)).href)).default; } catch (e) { if (e?.code !== 'MODULE_NOT_FOUND') throw e; }
    return null;
  };
  const Ajv = await load('ajv/dist/2020.js'), addFormats = await load('ajv-formats');
  const missing = [!Ajv && 'ajv', !addFormats && 'ajv-formats'].filter(Boolean);
  if (missing.length) {
    const quote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`);
    throw new Error(`--schema needs the npm package${missing.length > 1 ? 's' : ''} ${missing.join(' and ')}, which this standalone file does not bring.\n`
      + `  Run it with npx, which brings them:  npx restep-check ${argv.map(quote).join(' ')}\n`
      + `  or install them in the current directory and run this file again:  npm install ajv ajv-formats`);
  }
  return { Ajv, addFormats };
}

// Global so the cleanup runs whatever happens.
async function cleanup() {
  for (const url of created.splice(0)) {
    // http() sends the credentials only to the API's origin; If-Match: * satisfies a resource that requires it (7.2).
    const res = await http('DELETE', url, { passive: false, headers: { 'if-match': '*' } }).catch(() => null);
    if (!res || (res.status >= 300 && res.status !== 404 && res.status !== 410)) console.error(`Could not delete ${url}${res ? ` (${res.status})` : ''}: remove it by hand.`);
  }
}

// A pipe takes stdout in pieces: leaving before it drains cuts a long --json report at 64 KiB.
const drained = () => new Promise((resolve) => { if (process.stdout.writableLength) process.stdout.once('drain', resolve); else resolve(); });
main().then(async (code) => { await cleanup(); await drained(); process.exit(code); }, async (e) => {
  console.error(`restep-check: ${e.message}`);
  if (opts) await cleanup();
  process.exit(2);
});
