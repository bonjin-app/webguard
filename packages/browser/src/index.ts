import { createPageBlocker, type BlockReason } from "./blocker";
import {
  createDomIntegrityMonitor,
  createPauseSampler,
  createPauseWatcher,
  type DebuggingPolicy,
  type DebuggingState,
  type DomIntegrityPolicy,
} from "./runtime-signals";
export type {
  DebuggingPolicy,
  DebuggingState,
  DomIntegrityPolicy,
} from "./runtime-signals";
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
  /** Optional manual or automatic visible-page delay sampling. Disabled by default, never proof of DevTools. */
  debugging?: DebuggingPolicy;
  /** Opt-in immutable DOM anchors. Legitimate updates require an explicit rebaseline. */
  domIntegrity?: DomIntegrityPolicy;
  onThreat?: (event: ThreatEvent) => void;
}
export interface WebGuardInstance {
  destroy(): void;
  /** Atomically merges a validated partial policy. Destroyed instances ignore updates. */
  update(options: WebGuardOptions): void;
  /** Returns detached nested objects; callbacks retain their function identity. */
  getOptions(): WebGuardOptions;
  /** Read-only runtime snapshot. Does not verify build obfuscation, HTTP headers or DevTools access. */
  getStatus(): WebGuardStatus;
  /** Fetches only when explicitly called and integrity.enabled is true. */
  checkIntegrity(url: string, expected: string): Promise<boolean>;
  /** One visible-page timer sample, only when debugging.enabled. Never inserts debugger statements. */
  checkDebugging(): Promise<boolean>;
  /** Detached observability for automatic watch samples; contains no DOM contents. */
  getDebuggingState(): DebuggingState;
  /** Accepts current selected static-anchor state as the new baseline. No DOM restoration. */
  rebaselineDom(): boolean;
}
export interface WebGuardStatus {
  version: 1;
  scope: "runtime-only";
  lifecycle: "active" | "destroyed";
  environment: "browser" | "server";
  features: {
    shortcuts: "off" | "listening" | "unavailable";
    contextMenu: "off" | "listening" | "unavailable";
    geometry: "off" | "listening" | "unavailable";
    /** Ready means explicit checkIntegrity calls are supported, not that a file was verified. */
    integrity: "off" | "ready" | "unavailable";
    domIntegrity: "off" | "watching" | "mismatch" | "error" | "unavailable";
  };
  debugging: DebuggingState;
  pageProtection: {
    state: "idle" | "pending" | "shown" | "unavailable";
    reason: BlockReason | null;
  };
  coverage: {
    obfuscation: "not-verified";
    responseHeaders: "not-verified";
    devtoolsClosure: "unsupported";
  };
}
const optionKeys = [
  "preset",
  "devtools",
  "integrity",
  "debugging",
  "domIntegrity",
  "onThreat",
];
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
  for (const key of ["debugging", "domIntegrity"] as const) {
    if (input[key] === undefined) continue;
    const policy = dataObject(
      input[key],
      key === "debugging"
        ? [
            "enabled",
            "watch",
            "intervalMs",
            "response",
            "thresholdMs",
            "sampleMs",
          ]
        : ["enabled", "response", "selectors", "maxNodes", "maxBytes"],
      key,
    );
    if (policy.enabled !== undefined && typeof policy.enabled !== "boolean")
      throw new TypeError(`Invalid ${key} enabled`);
    if (
      key === "debugging" &&
      policy.watch !== undefined &&
      typeof policy.watch !== "boolean"
    )
      throw new TypeError("Invalid debugging watch");
    if (
      key === "debugging" &&
      policy.intervalMs !== undefined &&
      (typeof policy.intervalMs !== "number" ||
        !Number.isSafeInteger(policy.intervalMs) ||
        policy.intervalMs < 250 ||
        policy.intervalMs > 60000)
    )
      throw new TypeError("Invalid debugging intervalMs");
    if (
      policy.response !== undefined &&
      policy.response !== "report" &&
      policy.response !== "block"
    )
      throw new TypeError(`Invalid ${key} response`);
    for (const [field, ceiling] of key === "debugging"
      ? ([
          ["thresholdMs", 60000],
          ["sampleMs", 1000],
        ] as const)
      : ([
          ["maxNodes", 4096],
          ["maxBytes", 262144],
        ] as const)) {
      const value = policy[field];
      if (
        value !== undefined &&
        (typeof value !== "number" ||
          !Number.isSafeInteger(value) ||
          value < 1 ||
          value > ceiling)
      )
        throw new TypeError(`Invalid ${key} ${field}`);
    }
    if (key === "domIntegrity" && policy.selectors !== undefined) {
      const selectors = policy.selectors;
      if (
        !Array.isArray(selectors) ||
        Object.getPrototypeOf(selectors) !== Array.prototype ||
        selectors.length > 16
      )
        throw new TypeError("Invalid DOM selectors");
      const copy: string[] = [];
      for (const field of Reflect.ownKeys(selectors)) {
        if (field === "length") continue;
        if (
          typeof field !== "string" ||
          !/^(0|[1-9]\d*)$/.test(field) ||
          Number(field) >= selectors.length
        )
          throw new TypeError("Unknown DOM selectors field");
        const descriptor = Object.getOwnPropertyDescriptor(selectors, field)!;
        if (!Object.hasOwn(descriptor, "value"))
          throw new TypeError("DOM selector accessors are not supported");
      }
      for (let i = 0; i < selectors.length; i++) {
        const value = Object.getOwnPropertyDescriptor(
          selectors,
          String(i),
        )?.value;
        if (typeof value !== "string" || !value.trim() || value.length > 256)
          throw new TypeError("Invalid DOM selector");
        copy.push(value);
      }
      policy.selectors = copy;
    }
    result[key] = Object.assign(
      Object.create(null),
      Object.fromEntries(
        Object.entries(policy).filter(([, item]) => item !== undefined),
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
  if (options.debugging)
    copy.debugging = Object.assign(Object.create(null), options.debugging);
  if (options.domIntegrity)
    copy.domIntegrity = Object.assign(
      Object.create(null),
      options.domIntegrity,
      options.domIntegrity.selectors
        ? { selectors: [...options.domIntegrity.selectors] }
        : {},
    );
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
  beforeStart?: (instance: WebGuardInstance) => void,
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
  const subscriptions = {
    shortcuts: false,
    contextMenu: false,
    geometry: false,
  };
  function removeListeners() {
    subscriptions.shortcuts = false;
    subscriptions.contextMenu = false;
    subscriptions.geometry = false;
    remove.splice(0).forEach((fn) => fn());
  }
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
  let blockedReason: BlockReason | undefined;
  const activeReasons = new Set<BlockReason>();
  const reasonPriority: readonly BlockReason[] = [
    "dom-tamper",
    "debugging-suspicion",
    "geometry",
    "shortcut",
  ];
  let unavailableReported = false;
  let pendingReason: BlockReason | undefined;
  let removeReady: (() => void) | undefined;
  const blocker = browserDocument
    ? createPageBlocker(browserDocument, () => {
        if (blockedReason === "dom-tamper") {
          if (domMonitor?.matchesBaseline()) {
            const restoredMonitor = domMonitor;
            clearBlock(true, ["dom-tamper"]);
            if (!destroyed && domMonitor === restoredMonitor)
              restoredMonitor.rebaseline();
          }
        } else if (blockedReason === "debugging-suspicion")
          clearBlock(true, ["debugging-suspicion"]);
        else measure(true);
      })
    : undefined;
  function clearBlock(notify = true, only?: readonly BlockReason[]) {
    if (only) for (const reason of only) activeReasons.delete(reason);
    else activeReasons.clear();
    const remaining = reasonPriority.find((reason) =>
      activeReasons.has(reason),
    );
    if (remaining && !destroyed) {
      blockPage(remaining);
      return;
    }
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
  function shouldBlock(reason: BlockReason): boolean {
    if (reason === "dom-tamper")
      return (
        options.domIntegrity?.enabled === true &&
        options.domIntegrity.response === "block"
      );
    if (reason === "debugging-suspicion")
      return (
        options.debugging?.enabled === true &&
        options.debugging.response === "block"
      );
    return (
      options.devtools?.response === "block" &&
      (reason === "geometry"
        ? options.devtools.detect === true
        : options.devtools.blockShortcuts === true)
    );
  }
  function blockPage(requestedReason: BlockReason) {
    if (
      destroyed ||
      !shouldBlock(requestedReason) ||
      !browserDocument ||
      !blocker
    )
      return;
    activeReasons.add(requestedReason);
    const reason = reasonPriority.find(
      (item) => activeReasons.has(item) && shouldBlock(item),
    )!;
    if (!browserDocument.body) {
      pendingReason = reason;
      if (!removeReady) {
        const ready = () => {
          const pending = pendingReason;
          pendingReason = undefined;
          removeReady?.();
          removeReady = undefined;
          if (pending === "geometry" && !sizeSignal()) {
            clearBlock(true, ["geometry"]);
            return;
          }
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
    // A nested request owns any modal and state established by a focus callback.
    if (destroyed || result === "superseded") return;
    if (revision !== policyRevision) {
      // A focus handler may have changed an unrelated option while the modal opened.
      if (result !== "unavailable" && shouldBlock(reason)) blockPage(reason);
      return;
    }
    if (
      result === "shown" ||
      (result === "existing" && (!blocked || blockedReason !== reason))
    ) {
      blocked = true;
      blockedReason = reason;
      unavailableReported = false;
      emit(
        "page-blocked",
        reason === "shortcut"
          ? "Inspection shortcut observed; background page interaction is restricted."
          : reason === "geometry"
            ? "Window-size heuristic; background page interaction is restricted. False positives are possible."
            : reason === "dom-tamper"
              ? "A static DOM anchor changed; background page interaction is restricted."
              : "Execution pause suspicion; background page interaction is restricted. This is not proof of debugging.",
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
      else if (!initial || activeReasons.has("geometry"))
        clearBlock(true, recheck ? ["geometry", "shortcut"] : ["geometry"]);
    }
  }

  function installListeners() {
    if (destroyed) return;
    if (browserWindow && browserDocument) {
      function listen(
        target: EventTarget,
        type: string,
        callback: EventListener,
        capture = false,
        feature?: keyof typeof subscriptions,
      ) {
        target.addEventListener(type, callback, capture);
        if (feature) subscriptions[feature] = true;
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
          "shortcuts",
        );
      if (options.devtools?.blockContextMenu === true)
        listen(
          browserDocument,
          "contextmenu",
          (event) => {
            if (destroyed || editableEvent(event)) return;
            event.preventDefault();
            emit(
              event.defaultPrevented
                ? "context-menu-blocked"
                : "context-menu-unavailable",
            );
          },
          false,
          "contextMenu",
        );
      if (options.devtools?.detect === true) {
        listen(browserWindow, "resize", () => measure(), false, "geometry");
        listen(
          browserWindow,
          "orientationchange",
          () => measure(),
          false,
          "geometry",
        );
      }
      // Preserve advisory mode's event-only behavior. Block mode also checks already docked panels.
      if (
        options.devtools?.response === "block" &&
        options.devtools.detect === true
      )
        measure(false, true);
    }
  }
  const pauseSampler = createPauseSampler(browserDocument);
  let sampleRevision = 0;
  function reportPauseSuspicion() {
    if (destroyed || options.debugging?.enabled !== true) return;
    const revision = policyRevision;
    emit(
      "execution-pause-suspected",
      "A visible-page timer resumed late; debugger pause, busy CPU or scheduling may cause this. This is not proof of DevTools.",
    );
    if (
      !destroyed &&
      revision === policyRevision &&
      options.debugging?.response === "block"
    )
      blockPage("debugging-suspicion");
  }
  const pauseWatcher = createPauseWatcher(
    browserDocument,
    options.debugging ?? {},
    reportPauseSuspicion,
  );
  let domMonitor: ReturnType<typeof createDomIntegrityMonitor> | undefined;
  let runtimeRevision = 0;
  let domBaselineRevision = 0;
  function installDomMonitor() {
    domMonitor?.destroy();
    domMonitor = undefined;
    if (!browserDocument || options.domIntegrity?.enabled !== true || destroyed)
      return;
    const revision = runtimeRevision;
    const next = createDomIntegrityMonitor(
      browserDocument,
      options.domIntegrity,
      (type, detail) => {
        if (
          destroyed ||
          revision !== runtimeRevision ||
          options.domIntegrity?.enabled !== true
        )
          return;
        const before = policyRevision;
        const baselineBefore = domBaselineRevision;
        emit(type, detail);
        if (
          !destroyed &&
          before === policyRevision &&
          baselineBefore === domBaselineRevision &&
          options.domIntegrity?.response === "block"
        )
          blockPage("dom-tamper");
      },
    );
    domMonitor = next;
    next.rebaseline();
  }
  const instance: WebGuardInstance = {
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
      if (validated.debugging)
        next.debugging = Object.assign(
          Object.create(null),
          options.debugging,
          validated.debugging,
        );
      if (validated.domIntegrity)
        next.domIntegrity = Object.assign(
          Object.create(null),
          options.domIntegrity,
          validated.domIntegrity,
        );
      const sampleChanged = ["enabled", "sampleMs", "thresholdMs"].some(
        (key) =>
          next.debugging?.[key as keyof DebuggingPolicy] !==
          options.debugging?.[key as keyof DebuggingPolicy],
      );
      const watchChanged = [
        "enabled",
        "watch",
        "intervalMs",
        "thresholdMs",
      ].some(
        (key) =>
          next.debugging?.[key as keyof DebuggingPolicy] !==
          options.debugging?.[key as keyof DebuggingPolicy],
      );
      const domChanged = ["enabled", "selectors", "maxNodes", "maxBytes"].some(
        (key) =>
          JSON.stringify(
            next.domIntegrity?.[key as keyof DomIntegrityPolicy],
          ) !==
          JSON.stringify(
            options.domIntegrity?.[key as keyof DomIntegrityPolicy],
          ),
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
      if (sampleChanged) {
        sampleRevision++;
        pauseSampler.cancel();
      }
      // A response change affects the next signal, not the observation deadline or history.
      // reportPauseSuspicion reads the current options when a signal arrives.
      if (watchChanged) pauseWatcher.update(options.debugging ?? {});
      if (domChanged) {
        runtimeRevision++;
        domMonitor?.destroy();
        domMonitor = undefined;
      }
      if (integrityChanged || options.integrity?.enabled !== true)
        abortIntegrityRequests();
      removeListeners();
      const disabledReasons = [...activeReasons].filter(
        (reason) => !shouldBlock(reason),
      );
      if (disabledReasons.length) clearBlock(true, disabledReasons);
      if (destroyed || revision !== policyRevision) return;
      installListeners();
      if (domChanged && !destroyed && revision === policyRevision)
        installDomMonitor();
    },
    getOptions() {
      return snapshot(options);
    },
    getStatus() {
      const browser = Boolean(browserWindow && browserDocument);
      const listening = (
        feature: keyof typeof subscriptions,
        enabled: boolean | undefined,
      ) =>
        destroyed || enabled !== true
          ? ("off" as const)
          : !browser
            ? ("unavailable" as const)
            : subscriptions[feature]
              ? ("listening" as const)
              : ("off" as const);
      const modalReason = blocker?.getReason();
      const pageState = destroyed
        ? "idle"
        : modalReason
          ? "shown"
          : pendingReason
            ? "pending"
            : unavailableReported
              ? "unavailable"
              : "idle";
      return {
        version: 1,
        scope: "runtime-only",
        lifecycle: destroyed ? "destroyed" : "active",
        environment: browser ? "browser" : "server",
        features: {
          shortcuts: listening("shortcuts", options.devtools?.blockShortcuts),
          contextMenu: listening(
            "contextMenu",
            options.devtools?.blockContextMenu,
          ),
          geometry: listening("geometry", options.devtools?.detect),
          integrity:
            destroyed || options.integrity?.enabled !== true
              ? "off"
              : typeof fetch === "function" &&
                  typeof crypto !== "undefined" &&
                  typeof crypto.subtle?.digest === "function"
                ? "ready"
                : "unavailable",
          domIntegrity:
            destroyed || options.domIntegrity?.enabled !== true
              ? "off"
              : (domMonitor?.getState() ?? "unavailable"),
        },
        debugging: pauseWatcher.getState(),
        pageProtection: {
          state: pageState,
          reason:
            pageState === "idle"
              ? null
              : (modalReason ??
                pendingReason ??
                reasonPriority.find(
                  (reason) => activeReasons.has(reason) && shouldBlock(reason),
                ) ??
                null),
        },
        coverage: {
          obfuscation: "not-verified",
          responseHeaders: "not-verified",
          devtoolsClosure: "unsupported",
        },
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      runtimeRevision++;
      pauseSampler.cancel();
      pauseWatcher.destroy();
      domMonitor?.destroy();
      clearBlock(false);
      abortIntegrityRequests();
      removeListeners();
      onDestroy?.();
    },
    async checkDebugging() {
      if (destroyed || options.debugging?.enabled !== true) return false;
      const revision = sampleRevision;
      const suspected = await pauseSampler.sample(options.debugging);
      if (
        !suspected ||
        destroyed ||
        sampleRevision !== revision ||
        options.debugging?.enabled !== true
      )
        return false;
      reportPauseSuspicion();
      return true;
    },
    getDebuggingState() {
      return pauseWatcher.getState();
    },
    rebaselineDom() {
      if (destroyed || options.domIntegrity?.enabled !== true || !domMonitor)
        return false;
      domBaselineRevision++;
      const result = domMonitor.rebaseline();
      if (result && activeReasons.has("dom-tamper"))
        clearBlock(true, ["dom-tamper"]);
      return result;
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
  try {
    // Publish automatic ownership before any initial signal can call host code.
    beforeStart?.(instance);
    installListeners();
    // A reentrant update may already have installed the current DOM policy.
    if (!domMonitor) installDomMonitor();
  } catch (error) {
    instance.destroy();
    throw error;
  }
  return instance;
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
  for (const key of [
    "update",
    "getOptions",
    "getStatus",
    "destroy",
    "checkIntegrity",
    "checkDebugging",
    "getDebuggingState",
    "rebaselineDom",
  ]) {
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
  let next: AutoGuardRecord;
  return createGuard(
    options,
    () => {
      active = false;
      const current = Object.getOwnPropertyDescriptor(host, autoGuardKey);
      if (
        current &&
        Object.hasOwn(current, "value") &&
        current.value === next &&
        current.configurable
      )
        Reflect.deleteProperty(host, autoGuardKey);
    },
    (instance) => {
      next = Object.freeze({ instance, isActive: () => active });
      try {
        Object.defineProperty(host, autoGuardKey, {
          value: next,
          configurable: true,
          writable: false,
          enumerable: false,
        });
      } catch {
        throw new TypeError("WebGuard automatic registry is unavailable");
      }
    },
  );
}
export const WebGuard = { init };
export default WebGuard;
