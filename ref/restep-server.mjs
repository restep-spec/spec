// Restep 1 · Reference implementation of the core, query, writes, cache and relations profiles and the
// actions and inherit extensions (and oauth, see below). Node 18 or later, no dependencies.
// Usage:  node restep-server.mjs  →  http://localhost:8080/
// Specification: https://restep.wubytes.com/1/  (draft 6, so discovery declares "restep": "1.0-draft.6")
// With RESTEP_TOKEN=secret it also implements the oauth extension (11.5): every request needs
// Authorization: Bearer secret, and the metadata is at /.well-known/oauth-protected-resource.
// The token stands in for one from an authorization server; it does not issue or validate real ones.
// RFC 9728 requires https: behind a local http URL this only simulates the extension.
// It does not implement sync or the batch, filter-expr and query-method extensions: those parameters and
// paths fail loudly.
// What it shows:
// - a subcollection (4.2): each book's reviews at /books/{book_id}/reviews, gone with their book;
// - relations (9): books link their author (to-one), related books (to-many) and a highlighted review
//   (an item of the subcollection, so with href); a category's showcase points to a book or a product
//   (with type); include expands them, two levels deep from products (include_depth); fields takes
//   dotted paths (author.name), and books filter by author.id and author.name;
// - actions (11.1): restock (on a product, not idempotent, with input), low_stock (a safe GET on
//   products), inherit_tax (on a category, idempotent) and find_or_create (on the authors, 200 or 201),
//   listed in _actions where available;
// - inherited values (11.6): a product and a category take their tax rate from their category, their
//   parent category or a default, materialized after every write;
// - categories take an id from the client or assign one ("id_from": "either", 5.1), have a unique name and
//   compare and sort it ignoring case and accents ("collations": {"name": "server"}, 6.1); /shop is a
//   singleton (5.9); sorting books by year is deprecated (5.5).
// What it cannot show: it has a single principal (or none), so no field or related item is hidden from
// anyone (5.1, 6.1, 9), no existence is concealed and keys without credentials are never refused (7.1);
// no action is ever refused for the item's state (409, 11.1); it accepts no cookies, so the Origin check of
// 5.8 does not apply; and it never answers 429 or 503 (5.7).
// Field types: it only handles the ones its data uses (string, integer, number, decimal, enum, language
// maps and relationships); a server with date, datetime, duration or boolean fields must add their comparison rules (section 6.1).
// Its own texts (error titles and details, descriptions in discovery) come in English, the default, or
// Spanish, picked by Accept-Language (5.6); the data never changes with it.
import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes } from 'node:crypto';

const PROFILE = 'https://w3id.org/restep/1/'; // identifier: the profile link and error types
const SPEC = 'https://restep.wubytes.com/1/'; // the page to read
const RESTEP = '1.0-draft.6'; // 1.1: a draft declares itself with its suffix
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
const typeOf = (coll, f) => (f.includes('.') ? 'string' : coll.types[f] === 'enum' ? coll.values[f] : coll.types[f]);

