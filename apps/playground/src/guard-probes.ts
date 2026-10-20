export type GuardProbeKind = "network" | "trusted-types";
export interface GuardProbeResult {
  supported: boolean;
  performed: boolean;
  violations: string[];
  error?: string;
  status?: number;
}
const active = new Set<() => void>();
window.addEventListener("pagehide", () => {
  for (const cancel of [...active]) cancel();
});

/** Runs fixed teaching payloads only; accepts no user code, URLs, or HTML. */
export async function runGuardProbe(
  kind: GuardProbeKind,
  protectedMode: boolean,
): Promise<GuardProbeResult> {
  const token = crypto.randomUUID();
  const endpoint = new URL("/api/demo/network-probe", location.origin);
  const payload =
    kind === "network"
      ? `const response = await fetch(${JSON.stringify(endpoint.href)}, { credentials: 'omit', cache: 'no-store', signal: controller.signal });
status = response.status;
const body = await response.json();
performed = response.ok && body?.probe === 'webguard-network-ok';`
      : `supported = typeof globalThis.trustedTypes?.createPolicy === 'function';
if (supported) {
  const host = document.createElement('div');
  host.innerHTML = '<span data-webguard-probe>fixed text</span>';
  document.body.append(host);
  performed = host.querySelector('span[data-webguard-probe]')?.textContent === 'fixed text';
}`;
  const code = `const violations = []; let supported = true; let performed = false; let error; let status;
addEventListener('securitypolicyviolation', event => { if (violations.length < 20) violations.push(event.effectiveDirective); });
const controller = new AbortController();
const deadline = setTimeout(() => controller.abort(), 2500);
(async () => {
  try { ${payload} } catch (caught) { error = String(caught?.name ?? 'Error').slice(0,100); }
  clearTimeout(deadline);
  controller.abort();
  setTimeout(() => parent.postMessage({ type: 'webguard-guard-probe', token: ${JSON.stringify(token)}, kind: ${JSON.stringify(kind)}, supported, performed, violations, error, status }, '*'), 150);
})();`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code),
  );
  const encoded = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const policy = `default-src 'none'; base-uri 'none'; form-action 'none'; script-src 'sha256-${encoded}'; connect-src ${kind === "network" && !protectedMode ? endpoint.origin : "'none'"}${kind === "trusted-types" && protectedMode ? "; require-trusted-types-for 'script'; trusted-types 'none'" : ""}`;
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.title = `WebGuard isolated ${kind} probe`;
    frame.sandbox.add("allow-scripts");
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      frame.remove();
      active.delete(cancel);
    };
    const cancel = () => {
      cleanup();
      reject(
        new Error("격리 시험이 취소되었습니다. 성공으로 판정하지 않습니다."),
      );
    };
    const receive = (event: MessageEvent) => {
      const result = event.data;
      if (
        event.source !== frame.contentWindow ||
        event.origin !== "null" ||
        !result ||
        result.type !== "webguard-guard-probe" ||
        result.token !== token ||
        result.kind !== kind ||
        typeof result.supported !== "boolean" ||
        typeof result.performed !== "boolean" ||
        !Array.isArray(result.violations) ||
        result.violations.length > 20 ||
        !result.violations.every(
          (entry: unknown) => typeof entry === "string" && entry.length <= 100,
        ) ||
        (result.error !== undefined &&
          (typeof result.error !== "string" || result.error.length > 100)) ||
        (result.status !== undefined &&
          (!Number.isInteger(result.status) ||
            result.status < 100 ||
            result.status > 599))
      )
        return;
      cleanup();
      resolve({
        supported: result.supported,
        performed: result.performed,
        violations: result.violations,
        ...(result.error ? { error: result.error } : {}),
        ...(result.status === undefined ? {} : { status: result.status }),
      });
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "격리 시험 응답 시간이 지났습니다. 성공으로 판정하지 않습니다.",
        ),
      );
    }, 5000);
    active.add(cancel);
    window.addEventListener("message", receive);
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><body><script>${code}</script>`;
    document.getElementById("lab-frames")!.append(frame);
  });
}
