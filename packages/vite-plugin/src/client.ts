/** Browser-safe controller for the SDK injected by webguardApp(). Undefined before startup or during SSR. */
export { getAutoGuard as getWebGuard } from "@webguard/browser";
export type {
  WebGuardInstance,
  WebGuardStatus,
  WebGuardOptions,
  ThreatEvent,
  DebuggingPolicy,
  DebuggingState,
  DomIntegrityPolicy,
} from "@webguard/browser";
