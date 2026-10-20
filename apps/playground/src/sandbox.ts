export interface RunResult {
  logs: string[];
  elapsed: number;
  error?: string;
}
// This bootstrap is the only script in the opaque-origin frame. User code only runs in its worker.
function bootstrap() {
  window.addEventListener(
    "message",
    (event) => {
      if (
        event.source !== parent ||
        event.data?.kind !== "webguard-run" ||
        !event.ports[0]
      )
        return;
      const port = event.ports[0];
      const token = event.data.token;
      const code = event.data.code;
      const prefix = `const started = performance.now(); const logs = []; let outputBytes = 0;
const send = self.postMessage.bind(self); const stringify = JSON.stringify.bind(JSON);
const clock = performance.now.bind(performance);
const format = (value) => { try { const text = typeof value === 'string' ? value : stringify(value); return String(text).slice(0, 2000); } catch { throw new Error('Output could not be serialized'); } };
console.log = console.info = console.warn = console.error = (...args) => { if (logs.length >= 50) throw new Error('Console output limit exceeded'); const line = args.map(format).join(' '); outputBytes += line.length; if (outputBytes > 20000) throw new Error('Console output limit exceeded'); logs.push(line); };
(async () => { try { await (async () => {\n`;
      const suffix = `\n})(); send({logs, elapsed: clock() - started}); } catch(error) { send({logs, elapsed: clock() - started, error: String(error?.message ?? error).slice(0,2000)}); } })();`;
      const url = URL.createObjectURL(
        new Blob([prefix, code, suffix], { type: "text/javascript" }),
      );
      const worker = new Worker(url);
      let settled = false;
      const finish = (result: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        port.postMessage({ token, result });
        port.close();
      };
      const timer = setTimeout(
        () =>
          finish({
            logs: [],
            elapsed: 1000,
            error: "Execution timed out (1000 ms)",
          }),
        1000,
      );
      worker.onmessage = (message) => finish(message.data);
      worker.onerror = () =>
        finish({
          logs: [],
          elapsed: 0,
          error: "Sandbox execution failed (syntax or policy error)",
        });
    },
    { once: true },
  );
}
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
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'"><script>(${bootstrap.toString()})()</script>`;
    document.body.append(frame);
  });
}
