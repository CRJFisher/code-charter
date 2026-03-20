import React from "react";
import { CodeChartAreaReactFlowWrapper } from "./code_chart_area_react_flow";
import type { CallableNode, AnyDefinition, SymbolId, SymbolName } from "@code-charter/types";
import { DocstringSummaries, NodeGroup } from "@code-charter/types";
import { CodeIndexStatus } from "../loading_status";

// Test component to verify React Flow integration
export const TestReactFlowComponent: React.FC = () => {
  const mock_location = {
    file_path: "/test/file.ts",
    start_line: 1,
    start_column: 0,
    end_line: 10,
    end_column: 0,
  };

  const mock_definition = {
    kind: "function" as const,
    symbol_id: "function:/test/file.ts:1:0:10:0:test_function" as SymbolId,
    name: "test_function" as SymbolName,
    defining_scope_id: "scope:0",
    location: mock_location,
    is_exported: false,
    signature: { parameters: [] },
    body_scope_id: "scope:1",
  } as unknown as AnyDefinition;

  const mock_entry_point = {
    symbol_id: "function:/test/file.ts:1:0:10:0:test_function" as SymbolId,
    name: "test_function" as SymbolName,
    enclosed_calls: [],
    location: mock_location,
    definition: mock_definition,
    is_test: false,
  } as unknown as CallableNode;

  const mock_get_descriptions = async (nodeSymbol: string): Promise<DocstringSummaries | undefined> => {
    return {
      call_tree: {
        [nodeSymbol]: mock_entry_point,
      },
      docstrings: {
        [nodeSymbol]: "This is a test function that demonstrates the custom node component with a longer description text to show how it wraps within the node bounds.",
      },
    };
  };

  const mock_detect_modules = async (): Promise<NodeGroup[] | undefined> => {
    return [];
  };

  return (
    <CodeChartAreaReactFlowWrapper
      selectedEntryPoint={mock_entry_point}
      screenWidthFraction={1}
      getDescriptions={mock_get_descriptions}
      detectModules={mock_detect_modules}
      indexingStatus={CodeIndexStatus.Ready}
    />
  );
};
