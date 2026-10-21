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
function browser(visible = true) {
  const dom = new JSDOM('<div id="anchor">Original</div>');
  vi.stubGlobal("window", dom.window);
  Object.defineProperty(dom.window.document, "visibilityState", {
    configurable: true,
    value: visible ? "visible" : "hidden",
  });
  cleanup.push(() => dom.window.close());
  return dom.window;
}
function guard(options: WebGuardOptions = {}) {
  const instance = WebGuard.init(options);
  cleanup.push(() => instance.destroy());
  return instance;
}
function clock() {
  vi.useFakeTimers();
  return vi.spyOn(performance, "now").mockReturnValue(0);
}
function visibility(win: ReturnType<typeof browser>, visible: boolean) {
  Object.defineProperty(win.document, "visibilityState", {
    configurable: true,
    value: visible ? "visible" : "hidden",
  });
  win.document.dispatchEvent(new win.Event("visibilitychange"));
}
function dialogs(win: ReturnType<typeof browser>) {
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

it("keeps automatic sampling opt-in and exposes detached SSR/off/manual snapshots", () => {
  clock();
  const off = guard();
  expect(off.getDebuggingState()).toEqual({
    state: "off",
    samples: 0,
    lastCheckedAt: null,
    lastDelayMs: null,
    lastSuspicionAt: null,
  });
  const ssr = guard({ debugging: { enabled: true, watch: true } });
  expect(ssr.getDebuggingState().state).toBe("unavailable");
  expect(vi.getTimerCount()).toBe(0);
  browser();
  const manual = guard({ debugging: { enabled: true } });
  expect(manual.getDebuggingState().state).toBe("manual");
  expect(vi.getTimerCount()).toBe(0);
  const snapshot = manual.getDebuggingState();
  snapshot.samples = 99;
  snapshot.state = "off";
  expect(manual.getDebuggingState().samples).toBe(0);
  expect(manual.getDebuggingState().state).toBe("manual");
});
it("starts continuous full-interval observation from configuration alone, with no normal events", async () => {
  browser();
  const time = clock();
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: { enabled: true, watch: true, intervalMs: 1000 },
    onThreat: (e) => events.push(e),
  });
  expect(instance.getDebuggingState().state).toBe("watching");
  expect(vi.getTimerCount()).toBe(1);
  time.mockReturnValue(1000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(instance.getDebuggingState()).toMatchObject({
    samples: 1,
    lastDelayMs: 0,
    lastSuspicionAt: null,
  });
  expect(instance.getDebuggingState().lastCheckedAt).toEqual(
    expect.any(Number),
  );
  expect(vi.getTimerCount()).toBe(1);
  time.mockReturnValue(2000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(instance.getDebuggingState().samples).toBe(2);
  expect(events).toEqual([]);
});
it("detects lateness anywhere across the interval and deduplicates until a normal deadline", async () => {
  browser();
  const time = clock();
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: {
      enabled: true,
      watch: true,
      intervalMs: 1000,
      thresholdMs: 500,
    },
    onThreat: (e) => events.push(e),
  });
  time.mockReturnValue(1700);
  await vi.advanceTimersByTimeAsync(1000);
  expect(events.map((e) => e.type)).toEqual(["execution-pause-suspected"]);
  expect(instance.getDebuggingState()).toMatchObject({
    samples: 1,
    lastDelayMs: 700,
  });
  const first = instance.getDebuggingState().lastSuspicionAt;
  time.mockReturnValue(3500);
  await vi.advanceTimersByTimeAsync(1000);
  expect(events).toHaveLength(1);
  time.mockReturnValue(4500);
  await vi.advanceTimersByTimeAsync(1000);
  time.mockReturnValue(6100);
  await vi.advanceTimersByTimeAsync(1000);
  expect(events).toHaveLength(2);
  expect(instance.getDebuggingState().lastSuspicionAt).not.toBe(first);
  expect(vi.getTimerCount()).toBe(1);
});
it("arms the following deadline before notifying host code", async () => {
  browser();
  const time = clock();
  const timers: number[] = [];
  guard({
    debugging: { enabled: true, watch: true, thresholdMs: 100 },
    onThreat: () => timers.push(vi.getTimerCount()),
  });
  time.mockReturnValue(1500);
  await vi.advanceTimersByTimeAsync(1000);
  expect(timers).toEqual([1]);
});
it("suspends immediately while hidden and restarts without recycling hidden-page delay", async () => {
  const win = browser();
  const time = clock();
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: { enabled: true, watch: true },
    onThreat: (e) => events.push(e),
  });
  visibility(win, false);
  expect(instance.getDebuggingState().state).toBe("suspended");
  expect(vi.getTimerCount()).toBe(0);
  time.mockReturnValue(100000);
  await vi.advanceTimersByTimeAsync(100000);
  expect(instance.getDebuggingState().samples).toBe(0);
  visibility(win, true);
  expect(instance.getDebuggingState().state).toBe("watching");
  time.mockReturnValue(101000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(instance.getDebuggingState()).toMatchObject({
    samples: 1,
    lastDelayMs: 0,
  });
  expect(events).toEqual([]);
});
it("does not start a timer for an initially hidden page", async () => {
  const win = browser(false);
  const time = clock();
  const instance = guard({ debugging: { enabled: true, watch: true } });
  expect(instance.getDebuggingState().state).toBe("suspended");
  expect(vi.getTimerCount()).toBe(0);
  time.mockReturnValue(9000);
  visibility(win, true);
  time.mockReturnValue(10000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(instance.getDebuggingState()).toMatchObject({
    samples: 1,
    lastDelayMs: 0,
  });
});
it("drops pre-pagehide deadlines and waits for pageshow, even if visibility events arrive first", async () => {
  const win = browser();
  const time = clock();
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: { enabled: true, watch: true },
    onThreat: (e) => events.push(e),
  });
  win.dispatchEvent(new win.Event("pagehide"));
  expect(instance.getDebuggingState().state).toBe("suspended");
  expect(vi.getTimerCount()).toBe(0);
  time.mockReturnValue(10000);
  visibility(win, true);
  expect(vi.getTimerCount()).toBe(0);
  win.dispatchEvent(new win.Event("pageshow"));
  expect(vi.getTimerCount()).toBe(1);
  time.mockReturnValue(11000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(instance.getDebuggingState()).toMatchObject({
    samples: 1,
    lastDelayMs: 0,
  });
  expect(events).toEqual([]);
});
it("preserves an in-flight deadline through unrelated updates and restarts only relevant policy", async () => {
  browser();
  const time = clock();
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: { enabled: true, watch: true, thresholdMs: 500 },
    onThreat: (e) => events.push(e),
  });
  time.mockReturnValue(500);
  await vi.advanceTimersByTimeAsync(500);
  instance.update({ integrity: { enabled: false } });
  instance.update({ debugging: { sampleMs: 50 } });
  time.mockReturnValue(1600);
  await vi.advanceTimersByTimeAsync(500);
  expect(events.map((e) => e.type)).toEqual(["execution-pause-suspected"]);
  instance.update({ debugging: { intervalMs: 500, thresholdMs: 100 } });
  expect(instance.getDebuggingState().samples).toBe(0);
  time.mockReturnValue(2100);
  await vi.advanceTimersByTimeAsync(500);
  expect(instance.getDebuggingState()).toMatchObject({
    samples: 1,
    lastDelayMs: 0,
  });
});
it("cancels automatic work on watch off, enabled off and destroy", async () => {
  browser();
  const time = clock();
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: { enabled: true, watch: true },
    onThreat: (e) => events.push(e),
  });
  instance.update({ debugging: { watch: false } });
  expect(instance.getDebuggingState().state).toBe("manual");
  expect(vi.getTimerCount()).toBe(0);
  instance.update({ debugging: { watch: true } });
  expect(vi.getTimerCount()).toBe(1);
  instance.update({ debugging: { enabled: false } });
  expect(instance.getDebuggingState().state).toBe("off");
  expect(vi.getTimerCount()).toBe(0);
  instance.update({ debugging: { enabled: true } });
  instance.destroy();
  time.mockReturnValue(100000);
  await vi.advanceTimersByTimeAsync(100000);
  expect(instance.getDebuggingState().state).toBe("off");
  expect(vi.getTimerCount()).toBe(0);
  expect(events).toEqual([]);
});
it("preserves the active deadline and signal history when only response changes", async () => {
  const win = browser();
  dialogs(win);
  const time = clock();
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: {
      enabled: true,
      watch: true,
      intervalMs: 1000,
      thresholdMs: 100,
      response: "report",
    },
    onThreat: (event) => events.push(event),
  });
  time.mockReturnValue(1500);
  await vi.advanceTimersByTimeAsync(1000);
  const observed = instance.getDebuggingState();
  expect(observed.samples).toBe(1);
  expect(observed.lastSuspicionAt).not.toBeNull();
  time.mockReturnValue(2000);
  await vi.advanceTimersByTimeAsync(500);
  instance.update({ debugging: { response: "block" } });
  expect(instance.getDebuggingState()).toEqual(observed);
  expect(vi.getTimerCount()).toBe(1);
  time.mockReturnValue(2500);
  await vi.advanceTimersByTimeAsync(500);
  expect(instance.getDebuggingState()).toMatchObject({
    samples: 2,
    lastDelayMs: 0,
    lastSuspicionAt: observed.lastSuspicionAt,
  });
  time.mockReturnValue(4500);
  await vi.advanceTimersByTimeAsync(1000);
  expect(instance.getDebuggingState().samples).toBe(3);
  expect(events.map((event) => event.type)).toEqual([
    "execution-pause-suspected",
    "execution-pause-suspected",
    "page-blocked",
  ]);
  expect(win.document.querySelector("dialog[open]")).not.toBeNull();
  const blocked = instance.getDebuggingState();
  instance.update({ debugging: { response: "report" } });
  expect(instance.getDebuggingState()).toEqual(blocked);
  expect(win.document.querySelector("dialog")).toBeNull();
  time.mockReturnValue(5500);
  await vi.advanceTimersByTimeAsync(1000);
  time.mockReturnValue(7500);
  await vi.advanceTimersByTimeAsync(1000);
  expect(instance.getDebuggingState().samples).toBe(5);
  expect(
    events.filter((event) => event.type === "execution-pause-suspected"),
  ).toHaveLength(3);
  expect(win.document.querySelector("dialog")).toBeNull();
});
it.each(["off", "destroy"])(
  "does not rearm or block after a suspicion callback performs %s",
  async (action) => {
    const win = browser();
    dialogs(win);
    const time = clock();
    const events: ThreatEvent[] = [];
    const instance = guard({
      debugging: {
        enabled: true,
        watch: true,
        response: "block",
        thresholdMs: 100,
      },
      onThreat: (e) => {
        events.push(e);
        if (e.type === "execution-pause-suspected") {
          if (action === "off")
            instance.update({ debugging: { watch: false } });
          else instance.destroy();
        }
      },
    });
    time.mockReturnValue(2000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events.map((e) => e.type)).toEqual(["execution-pause-suspected"]);
    expect(vi.getTimerCount()).toBe(0);
    expect(Boolean(win.document.querySelector("dialog"))).toBe(false);
  },
);
it("keeps the manual sampler independent and uses at most two pending timers", async () => {
  browser();
  const time = clock();
  const instance = guard({
    debugging: { enabled: true, watch: true, thresholdMs: 100 },
  });
  const manual = instance.checkDebugging();
  expect(vi.getTimerCount()).toBe(2);
  time.mockReturnValue(100);
  await vi.advanceTimersByTimeAsync(100);
  expect(await manual).toBe(false);
  expect(vi.getTimerCount()).toBe(1);
  expect(instance.getDebuggingState().samples).toBe(0);
  time.mockReturnValue(1000);
  await vi.advanceTimersByTimeAsync(900);
  expect(instance.getDebuggingState().samples).toBe(1);
});
it.each(["report", "block"] as const)(
  "preserves a pending manual sample and applies the latest %s response",
  async (response) => {
    const win = browser();
    dialogs(win);
    const time = clock();
    const events: ThreatEvent[] = [];
    const instance = guard({
      debugging: {
        enabled: true,
        sampleMs: 100,
        thresholdMs: 100,
        response: response === "report" ? "block" : "report",
      },
      onThreat: (event) => events.push(event),
    });
    const manual = instance.checkDebugging();
    instance.update({ debugging: { response } });
    expect(vi.getTimerCount()).toBe(1);
    time.mockReturnValue(500);
    await vi.advanceTimersByTimeAsync(100);
    expect(await manual).toBe(true);
    expect(events.map((event) => event.type)).toEqual(
      response === "block"
        ? ["execution-pause-suspected", "page-blocked"]
        : ["execution-pause-suspected"],
    );
    expect(Boolean(win.document.querySelector("dialog[open]"))).toBe(
      response === "block",
    );
  },
);
it("keeps a pending manual sample through automatic-watch-only and no-op updates", async () => {
  browser();
  const time = clock();
  const instance = guard({
    debugging: { enabled: true, sampleMs: 100, thresholdMs: 100 },
  });
  const manual = instance.checkDebugging();
  instance.update({ debugging: { watch: true, intervalMs: 500 } });
  instance.update({ debugging: { sampleMs: 100, thresholdMs: 100 } });
  expect(vi.getTimerCount()).toBe(2);
  time.mockReturnValue(500);
  await vi.advanceTimersByTimeAsync(100);
  expect(await manual).toBe(true);
  expect(instance.getDebuggingState().samples).toBe(0);
});
it.each([{ enabled: false }, { sampleMs: 200 }, { thresholdMs: 200 }])(
  "cancels a pending manual sample for relevant policy change %o",
  async (patch) => {
    browser();
    const time = clock();
    const events: ThreatEvent[] = [];
    const instance = guard({
      debugging: { enabled: true, sampleMs: 100, thresholdMs: 100 },
      onThreat: (event) => events.push(event),
    });
    const manual = instance.checkDebugging();
    instance.update({ debugging: patch });
    expect(await manual).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    time.mockReturnValue(500);
    await vi.advanceTimersByTimeAsync(100);
    expect(events).toEqual([]);
  },
);
it("validates interval and watch atomically without accessing getter policies", () => {
  browser();
  clock();
  const instance = guard({
    debugging: { enabled: true, watch: true, intervalMs: 500 },
  });
  const previous = instance.getOptions();
  for (const intervalMs of [0, 249, 60001, 250.5, NaN, Infinity])
    expect(() => instance.update({ debugging: { intervalMs } })).toThrow(
      /interval/i,
    );
  expect(() =>
    instance.update({
      debugging: { watch: "yes" },
    } as unknown as WebGuardOptions),
  ).toThrow(/watch/i);
  let called = false;
  expect(() =>
    instance.update({
      debugging: {
        get watch() {
          called = true;
          return true;
        },
      },
    }),
  ).toThrow(/accessor/i);
  expect(called).toBe(false);
  expect(instance.getOptions()).toEqual(previous);
  expect(vi.getTimerCount()).toBe(1);
  instance.update({ debugging: { intervalMs: 250 } });
  instance.update({ debugging: { intervalMs: 60000 } });
  expect(instance.getOptions().debugging?.intervalMs).toBe(60000);
});
it("exposes automatic watcher state from the same registered singleton", () => {
  browser();
  clock();
  const instance = installAutoGuard({
    debugging: { enabled: true, watch: true },
  });
  cleanup.push(() => instance.destroy());
  expect(getAutoGuard()).toBe(instance);
  expect(getAutoGuard()?.getDebuggingState().state).toBe("watching");
  expect(vi.getTimerCount()).toBe(1);
});
it("automatically opens an optional modal while keeping watch active after acknowledgment", async () => {
  const win = browser();
  dialogs(win);
  const time = clock();
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: {
      enabled: true,
      watch: true,
      response: "block",
      thresholdMs: 100,
    },
    onThreat: (event) => events.push(event),
  });
  time.mockReturnValue(1500);
  await vi.advanceTimersByTimeAsync(1000);
  expect(win.document.querySelector("dialog")?.getAttribute("aria-label")).toBe(
    "실행 지연이 감지됐어요",
  );
  expect(events.map((e) => e.type)).toEqual([
    "execution-pause-suspected",
    "page-blocked",
  ]);
  (
    win.document.querySelector("[data-webguard-recheck]") as HTMLButtonElement
  ).click();
  expect(Boolean(win.document.querySelector("dialog"))).toBe(false);
  expect(instance.getDebuggingState().state).toBe("watching");
  expect(vi.getTimerCount()).toBe(1);
  time.mockReturnValue(2500);
  await vi.advanceTimersByTimeAsync(1000);
  expect(instance.getDebuggingState().samples).toBe(2);
  expect(
    events.filter((e) => e.type === "execution-pause-suspected"),
  ).toHaveLength(1);
});
it("requires enabled as well as watch before automatically scheduling", () => {
  browser();
  clock();
  const instance = guard({ debugging: { watch: true } });
  expect(instance.getDebuggingState().state).toBe("off");
  expect(vi.getTimerCount()).toBe(0);
  instance.update({ debugging: { enabled: true } });
  expect(instance.getDebuggingState().state).toBe("watching");
  expect(vi.getTimerCount()).toBe(1);
});
it("preserves observed pagehide suspension through off/on and visible events until pageshow", async () => {
  const win = browser();
  const time = clock();
  const events: ThreatEvent[] = [];
  const instance = guard({
    debugging: { enabled: true, watch: true },
    onThreat: (e) => events.push(e),
  });
  win.dispatchEvent(new win.Event("pagehide"));
  instance.update({ debugging: { watch: false } });
  instance.update({ debugging: { watch: true } });
  visibility(win, true);
  expect(instance.getDebuggingState().state).toBe("suspended");
  expect(vi.getTimerCount()).toBe(0);
  time.mockReturnValue(50000);
  await vi.advanceTimersByTimeAsync(50000);
  expect(instance.getDebuggingState().samples).toBe(0);
  expect(events).toEqual([]);
  win.dispatchEvent(new win.Event("pageshow"));
  time.mockReturnValue(51000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(instance.getDebuggingState()).toMatchObject({
    state: "watching",
    samples: 1,
    lastDelayMs: 0,
  });
});
it("observes pageshow while watch is off so re-enabling does not remain suspended", async () => {
  const win = browser();
  const time = clock();
  const instance = guard({ debugging: { enabled: true, watch: true } });
  win.dispatchEvent(new win.Event("pagehide"));
  instance.update({ debugging: { watch: false } });
  time.mockReturnValue(8000);
  win.dispatchEvent(new win.Event("pageshow"));
  expect(vi.getTimerCount()).toBe(0);
  instance.update({ debugging: { watch: true } });
  time.mockReturnValue(9000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(instance.getDebuggingState()).toMatchObject({
    state: "watching",
    samples: 1,
    lastDelayMs: 0,
  });
});
it("keeps lifecycle knowledge after first activation when pagehide happens while watch is off", () => {
  const win = browser();
  clock();
  const instance = guard({ debugging: { enabled: true, watch: true } });
  instance.update({ debugging: { watch: false } });
  win.dispatchEvent(new win.Event("pagehide"));
  instance.update({ debugging: { watch: true } });
  expect(instance.getDebuggingState().state).toBe("suspended");
  expect(vi.getTimerCount()).toBe(0);
  win.dispatchEvent(new win.Event("pageshow"));
  expect(instance.getDebuggingState().state).toBe("watching");
  expect(vi.getTimerCount()).toBe(1);
});
it("retains only two lifecycle handlers after first activation and removes all on destroy", () => {
  const win = browser();
  clock();
  const addWindow = vi.spyOn(win, "addEventListener");
  const removeWindow = vi.spyOn(win, "removeEventListener");
  const addDocument = vi.spyOn(win.document, "addEventListener");
  const removeDocument = vi.spyOn(win.document, "removeEventListener");
  const instance = guard({ debugging: { enabled: true } });
  const count = (calls: readonly (readonly unknown[])[], type: string) =>
    calls.filter(([event]) => event === type).length;
  expect(count(addWindow.mock.calls, "pagehide")).toBe(0);
  expect(count(addWindow.mock.calls, "pageshow")).toBe(0);
  instance.update({ debugging: { watch: true } });
  for (let i = 0; i < 3; i++) {
    instance.update({ debugging: { watch: false } });
    expect(vi.getTimerCount()).toBe(0);
    expect(
      count(addDocument.mock.calls, "visibilitychange") -
        count(removeDocument.mock.calls, "visibilitychange"),
    ).toBe(0);
    instance.update({ debugging: { watch: true } });
    expect(
      count(addDocument.mock.calls, "visibilitychange") -
        count(removeDocument.mock.calls, "visibilitychange"),
    ).toBe(1);
  }
  expect(count(addWindow.mock.calls, "pagehide")).toBe(1);
  expect(count(addWindow.mock.calls, "pageshow")).toBe(1);
  expect(count(removeWindow.mock.calls, "pagehide")).toBe(0);
  expect(count(removeWindow.mock.calls, "pageshow")).toBe(0);
  instance.destroy();
  expect(count(removeWindow.mock.calls, "pagehide")).toBe(1);
  expect(count(removeWindow.mock.calls, "pageshow")).toBe(1);
  expect(
    count(addDocument.mock.calls, "visibilitychange") -
      count(removeDocument.mock.calls, "visibilitychange"),
  ).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
