import React from 'react';
import { DefinitionNode } from '../../shared/models';
import { symbolDisplayName } from '../../shared/symbols';


interface EntryPointDetailsProps {
  entryPoint: DefinitionNode | null;
}

const EntryPointDetails: React.FC<EntryPointDetailsProps> = ({ entryPoint }) => {
  if (!entryPoint) return <div className="p-4">Select an entry point to see details.</div>;
  const displayName = symbolDisplayName(entryPoint.symbol)
  return (
    <div className="p-4">
      <h2 className="text-2xl mb-4">{displayName}</h2>
      <div className="mb-2">
        <strong>File:</strong> {entryPoint.document}
      </div>
      <div className="mb-2">
        {/* <strong>Status:</strong> <span className={`badge ${statusClass(entryPoint.status)}`}>{entryPoint.status}</span> */}
      </div>
      <div className="mb-2">
        {/* <strong>Metadata:</strong>
        <pre className="bg-gray-100 p-2">{JSON.stringify(entryPoint.metadata, null, 2)}</pre> */}
      </div>
    </div>
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

export default EntryPointDetails;
