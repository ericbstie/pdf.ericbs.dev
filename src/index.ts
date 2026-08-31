import { serve } from "bun";
import index from "./index.html";

/** Live reload opens a socket and serves stack traces, so it waits to be asked for by name. */
const development = process.env.NODE_ENV === "development" && { hmr: true, console: true };

/** Every file stays in the browser, so no request to this server ever carries a body worth reading. */
const MAX_BODY_BYTES = 1024;

const PLAIN_TEXT = { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" };

const server = serve({
  routes: {
    "/": index,
    /** The editor is one page and has no routes of its own; nothing else here is worth answering. */
    "/*": new Response("Not found", { status: 404, headers: PLAIN_TEXT }),
  },
  development,
  maxRequestBodySize: MAX_BODY_BYTES,
  /** Whatever went wrong is this server's business, not the caller's. */
  error() {
    return new Response("Something went wrong", { status: 500, headers: PLAIN_TEXT });
  },
});

console.log(`Serving ${server.url}`);
