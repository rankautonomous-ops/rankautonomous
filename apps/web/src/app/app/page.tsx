import Link from 'next/link';
import {
  Globe,
  ArrowRight,
  Sparkles,
  Plus,
  ExternalLink,
  Bot,
  AlertTriangle,
  FileText,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { createClient } from '../../lib/supabase/server';
import CrawlProgress from './CrawlProgress';
import SeoAuditResults from './SeoAuditResults';
import SeoStrategyResults from './SeoStrategyResults';
import AttentionAuditAction from './AttentionAuditAction';
import styles from './app.module.css';

interface ApiMeResponse {
  user?: {
    id: string;
    supabaseAuthId: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: string;
  };
  error?: string;
  message?: string;
}

interface ActiveWebsiteResponse {
  website?: {
    id: string;
    url: string;
    name: string;
    platform: string | null;
    industry: string | null;
    targetCountry: string | null;
    targetAudience: string | null;
    description: string | null;
    seoGoals: string[];
    targetLocationType: string | null;
    targetRegion: string | null;
    targetCity: string | null;
    primaryKeywords: string[];
    status: string;
    createdAt: string;
    updatedAt: string;
    latestAudit?: {
      id: string;
      healthScore: number;
      status: string;
      summaryData?: any;
      createdAt: string;
    } | null;
    _count?: {
      keywords: number;
      seoAudits: number;
      integrations: number;
    };
  } | null;
  error?: string;
  message?: string;
}

export default async function AppDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let apiUser: ApiMeResponse | null = null;
  let activeWebsite: ActiveWebsiteResponse['website'] = null;
  let performanceData: any = null;
  let apiStatus = 'Connecting to backend API...';

  if (session?.access_token) {
    try {
      const apiUrl = process.env.API_URL || 'http://localhost:4000';

      // 1. Fetch user sync info
      const meRes = await fetch(`${apiUrl}/api/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      if (meRes.ok) {
        apiUser = await meRes.json();
        apiStatus = 'Successfully connected and synchronized with PostgreSQL/Prisma.';
      } else {
        const errData = await meRes.json().catch(() => ({}));
        apiStatus = `API response status ${meRes.status}: ${errData.message || 'Authorization failed'}`;
      }

      // 2. Fetch active website
      const siteRes = await fetch(`${apiUrl}/api/websites/active`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      if (siteRes.ok) {
        const siteData = await siteRes.json();
        activeWebsite = siteData.website || null;
        
        if (activeWebsite) {
          const perfRes = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/performance`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: 'no-store',
          });
          if (perfRes.ok) {
            performanceData = await perfRes.json();
          }
        }
      }
    } catch (err: any) {
      apiStatus = `Backend API offline or unreachable (${err?.message || 'Check if Node API is running on port 4000'}).`;
    }
  }

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'there';

  return (
    <div>
      {/* 1. TOP EDITORIAL GREETING (design.md Section 17) */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.greetingPrefix}>Overview</div>
          <h1 className={styles.pageTitle}>
            {greeting}, {userName}.
          </h1>
          <p className={styles.pageSubtitle}>
            Your SEO command center is analyzing and automating organic growth.
          </p>
        </div>

        <div className={styles.headerControls}>
          {activeWebsite && (
            <div className={styles.siteSelectPill}>
              <Globe size={14} />
              <span>{activeWebsite.name}</span>
            </div>
          )}
          <div className={styles.siteSelectPill} style={{ color: 'var(--text-secondary)' }}>
            Last 30 days
          </div>
        </div>
      </div>

      {/* 2. ONBOARDING PROMPT IF NO WEBSITE CONNECTED */}
      {!activeWebsite ? (
        <div className={styles.onboardingPromptCard}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Sparkles size={20} color="#8c423d" />
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Connect your website to activate SEO autopilot
              </h2>
            </div>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5', maxWidth: '640px' }}>
              Complete the guided setup to register your domain, select your target keywords, and launch your automated crawler audit.
            </p>
          </div>
          <div>
            <Link href="/app/onboarding" className={styles.primaryButton}>
              Start Setup →
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* 3. DOMINANT SEO HEALTH CARD (design.md Section 17 & Section 40 Data Integrity) */}
          <div className={styles.dominantHealthCard}>
            <div className={styles.healthCardTop}>
              <div>
                <div className={styles.healthCardLabel}>SEO Health Score</div>
                <div className={styles.healthScoreRow}>
                  <div className={styles.bigHealthScore}>
                    {activeWebsite.latestAudit && activeWebsite.latestAudit.status === 'COMPLETED' && typeof activeWebsite.latestAudit.healthScore === 'number'
                      ? activeWebsite.latestAudit.healthScore
                      : '—'}
                  </div>
                  <div className={styles.healthScoreTotal}>
                    {activeWebsite.latestAudit && activeWebsite.latestAudit.status === 'COMPLETED' ? '/ 100' : ''}
                  </div>
                  <div
                    className={styles.healthTrendPill}
                    style={
                      !activeWebsite.latestAudit || activeWebsite.latestAudit.status !== 'COMPLETED'
                        ? { background: 'var(--surface-soft)', color: 'var(--text-secondary)' }
                        : undefined
                    }
                  >
                    {activeWebsite.latestAudit && activeWebsite.latestAudit.status === 'COMPLETED'
                      ? 'Evaluated from crawl'
                      : 'Awaiting deep audit'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <a
                  href={activeWebsite.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.secondaryButton}
                  style={{ fontSize: '13px', padding: '8px 14px' }}
                >
                  Visit Site <ExternalLink size={13} />
                </a>
                <Link
                  href="/app/onboarding"
                  className={styles.secondaryButton}
                  style={{ fontSize: '13px', padding: '8px 14px' }}
                >
                  <Plus size={13} /> Connect Domain
                </Link>
              </div>
            </div>

            <div className={styles.categoryBreakdownGrid}>
              {(() => {
                const audit = activeWebsite.latestAudit;
                const isAuditCompleted = audit && audit.status === 'COMPLETED';
                const summaryArray = Array.isArray(audit?.summaryData) ? audit.summaryData : [];
                
                const getScore = (catName: string) => {
                  if (!isAuditCompleted) return '—';
                  const match = summaryArray.find((c: any) => c.category === catName);
                  if (!match || match.score === -1 || match.score === undefined) return '—';
                  return match.score;
                };

                return (
                  <>
                    <div className={styles.categoryItem}>
                      <span className={styles.categoryName}>Technical</span>
                      <span className={styles.categoryScore}>{getScore('Technical SEO')}</span>
                    </div>
                    <div className={styles.categoryItem}>
                      <span className={styles.categoryName}>On-Page</span>
                      <span className={styles.categoryScore}>{getScore('On-Page SEO')}</span>
                    </div>
                    <div className={styles.categoryItem}>
                      <span className={styles.categoryName}>Content Depth</span>
                      <span className={styles.categoryScore}>{getScore('Content Quality')}</span>
                    </div>
                    <div className={styles.categoryItem}>
                      <span className={styles.categoryName}>Internal Links</span>
                      <span className={styles.categoryScore}>{getScore('Internal Linking')}</span>
                    </div>
                    <div className={styles.categoryItem}>
                      <span className={styles.categoryName}>Performance</span>
                      <span className={styles.categoryScore}>{getScore('Performance')}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* 4. STAT CARDS (design.md Section 17 & Section 40 Data Integrity) */}
          <div style={{ marginBottom: '16px' }}>
            <h2 className={styles.cardTitle} style={{ padding: '0 4px', marginBottom: '12px' }}>SEO Performance</h2>
            <div className={styles.statsGrid}>
              
              {/* GSC STATS */}
              {performanceData?.searchConsole ? (
                <>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Organic Clicks</span>
                    {performanceData.searchConsole.clicks > 0 ? (
                      <div className={styles.statValue}>{performanceData.searchConsole.clicks.toLocaleString()}</div>
                    ) : (
                      <div className={styles.statUnavailable}>No data available yet</div>
                    )}
                    <span className={styles.statMeta}>Last 30 days</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Impressions</span>
                    {performanceData.searchConsole.impressions > 0 ? (
                      <div className={styles.statValue}>{performanceData.searchConsole.impressions.toLocaleString()}</div>
                    ) : (
                      <div className={styles.statUnavailable}>Waiting for Google data</div>
                    )}
                    <span className={styles.statMeta}>Last 30 days</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Avg CTR</span>
                    {performanceData.searchConsole.clicks > 0 ? (
                      <div className={styles.statValue}>{(performanceData.searchConsole.ctr * 100).toFixed(2)}%</div>
                    ) : (
                      <div className={styles.statUnavailable}>No data available yet</div>
                    )}
                    <span className={styles.statMeta}>Last 30 days</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Avg Position</span>
                    {performanceData.searchConsole.clicks > 0 ? (
                      <div className={styles.statValue}>{performanceData.searchConsole.averagePosition.toFixed(1)}</div>
                    ) : (
                      <div className={styles.statUnavailable}>No data available yet</div>
                    )}
                    <span className={styles.statMeta}>Last 30 days</span>
                  </div>
                </>
              ) : (
                <div className={styles.statCard} style={{ gridColumn: 'span 2' }}>
                  <span className={styles.statLabel}>Search Console Data</span>
                  <div className={styles.statUnavailable}>Not connected</div>
                  <span className={styles.statMeta}>
                    <Link href="/app/integrations" style={{ color: 'inherit', textDecoration: 'underline' }}>
                      Connect Google Search Console →
                    </Link>
                  </span>
                </div>
              )}

              {/* GA4 STATS */}
              {performanceData?.analytics ? (
                <>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Organic Sessions</span>
                    {performanceData.analytics.organicSessions > 0 ? (
                      <div className={styles.statValue}>{performanceData.analytics.organicSessions.toLocaleString()}</div>
                    ) : (
                      <div className={styles.statUnavailable}>No data available yet</div>
                    )}
                    <span className={styles.statMeta}>Last 30 days</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>Active Users</span>
                    {performanceData.analytics.activeUsers > 0 ? (
                      <div className={styles.statValue}>{performanceData.analytics.activeUsers.toLocaleString()}</div>
                    ) : (
                      <div className={styles.statUnavailable}>Waiting for Google data</div>
                    )}
                    <span className={styles.statMeta}>Last 30 days</span>
                  </div>
                </>
              ) : (
                <div className={styles.statCard} style={{ gridColumn: 'span 2' }}>
                  <span className={styles.statLabel}>Analytics Data</span>
                  <div className={styles.statUnavailable}>Not connected</div>
                  <span className={styles.statMeta}>
                    <Link href="/app/integrations" style={{ color: 'inherit', textDecoration: 'underline' }}>
                      Connect Google Analytics 4 →
                    </Link>
                  </span>
                </div>
              )}

            </div>
          </div>
          
          <div className={styles.statsGrid} style={{ marginBottom: '32px' }}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Target Keywords</span>
              <div className={styles.statValue}>
                {activeWebsite._count?.keywords || activeWebsite.primaryKeywords?.length || 0}
              </div>
              <span className={styles.statMeta}>
                <Link href="/app/keywords" style={{ color: 'inherit', textDecoration: 'underline' }}>
                  Explore keyword clusters →
                </Link>
              </span>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Content Pipeline</span>
              <div className={styles.statValue}>Ready</div>
              <span className={styles.statMeta}>
                <Link href="/app/content" style={{ color: 'inherit', textDecoration: 'underline' }}>
                  Open writing studio →
                </Link>
              </span>
            </div>
          </div>

          {/* 5. SPLIT ROW: WHAT NEEDS ATTENTION & AI ACTIVITY */}
          <div className={styles.dashboardSplitRow}>
            {/* What needs attention */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <AlertTriangle size={18} color="#c69752" />
                What Needs Attention
              </h2>
              <p className={styles.cardDescription} style={{ marginBottom: '20px' }}>
                Prioritized items to improve your domain search visibility.
              </p>

              <div className={styles.attentionList}>
                {session?.access_token ? (
                  <AttentionAuditAction
                    websiteId={activeWebsite.id}
                    token={session.access_token}
                    initialWebsiteStatus={activeWebsite.status}
                  />
                ) : (
                  <div className={styles.attentionItem}>
                    <div className={styles.attentionNumber}>01</div>
                    <div className={styles.attentionContent}>
                      <div className={styles.attentionTitle}>Run deep technical audit</div>
                      <div className={styles.attentionSub}>Evaluate site crawling, canonical tags, and status codes.</div>
                    </div>
                  </div>
                )}

                <div className={styles.attentionItem}>
                  <div className={styles.attentionNumber}>02</div>
                  <div className={styles.attentionContent}>
                    <div className={styles.attentionTitle}>Review seeded keyword strategy</div>
                    <div className={styles.attentionSub}>Verify search intent and target search volumes in Keyword Workspace.</div>
                  </div>
                </div>

                <div className={styles.attentionItem}>
                  <div className={styles.attentionNumber}>03</div>
                  <div className={styles.attentionContent}>
                    <div className={styles.attentionTitle}>Generate first AI article</div>
                    <div className={styles.attentionSub}>Draft high-relevance rank content inside Content Engine.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Activity */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                <Bot size={18} color="#8c423d" />
                AI Activity Feed
              </h2>
              <p className={styles.cardDescription} style={{ marginBottom: '20px' }}>
                Automated tasks performed by RankAutonomous engines.
              </p>

              <div className={styles.aiActivityList}>
                <div className={styles.aiActivityItem}>
                  <div className={styles.aiActivityIcon}><CheckCircle2 size={16} /></div>
                  <div>
                    <div className={styles.aiActivityTitle}>Website registered &amp; verified</div>
                    <div className={styles.aiActivityTime}>Platform: {activeWebsite.platform || 'Custom Web'}</div>
                  </div>
                </div>

                <div className={styles.aiActivityItem}>
                  <div className={styles.aiActivityIcon}><FileText size={16} /></div>
                  <div>
                    <div className={styles.aiActivityTitle}>Target keywords clustered</div>
                    <div className={styles.aiActivityTime}>{activeWebsite.primaryKeywords?.length || 0} primary keywords cataloged</div>
                  </div>
                </div>

                <div className={styles.aiActivityItem}>
                  <div className={styles.aiActivityIcon}><Activity size={16} /></div>
                  <div>
                    <div className={styles.aiActivityTitle}>Crawler ready for scheduling</div>
                    <div className={styles.aiActivityTime}>Domain: {activeWebsite.url}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 6. WORKING ENGINES: CRAWL, AUDIT, STRATEGY */}
          <div className={styles.card} id="diagnostics-section">
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>
                  <Activity size={20} />
                  Continuous Site Diagnostics
                </h2>
                <p className={styles.cardDescription}>
                  Real-time crawl execution, technical SEO audits, and AI strategy generation for {activeWebsite.name}.
                </p>
              </div>
            </div>

            {session?.access_token && (
              <>
                <CrawlProgress
                  websiteId={activeWebsite.id}
                  initialStatus={activeWebsite.status}
                  token={session.access_token}
                />
                <SeoAuditResults
                  websiteId={activeWebsite.id}
                  token={session.access_token}
                  crawlStatus={activeWebsite.status}
                />
                <SeoStrategyResults
                  websiteId={activeWebsite.id}
                  token={session.access_token}
                />
              </>
            )}
          </div>
        </>
      )}

      {/* 7. SYSTEM STATUS & AUTHENTICATION CARD */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          <span>⚙️</span> System Connectivity
        </h2>
        <div className={styles.infoGrid} style={{ marginTop: '16px' }}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Authenticated User</span>
            <span className={styles.infoValue}>{user?.email}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Database Sync</span>
            <span className={styles.infoValue} style={{ color: 'var(--success)' }}>
              Connected to PostgreSQL
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Active Domain</span>
            <span className={styles.infoValue}>{activeWebsite?.url || 'None connected'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Subscription Status</span>
            <span className={styles.infoValue}>
              <Link href="/app/billing" style={{ color: 'inherit', textDecoration: 'underline' }}>
                RankAutonomous Complete →
              </Link>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
