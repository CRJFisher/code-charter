import React from "react";
import { CodeChartAreaReactFlowWrapper } from "./code_chart_area_react_flow";
import type { CallableNode, SymbolId, SymbolName, FilePath, ScopeId, AnyDefinition } from "@ariadnejs/types";
import { TreeAndContextSummaries, NodeGroup } from "@code-charter/types";
import { CodeIndexStatus } from "../loading_status";

// Test component to verify React Flow integration
export const TestReactFlowComponent: React.FC = () => {
  const mockEntryPoint: CallableNode = {
    symbol_id: "function:/test/file.ts:1:0:10:0:test_function" as SymbolId,
    name: "test_function" as SymbolName,
    enclosed_calls: [],
    location: {
      file_path: "/test/file.ts" as FilePath,
      start_line: 1,
      start_column: 0,
      end_line: 10,
      end_column: 0,
    },
    definition: {
      kind: "function",
      symbol_id: "function:/test/file.ts:1:0:10:0:test_function" as SymbolId,
      name: "test_function" as SymbolName,
      defining_scope_id: "global:/test/file.ts:0:0:100:0" as ScopeId,
      location: {
        file_path: "/test/file.ts" as FilePath,
        start_line: 1,
        start_column: 0,
        end_line: 10,
        end_column: 0,
      },
      is_exported: false,
      signature: { parameters: [] },
      body_scope_id: "function:/test/file.ts:1:0:10:0" as ScopeId,
    } as AnyDefinition,
    is_test: false,
  };

  const mockGetSummaries = async (nodeSymbol: string): Promise<TreeAndContextSummaries | undefined> => {
    return {
      callTreeWithFilteredOutNodes: {
        [nodeSymbol]: mockEntryPoint,
      },
      functionSummaries: {
        [nodeSymbol]: "This is a test function that demonstrates the custom node component with a longer summary text to show how it wraps within the node bounds.",
      },
      refinedFunctionSummaries: {},
      contextSummary: "Test context summary",
    };
  };

  const mockDetectModules = async (): Promise<NodeGroup[] | undefined> => {
    return [];
  };

  return (
    <CodeChartAreaReactFlowWrapper
      selectedEntryPoint={mockEntryPoint}
      screenWidthFraction={1}
      getSummaries={mockGetSummaries}
      detectModules={mockDetectModules}
      indexingStatus={CodeIndexStatus.Ready}
    />
  );
};
