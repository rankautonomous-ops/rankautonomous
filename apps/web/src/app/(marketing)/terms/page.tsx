import type { Metadata } from 'next';
import styles from '@/components/marketing/marketing.module.css';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for using the RankAutonomous AI SEO platform.',
};

export default function TermsPage() {
  return (
    <div className={styles.pageContainer}>
      <h1 className={styles.pageTitle}>Terms of Service</h1>
      <p className={styles.pageSubtitle}>Last updated: September 14, 2026</p>
      
      <div className={styles.contentBlock}>
        <div className={styles.prose}>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using the RankAutonomous service, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.
          </p>
          
          <h2>2. Description of Service</h2>
          <p>
            RankAutonomous provides search engine optimization (SEO) automation tools, including but not limited to technical analysis, AI content generation, and automated link discovery.
          </p>
          
          <h2>3. Subscriptions and Billing</h2>
          <p>
            You will be billed in advance on a recurring and periodic basis (monthly or annually) via Stripe. Your subscription automatically renews unless cancelled prior to the end of the current billing period.
          </p>
          
          <h2>4. Use of AI Generated Content</h2>
          <p>
            You retain all rights and ownership of the content generated through RankAutonomous using your specific inputs and connected sites. You are solely responsible for reviewing content prior to publication.
          </p>
          
          <h2>5. Limitation of Liability</h2>
          <p>
            RankAutonomous does not guarantee specific search engine rankings or traffic increases. Search algorithms change frequently, and our platform is designed to align with best practices, not manipulate search engines.
          </p>
        </div>
      </div>
    </div>
  );
}
