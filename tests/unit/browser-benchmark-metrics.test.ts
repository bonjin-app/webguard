import { describe, expect, it } from "vitest";
const { javascriptSizes, cpuDelta, checkBudget, summarizeValues } =
  await import(
    new URL("../../scripts/browser-benchmark-metrics.mjs", import.meta.url).href
  );

const builds = {
  baseline: { javascriptBytes: { raw: 100, gzip: 50, brotli: 40 } },
  protected: { javascriptBytes: { raw: 300, gzip: 150, brotli: 100 } },
};
const budget = () => ({
  fixture: "react-vite",
  maxJavaScriptBytes: {
    baseline: { raw: 100, gzip: 50, brotli: 40 },
    protected: { raw: 300, gzip: 150, brotli: 100 },
  },
});
describe("browser benchmark evidence", () => {
  it("summarizes odd and even observations without mutating sample order", () => {
    const observations = [7, 1, 4];
    expect(summarizeValues(observations)).toEqual({
      median: 4,
      min: 1,
      max: 7,
    });
    expect(observations).toEqual([7, 1, 4]);
    expect(summarizeValues([8, 0, 2, 4])).toEqual({
      median: 3,
      min: 0,
      max: 8,
    });
    expect(summarizeValues([0])).toEqual({ median: 0, min: 0, max: 0 });
    expect(summarizeValues([Number.MAX_VALUE, Number.MAX_VALUE])).toEqual({
      median: Number.MAX_VALUE,
      min: Number.MAX_VALUE,
      max: Number.MAX_VALUE,
    });
  });
  it("rejects empty, missing, nonfinite and negative summary observations", () => {
    for (const invalid of [
      undefined,
      null,
      [],
      [undefined],
      [null],
      [NaN],
      [Infinity],
      [-Infinity],
      [-1],
      ["1"],
      new Array(2),
      [1, undefined],
    ])
      expect(() => summarizeValues(invalid)).toThrow();
  });
  it("accepts exact ceilings and reports the exceeded fixture encoding", () => {
    expect(checkBudget(budget(), builds).passed).toBe(true);
    const lower = budget();
    lower.maxJavaScriptBytes.protected.brotli = 99;
    const result = checkBudget(lower, builds);
    expect(result.passed).toBe(false);
    expect(
      result.checks.filter((check: { passed: boolean }) => !check.passed),
    ).toEqual([
      {
        kind: "protected",
        encoding: "brotli",
        actual: 100,
        ceiling: 99,
        passed: false,
      },
    ]);
  });
  it("rejects incomplete, invalid and mismatched budgets", () => {
    for (const invalid of [
      null,
      {},
      { ...budget(), fixture: "other" },
      { fixture: "react-vite", maxJavaScriptBytes: {} },
    ])
      expect(() => checkBudget(invalid, builds)).toThrow();
    for (const value of [0, -1, 1.5, Infinity, "300"]) {
      const invalid = budget();
      Object.assign(invalid.maxJavaScriptBytes.protected, { raw: value });
      expect(() => checkBudget(invalid, builds)).toThrow(
        "Invalid budget ceiling",
      );
    }
  });
  it("reports deterministic byte lengths for all compression encodings", () => {
    const source = Buffer.from("const answer = 42;".repeat(100));
    const sizes = javascriptSizes(source);
    expect(sizes).toEqual(javascriptSizes(source));
    expect(sizes.raw).toBe(source.length);
    expect(sizes.gzip).toBeGreaterThan(0);
    expect(sizes.brotli).toBeGreaterThan(0);
    expect(sizes.gzip).toBeLessThan(sizes.raw);
    expect(sizes.brotli).toBeLessThan(sizes.raw);
  });
  it("uses checkpoint deltas rather than cumulative CDP CPU totals", () => {
    const before = {
      TaskDuration: 10,
      ScriptDuration: 4,
      LayoutDuration: 2,
      RecalcStyleDuration: 1,
    };
    const after = {
      TaskDuration: 11,
      ScriptDuration: 4.5,
      LayoutDuration: 2.25,
      RecalcStyleDuration: 1.125,
    };
    expect(cpuDelta(before, after)).toEqual({
      TaskDuration: 1,
      ScriptDuration: 0.5,
      LayoutDuration: 0.25,
      RecalcStyleDuration: 0.125,
    });
    expect(() => cpuDelta({}, after)).toThrow("Missing CDP CPU metric");
    expect(() => cpuDelta(after, before)).toThrow("regressed");
  });
});
