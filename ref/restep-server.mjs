// Restep 1 · Reference implementation of the core, query and writes profiles (and oauth, see below).
// Node 18 or later, no dependencies.  Usage:  node restep-server.mjs  →  http://localhost:8080/
// Specification: https://restep.wubytes.com/1/  (draft 5)
// With RESTEP_TOKEN=secret it also implements the oauth extension (10.5): every request needs
// Authorization: Bearer secret, and the metadata is at /.well-known/oauth-protected-resource.
// The token stands in for one from an authorization server; it does not issue or validate real ones.
// RFC 9728 requires https: behind a local http URL this only simulates the extension.
// It does not implement relations, sync or any other extension: those parameters and paths fail loudly.
// It does have relationship objects (3) and inherited values (5.7): a product and a category take their
// tax rate from their category, their parent category or a default, materialized after every write.
// Field types: it only handles the ones its data uses (string, integer, number, decimal, enum, language
// maps and to-one relationships); a server with date, datetime, duration or boolean fields must add their comparison rules (section 6.1).
// Its own texts (error titles and details, descriptions in discovery) come in English, the default, or
// Spanish, picked by Accept-Language (5.6); the data never changes with it.
import { createServer } from 'node:http';
import { createHash, createHmac, randomBytes } from 'node:crypto';

const SPEC = 'https://restep.wubytes.com/1/';
const PROFILES = ['core', 'query', 'writes'];
const TOKEN = process.env.RESTEP_TOKEN || null;
const EXTENSIONS = TOKEN ? ['oauth'] : [];
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
// A translation is filtered and sorted as field.tag (6.1): it reads that exact key, or nothing.
const at = (row, f) => { const [m, tag] = f.split('.'); return tag === undefined ? row[m] : row[m]?.[tag]; };
const typeOf = (coll, f) => (f.includes('.') ? 'string' : coll.types[f] === 'enum' ? coll.values[f] : coll.types[f]);

