import { FcoseRelativePlacementConstraint } from "cytoscape-fcose";
import { CallGraphNode } from "refscope-types";
import type { NodeGroup, TreeAndContextSummaries } from "../vscodeApi";
import { symbolDisplayName } from "../../../shared/symbols";

function generateRelativePlacementConstraints(
  selectedEntryPoint: CallGraphNode,
  summariesAndFilteredCallTree: TreeAndContextSummaries,
  nodeGroups: NodeGroup[] | undefined
): FcoseRelativePlacementConstraint[] {
  const constraints: FcoseRelativePlacementConstraint[] = [];
  const visited = new Set<string>();

  // Define the mappings
  const compoundIdToGroup: { [compoundId: string]: NodeGroup } = {};
  const symbolToCompoundId: { [symbol: string]: string } = {};

  // Process nodeGroups to populate the mappings
  (nodeGroups || []).forEach((group, index) => {
    const compoundId = `compound_${index}`;
    compoundIdToGroup[compoundId] = group;
    for (const memberSymbol of group.memberSymbols) {
      symbolToCompoundId[memberSymbol] = compoundId;
    }
  });

  // Maps to keep track of relationships for validation
  const topBottomMap = new Map<string, Set<string>>();
  const leftRightMap = new Map<string, Set<string>>();
  const compoundDependencies = new Map<string, Set<string>>();
  const compoundTopBottomMap = new Map<string, Set<string>>();

  function addConstraint(map: Map<string, Set<string>>, from: string, to: string): boolean {
    // Check for immediate conflict
    if (from === to) {
      console.warn(`Cannot add constraint between the same node: ${from}`);
      return false;
    }

    // Initialize the set for 'from' if it doesn't exist
    if (!map.has(from)) {
      map.set(from, new Set());
    }
    map.get(from)!.add(to);

    // Check for cycles
    if (detectCycle(map, from)) {
      console.warn(`Cycle detected when adding constraint from ${from} to ${to}`);
      // Remove the added constraint to maintain consistency
      map.get(from)!.delete(to);
      return false;
    }

    return true;
  }

  function detectCycle(map: Map<string, Set<string>>, startNode: string): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    function dfs(node: string): boolean {
      if (recStack.has(node)) {
        return true; // Cycle detected
      }
      if (visited.has(node)) {
        return false;
      }
      visited.add(node);
      recStack.add(node);

      const neighbors = map.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (dfs(neighbor)) {
            return true;
          }
        }
      }
      recStack.delete(node);
      return false;
    }

    return dfs(startNode);
  }

  function addCompoundConstraint(map: Map<string, Set<string>>, from: string, to: string): boolean {
    // Check for immediate conflict
    if (from === to) {
      console.warn(`Cannot add compound constraint between the same compound: ${from}`);
      return false;
    }

    // Initialize the set for 'from' if it doesn't exist
    if (!map.has(from)) {
      map.set(from, new Set());
    }
    map.get(from)!.add(to);

    // Check for cycles
    if (detectCompoundCycle(map, from)) {
      console.warn(`Cycle detected when adding compound constraint from ${from} to ${to}`);
      // Remove the added constraint to maintain consistency
      map.get(from)!.delete(to);
      return false;
    }

    return true;
  }

  function detectCompoundCycle(map: Map<string, Set<string>>, startCompound: string): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    function dfs(compound: string): boolean {
      if (recStack.has(compound)) {
        return true; // Cycle detected
      }
      if (visited.has(compound)) {
        return false;
      }
      visited.add(compound);
      recStack.add(compound);

      const neighbors = map.get(compound);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (dfs(neighbor)) {
            return true;
          }
        }
      }
      recStack.delete(compound);
      return false;
    }

    return dfs(startCompound);
  }

  function traverse(node: CallGraphNode) {
    if (visited.has(node.symbol)) {
      return;
    }
    visited.add(node.symbol);

    const nodeCompoundId = symbolToCompoundId[node.symbol] || undefined;

    // Get the children that are CallGraphNodes
    const childSymbols = node.calls.map((call) => call.symbol);

    // Add top-bottom constraints (position children below the parent)
    for (const childSymbol of childSymbols) {
      const childCompoundId = symbolToCompoundId[childSymbol] || undefined;

      // If the parent and child are in different compounds, record the dependency
      if (nodeCompoundId && childCompoundId && nodeCompoundId !== childCompoundId) {
        if (!compoundDependencies.has(nodeCompoundId)) {
          compoundDependencies.set(nodeCompoundId, new Set());
        }
        compoundDependencies.get(nodeCompoundId)!.add(childCompoundId);
      }

      // For nodes within the same compound or no compounds, add constraints
      if (nodeCompoundId === childCompoundId || (!nodeCompoundId && !childCompoundId)) {
        // Validate constraint before adding
        if (addConstraint(topBottomMap, node.symbol, childSymbol)) {
          constraints.push({
            top: node.symbol,
            bottom: childSymbol,
            gap: 1,
          });
        }
      }
    }

    // Add left-right constraints between sibling nodes
    for (let i = 0; i < childSymbols.length - 1; i++) {
      const leftChild = childSymbols[i];
      const rightChild = childSymbols[i + 1];

      const leftCompoundId = symbolToCompoundId[leftChild] || undefined;
      const rightCompoundId = symbolToCompoundId[rightChild] || undefined;

      // For nodes within the same compound or no compounds, add constraints
      if (leftCompoundId === rightCompoundId || (!leftCompoundId && !rightCompoundId)) {
        // Validate constraint before adding
        if (addConstraint(leftRightMap, leftChild, rightChild)) {
          constraints.push({
            left: leftChild,
            right: rightChild,
            gap: 1,
          });
        }
      }
    }

    // Recurse on child nodes
    for (const childSymbol of childSymbols) {
      const childNode = summariesAndFilteredCallTree.callTreeWithFilteredOutNodes[childSymbol];
      if (childNode) {
        traverse(childNode);
      }
    }
  }

  // Start traversal from the selectedEntryPoint
  traverse(selectedEntryPoint);

  // Add constraints between compound nodes
  for (const [sourceCompound, targetCompounds] of compoundDependencies.entries()) {
    for (const targetCompound of targetCompounds) {
      if (addCompoundConstraint(compoundTopBottomMap, sourceCompound, targetCompound)) {
        constraints.push({
          top: sourceCompound,
          bottom: targetCompound,
          gap: 1,
        });
      }
    }
  }

  return constraints;
}

