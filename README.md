# pdf.ericbs.dev
Truly free online PDF editor

Files are opened, edited and saved entirely in the browser. Nothing is uploaded, there is no
account, and the server stores nothing.

So that a reload does not cost you your work, the open file and the edits made to it are written
to the browser's IndexedDB, on that device only. That copy is kept on disk: it outlives the tab,
and closing the browser does not remove it. It goes when you close the PDF with the toolbar's
close button, or when another file takes its place. On a shared or borrowed computer, close the
PDF when you are done — clearing the site's data does the same thing.

## Running it

```sh
bun install
bun run dev     # http://localhost:3000, hot reloading
bun run start   # production mode
bun test        # unit tests
bun run test:e2e
```

## Deploying behind a proxy

The app carries its own Content-Security-Policy in `src/index.html`, so it stays locked down
wherever it is served from. Three headers cannot be set from a page and belong to whatever
terminates TLS in front of it:

```
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

The first is the one that matters: without it the editor can be framed by another site.
