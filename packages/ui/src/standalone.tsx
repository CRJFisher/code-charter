import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemedApp, create_backend, BackendType } from './index';
import './styles/index.css';

// Make the UI available globally
declare global {
  interface Window {
    CodeCharterUI: {
      init: (config?: { forceStandalone?: boolean }) => void;
      create_backend: typeof create_backend;
      BackendType: typeof BackendType;
    };
  }
}

// Initialize function that can be called from the host environment
function init(config?: { forceStandalone?: boolean }) {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('CodeCharterUI: No root element found');
    return;
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ThemedApp forceStandalone={config?.forceStandalone} />
    </React.StrictMode>
  );
}

// Expose the UI on the window object
window.CodeCharterUI = {
  init,
  create_backend,
  BackendType
};

// Auto-initialize if there's a root element and we're not in a module context
if (document.getElementById('root') && !window.CodeCharterUI) {
  init();
}