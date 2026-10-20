import type { Plugin } from "vite";
import { resolve } from "node:path";
import { createProtectedServer } from "./static-server.mjs";

/** Preview uses the same trusted build policy and private-file filter as the public server. */
export function protectedPreview(
  headers: Record<string, string> | false,
): Plugin {
  return {
    name: "webguard-protected-preview",
    apply: (_config, environment) =>
      headers !== false && environment.isPreview === true,
    configResolved(config) {
      for (const options of Object.values(config.preview.proxy ?? {}))
        if (typeof options === "object" && options.bypass !== undefined)
          throw new Error(
            "WebGuard protected preview does not support proxy.bypass; use a dedicated API proxy route or headers:false with your own server policy",
          );
    },
    async configurePreviewServer(server) {
      if (!headers) return;
      const base = server.config.base;
      if (!base.startsWith("/") || !base.endsWith("/") || base.startsWith("//"))
        throw new Error(
          "WebGuard preview requires a root-relative base ending in /",
        );
      const protectedServer = await createProtectedServer(
        resolve(server.config.root, server.config.build.outDir),
      );
      const proxyContexts = Object.keys(server.config.preview.proxy ?? {}).map(
        (context) => ({
          prefix: context,
          expression: context.startsWith("^") ? new RegExp(context) : undefined,
        }),
      );
      // This hook executes before Vite's static middleware, so it cannot fall back to serving private files.
      server.middlewares.use((request, response, next) => {
        const raw = request.url ?? "";
        // Explicit API proxy routes belong to Vite/the backend, not this static filesystem handler.
        if (
          proxyContexts.some(({ prefix, expression }) =>
            expression ? expression.test(raw) : raw.startsWith(prefix),
          )
        ) {
          next();
          return;
        }
        const index = raw.indexOf("?");
        const path = index < 0 ? raw : raw.slice(0, index);
        const query = index < 0 ? "" : raw.slice(index);
        if (
          base !== "/" &&
          (!path.startsWith(base) || path === base.slice(0, -1))
        ) {
          for (const [name, value] of Object.entries(headers))
            response.setHeader(name, value);
          response.setHeader("X-Content-Type-Options", "nosniff");
          if (
            path === base.slice(0, -1) &&
            ["GET", "HEAD"].includes(request.method ?? "")
          ) {
            response.writeHead(308, { Location: base + query });
          } else {
            response.writeHead(404, {
              "Content-Type": "text/plain; charset=utf-8",
            });
          }
          response.end();
          return;
        }
        request.url = base === "/" ? raw : raw.slice(base.length - 1);
        if (base !== "/") {
          // The static handler sees a stripped mount; retain that mount in its local redirects.
          const setHeader = response.setHeader.bind(response);
          response.setHeader = (name, value) => {
            if (
              name.toLowerCase() === "location" &&
              typeof value === "string" &&
              value.startsWith("/") &&
              !value.startsWith("//")
            )
              value = base.slice(0, -1) + value;
            return setHeader(name, value);
          };
        }
        protectedServer.emit("request", request, response);
      });
    },
  };
}
