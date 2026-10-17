import { loadEnvironment } from '../lib/env';

export type AiTaskType =
  | 'chat'
  | 'keywords'
  | 'seo_analysis'
  | 'article_generation'
  | 'article_review'
  | 'general';

export interface AiCompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
  task?: AiTaskType;
  model?: string;
  fallbackModels?: string[];
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
 * Sanitizes errors to prevent exposing raw API keys or internal tokens in logs or API responses.
 */
export function sanitizeAiErrorMessage(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(/sk-or-v1-[a-zA-Z0-9_\-]+/gi, '[REDACTED_OPENROUTER_KEY]')
    .replace(/sk-[a-zA-Z0-9_\-]{20,}/gi, '[REDACTED_API_KEY]')
    .replace(/AIza[0-9A-Za-z\-_]{30,}/gi, '[REDACTED_API_KEY]')
    .replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=[REDACTED_KEY]')
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]');
}

/**
 * Production OpenRouter provider.
 * Connects directly to https://openrouter.ai/api/v1/chat/completions.
 * Supports task-specific cost-effective model routing and automated fallbacks.
 */
export class OpenRouterProvider implements IAiProvider {
  private getApiKey(): string {
    loadEnvironment();
    return (
      process.env.OPENROUTER_API_KEY ||
      (process.env.AI_PROVIDER === 'openrouter' ? process.env.AI_PROVIDER_API_KEY : '') ||
      ''
    ).trim();
  }

  private getBaseUrl(): string {
    loadEnvironment();
    const raw = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').trim();
    return raw.replace(/\/+$/, '');
  }

  public getModelConfigForTask(
    task?: AiTaskType,
    explicitModel?: string,
    explicitFallbacks?: string[]
  ): { primary: string; fallbacks: string[] } {
    loadEnvironment();
    if (explicitModel && explicitModel.trim()) {
      return {
        primary: explicitModel.trim(),
        fallbacks: explicitFallbacks || [],
      };
    }

    const defaultModel = (
      process.env.OPENROUTER_MODEL_DEFAULT ||
      process.env.AI_MODEL_PREFERENCE ||
      'openrouter/free'
    ).trim();

    switch (task) {
      case 'chat': {
        const primary = (process.env.OPENROUTER_MODEL_CHAT || 'openrouter/free').trim();
        const fallbacks =
          explicitFallbacks ||
          ['openrouter/free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'].filter(
            (m) => m !== primary
          );
        return { primary, fallbacks };
      }
      case 'keywords': {
        const primary = (process.env.OPENROUTER_MODEL_KEYWORDS || 'openrouter/free').trim();
        const fallbacks =
          explicitFallbacks ||
          ['openrouter/free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'].filter(
            (m) => m !== primary
          );
        return { primary, fallbacks };
      }
      case 'seo_analysis': {
        const primary = (process.env.OPENROUTER_MODEL_SEO || 'openrouter/free').trim();
        const fallbacks =
          explicitFallbacks ||
          ['openrouter/free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'].filter(
            (m) => m !== primary
          );
        return { primary, fallbacks };
      }
      case 'article_generation': {
        const primary = (process.env.OPENROUTER_MODEL_ARTICLE || 'openrouter/free').trim();
        const fallbacks =
          explicitFallbacks ||
          ['openrouter/free', 'nvidia/nemotron-3.5-lightning:free'].filter(
            (m) => m !== primary
          );
        return { primary, fallbacks };
      }
      case 'article_review': {
        const primary = (process.env.OPENROUTER_MODEL_REVIEW || 'openrouter/free').trim();
        const fallbacks =
          explicitFallbacks ||
          ['openrouter/free', 'nvidia/nemotron-3.5-lightning:free'].filter(
            (m) => m !== primary
          );
        return { primary, fallbacks };
      }
      default: {
        const primary = defaultModel;
        const fallbacks =
          explicitFallbacks ||
          ['openrouter/free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'].filter(
            (m) => m !== primary
          );
        return { primary, fallbacks };
      }
    }
  }

  async generateCompletion(options: AiCompletionOptions): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AiProviderError(
        'OpenRouter is not configured. Missing OPENROUTER_API_KEY in backend environment.',
        503,
        'AI_CONFIG_ERROR'
      );
    }

    const { primary: primaryModel, fallbacks } = this.getModelConfigForTask(
      options.task,
      options.model,
      options.fallbackModels
    );
    const modelsList = [primaryModel, ...fallbacks.filter((m) => m !== primaryModel)];
    const baseUrl = this.getBaseUrl();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45-second safeguard timeout

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://rankautonomous.com',
          'X-Title': 'RankAutonomous',
        },
        body: JSON.stringify({
          model: primaryModel,
          models: modelsList.length > 1 ? modelsList : undefined,
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
        let errMessage = `OpenRouter responded with status ${response.status}`;
        let errCode = 'AI_ERROR';
        let isRetryable = false;

        try {
          const errData: any = await response.json();
          if (errData?.error?.message) {
            errMessage = errData.error.message;
          }
          if (errData?.error?.code) {
            errCode = String(errData.error.code);
          }
        } catch {
          // Response body was not JSON
        }

        errMessage = sanitizeAiErrorMessage(errMessage);

        // Never silently fall back to paid models
        if (response.status === 402) {
          throw new AiProviderError(
            'Free AI inference quota temporarily exhausted. Please wait a moment and try again.',
            429,
            'AI_FREE_QUOTA_EXHAUSTED',
            true
          );
        }

        if (response.status === 429) {
          throw new AiProviderError(
            'Free AI inference is currently experiencing high demand. Please try again in a moment.',
            429,
            'AI_RATE_LIMITED',
            true
          );
        }

        if (response.status >= 500) {
          throw new AiProviderError(
            'Free AI service is temporarily unavailable. Please try again shortly.',
            502,
            'AI_TEMPORARILY_UNAVAILABLE',
            true
          );
        }

        throw new AiProviderError(
          `OpenRouter error: ${errMessage}`,
          response.status >= 400 && response.status < 500 ? response.status : 502,
          errCode,
          isRetryable
        );
      }

      const data: any = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (typeof content !== 'string' || !content.trim()) {
        throw new AiProviderError('OpenRouter returned empty response content.', 502);
      }

      return content;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new AiProviderError('OpenRouter request timed out after 45 seconds.', 504);
      }
      if (err instanceof AiProviderError) {
        throw err;
      }
      throw new AiProviderError(
        `Failed to communicate with OpenRouter: ${sanitizeAiErrorMessage(err.message || 'Unknown network error')}`,
        502
      );
    }
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

        throw new AiProviderError(sanitizeAiErrorMessage(errMessage), statusCode, code, retryable);
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
      throw new AiProviderError(
        `Failed to communicate with AI provider: ${sanitizeAiErrorMessage(err.message || 'Unknown network error')}`,
        502
      );
    }
  }
}

