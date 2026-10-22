import { expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

it("keeps the SDK active across cached navigation and destroys it on actual teardown", async () => {
  const dom = new JSDOM("", { runScripts: "outside-only" });
  const destroy = vi.fn();
  const init = vi.fn(() => ({ destroy }));
  const scope = dom.window as unknown as {
    WebGuardSDK: unknown;
    webguard: unknown;
  };
  scope.WebGuardSDK = { WebGuard: { init } };
  try {
    dom.window.eval(
      await readFile(
        new URL("../../examples/cdn/webguard-init.js", import.meta.url),
        "utf8",
      ),
    );
    expect(init).toHaveBeenCalledTimes(1);
    const instance = scope.webguard;
    dom.window.dispatchEvent(
      new dom.window.PageTransitionEvent("pagehide", { persisted: true }),
    );
    dom.window.dispatchEvent(
      new dom.window.PageTransitionEvent("pageshow", { persisted: true }),
    );
    expect(destroy).not.toHaveBeenCalled();
    expect(scope.webguard).toBe(instance);
    expect(init).toHaveBeenCalledTimes(1);
    dom.window.dispatchEvent(
      new dom.window.PageTransitionEvent("pagehide", { persisted: false }),
    );
    expect(destroy).toHaveBeenCalledTimes(1);
  } finally {
    dom.window.close();
  }
});
