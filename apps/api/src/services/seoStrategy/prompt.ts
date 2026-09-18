export function buildStrategyPrompt(data: any): { systemPrompt: string, userPrompt: string } {
  const systemPrompt = `You are RankAutonomous, an elite AI SEO strategist.
You are generating an SEO strategy from verified website crawl and audit evidence.
CRITICAL RULES:
1. Never invent metrics, rankings, traffic, search volume, keyword difficulty, backlinks, competitors, or page properties that are not present in the supplied data.
2. If data like volume, difficulty, or competitor intel is missing, DO NOT FABRICATE IT.
3. For backlinks, do NOT generate spam link schemes, automated mass outreach, private blog networks (PBNs), deceptive links, or paid link manipulation. Focus strictly on ethical digital PR, relevant niche directories, partnerships, and high-quality linkable content assets.
4. You MUST return your response as a raw JSON object exactly matching the requested schema. No markdown wrapping.`;

  const userPrompt = `Generate a comprehensive SEO Strategy in JSON format based on the following verified data.

### WEBSITE PROFILE
Name: ${data.website.name}
URL: ${data.website.url}
Description: ${data.website.description || 'N/A'}
Industry: ${data.website.industry || 'N/A'}
Audience: ${data.website.targetAudience || 'N/A'}
Goals: ${data.website.seoGoals?.join(', ') || 'N/A'}
Primary Keywords: ${data.website.primaryKeywords?.join(', ') || 'N/A'}
Target Location: ${data.website.targetCity || data.website.targetRegion || data.website.targetCountry || 'N/A'}

### CRAWLER SNAPSHOT
Total Crawled: ${data.crawl.crawledUrls}
Pages:
${JSON.stringify(data.pages, null, 2)}

### SEO AUDIT ISSUES
Audit Score: ${data.audit.healthScore}
Issues:
${JSON.stringify(data.issues, null, 2)}

### REQUIRED JSON SCHEMA
{
  "executiveSummary": "Concise summary of the current SEO situation based on evidence",
  "priorityActions": [
    {
      "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "category": "String",
      "action": "String",
      "reason": "String",
      "affectedPages": ["URL string array if applicable"]
    }
  ],
  "keywordStrategy": {
    "primaryFocus": "String",
    "themes": [
      {
        "theme": "String",
        "intent": "INFORMATIONAL" | "COMMERCIAL" | "TRANSACTIONAL" | "NAVIGATIONAL",
        "recommendedPages": ["URL string array"]
      }
    ]
  },
  "contentStrategy": [
    {
      "topic": "String",
      "primaryKeyword": "String",
      "intent": "INFORMATIONAL" | "COMMERCIAL" | "TRANSACTIONAL" | "NAVIGATIONAL",
      "contentType": "String",
      "targetAudience": "String",
      "targetUrl": "String or New URL suggestion",
      "rationale": "String"
    }
  ],
  "internalLinkingStrategy": {
    "pagesNeedingLinks": ["URL string array"],
    "opportunities": [
      {
        "sourceUrl": "String",
        "targetUrl": "String",
        "anchorTextTheme": "String"
      }
    ]
  },
  "technicalStrategy": [
    {
      "issue": "String",
      "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "recommendation": "String",
      "affectedPages": ["URL string array"]
    }
  ],
  "backlinkStrategy": {
    "approach": "String (Ethical high-level approach)",
    "tactics": ["Array of tactic strings"]
  }
}
`;

  return { systemPrompt, userPrompt };
}
