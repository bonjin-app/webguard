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
