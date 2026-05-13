import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemedApp, create_backend, BackendType } from './index';
import './styles/index.css';

export function init(config?: { forceStandalone?: boolean }): void {
  const root_element = document.getElementById('root');
  if (!root_element) {
    console.error('CodeCharterUI: No root element found');
    return;
  }

  const root = ReactDOM.createRoot(root_element);
  root.render(
    <React.StrictMode>
      <ThemedApp forceStandalone={config?.forceStandalone} />
    </React.StrictMode>
  );
}

export { create_backend, BackendType };
