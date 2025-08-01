import React, { useState } from "react";
import { CallGraph, CallGraphNode } from "@ariadnejs/core";
import { countNodes } from "../../shared/codeGraph";
import { symbolDisplayName } from "../../shared/symbols";
import { AiOutlineMenu } from "react-icons/ai";
import { MdKeyboardDoubleArrowLeft, MdSettings } from "react-icons/md";
import { navigateToDoc } from "./vscodeApi";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import TextOverflow from "react-text-overflow";

interface SidebarProps {
  callGraph: CallGraph;
  selectedNode: CallGraphNode | null;
  onSelect: (entryPoint: CallGraphNode) => void;
  areNodeSummariesLoading: (nodeSymbol: string) => boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ callGraph, onSelect, selectedNode, areNodeSummariesLoading }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const selectItemAndCloseSidebar = (node: CallGraphNode) => {
    onSelect(node);
    // setIsSidebarOpen(false); // TODO: make configurable
  };

  return (
    <div
      className={`flex h-screen transition-all duration-300 ${
        isSidebarOpen ? "w-1/4" : "w-12"
      } bg-vscodeGutter border-r border-vscodeBorder`}
    >
      <div className="relative h-full flex flex-col w-full">
        <div className="flex items-center p-2 bg-vscodeBg">
          <div className="flex-grow">
            <button onClick={toggleSidebar} className="p-1 bg-vscodeFg text-vscodeBg rounded-full focus:outline-none">
              {isSidebarOpen ? <MdKeyboardDoubleArrowLeft size={20} /> : <AiOutlineMenu size={20} />}
            </button>
          </div>
          {isSidebarOpen && (
            <button
              onClick={toggleSidebar}
              className="ml-auto p-1 bg-vscodeFg text-vscodeBg rounded-full focus:outline-none"
            >
              <MdSettings size={20} />
            </button>
          )}
        </div>
        <aside
          className={`flex-1 overflow-y-auto ${
            isSidebarOpen ? "opacity-100" : "opacity-0"
          } transition-opacity duration-300`}
        >
          <FunctionsList
            callGraph={callGraph}
            selectedNode={selectedNode}
            onSelect={selectItemAndCloseSidebar}
            areNodeSummariesLoading={areNodeSummariesLoading}
          />
        </aside>
      </div>
    </div>
  );
};

interface FunctionsListProps {
  callGraph: CallGraph;
  selectedNode: CallGraphNode | null;
  onSelect: (entryPoint: CallGraphNode) => void;
  areNodeSummariesLoading: (nodeSymbol: string) => boolean;
}

const FunctionsList: React.FC<FunctionsListProps> = ({
  callGraph,
  selectedNode,
  onSelect,
  areNodeSummariesLoading,
}) => {
  const onClickItem = async (node: CallGraphNode) => {
    onSelect(node);
    await navigateToDoc(node.definition.file_path, node.definition.range.start.row);
  };

  const totNodesCountDescendingSymbols = callGraph.top_level_nodes.sort(
    (a: string, b: string) => countNodes(b, callGraph) - countNodes(a, callGraph)
  );

  return (
    <ul className="w-full">
      {totNodesCountDescendingSymbols.map((nodeSymbol: string) => {
        const node = callGraph.nodes.get(nodeSymbol);
        if (!node) return null;
        const displayName = symbolDisplayName(node.symbol);
        const isSelected = selectedNode && selectedNode.symbol === nodeSymbol;
        const isLoading = areNodeSummariesLoading(node.symbol);
        return (
          <li
            key={node.symbol}
            className={`p-4 cursor-pointer bg-vscodeBg shadow-sm hover:bg-vscodeSelection ${
              isSelected ? "bg-vscodeSelection text-vscodeFg border border-vscodeBorder" : ""
            }`}
            onClick={() => onClickItem(node)}
          >
            <div className="flex flex-wrap">
              <TextOverflow text={displayName} truncatePosition="start" />
            </div>
            <div className="flex items-center text-xs text-vscodeLineNumber h-5">
              {isLoading ? (
                <div className="flex items-center">
                  <span className="mr-2">Summarizing</span>
                  <VSCodeProgressRing className="w-4 h-4" />
                </div>
              ) : (
                <span className="ellipsis-end">{node.definition.file_path}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default Sidebar;
