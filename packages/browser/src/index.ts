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
  /** Fetches only when explicitly called and integrity.enabled is true. */
  checkIntegrity(url: string, expected: string): Promise<boolean>;
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

function init(options: WebGuardOptions = {}): WebGuardInstance {
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
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    function listen(
      target: EventTarget,
      type: string,
      callback: EventListener,
    ) {
      target.addEventListener(type, callback);
      remove.push(() => target.removeEventListener(type, callback));
    }
    if (options.devtools?.blockShortcuts === true)
      listen(document, "keydown", (raw) => {
        const event = raw as KeyboardEvent;
        if (destroyed || editable(event.target) || event.isComposing) return;
        const key = event.key.toLowerCase();
        const shortcut =
          key === "f12" ||
          (["i", "j", "c"].includes(key) &&
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
        if (!event.repeat) emit("shortcut-blocked", key);
      });
    if (options.devtools?.blockContextMenu === true)
      listen(document, "contextmenu", (event) => {
        if (destroyed || editable(event.target)) return;
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
          window.outerWidth - window.innerWidth > threshold ||
          window.outerHeight - window.innerHeight > threshold;
        if (next && !detected)
          emit(
            "devtools-heuristic",
            "Window dimensions suggest a docked panel; this signal can be inaccurate.",
          );
        detected = next;
      };
      listen(window, "resize", measure);
      listen(window, "orientationchange", measure);
    }
  }
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      remove.splice(0).forEach((fn) => fn());
    },
    async checkIntegrity(url, expected) {
      if (destroyed || options.integrity?.enabled !== true) return false;
      try {
        if (
          !/^sha384-[A-Za-z0-9+/]{64}$/.test(expected) ||
          typeof crypto === "undefined" ||
          !crypto.subtle ||
          typeof fetch !== "function"
        )
          return false;
        const response = await fetch(url);
        if (destroyed) return false;
        if (!response.ok) {
          emit("integrity-error", "Unable to fetch the requested resource.");
          return false;
        }
        const bytes = await response.arrayBuffer();
        if (destroyed) return false;
        const digest = new Uint8Array(
          await crypto.subtle.digest("SHA-384", bytes),
        );
        if (destroyed) return false;
        const actual = `sha384-${btoa(String.fromCharCode(...digest))}`;
        if (actual !== expected) {
          emit("integrity-mismatch");
          return false;
        }
        return true;
      } catch {
        emit("integrity-error", "Unable to verify the requested resource.");
        return false;
      }
    },
  };
}
export const WebGuard = { init };
export default WebGuard;
