export interface DebuggingPolicy {
  enabled?: boolean;
  /** Continuously watch visible-page timer deadlines. Opt-in; does not inject debugger statements. */
  watch?: boolean;
  /** Full timer deadline interval; default 1000, inclusive range 250..60000 ms. */
  intervalMs?: number;
  response?: "report" | "block";
  /** Extra timer delay required for a suspicion; default 1500, ceiling 60000 ms. */
  thresholdMs?: number;
  /** One explicit sample's requested delay; default 100, ceiling 1000 ms. */
  sampleMs?: number;
}
export interface DomIntegrityPolicy {
  enabled?: boolean;
  /** Up to 16 selectors (256 characters each), selecting the first matching static anchor. */
  selectors?: string[];
  response?: "report" | "block";
  /** Aggregate nodes across all selected subtrees; default 1000, ceiling 4096. */
  maxNodes?: number;
  /** Aggregate UTF-8 serialized snapshot budget; default 65536, ceiling 262144 bytes. */
  maxBytes?: number;
}

/** A timer-lateness signal, never proof of debugging. No debugger statements or repeating traps. */
export function createPauseSampler(document: Document | undefined) {
  let cancel: (() => void) | undefined;
  return {
    cancel() {
      cancel?.();
    },
    sample(policy: DebuggingPolicy): Promise<boolean> {
      if (!document || document.visibilityState !== "visible" || cancel)
        return Promise.resolve(false);
      return new Promise((resolve) => {
        const delay = policy.sampleMs ?? 100;
        const started = performance.now();
        let visible = true;
        const visibility = () => {
          if (document.visibilityState !== "visible") visible = false;
        };
        const finish = (suspected: boolean) => {
          clearTimeout(timer);
          document.removeEventListener("visibilitychange", visibility);
          cancel = undefined;
          resolve(suspected);
        };
        document.addEventListener("visibilitychange", visibility);
        const timer = setTimeout(
          () =>
            finish(
              visible &&
                document.visibilityState === "visible" &&
                performance.now() - started - delay >=
                  (policy.thresholdMs ?? 1500),
            ),
          delay,
        );
        cancel = () => finish(false);
      });
    },
  };
}

export interface DebuggingState {
  state: "off" | "manual" | "watching" | "suspended" | "unavailable";
  /** Watch samples only, saturating at Number.MAX_SAFE_INTEGER. */
  samples: number;
  lastCheckedAt: number | null;
  /** Extra delay beyond the requested full interval, never proof of debugging. */
  lastDelayMs: number | null;
  lastSuspicionAt: number | null;
}

