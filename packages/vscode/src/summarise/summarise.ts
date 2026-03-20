import * as vscode from "vscode";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Runnable, RunnableMap, RunnableConfig } from "@langchain/core/runnables";
import type { CallableNode, CallGraph, SymbolId } from "@ariadnejs/types";
import type { TreeAndContextSummaries } from "@code-charter/types";
import PouchDB from "pouchdb";
import { hashText } from "../hashing";
import { symbol_repo_local_name } from "../../shared/symbols";
import { ModelDetails } from "src/model";
import { parseMarkdownTopSection } from "./domainContext";
import { getSummaryWithCachingChain, SummaryRecord } from "./caching";
import { get_resolved_symbol_id } from "../ariadne/call_graph_utils";

interface RefinedSummariesAndFilteredOutNodes {
  refinedFunctionSummaries: Record<string, string>;
  filteredOutNodes: string[];
  filteredCallTree: Record<string, CallableNode>;
}

async function summarise_call_graph(
  top_level_function_symbol: string,
  call_graph: CallGraph,
  work_dir: vscode.Uri,
  workspace_path: vscode.Uri,
  model_details: ModelDetails
): Promise<TreeAndContextSummaries> {
  const top_level_function_name = symbol_repo_local_name(top_level_function_symbol);
  const root_context = await summarise_root_scope(work_dir, workspace_path, top_level_function_name, model_details);

  const definition_nodes = get_all_definition_nodes_from_call_graph(call_graph, top_level_function_symbol as SymbolId);

  const function_symbol_code: Map<string, string> = await get_symbol_to_function_code(definition_nodes, workspace_path);

  const function_descriptions = await get_function_processing_steps(
    work_dir,
    function_symbol_code,
    definition_nodes,
    model_details
  );

  const business_logic_descriptions = await get_function_business_logic(
    work_dir,
    function_descriptions,
    definition_nodes,
    model_details,
    root_context,
    top_level_function_symbol,
    call_graph
  );

  const summaries = {
    functionSummaries: Object.fromEntries(function_descriptions),
    refinedFunctionSummaries: business_logic_descriptions.refinedFunctionSummaries,
    contextSummary: root_context,
    callTreeWithFilteredOutNodes: business_logic_descriptions.filteredCallTree,
  };
  return summaries;
}

async function summarise_root_scope(
  work_dir: vscode.Uri,
  workspace_path: vscode.Uri,
  top_level_function_name: string,
  model_details: ModelDetails
): Promise<string> {
  const db = new PouchDB<SummaryRecord>(`${work_dir.fsPath}/rootScopeSummary`);

  const markdown = await check_for_markdown_file(workspace_path);
  let project_text = "";
  if (markdown) {
    project_text = parseMarkdownTopSection(markdown);
  } else {
    project_text = "No markdown file found - please derive intentions from function path";
  }

  const root_scope_summary_key = hashText(model_details.uid, project_text);
  const cached_summary = await db.get(root_scope_summary_key).catch((_) => null);
  if (cached_summary) {
    return cached_summary.summary;
  }
  const root_context_prompt = new PromptTemplate({
    inputVariables: ["projectText", "functionPath"],
    template: `Please detect the domain of the project and describe the likely intentions of the top-level function in this project.
        Output the sections: "Domain:", "Keywords:" and "Top-level intentions".
        Project description:
        """
        {projectText}
        """
        Function Path:
        """
        {functionPath}
        """`,
  });
  const root_context_summary_chain = root_context_prompt.pipe(model_details.model).pipe(new StringOutputParser());
  const root_context = await root_context_summary_chain.invoke({
    projectText: project_text,
    functionPath: top_level_function_name,
  });

  db.put({
    _id: root_scope_summary_key,
    summary: root_context,
    symbol: "",
    createdAt: new Date(),
  });
  return root_context;
}

