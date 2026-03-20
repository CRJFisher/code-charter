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
      const mock_data = { nodes: new Map(), edges: [], top_level_nodes: [] };
      const promise = backend.getCallGraph();

      const posted = mock_post_message.mock.calls[0][0];
      message_handler!(new MessageEvent('message', {
        data: { id: posted.id, command: 'getCallGraph', data: mock_data }
      }));

      const result = await promise;
      expect(result).toEqual(mock_data);
    });
  });

  describe('navigateToDoc', () => {
    it('should send message with correct positional args', async () => {
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

  describe('summariseCodeTree', () => {
    it('should return summaries from response', async () => {
      const mock_summaries = {
        functionSummaries: {},
        refinedFunctionSummaries: {},
        callTreeWithFilteredOutNodes: {},
        contextSummary: 'test',
      };
      const promise = backend.summariseCodeTree('main');

      const posted = mock_post_message.mock.calls[0][0];
      message_handler!(new MessageEvent('message', {
        data: { id: posted.id, command: 'summariseCodeTree', data: mock_summaries }
      }));

      const result = await promise;
      expect(result).toEqual(mock_summaries);
    });
  });
});
