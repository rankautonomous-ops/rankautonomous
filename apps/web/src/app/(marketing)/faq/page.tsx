import type { Metadata } from 'next';
import styles from '@/components/marketing/marketing.module.css';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description:
    'Answers to common questions regarding RankAutonomous: compatibility, AI content quality, automated CMS publishing, backlink discovery, and Stripe billing.',
};

export default function FAQPage() {
  const faqs = [
    {
      q: 'What exactly does RankAutonomous do?',
      a: 'RankAutonomous is an autonomous SEO engine. It continuously crawls your website, scores your technical health, discovers high-intent keywords, generates publish-ready articles, and identifies legitimate backlink prospects without manual effort.',
    },
    {
      q: 'Does AI-generated content actually rank on Google?',
      a: 'Yes. Google evaluates content based on its helpfulness, accuracy, and relevance rather than how it was produced. RankAutonomous analyzes top-ranking competitor entities, integrates internal links, and ensures articles answer search queries comprehensively.',
    },
    {
      q: 'Which CMS platforms do you support for automated publishing?',
      a: 'We offer native 1-click integration with WordPress (via standard Application Passwords) and Webflow. We also provide webhook connectors and clean Markdown/HTML exports for custom Jamstack or Next.js blogs.',
    },
    {
      q: 'Can I review drafts before they go live on my website?',
      a: 'Absolutely. Every article can be queued for manual user review in our editorial workspace. You can read the AI SEO critique, adjust headings, edit copy, and click Approve to trigger publishing.',
    },
    {
      q: 'How does backlink prospecting avoid link spam?',
      a: 'We strictly identify legitimate opportunities: contextual guest posting spots, resource roundups, industry directories, and unlinked brand mentions. We draft respectful, personalized outreach pitches tailored to your brand.',
    },
    {
      q: 'What is your cancellation and refund policy?',
      a: 'All plans are processed via Stripe with zero setup fees or locked contracts. You can cancel at any time from your account settings. If you cancel, your subscription will remain active until the end of your prepaid period.',
    },
  ];

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHero}>
        <h1 className={styles.pageTitle}>Frequently Asked Questions</h1>
        <p className={styles.pageSubtitle}>
          Everything you need to know about our autonomous SEO engine, workflow, and integrations.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', maxWidth: '1100px', margin: '0 auto' }}>
        {faqs.map((faq, idx) => (
          <div key={idx} className={styles.contentBlock} style={{ padding: '36px 32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '12px', letterSpacing: '-0.01em' }}>
              {faq.q}
            </h2>
            <p className={styles.prose} style={{ margin: 0, fontSize: '15px' }}>
              {faq.a}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
