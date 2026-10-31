'use client';

import { useEffect, useState, useCallback } from 'react';
import styles from '../admin.module.css';
import { apiFetch } from '../../../lib/api';
import { Search, RefreshCw, Globe, ExternalLink, Bot, CheckCircle } from 'lucide-react';

interface AdminWebsite {
  id: string;
  name: string;
  url: string;
  platform: string | null;
  status: string;
  contentAutomationEnabled: boolean;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    name?: string | null;
  };
  _count?: {
    articles: number;
    cmsConnections: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminWebsitesPage() {
  const [websites, setWebsites] = useState<AdminWebsite[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWebsites = useCallback(async (pageToLoad = 1, searchQuery = search) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: pageToLoad.toString(),
        limit: '20',
      });
      if (searchQuery) queryParams.set('search', searchQuery);

      const res = await apiFetch(`/api/admin/websites?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load websites: status ${res.status}`);
      }
      const data = await res.json();
      setWebsites(data.websites || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err: any) {
      console.error('[Admin Websites Error]:', err);
      setError(err?.message || 'Failed to retrieve websites.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchWebsites(1);
  }, [fetchWebsites]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchWebsites(1, search);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 700 }}>Customer Websites &amp; Domains</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Monitor domains, crawl health, and automated content publishing engines.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className={styles.searchBar} style={{ margin: 0 }}>
          <input
            type="text"
            className={styles.input}
            placeholder="Search by domain or URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className={styles.actionBtn} style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Search size={14} /> Search
          </button>
        </form>
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
              <th>Domain / Site</th>
              <th>Owner Account</th>
              <th>Platform</th>
              <th>Status</th>
              <th>Autopilot Publishing</th>
              <th>Articles</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
                  <div>Loading customer websites...</div>
                </td>
              </tr>
            ) : websites.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  No websites found matching your search.
                </td>
              </tr>
            ) : (
              websites.map((w) => {
                const isAutoActive = w.contentAutomationEnabled && w.status === 'ACTIVE';

                return (
                  <tr key={w.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Globe size={16} />
                        <div>
                          <a
                            href={w.url.startsWith('http') ? w.url : `https://${w.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <span>{w.name || w.url}</span>
                            <ExternalLink size={12} color="var(--text-secondary)" />
                          </a>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{w.url}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{w.user?.email || 'Unknown User'}</div>
                      {w.user?.name && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{w.user.name}</div>}
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', textTransform: 'capitalize' }}>
                        {w.platform || 'Custom Web'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          w.status === 'ACTIVE'
                            ? styles.success
                            : w.status === 'ANALYZING'
                            ? styles.info
                            : w.status === 'ERROR'
                            ? styles.error
                            : ''
                        }`}
                        style={{ fontSize: '11px', fontWeight: 700 }}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Bot size={14} color={isAutoActive ? '#22c55e' : 'var(--text-secondary)'} />
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: isAutoActive ? '#22c55e' : 'var(--text-secondary)',
                          }}
                        >
                          {isAutoActive ? 'Daily Active' : 'Disabled / Paused'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{w._count?.articles ?? 0}</span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {new Date(w.createdAt).toLocaleDateString()}
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
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} registered websites)
          </div>
          <div className={styles.pageControls}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => fetchWebsites(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
            >
              Previous
            </button>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => fetchWebsites(pagination.page + 1)}
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

