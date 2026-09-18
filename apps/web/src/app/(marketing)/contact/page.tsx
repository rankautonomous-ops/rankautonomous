import type { Metadata } from 'next';
import styles from '@/components/marketing/marketing.module.css';
import { Mail, MessageSquare } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Get in touch with the RankAutonomous team for general inquiries, technical support, or enterprise partnerships.',
};

export default function ContactPage() {
  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHero}>
        <h1 className={styles.pageTitle}>Contact Us</h1>
        <p className={styles.pageSubtitle}>
          We are here to support your team in scaling organic traffic with autonomous search intelligence.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '28px', maxWidth: '840px', margin: '0 auto' }}>
        <div className={styles.contentBlock}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-soft)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', color: 'var(--text)' }}>
            <Mail size={24} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)', marginBottom: '12px', letterSpacing: '-0.01em' }}>
            Customer Support
          </h2>
          <p className={styles.prose} style={{ marginBottom: '18px' }}>
            For onboarding questions, billing inquiries, or technical support with integrations:
          </p>
          <a href="mailto:support@rankautonomous.com" style={{ color: 'var(--text)', fontWeight: '600', textDecoration: 'underline' }}>
            support@rankautonomous.com
          </a>
        </div>

        <div className={styles.contentBlock}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-soft)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', color: '#8c423d' }}>
            <MessageSquare size={24} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)', marginBottom: '12px', letterSpacing: '-0.01em' }}>
            Partnerships &amp; Inquiries
          </h2>
          <p className={styles.prose} style={{ marginBottom: '18px' }}>
            Interested in multi-domain setups, agency volume plans, or affiliate opportunities:
          </p>
          <a href="mailto:partners@rankautonomous.com" style={{ color: 'var(--text)', fontWeight: '600', textDecoration: 'underline' }}>
            partners@rankautonomous.com
          </a>
        </div>
      </div>
    </div>
  );
}
