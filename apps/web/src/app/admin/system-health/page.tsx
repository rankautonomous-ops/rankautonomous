'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from '../admin.module.css';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface HealthData {
  [key: string]: { status: string; details: string };
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();


  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/system-health`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) throw new Error('Failed to load health');
      
      const json = await res.json();
      setHealth(json.health);
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

  if (loading) return <div>Loading system health...</div>;
  if (!health) return <div>Failed to load data</div>;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS': return <CheckCircle2 size={24} color="#22c55e" />;
      case 'WARNING': return <AlertTriangle size={24} color="#f59e0b" />;
      case 'ERROR': return <XCircle size={24} color="#ef4444" />;
      default: return null;
    }
  };

  const services = [
    { name: 'API Server', key: 'api' },
    { name: 'Database (Prisma)', key: 'database' },
    { name: 'Stripe Integration', key: 'stripe' },
    { name: 'Google OAuth', key: 'googleOAuth' },
    { name: 'Trigger.dev', key: 'triggerDev' },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: '24px' }}>System Health</h2>

      <div className={styles.grid}>
        {services.map(svc => {
          const status = health[svc.key]?.status || 'ERROR';
          const details = health[svc.key]?.details || 'Unknown';
          
          return (
            <div key={svc.key} className={styles.card} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              {getStatusIcon(status)}
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 8px 0' }}>{svc.name}</h3>
                <span className={`${styles.badge} ${status.toLowerCase()}`}>{status}</span>
                <p style={{ margin: '12px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {details}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
