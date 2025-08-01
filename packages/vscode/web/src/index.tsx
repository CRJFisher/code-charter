import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemedApp, BackendProvider, BackendType } from '@code-charter/ui';
import '@code-charter/ui/dist/index.css';
import './index.css';

// Configure the backend for VSCode
BackendProvider.resetBackend();
const config = {
  type: BackendType.VSCODE
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <ThemedApp />
);