/** One continuous deadline while visible. A paused browser can only report after resuming. */
export function createPauseWatcher(
  document: Document | undefined,
  initial: DebuggingPolicy,
  suspicion: () => void,
) {
  let policy = initial;
  let destroyed = false;
  let pageActive = true;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latched = false;
  let removeListeners: (() => void) | undefined;
  let removeLifecycle: (() => void) | undefined;
  const fresh = () => ({
    samples: 0,
    lastCheckedAt: null as number | null,
    lastDelayMs: null as number | null,
    lastSuspicionAt: null as number | null,
  });
  let stats = fresh();
  const enabled = () =>
    !destroyed && policy.enabled === true && policy.watch === true;
  const available = () =>
    Boolean(
      document?.defaultView &&
      typeof performance !== "undefined" &&
      typeof performance.now === "function",
    );
  const visible = () => document?.visibilityState === "visible";
  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
    revision++;
  };
  function schedule() {
    if (
      !enabled() ||
      !available() ||
      !visible() ||
      !pageActive ||
      timer !== undefined
    )
      return;
    const generation = revision;
    const started = performance.now();
    const interval = policy.intervalMs ?? 1000;
    timer = setTimeout(() => {
      if (destroyed || generation !== revision) return;
      timer = undefined;
      if (!enabled() || !visible() || !pageActive) {
        latched = false;
        return;
      }
      const elapsed = performance.now() - started;
      if (!Number.isFinite(elapsed)) {
        schedule();
        return;
      }
      const delay = Math.min(
        Number.MAX_SAFE_INTEGER,
        Math.max(0, elapsed - interval),
      );
      stats.samples = Math.min(Number.MAX_SAFE_INTEGER, stats.samples + 1);
      stats.lastCheckedAt = Date.now();
      stats.lastDelayMs = delay;
      const late = delay >= (policy.thresholdMs ?? 1500);
      const notify = late && !latched;
      latched = late;
      if (notify) stats.lastSuspicionAt = stats.lastCheckedAt;
      // Cover host callback execution too. Reentrant update/destroy cancels this next deadline.
      schedule();
      if (notify && !destroyed && generation === revision) suspicion();
    }, interval);
  }
  const visibility = () => {
    clearTimer();
    latched = false;
    if (visible() && pageActive) schedule();
  };
  const pagehide = () => {
    pageActive = false;
    clearTimer();
    latched = false;
  };
  const pageshow = () => {
    pageActive = true;
    clearTimer();
    latched = false;
    schedule();
  };
  function install() {
    if (!enabled() || !available()) return;
    const view = document!.defaultView!;
    document!.addEventListener("visibilitychange", visibility);
    removeListeners = () =>
      document!.removeEventListener("visibilitychange", visibility);
    if (!removeLifecycle) {
      // Preserve observed page lifecycle through OFF/ON toggles after first activation.
      // These two passive handlers retain no timer while the watch is disabled.
      view.addEventListener("pagehide", pagehide);
      view.addEventListener("pageshow", pageshow);
      removeLifecycle = () => {
        view.removeEventListener("pagehide", pagehide);
        view.removeEventListener("pageshow", pageshow);
      };
    }
    schedule();
  }
  install();
  return {
    update(next: DebuggingPolicy) {
      clearTimer();
      removeListeners?.();
      removeListeners = undefined;
      policy = next;
      latched = false;
      stats = fresh();
      install();
    },
    getState(): DebuggingState {
      const state =
        destroyed || policy.enabled !== true
          ? "off"
          : !available()
            ? "unavailable"
            : policy.watch !== true
              ? "manual"
              : !visible() || !pageActive
                ? "suspended"
                : "watching";
      return { state, ...stats };
    },
    destroy() {
      destroyed = true;
      clearTimer();
      removeListeners?.();
      removeListeners = undefined;
      removeLifecycle?.();
      removeLifecycle = undefined;
    },
  };
}

class SnapshotError extends Error {}

