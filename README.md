# Restep

**Restep** is an open specification for HTTP APIs with JSON, at REST level 2½: resources, collections
and a few rules every API reinvents (errors, filters, pagination, concurrency, evolution), plus a
discovery document that lets generic clients and agents use an API without reading its docs.

Read it at <https://w3id.org/restep/1/> ([en español](https://w3id.org/restep/es/1/)).

| Path | What it is |
|---|---|
| [`1/spec.md`](1/spec.md), [`1/index.html`](1/index.html) | Restep 1 in English, which prevails. The HTML page is the source; the Markdown is generated from it |
| [`es/1/spec.md`](es/1/spec.md), [`es/1/index.html`](es/1/index.html) | Restep 1 in Spanish |
| [`1/schema/`](1/schema/) | JSON Schemas of the discovery document and of errors (`problem+json`) |
| [`ref/restep-server.mjs`](ref/restep-server.mjs) | The reference server: one file, Node 18+, no dependencies. `node ref/restep-server.mjs` |

`npm test` runs [`restep-check`](https://github.com/restep-spec/restep-check) (copied in `vendor/`)
against the reference server, writes included.

## Status

Restep 1 is a draft: it can still change in incompatible ways until 1.0. The open questions are in
section 12 of the specification.

## Issues and proposals

Open an issue here for anything in the specification: a requirement that is unclear, two that
contradict each other, a case it does not cover, or a proposal. This repository is generated from
the Restep site, where the specification is written alongside its tools; pull requests are welcome
as proposals and are applied there.

## Tools

The tools are listed in [the organization](https://github.com/restep-spec) and at <https://w3id.org/restep/tools/>.

MIT licensed.
