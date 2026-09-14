import { createClient } from '../../lib/supabase/server';
import styles from './app.module.css';

interface ApiMeResponse {
  user?: {
    id: string;
    supabaseAuthId: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: string;
  };
  error?: string;
  message?: string;
}

export default async function AppDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let apiUser: ApiMeResponse | null = null;
  let apiStatus = 'Connecting to backend API...';

  if (session?.access_token) {
    try {
      const apiUrl = process.env.API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      if (res.ok) {
        apiUser = await res.json();
        apiStatus = 'Successfully connected and synchronized with PostgreSQL/Prisma.';
      } else {
        const errData = await res.json().catch(() => ({}));
        apiStatus = `API response status ${res.status}: ${errData.message || 'Authorization failed'}`;
      }
    } catch (err: any) {
      apiStatus = `Backend API offline or unreachable (${err?.message || 'Check if Node API is running on port 4000'}).`;
    }
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          Welcome, {user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'}
        </h1>
        <p className={styles.pageSubtitle}>
          Authentication and protected workspace foundation (Step 3).
        </p>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          <span>🛡️</span> Authenticated Supabase Identity
        </h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Email</span>
            <span className={styles.infoValue}>{user?.email}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Display Name</span>
            <span className={styles.infoValue}>{user?.user_metadata?.name || 'Not set'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Supabase Auth ID</span>
            <span className={styles.infoValue}>{user?.id}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Email Confirmed</span>
            <span className={styles.infoValue}>
              {user?.email_confirmed_at ? 'Verified' : 'Pending verification'}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          <span>⚡</span> Application Database Sync (`/api/me`)
        </h2>
        <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '14px' }}>
          Verifies that the Node.js Express API validated the Supabase JWT and synchronized your user record with PostgreSQL Prisma.
        </p>

        {apiUser?.user ? (
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Prisma User ID</span>
              <span className={styles.infoValue}>{apiUser.user.id}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Role</span>
              <span className={styles.infoValue}>{apiUser.user.role}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Database Created At</span>
              <span className={styles.infoValue}>
                {new Date(apiUser.user.createdAt).toLocaleString()}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Sync Status</span>
              <span className={styles.infoValue} style={{ color: '#34d399' }}>
                Active &amp; Idempotent
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.apiStatusBox}>{apiStatus}</div>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          <span>🚀</span> Upcoming Phase: Step 4
        </h2>
        <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.6' }}>
          Your authentication and user synchronization layer is fully established. In future phases, you will be able to connect your website domain, trigger automated SEO crawling, and generate daily AI articles.
        </p>
      </div>
    </div>
  );
}
