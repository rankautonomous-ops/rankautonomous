'use client';

import { useEffect, useState } from 'react';
import styles from '../admin.module.css';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../../lib/api';

interface HealthData {
  [key: string]: { status: string; details: string };
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const res = await apiFetch('/api/admin/system-health');
      if (!res.ok) throw new Error(`Failed to load health: ${res.statusText}`);
      
      const json = await res.json();
      setHealth(json.health);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load system health');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS': return <CheckCircle2 size={24} color="#22c55e" />;
      case 'WARNING': return <AlertTriangle size={24} color="#f59e0b" />;
      case 'ERROR': return <XCircle size={24} color="#ef4444" />;
      default: return null;
    }
  };

  const getBadgeClass = (status: string) => {
    if (status === 'PASS') return styles.success;
    if (status === 'WARNING') return styles.warning;
    return styles.error;
  };

  const services = [
    { name: 'API Server', key: 'api' },
    { name: 'Database (Prisma / Postgres)', key: 'database' },
    { name: 'Stripe Billing Integration', key: 'stripe' },
    { name: 'Google OAuth & Search Console', key: 'googleOAuth' },
    { name: 'Trigger.dev Background Workers', key: 'triggerDev' },
  ];

  if (loading) {
    return (
      <div style={{ padding: '32px 0', color: 'var(--text-secondary)' }}>
        Loading system health status...
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>System Health & Infrastructure</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Real-time status of connected backend services, database connections, and third-party APIs.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={styles.actionBtn}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px' }}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Checking...' : 'Refresh Status'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {health ? (
        <div className={styles.grid}>
          {services.map(svc => {
            const status = health[svc.key]?.status || 'ERROR';
            const details = health[svc.key]?.details || 'Unknown status';
            
            return (
              <div key={svc.key} className={styles.card} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ marginTop: '2px' }}>
                  {getStatusIcon(status)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>{svc.name}</h3>
                    <span className={`${styles.badge} ${getBadgeClass(status)}`}>{status}</span>
                  </div>
                  <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {details}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
