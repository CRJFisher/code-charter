import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemedApp } from '@code-charter/ui';
import '@code-charter/ui/dist/index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <ThemedApp forceStandalone={true} />
  </React.StrictMode>
);
