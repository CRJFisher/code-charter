import { Backend } from '@code-charter/types';
import { CallGraph } from '@ariadnejs/types';

/**
 * Simple mock backend for testing
 */
export class TestMockBackend implements Backend {
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

  async getCallGraph(): Promise<CallGraph> {
    await this.simulateDelay();
    this.checkError();

    return this.config.callGraph || {
      nodes: {},
      edges: [],
    };
  }

  async summariseCodeTree(topLevelFunctionSymbol: string): Promise<{
    refinedFunctionSummaries: Record<string, string>;
    contextSummary: string;
    callTreeWithFilteredOutNodes: any[];
  }> {
    await this.simulateDelay();
    this.checkError();

    return {
      refinedFunctionSummaries: this.config.refinedSummaries || {},
      contextSummary: 'Mock context',
      callTreeWithFilteredOutNodes: [],
    };
  }

  async clusterCodeTree(topLevelFunctionSymbol: string): Promise<string[][]> {
    await this.simulateDelay();
    this.checkError();

    return [];
  }

  async functionSummaryStatus(functionSymbol: string): Promise<Record<string, any>> {
    await this.simulateDelay();
    this.checkError();

    return {};
  }

  async navigateToDoc(params: {
    relativeDocPath: string;
    lineNumber: number;
  }): Promise<{ success: boolean }> {
    await this.simulateDelay();
    this.checkError();

    return { success: true };
  }
}