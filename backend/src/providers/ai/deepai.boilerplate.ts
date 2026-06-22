/**
 * AI provider boilerplate — rename this file to `deepai.ts` to activate it.
 *
 * The real `deepai.ts` is gitignored because it contains a proprietary
 * implementation. This stub exports the exact same interface so the project
 * compiles without it.
 *
 * Replace the function bodies below with calls to any LLM provider you like:
 *   - OpenAI    → https://platform.openai.com/docs
 *   - Anthropic → https://docs.anthropic.com
 *   - Ollama    → https://ollama.com/docs
 *   - Groq      → https://console.groq.com/docs
 *   - or any OpenAI-compatible endpoint
 */

export type MessageRole = "user" | "assistant" | "system";

export interface TextContentBlock {
    type: "text";
    text: string;
}

export interface ImageContentBlock {
    type: "image";
    source: {
        data: string;
        media_type?: string;
    };
}

export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface DeepAIMessage {
    role: MessageRole;
    content: string | ContentBlock[];
}

export interface DeepAICallOptions {
    model: string;
    system?: string;
    messages: DeepAIMessage[];
}

export interface DeepAIStreamOptions extends DeepAICallOptions {
    onChunk?: (chunk: string) => void;
}

export interface DeepAIStreamResult {
    ok: boolean;
    text: string;
}

/**
 * Send a chat completion request and return the full response text.
 * Replace this implementation with your chosen AI provider.
 */
export async function callDeepAI(_options: DeepAICallOptions): Promise<string> {
    throw new Error(
        "callDeepAI is not implemented. " +
        "Rename deepai.boilerplate.ts → deepai.ts and wire up your AI provider.",
    );
}

/**
 * Stream a chat completion, calling `onChunk` for each incremental piece of text.
 * Replace this implementation with your chosen AI provider.
 */
export async function streamDeepAI(options: DeepAIStreamOptions): Promise<DeepAIStreamResult> {
    try {
        const text = await callDeepAI(options);
        if (options.onChunk) {
            options.onChunk(text);
        }
        return { ok: true, text };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, text: `AI provider error: ${message}` };
    }
}
