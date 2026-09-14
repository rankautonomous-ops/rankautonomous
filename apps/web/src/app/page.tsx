import Link from 'next/link';
import styles from './page.module.css';
import { createClient } from '../lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logoArea}>
          <div className={styles.logoIcon}>R</div>
          <span className={styles.brandName}>RankAutonomous</span>
        </div>
        <div className={styles.headerActions}>
          {session?.user ? (
            <Link href="/app" className={styles.getStartedBtn}>
              Open Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className={styles.signInBtn}>
                Sign In
              </Link>
              <Link href="/signup" className={styles.getStartedBtn}>
                Get Started
              </Link>
            </>
          )}
        </div>
      </header>

      <main className={styles.hero}>
        <div className={styles.statusBadge}>
          <span>⚡ AI-Powered SEO &amp; Link-Building SaaS</span>
        </div>

        <h1 className={styles.title}>
          Continuous Organic Growth <br />
          <span className={styles.titleHighlight}>On Autopilot</span>
        </h1>

        <p className={styles.description}>
          RankAutonomous autonomously analyzes your website, tracks keyword opportunities, generates rank-ready articles, and builds high-authority backlinks.
        </p>

        <div className={styles.pipeline}>
          <span className={styles.pipelineStep}>ANALYZE</span>
          <span className={styles.pipelineArrow}>→</span>
          <span className={styles.pipelineStep}>CREATE</span>
          <span className={styles.pipelineArrow}>→</span>
          <span className={styles.pipelineStep}>BUILD</span>
          <span className={styles.pipelineArrow}>→</span>
          <span className={styles.pipelineStep}>GROW</span>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '48px' }}>
          <Link
            href={session?.user ? '/app' : '/signup'}
            className={styles.getStartedBtn}
            style={{ padding: '12px 30px', fontSize: '15px' }}
          >
            {session?.user ? 'Open Workspace' : 'Get Started Free'}
          </Link>
          {!session?.user && (
            <Link
              href="/login"
              className={styles.signInBtn}
              style={{
                padding: '12px 24px',
                fontSize: '15px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              Sign In →
            </Link>
          )}
        </div>

        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardIcon}>🔍</div>
            <h3 className={styles.cardTitle}>SEO Audits &amp; Scoring</h3>
            <p className={styles.cardDesc}>
              Continuous technical crawling, prioritized issue detection, and actionable SEO health scores.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>✍️</div>
            <h3 className={styles.cardTitle}>Autonomous Content</h3>
            <p className={styles.cardDesc}>
              AI-driven keyword discovery, scheduled articles, internal linking, and one-click CMS publishing.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>🔗</div>
            <h3 className={styles.cardTitle}>Link-Building Engine</h3>
            <p className={styles.cardDesc}>
              Automated backlink opportunity discovery, outreach assistance, and live link verification.
            </p>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        RankAutonomous &copy; 2026. Built with Next.js, Supabase, and Prisma.
      </footer>
    </div>
  );
}
