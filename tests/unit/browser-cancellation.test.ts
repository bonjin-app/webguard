import { createServer } from "node:http";
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebGuard, type ThreatEvent } from "../../packages/browser/src/index";

const expected =
  "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn";
afterEach(() => vi.unstubAllGlobals());

async function integrityServer(bodyStarted: boolean) {
  let requestCount = 0;
  let closedCount = 0;
  let started!: () => void;
  let closed!: () => void;
  const requestsStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const requestsClosed = new Promise<void>((resolve) => {
    closed = resolve;
  });
  let missingClosed!: () => void;
  const missingResponseClosed = new Promise<void>((resolve) => {
    missingClosed = resolve;
  });
  const server = createServer((request, response) => {
    if (request.url === "/missing") {
      response.on("close", missingClosed);
      response.writeHead(404);
      response.write("an error body that never completes");
      return;
    }
    if (request.url === "/complete") {
      response.end("abc");
      return;
    }
    requestCount++;
    response.on("close", () => {
      if (++closedCount === 2) closed();
    });
    if (bodyStarted) {
      response.writeHead(200);
      response.write("abc");
    }
    if (requestCount === 2) started();
    // Deliberately leave both responses incomplete: only client cancellation can finish the checks.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No local server address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    requestsStarted,
    requestsClosed,
    missingResponseClosed,
    async stop() {
      const stopped = new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeAllConnections();
      await stopped;
    },
  };
}
async function bounded<T>(promise: Promise<T>): Promise<T | "still pending"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<"still pending">((resolve) => {
        timer = setTimeout(() => resolve("still pending"), 500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe.each([false, true])(
  "integrity cancellation with response body started=%s",
  (bodyStarted) => {
    it.each(["destroy", "disable"] as const)(
      "%s aborts concurrent requests and settles checks without waiting for a response",
      async (action) => {
        const server = await integrityServer(bodyStarted);
        vi.stubGlobal("crypto", webcrypto);
        const events: ThreatEvent[] = [];
        const guard = WebGuard.init({
          integrity: { enabled: true },
          onThreat: (event) => events.push(event),
        });
        try {
          const first = guard.checkIntegrity(`${server.url}/first`, expected);
          const second = guard.checkIntegrity(`${server.url}/second`, expected);
          await server.requestsStarted;
          // An unrelated live policy update must preserve both checks.
          guard.update({ devtools: { response: "monitor" } });
          expect(
            await guard.checkIntegrity(`${server.url}/complete`, expected),
          ).toBe(true);
          if (action === "destroy") guard.destroy();
          else {
            guard.update({ integrity: { enabled: false } });
            guard.update({ integrity: { enabled: true } });
          }
          expect(await bounded(Promise.all([first, second]))).toEqual([
            false,
            false,
          ]);
          // This asserts actual connection cancellation, not a supplied mock's AbortSignal.
          expect(await bounded(server.requestsClosed)).toBeUndefined();
          expect(events).toEqual([]);
          if (action === "disable")
            expect(
              await guard.checkIntegrity(`${server.url}/complete`, expected),
            ).toBe(true);
        } finally {
          guard.destroy();
          await server.stop();
        }
      },
    );
  },
);

it("closes an unread streaming 404 body without extra failure or success events", async () => {
  const server = await integrityServer(false);
  vi.stubGlobal("crypto", webcrypto);
  const events: ThreatEvent[] = [];
  const guard = WebGuard.init({
    integrity: { enabled: true },
    onThreat: (event) => events.push(event),
  });
  try {
    expect(await guard.checkIntegrity(`${server.url}/missing`, expected)).toBe(
      false,
    );
    expect(await bounded(server.missingResponseClosed)).toBeUndefined();
    expect(await guard.checkIntegrity(`${server.url}/complete`, expected)).toBe(
      true,
    );
    expect(
      await guard.checkIntegrity(
        `${server.url}/complete`,
        "sha384-" + "A".repeat(64),
      ),
    ).toBe(false);
    expect(events.map((event) => event.type)).toEqual([
      "integrity-error",
      "integrity-mismatch",
    ]);
  } finally {
    guard.destroy();
    await server.stop();
  }
});
