'use client';

import { useEffect, useState, useCallback } from 'react';
import styles from '../admin.module.css';
import { apiFetch } from '../../../lib/api';
import { Search, RefreshCw, CreditCard, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface AdminSubscription {
  id: string;
  userId: string;
  plan: string;
  interval: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    name?: string | null;
    trialActive?: boolean;
    trialEndsAt?: string | null;
    isPaused?: boolean;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(
    async (pageToLoad = 1, currentFilter = statusFilter, searchQuery = search) => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams({
          page: pageToLoad.toString(),
          limit: '20',
        });
        if (currentFilter && currentFilter !== 'ALL') {
          queryParams.set('status', currentFilter);
        }
        if (searchQuery) {
          queryParams.set('search', searchQuery);
        }

        const res = await apiFetch(`/api/admin/subscriptions?${queryParams.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to load subscriptions: status ${res.status}`);
        }
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
        setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
      } catch (err: any) {
        console.error('[Admin Subscriptions Error]:', err);
        setError(err?.message || 'Failed to retrieve subscriptions.');
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, search]
  );

  useEffect(() => {
    fetchSubscriptions(1, statusFilter, search);
  }, [fetchSubscriptions, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSubscriptions(1, statusFilter, search);
  };

  const handleFilterChange = (newFilter: string) => {
    setStatusFilter(newFilter);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 700 }}>Subscriptions &amp; Billing Monitor</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Real-time billing, trial statuses, and Stripe recurring subscriptions.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className={styles.searchBar} style={{ margin: 0 }}>
          <input
            type="text"
            className={styles.input}
            placeholder="Search by email, plan, or Stripe ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className={styles.actionBtn} style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Search size={14} /> Search
          </button>
        </form>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['ALL', 'ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED'].map((filter) => {
          const isActive = statusFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              onClick={() => handleFilterChange(filter)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: isActive ? 'var(--text)' : 'var(--background-secondary)',
                color: isActive ? 'var(--background)' : 'var(--text)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {filter}
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ background: '#fdf6ed', border: '1px solid #fae2b6', color: '#9e3d34', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Subscriber</th>
              <th>Plan Tier</th>
              <th>Status</th>
              <th>Renewal &amp; Dates</th>
              <th>Stripe Reference IDs</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
                  <div>Loading subscriptions...</div>
                </td>
              </tr>
            ) : subscriptions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  No subscriptions match the selected criteria.
                </td>
              </tr>
            ) : (
              subscriptions.map((s) => {
                const isTrial = s.plan === 'trial' || s.status.toLowerCase() === 'trialing';
                const statusLower = s.status.toLowerCase();

                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.user?.email || 'Unknown User'}</div>
                      {s.user?.name && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.user.name}</div>}
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>User ID: {s.userId.substring(0, 8)}...</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                        {isTrial ? '3-Day Trial ($1.00)' : `${s.plan} (${s.interval})`}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {s.plan === 'annual' ? '$1,188 / yr' : s.plan === 'monthly' ? '$149 / mo' : '$1 paid'}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          statusLower === 'active'
                            ? styles.success
                            : statusLower === 'trialing'
                            ? styles.warning
                            : statusLower === 'past_due'
                            ? styles.error
                            : ''
                        }`}
                        style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}
                      >
                        {s.status}
                      </span>
                      {s.user?.isPaused && (
                        <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '2px' }}>
                          (Automation Paused)
                        </div>
                      )}
                    </td>
                    <td>
                      <div>
                        {s.cancelAtPeriodEnd ? (
                          <span style={{ color: 'var(--error)', fontSize: '12px', fontWeight: 600 }}>
                            Scheduled to Cancel
                          </span>
                        ) : (
                          <span style={{ color: 'var(--success)', fontSize: '12px', fontWeight: 600 }}>
                            Auto-renews
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Cycle End: {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : 'N/A'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                        <div>Sub: {s.stripeSubscriptionId || 'None'}</div>
                        <div>Cus: {s.stripeCustomerId || 'None'}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        <div className={styles.pagination} style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} subscriptions recorded)
          </div>
          <div className={styles.pageControls}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => fetchSubscriptions(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
            >
              Previous
            </button>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => fetchSubscriptions(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

