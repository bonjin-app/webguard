export interface ContentSnapshot {
  version: 1;
  files: Array<{ path: string; sha256: string }>;
}
export interface PackageSnapshotOptions {
  listFiles?: (directory: string) => string[] | Promise<string[]>;
}
export interface SourceSnapshotOptions {
  inputs?: string[];
}
export const sourceInputs: string[];
export function listPackageFiles(directory: string): string[];
export function capturePackageSnapshot(
  directory: string,
  options?: PackageSnapshotOptions,
): Promise<ContentSnapshot>;
export function captureSourceSnapshot(
  root: string,
  options?: SourceSnapshotOptions,
): Promise<ContentSnapshot>;
export function assertPackageFreshness(
  directory: string,
  record: { packageSnapshot?: ContentSnapshot },
  options?: PackageSnapshotOptions,
): Promise<void>;
export function assertSourceFreshness(
  root: string,
  record: { sourceSnapshot?: ContentSnapshot },
  options?: SourceSnapshotOptions,
): Promise<void>;
