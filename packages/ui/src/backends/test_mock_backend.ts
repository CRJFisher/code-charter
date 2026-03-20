import {
  CodeCharterBackend,
  BackendState,
  ConnectionStatus,
  NodeGroup,
  TreeAndContextSummaries,
  CallGraph,
} from "@code-charter/types";

/**
 * Simple mock backend for testing
 */
export class TestMockBackend implements CodeCharterBackend {
  private state: BackendState = { status: ConnectionStatus.DISCONNECTED };
  private stateListeners: Set<(state: BackendState) => void> = new Set();

  constructor(
    private config: {
      callGraph?: CallGraph;
      refinedSummaries?: Record<string, string>;
      shouldThrowError?: boolean;
      delay?: number;
    } = {}
  ) {}

  private async simulateDelay(): Promise<void> {
    if (this.config.delay) {
      await new Promise(resolve => setTimeout(resolve, this.config.delay));
    }
  }

  private checkError(): void {
    if (this.config.shouldThrowError) {
      throw new Error('Mock error');
    }
  }

  getState(): BackendState {
    return this.state;
  }

  async connect(): Promise<void> {
    this.updateState({ status: ConnectionStatus.CONNECTED });
  }

  async disconnect(): Promise<void> {
    this.updateState({ status: ConnectionStatus.DISCONNECTED });
  }

  async getCallGraph(): Promise<CallGraph | undefined> {
    await this.simulateDelay();
    this.checkError();

    return this.config.callGraph || {
      nodes: new Map(),
      entry_points: [],
    };
  }

  async summariseCodeTree(topLevelFunctionSymbol: string): Promise<TreeAndContextSummaries | undefined> {
    await this.simulateDelay();
    this.checkError();

    return {
      functionSummaries: {},
      refinedFunctionSummaries: this.config.refinedSummaries || {},
      contextSummary: 'Mock context',
      callTreeWithFilteredOutNodes: {},
    };
  }

  async clusterCodeTree(topLevelFunctionSymbol: string): Promise<NodeGroup[]> {
    await this.simulateDelay();
    this.checkError();

    return [];
  }

  async navigateToDoc(relativeDocPath: string, lineNumber: number): Promise<void> {
    await this.simulateDelay();
    this.checkError();
  }

  onStateChange(callback: (state: BackendState) => void): () => void {
    this.stateListeners.add(callback);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  private updateState(state: BackendState): void {
    this.state = state;
    this.stateListeners.forEach(listener => listener(state));
  }
}
