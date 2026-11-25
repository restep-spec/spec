// Restep 1 · Reference implementation of the core, query, writes, cache and relations profiles and the
// actions and inherit extensions (and oauth, see below). Node 18 or later, no dependencies.
// Usage:  node restep-server.mjs  →  http://localhost:8080/
// Specification: https://restep.wubytes.com/1/  (draft 7, so discovery declares "restep": "1.0-draft.7")
// With RESTEP_TOKEN=secret it also implements the oauth extension (11.5): every request needs
// Authorization: Bearer secret, and the metadata is at /.well-known/oauth-protected-resource.
// The token stands in for one from an authorization server; it does not issue or validate real ones.
// RFC 9728 requires https: behind a local http URL this only simulates the extension.
// It does not implement sync or the batch, filter-expr and query-method extensions: those parameters and
// paths fail loudly (QUERY gets 405).
// What it shows:
// - subcollections (4.2): each book's reviews at /books/{book_id}/reviews, gone with their book, and
//   its drafts at /books/{book_id}/drafts, whose one draft, current, is created and edited with PATCH
//   (upsert and reusable_ids, 5.1; Appendix D);
// - relations (9): books link their author (to-one), related books (to-many), a highlighted review
//   (an item of the subcollection, so with href) and a cover (a file, limited to JPEG and PNG); a
//   category's showcase points to a book or a product (with type); include expands them, two levels deep
//   from products (include_depth); fields takes dotted paths (author.name), and books filter by author.id
//   and author.name, by their reviews through the to-many reviews (quantifier some: reviews.rating,
//   reviews.reader.id, and null on reviews, without quantifier, negates the group, 6.1) and sort by reviews.rating (6.2);
// - operators nin, prefix and contains on book titles (6.1);
// - uploads (5.1): /files takes the bytes of an image, raw or as multipart/form-data, and gives each file
//   _content; the bytes are at /files/{id}/content, outside Restep (5.9); it declares no create schema, so it
//   creates nothing from JSON, and a JSON body gets 415 with Accept-Post;
// - client ids that come back (5.1): a reader's subscriptions to authors, /readers/{reader_id}/subscriptions,
//   keyed by the author's id (reusable_ids); a new incarnation has a new ETag, and PATCH and DELETE
//   there require If-Match (428 precondition_required, with no-store, 5.4);
// - a collection without GET (4.3): /payments takes POST only, with effects (charges);
// - orders (/orders): a default named filter, active, that leaves archived orders out unless
//   filter[active]=false turns it off (6.1, 5.2); a default in the create schema (quantity, 4.3); the new
//   action (11.1) with the starting values and an effective schema; cancel and collect with effects;
//   method effects (4.3);
// - localized fields (3, 5.6): /genres carry name, the text of name_i18n in the language of the response
//   (default_language en), filtered and sorted in that language, with Vary, Content-Language, an ETag per
//   language, If-Match that succeeds with any language's, and cursors bound to the language (6.4);
// - actions (11.1): restock (on a product, not idempotent, with input), low_stock (a safe GET on
//   products with output, retired whole, so its responses carry Deprecation and Sunset, 5.5),
//   inherit_tax (on a category, idempotent), find_or_create (on the authors, 201 or 204), compare (a
//   safe GET on a book with params and output) and verify_email (on the /me singleton); an action that
//   changes its item answers 200 with Content-Location and the new ETag (7.2); _actions lists the ones
//   available, {} where none is;
// - inherited values (11.6): a product and a category take their tax rate from their category, their
//   parent category or a default, materialized after every write; a category's shelf combines its own
//   members with its parent's (combine: fields); and a category's labels, /categories/{category_id}/labels,
//   list its own labels and its parent's, keyed by slot, unless its switch takes_parent_labels is off
//   (inherit_items, with _from on the inherited ones, which give 409 to PATCH and DELETE);
// - categories take an id from the client or assign one ("id_from": "either", 5.1), have a unique name and
//   compare and sort it ignoring case and accents ("collations": {"name": "server"}, 6.1); /shop is a
//   singleton (5.9), and so are /me, with an action, and /readers/{reader_id}/settings, under each reader,
//   whose PATCH declares its effects (method_effects, 4.3 and 5.9);
// - an integer filter takes 20.0 and 2e1 as 20, also for the cursor, and gives invalid_parameter to 20.5 and to
//   what the number grammar of RFC 8259 leaves out, such as 020, +20, .5 and 0x14 (6.1); a GET
//   action without params refuses any query parameter (11.1); a replay whose body is no longer the item's
//   current representation goes without Content-Location, ETag and _etag (7.1), and that of a 201 without a
//   body (return=minimal), without ETag (7.3);
// - bodies are I-JSON (3): a repeated member name gives 400 bad_request, and an unpaired surrogate, a
//   noncharacter or U+0000 gives 422 invalid with a format entry at the string that holds it ("" for a member name).
// What it cannot show: it has a single principal (or none), so no field or related item is hidden from
// anyone (5.1, 6.1, 9), no existence is concealed and keys without credentials are never refused (7.1);
// nobody acts on behalf of another (2); it accepts no cookies, so the Origin check of 5.8 does not apply;
// it never compresses responses (7.2), never answers 429 or 503 (5.7), and has no required filter (6.1).
// Field types: it only handles the ones its data uses (string, integer, number, decimal, boolean, datetime,
// localdatetime, enum, language maps, localized fields and relationships); a server with date or duration
// fields, or that filters or sorts by a local date-time, must add their comparison rules (section 6.1).
// Its own texts (error titles and details, descriptions in discovery) come in English, the default, or
// Spanish, picked by Accept-Language (5.6); the data never changes with it, except localized fields.
import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes } from 'node:crypto';

const PROFILE = 'https://w3id.org/restep/1/'; // identifier: the profile link and error types
const SPEC = 'https://restep.wubytes.com/1/'; // the page to read
const RESTEP = '1.0-draft.7'; // 1.1: a draft declares itself with its suffix
const PROFILES = ['core', 'query', 'writes', 'cache', 'relations'];
const TOKEN = process.env.RESTEP_TOKEN || null;
const EXTENSIONS = TOKEN ? ['actions', 'inherit', 'oauth'] : ['actions', 'inherit']; // 11.1 and 11.6: both are declared below, so they are announced
const STATUS = '/health'; // 4.4: any path, declared in discovery as status
const METADATA = '/.well-known/oauth-protected-resource'; // the root is /, so no path after the suffix (RFC 9728, 3.1)

// ── The API's own texts in two languages (5.6) ───────────────────────────────
const LANGUAGES = ['en', 'es']; // the first is the default
const t = (en, es) => ({ en, es }); // a text for people, in each language
const text = (v, lang) => (typeof v === 'string' ? v : v[lang]);
// Lookup (RFC 4647, 3.4) over LANGUAGES: ranges by weight and then header order, case-insensitive,
// truncated from the end; *, q=0 and malformed ranges are ignored. Never an error.
const RANGE = /^[a-z]{1,8}(-[a-z0-9]{1,8})*$/i;
function pickLanguage(header) {
  const ranges = [];
  (header ?? '').split(',').forEach((part, i) => {
    const [range, ...params] = part.split(';').map((x) => x.trim());
    if (!RANGE.test(range)) return; // also leaves out * and empty ranges
    let q = 1;
    for (const p of params) {
      const m = /^q=(0(\.\d{0,3})?|1(\.0{0,3})?)$/i.exec(p);
      if (!m) return; // a malformed weight or parameter: the range is malformed
      q = Number(m[1]);
    }
    if (q > 0) ranges.push({ range: range.toLowerCase(), q, i });
  });
  ranges.sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { range } of ranges) {
    for (let tag = range; tag;) {
      if (LANGUAGES.includes(tag)) return tag;
      const cut = tag.lastIndexOf('-');
      tag = cut < 0 ? '' : tag.slice(0, cut).replace(/-[a-z0-9]$/, ''); // a singleton goes with the subtag after it
    }
  }
  return LANGUAGES[0];
}

// ── Language maps (section 3) ─────────────────────────────────────────────────
// A well-formed language tag (the grammar of RFC 5646, 2.1), in lowercase: language with extlangs,
// script, region, variants, extensions, private use, and the grandfathered tags.
const TAG = new RegExp('^(?:(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4,8})(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?' +
  '(?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?' +
  '|x(?:-[a-z0-9]{1,8})+|en-gb-oed|i-(?:ami|bnn|default|enochian|hak|klingon|lux|mingo|navajo|pwn|tao|tay|tsu)' +
  '|sgn-(?:be-fr|be-nl|ch-de)|art-lojban|cel-gaulish|no-bok|no-nyn|zh-(?:guoyu|hakka|min|min-nan|xiang))$');
// The tags this API accepts in its language maps; any other well-formed tag gives unknown.
const TAGS = ['en', 'en-au', 'en-gb', 'es', 'es-es', 'es-mx'];
const isMap = (coll, f) => coll.types[f] === 'map';
const maps = (coll) => Object.keys(coll.types).filter((f) => isMap(coll, f));
// A dotted path (6.1, 9): through a to-one relationship (author.id, author.name), the related item's
// field; otherwise a translation, field.tag, which reads that exact key or nothing.
const at = (row, f, coll) => {
  const dot = f.indexOf('.');
  if (dot < 0) return row[f];
  const m = f.slice(0, dot), rest = f.slice(dot + 1), rel = coll?.relations?.[m];
  if (rel && !rel.many && typeof rel.to === 'string') return rest === 'id' ? row[m]?.id : lookup(rel.to, row[m])?.[rest];
  return row[m]?.[rest];
};
const typeOf = (coll, f) => (coll.filter_types?.[f] ?? (f.includes('.') || coll.types[f] === 'localized' ? 'string'
  : coll.types[f] === 'enum' ? coll.values[f] : coll.types[f]));

