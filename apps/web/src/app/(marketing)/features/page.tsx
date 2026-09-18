import type { Metadata } from 'next';
import styles from '@/components/marketing/marketing.module.css';
import { Bot, LineChart, Link as LinkIcon, PenTool } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Explore the RankAutonomous AI SEO platform features: technical website analysis, daily AI article generation, autonomous keyword strategy, and high-authority link discovery.',
};

export default function FeaturesPage() {
  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHero}>
        <h1 className={styles.pageTitle}>Features</h1>
        <p className={styles.pageSubtitle}>
          Everything you need to automate your SEO strategy, scale publish-ready content, and compound organic traffic.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '1000px', margin: '0 auto' }}>
        <div className={styles.contentBlock} style={{ display: 'flex', gap: '28px', alignItems: 'flex-start' }}>
          <div style={{ padding: '12px', background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <LineChart size={32} color="var(--text)" />
          </div>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              SEO Audits &amp; Scoring
            </h2>
            <p className={styles.prose}>
              Continuous technical crawling, prioritized issue detection, and actionable SEO health scores (0–100). Our background engine audits crawlability, meta descriptions, heading structures, canonical links, and mobile responsiveness.
            </p>
          </div>
        </div>

        <div className={styles.contentBlock} style={{ display: 'flex', gap: '28px', alignItems: 'flex-start' }}>
          <div style={{ padding: '12px', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)' }}>
            <Bot size={32} color="#8c423d" />
          </div>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Autonomous Keyword &amp; Content Strategy
            </h2>
            <p className={styles.prose}>
              AI-driven keyword discovery tailored to your business domain. RankAutonomous finds low-competition, high-intent keywords, clusters them semantically, and builds an editorial roadmap.
            </p>
          </div>
        </div>

        <div className={styles.contentBlock} style={{ display: 'flex', gap: '28px', alignItems: 'flex-start' }}>
          <div style={{ padding: '12px', background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <PenTool size={32} color="var(--text)" />
          </div>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              AI Article Generation &amp; Editorial Workspace
            </h2>
            <p className={styles.prose}>
              Generate comprehensive, rank-ready articles infused with relevant NLP terms. Review drafts in our distraction-free writing studio and publish directly to WordPress and Webflow.
            </p>
          </div>
        </div>

        <div className={styles.contentBlock} style={{ display: 'flex', gap: '28px', alignItems: 'flex-start' }}>
          <div style={{ padding: '12px', background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <LinkIcon size={32} color="var(--text)" />
          </div>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px', color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Link-Building Engine
            </h2>
            <p className={styles.prose}>
              Automated backlink opportunity discovery. Find verified guest post targets, unlinked brand mentions, and industry resource roundups, complete with personalized outreach email drafts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
