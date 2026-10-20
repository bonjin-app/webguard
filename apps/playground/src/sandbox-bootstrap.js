// Standalone raw bootstrap: transformed outer-scope decoders must never enter this frame.
(() => {
  const frameToken = document.currentScript.dataset.token;
  function receive(event) {
    if (
      event.source !== window.parent ||
      event.data?.kind !== "webguard-run" ||
      event.data.token !== frameToken ||
      typeof event.data.code !== "string" ||
      event.ports.length !== 1
    )
      return;
    window.removeEventListener("message", receive);
    const port = event.ports[0],
      token = frameToken,
      code = event.data.code;
    let worker,
      workerURL,
      payloadURL,
      timer,
      settled = false,
      phase = "startup";
    const dispose = () => {
      clearTimeout(timer);
      worker?.terminate();
      if (workerURL) URL.revokeObjectURL(workerURL);
      if (payloadURL) URL.revokeObjectURL(payloadURL);
      window.removeEventListener("pagehide", cancel);
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      dispose();
      port.close();
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      dispose();
      try {
        port.postMessage({ kind: "result", token, result });
      } finally {
        port.close();
      }
    };
    port.onmessage = (message) => {
      if (message.data?.kind === "cancel" && message.data.token === token)
        cancel();
    };
    port.onmessageerror = () =>
      finish({ logs: [], elapsed: 0, error: "Sandbox startup failed" });
    window.addEventListener("pagehide", cancel, { once: true });
    timer = setTimeout(
      () =>
        finish({
          logs: [],
          elapsed: 0,
          error: "Sandbox startup timed out (5000 ms)",
        }),
      5000,
    );
    // Only this trusted bootstrap loads before ready. Blob import preserves the existing CSP.
    const workerBootstrap = `(() => { const send=self.postMessage.bind(self);
function start(event){if(event.data?.kind!=='execute'||typeof event.data.url!=='string'||!event.data.url.startsWith('blob:'))return;
self.removeEventListener('message',start);
try{importScripts(event.data.url);}catch{send({kind:'result',result:{logs:[],elapsed:0,error:'Sandbox execution failed (syntax or policy error)'}});}}
self.addEventListener('message',start);send({kind:'ready'}); })();`;
    const prefix = `const started = performance.now(); const logs = []; let outputBytes = 0;
const sendResult = self.postMessage.bind(self); const stringify = JSON.stringify.bind(JSON);
const clock = performance.now.bind(performance);
const format = (value) => { try { const text = typeof value === 'string' ? value : stringify(value); return String(text).slice(0, 2000); } catch { throw new Error('Output could not be serialized'); } };
console.log = console.info = console.warn = console.error = (...args) => { if (logs.length >= 50) throw new Error('Console output limit exceeded'); const line = args.map(format).join(' '); outputBytes += line.length; if (outputBytes > 20000) throw new Error('Console output limit exceeded'); logs.push(line); };
(async () => { try { await (async () => {\n`;
    const suffix = `\n})(); sendResult({kind:'result',result:{logs, elapsed: clock() - started}}); } catch(error) { sendResult({kind:'result',result:{logs, elapsed: clock() - started, error: String(error?.message ?? error).slice(0,2000) || 'Sandbox execution failed'}}); } })();`;
    try {
      payloadURL = URL.createObjectURL(
        new Blob([prefix, code, suffix], { type: "text/javascript" }),
      );
      workerURL = URL.createObjectURL(
        new Blob([workerBootstrap], { type: "text/javascript" }),
      );
      worker = new Worker(workerURL);
      worker.onmessage = (message) => {
        if (settled) return;
        if (phase === "startup") {
          if (message.data?.kind !== "ready") {
            finish({
              logs: [],
              elapsed: 0,
              error: "Sandbox returned invalid startup output",
            });
            return;
          }
          phase = "execution";
          clearTimeout(timer);
          // Start the unchanged execution budget before sending permission to execute.
          timer = setTimeout(
            () =>
              finish({
                logs: [],
                elapsed: 1000,
                error: "Execution timed out (1000 ms)",
              }),
            1000,
          );
          try {
            port.postMessage({ kind: "running", token });
            worker.postMessage({ kind: "execute", url: payloadURL });
          } catch {
            finish({ logs: [], elapsed: 0, error: "Sandbox execution failed" });
          }
          return;
        }
        if (message.data?.kind === "ready") return; // Never reset deadlines from Worker messages.
        const result = message.data?.result;
        if (
          message.data?.kind !== "result" ||
          !result ||
          !Array.isArray(result.logs) ||
          result.logs.length > 50 ||
          !result.logs.every(
            (line) => typeof line === "string" && line.length <= 20000,
          ) ||
          result.logs.reduce((size, line) => size + line.length, 0) > 20000 ||
          !Number.isFinite(result.elapsed) ||
          result.elapsed < 0 ||
          (result.error !== undefined &&
            (typeof result.error !== "string" || result.error.length > 2000))
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
            ? { error: result.error || "Sandbox execution failed" }
            : {}),
        });
      };
      worker.onmessageerror = () =>
        finish({
          logs: [],
          elapsed: 0,
          error: "Sandbox returned invalid output",
        });
      worker.onerror = () =>
        finish({
          logs: [],
          elapsed: 0,
          error:
            phase === "startup"
              ? "Sandbox startup failed"
              : "Sandbox execution failed (syntax or policy error)",
        });
    } catch {
      finish({ logs: [], elapsed: 0, error: "Sandbox startup failed" });
    }
  }
  window.addEventListener("message", receive);
  window.parent.postMessage(
    { kind: "webguard-sandbox-ready", token: frameToken },
    "*",
  );
})();
