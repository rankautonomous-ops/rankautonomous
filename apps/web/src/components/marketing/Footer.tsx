import Link from 'next/link';
import styles from './marketing.module.css';

export default function Footer() {
  return (
    <footer className={styles.footerContainer}>
      <div className={styles.footerContent}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrandCol}>
            <div className={styles.footerBrand}>
              <span className={styles.footerMark}>R</span>
              <span className={styles.footerName}>RankAutonomous</span>
            </div>
            <p className={styles.footerTagline}>
              Put your SEO on autopilot.
            </p>
            <p className={styles.footerSub}>
              Continuous crawl audits, keyword discovery, and AI-driven publishing for high-intent organic traffic.
            </p>
          </div>

          <div className={styles.footerNavGroup}>
            <div className={styles.footerCol}>
              <span className={styles.colTitle}>Product</span>
              <Link href="/features" className={styles.colLink}>Features</Link>
              <Link href="/how-it-works" className={styles.colLink}>How It Works</Link>
              <Link href="/pricing" className={styles.colLink}>Pricing</Link>
              <Link href="/faq" className={styles.colLink}>FAQ</Link>
            </div>

            <div className={styles.footerCol}>
              <span className={styles.colTitle}>Company</span>
              <Link href="/contact" className={styles.colLink}>Contact</Link>
              <Link href="/terms" className={styles.colLink}>Terms of Service</Link>
              <Link href="/privacy" className={styles.colLink}>Privacy Policy</Link>
            </div>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p className={styles.copyright}>
            &copy; {new Date().getFullYear()} RankAutonomous. All rights reserved.
          </p>
          <div className={styles.footerSocials}>
            <span className={styles.socialItem}>X (Twitter)</span>
            <span className={styles.socialItem}>LinkedIn</span>
            <span className={styles.socialItem}>GitHub</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