// ── Data: the El Marcapáginas bookshop (https://rest.wubytes.com) ─────────────
// Field types follow the discovery vocabulary (section 4.2): they drive validation and comparison.
const rows = (list) => new Map(list.map((r) => [r.id, r]));
const db = {
  books: {
    description: t('Books in the catalogue of El Marcapáginas, one per edition.', 'Libros del catálogo de El Marcapáginas, uno por edición.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'], // 4.3: declared, so they must match Allow
    types: { id: 'string', title: 'string', price: 'decimal', rating: 'number', year: 'integer', category: 'enum' },
    values: { category: ['novela-negra', 'ciencia-ficcion', 'ensayo', 'poesia', 'infantil'] },
    required: ['title', 'price'],
    filter: { id: ['eq', 'in'], price: ['eq', 'lt', 'le', 'gt', 'ge'], category: ['eq', 'ne', 'in'],
      year: ['eq', 'lt', 'le', 'gt', 'ge'], rating: ['ge', 'null'] },
    sort: ['id', 'title', 'price', 'rating', 'year'],
    max_limit: 50,
    count: 'exact',
    rows: rows([
      { id: '7', title: 'La niebla de Portugalete', price: '18.50', rating: 4.6, year: 2025, category: 'novela-negra' },
      { id: '12', title: 'El último ferry', price: '16.90', rating: 4.3, year: 2023, category: 'novela-negra' },
      { id: '15', title: 'Lluvia sobre Deusto', price: '14.95', rating: 4.1, year: 2022, category: 'novela-negra' },
      { id: '21', title: 'Mareas de silicio', price: '19.90', rating: 4.4, year: 2026, category: 'ciencia-ficcion' },
      { id: '23', title: 'Cartografía del ruido', price: '21.00', rating: 4.0, year: 2026, category: 'ensayo' },
      { id: '30', title: 'Cuaderno de faros', price: '12.00', rating: 4.8, year: 2024, category: 'poesia' },
      { id: '50', title: 'Bajo la niebla', price: '11.90', year: 2025, category: 'infantil' },
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
    relations: { category: 'categories' },
    inherit: { tax_rate: { own: 'tax_rate_own', from: ['category'], default: '21',
      description: t('VAT rate in %; without its own, its category\'s.', 'IVA en %; si no tiene propio, el de su categoría.') } },
    filter: { id: ['eq', 'in'], price: ['eq', 'lt', 'le', 'gt', 'ge'], tax_rate: ['eq', 'lt', 'le', 'gt', 'ge'], tax_rate_own: ['null'], 'name.es-mx': ['eq', 'in'], 'name.en-gb': ['eq', 'in'] },
    sort: ['id', 'price', 'tax_rate', 'name.es-mx', 'name.en-gb'],
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
  // Inherited values (5.7): tax_rate is the effective value, tax_rate_own the one that is written.
  // Category 4 inherits from its parent 2; category 3 inherits through 1 down to the default.
  categories: {
    description: t('Product categories, nested; each takes its VAT rate from its parent if it has none.',
      'Categorías de productos, anidadas; cada una toma el IVA de su padre si no tiene propio.'),
    methods: ['GET', 'POST'], item_methods: ['GET', 'PATCH', 'DELETE'],
    types: { id: 'string', name: 'string', parent: 'relation', tax_rate: 'decimal', tax_rate_own: 'decimal' },
    values: {},
    required: ['name'],
    relations: { parent: 'categories' },
    inherit: { tax_rate: { own: 'tax_rate_own', from: ['parent'], default: '21',
      description: t('VAT rate in %; without its own, its parent\'s, and 21 at the top.', 'IVA en %; si no tiene propio, el de su padre, y 21 arriba del todo.') } },
    filter: { id: ['eq', 'in'], tax_rate: ['eq', 'lt', 'le', 'gt', 'ge'], tax_rate_own: ['null'] },
    sort: ['id', 'name', 'tax_rate'],
    max_limit: 50,
    count: 'exact',
    rows: rows([
      { id: '1', name: 'Papelería', parent: null, tax_rate_own: null },
      { id: '2', name: 'Libros', parent: null, tax_rate_own: '4' },
      { id: '3', name: 'Material escolar', parent: { id: '1' }, tax_rate_own: null },
      { id: '4', name: 'Libros infantiles', parent: { id: '2' }, tax_rate_own: null },
      { id: '5', name: 'Lámparas', parent: { id: '1' }, tax_rate_own: '10' },
    ]),
  },
};

// ── Inherited values (5.7) ────────────────────────────────────────────────────
// The effective field is resolved and stored after every write, with _inherited explaining where it
// comes from: so filters, sorting, fields and ETags (7.2) see it like any other field.
const nameOf = (coll) => Object.keys(db).find((n) => db[n] === coll);
// Where field f of a row comes from: { value, href } of the item that holds it, or { value } for the default.
function source(coll, row, f, seen = new Set()) {
  const rule = coll.inherit[f];
  if (row[rule.own] != null) return { value: row[rule.own], href: `/${nameOf(coll)}/${row.id}` };
  for (const r of rule.from) { // the first relationship with a link decides (5.7)
    const to = db[coll.relations[r]], target = row[r] && to.rows.get(row[r].id);
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
      for (const f of [...Object.values(coll.inherit).map((i) => i.own), ...Object.keys(coll.relations ?? {})]) row[f] ??= null;
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
    }
  }
}
// 5.7 and 5.1: the effective field is read-only. Its current value (in a POST, the one that would result)
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
// 3 and 5.1: a relationship is {id} or null; only its id is read, and it must point at an item that exists.
// A link that would make an item its own ancestor is rejected (5.7).
function relationErrors(coll, body, id) {
  const errors = [];
  for (const [r, toName] of Object.entries(coll.relations ?? {})) {
    if (!(r in body) || body[r] === null) continue;
    const v = body[r], to = db[toName];
    if (!isObject(v) || typeof v.id !== 'string') {
      errors.push({ pointer: ptr(r), code: 'type', detail: t(`${r} must be an object with an id, or null.`, `${r} tiene que ser un objeto con un id, o null.`) });
      continue;
    }
    body[r] = { id: v.id };
    if (!to.rows.has(v.id)) { errors.push({ pointer: ptr(r), code: 'unknown', detail: t(`There is no ${toName} ${v.id}.`, `No hay ningún ${toName} ${v.id}.`) }); continue; }
    if (to === coll && id !== undefined) {
      for (let at = v.id, hops = 0; at && hops <= coll.rows.size; at = coll.rows.get(at)?.[r]?.id, hops++)
        if (at === id) { errors.push({ pointer: ptr(r), code: 'cycle', detail: t(`${r} would make ${id} its own ancestor.`, `${r} haría de ${id} su propio antecesor.`) }); break; }
    }
  }
  return errors;
}
// Deleting an item unlinks whoever pointed at it, so they inherit from the next in their chain (5.7).
function unlink(coll, id) {
  for (const other of Object.values(db))
    for (const [r, toName] of Object.entries(other.relations ?? {}))
      if (db[toName] === coll) for (const [k, row] of other.rows) if (row[r]?.id === id) other.rows.set(k, { ...row, [r]: null });
}
let nextId = 100;

// ── core: responses and errors ────────────────────────────────────────────────
const link = [...PROFILES, ...EXTENSIONS].map((p) => `<${SPEC}${p}>; rel="profile"`).join(', ');
// 4.2: the documentation for people, on the discovery response. This API's documentation is the specification.
const DOCS = `<${SPEC}>; rel="service-doc"; hreflang="en"; title="Restep 1, the specification", <https://restep.wubytes.com/es/1/>; rel="service-doc"; hreflang="es"`;
const hash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 16);
// Strong ETag of an item's state: always over the whole item, whatever fields were asked for (7.2).
const etag = (value) => `"${hash(JSON.stringify(value))}"`;

function send(res, status, data, headers = {}, head = false) {
  const body = data === undefined ? '' : JSON.stringify(data);
  // 7.3: with credentials, every response depends on them.
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
    type: `${SPEC}errors#${p.code}`, title: text(TITLES[p.status] ?? 'Error', lang), status: p.status,
    code: p.code, detail: text(p.detail, lang), ...extra,
  }, { 'Cache-Control': 'no-store', Vary: 'Accept-Language', 'Content-Language': lang, ...p.headers }, req.method === 'HEAD'); // 7.3: errors to GET carry Cache-Control too
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
      : t === 'relation' ? { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } : { type: t };
  };
  // 5.7: the effective field is read-only (a write with its current value is ignored); the own one is written.
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
  return {
    item: { type: 'object', required: ['id', ...c.required], properties: { id: { type: 'string', readOnly: true }, ...props('item') } },
    create: { type: 'object', required: c.required, properties: props('create'), patternProperties: reserved, additionalProperties: false },
    update: {
      type: 'object', description: text(t('A JSON Merge Patch: absent leaves a field untouched, null deletes it.',
        'Un JSON Merge Patch: lo ausente no cambia, null lo borra.'), lang),
      properties: { id: { type: 'string', description: text(t('If present, the item\'s own id.', 'Si está, el id del propio ítem.'), lang) }, ...props('update') },
      patternProperties: reserved, additionalProperties: false,
    },
  };
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
function compare(type, a, b) {
  if (type === 'decimal') return cmpDecimal(String(a), String(b));
  if (type === 'integer' || type === 'number') return a - b;
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

function pick(row, fields) {
  if (!fields) return row;
  const out = { id: row.id };
  for (const f of fields) if (f in row) out[f] = row[f];
  // 5.7: _inherited only speaks of the effective fields in the response.
  const why = isObject(row._inherited) ? Object.entries(row._inherited).filter(([f]) => f in out) : [];
  if (why.length) out._inherited = Object.fromEntries(why);
  return out;
}
function parseFields(params, coll) {
  if (params.getAll('fields').length > 1) throw once('fields');
  const raw = params.get('fields');
  if (raw === null) return null;
  const fields = raw.split(',');
  for (const f of fields) {
    // 6.3: a language map is one field, asked for whole.
    if (f.includes('.') && isMap(coll, f.split('.')[0]))
      throw bad('fields', t(`${f.split('.')[0]} is a language map: ask for it whole.`, `${f.split('.')[0]} es un mapa de idioma: pídelo entero.`));
    if (f.includes('.')) throw unsupported('fields', t('Dotted paths in fields need the relations profile.', 'Las rutas con punto en fields necesitan el perfil relations.'));
    if (!Object.hasOwn(coll.types, f)) throw bad('fields', t(`There is no field ${f || '(empty)'}.`, `No hay ningún campo ${f || '(vacío)'}.`));
  }
  return fields;
}

const SAME_FILTER = t('The same filter appears twice.', 'El mismo filtro aparece dos veces.');
function applyFilters(coll, params) {
  let items = [...coll.rows.values()];
  const seen = new Set();
  for (const [key, value] of params) {
    if (reservedName(key) !== 'filter') continue;
    if (key === 'filter') throw unsupported(key, t('filter as an expression needs the filter-expr extension.', 'filter como expresión necesita la extensión filter-expr.'));
    const m = key.match(/^filter\[([^\]]+)\](?:\[([^\]]+)\])?$/);
    if (!m) throw unsupported(key, t('This resource supports filter[field] and filter[field][op].', 'Este recurso admite filter[campo] y filter[campo][op].'));
    const [, field, op = 'eq'] = m;
    if (!Object.hasOwn(coll.filter, field)) throw unsupported(key);
    if (!coll.filter[field].includes(op)) throw unsupported(key, t(`${field} supports: ${coll.filter[field].join(', ')}.`, `${field} admite: ${coll.filter[field].join(', ')}.`));
    if (seen.has(`${field}[${op}]`)) throw bad(key, SAME_FILTER);
    seen.add(`${field}[${op}]`);
    const type = typeOf(coll, field); // an enum parses as its list of values
    if (op === 'null') {
      if (value !== 'true' && value !== 'false') throw bad(key, t('Use true or false.', 'Usa true o false.'));
      items = items.filter((r) => (at(r, field) === undefined || at(r, field) === null) === (value === 'true'));
    } else if (op === 'in') {
      const values = value.split(',');
      if (values.some((v) => v === '')) throw bad(key, t('in needs a non-empty, comma-separated list.', 'in necesita una lista no vacía, separada por comas.'));
      const parsed = values.map((v) => parseValue(type, v, key));
      items = items.filter((r) => at(r, field) != null && parsed.some((v) => compare(type, at(r, field), v) === 0));
    } else {
      const v = parseValue(type, value, key);
      items = items.filter((r) => at(r, field) != null && OPS[op](compare(type, at(r, field), v)));
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
      const x = at(a, f), y = at(b, f);
      if (x == null || y == null) { if (x == null && y == null) continue; return x == null ? 1 : -1; } // missing values last
      const d = compare(typeOf(coll, f), x, y) * (s.startsWith('-') ? -1 : 1);
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
  if (count !== null && count !== 'true' && count !== 'false') throw bad('count', t('Use true or false.', 'Usa true o false.'));
  if (count === 'true' && !coll.count) throw unsupported('count');
  const fields = parseFields(params, coll);
  const page = items.slice(offset, offset + limit);
  let next = null;
  if (offset + limit < items.length) {
    const q = new URLSearchParams(params);
    q.set('cursor', makeCursor(offset + limit, print));
    next = `${path}?${q}`; // always starts with "/" (section 3)
  }
  return {
    items: page.map((r) => pick(r, fields)), next,
    ...(count === 'true' && { total: items.length }),
    ...(count === 'true' && coll.count === 'estimated' && { total_estimated: true }),
  };
}

// ── writes: body, Merge Patch, conditional requests and Idempotency-Key ──────
async function readJson(req, types) {
  const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (!types.includes(type))
    throw new Problem(415, 'unsupported_media_type', t(`Send ${types.join(' or ')}.`, `Envía ${types.join(' o ')}.`), {},
      types.includes('application/merge-patch+json') ? { 'Accept-Patch': 'application/merge-patch+json' } : {});
  let text = '';
  for await (const chunk of req) text += chunk;
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
    if (f.startsWith('_')) continue; // _inherited, stored with the item (5.7)
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

// Idempotency-Key: an sf-string (RFC 9651), scoped to the client and the target (7.1).
const idempotency = new Map(); // scope → { print, response, expires }. In production: a durable store.
const TTL = 24 * 3600 * 1000;
function idempotencyScope(req, path) {
  const raw = req.headers['idempotency-key'];
  if (raw === undefined) return null;
  const m = raw.trim().match(/^"((?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\["\\])*)"$/);
  if (!m) throw new Problem(400, 'bad_request', t('Idempotency-Key must be a quoted string, such as "8e03978e-40d5".', 'Idempotency-Key tiene que ser una cadena entre comillas, como "8e03978e-40d5".'));
  const client = hash(req.headers.authorization ?? 'anonymous');
  return `${client} ${req.method} ${path} ${m[1]}`;
}
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : isObject(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  : JSON.stringify(v));

