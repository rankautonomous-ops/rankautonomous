'use client';

import { useState } from 'react';
import styles from '../app.module.css';
import { RefreshCw, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function PerformanceClient({ websiteId, initialData, token }: { websiteId: string, initialData: any, token: string }) {
  const [data, setData] = useState(initialData);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatus({ type: null, message: '' });

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/integrations/google/sync`, {
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
        // Refresh performance data
        const perfRes = await fetch(`${apiUrl}/api/websites/${websiteId}/performance`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (perfRes.ok) {
          const perfData = await perfRes.json();
          setData(perfData);
        }
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

  const formatDate = (d: string) => {
    if (!d) return 'Never';
    return new Date(d).toLocaleString();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '60px' }}>
      
      {/* Overview Cards */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>SEO Performance Overview</h2>
        <div className={styles.statsGrid} style={{ marginTop: '20px' }}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Organic Clicks</span>
            {gsc && gsc.clicks > 0 ? (
              <div className={styles.statValue}>{gsc.clicks.toLocaleString()}</div>
            ) : (
              <div className={styles.statUnavailable}>{gsc ? 'Waiting for Google data' : 'Not connected'}</div>
            )}
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Impressions</span>
            {gsc && gsc.impressions > 0 ? (
              <div className={styles.statValue}>{gsc.impressions.toLocaleString()}</div>
            ) : (
              <div className={styles.statUnavailable}>{gsc ? 'Waiting for Google data' : 'Not connected'}</div>
            )}
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Avg CTR</span>
            {gsc && gsc.clicks > 0 ? (
              <div className={styles.statValue}>{(gsc.ctr * 100).toFixed(2)}%</div>
            ) : (
              <div className={styles.statUnavailable}>{gsc ? 'Waiting for Google data' : 'Not connected'}</div>
            )}
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Avg Position</span>
            {gsc && gsc.clicks > 0 ? (
              <div className={styles.statValue}>{gsc.averagePosition.toFixed(1)}</div>
            ) : (
              <div className={styles.statUnavailable}>{gsc ? 'Waiting for Google data' : 'Not connected'}</div>
            )}
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Organic Sessions</span>
            {ga4 && ga4.organicSessions > 0 ? (
              <div className={styles.statValue}>{ga4.organicSessions.toLocaleString()}</div>
            ) : (
              <div className={styles.statUnavailable}>{ga4 ? 'Waiting for Google data' : 'Not connected'}</div>
            )}
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Active Users</span>
            {ga4 && ga4.activeUsers > 0 ? (
              <div className={styles.statValue}>{ga4.activeUsers.toLocaleString()}</div>
            ) : (
              <div className={styles.statUnavailable}>{ga4 ? 'Waiting for Google data' : 'Not connected'}</div>
            )}
          </div>
        </div>
      </div>

      {/* Sync Status Card */}
      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className={styles.cardTitle}>Data Synchronization</h2>
            <p className={styles.cardDescription} style={{ marginBottom: 0 }}>
              Manually trigger a sync with Google APIs or view the latest sync status.
            </p>
          </div>
          <button 
            className={styles.primaryButton} 
            onClick={handleSync} 
            disabled={isSyncing}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={16} className={isSyncing ? styles.spin : ''} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        {syncStatus.message && (
          <div style={{ marginTop: '16px', padding: '12px', borderRadius: '6px', backgroundColor: syncStatus.type === 'success' ? '#1c2e22' : '#2e1c1c', color: syncStatus.type === 'success' ? '#a5dfb8' : '#e09898', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {syncStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            <span style={{ fontSize: '14px' }}>{syncStatus.message}</span>
          </div>
        )}

        <div className={styles.infoGrid} style={{ marginTop: '20px' }}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>GSC Last Sync</span>
            <span className={styles.infoValue}>{gsc ? formatDate(gsc.lastSyncAt) : 'Not configured'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>GSC Status</span>
            <span className={styles.infoValue}>{gsc ? gsc.lastSyncStatus : '-'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>GA4 Last Sync</span>
            <span className={styles.infoValue}>{ga4 ? formatDate(ga4.lastSyncAt) : 'Not configured'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>GA4 Status</span>
            <span className={styles.infoValue}>{ga4 ? ga4.lastSyncStatus : '-'}</span>
          </div>
        </div>
      </div>

      {/* Analytics Data Details */}
      {ga4 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Google Analytics 4</h2>
          
          {ga4.organicSessions > 0 ? (
            <div className={styles.infoGrid} style={{ marginTop: '20px' }}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Page Views (Organic)</span>
                <span className={styles.infoValue}>{ga4.screenPageViews.toLocaleString()}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Engagement Rate</span>
                <span className={styles.infoValue}>{(ga4.engagementRate * 100).toFixed(2)}%</span>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '16px', padding: '12px', borderRadius: '6px', backgroundColor: 'var(--surface-soft)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span style={{ fontSize: '14px' }}>If your property has just been created, standard reports may take time to populate. No data available yet.</span>
            </div>
          )}
        </div>
      )}

      {/* GSC Data Details */}
      {gsc && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Search Console Queries & Pages</h2>
          
          {gsc.clicks > 0 ? (
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: 'var(--text)' }}>Top Queries</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Query</th>
                        <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Clicks</th>
                        <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Impressions</th>
                        <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>CTR</th>
                        <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Avg Pos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gsc.topQueries.map((q: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px', color: 'var(--text)' }}>{q.query}</td>
                          <td style={{ padding: '8px', color: 'var(--text)' }}>{q.clicks}</td>
                          <td style={{ padding: '8px', color: 'var(--text)' }}>{q.impressions}</td>
                          <td style={{ padding: '8px', color: 'var(--text)' }}>{(q.ctr * 100).toFixed(2)}%</td>
                          <td style={{ padding: '8px', color: 'var(--text)' }}>{q.position.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: 'var(--text)' }}>Top Pages</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Page</th>
                        <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Clicks</th>
                        <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Impressions</th>
                        <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>CTR</th>
                        <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Avg Pos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gsc.topPages.map((p: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px', color: 'var(--text)' }}>{p.page}</td>
                          <td style={{ padding: '8px', color: 'var(--text)' }}>{p.clicks}</td>
                          <td style={{ padding: '8px', color: 'var(--text)' }}>{p.impressions}</td>
                          <td style={{ padding: '8px', color: 'var(--text)' }}>{(p.ctr * 100).toFixed(2)}%</td>
                          <td style={{ padding: '8px', color: 'var(--text)' }}>{p.position.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '16px', padding: '12px', borderRadius: '6px', backgroundColor: 'var(--surface-soft)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span style={{ fontSize: '14px' }}>No Search Console performance data is available yet. Google may need additional time to process data for this property.</span>
            </div>
          )}
        </div>
      )}

      {/* Add spin animation to global styles if not present */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .${styles.spin} { animation: spin 1s linear infinite; }
      `}} />
    </div>
  );
}
