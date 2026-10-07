'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, ArrowRight, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import styles from './FreeAnalysisInput.module.css';

interface AnalysisResult {
  url: string;
  overallScore: number;
  categoryScores: { category: string; score: number }[];
  pagesAnalyzed: number;
  topIssues: { title: string; description: string; priority: string }[];
}

export default function FreeAnalysisInput() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
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
    } catch (err: any) {
      setError(err.message || 'An error occurred during analysis.');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className={styles.resultContainer}>
        <div className={styles.resultHeader}>
          <h3>Limited SEO Analysis: {result.url}</h3>
          <div className={styles.scoreRow}>
            <div className={styles.bigScore}>
              {result.overallScore} <span>/ 100</span>
            </div>
          </div>
        </div>

        <div className={styles.categoryGrid}>
          {result.categoryScores.map((cat, i) => (
            <div key={i} className={styles.categoryItem}>
              <span className={styles.catName}>{cat.category}</span>
              <span className={styles.catScore}>{cat.score >= 0 ? cat.score : 'N/A'}</span>
            </div>
          ))}
        </div>

        {result.topIssues && result.topIssues.length > 0 && (
          <div className={styles.issuesList}>
            <h4>Top Issues Found</h4>
            {result.topIssues.map((issue, i) => (
              <div key={i} className={styles.issueItem}>
                <span className={styles.issuePriority}>{issue.priority}</span>
                <div>
                  <strong>{issue.title}</strong>
                  <p>{issue.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.resultFooter}>
          <button 
            className={styles.primaryCta}
            onClick={() => router.push(`/signup?website=${encodeURIComponent(result.url)}&source=free_analysis`)}
          >
            Unlock Your Full SEO + AI Search Strategy <ArrowRight size={16} style={{ marginLeft: 8 }} />
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
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <span>Get Free Analysis</span>
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
          We'll scan your homepage for critical SEO blockers and AI search readiness.
        </p>
      )}
    </div>
  );
}
