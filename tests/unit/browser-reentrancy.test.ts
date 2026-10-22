import { afterEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  WebGuard,
  getAutoGuard,
  installAutoGuard,
  type WebGuardInstance,
} from "../../packages/browser/src/index";

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function browser() {
  const dom = new JSDOM("<button>Host action</button>", {
    url: "https://example.test/",
  });
  vi.stubGlobal("window", dom.window);
  Object.defineProperty(dom.window.document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  cleanup.push(() => dom.window.close());
  return dom.window;
}

it("reuses the reachable automatic owner during initialization callbacks and fully cleans it up", () => {
  const win = browser();
  vi.useFakeTimers();
  const events: string[] = [];
  let nested: WebGuardInstance | undefined;
  let ownerDuringCallback: WebGuardInstance | undefined;
  const outer = installAutoGuard({
    devtools: { blockShortcuts: true },
    debugging: { enabled: true, watch: true },
    domIntegrity: { enabled: true, selectors: ["#missing"] },
    onThreat(event) {
      events.push(`initial:${event.type}`);
      if (event.type !== "dom-integrity-error") return;
      ownerDuringCallback = getAutoGuard();
      nested = installAutoGuard({
        devtools: { blockContextMenu: true },
        debugging: { enabled: true, watch: true },
        onThreat: (event) => events.push(`current:${event.type}`),
      });
      cleanup.push(() => nested?.destroy());
    },
  });
  cleanup.push(() => outer.destroy());
  const key = () => {
    const event = new win.KeyboardEvent("keydown", {
      key: "F12",
      bubbles: true,
      cancelable: true,
    });
    win.document.dispatchEvent(event);
    return event.defaultPrevented;
  };

  expect.soft(ownerDuringCallback).toBe(outer);
  expect.soft(nested).toBe(outer);
  expect.soft(getAutoGuard()).toBe(outer);
  expect.soft(key()).toBe(true);
  expect
    .soft(events)
    .toEqual(["initial:dom-integrity-error", "current:shortcut-blocked"]);
  expect.soft(vi.getTimerCount()).toBe(1);
  outer.destroy();
  expect.soft(getAutoGuard()).toBeUndefined();
  expect.soft(vi.getTimerCount()).toBe(0);
  expect.soft(key()).toBe(false);
  const menu = new win.MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
  });
  win.document.dispatchEvent(menu);
  expect(menu.defaultPrevented).toBe(false);
});

it("allows an initialization callback to destroy the registered automatic owner", () => {
  const win = browser();
  vi.useFakeTimers();
  let ownerDuringCallback: WebGuardInstance | undefined;
  const outer = installAutoGuard({
    devtools: { blockShortcuts: true },
    debugging: { enabled: true, watch: true },
    domIntegrity: { enabled: true, selectors: ["#missing"] },
    onThreat(event) {
      if (event.type !== "dom-integrity-error") return;
      ownerDuringCallback = getAutoGuard();
      ownerDuringCallback?.destroy();
    },
  });
  cleanup.push(() => outer.destroy());
  expect.soft(ownerDuringCallback).toBe(outer);
  expect.soft(getAutoGuard()).toBeUndefined();
  expect.soft(vi.getTimerCount()).toBe(0);
  const key = new win.KeyboardEvent("keydown", {
    key: "F12",
    bubbles: true,
    cancelable: true,
  });
  win.document.dispatchEvent(key);
  expect(key.defaultPrevented).toBe(false);
});

it("rolls back automatic installation when the window rejects registry publication", () => {
  const win = browser();
  vi.useFakeTimers();
  const registryKey = Symbol.for("webguard.browser.auto.v1");
  vi.stubGlobal(
    "window",
    new Proxy(win, {
      defineProperty(target, key, descriptor) {
        if (key === registryKey) throw new TypeError("Registry rejected");
        return Reflect.defineProperty(target, key, descriptor);
      },
    }),
  );
  expect(() =>
    installAutoGuard({
      devtools: { blockShortcuts: true },
      debugging: { enabled: true, watch: true },
    }),
  ).toThrow(TypeError);
  expect(getAutoGuard()).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  const key = new win.KeyboardEvent("keydown", {
    key: "F12",
    bubbles: true,
    cancelable: true,
  });
  win.document.dispatchEvent(key);
  expect(key.defaultPrevented).toBe(false);
});

it("still reports a genuine native modal failure once without leaving a blocker node", () => {
  const win = browser();
  Object.defineProperty(win.HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      throw new win.DOMException("Modal unavailable", "InvalidStateError");
    },
  });
  const events: string[] = [];
  const guard = WebGuard.init({
    devtools: { blockShortcuts: true, response: "block" },
    onThreat: (event) => events.push(event.type),
  });
  cleanup.push(() => guard.destroy());
  for (let count = 0; count < 2; count++)
    win.document.dispatchEvent(
      new win.KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        cancelable: true,
      }),
    );
  expect(events).toEqual([
    "shortcut-blocked",
    "page-block-unavailable",
    "shortcut-blocked",
  ]);
  expect(win.document.querySelector("[data-webguard-blocker]")).toBeNull();
});
