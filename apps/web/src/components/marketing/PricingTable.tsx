'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './pricing.module.css';

interface PricingTableProps {
  userSession?: boolean;
}

export default function PricingTable({ userSession = false }: PricingTableProps) {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPlan = async () => {
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        // Redirect guest user to signup with selected plan
        router.push(`/signup?plan=${billingCycle}`);
        return;
      }

      // User is authenticated, initiate Stripe Checkout Session
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/api/billing/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan: billingCycle,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(data.message || 'Failed to create checkout session.');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err: any) {
      console.error('[Checkout Error]:', err);
      setError(err?.message || 'Unable to proceed to checkout. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className={styles.pricingContainer}>
      {/* Billing Cycle Toggle */}
      <div className={styles.toggleWrapper}>
        <div className={styles.togglePill}>
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            disabled={loading}
            className={`${styles.toggleButton} ${billingCycle === 'monthly' ? styles.toggleActive : ''}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            disabled={loading}
            className={`${styles.toggleButton} ${billingCycle === 'annual' ? styles.toggleActive : ''}`}
          >
            Annual
          </button>
        </div>
        <span className={styles.savingsBadge}>
          Save $600 / year
        </span>
      </div>

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      {/* Single Large Premium Plan Card */}
      <div className={styles.planCard}>
        <div className={styles.planBadge}>
          RankAutonomous Complete
        </div>

        <div className={styles.planHeader}>
          <h3 className={styles.planTitle}>
            Full AI SEO &amp; Content Engine
          </h3>
          <p className={styles.planSubtitle}>
            Continuous crawl, autonomous keyword research, daily publish-ready articles, and backlink discovery.
          </p>

          <div className={styles.priceRow}>
            <span className={styles.priceAmount}>
              {billingCycle === 'annual' ? '$149' : '$199'}
            </span>
            <span className={styles.pricePeriod}>
              / month {billingCycle === 'annual' && <span className={styles.priceBilledNote}>(billed $1,788/year)</span>}
            </span>
          </div>

          <div className={styles.billingNote}>
            {billingCycle === 'annual' ? (
              <span>Annual commitment, billed yearly. Save 25% with full autonomy.</span>
            ) : (
              <span>Flexible monthly subscription. Cancel anytime without lock-in.</span>
            )}
          </div>
        </div>

        <div className={styles.featuresList}>
          <div className={styles.featureItem}>
            <span className={styles.checkIcon}><Check size={16} /></span>
            <span><strong>Continuous Website Audit:</strong> 24/7 technical crawl &amp; SEO health score (0–100)</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkIcon}><Check size={16} /></span>
            <span><strong>Daily AI Articles:</strong> 1 rank-ready article generated daily (30 articles/month)</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkIcon}><Check size={16} /></span>
            <span><strong>Automated CMS Publishing:</strong> Direct sync to WordPress REST API &amp; Webflow</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkIcon}><Check size={16} /></span>
            <span><strong>Autonomous Keyword Strategy:</strong> Topic clusters, intent classification &amp; search opportunities</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkIcon}><Check size={16} /></span>
            <span><strong>Backlink Discovery Engine:</strong> Uncover guest posts, resource pages &amp; unlinked brand mentions</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkIcon}><Check size={16} /></span>
            <span><strong>AI Outreach Drafting:</strong> Personalized, policy-compliant outreach email generation</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkIcon}><Check size={16} /></span>
            <span><strong>Performance Sync:</strong> Google Search Console &amp; GA4 analytics integration</span>
          </div>
          <div className={styles.featureItem}>
            <span className={styles.checkIcon}><Check size={16} /></span>
            <span><strong>Monthly SEO Growth Reports:</strong> Actionable executive progress summaries</span>
          </div>
        </div>

        <div className={styles.actionWrapper}>
          <button
            type="button"
            onClick={handleSelectPlan}
            disabled={loading}
            className={styles.ctaButton}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Connecting to Checkout...</span>
              </>
            ) : (
              <>
                <span>Start Growing →</span>
              </>
            )}
          </button>
          <p className={styles.guaranteeText}>
            Secure Stripe checkout. No setup fees. 14-day money back guarantee.
          </p>
        </div>
      </div>
    </div>
  );
}
