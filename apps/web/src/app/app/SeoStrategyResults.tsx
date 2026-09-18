'use client';

import { useState, useEffect } from 'react';
import { FileText, Play, AlertCircle, CheckCircle2, Activity, Link as LinkIcon, FileOutput, Sparkles } from 'lucide-react';
import styles from './app.module.css';

interface SeoStrategyResultsProps {
  websiteId: string;
  token: string;
}

export default function SeoStrategyResults({ websiteId, token }: SeoStrategyResultsProps) {
  const [status, setStatus] = useState<string>('Not Generated');
  const [strategyData, setStrategyData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditStatus, setAuditStatus] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchStrategy = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/strategy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.strategy) {
          setStatus(data.strategy.status);
          if (data.strategy.status === 'COMPLETED' && data.strategy.strategyData) {
            setStrategyData(data.strategy.strategyData);
          } else if (data.strategy.status === 'FAILED') {
            setError(data.strategy.error || 'Strategy generation failed.');
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch strategy', err);
    }
  };

  const fetchAuditStatus = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/audit`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.status) {
          setAuditStatus(data.status);
        }
      }
    } catch (err) {
      console.error('Failed to fetch audit status', err);
    }
  };

  useEffect(() => {
    fetchAuditStatus();
    fetchStrategy();
    let interval: any;
    if (status === 'PENDING' || status === 'PROCESSING') {
      interval = setInterval(fetchStrategy, 3000);
    }
    return () => clearInterval(interval);
  }, [websiteId, token, status]);

  const generateStrategy = async () => {
    try {
      setError(null);
      setStatus('PENDING');
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/strategy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to start generation');
      }
    } catch (err: any) {
      setError(err.message);
      setStatus('FAILED');
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return { color: '#b91c1c', background: '#fef2f2', border: '1px solid #f87171' };
      case 'HIGH':
        return { color: '#b45309', background: '#fffbeb', border: '1px solid #fcd34d' };
      case 'MEDIUM':
        return { color: '#3b5998', background: '#f0f4f8', border: '1px solid #d0dbe5' };
      default:
        return { color: 'var(--text-secondary)', background: 'var(--surface-soft)', border: '1px solid var(--border)' };
    }
  };

  return (
    <div style={{ marginTop: '28px', paddingTop: '24px', borderTop: '1px solid var(--border, #ded9d4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text, #111111)', margin: 0, letterSpacing: '-0.01em' }}>
            Autonomous SEO Strategy Plan
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary, #5f5b58)', margin: '2px 0 0 0' }}>
            Synthesizes crawler data, keyword opportunities, and technical audit findings into a sequenced execution roadmap.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary, #5f5b58)', fontWeight: 500 }}>
            Status: <strong>{status}</strong>
          </span>
          <button
            className={styles.secondaryButton}
            onClick={generateStrategy}
            disabled={auditStatus !== 'COMPLETED' || status === 'PENDING' || status === 'PROCESSING'}
            style={{
              fontSize: '13px',
              padding: '8px 16px',
              opacity: (auditStatus !== 'COMPLETED' || status === 'PENDING' || status === 'PROCESSING') ? 0.5 : 1,
              cursor: (auditStatus !== 'COMPLETED' || status === 'PENDING' || status === 'PROCESSING') ? 'not-allowed' : 'pointer'
            }}
          >
            {(status === 'PENDING' || status === 'PROCESSING') ? (
              <>
                <span className={styles.spinner} style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--text)', borderRadius: '50%' }} />
                <span>Strategizing...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Generate Strategy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid var(--error, #c66f6f)', padding: '14px 18px', borderRadius: 'var(--radius-sm, 10px)', color: 'var(--error, #c66f6f)', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
          <AlertCircle size={18} />
          <span style={{ fontSize: '14px' }}>{error}</span>
        </div>
      )}

      {status === 'Not Generated' && !error && (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--surface-soft, #fbf8f5)', borderRadius: 'var(--radius-lg, 24px)', border: '1px solid var(--border, #ded9d4)', color: 'var(--text-secondary, #5f5b58)' }}>
          <FileText size={40} style={{ margin: '0 auto 12px auto', color: 'var(--text-muted)' }} />
          <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: '0 0 6px 0' }}>No SEO Strategy Generated Yet</h4>
          <p style={{ margin: 0, fontSize: '14px' }}>Complete an SEO audit to unlock this autonomous strategic roadmap.</p>
        </div>
      )}

      {(status === 'PENDING' || status === 'PROCESSING') && (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--surface-soft, #fbf8f5)', borderRadius: 'var(--radius-lg, 24px)', border: '1px solid var(--border, #ded9d4)' }}>
          <div className={styles.spinner} style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--text)', borderRadius: '50%', margin: '0 auto 16px auto' }} />
          <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: '0 0 6px 0' }}>AI Strategist Analyzing Audit Data...</h4>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>Identifying priority actions, topic clusters, and backlink targets.</p>
        </div>
      )}

      {status === 'COMPLETED' && strategyData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Executive Summary */}
          <div style={{ background: 'var(--surface-soft, #fbf8f5)', border: '1px solid var(--border, #ded9d4)', borderRadius: 'var(--radius-lg, 24px)', padding: '24px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text, #111111)', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} color="var(--success, #6f9b7c)" />
              Executive Strategy Summary
            </h4>
            <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary, #5f5b58)' }}>
              {strategyData.executiveSummary}
            </div>
          </div>

          {/* Priority Actions */}
          <div>
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text, #111111)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} />
              Priority Actions (Sequenced)
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {strategyData.priorityActions?.map((act: any, i: number) => {
                const pStyle = getPriorityStyle(act.priority);
                return (
                  <div key={i} style={{ background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #ded9d4)', borderRadius: 'var(--radius-md, 16px)', padding: '18px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-pill)', letterSpacing: '0.05em', ...pStyle }}>
                        {act.priority}
                      </span>
                      <span style={{ fontSize: '12px', background: 'var(--surface-soft)', padding: '3px 10px', borderRadius: 'var(--radius-pill)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                        {act.category}
                      </span>
                    </div>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text, #111111)' }}>{act.action}</h5>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #5f5b58)', lineHeight: 1.5 }}>{act.reason}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content Strategy */}
          <div>
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text, #111111)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileOutput size={18} />
              Recommended Content Topics
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {strategyData.contentStrategy?.map((cs: any, i: number) => (
                <div key={i} style={{ background: 'var(--surface-soft, #fbf8f5)', borderRadius: 'var(--radius-md, 16px)', padding: '18px 20px', border: '1px solid var(--border, #ded9d4)' }}>
                  <h5 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text, #111111)' }}>{cs.topic}</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-secondary, #5f5b58)' }}>
                    <div><strong>Keyword:</strong> {cs.primaryKeyword}</div>
                    <div><strong>Intent:</strong> {cs.intent}</div>
                    <div><strong>Format:</strong> {cs.contentType}</div>
                    <div style={{ marginTop: '6px', fontSize: '12px', fontStyle: 'italic', color: 'var(--text-muted)' }}>{cs.rationale}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Backlink & Intelligence */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <div style={{ background: 'var(--surface-soft, #fbf8f5)', padding: '20px', borderRadius: 'var(--radius-md, 16px)', border: '1px solid var(--border, #ded9d4)' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text, #111111)', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LinkIcon size={16} /> Link Building Strategy
              </h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text, #111111)', fontWeight: 600 }}>Ethical Approach:</p>
              <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: 'var(--text-secondary, #5f5b58)', lineHeight: 1.5 }}>{strategyData.backlinkStrategy?.approach}</p>
              <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--text, #111111)', fontWeight: 600 }}>Tactics:</p>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text-secondary, #5f5b58)' }}>
                {strategyData.backlinkStrategy?.tactics?.map((tac: string, i: number) => <li key={i} style={{ marginBottom: '4px' }}>{tac}</li>)}
              </ul>
            </div>

            <div style={{ background: 'var(--surface-soft, #fbf8f5)', padding: '20px', borderRadius: 'var(--radius-md, 16px)', border: '1px solid var(--border, #ded9d4)', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text, #111111)', margin: '0 0 8px 0' }}>
                Competitor Footprints
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--text-muted, #8b8580)', margin: 0, lineHeight: 1.5 }}>
                Competitor intelligence will sync automatically as ranking movement data is cataloged by crawler passes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
