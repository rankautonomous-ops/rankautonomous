import { createClient } from '../../../lib/supabase/server';
import BacklinksClient from './BacklinksClient';
import { getApiUrl } from '../../../lib/api';

export default async function BacklinksPage() {
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
      console.error('BacklinksPage SSR active website fetch error:', e);
    }
  }

  return (
    <BacklinksClient initialWebsite={activeWebsite} />
  );
}
