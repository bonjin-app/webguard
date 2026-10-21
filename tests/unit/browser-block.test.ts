import { afterEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  WebGuard,
  type ThreatEvent,
  type WebGuardOptions,
} from "../../packages/browser/src/index";

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
  vi.unstubAllGlobals();
});
function browser() {
  const dom = new JSDOM("<input><button>Action</button>");
  vi.stubGlobal("window", dom.window);
  cleanup.push(() => dom.window.close());
  return dom.window;
}
function guard(options: WebGuardOptions) {
  const instance = WebGuard.init(options);
  cleanup.push(() => instance.destroy());
  return instance;
}
it("accepts opt-in block/page policy in SSR without side effects", () => {
  const events: ThreatEvent[] = [];
  const instance = guard({
    devtools: { response: "block", shortcutScope: "page", detect: true },
    onThreat: (e) => events.push(e),
  });
  expect(instance.getOptions().devtools?.shortcutScope).toBe("page");
  expect(events).toEqual([]);
});
it("captures inspect keys before child propagation stops, including editors only with page scope", () => {
  const win = browser();
  const input = win.document.querySelector("input")!;
  input.addEventListener("keydown", (e) => e.stopPropagation());
  const instance = guard({
    devtools: { blockShortcuts: true, shortcutScope: "page" },
  });
  const fire = (extra: KeyboardEventInit) => {
    const event = new win.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ...extra,
    });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(fire({ key: "Dead", code: "KeyI", metaKey: true, altKey: true })).toBe(
    true,
  );
  expect(fire({ key: "c", code: "KeyC", metaKey: true })).toBe(false);
  expect(fire({ key: "v", metaKey: true })).toBe(false);
  expect(fire({ key: "a" })).toBe(false);
  expect(fire({ key: "F12", isComposing: true })).toBe(false);
  instance.update({ devtools: { shortcutScope: "non-editable" } });
  expect(fire({ key: "F12" })).toBe(false);
});
it("does not claim cancellation when an inspect event cannot be canceled", () => {
  const win = browser();
  const events: ThreatEvent[] = [];
  guard({
    devtools: { blockShortcuts: true },
    onThreat: (e) => events.push(e),
  });
  win.document.dispatchEvent(
    new win.KeyboardEvent("keydown", { key: "F12", bubbles: true }),
  );
  expect(events.map((e) => e.type)).toEqual(["shortcut-unavailable"]);
});
it("reports unavailable native modal truthfully without leaving an orphan element", () => {
  const win = browser();
  const events: ThreatEvent[] = [];
  guard({
    devtools: { response: "block", blockShortcuts: true },
    onThreat: (e) => events.push(e),
  });
  for (let i = 0; i < 2; i++)
    win.document.dispatchEvent(
      new win.KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        cancelable: true,
      }),
    );
  expect(
    events.filter((e) => e.type === "page-block-unavailable"),
  ).toHaveLength(1);
  expect(events.some((e) => e.type === "page-blocked")).toBe(false);
  expect(win.document.querySelector("[data-webguard-blocker]")).toBeNull();
});
it("measures already-docked geometry on opt-in block init and respects callback policy changes", () => {
  const win = browser();
  Object.defineProperty(win, "outerWidth", {
    value: win.innerWidth + 300,
    configurable: true,
  });
  const events: ThreatEvent[] = [];
  const instance = guard({
    devtools: { detect: false },
    onThreat: (e) => {
      events.push(e);
      if (e.type === "devtools-heuristic")
        instance.update({ devtools: { response: "monitor" } });
    },
  });
  instance.update({ devtools: { response: "block", detect: true } });
  expect(events.map((e) => e.type)).toEqual(["devtools-heuristic"]);
  expect(instance.getOptions().devtools?.response).toBe("monitor");
  expect(win.document.querySelector("dialog")).toBeNull();
});
it("does not resurrect a pending blocker after callback destruction", () => {
  const win = browser();
  const events: ThreatEvent[] = [];
  const instance = guard({
    devtools: { response: "block", blockShortcuts: true },
    onThreat: (e) => {
      events.push(e);
      if (e.type === "shortcut-blocked") instance.destroy();
    },
  });
  win.document.dispatchEvent(
    new win.KeyboardEvent("keydown", {
      key: "F12",
      bubbles: true,
      cancelable: true,
    }),
  );
  win.document.dispatchEvent(new win.Event("DOMContentLoaded"));
  expect(events.map((e) => e.type)).toEqual(["shortcut-blocked"]);
  expect(win.document.querySelector("dialog")).toBeNull();
});
it("cancels body-deferred blocks on policy change or destruction", () => {
  const win = browser();
  const body = win.document.body;
  body.remove();
  const events: ThreatEvent[] = [];
  const instance = guard({
    devtools: { response: "block", blockShortcuts: true },
    onThreat: (e) => events.push(e),
  });
  win.document.dispatchEvent(
    new win.KeyboardEvent("keydown", {
      key: "F12",
      bubbles: true,
      cancelable: true,
    }),
  );
  instance.update({ devtools: { response: "monitor" } });
  win.document.documentElement.append(body);
  win.document.dispatchEvent(new win.Event("DOMContentLoaded"));
  expect(events.map((e) => e.type)).toEqual(["shortcut-blocked"]);
  expect(win.document.querySelector("dialog")).toBeNull();
});
it("validates scope atomically and returns detached policy snapshots", () => {
  const instance = guard({
    devtools: { response: "block", shortcutScope: "page" },
  });
  const previous = instance.getOptions();
  expect(() =>
    instance.update({
      devtools: { response: "monitor", shortcutScope: "all" },
    } as unknown as WebGuardOptions),
  ).toThrow(/scope/i);
  expect(() =>
    instance.update({
      devtools: {
        get shortcutScope() {
          throw new Error("must not run");
        },
      },
    } as WebGuardOptions),
  ).toThrow(/Accessors/);
  expect(instance.getOptions()).toEqual(previous);
  previous.devtools!.shortcutScope = "non-editable";
  expect(instance.getOptions().devtools?.shortcutScope).toBe("page");
});

