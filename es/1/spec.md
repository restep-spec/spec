> Generado a partir de https://restep.wubytes.com/es/1/. Manda la página HTML: si difieren, prevalece ella, y el texto inglés
> prevalece sobre el español (https://restep.wubytes.com/1/spec.md).

# Restep 1 · especificación

## 1. Estado y alcance

**Borrador 6**, 20 de noviembre de 2026 (borrador 5: 20 de noviembre de 2026; borradores 4, 3 y 2: 19 de noviembre de 2026; borrador 1: 12 de noviembre de 2026). Puede cambiar sin aviso hasta que se publique la versión 1.0. Un servidor que lo implementa declara `"restep": "1.0-draft.6"` ([1.1](https://restep.wubytes.com/es/1/#versiones-restep)).

URI de esta versión: `https://w3id.org/restep/1/`, un identificador permanente que redirige al texto inglés en `restep.wubytes.com`.

Se publica en [inglés](https://restep.wubytes.com/1/) y en español. Si las dos versiones no coinciden, prevalece la inglesa, que es a la que llevan las URI de perfil y de error.

También en un solo archivo Markdown, para agentes y para comparar versiones: [`spec.md`](https://restep.wubytes.com/es/1/spec.md).

Restep es un perfil para APIs HTTP que intercambian JSON y se organizan en recursos: el nivel 2 del modelo de madurez de Richardson. Fija lo que ese nivel deja abierto (formato de colecciones y errores, consulta, escrituras seguras, relaciones y sincronización) y lo reparte en seis **perfiles** que se adoptan de uno en uno, más unas **extensiones** opcionales.

Fuera del alcance quedan la autenticación y la autorización (se recomienda OAuth 2.0, con OpenID Connect si la API necesita la identidad del usuario; la extensión [`oauth`](https://restep.wubytes.com/es/1/#oauth) dice dónde pide el token el cliente), el diseño del dominio de cada API y el transporte por debajo de HTTP. Restep no exige esquema ni generador de código: un servidor `core` se puede escribir a mano.

### 1.1 Versiones de Restep

- Restep tiene versión mayor y menor. La mayor va en todas sus URI (`/1/`); el documento de descubrimiento declara la completa: `"restep": "1.0"`.
- Una versión menor solo añade: perfiles; extensiones; miembros del descubrimiento; valores y formas que este texto reserva para versiones menores; significados para peticiones y declaraciones que este texto prohíbe o reserva; y códigos de error para casos nuevos (nunca un código nuevo para un caso que ya tenía uno). No añade ningún requisito sobre lo que define la 1.0, así que lo que cumple la 1.0 sigue cumpliendo la 1.1, salvo en los perfiles y extensiones experimentales ([1.2](https://restep.wubytes.com/es/1/#dependencias)). Añadir códigos de error es seguro porque los clientes tratan los que no conocen por la clase del estado ([5.4](https://restep.wubytes.com/es/1/#errores)), y añadir lo demás, porque los clientes ignoran lo que no conocen ([3](https://restep.wubytes.com/es/1/#datos), [4.2](https://restep.wubytes.com/es/1/#miembros-desconocidos)).
- El valor de `restep` DEBE cumplir esta gramática (ABNF, [**RFC 5234**](https://www.rfc-editor.org/rfc/rfc5234)), así que los números no llevan ceros a la izquierda:

```
restep-version = major "." minor [ "-" pre-release ]
pre-release    = ( "draft" / "rc" ) "." number
major          = number
minor          = number
number         = "0" / ( %x31-39 *DIGIT )
```

- Sin sufijo (`"1.0"`, `"1.1"`) nombra una versión publicada. Con sufijo nombra un borrador (`"1.0-draft.6"`, `"1.1-draft.2"`) o una candidata (`"1.0-rc.1"`) de la versión que va antes del guion. Un servidor que implementa un borrador o una candidata DEBERÍA declararlo así y no como la versión publicada. Un cliente de Restep 1 NO DEBE tratar como documento de descubrimiento de Restep 1 uno cuyo `restep` no cumpla esta gramática o cuya versión mayor no sea 1, y ante uno de otra versión mayor NO DEBE recurrir tampoco a suponer solo `core`, como pide [4.2](https://restep.wubytes.com/es/1/#descubrimiento) a un cliente que no encuentra documento de descubrimiento: esa API no es una que pueda usar como Restep 1.
- Un borrador o una candidata pueden diferir de forma incompatible de la versión publicada del mismo número y de cualquier otro borrador. Un cliente NO DEBE suponer, para una versión con sufijo, las garantías de este apartado: que cumple alguna versión publicada o algún otro borrador. Un cliente que no conoce ese borrador exacto PUEDE trabajar con él según las reglas de la versión sin sufijo, salvo en sus partes experimentales ([1.2](https://restep.wubytes.com/es/1/#experimental)), y trata lo que difiera como trata cualquier error. Los ejemplos de este texto dicen `"1.0"`.
- Una versión menor NO DEBE reservar más nombres de parámetro que los de [5.3](https://restep.wubytes.com/es/1/#reservados), salvo los que empiezan por `$`, que quedan para versiones futuras de Restep.
- Un cambio incompatible será Restep 2, con URI nuevas (`/2/core`…). Las URI de `/1/`, bajo `https://w3id.org/restep/1/`, no cambiarán nunca; si el texto se muda a otro sitio, solo cambia adónde redirigen.
- Hasta que se publique la 1.0, los borradores sí pueden cambiar de forma incompatible.

### 1.2 Perfiles y dependencias

Cada perfil solo añade requisitos; ninguno cambia el tipo ni el significado de lo que define otro anterior, así que anunciar un perfil nuevo nunca rompe a un cliente que ya funcionaba. Algunos perfiles necesitan otros:

| Perfil o extensión | Requiere | Estado |
|---|---|---|
| `core` | Nada; toda API Restep lo implementa | Estable |
| `query`, `writes`, `cache`, `relations` | `core` | Estable |
| `sync` | `core` y `query` (para pedir por `id` los elementos cambiados) | Experimental |
| `actions`, `oauth` | `core` | Estable |
| `batch`, `inherit` | `core` | Experimental |
| `filter-expr`, `query-method` | `query` | Experimental |

Un servidor NO DEBE anunciar un perfil o una extensión sin los que requiere.

Cada perfil y cada extensión es **estable** o **experimental**, como dice la tabla y repite el título de su apartado.

- Uno estable sigue [1.1](https://restep.wubytes.com/es/1/#versiones-restep): las versiones menores posteriores solo le añaden cosas.
- Uno experimental PUEDE cambiar de forma incompatible en una versión menor, hasta que una versión lo declare estable. Es la única excepción a «lo que cumple la 1.0 sigue cumpliendo la 1.1». Pasar de experimental a estable solo es un cambio de ese tipo si cambia el texto.
- Se anuncia como cualquier otro, con su nombre en `profiles` o `extensions`; su forma experimental no tiene un nombre aparte. Un servidor DEBE implementar, para todo lo que anuncia, partes experimentales incluidas, el texto de la versión que declara en `restep`.
- Un cliente NO DEBE usar un perfil o una extensión experimental salvo que `restep` declare una versión cuyo texto de ese perfil o extensión implemente el cliente; si es un borrador o una candidata, ese mismo. Así, un cliente escrito para el `sync` experimental de la 1.0 deja de usarlo con un servidor que declara la 1.1, hasta que aprenda el texto de la 1.1, en vez de seguir reglas que ya no valen. Un cliente usa un perfil o una extensión experimental cuando envía una petición que solo esa parte define, o cuando se apoya en una regla suya para interpretar una respuesta; ignorar sus miembros no es usarlo.

### 1.3 Licencia y proceso

- El texto de esta especificación, sus JSON Schemas y las herramientas de Restep se publican con la licencia MIT. El repositorio de la especificación, [github.com/restep-spec/spec](https://github.com/restep-spec/spec), la guarda en inglés y en español junto con sus JSON Schemas y el servidor de referencia. El texto se lee en `restep.wubytes.com`; sus identificadores (las URI de la versión, los perfiles, los errores y los esquemas) viven bajo `https://w3id.org/restep/`, que redirige allí.
- La licencia permite a cualquiera copiar y modificar el texto; el nombre es otra cosa. Solo lo que cumple el [apartado 12](https://restep.wubytes.com/es/1/#conformidad), en los perfiles y extensiones que dice cumplir, puede presentarse como «Restep 1» o como conforme a Restep 1. Un texto modificado no debe presentarse como Restep ni como esta especificación, aunque puede decir que se basa en Restep 1.
- Las preguntas, las propuestas y las erratas se abren como issues en ese repositorio: un requisito que no está claro, dos que se contradicen, un caso que el texto no cubre. Las pull requests se agradecen allí como propuestas; se aplican en el origen, el sitio de Restep, donde la especificación se escribe junto a sus herramientas.
- Hasta que se publique la 1.0, cada cambio entra en un borrador nuevo, y el [apéndice C](https://restep.wubytes.com/es/1/#cambios) lo recoge. Después, una corrección que no cambia ningún requisito (una errata, un enlace roto, un ejemplo que contradice el texto que ilustra) se publica como fe de erratas en el apéndice C sin cambiar la versión; cualquier otro cambio espera a una versión menor ([1.1](https://restep.wubytes.com/es/1/#versiones-restep)).
- Los apartados 1 a 12 son normativos, salvo sus ejemplos y las frases sin las palabras clave del [apartado 2](https://restep.wubytes.com/es/1/#terminos). El apartado 13 explica riesgos y cita los requisitos que les hacen frente; los apéndices no son normativos.

## 2. Términos

Las palabras DEBE, NO DEBE, DEBERÍA, NO DEBERÍA y PUEDE, y sus plurales, tienen el sentido de MUST, MUST NOT, SHOULD, SHOULD NOT y MAY en el [**RFC 2119**](https://www.rfc-editor.org/rfc/rfc2119) y el [**RFC 8174**](https://www.rfc-editor.org/rfc/rfc8174), solo cuando aparecen así, en mayúsculas. Todo requisito de esta especificación lleva una de ellas; las frases sin ellas explican o dan ejemplos.

- **Raíz de la API**: la URL base con la que se configura un cliente, por ejemplo `https://api.ejemplo.com/` o `https://ejemplo.com/api/`. Las rutas de esta especificación, de los miembros `path` del descubrimiento y de los lotes y de `events` ([10](https://restep.wubytes.com/es/1/#sync)), como `/books`, son relativas a ella: bajo `https://ejemplo.com/api/`, `/books` es `https://ejemplo.com/api/books`. Los enlaces de cuerpos y cabeceras no: son referencias URI ([**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986)) que se resuelven contra la URL de la petición.
- **Colección**: un recurso que agrupa elementos del mismo tipo, como `/books`.
- **Elemento**: un recurso de una colección, como `/books/7`. En inglés, *item*; en el JSON el campo sigue siendo `items`.
- **Singleton**: un recurso que no es una colección ni un elemento de una, declarado aparte en el descubrimiento, como `/me` ([5.9](https://restep.wubytes.com/es/1/#singletons)).
- **Perfil**: un conjunto de requisitos con nombre (`core`, `query`…) y una URI propia, que se anuncia en `profiles`. Un perfil cambia lo que un cliente genérico puede suponer de toda la API: con `writes`, todo `POST` no idempotente admite `Idempotency-Key`.
- **Extensión**: un mecanismo opcional con sintaxis propia (un método, una ruta, una forma de parámetro, un intercambio de cabeceras) y una URI propia, que se anuncia en `extensions`. No cambia nada para un cliente que no lo usa.
- **Parámetro reservado**: un parámetro de consulta cuyo significado define Restep ([apartado 5.3](https://restep.wubytes.com/es/1/#reservados)).
- **Principal**: en nombre de quién actúa una petición, tal como lo autentica el servidor (en OAuth 2.0, el cliente y, si lo hay, el usuario). No es la credencial: una petición con un token renovado viene del mismo principal.
- **Capacidad**: algo que un recurso declara en el descubrimiento dentro de un perfil o una extensión (un filtro, un operador, un campo de orden, una relación, una acción, un mapa de idioma, un `id` elegido por el cliente). Qué significa una capacidad lo dice un perfil o una extensión; si una colección la tiene lo dice solo su declaración.
- **Iguales como valores JSON**: del mismo tipo y, en los objetos, con los mismos nombres de miembro y valores iguales, sea cual sea su orden y su espacio en blanco; en las listas, con elementos iguales en el mismo orden; en los números, el mismo número decimal (`1` y `1.0`); en las cadenas, la misma secuencia de puntos de código una vez quitados los escapes, sin normalización Unicode.

Así, una regla nueva va en un perfil cuando todo cliente de la API puede contar con ella, en una extensión cuando solo se la encuentra un cliente que usa su sintaxis, y en una capacidad cuando vale para unas colecciones y no para otras.

## 3. Datos

- Los cuerpos DEBEN ser JSON ([**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259)) en UTF-8. Las excepciones son las respuestas sin cuerpo (`204`, `304`, `HEAD`), el flujo de eventos de [`sync`](https://restep.wubytes.com/es/1/#sync) y los recursos ajenos a Restep ([5.9](https://restep.wubytes.com/es/1/#singletons)). Sus cadenas NO DEBEN contener sustitutos sin pareja, que JSON solo puede llevar escapados; el servidor PUEDE rechazar un cuerpo de petición que tenga uno, o U+0000, con `422 invalid` y una entrada `format`.
- Una petición con cuerpo a un recurso de Restep (un `POST` a una colección, a una acción o a un lote; un `QUERY`) DEBE llevar `Content-Type: application/json`; un `PATCH` sigue [5.1](https://restep.wubytes.com/es/1/#recursos). El servidor DEBE responder `415 unsupported_media_type` a cualquier otro tipo de medio, y a un cuerpo sin `Content-Type`. Un cuerpo vacío es un cuerpo: sin `Content-Type` DEBE dar `415`, que aquí prevalece sobre el `400` que también permitiría estar vacío ([5.4](https://restep.wubytes.com/es/1/#orden-de-errores)), y con `application/json` DEBE dar `400 bad_request`. La única excepción es un cuerpo vacío a una acción ([11.1](https://restep.wubytes.com/es/1/#actions)). Esto importa sobre todo con cookies: un navegador envía `text/plain`, `application/x-www-form-urlencoded` y `multipart/form-data` desde cualquier origen sin preflight de CORS ([5.8](https://restep.wubytes.com/es/1/#navegadores)), así que un servidor que leyera uno de ellos como JSON aceptaría escrituras que el preflight existe para impedir.
   - El tipo de medio se compara sin distinguir mayúsculas, como dice el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110). `application/json` no define parámetros ([**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259)): el servidor DEBE aceptar `charset=utf-8`, en mayúsculas o minúsculas y con comillas o sin ellas, DEBE responder `415` a cualquier otro `charset` y DEBE ignorar los demás parámetros.
   - Una respuesta `2xx` con cuerpo DEBE llevar `Content-Type: application/json`, salvo el flujo de eventos (`text/event-stream`), un JSON Schema, que PUEDE usar `application/schema+json`, y el estado del servicio, que PUEDE usar `application/health+json` ([4.4](https://restep.wubytes.com/es/1/#salud)). Los errores usan `application/problem+json` ([5.4](https://restep.wubytes.com/es/1/#errores)) diga lo que diga `Accept`: el servidor NO DEBE responder `406` solo porque `Accept` no incluya `application/problem+json`.
- Los nombres de los campos que define Restep van en `snake_case`. Los de cada API son cosa suya, pero DEBERÍAN seguir un único convenio.
- Un **nombre** que da una API y que declara el descubrimiento o lleva un parámetro (la clave de una colección, un singleton, una acción, una relación, un filtro con nombre o una razón, y un campo que declara el descubrimiento o que nombran `filter`, `sort`, `fields`, `include` o [`filter-expr`](https://restep.wubytes.com/es/1/#filter-expr)) DEBE cumplir esta gramática (ABNF, [**RFC 5234**](https://www.rfc-editor.org/rfc/rfc5234)):

```
name = ALPHA *63( ALPHA / DIGIT / "_" / "-" )
```

- Sirve para `snake_case` y para `camelCase`, y distingue mayúsculas de minúsculas. Nunca lleva `.`, `,`, `[`, `]`, `:` ni espacios, que los parámetros y las rutas usan para separar rutas con puntos, listas, operadores y acciones, y nunca empieza por `-`, que marca un orden descendente ([6.2](https://restep.wubytes.com/es/1/#orden)). Una ruta con puntos (`author.id`) son nombres unidos por `.`, salvo que su último segmento puede ser una etiqueta de idioma (`name.es-mx`, [6.1](https://restep.wubytes.com/es/1/#filtros)). Un campo cuyo nombre no cumpla la gramática PUEDE aparecer en las representaciones, pero el servidor NO DEBE declararlo en el descubrimiento, y un parámetro que lo nombre recibe el error de un campo que no existe o no está declarado. Una API no necesita renombrar los campos que nunca declara y que ningún parámetro nombra.
- Los nombres de miembro que empiezan por `_` son de Restep (como `_actions` o `_etag`). Una API NO DEBE definir campos con ese prefijo, salvo los que empiezan por `_x_`.
- Los nombres de miembro que empiezan por `_x_` quedan para extensiones ajenas a Restep, que nunca define ninguno. Son anotaciones del servidor, como los miembros `_` de Restep: una escritura los ignora ([5.1](https://restep.wubytes.com/es/1/#recursos)), `fields` los conserva ([6.3](https://restep.wubytes.com/es/1/#campos)) y los clientes DEBEN ignorar los que no conocen. Sus valores NO DEBEN cambiar entre dos lecturas de la misma versión de un elemento, porque cuentan para su `ETag` ([7.2](https://restep.wubytes.com/es/1/#concurrencia)). Su nombre DEBERÍA llevar tras el prefijo el de la extensión o la organización (`_x_acme_audit`), para que dos extensiones no choquen. Lo que una extensión necesite que el cliente escriba va en campos normales.
- El identificador de un elemento se llama `id`. DEBE ser una cadena no vacía hecha solo de caracteres no reservados del [**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986) (`A–Z a–z 0–9 - . _ ~`), para que vaya en una ruta sin escapar nada, y NO DEBE ser `.` ni `..`, que la resolución de URI eliminaría. NO DEBE cambiar. Dos `id` son el mismo solo cuando son la misma secuencia de puntos de código: el servidor NO DEBE dar `abc` por ocupado porque exista `ABC`, ni servir un elemento en una ruta cuyo último segmento no sea su `id`, como el elemento `7` en `/books/07`. El servidor DEBE comparar cada segmento de una ruta tras decodificar sus porcentajes, así que `/books/%37` es `/books/7`.
- Un campo cuyos valores puedan salirse de ±(2^53−1), o que necesite aritmética decimal exacta (los importes), DEBE ir como cadena en todas las representaciones, sea cual sea el valor: `"price": "18.50"`. Un importe DEBERÍA ir acompañado de su moneda ISO 4217.
- Los instantes DEBEN seguir el `date-time` del [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339), con desfase: `"2026-11-12T09:30:00Z"`. Las fechas de calendario DEBEN usar `full-date`: `"1987-03-14"`. Las duraciones DEBERÍAN ir en ISO 8601 (`"PT90S"`); un campo con segundos como número DEBERÍA acabar en `_seconds`.
- Ausente y `null` no son lo mismo. En una lectura, un campo sin valor PUEDE omitirse o ir a `null`, salvo un mapa de idioma, que es `{}`; en un `PATCH`, `null` borra y ausente no toca ([**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396)).
- Una **relación**, cuando una representación la incluye, DEBE ser un objeto con al menos `id` (a uno), una lista de esos objetos (a muchos), `null` (a uno, vacía) o `[]` (a muchos, vacía). Nunca un identificador suelto, para que el tipo del campo no cambie al incluir el elemento relacionado ([apartado 9](https://restep.wubytes.com/es/1/#relations)). Si una relación puede apuntar a más de una colección, cada objeto DEBE llevar también `type` con el nombre de la colección de destino. Un objeto PUEDE llevar `href`, la ruta del elemento relacionado como enlace absoluto (véase abajo), y DEBE llevarlo cuando la colección de destino es una subcolección, cuyas rutas de elemento no se pueden construir solo con el `id` ([apartado 9](https://restep.wubytes.com/es/1/#relations)).
- Los enlaces de los cuerpos (`next`, `href`) DEBEN ser URI absolutas o rutas absolutas, que empiezan por `/` e incluyen la ruta de la raíz de la API (`/api/books?cursor=…`), para que unos dos puntos dentro de un segmento (`/orders/2001:cancel`) nunca se lean como esquema, como pasaría en la referencia relativa `2001:cancel`. Una URI absoluta entre estos enlaces, entre los enlaces del documento de descubrimiento y en las cabeceras `Location` y `Link` de las respuestas de la API DEBE usar `https` o el esquema de la raíz de la API; un cliente NO DEBE seguir una con otro esquema, como `file:` o `data:`.
- Los clientes DEBEN ignorar los campos que no conocen y tolerar valores de enumeración nuevos, también los que no lista su copia guardada del descubrimiento o de un esquema: un cliente NO DEBE rechazar una respuesta por uno de esos valores, y PUEDE avisar de él. Antes de enviar uno, un cliente PUEDE comprobar su propia entrada contra lo que tiene guardado.
- Las respuestas correctas (`2xx`) de colecciones, elementos y acciones NO DEBEN depender de `Accept-Language`, y no necesitan `Vary: Accept-Language`. Los números, importes, fechas, instantes y duraciones van siempre en las formas de este apartado; presentarlos en un idioma es cosa del cliente. Solo cambian con el idioma los textos propios de la API ([5.6](https://restep.wubytes.com/es/1/#idioma)).
- Un **mapa de idioma** guarda el mismo texto en varios idiomas: un objeto JSON cuyas claves son etiquetas de idioma ([**RFC 5646**](https://www.rfc-editor.org/rfc/rfc5646)) y cuyos valores son cadenas. Solo los campos de primer nivel de un elemento pueden ser mapas de idioma. El idioma de los campos de texto que no lo son no lo dice Restep.

```
"name": { "en": "Zucchini", "en-gb": "Courgette", "es-es": "Calabacín", "es-mx": "Calabacita" }
```

   - Cada clave DEBE ser una etiqueta bien formada (la gramática del apartado 2.1 del [**RFC 5646**](https://www.rfc-editor.org/rfc/rfc5646#section-2.1); no hace falta que esté en el registro) y en minúsculas. El servidor NO DEBE cambiar una clave (`iw` no pasa a `he`). Un valor puede ser cualquier cadena, también `""`.
   - El tipo de un mapa de idioma NO DEBE cambiar: es un objeto aunque tenga una sola traducción o ninguna, y aunque la API hable un solo idioma. Un mapa sin traducciones DEBE darse como `{}`, no ausente ni `null`, salvo que la representación no lleve el campo (por `fields` o por permisos). El servidor NO DEBE rellenar una traducción que no existe con el texto de otro idioma: el cliente elige qué mostrar entre las claves que recibe.
   - En un `POST`, un mapa de idioma es un objeto de cadenas. En un `PATCH` se fusiona como cualquier objeto ([**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396)): `{"name": {"fr": "Courgette"}}` añade o cambia el francés sin tocar el resto, `{"name": {"fr": null}}` lo borra, y borrar una clave que no está no hace nada. Tras fusionar, un mapa de idioma que falta vale `{}`, así que `{"name": null}` lo vacía. Si se declara el esquema `update` ([4.3](https://restep.wubytes.com/es/1/#describir)), DEBE admitir `null` en el campo y en cualquier clave bien formada en minúsculas.
   - El servidor DEBE validar el cuerpo antes de fusionar, también las claves que borra, y DEBE responder `422 invalid` con una entrada en `errors` por cada fallo, con `pointer` a lo que falla y este `code`: `type` si el campo no es un objeto o un valor no es una cadena (en un `PATCH`, `null` vale en los dos sitios; en un `POST`, no); `format` si una clave no es una etiqueta bien formada en minúsculas (`/name/ES`); `unknown` si se añade una traducción, o se le da un valor distinto del guardado, en una etiqueta bien formada que la API no acepta.

## 4. Anunciar Restep

### 4.1 Cabecera de perfil

Toda respuesta de la API DEBERÍA llevar un enlace `rel="profile"` ([**RFC 6906**](https://www.rfc-editor.org/rfc/rfc6906)) a la URI de la versión, y solo ese, para que la cabecera mida lo mismo anuncie lo que anuncie el servidor:

```
Link: <https://w3id.org/restep/1/>; rel="profile"
```

Qué perfiles y extensiones implementa el servidor lo dice solo el documento de descubrimiento ([4.2](https://restep.wubytes.com/es/1/#descubrimiento)). Cada uno sigue teniendo su URI, la de la versión seguida de su nombre (`https://w3id.org/restep/1/query`), que lo nombra en un problema o en un documento, pero el servidor NO DEBERÍA listarlos en las cabeceras de cada respuesta.

Los perfiles valen para toda la API; algunas de sus reglas solo se aplican donde una colección las declara (`filter`, `sync`…). Qué admite cada colección lo dicen solo las declaraciones del documento de descubrimiento.

### 4.2 Documento de descubrimiento

Un `GET` a la raíz de la API devuelve un documento con los perfiles, las extensiones y las capacidades del servidor. Un servidor que solo tiene `core` DEBERÍA servirlo; uno que anuncia cualquier otro perfil o extensión, o que tiene mapas de idioma ([3](https://restep.wubytes.com/es/1/#datos)), DEBE servirlo. Si la raíz ya está ocupada, el servidor PUEDE servirlo en otra ruta y enlazarlo desde sus respuestas con `Link: <…>; rel="service-desc"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)). Una respuesta PUEDE llevar varios enlaces `service-desc`, por ejemplo uno a un documento OpenAPI; el que apunta al documento de descubrimiento DEBERÍA llevar `type="application/json"`, y el cliente DEBE quedarse con el primer destino que sea un documento de descubrimiento.

El cliente DEBE tratar una respuesta como documento de descubrimiento solo si es un objeto JSON con un miembro `restep` de tipo cadena. Si no lo hay, DEBE suponer solo `core`. Si una cabecera `Link` lista perfiles y no coincide con el documento, prevalece el documento.

**Un documento para todos.** El documento de descubrimiento describe la API, no lo que un principal puede hacer con ella:

- Su contenido NO DEBE depender del principal ([2](https://restep.wubytes.com/es/1/#terminos)) ni de si la petición lleva credenciales; solo cambian sus textos, con `Accept-Language` ([5.6](https://restep.wubytes.com/es/1/#idioma)). Dos documentos servidos con el mismo `Accept-Language` DEBEN ser iguales como valores JSON ([2](https://restep.wubytes.com/es/1/#igualdad-json)). Así, dos principales reciben el mismo documento, y una copia guardada con el código de un cliente se puede comparar con la siguiente. Todo lo que declara lo ve quien pueda leerlo ([13.12](https://restep.wubytes.com/es/1/#privacidad)). Una API cuyas colecciones, campos o capacidades cambian según el inquilino da a cada inquilino su propia raíz de la API, con su propio documento de descubrimiento.
- El servidor PUEDE exigir credenciales para servirlo, y responder `401` si no las hay o `403` a un principal que no puede leerlo; a todo aquel a quien se lo sirve le da el mismo documento. Su respuesta depende entonces de las credenciales ([5.1](https://restep.wubytes.com/es/1/#respuestas-privadas)) y DEBE llevar `Cache-Control` con `private` o `no-store`; solo un documento servido sin credenciales PUEDE ser `public` y guardarse en una caché compartida.
- Su respuesta DEBERÍA llevar un `ETag` y un `Cache-Control` con `max-age`. Un cliente PUEDE guardarlo mientras ese `Cache-Control` lo permita, y DEBERÍA revalidarlo después. Un cliente que recibe `unsupported_parameter` ([5.3](https://restep.wubytes.com/es/1/#reservados)) o `405` por algo que su copia declara DEBERÍA volver a pedir el documento antes de concluir que la capacidad ya no existe.
- Lo que un principal no puede hacer lo dice la respuesta a la petición, nunca su ausencia del descubrimiento. Un método, una acción o un singleton declarados que este principal no puede usar DEBEN dar `403 forbidden`, o `404 not_found` donde su existencia se oculta ([5.4](https://restep.wubytes.com/es/1/#errores)), nunca `405` ni `unsupported_parameter`. Para filtros, orden y `fields` sobre un campo que el principal no puede leer, véase [6.1](https://restep.wubytes.com/es/1/#filtros).

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
      "description": "Libros del catálogo, uno por edición.",
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
        "available": { "description": "Con algún ejemplar libre para reservar ahora." },
        "search":    { "type": "string", "description": "Título, autor o ISBN que contienen el texto, sin distinguir mayúsculas." } },
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
        "description": "Aparta un ejemplar para el usuario durante 48 horas.", "input": "/schemas/reserve.json" } } },
    "reviews": { "path": "/books/{book_id}/reviews", "parent": "books", "id_from": "either",
      "sort": ["id", "created_at"], "max_limit": 50 } },
  "singletons": {
    "me": { "path": "/me", "methods": ["GET", "PATCH"], "description": "El perfil y los ajustes del usuario que ha iniciado sesión." } } }
```

Una API DEBERÍA enlazar su documentación para personas con `Link: <…>; rel="service-doc"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)) en la respuesta que sirve su documento de descubrimiento o, si no sirve ninguno, en la respuesta a un `GET` a la raíz de la API, con la raíz de la API como `anchor` ([**RFC 8288**](https://www.rfc-editor.org/rfc/rfc8288)) si esa respuesta es un error. Una respuesta PUEDE llevar varios, y cada uno PUEDE indicar los idiomas de su destino con `hreflang`; el cliente elige entre ellos por `hreflang`, así que el servidor no necesita elegirlos por `Accept-Language`. Esa documentación explica lo que el descubrimiento no puede decir, como las reglas de negocio, los permisos que pide cada operación, los límites de uso y ejemplos. Si contradice al descubrimiento, prevalece el descubrimiento.

```
Link: <https://docs.example.com/api/>; rel="service-doc"; hreflang="es",
      <https://docs.example.com/en/api/>; rel="service-doc"; hreflang="en"
```

- Cada perfil añade sus campos al documento; se describen en su apartado. Todo objeto que este texto define en el documento es de Restep: la raíz, cada colección y cada singleton, `schemas`, `batch`, `idempotency`, `sync`, y cada objeto de filtro, filtro con nombre, relación, acción, retirada, mapa de idioma, razón y herencia. Una versión menor posterior puede añadir miembros a cualquiera de ellos, así que un servidor PUEDE añadir los suyos a cualquiera de ellos, y todo miembro que añada y que este texto no defina DEBE empezar por `x-`; el cliente ignora los miembros que no conoce (véase abajo). Esto no afecta a los nombres que la API da a sus colecciones, singletons, campos, relaciones, acciones y razones, que son claves de `collections`, `singletons`, `filter`, `named_filters`, `relations`, `actions`, `language_maps`, `collations`, `reasons` e `inherit`, y siguen la gramática de los nombres ([3](https://restep.wubytes.com/es/1/#nombres)).
- Los clientes DEBEN ignorar los miembros que no conocen en el documento de descubrimiento y en cualquier objeto que contenga. Cuando un miembro que define Restep tiene un valor que el cliente no conoce (el `type` de un filtro, el `on` o el `method` de una acción, el `kind` de una retirada, un valor reservado para versiones menores), el cliente NO DEBE fallar por ello y NO DEBE usar lo que ese valor califica: trata ese filtro, esa acción o ese aviso como si no estuviera declarado, salvo que este texto dé otra regla para ese miembro (`id_from` en [5.1](https://restep.wubytes.com/es/1/#id-del-cliente), los singletons en [5.9](https://restep.wubytes.com/es/1/#singletons), `collations` en [6.1](https://restep.wubytes.com/es/1/#colaciones), `from` en [11.6](https://restep.wubytes.com/es/1/#herencia)).
- `language_maps`: los campos de una colección que son mapas de idioma ([3](https://restep.wubytes.com/es/1/#datos)), como objeto cuyas claves son los nombres de campo: `"language_maps": {"name": {}, "description": {}}`. DEBE declararlos todos; si falta, la colección no tiene ninguno. El objeto de cada campo queda para versiones menores.
- El `path` de una colección PUEDE ser una plantilla de URI ([**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570)); así se declaran las subcolecciones. Sus variables DEBEN ser cadenas simples (`{name}`) con nombres distintos, así que `/authors/{author_id}/books/{book_id}/reviews`, no `{id}` dos veces; toman por orden los `id` de los elementos padre ([5.1](https://restep.wubytes.com/es/1/#recursos)). Una colección así DEBE nombrar en `parent` la colección de cuyos elementos cuelga, y su `path` DEBE empezar por el `path` de esa colección seguido de `/` y de su última variable: `"reviews": {"path": "/books/{book_id}/reviews", "parent": "books"}`.
- `id_from` ([5.1](https://restep.wubytes.com/es/1/#recursos)) y `collations` ([6.1](https://restep.wubytes.com/es/1/#filtros)) son capacidades de una colección; `singletons` lista los singletons de la API ([5.9](https://restep.wubytes.com/es/1/#singletons)).
- Los tipos de campo, donde el descubrimiento los declara, salen de esta lista: `string`, `integer`, `number`, `decimal` (una cadena que cumple `-?[0-9]+(\.[0-9]+)?`), `boolean`, `date`, `datetime`, `duration` y `enum` (con sus `values`). El descubrimiento solo declara tipos donde Restep los necesita, como en los filtros; la forma de las representaciones y de los cuerpos de las peticiones va en los esquemas de [4.3](https://restep.wubytes.com/es/1/#describir). Una representación también PUEDE enlazar su esquema con `rel="describedby"`.
- Un origen que lista sus APIs en `/.well-known/api-catalog` ([**RFC 9727**](https://www.rfc-editor.org/rfc/rfc9727)) PUEDE incluir ahí una API Restep, con la raíz de la API como `anchor`, un enlace `service-desc` a su documento de descubrimiento y sus enlaces `service-doc`, si los hay.

### 4.3 Describir las operaciones

Miembros opcionales con los que un cliente, sea una persona que lee el documento o un agente que elige herramienta, sabe qué hace y qué acepta cada colección sin probarlo. El servidor PUEDE declarar cualquiera de ellos en cualquier colección; Restep no exige ninguno, así que un servidor `core` se sigue pudiendo escribir a mano.

- `methods` e `item_methods`: los métodos que admiten una colección y sus elementos, de entre `GET`, `POST`, `PATCH` y `DELETE` (`HEAD` va con `GET`; las acciones y `QUERY` se anuncian aparte). Si falta la lista, no se sabe; no significa que estén todos. Una lista declarada DEBE ser exacta: un método que no está da `405`, salvo que se aplique un error anterior en [5.4](https://restep.wubytes.com/es/1/#errores), uno de la lista nunca lo da, y la cabecera `Allow` de un `405` DEBE nombrar todos los métodos declarados y ningún otro de esos cuatro.
- `description`: una explicación breve, en texto plano, de una colección, un singleton, un campo de filtro, una relación, una acción, un campo heredado ([11.6](https://restep.wubytes.com/es/1/#herencia)) o una razón ([5.4](https://restep.wubytes.com/es/1/#errores)). DEBERÍA ser una frase.
- `schemas`: esquemas JSON Schema ([2020-12](https://json-schema.org/draft/2020-12)) del `item` de una colección (su representación sin `fields` ni `include`), de `create` (el cuerpo de un `POST`) y de `update` (el cuerpo de un `PATCH`: un merge patch, donde lo ausente deja el campo como está y `null` lo borra). Cada uno es un objeto de esquema o un enlace a uno, absoluto como los enlaces en los cuerpos ([3](https://restep.wubytes.com/es/1/#datos)). Los esquemas pueden describir cada campo con su propio `description`.
- Un `default` en una propiedad de primer nivel de `create` es el valor que toma el campo cuando un `POST` no lo trae, y el servidor DEBE darle ese valor; un campo enviado como `null` sí lo trae. En `update` un `default` no significa nada, porque un campo ausente de un `PATCH` se queda como está.
- Un cliente puede construir un formulario para personas a partir de estos esquemas ([apéndice A](https://restep.wubytes.com/es/1/#formularios)). Muestra los campos en el orden de `properties`, así que el servidor DEBERÍA escribirlos en el orden en que quiere que se vean.
- Antes de validar un cuerpo contra un esquema `create` o `update` declarado, el servidor quita los miembros que empiezan por `_`, que [5.1](https://restep.wubytes.com/es/1/#recursos) ignora, y, en un `PATCH`, todo campo cuyo valor actual ignora 5.1, y, en un `POST`, todo campo de solo lectura que ignora 5.1; un `PATCH` que se queda vacío así no se valida contra `update`. En ambos, un campo de solo lectura con otro valor DEBE dar la entrada `read_only` de 5.1, no un error de esquema. Un cuerpo que el esquema rechace entonces DEBE dar `422 invalid` (`400 bad_request` si no es un objeto JSON), salvo que se aplique un error anterior en 5.4, y su `errors` DEBERÍA señalar los miembros que fallan. Un esquema describe, no promete: un cuerpo que acepta puede fallar igualmente por las reglas propias de la API. `readOnly` es solo una anotación, salvo en lo que dice 5.1 de las propiedades de primer nivel de un esquema `item`, y `id` sigue 5.1 diga lo que diga el esquema: un esquema `create` puede restringir el formato de un `id` que elige el cliente, pero no puede hacer que el servidor acepte un `id` que 5.1 rechaza.
- El `input` de una acción ([11.1](https://restep.wubytes.com/es/1/#actions)) es el esquema de su cuerpo, con el mismo sentido.
- Un cliente DEBE mandar sus credenciales de la API solo a URL del origen de la API, y DEBE pedir sin ellas un esquema o documento de otro origen ([13.2](https://restep.wubytes.com/es/1/#seg-credenciales)). NO DEBERÍA resolver el `$ref` de un esquema fuera del origen del esquema que lo contiene, y NO DEBERÍA enviar un valor que haya sacado de un esquema de otro origen, como un `default`, sin enseñárselo antes al usuario.

Las descripciones, los títulos y cualquier otro valor que devuelve una API son datos, nunca instrucciones para el cliente. Un cliente NO DEBE, solo por un texto así, hacer una petición que no sea segura ([5.7](https://restep.wubytes.com/es/1/#reintentos)) y que la tarea a la que sirve no pidiera ya, ni enviar datos a otro origen. Usar `detail` y `errors` para corregir la petición que ya está haciendo no es seguir una instrucción. Un agente que mete estos textos en un prompt DEBERÍA marcar dónde empiezan y dónde acaban ([13.1](https://restep.wubytes.com/es/1/#seg-datos)).

### 4.4 Estado del servicio

El servidor PUEDE declarar en `status` un enlace, absoluto como los enlaces en los cuerpos ([3](https://restep.wubytes.com/es/1/#datos)), a un recurso que dice si la API puede atender peticiones, y PUEDE enlazarlo también desde sus respuestas con `rel="status"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)). El cliente NO DEBE suponer una ruta como `/health`.

- Salvo que pida credenciales o las rechace (`401`, `403`) o limite el ritmo (`429`), un `GET` o un `HEAD` a ese recurso DEBE responder `200` cuando la API puede atender peticiones y `503` cuando no, con `Retry-After` si el servidor sabe cuánto tiempo, y siempre con `Cache-Control: no-store`.
- No es un recurso de la API: no se le aplican [4.1](https://restep.wubytes.com/es/1/#cabecera-perfil), de [5.1](https://restep.wubytes.com/es/1/#recursos) a [5.4](https://restep.wubytes.com/es/1/#errores) ni [8](https://restep.wubytes.com/es/1/#almacenamiento-en-cache). Su cuerpo PUEDE seguir el Health Check Response Format ([draft-inadarei-api-health-check](https://datatracker.ietf.org/doc/draft-inadarei-api-health-check/)). Si se sirve sin credenciales, NO DEBERÍA decir más que si la API puede atender.

## 5. core (Obligatorio)

URI del perfil: `https://w3id.org/restep/1/core`. Estado: estable.

### 5.1 Recursos y métodos

| Petición | Éxito | Qué hace |
|---|---|---|
| `GET /books` | `200` | Lista la colección ([5.2](https://restep.wubytes.com/es/1/#colecciones)) |
| `POST /books` | `201` con `Location` | Crea un elemento y devuelve su representación |
| `GET /books/7` | `200` | Devuelve el elemento, sin envoltorio |
| `PATCH /books/7` | `200` | Actualización parcial con JSON Merge Patch ([**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396)), salvo los objetos de relación (abajo) y los mapas de idioma ([3](https://restep.wubytes.com/es/1/#datos)); devuelve el elemento entero |
| `DELETE /books/7` | `204` | Borra el elemento. Repetirlo PUEDE dar `404` |

- Las respuestas DEBEN usar los estados de la tabla para esas operaciones, salvo cuando [7.3](https://restep.wubytes.com/es/1/#respuesta-minima) permite responder sin cuerpo.
- `PUT` queda fuera de Restep 1: un cliente que sustituye un elemento entero borraría los campos que se añadieron al elemento después de programarse ese cliente. El cliente DEBERÍA usar `PATCH`.
- `HEAD` DEBE funcionar allí donde funcione `GET` ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110)). `GET` y `HEAD` NO DEBEN tener efectos visibles para el cliente.
- Una respuesta que depende de las credenciales DEBE llevar `Cache-Control` con `private` o `no-store`, anuncie o no el servidor [`cache`](https://restep.wubytes.com/es/1/#cache), para que una caché compartida nunca se la dé a otro principal ([**RFC 9111**](https://www.rfc-editor.org/rfc/rfc9111)). Las credenciales son aquello con lo que el servidor autentica la petición: `Authorization`, cookies, un certificado de cliente. Una respuesta que cambia según una cookie depende de las credenciales, y también un error cuyo estado depende de quién pregunta, como un `404` que oculta un elemento solo a este principal, un `401` o un `403`, o un documento de descubrimiento que solo se sirve con credenciales ([4.2](https://restep.wubytes.com/es/1/#cache-del-descubrimiento), [13.10](https://restep.wubytes.com/es/1/#seg-cache)). Esto abarca todas las respuestas de la API, incluidas las de los recursos fuera de Restep ([5.9](https://restep.wubytes.com/es/1/#fuera)) y los errores de la capa de autenticación del servidor.
- Un método que el recurso no admite DEBE dar `405` con la cabecera `Allow`. `OPTIONS` queda fuera de Restep: el servidor PUEDE responderlo para CORS ([5.8](https://restep.wubytes.com/es/1/#navegadores)).
- `PATCH` DEBE aceptar `application/merge-patch+json` y DEBERÍA aceptar también `application/json` con el mismo significado. Cualquier otro tipo de medio, o ninguno, DEBE dar `415`, y `charset` sigue [3](https://restep.wubytes.com/es/1/#tipos-de-medio). Un `415` a un `PATCH` DEBERÍA llevar `Accept-Patch` ([**RFC 5789**](https://www.rfc-editor.org/rfc/rfc5789)). Un parche que no es un objeto JSON DEBE dar `400 bad_request`.
- La ruta de un elemento DEBE ser la de su colección, con la plantilla de URI expandida si la hay ([**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570)), cuyas variables toman por orden los `id` de los elementos padre, y sin `/` final, seguida de `/` y el `id` del propio elemento: `/books/7`, `/books/7/reviews/3`.
- Quién elige el `id` de un elemento es una capacidad de su colección, que se declara en `id_from`:
   - Ausente o `"server"`: el servidor DEBE asignar el `id`, y DEBE dar `422 invalid`, con una entrada `read_only` en `/id`, a un `POST` que trae uno.
   - `"client"`: un `POST` DEBE traer `id`; sin él, el servidor DEBE dar `422 invalid` con una entrada `required` en `/id`.
   - `"either"`: un `POST` PUEDE traer `id`; sin él, el servidor asigna uno.
   - Los demás valores quedan reservados para versiones menores. Un cliente que encuentra uno que no conoce NO DEBE enviar `id` en un `POST` a esa colección.
- Lo elija quien lo elija, un `id` nunca cambia: un `PATCH` que trae uno distinto DEBE dar `422 invalid` con una entrada `read_only`, como se dice abajo. Para un `id` que elige el cliente:
   - Sigue [3](https://restep.wubytes.com/es/1/#datos). Uno que no lo sigue (no es una cadena, está vacío, lleva otros caracteres, es `.` o `..`) DEBE dar `422 invalid` con una entrada `type` o `format` en `/id`. El servidor PUEDE restringir más su formato, y entonces DEBERÍA decir cómo en el esquema `create` ([4.3](https://restep.wubytes.com/es/1/#describir)); un `id` bien formado que se sale de ese formato recibe el mismo `422` con `format`. El servidor DEBERÍA exigir un formato con entropía suficiente para que los clientes no coincidan por azar, como un UUID o un ULID; si oculta a algunos principales la existencia de elementos de esa colección ([5.4](https://restep.wubytes.com/es/1/#errores)), DEBE exigir un formato que no se pueda adivinar, como un UUID de la versión 4, porque el `409` de abajo dice si un `id` está en uso. Un cliente DEBERÍA generar ese `id` a partir de una fuente aleatoria y NO DEBERÍA derivarlo de los datos del elemento (un correo, un nombre), porque quien pueda adivinarlo puede quedárselo antes o saber por el `409` de abajo que existe ([13.6](https://restep.wubytes.com/es/1/#seg-id-del-cliente)).
   - Un `id` que tiene o ha tenido un elemento de la misma colección (en una subcolección, bajo el mismo elemento padre) DEBE dar `409 conflict` con una entrada de `errors` cuyo `pointer` es `/id` y cuyo `code` es `taken`. Esa respuesta DEBE ser la misma pueda o no ver el cliente el elemento que tiene el `id`, o pudiera o no ver el que lo tuvo. El servidor DEBE conocer esos `id` mientras exista la colección; una subcolección existe mientras exista su elemento padre. Un servidor que reutiliza el `id` de un elemento padre borrado, cosa que desaconseja el punto siguiente, NO DEBE dejar que la subcolección del padre nuevo tome un `id` que tuvo la del antiguo. PUEDE guardar solo un hash unidireccional de los `id` de los elementos borrados.
   - Así, un cliente nunca recibe de vuelta el `id` de un elemento borrado: con [`sync`](https://restep.wubytes.com/es/1/#sync), no podría distinguir el elemento nuevo del antiguo que vuelve. Por lo mismo, el servidor NO DEBERÍA reutilizar en una colección los `id` que asigna él.
   - Así, un `POST` con un `id` elegido por el cliente nunca crea dos elementos. Un cliente que lo repite y recibe `409` con `taken` lee el elemento para saber si su primer intento tuvo efecto ([5.7](https://restep.wubytes.com/es/1/#reintentos)); con [`writes`](https://restep.wubytes.com/es/1/#writes), `Idempotency-Key` funciona como en cualquier `POST` y devuelve en su lugar la respuesta guardada ([7.1](https://restep.wubytes.com/es/1/#idempotencia)).
- En una escritura, el servidor DEBE ignorar los miembros cuyo nombre empieza por `_`, para que el cliente pueda devolver una representación que leyó.
- Un **campo de solo lectura** es uno que ningún cliente puede cambiar con un `PATCH`: `id`, un campo efectivo ([11.6](https://restep.wubytes.com/es/1/#herencia)), uno que solo pone el servidor (`created_at`, un total) o una propiedad de primer nivel que el esquema `item` marca con `"readOnly": true` directamente en sus `properties` ([4.3](https://restep.wubytes.com/es/1/#describir)); un servidor NO DEBE marcar así una propiedad que algún cliente o algún estado del elemento deja cambiar con un `PATCH`. Un valor de un `PATCH` es el **actual** cuando es igual al valor del campo tal como se leyó, según el tipo del campo (el mismo decimal, el mismo instante), o cuando aplicarlo como dice este apartado (una relación por su `id`, un mapa de idioma por clave) deja el campo como estaba antes del `PATCH`. Si un `PATCH` trae un campo de solo lectura con su valor actual, el servidor DEBE ignorarlo; con otro valor, DEBE responder `422 invalid` con una entrada `read_only` cuyo `pointer` es el campo, y NO DEBE aplicar nada de esa petición. Un campo que este cliente, o el estado actual del elemento, no le deja cambiar sigue la primera mitad de esa regla: su valor actual se DEBE ignorar, y otro valor DEBE dar `403 forbidden` si este principal no puede cambiarlo, o `409 conflict` si el estado del elemento no lo permite, sin aplicar nada de esa petición; los dos DEBERÍAN llevar una entrada de `errors` cuyo `pointer` es el campo. En un campo que el cliente puede leer, el servidor compara después de validar un mapa de idioma como dice [3](https://restep.wubytes.com/es/1/#datos). En uno que no puede leer, no se aplican ni las reglas anteriores ni las comprobaciones de 3 que miran el valor guardado: el servidor PUEDE validar el valor enviado (un campo de solo escritura, como una contraseña, se valida como cualquier otro), pero su respuesta NO DEBE depender del valor guardado.
- En un `POST`, un campo de solo lectura distinto de `id` (cuyas reglas están arriba) se DEBE ignorar si su valor es el que recibiría el elemento, y si no, DEBE dar `422 invalid` con una entrada `read_only` cuyo `pointer` es el campo. El caso es el de una representación leída que se reenvía; un cliente que no conoce ese valor, como un `created_at` que pone el servidor, deja fuera el campo.
- Un `PATCH` válido que, dejando aparte los campos que ignora, no cambiaría ningún dato del elemento NO DEBE cambiarlo: su representación y su `ETag`, si la hay, siguen igual, y un campo como `updated_at` no se mueve. Así, los campos de solo lectura de una representación leída nunca hacen fallar un `PATCH` ni cambian nada, si el elemento no ha cambiado desde entonces.
- En una escritura, el objeto de una relación se sustituye entero, no se fusiona: el servidor DEBE leer solo su `id` (y `type`, y `href` cuando su destino es una subcolección) y NO DEBE modificar a través de él el elemento relacionado. Para enlazar un elemento de una subcolección, el cliente DEBE enviar su `href`, tal como lo leyó; un `href` que no es la ruta de un elemento de la colección de destino, o cuyo último segmento no es el `id` enviado, DEBE dar `422 invalid`. Una relación con un elemento que no existe, o que el principal no puede ver, DEBE dar `422 invalid` con una entrada cuyo `pointer` es el `id` de la relación (`/author/id`) y cuyo `code` es `unknown`, igual en los dos casos. Una relación cuyo valor es el actual (deja el campo como estaba) no se comprueba así: el servidor DEBE ignorarla, de modo que devolver una representación tal como se leyó nunca falla por ella. `{"author": {"id": "4"}}` enlaza otro autor; `{"author": null}` quita el enlace. Una lista a muchos se sustituye entera, como hace Merge Patch con cualquier lista.

### 5.2 Colecciones

Una colección DEBE responder con un objeto que tenga `items` (una lista) y `next`: la URL de la página siguiente o `null` si no hay más. `next` DEBE estar presente siempre, aunque el servidor no pagine todavía.

```
{ "items": [ { "id": "7", "title": "La niebla de Portugalete" } ],
  "next": null }
```

- El cliente DEBE seguir `next` tal cual, sin modificarla ni construirla, salvo los parámetros que [6.4](https://restep.wubytes.com/es/1/#paginacion) le deja cambiar entre páginas. Codificarla de nuevo no cuenta como modificarla: el servidor DEBE leer los parámetros tras decodificar los porcentajes, así que `filter[price]` y `filter%5Bprice%5D`, o `%5b` y `%5B`, son lo mismo, y NO DEBE depender del orden de parámetros con nombres distintos. El servidor DEBE leer un `+` de la query como un espacio, como hacen los formularios HTML y la mayoría de los frameworks HTTP, y DEBE escribir un `+` literal como `%2B` en los enlaces que construye; un cliente DEBE enviar un `+` literal como `%2B`. Siempre que este texto dice «tras decodificar los porcentajes» de la query, un `+` es un espacio.
- Una colección DEBE tener un orden por defecto determinista. Cuando ese orden, o una ordenación ([6.2](https://restep.wubytes.com/es/1/#orden)), usa `id`, es el orden de sus `id` que tenga el servidor: total y estable, pero no necesariamente por puntos de código (con `id` numéricos, `"7"` puede ir antes que `"12"`). El cliente NO DEBE suponer ningún orden de los `id`. Sin escrituras concurrentes, seguir `next` hasta `null` DEBE devolver cada elemento exactamente una vez. Con escrituras concurrentes puede haber repetidos u omitidos; el cliente que necesite una copia exacta usa [`sync`](https://restep.wubytes.com/es/1/#sync).
- El servidor elige el tamaño de página. Sin el perfil `query`, el cliente no puede cambiarlo.
- El objeto PUEDE llevar otros campos definidos por los perfiles (`total`, `state`).

### 5.3 Parámetros reservados: fallar en voz alta

Estos nombres de parámetro, con y sin corchetes, son de Restep: `filter`, `sort`, `fields`, `include`, `count`, `limit`, `cursor`, `since` y `languages` (sin uso en Restep 1), más cualquier nombre que empiece por `$`.

Las formas que define Restep son `nombre=valor` y, para `filter`, `filter[campo]` y `filter[campo][op]`. Cualquier otra forma con corchetes (`filter[a][b][c]`, `filter[]`, `fields[]`) es una forma que el recurso no admite.

> Salvo que aplique un error que va antes en [5.4](https://restep.wubytes.com/es/1/#errores), si una petición usa un parámetro reservado, o una forma de uno, que el recurso no implementa para ese método, el servidor DEBE responder `400` con el código `unsupported_parameter` y el nombre del parámetro, tal como llegó tras decodificar los porcentajes, en `parameter`. NO DEBE ignorarlo.

Es la regla que permite subir de peldaño sin romper a nadie: un cliente que filtra contra un servidor que no sabe filtrar recibe un error claro, en vez de la colección entera como si el filtro se hubiera aplicado. Los parámetros que no son reservados son de cada API, y Restep no dice nada sobre ellos.

Los dos códigos de parámetro le dicen al cliente si debe corregir la petición o renunciar a la capacidad:

- `unsupported_parameter` DEBE usarse cuando la petición pide algo que el recurso no ofrece: un parámetro reservado que no implementa, una forma de parámetro que no admite (`filter=…` sin [`filter-expr`](https://restep.wubytes.com/es/1/#filter-expr), `sort[…]`), un campo u operador de filtro, un campo de orden o una relación que no están declarados, `count` con cualquier valor en una colección que no lo declara ([6.5](https://restep.wubytes.com/es/1/#recuento)), o `fields` o `include` en un método que no sea `GET`, `HEAD` ni `QUERY` ([6.3](https://restep.wubytes.com/es/1/#campos)). Vale para todos los métodos: `POST /books?filter[x]=1` también lo da.
- `invalid_parameter` DEBE usarse cuando una capacidad admitida recibe un valor erróneo: un valor que no encaja con el tipo del campo, un `limit` fuera de rango, un campo de `fields` que no existe, una lista vacía, un parámetro repetido, un cursor no válido. Igual que `unsupported_parameter`, DEBE llevar en `parameter` el nombre del parámetro que falla, tal como llegó tras decodificar los porcentajes; si falta, su nombre; en el cuerpo de un `QUERY` ([11.4](https://restep.wubytes.com/es/1/#query-method)), el nombre del parámetro equivalente de un `GET`, como `filter[price][le]`, o el del propio miembro si no lo hay. Si fallan varios, `parameter` nombra uno de ellos, y `errors` PUEDE listar cada uno con su `parameter`. Un servidor cuyo framework se queda con un solo valor de un parámetro repetido DEBE detectar igualmente la repetición, leyendo él mismo la query si hace falta.
- Algunos límites se declaran: `max_limit` ([6.4](https://restep.wubytes.com/es/1/#paginacion)), `include_depth` ([9](https://restep.wubytes.com/es/1/#relations)) y `batch.max_operations` ([11.2](https://restep.wubytes.com/es/1/#batch)). Un servidor PUEDE limitar también, sin declararlo, cuánto pide una petición a una capacidad admitida: los valores de una lista `in`, el número de filtros, el tamaño de una expresión [`filter-expr`](https://restep.wubytes.com/es/1/#filter-expr). Una petición que pasa de ese límite DEBE dar `invalid_parameter` con el nombre del parámetro, y su `detail` DEBERÍA decir el límite; el servidor NO DEBE aplicar solo una parte, ni responder `unsupported_parameter`, porque la capacidad existe. Una URL más larga de lo que acepta el servidor DEBE dar `414`; un cuerpo más grande de lo que acepta, `413`, y demasiadas peticiones o flujos abiertos, `429` ([13.8](https://restep.wubytes.com/es/1/#seg-limites)).

### 5.4 Errores

Toda respuesta `4xx` o `5xx` que genera la API DEBE ir en `application/problem+json` ([**RFC 9457**](https://www.rfc-editor.org/rfc/rfc9457)) si tiene cuerpo, con `type`, `title`, `status` (igual al de la respuesta) y `code`. DEBERÍA llevar `detail`, que diga, cuando se pueda, cómo arreglar la petición (los valores aceptados, el rango permitido), y PUEDE llevar `instance` y miembros propios. Un error NO DEBE enviarse como respuesta `200`; el único sitio donde va un error dentro de un `200` es el resultado de una operación de [`batch`](https://restep.wubytes.com/es/1/#batch).

```
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{ "type": "https://w3id.org/restep/1/errors#invalid",
  "title": "Datos no válidos",
  "status": 422,
  "code": "invalid",
  "errors": [ { "pointer": "/price", "code": "required", "detail": "«price» es obligatorio." } ] }
```

- `code` DEBE salir de la tabla de abajo. Para un estado que la tabla no recoge, `code` DEBE ser la descripción de ese estado en el registro de códigos de estado HTTP de la IANA, en `snake_case` (`502` → `bad_gateway`, `431` → `request_header_fields_too_large`), o `http_` seguido del número si el estado no está registrado.
- `type` DEBERÍA ser `https://w3id.org/restep/1/errors#` seguido del código, o una URI propia de la API que documente el caso. PUEDE ser `about:blank`.
- Para errores del dominio de la API (saldo insuficiente, sin existencias) la respuesta PUEDE añadir `reason`: una cadena que define la API y que no cambia dentro de una versión, que DEBE seguir la gramática de los nombres ([3](https://restep.wubytes.com/es/1/#nombres)) y DEBERÍA ir en `snake_case`. `code` sigue dando la clase (`conflict`, `invalid`), así que un cliente genérico sigue sabiendo qué hacer.
- La API PUEDE declarar sus razones en el descubrimiento, en `reasons` en la raíz: un objeto cuyas claves son los valores de `reason`; cada valor lleva el `code` con el que sale esa razón y PUEDE llevar una `description` ([4.3](https://restep.wubytes.com/es/1/#describir)): `"reasons": {"out_of_stock": {"code": "conflict", "description": "No quedan ejemplares que apartar."}}`. Si se declara, DEBE estar completo: un error NO DEBE llevar un `reason` que no figure en él, ni llevarlo con otro `code`. Esto vale para el `reason` de primer nivel de todo error, también los de los resultados de [`batch`](https://restep.wubytes.com/es/1/#batch), y no para los códigos propios de la API dentro de `errors`. Si falta `reasons`, no se sabe qué razones hay. El cliente DEBE tratar un `reason` que no conoce como trata su `code`, así que añadir una razón nunca lo rompe.
- Los errores de validación DEBERÍAN listar los problemas en `errors`. Cada entrada lleva un `pointer` (JSON Pointer, [**RFC 6901**](https://www.rfc-editor.org/rfc/rfc6901), al cuerpo de la petición; Restep usa la forma de cadena simple, no el fragmento de URI), o el nombre de un `parameter` o una `header`, más un `code`: `required`, `type`, `format`, `range`, `too_long`, `unknown`, `read_only`, `taken` (un `id` ya usado, [5.1](https://restep.wubytes.com/es/1/#recursos)) u otro propio de la API.
- Un `401` DEBE llevar `WWW-Authenticate` ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110)).
- El cliente DEBE tratar un `code` que no conoce según la clase del `status`.
- Un error, incluidos su `detail` y las entradas de su `errors`, NO DEBE revelar lo que el principal no podría saber de otro modo: valores que no puede leer, o si existe un recurso que se le oculta, salvo que un `id` está ocupado ([5.1](https://restep.wubytes.com/es/1/#recursos)). NO DEBERÍA llevar detalles internos, como trazas de la pila, consultas o nombres de servicios internos ([13.12](https://restep.wubytes.com/es/1/#privacidad)).
- Si a una petición se le aplica más de uno de estos errores, el servidor DEBE dar uno del primer paso que se aplique, en este orden:
   1. `401`, después `403`;
   2. `404`, después `410`;
   3. `405`;
   4. `400` por un parámetro o una cabecera: `unsupported_parameter` e `invalid_parameter`, que no tienen orden entre sí, antes que los códigos de una cabecera (`bad_request`, `idempotency_key_required`);
   5. cualquiera de `400` por el cuerpo, `415`, `406` y `413`, que no tienen orden entre sí, salvo que un cuerpo vacío sin `Content-Type` da `415` ([3](https://restep.wubytes.com/es/1/#tipos-de-medio));
   6. una repetición o un `409 request_in_progress` ([7.1](https://restep.wubytes.com/es/1/#idempotencia));
   7. `428`, después `412`, después `422` o el `403` por un campo que este principal no puede cambiar ([5.1](https://restep.wubytes.com/es/1/#recursos)), y después `409 conflict`, incluido el de un campo que el estado del elemento no deja cambiar.
- El paso 1 abarca un `403` que no depende del cuerpo ni del elemento guardado. Los demás códigos que comparten estado no tienen orden. El orden también decide entre errores que exigen otros apartados ([4.3](https://restep.wubytes.com/es/1/#describir), 5.3, [10](https://restep.wubytes.com/es/1/#sync), [11](https://restep.wubytes.com/es/1/#extensiones)). Antes de dar un error, el servidor DEBE descartar los de pasos anteriores que pueda comprobar. Un `413`, o cualquier otro error, que da un servidor HTTP o un intermediario situado delante de la API antes de que la petición llegue a ella queda fuera de este orden. Si se evalúan o no las cabeceras condicionales lo dice el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.1) (apartado 13.2.1); cuando se evalúan, este orden manda sobre el momento en que las evalúa el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.2) (apartado 13.2.2), así que un cuerpo que no es JSON da `400` antes que una precondición fallida. El orden no dice nada de los estados que no lista, como `414`, `424`, `429` y los `5xx`. Si la API no revela si un recurso existe, el servidor DEBE dar `404` en ese caso, no `403`; un recurso retirado DEBE dar `410`, no `404`, salvo que se oculte su existencia.

| `code` | Estado | Cuándo | Perfil |
|---|---|---|---|
| `bad_request` | 400 | El cuerpo no es JSON o no tiene la forma esperada; una cabecera mal formada o rechazada | core |
| `invalid_parameter` | 400 | Un parámetro admitido con un valor erróneo ([5.3](https://restep.wubytes.com/es/1/#reservados)) | core |
| `unsupported_parameter` | 400 | El recurso no ofrece lo que pide el parámetro ([5.3](https://restep.wubytes.com/es/1/#reservados)) | core |
| `idempotency_key_required` | 400 | El recurso exige `Idempotency-Key` y no ha llegado | writes |
| `unauthenticated` | 401 | Faltan credenciales o no son válidas; va con `WWW-Authenticate` | core |
| `forbidden` | 403 | Credenciales válidas sin permiso para esto, cuando el cliente puede saber que el recurso existe | core |
| `not_found` | 404 | El recurso no existe, o no se quiere revelar que existe | core |
| `method_not_allowed` | 405 | El recurso no admite ese método; va con `Allow` | core |
| `not_acceptable` | 406 | El servidor no puede producir ningún tipo de los de `Accept` | core |
| `conflict` | 409 | Choca con el estado actual: un duplicado (como un `id` ya usado, [5.1](https://restep.wubytes.com/es/1/#recursos)), una transición imposible, una acción que no está disponible en el estado del elemento ([11.1](https://restep.wubytes.com/es/1/#actions)) | core |
| `request_in_progress` | 409 | La misma petición que otra que aún se está procesando con la misma `Idempotency-Key` ([7.1](https://restep.wubytes.com/es/1/#idempotencia)); DEBERÍA llevar `Retry-After` | writes |
| `state_expired` | 410 | El servidor ya no puede calcular los cambios desde ese estado | sync |
| `retired` | 410 | Un recurso o una acción retirados tras su fecha de `Sunset` ([5.5](https://restep.wubytes.com/es/1/#versiones)) | core |
| `precondition_failed` | 412 | Falla una precondición (`If-Match`, `If-None-Match`) de una escritura: el recurso cambió desde que el cliente lo leyó, o `If-None-Match` coincidió con él | writes |
| `content_too_large` | 413 | El cuerpo es demasiado grande, o un lote supera `max_operations` | core |
| `uri_too_long` | 414 | La URL es demasiado larga (ver [`query-method`](https://restep.wubytes.com/es/1/#query-method)) | core |
| `unsupported_media_type` | 415 | Tipo de contenido no admitido, o ausente en un cuerpo ([3](https://restep.wubytes.com/es/1/#tipos-de-medio)) | core |
| `invalid` | 422 | El cuerpo se entiende pero no es válido; detalle en `errors` | core |
| `idempotency_mismatch` | 422 | La misma `Idempotency-Key` con otra petición | writes |
| `not_executed` | 424 | Una operación de un lote que no dejó efecto porque falló otra | batch |
| `precondition_required` | 428 | El recurso exige `If-Match` para escribir | writes |
| `rate_limited` | 429 | Demasiadas peticiones; DEBERÍA ir con `Retry-After` | core |
| `internal` | 500 | Fallo del servidor | core |
| `not_implemented` | 501 | El servidor no conoce el método (como `QUERY`) | core |
| `unavailable` | 503 | No disponible por un tiempo; DEBERÍA ir con `Retry-After` | core |

### 5.5 Evolución y versiones

Una API Restep evoluciona sin versiones mientras los cambios sean compatibles, y solo crea una versión mayor cuando no queda otro remedio.

**Cambios compatibles.** El servidor PUEDE hacerlos en cualquier momento: añadir campos a una representación; añadir parámetros opcionales, colecciones, singletons, acciones o valores de enumeración; admitir filtros, órdenes o inclusiones nuevos; añadir perfiles o extensiones; declarar `reasons` o añadirle razones ([5.4](https://restep.wubytes.com/es/1/#errores)). Funcionan porque el cliente ignora lo que no conoce ([apartado 3](https://restep.wubytes.com/es/1/#datos), [4.2](https://restep.wubytes.com/es/1/#miembros-desconocidos)).

**Cambios incompatibles.** El servidor NO DEBE hacerlos dentro de una versión, salvo retirándolos (abajo):

- quitar o renombrar un campo, o cambiar su tipo o su significado;
- hacer obligatorio un campo de entrada, un parámetro o una cabecera que no lo era (también `If-Match` mediante `428`, e `Idempotency-Key`);
- endurecer la validación de forma que se rechace una petición que antes se aceptaba (también hacer de solo lectura un campo que se podía escribir, o empezar a rechazar `Idempotency-Key` sin credenciales, [7.1](https://restep.wubytes.com/es/1/#claves-anonimas)), salvo para cerrar un fallo de seguridad;
- quitar un filtro (también los con nombre), un operador, un campo de orden, una relación, una inclusión, un recuento, una acción, una colección, un singleton, un perfil, una extensión o un método declarados ([4.3](https://restep.wubytes.com/es/1/#describir)), un valor de una enumeración declarada, el `sync` de una colección o los `events` de la API ([10](https://restep.wubytes.com/es/1/#sync));
- cambiar el formato de los `id`, las URL de los recursos o el orden por defecto de una colección, o la colación de un campo ([6.1](https://restep.wubytes.com/es/1/#filtros));
- cambiar el estado o el `code` que se devuelve en un mismo caso;
- quitar `reasons` una vez declarado, quitarle una razón o cambiar el `code` de una razón.

**Retirar.** Dentro de una versión, un campo o una capacidad declarada solo puede desaparecer si se retira:

- Primero se anuncia. El descubrimiento DEBE listarlo en `deprecations`: `{"kind": "field", "name": "rating", "announced": "2026-12-01T00:00:00Z", "sunset": "2027-07-01T00:00:00Z"}`. `kind` dice qué se retira y dónde va el aviso:
   - En la raíz: `version`; `profile` y `extension`, con su nombre en `name`; `collection` y `singleton`, con su clave en `name`; `reason` ([5.4](https://restep.wubytes.com/es/1/#errores)), con la razón en `name`.
   - En la colección: `field`; `filter` (también un filtro con nombre); `operator`, con el campo de filtro en `name` y el operador en `op`; `value`, con el campo de filtro en `name` y el valor de la enumeración en `value`; `sort`; `relation`; `include`, con la relación en `name`, que retira su expansión pero no la relación; `count`; `max_limit`, con el límite más bajo que tendrá en `value`; `action`; `method` e `item_method`, con el método en `name`.
   - En un singleton: `field` y `method`.
- `announced` DEBE ser el instante en que se publicó el aviso por primera vez, y NO DEBE cambiar después. `sunset`, cuando haya fecha, es el instante de la retirada. Los dos son instantes [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339). Un aviso `field` abarca también los filtros, campos de orden e inclusiones de ese nombre y todas las rutas con punto que empiezan por él (`name.es-mx` para `name`, `author.id` para `author`), que se van con el campo. Un aviso `count` con `"value": "estimated"` anuncia que un recuento declarado `"exact"` pasará a `"estimated"`; sin `value`, que ese `count` se quitará. Las respuestas que usan lo que retira un aviso DEBEN llevar `Deprecation` ([**RFC 9745**](https://www.rfc-editor.org/rfc/rfc9745)) y un `Link` con `rel="deprecation"` a la explicación. Son estas: para `field`, toda respuesta que lleva el campo y toda respuesta a una petición que lo nombra en un parámetro; para `filter`, `operator`, `value`, `sort`, `relation`, `include` y `count`, toda respuesta a una petición que los usa; para `max_limit`, toda respuesta a una petición con un `limit` mayor que el valor nuevo; para `action`, `method` e `item_method`, toda respuesta a ellos; para `collection` y `singleton`, toda respuesta de ese recurso y de sus elementos; para `reason`, todo error con esa razón; para `version`, `profile` y `extension`, toda respuesta. Si lo que se retira es un recurso entero, una acción o una versión, sus respuestas DEBEN llevar además `Sunset` ([**RFC 8594**](https://www.rfc-editor.org/rfc/rfc8594), como fecha HTTP) cuando haya fecha.
- Entre `announced` y `sunset` DEBERÍAN pasar al menos seis meses.
- Pasada la fecha, un recurso, un singleton, una acción o una versión retirados DEBEN responder `410 retired`; un filtro, un operador, un orden, una relación, una inclusión o un recuento retirados (un aviso `count` sin `value`) DEBEN dar `400 unsupported_parameter`, como cualquiera no declarado; tras un aviso `count` con `"value": "estimated"`, el descubrimiento DEBE declarar ese `count` como `"estimated"`, y `count=true` sigue añadiendo `total`, con `"total_estimated": true` cuando el número es aproximado; un valor de enumeración retirado en un filtro DEBE dar `invalid_parameter` y dejar de aparecer en los datos; un `limit` mayor que un `max_limit` rebajado DEBE dar `invalid_parameter`; un método retirado DEBE dar `405`; un campo retirado DEBE faltar en las representaciones y es, para los parámetros y las escrituras, un campo que no existe ([6.3](https://restep.wubytes.com/es/1/#campos)); una razón retirada NO DEBE darse; un perfil o una extensión retirados DEBEN salir de `profiles` o `extensions`, y sus requisitos dejan de aplicarse. Retirar un perfil o una extensión retira también los que lo requieren ([1.2](https://restep.wubytes.com/es/1/#dependencias)), con el mismo `sunset`.

**Otros cambios.** Se clasifican así; «retirar» significa que el cambio es incompatible y puede hacerse retirando, con el `kind` indicado.

| Cambio | Clase |
|---|---|
| `count` de `"estimated"` a `"exact"` | Compatible |
| `count` de `"exact"` a `"estimated"` | Retirar (`count`, con `"estimated"` en `value`) |
| Una acción pasa a ser `safe` o `idempotent` | Compatible |
| Una acción deja de ser `safe` o `idempotent` | Incompatible: retirar la acción (`action`) y declarar otro nombre |
| Subir `idempotency.ttl`, `sync.retention` o `max_limit` | Compatible |
| Bajar `idempotency.ttl` o `sync.retention` | Compatible si el valor nuevo sigue cumpliendo el mínimo de esta especificación ([7.1](https://restep.wubytes.com/es/1/#idempotencia), [10](https://restep.wubytes.com/es/1/#sync)) y el servidor mantiene el antiguo para las claves guardadas y los estados emitidos antes del cambio |
| Bajar `max_limit` | Retirar (`max_limit`, con el límite nuevo en `value`) |
| Dejar de declarar `max_limit` | Incompatible: sin él no se acepta `limit` ([6.4](https://restep.wubytes.com/es/1/#paginacion)) |
| Dejar de declarar `methods`, `item_methods`, `schemas` o una `description`, sin que cambie el comportamiento de la API | Compatible: una declaración ausente significa desconocido ([4.3](https://restep.wubytes.com/es/1/#describir)) |
| Quitar una propiedad de un esquema, o relajarlo | Compatible si se sigue aceptando toda petición que aceptaba y sigue estando todo campo que describía; si no, lo que cuenta es el cambio del campo o de la validación |
| `id_from` de ausente o `"server"` a `"either"` | Compatible solo si el servidor puede reconocer todos los `id` que ha tenido la colección ([5.1](https://restep.wubytes.com/es/1/#id-del-cliente)); si no, incompatible |
| Cualquier otro cambio de `id_from` | Incompatible |
| `collations` de `"server"` a un valor que nombra la igualdad y el orden que ya se usan | Compatible |
| Cualquier otra declaración o cambio de `collations` de un campo | Incompatible, salvo que el filtro y el campo de orden del campo sean nuevos |

```
GET https://api.example.com/v1/books/7
→ 200
Deprecation: @1798761600
Sunset: Thu, 01 Jul 2027 00:00:00 GMT
Link: </v2/>; rel="successor-version",
      <https://docs.example.com/v2>; rel="deprecation"

GET https://api.example.com/v1/books/7   después del 1 de julio de 2027
→ 410 application/problem+json
{ "type": "https://w3id.org/restep/1/errors#retired", "title": "Retirado", "status": 410, "code": "retired" }
```

**Una versión mayor nueva.** La exige un cambio incompatible que no pueda hacerse retirando:

- La versión DEBE ir en la ruta, como `v` seguida de un entero: `/v2/`. Cada versión es una raíz de API distinta con su propio documento de descubrimiento, que DEBE declararla como `"version": "2"`.
- La versión NO DEBE ir en cabeceras, parámetros ni tipos de medio: en la ruta se ve, se cachea y se enruta sin código. Esto deja fuera el versionado por fecha en una cabecera, como hace Stripe: Restep 1 no lo ofrece.
- Las dos versiones DEBEN enlazarse con `Link` ([**RFC 5829**](https://www.rfc-editor.org/rfc/rfc5829)), al menos en el documento de descubrimiento: `rel="successor-version"` desde la vieja y `rel="predecessor-version"` desde la nueva.

### 5.6 Idioma de los textos de la API

Los errores, el documento de descubrimiento y los esquemas que sirve la API PUEDEN depender de `Accept-Language` ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-12.5.4), apartado 12.5.4). Solo cambian sus textos para personas: en un error, `title` y `detail`, también los de cada entrada de `errors`; en el descubrimiento, `description`; en un esquema, también uno incrustado en `schemas`, las anotaciones `title` y `description` de JSON Schema. Los datos, nunca ([3](https://restep.wubytes.com/es/1/#datos)).

- El servidor elige el idioma con el *lookup* del [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647#section-3.4) (apartado 3.4) entre los idiomas en que puede dar esa respuesta, probando los rangos de `Accept-Language` de mayor a menor peso y, a igual peso, en el orden de la cabecera; sin distinguir mayúsculas, sin canonicalizar rangos ni etiquetas (`iw` no encuentra `he`) y sin quitar antes extensiones ni subetiquetas privadas. Ignora `*`, los rangos con `q=0` y los mal formados (también por un `q` mal formado). Si ninguno encaja, o no llega la cabecera, DEBE usar su idioma por defecto. NO DEBE responder `406` ni `400` por `Accept-Language`.
- En un servidor que ofrece sus textos en más de un idioma, toda respuesta cuyos textos se eligen así (un error, el descubrimiento o un esquema), también en el idioma por defecto, DEBE llevar `Vary: Accept-Language`, y un `304` de estos, el mismo `Vary` que su `200`. Una respuesta con cuerpo DEBERÍA llevar `Content-Language`. Cada idioma es otra representación: una `ETag`, si la hay, DEBE ser distinta por idioma.
- El *lookup* recorta la etiqueta pedida y nunca prueba otras variantes del mismo idioma: con `es-es` y `es-mx` pero sin `es`, `Accept-Language: es-AR` recibe el idioma por defecto. Un servidor que ofrece variantes regionales de sus textos DEBERÍA ofrecer también el idioma sin región.
- Una repetición ([7.1](https://restep.wubytes.com/es/1/#idempotencia)) devuelve la respuesta guardada, en su idioma, porque `Accept-Language` no cuenta para «la misma petición».

### 5.7 Reintentos

Un cliente repite una petición cuando no sabe si tuvo efecto (se cortó la conexión, se agotó el tiempo de espera) o cuando el servidor le dice que vuelva más tarde. Que sea seguro depende del método y de la respuesta.

- **Se pueden repetir tal cual:** `GET`, `HEAD`, `QUERY` y las acciones seguras, que no tienen efecto; las acciones declaradas `"idempotent": true`; `DELETE`, cuya repetición PUEDE dar `404` ([5.1](https://restep.wubytes.com/es/1/#recursos)), que un cliente que lo está repitiendo toma como hecho; y `PATCH` con un merge patch, que deja el elemento igual se aplique las veces que se aplique. Un `PATCH` es idempotente salvo por la concurrencia: entre los dos intentos otro cliente puede haber escrito, y la repetición deshace ese cambio. Con `If-Match` ([7.2](https://restep.wubytes.com/es/1/#concurrencia)) la repetición recibe en cambio `412`, también tras un primer intento que salió bien, porque ese cambió la `ETag`; entonces el cliente lee el elemento para averiguarlo.
- **No son seguros sin ayuda:** un `POST` a una colección, una acción declarada `"idempotent": false` y un lote pueden tener efecto dos veces. Un cliente NO DEBERÍA repetir uno de ellos automáticamente cuando no sabe si el primer intento tuvo efecto, salvo que lleve `Idempotency-Key` y el servidor anuncie [`writes`](https://restep.wubytes.com/es/1/#writes) ([7.1](https://restep.wubytes.com/es/1/#idempotencia)), o que cree un elemento con un `id` elegido por el cliente ([5.1](https://restep.wubytes.com/es/1/#recursos)), que no se puede crear dos veces.
- `429 rate_limited` y `503 unavailable`: el servidor NO DEBE dar ninguno de los dos a una petición que tuvo efecto, ni a una de la que no puede saber que no lo tuvo (un tiempo de espera agotado después de confirmar la transacción, un proceso que murió): a esas responde con otro `5xx`, como `500`, `502` o `504`. Una pasarela o un balanceador de carga que el operador de la API pone delante de ella, y que responde con un cuerpo `problem+json`, está sujeto a esta regla igual que el servidor. Así, el cliente PUEDE enviar de nuevo la misma petición, sea cual sea su método. `409 request_in_progress` ([7.1](https://restep.wubytes.com/es/1/#idempotencia)) se repite del mismo modo, con la misma clave. Con `Retry-After`, el cliente NO DEBERÍA repetirla antes de ese momento; sin él, DEBERÍA esperar un tiempo creciente entre intentos, con algo de azar, para que muchos clientes no vuelvan a la vez. Un `429` o un `503` sin cuerpo `problem+json` puede venir de un intermediario, al que este apartado no obliga.
- Los demás estados `5xx` (`500`, `502`, `504`…) y una respuesta perdida no dicen nada del efecto: el cliente solo repite lo que permite el primer punto, o lo que lleva la misma `Idempotency-Key`.
- Otro `4xx` responde igual a la misma petición. Un cliente NO DEBERÍA repetirla sin cambiar algo antes: credenciales nuevas tras un `401`, una lectura nueva tras un `412`, `If-Match` tras un `428`, el cuerpo tras un `422`.

### 5.8 Clientes de navegador

Restep no exige acceso desde otros orígenes ([**Fetch**](https://fetch.spec.whatwg.org/#http-cors-protocol), protocolo CORS). Para las operaciones que un servidor abre a un origen de navegador, DEBERÍA enviar `Access-Control-Allow-Origin` en todas las respuestas, también en las de error, y DEBERÍA responder a su preflight sin exigir credenciales, porque un preflight no las lleva. Si esas cabeceras dependen del `Origin` de la petición, todas las respuestas DEBERÍAN llevar `Vary: Origin`, también las que no las llevan, y toda respuesta de estas que pueda guardar una caché compartida (una que es `public`) DEBE llevarlo. Si acepta peticiones con credenciales (cookies, autenticación HTTP o certificados de cliente TLS; un token en `Authorization` no lo es), DEBERÍA nombrar el origen en vez de `*`, que los navegadores rechazan con credenciales, y enviar `Access-Control-Allow-Credentials: true`. Ninguna regla de Restep se aplica a `OPTIONS` ([5.1](https://restep.wubytes.com/es/1/#recursos)): el preflight de una operación abierta a ese origen recibe su respuesta CORS aunque el elemento no exista, no lleve credenciales o lleve parámetros reservados.

DEBERÍA incluir en `Access-Control-Expose-Headers` las cabeceras de respuesta que los perfiles y extensiones que anuncia piden leer al cliente; en Restep 1, `ETag`, `Location`, `Link`, `Allow`, `Accept-Patch`, `Retry-After`, `Deprecation`, `Sunset`, `Idempotent-Replayed`, `Preference-Applied` y `Accept-Query`, más las de [11.5](https://restep.wubytes.com/es/1/#oauth). DEBERÍA permitir en el preflight las cabeceras de petición y los métodos que usan esas operaciones; en Restep 1, `Content-Type`, `If-Match`, `If-None-Match`, `Idempotency-Key`, `Prefer`, `Authorization` y `DPoP`, con `PATCH`, `DELETE` y `QUERY`. Son las que define Restep 1; una versión menor puede añadir otras.

Un navegador añade solo algunas credenciales a las peticiones que inician páginas de otros orígenes: cookies, autenticación HTTP y certificados de cliente TLS. Un servidor que acepta alguna de ellas DEBE rechazar con `403 forbidden`, sin aplicarla, toda petición que no es segura (un `POST`, incluidas las acciones y los lotes, un `PATCH` o un `DELETE`), que autenticaría con una credencial de ese tipo y que un navegador envió desde un origen que el servidor no permite. DEBE tratar como tal una petición cuya cabecera `Origin` ([**Fetch**](https://fetch.spec.whatwg.org/#origin-header)) está presente y no es ni el origen de la API ni uno que permite. Un origen que permite es uno que nombra: un `*` en `Access-Control-Allow-Origin` no permite ninguno a efectos de esta regla, porque los navegadores no lo aceptan con credenciales. PUEDE tratar `Origin: null` como el origen de la API cuando `Sec-Fetch-Site` es `same-origin`, porque una página con `Referrer-Policy: no-referrer` lo envía a su propio origen, y PUEDE decidir por `Sec-Fetch-Site` ([Fetch Metadata](https://www.w3.org/TR/fetch-metadata/)) cuando falta `Origin`. Una petición que el servidor autentica solo con un token en `Authorization` no está incluida: un navegador nunca añade uno por su cuenta, así que un cliente de navegador de otro origen que el servidor permite mediante CORS sigue funcionando. Esas cookies DEBERÍAN llevar `SameSite=Lax` o `SameSite=Strict`. El preflight y el tipo de medio de [3](https://restep.wubytes.com/es/1/#tipos-de-medio) impiden que otros orígenes envíen un cuerpo JSON; esta comprobación cubre además una acción con el cuerpo vacío, que cualquier página puede enviar sin preflight ([11.1](https://restep.wubytes.com/es/1/#actions), [13.7](https://restep.wubytes.com/es/1/#seg-navegadores)).

### 5.9 Singletons y recursos fuera de Restep

Restep abarca las colecciones, sus elementos, sus acciones, los singletons y los recursos que define esta especificación: el documento de descubrimiento, la ruta del lote, el flujo de eventos, el estado del servicio ([4.4](https://restep.wubytes.com/es/1/#salud)) y los metadatos de OAuth ([11.5](https://restep.wubytes.com/es/1/#oauth)). Si el servidor sirve un documento de descubrimiento, las colecciones y los singletons son los que declara. Cualquier otro recurso de la API, como un PDF o una imagen enlazados con `href`, o una ruta que la API no ha declarado, queda **fuera de Restep**: de esta especificación solo se le aplican [5.3](https://restep.wubytes.com/es/1/#reservados), [5.4](https://restep.wubytes.com/es/1/#errores) y la regla de `Cache-Control` de [5.1](https://restep.wubytes.com/es/1/#respuestas-privadas), así que su cuerpo no tiene por qué ser JSON, pero un parámetro reservado que no implementa sigue dando `unsupported_parameter`, y sus errores siguen siendo `problem+json`. Un recurso así implementa un parámetro reservado si lo lee, signifique lo que signifique allí.

Un **singleton** es un recurso sin colección, como el perfil del usuario que ha iniciado sesión (`/me`) o la configuración de una cuenta, como en [**AIP-156**](https://google.aip.dev/156). El servidor lo declara en la raíz, en `singletons`, con el nombre que elija:

```
"singletons": {
  "me": { "path": "/me", "methods": ["GET", "PATCH"],
          "description": "Perfil y configuración del usuario que ha iniciado sesión.",
          "schemas": { "item": "/schemas/me.json", "update": "/schemas/me-update.json" } } }
```

- Cada singleton DEBE tener un `path`, que NO DEBE ser una plantilla, y PUEDE llevar `methods` (de entre `GET` y `PATCH`, una lista exacta como en [4.3](https://restep.wubytes.com/es/1/#describir)), `description`, `schemas` (`item` y `update`) y `deprecations` ([5.5](https://restep.wubytes.com/es/1/#versiones)). Su ruta NO DEBE ser una que tenga o pueda tener una colección o un elemento de una: no `/books/featured` mientras `/books` sea una colección.
- Un cliente DEBE ignorar un singleton cuyo `path` es una plantilla de URI o cuya declaración lleva `parent`: esas formas quedan reservadas para versiones menores.
- Un singleton se comporta como un elemento sin `id` ni colección. DEBE admitir `GET` (y `HEAD`), que devuelve su representación, un objeto JSON, y PUEDE admitir `PATCH` con un merge patch, como dice [5.1](https://restep.wubytes.com/es/1/#recursos) para los elementos, que devuelve la representación entera. `POST` y `DELETE` sobre él DEBEN dar `405`: el cliente ni crea ni borra un singleton. Existe para todo principal que pueda usarlo; uno que no puede recibe `403` o `404` ([4.2](https://restep.wubytes.com/es/1/#cache-del-descubrimiento)).
- Lo que esta especificación dice de la representación de un elemento, sus campos de solo lectura, su `PATCH`, su `ETag` y su `If-Match` ([3](https://restep.wubytes.com/es/1/#datos), [4.3](https://restep.wubytes.com/es/1/#describir), [5.1](https://restep.wubytes.com/es/1/#recursos), [7.2](https://restep.wubytes.com/es/1/#concurrencia), [8](https://restep.wubytes.com/es/1/#cache)) vale también para un singleton, así que con `writes` toda respuesta con su representación lleva `_etag`, y un `PATCH` evalúa `If-Match` e `If-None-Match` contra su ETag; lo que dice de `id`, de las rutas de los elementos y de las colecciones, no. La representación de un singleton PUEDE llevar un `id`, como el del usuario, que entonces es de solo lectura.
- Con [`query`](https://restep.wubytes.com/es/1/#query), `fields` DEBE funcionar en un singleton como en un elemento ([6.3](https://restep.wubytes.com/es/1/#campos)). Sus relaciones siguen [3](https://restep.wubytes.com/es/1/#datos), y cada objeto de relación que lleve DEBE llevar `href`, porque un singleton no declara `relations` de las que sacar su destino; declararlas, `include`, los mapas de idioma y las acciones en un singleton quedan fuera de esta versión: `include` y los demás parámetros reservados DEBEN dar ahí `unsupported_parameter`.

## 6. query (Perfil)

URI del perfil: `https://w3id.org/restep/1/query`. Estado: estable. Se aplica a las colecciones; `fields` vale también para los elementos. Ningún parámetro necesita un analizador sintáctico: los lee cualquier framework HTTP, aunque para detectar un parámetro repetido puede hacer falta la query en bruto ([5.3](https://restep.wubytes.com/es/1/#reservados)).

### 6.1 Filtros

```
GET /books?filter[category]=novela-negra&filter[price][le]=20
```

- El documento de descubrimiento DEBE declarar en `filter` qué campos admiten filtro, con su tipo y sus operadores. Los campos de una relación usan una ruta con punto (`author.id`).
- Un campo cuyo valor es una lista, y cualquier ruta que atraviese una relación a muchos (`reviews.rating`, `speakers.id`), NO DEBEN declararse en `filter` ni en `sort`: si un filtro así significa «algún elemento» o «todos los elementos» queda reservado para una versión menor posterior.
- `filter[campo]=valor` es el mismo filtro que `filter[campo][eq]=valor`. Los filtros sobre un mismo campo con operadores distintos son filtros distintos (`filter[price][ge]=10&filter[price][le]=20`). Varios filtros DEBEN combinarse con Y; para O, NO y paréntesis está la extensión [`filter-expr`](https://restep.wubytes.com/es/1/#filter-expr).
- Operadores: `eq`, `ne`, `lt`, `le`, `gt`, `ge`, `in` y `null`.
- `in` lleva valores separados por comas, que por tanto no pueden contener comas (para esos están `eq`, `filter-expr` o `query-method`). `filter[f][in]=` es una lista vacía; un elemento vacío entre comas (`a,,b`) es la cadena vacía. `null` lleva `true` (sin valor: ausente o `null`) o `false`.
- El servidor DEBE comparar según el tipo declarado: numéricamente para `integer`, `number` y `decimal` (los decimales de forma exacta, sin pasar por coma flotante), cronológicamente para `date` (como fechas de calendario) y `datetime` (como instantes, de forma exacta: un valor de filtro más preciso que lo que guarda el servidor DEBE compararse de forma exacta o dar `invalid_parameter`, nunca redondearse; un desfase como `+02:00` se envía como `%2B02:00`, [5.2](https://restep.wubytes.com/es/1/#colecciones)), por su longitud para `duration` (un día cuenta como 24 horas; un valor de filtro con años o meses DEBE dar `invalid_parameter`, porque no tienen longitud fija), y por puntos de código Unicode para `string` y `enum`, distinguiendo mayúsculas y sin reglas de idioma, salvo que la colación del campo diga otra cosa (más abajo). Las cadenas se comparan tal cual, sin normalización Unicode: una `é` compuesta y una descompuesta son valores distintos. (El `<` de JavaScript compara unidades de código UTF-16, que ordenan algunos caracteres de fuera del plano multilingüe básico de forma distinta que los puntos de código.) Un campo `boolean` NO DEBE declarar más operadores que `eq`, `ne` y `null`, y el filtro de `id` NO DEBE declarar `lt`, `le`, `gt` ni `ge`, porque el orden de los `id` es el del servidor ([5.2](https://restep.wubytes.com/es/1/#colecciones)). `null` puede declararse en un campo de cualquier tipo y comprueba si el valor falta o es `null`.
- Una ruta con punto que acaba en el `id` de una relación cuyo destino es una subcolección NO DEBE declararse en `filter` ni en `sort`: ese `id` identifica un elemento solo dentro de su padre.
- Una traducción se filtra como `campo.etiqueta`, con un mapa de idioma de la colección y una clave en minúsculas: `filter[name.es-mx]=Calabacita`. El descubrimiento declara cada una por separado, de tipo `string`: `"name.es-mx": {"type": "string", "ops": ["eq", "in"]}`. Lee solo esa clave exacta, sin el emparejamiento del [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647) ni idioma de reserva: si el elemento no tiene la clave, el campo está ausente. El mapa de idioma entero y cualquier otra ruta que acabe en uno o lo atraviese (`author.name`, `author.name.es`) NO DEBEN declararse en `filter` ni en `sort`, y un mapa de idioma NO DEBE llamarse igual que una relación de su colección, para que `name.es-mx` nunca sea una ruta de relación.
- Una colección PUEDE declarar en `collations` cómo se comparan y ordenan un campo que contiene cadenas (de tipo `string`, o un `enum` de cadenas que es clave de orden) o una traducción `campo.etiqueta`: `"collations": {"title": "server"}`. El valor se aplica al filtro y a la clave de orden con ese nombre, y a [`filter-expr`](https://restep.wubytes.com/es/1/#filter-expr). Cada clave DEBE ser un campo declarado en `filter` con tipo `string`, o listado en `sort` y que contenga cadenas, y NO DEBE ser `id` ([5.2](https://restep.wubytes.com/es/1/#colecciones)).
   - `"codepoint"`, el valor de todo campo de cadena que no aparece: por puntos de código Unicode, como arriba.
   - `"server"`: la igualdad (`eq`, `ne`, `in`) y el orden (`lt`, `le`, `gt`, `ge`, `sort`) son los del servidor, como una colación de base de datos que no distingue mayúsculas o tildes. El orden DEBE ser total, determinista y estable, y concordar con la igualdad: dos valores son iguales exactamente cuando ninguno va antes que el otro. El servidor DEBERÍA decir cuál es en la `description` del campo ([4.3](https://restep.wubytes.com/es/1/#describir)). Un cliente NO DEBE suponer puntos de código, ni reproducir en local ese orden o esa igualdad. Como solo se prometen estas propiedades, un cambio en la colación propia del servidor que las conserve, como la actualización de una biblioteca, no cambia el valor declarado.
   - Los demás valores quedan reservados para versiones menores, como colaciones nombradas por etiquetas de Unicode. Un cliente DEBE tratar como `"server"` un valor que no sea una cadena, o una cadena que no conozca.
- Los operadores, salvo `null`, NO DEBEN casar con elementos en los que el campo esté ausente o sea `null`.
- Un filtro o una clave de orden sobre un campo que el principal no puede leer en un elemento DEBE tratar el campo como ausente en ese elemento: las comparaciones no casan con él, `filter[campo][null]=true` sí, y va al final en un orden. Una ruta con punto a través de una relación (`author.name`) es un campo que el principal no puede leer en un elemento cuyo elemento relacionado no puede ver ([9](https://restep.wubytes.com/es/1/#relations)). Así, un filtro declarado nunca revela un valor que el cliente no puede leer, y un recuento tampoco ([6.5](https://restep.wubytes.com/es/1/#recuento)). El servidor PUEDE responder en su lugar `403 forbidden`, con el parámetro en `parameter`, cuando el principal no puede leer ese campo en ningún elemento.
- Un operando de `null` que no sea `true` o `false`, un operando de cualquier otro operador que no encaje con el tipo del campo (en `in`, cada elemento), una lista `in` vacía o el mismo filtro (mismo campo y operador, en cualquiera de las dos formas) dos veces DEBEN dar `invalid_parameter`. Un campo u operador no declarados, `unsupported_parameter` ([5.3](https://restep.wubytes.com/es/1/#reservados)).

**Filtros con nombre.** Hay criterios que no comparan un campo: «las sesiones activas» (sin caducar y sin cerrar), «las iniciadas desde el móvil» o «las peticiones que aprueba alguien con este nombre». El servidor los declara por su nombre en `named_filters`, y el cliente los usa con la forma corta de un filtro:

```
GET /books?filter[available]&filter[search]=machado&filter[price][le]=20
```

- El descubrimiento DEBE declarar cada uno en el `named_filters` de su colección, con una `description` que dice qué elementos devuelve y, si lleva valor, su `type` ([4.2](https://restep.wubytes.com/es/1/#descubrimiento), con sus `values` si es `enum`): `"named_filters": {"available": {"description": "…"}, "search": {"type": "string", "description": "…"}}`. Su significado es el que da la descripción, no una comparación con un campo. Un filtro con nombre NO DEBE llamarse igual que una clave de `filter` de su colección, y su nombre sigue el [3](https://restep.wubytes.com/es/1/#nombres), así que nunca contiene un punto.
- Sin `type`, es un interruptor: se aplica con `filter[nombre]` o `filter[nombre]=`, y cualquier valor DEBE dar `invalid_parameter`. Con `type`, el valor es obligatorio: uno vacío o que no encaja con el tipo DEBE dar `invalid_parameter`.
- No tiene operadores: `filter[nombre][eq]`, o con cualquier otro operador, DEBE dar `unsupported_parameter`, igual que un filtro con nombre que no está declarado. El mismo filtro con nombre dos veces DEBE dar `invalid_parameter`.
- En todo lo demás es un filtro: se combina con Y con los demás, el cursor queda ligado a él ([6.4](https://restep.wubytes.com/es/1/#paginacion)) y da `unsupported_parameter` donde lo dan los filtros, como en `:changes` ([10](https://restep.wubytes.com/es/1/#sync)). Con [`filter-expr`](https://restep.wubytes.com/es/1/#filter-expr) no entra en una expresión, porque no está en `filter`.
- A diferencia de un filtro sobre un campo, no compara nada que describa `collations`: cómo casa el texto lo dice su `description`. NO DEBE seleccionar elementos por valores que el principal no puede leer, salvo que su descripción enuncie ese criterio, lo que hace público si un elemento lo cumple: si no, que un elemento case revelaría esos valores ([13.4](https://restep.wubytes.com/es/1/#seg-oraculos)). Un filtro con nombre con `type` NO DEBE comparar su valor con valores que el principal no puede leer, diga lo que diga su descripción: cada valor que recibe haría una pregunta distinta sobre ellos, y una búsqueda por bisección los encontraría.

### 6.2 Orden

`sort=-rating,title`: campos separados por comas, con `-` delante para orden descendente. Los campos ordenables se declaran en `sort`; cualquier otro DEBE dar `unsupported_parameter`. El servidor DEBE desempatar de forma estable (por ejemplo, por `id`). Los elementos sin valor en una clave de orden DEBEN ir al final, en los dos sentidos. Una traducción se ordena como su `campo.etiqueta` declarado ([6.1](https://restep.wubytes.com/es/1/#filtros)): `sort=name.es-mx`. Las cadenas se ordenan por puntos de código, sin reglas de idioma, salvo que `collations` diga otra cosa ([6.1](https://restep.wubytes.com/es/1/#colaciones)); `id` se ordena en el orden del servidor ([5.2](https://restep.wubytes.com/es/1/#colecciones)).

### 6.3 Campos

Con `fields=title,price` la respuesta DEBE llevar solo esos campos, más `id` y los miembros que empiezan por `_`. Vale también en el `GET` de un elemento, donde, con `writes`, el elemento lleva además `_etag` ([7.2](https://restep.wubytes.com/es/1/#concurrencia)). Un campo que no existe DEBE dar `invalid_parameter`; un campo que existe pero que el principal no puede leer simplemente falta en la respuesta, como faltaría sin `fields`. Un campo que el principal no puede leer y que no nombran ni el descubrimiento ni ningún esquema que sirva la API DEBE tratarse, para ese principal, como uno que no existe, para que `fields` no le diga que el campo existe. `fields=id` es válido y devuelve solo `id` y los miembros `_`; un `fields` vacío es una lista vacía ([5.3](https://restep.wubytes.com/es/1/#reservados)). `fields` e `include` ([9](https://restep.wubytes.com/es/1/#relations)) se aplican a las lecturas: `GET`, `HEAD` y `QUERY`. En una escritura DEBEN dar `unsupported_parameter`, y la respuesta lleva el elemento entero, o nada con `Prefer: return=minimal` ([7.3](https://restep.wubytes.com/es/1/#respuesta-minima)). Un mapa de idioma es un solo campo: `fields=name` lo da entero, y una ruta que entra en él (`name.es`; con [`relations`](https://restep.wubytes.com/es/1/#relations), también `author.name.es`) DEBE dar `invalid_parameter`.

### 6.4 Paginación

- `limit` fija el tamaño de página, entre 1 y el `max_limit` declarado. Fuera de ese rango el servidor DEBE dar `invalid_parameter`, no recortarlo en silencio. Una colección que acepta `limit` DEBE declarar `max_limit`; en una que no lo declara, `limit` DEBE dar `unsupported_parameter`.
- `next` DEBE llevar un parámetro `cursor` opaco y conservar sin cambios los demás parámetros. El cliente NO DEBE interpretar ni fabricar cursores.
- Un cursor está ligado a la colección, a los filtros y al orden para los que se emitió; con `QUERY`, a los miembros `filter` y `sort` del cuerpo ([11.4](https://restep.wubytes.com/es/1/#query-method)). Un cursor que el servidor no emitió (uno manipulado), uno caducado o uno usado con otra colección, otros filtros u otro orden DEBE dar `invalid_parameter` con `parameter: "cursor"`. Un cursor DEBERÍA estar ligado también al principal ([2](https://restep.wubytes.com/es/1/#terminos)) que lo recibió, y DEBE estarlo si remite a resultados calculados para ese principal, como una instantánea guardada, para que otro principal no pueda recorrerlos. Firmarlo es la forma más sencilla de reconocer uno manipulado. Un cursor NO DEBERÍA llevar datos de los elementos de forma legible, como los valores de orden de una clave en claro: las URL de `next` acaban en los registros. Cifrarlo, o guardar la posición en el servidor, lo evita ([13.9](https://restep.wubytes.com/es/1/#seg-opacos)).
- Un cursor NO DEBE estar ligado a `limit`, `fields`, `include` ni `count`: cambian lo que lleva cada página, no qué elementos recorre. Entre páginas, el cliente PUEDE añadirlos, cambiarlos o quitarlos en la URL de `next` de un `GET`, o en el cuerpo de un `QUERY`, y eso NO DEBE invalidar el cursor.
- El servidor PUEDE empezar con un desplazamiento dentro del cursor y pasar más tarde a paginación por clave sin que el cliente lo note. La garantía es la de [5.2](https://restep.wubytes.com/es/1/#colecciones): sin repetidos ni huecos si no hay escrituras concurrentes.

### 6.5 Recuento

El descubrimiento declara `count` como `"exact"` o `"estimated"`. Con `count=true`, la respuesta DEBE añadir `total` y, si el número es aproximado, `"total_estimated": true`. En una colección que declara `count`, `count=false` equivale a no enviarlo, y cualquier valor que no sea `true` o `false` DEBE dar `invalid_parameter`. En una colección que no lo declara, y en cualquier servidor sin este perfil, `count` con cualquier valor, también `false`, DEBE dar `unsupported_parameter` ([5.3](https://restep.wubytes.com/es/1/#reservados)). `total` DEBE contar solo los elementos que el cliente puede ver, también cuando es estimado.

## 7. writes (Perfil)

URI del perfil: `https://w3id.org/restep/1/writes`. Estado: estable. Escrituras que se pueden reintentar sin duplicar y que no se pisan unas a otras. La caché es un perfil aparte, [`cache`](https://restep.wubytes.com/es/1/#cache).

### 7.1 Repetir sin duplicar

```
POST /orders
Idempotency-Key: "8e03978e-40d5-43e8-bc93-6894a57f9324"
```

- Todo `POST` no idempotente, también las acciones declaradas `"idempotent": false`, DEBE aceptar la cabecera `Idempotency-Key`, salvo lo que se dice [más abajo](https://restep.wubytes.com/es/1/#claves-anonimas) para las peticiones sin credenciales: una cadena de Structured Fields sin parámetros ([**RFC 9651**](https://www.rfc-editor.org/rfc/rfc9651)). Una clave mal formada DEBE dar `400 bad_request`, con una entrada de `errors` cuyo `header` es `Idempotency-Key`. En métodos que no sean `POST`, el servidor DEBE ignorar la cabecera. Este apartado define la sintaxis y el significado de la cabecera para Restep por sí solo: sigue el borrador del IETF ([14.2](https://restep.wubytes.com/es/1/#informativas)) en lo que coinciden, y no depende de que ese borrador avance ni de que siga como está.
- Una clave es de un principal ([2](https://restep.wubytes.com/es/1/#terminos)), no de un token, y de un destino (método y ruta, comparados tras decodificar los porcentajes, sin la query): un reintento con un token renovado la sigue encontrando. Dos peticiones son **la misma** cuando comparten clave, principal y destino, sus parámetros de query son los mismos tras decodificar los porcentajes (su orden no cuenta, como en [5.2](https://restep.wubytes.com/es/1/#colecciones)) y sus cuerpos son iguales como valores JSON ([2](https://restep.wubytes.com/es/1/#igualdad-json)). Así, la misma clave en la misma ruta con otra query es otra petición, y recibe `422 idempotency_mismatch`.
- Las peticiones sin un principal autenticado cuentan todas como un único principal anónimo y comparten sus claves. El servidor PUEDE rechazar `Idempotency-Key` en esas peticiones. Si lo hace, DEBE declararlo en el descubrimiento con `"anonymous": false` en `idempotency` (si falta, vale `true`), y DEBE responder con `400 bad_request`, con una entrada de `errors` cuyo `header` es `Idempotency-Key` y cuyo `code` es `unknown`, antes de cualquier efecto, a un `POST` sin credenciales que lleve la cabecera y al que, si no, se aplicaría este apartado; un `POST` a una acción declarada `"idempotent": true` DEBE en cambio ignorar la cabecera, y no guardar nada con ella ([11.1](https://restep.wubytes.com/es/1/#actions)). Mientras `anonymous` sea `false`, un recurso que exige la clave NO DEBE exigirla a las peticiones sin credenciales. Un `401` mandaría al cliente a conseguir unas credenciales que el recurso no necesita. Por lo demás, este apartado se les aplica como a cualquier principal. Un cliente DEBERÍA generar cada clave a partir de una fuente aleatoria, con al menos los 122 bits aleatorios de un UUID de versión 4, y NO DEBERÍA usarla para otra petición: quien adivina o averigua una clave puede usarla antes con el mismo principal o, con la misma petición, obtener su respuesta guardada ([13.5](https://restep.wubytes.com/es/1/#seg-idempotencia)).
- El servidor DEBE guardar cada clave al menos 24 horas desde la primera petición, y DEBERÍA declarar cuánto en el descubrimiento (`"idempotency": {"ttl": 86400}`, en segundos). Pasado ese plazo, la clave cuenta como nueva.
- Si vuelve a llegar la misma petición, el servidor DEBE devolver el mismo estado y el mismo cuerpo sin repetir el efecto, y DEBERÍA añadir `Idempotent-Replayed: true`. Cabeceras como `Date` pueden cambiar. Una repetición, y el `409 request_in_progress` para la misma petición mientras la primera sigue en curso, ocupan el lugar que les da [5.4](https://restep.wubytes.com/es/1/#orden-de-errores): después de todas las comprobaciones de los pasos anteriores y antes del `428`. Ninguno evalúa `If-Match`, `If-None-Match` ni la exigencia del `428`: una repetición devuelve la respuesta guardada aunque ya no se cumplan. Una petición distinta con la misma clave las evalúa como siempre, así que el `412` va antes que `422 idempotency_mismatch`.
- Si el servidor falla después del efecto y antes de guardar la respuesta, un reintento con la misma clave NO DEBE repetir el efecto: el servidor registra las dos cosas de forma atómica, o se recupera como si lo hubiera hecho.
- Una petición rechazada antes de ejecutarse (un `4xx` como `422`, o un `5xx` que no dejó efecto) PUEDE no guardarse; entonces no gasta la clave, y el cliente puede corregirla y reintentar con la misma. Una petición que tuvo efecto DEBE guardarse.
- La misma clave con otra petición DEBE dar `422 idempotency_mismatch`, también si la primera aún se está procesando. La misma petición mientras la primera aún se procesa DEBE dar un error `409` con `code` `request_in_progress`, que DEBERÍA llevar `Retry-After`, salvo que el servidor espere a que termine la primera y entonces la responda como una repetición, cosa que PUEDE hacer; el cliente PUEDE volver a enviarla con la misma clave, pasado el `Retry-After` si lo lleva. Un recurso que exige la clave DEBE dar `400 idempotency_key_required` si no llega, salvo a una petición sin credenciales cuando `anonymous` es `false` ([arriba](https://restep.wubytes.com/es/1/#claves-anonimas)).
- Un servidor que solo tiene `core` no conoce la cabecera y la ignora. El cliente NO DEBE contar con `Idempotency-Key` si el servidor no anuncia `writes`.

### 7.2 Concurrencia optimista

- Cada elemento tiene una **ETag de elemento** fuerte: la `ETag` de su representación completa, sin `fields` ni `include`, calculada como si `_etag` no estuviera; sus demás miembros `_` cuentan. Es la `ETag` de la representación que lee este principal, así que donde esa representación depende del principal (`_actions`, campos que no puede leer), también depende de él la ETag de elemento, e `If-Match` se evalúa contra la de quien escribe. Un `GET` del elemento completo sin codificación de contenido DEBE llevarla, y el servidor NO DEBE usar para ella un validador débil (`W/`). Con codificación de contenido (gzip), la cabecera `ETag` PUEDE ser otra, como exige el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110).
- Toda respuesta cuyo cuerpo es la representación de un solo elemento, a una lectura o a una escritura, DEBE llevar la ETag de elemento en `_etag`, sean cuales sean su codificación de contenido y sus parámetros: un proxy o una CDN que comprime la respuesta puede debilitar o cambiar la cabecera `ETag` sin que el servidor lo sepa, y el cliente sigue necesitando un validador para `If-Match`.
- La respuesta de un elemento con `fields` o `include` es otra representación: su cabecera `ETag` DEBE cambiar cuando cambie cualquier cosa de ella, también los elementos incluidos, mientras que su `_etag` sigue siendo la ETag de elemento, para que el cliente pueda escribir sin volver a leer.
- Un elemento en la respuesta de una colección DEBERÍA llevar en `_etag` la ETag de elemento de la versión que representa, si admite `PATCH` o `DELETE`, para que el cliente pueda escribir sin leerlo antes. En una colección que declara `sync` ([10](https://restep.wubytes.com/es/1/#sync)), ese elemento DEBE llevarla en todas las páginas, con cualquier parámetro de consulta, con `GET` o con `QUERY` ([11.4](https://restep.wubytes.com/es/1/#query-method)).
- `PATCH` y `DELETE` DEBEN evaluar `If-Match` contra la ETag de elemento como dice el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) (listas, `*`, comparación fuerte): si no coincide, `412 precondition_failed`. También DEBEN evaluar `If-None-Match` (listas, `*`, comparación débil): si coincide, `412` sin aplicar la escritura. Sobre un elemento que no existe, como uno que otra escritura acaba de borrar, DEBEN dar `404` (`410 retired` solo tras una retirada, [5.5](https://restep.wubytes.com/es/1/#versiones)), digan lo que digan las precondiciones: el orden de [5.4](https://restep.wubytes.com/es/1/#orden-de-errores) lo pone antes del `412`, donde el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) evaluaría `If-Match` como falso.
- Un `POST` a una colección, o a una acción sobre ella, tiene como destino la colección, y Restep no da a una colección ninguna ETag contra la que escribir. El servidor DEBE evaluar ahí `If-Match` e `If-None-Match` como dice el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110), contra la `ETag` que llevaría para este principal un `GET` de la colección sin parámetros, o contra ninguna si no puede leer la colección: así, `If-Match` con etiquetas de entidad da `412` salvo que esa `ETag` esté entre ellas; si hay esa `ETag`, `If-Match: *` se cumple e `If-None-Match: *` da `412`, y si no hay ninguna, al revés. Un cliente NO DEBERÍA enviarlas en un `POST` así; para crear un elemento solo si su `id` está libre, elige él el `id` ([5.1](https://restep.wubytes.com/es/1/#recursos)). En una acción sobre un elemento, el destino es el elemento, con su ETag de elemento.
- Evaluar `If-Match` y aplicar la escritura DEBE ser atómico respecto a las demás escrituras sobre el mismo elemento.
- Un recurso PUEDE exigir `If-Match`; sin él DEBE responder `428 precondition_required`. Empezar a exigirlo es un cambio incompatible ([5.5](https://restep.wubytes.com/es/1/#versiones)).

### 7.3 Respuesta mínima

Con `Prefer: return=minimal` ([**RFC 7240**](https://www.rfc-editor.org/rfc/rfc7240)), las escrituras PUEDEN responder sin cuerpo: `201` con `Location`, o `204`. Cuando el elemento que crearon o cambiaron sigue existiendo (no tras un `DELETE`), esa respuesta DEBE llevar la ETag de ese elemento en `ETag`, porque no tiene `_etag`, y DEBERÍA llevar `Preference-Applied: return=minimal`. Por defecto devuelven la representación.

## 8. cache (Perfil)

URI del perfil: `https://w3id.org/restep/1/cache`. Estado: estable. Lecturas que una caché puede guardar, revalidar e invalidar. Solo requiere `core`, así que una API de solo lectura puede anunciarlo sin construir el almacén de idempotencia de [7.1](https://restep.wubytes.com/es/1/#idempotencia).

- Toda respuesta a `GET` o `HEAD`, también las de error, DEBE llevar `Cache-Control` explícito.
- Una respuesta que depende de las credenciales es `private` o `no-store`, como exige [5.1](https://restep.wubytes.com/es/1/#respuestas-privadas) a todo servidor. Una que no depende de ellas PUEDE ser `public`, como un documento de descubrimiento servido sin credenciales ([4.2](https://restep.wubytes.com/es/1/#cache-del-descubrimiento)).
- Un `GET` correcto de un elemento completo o de un singleton ([5.9](https://restep.wubytes.com/es/1/#singletons)), sin `fields` ni `include`, DEBE llevar una `ETag`. Si el servidor anuncia también [`writes`](https://restep.wubytes.com/es/1/#writes), es la ETag de elemento de [7.2](https://restep.wubytes.com/es/1/#concurrencia); si no, PUEDE ser débil. Toda `ETag` que dé el servidor DEBE cambiar cuando cambie cualquier cosa de la representación que valida, también los elementos incluidos.
- `If-None-Match` en un `GET`, `HEAD` o `QUERY` DEBE evaluarse como dice el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) (listas, `*`, comparación débil): si coincide, el servidor DEBE responder `304`. El `304` a `QUERY` es una regla de Restep: el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2) (apartado 13.1.2) solo nombra `GET` y `HEAD`, mientras que el [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008) hace que un `QUERY` elija la misma representación que el `GET` equivalente y responde con `304` a uno condicional en su ejemplo. En las escrituras, `If-None-Match` es cosa de [7.2](https://restep.wubytes.com/es/1/#concurrencia).
- Una respuesta correcta a un `GET` DEBERÍA llevar `Cache-Groups` ([**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875)) con cada elemento que representa, también los incluidos, y, si es una colección, la propia colección, para que una caché pueda descartar las listas en las que entra o de las que sale un elemento. Una respuesta `2xx` a un `HEAD` DEBERÍA llevar los grupos que llevaría el `GET`. Una respuesta correcta a una escritura que confirmó cambios (en un lote, la respuesta exterior, que abarca todas las operaciones confirmadas) DEBERÍA llevar `Cache-Group-Invalidation` con cada elemento que cambió y sus colecciones, aunque no tenga cuerpo. Los nombres de grupo son opacos y por origen; la ruta del elemento (`"/books/7"`) y la de la colección (`"/books"`) son la elección obvia. Los nombres de grupo NO DEBEN revelar al cliente lo que no podría saber de otro modo ([5.4](https://restep.wubytes.com/es/1/#errores)): una respuesta nombra por su ruta solo un elemento que el cliente puede ver, e invalida los demás a través de un grupo que pueda conocer, como el de su colección. Una caché puede hacerles caso o no, y el [**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875) solo garantiza 32 grupos por campo, de 32 caracteres cada uno, así que en una página larga o con un id largo puede que no se invaliden todos los elementos. El grupo de la propia colección DEBERÍA ir primero.

## 9. relations (Perfil)

URI del perfil: `https://w3id.org/restep/1/relations`. Estado: estable. La forma de las relaciones la fija el [apartado 3](https://restep.wubytes.com/es/1/#datos) y cómo se escriben, el [5.1](https://restep.wubytes.com/es/1/#recursos), así que las sigue cualquier servidor; este perfil añade las declaraciones y la expansión.

- El descubrimiento DEBE declarar cada relación en `relations`, con su colección de destino en `to` (una lista, si puede apuntar a varias: ver el [apartado 3](https://restep.wubytes.com/es/1/#datos)), `"many": true` si es a muchos e `"include": true` si se puede expandir.
- `include=author` DEBE rellenar ese objeto con el elemento completo; con una relación a varias colecciones, el elemento de la colección que nombra su `type`. Admite rutas con punto (`include=author.publisher`) hasta el `include_depth` declarado (1 si no se declara). Una relación no declarada o no expandible, o una ruta más profunda que `include_depth`, DEBE dar `unsupported_parameter`.
- Si el cliente no puede ver el elemento relacionado, el objeto DEBE quedarse solo con `id` (y `type`, y `href` donde lo exige el [3](https://restep.wubytes.com/es/1/#datos)).
- Cuando el destino es una subcolección, cada objeto de relación lleva `href` ([3](https://restep.wubytes.com/es/1/#datos)): un cliente construye la ruta de un destino normal a partir del `path` de su colección y del `id` ([5.1](https://restep.wubytes.com/es/1/#recursos)), pero el elemento de una subcolección necesita además el `id` de su padre, que lleva el `href`. `{"id": "3", "href": "/books/7/reviews/3"}`.
- Cuando el servidor implementa también `query`, `fields` admite rutas con punto (`fields=title,author.name`); una ruta con punto cuya relación no está en `include` DEBE dar `invalid_parameter`.
- Las relaciones con muchos elementos (las reseñas de un libro) DEBERÍAN ser **subcolecciones**, como `/books/7/reviews`, declaradas con una plantilla en `path` y un `parent` ([4.2](https://restep.wubytes.com/es/1/#subcolecciones)) y que cumplen `core` y, si se anuncia, `query`. La relación que lleva a una PUEDE llevar la misma plantilla en su `path`, como hace `reviews` en el ejemplo de 4.2. Una lista a muchos incrustada en una representación NO DEBE paginarse: si puede crecer sin límite, DEBERÍA ser una subcolección.
- Para filtrar por una relación, el descubrimiento declara la ruta con punto en `filter`: `filter[author.id]=3`.

```
GET /books/7
{ "id": "7", "title": "La niebla de Portugalete", "author": { "id": "3" } }

GET /books/7?include=author&fields=title,author.name
{ "id": "7", "title": "La niebla de Portugalete", "author": { "id": "3", "name": "Inés Arriaga" } }

PATCH /books/7                cambia el enlace, no al autor
{ "author": { "id": "4" } }
```

## 10. sync (Perfil) (Experimental)

URI del perfil: `https://w3id.org/restep/1/sync`. Estado: experimental ([1.2](https://restep.wubytes.com/es/1/#dependencias)). Mantener al día una copia local de colecciones enteras sin volver a descargarlo todo. Requiere `query`.

- Una colección está **sincronizada** cuando declara `sync` en el descubrimiento, como objeto, `{}` si no tiene nada que decir. Una colección NO DEBE declarar `sync` salvo que el servidor anuncie este perfil en `profiles`; sin él, una declaración `sync` no significa nada y ninguna colección está sincronizada. Solo las colecciones sincronizadas responden a `:changes`; en cualquier otra, `:changes` DEBE dar `404 not_found`. Toda colección sincronizada DEBE declarar `id` en `filter` con `in`. El resto de este apartado trata de las colecciones sincronizadas.
- Las respuestas de colección DEBEN llevar `state`: una cadena opaca que cambia cada vez que cambia algo de la colección que el cliente puede ver. Refleja lo que ve ese cliente: un elemento que deja de tener permiso para ver cuenta como borrado. Una respuesta filtrada lleva el mismo `state` que la colección entera; un cliente que guarda una copia de la colección la recorre sin filtros.
- El cliente NO DEBE interpretar ni fabricar un `state`; PUEDE comparar dos estados para ver si son iguales. Se le aplican las mismas consideraciones que a los cursores ([6.4](https://restep.wubytes.com/es/1/#paginacion), [13.9](https://restep.wubytes.com/es/1/#seg-opacos)).
- Todas las páginas de un recorrido DEBEN llevar el `state` de la primera, la petición sin `cursor` (el servidor puede guardarlo en el cursor). El cliente DEBE usarlo como `since` en su siguiente sincronización: los cambios hechos durante el recorrido aparecerán ahí.
- Un recorrido NO DEBE perder elementos: todo elemento que existía, y casaba con la petición, cuando se sirvió la primera página, y que no aparece en `:changes` desde ese `state`, sale en alguna página. Los cursores por desplazamiento no lo garantizan; los cursores por clave o una instantánea sí.
- `GET /books:changes?since=<state>` devuelve los identificadores creados, modificados y borrados desde ese estado. La respuesta DEBE llevar `since`, `state`, `has_more`, `created`, `updated` y `destroyed`. Cada identificador DEBE aparecer como mucho en una lista, elegida según lo que el cliente podía ver entre `since` y el `state` devuelto (un elemento que no existe no se ve). Estas reglas cubren los elementos que cambiaron, o cuya visibilidad para el cliente cambió, en ese intervalo:
   - un elemento que podía ver en `since` y no ve en `state` DEBE estar en `destroyed`;
   - un elemento que ve en `state` DEBE estar en `updated` si lo podía ver en `since` y cambió o dejó de verse entre medias, y en `created` si no lo podía ver en `since`;
   - un elemento que no ve en ninguno de los dos extremos DEBE estar en `destroyed` si lo pudo ver entre medias, y NO DEBE aparecer en otro caso.
- Un elemento que veía en los dos extremos y no cambió PUEDE estar en `updated`. Si el servidor no puede reconstruir lo que el cliente veía en el intervalo, DEBE responder `410 state_expired`; que pueda o no NO DEBE depender de que exista un elemento cuya existencia se oculta al cliente ([5.4](https://restep.wubytes.com/es/1/#errores)). Los clientes DEBEN tratar igual `created` y `updated`, pidiendo el elemento y sustituyendo su copia, y DEBEN ignorar un `id` de `destroyed` que no tienen.
- Si `has_more` es `true`, el `state` devuelto es intermedio: el cliente DEBE repetir la llamada con él hasta que `has_more` sea `false` antes de dar su copia por actualizada.
- `:changes` abarca la colección entera: los filtros y los demás parámetros de `query` DEBEN dar ahí `unsupported_parameter`, y si falta `since` DEBE dar `invalid_parameter`. Sincronizar una vista filtrada queda fuera de esta versión.
- El cliente pide los elementos cambiados con `GET /books?filter[id][in]=7,12`.
- El servidor DEBERÍA guardar los cambios al menos 7 días y DEBERÍA declarar cuánto en `sync.retention` de la colección (en segundos). Si ya no puede calcular los cambios, DEBE responder `410 state_expired`, y el cliente vuelve a cargar la colección.
- El nombre de acción `changes` queda reservado para este perfil ([11.1](https://restep.wubytes.com/es/1/#actions)).
- El servidor PUEDE ofrecer avisos por Server-Sent Events en la ruta declarada en `events`, relativa a la raíz de la API como los miembros `path` del descubrimiento ([2](https://restep.wubytes.com/es/1/#terminos)); esa respuesta DEBE llevar `Cache-Control: no-store`. PUEDE limitar los flujos que un principal mantiene abiertos, y DEBE responder `429 rate_limited` al que pase de ese límite. Cada evento dice qué colecciones tienen un estado nuevo, y nombra cada una por su clave o, si es una subcolección, por su ruta relativa a la raíz de la API con la plantilla expandida (`"/books/7/reviews"`); los datos en sí se piden con `:changes`. El servidor NO DEBE enviar un evento por un cambio que no cambie el `state` de ese principal, o el ritmo de los eventos revelaría actividad que no puede ver.
- Los eventos son pistas: el cliente DEBE tolerar eventos repetidos, fusionados y desordenados. Al abrir el flujo, y en cada reconexión, el cliente DEBE llamar a `:changes` en cada colección que guarda, desde el último estado que aplicó, y DEBE avanzar ese estado solo después de aplicar los cambios; un evento por sí solo nunca lo avanza. El servidor NO DEBE depender de `Last-Event-ID` para reanudar.
- El servidor DEBERÍA mandar un comentario SSE al menos cada 30 segundos, para reducir los cortes por inactividad. DEBE cerrar el flujo cuando dejen de valer las credenciales con las que se abrió, y DEBE responder `401` a toda reconexión con credenciales no válidas, también a la automática de `EventSource`. Después, la aplicación DEBE esperar a tener credenciales válidas antes de volver a abrir el flujo.

```
GET /books:changes?since=s128
{ "since": "s128", "state": "s131", "has_more": false,
  "created": ["51"], "updated": ["7", "12"], "destroyed": ["34"] }

GET /events            Accept: text/event-stream
event: state
data: {"books": "s131"}
```

## 11. Extensiones

Cada extensión se anuncia en `extensions` y tiene su propia URI de perfil (`https://w3id.org/restep/1/batch`…). Qué requiere cada una, y si es estable o experimental, está en [1.2](https://restep.wubytes.com/es/1/#dependencias).

### 11.1 actions (Extensión)

Estado: estable. Operaciones que no son crear, leer, actualizar ni borrar, al estilo de la [**AIP-136**](https://google.aip.dev/136): el nombre de la acción va tras dos puntos.

```
POST /orders/2001:cancel       sobre un elemento
POST /books:import             sobre la colección
GET  /orders/2001:preview      una acción segura declarada con "method": "GET"
```

- Cada acción DEBE declararse en `actions` de su colección, con `on` (`"item"` o `"collection"`), `safe` e `idempotent`. Los nombres de acción siguen el [3](https://restep.wubytes.com/es/1/#nombres) y DEBERÍAN ir en `snake_case`; una colección NO DEBE declarar una acción llamada `changes`, que usa [`sync`](https://restep.wubytes.com/es/1/#sync).
- Una acción usa `POST` salvo que su declaración diga `"method": "GET"`, cosa que solo PUEDEN hacer las acciones seguras. El servidor DEBE aceptar también los dos puntos codificados como `%3A`.
- La declaración PUEDE llevar `description` y, si la acción usa `POST`, un esquema `input` ([4.3](https://restep.wubytes.com/es/1/#describir)). Una acción `GET` no tiene cuerpo, así que NO DEBE declarar `input`.
- Una acción `POST` DEBE tratar un cuerpo vacío, con o sin `Content-Type`, como `{}` enviado como `application/json`; así, un cliente que no tiene nada que enviar puede enviar cualquiera de los dos. Un cuerpo no vacío sigue el [3](https://restep.wubytes.com/es/1/#tipos-de-medio).
- La respuesta DEBE ser la representación del recurso afectado (`200`), uno nuevo (`201` con `Location`) o nada (`204`).
- Una petición a una acción que su colección no declara, o que está declarada con `on` para el otro tipo de recurso, DEBE dar `404 not_found`, como cualquier recurso que no existe; una acción declarada con otro método DEBE dar `405` con `Allow`. Una acción declarada que el estado actual del elemento no permite DEBE dar `409 conflict`, con un `reason` si la API tiene uno ([5.4](https://restep.wubytes.com/es/1/#errores)); una que este principal no puede usar, `403` o `404` ([4.2](https://restep.wubytes.com/es/1/#descubrimiento)).
- Con [`writes`](https://restep.wubytes.com/es/1/#writes), una acción declarada `"idempotent": true` NO DEBE rechazar una petición porque lleve una `Idempotency-Key` bien formada: PUEDE ignorarla, porque repetir la acción ya es seguro ([5.7](https://restep.wubytes.com/es/1/#reintentos)), o aplicarle [7.1](https://restep.wubytes.com/es/1/#idempotencia); a una petición sin credenciales, cuando `idempotency` declara `"anonymous": false`, ignora la clave y no guarda nada con ella ([7.1](https://restep.wubytes.com/es/1/#claves-anonimas)). Un cliente PUEDE enviar una a cualquier acción `POST`.
- Una representación PUEDE listar en `_actions` las acciones disponibles en su estado actual, para que el cliente no duplique las reglas de negocio. Toda acción que liste DEBE estar declarada en `actions` de su colección, con el mismo `on` y el mismo método, para que el cliente sepa si es `safe` e `idempotent`:

```
{ "id": "2001", "status": "paid",
  "_actions": { "cancel": { "method": "POST", "href": "/orders/2001:cancel" } } }
```

### 11.2 batch (Extensión) (Experimental)

Estado: experimental ([1.2](https://restep.wubytes.com/es/1/#dependencias)). Varias operaciones en una petición, en orden y con referencias a los resultados de las anteriores. Se envían a la ruta declarada en `batch.path`.

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

- Cada operación DEBE tener un `id`, único en el lote, un `method`, un `path` y, opcionalmente, `headers` (con los nombres en minúsculas) y `body`. Cada operación DEBE seguir las mismas reglas que si se enviara sola, con las excepciones de este apartado.
- El `path` de una operación DEBE empezar por `/` y es relativo a la raíz de la API ([2](https://restep.wubytes.com/es/1/#terminos)), como los miembros `path` del descubrimiento; NO DEBE llevar esquema, autoridad, fragmento ni segmentos de punto (`.`, `..`), y DEBE nombrar un recurso de Restep ([5.9](https://restep.wubytes.com/es/1/#fuera)) que no sea el flujo de eventos ([10](https://restep.wubytes.com/es/1/#sync)). Un valor que inserte en él una referencia (más abajo) DEBE ser una cadena que sea un `id` válido ([3](https://restep.wubytes.com/es/1/#datos)) o un entero, y el servidor DEBE volver a comprobar esta regla en la ruta resultante; si no, la operación recibe `424 not_executed`.
- Sus `headers` PUEDEN llevar solo `if-match`, `if-none-match`, `idempotency-key` y `prefer`, además de `content-type` y `accept-language`, que el servidor DEBE ignorar: el `body` de una operación ya es JSON y la petición del lote lleva `Content-Type: application/json` ([3](https://restep.wubytes.com/es/1/#tipos-de-medio)), y se aplica el `Accept-Language` del lote (más abajo). Toda operación actúa en nombre del principal del lote, con las credenciales, el `Origin` y el `Accept` de la petición del lote. El servidor NO DEBE aplicar a ninguna operación el `Prefer`, el `If-Match` ni el `If-None-Match` de la propia petición del lote.
- Una referencia es `<id>#<JSON Pointer>` al cuerpo de la respuesta de una operación anterior: entre llaves literales dentro de `path` (`%7B` no lo es), donde el valor DEBE insertarse codificado con porcentajes como segmento de ruta ([**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986)), o como `{"$ref": …}` en lugar de un valor del cuerpo. Un objeto cuyo único miembro es `$ref` es siempre una referencia, así que un cliente que mete en el cuerpo de un lote datos que no escribió él DEBE asegurarse de que ningún objeto de esos datos tenga `$ref` como único miembro.
- Un cuerpo que no es un lote válido, un `id` de operación repetido, una referencia a una operación que no va antes, un lote anidado, un `path` que incumple la regla de rutas de arriba antes de insertar las referencias o una cabecera fuera de esas seis DEBEN dar `400 bad_request` antes de ejecutar ninguna operación. [5.4](https://restep.wubytes.com/es/1/#errores) se aplica a la petición del lote entera antes de ejecutar ninguna operación; una vez aceptado el lote, se aplica a cada operación por separado, sin perjuicio de las reglas de `424 not_executed` que siguen. Más operaciones que `max_operations` DEBEN dar `413 content_too_large`, que el servidor PUEDE dar sin validar las operaciones: un lote que es a la vez demasiado largo y no válido puede recibir `400` o `413` ([5.4](https://restep.wubytes.com/es/1/#orden-de-errores)).
- Un lote que pasa estas comprobaciones, la del modo atómico de abajo y las de cualquier petición (credenciales, tipo de contenido, límites de frecuencia, [7.1](https://restep.wubytes.com/es/1/#idempotencia)) DEBE recibir `200` con un resultado por operación, en orden, cada uno con su `status`, sus `headers` y su `body`; un resultado de error es un objeto problem. Es la única excepción a «ningún error dentro de un `200`» ([5.4](https://restep.wubytes.com/es/1/#errores)).
- Con `"atomic": true`, o todas las operaciones tienen efecto o ninguna. Si una falla, lleva su error y todas las demás DEBEN recibir `424 not_executed`, también las que se ejecutaron y se deshicieron. Un servidor que no puede deshacer alguna de las operaciones (un pago externo, un correo) DEBE rechazar el lote atómico con `422 invalid` antes de ejecutarlo.
- Sin `atomic`, cada operación se aplica por su cuenta; una operación cuya referencia no se puede resolver, porque falló la referida o el puntero no encuentra nada, DEBE recibir `424 not_executed`.
- Con [`writes`](https://restep.wubytes.com/es/1/#writes), el lote en sí PUEDE llevar `Idempotency-Key`; entonces todo el lote sigue [7.1](https://restep.wubytes.com/es/1/#idempotencia), incluida su regla para las peticiones sin credenciales cuando `anonymous` es `false`.
- Otra excepción: los textos de cada resultado nuevo ([5.6](https://restep.wubytes.com/es/1/#idioma)) siguen el `Accept-Language` del lote, y el de una operación se ignora; un resultado repetido (7.1) conserva el suyo. `Content-Language` y `Accept-Language` en `Vary` van en la respuesta del lote, no en los `headers` de cada resultado: `Vary` incluye `Accept-Language` solo si algún resultado nuevo puede variar por idioma, y `Content-Language` se omite salvo que todos los resultados con textos elegidos por idioma compartan uno.

### 11.3 filter-expr (Extensión) (Experimental)

Estado: experimental ([1.2](https://restep.wubytes.com/es/1/#dependencias)). Un filtro como expresión, en la línea de la [**AIP-160**](https://google.aip.dev/160):

```
GET /books?filter=price <= 20 AND (category = "novela-negra" OR rating >= 4.5)
```

- Comparadores `=`, `!=`, `<`, `<=`, `>` y `>=`, que equivalen a `eq`, `ne`, `lt`, `le`, `gt` y `ge`; `AND`, `OR`, `NOT` y paréntesis. Campos por nombre o ruta con punto ([3](https://restep.wubytes.com/es/1/#nombres)); un segmento de ruta puede llevar `-` (`name.es-mx`). `AND`, `OR`, `NOT`, `true`, `false` y `null` nunca son nombres de campo en una expresión: un campo que se llame así no se puede usar en una. Valores: cadenas entre comillas dobles (con `\"` y `\\` como únicos escapes), números, `true`, `false` y `null`. `campo = null` y `campo != null` equivalen al operador `null`.
- `NOT` es lo que más liga. `AND` y `OR` NO DEBEN mezclarse en el mismo nivel sin paréntesis: `a AND b OR c` DEBE dar `invalid_parameter`. La [**AIP-160**](https://google.aip.dev/160) da a `OR` más precedencia que a `AND` y casi todos los lenguajes hacen lo contrario; Restep pide paréntesis para que nadie tenga que adivinar. La yuxtaposición (`a b`, el Y implícito de la [**AIP-160**](https://google.aip.dev/160)) también DEBE dar `invalid_parameter`.
- Un campo u operador no declarados en `filter` DEBEN dar `unsupported_parameter`. Las comparaciones siguen [6.1](https://restep.wubytes.com/es/1/#filtros), también en los valores ausentes y `null`, las colaciones y los campos que el principal no puede leer; un número comparado con un campo `decimal` se lee como decimal exacto.
- No se combina con `filter[…]` en la misma petición: eso DEBE dar `invalid_parameter`.

### 11.4 query-method (Extensión) (Experimental)

Estado: experimental ([1.2](https://restep.wubytes.com/es/1/#dependencias)). Para consultas que no caben en la URL, el método `QUERY` ([**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008)): seguro, idempotente y cacheable, con los parámetros de `query` en el cuerpo.

```
QUERY /books
Content-Type: application/json

{ "filter": { "price": { "le": "20" }, "category": { "in": ["novela-negra", "poesia"] } },
  "sort": ["-rating"], "fields": ["title", "price"], "limit": 10, "count": true }
```

- Las colecciones que lo aceptan DEBEN anunciarlo con `Accept-Query: application/json` ([**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008)) en sus respuestas a `GET` y `HEAD`.
- El cuerpo es un objeto JSON con los mismos miembros que los parámetros reservados: `filter` como objeto de campos y operadores (o, con `filter-expr`, una cadena), `sort`, `fields` e `include` como listas, `limit` como número y `count` como booleano. Los valores van con su tipo JSON, e `in` lleva una lista, así que sus valores sí pueden contener comas. Un filtro con nombre va como `"nombre": valor`, con el valor de su tipo, o `"nombre": true` si es un interruptor; `false` u otro valor en un interruptor da `invalid_parameter`. Un miembro desconocido DEBE dar `unsupported_parameter`.
- Un `QUERY` DEBE devolver lo mismo que el `GET` equivalente, con los mismos errores; un `If-None-Match` que coincide da `304`, como en `GET` ([8](https://restep.wubytes.com/es/1/#almacenamiento-en-cache)). La URL NO DEBE llevar más parámetros reservados que `cursor`; el servidor DEBE responder a cualquier otro con `unsupported_parameter`.
- En la respuesta, `next` solo lleva `cursor`, que aquí manda sobre la regla de [6.4](https://restep.wubytes.com/es/1/#paginacion) que conserva los demás parámetros. Para la página siguiente, el cliente DEBE enviar a la URL de `next` un cuerpo con los mismos `filter` y `sort`, y PUEDE cambiar `limit`, `fields`, `include` y `count` ([6.4](https://restep.wubytes.com/es/1/#paginacion)); el servidor DEBE responder a un `filter` o un `sort` que no sea igual como valor JSON ([2](https://restep.wubytes.com/es/1/#igualdad-json); un miembro ausente, `{}` y `[]` valen lo mismo) con `invalid_parameter` en `cursor`.
- Las cachés que guardan respuestas a `QUERY` usan el cuerpo como parte de la clave; muchas CDN aún no lo hacen.

### 11.5 oauth (Extensión)

Estado: estable. Cómo averigua un cliente dónde conseguir un token para la API. No define ni la autenticación ni la autorización: ata a la raíz de la API los metadatos de recurso protegido de OAuth 2.0 ([**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728)). Un servidor que no la anuncia autentica como le parezca.

```
GET /api/                         (la raíz de la API: https://example.com/api/)
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource/api/"

GET https://example.com/.well-known/oauth-protected-resource/api/
{ "resource": "https://example.com/api/",
  "authorization_servers": ["https://auth.example.com"],
  "scopes_supported": ["books:read", "books:write"] }
```

- El servidor DEBE servir los metadatos en la URL que el [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728#section-3.1) (apartado 3.1) forma a partir de la raíz de la API: el sufijo well-known va entre el host y la ruta de la raíz, que conserva su barra final; solo cuando la raíz es el host a secas desaparece su barra. Con `https://example.com/api/` es `https://example.com/.well-known/oauth-protected-resource/api/`; con `https://api.example.com/`, `https://api.example.com/.well-known/oauth-protected-resource`.
- En ese documento, `resource` DEBE ser la raíz de la API, carácter a carácter y con la barra final, y `authorization_servers` DEBE listar al menos un emisor: el [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728) lo deja opcional, pero sin él el cliente no tiene nada que descubrir. `scopes_supported` DEBERÍA estar. Cada servidor de autorización se describe con el [**RFC 8414**](https://www.rfc-editor.org/rfc/rfc8414) o con OpenID Connect Discovery; Restep no le exige nada.
- Los metadatos no son un recurso de la API: no se les aplican [4.1](https://restep.wubytes.com/es/1/#cabecera-perfil), [5.1](https://restep.wubytes.com/es/1/#recursos), [5.2](https://restep.wubytes.com/es/1/#colecciones) ni [5.3](https://restep.wubytes.com/es/1/#reservados). Se DEBEN servir como `application/json` sin pedir credenciales, así que nunca dan `401`, y DEBERÍAN llevar `Cache-Control: public` con un `max-age`.
- Cuando la raíz de la API pide credenciales, su `401` DEBE llevar la URL absoluta de los metadatos en `resource_metadata` ([**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728#section-5.1), apartado 5.1), en al menos un reto: `Bearer`, `DPoP` u otro que acepte la API. El [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728#section-3.3) (apartado 3.3) obliga al cliente a descartar los metadatos encontrados así cuyo `resource` no sea la URL que pidió, de modo que en cualquier otro recurso el servidor NO DEBE apuntar `resource_metadata` a los metadatos de la raíz. Los metadatos de la raíz son para la URL exacta de la raíz, sin query. Un cliente que recibe un `401` sin `resource_metadata` forma la URL de los metadatos a partir de la raíz.
- Los errores de OAuth conservan sus códigos de Restep: el reto lleva el error de OAuth y el cuerpo lleva el `code` de Restep. `invalid_request` es `400 bad_request`; `invalid_token`, e `invalid_dpop_proof` y `use_dpop_nonce` ([**RFC 9449**](https://www.rfc-editor.org/rfc/rfc9449)), son `401 unauthenticated`; `insufficient_scope` es `403 forbidden`. Un `403` por falta de scope DEBE llevar `error="insufficient_scope"` en su reto ([**RFC 6750**](https://www.rfc-editor.org/rfc/rfc6750#section-3.1), apartado 3.1) y DEBERÍA nombrar el scope necesario en `scope`, salvo que eso revele permisos que el cliente no debe conocer. Un recurso cuya existencia se oculta sigue dando `404` ([5.4](https://restep.wubytes.com/es/1/#errores)).
- El servidor DEBE rechazar un token destinado a otro servidor de recursos ([**RFC 9700**](https://www.rfc-editor.org/rfc/rfc9700#section-2.3), apartado 2.3). Un cliente pide un token restringido a esta API enviando su `resource` en el parámetro `resource` ([**RFC 8707**](https://www.rfc-editor.org/rfc/rfc8707)).
- Con DPoP ([**RFC 9449**](https://www.rfc-editor.org/rfc/rfc9449)) el reto usa el esquema `DPoP`. Un reintento con una prueba DPoP nueva viene del mismo principal y es la misma petición para [7.1](https://restep.wubytes.com/es/1/#idempotencia).
- Un servidor que admite peticiones de otros orígenes ([5.8](https://restep.wubytes.com/es/1/#navegadores)) DEBERÍA incluir `WWW-Authenticate` en `Access-Control-Expose-Headers` (y `DPoP-Nonce`, si usa nonces DPoP), porque si no un cliente de navegador no puede leerlas, y DEBERÍA servir los metadatos con `Access-Control-Allow-Origin`. `EventSource` no puede enviar `Authorization`, así que un cliente de navegador lee el flujo de eventos de [10](https://restep.wubytes.com/es/1/#sync) con `fetch`; el servidor NO DEBERÍA aceptar tokens en la query ([**RFC 6750**](https://www.rfc-editor.org/rfc/rfc6750#section-2.3), apartado 2.3).

### 11.6 inherit (Extensión) (Experimental)

URI del perfil: `https://w3id.org/restep/1/inherit`. Estado: experimental ([1.2](https://restep.wubytes.com/es/1/#dependencias)).

Un dato puede valer para un elemento sin estar guardado en él: el IVA de un producto es el suyo si lo tiene; si no, el de su categoría, el de la categoría padre o el de la tienda; y si nadie lo tiene, un valor por defecto. Restep lo expresa con **dos campos** y una declaración en el descubrimiento. Las reglas de este apartado valen solo para los campos que declara `inherit`. Una colección NO DEBE declarar `inherit` salvo que el servidor anuncie esta extensión en `extensions`.

- El **campo efectivo** (`tax_rate`) da el valor que vale, ya resuelto. Es de solo lectura.
- El **campo propio** (`tax_rate_own`) da el valor que tiene el propio elemento, o `null` si no tiene y hereda. Es el que se escribe.

Son dos porque un solo campo tendría que mostrar el valor que vale y a la vez guardar el que se escribe. Entonces un cliente que devuelve lo que leyó ([5.1](https://restep.wubytes.com/es/1/#recursos)) convertiría cada valor heredado en propio: el valor no cambia, pero el elemento deja de seguir a su fuente y nadie se entera. Con dos campos, escribir el valor que se ve y decidir si se hereda son operaciones distintas en campos distintos.

```
GET /products/7
→ 200
ETag: "p7-v3"
{ "id": "7", "name": "Calabacín", "category": { "id": "4" },
  "tax_rate": "10",
  "tax_rate_own": null,
  "_inherited": { "tax_rate": { "from": { "href": "/categories/2" } } } }
```

**Declaración.** En el objeto de la colección, `inherit` tiene por claves los campos efectivos:

```
"products": {
  "path": "/products",
  "relations": { "category": { "to": "categories" } },
  "inherit": {
    "tax_rate": { "own": "tax_rate_own", "from": ["category"], "default": true,
                  "description": "IVA del producto; si no tiene propio, el de su categoría." } } },
"categories": {
  "path": "/categories",
  "relations": { "parent": { "to": "categories" }, "store": { "to": "stores" } },
  "inherit": { "tax_rate": { "own": "tax_rate_own", "from": ["parent", "store"], "default": true } } }
```

- `own` nombra el campo propio. Los dos campos DEBEN ser de primer nivel y de uno de los tipos escalares de [4.2](https://restep.wubytes.com/es/1/#descubrimiento), y no pueden ser `id`, una relación ni un mapa de idioma: en esos, `null` o el merge patch ya significan otra cosa ([3](https://restep.wubytes.com/es/1/#datos), [5.1](https://restep.wubytes.com/es/1/#recursos)).
- `from` lista, en orden, las relaciones de las que hereda **este paso**. Cada una DEBE ser a uno y estar declarada en `relations` ([9](https://restep.wubytes.com/es/1/#relations)), aunque el servidor no anuncie ese perfil, y su colección de destino DEBE tener un campo con el mismo nombre que el efectivo. Si ese campo también se declara en su `inherit`, la cadena sigue: así una categoría hereda de su categoría padre con la profundidad que haga falta, sin rutas con punto.
- `"default": true` dice que al final de la cadena hay un valor por defecto y que el efectivo nunca queda vacío. El valor no se publica: cambiarlo es un cambio de datos, no del descubrimiento.
- `description` explica el campo como en [4.3](https://restep.wubytes.com/es/1/#describir).

**Resolución.** El efectivo DEBE ser el propio, si no es `null`; si no, el efectivo del elemento enlazado por la primera relación de `from` que tenga enlace; si no, el valor por defecto; y sin valor por defecto, el campo queda sin valor ([3](https://restep.wubytes.com/es/1/#datos)). Un enlace que crearía un ciclo (una categoría que acaba siendo su propia antecesora) DEBE dar `422 invalid`.

**Lectura.**

- Cuando la representación lleva el campo efectivo, DEBE llevarlo resuelto y con su tipo de siempre. El campo propio va con su valor o con `null`.
- El elemento PUEDE explicar el origen en `_inherited`: un objeto cuyas claves son los campos efectivos presentes en la representación que no salen del propio. Si lo lleva, DEBE nombrarlos todos, así que un campo efectivo que no está en `_inherited` tiene valor propio. Con `fields` ([6.3](https://restep.wubytes.com/es/1/#campos)), `_inherited` solo habla de los campos que van en la respuesta. Cada valor es uno de estos:
   - `{"from": {"href": "/categories/2"}}`: la ruta absoluta ([3](https://restep.wubytes.com/es/1/#datos)) de la **fuente real** del valor, no la del padre inmediato. En el ejemplo, la categoría 4 no tiene valor propio y la 2 sí.
   - `{"from": "default"}`: sale del valor por defecto.
   - `{"from": "hidden"}`: es heredado, pero el cliente no puede ver la fuente. El servidor NO DEBE dar la ruta de un elemento que el cliente no puede ver, igual que una relación se queda solo con `id` ([9](https://restep.wubytes.com/es/1/#relations)), ni la de uno cuya existencia no revela ([5.4](https://restep.wubytes.com/es/1/#errores)).
- Las demás formas quedan reservadas para versiones menores: un cliente DEBE tratar como `"hidden"` un `from` que no conozca.

**Escritura.** El campo propio es un campo normal y sigue el merge patch sin excepciones. Es el único que cambia la herencia:

| Cuerpo del `PATCH` | Efecto |
|---|---|
| `{"tax_rate_own": "4"}` | Pasa a tener valor propio, el 4 |
| `{"tax_rate_own": "10"}`, igual al heredado | Pasa a tener valor propio, el 10: vale lo mismo, pero ya no sigue a la categoría |
| `{"tax_rate_own": null}` | Borra el valor propio y vuelve a heredar |
| Sin `tax_rate_own` | No cambia nada |

El campo efectivo es de solo lectura ([5.1](https://restep.wubytes.com/es/1/#recursos)), así que escribirlo nunca cambia nada: un `PATCH` con su valor actual se ignora, y otro valor da `422 invalid` con una entrada `read_only`, cuyo `detail` DEBERÍA nombrar el campo propio. Se compara en vez de ignorar siempre para que un cliente que intenta cambiarlo se entere de que no ha cambiado nada, en lugar de recibir un `200` engañoso.

- En un `POST`, el campo propio ausente o `null` hace que el elemento nazca heredando, y el efectivo sigue la misma regla, comparado con el valor que resultaría.

```
PATCH /products/7
{ "tax_rate": "4" }
→ 422 application/problem+json
{ "type": "https://w3id.org/restep/1/errors#invalid", "title": "Datos no válidos", "status": 422, "code": "invalid",
  "errors": [ { "pointer": "/tax_rate", "code": "read_only",
                "detail": "«tax_rate» es el valor efectivo; escribe en «tax_rate_own»." } ] }
```

**Devolver los campos efectivos tal como se leyeron no cambia nada.** Es la regla de [5.1](https://restep.wubytes.com/es/1/#recursos) aplicada a la herencia: un `PATCH` con los campos efectivos tal como se leyeron deja el elemento igual: coinciden y se ignoran, los propios que no lleva no se tocan, y `_inherited` se ignora como cualquier miembro `_`. Un cliente que no sabe que existe el campo propio puede omitirlo sin riesgo, y el único error que puede cometer es escribir en el efectivo, que da el `422` de arriba y le dice dónde escribir. Esto funciona porque en un `PATCH` lo ausente no se toca: con un `PUT`, que Restep deja fuera ([5.1](https://restep.wubytes.com/es/1/#recursos)), omitir el campo propio lo borraría y el elemento volvería a heredar sin que nadie lo pidiera.

```
PATCH /products/7                el campo efectivo tal como se leyó, sin el propio
{ "id": "7", "tax_rate": "10" }
→ 200, el elemento sin cambios y la misma ETag
```

**Lecturas desfasadas.** Si entre la lectura y la escritura cambia la fuente (la categoría 2 pasa al 5 %), el `"tax_rate": "10"` que devuelve el cliente ya no coincide. Con `If-Match` da `412`, porque la `ETag` del producto ya cambió ([7.2](https://restep.wubytes.com/es/1/#concurrencia)); sin él, `422` con `read_only`. En los dos casos falla sin cambiar nada, cuando un campo normal desfasado pisaría en silencio el cambio de otro.

**Al cambiar una fuente.** Cuando cambia el valor de una categoría, cambia el efectivo de todos los elementos que heredan de ella, aunque nadie los haya tocado. Para el cliente, esos elementos han cambiado, así que lo que ya dicen otros apartados se aplica a cada uno:

- su `ETag` cambia ([7.2](https://restep.wubytes.com/es/1/#concurrencia): es la de la representación completa), también cuando solo cambia `_inherited`, por ejemplo si la categoría 4 fija como propio el mismo valor que heredaba;
- con `sync`, cambia el `state` de su colección y `:changes` los lista ([10](https://restep.wubytes.com/es/1/#sync));
- con caché compartida, la escritura en la fuente DEBERÍA invalidar también los grupos de esos elementos y de las colecciones que pueden contenerlos ([8](https://restep.wubytes.com/es/1/#almacenamiento-en-cache)).

Esto obliga al servidor a guardar los valores efectivos o a propagar cada cambio a todos los descendientes. Es el coste principal de declarar `inherit`.

**Filtros y orden.** Con `query`, filtrar y ordenar por el campo efectivo compara el valor que ve el cliente: `filter[tax_rate][eq]=10` da los que valen 10, hereden o no. Los que heredan se piden con `filter[tax_rate_own][null]=true`, sin operadores nuevos, si se declara ese filtro ([6.1](https://restep.wubytes.com/es/1/#filtros)).

**Evolución.** Añadir herencia a un dato nuevo, o a un campo que ya era de solo lectura, es compatible: se añaden el campo propio y la declaración. Convertir en efectivo un campo que hasta ahora se podía escribir no lo es, porque rechazaría escrituras que antes se aceptaban ([5.5](https://restep.wubytes.com/es/1/#versiones)): se hace en una versión mayor o retirando el campo y añadiendo la pareja con otros nombres.

## 12. Conformidad

Hay dos clases de conformidad, y cada una se declara por perfil y por extensión:

- Un **servidor** cumple un perfil o una extensión cuando cumple todos los requisitos dirigidos al servidor marcados con DEBE o NO DEBE de los apartados 1, 3, 4 y 5 y del apartado de ese perfil o esa extensión, y anuncia los que este requiere ([1.2](https://restep.wubytes.com/es/1/#dependencias)). Un servidor que anuncia un perfil o una extensión declara que lo cumple.
- Un **cliente** cumple un perfil o una extensión cuando, en todo uso que hace de él, cumple todos los requisitos dirigidos al cliente marcados con DEBE o NO DEBE de esos mismos apartados. Todo cliente usa `core`; un cliente que nunca manda un `QUERY` no tiene que cumplir las reglas de [`query-method`](https://restep.wubytes.com/es/1/#query-method). Una biblioteca, un proxy o un agente que habla con una API Restep es un cliente, y un proxy es además un servidor para sus propios clientes.

Los requisitos marcados con DEBERÍA, NO DEBERÍA o PUEDE no deciden la conformidad. El apartado 13 y los apéndices no añaden requisitos.

### 12.1 Servidores

Estas son las comprobaciones que hace un comprobador de conformidad sobre un servidor; cuáles hace hoy [`restep-check`](https://restep.wubytes.com/es/herramientas/) está en su página. Algunas necesitan lo que se le da al comprobador más que lo que puede observar: credenciales de dos principales, una sesión con cookies, o una forma de provocar `429`, `503` o dos escrituras que compiten. Van marcadas con «dado»; un comprobador hace cada una solo cuando se le da eso, y, si no, la da por no hecha, no por superada.

#### core

- Toda colección responde con `{items, next}`, con `next` presente.
- Sin escrituras concurrentes, seguir `next` hasta `null` devuelve cada elemento exactamente una vez.
- Un elemento que no existe da `404` en `problem+json` con `code: "not_found"`. La ruta de un elemento con su `id` cambiado (otras mayúsculas, un cero a la izquierda) da `404` salvo que algún elemento tenga ese `id`; la ruta con un carácter del `id` codificado con porcentajes (`/books/%37`) responde como la del propio elemento.
- El `restep` del documento de descubrimiento encaja con la gramática de [1.1](https://restep.wubytes.com/es/1/#versiones-restep). Con el mismo `Accept-Language`, su cuerpo es igual como valor JSON con credenciales y sin ellas (salvo que sin ellas responda `401`) y, dados dos principales, entre los dos. Si solo se sirve con credenciales, lleva `Cache-Control` con `private` o `no-store`.
- Todo miembro que el servidor añade al descubrimiento fuera de Restep empieza por `x-`, y toda clave de `collections`, `singletons`, `actions`, `relations`, `named_filters` y `reasons`, y todo campo que declara el descubrimiento, encaja con la gramática de los nombres ([3](https://restep.wubytes.com/es/1/#nombres)).
- Un `POST` a una colección que lo admite, con un cuerpo JSON enviado como `text/plain`, como `application/x-www-form-urlencoded`, sin `Content-Type` o como `application/json; charset=latin1`, da `415 unsupported_media_type` y no crea nada, igual que un cuerpo vacío sin `Content-Type`; con `application/json; charset=UTF-8` o `charset="utf-8"` se acepta, y un cuerpo vacío con `application/json` da `400 bad_request`. Todo `2xx` con cuerpo JSON lleva `Content-Type: application/json`.
- Todo `next` y todo `href` de un cuerpo es una ruta absoluta o una URI absoluta cuyo esquema es `https` o el de la raíz de la API, y toda URI absoluta de una cabecera `Location` o `Link` tiene uno de esos esquemas.
- Donde una colección no declara `id_from`, un `POST` con `id` da `422 invalid`. Donde declara `"client"`, uno sin `id` da `422` con una entrada `required` en `/id`; con `"client"` o `"either"`, un `id` con un carácter fuera de los de [3](https://restep.wubytes.com/es/1/#datos) da `422` con una entrada en `/id`, y repetir un `POST` que tuvo éxito, o reutilizar el `id` de un elemento borrado, da `409 conflict` con una entrada `taken` en `/id` y no crea nada.
- Cada singleton declarado responde a `GET` con un objeto JSON, y a `POST` y `DELETE` con `405`; si declara `methods`, su `Allow` coincide con ellos. Sus objetos de relación llevan `href`, e `include` sobre él da `unsupported_parameter`.
- Una subcolección declara `parent`, y la plantilla de su `path` tiene variables con nombres distintos y empieza por el `path` de su padre.
- Todo parámetro reservado no implementado, y toda forma que [5.3](https://restep.wubytes.com/es/1/#reservados) no define (`filter[a][b][c]`, `fields[]`), da `400 unsupported_parameter`, en todos los métodos, salvo que aplique un error que va antes en 5.4: con credenciales válidas y sin otro fallo, un elemento que no existe con un parámetro no admitido da `404 not_found`.
- Un método no admitido da `405` con `Allow`; `HEAD` funciona donde funciona `GET`. Si el descubrimiento declara `methods` o `item_methods`, ese `Allow` coincide con ellos.
- Si el descubrimiento declara `status`, `GET` y `HEAD` a ese recurso dan `200` o `503` con `Cache-Control: no-store`, o si no `401`, `403` o `429`.
- Todo `invalid_parameter` y todo `unsupported_parameter` nombran su parámetro en `parameter`.
- Si el descubrimiento declara un esquema `create`, un `POST` sin una propiedad que exige da `422`, y uno sin una propiedad de primer nivel con `default` crea un elemento con ese valor; si declara un esquema `update` cerrado, un `PATCH` con un miembro que el esquema no admite, aunque valga `null`, da `422`, después de quitar los miembros que 5.1 ignora.
- Todo error lleva `type`, `title`, un `status` igual al de la respuesta y un `code` de la lista o derivado del registro de la IANA.
- Toda `reason` de un error encaja con la gramática de los nombres. Si el descubrimiento declara `reasons`, todo error con `reason`, también en los resultados de `batch`, lleva una declarada y con su `code`.
- Un `PATCH` con `{"author": {"id": "4", "extra": 1}}` cambia el enlace, no guarda `extra` y no toca a ninguno de los dos autores, salvo que lo rechace un esquema `update` declarado. Una relación a un `id` que no existe da `422 invalid` con una entrada `unknown` en su `id`, y un `href` que no es la ruta de un elemento de la colección destino da `422`. Dado un principal que no puede ver el elemento relacionado, devolver la relación tal como se leyó, con otro campo cambiado, funciona.
- Merge Patch sigue el [**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396) (una lista o un escalar sustituidos por un objeto pierden su contenido anterior), salvo que los objetos de relación se sustituyen enteros (5.1) y los mapas de idioma que quedan sin traducciones se leen como `{}` (3) y que, con `inherit`, borrar o cambiar un campo propio cambia también su campo efectivo ([11.6](https://restep.wubytes.com/es/1/#herencia)), y una escritura que cambia el `id` da `422`.
- Un `PATCH` con los campos de solo lectura de un elemento tal como se leyeron no cambia su cuerpo ni su `ETag`, si la hay; otro valor en `id`, o en una propiedad de primer nivel que el cliente puede leer y que su esquema `item` marca `readOnly` directamente en `properties`, da `422 invalid` con una entrada `read_only` en su puntero, sin cambiar nada.
- Un error pedido con un `Accept-Language` que el servidor no ofrece, o mal formado, da el mismo `code` que sin cabecera, nunca `406` ni `400` por ella. Si el cuerpo del descubrimiento o de un error cambia entre dos `Accept-Language`, las dos respuestas, también la del idioma por defecto, llevan `Vary: Accept-Language` y, si llevan `ETag`, distinta.
- Con `Accept-Encoding: identity`, el `GET` de un elemento da el mismo cuerpo con cualquier `Accept-Language` (y, con `writes` o `cache`, la misma `ETag`).
- Dada una forma de provocarlos: un `429` o un `503` con cuerpo `problem+json` no deja ningún efecto, así que repetir la petición pasado el `Retry-After` crea un elemento, no dos.
- Un `401` o un `403`, salvo los del estado del servicio ([4.4](https://restep.wubytes.com/es/1/#salud)) y los de los metadatos de OAuth ([11.5](https://restep.wubytes.com/es/1/#oauth)), lleva `Cache-Control` con `private` o `no-store`. Dadas credenciales: si un `GET` hecho con ellas recibe otro estado u otro cuerpo que la misma petición sin ellas o, dados dos principales, con las del otro, su respuesta lleva `Cache-Control` con `private` o `no-store`, también cuando no se anuncia `cache`.
- Dada una sesión con credenciales que el navegador añade solo (cookies, autenticación HTTP, un certificado de cliente): un `POST`, `PATCH` o `DELETE` con ellas y con un `Origin` que el servidor no permite, también una acción con cuerpo vacío, da `403 forbidden` y no tiene efecto, aunque el servidor envíe `Access-Control-Allow-Origin: *`.
- Una petición que pasa de un límite que el servidor no declara, como una lista `in` de miles de valores, da el resultado completo, `invalid_parameter` con el nombre del parámetro, `413` o `414`; nunca una parte del resultado.
- En un elemento, cada campo de `language_maps` es un objeto de cadenas con claves en minúsculas. Donde se admite `PATCH`: una clave en mayúsculas da `422 invalid` con una entrada `format` en `/name/ES`; borrar con `null` una traducción existente conserva las demás, y volver a ponerla la restaura; `{"name": null}` deja `{}`.

#### Evolución

- Lo que el descubrimiento lista en `deprecations` lleva `Deprecation` en las respuestas que lo usan, según las enumera [5.5](https://restep.wubytes.com/es/1/#versiones); pasado su `sunset` responde como dice 5.5. Todo aviso tiene un `kind` conocido y un instante `announced` que no cambia entre dos lecturas.
- Comparando los documentos de descubrimiento de dos despliegues de la misma versión, no desaparece nada declarado salvo lo listado en `deprecations` cuyo `sunset` ya pasó.

#### query

- Cada filtro declarado devuelve solo los elementos que lo cumplen, comparando según el tipo declarado (los decimales, de forma exacta).
- Un campo de filtro, un operador o un campo de orden no declarados dan `unsupported_parameter`; un valor del tipo equivocado, un parámetro repetido o un valor `duration` con años o meses, `invalid_parameter`.
- Un `+` en la query se lee como un espacio: `filter[f]=a+b` y `filter[f]=a%20b` dan la misma página.
- Un filtro con nombre declarado se aplica sin operadores; con un operador da `unsupported_parameter`, y un interruptor con valor o uno con tipo sin valor o con un valor que no encaja, `invalid_parameter`. Ninguno se llama como una clave de `filter`.
- Ningún filtro `boolean` declara operadores distintos de `eq`, `ne` y `null`, y el filtro de `id` no declara ninguno de `lt`, `le`, `gt` y `ge`.
- `sort` ordena y desempata de forma estable entre páginas. Un campo de cadena que no figura en `collations` filtra y ordena por puntos de código; ninguna clave de `collations` es `id` ni un campo no declarado como cadena.
- Ni un campo que es una lista, ni una ruta que pasa por una relación a muchos, ni una ruta que acaba en el `id` del elemento de una subcolección se declaran en `filter` ni en `sort`.
- Repetir un parámetro de `next` codificado con porcentajes de otra forma, o reordenar los parámetros, da la misma página.
- `limit` por encima de `max_limit` da `invalid_parameter`, y `limit` en una colección sin `max_limit` da `unsupported_parameter`; un cursor manipulado, o reutilizado con otros filtros, otro orden u otra colección, da `invalid_parameter`; cambiar `limit`, `fields`, `include` o `count` entre páginas lo mantiene válido.
- Ni un campo de `language_maps` ni una ruta que acabe en uno o lo atraviese se declaran en `filter` ni en `sort`; un filtro u orden `campo.etiqueta` declarado lee solo esa clave, y los elementos que no la tienen cuentan como ausentes.
- `fields` devuelve solo esos campos, más `id` y los miembros que empiezan por `_`; `fields=id` se acepta. `fields` o `include` en un `POST` o un `PATCH` da `unsupported_parameter`.
- Dado un principal que no puede leer un campo en algunos elementos: un filtro declarado sobre él no encaja con ninguno de ellos salvo con `null` a `true`, un orden por él los pone al final, y `total` cuenta solo los elementos que ese principal puede ver.
- `count=true` añade `total` si `count` está declarado; `count=true` y `count=false` dan `unsupported_parameter` si no lo está.

#### writes

- Repetir un `POST` con la misma `Idempotency-Key` una vez terminada la primera devuelve la misma respuesta y no crea nada nuevo.
- La misma clave con otro cuerpo, o en la misma ruta con otra query, da `422 idempotency_mismatch`; una clave mal formada, o una con parámetros, da `400 bad_request` en un `POST`.
- La `ETag` de un elemento completo, pedido con `Accept-Encoding: identity`, es fuerte; toda respuesta cuyo cuerpo es un elemento, con `fields` o sin él y con cualquier `Accept-Encoding`, lleva esa ETag del elemento en `_etag`, que dos lecturas de un elemento sin cambios dan igual; una escritura ignora los miembros `_`.
- En una colección que declara `sync` y cuyos elementos admiten `PATCH` o `DELETE`, cada elemento listado lleva en `_etag` la `ETag` que da su propio `GET` con `Accept-Encoding: identity` para la misma versión.
- `If-Match` con una `ETag` antigua da `412`, y una lista que contiene la vigente funciona; dada una forma de hacer competir dos escrituras con el mismo `If-Match`, una de ellas recibe `412`. `If-None-Match` con la vigente, débil o fuerte, da `412` a una escritura y no la aplica.
- `If-Match` con una etiqueta de entidad inventada en un `POST` a una colección da `412` y no crea nada.
- Un `PATCH` o `DELETE` con `If-Match` a un elemento que se acaba de borrar da `404`, no `412`.
- Una escritura con `Prefer: return=minimal` respondida sin cuerpo lleva la `ETag` del elemento, salvo que lo haya borrado.
- La misma petición enviada otra vez mientras la primera sigue en curso da `409 request_in_progress` o, cuando la primera termina, su respuesta; nunca un segundo efecto.
- Donde se acepta sin credenciales un `POST` no idempotente, la misma petición con la misma `Idempotency-Key` y también sin credenciales o se repite como para cualquier principal o, si el descubrimiento declara `"anonymous": false` en `idempotency`, recibe `400 bad_request` con una entrada para la cabecera, sin efecto; un recurso que exige la clave no da ahí `idempotency_key_required` a una petición sin credenciales.

#### cache

- Todas las respuestas a `GET` o `HEAD`, también las de error, llevan `Cache-Control`; dadas credenciales, con ellas `private` o `no-store` (como en core).
- El `GET` de un elemento completo lleva `ETag`, e `If-None-Match` con ella, débil o fuerte, da `304` a un `GET` y a un `HEAD`.

#### relations

- Las relaciones son objetos con `id`, también sin `include`, y todas están declaradas. Una que puede apuntar a varias colecciones lleva `type`; una cuyo destino es una subcolección lleva un `href` al que un `GET` responde con ese elemento.
- `include` de una relación declarada y expandible rellena el objeto; de cualquier otra, `unsupported_parameter`. Con `query`, una ruta con punto en `fields` cuya relación no está en `include` da `invalid_parameter`.

#### sync

- Ninguna colección declara `sync` salvo que `profiles` lo liste. Toda colección que declara `sync` declara `id` en `filter` con `in`; `:changes` en una que no lo declara da `404`.
- `:changes` recoge, en las listas que pide [10](https://restep.wubytes.com/es/1/#sync), la creación, el cambio y el borrado de un elemento desde el `state` anterior, y todas las páginas de un recorrido llevan el mismo `state`; borrar un elemento a mitad de recorrido no hace que se pierda otro.
- La respuesta de `events`, si se declara, lleva `Cache-Control: no-store`. Dado un principal que ha llegado a su límite de flujos abiertos, uno nuevo recibe `429 rate_limited`.

#### actions

- Una acción `POST` responde igual a un cuerpo vacío que a `{}`; una acción no declarada da `404 not_found`, y una declarada con otro método, `405` con `Allow`; toda acción de `_actions` está declarada con el mismo método; ninguna acción se llama `changes`.
- Con `writes`, una acción declarada `"idempotent": true` no rechaza una petición por llevar una `Idempotency-Key` bien formada, con credenciales o sin ellas, diga lo que diga `idempotency.anonymous`.

#### batch

- Un `id` de operación repetido, una referencia a una operación posterior, un lote anidado, un `path` con esquema, autoridad o segmentos de punto o que va al flujo de eventos, o una cabecera que [11.2](https://restep.wubytes.com/es/1/#batch) no permite, dan `400 bad_request` y no ejecutan nada; más operaciones que `max_operations` dan `413`; un lote con los dos fallos recibe cualquiera de los dos. Un valor insertado en `path` que no es un `id` válido ni un entero, como `../admin`, recibe `424 not_executed`.
- Con `"atomic": true` y una operación que falla, todos los demás resultados son `424 not_executed` y no persiste nada.
- Sin `atomic`, una operación cuya referencia no se puede resolver recibe `424 not_executed`.

#### filter-expr

- Una expresión devuelve los mismos elementos que los parámetros `filter[…]` equivalentes; `AND` y `OR` mezclados en un mismo nivel sin paréntesis, la yuxtaposición, o una expresión junto con `filter[…]`, dan `invalid_parameter`; un campo o un operador no declarados dan `unsupported_parameter`.

#### query-method

- Una colección cuyo `GET` lleva `Accept-Query` responde a un `QUERY` como al `GET` equivalente, también en los errores; un miembro desconocido, o un parámetro reservado distinto de `cursor` en la URL, da `unsupported_parameter`; la página siguiente con otro `filter` u otro `sort` da `invalid_parameter` en `cursor`.

#### oauth

- Los metadatos están en la URL que el [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728) forma a partir de la raíz, como JSON, sin pedir credenciales, con `resource` igual a la raíz y al menos un servidor de autorización.
- Los metadatos no dan `401` (y, como recomendación, llevan `Cache-Control: public`).
- Si la raíz pide credenciales, su `401` lleva esa URL absoluta en `resource_metadata`; ningún `401` de otro recurso apunta ahí.
- Dado un token sin el scope que necesita una petición: salvo que se oculte la existencia del recurso, la petición recibe `403` con `code: "forbidden"` y `error="insufficient_scope"` en el reto.

#### inherit

- Ninguna colección declara `inherit` salvo que `extensions` lo liste. Si una lo hace y se admite `PATCH`: devolver con `PATCH` solo los campos efectivos de un elemento tal como se leyeron, sin sus campos propios, no cambia su cuerpo ni su `ETag`; `{"tax_rate_own": null}` deja el efectivo igual al de su fuente y, si hay `_inherited`, este lo nombra; y un valor distinto en el campo efectivo da `422 invalid` con una entrada `read_only` en `/tax_rate`, sin cambiar nada.

### 12.2 Clientes

Estos son los requisitos que el texto dirige a los clientes, reunidos por perfil y extensión. Cada uno está en el apartado citado, que prevalece.

#### core

- No trata como documento de descubrimiento de Restep 1 uno cuyo `restep` no encaja con la gramática o cuya versión mayor no es 1, ni supone solo `core` para uno de otra versión mayor; para un valor de `restep` con sufijo, no supone que cumpla ninguna versión publicada ni ningún otro borrador ([1.1](https://restep.wubytes.com/es/1/#versiones-restep)).
- No usa un perfil o una extensión experimentales salvo que `restep` declare una versión cuyo texto de ese perfil o esa extensión implementa el cliente ([1.2](https://restep.wubytes.com/es/1/#experimental)).
- Ignora los campos y los miembros `_x_` que no conoce, y no rechaza una respuesta por un valor de enumeración que no figura en su copia guardada del descubrimiento o de un esquema ([3](https://restep.wubytes.com/es/1/#datos)).
- No sigue un enlace cuyo esquema no es `https` ni el de la raíz de la API ([3](https://restep.wubytes.com/es/1/#datos)).
- Manda el cuerpo de un `POST` a una colección, a una acción o a un lote, y el de un `QUERY`, con `Content-Type: application/json` ([3](https://restep.wubytes.com/es/1/#tipos-de-medio)).
- Trata una respuesta como documento de descubrimiento solo si es un objeto JSON con un miembro de tipo cadena `restep`, y si no supone solo `core`; de varios enlaces `service-desc`, usa el primer destino que sea un documento de descubrimiento ([4.2](https://restep.wubytes.com/es/1/#descubrimiento)).
- Ignora los miembros del documento de descubrimiento que no conoce, no falla por un valor que no conoce, y no usa un filtro, una acción o un aviso cuyo `type`, `on`, `method` o `kind` no conoce ([4.2](https://restep.wubytes.com/es/1/#miembros-desconocidos)).
- Manda sus credenciales de la API solo a URL del origen de la API, y pide sin ellas los esquemas y documentos de otros orígenes ([4.3](https://restep.wubytes.com/es/1/#describir)).
- No hace ninguna petición que no sea segura, ni manda datos a otro origen, solo porque se lo pida un texto que devolvió la API ([4.3](https://restep.wubytes.com/es/1/#los-textos-son-datos)).
- No supone una ruta para el estado del servicio, como `/health` ([4.4](https://restep.wubytes.com/es/1/#salud)).
- No manda `id` en un `POST` a una colección cuyo `id_from` tiene un valor que no conoce, lo manda donde `id_from` es `"client"`, y enlaza un elemento de una subcolección por su `href` ([5.1](https://restep.wubytes.com/es/1/#recursos)).
- Sigue `next` tal cual, cambiando solo los parámetros que [6.4](https://restep.wubytes.com/es/1/#paginacion) le deja cambiar, manda un `+` literal de la query como `%2B`, y no supone ningún orden de los `id` ([5.2](https://restep.wubytes.com/es/1/#colecciones)).
- Trata un `code` que no conoce según la clase del `status`, y una `reason` que no conoce como su `code` ([5.4](https://restep.wubytes.com/es/1/#errores)).
- Ignora un singleton cuyo `path` es una plantilla de URI o que lleva `parent` ([5.9](https://restep.wubytes.com/es/1/#singletons)).

#### query

- No supone puntos de código para un campo cuya colación es `"server"`, ni reproduce en local ese orden o esa igualdad, y trata como `"server"` un valor de colación que no es una cadena o que no conoce ([6.1](https://restep.wubytes.com/es/1/#colaciones)).
- No interpreta ni construye cursores ([6.4](https://restep.wubytes.com/es/1/#paginacion)).

#### writes

- No cuenta con `Idempotency-Key` salvo que el servidor anuncie `writes` ([7.1](https://restep.wubytes.com/es/1/#idempotencia)).

#### sync

- No interpreta ni construye un `state`, y compara estados solo por igualdad ([10](https://restep.wubytes.com/es/1/#sync)).
- Usa el `state` de la primera página de un recorrido como `since` de su siguiente sincronización, y vuelve a llamar a `:changes` mientras `has_more` sea `true` antes de dar su copia por actual.
- Trata igual `created` y `updated`, e ignora un `id` de `destroyed` que no tiene.
- Tolera eventos repetidos, fusionados y desordenados; al abrir el flujo y en cada reconexión llama a `:changes` desde el último estado que aplicó, y avanza ese estado solo después de aplicar los cambios, nunca por un evento solo.
- Tras un `401` en el flujo, espera a tener credenciales válidas antes de volver a abrirlo.

#### batch

- Cada operación tiene un `id` único en el lote, un `method` y un `path`; se asegura de que ningún objeto de un cuerpo que no escribió tenga `$ref` como único miembro ([11.2](https://restep.wubytes.com/es/1/#batch)).

#### query-method

- La URL de su `QUERY` no lleva ningún parámetro reservado distinto de `cursor`, y para la página siguiente manda a la URL de `next` un cuerpo con el mismo `filter` y el mismo `sort` ([11.4](https://restep.wubytes.com/es/1/#query-method)).

#### inherit

- Trata como `"hidden"` un `from` de `_inherited` que no conoce ([11.6](https://restep.wubytes.com/es/1/#herencia)).

Los demás perfiles y extensiones no dirigen a los clientes ningún requisito marcado con DEBE o NO DEBE.

## 13. Consideraciones de seguridad y privacidad

Este apartado explica los riesgos de una API Restep y remite a los requisitos que los tratan, que están en los apartados que cita. No añade requisitos. Una API tiene además los riesgos de HTTP ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-17), apartado 17), de JSON ([**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259#section-12), apartado 12), de los detalles de problema ([**RFC 9457**](https://www.rfc-editor.org/rfc/rfc9457#section-5), apartado 5) y de OAuth ([**RFC 9700**](https://www.rfc-editor.org/rfc/rfc9700)); este apartado trata lo que Restep les añade o decide sobre ellos.

### 13.1 Los textos de la API son datos

Un agente que elige una herramienta a partir del documento de descubrimiento mete en su prompt las descripciones, los títulos de los esquemas, las razones y los detalles de los errores, y con ellos los datos de cada elemento. Quien escribe el nombre de un elemento, o controla la API, puede escribir ahí una instrucción. Ningún agente basado en un modelo puede prometer que nunca seguirá una, así que [4.3](https://restep.wubytes.com/es/1/#los-textos-son-datos) pide lo que se puede comprobar: un cliente no hace ninguna petición que no sea segura, ni manda datos a otro origen, solo porque se lo pida un texto así, y un agente marca en su prompt dónde empieza y dónde acaba el texto de la API. Un cliente tampoco da nunca más permisos a un agente porque una descripción los pida. Los nombres que da una API siguen una gramática sin espacios ni puntuación ([3](https://restep.wubytes.com/es/1/#nombres)), así que son seguros como partes de nombres de herramientas; un agente que añade un prefijo (`list_`, `get_`), o cuyo registro de herramientas no distingue mayúsculas o solo admite nombres más cortos, sigue teniendo que resolver las colisiones que resultan. Un `parameter` de un error es el parámetro tal como llegó, que un atacante puede escribir en un enlace: un cliente que lo muestra lo escapa.

### 13.2 Credenciales y orígenes

- Un cliente manda sus credenciales solo a URL del origen de la API ([4.3](https://restep.wubytes.com/es/1/#describir)). Un documento de descubrimiento puede enlazar esquemas, documentación, un estado del servicio y, con `href`, recursos de cualquier origen; un enlace `next` también podría. Pedido con las credenciales de la API, cualquiera de ellos entregaría esas credenciales a quien controle el otro origen.
- Los enlaces usan `https` o el esquema de la raíz de la API, y un cliente no sigue uno con otro esquema ([3](https://restep.wubytes.com/es/1/#datos)), así que un documento de descubrimiento no puede mandarlo a `file:` ni a `data:`. Un cliente que sigue enlaces de un servidor, como un explorador o un agente alojado, sigue teniendo que mantenerlos lejos de su propia red interna. Un esquema de otro origen lo controla ese origen, así que un cliente no resuelve su `$ref` en otro sitio ni manda su `default` sin mostrárselo antes al usuario (4.3).
- Una redirección a otro origen es una URL de otro origen. El Fetch Standard quita `Authorization` en una redirección así, pero una biblioteca que copia las cabeceras a mano puede no hacerlo.
- Un token de la API está restringido a ella: el servidor rechaza uno destinado a otro servidor de recursos ([11.5](https://restep.wubytes.com/es/1/#oauth)), así que un token filtrado de otra API no funciona aquí.

### 13.3 Ocultar la existencia

Un `403` dice que algo existe. Restep deja que una API lo oculte:

- un recurso cuya existencia la API no revela da `404`, no `403`, y uno retirado da `410` solo si no se oculta su existencia ([5.4](https://restep.wubytes.com/es/1/#errores)); un método, una acción o un singleton declarados que un principal no puede usar dan `403` o ese `404` ([4.2](https://restep.wubytes.com/es/1/#cache-del-descubrimiento));
- una relación a un elemento que el cliente no puede ver conserva solo su `id` ([9](https://restep.wubytes.com/es/1/#relations)), que aun así revela ese `id`, y su `href` y su `type` revelan el `id` de su padre y su colección; una API que tiene que ocultar incluso eso deja fuera el campo para ese principal, como cualquier campo que no puede leer ([6.3](https://restep.wubytes.com/es/1/#campos));
- una escritura que enlaza un elemento que el cliente no puede ver recibe el mismo `422` que una que enlaza un elemento que no existe ([5.1](https://restep.wubytes.com/es/1/#recursos)), y los grupos de caché de una escritura solo nombran por su ruta elementos que el cliente puede ver ([8](https://restep.wubytes.com/es/1/#grupos-de-cache));
- un campo que el principal no puede leer y que el descubrimiento no nombra es, para `fields`, un campo que no existe ([6.3](https://restep.wubytes.com/es/1/#campos)), y los eventos de [10](https://restep.wubytes.com/es/1/#sync) se mandan solo cuando cambia el `state` de ese principal;
- un valor heredado cuya fuente el cliente no puede ver dice `"hidden"`, nunca la ruta de la fuente ([11.6](https://restep.wubytes.com/es/1/#herencia));
- en `:changes`, las listas siguen lo que el cliente podía ver, y que el servidor responda o no `410 state_expired` no depende de elementos ocultos ([10](https://restep.wubytes.com/es/1/#sync));
- un error no revela lo que el principal no podría saber de otro modo ([5.4](https://restep.wubytes.com/es/1/#errores)).

El único sitio donde Restep revela la existencia a propósito es la entrada `taken` de un `id` elegido por el cliente ([13.6](https://restep.wubytes.com/es/1/#seg-id-del-cliente)). Los tiempos de respuesta también pueden distinguir un elemento que existe de uno que no; Restep no pide respuestas en tiempo constante. La `ETag` de un elemento y el `state` de una colección pueden cambiar cuando cambia algo que el principal no puede ver, lo que le dice que algo cambió; un servidor que tiene que ocultarlo los calcula a partir de lo que el principal puede ver.

### 13.4 Oráculos de consulta

Un filtro es una pregunta sobre un valor. Si el servidor la respondiera con valores que el principal no puede leer, que un elemento esté o no en los resultados la respondería, bit a bit: `filter[salary][lt]=50000`, y luego `40000`, encuentra un salario por bisección. El orden da la misma respuesta por la posición, `total` por el número, y `filter[campo][null]` dice si existe un valor. Las defensas:

- Un filtro o un campo de orden sobre un campo que el principal no puede leer en un elemento lo trata como ausente en él, también una ruta con punto que pasa por un elemento relacionado que no puede ver; `null`, el orden y `total` se siguen de eso ([6.1](https://restep.wubytes.com/es/1/#no-legibles), [6.5](https://restep.wubytes.com/es/1/#recuento)). [`filter-expr`](https://restep.wubytes.com/es/1/#filter-expr) sigue la misma regla (11.3). El `403` que 6.1 permite en su lugar depende solo de que el campo no se pueda leer en ningún elemento, lo que no dice nada de los valores.
- Un filtro con nombre no compara nada que declare el descubrimiento, así que el servidor decide qué lee; no selecciona por valores que el principal no puede leer salvo que su descripción diga el criterio ([6.1](https://restep.wubytes.com/es/1/#filtros)). «Tiene al menos un ejemplar libre» puede ser público aunque las existencias de cada tienda no lo sean. Un filtro con nombre que recibe un valor nunca lo compara con valores que el principal no puede leer, diga lo que diga su descripción: «salario por encima de la cantidad dada» encontraría cada salario por bisección.
- Un `total` estimado sigue siendo un recuento de lo que el principal puede ver ([6.5](https://restep.wubytes.com/es/1/#recuento)): un servidor no puede sacarlo de las estadísticas de la tabla entera si algunos elementos están ocultos para ese principal.
- Un cursor de paginación por clave guarda los valores de orden del último elemento que devolvió; [6.4](https://restep.wubytes.com/es/1/#paginacion) pide que no se puedan leer ([13.9](https://restep.wubytes.com/es/1/#seg-opacos)).

### 13.5 Claves de idempotencia

Una clave pertenece a un principal y a un destino ([7.1](https://restep.wubytes.com/es/1/#idempotencia)). Las peticiones sin un principal autenticado comparten uno, así que todos los clientes anónimos comparten un mismo espacio de claves. Quien adivina o ve la clave de otro cliente puede entonces:

- mandar antes una petición distinta con ella, para que la petición de la víctima reciba `422 idempotency_mismatch` y nunca se ejecute;
- mandar la misma petición, si conoce el cuerpo entero, y recibir la respuesta guardada, con lo que el servidor le añadió: un `id`, una marca de tiempo, un secreto o un enlace pensado solo para quien la mandó;
- saber por `Idempotent-Replayed` que alguien ya mandó exactamente esa petición.

Los clientes generan las claves a partir de una fuente aleatoria y usan cada una para una sola petición ([7.1](https://restep.wubytes.com/es/1/#claves-anonimas)). Un servidor cuyas respuestas a escrituras anónimas llevan algo que solo puede ver quien las mandó puede rechazar las claves sin credenciales: lo declara en `idempotency` y responde `400` (7.1), no `401`, que mandaría al cliente a buscar unas credenciales que el recurso no necesita. Las claves viajan en una cabecera y acaban en los mismos registros que el resto de la petición.

### 13.6 Identificadores elegidos por el cliente

- **Colisiones.** Dos clientes que eligen el mismo `id` obtienen un elemento y un `409`. El servidor exige un formato con entropía suficiente, y los clientes lo generan al azar ([5.1](https://restep.wubytes.com/es/1/#id-del-cliente)).
- **Adelantarse con un `id`.** Si un cliente deriva sus `id` de datos (un correo, un número de pedido) o los elige en secuencia, otro puede crear un elemento con el `id` que va a usar, y la creación del propio cliente falla con `409`.
- **El `409` como oráculo.** `taken` responde lo mismo pueda o no ver el cliente el elemento, así que no revela lo que el cliente puede ver; sí revela que el `id` está o estuvo en uso ([5.1](https://restep.wubytes.com/es/1/#id-del-cliente)). Con `id` aleatorios, adivinar uno no es viable. Con un formato que se puede adivinar, dice si un elemento existe, así que una colección cuyos elementos se ocultan a algunos principales ([13.3](https://restep.wubytes.com/es/1/#seg-existencia)) exige un formato que no se pueda adivinar (5.1). El servidor puede comprobar el formato pero no la entropía: un UUID de versión 4 bien formado puede haberse derivado igualmente de datos, así que la protección solo llega hasta donde todo cliente genere sus `id` al azar.
- **El tiempo en el `id`.** Los identificadores ordenables (ULID, UUID de versión 7) llevan el instante de su creación, y los secuenciales cuántos elementos vinieron antes. Quien ve el `id` lo sabe. Esto vale también para los `id` que asigna un servidor.
- **Hashes de `id` borrados.** Un servidor puede guardar solo un hash unidireccional de los `id` de los elementos borrados ([5.1](https://restep.wubytes.com/es/1/#id-del-cliente)). Si esos `id` se derivaron de datos personales, el hash no los anonimiza: quien lo tiene puede volver a calcularlo para cada candidato, como cada dirección de correo de una lista.

### 13.7 Navegadores y peticiones entre sitios

- Un navegador añade cookies a las peticiones que inician páginas de otros orígenes. Una petición con un método o un tipo de medio no simples necesita antes un preflight de CORS, que el servidor puede rechazar; un `POST` enviado como `text/plain`, `application/x-www-form-urlencoded` o `multipart/form-data`, no. Por eso un servidor exige `application/json` en los cuerpos de las peticiones ([3](https://restep.wubytes.com/es/1/#tipos-de-medio)): un servidor que leyera un formulario como JSON aceptaría escrituras desde cualquier página.
- Una acción con cuerpo vacío tampoco necesita preflight ([11.1](https://restep.wubytes.com/es/1/#actions)). Un servidor que acepta credenciales que el navegador añade solo (cookies, autenticación HTTP, certificados de cliente) rechaza toda petición que no es segura y las lleva desde un origen que no permite, por `Origin` o por `Sec-Fetch-Site` ([5.8](https://restep.wubytes.com/es/1/#csrf)), lo que cubre también los navegadores o los caminos que se les escapan a las reglas anteriores; las cookies `SameSite` son una segunda línea. Una página con `Referrer-Policy: no-referrer` manda `Origin: null` incluso a su propio origen, cosa que `Sec-Fetch-Site` distingue.
- `GET` y `HEAD` no tienen efectos ([5.1](https://restep.wubytes.com/es/1/#recursos)), y una acción solo puede usar `GET` si es segura ([11.1](https://restep.wubytes.com/es/1/#actions)), así que un enlace o una imagen no pueden escribir.
- CORS con credenciales nombra el origen ([5.8](https://restep.wubytes.com/es/1/#navegadores)). Un servidor que copia el `Origin` de cualquier petición en `Access-Control-Allow-Origin` junto con `Access-Control-Allow-Credentials: true` da a cualquier sitio el acceso del usuario.
- El navegador no añade un token de `Authorization`, así que este no queda expuesto a las peticiones entre sitios; dónde lo guarda una página queda fuera de Restep.

### 13.8 Límites y abuso

- Límites declarados: `max_limit` ([6.4](https://restep.wubytes.com/es/1/#paginacion)), `include_depth` ([9](https://restep.wubytes.com/es/1/#relations)) y `max_operations` ([11.2](https://restep.wubytes.com/es/1/#batch)). Pasar de ellos da `invalid_parameter`, `unsupported_parameter` y `413`.
- Los límites no declarados, como los valores de una lista `in`, el número de filtros o el tamaño de una expresión, dan `invalid_parameter` con el límite en `detail`, nunca un resultado parcial ([5.3](https://restep.wubytes.com/es/1/#limites)). Un cliente que sincroniza parte un `filter[id][in]` largo en varias peticiones, o usa [`query-method`](https://restep.wubytes.com/es/1/#query-method). Si no: `414` para una URL, `413` para un cuerpo, `429` para las peticiones y los flujos de eventos ([10](https://restep.wubytes.com/es/1/#sync)).
- Algunas peticiones cuestan más de lo que parece: un `include` multiplica la página por su profundidad, un `count` exacto recorre la tabla (un servidor puede declarar `"estimated"`), un filtro puede no tener índice, un lote atómico retiene bloqueos, y el almacén de idempotencia y el registro de cambios crecen con `ttl` y `retention`. Un servidor declara solo lo que puede servir con carga, y limita las peticiones por principal y, para las anónimas, por dirección de red.
- `429` y `503` con cuerpo `problem+json` significan que no hubo efecto, también cuando los da la propia pasarela de la API ([5.7](https://restep.wubytes.com/es/1/#reintentos)), así que un cliente que espera lo que dice `Retry-After`, o que espacia los intentos con algo de azar, no convierte un fallo en una avalancha de reintentos.

### 13.9 Cursores y estados

- Los clientes no interpretan ni construyen cursores ([6.4](https://restep.wubytes.com/es/1/#paginacion)). El servidor liga un cursor a su colección, sus filtros y su orden, y debería ligarlo al principal; tiene que hacerlo cuando el cursor se refiere a resultados calculados para ese principal, como una instantánea (6.4). Firmarlo deja ver cuándo se ha manipulado, y uno manipulado da `invalid_parameter`, nunca otra página.
- Un cursor va en la URL de `next`, y las URL acaban en los registros, en el historial del navegador y en `Referer`. 6.4 pide que no lleve datos de los elementos que se puedan leer, como los valores de la clave en claro; cifrarlo, o guardar la posición en el servidor, lo evita.
- Un `state` de [`sync`](https://restep.wubytes.com/es/1/#sync) es opaco de la misma forma. Los cambios a los que lleva se calculan para el principal que pregunta ([10](https://restep.wubytes.com/es/1/#sync)), así que un `state` que recibió un principal y envía otro solo lista lo que podía ver el segundo.

### 13.10 Caché

- Una caché compartida que guardara una respuesta destinada a un principal se la daría al siguiente. Todo servidor, con el perfil `cache` o sin él, marca `private` o `no-store` una respuesta que depende de las credenciales ([5.1](https://restep.wubytes.com/es/1/#respuestas-privadas)). El [**RFC 9111**](https://www.rfc-editor.org/rfc/rfc9111#section-3.5) (apartado 3.5) ya impide que las cachés compartidas guarden las respuestas a peticiones con `Authorization`, pero no las de peticiones enviadas con cookies o con un certificado de cliente.
- Un `404` que oculta un elemento a un principal también depende de las credenciales, igual que su `200` para otro.
- El documento de descubrimiento es el mismo para todos los principales ([4.2](https://restep.wubytes.com/es/1/#cache-del-descubrimiento)), así que no lleva nada que un principal pueda saber y otro no. Una caché compartida puede guardarlo solo cuando se sirve sin credenciales: uno que solo se sirve con credenciales es `private` o `no-store` (4.2), o una caché se lo daría a quien no tiene ninguna.
- Con `cache` y respuestas cuyas cabeceras CORS dependen de `Origin`, `Vary: Origin` impide que una caché compartida dé a un origen la respuesta de otro ([5.8](https://restep.wubytes.com/es/1/#navegadores)).
- El [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.1) (apartado 13.2.1) hace que un servidor evalúe las precondiciones solo cuando la petición tendría éxito de otro modo, así que un `304` nunca le dice a un principal sin acceso que su `ETag` coincide.

### 13.11 Tokens

- El servidor rechaza los tokens destinados a otro servidor de recursos, y un cliente pide uno restringido a la API con un indicador de recurso ([11.5](https://restep.wubytes.com/es/1/#oauth), [**RFC 8707**](https://www.rfc-editor.org/rfc/rfc8707)).
- Los tokens en la query acaban en los registros, en el historial y en `Referer`, así que el servidor no debería aceptarlos; un navegador lee el flujo de eventos con `fetch`, que puede mandar `Authorization` (11.5). DPoP liga un token a una clave que tiene el cliente ([**RFC 9449**](https://www.rfc-editor.org/rfc/rfc9449)).
- Solo el `401` de la raíz apunta a los metadatos de la raíz (11.5), porque el [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728) hace que un cliente descarte los metadatos cuyo `resource` no es la URL que pidió.
- Los metadatos se sirven sin credenciales y listan los servidores de autorización y los scopes; un `403` por un scope que falta deja fuera `scope` cuando nombrarlo revelaría permisos (11.5).

### 13.12 Privacidad

- **Descubrimiento.** Quien puede leer el documento de descubrimiento conoce todas las colecciones, los singletons, los campos por los que se puede filtrar, las acciones y las razones que declara la API. Es el mismo para todos ([4.2](https://restep.wubytes.com/es/1/#cache-del-descubrimiento)): una API que no puede publicar tanto exige credenciales para leerlo y lo sirve `private` (4.2), da a cada inquilino su propia raíz de API, o deja fuera de su API lo que tiene que seguir sin conocerse.
- **Errores.** Una `reason` dice por qué falló la petición, nada sobre otros; su declaración en `reasons` es pública. `detail` y `errors` no revelan lo que el principal no podría saber de otro modo, ni detalles internos ([5.4](https://restep.wubytes.com/es/1/#errores)). El estado del servicio servido sin credenciales solo dice si la API puede atender ([4.4](https://restep.wubytes.com/es/1/#salud)).
- **Repeticiones.** `Idempotent-Replayed` dice que la misma petición ya se hizo antes con el mismo principal; para el principal anónimo, quizá la hizo otro ([13.5](https://restep.wubytes.com/es/1/#seg-idempotencia)).
- **Identificadores.** Los `id` ordenables y secuenciales revelan cuándo se creó un elemento y cuántos hay ([13.6](https://restep.wubytes.com/es/1/#seg-id-del-cliente)).
- **Consultas en las URL.** Un filtro como `filter[email]=…` pone datos personales en la URL, y por tanto en los registros. [`query-method`](https://restep.wubytes.com/es/1/#query-method) los pone en el cuerpo.
- **Sincronización.** `destroyed` lista los `id` de los elementos que el cliente podía ver y ya no puede; no revela nada de los elementos que el cliente nunca vio ([10](https://restep.wubytes.com/es/1/#sync)).

## 14. Referencias

### 14.1 Normativas

Necesarias para implementar un requisito marcado con DEBE o NO DEBE.

- [**RFC 2119**](https://www.rfc-editor.org/rfc/rfc2119) y [**RFC 8174**](https://www.rfc-editor.org/rfc/rfc8174): palabras clave de requisitos. [**RFC 5234**](https://www.rfc-editor.org/rfc/rfc5234): ABNF, para la gramática de `restep` ([1.1](https://restep.wubytes.com/es/1/#versiones-restep)).
- [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110): semántica de HTTP (métodos, códigos de estado, `ETag`, `If-Match`, `If-None-Match`, `Accept-Language`). [**RFC 9111**](https://www.rfc-editor.org/rfc/rfc9111): caché de HTTP (`Cache-Control`).
- [**RFC 6585**](https://www.rfc-editor.org/rfc/rfc6585): `428` y `429`. [**RFC 4918**](https://www.rfc-editor.org/rfc/rfc4918): `424`.
- [**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259): JSON. [**RFC 9457**](https://www.rfc-editor.org/rfc/rfc9457): Problem Details for HTTP APIs. [**RFC 6901**](https://www.rfc-editor.org/rfc/rfc6901): JSON Pointer.
- [**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396): JSON Merge Patch. [**RFC 5789**](https://www.rfc-editor.org/rfc/rfc5789): `PATCH`.
- [**JSON Schema 2020-12**](https://json-schema.org/draft/2020-12): los esquemas de [4.3](https://restep.wubytes.com/es/1/#describir).
- [**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986): URI. [**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570): plantillas de URI.
- [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339): fechas y horas.
- [**RFC 5646**](https://www.rfc-editor.org/rfc/rfc5646): etiquetas de idioma. [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647): emparejamiento de etiquetas de idioma (*lookup*).
- [**RFC 8288**](https://www.rfc-editor.org/rfc/rfc8288): enlaces web (`Link`, `anchor`, `hreflang`). [**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631): `service-desc`, `service-doc` y `status`. [**RFC 5829**](https://www.rfc-editor.org/rfc/rfc5829): las relaciones `successor-version` y `predecessor-version`.
- [**RFC 9745**](https://www.rfc-editor.org/rfc/rfc9745) y [**RFC 8594**](https://www.rfc-editor.org/rfc/rfc8594): `Deprecation` y `Sunset`.
- [**RFC 9651**](https://www.rfc-editor.org/rfc/rfc9651): Structured Field Values for HTTP, la sintaxis de `Idempotency-Key`.
- [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008): el método `QUERY`.
- [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html) (HTML Standard): el flujo de eventos de [10](https://restep.wubytes.com/es/1/#sync).
- [Fetch Standard](https://fetch.spec.whatwg.org/): la cabecera `Origin` y el protocolo CORS.
- [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728): OAuth 2.0 Protected Resource Metadata. [**RFC 6750**](https://www.rfc-editor.org/rfc/rfc6750): tokens Bearer y sus retos. [**RFC 9700**](https://www.rfc-editor.org/rfc/rfc9700): buenas prácticas actuales de seguridad de OAuth 2.0, para la audiencia de los tokens. Para la extensión [`oauth`](https://restep.wubytes.com/es/1/#oauth).

### 14.2 Informativas

Contexto, fuentes de ideas y especificaciones que una implementación puede usar pero de las que no depende ningún requisito.

- Borrador del IETF [The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) (revisión 08, 22 de octubre de 2026). Restep define por sí mismo la sintaxis y el significado de la cabecera ([7.1](https://restep.wubytes.com/es/1/#idempotencia)).
- Borrador del IETF del [Health Check Response Format](https://datatracker.ietf.org/doc/draft-inadarei-api-health-check/): `application/health+json` ([4.4](https://restep.wubytes.com/es/1/#salud)).
- [**RFC 6906**](https://www.rfc-editor.org/rfc/rfc6906): la relación de enlace `profile` ([4.1](https://restep.wubytes.com/es/1/#cabecera-perfil)). [**RFC 9727**](https://www.rfc-editor.org/rfc/rfc9727): `api-catalog`.
- [**RFC 7240**](https://www.rfc-editor.org/rfc/rfc7240): `Prefer` y `Preference-Applied` ([7.3](https://restep.wubytes.com/es/1/#respuesta-minima)).
- [**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875): HTTP Cache Groups ([8](https://restep.wubytes.com/es/1/#grupos-de-cache)).
- [**RFC 8414**](https://www.rfc-editor.org/rfc/rfc8414) y [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html): metadatos del servidor de autorización. [**RFC 9449**](https://www.rfc-editor.org/rfc/rfc9449): DPoP. [**RFC 8707**](https://www.rfc-editor.org/rfc/rfc8707): indicadores de recurso.
- [Fetch Metadata Request Headers](https://www.w3.org/TR/fetch-metadata/) (W3C): `Sec-Fetch-Site` ([5.8](https://restep.wubytes.com/es/1/#csrf)).
- [**RFC 8620**](https://www.rfc-editor.org/rfc/rfc8620): JMAP, cambios y referencias hacia atrás entre operaciones, que siguen [`sync`](https://restep.wubytes.com/es/1/#sync) y [`batch`](https://restep.wubytes.com/es/1/#batch).
- [**AIP-136**](https://google.aip.dev/136) (acciones), [**AIP-156**](https://google.aip.dev/156) (singletons), [**AIP-158**](https://google.aip.dev/158) (paginación) y [**AIP-160**](https://google.aip.dev/160) (expresiones de filtro) de Google.
- [JSON:API 1.1](https://jsonapi.org/format/).

## Apéndice A. Construir formularios a partir de esquemas

Este apéndice no es normativo. Describe cómo un cliente genérico puede mostrar a las personas un formulario a partir de los esquemas de [4.3](https://restep.wubytes.com/es/1/#describir), para que un servidor sepa cómo se verán sus esquemas en pantalla.

- El formulario de un elemento nuevo sale de `create`; el de edición sale de `update`, relleno con el elemento tal como se leyó.
- `title` y `description` son la etiqueta y la ayuda de un campo, en el idioma de [5.6](https://restep.wubytes.com/es/1/#idioma).
- `default` es el valor con el que empieza el formulario. En `create` es también el valor que el servidor da a un campo ausente (4.3), así que dejarlo sin cambiar y dejar fuera el campo significan lo mismo. Un esquema de otro origen es de ese origen, así que su `default` se muestra antes de enviarse (4.3).
- `examples` se muestran como ejemplos y nunca se envían.
- Un `oneOf` de valores `const`, cada uno con su `title`, da las opciones y sus etiquetas.
- `format`, `maxLength` y las demás restricciones dicen cómo introducir un valor y dejan que el cliente lo compruebe antes de enviarlo; el servidor lo vuelve a comprobar.
- Un campo `readOnly` se muestra y no se edita; uno `writeOnly`, como una contraseña, nunca se rellena con un valor leído.
- Los campos aparecen en el orden de `properties`, que el servidor escribe en el orden que quiere (4.3).
- La disposición, los grupos y los controles que se usan son cosa del cliente.

Un formulario cuyos valores iniciales dependen del usuario o del momento (la fecha de hoy, un valor heredado) no puede salir del descubrimiento, que es el mismo para todos; ver el [Apéndice B](https://restep.wubytes.com/es/1/#futuro).

## Apéndice B. Trabajo futuro

Este apéndice no es normativo. Estos casos quedan fuera de Restep 1. Ninguno necesita un cambio incompatible: cada uno puede llegar como añadido en una versión menor ([1.1](https://restep.wubytes.com/es/1/#versiones-restep)) o como una extensión nueva, cuando las implementaciones muestren cómo debería funcionar. Hasta entonces, una API que necesite uno lo resuelve a su manera, con nombres fuera de los que reserva Restep ([5.3](https://restep.wubytes.com/es/1/#reservados)).

- **Operaciones largas**: `202 Accepted` y un recurso de operación (como en la [**AIP-151**](https://google.aip.dev/151)), para que cada API no se invente el suyo. Aplazado porque la forma de la operación, su cancelación y cómo se combina con `Idempotency-Key` y con las acciones necesitan antes una implementación.
- **Sincronizar vistas filtradas** (como el `queryChanges` de JMAP). Aplazado porque necesita saber qué elementos tenía una vista en el pasado, y el propio `sync` sigue siendo experimental.
- **Añadidos pequeños**: vistas con nombre (`$view`), un enlace `prev` para paginar hacia atrás, resultados de un lote a medida que terminan y reutilizar un `QUERY` con el `Location` que ya define el [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008). Aplazado porque ningún caso los ha necesitado todavía.
- **Mensajes firmados** ([**RFC 9421**](https://www.rfc-editor.org/rfc/rfc9421), con `Content-Digest` del [**RFC 9530**](https://www.rfc-editor.org/rfc/rfc9530) y las claves publicadas como JWKS, [**RFC 7517**](https://www.rfc-editor.org/rfc/rfc7517)) para la integridad entre empresas a través de intermediarios. Aplazado porque Restep 1 no tiene ningún caso que los necesite: TLS cubre al cliente y al servidor, y los eventos de [10](https://restep.wubytes.com/es/1/#sync) no llevan datos. Además, una firma que caduca daría `401` a un reintento antes de llegar al almacén de idempotencia de [7.1](https://restep.wubytes.com/es/1/#idempotencia).
- **Una extensión `openapi`**: qué dice una descripción OpenAPI de una API Restep (una descripción por operación, los cuerpos de las peticiones, los errores como `problem+json`) y cómo comprueba un comprobador que concuerda con el documento de descubrimiento, que seguiría prevaleciendo. Aplazado hasta que las herramientas que traducen entre los dos muestren qué merece la pena exigir.
- **Acciones con consecuencias**: marcar las acciones cuyos efectos no se pueden deshacer o salen de la API (un cobro, un correo), para que el cliente pueda preguntar antes a una persona, como hacen `destructiveHint` de MCP y `x-openai-isConsequential`. Aplazado porque un solo indicador no distingue «borra datos» de «cobra a alguien», y un vocabulario necesita más casos.
- **Filtros con nombre dentro de `filter-expr`, y una búsqueda de texto propia de Restep**, que tendría que decir cómo se combina el orden por relevancia con `sort` y con los cursores. Aplazado porque esa combinación no está diseñada; hoy una búsqueda es un filtro con nombre de tipo `string` ([6.1](https://restep.wubytes.com/es/1/#filtros)).
- **Una proyección por idiomas** (`languages`, ya reservado), para que los clientes no tengan que recibir los mapas de idioma enteros. Aplazado porque los mapas son pequeños en los casos vistos hasta ahora.
- **Ordenar con reglas de idioma** (colación del CLDR): con puntos de código, `sort=name.es-es` pone «Ñora» detrás de «Zanahoria», y `"server"` ([6.1](https://restep.wubytes.com/es/1/#colaciones)) no deja que el cliente conozca el orden. Los valores de `collations` distintos de `"codepoint"` y `"server"` se reservan para colaciones nombradas con etiquetas Unicode (`-u-co-`, `-u-ks-`). Aplazado porque las bases de datos implementan esas etiquetas de forma desigual.
- **Filtros sobre campos que son listas y sobre rutas que pasan por relaciones a muchos**: si significan «algún elemento» o «todos los elementos», y un tipo lista para el descubrimiento. 6.1 reserva el caso, así que se puede añadir sin romper a nadie.
- **La dirección del texto** (`dir`, de [Strings on the Web](https://www.w3.org/TR/string-meta/) del W3C), que la etiqueta de idioma no basta para deducir. Iría en el objeto de cada campo de `language_maps`, sin cambiar nunca el tipo de los valores. Aplazado porque ninguna implementación lo ha necesitado todavía.
- **Declarar de antemano** qué operaciones exigen `Idempotency-Key` ([7.1](https://restep.wubytes.com/es/1/#idempotencia)) o `If-Match` ([7.2](https://restep.wubytes.com/es/1/#concurrencia)), en vez de enterarse por un `400` o un `428`. Aplazado porque el error ya le dice al cliente qué hacer, y exigir cualquiera de los dos es de todos modos un cambio incompatible ([5.5](https://restep.wubytes.com/es/1/#versiones)).
- **Heredar valores que no son escalares** ([11.6](https://restep.wubytes.com/es/1/#herencia)): un mapa de idioma traducción a traducción, o un objeto campo a campo. Aplazado hasta que haya experiencia con el propio `inherit`.
- **Horas locales en una zona horaria** ([**RFC 9557**](https://www.rfc-editor.org/rfc/rfc9557), `2026-03-30T10:00:00+02:00[Europe/Madrid]`), declaradas como `language_maps`. El [**RFC 9557**](https://www.rfc-editor.org/rfc/rfc9557) describe instantes fijos con información de zona; una hora local futura cuyo instante sigue los cambios de las reglas de su zona queda a cargo de la aplicación, y Restep tendría que decir cuál de las dos es un campo así. Aplazado por eso.
- **Borrado lógico**: qué responde un `GET` a un elemento borrado, cómo se ve la papelera, restaurar con el mismo `id` y purgar. Según [10](https://restep.wubytes.com/es/1/#sync), un elemento que vuelve a verse aparece como `created` o `updated`, según el intervalo. Aplazado porque restaurar un `id` choca con la regla de que los `id` no se reutilizan ([5.1](https://restep.wubytes.com/es/1/#id-del-cliente)).
- **Unidades de medida**: una unidad fija por campo, declarada en el descubrimiento con códigos [UCUM](https://ucum.org/) sin cambiar el tipo del valor, a diferencia de una unidad que varía por elemento, que va con su valor como un importe va con su moneda ([3](https://restep.wubytes.com/es/1/#datos)). Aplazado porque ninguna implementación lo ha necesitado todavía.
- **Orden manual**: mover un elemento entre otros sin reescribirlos todos (claves fraccionarias ordenadas por punto de código, o una acción `:move` con `before` y `after`). Aplazado porque los dos diseños funcionan y ninguno se ha probado en una API Restep.
- **Formularios con valores iniciales** que dependen del cliente o del momento (la fecha de hoy, la tienda del cliente, un valor heredado), que el descubrimiento, igual para todos los clientes, no puede llevar: una acción segura de colección como `GET /orders:new` que devuelve el cuerpo de un `POST` ya relleno, sin crear nada. La biblioteca `restep-server` la prueba como `new`; aplazado hasta que esa prueba fije su forma.
- **Valores a una fecha** (`$as_of`): separar cuándo rige un valor de cuándo se registró, y qué hace con los validadores, `state` y los cursores. Aplazado porque toca todos los perfiles.
- **Singletons bajo un elemento**, como `/stores/{store_id}/settings`, y relaciones, `include`, mapas de idioma y acciones en los singletons ([5.9](https://restep.wubytes.com/es/1/#singletons)). Aplazado porque necesitan una forma de declarar el padre de un singleton, que 4.2 solo tiene para las colecciones. Los clientes de la 1.0 ya ignoran un singleton con plantilla o con `parent`, así que pueden llegar en una versión menor.
- **Más tipos de retirada**: bajar `include_depth` o `batch.max_operations`, y quitar `sync` de una colección o `events` de la API ([5.5](https://restep.wubytes.com/es/1/#versiones)). Hoy cada uno necesita una versión mayor nueva. Aplazado porque ninguna API los ha necesitado; los clientes ignoran los avisos de un `kind` que no conocen ([4.2](https://restep.wubytes.com/es/1/#miembros-desconocidos)), así que los tipos nuevos pueden llegar en una versión menor.
- **Una versión por cada parte experimental**: servir una versión menor nueva de Restep conservando el texto de una anterior para `sync` o `batch`, para que un servidor no tenga que mover a la vez todas las partes experimentales y un cliente no tenga que actualizarse por una parte cuyo texto no cambió. Hoy la versión de `restep` decide el texto de todas las partes ([1.2](https://restep.wubytes.com/es/1/#experimental)). Aplazado porque necesita un miembro nuevo del descubrimiento y todavía no hay una segunda versión con la que probarlo.
- **Parámetros de las acciones `GET`** ([11.1](https://restep.wubytes.com/es/1/#actions)): cómo declara y recibe su entrada una acción segura que usa `GET`, que hoy no tiene cuerpo ni parámetros declarados. Aplazado hasta que una acción lo necesite.
- **Cuánto tiempo se guardan los `id` de los elementos borrados** ([5.1](https://restep.wubytes.com/es/1/#id-del-cliente)): hoy, mientras exista la colección. Un límite, como `sync.retention`, acotaría el coste, pero, olvidado un `id`, el servidor podría aceptarlo de nuevo para un elemento nuevo mientras la copia de un cliente, guardada durante más tiempo que ese límite, aún tiene el elemento antiguo con ese `id`. Aplazado porque cambia lo que `sync` puede prometer.

## Apéndice C. Cambios

Este apéndice no es normativo. Lista lo que resolvió cada borrador, del más reciente al más antiguo. Los apartados citados son los de este borrador.

### Borrador 6

**Incompatible con el borrador 5.** Lo que tiene que cambiar una API que seguía el borrador 5:

- Un `POST` a una colección, a una acción o a un lote, y un `QUERY`, con un cuerpo de otro tipo de medio, sin `Content-Type`, vacío sin `Content-Type` o con un `charset` distinto de UTF-8, da `415`, igual que un `PATCH` con otro tipo de medio; todo `2xx` con cuerpo JSON dice `application/json` ([3](https://restep.wubytes.com/es/1/#tipos-de-medio), [5.1](https://restep.wubytes.com/es/1/#recursos)).
- Los nombres que declara el descubrimiento y que llevan los parámetros, y toda `reason`, siguen una gramática, y no se puede declarar un campo cuyo nombre no la sigue ([3](https://restep.wubytes.com/es/1/#nombres), [5.4](https://restep.wubytes.com/es/1/#errores)). Dos `id` son el mismo solo si coinciden punto de código a punto de código, y un elemento responde solo en su propia ruta, comparada segmento a segmento después de decodificar los porcentajes ([3](https://restep.wubytes.com/es/1/#datos)). Los enlaces, en los cuerpos y en `Location` y `Link`, usan `https` o el esquema de la raíz de la API, y los miembros `_x_` no cambian entre dos lecturas de la misma versión de un elemento (3).
- El documento de descubrimiento es el mismo para todos los principales, igual como valor JSON, y `private` o `no-store` cuando solo se sirve con credenciales; un método, una acción o un singleton declarados que un principal no puede usar dan `403` o `404`, nunca `405` ni `unsupported_parameter` ([4.2](https://restep.wubytes.com/es/1/#cache-del-descubrimiento)).
- La plantilla de una subcolección usa variables con nombres distintos y declara `parent`, y una relación a uno de sus elementos lleva `href` ([3](https://restep.wubytes.com/es/1/#datos), [4.2](https://restep.wubytes.com/es/1/#subcolecciones), [9](https://restep.wubytes.com/es/1/#relations)).
- Un `POST` con `id` a una colección sin `id_from` lleva en su `422` una entrada `read_only` en `/id`; otro campo de solo lectura en un `POST` se ignora solo con el valor que recibiría el elemento, y se quita antes de validar contra un esquema `create` ([4.3](https://restep.wubytes.com/es/1/#describir)); un campo que este principal no puede cambiar da `403`, y uno que el estado del elemento no deja cambiar, `409`, los dos ordenados con `422` ([5.4](https://restep.wubytes.com/es/1/#orden-de-errores)); una relación a un elemento que no existe o que el principal no puede ver da `422` con `unknown`, salvo que se devuelva con su valor actual; un servidor que reutiliza el `id` de un elemento padre borrado no deja que su subcolección tome los `id` que tenía la antigua ([5.1](https://restep.wubytes.com/es/1/#id-del-cliente)).
- Una respuesta que depende de las credenciales lleva `private` o `no-store` en todo servidor, no solo con caché, también los `401` y `403` y los recursos fuera de Restep ([5.1](https://restep.wubytes.com/es/1/#respuestas-privadas)).
- Los parámetros se leen después de decodificar los porcentajes, sea cual sea el orden de los de nombre distinto, y un `+` en la query es un espacio dondequiera que la query se lea después de decodificar los porcentajes, también en `parameter` y en la comparación de [7.1](https://restep.wubytes.com/es/1/#idempotencia) ([5.2](https://restep.wubytes.com/es/1/#colecciones)).
- `count` con cualquier valor donde no está declarado, `fields` o `include` en una escritura, y una forma con corchetes que Restep no define dan `unsupported_parameter` ([5.3](https://restep.wubytes.com/es/1/#reservados), [6.3](https://restep.wubytes.com/es/1/#campos), [6.5](https://restep.wubytes.com/es/1/#recuento)). Una petición que pasa de un límite no declarado da `invalid_parameter`, nunca una parte de un resultado ([5.3](https://restep.wubytes.com/es/1/#limites)).
- Los errores no revelan lo que el principal no podría saber de otro modo ([5.4](https://restep.wubytes.com/es/1/#errores)).
- Todo aviso de retirada lleva un instante `announced` que no cambia, y los seis meses cuentan desde él; un aviso `count` dice con `value` si el recuento pasa a ser estimado o desaparece; las respuestas que llevan `Deprecation` se enumeran por `kind`; quitar el `sync` de una colección o los `events` de la API es un cambio incompatible ([5.5](https://restep.wubytes.com/es/1/#versiones)).
- `429` y `503` van solo a peticiones que no tuvieron efecto, nunca a una cuyo efecto el servidor no puede saber, también desde las propias pasarelas de la API ([5.7](https://restep.wubytes.com/es/1/#reintentos)).
- Un servidor que acepta cookies, autenticación HTTP o certificados de cliente rechaza con `403` una petición que no es segura, las lleva y viene de un origen que no permite ([5.8](https://restep.wubytes.com/es/1/#csrf)).
- La ruta de un singleton no es una que pudiera tener un elemento, y sus objetos de relación llevan `href` ([5.9](https://restep.wubytes.com/es/1/#singletons)).
- Los filtros y el orden tratan como ausente un campo que el principal no puede leer, y un filtro con nombre no selecciona por esos valores salvo que su descripción lo diga, ni, si recibe un valor, lo compara con ellos; ni un campo que es una lista, ni una ruta que pasa por una relación a muchos, ni una ruta al `id` del elemento de una subcolección se declaran en `filter` ni en `sort`; un filtro `boolean` declara solo `eq`, `ne` y `null`, y el filtro de `id`, ningún operador de orden; el valor de un filtro `datetime` nunca se redondea ([6.1](https://restep.wubytes.com/es/1/#filtros)).
- Una colección que acepta `limit` declara `max_limit`, y un cursor que se refiere a resultados calculados para un principal está ligado a él ([6.4](https://restep.wubytes.com/es/1/#paginacion)).
- La query cuenta para «la misma petición» de `Idempotency-Key`, que es una cadena de Structured Fields sin parámetros y se ignora en los métodos distintos de `POST`; un servidor que rechaza las claves sin credenciales declara `"anonymous": false` y responde `400`, no `401`, a un `POST` sin credenciales que lleva una, salvo una acción idempotente, que la ignora, y entonces no exige la clave a ninguna petición sin credenciales ([7.1](https://restep.wubytes.com/es/1/#idempotencia)). `If-Match` e `If-None-Match` se evalúan en un `POST` a una colección ([7.2](https://restep.wubytes.com/es/1/#precondiciones-post)).
- Con `writes`, toda respuesta cuyo cuerpo es un elemento lleva `_etag`, sea cual sea su codificación de contenido; una escritura a un elemento que se acaba de borrar da `404`, no `410`; una respuesta mínima lleva la `ETag` del elemento ([7.2](https://restep.wubytes.com/es/1/#miembro-etag), [7.3](https://restep.wubytes.com/es/1/#respuesta-minima)).
- `writes` ya no trae `Cache-Control` ni `304`: un servidor que los daba anuncia también [`cache`](https://restep.wubytes.com/es/1/#cache); los nombres de los grupos de caché no revelan elementos que el cliente no puede ver (8).
- Solo una colección que declara `sync`, con el perfil `sync`, responde a `:changes`; `events` es relativo a la raíz de la API, nombra una subcolección por su ruta relativa a la raíz de la API, y no manda nada cuando no cambia el `state` del principal ([10](https://restep.wubytes.com/es/1/#sync)).
- Acciones: un cuerpo vacío es `{}`; una acción no declarada da `404`; `_actions` lista solo acciones declaradas, con su método; una acción idempotente no rechaza una `Idempotency-Key` bien formada, y la ignora sin credenciales donde `anonymous` es `false` ([11.1](https://restep.wubytes.com/es/1/#actions)).
- Una operación de un lote tiene un `path` relativo a la raíz de la API, sin segmentos de punto, a un recurso de Restep distinto del flujo de eventos, en el que una referencia solo inserta un `id` válido o un entero, que se vuelve a comprobar después de insertarlo; lleva solo las cabeceras que lista 11.2, actúa con las credenciales del lote y no toma `Prefer`, `If-Match` ni `If-None-Match` de la petición del lote ([11.2](https://restep.wubytes.com/es/1/#batch)).
- Los valores heredados son la extensión `inherit`, que se lista en `extensions` ([11.6](https://restep.wubytes.com/es/1/#herencia)).
- Las URI de la versión, de los perfiles y de los tipos de error, y el `$id` de los JSON Schemas, pasan a `https://w3id.org/restep/1/`, que redirige al texto: el enlace de perfil es `Link: <https://w3id.org/restep/1/>; rel="profile"`, y el `type` de un error es `https://w3id.org/restep/1/errors#` seguido de su código ([4.1](https://restep.wubytes.com/es/1/#cabecera-perfil), [5.4](https://restep.wubytes.com/es/1/#errores)). Las URI `https://restep.wubytes.com/1/` ya no son identificadores, aunque el texto se sigue leyendo allí ([1.3](https://restep.wubytes.com/es/1/#proceso)).

Lo que tiene que cambiar un cliente que seguía el borrador 5:

- Manda `application/json` con los cuerpos de las peticiones ([3](https://restep.wubytes.com/es/1/#tipos-de-medio)), y un `+` literal de la query como `%2B` ([5.2](https://restep.wubytes.com/es/1/#colecciones)).
- No supone, para un borrador declarado como `"1.0-draft.6"`, las garantías de una versión publicada, no trata un documento de otra versión mayor como Restep 1 ni recurre con él a `core` ([1.1](https://restep.wubytes.com/es/1/#versiones-restep)), y usa una parte experimental solo con una versión cuyo texto de esa parte implementa ([1.2](https://restep.wubytes.com/es/1/#experimental)).
- Ignora los miembros y los valores del descubrimiento que no conoce, y lo que estos califican ([4.2](https://restep.wubytes.com/es/1/#miembros-desconocidos)), trata una `reason` desconocida como su `code` ([5.4](https://restep.wubytes.com/es/1/#errores)), ignora los singletons con plantilla o con `parent` ([5.9](https://restep.wubytes.com/es/1/#singletons)), no interpreta un `state` ([10](https://restep.wubytes.com/es/1/#sync)), y trata un `from` desconocido como `"hidden"` ([11.6](https://restep.wubytes.com/es/1/#herencia)).
- Manda las credenciales solo al origen de la API, no sigue enlaces con otros esquemas ([3](https://restep.wubytes.com/es/1/#datos)), y no hace ninguna petición que no sea segura solo porque se lo pida un texto de la API, que ahora son requisitos ([4.3](https://restep.wubytes.com/es/1/#los-textos-son-datos)).
- No manda `id` donde `id_from` tiene un valor que no conoce, y enlaza un elemento de una subcolección por `href` ([5.1](https://restep.wubytes.com/es/1/#recursos)).
- No supone ningún orden de los `id`, ni el orden por puntos de código donde `collations` dice `"server"` ([5.2](https://restep.wubytes.com/es/1/#colecciones), [6.1](https://restep.wubytes.com/es/1/#colaciones)).
- Espera `Cache-Control` y `304` en las lecturas por `cache`, no por `writes` ([8](https://restep.wubytes.com/es/1/#cache)), y un `400` a una `Idempotency-Key` enviada sin credenciales donde `idempotency` dice `"anonymous": false`, salvo de una acción idempotente, que la ignora ([7.1](https://restep.wubytes.com/es/1/#claves-anonimas)).
- En un lote, mantiene `$ref` fuera de los datos que no escribió ([11.2](https://restep.wubytes.com/es/1/#batch)).
- Reconoce el enlace de perfil y los tipos de error de Restep bajo `https://w3id.org/restep/1/`, no bajo `https://restep.wubytes.com/1/` ([4.1](https://restep.wubytes.com/es/1/#cabecera-perfil), [5.4](https://restep.wubytes.com/es/1/#errores)).

**Añadidos.** Un borrador o una candidata se declara con un sufijo en `restep` ([1.1](https://restep.wubytes.com/es/1/#versiones-restep)); los perfiles y las extensiones son estables o experimentales ([1.2](https://restep.wubytes.com/es/1/#dependencias)); una licencia, una regla sobre el uso del nombre y un proceso para los cambios ([1.3](https://restep.wubytes.com/es/1/#proceso)); qué separa un perfil, una extensión y una capacidad, y cuándo dos valores JSON son iguales ([2](https://restep.wubytes.com/es/1/#terminos)); cuánto tiempo guarda un cliente el documento de descubrimiento, y que este puede exigir credenciales ([4.2](https://restep.wubytes.com/es/1/#cache-del-descubrimiento)); los `id` elegidos por el cliente, con `id_from` y la entrada `taken` ([5.1](https://restep.wubytes.com/es/1/#id-del-cliente)); más tipos de retirada y una tabla de los cambios que no estaban clasificados ([5.5](https://restep.wubytes.com/es/1/#versiones)); qué se puede reintentar ([5.7](https://restep.wubytes.com/es/1/#reintentos)); los singletons, y los recursos fuera de Restep, que pueden ser un PDF ([5.9](https://restep.wubytes.com/es/1/#singletons)); `collations` ([6.1](https://restep.wubytes.com/es/1/#colaciones)); un `403` con `parameter` para un filtro sobre un campo que el principal no puede leer en ningún elemento ([6.1](https://restep.wubytes.com/es/1/#no-legibles)); esperar a una petición en curso en vez de dar `409`, y rechazar las claves de idempotencia anónimas, declarado en `idempotency.anonymous` ([7.1](https://restep.wubytes.com/es/1/#idempotencia)); el perfil `cache` ([8](https://restep.wubytes.com/es/1/#cache)); un límite de flujos de eventos ([10](https://restep.wubytes.com/es/1/#sync)); comprobaciones para todas las extensiones, marcadas donde a un comprobador hay que darle algo ([12.1](https://restep.wubytes.com/es/1/#conformidad-servidor)); la conformidad de los clientes ([12.2](https://restep.wubytes.com/es/1/#conformidad-cliente)); las consideraciones de seguridad y privacidad ([13](https://restep.wubytes.com/es/1/#seguridad)); las referencias normativas e informativas ([14](https://restep.wubytes.com/es/1/#referencias)); y estos apéndices. Se cerró el versionado por fecha en una cabecera: Restep 1 no lo ofrece ([5.5](https://restep.wubytes.com/es/1/#versiones)). Se relajó el orden de los errores: el `400` por el cuerpo, `415`, `406` y `413` ya no tienen orden entre sí, un `413` de un servidor puesto delante de la API queda fuera del orden, y las repeticiones van justo antes de `428`; el `403` por un campo que el principal no puede cambiar va con `422`, y el paso 1 conserva solo el `403` que no depende ni del cuerpo ni del elemento guardado ([5.4](https://restep.wubytes.com/es/1/#orden-de-errores)).

### Borrador 5

Un único enlace `rel="profile"` fijo por respuesta, a la URI de la versión, para que las cabeceras no crezcan con lo que anuncia el servidor ([4.1](https://restep.wubytes.com/es/1/#cabecera-perfil)); los miembros `_x_` para extensiones ajenas a Restep ([3](https://restep.wubytes.com/es/1/#datos)); un enlace a la documentación para personas (`service-doc`, [4.2](https://restep.wubytes.com/es/1/#descubrimiento)); y un catálogo de razones de dominio en el descubrimiento ([5.4](https://restep.wubytes.com/es/1/#errores)), solo en la raíz, en el que una razón tiene un único `code` y, una vez declarada, se queda hasta la siguiente versión mayor; que un campo de solo lectura devuelto con su valor actual se ignora, y un `PATCH` que no cambiaría ningún dato deja el elemento igual, `updated_at` y `ETag` incluidos ([5.1](https://restep.wubytes.com/es/1/#recursos)); que en `:changes` la visibilidad de un elemento elige su lista, así que uno creado y borrado dentro del intervalo sale en `destroyed` si el cliente lo pudo ver ([10](https://restep.wubytes.com/es/1/#sync)); los valores heredados, con un campo efectivo de solo lectura y uno propio que se escribe, para que devolver lo leído nunca fije un valor heredado ([11.6](https://restep.wubytes.com/es/1/#herencia)); y lo que un formulario saca de los esquemas, con un `default` vinculante en `create` ([4.3](https://restep.wubytes.com/es/1/#describir)); y los filtros con nombre, para los criterios que no comparan un campo, como los *scopes* de muchos ORM ([6.1](https://restep.wubytes.com/es/1/#filtros)). Y tres que salieron al hacer las herramientas: `_etag` en los elementos de una colección que el cliente puede escribir, obligatorio si la colección responde a `:changes` ([7.2](https://restep.wubytes.com/es/1/#concurrencia)); `409 request_in_progress` para la misma petición mientras la primera sigue en curso, que sustituye a `409 conflict` en ese caso, así que una API que seguía el borrador 4 cambia ese `code` ([7.1](https://restep.wubytes.com/es/1/#idempotencia)); y lo que necesita de CORS un cliente de navegador ([5.8](https://restep.wubytes.com/es/1/#navegadores)).

### Borrador 4

Cómo descubre el cliente la autorización, con la extensión [`oauth`](https://restep.wubytes.com/es/1/#oauth), sin códigos de error nuevos ni scopes en el descubrimiento; que una clave de idempotencia y un cursor son del principal, no del token ([7.1](https://restep.wubytes.com/es/1/#idempotencia), [6.4](https://restep.wubytes.com/es/1/#paginacion)); que `api-catalog` es opcional ([4.2](https://restep.wubytes.com/es/1/#descubrimiento)); lo que ayuda a los agentes y a otros clientes genéricos a usar una API sin probarla, como miembros opcionales del descubrimiento ([4.3](https://restep.wubytes.com/es/1/#describir)): los métodos de cada colección, descripciones breves y esquemas JSON Schema de los ítems y de los cuerpos de las peticiones; `parameter` en todo `invalid_parameter` ([5.3](https://restep.wubytes.com/es/1/#reservados)) y `detail` como recomendación ([5.4](https://restep.wubytes.com/es/1/#errores)); varios enlaces `service-desc` ([4.2](https://restep.wubytes.com/es/1/#descubrimiento)); el método de una acción, declarado ([11.1](https://restep.wubytes.com/es/1/#actions)), así que una acción `GET` de un borrador anterior ahora dice `"method": "GET"`; cómo encontrar el estado del servicio, sin ruta fija ([4.4](https://restep.wubytes.com/es/1/#salud)); y el idioma: los textos de la API siguen `Accept-Language` ([5.6](https://restep.wubytes.com/es/1/#idioma)), los datos nunca, y el texto traducido va en mapas de idioma con etiquetas en minúsculas, que se pueden filtrar y ordenar por etiqueta exacta ([3](https://restep.wubytes.com/es/1/#datos), [6.1](https://restep.wubytes.com/es/1/#filtros)).

### Borrador 3

El orden entre errores ([5.4](https://restep.wubytes.com/es/1/#errores)); la ruta de un elemento ([5.1](https://restep.wubytes.com/es/1/#recursos)); a qué está ligado un cursor ([6.4](https://restep.wubytes.com/es/1/#paginacion)); los filtros repetidos en cualquiera de sus formas, los rangos como dos filtros sobre un campo y `null` en los booleanos ([6.1](https://restep.wubytes.com/es/1/#filtros)); la invalidación con grupos de caché ([8](https://restep.wubytes.com/es/1/#almacenamiento-en-cache)); y cómo reanuda el cliente el flujo de eventos ([10](https://restep.wubytes.com/es/1/#sync)).

### Borrador 2

`filter[campo][op]` basta para `query`, y las expresiones siguen en `filter-expr`; no hace falta un tipo de medio propio, porque bastan `application/json`, `application/problem+json` y las URI de perfil; el descubrimiento declara tipos de campo solo donde Restep los necesita ([4.2](https://restep.wubytes.com/es/1/#descubrimiento)); y no hay política de caché por campo en Restep 1, porque cada combinación de `fields` ya es una URL distinta para una caché.
