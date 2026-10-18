import styles from './loading.module.css';

export default function WorkspaceLoading() {
  return (
    <div className={styles.loadingContainer}>
      {/* 1. Header Skeleton */}
      <div className={styles.headerSkeleton}>
        <div className={styles.headerLeft}>
          <div className={`${styles.skeleton} ${styles.pillSkeleton}`} />
          <div className={`${styles.skeleton} ${styles.titleSkeleton}`} />
          <div className={`${styles.skeleton} ${styles.subtitleSkeleton}`} />
        </div>
        <div className={styles.headerControlsSkeleton}>
          <div className={`${styles.skeleton} ${styles.controlPill}`} />
          <div className={`${styles.skeleton} ${styles.controlPill}`} />
        </div>
      </div>

      {/* 2. Connection Status Indicator */}
      <div className={styles.statusCard}>
        <div className={styles.statusMessage}>
          <div className={styles.spinner} />
          <span>Connecting to your SEO command center &amp; database...</span>
        </div>
        <div className={`${styles.skeleton}`} style={{ width: '120px', height: '24px', borderRadius: '6px' }} />
      </div>

      {/* 3. Hero SEO Health Card Skeleton */}
      <div className={styles.heroCardSkeleton}>
        <div className={styles.heroTop}>
          <div>
            <div className={`${styles.skeleton}`} style={{ width: '140px', height: '16px', marginBottom: '12px' }} />
            <div className={styles.scoreGroup}>
              <div className={`${styles.skeleton} ${styles.scoreNumber}`} />
              <div className={`${styles.skeleton} ${styles.scorePill}`} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div className={`${styles.skeleton}`} style={{ width: '130px', height: '38px', borderRadius: '8px' }} />
            <div className={`${styles.skeleton}`} style={{ width: '150px', height: '38px', borderRadius: '8px' }} />
          </div>
        </div>
      </div>

      {/* 4. 4 Metric Cards Grid Skeleton */}
      <div className={styles.gridSkeleton}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.metricCardSkeleton}>
            <div className={`${styles.skeleton} ${styles.metricLabel}`} />
            <div className={`${styles.skeleton} ${styles.metricValue}`} />
            <div className={`${styles.skeleton}`} style={{ width: '80%', height: '14px', marginTop: '4px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
