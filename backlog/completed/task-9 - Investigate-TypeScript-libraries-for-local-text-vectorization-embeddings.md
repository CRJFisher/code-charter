---
id: task-9
title: Investigate TypeScript libraries for local text vectorization/embeddings
status: Done
assignee:
  - '@claude'
created_date: '2025-08-03'
updated_date: '2025-08-03'
labels:
  - embeddings
  - clustering
  - research
dependencies: []
---

## Description

Research and evaluate TypeScript libraries that can generate text embeddings locally without relying on external APIs like OpenAI. This will provide alternatives for users who want to use clustering without API dependencies and reduce costs.

## Acceptance Criteria

- [x] Comprehensive list of TypeScript embedding libraries documented
- [x] TensorFlow.js embedding capabilities evaluated
- [x] Download size for each model and library documented
- [x] Comparison of embedding quality vs OpenAI
- [x] Performance benchmarks for local vs API embeddings
- [x] Memory requirements for each approach documented
- [x] Bundle size impact on VSCode extension analyzed
- [x] Recommendation for best local embedding solution considering size constraints

## Implementation Plan

1. Research TensorFlow.js pre-trained embedding models (Universal Sentence Encoder, etc.)
   - Document model download sizes (USE-lite vs full USE)
   - Measure TensorFlow.js library bundle size
2. Investigate Transformers.js library for BERT/other transformer embeddings
   - Check model sizes (DistilBERT, MiniLM, etc.)
   - Analyze library overhead
3. Explore ONNX Runtime Web for running embedding models
   - Evaluate runtime size vs TensorFlow.js
   - Check available pre-trained model sizes
4. Evaluate lighter-weight options
   - Word2Vec.js implementations and model sizes
   - GloVe embeddings (50d, 100d, 200d variants)
   - FastText models
5. Test WebAssembly-based solutions
   - Measure WASM bundle sizes
   - Performance vs size tradeoffs
6. Analyze VSCode extension constraints
   - Current extension size
   - Acceptable size increase for local embeddings
   - Lazy loading possibilities
7. Compare embedding quality using clustering benchmarks
8. Create size/quality/performance comparison matrix
9. Document integration path with existing clustering_service.ts
10. Recommend tiered approach (small/medium/large models)

## Implementation Notes

Conducted comprehensive research on TypeScript libraries for local text embeddings:

### Key Findings

#### Current Implementation

- Uses OpenAI text-embedding-ada-002 (1536 dimensions)
- Current VSCode extension size: 468KB compiled
- No embedding libraries currently included

#### Libraries Evaluated

1. **TensorFlow.js Universal Sentence Encoder**
   - Model size: ~525MB
   - Dimensions: 512
   - Too large for VSCode extension

2. **Transformers.js (RECOMMENDED)**
   - Xenova/all-MiniLM-L6-v2: 90MB ONNX model
   - Dimensions: 384
   - Good quality/size balance
   - Supports quantization for smaller models (~30MB)

3. **ONNX Runtime Web**
   - WebAssembly limit: 4GB
   - Chrome limit: ~2GB
   - Flexible but requires separate models

4. **Lightweight Options (GloVe/Word2Vec)**
   - GloVe 50d: ~70MB
   - GloVe 100d: ~140MB
   - Lower quality but very fast

### Recommendation

Implement Transformers.js with all-MiniLM-L6-v2 model:

- 90MB is manageable with lazy loading
- 384 dimensions sufficient for clustering
- Eliminates API costs and enables offline use
- Can offer quantized version for smaller size

### Implementation Strategy

- Add configuration option for embedding provider
- Implement lazy loading for model download
- Show progress during download
- Cache model locally
- Default to OpenAI for backward compatibility

Created comprehensive documentation in backlog/docs/typescript-embeddings-research.md with detailed comparison matrix and implementation examples.
