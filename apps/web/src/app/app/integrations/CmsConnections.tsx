'use client';

import React, { useState } from 'react';
import { Trash2, Settings, Loader2, Globe, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import styles from './integrations.module.css';
import { apiFetch } from '../../../lib/api';

const CMS_CATEGORIES = [
  {
    label: 'CMS / Website Platforms',
    options: [
      { value: 'WORDPRESS', label: 'WordPress', status: 'Available' },
      { value: 'WORDPRESS_COM', label: 'WordPress.com', status: 'Available' },
      { value: 'SHOPIFY', label: 'Shopify', status: 'Available' },
      { value: 'WEBFLOW', label: 'Webflow', status: 'Available' },
      { value: 'GHOST', label: 'Ghost', status: 'Requires configuration' },
      { value: 'NOTION', label: 'Notion', status: 'Requires configuration' },
      { value: 'WIX', label: 'Wix', status: 'Coming Soon' },
      { value: 'SQUARESPACE', label: 'Squarespace', status: 'Coming Soon' },
      { value: 'BIGCOMMERCE', label: 'BigCommerce', status: 'Coming Soon' },
      { value: 'DUDA', label: 'Duda', status: 'Coming Soon' },
      { value: 'HUBSPOT', label: 'HubSpot', status: 'Coming Soon' },
      { value: 'HIGHLEVEL', label: 'HighLevel', status: 'Coming Soon' },
      { value: 'FRAMER', label: 'Framer', status: 'Coming Soon' }
    ]
  },
  {
    label: 'Developer / Custom',
    options: [
      { value: 'NEXTJS', label: 'Next.js Blog', status: 'Available' },
      { value: 'WEBHOOK', label: 'Generic Webhook', status: 'Available' },
      { value: 'RSS', label: 'RSS Feed', status: 'Available' },
      { value: 'CUSTOM', label: 'Custom API', status: 'Available' }
    ]
  },
  {
    label: 'Other',
    options: [
      { value: 'LOVABLE', label: 'Lovable', status: 'Coming Soon' }
    ]
  }
];

export default function CmsConnections({ websiteId, apiUrl, supabase }: any) {
  const [connections, setConnections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [newConnData, setNewConnData] = useState({ 
    provider: 'WORDPRESS', 
    name: '', 
    baseUrl: '', 
    username: '', 
    token: '',
    authMethod: 'BEARER',
    databaseId: ''
  });

  const fetchConnections = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await apiFetch(`${apiUrl}/api/websites/${websiteId}/cms-connections`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (websiteId) fetchConnections();
  }, [websiteId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload: any = {
        provider: newConnData.provider,
        name: newConnData.name,
        baseUrl: newConnData.baseUrl,
        credentials: {}
      };

      if (['WORDPRESS', 'WORDPRESS_COM'].includes(newConnData.provider)) {
        payload.credentials = { username: newConnData.username, applicationPassword: newConnData.token };
      } else if (newConnData.provider === 'SHOPIFY') {
        payload.credentials = { accessToken: newConnData.token };
        payload.metadata = { blogId: '' };
      } else if (newConnData.provider === 'WEBFLOW') {
        payload.credentials = { accessToken: newConnData.token };
        payload.metadata = { siteId: '', collectionId: '' };
      } else if (newConnData.provider === 'GHOST') {
        payload.credentials = { adminApiKey: newConnData.token };
      } else if (newConnData.provider === 'NOTION') {
        payload.credentials = { integrationToken: newConnData.token };
        payload.metadata = { databaseId: newConnData.databaseId };
      } else if (['CUSTOM', 'WEBHOOK', 'NEXTJS'].includes(newConnData.provider)) {
        payload.credentials = { token: newConnData.token };
        payload.metadata = { authMethod: newConnData.authMethod };
      } else if (newConnData.provider === 'RSS') {
        // No credentials for RSS, just generating it locally
        payload.credentials = {};
        payload.metadata = {};
      }

      const res = await apiFetch(`${apiUrl}/api/websites/${websiteId}/cms-connections`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to add connection');
      }

      setSuccess('CMS Connection added.');
      setIsAdding(false);
      setNewConnData({ provider: 'WORDPRESS', name: '', baseUrl: '', username: '', token: '', authMethod: 'BEARER', databaseId: '' });
      fetchConnections();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTest = async (id: string) => {
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await apiFetch(`${apiUrl}/api/websites/${websiteId}/cms-connections/${id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Test failed');
      }

      setSuccess('Connection test successful.');
      fetchConnections();
    } catch (err: any) {
      setError(err.message);
      fetchConnections();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Disconnect this CMS?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await apiFetch(`${apiUrl}/api/websites/${websiteId}/cms-connections/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      fetchConnections();
    } catch (err) {}
  };

  const selectedProviderConfig = CMS_CATEGORIES.flatMap(c => c.options).find(o => o.value === newConnData.provider);
  const isComingSoon = selectedProviderConfig?.status === 'Coming Soon';
  const isRequiresConfig = selectedProviderConfig?.status === 'Requires configuration';

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Loader2 className={styles.spinner} size={32} /></div>;

  return (
    <div style={{ marginTop: '40px' }}>
      <div className={styles.header}>
        <h2 className={styles.title}>CMS Publishing Integrations</h2>
        <p className={styles.subtitle}>Connect platforms where RankAutonomous can publish articles.</p>
      </div>

      {error && (
        <div className={`${styles.alert} ${styles.error}`}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className={`${styles.alert} ${styles.success}`}>
          <CheckCircle2 size={20} />
          <span>{success}</span>
        </div>
      )}

      <div className={styles.grid}>
        {connections.map(c => (
          <div key={c.id} className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>
                <Globe size={24} />
              </div>
              <div className={`${styles.statusBadge} ${c.status === 'ERROR' ? styles.error : c.status === 'CONNECTED' ? styles.connected : styles.disconnected}`}>
                {c.status}
              </div>
            </div>
            
            <h2 className={styles.cardTitle}>{c.name} ({c.provider})</h2>
            <p className={styles.cardDesc}>{c.baseUrl || 'Managed locally'}</p>
            
            {c.lastError && (
              <p style={{ color: 'var(--error-500)', fontSize: '0.875rem', marginTop: '8px' }}>{c.lastError}</p>
            )}

            <div className={styles.cardActions}>
              <button className={styles.primaryButton} onClick={() => handleTest(c.id)}>Test</button>
              <button className={styles.dangerButton} onClick={() => handleDelete(c.id)}>Disconnect</button>
            </div>
          </div>
        ))}
        
        {!isAdding && (
          <div className={styles.card} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: '200px' }} onClick={() => setIsAdding(true)}>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              <Plus size={32} style={{ margin: '0 auto 8px' }} />
              <div>Add CMS Connection</div>
            </div>
          </div>
        )}
      </div>

      {isAdding && (
        <div className={styles.card} style={{ marginTop: '24px' }}>
          <h3>Add New CMS</h3>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Provider</label>
              <select 
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                value={newConnData.provider} 
                onChange={e => setNewConnData({...newConnData, provider: e.target.value})}
              >
                {CMS_CATEGORIES.map(category => (
                  <optgroup key={category.label} label={category.label}>
                    {category.options.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label} ({option.status})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {isComingSoon ? (
              <div style={{ padding: '16px', background: 'var(--surface-soft)', borderRadius: '8px', color: 'var(--text-secondary)' }}>
                This integration is coming soon and is currently being developed.
              </div>
            ) : (
              <>
                {isRequiresConfig && (
                   <div style={{ padding: '12px', background: 'rgba(255, 165, 0, 0.1)', color: '#d97706', borderRadius: '8px', fontSize: '0.875rem' }}>
                     This provider's architecture is built, but full publishing requires final manual setup and configuration. Connection validation may fail until setup is complete.
                   </div>
                )}
                
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Connection Name</label>
                  <input 
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    value={newConnData.name} onChange={e => setNewConnData({...newConnData, name: e.target.value})} 
                    placeholder="e.g. My Main Blog" 
                  />
                </div>

                {!['WEBFLOW', 'NOTION', 'RSS'].includes(newConnData.provider) && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {newConnData.provider === 'SHOPIFY' ? 'Store URL (e.g. mystore.myshopify.com)' : 'Base URL / Endpoint'}
                    </label>
                    <input 
                      required
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      value={newConnData.baseUrl} onChange={e => setNewConnData({...newConnData, baseUrl: e.target.value})} 
                      placeholder="https://..." 
                    />
                  </div>
                )}

                {['WORDPRESS', 'WORDPRESS_COM'].includes(newConnData.provider) && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Username</label>
                    <input 
                      required
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      value={newConnData.username} onChange={e => setNewConnData({...newConnData, username: e.target.value})} 
                    />
                  </div>
                )}

                {['WEBHOOK', 'NEXTJS', 'CUSTOM'].includes(newConnData.provider) && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Authentication Method</label>
                    <select
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      value={newConnData.authMethod} onChange={e => setNewConnData({...newConnData, authMethod: e.target.value})}
                    >
                      <option value="NONE">None</option>
                      <option value="BEARER">Bearer Token</option>
                      <option value="API_KEY">API Key Header</option>
                    </select>
                  </div>
                )}

                {newConnData.provider === 'NOTION' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Database ID</label>
                    <input 
                      required
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      value={newConnData.databaseId} onChange={e => setNewConnData({...newConnData, databaseId: e.target.value})} 
                      placeholder="e.g. e2a123..." 
                    />
                  </div>
                )}

                {newConnData.provider !== 'RSS' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {['WORDPRESS', 'WORDPRESS_COM'].includes(newConnData.provider) ? 'Application Password' : 
                       newConnData.provider === 'GHOST' ? 'Admin API Key' : 
                       newConnData.provider === 'NOTION' ? 'Integration Token' : 
                       'Access Token / API Key'}
                    </label>
                    <input 
                      required={newConnData.provider !== 'WEBHOOK' && newConnData.provider !== 'NEXTJS' && newConnData.provider !== 'CUSTOM' || newConnData.authMethod !== 'NONE'}
                      type="password"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                      value={newConnData.token} onChange={e => setNewConnData({...newConnData, token: e.target.value})} 
                    />
                  </div>
                )}

              </>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" className={styles.primaryButton} disabled={isComingSoon}>Save Connection</button>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsAdding(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
