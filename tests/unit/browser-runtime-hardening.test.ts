import { afterEach, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  WebGuard,
  getAutoGuard,
  installAutoGuard,
  type ThreatEvent,
  type WebGuardOptions,
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
function browser(
  markup = '<section id="anchor"><b>Private receipt</b></section><div id="other">Other</div>',
) {
  const dom = new JSDOM(markup, { url: "https://example.test/" });
  vi.stubGlobal("window", dom.window);
  Object.defineProperty(dom.window.document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  cleanup.push(() => dom.window.close());
  return dom.window;
}
function guard(options: WebGuardOptions = {}) {
  const instance = WebGuard.init(options);
  cleanup.push(() => instance.destroy());
  return instance;
}
async function mutations() {
  await Promise.resolve();
  await Promise.resolve();
}

it("keeps new runtime signals off by default and imports safely without a browser", async () => {
  const instance = guard();
  expect(await instance.checkDebugging()).toBe(false);
  expect(instance.rebaselineDom()).toBe(false);
});
it("reports only an explicit visible timer-lateness sample with no recurring debugger trap", async () => {
  browser();
  vi.useFakeTimers();
  const clock = vi.spyOn(performance, "now").mockReturnValue(100);
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: { enabled: true, sampleMs: 100, thresholdMs: 500 },
    onThreat: (e) => events.push(e),
  });
  expect(vi.getTimerCount()).toBe(0);
  const pending = instance.checkDebugging();
  expect(vi.getTimerCount()).toBe(1);
  clock.mockReturnValue(750);
  await vi.advanceTimersByTimeAsync(100);
  expect(await pending).toBe(true);
  expect(events.map((e) => e.type)).toEqual(["execution-pause-suspected"]);
  expect(events[0]?.detail).toMatch(/not proof/i);
  expect(vi.getTimerCount()).toBe(0);
});
it("suppresses timing suspicion for hidden pages, concurrent probes and stale samples", async () => {
  const win = browser();
  vi.useFakeTimers();
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: { enabled: true },
    onThreat: (e) => events.push(e),
  });
  const pending = instance.checkDebugging();
  expect(await instance.checkDebugging()).toBe(false);
  Object.defineProperty(win.document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  win.document.dispatchEvent(new win.Event("visibilitychange"));
  clock.mockReturnValue(10000);
  await vi.advanceTimersByTimeAsync(100);
  expect(await pending).toBe(false);
  Object.defineProperty(win.document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const canceled = instance.checkDebugging();
  instance.update({ debugging: { enabled: false } });
  expect(await canceled).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  instance.update({ debugging: { enabled: true } });
  const destroyed = instance.checkDebugging();
  instance.destroy();
  expect(await destroyed).toBe(false);
  expect(events).toEqual([]);
});
it.each(["text", "attribute", "remove", "replace", "ancestor"])(
  "detects selected immutable DOM %s changes without leaking contents",
  async (change) => {
    const win = browser();
    const events: ThreatEvent[] = [];
    guard({
      domIntegrity: { enabled: true, selectors: ["#anchor"] },
      onThreat: (e) => events.push(e),
    });
    const anchor = win.document.querySelector("#anchor")!;
    if (change === "text")
      anchor.querySelector("b")!.textContent = "secret changed receipt";
    if (change === "attribute")
      anchor.setAttribute("data-secret", "private customer key");
    if (change === "remove") anchor.remove();
    if (change === "replace") anchor.replaceWith(anchor.cloneNode(true));
    if (change === "ancestor") win.document.body.remove();
    await mutations();
    expect(events.map((e) => e.type)).toEqual(["dom-integrity-mismatch"]);
    expect(JSON.stringify(events)).not.toMatch(
      /receipt|customer|secret|Private/,
    );
  },
);
it("ignores unrelated DOM and deduplicates a failed baseline until explicit rebaseline", async () => {
  const win = browser();
  const events: ThreatEvent[] = [];
  const instance = guard({
    domIntegrity: { enabled: true, selectors: ["#anchor"] },
    onThreat: (e) => events.push(e),
  });
  win.document.querySelector("#other")!.textContent = "legitimate update";
  await mutations();
  expect(events).toEqual([]);
  win.document.querySelector("#anchor b")!.textContent =
    "legitimate framework update";
  expect(instance.rebaselineDom()).toBe(true);
  await mutations();
  expect(events).toEqual([]);
  win.document.querySelector("#anchor b")!.textContent = "changed";
  await mutations();
  win.document.querySelector("#anchor b")!.textContent = "changed again";
  await mutations();
  expect(events.map((e) => e.type)).toEqual(["dom-integrity-mismatch"]);
  expect(instance.rebaselineDom()).toBe(true);
  win.document.querySelector("#anchor b")!.textContent = "after rebaseline";
  await mutations();
  expect(events.map((e) => e.type)).toEqual([
    "dom-integrity-mismatch",
    "dom-integrity-mismatch",
  ]);
});
it("stops observers on disable/destroy and preserves baseline through unrelated updates", async () => {
  const win = browser();
  const events: ThreatEvent[] = [];
  const instance = guard({
    domIntegrity: { enabled: true, selectors: ["#anchor"] },
    onThreat: (e) => events.push(e),
  });
  win.document.querySelector("#anchor")!.setAttribute("title", "tampered");
  instance.update({ integrity: { enabled: false } });
  await mutations();
  expect(events.map((e) => e.type)).toEqual(["dom-integrity-mismatch"]);
  instance.update({ domIntegrity: { enabled: false } });
  win.document.querySelector("#anchor")!.setAttribute("title", "disabled");
  await mutations();
  instance.update({ domIntegrity: { enabled: true } });
  win.document
    .querySelector("#anchor")!
    .setAttribute("title", "stale callback");
  instance.destroy();
  await mutations();
  expect(events).toHaveLength(1);
});
it("fails closed for missing anchors, invalid selectors and bounded snapshot budgets", () => {
  browser();
  const events: ThreatEvent[] = [];
  const instance = guard({
    domIntegrity: { enabled: true, selectors: ["#missing"] },
    onThreat: (e) => events.push(e),
  });
  expect(instance.rebaselineDom()).toBe(false);
  expect(events.every((e) => e.type === "dom-integrity-error")).toBe(true);
  instance.update({ domIntegrity: { selectors: ["[invalid"] } });
  expect(instance.rebaselineDom()).toBe(false);
  instance.update({ domIntegrity: { selectors: ["#anchor"], maxNodes: 1 } });
  expect(instance.rebaselineDom()).toBe(false);
  instance.update({ domIntegrity: { maxNodes: 100, maxBytes: 8 } });
  expect(instance.rebaselineDom()).toBe(false);
  expect(events.some((e) => e.detail?.includes("budget"))).toBe(true);
});
it("validates policies atomically without reading accessors and returns detached selector lists", () => {
  const win = browser();
  const instance = guard({
    debugging: { enabled: true },
    domIntegrity: { enabled: true, selectors: ["#anchor"] },
  });
  const previous = instance.getOptions();
  for (const patch of [
    { debugging: { enabled: true, thresholdMs: NaN } },
    { debugging: { sampleMs: 0 } },
    { debugging: { response: "close" } },
    { domIntegrity: { selectors: [""] } },
    { domIntegrity: { selectors: new Array(17).fill("#anchor") } },
    { domIntegrity: { maxNodes: 4097 } },
    { domIntegrity: { maxBytes: 262145 } },
    { domIntegrity: Object.create({ enabled: true }) },
  ])
    expect(() => instance.update(patch as WebGuardOptions)).toThrow();
  let accessed = false;
  const selectors: string[] = [];
  Object.defineProperty(selectors, "0", {
    get() {
      accessed = true;
      return "#anchor";
    },
    configurable: true,
  });
  expect(() => instance.update({ domIntegrity: { selectors } })).toThrow(
    /accessor/i,
  );
  expect(accessed).toBe(false);
  expect(instance.getOptions()).toEqual(previous);
  previous.domIntegrity!.selectors![0] = "body";
  expect(instance.getOptions().domIntegrity?.selectors).toEqual(["#anchor"]);
  win.document.querySelector("#anchor")!.textContent = "still present";
});
it("uses the same automatic guard for new runtime methods", () => {
  browser();
  const instance = installAutoGuard({
    domIntegrity: { enabled: true, selectors: ["#anchor"] },
  });
  cleanup.push(() => instance.destroy());
  expect(getAutoGuard()).toBe(instance);
  expect(instance.rebaselineDom()).toBe(true);
});
function nativeDialogs(win: ReturnType<typeof browser>) {
  Object.defineProperty(win.HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(win.HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
}
it("keeps static-DOM block independent of geometry and only reopens after restoration or explicit rebaseline", async () => {
  const win = browser();
  nativeDialogs(win);
  const events: ThreatEvent[] = [];
  const instance = guard({
    devtools: { detect: true, response: "block" },
    domIntegrity: { enabled: true, selectors: ["#anchor"], response: "block" },
    onThreat: (e) => events.push(e),
  });
  const original = win.document.querySelector("#anchor b")!.textContent;
  win.document.querySelector("#anchor b")!.textContent = "changed";
  await mutations();
  expect(win.document.querySelector("dialog[open]")).not.toBeNull();
  expect(win.document.querySelector("dialog")?.textContent).toContain(
    "페이지 변경",
  );
  win.dispatchEvent(new win.Event("resize"));
  expect(win.document.querySelector("dialog[open]")).not.toBeNull();
  (
    win.document.querySelector("[data-webguard-recheck]") as HTMLButtonElement
  ).click();
  expect(win.document.querySelector("dialog[open]")).not.toBeNull();
  win.document.querySelector("#anchor b")!.textContent = original;
  (
    win.document.querySelector("[data-webguard-recheck]") as HTMLButtonElement
  ).click();
  expect(win.document.querySelector("dialog")).toBeNull();
  win.document.querySelector("#anchor b")!.textContent = "legitimate";
  await mutations();
  expect(win.document.querySelector("dialog[open]")).not.toBeNull();
  expect(instance.rebaselineDom()).toBe(true);
  expect(win.document.querySelector("dialog")).toBeNull();
  expect(
    events.filter((e) => e.type === "dom-integrity-mismatch"),
  ).toHaveLength(2);
});
it("does not block if the DOM signal callback disables its policy", async () => {
  const win = browser();
  nativeDialogs(win);
  const instance = guard({
    domIntegrity: { enabled: true, selectors: ["#anchor"], response: "block" },
    onThreat: (e) => {
      if (e.type === "dom-integrity-mismatch")
        instance.update({ domIntegrity: { enabled: false } });
    },
  });
  win.document.querySelector("#anchor b")!.textContent = "changed";
  await mutations();
  expect(win.document.querySelector("dialog")).toBeNull();
});
it("permits a missing CSR anchor to acquire an explicit baseline after mounting", async () => {
  const win = browser("");
  const events: ThreatEvent[] = [];
  const instance = guard({
    domIntegrity: { enabled: true, selectors: ["#anchor"] },
    onThreat: (e) => events.push(e),
  });
  const anchor = win.document.createElement("section");
  anchor.id = "anchor";
  anchor.textContent = "mounted";
  win.document.body.append(anchor);
  expect(instance.rebaselineDom()).toBe(true);
  anchor.textContent = "changed";
  await mutations();
  expect(events.map((e) => e.type)).toEqual([
    "dom-integrity-error",
    "dom-integrity-mismatch",
  ]);
});
it("respects a signal callback explicitly accepting the new legitimate DOM baseline", async () => {
  const win = browser();
  nativeDialogs(win);
  const instance = guard({
    domIntegrity: { enabled: true, selectors: ["#anchor"], response: "block" },
    onThreat: (event) => {
      if (event.type === "dom-integrity-mismatch") instance.rebaselineDom();
    },
  });
  win.document.querySelector("#anchor b")!.textContent = "accepted update";
  await mutations();
  expect(Boolean(win.document.querySelector("dialog"))).toBe(false);
});
it("does not silently accept a pending DOM change when only response mode changes", async () => {
  const win = browser();
  nativeDialogs(win);
  const events: ThreatEvent[] = [];
  const instance = guard({
    domIntegrity: { enabled: true, selectors: ["#anchor"] },
    onThreat: (event) => events.push(event),
  });
  win.document.querySelector("#anchor b")!.textContent =
    "tampered before response update";
  instance.update({ domIntegrity: { response: "block" } });
  await mutations();
  expect(events.map((e) => e.type)).toContain("dom-integrity-mismatch");
  expect(win.document.querySelector("dialog[open]")).not.toBeNull();
});
it("does not emit timing suspicion or a modal after a host callback disables debugging", async () => {
  const win = browser();
  nativeDialogs(win);
  vi.useFakeTimers();
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: { enabled: true, response: "block", thresholdMs: 100 },
    onThreat: (event) => {
      events.push(event);
      if (event.type === "execution-pause-suspected")
        instance.update({ debugging: { enabled: false } });
    },
  });
  const probe = instance.checkDebugging();
  clock.mockReturnValue(2000);
  await vi.advanceTimersByTimeAsync(100);
  expect(await probe).toBe(true);
  expect(events.map((e) => e.type)).toEqual(["execution-pause-suspected"]);
  expect(win.document.querySelector("dialog")).toBeNull();
});
it("detects attribute namespace changes even when rendered names and values are identical", async () => {
  const win = browser();
  const anchor = win.document.querySelector("#anchor")!;
  anchor.setAttributeNS("urn:first", "opaque", "value");
  const events: ThreatEvent[] = [];
  guard({
    domIntegrity: { enabled: true, selectors: ["#anchor"] },
    onThreat: (event) => events.push(event),
  });
  anchor.removeAttributeNS("urn:first", "opaque");
  anchor.setAttributeNS("urn:second", "opaque", "value");
  await mutations();
  expect(events.map((e) => e.type)).toEqual(["dom-integrity-mismatch"]);
});
it("does not expose unexpected platform exception messages in DOM events", () => {
  const win = browser();
  Object.defineProperty(win, "MutationObserver", {
    configurable: true,
    value: class {
      constructor() {
        throw new Error("private customer receipt");
      }
    },
  });
  const events: ThreatEvent[] = [];
  guard({
    domIntegrity: { enabled: true, selectors: ["#anchor"] },
    onThreat: (e) => events.push(e),
  });
  expect(events.map((e) => e.type)).toEqual(["dom-integrity-error"]);
  expect(JSON.stringify(events)).not.toContain("customer");
});
it("acknowledges a pause-suspicion modal without automatically repeating a probe", async () => {
  const win = browser();
  nativeDialogs(win);
  vi.useFakeTimers();
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: { enabled: true, response: "block", thresholdMs: 100 },
    devtools: { detect: true, response: "block" },
    onThreat: (e) => events.push(e),
  });
  const pending = instance.checkDebugging();
  clock.mockReturnValue(2000);
  await vi.advanceTimersByTimeAsync(100);
  expect(await pending).toBe(true);
  expect(
    win.document.querySelector("dialog[open]")?.getAttribute("aria-label"),
  ).toBe("실행 지연이 감지됐어요");
  win.dispatchEvent(new win.Event("resize"));
  expect(Boolean(win.document.querySelector("dialog[open]"))).toBe(true);
  (
    win.document.querySelector("[data-webguard-recheck]") as HTMLButtonElement
  ).click();
  expect(Boolean(win.document.querySelector("dialog"))).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  expect(events.map((e) => e.type)).toEqual([
    "execution-pause-suspected",
    "page-blocked",
    "page-unblocked",
  ]);
});
it.each(["shortcut-first", "dom-first"])(
  "retains independent DOM/shortcut reasons in %s order",
  async (order) => {
    const win = browser();
    nativeDialogs(win);
    const instance = guard({
      devtools: { blockShortcuts: true, response: "block" },
      domIntegrity: {
        enabled: true,
        selectors: ["#anchor"],
        response: "block",
      },
    });
    const shortcut = () =>
      win.document.dispatchEvent(
        new win.KeyboardEvent("keydown", {
          key: "F12",
          cancelable: true,
          bubbles: true,
        }),
      );
    const tamper = async () => {
      win.document.querySelector("#anchor b")!.textContent = "changed";
      await mutations();
    };
    if (order === "shortcut-first") {
      shortcut();
      await tamper();
    } else {
      await tamper();
      shortcut();
    }
    expect(
      win.document.querySelector("dialog")?.getAttribute("aria-label"),
    ).toBe("페이지 변경을 확인해 주세요");
    instance.update({
      devtools: { blockShortcuts: false, response: "monitor" },
    });
    expect(Boolean(win.document.querySelector("dialog[open]"))).toBe(true);
    (
      win.document.querySelector("[data-webguard-recheck]") as HTMLButtonElement
    ).click();
    expect(Boolean(win.document.querySelector("dialog[open]"))).toBe(true);
    instance.rebaselineDom();
    expect(Boolean(win.document.querySelector("dialog"))).toBe(false);
  },
);
it("keeps a shortcut restriction after the independent DOM baseline is restored", async () => {
  const win = browser();
  nativeDialogs(win);
  const instance = guard({
    devtools: { blockShortcuts: true, response: "block" },
    domIntegrity: { enabled: true, selectors: ["#anchor"], response: "block" },
  });
  win.document.querySelector("#anchor b")!.textContent = "changed";
  await mutations();
  win.document.dispatchEvent(
    new win.KeyboardEvent("keydown", {
      key: "F12",
      cancelable: true,
      bubbles: true,
    }),
  );
  instance.rebaselineDom();
  expect(win.document.querySelector("dialog")?.getAttribute("aria-label")).toBe(
    "개발자도구를 닫아 주세요",
  );
  (
    win.document.querySelector("[data-webguard-recheck]") as HTMLButtonElement
  ).click();
  expect(Boolean(win.document.querySelector("dialog"))).toBe(false);
});
it("retains a timing-suspicion restriction when the higher-priority DOM cause is accepted", async () => {
  const win = browser();
  nativeDialogs(win);
  vi.useFakeTimers();
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const instance = guard({
    debugging: { enabled: true, response: "block", thresholdMs: 100 },
    domIntegrity: { enabled: true, selectors: ["#anchor"], response: "block" },
  });
  win.document.querySelector("#anchor b")!.textContent = "changed";
  await mutations();
  const probe = instance.checkDebugging();
  clock.mockReturnValue(2000);
  await vi.advanceTimersByTimeAsync(100);
  expect(await probe).toBe(true);
  expect(win.document.querySelector("dialog")?.getAttribute("aria-label")).toBe(
    "페이지 변경을 확인해 주세요",
  );
  instance.rebaselineDom();
  expect(win.document.querySelector("dialog")?.getAttribute("aria-label")).toBe(
    "실행 지연이 감지됐어요",
  );
  (
    win.document.querySelector("[data-webguard-recheck]") as HTMLButtonElement
  ).click();
  expect(Boolean(win.document.querySelector("dialog"))).toBe(false);
});
it("retains independent reasons while waiting for a body to become available", async () => {
  const win = browser();
  nativeDialogs(win);
  const anchor = win.document.createElement("meta");
  anchor.id = "head-anchor";
  anchor.setAttribute("content", "original");
  win.document.head.append(anchor);
  const body = win.document.body;
  body.remove();
  const instance = guard({
    devtools: { blockShortcuts: true, response: "block" },
    domIntegrity: {
      enabled: true,
      selectors: ["#head-anchor"],
      response: "block",
    },
  });
  win.document.dispatchEvent(
    new win.KeyboardEvent("keydown", {
      key: "F12",
      cancelable: true,
      bubbles: true,
    }),
  );
  anchor.setAttribute("content", "changed");
  await mutations();
  win.document.documentElement.append(body);
  win.document.dispatchEvent(new win.Event("DOMContentLoaded"));
  expect(win.document.querySelector("dialog")?.getAttribute("aria-label")).toBe(
    "페이지 변경을 확인해 주세요",
  );
  instance.update({ domIntegrity: { enabled: false } });
  expect(win.document.querySelector("dialog")?.getAttribute("aria-label")).toBe(
    "개발자도구를 닫아 주세요",
  );
  instance.update({ devtools: { response: "monitor" } });
  expect(Boolean(win.document.querySelector("dialog"))).toBe(false);
});
