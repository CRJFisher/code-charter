import { VSCodeBackend } from './vscode_backend';

type MessageListener = (event: MessageEvent) => void;

const mock_post_message = jest.fn();
globalThis.acquireVsCodeApi = jest.fn(() => ({
  postMessage: mock_post_message,
  getState: jest.fn(),
  setState: jest.fn(),
}));

const REQUEST_TIMEOUT_MS = 30_000;

describe('VSCodeBackend', () => {
  let backend: VSCodeBackend;
  let message_handler: MessageListener;

  beforeEach(() => {
    mock_post_message.mockClear();

    const add_spy = jest.spyOn(window, 'addEventListener');
    backend = new VSCodeBackend();
    const captured = add_spy.mock.calls.find((call) => call[0] === 'message')?.[1];
    if (typeof captured !== 'function') {
      throw new Error('VSCodeBackend did not register a message listener');
    }
    message_handler = captured as MessageListener;
    add_spy.mockRestore();
  });

  const last_posted_id = (): string => {
    const calls = mock_post_message.mock.calls;
    return calls[calls.length - 1][0].id;
  };

  const respond = (data: unknown): void => {
    message_handler(new MessageEvent('message', { data }));
  };

  it('registers a message handler on construction', () => {
    expect(message_handler).toBeDefined();
  });

  describe('get_call_graph', () => {
    it('rehydrates the serialized call graph maps from the response', async () => {
      const node = { symbol: 'main.ts#main:function', definition: {}, edges: [] };
      const promise = backend.get_call_graph();

      respond({
        id: last_posted_id(),
        command: 'get_call_graph',
        data: { nodes: [['main.ts#main:function', node]], entry_points: ['main.ts#main:function'] },
      });

      const result = await promise;
      expect(result?.nodes).toBeInstanceOf(Map);
      expect(result ? Array.from(result.nodes.entries()) : []).toEqual([
        ['main.ts#main:function', node],
      ]);
      expect(result?.entry_points).toEqual(['main.ts#main:function']);
    });

    it('returns undefined when the response carries no data', async () => {
      const promise = backend.get_call_graph();
      respond({ id: last_posted_id(), command: 'get_call_graph' });
      expect(await promise).toBeUndefined();
    });

    it('swallows backend errors and returns undefined', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const promise = backend.get_call_graph();
      respond({ id: last_posted_id(), command: 'get_call_graph', error: { message: 'boom' } });
      expect(await promise).toBeUndefined();
      (console.error as jest.Mock).mockRestore();
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

      const mock_rows = { nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] };
      respond({ id: last_posted_id(), command: 'render_flow', data: mock_rows });

      expect(await promise).toEqual(mock_rows);
    });

    it('falls back to empty rows when the response carries no data', async () => {
      const promise = backend.render_flow('flow');
      respond({ id: last_posted_id(), command: 'render_flow' });
      expect(await promise).toEqual({ nodes: [], edges: [] });
    });

    it('propagates backend errors so the chart can surface a retry state', async () => {
      const promise = backend.render_flow('flow');
      respond({ id: last_posted_id(), command: 'render_flow', error: { message: 'no such flow' } });
      await expect(promise).rejects.toThrow('no such flow');
    });
  });

  describe('navigate_to_doc', () => {
    it('sends the file path and line number', async () => {
      const promise = backend.navigate_to_doc('src/test.ts', 42);

      const posted = mock_post_message.mock.calls[0][0];
      expect(posted.command).toBe('navigate_to_doc');
      expect(posted.file_path).toBe('src/test.ts');
      expect(posted.line_number).toBe(42);

      respond({ id: posted.id, command: 'navigate_to_doc' });
      await promise;
    });

    it('rethrows backend errors', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const promise = backend.navigate_to_doc('src/test.ts', 42);
      respond({ id: last_posted_id(), command: 'navigate_to_doc', error: { message: 'open failed' } });
      await expect(promise).rejects.toThrow('open failed');
      (console.error as jest.Mock).mockRestore();
    });
  });

  describe('list_flows', () => {
    it('returns the flow summaries from the response', async () => {
      const mock_flows = [
        { id: 'main.ts#main:function', label: 'main', is_hydrated: false, last_synced_at: null, member_count: 3, is_unattributed: false, seed_location: { file_path: 'main.ts', line_number: 0 } },
      ];
      const promise = backend.list_flows();
      respond({ id: last_posted_id(), command: 'list_flows', data: mock_flows });
      expect(await promise).toEqual(mock_flows);
    });

    it('returns an empty list when the response carries no data', async () => {
      const promise = backend.list_flows();
      respond({ id: last_posted_id(), command: 'list_flows' });
      expect(await promise).toEqual([]);
    });

    it('swallows backend errors and returns an empty list', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const promise = backend.list_flows();
      respond({ id: last_posted_id(), command: 'list_flows', error: { message: 'boom' } });
      expect(await promise).toEqual([]);
      (console.error as jest.Mock).mockRestore();
    });
  });

  describe('error stacks', () => {
    it('preserves the original stack on the rejected error', async () => {
      const promise = backend.render_flow('flow');
      respond({
        id: last_posted_id(),
        command: 'render_flow',
        error: { message: 'boom', stack: 'Error: boom\n    at extension_host' },
      });
      await expect(promise).rejects.toMatchObject({
        message: 'boom',
        stack: 'Error: boom\n    at extension_host',
      });
    });
  });

  describe('concurrent requests', () => {
    it('correlates each response to its own request by id', async () => {
      const graph_promise = backend.get_call_graph();
      const flow_promise = backend.render_flow('symbol');

      expect(mock_post_message).toHaveBeenCalledTimes(2);
      const graph_id = mock_post_message.mock.calls[0][0].id;
      const flow_id = mock_post_message.mock.calls[1][0].id;
      expect(graph_id).not.toBe(flow_id);

      respond({ id: flow_id, command: 'render_flow', data: { nodes: [], edges: [] } });
      respond({ id: graph_id, command: 'get_call_graph', data: { nodes: [], entry_points: [] } });

      expect(await flow_promise).toEqual({ nodes: [], edges: [] });
      const graph = await graph_promise;
      expect(graph?.nodes).toBeInstanceOf(Map);
    });
  });

  describe('message routing and timeouts', () => {
    it('ignores responses whose id matches no pending request', async () => {
      jest.useFakeTimers();
      const promise = backend.render_flow('flow');

      respond({ id: 'unknown-id', command: 'render_flow', data: { nodes: [], edges: [] } });
      jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);

      await expect(promise).rejects.toThrow(`timed out after ${REQUEST_TIMEOUT_MS}ms`);
      jest.useRealTimers();
    });

    it('rejects a request that receives no response before the watchdog fires', async () => {
      jest.useFakeTimers();
      const promise = backend.render_flow('flow');

      jest.advanceTimersByTime(REQUEST_TIMEOUT_MS - 1);
      jest.advanceTimersByTime(1);

      await expect(promise).rejects.toThrow(`Webview command "render_flow" timed out after ${REQUEST_TIMEOUT_MS}ms`);
      jest.useRealTimers();
    });

    it('clears the watchdog once a response arrives', async () => {
      jest.useFakeTimers();
      const promise = backend.render_flow('flow');
      respond({ id: last_posted_id(), command: 'render_flow', data: { nodes: [], edges: [] } });
      expect(await promise).toEqual({ nodes: [], edges: [] });

      jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
      jest.useRealTimers();
    });
  });
});
