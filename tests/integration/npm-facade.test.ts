import { expect, it, vi } from "vitest";
import {
  createWebGuardApp,
  webguardApp,
} from "../../packages/vite-plugin/src/app";

it("resolves the injected browser entry through the facade factory only when runtime loading is requested", () => {
  const resolveRuntime = vi.fn(
    () => "/installed/uulab-webguard/dist/browser.js",
  );
  const plugins = createWebGuardApp({}, resolveRuntime);
  expect(resolveRuntime).not.toHaveBeenCalled();
  const load = plugins[0]?.load;
  if (typeof load !== "function") throw new Error("Missing runtime load hook");
  const code = (load as (id: string) => string)("\0webguard:auto-start");
  expect(code).toContain('from "/installed/uulab-webguard/dist/browser.js"');
  expect(code).toContain("installAutoGuard");
  expect(code).toContain('"preset":"strict"');
  expect(resolveRuntime).toHaveBeenCalledOnce();
});
it("keeps original wrapper semantics and does not resolve disabled runtime entries", () => {
  expect(webguardApp().map((plugin) => plugin.name)).toEqual([
    "webguard-app-bootstrap",
    "webguard",
    "webguard-protected-preview",
  ]);
  const resolver = vi.fn(() => {
    throw new Error("Disabled runtime resolver ran");
  });
  const plugin = createWebGuardApp({ runtime: false }, resolver)[0];
  if (typeof plugin?.load !== "function")
    throw new Error("Missing runtime load hook");
  expect(
    (plugin.load as (id: string) => unknown)("\0webguard:auto-start"),
  ).toBeUndefined();
  expect(resolver).not.toHaveBeenCalled();
});