// ── Data: the El Marcapáginas bookshop (https://rest.wubytes.com) ─────────────
// Field types follow the discovery vocabulary (section 4.2): they drive validation and comparison.
const rows = (list) => new Map(list.map((r) => [r.id, r]));
const db = {
  books: {
    description: t('Books in the catalogue of El Marcapáginas, one per edition.', 'Libros del catálogo de El Marcapáginas, uno por edición.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'], // 4.3: declared, so they must match Allow
    types: { id: 'string', title: 'string', price: 'decimal', rating: 'number', year: 'integer', category: 'enum',
      author: 'relation', related: 'relation', highlight: 'relation' },
    values: { category: ['novela-negra', 'ciencia-ficcion', 'ensayo', 'poesia', 'infantil'] },
    required: ['title', 'price'],
    // 3 and 9: author is to-one, related is to-many, and highlight points at an item of a subcollection,
    // so its objects carry href. All three can be expanded with include.
    relations: {
      author: { to: 'authors', include: true },
      related: { to: 'books', many: true, include: true },
      highlight: { to: 'reviews', include: true },
    },
    filter: { id: ['eq', 'in'], price: ['eq', 'lt', 'le', 'gt', 'ge'], category: ['eq', 'ne', 'in'],
      year: ['eq', 'lt', 'le', 'gt', 'ge'], rating: ['ge', 'null'],
      'author.id': ['eq', 'in'], 'author.name': ['eq', 'in'] }, // 6.1 and 9: through the to-one author
    // 6.1: named filters do not compare a field; their description is their meaning. Without type,
    // a switch (filter[featured]); with type, it takes a value (filter[search]=niebla).
    named_filters: {
      featured: { description: t('The books the shop features this month.', 'Los libros que la librería destaca este mes.'),
        apply: (r) => ['7', '30'].includes(r.id) },
      search: { type: 'string', description: t('Title contains the text, case-insensitively.', 'El título contiene el texto, sin distinguir mayúsculas.'),
        apply: (r, v) => r.title.toLowerCase().includes(v.toLowerCase()) },
    },
    sort: ['id', 'title', 'price', 'rating', 'year'],
    max_limit: 50,
    count: 'exact',
    // 5.5: sorting by year will go; responses to a request that sorts by it carry Deprecation.
    deprecations: [{ kind: 'sort', name: 'year', announced: '2026-11-20T00:00:00Z', sunset: '2027-06-01T00:00:00Z' }],
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
    actions: {
      restock: { on: 'item', safe: false, idempotent: false,
        description: t('Adds units to the stock.', 'Añade unidades al stock.'),
        input: { type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 1 } }, additionalProperties: false },
        run: (coll, row, body) => { row.stock = (row.stock ?? 0) + body.quantity; return [200, row]; } },
      low_stock: { on: 'collection', method: 'GET', safe: true, idempotent: true,
        description: t('The products with fewer than 5 units in stock.', 'Los productos con menos de 5 unidades en stock.'),
        run: (coll) => [200, { items: [...coll.rows.values()].filter((r) => r.stock != null && r.stock < 5).map(withEtag), next: null }] },
    },
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
    types: { id: 'string', name: 'string', parent: 'relation', showcase: 'relation', tax_rate: 'decimal', tax_rate_own: 'decimal' },
    values: {},
    required: ['name'],
    unique: ['name'],
    collations: { name: 'server' },
    notes: { name: t('Unique; compared and sorted ignoring case and accents.', 'Único; se compara y se ordena sin distinguir mayúsculas ni acentos.') },
    // 3: showcase can point to a book or a product, so its objects carry type.
    relations: { parent: { to: 'categories', include: true }, showcase: { to: ['books', 'products'], include: true } },
    inherit: { tax_rate: { own: 'tax_rate_own', from: ['parent'], default: '21',
      description: t('VAT rate in %; without its own, its parent\'s, and 21 at the top.', 'IVA en %; si no tiene propio, el de su padre, y 21 arriba del todo.') } },
    filter: { id: ['eq', 'in'], name: ['eq', 'in'], tax_rate: ['eq', 'lt', 'le', 'gt', 'ge'], tax_rate_own: ['null'] },
    sort: ['id', 'name', 'tax_rate'],
    // 11.1: idempotent, so repeating it changes nothing more; _actions lists it only where there is an own rate.
    actions: {
      inherit_tax: { on: 'item', safe: false, idempotent: true,
        description: t('Removes its own VAT rate, so it inherits again.', 'Quita su IVA propio, para que vuelva a heredarlo.'),
        available: (row) => row.tax_rate_own != null,
        run: (coll, row) => { row.tax_rate_own = null; return [200, row]; } },
    },
    max_limit: 50,
    count: 'exact',
    rows: rows([
      { id: '1', name: 'Papelería', parent: null, showcase: { type: 'products', id: '2' }, tax_rate_own: null },
      { id: '2', name: 'Libros', parent: null, showcase: { type: 'books', id: '7' }, tax_rate_own: '4' },
      { id: '3', name: 'Material escolar', parent: { id: '1' }, tax_rate_own: null },
      { id: '4', name: 'Libros infantiles', parent: { id: '2' }, tax_rate_own: null },
      { id: '5', name: 'Lámparas', parent: { id: '1' }, tax_rate_own: '10' },
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
    // 11.1: on the collection, idempotent: the author with that exact name (200) or a new one (201).
    actions: {
      find_or_create: { on: 'collection', safe: false, idempotent: true,
        description: t('The author with this exact name, created if there is none.', 'El autor con este nombre exacto, que se crea si no hay ninguno.'),
        input: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 }, country: { type: 'string' } }, additionalProperties: false },
        run: (coll, row, body) => {
          const found = [...coll.rows.values()].find((r) => r.name === body.name);
          if (found) return [200, found];
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
    types: { id: 'string', rating: 'integer', text: 'string' },
    values: {},
    required: ['rating', 'text'],
    filter: { id: ['eq', 'in'], rating: ['eq', 'lt', 'le', 'gt', 'ge'] },
    sort: ['id', 'rating'],
    max_limit: 50,
    count: 'exact',
    rows: new Map(), // empty: the items are in byParent
    byParent: new Map([
      ['7', rows([{ id: '1', rating: 5, text: 'Te atrapa desde la primera niebla.' }, { id: '2', rating: 4, text: 'Buena, aunque el final se adivina.' }])],
      ['12', rows([{ id: '3', rating: 4, text: 'Un viaje que no quieres que acabe.' }])],
    ]),
    usedByParent: new Map(),
  },
};
// 5.1: every id a collection has had, so a deleted one is never given out again (taken, 409).
for (const coll of Object.values(db)) coll.used = new Set(coll.rows.keys());
for (const [book, list] of db.reviews.byParent) db.reviews.usedByParent.set(book, new Set(list.keys()));

