import { Suspense } from 'react';
import RecommendationsDashboard from './RecommendationsDashboard';
import { createClient } from '../../../lib/supabase/server';
import { getApiUrl } from '../../../lib/api';

export default async function RecommendationsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  let activeWebsite = null;

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
      }
    } catch (e) {
      console.error('RecommendationsPage SSR active website fetch error:', e);
    }
  }

  return (
    <div style={{ padding: '0' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>SEO Recommendations</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          A centralized engine prioritizing all your SEO tasks by impact and effort.
        </p>
      </header>

      <Suspense fallback={<div>Loading recommendations...</div>}>
        <RecommendationsDashboard initialWebsite={activeWebsite} />
      </Suspense>
    </div>
  );
}
