'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import styles from './integrations.module.css';
import { AlertCircle, BarChart3, CheckCircle2, Globe, Search, Trash2, Settings, Loader2 } from 'lucide-react';
import PropertySelectionModal from './PropertySelectionModal';
import CmsConnections from './CmsConnections';

function IntegrationsContent() {
  const [activeWebsite, setActiveWebsite] = useState<any>(null);
  const [isWebsiteLoading, setIsWebsiteLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [integrations, setIntegrations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal states
  const [isGSCModalOpen, setIsGSCModalOpen] = useState(false);
  const [isGA4ModalOpen, setIsGA4ModalOpen] = useState(false);

  const supabase = createClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    const fetchActiveWebsite = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        const siteRes = await fetch(`${apiUrl}/api/websites/active`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        
        if (siteRes.ok) {
          const siteData = await siteRes.json();
          setActiveWebsite(siteData.website || siteData);
        }
      } catch (err: any) {
        console.error('Failed to fetch website', err);
      } finally {
        setIsWebsiteLoading(false);
      }
    };
    fetchActiveWebsite();
  }, [supabase, apiUrl]);

  // Read URL params
  useEffect(() => {
    const errCode = searchParams.get('error');
    const connected = searchParams.get('connected');
    const provider = searchParams.get('provider');

    if (errCode) {
      setError(`OAuth failed: ${errCode}`);
      router.replace('/app/integrations', { scroll: false });
    } else if (connected === 'true') {
      const isGSC =
        provider === 'GOOGLE_SEARCH_CONSOLE' ||
        provider === 'SEARCH_CONSOLE';

      const isGA4 =
        provider === 'GOOGLE_ANALYTICS' ||
        provider === 'ANALYTICS';

      const pName = isGSC ? 'Google Search Console' : 
                    isGA4 ? 'Google Analytics' : 'Integration';
      setSuccessMsg(`${pName} connected successfully.`);
      
      if (isGSC) {
        setIsGSCModalOpen(true);
      } else if (isGA4) {
        setIsGA4ModalOpen(true);
      }
      
      router.replace('/app/integrations', { scroll: false });
    }
  }, [searchParams, router]);

  // Fetch Integrations
  const fetchIntegrations = async () => {
    if (!activeWebsite) return;
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${apiUrl}/api/integrations?websiteId=${activeWebsite.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations || []);
      }
    } catch (err) {
      console.error('Failed to load integrations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isWebsiteLoading && activeWebsite) {
      fetchIntegrations();
    }
  }, [isWebsiteLoading, activeWebsite]);

  // Handle Connect
  const handleConnect = async (provider: 'SEARCH_CONSOLE' | 'ANALYTICS') => {
    if (!activeWebsite) return;
    setError(null);
    setSuccessMsg(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const endpoint = provider === 'SEARCH_CONSOLE' 
        ? `${apiUrl}/api/integrations/google/search-console/connect?websiteId=${activeWebsite.id}`
        : `${apiUrl}/api/integrations/google/analytics/connect?websiteId=${activeWebsite.id}`;
        
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      
      if (res.ok && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error(data.message || 'Failed to initiate connection');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect. Please try again.');
    }
  };

  // Handle Disconnect
  const handleDisconnect = async (integrationId: string) => {
    if (!confirm('Are you sure you want to disconnect this integration?')) return;
    
    setError(null);
    setSuccessMsg(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${apiUrl}/api/integrations/${integrationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      
      if (res.ok) {
        setSuccessMsg('Integration disconnected successfully.');
        fetchIntegrations();
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Failed to disconnect');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while disconnecting.');
    }
  };

  if (isWebsiteLoading) {
    return (
      <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <Loader2 className={styles.spinner} size={32} color="var(--text-muted)" />
      </div>
    );
  }

  if (!activeWebsite) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Integrations</h1>
          <p className={styles.subtitle}>Connect your analytics and search platforms to give RankAutonomous real performance data.</p>
        </div>
        
        <div className={styles.emptyState}>
          <Globe size={48} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
          <h2 className={styles.emptyStateTitle}>No website connected yet</h2>
          <p className={styles.emptyStateDesc}>Complete your website setup before connecting Google integrations.</p>
          <Link href="/app/onboarding" className={styles.primaryButton}>
            Complete Setup
          </Link>
        </div>
      </div>
    );
  }

  const gscIntegration = integrations.find(
    i => i.provider === 'GOOGLE_SEARCH_CONSOLE' || i.provider === 'SEARCH_CONSOLE'
  );
  const ga4Integration = integrations.find(
    i => i.provider === 'GOOGLE_ANALYTICS' || i.provider === 'ANALYTICS'
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Integrations</h1>
        <p className={styles.subtitle}>Connect your analytics and search platforms to give RankAutonomous real performance data.</p>
      </div>

      {error && (
        <div className={`${styles.alert} ${styles.error}`}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className={`${styles.alert} ${styles.success}`}>
          <CheckCircle2 size={20} />
          <span>{successMsg}</span>
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 className={styles.spinner} size={32} color="var(--text-muted)" />
        </div>
      ) : (
        <div className={styles.grid}>
          {/* Search Console Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>
                <Search size={24} />
              </div>
              <div className={`${styles.statusBadge} ${gscIntegration ? (gscIntegration.status === 'ERROR' ? styles.error : styles.connected) : styles.disconnected}`}>
                {gscIntegration ? (gscIntegration.status === 'ERROR' ? 'Error' : 'Connected') : 'Not Connected'}
              </div>
            </div>
            
            <h2 className={styles.cardTitle}>Google Search Console</h2>
            <p className={styles.cardDesc}>Connect Search Console to track organic clicks, impressions, queries, pages, CTR, and average position.</p>
            
            {gscIntegration && (gscIntegration.config?.selectedProperty || gscIntegration.config?.siteUrl || gscIntegration.externalId) && (
              <div className={styles.propertyInfo}>
                <div className={styles.propertyLabel}>Selected Property</div>
                <div className={styles.propertyValue}>
                  {gscIntegration.config?.selectedProperty || gscIntegration.config?.siteUrl || gscIntegration.externalId}
                </div>
                {gscIntegration.lastSyncAt && (
                  <div className={styles.syncInfo}>
                    Last synced: {new Date(gscIntegration.lastSyncAt).toLocaleString()}
                  </div>
                )}
              </div>
            )}
            
            <div className={styles.cardActions}>
              {!gscIntegration ? (
                <button className={styles.primaryButton} onClick={() => handleConnect('SEARCH_CONSOLE')}>
                  Connect Search Console
                </button>
              ) : (
                <>
                  <button className={styles.secondaryButton} onClick={() => setIsGSCModalOpen(true)}>
                    <Settings size={16} />
                    Change Property
                  </button>
                  <button className={styles.dangerButton} onClick={() => handleDisconnect(gscIntegration.id)}>
                    <Trash2 size={16} />
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>

          {/* GA4 Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>
                <BarChart3 size={24} />
              </div>
              <div className={`${styles.statusBadge} ${ga4Integration ? (ga4Integration.status === 'ERROR' ? styles.error : styles.connected) : styles.disconnected}`}>
                {ga4Integration ? (ga4Integration.status === 'ERROR' ? 'Error' : 'Connected') : 'Not Connected'}
              </div>
            </div>
            
            <h2 className={styles.cardTitle}>Google Analytics</h2>
            <p className={styles.cardDesc}>Connect Google Analytics 4 to track organic traffic and website performance.</p>
            
            {ga4Integration && (ga4Integration.config?.selectedProperty || ga4Integration.config?.propertyId || ga4Integration.externalName || ga4Integration.externalId) && (
              <div className={styles.propertyInfo}>
                <div className={styles.propertyLabel}>Selected Property</div>
                <div className={styles.propertyValue}>
                  {ga4Integration.config?.selectedProperty || ga4Integration.config?.propertyId || ga4Integration.externalName || ga4Integration.externalId}
                </div>
                {(ga4Integration.config?.propertyId || ga4Integration.externalId) && (
                  <div className={styles.syncInfo}>
                    Property ID: {ga4Integration.config?.propertyId || ga4Integration.externalId}
                  </div>
                )}
              </div>
            )}
            
            <div className={styles.cardActions}>
              {!ga4Integration ? (
                <button className={styles.primaryButton} onClick={() => handleConnect('ANALYTICS')}>
                  Connect Google Analytics
                </button>
              ) : (
                <>
                  <button className={styles.secondaryButton} onClick={() => setIsGA4ModalOpen(true)}>
                    <Settings size={16} />
                    Change Property
                  </button>
                  <button className={styles.dangerButton} onClick={() => handleDisconnect(ga4Integration.id)}>
                    <Trash2 size={16} />
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <PropertySelectionModal
        isOpen={isGSCModalOpen}
        onClose={() => setIsGSCModalOpen(false)}
        title="Select Search Console Property"
        provider="SEARCH_CONSOLE"
        fetchUrl="/api/integrations/google/search-console/properties"
        submitUrl="/api/integrations/google/search-console/select-property"
        websiteId={activeWebsite?.id || ''}
        onSuccess={() => {
          setIsGSCModalOpen(false);
          setSuccessMsg('Search Console property selected successfully.');
          fetchIntegrations();
        }}
      />

      <PropertySelectionModal
        isOpen={isGA4ModalOpen}
        onClose={() => setIsGA4ModalOpen(false)}
        title="Select Google Analytics Property"
        provider="ANALYTICS"
        fetchUrl="/api/integrations/google/analytics/properties"
        submitUrl="/api/integrations/google/analytics/select-property"
        websiteId={activeWebsite?.id || ''}
        onSuccess={() => {
          setIsGA4ModalOpen(false);
          setSuccessMsg('Google Analytics property selected successfully.');
          fetchIntegrations();
        }}
      />

      {/* Render CMS Connections section below Analytics and GSC */}
      <CmsConnections websiteId={activeWebsite?.id} apiUrl={apiUrl} supabase={supabase} />
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center' }}><Loader2 className={styles.spinner} size={32} color="var(--text-muted)" /></div>}>
      <IntegrationsContent />
    </Suspense>
  );
}
