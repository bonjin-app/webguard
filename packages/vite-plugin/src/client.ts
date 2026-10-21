/** Browser-safe controller for the SDK injected by webguardApp(). Undefined before startup or during SSR. */
export { getAutoGuard as getWebGuard } from "@webguard/browser";
export type {
  WebGuardInstance,
  WebGuardOptions,
  ThreatEvent,
  DebuggingPolicy,
  DomIntegrityPolicy,
} from "@webguard/browser";
