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
    const finish = (result: RunResult) => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      channel.port1.close();
      channel.port2.close();
      frame.remove();
      active.delete(cancel);
      resolve(result);
    };
    const cancel = () =>
      finish({ logs: [], elapsed: 0, error: "Execution cancelled" });
    active.add(cancel);
    const deadline = setTimeout(
      () =>
        finish({
          logs: [],
          elapsed: 1000,
          error: "Execution timed out (1000 ms)",
        }),
      1800,
    );
    channel.port1.onmessage = (
      event: MessageEvent<{ token?: string; result?: RunResult }>,
    ) => {
      if (event.data?.token !== token) return;
      const result = event.data.result;
      if (
        !result ||
        !Array.isArray(result.logs) ||
        result.logs.length > 50 ||
        !result.logs.every(
          (line) => typeof line === "string" && line.length <= 20000,
        ) ||
        !Number.isFinite(result.elapsed) ||
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
        ...(result.error ? { error: result.error.slice(0, 2000) } : {}),
      });
    };
    frame.onload = () =>
      frame.contentWindow?.postMessage(
        { kind: "webguard-run", token, code },
        "*",
        [channel.port2],
      );
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'"><script>${bootstrapSource}</script>`;
    document.body.append(frame);
  });
}
