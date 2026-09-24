'use client';

import React, { useState } from 'react';
import { Trash2, Settings, Loader2, Globe, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import styles from './integrations.module.css';

export default function CmsConnections({ websiteId, apiUrl, supabase }: any) {
  const [connections, setConnections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [newConnData, setNewConnData] = useState({ provider: 'WORDPRESS', name: '', baseUrl: '', username: '', token: '' });

  const fetchConnections = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/cms-connections`, {
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

      if (newConnData.provider === 'WORDPRESS') {
        payload.credentials = { username: newConnData.username, applicationPassword: newConnData.token };
      } else if (newConnData.provider === 'SHOPIFY') {
        payload.credentials = { accessToken: newConnData.token };
        payload.metadata = { blogId: '' }; // Will need UI to set
      } else if (newConnData.provider === 'WEBFLOW') {
        payload.credentials = { accessToken: newConnData.token };
        payload.metadata = { siteId: '', collectionId: '' };
      } else if (newConnData.provider === 'CUSTOM') {
        payload.credentials = { token: newConnData.token };
        payload.metadata = { authMethod: 'BEARER' };
      }

      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/cms-connections`, {
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
      setNewConnData({ provider: 'WORDPRESS', name: '', baseUrl: '', username: '', token: '' });
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
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/cms-connections/${id}/test`, {
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
      await fetch(`${apiUrl}/api/websites/${websiteId}/cms-connections/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      fetchConnections();
    } catch (err) {}
  };

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
            <p className={styles.cardDesc}>{c.baseUrl}</p>
            
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
                <option value="WORDPRESS">WordPress</option>
                <option value="SHOPIFY">Shopify</option>
                <option value="WEBFLOW">Webflow</option>
                <option value="CUSTOM">Custom Webhook</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Connection Name</label>
              <input 
                required
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                value={newConnData.name} onChange={e => setNewConnData({...newConnData, name: e.target.value})} 
                placeholder="e.g. My Main Blog" 
              />
            </div>

            {newConnData.provider !== 'WEBFLOW' && (
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

            {newConnData.provider === 'WORDPRESS' && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Username</label>
                <input 
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={newConnData.username} onChange={e => setNewConnData({...newConnData, username: e.target.value})} 
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {newConnData.provider === 'WORDPRESS' ? 'Application Password' : 'Access Token / API Key'}
              </label>
              <input 
                required
                type="password"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                value={newConnData.token} onChange={e => setNewConnData({...newConnData, token: e.target.value})} 
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" className={styles.primaryButton}>Save Connection</button>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsAdding(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
