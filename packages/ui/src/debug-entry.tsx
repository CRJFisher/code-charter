/**
 * Debug entry point for running UI components in Node.js environment
 * This allows setting breakpoints in VS Code for UI code debugging
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { CodeCharterUI } from './components/code_charter_ui';
import { BackendProvider } from './contexts/backend_context';
import { MockBackend } from './backends/mock_backend';

// Mock data for debugging
const mockCallGraph = {
  nodes: {
    "main": {
      symbol: "main",
      label: "main",
      file_path: "src/index.ts",
      line_number: 1,
      docstring: "Entry point"
    },
    "helper": {
      symbol: "helper", 
      label: "helper",
      file_path: "src/helper.ts",
      line_number: 10,
      docstring: "Helper function"
    }
  },
  edges: [
    {
      source: "main",
      target: "helper"
    }
  ]
};

// Set up debugging environment
console.log('🚀 UI Debug Server Starting...');

// Create mock backend
const mockBackend = new MockBackend({
  callGraph: mockCallGraph,
  refinedSummaries: {
    "main": "Main entry point of the application",
    "helper": "Helper utility function"
  }
});

// Test render the component
console.log('📦 Testing component render...');

try {
  const html = renderToString(
    <BackendProvider backend={mockBackend}>
      <CodeCharterUI />
    </BackendProvider>
  );
  
  console.log('✅ Component rendered successfully!');
  console.log(`📏 HTML length: ${html.length} characters`);
  
  // Set a breakpoint here to inspect the rendered output
  debugger;
  
} catch (error) {
  console.error('❌ Error rendering component:', error);
}

// Keep the process running for debugging
console.log('🔍 Debug server ready. Set breakpoints in UI code and refresh to test.');
console.log('Press Ctrl+C to stop.');

// Prevent process from exiting
setInterval(() => {
  // Keep alive
}, 1000);