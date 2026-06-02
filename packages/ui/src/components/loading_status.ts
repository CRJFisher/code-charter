
export enum CodeIndexStatus {
    Indexing = 'Indexing',
    Error = 'Error',
    Ready = 'Ready',
}

/** The per-flow render lifecycle (task-27.1.3): one async `render_flow` call, no two-stage fetch. */
export enum FlowRenderStatus {
    Rendering = 'Rendering',
    Error = 'Error',
    Ready = 'Ready',
}