import { createHash } from "node:crypto";
import { posix } from "node:path";
import { realpathSync } from "node:fs";

export interface DomIdentifierOptions {
  /** The same project root must be used by server and browser builds. */
  root: string;
}

/** Build-only CSS Modules naming. This does not hide rendered DOM or global selectors. */
export function createDomIdentifierGenerator(options: DomIdentifierOptions) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => key !== "root") ||
    typeof options.root !== "string" ||
    !options.root.trim()
  )
    throw new TypeError("DOM identifiers require an absolute project root");
  const normalize = (value: string) => {
    // Vite resolves source symlinks (including macOS /var -> /private/var).
    // Canonicalize existing paths equally so the root does not enter emitted names.
    let canonical = value;
    try {
      canonical = realpathSync.native(value);
    } catch {
      /* Virtual compiler paths need not exist on this machine. */
    }
    return posix.normalize(canonical.replaceAll("\\", "/"));
  };
  const root = normalize(options.root).replace(/\/$/, "") || "/";
  if (!posix.isAbsolute(root) && !/^[a-z]:\//i.test(root))
    throw new TypeError("DOM identifiers require an absolute project root");
  return (localName: string, filename: string): string => {
    if (
      typeof localName !== "string" ||
      !localName ||
      localName.length > 4096 ||
      typeof filename !== "string" ||
      !filename ||
      filename.length > 32768
    )
      throw new TypeError(
        "DOM identifiers require a CSS local name and filename",
      );
    const file = normalize(filename.split(/[?#]/, 1)[0]!);
    if (!posix.isAbsolute(file) && !/^[a-z]:\//i.test(file))
      throw new TypeError("DOM identifier filenames must be absolute");
    const relative = posix.relative(root, file);
    return (
      "wg_" +
      createHash("sha256")
        .update("webguard-css-module-v1\0" + relative + "\0" + localName)
        .digest("hex")
        .slice(0, 24)
    );
  };
}
