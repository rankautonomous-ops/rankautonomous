'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './admin.module.css';
import { apiFetch } from '../../lib/api';
import { 
  Users, Globe, CreditCard, ListOrdered, ShieldAlert, 
  ArrowRight, RefreshCw, CheckCircle2, AlertTriangle, FileText
} from 'lucide-react';

interface DashboardData {
  users: { total: number; recent: number };
  websites: { total: number; active: number };
  subscriptions: { active: number; trialing?: number; pastDue?: number; canceled: number };
  content: { total: number; pendingReview: number; published: number };
  seo: { totalAudits: number };
  keywords: { tracked: number };
  backlinks: { opportunities: number; verified: number };
  recommendations: { open: number; completed: number };
  jobs: { pending: number; running: number; failed: number };
}

export default function AdminOverview() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/overview');
      if (!res.ok) throw new Error(`Failed to load overview: status ${res.status}`);
      const json = await res.json();
      setData(json.metrics);
    } catch (err: any) {
      console.error('[Admin Overview Error]:', err);
      setError(err?.message || 'Failed to retrieve overview data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px' }}>
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading platform overview...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: '#fdf6ed', border: '1px solid #fae2b6', color: '#9e3d34', padding: '20px', borderRadius: '8px' }}>
        <h3>Error Loading Dashboard</h3>
        <p>{error || 'Failed to load dashboard metrics.'}</p>
        <button onClick={fetchData} className={styles.actionBtn} style={{ marginTop: '12px' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '24px', fontWeight: 700 }}>Owner Administration Overview</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Real-time status across customers, subscriptions, automated domains, and system activity.
          </p>
        </div>

        <button
          onClick={fetchData}
          className={styles.actionBtn}
          style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} /> Refresh Data
        </button>
      </div>

      {/* Quick Navigation Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <Link href="/admin/users" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={styles.card} style={{ height: '100%', transition: 'transform 0.15s ease', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} color="var(--primary-color)" />
                <span className={styles.statLabel}>User Management</span>
              </div>
              <ArrowRight size={14} color="var(--text-secondary)" />
            </div>
            <div className={styles.statValue}>{data.users.total}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              +{data.users.recent} joined this week
            </div>
          </div>
        </Link>

        <Link href="/admin/subscriptions" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={styles.card} style={{ height: '100%', transition: 'transform 0.15s ease', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={18} color="#22c55e" />
                <span className={styles.statLabel}>Subscriptions</span>
              </div>
              <ArrowRight size={14} color="var(--text-secondary)" />
            </div>
            <div className={styles.statValue} style={{ color: '#22c55e' }}>{data.subscriptions.active}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {data.subscriptions.trialing ?? 0} trials • {data.subscriptions.pastDue ?? 0} past due
            </div>
          </div>
        </Link>

        <Link href="/admin/websites" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={styles.card} style={{ height: '100%', transition: 'transform 0.15s ease', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={18} color="#3b82f6" />
                <span className={styles.statLabel}>Websites</span>
              </div>
              <ArrowRight size={14} color="var(--text-secondary)" />
            </div>
            <div className={styles.statValue}>{data.websites.total}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {data.websites.active} actively monitored
            </div>
          </div>
        </Link>

        <Link href="/admin/audit-logs" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className={styles.card} style={{ height: '100%', transition: 'transform 0.15s ease', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ListOrdered size={18} color="#8b5cf6" />
                <span className={styles.statLabel}>System Activity</span>
              </div>
              <ArrowRight size={14} color="var(--text-secondary)" />
            </div>
            <div className={styles.statValue} style={{ fontSize: '18px', marginTop: '12px' }}>Audit Trail</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              View full operational log
            </div>
          </div>
        </Link>
      </div>

      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Autopilot SEO &amp; Content Engine</h3>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.statLabel}>Articles Generated</div>
          <div className={styles.statValue}>{data.content.total}</div>
          <div className={styles.statLabel} style={{ marginTop: '8px', fontSize: '12px' }}>
            {data.content.published} published • {data.content.pendingReview} in review
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.statLabel}>SEO Audits Performed</div>
          <div className={styles.statValue}>{data.seo.totalAudits}</div>
          <div className={styles.statLabel} style={{ marginTop: '8px', fontSize: '12px' }}>
            Technical crawls &amp; scores
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.statLabel}>Tracked Keywords</div>
          <div className={styles.statValue}>{data.keywords.tracked}</div>
          <div className={styles.statLabel} style={{ marginTop: '8px', fontSize: '12px' }}>
            Across all domains
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.statLabel}>Backlinks Engine</div>
          <div className={styles.statValue}>{data.backlinks.opportunities} Opps</div>
          <div className={styles.statLabel} style={{ marginTop: '8px', fontSize: '12px' }}>
            {data.backlinks.verified} verified links acquired
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', marginTop: '32px' }}>Background Processing Queue</h3>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.statLabel}>Queued Jobs</div>
          <div className={styles.statValue}>{data.jobs.pending}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.statLabel}>Running Now</div>
          <div className={styles.statValue} style={{ color: 'var(--primary-color)' }}>{data.jobs.running}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.statLabel}>Failed Jobs</div>
          <div className={styles.statValue} style={{ color: data.jobs.failed > 0 ? '#ef4444' : 'inherit' }}>
            {data.jobs.failed}
          </div>
        </div>
      </div>
    </div>
  );
}
