// Export backend functionality
export * from "./backends";
export * from "./hooks";

// Export components
export { CodeCharterUI } from "./components/code_charter_ui";
export { App } from "./components/App";

// Re-export types that consumers might need
export type { CodeIndexStatus } from "./components/loading_status";

// Default export
import { CodeCharterUI } from "./components/code_charter_ui";
export default CodeCharterUI;