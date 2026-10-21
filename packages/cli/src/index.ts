export {
  protectDirectory,
  type ProtectOptions,
  type ProtectionReport,
} from "./pipeline.js";
export { scanDirectory, hasPotentialCredential, type Finding } from "./scan.js";
export { stripCssSourceMaps } from "./fs-utils.js";
export {
  verifyDeployment,
  type DeploymentCheck,
  type DeploymentCheckOptions,
} from "./remote.js";
export { checkDeployment } from "./check.js";
export { protectAppDirectory, type ProtectAppOptions } from "./application.js";
export {
  createDomIdentifierGenerator,
  type DomIdentifierOptions,
} from "./dom-identifiers.js";
