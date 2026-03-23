import { CodeCharterBackend, DocstringSummaries, NodeGroup } from '@code-charter/types';
import type { CallGraph } from '@code-charter/types';

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
}

export interface BackendState {
  status: ConnectionStatus;
}

export class TestMockBackend implements CodeCharterBackend {
  private state: BackendState = { status: ConnectionStatus.DISCONNECTED };
  private state_callbacks: ((state: BackendState) => void)[] = [];

  constructor(
    private config: {
      callGraph?: CallGraph;
      docstrings?: Record<string, string>;
      shouldThrowError?: boolean;
      delay?: number;
    } = {}
  ) {}

  private async simulate_delay(): Promise<void> {
    if (this.config.delay) {
      await new Promise(resolve => setTimeout(resolve, this.config.delay));
    }
  }

  private check_error(): void {
    if (this.config.shouldThrowError) {
      throw new Error('Mock error');
    }
  }

  getState(): BackendState {
    return this.state;
  }

  async connect(): Promise<void> {
    this.update_state({ status: ConnectionStatus.CONNECTING });
    this.update_state({ status: ConnectionStatus.CONNECTED });
  }

  async disconnect(): Promise<void> {
    this.update_state({ status: ConnectionStatus.DISCONNECTED });
  }

  onStateChange(callback: (state: BackendState) => void): () => void {
    this.state_callbacks.push(callback);
    return () => {
      this.state_callbacks = this.state_callbacks.filter(cb => cb !== callback);
    };
  }

  async getCallGraph(): Promise<CallGraph | undefined> {
    await this.simulate_delay();
    this.check_error();
    return this.config.callGraph;
  }

  async get_code_tree_descriptions(topLevelFunctionSymbol: string): Promise<DocstringSummaries | undefined> {
    await this.simulate_delay();
    this.check_error();
    return {
      docstrings: this.config.docstrings || {},
      call_tree: {},
    };
  }

  async clusterCodeTree(topLevelFunctionSymbol: string): Promise<NodeGroup[]> {
    await this.simulate_delay();
    this.check_error();
    return [];
  }

  async navigateToDoc(relativeDocPath: string, lineNumber: number): Promise<void> {
    await this.simulate_delay();
    this.check_error();
  }

  private update_state(state: BackendState): void {
    this.state = state;
    this.state_callbacks.forEach(cb => cb(this.state));
  }
}
