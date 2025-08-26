import { pipeline } from '@huggingface/transformers';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface EmbeddingProvider {
    getEmbeddings(texts: string[]): Promise<number[][]>;
}

export class LocalEmbeddingsProvider implements EmbeddingProvider {
    private static MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
    private static CACHE_DIR_NAME = 'code-charter-models';
    private pipeline: any = null; // Type is complex, using any for now
    private initializationPromise: Promise<void> | null = null;
    
    constructor(
        private context: vscode.ExtensionContext,
        private progressCallback?: (message: string, increment?: number) => void
    ) {}

    private get_cache_dir(): string {
        // Use OS-specific cache directory
        const home_dir = os.homedir();
        let cache_base: string;
        
        if (process.platform === 'win32') {
            cache_base = process.env.LOCALAPPDATA || path.join(home_dir, 'AppData', 'Local');
        } else if (process.platform === 'darwin') {
            cache_base = path.join(home_dir, 'Library', 'Caches');
        } else {
            cache_base = process.env.XDG_CACHE_HOME || path.join(home_dir, '.cache');
        }
        
        const cache_dir = path.join(cache_base, LocalEmbeddingsProvider.CACHE_DIR_NAME);
        
        // Ensure directory exists
        if (!fs.existsSync(cache_dir)) {
            fs.mkdirSync(cache_dir, { recursive: true });
        }
        
        return cache_dir;
    }

    private async initialize_pipeline(): Promise<void> {
        if (this.pipeline) {
            return;
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this._do_initialize();
        return this.initializationPromise;
    }

    private async _do_initialize(): Promise<void> {
        try {
            this.progressCallback?.('Initializing local embeddings model...', 0);
            
            const cache_dir = this.get_cache_dir();
            
            // Set environment variable for Transformers.js cache
            process.env.TRANSFORMERS_CACHE = cache_dir;
            
            this.progressCallback?.('Loading model (this may take a few minutes on first run)...', 20);
            
            // Create the pipeline
            // Note: progress_callback might not be supported in newer versions
            this.pipeline = await pipeline('feature-extraction', LocalEmbeddingsProvider.MODEL_ID);
            
            this.progressCallback?.('Model loaded successfully!', 100);
        } catch (error) {
            this.progressCallback?.('Failed to load local embeddings model', 100);
            throw new Error(`Failed to initialize local embeddings: ${error}`);
        }
    }

    async getEmbeddings(texts: string[]): Promise<number[][]> {
        await this.initialize_pipeline();
        
        if (!this.pipeline) {
            throw new Error('Pipeline not initialized');
        }

        try {
            // Process texts in batches to avoid memory issues
            const batch_size = 32;
            const all_embeddings: number[][] = [];
            
            for (let i = 0; i < texts.length; i += batch_size) {
                const batch = texts.slice(i, Math.min(i + batch_size, texts.length));
                
                // Generate embeddings with mean pooling and normalization
                const output = await this.pipeline(batch, { 
                    pooling: 'mean', 
                    normalize: true 
                });
                
                // Convert tensor to array
                const embeddings = await output.tolist();
                all_embeddings.push(...embeddings);
                
                // Report progress if processing many texts
                if (texts.length > batch_size && this.progressCallback) {
                    const progress = Math.round((i + batch.length) / texts.length * 100);
                    this.progressCallback(`Processing embeddings: ${progress}%`);
                }
            }
            
            return all_embeddings;
        } catch (error) {
            throw new Error(`Failed to generate embeddings: ${error}`);
        }
    }

    /**
     * Check if the model is already cached locally
     */
    async is_model_cached(): Promise<boolean> {
        const cache_dir = this.get_cache_dir();
        const model_dir = path.join(cache_dir, 'models--Xenova--all-MiniLM-L6-v2');
        
        // Check if model directory exists and has content
        if (fs.existsSync(model_dir)) {
            const files = fs.readdirSync(model_dir);
            return files.length > 0;
        }
        
        return false;
    }

    /**
     * Get estimated model size
     */
    get_model_size(): string {
        return '90MB';
    }
}