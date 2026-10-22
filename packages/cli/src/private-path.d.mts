/** Whether a relative build path or decoded request path is a non-public input. */
export function isPrivatePath(path: string): boolean;
/** Whether a build path wraps JavaScript/CSS in one or more gzip/Brotli suffixes. */
export function isPrecompressedCodePath(path: string): boolean;

/** Whether an editor/backup suffix (optionally compressed) makes a file non-public. */
export function isBackupPath(path: string): boolean;
