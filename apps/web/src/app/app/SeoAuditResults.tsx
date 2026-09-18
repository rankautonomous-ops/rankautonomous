'use client';

import { useEffect, useState } from 'react';
import { Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import styles from './app.module.css';

interface SeoAuditResultsProps {
  websiteId: string;
  token: string;
  crawlStatus: string;
}

export default function SeoAuditResults({ websiteId, token, crawlStatus }: SeoAuditResultsProps) {
  const [auditData, setAuditData] = useState<any>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const [effectiveCrawlStatus, setEffectiveCrawlStatus] = useState(crawlStatus);

  useEffect(() => {
    setEffectiveCrawlStatus(crawlStatus);
  }, [crawlStatus]);

  // If initial prop is not marked completed or active, verify live crawl status once
  useEffect(() => {
    if (effectiveCrawlStatus !== 'COMPLETED' && effectiveCrawlStatus !== 'ACTIVE') {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      fetch(`${apiUrl}/api/websites/${websiteId}/crawl`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && (data.status === 'COMPLETED' || data.status === 'ACTIVE')) {
            setEffectiveCrawlStatus(data.status);
          }
        })
        .catch(() => {});
    }
  }, [websiteId, token, effectiveCrawlStatus]);

  const fetchAudit = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/audit`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
        if (data && data.status === 'COMPLETED') {
           const issRes = await fetch(`${apiUrl}/api/websites/${websiteId}/audit/issues`, {
             headers: { Authorization: `Bearer ${token}` }
           });
           if (issRes.ok) {
             setIssues(await issRes.json());
           }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isRunning = auditData?.status === 'PENDING' || auditData?.status === 'PROCESSING' || isRequesting;

  useEffect(() => {
    fetchAudit();
    let interval: NodeJS.Timeout | undefined;
    if (isRunning) {
      interval = setInterval(fetchAudit, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [websiteId, token, isRunning]);

  const handleRunAudit = async () => {
    setIsRequesting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      await fetch(`${apiUrl}/api/websites/${websiteId}/audit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchAudit();
    } catch (e) {
      console.error(e);
    }
    setIsRequesting(false);
  };

  if (!auditData && effectiveCrawlStatus !== 'COMPLETED' && effectiveCrawlStatus !== 'ACTIVE') {
    return (
      <div style={{ marginTop: '20px', padding: '16px 20px', background: 'var(--surface-soft, #fbf8f5)', borderRadius: 'var(--radius-md, 16px)', border: '1px solid var(--border, #ded9d4)' }}>
        <p style={{ color: 'var(--text-secondary, #5f5b58)', fontSize: '13px', margin: 0 }}>
          A completed crawl is required before generating a full SEO Health Audit.
        </p>
      </div>
    );
  }

  const canRunAudit = (!auditData || auditData.status === 'FAILED' || auditData.status === 'COMPLETED') && (effectiveCrawlStatus === 'COMPLETED' || effectiveCrawlStatus === 'ACTIVE');

  const getPriorityBadgeStyle = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return { background: '#fef2f2', color: '#b91c1c', border: '1px solid #f87171' };
      case 'HIGH':
        return { background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d' };
      case 'MEDIUM':
        return { background: '#f0f4f8', color: '#3b5998', border: '1px solid #d0dbe5' };
      default:
        return { background: 'var(--surface-soft)', color: 'var(--text-secondary)', border: '1px solid var(--border)' };
    }
  };

  return (
    <div style={{ marginTop: '28px', paddingTop: '24px', borderTop: '1px solid var(--border, #ded9d4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text, #111111)', margin: 0, letterSpacing: '-0.01em' }}>
            SEO Health Audit
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary, #5f5b58)', margin: '2px 0 0 0' }}>
            Automated evaluation of technical architecture, crawlability, on-page headers, and content depth.
          </p>
        </div>

        {canRunAudit && (
          <button 
            onClick={handleRunAudit} 
            disabled={isRequesting}
            className={styles.secondaryButton}
            style={{ fontSize: '13px', padding: '8px 16px' }}
          >
            {isRequesting ? 'Starting Audit...' : 'Run New Audit →'}
          </button>
        )}
      </div>

      {isRunning && (
        <div style={{ padding: '16px 20px', background: 'var(--surface-soft, #fbf8f5)', borderRadius: 'var(--radius-md, 16px)', border: '1px solid var(--border, #ded9d4)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={16} color="#8c423d" className="animate-spin" />
          <span style={{ color: 'var(--text, #111111)', fontSize: '14px', fontWeight: 500 }}>
            Audit is currently {auditData.status.toLowerCase()}...
          </span>
        </div>
      )}

      {auditData?.status === 'FAILED' && (
        <div style={{ padding: '16px 20px', background: '#fef2f2', border: '1px solid var(--error, #c66f6f)', borderRadius: 'var(--radius-md, 16px)' }}>
          <span style={{ color: 'var(--error, #c66f6f)', fontSize: '14px' }}>Audit failed to complete. Please try again.</span>
        </div>
      )}

      {auditData?.status === 'COMPLETED' && (
        <>
          <div style={{ background: 'var(--surface-soft, #fbf8f5)', border: '1px solid var(--border, #ded9d4)', borderRadius: 'var(--radius-lg, 24px)', padding: '28px', display: 'flex', gap: '36px', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 130px', textAlign: 'center' }}>
              <div style={{ fontSize: '52px', fontWeight: 800, color: 'var(--text, #111111)', lineHeight: 1, letterSpacing: '-0.04em' }}>
                {auditData.healthScore}
              </div>
              <div style={{ color: 'var(--text-muted, #8b8580)', fontSize: '12px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em', marginTop: '6px' }}>
                Health Score
              </div>
            </div>
            
            <div style={{ flex: 1, minWidth: '240px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
              {(auditData.summaryData || []).map((cat: any, i: number) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text, #111111)', fontWeight: 600 }}>{cat.category}</span>
                    <span style={{ color: cat.score === -1 ? 'var(--text-muted)' : 'var(--text)', fontWeight: 700 }}>
                      {cat.score === -1 ? 'N/A' : `${cat.score}/100`}
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--border, #ded9d4)', borderRadius: '9999px', overflow: 'hidden' }}>
                    {cat.score !== -1 && (
                      <div style={{ height: '100%', width: `${cat.score}%`, background: cat.score > 80 ? 'var(--success, #6f9b7c)' : cat.score > 50 ? 'var(--warning, #c69752)' : 'var(--error, #c66f6f)' }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {issues.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text, #111111)', marginBottom: '14px' }}>
                Prioritized Findings ({issues.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {issues.map(iss => {
                  const priorityStyle = getPriorityBadgeStyle(iss.priority);
                  return (
                    <div key={iss.id} style={{ background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #ded9d4)', borderRadius: 'var(--radius-md, 16px)', padding: '18px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ color: 'var(--text, #111111)', fontSize: '15px', fontWeight: 700 }}>{iss.title}</strong>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-pill)', letterSpacing: '0.05em', ...priorityStyle }}>
                          {iss.priority}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-secondary, #5f5b58)', fontSize: '14px', margin: '0 0 10px 0', lineHeight: '1.5' }}>
                        {iss.description}
                      </p>
                      {iss.affectedUrl && (
                        <div style={{ fontSize: '13px', color: 'var(--text-muted, #8b8580)', marginBottom: '8px', wordBreak: 'break-all' }}>
                          Affected URL: <code>{iss.affectedUrl}</code>
                        </div>
                      )}
                      {iss.recommendation && (
                        <div style={{ fontSize: '13px', color: 'var(--text, #111111)', display: 'flex', gap: '8px', alignItems: 'flex-start', background: 'var(--surface-soft, #fbf8f5)', padding: '10px 14px', borderRadius: 'var(--radius-sm, 10px)', border: '1px solid var(--border, #ded9d4)' }}>
                          <CheckCircle2 size={16} color="var(--success, #6f9b7c)" style={{ marginTop: '2px', flexShrink: 0 }} />
                          <span><strong>Recommendation:</strong> {iss.recommendation}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
