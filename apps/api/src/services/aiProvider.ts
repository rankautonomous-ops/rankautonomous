import { loadEnvironment } from '../lib/env';

export interface AiCompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
}

export interface IAiProvider {
  generateCompletion(options: AiCompletionOptions): Promise<string>;
}

export class AiProviderError extends Error {
  public statusCode: number;
  public code: string;
  public retryable: boolean;

  constructor(message: string, statusCode = 502, code = 'AI_ERROR', retryable = false) {
    super(message);
    this.name = 'AiProviderError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * Production OpenAI-compatible provider.
 * Interacts with OpenAI or any standard OpenAI-compatible API gateway.
 */
export class OpenAiCompatibleProvider implements IAiProvider {
  private getApiKey(): string {
    loadEnvironment();
    return (process.env.AI_PROVIDER_API_KEY || '').trim();
  }

  private getModel(): string {
    loadEnvironment();
    return (process.env.AI_MODEL_PREFERENCE || 'gpt-4o').trim();
  }

  private getBaseUrl(): string {
    loadEnvironment();
    const raw = (process.env.AI_PROVIDER_BASE_URL || 'https://api.openai.com/v1').trim();
    return raw.replace(/\/+$/, '');
  }

  async generateCompletion(options: AiCompletionOptions): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AiProviderError('AI provider is not configured. Missing AI_PROVIDER_API_KEY.', 503);
    }

    const model = this.getModel();
    const baseUrl = this.getBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000); // 35-second safeguard timeout

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt },
          ],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2500,
          response_format:
            options.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errMessage = `AI provider responded with status ${response.status}`;
        try {
          const errData: any = await response.json();
          if (errData?.error?.message) {
            errMessage = `AI provider error: ${errData.error.message}`;
          }
        } catch {
          // Response body was not JSON
        }

        let statusCode = response.status >= 500 ? 502 : 500;
        let code = 'AI_ERROR';
        let retryable = false;

        if (response.status === 429) {
          code = 'AI_RATE_LIMITED';
          retryable = true;
          errMessage = `The AI service is currently experiencing high demand or rate limits. Please try again later.`;
        } else if (response.status >= 500) {
          code = 'AI_TEMPORARILY_UNAVAILABLE';
          retryable = true;
          errMessage = `The AI service is temporarily unavailable. Please try again later.`;
        }

        throw new AiProviderError(errMessage, statusCode, code, retryable);
      }

      const data: any = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (typeof content !== 'string' || !content.trim()) {
        throw new AiProviderError('AI provider returned empty response content.', 502);
      }

      return content;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new AiProviderError('AI provider request timed out.', 504);
      }
      if (err instanceof AiProviderError) {
        throw err;
      }
      throw new AiProviderError(`Failed to communicate with AI provider: ${err.message || 'Unknown network error'}`, 502);
    }
  }
}

/**
 * Native Google Gemini Provider.
 * Connects directly to Google Generative Language API (e.g., gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro).
 */
export class GeminiProvider implements IAiProvider {
  private getApiKey(): string {
    loadEnvironment(true);
    return (
      process.env.GEMINI_API_KEY ||
      process.env.AI_PROVIDER_API_KEY ||
      ''
    ).trim();
  }

  private getModel(): string {
    loadEnvironment(true);
    let model = (process.env.AI_MODEL_PREFERENCE || 'gemini-3.6-flash').trim();
    // Map deprecated or legacy model names to active Gemini 3.6 Flash
    if (
      !model ||
      model.startsWith('gpt-') ||
      model === 'gemini-2.0-flash' ||
      model === 'gemini-1.5-flash' ||
      model === 'gemini-1.5-pro' ||
      model === 'gemini-pro' ||
      model === 'gemini-flash'
    ) {
      model = 'gemini-3.6-flash';
    }
    return model;
  }

