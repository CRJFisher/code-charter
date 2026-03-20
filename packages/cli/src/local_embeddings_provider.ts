import { pipeline } from "@huggingface/transformers";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export interface EmbeddingProvider {
  getEmbeddings(texts: string[]): Promise<number[][]>;
}

export class LocalEmbeddingsProvider implements EmbeddingProvider {
  private static MODEL_ID = "Xenova/all-MiniLM-L6-v2";
  private static CACHE_DIR_NAME = "code-charter-models";
  private _pipeline: any = null;
  private initialization_promise: Promise<void> | null = null;

  constructor(
    private progress_callback?: (message: string, increment?: number) => void
  ) {}

  private get_cache_dir(): string {
    const home_dir = os.homedir();
    let cache_base: string;

    if (process.platform === "win32") {
      cache_base =
        process.env.LOCALAPPDATA || path.join(home_dir, "AppData", "Local");
    } else if (process.platform === "darwin") {
      cache_base = path.join(home_dir, "Library", "Caches");
    } else {
      cache_base =
        process.env.XDG_CACHE_HOME || path.join(home_dir, ".cache");
    }

    const cache_dir = path.join(
      cache_base,
      LocalEmbeddingsProvider.CACHE_DIR_NAME
    );

    if (!fs.existsSync(cache_dir)) {
      fs.mkdirSync(cache_dir, { recursive: true });
    }

    return cache_dir;
  }

  private async initialize_pipeline(): Promise<void> {
    if (this._pipeline) {
      return;
    }

    if (this.initialization_promise) {
      return this.initialization_promise;
    }

    this.initialization_promise = this._do_initialize();
    return this.initialization_promise;
  }

  private async _do_initialize(): Promise<void> {
    try {
      this.progress_callback?.("Initializing local embeddings model...", 0);

      const cache_dir = this.get_cache_dir();
      process.env.TRANSFORMERS_CACHE = cache_dir;

      this.progress_callback?.(
        "Loading model (this may take a few minutes on first run)...",
        20
      );

      this._pipeline = await pipeline(
        "feature-extraction",
        LocalEmbeddingsProvider.MODEL_ID
      );

      this.progress_callback?.("Model loaded successfully!", 100);
    } catch (error) {
      this.progress_callback?.("Failed to load local embeddings model", 100);
      throw new Error(`Failed to initialize local embeddings: ${error}`);
    }
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    await this.initialize_pipeline();

    if (!this._pipeline) {
      throw new Error("Pipeline not initialized");
    }

    try {
      const batch_size = 32;
      const all_embeddings: number[][] = [];

      for (let i = 0; i < texts.length; i += batch_size) {
        const batch = texts.slice(i, Math.min(i + batch_size, texts.length));

        const output = await this._pipeline(batch, {
          pooling: "mean",
          normalize: true,
        });

        const embeddings = await output.tolist();
        all_embeddings.push(...embeddings);

        if (texts.length > batch_size && this.progress_callback) {
          const pct = Math.round(((i + batch.length) / texts.length) * 100);
          this.progress_callback(`Processing embeddings: ${pct}%`);
        }
      }

      return all_embeddings;
    } catch (error) {
      throw new Error(`Failed to generate embeddings: ${error}`);
    }
  }
}
