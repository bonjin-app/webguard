import { afterEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { webcrypto } from "node:crypto";
import {
  WebGuard,
  getAutoGuard,
  installAutoGuard,
  type WebGuardOptions,
} from "../../packages/browser/src/index";

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function browser() {
  const dom = new JSDOM('<p id="notice">Private customer content</p>', {
    url: "https://example.test/secret?token=private",
  });
  vi.stubGlobal("window", dom.window);
  Object.defineProperty(dom.window.document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  cleanup.push(() => dom.window.close());
  return dom.window;
}
function guard(options: WebGuardOptions = {}) {
  const instance = WebGuard.init(options);
  cleanup.push(() => instance.destroy());
  return instance;
}

it("distinguishes configured browser features from unavailable SSR features", () => {
  vi.stubGlobal("crypto", webcrypto);
  const instance = guard({
    devtools: { blockShortcuts: true },
    integrity: { enabled: true },
    domIntegrity: { enabled: true, selectors: ["#notice"] },
  });
  expect(typeof instance.getStatus).toBe("function");
  expect(instance.getStatus()).toMatchObject({
    version: 1,
    scope: "runtime-only",
    lifecycle: "active",
    environment: "server",
    features: {
      shortcuts: "unavailable",
      contextMenu: "off",
      geometry: "off",
      integrity: "ready",
      domIntegrity: "unavailable",
    },
    pageProtection: { state: "idle", reason: null },
    coverage: {
      obfuscation: "not-verified",
      responseHeaders: "not-verified",
      devtoolsClosure: "unsupported",
    },
  });
});

it("reports a deferred page response before body exists and releases it on destroy", () => {
  const win = browser();
  win.document.body.remove();
  const instance = guard({
    devtools: { blockShortcuts: true, response: "block" },
  });
  win.document.dispatchEvent(
    new win.KeyboardEvent("keydown", {
      key: "F12",
      cancelable: true,
      bubbles: true,
    }),
  );
  expect(instance.getStatus().pageProtection).toEqual({
    state: "pending",
    reason: "shortcut",
  });
  instance.destroy();
  expect(instance.getStatus().pageProtection).toEqual({
    state: "idle",
    reason: null,
  });
});

it("tracks updates and destruction without confusing retained options with active listeners", () => {
  const win = browser();
  const instance = guard({
    devtools: { blockShortcuts: true, blockContextMenu: true },
  });
  expect(instance.getStatus().features).toMatchObject({
    shortcuts: "listening",
    contextMenu: "listening",
    geometry: "off",
  });
  instance.update({ devtools: { blockShortcuts: false, detect: true } });
  expect(instance.getStatus().features).toMatchObject({
    shortcuts: "off",
    contextMenu: "listening",
    geometry: "listening",
  });
  instance.destroy();
  expect(instance.getOptions().devtools?.blockContextMenu).toBe(true);
  expect(instance.getStatus()).toMatchObject({
    lifecycle: "destroyed",
    features: {
      shortcuts: "off",
      contextMenu: "off",
      geometry: "off",
      integrity: "off",
      domIntegrity: "off",
    },
    debugging: { state: "off" },
    pageProtection: { state: "idle", reason: null },
  });
  const menu = new win.MouseEvent("contextmenu", { cancelable: true });
  win.document.dispatchEvent(menu);
  expect(menu.defaultPrevented).toBe(false);
});

it("reports DOM baseline failures, stopped observation and explicit recovery", async () => {
  const win = browser();
  const instance = guard({
    domIntegrity: { enabled: true, selectors: ["#missing"] },
  });
  expect(instance.getStatus().features.domIntegrity).toBe("error");
  instance.update({ domIntegrity: { selectors: ["#notice"] } });
  expect(instance.getStatus().features.domIntegrity).toBe("watching");
  win.document.querySelector("#notice")!.textContent = "Changed";
  await Promise.resolve();
  expect(instance.getStatus().features.domIntegrity).toBe("mismatch");
  expect(instance.rebaselineDom()).toBe(true);
  expect(instance.getStatus().features.domIntegrity).toBe("watching");
  instance.update({ domIntegrity: { enabled: false } });
  expect(instance.getStatus().features.domIntegrity).toBe("off");
});

it("reports missing browser capabilities instead of claiming protection is active", () => {
  const win = browser();
  Object.defineProperty(win, "MutationObserver", {
    value: undefined,
    configurable: true,
  });
  vi.stubGlobal("crypto", undefined);
  const instance = guard({
    integrity: { enabled: true },
    domIntegrity: { enabled: true, selectors: ["#notice"] },
  });
  expect(instance.getStatus().features).toMatchObject({
    integrity: "unavailable",
    domIntegrity: "unavailable",
  });
});

it("reports a failed modal response and clears it when its policy is disabled", () => {
  const win = browser();
  const instance = guard({
    devtools: { blockShortcuts: true, response: "block" },
  });
  win.document.dispatchEvent(
    new win.KeyboardEvent("keydown", {
      key: "F12",
      cancelable: true,
      bubbles: true,
    }),
  );
  expect(instance.getStatus().pageProtection).toEqual({
    state: "unavailable",
    reason: "shortcut",
  });
  instance.update({ devtools: { response: "monitor" } });
  expect(instance.getStatus().pageProtection).toEqual({
    state: "idle",
    reason: null,
  });
});

it("returns detached private-content-free snapshots without fetching or emitting events", () => {
  browser();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const onThreat = vi.fn();
  const instance = guard({
    onThreat,
    domIntegrity: { enabled: true, selectors: ["#notice"] },
  });
  const status = instance.getStatus();
  status.features.domIntegrity = "off";
  status.debugging.samples = 999;
  expect(instance.getStatus().features.domIntegrity).toBe("watching");
  expect(instance.getStatus().debugging.samples).toBe(0);
  expect(JSON.stringify(instance.getStatus())).not.toMatch(
    /Private customer|secret|token|#notice/,
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(onThreat).not.toHaveBeenCalled();
});

it("rejects a legacy automatic registry instead of returning an instance missing the status API", () => {
  const win = browser();
  const legacy = { ...guard() };
  Reflect.deleteProperty(legacy, "getStatus");
  Object.defineProperty(win, Symbol.for("webguard.browser.auto.v1"), {
    value: { instance: legacy, isActive: () => true },
    configurable: true,
  });
  expect(getAutoGuard()).toBeUndefined();
  expect(() => installAutoGuard({})).toThrow(/registry is unavailable/);
});

it("does not claim listeners are installed during a reentrant policy-change callback", () => {
  const win = browser();
  Object.defineProperty(win.HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  let during: string | undefined;
  let prevented: boolean | undefined;
  const instance = guard({
    devtools: {
      blockShortcuts: true,
      blockContextMenu: true,
      response: "block",
    },
    onThreat(event) {
      if (event.type !== "page-unblocked") return;
      during = instance.getStatus().features.contextMenu;
      const menu = new win.MouseEvent("contextmenu", { cancelable: true });
      win.document.dispatchEvent(menu);
      prevented = menu.defaultPrevented;
    },
  });
  win.document.dispatchEvent(
    new win.KeyboardEvent("keydown", {
      key: "F12",
      cancelable: true,
      bubbles: true,
    }),
  );
  instance.update({ devtools: { blockShortcuts: false } });
  expect(during).toBe("off");
  expect(prevented).toBe(false);
  expect(instance.getStatus().features.contextMenu).toBe("listening");
  const menu = new win.MouseEvent("contextmenu", { cancelable: true });
  win.document.dispatchEvent(menu);
  expect(menu.defaultPrevented).toBe(true);
});
