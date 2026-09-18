import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Sparkles,
  Search,
  FileText,
  Link2,
  TrendingUp,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import styles from '../page.module.css';
import { createClient } from '@/lib/supabase/server';
import PricingTable from '@/components/marketing/PricingTable';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const primaryCtaHref = session?.user ? '/app' : '/signup';
  const primaryCtaLabel = session?.user ? 'Open Workspace' : 'Start Growing →';

  return (
    <div className={styles.container}>
      {/* 1. HERO SECTION (design.md Section 7) */}
      <section className={styles.hero}>
        <div className={styles.aiBadge}>
          <Sparkles size={14} />
          <span>Autonomous SEO Engine</span>
        </div>

        <h1 className={styles.title}>
          Put Your SEO<br />
          on Autopilot.
        </h1>

        <p className={styles.description}>
          RankAutonomous continuously analyzes, creates, publishes, and improves your organic growth strategy without manual overhead.
        </p>

        <div className={styles.ctaGroup}>
          <Link href={primaryCtaHref} className={styles.primaryCta}>
            <span>{primaryCtaLabel}</span>
          </Link>
          <a href="#how-it-works" className={styles.secondaryCta}>
            <span>See How It Works</span>
            <ArrowRight size={16} />
          </a>
        </div>

        {/* 2. HERO PRODUCT VISUAL (design.md Section 8) */}
        <div className={styles.mockupContainer}>
          <div className={styles.mockupHeader}>
            <div className={styles.mockupHeaderLeft}>
              <div className={styles.mockupDot} style={{ background: '#c66f6f' }} />
              <div className={styles.mockupDot} style={{ background: '#c69752' }} />
              <div className={styles.mockupDot} style={{ background: '#6f9b7c' }} />
              <span className={styles.mockupUrl}>
                workspace.rankautonomous.com — SEO Command Center
              </span>
            </div>
            <span className={styles.mockupBadge}>Demo Preview</span>
          </div>

          <div className={styles.mockupBody}>
            {/* Top row: SEO Health card + Metrics Grid */}
            <div className={styles.mockupTopGrid}>
              <div className={styles.mockupHealthCard}>
                <div className={styles.mockupCardLabel}>SEO Health Score</div>
                <div className={styles.mockupHealthScoreRow}>
                  <div className={styles.mockupBigScore}>
                    82 <span className={styles.mockupBigScoreTotal}>/ 100</span>
                  </div>
                  <span className={styles.mockupTrendPill}>
                    ↑ 7 points this month
                  </span>
                </div>

                <div className={styles.mockupCategoryGrid}>
                  <div className={styles.mockupCatItem}>
                    <span className={styles.mockupCatName}>Technical</span>
                    <span className={styles.mockupCatVal}>91</span>
                  </div>
                  <div className={styles.mockupCatItem}>
                    <span className={styles.mockupCatName}>On-Page</span>
                    <span className={styles.mockupCatVal}>84</span>
                  </div>
                  <div className={styles.mockupCatItem}>
                    <span className={styles.mockupCatName}>Content</span>
                    <span className={styles.mockupCatVal}>79</span>
                  </div>
                  <div className={styles.mockupCatItem}>
                    <span className={styles.mockupCatName}>Internal</span>
                    <span className={styles.mockupCatVal}>76</span>
                  </div>
                  <div className={styles.mockupCatItem}>
                    <span className={styles.mockupCatName}>Performance</span>
                    <span className={styles.mockupCatVal}>88</span>
                  </div>
                </div>
              </div>

              <div className={styles.mockupMetricsCol}>
                <div className={styles.mockupMetricBox}>
                  <span className={styles.mockupCardLabel}>Organic Traffic</span>
                  <div className={styles.mockupMetricValue}>24.8K</div>
                  <span className={styles.mockupMetricDelta}>+18% this month</span>
                </div>
                <div className={styles.mockupMetricBox}>
                  <span className={styles.mockupCardLabel}>Keyword Movement</span>
                  <div className={styles.mockupMetricValue}>412</div>
                  <span className={styles.mockupMetricDelta}>+28 new keywords</span>
                </div>
                <div className={styles.mockupMetricBox}>
                  <span className={styles.mockupCardLabel}>Backlinks Tracked</span>
                  <div className={styles.mockupMetricValue}>184</div>
                  <span className={styles.mockupMetricDelta}>+12 active links</span>
                </div>
                <div className={styles.mockupMetricBox}>
                  <span className={styles.mockupCardLabel}>Published Articles</span>
                  <div className={styles.mockupMetricValue}>27</div>
                  <span className={styles.mockupMetricDelta}>100% indexed</span>
                </div>
              </div>
            </div>

            {/* Bottom row: Layered AI Activity Card */}
            <div className={styles.mockupActivityRow}>
              <div className={styles.mockupActivityLeft}>
                <div className={styles.mockupActivityIcon}>
                  <Bot size={22} />
                </div>
                <div>
                  <div className={styles.mockupActivityTitle}>
                    Article Generated &amp; Synced: &quot;Top 10 B2B SaaS Link Building Strategies&quot;
                  </div>
                  <div className={styles.mockupActivitySub}>
                    Target Keyword: <em>b2b link building</em> • 2,140 words • 4 internal links added • Health: 92/100
                  </div>
                </div>
              </div>
              <span className={styles.mockupBadge} style={{ background: '#edf7ee', color: '#2e6b3b', borderColor: '#b6e2be' }}>
                Published on Autopilot
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PROBLEM SECTION (design.md Section 9) */}
      <section className={styles.section}>
        <div className={styles.problemSection}>
          <div className={styles.problemLeft}>
            <div className={styles.sectionTag}>The Problem</div>
            <h2 className={styles.sectionTitle}>
              SEO is not one task.<br />
              It is hundreds of small decisions.
            </h2>
            <p className={styles.sectionSubtitle} style={{ marginBottom: 0 }}>
              Achieving sustainable search rankings requires technical upkeep, keyword planning, content writing, link outreach, and constant diagnostics. Most teams cannot keep up.
            </p>
          </div>

          <div className={styles.problemList}>
            <div className={styles.problemItem}>
              <div className={styles.problemItemNumber}>01 / TECHNICAL SEO</div>
              <div className={styles.problemItemTitle}>Crawl errors accumulate silently</div>
              <div className={styles.problemItemDesc}>
                Missing meta descriptions, broken anchors, slow load times, and canonical issues silently erode domain equity before you even notice.
              </div>
            </div>

            <div className={styles.problemItem}>
              <div className={styles.problemItemNumber}>02 / CONTENT PRODUCTION</div>
              <div className={styles.problemItemTitle}>High-intent writing takes dozens of hours</div>
              <div className={styles.problemItemDesc}>
                Researching competitors, structuring comprehensive outlines, inserting internal links, and proofreading articles consumes entire marketing weeks.
              </div>
            </div>

            <div className={styles.problemItem}>
              <div className={styles.problemItemNumber}>03 / KEYWORD OPPORTUNITIES</div>
              <div className={styles.problemItemTitle}>Targeting the wrong keywords</div>
              <div className={styles.problemItemDesc}>
                Most teams target high-difficulty keywords they cannot rank for, while overlooking high-intent commercial keywords that drive immediate pipeline.
              </div>
            </div>

            <div className={styles.problemItem}>
              <div className={styles.problemItemNumber}>04 / LINK OUTREACH</div>
              <div className={styles.problemItemTitle}>Cold prospecting yields near-zero reply rates</div>
              <div className={styles.problemItemDesc}>
                Manual discovery of guest post targets, unlinked brand mentions, and relevant directory listings requires full-time outreach dedication.
              </div>
            </div>

            <div className={styles.problemItem}>
              <div className={styles.problemItemNumber}>05 / ANALYTICS DISCONNECT</div>
              <div className={styles.problemItemTitle}>Data without actionable direction</div>
              <div className={styles.problemItemDesc}>
                Traditional dashboards display charts and numbers, but fail to tell you the 3 exact things you should do next to gain rankings.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. PRODUCT PHILOSOPHY (design.md Section 10) */}
      <section className={styles.section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className={styles.sectionTag}>Product Philosophy</div>
          <h2 className={styles.sectionTitle}>The Autonomous Growth Loop</h2>
          <p className={styles.sectionSubtitle} style={{ margin: '0 auto' }}>
            Four continuous stages executing in harmony to build compounding search authority.
          </p>
        </div>

        <div className={styles.philosophyGrid}>
          <div className={styles.philosophyCard}>
            <div>
              <div className={styles.philosophyWord}>ANALYZE</div>
              <p className={styles.philosophyDesc}>
                Continuous 24/7 web crawler auditing technical SEO, indexing health, headings, canonicals, and site architecture.
              </p>
            </div>
            <div className={styles.philosophyMeta}>
              Crawler + SEO Audit + Health Score
            </div>
          </div>

          <div className={`${styles.philosophyCard} ${styles.philosophyCardAccent}`}>
            <div>
              <div className={styles.philosophyWord}>CREATE</div>
              <p className={styles.philosophyDesc}>
                Autonomous keyword discovery and research, semantic topic clustering, and daily publish-ready AI articles.
              </p>
            </div>
            <div className={styles.philosophyMeta}>
              Keyword Engine + Topic Clusters + AI Content
            </div>
          </div>

          <div className={styles.philosophyCard}>
            <div>
              <div className={styles.philosophyWord}>BUILD</div>
              <p className={styles.philosophyDesc}>
                Automated CMS publishing, intelligent internal link mesh, and backlink target discovery with personalized outreach.
              </p>
            </div>
            <div className={styles.philosophyMeta}>
              Publishing + Internal Links + Backlinks
            </div>
          </div>

          <div className={styles.philosophyCard}>
            <div>
              <div className={styles.philosophyWord}>GROW</div>
              <p className={styles.philosophyDesc}>
                Google Search Console sync, rank position monitoring, and continuous self-adjusting SEO recommendations.
              </p>
            </div>
            <div className={styles.philosophyMeta}>
              Search Console + Position Tracking + Recommendations
            </div>
          </div>
        </div>
      </section>

      {/* 5. FEATURE CARDS (design.md Section 11) */}
      <section className={styles.section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className={styles.sectionTag}>Core Capabilities</div>
          <h2 className={styles.sectionTitle}>Engineered for Organic Domination</h2>
          <p className={styles.sectionSubtitle} style={{ margin: '0 auto' }}>
            A unified SEO command center built for modern teams that demand compounding organic revenue.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          <div className={styles.featureCardLarge}>
            <div style={{ marginBottom: '16px' }}><Search size={28} /></div>
            <h3 className={styles.featureCardTitle}>Technical SEO &amp; Health Auditing</h3>
            <p className={styles.featureCardDesc}>
              Deep architectural crawler inspecting metadata, open graph tags, missing titles, duplicate content, status codes, and internal link structure. Categorizes every finding into actionable Critical, High, Medium, and Low priorities with step-by-step fix guides.
            </p>
          </div>

          <div className={styles.featureCardSmall}>
            <div style={{ marginBottom: '16px' }}><FileText size={28} /></div>
            <h3 className={styles.featureCardTitle}>Daily Autonomous Content</h3>
            <p className={styles.featureCardDesc}>
              Generates 1 rank-focused article every single day. Analyzes user search intent, integrates relevant semantic NLP terms, builds internal links, and connects directly to WordPress or Webflow.
            </p>
          </div>

          <div className={styles.featureCardSmall}>
            <div style={{ marginBottom: '16px' }}><Link2 size={28} /></div>
            <h3 className={styles.featureCardTitle}>Backlink Discovery Engine</h3>
            <p className={styles.featureCardDesc}>
              Continuously finds high-authority guest posting opportunities, resource pages, and unlinked brand mentions. Generates tailored, human-readable outreach emails focused on genuine relationships.
            </p>
          </div>

          <div className={styles.featureCardLarge}>
            <div style={{ marginBottom: '16px' }}><TrendingUp size={28} /></div>
            <h3 className={styles.featureCardTitle}>Continuous Strategy &amp; GSC Sync</h3>
            <p className={styles.featureCardDesc}>
              Direct integration with Google Search Console and GA4 tracks actual impressions, clicks, and ranking shifts. The AI strategy engine automatically pivots content priorities based on what is actually moving the needle.
            </p>
          </div>
        </div>
      </section>

      {/* 6. HOW IT WORKS (design.md Section 12) */}
      <section id="how-it-works" className={styles.section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className={styles.sectionTag}>Workflow</div>
          <h2 className={styles.sectionTitle}>How It Works</h2>
          <p className={styles.sectionSubtitle} style={{ margin: '0 auto' }}>
            From initial connection to compounding rankings in six automated steps.
          </p>
        </div>

        <div className={styles.timelineList}>
          <div className={styles.timelineItem}>
            <div className={styles.timelineNumber}>01 / CONNECT</div>
            <div className={styles.timelineTitle}>Connect Your Website</div>
            <div className={styles.timelineDesc}>
              Enter your domain, business description, target audience, and optional CMS credentials in less than two minutes.
            </div>
          </div>

          <div className={styles.timelineItem}>
            <div className={styles.timelineNumber}>02 / ANALYZE</div>
            <div className={styles.timelineTitle}>Deep Site Audit</div>
            <div className={styles.timelineDesc}>
              RankAutonomous crawls your pages, evaluates site architecture, checks health, and pinpoints immediate SEO wins.
            </div>
          </div>

          <div className={styles.timelineItem}>
            <div className={styles.timelineNumber}>03 / STRATEGIZE</div>
            <div className={styles.timelineTitle}>Autonomous Growth Plan</div>
            <div className={styles.timelineDesc}>
              The AI maps keyword clusters, analyzes intent, and structures a priority roadmap of content and technical fixes.
            </div>
          </div>

          <div className={styles.timelineItem}>
            <div className={styles.timelineNumber}>04 / CREATE</div>
            <div className={styles.timelineTitle}>Publish-Ready Content</div>
            <div className={styles.timelineDesc}>
              AI produces rank-ready articles with structured headings, meta descriptions, word counts, and verified internal links.
            </div>
          </div>

          <div className={styles.timelineItem}>
            <div className={styles.timelineNumber}>05 / PUBLISH</div>
            <div className={styles.timelineTitle}>One-Click Publishing</div>
            <div className={styles.timelineDesc}>
              Publish directly to WordPress or Webflow, or review and approve articles inside our editorial writing workspace.
            </div>
          </div>

          <div className={styles.timelineItem}>
            <div className={styles.timelineNumber}>06 / GROW</div>
            <div className={styles.timelineTitle}>Compounding Momentum</div>
            <div className={styles.timelineDesc}>
              Monitor rising rankings, new backlinks, and traffic growth with automated monthly executive performance summaries.
            </div>
          </div>
        </div>
      </section>

      {/* 7. PRICING SECTION (design.md Section 13) */}
      <section id="pricing" className={styles.section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className={styles.sectionTag}>Pricing</div>
          <h2 className={styles.sectionTitle}>One Complete Plan</h2>
          <p className={styles.sectionSubtitle} style={{ margin: '0 auto' }}>
            Complete access to all AI engines, continuous crawling, keyword clustering, and daily publishing.
          </p>
        </div>

        <PricingTable userSession={!!session?.user} />
      </section>

      {/* 8. FAQ SECTION (design.md Section 14) */}
      <section id="faq" className={styles.section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className={styles.sectionTag}>FAQ</div>
          <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
          <p className={styles.sectionSubtitle} style={{ margin: '0 auto' }}>
            Everything you need to know about autonomous SEO, compatibility, and results.
          </p>
        </div>

        <div className={styles.faqGrid}>
          <div className={styles.faqCard}>
            <div className={styles.faqQuestion}>Which website platforms are supported?</div>
            <div className={styles.faqAnswer}>
              We offer direct 1-click automated publishing for WordPress (via standard REST API application passwords) and Webflow. We also support custom stacks via webhook connectors, CSV exports, or manual copying.
            </div>
          </div>

          <div className={styles.faqCard}>
            <div className={styles.faqQuestion}>Will AI-generated content actually rank on Google?</div>
            <div className={styles.faqAnswer}>
              Yes. Google Search documentation explicitly states that content quality and searcher helpfulness are what matter, regardless of how it is created. RankAutonomous builds content with deep intent matching, NLP entity context, and internal links.
            </div>
          </div>

          <div className={styles.faqCard}>
            <div className={styles.faqQuestion}>Can I review articles before they go live?</div>
            <div className={styles.faqAnswer}>
              Yes. You have full control. You can keep articles in &quot;User Review&quot; status inside our editorial workspace and approve them manually, or enable full autopilot publishing once you trust the output.
            </div>
          </div>

          <div className={styles.faqCard}>
            <div className={styles.faqQuestion}>How does the backlink engine operate?</div>
            <div className={styles.faqAnswer}>
              RankAutonomous discovers legitimate opportunities including relevant guest posts, resource roundups, industry directories, and unlinked brand mentions. We assist with personalized, spam-free outreach emails.
            </div>
          </div>

          <div className={styles.faqCard}>
            <div className={styles.faqQuestion}>What happens if real keyword metrics are unavailable?</div>
            <div className={styles.faqAnswer}>
              We believe in total data honesty. When third-party provider metrics are not connected or unavailable, we display &quot;Not available&quot; rather than fabricating vanity numbers.
            </div>
          </div>

          <div className={styles.faqCard}>
            <div className={styles.faqQuestion}>Can I cancel or change my plan anytime?</div>
            <div className={styles.faqAnswer}>
              Yes. All billing is handled securely through Stripe. You can upgrade, downgrade, or cancel your subscription at any time with zero long-term lock-in or cancellation penalties.
            </div>
          </div>
        </div>
      </section>

      {/* 9. BOTTOM CTA BANNER */}
      <section className={styles.bottomCtaBanner}>
        <div className={styles.sectionTag}>Get Started</div>
        <h2 className={styles.bottomCtaTitle}>
          Ready to put your SEO on autopilot?
        </h2>
        <p className={styles.bottomCtaDesc}>
          Join high-growth founders and marketing teams scaling organic search traffic with autonomous intelligence.
        </p>
        <Link href={primaryCtaHref} className={styles.primaryCta} style={{ fontSize: '17px', padding: '18px 44px' }}>
          <span>{primaryCtaLabel}</span>
        </Link>
      </section>
    </div>
  );
}
