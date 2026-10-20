export {
  protectDirectory,
  type ProtectOptions,
  type ProtectionReport,
} from "./pipeline.js";
export { scanDirectory, hasPotentialCredential, type Finding } from "./scan.js";
export { stripCssSourceMaps } from "./fs-utils.js";
export { verifyDeployment, type DeploymentCheck } from "./remote.js";