// ── Data: the El Marcapáginas bookshop (https://rest.wubytes.com) ─────────────
// Field types follow the discovery vocabulary (section 4.2): they drive validation and comparison.
const rows = (list) => new Map(list.map((r) => [r.id, r]));
const db = {
  books: {
    description: t('Books in the catalogue of El Marcapáginas, one per edition.', 'Libros del catálogo de El Marcapáginas, uno por edición.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'], // 4.3: declared, so they must match Allow
    types: { id: 'string', title: 'string', price: 'decimal', rating: 'number', year: 'integer', category: 'enum',
      author: 'relation', related: 'relation', highlight: 'relation', cover: 'relation' },
    values: { category: ['novela-negra', 'ciencia-ficcion', 'ensayo', 'poesia', 'infantil'] },
    required: ['title', 'price'],
    // 3 and 9: author is to-one, related is to-many, and highlight points at an item of a subcollection,
    // so its objects carry href. All three can be expanded with include. cover links an uploaded file
    // (5.1), only a JPEG or a PNG: a file of another type gives 422 with format at /cover/id.
    relations: {
      author: { to: 'authors', include: true },
      related: { to: 'books', many: true, include: true },
      highlight: { to: 'reviews', include: true },
      cover: { to: 'files', include: true, media_types: ['image/jpeg', 'image/png'] },
    },
    // 9: the relationship that leads to a subcollection goes only in discovery, never in the representation.
    sub_relations: { reviews: { to: 'reviews', many: true, path: '/books/{book_id}/reviews' } },
    filter: { id: ['eq', 'in'], price: ['eq', 'lt', 'le', 'gt', 'ge'], category: ['eq', 'ne', 'in'],
      year: ['eq', 'lt', 'le', 'gt', 'ge'], rating: ['ge', 'null'], title: ['eq', 'in', 'nin', 'prefix', 'contains'], // 6.1
      'author.id': ['eq', 'in'], 'author.name': ['eq', 'in'], // 6.1 and 9: through the to-one author
      // 6.1: through the to-many reviews, with quantifier some. Filters on the same relationship form a group
      // that one review must match whole; null on the relationship itself negates the group, and is declared
      // with the type of the reviews' id, string, and without quantifier, since null is its only operator
      // ("some" would select the same: null tests the whole group, never whether some review is null).
      // null on reviews.reader.id joins the group: some review without a reader. Only one null filter per group.
      'reviews.rating': ['eq', 'in', 'lt', 'le', 'gt', 'ge'], 'reviews.reader.id': ['eq', 'in', 'null'], reviews: ['null'] },
    filter_types: { 'reviews.rating': 'integer', 'reviews.reader.id': 'string', reviews: 'string' },
    // The related items of each to-many path declared with quantifier some, as the principal sees them.
    some: { reviews: (row) => [...(db.reviews.byParent.get(row.id)?.values() ?? [])] },
    item_method_effects: { PATCH: [], DELETE: ['destroys'] }, // 4.3 and 11.1
    // 6.1: named filters do not compare a field; their description is their meaning. Without type,
    // a switch (filter[featured]); with type, it takes a value (filter[search]=niebla).
    named_filters: {
      featured: { description: t('The books the shop features this month.', 'Los libros que la librería destaca este mes.'),
        apply: (r) => ['7', '30'].includes(r.id) },
      search: { type: 'string', description: t('Title contains the text, case-insensitively.', 'El título contiene el texto, sin distinguir mayúsculas.'),
        apply: (r, v) => r.title.toLowerCase().includes(v.toLowerCase()) },
    },
    sort: ['id', 'title', 'price', 'rating', 'year', 'reviews.rating'], // 6.2: by the least, or with -, the greatest
    max_limit: 50,
    count: 'exact',
    // 5.5: sorting by year will go. It retires part of the collection, so it is announced in discovery only:
    // responses that sort by year carry no Deprecation.
    deprecations: [{ kind: 'sort', name: 'year', announced: '2026-11-20T00:00:00Z', sunset: '2027-06-01T00:00:00Z' }],
    // 11.1: a safe GET action with params and output: what changes from this book to another one.
    actions: {
      compare: { on: 'item', method: 'GET', safe: true, idempotent: true, effects: [],
        description: t('What differs between this book and another.', 'Qué cambia entre este libro y otro.'),
        params: { with: { type: 'string', required: true, description: t('The id of the other book.', 'El id del otro libro.') } },
        output: { type: 'object', required: ['fields'], properties: { fields: { type: 'array', items: { type: 'object', required: ['name'],
          properties: { name: { type: 'string' }, from: {}, to: {} } } } } },
        run: (coll, row, body, args) => {
          const other = coll.rows.get(args.with);
          if (!other) throw bad('with', t(`There is no book ${args.with}.`, `No hay ningún libro ${args.with}.`));
          const fields = ['title', 'price', 'rating', 'year', 'category'].filter((f) => !same(row[f], other[f]))
            .map((f) => ({ name: f, from: row[f] ?? null, to: other[f] ?? null }));
          return [200, { fields }];
        } },
    },
    rows: rows([
      { id: '7', title: 'La niebla de Portugalete', price: '18.50', rating: 4.6, year: 2025, category: 'novela-negra',
        author: { id: '1' }, related: [{ id: '50' }], highlight: { id: '1', href: '/books/7/reviews/1' } },
      { id: '12', title: 'El último ferry', price: '16.90', rating: 4.3, year: 2023, category: 'novela-negra', author: { id: '2' }, related: [] },
      { id: '15', title: 'Lluvia sobre Deusto', price: '14.95', rating: 4.1, year: 2022, category: 'novela-negra', author: { id: '1' }, related: [] },
      { id: '21', title: 'Mareas de silicio', price: '19.90', rating: 4.4, year: 2026, category: 'ciencia-ficcion', author: { id: '3' }, related: [] },
      { id: '23', title: 'Cartografía del ruido', price: '21.00', rating: 4.0, year: 2026, category: 'ensayo', author: { id: '3' }, related: [] },
      { id: '30', title: 'Cuaderno de faros', price: '12.00', rating: 4.8, year: 2024, category: 'poesia', author: { id: '2' }, related: [] },
      { id: '50', title: 'Bajo la niebla', price: '11.90', year: 2025, category: 'infantil', author: { id: '1' }, related: [{ id: '7' }] },
    ]),
  },
  // name and description are language maps (3). Some translations are missing on purpose: a filter
  // or sort by name.es-mx must not fall back to es (6.1).
  products: {
    description: t('Other products of the shop, with their name and description in several languages.',
      'Otros productos de la tienda, con su nombre y su descripción en varios idiomas.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    types: { id: 'string', name: 'map', description: 'map', price: 'decimal', stock: 'integer',
      category: 'relation', tax_rate: 'decimal', tax_rate_own: 'decimal' },
    values: {},
    required: ['price'],
    relations: { category: { to: 'categories', include: true } },
    include_depth: 2, // 9: include=category.parent
    inherit: { tax_rate: { own: 'tax_rate_own', from: ['category'], default: '21',
      description: t('VAT rate in %; without its own, its category\'s.', 'IVA en %; si no tiene propio, el de su categoría.') } },
    filter: { id: ['eq', 'in'], price: ['eq', 'lt', 'le', 'gt', 'ge'], tax_rate: ['eq', 'lt', 'le', 'gt', 'ge'], tax_rate_own: ['null'], 'name.es-mx': ['eq', 'in'], 'name.en-gb': ['eq', 'in'] },
    sort: ['id', 'price', 'tax_rate', 'name.es-mx', 'name.en-gb'],
    // 11.1: restock changes the item and, repeated, adds again (not idempotent: 7.1 applies to it);
    // low_stock is a safe GET on the collection.
    // low_stock declares output: its result is not a representation, so its items carry no _etag or _actions.
    actions: {
      restock: { on: 'item', safe: false, idempotent: false, effects: [],
        description: t('Adds units to the stock.', 'Añade unidades al stock.'),
        input: { type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 1 } }, additionalProperties: false },
        run: (coll, row, body) => { row.stock = (row.stock ?? 0) + body.quantity; return [200, row]; } },
      low_stock: { on: 'collection', method: 'GET', safe: true, idempotent: true, effects: [],
        description: t('The products with fewer than 5 units in stock.', 'Los productos con menos de 5 unidades en stock.'),
        output: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', required: ['id'],
          properties: { id: { type: 'string' }, stock: { type: 'integer' } } } } } },
        run: (coll) => [200, { items: [...coll.rows.values()].filter((r) => r.stock != null && r.stock < 5)
          .map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')))) }] },
    },
    // 5.5: low_stock is retired whole, so every response to it carries Deprecation, Sunset and a deprecation link.
    deprecations: [{ kind: 'action', name: 'low_stock', announced: '2026-11-24T00:00:00Z', sunset: '2027-06-01T00:00:00Z' }],
    max_limit: 50,
    count: 'exact',
    rows: rows([
      { id: '1', name: { en: 'Eraser', 'en-au': 'Rubber', 'en-gb': 'Rubber', 'es-es': 'Goma de borrar', 'es-mx': 'Goma' },
        description: { en: 'A soft white eraser.', es: 'Una goma blanca y blanda.' }, price: '1.20', stock: 40,
        category: { id: '3' }, tax_rate_own: null },
      { id: '2', name: { en: 'Pencil case', 'en-gb': 'Pencil case', 'es-es': 'Estuche', 'es-mx': 'Lapicera' },
        description: {}, price: '6.50', stock: 12, category: { id: '1' }, tax_rate_own: null },
      { id: '3', name: { en: 'Bookmark', es: 'Marcapáginas', 'es-mx': 'Separador' }, description: {}, price: '2.00',
        category: { id: '4' }, tax_rate_own: null },
      { id: '4', name: { en: 'Tote bag', 'en-au': 'Tote bag', 'es-es': 'Bolsa de tela' },
        description: { en: 'Cotton, with the shop’s logo.', 'es-es': 'De algodón, con el logo de la librería.' }, price: '9.90', stock: 5,
        category: { id: '1' }, tax_rate_own: '10' },
      { id: '5', name: { en: 'Book light', 'en-gb': 'Reading light', es: 'Lámpara de lectura' }, description: {}, price: '14.50', stock: 3,
        category: { id: '5' }, tax_rate_own: null },
      { id: '6', name: {}, description: {}, price: '3.00', category: null, tax_rate_own: null },
    ]),
  },
  // Inherited values (11.6): tax_rate is the effective value, tax_rate_own the one that is written.
  // Category 4 inherits from its parent 2; category 3 inherits through 1 down to the default.
  // The client may choose the id of a new category (5.1), and no two categories share a name, compared
  // as the server compares it (6.1): a POST that repeats one gets 409 conflict.
  categories: {
    description: t('Product categories, nested; each takes its VAT rate from its parent if it has none.',
      'Categorías de productos, anidadas; cada una toma el IVA de su padre si no tiene propio.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    id_from: 'either',
    types: { id: 'string', name: 'string', parent: 'relation', showcase: 'relation', tax_rate: 'decimal', tax_rate_own: 'decimal',
      shelf: 'object', shelf_own: 'object', takes_parent_labels: 'boolean' },
    // Objects of scalars: their members and types (11.6 allows them as effective and own fields).
    shapes: { shelf: { floor: 'integer', section: 'string' }, shelf_own: { floor: 'integer', section: 'string' } },
    values: {},
    required: ['name'],
    unique: ['name'],
    collations: { name: 'server' },
    notes: { name: t('Unique; compared and sorted ignoring case and accents.', 'Único; se compara y se ordena sin distinguir mayúsculas ni acentos.') },
    // 3: showcase can point to a book or a product, so its objects carry type.
    relations: { parent: { to: 'categories', include: true }, showcase: { to: ['books', 'products'], include: true } },
    // 11.6: shelf combines member by member (combine: fields): a category without its own floor takes its
    // parent's, and keeps its own section. It has no default, so a member nobody sets has no value.
    inherit: { tax_rate: { own: 'tax_rate_own', from: ['parent'], default: '21',
      description: t('VAT rate in %; without its own, its parent\'s, and 21 at the top.', 'IVA en %; si no tiene propio, el de su padre, y 21 arriba del todo.') },
    shelf: { own: 'shelf_own', from: ['parent'], combine: 'fields',
      description: t('Where its books stand; each member it does not set comes from its parent.', 'Dónde están sus libros; cada miembro que no fija viene de su padre.') } },
    // 4.3: a default in the create schema; the switch of its labels (inherit_items, below) starts on.
    defaults: { takes_parent_labels: true },
    filter: { id: ['eq', 'in'], name: ['eq', 'in'], tax_rate: ['eq', 'lt', 'le', 'gt', 'ge'], tax_rate_own: ['null'] },
    sort: ['id', 'name', 'tax_rate'],
    // 11.1: idempotent, so repeating it changes nothing more; _actions lists it only where there is an own rate.
    actions: {
      inherit_tax: { on: 'item', safe: false, idempotent: true, effects: [],
        description: t('Removes its own VAT rate, so it inherits again.', 'Quita su IVA propio, para que vuelva a heredarlo.'),
        available: (row) => row.tax_rate_own != null,
        run: (coll, row) => { row.tax_rate_own = null; return [200, row]; } },
    },
    max_limit: 50,
    count: 'exact',
    rows: rows([
      { id: '1', name: 'Papelería', parent: null, showcase: { type: 'products', id: '2' }, tax_rate_own: null,
        shelf_own: { floor: 0, section: 'A' }, takes_parent_labels: true },
      { id: '2', name: 'Libros', parent: null, showcase: { type: 'books', id: '7' }, tax_rate_own: '4',
        shelf_own: { floor: 1, section: 'B' }, takes_parent_labels: true },
      { id: '3', name: 'Material escolar', parent: { id: '1' }, tax_rate_own: null, shelf_own: { section: 'C' }, takes_parent_labels: true },
      { id: '4', name: 'Libros infantiles', parent: { id: '2' }, tax_rate_own: null, shelf_own: null, takes_parent_labels: true },
      { id: '5', name: 'Lámparas', parent: { id: '1' }, tax_rate_own: '10', shelf_own: null, takes_parent_labels: false },
    ]),
  },
  authors: {
    description: t('The authors of the books.', 'Los autores de los libros.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    types: { id: 'string', name: 'string', country: 'string' },
    values: {},
    required: ['name'],
    filter: { id: ['eq', 'in'], name: ['eq', 'in'], country: ['eq', 'in'] },
    sort: ['id', 'name'],
    max_limit: 50,
    count: 'exact',
    // 11.1: on the collection, idempotent: a new author (201 with Location) or, if one has that exact name
    // already, nothing (204). An unsafe action on a collection has no representation to return: never 200.
    actions: {
      find_or_create: { on: 'collection', safe: false, idempotent: true, effects: [],
        description: t('Creates the author with this exact name, if there is none.', 'Crea el autor con este nombre exacto, si no hay ninguno.'),
        input: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 }, country: { type: 'string' } }, additionalProperties: false },
        run: (coll, row, body) => {
          const found = [...coll.rows.values()].find((r) => r.name === body.name);
          if (found) return [204];
          const made = { id: newId(coll), ...body };
          coll.rows.set(made.id, made);
          coll.used.add(made.id);
          return [201, made];
        } },
    },
    rows: rows([
      { id: '1', name: 'Inés Arriaga', country: 'ES' },
      { id: '2', name: 'Jon Uriarte', country: 'ES' },
      { id: '3', name: 'Marta Lagos', country: 'CL' },
    ]),
  },
  // A subcollection (4.2): each book's reviews, at /books/{book_id}/reviews. Its items live under their
  // book: deleting the book deletes them, and their ids are taken only under it (5.1). A request sees the
  // reviews of its book through view().
  reviews: {
    path: '/books/{book_id}/reviews', parent: 'books',
    description: t('The readers’ reviews of a book.', 'Las reseñas de un libro, de sus lectores.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    types: { id: 'string', rating: 'integer', text: 'string', reader: 'relation' },
    values: {},
    required: ['rating', 'text'],
    relations: { reader: { to: 'readers' } },
    filter: { id: ['eq', 'in'], rating: ['eq', 'lt', 'le', 'gt', 'ge'] },
    sort: ['id', 'rating'],
    max_limit: 50,
    count: 'exact',
    rows: new Map(), // empty: the items are in byParent
    byParent: new Map([
      ['7', rows([{ id: '1', rating: 5, text: 'Te atrapa desde la primera niebla.', reader: { id: '1' } },
        { id: '2', rating: 4, text: 'Buena, aunque el final se adivina.', reader: { id: '2' } }])],
      ['12', rows([{ id: '3', rating: 4, text: 'Un viaje que no quieres que acabe.', reader: { id: '1' } }])],
      ['30', rows([{ id: '4', rating: 2, text: 'No es para mí.', reader: { id: '2' } }])],
    ]),
    usedByParent: new Map(),
  },
  // Appendix D and 5.1: a book's draft, an item of a subcollection with a fixed id, current. PATCH creates it
  // (upsert, 201) or edits it, and DELETE discards it; its id is free again afterwards (reusable_ids).
  drafts: {
    path: '/books/{book_id}/drafts', parent: 'books',
    description: t('The draft of a book’s changes, before they reach the catalogue.', 'El borrador de los cambios de un libro, antes de llegar al catálogo.'),
    methods: ['GET'], item_methods: ['GET', 'PATCH', 'DELETE'],
    id_from: 'client', reusable_ids: true, upsert: true,
    id_pattern: { source: '^current$', text: t('The draft\'s id is current.', 'El id del borrador es current.') }, // 5.1: a format of its own
    types: { id: 'string', title: 'string', price: 'decimal', notes: 'string', edited_at: 'datetime' },
    server_set: ['edited_at'],
    values: {},
    required: [],
    filter: { id: ['eq', 'in'] },
    sort: ['id'],
    max_limit: 50,
    rows: new Map(),
    byParent: new Map([['7', rows([{ id: 'current', title: 'La niebla de Portugalete (edición revisada)', price: '19.50', edited_at: '2026-11-20T09:30:00.000Z' }])]]),
    usedByParent: new Map(),
  },
  // Uploads (5.1): a POST takes the bytes of an image, raw or as multipart/form-data with one part, file.
  // Each file is an ordinary item with _content, the link to its bytes, outside Restep (5.9).
  files: {
    description: t('Images uploaded for the catalogue, such as book covers.', 'Imágenes subidas para el catálogo, como las portadas de los libros.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    upload: { media_types: ['image/*'], max_size: 1048576, multipart: true },
    types: { id: 'string', name: 'string', alt: 'string' },
    server_set: ['name'],
    notes: { name: t('The file’s original name, from Content-Disposition.', 'El nombre original del fichero, de Content-Disposition.') },
    values: {},
    required: [],
    filter: { id: ['eq', 'in'] },
    sort: ['id'],
    max_limit: 50,
    count: 'exact',
    rows: rows([{ id: 'f1', name: 'portada-niebla.png', alt: 'Portada de La niebla de Portugalete',
      _content: { href: '/files/f1/content', media_type: 'image/png', size: 67 } }]),
  },
  // A reader of the shop. Each one has settings, a singleton under it (5.9), and subscriptions.
  readers: {
    description: t('The shop’s registered readers.', 'Los lectores registrados de la librería.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    types: { id: 'string', name: 'string', email: 'string' },
    values: {},
    required: ['name'],
    filter: { id: ['eq', 'in'], name: ['eq', 'in', 'prefix'] },
    sort: ['id', 'name'],
    max_limit: 50,
    count: 'exact',
    rows: rows([
      { id: '1', name: 'Ane Goikoetxea', email: 'ane@example.com' },
      { id: '2', name: 'Pablo Ruiz', email: 'pablo@example.com' },
    ]),
  },
  // 5.1: a reader's subscriptions to authors, keyed by the author's id: the key comes back after a
  // subscription is deleted (reusable_ids). Each incarnation has its own subscribed_at, and so its own ETag;
  // PATCH and DELETE require If-Match, since only it tells one incarnation from another (7.2).
  subscriptions: {
    path: '/readers/{reader_id}/subscriptions', parent: 'readers',
    description: t('The authors a reader follows, by the author’s id.', 'Los autores que sigue un lector, por el id del autor.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    id_from: 'client', reusable_ids: true, require_if_match: true,
    id_of: 'authors', // the id is an author's: another gives 422 with unknown at /id
    types: { id: 'string', frequency: 'enum', subscribed_at: 'datetime' },
    values: { frequency: ['weekly', 'monthly'] },
    defaults: { frequency: 'monthly' },
    server_set: ['subscribed_at'],
    required: [],
    filter: { id: ['eq', 'in'], frequency: ['eq', 'in'] },
    sort: ['id'],
    max_limit: 50,
    count: 'exact',
    rows: new Map(),
    byParent: new Map([['1', rows([{ id: '1', frequency: 'weekly', subscribed_at: '2026-10-01T08:00:00.000Z' }])]]),
    usedByParent: new Map(),
  },
  // 6.1 and 5.2: a default named filter. active applies to every list request that does not turn it off with
  // filter[active]=false, so archived orders are left out of a plain GET; reading one by its path works.
  orders: {
    description: t('Reservations of books for readers to collect at the shop.', 'Reservas de libros para que los lectores las recojan en la tienda.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    method_effects: { POST: [] }, item_method_effects: { PATCH: [], DELETE: ['destroys'] }, // 4.3
    types: { id: 'string', reader: 'relation', book: 'relation', quantity: 'integer', status: 'enum', archived: 'boolean', collect_at: 'localdatetime' },
    values: { status: ['reserved', 'collected', 'cancelled'] },
    // 3 and 4.2: when the reader will collect the order, a wall-clock time at the shop, written by the client.
    // Floating (no zone): it denotes no instant by itself. A leap second (:60) in a body gives 422 with format.
    local_times: { collect_at: {} },
    defaults: { quantity: 1, archived: false }, // 4.3: a default in create is what a POST that leaves it out gets
    server_set: ['status'],
    required: ['reader', 'book'],
    relations: { reader: { to: 'readers', include: true }, book: { to: 'books', include: true } },
    filter: { id: ['eq', 'in'], status: ['eq', 'in'], 'reader.id': ['eq', 'in'] },
    named_filters: {
      active: { default: true, description: t('Orders not archived. On by default: filter[active]=false turns it off.',
        'Los pedidos sin archivar. Se aplica por defecto: filter[active]=false lo apaga.'), apply: (r) => !r.archived },
    },
    sort: ['id', 'quantity'],
    max_limit: 50,
    count: 'exact',
    actions: {
      // 11.1: the starting values of a new order for this principal, and an effective schema that only
      // restricts the create schema.
      new: { on: 'collection', method: 'GET', safe: true, idempotent: true, effects: [],
        description: t('The starting values of a new order, and what it may take.', 'Los valores iniciales de un pedido nuevo, y lo que admite.'),
        output: { type: 'object', required: ['values', 'schema'], properties: { values: { type: 'object' }, schema: { type: 'object' } } },
        run: (coll) => {
          const create = schemas(coll, 'en').create;
          const max = shop.row.max_reservations;
          const schema = { ...create, properties: { ...create.properties, quantity: { type: 'integer', minimum: 1, maximum: max, default: 1 } } };
          return [200, { values: { reader: { id: ME }, quantity: 1, archived: false }, schema }];
        } },
      cancel: { on: 'item', safe: false, idempotent: true, effects: ['external'],
        description: t('Cancels the reservation and emails the reader.', 'Anula la reserva y se lo dice al lector por correo.'),
        available: (row) => row.status !== 'collected', // repeated on a cancelled order, it changes nothing
        run: (coll, row) => { row.status = 'cancelled'; return [200, row]; } }, // the email goes only the first time
      collect: { on: 'item', safe: false, idempotent: false, effects: ['charges'],
        description: t('Hands the books over and charges the reader.', 'Entrega los libros y se los cobra al lector.'),
        available: (row) => row.status === 'reserved',
        run: (coll, row) => { row.status = 'collected'; return [200, row]; } },
    },
    rows: rows([
      { id: '2001', reader: { id: '1' }, book: { id: '7' }, quantity: 1, status: 'reserved', archived: false, collect_at: '2026-11-28T18:30:00' },
      { id: '2002', reader: { id: '2' }, book: { id: '21' }, quantity: 2, status: 'collected', archived: false },
      { id: '2003', reader: { id: '1' }, book: { id: '12' }, quantity: 1, status: 'collected', archived: true },
    ]),
  },
  // 4.3: a collection without GET. A payment is created and read by its path, never listed.
  payments: {
    description: t('Payments of orders; they are created, not listed.', 'Pagos de pedidos; se crean, no se listan.'),
    methods: ['POST'], item_methods: ['GET'],
    method_effects: { POST: ['charges'] },
    types: { id: 'string', order: 'relation', amount: 'decimal' },
    values: {},
    required: ['order', 'amount'],
    relations: { order: { to: 'orders' } },
    rows: rows([]),
  },
  // 3 and 5.6: name is a localized field, the text of name_i18n in the language of the response. It is
  // read-only, filtered and sorted in that language, with this API's collation.
  genres: {
    description: t('Literary genres, with their name in each language.', 'Géneros literarios, con su nombre en cada idioma.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    id_from: 'client',
    types: { id: 'string', name: 'localized', name_i18n: 'map' },
    localized: { name: { source: 'name_i18n' } },
    values: {},
    required: [],
    filter: { id: ['eq', 'in'], name: ['eq', 'in', 'prefix', 'contains'] },
    collations: { name: 'server' },
    notes: { name: t('In the language of the response; compared ignoring case and accents.', 'En el idioma de la respuesta; se compara sin distinguir mayúsculas ni acentos.') },
    sort: ['id', 'name'],
    max_limit: 50,
    count: 'exact',
    rows: rows([
      { id: 'novela-negra', name_i18n: { en: 'Crime fiction', es: 'Novela negra' } },
      { id: 'ciencia-ficcion', name_i18n: { en: 'Science fiction', es: 'Ciencia ficción' } },
      { id: 'ensayo', name_i18n: { en: 'Essay', es: 'Ensayo' } },
      { id: 'poesia', name_i18n: { en: 'Poetry', es: 'Poesía' } },
      { id: 'infantil', name_i18n: { es: 'Infantil' } }, // no English: the localized field falls back to Spanish
    ]),
  },
  // 11.6: inherited items. A category's labels are its own and its parent's, keyed by slot: an own label
  // replaces its parent's in the same slot, and while the category's takes_parent_labels is off, only its
  // own are listed. An inherited label carries _from and an id of its own, and cannot be written (409).
  labels: {
    path: '/categories/{category_id}/labels', parent: 'categories',
    description: t('Shelf labels of a category, its own and those it inherits.', 'Las etiquetas de estante de una categoría, propias y heredadas.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    inherit_items: { from: ['parent'], key: ['slot'], switch: { field: 'takes_parent_labels', initial: true },
      description: t('Its parent category’s labels, unless it has its own in that slot.', 'Las etiquetas de su categoría padre, salvo que tenga la suya en esa posición.') },
    types: { id: 'string', slot: 'enum', text: 'string' },
    values: { slot: ['top', 'bottom'] },
    required: ['slot', 'text'],
    unique: ['slot'],
    filter: { id: ['eq', 'in'], slot: ['eq', 'in'] },
    sort: ['id', 'slot'],
    max_limit: 50,
    count: 'exact',
    rows: new Map(),
    byParent: new Map([
      ['1', rows([{ id: '1', slot: 'top', text: 'Papelería' }, { id: '2', slot: 'bottom', text: 'Precios con IVA' }])],
      ['3', rows([{ id: '3', slot: 'top', text: 'Vuelta al cole' }])],
    ]),
    usedByParent: new Map(),
  },
};
// The principal of /me: there is only one (see the header).
const ME = '1';
// 5.1: every id a collection has had, so a deleted one is never given out again (taken, 409).
for (const coll of Object.values(db)) coll.used = new Set(coll.rows.keys());
for (const sub of Object.values(db).filter((c) => c.byParent))
  for (const [parentId, list] of sub.byParent) sub.usedByParent.set(parentId, new Set(list.keys()));

// 4.2 and 5.1: a subcollection under one parent item: the same declaration with that item's rows, the
// ids it has had and its path, with the template expanded.
const subsOf = (name) => Object.keys(db).filter((k) => db[k].parent === name);
const expandPath = (sub, parentId) => sub.path.replace(/\{[^}]+\}/, parentId);
function view(sub, parentId) {
  if (!sub.byParent.has(parentId)) sub.byParent.set(parentId, new Map());
  if (!sub.usedByParent.has(parentId)) sub.usedByParent.set(parentId, new Set());
  const own = sub.byParent.get(parentId);
  // 11.6: with inherit_items, the rows read are the resolved list, and a write reaches the own map.
  const listed = sub.inherit_items && Object.assign(new Listed(resolvedItems(sub, parentId).map((r) => [r.id, r])), { own });
  return Object.create(sub, { rows: { value: listed || own }, used: { value: sub.usedByParent.get(parentId) },
    base: { value: sub }, parentId: { value: parentId } });
}
// The item a relationship object points to: by id, or by href in a subcollection (3, 9).
const targets = (rel) => [].concat(rel.to);
function lookup(toName, v) {
  const to = db[toName];
  if (!isObject(v) || !to) return undefined;
  if (!to.parent) return to.rows.get(v.id);
  const m = typeof v.href === 'string' && hrefPattern(to).exec(v.href);
  return m && m[2] === v.id && db[to.parent].rows.has(m[1]) ? to.byParent.get(m[1])?.get(v.id) : undefined;
}
const hrefPattern = (sub) => new RegExp(`^${sub.path.replace(/\{[^}]+\}/g, '([^/]+)')}/([^/]+)$`);

// 5.9: a singleton, the shop's own details. It behaves as an item without id or collection.
const shop = {
  path: '/shop',
  description: t('The shop’s own details: its name, how to reach it and how many books a customer may reserve.',
    'Los datos de la propia librería: su nombre, cómo contactar y cuántos libros puede reservar un cliente.'),
  methods: ['GET', 'PATCH'],
  types: { name: 'string', email: 'string', phone: 'string', max_reservations: 'integer' },
  values: {},
  required: ['name', 'max_reservations'],
  row: { name: 'El Marcapáginas', email: 'hola@marcapaginas.example', phone: '+34 944 000 000', max_reservations: 3 },
};
// 5.9 and 11.1: the signed-in reader's account, with an action at /me:verify_email. Its id is read-only.
const me = {
  path: '/me',
  description: t('The signed-in reader’s account.', 'La cuenta del lector que ha iniciado sesión.'),
  methods: ['GET', 'PATCH'],
  types: { id: 'string', name: 'string', email: 'string', email_verified: 'boolean' },
  read_only: ['id', 'email_verified'],
  values: {},
  required: ['name', 'email'],
  actions: {
    verify_email: { safe: false, idempotent: true, effects: ['external'],
      description: t('Sends the reader an email to confirm the address.', 'Envía al lector un correo para confirmar la dirección.'),
      run: () => [204] },
  },
  row: { id: ME, name: 'Ane Goikoetxea', email: 'ane@example.com', email_verified: false,
    _actions: { verify_email: { method: 'POST', href: '/me:verify_email' } } }, // 11.1: its actions, in its ETag
};
// 5.9: a singleton under each reader, which exists as long as its reader does.
const settings = {
  path: '/readers/{reader_id}/settings', parent: 'readers',
  description: t('A reader’s notification settings.', 'Los avisos que quiere recibir un lector.'),
  methods: ['GET', 'PATCH'],
  types: { newsletter: 'boolean', new_books: 'boolean' },
  values: {},
  required: ['newsletter', 'new_books'],
  method_effects: { PATCH: [] }, // 4.3 and 5.9: changing them has none of the three effects
  initial: () => ({ newsletter: false, new_books: true }),
  byParent: new Map(),
};
const SINGLETONS = { shop, me, settings };
// The singleton a path names, as { s, row holder }: under a parent item, only while that item exists.
function singletonAt(pathname) {
  if (pathname === me.path) return me;
  const m = /^\/readers\/([^/]+)\/settings$/.exec(pathname);
  if (!m) return null;
  let id;
  try { id = decodeURIComponent(m[1]); } catch { return null; }
  if (!db.readers.rows.has(id)) return { missing: true };
  if (!settings.byParent.has(id)) settings.byParent.set(id, settings.initial());
  // A view whose row reads and writes this reader's settings.
  return Object.create(settings, { row: { get: () => settings.byParent.get(id), set: (v) => settings.byParent.set(id, v) },
    at: { value: `/readers/${id}/settings` } });
}

// ── Inherited values (11.6) ───────────────────────────────────────────────────
// The effective field is resolved and stored after every write, with _inherited explaining where it
// comes from: so filters, sorting, fields and ETags (7.2) see it like any other field.
const nameOf = (coll) => Object.keys(db).find((n) => db[n] === coll);
// Where field f of a row comes from: { value, href } of the item that holds it, or { value } for the default.
function source(coll, row, f, seen = new Set()) {
  const s = viaLinks(coll, row, f, seen);
  // 11.6: when the item the first link reaches has no effective value either, the default applies.
  return s.value == null ? { value: coll.inherit[f].default } : s;
}
function viaLinks(coll, row, f, seen) {
  const rule = coll.inherit[f];
  if (row[rule.own] != null) return { value: row[rule.own], href: `/${nameOf(coll)}/${row.id}` };
  for (const r of rule.from) { // the first relationship with a link decides (11.6)
    const to = db[coll.relations[r].to], target = row[r] && to.rows.get(row[r].id);
    if (!target || seen.has(target)) continue;
    seen.add(target);
    return to.inherit?.[f] ? source(to, target, f, seen) : { value: target[f], href: `/${nameOf(to)}/${target.id}` };
  }
  return { value: undefined };
}
// 11.6, combine: fields: each member of an object resolved on its own, one level deep. A member the own
// object lacks or sets to null takes the inherited member, from wherever it actually comes.
function memberSource(coll, row, f, m, seen = new Set()) {
  const rule = coll.inherit[f];
  if (row[rule.own]?.[m] != null) return { value: row[rule.own][m], href: `/${nameOf(coll)}/${row.id}` };
  for (const r of rule.from) {
    const to = db[coll.relations[r].to], target = row[r] && to.rows.get(row[r].id);
    if (!target || seen.has(target)) continue;
    seen.add(target);
    const s = to.inherit?.[f] ? memberSource(to, target, f, m, seen) : { value: target[f]?.[m], href: `/${nameOf(to)}/${target.id}` };
    return s.value == null ? { value: undefined } : s;
  }
  return { value: undefined };
}
// The effective value of f and its entry in _inherited, if it does not come wholly from the own field.
function effective(coll, row, f) {
  const rule = coll.inherit[f];
  if (rule.combine !== 'fields') return source(coll, row, f);
  const value = {}, fields = {};
  for (const m of Object.keys(coll.shapes[f])) {
    const s = memberSource(coll, row, f, m);
    if (s.value == null) continue;
    value[m] = s.value;
    if (row[rule.own]?.[m] == null) fields[m] = { from: s.href ? { href: s.href } : 'default' };
  }
  return { value: Object.keys(value).length ? value : undefined, fields: Object.keys(fields).length ? fields : undefined };
}
// 11.1: the item actions a collection or singleton declares that the row's current state allows, as _actions.
// A collection with item actions always lists them, {} where none is available (absent means not computed).
function actionsOf(coll, row, href) {
  const declared = Object.entries(coll.actions ?? {}).filter(([, a]) => (a.on ?? 'item') === 'item');
  if (!declared.length) return undefined;
  const available = declared.filter(([, a]) => !a.available || a.available(row));
  return Object.fromEntries(available.map(([n, a]) => [n, { method: a.method ?? 'POST', href: `${href}:${n}` }]));
}
function refresh(only) { // only: a single row, for a test that leaves the rest stale
  for (const coll of Object.values(db)) {
    if (!coll.inherit) {
      if (coll.parent) continue; // no subcollection declares item actions
      for (const row of coll.rows.values()) {
        const actions = actionsOf(coll, row, `/${nameOf(coll)}/${row.id}`);
        if (actions) { delete row._actions; row._actions = actions; }
      }
      continue;
    }
    for (const row of coll.rows.values()) {
      if (only && row !== only) continue;
      const why = {};
      // A merge patch deletes what it sets to null; an own field and a link still read as null.
      for (const f of Object.values(coll.inherit).map((i) => i.own)) row[f] ??= null;
      for (const [f, rel] of Object.entries(coll.relations ?? {})) row[f] ??= rel.many ? [] : null;
      for (const f of Object.keys(coll.inherit)) {
        if (coll.inherit[f].combine === 'fields') {
          const e = effective(coll, row, f);
          if (e.value === undefined) delete row[f]; else row[f] = e.value;
          if (e.fields) why[f] = { fields: e.fields }; // members from the own object are not listed
          continue;
        }
        const s = source(coll, row, f);
        if (s.value === undefined) delete row[f]; else row[f] = s.value;
        if (row[coll.inherit[f].own] == null) why[f] = { from: s.href ? { href: s.href } : 'default' };
      }
      // Always in the same order, so the ETag (7.2) only changes when a value does: the declared fields,
      // then _inherited, after the fields it explains.
      const all = { ...row };
      for (const k of Object.keys(row)) delete row[k];
      for (const k of Object.keys(coll.types)) if (k in all) row[k] = all[k];
      row._inherited = why;
      // 11.1: the actions available to the item in its current state, after the fields; they count in its ETag.
      const actions = actionsOf(coll, row, `/${nameOf(coll)}/${row.id}`);
      if (actions) row._actions = actions;
    }
  }
}
// 11.6 and 5.1: the effective field is read-only. Its current value (in a POST, the one that would result)
// is ignored; another gives read_only, naming the own field. Either way it leaves the body.
const same = (a, b) => (a == null || b == null ? a == null && b == null
  : typeof a === 'string' && typeof b === 'string' && DECIMAL.test(a) && DECIMAL.test(b) ? cmpDecimal(a, b) === 0
  : typeof a === 'object' && typeof b === 'object' ? canonical(a) === canonical(b) : a === b);
function inheritErrors(coll, body, current) {
  const errors = [];
  for (const [f, rule] of Object.entries(coll.inherit ?? {})) {
    if (!(f in body)) continue;
    let now;
    try { now = current ? current[f] : effective(coll, { ...body, id: '' }, f).value; } catch { now = undefined; }
    if (!same(body[f], now)) errors.push({ pointer: ptr(f), code: 'read_only',
      detail: t(`${f} is the effective value; write ${rule.own}.`, `${f} es el valor efectivo; escribe en ${rule.own}.`) });
    delete body[f];
  }
  return errors;
}
// 5.1: the other read-only fields: those only the server sets, those a singleton declares read-only, and
// localized fields (3). In a POST, a field only the server sets is ignored whatever its value, and any other
// with the value the item would get; in a PATCH, the current value is ignored (for a localized field, its
// text in any language this API offers). Another value gives read_only. Either way it leaves the body.
function readOnlyErrors(coll, body, current) {
  const errors = [];
  const fields = [...(coll.server_set ?? []), ...(coll.read_only ?? []), ...Object.keys(coll.localized ?? {})];
  for (const f of fields) {
    if (!(f in body)) continue;
    const loc = coll.localized?.[f];
    const now = loc ? LANGUAGES.map((l) => localizedText((current ?? body)[loc.source], l)) : [current?.[f]];
    const ignored = (!current && coll.server_set?.includes(f)) || now.some((v) => same(body[f], v));
    if (!ignored) errors.push({ pointer: ptr(f), code: 'read_only', detail: loc
      ? t(`${f} is read-only: write ${loc.source}.`, `${f} es de solo lectura: escribe en ${loc.source}.`)
      : t(`${f} is read-only.`, `${f} es de solo lectura.`) });
    delete body[f];
  }
  return errors;
}

// ── Localized fields (3, 5.6) ─────────────────────────────────────────────────
// A localized field is the text of its source map in the language of the response; where the map lacks it,
// the text of another language this API offers (a MAY of 3), or null. Each language is a representation of
// its own, so the language counts in its ETag (LANG, read by etag()).
const LANG = Symbol('language');
const localizedText = (map, lang) => (isObject(map) ? map[lang] ?? LANGUAGES.map((l) => map[l]).find((v) => typeof v === 'string') ?? null : null);
function present(coll, row, lang) {
  if (!coll.localized || !row) return row;
  const out = {};
  for (const f of Object.keys(coll.types)) {
    if (coll.localized[f]) out[f] = localizedText(row[coll.localized[f].source], lang);
    else if (f in row) out[f] = row[f];
  }
  for (const k of Object.keys(row)) if (k.startsWith('_')) out[k] = row[k];
  return Object.defineProperty(out, LANG, { value: lang });
}
// 7.2: If-Match on an item with localized fields succeeds with the current item ETag of any language: the
// header as the plain item ETag when it lists one of them, so the usual comparison applies.
function sameItem(coll, row, header) {
  if (!coll.localized || header === undefined || !row) return header;
  return LANGUAGES.some((l) => strongMatch(header, etag(present(coll, row, l)))) ? etag(row) : header;
}
// The headers of a response that carries localized fields or depends on them (5.6).
const languageHeaders = (coll, lang) => (coll.localized ? { Vary: 'Accept-Language', 'Content-Language': lang } : {});

// ── Inherited items (11.6) ────────────────────────────────────────────────────
// A subcollection that declares inherit_items lists its own items and those of the same subcollection under
// the item its parent links through from, already resolved: an own item replaces an inherited one with the
// same key. Reads see both; writes reach only the own ones (an inherited one gives 409 before any write).
class Listed extends Map {
  set(k, v) { this.own?.set(k, v); return super.set(k, v); }
  delete(k) { this.own?.delete(k); return super.delete(k); }
}
function resolvedItems(sub, parentId, seen = new Set()) {
  const decl = sub.inherit_items, parents = db[sub.parent].rows, parent = parents.get(parentId);
  const out = [...(sub.byParent.get(parentId)?.values() ?? [])];
  // While the switch is off, nothing comes from above; absent, it has its initial value.
  if (!parent || seen.has(parentId) || (parent[decl.switch.field] ?? decl.switch.initial) === false) return out;
  seen.add(parentId);
  const keyOf = (x) => canonical(decl.key.map((k) => x[k] ?? null));
  for (const r of decl.from) { // the first relationship with a link decides
    const to = parent[r]?.id;
    if (to === undefined || !parents.has(to)) continue;
    const taken = new Set(out.map(keyOf));
    for (const item of resolvedItems(sub, to, seen)) {
      if (taken.has(keyOf(item))) continue;
      const from = item._from?.href ?? `${expandPath(sub, to)}/${item.id}`; // its actual source
      const [, c, l] = hrefPattern(sub).exec(from);
      const { id, _from, ...fields } = item;
      out.push({ id: `in-${c}-${l}`, ...fields, _from: { href: from } });
    }
    break;
  }
  return out;
}
// 3 and 5.1: a relationship is an object with its id (and type, where it can point to several collections,
// and href, where its target is a subcollection), a list of them, or null. Only those members are read, and
// it must point at an item that exists, or else an unknown entry at its id. A link that would make an item
// its own ancestor is rejected (11.6).
const linkOf = (rel, v) => ({ id: v.id, ...(Array.isArray(rel.to) && { type: v.type }), ...(isObject(v) && typeof v.href === 'string' && targets(rel).some((n) => db[n]?.parent) && { href: v.href }) });
const linkKey = (rel, v) => JSON.stringify(v == null ? null : rel.many ? (Array.isArray(v) ? v.map((x) => isObject(x) ? linkOf(rel, x) : x) : v) : isObject(v) ? linkOf(rel, v) : v);
function linkErrors(errors, r, rel, v, where) {
  if (!isObject(v) || typeof v.id !== 'string') {
    errors.push({ pointer: where, code: 'type', detail: t(`${r} must be an object with an id.`, `${r} tiene que ser un objeto con un id.`) });
    return v;
  }
  if (Array.isArray(rel.to) && !rel.to.includes(v.type)) {
    errors.push({ pointer: `${where}/type`, code: 'format', detail: t(`type must be one of: ${rel.to.join(', ')}.`, `type tiene que ser uno de: ${rel.to.join(', ')}.`) });
    return v;
  }
  const toName = Array.isArray(rel.to) ? v.type : rel.to, to = db[toName];
  if (to.parent && (typeof v.href !== 'string' || !hrefPattern(to).test(v.href) || hrefPattern(to).exec(v.href)[2] !== v.id)) {
    errors.push({ pointer: `${where}/href`, code: 'format', detail: t(`href must be the path of an item of ${toName} ending in its id.`, `href tiene que ser la ruta de un ítem de ${toName} que acaba en su id.`) });
    return v;
  }
  const target = lookup(toName, v);
  if (!target) errors.push({ pointer: `${where}/id`, code: 'unknown', detail: t(`There is no ${toName} ${v.id}.`, `No hay ningún ${toName} ${v.id}.`) });
  // 5.1: a relationship that declares media_types links only files of those types.
  else if (rel.media_types && !rel.media_types.some((m) => mediaMatch(m, target._content?.media_type)))
    errors.push({ pointer: `${where}/id`, code: 'format', detail: t(`${r} takes a file of type ${rel.media_types.join(' or ')}.`, `${r} admite un fichero de tipo ${rel.media_types.join(' o ')}.`) });
  return linkOf(rel, v);
}
function relationErrors(coll, body, id, current) {
  const errors = [];
  for (const [r, rel] of Object.entries(coll.relations ?? {})) {
    if (!(r in body) || body[r] === null) continue;
    // 5.1: a link to the current item leaves the field as it was, so it is ignored without looking it up.
    if (current && linkKey(rel, body[r]) === linkKey(rel, current[r])) { body[r] = current[r]; continue; }
    if (rel.many) {
      if (!Array.isArray(body[r])) { errors.push({ pointer: ptr(r), code: 'type', detail: t(`${r} must be a list of objects with an id.`, `${r} tiene que ser una lista de objetos con un id.`) }); continue; }
      body[r] = body[r].map((v, i) => linkErrors(errors, r, rel, v, `${ptr(r)}/${i}`));
      continue;
    }
    body[r] = linkErrors(errors, r, rel, body[r], ptr(r));
    if (rel.to === nameOf(coll.base ?? coll) && id !== undefined && isObject(body[r])) {
      for (let at = body[r].id, hops = 0; at && hops <= coll.rows.size; at = coll.rows.get(at)?.[r]?.id, hops++)
        if (at === id) { errors.push({ pointer: ptr(r), code: 'cycle', detail: t(`${r} would make ${id} its own ancestor.`, `${r} haría de ${id} su propio antecesor.`) }); break; }
    }
  }
  return errors;
}
// Deleting an item unlinks whoever pointed at it, so they inherit from the next in their chain (11.6).
function unlink(coll, id) {
  const name = nameOf(coll.base ?? coll);
  for (const other of Object.values(db))
    for (const [r, rel] of Object.entries(other.relations ?? {})) {
      if (!targets(rel).includes(name)) continue;
      const hit = (v) => v?.id === id && (!Array.isArray(rel.to) || v.type === name);
      for (const [k, row] of other.rows) {
        if (rel.many && Array.isArray(row[r]) && row[r].some(hit)) other.rows.set(k, { ...row, [r]: row[r].filter((v) => !hit(v)) });
        else if (!rel.many && hit(row[r])) other.rows.set(k, { ...row, [r]: null });
      }
    }
}
let nextId = 100;
// 5.1: who chooses the id. An id the client sends must be well formed (3); the server picks the next number
// that the collection has never had.
const ID = /^[A-Za-z0-9._~-]{1,64}$/;
function idErrors(coll, body) {
  const from = coll.id_from ?? 'server';
  if (!('id' in body)) return from === 'client' ? [{ pointer: '/id', code: 'required', detail: t('Choose the id of the new item.', 'Elige el id del ítem nuevo.') }] : [];
  if (from === 'server') return [{ pointer: '/id', code: 'read_only', detail: t('The server assigns id.', 'El servidor asigna el id.') }];
  if (typeof body.id !== 'string') return [{ pointer: '/id', code: 'type', detail: t('id must be a string.', 'id tiene que ser una cadena.') }];
  if (!ID.test(body.id) || body.id === '.' || body.id === '..')
    return [{ pointer: '/id', code: 'format', detail: t('id takes 1 to 64 of A-Z a-z 0-9 - . _ ~, and is not . or ..', 'id lleva de 1 a 64 de A-Z a-z 0-9 - . _ ~, y no es . ni ..') }];
  // 5.1: a format of the collection's own, which its create schema states.
  if (coll.id_pattern && !new RegExp(coll.id_pattern.source).test(body.id)) return [{ pointer: '/id', code: 'format', detail: coll.id_pattern.text }];
  if (coll.id_of && !db[coll.id_of].rows.has(body.id))
    return [{ pointer: '/id', code: 'unknown', detail: t(`The id is that of one of the ${coll.id_of}; there is no ${body.id}.`, `El id es el de uno de ${coll.id_of}; no hay ningún ${body.id}.`) }];
  return [];
}
function newId(coll) {
  let id;
  do id = String(nextId++); while (coll.used.has(id));
  return id;
}
// 5.1 and 5.4: 409 conflict once the body is valid: an id the collection has or has had, or a repeated
// unique field (as the server compares it, 6.1).
function conflicts(coll, row, self) {
  // With reusable_ids, used holds only the ids items have now: the id of a deleted one is free again.
  if (self === undefined && coll.used.has(row.id))
    return new Problem(409, 'conflict', t('That id is taken.', 'Ese id ya está cogido.'), { errors: [{ pointer: '/id', code: 'taken', detail: t('An item of this collection has or had this id.', 'Un ítem de esta colección tiene o tuvo este id.') }] });
  for (const f of coll.unique ?? []) {
    const clash = [...coll.rows.values()].find((r) => r.id !== self && !r._from && r[f] != null && row[f] != null && compare('string', r[f], row[f], coll.collations?.[f]) === 0);
    if (clash) return new Problem(409, 'conflict', t(`Another item has that ${f}.`, `Otro ítem tiene ese ${f}.`), { errors: [{ pointer: ptr(f), code: 'duplicate', detail: t(`${f} is unique.`, `${f} es único.`) }] });
  }
  return null;
}
// 5.5: the headers of the responses of a resource retired whole: here, an action. A notice that retires part of
// a resource (a sort key, a filter) is announced in discovery only, and puts nothing in responses.
const epoch = (instant) => `@${Math.floor(Date.parse(instant) / 1000)}`;
function deprecationHeaders(coll, action) {
  const notice = (coll.deprecations ?? []).find((d) => d.kind === 'action' && d.name === action);
  return notice ? { Deprecation: epoch(notice.announced), ...(notice.sunset && { Sunset: new Date(notice.sunset).toUTCString() }),
    Link: `${link}, <${SPEC}#versions>; rel="deprecation"` } : {};
}

// ── core: responses and errors ────────────────────────────────────────────────
const link = `<${PROFILE}>; rel="profile"`; // 4.1: one fixed link; discovery says what is implemented
// 4.2: the documentation for people, on the discovery response. This API's documentation is the specification.
const DOCS = `<${SPEC}>; rel="service-doc"; hreflang="en"; title="Restep 1, the specification", <https://restep.wubytes.com/es/1/>; rel="service-doc"; hreflang="es"`;
const hash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 16);
// Strong ETag of an item's state: always over the whole item, whatever fields were asked for (7.2).
// A localized representation (present()) carries its language, so each language has its own (5.6).
const etag = (value) => `"${hash(JSON.stringify(value) + (value?.[LANG] ? ` ${value[LANG]}` : ''))}"`;

function send(res, status, data, headers = {}, head = false) {
  const body = data === undefined ? '' : JSON.stringify(data);
  // 5.1: with credentials, every response depends on them, so it is private.
  const cc = headers['Cache-Control'];
  if (TOKEN && cc && !cc.includes('no-store')) headers = { ...headers, 'Cache-Control': `private, ${cc.replace(/^public, /, '')}` };
  const type = status >= 400 ? 'application/problem+json' : 'application/json';
  res.writeHead(status, { Link: link, ...(body && { 'Content-Type': type }), ...headers });
  res.end(head ? undefined : body);
}

// detail, and the detail of each entry in errors, are texts: t(english, spanish).
class Problem extends Error {
  constructor(status, code, detail, extra = {}, headers = {}) { super(text(detail, 'en')); Object.assign(this, { status, code, detail, extra, headers }); }
}
const TITLES = {
  400: t('Bad request', 'Petición incorrecta'), 401: t('Unauthenticated', 'Sin autenticar'), 404: t('Not found', 'No encontrado'),
  405: t('Method not allowed', 'Método no permitido'), 409: t('Conflict', 'Conflicto'), 412: t('The resource has changed', 'El recurso ha cambiado'),
  413: t('Content too large', 'Contenido demasiado grande'), 415: t('Unsupported media type', 'Tipo de contenido no admitido'),
  422: t('Invalid data', 'Datos no válidos'), 428: t('Precondition required', 'Precondición obligatoria'), 500: t('Internal error', 'Error interno'),
};
// 5.4: every code this server sends is the one the table gives its case; it sends no status outside the
// table, which would take http_ and its three digits. 428, like 429, 431 and 511, carries no-store, as every
// error here does, and no field aimed at shared caches.
// 5.6: an error's texts follow Accept-Language, so every error says so in Vary, in the default language too.
function problem(res, p, req) {
  const lang = pickLanguage(req.headers['accept-language']);
  const extra = p.extra.errors ? { ...p.extra, errors: p.extra.errors.map((e) => ({ ...e, detail: text(e.detail, lang) })) } : p.extra;
  send(res, p.status, {
    type: `${PROFILE}errors#${p.code}`, title: text(TITLES[p.status] ?? 'Error', lang), status: p.status,
    code: p.code, detail: text(p.detail, lang), ...extra,
  }, { 'Cache-Control': 'no-store', Vary: 'Accept-Language', 'Content-Language': lang, ...req.extra, ...p.headers }, req.method === 'HEAD'); // 8 and 5.1: errors to GET carry Cache-Control too
}

const bad = (parameter, detail) => new Problem(400, 'invalid_parameter', detail, { parameter });
const unsupported = (parameter, detail = t(`This resource does not support ${parameter}.`, `Este recurso no admite ${parameter}.`)) =>
  new Problem(400, 'unsupported_parameter', detail, { parameter });
const invalid = (errors, detail = t('Invalid data.', 'Datos no válidos.')) => new Problem(422, 'invalid', detail, { errors });
const once = (key) => bad(key, t(`Send ${key} once.`, `Envía ${key} una sola vez.`));

// 4.3: JSON Schemas of an item and of the bodies of POST and PATCH, built from the same types,
// required fields and enum values that validate() checks, so a body they reject gets a 422.
// Their description annotations are texts too (5.6).
function schemas(c, lang) {
  // A language map: lowercase well-formed tags; in a PATCH, null deletes a translation (3).
  const map = (patch) => ({ type: 'object', propertyNames: { pattern: TAG.source },
    additionalProperties: { type: patch ? ['string', 'null'] : 'string' },
    description: text(t('Translations, by language tag in lowercase, such as {"en": "…", "es-mx": "…"}.',
      'Traducciones, por etiqueta de idioma en minúsculas, como {"en": "…", "es-mx": "…"}.'), lang) });
  const json = (f, kind) => {
    const t = c.types[f];
    return t === 'decimal' ? { type: 'string', pattern: DECIMAL.source, description: text(DECIMAL_TEXT, lang) }
      : t === 'enum' ? { type: 'string', enum: c.values[f] } : t === 'map' ? map(kind === 'update')
      : t === 'relation' ? linkSchema(c.relations[f]) : t === 'datetime' ? { type: 'string', format: 'date-time' }
      : t === 'localdatetime' ? { type: 'string', pattern: LOCALDATETIME.source, description: text(LOCALDATETIME_TEXT, lang) }
      : t === 'localized' ? { type: 'string' }
      : t === 'object' ? { type: 'object', properties: Object.fromEntries(Object.entries(c.shapes[f]).map(([m, mt]) =>
        [m, kind === 'update' ? { type: [mt, 'null'] } : { type: mt }])), additionalProperties: false }
      : { type: t };
  };
  // 5.1: fields only the server sets, declared read-only, and localized fields are readOnly in every schema.
  const fixed = new Set([...(c.server_set ?? []), ...(c.read_only ?? []), ...Object.keys(c.localized ?? {})]);
  const localizedNote = (f) => c.localized?.[f] && text(t(`${c.localized[f].source} in the language of the response; read-only.`,
    `${c.localized[f].source} en el idioma de la respuesta; de solo lectura.`), lang);
  // 11.6: the effective field is read-only (a write with its current value is ignored); the own one is written.
  const inherited = (f, s) => {
    const rule = c.inherit?.[f];
    if (rule) return { ...s, readOnly: true, description: text(t(`Effective value, read-only: to change it, write ${rule.own}.`, `Valor efectivo, de solo lectura: para cambiarlo, escribe en ${rule.own}.`), lang) };
    const of = Object.keys(c.inherit ?? {}).find((e) => c.inherit[e].own === f);
    return of ? { ...s, description: text(t(`Own value of ${of}; null means it inherits.`, `Valor propio de ${of}; null significa que lo hereda.`), lang) } : s;
  };
  const fields = Object.keys(c.types).filter((f) => f !== 'id');
  // A map is never null when read and cannot be null in a POST; in a PATCH, null empties it (3).
  const props = (kind) => Object.fromEntries(fields.map((f) => {
    const s = inherited(f, json(f, kind));
    Object.assign(s, fixed.has(f) && { readOnly: true }, localizedNote(f) && { description: localizedNote(f) },
      kind === 'create' && c.defaults && Object.hasOwn(c.defaults, f) && { default: c.defaults[f] }); // 4.3: a default has an effect
    const nullable = isMap(c, f) ? kind === 'update' : !c.required.includes(f);
    if (!nullable) return [f, s];
    // readOnly and the description stay next to the property, where 5.1 looks for readOnly.
    const { readOnly, description, default: initial, ...rest } = s;
    return [f, { ...(readOnly && { readOnly }), ...(description !== undefined && { description }), ...(initial !== undefined && { default: initial }),
      anyOf: [rest, { type: 'null' }] }];
  }));
  const reserved = { '^_': {} }; // members starting with _ are ignored on writes (5.1)
  // 5.9: a singleton has no id and is never created.
  // A singleton's id, if it carries one, is read-only (5.9).
  const ownId = Object.hasOwn(c.types, 'id') && { id: { type: 'string', readOnly: true } };
  if (!ownId || !c.item_methods) return {
    item: { type: 'object', required: c.required, properties: { ...ownId, ...props('item') } },
    update: { type: 'object', description: text(t('A JSON Merge Patch: absent leaves a field untouched, null deletes it.',
      'Un JSON Merge Patch: lo ausente no cambia, null lo borra.'), lang), properties: { ...ownId, ...props('update') }, patternProperties: reserved, additionalProperties: false },
  };
  // 5.1 and 4.3: where the client may choose the id, the create schema says its format.
  const own = (c.id_from ?? 'server') !== 'server';
  const idProp = { id: { type: 'string', pattern: c.id_pattern?.source ?? ID.source, description: text(t('The id the client chooses, if it chooses one.', 'El id que elige el cliente, si lo elige.'), lang) } };
  return {
    item: { type: 'object', required: ['id', ...c.required], properties: { id: { type: 'string', readOnly: true }, ...props('item') } },
    // 5.1: schemas.create announces creation from JSON. A collection with upload declares it exactly when it
    // creates items from JSON; /files only takes uploads, so it has none.
    ...(!c.upload && { create: { type: 'object', required: [...(c.id_from === 'client' ? ['id'] : []), ...c.required], properties: { ...(own && idProp), ...props('create') },
      patternProperties: reserved, additionalProperties: false } }),
    update: {
      type: 'object', description: text(t('A JSON Merge Patch: absent leaves a field untouched, null deletes it.',
        'Un JSON Merge Patch: lo ausente no cambia, null lo borra.'), lang),
      properties: { id: { type: 'string', description: text(t('If present, the item\'s own id.', 'Si está, el id del propio ítem.'), lang) }, ...props('update') },
      patternProperties: reserved, additionalProperties: false,
    },
  };
}
// 3: a relationship object, with type where it can point to several collections and href to a subcollection.
function linkSchema(rel) {
  const poly = Array.isArray(rel.to), sub = targets(rel).some((n) => db[n]?.parent);
  const one = { type: 'object', required: ['id', ...(poly ? ['type'] : []), ...(sub ? ['href'] : [])],
    properties: { id: { type: 'string' }, ...(poly && { type: { enum: rel.to } }), ...(sub && { href: { type: 'string' } }) } };
  return rel.many ? { type: 'array', items: one } : one;
}
const DECIMAL_TEXT = t('A decimal in a string, such as "18.50".', 'Un decimal en una cadena, como "18.50".');
// 3: an RFC 3339 date-time with an offset; T and Z may come in lowercase, and this server writes them in uppercase.
const DATETIME = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;
// 3: a local date-time, full-date "T" partial-time of RFC 3339, without an offset.
const LOCALDATETIME = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?$/;
const LOCALDATETIME_TEXT = t('A local date-time without an offset, such as "2026-11-28T18:30:00".', 'Una fecha y hora local sin desfase, como "2026-11-28T18:30:00".');
let lastStamp = 0;
// The instant of a write, in uppercase and with milliseconds, never twice the same: each incarnation of an id
// that comes back (reusable_ids, 5.1) gets its own, and so its own item ETag (7.2).
const stamp = () => new Date(lastStamp = Math.max(Date.now(), lastStamp + 1)).toISOString();

// ── Typed comparison (6.1): exact decimals, numbers, text by code points ──────
const DECIMAL = /^-?\d+(\.\d+)?$/;
function cmpDecimal(a, b) { // exact: compares digit strings, never through Number
  const neg = (s) => s.startsWith('-') && /[1-9]/.test(s); // -0 and 0 are the same number
  if (neg(a) !== neg(b)) return neg(a) ? -1 : 1;
  const sign = neg(a) ? -1 : 1;
  const [ai, af = ''] = a.replace('-', '').split('.'), [bi, bf = ''] = b.replace('-', '').split('.');
  if (!neg(a) && !neg(b) && !/[1-9]/.test(a + b)) return 0;
  const i1 = ai.replace(/^0+(?=\d)/, ''), i2 = bi.replace(/^0+(?=\d)/, '');
  if (i1.length !== i2.length) return sign * (i1.length - i2.length);
  if (i1 !== i2) return sign * (i1 < i2 ? -1 : 1);
  const n = Math.max(af.length, bf.length), f1 = af.padEnd(n, '0'), f2 = bf.padEnd(n, '0');
  return f1 === f2 ? 0 : sign * (f1 < f2 ? -1 : 1);
}
function cmpText(a, b) { // by Unicode code points, not UTF-16 units (6.1)
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}
// 6.1: "server", this API's collation for some string fields: case and accents do not count. Equality and
// order agree (equal exactly when neither goes before the other); ties are broken by id when sorting.
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function compare(type, a, b, collation) {
  if (type === 'decimal') return cmpDecimal(String(a), String(b));
  // 6.1: a filter operand is the exact decimal of what was written (parseValue), compared with the stored number
  // as it is written in the representation, so 4.60000000000000000001 is greater than 4.6.
  if (type === 'integer' || type === 'number') return typeof a === 'number' && typeof b === 'number' ? a - b : cmpDecimal(exactNumber(a), exactNumber(b));
  if (collation === 'server') return cmpText(fold(String(a)), fold(String(b)));
  return cmpText(String(a), String(b));
}
// 6.1 and 11.1: an integer or number operand follows the number grammar of RFC 8259 (section 6), exponent
// included: 2e1 is 20, and +20, .5, 020 and 0x14 do not match. Whether it has no fractional part is
// worked out on its digits, without floating point: 20.0 and 2e1 are integers, 20.5 and 205e-1 are not.
const NUMBER = /^-?(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([-+]?\d+))?$/;
function wholeNumber(raw) {
  const m = NUMBER.exec(raw);
  if (!m) return false;
  const digits = m[1] + (m[2] ?? ''), point = m[1].length + Number(m[3] ?? 0); // the decimal point after shifting
  return !/[1-9]/.test(digits.slice(Math.max(point, 0)));
}
// 5.3 and 6.1: a limit this API does not declare. A numeric operand is compared exactly, however far it falls
// outside the range of the field, up to this many digits written out in full, without exponent (1e400 has 401);
// over it, invalid_parameter with the limit in detail, never an infinity or zero in its place.
const MAX_DIGITS = 1000;
function fullDigits(raw) { // how many digits raw has written out in full, without leading or trailing zeros
  const m = NUMBER.exec(raw);
  let digits = m[1] + (m[2] ?? ''), point = m[1].length + Number(m[3] ?? 0);
  const lead = digits.length - digits.replace(/^0+/, '').length;
  digits = digits.slice(lead).replace(/0+$/, '');
  point -= lead;
  if (!digits) return 1;
  return point <= 0 ? digits.length - point : Math.max(point, digits.length);
}
const exactNumber = (v) => (typeof v === 'number' ? canonicalNumber(String(v)) : v); // String(4.6) is "4.6"
// Parses a filter value from the URL according to the field's type; a mismatch is invalid_parameter.
// 6.1: an operand of an integer field is valid when its exact value has no fractional part (20.0 is 20).
// The params of a GET action, and each element of a list, follow the same rule (11.1). With exact, a filter's
// integer or number operand is its exact decimal, in one form (canonicalNumber), and never goes through Number.
function parseValue(type, raw, key, exact = false) {
  if (type === 'decimal' && DECIMAL.test(raw)) return raw;
  if ((type === 'integer' || type === 'number') && NUMBER.test(raw) && fullDigits(raw) > MAX_DIGITS)
    throw bad(key, t(`A numeric operand takes at most ${MAX_DIGITS} digits written out in full.`, `Un operando numérico admite como mucho ${MAX_DIGITS} cifras escrito por completo.`));
  if (type === 'integer' && wholeNumber(raw)) return exact ? canonicalNumber(raw) : Number(raw);
  if (type === 'number' && NUMBER.test(raw)) return exact ? canonicalNumber(raw) : Number(raw);
  if (type === 'string') return raw;
  if (Array.isArray(type)) {
    if (type.includes(raw)) return raw;
    throw bad(key, t(`${raw} is not one of: ${type.join(', ')}.`, `${raw} no es ninguno de: ${type.join(', ')}.`));
  }
  throw bad(key, t(`${raw} is not a valid ${type}.`, `${raw} no es un ${type} válido.`));
}
const OPS = {
  eq: (c) => c === 0, ne: (c) => c !== 0, lt: (c) => c < 0, le: (c) => c <= 0, gt: (c) => c > 0, ge: (c) => c >= 0,
};

// ── query: filters, sorting, fields, pagination and counts ───────────────────
const RESERVED = ['filter', 'sort', 'fields', 'include', 'count', 'limit', 'cursor', 'since', 'languages'];
const reservedName = (k) => k.replace(/\[.*$/, '');
const isReserved = (base) => RESERVED.includes(base) || base.startsWith('$');

// 6.3 and 9: only the fields asked for, plus id and the _ members. author.name projects an included
// relationship: its object keeps id (and type and href) and that field.
function pick(row, fields) {
  if (!fields) return row;
  const out = { id: row.id };
  for (const f of fields) if (!f.includes('.') && f in row) out[f] = row[f];
  for (const f of fields.filter((x) => x.includes('.'))) {
    const m = f.slice(0, f.indexOf('.')), rest = f.slice(f.indexOf('.') + 1);
    if (fields.includes(m) || row[m] == null) continue;
    const keep = (v, prev) => ({ ...prev, ...pick(v, [rest]), ...Object.fromEntries(['type', 'href'].filter((k) => k in v).map((k) => [k, v[k]])) });
    const project = (v, prev) => (isObject(v) ? keep(v, prev) : v);
    out[m] = Array.isArray(row[m]) ? row[m].map((v, i) => project(v, out[m]?.[i])) : project(row[m], out[m]);
  }
  if (row._actions) out._actions = row._actions; // 6.3: fields keeps the _ members
  // 11.6: _inherited only speaks of the effective fields in the response.
  const why = isObject(row._inherited) ? Object.entries(row._inherited).filter(([f]) => f in out) : [];
  if (why.length) out._inherited = Object.fromEntries(why);
  return out;
}
function parseFields(params, coll, include = []) {
  if (params.getAll('fields').length > 1) throw once('fields');
  const raw = params.get('fields');
  if (raw === null) return null;
  const fields = raw.split(',');
  for (const f of fields) {
    // 6.3: a language map is one field, asked for whole.
    if (f.includes('.') && isMap(coll, f.split('.')[0]))
      throw bad('fields', t(`${f.split('.')[0]} is a language map: ask for it whole.`, `${f.split('.')[0]} es un mapa de idioma: pídelo entero.`));
    if (f.includes('.')) { fieldPath(coll, f, include); continue; }
    if (!Object.hasOwn(coll.types, f)) throw bad('fields', t(`There is no field ${f || '(empty)'}.`, `No hay ningún campo ${f || '(vacío)'}.`));
  }
  return fields;
}
// 9: a dotted path in fields goes through a relationship that include expands, to a field of its target.
function fieldPath(coll, f, include, prefix = '') {
  const dot = f.indexOf('.'), m = f.slice(0, dot), rest = f.slice(dot + 1);
  const rel = coll.relations?.[m];
  if (!rel) throw bad('fields', t(`There is no relationship ${prefix}${m}.`, `No hay ninguna relación ${prefix}${m}.`));
  if (!include.includes(`${prefix}${m}`)) throw bad('fields', t(`${prefix}${m} is not in include.`, `${prefix}${m} no está en include.`));
  if (rest.includes('.')) return fieldPath(db[rel.to], rest, include, `${prefix}${m}.`); // include never goes deeper through several targets
  // With several targets, a field of any of them (6.3: absent from the items of the others).
  if (!targets(rel).some((to) => Object.hasOwn(db[to].types, rest)))
    throw bad('fields', t(`${targets(rel).join(' and ')} have no field ${rest}.`, `${targets(rel).join(' y ')} no tienen ningún campo ${rest}.`));
}
// 9: include lists declared, expandable relationships, as dotted paths no deeper than include_depth
// (1 if not declared). Each path counts with its prefixes: include=category.parent also expands category.
function parseInclude(params, coll) {
  if (params.getAll('include').length > 1) throw once('include');
  const raw = params.get('include');
  if (raw === null) return [];
  const paths = new Set();
  for (const p of raw.split(',')) {
    const segs = p.split('.');
    if (segs.length > (coll.include_depth ?? 1))
      throw unsupported('include', t(`include goes ${coll.include_depth ?? 1} level(s) deep here.`, `include llega a ${coll.include_depth ?? 1} nivel(es) aquí.`));
    let c = coll;
    segs.forEach((seg, i) => {
      const rel = c?.relations?.[seg];
      if (!rel || !rel.include || (Array.isArray(rel.to) && i < segs.length - 1))
        throw unsupported('include', t(`${segs.slice(0, i + 1).join('.')} cannot be included.`, `${segs.slice(0, i + 1).join('.')} no se puede incluir.`));
      paths.add(segs.slice(0, i + 1).join('.'));
      c = db[rel.to];
    });
  }
  return [...paths];
}
// 9: fills each included relationship with the whole related item, keeping id, type and href. One that
// points to nothing (or that this principal could not see) stays as it is.
function expand(row, coll, include, prefix = '') {
  const here = include.filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('.'));
  if (!here.length) return row;
  const out = { ...row };
  for (const p of here) {
    const r = p.slice(prefix.length), rel = coll.relations[r];
    const fill = (v) => {
      const toName = Array.isArray(rel.to) ? v?.type : rel.to, target = lookup(toName, v);
      return target ? { ...expand(target, db[toName], include, `${p}.`), ...v } : v;
    };
    out[r] = rel.many ? (row[r] ?? []).map(fill) : row[r] == null ? row[r] : fill(row[r]);
  }
  return out;
}

const SAME_FILTER = t('The same filter appears twice.', 'El mismo filtro aparece dos veces.');
const MAX_IN = 500;
function applyFilters(coll, params) {
  let items = [...coll.rows.values()].map((r) => present(coll, r, coll.lang)); // 6.1: localized fields in the response's language
  const seen = new Set();
  const groups = new Map(); // 6.1: to-many path → { tests on one related item, null }
  for (const [key, value] of params) {
    if (reservedName(key) !== 'filter') continue;
    if (key === 'filter') throw unsupported(key, t('filter as an expression needs the filter-expr extension.', 'filter como expresión necesita la extensión filter-expr.'));
    const m = key.match(/^filter\[([^\]]+)\](?:\[([^\]]+)\])?$/);
    if (!m) throw unsupported(key, t('This resource supports filter[field] and filter[field][op].', 'Este recurso admite filter[campo] y filter[campo][op].'));
    const [, field, op = 'eq'] = m;
    const named = coll.named_filters && Object.hasOwn(coll.named_filters, field) ? coll.named_filters[field] : null;
    if (named) { // 6.1: no operators; a switch takes no value, a typed one needs one of its type
      if (m[2] !== undefined) throw unsupported(key, t(`${field} is a named filter: it takes no operator.`, `${field} es un filtro con nombre: no lleva operador.`));
      if (seen.has(field)) throw bad(key, SAME_FILTER);
      seen.add(field);
      // 6.1: false turns a default switch off (it does not negate it); on any other switch it is a value.
      if (named.default && value === 'false') continue;
      if (!named.type && value !== '') throw bad(key, t(`${field} is a switch: it takes no value.`, `${field} es un interruptor: no lleva valor.`));
      if (named.type && value === '') throw bad(key, t(`${field} needs a ${named.type} value.`, `${field} necesita un valor ${named.type}.`));
      const v = named.type ? parseValue(named.type, value, key) : undefined;
      items = items.filter((r) => named.apply(r, v));
      continue;
    }
    if (!Object.hasOwn(coll.filter ?? {}, field)) throw unsupported(key);
    if (!coll.filter[field].includes(op)) throw unsupported(key, t(`${field} supports: ${coll.filter[field].join(', ')}.`, `${field} admite: ${coll.filter[field].join(', ')}.`));
    if (seen.has(`${field}[${op}]`)) throw bad(key, SAME_FILTER);
    seen.add(`${field}[${op}]`);
    const type = typeOf(coll, field); // an enum parses as its list of values
    const collation = coll.collations?.[field];
    let test; // whether a value, absent and null included, matches
    if (op === 'null') {
      if (value !== 'true' && value !== 'false') throw bad(key, t('Use true or false.', 'Usa true o false.'));
      test = (x) => (x === undefined || x === null) === (value === 'true');
    } else if (op === 'in' || op === 'nin') {
      // 6.1: filter[f][in]= is an empty list; an empty element between commas is the empty string.
      if (value === '') throw bad(key, t(`${op} needs a non-empty, comma-separated list.`, `${op} necesita una lista no vacía, separada por comas.`));
      const values = value.split(',');
      // 5.3: a limit this API does not declare. Over it, the whole request fails: never part of it.
      if (values.length > MAX_IN) throw bad(key, t(`${op} takes at most ${MAX_IN} values.`, `${op} admite como mucho ${MAX_IN} valores.`));
      const parsed = values.map((v) => parseValue(type, v, key, true));
      // nin: none of them; like every operator but null, never an absent or null value.
      test = (x) => x != null && parsed.some((v) => compare(type, x, v, collation) === 0) === (op === 'in');
    } else if (op === 'prefix' || op === 'contains') {
      if (value === '') throw bad(key, t(`${op} needs a non-empty operand.`, `${op} necesita un operando no vacío.`));
      // By code points, or with this API's collation, consistent with its eq (6.1).
      const norm = (x) => (collation === 'server' ? fold(String(x)) : String(x));
      test = (x) => x != null && (op === 'prefix' ? norm(x).startsWith(norm(value)) : norm(x).includes(norm(value)));
    } else {
      const v = parseValue(type, value, key, true);
      test = (x) => x != null && OPS[op](compare(type, x, v, collation));
    }
    // 6.1: a path through a to-many relationship declared with quantifier some joins its group.
    const group = Object.keys(coll.some ?? {}).find((g) => field === g || field.startsWith(`${g}.`));
    if (group) {
      if (!groups.has(group)) groups.set(group, { tests: [], none: undefined, nulls: 0 });
      // 6.1: one null filter per group at most, on the relationship or on a path through it, even when they agree.
      if (op === 'null' && groups.get(group).nulls++)
        throw bad(key, t(`Only one null filter on ${group} or a path through it.`, `Solo un filtro null sobre ${group} o un camino que pase por ella.`));
      if (field === group) groups.get(group).none = value === 'true';
      else {
        const rest = field.slice(group.length + 1), target = db[coll.relations?.[group]?.to ?? coll.sub_relations[group].to];
        groups.get(group).tests.push((el) => test(at(el, rest, target)));
      }
      continue;
    }
    items = items.filter((r) => test(at(r, field, coll)));
  }
  // 6.1: some related item the principal can see matches every filter of the group; null=true on the
  // relationship negates the group (no visible related item matches all the other filters of the group at
  // once), and alone means none at all.
  for (const [g, { tests, none }] of groups) {
    const some = (r) => coll.some[g](r).some((el) => tests.every((x) => x(el)));
    items = items.filter((r) => (none === true ? !some(r) : some(r)));
  }
  // 6.1: a default switch applies to every list request that does not turn it off.
  for (const [name, named] of Object.entries(coll.named_filters ?? {}))
    if (named.default && !seen.has(name)) items = items.filter((r) => named.apply(r));
  return items;
}

function parseSort(coll, params) {
  if (params.getAll('sort').length > 1) throw once('sort');
  const sort = (params.get('sort') ?? 'id').split(',');
  for (const s of sort) {
    const f = s.replace(/^-/, '');
    if (!f) throw bad('sort', t('Empty sort key.', 'Clave de orden vacía.'));
    if (!coll.sort.includes(f)) throw unsupported('sort', t(`${f} is not sortable. Sortable: ${coll.sort.join(', ')}.`, `${f} no se puede ordenar. Se puede por: ${coll.sort.join(', ')}.`));
  }
  return sort;
}

// A cursor is opaque to clients but bound to the collection, filters and sort it was issued for (6.4),
// not to what each page carries: limit, fields, include and count may change between pages.
// 6.1: operands equal under the field's type are the same filter, also for the cursor: numeric operands
// enter the print in one form (20, 20.0 and 2e1 alike).
const PAGE_ONLY = ['cursor', 'limit', 'fields', 'include', 'count'];
const queryPrint = (path, params, coll) => {
  const q = [...params].filter(([k]) => !PAGE_ONLY.includes(k)).map(([k, v]) => [k, sameOperand(coll, k, v)]).sort();
  return hash(`${path}?${new URLSearchParams(q)}`);
};
function sameOperand(coll, key, value) {
  const m = coll && key.match(/^filter\[([^\]]+)\](?:\[([^\]]+)\])?$/);
  const type = m && Object.hasOwn(coll.filter ?? {}, m[1]) ? typeOf(coll, m[1]) : null;
  if (!['integer', 'number', 'decimal'].includes(type) || m[2] === 'null') return value;
  return value.split(',').map((v) => (NUMBER.test(v) ? canonicalNumber(v) : v)).join(',');
}
// A number written in decimal, in one form: no exponent, no leading zeros, no trailing zeros in the fraction.
function canonicalNumber(raw) {
  const m = NUMBER.exec(raw), neg = raw.startsWith('-');
  if (fullDigits(raw) > MAX_DIGITS) return raw; // over the limit, which parseValue refuses: kept as written
  let digits = m[1] + (m[2] ?? ''), point = m[1].length + Number(m[3] ?? 0);
  if (point < 0) { digits = '0'.repeat(-point) + digits; point = 0; }
  if (point > digits.length) digits = digits.padEnd(point, '0');
  const int = digits.slice(0, point).replace(/^0+/, '') || '0', frac = digits.slice(point).replace(/0+$/, '');
  const out = frac ? `${int}.${frac}` : int;
  return neg && out !== '0' ? `-${out}` : out;
}
const CURSOR_KEY = randomBytes(32); // cursors are signed, so a tampered one is rejected
const sign = (text) => createHmac('sha256', CURSOR_KEY).update(text).digest('base64url').slice(0, 22);
const makeCursor = (o, print) => {
  const payload = Buffer.from(JSON.stringify({ o, q: print })).toString('base64url');
  return `${payload}.${sign(payload)}`;
};
function readCursor(params, print) {
  if (!params.has('cursor')) return 0;
  let c = {};
  const parts = params.get('cursor').split('.');
  const [payload, mac] = parts;
  if (parts.length === 2 && mac === sign(payload)) {
    try { c = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch {}
  }
  if (!Number.isInteger(c.o) || c.o < 0 || c.q !== print) throw bad('cursor', t('Invalid or expired cursor, or one issued for another query.', 'Cursor no válido o caducado, o emitido para otra consulta.'));
  return c.o;
}

function list(coll, params, path) {
  let items = applyFilters(coll, params);
  const sort = parseSort(coll, params);
  // 6.2: a to-many path declared with quantifier sorts by the least value among the related items, or with -,
  // the greatest; items without any go last.
  const key = (r, f, desc) => {
    const g = Object.keys(coll.some ?? {}).find((x) => f.startsWith(`${x}.`));
    if (!g) return at(r, f, coll);
    const target = db[coll.relations?.[g]?.to ?? coll.sub_relations[g].to], rest = f.slice(g.length + 1);
    const values = coll.some[g](r).map((el) => at(el, rest, target)).filter((v) => v != null);
    return values.reduce((best, v) => (best === undefined || compare(typeOf(coll, f), v, best) * (desc ? -1 : 1) < 0 ? v : best), undefined);
  };
  items.sort((a, b) => {
    for (const s of [...sort, 'id']) {
      const f = s.replace(/^-/, '');
      const x = key(a, f, s.startsWith('-')), y = key(b, f, s.startsWith('-'));
      if (x == null || y == null) { if (x == null && y == null) continue; return x == null ? 1 : -1; } // missing values last
      const d = compare(typeOf(coll, f), x, y, coll.collations?.[f]) * (s.startsWith('-') ? -1 : 1);
      if (d) return d;
    }
    return 0;
  });
  if (params.getAll('limit').length > 1) throw once('limit');
  const limit = params.has('limit') ? Number(params.get('limit')) : Math.min(20, coll.max_limit);
  if (!/^\d+$/.test(params.get('limit') ?? '1') || !Number.isInteger(limit) || limit < 1 || limit > coll.max_limit)
    throw bad('limit', t(`Between 1 and ${coll.max_limit}.`, `Entre 1 y ${coll.max_limit}.`));
  // 6.4: with localized fields, a cursor is bound to the language of the response too.
  const print = queryPrint(coll.localized ? `${path} ${coll.lang}` : path, params, coll);
  const offset = readCursor(params, print);
  const count = params.get('count');
  if (count !== null && !coll.count) throw unsupported('count'); // 6.5: any value, false included
  if (count !== null && count !== 'true' && count !== 'false') throw bad('count', t('Use true or false.', 'Usa true o false.'));
  const include = parseInclude(params, coll);
  const fields = parseFields(params, coll, include);
  const page = items.slice(offset, offset + limit);
  let next = null;
  if (offset + limit < items.length) {
    const q = new URLSearchParams(params);
    q.set('cursor', makeCursor(offset + limit, print));
    next = `${path}?${q}`; // always starts with "/" (section 3)
  }
  return {
    // 7.2: each item carries the ETag of its whole row, the same one its own GET gives, whatever fields were asked for.
    items: page.map((r) => ({ ...pick(expand(r, coll, include), fields), _etag: etag(r) })), next,
    ...(count === 'true' && { total: items.length }),
    ...(count === 'true' && coll.count === 'estimated' && { total_estimated: true }),
  };
}

// ── writes: body, Merge Patch, conditional requests and Idempotency-Key ──────
// 3: the media type of a body, compared without case. charset must be utf-8, quoted or not, in any case;
// other parameters are ignored. A body without Content-Type, even an empty one, is refused.
function mediaTypeOk(header, types) {
  if (header === undefined) return false;
  const [type, ...params] = header.split(';');
  if (!types.includes(type.trim().toLowerCase())) return false;
  for (const p of params) {
    const eq = p.indexOf('=');
    if (eq < 0 || p.slice(0, eq).trim().toLowerCase() !== 'charset') continue;
    let value = p.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\(.)/g, '$1');
    if (value.toLowerCase() !== 'utf-8') return false;
  }
  return true;
}
// actionBody: 11.1, an empty body to a POST action is {}, with or without Content-Type.
async function readJson(req, types, actionBody = false) {
  if (actionBody) {
    const raw = [];
    for await (const chunk of req) raw.push(chunk);
    if (!Buffer.concat(raw).length) return [{}, {}];
    req.bodyText = Buffer.concat(raw).toString();
  }
  if (!mediaTypeOk(req.headers['content-type'], types))
    throw new Problem(415, 'unsupported_media_type', t(`Send ${types.join(' or ')}, in UTF-8.`, `Envía ${types.join(' o ')}, en UTF-8.`), {},
      types.includes('application/merge-patch+json') ? { 'Accept-Patch': 'application/merge-patch+json' } : {});
  let text = req.bodyText ?? '';
  if (!actionBody) for await (const chunk of req) text += chunk;
  let v;
  try { v = JSON.parse(text); } catch {
    throw new Problem(400, 'bad_request', t('The body is not valid JSON.', 'El cuerpo no es JSON válido.'));
  }
  // 3: a body is an I-JSON message; JSON.parse keeps the last of two members with the same name.
  const dup = duplicateName(text);
  if (dup !== null) throw new Problem(400, 'bad_request', t(`The body repeats the member ${dup} in an object.`, `El cuerpo repite el miembro ${dup} en un objeto.`),
    { errors: [{ pointer: '', code: 'format', detail: t('Duplicate member names (RFC 7493).', 'Nombres de miembro repetidos (RFC 7493).') }] });
  // [what the write applies, the body as sent, for the idempotency fingerprint]. Members starting with _ belong to
  // Restep (_etag, _actions): a write ignores them (5.1). A JSON value that is not an object is kept as it is:
  // it gives 422, after the preconditions (5.4), where the handler calls objectBody().
  if (!isObject(v)) return [v, v];
  const out = Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')));
  // 3: an unpaired surrogate, a noncharacter or U+0000 gives 422 invalid with a format entry, also after the
  // preconditions: objectBody() throws it. Its pointer is the string that holds it; for a member name, which no
  // pointer names, "". A JSON syntax error came first, above, with 400 (5.4).
  const odd = oddStrings(v);
  if (odd.length) BAD_TEXT.set(out, odd.map((pointer) => ({ pointer, code: 'format',
    detail: t('An unpaired surrogate, a noncharacter or U+0000 (RFC 7493).', 'Un sustituto suelto, un no carácter o U+0000 (RFC 7493).') })));
  return [out, v];
}
const BAD_TEXT = new WeakMap(); // a body as readJson() returns it → its format entries
const ODD = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uFDD0-\uFDEF\uFFFE\uFFFF\u0000]|[\uD83F\uD87F\uD8BF\uD8FF\uD93F\uD97F\uD9BF\uD9FF\uDA3F\uDA7F\uDABF\uDAFF\uDB3F\uDB7F\uDBBF\uDBFF][\uDFFE\uDFFF]/;
// The pointers of the strings in a JSON value that are not I-JSON (RFC 7493, 2.1): "" for a member name.
function oddStrings(v, at = '') {
  if (typeof v === 'string') return ODD.test(v) ? [at] : [];
  if (Array.isArray(v)) return v.flatMap((x, i) => oddStrings(x, `${at}/${i}`));
  if (!isObject(v)) return [];
  return Object.entries(v).flatMap(([k, x]) => [...(ODD.test(k) ? [''] : []), ...oddStrings(x, at + ptr(k))]);
}
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// The first member name repeated in an object of a valid JSON text, or null. It walks the text once,
// keeping the names seen in each open object; strings are decoded with JSON.parse, so escapes compare.
function duplicateName(text) {
  const stack = []; // per open container: a Set of names for an object, null for an array
  let expectKey = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      if (expectKey) {
        const name = JSON.parse(text.slice(i, j + 1)), names = stack.at(-1);
        if (names.has(name)) return name;
        names.add(name);
        expectKey = false;
      }
      i = j;
    } else if (c === '{') { stack.push(new Set()); expectKey = true; }
    else if (c === '[') stack.push(null);
    else if (c === '}' || c === ']') { stack.pop(); expectKey = false; }
    else if (c === ',') expectKey = stack.at(-1) instanceof Set;
  }
  return null;
}
// ── Uploads (5.1) ─────────────────────────────────────────────────────────────
// A media range of upload or of a relationship's media_types (type/subtype, type/* or */*) against a media type.
const mediaMatch = (range, type) => typeof type === 'string' && (range === type || range === '*/*' || (range.endsWith('/*') && type.startsWith(range.slice(0, -1))));
const fileBytes = new Map(); // a file's id → its bytes, served at /files/{id}/content, outside Restep (5.9)
// A 1×1 transparent PNG: the bytes of the file in the data.
fileBytes.set('f1', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
db.files.rows.get('f1')._content.size = fileBytes.get('f1').length;
// RFC 6266: the file's name, from filename* (RFC 8187, UTF-8 only) or filename; null if there is none.
function fileName(disposition) {
  if (!disposition) return null;
  const ext = /;\s*filename\*\s*=\s*utf-8'[^']*'([^;]+)/i.exec(disposition);
  if (ext) { try { return decodeURIComponent(ext[1].trim()); } catch { return null; } }
  const plain = /;\s*filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]+))/i.exec(disposition);
  return plain ? (plain[1] ?? plain[2]).replace(/\\(.)/g, '$1') : null;
}
// The body of a POST to a collection that declares upload: the bytes of one file, raw or in the one part,
// named file, of a multipart/form-data body (RFC 7578). The collections that declare upload here declare no create,
// so a raw body is a file exactly when its media type matches upload.media_types: application/json too, where they
// admit it, also by a wildcard (application/* or */*), and +json types such as application/ld+json like any other
// type (5.1). /files admits only image/*, so a JSON body gives 415 like any media type it does not declare, as do a
// body without Content-Type and another multipart body. An outer multipart/form-data always selects multipart upload,
// and gives 415 where upload.multipart is not true, even when media_types matches it (*/*). Each 415 carries
// Accept-Post with the media types it takes (5.1, W3C LDP 1.0, 7.1). The file part may come without filename: it
// is the file all the same, without a name (5.1). A file larger than max_size gives 413 content_too_large.
async function readUpload(req, upload) {
  const header = req.headers['content-type'] ?? '';
  const type = header.split(';')[0].trim().toLowerCase();
  const accepted = [...upload.media_types, ...(upload.multipart ? ['multipart/form-data'] : [])].join(', ');
  const refuse = () => new Problem(415, 'unsupported_media_type', t(`Send a file of type ${upload.media_types.join(', ')}.`,
    `Envía un fichero de tipo ${upload.media_types.join(', ')}.`), {}, { 'Accept-Post': accepted });
  const multipart = type === 'multipart/form-data';
  if (multipart ? !upload.multipart : !upload.media_types.some((m) => mediaMatch(m, type))) throw refuse();
  const chunks = [];
  let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size <= upload.max_size + 65536) chunks.push(chunk); }
  let bytes = Buffer.concat(chunks), mediaType = type, name = fileName(req.headers['content-disposition']);
  if (multipart) {
    const boundary = /;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(header);
    if (!boundary) throw refuse();
    const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
    const parts = [];
    for (let at = bytes.indexOf(delimiter); at >= 0;) {
      const next = bytes.indexOf(delimiter, at + delimiter.length);
      if (next < 0) break;
      parts.push(bytes.subarray(at + delimiter.length + 2, next - 2)); // between the CRLFs around each part
      at = next;
    }
    const tail = bytes.indexOf(Buffer.concat([delimiter, Buffer.from('--')]));
    if (parts.length !== 1 || tail < 0) throw refuse();
    const split = parts[0].indexOf('\r\n\r\n');
    if (split < 0) throw refuse();
    const head = Object.fromEntries(parts[0].subarray(0, split).toString('latin1').split('\r\n').map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
    }));
    const disposition = head['content-disposition'] ?? '';
    mediaType = (head['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!/^form-data\s*;/i.test(disposition) || !/;\s*name\s*=\s*"?file"?\s*(;|$)/i.test(disposition)
      || !upload.media_types.some((m) => mediaMatch(m, mediaType))) throw refuse();
    name = fileName(disposition);
    bytes = parts[0].subarray(split + 4);
    size = bytes.length;
  }
  if (size > upload.max_size)
    throw new Problem(413, 'content_too_large', t(`A file takes at most ${upload.max_size} bytes.`, `Un fichero ocupa como mucho ${upload.max_size} bytes.`));
  // 7.1: two uploads are the same request when their bytes and media type are.
  return { bytes, mediaType, name, sent: { media_type: mediaType, sha256: createHash('sha256').update(bytes).digest('hex') } };
}
// 4.3 and 5.1: a body that is a JSON value but not an object gives 422 invalid, with a type entry at "".
// 3: one with strings that are not I-JSON, 422 invalid with a format entry for each.
function objectBody(v) {
  if (!isObject(v)) throw invalid([{ pointer: '', code: 'type', detail: t('The body must be a JSON object.', 'El cuerpo tiene que ser un objeto JSON.') }]);
  if (BAD_TEXT.has(v)) throw invalid([...new Map(BAD_TEXT.get(v).map((e) => [e.pointer, e])).values()]);
  return v;
}
function mergePatch(target, patch) { // RFC 7396, section 2
  if (!isObject(patch)) return patch;
  const out = isObject(target) ? { ...target } : {}; // a non-object target is replaced by {} first
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}
const ptr = (f) => `/${f.replace(/~/g, '~0').replace(/\//g, '~1')}`; // a JSON Pointer to a member (RFC 6901)
// errors: what languageErrors() already found in the body, so one 422 lists every failure.
function validate(coll, row, label, errors = []) {
  for (const f of coll.required) if (row[f] === undefined || row[f] === null) errors.push({ pointer: ptr(f), code: 'required', detail: t(`${f} is required.`, `${f} es obligatorio.`) });
  for (const [f, v] of Object.entries(row)) {
    if (f.startsWith('_')) continue; // _inherited, stored with the item (11.6)
    if (!Object.hasOwn(coll.types, f)) { errors.push({ pointer: ptr(f), code: 'unknown', detail: t(`There is no field ${f}.`, `No hay ningún campo ${f}.`) }); continue; }
    const type = coll.types[f];
    if (v === null || f === 'id' || type === 'map' || type === 'relation' || type === 'localized') continue; // maps and links: checked in the body, before merging
    if (type === 'object') { // an object of scalars (11.6): each member of its declared type
      if (!isObject(v)) { errors.push({ pointer: ptr(f), code: 'type', detail: t(`${f} must be an object.`, `${f} tiene que ser un objeto.`) }); continue; }
      for (const [m, x] of Object.entries(v)) {
        const mt = coll.shapes[f][m];
        if (!mt) errors.push({ pointer: ptr(f) + ptr(m), code: 'unknown', detail: t(`${f} has no member ${m}.`, `${f} no tiene ningún miembro ${m}.`) });
        else if (x !== null && !(mt === 'integer' ? Number.isInteger(x) : typeof x === 'string'))
          errors.push({ pointer: ptr(f) + ptr(m), code: 'type', detail: t(`${m} must be a ${mt}.`, `${m} tiene que ser de tipo ${mt}.`) });
      }
      continue;
    }
    const ok = type === 'decimal' ? typeof v === 'string' && DECIMAL.test(v)
      : type === 'integer' ? Number.isInteger(v) : type === 'number' ? typeof v === 'number'
      : type === 'boolean' ? typeof v === 'boolean' : type === 'datetime' ? typeof v === 'string' && DATETIME.test(v)
      : type === 'localdatetime' ? typeof v === 'string' && LOCALDATETIME.test(v) : typeof v === 'string';
    // 3: a server never writes a leap second, and rejects one in a request body, in an instant or a local date-time.
    if (ok && type === 'datetime' && v.slice(17, 19) === '60') {
      errors.push({ pointer: ptr(f), code: 'format', detail: t(`${f} has a leap second (:60).`, `${f} tiene un segundo intercalar (:60).`) });
      continue;
    }
    if (ok && type === 'localdatetime' && v.slice(17, 19) === '60') {
      errors.push({ pointer: ptr(f), code: 'format', detail: t(`${f} has a leap second (:60).`, `${f} tiene un segundo intercalar (:60).`) });
      continue;
    }
    if (ok && type === 'enum' && !coll.values[f].includes(v)) {
      errors.push({ pointer: ptr(f), code: 'format', detail: t(`${f} must be one of: ${coll.values[f].join(', ')}.`, `${f} tiene que ser uno de: ${coll.values[f].join(', ')}.`) });
      continue;
    }
    if (!ok) errors.push({ pointer: ptr(f), code: 'type', detail: t(`${f} must be a ${type}${type === 'decimal' ? ' in a string, such as "18.50"' : ''}.`,
      `${f} tiene que ser de tipo ${type}${type === 'decimal' ? ' en una cadena, como "18.50"' : ''}.`) });
  }
  if (errors.length) throw invalid(errors, label);
}
// 3: the language maps of a POST body (current undefined) or of a patch (current, the stored item),
// checked before merging, deleted keys included: one entry per failure.
function languageErrors(coll, body, current) {
  const errors = [];
  const patch = current !== undefined;
  for (const f of maps(coll).filter((m) => m in body)) {
    const v = body[f];
    if (v === null && patch) continue; // empties the map
    if (!isObject(v)) {
      errors.push({ pointer: ptr(f), code: 'type', detail: t(`${f} must be an object of translations, such as {"en": "…"}.`, `${f} tiene que ser un objeto de traducciones, como {"en": "…"}.`) });
      continue;
    }
    for (const [tag, s] of Object.entries(v)) {
      const where = ptr(f) + ptr(tag);
      const wellFormed = TAG.test(tag);
      if (!wellFormed) errors.push({ pointer: where, code: 'format', detail: t(`${tag} is not a well-formed language tag in lowercase.`, `${tag} no es una etiqueta de idioma bien formada en minúsculas.`) });
      if (s === null && patch) continue; // deletes that translation, or nothing if it is not there
      if (typeof s !== 'string') errors.push({ pointer: where, code: 'type', detail: t('A translation must be a string.', 'Una traducción tiene que ser una cadena.') });
      else if (wellFormed && !TAGS.includes(tag) && current?.[f]?.[tag] !== s)
        errors.push({ pointer: where, code: 'unknown', detail: t(`This API does not take ${tag}; it takes ${TAGS.join(', ')}.`, `Esta API no admite ${tag}; admite ${TAGS.join(', ')}.`) });
    }
  }
  return errors;
}
// A language map with no translations is {}, never absent or null (3).
const withMaps = (coll, row) => ({ ...row, ...Object.fromEntries(maps(coll).filter((f) => row[f] == null).map((f) => [f, {}])) });

