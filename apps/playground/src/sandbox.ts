import bootstrapSource from "./sandbox-bootstrap.js?raw";
export interface RunResult {
  logs: string[];
  elapsed: number;
  error?: string;
}
// This bootstrap is the only script in the opaque-origin frame. User code only runs in its worker.

const active = new Set<() => void>();
window.addEventListener("pagehide", () => {
  for (const cancel of active) cancel();
});
export function runIsolated(code: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.title = "Isolated code execution";
    frame.setAttribute("sandbox", "allow-scripts");
    const channel = new MessageChannel();
    const token = crypto.randomUUID();
    let done = false;
    let phase: "startup" | "execution" = "startup";
    let deadline: ReturnType<typeof setTimeout>;
    const finish = (result: RunResult) => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      window.removeEventListener("message", ready);
      try {
        channel.port1.postMessage({ kind: "cancel", token });
      } catch {
        // A closed frame is already being removed below.
      }
      channel.port1.close();
      channel.port2.close();
      frame.remove();
      active.delete(cancel);
      resolve(result);
    };
    const cancel = () =>
      finish({ logs: [], elapsed: 0, error: "Execution cancelled" });
    active.add(cancel);
    deadline = setTimeout(
      () =>
        finish({
          logs: [],
          elapsed: 0,
          error: "Sandbox startup timed out (5000 ms)",
        }),
      5000,
    );
    channel.port1.onmessage = (
      event: MessageEvent<{
        kind?: string;
        token?: string;
        result?: RunResult;
      }>,
    ) => {
      if (event.data?.token !== token) return;
      if (event.data.kind === "running") {
        if (done || phase !== "startup") return;
        phase = "execution";
        clearTimeout(deadline);
        // The iframe enforces 1000 ms; this watchdog bounds a lost execution response.
        deadline = setTimeout(
          () =>
            finish({
              logs: [],
              elapsed: 0,
              error: "Sandbox execution response timed out",
            }),
          1800,
        );
        return;
      }
      if (event.data.kind !== "result") return;
      const result = event.data.result;
      if (
        !result ||
        !Array.isArray(result.logs) ||
        result.logs.length > 50 ||
        !result.logs.every(
          (line) => typeof line === "string" && line.length <= 20000,
        ) ||
        !Number.isFinite(result.elapsed) ||
        result.elapsed < 0 ||
        result.logs.reduce((size, line) => size + line.length, 0) > 20000 ||
        (phase === "startup" && (!result.error || result.elapsed !== 0)) ||
        (result.error !== undefined && typeof result.error !== "string")
      ) {
        finish({
          logs: [],
          elapsed: 0,
          error: "Sandbox returned invalid output",
        });
        return;
      }
      finish({
        logs: result.logs,
        elapsed: result.elapsed,
        ...(result.error !== undefined
          ? { error: result.error.slice(0, 2000) || "Sandbox execution failed" }
          : {}),
      });
    };
    channel.port1.onmessageerror = () =>
      finish({
        logs: [],
        elapsed: 0,
        error: "Sandbox returned invalid output",
      });
    let transferred = false;
    const ready = (event: MessageEvent) => {
      if (
        done ||
        transferred ||
        event.source !== frame.contentWindow ||
        event.origin !== "null" ||
        event.data?.kind !== "webguard-sandbox-ready" ||
        event.data.token !== token
      )
        return;
      transferred = true;
      window.removeEventListener("message", ready);
      try {
        frame.contentWindow!.postMessage(
          { kind: "webguard-run", token, code },
          "*",
          [channel.port2],
        );
      } catch {
        finish({ logs: [], elapsed: 0, error: "Sandbox startup failed" });
      }
    };
    window.addEventListener("message", ready);
    try {
      frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'"><script data-token="${token}">${bootstrapSource}</script>`;
      document.body.append(frame);
    } catch {
      finish({ logs: [], elapsed: 0, error: "Sandbox startup failed" });
    }
  });
}
