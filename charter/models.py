import json
from typing import List
from pydantic import BaseModel, TypeAdapter
import re


class DocRange(BaseModel):
    start_line: int
    start_character: int
    end_line: int
    end_character: int


class DefinitionNode(BaseModel):
    range: DocRange
    document: str
    enclosing_range: DocRange


class ReferenceNode(BaseModel):
    range: DocRange
    document: str


class CallGraphNode(BaseModel):
    symbol: str
    definition_node: DefinitionNode
    children: List["CallGraphNode"]
    reference_node: ReferenceNode = None

    @property
    def repo_local_name(self) -> str:
        shortened = (
            " ".join(self.symbol.split(" ")[4:])
            .replace("`", ".")
            .replace("/", ".")
            .replace("(", "")
            .replace(")", "")
            .replace("..", ".")
        )
        # use regex to remove any periods at the start or end of the string
        shortened = re.sub(r"^\.", "", shortened)
        shortened = re.sub(r"\.$", "", shortened)
        return shortened

    @property
    def display_name(self) -> str:
        return self.repo_local_name.split(".")[-1]


def read_call_graph_json_file() -> List[CallGraphNode]:
    file_path = "out/call_graph.json"
    # parse json file
    with open(file_path, "r") as f:
        json_string = f.read()
    # parse json string
    ta = TypeAdapter(List[CallGraphNode])
    call_graph_dict = json.loads(json_string)
    call_graph = ta.validate_python(call_graph_dict)
    return call_graph
