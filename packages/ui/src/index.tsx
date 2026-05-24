// Backend functionality
export { create_backend, BackendType, type BackendConfig } from "./backends/backend_provider";
export { VSCodeBackend } from "./backends/vscode_backend";
export { MockBackend } from "./backends/mock_backend";

// Hooks
export { use_backend } from "./hooks/use_backend";
export { use_debounce } from "./hooks/use_debounce";
export { use_throttle } from "./hooks/use_throttle";

// Components
export { App } from "./components/app";
export { ThemedApp } from "./components/themed_app";
export type { ThemedAppProps } from "./components/themed_app";

// Theme functionality
export { ThemeProviderComponent, use_theme } from "./theme/theme_context";
export { ThemeSwitcher } from "./theme/theme_switcher";
export { VSCodeThemeProvider } from "./theme/vscode_theme_provider";
export { StandaloneThemeProvider } from "./theme/standalone_theme_provider";
export { default_themes, dark_theme, light_theme } from "./theme/default_themes";

// Types
export type { CodeIndexStatus } from "./components/loading_status";

// Default export
import { App } from "./components/app";
export default App;
