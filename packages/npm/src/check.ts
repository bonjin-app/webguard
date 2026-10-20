#!/usr/bin/env node
import { checkDeployment } from "./verify.js";

const usage =
  "Usage: webguard-check <directory> --url <base-url>\nExample: webguard-check dist --url https://site.example/";
const args = process.argv.slice(2);
if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  console.log(usage);
} else if (
  args.length !== 3 ||
  !args[0] ||
  args[0].startsWith("-") ||
  args[1] !== "--url" ||
  !args[2] ||
  args[2].startsWith("-")
) {
  console.log(
    JSON.stringify({ valid: false, errors: [usage], checked: 0 }, null, 2),
  );
  process.exitCode = 1;
} else {
  try {
    const result = await checkDeployment(args[0], args[2]);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } catch {
    console.log(
      JSON.stringify(
        { valid: false, errors: ["Unable to check deployment"], checked: 0 },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
