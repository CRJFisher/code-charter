import { VSCodeBackend } from '../vscode_backend';

// Mock VS Code API
const mockPostMessage = jest.fn();
const mockVsCodeApi = {
  postMessage: mockPostMessage,
  getState: jest.fn(),
  setState: jest.fn(),
};

// Replace the global function
(global as any).acquireVsCodeApi = jest.fn(() => mockVsCodeApi);

describe('VSCodeBackend', () => {
  let backend: VSCodeBackend;
  let messageHandler: (event: MessageEvent) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    backend = new VSCodeBackend();
    
    // Capture the message event listener
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    backend = new VSCodeBackend();
    messageHandler = addEventListenerSpy.mock.calls.find(
      call => call[0] === 'message'
    )?.[1] as (event: MessageEvent) => void;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends getCallGraph message to VS Code', async () => {
    const callGraphPromise = backend.getCallGraph();

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'getCallGraph',
      id: expect.any(String),
    });

    // Simulate response from VS Code
    const mockCallGraph = {
      nodes: { test: { symbol: 'test', label: 'test', file_path: 'test.ts', line_number: 1 } },
      edges: [],
    };

    messageHandler(new MessageEvent('message', {
      data: {
        command: 'getCallGraphResponse',
        id: mockPostMessage.mock.calls[0][0].id,
        data: mockCallGraph,
      },
    }));

    const result = await callGraphPromise;
    expect(result).toEqual(mockCallGraph);
  });

  it('sends summariseCodeTree message with correct parameters', async () => {
    const summaryPromise = backend.summariseCodeTree('testSymbol');

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'summariseCodeTree',
      id: expect.any(String),
      topLevelFunctionSymbol: 'testSymbol',
    });

    // Simulate response
    const mockSummaries = {
      refinedFunctionSummaries: { testSymbol: 'Test summary' },
      contextSummary: 'Context',
      callTreeWithFilteredOutNodes: [],
    };

    messageHandler(new MessageEvent('message', {
      data: {
        command: 'summariseCodeTreeResponse',
        id: mockPostMessage.mock.calls[0][0].id,
        data: mockSummaries,
      },
    }));

    const result = await summaryPromise;
    expect(result).toEqual(mockSummaries);
  });

  it('handles navigation requests', async () => {
    const navPromise = backend.navigateToDoc({
      relativeDocPath: 'src/test.ts',
      lineNumber: 42,
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      command: 'navigateToDoc',
      id: expect.any(String),
      relativeDocPath: 'src/test.ts',
      lineNumber: 42,
    });

    // Simulate response
    messageHandler(new MessageEvent('message', {
      data: {
        command: 'navigateToDocResponse',
        id: mockPostMessage.mock.calls[0][0].id,
        data: { success: true },
      },
    }));

    const result = await navPromise;
    expect(result).toEqual({ success: true });
  });

  it('handles multiple concurrent requests', async () => {
    const promise1 = backend.getCallGraph();
    const promise2 = backend.summariseCodeTree('symbol');
    
    expect(mockPostMessage).toHaveBeenCalledTimes(2);
    
    // IDs should be different
    const id1 = mockPostMessage.mock.calls[0][0].id;
    const id2 = mockPostMessage.mock.calls[1][0].id;
    expect(id1).not.toBe(id2);
  });

  it('ignores messages with unknown IDs', async () => {
    const promise = backend.getCallGraph();

    // Send message with wrong ID
    messageHandler(new MessageEvent('message', {
      data: {
        command: 'getCallGraphResponse',
        id: 'wrong-id',
        data: {},
      },
    }));

    // Promise should still be pending
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 100)
    );

    await expect(Promise.race([promise, timeoutPromise])).rejects.toThrow('Timeout');
  });

  it('cleans up event listener on subsequent calls', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    
    // Create multiple backends
    const backend1 = new VSCodeBackend();
    const backend2 = new VSCodeBackend();
    
    // Should have removed the first listener when creating the second
    expect(removeEventListenerSpy).toHaveBeenCalled();
  });
});