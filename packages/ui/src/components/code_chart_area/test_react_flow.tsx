import React from "react";
import { CodeChartAreaReactFlowWrapper } from "./code_chart_area_react_flow";
import { CallGraphNode } from "@ariadnejs/core";
import { DocstringSummaries, NodeGroup } from "@code-charter/types";
import { CodeIndexStatus } from "../loading_status";

// Test component to verify React Flow integration
export const TestReactFlowComponent: React.FC = () => {
  const mockEntryPoint: CallGraphNode = {
    symbol: "test::function",
    definition: {
      kind: "definition",
      name: "test_function",
      symbol_kind: "Function",
      symbol_id: "test_function_id",
      id: 1,
      file_path: "/test/file.ts",
      range: {
        start: { row: 1, column: 0 },
        end: { row: 10, column: 0 },
      },
    },
    children: [],
  };

  const mock_get_descriptions = async (nodeSymbol: string): Promise<DocstringSummaries | undefined> => {
    return {
      call_tree: {
        [nodeSymbol]: mockEntryPoint,
      },
      docstrings: {
        [nodeSymbol]: "This is a test function that demonstrates the custom node component with a longer description text to show how it wraps within the node bounds.",
      },
    };
  };

  const mockDetectModules = async (): Promise<NodeGroup[] | undefined> => {
    return [];
  };

  return (
    <CodeChartAreaReactFlowWrapper
      selectedEntryPoint={mockEntryPoint}
      screenWidthFraction={1}
      getDescriptions={mock_get_descriptions}
      detectModules={mockDetectModules}
      indexingStatus={CodeIndexStatus.Ready}
    />
  );
};