  async generateCompletion(options: AiCompletionOptions): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AiProviderError('Gemini API key is not configured. Missing AI_PROVIDER_API_KEY or GEMINI_API_KEY.', 503);
    }

    const model = this.getModel();

    const executeCall = async (targetModel: string) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: options.systemPrompt }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: options.userPrompt }],
              },
            ],
            generationConfig: {
              temperature: options.temperature ?? 0.7,
              maxOutputTokens: options.maxTokens ?? 2500,
              responseMimeType: options.responseFormat === 'json_object' ? 'application/json' : 'text/plain',
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new AiProviderError('Gemini API request timed out.', 504);
        }
        throw err;
      }
    };

    try {
      let response = await executeCall(model);

      // Auto-fallback: If Google returns 404 for a model, fallback to gemini-3.6-flash or gemini-3.5-flash
      if (response.status === 404 && model !== 'gemini-3.6-flash') {
        console.warn(`[Gemini Provider] Model ${model} returned 404. Automatically retrying with gemini-3.6-flash.`);
        response = await executeCall('gemini-3.6-flash');
      }

      if (!response.ok) {
        let errMessage = `Gemini API responded with status ${response.status}`;
        try {
          const errData: any = await response.json();
          if (errData?.error?.message) {
            errMessage = `Gemini API error: ${errData.error.message}`;
          }
        } catch {
          // Response body was not JSON
        }
        
        let statusCode = response.status >= 500 ? 502 : 500;
        let code = 'AI_ERROR';
        let retryable = false;

        if (response.status === 429) {
          code = 'AI_RATE_LIMITED';
          retryable = true;
          errMessage = `The AI service is currently experiencing high demand or rate limits. Please try again later.`;
        } else if (response.status >= 500) {
          code = 'AI_TEMPORARILY_UNAVAILABLE';
          retryable = true;
          errMessage = `The AI service is temporarily unavailable. Please try again later.`;
        }

        throw new AiProviderError(errMessage, statusCode, code, retryable);
      }

      const data: any = await response.json();
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof content !== 'string' || !content.trim()) {
        throw new AiProviderError('Gemini API returned empty response content.', 502);
      }

      return content;
    } catch (err: any) {
      if (err instanceof AiProviderError) {
        throw err;
      }
      throw new AiProviderError(`Failed to communicate with Gemini API: ${err.message || 'Unknown network error'}`, 502);
    }
  }
}

let activeProvider: IAiProvider | null = null;

/**
 * Determines whether the environment is configured to use Google Gemini.
 * Checks for:
 * 1. AI_PROVIDER=gemini or AI_PROVIDER_TYPE=gemini
 * 2. GEMINI_API_KEY environment variable
 * 3. AI_MODEL_PREFERENCE containing "gemini"
 * 4. Google standard API key prefix (AIzaSy...)
 */
export function isGeminiConfigured(): boolean {
  loadEnvironment();
  const provider = (process.env.AI_PROVIDER || process.env.AI_PROVIDER_TYPE || '').toLowerCase().trim();
  if (provider === 'gemini' || provider === 'google') {
    return true;
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '') {
    return true;
  }
  const model = (process.env.AI_MODEL_PREFERENCE || '').toLowerCase().trim();
  if (model.includes('gemini')) {
    return true;
  }
  const apiKey = (process.env.AI_PROVIDER_API_KEY || '').trim();
  if (apiKey.startsWith('AIzaSy')) {
    return true;
  }
  return false;
}

/**
 * Retrieves the currently active AI provider based on environment configuration.
 */
export function getAiProvider(): IAiProvider {
  if (activeProvider) {
    return activeProvider;
  }

  if (isGeminiConfigured()) {
    return new GeminiProvider();
  }

  return new OpenAiCompatibleProvider();
}

/**
 * Overrides the active AI provider (useful for testing or switching vendors).
 */
export function setAiProvider(provider: IAiProvider | null): void {
  activeProvider = provider;
}
