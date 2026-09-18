import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import styles from './marketing.module.css';

export default async function Header() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  return (
    <header className={styles.headerWrapper}>
      <div className={styles.headerContainer}>
        <Link href="/" className={styles.brandLink}>
          <span className={styles.brandMark}>R</span>
          <span className={styles.brandName}>RankAutonomous</span>
        </Link>
        
        <nav className={styles.navigation}>
          <Link href="/features" className={styles.navItem}>Features</Link>
          <Link href="/how-it-works" className={styles.navItem}>How It Works</Link>
          <Link href="/pricing" className={styles.navItem}>Pricing</Link>
          <Link href="/faq" className={styles.navItem}>FAQ</Link>
        </nav>

        <div className={styles.actions}>
          {session?.user ? (
            <Link href="/app" className={styles.primaryAction}>
              Open Workspace →
            </Link>
          ) : (
            <>
              <Link href="/login" className={styles.loginAction}>
                Log in
              </Link>
              <Link href="/signup" className={styles.primaryAction}>
                Start Growing →
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
