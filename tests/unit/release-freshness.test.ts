import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  capturePackageSnapshot,
  assertPackageFreshness,
  captureSourceSnapshot,
  assertSourceFreshness,
} from "../../scripts/release-freshness.mjs";

const fixtures: string[] = [];
async function fixture() {
  const directory = await mkdtemp(
    join(tmpdir(), "webguard-release-freshness-"),
  );
  fixtures.push(directory);
  await mkdir(join(directory, "dist"));
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "fixture",
      version: "0.3.0",
      description: "before",
    }),
  );
  await writeFile(
    join(directory, "dist/index.js"),
    "export const value = 1;\n",
  );
  let paths = ["dist/index.js", "package.json"];
  const listFiles = () => paths;
  const snapshot = await capturePackageSnapshot(directory, { listFiles });
  return {
    directory,
    snapshot,
    listFiles,
    setPaths: (next: string[]) => {
      paths = next;
    },
  };
}
afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
describe("reviewed public package freshness", () => {
  it("accepts unchanged bytes and normalizes inventory ordering", async () => {
    const f = await fixture();
    f.setPaths(["package.json", "dist/index.js"]);
    await expect(
      assertPackageFreshness(
        f.directory,
        { packageSnapshot: f.snapshot },
        { listFiles: f.listFiles },
      ),
    ).resolves.toBeUndefined();
    expect(f.snapshot.files.map((file: { path: string }) => file.path)).toEqual(
      ["dist/index.js", "package.json"],
    );
  });
  it("rejects legacy records without a snapshot before listing files", async () => {
    const f = await fixture();
    await expect(
      assertPackageFreshness(
        f.directory,
        {},
        {
          listFiles: () => {
            throw new Error("must not list");
          },
        },
      ),
    ).rejects.toThrow(/snapshot.*release:prepare/i);
  });
  it.each(["changed", "deleted", "added", "metadata"])(
    "rejects %s publishable files",
    async (change) => {
      const f = await fixture();
      if (change === "changed")
        await writeFile(
          join(f.directory, "dist/index.js"),
          "export const value = 2;",
        );
      if (change === "deleted") {
        await rm(join(f.directory, "dist/index.js"));
        f.setPaths(["package.json"]);
      }
      if (change === "added") {
        await writeFile(
          join(f.directory, "dist/next.js"),
          "export default {};",
        );
        f.setPaths(["dist/index.js", "dist/next.js", "package.json"]);
      }
      if (change === "metadata")
        await writeFile(
          join(f.directory, "package.json"),
          JSON.stringify({
            name: "fixture",
            version: "0.3.0",
            description: "after",
          }),
        );
      await expect(
        assertPackageFreshness(
          f.directory,
          { packageSnapshot: f.snapshot },
          { listFiles: f.listFiles },
        ),
      ).rejects.toThrow(/changed.*release:prepare/i);
    },
  );
  it.each(["changed", "deleted", "added"])(
    "rejects %s build inputs even with unchanged dist",
    async (change) => {
      const f = await fixture();
      await mkdir(join(f.directory, "src"));
      await writeFile(join(f.directory, "src/index.ts"), "original");
      const options = { inputs: ["src"] };
      const sourceSnapshot = await captureSourceSnapshot(f.directory, options);
      await expect(
        assertSourceFreshness(f.directory, { sourceSnapshot }, options),
      ).resolves.toBeUndefined();
      if (change === "changed")
        await writeFile(join(f.directory, "src/index.ts"), "new");
      if (change === "deleted") await rm(join(f.directory, "src/index.ts"));
      if (change === "added")
        await writeFile(join(f.directory, "src/added.ts"), "new");
      await expect(
        assertSourceFreshness(f.directory, { sourceSnapshot }, options),
      ).rejects.toThrow(/inputs changed.*release:prepare/i);
    },
  );
  it("rejects symlinks instead of hashing outside the inventory root", async () => {
    const f = await fixture();
    await symlink(
      join(f.directory, "package.json"),
      join(f.directory, "dist/link.js"),
    );
    await expect(
      capturePackageSnapshot(f.directory, {
        listFiles: () => ["dist/link.js"],
      }),
    ).rejects.toThrow(/symlinks/i);
    await expect(
      captureSourceSnapshot(f.directory, { inputs: ["dist"] }),
    ).rejects.toThrow(/symlinks/i);
  });
  it("rejects malformed or escaping inventories", async () => {
    const f = await fixture();
    await expect(
      capturePackageSnapshot(f.directory, { listFiles: () => ["../secret"] }),
    ).rejects.toThrow(/inventory/i);
    await expect(
      capturePackageSnapshot(f.directory, {
        listFiles: () => ["package.json", "package.json"],
      }),
    ).rejects.toThrow(/inventory/i);
  });
});
