'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import styles from './app.module.css';

export default function UserNavRole({ email }: { email: string }) {
  const [role, setRole] = useState<'CUSTOMER' | 'ADMIN'>('CUSTOMER');

  useEffect(() => {
    let isMounted = true;
    apiFetch('/api/me')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data?.user?.role) {
            setRole(data.user.role);
          }
        }
      })
      .catch((err) => {
        console.error('[UserNavRole] Failed to fetch user role:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {role === 'ADMIN' && (
        <Link href="/admin" className={styles.adminNavLink}>
          🛡️ Admin Panel
        </Link>
      )}
      <div className={styles.userBadge}>
        <span className={styles.userEmail}>{email}</span>
        <span className={role === 'ADMIN' ? styles.roleTagAdmin : styles.roleTag}>
          {role}
        </span>
      </div>
    </div>
  );
}

