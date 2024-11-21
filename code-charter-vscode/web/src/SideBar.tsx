import React, { useState } from "react";
import { CallGraph, countNodes, DefinitionNode } from "../../shared/codeGraph";
import { symbolDisplayName } from "../../shared/symbols";
import { AiOutlineMenu } from "react-icons/ai";
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { navigateToDoc } from "./vscodeApi";
import { CodeIndexStatus } from "./codeIndex";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import TextOverflow from "react-text-overflow";

interface SidebarProps {
  callGraph: CallGraph;
  selectedNode: DefinitionNode | null;
  indexingStatus: CodeIndexStatus;
  onSelect: (entryPoint: DefinitionNode) => void;
  areNodeSummariesLoading: (nodeSymbol: string) => boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  callGraph,
  onSelect,
  selectedNode,
  indexingStatus,
  areNodeSummariesLoading,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div
      className={`flex h-screen transition-all duration-300 ${
        isSidebarOpen ? "w-1/4" : "w-12"
      } bg-vscodeGutter border-r border-vscodeBorder`}
    >
      <div className="relative h-full flex flex-col w-full">
        <div className="flex items-center p-2">
          <button onClick={toggleSidebar} className="p-1 bg-vscodeFg text-vscodeBg rounded-full focus:outline-none">
            {isSidebarOpen ? <MdKeyboardDoubleArrowLeft size={24} /> : <AiOutlineMenu size={24} />}
          </button>
        </div>
        <aside
          className={`flex-1 overflow-y-auto ${
            isSidebarOpen ? "opacity-100" : "opacity-0"
          } transition-opacity duration-300`}
        >
          {indexingStatus !== CodeIndexStatus.Ready && (
            <>
              <div className="p-4 text-center">
                Indexing...<br></br>
              </div>
              <div className="flex justify-center items-center">
                <VSCodeProgressRing />
              </div>
            </>
          )}
          <FunctionsList
            callGraph={callGraph}
            selectedNode={selectedNode}
            onSelect={onSelect}
            areNodeSummariesLoading={areNodeSummariesLoading}
          />
        </aside>
      </div>
    </div>
  );
};

interface FunctionsListProps {
  callGraph: CallGraph;
  selectedNode: DefinitionNode | null;
  onSelect: (entryPoint: DefinitionNode) => void;
  areNodeSummariesLoading: (nodeSymbol: string) => boolean;
}

const FunctionsList: React.FC<FunctionsListProps> = ({
  callGraph,
  selectedNode,
  onSelect,
  areNodeSummariesLoading,
}) => {
  const onClickItem = async (node: DefinitionNode) => {
    onSelect(node);
    await navigateToDoc(node.document, node.enclosingRange.startLine);
  };

  const totNodesCountDescendingSymbols = callGraph.topLevelNodes.sort(
    (a, b) => countNodes(b, callGraph) - countNodes(a, callGraph)
  );

  return (
    <ul className="w-full">
      {totNodesCountDescendingSymbols.map((nodeSymbol) => {
        const node = callGraph.definitionNodes[nodeSymbol];
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
                <span className="ellipsis-end">{node.document}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default Sidebar;
