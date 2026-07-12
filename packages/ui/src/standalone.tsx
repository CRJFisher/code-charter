import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemedApp } from './components/themed_app';
import './styles/index.css';

export function init(config?: { force_standalone?: boolean }): void {
  const root_element = document.getElementById('root');
  if (!root_element) {
    console.error('CodeCharterUI: No root element found');
    return;
  }

  const root = ReactDOM.createRoot(root_element);
  root.render(
    <React.StrictMode>
      <ThemedApp force_standalone={config?.force_standalone} />
    </React.StrictMode>
  );
}
