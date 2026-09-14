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
        <Link href="/app" className={styles.navBrand}>
          <div className={styles.logoIcon}>R</div>
          <span className={styles.brandName}>RankAutonomous</span>
        </Link>

        <nav className={styles.navLinks}>
          <Link href="/app" className={styles.navLink}>
            Dashboard
          </Link>
          <Link href="/app/profile" className={styles.navLink}>
            Profile
          </Link>
          <div className={styles.userBadge}>
            <span>{user.email}</span>
            <span className={styles.roleTag}>CUSTOMER</span>
          </div>
          <LogoutButton />
        </nav>
      </header>

      <main className={styles.mainContent}>{children}</main>
    </div>
  );
}
