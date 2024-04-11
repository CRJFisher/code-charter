"""
# 1: bottom-up summarisation

- Start by summarising the leaf nodes, focussing on the business logic / implied usage intentions
- In parent nodes, add brief summaries of the functions called below so that the parent node summary is higher-level than the child node summaries.
- Distil out the key internals to determine the purpose and usage of the code into a summary

## Notes
- 

# 2: top-down summarisation

- Start by summarising the root node, focussing on the business logic / implied usage intentions
- In child nodes, add brief summaries of current user intent chain e.g. (as comment above function def) root-intention; child-1-intention; etc

## Notes
- 

# 3: Visualise the call graph.

- Create a mermaidJS graph based on the call graph and include the summaries in the nodes.
- Use more LLM calls to compress the graph into different forms:
    - Use subgraphs to group nodes that are part of a common flow i.e. highlighting the overall flow.
    - Focus on business logic and remove/combine nodes that are purely implementation details or too thin


# 4. Summarise the call entire graph by passing prompting with the summaries and their tree structure i.e. with indentation.

# 5. Tasks to investigate Tree reasoning such as:
- Identify which node contains the answer to a question on an implementation detail i.e. using an LLM to navigate the tree.

# 6. Detect control flow of internal function calls and add a summary to add to diagram
"""

from __future__ import annotations
import json
from typing import Dict
from dotenv import find_dotenv, load_dotenv


import asyncio
from langchain.chains.base import Chain
from langchain_core.language_models.llms import BaseLLM
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from asyncio import Future

from models import CallGraphNode, read_call_graph_json_file


_ = load_dotenv(find_dotenv())  # read local .env file

_repository_path = "/gpt-researcher"

# TODO:
#  - [ ] pass in the file path of the target repository
#  - [x] read the call graph json file and parse to a python object
#  - [x] recursively summarise with langchain


async def main():
    call_graphs = read_call_graph_json_file()

    # Just use the first call graph for now. # TODO: make this selectable from some UI
    call_graph = call_graphs[0]

    #When summarizing, try and avoid repeating words in these descriptions. Instead, aim for a higher-level understanding in your summaries, capturing the essence of the code's operation and intentions.
    prompt = PromptTemplate(
        template="""Please provide two generate summaries for the following code. The first summary should focus on the business logic, explaining the overall purpose and intended use of the code in abstract terms. The second summary should detail the implementation, describing the technical aspects and how the code functions internally.
The summaries should be written in the concise, condensed style like a code comment, i.e. omit preambles like `This code...` or `This method...`. Write a --- between the two summaries. Output example:
```
Sends messages to connected websockets.
---
Retrieves messages from a queue and sends them to the specified websocket, as long as the websocket is active.
```
Verify that the symbol: `---` is used exactly once in the output, it is essential that it is present.

Note that the code includes function calls, each preceded by two comments: one for business logic (marked with '---bl:') and the other for implementation details (marked with '---imp:'). 

Here is the code:

```
{code}
```
""",
        input_variables=["code"],
    )

    # llm = ChatOpenAI(model_name="gpt-3.5-turbo-1106", temperature=0, n=1)
    llm = ChatOpenAI(model_name="gpt-4", temperature=0, n=1)
    # Ensure the chain is asynchronous
    chain = prompt | llm

    summaries = {}
    summary_futures = {}
    await leaf_to_root_summarisation(call_graph, summary_futures, summaries, chain)

    with open("out/summaries.json", "w") as f:
        json.dump(summaries, f, indent=2)


async def leaf_to_root_summarisation(
    node: CallGraphNode,
    summary_futures: Dict[str, asyncio.Future],
    summaries: Dict[str, str],
    chain: Chain,
) -> None:
    if node.symbol in summary_futures:
        # Await the future if it's not done. If it's done, this returns immediately.
        await summary_futures[node.symbol]
        return

    # Create a future for the current node and store it
    future = summary_futures[node.symbol] = asyncio.Future()

    # Launch and await tasks for children nodes
    await asyncio.gather(
        *(
            leaf_to_root_summarisation(child, summary_futures, summaries, chain)
            for child in node.children
        )
    )

    # Process this node after all children are done
    child_summaries = {
        child.symbol: summary_futures[child.symbol].result()
        for child in node.children
    }
    if child_summaries:
        print(child_summaries)
    code_block = get_code_from_doc_and_add_function_summaries(node, child_summaries)
    response = await chain.ainvoke({"code": code_block})

    # Set the result for this node's future
    summary_text = response.content
    future.set_result(summary_text)
    summaries[node.symbol] = summary_text


def get_code_from_doc_and_add_function_summaries(
    node: CallGraphNode, summaries: Dict[str, str]
) -> str:
    # read the code from the document
    file_path = f"{_repository_path}/{node.definition_node.document}"
    with open(file_path, "r") as f:
        code = f.readlines()
    for enclosed_node in node.children:
        # Insert summaries above the function call
        [bl, impl] = summaries[enclosed_node.symbol].split("---")
        call_code_line = enclosed_node.reference_node.range.start_line
        call_line_with_summary_prefix = (
            f"---bl: {bl.strip()}\n---imp: {impl.strip()}\n{code[call_code_line]}"
        )
        code[call_code_line] = call_line_with_summary_prefix
    start = node.definition_node.enclosing_range.start_line
    end = node.definition_node.enclosing_range.end_line + 1
    code_block = code[start:end]
    return "".join(code_block)


if __name__ == "__main__":
    asyncio.run(main())
