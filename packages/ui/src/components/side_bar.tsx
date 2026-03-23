import React, { useState, useMemo } from "react";
import { useBackend } from "../hooks/use_backend";
import type { CallGraph, CallableNode, CallReference, SymbolId } from "@code-charter/types";
import { symbol_display_name } from "./code_chart_area/symbol_display";

function count_nodes(top_level_node: SymbolId, graph: CallGraph, visited_nodes: Set<SymbolId> = new Set<SymbolId>()): number {
  const node = graph.nodes.get(top_level_node);
  if (!node) return 0;

  return node.enclosed_calls.reduce((acc: number, call: CallReference) => {
    const resolved_id = call.resolutions[0]?.symbol_id;
    if (!resolved_id || visited_nodes.has(resolved_id)) {
      return acc;
    }
    visited_nodes.add(resolved_id);
    return acc + count_nodes(resolved_id, graph, visited_nodes);
  }, 1);
}

interface SidebarProps {
  call_graph: CallGraph;
  selected_node: CallableNode | null;
  on_select: (entry_point: CallableNode) => void;
  are_node_descriptions_loading: (node_symbol: string) => boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ call_graph, on_select, selected_node, are_node_descriptions_loading }) => {
  const { backend } = useBackend();
  const [is_sidebar_open, set_is_sidebar_open] = useState(true);

  const toggle_sidebar = () => {
    set_is_sidebar_open(!is_sidebar_open);
  };

  const select_item_and_close_sidebar = (node: CallableNode) => {
    on_select(node);
  };

  return (
    <div
      className={`flex h-screen transition-all duration-300 ${
        is_sidebar_open ? "w-1/4" : "w-12"
      } bg-vscodeGutter border-r border-vscodeBorder`}
    >
      <div className="relative h-full flex flex-col w-full">
        <div className="flex items-center p-2 bg-vscodeBg">
          <div className="flex-grow">
            <button onClick={toggle_sidebar} className="p-1 bg-vscodeFg text-vscodeBg rounded-full focus:outline-none">
              {is_sidebar_open ? '◀' : '☰'}
            </button>
          </div>
          {is_sidebar_open && (
            <button
              onClick={toggle_sidebar}
              className="ml-auto p-1 bg-vscodeFg text-vscodeBg rounded-full focus:outline-none"
            >
              ⚙️
            </button>
          )}
        </div>
        <aside
          className={`flex-1 overflow-y-auto ${
            is_sidebar_open ? "opacity-100" : "opacity-0"
          } transition-opacity duration-300`}
        >
          <FunctionsList
            call_graph={call_graph}
            selected_node={selected_node}
            on_select={select_item_and_close_sidebar}
            are_node_descriptions_loading={are_node_descriptions_loading}
          />
        </aside>
      </div>
    </div>
  );
};

interface FunctionsListProps {
  call_graph: CallGraph;
  selected_node: CallableNode | null;
  on_select: (entry_point: CallableNode) => void;
  are_node_descriptions_loading: (node_symbol: string) => boolean;
}

const FunctionsList: React.FC<FunctionsListProps> = ({
  call_graph,
  selected_node,
  on_select,
  are_node_descriptions_loading,
}) => {
  const { backend } = useBackend();

  const on_click_item = async (node: CallableNode) => {
    on_select(node);
    await backend.navigateToDoc(node.definition.location.file_path, node.definition.location.start_line);
  };

  const tot_nodes_count_descending_symbols = useMemo(() => {
    return [...call_graph.entry_points].sort(
      (a, b) => count_nodes(b, call_graph) - count_nodes(a, call_graph)
    );
  }, [call_graph]);

  return (
    <ul className="w-full">
      {tot_nodes_count_descending_symbols.map((node_symbol) => {
        const node = call_graph.nodes.get(node_symbol);
        if (!node) return null;
        const display_name = symbol_display_name(node.symbol_id);
        const is_selected = selected_node && selected_node.symbol_id === node_symbol;
        const is_loading = are_node_descriptions_loading(node.symbol_id);
        return (
          <li
            key={node.symbol_id}
            className={`p-4 cursor-pointer bg-vscodeBg shadow-sm hover:bg-vscodeSelection ${
              is_selected ? "bg-vscodeSelection text-vscodeFg border border-vscodeBorder" : ""
            }`}
            onClick={() => on_click_item(node)}
          >
            <div className="flex flex-wrap">
              <span className="truncate" title={display_name}>{display_name}</span>
            </div>
            <div className="flex items-center text-xs text-vscodeLineNumber h-5">
              {is_loading ? (
                <div className="flex items-center">
                  <span className="mr-2">Loading</span>
                  <div className="w-4 h-4 border-2 border-t-transparent border-vscodeFg rounded-full animate-spin" />
                </div>
              ) : (
                <span className="ellipsis-end">{node.definition.location.file_path}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default Sidebar;
