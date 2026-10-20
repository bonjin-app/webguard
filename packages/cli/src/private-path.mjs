/** Raw development/server files and local deployment controls are not public payload. */
export function isPrivatePath(path) {
  const normalized = path.replaceAll("\\", "/");
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
