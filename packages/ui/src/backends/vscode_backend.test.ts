import { VSCodeBackend } from './vscode_backend';

type MessageListener = (event: MessageEvent) => void;

const mock_post_message = jest.fn();
globalThis.acquireVsCodeApi = jest.fn(() => ({
  postMessage: mock_post_message,
  getState: jest.fn(),
  setState: jest.fn(),
}));

describe('VSCodeBackend', () => {
  let backend: VSCodeBackend;
  let message_handler: MessageListener;

  beforeEach(() => {
    mock_post_message.mockClear();

    // Capture the message event handler from addEventListener
    const add_spy = jest.spyOn(window, 'addEventListener');
    backend = new VSCodeBackend();
    const captured = add_spy.mock.calls.find((call) => call[0] === 'message')?.[1];
    if (typeof captured !== 'function') {
      throw new Error('VSCodeBackend did not register a message listener');
    }
    message_handler = captured as MessageListener;
    add_spy.mockRestore();
  });

  it('should register a message handler on construction', () => {
    expect(message_handler).toBeDefined();
  });

  describe('get_call_graph', () => {
    it('should send message and resolve with data', async () => {
      const mock_data = { nodes: new Map(), entry_points: [] };
      const promise = backend.get_call_graph();

      const posted = mock_post_message.mock.calls[0][0];
      message_handler(new MessageEvent('message', {
        data: { id: posted.id, command: 'get_call_graph', data: mock_data }
      }));

      const result = await promise;
      expect(result).toEqual(mock_data);
    });
  });

  describe('get_code_tree_descriptions', () => {
    it('sends message with correct parameters', async () => {
      const promise = backend.get_code_tree_descriptions('testSymbol');

      expect(mock_post_message).toHaveBeenCalledWith({
        command: 'get_code_tree_descriptions',
        id: expect.any(String),
        top_level_function_symbol: 'testSymbol',
      });

      const mock_descriptions = {
        docstrings: { testSymbol: 'Test description' },
        call_tree: {},
      };

      const posted = mock_post_message.mock.calls[0][0];
      message_handler(new MessageEvent('message', {
        data: { id: posted.id, command: 'get_code_tree_descriptions', data: mock_descriptions }
      }));

      const result = await promise;
      expect(result).toEqual(mock_descriptions);
    });
  });

  describe('navigate_to_doc', () => {
    it('should send message with correct parameters', async () => {
      const promise = backend.navigate_to_doc('src/test.ts', 42);

      const posted = mock_post_message.mock.calls[0][0];
      expect(posted.command).toBe('navigate_to_doc');
      expect(posted.file_path).toBe('src/test.ts');
      expect(posted.line_number).toBe(42);

      message_handler(new MessageEvent('message', {
        data: { id: posted.id, command: 'navigate_to_doc' }
      }));

      await promise;
    });
  });

  describe('cluster_code_tree', () => {
    it('should return clusters from response', async () => {
      const mock_clusters = [{ description: 'Test', member_symbols: ['a'] }];
      const promise = backend.cluster_code_tree('main');

      const posted = mock_post_message.mock.calls[0][0];
      message_handler(new MessageEvent('message', {
        data: { id: posted.id, command: 'cluster_code_tree', data: mock_clusters }
      }));

      const result = await promise;
      expect(result).toEqual(mock_clusters);
    });
  });

  describe('concurrent requests', () => {
    it('handles multiple concurrent requests with different IDs', async () => {
      void backend.get_call_graph();
      void backend.get_code_tree_descriptions('symbol');

      expect(mock_post_message).toHaveBeenCalledTimes(2);

      const id1 = mock_post_message.mock.calls[0][0].id;
      const id2 = mock_post_message.mock.calls[1][0].id;
      expect(id1).not.toBe(id2);
    });
  });

  describe('message routing', () => {
    it('ignores messages with unknown IDs', async () => {
      const promise = backend.get_call_graph();

      message_handler(new MessageEvent('message', {
        data: { id: 'wrong-id', command: 'get_call_graph', data: {} }
      }));

      const timeout_promise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 100)
      );

      await expect(Promise.race([promise, timeout_promise])).rejects.toThrow('Timeout');
    });
  });
});
