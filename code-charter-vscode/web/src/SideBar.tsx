import React from 'react';
import { CallGraph, DefinitionNode } from '../../shared/models';
import { symbolDisplayName } from '../../shared/symbols';


interface SidebarProps {
  callGraph: CallGraph;
  onSelect: (entryPoint: DefinitionNode) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ callGraph, onSelect }) => {
  return (
    <aside className="bg-gray-100 p-4 overflow-y-auto">
      <ul>
        {callGraph.topLevelNodes.map((nodeSymbol) => {
          const node = callGraph.definitionNodes[nodeSymbol];
          const displayName = symbolDisplayName(node.symbol);
          return (
            <li
              key={node.symbol}
              className="p-2 mb-2 cursor-pointer bg-white shadow-sm hover:bg-gray-200"
              onClick={() => onSelect(node)}
            >
              <div className="flex justify-between">
                <span>{displayName}</span>
                {/* <span className={`badge ${statusClass(entryPoint.status)}`}>
              {entryPoint.status}
            </span> */}
                <span className="badge-secondary">Status</span>
              </div>
              <div className="text-xs text-gray-500">{node.document}</div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
};

// const statusClass = (status: EntryPoint['status']) => {
//   switch (status) {
//     case 'not-summarised':
//       return 'badge-secondary';
//     case 'partially-summarised':
//       return 'badge-warning';
//     case 'summarised':
//       return 'badge-success';
//     default:
//       return '';
//   }
// };

export default Sidebar;
