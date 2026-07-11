import '@testing-library/jest-dom';

// jsdom does not implement matchMedia; the standalone theme provider queries
// prefers-color-scheme through it. Default to a light, inert media query list.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// acquireVsCodeApi exists only inside the VS Code webview host; jsdom has no
// such global. Provide a default so backend/theme detection can probe for it;
// individual suites override or delete it to exercise both hosts.
global.acquireVsCodeApi = jest.fn(() => ({
  postMessage: jest.fn(),
  getState: jest.fn(),
  setState: jest.fn(),
}));