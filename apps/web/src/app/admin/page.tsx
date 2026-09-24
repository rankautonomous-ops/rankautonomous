'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './admin.module.css';

interface DashboardData {
  users: { total: number; recent: number };
  websites: { total: number; active: number };
  subscriptions: { active: number; canceled: number };
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
  const supabase = createClient();


  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/overview`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('Failed to load overview');
      
      const json = await res.json();
      setData(json.metrics);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line
    fetchData();
  }, []);

  if (loading) return <div>Loading dashboard...</div>;
  if (!data) return <div>Failed to load data</div>;

  return (
    <div>
      <h2 style={{ marginBottom: '24px' }}>Platform Overview</h2>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.statLabel}>Total Users</div>
          <div className={styles.statValue}>{data.users.total}</div>
          <div className={styles.statLabel} style={{ marginTop: '8px', fontSize: '11px' }}>
            {data.users.recent} joined in last 7 days
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.statLabel}>Websites</div>
          <div className={styles.statValue}>{data.websites.total}</div>
          <div className={styles.statLabel} style={{ marginTop: '8px', fontSize: '11px' }}>
            {data.websites.active} active
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.statLabel}>Active Subscriptions</div>
          <div className={styles.statValue}>{data.subscriptions.active}</div>
        </div>

        <div className={styles.card}>
          <div className={styles.statLabel}>Articles Generated</div>
          <div className={styles.statValue}>{data.content.total}</div>
          <div className={styles.statLabel} style={{ marginTop: '8px', fontSize: '11px' }}>
            {data.content.published} published • {data.content.pendingReview} in review
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.statLabel}>SEO Audits</div>
          <div className={styles.statValue}>{data.seo.totalAudits}</div>
        </div>

        <div className={styles.card}>
          <div className={styles.statLabel}>Tracked Keywords</div>
          <div className={styles.statValue}>{data.keywords.tracked}</div>
        </div>

        <div className={styles.card}>
          <div className={styles.statLabel}>Backlinks</div>
          <div className={styles.statValue}>{data.backlinks.opportunities} Opps</div>
          <div className={styles.statLabel} style={{ marginTop: '8px', fontSize: '11px' }}>
            {data.backlinks.verified} verified
          </div>
        </div>
        
        <div className={styles.card}>
          <div className={styles.statLabel}>Recommendations</div>
          <div className={styles.statValue}>{data.recommendations.open}</div>
          <div className={styles.statLabel} style={{ marginTop: '8px', fontSize: '11px' }}>
            {data.recommendations.completed} completed
          </div>
        </div>
      </div>

      <h3 style={{ marginBottom: '16px', marginTop: '32px' }}>System Activity</h3>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.statLabel}>Pending Jobs</div>
          <div className={styles.statValue}>{data.jobs.pending}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.statLabel}>Running Jobs</div>
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
