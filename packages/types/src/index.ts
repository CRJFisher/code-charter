export * from './backend';
export * from './flows';
export * from './graph_store';
export * from './theme';
export { get_docstring } from './docstring';

// Ariadne types surface through this barrel so consumers depend on @code-charter/types alone.
export type { CallableNode, CallGraph, CallReference, IndirectReachability, SymbolId, SymbolName, AnyDefinition } from '@ariadnejs/types';

// Maps don't survive JSON.stringify, so the call graph crosses the postMessage boundary in this wire format.
export {
  serialize_call_graph,
  deserialize_call_graph,
} from './call_graph_serialization';
export type { SerializedCallGraph } from './call_graph_serialization';