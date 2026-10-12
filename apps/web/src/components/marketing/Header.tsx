import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import HeaderNav from './HeaderNav';
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
        
        <HeaderNav sessionUser={!!session?.user} />
      </div>
    </header>
  );
}

