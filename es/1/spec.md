> Generado a partir de https://restep.wubytes.com/es/1/. Manda la página HTML: si difieren, prevalece ella, y el texto inglés
> prevalece sobre el español (https://restep.wubytes.com/1/spec.md).

# Restep 1 · especificación

## 1. Estado y alcance

**Borrador 5**, 20 de noviembre de 2026 (borradores 4, 3 y 2: 19 de noviembre de 2026; borrador 1: 12 de noviembre de 2026). Puede cambiar sin aviso hasta que se publique la versión 1.0.

URI de esta versión: `https://restep.wubytes.com/1/`

Se publica en [inglés](https://restep.wubytes.com/1/) y en español. Si las dos versiones no coinciden, prevalece la inglesa, que es a la que llevan las URI de perfil y de error.

También en un solo archivo Markdown, para agentes y para comparar versiones: [`spec.md`](https://restep.wubytes.com/es/1/spec.md).

Restep es un perfil para APIs HTTP que intercambian JSON y se organizan en recursos: el nivel 2 del modelo de madurez de Richardson. Fija lo que ese nivel deja abierto (formato de colecciones y errores, consulta, escrituras seguras, relaciones y sincronización) y lo reparte en cinco **perfiles** que se adoptan de uno en uno, más unas **extensiones** opcionales.

Fuera del alcance quedan la autenticación y la autorización (se recomienda OAuth 2.0, con OpenID Connect si la API necesita la identidad del usuario; la extensión [`oauth`](https://restep.wubytes.com/es/1/#oauth) dice dónde pide el token el cliente), el diseño del dominio de cada API y el transporte por debajo de HTTP. Restep no exige esquema ni generador de código: un servidor `core` se puede escribir a mano.

### 1.1 Versiones de Restep

- Restep tiene versión mayor y menor. La mayor va en todas sus URI (`/1/`); el documento de descubrimiento declara la completa: `"restep": "1.0"`.
- Una versión menor solo añade: perfiles, extensiones, campos del descubrimiento o códigos de error para casos nuevos (nunca un código nuevo para un caso que ya tenía uno). Lo que cumple la 1.0 sigue cumpliendo la 1.1. Añadir códigos de error es seguro porque los clientes tratan los que no conocen por la clase del estado ([5.4](https://restep.wubytes.com/es/1/#errores)).
- Una versión menor NO DEBE reservar más nombres de parámetro que los de [5.3](https://restep.wubytes.com/es/1/#reservados), salvo los que empiezan por `$`, que quedan para versiones futuras de Restep.
- Un cambio incompatible será Restep 2, con URI nuevas (`/2/core`…). Las URI de `/1/` no se moverán nunca.
- Hasta que se publique la 1.0, los borradores sí pueden cambiar de forma incompatible.

### 1.2 Perfiles y dependencias

Cada perfil solo añade requisitos; ninguno cambia el tipo ni el significado de lo que define otro anterior, así que anunciar un perfil nuevo nunca rompe a un cliente que ya funcionaba. Algunos perfiles necesitan otros:

| Perfil o extensión | Requiere |
|---|---|
| `core` | Nada; toda API Restep lo implementa |
| `query`, `writes`, `relations` | `core` |
| `sync` | `core` y `query` (para pedir por `id` los elementos cambiados) |
| `actions`, `batch`, `oauth` | `core` |
| `filter-expr`, `query-method` | `query` |

Un servidor NO DEBE anunciar un perfil o una extensión sin los que requiere.

## 2. Términos

Las palabras DEBE, NO DEBE, DEBERÍA, NO DEBERÍA y PUEDE, y sus plurales, tienen el sentido de MUST, MUST NOT, SHOULD, SHOULD NOT y MAY en el [**RFC 2119**](https://www.rfc-editor.org/rfc/rfc2119) y el [**RFC 8174**](https://www.rfc-editor.org/rfc/rfc8174), solo cuando aparecen así, en mayúsculas. Todo requisito de esta especificación lleva una de ellas; las frases sin ellas explican o dan ejemplos.

- **Raíz de la API**: la URL base con la que se configura un cliente, por ejemplo `https://api.ejemplo.com/` o `https://ejemplo.com/api/`. Las rutas de esta especificación y de los miembros `path` del descubrimiento y de los lotes, como `/books`, son relativas a ella: bajo `https://ejemplo.com/api/`, `/books` es `https://ejemplo.com/api/books`. Los enlaces de cuerpos y cabeceras no: son referencias URI ([**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986)) que se resuelven contra la URL de la petición.
- **Colección**: un recurso que agrupa elementos del mismo tipo, como `/books`.
- **Elemento**: un recurso de una colección, como `/books/7`. En inglés, *item*; en el JSON el campo sigue siendo `items`.
- **Perfil**: un conjunto de requisitos con nombre (`core`, `query`…) y una URI propia.
- **Parámetro reservado**: un parámetro de consulta cuyo significado define Restep ([apartado 5.3](https://restep.wubytes.com/es/1/#reservados)).
- **Principal**: en nombre de quién actúa una petición, tal como lo autentica el servidor (en OAuth 2.0, el cliente y, si lo hay, el usuario). No es la credencial: una petición con un token renovado viene del mismo principal.
- **Capacidad**: algo que un recurso declara en el descubrimiento (un filtro, un operador, un campo de orden, una relación, una acción).

## 3. Datos

- Los cuerpos DEBEN ser JSON ([**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259)) en UTF-8. Las excepciones son las respuestas sin cuerpo (`204`, `304`, `HEAD`) y el flujo de eventos de [`sync`](https://restep.wubytes.com/es/1/#sync).
- Los nombres de los campos que define Restep van en `snake_case`. Los de cada API son cosa suya, pero DEBERÍAN seguir un único convenio.
- Los nombres de miembro que empiezan por `_` son de Restep (como `_actions` o `_etag`). Una API NO DEBE definir campos con ese prefijo.
- El identificador de un elemento se llama `id`. DEBE ser una cadena no vacía hecha solo de caracteres no reservados del [**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986) (`A–Z a–z 0–9 - . _ ~`), para que vaya en una ruta sin escapar nada, y NO DEBE ser `.` ni `..`, que la resolución de URI eliminaría. NO DEBE cambiar.
- Un campo cuyos valores puedan salirse de ±(2^53−1), o que necesite aritmética decimal exacta (los importes), DEBE ir como cadena en todas las representaciones, sea cual sea el valor: `"price": "18.50"`. Un importe DEBERÍA ir acompañado de su moneda ISO 4217.
- Los instantes DEBEN seguir el `date-time` del [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339), con desfase: `"2026-11-12T09:30:00Z"`. Las fechas de calendario DEBEN usar `full-date`: `"1987-03-14"`. Las duraciones DEBERÍAN ir en ISO 8601 (`"PT90S"`); un campo con segundos como número DEBERÍA acabar en `_seconds`.
- Ausente y `null` no son lo mismo. En una lectura, un campo sin valor PUEDE omitirse o ir a `null`, salvo un mapa de idioma, que es `{}`; en un `PATCH`, `null` borra y ausente no toca ([**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396)).
- Una **relación**, cuando una representación la incluye, DEBE ser un objeto con al menos `id` (a uno), una lista de esos objetos (a muchos), `null` (a uno, vacía) o `[]` (a muchos, vacía). Nunca un identificador suelto, para que el tipo del campo no cambie al incluir el elemento relacionado ([apartado 8](https://restep.wubytes.com/es/1/#relations)). Si una relación puede apuntar a más de una colección, cada objeto DEBE llevar también `type` con el nombre de la colección de destino.
- Los enlaces de los cuerpos (`next`, `href`) DEBEN ser URI absolutas o rutas absolutas, que empiezan por `/` e incluyen la ruta de la raíz de la API (`/api/books?cursor=…`), para que unos dos puntos dentro de un segmento (`/orders/2001:cancel`) nunca se lean como esquema, como pasaría en la referencia relativa `2001:cancel`.
- Los clientes DEBEN ignorar los campos que no conocen y tolerar valores de enumeración nuevos.
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

Toda respuesta de la API DEBERÍA llevar un enlace `rel="profile"` ([**RFC 6906**](https://www.rfc-editor.org/rfc/rfc6906)) por cada perfil y extensión que implementa. La URI de un perfil es la de la versión seguida de su nombre:

```
Link: <https://restep.wubytes.com/1/core>; rel="profile",
      <https://restep.wubytes.com/1/query>; rel="profile"
```

Los perfiles valen para toda la API. Qué admite cada colección lo dicen solo las declaraciones del documento de descubrimiento.

### 4.2 Documento de descubrimiento

Un `GET` a la raíz de la API devuelve un documento con los perfiles, las extensiones y las capacidades del servidor. Un servidor que solo tiene `core` DEBERÍA servirlo; uno que anuncia cualquier otro perfil o extensión, o que tiene mapas de idioma ([3](https://restep.wubytes.com/es/1/#datos)), DEBE servirlo. Si la raíz ya está ocupada, el servidor PUEDE servirlo en otra ruta y enlazarlo desde sus respuestas con `Link: <…>; rel="service-desc"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)). Una respuesta PUEDE llevar varios enlaces `service-desc`, por ejemplo uno a un documento OpenAPI; el que apunta al documento de descubrimiento DEBERÍA llevar `type="application/json"`, y el cliente DEBE quedarse con el primer destino que sea un documento de descubrimiento.

El cliente DEBE tratar una respuesta como documento de descubrimiento solo si es un objeto JSON con un miembro `restep` de tipo cadena. Si no lo hay, DEBE suponer solo `core`. Si la cabecera `Link` y el documento no coinciden, prevalece el documento.

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
      "sort": ["id", "price", "rating", "title"],
      "max_limit": 50,
      "count": "estimated",
      "relations": {
        "author":  { "to": "authors", "include": true },
        "reviews": { "to": "reviews", "many": true, "path": "/books/{id}/reviews" } },
      "include_depth": 2,
      "sync": { "retention": 604800 },
      "actions": { "reserve": { "on": "item", "safe": false, "idempotent": true,
        "description": "Aparta un ejemplar para el usuario durante 48 horas.", "input": "/schemas/reserve.json" } } },
    "reviews": { "path": "/books/{id}/reviews", "sort": ["id", "created_at"], "max_limit": 50 } } }
```

Una API DEBERÍA enlazar su documentación para personas con `Link: <…>; rel="service-doc"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)) en la respuesta que sirve su documento de descubrimiento o, si no sirve ninguno, en la respuesta a un `GET` a la raíz de la API, con la raíz de la API como `anchor` ([**RFC 8288**](https://www.rfc-editor.org/rfc/rfc8288)) si esa respuesta es un error. Una respuesta PUEDE llevar varios, y cada uno PUEDE indicar los idiomas de su destino con `hreflang`; el cliente elige entre ellos por `hreflang`, así que el servidor no necesita elegirlos por `Accept-Language`. Esa documentación explica lo que el descubrimiento no puede decir, como las reglas de negocio, los permisos que pide cada operación, los límites de uso y ejemplos. Si contradice al descubrimiento, prevalece el descubrimiento.

```
Link: <https://docs.example.com/api/>; rel="service-doc"; hreflang="es",
      <https://docs.example.com/en/api/>; rel="service-doc"; hreflang="en"
```

- Cada perfil añade sus campos al documento; se describen en su apartado. Los miembros de la raíz y de cada objeto de colección, `schemas`, filtro, relación, acción, retirada, mapa de idioma, razón y herencia son de Restep, para que una versión menor posterior pueda añadir alguno: un servidor PUEDE añadir los suyos, y sus nombres DEBEN empezar por `x-`. Esto no afecta a los nombres que la API da a sus colecciones, campos, relaciones, acciones y razones, que son claves de `collections`, `filter`, `relations`, `actions`, `language_maps`, `reasons` e `inherit`. El cliente ignora lo que no conoce.
- `language_maps`: los campos de una colección que son mapas de idioma ([3](https://restep.wubytes.com/es/1/#datos)), como objeto cuyas claves son los nombres de campo: `"language_maps": {"name": {}, "description": {}}`. DEBE declararlos todos; si falta, la colección no tiene ninguno. El objeto de cada campo queda para versiones menores.
- El `path` de una colección PUEDE ser una plantilla de URI ([**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570)); así se declaran las subcolecciones.
- Los tipos de campo, donde el descubrimiento los declara, salen de esta lista: `string`, `integer`, `number`, `decimal` (una cadena que cumple `-?[0-9]+(\.[0-9]+)?`), `boolean`, `date`, `datetime`, `duration` y `enum` (con sus `values`). El descubrimiento solo declara tipos donde Restep los necesita, como en los filtros; la forma de las representaciones y de los cuerpos de las peticiones va en los esquemas de [4.3](https://restep.wubytes.com/es/1/#describir). Una representación también PUEDE enlazar su esquema con `rel="describedby"`.
- Un origen que lista sus APIs en `/.well-known/api-catalog` ([**RFC 9727**](https://www.rfc-editor.org/rfc/rfc9727)) PUEDE incluir ahí una API Restep, con la raíz de la API como `anchor`, un enlace `service-desc` a su documento de descubrimiento y sus enlaces `service-doc`, si los hay.

### 4.3 Describir las operaciones

Miembros opcionales con los que un cliente, sea una persona que lee el documento o un agente que elige herramienta, sabe qué hace y qué acepta cada colección sin probarlo. El servidor PUEDE declarar cualquiera de ellos en cualquier colección; Restep no exige ninguno, así que un servidor `core` se sigue pudiendo escribir a mano.

- `methods` e `item_methods`: los métodos que admiten una colección y sus elementos, de entre `GET`, `POST`, `PATCH` y `DELETE` (`HEAD` va con `GET`; las acciones y `QUERY` se anuncian aparte). Si falta la lista, no se sabe; no significa que estén todos. Una lista declarada DEBE ser exacta: un método que no está da `405`, salvo que se aplique un error anterior en [5.4](https://restep.wubytes.com/es/1/#errores), uno de la lista nunca lo da, y la cabecera `Allow` de un `405` DEBE nombrar todos los métodos declarados y ningún otro de esos cuatro.
- `description`: una explicación breve, en texto plano, de una colección, un campo de filtro, una relación, una acción, un campo heredado ([5.7](https://restep.wubytes.com/es/1/#herencia)) o una razón ([5.4](https://restep.wubytes.com/es/1/#errores)). DEBERÍA ser una frase.
- `schemas`: esquemas JSON Schema ([2020-12](https://json-schema.org/draft/2020-12)) del `item` de una colección (su representación sin `fields` ni `include`), de `create` (el cuerpo de un `POST`) y de `update` (el cuerpo de un `PATCH`: un merge patch, donde lo ausente deja el campo como está y `null` lo borra). Cada uno es un objeto de esquema o un enlace a uno, absoluto como los enlaces en los cuerpos ([3](https://restep.wubytes.com/es/1/#datos)). Los esquemas pueden describir cada campo con su propio `description`.
- Antes de validar un cuerpo contra un esquema `create` o `update` declarado, el servidor quita los miembros que empiezan por `_`, que [5.1](https://restep.wubytes.com/es/1/#recursos) ignora, y, en un `PATCH`, todo campo cuyo valor actual ignora 5.1; un `PATCH` que se queda vacío así no se valida contra `update`. Un cuerpo que el esquema rechace entonces DEBE dar `422 invalid` (`400 bad_request` si no es un objeto JSON), salvo que se aplique un error anterior en 5.4, y su `errors` DEBERÍA señalar los miembros que fallan. Un esquema describe, no promete: un cuerpo que acepta puede fallar igualmente por las reglas propias de la API. `readOnly` es solo una anotación, salvo en lo que dice 5.1 de las propiedades de primer nivel de un esquema `item`, y `id` sigue 5.1 diga lo que diga el esquema.
- El `input` de una acción ([10.1](https://restep.wubytes.com/es/1/#actions)) es el esquema de su cuerpo, con el mismo sentido.
- El cliente manda sus credenciales de la API solo a enlaces del origen de la API. Un esquema o documento de otro origen se pide sin ellas.

Las descripciones, como cualquier otro valor que devuelve una API, son datos. Un agente que las mete en un prompt no obedece lo que digan.

### 4.4 Estado del servicio

El servidor PUEDE declarar en `status` un enlace, absoluto como los enlaces en los cuerpos ([3](https://restep.wubytes.com/es/1/#datos)), a un recurso que dice si la API puede atender peticiones, y PUEDE enlazarlo también desde sus respuestas con `rel="status"` ([**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631)). El cliente NO DEBE suponer una ruta como `/health`.

- Salvo que pida credenciales o las rechace (`401`, `403`) o limite el ritmo (`429`), un `GET` o un `HEAD` a ese recurso DEBE responder `200` cuando la API puede atender peticiones y `503` cuando no, con `Retry-After` si el servidor sabe cuánto tiempo, y siempre con `Cache-Control: no-store`.
- No es un recurso de la API: no se le aplican [4.1](https://restep.wubytes.com/es/1/#cabecera-perfil), de [5.1](https://restep.wubytes.com/es/1/#recursos) a [5.4](https://restep.wubytes.com/es/1/#errores) ni [7.3](https://restep.wubytes.com/es/1/#cache). Su cuerpo PUEDE seguir el Health Check Response Format ([draft-inadarei-api-health-check](https://datatracker.ietf.org/doc/draft-inadarei-api-health-check/)). Si se sirve sin credenciales, NO DEBERÍA decir más que si la API puede atender.

## 5. core (Obligatorio)

URI del perfil: `https://restep.wubytes.com/1/core`

### 5.1 Recursos y métodos

| Petición | Éxito | Qué hace |
|---|---|---|
| `GET /books` | `200` | Lista la colección ([5.2](https://restep.wubytes.com/es/1/#colecciones)) |
| `POST /books` | `201` con `Location` | Crea un elemento y devuelve su representación |
| `GET /books/7` | `200` | Devuelve el elemento, sin envoltorio |
| `PATCH /books/7` | `200` | Actualización parcial con JSON Merge Patch ([**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396)), salvo los objetos de relación (abajo) y los mapas de idioma ([3](https://restep.wubytes.com/es/1/#datos)); devuelve el elemento entero |
| `DELETE /books/7` | `204` | Borra el elemento. Repetirlo PUEDE dar `404` |

- Las respuestas DEBEN usar los estados de la tabla para esas operaciones, salvo cuando [7.4](https://restep.wubytes.com/es/1/#respuesta-minima) permite responder sin cuerpo.
- `PUT` queda fuera de Restep 1: un cliente que sustituye un elemento entero borraría los campos que se añadieron al elemento después de programarse ese cliente. El cliente DEBERÍA usar `PATCH`.
- `HEAD` DEBE funcionar allí donde funcione `GET` ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110)). `GET` y `HEAD` NO DEBEN tener efectos visibles para el cliente.
- Un método que el recurso no admite DEBE dar `405` con la cabecera `Allow`. `OPTIONS` queda fuera de Restep: el servidor PUEDE responderlo para CORS.
- `PATCH` DEBE aceptar `application/merge-patch+json` y DEBERÍA aceptar también `application/json` con el mismo significado. Un `415` a un `PATCH` DEBERÍA llevar `Accept-Patch` ([**RFC 5789**](https://www.rfc-editor.org/rfc/rfc5789)). Un parche que no es un objeto JSON DEBE dar `400 bad_request`.
- La ruta de un elemento DEBE ser la de su colección, con la plantilla de URI expandida ([**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570)), cuyas variables toman por orden los `id` de los elementos padre, y sin `/` final, seguida de `/` y el `id` del propio elemento: `/books/7`, `/books/7/reviews/3`.
- El servidor DEBE asignar el `id`, y DEBE dar `422 invalid` a un `POST` que trae un `id` o a un `PATCH` que trae uno distinto.
- En una escritura, el servidor DEBE ignorar los miembros cuyo nombre empieza por `_`, para que el cliente pueda devolver una representación que leyó.
- Un **campo de solo lectura** es uno que ningún cliente puede cambiar con un `PATCH`: `id`, un campo efectivo ([5.7](https://restep.wubytes.com/es/1/#herencia)), uno que solo pone el servidor (`created_at`, un total) o una propiedad de primer nivel que el esquema `item` marca con `"readOnly": true` directamente en sus `properties` ([4.3](https://restep.wubytes.com/es/1/#describir)); un servidor NO DEBE marcar así una propiedad que algún cliente o algún estado del elemento deja cambiar con un `PATCH`. Un valor de un `PATCH` es el **actual** cuando es el valor del campo tal como se leyó, o cuando aplicarlo como dice este apartado (una relación por su `id`, un mapa de idioma por clave) deja el campo como estaba antes del `PATCH`. Si un `PATCH` trae un campo de solo lectura con su valor actual, el servidor DEBE ignorarlo; con otro valor, DEBE responder `422 invalid` con una entrada `read_only` cuyo `pointer` es el campo, y NO DEBE aplicar nada de esa petición. Un campo que este cliente, o el estado actual del elemento, no le deja cambiar sigue la primera mitad de esa regla: su valor actual se DEBE ignorar, y otro valor recibe el error que la API dé a una escritura que no permite. En un campo que el cliente puede leer, el servidor compara después de validar un mapa de idioma como dice [3](https://restep.wubytes.com/es/1/#datos); en uno que no puede leer, no se aplican ni las reglas anteriores ni las comprobaciones de 3 que miran el valor guardado, y DEBE responder lo mismo sea cual sea el valor.
- Un `PATCH` válido que, dejando aparte los campos que ignora, no cambiaría ningún dato del elemento NO DEBE cambiarlo: su representación y su `ETag`, si la hay, siguen igual, y un campo como `updated_at` no se mueve. Así, los campos de solo lectura de una representación leída nunca hacen fallar un `PATCH` ni cambian nada, si el elemento no ha cambiado desde entonces.
- En una escritura, el objeto de una relación se sustituye entero, no se fusiona: el servidor DEBE leer solo su `id` (y `type`) y NO DEBE modificar a través de él el elemento relacionado. `{"author": {"id": "4"}}` enlaza otro autor; `{"author": null}` quita el enlace. Una lista a muchos se sustituye entera, como hace Merge Patch con cualquier lista.

### 5.2 Colecciones

Una colección DEBE responder con un objeto que tenga `items` (una lista) y `next`: la URL de la página siguiente o `null` si no hay más. `next` DEBE estar presente siempre, aunque el servidor no pagine todavía.

```
{ "items": [ { "id": "7", "title": "La niebla de Portugalete" } ],
  "next": null }
```

- El cliente DEBE seguir `next` tal cual, sin modificarla ni construirla, salvo los parámetros que [6.4](https://restep.wubytes.com/es/1/#paginacion) le deja cambiar entre páginas.
- Una colección DEBE tener un orden por defecto determinista. Sin escrituras concurrentes, seguir `next` hasta `null` DEBE devolver cada elemento exactamente una vez. Con escrituras concurrentes puede haber repetidos u omitidos; el cliente que necesite una copia exacta usa [`sync`](https://restep.wubytes.com/es/1/#sync).
- El servidor elige el tamaño de página. Sin el perfil `query`, el cliente no puede cambiarlo.
- El objeto PUEDE llevar otros campos definidos por los perfiles (`total`, `state`).

### 5.3 Parámetros reservados: fallar en voz alta

Estos nombres de parámetro, con y sin corchetes, son de Restep: `filter`, `sort`, `fields`, `include`, `count`, `limit`, `cursor`, `since` y `languages` (sin uso en Restep 1), más cualquier nombre que empiece por `$`.

> Salvo que aplique un error que va antes en [5.4](https://restep.wubytes.com/es/1/#errores), si una petición usa un parámetro reservado, o una forma de uno, que el recurso no implementa para ese método, el servidor DEBE responder `400` con el código `unsupported_parameter` y el nombre del parámetro tal como llegó, ya descodificado, en `parameter`. NO DEBE ignorarlo.

Es la regla que permite subir de peldaño sin romper a nadie: un cliente que filtra contra un servidor que no sabe filtrar recibe un error claro, en vez de la colección entera como si el filtro se hubiera aplicado. Los parámetros que no son reservados son de cada API, y Restep no dice nada sobre ellos.

Los dos códigos de parámetro le dicen al cliente si debe corregir la petición o renunciar a la capacidad:

- `unsupported_parameter` DEBE usarse cuando la petición pide algo que el recurso no ofrece: un parámetro reservado que no implementa, una forma que no admite (`filter=…` sin [`filter-expr`](https://restep.wubytes.com/es/1/#filter-expr), `sort[…]`), un campo u operador de filtro, un campo de orden o una relación que no están declarados, o `count` en una colección que no lo declara. Vale para todos los métodos: `POST /books?filter[x]=1` también lo da.
- `invalid_parameter` DEBE usarse cuando una capacidad admitida recibe un valor erróneo: un valor que no encaja con el tipo del campo, un `limit` fuera de rango, un campo de `fields` que no existe, una lista vacía, un parámetro repetido, un cursor no válido. Igual que `unsupported_parameter`, DEBE llevar en `parameter` el nombre del parámetro que falla, tal como llegó tras decodificar los porcentajes; si falta, su nombre; en el cuerpo de un `QUERY` ([10.4](https://restep.wubytes.com/es/1/#query-method)), el nombre del parámetro equivalente de un `GET`, como `filter[price][le]`, o el del propio miembro si no lo hay.

### 5.4 Errores

Toda respuesta `4xx` o `5xx` que genera la API DEBE ir en `application/problem+json` ([**RFC 9457**](https://www.rfc-editor.org/rfc/rfc9457)) si tiene cuerpo, con `type`, `title`, `status` (igual al de la respuesta) y `code`. DEBERÍA llevar `detail`, que diga, cuando se pueda, cómo arreglar la petición (los valores aceptados, el rango permitido), y PUEDE llevar `instance` y miembros propios. Un error NO DEBE enviarse como respuesta `200`; el único sitio donde va un error dentro de un `200` es el resultado de una operación de [`batch`](https://restep.wubytes.com/es/1/#batch).

```
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{ "type": "https://restep.wubytes.com/1/errors#invalid",
  "title": "Datos no válidos",
  "status": 422,
  "code": "invalid",
  "errors": [ { "pointer": "/price", "code": "required", "detail": "«price» es obligatorio." } ] }
```

- `code` DEBE salir de la tabla de abajo. Para un estado que la tabla no recoge, `code` DEBE ser la descripción de ese estado en el registro de códigos de estado HTTP de la IANA, en `snake_case` (`502` → `bad_gateway`, `431` → `request_header_fields_too_large`), o `http_` seguido del número si el estado no está registrado.
- `type` DEBERÍA ser `https://restep.wubytes.com/1/errors#` seguido del código, o una URI propia de la API que documente el caso. PUEDE ser `about:blank`.
- Para errores del dominio de la API (saldo insuficiente, sin existencias) la respuesta PUEDE añadir `reason`: una cadena en `snake_case` que define la API y que no cambia dentro de una versión. `code` sigue dando la clase (`conflict`, `invalid`), así que un cliente genérico sigue sabiendo qué hacer.
- La API PUEDE declarar sus razones en el descubrimiento, en `reasons` en la raíz: un objeto cuyas claves son los valores de `reason`; cada valor lleva el `code` con el que sale esa razón y PUEDE llevar una `description` ([4.3](https://restep.wubytes.com/es/1/#describir)): `"reasons": {"out_of_stock": {"code": "conflict", "description": "No quedan ejemplares que apartar."}}`. Si se declara, DEBE estar completo: un error NO DEBE llevar un `reason` que no figure en él, ni llevarlo con otro `code`. Esto vale para el `reason` de primer nivel de todo error, también los de los resultados de [`batch`](https://restep.wubytes.com/es/1/#batch), y no para los códigos propios de la API dentro de `errors`. Si falta `reasons`, no se sabe qué razones hay. El cliente trata un `reason` que no conoce según su `code`.
- Los errores de validación DEBERÍAN listar los problemas en `errors`. Cada entrada lleva un `pointer` (JSON Pointer, [**RFC 6901**](https://www.rfc-editor.org/rfc/rfc6901), al cuerpo de la petición; Restep usa la forma de cadena simple, no el fragmento de URI), o el nombre de un `parameter` o una `header`, más un `code`: `required`, `type`, `format`, `range`, `too_long`, `unknown`, `read_only` u otro propio de la API.
- Un `401` DEBE llevar `WWW-Authenticate` ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110)).
- El cliente DEBE tratar un `code` que no conoce según la clase del `status`.
- Si a una petición se le aplica más de uno de estos errores, el servidor DEBE dar el primero en este orden: `401`, `403`, `404`, `410`, `405`, `400`, `415`, `406`, `413`, `428`, `412`, `422`, `409`. Dentro del `400`, `unsupported_parameter` e `invalid_parameter` van antes que `bad_request`; los demás códigos que comparten estado no tienen orden. El orden también decide entre errores que exigen otros apartados ([4.3](https://restep.wubytes.com/es/1/#describir), 5.3, [9](https://restep.wubytes.com/es/1/#sync), [10](https://restep.wubytes.com/es/1/#extensiones)). Antes de dar un error, el servidor DEBE descartar los anteriores que pueda comprobar; no necesita analizar un cuerpo cuyo tipo de medio rechaza, ni pasar de su límite de tamaño, ni validar las operaciones de un lote que supera `max_operations`, para buscar otro. Si se evalúan o no las cabeceras condicionales lo dice el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.1) (apartado 13.2.1); cuando se evalúan, este orden manda sobre el momento en que las evalúa el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.2.2) (apartado 13.2.2), así que un cuerpo que no es JSON da `400` antes que una precondición fallida. El orden no dice nada de los estados que no lista, como `414`, `424`, `429` y los `5xx`. Si la API no revela si un recurso existe, ese caso es un `404`, no un `403`; un recurso retirado da `410`, no `404`, salvo que se oculte su existencia.

| `code` | Estado | Cuándo | Perfil |
|---|---|---|---|
| `bad_request` | 400 | El cuerpo no es JSON o no tiene la forma esperada; una cabecera mal formada | core |
| `invalid_parameter` | 400 | Un parámetro admitido con un valor erróneo ([5.3](https://restep.wubytes.com/es/1/#reservados)) | core |
| `unsupported_parameter` | 400 | El recurso no ofrece lo que pide el parámetro ([5.3](https://restep.wubytes.com/es/1/#reservados)) | core |
| `idempotency_key_required` | 400 | El recurso exige `Idempotency-Key` y no ha llegado | writes |
| `unauthenticated` | 401 | Faltan credenciales o no son válidas; va con `WWW-Authenticate` | core |
| `forbidden` | 403 | Credenciales válidas sin permiso para esto, cuando el cliente puede saber que el recurso existe | core |
| `not_found` | 404 | El recurso no existe, o no se quiere revelar que existe | core |
| `method_not_allowed` | 405 | El recurso no admite ese método; va con `Allow` | core |
| `not_acceptable` | 406 | El servidor no puede producir ningún tipo de los de `Accept` | core |
| `conflict` | 409 | Choca con el estado actual: un duplicado, una transición imposible, la misma petición que otra que aún se está procesando con la misma `Idempotency-Key` ([7.1](https://restep.wubytes.com/es/1/#idempotencia)) | core |
| `state_expired` | 410 | El servidor ya no puede calcular los cambios desde ese estado | sync |
| `retired` | 410 | Un recurso o una acción retirados tras su fecha de `Sunset` ([5.5](https://restep.wubytes.com/es/1/#versiones)) | core |
| `precondition_failed` | 412 | Falla una precondición (`If-Match`, `If-None-Match`): alguien cambió el recurso, o ya existe | writes |
| `content_too_large` | 413 | El cuerpo es demasiado grande, o un lote supera `max_operations` | core |
| `uri_too_long` | 414 | La URL es demasiado larga (ver [`query-method`](https://restep.wubytes.com/es/1/#query-method)) | core |
| `unsupported_media_type` | 415 | Tipo de contenido no admitido | core |
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

**Cambios compatibles.** El servidor PUEDE hacerlos en cualquier momento: añadir campos a una representación; añadir parámetros opcionales, colecciones, acciones o valores de enumeración; admitir filtros, órdenes o inclusiones nuevos; añadir perfiles o extensiones; declarar `reasons` o añadirle razones ([5.4](https://restep.wubytes.com/es/1/#errores)). Funcionan porque el cliente ignora lo que no conoce ([apartado 3](https://restep.wubytes.com/es/1/#datos)).

**Cambios incompatibles.** El servidor NO DEBE hacerlos dentro de una versión, salvo retirándolos (abajo):

- quitar o renombrar un campo, o cambiar su tipo o su significado;
- hacer obligatorio un campo de entrada, un parámetro o una cabecera que no lo era (también `If-Match` mediante `428`, e `Idempotency-Key`);
- endurecer la validación de forma que se rechace una petición que antes se aceptaba (también hacer de solo lectura un campo que se podía escribir), salvo para cerrar un fallo de seguridad;
- quitar un filtro, un orden, una relación, una acción, una colección, un perfil o un método declarados ([4.3](https://restep.wubytes.com/es/1/#describir));
- cambiar el formato de los `id`, las URL de los recursos o el orden por defecto de una colección;
- cambiar el estado o el `code` que se devuelve en un mismo caso;
- quitar `reasons` una vez declarado, quitarle una razón o cambiar el `code` de una razón.

**Retirar.** Dentro de una versión, un campo o una capacidad declarada solo puede desaparecer si se retira:

- Primero se anuncia. El descubrimiento DEBE listarlo en `deprecations`, en la raíz si es una versión o una colección y en la colección si es otra cosa: `{"kind": "field", "name": "rating", "sunset": "2027-07-01T00:00:00Z"}`, donde `kind` es `version`, `collection`, `field`, `filter`, `sort`, `relation`, `action`, `method` o `item_method` (con el método como `name`), y `sunset`, cuando haya fecha, es un instante [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339). Las respuestas que lo usan DEBEN llevar `Deprecation` ([**RFC 9745**](https://www.rfc-editor.org/rfc/rfc9745)) y un `Link` con `rel="deprecation"` a la explicación. Si lo que se retira es un recurso entero, una acción o una versión, sus respuestas DEBEN llevar además `Sunset` ([**RFC 8594**](https://www.rfc-editor.org/rfc/rfc8594), como fecha HTTP) cuando haya fecha.
- Entre el aviso y la retirada DEBERÍAN pasar al menos seis meses.
- Pasada la fecha, un recurso, una acción o una versión retirados DEBEN responder `410 retired`; un filtro, un orden o una relación retirados DEBEN dar `400 unsupported_parameter`, como cualquiera no declarado; un método retirado da `405`; un campo retirado simplemente deja de aparecer.

```
GET https://api.example.com/v1/books/7
→ 200
Deprecation: @1798761600
Sunset: Thu, 01 Jul 2027 00:00:00 GMT
Link: </v2/>; rel="successor-version",
      <https://docs.example.com/v2>; rel="deprecation"

GET https://api.example.com/v1/books/7   después del 1 de julio de 2027
→ 410 application/problem+json
{ "type": "https://restep.wubytes.com/1/errors#retired", "title": "Retirado", "status": 410, "code": "retired" }
```

**Una versión mayor nueva.** La exige un cambio incompatible que no pueda hacerse retirando:

- La versión DEBE ir en la ruta, como `v` seguida de un entero: `/v2/`. Cada versión es una raíz de API distinta con su propio documento de descubrimiento, que DEBE declararla como `"version": "2"`.
- La versión NO DEBE ir en cabeceras, parámetros ni tipos de medio: en la ruta se ve, se cachea y se enruta sin código. Esto deja fuera el versionado por fecha en una cabecera; ver las [preguntas abiertas](https://restep.wubytes.com/es/1/#abierto).
- Las dos versiones DEBEN enlazarse con `Link` ([**RFC 5829**](https://www.rfc-editor.org/rfc/rfc5829)), al menos en el documento de descubrimiento: `rel="successor-version"` desde la vieja y `rel="predecessor-version"` desde la nueva.

### 5.6 Idioma de los textos de la API

Los errores, el documento de descubrimiento y los esquemas que sirve la API PUEDEN depender de `Accept-Language` ([**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-12.5.4), apartado 12.5.4). Solo cambian sus textos para personas: en un error, `title` y `detail`, también los de cada entrada de `errors`; en el descubrimiento, `description`; en un esquema, también uno incrustado en `schemas`, las anotaciones `title` y `description` de JSON Schema. Los datos, nunca ([3](https://restep.wubytes.com/es/1/#datos)).

- El servidor elige el idioma con el *lookup* del [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647#section-3.4) (apartado 3.4) entre los idiomas en que puede dar esa respuesta, probando los rangos de `Accept-Language` de mayor a menor peso y, a igual peso, en el orden de la cabecera; sin distinguir mayúsculas, sin canonicalizar rangos ni etiquetas (`iw` no encuentra `he`) y sin quitar antes extensiones ni subetiquetas privadas. Ignora `*`, los rangos con `q=0` y los mal formados (también por un `q` mal formado). Si ninguno encaja, o no llega la cabecera, DEBE usar su idioma por defecto. NO DEBE responder `406` ni `400` por `Accept-Language`.
- Toda respuesta cuyos textos se eligen así (un error, el descubrimiento o un esquema), también en el idioma por defecto, DEBE llevar `Vary: Accept-Language`, y un `304` de estos, el mismo `Vary` que su `200`. Una respuesta con cuerpo DEBERÍA llevar `Content-Language`. Cada idioma es otra representación: una `ETag`, si la hay, DEBE ser distinta por idioma.
- El *lookup* recorta la etiqueta pedida y nunca prueba otras variantes del mismo idioma: con `es-es` y `es-mx` pero sin `es`, `Accept-Language: es-AR` recibe el idioma por defecto. Un servidor que ofrece variantes regionales de sus textos DEBERÍA ofrecer también el idioma sin región.
- Una repetición ([7.1](https://restep.wubytes.com/es/1/#idempotencia)) devuelve la respuesta guardada, en su idioma, porque `Accept-Language` no cuenta para «la misma petición».

### 5.7 Valores heredados

Un dato puede valer para un elemento sin estar guardado en él: el IVA de un producto es el suyo si lo tiene; si no, el de su categoría, el de la categoría padre o el de la tienda; y si nadie lo tiene, un valor por defecto. Restep lo expresa con **dos campos** y una declaración en el descubrimiento. Ninguna API tiene que usarlo; las reglas de este apartado valen solo para los campos que declara `inherit`.

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
  "relations": { "category": { "to": "categories" } },
  "inherit": {
    "tax_rate": { "own": "tax_rate_own", "from": ["category"], "default": true,
                  "description": "IVA del producto; si no tiene propio, el de su categoría." } } },
"categories": {
  "relations": { "parent": { "to": "categories" }, "store": { "to": "stores" } },
  "inherit": { "tax_rate": { "own": "tax_rate_own", "from": ["parent", "store"], "default": true } } }
```

- `own` nombra el campo propio. Los dos campos DEBEN ser de primer nivel y de uno de los tipos escalares de [4.2](https://restep.wubytes.com/es/1/#descubrimiento), y no pueden ser `id`, una relación ni un mapa de idioma: en esos, `null` o el merge patch ya significan otra cosa ([3](https://restep.wubytes.com/es/1/#datos), [5.1](https://restep.wubytes.com/es/1/#recursos)).
- `from` lista, en orden, las relaciones de las que hereda **este paso**. Cada una DEBE ser a uno y estar declarada en `relations` ([8](https://restep.wubytes.com/es/1/#relations)), aunque el servidor no anuncie ese perfil, y su colección de destino DEBE tener un campo con el mismo nombre que el efectivo. Si ese campo también se declara en su `inherit`, la cadena sigue: así una categoría hereda de su categoría padre con la profundidad que haga falta, sin rutas con punto.
- `"default": true` dice que al final de la cadena hay un valor por defecto y que el efectivo nunca queda vacío. El valor no se publica: cambiarlo es un cambio de datos, no del descubrimiento.
- `description` explica el campo como en [4.3](https://restep.wubytes.com/es/1/#describir).

**Resolución.** El efectivo DEBE ser el propio, si no es `null`; si no, el efectivo del elemento enlazado por la primera relación de `from` que tenga enlace; si no, el valor por defecto; y sin valor por defecto, el campo queda sin valor ([3](https://restep.wubytes.com/es/1/#datos)). Un enlace que crearía un ciclo (una categoría que acaba siendo su propia antecesora) DEBE dar `422 invalid`.

**Lectura.**

- Cuando la representación lleva el campo efectivo, DEBE llevarlo resuelto y con su tipo de siempre. El campo propio va con su valor o con `null`.
- El elemento PUEDE explicar el origen en `_inherited`: un objeto cuyas claves son los campos efectivos presentes en la representación que no salen del propio. Si lo lleva, DEBE nombrarlos todos, así que un campo efectivo que no está en `_inherited` tiene valor propio. Con `fields` ([6.3](https://restep.wubytes.com/es/1/#campos)), `_inherited` solo habla de los campos que van en la respuesta. Cada valor es uno de estos:
   - `{"from": {"href": "/categories/2"}}`: la ruta absoluta ([3](https://restep.wubytes.com/es/1/#datos)) de la **fuente real** del valor, no la del padre inmediato. En el ejemplo, la categoría 4 no tiene valor propio y la 2 sí.
   - `{"from": "default"}`: sale del valor por defecto.
   - `{"from": "hidden"}`: es heredado, pero el cliente no puede ver la fuente. El servidor NO DEBE dar la ruta de un elemento que el cliente no puede ver, igual que una relación se queda solo con `id` ([8](https://restep.wubytes.com/es/1/#relations)), ni la de uno cuya existencia no revela ([5.4](https://restep.wubytes.com/es/1/#errores)).

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
{ "type": "https://restep.wubytes.com/1/errors#invalid", "title": "Datos no válidos", "status": 422, "code": "invalid",
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
- con `sync`, cambia el `state` de su colección y `:changes` los lista ([9](https://restep.wubytes.com/es/1/#sync));
- con caché compartida, la escritura en la fuente DEBERÍA invalidar también los grupos de esos elementos y de las colecciones que pueden contenerlos ([7.3](https://restep.wubytes.com/es/1/#cache)).

Esto obliga al servidor a guardar los valores efectivos o a saber propagar cada cambio a todos los descendientes. Es el coste principal de declarar `inherit`.

**Filtros y orden.** Con `query`, filtrar y ordenar por el campo efectivo compara el valor que ve el cliente: `filter[tax_rate][eq]=10` da los que valen 10, hereden o no. Los que heredan se piden con `filter[tax_rate_own][null]=true`, sin operadores nuevos, si se declara ese filtro ([6.1](https://restep.wubytes.com/es/1/#filtros)).

**Evolución.** Añadir herencia a un dato nuevo, o a un campo que ya era de solo lectura, es compatible: se añaden el campo propio y la declaración. Convertir en efectivo un campo que hasta ahora se podía escribir no lo es, porque rechazaría escrituras que antes se aceptaban ([5.5](https://restep.wubytes.com/es/1/#versiones)): se hace en una versión mayor o retirando el campo y añadiendo la pareja con otros nombres.

## 6. query (Perfil)

URI del perfil: `https://restep.wubytes.com/1/query`. Se aplica a las colecciones; `fields` vale también para los elementos. Ningún parámetro necesita un analizador sintáctico: los lee cualquier framework HTTP.

### 6.1 Filtros

```
GET /books?filter[category]=novela-negra&filter[price][le]=20
```

- El documento de descubrimiento DEBE declarar en `filter` qué campos admiten filtro, con su tipo y sus operadores. Los campos de una relación usan una ruta con punto (`author.id`).
- `filter[campo]=valor` es el mismo filtro que `filter[campo][eq]=valor`. Los filtros sobre un mismo campo con operadores distintos son filtros distintos (`filter[price][ge]=10&filter[price][le]=20`). Varios filtros DEBEN combinarse con Y; para O, NO y paréntesis está la extensión [`filter-expr`](https://restep.wubytes.com/es/1/#filter-expr).
- Operadores: `eq`, `ne`, `lt`, `le`, `gt`, `ge`, `in` y `null`.
- `in` lleva valores separados por comas, que por tanto no pueden contener comas (para esos están `eq`, `filter-expr` o `query-method`). `null` lleva `true` (sin valor: ausente o `null`) o `false`.
- El servidor DEBE comparar según el tipo declarado: numéricamente para `integer`, `number` y `decimal` (los decimales de forma exacta, sin pasar por coma flotante), cronológicamente para `date` y `datetime` (como instantes), por su longitud para `duration` (un día cuenta como 24 horas; un valor de filtro con años o meses DEBE dar `invalid_parameter`, porque no tienen longitud fija), y por puntos de código Unicode para `string` y `enum`, distinguiendo mayúsculas y sin reglas de idioma. Un campo `boolean` solo puede declarar `eq`, `ne` y `null`. `null` puede declararse en un campo de cualquier tipo y comprueba si el valor falta o es `null`.
- Una traducción se filtra como `campo.etiqueta`, con un mapa de idioma de la colección y una clave en minúsculas: `filter[name.es-mx]=Calabacita`. El descubrimiento declara cada una por separado, de tipo `string`: `"name.es-mx": {"type": "string", "ops": ["eq", "in"]}`. Lee solo esa clave exacta, sin el emparejamiento del [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647) ni idioma de reserva: si el elemento no tiene la clave, el campo está ausente. El mapa de idioma entero y cualquier otra ruta que acabe en uno o lo atraviese (`author.name`, `author.name.es`) NO DEBEN declararse en `filter` ni en `sort`, y un mapa de idioma NO DEBE llamarse igual que una relación de su colección, para que `name.es-mx` nunca sea una ruta de relación.
- Los operadores, salvo `null`, NO DEBEN casar con elementos en los que el campo esté ausente o sea `null`.
- Un operando de `null` que no sea `true` o `false`, un operando de cualquier otro operador que no encaje con el tipo del campo (en `in`, cada elemento), una lista `in` vacía o el mismo filtro (mismo campo y operador, en cualquiera de las dos formas) dos veces DEBEN dar `invalid_parameter`. Un campo u operador no declarados, `unsupported_parameter` ([5.3](https://restep.wubytes.com/es/1/#reservados)).

### 6.2 Orden

`sort=-rating,title`: campos separados por comas, con `-` delante para orden descendente. Los campos ordenables se declaran en `sort`; cualquier otro DEBE dar `unsupported_parameter`. El servidor DEBE desempatar de forma estable (por ejemplo, por `id`). Los elementos sin valor en un campo de orden DEBEN ir al final, en los dos sentidos. Una traducción se ordena como su `campo.etiqueta` declarado ([6.1](https://restep.wubytes.com/es/1/#filtros)): `sort=name.es-mx`; las cadenas se ordenan por puntos de código, sin reglas de idioma.

### 6.3 Campos

Con `fields=title,price` la respuesta DEBE llevar solo esos campos, más `id` y los miembros que empiezan por `_`. Vale también en el `GET` de un elemento, donde, con `writes`, el elemento lleva además `_etag` ([7.2](https://restep.wubytes.com/es/1/#concurrencia)). Un campo que no existe DEBE dar `invalid_parameter`. Un mapa de idioma es un solo campo: `fields=name` lo da entero, y una ruta que entra en él (`name.es`; con [`relations`](https://restep.wubytes.com/es/1/#relations), también `author.name.es`) DEBE dar `invalid_parameter`.

### 6.4 Paginación

- `limit` fija el tamaño de página, entre 1 y el `max_limit` declarado. Fuera de ese rango el servidor DEBE dar `invalid_parameter`, no recortarlo en silencio.
- `next` DEBE llevar un parámetro `cursor` opaco y conservar sin cambios los demás parámetros. El cliente NO DEBE interpretar ni fabricar cursores.
- Un cursor está ligado a la colección, a los filtros y al orden para los que se emitió; con `QUERY`, a los miembros `filter` y `sort` del cuerpo ([10.4](https://restep.wubytes.com/es/1/#query-method)). Un cursor que el servidor no emitió (uno manipulado), uno caducado o uno usado con otra colección, otros filtros u otro orden DEBE dar `invalid_parameter` con `parameter: "cursor"`. Un cursor DEBERÍA estar ligado también al principal ([2](https://restep.wubytes.com/es/1/#terminos)) que lo recibió. Firmarlo es la forma más sencilla de reconocer uno manipulado.
- Un cursor NO DEBE estar ligado a `limit`, `fields`, `include` ni `count`: cambian lo que lleva cada página, no qué elementos recorre. Entre páginas, el cliente PUEDE añadirlos, cambiarlos o quitarlos en la URL de `next` de un `GET`, o en el cuerpo de un `QUERY`, y eso NO DEBE invalidar el cursor.
- El servidor PUEDE empezar con un desplazamiento dentro del cursor y pasar más tarde a paginación por clave sin que el cliente lo note. La garantía es la de [5.2](https://restep.wubytes.com/es/1/#colecciones): sin repetidos ni huecos si no hay escrituras concurrentes.

### 6.5 Recuento

El descubrimiento declara `count` como `"exact"` o `"estimated"`. Con `count=true`, la respuesta DEBE añadir `total` y, si el número es aproximado, `"total_estimated": true`. `count=false` equivale a no enviarlo. En una colección que no declara `count`, `count=true` DEBE dar `unsupported_parameter`.

## 7. writes (Perfil)

URI del perfil: `https://restep.wubytes.com/1/writes`. Escrituras que se pueden repetir sin miedo, y lecturas que se pueden cachear.

### 7.1 Repetir sin duplicar

```
POST /orders
Idempotency-Key: "8e03978e-40d5-43e8-bc93-6894a57f9324"
```

- Todo `POST` no idempotente, también las acciones declaradas `"idempotent": false`, DEBE aceptar la cabecera `Idempotency-Key`: una cadena de Structured Fields ([**RFC 9651**](https://www.rfc-editor.org/rfc/rfc9651)), como en el borrador del IETF. Una clave mal formada DEBE dar `400 bad_request`.
- Una clave es de un principal ([2](https://restep.wubytes.com/es/1/#terminos)), no de un token, y de un destino (método y ruta): un reintento con un token renovado la sigue encontrando. Dos peticiones son **la misma** cuando comparten clave, principal y destino y sus cuerpos son iguales como valores JSON (no cuentan el orden de los miembros ni los espacios).
- El servidor DEBE guardar cada clave al menos 24 horas desde la primera petición, y DEBERÍA declarar cuánto en el descubrimiento (`"idempotency": {"ttl": 86400}`, en segundos). Pasado ese plazo, la clave cuenta como nueva.
- Si vuelve a llegar la misma petición, el servidor DEBE devolver el mismo estado y el mismo cuerpo sin repetir el efecto, y DEBERÍA añadir `Idempotent-Replayed: true`. Cabeceras como `Date` pueden cambiar. Una repetición, y el `409 conflict` para la misma petición mientras la primera sigue en curso, se deciden después de todas las comprobaciones que [5.4](https://restep.wubytes.com/es/1/#errores) pone antes del `428`. Ninguno evalúa `If-Match`, `If-None-Match` ni la exigencia del `428`: una repetición devuelve la respuesta guardada aunque ya no se cumplan. Una petición distinta con la misma clave las evalúa como siempre, así que el `412` va antes que `422 idempotency_mismatch`.
- Si el servidor falla después del efecto y antes de guardar la respuesta, un reintento con la misma clave NO DEBE repetir el efecto: el servidor registra las dos cosas de forma atómica, o se recupera como si lo hubiera hecho.
- Una petición rechazada antes de ejecutarse (un `4xx` como `422`, o un `5xx` que no dejó efecto) PUEDE no guardarse; entonces no gasta la clave, y el cliente puede corregirla y reintentar con la misma. Una petición que tuvo efecto DEBE guardarse.
- La misma clave con otra petición DEBE dar `422 idempotency_mismatch`, también si la primera aún se está procesando; la misma petición mientras la primera aún se procesa da `409 conflict`. Un recurso que exige la clave DEBE dar `400 idempotency_key_required` si no llega.
- Un servidor que solo tiene `core` no conoce la cabecera y la ignora. El cliente NO DEBE contar con `Idempotency-Key` si el servidor no anuncia `writes`.

### 7.2 Concurrencia optimista

- Cada elemento tiene una **ETag de elemento** fuerte: la `ETag` de su representación completa, sin `fields` ni `include`. Un `GET` del elemento completo sin codificación de contenido DEBE llevarla, y el servidor NO DEBE usar para ella un validador débil (`W/`). Con codificación de contenido (gzip), la cabecera `ETag` PUEDE ser otra, como exige el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110), y entonces el elemento DEBE llevar la ETag de elemento en `_etag`.
- La respuesta de un elemento con `fields` o `include` es otra representación: su cabecera `ETag` DEBE cambiar cuando cambie cualquier cosa de ella, también los elementos incluidos, y el elemento DEBE llevar la ETag de elemento en `_etag`, para que el cliente pueda escribir sin volver a leer.
- Los elementos dentro de una colección PUEDEN llevar ese mismo valor en `_etag`, para que el cliente pueda escribir sin leer antes cada elemento.
- `PATCH` y `DELETE` DEBEN evaluar `If-Match` contra la ETag de elemento como dice el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) (listas, `*`, comparación fuerte): si no coincide, `412 precondition_failed`.
- Evaluar `If-Match` y aplicar la escritura DEBE ser atómico respecto a las demás escrituras sobre el mismo elemento.
- Un recurso PUEDE exigir `If-Match`; sin él DEBE responder `428 precondition_required`. Empezar a exigirlo es un cambio incompatible ([5.5](https://restep.wubytes.com/es/1/#versiones)).

### 7.3 Caché

- Toda respuesta a `GET` o `HEAD`, también las de error, DEBE llevar `Cache-Control` explícito.
- Una respuesta que depende de las credenciales DEBE ser `private` o `no-store`.
- `If-None-Match` DEBE evaluarse como dice el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110) (listas, `*`, comparación débil): si coincide, el servidor DEBE responder `304` a `GET`, `HEAD` y `QUERY`, y `412` a las escrituras sin aplicarlas. El `304` a `QUERY` es una regla de Restep: el [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.2) (apartado 13.1.2) solo nombra `GET` y `HEAD`, mientras que el [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008) hace que un `QUERY` elija la misma representación que el `GET` equivalente y responde con `304` a uno condicional en su ejemplo.
- Una respuesta correcta a un `GET` DEBERÍA llevar `Cache-Groups` ([**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875)) con cada elemento que representa, también los incluidos, y, si es una colección, la propia colección, para que una caché pueda descartar las listas en las que entra o de las que sale un elemento. Una respuesta `2xx` a un `HEAD` DEBERÍA llevar los grupos que llevaría el `GET`. Una respuesta correcta a una escritura que confirmó cambios (en un lote, la respuesta exterior, que abarca todas las operaciones confirmadas) DEBERÍA llevar `Cache-Group-Invalidation` con cada elemento que cambió y sus colecciones, aunque no tenga cuerpo. Los nombres de grupo son opacos y por origen; la ruta del elemento (`"/books/7"`) y la de la colección (`"/books"`) son la elección obvia. Una caché puede hacerles caso o no, y el [**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875) solo garantiza 32 grupos por campo, de 32 caracteres cada uno, así que en una página larga o con un `id` largo puede que no se invaliden todos los elementos. El grupo de la propia colección DEBERÍA ir primero.

### 7.4 Respuesta mínima

Con `Prefer: return=minimal` ([**RFC 7240**](https://www.rfc-editor.org/rfc/rfc7240)), las escrituras PUEDEN responder sin cuerpo: `201` con `Location` y `ETag`, o `204`, con `ETag` si el elemento sigue existiendo (no tras un `DELETE`). Cuando lo hacen, DEBERÍAN llevar `Preference-Applied: return=minimal`. Por defecto devuelven la representación.

## 8. relations (Perfil)

URI del perfil: `https://restep.wubytes.com/1/relations`. La forma de las relaciones la fija el [apartado 3](https://restep.wubytes.com/es/1/#datos) y cómo se escriben, el [5.1](https://restep.wubytes.com/es/1/#recursos), así que las sigue cualquier servidor; este perfil añade las declaraciones y la expansión.

- El descubrimiento DEBE declarar cada relación en `relations`, con su colección de destino en `to` (una lista, si puede apuntar a varias: ver el [apartado 3](https://restep.wubytes.com/es/1/#datos)), `"many": true` si es a muchos e `"include": true` si se puede expandir.
- `include=author` DEBE rellenar ese objeto con el elemento completo. Admite rutas con punto (`include=author.publisher`) hasta el `include_depth` declarado (1 si no se declara). Una relación no declarada o no expandible, o una ruta más profunda que `include_depth`, DEBE dar `unsupported_parameter`.
- Si el cliente no puede ver el elemento relacionado, el objeto DEBE quedarse solo con `id` (y `type`).
- Si el servidor implementa también `query`, `fields` admite rutas con punto (`fields=title,author.name`); una ruta con punto cuya relación no está en `include` DEBE dar `invalid_parameter`.
- Las relaciones con muchos elementos (las reseñas de un libro) DEBERÍAN ser **subcolecciones**, como `/books/7/reviews`, declaradas con una plantilla en `path` y que cumplen `core` y, si se anuncia, `query`. Una lista a muchos incrustada en una representación NO DEBE paginarse: si puede crecer sin límite, DEBERÍA ser una subcolección.
- Para filtrar por una relación, el descubrimiento declara la ruta con punto en `filter`: `filter[author.id]=3`.

```
GET /books/7
{ "id": "7", "title": "La niebla de Portugalete", "author": { "id": "3" } }

GET /books/7?include=author&fields=title,author.name
{ "id": "7", "title": "La niebla de Portugalete", "author": { "id": "3", "name": "Inés Arriaga" } }

PATCH /books/7                cambia el enlace, no al autor
{ "author": { "id": "4" } }
```

## 9. sync (Perfil)

URI del perfil: `https://restep.wubytes.com/1/sync`. Mantener al día una copia local de colecciones enteras sin volver a descargarlo todo. Requiere `query`: toda colección sincronizada DEBE declarar `id` en `filter` con `in`.

- Las respuestas de colección DEBEN llevar `state`: una cadena opaca que cambia cada vez que cambia algo de la colección que el cliente puede ver. Refleja lo que ve ese cliente: un elemento que deja de tener permiso para ver cuenta como borrado.
- Todas las páginas de un recorrido DEBEN llevar el `state` de la primera, la petición sin `cursor` (el servidor puede guardarlo en el cursor). El cliente DEBE usarlo como `since` en su siguiente sincronización: los cambios hechos durante el recorrido aparecerán ahí.
- Un recorrido NO DEBE perder elementos: todo elemento que existía cuando se sirvió la primera página, y que no aparece en `:changes` desde ese `state`, sale en alguna página. Los cursores por desplazamiento no lo garantizan; los cursores por clave o una instantánea sí.
- `GET /books:changes?since=<state>` devuelve los identificadores creados, modificados y borrados desde ese estado. La respuesta DEBE llevar `since`, `state`, `has_more`, `created`, `updated` y `destroyed`. Cada identificador DEBE aparecer como mucho en una lista, elegida según lo que el cliente podía ver entre `since` y el `state` devuelto (un elemento que no existe no se ve). Estas reglas cubren los elementos que cambiaron, o cuya visibilidad para el cliente cambió, en ese intervalo:
   - un elemento que podía ver en `since` y no ve en `state` DEBE estar en `destroyed`;
   - un elemento que ve en `state` DEBE estar en `updated` si lo podía ver en `since` y cambió o dejó de verse entre medias, y en `created` si no lo podía ver en `since`;
   - un elemento que no ve en ninguno de los dos extremos DEBE estar en `destroyed` si lo pudo ver entre medias, y NO DEBE aparecer en otro caso.
- Un elemento que veía en los dos extremos y no cambió PUEDE estar en `updated`. Si el servidor no puede reconstruir lo que el cliente veía en el intervalo, DEBE responder `410 state_expired`; que pueda o no NO DEBE depender de que exista un elemento cuya existencia se oculta al cliente ([5.4](https://restep.wubytes.com/es/1/#errores)). Los clientes tratan igual `created` y `updated`, pidiendo el elemento y sustituyendo su copia, e ignoran un `id` de `destroyed` que no tienen.
- Si `has_more` es `true`, el `state` devuelto es intermedio: el cliente DEBE repetir la llamada con él hasta que `has_more` sea `false` antes de dar su copia por actualizada.
- `:changes` abarca la colección entera: los filtros y los demás parámetros de `query` DEBEN dar ahí `unsupported_parameter`, y si falta `since` DEBE dar `invalid_parameter`. Sincronizar una vista filtrada queda fuera de esta versión.
- El cliente pide los elementos cambiados con `GET /books?filter[id][in]=7,12`.
- El servidor DEBERÍA guardar los cambios al menos 7 días y DEBERÍA declarar cuánto en `sync.retention` de la colección (en segundos). Si ya no puede calcular los cambios, DEBE responder `410 state_expired`, y el cliente vuelve a cargar la colección.
- El nombre de acción `changes` queda reservado para este perfil.
- El servidor PUEDE ofrecer avisos por Server-Sent Events en la ruta declarada en `events`; esa respuesta DEBE llevar `Cache-Control: no-store`. Cada aviso dice qué colecciones tienen un estado nuevo; los datos se piden con `:changes`.
- Los avisos son pistas: el cliente DEBE tolerar avisos repetidos, fusionados y desordenados. Al abrir el canal, y en cada reconexión, el cliente DEBE llamar a `:changes` en cada colección que guarda, desde el último estado que aplicó, y DEBE avanzar ese estado solo después de aplicar los cambios; un aviso por sí solo nunca lo avanza. El servidor NO DEBE depender de `Last-Event-ID` para reanudar.
- El servidor DEBERÍA mandar un comentario SSE al menos cada 30 segundos, para reducir los cortes por inactividad. DEBE cerrar el canal cuando dejen de valer las credenciales con las que se abrió, y DEBE responder `401` a toda reconexión con credenciales no válidas, también a la automática de `EventSource`. Después, la aplicación DEBE esperar a tener credenciales válidas antes de volver a abrir el canal.

```
GET /books:changes?since=s128
{ "since": "s128", "state": "s131", "has_more": false,
  "created": ["51"], "updated": ["7", "12"], "destroyed": ["34"] }

GET /events            Accept: text/event-stream
event: state
data: {"books": "s131"}
```

## 10. Extensiones

Cada extensión se anuncia en `extensions` y en la cabecera `Link`, y tiene su propia URI de perfil (`https://restep.wubytes.com/1/batch`…). Qué requiere cada una está en [1.2](https://restep.wubytes.com/es/1/#dependencias).

### 10.1 actions (Extensión)

Operaciones que no son crear, leer, actualizar ni borrar, al estilo de la [**AIP-136**](https://google.aip.dev/136): el nombre de la acción va tras dos puntos.

```
POST /orders/2001:cancel       sobre un elemento
POST /books:import             sobre la colección
GET  /orders/2001:preview      una acción segura declarada con "method": "GET"
```

- Cada acción DEBE declararse en `actions` de su colección, con `on` (`"item"` o `"collection"`), `safe` e `idempotent`. Los nombres de acción van en `snake_case`; `changes` está reservado para `sync`.
- Una acción usa `POST` salvo que su declaración diga `"method": "GET"`, cosa que solo PUEDEN hacer las acciones seguras. El servidor DEBE aceptar también los dos puntos codificados como `%3A`.
- La declaración PUEDE llevar `description` y, si la acción usa `POST`, un esquema `input` ([4.3](https://restep.wubytes.com/es/1/#describir)). Una acción `GET` no tiene cuerpo, así que NO DEBE declarar `input`.
- La respuesta DEBE ser la representación del recurso afectado (`200`), uno nuevo (`201` con `Location`) o nada (`204`).
- Una representación PUEDE listar en `_actions` las acciones disponibles en su estado actual, para que el cliente no duplique las reglas de negocio:

```
{ "id": "2001", "status": "paid",
  "_actions": { "cancel": { "method": "POST", "href": "/orders/2001:cancel" } } }
```

### 10.2 batch (Extensión)

Varias operaciones en una petición, en orden y con referencias a los resultados de las anteriores. Se envían a la ruta declarada en `batch.path`.

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

- Cada operación DEBE tener un `id`, único en el lote, un `method`, un `path` y, opcionalmente, `headers` (como `If-Match`, `Idempotency-Key` o `Prefer`, con los nombres en minúsculas) y `body`. Cada operación DEBE seguir las mismas reglas que si se enviara sola.
- Una referencia es `<id>#<JSON Pointer>` al cuerpo de la respuesta de una operación anterior: entre llaves dentro de `path`, donde el valor DEBE insertarse codificado como segmento de ruta ([**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986)), o como `{"$ref": …}` en lugar de un valor del cuerpo. Un objeto cuyo único miembro es `$ref` es siempre una referencia.
- Un cuerpo que no es un lote válido, un `id` de operación repetido, una referencia a una operación que no va antes o un lote anidado DEBEN dar `400 bad_request` antes de ejecutar ninguna operación. [5.4](https://restep.wubytes.com/es/1/#errores) se aplica al lote entero antes de ejecutar ninguna operación; una vez aceptado, se aplica a cada operación por separado, sin perjuicio de las reglas de `424 not_executed` que siguen. Más operaciones que `max_operations` dan `413 content_too_large`, que el servidor PUEDE dar sin validar las operaciones ([5.4](https://restep.wubytes.com/es/1/#errores)).
- Un lote que pasa estas comprobaciones, la del modo atómico de abajo y las de cualquier petición (credenciales, tipo de contenido, límites, [7.1](https://restep.wubytes.com/es/1/#idempotencia)) DEBE recibir `200` con un resultado por operación, en orden, cada uno con su `status`, sus `headers` y su `body`; un resultado de error es un objeto problem. Es la única excepción a «ningún error dentro de un `200`» ([5.4](https://restep.wubytes.com/es/1/#errores)).
- Con `"atomic": true`, o todas las operaciones tienen efecto o ninguna. Si una falla, lleva su error y todas las demás DEBEN recibir `424 not_executed`, también las que se ejecutaron y se deshicieron. Un servidor que no puede deshacer alguna de las operaciones (un pago externo, un correo) DEBE rechazar el lote atómico con `422 invalid` antes de ejecutarlo.
- Sin `atomic`, cada operación se aplica por su cuenta; una operación cuya referencia no se puede resolver, porque falló la referida o el puntero no encuentra nada, DEBE recibir `424 not_executed`.
- El lote en sí PUEDE llevar `Idempotency-Key`; entonces todo el lote sigue [7.1](https://restep.wubytes.com/es/1/#idempotencia).
- Una excepción a «las mismas reglas que si se enviara sola»: los textos de cada resultado nuevo ([5.6](https://restep.wubytes.com/es/1/#idioma)) siguen el `Accept-Language` del lote, y el de una operación se ignora; un resultado repetido (7.1) conserva el suyo. `Content-Language` y `Accept-Language` en `Vary` van en la respuesta del lote, no en los `headers` de cada resultado: `Vary` incluye `Accept-Language` solo si algún resultado nuevo puede variar por idioma, y `Content-Language` se omite salvo que todos los resultados con textos elegidos por idioma compartan uno.

### 10.3 filter-expr (Extensión)

Un filtro como expresión, en la línea de la [**AIP-160**](https://google.aip.dev/160):

```
GET /books?filter=price <= 20 AND (category = "novela-negra" OR rating >= 4.5)
```

- Comparadores `=`, `!=`, `<`, `<=`, `>` y `>=`, que equivalen a `eq`, `ne`, `lt`, `le`, `gt` y `ge`; `AND`, `OR`, `NOT` y paréntesis. Campos por nombre o ruta con punto; un segmento de ruta puede llevar `-` (`name.es-mx`). Valores: cadenas entre comillas dobles (con `\"` y `\\` como únicos escapes), números, `true`, `false` y `null`. `campo = null` y `campo != null` equivalen al operador `null`.
- `NOT` es lo que más liga. `AND` y `OR` NO DEBEN mezclarse en el mismo nivel sin paréntesis: `a AND b OR c` DEBE dar `invalid_parameter`. La [**AIP-160**](https://google.aip.dev/160) da a `OR` más precedencia que a `AND` y casi todos los lenguajes hacen lo contrario; Restep pide paréntesis para que nadie tenga que adivinar. La yuxtaposición (`a b`, el Y implícito de la [**AIP-160**](https://google.aip.dev/160)) también DEBE dar `invalid_parameter`.
- Un campo u operador no declarados en `filter` DEBEN dar `unsupported_parameter`. Las comparaciones siguen [6.1](https://restep.wubytes.com/es/1/#filtros), también con valores ausentes y `null`; un número comparado con un campo `decimal` se lee como decimal exacto.
- No se combina con `filter[…]` en la misma petición: eso DEBE dar `invalid_parameter`.

### 10.4 query-method (Extensión)

Para consultas que no caben en la URL, el método `QUERY` ([**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008)): seguro, idempotente y cacheable, con los parámetros de `query` en el cuerpo.

```
QUERY /books
Content-Type: application/json

{ "filter": { "price": { "le": "20" }, "category": { "in": ["novela-negra", "poesia"] } },
  "sort": ["-rating"], "fields": ["title", "price"], "limit": 10, "count": true }
```

- Las colecciones que lo aceptan DEBEN anunciarlo con `Accept-Query: application/json` ([**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008)) en sus respuestas a `GET` y `HEAD`.
- El cuerpo es un objeto JSON con los mismos miembros que los parámetros reservados: `filter` como objeto de campos y operadores (o, con `filter-expr`, una cadena), `sort`, `fields` e `include` como listas, `limit` como número y `count` como booleano. Los valores van con su tipo JSON, e `in` lleva una lista, así que sus valores sí pueden contener comas. Un miembro desconocido DEBE dar `unsupported_parameter`.
- Un `QUERY` DEBE devolver lo mismo que el `GET` equivalente, con los mismos errores; un `If-None-Match` que coincide da `304`, como en `GET` ([7.3](https://restep.wubytes.com/es/1/#cache)). La URL NO DEBE llevar más parámetros reservados que `cursor`.
- En la respuesta, `next` solo lleva `cursor`, que aquí manda sobre la regla de [6.4](https://restep.wubytes.com/es/1/#paginacion) que conserva los demás parámetros. Para la página siguiente, el cliente DEBE enviar a la URL de `next` un cuerpo con los mismos `filter` y `sort`, y PUEDE cambiar `limit`, `fields`, `include` y `count` ([6.4](https://restep.wubytes.com/es/1/#paginacion)); el servidor DEBE responder a un `filter` o un `sort` que no sea igual como valor JSON (no cuentan el orden de los miembros ni los espacios; un miembro ausente, `{}` y `[]` valen lo mismo) con `invalid_parameter` en `cursor`.
- Las cachés que guardan respuestas a `QUERY` usan el cuerpo como parte de la clave; muchas CDN aún no lo hacen.

### 10.5 oauth (Extensión)

Cómo averigua un cliente dónde conseguir un token para la API. No define ni la autenticación ni la autorización: ata a la raíz de la API los metadatos de recurso protegido de OAuth 2.0 ([**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728)). Un servidor que no la anuncia autentica como le parezca.

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
- Un servidor que admite peticiones de otros orígenes DEBERÍA incluir `WWW-Authenticate` en `Access-Control-Expose-Headers` (y `DPoP-Nonce`, si usa nonces DPoP), porque si no un cliente de navegador no puede leerlas, y DEBERÍA servir los metadatos con `Access-Control-Allow-Origin`. `EventSource` no puede enviar `Authorization`, así que un cliente de navegador lee el canal de avisos de [9](https://restep.wubytes.com/es/1/#sync) con `fetch`; el servidor NO DEBERÍA aceptar tokens en la query ([**RFC 6750**](https://www.rfc-editor.org/rfc/rfc6750#section-2.3), apartado 2.3).

## 11. Conformidad

Un servidor cumple un perfil cuando cumple todos los requisitos dirigidos al servidor marcados con DEBE o NO DEBE de los apartados 3, 4 y 5 y del apartado de ese perfil, y anuncia los perfiles que este requiere. Lo mismo vale para cada extensión. Estas son las comprobaciones que hace un comprobador de conformidad. [`restep-check`](https://restep.wubytes.com/es/herramientas/) ya hace las de core, evolución (el `Deprecation` y la retirada de lo que lista el descubrimiento, y el enlace `predecessor-version`; no la comparación de dos despliegues), query, writes y oauth (las de oauth, sin credenciales sobre la raíz y cada colección, y salvo el reto `insufficient_scope`, que necesita un token al que le falte algún scope), y la lista completa de las suyas está en su página; relations y sync llegarán en una versión posterior.

### core

- Toda colección responde con `{items, next}`, con `next` presente.
- Sin escrituras concurrentes, seguir `next` hasta `null` devuelve cada elemento exactamente una vez.
- Un elemento que no existe da `404` en `problem+json` con `code: "not_found"`.
- Todo parámetro reservado no implementado da `400 unsupported_parameter`, en todos los métodos, salvo que aplique un error que va antes en 5.4: con credenciales válidas y sin otro fallo, un elemento que no existe con un parámetro no admitido da `404 not_found`.
- Un método no admitido da `405` con `Allow`; `HEAD` funciona donde funciona `GET`. Si el descubrimiento declara `methods` o `item_methods`, ese `Allow` coincide con ellos.
- Si el descubrimiento declara `status`, `GET` y `HEAD` a ese recurso dan `200` o `503` con `Cache-Control: no-store`, o si no `401`, `403` o `429`.
- Todo `invalid_parameter` y todo `unsupported_parameter` nombran su parámetro en `parameter`.
- Si el descubrimiento declara un esquema `create`, un `POST` sin una propiedad que exige da `422`; si declara un esquema `update` cerrado, también un `PATCH` con un miembro que el esquema no admite, aunque valga `null`, después de quitar los miembros que 5.1 ignora.
- Todo error lleva `type`, `title`, un `status` igual al de la respuesta y un `code` de la lista o derivado del registro de la IANA.
- Si el descubrimiento declara `reasons`, todo error con `reason`, también en los resultados de `batch`, lleva una declarada y con su `code`.
- Un `PATCH` con `{"author": {"id": "4", "extra": 1}}` cambia el enlace, no guarda `extra` y no toca a ninguno de los dos autores, salvo que lo rechace un esquema `update` declarado.
- Merge Patch sigue el [**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396) (una lista o un escalar sustituidos por un objeto pierden su contenido anterior), salvo que los objetos de relación se sustituyen enteros (5.1) y los mapas de idioma que quedan sin traducciones se leen como `{}` (3) y que borrar o cambiar un campo propio de `inherit` cambia también su campo efectivo (5.7), y una escritura que cambia el `id` da `422`.
- Un `PATCH` con los campos de solo lectura de un elemento tal como se leyeron no cambia su cuerpo ni su `ETag`, si la hay; otro valor en `id`, o en una propiedad de primer nivel que el cliente puede leer y que su esquema `item` marca `readOnly` directamente en `properties`, da `422 invalid` con una entrada `read_only` en su puntero, sin cambiar nada.
- Si el descubrimiento declara `inherit` en una colección donde se admite `PATCH`: devolver con `PATCH` solo los campos efectivos de un elemento tal como se leyeron, sin sus campos propios, no cambia su cuerpo ni su `ETag`; `{"tax_rate_own": null}` deja el efectivo igual al de su fuente y, si hay `_inherited`, este lo nombra; y un valor distinto en el campo efectivo da `422 invalid` con una entrada `read_only` en `/tax_rate`, sin cambiar nada.
- Un error pedido con un `Accept-Language` que el servidor no ofrece, o mal formado, da el mismo `code` que sin cabecera, nunca `406` ni `400` por ella. Si el cuerpo del descubrimiento o de un error cambia entre dos `Accept-Language`, las dos respuestas, también la del idioma por defecto, llevan `Vary: Accept-Language` y, si llevan `ETag`, distinta.
- Con `Accept-Encoding: identity`, el `GET` de un elemento da el mismo cuerpo con cualquier `Accept-Language` (y, con `writes`, la misma `ETag`).
- En un elemento, cada campo de `language_maps` es un objeto de cadenas con claves en minúsculas. Donde se admite `PATCH`: una clave en mayúsculas da `422 invalid` con una entrada `format` en `/name/ES`; borrar con `null` una traducción existente conserva las demás, y volver a ponerla la restaura; `{"name": null}` deja `{}`.

### Evolución

- Lo que el descubrimiento lista en `deprecations` lleva `Deprecation` en las respuestas que lo usan; pasada su fecha de `sunset` responde como dice [5.5](https://restep.wubytes.com/es/1/#versiones).
- Comparando los documentos de descubrimiento de dos despliegues de la misma versión, no desaparece nada declarado salvo lo listado en `deprecations` cuyo `sunset` ya pasó.

### query

- Cada filtro declarado devuelve solo los elementos que lo cumplen, comparando según el tipo declarado (los decimales, de forma exacta).
- Un campo de filtro, un operador o un campo de orden no declarados dan `unsupported_parameter`; un valor del tipo equivocado, `invalid_parameter`.
- `sort` ordena y desempata de forma estable entre páginas.
- `limit` por encima de `max_limit` da `invalid_parameter`; también un cursor manipulado o reutilizado con otros filtros, otro orden u otra colección; cambiar `limit`, `fields`, `include` o `count` entre páginas lo mantiene válido.
- Ni un campo de `language_maps` ni una ruta que acabe en uno o lo atraviese se declaran en `filter` ni en `sort`; un filtro u orden `campo.etiqueta` declarado lee solo esa clave, y los elementos que no la tienen cuentan como ausentes.
- `fields` devuelve solo esos campos, más `id` y los miembros que empiezan por `_`.
- `count=true` añade `total` si `count` está declarado, y da `unsupported_parameter` si no.

### writes

- Repetir un `POST` con la misma `Idempotency-Key` una vez terminada la primera devuelve la misma respuesta y no crea nada nuevo.
- La misma clave con otro cuerpo da `422 idempotency_mismatch`.
- La `ETag` de un elemento completo, pedido con `Accept-Encoding: identity`, es fuerte, y una respuesta con `fields` la lleva en `_etag`; una escritura ignora los miembros `_`.
- `If-Match` con una `ETag` antigua da `412`, también cuando dos escrituras compiten; una lista que contiene la vigente funciona. `If-None-Match` con la vigente, débil o fuerte, da `304` a un `GET` y `412` a una escritura.
- Todas las respuestas a `GET` o `HEAD`, también las de error, llevan `Cache-Control`.

### oauth

- Los metadatos están en la URL que el [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728) forma a partir de la raíz, como JSON, sin pedir credenciales, con `resource` igual a la raíz y al menos un servidor de autorización.
- Los metadatos no dan `401` (y, como recomendación, llevan `Cache-Control: public`).
- Si la raíz pide credenciales, su `401` lleva esa URL absoluta en `resource_metadata`; ningún `401` de otro recurso apunta ahí.
- Un token sin el scope que necesita una petición recibe, salvo que se oculte la existencia del recurso, `403` con `code: "forbidden"` y `error="insufficient_scope"` en el reto.

### relations y sync

- Las relaciones son objetos con `id`, también sin `include`, y todas están declaradas.
- `include` de una relación declarada y expandible rellena el objeto; de cualquier otra, `unsupported_parameter`.
- `:changes` recoge, en las listas que pide [9](https://restep.wubytes.com/es/1/#sync), la creación, el cambio y el borrado de un elemento desde el `state` anterior, y todas las páginas de un recorrido llevan el mismo `state`; borrar un elemento a mitad de recorrido no hace que se pierda otro.

## 12. Preguntas abiertas

- ¿Debería la caché ([7.3](https://restep.wubytes.com/es/1/#cache)) ser un perfil propio, para que un servidor pueda ofrecerla sin montar el almacén de claves de 7.1?
- Operaciones largas: `202 Accepted` y un recurso de operación (como en la [**AIP-151**](https://google.aip.dev/151)), para que cada API no se invente el suyo.
- El versionado por fecha en una cabecera (como hace Stripe) como alternativa a la versión en la ruta.
- ¿Deberían las URI de perfil y de error pasar a un identificador persistente (como w3id.org) antes de la 1.0, ahora que aún pueden cambiar?
- Sincronizar vistas filtradas (como el `queryChanges` de JMAP).
- Lo que puede llegar más tarde como añadido, sin romper a nadie: vistas con nombre (`$view`), un enlace `prev` para paginar hacia atrás, resultados de un lote a medida que terminan y reutilizar un `QUERY` con el `Location` que ya define el [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008).
- Mensajes firmados ([**RFC 9421**](https://www.rfc-editor.org/rfc/rfc9421), con `Content-Digest` del [**RFC 9530**](https://www.rfc-editor.org/rfc/rfc9530) y las claves publicadas como JWKS, [**RFC 7517**](https://www.rfc-editor.org/rfc/rfc7517)) para la integridad entre empresas a través de intermediarios. Restep 1 no tiene ningún caso que los necesite: TLS cubre al cliente y al servidor, y los avisos de [9](https://restep.wubytes.com/es/1/#sync) no llevan datos. Además, una firma que caduca daría `401` a un reintento antes de llegar al almacén de idempotencia de [7.1](https://restep.wubytes.com/es/1/#idempotencia).
- Una extensión `openapi`: qué debe decir una descripción OpenAPI de una API Restep (una descripción por operación, los cuerpos de las peticiones, los errores como `problem+json`) y cómo comprobaría un comprobador que concuerda con el documento de descubrimiento, que seguiría prevaleciendo.
- Marcar las acciones cuyos efectos no se pueden deshacer o salen de la API (un cobro, un correo), para que el cliente pueda preguntar antes a una persona, como hacen `destructiveHint` de MCP y `x-openai-isConsequential`. Un solo indicador no distingue «borra datos» de «cobra a alguien».
- Una proyección por idiomas (`languages`, ya reservado) para no recibir los mapas de idioma enteros.
- Ordenar con reglas de idioma (colación del CLDR): hoy `sort=name.es-es` pone «Ñora» detrás de «Zanahoria».
- La dirección del texto (`dir`, de [Strings on the Web](https://www.w3.org/TR/string-meta/) del W3C), que la etiqueta de idioma no basta para deducir. Iría en el objeto de cada campo de `language_maps`, sin cambiar nunca el tipo de los valores.
- Declarar de antemano qué operaciones exigen `Idempotency-Key` ([7.1](https://restep.wubytes.com/es/1/#idempotencia)) o `If-Match` ([7.2](https://restep.wubytes.com/es/1/#concurrencia)), en vez de enterarse por un `400` o un `428`.
- Heredar valores que no son escalares ([5.7](https://restep.wubytes.com/es/1/#herencia)): un mapa de idioma traducción a traducción, o un objeto campo a campo.
- Horas locales en una zona horaria ([**RFC 9557**](https://www.rfc-editor.org/rfc/rfc9557), `2026-03-30T10:00:00+02:00[Europe/Madrid]`), declaradas como `language_maps`. El [**RFC 9557**](https://www.rfc-editor.org/rfc/rfc9557) describe instantes fijos con información de zona; una hora local futura cuyo instante sigue los cambios de las reglas de su zona queda a cargo de la aplicación, y Restep tendría que decir cuál de las dos es un campo así.
- Borrado lógico: qué responde un `GET` a un elemento borrado, cómo se ve la papelera, restaurar con el mismo `id` y purgar. Según [9](https://restep.wubytes.com/es/1/#sync), un elemento que vuelve a verse aparece como `created` o `updated`, según el intervalo.
- Unidades de medida: una unidad fija por campo, declarada en el descubrimiento con códigos [UCUM](https://ucum.org/) sin cambiar el tipo del valor, a diferencia de una unidad que varía por elemento, que va con su valor como un importe va con su moneda ([3](https://restep.wubytes.com/es/1/#datos)).
- Orden manual: mover un elemento entre otros sin reescribirlos todos (claves fraccionarias ordenadas por punto de código, o una acción `:move` con `before` y `after`).
- Valores a una fecha (`$as_of`): separar cuándo rige un valor de cuándo se registró, y qué hace con los validadores, `state` y los cursores.

Resuelto en el borrador 5: un enlace a la documentación para personas (`service-doc`, [4.2](https://restep.wubytes.com/es/1/#descubrimiento)); y un catálogo de razones de dominio en el descubrimiento ([5.4](https://restep.wubytes.com/es/1/#errores)), solo en la raíz, en el que una razón tiene un único `code` y, una vez declarada, se queda hasta la siguiente versión mayor; que un campo de solo lectura devuelto con su valor actual se ignora, y un `PATCH` que no cambiaría ningún dato deja el elemento igual, `updated_at` y `ETag` incluidos ([5.1](https://restep.wubytes.com/es/1/#recursos)); y que en `:changes` la visibilidad de un elemento elige su lista, así que uno creado y borrado dentro del intervalo sale en `destroyed` si el cliente lo pudo ver ([9](https://restep.wubytes.com/es/1/#sync)).

Resuelto en el borrador 4: cómo descubre el cliente la autorización, con la extensión [`oauth`](https://restep.wubytes.com/es/1/#oauth), sin códigos de error nuevos ni scopes en el descubrimiento; que una clave de idempotencia y un cursor son del principal, no del token ([7.1](https://restep.wubytes.com/es/1/#idempotencia), [6.4](https://restep.wubytes.com/es/1/#paginacion)); que `api-catalog` es opcional ([4.2](https://restep.wubytes.com/es/1/#descubrimiento)); lo que ayuda a los agentes y a otros clientes genéricos a usar una API sin probarla, como miembros opcionales del descubrimiento ([4.3](https://restep.wubytes.com/es/1/#describir)): los métodos de cada colección, descripciones breves y esquemas JSON Schema de los ítems y de los cuerpos de las peticiones; `parameter` en todo `invalid_parameter` ([5.3](https://restep.wubytes.com/es/1/#reservados)) y `detail` como recomendación ([5.4](https://restep.wubytes.com/es/1/#errores)); varios enlaces `service-desc` ([4.2](https://restep.wubytes.com/es/1/#descubrimiento)); el método de una acción, declarado ([10.1](https://restep.wubytes.com/es/1/#actions)), así que una acción `GET` de un borrador anterior ahora dice `"method": "GET"`; cómo encontrar el estado del servicio, sin ruta fija ([4.4](https://restep.wubytes.com/es/1/#salud)); y el idioma: los textos de la API siguen `Accept-Language` ([5.6](https://restep.wubytes.com/es/1/#idioma)), los datos nunca, y el texto traducido va en mapas de idioma con etiquetas en minúsculas, que se pueden filtrar y ordenar por etiqueta exacta ([3](https://restep.wubytes.com/es/1/#datos), [6.1](https://restep.wubytes.com/es/1/#filtros)); y los valores heredados, con un campo efectivo de solo lectura y uno propio que se escribe, para que devolver lo leído nunca fije un valor heredado ([5.7](https://restep.wubytes.com/es/1/#herencia)).

Resuelto en el borrador 3: el orden entre errores ([5.4](https://restep.wubytes.com/es/1/#errores)); la ruta de un elemento ([5.1](https://restep.wubytes.com/es/1/#recursos)); a qué está ligado un cursor ([6.4](https://restep.wubytes.com/es/1/#paginacion)); los filtros repetidos en cualquiera de sus formas, los rangos como dos filtros sobre un campo y `null` en los booleanos ([6.1](https://restep.wubytes.com/es/1/#filtros)); la invalidación con grupos de caché ([7.3](https://restep.wubytes.com/es/1/#cache)); y cómo reanuda el cliente el canal de avisos ([9](https://restep.wubytes.com/es/1/#sync)).

Resuelto en el borrador 2: `filter[campo][op]` basta para `query`, y las expresiones siguen en `filter-expr`; no hace falta un tipo de medio propio, porque bastan `application/json`, `application/problem+json` y las URI de perfil; el descubrimiento declara tipos de campo solo donde Restep los necesita ([4.2](https://restep.wubytes.com/es/1/#descubrimiento)); y no hay política de caché por campo en Restep 1, porque cada combinación de `fields` ya es una URL distinta para una caché.

## 13. Referencias

- [**RFC 9110**](https://www.rfc-editor.org/rfc/rfc9110): semántica de HTTP (métodos, `ETag`, `If-Match`, `If-None-Match`).
- [**RFC 9457**](https://www.rfc-editor.org/rfc/rfc9457): Problem Details for HTTP APIs.
- [**RFC 5646**](https://www.rfc-editor.org/rfc/rfc5646): etiquetas de idioma. [**RFC 4647**](https://www.rfc-editor.org/rfc/rfc4647): emparejamiento de etiquetas de idioma (*lookup*).
- [**RFC 7396**](https://www.rfc-editor.org/rfc/rfc7396): JSON Merge Patch. [**RFC 5789**](https://www.rfc-editor.org/rfc/rfc5789): `PATCH` y `Accept-Patch`.
- [**RFC 6901**](https://www.rfc-editor.org/rfc/rfc6901): JSON Pointer. [**RFC 8259**](https://www.rfc-editor.org/rfc/rfc8259): JSON.
- Borrador del IETF del [Health Check Response Format](https://datatracker.ietf.org/doc/draft-inadarei-api-health-check/): `application/health+json` ([4.4](https://restep.wubytes.com/es/1/#salud)).
- [**JSON Schema 2020-12**](https://json-schema.org/draft/2020-12): los esquemas de [4.3](https://restep.wubytes.com/es/1/#describir).
- [**RFC 3986**](https://www.rfc-editor.org/rfc/rfc3986): URI. [**RFC 6570**](https://www.rfc-editor.org/rfc/rfc6570): plantillas de URI.
- [**RFC 6906**](https://www.rfc-editor.org/rfc/rfc6906): la relación de enlace `profile`. [**RFC 8631**](https://www.rfc-editor.org/rfc/rfc8631): `service-desc`, `service-doc` y `status`. [**RFC 8288**](https://www.rfc-editor.org/rfc/rfc8288): enlaces web (`Link`, `anchor`, `hreflang`).
- [**RFC 7240**](https://www.rfc-editor.org/rfc/rfc7240): `Prefer` y `Preference-Applied`.
- [**RFC 6585**](https://www.rfc-editor.org/rfc/rfc6585): `428` y `429`. [**RFC 4918**](https://www.rfc-editor.org/rfc/rfc4918): `424`.
- [**RFC 3339**](https://www.rfc-editor.org/rfc/rfc3339): fechas y horas.
- [**RFC 9651**](https://www.rfc-editor.org/rfc/rfc9651): Structured Field Values for HTTP.
- [**RFC 10008**](https://www.rfc-editor.org/rfc/rfc10008): el método `QUERY`.
- [**RFC 9875**](https://www.rfc-editor.org/rfc/rfc9875): HTTP Cache Groups.
- [**RFC 8620**](https://www.rfc-editor.org/rfc/rfc8620): JMAP, cambios y referencias entre operaciones.
- [**RFC 9745**](https://www.rfc-editor.org/rfc/rfc9745) y [**RFC 8594**](https://www.rfc-editor.org/rfc/rfc8594): `Deprecation` y `Sunset`.
- [**RFC 5829**](https://www.rfc-editor.org/rfc/rfc5829): las relaciones `successor-version` y `predecessor-version`.
- [**RFC 9728**](https://www.rfc-editor.org/rfc/rfc9728): metadatos de recurso protegido de OAuth 2.0. [**RFC 8414**](https://www.rfc-editor.org/rfc/rfc8414) y [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html): metadatos del servidor de autorización.
- [**RFC 6750**](https://www.rfc-editor.org/rfc/rfc6750): tokens Bearer y sus retos. [**RFC 9449**](https://www.rfc-editor.org/rfc/rfc9449): DPoP. [**RFC 8707**](https://www.rfc-editor.org/rfc/rfc8707): indicadores de recurso. [**RFC 9700**](https://www.rfc-editor.org/rfc/rfc9700): buenas prácticas de seguridad de OAuth 2.0.
- [**RFC 9727**](https://www.rfc-editor.org/rfc/rfc9727): `api-catalog`.
- [**RFC 2119**](https://www.rfc-editor.org/rfc/rfc2119) y [**RFC 8174**](https://www.rfc-editor.org/rfc/rfc8174): palabras clave de requisitos.
- Borrador del IETF de [la cabecera `Idempotency-Key`](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) (revisión 08).
- [**AIP-136**](https://google.aip.dev/136), [**AIP-158**](https://google.aip.dev/158) y [**AIP-160**](https://google.aip.dev/160) de Google.
- [JSON:API 1.1](https://jsonapi.org/format/).
- [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html).
