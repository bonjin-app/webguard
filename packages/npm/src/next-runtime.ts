import { installAutoGuard, type WebGuardOptions } from "@webguard/browser";

declare const __WEBGUARD_NEXT_RUNTIME_OPTIONS__: WebGuardOptions;

// Entry injection is client-only. This additional guard also makes direct SSR
// evaluation harmless. Installing listeners does not change the hydration tree.
if (typeof window !== "undefined" && typeof document !== "undefined")
  installAutoGuard(__WEBGUARD_NEXT_RUNTIME_OPTIONS__);
