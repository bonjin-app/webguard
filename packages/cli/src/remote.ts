import { hashContent, type IntegrityManifest } from "@webguard/integrity";
export interface DeploymentCheck {
  valid: boolean;
  errors: string[];
  checked: number;
}
/** Compare a deployment with a locally trusted manifest. Does not trust a remote manifest. */
export async function verifyDeployment(
  baseUrl: string,
  manifest: IntegrityManifest,
  removedSources: string[] = [],
): Promise<DeploymentCheck> {
  const base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol))
    throw new Error("Deployment URL must use HTTP(S)");
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  base.search = "";
  base.hash = "";
  const errors: string[] = [];
  let checked = 0;
  const safe = (path: string) => {
    if (
      !path ||
      path.split("/").some((p) => p === ".." || p === ".") ||
      path.startsWith("/") ||
      /[\\?#]/.test(path) ||
      [...path].some((c) => c.charCodeAt(0) < 32) ||
      path.includes("%")
    )
      throw new Error("Unsafe deployment path");
    return new URL(path.split("/").map(encodeURIComponent).join("/"), base);
  };
  for (const [path, entry] of Object.entries(manifest.files)) {
    const response = await fetch(safe(path), {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    checked++;
    if (!response.ok) {
      errors.push(`Missing deployed asset: ${path} (${response.status})`);
      continue;
    }
    const content = new Uint8Array(await response.arrayBuffer());
    if (
      content.byteLength !== entry.size ||
      hashContent(content) !== entry.integrity
    )
      errors.push(`Deployed hash mismatch: ${path}`);
  }
  const probes = new Set([
    ...Object.keys(manifest.files)
      .filter((p) => /\.[cm]?js$|\.css$/i.test(p))
      .map((p) => `${p}.map`),
    ...removedSources,
  ]);
  for (const path of probes) {
    const response = await fetch(safe(path), {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    checked++;
    if (response.status === 404 || response.status === 410) continue;
    errors.push(
      response.ok
        ? `Source URL responds successfully (review SPA fallbacks): ${path}`
        : `Source URL absence not confirmed: ${path} (${response.status})`,
    );
  }
  return { valid: errors.length === 0, errors, checked };
}
