'use client';

import { useState } from 'react';
import { ArrowRight, Loader2, Play, CheckCircle2, RotateCcw } from 'lucide-react';
import styles from './app.module.css';

interface AttentionAuditActionProps {
  websiteId: string;
  token: string;
  initialWebsiteStatus: string;
}

export default function AttentionAuditAction({
  websiteId,
  token,
  initialWebsiteStatus,
}: AttentionAuditActionProps) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setFeedback(null);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    try {
      // 1. Check current crawl status
      const crawlRes = await fetch(`${apiUrl}/api/websites/${websiteId}/crawl`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let crawlData: any = null;
      if (crawlRes.ok) {
        crawlData = await crawlRes.json();
      }

      const crawlStatus = crawlData?.status || 'NOT_STARTED';

      // Scroll smoothly down to diagnostics section
      const scrollToDiagnostics = () => {
        const el = document.getElementById('diagnostics-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };

      if (crawlStatus === 'NOT_STARTED' || crawlStatus === 'FAILED' || crawlStatus === 'CANCELLED') {
        // Trigger new crawl
        setFeedback(crawlStatus === 'FAILED' ? 'Retrying website crawl...' : 'Starting new website crawl...');
        const startRes = await fetch(`${apiUrl}/api/websites/${websiteId}/crawl`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (startRes.ok) {
          setFeedback('Crawl started. Tracking progress below...');
          scrollToDiagnostics();
        } else {
          setFeedback('Could not start crawl. Check crawl section below.');
          scrollToDiagnostics();
        }
        return;
      }

      if (crawlStatus === 'CRAWLING' || crawlStatus === 'PENDING') {
        setFeedback('Website is actively crawling. Live progress below.');
        scrollToDiagnostics();
        return;
      }

      if (crawlStatus === 'COMPLETED') {
        // Crawl is completed, now verify / trigger SEO Audit
        const auditRes = await fetch(`${apiUrl}/api/websites/${websiteId}/audit`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        let auditData: any = null;
        if (auditRes.ok) {
          auditData = await auditRes.json();
        }

        if (!auditData || auditData.status === 'FAILED') {
          setFeedback('Starting SEO Health Audit on crawled pages...');
          const startAuditRes = await fetch(`${apiUrl}/api/websites/${websiteId}/audit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });
          if (startAuditRes.ok) {
            setFeedback('SEO Audit analyzing. View results below...');
          }
          scrollToDiagnostics();
          return;
        }

        if (auditData.status === 'PENDING' || auditData.status === 'PROCESSING') {
          setFeedback('SEO Audit currently processing. Scrolling to results...');
          scrollToDiagnostics();
          return;
        }

        if (auditData.status === 'COMPLETED') {
          setFeedback('SEO Audit completed! Viewing comprehensive results...');
          scrollToDiagnostics();
          return;
        }
      }

      // Fallback
      scrollToDiagnostics();
    } catch (err: any) {
      console.error('[AttentionAuditAction Error]:', err);
      setFeedback('Error initiating audit action.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={styles.attentionItem}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      style={{
        cursor: loading ? 'wait' : 'pointer',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
        userSelect: 'none',
      }}
    >
      <div className={styles.attentionNumber}>01</div>
      <div className={styles.attentionContent} style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div className={styles.attentionTitle} style={{ margin: 0 }}>
            Run deep technical audit
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            {loading ? (
              <Loader2 size={14} className="animate-spin" color="#8c423d" />
            ) : (
              <ArrowRight size={14} />
            )}
          </div>
        </div>
        <div className={styles.attentionSub}>
          {feedback ? (
            <span style={{ color: '#8c423d', fontWeight: 600 }}>{feedback}</span>
          ) : (
            'Evaluate site crawling, canonical tags, status codes, and on-page SEO.'
          )}
        </div>
      </div>
    </div>
  );
}
