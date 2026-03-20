import type { SymbolId } from "@ariadnejs/types";

export function symbol_repo_local_name(symbol: SymbolId | string): string {
  const parts = symbol.split(":");
  return parts[parts.length - 1] || symbol;
}

export function symbol_display_name(symbol: SymbolId | string): string {
  const parts = symbol.split(":");
  return parts[parts.length - 1] || symbol;
}
