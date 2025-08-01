 
  function parseMarkdownTopSection(markdownText: string): string {
    // Regex to match everything from the start of the text to the first occurrence of a line starting with ##
    const regex = /^(.*?)(?=\n##)/s;
  
    // Executing the regex
    const matches = regex.exec(markdownText);
  
    // Return the matched text or an empty string if no match is found
    return matches ? matches[0] : "";
  }

  export { parseMarkdownTopSection };