function get_all_definition_nodes_from_call_graph(
  graph: CallGraph,
  top_level_function_symbol: SymbolId
): Map<string, CallableNode> {
  const all_function_nodes: Map<string, CallableNode> = new Map();
  const start_node = graph.nodes.get(top_level_function_symbol);
  if (!start_node) return all_function_nodes;
  const queue: CallableNode[] = [start_node];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (!all_function_nodes.has(node.symbol_id)) {
      all_function_nodes.set(node.symbol_id, node);
      node.enclosed_calls.forEach((call_ref) => {
        const resolved_id = get_resolved_symbol_id(call_ref);
        if (resolved_id) {
          const child_node = graph.nodes.get(resolved_id);
          if (child_node) {
            queue.push(child_node);
          }
        }
      });
    }
  }
  return all_function_nodes;
}

async function get_function_processing_steps(
  work_dir: vscode.Uri,
  function_code: Map<string, string>,
  all_function_nodes: Map<string, CallableNode>,
  model_details: ModelDetails
): Promise<Map<string, string>> {
  function build_processing_steps_prompt(symbol: string) {
    return new PromptTemplate({
      inputVariables: [symbol],
      template: `Describe the semantically-grouped lines of code i.e. processing steps of the function below. Output a short, telegram-style line of text for each processing step.
            E.g. "- Parse the input data"
            """
            {${symbol}}
            """`,
    });
  }

  const function_summaries_db = new PouchDB<SummaryRecord>(
    `${work_dir.fsPath}/functionProcessingSteps-${model_details.uid}`
  );

  const output_parser = new StringOutputParser();

  const all_function_summary_chains: {
    [key: string]: Runnable<any, string, RunnableConfig>;
  } = {};
  for (const [symbol, _] of all_function_nodes) {
    const code = function_code.get(symbol);
    if (!code) {
      throw new Error(`Code not found for symbol ${symbol}`);
    }
    const summary_key = hashText(symbol, code);
    const summary_chain = build_processing_steps_prompt(symbol).pipe(model_details.model).pipe(output_parser);
    const summary_from_cache_or_llm_chain = await getSummaryWithCachingChain(
      summary_chain,
      function_summaries_db,
      summary_key,
      symbol
    );
    all_function_summary_chains[symbol] = summary_from_cache_or_llm_chain;
  }

  try {
    const summaries = await RunnableMap.from(all_function_summary_chains).invoke(Object.fromEntries(function_code));
    return new Map(Object.entries(summaries));
  } catch (error) {
    console.error("Error summarising functions:", error);
    throw error;
  }
}

async function get_function_business_logic(
  work_dir: vscode.Uri,
  summaries: Map<string, string>,
  all_function_nodes: Map<string, CallableNode>,
  model_details: ModelDetails,
  domain_summary: string,
  top_level_function_symbol: string,
  call_graph: CallGraph
): Promise<RefinedSummariesAndFilteredOutNodes> {
  function build_business_logic_prompt(symbol: string) {
    return new PromptTemplate({
      inputVariables: [symbol],
      template: `I really need to translate the processing steps below and distil them to business logic descriptions.
            Business logic should be terms that a non-technical, yet domain-knowledgeable person would understand.
            Here is a summary of the domain:
            """
            ${domain_summary}
            """
            Business logic should be terms in the realm of the domain and should focus on the "happy" path.
            If all the processing steps are technical implementation details, output "- None".
            The original processing steps can be filtered out, merged or rephrased. The goal is to write the minimum steps that capture the essence of the function.
            Implementation steps should be removed e.g. initialization, error handling, and debug logging.
            The processing steps for the "${symbol}" function are:
            """
            {${symbol}}
            """
            Only return the filtered, transformed steps in concise, telegraph-style bullet points. E.g. "- Get the user's email address"
            `,
    });
  }

  const function_summaries_db = new PouchDB<SummaryRecord>(`${work_dir.fsPath}/functionBusinessLogic-${model_details.uid}`);

  const output_parser = new StringOutputParser();
  const all_function_summary_chains: {
    [key: string]: Runnable<any, string, RunnableConfig>;
  } = {};
  for (const [_, node] of all_function_nodes) {
    const summary_chain = build_business_logic_prompt(node.symbol_id).pipe(model_details.model).pipe(output_parser);
    const summary_key = hashText(node.symbol_id, summaries.get(node.symbol_id) || '');
    const summary_from_cache_or_llm_chain = await getSummaryWithCachingChain(
      summary_chain,
      function_summaries_db,
      summary_key,
      node.symbol_id
    );
    all_function_summary_chains[node.symbol_id] = summary_from_cache_or_llm_chain;
  }

  try {
    const refined_summaries = await RunnableMap.from(all_function_summary_chains).invoke(Object.fromEntries(summaries));
    const filtered_out_nodes = Object.entries(refined_summaries)
      .filter(([_, summary]) => summary.includes("- None"))
      .map(([symbol, _]) => symbol);
    const filtered_call_tree = get_call_graph_items_with_filtered_out_functions(
      top_level_function_symbol as SymbolId,
      filtered_out_nodes,
      call_graph
    );
    const filtered_function_summaries = Object.fromEntries(
      Object.entries(refined_summaries).filter(([symbol, _]) => !!filtered_call_tree[symbol])
    );
    return {
      refinedFunctionSummaries: filtered_function_summaries,
      filteredOutNodes: filtered_out_nodes,
      filteredCallTree: filtered_call_tree,
    };
  } catch (error) {
    console.error("Error summarising business logic", error);
    throw error;
  }
}