// ── Routing ───────────────────────────────────────────────────────────────────
const ONLY_READ = t('Only GET and HEAD.', 'Solo GET y HEAD.');
const missing = (url) => new Problem(404, 'not_found', t(`${url.pathname} does not exist.`, `${url.pathname} no existe.`));
async function handle(req, res) {
  refresh(); // 5.7: effective values, after any write (a DELETE may have unlinked items)
  const url = new URL(req.url, 'http://localhost');
  const params = url.searchParams;
  const segments = url.pathname.split('/').filter(Boolean);
  const [name, id, ...rest] = segments;
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
  // oauth (10.5): the metadata is public, is not a resource of the API and never gives 401.
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
    const lang = pickLanguage(req.headers['accept-language']);
    const collections = Object.fromEntries(Object.entries(db).map(([n, c]) => [n, {
      path: `/${n}`, description: text(c.description, lang), methods: c.methods, item_methods: c.item_methods,
      schemas: schemas(c, lang), max_limit: c.max_limit, count: c.count, sort: c.sort,
      filter: Object.fromEntries(Object.entries(c.filter).map(([f, ops]) => [f, { type: f.includes('.') ? 'string' : c.types[f], ...(c.types[f] === 'enum' ? { values: c.values[f] } : {}), ops }])),
      ...(maps(c).length && { language_maps: Object.fromEntries(maps(c).map((f) => [f, {}])) }), // 4.2: all of them
      // 5.7: inherit names relations, so they are declared even without the relations profile.
      ...(c.relations && { relations: Object.fromEntries(Object.entries(c.relations).map(([r, to]) => [r, { to }])) }),
      ...(c.inherit && { inherit: Object.fromEntries(Object.entries(c.inherit).map(([f, i]) => [f,
        { own: i.own, from: i.from, default: i.default !== undefined, description: text(i.description, lang) }])) }),
    }]));
    // 5.4: this API has no domain reasons, and says so: an empty catalogue, complete like any other.
    const doc = { restep: '1.0', version: '1', profiles: PROFILES, extensions: EXTENSIONS, idempotency: { ttl: TTL / 1000 }, status: STATUS, reasons: {}, collections };
    const headers = { ETag: etag([lang, doc]), 'Cache-Control': 'public, max-age=300', Vary: 'Accept-Language', 'Content-Language': lang, Link: `${link}, ${DOCS}` };
    if (weakMatch(req.headers['if-none-match'], headers.ETag)) return send(res, 304, undefined, headers);
    return send(res, 200, doc, headers, method === 'HEAD');
  }
  const coll = Object.hasOwn(db, name) ? db[name] : undefined;
  if (!coll || rest.length || (id !== undefined && id.includes(':')))
    throw missing(url);

  // 5.4: 404 comes before 400, so a missing item is reported before its parameters are looked at.
  if (id !== undefined && !coll.rows.has(id)) throw missing(url);

  // 5.4: 405 comes before 400, so an unsupported method is reported before its parameters are looked at.
  const methods = [...(id === undefined ? coll.methods : coll.item_methods), 'HEAD'];
  if (!methods.includes(method))
    throw new Problem(405, 'method_not_allowed', t(`Supports ${methods.join(', ')}.`, `Admite ${methods.join(', ')}.`), {}, { Allow: methods.join(', ') });

  // 5.3: a reserved parameter this resource and method do not implement fails loudly.
  const allowed = !read ? [] : id === undefined ? ['filter', 'sort', 'fields', 'count', 'limit', 'cursor'] : ['fields'];
  for (const key of new Set(params.keys())) {
    const base = reservedName(key);
    if (!isReserved(base)) continue; // non-reserved parameters belong to the API
    if (!allowed.includes(base)) throw unsupported(key);
    if (base !== 'filter' && key !== base) throw unsupported(key); // only filter has bracketed forms
    if (params.getAll(key).length > 1) throw once(key);
  }
  const location = (r) => `/${name}/${r.id}`;

  if (read) {
    let data, tag;
    if (id === undefined) { data = list(coll, params, url.pathname); tag = etag(data); }
    else if (coll.rows.has(id)) {
      const row = coll.rows.get(id), fields = parseFields(params, coll);
      // The ETag header validates the representation sent; If-Match uses the item's ETag (7.2),
      // which a partial representation carries in _etag.
      data = fields ? { ...pick(row, fields), _etag: etag(row) } : row;
      tag = etag(data);
    }
    else throw missing(url);
    const headers = { ETag: tag, 'Cache-Control': 'no-cache' };
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
    // 7.1: a replay returns the stored response; preconditions were evaluated for the first request only.
    const print = scope && hash(canonical(sent));
    const saved = scope && idempotency.get(scope);
    const live = saved && saved.expires > Date.now() ? saved : null;
    if (live && live.print === print)
      return send(res, ...live.response.slice(0, 2), { ...live.response[2], 'Idempotent-Replayed': 'true' });
    // 5.4: 412 comes before 422, so preconditions are checked before a key reused with another body.
    const collTag = etag(list(coll, new URLSearchParams(), url.pathname));
    if (req.headers['if-match'] !== undefined && !strongMatch(req.headers['if-match'], collTag))
      throw new Problem(412, 'precondition_failed', t('If-Match does not match the current collection.', 'If-Match no coincide con la colección actual.'));
    if (weakMatch(req.headers['if-none-match'], collTag))
      throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current collection.', 'If-None-Match coincide con la colección actual.'));
    if (live) throw new Problem(422, 'idempotency_mismatch', t('That Idempotency-Key was already used with a different request.', 'Esa Idempotency-Key ya se usó con otra petición.'));
    if ('id' in body) throw invalid([{ pointer: '/id', code: 'read_only', detail: t('The server assigns id.', 'El servidor asigna el id.') }]);
    validate(coll, body, undefined, [...languageErrors(coll, body), ...relationErrors(coll, body), ...inheritErrors(coll, body)]);
    const row = withMaps(coll, { ...body, id: String(nextId++) });
    coll.rows.set(row.id, row);
    refresh();
    const response = [201, prefer ? undefined : structuredClone(row), { Location: location(row), ETag: etag(row), ...applied }];
    if (scope) idempotency.set(scope, { print, response, expires: Date.now() + TTL });
    return send(res, ...response);
  }

  const [patch] = method === 'PATCH' ? await readJson(req, ['application/merge-patch+json', 'application/json']) : [null];
  // No await from here on: the If-Match check and the write are atomic (7.2).
  const current = coll.rows.get(id);
  if (!current) throw missing(url);
  const ifMatch = req.headers['if-match'];
  if (ifMatch !== undefined && !strongMatch(ifMatch, etag(current)))
    throw new Problem(412, 'precondition_failed', t('Someone changed it: read it again before writing.', 'Alguien lo ha cambiado: vuelve a leerlo antes de escribir.'));
  if (weakMatch(req.headers['if-none-match'], etag(current)))
    throw new Problem(412, 'precondition_failed', t('If-None-Match matches the current item.', 'If-None-Match coincide con el ítem actual.'));
  if (method === 'DELETE') unlink(coll, id);
  if (method === 'DELETE') { coll.rows.delete(id); return send(res, 204); }
  if ('id' in patch && patch.id !== id) throw invalid([{ pointer: '/id', code: 'read_only', detail: t('id cannot change.', 'id no puede cambiar.') }]);
  // 4.3: the patch itself must fit schemas.update, so an unknown member is rejected even when it is null.
  const unknown = Object.keys(patch).filter((f) => !f.startsWith('_') && !Object.hasOwn(coll.types, f));
  if (unknown.length) throw invalid(unknown.map((f) => ({ pointer: ptr(f), code: 'unknown', detail: t(`There is no field ${f}.`, `No hay ningún campo ${f}.`) })));
  // 3: language maps merge like any object, are validated before merging and end as {} when emptied.
  const errors = languageErrors(coll, patch, current);
  errors.push(...relationErrors(coll, patch, id), ...inheritErrors(coll, patch, current));
  const row = withMaps(coll, { ...mergePatch(current, patch), id });
  validate(coll, row, t('The result of the patch is not valid.', 'El resultado del parche no es válido.'), errors);
  coll.rows.set(id, row);
  refresh();
  return send(res, prefer ? 204 : 200, prefer ? undefined : row, { ETag: etag(row), ...applied });
}

refresh();
const port = Number(process.env.PORT ?? 8080);
createServer((req, res) => handle(req, res).catch((e) => {
  if (!(e instanceof Problem)) { console.error(e); e = new Problem(500, 'internal', t('Something went wrong on the server.', 'Algo ha fallado en el servidor.')); }
  if (!res.headersSent) problem(res, e, req);
})).listen(port, () => console.log(`Restep 1 (${[...PROFILES, ...EXTENSIONS].join(', ')}) on http://localhost:${port}/`));
