import { createServer } from "node:http";
import { webcrypto } from "node:crypto";
import { gzipSync } from "node:zlib";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import {
  WebGuard,
  type ThreatEvent,
  type WebGuardOptions,
} from "../../packages/browser/src/index";

const expected =
  "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn";
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
  vi.unstubAllGlobals();
});
function init(integrity: NonNullable<WebGuardOptions["integrity"]>) {
  const events: ThreatEvent[] = [];
  const guard = WebGuard.init({
    integrity: { enabled: true, ...integrity },
    onThreat: (event) => events.push(event),
  });
  cleanup.push(() => guard.destroy());
  return { guard, events };
}
async function fixture() {
  vi.stubGlobal("crypto", webcrypto);
  const requests: string[] = [];
  let closed = 0;
  const server = createServer((request, response) => {
    requests.push(request.url!);
    response.on("close", () => closed++);
    if (request.url === "/abc") response.end("abc");
    else if (request.url === "/gzipabc") {
      const zipped = gzipSync("abc");
      response.writeHead(200, {
        "Content-Encoding": "gzip",
        "Content-Length": zipped.length,
      });
      response.end(zipped);
    } else if (request.url === "/gzip") {
      const zipped = gzipSync("a".repeat(1024));
      response.writeHead(200, {
        "Content-Encoding": "gzip",
        "Content-Length": zipped.length,
      });
      response.end(zipped);
    } else if (request.url === "/redirect") {
      response.writeHead(302, { Location: "/abc" });
      response.end();
    } else if (request.url === "/large-header") {
      response.writeHead(200, { "Content-Length": "100000" });
      response.flushHeaders();
    } else if (request.url === "/chunks") {
      response.writeHead(200);
      response.write("abc");
    }
    // /pending deliberately never sends headers.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("No fixture address");
  cleanup.push(async () => {
    const stopped = new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    server.closeAllConnections();
    await stopped;
  });
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    closed: () => closed,
  };
}

it.each([
  "data:text/plain,abc",
  "https://name:password@example.test/asset",
  "file:///fixture",
  "javascript:void(0)",
])(
  "rejects non-resource or credential-bearing URL before requesting: %s",
  async (url) => {
    vi.stubGlobal("crypto", webcrypto);
    const fetch = vi.fn(async () => new Response("abc"));
    vi.stubGlobal("fetch", fetch);
    const { guard, events } = init({});
    expect(await guard.checkIntegrity(url, expected)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  },
);
it("does not follow a redirect to a different resource", async () => {
  const server = await fixture();
  const { guard, events } = init({});
  expect(await guard.checkIntegrity(server.url + "/redirect", expected)).toBe(
    false,
  );
  expect(server.requests).toEqual(["/redirect"]);
  expect(events.map((event) => event.type)).toEqual(["integrity-error"]);
  expect(JSON.stringify(events)).not.toContain(server.url);
});
it.each(["/pending", "/chunks"])(
  "bounds %s across headers and streaming and closes the actual connection",
  async (path) => {
    const server = await fixture();
    const { guard, events } = init({ timeoutMs: 100 });
    const result = guard.checkIntegrity(server.url + path, expected);
    expect(await result).toBe(false);
    await vi.waitFor(() => expect(server.closed()).toBe(1), { timeout: 1000 });
    expect(events.map((event) => event.type)).toEqual(["integrity-error"]);
    expect(await guard.checkIntegrity(server.url + "/abc", expected)).toBe(
      true,
    );
  },
);
it.each(["/chunks", "/large-header"])(
  "rejects oversized %s without waiting for body completion",
  async (path) => {
    const server = await fixture();
    const { guard, events } = init({ maxBytes: 2, timeoutMs: 1000 });
    const result = await Promise.race([
      guard.checkIntegrity(server.url + path, expected),
      new Promise<"pending">((resolve) =>
        setTimeout(() => resolve("pending"), 400),
      ),
    ]);
    expect(result).toBe(false);
    await vi.waitFor(() => expect(server.closed()).toBe(1), { timeout: 1000 });
    expect(events.map((event) => event.type)).toEqual(["integrity-error"]);
  },
);
it("accepts an exact byte boundary and reclaims capacity after completion", async () => {
  const server = await fixture();
  const { guard } = init({ maxBytes: 3, maxConcurrent: 1 });
  expect(await guard.checkIntegrity(server.url + "/abc", expected)).toBe(true);
  expect(await guard.checkIntegrity(server.url + "/abc", expected)).toBe(true);
});
it("does not request beyond the concurrent budget and reclaims canceled capacity", async () => {
  const server = await fixture();
  const { guard, events } = init({ maxConcurrent: 1 });
  const pending = guard.checkIntegrity(server.url + "/pending", expected);
  await vi.waitFor(() => expect(server.requests).toEqual(["/pending"]));
  expect(await guard.checkIntegrity(server.url + "/abc", expected)).toBe(false);
  expect(server.requests).toEqual(["/pending"]);
  guard.update({ integrity: { enabled: false } });
  expect(await pending).toBe(false);
  guard.update({ integrity: { enabled: true } });
  expect(await guard.checkIntegrity(server.url + "/abc", expected)).toBe(true);
  expect(events.map((event) => event.type)).toEqual(["integrity-error"]);
});
it("aborts old requests when verification budgets change without delivering stale failures", async () => {
  const server = await fixture();
  const { guard, events } = init({});
  const pending = guard.checkIntegrity(server.url + "/pending", expected);
  await vi.waitFor(() => expect(server.requests.length).toBe(1));
  guard.update({ integrity: { maxBytes: 2 } });
  expect(await pending).toBe(false);
  expect(events).toEqual([]);
});
it.each([
  { timeoutMs: 0 },
  { timeoutMs: Infinity },
  { timeoutMs: 120001 },
  { maxBytes: -1 },
  { maxBytes: 0.5 },
  { maxBytes: 67108865 },
  { maxConcurrent: 0 },
  { maxConcurrent: 17 },
])("rejects malformed resource budgets atomically: %j", (integrity) => {
  const { guard } = init({});
  const before = guard.getOptions();
  expect(() => guard.update({ integrity })).toThrow(TypeError);
  expect(guard.getOptions()).toEqual(before);
});
it("does not claim a noncancelable context-menu event was blocked", () => {
  const dom = new JSDOM("", { url: "https://example.test" });
  cleanup.push(() => dom.window.close());
  vi.stubGlobal("window", dom.window);
  const events: ThreatEvent[] = [];
  const guard = WebGuard.init({
    devtools: { blockContextMenu: true },
    onThreat: (e) => events.push(e),
  });
  cleanup.push(() => guard.destroy());
  dom.window.document.dispatchEvent(
    new dom.window.MouseEvent("contextmenu", { bubbles: true }),
  );
  expect(events.map((e) => e.type)).toEqual(["context-menu-unavailable"]);
});

it("counts decoded gzip bytes rather than trusting a small transport Content-Length", async () => {
  const server = await fixture();
  const { guard, events } = init({ maxBytes: 64 });
  expect(await guard.checkIntegrity(server.url + "/gzip", expected)).toBe(
    false,
  );
  expect(events.map((e) => e.type)).toEqual(["integrity-error"]);
});

it("accepts exact decoded gzip boundary even when the compressed wire bytes are larger", async () => {
  const server = await fixture();
  const { guard, events } = init({ maxBytes: 3 });
  expect(await guard.checkIntegrity(server.url + "/gzipabc", expected)).toBe(
    true,
  );
  expect(events).toEqual([]);
});

it("does not produce late success when digest completion exceeds the deadline", async () => {
  const server = await fixture();
  let finish!: (bytes: ArrayBuffer) => void;
  let started!: () => void;
  const digestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.stubGlobal("crypto", {
    subtle: {
      digest: () => {
        started();
        return new Promise<ArrayBuffer>((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  const { guard, events } = init({ timeoutMs: 100 });
  const result = guard.checkIntegrity(server.url + "/abc", expected);
  await digestStarted;
  expect(await result).toBe(false);
  finish(
    await webcrypto.subtle.digest("SHA-384", new TextEncoder().encode("abc")),
  );
  await Promise.resolve();
  expect(events.map((e) => e.type)).toEqual(["integrity-error"]);
});

it("settles a timed-out host fetch shim even if that shim ignores cancellation", async () => {
  vi.stubGlobal("crypto", webcrypto);
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const { guard, events } = init({ timeoutMs: 20 });
  expect(
    await guard.checkIntegrity("https://example.test/asset", expected),
  ).toBe(false);
  finish(new Response("abc"));
  await Promise.resolve();
  expect(events.map((e) => e.type)).toEqual(["integrity-error"]);
});

it("rejects a non-streaming response instead of falling back to an unbounded buffer", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const buffer = vi.fn(async () => new TextEncoder().encode("abc").buffer);
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    headers: new Headers(),
    body: {},
    arrayBuffer: buffer,
  }));
  const { guard, events } = init({});
  expect(
    await guard.checkIntegrity("https://example.test/asset", expected),
  ).toBe(false);
  expect(buffer).not.toHaveBeenCalled();
  expect(events.map((e) => e.type)).toEqual(["integrity-error"]);
});

it("does not enable integrity from polluted object prototypes", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetch = vi.fn(async () => new Response("abc"));
  vi.stubGlobal("fetch", fetch);
  const { guard } = init({ enabled: false });
  // A guard with no explicit integrity policy must remain disabled as well.
  const defaultGuard = WebGuard.init();
  cleanup.push(() => defaultGuard.destroy());
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.prototype,
    "integrity",
  );
  const results: boolean[] = [];
  try {
    Object.defineProperty(Object.prototype, "integrity", {
      configurable: true,
      value: { enabled: true },
    });
    results.push(
      await defaultGuard.checkIntegrity("https://example.test/asset", expected),
    );
    defaultGuard.update({ devtools: { detect: false } });
    results.push(
      await defaultGuard.checkIntegrity("https://example.test/asset", expected),
    );
  } finally {
    if (descriptor)
      Object.defineProperty(Object.prototype, "integrity", descriptor);
    else Reflect.deleteProperty(Object.prototype, "integrity");
  }
  expect(results).toEqual([false, false]);
  expect(fetch).not.toHaveBeenCalled();
  expect(guard.getOptions().integrity?.enabled).toBe(false);
});

it("does not coerce non-string expected digests", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetch = vi.fn(async () => new Response("abc"));
  vi.stubGlobal("fetch", fetch);
  const coerce = vi.fn(() => expected);
  const { guard } = init({});
  expect(
    await guard.checkIntegrity("https://example.test/asset", {
      toString: coerce,
    } as unknown as string),
  ).toBe(false);
  expect(coerce).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects a late success even when host work delays the abort timer", async () => {
  const digest = await webcrypto.subtle.digest(
    "SHA-384",
    new TextEncoder().encode("abc"),
  );
  vi.stubGlobal("fetch", async () => new Response("abc"));
  vi.stubGlobal("crypto", {
    subtle: {
      digest: () => {
        const until = performance.now() + 30;
        while (performance.now() < until) {
          /* Controlled host work delays timer delivery. */
        }
        return Promise.resolve(digest);
      },
    },
  });
  const { guard, events } = init({ timeoutMs: 10 });
  expect(
    await guard.checkIntegrity("https://example.test/asset", expected),
  ).toBe(false);
  expect(events.map((e) => e.type)).toEqual(["integrity-error"]);
});
