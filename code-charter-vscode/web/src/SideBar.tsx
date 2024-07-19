import React, { useState } from 'react';
import { CallGraph, DefinitionNode } from '../../shared/codeGraph';
import { symbolDisplayName } from '../../shared/symbols';
import { AiOutlineMenu } from 'react-icons/ai';
import { MdKeyboardDoubleArrowLeft } from "react-icons/md";
import { navigateToDoc } from './vscodeApi';
import { CodeIndexStatus } from './codeIndex';
import { VSCodeProgressRing } from '@vscode/webview-ui-toolkit/react';
interface SidebarProps {
  callGraph: CallGraph;
  selectedNode: DefinitionNode | null;
  indexingStatus: CodeIndexStatus;
  onSelect: (entryPoint: DefinitionNode) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ callGraph, onSelect, selectedNode, indexingStatus }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className={`flex h-screen transition-all duration-300 ${isSidebarOpen ? 'w-1/4' : 'w-12'} bg-vscodeGutter border-r border-vscodeBorder`}>
      <div className="relative h-full flex flex-col w-full">
        <div className="flex items-center p-2">
          <button
            onClick={toggleSidebar}
            className="p-1 bg-vscodeFg text-vscodeBg rounded-full focus:outline-none"
          >
            {isSidebarOpen ? <MdKeyboardDoubleArrowLeft size={24} /> : <AiOutlineMenu size={24} />}
          </button>
        </div>
        <aside className={`flex-1 overflow-y-auto ${isSidebarOpen ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}>
          {indexingStatus !== CodeIndexStatus.Ready && (
            <>
              <div className="p-4 text-center">Indexing...<br></br></div>
              <div className="flex justify-center items-center">
                <VSCodeProgressRing />
              </div>
            </>
          )}
          <FunctionsList callGraph={callGraph} selectedNode={selectedNode} onSelect={onSelect} />
        </aside>
      </div>
    </div>
  );
};

interface FunctionsListProps {
  callGraph: CallGraph;
  selectedNode: DefinitionNode | null;
  onSelect: (entryPoint: DefinitionNode) => void;
}

const FunctionsList: React.FC<FunctionsListProps> = ({ callGraph, selectedNode, onSelect }) => {

  const onClickItem = async (node: DefinitionNode) => {
    onSelect(node);
    await navigateToDoc(node.document, node.enclosingRange.startLine);
  };

  return (
    <ul className="w-full">
      {callGraph.topLevelNodes.map((nodeSymbol) => {
        const node = callGraph.definitionNodes[nodeSymbol];
        const displayName = symbolDisplayName(node.symbol);
        const isSelected = selectedNode && selectedNode.symbol === nodeSymbol;
        return (
          <li
            key={node.symbol}
            className={`p-4 cursor-pointer bg-vscodeBg shadow-sm hover:bg-vscodeSelection ${isSelected ? 'bg-vscodeSelection text-vscodeFg border border-vscodeBorder' : ''}`}
            onClick={() => onClickItem(node)}
          >
            <div className="flex flex-wrap">
              <span className="ellipsis-end">{displayName}</span>
            </div>
            <div className="text-xs ellipsis-end text-vscodeLineNumber">{node.document}</div>
          </li>
        );
      })}
    </ul>
  );
};

export default Sidebar;
