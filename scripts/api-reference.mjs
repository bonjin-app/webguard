import ts from "typescript";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderGuideMarkdown } from "./public-guides.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Inspect declarations only: never execute a package, server, browser initializer or CLI. */
export function collectPublicApi(repository = root) {
  const metadata = JSON.parse(
    readFileSync(join(repository, "packages/npm/package.json"), "utf8"),
  );
  const config = ts.readConfigFile(
    join(repository, "tsconfig.json"),
    ts.sys.readFile,
  );
  if (config.error)
    throw new Error("Unable to read API compiler configuration");
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    repository,
  );
  const entries = Object.entries(metadata.exports).map(([path, entry]) => {
    if (path === "./browser.global.js")
      return { path: "/browser.global.js", global: true };
    const declaration = typeof entry === "object" ? entry.types : undefined;
    const match = /^\.\/dist\/([a-z-]+)\.d\.ts$/.exec(declaration ?? "");
    if (!match) throw new Error(`Unknown public declaration entry: ${path}`);
    return {
      path: path === "." ? "." : path.slice(1),
      file: join(repository, "packages/npm/src", match[1] + ".ts"),
    };
  });
  const program = ts.createProgram(
    entries.filter((entry) => entry.file).map((entry) => entry.file),
    parsed.options,
  );
  const checker = program.getTypeChecker();
  const resolveSymbol = (symbol) =>
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const modules = [];
  let browserExports;
  const methods = [];
  for (const entry of entries.filter((entry) => !entry.global)) {
    const file = program.getSourceFile(entry.file);
    const module = file && checker.getSymbolAtLocation(file);
    if (!module) throw new Error(`Missing public source module: ${entry.path}`);
    const symbols = checker.getExportsOfModule(module);
    const values = [],
      types = [];
    for (const symbol of symbols) {
      const actual = resolveSymbol(symbol);
      if (actual.flags & ts.SymbolFlags.Value) values.push(symbol.name);
      if (actual.flags & ts.SymbolFlags.Type) types.push(symbol.name);
      if (
        entry.path === "/browser" &&
        ["WebGuard", "WebGuardInstance"].includes(symbol.name)
      ) {
        const type =
          symbol.name === "WebGuardInstance"
            ? checker.getDeclaredTypeOfSymbol(actual)
            : checker.getTypeOfSymbolAtLocation(
                actual,
                actual.valueDeclaration ?? file,
              );
        for (const member of checker.getPropertiesOfType(type)) {
          const memberType = checker.getTypeOfSymbolAtLocation(
            member,
            member.valueDeclaration ?? file,
          );
          if (memberType.getCallSignatures().length)
            methods.push(symbol.name + "." + member.name);
        }
      }
    }
    const result = {
      path: entry.path,
      values: values.sort(),
      types: types.sort(),
    };
    modules.push(result);
    if (entry.path === "/browser") browserExports = result;
  }
  if (!browserExports) throw new Error("Missing browser declaration exports");
  for (const entry of entries.filter((entry) => entry.global))
    modules.push({
      path: entry.path,
      values: [...browserExports.values],
      types: [],
    });
  return {
    modules,
    methods: methods.sort(),
    bins: Object.keys(metadata.bin).sort(),
  };
}

/** Export names and SDK methods must resolve to actual, nonempty documentation sections. */
export async function validateApiReference({
  directory = join(root, "docs"),
  inventory = collectPublicApi(),
  mapping,
} = {}) {
  mapping ??= JSON.parse(
    await readFile(join(directory, "api-reference-map.json"), "utf8"),
  );
  const errors = [],
    documents = new Map();
  const check = async (name, target) => {
    const match =
      /^(API(?:_BROWSER|_BUILD|_INTEGRATIONS)?\.ko\.md)#([a-z0-9_-]+)$/.exec(
        target ?? "",
      );
    if (!match) {
      errors.push(`Missing or invalid API reference: ${name}`);
      return;
    }
    const [, file, anchor] = match;
    if (!documents.has(file)) {
      const markdown = await readFile(join(directory, file), "utf8");
      documents.set(file, {
        markdown,
        rendered: renderGuideMarkdown(markdown, file),
      });
    }
    const { markdown, rendered } = documents.get(file);
    if (!rendered.headings.some((heading) => heading.id === anchor))
      errors.push(`Missing API anchor ${anchor} for ${name}`);
    if (!markdown.includes(name.split(".").at(-1)))
      errors.push(`API symbol ${name} is not explained in ${file}`);
  };
  const knownModules = new Set(inventory.modules.map((module) => module.path));
  for (const name of Object.keys(mapping.modules ?? {}))
    if (!knownModules.has(name))
      errors.push(`Non-public module documented as export: ${name}`);
  let symbols = 0;
  for (const module of inventory.modules) {
    const expected = new Set([...module.values, ...module.types]);
    const section = mapping.modules?.[module.path] ?? {};
    for (const name of Object.keys(section))
      if (!expected.has(name))
        errors.push(`Non-public export ${module.path}: ${name}`);
    for (const name of expected) {
      await check(name, section[name]);
      symbols++;
    }
  }
  for (const name of Object.keys(mapping.methods ?? {}))
    if (!inventory.methods.includes(name))
      errors.push(`Non-public SDK method ${name}`);
  for (const method of inventory.methods)
    await check(method, mapping.methods?.[method]);
  for (const name of Object.keys(mapping.bins ?? {}))
    if (!(inventory.bins ?? []).includes(name))
      errors.push(`Non-public CLI ${name}`);
  for (const bin of inventory.bins ?? []) await check(bin, mapping.bins?.[bin]);
  if (errors.length) throw new Error(errors.join("\n"));
  return {
    modules: inventory.modules.length,
    symbols,
    methods: inventory.methods.length,
    bins: (inventory.bins ?? []).length,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  validateApiReference()
    .then((result) =>
      console.log("API reference coverage: " + JSON.stringify(result)),
    )
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
