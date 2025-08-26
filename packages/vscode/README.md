# Code Charter VSCode Extension

Code Charter is a powerful tool for visualizing and understanding code structure through interactive diagrams and AI-powered summaries.

## Features

- **Code Visualization**: Generate interactive diagrams showing the call graph and structure of your code
- **AI-Powered Summaries**: Get intelligent summaries of functions and their relationships
- **Code Clustering**: Automatically group related functions together for better organization
- **Multiple AI Providers**: Support for OpenAI and Ollama for code summarization
- **Local Embeddings**: NEW! Use local text embeddings for clustering without API dependencies

## Requirements

- VSCode 1.87.0 or higher
- For AI features: Either Ollama running locally or an OpenAI API key
- For clustering: Either OpenAI API key or local embeddings (90MB model download)

## Extension Settings

This extension contributes the following settings:

* `code-charter-vscode.modelProvider`: Select language model provider (Ollama or OpenAI)
* `code-charter-vscode.APIKey`: API key for language model provider (if required)
* `code-charter-vscode.embeddingProvider`: Choose embedding provider for clustering:
  - `local`: Use local embeddings (90MB model download, no API key required)
  - `openai`: Use OpenAI embeddings (requires API key)
* `code-charter-vscode.devMode`: Enable development mode for UI development

## Embedding Providers

### Local Embeddings (NEW!)
- **Model**: all-MiniLM-L6-v2 (90MB download)
- **Benefits**: No API costs, works offline, privacy-friendly
- **First Use**: The model will be downloaded automatically on first use
- **Cache Location**: Models are cached in your system's cache directory

### OpenAI Embeddings
- **Model**: text-embedding-ada-002
- **Benefits**: High quality embeddings, no local storage needed
- **Requirements**: OpenAI API key and internet connection

On first use of clustering, you'll be prompted to choose your preferred embedding provider.

## Usage

1. Open a code file in your project
2. Run the command: "Code Charter: Summarise Code Trees With A Diagram"
3. Select your entry point function
4. View the generated diagram and summaries
5. Use clustering to group related functions

### Configuring Embeddings

To configure or change your embedding provider:
- Run the command: "Code Charter: Configure Cluster Embeddings"
- Choose to change provider, update API key, or clear model cache

## Known Issues

- Large codebases may take time to process
- Clustering requires either OpenAI API key or local model download

## Release Notes

### 0.0.2

- Added support for local embeddings using Transformers.js
- First-run dialog for choosing embedding provider
- API key input dialog for OpenAI embeddings
- Command to configure cluster embeddings
- Progress notifications during model download
- Improved clustering configuration options
- Lazy loading of embedding models

### 0.0.1

Initial release with core features:
- Code visualization
- AI summaries
- OpenAI-based clustering

---

## Privacy Note

When using local embeddings, all processing happens on your machine. No code or data is sent to external servers for embedding generation.