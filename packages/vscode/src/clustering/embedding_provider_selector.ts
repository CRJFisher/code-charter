import * as vscode from 'vscode';

export type EmbeddingProviderType = 'local' | 'openai';

export class EmbeddingProviderSelector {
    private static SETTING_KEY = 'code-charter-vscode.embeddingProvider';
    private static API_KEY_SETTING = 'code-charter-vscode.APIKey';

    /**
     * Get the current embedding provider setting, prompting user if not set
     */
    static async get_embedding_provider(context: vscode.ExtensionContext): Promise<EmbeddingProviderType> {
        const config = vscode.workspace.getConfiguration();
        const saved_provider = config.get<EmbeddingProviderType>(this.SETTING_KEY);
        
        if (saved_provider) {
            return saved_provider;
        }
        
        // First run - prompt user to choose
        return this.prompt_for_provider();
    }

    /**
     * Show dialog for user to choose embedding provider
     */
    static async prompt_for_provider(force_selection: boolean = false): Promise<EmbeddingProviderType> {
        const options: vscode.QuickPickItem[] = [
            {
                label: '$(cloud-download) Local Embeddings',
                description: 'Download 90MB model for offline use',
                detail: 'No API key required. Model will be cached locally for future use. Provides good quality embeddings for clustering.'
            },
            {
                label: '$(globe) OpenAI Embeddings',
                description: 'Use OpenAI API',
                detail: 'Requires OpenAI API key. Higher quality embeddings but incurs API costs. Requires internet connection.'
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            title: 'Choose Embedding Provider for Code Clustering',
            placeHolder: 'Select how to generate text embeddings for clustering',
            ignoreFocusOut: true
        });

        if (!selected) {
            // User cancelled
            if (force_selection) {
                throw new Error('Embedding provider selection cancelled');
            }
            // Default to local for non-forced selection
            return 'local';
        }

        const provider: EmbeddingProviderType = selected.label.includes('Local') ? 'local' : 'openai';
        
        // Handle provider-specific setup
        if (provider === 'openai') {
            // Check if API key exists, if not prompt for it
            const success = await this.ensure_openai_api_key();
            if (!success) {
                // User cancelled API key input or chose local instead
                if (force_selection) {
                    // Re-prompt for provider selection
                    return this.prompt_for_provider(force_selection);
                }
                return 'local';
            }
        } else {
            // Local embeddings - just confirm download
            const download = await vscode.window.showInformationMessage(
                'Local embeddings will download a 90MB model on first use. Continue?',
                'Yes, Continue',
                'Change Selection'
            );
            
            if (download === 'Change Selection') {
                // Re-prompt
                return this.prompt_for_provider(force_selection);
            } else if (!download) {
                // User cancelled
                if (force_selection) {
                    throw new Error('Embedding provider selection cancelled');
                }
                return 'local';
            }
        }
        
        // Save the choice
        const config = vscode.workspace.getConfiguration();
        await config.update(this.SETTING_KEY, provider, vscode.ConfigurationTarget.Global);
        
        return provider;
    }

    /**
     * Ensure OpenAI API key is set, prompting if necessary
     */
    private static async ensure_openai_api_key(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration();
        const existing_key = config.get<string>(this.API_KEY_SETTING);
        
        if (existing_key) {
            // API key already set
            return true;
        }
        
        // Prompt for API key
        const api_key = await vscode.window.showInputBox({
            title: 'Enter OpenAI API Key',
            prompt: 'Enter your OpenAI API key for embeddings. You can get one from https://platform.openai.com/api-keys',
            placeHolder: 'sk-...',
            password: true,
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value) {
                    return 'API key is required';
                }
                if (!value.startsWith('sk-')) {
                    return 'OpenAI API keys typically start with "sk-"';
                }
                if (value.length < 20) {
                    return 'API key seems too short';
                }
                return null;
            }
        });
        
        if (!api_key) {
            // User cancelled
            const action = await vscode.window.showWarningMessage(
                'OpenAI embeddings require an API key.',
                'Use Local Embeddings',
                'Cancel'
            );
            
            if (action === 'Use Local Embeddings') {
                await config.update(this.SETTING_KEY, 'local', vscode.ConfigurationTarget.Global);
            }
            
            return false;
        }
        
        // Save the API key
        await config.update(this.API_KEY_SETTING, api_key, vscode.ConfigurationTarget.Global);
        
        vscode.window.showInformationMessage('OpenAI API key saved successfully');
        
        return true;
    }

    /**
     * Check if the current provider requires an API key and if it's set
     */
    static async validate_provider_config(provider: EmbeddingProviderType): Promise<boolean> {
        if (provider === 'openai') {
            const config = vscode.workspace.getConfiguration();
            const api_key = config.get<string>(this.API_KEY_SETTING);
            
            if (!api_key) {
                const success = await this.ensure_openai_api_key();
                if (!success) {
                    // Switch to local if API key not provided
                    await config.update(this.SETTING_KEY, 'local', vscode.ConfigurationTarget.Global);
                    return true; // Will use local now
                }
            }
        }
        
        return true;
    }

    /**
     * Show configuration dialog (for command palette)
     */
    static async configure_embeddings(): Promise<void> {
        const config = vscode.workspace.getConfiguration();
        const current_provider = config.get<EmbeddingProviderType>(this.SETTING_KEY);
        
        const options: vscode.QuickPickItem[] = [
            {
                label: '$(gear) Change Embedding Provider',
                description: current_provider ? `Currently: ${current_provider}` : 'Not configured',
                detail: 'Choose between local embeddings or OpenAI API'
            }
        ];
        
        if (current_provider === 'openai') {
            options.push({
                label: '$(key) Update OpenAI API Key',
                description: 'Change your OpenAI API key',
                detail: 'Update the API key used for OpenAI embeddings'
            });
        }
        
        if (current_provider === 'local') {
            options.push({
                label: '$(trash) Clear Model Cache',
                description: 'Remove downloaded embedding model',
                detail: 'Delete the cached model to force re-download'
            });
        }
        
        const selected = await vscode.window.showQuickPick(options, {
            title: 'Configure Cluster Embeddings',
            placeHolder: 'Choose an action',
            ignoreFocusOut: true
        });
        
        if (!selected) {
            return;
        }
        
        if (selected.label.includes('Change Embedding Provider')) {
            // Clear current provider to force re-selection
            await config.update(this.SETTING_KEY, undefined, vscode.ConfigurationTarget.Global);
            await this.prompt_for_provider(true);
        } else if (selected.label.includes('Update OpenAI API Key')) {
            // Clear current key and re-prompt
            await config.update(this.API_KEY_SETTING, undefined, vscode.ConfigurationTarget.Global);
            await this.ensure_openai_api_key();
        } else if (selected.label.includes('Clear Model Cache')) {
            // This would need to be implemented in local_embeddings_provider.ts
            vscode.window.showInformationMessage('Model cache clearing not yet implemented');
        }
    }
}