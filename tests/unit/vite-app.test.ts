import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import type { WebGuardOptions } from "@webguard/browser";
import {
  createWebGuardApp,
  type WebGuardAppOptions,
} from "../../packages/vite-plugin/src/app";

function emittedRuntime(input: WebGuardAppOptions): WebGuardOptions {
  const plugin = createWebGuardApp(input, () => "/browser.js")[0];
  if (typeof plugin?.load !== "function")
    throw new Error("Missing runtime load hook");
  const code = (plugin.load as (id: string) => string)("\0webguard:auto-start");
  let options: WebGuardOptions | undefined;
  runInNewContext(code.replace(/^import[^\n]*\n/, ""), {
    installAutoGuard(value: WebGuardOptions) {
      options = value;
    },
  });
  if (!options) throw new Error("Bootstrap did not initialize the SDK");
  return options;
}

it.each([
  {},
  { runtime: {} },
  { runtime: { devtools: { blockShortcuts: true } } },
])(
  "leaves geometry detection disabled in the emitted bootstrap without explicit opt-in: %j",
  (input) => {
    expect(emittedRuntime(input).devtools?.detect).toBe(false);
  },
);

it.each([true, false])(
  "honors explicit detection=%s without changing independent runtime controls",
  (detect) => {
    const options = emittedRuntime({
      runtime: {
        devtools: {
          detect,
          blockShortcuts: true,
          blockContextMenu: true,
          response: "block",
        },
      },
    });
    expect(options.devtools).toMatchObject({
      detect,
      blockShortcuts: true,
      blockContextMenu: true,
      response: "block",
    });
  },
);
