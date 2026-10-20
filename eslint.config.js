import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      ".demo-dist/**",
      ".demo-stage-*/**",
      ".demo-backup-*/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "pnpm-lock.yaml",
      "docs/**",
      "examples/jsp-servlet/src/main/webapp/assets/**",
      "examples/jsp-servlet/target/**",
      ".playwright-cli/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        performance: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        self: "readonly",
        postMessage: "readonly",
        onmessage: "writable",
        Worker: "readonly",
        Blob: "readonly",
        TextEncoder: "readonly",
        MessageChannel: "readonly",
        crypto: "readonly",
        HTMLElement: "readonly",
        location: "readonly",
        alert: "readonly",
        requestAnimationFrame: "readonly",
        CustomEvent: "readonly",
      },
    },
  },
);
