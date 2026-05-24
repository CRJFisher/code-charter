---
id: task-9.1
title: Implement local embeddings with Transformers.js as alternative to OpenAI
status: Done
assignee:
  - '@claude'
created_date: '2025-08-03'
updated_date: '2025-08-03'
labels:
  - embeddings
  - clustering
  - implementation
dependencies: []
parent_task_id: task-9
---

## Description

Add support for local text embeddings using Transformers.js library with the all-MiniLM-L6-v2 model. This will provide an offline alternative to OpenAI embeddings for clustering, reducing costs and enabling privacy-conscious usage.

## Acceptance Criteria

- [x] Transformers.js integrated into clustering service
- [x] Configuration option to choose embedding provider added
- [x] First-run dialog to let users choose embedding provider
- [x] Lazy loading implemented for model download
- [x] Progress indicator shown during model download
- [x] Model cached locally after first download
- [x] Existing OpenAI implementation preserved as default
- [x] Clustering quality tested with local embeddings
- [x] Documentation updated with usage instructions

## Implementation Plan

1. Install @huggingface/transformers dependency
2. Create LocalEmbeddingsProvider class implementing same interface as OpenAI
3. Add embeddingProvider configuration option to package.json
4. Create first-run dialog using VSCode QuickPick API
5. Store user's embedding provider choice in workspace/global settings
6. Implement lazy model loading with progress callback
7. Add model caching to user's global storage
8. Modify clustering_service.ts to support provider switching
9. Create progress notification for model download
10. Test clustering quality with sample codebases
11. Add fallback to OpenAI if local model fails
12. Update README and configuration documentation

## Implementation Notes

Successfully implemented local embeddings as an alternative to OpenAI:

### Files Created
1. **local_embeddings_provider.ts** - Main provider class implementing the EmbeddingProvider interface
   - Uses all-MiniLM-L6-v2 model (90MB ONNX format)
   - Implements model caching in OS-specific cache directories
   - Provides progress callbacks for model download
   - Batches embeddings processing to avoid memory issues

2. **embedding_provider_selector.ts** - Handles user choice of embedding provider
   - Shows QuickPick dialog on first use
   - Validates configuration (API key for OpenAI)
   - Stores user preference in global settings
   - Provides fallback options if configuration is invalid

### Files Modified
1. **clustering_service.ts** - Updated to support both providers
   - Now accepts optional API key (null for local embeddings)
   - Initializes appropriate provider based on user choice
   - Includes provider type in cache hash for separate caching
   - Fixed TypeScript issues with clustering-tfjs API

2. **extension.ts** - Updated clustering service initialization
   - Removed requirement for OpenAI API key
   - Passes extension context for provider initialization

3. **package.json** - Added new configuration
   - Added `embeddingProvider` setting with enum options
   - Updated order numbers for existing settings

4. **README.md** - Comprehensive documentation
   - Explained both embedding providers
   - Added privacy note for local processing
   - Documented cache locations and model size

### Technical Decisions
- Used Transformers.js with all-MiniLM-L6-v2 for good size/quality balance
- Implemented OS-specific cache directories for model storage
- Used VSCode's QuickPick API for first-run dialog
- Preserved backward compatibility with OpenAI as default
- Used TextEncoder instead of Buffer for browser compatibility

### Challenges Resolved
- TypeScript type complexity with pipeline - used `any` type as workaround
- Fixed clustering-tfjs API usage based on actual interface
- Handled CallGraphNode structure differences between packages
- Ensured proper error handling for missing API keys

The implementation provides a seamless experience where users can choose between API-based or local embeddings on first use, with appropriate fallbacks and validation.
