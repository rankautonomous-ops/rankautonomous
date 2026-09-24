import { Suspense } from 'react';
import ReportsDashboard from './ReportsDashboard';
import { createClient } from '../../../lib/supabase/server';
import { getApiUrl } from '../../../lib/api';

export default async function ReportsPage() {
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
      console.error('ReportsPage SSR active website fetch error:', e);
    }
  }

  return (
    <div style={{ padding: '0' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>SEO Reports</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Historical performance and advanced analytics for your website.
        </p>
      </header>

      <Suspense fallback={<div>Loading reports...</div>}>
        <ReportsDashboard initialWebsite={activeWebsite} />
      </Suspense>
    </div>
  );
}
