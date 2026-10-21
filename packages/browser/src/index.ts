import { createPageBlocker } from "./blocker";
import { abortable, readIntegrityBytes } from "./integrity";
import type { ThreatEvent } from "@webguard/shared";
export type { ThreatEvent } from "@webguard/shared";
export interface WebGuardOptions {
  preset?: "basic" | "standard" | "strict" | "custom";
  devtools?: {
    detect?: boolean;
    blockShortcuts?: boolean;
    blockContextMenu?: boolean;
    response?: "monitor" | "warn" | "block";
    /** Whole-page inspect interception is opt-in; IME composition remains exempt. */
    shortcutScope?: "non-editable" | "page";
    threshold?: number;
  };
  integrity?: {
    enabled?: boolean;
    /** Deadline for fetch, streaming and digest; default 10000, ceiling 120000 ms. */
    timeoutMs?: number;
    /** Maximum decoded bytes per resource; default 16 MiB, ceiling 64 MiB. */
    maxBytes?: number;
    /** Per-instance in-flight request cap; default 4, ceiling 16. */
    maxConcurrent?: number;
  };
  onThreat?: (event: ThreatEvent) => void;
}
export interface WebGuardInstance {
  destroy(): void;
  /** Atomically merges a validated partial policy. Destroyed instances ignore updates. */
  update(options: WebGuardOptions): void;
  /** Returns detached nested objects; callbacks retain their function identity. */
  getOptions(): WebGuardOptions;
  /** Fetches only when explicitly called and integrity.enabled is true. */
  checkIntegrity(url: string, expected: string): Promise<boolean>;
}
const optionKeys = ["preset", "devtools", "integrity", "onThreat"];
function dataObject(
  value: unknown,
  allowed: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`Invalid ${label}`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`Invalid ${label} prototype`);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key))
      throw new TypeError(`Unknown ${label} field`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!Object.hasOwn(descriptor, "value"))
      throw new TypeError(`Accessors are not supported in ${label}`);
    result[key] = descriptor.value;
  }
  return result;
}
function validatedOptions(value: unknown): WebGuardOptions {
  const input = dataObject(value, optionKeys, "WebGuard options");
  const result: WebGuardOptions = Object.create(null);
  if (input.preset !== undefined) {
    if (
      !["basic", "standard", "strict", "custom"].includes(
        input.preset as string,
      )
    )
      throw new TypeError("Invalid preset");
    result.preset = input.preset as WebGuardOptions["preset"];
  }
  if (input.devtools !== undefined) {
    const devtools = dataObject(
      input.devtools,
      [
        "detect",
        "blockShortcuts",
        "blockContextMenu",
        "response",
        "shortcutScope",
        "threshold",
      ],
      "devtools",
    );
    for (const key of ["detect", "blockShortcuts", "blockContextMenu"]) {
      if (devtools[key] !== undefined && typeof devtools[key] !== "boolean")
        throw new TypeError(`Invalid devtools ${key}`);
    }
    if (
      devtools.response !== undefined &&
      devtools.response !== "monitor" &&
      devtools.response !== "warn" &&
      devtools.response !== "block"
    )
      throw new TypeError("Invalid devtools response");
    if (
      devtools.shortcutScope !== undefined &&
      devtools.shortcutScope !== "non-editable" &&
      devtools.shortcutScope !== "page"
    )
      throw new TypeError("Invalid devtools shortcut scope");
    if (
      devtools.threshold !== undefined &&
      (typeof devtools.threshold !== "number" ||
        !Number.isFinite(devtools.threshold) ||
        devtools.threshold <= 0)
    )
      throw new TypeError("Invalid devtools threshold");
    result.devtools = Object.assign(
      Object.create(null),
      Object.fromEntries(
        Object.entries(devtools).filter(([, item]) => item !== undefined),
      ),
    );
  }
  if (input.integrity !== undefined) {
    const integrity = dataObject(
      input.integrity,
      ["enabled", "timeoutMs", "maxBytes", "maxConcurrent"],
      "integrity",
    );
    if (
      integrity.enabled !== undefined &&
      typeof integrity.enabled !== "boolean"
    )
      throw new TypeError("Invalid integrity enabled");
    for (const [key, ceiling] of [
      ["timeoutMs", 120000],
      ["maxBytes", 64 * 1024 * 1024],
      ["maxConcurrent", 16],
    ] as const) {
      const value = integrity[key];
      if (
        value !== undefined &&
        (typeof value !== "number" ||
          !Number.isSafeInteger(value) ||
          value < 1 ||
          value > ceiling)
      )
        throw new TypeError(`Invalid integrity ${key}`);
    }
    result.integrity = Object.assign(
      Object.create(null),
      Object.fromEntries(
        Object.entries(integrity).filter(([, value]) => value !== undefined),
      ),
    );
  }
  if (Object.hasOwn(input, "onThreat")) {
    if (input.onThreat !== undefined && typeof input.onThreat !== "function")
      throw new TypeError("Invalid onThreat callback");
    result.onThreat = input.onThreat as WebGuardOptions["onThreat"];
  }
  return result;
}
function snapshot(options: WebGuardOptions): WebGuardOptions {
  const copy: WebGuardOptions = Object.assign(Object.create(null), options);
  if (options.devtools)
    copy.devtools = Object.assign(Object.create(null), options.devtools);
  if (options.integrity)
    copy.integrity = Object.assign(Object.create(null), options.integrity);
  return copy;
}
function editable(target: EventTarget | null): boolean {
  const element = target as Element | null;
  return Boolean(
    element &&
    typeof element.closest === "function" &&
    element.closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
    ),
  );
}

