import { Runnable } from "@langchain/core/runnables";

enum ModelProvider {
    OpenAI = 'OpenAI',
    Ollama = 'Ollama',
    VSCode = 'VSCode',
}

interface ModelDetails {
    uid: string;
    provider: ModelProvider;
    model: Runnable;
}

export {
    ModelDetails,
    ModelProvider,
};