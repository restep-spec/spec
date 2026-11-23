> Generated from https://restep.wubytes.com/1/. The HTML page is the source: where they differ, it prevails, and the English
> text prevails over the Spanish one. Profile and error URIs point to the HTML page.

# Restep 1 · specification

## 1. Status and scope

**Draft 6**, 20 November 2026 (draft 5: 20 November 2026; draft 4, draft 3 and draft 2: 19 November 2026; draft 1: 12 November 2026). It may change without notice until version 1.0 is published. A server that implements it declares `"restep": "1.0-draft.6"` ([1.1](https://restep.wubytes.com/1/#restep-versions)).

URI of this version: `https://w3id.org/restep/1/`, a permanent identifier that redirects to this text at `restep.wubytes.com`.

Published in English and in [Spanish](https://restep.wubytes.com/es/1/). Where the two differ, the English text prevails; profile and error URIs point to it.

Also as a single Markdown file, for agents and for diffing: [`spec.md`](https://restep.wubytes.com/1/spec.md).

Restep is a profile for HTTP APIs that exchange JSON and are organised around resources: level 2 of the Richardson Maturity Model. It settles what that level leaves open (the shape of collections and errors, querying, safe writes, relationships and sync) and splits it into six **profiles** that are adopted one at a time, plus optional **extensions**.

Out of scope: authentication and authorization (OAuth 2.0 is recommended, with OpenID Connect where the API needs the user’s identity; the [`oauth`](https://restep.wubytes.com/1/#oauth) extension says where a client gets a token), each API’s domain design, and anything below HTTP. Restep requires no schema and no code generator: a `core` server can be written by hand.

### 1.1 Restep versions

- Restep has a major and a minor version. The major one is in all its URIs (`/1/`); the discovery document declares the full one: `"restep": "1.0"`.
- A minor version only adds: profiles; extensions; discovery members; values and forms that this text reserves for minor versions; meanings for requests and declarations that this text forbids or reserves; and error codes for new cases (never a new code for a case that already had one). It adds no requirement on what 1.0 defines, so whatever conforms to 1.0 still conforms to 1.1, except in the experimental profiles and extensions ([1.2](https://restep.wubytes.com/1/#dependencies)). Adding error codes is safe because clients handle unknown ones by the class of the status ([5.4](https://restep.wubytes.com/1/#errors)), and adding the rest because clients ignore what they do not know ([3](https://restep.wubytes.com/1/#data), [4.2](https://restep.wubytes.com/1/#unknown-members)).
- The value of `restep` MUST match this grammar (ABNF, [**RFC 5234**](https://www.rfc-editor.org/rfc/rfc5234)), so numbers carry no leading zeros:

```
restep-version = major "." minor [ "-" pre-release ]
pre-release    = ( "draft" / "rc" ) "." number
major          = number
minor          = number
number         = "0" / ( %x31-39 *DIGIT )
```

- Without a suffix (`"1.0"`, `"1.1"`) it names a published version. With one it names a draft (`"1.0-draft.6"`, `"1.1-draft.2"`) or a release candidate (`"1.0-rc.1"`) of the version before the hyphen. A server that implements a draft or a candidate SHOULD declare it this way rather than as the published version. A client of Restep 1 MUST NOT treat as a Restep 1 discovery document one whose `restep` does not match this grammar or whose major version is not 1, and for one of another major version it MUST NOT fall back to assuming `core` only either, as [4.2](https://restep.wubytes.com/1/#discovery) asks of a client that finds no discovery document: that API is not one it can use as Restep 1.
- A draft or a candidate may differ incompatibly from the published version of the same number and from every other draft. A client MUST NOT assume, for a version with a suffix, the guarantees of this section: that it conforms to any published version or to any other draft. A client that does not know that exact draft MAY work with it under the rules of the version without the suffix, except in its experimental parts ([1.2](https://restep.wubytes.com/1/#experimental)), and handles what differs as it handles any error. The examples in this text say `"1.0"`.
- A minor version MUST NOT reserve parameter names beyond those listed in [5.3](https://restep.wubytes.com/1/#reserved), except names starting with `$`, which are kept for future versions of Restep.
- An incompatible change will be Restep 2, with new URIs (`/2/core`…). The `/1/` URIs, under `https://w3id.org/restep/1/`, will never change; if the text moves to another site, only where they redirect changes.
- Until 1.0 is published, drafts may change incompatibly.

### 1.2 Profiles and dependencies

Each profile only adds requirements; none changes the type or meaning of what an earlier one defines, so announcing a new profile never breaks an existing client. Some profiles need others:

| Profile or extension | Requires | Status |
|---|---|---|
| `core` | Nothing; every Restep API implements it | Stable |
| `query`, `writes`, `cache`, `relations` | `core` | Stable |
| `sync` | `core` and `query` (to fetch changed items by `id`) | Experimental |
| `actions`, `oauth` | `core` | Stable |
| `batch`, `inherit` | `core` | Experimental |
| `filter-expr`, `query-method` | `query` | Experimental |

A server MUST NOT announce a profile or extension without the ones it requires.

Each profile and extension is **stable** or **experimental**, as the table says and the heading of its section repeats.

- A stable one follows [1.1](https://restep.wubytes.com/1/#restep-versions): later minor versions only add to it.
- An experimental one MAY change incompatibly in a minor version, until a version declares it stable. This is the only exception to “whatever conforms to 1.0 still conforms to 1.1”. Moving from experimental to stable is itself such a change only if the text changes.
- It is announced like any other, with its name in `profiles` or `extensions`; there is no separate name for its experimental form. A server MUST implement, for everything it announces, experimental parts included, the text of the version it declares in `restep`.
- A client MUST NOT use an experimental profile or extension unless `restep` declares a version whose text of it the client implements; for a draft or a candidate, that exact one. So a client written for the experimental `sync` of 1.0 stops using it against a server that declares 1.1, until it learns the text of 1.1, instead of following rules that no longer apply. A client uses an experimental profile or extension when it sends a request that only that part defines, or relies on a rule of it to interpret a response; ignoring its members is not using it.

### 1.3 Licence and process

- The text of this specification, its JSON Schemas and the Restep tools are published under the MIT licence. The specification’s repository, [github.com/restep-spec/spec](https://github.com/restep-spec/spec), holds it in English and Spanish with its JSON Schemas and the reference server. The text is read at `restep.wubytes.com`; its identifiers (the URIs of the version, profiles, errors and schemas) live under `https://w3id.org/restep/`, which redirects there.
- The licence allows anyone to copy and modify the text; the name is a separate matter. Only what meets [section 12](https://restep.wubytes.com/1/#conformance), for the profiles and extensions it claims, may be presented as “Restep 1” or as conforming to Restep 1. A modified text must not be presented as Restep or as this specification, though it may say that it is based on Restep 1.
- Questions, proposals and errata are opened as issues in that repository: a requirement that is unclear, two that contradict each other, a case the text does not cover. Pull requests there are welcome as proposals; they are applied at the source, the Restep site, where the specification is written alongside its tools.
- Until 1.0 is published, each change goes into a new draft, and [Appendix C](https://restep.wubytes.com/1/#changes) lists it. After that, a correction that changes no requirement (a typo, a broken link, an example that contradicts the text it illustrates) is published as an erratum in Appendix C without changing the version; any other change waits for a minor version ([1.1](https://restep.wubytes.com/1/#restep-versions)).
- Sections 1 to 12 are normative, except their examples and the sentences without the key words of [section 2](https://restep.wubytes.com/1/#terms). Section 13 explains risks and cites the requirements that address them; the appendices are not normative.

## 2. Terms

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be interpreted as described in [**RFC 2119**](https://www.rfc-editor.org/rfc/rfc2119) and [**RFC 8174**](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in all capitals. Every requirement of this specification carries one of them; sentences without them explain or give examples.

- **API root**: the base URL a client is configured with, such as `https://api.example.com/` or `https://example.com/api/`. Paths in this specification, in the `path` members of discovery and batch and in `events` ([10](https://restep.wubytes.com/1/#sync)), such as `/books`, are relative to it: under `https://example.com/api/`, `/books` means `https://example.com/api/books`. Links in bodies and headers are not: they are URI references ([**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986)) resolved against the request URL.
- **Collection**: a resource grouping items of the same type, such as `/books`.
- **Item**: a resource in a collection, such as `/books/7`.
- **Singleton**: a resource that is neither a collection nor an item of one, declared on its own in discovery, such as `/me` ([5.9](https://restep.wubytes.com/1/#singletons)).
- **Profile**: a named set of requirements (`core`, `query`…) with its own URI, announced in `profiles`. A profile changes what a generic client can assume of the whole API: with `writes`, every non-idempotent `POST` takes `Idempotency-Key`.
- **Extension**: an optional mechanism with a syntax of its own (a method, a path, a parameter form, a header exchange), with its own URI, announced in `extensions`. It changes nothing for a client that does not use it.
- **Reserved parameter**: a query parameter whose meaning Restep defines ([section 5.3](https://restep.wubytes.com/1/#reserved)).
- **Principal**: who a request acts for, as the server authenticates it (in OAuth 2.0, the client and, if there is one, the user). It is not the credential: a request with a renewed token comes from the same principal.
- **Capability**: something a resource declares in discovery within a profile or extension (a filter, an operator, a sort key, a relationship, an action, a language map, a client-chosen `id`). A profile or extension says what a capability means; whether a collection has it is said only by its declaration.
- **Equal as JSON values**: of the same type and, for objects, with the same member names and equal values, whatever their order and whitespace; for arrays, with equal elements in the same order; for numbers, the same decimal number (`1` and `1.0`); for strings, the same sequence of code points once unescaped, without Unicode normalization.

So a new rule goes into a profile when every client of the API may rely on it, into an extension when only a client that uses its syntax meets it, and into a capability when it holds for some collections and not others.

## 3. Data

- Bodies MUST be JSON ([**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259)) encoded as UTF-8. The exceptions are responses without a body (`204`, `304`, `HEAD`), the event stream of [`sync`](https://restep.wubytes.com/1/#sync) and resources outside Restep ([5.9](https://restep.wubytes.com/1/#singletons)). Their strings MUST NOT contain unpaired surrogates, which JSON can carry only escaped; the server MAY reject a request body with one, or with U+0000, with `422 invalid` and a `format` entry.
- A request with a body to a resource of Restep (a `POST` to a collection, an action or a batch; a `QUERY`) MUST carry `Content-Type: application/json`; a `PATCH` follows [5.1](https://restep.wubytes.com/1/#resources). The server MUST answer `415 unsupported_media_type` to any other media type, and to a body without `Content-Type`. An empty body is a body: without `Content-Type` it MUST give `415`, which here prevails over the `400` that its emptiness would also allow ([5.4](https://restep.wubytes.com/1/#error-order)), and with `application/json` it MUST give `400 bad_request`. The one exception is an empty body to an action ([11.1](https://restep.wubytes.com/1/#actions)). This matters most with cookies: a browser sends `text/plain`, `application/x-www-form-urlencoded` and `multipart/form-data` from any origin without a CORS preflight ([5.8](https://restep.wubytes.com/1/#browser-clients)), so a server that read one of them as JSON would accept writes that the preflight exists to stop.
   - The media type is compared case-insensitively, as [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) says. `application/json` defines no parameters ([**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259)): the server MUST accept `charset=utf-8`, in any case and quoted or not, MUST answer `415` to any other `charset`, and MUST ignore other parameters.
   - A `2xx` response with a body MUST carry `Content-Type: application/json`, except the event stream (`text/event-stream`), a JSON Schema, which MAY use `application/schema+json`, and the service status, which MAY use `application/health+json` ([4.4](https://restep.wubytes.com/1/#health)). Errors use `application/problem+json` ([5.4](https://restep.wubytes.com/1/#errors)) whatever `Accept` says: the server MUST NOT answer `406` only because `Accept` does not list `application/problem+json`.
- Field names defined by Restep are `snake_case`. Each API chooses its own, but SHOULD stick to one convention.
- A **name** that an API gives and that discovery declares or a parameter carries (the key of a collection, a singleton, an action, a relationship, a named filter or a reason, and a field that discovery declares or that `filter`, `sort`, `fields`, `include` or [`filter-expr`](https://restep.wubytes.com/1/#filter-expr) names) MUST match this grammar (ABNF, [**RFC 5234**](https://www.rfc-editor.org/rfc/rfc5234)):

```
name = ALPHA *63( ALPHA / DIGIT / "_" / "-" )
```

- It fits `snake_case` and `camelCase`, and is case-sensitive. It never holds `.`, `,`, `[`, `]`, `:` or a space, which parameters and paths use to separate dotted paths, lists, operators and actions, and never starts with `-`, which marks a descending sort ([6.2](https://restep.wubytes.com/1/#sorting)). A dotted path (`author.id`) is names joined by `.`, except that its last segment can be a language tag (`name.es-mx`, [6.1](https://restep.wubytes.com/1/#filters)). A field whose name does not match MAY appear in representations, but the server MUST NOT declare it in discovery, and a parameter that names it gets the error for a field that does not exist or is not declared. An API need not rename fields that it never declares and that no parameter names.
- Member names starting with `_` are reserved for Restep (such as `_actions`, `_etag`). An API MUST NOT define fields with that prefix, except those starting with `_x_`.
- Member names starting with `_x_` are left to extensions outside Restep, which never defines one. They are annotations of the server, like Restep’s own `_` members: a write ignores them ([5.1](https://restep.wubytes.com/1/#resources)), `fields` keeps them ([6.3](https://restep.wubytes.com/1/#fields)), and clients MUST ignore those they do not know. Their values MUST NOT change between two reads of the same version of an item, since they count towards its `ETag` ([7.2](https://restep.wubytes.com/1/#concurrency)). Their names SHOULD carry the extension’s or the organisation’s name after the prefix (`_x_acme_audit`), so two extensions do not collide. What an extension needs a client to write goes in ordinary fields.
- An item’s identifier is called `id`. It MUST be a non-empty string made only of [**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986) unreserved characters (`A–Z a–z 0–9 - . _ ~`), so it can go into a path without escaping, and MUST NOT be `.` or `..`, which URI resolution would remove. It MUST NOT change. Two `id`s are the same only when they are the same sequence of code points: the server MUST NOT treat `abc` as taken by `ABC`, nor serve an item at a path whose last segment is not its `id`, such as item `7` at `/books/07`. The server MUST compare each segment of a path after percent-decoding it, so `/books/%37` is `/books/7`.
- A field whose values may fall outside ±(2^53−1), or that needs exact decimal arithmetic (amounts of money), MUST be a string in every representation, whatever the value: `"price": "18.50"`. An amount of money SHOULD come with its ISO 4217 currency.
- Instants MUST follow [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339) `date-time` with an offset: `"2026-11-12T09:30:00Z"`. Calendar dates MUST use `full-date`: `"1987-03-14"`. Durations SHOULD be ISO 8601 (`"PT90S"`); a field holding seconds as a number SHOULD end in `_seconds`.
- Absent and `null` are different. On reads, a field with no value MAY be omitted or set to `null`, except a language map, which is `{}`; in a `PATCH`, `null` deletes and absent leaves untouched ([**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396)).
- A **relationship**, when a representation includes one, MUST be an object with at least `id` (to-one), a list of such objects (to-many), `null` (an empty to-one) or `[]` (an empty to-many). Never a bare identifier, so the field’s type does not change when the related item is included ([section 9](https://restep.wubytes.com/1/#relations)). When a relationship can point to more than one collection, each object MUST also carry `type` with the target collection’s name. An object MAY carry `href`, the related item’s path as an absolute link (below), and MUST carry it when the target collection is a subcollection, whose item paths cannot be built from `id` alone ([section 9](https://restep.wubytes.com/1/#relations)).
- Links in bodies (`next`, `href`) MUST be absolute URIs or absolute paths, starting with `/` and including the API root’s path (`/api/books?cursor=…`), so a colon inside a segment (`/orders/2001:cancel`) is never read as a scheme, as it would be in the relative reference `2001:cancel`. An absolute URI among these links, among the links of the discovery document, and in the `Location` and `Link` headers of the API’s responses, MUST use `https` or the scheme of the API root; a client MUST NOT dereference one with another scheme, such as `file:` or `data:`.
- Clients MUST ignore fields they do not know and tolerate new enum values, also those that their stored copy of discovery or of a schema does not list: a client MUST NOT reject a response because of such a value, and MAY warn about it. Before sending one, a client MAY check its own input against what it has stored.
- Successful (`2xx`) responses of collections, items and actions MUST NOT depend on `Accept-Language`, and do not need `Vary: Accept-Language`. Numbers, amounts, dates, instants and durations always take the forms of this section; presenting them in a language is the client’s job. Only the API’s own texts change with the language ([5.6](https://restep.wubytes.com/1/#language)).
- A **language map** holds the same text in several languages: a JSON object whose keys are language tags ([**RFC 5646**](https://www.rfc-editor.org/rfc/rfc5646)) and whose values are strings. Only top-level fields of an item can be language maps. Restep says nothing about the language of text fields that are not.

```
"name": { "en": "Zucchini", "en-gb": "Courgette", "es-es": "Calabacín", "es-mx": "Calabacita" }
```

   - Each key MUST be a well-formed tag (the grammar of [**RFC 5646**](https://www.rfc-editor.org/rfc/rfc5646#section-2.1), section 2.1; it need not be in the registry) in lowercase. The server MUST NOT change a key (`iw` does not become `he`). A value can be any string, `""` included.
   - A language map’s type MUST NOT change: it is an object with one translation or none, even if the API speaks one language. A map with no translations MUST be given as `{}`, not absent or `null`, unless the representation leaves the field out (through `fields` or permissions). The server MUST NOT fill a missing translation with another language’s text: the client picks what to show from the keys it gets.
   - In a `POST`, a language map is an object of strings. In a `PATCH` it merges like any object ([**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396)): `{"name": {"fr": "Courgette"}}` adds or changes French and leaves the rest, `{"name": {"fr": null}}` deletes it, and deleting a key that is not there does nothing. After merging, a missing language map is `{}`, so `{"name": null}` empties it. A declared `update` schema ([4.3](https://restep.wubytes.com/1/#describing)) MUST accept `null` for the field and for any well-formed lowercase key.
   - The server MUST validate the body before merging, including the keys it deletes, and MUST answer `422 invalid` with one `errors` entry per failure, with a `pointer` to what fails and this `code`: `type` if the field is not an object or a value is not a string (in a `PATCH`, `null` is valid in both places; in a `POST` it is not); `format` if a key is not a well-formed lowercase tag (`/name/ES`); `unknown` if a translation is added, or given a value other than the stored one, under a well-formed tag the API does not accept.

## 4. Announcing Restep

### 4.1 Profile header

Every API response SHOULD carry one `rel="profile"` link ([**RFC 6906**](https://www.rfc-editor.org/rfc/rfc6906)) to the version URI, and only that one, so the header has the same size whatever the server announces:

```
Link: <https://w3id.org/restep/1/>; rel="profile"
```

Which profiles and extensions the server implements is said only by the discovery document ([4.2](https://restep.wubytes.com/1/#discovery)). Each one still has its own URI, the version URI followed by its name (`https://w3id.org/restep/1/query`), which names it in a problem or a document, but a server SHOULD NOT list them in the headers of every response.

Profiles apply to the whole API; some of their rules hold only where a collection declares them (`filter`, `sync`…). Which collection supports what is said only by the declarations in the discovery document.

### 4.2 Discovery document

A `GET` on the API root returns a document stating the server’s profiles, extensions and capabilities. A `core`-only server SHOULD serve it; a server that announces any other profile or extension, or has language maps ([3](https://restep.wubytes.com/1/#data)), MUST serve it. A server whose root is taken MAY serve it elsewhere and point to it from its responses with `Link: <…>; rel="service-desc"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)). A response MAY carry several `service-desc` links, such as one to an OpenAPI document; the one to the discovery document SHOULD carry `type="application/json"`, and clients MUST use the first target that is a discovery document.

Clients MUST treat a response as a discovery document only if it is a JSON object with a string member `restep`. Without one, clients MUST assume `core` only. If a `Link` header lists profiles and disagrees with the document, the document prevails.

**One document for everyone.** The discovery document describes the API, not what a principal may do with it:

- Its content MUST NOT depend on the principal ([2](https://restep.wubytes.com/1/#terms)) or on whether the request carries credentials; only its texts change, with `Accept-Language` ([5.6](https://restep.wubytes.com/1/#language)). Two documents served under the same `Accept-Language` MUST be equal as JSON values ([2](https://restep.wubytes.com/1/#json-equal)). So two principals get the same document, and a copy kept with a client’s code can be compared with the next one. Everything it declares is visible to whoever can read it ([13.12](https://restep.wubytes.com/1/#privacy)). An API whose collections, fields or capabilities differ by tenant gives each tenant its own API root, with its own discovery document.
- The server MAY require credentials to serve it, answering `401` without them or `403` to a principal that may not read it; whoever it serves it to gets the same document. Its response then depends on credentials ([5.1](https://restep.wubytes.com/1/#private-responses)) and MUST carry `Cache-Control` with `private` or `no-store`; only a document served without credentials MAY be `public` and kept by a shared cache.
- Its response SHOULD carry an `ETag` and a `Cache-Control` with a `max-age`. A client MAY keep it for as long as that `Cache-Control` allows, and SHOULD revalidate it after that. A client that gets `unsupported_parameter` ([5.3](https://restep.wubytes.com/1/#reserved)) or `405` for something its copy declares SHOULD fetch the document again before concluding that the capability is gone.
- What a principal may not do is said by the response to the request, never by leaving it out of discovery. A declared method, action or singleton that this principal may not use MUST give `403 forbidden`, or `404 not_found` where its existence is concealed ([5.4](https://restep.wubytes.com/1/#errors)), never `405` or `unsupported_parameter`. For filters, sorting and `fields` on a field the principal cannot read, see [6.1](https://restep.wubytes.com/1/#filters).

```
{ "restep": "1.0",
  "version": "1",
  "profiles": ["core", "query", "writes", "relations", "sync"],
  "extensions": ["actions", "batch"],
  "batch": { "path": "/batch", "max_operations": 20 },
  "idempotency": { "ttl": 86400 },
  "events": "/events",
  "collections": {
    "books": {
      "path": "/books",
      "description": "Books in the catalogue, one per edition.",
      "methods": ["GET", "POST"],
      "item_methods": ["GET", "PATCH", "DELETE"],
      "schemas": { "create": "/schemas/book-create.json", "update": "/schemas/book-update.json" },
      "filter": {
        "id":        { "type": "string",  "ops": ["eq", "in"] },
        "price":     { "type": "decimal", "ops": ["eq", "lt", "le", "gt", "ge"] },
        "rating":    { "type": "number",  "ops": ["ge", "null"] },
        "category":  { "type": "enum", "values": ["novela-negra", "poesia"], "ops": ["eq", "in"] },
        "author.id": { "type": "string",  "ops": ["eq", "in"] } },
      "named_filters": {
        "available": { "description": "Has at least one copy free to reserve now." },
        "search":    { "type": "string", "description": "Title, author or ISBN contains the text, case-insensitively." } },
      "sort": ["id", "price", "rating", "title"],
      "collations": { "title": "server" },
      "max_limit": 50,
      "count": "estimated",
      "relations": {
        "author":  { "to": "authors", "include": true },
        "reviews": { "to": "reviews", "many": true, "path": "/books/{book_id}/reviews" } },
      "include_depth": 2,
      "sync": { "retention": 604800 },
      "actions": { "reserve": { "on": "item", "safe": false, "idempotent": true,
        "description": "Holds a copy for the user for 48 hours.", "input": "/schemas/reserve.json" } } },
    "reviews": { "path": "/books/{book_id}/reviews", "parent": "books", "id_from": "either",
      "sort": ["id", "created_at"], "max_limit": 50 } },
  "singletons": {
    "me": { "path": "/me", "methods": ["GET", "PATCH"], "description": "The signed-in user’s profile and settings." } } }
```

An API SHOULD link its documentation for people with `Link: <…>; rel="service-doc"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)) in the response that serves its discovery document or, if it serves none, in the response to a `GET` on the API root, with the API root as `anchor` ([**RFC 8288**](https://www.rfc-editor.org/rfc/rfc8288)) if that response is an error. A response MAY carry several, and each MAY state the languages of its target with `hreflang`; a client picks among them by `hreflang`, so the server need not choose them by `Accept-Language`. That documentation explains what discovery cannot say, such as business rules, the permissions each operation needs, usage limits and examples. Where it contradicts discovery, discovery prevails.

```
Link: <https://docs.example.com/api/>; rel="service-doc"; hreflang="es",
      <https://docs.example.com/en/api/>; rel="service-doc"; hreflang="en"
```

- Each profile adds its own fields to the document, described in its section. Every object that this text defines in the document belongs to Restep: the root, each collection and each singleton, `schemas`, `batch`, `idempotency`, `sync`, and each filter, named filter, relation, action, deprecation, language map, reason and inheritance object. A later minor version can add members to any of them, so a server MAY add its own members to any of them, and every member it adds that this text does not define MUST start with `x-`; clients ignore the members they do not know (below). This does not apply to the names the API gives its collections, singletons, fields, relations, actions and reasons, which are keys of `collections`, `singletons`, `filter`, `named_filters`, `relations`, `actions`, `language_maps`, `collations`, `reasons` and `inherit`, and follow the grammar of names ([3](https://restep.wubytes.com/1/#names)).
- Clients MUST ignore members they do not know in the discovery document and in every object in it. Where a member that Restep defines has a value the client does not know (a filter’s `type`, an action’s `on` or `method`, a deprecation’s `kind`, a value reserved for minor versions), the client MUST NOT fail because of it and MUST NOT use what that value qualifies: it treats that filter, action or notice as if it were not declared, unless this text gives another rule for that member (`id_from` in [5.1](https://restep.wubytes.com/1/#client-ids), singletons in [5.9](https://restep.wubytes.com/1/#singletons), `collations` in [6.1](https://restep.wubytes.com/1/#collations), `from` in [11.6](https://restep.wubytes.com/1/#inheritance)).
- `language_maps`: the fields of a collection that are language maps ([3](https://restep.wubytes.com/1/#data)), as an object whose keys are the field names: `"language_maps": {"name": {}, "description": {}}`. It MUST list all of them; if it is missing, the collection has none. The object of each field is left for minor versions.
- A collection’s `path` MAY be a URI template ([**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570)); subcollections are declared that way. Its variables MUST be simple strings (`{name}`) with distinct names, so `/authors/{author_id}/books/{book_id}/reviews`, not `{id}` twice; they take in order the `id`s of the parent items ([5.1](https://restep.wubytes.com/1/#resources)). Such a collection MUST name in `parent` the collection whose items it hangs from, and its `path` MUST start with that collection’s `path` followed by `/` and its last variable: `"reviews": {"path": "/books/{book_id}/reviews", "parent": "books"}`.
- `id_from` ([5.1](https://restep.wubytes.com/1/#resources)) and `collations` ([6.1](https://restep.wubytes.com/1/#filters)) are capabilities of a collection; `singletons` lists the API’s singletons ([5.9](https://restep.wubytes.com/1/#singletons)).
- Field types, where discovery declares them, come from this list: `string`, `integer`, `number`, `decimal` (a string matching `-?[0-9]+(\.[0-9]+)?`), `boolean`, `date`, `datetime`, `duration` and `enum` (with its `values`). Discovery only declares types where Restep needs them, such as filters; the shape of whole representations and request bodies goes in the schemas of [4.3](https://restep.wubytes.com/1/#describing). A representation MAY also link its schema with `rel="describedby"`.
- An origin that lists its APIs in `/.well-known/api-catalog` ([**RFC 9727**](https://www.rfc-editor.org/rfc/rfc9727)) MAY include a Restep API there, with the API root as `anchor`, a `service-desc` link to its discovery document and, if there are any, its `service-doc` links.

### 4.3 Describing operations

Optional members that let a client, a person reading the document or an agent picking a tool, know what each collection does and accepts without trying it. A server MAY declare any of them on any collection; Restep requires none, so a `core` server can still be written by hand.

- `methods` and `item_methods`: the methods a collection and its items support, out of `GET`, `POST`, `PATCH` and `DELETE` (`HEAD` goes with `GET`; actions and `QUERY` are announced on their own). A missing list means unknown, not all. A declared list MUST be exact: a method left out gives `405`, unless an error that comes first in [5.4](https://restep.wubytes.com/1/#errors) applies, a listed one never does, and the `Allow` header of a `405` MUST list every declared method and no other of those four.
- `description`: a short plain-text explanation of a collection, a singleton, a filter field, a relationship, an action, an inherited field ([11.6](https://restep.wubytes.com/1/#inheritance)) or a reason ([5.4](https://restep.wubytes.com/1/#errors)). It SHOULD be one sentence.
- `schemas`: JSON Schemas ([2020-12](https://json-schema.org/draft/2020-12)) of a collection’s `item` (its representation without `fields` or `include`), `create` (the body of a `POST`) and `update` (the body of a `PATCH`: a merge patch, where absent leaves a field untouched and `null` deletes it). Each is a schema object or a link to one, absolute as links in bodies are ([3](https://restep.wubytes.com/1/#data)). Schemas can describe each field with its own `description`.
- A `default` in a top-level property of `create` is the value the field takes when a `POST` leaves it out, and the server MUST give it that value; a field sent as `null` is not left out. In `update` a `default` means nothing, because a field absent from a `PATCH` stays as it is.
- A client can build a form for people from these schemas ([Appendix A](https://restep.wubytes.com/1/#forms)). It shows fields in the order of `properties`, so a server SHOULD write them in the order it wants them shown.
- Before validating a body against a declared `create` or `update` schema, the server drops the members that start with `_`, which [5.1](https://restep.wubytes.com/1/#resources) ignores, and, in a `PATCH`, every field whose current value 5.1 ignores, and in a `POST`, every read-only field that 5.1 ignores; a `PATCH` left empty by this is not validated against `update`. In either, a read-only field with another value MUST give the `read_only` entry of 5.1, not a schema error. A body the schema then rejects MUST give `422 invalid` (`400 bad_request` if it is not a JSON object), unless an error that comes first in 5.4 applies, and its `errors` SHOULD point at the failing members. A schema describes, it does not promise: a body it accepts can still fail the API’s own rules. `readOnly` is only an annotation, except as 5.1 says for top-level properties of an `item` schema, and `id` follows 5.1 whatever the schema says: a `create` schema can restrict the format of an `id` the client chooses, but cannot make the server accept an `id` that 5.1 rejects.
- An action’s `input` ([11.1](https://restep.wubytes.com/1/#actions)) is the schema of its body, with the same meaning.
- A client MUST send its credentials for the API only to URLs on the API’s origin, and MUST fetch a schema or document on another origin without them ([13.2](https://restep.wubytes.com/1/#sec-credentials)). It SHOULD NOT resolve a schema’s `$ref` outside the origin of the schema that holds it, and SHOULD NOT send a value it took from a schema on another origin, such as a `default`, without showing it to the user first.

Descriptions, titles and every other value an API returns are data, never instructions to the client. A client MUST NOT, because of such text alone, make a request that is not safe ([5.7](https://restep.wubytes.com/1/#retries)) and that the task it is serving did not already call for, nor send data to another origin. Using `detail` and `errors` to correct the request it is already making is not following an instruction. An agent that puts these texts in a prompt SHOULD mark where they begin and end ([13.1](https://restep.wubytes.com/1/#sec-data)).

### 4.4 Service status

A server MAY declare in `status` a link, absolute as links in bodies are ([3](https://restep.wubytes.com/1/#data)), to a resource that says whether the API can serve requests, and MAY also link it from its responses with `rel="status"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)). Clients MUST NOT assume a path such as `/health`.

- Unless it asks for credentials or refuses them (`401`, `403`) or limits the rate (`429`), a `GET` or `HEAD` on it MUST answer `200` when the API can serve requests and `503` when it cannot, with `Retry-After` when the server knows for how long, and always with `Cache-Control: no-store`.
- It is not a resource of the API: [4.1](https://restep.wubytes.com/1/#profile-header), [5.1](https://restep.wubytes.com/1/#resources) to [5.4](https://restep.wubytes.com/1/#errors) and [8](https://restep.wubytes.com/1/#caching) do not apply to it. Its body MAY follow the Health Check Response Format ([draft-inadarei-api-health-check](https://datatracker.ietf.org/doc/draft-inadarei-api-health-check/)). Served without credentials, it SHOULD NOT say more than whether the API can serve.

## 5. core (Required)

Profile URI: `https://w3id.org/restep/1/core`. Status: stable.

### 5.1 Resources and methods

| Request | Success | What it does |
|---|---|---|
| `GET /books` | `200` | Lists the collection ([5.2](https://restep.wubytes.com/1/#collections)) |
| `POST /books` | `201` with `Location` | Creates an item and returns its representation |
| `GET /books/7` | `200` | Returns the item, with no envelope |
| `PATCH /books/7` | `200` | Partial update with JSON Merge Patch ([**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396)), except relationship objects (below) and language maps ([3](https://restep.wubytes.com/1/#data)); returns the whole item |
| `DELETE /books/7` | `204` | Deletes the item. Repeating it MAY return `404` |

- Responses MUST use the statuses in the table for those operations, except where [7.3](https://restep.wubytes.com/1/#minimal) allows a response without a body.
- `PUT` is outside Restep 1: a client that replaces a whole item would erase fields added to the item after that client was written. Clients SHOULD use `PATCH`.
- `HEAD` MUST be supported wherever `GET` is ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110)). `GET` and `HEAD` MUST NOT have effects visible to the client.
- A response that depends on credentials MUST carry `Cache-Control` with `private` or `no-store`, whether or not the server announces [`cache`](https://restep.wubytes.com/1/#cache), so that a shared cache never gives it to another principal ([**RFC 9111**](https://www.rfc-editor.org/rfc/rfc9111)). Credentials are whatever the server authenticates the request with: `Authorization`, cookies, a client certificate. A response that changes with a cookie depends on credentials, and so does an error whose status depends on who asks, such as a `404` that conceals an item from this principal only, a `401` or `403`, or a discovery document served only with credentials ([4.2](https://restep.wubytes.com/1/#discovery-cache), [13.10](https://restep.wubytes.com/1/#sec-cache)). This covers every response of the API, those of resources outside Restep ([5.9](https://restep.wubytes.com/1/#outside)) and the errors of the server’s authentication layer included.
- A method the resource does not support MUST return `405` with an `Allow` header. `OPTIONS` is outside Restep: servers MAY answer it for CORS ([5.8](https://restep.wubytes.com/1/#browser-clients)).
- `PATCH` MUST accept `application/merge-patch+json` and SHOULD also accept `application/json` with the same meaning. Any other media type, or none, MUST give `415`, and `charset` follows [3](https://restep.wubytes.com/1/#media-types). A `415` to a `PATCH` SHOULD carry `Accept-Patch` ([**RFC 5789**](https://www.rfc-editor.org/rfc/rfc5789)). A patch that is not a JSON object MUST give `400 bad_request`.
- An item’s path MUST be its collection’s path, with any URI template expanded ([**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570)), its variables taking in order the `id`s of the parent items, and without a trailing `/`, followed by `/` and the item’s own `id`: `/books/7`, `/books/7/reviews/3`.
- Who chooses an item’s `id` is a capability of its collection, declared in `id_from`:
   - Missing or `"server"`: the server MUST assign `id`, and MUST give `422 invalid`, with a `read_only` entry at `/id`, to a `POST` that carries one.
   - `"client"`: a `POST` MUST carry `id`; without it, the server MUST give `422 invalid` with a `required` entry at `/id`.
   - `"either"`: a `POST` MAY carry `id`; without it, the server assigns one.
   - Other values are reserved for minor versions. A client that finds one it does not know MUST NOT send `id` in a `POST` to that collection.
- Whoever chooses it, an `id` never changes: a `PATCH` that carries a different one MUST give `422 invalid` with a `read_only` entry, as below. For an `id` the client chooses:
   - It follows [3](https://restep.wubytes.com/1/#data). One that does not (not a string, empty, with other characters, `.` or `..`) MUST give `422 invalid` with a `type` or `format` entry at `/id`. The server MAY restrict its format further, and then SHOULD say how in the `create` schema ([4.3](https://restep.wubytes.com/1/#describing)); a well-formed `id` outside that format gets the same `422` with `format`. The server SHOULD require a format with enough entropy that clients do not collide by chance, such as a UUID or a ULID; where it conceals from some principals the existence of items of that collection ([5.4](https://restep.wubytes.com/1/#errors)), it MUST require a format that cannot be guessed, such as a version 4 UUID, because the `409` below tells whether an `id` is in use. A client SHOULD generate such an `id` from a random source and SHOULD NOT derive it from the item’s data (an email, a name), since whoever can guess it can take it first or learn from the `409` below that it exists ([13.6](https://restep.wubytes.com/1/#sec-client-ids)).
   - An `id` that an item of the same collection (for a subcollection, under the same parent item) has or has had MUST give `409 conflict` with an `errors` entry whose `pointer` is `/id` and whose `code` is `taken`. That response MUST be the same whether or not the client can see the item that holds the `id`, or could see the one that held it. The server MUST know these `id`s for as long as the collection exists; a subcollection exists as long as its parent item does. A server that reuses the `id` of a deleted parent item, which the next point advises against, MUST NOT let the new parent’s subcollection take an `id` that the old one had. It MAY keep only a one-way hash of the `id`s of deleted items.
   - So a client never gets back the `id` of a deleted item: with [`sync`](https://restep.wubytes.com/1/#sync), it could not tell the new item from the old one coming back. For the same reason, the server SHOULD NOT reuse in a collection the `id`s it assigns itself.
   - So a `POST` with an `id` chosen by the client never creates two items. A client that repeats it and gets `409` with `taken` reads the item to learn whether its first attempt took effect ([5.7](https://restep.wubytes.com/1/#retries)); with [`writes`](https://restep.wubytes.com/1/#writes), `Idempotency-Key` works as for any `POST` and returns the stored response instead ([7.1](https://restep.wubytes.com/1/#idempotency)).
- In a write, the server MUST ignore members whose names start with `_`, so a client can send back a representation it read.
- A **read-only field** is one no client can change with a `PATCH`: `id`, an effective field ([11.6](https://restep.wubytes.com/1/#inheritance)), one only the server sets (`created_at`, a total), or a top-level property that the `item` schema marks `"readOnly": true` directly in its `properties` ([4.3](https://restep.wubytes.com/1/#describing)); a server MUST NOT mark so a property that some client or some state of the item lets change with a `PATCH`. A value in a `PATCH` is **current** when it equals the field’s value as read under the field’s type (the same decimal, the same instant), or when applying it as this section says (a relationship by its `id`, a language map by key) leaves the field as it was before the `PATCH`. If a `PATCH` carries a read-only field with its current value, the server MUST ignore it; with another value, it MUST respond `422 invalid` with a `read_only` entry whose `pointer` is the field, and MUST NOT apply any of that request. A field that this client, or the item’s current state, does not let it change follows the first half of that rule: its current value MUST be ignored, and another value MUST give `403 forbidden` if this principal may not change it, or `409 conflict` if the item’s state does not allow it, without applying any of that request; either SHOULD carry an `errors` entry whose `pointer` is the field. For a field the client is allowed to read, the server compares after validating a language map as [3](https://restep.wubytes.com/1/#data) says. For a field it cannot read, neither the rules above nor the checks of 3 that look at the stored value apply: the server MAY validate the value sent (a write-only field, such as a password, is validated as any other), but its answer MUST NOT depend on the stored value.
- In a `POST`, a read-only field other than `id` (whose rules are above) MUST be ignored if its value is the one the item would get, and otherwise MUST give `422 invalid` with a `read_only` entry whose `pointer` is the field. The case is a representation that was read and is sent back; a client that does not know that value, such as a `created_at` the server sets, leaves the field out.
- A valid `PATCH` that, setting aside the fields it ignores, would change no data of the item MUST NOT change it: its representation and its `ETag`, if any, stay the same, and a field such as `updated_at` does not move. So the read-only fields of a representation that was read never make a `PATCH` fail or change anything, if the item has not changed since.
- In a write, a relationship object is replaced whole, not merged: the server MUST read only its `id` (and `type`, and `href` when its target is a subcollection) and MUST NOT change the related item through it. To link an item of a subcollection the client MUST send its `href`, as read; an `href` that is not the path of an item of the target collection, or whose last segment is not the `id` sent, MUST give `422 invalid`. A relationship to an item that does not exist, or that the principal cannot see, MUST give `422 invalid` with an entry whose `pointer` is the relationship’s `id` (`/author/id`) and whose `code` is `unknown`, the same in both cases. A relationship whose value is current (it leaves the field as it was) is not checked this way: the server MUST ignore it, so sending back a representation as read never fails because of it. `{"author": {"id": "4"}}` links another author; `{"author": null}` unlinks it. A to-many list is replaced whole, as Merge Patch does with any array.

### 5.2 Collections

A collection MUST respond with an object holding `items` (a list) and `next`: the URL of the next page, or `null` when there are no more. `next` MUST always be present, even if the server does not paginate yet.

```
{ "items": [ { "id": "7", "title": "La niebla de Portugalete" } ],
  "next": null }
```

- Clients MUST follow `next` as is, without changing or building it, except for the parameters [6.4](https://restep.wubytes.com/1/#pagination) lets them change between pages. Encoding it again does not count as changing it: the server MUST read parameters after percent-decoding, so `filter[price]` and `filter%5Bprice%5D`, or `%5b` and `%5B`, are the same, and MUST NOT depend on the order of parameters with different names. The server MUST read a `+` in the query as a space, as HTML forms and most HTTP frameworks do, and MUST write a literal `+` as `%2B` in the links it builds; a client MUST send a literal `+` as `%2B`. Wherever this text says “after percent-decoding” of the query, a `+` is a space.
- A collection MUST have a deterministic default order. When that order, or a sort ([6.2](https://restep.wubytes.com/1/#sorting)), uses `id`, it is the server’s order of its `id`s: total and stable, but not necessarily by code points (with numeric `id`s, `"7"` may go before `"12"`). Clients MUST NOT assume any order of `id`s. Without concurrent writes, following `next` until `null` MUST return every item exactly once. With concurrent writes, items may be repeated or missed; a client that needs an exact copy uses [`sync`](https://restep.wubytes.com/1/#sync).
- The server picks the page size. Without the `query` profile, clients cannot change it.
- The object MAY carry other fields defined by profiles (`total`, `state`).

### 5.3 Reserved parameters: fail loudly

These parameter names, with or without brackets, belong to Restep: `filter`, `sort`, `fields`, `include`, `count`, `limit`, `cursor`, `since` and `languages` (unused in Restep 1), plus any name starting with `$`.

The forms Restep defines are `name=value` and, for `filter`, `filter[field]` and `filter[field][op]`. Any other bracketed form (`filter[a][b][c]`, `filter[]`, `fields[]`) is a form the resource does not support.

> Unless an error that comes first in [5.4](https://restep.wubytes.com/1/#errors) applies, when a request uses a reserved parameter, or a form of one, that the resource does not implement for that method, the server MUST respond `400` with the code `unsupported_parameter` and the parameter name, exactly as received after percent-decoding, in `parameter`. It MUST NOT ignore it.

This is the rule that lets a server climb a step without breaking anyone: a client filtering against a server that cannot filter gets a clear error instead of the whole collection, as if the filter had been applied. Non-reserved parameters belong to each API, and Restep says nothing about them.

The two parameter codes tell a client whether to change the request or give up on the capability:

- `unsupported_parameter` MUST be used when the request asks for something the resource does not offer: a reserved parameter it does not implement, a parameter form it does not support (`filter=…` without [`filter-expr`](https://restep.wubytes.com/1/#filter-expr), `sort[…]`), a filter field or operator, sort key or relationship that is not declared, `count` with any value on a collection that does not declare it ([6.5](https://restep.wubytes.com/1/#counts)), or `fields` or `include` on a method other than `GET`, `HEAD` and `QUERY` ([6.3](https://restep.wubytes.com/1/#fields)). It applies to every method: `POST /books?filter[x]=1` gives it too.
- `invalid_parameter` MUST be used when a supported capability gets a wrong value: a value that does not match the field’s type, a `limit` out of range, a field in `fields` that does not exist, an empty list, a repeated parameter, a bad cursor. Like `unsupported_parameter`, it MUST carry in `parameter` the name of the parameter at fault, exactly as received after percent-decoding; for a missing one, its name; in the body of a `QUERY` ([11.4](https://restep.wubytes.com/1/#query-method)), the name of the equivalent `GET` parameter, such as `filter[price][le]`, or the member’s own name when there is none. With several at fault, `parameter` names one of them, and `errors` MAY list each with its `parameter`. A server whose framework keeps only one value of a repeated parameter MUST still detect the repetition, reading the query string itself if it has to.
- Some limits are declared: `max_limit` ([6.4](https://restep.wubytes.com/1/#pagination)), `include_depth` ([9](https://restep.wubytes.com/1/#relations)) and `batch.max_operations` ([11.2](https://restep.wubytes.com/1/#batch)). A server MAY also limit, without declaring it, how much a request asks of a supported capability: the values of an `in` list, the number of filters, the size of a [`filter-expr`](https://restep.wubytes.com/1/#filter-expr) expression. A request over such a limit MUST give `invalid_parameter` naming the parameter, whose `detail` SHOULD state the limit; the server MUST NOT apply only part of it, nor answer `unsupported_parameter`, since the capability exists. A URL longer than the server accepts MUST give `414`, a body larger than it accepts `413`, and too many requests or open streams `429` ([13.8](https://restep.wubytes.com/1/#sec-limits)).

### 5.4 Errors

Every `4xx` or `5xx` response the API generates MUST use `application/problem+json` ([**RFC 9457**](https://www.rfc-editor.org/rfc/rfc9457)) when it has a body, with `type`, `title`, `status` (equal to the response’s) and a `code`. It SHOULD carry `detail`, saying, where it can, how to fix the request (the accepted values, the allowed range), and MAY carry `instance` and its own members. An error MUST NOT be sent as a `200` response; the only place an error goes inside a `200` is a per-operation result of [`batch`](https://restep.wubytes.com/1/#batch).

```
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{ "type": "https://w3id.org/restep/1/errors#invalid",
  "title": "Invalid data",
  "status": 422,
  "code": "invalid",
  "errors": [ { "pointer": "/price", "code": "required", "detail": "price is required." } ] }
```

- `code` MUST come from the table below. For a status the table does not list, `code` MUST be that status’s description in the IANA HTTP Status Code Registry, in `snake_case` (`502` → `bad_gateway`, `431` → `request_header_fields_too_large`), or `http_` followed by the number for an unregistered status.
- `type` SHOULD be `https://w3id.org/restep/1/errors#` followed by the code, or a URI of the API’s own that documents the case. It MAY be `about:blank`.
- For errors of the API’s domain (insufficient funds, out of stock) the response MAY add `reason`: a string defined by the API and stable within a version, which MUST follow the grammar of names ([3](https://restep.wubytes.com/1/#names)) and SHOULD be `snake_case`. `code` keeps the class (`conflict`, `invalid`), so a generic client still knows what to do.
- The API MAY declare its reasons in discovery, in `reasons` at the root: an object whose keys are the values of `reason`; each value carries the `code` that reason comes with and MAY carry a `description` ([4.3](https://restep.wubytes.com/1/#describing)): `"reasons": {"out_of_stock": {"code": "conflict", "description": "No copies left to reserve."}}`. If declared, it MUST be complete: a problem MUST NOT carry a `reason` that is not in it, nor carry it with another `code`. This applies to the top-level `reason` of every problem, also those in [`batch`](https://restep.wubytes.com/1/#batch) results, and not to the API’s own codes inside `errors`. If `reasons` is missing, which reasons exist is unknown. A client MUST handle a `reason` it does not know as it handles its `code`, so adding a reason never breaks it.
- Validation errors SHOULD list the problems in `errors`. Each entry has a `pointer` (a JSON Pointer, [**RFC 6901**](https://www.rfc-editor.org/rfc/rfc6901), into the request body; Restep uses the plain string form, not the URI fragment), or a `parameter` or `header` name, plus a `code`: `required`, `type`, `format`, `range`, `too_long`, `unknown`, `read_only`, `taken` (an `id` already used, [5.1](https://restep.wubytes.com/1/#resources)), or one of the API’s own.
- A `401` MUST carry `WWW-Authenticate` ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110)).
- Clients MUST handle a `code` they do not know according to the class of the `status`.
- A problem, its `detail` and its `errors` entries included, MUST NOT reveal what the principal could not otherwise learn: values it cannot read, or whether a concealed resource exists, except that an `id` is taken ([5.1](https://restep.wubytes.com/1/#resources)). It SHOULD NOT carry internal details, such as stack traces, queries or the names of internal services ([13.12](https://restep.wubytes.com/1/#privacy)).
- When more than one of these errors applies to a request, the server MUST report one of the earliest step that applies, in this order:
   1. `401`, then `403`;
   2. `404`, then `410`;
   3. `405`;
   4. `400` for a parameter or a header: `unsupported_parameter` and `invalid_parameter`, which are not ordered between themselves, before the codes of a header (`bad_request`, `idempotency_key_required`);
   5. any one of `400` for the body, `415`, `406` and `413`, which are not ordered among themselves, except that an empty body without `Content-Type` gives `415` ([3](https://restep.wubytes.com/1/#media-types));
   6. a replay or a `409 request_in_progress` ([7.1](https://restep.wubytes.com/1/#idempotency));
   7. `428`, then `412`, then `422` or the `403` for a field that this principal may not change ([5.1](https://restep.wubytes.com/1/#resources)), then `409 conflict`, including the one for a field that the item’s state does not let change.
- Step 1 covers a `403` that does not depend on the body or on the stored item. Other codes that share a status are not ordered. The order also decides between errors that other sections require ([4.3](https://restep.wubytes.com/1/#describing), 5.3, [10](https://restep.wubytes.com/1/#sync), [11](https://restep.wubytes.com/1/#extensions)). Before giving an error, the server MUST rule out those of earlier steps that it can check. A `413`, or any other error, given by an HTTP server or an intermediary placed in front of the API before the request reaches it is outside this order. Whether conditional headers are evaluated at all follows [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.1) (section 13.2.1); when they are, this order prevails over the point at which [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.2) (section 13.2.2) evaluates them, so a body that is not JSON gives `400` before a failed precondition. The order says nothing about statuses it does not list, such as `414`, `424`, `429` and `5xx`. When the API does not reveal whether a resource exists, the server MUST give `404` for it, not `403`; a retired resource MUST give `410`, not `404`, unless its existence is concealed.

| `code` | Status | When | Profile |
|---|---|---|---|
| `bad_request` | 400 | The body is not JSON or does not have the expected shape; a malformed or refused header | core |
| `invalid_parameter` | 400 | A supported parameter has a wrong value ([5.3](https://restep.wubytes.com/1/#reserved)) | core |
| `unsupported_parameter` | 400 | The resource does not offer what the parameter asks for ([5.3](https://restep.wubytes.com/1/#reserved)) | core |
| `idempotency_key_required` | 400 | The resource requires `Idempotency-Key` and it is missing | writes |
| `unauthenticated` | 401 | Missing or invalid credentials; sent with `WWW-Authenticate` | core |
| `forbidden` | 403 | Valid credentials without permission for this, where the client may know the resource exists | core |
| `not_found` | 404 | The resource does not exist, or its existence is not to be revealed | core |
| `method_not_allowed` | 405 | The resource does not support that method; sent with `Allow` | core |
| `not_acceptable` | 406 | The server cannot produce any type in `Accept` | core |
| `conflict` | 409 | Clashes with the current state: a duplicate (such as an `id` already used, [5.1](https://restep.wubytes.com/1/#resources)), an impossible transition, an action not available in the item’s state ([11.1](https://restep.wubytes.com/1/#actions)) | core |
| `request_in_progress` | 409 | The same request as one still running under the same `Idempotency-Key` ([7.1](https://restep.wubytes.com/1/#idempotency)); SHOULD come with `Retry-After` | writes |
| `state_expired` | 410 | The server can no longer compute changes since that state | sync |
| `retired` | 410 | A resource or action removed after its `Sunset` date ([5.5](https://restep.wubytes.com/1/#versions)) | core |
| `precondition_failed` | 412 | A precondition (`If-Match`, `If-None-Match`) of a write failed: the resource changed since the client read it, or `If-None-Match` matched it | writes |
| `content_too_large` | 413 | The body is too large, or a batch exceeds `max_operations` | core |
| `uri_too_long` | 414 | The URL is too long (see [`query-method`](https://restep.wubytes.com/1/#query-method)) | core |
| `unsupported_media_type` | 415 | Content type not supported, or missing on a body ([3](https://restep.wubytes.com/1/#media-types)) | core |
| `invalid` | 422 | The body is understood but not valid; details in `errors` | core |
| `idempotency_mismatch` | 422 | The same `Idempotency-Key` with a different request | writes |
| `not_executed` | 424 | A batch operation that left no effect because another one failed | batch |
| `precondition_required` | 428 | The resource requires `If-Match` to write | writes |
| `rate_limited` | 429 | Too many requests; SHOULD come with `Retry-After` | core |
| `internal` | 500 | Server failure | core |
| `not_implemented` | 501 | The server does not know the method (such as `QUERY`) | core |
| `unavailable` | 503 | Temporarily unavailable; SHOULD come with `Retry-After` | core |

### 5.5 Evolution and versions

A Restep API evolves without versions as long as changes are compatible, and only creates a major version when there is no other way.

**Compatible changes.** A server MAY make them at any time: adding fields to a representation; adding optional parameters, collections, singletons, actions or enum values; supporting new filters, sorts or includes; adding profiles or extensions; declaring `reasons` or adding reasons to it ([5.4](https://restep.wubytes.com/1/#errors)). They work because clients ignore what they do not know ([section 3](https://restep.wubytes.com/1/#data), [4.2](https://restep.wubytes.com/1/#unknown-members)).

**Breaking changes.** A server MUST NOT make them within a version, except through retirement (below):

- removing or renaming a field, or changing its type or meaning;
- making an input field, parameter or header required when it was not (including `If-Match` through `428`, and `Idempotency-Key`);
- tightening validation so that a request accepted before is now rejected (making read-only a field that could be written, or starting to refuse `Idempotency-Key` without credentials, [7.1](https://restep.wubytes.com/1/#anonymous-keys), too), unless it closes a security hole;
- removing a declared filter (named ones too), operator, sort key, relationship, inclusion, count, action, collection, singleton, profile, extension or method ([4.3](https://restep.wubytes.com/1/#describing)), a value of a declared enum, a collection’s `sync` or the API’s `events` ([10](https://restep.wubytes.com/1/#sync));
- changing the format of `id`s, resource URLs or a collection’s default order, or a field’s collation ([6.1](https://restep.wubytes.com/1/#filters));
- changing the status or the `code` returned for the same case;
- removing `reasons` once declared, removing a reason from it, or changing a reason’s `code`.

**Retiring.** Within a version, a field or a declared capability can only disappear by retiring it:

- It is announced first. Discovery MUST list it in `deprecations`: `{"kind": "field", "name": "rating", "announced": "2026-12-01T00:00:00Z", "sunset": "2027-07-01T00:00:00Z"}`. `kind` says what is retired, and where the notice goes:
   - At the root: `version`; `profile` and `extension`, with its name in `name`; `collection` and `singleton`, with its key in `name`; `reason` ([5.4](https://restep.wubytes.com/1/#errors)), with the reason in `name`.
   - In the collection: `field`; `filter` (also a named filter); `operator`, with the filter field in `name` and the operator in `op`; `value`, with the filter field in `name` and the enum value in `value`; `sort`; `relation`; `include`, with the relationship in `name`, which retires its expansion but not the relationship; `count`; `max_limit`, with the lower limit it will have in `value`; `action`; `method` and `item_method`, with the method in `name`.
   - In a singleton: `field` and `method`.
- `announced` MUST be the instant the notice was first published, and MUST NOT change afterwards. `sunset`, once there is a date, is the instant of the removal. Both are [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339) instants. A `field` notice also covers the filters, sort keys and inclusions of that name and every dotted path that starts with it (`name.es-mx` for `name`, `author.id` for `author`), which go with the field. A `count` notice with `"value": "estimated"` announces that a declared `"exact"` count will become `"estimated"`; without `value`, that `count` will be removed. Responses that use what a notice retires MUST carry `Deprecation` ([**RFC 9745**](https://www.rfc-editor.org/rfc/rfc9745)) and a `Link` with `rel="deprecation"` to the explanation. They are: for `field`, every response that carries the field and every response to a request that names it in a parameter; for `filter`, `operator`, `value`, `sort`, `relation`, `include` and `count`, every response to a request that uses them; for `max_limit`, every response to a request with a `limit` above the new value; for `action`, `method` and `item_method`, every response to them; for `collection` and `singleton`, every response of that resource and its items; for `reason`, every problem with that reason; for `version`, `profile` and `extension`, every response. When what is retired is a whole resource, an action or a version, its responses MUST also carry `Sunset` ([**RFC 8594**](https://www.rfc-editor.org/rfc/rfc8594), as an HTTP-date) once there is a date.
- At least six months SHOULD pass between `announced` and `sunset`.
- After the date, a retired resource, singleton, action or version MUST respond `410 retired`; a retired filter, operator, sort, relationship, inclusion or count (a `count` notice without `value`) MUST give `400 unsupported_parameter`, like any undeclared one; after a `count` notice with `"value": "estimated"`, discovery MUST declare that `count` as `"estimated"`, and `count=true` still adds `total`, with `"total_estimated": true` when the number is approximate; a retired enum value in a filter MUST give `invalid_parameter` and no longer appear in data; a `limit` above a lowered `max_limit` MUST give `invalid_parameter`; a retired method MUST give `405`; a retired field MUST be absent from representations and is, for parameters and writes, a field that does not exist ([6.3](https://restep.wubytes.com/1/#fields)); a retired reason MUST NOT be given; a retired profile or extension MUST leave `profiles` or `extensions`, and its requirements no longer apply. Retiring a profile or extension also retires those that require it ([1.2](https://restep.wubytes.com/1/#dependencies)), with the same `sunset`.

**Other changes.** These are classified as follows; “retire” means the change is breaking and can be made through retirement, with the `kind` given.

| Change | Class |
|---|---|
| `count` from `"estimated"` to `"exact"` | Compatible |
| `count` from `"exact"` to `"estimated"` | Retire (`count`, with `"estimated"` in `value`) |
| An action becomes `safe` or `idempotent` | Compatible |
| An action stops being `safe` or `idempotent` | Breaking: retire the action (`action`) and declare another name |
| Raising `idempotency.ttl`, `sync.retention` or `max_limit` | Compatible |
| Lowering `idempotency.ttl` or `sync.retention` | Compatible if the new value still meets the minimum of this specification ([7.1](https://restep.wubytes.com/1/#idempotency), [10](https://restep.wubytes.com/1/#sync)) and the server keeps the old one for keys stored and states issued before the change |
| Lowering `max_limit` | Retire (`max_limit`, with the new limit in `value`) |
| No longer declaring `max_limit` | Breaking: `limit` is not accepted without it ([6.4](https://restep.wubytes.com/1/#pagination)) |
| No longer declaring `methods`, `item_methods`, `schemas` or a `description`, while the API behaves the same | Compatible: a missing declaration means unknown ([4.3](https://restep.wubytes.com/1/#describing)) |
| Removing a property from a schema, or relaxing it | Compatible if every request it accepted is still accepted and every field it described is still there; otherwise, the change to the field or to validation is what counts |
| `id_from` from missing or `"server"` to `"either"` | Compatible only if the server can tell every `id` the collection has had ([5.1](https://restep.wubytes.com/1/#client-ids)); otherwise breaking |
| Any other change of `id_from` | Breaking |
| `collations` from `"server"` to a value that names the equality and order already in use | Compatible |
| Any other declaration or change of `collations` for a field | Breaking, unless the field’s filter and sort key are new |

```
GET https://api.example.com/v1/books/7
→ 200
Deprecation: @1798761600
Sunset: Thu, 01 Jul 2027 00:00:00 GMT
Link: </v2/>; rel="successor-version",
      <https://docs.example.com/v2>; rel="deprecation"

GET https://api.example.com/v1/books/7   after 1 July 2027
→ 410 application/problem+json
{ "type": "https://w3id.org/restep/1/errors#retired", "title": "Retired", "status": 410, "code": "retired" }
```

**A new major version.** A breaking change that cannot go through retirement requires one:

- The version MUST go in the path, as `v` followed by an integer: `/v2/`. Each version is a separate API root with its own discovery document, which MUST declare it as `"version": "2"`.
- The version MUST NOT go in headers, parameters or media types: in the path it is visible, cacheable and routable with no code. This leaves out date-based versioning in a header, as Stripe does: Restep 1 does not offer it.
- The two versions MUST link to each other with `Link` ([**RFC 5829**](https://www.rfc-editor.org/rfc/rfc5829)), at least in the discovery document: `rel="successor-version"` from the old one and `rel="predecessor-version"` from the new one.

### 5.6 Language of the API’s texts

Errors, the discovery document and the schemas the API serves MAY depend on `Accept-Language` ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-12.5.4), section 12.5.4). Only their texts for people change: in an error, `title` and `detail`, also those of each `errors` entry; in discovery, `description`; in a schema, also one embedded in `schemas`, the JSON Schema `title` and `description` annotations. Data never does ([3](https://restep.wubytes.com/1/#data)).

- The server picks the language with the *lookup* of [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647#section-3.4) (section 3.4) over the languages it can give that response in, trying the ranges of `Accept-Language` from highest to lowest weight and, at equal weight, in header order; case-insensitively, without canonicalizing ranges or tags (`iw` does not find `he`), and without first dropping extensions or private-use subtags. It ignores `*`, ranges with `q=0` and malformed ranges (a malformed `q` included). If none matches, or the header is missing, it MUST use its default language. It MUST NOT answer `406` or `400` because of `Accept-Language`.
- In a server that offers its texts in more than one language, every response whose texts are picked this way (an error, the discovery document or a schema), in the default language too, MUST carry `Vary: Accept-Language`, and a `304` of these the same `Vary` as its `200`. A response with a body SHOULD carry `Content-Language`. Each language is a different representation: an `ETag`, if present, MUST differ by language.
- Lookup truncates the requested tag and never tries sibling variants: with `es-es` and `es-mx` but no `es`, `Accept-Language: es-AR` gets the default language. A server that offers regional variants of its texts SHOULD also offer the bare language.
- A replay ([7.1](https://restep.wubytes.com/1/#idempotency)) returns the stored response, in its language, because `Accept-Language` does not count towards “the same request”.

### 5.7 Retries

A client repeats a request when it does not know whether it took effect (the connection dropped, it timed out) or when the server tells it to come back later. Whether that is safe depends on the method and on the answer.

- **Safe to repeat as is:** `GET`, `HEAD`, `QUERY` and safe actions, which have no effect; actions declared `"idempotent": true`; `DELETE`, whose repetition MAY give `404` ([5.1](https://restep.wubytes.com/1/#resources)), which a client that is repeating it takes as done; and `PATCH` with a merge patch, which leaves the item the same however many times it is applied. A `PATCH` is idempotent except for concurrency: between the two attempts another client may have written, and the repetition undoes that change. With `If-Match` ([7.2](https://restep.wubytes.com/1/#concurrency)) the repetition gets `412` instead, also after a first attempt that succeeded, since that one changed the `ETag`; the client then reads the item to find out.
- **Not safe without help:** a `POST` to a collection, an action declared `"idempotent": false` and a batch can take effect twice. A client SHOULD NOT repeat one of them automatically when it does not know whether the first attempt took effect, unless it carries `Idempotency-Key` and the server announces [`writes`](https://restep.wubytes.com/1/#writes) ([7.1](https://restep.wubytes.com/1/#idempotency)), or it creates an item with an `id` the client chose ([5.1](https://restep.wubytes.com/1/#resources)), which cannot be created twice.
- `429 rate_limited` and `503 unavailable`: the server MUST NOT give either of them to a request that had an effect, nor to one that it cannot tell had none (a timeout after the commit, a process that died): it answers those with another `5xx`, such as `500`, `502` or `504`. A gateway or load balancer that the API’s operator places in front of it, and that answers with a `problem+json` body, is bound by this rule as the server is. So the client MAY send the same request again, whatever its method. `409 request_in_progress` ([7.1](https://restep.wubytes.com/1/#idempotency)) is repeated in the same way, with the same key. With `Retry-After`, the client SHOULD NOT repeat it before that time; without it, it SHOULD wait an increasing time between attempts, with some randomness, so that many clients do not come back at once. A `429` or `503` without a `problem+json` body may come from an intermediary, which this section does not bind.
- Other `5xx` statuses (`500`, `502`, `504`…) and a lost response say nothing about the effect: the client repeats only what the first point allows, or what carries the same `Idempotency-Key`.
- Another `4xx` answers the same request in the same way. A client SHOULD NOT repeat it without changing something first: new credentials after a `401`, a fresh read after a `412`, `If-Match` after a `428`, the body after a `422`.

### 5.8 Browser clients

Restep does not require cross-origin access ([**Fetch**](https://fetch.spec.whatwg.org/#http-cors-protocol), CORS protocol). For the operations a server makes available to a browser origin, it SHOULD send `Access-Control-Allow-Origin` on every response, errors included, and SHOULD answer their preflight without requiring credentials, since a preflight carries none. When those headers depend on the request’s `Origin`, every response SHOULD carry `Vary: Origin`, also one that does not carry them, and every such response that a shared cache may store (one that is `public`) MUST carry it. If it accepts credentialed requests (cookies, HTTP authentication or TLS client certificates; a token in `Authorization` is not one), it SHOULD name the origin rather than `*`, which browsers reject with credentials, and send `Access-Control-Allow-Credentials: true`. No rule of Restep applies to `OPTIONS` ([5.1](https://restep.wubytes.com/1/#resources)): the preflight of an operation open to that origin gets its CORS answer even for a missing item, without credentials or with reserved parameters.

It SHOULD list in `Access-Control-Expose-Headers` the response headers that the profiles and extensions it announces ask a client to read; in Restep 1, `ETag`, `Location`, `Link`, `Allow`, `Accept-Patch`, `Retry-After`, `Deprecation`, `Sunset`, `Idempotent-Replayed`, `Preference-Applied` and `Accept-Query`, plus those of [11.5](https://restep.wubytes.com/1/#oauth). It SHOULD allow in a preflight the request headers and methods those operations use; in Restep 1, `Content-Type`, `If-Match`, `If-None-Match`, `Idempotency-Key`, `Prefer`, `Authorization` and `DPoP`, with `PATCH`, `DELETE` and `QUERY`. These lists are what Restep 1 defines; a later minor version may add to them.

A browser attaches some credentials on its own to requests that other origins’ pages start: cookies, HTTP authentication and TLS client certificates. A server that accepts any of them MUST refuse with `403 forbidden`, without applying it, every request that is not safe (a `POST`, including actions and batches, a `PATCH` or a `DELETE`), that it would authenticate with such a credential and that a browser sent from an origin the server does not allow. It MUST treat as such a request whose `Origin` header ([**Fetch**](https://fetch.spec.whatwg.org/#origin-header)) is present and is neither the API’s origin nor one it allows. An origin it allows is one it names: a `*` in `Access-Control-Allow-Origin` allows none for this rule, since browsers do not accept it with credentials. It MAY treat `Origin: null` as the API’s origin when `Sec-Fetch-Site` is `same-origin`, since a page with `Referrer-Policy: no-referrer` sends it to its own origin, and MAY decide by `Sec-Fetch-Site` ([Fetch Metadata](https://www.w3.org/TR/fetch-metadata/)) when `Origin` is missing. A request that the server authenticates only with a token in `Authorization` is not covered: a browser never adds one on its own, so a browser client of another origin that the server allows through CORS keeps working. Those cookies SHOULD carry `SameSite=Lax` or `SameSite=Strict`. The preflight and the media type of [3](https://restep.wubytes.com/1/#media-types) keep other origins from sending a JSON body; this check also covers an action with an empty body, which any page can send without a preflight ([11.1](https://restep.wubytes.com/1/#actions), [13.7](https://restep.wubytes.com/1/#sec-browsers)).

### 5.9 Singletons and resources outside Restep

Restep covers collections, their items, their actions, singletons and the resources this specification defines: the discovery document, the batch path, the event stream, the service status ([4.4](https://restep.wubytes.com/1/#health)) and the OAuth metadata ([11.5](https://restep.wubytes.com/1/#oauth)). When the server serves a discovery document, collections and singletons are those it declares. Any other resource of the API, such as a PDF or an image linked with `href`, or a path the API has not declared, is **outside Restep**: of this specification only [5.3](https://restep.wubytes.com/1/#reserved), [5.4](https://restep.wubytes.com/1/#errors) and the `Cache-Control` rule of [5.1](https://restep.wubytes.com/1/#private-responses) apply to it, so its body need not be JSON, but a reserved parameter it does not implement still gives `unsupported_parameter`, and its errors are still `problem+json`. Such a resource implements a reserved parameter if it reads it, whatever the parameter means there.

A **singleton** is a resource with no collection, such as the signed-in user’s profile (`/me`) or an account’s settings, as in [**AIP-156**](https://google.aip.dev/156). The server declares it at the root, in `singletons`, under a name of its choosing:

```
"singletons": {
  "me": { "path": "/me", "methods": ["GET", "PATCH"],
          "description": "The signed-in user’s profile and settings.",
          "schemas": { "item": "/schemas/me.json", "update": "/schemas/me-update.json" } } }
```

- Each singleton MUST have a `path`, which MUST NOT be a template, and MAY carry `methods` (out of `GET` and `PATCH`, exact as in [4.3](https://restep.wubytes.com/1/#describing)), `description`, `schemas` (`item` and `update`) and `deprecations` ([5.5](https://restep.wubytes.com/1/#versions)). Its path MUST NOT be a path that a collection or an item of one has or could have: not `/books/featured` while `/books` is a collection.
- A client MUST ignore a singleton whose `path` is a URI template or whose declaration carries `parent`: those forms are reserved for minor versions.
- A singleton behaves as an item without `id` or collection. It MUST support `GET` (and `HEAD`), which returns its representation, a JSON object, and MAY support `PATCH` with a merge patch, as [5.1](https://restep.wubytes.com/1/#resources) says for items, returning the whole representation. `POST` and `DELETE` on it MUST give `405`: a singleton is neither created nor deleted by the client. It exists for every principal that may use it; one that may not gets `403` or `404` ([4.2](https://restep.wubytes.com/1/#discovery-cache)).
- What this specification says of an item’s representation, its read-only fields, its `PATCH`, its `ETag` and its `If-Match` ([3](https://restep.wubytes.com/1/#data), [4.3](https://restep.wubytes.com/1/#describing), [5.1](https://restep.wubytes.com/1/#resources), [7.2](https://restep.wubytes.com/1/#concurrency), [8](https://restep.wubytes.com/1/#cache)) applies to a singleton too, so with `writes` every response with its representation carries `_etag`, and a `PATCH` evaluates `If-Match` and `If-None-Match` against its ETag; what it says of `id`, item paths and collections does not. A singleton’s representation MAY carry an `id`, such as the user’s, which is then read-only.
- With [`query`](https://restep.wubytes.com/1/#query), `fields` MUST work on a singleton as on an item ([6.3](https://restep.wubytes.com/1/#fields)). Relationships in it follow [3](https://restep.wubytes.com/1/#data), and each relationship object in it MUST carry `href`, since a singleton declares no `relations` to find its target from; declaring them, `include`, language maps and actions on a singleton are outside this version: `include` and the other reserved parameters MUST give `unsupported_parameter` there.

## 6. query (Profile)

Profile URI: `https://w3id.org/restep/1/query`. Status: stable. It applies to collections; `fields` also applies to items. None of its parameters needs a parser: any HTTP framework reads them, though detecting a repeated parameter may need the raw query string ([5.3](https://restep.wubytes.com/1/#reserved)).

### 6.1 Filters

```
GET /books?filter[category]=novela-negra&filter[price][le]=20
```

- The discovery document MUST declare in `filter` which fields can be filtered, with their type and operators. Fields of a relationship use a dotted path (`author.id`).
- A field whose value is a list, and any path through a to-many relationship (`reviews.rating`, `speakers.id`), MUST NOT be declared in `filter` or `sort`: whether such a filter means “some element” or “every element” is reserved for a later minor version.
- `filter[field]=value` is the same filter as `filter[field][eq]=value`. Filters on the same field with different operators are different filters (`filter[price][ge]=10&filter[price][le]=20`). Several filters MUST be combined with AND; for OR, NOT and parentheses there is the [`filter-expr`](https://restep.wubytes.com/1/#filter-expr) extension.
- Operators: `eq`, `ne`, `lt`, `le`, `gt`, `ge`, `in` and `null`.
- `in` takes values separated by commas; its values cannot contain commas (use `eq`, `filter-expr` or `query-method` for those). `filter[f][in]=` is an empty list; an empty element between commas (`a,,b`) is the empty string. `null` takes `true` (no value: absent or `null`) or `false`.
- The server MUST compare by the declared type: numerically for `integer`, `number` and `decimal` (decimals exactly, without going through floating point), chronologically for `date` (as calendar dates) and `datetime` (as instants, exactly: a filter value more precise than what the server stores MUST be compared exactly or give `invalid_parameter`, never be rounded; an offset such as `+02:00` is sent as `%2B02:00`, [5.2](https://restep.wubytes.com/1/#collections)), by length for `duration` (a day counts as 24 hours; a filter value with years or months MUST give `invalid_parameter`, because they have no fixed length), and by Unicode code points for `string` and `enum`, case-sensitively and without language rules, unless the field’s collation says otherwise (below). Strings are compared as they are, without Unicode normalization: a composed and a decomposed `é` are different values. (JavaScript’s `<` compares UTF-16 code units, which order some characters outside the Basic Multilingual Plane differently from code points.) A `boolean` field MUST NOT declare operators other than `eq`, `ne` and `null`, and the `id` filter MUST NOT declare `lt`, `le`, `gt` or `ge`, since the order of `id`s is the server’s ([5.2](https://restep.wubytes.com/1/#collections)). `null` may be declared on a field of any type and tests whether the value is absent or `null`.
- A dotted path that ends in the `id` of a relationship whose target is a subcollection MUST NOT be declared in `filter` or `sort`: that `id` identifies an item only under its parent.
- A translation is filtered as `field.tag`, with a language map of the collection and a lowercase key: `filter[name.es-mx]=Calabacita`. Discovery declares each one on its own, of type `string`: `"name.es-mx": {"type": "string", "ops": ["eq", "in"]}`. It reads only that exact key, with no [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647) matching and no fallback: if the item lacks the key, the field is absent. The language map itself and any other path that ends in or goes through one (`author.name`, `author.name.es`) MUST NOT be declared in `filter` or `sort`, and a language map MUST NOT share its name with a relationship of its collection, so `name.es-mx` is never a relationship path.
- A collection MAY declare in `collations` how a field that holds strings (of type `string`, or an `enum` of strings that is a sort key), or a translation `field.tag`, is compared and sorted: `"collations": {"title": "server"}`. The value applies to the filter and to the sort key of that name, and to [`filter-expr`](https://restep.wubytes.com/1/#filter-expr). Each key MUST be a field declared in `filter` with type `string`, or listed in `sort` and holding strings, and MUST NOT be `id` ([5.2](https://restep.wubytes.com/1/#collections)).
   - `"codepoint"`, the value of every string field not listed: by Unicode code points, as above.
   - `"server"`: equality (`eq`, `ne`, `in`) and order (`lt`, `le`, `gt`, `ge`, `sort`) are the server’s, such as a database collation that ignores case or accents. The order MUST be total, deterministic and stable, and agree with the equality: two values are equal exactly when neither goes before the other. The server SHOULD say which it is in the field’s `description` ([4.3](https://restep.wubytes.com/1/#describing)). A client MUST NOT assume code points, nor reproduce that order or that equality locally. Since only these properties are promised, a change in the server’s own collation that keeps them, such as a library update, does not change the declared value.
   - Other values are reserved for minor versions, such as collations named by Unicode tags. A client MUST treat a value that is not a string, or a string it does not know, as `"server"`.
- Every operator except `null` MUST NOT match items where the field is absent or `null`.
- A filter or sort key on a field that the principal cannot read in an item MUST treat the field as absent in that item: comparisons do not match it, `filter[field][null]=true` does, and it goes last in a sort. A dotted path through a relationship (`author.name`) is a field the principal cannot read in an item whose related item it cannot see ([9](https://restep.wubytes.com/1/#relations)). So a declared filter never reveals a value the client cannot read, and neither does a count ([6.5](https://restep.wubytes.com/1/#counts)). The server MAY instead answer `403 forbidden`, naming the parameter in `parameter`, when the principal cannot read that field in any item.
- A `null` operand other than `true` or `false`, an operand of any other operator that does not match the field’s type (for `in`, each element), an empty `in` list, or the same filter (same field and operator, in either form) twice MUST give `invalid_parameter`. An undeclared field or operator, `unsupported_parameter` ([5.3](https://restep.wubytes.com/1/#reserved)).

**Named filters.** Some criteria do not compare a field: “active sessions” (neither expired nor logged out), “those started from a phone” or “requests approved by someone with this name”. The server declares them by name in `named_filters`, and the client uses them with the short form of a filter:

```
GET /books?filter[available]&filter[search]=machado&filter[price][le]=20
```

- Discovery MUST declare each one in its collection’s `named_filters`, with a `description` that says which items it returns and, if it takes a value, its `type` ([4.2](https://restep.wubytes.com/1/#discovery), with its `values` if it is `enum`): `"named_filters": {"available": {"description": "…"}, "search": {"type": "string", "description": "…"}}`. Its meaning is the one its description gives, not a comparison with a field. A named filter MUST NOT share its name with a key of its collection’s `filter`, and its name follows [3](https://restep.wubytes.com/1/#names), so it never contains a dot.
- Without `type`, it is a switch: it applies with `filter[name]` or `filter[name]=`, and any value MUST give `invalid_parameter`. With `type`, the value is required: an empty one or one that does not match the type MUST give `invalid_parameter`.
- It has no operators: `filter[name][eq]`, or with any other operator, MUST give `unsupported_parameter`, as does an undeclared named filter. The same named filter twice MUST give `invalid_parameter`.
- In everything else it is a filter: it is combined with AND with the others, the cursor is bound to it ([6.4](https://restep.wubytes.com/1/#pagination)) and it gives `unsupported_parameter` wherever filters do, as in `:changes` ([10](https://restep.wubytes.com/1/#sync)). With [`filter-expr`](https://restep.wubytes.com/1/#filter-expr) it does not go into an expression, because it is not in `filter`.
- Unlike a filter on a field, it compares nothing that `collations` describes: how it matches text is said by its `description`. It MUST NOT select items by values the principal cannot read, unless its description states that criterion, which makes whether an item meets it public: whether an item matches would otherwise reveal those values ([13.4](https://restep.wubytes.com/1/#sec-oracles)). A named filter with a `type` MUST NOT compare its value with values the principal cannot read, whatever its description says: each value it is given would ask a different question about them, and bisection would find them.

### 6.2 Sorting

`sort=-rating,title`: comma-separated fields, with a leading `-` for descending order. Sortable fields are declared in `sort`; any other MUST give `unsupported_parameter`. The server MUST break ties in a stable way (for instance, by `id`). Items without a value for a sort key MUST go last, in both directions. A translation is sorted as its declared `field.tag` ([6.1](https://restep.wubytes.com/1/#filters)): `sort=name.es-mx`. Strings sort by code points, without language rules, unless `collations` says otherwise ([6.1](https://restep.wubytes.com/1/#collations)); `id` sorts in the server’s order ([5.2](https://restep.wubytes.com/1/#collections)).

### 6.3 Fields

With `fields=title,price` the response MUST carry only those fields, plus `id` and members starting with `_`. It also works on a single item’s `GET`, where, with `writes`, the item also carries `_etag` ([7.2](https://restep.wubytes.com/1/#concurrency)). A field that does not exist MUST give `invalid_parameter`; a field that exists but that the principal cannot read is simply absent from the response, as it would be without `fields`. A field that the principal cannot read and that neither discovery nor a schema the API serves names MUST be treated, for that principal, as one that does not exist, so `fields` does not tell it that the field exists. `fields=id` is valid and returns only `id` and the `_` members; an empty `fields` is an empty list ([5.3](https://restep.wubytes.com/1/#reserved)). `fields` and `include` ([9](https://restep.wubytes.com/1/#relations)) apply to reads: `GET`, `HEAD` and `QUERY`. On a write they MUST give `unsupported_parameter`, and the response carries the whole item, or nothing with `Prefer: return=minimal` ([7.3](https://restep.wubytes.com/1/#minimal)). A language map is one field: `fields=name` returns it whole, and a path into it (`name.es`; with [`relations`](https://restep.wubytes.com/1/#relations), also `author.name.es`) MUST give `invalid_parameter`.

### 6.4 Pagination

- `limit` sets the page size, between 1 and the declared `max_limit`. Outside that range the server MUST give `invalid_parameter`, not clamp it silently. A collection that accepts `limit` MUST declare `max_limit`; on one that does not declare it, `limit` MUST give `unsupported_parameter`.
- `next` MUST carry an opaque `cursor` parameter and keep the other parameters unchanged. Clients MUST NOT interpret or build cursors.
- A cursor is bound to the collection, the filters and the sort it was issued for; with `QUERY`, to the `filter` and `sort` members of the body ([11.4](https://restep.wubytes.com/1/#query-method)). A cursor the server did not issue (a tampered one), an expired one, or one used with another collection, other filters or another sort MUST give `invalid_parameter` with `parameter: "cursor"`. A cursor SHOULD also be bound to the principal ([2](https://restep.wubytes.com/1/#terms)) that received it, and MUST be if it refers to results computed for that principal, such as a stored snapshot, so that another principal cannot page through them. Signing it is the simplest way to tell a tampered one. A cursor SHOULD NOT carry item data in readable form, such as the sort values of a keyset in clear: `next` URLs end up in logs. Encrypting it, or keeping the position on the server, avoids that ([13.9](https://restep.wubytes.com/1/#sec-opaque)).
- A cursor MUST NOT be bound to `limit`, `fields`, `include` or `count`: they change what each page carries, not which items the traversal visits. Between pages, a client MAY add, change or remove them in the `next` URL of a `GET`, or in the body of a `QUERY`, and that MUST NOT invalidate the cursor.
- A server MAY start with an offset inside the cursor and later move to keyset pagination without clients noticing. The guarantee is the one in [5.2](https://restep.wubytes.com/1/#collections): no repeats and no gaps without concurrent writes.

### 6.5 Counts

Discovery declares `count` as `"exact"` or `"estimated"`. With `count=true`, the response MUST add `total` and, if the number is approximate, `"total_estimated": true`. On a collection that declares `count`, `count=false` is the same as leaving it out, and any value other than `true` or `false` MUST give `invalid_parameter`. On a collection that does not declare it, and on any server without this profile, `count` with any value, `false` included, MUST give `unsupported_parameter` ([5.3](https://restep.wubytes.com/1/#reserved)). `total` MUST count only the items the client can see, also when it is estimated.

## 7. writes (Profile)

Profile URI: `https://w3id.org/restep/1/writes`. Status: stable. Writes that can be retried without duplicating and that do not overwrite each other. Caching is a profile of its own, [`cache`](https://restep.wubytes.com/1/#cache).

### 7.1 Retry without duplicating

```
POST /orders
Idempotency-Key: "8e03978e-40d5-43e8-bc93-6894a57f9324"
```

- Every non-idempotent `POST`, including actions declared `"idempotent": false`, MUST accept the `Idempotency-Key` header, except as [below](https://restep.wubytes.com/1/#anonymous-keys) for requests without credentials: a Structured Fields String without parameters ([**RFC 9651**](https://www.rfc-editor.org/rfc/rfc9651)). A malformed key MUST give `400 bad_request`, with an `errors` entry whose `header` is `Idempotency-Key`. On other methods than `POST`, the server MUST ignore the header. This section defines the header’s syntax and meaning for Restep on its own: it follows the IETF draft ([14.2](https://restep.wubytes.com/1/#informative)) where they agree, and does not depend on that draft advancing or staying as it is.
- A key belongs to one principal ([2](https://restep.wubytes.com/1/#terms)), not to a token, and one target (method and path, compared after percent-decoding, without the query): a retry with a renewed token still finds it. Two requests are **the same** when they share key, principal and target, their query parameters are the same after percent-decoding (their order does not count, as in [5.2](https://restep.wubytes.com/1/#collections)), and their bodies are equal as JSON values ([2](https://restep.wubytes.com/1/#json-equal)). So the same key on the same path with another query is a different request, and gets `422 idempotency_mismatch`.
- Requests without an authenticated principal all count as one anonymous principal and share its keys. The server MAY refuse `Idempotency-Key` on such requests. If it does, it MUST declare it in discovery with `"anonymous": false` in `idempotency` (missing means `true`), and MUST answer with `400 bad_request`, with an `errors` entry whose `header` is `Idempotency-Key` and whose `code` is `unknown`, before any effect, a `POST` without credentials that carries the header and to which this section would otherwise apply; a `POST` to an action declared `"idempotent": true` MUST ignore the header instead, and store nothing under it ([11.1](https://restep.wubytes.com/1/#actions)). While `anonymous` is `false`, a resource that requires the key MUST NOT require it of requests without credentials. A `401` would send the client to get credentials that the resource does not need. Otherwise this section applies to them as to any principal. A client SHOULD generate each key from a random source, with at least the 122 random bits of a version 4 UUID, and SHOULD NOT use it for another request: whoever guesses or learns a key can take it first under the same principal or, with the same request, get its stored response ([13.5](https://restep.wubytes.com/1/#sec-idempotency)).
- The server MUST keep each key for at least 24 hours from the first request, and SHOULD declare how long in discovery (`"idempotency": {"ttl": 86400}`, in seconds). After that, the key counts as new.
- If the same request arrives again, the server MUST return the same status and body without repeating the effect, and SHOULD add `Idempotent-Replayed: true`. Headers such as `Date` may differ. A replay, and the `409 request_in_progress` for the same request while the first one is still running, take the place that [5.4](https://restep.wubytes.com/1/#error-order) gives them: after every check of the earlier steps and before `428`. Neither evaluates `If-Match`, `If-None-Match` or a `428` requirement: a replay returns the stored response even if they no longer hold. A different request under the same key evaluates them as usual, so `412` comes before `422 idempotency_mismatch`.
- If the server fails after the effect and before storing the response, a retry with the same key MUST NOT repeat the effect: the server records both atomically, or recovers as if it had.
- A request that was rejected before it ran (a `4xx` such as `422`, or a `5xx` that left no effect) MAY be left unstored; then it does not use up the key, and the client can fix it and retry with the same one. A request that had an effect MUST be stored.
- The same key with a different request MUST give `422 idempotency_mismatch`, also while the first one is still running. The same request while the first one is still running MUST give a `409` problem with `code` `request_in_progress`, which SHOULD carry `Retry-After`, unless the server waits for the first one to finish and then answers it as a replay, which it MAY do; the client MAY send it again with the same key, after `Retry-After` when present. A resource that requires the key MUST give `400 idempotency_key_required` without it, except to a request without credentials where `anonymous` is `false` ([above](https://restep.wubytes.com/1/#anonymous-keys)).
- A `core`-only server does not know the header and ignores it. Clients MUST NOT rely on `Idempotency-Key` unless the server announces `writes`.

### 7.2 Optimistic concurrency

- Each item has a strong **item ETag**: the `ETag` of its full representation, without `fields` or `include`, computed as if `_etag` were absent; its other `_` members count. It is the `ETag` of the representation this principal reads, so where that representation depends on the principal (`_actions`, fields it cannot read), so does the item ETag, and `If-Match` is evaluated against the writer’s. A `GET` of the full item without content coding MUST carry it, and servers MUST NOT use a weak validator (`W/`) for it. With a content coding (gzip), the `ETag` header MAY differ, as [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) requires.
- Every response whose body is a single item’s representation, to a read or to a write, MUST carry the item ETag in `_etag`, whatever its content coding and its parameters: a proxy or a CDN that compresses the response may weaken or change the `ETag` header without the server knowing, and the client still needs a validator for `If-Match`.
- A single item’s response with `fields` or `include` is another representation: its `ETag` header MUST change whenever anything in it changes, included items too, while its `_etag` stays the item ETag, so the client can write without another read.
- An item in a collection response SHOULD carry in `_etag` the item ETag of the version it represents, when it supports `PATCH` or `DELETE`, so a client can write without reading it first. In a collection that declares `sync` ([10](https://restep.wubytes.com/1/#sync)), such an item MUST carry it on every page, whatever the query parameters, with `GET` or `QUERY` ([11.4](https://restep.wubytes.com/1/#query-method)).
- `PATCH` and `DELETE` MUST evaluate `If-Match` against the item ETag as [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) says (lists, `*`, strong comparison): if it does not match, `412 precondition_failed`. They MUST also evaluate `If-None-Match` (lists, `*`, weak comparison): if it matches, `412` without applying the write. On an item that does not exist, such as one another write has just deleted, they MUST give `404` (`410 retired` only after a retirement, [5.5](https://restep.wubytes.com/1/#versions)), whatever the preconditions say: the order of [5.4](https://restep.wubytes.com/1/#error-order) puts it before `412`, where [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) would evaluate `If-Match` as false.
- A `POST` to a collection, or to an action on it, has the collection as its target, and Restep gives a collection no ETag to write against. The server MUST evaluate `If-Match` and `If-None-Match` there as [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) says, against the `ETag` that a `GET` of the collection without parameters would carry for this principal, or none if it cannot read the collection: so `If-Match` with entity tags gives `412` unless that `ETag` is among them; where there is that `ETag`, `If-Match: *` succeeds and `If-None-Match: *` gives `412`, and where there is none, the other way round. A client SHOULD NOT send them on such a `POST`; to create an item only if its `id` is free, it chooses the `id` ([5.1](https://restep.wubytes.com/1/#resources)). On an action on an item, the target is the item, with its item ETag.
- Evaluating `If-Match` and applying the write MUST be atomic with respect to other writes to the same item.
- A resource MAY require `If-Match`; without it, it MUST answer `428 precondition_required`. Starting to require it is a breaking change ([5.5](https://restep.wubytes.com/1/#versions)).

### 7.3 Minimal responses

With `Prefer: return=minimal` ([**RFC 7240**](https://www.rfc-editor.org/rfc/rfc7240)), writes MAY respond without a body: `201` with `Location`, or `204`. When the item it created or changed still exists (not after a `DELETE`), such a response MUST carry that item’s ETag in `ETag`, since it has no `_etag`, and SHOULD carry `Preference-Applied: return=minimal`. By default they return the representation.

## 8. cache (Profile)

Profile URI: `https://w3id.org/restep/1/cache`. Status: stable. Reads that a cache can store, revalidate and invalidate. It requires only `core`, so a read-only API can announce it without building the idempotency store of [7.1](https://restep.wubytes.com/1/#idempotency).

- Every response to a `GET` or `HEAD`, errors included, MUST carry an explicit `Cache-Control`.
- A response that depends on credentials is `private` or `no-store`, as [5.1](https://restep.wubytes.com/1/#private-responses) requires of every server. A response that does not MAY be `public`, such as a discovery document served without credentials ([4.2](https://restep.wubytes.com/1/#discovery-cache)).
- A successful `GET` of a full item or a singleton ([5.9](https://restep.wubytes.com/1/#singletons)), without `fields` or `include`, MUST carry an `ETag`. If the server also announces [`writes`](https://restep.wubytes.com/1/#writes), it is the item ETag of [7.2](https://restep.wubytes.com/1/#concurrency); otherwise it MAY be weak. Any `ETag` the server gives MUST change whenever anything in the representation it validates changes, included items too.
- `If-None-Match` on a `GET`, `HEAD` or `QUERY` MUST be evaluated as [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) says (lists, `*`, weak comparison): when it matches, the server MUST answer `304`. `304` to `QUERY` is a Restep rule: [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2) (section 13.1.2) names only `GET` and `HEAD`, while [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008) makes a `QUERY` select the same representation as the equivalent `GET` and answers a conditional one with `304` in its example. On writes, `If-None-Match` belongs to [7.2](https://restep.wubytes.com/1/#concurrency).
- A successful response to a `GET` SHOULD carry `Cache-Groups` ([**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875)) naming every item it represents, included ones too, and, for a collection, the collection itself, so a cache can drop the lists an item enters or leaves. A `2xx` response to a `HEAD` SHOULD carry the groups the `GET` would. A successful response to a write that committed changes (for a batch, the outer response, covering every committed operation) SHOULD carry `Cache-Group-Invalidation` naming every item it changed and their collections, even without a body. Group names are opaque and per origin; the item’s path (`"/books/7"`) and the collection’s (`"/books"`) are the obvious choice. Group names MUST NOT reveal to the client what it could not otherwise learn ([5.4](https://restep.wubytes.com/1/#errors)): a response names by its path only an item the client can see, and invalidates the others through a group it may know, such as their collection’s. A cache may or may not honour them, and [**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875) only guarantees 32 groups per field, of 32 characters each, so a long page or a long id may not get every item invalidated. The collection’s own group SHOULD come first.

## 9. relations (Profile)

Profile URI: `https://w3id.org/restep/1/relations`. Status: stable. The shape of relationships is set in [section 3](https://restep.wubytes.com/1/#data), and how they are written in [5.1](https://restep.wubytes.com/1/#resources), so any server follows them; this profile adds declarations and expansion.

- Discovery MUST declare each relationship in `relations`, with its target collection in `to` (a list, when it can point to several: see [section 3](https://restep.wubytes.com/1/#data)), `"many": true` if it is to-many, and `"include": true` if it can be expanded.
- `include=author` MUST fill that object with the full item; with a relationship to several collections, the item of the collection its `type` names. Dotted paths (`include=author.publisher`) are allowed up to the declared `include_depth` (1 if not declared). A relationship that is not declared or not expandable, or a path deeper than `include_depth`, MUST give `unsupported_parameter`.
- If the client cannot see the related item, the object MUST stay with only `id` (and `type`, and `href` where [3](https://restep.wubytes.com/1/#data) requires it).
- When the target is a subcollection, each relationship object carries `href` ([3](https://restep.wubytes.com/1/#data)): a client builds the path of an ordinary target from its collection’s `path` and the `id` ([5.1](https://restep.wubytes.com/1/#resources)), but the item of a subcollection also needs its parent’s `id`, which `href` carries. `{"id": "3", "href": "/books/7/reviews/3"}`.
- When the server also implements `query`, `fields` accepts dotted paths (`fields=title,author.name`); a dotted path whose relationship is not in `include` MUST give `invalid_parameter`.
- Relationships with many items (a book’s reviews) SHOULD be **subcollections**, such as `/books/7/reviews`, declared with a `path` template and a `parent` ([4.2](https://restep.wubytes.com/1/#subcollections)) and following `core` and, if announced, `query`. The relationship that leads to one MAY carry the same template in its `path`, as `reviews` does in the example of 4.2. A to-many list embedded in a representation MUST NOT be paginated: if it can grow without bound, it SHOULD be a subcollection.
- To filter by a relationship, discovery declares the dotted path in `filter`: `filter[author.id]=3`.

```
GET /books/7
{ "id": "7", "title": "La niebla de Portugalete", "author": { "id": "3" } }

GET /books/7?include=author&fields=title,author.name
{ "id": "7", "title": "La niebla de Portugalete", "author": { "id": "3", "name": "Inés Arriaga" } }

PATCH /books/7                changes the link, not the author
{ "author": { "id": "4" } }
```

## 10. sync (Profile) (Experimental)

Profile URI: `https://w3id.org/restep/1/sync`. Status: experimental ([1.2](https://restep.wubytes.com/1/#dependencies)). Keep a local copy of whole collections up to date without downloading everything again. It requires `query`.

- A collection is **synced** when it declares `sync` in discovery, as an object, `{}` if it has nothing to say. A collection MUST NOT declare `sync` unless the server announces this profile in `profiles`; without it, a `sync` declaration means nothing and no collection is synced. Only synced collections answer `:changes`; on any other, `:changes` MUST give `404 not_found`. Every synced collection MUST declare `id` in `filter` with `in`. The rest of this section is about synced collections.
- Collection responses MUST carry `state`: an opaque string that changes whenever anything the client can see in the collection changes. It reflects that client’s view: an item it stops being allowed to see counts as destroyed. A filtered response carries the same `state` as the whole collection; a client that keeps a copy of the collection traverses it without filters.
- Clients MUST NOT interpret or build a `state`; they MAY compare two states for equality. The same considerations as for cursors apply to it ([6.4](https://restep.wubytes.com/1/#pagination), [13.9](https://restep.wubytes.com/1/#sec-opaque)).
- Every page of a traversal MUST carry the `state` of its first page, the request without `cursor` (the server can keep it in the cursor). A client MUST use it as `since` for its next sync: changes made during the traversal show up there.
- A traversal MUST NOT miss items: every item that existed, and matched the request, when the first page was served, and does not appear in `:changes` since that `state`, appears in some page. Offset cursors do not guarantee this; keyset cursors or a snapshot do.
- `GET /books:changes?since=<state>` returns the identifiers created, updated and destroyed since that state. The response MUST carry `since`, `state`, `has_more`, `created`, `updated` and `destroyed`. Each identifier MUST appear in at most one list, picked by what the client could see between `since` and the returned `state` (an item that does not exist cannot be seen). These rules cover the items that changed, or whose visibility to the client changed, in that window:
   - an item it could see at `since` and cannot see at `state` MUST be in `destroyed`;
   - an item it can see at `state` MUST be in `updated` if it could see it at `since` and it changed or stopped being visible in between, and in `created` if it could not see it at `since`;
   - an item it cannot see at either end MUST be in `destroyed` if it could see it in between, and MUST NOT appear otherwise.
- An item it could see at both ends that did not change MAY be in `updated`. If the server cannot reconstruct what the client could see in the window, it MUST answer `410 state_expired`; whether it can MUST NOT depend on the existence of an item concealed from the client ([5.4](https://restep.wubytes.com/1/#errors)). Clients MUST treat `created` and `updated` alike, fetching the item and replacing their copy, and MUST ignore an `id` in `destroyed` that they do not have.
- If `has_more` is `true`, the returned `state` is intermediate: the client MUST call again with it until `has_more` is `false` before treating its copy as current.
- `:changes` covers the whole collection: filters and the other `query` parameters MUST give `unsupported_parameter` there, and a missing `since` MUST give `invalid_parameter`. Keeping a filtered view in sync is outside this version.
- The client fetches the changed items with `GET /books?filter[id][in]=7,12`.
- The server SHOULD keep changes for at least 7 days and SHOULD declare how long in the collection’s `sync.retention` (seconds). If it can no longer compute the changes, it MUST answer `410 state_expired`, and the client reloads the collection.
- The action name `changes` is reserved for this profile ([11.1](https://restep.wubytes.com/1/#actions)).
- The server MAY offer notifications over Server-Sent Events at the path declared in `events`, relative to the API root like the `path` members of discovery ([2](https://restep.wubytes.com/1/#terms)); that response MUST carry `Cache-Control: no-store`. It MAY limit the streams a principal keeps open, and MUST answer `429 rate_limited` to one over that limit. Each event says which collections have a new state, naming each by its key or, for a subcollection, by its path relative to the API root with the template expanded (`"/books/7/reviews"`); the data itself is fetched with `:changes`. The server MUST NOT send an event for a change that does not change that principal’s `state`, or the rhythm of events would reveal activity it cannot see.
- Events are hints: clients MUST tolerate repeated, merged and reordered events. On opening the stream, and on every reconnection, a client MUST call `:changes` for each collection it keeps, from the last state it applied, and MUST advance that state only after applying the changes; an event alone never advances it. Servers MUST NOT rely on `Last-Event-ID` to resume.
- The server SHOULD send an SSE comment at least every 30 seconds, to reduce idle timeouts. It MUST close the stream when the credentials that opened it stop being valid, and MUST answer `401` to any reconnection that carries invalid credentials, an automatic `EventSource` one included. After that, the application MUST wait for valid credentials before opening the stream again.

```
GET /books:changes?since=s128
{ "since": "s128", "state": "s131", "has_more": false,
  "created": ["51"], "updated": ["7", "12"], "destroyed": ["34"] }

GET /events            Accept: text/event-stream
event: state
data: {"books": "s131"}
```

## 11. Extensions

Each extension is announced in `extensions` and has its own profile URI (`https://w3id.org/restep/1/batch`…). What each one requires, and whether it is stable or experimental, is in [1.2](https://restep.wubytes.com/1/#dependencies).

### 11.1 actions (Extension)

Status: stable. Operations that are not create, read, update or delete, following [**AIP-136**](https://google.aip.dev/136): the action name goes after a colon.

```
POST /orders/2001:cancel       on an item
POST /books:import             on the collection
GET  /orders/2001:preview      a safe action declared with "method": "GET"
```

- Each action MUST be declared in its collection’s `actions`, with `on` (`"item"` or `"collection"`), `safe` and `idempotent`. Action names follow [3](https://restep.wubytes.com/1/#names) and SHOULD be `snake_case`; a collection MUST NOT declare an action named `changes`, which [`sync`](https://restep.wubytes.com/1/#sync) uses.
- An action uses `POST` unless its declaration says `"method": "GET"`, which only safe actions MAY do. Servers MUST also accept the colon encoded as `%3A`.
- The declaration MAY carry a `description` and, if the action uses `POST`, an `input` schema ([4.3](https://restep.wubytes.com/1/#describing)). A `GET` action has no body, so it MUST NOT declare `input`.
- A `POST` action MUST treat an empty body, with or without `Content-Type`, as `{}` sent as `application/json`; so a client that has nothing to send can send either. A non-empty body follows [3](https://restep.wubytes.com/1/#media-types).
- The response MUST be the affected resource’s representation (`200`), a new one (`201` with `Location`) or nothing (`204`).
- A request to an action that its collection does not declare, or that is declared `on` the other kind of resource, MUST give `404 not_found`, as any resource that does not exist; a declared action with another method MUST give `405` with `Allow`. A declared action that the item’s current state does not allow MUST give `409 conflict`, with a `reason` if the API has one ([5.4](https://restep.wubytes.com/1/#errors)); one that this principal may not use, `403` or `404` ([4.2](https://restep.wubytes.com/1/#discovery)).
- With [`writes`](https://restep.wubytes.com/1/#writes), an action declared `"idempotent": true` MUST NOT reject a request because it carries a well-formed `Idempotency-Key`: it MAY ignore it, since repeating the action is already safe ([5.7](https://restep.wubytes.com/1/#retries)), or apply [7.1](https://restep.wubytes.com/1/#idempotency) to it; to a request without credentials, where `idempotency` declares `"anonymous": false`, it ignores the key and stores nothing under it ([7.1](https://restep.wubytes.com/1/#anonymous-keys)). A client MAY send one to any `POST` action.
- A representation MAY list in `_actions` the actions available in its current state, so clients do not duplicate business rules. Every action it lists MUST be declared in its collection’s `actions`, with `on` matching and the same method, so the client knows whether it is `safe` and `idempotent`:

```
{ "id": "2001", "status": "paid",
  "_actions": { "cancel": { "method": "POST", "href": "/orders/2001:cancel" } } }
```

### 11.2 batch (Extension) (Experimental)

Status: experimental ([1.2](https://restep.wubytes.com/1/#dependencies)). Several operations in one request, in order, with references to the results of earlier ones. They are sent to the path declared in `batch.path`.

```
POST /batch
{ "atomic": false,
  "operations": [
    { "id": "a", "method": "POST", "path": "/orders", "body": { "book": { "id": "7" } } },
    { "id": "b", "method": "POST", "path": "/orders/{a#/id}:pay",
      "headers": { "idempotency-key": "\"pay-2001\"" },
      "body": { "amount": { "$ref": "a#/total" } } } ] }

→ 200
{ "results": [
    { "id": "a", "status": 201, "headers": { "location": "/orders/2001" }, "body": { … } },
    { "id": "b", "status": 200, "body": { … } } ] }
```

- Each operation MUST have an `id`, unique in the batch, a `method`, a `path` and, optionally, `headers` (with lowercase names) and `body`. Each operation MUST follow the same rules as if it were sent alone, with the exceptions of this section.
- An operation’s `path` MUST start with `/` and is relative to the API root ([2](https://restep.wubytes.com/1/#terms)), like the `path` members of discovery; it MUST NOT carry a scheme, an authority, a fragment or dot-segments (`.`, `..`), and MUST name a resource of Restep ([5.9](https://restep.wubytes.com/1/#outside)) other than the event stream ([10](https://restep.wubytes.com/1/#sync)). A value that a reference (below) inserts into it MUST be a string that is a valid `id` ([3](https://restep.wubytes.com/1/#data)) or an integer, and the server MUST check this rule again on the path that results; otherwise the operation gets `424 not_executed`.
- Its `headers` MAY carry only `if-match`, `if-none-match`, `idempotency-key` and `prefer`, plus `content-type` and `accept-language`, which the server MUST ignore: an operation’s `body` is already JSON and the batch request carries `Content-Type: application/json` ([3](https://restep.wubytes.com/1/#media-types)), and the batch’s `Accept-Language` applies (below). Every operation acts for the batch’s principal, with the batch request’s credentials, `Origin` and `Accept`. The server MUST NOT apply the `Prefer`, `If-Match` or `If-None-Match` of the batch request itself to any operation.
- A reference is `<id>#<JSON Pointer>` into the response body of an earlier operation: in literal braces inside `path` (`%7B` is not one), where the value MUST be inserted percent-encoded as a path segment ([**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986)), or as `{"$ref": …}` in place of a body value. An object whose only member is `$ref` is always a reference, so a client that puts into a batch body data it did not write MUST make sure that no object in it has `$ref` as its only member.
- A body that is not a valid batch, a repeated operation `id`, a reference to an operation that does not come earlier, a nested batch, a `path` that breaks the rule for paths above before references are inserted, or a header outside those six MUST give `400 bad_request` before any operation runs. [5.4](https://restep.wubytes.com/1/#errors) applies to the batch request as a whole before any operation runs; once the batch is accepted, it applies to each operation on its own, subject to the `424 not_executed` rules below. More operations than `max_operations` MUST give `413 content_too_large`, which the server MAY give without validating the operations: a batch that is both too long and invalid can get `400` or `413` ([5.4](https://restep.wubytes.com/1/#error-order)).
- A batch that passes these checks, the atomic check below and those of any request (credentials, content type, rate limits, [7.1](https://restep.wubytes.com/1/#idempotency)) MUST get `200` with one result per operation, in order, each with its own `status`, `headers` and `body`; an error result is a problem object. This is the only exception to “no error inside a `200`” ([5.4](https://restep.wubytes.com/1/#errors)).
- With `"atomic": true`, either all operations take effect or none does. If one fails, it carries its error and every other operation MUST get `424 not_executed`, including those that ran and were rolled back. A server that cannot roll back one of the operations (an external payment, an email) MUST reject the atomic batch with `422 invalid` before running it.
- Without `atomic`, each operation applies on its own; an operation whose reference cannot be resolved, because the referenced one failed or the pointer finds nothing, MUST get `424 not_executed`.
- With [`writes`](https://restep.wubytes.com/1/#writes), the batch itself MAY carry `Idempotency-Key`; then the whole batch follows [7.1](https://restep.wubytes.com/1/#idempotency), including its rule for requests without credentials where `anonymous` is `false`.
- Another exception: the texts of each new result ([5.6](https://restep.wubytes.com/1/#language)) follow the batch’s `Accept-Language`, and an operation’s own is ignored; a replayed result (7.1) keeps its own. `Content-Language` and `Accept-Language` in `Vary` go on the batch response, not in each result’s `headers`: `Vary` includes `Accept-Language` only if some new result can vary by language, and `Content-Language` is left out unless every result with language-picked texts shares one.

### 11.3 filter-expr (Extension) (Experimental)

Status: experimental ([1.2](https://restep.wubytes.com/1/#dependencies)). A filter as an expression, in the spirit of [**AIP-160**](https://google.aip.dev/160):

```
GET /books?filter=price <= 20 AND (category = "novela-negra" OR rating >= 4.5)
```

- Comparators `=`, `!=`, `<`, `<=`, `>` and `>=`, which map to `eq`, `ne`, `lt`, `le`, `gt` and `ge`; `AND`, `OR`, `NOT` and parentheses. Fields by name or dotted path ([3](https://restep.wubytes.com/1/#names)); a path segment may contain `-` (`name.es-mx`). `AND`, `OR`, `NOT`, `true`, `false` and `null` are never field names in an expression: a field so named cannot be used in one. Values: strings in double quotes (with `\"` and `\\` as the only escapes), numbers, `true`, `false` and `null`. `field = null` and `field != null` map to the `null` operator.
- `NOT` binds tightest. `AND` and `OR` MUST NOT be mixed at the same level without parentheses: `a AND b OR c` MUST give `invalid_parameter`. [**AIP-160**](https://google.aip.dev/160) gives `OR` precedence over `AND`, most languages do the opposite; Restep asks for parentheses so nobody guesses. Juxtaposition (`a b`, [**AIP-160**](https://google.aip.dev/160)’s implicit AND) MUST give `invalid_parameter` too.
- A field or operator not declared in `filter` MUST give `unsupported_parameter`. Comparisons follow [6.1](https://restep.wubytes.com/1/#filters), absent and `null` values, collations and fields the principal cannot read included; a number compared with a `decimal` field is read as an exact decimal.
- It cannot be combined with `filter[…]` in the same request: that MUST give `invalid_parameter`.

### 11.4 query-method (Extension) (Experimental)

Status: experimental ([1.2](https://restep.wubytes.com/1/#dependencies)). For queries that do not fit in a URL, the `QUERY` method ([**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008)): safe, idempotent and cacheable, with the `query` parameters in the body.

```
QUERY /books
Content-Type: application/json

{ "filter": { "price": { "le": "20" }, "category": { "in": ["novela-negra", "poesia"] } },
  "sort": ["-rating"], "fields": ["title", "price"], "limit": 10, "count": true }
```

- Collections that accept it MUST announce it with `Accept-Query: application/json` ([**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008)) in their responses to `GET` and `HEAD`.
- The body is a JSON object with the same members as the reserved parameters: `filter` as an object of fields and operators (or, with `filter-expr`, a string), `sort`, `fields` and `include` as lists, `limit` as a number and `count` as a boolean. Values use their JSON type, and `in` takes a list, so its values can contain commas. A named filter goes as `"name": value`, with a value of its type, or `"name": true` if it is a switch; `false` or any other value on a switch gives `invalid_parameter`. An unknown member MUST give `unsupported_parameter`.
- A `QUERY` MUST return the same as the equivalent `GET`, with the same errors; a matching `If-None-Match` gives `304`, as for `GET` ([8](https://restep.wubytes.com/1/#caching)). The URL MUST NOT carry reserved parameters other than `cursor`; the server MUST answer one with `unsupported_parameter`.
- In the response, `next` carries only `cursor`, which here overrides the rule of [6.4](https://restep.wubytes.com/1/#pagination) that keeps the other parameters. For the next page, the client MUST send a body with the same `filter` and `sort` to the `next` URL, and MAY change `limit`, `fields`, `include` and `count` ([6.4](https://restep.wubytes.com/1/#pagination)); the server MUST answer a `filter` or `sort` that is not equal as a JSON value ([2](https://restep.wubytes.com/1/#json-equal); an absent member, `{}` and `[]` are the same) with `invalid_parameter` on `cursor`.
- Caches that store `QUERY` responses use the body as part of the key; many CDNs do not do that yet.

### 11.5 oauth (Extension)

Status: stable. How a client finds out where to get a token for the API. It defines neither authentication nor authorization: it ties the OAuth 2.0 Protected Resource Metadata ([**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728)) to the API root. A server that does not announce it authenticates as it sees fit.

```
GET /api/                         (the API root: https://example.com/api/)
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource/api/"

GET https://example.com/.well-known/oauth-protected-resource/api/
{ "resource": "https://example.com/api/",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["books:read", "books:write"] }
```

- The server MUST serve the metadata at the URL that [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728#section-3.1) (section 3.1) forms from the API root: the well-known suffix goes between the host and the root’s path, which keeps its final slash; only when the root is the bare host does its slash go. Under `https://example.com/api/` it is `https://example.com/.well-known/oauth-protected-resource/api/`; under `https://api.example.com/`, `https://api.example.com/.well-known/oauth-protected-resource`.
- In that document, `resource` MUST be the API root, character for character, final slash included, and `authorization_servers` MUST list at least one issuer: [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728) makes it optional, but without it the client has nothing to discover. `scopes_supported` SHOULD be present. Each authorization server describes itself with [**RFC 8414**](https://www.rfc-editor.org/rfc/rfc8414) or OpenID Connect Discovery; Restep requires nothing of it.
- The metadata is not a resource of the API: [4.1](https://restep.wubytes.com/1/#profile-header), [5.1](https://restep.wubytes.com/1/#resources), [5.2](https://restep.wubytes.com/1/#collections) and [5.3](https://restep.wubytes.com/1/#reserved) do not apply to it. It MUST be served as `application/json` without requiring credentials, so it never gives `401`, and it SHOULD carry `Cache-Control: public` with a `max-age`.
- When the API root requires credentials, its `401` MUST carry the absolute URL of the metadata in `resource_metadata` ([**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728#section-5.1), section 5.1), in at least one challenge: `Bearer`, `DPoP` or any other the API accepts. [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728#section-3.3) (section 3.3) makes clients discard metadata found that way whose `resource` is not the URL they requested, so on any other resource the server MUST NOT point `resource_metadata` at the root’s metadata. The root’s metadata is for the exact root URL, without a query. A client that gets a `401` without `resource_metadata` forms the metadata URL from the root.
- OAuth errors keep their Restep codes: the challenge carries the OAuth error and the body the Restep `code`. `invalid_request` is `400 bad_request`; `invalid_token`, and `invalid_dpop_proof` and `use_dpop_nonce` ([**RFC 9449**](https://www.rfc-editor.org/rfc/rfc9449)), are `401 unauthenticated`; `insufficient_scope` is `403 forbidden`. A `403` for a missing scope MUST carry `error="insufficient_scope"` in its challenge ([**RFC 6750**](https://www.rfc-editor.org/rfc/rfc6750#section-3.1), section 3.1) and SHOULD name the scope needed in `scope`, unless that would reveal permissions the client must not know. A resource whose existence is concealed still gives `404` ([5.4](https://restep.wubytes.com/1/#errors)).
- The server MUST refuse a token meant for another resource server ([**RFC 9700**](https://www.rfc-editor.org/rfc/rfc9700#section-2.3), section 2.3). A client asks for a token restricted to this API by sending its `resource` in the `resource` parameter ([**RFC 8707**](https://www.rfc-editor.org/rfc/rfc8707)).
- With DPoP ([**RFC 9449**](https://www.rfc-editor.org/rfc/rfc9449)) the challenge uses the `DPoP` scheme. A retry with a fresh DPoP proof comes from the same principal and is the same request for [7.1](https://restep.wubytes.com/1/#idempotency).
- A server that allows cross-origin requests ([5.8](https://restep.wubytes.com/1/#browser-clients)) SHOULD list `WWW-Authenticate` in `Access-Control-Expose-Headers` (and `DPoP-Nonce`, if it uses DPoP nonces), or a browser client cannot read them, and SHOULD serve the metadata with `Access-Control-Allow-Origin`. `EventSource` cannot send `Authorization`, so a browser client reads the event stream of [10](https://restep.wubytes.com/1/#sync) with `fetch`; the server SHOULD NOT accept tokens in the query string ([**RFC 6750**](https://www.rfc-editor.org/rfc/rfc6750#section-2.3), section 2.3).

### 11.6 inherit (Extension) (Experimental)

Profile URI: `https://w3id.org/restep/1/inherit`. Status: experimental ([1.2](https://restep.wubytes.com/1/#dependencies)).

A value can apply to an item without being stored in it: a product’s tax rate is its own if it has one; otherwise its category’s, its parent category’s or its store’s; and if none has one, a default. Restep expresses this with **two fields** and a declaration in discovery. The rules of this section apply only to the fields that `inherit` declares. A collection MUST NOT declare `inherit` unless the server announces this extension in `extensions`.

- The **effective field** (`tax_rate`) gives the value that applies, already resolved. It is read-only.
- The **own field** (`tax_rate_own`) gives the item’s own value, or `null` if it has none and inherits. It is the one that is written.

There are two because a single field would have to show the value that applies and also store the one that is written. A client that sends back what it read ([5.1](https://restep.wubytes.com/1/#resources)) would then turn every inherited value into an own value: the value does not change, but the item stops following its source and nobody notices. With two fields, writing the value you see and deciding whether it is inherited are different operations on different fields.

```
GET /products/7
→ 200
ETag: "p7-v3"
{ "id": "7", "name": "Zucchini", "category": { "id": "4" },
  "tax_rate": "10",
  "tax_rate_own": null,
  "_inherited": { "tax_rate": { "from": { "href": "/categories/2" } } } }
```

**Declaration.** In the collection object, the keys of `inherit` are the effective fields:

```
"products": {
  "path": "/products",
  "relations": { "category": { "to": "categories" } },
  "inherit": {
    "tax_rate": { "own": "tax_rate_own", "from": ["category"], "default": true,
                  "description": "The product’s tax rate; without its own, its category’s." } } },
"categories": {
  "path": "/categories",
  "relations": { "parent": { "to": "categories" }, "store": { "to": "stores" } },
  "inherit": { "tax_rate": { "own": "tax_rate_own", "from": ["parent", "store"], "default": true } } }
```

- `own` names the own field. Both fields MUST be top-level and of one of the scalar types of [4.2](https://restep.wubytes.com/1/#discovery), and cannot be `id`, a relationship or a language map: in those, `null` or the merge patch already mean something else ([3](https://restep.wubytes.com/1/#data), [5.1](https://restep.wubytes.com/1/#resources)).
- `from` lists, in order, the relationships **this step** inherits from. Each MUST be to-one and declared in `relations` ([9](https://restep.wubytes.com/1/#relations)), even if the server does not announce that profile, and its target collection MUST have a field with the same name as the effective one. If that field is also declared in its `inherit`, the chain continues: so a category inherits from its parent category to whatever depth is needed, without dotted paths.
- `"default": true` says there is a default at the end of the chain and the effective value is never empty. The value is not published: changing it is a change of data, not of discovery.
- `description` explains the field as in [4.3](https://restep.wubytes.com/1/#describing).

**Resolution.** The effective value MUST be the own value, if it is not `null`; otherwise the effective value of the item linked by the first relationship in `from` that has a link; otherwise the default; and with no default, the field has no value ([3](https://restep.wubytes.com/1/#data)). A link that would create a cycle (a category that ends up as its own ancestor) MUST give `422 invalid`.

**Reading.**

- When the representation carries the effective field, it MUST carry it resolved and with its usual type. The own field carries its value or `null`.
- The item MAY explain the origin in `_inherited`: an object whose keys are the effective fields present in the representation that do not come from the own field. If it carries it, it MUST name them all, so an effective field not in `_inherited` has its own value. With `fields` ([6.3](https://restep.wubytes.com/1/#fields)), `_inherited` only covers the fields in the response. Each value is one of these:
   - `{"from": {"href": "/categories/2"}}`: the absolute path ([3](https://restep.wubytes.com/1/#data)) of the value’s **actual source**, not of the immediate parent. In the example, category 4 has no own value and category 2 does.
   - `{"from": "default"}`: it comes from the default.
   - `{"from": "hidden"}`: it is inherited, but the client cannot see the source. The server MUST NOT give the path of an item the client cannot see, just as a relationship is left with only `id` ([9](https://restep.wubytes.com/1/#relations)), nor of one whose existence it does not reveal ([5.4](https://restep.wubytes.com/1/#errors)).
- Other forms are reserved for minor versions: a client MUST treat a `from` it does not know as `"hidden"`.

**Writing.** The own field is an ordinary field and follows the merge patch with no exceptions. It is the only one that changes inheritance:

| `PATCH` body | Effect |
|---|---|
| `{"tax_rate_own": "4"}` | It gets its own value, 4 |
| `{"tax_rate_own": "10"}`, equal to the inherited one | It gets its own value, 10: the same value, but it no longer follows the category |
| `{"tax_rate_own": null}` | Deletes the own value and inherits again |
| No `tax_rate_own` | Nothing changes |

The effective field is read-only ([5.1](https://restep.wubytes.com/1/#resources)), so writing it never changes anything: a `PATCH` with its current value is ignored, and another value gives `422 invalid` with a `read_only` entry, whose `detail` SHOULD name the own field. It is compared rather than always ignored so that a client trying to change it learns that nothing changed, instead of getting a misleading `200`.

- In a `POST`, an absent or `null` own field makes the item start out inheriting, and the effective field follows the same rule, compared with the value that would result.

```
PATCH /products/7
{ "tax_rate": "4" }
→ 422 application/problem+json
{ "type": "https://w3id.org/restep/1/errors#invalid", "title": "Invalid data", "status": 422, "code": "invalid",
  "errors": [ { "pointer": "/tax_rate", "code": "read_only",
                "detail": "“tax_rate” is the effective value; write “tax_rate_own”." } ] }
```

**Sending back the effective fields as read changes nothing.** This is the rule of [5.1](https://restep.wubytes.com/1/#resources) applied to inheritance: a `PATCH` with the effective fields as read leaves the item as it was: they match and are ignored, the own fields it leaves out are not touched, and `_inherited` is ignored like any `_` member. A client that does not know the own field exists can leave it out safely, and the only mistake it can make is writing the effective field, which gives the `422` above and tells it where to write. This works because in a `PATCH` what is absent is not touched: with a `PUT`, which Restep leaves out ([5.1](https://restep.wubytes.com/1/#resources)), leaving out the own field would delete it and the item would inherit again without anyone asking.

```
PATCH /products/7                the effective field as read, without the own field
{ "id": "7", "tax_rate": "10" }
→ 200, the item unchanged and the same ETag
```

**Stale reads.** If the source changes between the read and the write (category 2 moves to 5 %), the `"tax_rate": "10"` the client sends back no longer matches. With `If-Match` it gives `412`, because the product’s `ETag` has already changed ([7.2](https://restep.wubytes.com/1/#concurrency)); without it, `422` with `read_only`. Either way it fails without changing anything, where a stale ordinary field would silently overwrite someone else’s change.

**When a source changes.** When a category’s value changes, the effective value of every item that inherits from it changes, though nobody touched them. For the client those items have changed, so what other sections already say applies to each:

- its `ETag` changes ([7.2](https://restep.wubytes.com/1/#concurrency): it is that of the complete representation), also when only `_inherited` changes, for instance if category 4 sets as its own the same value it inherited;
- with `sync`, its collection’s `state` changes and `:changes` lists them ([10](https://restep.wubytes.com/1/#sync));
- with a shared cache, the write to the source SHOULD also invalidate the groups of those items and of the collections that can contain them ([8](https://restep.wubytes.com/1/#caching)).

This forces the server to store the effective values or to propagate each change to every descendant. It is the main cost of declaring `inherit`.

**Filters and sorting.** With `query`, filtering and sorting by the effective field compare the value the client sees: `filter[tax_rate][eq]=10` gives those worth 10, inherited or not. Those that inherit are asked for with `filter[tax_rate_own][null]=true`, with no new operators, if that filter is declared ([6.1](https://restep.wubytes.com/1/#filters)).

**Evolution.** Adding inheritance to a new value, or to a field that was already read-only, is compatible: the own field and the declaration are added. Turning into an effective field one that could be written until now is not, because it would reject writes that used to be accepted ([5.5](https://restep.wubytes.com/1/#versions)): it takes a major version, or retiring the field and adding the pair under other names.

## 12. Conformance

There are two classes of conformance, and each is claimed per profile and per extension:

- A **server** conforms to a profile or extension when it meets every requirement on servers marked MUST or MUST NOT in sections 1, 3, 4 and 5 and in that profile’s or extension’s section, and announces the ones it requires ([1.2](https://restep.wubytes.com/1/#dependencies)). A server that announces a profile or extension claims conformance to it.
- A **client** conforms to a profile or extension when, in every use it makes of it, it meets every requirement on clients marked MUST or MUST NOT in the same sections. Every client uses `core`; a client that never sends a `QUERY` need not meet the rules of [`query-method`](https://restep.wubytes.com/1/#query-method). A library, a proxy or an agent that talks to a Restep API is a client, and a proxy is also a server to its own clients.

Requirements marked SHOULD, SHOULD NOT or MAY do not decide conformance. Section 13 and the appendices add no requirements.

### 12.1 Servers

These are the checks a conformance checker runs on a server; which of them [`restep-check`](https://restep.wubytes.com/tools/) runs today is listed on its page. Some need what a checker is given rather than what it can observe: credentials for two principals, a session with cookies, or a way to provoke `429`, `503` or two writes that race. They are marked “given”; a checker runs each only when it is given that, and reports it otherwise as not run, not as passed.

#### core

- Every collection responds with `{items, next}`, with `next` present.
- Without concurrent writes, following `next` until `null` returns every item exactly once.
- An item that does not exist gives `404` as `problem+json` with `code: "not_found"`. The path of an item with its `id` changed (another case, a leading zero) gives `404` unless an item has that `id`; the path with a character of the `id` percent-encoded (`/books/%37`) answers as the item’s own.
- The discovery document’s `restep` matches the grammar of [1.1](https://restep.wubytes.com/1/#restep-versions). Under the same `Accept-Language`, its body is equal as a JSON value with and without credentials (unless it answers `401` without them) and, given two principals, between the two. Served only with credentials, it carries `Cache-Control` with `private` or `no-store`.
- Every member the server adds to discovery outside Restep starts with `x-`, and every key of `collections`, `singletons`, `actions`, `relations`, `named_filters` and `reasons`, and every field that discovery declares, matches the grammar of names ([3](https://restep.wubytes.com/1/#names)).
- A `POST` to a collection that supports it, with a JSON body sent as `text/plain`, as `application/x-www-form-urlencoded`, without `Content-Type`, or as `application/json; charset=latin1`, gives `415 unsupported_media_type` and creates nothing, and so does an empty body without `Content-Type`; with `application/json; charset=UTF-8` or `charset="utf-8"` it is accepted, and an empty body with `application/json` gives `400 bad_request`. Every `2xx` with a JSON body carries `Content-Type: application/json`.
- Every `next` and `href` in a body is an absolute path or an absolute URI whose scheme is `https` or the API root’s, and every absolute URI in a `Location` or `Link` header has one of those schemes.
- Where a collection does not declare `id_from`, a `POST` with an `id` gives `422 invalid`. Where it declares `"client"`, one without `id` gives `422` with a `required` entry at `/id`; with `"client"` or `"either"`, an `id` with a character outside [3](https://restep.wubytes.com/1/#data) gives `422` with an entry at `/id`, and repeating a `POST` that succeeded, or reusing the `id` of a deleted item, gives `409 conflict` with a `taken` entry at `/id` and creates nothing.
- Each declared singleton answers `GET` with a JSON object, and `POST` and `DELETE` with `405`; where it declares `methods`, its `Allow` agrees with them. Its relationship objects carry `href`, and `include` on it gives `unsupported_parameter`.
- A subcollection declares `parent`, and its `path` template has variables with distinct names and starts with its parent’s `path`.
- Every unimplemented reserved parameter, and every form [5.3](https://restep.wubytes.com/1/#reserved) does not define (`filter[a][b][c]`, `fields[]`), gives `400 unsupported_parameter`, on every method, unless an error that comes first in 5.4 applies: with valid credentials and no other fault, a missing item with an unsupported parameter gives `404 not_found`.
- An unsupported method gives `405` with `Allow`; `HEAD` works wherever `GET` does. Where discovery declares `methods` or `item_methods`, that `Allow` agrees with them.
- Where discovery declares `status`, `GET` and `HEAD` on it give `200` or `503` with `Cache-Control: no-store`, or else `401`, `403` or `429`.
- Every `invalid_parameter` and `unsupported_parameter` names its parameter in `parameter`.
- Where discovery declares a `create` schema, a `POST` that leaves out a property it requires gives `422`, and one that leaves out a top-level property with a `default` creates an item with that value; where it declares a closed `update` schema, a `PATCH` with a member the schema does not allow, even a `null` one, gives `422`, once the members 5.1 ignores are dropped.
- Every error carries `type`, `title`, a `status` equal to the response’s, and a `code` from the list or derived from the IANA registry.
- Every `reason` in a problem matches the grammar of names. If discovery declares `reasons`, every problem with a `reason`, also in `batch` results, carries a declared one with its `code`.
- A `PATCH` with `{"author": {"id": "4", "extra": 1}}` changes the link, does not store `extra` and leaves both authors untouched, unless a declared `update` schema rejects it. A relationship to an `id` that does not exist gives `422 invalid` with an `unknown` entry at its `id`, and an `href` that is not the path of an item of the target collection gives `422`. Given a principal that cannot see the related item, sending back the relationship as read, with another field changed, succeeds.
- Merge Patch follows [**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396) (an array or scalar replaced by an object loses its old content), except that relationship objects are replaced whole (5.1) and language maps left with no translations read as `{}` (3) and that, with `inherit`, deleting or changing an own field also changes its effective field ([11.6](https://restep.wubytes.com/1/#inheritance)), and a write that changes `id` gives `422`.
- A `PATCH` with an item’s read-only fields as read changes neither its body nor its `ETag`, if any; another value in `id`, or in a top-level property the client can read that its `item` schema marks `readOnly` directly in `properties`, gives `422 invalid` with a `read_only` entry at its pointer, changing nothing.
- An error requested with an `Accept-Language` the server does not offer, or a malformed one, gives the same `code` as without the header, never `406` or `400` because of it. Where the body of the discovery document or of an error changes between two `Accept-Language` values, both responses, the default language’s included, carry `Vary: Accept-Language` and, if they carry an `ETag`, different ones.
- With `Accept-Encoding: identity`, the `GET` of an item gives the same body under any `Accept-Language` (and, with `writes` or `cache`, the same `ETag`).
- Given a way to provoke them: a `429` or `503` with a `problem+json` body leaves no effect, so repeating the request after `Retry-After` creates one item, not two.
- A `401` or `403`, other than those of the service status ([4.4](https://restep.wubytes.com/1/#health)) and the OAuth metadata ([11.5](https://restep.wubytes.com/1/#oauth)), carries `Cache-Control` with `private` or `no-store`. Given credentials: where a `GET` made with them gets another status or body than the same request without them, or, given two principals, with the other’s, its response carries `Cache-Control` with `private` or `no-store`, also when `cache` is not announced.
- Given a session with credentials that a browser attaches on its own (cookies, HTTP authentication, a client certificate): a `POST`, `PATCH` or `DELETE` with them and an `Origin` the server does not allow, an action with an empty body included, gives `403 forbidden` and has no effect, also where the server sends `Access-Control-Allow-Origin: *`.
- A request over a limit the server does not declare, such as an `in` list of thousands of values, gives the full result, `invalid_parameter` naming the parameter, `413` or `414`; never part of the result.
- In an item, every field of `language_maps` is an object of strings with lowercase keys. Where `PATCH` is supported: an uppercase key gives `422 invalid` with a `format` entry at `/name/ES`; deleting an existing translation with `null` keeps the others, and putting it back restores it; `{"name": null}` leaves `{}`.

#### Evolution

- Whatever discovery lists in `deprecations` carries `Deprecation` in the responses that use it, as [5.5](https://restep.wubytes.com/1/#versions) lists them; after its `sunset` it responds as 5.5 says. Every notice has a known `kind` and an `announced` instant that does not change between two reads.
- Comparing the discovery documents of two deployments of the same version, nothing declared disappears unless it was listed in `deprecations` and its `sunset` has passed.

#### query

- Each declared filter returns only items that match it, comparing by the declared type (decimals exactly).
- An undeclared filter field, operator or sort key gives `unsupported_parameter`; a value of the wrong type, a repeated parameter, or a `duration` value with years or months, `invalid_parameter`.
- A `+` in the query is read as a space: `filter[f]=a+b` and `filter[f]=a%20b` give the same page.
- A declared named filter applies without operators; with an operator it gives `unsupported_parameter`, and a switch with a value, or a typed one without a value or with one that does not match, `invalid_parameter`. None shares its name with a key of `filter`.
- No `boolean` filter declares operators other than `eq`, `ne` and `null`, and the `id` filter declares none of `lt`, `le`, `gt` and `ge`.
- `sort` orders and breaks ties stably across pages. A string field not listed in `collations` filters and sorts by code points; no key of `collations` is `id` or a field not declared as a string.
- No field that is a list, no path through a to-many relationship, and no path that ends in the `id` of a subcollection’s item, is declared in `filter` or `sort`.
- Repeating a parameter of `next` percent-encoded in another way, or reordering parameters, gives the same page.
- `limit` above `max_limit` gives `invalid_parameter`, and `limit` on a collection without `max_limit` gives `unsupported_parameter`; a tampered cursor, or one reused with other filters, another sort or another collection, gives `invalid_parameter`; changing `limit`, `fields`, `include` or `count` between pages keeps it valid.
- No field of `language_maps`, nor any path that ends in or goes through one, is declared in `filter` or `sort`; a declared `field.tag` filter or sort reads only that key, and items without it are absent.
- `fields` returns only those fields, plus `id` and members starting with `_`; `fields=id` is accepted. `fields` or `include` on a `POST` or `PATCH` gives `unsupported_parameter`.
- Given a principal that cannot read a field in some items: a declared filter on it matches none of them except with `null` set to `true`, a sort on it puts them last, and `total` counts only the items that principal can see.
- `count=true` adds `total` when `count` is declared; `count=true` and `count=false` give `unsupported_parameter` when it is not.

#### writes

- Repeating a `POST` with the same `Idempotency-Key` after the first one has finished returns the same response and creates nothing new.
- The same key with another body, or on the same path with another query, gives `422 idempotency_mismatch`; a malformed key, or one with parameters, gives `400 bad_request` on a `POST`.
- The `ETag` of a full item, asked for with `Accept-Encoding: identity`, is strong; every response whose body is one item, with or without `fields` and under any `Accept-Encoding`, carries that item ETag in `_etag`, which two reads of an unchanged item give alike; a write ignores `_` members.
- In a collection that declares `sync` and whose items support `PATCH` or `DELETE`, every listed item carries in `_etag` the `ETag` its own `GET` returns with `Accept-Encoding: identity` for the same version.
- `If-Match` with an old `ETag` gives `412`, and a list that contains the current one succeeds; given a way to make two writes race with the same `If-Match`, one of them gets `412`. `If-None-Match` with the current one, weak or strong, gives `412` to a write and does not apply it.
- `If-Match` with an invented entity tag on a `POST` to a collection gives `412` and creates nothing.
- A `PATCH` or `DELETE` with `If-Match` on an item that has just been deleted gives `404`, not `412`.
- A write with `Prefer: return=minimal` answered without a body carries the item’s `ETag`, unless it deleted the item.
- The same request sent again while the first one is still running gives `409 request_in_progress` or, once the first one finishes, its response; never a second effect.
- Where a non-idempotent `POST` is accepted without credentials, the same request with the same `Idempotency-Key` and no credentials either is replayed as for any principal or, where discovery declares `"anonymous": false` in `idempotency`, gets `400 bad_request` with an entry for the header, with no effect; a resource that requires the key does not give `idempotency_key_required` to a request without credentials there.

#### cache

- Every response to a `GET` or `HEAD`, errors included, carries `Cache-Control`; given credentials, with them `private` or `no-store` (as in core).
- The `GET` of a full item carries an `ETag`, and `If-None-Match` with it, weak or strong, gives `304` to a `GET` and a `HEAD`.

#### relations

- Relationships are objects with an `id`, also without `include`, and every relationship is declared. One that can point to several collections carries `type`; one whose target is a subcollection carries an `href` that a `GET` answers with that item.
- `include` on a declared, expandable relationship fills the object; on any other, `unsupported_parameter`. With `query`, a dotted path in `fields` whose relationship is not in `include` gives `invalid_parameter`.

#### sync

- No collection declares `sync` unless `profiles` lists it. Every collection that declares `sync` declares `id` in `filter` with `in`; `:changes` on one that does not declare it gives `404`.
- `:changes` reports, in the lists [10](https://restep.wubytes.com/1/#sync) calls for, the creation, update and deletion of an item since the previous `state`, and every page of a traversal carries the same `state`; deleting an item mid-traversal does not make the traversal miss another one.
- The response of `events`, where declared, carries `Cache-Control: no-store`. Given a principal over its limit of open streams, a new one gets `429 rate_limited`.

#### actions

- A `POST` action answers an empty body and `{}` alike; an undeclared action gives `404 not_found`, and a declared one with another method `405` with `Allow`; every action in `_actions` is declared with the same method; no action is named `changes`.
- With `writes`, an action declared `"idempotent": true` does not reject a request for carrying a well-formed `Idempotency-Key`, with or without credentials, whatever `idempotency.anonymous` says.

#### batch

- A repeated operation `id`, a reference to a later operation, a nested batch, a `path` with a scheme, an authority or dot-segments or to the event stream, or a header that [11.2](https://restep.wubytes.com/1/#batch) does not allow, gives `400 bad_request` and runs nothing; more operations than `max_operations` give `413`; a batch with both faults gets either. A value inserted into `path` that is neither a valid `id` nor an integer, such as `../admin`, gets `424 not_executed`.
- With `"atomic": true` and one failing operation, every other result is `424 not_executed` and nothing persists.
- Without `atomic`, an operation whose reference cannot be resolved gets `424 not_executed`.

#### filter-expr

- An expression returns the same items as the equivalent `filter[…]` parameters; `AND` and `OR` mixed at one level without parentheses, juxtaposition, or an expression together with `filter[…]`, give `invalid_parameter`; an undeclared field or operator gives `unsupported_parameter`.

#### query-method

- A collection whose `GET` carries `Accept-Query` answers a `QUERY` as the equivalent `GET`, errors included; an unknown member, or a reserved parameter other than `cursor` in the URL, gives `unsupported_parameter`; the next page with another `filter` or `sort` gives `invalid_parameter` on `cursor`.

#### oauth

- The metadata is at the URL [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728) forms from the root, as JSON, without requiring credentials, with `resource` equal to the root and at least one authorization server.
- The metadata does not give `401` (and, as a recommendation, carries `Cache-Control: public`).
- If the root requires credentials, its `401` carries that absolute URL in `resource_metadata`; no `401` elsewhere points there.
- Given a token without the scope a request needs: unless the resource’s existence is concealed, the request gets `403` with `code: "forbidden"` and `error="insufficient_scope"` in the challenge.

#### inherit

- No collection declares `inherit` unless `extensions` lists it. Where one does and `PATCH` is supported: sending back with `PATCH` only an item’s effective fields as read, without its own fields, changes neither its body nor its `ETag`; `{"tax_rate_own": null}` leaves the effective value equal to its source’s and, if there is `_inherited`, it names it; and a different value in the effective field gives `422 invalid` with a `read_only` entry at `/tax_rate`, changing nothing.

### 12.2 Clients

These are the requirements on clients that the text makes, gathered by profile and extension. Each one is in the section cited, which prevails.

#### core

- It does not treat as a Restep 1 discovery document one whose `restep` does not match the grammar or whose major version is not 1, nor assumes `core` only for one of another major version; for a `restep` value with a suffix, it does not assume conformance to any published version or to any other draft ([1.1](https://restep.wubytes.com/1/#restep-versions)).
- It does not use an experimental profile or extension unless `restep` declares a version whose text of it the client implements ([1.2](https://restep.wubytes.com/1/#experimental)).
- It ignores fields and `_x_` members it does not know, and does not reject a response because of an enum value that its stored copy of discovery or of a schema does not list ([3](https://restep.wubytes.com/1/#data)).
- It does not dereference a link whose scheme is neither `https` nor the API root’s ([3](https://restep.wubytes.com/1/#data)).
- It sends the body of a `POST` to a collection, an action or a batch, and of a `QUERY`, with `Content-Type: application/json` ([3](https://restep.wubytes.com/1/#media-types)).
- It treats a response as a discovery document only if it is a JSON object with a string member `restep`, and otherwise assumes `core` only; of several `service-desc` links, it uses the first target that is a discovery document ([4.2](https://restep.wubytes.com/1/#discovery)).
- It ignores members of the discovery document it does not know, does not fail because of a value it does not know, and does not use a filter, action or notice whose `type`, `on`, `method` or `kind` it does not know ([4.2](https://restep.wubytes.com/1/#unknown-members)).
- It sends its credentials for the API only to URLs on the API’s origin, and fetches schemas and documents on other origins without them ([4.3](https://restep.wubytes.com/1/#describing)).
- It makes no request that is not safe, and sends no data to another origin, only because a text the API returned asks it to ([4.3](https://restep.wubytes.com/1/#texts-are-data)).
- It does not assume a path for the service status, such as `/health` ([4.4](https://restep.wubytes.com/1/#health)).
- It does not send `id` in a `POST` to a collection whose `id_from` has a value it does not know, sends one where `id_from` is `"client"`, and links an item of a subcollection by its `href` ([5.1](https://restep.wubytes.com/1/#resources)).
- It follows `next` as is, changing only the parameters [6.4](https://restep.wubytes.com/1/#pagination) lets it change, sends a literal `+` in the query as `%2B`, and does not assume any order of `id`s ([5.2](https://restep.wubytes.com/1/#collections)).
- It handles a `code` it does not know according to the class of the `status`, and a `reason` it does not know as its `code` ([5.4](https://restep.wubytes.com/1/#errors)).
- It ignores a singleton whose `path` is a URI template or that carries `parent` ([5.9](https://restep.wubytes.com/1/#singletons)).

#### query

- It does not assume code points for a field whose collation is `"server"`, nor reproduce that order or equality locally, and treats a collation value that is not a string, or that it does not know, as `"server"` ([6.1](https://restep.wubytes.com/1/#collations)).
- It does not interpret or build cursors ([6.4](https://restep.wubytes.com/1/#pagination)).

#### writes

- It does not rely on `Idempotency-Key` unless the server announces `writes` ([7.1](https://restep.wubytes.com/1/#idempotency)).

#### sync

- It does not interpret or build a `state`, and compares states only for equality ([10](https://restep.wubytes.com/1/#sync)).
- It uses the `state` of a traversal’s first page as `since` for its next sync, and calls `:changes` again while `has_more` is `true` before treating its copy as current.
- It treats `created` and `updated` alike, and ignores an `id` in `destroyed` that it does not have.
- It tolerates repeated, merged and reordered events; on opening the stream and on every reconnection it calls `:changes` from the last state it applied, and advances that state only after applying the changes, never on an event alone.
- After a `401` on the stream, it waits for valid credentials before opening it again.

#### batch

- Each operation has an `id` unique in the batch, a `method` and a `path`; it makes sure that no object in a body it did not write has `$ref` as its only member ([11.2](https://restep.wubytes.com/1/#batch)).

#### query-method

- Its `QUERY` URL carries no reserved parameter other than `cursor`, and for the next page it sends to the `next` URL a body with the same `filter` and `sort` ([11.4](https://restep.wubytes.com/1/#query-method)).

#### inherit

- It treats a `from` in `_inherited` that it does not know as `"hidden"` ([11.6](https://restep.wubytes.com/1/#inheritance)).

The other profiles and extensions make no requirement of clients marked MUST or MUST NOT.

## 13. Security and privacy considerations

This section explains the risks of a Restep API and points to the requirements that address them, which are in the sections it cites. It adds no requirements. An API also has the risks of HTTP ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-17), section 17), of JSON ([**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259#section-12), section 12), of problem details ([**RFC 9457**](https://www.rfc-editor.org/rfc/rfc9457#section-5), section 5) and of OAuth ([**RFC 9700**](https://www.rfc-editor.org/rfc/rfc9700)); this section covers what Restep adds to them or decides about them.

### 13.1 Texts from the API are data

An agent that picks a tool from the discovery document puts descriptions, schema titles, reasons and error details into its prompt, and the data of each item with them. Whoever writes an item’s name, or controls the API, can write an instruction there. No agent built on a model can promise never to follow one, so [4.3](https://restep.wubytes.com/1/#texts-are-data) asks for what can be checked: a client makes no unsafe request, and sends no data to another origin, only because such a text asks it to, and an agent marks where the API’s text begins and ends in its prompt. A client also never grants an agent more permissions because a description asks for them. The names an API gives follow a grammar without spaces or punctuation ([3](https://restep.wubytes.com/1/#names)), so they are safe as parts of tool names; an agent that adds a prefix (`list_`, `get_`), or whose tool registry ignores case or allows only shorter names, still has to resolve the collisions that result. A `parameter` in a problem is the parameter as received, which an attacker can write into a link: a client that shows it escapes it.

### 13.2 Credentials and origins

- A client sends its credentials only to URLs on the API’s origin ([4.3](https://restep.wubytes.com/1/#describing)). A discovery document can link schemas, documentation, a service status and, through `href`, resources on any origin; a `next` link could too. Fetched with the API’s credentials, any of them would hand those credentials to whoever controls the other origin.
- Links use `https` or the scheme of the API root, and a client does not follow one with another scheme ([3](https://restep.wubytes.com/1/#data)), so a discovery document cannot send it to `file:` or `data:`. A client that follows links from a server, such as an explorer or a hosted agent, still has to keep them away from its own internal network. A schema on another origin is controlled by that origin, so a client does not resolve its `$ref` elsewhere nor send its `default` without showing it to the user first (4.3).
- A redirect to another origin is a URL on another origin. The Fetch Standard drops `Authorization` on such a redirect, but a library that copies headers by hand may not.
- A token for the API is restricted to it: the server refuses one meant for another resource server ([11.5](https://restep.wubytes.com/1/#oauth)), so a token leaked from another API does not work here.

### 13.3 Concealing existence

A `403` says that something exists. Restep lets an API conceal it instead:

- a resource whose existence the API does not reveal gives `404`, not `403`, and a retired one `410` only if its existence is not concealed ([5.4](https://restep.wubytes.com/1/#errors)); a declared method, action or singleton that a principal may not use gives `403` or that `404` ([4.2](https://restep.wubytes.com/1/#discovery-cache));
- a relationship to an item the client cannot see keeps only its `id` ([9](https://restep.wubytes.com/1/#relations)), which still reveals that `id`, and its `href` and `type` reveal its parent’s `id` and its collection; an API that must conceal even that leaves the field out for that principal, as any field it cannot read ([6.3](https://restep.wubytes.com/1/#fields));
- a write that links an item the client cannot see gets the same `422` as one that links an item that does not exist ([5.1](https://restep.wubytes.com/1/#resources)), and the cache groups of a write name by its path only items the client can see ([8](https://restep.wubytes.com/1/#cache-groups));
- a field that the principal cannot read and that discovery does not name is, for `fields`, a field that does not exist ([6.3](https://restep.wubytes.com/1/#fields)), and the events of [10](https://restep.wubytes.com/1/#sync) are sent only when that principal’s `state` changes;
- an inherited value whose source the client cannot see says `"hidden"`, never the source’s path ([11.6](https://restep.wubytes.com/1/#inheritance));
- in `:changes`, lists follow what the client could see, and whether the server answers `410 state_expired` does not depend on concealed items ([10](https://restep.wubytes.com/1/#sync));
- a problem does not reveal what the principal could not otherwise learn ([5.4](https://restep.wubytes.com/1/#errors)).

The one place where Restep reveals existence on purpose is the `taken` entry of a client-chosen `id` ([13.6](https://restep.wubytes.com/1/#sec-client-ids)). Response times can also tell an item that exists from one that does not; Restep does not ask for constant-time answers. An item’s `ETag` and a collection’s `state` may change when something the principal cannot see changes, which tells it that something did; a server that must conceal that computes them from what the principal can see.

### 13.4 Query oracles

A filter is a question about a value. If the server answered it with values the principal cannot read, whether an item is in the results would answer it, one bit at a time: `filter[salary][lt]=50000`, then `40000`, finds a salary by bisection. Sorting gives the same answer by position, `total` by number, and `filter[field][null]` tells whether a value exists. The defences:

- A filter or sort key on a field the principal cannot read in an item treats it as absent there, a dotted path through a related item it cannot see included; `null`, the order and `total` follow from that ([6.1](https://restep.wubytes.com/1/#unreadable), [6.5](https://restep.wubytes.com/1/#counts)). [`filter-expr`](https://restep.wubytes.com/1/#filter-expr) follows the same rule (11.3). The `403` that 6.1 allows instead depends only on whether the field is readable in no item, which says nothing about values.
- A named filter compares nothing that discovery declares, so the server decides what it reads; it does not select by values the principal cannot read unless its description states the criterion ([6.1](https://restep.wubytes.com/1/#filters)). “Has at least one copy free” can be public while the stock of each store is not. A named filter that takes a value never compares it with values the principal cannot read, whatever its description says: “salary above the given amount” would find each salary by bisection.
- An estimated `total` is still a count of what the principal can see ([6.5](https://restep.wubytes.com/1/#counts)): a server cannot take it from statistics of the whole table if some items are hidden from that principal.
- A keyset cursor holds the sort values of the last item it returned; [6.4](https://restep.wubytes.com/1/#pagination) asks that they not be readable ([13.9](https://restep.wubytes.com/1/#sec-opaque)).

### 13.5 Idempotency keys

A key belongs to a principal and a target ([7.1](https://restep.wubytes.com/1/#idempotency)). Requests without an authenticated principal share one, so every anonymous client shares one space of keys. Whoever guesses or sees another client’s key can then:

- send a different request under it first, so that the victim’s request gets `422 idempotency_mismatch` and never runs;
- send the same request, if it knows the whole body, and get the stored response, with what the server added to it: an `id`, a timestamp, a secret or a link meant only for the sender;
- learn from `Idempotent-Replayed` that someone already sent that exact request.

Clients generate keys from a random source and use each for one request ([7.1](https://restep.wubytes.com/1/#anonymous-keys)). A server whose responses to anonymous writes carry anything only the sender may see can refuse keys without credentials: it declares so in `idempotency` and answers `400` (7.1), not `401`, which would send the client after credentials the resource does not need. Keys travel in a header and end up in the same logs as the rest of the request.

### 13.6 Client-chosen identifiers

- **Collisions.** Two clients that pick the same `id` get one item and one `409`. The server requires a format with enough entropy, and clients generate it at random ([5.1](https://restep.wubytes.com/1/#client-ids)).
- **Taking an `id` first.** If a client derives its `id`s from data (an email, an order number) or picks them in sequence, someone else can create an item with the `id` it will use, and the client’s own creation fails with `409`.
- **The `409` as an oracle.** `taken` answers the same whether or not the client can see the item, so it does not reveal what the client may see; it does reveal that the `id` is or was in use ([5.1](https://restep.wubytes.com/1/#client-ids)). With random `id`s, guessing one is impractical. With a format that can be guessed, it tells whether an item exists, so a collection whose items are concealed from some principals ([13.3](https://restep.wubytes.com/1/#sec-existence)) requires a format that cannot be guessed (5.1). The server can check the format but not the entropy: a well-formed version 4 UUID may still have been derived from data, so the protection holds only as far as every client generates its `id`s at random.
- **Time in the `id`.** Sortable identifiers (ULID, UUID version 7) carry the instant of their creation, and sequential ones carry how many items came before. Whoever sees the `id` learns them. This holds as well for the `id`s a server assigns.
- **Hashes of deleted `id`s.** A server may keep only a one-way hash of the `id`s of deleted items ([5.1](https://restep.wubytes.com/1/#client-ids)). Where those `id`s were derived from personal data, the hash does not anonymise them: whoever holds it can recompute it for each candidate, such as every email address on a list.

### 13.7 Browsers and cross-site requests

- A browser attaches cookies to requests that pages of other origins start. A request with a non-simple method or media type needs a CORS preflight first, which the server can refuse; a `POST` sent as `text/plain`, `application/x-www-form-urlencoded` or `multipart/form-data` does not. So a server requires `application/json` on request bodies ([3](https://restep.wubytes.com/1/#media-types)): a server that read a form as JSON would accept writes from any page.
- An action with an empty body needs no preflight either ([11.1](https://restep.wubytes.com/1/#actions)). A server that accepts credentials a browser attaches on its own (cookies, HTTP authentication, client certificates) refuses every request that is not safe and carries them from an origin it does not allow, by `Origin` or `Sec-Fetch-Site` ([5.8](https://restep.wubytes.com/1/#csrf)), which also covers browsers or paths the rules above miss; `SameSite` cookies are a second line. A page with `Referrer-Policy: no-referrer` sends `Origin: null` even to its own origin, which `Sec-Fetch-Site` tells apart.
- `GET` and `HEAD` have no effects ([5.1](https://restep.wubytes.com/1/#resources)), and an action can use `GET` only if it is safe ([11.1](https://restep.wubytes.com/1/#actions)), so a link or an image cannot write.
- CORS with credentials names the origin ([5.8](https://restep.wubytes.com/1/#browser-clients)). A server that copies any request’s `Origin` into `Access-Control-Allow-Origin` together with `Access-Control-Allow-Credentials: true` gives every site the user’s access.
- A token in `Authorization` is not attached by the browser, so it is not exposed to cross-site requests; where a page keeps it is outside Restep.

### 13.8 Limits and abuse

- Declared limits: `max_limit` ([6.4](https://restep.wubytes.com/1/#pagination)), `include_depth` ([9](https://restep.wubytes.com/1/#relations)) and `max_operations` ([11.2](https://restep.wubytes.com/1/#batch)). Going over them gives `invalid_parameter`, `unsupported_parameter` and `413`.
- Undeclared limits, such as the values of an `in` list, the number of filters or the size of an expression, give `invalid_parameter` with the limit in `detail`, never a partial result ([5.3](https://restep.wubytes.com/1/#limits)). A client that syncs splits a long `filter[id][in]` into several requests, or uses [`query-method`](https://restep.wubytes.com/1/#query-method). Otherwise: `414` for a URL, `413` for a body, `429` for requests and event streams ([10](https://restep.wubytes.com/1/#sync)).
- Some requests cost more than they look: an `include` multiplies the page by its depth, an exact `count` scans (a server can declare `"estimated"`), a filter may have no index, an atomic batch holds locks, and the idempotency store and the change log grow with `ttl` and `retention`. A server declares only what it can serve under load, and limits requests per principal and, for anonymous ones, per network address.
- `429` and `503` with a `problem+json` body mean no effect, also when the API’s own gateway gives them ([5.7](https://restep.wubytes.com/1/#retries)), so a client that waits as `Retry-After` says, or backs off with randomness, does not turn a failure into a storm of retries.

### 13.9 Cursors and states

- Clients do not interpret or build cursors ([6.4](https://restep.wubytes.com/1/#pagination)). The server binds a cursor to its collection, filters and sort, and should bind it to the principal; it must when the cursor refers to results computed for that principal, such as a snapshot (6.4). Signing it shows when it was tampered with, and a tampered one gives `invalid_parameter`, never another page.
- A cursor goes in the `next` URL, and URLs end up in logs, in browser history and in `Referer`. 6.4 asks that it not carry item data that can be read, such as keyset values in clear; encrypting it, or keeping the position on the server, avoids that.
- A `state` of [`sync`](https://restep.wubytes.com/1/#sync) is opaque in the same way. The changes it leads to are computed for the principal who asks ([10](https://restep.wubytes.com/1/#sync)), so a `state` that one principal received and another sends lists only what the second one could see.

### 13.10 Caching

- A shared cache that stored a response meant for one principal would give it to the next. Every server, with or without the `cache` profile, marks a response that depends on credentials `private` or `no-store` ([5.1](https://restep.wubytes.com/1/#private-responses)). [**RFC 9111**](https://www.rfc-editor.org/rfc/rfc9111#section-3.5) (section 3.5) already keeps shared caches from storing responses to requests with `Authorization`, but not those sent with cookies or a client certificate.
- A `404` that conceals an item from one principal depends on credentials too, and so does its `200` for another.
- The discovery document is the same for every principal ([4.2](https://restep.wubytes.com/1/#discovery-cache)), so it carries nothing that one principal may know and another may not. A shared cache may keep it only when it is served without credentials: one served only with credentials is `private` or `no-store` (4.2), or a cache would hand it to whoever has none.
- With `cache` and responses whose CORS headers depend on `Origin`, `Vary: Origin` keeps a shared cache from giving one origin’s answer to another ([5.8](https://restep.wubytes.com/1/#browser-clients)).
- [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.1) (section 13.2.1) has a server evaluate preconditions only when the request would otherwise succeed, so a `304` never tells a principal without access that its `ETag` matches.

### 13.11 Tokens

- The server refuses tokens meant for another resource server, and a client asks for one restricted to the API with a resource indicator ([11.5](https://restep.wubytes.com/1/#oauth), [**RFC 8707**](https://www.rfc-editor.org/rfc/rfc8707)).
- Tokens in the query string end up in logs, in history and in `Referer`, so the server should not accept them; a browser reads the event stream with `fetch`, which can send `Authorization` (11.5). DPoP binds a token to a key the client holds ([**RFC 9449**](https://www.rfc-editor.org/rfc/rfc9449)).
- Only the root’s `401` points to the root’s metadata (11.5), because [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728) has a client discard metadata whose `resource` is not the URL it asked for.
- The metadata is served without credentials and lists the authorization servers and scopes; a `403` for a missing scope leaves `scope` out when naming it would reveal permissions (11.5).

### 13.12 Privacy

- **Discovery.** Whoever can read the discovery document learns every collection, singleton, field that can be filtered, action and reason the API declares. It is the same for everyone ([4.2](https://restep.wubytes.com/1/#discovery-cache)): an API that cannot publish that much requires credentials to read it and serves it `private` (4.2), gives each tenant its own API root, or leaves out of its API what must stay unknown.
- **Errors.** A `reason` says why the request failed, not anything about others; its declaration in `reasons` is public. `detail` and `errors` do not reveal what the principal could not otherwise learn, nor internal details ([5.4](https://restep.wubytes.com/1/#errors)). The service status served without credentials says only whether the API can serve ([4.4](https://restep.wubytes.com/1/#health)).
- **Replays.** `Idempotent-Replayed` says that the same request was made before under the same principal; for the anonymous principal, possibly by someone else ([13.5](https://restep.wubytes.com/1/#sec-idempotency)).
- **Identifiers.** Sortable and sequential `id`s reveal when an item was created and how many there are ([13.6](https://restep.wubytes.com/1/#sec-client-ids)).
- **Queries in URLs.** A filter such as `filter[email]=…` puts personal data in the URL, and so in logs. [`query-method`](https://restep.wubytes.com/1/#query-method) puts it in the body instead.
- **Sync.** `destroyed` lists the `id`s of items the client could see and no longer can; it reveals nothing about items the client never saw ([10](https://restep.wubytes.com/1/#sync)).

## 14. References

### 14.1 Normative

Needed to implement a requirement marked MUST or MUST NOT.

- [**RFC 2119**](https://www.rfc-editor.org/rfc/rfc2119) and [**RFC 8174**](https://www.rfc-editor.org/rfc/rfc8174): requirement key words. [**RFC 5234**](https://www.rfc-editor.org/rfc/rfc5234): ABNF, for the grammar of `restep` ([1.1](https://restep.wubytes.com/1/#restep-versions)).
- [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110): HTTP semantics (methods, status codes, `ETag`, `If-Match`, `If-None-Match`, `Accept-Language`). [**RFC 9111**](https://www.rfc-editor.org/rfc/rfc9111): HTTP caching (`Cache-Control`).
- [**RFC 6585**](https://www.rfc-editor.org/rfc/rfc6585): `428` and `429`. [**RFC 4918**](https://www.rfc-editor.org/rfc/rfc4918): `424`.
- [**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259): JSON. [**RFC 9457**](https://www.rfc-editor.org/rfc/rfc9457): Problem Details for HTTP APIs. [**RFC 6901**](https://www.rfc-editor.org/rfc/rfc6901): JSON Pointer.
- [**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396): JSON Merge Patch. [**RFC 5789**](https://www.rfc-editor.org/rfc/rfc5789): `PATCH`.
- [**JSON Schema 2020-12**](https://json-schema.org/draft/2020-12): the schemas of [4.3](https://restep.wubytes.com/1/#describing).
- [**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986): URIs. [**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570): URI templates.
- [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339): dates and times.
- [**RFC 5646**](https://www.rfc-editor.org/rfc/rfc5646): language tags. [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647): matching of language tags (*lookup*).
- [**RFC 8288**](https://www.rfc-editor.org/rfc/rfc8288): web linking (`Link`, `anchor`, `hreflang`). [**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631): `service-desc`, `service-doc` and `status`. [**RFC 5829**](https://www.rfc-editor.org/rfc/rfc5829): the `successor-version` and `predecessor-version` relations.
- [**RFC 9745**](https://www.rfc-editor.org/rfc/rfc9745) and [**RFC 8594**](https://www.rfc-editor.org/rfc/rfc8594): `Deprecation` and `Sunset`.
- [**RFC 9651**](https://www.rfc-editor.org/rfc/rfc9651): Structured Field Values for HTTP, the syntax of `Idempotency-Key`.
- [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008): the `QUERY` method.
- [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html) (HTML Standard): the event stream of [10](https://restep.wubytes.com/1/#sync).
- [Fetch Standard](https://fetch.spec.whatwg.org/): the `Origin` header and the CORS protocol.
- [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728): OAuth 2.0 Protected Resource Metadata. [**RFC 6750**](https://www.rfc-editor.org/rfc/rfc6750): Bearer tokens and their challenges. [**RFC 9700**](https://www.rfc-editor.org/rfc/rfc9700): OAuth 2.0 security best current practice, for the audience of tokens. For the [`oauth`](https://restep.wubytes.com/1/#oauth) extension.

### 14.2 Informative

Background, sources of ideas and specifications that an implementation may use but that no requirement depends on.

- IETF draft [The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) (revision 08, 22 October 2026). Restep defines the header’s syntax and meaning itself ([7.1](https://restep.wubytes.com/1/#idempotency)).
- IETF draft for [the Health Check Response Format](https://datatracker.ietf.org/doc/draft-inadarei-api-health-check/): `application/health+json` ([4.4](https://restep.wubytes.com/1/#health)).
- [**RFC 6906**](https://www.rfc-editor.org/rfc/rfc6906): the `profile` link relation ([4.1](https://restep.wubytes.com/1/#profile-header)). [**RFC 9727**](https://www.rfc-editor.org/rfc/rfc9727): `api-catalog`.
- [**RFC 7240**](https://www.rfc-editor.org/rfc/rfc7240): `Prefer` and `Preference-Applied` ([7.3](https://restep.wubytes.com/1/#minimal)).
- [**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875): HTTP Cache Groups ([8](https://restep.wubytes.com/1/#cache-groups)).
- [**RFC 8414**](https://www.rfc-editor.org/rfc/rfc8414) and [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html): authorization server metadata. [**RFC 9449**](https://www.rfc-editor.org/rfc/rfc9449): DPoP. [**RFC 8707**](https://www.rfc-editor.org/rfc/rfc8707): resource indicators.
- [Fetch Metadata Request Headers](https://www.w3.org/TR/fetch-metadata/) (W3C): `Sec-Fetch-Site` ([5.8](https://restep.wubytes.com/1/#csrf)).
- [**RFC 8620**](https://www.rfc-editor.org/rfc/rfc8620): JMAP, changes and back-references between operations, which [`sync`](https://restep.wubytes.com/1/#sync) and [`batch`](https://restep.wubytes.com/1/#batch) follow.
- Google’s [**AIP-136**](https://google.aip.dev/136) (actions), [**AIP-156**](https://google.aip.dev/156) (singletons), [**AIP-158**](https://google.aip.dev/158) (pagination) and [**AIP-160**](https://google.aip.dev/160) (filter expressions).
- [JSON:API 1.1](https://jsonapi.org/format/).

## Appendix A. Building forms from schemas

This appendix is not normative. It describes how a generic client can show a form for people from the schemas of [4.3](https://restep.wubytes.com/1/#describing), so that a server knows what its schemas will look like on screen.

- The form for a new item comes from `create`; the form to edit one comes from `update`, filled with the item as read.
- `title` and `description` are a field’s label and help, in the language of [5.6](https://restep.wubytes.com/1/#language).
- `default` is the value the form starts with. In `create` it is also the value the server gives a field left out (4.3), so leaving it unchanged and leaving the field out mean the same. A schema on another origin is that origin’s, so its `default` is shown before it is sent (4.3).
- `examples` are shown as examples and never sent.
- A `oneOf` of `const` values, each with its `title`, gives the choices and their labels.
- `format`, `maxLength` and the other assertions say how to enter a value and let the client check it before sending; the server checks it again.
- A `readOnly` field is shown and not edited; a `writeOnly` one, such as a password, is never filled with a value read.
- Fields appear in the order of `properties`, which the server writes in the order it wants (4.3).
- Layout, grouping and the controls used are the client’s.

A form whose starting values depend on the user or on the moment (today’s date, an inherited value) cannot come from discovery, which is the same for everyone; see [Appendix B](https://restep.wubytes.com/1/#future).

## Appendix B. Future work

This appendix is not normative. These cases are left out of Restep 1. None needs an incompatible change: each can come as an addition in a minor version ([1.1](https://restep.wubytes.com/1/#restep-versions)) or as a new extension, once implementations show how it should work. Until then, an API that needs one solves it its own way, with names outside those Restep reserves ([5.3](https://restep.wubytes.com/1/#reserved)).

- **Long-running operations**: `202 Accepted` and an operation resource (as in [**AIP-151**](https://google.aip.dev/151)), so each API does not invent its own. Deferred because the operation’s shape, its cancellation and how it meets `Idempotency-Key` and actions need an implementation first.
- **Keeping filtered views in sync** (as JMAP’s `queryChanges`). Deferred because it needs to know which items a view held in the past, and `sync` itself is still experimental.
- **Small additions**: named views (`$view`), a `prev` link for backward paging, batch results streamed as they finish, and reusing a `QUERY` through the `Location` that [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008) already defines. Deferred because no case has needed them yet.
- **Signed messages** ([**RFC 9421**](https://www.rfc-editor.org/rfc/rfc9421), with `Content-Digest` from [**RFC 9530**](https://www.rfc-editor.org/rfc/rfc9530) and keys published as JWKS, [**RFC 7517**](https://www.rfc-editor.org/rfc/rfc7517)) for integrity between companies through intermediaries. Deferred because Restep 1 has no case that needs them: TLS covers the client and the server, and the events of [10](https://restep.wubytes.com/1/#sync) carry no data. A signature that expires would also give `401` to a retry before it reaches the idempotency store of [7.1](https://restep.wubytes.com/1/#idempotency).
- **An `openapi` extension**: what an OpenAPI description of a Restep API says (a description per operation, request bodies, errors as `problem+json`) and how a checker holds it to the discovery document, which would still prevail. Deferred until the tools that translate between the two show what is worth requiring.
- **Consequential actions**: marking actions whose effects cannot be undone or reach outside the API (a payment, an email), so a client can ask a person first, as MCP’s `destructiveHint` and `x-openai-isConsequential` do. Deferred because a single flag does not tell “deletes data” from “charges someone”, and a vocabulary needs more cases.
- **Named filters inside `filter-expr`, and a text search of Restep’s own**, which would have to say how ordering by relevance combines with `sort` and with cursors. Deferred because that combination is not designed; today a search is a named filter of type `string` ([6.1](https://restep.wubytes.com/1/#filters)).
- **A projection by language** (`languages`, already reserved), so clients need not receive whole language maps. Deferred because maps are small in the cases seen so far.
- **Sorting with language rules** (CLDR collation): with code points, `sort=name.es-es` puts “Ñora” after “Zanahoria”, and `"server"` ([6.1](https://restep.wubytes.com/1/#collations)) does not let a client know the order. The values of `collations` other than `"codepoint"` and `"server"` are kept for collations named by Unicode tags (`-u-co-`, `-u-ks-`). Deferred because databases implement those tags unevenly.
- **Filters on fields that are lists and on paths through to-many relationships**: whether they mean “some element” or “every element”, and a list type for discovery. 6.1 reserves the case, so it can be added without breaking anyone.
- **Text direction** (`dir`, from the W3C’s [Strings on the Web](https://www.w3.org/TR/string-meta/)), which a language tag is not enough to infer. It would go in each field’s object in `language_maps`, never changing the type of the values. Deferred because no implementation has needed it yet.
- **Declaring in advance** which operations require `Idempotency-Key` ([7.1](https://restep.wubytes.com/1/#idempotency)) or `If-Match` ([7.2](https://restep.wubytes.com/1/#concurrency)), instead of learning it from a `400` or a `428`. Deferred because the error already tells a client what to do, and requiring either one is a breaking change anyway ([5.5](https://restep.wubytes.com/1/#versions)).
- **Inheriting values that are not scalars** ([11.6](https://restep.wubytes.com/1/#inheritance)): a language map translation by translation, or an object field by field. Deferred until `inherit` itself has evidence.
- **Local times in a time zone** ([**RFC 9557**](https://www.rfc-editor.org/rfc/rfc9557), `2026-03-30T10:00:00+02:00[Europe/Madrid]`), declared like `language_maps`. [**RFC 9557**](https://www.rfc-editor.org/rfc/rfc9557) describes fixed instants with zone information; a future local time whose instant follows changes to its zone’s rules is left to the application, and Restep would have to say which of the two such a field is. Deferred for that reason.
- **Soft deletion**: what a `GET` on a deleted item answers, how the trash is seen, restoring with the same `id`, and purging. Under [10](https://restep.wubytes.com/1/#sync), an item that becomes visible again appears as `created` or `updated`, depending on the window. Deferred because restoring an `id` meets the rule that `id`s are not reused ([5.1](https://restep.wubytes.com/1/#client-ids)).
- **Units of measure**: a fixed unit per field, declared in discovery with [UCUM](https://ucum.org/) codes without changing the value’s type, unlike a unit that varies per item, which goes with its value as an amount goes with its currency ([3](https://restep.wubytes.com/1/#data)). Deferred because no implementation has needed it yet.
- **Manual order**: moving an item among others without rewriting all of them (fractional keys sorted by code point, or a `:move` action with `before` and `after`). Deferred because both designs work and neither has been tried in a Restep API.
- **Forms with starting values** that depend on the client or the moment (today’s date, the client’s shop, an inherited value), which discovery, the same for every client, cannot carry: a safe collection action such as `GET /orders:new` that returns the body of a `POST` already filled in, without creating anything. The `restep-server` library tries it as `new`; deferred until that trial settles its shape.
- **Values as of a date** (`$as_of`): separating when a value applies from when it was recorded, and what it does to validators, `state` and cursors. Deferred because it touches every profile.
- **Singletons under an item**, such as `/stores/{store_id}/settings`, and relationships, `include`, language maps and actions on singletons ([5.9](https://restep.wubytes.com/1/#singletons)). Deferred because they need a way to declare a singleton’s parent, which 4.2 has only for collections. Clients of 1.0 already ignore a singleton with a template or a `parent`, so they can come in a minor version.
- **More kinds of retirement**: lowering `include_depth` or `batch.max_operations`, and withdrawing `sync` from a collection or `events` from the API ([5.5](https://restep.wubytes.com/1/#versions)). Today each needs a new major version. Deferred because no API has needed them; clients ignore notices of a `kind` they do not know ([4.2](https://restep.wubytes.com/1/#unknown-members)), so new kinds can come in a minor version.
- **A version per experimental part**: serving a new minor version of Restep while keeping the text of an earlier one for `sync` or `batch`, so a server need not move every experimental part at once and a client need not be updated for a part whose text did not change. Today the version in `restep` decides the text of every part ([1.2](https://restep.wubytes.com/1/#experimental)). Deferred because it needs a new member of discovery and there is no second version yet to try it with.
- **Parameters of `GET` actions** ([11.1](https://restep.wubytes.com/1/#actions)): how a safe action that uses `GET` declares and receives its input, which today has no body and no declared parameters. Deferred until an action needs one.
- **How long the `id`s of deleted items are kept** ([5.1](https://restep.wubytes.com/1/#client-ids)): today for as long as the collection exists. A limit, such as `sync.retention`, would bound the cost, but once an `id` was forgotten the server could accept it again for a new item, while a client’s copy, kept for longer than that limit, still holds the old item under it. Deferred because it changes what `sync` can promise.

## Appendix C. Changes

This appendix is not normative. It lists what each draft settled, the most recent first. The sections cited are those of this draft.

### Draft 6

**Incompatible with draft 5.** What an API that followed draft 5 has to change:

- A `POST` to a collection, an action or a batch, and a `QUERY`, with a body of another media type, without `Content-Type`, empty without `Content-Type`, or with a `charset` other than UTF-8, gives `415`, and so does a `PATCH` with another media type; every `2xx` with a JSON body says `application/json` ([3](https://restep.wubytes.com/1/#media-types), [5.1](https://restep.wubytes.com/1/#resources)).
- The names that discovery declares and parameters carry, and every `reason`, follow a grammar, and a field whose name does not cannot be declared ([3](https://restep.wubytes.com/1/#names), [5.4](https://restep.wubytes.com/1/#errors)). Two `id`s are the same only code point by code point, and an item answers only its own path, compared segment by segment after percent-decoding ([3](https://restep.wubytes.com/1/#data)). Links, in bodies and in `Location` and `Link`, use `https` or the API root’s scheme, and `_x_` members do not change between two reads of the same version of an item (3).
- The discovery document is the same for every principal, equal as a JSON value, and `private` or `no-store` when served only with credentials; a declared method, action or singleton that a principal may not use gives `403` or `404`, never `405` or `unsupported_parameter` ([4.2](https://restep.wubytes.com/1/#discovery-cache)).
- A subcollection’s template uses variables with distinct names and declares `parent`, and a relationship to one of its items carries `href` ([3](https://restep.wubytes.com/1/#data), [4.2](https://restep.wubytes.com/1/#subcollections), [9](https://restep.wubytes.com/1/#relations)).
- A `POST` with an `id` to a collection without `id_from` carries a `read_only` entry at `/id` in its `422`; another read-only field in a `POST` is ignored only with the value the item would get, and is dropped before validating against a `create` schema ([4.3](https://restep.wubytes.com/1/#describing)); a field this principal may not change gives `403`, and one the item’s state does not let change `409`, both ordered with `422` ([5.4](https://restep.wubytes.com/1/#error-order)); a relationship to an item that does not exist or that the principal cannot see gives `422` with `unknown`, unless it is sent back with its current value; a server that reuses the `id` of a deleted parent item does not let its subcollection take the `id`s the old one had ([5.1](https://restep.wubytes.com/1/#client-ids)).
- A response that depends on credentials carries `private` or `no-store` on every server, not only with caching, `401` and `403` and resources outside Restep included ([5.1](https://restep.wubytes.com/1/#private-responses)).
- Parameters are read after percent-decoding, whatever the order of different names, and a `+` in the query is a space wherever the query is read after percent-decoding, `parameter` and the comparison of [7.1](https://restep.wubytes.com/1/#idempotency) included ([5.2](https://restep.wubytes.com/1/#collections)).
- `count` with any value where it is not declared, `fields` or `include` on a write, and a bracketed form Restep does not define give `unsupported_parameter` ([5.3](https://restep.wubytes.com/1/#reserved), [6.3](https://restep.wubytes.com/1/#fields), [6.5](https://restep.wubytes.com/1/#counts)). A request over an undeclared limit gives `invalid_parameter`, never part of a result ([5.3](https://restep.wubytes.com/1/#limits)).
- Problems do not reveal what the principal could not otherwise learn ([5.4](https://restep.wubytes.com/1/#errors)).
- Every deprecation notice carries an `announced` instant that does not change, and the six months count from it; a `count` notice says with `value` whether the count becomes estimated or goes; the responses that carry `Deprecation` are listed by `kind`; withdrawing a collection’s `sync` or the API’s `events` is a breaking change ([5.5](https://restep.wubytes.com/1/#versions)).
- `429` and `503` go only to requests that had no effect, never to one whose effect the server cannot tell, also from the API’s own gateways ([5.7](https://restep.wubytes.com/1/#retries)).
- A server that accepts cookies, HTTP authentication or client certificates refuses, with `403`, a request that is not safe, carries them and comes from an origin it does not allow ([5.8](https://restep.wubytes.com/1/#csrf)).
- A singleton’s path is not one an item could have, and its relationship objects carry `href` ([5.9](https://restep.wubytes.com/1/#singletons)).
- Filters and sorting treat a field the principal cannot read as absent, and a named filter does not select by such values unless its description states it, nor, if it takes a value, compare it with them; no field that is a list, no path through a to-many relationship and no path to the `id` of a subcollection’s item is declared in `filter` or `sort`; a `boolean` filter declares only `eq`, `ne` and `null`, and the `id` filter no order operators; a `datetime` filter value is never rounded ([6.1](https://restep.wubytes.com/1/#filters)).
- A collection that accepts `limit` declares `max_limit`, and a cursor that refers to results computed for a principal is bound to it ([6.4](https://restep.wubytes.com/1/#pagination)).
- The query counts towards “the same request” for `Idempotency-Key`, which is a Structured Fields String without parameters and is ignored on other methods than `POST`; a server that refuses keys without credentials declares `"anonymous": false` and answers `400`, not `401`, to a `POST` without credentials that carries one, except an idempotent action, which ignores it, and then requires the key of no request without credentials ([7.1](https://restep.wubytes.com/1/#idempotency)). `If-Match` and `If-None-Match` are evaluated on a `POST` to a collection ([7.2](https://restep.wubytes.com/1/#post-preconditions)).
- With `writes`, every response whose body is one item carries `_etag`, whatever its content coding; a write to an item just deleted gives `404`, not `410`; a minimal response carries the item’s `ETag` ([7.2](https://restep.wubytes.com/1/#etag-member), [7.3](https://restep.wubytes.com/1/#minimal)).
- `writes` no longer brings `Cache-Control` and `304`: a server that gave them announces [`cache`](https://restep.wubytes.com/1/#cache) as well; cache group names do not reveal items the client cannot see (8).
- Only a collection that declares `sync`, under the `sync` profile, answers `:changes`; `events` is relative to the API root, names a subcollection by its path relative to the API root, and sends nothing when the principal’s `state` does not change ([10](https://restep.wubytes.com/1/#sync)).
- Actions: an empty body is `{}`; an undeclared action gives `404`; `_actions` lists only declared actions with their method; an idempotent action does not reject a well-formed `Idempotency-Key`, and ignores it without credentials where `anonymous` is `false` ([11.1](https://restep.wubytes.com/1/#actions)).
- A batch operation has a `path` relative to the API root, without dot-segments, to a resource of Restep other than the event stream, into which a reference inserts only a valid `id` or an integer, checked again after inserting it; it carries only the headers 11.2 lists, acts with the batch’s credentials, and takes no `Prefer`, `If-Match` or `If-None-Match` from the batch request ([11.2](https://restep.wubytes.com/1/#batch)).
- Inherited values are the `inherit` extension, listed in `extensions` ([11.6](https://restep.wubytes.com/1/#inheritance)).
- The URIs of the version, profiles and error types, and the `$id` of the JSON Schemas, move to `https://w3id.org/restep/1/`, which redirects to the text: the profile link is `Link: <https://w3id.org/restep/1/>; rel="profile"`, and an error’s `type` is `https://w3id.org/restep/1/errors#` followed by its code ([4.1](https://restep.wubytes.com/1/#profile-header), [5.4](https://restep.wubytes.com/1/#errors)). The `https://restep.wubytes.com/1/` URIs are no longer identifiers, though the text is still read there ([1.3](https://restep.wubytes.com/1/#process)).

What a client that followed draft 5 has to change:

- It sends `application/json` with request bodies ([3](https://restep.wubytes.com/1/#media-types)), and a literal `+` in the query as `%2B` ([5.2](https://restep.wubytes.com/1/#collections)).
- It does not assume, for a draft declared as `"1.0-draft.6"`, the guarantees of a published version, does not treat a document of another major version as Restep 1, nor fall back to `core` with it ([1.1](https://restep.wubytes.com/1/#restep-versions)), and uses an experimental part only under a version whose text of it it implements ([1.2](https://restep.wubytes.com/1/#experimental)).
- It ignores members and values of discovery it does not know, and what they qualify ([4.2](https://restep.wubytes.com/1/#unknown-members)), handles an unknown `reason` as its `code` ([5.4](https://restep.wubytes.com/1/#errors)), ignores singletons with a template or a `parent` ([5.9](https://restep.wubytes.com/1/#singletons)), does not interpret a `state` ([10](https://restep.wubytes.com/1/#sync)), and treats an unknown `from` as `"hidden"` ([11.6](https://restep.wubytes.com/1/#inheritance)).
- It sends credentials only to the API’s origin, does not follow links with other schemes ([3](https://restep.wubytes.com/1/#data)), and makes no unsafe request only because a text of the API asks it to, which are now requirements ([4.3](https://restep.wubytes.com/1/#texts-are-data)).
- It does not send `id` where `id_from` has a value it does not know, and links an item of a subcollection by `href` ([5.1](https://restep.wubytes.com/1/#resources)).
- It assumes no order of `id`s, nor code-point order where `collations` says `"server"` ([5.2](https://restep.wubytes.com/1/#collections), [6.1](https://restep.wubytes.com/1/#collations)).
- It expects `Cache-Control` and `304` on reads from `cache`, not from `writes` ([8](https://restep.wubytes.com/1/#cache)), and a `400` to an `Idempotency-Key` sent without credentials where `idempotency` says `"anonymous": false`, except from an idempotent action, which ignores it ([7.1](https://restep.wubytes.com/1/#anonymous-keys)).
- In a batch, it keeps `$ref` out of data it did not write ([11.2](https://restep.wubytes.com/1/#batch)).
- It recognises the profile link and Restep’s error types under `https://w3id.org/restep/1/`, not under `https://restep.wubytes.com/1/` ([4.1](https://restep.wubytes.com/1/#profile-header), [5.4](https://restep.wubytes.com/1/#errors)).

**Additions.** A draft or candidate declares itself with a suffix in `restep` ([1.1](https://restep.wubytes.com/1/#restep-versions)); profiles and extensions are stable or experimental ([1.2](https://restep.wubytes.com/1/#dependencies)); a licence, a rule on the use of the name and a process for changes ([1.3](https://restep.wubytes.com/1/#process)); what separates a profile, an extension and a capability, and when two JSON values are equal ([2](https://restep.wubytes.com/1/#terms)); how long a client keeps the discovery document, and that it may require credentials ([4.2](https://restep.wubytes.com/1/#discovery-cache)); client-chosen `id`s with `id_from` and the `taken` entry ([5.1](https://restep.wubytes.com/1/#client-ids)); more kinds of retirement and a table of changes that were not classified ([5.5](https://restep.wubytes.com/1/#versions)); what can be retried ([5.7](https://restep.wubytes.com/1/#retries)); singletons, and resources outside Restep, which can be a PDF ([5.9](https://restep.wubytes.com/1/#singletons)); `collations` ([6.1](https://restep.wubytes.com/1/#collations)); a `403` with `parameter` for a filter on a field the principal can read in no item ([6.1](https://restep.wubytes.com/1/#unreadable)); waiting for a request in progress instead of `409`, and refusing anonymous idempotency keys, declared in `idempotency.anonymous` ([7.1](https://restep.wubytes.com/1/#idempotency)); the `cache` profile ([8](https://restep.wubytes.com/1/#cache)); a limit on event streams ([10](https://restep.wubytes.com/1/#sync)); checks for every extension, marked where a checker needs to be given something ([12.1](https://restep.wubytes.com/1/#server-conformance)); client conformance ([12.2](https://restep.wubytes.com/1/#client-conformance)); security and privacy considerations ([13](https://restep.wubytes.com/1/#security)); normative and informative references ([14](https://restep.wubytes.com/1/#references)); and these appendices. Date-based versioning in a header was closed: Restep 1 does not offer it ([5.5](https://restep.wubytes.com/1/#versions)). The order of errors was relaxed: `400` for the body, `415`, `406` and `413` are no longer ordered among themselves, a `413` from a server placed in front of the API is outside the order, and replays go right before `428`; the `403` for a field the principal may not change goes with `422`, and step 1 keeps only the `403` that depends on neither the body nor the stored item ([5.4](https://restep.wubytes.com/1/#error-order)).

### Draft 5

A single, fixed `rel="profile"` link per response, to the version URI, so headers do not grow with what the server announces ([4.1](https://restep.wubytes.com/1/#profile-header)); `_x_` members for extensions outside Restep ([3](https://restep.wubytes.com/1/#data)); a link to the documentation for people (`service-doc`, [4.2](https://restep.wubytes.com/1/#discovery)); and a catalogue of domain reasons in discovery ([5.4](https://restep.wubytes.com/1/#errors)), at the root only, in which a reason has one `code` and, once declared, stays until the next major version; that a read-only field sent back with its current value is ignored, and a `PATCH` that would change no data leaves the item as it was, `updated_at` and `ETag` included ([5.1](https://restep.wubytes.com/1/#resources)); that in `:changes` an item’s visibility picks its list, so one created and destroyed within the window is reported in `destroyed` if the client could see it ([10](https://restep.wubytes.com/1/#sync)); inherited values, with a read-only effective field and an own field that is written, so that sending back what was read never pins an inherited value ([11.6](https://restep.wubytes.com/1/#inheritance)); and what a form takes from the schemas, with a binding `default` in `create` ([4.3](https://restep.wubytes.com/1/#describing)); and named filters, for criteria that do not compare a field, like the *scopes* of many ORMs ([6.1](https://restep.wubytes.com/1/#filters)). And three that came from building the tools: `_etag` in the collection items a client can write, required where the collection answers `:changes` ([7.2](https://restep.wubytes.com/1/#concurrency)); `409 request_in_progress` for the same request while the first one is still running, which replaces `409 conflict` in that case, so an API that followed draft 4 changes that `code` ([7.1](https://restep.wubytes.com/1/#idempotency)); and what a browser client needs from CORS ([5.8](https://restep.wubytes.com/1/#browser-clients)).

### Draft 4

How a client discovers authorization, with the [`oauth`](https://restep.wubytes.com/1/#oauth) extension, without new error codes or scopes in discovery; that an idempotency key and a cursor belong to the principal, not to the token ([7.1](https://restep.wubytes.com/1/#idempotency), [6.4](https://restep.wubytes.com/1/#pagination)); that `api-catalog` is optional ([4.2](https://restep.wubytes.com/1/#discovery)); what helps agents and other generic clients use an API without trying it, as optional members of discovery ([4.3](https://restep.wubytes.com/1/#describing)): the methods of each collection, short descriptions, and JSON Schemas for items and request bodies; `parameter` on every `invalid_parameter` ([5.3](https://restep.wubytes.com/1/#reserved)) and `detail` as a recommendation ([5.4](https://restep.wubytes.com/1/#errors)); several `service-desc` links ([4.2](https://restep.wubytes.com/1/#discovery)); the method of an action, declared ([11.1](https://restep.wubytes.com/1/#actions)), so a `GET` action of an earlier draft now says `"method": "GET"`; how to find the service status, without a fixed path ([4.4](https://restep.wubytes.com/1/#health)); and languages: the API’s texts follow `Accept-Language` ([5.6](https://restep.wubytes.com/1/#language)), data never does, and translated text goes in language maps with lowercase tags, which can be filtered and sorted by exact tag ([3](https://restep.wubytes.com/1/#data), [6.1](https://restep.wubytes.com/1/#filters)).

### Draft 3

The order between errors ([5.4](https://restep.wubytes.com/1/#errors)); an item’s path ([5.1](https://restep.wubytes.com/1/#resources)); what a cursor is bound to ([6.4](https://restep.wubytes.com/1/#pagination)); filters repeated in either form, ranges as two filters on one field, and `null` on booleans ([6.1](https://restep.wubytes.com/1/#filters)); invalidation with cache groups ([8](https://restep.wubytes.com/1/#caching)); and how a client resumes the event stream ([10](https://restep.wubytes.com/1/#sync)).

### Draft 2

`filter[field][op]` is enough for `query`, and expressions stay in `filter-expr`; no dedicated media type, since `application/json`, `application/problem+json` and the profile URIs are enough; discovery declares field types only where Restep needs them ([4.2](https://restep.wubytes.com/1/#discovery)); and there is no per-field cache policy in Restep 1, because each combination of `fields` is already its own URL for a cache.
