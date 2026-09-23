import { createClient } from '../../../lib/supabase/server';
import PerformanceClient from './PerformanceClient';
import { getApiUrl } from '../../../lib/api';
import styles from '../app.module.css';

export default async function PerformancePage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  let activeWebsite = null;
  let performanceData = null;

  if (session?.access_token) {
    try {
      const apiUrl = getApiUrl();
      const siteRes = await fetch(`${apiUrl}/api/websites/active`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      if (siteRes.ok) {
        const siteData = await siteRes.json();
        activeWebsite = siteData.website || null;

        if (activeWebsite) {
          const perfRes = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/performance`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          });
          if (perfRes.ok) {
            performanceData = await perfRes.json();
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (!activeWebsite) {
    return (
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Performance</h1>
          <p className={styles.pageSubtitle}>Connect a website to view Google performance metrics.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.greetingPrefix}>Analytics</div>
          <h1 className={styles.pageTitle}>Performance Dashboard</h1>
          <p className={styles.pageSubtitle}>
            Real-time insights from Google Search Console and Google Analytics 4.
          </p>
        </div>
      </div>
      
      <PerformanceClient 
        websiteId={activeWebsite.id} 
        initialData={performanceData} 
        token={session?.access_token || ''}
      />
    </div>
  );
}
