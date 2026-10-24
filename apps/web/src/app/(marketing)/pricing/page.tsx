import type { Metadata } from 'next';
import styles from '@/components/marketing/marketing.module.css';
import PricingTable from '@/components/marketing/PricingTable';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Simple, transparent pricing for RankAutonomous: $149/month or $99/month equivalent billed annually ($1,188/yr). Put your SEO on continuous autopilot.',
};

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'RankAutonomous Complete',
    description:
      'Autonomous SEO and content automation engine: continuous crawls, keyword discovery, daily rank-ready articles, and backlink prospecting.',
    brand: {
      '@type': 'Brand',
      name: 'RankAutonomous',
    },
    offers: [
      {
        '@type': 'Offer',
        name: 'RankAutonomous Complete (Monthly)',
        price: '149.00',
        priceCurrency: 'USD',
        priceValidUntil: '2027-12-31',
        availability: 'https://schema.org/InStock',
        description: 'Flexible monthly subscription at $149/month. Cancel anytime.',
      },
      {
        '@type': 'Offer',
        name: 'RankAutonomous Complete (Annual)',
        price: '1188.00',
        priceCurrency: 'USD',
        priceValidUntil: '2027-12-31',
        availability: 'https://schema.org/InStock',
        description: '$1,188/year billed annually ($99/month equivalent). Saves $600/year.',
      },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How does the Annual discount work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Annual subscriptions are billed at $1,188 per year upfront ($99/month equivalent), saving you $600 compared to paying the $149/month monthly rate.',
        },
      },
      {
        '@type': 'Question',
        name: 'What payment gateway do you use?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We use Stripe for secure subscription processing. We support all major credit cards, Apple Pay, and Google Pay with enterprise-grade encryption.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I cancel my subscription anytime?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes, you can cancel your subscription at any time directly from your billing workspace. You will retain full access until the end of your billing cycle.',
        },
      },
    ],
  };

  return (
    <div className={styles.pageContainer}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
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
            Annual subscriptions are billed at $1,188 per year upfront ($99/month equivalent), saving you $600 compared to paying the $149/month monthly rate.
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
