import React from "react";
import { TreeAndContextSummaries, NodeGroup } from "../../backends/types";
import { CodeIndexStatus } from "../loading_status";

// Simplified types for now
type CallGraphNode = any;

interface CodeChartAreaProps {
  selected_entry_point: CallGraphNode | null;
  screen_width_fraction: number;
  get_summaries: (node_symbol: string) => Promise<TreeAndContextSummaries | undefined>;
  detect_modules: () => Promise<NodeGroup[] | undefined>;
  indexing_status: CodeIndexStatus;
}

/**
 * Simplified CodeChartArea component for initial extraction
 * TODO: Port the full cytoscape visualization
 */
export const CodeChartArea: React.FC<CodeChartAreaProps> = ({
  selected_entry_point,
  screen_width_fraction,
  get_summaries,
  detect_modules,
  indexing_status,
}) => {
  const [summaries, set_summaries] = React.useState<TreeAndContextSummaries | null>(null);
  const [modules, set_modules] = React.useState<NodeGroup[]>([]);
  const [loading, set_loading] = React.useState(false);

  React.useEffect(() => {
    if (selected_entry_point) {
      set_loading(true);
      Promise.all([
        get_summaries(selected_entry_point.symbol),
        detect_modules()
      ]).then(([summaries_data, modules_data]) => {
        if (summaries_data) set_summaries(summaries_data);
        if (modules_data) set_modules(modules_data);
        set_loading(false);
      });
    }
  }, [selected_entry_point, get_summaries, detect_modules]);

  if (indexing_status === CodeIndexStatus.Indexing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-t-transparent border-vscodeFg rounded-full animate-spin mx-auto mb-4" />
          <p>Indexing code...</p>
        </div>
      </div>
    );
  }

  if (!selected_entry_point) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-vscodeLineNumber">Select a function from the sidebar to view its diagram</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4">
      <h2 className="text-xl font-bold mb-4">
        {selected_entry_point.definition?.name || selected_entry_point.symbol}
      </h2>
      
      {loading && (
        <div className="w-6 h-6 border-2 border-t-transparent border-vscodeFg rounded-full animate-spin" />
      )}

      {summaries && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Context Summary</h3>
          <p className="text-vscodeLineNumber">{summaries.contextSummary}</p>
        </div>
      )}

      {modules.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-2">Modules</h3>
          <div className="space-y-2">
            {modules.map((module, index) => (
              <div key={index} className="bg-vscodeGutter p-3 rounded">
                <h4 className="font-medium mb-1">{module.description}</h4>
                <p className="text-sm text-vscodeLineNumber">
                  {module.memberSymbols.length} functions
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};