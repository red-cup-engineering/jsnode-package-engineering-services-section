# research.emsenn.net

## Architecture

`http <-> scripts <-> functions`.
Nothing else.

- Two modules only: `src/organizing-with-a-knowledge-vault`, `src/knowledge-vault-web-server`.
  They hold the functions.
- `scripts/*`: each script reads JSON from stdin, calls one function, writes JSON to stdout.
  Nothing more.
- The HTTP server is transport only.
  It projects `scripts/*` over OpenAPI, MCP, and the package-bin computer UI, with separate HTML pages for human library reading.
- Every script operation passes JSON.
  Browser library pages are HTML.

## Import rules

- `src/organizing-with-a-knowledge-vault` may import `@emsenn/organizing-a-knowledge-vault`, `@emsenn/organizing`, and the bounded transport/content helpers it needs.
  It does not import `@emsenn/computing`.
- `src/knowledge-vault-web-server` may import web-server packages and `src/organizing-with-a-knowledge-vault` to present the computer over HTTP.
  Nothing downstream of the web-server module.

## Forbidden

- No third module.
  Nothing outside the two modules and `scripts/*`.
- No legacy TypeScript suffix.
  Typed source uses `.mts`; executable scripts use `.mjs`.
- A script that does more than `stdin JSON -> function -> stdout JSON` is wrong.
- A script operation that does not pass JSON is wrong.
- Browser library pages may render HTML, but must not become a second operation API.
