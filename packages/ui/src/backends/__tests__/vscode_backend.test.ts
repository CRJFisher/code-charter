import { VSCodeBackend } from '../vscode_backend';
import { ConnectionStatus } from '@code-charter/types';

// Mock VS Code API
const mock_post_message = jest.fn();
const mock_vscode_api = {
  postMessage: mock_post_message,
  getState: jest.fn(),
  setState: jest.fn(),
};

// Replace the global function
(global as any).acquireVsCodeApi = jest.fn(() => mock_vscode_api);

describe('VSCodeBackend', () => {
  let backend: VSCodeBackend;
  let add_event_listener_spy: jest.SpyInstance;
  let remove_event_listener_spy: jest.SpyInstance;
  let message_handler: (event: MessageEvent) => void;

  beforeEach(async () => {
    jest.clearAllMocks();
    add_event_listener_spy = jest.spyOn(window, 'addEventListener');
    remove_event_listener_spy = jest.spyOn(window, 'removeEventListener');

    backend = new VSCodeBackend();
    await backend.connect();

    // Capture the message handler registered during connect()
    const message_call = add_event_listener_spy.mock.calls.find(
      (call: any[]) => call[0] === 'message'
    );
    message_handler = message_call![1] as (event: MessageEvent) => void;
  });

  afterEach(async () => {
    await backend.disconnect();
    jest.restoreAllMocks();
  });

  /**
   * Simulate a response from the VS Code extension host by firing
   * a MessageEvent through the captured handler.
   */
  function respond_to_last_message(data: any) {
    const last_call = mock_post_message.mock.calls[mock_post_message.mock.calls.length - 1][0];
    message_handler(
      new MessageEvent('message', {
        data: { id: last_call.id, command: `${last_call.command}Response`, data },
      })
    );
  }

  it('is CONNECTED after connect()', () => {
    expect(backend.getState().status).toBe(ConnectionStatus.CONNECTED);
  });

  it('registers a message event listener on connect()', () => {
    expect(add_event_listener_spy).toHaveBeenCalledWith('message', expect.any(Function));
  });

  describe('getCallGraph()', () => {
    it('sends getCallGraph command and resolves with the response data', async () => {
      const mock_call_graph = {
        nodes: new Map([['test', { symbol: 'test' }]]),
        edges: [],
      };

      const promise = backend.getCallGraph();

      expect(mock_post_message).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'getCallGraph' })
      );

      respond_to_last_message(mock_call_graph);

      const result = await promise;
      expect(result).toEqual(mock_call_graph);
    });
  });

  describe('summariseCodeTree()', () => {
    it('sends summariseCodeTree command with the symbol and resolves', async () => {
      const mock_summaries = {
        functionSummaries: { 'test': 'summary' },
        refinedFunctionSummaries: { 'test': 'refined' },
        callTreeWithFilteredOutNodes: {},
        contextSummary: 'context',
      };

      const promise = backend.summariseCodeTree('test_symbol');

      expect(mock_post_message).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'summariseCodeTree',
          topLevelFunctionSymbol: 'test_symbol',
        })
      );

      respond_to_last_message(mock_summaries);

      const result = await promise;
      expect(result).toEqual(mock_summaries);
    });
  });

  describe('clusterCodeTree()', () => {
    it('sends clusterCodeTree command with the symbol and resolves', async () => {
      const mock_clusters = [
        { description: 'Group A', memberSymbols: ['a', 'b'] },
      ];

      const promise = backend.clusterCodeTree('test_symbol');

      expect(mock_post_message).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'clusterCodeTree',
          topLevelFunctionSymbol: 'test_symbol',
        })
      );

      respond_to_last_message(mock_clusters);

      const result = await promise;
      expect(result).toEqual(mock_clusters);
    });
  });

  describe('navigateToDoc()', () => {
    it('sends navigateToDoc with two positional args and resolves', async () => {
      const promise = backend.navigateToDoc('src/test.ts', 42);

      expect(mock_post_message).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'navigateToDoc',
          relativeDocPath: 'src/test.ts',
          lineNumber: 42,
        })
      );

      respond_to_last_message({ success: true });

      await promise;
    });
  });

  describe('disconnect()', () => {
    it('removes the message event listener', async () => {
      await backend.disconnect();

      expect(remove_event_listener_spy).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('sets state to DISCONNECTED', async () => {
      await backend.disconnect();

      expect(backend.getState().status).toBe(ConnectionStatus.DISCONNECTED);
    });
  });

  describe('when not connected', () => {
    it('rejects operations before connect() is called', async () => {
      const disconnected_backend = new VSCodeBackend();

      await expect(disconnected_backend.getCallGraph()).resolves.toBeUndefined();
    });
  });

  describe('message routing', () => {
    it('ignores messages with unknown ids', async () => {
      const promise = backend.getCallGraph();

      // Fire a response with a wrong id -- should not resolve the promise
      message_handler(
        new MessageEvent('message', {
          data: { id: 'unknown-id', command: 'getCallGraphResponse', data: {} },
        })
      );

      const timeout_promise = new Promise<string>((resolve) =>
        setTimeout(() => resolve('timeout'), 100)
      );

      const race_result = await Promise.race([
        promise.then(() => 'resolved'),
        timeout_promise,
      ]);
      expect(race_result).toBe('timeout');
    });

    it('handles multiple concurrent requests with different ids', async () => {
      const promise1 = backend.getCallGraph();
      const promise2 = backend.summariseCodeTree('sym');

      expect(mock_post_message).toHaveBeenCalledTimes(2);

      const id1 = mock_post_message.mock.calls[0][0].id;
      const id2 = mock_post_message.mock.calls[1][0].id;
      expect(id1).not.toBe(id2);

      // Respond to each individually
      message_handler(
        new MessageEvent('message', {
          data: { id: id1, command: 'getCallGraphResponse', data: { nodes: new Map(), edges: [] } },
        })
      );
      message_handler(
        new MessageEvent('message', {
          data: { id: id2, command: 'summariseCodeTreeResponse', data: { contextSummary: 'ctx' } },
        })
      );

      const result1 = await promise1;
      const result2 = await promise2;

      expect(result1).toEqual({ nodes: new Map(), edges: [] });
      expect(result2).toEqual({ contextSummary: 'ctx' });
    });
  });
});
