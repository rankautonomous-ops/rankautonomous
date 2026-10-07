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
  XCircle,
  Globe,
  Database,
  LineChart,
} from 'lucide-react';
import styles from '../page.module.css';
import { createClient } from '@/lib/supabase/server';
import PricingTable from '@/components/marketing/PricingTable';
import FreeAnalysisInput from '@/components/marketing/FreeAnalysisInput';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const primaryCtaHref = session?.user ? '/app' : '/signup';
  const primaryCtaLabel = session?.user ? 'Open Workspace' : 'Start Growing →';

  return (
    <div className={styles.container}>
      {/* 1. HERO SECTION */}
      <section className={styles.hero}>
        <div className={styles.aiBadge}>
          <Sparkles size={14} />
          <span>Autonomous SEO + AI Search Platform</span>
        </div>

        <h1 className={styles.title}>
          Improve your visibility across Google and AI search.
        </h1>

        <p className={styles.description}>
          RankAutonomous continuously analyzes, creates, publishes, and improves your organic growth strategy to help you get discovered where it matters.
        </p>

        <FreeAnalysisInput />

        <div className={styles.ctaGroup}>
          <a href="#how-it-works" className={styles.secondaryCta}>
            <span>See How It Works</span>
            <ArrowRight size={16} />
          </a>
        </div>

        {/* HERO PRODUCT VISUAL */}
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
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GET FOUND ON GOOGLE + AI SEARCH */}
      <section className={styles.section}>
        <div className={styles.aiSearchSection}>
          <div className={styles.aiSearchContent}>
            <div className={styles.sectionTag}>Generative Engine Optimization</div>
            <h2 className={styles.sectionTitle}>
              Get Found on Google + AI Search
            </h2>
            <p className={styles.sectionSubtitle}>
              Modern discovery happens everywhere. RankAutonomous ensures your website is technically structured and contextually rich enough to be understood by Google, ChatGPT, Claude, Perplexity, and Gemini.
            </p>
            <ul className={styles.aiSearchList}>
              <li><CheckCircle2 size={18} className={styles.checkIcon} /> Technical SEO &amp; Crawlability</li>
              <li><CheckCircle2 size={18} className={styles.checkIcon} /> Structured Content &amp; Entity Optimization</li>
              <li><CheckCircle2 size={18} className={styles.checkIcon} /> AI-Search Readiness</li>
              <li><CheckCircle2 size={18} className={styles.checkIcon} /> Continuous Keyword &amp; Topic Opportunities</li>
            </ul>
          </div>
        </div>
      </section>

      {/* PHILOSOPHY (Analyze -> Create -> Build -> Grow) */}
      <section className={styles.section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className={styles.sectionTag}>How RankAutonomous Works</div>
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
          </div>

          <div className={`${styles.philosophyCard} ${styles.philosophyCardAccent}`}>
            <div>
              <div className={styles.philosophyWord}>CREATE</div>
              <p className={styles.philosophyDesc}>
                Autonomous keyword discovery and research, semantic topic clustering, and daily publish-ready AI articles.
              </p>
            </div>
          </div>

          <div className={styles.philosophyCard}>
            <div>
              <div className={styles.philosophyWord}>BUILD</div>
              <p className={styles.philosophyDesc}>
                Automated CMS publishing, intelligent internal link mesh, and backlink target discovery with personalized outreach.
              </p>
            </div>
          </div>

          <div className={styles.philosophyCard}>
            <div>
              <div className={styles.philosophyWord}>GROW</div>
              <p className={styles.philosophyDesc}>
                Google Search Console sync, rank position monitoring, and continuous self-adjusting SEO recommendations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* AUTONOMOUS CONTENT ENGINE */}
      <section className={styles.section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className={styles.sectionTag}>Content Automation</div>
          <h2 className={styles.sectionTitle}>Autonomous Content Engine</h2>
          <p className={styles.sectionSubtitle} style={{ margin: '0 auto' }}>
            A unified SEO command center built for modern teams that demand compounding organic revenue.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          <div className={styles.featureCardLarge}>
            <div style={{ marginBottom: '16px' }}><FileText size={28} /></div>
            <h3 className={styles.featureCardTitle}>Create Content Plans &amp; Schedule Content</h3>
            <p className={styles.featureCardDesc}>
              The AI maps keyword clusters, analyzes search intent, and structures a priority roadmap of content. Generate AI articles complete with structured headings, meta descriptions, word counts, and verified internal links, ready to be reviewed and published.
            </p>
          </div>
          
          <div className={styles.featureCardSmall}>
            <div style={{ marginBottom: '16px' }}><Globe size={28} /></div>
            <h3 className={styles.featureCardTitle}>Publish Through Integrations</h3>
            <p className={styles.featureCardDesc}>
              Publish directly to WordPress or Webflow, or review and approve articles inside our editorial workspace. RankAutonomous continuously improves the SEO workflow based on performance data.
            </p>
          </div>
        </div>
      </section>

      {/* COMPARISONS */}
      <section className={styles.section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className={styles.sectionTag}>Comparisons</div>
          <h2 className={styles.sectionTitle}>Why Specialized SEO Matters</h2>
        </div>

        <div className={styles.comparisonGrid}>
          {/* vs ChatGPT */}
          <div className={styles.comparisonCard}>
            <h3 className={styles.comparisonTitle}>RankAutonomous vs ChatGPT</h3>
            <p className={styles.comparisonDesc}>
              ChatGPT is a general-purpose AI assistant. RankAutonomous is a specialized autonomous SEO/GEO platform connected to live data and your website infrastructure.
            </p>
            <ul className={styles.comparisonList}>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> Website crawling &amp; auditing</li>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> Live keyword &amp; competitor research</li>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> Direct CMS publishing</li>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> GSC/GA4 integration</li>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> Automated backlink discovery</li>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> Continuous performance monitoring</li>
            </ul>
          </div>

          {/* vs SEO Agency */}
          <div className={styles.comparisonCard}>
            <h3 className={styles.comparisonTitle}>RankAutonomous vs Traditional Agency</h3>
            <p className={styles.comparisonDesc}>
              Traditional agencies are constrained by human hours. RankAutonomous offers a scalable, data-driven approach to technical optimization and content production.
            </p>
            <ul className={styles.comparisonList}>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> Fraction of the monthly cost</li>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> 24/7 continuous SEO auditing</li>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> Daily content production at scale</li>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> Instant keyword &amp; competitor data</li>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> Automated, bias-free reporting</li>
              <li><CheckCircle2 size={16} className={styles.successIcon} /> Full transparency &amp; control</li>
            </ul>
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section className={styles.section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className={styles.sectionTag}>Integrations</div>
          <h2 className={styles.sectionTitle}>Connect Your Tech Stack</h2>
          <p className={styles.sectionSubtitle} style={{ margin: '0 auto' }}>
            Publish content seamlessly and sync analytics automatically.
          </p>
        </div>
        
        <div className={styles.integrationsGrid}>
          <div className={styles.integrationItem}>
            <Database size={24} />
            <span>WordPress</span>
            <div className={styles.integrationStatus}>Active</div>
          </div>
          <div className={styles.integrationItem}>
            <Database size={24} />
            <span>Webflow</span>
            <div className={styles.integrationStatus}>Active</div>
          </div>
          <div className={styles.integrationItem}>
            <LineChart size={24} />
            <span>Google Search Console</span>
            <div className={styles.integrationStatus}>Active</div>
          </div>
          <div className={styles.integrationItem}>
            <LineChart size={24} />
            <span>Google Analytics 4</span>
            <div className={styles.integrationStatus}>Active</div>
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section id="pricing" className={styles.section}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className={styles.sectionTag}>Pricing</div>
          <h2 className={styles.sectionTitle}>One Complete Plan</h2>
          <p className={styles.sectionSubtitle} style={{ margin: '0 auto' }}>
            Complete access to all AI engines, continuous crawling, keyword clustering, and daily publishing.
          </p>
          
          <div className={styles.trialPlaceholder}>
            <Sparkles size={16} />
            <span>New: 3-Day Trial for $1 (Coming Soon)</span>
          </div>
        </div>

        <PricingTable userSession={!!session?.user} />
      </section>

      {/* FAQ SECTION */}
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
            <div className={styles.faqQuestion}>Can I cancel or change my plan anytime?</div>
            <div className={styles.faqAnswer}>
              Yes. All billing is handled securely through Stripe. You can upgrade, downgrade, or cancel your subscription at any time with zero long-term lock-in or cancellation penalties.
            </div>
          </div>
        </div>
      </section>

      {/* BOTTOM CTA BANNER */}
      <section className={styles.bottomCtaBanner}>
        <div className={styles.sectionTag}>Get Started</div>
        <h2 className={styles.bottomCtaTitle}>
          Analyze Your Website Free
        </h2>
        <p className={styles.bottomCtaDesc}>
          Join high-growth founders and marketing teams scaling organic search traffic with autonomous intelligence.
        </p>
        <FreeAnalysisInput />
      </section>
    </div>
  );
}
