import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type {
  WebGuardInstance,
  WebGuardOptions,
} from "../../packages/browser/src/index";

test("bounded SDK lifecycle soak releases owned resources and preserves ordinary input", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/__sdk-lifecycle", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body><div id="anchor">Canonical</div><input aria-label="Ordinary input"><button id="ordinary">Ordinary button</button></body></html>',
    }),
  );
  await page.goto("/__sdk-lifecycle", { waitUntil: "load" });
  await page.addScriptTag({
    content: await readFile(
      new URL("../../packages/npm/dist/browser.global.js", import.meta.url),
      "utf8",
    ),
  });
  const result = await page.evaluate(async () => {
    const sdk = (
      window as unknown as {
        WebGuardSDK: {
          installAutoGuard(options: WebGuardOptions): WebGuardInstance;
          getAutoGuard(): WebGuardInstance | undefined;
        };
      }
    ).WebGuardSDK;
    // Track registrations only while SDK code runs, including its timer callbacks.
    // Test-runner/browser listeners and the native sleep below are deliberately excluded.
    let owned = false;
    const run = <T>(operation: () => T): T => {
      const previous = owned;
      owned = true;
      try {
        return operation();
      } finally {
        owned = previous;
      }
    };
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    const nativeTimeout = window.setTimeout;
    const nativeClear = window.clearTimeout;
    const NativeObserver = window.MutationObserver;
    const timers = new Set<number>();
    const observers = new Set<MutationObserver>();
    const listeners: {
      target: EventTarget;
      type: string;
      original: EventListenerOrEventListenerObject;
      wrapped: EventListener;
      capture: boolean;
    }[] = [];
    EventTarget.prototype.addEventListener = function (
      type,
      callback,
      options,
    ) {
      if (!owned || !callback)
        return nativeAdd.call(this, type, callback, options);
      const capture =
        typeof options === "boolean" ? options : Boolean(options?.capture);
      if (
        listeners.some(
          (entry) =>
            entry.target === this &&
            entry.type === type &&
            entry.original === callback &&
            entry.capture === capture,
        )
      )
        return;
      const once = typeof options === "object" && options.once;
      const entry = {
        target: this,
        type,
        original: callback,
        capture,
        wrapped: undefined as unknown as EventListener,
      };
      entry.wrapped = (event) => {
        if (once) listeners.splice(listeners.indexOf(entry), 1);
        run(() =>
          typeof callback === "function"
            ? callback.call(this, event)
            : callback.handleEvent(event),
        );
      };
      listeners.push(entry);
      return nativeAdd.call(this, type, entry.wrapped, options);
    };
    EventTarget.prototype.removeEventListener = function (
      type,
      callback,
      options,
    ) {
      const capture =
        typeof options === "boolean" ? options : Boolean(options?.capture);
      const index = listeners.findIndex(
        (entry) =>
          entry.target === this &&
          entry.type === type &&
          entry.original === callback &&
          entry.capture === capture,
      );
      const entry = index < 0 ? undefined : listeners.splice(index, 1)[0];
      return nativeRemove.call(this, type, entry?.wrapped ?? callback, options);
    };
    window.setTimeout = ((
      callback: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (!owned || typeof callback !== "function")
        return nativeTimeout(callback, delay, ...args);
      const id = nativeTimeout(() => {
        timers.delete(id);
        run(() => callback(...args));
      }, delay);
      timers.add(id);
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      timers.delete(id!);
      nativeClear(id);
    }) as typeof window.clearTimeout;
    window.MutationObserver = class extends NativeObserver {
      constructor(callback: MutationCallback) {
        super((records, observer) => run(() => callback(records, observer)));
      }
      observe(target: Node, options?: MutationObserverInit) {
        super.observe(target, options);
        if (owned) observers.add(this);
      }
      disconnect() {
        observers.delete(this);
        super.disconnect();
      }
    };
    const resources = () => ({
      listeners: listeners.length,
      timers: timers.size,
      observers: observers.size,
    });
    const check = (expected: ReturnType<typeof resources>, phase: string) => {
      const actual = resources();
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(
          `${phase}: ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`,
        );
    };
    const options: WebGuardOptions = {
      preset: "custom",
      devtools: { blockShortcuts: true, blockContextMenu: true, detect: false },
      debugging: {
        enabled: true,
        watch: true,
        intervalMs: 250,
        thresholdMs: 60000,
      },
      domIntegrity: {
        enabled: true,
        selectors: ["#anchor"],
        response: "report",
      },
    };
    let guard: WebGuardInstance | undefined;
    try {
      if (
        document.readyState !== "complete" ||
        document.visibilityState !== "visible"
      )
        throw new Error("Soak requires a fully loaded visible fixture");
      guard = run(() => sdk.installAutoGuard(options));
      const baseline = resources();
      if (
        baseline.timers !== 1 ||
        baseline.observers !== 1 ||
        baseline.listeners < 3
      )
        throw new Error(
          `Missing active resources: ${JSON.stringify(baseline)}`,
        );
      const destroyed = { listeners: 0, timers: 0, observers: 0 };
      for (let cycle = 0; cycle < 100; cycle++) {
        const current: WebGuardInstance = guard;
        if (
          run(() => sdk.installAutoGuard(options)) !== current ||
          sdk.getAutoGuard() !== current
        )
          throw new Error("Automatic owner changed");
        run(() =>
          current.update({
            debugging: { watch: false },
            domIntegrity: { enabled: false },
          }),
        );
        if (timers.size !== 0 || observers.size !== 0)
          throw new Error("OFF retained active timer/observer");
        run(() => current.update(options));
        check(baseline, `cycle ${cycle} ON`);
        run(() => current.destroy());
        check(destroyed, `cycle ${cycle} destroy`);
        if (sdk.getAutoGuard() !== undefined)
          throw new Error("Destroyed owner retained");
        guard = run(() => sdk.installAutoGuard(options));
        if (guard === current)
          throw new Error("Reinstall reused destroyed instance");
        check(baseline, `cycle ${cycle} reinstall`);
      }
      const started = performance.now();
      await new Promise<void>((resolve) => nativeTimeout(resolve, 10000));
      const state = guard.getDebuggingState();
      check(baseline, "after real-clock observation");
      if (document.visibilityState !== "visible")
        throw new Error("Fixture became hidden");
      run(() => guard!.destroy());
      check(destroyed, "final destroy");
      const context = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(context);
      const shortcut = new KeyboardEvent("keydown", {
        key: "F12",
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(shortcut);
      return {
        cycles: 100,
        elapsedMs: performance.now() - started,
        samples: state.samples,
        state: state.state,
        contextPrevented: context.defaultPrevented,
        shortcutPrevented: shortcut.defaultPrevented,
        resources: resources(),
      };
    } finally {
      try {
        run(() => guard?.destroy());
      } finally {
        EventTarget.prototype.addEventListener = nativeAdd;
        EventTarget.prototype.removeEventListener = nativeRemove;
        window.setTimeout = nativeTimeout;
        window.clearTimeout = nativeClear;
        window.MutationObserver = NativeObserver;
      }
    }
  });
  expect(result.cycles).toBe(100);
  expect(result.elapsedMs).toBeGreaterThanOrEqual(10000);
  expect(result.samples).toBeGreaterThanOrEqual(20);
  expect(result.state).toBe("watching");
  expect(result.resources).toEqual({ listeners: 0, timers: 0, observers: 0 });
  expect(result.contextPrevented).toBe(false);
  expect(result.shortcutPrevented).toBe(false);
  await page
    .getByRole("textbox", { name: "Ordinary input" })
    .fill("Input works after destroy");
  await expect(page.getByRole("textbox")).toHaveValue(
    "Input works after destroy",
  );
  await page.locator("#ordinary").click();
  await expect(page.locator("dialog[data-webguard-blocker]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
