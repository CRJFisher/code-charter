import { Viewport } from '@xyflow/react';
import { CodeChartNode, CodeChartEdge } from './chart_types';

interface GraphState {
  nodes: CodeChartNode[];
  edges: CodeChartEdge[];
  viewport: Viewport;
  timestamp: number;
  entry_point: string;
}

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
  const data_uri = 'data:application/json;charset=utf-8,' + encodeURIComponent(data_str);

  const export_file_default_name = `code-graph-${entry_point.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`;

  const link_element = document.createElement('a');
  link_element.setAttribute('href', data_uri);
  link_element.setAttribute('download', export_file_default_name);
  link_element.click();
}
