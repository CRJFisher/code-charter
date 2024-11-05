# Planning

## Features

- [ ] When detecting processing steps, output the lines that these refer to so that we can link back to the original source.
  - Need to prepend the line numbers to the function code
    - BLOCKER: this is tricky because we can't simply split the function code by newlines, we need to keep track of strings etc that might contain newlines