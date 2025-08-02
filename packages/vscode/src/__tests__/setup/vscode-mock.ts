// Mock implementation of vscode module for testing
const mockFileWatcherCallbacks: any = {};
const mockDocumentChangeCallback: any = { callback: null };
const mockEventEmitter: any = { 
  instance: null,
  callback: null 
};

module.exports = {
  workspace: {
    createFileSystemWatcher: jest.fn(() => ({
      onDidCreate: jest.fn((callback) => {
        mockFileWatcherCallbacks.onCreate = callback;
        return { dispose: jest.fn() };
      }),
      onDidChange: jest.fn((callback) => {
        mockFileWatcherCallbacks.onChange = callback;
        return { dispose: jest.fn() };
      }),
      onDidDelete: jest.fn((callback) => {
        mockFileWatcherCallbacks.onDelete = callback;
        return { dispose: jest.fn() };
      }),
      dispose: jest.fn()
    })),
    onDidChangeTextDocument: jest.fn((callback) => {
      mockDocumentChangeCallback.callback = callback;
      return { dispose: jest.fn() };
    }),
    getConfiguration: jest.fn(() => ({
      get: jest.fn()
    })),
    workspaceFolders: []
  },
  RelativePattern: jest.fn((base, pattern) => ({ base, pattern })),
  EventEmitter: jest.fn(() => {
    const emitter = {
      event: jest.fn((callback: any) => {
        mockEventEmitter.callback = callback;
        return callback;
      }),
      fire: jest.fn((data: any) => {
        if (mockEventEmitter.callback) {
          mockEventEmitter.callback(data);
        }
      }),
      dispose: jest.fn()
    };
    mockEventEmitter.instance = emitter;
    return emitter;
  }),
  Disposable: jest.fn(),
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: "file" })
  },
  window: {
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn()
  },
  FileSystemWatcher: jest.fn(),
  TextDocument: jest.fn(),
  TextDocumentContentChangeEvent: jest.fn(),
  // Export helpers for tests
  __mockHelpers: {
    mockFileWatcherCallbacks,
    mockDocumentChangeCallback,
    mockEventEmitter
  }
};