/**
 * Native Google Gemini Provider.
 * Connects directly to Google Generative Language API (e.g., gemini-3-flash-preview, gemini-2.0-flash, gemini-1.5-flash).
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
    const model = (process.env.AI_MODEL_PREFERENCE || 'gemini-3-flash-preview').trim();
    return model || 'gemini-3-flash-preview';
  }

  async generateCompletion(options: AiCompletionOptions): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AiProviderError(
        'Gemini API key is not configured. Missing AI_PROVIDER_API_KEY or GEMINI_API_KEY.',
        503
      );
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
              responseMimeType:
                options.responseFormat === 'json_object' ? 'application/json' : 'text/plain',
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

      // Auto-fallback: If Google returns 404 or 503 for a model, attempt supported fallbacks
      if (
        (response.status === 404 || response.status === 503) &&
        model !== 'gemini-3-flash-preview'
      ) {
        console.warn(
          `[Gemini Provider] Model ${model} returned ${response.status}. Automatically retrying with gemini-3-flash-preview.`
        );
        response = await executeCall('gemini-3-flash-preview');
      }
      if (
        (response.status === 404 || response.status === 503) &&
        model !== 'gemini-3.1-flash-lite'
      ) {
        console.warn(
          `[Gemini Provider] Model returned ${response.status}. Automatically retrying with gemini-3.1-flash-lite.`
        );
        response = await executeCall('gemini-3.1-flash-lite');
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

        throw new AiProviderError(sanitizeAiErrorMessage(errMessage), statusCode, code, retryable);
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
      throw new AiProviderError(
        `Failed to communicate with Gemini API: ${sanitizeAiErrorMessage(err.message || 'Unknown network error')}`,
        502
      );
    }
  }
}

let activeProvider: IAiProvider | null = null;

/**
 * Determines whether the environment is configured to use OpenRouter.
 * Checks for:
 * 1. AI_PROVIDER=openrouter or AI_PROVIDER_TYPE=openrouter
 * 2. OPENROUTER_API_KEY environment variable (unless explicitly overridden by AI_PROVIDER=gemini)
 */
export function isOpenRouterConfigured(): boolean {
  loadEnvironment();
  const provider = (process.env.AI_PROVIDER || process.env.AI_PROVIDER_TYPE || '')
    .toLowerCase()
    .trim();
  if (provider === 'openrouter') {
    return true;
  }
  if (provider === 'gemini' || provider === 'google') {
    return false;
  }
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim() !== '') {
    return true;
  }
  return false;
}

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
  const provider = (process.env.AI_PROVIDER || process.env.AI_PROVIDER_TYPE || '')
    .toLowerCase()
    .trim();
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
 * Priority:
 * 1. Custom active provider (overridden via setAiProvider)
 * 2. OpenRouter provider (if OPENROUTER_API_KEY or AI_PROVIDER=openrouter)
 * 3. Native Gemini provider (if GEMINI_API_KEY or AI_PROVIDER=gemini)
 * 4. OpenAI-compatible provider (fallback)
 */
export function getAiProvider(): IAiProvider {
  if (activeProvider) {
    return activeProvider;
  }

  if (isOpenRouterConfigured()) {
    return new OpenRouterProvider();
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

/**
 * Safely extracts and parses JSON from AI model responses.
 * Robust against free models that include markdown code fences (```json ... ```) or conversational preambles.
 */
export function extractJsonFromAiResponse(rawContent: string): any {
  if (!rawContent || typeof rawContent !== 'string' || !rawContent.trim()) {
    throw new AiProviderError('AI returned empty response content.', 502, 'EMPTY_AI_RESPONSE');
  }

  let cleaned = rawContent.trim();

  // Strip code blocks if present
  if (cleaned.includes('```')) {
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      cleaned = codeBlockMatch[1].trim();
    } else {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
  }

  // Find outer boundaries if text preambles exist
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');

    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = cleaned.lastIndexOf('}');
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = cleaned.lastIndexOf(']');
    }

    if (startIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, endIdx + 1).trim();
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    throw new AiProviderError(`AI response could not be parsed as JSON: ${err.message}`, 502, 'MALFORMED_AI_JSON');
  }
}
