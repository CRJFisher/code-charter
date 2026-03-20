// Extract display name from a symbol id
// v0.8 SymbolId format: "kind:file_path:start_line:start_col:end_line:end_col:name"
export function symbol_display_name(symbol_id: string): string {
  if (!symbol_id) return "";
  const parts = symbol_id.split(":");
  return parts[parts.length - 1] || symbol_id;
}
