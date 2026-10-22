/** Precompressed code cannot be trusted to match the transformed public bytes. */
export function isPrecompressedCodePath(path) {
  return /\.(?:[cm]?js|css)(?:\.(?:gz|br))+$/i.test(path);
}

/** Editor/backup copies must never bypass protection through an alternate suffix. */
export function isBackupPath(path) {
  const uncompressed = path.replace(/(?:\.(?:gz|br))+$/i, "");
  return /(?:\.(?:bak|backup|old|orig|save|swp|swo|tmp)|~)$/i.test(
    uncompressed,
  );
}

/** Raw development/server files and local deployment controls are not public payload. */
export function isPrivatePath(path) {
  if (isPrecompressedCodePath(path) || isBackupPath(path)) return true;
  // Classify the underlying filename without decoding untrusted compressed bytes.
  // All terminal wrappers are removed, including mixed/repeated gzip/Brotli suffixes.
  const normalized = path
    .replaceAll("\\", "/")
    .replace(/(?:\.(?:gz|br))+$/i, "");
  // Distribution notices must accompany the application that embeds these libraries.
  if (
    ["third-party-licenses.md", "/third-party-licenses.md"].includes(
      normalized.toLowerCase(),
    )
  )
    return false;
  return (
    normalized
      .split("/")
      .some(
        (part) =>
          part.startsWith(".") ||
          /^(?:src|server|private|node_modules|tests?|__tests__|coverage)$/i.test(
            part,
          ),
      ) ||
    /\.(?:map|[cm]?ts|tsx|jsx|jsp|jspx|java|php|phtml|asp|aspx|ascx|ashx|cshtml|cgi|py|rb|sh|vue|svelte|coffee|env|md|ya?ml|toml|lock|log)$/i.test(
      normalized,
    ) ||
    /(?:^|\/)(?:_headers|webguard-(?:headers|report)\.json|package(?:-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/i.test(
      normalized,
    ) ||
    /(?:^|\/)[^/]*config\.(?:js|mjs|cjs|json)$/i.test(normalized) ||
    /^\/?server\.[cm]?js$/i.test(normalized)
  );
}
