/**
 * The reconcile engine's public surface, re-exported by the package root (`@code-charter/drift`).
 * Internal reconcile collaborators and the `drift-reconcile` bin import directly from the sibling
 * modules; only the symbols the package root publishes are grouped here.
 */

export { reconcile } from "./reconcile";
export { make_ariadne_adapter } from "./ariadne_adapter";
export type { AriadneAdapter } from "./ariadne_adapter";
export { HeadlessProject } from "./headless_project";
export type { DeferredRetirement, FlowAction, FlowOutcome, ReconcileDeps, ReconcileResult } from "./types";
