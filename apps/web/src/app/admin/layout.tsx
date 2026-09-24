'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import styles from './admin.module.css';
import { 
  LayoutDashboard, Users, Globe, CreditCard, 
  FileText, Activity, Key, Link as LinkIcon, 
  Lightbulb, Database, Settings, BarChart2,
  ListOrdered, ShieldAlert, LogOut
} from 'lucide-react';

const navItems = [
  { path: '/admin', label: 'Overview', icon: LayoutDashboard },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/websites', label: 'Websites', icon: Globe },
  { path: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { path: '/admin/content', label: 'Content', icon: FileText },
  { path: '/admin/seo', label: 'SEO Audits', icon: Activity },
  { path: '/admin/keywords', label: 'Keywords', icon: Key },
  { path: '/admin/backlinks', label: 'Backlinks', icon: LinkIcon },
  { path: '/admin/recommendations', label: 'Recommendations', icon: Lightbulb },
  { path: '/admin/cms', label: 'CMS Connections', icon: Database },
  { path: '/admin/jobs', label: 'Background Jobs', icon: Settings },
  { path: '/admin/reports', label: 'Monthly Reports', icon: BarChart2 },
  { path: '/admin/audit-logs', label: 'Audit Logs', icon: ListOrdered },
  { path: '/admin/system-health', label: 'System Health', icon: ShieldAlert },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');
  const supabase = createClient();


  const checkAdmin = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Check server-side for admin role to be secure
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/me`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      if (!res.ok) {
        router.push('/app');
        return;
      }

      const data = await res.json();
      if (data.user.role !== 'ADMIN') {
        router.push('/app');
        return;
      }

      setIsAdmin(true);
      setAdminEmail(data.user.email);
    } catch (err) {
      console.error(err);
      router.push('/app');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line
    checkAdmin();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return <div className={styles.loadingContainer}>Loading Admin Panel...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2>RankAutonomous Admin</h2>
        </div>
        <nav className={styles.sidebarNav}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.path;
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      
      <main className={styles.mainContent}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <h1>{navItems.find(i => i.path === pathname)?.label || 'Admin'}</h1>
          </div>
          <div className={styles.topbarRight}>
            <span className={styles.adminEmail}>{adminEmail}</span>
            <button onClick={handleLogout} className={styles.logoutBtn}>
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>
        <div className={styles.contentArea}>
          {children}
        </div>
      </main>
    </div>
  );
}
