import { gzipSync, brotliCompressSync, constants } from "node:zlib";

export function javascriptSizes(bytes) {
  return {
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
}

export function cpuDelta(before, after) {
  return Object.fromEntries(
    [
      "TaskDuration",
      "ScriptDuration",
      "LayoutDuration",
      "RecalcStyleDuration",
    ].map((name) => {
      if (!Number.isFinite(before[name]) || !Number.isFinite(after[name]))
        throw new Error(`Missing CDP CPU metric: ${name}`);
      const delta = after[name] - before[name];
      if (delta < 0) throw new Error(`CDP CPU metric regressed: ${name}`);
      return [name, delta];
    }),
  );
}

export function checkBudget(budget, builds) {
  if (budget?.fixture !== "react-vite")
    throw new Error('Budget fixture must be "react-vite"');
  const checks = [];
  for (const kind of ["baseline", "protected"]) {
    for (const encoding of ["raw", "gzip", "brotli"]) {
      const ceiling = budget.maxJavaScriptBytes?.[kind]?.[encoding];
      if (!Number.isSafeInteger(ceiling) || ceiling <= 0)
        throw new Error(`Invalid budget ceiling: ${kind}.${encoding}`);
      const actual = builds[kind].javascriptBytes[encoding];
      checks.push({
        kind,
        encoding,
        actual,
        ceiling,
        passed: actual <= ceiling,
      });
    }
  }
  return { passed: checks.every((check) => check.passed), checks };
}

/** Summarize finite, nonnegative observations without changing their order. */
export function summarizeValues(values) {
  if (!Array.isArray(values) || values.length === 0)
    throw new Error("Summary requires at least one observation");
  const ordered = Array.from(values);
  if (ordered.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("Summary observations must be finite nonnegative numbers");
  ordered.sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const median =
    ordered.length % 2
      ? ordered[middle]
      : ordered[middle - 1] + (ordered[middle] - ordered[middle - 1]) / 2;
  return { median, min: ordered[0], max: ordered[ordered.length - 1] };
}
