import { createClient } from '../../../lib/supabase/server';
import BacklinksClient from './BacklinksClient';
import styles from '../app.module.css';

export default async function BacklinksPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  let activeWebsite = null;

  if (session?.access_token) {
    try {
      const apiUrl = process.env.API_URL || 'http://localhost:4000';
      const siteRes = await fetch(`${apiUrl}/api/websites/active`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      if (siteRes.ok) {
        const siteData = await siteRes.json();
        activeWebsite = siteData.website || null;
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (!activeWebsite) {
    return (
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Backlinks Pipeline</h1>
          <p className={styles.pageSubtitle}>Connect a website to manage backlink opportunities and tracking.</p>
        </div>
      </div>
    );
  }

  return (
    <BacklinksClient activeWebsite={activeWebsite} />
  );
}
