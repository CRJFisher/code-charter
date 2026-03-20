import type { CallReference, SymbolId } from "@ariadnejs/types";

export function get_resolved_symbol_id(call_ref: CallReference): SymbolId | undefined {
  return call_ref.resolutions[0]?.symbol_id;
}

export function get_all_resolved_ids(call_ref: CallReference): SymbolId[] {
  return call_ref.resolutions.map((r) => r.symbol_id);
}
