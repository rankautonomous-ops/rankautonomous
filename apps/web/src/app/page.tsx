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
        <div className={styles.statusBadge}>
          <span className={styles.pulseDot} />
          <span>Backend Connected: Supabase</span>
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

        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardIcon}>🔍</div>
            <h3 className={styles.cardTitle}>Live Supabase Backend</h3>
            <p className={styles.cardDesc}>
              Connected to PostgreSQL &amp; PostgREST data layer with Row-Level Security active.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>🛡️</div>
            <h3 className={styles.cardTitle}>Authentication State</h3>
            <p className={styles.cardDesc}>
              {session?.user ? `Logged in as ${session.user.email}` : 'Ready for User Onboarding & Auth flow (Step 3).'}
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.cardIcon}>🌐</div>
            <h3 className={styles.cardTitle}>Services Ports</h3>
            <p className={styles.cardDesc}>
              Frontend UI: <strong>localhost:3000</strong><br />
              API Server: <strong>localhost:4000</strong>
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
