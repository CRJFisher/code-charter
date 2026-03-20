// Extract display name from a symbol
// Ariadne format: "module_path#symbol_name" (e.g., "src/utils#process_data")
export function symbolDisplayName(symbol: string): string {
  const hash_index = symbol.indexOf('#');
  if (hash_index !== -1) {
    return symbol.substring(hash_index + 1);
  }
  return symbol;
}