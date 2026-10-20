import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { webcrypto } from "node:crypto";
import { WebGuard, type ThreatEvent } from "../../packages/browser/src/index";
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function browser() {
  const dom = new JSDOM('<input><div contenteditable="true"></div>');
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  cleanup.push(() => dom.window.close());
  return dom.window;
}
describe("browser SDK", () => {
  it("is safe in SSR and does not fetch without explicit integrity opt-in", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const guard = WebGuard.init();
    expect(await guard.checkIntegrity("/a", "bad")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    guard.destroy();
    guard.destroy();
  });
  it("leaves shortcuts and context menus available by default even in strict", () => {
    const win = browser();
    const guard = WebGuard.init({ preset: "strict" });
    cleanup.push(() => guard.destroy());
    const key = new win.KeyboardEvent("keydown", {
      key: "F12",
      cancelable: true,
      bubbles: true,
    });
    const menu = new win.MouseEvent("contextmenu", { cancelable: true });
    win.document.dispatchEvent(key);
    win.document.dispatchEvent(menu);
    expect(key.defaultPrevented).toBe(false);
    expect(menu.defaultPrevented).toBe(false);
  });
  it("blocks only opted-in shortcuts, preserves editables and ignores key repeats", () => {
    const win = browser();
    const events: ThreatEvent[] = [];
    const guard = WebGuard.init({
      devtools: { blockShortcuts: true, blockContextMenu: true },
      onThreat: (e) => events.push(e),
    });
    const fire = (
      options: KeyboardEventInit,
      target: EventTarget = win.document,
    ) => {
      const e = new win.KeyboardEvent("keydown", {
        cancelable: true,
        bubbles: true,
        ...options,
      });
      target.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(fire({ key: "F12" })).toBe(true);
    expect(fire({ key: "I", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(fire({ key: "j", metaKey: true, altKey: true })).toBe(true);
    expect(fire({ key: "a", ctrlKey: true })).toBe(false);
    expect(fire({ key: "F12", repeat: true })).toBe(true);
    expect(events).toHaveLength(3);
    expect(fire({ key: "F12" }, win.document.querySelector("input")!)).toBe(
      false,
    );
    expect(fire({ key: "F12" }, win.document.querySelector("div")!)).toBe(
      false,
    );
    const menu = new win.MouseEvent("contextmenu", { cancelable: true });
    win.document.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    guard.destroy();
    guard.destroy();
    expect(fire({ key: "F12" })).toBe(false);
  });
  it.each([
    "<input>",
    "<textarea></textarea>",
    "<select><option>One</option></select>",
    '<div contenteditable="true"><span>Editable text</span></div>',
    '<div role="textbox"><span>Editable text</span></div>',
  ])(
    "preserves editable composed events inside open Shadow DOM: %s",
    (markup) => {
      const win = browser();
      const events: ThreatEvent[] = [];
      const guard = WebGuard.init({
        devtools: { blockShortcuts: true, blockContextMenu: true },
        onThreat: (event) => events.push(event),
      });
      cleanup.push(() => guard.destroy());
      const host = win.document.createElement("div");
      win.document.body.append(host);
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = markup;
      const target = root.querySelector("span") ?? root.firstElementChild!;
      const key = new win.KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      const menu = new win.MouseEvent("contextmenu", {
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      target.dispatchEvent(key);
      target.dispatchEvent(menu);
      expect(key.defaultPrevented).toBe(false);
      expect(menu.defaultPrevented).toBe(false);
      expect(events).toEqual([]);

      // The same open shadow root must not exempt ordinary elements.
      const ordinary = win.document.createElement("button");
      root.append(ordinary);
      const blockedKey = new win.KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      const blockedMenu = new win.MouseEvent("contextmenu", {
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      ordinary.dispatchEvent(blockedKey);
      ordinary.dispatchEvent(blockedMenu);
      expect(blockedKey.defaultPrevented).toBe(true);
      expect(blockedMenu.defaultPrevented).toBe(true);
      expect(events.map((event) => event.type)).toEqual([
        "shortcut-blocked",
        "context-menu-blocked",
      ]);
    },
  );
  it("deduplicates resize heuristic transitions and isolates callback errors", () => {
    const win = browser();
    let count = 0;
    Object.defineProperty(win, "outerWidth", {
      value: 1400,
      configurable: true,
    });
    Object.defineProperty(win, "innerWidth", {
      value: 1000,
      configurable: true,
    });
    const guard = WebGuard.init({
      devtools: { detect: true },
      onThreat: () => {
        count++;
        throw new Error("host callback");
      },
    });
    cleanup.push(() => guard.destroy());
    win.dispatchEvent(new win.Event("resize"));
    win.dispatchEvent(new win.Event("resize"));
    expect(count).toBe(1);
    Object.defineProperty(win, "outerWidth", { value: 1000 });
    win.dispatchEvent(new win.Event("orientationchange"));
    Object.defineProperty(win, "outerWidth", { value: 1400 });
    win.dispatchEvent(new win.Event("resize"));
    expect(count).toBe(2);
    guard.destroy();
    win.dispatchEvent(new win.Event("resize"));
    expect(count).toBe(2);
  });
  it("checks explicit fetched bytes with SHA-384 and reports mismatch safely", async () => {
    browser();
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", async () => new Response("abc"));
    const events: ThreatEvent[] = [];
    const guard = WebGuard.init({
      integrity: { enabled: true },
      onThreat: (e) => events.push(e),
    });
    cleanup.push(() => guard.destroy());
    expect(
      await guard.checkIntegrity(
        "/a",
        "sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn",
      ),
    ).toBe(true);
    expect(await guard.checkIntegrity("/a", "sha384-" + "A".repeat(64))).toBe(
      false,
    );
    expect(events.map((e) => e.type)).toContain("integrity-mismatch");
    vi.stubGlobal("crypto", undefined);
    expect(await guard.checkIntegrity("/a", "sha384-" + "A".repeat(64))).toBe(
      false,
    );
  });
  it("ignores pending async results after destroy", async () => {
    browser();
    vi.stubGlobal("crypto", webcrypto);
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", () => new Promise<Response>((r) => (resolve = r)));
    const events: ThreatEvent[] = [];
    const guard = WebGuard.init({
      integrity: { enabled: true },
      onThreat: (e) => events.push(e),
    });
    const pending = guard.checkIntegrity("/a", "sha384-" + "A".repeat(64));
    guard.destroy();
    resolve(new Response("abc"));
    expect(await pending).toBe(false);
    expect(events).toHaveLength(0);
  });
});

describe("live browser policy", () => {
  it("merges nested updates immediately without duplicate callbacks and returns defensive snapshots", () => {
    const win = browser();
    const events: ThreatEvent[] = [];
    const initial = {
      devtools: { blockShortcuts: true, blockContextMenu: true },
      onThreat: (e: ThreatEvent) => events.push(e),
    };
    const guard = WebGuard.init(initial);
    cleanup.push(() => guard.destroy());
    initial.devtools.blockShortcuts = false;
    guard.update({
      devtools: { response: "monitor" },
      integrity: { enabled: true },
    });
    guard.update({ devtools: { threshold: 200 } });
    const key = () => {
      const event = new win.KeyboardEvent("keydown", {
        key: "F12",
        cancelable: true,
        bubbles: true,
      });
      win.document.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(key()).toBe(true);
    expect(events).toHaveLength(1);
    const snapshot = guard.getOptions();
    snapshot.devtools!.blockShortcuts = false;
    snapshot.integrity!.enabled = false;
    expect(guard.getOptions().devtools?.blockShortcuts).toBe(true);
    expect(guard.getOptions().integrity?.enabled).toBe(true);
    guard.update({ devtools: { blockShortcuts: false } });
    expect(key()).toBe(false);
    const menu = new win.MouseEvent("contextmenu", { cancelable: true });
    win.document.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    guard.destroy();
    guard.update({ devtools: { blockShortcuts: true } });
    expect(key()).toBe(false);
  });
  it.each([
    { devtools: { blockShortcuts: "true" } },
    { integrity: { enabled: 1 } },
    { devtools: { blockShortcuts: false, threshold: 0 } },
    { devtools: { threshold: Infinity } },
    { devtools: { response: "reload" } },
    { preset: "unknown" },
    { devtools: { typo: true } },
    { unexpected: () => {} },
    { onThreat: "not a function" },
    { devtools: [] },
  ])("rejects invalid policy atomically %#", (invalid) => {
    browser();
    const guard = WebGuard.init({ devtools: { blockShortcuts: true } });
    cleanup.push(() => guard.destroy());
    const before = guard.getOptions();
    expect(() => guard.update(invalid as never)).toThrow(TypeError);
    expect(guard.getOptions()).toEqual(before);
    expect(() => WebGuard.init(invalid as never)).toThrow(TypeError);
  });
  it("rejects accessors without executing them and inherited policy objects", () => {
    const getter = vi.fn(() => true);
    expect(() =>
      WebGuard.init({
        devtools: Object.defineProperty({}, "blockShortcuts", {
          enumerable: true,
          get: getter,
        }),
      }),
    ).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
    expect(() => WebGuard.init(Object.create({ preset: "strict" }))).toThrow(
      TypeError,
    );
  });
  it("applies updated detection thresholds and callbacks while preserving editable controls", () => {
    const win = browser();
    const events: ThreatEvent[] = [];
    Object.defineProperty(win, "outerWidth", {
      value: 1400,
      configurable: true,
    });
    Object.defineProperty(win, "innerWidth", {
      value: 1000,
      configurable: true,
    });
    const guard = WebGuard.init();
    cleanup.push(() => guard.destroy());
    guard.update({
      devtools: { detect: true, threshold: 500, blockShortcuts: true },
      onThreat: (e) => events.push(e),
    });
    win.dispatchEvent(new win.Event("resize"));
    expect(events).toHaveLength(0);
    guard.update({ devtools: { threshold: 200 } });
    win.dispatchEvent(new win.Event("resize"));
    win.dispatchEvent(new win.Event("resize"));
    expect(events).toHaveLength(1);
    const key = new win.KeyboardEvent("keydown", {
      key: "F12",
      cancelable: true,
      bubbles: true,
    });
    win.document.querySelector("input")!.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    guard.update({ devtools: { detect: false } });
    win.dispatchEvent(new win.Event("resize"));
    expect(events).toHaveLength(1);
  });
  it("disabling integrity invalidates pending results even when immediately re-enabled", async () => {
    browser();
    vi.stubGlobal("crypto", webcrypto);
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", () => new Promise<Response>((r) => (resolve = r)));
    const events: ThreatEvent[] = [];
    const guard = WebGuard.init({
      integrity: { enabled: true },
      onThreat: (e) => events.push(e),
    });
    cleanup.push(() => guard.destroy());
    const pending = guard.checkIntegrity("/a", "sha384-" + "A".repeat(64));
    guard.update({ integrity: { enabled: false } });
    guard.update({ integrity: { enabled: true } });
    resolve(new Response("abc"));
    expect(await pending).toBe(false);
    expect(events).toHaveLength(0);
  });
});

describe("automatic browser guard", () => {
  it("reuses a browser-scoped instance and allows reinstall after destroy", async () => {
    const sdk = await import("../../packages/browser/src/index");
    const win = browser();
    const first = sdk.installAutoGuard({ devtools: { blockShortcuts: true } });
    cleanup.push(() => first.destroy());
    expect(sdk.getAutoGuard()).toBe(first);
    const next = sdk.installAutoGuard({ devtools: { blockContextMenu: true } });
    expect(next).toBe(first);
    expect(next.getOptions().devtools).toEqual({
      blockShortcuts: true,
      blockContextMenu: true,
    });
    first.destroy();
    expect(sdk.getAutoGuard()).toBeUndefined();
    const replacement = sdk.installAutoGuard({});
    cleanup.push(() => replacement.destroy());
    expect(replacement).not.toBe(first);
    const key = new win.KeyboardEvent("keydown", {
      key: "F12",
      cancelable: true,
    });
    win.document.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
  });
  it("keeps SSR instances isolated and does not publish globals", async () => {
    const sdk = await import("../../packages/browser/src/index");
    expect(sdk.getAutoGuard()).toBeUndefined();
    const first = sdk.installAutoGuard({ preset: "strict" }),
      second = sdk.installAutoGuard({});
    expect(first).not.toBe(second);
    expect(sdk.getAutoGuard()).toBeUndefined();
    first.destroy();
    second.destroy();
  });
  it("separates instances across window objects", async () => {
    const sdk = await import("../../packages/browser/src/index");
    browser();
    const first = sdk.installAutoGuard({});
    cleanup.push(() => first.destroy());
    browser();
    expect(sdk.getAutoGuard()).toBeUndefined();
    const second = sdk.installAutoGuard({});
    cleanup.push(() => second.destroy());
    expect(second).not.toBe(first);
  });
});

it("does not invoke or overwrite a conflicting automatic-registry accessor", async () => {
  const sdk = await import("../../packages/browser/src/index");
  const win = browser();
  const getter = vi.fn();
  Object.defineProperty(win, Symbol.for("webguard.browser.auto.v1"), {
    get: getter,
    configurable: false,
  });
  expect(sdk.getAutoGuard()).toBeUndefined();
  expect(() => sdk.installAutoGuard({})).toThrow(TypeError);
  expect(getter).not.toHaveBeenCalled();
});
it("destroy remains safe when the public registry is frozen and its window property is locked", async () => {
  const sdk = await import("../../packages/browser/src/index");
  const win = browser();
  const guard = sdk.installAutoGuard({ devtools: { blockShortcuts: true } });
  const key = Symbol.for("webguard.browser.auto.v1");
  const record = Object.getOwnPropertyDescriptor(win, key)!.value;
  Object.freeze(record);
  Object.defineProperty(win, key, { configurable: false });
  expect(() => guard.destroy()).not.toThrow();
  expect(sdk.getAutoGuard()).toBeUndefined();
});
it("a callback can replace its detection policy without losing the new transition", () => {
  const win = browser();
  Object.defineProperty(win, "outerWidth", { value: 1400, configurable: true });
  Object.defineProperty(win, "innerWidth", { value: 1000, configurable: true });
  let count = 0;
  const guard = WebGuard.init({
    devtools: { detect: true, threshold: 100 },
    onThreat: () => {
      count++;
      if (count === 1) guard.update({ devtools: { threshold: 200 } });
    },
  });
  cleanup.push(() => guard.destroy());
  win.dispatchEvent(new win.Event("resize"));
  win.dispatchEvent(new win.Event("resize"));
  expect(count).toBe(2);
});