type DomSignal = (
  type: "dom-integrity-mismatch" | "dom-integrity-error",
  detail: string,
) => void;
interface Anchor {
  node: Element;
  parents: Node[];
}
/** Watches only selected subtrees and direct child lists along their bounded ancestry. */
export function createDomIntegrityMonitor(
  document: Document,
  policy: DomIntegrityPolicy,
  signal: DomSignal,
) {
  let observer: MutationObserver | undefined;
  let anchors: Anchor[] = [];
  let baseline = "";
  let positionChanged = false;
  let active = true;
  const stop = () => {
    observer?.disconnect();
    observer = undefined;
  };
  const collectParents = (node: Node) => {
    const parents: Node[] = [];
    while (node.parentNode) {
      node = node.parentNode;
      if (parents.length >= 128)
        throw new SnapshotError("DOM ancestry budget exceeded.");
      parents.push(node);
    }
    return parents;
  };
  const ancestryChanged = ({ node, parents }: Anchor) =>
    !node.isConnected ||
    parents.some((parent, index) =>
      index === 0
        ? node.parentNode !== parent
        : parents[index - 1]!.parentNode !== parent,
    );
  const snapshot = () => {
    let nodes = 0,
      bytes = 0;
    const parts: string[] = [];
    const encoder = new TextEncoder();
    const add = (value: string) => {
      // UTF-8 has at least one byte per UTF-16 code unit. Check before copying/encoding.
      if (value.length > (policy.maxBytes ?? 65536) - bytes)
        throw new SnapshotError("DOM snapshot byte budget exceeded.");
      const serialized = JSON.stringify(value);
      bytes += encoder.encode(serialized).byteLength;
      if (bytes > (policy.maxBytes ?? 65536))
        throw new SnapshotError("DOM snapshot byte budget exceeded.");
      parts.push(serialized);
    };
    for (const { node: root } of anchors) {
      let node: Node | null = root;
      let depth = 0;
      while (node) {
        if (++nodes > (policy.maxNodes ?? 1000))
          throw new SnapshotError("DOM snapshot node budget exceeded.");
        add(`${depth}:${node.nodeType}`);
        if (node.nodeType === 1) {
          const element = node as Element;
          add(element.namespaceURI ?? "");
          add(element.localName);
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes.item(i)!;
            add(attr.namespaceURI ?? "");
            add(attr.name);
            add(attr.value);
          }
          // The node's ordered attributes are already represented. Browser-created reorder is a change.
        } else add(node.nodeValue ?? "");
        if (node.firstChild) {
          node = node.firstChild;
          depth++;
          continue;
        }
        while (node !== root && !node.nextSibling) {
          node = node.parentNode!;
          depth--;
        }
        if (node === root) break;
        node = node.nextSibling;
      }
      add("anchor-end");
    }
    return parts.join("");
  };
  const failure = (
    type: "dom-integrity-mismatch" | "dom-integrity-error",
    detail: string,
  ) => {
    stop();
    if (active) signal(type, detail);
  };
  return {
    rebaseline(): boolean {
      stop();
      anchors = [];
      baseline = "";
      if (!active) return false;
      try {
        if (!policy.selectors?.length)
          throw new SnapshotError("No static DOM anchors configured.");
        for (const selector of policy.selectors) {
          let node: Element | null;
          try {
            node = document.querySelector(selector);
          } catch {
            throw new SnapshotError("A static DOM anchor selector is invalid.");
          }
          if (!node) throw new SnapshotError("A static DOM anchor is missing.");
          if (!anchors.some((anchor) => anchor.node === node))
            anchors.push({ node, parents: collectParents(node) });
        }
        baseline = snapshot();
        const Observer = document.defaultView?.MutationObserver;
        if (!Observer)
          throw new SnapshotError("DOM observation is unavailable.");
        observer = new Observer((records) => {
          if (!active || !observer) return;
          try {
            // Moving an existing anchor within its parent preserves ancestry and
            // contents. Match node identities rather than sibling indices, which
            // also change when unrelated siblings are inserted or removed.
            const reordered = records.some((record) => {
              if (record.type !== "childList") return false;
              for (const nodes of [record.removedNodes, record.addedNodes])
                for (const changed of nodes)
                  if (
                    anchors.some(
                      (anchor) =>
                        (changed === anchor.node ||
                          anchor.parents.includes(changed)) &&
                        !ancestryChanged(anchor),
                    )
                  )
                    return true;
              return false;
            });
            const moved = anchors.some(ancestryChanged);
            // Content/ancestry checks cannot prove the original sibling position
            // was restored. Require a trusted explicit rebaseline after reorder.
            if (reordered) positionChanged = true;
            const relevant =
              reordered ||
              moved ||
              records.some((record) =>
                anchors.some(
                  ({ node }) =>
                    node === record.target || node.contains(record.target),
                ),
              );
            if (!relevant) return;
            if (reordered || moved || snapshot() !== baseline)
              failure(
                "dom-integrity-mismatch",
                "A selected static DOM anchor changed, moved, was removed or replaced. No page contents are included.",
              );
          } catch {
            failure(
              "dom-integrity-error",
              "A selected DOM anchor exceeded the snapshot budget; observation stopped.",
            );
          }
        });
        const targets = new Map<Node, MutationObserverInit>();
        for (const { node, parents } of anchors) {
          targets.set(node, {
            attributes: true,
            characterData: true,
            childList: true,
            subtree: true,
          });
          for (const parent of parents)
            if (!targets.has(parent)) targets.set(parent, { childList: true });
        }
        for (const [target, options] of targets)
          observer.observe(target, options);
        positionChanged = false;
        return true;
      } catch (error) {
        failure(
          "dom-integrity-error",
          error instanceof SnapshotError
            ? error.message
            : "Unable to snapshot selected static DOM anchors.",
        );
        return false;
      }
    },
    matchesBaseline(): boolean {
      if (
        !active ||
        !baseline ||
        positionChanged ||
        anchors.some(ancestryChanged)
      )
        return false;
      try {
        return snapshot() === baseline;
      } catch {
        return false;
      }
    },
    destroy() {
      active = false;
      stop();
      anchors = [];
      baseline = "";
    },
  };
}
