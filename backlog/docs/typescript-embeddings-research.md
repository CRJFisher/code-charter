# TypeScript Libraries for Local Text Embeddings Research

## Executive Summary

This document evaluates TypeScript/JavaScript libraries for generating text embeddings locally without relying on external APIs like OpenAI. The current implementation uses OpenAI's text-embedding-ada-002 (1536 dimensions), which requires API calls and incurs costs. Local alternatives can provide privacy, reduce costs, and enable offline functionality.

**Key Finding**: For VSCode extensions, model size is critical. The best option appears to be Transformers.js with quantized models like all-MiniLM-L6-v2 (90MB ONNX, 384 dimensions).

## Current Implementation Analysis

### Current Setup
- **API**: OpenAI text-embedding-ada-002
- **Dimensions**: 1536
- **Location**: `/packages/vscode/src/clustering/clustering_service.ts`
- **Dependencies**: openai package
- **Cost**: Per-token API pricing
- **Requires**: Internet connection

### VSCode Extension Size
- **Current compiled size**: 468KB (out/ directory)
- **No embedding libraries currently included**

## Library Comparison

### 1. TensorFlow.js Universal Sentence Encoder

**Overview**: Google's sentence encoder ported to JavaScript

**Models**:
- **Universal Sentence Encoder (USE)**: 
  - Size: ~525MB download
  - Dimensions: 512
  - Architecture: Transformer-based
- **USE QnA variant**:
  - Size: Smaller than full USE
  - Dimensions: 100
  - Optimized for Q&A tasks

**Pros**:
- High-quality embeddings
- Well-documented API
- Good browser support

**Cons**:
- Very large model size (525MB)
- Heavy TensorFlow.js dependency
- Not suitable for VSCode extensions due to size

**Installation**:
```bash
npm install @tensorflow/tfjs @tensorflow-models/universal-sentence-encoder
```

### 2. Transformers.js (Recommended)

**Overview**: Hugging Face transformers running in browser via ONNX

**Best Models for Embeddings**:
- **Xenova/all-MiniLM-L6-v2**:
  - Size: 90.4MB (ONNX format)
  - Dimensions: 384
  - Quality: Good balance of size/performance
  - Max input: 256 tokens

**Other Options**:
- **DistilBERT**: Larger but more accurate
- **Quantized versions**: Can reduce size further

**Pros**:
- Moderate size (90MB)
- Good embedding quality
- Active development
- Supports quantization for smaller models
- WebGPU acceleration available

**Cons**:
- Still adds ~90MB to extension
- ONNX format larger than native weights

**Installation**:
```bash
npm install @xenova/transformers
# or newer versions:
npm install @huggingface/transformers
```

**Usage Example**:
```typescript
import { pipeline } from '@huggingface/transformers';

const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const output = await extractor(sentences, { pooling: 'mean', normalize: true });
// Returns 384-dimensional embeddings
```

### 3. ONNX Runtime Web

**Overview**: Run ONNX models in browser/Node.js

**Constraints**:
- WebAssembly memory limit: 4GB
- Chrome ArrayBuffer limit: ~2GB
- Models > 2GB require external data files

**Pros**:
- Flexible - can run any ONNX model
- Good performance
- Supports model quantization

**Cons**:
- Still need to provide models
- Similar size constraints as Transformers.js

### 4. Lightweight Alternatives

#### Pre-computed Embeddings (GloVe/Word2Vec style)

**Options**:
- **GloVe 50d**: ~70MB for common vocabulary
- **GloVe 100d**: ~140MB
- **Word2Vec**: Similar sizes

**Approach**:
1. Pre-compute embeddings for common vocabulary
2. Store as JSON/binary in extension
3. Average word embeddings for sentences

**Pros**:
- Much smaller than transformer models
- Fast lookup
- No computation needed

**Cons**:
- Lower quality than transformer embeddings
- Requires preprocessing to handle OOV words
- Less semantic understanding

## Size/Quality/Performance Matrix

| Solution | Model Size | Embedding Dims | Quality | Speed | Offline |
|----------|-----------|----------------|---------|--------|---------|
| OpenAI API | 0MB | 1536 | Excellent | Fast* | No |
| TensorFlow USE | 525MB | 512 | Very Good | Slow | Yes |
| Transformers.js MiniLM | 90MB | 384 | Good | Medium | Yes |
| Transformers.js Quantized | ~30MB | 384 | Good | Medium | Yes |
| GloVe 100d | 140MB | 100 | Fair | Very Fast | Yes |
| GloVe 50d | 70MB | 50 | Poor | Very Fast | Yes |

*Fast but depends on network latency

## Recommendations

### For Code Charter VSCode Extension

1. **Primary Recommendation**: Transformers.js with Xenova/all-MiniLM-L6-v2
   - 90MB is large but manageable for a development tool
   - 384 dimensions sufficient for clustering
   - Can be lazy-loaded after activation

2. **Optimization Strategies**:
   - Implement lazy loading - only download model when clustering is first used
   - Offer tiered options:
     - "Fast" mode: Use quantized model (~30MB)
     - "Quality" mode: Use full model (90MB)
   - Cache model locally after first download
   - Consider CDN hosting for model files

3. **Implementation Path**:
   ```typescript
   // In clustering_service.ts
   async getEmbeddings(summaries: string[]): Promise<number[][]> {
     if (this.useLocalEmbeddings) {
       const pipeline = await this.getOrLoadPipeline();
       const output = await pipeline(summaries, { 
         pooling: 'mean', 
         normalize: true 
       });
       return output.tolist();
     } else {
       // Existing OpenAI implementation
     }
   }
   ```

4. **Migration Strategy**:
   - Add configuration option for embedding provider
   - Default to OpenAI for backward compatibility
   - Provide UI to download local model
   - Show progress during model download

### Alternative Approaches

1. **Hybrid Approach**:
   - Use local embeddings for small codebases
   - Fall back to OpenAI for large codebases
   - Let user choose based on privacy/quality needs

2. **Server-Side Option**:
   - Host embedding service separately
   - Useful for teams/enterprise
   - Keeps extension lightweight

3. **Clustering Without Embeddings**:
   - For small codebases (<50 functions)
   - Use only call graph structure
   - Mentioned in Planning.md as future optimization

## Integration Considerations

### Memory Usage
- 384-dimensional embeddings use ~75% less memory than 1536-dimensional
- For 1000 functions: ~1.5MB (384d) vs ~6MB (1536d)

### Performance
- Local inference: ~50-200ms per batch (depends on hardware)
- No network latency
- Can batch process effectively

### Quality Impact
- MiniLM-L6-v2 shown to work well for semantic similarity
- May need to adjust clustering parameters
- Should benchmark against current OpenAI results

## Conclusion

Transformers.js with the all-MiniLM-L6-v2 model provides the best balance of size, quality, and performance for local embeddings in the Code Charter VSCode extension. While 90MB is significant, it can be managed through lazy loading and user choice. This approach eliminates API costs, provides offline functionality, and maintains reasonable clustering quality.