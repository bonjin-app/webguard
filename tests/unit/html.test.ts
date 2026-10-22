import { expect, it } from "vitest";
import { addSubresourceIntegrity } from "../../packages/cli/src/html";
import { hashContent } from "@webguard/integrity";
it("resolves resources against the first HTML base element", () => {
  const html = addSubresourceIntegrity(
    '<base href="/static/"><script src="app.js"></script>',
    "index.html",
    new Map([
      ["app.js", Buffer.from("wrong")],
      ["static/app.js", Buffer.from("served")],
    ]),
  );
  expect(html).toContain(hashContent("served"));
  expect(html).not.toContain(hashContent("wrong"));
});
it("maps a deployment subpath to local assets while skipping unrelated origins", () => {
  const html = addSubresourceIntegrity(
    '<script src="/prefix/assets/app.js"></script><script src="https://external.example/app.js"></script>',
    "index.html",
    new Map([["assets/app.js", Buffer.from("served")]]),
    "/prefix/",
  );
  expect(html).toContain(hashContent("served"));
  expect(html.match(/integrity=/g)).toHaveLength(1);
});
import { sanitizeInlineSources } from "../../packages/cli/src/html";
it("removes map directives in legacy JavaScript MIME scripts and inert template content", () => {
  const html = sanitizeInlineSources(
    '<script type="application/x-javascript">globalThis.legacy=1;\n//# sourceMappingURL=data:application/json;base64,private\n</script><template><script>globalThis.later=1;\n//# sourceMappingURL=data:application/json;base64,private\n</script><style>a{}/*# sourceMappingURL=data:application/json;base64,private */</style></template>',
  );
  expect(html).not.toContain("base64,private");
});

it.each([
  "StyleSheet",
  "alternate stylesheet",
  "\tMODULEPRELOAD\n",
  "stylesheet\falternate",
])("adds final-byte SRI to valid rel tokens %j", (rel) => {
  const html = addSubresourceIntegrity(
    `<link rel="${rel}" href="assets/app.css" integrity="sha384-old">`,
    "index.html",
    new Map([["assets/app.css", Buffer.from("body{color:blue}")]]),
  );
  expect(html).toContain(hashContent("body{color:blue}"));
  expect(html).not.toContain("sha384-old");
  expect(html).toContain('crossorigin="anonymous"');
});
it.each(["preload", "notstylesheet", "modulepreloadx", "icon"])(
  "leaves unsupported rel %s unchanged",
  (rel) => {
    const html = addSubresourceIntegrity(
      `<link rel="${rel}" href="assets/app.css">`,
      "index.html",
      new Map([["assets/app.css", Buffer.from("body{}")]]),
    );
    expect(html).not.toContain("integrity=");
  },
);
