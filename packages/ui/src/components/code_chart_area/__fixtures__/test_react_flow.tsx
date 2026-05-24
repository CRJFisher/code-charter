import React from "react";
import { CodeChartAreaReactFlowWrapper } from "../code_chart_area";
import type { CallableNode, SymbolId, SymbolName } from "@code-charter/types";
import type { FilePath } from "@ariadnejs/types";
import type { ScopeId } from "@ariadnejs/types/dist/scopes";
import type { FunctionDefinition } from "@ariadnejs/types/dist/symbol_definitions";
import { DocstringSummaries, NodeGroup } from "@code-charter/types";
import { CodeIndexStatus } from "../../loading_status";

// Test component to verify React Flow integration
export const TestReactFlowComponent: React.FC = () => {
  const mock_location = {
    file_path: "/test/file.ts" as FilePath,
    start_line: 1,
    start_column: 0,
    end_line: 10,
    end_column: 0,
  };

  const mock_definition: FunctionDefinition = {
    kind: "function",
    symbol_id: "function:/test/file.ts:1:0:10:0:test_function" as SymbolId,
    name: "test_function" as SymbolName,
    defining_scope_id: "scope:0" as ScopeId,
    location: mock_location,
    is_exported: false,
    signature: { parameters: [] },
    body_scope_id: "scope:1" as ScopeId,
  };

  const mock_entry_point: CallableNode = {
    symbol_id: "function:/test/file.ts:1:0:10:0:test_function" as SymbolId,
    name: "test_function" as SymbolName,
    enclosed_calls: [],
    location: mock_location,
    definition: mock_definition,
    is_test: false,
  };

  const mock_get_descriptions = async (node_symbol: string): Promise<DocstringSummaries | undefined> => {
    return {
      call_tree: {
        [node_symbol]: mock_entry_point,
      },
      docstrings: {
        [node_symbol]: "This is a test function that demonstrates the custom node component with a longer description text to show how it wraps within the node bounds.",
      },
    };
  };

  const mock_detect_modules = async (): Promise<NodeGroup[] | undefined> => {
    return [];
  };

  return (
    <CodeChartAreaReactFlowWrapper
      selected_entry_point={mock_entry_point}
      screen_width_fraction={1}
      get_descriptions={mock_get_descriptions}
      detect_modules={mock_detect_modules}
      indexing_status={CodeIndexStatus.Ready}
    />
  );
};