function editableEvent(event: Event): boolean {
  return editable(event.target) || event.composedPath().some(editable);
}

function createGuard(
  initial: WebGuardOptions,
  onDestroy?: () => void,
): WebGuardInstance {
  let options = validatedOptions(initial);
  const browserWindow = typeof window !== "undefined" ? window : undefined;
  const browserDocument = browserWindow?.document;
  let integrityRevision = 0;
  const integrityRequests = new Set<AbortController>();
  const abortIntegrityRequests = () => {
    const pending = [...integrityRequests];
    integrityRequests.clear();
    for (const controller of pending) controller.abort();
  };
  let destroyed = false,
    detected = false;
  const remove: (() => void)[] = [];
  const emit = (type: string, detail?: string) => {
    if (destroyed) return;
    const event: ThreatEvent = {
      type,
      timestamp: Date.now(),
      ...(detail ? { detail } : {}),
    };
    try {
      options.onThreat?.(event);
    } catch {
      /* Host callbacks must not interrupt the app. */
    }
    if (options.devtools?.response === "warn") {
      try {
        console.warn("[WebGuard]", event.type, event.detail ?? "");
      } catch {
        /* Optional diagnostics. */
      }
    }
  };
  let policyRevision = 0;
  let blocked = false;
  let blockedReason: "shortcut" | "geometry" | undefined;
  let unavailableReported = false;
  let pendingReason: "shortcut" | "geometry" | undefined;
  let removeReady: (() => void) | undefined;
  const blocker = browserDocument
    ? createPageBlocker(browserDocument, () => measure(true))
    : undefined;
  function clearBlock(notify = true) {
    const revision = policyRevision;
    const wasBlocked = blocked;
    blocked = false;
    blockedReason = undefined;
    pendingReason = undefined;
    removeReady?.();
    removeReady = undefined;
    unavailableReported = false;
    blocker?.clear();
    if (wasBlocked && notify && !destroyed && revision === policyRevision)
      emit("page-unblocked");
  }
  function sizeSignal() {
    const threshold = options.devtools?.threshold ?? 160;
    return Boolean(
      browserWindow &&
      (browserWindow.outerWidth - browserWindow.innerWidth > threshold ||
        browserWindow.outerHeight - browserWindow.innerHeight > threshold),
    );
  }
  function blockPage(reason: "shortcut" | "geometry") {
    if (
      destroyed ||
      options.devtools?.response !== "block" ||
      !browserDocument ||
      !blocker
    )
      return;
    if (!browserDocument.body) {
      pendingReason = reason;
      if (!removeReady) {
        const ready = () => {
          const pending = pendingReason;
          pendingReason = undefined;
          removeReady?.();
          removeReady = undefined;
          if (pending === "geometry" && !sizeSignal()) return;
          if (pending) blockPage(pending);
        };
        browserDocument.addEventListener("DOMContentLoaded", ready);
        removeReady = () =>
          browserDocument.removeEventListener("DOMContentLoaded", ready);
      }
      return;
    }
    const revision = policyRevision;
    const result = blocker.show(reason);
    if (destroyed) return;
    if (revision !== policyRevision) {
      // A focus handler may have changed an unrelated option while the modal opened.
      if (
        result !== "unavailable" &&
        options.devtools?.response === "block" &&
        (reason === "geometry"
          ? options.devtools.detect
          : options.devtools.blockShortcuts)
      )
        blockPage(reason);
      return;
    }
    if (result === "shown" || (result === "existing" && !blocked)) {
      blocked = true;
      blockedReason = reason;
      unavailableReported = false;
      emit(
        "page-blocked",
        reason === "shortcut"
          ? "Inspection shortcut observed; background page interaction is restricted."
          : "Window-size heuristic; background page interaction is restricted. False positives are possible.",
      );
    } else if (result === "unavailable" && !unavailableReported) {
      blocked = false;
      unavailableReported = true;
      emit(
        "page-block-unavailable",
        "The native modal could not be opened; page interaction is not restricted.",
      );
    }
  }
  function measure(recheck = false, initial = false) {
    if (destroyed) return;
    const revision = policyRevision;
    const next = options.devtools?.detect === true && sizeSignal();
    const entering = next && !detected;
    detected = next;
    if (entering)
      emit(
        "devtools-heuristic",
        "Window dimensions suggest a docked panel; this signal can be inaccurate.",
      );
    if (destroyed || revision !== policyRevision) return;
    if (options.devtools?.response === "block") {
      if (next) blockPage("geometry");
      else if (
        initial
          ? blockedReason === "geometry" || pendingReason === "geometry"
          : recheck || blocked || pendingReason
      )
        clearBlock();
    }
  }
  function installListeners() {
    if (browserWindow && browserDocument) {
      function listen(
        target: EventTarget,
        type: string,
        callback: EventListener,
        capture = false,
      ) {
        target.addEventListener(type, callback, capture);
        remove.push(() => target.removeEventListener(type, callback, capture));
      }
      if (options.devtools?.blockShortcuts === true)
        listen(
          browserWindow,
          "keydown",
          (raw) => {
            const event = raw as KeyboardEvent;
            if (
              destroyed ||
              event.isComposing ||
              (options.devtools?.shortcutScope !== "page" &&
                editableEvent(event))
            )
              return;
            const key = event.key.toLowerCase();
            // Option/layout transformations can report "Dead", "ˆ", "∆" or "ç".
            const inspectKey = ["i", "j", "c"].includes(key)
              ? key
              : ["KeyI", "KeyJ", "KeyC"].includes(event.code)
                ? event.code.slice(3).toLowerCase()
                : undefined;
            const shortcut =
              key === "f12" ||
              (Boolean(inspectKey) &&
                ((event.ctrlKey &&
                  event.shiftKey &&
                  !event.altKey &&
                  !event.metaKey) ||
                  (event.metaKey &&
                    event.altKey &&
                    !event.ctrlKey &&
                    !event.shiftKey)));
            if (!shortcut) return;
            const revision = policyRevision;
            event.preventDefault();
            if (!event.repeat)
              emit(
                event.defaultPrevented
                  ? "shortcut-blocked"
                  : "shortcut-unavailable",
                inspectKey ?? key,
              );
            if (
              !destroyed &&
              revision === policyRevision &&
              options.devtools?.response === "block"
            )
              blockPage("shortcut");
          },
          true,
        );
      if (options.devtools?.blockContextMenu === true)
        listen(browserDocument, "contextmenu", (event) => {
          if (destroyed || editableEvent(event)) return;
          event.preventDefault();
          emit(
            event.defaultPrevented
              ? "context-menu-blocked"
              : "context-menu-unavailable",
          );
        });
      if (options.devtools?.detect === true) {
        listen(browserWindow, "resize", () => measure());
        listen(browserWindow, "orientationchange", () => measure());
      }
      // Preserve advisory mode's event-only behavior. Block mode also checks already docked panels.
      if (
        options.devtools?.response === "block" &&
        options.devtools.detect === true
      )
        measure(false, true);
    }
  }
  installListeners();
  return {
    update(patch) {
      if (destroyed) return;
      const validated = validatedOptions(patch);
      const next: WebGuardOptions = Object.assign(
        Object.create(null),
        options,
        validated,
      );
      if (validated.devtools)
        next.devtools = Object.assign(
          Object.create(null),
          options.devtools,
          validated.devtools,
        );
      if (validated.integrity)
        next.integrity = Object.assign(
          Object.create(null),
          options.integrity,
          validated.integrity,
        );
      const integrityChanged = [
        "enabled",
        "timeoutMs",
        "maxBytes",
        "maxConcurrent",
      ].some(
        (key) =>
          next.integrity?.[
            key as keyof NonNullable<WebGuardOptions["integrity"]>
          ] !==
          options.integrity?.[
            key as keyof NonNullable<WebGuardOptions["integrity"]>
          ],
      );
      if (integrityChanged) integrityRevision++;
      if (
        next.devtools?.detect !== options.devtools?.detect ||
        next.devtools?.threshold !== options.devtools?.threshold
      )
        detected = false;
      const revision = ++policyRevision;
      options = next;
      if (integrityChanged || options.integrity?.enabled !== true)
        abortIntegrityRequests();
      remove.splice(0).forEach((fn) => fn());
      if (
        (pendingReason === "geometry" && options.devtools?.detect !== true) ||
        (pendingReason === "shortcut" &&
          options.devtools?.blockShortcuts !== true)
      ) {
        pendingReason = undefined;
        removeReady?.();
        removeReady = undefined;
      }
      if (
        options.devtools?.response !== "block" ||
        (blockedReason === "geometry" && options.devtools.detect !== true) ||
        (blockedReason === "shortcut" &&
          options.devtools.blockShortcuts !== true)
      )
        clearBlock();
      if (destroyed || revision !== policyRevision) return;
      installListeners();
    },
    getOptions() {
      return snapshot(options);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearBlock(false);
      abortIntegrityRequests();
      remove.splice(0).forEach((fn) => fn());
      onDestroy?.();
    },
    async checkIntegrity(url, expected) {
      if (destroyed || options.integrity?.enabled !== true) return false;
      const revision = integrityRevision;
      const active = () =>
        !destroyed &&
        options.integrity?.enabled === true &&
        revision === integrityRevision;
      let controller: AbortController | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const policy = options.integrity;
      try {
        if (
          typeof expected !== "string" ||
          !/^sha384-[A-Za-z0-9+/]{64}$/.test(expected) ||
          typeof crypto === "undefined" ||
          !crypto.subtle ||
          typeof fetch !== "function"
        )
          return false;
        if (typeof url !== "string" || url !== url.trim()) return false;
        const resource = new URL(url, browserWindow?.location.href);
        if (
          !["http:", "https:"].includes(resource.protocol) ||
          resource.username ||
          resource.password
        )
          return false;
        if (integrityRequests.size >= (policy.maxConcurrent ?? 4)) {
          emit("integrity-error", "Concurrent verification budget exceeded.");
          return false;
        }
        controller = new AbortController();
        integrityRequests.add(controller);
        const signal = controller.signal;
        const expiresAt = performance.now() + (policy.timeoutMs ?? 10000);
        const checkDeadline = () => {
          if (signal.aborted || performance.now() >= expiresAt)
            throw new Error("Integrity verification deadline exceeded");
        };
        deadline = setTimeout(
          () => controller?.abort(),
          policy.timeoutMs ?? 10000,
        );
        const response = await abortable(
          fetch(resource.href, {
            signal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
            redirect: "error",
            cache: "no-store",
          }),
          signal,
        );
        if (!active()) return false;
        checkDeadline();
        if (!response.ok) {
          emit("integrity-error", "Unable to fetch the requested resource.");
          return false;
        }
        const bytes = await readIntegrityBytes(
          response,
          policy.maxBytes ?? 16 * 1024 * 1024,
          signal,
        );
        if (!active()) return false;
        checkDeadline();
        const digest = new Uint8Array(
          await abortable(crypto.subtle.digest("SHA-384", bytes), signal),
        );
        if (!active()) return false;
        checkDeadline();
        const actual = `sha384-${btoa(String.fromCharCode(...digest))}`;
        if (actual !== expected) {
          emit("integrity-mismatch");
          return false;
        }
        return true;
      } catch {
        if (!active()) return false;
        emit("integrity-error", "Unable to verify the requested resource.");
        return false;
      } finally {
        clearTimeout(deadline);
        if (controller) {
          integrityRequests.delete(controller);
          controller.abort();
        }
      }
    },
  };
}
function init(options: WebGuardOptions = {}): WebGuardInstance {
  return createGuard(options);
}

