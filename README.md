# Code Charter 🧭

## Introduction

Code Charter: The AI-powered tool designed for rapid comprehension of complex code structures.

This project began as a solution to understanding the many new and intriguing code repositories, clarifying their key underlying patterns. It also provides support for managing personal codebases, enhancing documentation, and guiding refactoring for greater clarity. Beyond these applications, the code-summary outputs could be used as input for other AI-driven tools, for example, in building agentic tool libraries.

Code Charter takes a repository as input, parses and summarises it with an emphasis on business logic, and then outputs a flowchart diagram in mermaid format.

## How It Works

1. Index the codebase using [SCIP](https://github.com/sourcegraph/scip) protocol
    - Currently a manual step although `scip/list_python_packages.sh` can be helpful when using [scip-python](https://github.com/sourcegraph/scip-python)
2. Parse the scip index and detect call graphs, output a JSON file containing the call graphs
    - See `cmd/main.go`
3. Recursively summarise the call graphs using OpenAI's API. The summarisation starts with the leaf nodes and works up the call graph, adding the summarised text to the parent node in order to provide more context and reduce the overlap of summarised detail
    - See `summariser/call_graph_to_summary.py`
4. Generate flowchart diagrams from the call graphs in mermaid format
    - See `summariser/call_graph_to_diagram.py`

## Examples

### [gpt-researcher](https://github.com/assafelovic/gpt-researcher) summarised with GPT-4

```mermaid
graph TB
subgraph backend/server.py ["backend/server.py"]
backend.server.websocket_endpoint["<strong>websocket_endpoint</strong> 
  Manages and maintains websocket connections,
 initiates message sending tasks, executes
 research tasks using a GPTResearcher
 agent, streams generated research reports
 and total runtime via websocket,
 and handles websocket disconnections.
  Additionally, it converts Markdown
 text to a PDF file
 and returns the encoded file
 path, handling any exceptions during
 the conversion process."]
end
subgraph gpt_researcher/utils/websocket_manager.py ["gpt_researcher/utils/websocket_manager.py"]
gpt_researcher.utils.websocket_manager.WebSocketManager#connect["<strong>WebSocketManager#connect</strong> 
  Manages the connection of a
 websocket and the initiation of
 a message sending task for
 it."]
gpt_researcher.utils.websocket_manager.WebSocketManager#start_sender["<strong>WebSocketManager#start_sender</strong> 
  Manages the sending of messages
 from a queue to active
 websocket connections."]
gpt_researcher.utils.websocket_manager.WebSocketManager#start_streaming["<strong>WebSocketManager#start_streaming</strong> 
  Executes a research task using
 a GPTResearcher agent, streaming the
 generated research report and total
 runtime via a websocket."]
gpt_researcher.utils.websocket_manager.run_agent["<strong>run_agent</strong> 
  Executes a research task using
 a GPTResearcher agent, which retrieves
 and formats relevant documents based
 on a given query, and
 generates a research report.
  The total runtime is
 logged and sent via websocket."]
gpt_researcher.utils.websocket_manager.WebSocketManager#disconnect["<strong>WebSocketManager#disconnect</strong> 
  Manages disconnection of a websocket
 from active connections."]
end
subgraph gpt_researcher/master/agent.py ["gpt_researcher/master/agent.py"]
gpt_researcher.master.agent.GPTResearcher#run["<strong>GPTResearcher#run</strong> 
  Conducts research based on a
 given query, either by extracting
 unvisited URLs from a given
 set or by executing search
 queries.
  The relevant documents are
 retrieved and formatted for display.
  A research report is
 then generated based on the
 retrieved context."]
gpt_researcher.master.agent.GPTResearcher#get_context_by_urls["<strong>GPTResearcher#get_context_by_urls</strong> 
  Extracts unvisited URLs from a
 given set and conducts research
 based on these URLs.
  Retrieves and formats relevant
 documents based on a given
 query using stored embeddings and
 a context compressor."]
gpt_researcher.master.agent.GPTResearcher#get_new_urls["<strong>GPTResearcher#get_new_urls</strong> 
  Extracts and returns new URLs
 from a given set that
 have not been visited before."]
gpt_researcher.master.agent.GPTResearcher#get_similar_content_by_query["<strong>GPTResearcher#get_similar_content_by_query</strong> 
  Retrieves and formats relevant documents
 based on a given query,
 using stored embeddings and a
 context compressor."]
gpt_researcher.master.agent.GPTResearcher#get_context_by_search["<strong>GPTResearcher#get_context_by_search</strong> 
  Generates context for a research
 task by executing search queries,
 retrieving and scraping results, and
 formatting relevant documents for display."]
gpt_researcher.master.agent.GPTResearcher#scrape_sites_by_query["<strong>GPTResearcher#scrape_sites_by_query</strong> 
  Executes a search query, retrieves
 a maximum of 7 results,
 and extracts new URLs that
 have not been visited before.
  The results are then
 scraped for relevant information."]
end
subgraph gpt_researcher/memory/embeddings.py ["gpt_researcher/memory/embeddings.py"]
gpt_researcher.memory.embeddings.Memory#get_embeddings["<strong>Memory#get_embeddings</strong> 
  Returns the embeddings stored in
 the object."]
end
subgraph gpt_researcher/context/compression.py ["gpt_researcher/context/compression.py"]
gpt_researcher.context.compression.ContextCompressor#get_context["<strong>ContextCompressor#get_context</strong> 
  Retrieves relevant documents based on
 a query and formats the
 document metadata and content for
 display."]
gpt_researcher.context.compression.ContextCompressor#_get_contextual_retriever["<strong>ContextCompressor#_get_contextual_retriever</strong> 
  Retrieves relevant documents from a
 list of pages based on
 a given query."]
gpt_researcher.context.compression.ContextCompressor#_pretty_print_docs["<strong>ContextCompressor#_pretty_print_docs</strong> 
  Formats and prints document metadata
 and content for a specified
 number of documents."]
end
subgraph gpt_researcher/context/retriever.py ["gpt_researcher/context/retriever.py"]
gpt_researcher.context.retriever.SearchAPIRetriever#["<strong>SearchAPIRetriever#</strong> 
  Retrieves relevant documents from a
 list of pages based on
 a given query."]
end
subgraph gpt_researcher/retrievers/tavily_search/tavily_search.py ["gpt_researcher/retrievers/tavily_search/tavily_search.py"]
gpt_researcher.retrievers.tavily_search.tavily_search.TavilySearch#search["<strong>TavilySearch#search</strong> 
  Executes a search query and
 returns a maximum of 7
 results, with a fallback to
 a different search API in
 case of overload."]
end
subgraph backend/utils.py ["backend/utils.py"]
backend.utils.write_md_to_pdf["<strong>write_md_to_pdf</strong> 
  Converts Markdown text to a
 PDF file and returns the
 encoded file path.
  The function is asynchronous
 and handles any exceptions that
 may occur during the conversion
 process."]
backend.utils.write_to_file["<strong>write_to_file</strong> 
  Writes provided text to a
 specified file asynchronously."]
end
backend.server.websocket_endpoint --1--> gpt_researcher.utils.websocket_manager.WebSocketManager#connect
gpt_researcher.utils.websocket_manager.WebSocketManager#connect --> gpt_researcher.utils.websocket_manager.WebSocketManager#start_sender
backend.server.websocket_endpoint --2--> gpt_researcher.utils.websocket_manager.WebSocketManager#start_streaming
gpt_researcher.utils.websocket_manager.WebSocketManager#start_streaming --> gpt_researcher.utils.websocket_manager.run_agent
gpt_researcher.utils.websocket_manager.run_agent --> gpt_researcher.master.agent.GPTResearcher#run
gpt_researcher.master.agent.GPTResearcher#run --1--> gpt_researcher.master.agent.GPTResearcher#get_context_by_urls
gpt_researcher.master.agent.GPTResearcher#get_context_by_urls --1--> gpt_researcher.master.agent.GPTResearcher#get_new_urls
gpt_researcher.master.agent.GPTResearcher#get_context_by_urls --2--> gpt_researcher.master.agent.GPTResearcher#get_similar_content_by_query
gpt_researcher.master.agent.GPTResearcher#get_similar_content_by_query --1--> gpt_researcher.memory.embeddings.Memory#get_embeddings
gpt_researcher.master.agent.GPTResearcher#get_similar_content_by_query --2--> gpt_researcher.context.compression.ContextCompressor#get_context
gpt_researcher.context.compression.ContextCompressor#get_context --1--> gpt_researcher.context.compression.ContextCompressor#_get_contextual_retriever
gpt_researcher.context.compression.ContextCompressor#_get_contextual_retriever --> gpt_researcher.context.retriever.SearchAPIRetriever#
gpt_researcher.context.compression.ContextCompressor#get_context --2--> gpt_researcher.context.compression.ContextCompressor#_pretty_print_docs
gpt_researcher.master.agent.GPTResearcher#run --2--> gpt_researcher.master.agent.GPTResearcher#get_context_by_search
gpt_researcher.master.agent.GPTResearcher#get_context_by_search --1--> gpt_researcher.master.agent.GPTResearcher#scrape_sites_by_query
gpt_researcher.master.agent.GPTResearcher#scrape_sites_by_query --1--> gpt_researcher.retrievers.tavily_search.tavily_search.TavilySearch#search
gpt_researcher.master.agent.GPTResearcher#scrape_sites_by_query --2--> gpt_researcher.master.agent.GPTResearcher#get_new_urls
gpt_researcher.master.agent.GPTResearcher#get_context_by_search --2--> gpt_researcher.master.agent.GPTResearcher#get_similar_content_by_query
backend.server.websocket_endpoint --3--> backend.utils.write_md_to_pdf
backend.utils.write_md_to_pdf --> backend.utils.write_to_file
backend.server.websocket_endpoint --4--> gpt_researcher.utils.websocket_manager.WebSocketManager#disconnect
```

#### Evaluation

- The summarisation is useful but some function calls are missing
    - Debug call graph detection. Some functions are not being detected by scip-python when they are imported with a wildcard e.g. `from gpt_researcher.utils import *`
- Mermaid layout is not ideal for complex call graphs. Customisable layout would be useful
- It would benefit from displaying control flow - not all functions are called in a linear fashion

## TODO:

### Usability

- [ ] Containerise the steps in the pipeline and orchestrate with e.g. Airflow / Argo / Prefect
- [ ] Create a web interface 
    - [ ] Trigger pipeline 
    - [ ] Trigger summarisation
    - [ ] Display estimated cost of summarisation
    - [ ] Display flow charts in an editable format such as GoJS and enable export
    - [ ] Persist summarisation results and edits

### Functionality

- [ ] Accept a codebase path or URL as input
- [ ] Add a step to the pipeline to detect the language and setup commands for the codebase
- [ ] Add support for more languages (which are supported by SCIP)
- [ ] Summarise with different intents e.g. business logic, implementation details, etc.
    - [ ] Prune the call graph to only include functions that are relevant to the intent / shrink the nodes that are not relevant

### Performance

- Reduce container size for shorter image download times e.g. by using distroless
  - [x] call graph detector
  - [ ] SCIP indexers

## License

Mit License, see `LICENSE` for more information.