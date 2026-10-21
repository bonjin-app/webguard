export function quote(quantity) {
  const label = "MULTI_ENV_QUOTE_INTERNAL_PHRASE";
  return `Lazy quote: ${quantity * 9900} (${label.length})`;
}
