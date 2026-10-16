'use client';

import { useState } from 'react';
import styles from '../app.module.css';
import { 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle, 
  Bot, 
  Sparkles, 
  ExternalLink, 
  ShieldCheck, 
  Layers, 
  Search, 
  Compass, 
  Calendar,
  Check
} from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';

export default function PerformanceClient({ websiteId, initialData, token }: { websiteId: string, initialData: any, token: string }) {
  const [data, setData] = useState(initialData);
  const [days, setDays] = useState<number>(initialData?.timeframeDays || 30);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isChangingRange, setIsChangingRange] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

  const fetchPerformance = async (selectedDays: number) => {
    setIsChangingRange(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const perfRes = await apiFetch(`${apiUrl}/api/websites/${websiteId}/performance?days=${selectedDays}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (perfRes.ok) {
        const perfData = await perfRes.json();
        setData(perfData);
        setDays(selectedDays);
      }
    } catch (e: any) {
      console.error('Failed to change timeframe', e);
    } finally {
      setIsChangingRange(false);
    }
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatus({ type: null, message: '' });

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await apiFetch(`${apiUrl}/api/integrations/google/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ websiteId })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setSyncStatus({ type: 'success', message: 'Sync completed successfully.' });
        // Refresh performance data with current days
        await fetchPerformance(days);
      } else {
        setSyncStatus({ type: 'error', message: result.error || 'Failed to sync Google integrations.' });
      }
    } catch (e: any) {
      setSyncStatus({ type: 'error', message: e.message || 'Network error occurred.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const gsc = data?.searchConsole;
  const ga4 = data?.analytics;
  const aiVisibility = data?.aiSearchVisibility;

  const formatDate = (d: string) => {
    if (!d) return 'Never';
    return new Date(d).toLocaleString();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '60px' }}>
      
      {/* Timeframe & Overview Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <Calendar size={15} style={{ marginLeft: '10px', color: 'var(--text-secondary)' }} />
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => fetchPerformance(d)}
              disabled={isChangingRange}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: days === d ? 'var(--text)' : 'transparent',
                color: days === d ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Last {d} Days
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link 
            href="/app/integrations" 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontSize: '13px', 
              fontWeight: 500, 
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'var(--surface)',
              border: '1px solid var(--border)'
            }}
          >
            <Compass size={14} />
            <span>Manage Google Connections</span>
          </Link>
          <button 
            className={styles.primaryButton} 
            onClick={handleSync} 
            disabled={isSyncing}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '13px' }}
          >
            <RefreshCw size={14} className={isSyncing ? styles.spin : ''} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {syncStatus.message && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: syncStatus.type === 'success' ? '#1c2e22' : '#2e1c1c', color: syncStatus.type === 'success' ? '#a5dfb8' : '#e09898', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {syncStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span style={{ fontSize: '14px' }}>{syncStatus.message}</span>
        </div>
      )}

      {/* Overview Cards */}
      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 className={styles.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Search & Analytics Overview</span>
            </h2>
            <p className={styles.cardDescription}>
              Aggregated across the last {days} days from Google Search Console & GA4.
            </p>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--surface-soft)', padding: '4px 10px', borderRadius: '999px', border: '1px solid var(--border)' }}>
            First-Party Verified
          </span>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Organic Clicks</span>
            {gsc && gsc.clicks > 0 ? (
              <div className={styles.statValue}>{gsc.clicks.toLocaleString()}</div>
            ) : (
              <div className={styles.statUnavailable}>{gsc ? 'Waiting for Google data' : 'Not connected'}</div>
            )}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Search Console</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Search Impressions</span>
            {gsc && gsc.impressions > 0 ? (
              <div className={styles.statValue}>{gsc.impressions.toLocaleString()}</div>
            ) : (
              <div className={styles.statUnavailable}>{gsc ? 'Waiting for Google data' : 'Not connected'}</div>
            )}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Search Console</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Average CTR</span>
            {gsc && gsc.clicks > 0 ? (
              <div className={styles.statValue}>{(gsc.ctr * 100).toFixed(2)}%</div>
            ) : (
              <div className={styles.statUnavailable}>{gsc ? 'Waiting for Google data' : 'Not connected'}</div>
            )}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Search Console</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Average Position</span>
            {gsc && gsc.clicks > 0 ? (
              <div className={styles.statValue}>{gsc.averagePosition.toFixed(1)}</div>
            ) : (
              <div className={styles.statUnavailable}>{gsc ? 'Waiting for Google data' : 'Not connected'}</div>
            )}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Search Console</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Organic Sessions</span>
            {ga4 && ga4.organicSessions > 0 ? (
              <div className={styles.statValue}>{ga4.organicSessions.toLocaleString()}</div>
            ) : (
              <div className={styles.statUnavailable}>{ga4 ? 'Waiting for GA4 data' : 'Not connected'}</div>
            )}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Google Analytics 4</span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Active Users</span>
            {ga4 && ga4.activeUsers > 0 ? (
              <div className={styles.statValue}>{ga4.activeUsers.toLocaleString()}</div>
            ) : (
              <div className={styles.statUnavailable}>{ga4 ? 'Waiting for GA4 data' : 'Not connected'}</div>
            )}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Google Analytics 4</span>
          </div>
        </div>
      </div>

      {/* AI-SEARCH & GEO VISIBILITY AUDIT SUITE */}
      <div className={styles.card} style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Sparkles size={18} color="#8c423d" />
              <h2 className={styles.cardTitle}>AI-Search & Generative Engine Visibility</h2>
            </div>
            <p className={styles.cardDescription}>
              Transparent, first-party visibility tracking across generative answer engines and conversational search.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f5efe8', border: '1px solid #e2d7cc', padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, color: '#684535' }}>
            <ShieldCheck size={14} />
            <span>Zero Synthetic / Fabricated Metrics</span>
          </div>
        </div>

        {/* Informational Policy Box */}
        <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '24px', fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '4px' }}>How AI-Search Attribution Works:</strong>
          Unlike legacy search engines, standalone conversational AI models (such as ChatGPT, Claude, and Perplexity) do not provide public Webmaster APIs for zero-click impressions or synthetic citation rankings. RankAutonomous reports only verifiable data: Google Search Console API feeds for AI Overviews, and first-party referral analytics for conversational bots.
        </div>

        {/* AI Platforms Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          
          {/* Google AI Overviews */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Google AI Overviews</span>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: gsc ? '#e6f4ea' : '#f1f3f4', color: gsc ? '#137333' : '#5f6368' }}>
                  {gsc ? 'Live API (GSC)' : 'Not Connected'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: '1.5' }}>
                Included in Google Search Console Search Analytics dataset under web organic impressions and citations.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Data source: <strong>GSC Search Analytics API</strong> (48h latency)
            </div>
          </div>

          {/* ChatGPT Search */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>ChatGPT Search (OpenAI)</span>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: ga4 ? '#e8f0fe' : '#f1f3f4', color: ga4 ? '#1a73e8' : '#5f6368' }}>
                  {ga4 ? 'Referral Tracking' : 'Not Connected'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: '1.5' }}>
                OpenAI provides no publisher impression API. Inbound clicks are verified via <code style={{ fontSize: '12px' }}>chatgpt.com</code> referrers.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Data source: <strong>GA4 Referral Attribution</strong>
            </div>
          </div>

          {/* Perplexity AI */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Perplexity AI</span>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: ga4 ? '#e8f0fe' : '#f1f3f4', color: ga4 ? '#1a73e8' : '#5f6368' }}>
                  {ga4 ? 'Referral Tracking' : 'Not Connected'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: '1.5' }}>
                Perplexity synthesizes web sources. Traffic is measured when users click citation footnotes linking to your domain.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Data source: <strong>GA4 Referral Attribution</strong>
            </div>
          </div>

          {/* Anthropic Claude */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Anthropic Claude</span>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: ga4 ? '#e8f0fe' : '#f1f3f4', color: ga4 ? '#1a73e8' : '#5f6368' }}>
                  {ga4 ? 'Referral Tracking' : 'Not Connected'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: '1.5' }}>
                No publisher metrics exposed by Anthropic. Referral visits from web citations are tracked through analytics.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Data source: <strong>GA4 Referral Attribution</strong>
            </div>
          </div>

          {/* Microsoft Copilot */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>Microsoft Copilot</span>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: '#fef7e0', color: '#b06000' }}>
                  Bing API Bridge
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: '1.5' }}>
                Copilot indexes and cites pages through Bing. Accessible by linking Bing Webmaster Tools API.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Data source: <strong>Bing Webmaster Tools</strong>
            </div>
          </div>
        </div>

        {/* Detailed AI Visibility Matrix */}
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>
          AI-Search Data Source Specification
        </h3>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--surface-soft)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Platform</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Data Source</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Metric Tracked</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Refresh Cadence</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Coverage & Limitations</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text)' }}>Google AI Overviews</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>Google Search Console API</td>
                <td style={{ padding: '12px', color: 'var(--text)' }}>Impressions, Clicks, CTR, Position</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>Daily (48h-72h latency)</td>
                <td style={{ padding: '12px', color: 'var(--text-muted)' }}>Grouped under Web search; authoritative first-party.</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text)' }}>ChatGPT Search</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>Google Analytics 4 / Referrers</td>
                <td style={{ padding: '12px', color: 'var(--text)' }}>Referral Sessions, Active Users</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>Daily / Hourly</td>
                <td style={{ padding: '12px', color: 'var(--text-muted)' }}>No publisher API exists; zero-click citations untracked.</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text)' }}>Perplexity AI</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>Google Analytics 4 / Referrers</td>
                <td style={{ padding: '12px', color: 'var(--text)' }}>Referral Sessions, Active Users</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>Daily / Hourly</td>
                <td style={{ padding: '12px', color: 'var(--text-muted)' }}>Publisher API unavailable; tracks outbound clicks.</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text)' }}>Anthropic Claude</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>Google Analytics 4 / Referrers</td>
                <td style={{ padding: '12px', color: 'var(--text)' }}>Referral Sessions, Active Users</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>Daily</td>
                <td style={{ padding: '12px', color: 'var(--text-muted)' }}>No webmaster console; measures inbound referral traffic.</td>
              </tr>
              <tr>
                <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text)' }}>Microsoft Copilot</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>Bing Webmaster Tools</td>
                <td style={{ padding: '12px', color: 'var(--text)' }}>Bing Clicks, Impressions</td>
                <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>Daily</td>
                <td style={{ padding: '12px', color: 'var(--text-muted)' }}>Pulls from Bing index; requires Bing Webmaster connection.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* GSC Data Details */}
      {gsc && (
        <div className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className={styles.cardTitle}>Search Console Queries & Landing Pages</h2>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Last sync: {formatDate(gsc.lastSyncAt)}
            </span>
          </div>
          
          {gsc.clicks > 0 || gsc.impressions > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: 'var(--text)' }}>Top Performing Search Queries</h3>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'var(--surface-soft)' }}>
                        <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Query</th>
                        <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Clicks</th>
                        <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Impressions</th>
                        <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>CTR</th>
                        <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Avg Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gsc.topQueries.map((q: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 500 }}>{q.query}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{q.clicks}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{q.impressions.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{(q.ctr * 100).toFixed(2)}%</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{q.position.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: 'var(--text)' }}>Top Ranked Landing Pages</h3>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'var(--surface-soft)' }}>
                        <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Landing Page URL</th>
                        <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Clicks</th>
                        <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Impressions</th>
                        <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>CTR</th>
                        <th style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Avg Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gsc.topPages.map((p: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px', color: 'var(--text)', fontFamily: 'monospace', fontSize: '12px' }}>{p.page}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{p.clicks}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{p.impressions.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{(p.ctr * 100).toFixed(2)}%</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{p.position.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-soft)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={16} />
              <span style={{ fontSize: '14px' }}>Search Console is connected, but Google has not populated data for this {days}-day window yet. Google typically takes 48–72 hours to baseline a newly verified property.</span>
            </div>
          )}
        </div>
      )}

      {/* Sync Status Info */}
      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className={styles.cardTitle}>Google API Synchronization Status</h2>
            <p className={styles.cardDescription} style={{ marginBottom: 0 }}>
              Audit background sync state with Google Search Console & Google Analytics 4.
            </p>
          </div>
        </div>

        <div className={styles.infoGrid} style={{ marginTop: '20px' }}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Search Console Last Sync</span>
            <span className={styles.infoValue}>{gsc ? formatDate(gsc.lastSyncAt) : 'Not configured'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Search Console Status</span>
            <span className={styles.infoValue}>{gsc ? gsc.lastSyncStatus : 'DISCONNECTED'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Analytics Last Sync</span>
            <span className={styles.infoValue}>{ga4 ? formatDate(ga4.lastSyncAt) : 'Not configured'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Analytics Status</span>
            <span className={styles.infoValue}>{ga4 ? ga4.lastSyncStatus : 'DISCONNECTED'}</span>
          </div>
        </div>
      </div>

      {/* Add spin animation to global styles if not present */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .${styles.spin} { animation: spin 1s linear infinite; }
      `}} />
    </div>
  );
}

