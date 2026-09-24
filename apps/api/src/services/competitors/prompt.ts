export function buildCompetitorAnalysisPrompt(context: any) {
  return {
    systemPrompt: `You are an expert SEO analyst. Your task is to analyze a competitor website based on the extracted HTML content and compare it to the user's website goals.
Return ONLY a valid JSON object matching this schema:
{
  "positioning": "string (How they position themselves in the market)",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "contentThemes": ["string (Main topics they cover)"],
  "keywordOpportunities": [
    {
      "keyword": "string",
      "intent": "INFORMATIONAL | COMMERCIAL | TRANSACTIONAL | NAVIGATIONAL",
      "reason": "string (Why this is a good opportunity)",
      "relevance": "number (1-10)",
      "opportunityDescription": "string"
    }
  ],
  "contentGaps": [
    {
      "topic": "string",
      "suggestedTitle": "string",
      "reason": "string (Why this gap is valuable to fill)",
      "targetIntent": "INFORMATIONAL | COMMERCIAL | TRANSACTIONAL | NAVIGATIONAL",
      "suggestedOutline": ["string"]
    }
  ]
}

DO NOT FABRICATE metrics like search volume, traffic, rankings, domain authority, or backlinks. Use ONLY the text provided.`,
    userPrompt: `User's Website Data:
${JSON.stringify(context.website, null, 2)}

User's Existing Keywords:
${JSON.stringify(context.keywords, null, 2)}

Competitor Extracted Data:
${JSON.stringify(context.competitorData, null, 2)}

Identify their strategy and where the user can capitalize on opportunities.`
  };
}

export function buildCompetitorSuggestPrompt(context: any) {
  return {
    systemPrompt: `You are an expert SEO strategist. Suggest 3-5 REAL competitor domains based on the user's website information.
Return ONLY a valid JSON object matching this schema:
{
  "suggestions": [
    {
      "domain": "string (e.g. example.com)",
      "url": "string (e.g. https://example.com)",
      "reason": "string (Why they are a competitor)"
    }
  ]
}

CRITICAL RULES:
1. DO NOT invent or hallucinate competitors. Only suggest real, existing companies or websites.
2. DO NOT fabricate metrics.
3. Make sure the domains are accurate.`,
    userPrompt: `Website Data:
${JSON.stringify(context.website, null, 2)}

Suggest 3-5 real competitors for this website.`
  };
}