const autoGuardKey = Symbol.for("webguard.browser.auto.v1");
interface AutoGuardRecord {
  isActive(): boolean;
  instance: WebGuardInstance;
}
function registryHost(): Window | undefined {
  return typeof window !== "undefined" && typeof window.document !== "undefined"
    ? window
    : undefined;
}
function registryRecord(host: Window): AutoGuardRecord | undefined {
  const slot = Object.getOwnPropertyDescriptor(host, autoGuardKey);
  if (
    !slot ||
    !Object.hasOwn(slot, "value") ||
    typeof slot.value !== "object" ||
    slot.value === null
  )
    return undefined;
  const active = Object.getOwnPropertyDescriptor(slot.value, "isActive");
  const instance = Object.getOwnPropertyDescriptor(slot.value, "instance");
  if (
    !active ||
    !Object.hasOwn(active, "value") ||
    typeof active.value !== "function" ||
    !instance ||
    !Object.hasOwn(instance, "value") ||
    typeof instance.value !== "object" ||
    instance.value === null
  )
    return undefined;
  for (const key of ["update", "getOptions", "destroy", "checkIntegrity"]) {
    const method = Object.getOwnPropertyDescriptor(instance.value, key);
    if (
      !method ||
      !Object.hasOwn(method, "value") ||
      typeof method.value !== "function"
    )
      return undefined;
  }
  return slot.value as AutoGuardRecord;
}
/** Returns only the automatic guard belonging to the current browser window. */
export function getAutoGuard(): WebGuardInstance | undefined {
  const host = registryHost();
  if (!host) return undefined;
  const record = registryRecord(host);
  return record?.isActive() ? record.instance : undefined;
}
/** Installs once per window. SSR calls create isolated, unregistered instances. */
export function installAutoGuard(options: WebGuardOptions): WebGuardInstance {
  const host = registryHost();
  if (!host) return init(options);
  const record = registryRecord(host);
  if (record?.isActive()) {
    record.instance.update(options);
    return record.instance;
  }
  const slot = Object.getOwnPropertyDescriptor(host, autoGuardKey);
  if (slot && (!record || !slot.configurable))
    throw new TypeError("WebGuard automatic registry is unavailable");
  let active = true;
  const instance = createGuard(options, () => {
    active = false;
    const current = Object.getOwnPropertyDescriptor(host, autoGuardKey);
    if (
      current &&
      Object.hasOwn(current, "value") &&
      current.value === next &&
      current.configurable
    )
      Reflect.deleteProperty(host, autoGuardKey);
  });
  const next: AutoGuardRecord = Object.freeze({
    instance,
    isActive: () => active,
  });
  try {
    Object.defineProperty(host, autoGuardKey, {
      value: next,
      configurable: true,
      writable: false,
      enumerable: false,
    });
  } catch {
    instance.destroy();
    throw new TypeError("WebGuard automatic registry is unavailable");
  }
  return instance;
}
export const WebGuard = { init };
export default WebGuard;
