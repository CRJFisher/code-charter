// Export backend functionality
export * from "./backends";
export * from "./hooks";

// Export components
export { App } from "./components/App";
export { ThemedApp } from "./components/themed_app";
export type { ThemedAppProps } from "./components/themed_app";

// Export theme functionality
export * from "./theme";

// Re-export types that consumers might need
export type { CodeIndexStatus } from "./components/loading_status";

// Default export
import { App } from "./components/App";
export default App;