const generateElements = (
  selectedEntryPoint: CallGraphNode,
  summariesAndFilteredCallTree: TreeAndContextSummaries,
  nodeGroups: NodeGroup[] | undefined
): cytoscape.ElementDefinition[] => {
  const elements: cytoscape.ElementDefinition[] = [];
  const visited = new Set<string>();

  // Define the mappings
  const compoundIdToGroup: { [compoundId: string]: NodeGroup } = {};
  const symbolToCompoundId: { [symbol: string]: string } = {};

  // Process nodeGroups to populate the mappings
  (nodeGroups || []).forEach((group, index) => {
    const compoundId = `compound_${index}`;
    compoundIdToGroup[compoundId] = group;
    for (const memberSymbol of group.memberSymbols) {
      symbolToCompoundId[memberSymbol] = compoundId;
    }
  });

  // Map to keep track of compound nodes and their connections
  const compoundConnections = new Map<string, Set<string>>();

  // Function to add edges between compound nodes
  const addCompoundEdge = (sourceCompound: string, targetCompound: string) => {
    const edgeId = `compound-edge-${sourceCompound}-${targetCompound}`;
    elements.push({
      data: {
        id: edgeId,
        source: sourceCompound,
        target: targetCompound,
      },
      classes: "compound-edge",
    });
  };

  const addNode = (node: CallGraphNode, isTopLevel: boolean) => {
    if (visited.has(node.symbol)) {
      return;
    }
    visited.add(node.symbol);

    const summary = summariesAndFilteredCallTree.refinedFunctionSummaries[node.symbol]?.trimStart() || "";
    const compoundId = symbolToCompoundId[node.symbol] || undefined;

    // Add node
    elements.push({
      data: {
        id: node.symbol,
        label: isTopLevel
          ? `⮕ ${symbolDisplayName(node.symbol)}\n\n${summary}`
          : `${symbolDisplayName(node.symbol)}\n\n${summary}`,
        document: node.definition.file_path,
        range: node.definition.range,
        parent: compoundId,
      },
      classes: isTopLevel ? "top-level-node" : "node",
    });

    for (const call of node.calls) {
      // Add edge between nodes
      const edgeId = `${node.symbol}-${call.symbol}`;
      elements.push({
        data: {
          id: edgeId,
          source: node.symbol,
          target: call.symbol,
        },
        classes: "edge",
      });

      // Record compound connections
      const childCompoundId = symbolToCompoundId[call.symbol] || undefined;
      if (compoundId && childCompoundId && compoundId !== childCompoundId) {
        if (!compoundConnections.has(compoundId)) {
          compoundConnections.set(compoundId, new Set());
        }
        compoundConnections.get(compoundId)!.add(childCompoundId);
      }

      const callTree = summariesAndFilteredCallTree.callTreeWithFilteredOutNodes;
      if (callTree[call.symbol]) {
        addNode(callTree[call.symbol], false);
      }
    }
  };

  addNode(selectedEntryPoint, true);

  // Add compound nodes for groups
  for (const [compoundId, group] of Object.entries(compoundIdToGroup)) {
    elements.push({
      data: {
        id: compoundId,
        label: group.description || "",
      },
      classes: "compound",
    });
  }

  // Add edges between compound nodes
  for (const [sourceCompound, targetCompounds] of compoundConnections.entries()) {
    for (const targetCompound of targetCompounds) {
      addCompoundEdge(sourceCompound, targetCompound);
    }
  }

  return elements;
};

export { generateRelativePlacementConstraints, generateElements };
