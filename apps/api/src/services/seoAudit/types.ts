export type SeoIssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface SeoCheckIssue {
  title: string;
  description: string;
  category: string;
  priority: SeoIssueSeverity;
  affectedUrl: string | null;
  recommendation: string | null;
}

export interface SeoCheckResult {
  category: string;
  score: number; // 0-100, or -1 if NOT_EVALUATED
  issues: SeoCheckIssue[];
}

export interface AuditContext {
  websiteId: string;
  crawlJobId: string;
  pages: any[];
}
