'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Loader2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Server,
  FileCode2,
  Share2,
  Code2,
  Layers,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { getApiUrl } from '@/lib/api';
import styles from './FreeAnalysisInput.module.css';

interface AnalysisFinding {
  id: string;
  category: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  evidence?: string | null;
  recommendation: string | null;
  affectedUrl?: string | null;
}

interface AnalysisResult {
  url: string;
  finalUrl?: string;
  overallScore: number;
  pagesAnalyzed: number;
  testedAt?: string;
  summary?: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    skippedChecks: number;
  };
  timings?: {
    ttfbMs: number;
    downloadMs: number;
    totalDurationMs: number;
    notes?: string;
  };
  http?: {
    statusCode: number;
    statusMessage: string;
    redirectCount: number;
    redirectChain: string[];
    contentType: string;
    contentEncoding: string | null;
    htmlSizeBytes: number;
  };
  security?: {
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
  categoryScores: {
    category: string;
    score: number;
    checksPerformed?: number;
    checksPassed?: number;
    checksFailed?: number;
    checksSkipped?: number;
  }[];
  findings?: AnalysisFinding[];
  topIssues: AnalysisFinding[];
  metadata?: {
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
  limitations?: string[];
}

export default function FreeAnalysisInput() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const router = useRouter();

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!url) return;

    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    setLoading(true);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/public/free-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to analyze website.');
      }

      setResult(data);
      setSelectedSeverity('ALL');
      setSelectedCategory('ALL');
    } catch (err: any) {
      setError(err.message || 'An error occurred during analysis.');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColorClass = (score: number) => {
    if (score >= 80) return styles.scoreGreen;
    if (score >= 60) return styles.scoreAmber;
    return styles.scoreRed;
  };

  const getScoreVerdict = (score: number) => {
    if (score >= 85) return 'Strong SEO Foundations';
    if (score >= 70) return 'Good — Minor Technical Gaps';
    if (score >= 50) return 'Action Required — SEO Blockers Detected';
    return 'Critical SEO & Performance Issues';
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return styles.priorityCritical;
      case 'HIGH':
        return styles.priorityHigh;
      case 'MEDIUM':
        return styles.priorityMedium;
      case 'LOW':
        return styles.priorityLow;
      default:
        return styles.priorityInfo;
    }
  };

  if (result) {
    const findingsList: AnalysisFinding[] = result.findings || result.topIssues || [];

    const criticalAndHighCount = findingsList.filter(
      f => f.priority === 'CRITICAL' || f.priority === 'HIGH'
    ).length;
    const mediumCount = findingsList.filter(f => f.priority === 'MEDIUM').length;
    const lowCount = findingsList.filter(f => f.priority === 'LOW' || f.priority === 'INFO').length;

    const filteredFindings = findingsList.filter(f => {
      if (selectedSeverity === 'CRITICAL_HIGH') {
        if (f.priority !== 'CRITICAL' && f.priority !== 'HIGH') return false;
      } else if (selectedSeverity === 'MEDIUM') {
        if (f.priority !== 'MEDIUM') return false;
      } else if (selectedSeverity === 'LOW') {
        if (f.priority !== 'LOW' && f.priority !== 'INFO') return false;
      }

      if (selectedCategory !== 'ALL' && f.category !== selectedCategory) {
        return false;
      }

      return true;
    });

    const isRedirected = result.finalUrl && result.finalUrl !== result.url;

    return (
      <div className={styles.resultContainer}>
        {/* Header / Score Hero */}
        <div className={styles.resultHeader}>
          <div className={styles.targetInfo}>
            <span className={styles.badgeLabel}>Website Health Audit</span>
            <h3 className={styles.siteUrl}>{result.url}</h3>
            {isRedirected && (
              <p className={styles.redirectNotice}>
                Redirected to: <span>{result.finalUrl}</span> ({result.http?.redirectCount} hop)
              </p>
            )}
          </div>

          <div className={styles.scoreHero}>
            <div className={`${styles.bigScore} ${getScoreColorClass(result.overallScore)}`}>
              {result.overallScore}
              <span className={styles.scoreMax}>/100</span>
            </div>
            <div className={styles.scoreVerdict}>{getScoreVerdict(result.overallScore)}</div>
          </div>
        </div>

        {/* Real-World HTTP & Performance Metrics Strip */}
        {result.timings && (
          <div className={styles.metricsBar}>
            <div className={styles.metricItem}>
              <div className={styles.metricLabel}>
                <Clock size={13} />
                <span>TTFB Latency</span>
              </div>
              <div className={styles.metricValue}>
                {result.timings.ttfbMs} <span className={styles.metricUnit}>ms</span>
              </div>
              <div className={styles.metricSub}>
                {result.timings.ttfbMs <= 600 ? '✓ Fast' : result.timings.ttfbMs <= 1800 ? '⚠ Moderate' : '✕ Slow'}
              </div>
            </div>

            <div className={styles.metricItem}>
              <div className={styles.metricLabel}>
                <Server size={13} />
                <span>Response Time</span>
              </div>
              <div className={styles.metricValue}>
                {result.timings.totalDurationMs} <span className={styles.metricUnit}>ms</span>
              </div>
              <div className={styles.metricSub}>Download: {result.timings.downloadMs}ms</div>
            </div>

            <div className={styles.metricItem}>
              <div className={styles.metricLabel}>
                <FileCode2 size={13} />
                <span>HTML Size</span>
              </div>
              <div className={styles.metricValue}>
                {result.http?.htmlSizeBytes ? Math.round(result.http.htmlSizeBytes / 1024) : 'N/A'}{' '}
                <span className={styles.metricUnit}>KB</span>
              </div>
              <div className={styles.metricSub}>
                {result.http?.contentEncoding ? `✓ ${result.http.contentEncoding}` : 'Uncompressed'}
              </div>
            </div>

            <div className={styles.metricItem}>
              <div className={styles.metricLabel}>
                {result.security?.isHttps ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                <span>Security</span>
              </div>
              <div className={styles.metricValue}>
                {result.security?.isHttps ? 'HTTPS' : 'HTTP'}
              </div>
              <div className={styles.metricSub}>
                {result.security?.certificate?.daysRemaining !== null && result.security?.certificate?.daysRemaining !== undefined
                  ? `${result.security.certificate.daysRemaining}d cert left`
                  : result.security?.isHttps ? 'SSL active' : '✕ Insecure'}
              </div>
            </div>
          </div>
        )}

        {/* Category Breakdown Grid (8 Categories) */}
        <div className={styles.sectionHeader}>
          <h4>Category Breakdown</h4>
          <span className={styles.checksSummary}>
            {result.summary
              ? `${result.summary.passedChecks} of ${result.summary.totalChecks} checks passed`
              : `${result.categoryScores.length} categories analyzed`}
          </span>
        </div>

        <div className={styles.categoryGrid}>
          {result.categoryScores.map((cat, i) => {
            const isSelected = selectedCategory === cat.category;
            return (
              <button
                key={i}
                type="button"
                className={`${styles.categoryItem} ${isSelected ? styles.categoryItemSelected : ''}`}
                onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.category)}
              >
                <div className={styles.categoryTop}>
                  <span className={styles.catName}>{cat.category}</span>
                  <span className={`${styles.catScore} ${getScoreColorClass(cat.score)}`}>
                    {cat.score >= 0 ? `${cat.score}` : 'N/A'}
                  </span>
                </div>
                <div className={styles.categoryProgress}>
                  <div
                    className={styles.progressBar}
                    style={{
                      width: `${Math.max(0, cat.score)}%`,
                      backgroundColor:
                        cat.score >= 80 ? 'var(--success)' : cat.score >= 60 ? 'var(--warning)' : 'var(--error)'
                    }}
                  />
                </div>
                {cat.checksPerformed !== undefined && (
                  <div className={styles.catChecksCount}>
                    {cat.checksPassed}/{cat.checksPerformed} checks passed
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Interactive Findings Explorer */}
        <div className={styles.findingsSection}>
          <div className={styles.findingsHeader}>
            <h4>Audit Findings & Evidence ({findingsList.length})</h4>

            <div className={styles.filterPills}>
              <button
                type="button"
                className={`${styles.filterPill} ${selectedSeverity === 'ALL' ? styles.filterPillActive : ''}`}
                onClick={() => setSelectedSeverity('ALL')}
              >
                All ({findingsList.length})
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${styles.filterPillRed} ${selectedSeverity === 'CRITICAL_HIGH' ? styles.filterPillActive : ''}`}
                onClick={() => setSelectedSeverity('CRITICAL_HIGH')}
              >
                Critical/High ({criticalAndHighCount})
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${styles.filterPillAmber} ${selectedSeverity === 'MEDIUM' ? styles.filterPillActive : ''}`}
                onClick={() => setSelectedSeverity('MEDIUM')}
              >
                Medium ({mediumCount})
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${selectedSeverity === 'LOW' ? styles.filterPillActive : ''}`}
                onClick={() => setSelectedSeverity('LOW')}
              >
                Advisory ({lowCount})
              </button>
            </div>
          </div>

          {selectedCategory !== 'ALL' && (
            <div className={styles.activeCategoryNotice}>
              Filtering by: <strong>{selectedCategory}</strong>
              <button type="button" onClick={() => setSelectedCategory('ALL')}>
                Reset category filter
              </button>
            </div>
          )}

          {filteredFindings.length === 0 ? (
            <div className={styles.emptyFindings}>
              <CheckCircle2 size={24} color="var(--success)" />
              <p>No issues found for the selected filter criteria.</p>
            </div>
          ) : (
            <div className={styles.issuesList}>
              {filteredFindings.map((issue, i) => (
                <div key={i} className={styles.issueCard}>
                  <div className={styles.issueHeader}>
                    <div className={styles.badgeRow}>
                      <span className={`${styles.issuePriority} ${getPriorityBadgeClass(issue.priority)}`}>
                        {issue.priority}
                      </span>
                      <span className={styles.issueCategory}>{issue.category}</span>
                    </div>
                  </div>

                  <strong className={styles.issueTitle}>{issue.title}</strong>
                  <p className={styles.issueDescription}>{issue.description}</p>

                  {issue.evidence && (
                    <div className={styles.evidenceBox}>
                      <span className={styles.evidenceTag}>Evidence</span>
                      <code>{issue.evidence}</code>
                    </div>
                  )}

                  {issue.recommendation && (
                    <div className={styles.recommendationBox}>
                      <span className={styles.recTag}>How to fix:</span>
                      <span>{issue.recommendation}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Technical Inspection Accordion */}
        <div className={styles.technicalAccordion}>
          <button
            type="button"
            className={styles.accordionToggle}
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          >
            <div className={styles.accordionTitle}>
              <Layers size={16} />
              <span>Technical & Structured Data Inspection</span>
            </div>
            {showTechnicalDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showTechnicalDetails && (
            <div className={styles.accordionBody}>
              <div className={styles.techGrid}>
                <div className={styles.techCol}>
                  <h5>Metadata & Content</h5>
                  <ul>
                    <li>
                      <strong>Title:</strong> {result.metadata?.title || 'None'}
                    </li>
                    <li>
                      <strong>Description:</strong> {result.metadata?.description || 'None'}
                    </li>
                    <li>
                      <strong>Canonical:</strong> {result.metadata?.canonical || 'None'}
                    </li>
                    <li>
                      <strong>Language:</strong> {result.metadata?.language || 'None'}
                    </li>
                    <li>
                      <strong>H1 Headings ({result.metadata?.h1Count || 0}):</strong>{' '}
                      {result.metadata?.h1s?.join(', ') || 'None'}
                    </li>
                    <li>
                      <strong>Body Word Count:</strong> {result.metadata?.wordCount ?? 'N/A'} words
                    </li>
                  </ul>
                </div>

                <div className={styles.techCol}>
                  <h5>Security & Headers</h5>
                  <ul>
                    <li>
                      <strong>HSTS:</strong> {result.security?.headers['strict-transport-security'] ? 'Enabled' : 'Missing'}
                    </li>
                    <li>
                      <strong>X-Content-Type-Options:</strong>{' '}
                      {result.security?.headers['x-content-type-options'] || 'Missing'}
                    </li>
                    <li>
                      <strong>Content-Security-Policy:</strong>{' '}
                      {result.security?.headers['content-security-policy'] ? 'Configured' : 'Missing'}
                    </li>
                    <li>
                      <strong>X-Frame-Options:</strong>{' '}
                      {result.security?.headers['x-frame-options'] || 'Missing'}
                    </li>
                    <li>
                      <strong>TLS Issuer:</strong> {result.security?.certificate?.issuer || 'N/A'}
                    </li>
                  </ul>
                </div>

                <div className={styles.techCol}>
                  <h5>Social & Structured Data</h5>
                  <ul>
                    <li>
                      <strong>OpenGraph:</strong>{' '}
                      {result.metadata?.openGraph?.title ? 'og:title present' : 'Missing og:title'}
                    </li>
                    <li>
                      <strong>Twitter Card:</strong> {result.metadata?.twitterCard?.card || 'Missing'}
                    </li>
                    <li>
                      <strong>Schema Types ({result.metadata?.structuredData?.types?.length || 0}):</strong>{' '}
                      {result.metadata?.structuredData?.types?.join(', ') || 'None detected'}
                    </li>
                    <li>
                      <strong>JSON-LD Syntax:</strong>{' '}
                      {result.metadata?.structuredData?.hasMalformedJsonLd ? '✕ Syntax Errors' : '✓ Valid'}
                    </li>
                    <li>
                      <strong>Robots Directives:</strong>{' '}
                      {result.metadata?.robotsDirectives?.isNoindex ? '✕ noindex active' : '✓ Indexable'}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Limitations Transparency Banner */}
        <div className={styles.limitationsBanner}>
          <div className={styles.limitationHeader}>
            <Info size={14} />
            <span>Audit Scope & Methodology</span>
          </div>
          <p>
            Measurements are performed via server-side HTTP request and static HTML inspection. Core Web Vitals
            (LCP, INP, CLS) and JavaScript-rendered single-page app (SPA) elements require browser execution and
            continuous real-user monitoring.
          </p>
        </div>

        {/* Footer CTAs */}
        <div className={styles.resultFooter}>
          <button
            className={styles.primaryCta}
            onClick={() =>
              router.push(
                `/signup?website=${encodeURIComponent(result.url)}&source=free_analysis`
              )
            }
          >
            Fix All Issues with RankAutonomous Autopilot
            <ArrowRight size={16} style={{ marginLeft: 8 }} />
          </button>
          <button className={styles.textButton} onClick={() => setResult(null)}>
            Analyze another website
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <form onSubmit={handleAnalyze} className={styles.form}>
        <div className={styles.inputWrapper}>
          <div className={styles.iconWrapper}>
            <Search size={20} className={styles.icon} />
          </div>
          <input
            type="text"
            className={styles.input}
            placeholder="Enter your website URL (e.g., example.com)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            required
          />
        </div>
        <button type="submit" className={styles.button} disabled={loading || !url.trim()}>
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Analyzing Website...</span>
            </>
          ) : (
            <>
              <span>Get Detailed Analysis</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>

      {error && (
        <div className={styles.errorMessage}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {!error && (
        <p className={styles.helper}>
          Full technical SEO, server TTFB, SSL validation, security headers, schema & social metadata audit.
        </p>
      )}
    </div>
  );
}