it.each(["shortcut", "geometry"])(
  "cancels deferred %s signals when their policy is disabled",
  (reason) => {
    const win = browser();
    const body = win.document.body;
    body.remove();
    if (reason === "geometry")
      Object.defineProperty(win, "outerWidth", {
        configurable: true,
        value: win.innerWidth + 300,
      });
    const events: ThreatEvent[] = [];
    const instance = guard({
      devtools: {
        response: "block",
        detect: reason === "geometry",
        blockShortcuts: true,
      },
      onThreat: (e) => events.push(e),
    });
    if (reason === "shortcut")
      win.document.dispatchEvent(
        new win.KeyboardEvent("keydown", {
          key: "F12",
          bubbles: true,
          cancelable: true,
        }),
      );
    instance.update({ devtools: { detect: false, blockShortcuts: false } });
    win.document.documentElement.append(body);
    win.document.dispatchEvent(new win.Event("DOMContentLoaded"));
    expect(events.some((e) => e.type.startsWith("page-block"))).toBe(false);
    expect(win.document.querySelector("dialog")).toBeNull();
  },
);

it.each([true, false])(
  "retains a still-enabled pre-body shortcut across unrelated partial updates (detect %s)",
  (detect) => {
    const win = browser();
    const body = win.document.body;
    body.remove();
    const events: ThreatEvent[] = [];
    const instance = guard({
      devtools: { response: "block", blockShortcuts: true, detect },
      onThreat: (e) => events.push(e),
    });
    win.document.dispatchEvent(
      new win.KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        cancelable: true,
      }),
    );
    instance.update({ integrity: { enabled: false } });
    win.document.documentElement.append(body);
    win.document.dispatchEvent(new win.Event("DOMContentLoaded"));
    // JSDOM has no native dialog: reaching this distinct result proves the pending attempt survived.
    expect(events.map((e) => e.type)).toEqual([
      "shortcut-blocked",
      "page-block-unavailable",
    ]);
  },
);
