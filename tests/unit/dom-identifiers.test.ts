import { describe, expect, it } from "vitest";
import { createDomIdentifierGenerator } from "../../packages/cli/src/dom-identifiers";
import { withWebGuard } from "../../packages/npm/src/next";

describe("build-only opaque CSS Modules names", () => {
  it("is deterministic, path-independent across checkouts and normalizes Windows separators", () => {
    const unix = createDomIdentifierGenerator({ root: "/project" });
    const windows = createDomIdentifierGenerator({ root: "C:\\project" });
    const name = unix("paymentTotal", "/project/app/cart.module.css");
    expect(name).toMatch(/^wg_[a-f0-9]{24}$/);
    expect(name).not.toContain("payment");
    expect(windows("paymentTotal", "C:\\project\\app\\cart.module.css")).toBe(
      name,
    );
    expect(unix("paymentTotal", "/project/app/cart.module.css?direct")).toBe(
      name,
    );
    expect(
      createDomIdentifierGenerator({ root: "/other" })(
        "paymentTotal",
        "/other/app/cart.module.css",
      ),
    ).toBe(name);
    expect(unix("other", "/project/app/cart.module.css")).not.toBe(name);
    expect(unix("paymentTotal", "/project/app/other.module.css")).not.toBe(
      name,
    );
  });
  it("rejects malformed or unbounded inputs without retaining an unbounded name cache", () => {
    expect(() => createDomIdentifierGenerator({ root: "relative" })).toThrow(
      /absolute/,
    );
    expect(() =>
      createDomIdentifierGenerator({ root: "/app", extra: true } as never),
    ).toThrow();
    const generate = createDomIdentifierGenerator({ root: "/app" });
    expect(() => generate("", "/app/a.css")).toThrow();
    expect(() => generate("x", "a.css")).toThrow(/absolute/);
    expect(() => generate("x".repeat(4097), "/app/a.css")).toThrow();
  });
});

function nextInput(getLocalIdent = function getCssModuleLocalIdent() {}) {
  return {
    module: {
      rules: [
        {
          oneOf: [
            {
              use: [
                {
                  loader: "/next/css-loader/src/index.js",
                  options: {
                    modules: { getLocalIdent, exportOnlyLocals: false },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
}
function namer(config: ReturnType<typeof nextInput>) {
  return config.module.rules[0]!.oneOf[0]!.use[0]!.options.modules
    .getLocalIdent as unknown as (
    context: { resourcePath: string },
    template: string,
    name: string,
  ) => string;
}
describe("Next CSS Modules server and client naming", () => {
  it("preserves Next font-loader metadata naming while protecting ordinary modules", () => {
    const fontName = () => "__className_fontHash";
    const font = {
      loader: "/next/css-loader/src/index.js",
      options: { fontLoader: true, modules: { getLocalIdent: fontName } },
    };
    const input = nextInput();
    input.module.rules[0]!.oneOf[0]!.use.push(font as never);
    const output = withWebGuard(
      {},
      { domIdentifiers: true, runtime: false },
    ).webpack(input, { dev: false, isServer: true, dir: "/app" });
    const loaders = (output as unknown as typeof input).module.rules[0]!
      .oneOf[0]!.use;
    expect(loaders[1]!.options.modules.getLocalIdent).toBe(fontName);
    expect(
      namer(output as unknown as typeof input)(
        { resourcePath: "/app/page.module.css" },
        "",
        "title",
      ),
    ).toMatch(/^wg_[a-f0-9]{24}$/);
    expect(namer(input).name).toBe("getCssModuleLocalIdent");
  });
  it("patches both compiler graphs without changing input or server JS settings", () => {
    const input = { ...nextInput(), devtool: "source-map", plugins: ["host"] };
    const configured = withWebGuard(
      {},
      { domIdentifiers: true, runtime: false },
    );
    const server = configured.webpack(input, {
      dev: false,
      isServer: true,
      dir: "/app",
    });
    const client = configured.webpack(input, {
      dev: false,
      isServer: false,
      dir: "/app",
    });
    const args = [
      { resourcePath: "/app/page.module.css" },
      "ignored",
      "price",
    ] as const;
    const name = namer(server as unknown as ReturnType<typeof nextInput>)(
      ...args,
    );
    expect(name).toMatch(/^wg_[a-f0-9]{24}$/);
    expect(
      namer(client as unknown as ReturnType<typeof nextInput>)(...args),
    ).toBe(name);
    expect(namer(input).name).toBe("getCssModuleLocalIdent");
    expect(server.devtool).toBe("source-map");
    expect(server.plugins).toEqual(["host"]);
    expect(client.plugins).toHaveLength(2);
  });
  it("keeps dev output unchanged and rejects missing loaders and custom naming conflicts", () => {
    const configured = withWebGuard(
      {},
      { domIdentifiers: true, runtime: false },
    );
    const input = nextInput();
    expect(configured.webpack(input, { dev: true, isServer: false })).toBe(
      input,
    );
    expect(() =>
      configured.webpack({}, { dev: false, isServer: true }),
    ).toThrow(/could not locate/);
    expect(() =>
      configured.webpack(
        nextInput(function customName() {}),
        { dev: false, isServer: false },
      ),
    ).toThrow(/custom/);
    expect(() => withWebGuard({}, { domIdentifiers: "yes" } as never)).toThrow(
      /boolean/,
    );
  });
});
