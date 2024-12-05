# Planning

## Goals

- Release
  - Supporting text
    - Write blog posts about underlying motivations, principles and direction of the project
    - Improve documentation
      - Shift all planning notes to this file. Mention this in the `Contributing` section.
        - Use Foam?
          - Allow for easy linking between notes.
      - Create diagram to explain repo layout including links to the different parts of the project.
        - This could inform the output formats for the charts. E.g. how much functionality would SVG support?
  - Basic functionality, including "zoom" interface
  - 

## TODO before release:

- Clustering
  - [ ] Containerise the clustering server. Manage lifecyle
  - UX
    - Add caching for clusters and their summaries
    - How to trigger clustering?
      - Do it automatically and give option to remove them (make this configurable)
    - Move status display to the chart area and show a loading wheel in the sidebar
- LLM 
  - UI to configure LLM model and embeddings
  - Support for copilot, ollama, openai and anthropic models
  - Support for ollama and openai embeddings
    - Copilot embeddings aren't yet available: [issue](https://github.com/microsoft/vscode/issues/212083)
- [x] Build the scip-python image using distroless to reduce the image size and minimise the inconvenience of running Docker
  - Reduced size from 561MB to 427MB. `node_modules` is still very large

## TODO next:

- UI
  - [ ] Search bar at the top of the sidebar
  - [ ] Track and restore chart state
    - [ ] Add caching for node locations 

## Fixes

- [x] Top-level function names have '()' at the start in the SideBar. Remove these.
- [x] The order of functions in the sidebar isn't stable
- [x] Remove nodes that were filtered out during summary refinement
  - The nodes should be filtered as "close" to the summary refinement as possible since it should use the `- None` string match which is defined in the prompt.
  - [x] #Refactoring - when filtering out functions in refine summary, we then have to manually remove them every time we traverse the call graph. It would be good to do this once.
  - Currently this is tricky because we are always using the original `CallGraph` with `selectedNode` to derive the nodes. We might need an intermediary model that gets processed.
- When closing the sidebar, the chart area should expand to fill the space. Currently, the chart area just moves left to fill the space, leaving dead space to the right.
- [x] Make `fcose` layout put the top-level functions at the top of the diagram
  - This would make it easier to see the overall structure of the codebase.
- [ ] Integrate the `cluster` button into the workflow seamlessly.
  - [ ] Display the processing status and loading wheel in the chart area instead of the SideBar
- [ ] Make "container" nodes expand to fit their text + padding
  - They are sized based on their contents i.e. where the function nodes are placed
- [ ] Cluster summary descriptions are overlapping. They all use prepend some domain context.
  - They could be compared side-by-side to remove duplication
- [ ] Add the option to show non-business logic nodes in the chart.
  - Or toggle between full descriptions and business logic focussed
- [ ] Rebuild the scip-python image using distroless to reduce the image size
- [ ] In summariseClusters.ts the strategy of using `computeDepthLevels` to determine when to summarise a cluster isn't working. Some parent clusters aren't available as context.
- [ ] Navigate-to-function is failing on some clicks
  - Test this in a release version - could be a dev issue

### ChartArea

- [ ] Compound nodes colour only changes to blue when going from zoomed-out to zoomed-in. It should be blue when first added.
- [ ] Selected node's text should contrast more with background.
- [ ] Top-level node is not highlighted
- [ ] Add handler for click on compound node, zooming, centering etc
- [ ] Re-add edge number labels
- [ ] Add numbers to the cluster edges

## Ideas

- Try (re)clustering with LLM
  - Size constraints on the graph
- Improve the Domain Agent. Search in:
  - Documentation
  - Tests
  - Web

## Things to consider

- When we filter out a node from the chart, if it's not a leaf node, it can mean we lose a branch of the tree. Maybe we should check if its children are also filtered out.

## Improvements

- Improve statefulness
  - "Save" the state of the chart so that it can be reloaded later
- Export the chart in various formats e.g. SVG
- Improve clarity of diagrams
  - Increase the size of nodes with lots of connections
  - Incorporate icons or colour schemes to represent different types of nodes

### Clustering

- Manual intervention
  - Choose between:
    - Manual labels. Optionally cluster around these descriptions
    - Automatic labels. Cluster around these.
    - Existing module labels
    - No clusters
    - "Recluster" button to retry clustering
- [ ] Set a minimum threshold for clustering e.g. 7 nodes
- [ ] Improve prompt
  - Display the dependencies between nodes
  - Create a "memory" summary of the above context (like in MemGPT)

## Features

- [ ] When detecting processing steps, output the lines that these refer to so that we can link back to the original source.
  - Need to prepend the line numbers to the function code
    - BLOCKER: this is tricky because we can't simply split the function code by newlines, we need to keep track of strings etc that might contain newlines

## Meta

- Add some chat-with-repo feature to:
  - Ask questions about the codebase
  - See if existing issues / documentation / specs match a user's query
