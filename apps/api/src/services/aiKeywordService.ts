import { getAiProvider, AiProviderError } from './aiProvider';

export type SearchIntentType = 'informational' | 'commercial' | 'transactional' | 'navigational';

export const VALID_SEARCH_INTENTS: readonly SearchIntentType[] = [
  'informational',
  'commercial',
  'transactional',
  'navigational',
] as const;

export interface WebsiteKeywordContext {
  websiteUrl: string;
  businessName: string;
  industry?: string | null;
  country?: string | null;
  targetAudience?: string | null;
  description?: string | null;
  seoGoals?: string[];
  targetLocationType?: string | null;
  targetRegion?: string | null;
  targetCity?: string | null;
  existingKeywords?: string[];
}

export interface KeywordSuggestion {
  keyword: string;
  intent: SearchIntentType;
  rationale: string;
}

export interface KeywordSuggestionsResult {
  suggestions: KeywordSuggestion[];
}

export class AiServiceValidationError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = 'AiServiceValidationError';
    this.statusCode = statusCode;
  }
}

/**
 * Builds the prompt asking the AI model to generate high-relevance SEO keyword suggestions.
 */
function buildSystemPrompt(): string {
  return `You are an elite enterprise SEO strategist and keyword intelligence engine for RankAutonomous.
Your task is to analyze website context and generate high-impact, realistic SEO keyword opportunities.

GUIDELINES:
1. Target 20 to 25 strategic keyword opportunities (minimum 15, maximum 30).
2. Balance search intent across:
   - "informational": Educating searchers, how-to, questions, guides.
   - "commercial": Product/service comparisons, best-of lists, reviews, evaluations.
   - "transactional": High-intent buying terms, pricing, hiring, software trials, purchases.
   - "navigational": Specific branded solutions or specific category destinations.
3. Every suggestion MUST include:
   - "keyword": Clean, natural search phrase (2 to 5 words typically). No punctuation, no quotes, lowercase.
   - "intent": Exactly one of ["informational", "commercial", "transactional", "navigational"].
   - "rationale": 1 concise sentence explaining searcher intent and why this keyword drives business growth.
4. Priorities:
   - Strict relevance to the business and its stated target audience.
   - Realistic ranking opportunities (mix of high-intent core terms and long-tail opportunities).
   - Geographic relevance if a target location is specified.
   - Fresh variations and complementary expansion around existing seed keywords.
5. Absolute rules:
   - DO NOT fabricate fake brand names or impersonate competitors.
   - DO NOT repeat keywords or provide slight plurals/synonyms as separate items.
   - DO NOT include spammy keyword stuffing or nonsensical phrases.
6. FORMAT: Output MUST be a valid JSON object strictly matching this schema:
{
  "suggestions": [
    {
      "keyword": "example seo keyword",
      "intent": "commercial",
      "rationale": "High-intent searchers looking for specialized SEO services."
    }
  ]
}
Do NOT include any markdown code blocks, backticks, or text outside the JSON object.`;
}

function buildUserPrompt(context: WebsiteKeywordContext): string {
  const parts: string[] = [
    `Please generate SEO keyword suggestions for the following website profile:`,
    `- Website URL: ${context.websiteUrl}`,
    `- Business Name: ${context.businessName}`,
  ];

  if (context.industry) parts.push(`- Industry: ${context.industry}`);
  if (context.country) parts.push(`- Target Country: ${context.country}`);
  if (context.targetAudience) parts.push(`- Target Audience: ${context.targetAudience}`);
  if (context.description) parts.push(`- Business Description: ${context.description}`);

  if (context.seoGoals && context.seoGoals.length > 0) {
    parts.push(`- Primary SEO Goals: ${context.seoGoals.join(', ')}`);
  }

  if (context.targetLocationType) {
    let locDesc = context.targetLocationType;
    if (context.targetRegion) locDesc += ` (${context.targetRegion})`;
    if (context.targetCity) locDesc += ` [City: ${context.targetCity}]`;
    parts.push(`- Geographic Scope: ${locDesc}`);
  }

  if (context.existingKeywords && context.existingKeywords.length > 0) {
    parts.push(`- Current Seed Keywords: ${context.existingKeywords.join(', ')}`);
    parts.push(`Note: Do NOT duplicate the existing seed keywords. Build complementary and expansion keywords.`);
  }

  return parts.join('\n');
}

/**
 * Strips HTML tags and unsafe script characters from text.
 */
function sanitizeText(str: string): string {
  return str
    .replace(/<[^>]*>?/gm, '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

/**
 * Validates and normalizes raw AI response string into structured KeywordSuggestionsResult.
 */
export function validateAndParseAiKeywords(
  rawContent: string,
  existingKeywords: string[] = []
): KeywordSuggestionsResult {
  if (!rawContent || !rawContent.trim()) {
    throw new AiServiceValidationError('AI provider returned empty content.', 502);
  }

  let cleaned = rawContent.trim();

  // Strip accidental markdown code blocks if present (```json ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AiServiceValidationError('AI provider returned malformed JSON.', 502);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new AiServiceValidationError('AI output must be a JSON object.', 502);
  }

  const rawList = parsed.suggestions;
  if (!Array.isArray(rawList)) {
    throw new AiServiceValidationError('AI output JSON must contain a "suggestions" array.', 502);
  }

  const existingSet = new Set(existingKeywords.map((k) => k.trim().toLowerCase()));
  const seenInSuggestions = new Set<string>();
  const validatedSuggestions: KeywordSuggestion[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;

    // Validate keyword string
    if (typeof item.keyword !== 'string') continue;
    const cleanKeyword = sanitizeText(item.keyword).toLowerCase();
    if (!cleanKeyword || cleanKeyword.length > 100) continue;

    // Deduplicate against existing keywords & previously seen suggestions
    if (existingSet.has(cleanKeyword) || seenInSuggestions.has(cleanKeyword)) {
      continue;
    }

    // Validate and normalize intent
    if (typeof item.intent !== 'string') continue;
    const normalizedIntent = item.intent.trim().toLowerCase() as SearchIntentType;
    if (!VALID_SEARCH_INTENTS.includes(normalizedIntent)) {
      // Reject item with unsupported intent
      continue;
    }

    // Validate rationale
    if (typeof item.rationale !== 'string') continue;
    const cleanRationale = sanitizeText(item.rationale);
    if (!cleanRationale) continue;

    seenInSuggestions.add(cleanKeyword);
    validatedSuggestions.push({
      keyword: cleanKeyword,
      intent: normalizedIntent,
      rationale: cleanRationale.substring(0, 300),
    });

    // Enforce upper limit of 30 suggestions
    if (validatedSuggestions.length >= 30) {
      break;
    }
  }

  if (validatedSuggestions.length === 0) {
    throw new AiServiceValidationError(
      'AI response did not contain any valid keyword suggestions.',
      502
    );
  }

  return {
    suggestions: validatedSuggestions,
  };
}

/**
 * Main service method: orchestrates prompt generation, AI execution, and validation.
 */
export async function generateKeywordSuggestions(
  context: WebsiteKeywordContext
): Promise<KeywordSuggestionsResult> {
  const provider = getAiProvider();

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(context);

  const rawResponse = await provider.generateCompletion({
    systemPrompt,
    userPrompt,
    temperature: 0.65,
    maxTokens: 2500,
    responseFormat: 'json_object',
  });

  return validateAndParseAiKeywords(rawResponse, context.existingKeywords || []);
}
