import { Node, Edge } from "@xyflow/react";
import type { CallableNode } from "@code-charter/types";
import { DocstringSummaries, NodeGroup } from "@code-charter/types";
import { symbol_display_name } from "./symbol_display";
import { CodeNodeData } from "./code_function_node";
import { ModuleNodeData } from "./chart_node_types";
import { calculateNodeDimensions } from "./graph_layout";
import { CodeChartNode, CodeChartEdge } from "./chart_types";
import type { ClusterColor } from "./theme_config";

export interface ReactFlowElements {
  nodes: CodeChartNode[];
  edges: CodeChartEdge[];
}

export function generateReactFlowElements(
  selected_entry_point: CallableNode,
  docstring_summaries: DocstringSummaries,
  node_groups: NodeGroup[] | undefined,
  cluster_palette?: ClusterColor[]
): ReactFlowElements {
  const nodes: CodeChartNode[] = [];
  const edges: CodeChartEdge[] = [];
  const visited = new Set<string>();

  // Define the mappings for module clustering
  const compound_id_to_group: { [compound_id: string]: NodeGroup } = {};
  const symbol_to_compound_id: { [symbol: string]: string } = {};

  // Process node_groups to populate the mappings
  (node_groups || []).forEach((group, index) => {
    const compound_id = `module_${index}`;
    compound_id_to_group[compound_id] = group;
    for (const member_symbol of group.memberSymbols) {
      symbol_to_compound_id[member_symbol] = compound_id;
    }
  });

  // Track module connections for compound edges
  const module_connections = new Map<string, Set<string>>();

  // Helper function to add a function node
  const add_function_node = (node: CallableNode, is_top_level: boolean, position: { x: number; y: number }) => {
    if (visited.has(node.symbol_id)) {
      return;
    }
    visited.add(node.symbol_id);

    const description = docstring_summaries.docstrings?.[node.symbol_id]?.trimStart() || "";
    const parent_module_id = symbol_to_compound_id[node.symbol_id];

    // Create the React Flow node
    const function_node: CodeChartNode = {
      id: node.symbol_id,
      type: "code_function",
      position,
      data: {
        function_name: symbol_display_name(node.symbol_id),
        description,
        file_path: node.definition.location.file_path,
        line_number: node.definition.location.start_line,
        is_entry_point: is_top_level,
        symbol: node.symbol_id,
      },
      parentId: parent_module_id,
      extent: parent_module_id ? "parent" : undefined,
    };

    // Calculate dimensions
    const dimensions = calculateNodeDimensions(function_node);
    function_node.width = dimensions.width;
    function_node.height = dimensions.height;

    nodes.push(function_node);

    // Process child calls
    const child_y = position.y + 150;
    node.enclosed_calls.forEach((call, index) => {
      const target_symbol = call.resolutions[0]?.symbol_id;
      if (!target_symbol) return;

      // Add edge
      const edge_id = `${node.symbol_id}-${target_symbol}`;
      edges.push({
        id: edge_id,
        source: node.symbol_id,
        target: target_symbol,
        type: "default",
        animated: false,
        ariaLabel: `Call from ${symbol_display_name(node.symbol_id)} to ${symbol_display_name(target_symbol)}`,
      });

      // Track module connections
      const child_module_id = symbol_to_compound_id[target_symbol];
      if (parent_module_id && child_module_id && parent_module_id !== child_module_id) {
        if (!module_connections.has(parent_module_id)) {
          module_connections.set(parent_module_id, new Set());
        }
        module_connections.get(parent_module_id)!.add(child_module_id);
      }

      // Recursively add child nodes
      const child_node = docstring_summaries.call_tree[target_symbol];
      if (child_node) {
        const child_x = position.x + (index - node.enclosed_calls.length / 2) * 250;
        add_function_node(child_node, false, { x: child_x, y: child_y });
      }
    });
  };

  // Start processing from the entry point
  const entry_point_in_tree = docstring_summaries.call_tree[selected_entry_point.symbol_id];
  if (entry_point_in_tree) {
    add_function_node(entry_point_in_tree, true, { x: 0, y: 0 });
  }

  // After all function nodes are added, add module group nodes
  if (node_groups && node_groups.length > 0) {
    const module_nodes: Node[] = [];

    node_groups.forEach((group, index) => {
      const module_id = `module_${index}`;

      // Calculate module bounds based on member nodes
      const member_nodes = nodes.filter(n => n.parentId === module_id);
      let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;

      if (member_nodes.length > 0) {
        member_nodes.forEach(node => {
          const x = node.position.x;
          const y = node.position.y;
          const width = node.width || 200;
          const height = node.height || 100;

          min_x = Math.min(min_x, x);
          min_y = Math.min(min_y, y);
          max_x = Math.max(max_x, x + width);
          max_y = Math.max(max_y, y + height);
        });
      } else {
        // Default positioning if no members
        min_x = index * 500;
        min_y = 0;
        max_x = min_x + 400;
        max_y = min_y + 300;
      }

      const padding = 40;
      const cluster_index = group.metadata?.cluster_index ?? index;
      const module_node: CodeChartNode = {
        id: module_id,
        type: "module_group",
        position: { x: min_x - padding, y: min_y - padding },
        data: {
          module_name: `Module ${index + 1}`,
          description: group.description || "",
          member_count: group.memberSymbols.length,
          cluster_index,
          quality_score: group.metadata?.quality_score,
        },
        style: {
          width: max_x - min_x + padding * 2,
          height: max_y - min_y + padding * 2,
          borderRadius: "15px",
          padding: "20px",
          zIndex: -1,
        },
      };
      module_nodes.push(module_node);
    });

    // Add module nodes at the beginning so they render behind
    nodes.unshift(...module_nodes as CodeChartNode[]);

    // Build cluster index lookup for module edge coloring
    const module_id_to_cluster_index = new Map<string, number>();
    node_groups.forEach((group, idx) => {
      module_id_to_cluster_index.set(`module_${idx}`, group.metadata?.cluster_index ?? idx);
    });

    // Add edges between modules after all connections are tracked
    module_connections.forEach((targets, source) => {
      const source_cluster_index = module_id_to_cluster_index.get(source) ?? 0;
      const edge_color = cluster_palette
        ? cluster_palette[source_cluster_index % cluster_palette.length].border
        : "#cccccc";

      targets.forEach(target => {
        const module_edge_id = `module-edge-${source}-${target}`;
        edges.push({
          id: module_edge_id,
          source,
          target,
          type: "default",
          animated: false,
          style: {
            stroke: edge_color,
            strokeWidth: 3,
          },
          ariaLabel: `Module connection from ${source} to ${target}`,
        });
      });
    });
  }

  return { nodes, edges };
}
