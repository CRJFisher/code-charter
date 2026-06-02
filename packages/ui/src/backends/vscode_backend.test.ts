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

  describe('render_flow', () => {
    it('sends the flow_id and resolves with the rendered rows', async () => {
      const promise = backend.render_flow('main.ts#main:function');

      expect(mock_post_message).toHaveBeenCalledWith({
        command: 'render_flow',
        id: expect.any(String),
        flow_id: 'main.ts#main:function',
      });

      const mock_rows = { nodes: [], edges: [] };
      const posted = mock_post_message.mock.calls[0][0];
      message_handler(new MessageEvent('message', {
        data: { id: posted.id, command: 'render_flow', data: mock_rows }
      }));

      const result = await promise;
      expect(result).toEqual(mock_rows);
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

  describe('list_flows', () => {
    it('should return the flow summaries from the response', async () => {
      const mock_flows = [
        { id: 'main.ts#main:function', label: 'main', is_hydrated: false, last_synced_at: null, member_count: 3, is_unattributed: false, seed_location: { file_path: 'main.ts', line_number: 0 } },
      ];
      const promise = backend.list_flows();

      const posted = mock_post_message.mock.calls[0][0];
      message_handler(new MessageEvent('message', {
        data: { id: posted.id, command: 'list_flows', data: mock_flows }
      }));

      const result = await promise;
      expect(result).toEqual(mock_flows);
    });
  });

  describe('concurrent requests', () => {
    it('handles multiple concurrent requests with different IDs', async () => {
      void backend.get_call_graph();
      void backend.render_flow('symbol');

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
