> Generated from https://restep.wubytes.com/1/. The HTML page is the source: where they differ, it prevails, and the English
> text prevails over the Spanish one. Profile and error URIs point to the HTML page.

# Restep 1 · specification

## 1. Status and scope

**Draft 5**, 20 November 2026 (draft 4, draft 3 and draft 2: 19 November 2026; draft 1: 12 November 2026). It may change without notice until version 1.0 is published.

URI of this version: `https://restep.wubytes.com/1/`

Published in English and in [Spanish](https://restep.wubytes.com/es/1/). Where the two differ, the English text prevails; profile and error URIs point to it.

Also as a single Markdown file, for agents and for diffing: [`spec.md`](https://restep.wubytes.com/1/spec.md).

Restep is a profile for HTTP APIs that exchange JSON and are organised around resources: level 2 of the Richardson Maturity Model. It settles what that level leaves open (the shape of collections and errors, querying, safe writes, relationships and sync) and splits it into five **profiles** that are adopted one at a time, plus optional **extensions**.

Out of scope: authentication and authorization (OAuth 2.0 is recommended, with OpenID Connect where the API needs the user’s identity; the [`oauth`](https://restep.wubytes.com/1/#oauth) extension says where a client gets a token), each API’s domain design, and anything below HTTP. Restep requires no schema and no code generator: a `core` server can be written by hand.

### 1.1 Restep versions

- Restep has a major and a minor version. The major one is in all its URIs (`/1/`); the discovery document declares the full one: `"restep": "1.0"`.
- A minor version only adds: profiles, extensions, discovery fields, or error codes for new cases (never a new code for a case that already had one). Whatever conforms to 1.0 still conforms to 1.1. Adding error codes is safe because clients handle unknown ones by the class of the status ([5.4](https://restep.wubytes.com/1/#errors)).
- A minor version MUST NOT reserve parameter names beyond those listed in [5.3](https://restep.wubytes.com/1/#reserved), except names starting with `$`, which are kept for future versions of Restep.
- An incompatible change will be Restep 2, with new URIs (`/2/core`…). The `/1/` URIs will never move.
- Until 1.0 is published, drafts may change incompatibly.

### 1.2 Profiles and dependencies

Each profile only adds requirements; none changes the type or meaning of what an earlier one defines, so announcing a new profile never breaks an existing client. Some profiles need others:

| Profile or extension | Requires |
|---|---|
| `core` | Nothing; every Restep API implements it |
| `query`, `writes`, `relations` | `core` |
| `sync` | `core` and `query` (to fetch changed items by `id`) |
| `actions`, `batch`, `oauth` | `core` |
| `filter-expr`, `query-method` | `query` |

A server MUST NOT announce a profile or extension without the ones it requires.

## 2. Terms

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be interpreted as described in [**RFC 2119**](https://www.rfc-editor.org/rfc/rfc2119) and [**RFC 8174**](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in all capitals. Every requirement of this specification carries one of them; sentences without them explain or give examples.

- **API root**: the base URL a client is configured with, such as `https://api.example.com/` or `https://example.com/api/`. Paths in this specification and in the `path` members of discovery and batch, such as `/books`, are relative to it: under `https://example.com/api/`, `/books` means `https://example.com/api/books`. Links in bodies and headers are not: they are URI references ([**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986)) resolved against the request URL.
- **Collection**: a resource grouping items of the same type, such as `/books`.
- **Item**: a resource in a collection, such as `/books/7`.
- **Profile**: a named set of requirements (`core`, `query`…) with its own URI.
- **Reserved parameter**: a query parameter whose meaning Restep defines ([section 5.3](https://restep.wubytes.com/1/#reserved)).
- **Principal**: who a request acts for, as the server authenticates it (in OAuth 2.0, the client and, if there is one, the user). It is not the credential: a request with a renewed token comes from the same principal.
- **Capability**: something a resource declares in discovery (a filter, an operator, a sort key, a relationship, an action).

## 3. Data

- Bodies MUST be JSON ([**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259)) encoded as UTF-8. The exceptions are responses without a body (`204`, `304`, `HEAD`) and the event stream of [`sync`](https://restep.wubytes.com/1/#sync).
- Field names defined by Restep are `snake_case`. Each API chooses its own, but SHOULD stick to one convention.
- Member names starting with `_` are reserved for Restep (such as `_actions`, `_etag`). An API MUST NOT define fields with that prefix.
- An item’s identifier is called `id`. It MUST be a non-empty string made only of [**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986) unreserved characters (`A–Z a–z 0–9 - . _ ~`), so it can go into a path without escaping, and MUST NOT be `.` or `..`, which URI resolution would remove. It MUST NOT change.
- A field whose values may fall outside ±(2^53−1), or that needs exact decimal arithmetic (amounts of money), MUST be a string in every representation, whatever the value: `"price": "18.50"`. An amount of money SHOULD come with its ISO 4217 currency.
- Instants MUST follow [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339) `date-time` with an offset: `"2026-11-12T09:30:00Z"`. Calendar dates MUST use `full-date`: `"1987-03-14"`. Durations SHOULD be ISO 8601 (`"PT90S"`); a field holding seconds as a number SHOULD end in `_seconds`.
- Absent and `null` are different. On reads, a field with no value MAY be omitted or set to `null`, except a language map, which is `{}`; in a `PATCH`, `null` deletes and absent leaves untouched ([**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396)).
- A **relationship**, when a representation includes one, MUST be an object with at least `id` (to-one), a list of such objects (to-many), `null` (an empty to-one) or `[]` (an empty to-many). Never a bare identifier, so the field’s type does not change when the related item is included ([section 8](https://restep.wubytes.com/1/#relations)). When a relationship can point to more than one collection, each object MUST also carry `type` with the target collection’s name.
- Links in bodies (`next`, `href`) MUST be absolute URIs or absolute paths, starting with `/` and including the API root’s path (`/api/books?cursor=…`), so a colon inside a segment (`/orders/2001:cancel`) is never read as a scheme, as it would be in the relative reference `2001:cancel`.
- Clients MUST ignore fields they do not know and tolerate new enum values.
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

Every API response SHOULD carry one `rel="profile"` link ([**RFC 6906**](https://www.rfc-editor.org/rfc/rfc6906)) per implemented profile and extension. A profile’s URI is the version URI followed by its name:

```
Link: <https://restep.wubytes.com/1/core>; rel="profile",
      <https://restep.wubytes.com/1/query>; rel="profile"
```

Profiles apply to the whole API. Which collection supports what is said only by the declarations in the discovery document.

### 4.2 Discovery document

A `GET` on the API root returns a document stating the server’s profiles, extensions and capabilities. A `core`-only server SHOULD serve it; a server that announces any other profile or extension, or has language maps ([3](https://restep.wubytes.com/1/#data)), MUST serve it. A server whose root is taken MAY serve it elsewhere and point to it from its responses with `Link: <…>; rel="service-desc"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)). A response MAY carry several `service-desc` links, such as one to an OpenAPI document; the one to the discovery document SHOULD carry `type="application/json"`, and clients MUST use the first target that is a discovery document.

Clients MUST treat a response as a discovery document only if it is a JSON object with a string member `restep`. Without one, clients MUST assume `core` only. If the `Link` header and the document disagree, the document prevails.

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
      "sort": ["id", "price", "rating", "title"],
      "max_limit": 50,
      "count": "estimated",
      "relations": {
        "author":  { "to": "authors", "include": true },
        "reviews": { "to": "reviews", "many": true, "path": "/books/{id}/reviews" } },
      "include_depth": 2,
      "sync": { "retention": 604800 },
      "actions": { "reserve": { "on": "item", "safe": false, "idempotent": true,
        "description": "Holds a copy for the user for 48 hours.", "input": "/schemas/reserve.json" } } },
    "reviews": { "path": "/books/{id}/reviews", "sort": ["id", "created_at"], "max_limit": 50 } } }
```

An API SHOULD link its documentation for people with `Link: <…>; rel="service-doc"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)) in the response that serves its discovery document or, if it serves none, in the response to a `GET` on the API root, with the API root as `anchor` ([**RFC 8288**](https://www.rfc-editor.org/rfc/rfc8288)) if that response is an error. A response MAY carry several, and each MAY state the languages of its target with `hreflang`; a client picks among them by `hreflang`, so the server need not choose them by `Accept-Language`. That documentation explains what discovery cannot say, such as business rules, the permissions each operation needs, usage limits and examples. Where it contradicts discovery, discovery prevails.

```
Link: <https://docs.example.com/api/>; rel="service-doc"; hreflang="es",
      <https://docs.example.com/en/api/>; rel="service-doc"; hreflang="en"
```

- Each profile adds its own fields to the document, described in its section. The members of the root and of each collection, `schemas`, filter, relation, action, deprecation, language map, reason and inheritance object belong to Restep, so a later minor version can add some: a server MAY add its own, and their names MUST start with `x-`. This does not apply to the names the API gives its collections, fields, relations, actions and reasons, which are keys of `collections`, `filter`, `relations`, `actions`, `language_maps`, `reasons` and `inherit`. Clients ignore what they do not know.
- `language_maps`: the fields of a collection that are language maps ([3](https://restep.wubytes.com/1/#data)), as an object whose keys are the field names: `"language_maps": {"name": {}, "description": {}}`. It MUST list all of them; if it is missing, the collection has none. The object of each field is left for minor versions.
- A collection’s `path` MAY be a URI template ([**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570)); subcollections are declared that way.
- Field types, where discovery declares them, come from this list: `string`, `integer`, `number`, `decimal` (a string matching `-?[0-9]+(\.[0-9]+)?`), `boolean`, `date`, `datetime`, `duration` and `enum` (with its `values`). Discovery only declares types where Restep needs them, such as filters; the shape of whole representations and request bodies goes in the schemas of [4.3](https://restep.wubytes.com/1/#describing). A representation MAY also link its schema with `rel="describedby"`.
- An origin that lists its APIs in `/.well-known/api-catalog` ([**RFC 9727**](https://www.rfc-editor.org/rfc/rfc9727)) MAY include a Restep API there, with the API root as `anchor`, a `service-desc` link to its discovery document and, if there are any, its `service-doc` links.

### 4.3 Describing operations

Optional members that let a client, a person reading the document or an agent picking a tool, know what each collection does and accepts without trying it. A server MAY declare any of them on any collection; Restep requires none, so a `core` server can still be written by hand.

- `methods` and `item_methods`: the methods a collection and its items support, out of `GET`, `POST`, `PATCH` and `DELETE` (`HEAD` goes with `GET`; actions and `QUERY` are announced on their own). A missing list means unknown, not all. A declared list MUST be exact: a method left out gives `405`, unless an error that comes first in [5.4](https://restep.wubytes.com/1/#errors) applies, a listed one never does, and the `Allow` header of a `405` MUST list every declared method and no other of those four.
- `description`: a short plain-text explanation of a collection, a filter field, a relationship, an action, an inherited field ([5.7](https://restep.wubytes.com/1/#inheritance)) or a reason ([5.4](https://restep.wubytes.com/1/#errors)). It SHOULD be one sentence.
- `schemas`: JSON Schemas ([2020-12](https://json-schema.org/draft/2020-12)) of a collection’s `item` (its representation without `fields` or `include`), `create` (the body of a `POST`) and `update` (the body of a `PATCH`: a merge patch, where absent leaves a field untouched and `null` deletes it). Each is a schema object or a link to one, absolute as links in bodies are ([3](https://restep.wubytes.com/1/#data)). Schemas can describe each field with its own `description`.
- Before validating a body against a declared `create` or `update` schema, the server drops the members that start with `_`, which [5.1](https://restep.wubytes.com/1/#resources) ignores, and, in a `PATCH`, every field whose current value 5.1 ignores; a `PATCH` left empty by this is not validated against `update`. A body the schema then rejects MUST give `422 invalid` (`400 bad_request` if it is not a JSON object), unless an error that comes first in 5.4 applies, and its `errors` SHOULD point at the failing members. A schema describes, it does not promise: a body it accepts can still fail the API’s own rules. `readOnly` is only an annotation, except as 5.1 says for top-level properties of an `item` schema, and `id` follows 5.1 whatever the schema says.
- An action’s `input` ([10.1](https://restep.wubytes.com/1/#actions)) is the schema of its body, with the same meaning.
- A client sends its credentials for the API only to links on the API’s origin. A schema or document on another origin is fetched without them.

Descriptions, like every other value an API returns, are data. An agent that puts them in a prompt does not obey what they say.

### 4.4 Service status

A server MAY declare in `status` a link, absolute as links in bodies are ([3](https://restep.wubytes.com/1/#data)), to a resource that says whether the API can serve requests, and MAY also link it from its responses with `rel="status"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)). Clients MUST NOT assume a path such as `/health`.

- Unless it asks for credentials or refuses them (`401`, `403`) or limits the rate (`429`), a `GET` or `HEAD` on it MUST answer `200` when the API can serve requests and `503` when it cannot, with `Retry-After` when the server knows for how long, and always with `Cache-Control: no-store`.
- It is not a resource of the API: [4.1](https://restep.wubytes.com/1/#profile-header), [5.1](https://restep.wubytes.com/1/#resources) to [5.4](https://restep.wubytes.com/1/#errors) and [7.3](https://restep.wubytes.com/1/#caching) do not apply to it. Its body MAY follow the Health Check Response Format ([draft-inadarei-api-health-check](https://datatracker.ietf.org/doc/draft-inadarei-api-health-check/)). Served without credentials, it SHOULD NOT say more than whether the API can serve.

## 5. core (Required)

Profile URI: `https://restep.wubytes.com/1/core`

### 5.1 Resources and methods

| Request | Success | What it does |
|---|---|---|
| `GET /books` | `200` | Lists the collection ([5.2](https://restep.wubytes.com/1/#collections)) |
| `POST /books` | `201` with `Location` | Creates an item and returns its representation |
| `GET /books/7` | `200` | Returns the item, with no envelope |
| `PATCH /books/7` | `200` | Partial update with JSON Merge Patch ([**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396)), except relationship objects (below) and language maps ([3](https://restep.wubytes.com/1/#data)); returns the whole item |
| `DELETE /books/7` | `204` | Deletes the item. Repeating it MAY return `404` |

- Responses MUST use the statuses in the table for those operations, except where [7.4](https://restep.wubytes.com/1/#minimal) allows a response without a body.
- `PUT` is outside Restep 1: a client that replaces a whole item would erase fields added to the item after that client was written. Clients SHOULD use `PATCH`.
- `HEAD` MUST be supported wherever `GET` is ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110)). `GET` and `HEAD` MUST NOT have effects visible to the client.
- A method the resource does not support MUST return `405` with an `Allow` header. `OPTIONS` is outside Restep: servers MAY answer it for CORS.
- `PATCH` MUST accept `application/merge-patch+json` and SHOULD also accept `application/json` with the same meaning. A `415` to a `PATCH` SHOULD carry `Accept-Patch` ([**RFC 5789**](https://www.rfc-editor.org/rfc/rfc5789)). A patch that is not a JSON object MUST give `400 bad_request`.
- An item’s path MUST be its collection’s path, with any URI template expanded ([**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570)), its variables taking in order the `id`s of the parent items, and without a trailing `/`, followed by `/` and the item’s own `id`: `/books/7`, `/books/7/reviews/3`.
- The server MUST assign `id`, and MUST give `422 invalid` to a `POST` that carries an `id` or a `PATCH` that carries a different one.
- In a write, the server MUST ignore members whose names start with `_`, so a client can send back a representation it read.
- A **read-only field** is one no client can change with a `PATCH`: `id`, an effective field ([5.7](https://restep.wubytes.com/1/#inheritance)), one only the server sets (`created_at`, a total), or a top-level property that the `item` schema marks `"readOnly": true` directly in its `properties` ([4.3](https://restep.wubytes.com/1/#describing)); a server MUST NOT mark so a property that some client or some state of the item lets change with a `PATCH`. A value in a `PATCH` is **current** when it is the field’s value as read, or when applying it as this section says (a relationship by its `id`, a language map by key) leaves the field as it was before the `PATCH`. If a `PATCH` carries a read-only field with its current value, the server MUST ignore it; with another value, it MUST respond `422 invalid` with a `read_only` entry whose `pointer` is the field, and MUST NOT apply any of that request. A field that this client, or the item’s current state, does not let it change follows the first half of that rule: its current value MUST be ignored, and another value gets the error the API gives a write it does not allow. For a field the client is allowed to read, the server compares after validating a language map as [3](https://restep.wubytes.com/1/#data) says; for a field it cannot read, neither the rules above nor the checks of 3 that look at the stored value apply, and it MUST answer the same whatever the value.
- A valid `PATCH` that, setting aside the fields it ignores, would change no data of the item MUST NOT change it: its representation and its `ETag`, if any, stay the same, and a field such as `updated_at` does not move. So the read-only fields of a representation that was read never make a `PATCH` fail or change anything, if the item has not changed since.
- In a write, a relationship object is replaced whole, not merged: the server MUST read only its `id` (and `type`) and MUST NOT change the related item through it. `{"author": {"id": "4"}}` links another author; `{"author": null}` unlinks it. A to-many list is replaced whole, as Merge Patch does with any array.

### 5.2 Collections

A collection MUST respond with an object holding `items` (a list) and `next`: the URL of the next page, or `null` when there are no more. `next` MUST always be present, even if the server does not paginate yet.

```
{ "items": [ { "id": "7", "title": "La niebla de Portugalete" } ],
  "next": null }
```

- Clients MUST follow `next` as is, without changing or building it, except for the parameters [6.4](https://restep.wubytes.com/1/#pagination) lets them change between pages.
- A collection MUST have a deterministic default order. Without concurrent writes, following `next` until `null` MUST return every item exactly once. With concurrent writes, items may be repeated or missed; a client that needs an exact copy uses [`sync`](https://restep.wubytes.com/1/#sync).
- The server picks the page size. Without the `query` profile, clients cannot change it.
- The object MAY carry other fields defined by profiles (`total`, `state`).

### 5.3 Reserved parameters: fail loudly

These parameter names, with or without brackets, belong to Restep: `filter`, `sort`, `fields`, `include`, `count`, `limit`, `cursor`, `since` and `languages` (unused in Restep 1), plus any name starting with `$`.

> Unless an error that comes first in [5.4](https://restep.wubytes.com/1/#errors) applies, when a request uses a reserved parameter, or a form of one, that the resource does not implement for that method, the server MUST respond `400` with the code `unsupported_parameter` and the parameter name, exactly as received after percent-decoding, in `parameter`. It MUST NOT ignore it.

This is the rule that lets a server climb a step without breaking anyone: a client filtering against a server that cannot filter gets a clear error instead of the whole collection, as if the filter had been applied. Non-reserved parameters belong to each API, and Restep says nothing about them.

The two parameter codes tell a client whether to change the request or give up on the capability:

- `unsupported_parameter` MUST be used when the request asks for something the resource does not offer: a reserved parameter it does not implement, a parameter form it does not support (`filter=…` without [`filter-expr`](https://restep.wubytes.com/1/#filter-expr), `sort[…]`), a filter field or operator, sort key or relationship that is not declared, or `count` on a collection that does not declare it. It applies to every method: `POST /books?filter[x]=1` gives it too.
- `invalid_parameter` MUST be used when a supported capability gets a wrong value: a value that does not match the field’s type, a `limit` out of range, a field in `fields` that does not exist, an empty list, a repeated parameter, a bad cursor. Like `unsupported_parameter`, it MUST carry in `parameter` the name of the parameter at fault, exactly as received after percent-decoding; for a missing one, its name; in the body of a `QUERY` ([10.4](https://restep.wubytes.com/1/#query-method)), the name of the equivalent `GET` parameter, such as `filter[price][le]`, or the member’s own name when there is none.

### 5.4 Errors

Every `4xx` or `5xx` response the API generates MUST use `application/problem+json` ([**RFC 9457**](https://www.rfc-editor.org/rfc/rfc9457)) when it has a body, with `type`, `title`, `status` (equal to the response’s) and a `code`. It SHOULD carry `detail`, saying, where it can, how to fix the request (the accepted values, the allowed range), and MAY carry `instance` and its own members. An error MUST NOT be sent as a `200` response; the only place an error goes inside a `200` is a per-operation result of [`batch`](https://restep.wubytes.com/1/#batch).

```
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{ "type": "https://restep.wubytes.com/1/errors#invalid",
  "title": "Invalid data",
  "status": 422,
  "code": "invalid",
  "errors": [ { "pointer": "/price", "code": "required", "detail": "price is required." } ] }
```

- `code` MUST come from the table below. For a status the table does not list, `code` MUST be that status’s description in the IANA HTTP Status Code Registry, in `snake_case` (`502` → `bad_gateway`, `431` → `request_header_fields_too_large`), or `http_` followed by the number for an unregistered status.
- `type` SHOULD be `https://restep.wubytes.com/1/errors#` followed by the code, or a URI of the API’s own that documents the case. It MAY be `about:blank`.
- For errors of the API’s domain (insufficient funds, out of stock) the response MAY add `reason`: a `snake_case` string defined by the API and stable within a version. `code` keeps the class (`conflict`, `invalid`), so a generic client still knows what to do.
- The API MAY declare its reasons in discovery, in `reasons` at the root: an object whose keys are the values of `reason`; each value carries the `code` that reason comes with and MAY carry a `description` ([4.3](https://restep.wubytes.com/1/#describing)): `"reasons": {"out_of_stock": {"code": "conflict", "description": "No copies left to reserve."}}`. If declared, it MUST be complete: a problem MUST NOT carry a `reason` that is not in it, nor carry it with another `code`. This applies to the top-level `reason` of every problem, also those in [`batch`](https://restep.wubytes.com/1/#batch) results, and not to the API’s own codes inside `errors`. If `reasons` is missing, which reasons exist is unknown. A client treats a `reason` it does not know by its `code`.
- Validation errors SHOULD list the problems in `errors`. Each entry has a `pointer` (a JSON Pointer, [**RFC 6901**](https://www.rfc-editor.org/rfc/rfc6901), into the request body; Restep uses the plain string form, not the URI fragment), or a `parameter` or `header` name, plus a `code`: `required`, `type`, `format`, `range`, `too_long`, `unknown`, `read_only`, or one of the API’s own.
- A `401` MUST carry `WWW-Authenticate` ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110)).
- Clients MUST handle a `code` they do not know according to the class of the `status`.
- When more than one of these errors applies to a request, the server MUST report the first in this order: `401`, `403`, `404`, `410`, `405`, `400`, `415`, `406`, `413`, `428`, `412`, `422`, `409`. Within `400`, `unsupported_parameter` and `invalid_parameter` come before `bad_request`; other codes that share a status are not ordered. The order also decides between errors that other sections require ([4.3](https://restep.wubytes.com/1/#describing), 5.3, [9](https://restep.wubytes.com/1/#sync), [10](https://restep.wubytes.com/1/#extensions)). Before giving an error, the server MUST rule out the earlier ones it can check; it need not parse a body whose media type it rejects, read past its size limit, or validate the operations of a batch that exceeds `max_operations`, to look for another. Whether conditional headers are evaluated at all follows [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.1) (section 13.2.1); when they are, this order prevails over the point at which [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.2) (section 13.2.2) evaluates them, so a body that is not JSON gives `400` before a failed precondition. The order says nothing about statuses it does not list, such as `414`, `424`, `429` and `5xx`. When the API does not reveal whether a resource exists, that case is a `404`, not a `403`; a retired resource gives `410`, not `404`, unless its existence is concealed.

| `code` | Status | When | Profile |
|---|---|---|---|
| `bad_request` | 400 | The body is not JSON or does not have the expected shape; a malformed header | core |
| `invalid_parameter` | 400 | A supported parameter has a wrong value ([5.3](https://restep.wubytes.com/1/#reserved)) | core |
| `unsupported_parameter` | 400 | The resource does not offer what the parameter asks for ([5.3](https://restep.wubytes.com/1/#reserved)) | core |
| `idempotency_key_required` | 400 | The resource requires `Idempotency-Key` and it is missing | writes |
| `unauthenticated` | 401 | Missing or invalid credentials; sent with `WWW-Authenticate` | core |
| `forbidden` | 403 | Valid credentials without permission for this, where the client may know the resource exists | core |
| `not_found` | 404 | The resource does not exist, or its existence is not to be revealed | core |
| `method_not_allowed` | 405 | The resource does not support that method; sent with `Allow` | core |
| `not_acceptable` | 406 | The server cannot produce any type in `Accept` | core |
| `conflict` | 409 | Clashes with the current state: a duplicate, an impossible transition, the same request as one still in progress under the same `Idempotency-Key` ([7.1](https://restep.wubytes.com/1/#idempotency)) | core |
| `state_expired` | 410 | The server can no longer compute changes since that state | sync |
| `retired` | 410 | A resource or action removed after its `Sunset` date ([5.5](https://restep.wubytes.com/1/#versions)) | core |
| `precondition_failed` | 412 | A precondition (`If-Match`, `If-None-Match`) failed: someone changed the resource, or it already exists | writes |
| `content_too_large` | 413 | The body is too large, or a batch exceeds `max_operations` | core |
| `uri_too_long` | 414 | The URL is too long (see [`query-method`](https://restep.wubytes.com/1/#query-method)) | core |
| `unsupported_media_type` | 415 | Content type not supported | core |
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

**Compatible changes.** A server MAY make them at any time: adding fields to a representation; adding optional parameters, collections, actions or enum values; supporting new filters, sorts or includes; adding profiles or extensions; declaring `reasons` or adding reasons to it ([5.4](https://restep.wubytes.com/1/#errors)). They work because clients ignore what they do not know ([section 3](https://restep.wubytes.com/1/#data)).

**Breaking changes.** A server MUST NOT make them within a version, except through retirement (below):

- removing or renaming a field, or changing its type or meaning;
- making an input field, parameter or header required when it was not (including `If-Match` through `428`, and `Idempotency-Key`);
- tightening validation so that a request accepted before is now rejected (making read-only a field that could be written, too), unless it closes a security hole;
- removing a declared filter, sort, relationship, action, collection, profile or method ([4.3](https://restep.wubytes.com/1/#describing));
- changing the format of `id`s, resource URLs or a collection’s default order;
- changing the status or the `code` returned for the same case;
- removing `reasons` once declared, removing a reason from it, or changing a reason’s `code`.

**Retiring.** Within a version, a field or a declared capability can only disappear by retiring it:

- It is announced first. Discovery MUST list it in `deprecations`, at the root for a version or a collection and in the collection for the rest: `{"kind": "field", "name": "rating", "sunset": "2027-07-01T00:00:00Z"}`, where `kind` is `version`, `collection`, `field`, `filter`, `sort`, `relation`, `action`, `method` or `item_method` (with the method as `name`), and `sunset`, once there is a date, is an [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339) instant. Responses that use it MUST carry `Deprecation` ([**RFC 9745**](https://www.rfc-editor.org/rfc/rfc9745)) and a `Link` with `rel="deprecation"` to the explanation. When what is retired is a whole resource, an action or a version, its responses MUST also carry `Sunset` ([**RFC 8594**](https://www.rfc-editor.org/rfc/rfc8594), as an HTTP-date) once there is a date.
- At least six months SHOULD pass between the notice and the removal.
- After the date, a retired resource, action or version MUST respond `410 retired`; a retired filter, sort or relationship MUST give `400 unsupported_parameter`, like any undeclared one; a retired method gives `405`; a retired field is simply absent.

```
GET https://api.example.com/v1/books/7
→ 200
Deprecation: @1798761600
Sunset: Thu, 01 Jul 2027 00:00:00 GMT
Link: </v2/>; rel="successor-version",
      <https://docs.example.com/v2>; rel="deprecation"

GET https://api.example.com/v1/books/7   after 1 July 2027
→ 410 application/problem+json
{ "type": "https://restep.wubytes.com/1/errors#retired", "title": "Retired", "status": 410, "code": "retired" }
```

**A new major version.** A breaking change that cannot go through retirement requires one:

- The version MUST go in the path, as `v` followed by an integer: `/v2/`. Each version is a separate API root with its own discovery document, which MUST declare it as `"version": "2"`.
- The version MUST NOT go in headers, parameters or media types: in the path it is visible, cacheable and routable with no code. This leaves out date-based versioning in a header; see [open questions](https://restep.wubytes.com/1/#open).
- The two versions MUST link to each other with `Link` ([**RFC 5829**](https://www.rfc-editor.org/rfc/rfc5829)), at least in the discovery document: `rel="successor-version"` from the old one and `rel="predecessor-version"` from the new one.

### 5.6 Language of the API’s texts

Errors, the discovery document and the schemas the API serves MAY depend on `Accept-Language` ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-12.5.4), section 12.5.4). Only their texts for people change: in an error, `title` and `detail`, also those of each `errors` entry; in discovery, `description`; in a schema, also one embedded in `schemas`, the JSON Schema `title` and `description` annotations. Data never does ([3](https://restep.wubytes.com/1/#data)).

- The server picks the language with the *lookup* of [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647#section-3.4) (section 3.4) over the languages it can give that response in, trying the ranges of `Accept-Language` from highest to lowest weight and, at equal weight, in header order; case-insensitively, without canonicalizing ranges or tags (`iw` does not find `he`), and without first dropping extensions or private-use subtags. It ignores `*`, ranges with `q=0` and malformed ranges (a malformed `q` included). If none matches, or the header is missing, it MUST use its default language. It MUST NOT answer `406` or `400` because of `Accept-Language`.
- Every response whose texts are picked this way (an error, the discovery document or a schema), in the default language too, MUST carry `Vary: Accept-Language`, and a `304` of these the same `Vary` as its `200`. A response with a body SHOULD carry `Content-Language`. Each language is a different representation: an `ETag`, if present, MUST differ by language.
- Lookup truncates the requested tag and never tries sibling variants: with `es-es` and `es-mx` but no `es`, `Accept-Language: es-AR` gets the default language. A server that offers regional variants of its texts SHOULD also offer the bare language.
- A replay ([7.1](https://restep.wubytes.com/1/#idempotency)) returns the stored response, in its language, because `Accept-Language` does not count towards “the same request”.

### 5.7 Inherited values

A value can apply to an item without being stored in it: a product’s tax rate is its own if it has one; otherwise its category’s, its parent category’s or its store’s; and if none has one, a default. Restep expresses this with **two fields** and a declaration in discovery. No API has to use it; the rules of this section apply only to the fields that `inherit` declares.

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
  "relations": { "category": { "to": "categories" } },
  "inherit": {
    "tax_rate": { "own": "tax_rate_own", "from": ["category"], "default": true,
                  "description": "The product’s tax rate; without its own, its category’s." } } },
"categories": {
  "relations": { "parent": { "to": "categories" }, "store": { "to": "stores" } },
  "inherit": { "tax_rate": { "own": "tax_rate_own", "from": ["parent", "store"], "default": true } } }
```

- `own` names the own field. Both fields MUST be top-level and of one of the scalar types of [4.2](https://restep.wubytes.com/1/#discovery), and cannot be `id`, a relationship or a language map: in those, `null` or the merge patch already mean something else ([3](https://restep.wubytes.com/1/#data), [5.1](https://restep.wubytes.com/1/#resources)).
- `from` lists, in order, the relationships **this step** inherits from. Each MUST be to-one and declared in `relations` ([8](https://restep.wubytes.com/1/#relations)), even if the server does not announce that profile, and its target collection MUST have a field with the same name as the effective one. If that field is also declared in its `inherit`, the chain continues: so a category inherits from its parent category to whatever depth is needed, without dotted paths.
- `"default": true` says there is a default at the end of the chain and the effective value is never empty. The value is not published: changing it is a change of data, not of discovery.
- `description` explains the field as in [4.3](https://restep.wubytes.com/1/#describing).

**Resolution.** The effective value MUST be the own value, if it is not `null`; otherwise the effective value of the item linked by the first relationship in `from` that has a link; otherwise the default; and with no default, the field has no value ([3](https://restep.wubytes.com/1/#data)). A link that would create a cycle (a category that ends up as its own ancestor) MUST give `422 invalid`.

**Reading.**

- When the representation carries the effective field, it MUST carry it resolved and with its usual type. The own field carries its value or `null`.
- The item MAY explain the origin in `_inherited`: an object whose keys are the effective fields present in the representation that do not come from the own field. If it carries it, it MUST name them all, so an effective field not in `_inherited` has its own value. With `fields` ([6.3](https://restep.wubytes.com/1/#fields)), `_inherited` only covers the fields in the response. Each value is one of these:
   - `{"from": {"href": "/categories/2"}}`: the absolute path ([3](https://restep.wubytes.com/1/#data)) of the value’s **actual source**, not of the immediate parent. In the example, category 4 has no own value and category 2 does.
   - `{"from": "default"}`: it comes from the default.
   - `{"from": "hidden"}`: it is inherited, but the client cannot see the source. The server MUST NOT give the path of an item the client cannot see, just as a relationship is left with only `id` ([8](https://restep.wubytes.com/1/#relations)), nor of one whose existence it does not reveal ([5.4](https://restep.wubytes.com/1/#errors)).

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
{ "type": "https://restep.wubytes.com/1/errors#invalid", "title": "Invalid data", "status": 422, "code": "invalid",
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
- with `sync`, its collection’s `state` changes and `:changes` lists them ([9](https://restep.wubytes.com/1/#sync));
- with a shared cache, the write to the source SHOULD also invalidate the groups of those items and of the collections that can contain them ([7.3](https://restep.wubytes.com/1/#caching)).

This forces the server to store the effective values or to propagate each change to every descendant. It is the main cost of declaring `inherit`.

**Filters and sorting.** With `query`, filtering and sorting by the effective field compare the value the client sees: `filter[tax_rate][eq]=10` gives those worth 10, inherited or not. Those that inherit are asked for with `filter[tax_rate_own][null]=true`, with no new operators, if that filter is declared ([6.1](https://restep.wubytes.com/1/#filters)).

**Evolution.** Adding inheritance to a new value, or to a field that was already read-only, is compatible: the own field and the declaration are added. Turning into an effective field one that could be written until now is not, because it would reject writes that used to be accepted ([5.5](https://restep.wubytes.com/1/#versions)): it takes a major version, or retiring the field and adding the pair under other names.

## 6. query (Profile)

Profile URI: `https://restep.wubytes.com/1/query`. It applies to collections; `fields` also applies to items. None of its parameters needs a parser: any HTTP framework reads them.

### 6.1 Filters

```
GET /books?filter[category]=novela-negra&filter[price][le]=20
```

- The discovery document MUST declare in `filter` which fields can be filtered, with their type and operators. Fields of a relationship use a dotted path (`author.id`).
- `filter[field]=value` is the same filter as `filter[field][eq]=value`. Filters on the same field with different operators are different filters (`filter[price][ge]=10&filter[price][le]=20`). Several filters MUST be combined with AND; for OR, NOT and parentheses there is the [`filter-expr`](https://restep.wubytes.com/1/#filter-expr) extension.
- Operators: `eq`, `ne`, `lt`, `le`, `gt`, `ge`, `in` and `null`.
- `in` takes values separated by commas; its values cannot contain commas (use `eq`, `filter-expr` or `query-method` for those). `null` takes `true` (no value: absent or `null`) or `false`.
- The server MUST compare by the declared type: numerically for `integer`, `number` and `decimal` (decimals exactly, without going through floating point), chronologically for `date` and `datetime` (as instants), by length for `duration` (a day counts as 24 hours; a filter value with years or months MUST give `invalid_parameter`, because they have no fixed length), and by Unicode code points for `string` and `enum`, case-sensitively and without language rules. A `boolean` field may declare only `eq`, `ne` and `null`. `null` may be declared on a field of any type and tests whether the value is absent or `null`.
- A translation is filtered as `field.tag`, with a language map of the collection and a lowercase key: `filter[name.es-mx]=Calabacita`. Discovery declares each one on its own, of type `string`: `"name.es-mx": {"type": "string", "ops": ["eq", "in"]}`. It reads only that exact key, with no [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647) matching and no fallback: if the item lacks the key, the field is absent. The language map itself and any other path that ends in or goes through one (`author.name`, `author.name.es`) MUST NOT be declared in `filter` or `sort`, and a language map MUST NOT share its name with a relationship of its collection, so `name.es-mx` is never a relationship path.
- Every operator except `null` MUST NOT match items where the field is absent or `null`.
- A `null` operand other than `true` or `false`, an operand of any other operator that does not match the field’s type (for `in`, each element), an empty `in` list, or the same filter (same field and operator, in either form) twice MUST give `invalid_parameter`. An undeclared field or operator, `unsupported_parameter` ([5.3](https://restep.wubytes.com/1/#reserved)).

### 6.2 Sorting

`sort=-rating,title`: comma-separated fields, with a leading `-` for descending order. Sortable fields are declared in `sort`; any other MUST give `unsupported_parameter`. The server MUST break ties in a stable way (for instance, by `id`). Items without a value for a sort key MUST go last, in both directions. A translation is sorted as its declared `field.tag` ([6.1](https://restep.wubytes.com/1/#filters)): `sort=name.es-mx`; strings sort by code points, without language rules.

### 6.3 Fields

With `fields=title,price` the response MUST carry only those fields, plus `id` and members starting with `_`. It also works on a single item’s `GET`, where, with `writes`, the item also carries `_etag` ([7.2](https://restep.wubytes.com/1/#concurrency)). A field that does not exist MUST give `invalid_parameter`. A language map is one field: `fields=name` returns it whole, and a path into it (`name.es`; with [`relations`](https://restep.wubytes.com/1/#relations), also `author.name.es`) MUST give `invalid_parameter`.

### 6.4 Pagination

- `limit` sets the page size, between 1 and the declared `max_limit`. Outside that range the server MUST give `invalid_parameter`, not clamp it silently.
- `next` MUST carry an opaque `cursor` parameter and keep the other parameters unchanged. Clients MUST NOT interpret or build cursors.
- A cursor is bound to the collection, the filters and the sort it was issued for; with `QUERY`, to the `filter` and `sort` members of the body ([10.4](https://restep.wubytes.com/1/#query-method)). A cursor the server did not issue (a tampered one), an expired one, or one used with another collection, other filters or another sort MUST give `invalid_parameter` with `parameter: "cursor"`. A cursor SHOULD also be bound to the principal ([2](https://restep.wubytes.com/1/#terms)) that received it. Signing it is the simplest way to tell a tampered one.
- A cursor MUST NOT be bound to `limit`, `fields`, `include` or `count`: they change what each page carries, not which items the traversal visits. Between pages, a client MAY add, change or remove them in the `next` URL of a `GET`, or in the body of a `QUERY`, and that MUST NOT invalidate the cursor.
- A server MAY start with an offset inside the cursor and later move to keyset pagination without clients noticing. The guarantee is the one in [5.2](https://restep.wubytes.com/1/#collections): no repeats and no gaps without concurrent writes.

### 6.5 Counts

Discovery declares `count` as `"exact"` or `"estimated"`. With `count=true`, the response MUST add `total` and, if the number is approximate, `"total_estimated": true`. `count=false` is the same as leaving it out. On a collection that does not declare `count`, `count=true` MUST give `unsupported_parameter`.

## 7. writes (Profile)

Profile URI: `https://restep.wubytes.com/1/writes`. Writes that can be retried safely, and reads that can be cached.

### 7.1 Retry without duplicating

```
POST /orders
Idempotency-Key: "8e03978e-40d5-43e8-bc93-6894a57f9324"
```

- Every non-idempotent `POST`, including actions declared `"idempotent": false`, MUST accept the `Idempotency-Key` header: a Structured Fields string ([**RFC 9651**](https://www.rfc-editor.org/rfc/rfc9651)), as in the IETF draft. A malformed key MUST give `400 bad_request`.
- A key belongs to one principal ([2](https://restep.wubytes.com/1/#terms)), not to a token, and one target (method and path): a retry with a renewed token still finds it. Two requests are **the same** when they share key, principal and target and their bodies are equal as JSON values (member order and whitespace do not count).
- The server MUST keep each key for at least 24 hours from the first request, and SHOULD declare how long in discovery (`"idempotency": {"ttl": 86400}`, in seconds). After that, the key counts as new.
- If the same request arrives again, the server MUST return the same status and body without repeating the effect, and SHOULD add `Idempotent-Replayed: true`. Headers such as `Date` may differ. A replay, and the `409 conflict` for the same request while the first one is still running, are decided after every check that [5.4](https://restep.wubytes.com/1/#errors) puts before `428`. Neither evaluates `If-Match`, `If-None-Match` or a `428` requirement: a replay returns the stored response even if they no longer hold. A different request under the same key evaluates them as usual, so `412` comes before `422 idempotency_mismatch`.
- If the server fails after the effect and before storing the response, a retry with the same key MUST NOT repeat the effect: the server records both atomically, or recovers as if it had.
- A request that was rejected before it ran (a `4xx` such as `422`, or a `5xx` that left no effect) MAY be left unstored; then it does not use up the key, and the client can fix it and retry with the same one. A request that had an effect MUST be stored.
- The same key with a different request MUST give `422 idempotency_mismatch`, also while the first one is still running; the same request while the first one is still running gives `409 conflict`. A resource that requires the key MUST give `400 idempotency_key_required` without it.
- A `core`-only server does not know the header and ignores it. Clients MUST NOT rely on `Idempotency-Key` unless the server announces `writes`.

### 7.2 Optimistic concurrency

- Each item has a strong **item ETag**: the `ETag` of its full representation, without `fields` or `include`. A `GET` of the full item without content coding MUST carry it, and servers MUST NOT use a weak validator (`W/`) for it. With a content coding (gzip), the `ETag` header MAY differ, as [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) requires, and the item then MUST carry the item ETag in `_etag`.
- A single item’s response with `fields` or `include` is another representation: its `ETag` header MUST change whenever anything in it changes, included items too, and the item MUST carry the item ETag in `_etag`, so the client can write without another read.
- Items inside a collection MAY carry that same value in `_etag`, so a client can write without reading each item first.
- `PATCH` and `DELETE` MUST evaluate `If-Match` against the item ETag as [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) says (lists, `*`, strong comparison): if it does not match, `412 precondition_failed`.
- Evaluating `If-Match` and applying the write MUST be atomic with respect to other writes to the same item.
- A resource MAY require `If-Match`; without it, it MUST answer `428 precondition_required`. Starting to require it is a breaking change ([5.5](https://restep.wubytes.com/1/#versions)).

### 7.3 Caching

- Every response to a `GET` or `HEAD`, errors included, MUST carry an explicit `Cache-Control`.
- A response that depends on credentials MUST be `private` or `no-store`.
- `If-None-Match` MUST be evaluated as [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) says (lists, `*`, weak comparison): when it matches, the server MUST answer `304` to `GET`, `HEAD` and `QUERY`, and `412` to writes without applying them. `304` to `QUERY` is a Restep rule: [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2) (section 13.1.2) names only `GET` and `HEAD`, while [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008) makes a `QUERY` select the same representation as the equivalent `GET` and answers a conditional one with `304` in its example.
- A successful response to a `GET` SHOULD carry `Cache-Groups` ([**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875)) naming every item it represents, included ones too, and, for a collection, the collection itself, so a cache can drop the lists an item enters or leaves. A `2xx` response to a `HEAD` SHOULD carry the groups the `GET` would. A successful response to a write that committed changes (for a batch, the outer response, covering every committed operation) SHOULD carry `Cache-Group-Invalidation` naming every item it changed and their collections, even without a body. Group names are opaque and per origin; the item’s path (`"/books/7"`) and the collection’s (`"/books"`) are the obvious choice. A cache may or may not honour them, and [**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875) only guarantees 32 groups per field, of 32 characters each, so a long page or a long id may not get every item invalidated. The collection’s own group SHOULD come first.

### 7.4 Minimal responses

With `Prefer: return=minimal` ([**RFC 7240**](https://www.rfc-editor.org/rfc/rfc7240)), writes MAY respond without a body: `201` with `Location` and `ETag`, or `204`, with `ETag` when the item still exists (not after a `DELETE`). When they do, they SHOULD carry `Preference-Applied: return=minimal`. By default they return the representation.

## 8. relations (Profile)

Profile URI: `https://restep.wubytes.com/1/relations`. The shape of relationships is set in [section 3](https://restep.wubytes.com/1/#data), and how they are written in [5.1](https://restep.wubytes.com/1/#resources), so any server follows them; this profile adds declarations and expansion.

- Discovery MUST declare each relationship in `relations`, with its target collection in `to` (a list, when it can point to several: see [section 3](https://restep.wubytes.com/1/#data)), `"many": true` if it is to-many, and `"include": true` if it can be expanded.
- `include=author` MUST fill that object with the full item. Dotted paths (`include=author.publisher`) are allowed up to the declared `include_depth` (1 if not declared). A relationship that is not declared or not expandable, or a path deeper than `include_depth`, MUST give `unsupported_parameter`.
- If the client cannot see the related item, the object MUST stay with only `id` (and `type`).
- When the server also implements `query`, `fields` accepts dotted paths (`fields=title,author.name`); a dotted path whose relationship is not in `include` MUST give `invalid_parameter`.
- Relationships with many items (a book’s reviews) SHOULD be **subcollections**, such as `/books/7/reviews`, declared with a `path` template and following `core` and, if announced, `query`. A to-many list embedded in a representation MUST NOT be paginated: if it can grow without bound, it SHOULD be a subcollection.
- To filter by a relationship, discovery declares the dotted path in `filter`: `filter[author.id]=3`.

```
GET /books/7
{ "id": "7", "title": "La niebla de Portugalete", "author": { "id": "3" } }

GET /books/7?include=author&fields=title,author.name
{ "id": "7", "title": "La niebla de Portugalete", "author": { "id": "3", "name": "Inés Arriaga" } }

PATCH /books/7                changes the link, not the author
{ "author": { "id": "4" } }
```

## 9. sync (Profile)

Profile URI: `https://restep.wubytes.com/1/sync`. Keep a local copy of whole collections up to date without downloading everything again. It requires `query`: every synced collection MUST declare `id` in `filter` with `in`.

- Collection responses MUST carry `state`: an opaque string that changes whenever anything the client can see in the collection changes. It reflects that client’s view: an item it stops being allowed to see counts as destroyed.
- Every page of a traversal MUST carry the `state` of its first page, the request without `cursor` (the server can keep it in the cursor). A client MUST use it as `since` for its next sync: changes made during the traversal show up there.
- A traversal MUST NOT miss items: every item that existed when the first page was served, and does not appear in `:changes` since that `state`, appears in some page. Offset cursors do not guarantee this; keyset cursors or a snapshot do.
- `GET /books:changes?since=<state>` returns the identifiers created, updated and destroyed since that state. The response MUST carry `since`, `state`, `has_more`, `created`, `updated` and `destroyed`. Each identifier MUST appear in at most one list, picked by what the client could see between `since` and the returned `state` (an item that does not exist cannot be seen). These rules cover the items that changed, or whose visibility to the client changed, in that window:
   - an item it could see at `since` and cannot see at `state` MUST be in `destroyed`;
   - an item it can see at `state` MUST be in `updated` if it could see it at `since` and it changed or stopped being visible in between, and in `created` if it could not see it at `since`;
   - an item it cannot see at either end MUST be in `destroyed` if it could see it in between, and MUST NOT appear otherwise.
- An item it could see at both ends that did not change MAY be in `updated`. If the server cannot reconstruct what the client could see in the window, it MUST answer `410 state_expired`; whether it can MUST NOT depend on the existence of an item concealed from the client ([5.4](https://restep.wubytes.com/1/#errors)). Clients treat `created` and `updated` alike, fetching the item and replacing their copy, and ignore an `id` in `destroyed` that they do not have.
- If `has_more` is `true`, the returned `state` is intermediate: the client MUST call again with it until `has_more` is `false` before treating its copy as current.
- `:changes` covers the whole collection: filters and the other `query` parameters MUST give `unsupported_parameter` there, and a missing `since` MUST give `invalid_parameter`. Keeping a filtered view in sync is outside this version.
- The client fetches the changed items with `GET /books?filter[id][in]=7,12`.
- The server SHOULD keep changes for at least 7 days and SHOULD declare how long in the collection’s `sync.retention` (seconds). If it can no longer compute the changes, it MUST answer `410 state_expired`, and the client reloads the collection.
- The action name `changes` is reserved for this profile.
- The server MAY offer notifications over Server-Sent Events at the path declared in `events`; that response MUST carry `Cache-Control: no-store`. Each event says which collections have a new state; the data itself is fetched with `:changes`.
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

## 10. Extensions

Each extension is announced in `extensions` and in the `Link` header, and has its own profile URI (`https://restep.wubytes.com/1/batch`…). What each one requires is in [1.2](https://restep.wubytes.com/1/#dependencies).

### 10.1 actions (Extension)

Operations that are not create, read, update or delete, following [**AIP-136**](https://google.aip.dev/136): the action name goes after a colon.

```
POST /orders/2001:cancel       on an item
POST /books:import             on the collection
GET  /orders/2001:preview      a safe action declared with "method": "GET"
```

- Each action MUST be declared in its collection’s `actions`, with `on` (`"item"` or `"collection"`), `safe` and `idempotent`. Action names are `snake_case`; `changes` is reserved for `sync`.
- An action uses `POST` unless its declaration says `"method": "GET"`, which only safe actions MAY do. Servers MUST also accept the colon encoded as `%3A`.
- The declaration MAY carry a `description` and, if the action uses `POST`, an `input` schema ([4.3](https://restep.wubytes.com/1/#describing)). A `GET` action has no body, so it MUST NOT declare `input`.
- The response MUST be the affected resource’s representation (`200`), a new one (`201` with `Location`) or nothing (`204`).
- A representation MAY list in `_actions` the actions available in its current state, so clients do not duplicate business rules:

```
{ "id": "2001", "status": "paid",
  "_actions": { "cancel": { "method": "POST", "href": "/orders/2001:cancel" } } }
```

### 10.2 batch (Extension)

Several operations in one request, in order, with references to the results of earlier ones. They are sent to the path declared in `batch.path`.

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

- Each operation MUST have an `id`, unique in the batch, a `method`, a `path` and, optionally, `headers` (such as `If-Match`, `Idempotency-Key` or `Prefer`, with lowercase names) and `body`. Each operation MUST follow the same rules as if it were sent alone.
- A reference is `<id>#<JSON Pointer>` into the response body of an earlier operation: in braces inside `path`, where the value MUST be inserted percent-encoded as a path segment ([**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986)), or as `{"$ref": …}` in place of a body value. An object whose only member is `$ref` is always a reference.
- A body that is not a valid batch, a repeated operation `id`, a reference to an operation that does not come earlier, or a nested batch MUST give `400 bad_request` before any operation runs. [5.4](https://restep.wubytes.com/1/#errors) applies to the batch request as a whole before any operation runs; once the batch is accepted, it applies to each operation on its own, subject to the `424 not_executed` rules below. More operations than `max_operations` give `413 content_too_large`, which the server MAY give without validating the operations ([5.4](https://restep.wubytes.com/1/#errors)).
- A batch that passes these checks, the atomic check below and those of any request (credentials, content type, rate limits, [7.1](https://restep.wubytes.com/1/#idempotency)) MUST get `200` with one result per operation, in order, each with its own `status`, `headers` and `body`; an error result is a problem object. This is the only exception to “no error inside a `200`” ([5.4](https://restep.wubytes.com/1/#errors)).
- With `"atomic": true`, either all operations take effect or none does. If one fails, it carries its error and every other operation MUST get `424 not_executed`, including those that ran and were rolled back. A server that cannot roll back one of the operations (an external payment, an email) MUST reject the atomic batch with `422 invalid` before running it.
- Without `atomic`, each operation applies on its own; an operation whose reference cannot be resolved, because the referenced one failed or the pointer finds nothing, MUST get `424 not_executed`.
- The batch itself MAY carry `Idempotency-Key`; then the whole batch follows [7.1](https://restep.wubytes.com/1/#idempotency).
- An exception to “the same rules as if sent alone”: the texts of each new result ([5.6](https://restep.wubytes.com/1/#language)) follow the batch’s `Accept-Language`, and an operation’s own is ignored; a replayed result (7.1) keeps its own. `Content-Language` and `Accept-Language` in `Vary` go on the batch response, not in each result’s `headers`: `Vary` includes `Accept-Language` only if some new result can vary by language, and `Content-Language` is left out unless every result with language-picked texts shares one.

### 10.3 filter-expr (Extension)

A filter as an expression, in the spirit of [**AIP-160**](https://google.aip.dev/160):

```
GET /books?filter=price <= 20 AND (category = "novela-negra" OR rating >= 4.5)
```

- Comparators `=`, `!=`, `<`, `<=`, `>` and `>=`, which map to `eq`, `ne`, `lt`, `le`, `gt` and `ge`; `AND`, `OR`, `NOT` and parentheses. Fields by name or dotted path; a path segment may contain `-` (`name.es-mx`). Values: strings in double quotes (with `\"` and `\\` as the only escapes), numbers, `true`, `false` and `null`. `field = null` and `field != null` map to the `null` operator.
- `NOT` binds tightest. `AND` and `OR` MUST NOT be mixed at the same level without parentheses: `a AND b OR c` MUST give `invalid_parameter`. [**AIP-160**](https://google.aip.dev/160) gives `OR` precedence over `AND`, most languages do the opposite; Restep asks for parentheses so nobody guesses. Juxtaposition (`a b`, [**AIP-160**](https://google.aip.dev/160)’s implicit AND) MUST give `invalid_parameter` too.
- A field or operator not declared in `filter` MUST give `unsupported_parameter`. Comparisons follow [6.1](https://restep.wubytes.com/1/#filters), absent and `null` values included; a number compared with a `decimal` field is read as an exact decimal.
- It cannot be combined with `filter[…]` in the same request: that MUST give `invalid_parameter`.

### 10.4 query-method (Extension)

For queries that do not fit in a URL, the `QUERY` method ([**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008)): safe, idempotent and cacheable, with the `query` parameters in the body.

```
QUERY /books
Content-Type: application/json

{ "filter": { "price": { "le": "20" }, "category": { "in": ["novela-negra", "poesia"] } },
  "sort": ["-rating"], "fields": ["title", "price"], "limit": 10, "count": true }
```

- Collections that accept it MUST announce it with `Accept-Query: application/json` ([**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008)) in their responses to `GET` and `HEAD`.
- The body is a JSON object with the same members as the reserved parameters: `filter` as an object of fields and operators (or, with `filter-expr`, a string), `sort`, `fields` and `include` as lists, `limit` as a number and `count` as a boolean. Values use their JSON type, and `in` takes a list, so its values can contain commas. An unknown member MUST give `unsupported_parameter`.
- A `QUERY` MUST return the same as the equivalent `GET`, with the same errors; a matching `If-None-Match` gives `304`, as for `GET` ([7.3](https://restep.wubytes.com/1/#caching)). The URL MUST NOT carry reserved parameters other than `cursor`.
- In the response, `next` carries only `cursor`, which here overrides the rule of [6.4](https://restep.wubytes.com/1/#pagination) that keeps the other parameters. For the next page, the client MUST send a body with the same `filter` and `sort` to the `next` URL, and MAY change `limit`, `fields`, `include` and `count` ([6.4](https://restep.wubytes.com/1/#pagination)); the server MUST answer a `filter` or `sort` that is not equal as a JSON value (member order and whitespace do not count; an absent member, `{}` and `[]` are the same) with `invalid_parameter` on `cursor`.
- Caches that store `QUERY` responses use the body as part of the key; many CDNs do not do that yet.

### 10.5 oauth (Extension)

How a client finds out where to get a token for the API. It defines neither authentication nor authorization: it ties the OAuth 2.0 Protected Resource Metadata ([**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728)) to the API root. A server that does not announce it authenticates as it sees fit.

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
- A server that allows cross-origin requests SHOULD list `WWW-Authenticate` in `Access-Control-Expose-Headers` (and `DPoP-Nonce`, if it uses DPoP nonces), or a browser client cannot read them, and SHOULD serve the metadata with `Access-Control-Allow-Origin`. `EventSource` cannot send `Authorization`, so a browser client reads the event stream of [9](https://restep.wubytes.com/1/#sync) with `fetch`; the server SHOULD NOT accept tokens in the query string ([**RFC 6750**](https://www.rfc-editor.org/rfc/rfc6750#section-2.3), section 2.3).

## 11. Conformance

A server conforms to a profile when it meets every requirement on servers marked MUST or MUST NOT in sections 3, 4 and 5 and in that profile’s section, and announces the profiles it requires. The same holds for each extension. These are the checks a conformance checker runs. [`restep-check`](https://restep.wubytes.com/tools/) already runs those of core, evolution (the `Deprecation` and retirement of what discovery lists, and the `predecessor-version` link; not the comparison of two deployments), query, writes and oauth (for oauth, without credentials on the root and on each collection, and except the `insufficient_scope` challenge, which needs a token without some scope), and the full list of its checks is on its page; relations and sync come in a later version.

### core

- Every collection responds with `{items, next}`, with `next` present.
- Without concurrent writes, following `next` until `null` returns every item exactly once.
- An item that does not exist gives `404` as `problem+json` with `code: "not_found"`.
- Every unimplemented reserved parameter gives `400 unsupported_parameter`, on every method, unless an error that comes first in 5.4 applies: with valid credentials and no other fault, a missing item with an unsupported parameter gives `404 not_found`.
- An unsupported method gives `405` with `Allow`; `HEAD` works wherever `GET` does. Where discovery declares `methods` or `item_methods`, that `Allow` agrees with them.
- Where discovery declares `status`, `GET` and `HEAD` on it give `200` or `503` with `Cache-Control: no-store`, or else `401`, `403` or `429`.
- Every `invalid_parameter` and `unsupported_parameter` names its parameter in `parameter`.
- Where discovery declares a `create` schema, a `POST` that leaves out a property it requires gives `422`; where it declares a closed `update` schema, so does a `PATCH` with a member the schema does not allow, even a `null` one, once the members 5.1 ignores are dropped.
- Every error carries `type`, `title`, a `status` equal to the response’s, and a `code` from the list or derived from the IANA registry.
- If discovery declares `reasons`, every problem with a `reason`, also in `batch` results, carries a declared one with its `code`.
- A `PATCH` with `{"author": {"id": "4", "extra": 1}}` changes the link, does not store `extra` and leaves both authors untouched, unless a declared `update` schema rejects it.
- Merge Patch follows [**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396) (an array or scalar replaced by an object loses its old content), except that relationship objects are replaced whole (5.1) and language maps left with no translations read as `{}` (3) and that deleting or changing an own field of `inherit` also changes its effective field (5.7), and a write that changes `id` gives `422`.
- A `PATCH` with an item’s read-only fields as read changes neither its body nor its `ETag`, if any; another value in `id`, or in a top-level property the client can read that its `item` schema marks `readOnly` directly in `properties`, gives `422 invalid` with a `read_only` entry at its pointer, changing nothing.
- If discovery declares `inherit` on a collection where `PATCH` is supported: sending back with `PATCH` only an item’s effective fields as read, without its own fields, changes neither its body nor its `ETag`; `{"tax_rate_own": null}` leaves the effective value equal to its source’s and, if there is `_inherited`, it names it; and a different value in the effective field gives `422 invalid` with a `read_only` entry at `/tax_rate`, changing nothing.
- An error requested with an `Accept-Language` the server does not offer, or a malformed one, gives the same `code` as without the header, never `406` or `400` because of it. Where the body of the discovery document or of an error changes between two `Accept-Language` values, both responses, the default language’s included, carry `Vary: Accept-Language` and, if they carry an `ETag`, different ones.
- With `Accept-Encoding: identity`, the `GET` of an item gives the same body under any `Accept-Language` (and, with `writes`, the same `ETag`).
- In an item, every field of `language_maps` is an object of strings with lowercase keys. Where `PATCH` is supported: an uppercase key gives `422 invalid` with a `format` entry at `/name/ES`; deleting an existing translation with `null` keeps the others, and putting it back restores it; `{"name": null}` leaves `{}`.

### Evolution

- Whatever discovery lists in `deprecations` carries `Deprecation` in the responses that use it; after its `sunset` it responds as [5.5](https://restep.wubytes.com/1/#versions) says.
- Comparing the discovery documents of two deployments of the same version, nothing declared disappears unless it was listed in `deprecations` and its `sunset` has passed.

### query

- Each declared filter returns only items that match it, comparing by the declared type (decimals exactly).
- An undeclared filter field, operator or sort key gives `unsupported_parameter`; a value of the wrong type, `invalid_parameter`.
- `sort` orders and breaks ties stably across pages.
- `limit` above `max_limit` gives `invalid_parameter`; so does a tampered cursor, or one reused with other filters, another sort or another collection; changing `limit`, `fields`, `include` or `count` between pages keeps it valid.
- No field of `language_maps`, nor any path that ends in or goes through one, is declared in `filter` or `sort`; a declared `field.tag` filter or sort reads only that key, and items without it are absent.
- `fields` returns only those fields, plus `id` and members starting with `_`.
- `count=true` adds `total` when `count` is declared, and gives `unsupported_parameter` when it is not.

### writes

- Repeating a `POST` with the same `Idempotency-Key` after the first one has finished returns the same response and creates nothing new.
- The same key with another body gives `422 idempotency_mismatch`.
- The `ETag` of a full item, asked for with `Accept-Encoding: identity`, is strong, and a response with `fields` carries it in `_etag`; a write ignores `_` members.
- `If-Match` with an old `ETag` gives `412`, also when two writes race; a list that contains the current one succeeds. `If-None-Match` with the current one, weak or strong, gives `304` to a `GET` and `412` to a write.
- Every response to a `GET` or `HEAD`, errors included, carries `Cache-Control`.

### oauth

- The metadata is at the URL [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728) forms from the root, as JSON, without requiring credentials, with `resource` equal to the root and at least one authorization server.
- The metadata does not give `401` (and, as a recommendation, carries `Cache-Control: public`).
- If the root requires credentials, its `401` carries that absolute URL in `resource_metadata`; no `401` elsewhere points there.
- A token without the scope a request needs gets, unless the resource’s existence is concealed, `403` with `code: "forbidden"` and `error="insufficient_scope"` in the challenge.

### relations and sync

- Relationships are objects with an `id`, also without `include`, and every relationship is declared.
- `include` on a declared, expandable relationship fills the object; on any other, `unsupported_parameter`.
- `:changes` reports, in the lists [9](https://restep.wubytes.com/1/#sync) calls for, the creation, update and deletion of an item since the previous `state`, and every page of a traversal carries the same `state`; deleting an item mid-traversal does not make the traversal miss another one.

## 12. Open questions

- Should caching ([7.3](https://restep.wubytes.com/1/#caching)) be a profile of its own, so a server can offer it without building the idempotency store of 7.1?
- Long-running operations: `202 Accepted` and an operation resource (as in [**AIP-151**](https://google.aip.dev/151)), so each API does not invent its own.
- Date-based versioning in a header (as Stripe does) as an alternative to the version in the path.
- Should the profile and error URIs move to a persistent identifier (such as w3id.org) before 1.0, when they can still change?
- Keeping filtered views in sync (as JMAP’s `queryChanges`).
- Things that can come later as additions, without breaking anyone: named views (`$view`), a `prev` link for backward paging, batch results streamed as they finish, and reusing a `QUERY` through the `Location` [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008) already defines.
- Signed messages ([**RFC 9421**](https://www.rfc-editor.org/rfc/rfc9421), with `Content-Digest` from [**RFC 9530**](https://www.rfc-editor.org/rfc/rfc9530) and keys published as JWKS, [**RFC 7517**](https://www.rfc-editor.org/rfc/rfc7517)) for integrity between companies through intermediaries. Restep 1 has no case that needs them: TLS covers the client and the server, and the events of [9](https://restep.wubytes.com/1/#sync) carry no data. A signature that expires would also give `401` to a retry before it reaches the idempotency store of [7.1](https://restep.wubytes.com/1/#idempotency).
- An `openapi` extension: what an OpenAPI description of a Restep API must say (a description per operation, request bodies, errors as `problem+json`) and how a checker would hold it to the discovery document, which would still prevail.
- Marking actions whose effects cannot be undone or reach outside the API (a payment, an email), so a client can ask a person first, as MCP’s `destructiveHint` and `x-openai-isConsequential` do. A single flag does not tell “deletes data” from “charges someone”.
- A projection by language (`languages`, already reserved) so clients need not receive whole language maps.
- Sorting with language rules (CLDR collation): today `sort=name.es-es` puts “Ñora” after “Zanahoria”.
- Text direction (`dir`, from the W3C’s [Strings on the Web](https://www.w3.org/TR/string-meta/)), which a language tag is not enough to infer. It would go in each field’s object in `language_maps`, never changing the type of the values.
- Declaring in advance which operations require `Idempotency-Key` ([7.1](https://restep.wubytes.com/1/#idempotency)) or `If-Match` ([7.2](https://restep.wubytes.com/1/#concurrency)), instead of learning it from a `400` or a `428`.
- Inheriting values that are not scalars ([5.7](https://restep.wubytes.com/1/#inheritance)): a language map translation by translation, or an object field by field.
- Local times in a time zone ([**RFC 9557**](https://www.rfc-editor.org/rfc/rfc9557), `2026-03-30T10:00:00+02:00[Europe/Madrid]`), declared like `language_maps`. [**RFC 9557**](https://www.rfc-editor.org/rfc/rfc9557) describes fixed instants with zone information; a future local time whose instant follows changes to its zone’s rules is left to the application, and Restep would have to say which of the two such a field is.
- Soft deletion: what a `GET` on a deleted item answers, how the trash is seen, restoring with the same `id`, and purging. Under [9](https://restep.wubytes.com/1/#sync), an item that becomes visible again appears as `created` or `updated`, depending on the window.
- Units of measure: a fixed unit per field, declared in discovery with [UCUM](https://ucum.org/) codes without changing the value’s type, unlike a unit that varies per item, which goes with its value as an amount goes with its currency ([3](https://restep.wubytes.com/1/#data)).
- Manual order: moving an item among others without rewriting all of them (fractional keys sorted by code point, or a `:move` action with `before` and `after`).
- Values as of a date (`$as_of`): separating when a value applies from when it was recorded, and what it does to validators, `state` and cursors.

Settled in draft 5: a link to the documentation for people (`service-doc`, [4.2](https://restep.wubytes.com/1/#discovery)); and a catalogue of domain reasons in discovery ([5.4](https://restep.wubytes.com/1/#errors)), at the root only, in which a reason has one `code` and, once declared, stays until the next major version; that a read-only field sent back with its current value is ignored, and a `PATCH` that would change no data leaves the item as it was, `updated_at` and `ETag` included ([5.1](https://restep.wubytes.com/1/#resources)); and that in `:changes` an item’s visibility picks its list, so one created and destroyed within the window is reported in `destroyed` if the client could see it ([9](https://restep.wubytes.com/1/#sync)).

Settled in draft 4: how a client discovers authorization, with the [`oauth`](https://restep.wubytes.com/1/#oauth) extension, without new error codes or scopes in discovery; that an idempotency key and a cursor belong to the principal, not to the token ([7.1](https://restep.wubytes.com/1/#idempotency), [6.4](https://restep.wubytes.com/1/#pagination)); that `api-catalog` is optional ([4.2](https://restep.wubytes.com/1/#discovery)); what helps agents and other generic clients use an API without trying it, as optional members of discovery ([4.3](https://restep.wubytes.com/1/#describing)): the methods of each collection, short descriptions, and JSON Schemas for items and request bodies; `parameter` on every `invalid_parameter` ([5.3](https://restep.wubytes.com/1/#reserved)) and `detail` as a recommendation ([5.4](https://restep.wubytes.com/1/#errors)); several `service-desc` links ([4.2](https://restep.wubytes.com/1/#discovery)); the method of an action, declared ([10.1](https://restep.wubytes.com/1/#actions)), so a `GET` action of an earlier draft now says `"method": "GET"`; how to find the service status, without a fixed path ([4.4](https://restep.wubytes.com/1/#health)); and languages: the API’s texts follow `Accept-Language` ([5.6](https://restep.wubytes.com/1/#language)), data never does, and translated text goes in language maps with lowercase tags, which can be filtered and sorted by exact tag ([3](https://restep.wubytes.com/1/#data), [6.1](https://restep.wubytes.com/1/#filters)); and inherited values, with a read-only effective field and an own field that is written, so that sending back what was read never pins an inherited value ([5.7](https://restep.wubytes.com/1/#inheritance)).

Settled in draft 3: the order between errors ([5.4](https://restep.wubytes.com/1/#errors)); an item’s path ([5.1](https://restep.wubytes.com/1/#resources)); what a cursor is bound to ([6.4](https://restep.wubytes.com/1/#pagination)); filters repeated in either form, ranges as two filters on one field, and `null` on booleans ([6.1](https://restep.wubytes.com/1/#filters)); invalidation with cache groups ([7.3](https://restep.wubytes.com/1/#caching)); and how a client resumes the event stream ([9](https://restep.wubytes.com/1/#sync)).

Settled in draft 2: `filter[field][op]` is enough for `query`, and expressions stay in `filter-expr`; no dedicated media type, since `application/json`, `application/problem+json` and the profile URIs are enough; discovery declares field types only where Restep needs them ([4.2](https://restep.wubytes.com/1/#discovery)); and there is no per-field cache policy in Restep 1, because each combination of `fields` is already its own URL for a cache.

## 13. References

- [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110): HTTP semantics (methods, `ETag`, `If-Match`, `If-None-Match`).
- [**RFC 9457**](https://www.rfc-editor.org/rfc/rfc9457): Problem Details for HTTP APIs.
- [**RFC 5646**](https://www.rfc-editor.org/rfc/rfc5646): language tags. [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647): matching of language tags (*lookup*).
- [**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396): JSON Merge Patch. [**RFC 5789**](https://www.rfc-editor.org/rfc/rfc5789): `PATCH` and `Accept-Patch`.
- [**RFC 6901**](https://www.rfc-editor.org/rfc/rfc6901): JSON Pointer. [**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259): JSON.
- IETF draft for [the Health Check Response Format](https://datatracker.ietf.org/doc/draft-inadarei-api-health-check/): `application/health+json` ([4.4](https://restep.wubytes.com/1/#health)).
- [**JSON Schema 2020-12**](https://json-schema.org/draft/2020-12): the schemas of [4.3](https://restep.wubytes.com/1/#describing).
- [**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986): URIs. [**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570): URI templates.
- [**RFC 6906**](https://www.rfc-editor.org/rfc/rfc6906): the `profile` link relation. [**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631): `service-desc`, `service-doc` and `status`. [**RFC 8288**](https://www.rfc-editor.org/rfc/rfc8288): web linking (`Link`, `anchor`, `hreflang`).
- [**RFC 7240**](https://www.rfc-editor.org/rfc/rfc7240): `Prefer` and `Preference-Applied`.
- [**RFC 6585**](https://www.rfc-editor.org/rfc/rfc6585): `428` and `429`. [**RFC 4918**](https://www.rfc-editor.org/rfc/rfc4918): `424`.
- [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339): dates and times.
- [**RFC 9651**](https://www.rfc-editor.org/rfc/rfc9651): Structured Field Values for HTTP.
- [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008): the `QUERY` method.
- [**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875): HTTP Cache Groups.
- [**RFC 8620**](https://www.rfc-editor.org/rfc/rfc8620): JMAP, changes and back-references between operations.
- [**RFC 9745**](https://www.rfc-editor.org/rfc/rfc9745) and [**RFC 8594**](https://www.rfc-editor.org/rfc/rfc8594): `Deprecation` and `Sunset`.
- [**RFC 5829**](https://www.rfc-editor.org/rfc/rfc5829): the `successor-version` and `predecessor-version` relations.
- [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728): OAuth 2.0 Protected Resource Metadata. [**RFC 8414**](https://www.rfc-editor.org/rfc/rfc8414) and [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html): authorization server metadata.
- [**RFC 6750**](https://www.rfc-editor.org/rfc/rfc6750): Bearer tokens and their challenges. [**RFC 9449**](https://www.rfc-editor.org/rfc/rfc9449): DPoP. [**RFC 8707**](https://www.rfc-editor.org/rfc/rfc8707): resource indicators. [**RFC 9700**](https://www.rfc-editor.org/rfc/rfc9700): OAuth 2.0 security best current practice.
- [**RFC 9727**](https://www.rfc-editor.org/rfc/rfc9727): `api-catalog`.
- [**RFC 2119**](https://www.rfc-editor.org/rfc/rfc2119) and [**RFC 8174**](https://www.rfc-editor.org/rfc/rfc8174): requirement key words.
- IETF draft for [the `Idempotency-Key` header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) (revision 08).
- Google’s [**AIP-136**](https://google.aip.dev/136), [**AIP-158**](https://google.aip.dev/158) and [**AIP-160**](https://google.aip.dev/160).
- [JSON:API 1.1](https://jsonapi.org/format/).
- [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html).
