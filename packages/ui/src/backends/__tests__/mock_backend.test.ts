import { MockBackend } from '../mock_backend';
import { ConnectionStatus } from '@code-charter/types';

describe('MockBackend', () => {
  it('starts disconnected', () => {
    const backend = new MockBackend();
    expect(backend.getState().status).toBe(ConnectionStatus.DISCONNECTED);
  });

  it('connects and disconnects', async () => {
    const backend = new MockBackend();
    await backend.connect();
    expect(backend.getState().status).toBe(ConnectionStatus.CONNECTED);
    await backend.disconnect();
    expect(backend.getState().status).toBe(ConnectionStatus.DISCONNECTED);
  });

  it('returns a call graph', async () => {
    const backend = new MockBackend();
    await backend.connect();
    const result = await backend.getCallGraph();
    expect(result).toBeDefined();
    expect(result!.nodes).toBeDefined();
    expect(result!.edges).toBeDefined();
  });

  it('returns docstring descriptions', async () => {
    const backend = new MockBackend();
    await backend.connect();
    const result = await backend.get_code_tree_descriptions('main.ts:main');
    expect(result).toBeDefined();
    expect(result!.docstrings).toBeDefined();
    expect(result!.call_tree).toBeDefined();
    expect(result!.docstrings['main.ts:main']).toBeDefined();
  });

  it('returns clusters', async () => {
    const backend = new MockBackend();
    await backend.connect();
    const result = await backend.clusterCodeTree('main.ts:main');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles navigation calls', async () => {
    const backend = new MockBackend();
    await backend.connect();
    // Should not throw
    await backend.navigateToDoc('test.ts', 10);
  });

  it('notifies state change listeners', async () => {
    const backend = new MockBackend();
    const listener = jest.fn();
    backend.onStateChange(listener);
    await backend.connect();
    expect(listener).toHaveBeenCalledWith({ status: ConnectionStatus.CONNECTING });
    expect(listener).toHaveBeenCalledWith({ status: ConnectionStatus.CONNECTED });
  });

  it('allows unsubscribing from state changes', async () => {
    const backend = new MockBackend();
    const listener = jest.fn();
    const unsubscribe = backend.onStateChange(listener);
    unsubscribe();
    await backend.connect();
    // Only the CONNECTING call before unsubscribe might have happened
    // but since unsubscribe was called before connect, listener should not be called
    expect(listener).not.toHaveBeenCalled();
  });
});
