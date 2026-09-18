import { Suspense } from 'react';
import ContentDashboard from './ContentDashboard';
import styles from './content.module.css';

export default function ContentPage() {
  return (
    <div className={styles.contentContainer}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Content Engine</h1>
        <p className={styles.pageSubtitle}>
          Your AI publishing workspace. Move ideas to drafts, run deep AI critiques, review outlines, and publish to connected CMS platforms.
        </p>
      </header>

      <Suspense fallback={<div>Loading content workspace...</div>}>
        <ContentDashboard />
      </Suspense>
    </div>
  );
}
