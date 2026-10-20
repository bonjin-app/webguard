import { lstat, readdir, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export async function listFiles(directory: string): Promise<string[]> {
  if (
    !(await lstat(directory)).isDirectory() ||
    (await lstat(directory)).isSymbolicLink()
  )
    throw new Error("Input must be a real directory, not a symbolic link");
  const files: string[] = [];
  async function visit(path: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      const stat = await lstat(full);
      if (stat.isSymbolicLink())
        throw new Error(
          `Symbolic links are not allowed: ${relative(directory, full)}`,
        );
      if (stat.isDirectory()) await visit(full);
      else if (stat.isFile())
        files.push(relative(directory, full).split(sep).join("/"));
      else
        throw new Error(
          `Unsupported filesystem entry: ${relative(directory, full)}`,
        );
    }
  }
  await visit(directory);
  return files.sort();
}
export async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return resolve(await canonicalPath(parent), relative(parent, path));
  }
}
export function overlaps(a: string, b: string): boolean {
  const rel = relative(a, b);
  return (
    !rel ||
    (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep))
  );
}
export async function assertAbsent(path: string) {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Destination already exists: ${path}`);
}
/** Remove actual CSS mapping comments without rewriting quoted CSS content. */
export function stripCssSourceMaps(source: string): string {
  let result = "",
    index = 0,
    quote = "";
  while (index < source.length) {
    const char = source[index]!;
    if (quote) {
      result += char;
      index++;
      if (char === "\\" && index < source.length) result += source[index++]!;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      index++;
      continue;
    }
    if (source.slice(index, index + 2) === "/*") {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) throw new Error("Unterminated CSS comment");
      const comment = source.slice(index, end + 2);
      if (!/^\/\*[#@]\s*sourceMappingURL\s*=/.test(comment)) result += comment;
      index = end + 2;
      continue;
    }
    result += char;
    index++;
  }
  return result;
}
