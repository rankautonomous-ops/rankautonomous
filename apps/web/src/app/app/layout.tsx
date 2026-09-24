import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/server';
import LogoutButton from './LogoutButton';
import styles from './app.module.css';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className={styles.container}>
      <header className={styles.navbar}>
        <div className={styles.navLeft}>
          <Link href="/app" className={styles.navBrand}>
            <div className={styles.logoIcon}>R</div>
            <span className={styles.brandName}>RankAutonomous</span>
          </Link>

          <nav className={styles.navLinks}>
            <Link href="/app" className={styles.navLink}>
              Overview
            </Link>
            <Link href="/app/recommendations" className={styles.navLink}>
              Action Plan
            </Link>
            <Link href="/app/reports" className={styles.navLink}>
              Reports
            </Link>
            <Link href="/app/performance" className={styles.navLink}>
              Performance
            </Link>
            <Link href="/app/keywords" className={styles.navLink}>
              Keywords
            </Link>
            <Link href="/app/competitors" className={styles.navLink}>
              Competitors
            </Link>
            <Link href="/app/content" className={styles.navLink}>
              Content Engine
            </Link>
            <Link href="/app/backlinks" className={styles.navLink}>
              Backlinks
            </Link>
            <Link href="/app/integrations" className={styles.navLink}>
              Integrations
            </Link>
            <Link href="/app/billing" className={styles.navLink}>
              Billing
            </Link>
            <Link href="/app/profile" className={styles.navLink}>
              Settings
            </Link>
          </nav>
        </div>

        <div className={styles.navRight}>
          <div className={styles.userBadge}>
            <span className={styles.userEmail}>{user.email}</span>
            <span className={styles.roleTag}>CUSTOMER</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className={styles.mainContent}>{children}</main>
    </div>
  );
}
