import type { EmbeddingProvider } from "./local_embeddings_provider";
export type { EmbeddingProvider } from "./local_embeddings_provider";

export interface CacheStorage {
  read_json<T>(sub_path: string): Promise<T | null>;
  write_json(sub_path: string, data: unknown): Promise<void>;
}

export interface ClusteringConfig {
  embedding_provider: EmbeddingProvider;
  cache_storage: CacheStorage;
  progress_reporter?: (message: string) => void;
}
