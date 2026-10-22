import { expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const api = () =>
  import(new URL("../../scripts/api-reference.mjs", import.meta.url).href);

it("discovers the real package export map, aliases and instance methods without importing runtime code", async () => {
  const { collectPublicApi } = await api();
  const inventory = collectPublicApi();
  expect(
    inventory.modules.find((item: { path: string }) => item.path === "/browser")
      .values,
  ).toEqual(["WebGuard", "default", "getAutoGuard", "installAutoGuard"]);
  expect(
    inventory.modules.find((item: { path: string }) => item.path === "/client")
      .values,
  ).toEqual(["getWebGuard"]);
  expect(
    inventory.modules.some((item: { path: string }) => item.path === "/cli"),
  ).toBe(false);
  expect(inventory.methods).toContain("WebGuardInstance.checkIntegrity");
  expect(inventory.methods).toContain("WebGuard.init");
  expect(
    inventory.modules.find((item: { path: string }) => item.path === "/build")
      .types,
  ).toContain("ProtectionReport");
});

it("rejects missing export coverage, fake export entries and dead function anchors", async () => {
  const { validateApiReference } = await api();
  const directory = await mkdtemp(join(tmpdir(), "webguard-api-docs-"));
  const inventory = {
    modules: [{ path: "/build", values: ["hashContent"], types: [] }],
    methods: [],
  };
  try {
    await writeFile(
      join(directory, "API_BUILD.ko.md"),
      "# Build API\n\n## hashContent\n\n```ts\nhashContent(bytes)\n```\n",
    );
    await expect(
      validateApiReference({
        directory,
        inventory,
        mapping: { modules: { "/build": {} }, methods: {} },
      }),
    ).rejects.toThrow(/hashContent/);
    const mapping = {
      modules: { "/build": { hashContent: "API_BUILD.ko.md#hashcontent" } },
      methods: {},
    };
    await expect(
      validateApiReference({ directory, inventory, mapping }),
    ).resolves.toMatchObject({ symbols: 1 });
    await expect(
      validateApiReference({
        directory,
        inventory,
        mapping: {
          modules: {
            "/build": {
              ...mapping.modules["/build"],
              invented: "API_BUILD.ko.md#hashcontent",
            },
          },
          methods: {},
        },
      }),
    ).rejects.toThrow(/invented/);
    await expect(
      validateApiReference({
        directory,
        inventory,
        mapping: {
          modules: { "/build": { hashContent: "API_BUILD.ko.md#missing" } },
          methods: {},
        },
      }),
    ).rejects.toThrow(/anchor|missing/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("covers every actual public value, type and SDK instance method with a real reference anchor", async () => {
  const { validateApiReference } = await api();
  const result = await validateApiReference();
  expect(result.modules).toBe(9);
  expect(result.symbols).toBeGreaterThan(50);
  expect(result.methods).toBe(9);
  expect(result.bins).toBe(3);
  expect(await readFile("docs/API.ko.md", "utf8")).toContain(
    "uulab-webguard/build",
  );
});
