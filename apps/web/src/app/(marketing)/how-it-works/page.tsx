import type { Metadata } from 'next';
import styles from '@/components/marketing/marketing.module.css';

export const metadata: Metadata = {
  title: 'How It Works',
  description:
    'Learn how the RankAutonomous continuous growth loop works: Analyze, Create, Build, and Grow.',
};

export default function HowItWorksPage() {
  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHero}>
        <h1 className={styles.pageTitle}>How It Works</h1>
        <p className={styles.pageSubtitle}>
          The continuous RankAutonomous growth loop: Analyze, Create, Build, and Grow.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '28px', maxWidth: '1100px', margin: '0 auto' }}>
        <div className={styles.contentBlock}>
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#8c423d', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Stage 01
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text)', marginBottom: '14px', letterSpacing: '-0.02em' }}>
            Analyze
          </h2>
          <p className={styles.prose}>
            Connect your domain and let our crawlers analyze your site architecture, technical health, indexing status, and current keyword footprints. We establish a baseline SEO score and highlight high-impact quick wins.
          </p>
        </div>

        <div className={styles.contentBlock} style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}>
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#8c423d', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Stage 02
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text)', marginBottom: '14px', letterSpacing: '-0.02em' }}>
            Create
          </h2>
          <p className={styles.prose} style={{ color: 'var(--text)' }}>
            Based on the analysis, our AI discovers low-competition keyword clusters and plans an autonomous publishing schedule. Our writing studio drafts comprehensive, rank-ready articles designed for search intent.
          </p>
        </div>

        <div className={styles.contentBlock}>
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#8c423d', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Stage 03
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text)', marginBottom: '14px', letterSpacing: '-0.02em' }}>
            Build
          </h2>
          <p className={styles.prose}>
            Great content needs domain authority. Our link-building engine continuously scans for relevant opportunities, discovers contact details, and assists with personalized, policy-compliant outreach.
          </p>
        </div>

        <div className={styles.contentBlock}>
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#8c423d', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Stage 04
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text)', marginBottom: '14px', letterSpacing: '-0.02em' }}>
            Grow
          </h2>
          <p className={styles.prose}>
            Sync with Google Search Console and GA4 to track clicks, impressions, and ranking shifts. As new performance data arrives, the engine refines keyword suggestions and future content plans.
          </p>
        </div>
      </div>
    </div>
  );
}
