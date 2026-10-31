'use client';

import { useEffect, useState, useCallback } from 'react';
import styles from '../admin.module.css';
import { apiFetch } from '../../../lib/api';
import { RefreshCw, ListOrdered, ShieldCheck, Activity } from 'lucide-react';

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: any;
  ipAddress?: string | null;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    name?: string | null;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (pageToLoad = 1) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: pageToLoad.toString(),
        limit: '20',
      });

      const res = await apiFetch(`/api/admin/audit-logs?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load audit logs: status ${res.status}`);
      }
      const data = await res.json();
      setLogs(data.logs || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err: any) {
      console.error('[Admin Audit Logs Error]:', err);
      setError(err?.message || 'Failed to retrieve audit logs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 700 }}>System Activity &amp; Audit Trail</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Tamper-evident record of administrative events, role changes, and system operations.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchLogs(pagination.page)}
          className={styles.actionBtn}
          style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Logs
        </button>
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
              <th>Timestamp</th>
              <th>Action</th>
              <th>Actor (User)</th>
              <th>Target Entity</th>
              <th>Details / Metadata</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
                  <div>Loading audit logs...</div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  No audit logs recorded yet.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isRoleUpdate = log.action.includes('ROLE');

                return (
                  <tr key={log.id}>
                    <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600 }}>{new Date(log.createdAt).toLocaleDateString()}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>{new Date(log.createdAt).toLocaleTimeString()}</div>
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        style={{
                          background: isRoleUpdate ? 'rgba(124, 58, 237, 0.15)' : 'var(--background)',
                          color: isRoleUpdate ? '#7c3aed' : 'var(--text)',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{log.user?.email || (log.userId === 'SYSTEM' ? 'SYSTEM (Automated)' : log.userId)}</div>
                      {log.user?.name && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{log.user.name}</div>}
                    </td>
                    <td>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{log.entityType}</div>
                      <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        ID: {log.entityId}
                      </div>
                    </td>
                    <td>
                      {log.metadata ? (
                        <pre
                          style={{
                            margin: 0,
                            padding: '4px 8px',
                            background: 'var(--background)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {JSON.stringify(log.metadata)}
                        </pre>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>—</span>
                      )}
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
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} audit events logged)
          </div>
          <div className={styles.pageControls}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => fetchLogs(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
            >
              Previous
            </button>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => fetchLogs(pagination.page + 1)}
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

