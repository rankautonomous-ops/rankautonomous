export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type AnalysisCategory =
  | 'Technical SEO'
  | 'Performance'
  | 'Security & HTTPS'
  | 'Metadata & Content Structure'
  | 'Images & Accessibility'
  | 'Social Sharing'
  | 'Structured Data'
  | 'Indexability & Crawling';

export interface AnalysisFinding {
  id: string;
  category: AnalysisCategory;
  priority: IssueSeverity;
  title: string;
  description: string;
  evidence?: string | null;
  recommendation: string | null;
  affectedUrl?: string | null;
}

export interface AnalysisCheck {
  id: string;
  name: string;
  category: AnalysisCategory;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ADVISORY';
  severity?: IssueSeverity;
  message: string;
  evidence?: string | null;
  recommendation?: string | null;
}

export interface TlsCertificateInfo {
  issuer: string | null;
  subject: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  authorized: boolean;
  authorizationError?: string | null;
  protocol?: string | null;
}

export interface HttpResponseData {
  initialUrl: string;
  finalUrl: string;
  statusCode: number;
  statusText: string;
  redirectCount: number;
  redirectChain: string[];
  contentType: string;
  contentEncoding: string | null;
  headers: Record<string, string>;
  html: string;
  htmlSizeBytes: number;
  timings: {
    ttfbMs: number;
    downloadMs: number;
    totalMs: number;
  };
  tls: TlsCertificateInfo | null;
  isHttps: boolean;
}

export interface CategoryResult {
  category: AnalysisCategory;
  score: number; // 0-100 or -1 if skipped
  checksPerformed: number;
  checksPassed: number;
  checksFailed: number;
  checksSkipped: number;
  findings: AnalysisFinding[];
  checks: AnalysisCheck[];
}

export interface WebsiteAnalysisResult {
  url: string;
  finalUrl: string;
  overallScore: number;
  pagesAnalyzed: number;
  testedAt: string;
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    skippedChecks: number;
  };
  timings: {
    ttfbMs: number;
    downloadMs: number;
    totalDurationMs: number;
    notes: string;
  };
  http: {
    statusCode: number;
    statusMessage: string;
    redirectCount: number;
    redirectChain: string[];
    contentType: string;
    contentEncoding: string | null;
    htmlSizeBytes: number;
  };
  security: {
    isHttps: boolean;
    tlsVersion: string | null;
    certificate: {
      issuer: string | null;
      validFrom: string | null;
      validTo: string | null;
      daysRemaining: number | null;
      isValid: boolean;
      error?: string | null;
    } | null;
    headers: Record<string, string | null>;
  };
  categoryScores: Array<{
    category: AnalysisCategory;
    score: number;
    checksPerformed: number;
    checksPassed: number;
    checksFailed: number;
    checksSkipped: number;
  }>;
  categories: Record<AnalysisCategory, {
    score: number;
    checksPerformed: number;
    checksPassed: number;
    checksFailed: number;
    checks: AnalysisCheck[];
  }>;
  findings: AnalysisFinding[];
  topIssues: AnalysisFinding[];
  metadata: {
    title: string | null;
    description: string | null;
    canonical: string | null;
    language: string | null;
    h1Count: number;
    h1s: string[];
    wordCount: number;
    openGraph: Record<string, string | null>;
    twitterCard: Record<string, string | null>;
    structuredData: {
      types: string[];
      rawCount: number;
      hasMalformedJsonLd: boolean;
      malformedErrors: string[];
    };
    robotsDirectives: {
      metaRobots: string | null;
      xRobotsTag: string | null;
      isNoindex: boolean;
      isNofollow: boolean;
    };
  };
  limitations: string[];
}
