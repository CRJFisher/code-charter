import { Viewport } from '@xyflow/react';
import { CodeChartNode, CodeChartEdge } from './react_flow_types';

export interface GraphState {
  nodes: CodeChartNode[];
  edges: CodeChartEdge[];
  viewport: Viewport;
  timestamp: number;
  entryPoint: string;
}

const STORAGE_KEY = 'code-charter-react-flow-state';

export function saveGraphState(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[],
  viewport: Viewport,
  entryPoint: string
): void {
  const state: GraphState = {
    nodes,
    edges,
    viewport,
    timestamp: Date.now(),
    entryPoint,
  };
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save graph state:', error);
  }
}

export function loadGraphState(entryPoint: string): GraphState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    
    const state = JSON.parse(saved) as GraphState;
    
    // Check if this is for the same entry point
    if (state.entryPoint !== entryPoint) {
      return null;
    }
    
    // Check if state is not too old (e.g., 24 hours)
    const dayInMs = 24 * 60 * 60 * 1000;
    if (Date.now() - state.timestamp > dayInMs) {
      return null;
    }
    
    return state;
  } catch (error) {
    console.error('Failed to load graph state:', error);
    return null;
  }
}

export function clearGraphState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear graph state:', error);
  }
}

// Export graph state to JSON file
export function exportGraphState(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[],
  viewport: Viewport,
  entryPoint: string
): void {
  const state: GraphState = {
    nodes,
    edges,
    viewport,
    timestamp: Date.now(),
    entryPoint,
  };
  
  const dataStr = JSON.stringify(state, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = `code-graph-${entryPoint.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`;
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

// Import graph state from JSON file
export function importGraphState(
  file: File,
  onSuccess: (state: GraphState) => void,
  onError: (error: string) => void
): void {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const state = JSON.parse(content) as GraphState;
      
      // Validate the imported state
      if (!state.nodes || !state.edges || !state.viewport || !state.entryPoint) {
        throw new Error('Invalid graph state file');
      }
      
      onSuccess(state);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to parse file');
    }
  };
  
  reader.onerror = () => {
    onError('Failed to read file');
  };
  
  reader.readAsText(file);
}