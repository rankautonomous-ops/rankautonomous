import Link from 'next/link';
import styles from './auth.module.css';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.authContainer}>
      <Link href="/" className={styles.brandHeader}>
        <div className={styles.logoIcon}>R</div>
        <span className={styles.brandName}>RankAutonomous</span>
      </Link>
      <div className={styles.authCard}>{children}</div>
    </div>
  );
}
