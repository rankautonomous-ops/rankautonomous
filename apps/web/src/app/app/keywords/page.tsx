'use client';

import { Suspense } from 'react';
import KeywordWorkspace from './KeywordWorkspace';
import styles from './keywords.module.css';

export default function KeywordsPage() {
  return (
    <div className={styles.workspaceContainer}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Keyword Research</h1>
        <p className={styles.pageSubtitle}>
          Discover, categorize, and target high-opportunity search queries. When live third-party metrics are not connected, metrics display as <em>Not available</em>.
        </p>
      </header>

      <Suspense fallback={<div className={styles.card}>Loading keyword workspace...</div>}>
        <KeywordWorkspace />
      </Suspense>
    </div>
  );
}
