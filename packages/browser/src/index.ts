import type { ThreatEvent } from "@webguard/shared";
export type { ThreatEvent } from "@webguard/shared";
export interface WebGuardOptions {
  preset?: "basic" | "standard" | "strict" | "custom";
  devtools?: {
    detect?: boolean;
    blockShortcuts?: boolean;
    blockContextMenu?: boolean;
    response?: "monitor" | "warn";
    threshold?: number;
  };
  integrity?: { enabled?: boolean };
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
    if (!("value" in descriptor))
      throw new TypeError(`Accessors are not supported in ${label}`);
    result[key] = descriptor.value;
  }
  return result;
}
function validatedOptions(value: unknown): WebGuardOptions {
  const input = dataObject(value, optionKeys, "WebGuard options");
  const result: WebGuardOptions = {};
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
      ["detect", "blockShortcuts", "blockContextMenu", "response", "threshold"],
      "devtools",
    );
    for (const key of ["detect", "blockShortcuts", "blockContextMenu"]) {
      if (devtools[key] !== undefined && typeof devtools[key] !== "boolean")
        throw new TypeError(`Invalid devtools ${key}`);
    }
    if (
      devtools.response !== undefined &&
      devtools.response !== "monitor" &&
      devtools.response !== "warn"
    )
      throw new TypeError("Invalid devtools response");
    if (
      devtools.threshold !== undefined &&
      (typeof devtools.threshold !== "number" ||
        !Number.isFinite(devtools.threshold) ||
        devtools.threshold <= 0)
    )
      throw new TypeError("Invalid devtools threshold");
    result.devtools = Object.fromEntries(
      Object.entries(devtools).filter(([, item]) => item !== undefined),
    );
  }
  if (input.integrity !== undefined) {
    const integrity = dataObject(input.integrity, ["enabled"], "integrity");
    if (
      integrity.enabled !== undefined &&
      typeof integrity.enabled !== "boolean"
    )
      throw new TypeError("Invalid integrity enabled");
    result.integrity =
      integrity.enabled === undefined
        ? {}
        : { enabled: integrity.enabled as boolean };
  }
  if (Object.hasOwn(input, "onThreat")) {
    if (input.onThreat !== undefined && typeof input.onThreat !== "function")
      throw new TypeError("Invalid onThreat callback");
    result.onThreat = input.onThreat as WebGuardOptions["onThreat"];
  }
  return result;
}
function snapshot(options: WebGuardOptions): WebGuardOptions {
  return {
    ...options,
    ...(options.devtools ? { devtools: { ...options.devtools } } : {}),
    ...(options.integrity ? { integrity: { ...options.integrity } } : {}),
  };
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
  function installListeners() {
    if (browserWindow && browserDocument) {
      function listen(
        target: EventTarget,
        type: string,
        callback: EventListener,
      ) {
        target.addEventListener(type, callback);
        remove.push(() => target.removeEventListener(type, callback));
      }
      if (options.devtools?.blockShortcuts === true)
        listen(browserDocument, "keydown", (raw) => {
          const event = raw as KeyboardEvent;
          if (destroyed || editableEvent(event) || event.isComposing) return;
          const key = event.key.toLowerCase();
          // Option/layout transformations can report "Dead", "ˆ", "∆" or "ç".
          // Match the physical inspect key as well as the unmodified character.
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
          event.preventDefault();
          if (!event.repeat) emit("shortcut-blocked", inspectKey ?? key);
        });
      if (options.devtools?.blockContextMenu === true)
        listen(browserDocument, "contextmenu", (event) => {
          if (destroyed || editableEvent(event)) return;
          event.preventDefault();
          emit("context-menu-blocked");
        });
      if (options.devtools?.detect === true) {
        const threshold =
          Number.isFinite(options.devtools.threshold) &&
          (options.devtools.threshold ?? 0) > 0
            ? options.devtools.threshold!
            : 160;
        const measure = () => {
          if (destroyed) return;
          const next =
            browserWindow.outerWidth - browserWindow.innerWidth > threshold ||
            browserWindow.outerHeight - browserWindow.innerHeight > threshold;
          const entering = next && !detected;
          detected = next;
          if (entering)
            emit(
              "devtools-heuristic",
              "Window dimensions suggest a docked panel; this signal can be inaccurate.",
            );
        };
        listen(browserWindow, "resize", measure);
        listen(browserWindow, "orientationchange", measure);
      }
    }
  }
  installListeners();
  return {
    update(patch) {
      if (destroyed) return;
      const validated = validatedOptions(patch);
      const next = {
        ...options,
        ...validated,
        ...(validated.devtools
          ? { devtools: { ...options.devtools, ...validated.devtools } }
          : {}),
        ...(validated.integrity
          ? { integrity: { ...options.integrity, ...validated.integrity } }
          : {}),
      };
      if (next.integrity?.enabled !== options.integrity?.enabled)
        integrityRevision++;
      if (
        next.devtools?.detect !== options.devtools?.detect ||
        next.devtools?.threshold !== options.devtools?.threshold
      )
        detected = false;
      options = next;
      if (options.integrity?.enabled !== true) abortIntegrityRequests();
      remove.splice(0).forEach((fn) => fn());
      installListeners();
    },
    getOptions() {
      return snapshot(options);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
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
      try {
        if (
          !/^sha384-[A-Za-z0-9+/]{64}$/.test(expected) ||
          typeof crypto === "undefined" ||
          !crypto.subtle ||
          typeof fetch !== "function"
        )
          return false;
        controller = new AbortController();
        integrityRequests.add(controller);
        const response = await fetch(url, { signal: controller.signal });
        if (!active()) return false;
        if (!response.ok) {
          emit("integrity-error", "Unable to fetch the requested resource.");
          return false;
        }
        const bytes = await response.arrayBuffer();
        if (!active()) return false;
        const digest = new Uint8Array(
          await crypto.subtle.digest("SHA-384", bytes),
        );
        if (!active()) return false;
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
    !("value" in slot) ||
    typeof slot.value !== "object" ||
    slot.value === null
  )
    return undefined;
  const active = Object.getOwnPropertyDescriptor(slot.value, "isActive");
  const instance = Object.getOwnPropertyDescriptor(slot.value, "instance");
  if (
    !active ||
    !("value" in active) ||
    typeof active.value !== "function" ||
    !instance ||
    !("value" in instance) ||
    typeof instance.value !== "object" ||
    instance.value === null
  )
    return undefined;
  for (const key of ["update", "getOptions", "destroy", "checkIntegrity"]) {
    const method = Object.getOwnPropertyDescriptor(instance.value, key);
    if (!method || !("value" in method) || typeof method.value !== "function")
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
      "value" in current &&
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
