import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const editions = [
  "README.md",
  "README.ko.md",
  "README.ja.md",
  "README.zh-CN.md",
];

// Bounded to this repository's inline links and fenced examples. Prose and
// translated comments may differ; executable tokens and destinations may not.
function inspect(markdown) {
  const examples = [];
  const prose = markdown.replace(
    /^```(\w*)\r?\n([\s\S]*?)^```[ \t]*$/gm,
    (_, language, code) => {
      examples.push({ language, code });
      return "";
    },
  );
  if (/^```/m.test(prose))
    throw new Error("Unclosed or unsupported code fence");
  return {
    examples,
    links: [...prose.matchAll(/\]\(([^\s)]+)\)/g)].map((match) => match[1]),
    headings: [...prose.matchAll(/^(#{1,6}) /gm)].map(
      (match) => match[1].length,
    ),
  };
}

function tokens({ language, code }) {
  if (language === "ts" || language === "js") {
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      true,
      ts.LanguageVariant.Standard,
      code,
    );
    const result = [];
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    )
      result.push([token, scanner.getTokenText()]);
    return { language, tokens: result };
  }
  return {
    language,
    code: code
      .replace(/<!--[\s\S]*?-->/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !(language === "sh" && line.startsWith("#"))),
  };
}

async function typeCheck(examples) {
  const typed = examples.filter(({ language }) =>
    ["js", "ts"].includes(language),
  );
  if (!typed.length) return 0;
  const configFile = ts.readConfigFile(
    join(root, "tsconfig.json"),
    ts.sys.readFile,
  );
  if (configFile.error)
    throw new Error("Unable to read TypeScript configuration");
  const { options } = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    root,
  );
  const metadata = JSON.parse(
    await readFile(join(root, "packages/npm/package.json"), "utf8"),
  );
  const paths = { ...options.paths };
  for (const [entry, definition] of Object.entries(metadata.exports)) {
    if (typeof definition !== "object" || !definition.types) continue;
    paths[metadata.name + (entry === "." ? "" : entry.slice(1))] = [
      join(
        root,
        "packages/npm/src",
        definition.types.replace(/^\.\/dist\//, "").replace(/\.d\.ts$/, ".ts"),
      ),
    ];
  }
  const vite = ts.resolveModuleName(
    "vite",
    join(root, "README.example.ts"),
    options,
    ts.sys,
  ).resolvedModule;
  if (!vite)
    throw new Error(
      "Install workspace dependencies before checking README examples",
    );
  paths.vite = [vite.resolvedFileName];
  const temporary = await mkdtemp(join(tmpdir(), "webguard-readme-types-"));
  try {
    const files = [];
    for (const [index, example] of typed.entries()) {
      const file = join(temporary, `example-${index + 1}.ts`);
      // The standalone IIFE exports the same namespace as /browser. Declare it
      // for checking only; examples and browser initializers are never executed.
      await writeFile(
        file,
        `export {};\ndeclare const WebGuardSDK: typeof import(${JSON.stringify(metadata.name + "/browser")});\n${example.code}`,
      );
      files.push(file);
    }
    const program = ts.createProgram(files, {
      ...options,
      paths,
      noEmit: true,
      declaration: false,
    });
    const errors = ts.getPreEmitDiagnostics(program);
    if (errors.length)
      throw new Error(
        ts.formatDiagnostics(errors, {
          getCurrentDirectory: () => root,
          getCanonicalFileName: (file) => file,
          getNewLine: () => "\n",
        }),
      );
    return files.length;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** Inspect documentation and source declarations; never execute install examples. */
export async function validateReadmes({ directory = root } = {}) {
  const documents = [];
  const errors = [];
  let relativeLinks = 0;
  let codeBlocks = 0;
  for (const file of editions) {
    try {
      const document = inspect(await readFile(join(directory, file), "utf8"));
      documents.push({ file, ...document });
      for (const target of editions)
        if (!document.links.includes(target))
          errors.push(`${file}: missing language navigation ${target}`);
      for (const link of document.links) {
        if (/^(?:https?:|mailto:|#)/i.test(link)) continue;
        const target = resolve(directory, dirname(file), link.split("#")[0]);
        try {
          await access(target);
          relativeLinks++;
        } catch {
          errors.push(`${file}: missing relative link ${link}`);
        }
      }
      for (const { language, code } of document.examples) {
        codeBlocks++;
        if (!["ts", "js"].includes(language)) continue;
        const parsed = ts.createSourceFile(
          `${file}.${language}`,
          code,
          ts.ScriptTarget.Latest,
          true,
          language === "ts" ? ts.ScriptKind.TS : ts.ScriptKind.JS,
        );
        if (parsed.parseDiagnostics.length)
          errors.push(`${file}: code syntax error`);
      }
    } catch (error) {
      errors.push(`${file}: ${error.message}`);
    }
  }
  const baseline = documents.find(({ file }) => file === "README.md");
  if (baseline) {
    for (const document of documents.filter(
      ({ file }) => file !== "README.md",
    )) {
      if (JSON.stringify(document.links) !== JSON.stringify(baseline.links))
        errors.push(`${document.file}: link destinations differ from English`);
      if (
        JSON.stringify(document.headings) !== JSON.stringify(baseline.headings)
      )
        errors.push(`${document.file}: heading structure differs from English`);
      if (
        JSON.stringify(document.examples.map(tokens)) !==
        JSON.stringify(baseline.examples.map(tokens))
      )
        errors.push(`${document.file}: executable code differs from English`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const typedExamples = await typeCheck(baseline.examples);
  return {
    languages: documents.length,
    relativeLinks,
    codeBlocks,
    typedExamples,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      "README verification:",
      JSON.stringify(await validateReadmes()),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
