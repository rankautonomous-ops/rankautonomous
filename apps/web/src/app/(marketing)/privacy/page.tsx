import type { Metadata } from 'next';
import styles from '@/components/marketing/marketing.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy and data collection practices for RankAutonomous.',
};

export default function PrivacyPage() {
  return (
    <div className={styles.pageContainer}>
      <h1 className={styles.pageTitle}>Privacy Policy</h1>
      <p className={styles.pageSubtitle}>Last updated: September 14, 2026</p>
      
      <div className={styles.contentBlock}>
        <div className={styles.prose}>
          <h2>1. Information We Collect</h2>
          <p>
            We collect information you provide directly to us when you create an account, subscribe to our service, or communicate with us. This includes your name, email address, and billing information.
          </p>
          <p>
            We also collect data about the websites you connect to RankAutonomous for the purpose of providing our SEO services.
          </p>
          
          <h2>2. How We Use Your Information</h2>
          <p>
            We use the information we collect to provide, maintain, and improve our services, to process transactions, and to send you related information including confirmations and invoices.
          </p>
          
          <h2>3. Data Storage and Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your personal data against unauthorized or unlawful processing, accidental loss, destruction, or damage.
          </p>
          
          <h2>4. Third-Party Services</h2>
          <p>
            We use third-party services for payment processing (Stripe) and authentication (Supabase). These services have their own privacy policies governing how they handle your data.
          </p>
          
          <h2>5. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us at privacy@rankautonomous.com.
          </p>
        </div>
      </div>
    </div>
  );
}
