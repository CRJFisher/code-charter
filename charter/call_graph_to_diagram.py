"""
Convert the call graph into a mermaid flowchart with subgraphs for each function

E.g.

flowchart TB
    c1-->a2
    subgraph one
    a1-->a2
    end
    subgraph two
    b1-->b2
    end
    subgraph three
    c1-->c2
    end
"""
from __future__ import annotations

import json
from typing import Dict, List, Set

from models import CallGraphNode, read_call_graph_json_file


def call_graph_to_mermaid() -> None:
    call_graph_node = read_call_graph_json_file()[0]
    # read summaries
    with open("summaries.json", "r") as f:
        summaries = json.load(f)
    # create mermaid flowchart
    subgraphs, connections = generate_mermaid(call_graph_node, summaries)
    mermaid_syntax = create_mermaid_diagram(subgraphs, connections)
    with open("out/diagram.md", "w") as f:
        mermaid_block = f"```mermaid\n{mermaid_syntax}\n```"
        f.write(mermaid_block)


def generate_mermaid(
    node: CallGraphNode,
    summaries: Dict[str, str],
    subgraphs: Dict[str, List[str]] = None,
    connections: List[str] = None,
    visited_nodes: Set[str] = None,
) -> str:
    if subgraphs is None:
        subgraphs = {}
    if connections is None:
        connections = []
    if visited_nodes is None:
        visited_nodes = set()

    document = node.definition_node.document
    node_id = node.repo_local_name

    # Prevent duplicate node processing
    if node_id in visited_nodes:
        return
    visited_nodes.add(node_id)

    summary = summaries[node.symbol].split("---")[0].strip()
    length_limited_segments = [seg for sentence in summary.split(".") for seg in split_sentence(sentence)]
    split_summary = "\n".join(length_limited_segments)
    node_label = f"[<strong>{node.display_name}</strong> \n {split_summary}]"
    if document not in subgraphs:
        subgraphs[document] = []
    subgraphs[document].append(f"{node_id}{node_label}")

    for i, child in enumerate(node.children, start=1):
        child_id = child.repo_local_name
        link_str = f"--{i}-->" if len(node.children) > 1 else "-->"
        connections.append(f"{node_id} {link_str} {child_id}")
        generate_mermaid(child, summaries, subgraphs, connections, visited_nodes)

    return subgraphs, connections

def split_sentence(sentence: str, word_limit: int = 6) -> List[str]:
    if not sentence:
        return []
    segments = []
    words = sentence.split(" ")
    current_segment = ""
    for word in words:
        if len(current_segment.split(" "))  >= word_limit:
            segments.append(current_segment)
            current_segment = ""
        current_segment += f" {word}"
    segments.append(current_segment)
    if segments[-1][-1] != ".":
        segments[-1] += "."
    return segments


# Generate the mermaid syntax with subgraphs and connections
def create_mermaid_diagram(subgraphs: Dict[str, List[str]], connections: List[str]) -> str:
    mermaid_syntax = ["graph TB"]
    for document, nodes in subgraphs.items():
        mermaid_syntax.append(f"subgraph {document.replace(' ', '')} [{document}]")
        mermaid_syntax.extend(nodes)
        mermaid_syntax.append("end")
    mermaid_syntax.extend(connections)
    return "\n".join(mermaid_syntax)


if __name__ == "__main__":
    call_graph_to_mermaid()
