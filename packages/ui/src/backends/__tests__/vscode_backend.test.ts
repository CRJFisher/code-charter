import { VSCodeBackend } from '../vscode_backend';

// Mock acquireVsCodeApi
const mock_post_message = jest.fn();
(global as any).acquireVsCodeApi = jest.fn(() => ({
  postMessage: mock_post_message,
}));

describe('VSCodeBackend', () => {
  let backend: VSCodeBackend;
  let message_handler: ((event: MessageEvent) => void) | undefined;

  beforeEach(() => {
    mock_post_message.mockClear();

    // Capture the message event handler from addEventListener
    const add_spy = jest.spyOn(window, 'addEventListener');
    backend = new VSCodeBackend();
    message_handler = add_spy.mock.calls.find(
      (call) => call[0] === 'message'
    )?.[1] as any;
    add_spy.mockRestore();
  });

  it('should register a message handler on construction', () => {
    expect(message_handler).toBeDefined();
  });

  describe('getCallGraph', () => {
    it('should send message and resolve with data', async () => {
      const mock_data = { nodes: new Map(), entry_points: [] };
      const promise = backend.getCallGraph();

      const posted = mock_post_message.mock.calls[0][0];
      message_handler!(new MessageEvent('message', {
        data: { id: posted.id, command: 'getCallGraph', data: mock_data }
      }));

      const result = await promise;
      expect(result).toEqual(mock_data);
    });
  });

  describe('get_code_tree_descriptions', () => {
    it('sends message with correct parameters', async () => {
      const promise = backend.get_code_tree_descriptions('testSymbol');

      expect(mock_post_message).toHaveBeenCalledWith({
        command: 'getCodeTreeDescriptions',
        id: expect.any(String),
        topLevelFunctionSymbol: 'testSymbol',
      });

      const mock_descriptions = {
        docstrings: { testSymbol: 'Test description' },
        call_tree: {},
      };

      const posted = mock_post_message.mock.calls[0][0];
      message_handler!(new MessageEvent('message', {
        data: { id: posted.id, command: 'getCodeTreeDescriptions', data: mock_descriptions }
      }));

      const result = await promise;
      expect(result).toEqual(mock_descriptions);
    });
  });

  describe('navigateToDoc', () => {
    it('should send message with correct parameters', async () => {
      const promise = backend.navigateToDoc('src/test.ts', 42);

      const posted = mock_post_message.mock.calls[0][0];
      expect(posted.command).toBe('navigateToDoc');
      expect(posted.relativeDocPath).toBe('src/test.ts');
      expect(posted.lineNumber).toBe(42);

      message_handler!(new MessageEvent('message', {
        data: { id: posted.id, command: 'navigateToDoc' }
      }));

      await promise;
    });
  });

  describe('clusterCodeTree', () => {
    it('should return clusters from response', async () => {
      const mock_clusters = [{ description: 'Test', memberSymbols: ['a'] }];
      const promise = backend.clusterCodeTree('main');

      const posted = mock_post_message.mock.calls[0][0];
      message_handler!(new MessageEvent('message', {
        data: { id: posted.id, command: 'clusterCodeTree', data: mock_clusters }
      }));

      const result = await promise;
      expect(result).toEqual(mock_clusters);
    });
  });

  describe('concurrent requests', () => {
    it('handles multiple concurrent requests with different IDs', async () => {
      const promise1 = backend.getCallGraph();
      const promise2 = backend.get_code_tree_descriptions('symbol');

      expect(mock_post_message).toHaveBeenCalledTimes(2);

      const id1 = mock_post_message.mock.calls[0][0].id;
      const id2 = mock_post_message.mock.calls[1][0].id;
      expect(id1).not.toBe(id2);
    });
  });

  describe('message routing', () => {
    it('ignores messages with unknown IDs', async () => {
      const promise = backend.getCallGraph();

      message_handler!(new MessageEvent('message', {
        data: { id: 'wrong-id', command: 'getCallGraph', data: {} }
      }));

      const timeout_promise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 100)
      );

      await expect(Promise.race([promise, timeout_promise])).rejects.toThrow('Timeout');
    });
  });
});
