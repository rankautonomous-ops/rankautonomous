'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from '../admin.module.css';
import { apiFetch } from '../../../lib/api';
import { Search, Shield, UserCheck, RefreshCw, Eye, X, Globe } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  name?: string | null;
  role: 'CUSTOMER' | 'ADMIN';
  trialActive?: boolean;
  trialEndsAt?: string | null;
  isPaused?: boolean;
  subscriptionStatus: string;
  subscriptionPlan?: string;
  createdAt: string;
  websiteCount: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [roleActionLoading, setRoleActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async (pageToLoad = 1, searchQuery = search) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: pageToLoad.toString(),
        limit: '20',
      });
      if (searchQuery) queryParams.set('search', searchQuery);

      const res = await apiFetch(`/api/admin/users?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load users: status ${res.status}`);
      }
      const data = await res.json();
      setUsers(data.users || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err: any) {
      console.error('[Admin Users Error]:', err);
      setError(err?.message || 'Failed to retrieve users.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(1, search);
  };

  const handleRoleToggle = async (user: AdminUser) => {
    const newRole = user.role === 'ADMIN' ? 'CUSTOMER' : 'ADMIN';
    const confirmMsg =
      newRole === 'ADMIN'
        ? `Are you sure you want to grant full Administrator access to ${user.email}?`
        : `Are you sure you want to demote ${user.email} to Customer?`;

    if (!window.confirm(confirmMsg)) return;

    setRoleActionLoading(user.id);
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Failed to update role');
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
      );
    } catch (err: any) {
      alert(`Role change failed: ${err.message}`);
    } finally {
      setRoleActionLoading(null);
    }
  };

  const handleViewDetails = async (userId: string) => {
    setDetailsLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`);
      if (!res.ok) throw new Error('Failed to load user details');
      const data = await res.json();
      setSelectedUser(data.user);
    } catch (err: any) {
      alert(err.message || 'Could not load user details');
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 700 }}>Users &amp; Role Management</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>
            Total registered accounts: {pagination.total}
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className={styles.searchBar} style={{ margin: 0 }}>
          <input
            type="text"
            className={styles.input}
            placeholder="Search by email, name, or ID..."
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
              <th>User</th>
              <th>Role</th>
              <th>Plan</th>
              <th>Billing Status</th>
              <th>Websites</th>
              <th>Joined Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
                  <div>Loading users...</div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  No users found matching your search.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isUserAdmin = u.role === 'ADMIN';
                const isTrial = u.trialActive || u.subscriptionPlan === 'trial' || u.subscriptionStatus?.toLowerCase() === 'trialing';

                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.email}</div>
                      {u.name && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{u.name}</div>}
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>ID: {u.id.substring(0, 8)}...</div>
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        style={{
                          background: isUserAdmin ? 'rgba(124, 58, 237, 0.15)' : 'var(--border)',
                          color: isUserAdmin ? '#7c3aed' : 'var(--text-secondary)',
                          fontWeight: 700,
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>
                        {isTrial ? '3-Day Trial ($1)' : u.subscriptionPlan || 'None'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          u.subscriptionStatus === 'active'
                            ? styles.success
                            : isTrial
                            ? styles.warning
                            : u.subscriptionStatus === 'past_due'
                            ? styles.error
                            : ''
                        }`}
                        style={{ textTransform: 'uppercase', fontSize: '11px' }}
                      >
                        {isTrial && u.subscriptionStatus !== 'active' ? 'TRIALING' : u.subscriptionStatus}
                      </span>
                      {u.isPaused && (
                        <div style={{ fontSize: '11px', color: 'var(--error)', marginTop: '2px' }}>
                          (Paused)
                        </div>
                      )}
                    </td>
                    <td>{u.websiteCount}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleViewDetails(u.id)}
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleRoleToggle(u)}
                          disabled={roleActionLoading === u.id}
                          title={isUserAdmin ? 'Demote to Customer' : 'Promote to Admin'}
                          style={{
                            color: isUserAdmin ? '#9e3d34' : '#2e6b3b',
                          }}
                        >
                          <Shield size={14} />
                          <span>{isUserAdmin ? 'Demote' : 'Make Admin'}</span>
                        </button>
                      </div>
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
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total users)
          </div>
          <div className={styles.pageControls}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => fetchUsers(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
            >
              Previous
            </button>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => fetchUsers(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || loading}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '100%',
              padding: '24px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>User Profile Details</h3>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div><strong>Email:</strong> {selectedUser.email}</div>
              <div><strong>User ID:</strong> {selectedUser.id}</div>
              <div><strong>System Role:</strong> <span className={styles.badge}>{selectedUser.role}</span></div>
              <div><strong>Billing Status:</strong> {selectedUser.subscriptionStatus}</div>
              <div><strong>Registered:</strong> {new Date(selectedUser.createdAt).toLocaleString()}</div>
            </div>

            <h4 style={{ fontSize: '15px', fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '12px' }}>
              Registered Websites ({selectedUser.websites?.length || 0})
            </h4>
            {selectedUser.websites?.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No websites connected yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {selectedUser.websites?.map((w: any) => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--background-secondary)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Globe size={14} />
                      <span style={{ fontWeight: 500 }}>{w.url}</span>
                    </div>
                    <span className={styles.badge}>{w.status}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className={styles.actionBtn}
                style={{ padding: '8px 16px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

