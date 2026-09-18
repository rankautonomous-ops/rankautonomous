import type { Metadata } from 'next';
import styles from '@/components/marketing/marketing.module.css';
import PricingTable from '@/components/marketing/PricingTable';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Simple, transparent pricing for RankAutonomous: $199/month or $149/month equivalent billed annually ($1,788/yr). Put your SEO on continuous autopilot.',
};

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHero}>
        <h1 className={styles.pageTitle}>Simple, Transparent Pricing</h1>
        <p className={styles.pageSubtitle}>
          One complete plan. Everything you need to automate your search engine optimization, content production, and backlink acquisition.
        </p>
      </div>

      <PricingTable userSession={!!session?.user} />

      <div
        className={styles.contentBlock}
        style={{
          marginTop: '64px',
          maxWidth: '820px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text)', marginBottom: '24px', letterSpacing: '-0.02em' }}>
          Frequently Asked Billing Questions
        </h3>
        <div className={styles.prose}>
          <p>
            <strong>What payment gateway do you use?</strong><br />
            We use Stripe for secure subscription processing. We support all major credit cards, Apple Pay, and Google Pay with enterprise-grade encryption.
          </p>
          <p>
            <strong>How does the Annual discount work?</strong><br />
            Annual subscriptions are billed at $1,788 per year upfront ($149/month equivalent), saving you $600 compared to paying the $199/month monthly rate.
          </p>
          <p>
            <strong>Can I cancel my subscription anytime?</strong><br />
            Yes, you can cancel your subscription at any time directly from your billing workspace. You will retain full access until the end of your billing cycle.
          </p>
        </div>
      </div>
    </div>
  );
}