// If-Match / If-None-Match lists (RFC 9110, 13.1): "*", strong and weak comparison.
const tags = (header) => (header ?? '').split(',').map((t) => t.trim()).filter(Boolean);
const strongMatch = (header, tag) => tags(header).some((t) => t === '*' || (!t.startsWith('W/') && t === tag));
const weakMatch = (header, tag) => tags(header).some((t) => t === '*' || t.replace(/^W\//, '') === tag);
const anyTag = (header) => tags(header).includes('*');

// Idempotency-Key: an sf-string (RFC 9651) without parameters, scoped to the principal and the target (7.1).
// Requests without credentials are one anonymous principal, whose keys work as anyone's.
const idempotency = new Map(); // scope → { print, response, expires }. In production: a durable store.
const TTL = 24 * 3600 * 1000;
function idempotencyScope(req, path) {
  const raw = req.headers['idempotency-key'];
  if (raw === undefined) return null;
  const m = raw.trim().match(/^"((?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\["\\])*)"$/);
  if (!m) throw new Problem(400, 'bad_request', t('Idempotency-Key must be a quoted string without parameters, such as "8e03978e-40d5".', 'Idempotency-Key tiene que ser una cadena entre comillas y sin parámetros, como "8e03978e-40d5".'),
    { errors: [{ header: 'Idempotency-Key', code: 'format', detail: t('Not a Structured Fields string without parameters.', 'No es una cadena de Structured Fields sin parámetros.') }] });
  const client = hash(req.headers.authorization ?? 'anonymous');
  return `${client} ${req.method} ${path} ${m[1]}`;
}
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : isObject(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  : JSON.stringify(v));
// 7.1: the fingerprint of a POST to a collection or an action: the query as [name, [values]] pairs, sorted by name
// (the order of different names does not count) with each name's values in the order received (theirs does).
function idempotencyQuery(params) {
  const byName = new Map();
  for (const [k, v] of params) byName.set(k, [...(byName.get(k) ?? []), v]);
  return [...byName].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
const fingerprint = (params, sent) => hash(canonical([idempotencyQuery(params), sent]));
// 7.1: a replay gives the stored status and Location, and a body that gives no more than a read would now:
// none once the item it carries no longer exists (deleted by that request or another), and no ETag where it
// had no body (7.3). A stored body that is no longer the item's current representation (written to since, by
// this request or another) goes without Content-Location, ETag and _etag, which would make a client take it as
// its new copy (7.1, 7.2).
function sendReplay(res, [status, data, headers], coll) {
  // A subcollection's rows as they are now: a view taken before an await keeps the map its parent's DELETE removed.
  const rows = coll?.parentId !== undefined ? coll.base.byParent.get(coll.parentId) : coll?.rows;
  // The item it carries, or, with return=minimal and no body, the one its Location names.
  const id = data?.id ?? (headers.Location ? decodeURIComponent(headers.Location.split('/').at(-1)) : undefined);
  const gone = id !== undefined && !rows?.has(id);
  if (!gone && isObject(data) && id !== undefined && !isCurrent(coll, rows.get(id), data._etag)) {
    const { ETag, 'Content-Location': place, ...rest } = headers, { _etag, ...body } = data;
    return send(res, status, body, { ...rest, 'Idempotent-Replayed': 'true' });
  }
  // 7.3: a 201 without a body (return=minimal) is replayed without ETag, even where the item still exists: the
  // stored one may no longer be current, and the current one was not produced by this request. The client
  // that needs a validator reads the item at Location.
  if (!gone && !(status === 201 && data === undefined)) return send(res, status, data, { ...headers, 'Idempotent-Replayed': 'true' });
  const { ETag, ...rest } = headers;
  return send(res, status, undefined, { ...rest, 'Idempotent-Replayed': 'true' });
}
// Whether a stored item ETag is still the item's, in some language where it has localized fields (7.2).
const isCurrent = (coll, row, tag) => (coll.localized ? LANGUAGES.some((l) => etag(present(coll, row, l)) === tag) : etag(row) === tag);
// The stored response for this scope and fingerprint, if it has not expired, as a replay. Its target is gone.
function replay(res, scope, print) {
  const saved = scope && idempotency.get(scope);
  if (!(saved?.expires > Date.now()) || saved.print !== print) return false;
  sendReplay(res, saved.response, null);
  return true;
}

// 7.2: every response whose body is one item carries its item ETag in _etag, computed without _etag.
const withEtag = (row) => ({ ...row, _etag: etag(row) });
// 8: cache groups (RFC 9875), named by path: the collection first, then its items, at most 32.
const groups = (paths) => paths.slice(0, 32).map((p) => `"${p}"`).join(', ');
// A write to an item also changes the items that inherit from it (11.6): their collections are invalidated too.
const heirs = (coll) => Object.entries(db).filter(([, o]) => o !== coll && o.inherit && Object.values(o.relations ?? {}).some((rel) => targets(rel).some((to) => db[to] === coll))).map(([n]) => `/${n}`);

// 4.3 and 5.1: HEAD goes with GET, and only with it. A list that leaves out GET gives 405 to HEAD too.
const withHead = (methods) => (methods.includes('GET') ? [...methods, 'HEAD'] : methods);

// 5.9: a singleton (the shop by default; also /me and a reader's settings). Its PATCH is a merge patch, as for
// an item; POST and DELETE give 405. shop.at is the path of one under a parent item.
async function handleShop(req, res, params, shop = SINGLETONS.shop) {
  const method = req.method, read = method === 'GET' || method === 'HEAD';
  const allow = withHead(shop.methods).join(', ');
  if (!allow.split(', ').includes(method))
    throw new Problem(405, 'method_not_allowed', t(`Supports ${allow}.`, `Admite ${allow}.`), {}, { Allow: allow });
  for (const key of new Set(params.keys())) {
    const base = reservedName(key);
    if (!isReserved(base)) continue;
    if (!read || base !== 'fields' || key !== base) throw unsupported(key); // include and the rest: outside this version
    if (params.getAll('fields').length > 1) throw once('fields');
  }
  const path = shop.at ?? shop.path;
  if (read) {
    const fields = parseFields(params, shop);
    const data = fields ? { ...pick(shop.row, fields), _etag: etag(shop.row) } : withEtag(shop.row);
    if (!Object.hasOwn(shop.types, 'id')) delete data.id; // a singleton's id, if it has one, stays (5.9)
    const headers = { ETag: fields ? etag(data) : etag(shop.row), 'Cache-Control': 'no-cache', 'Cache-Groups': groups([path]) };
    if (weakMatch(req.headers['if-none-match'], headers.ETag)) return send(res, 304, undefined, headers);
    return send(res, 200, data, headers, method === 'HEAD');
  }
  const [patch] = await readJson(req, ['application/merge-patch+json', 'application/json']);
  const current = shop.row;
  if (req.headers['if-match'] !== undefined && !strongMatch(req.headers['if-match'], etag(current)))
    throw new Problem(412, 'precondition_failed', t('Someone changed it: read it again before writing.', 'Alguien lo ha cambiado: vuelve a leerlo antes de escribir.'));
  if (weakMatch(req.headers['if-none-match'], etag(current)))
    throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current representation.', 'If-None-Match coincide con la representación actual.'));
  objectBody(patch);
  const strangers = Object.keys(patch).filter((f) => !Object.hasOwn(shop.types, f));
  if (strangers.length) throw invalid(strangers.map((f) => ({ pointer: ptr(f), code: 'unknown', detail: t(`There is no field ${f}.`, `No hay ningún campo ${f}.`) })));
  const errors = readOnlyErrors(shop, patch, current); // 5.1: its id and other read-only fields
  const row = mergePatch(current, patch);
  validate(shop, row, t('The result of the patch is not valid.', 'El resultado del parche no es válido.'), errors);
  shop.row = row;
  const prefer = /(^|[ ,;])return=minimal\b/.test(req.headers.prefer ?? '');
  return send(res, prefer ? 204 : 200, prefer ? undefined : withEtag(row), { ETag: etag(row), 'Cache-Group-Invalidation': groups([path]),
    ...(prefer && { 'Preference-Applied': 'return=minimal' }) });
}
// 5.9 and 11.1: an action of a singleton, at {path}:{name}. Its preconditions are evaluated against the
// singleton's ETag (7.2). verify_email changes nothing in the representation: 204, without ETag.
async function handleSingletonAction(req, res, params, shop, action, url) {
  const decl = Object.hasOwn(shop.actions ?? {}, action) ? shop.actions[action] : null;
  if (!decl) throw missing(url);
  const allow = decl.method === 'GET' ? ['GET', 'HEAD'] : ['POST'];
  if (!allow.includes(req.method))
    throw new Problem(405, 'method_not_allowed', t(`Supports ${allow.join(', ')}.`, `Admite ${allow.join(', ')}.`), {}, { Allow: allow.join(', ') });
  for (const key of new Set(params.keys())) if (isReserved(reservedName(key))) throw unsupported(key); // 5.3
  if (decl.method === 'GET') actionParams(decl, params); // 11.1: without params, any query parameter is unsupported
  // An idempotent action ignores Idempotency-Key, a malformed one included (11.1).
  const [body] = await readJson(req, ['application/json'], true);
  const tag = etag(shop.row);
  if (req.headers['if-match'] !== undefined && !strongMatch(req.headers['if-match'], tag))
    throw new Problem(412, 'precondition_failed', t('If-Match does not match the current representation.', 'If-Match no coincide con la representación actual.'));
  if (weakMatch(req.headers['if-none-match'], tag))
    throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current representation.', 'If-None-Match coincide con la representación actual.'));
  const errors = inputErrors(decl.input, objectBody(body));
  if (errors.length) throw invalid(errors);
  const [status] = decl.run(shop, shop.row, body);
  return send(res, status);
}

// ── actions (11.1) ────────────────────────────────────────────────────────────
// The body against an action's input schema: required members, integers with a minimum, strings, and
// no other members.
function inputErrors(schema, body) {
  if (!schema) return [];
  const errors = [];
  for (const f of schema.required ?? []) if (!(f in body)) errors.push({ pointer: ptr(f), code: 'required', detail: t(`${f} is required.`, `${f} es obligatorio.`) });
  for (const [f, v] of Object.entries(body)) {
    const p = schema.properties?.[f];
    if (!p) { errors.push({ pointer: ptr(f), code: 'unknown', detail: t(`This action takes no ${f}.`, `Esta acción no lleva ${f}.`) }); continue; }
    if (p.type === 'integer' && !Number.isInteger(v)) errors.push({ pointer: ptr(f), code: 'type', detail: t(`${f} must be an integer.`, `${f} tiene que ser un entero.`) });
    else if (p.type === 'integer' && v < (p.minimum ?? -Infinity)) errors.push({ pointer: ptr(f), code: 'range', detail: t(`${f} is at least ${p.minimum}.`, `${f} es como poco ${p.minimum}.`) });
    else if (p.type === 'string' && (typeof v !== 'string' || v.length < (p.minLength ?? 0))) errors.push({ pointer: ptr(f), code: 'type', detail: t(`${f} must be a non-empty string.`, `${f} tiene que ser una cadena no vacía.`) });
  }
  return errors;
}
// 11.1: the query parameters of a GET action against its params: an undeclared one gives unsupported_parameter,
// and so does every one where it declares no params, which is "params": {} (5.3); a required one missing, a value of another type, an empty list or a repeated parameter, invalid_parameter.
function actionParams(decl, params) {
  const args = {};
  for (const key of new Set(params.keys())) {
    const p = decl.params && Object.hasOwn(decl.params, key) ? decl.params[key] : null;
    if (!p) throw unsupported(key, t(`The ${key} parameter is not declared for this action.`, `El parámetro ${key} no está declarado para esta acción.`));
    if (params.getAll(key).length > 1) throw once(key);
    const raw = params.get(key);
    if (p.list && raw === '') throw bad(key, t(`${key} needs a non-empty, comma-separated list.`, `${key} necesita una lista no vacía, separada por comas.`));
    args[key] = p.list ? raw.split(',').map((v) => parseValue(p.type, v, key)) : parseValue(p.type, raw, key);
  }
  for (const [key, p] of Object.entries(decl.params ?? {}))
    if (p.required && !(key in args)) throw bad(key, t(`${key} is required.`, `${key} es obligatorio.`));
  return args;
}
async function handleAction(req, res, { url, params, coll, collPath, id, action }) {
  // An action the collection does not declare, or declared on the other kind of resource, does not exist.
  const decl = Object.hasOwn(coll.actions ?? {}, action) ? coll.actions[action] : null;
  if (!decl || decl.on !== (id === undefined ? 'collection' : 'item')) throw missing(url);
  // 5.4: a replay comes in place of the 404 of an item deleted since the first request, so a POST that can be
  // one is looked up first; any other request to a missing item gives 404 here.
  const gone = id !== undefined && !coll.rows.has(id);
  if (gone && (decl.method === 'GET' || decl.idempotent || req.headers['idempotency-key'] === undefined)) throw missing(url);
  req.extra = deprecationHeaders(coll, action); // 5.5: an action retired whole, on every response to it
  const allow = decl.method === 'GET' ? ['GET', 'HEAD'] : ['POST'];
  if (!allow.includes(req.method))
    throw new Problem(405, 'method_not_allowed', t(`Supports ${allow.join(', ')}.`, `Admite ${allow.join(', ')}.`), {}, { Allow: allow.join(', ') });
  for (const key of new Set(params.keys())) if (isReserved(reservedName(key))) throw unsupported(key); // 5.3
  if (decl.method === 'GET') {
    const args = actionParams(decl, params);
    const row = id === undefined ? null : coll.rows.get(id);
    // 11.1: with output, the result, which is not a representation: no _etag or _actions, its own ETag.
    const [status, data] = decl.run(coll, row, {}, args);
    const tag = etag(data);
    const headers = { ETag: tag, 'Cache-Control': 'no-cache', ...req.extra };
    if (weakMatch(req.headers['if-none-match'], tag)) return send(res, 304, undefined, headers);
    return send(res, status, data, headers, req.method === 'HEAD');
  }
  // 11.1 and 7.1: an idempotent action ignores Idempotency-Key, since repeating it is already safe; any other
  // applies 7.1 to it, as to any POST that is not idempotent.
  const scope = decl.idempotent ? null : idempotencyScope(req, url.pathname);
  const [body, sent] = await readJson(req, ['application/json'], true);
  // No await from here on: the check and the effect are atomic.
  const print = scope && fingerprint(params, sent);
  const saved = scope && idempotency.get(scope);
  const live = saved?.expires > Date.now() ? saved : null;
  if (live && live.print === print) return sendReplay(res, live.response, coll);
  // The item as it is now, not as it was before the body arrived: another PATCH or DELETE may have changed it.
  const row = id === undefined ? null : coll.rows.get(id);
  if (id !== undefined && !row) throw missing(url);
  // 11.1 and 5.4: an action the item's current state does not allow gives 409, which depends only on the
  // stored state and so comes before the preconditions (RFC 9110, section 13.2.1).
  if (row && decl.available && !decl.available(row))
    throw new Problem(409, 'conflict', t(`The ${action} action is not available in the item's current state.`, `La acción ${action} no está disponible en el estado actual del elemento.`));
  // 7.2: on an item, the target of the preconditions is the item; on the collection, its GET without parameters.
  const target = row ? etag(row) : etag(list(coll, new URLSearchParams(), collPath));
  if (req.headers['if-match'] !== undefined && !strongMatch(req.headers['if-match'], target))
    throw new Problem(412, 'precondition_failed', t('If-Match does not match the current representation.', 'If-Match no coincide con la representación actual.'));
  if (weakMatch(req.headers['if-none-match'], target))
    throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current representation.', 'If-None-Match coincide con la representación actual.'));
  if (live) throw new Problem(422, 'idempotency_mismatch', t('That Idempotency-Key was already used with a different request.', 'Esa Idempotency-Key ya se usó con otra petición.'));
  const errors = inputErrors(decl.input, objectBody(body));
  if (errors.length) throw invalid(errors);
  const [status, made] = decl.run(coll, row, body);
  refresh();
  // 11.1 and 7.2: the item the action changed (200, with Content-Location and its new ETag), a new one (201,
  // with Location) or nothing (204, without ETag).
  const changed = made && `${collPath}/${made.id}`;
  const response = status === 204 ? [204, undefined, { 'Cache-Group-Invalidation': groups([collPath, ...(row ? [`${collPath}/${id}`] : []), ...heirs(coll)]), ...req.extra }]
    : [status, withEtag(structuredClone(made)), { ETag: etag(made), ...(status === 201 ? { Location: changed } : { 'Content-Location': changed }),
      'Cache-Group-Invalidation': groups([collPath, changed, ...heirs(coll)]), ...req.extra }];
  if (scope) idempotency.set(scope, { print, response, expires: Date.now() + TTL });
  return send(res, ...response);
}

// ── Routing ───────────────────────────────────────────────────────────────────
// The collection a path names, with its path and, if any, the item's id. A subcollection is only reached
// under an item of its parent that exists; under one that does not, only a replay is (gone).
function resolve(url, segments) {
  const [name, id, sub, subId, ...more] = segments;
  const top = Object.hasOwn(db, name) && !db[name].parent ? db[name] : null;
  if (!top || more.length) throw missing(url);
  if (sub === undefined) return { coll: top, path: `/${name}`, id };
  const subName = subsOf(name).find((k) => db[k].path.endsWith(`}/${sub}`));
  if (!subName) throw missing(url);
  if (!top.rows.has(id)) return { gone: true, id: subId };
  return { coll: view(db[subName], id), path: expandPath(db[subName], id), id: subId };
}
const ONLY_READ = t('Only GET and HEAD.', 'Solo GET y HEAD.');
const missing = (url) => new Problem(404, 'not_found', t(`${url.pathname} does not exist.`, `${url.pathname} no existe.`));
async function handle(req, res) {
  refresh(); // 11.6: effective values, after any write (a DELETE may have unlinked items)
  req.extra = {}; // headers for every response to this request, errors included (5.5)
  const url = new URL(req.url, 'http://localhost');
  const params = url.searchParams;
  // 3: the path of an item is compared after percent-decoding, so /books/%37 is /books/7.
  let segments;
  // 5.1: item paths have no trailing slash, so /books/7/ is not /books/7.
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) throw missing(url);
  try { segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { throw missing(url); }
  const [name] = segments;
  const method = req.method;
  const read = method === 'GET' || method === 'HEAD';
  const prefer = /(^|[ ,;])return=minimal\b/.test(req.headers.prefer ?? '');
  const applied = prefer ? { 'Preference-Applied': 'return=minimal' } : {};

  // 4.4: the service status, outside the API (no profile links, no problem+json); public, it says only its status.
  if (url.pathname === STATUS) {
    if (!read) throw new Problem(405, 'method_not_allowed', ONLY_READ, {}, { Allow: 'GET, HEAD' });
    res.writeHead(200, { 'Content-Type': 'application/health+json', 'Cache-Control': 'no-store' });
    return res.end(method === 'HEAD' ? undefined : JSON.stringify({ status: 'pass' }));
  }
  // oauth (11.5): the metadata is public, is not a resource of the API and never gives 401.
  if (TOKEN && url.pathname === METADATA) {
    if (!read) throw new Problem(405, 'method_not_allowed', ONLY_READ, {}, { Allow: 'GET, HEAD' });
    const meta = { resource: `http://${req.headers.host}/`, authorization_servers: ['https://auth.example.com'],
      scopes_supported: ['books:read', 'books:write'], bearer_methods_supported: ['header'] };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
    return res.end(method === 'HEAD' ? undefined : JSON.stringify(meta));
  }
  const bearer = /^bearer +(\S+)$/i.exec(req.headers.authorization ?? ''); // the scheme ignores case (RFC 9110, 11.1)
  if (TOKEN && bearer?.[1] !== TOKEN) {
    // RFC 6750, 3: a challenge carries at least one parameter, and a wrong token says invalid_token.
    // Only the exact root points at the metadata: its resource is the root (RFC 9728, 3.3).
    const sent = bearer ? ', error="invalid_token"' : ''; // no error code for another scheme (RFC 6750, 3.1)
    const challenge = req.url !== '/' ? `Bearer realm="restep"${sent}`
      : `Bearer realm="restep", resource_metadata="http://${req.headers.host}${METADATA}"${sent}`;
    throw new Problem(401, 'unauthenticated', t('Send Authorization: Bearer with a valid token.', 'Envía Authorization: Bearer con un token válido.'), {}, { 'WWW-Authenticate': challenge });
  }

  if (!name) { // Discovery document, at the API root
    if (!read) throw new Problem(405, 'method_not_allowed', ONLY_READ, {}, { Allow: 'GET, HEAD' });
    for (const key of new Set(params.keys())) if (isReserved(reservedName(key))) throw unsupported(key);
    // 5.6: the descriptions follow Accept-Language; each language is its own representation, with its own ETag.
    // 4.2: nothing else changes it, so it is the same for everyone (with a token, it is private).
    const lang = pickLanguage(req.headers['accept-language']);
    const actionsDoc = (actions) => Object.fromEntries(Object.entries(actions).map(([a, d]) => [a, { ...(d.on && { on: d.on }), safe: d.safe, idempotent: d.idempotent,
      ...(d.method && { method: d.method }), description: text(d.description, lang), ...(d.effects && { effects: d.effects }), ...(d.input && { input: d.input }),
      ...(d.params && { params: Object.fromEntries(Object.entries(d.params).map(([k, p]) => [k, { type: p.type, ...(p.list && { list: true }),
        ...(p.required && { required: true }), ...(p.description && { description: text(p.description, lang) }) }])) }),
      ...(d.output && { output: d.output }) }])); // 11.1
    const collections = Object.fromEntries(Object.entries(db).map(([n, c]) => [n, {
      path: c.path ?? `/${n}`, ...(c.parent && { parent: c.parent }), description: text(c.description, lang), methods: c.methods, item_methods: c.item_methods,
      ...(c.method_effects && { method_effects: c.method_effects }), ...(c.item_method_effects && { item_method_effects: c.item_method_effects }), // 4.3
      ...(c.id_from && { id_from: c.id_from }), // 5.1
      ...(c.reusable_ids && { reusable_ids: true }), ...(c.upsert && { upsert: true }), ...(c.upload && { upload: c.upload }), // 5.1
      // 4.3: a collection without GET declares nothing about listing it.
      schemas: schemas(c, lang), ...(c.max_limit && { max_limit: c.max_limit }), ...(c.count && { count: c.count }), ...(c.sort && { sort: c.sort }),
      ...(c.filter && { filter: Object.fromEntries(Object.entries(c.filter).map(([f, ops]) => [f, { type: typeOf(c, f) instanceof Array ? 'enum' : typeOf(c, f),
        ...(c.types[f] === 'enum' ? { values: c.values[f] } : {}), ops,
        ...(f.includes('.') && Object.hasOwn(c.some ?? {}, f.split('.')[0]) && { quantifier: 'some' }), // 6.1: through a to-many relationship
        ...(c.notes?.[f] && { description: text(c.notes[f], lang) }) }])) }),
      ...(c.collations && { collations: c.collations }), // 6.1
      ...(c.named_filters && { named_filters: Object.fromEntries(Object.entries(c.named_filters).map(([f, n]) =>
        [f, { ...(n.type && { type: n.type }), ...(n.default && { default: true }), description: text(n.description, lang) }])) }),
      ...(maps(c).length && { language_maps: Object.fromEntries(maps(c).map((f) => [f, {}])) }), // 4.2: all of them
      ...(c.localized && { localized: c.localized }), // 3: each localized field and its source
      ...(c.local_times && { local_times: c.local_times }), // 3 and 4.2: local date-times and where their zone comes from
      // 9: each relationship, its target, whether it is to-many and whether include expands it; one that leads to a
      // subcollection carries its path, and one to uploaded files, the media types it takes (5.1).
      ...((c.relations || c.sub_relations) && { relations: Object.fromEntries(Object.entries({ ...c.relations, ...c.sub_relations }).map(([r, rel]) => [r,
        { to: rel.to, ...(rel.many && { many: true }), ...(rel.include && { include: true }), ...(rel.path && { path: rel.path }),
          ...(rel.media_types && { media_types: rel.media_types }) }])) }),
      ...(c.include_depth && { include_depth: c.include_depth }),
      ...(c.actions && { actions: actionsDoc(c.actions) }),
      ...(c.inherit && { inherit: Object.fromEntries(Object.entries(c.inherit).map(([f, i]) => [f,
        { own: i.own, from: i.from, default: i.default !== undefined, ...(i.combine && { combine: i.combine }), description: text(i.description, lang) }])) }),
      ...(c.inherit_items && { inherit_items: { from: c.inherit_items.from, key: c.inherit_items.key, switch: c.inherit_items.switch,
        description: text(c.inherit_items.description, lang) } }), // 11.6
      ...(c.deprecations && { deprecations: c.deprecations }), // 5.5
    }]));
    const singletons = { shop: { path: shop.path, methods: shop.methods, description: text(shop.description, lang), schemas: schemas(shop, lang) },
      me: { path: me.path, methods: me.methods, description: text(me.description, lang), schemas: schemas(me, lang), actions: actionsDoc(me.actions) },
      settings: { path: settings.path, parent: settings.parent, methods: settings.methods, description: text(settings.description, lang), schemas: schemas(settings, lang),
        method_effects: settings.method_effects } };
    // 5.4: this API has no domain reasons, and says so: an empty catalogue, complete like any other.
    // 5.6: the default language, which this API with localized fields declares.
    const doc = { restep: RESTEP, version: '1', default_language: LANGUAGES[0], profiles: PROFILES, extensions: EXTENSIONS, idempotency: { ttl: TTL / 1000 },
      status: STATUS, reasons: {}, collections, singletons };
    const headers = { ETag: etag([lang, doc]), 'Cache-Control': 'public, max-age=300', Vary: 'Accept-Language', 'Content-Language': lang, Link: `${link}, ${DOCS}` };
    if (weakMatch(req.headers['if-none-match'], headers.ETag)) return send(res, 304, undefined, headers);
    return send(res, 200, doc, headers, method === 'HEAD');
  }
  // 5.9: the bytes of an uploaded file, a resource outside Restep.
  if (segments.length === 3 && segments[0] === 'files' && segments[2] === 'content') return serveBytes(req, res, params, segments[1], url);
  // 5.9: the other singletons, /me (and its actions, /me:verify_email) and each reader's settings, which
  // gives 404 under a reader that does not exist.
  const decoded = `/${segments.join('/')}`, cut = decoded.lastIndexOf(':');
  const single = singletonAt(cut > 0 ? decoded.slice(0, cut) : decoded);
  if (single?.missing) throw missing(url);
  if (single && cut > 0) return handleSingletonAction(req, res, params, single, decoded.slice(cut + 1), url);
  if (single) return handleShop(req, res, params, single);
  if (url.pathname === shop.path) return handleShop(req, res, params);
  // A collection (/books), an item (/books/7), a subcollection under an item (/books/7/reviews) or one of
  // its items (/books/7/reviews/1). 5.4 leaves the order to the server: this one gives a missing parent or item
  // 404 before anything else is looked at.
  // 11.1: an action goes after a colon in the last segment (also as %3A, decoded above).
  const last = segments.at(-1), colon = last.indexOf(':');
  const action = colon > 0 ? last.slice(colon + 1) : undefined;
  let { coll, path: collPath, id, gone } = resolve(url, colon > 0 ? [...segments.slice(0, -1), last.slice(0, colon)] : segments);
  // 5.6: a collection with localized fields is seen in the language of the response.
  const lang = pickLanguage(req.headers['accept-language']);
  if (coll?.localized) {
    coll = Object.create(coll, { lang: { value: lang }, base: { value: coll } });
    req.extra = languageHeaders(coll, lang); // on every response about it, errors included
  }
  // 5.4 and 7.1: a replay comes in place of the 404 of a parent deleted since the first request, by it or by
  // another, so a POST to the subcollection with Idempotency-Key looks for its stored response first.
  if (gone) {
    if (action !== undefined || id !== undefined || method !== 'POST' || req.headers['idempotency-key'] === undefined) throw missing(url);
    const keyScope = idempotencyScope(req, url.pathname);
    const [, sent] = await readJson(req, ['application/json']);
    if (replay(res, keyScope, fingerprint(params, sent))) return;
    throw missing(url);
  }
  if (action !== undefined) return handleAction(req, res, { url, params, coll, collPath, id, action });
  // 5.1: a PATCH to a free id of a collection that declares upsert creates the item: no 404 applies to it.
  if (id !== undefined && method === 'PATCH' && coll.upsert && !coll.rows.has(id) && isFree(coll, id))
    return upsert(req, res, { url, params, coll, collPath, id });

  // 3: ids compare code point by code point, so /books/07 is not /books/7.
  if (id !== undefined && !coll.rows.has(id)) throw missing(url);

  // 5.4 leaves 405 or 400 to the server: this one reports an unsupported method before looking at its parameters.
  const methods = withHead(id === undefined ? coll.methods : coll.item_methods);
  if (!methods.includes(method))
    throw new Problem(405, 'method_not_allowed', t(`Supports ${methods.join(', ')}.`, `Admite ${methods.join(', ')}.`), {}, { Allow: methods.join(', ') });

  // 5.3: a reserved parameter this resource and method do not implement fails loudly. fields only on reads (6.3).
  const include = Object.values(coll.relations ?? {}).some((rel) => rel.include) ? ['include'] : []; // 9
  const allowed = !read ? [] : id === undefined ? ['filter', 'sort', 'fields', 'count', 'limit', 'cursor', ...include] : ['fields', ...include];
  for (const key of new Set(params.keys())) {
    const base = reservedName(key);
    if (!isReserved(base)) continue; // non-reserved parameters belong to the API
    if (!allowed.includes(base)) throw unsupported(key);
    if (base !== 'filter' && key !== base) throw unsupported(key); // only filter has bracketed forms
    if (params.getAll(key).length > 1) throw once(key);
  }
  const location = (r) => `${collPath}/${r.id}`;

  if (read) {
    let data, tag, paths;
    if (id === undefined) {
      data = list(coll, params, url.pathname); tag = etag(data);
      paths = [collPath, ...data.items.map((r) => location(r))];
    } else {
      const row = present(coll, coll.rows.get(id), lang), included = parseInclude(params, coll), fields = parseFields(params, coll, included);
      // The ETag header validates the representation sent; If-Match uses the item's ETag (7.2),
      // which every representation of the item carries in _etag.
      data = fields || included.length ? { ...pick(expand(row, coll, included), fields), _etag: etag(row) } : withEtag(row);
      tag = fields || included.length ? etag(data) : etag(row);
      paths = [location(row)];
    }
    const headers = { ETag: tag, 'Cache-Control': 'no-cache', 'Cache-Groups': groups(paths), ...req.extra };
    const itemTag = id === undefined ? tag : etag(present(coll, coll.rows.get(id), lang));
    if (req.headers['if-match'] !== undefined && !strongMatch(req.headers['if-match'], itemTag))
      throw new Problem(412, 'precondition_failed', t('If-Match does not match the current representation.', 'If-Match no coincide con la representación actual.'));
    if (weakMatch(req.headers['if-none-match'], tag)) return send(res, 304, undefined, headers);
    return send(res, 200, data, headers, method === 'HEAD');
  }

  if (id === undefined) {
    const scope = idempotencyScope(req, url.pathname);
    // 5.1: to a collection that declares upload, a body that is not JSON is the bytes of a file.
    const file = coll.upload ? await readUpload(req, coll.upload) : null; // 5.1: a file, never JSON
    const [body, sent] = file ? [{}, file.sent] : await readJson(req, ['application/json']);
    // From here to the end of the request there is no await: check and write are atomic.
    // 7.1: the same request is the same key, principal, target, query and body (as JSON values).
    const print = scope && fingerprint(params, sent);
    const saved = scope && idempotency.get(scope);
    const live = saved && saved.expires > Date.now() ? saved : null;
    // 7.1: a replay returns the stored response; preconditions were evaluated for the first request only.
    if (live && live.print === print) return sendReplay(res, live.response, coll);
    // 7.2: preconditions on a POST are evaluated against the ETag of the collection's GET without parameters.
    // 5.4: no 422 that depends on the content while a 412 applies, so they are checked before a key reused with another body.
    // A collection without GET has no current representation for anyone: * matches nothing, and neither does a tag.
    const collTag = coll.methods.includes('GET') ? etag(list(coll, new URLSearchParams(), url.pathname)) : null;
    if (collTag === null && req.headers['if-match'] !== undefined)
      throw new Problem(412, 'precondition_failed', t('This collection has no representation to match.', 'Esta colección no tiene ninguna representación con la que comparar.'));
    if (req.headers['if-match'] !== undefined && !strongMatch(req.headers['if-match'], collTag))
      throw new Problem(412, 'precondition_failed', t('If-Match does not match the current collection.', 'If-Match no coincide con la colección actual.'));
    if (collTag !== null && weakMatch(req.headers['if-none-match'], collTag))
      throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current collection.', 'If-None-Match coincide con la colección actual.'));
    if (live) throw new Problem(422, 'idempotency_mismatch', t('That Idempotency-Key was already used with a different request.', 'Esa Idempotency-Key ya se usó con otra petición.'));
    if (file) return storeFile(res, { coll, collPath, file, scope, print, prefer, applied });
    objectBody(body);
    validate(coll, body, undefined, [...idErrors(coll, body), ...readOnlyErrors(coll, body), ...languageErrors(coll, body), ...relationErrors(coll, body), ...inheritErrors(coll, body)]);
    const row = withMaps(coll, { ...body, id: 'id' in body ? body.id : newId(coll) });
    fillNew(coll, row);
    const conflict = conflicts(coll, row); // 5.4 leaves 422 or 409 to the server: this one gives 409 after 422
    if (conflict) throw conflict;
    coll.rows.set(row.id, row);
    coll.used.add(row.id);
    refresh();
    const shown = coll.localized ? present(coll, row, lang) : structuredClone(row);
    const response = [201, prefer ? undefined : withEtag(shown), { Location: location(row), ETag: etag(shown),
      'Cache-Group-Invalidation': groups([collPath, location(row), ...heirs(coll)]), ...req.extra, ...applied }];
    if (scope) idempotency.set(scope, { print, response, expires: Date.now() + TTL });
    return send(res, ...response);
  }

  const [patch] = method === 'PATCH' ? await readJson(req, ['application/merge-patch+json', 'application/json']) : [null];
  // No await from here on: the If-Match check and the write are atomic (7.2).
  const current = coll.rows.get(id);
  if (!current) throw missing(url); // 7.2: an item deleted meanwhile gives 404 whatever the preconditions say
  // 11.6 and 5.4: an inherited item cannot be written. That 409 depends only on the stored state, so it comes
  // before the preconditions.
  if (current._from) throw new Problem(409, 'conflict', t(`This item is inherited from ${current._from.href}: write it there, or add an own one with its key.`,
    `Este elemento se hereda de ${current._from.href}: escríbelo allí, o añade uno propio con su clave.`));
  // 7.2 and 5.4: where ids come back (reusable_ids), only If-Match tells one incarnation from another: it is required.
  // With upsert, If-None-Match: * meets that requirement too (7.2): on an existing item it gives 412 below.
  if (coll.require_if_match && req.headers['if-match'] === undefined && !(coll.upsert && anyTag(req.headers['if-none-match'])))
    throw new Problem(428, 'precondition_required', t('Send If-Match with the item’s ETag.', 'Envía If-Match con el ETag del elemento.'));
  // 7.2: with localized fields, a tag of any language's representation stands for the item ETag.
  for (const h of ['if-match', 'if-none-match']) req.headers[h] = sameItem(coll, current, req.headers[h]);
  const ifMatch = req.headers['if-match'];
  if (ifMatch !== undefined && !strongMatch(ifMatch, etag(current)))
    throw new Problem(412, 'precondition_failed', t('Someone changed it: read it again before writing.', 'Alguien lo ha cambiado: vuelve a leerlo antes de escribir.'));
  if (weakMatch(req.headers['if-none-match'], etag(current)))
    throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current item.', 'If-None-Match coincide con el ítem actual.'));
  const invalidation = { 'Cache-Group-Invalidation': groups([collPath, location(current), ...heirs(coll)]) };
  if (method === 'PATCH') objectBody(patch); // 5.1 and 5.4: after the preconditions
  if (method === 'DELETE') {
    unlink(coll, id);
    coll.rows.delete(id);
    // 5.1: a subcollection exists as long as its parent item does, so its items go with it.
    for (const sub of subsOf(nameOf(coll.base ?? coll))) {
      for (const child of view(db[sub], id).rows.keys()) unlink(db[sub], child);
      db[sub].byParent.delete(id);
      db[sub].usedByParent.delete(id);
    }
    if (coll.reusable_ids) coll.used.delete(id); // 5.1: its id is free again
    if (coll.upload) fileBytes.delete(id); // 5.1: its bytes go with it
    if (coll === db.readers) settings.byParent.delete(id); // 5.9: and a reader's settings with the reader
    return send(res, 204, undefined, invalidation);
  }
  if ('id' in patch && patch.id !== id) throw invalid([{ pointer: '/id', code: 'read_only', detail: t('id cannot change.', 'id no puede cambiar.') }]);
  // 4.3: the patch itself must fit schemas.update, so an unknown member is rejected even when it is null.
  const unknown = Object.keys(patch).filter((f) => !f.startsWith('_') && !Object.hasOwn(coll.types, f));
  if (unknown.length) throw invalid(unknown.map((f) => ({ pointer: ptr(f), code: 'unknown', detail: t(`There is no field ${f}.`, `No hay ningún campo ${f}.`) })));
  // 3: language maps merge like any object, are validated before merging and end as {} when emptied.
  const errors = languageErrors(coll, patch, current);
  errors.push(...relationErrors(coll, patch, id, current), ...inheritErrors(coll, patch, current));
  errors.push(...readOnlyErrors(coll, patch, current)); // 5.1: fields only the server sets, and localized ones
  const row = withMaps(coll, { ...mergePatch(current, patch), id });
  validate(coll, row, t('The result of the patch is not valid.', 'El resultado del parche no es válido.'), errors);
  const conflict = conflicts(coll, row, id);
  if (conflict) throw conflict;
  touch(coll, row, current);
  coll.rows.set(id, row);
  refresh();
  if (coll.localized) { // 5.6: in the language of the response
    const shown = present(coll, row, lang);
    return send(res, prefer ? 204 : 200, prefer ? undefined : withEtag(shown), { ETag: etag(shown), ...invalidation, ...req.extra, ...applied });
  }
  return send(res, prefer ? 204 : 200, prefer ? undefined : withEtag(row), { ETag: etag(row), ...invalidation, ...applied });
}

// 5.1: what a new item gets that its body did not give: the defaults of the create schema (4.3), and the fields
// only the server sets (an order starts reserved; a subscription and a draft get the instant of the write).
function fillNew(coll, row) {
  for (const [f, v] of Object.entries(coll.defaults ?? {})) if (row[f] === undefined) row[f] = v;
  if (coll.types.status && coll.server_set?.includes('status')) row.status = coll.values.status[0];
  for (const f of ['subscribed_at', 'edited_at']) if (coll.server_set?.includes(f)) row[f] = stamp();
}
// 5.1: a PATCH that changes no data leaves the item as it was; one that does moves edited_at.
function touch(coll, row, current) {
  if (!coll.server_set?.includes('edited_at')) return;
  const { edited_at: before, ...was } = current, { edited_at: after, ...now } = row;
  row.edited_at = canonical(was) === canonical(now) ? before : stamp();
}
// 5.1: an id is free when an item with it may be created: no item has it and, outside reusable_ids, none had it.
const isFree = (coll, id) => !coll.rows.has(id) && !coll.used.has(id);
// 5.1 and 7.2: a PATCH to a free id of a collection that declares upsert creates the item. The merge patch is
// applied to {} and the result validated as the body of a POST. There is no current representation, so If-Match
// fails with 412 and If-None-Match: * lets it create; where the collection requires If-Match (require_if_match),
// that is the only way to create (7.2), and a PATCH without either gives 428.
async function upsert(req, res, { url, params, coll, collPath, id }) {
  for (const key of new Set(params.keys())) if (isReserved(reservedName(key))) throw unsupported(key); // 5.3: none on a write
  const [patch] = await readJson(req, ['application/merge-patch+json', 'application/json']);
  // No await from here on. Created meanwhile: If-None-Match: * fails, and anything else is sent again as an edit.
  if (coll.rows.has(id)) {
    if (weakMatch(req.headers['if-none-match'], '*')) throw new Problem(412, 'precondition_failed', t('The item exists now.', 'El elemento ya existe.'));
    throw new Problem(409, 'conflict', t('The item was created meanwhile: send the PATCH again.', 'El elemento se ha creado mientras tanto: vuelve a enviar el PATCH.'));
  }
  if (req.headers['if-match'] !== undefined)
    throw new Problem(412, 'precondition_failed', t('There is no item to match: If-Match fails.', 'No hay ningún elemento con el que comparar: If-Match falla.'));
  // 7.2: where the collection requires If-Match, If-None-Match: * meets the requirement and lets the PATCH create.
  if (coll.require_if_match && !anyTag(req.headers['if-none-match']))
    throw new Problem(428, 'precondition_required', t('Send If-None-Match: * to create the item.', 'Envía If-None-Match: * para crear el elemento.'));
  objectBody(patch);
  const { id: sent, ...fields } = mergePatch({}, patch);
  if (sent !== undefined && sent !== id) throw invalid([{ pointer: '/id', code: 'read_only', detail: t('id is the one in the path.', 'id es el de la ruta.') }]);
  const body = { id, ...fields };
  const unknown = Object.keys(body).filter((f) => !Object.hasOwn(coll.types, f));
  if (unknown.length) throw invalid(unknown.map((f) => ({ pointer: ptr(f), code: 'unknown', detail: t(`There is no field ${f}.`, `No hay ningún campo ${f}.`) })));
  validate(coll, body, undefined, [...idErrors(coll, body), ...readOnlyErrors(coll, body), ...languageErrors(coll, body), ...relationErrors(coll, body), ...inheritErrors(coll, body)]);
  const row = withMaps(coll, body);
  fillNew(coll, row);
  const conflict = conflicts(coll, row);
  if (conflict) throw conflict;
  coll.rows.set(id, row);
  coll.used.add(id);
  refresh();
  const prefer = /(^|[ ,;])return=minimal\b/.test(req.headers.prefer ?? '');
  const location = `${collPath}/${id}`;
  return send(res, 201, prefer ? undefined : withEtag(structuredClone(row)), { Location: location, ETag: etag(row),
    'Cache-Group-Invalidation': groups([collPath, location]), ...(prefer && { 'Preference-Applied': 'return=minimal' }) });
}
// 5.1: a file created from its bytes: an ordinary item with _content, the link to them.
function storeFile(res, { coll, collPath, file, scope, print, prefer, applied }) {
  const id = newId(coll), href = `${collPath}/${id}`;
  const row = { id, name: file.name, _content: { href: `${href}/content`, media_type: file.mediaType, size: file.bytes.length } };
  if (row.name === null) delete row.name;
  fileBytes.set(id, file.bytes);
  coll.rows.set(id, row);
  coll.used.add(id);
  const response = [201, prefer ? undefined : withEtag(structuredClone(row)), { Location: href, ETag: etag(row),
    'Cache-Group-Invalidation': groups([collPath, href]), ...applied }];
  if (scope) idempotency.set(scope, { print, response, expires: Date.now() + TTL });
  return send(res, ...response);
}
// 5.9: the bytes of a file, outside Restep: of this specification only 5.3, 5.4 and the Cache-Control rule of
// 5.1 apply. It implements no reserved parameter.
function serveBytes(req, res, params, id, url) {
  const bytes = fileBytes.get(id), row = db.files.rows.get(id);
  if (!bytes || !row) throw missing(url);
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new Problem(405, 'method_not_allowed', ONLY_READ, {}, { Allow: 'GET, HEAD' });
  for (const key of new Set(params.keys())) if (isReserved(reservedName(key))) throw unsupported(key);
  const tag = `"${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}"`;
  const headers = { ETag: tag, 'Cache-Control': TOKEN ? 'private, no-cache' : 'no-cache' };
  if (weakMatch(req.headers['if-none-match'], tag)) { res.writeHead(304, headers); return res.end(); }
  res.writeHead(200, { ...headers, 'Content-Type': row._content.media_type, 'Content-Length': bytes.length });
  return res.end(req.method === 'HEAD' ? undefined : bytes);
}

refresh();
const port = Number(process.env.PORT ?? 8080);
createServer((req, res) => handle(req, res).catch((e) => {
  if (!(e instanceof Problem)) { console.error(e); e = new Problem(500, 'internal', t('Something went wrong on the server.', 'Algo ha fallado en el servidor.')); }
  if (!res.headersSent) problem(res, e, req);
})).listen(port, () => console.log(`Restep 1 (${[...PROFILES, ...EXTENSIONS].join(', ')}) on http://localhost:${port}/`));
