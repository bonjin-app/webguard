// Standalone iframe bootstrap: import as raw text so build transforms cannot introduce outer-scope dependencies.
window.addEventListener(
  "message",
  (event) => {
    if (
      event.source !== window.parent ||
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
    const finish = (result) => {
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
