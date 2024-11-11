# Planning

## Functionality intentions:

- Create diagrams that distill out the fundamental business logic in a codebase. 
  - Describe functionality in the domain language. 
    - This requires discovering the domain language in the codebase and from external sources. Also allowing the user to add / edit this.
  - 

## Ideas

- Try (re)clustering with LLM
  - Size constraints on the graph


## Fixes

- Top-level function names have '()' at the start in the SideBar. Remove these.
- When closing the sidebar, the chart area should expand to fill the space. Currently, the chart area just moves left to fill the space, leaving dead space to the right.

### ChartArea

- [ ] Compound nodes colour only changes to blue when going from zoomed-out to zoomed-in. It should be blue when first added.
- [ ] Selected node's text should contrast more with background.
- [ ] Top-level node is not highlighted
- [ ] Add handler for click on compound node, zooming, centering etc
- [ ] Re-add edge number labels

## Improvements

- Is there some way to make `fcose` layout put the top-level functions at the top of the diagram?
  - This would make it easier to see the overall structure of the codebase.

### Clustering

- Manual intervention
  - Choose between: 
    - Manual labels. Cluster around these.
    - Automatic labels. Cluster around these.
    - No clusters

## Features

- [ ] When detecting processing steps, output the lines that these refer to so that we can link back to the original source.
  - Need to prepend the line numbers to the function code
    - BLOCKER: this is tricky because we can't simply split the function code by newlines, we need to keep track of strings etc that might contain newlines

## Meta

- Add some chat-with-repo feature to:
  - Ask questions about the codebase
  - See if existing issues match a user's query