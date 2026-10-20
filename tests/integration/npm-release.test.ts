import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
// All subprocess commands use an isolated npm stub and a local fetch boundary.
async function releaseFixture(allowPublish = false) {
  const root = await mkdtemp(join(tmpdir(), "webguard-release-retry-"));
  for (const name of ["scripts", "packages/npm", ".npm-release", "bin"])
    await mkdir(join(root, name), { recursive: true });
  for (const name of ["release-npm.mjs", "release-readback.mjs"])
    await copyFile("scripts/" + name, join(root, "scripts", name));
  await writeFile(
    join(root, "packages/npm/package.json"),
    JSON.stringify({
      name: target.name,
      version: target.version,
      bin: {
        "webguard-check": "./dist/check.js",
        "webguard-serve": "./dist/serve.js",
      },
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org",
      },
    }),
  );
  const tarball = join(
    root,
    `.npm-release/${target.name}-${target.version}.tgz`,
  );
  await writeFile(tarball, packageBytes);
  await writeFile(
    join(root, ".npm-release/release.json"),
    JSON.stringify({
      ...target,
      filename: `${target.name}-${target.version}.tgz`,
    }),
  );
  const publications = join(root, "publications.txt");
  await writeFile(
    join(root, "bin/npm"),
    `#!/usr/bin/env node
const fs=require('node:fs');
if(process.argv[2]==='whoami'){console.log('release-test-user');process.exit(0);}
if(process.argv[2]==='publish'&&${JSON.stringify(allowPublish)}){fs.appendFileSync(${JSON.stringify(publications)},${JSON.stringify("published\n")});process.exit(0);}
process.exit(91);`,
  );
  await chmod(join(root, "bin/npm"), 0o755);
  const registryFile = join(root, "registry.json"),
    preload = join(root, "registry-fixture.mjs");
  await writeFile(
    preload,
    `import {readFile} from 'node:fs/promises';let index=0;
const registry=${JSON.stringify(registryFile)},tarball=${JSON.stringify(tarball)};
globalThis.fetch=async(url)=>{if(String(url)==='https://registry.npmjs.org/uulab-webguard'){const documents=JSON.parse(await readFile(registry));const document=documents[Math.min(index++,documents.length-1)];return document===null?new Response('',{status:404}):Response.json(document);}if(String(url)===${JSON.stringify(tarballUrl)})return new Response(await readFile(tarball));throw Error('Unexpected external request '+url);};`,
  );
  return {
    root,
    publications,
    evidence: join(root, "docs/evidence/npm-release.json"),
    setDocuments: (documents: unknown[]) =>
      writeFile(registryFile, JSON.stringify(documents)),
    run: (action: "publish" | "readback") =>
      execute(
        process.execPath,
        [
          "--import",
          preload,
          "--input-type=module",
          "--eval",
          `const release=await import(${JSON.stringify(pathToFileURL(join(root, "scripts/release-npm.mjs")).href)});try{await release[${JSON.stringify(action)}]({wait:async()=>{},delays:[1,2]})}catch(error){console.error(error.message);process.exitCode=1;}`,
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: join(root, "bin") + ":" + process.env.PATH,
          },
          timeout: 15000,
        },
      ),
  };
}
it("verifies already-published bytes and still rejects a stale latest tag without another publication", async () => {
  const fixture = await releaseFixture();
  try {
    await fixture.setDocuments([documentFor()]);
    await fixture.run("publish");
    expect(JSON.parse(await readFile(fixture.evidence, "utf8"))).toMatchObject({
      ...target,
      status: "verified",
      downloadedTarballMatches: true,
      latest: target.version,
    });
    await fixture.setDocuments([documentFor("9.0.0")]);
    await rm(fixture.evidence);
    await expect(fixture.run("publish")).rejects.toMatchObject({
      stderr: expect.stringContaining('"status":"unconfirmed"'),
    });
    await expect(readFile(fixture.evidence)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(fixture.publications)).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
it("publishes once, then retries only readback until registry version and latest converge", async () => {
  const fixture = await releaseFixture(true);
  try {
    await fixture.setDocuments([
      null,
      { versions: {} },
      documentFor("0.0.9"),
      documentFor(),
    ]);
    await fixture.run("publish");
    expect(await readFile(fixture.publications, "utf8")).toBe("published\n");
    expect(JSON.parse(await readFile(fixture.evidence, "utf8"))).toMatchObject({
      status: "verified",
      attempts: 3,
      downloadedTarballMatches: true,
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
it("reports successful publication separately when bounded readback remains unconfirmed", async () => {
  const fixture = await releaseFixture(true);
  try {
    await fixture.setDocuments([null, { versions: {} }]);
    await expect(fixture.run("publish")).rejects.toMatchObject({
      stderr: expect.stringContaining("npm publish succeeded"),
    });
    expect(await readFile(fixture.publications, "utf8")).toBe("published\n");
    await expect(readFile(fixture.evidence)).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
it("standalone readback reports unconfirmed and mismatch states without publishing or writing success evidence", async () => {
  const fixture = await releaseFixture();
  try {
    for (const [document, status] of [
      [documentFor("0.0.9"), "unconfirmed"],
      [documentFor(target.version, "sha512-other"), "mismatch"],
    ] as const) {
      await fixture.setDocuments([document]);
      await expect(fixture.run("readback")).rejects.toMatchObject({
        stderr: expect.stringContaining(`"status":"${status}"`),
      });
      await expect(readFile(fixture.evidence)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
    await expect(readFile(fixture.publications)).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

type ReadbackTarget = { name: string; version: string; integrity: string };
type ReadbackOptions = {
  fetch: (url: string | URL, options?: RequestInit) => Promise<Response>;
  wait: (milliseconds: number) => Promise<void>;
  delays: number[];
  requestTimeoutMs?: number;
};
async function verifier() {
  return (await import(
    new URL("../../scripts/release-readback.mjs", import.meta.url).href
  )) as {
    verifyRegistryRelease(
      target: ReadbackTarget,
      options: ReadbackOptions,
    ): Promise<{ attempts: number; downloadedTarballMatches: true }>;
  };
}
const packageBytes = Buffer.from("reviewed bytes");
const target: ReadbackTarget = {
  name: "uulab-webguard",
  version: "0.1.0",
  integrity:
    "sha512-" + createHash("sha512").update(packageBytes).digest("base64"),
};
const tarballUrl =
  "https://registry.npmjs.org/uulab-webguard/-/uulab-webguard-0.1.0.tgz";
function documentFor(latest = target.version, integrity = target.integrity) {
  return {
    maintainers: [{ name: "release-test-user" }],
    "dist-tags": { latest },
    versions: {
      [target.version]: { dist: { integrity, tarball: tarballUrl } },
    },
  };
}
it("retries only readback through missing version and delayed latest without real waits", async () => {
  const { verifyRegistryRelease } = await verifier();
  const documents = [
    undefined,
    { versions: {} },
    documentFor("0.0.9"),
    documentFor(),
  ];
  const waits: number[] = [];
  let index = 0;
  const result = await verifyRegistryRelease(target, {
    fetch: async (url) => {
      if (String(url) === tarballUrl) return new Response(packageBytes);
      const document = documents[index++];
      return document === undefined
        ? new Response("", { status: 404 })
        : Response.json(document);
    },
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
    delays: [1, 2, 3],
  });
  expect(result).toMatchObject({ attempts: 4, downloadedTarballMatches: true });
  expect(waits).toEqual([1, 2, 3]);
});
it("retries network failures, 429 and 5xx within the same bounded readback budget", async () => {
  const { verifyRegistryRelease } = await verifier();
  const waits: number[] = [];
  let index = 0;
  const result = await verifyRegistryRelease(target, {
    fetch: async (url) => {
      if (String(url) === tarballUrl) return new Response(packageBytes);
      if (index++ === 0) throw new TypeError("network unavailable");
      if (index === 2) return new Response("", { status: 429 });
      if (index === 3) return new Response("", { status: 503 });
      return Response.json(documentFor());
    },
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
    delays: [1, 2, 3],
  });
  expect(result).toMatchObject({ attempts: 4, downloadedTarballMatches: true });
  expect(waits).toEqual([1, 2, 3]);
});
it.each([
  ["metadata integrity", "REGISTRY_INTEGRITY_MISMATCH"],
  ["downloaded integrity", "TARBALL_INTEGRITY_MISMATCH"],
  ["forbidden registry", "REGISTRY_HTTP_ERROR"],
  ["malformed metadata", "INVALID_REGISTRY_RESPONSE"],
  ["missing tarball", "TARBALL_HTTP_ERROR"],
  ["foreign origin", "UNEXPECTED_TARBALL_ORIGIN"],
])("fails immediately for %s without retrying", async (kind, code) => {
  const { verifyRegistryRelease } = await verifier();
  const waits: number[] = [];
  await expect(
    verifyRegistryRelease(target, {
      fetch: async (url) => {
        if (String(url) === tarballUrl)
          return kind === "missing tarball"
            ? new Response("", { status: 404 })
            : new Response(
                kind === "downloaded integrity" ? "wrong bytes" : packageBytes,
              );
        if (kind === "forbidden registry")
          return new Response("", { status: 403 });
        if (kind === "malformed metadata") return new Response("{broken");
        const document = documentFor(
          kind === "metadata integrity" ? "0.0.9" : target.version,
          kind === "metadata integrity" ? "sha512-other" : target.integrity,
        );
        if (kind === "foreign origin")
          document.versions[target.version]!.dist.tarball =
            "https://other.invalid/package.tgz";
        return Response.json(document);
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
      delays: [1, 2, 3],
    }),
  ).rejects.toMatchObject({ code, attempts: 1, retryable: false });
  expect(waits).toEqual([]);
});
it("ends bounded missing-version readback as unconfirmed rather than a byte mismatch", async () => {
  const { verifyRegistryRelease } = await verifier();
  const waits: number[] = [];
  await expect(
    verifyRegistryRelease(target, {
      fetch: async () => Response.json({ versions: {} }),
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
      delays: [1, 2],
    }),
  ).rejects.toMatchObject({
    code: "VERSION_PENDING",
    status: "unconfirmed",
    attempts: 3,
    retryable: true,
  });
  expect(waits).toEqual([1, 2]);
});

it("retries a metadata response interrupted during body download", async () => {
  const { verifyRegistryRelease } = await verifier();
  const waits: number[] = [];
  let attempts = 0;
  const result = await verifyRegistryRelease(target, {
    fetch: async (url) => {
      if (String(url) === tarballUrl) return new Response(packageBytes);
      if (attempts++ === 0)
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError("connection closed"));
            },
          }),
        );
      return Response.json(documentFor());
    },
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
    delays: [1],
  });
  expect(result).toMatchObject({ attempts: 2, downloadedTarballMatches: true });
  expect(waits).toEqual([1]);
});

it.each([0, -1, 0.5, NaN, Infinity, 60001])(
  "rejects invalid request timeout %s before attempting registry lookup",
  async (requestTimeoutMs) => {
    const { verifyRegistryRelease } = await verifier();
    await expect(
      verifyRegistryRelease(target, {
        fetch: async () => Response.json(documentFor()),
        wait: async () => {},
        delays: [],
        requestTimeoutMs,
      }),
    ).rejects.toThrow("Invalid readback request timeout");
  },
);

it.each([
  ["metadata", 429, 3, "TRANSIENT_REGISTRY_ERROR"],
  ["metadata", 503, 3, "TRANSIENT_REGISTRY_ERROR"],
  ["metadata", 404, 3, "VERSION_PENDING"],
  ["metadata", 403, 1, "REGISTRY_HTTP_ERROR"],
  ["tarball", 503, 3, "TRANSIENT_REGISTRY_ERROR"],
  ["tarball", 404, 1, "TARBALL_HTTP_ERROR"],
  ["tarball", 403, 1, "TARBALL_HTTP_ERROR"],
] as const)(
  "cancels every unused %s HTTP %s body before retrying or failing",
  async (stage, status, attempts, code) => {
    const { verifyRegistryRelease } = await verifier();
    const cancellations: number[] = [],
      waits: number[] = [];
    await expect(
      verifyRegistryRelease(target, {
        fetch: async (url) => {
          if (stage === "tarball" && String(url) !== tarballUrl)
            return Response.json(documentFor());
          return new Response(
            new ReadableStream({
              cancel() {
                cancellations.push(status);
              },
            }),
            { status },
          );
        },
        wait: async (milliseconds) => {
          expect(cancellations).toHaveLength(waits.length + 1);
          waits.push(milliseconds);
        },
        delays: [1, 2],
      }),
    ).rejects.toMatchObject({ code, attempts });
    expect(cancellations).toEqual(Array(attempts).fill(status));
    expect(waits).toHaveLength(attempts - 1);
  },
);
it("preserves the HTTP failure classification even when discarding its body fails", async () => {
  const { verifyRegistryRelease } = await verifier();
  await expect(
    verifyRegistryRelease(target, {
      fetch: async () =>
        new Response(
          new ReadableStream({
            cancel() {
              throw new Error("transport already disconnected");
            },
          }),
          { status: 403 },
        ),
      wait: async () => {},
      delays: [],
    }),
  ).rejects.toMatchObject({
    code: "REGISTRY_HTTP_ERROR",
    attempts: 1,
    retryable: false,
  });
});
