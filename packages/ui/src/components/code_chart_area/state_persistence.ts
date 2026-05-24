import { Viewport } from '@xyflow/react';
import { CodeChartNode, CodeChartEdge } from './chart_types';

export interface GraphState {
  nodes: CodeChartNode[];
  edges: CodeChartEdge[];
  viewport: Viewport;
  timestamp: number;
  entry_point: string;
}

const STORAGE_KEY = 'code-charter-react-flow-state';

export function save_graph_state(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[],
  viewport: Viewport,
  entry_point: string
): void {
  const state: GraphState = {
    nodes,
    edges,
    viewport,
    timestamp: Date.now(),
    entry_point,
  };
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save graph state:', error);
  }
}

export function load_graph_state(entry_point: string): GraphState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    
    const state = JSON.parse(saved) as GraphState;
    
    // Check if this is for the same entry point
    if (state.entry_point !== entry_point) {
      return null;
    }
    
    // Check if state is not too old (e.g., 24 hours)
    const day_in_ms = 24 * 60 * 60 * 1000;
    if (Date.now() - state.timestamp > day_in_ms) {
      return null;
    }
    
    return state;
  } catch (error) {
    console.error('Failed to load graph state:', error);
    return null;
  }
}

export function clear_graph_state(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear graph state:', error);
  }
}

// Export graph state to JSON file
export function export_graph_state(
  nodes: CodeChartNode[],
  edges: CodeChartEdge[],
  viewport: Viewport,
  entry_point: string
): void {
  const state: GraphState = {
    nodes,
    edges,
    viewport,
    timestamp: Date.now(),
    entry_point,
  };
  
  const data_str = JSON.stringify(state, null, 2);
  const data_uri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(data_str);
  
  const export_file_default_name = `code-graph-${entry_point.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`;
  
  const link_element = document.createElement('a');
  link_element.setAttribute('href', data_uri);
  link_element.setAttribute('download', export_file_default_name);
  link_element.click();
}

// Import graph state from JSON file
export function import_graph_state(
  file: File,
  on_success: (state: GraphState) => void,
  on_error: (error: string) => void
): void {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const state = JSON.parse(content) as GraphState;
      
      // Validate the imported state
      if (!state.nodes || !state.edges || !state.viewport || !state.entry_point) {
        throw new Error('Invalid graph state file');
      }
      
      on_success(state);
    } catch (error) {
      on_error(error instanceof Error ? error.message : 'Failed to parse file');
    }
  };
  
  reader.onerror = () => {
    on_error('Failed to read file');
  };
  
  reader.readAsText(file);
}