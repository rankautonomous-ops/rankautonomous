export interface SeoStrategyOutput {
  executiveSummary: string;
  priorityActions: {
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    category: string;
    action: string;
    reason: string;
    affectedPages?: string[];
  }[];
  keywordStrategy: {
    primaryFocus: string;
    themes: {
      theme: string;
      intent: 'INFORMATIONAL' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'NAVIGATIONAL';
      recommendedPages: string[];
    }[];
  };
  contentStrategy: {
    topic: string;
    primaryKeyword: string;
    intent: 'INFORMATIONAL' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'NAVIGATIONAL';
    contentType: string;
    targetAudience: string;
    targetUrl: string;
    rationale: string;
  }[];
  internalLinkingStrategy: {
    pagesNeedingLinks: string[];
    opportunities: {
      sourceUrl: string;
      targetUrl: string;
      anchorTextTheme: string;
    }[];
  };
  technicalStrategy: {
    issue: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    recommendation: string;
    affectedPages?: string[];
  }[];
  backlinkStrategy: {
    approach: string;
    tactics: string[];
  };
}