// 4.2 and 5.1: a subcollection under one parent item: the same declaration with that item's rows, the
// ids it has had and its path, with the template expanded.
const subsOf = (name) => Object.keys(db).filter((k) => db[k].parent === name);
const expandPath = (sub, parentId) => sub.path.replace(/\{[^}]+\}/, parentId);
function view(sub, parentId) {
  if (!sub.byParent.has(parentId)) sub.byParent.set(parentId, new Map());
  if (!sub.usedByParent.has(parentId)) sub.usedByParent.set(parentId, new Set());
  return Object.create(sub, { rows: { value: sub.byParent.get(parentId) }, used: { value: sub.usedByParent.get(parentId) },
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

// ── Inherited values (11.6) ───────────────────────────────────────────────────
// The effective field is resolved and stored after every write, with _inherited explaining where it
// comes from: so filters, sorting, fields and ETags (7.2) see it like any other field.
const nameOf = (coll) => Object.keys(db).find((n) => db[n] === coll);
// Where field f of a row comes from: { value, href } of the item that holds it, or { value } for the default.
function source(coll, row, f, seen = new Set()) {
  const rule = coll.inherit[f];
  if (row[rule.own] != null) return { value: row[rule.own], href: `/${nameOf(coll)}/${row.id}` };
  for (const r of rule.from) { // the first relationship with a link decides (11.6)
    const to = db[coll.relations[r].to], target = row[r] && to.rows.get(row[r].id);
    if (!target || seen.has(target)) continue;
    seen.add(target);
    return to.inherit?.[f] ? source(to, target, f, seen) : { value: target[f], href: `/${nameOf(to)}/${target.id}` };
  }
  return { value: rule.default };
}
function refresh(only) { // only: a single row, for a test that leaves the rest stale
  for (const coll of Object.values(db)) {
    if (!coll.inherit) continue;
    for (const row of coll.rows.values()) {
      if (only && row !== only) continue;
      const why = {};
      // A merge patch deletes what it sets to null; an own field and a link still read as null.
      for (const f of Object.values(coll.inherit).map((i) => i.own)) row[f] ??= null;
      for (const [f, rel] of Object.entries(coll.relations ?? {})) row[f] ??= rel.many ? [] : null;
      for (const f of Object.keys(coll.inherit)) {
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
      const available = Object.entries(coll.actions ?? {}).filter(([, a]) => a.on === 'item' && (!a.available || a.available(row)));
      if (available.length) row._actions = Object.fromEntries(available.map(([n, a]) => [n, { method: a.method ?? 'POST', href: `/${nameOf(coll)}/${row.id}:${n}` }]));
    }
  }
}
// 11.6 and 5.1: the effective field is read-only. Its current value (in a POST, the one that would result)
// is ignored; another gives read_only, naming the own field. Either way it leaves the body.
const same = (a, b) => (a == null || b == null ? a == null && b == null
  : typeof a === 'string' && typeof b === 'string' && DECIMAL.test(a) && DECIMAL.test(b) ? cmpDecimal(a, b) === 0 : a === b);
function inheritErrors(coll, body, current) {
  const errors = [];
  for (const [f, rule] of Object.entries(coll.inherit ?? {})) {
    if (!(f in body)) continue;
    let now;
    try { now = current ? current[f] : source(coll, { ...body, id: '' }, f).value; } catch { now = undefined; }
    if (!same(body[f], now)) errors.push({ pointer: ptr(f), code: 'read_only',
      detail: t(`${f} is the effective value; write ${rule.own}.`, `${f} es el valor efectivo; escribe en ${rule.own}.`) });
    delete body[f];
  }
  return errors;
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
  if (!lookup(toName, v)) errors.push({ pointer: `${where}/id`, code: 'unknown', detail: t(`There is no ${toName} ${v.id}.`, `No hay ningún ${toName} ${v.id}.`) });
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
  if (self === undefined && coll.used.has(row.id))
    return new Problem(409, 'conflict', t('That id is taken.', 'Ese id ya está cogido.'), { errors: [{ pointer: '/id', code: 'taken', detail: t('An item of this collection has or had this id.', 'Un ítem de esta colección tiene o tuvo este id.') }] });
  for (const f of coll.unique ?? []) {
    const clash = [...coll.rows.values()].find((r) => r.id !== self && r[f] != null && row[f] != null && compare('string', r[f], row[f], coll.collations?.[f]) === 0);
    if (clash) return new Problem(409, 'conflict', t(`Another item has that ${f}.`, `Otro ítem tiene ese ${f}.`), { errors: [{ pointer: ptr(f), code: 'duplicate', detail: t(`${f} is unique.`, `${f} es único.`) }] });
  }
  return null;
}
// 5.5: the headers of a response to a request that uses something deprecated (here, sort and filter keys).
const epoch = (instant) => `@${Math.floor(Date.parse(instant) / 1000)}`;
function deprecationHeaders(coll, params) {
  const sorts = (params.get('sort') ?? '').split(',').map((s) => s.replace(/^-/, ''));
  const filters = [...params.keys()].map((k) => /^filter\[([^\]]+)\]/.exec(k)?.[1]).filter(Boolean);
  const used = (coll.deprecations ?? []).filter((d) => (d.kind === 'sort' && sorts.includes(d.name)) || (d.kind === 'filter' && filters.includes(d.name)));
  return used.length ? { Deprecation: epoch(used[0].announced), Link: `${link}, <${SPEC}#versions>; rel="deprecation"` } : {};
}

// ── core: responses and errors ────────────────────────────────────────────────
const link = `<${PROFILE}>; rel="profile"`; // 4.1: one fixed link; discovery says what is implemented
// 4.2: the documentation for people, on the discovery response. This API's documentation is the specification.
const DOCS = `<${SPEC}>; rel="service-doc"; hreflang="en"; title="Restep 1, the specification", <https://restep.wubytes.com/es/1/>; rel="service-doc"; hreflang="es"`;
const hash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 16);
// Strong ETag of an item's state: always over the whole item, whatever fields were asked for (7.2).
const etag = (value) => `"${hash(JSON.stringify(value))}"`;

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
  415: t('Unsupported media type', 'Tipo de contenido no admitido'), 422: t('Invalid data', 'Datos no válidos'), 500: t('Internal error', 'Error interno'),
};
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
      : t === 'relation' ? linkSchema(c.relations[f]) : { type: t };
  };
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
    const nullable = isMap(c, f) ? kind === 'update' : !c.required.includes(f);
    if (!nullable) return [f, s];
    // readOnly and the description stay next to the property, where 5.1 looks for readOnly.
    const { readOnly, description, ...rest } = s;
    return [f, { ...(readOnly && { readOnly }), ...(description !== undefined && { description }), anyOf: [rest, { type: 'null' }] }];
  }));
  const reserved = { '^_': {} }; // members starting with _ are ignored on writes (5.1)
  // 5.9: a singleton has no id and is never created.
  if (!Object.hasOwn(c.types, 'id')) return {
    item: { type: 'object', required: c.required, properties: props('item') },
    update: { type: 'object', description: text(t('A JSON Merge Patch: absent leaves a field untouched, null deletes it.',
      'Un JSON Merge Patch: lo ausente no cambia, null lo borra.'), lang), properties: props('update'), patternProperties: reserved, additionalProperties: false },
  };
  // 5.1 and 4.3: where the client may choose the id, the create schema says its format.
  const own = (c.id_from ?? 'server') !== 'server';
  const idProp = { id: { type: 'string', pattern: ID.source, description: text(t('The id the client chooses, if it chooses one.', 'El id que elige el cliente, si lo elige.'), lang) } };
  return {
    item: { type: 'object', required: ['id', ...c.required], properties: { id: { type: 'string', readOnly: true }, ...props('item') } },
    create: { type: 'object', required: [...(c.id_from === 'client' ? ['id'] : []), ...c.required], properties: { ...(own && idProp), ...props('create') },
      patternProperties: reserved, additionalProperties: false },
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
  if (type === 'integer' || type === 'number') return a - b;
  if (collation === 'server') return cmpText(fold(String(a)), fold(String(b)));
  return cmpText(String(a), String(b));
}
// Parses a filter value from the URL according to the field's type; a mismatch is invalid_parameter.
function parseValue(type, raw, key) {
  if (type === 'decimal' && DECIMAL.test(raw)) return raw;
  if (type === 'integer' && /^-?\d+$/.test(raw)) return Number(raw);
  if (type === 'number' && /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(raw)) return Number(raw);
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
  let items = [...coll.rows.values()];
  const seen = new Set();
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
      if (!named.type && value !== '') throw bad(key, t(`${field} is a switch: it takes no value.`, `${field} es un interruptor: no lleva valor.`));
      if (named.type && value === '') throw bad(key, t(`${field} needs a ${named.type} value.`, `${field} necesita un valor ${named.type}.`));
      const v = named.type ? parseValue(named.type, value, key) : undefined;
      items = items.filter((r) => named.apply(r, v));
      continue;
    }
    if (!Object.hasOwn(coll.filter, field)) throw unsupported(key);
    if (!coll.filter[field].includes(op)) throw unsupported(key, t(`${field} supports: ${coll.filter[field].join(', ')}.`, `${field} admite: ${coll.filter[field].join(', ')}.`));
    if (seen.has(`${field}[${op}]`)) throw bad(key, SAME_FILTER);
    seen.add(`${field}[${op}]`);
    const type = typeOf(coll, field); // an enum parses as its list of values
    const collation = coll.collations?.[field];
    if (op === 'null') {
      if (value !== 'true' && value !== 'false') throw bad(key, t('Use true or false.', 'Usa true o false.'));
      items = items.filter((r) => (at(r, field, coll) === undefined || at(r, field, coll) === null) === (value === 'true'));
    } else if (op === 'in') {
      // 6.1: filter[f][in]= is an empty list; an empty element between commas is the empty string.
      if (value === '') throw bad(key, t('in needs a non-empty, comma-separated list.', 'in necesita una lista no vacía, separada por comas.'));
      const values = value.split(',');
      // 5.3: a limit this API does not declare. Over it, the whole request fails: never part of it.
      if (values.length > MAX_IN) throw bad(key, t(`in takes at most ${MAX_IN} values.`, `in admite como mucho ${MAX_IN} valores.`));
      const parsed = values.map((v) => parseValue(type, v, key));
      items = items.filter((r) => at(r, field, coll) != null && parsed.some((v) => compare(type, at(r, field, coll), v, collation) === 0));
    } else {
      const v = parseValue(type, value, key);
      items = items.filter((r) => at(r, field, coll) != null && OPS[op](compare(type, at(r, field, coll), v, collation)));
    }
  }
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
const PAGE_ONLY = ['cursor', 'limit', 'fields', 'include', 'count'];
const queryPrint = (path, params) => {
  const q = [...params].filter(([k]) => !PAGE_ONLY.includes(k)).sort();
  return hash(`${path}?${new URLSearchParams(q)}`);
};
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
  items.sort((a, b) => {
    for (const s of [...sort, 'id']) {
      const f = s.replace(/^-/, '');
      const x = at(a, f, coll), y = at(b, f, coll);
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
  const print = queryPrint(path, params);
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
  try { v = JSON.parse(text); } catch {}
  if (isObject(v)) { // members starting with _ belong to Restep (_etag, _actions): a write ignores them (5.1)
    const body = Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')));
    return [body, v]; // [what the write applies, the body as sent, for the idempotency fingerprint]
  }
  throw new Problem(400, 'bad_request', t('The body is not a valid JSON object.', 'El cuerpo no es un objeto JSON válido.'));
}
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
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
    if (v === null || f === 'id' || type === 'map' || type === 'relation') continue; // maps and links: checked in the body, before merging
    const ok = type === 'decimal' ? typeof v === 'string' && DECIMAL.test(v)
      : type === 'integer' ? Number.isInteger(v) : type === 'number' ? typeof v === 'number' : typeof v === 'string';
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

// 7.2: every response whose body is one item carries its item ETag in _etag, computed without _etag.
const withEtag = (row) => ({ ...row, _etag: etag(row) });
// 8: cache groups (RFC 9875), named by path: the collection first, then its items, at most 32.
const groups = (paths) => paths.slice(0, 32).map((p) => `"${p}"`).join(', ');
// A write to an item also changes the items that inherit from it (11.6): their collections are invalidated too.
const heirs = (coll) => Object.entries(db).filter(([, o]) => o !== coll && o.inherit && Object.values(o.relations ?? {}).some((rel) => targets(rel).some((to) => db[to] === coll))).map(([n]) => `/${n}`);

// 4.3 and 5.1: HEAD goes with GET, and only with it. A list that leaves out GET gives 405 to HEAD too.
const withHead = (methods) => (methods.includes('GET') ? [...methods, 'HEAD'] : methods);

// 5.9: the singleton. Its PATCH is a merge patch, as for an item; POST and DELETE give 405.
async function handleShop(req, res, params) {
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
  if (read) {
    const fields = parseFields(params, shop);
    const data = fields ? { ...pick(shop.row, fields), _etag: etag(shop.row) } : withEtag(shop.row);
    delete data.id;
    const headers = { ETag: fields ? etag(data) : etag(shop.row), 'Cache-Control': 'no-cache', 'Cache-Groups': groups([shop.path]) };
    if (weakMatch(req.headers['if-none-match'], headers.ETag)) return send(res, 304, undefined, headers);
    return send(res, 200, data, headers, method === 'HEAD');
  }
  const [patch] = await readJson(req, ['application/merge-patch+json', 'application/json']);
  const current = shop.row;
  if (req.headers['if-match'] !== undefined && !strongMatch(req.headers['if-match'], etag(current)))
    throw new Problem(412, 'precondition_failed', t('Someone changed the shop’s details: read them again before writing.', 'Alguien ha cambiado los datos de la librería: vuelve a leerlos antes de escribir.'));
  if (weakMatch(req.headers['if-none-match'], etag(current)))
    throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current representation.', 'If-None-Match coincide con la representación actual.'));
  const strangers = Object.keys(patch).filter((f) => !Object.hasOwn(shop.types, f));
  if (strangers.length) throw invalid(strangers.map((f) => ({ pointer: ptr(f), code: 'unknown', detail: t(`There is no field ${f}.`, `No hay ningún campo ${f}.`) })));
  const row = mergePatch(current, patch);
  validate(shop, row, t('The result of the patch is not valid.', 'El resultado del parche no es válido.'));
  shop.row = row;
  const prefer = /(^|[ ,;])return=minimal\b/.test(req.headers.prefer ?? '');
  return send(res, prefer ? 204 : 200, prefer ? undefined : withEtag(row), { ETag: etag(row), 'Cache-Group-Invalidation': groups([shop.path]),
    ...(prefer && { 'Preference-Applied': 'return=minimal' }) });
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
async function handleAction(req, res, { url, params, coll, collPath, id, action }) {
  // An action the collection does not declare, or declared on the other kind of resource, does not exist.
  const decl = Object.hasOwn(coll.actions ?? {}, action) ? coll.actions[action] : null;
  if (!decl || decl.on !== (id === undefined ? 'collection' : 'item') || (id !== undefined && !coll.rows.has(id))) throw missing(url);
  const allow = decl.method === 'GET' ? ['GET', 'HEAD'] : ['POST'];
  if (!allow.includes(req.method))
    throw new Problem(405, 'method_not_allowed', t(`Supports ${allow.join(', ')}.`, `Admite ${allow.join(', ')}.`), {}, { Allow: allow.join(', ') });
  for (const key of new Set(params.keys())) if (isReserved(reservedName(key))) throw unsupported(key); // 5.3
  const row = id === undefined ? null : coll.rows.get(id);
  if (decl.method === 'GET') {
    const [status, data] = decl.run(coll, row, {});
    const tag = etag(data);
    if (weakMatch(req.headers['if-none-match'], tag)) return send(res, 304, undefined, { ETag: tag, 'Cache-Control': 'no-cache' });
    return send(res, status, data, { ETag: tag, 'Cache-Control': 'no-cache' }, req.method === 'HEAD');
  }
  // 11.1 and 7.1: an idempotent action ignores Idempotency-Key, since repeating it is already safe; any other
  // applies 7.1 to it, as to any POST that is not idempotent.
  const scope = decl.idempotent ? null : idempotencyScope(req, url.pathname);
  const [body, sent] = await readJson(req, ['application/json'], true);
  // No await from here on: the check and the effect are atomic.
  const print = scope && hash(canonical([[...params].map(([k, v]) => `${k}=${v}`).sort(), sent]));
  const saved = scope && idempotency.get(scope);
  const live = saved?.expires > Date.now() ? saved : null;
  if (live && live.print === print) return send(res, ...live.response.slice(0, 2), { ...live.response[2], 'Idempotent-Replayed': 'true' });
  // 7.2: on an item, the target of the preconditions is the item; on the collection, its GET without parameters.
  const target = row ? etag(row) : etag(list(coll, new URLSearchParams(), collPath));
  if (req.headers['if-match'] !== undefined && !strongMatch(req.headers['if-match'], target))
    throw new Problem(412, 'precondition_failed', t('If-Match does not match the current representation.', 'If-Match no coincide con la representación actual.'));
  if (weakMatch(req.headers['if-none-match'], target))
    throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current representation.', 'If-None-Match coincide con la representación actual.'));
  if (live) throw new Problem(422, 'idempotency_mismatch', t('That Idempotency-Key was already used with a different request.', 'Esa Idempotency-Key ya se usó con otra petición.'));
  const errors = inputErrors(decl.input, body);
  if (errors.length) throw invalid(errors);
  const [status, made] = decl.run(coll, row, body);
  refresh();
  // 11.1: the affected item (200) or a new one (201, with Location).
  const response = [status, withEtag(structuredClone(made)), { ETag: etag(made), ...(status === 201 && { Location: `${collPath}/${made.id}` }),
    'Cache-Group-Invalidation': groups([collPath, `${collPath}/${made.id}`, ...heirs(coll)]) }];
  if (scope) idempotency.set(scope, { print, response, expires: Date.now() + TTL });
  return send(res, ...response);
}

// ── Routing ───────────────────────────────────────────────────────────────────
// The collection a path names, with its path and, if any, the item's id. A subcollection is only reached
// under an item of its parent that exists.
function resolve(url, segments) {
  const [name, id, sub, subId, ...more] = segments;
  const top = Object.hasOwn(db, name) && !db[name].parent ? db[name] : null;
  if (!top || more.length) throw missing(url);
  if (sub === undefined) return { coll: top, path: `/${name}`, id };
  const subName = subsOf(name).find((k) => db[k].path.endsWith(`}/${sub}`));
  if (!subName || !top.rows.has(id)) throw missing(url);
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
    const collections = Object.fromEntries(Object.entries(db).map(([n, c]) => [n, {
      path: c.path ?? `/${n}`, ...(c.parent && { parent: c.parent }), description: text(c.description, lang), methods: c.methods, item_methods: c.item_methods,
      ...(c.id_from && { id_from: c.id_from }), // 5.1
      schemas: schemas(c, lang), max_limit: c.max_limit, count: c.count, sort: c.sort,
      filter: Object.fromEntries(Object.entries(c.filter).map(([f, ops]) => [f, { type: f.includes('.') ? 'string' : c.types[f],
        ...(c.types[f] === 'enum' ? { values: c.values[f] } : {}), ops, ...(c.notes?.[f] && { description: text(c.notes[f], lang) }) }])),
      ...(c.collations && { collations: c.collations }), // 6.1
      ...(c.named_filters && { named_filters: Object.fromEntries(Object.entries(c.named_filters).map(([f, n]) =>
        [f, { ...(n.type && { type: n.type }), description: text(n.description, lang) }])) }),
      ...(maps(c).length && { language_maps: Object.fromEntries(maps(c).map((f) => [f, {}])) }), // 4.2: all of them
      // 9: each relationship, its target, whether it is to-many and whether include expands it.
      ...(c.relations && { relations: Object.fromEntries(Object.entries(c.relations).map(([r, rel]) => [r,
        { to: rel.to, ...(rel.many && { many: true }), ...(rel.include && { include: true }) }])) }),
      ...(c.include_depth && { include_depth: c.include_depth }),
      ...(c.actions && { actions: Object.fromEntries(Object.entries(c.actions).map(([a, d]) => [a, { on: d.on, safe: d.safe, idempotent: d.idempotent,
        ...(d.method && { method: d.method }), description: text(d.description, lang), ...(d.input && { input: d.input }) }])) }), // 11.1
      ...(c.inherit && { inherit: Object.fromEntries(Object.entries(c.inherit).map(([f, i]) => [f,
        { own: i.own, from: i.from, default: i.default !== undefined, description: text(i.description, lang) }])) }),
      ...(c.deprecations && { deprecations: c.deprecations }), // 5.5
    }]));
    const singletons = { shop: { path: shop.path, methods: shop.methods, description: text(shop.description, lang), schemas: schemas(shop, lang) } };
    // 5.4: this API has no domain reasons, and says so: an empty catalogue, complete like any other.
    const doc = { restep: RESTEP, version: '1', profiles: PROFILES, extensions: EXTENSIONS, idempotency: { ttl: TTL / 1000 }, status: STATUS, reasons: {}, collections, singletons };
    const headers = { ETag: etag([lang, doc]), 'Cache-Control': 'public, max-age=300', Vary: 'Accept-Language', 'Content-Language': lang, Link: `${link}, ${DOCS}` };
    if (weakMatch(req.headers['if-none-match'], headers.ETag)) return send(res, 304, undefined, headers);
    return send(res, 200, doc, headers, method === 'HEAD');
  }
  if (url.pathname === shop.path) return handleShop(req, res, params);
  // A collection (/books), an item (/books/7), a subcollection under an item (/books/7/reviews) or one of
  // its items (/books/7/reviews/1). 5.4: a missing parent or item gives 404 before anything else is looked at.
  // 11.1: an action goes after a colon in the last segment (also as %3A, decoded above).
  const last = segments.at(-1), colon = last.indexOf(':');
  const action = colon > 0 ? last.slice(colon + 1) : undefined;
  const { coll, path: collPath, id } = resolve(url, colon > 0 ? [...segments.slice(0, -1), last.slice(0, colon)] : segments);
  if (action !== undefined) return handleAction(req, res, { url, params, coll, collPath, id, action });
  if (id === undefined) req.extra = deprecationHeaders(coll, params);

  // 3: ids compare code point by code point, so /books/07 is not /books/7.
  if (id !== undefined && !coll.rows.has(id)) throw missing(url);

  // 5.4: 405 comes before 400, so an unsupported method is reported before its parameters are looked at.
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
      const row = coll.rows.get(id), included = parseInclude(params, coll), fields = parseFields(params, coll, included);
      // The ETag header validates the representation sent; If-Match uses the item's ETag (7.2),
      // which every representation of the item carries in _etag.
      data = fields || included.length ? { ...pick(expand(row, coll, included), fields), _etag: etag(row) } : withEtag(row);
      tag = fields || included.length ? etag(data) : etag(row);
      paths = [location(row)];
    }
    const headers = { ETag: tag, 'Cache-Control': 'no-cache', 'Cache-Groups': groups(paths), ...req.extra };
    const itemTag = id === undefined ? tag : etag(coll.rows.get(id));
    if (req.headers['if-match'] !== undefined && !strongMatch(req.headers['if-match'], itemTag))
      throw new Problem(412, 'precondition_failed', t('If-Match does not match the current representation.', 'If-Match no coincide con la representación actual.'));
    if (weakMatch(req.headers['if-none-match'], tag)) return send(res, 304, undefined, headers);
    return send(res, 200, data, headers, method === 'HEAD');
  }

  if (id === undefined) {
    const scope = idempotencyScope(req, url.pathname);
    const [body, sent] = await readJson(req, ['application/json']);
    // From here to the end of the request there is no await: check and write are atomic.
    // 7.1: the same request is the same key, principal, target, query and body (as JSON values).
    const query = [...params].map(([k, v]) => `${k}=${v}`).sort();
    const print = scope && hash(canonical([query, sent]));
    const saved = scope && idempotency.get(scope);
    const live = saved && saved.expires > Date.now() ? saved : null;
    // 7.1: a replay returns the stored response; preconditions were evaluated for the first request only.
    if (live && live.print === print)
      return send(res, ...live.response.slice(0, 2), { ...live.response[2], 'Idempotent-Replayed': 'true' });
    // 7.2: preconditions on a POST are evaluated against the ETag of the collection's GET without parameters.
    // 5.4: 412 comes before 422, so they are checked before a key reused with another body.
    const collTag = etag(list(coll, new URLSearchParams(), url.pathname));
    if (req.headers['if-match'] !== undefined && !strongMatch(req.headers['if-match'], collTag))
      throw new Problem(412, 'precondition_failed', t('If-Match does not match the current collection.', 'If-Match no coincide con la colección actual.'));
    if (weakMatch(req.headers['if-none-match'], collTag))
      throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current collection.', 'If-None-Match coincide con la colección actual.'));
    if (live) throw new Problem(422, 'idempotency_mismatch', t('That Idempotency-Key was already used with a different request.', 'Esa Idempotency-Key ya se usó con otra petición.'));
    validate(coll, body, undefined, [...idErrors(coll, body), ...languageErrors(coll, body), ...relationErrors(coll, body), ...inheritErrors(coll, body)]);
    const row = withMaps(coll, { ...body, id: 'id' in body ? body.id : newId(coll) });
    const conflict = conflicts(coll, row); // 5.4: 409 conflict goes after 422
    if (conflict) throw conflict;
    coll.rows.set(row.id, row);
    coll.used.add(row.id);
    refresh();
    const response = [201, prefer ? undefined : withEtag(structuredClone(row)), { Location: location(row), ETag: etag(row),
      'Cache-Group-Invalidation': groups([collPath, location(row), ...heirs(coll)]), ...applied }];
    if (scope) idempotency.set(scope, { print, response, expires: Date.now() + TTL });
    return send(res, ...response);
  }

  const [patch] = method === 'PATCH' ? await readJson(req, ['application/merge-patch+json', 'application/json']) : [null];
  // No await from here on: the If-Match check and the write are atomic (7.2).
  const current = coll.rows.get(id);
  if (!current) throw missing(url); // 7.2: an item deleted meanwhile gives 404 whatever the preconditions say
  const ifMatch = req.headers['if-match'];
  if (ifMatch !== undefined && !strongMatch(ifMatch, etag(current)))
    throw new Problem(412, 'precondition_failed', t('Someone changed it: read it again before writing.', 'Alguien lo ha cambiado: vuelve a leerlo antes de escribir.'));
  if (weakMatch(req.headers['if-none-match'], etag(current)))
    throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current item.', 'If-None-Match coincide con el ítem actual.'));
  const invalidation = { 'Cache-Group-Invalidation': groups([collPath, location(current), ...heirs(coll)]) };
  if (method === 'DELETE') {
    unlink(coll, id);
    coll.rows.delete(id);
    // 5.1: a subcollection exists as long as its parent item does, so its items go with it.
    for (const sub of subsOf(nameOf(coll.base ?? coll))) {
      for (const child of view(db[sub], id).rows.keys()) unlink(db[sub], child);
      db[sub].byParent.delete(id);
      db[sub].usedByParent.delete(id);
    }
    return send(res, 204, undefined, invalidation);
  }
  if ('id' in patch && patch.id !== id) throw invalid([{ pointer: '/id', code: 'read_only', detail: t('id cannot change.', 'id no puede cambiar.') }]);
  // 4.3: the patch itself must fit schemas.update, so an unknown member is rejected even when it is null.
  const unknown = Object.keys(patch).filter((f) => !f.startsWith('_') && !Object.hasOwn(coll.types, f));
  if (unknown.length) throw invalid(unknown.map((f) => ({ pointer: ptr(f), code: 'unknown', detail: t(`There is no field ${f}.`, `No hay ningún campo ${f}.`) })));
  // 3: language maps merge like any object, are validated before merging and end as {} when emptied.
  const errors = languageErrors(coll, patch, current);
  errors.push(...relationErrors(coll, patch, id, current), ...inheritErrors(coll, patch, current));
  const row = withMaps(coll, { ...mergePatch(current, patch), id });
  validate(coll, row, t('The result of the patch is not valid.', 'El resultado del parche no es válido.'), errors);
  const conflict = conflicts(coll, row, id);
  if (conflict) throw conflict;
  coll.rows.set(id, row);
  refresh();
  return send(res, prefer ? 204 : 200, prefer ? undefined : withEtag(row), { ETag: etag(row), ...invalidation, ...applied });
}

refresh();
const port = Number(process.env.PORT ?? 8080);
createServer((req, res) => handle(req, res).catch((e) => {
  if (!(e instanceof Problem)) { console.error(e); e = new Problem(500, 'internal', t('Something went wrong on the server.', 'Algo ha fallado en el servidor.')); }
  if (!res.headersSent) problem(res, e, req);
})).listen(port, () => console.log(`Restep 1 (${[...PROFILES, ...EXTENSIONS].join(', ')}) on http://localhost:${port}/`));
