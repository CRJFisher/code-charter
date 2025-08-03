// Extract display name from a symbol
export function symbolDisplayName(symbol: string): string {
  // Handle different symbol formats
  // e.g., "module::class::function" -> "function"
  // e.g., "function" -> "function"
  const parts = symbol.split("::");
  return parts[parts.length - 1] || symbol;
}