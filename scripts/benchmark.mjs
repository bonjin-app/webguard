import { writeFile, mkdir } from "node:fs/promises";
import vm from "node:vm";
import os from "node:os";
import { obfuscate } from "../packages/obfuscator/dist/index.js";
const source =
  "function calculate(values){return values.map((v,i)=>v*(i+1)).reduce((a,b)=>a+b,0)} globalThis.result=calculate(Array.from({length:10000},(_,i)=>i%97));";
const execute = (code) => {
  const context = vm.createContext({});
  const start = performance.now();
  vm.runInContext(code, context, { timeout: 2000 });
  return { ms: performance.now() - start, result: context.result };
};
const baseline = execute(source),
  runs = [];
for (const level of ["basic", "standard", "high"]) {
  const before = process.memoryUsage().rss;
  const result = await obfuscate(source, { level, seed: 42 });
  const samples = Array.from({ length: 10 }, () => execute(result.code));
  if (samples.some((s) => s.result !== baseline.result))
    throw new Error("Benchmark behavior changed");
  runs.push({
    level,
    inputBytes: result.originalBytes,
    outputBytes: result.protectedBytes,
    sizeChangePercent:
      Math.round((result.protectedBytes / result.originalBytes - 1) * 10000) /
      100,
    transformMs: Math.round(result.durationMs * 100) / 100,
    meanExecutionMs:
      Math.round(
        (samples.reduce((a, b) => a + b.ms, 0) / samples.length) * 100,
      ) / 100,
    processRssDeltaBytes: process.memoryUsage().rss - before,
    result: baseline.result,
  });
}
const report = {
  measuredAt: new Date().toISOString(),
  runtime: process.version,
  platform: `${os.platform()} ${os.arch()}`,
  fixture:
    "10,000 integer map/reduce; 10 isolated VM execution samples per level",
  baseline: {
    bytes: Buffer.byteLength(source),
    executionMs: baseline.ms,
    result: baseline.result,
  },
  runs,
  limitations: [
    "Microbenchmark only; no universal performance threshold.",
    "Node VM execution, not physical browser CPU or memory measurement.",
    "RSS delta includes GC and engine allocation noise.",
  ],
};
await mkdir("docs/evidence", { recursive: true });
await writeFile(
  "docs/evidence/benchmark-node.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