async function get_symbol_to_function_code(
  all_function_nodes: Map<string, CallableNode>,
  workspace_path: vscode.Uri
): Promise<Map<string, string>> {
  const node_code: Map<string, string> = new Map();
  await Promise.all(
    Array.from(all_function_nodes.values()).map(async (n) => {
      const file_path = n.location.file_path as string;
      const code = await vscode.workspace.fs
        .readFile(vscode.Uri.file(file_path))
        .then((buffer) => new TextDecoder().decode(buffer));
      const code_lines = code.split("\n");
      const function_lines = code_lines.slice(n.location.start_line, n.location.end_line);
      node_code.set(n.symbol_id, function_lines.join("\n"));
    })
  );
  return node_code;
}

async function check_for_markdown_file(directory_path: vscode.Uri): Promise<string | null> {
  try {
    // Read all files in the directory asynchronously
    const files = await vscode.workspace.fs.readDirectory(directory_path);
    // Iterate over each file, check its lowercase form
    for (const [file_name, file_type] of files) {
      if (file_name.toLowerCase() === "readme.md") {
        // If a match is found, return the file text
        return await vscode.workspace.fs
          .readFile(vscode.Uri.joinPath(directory_path, file_name))
          .then((buffer) => new TextDecoder().decode(buffer));
      }
    }
  } catch (error) {
    console.error("Failed to read the directory:", error);
    return null;
  }
  // Return null if no matching file is found
  return null;
}

function get_call_graph_items_with_filtered_out_functions(
  top_level_function_symbol: SymbolId,
  filtered_out_nodes: string[],
  call_graph: CallGraph
): Record<string, CallableNode> {
  function copy_node_without_filtered_out_refs(node: CallableNode): CallableNode {
    const new_children = node.enclosed_calls.filter((call_ref) => {
      const resolved_id = get_resolved_symbol_id(call_ref);
      return resolved_id !== undefined && !filtered_out_nodes.includes(resolved_id);
    });
    return {
      symbol_id: node.symbol_id,
      name: node.name,
      enclosed_calls: new_children,
      location: node.location,
      definition: node.definition,
      is_test: node.is_test,
    };
  }
  const visited_nodes = new Set<string>();
  const call_graph_items: Record<string, CallableNode> = {};
  const start_node = call_graph.nodes.get(top_level_function_symbol);
  if (!start_node) return call_graph_items;
  const queue: CallableNode[] = [copy_node_without_filtered_out_refs(start_node)];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (!filtered_out_nodes.includes(node.symbol_id) && !visited_nodes.has(node.symbol_id)) {
      call_graph_items[node.symbol_id] = node;
      node.enclosed_calls.forEach((call_ref) => {
        const resolved_id = get_resolved_symbol_id(call_ref);
        if (resolved_id) {
          const child_node = call_graph.nodes.get(resolved_id);
          if (child_node) {
            queue.push(copy_node_without_filtered_out_refs(child_node));
          }
        }
      });
      visited_nodes.add(node.symbol_id);
    }
  }
  return call_graph_items;
}

export { summarise_call_graph };
