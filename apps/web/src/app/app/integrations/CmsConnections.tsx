'use client';

import React, { useState } from 'react';
import { Trash2, Settings, Loader2, Globe, Plus, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import styles from './integrations.module.css';
import { apiFetch } from '../../../lib/api';

const CMS_CATEGORIES = [
  {
    label: 'Direct Publishing APIs',
    options: [
      { value: 'WORDPRESS', label: 'WordPress', status: 'Direct API', type: 'direct' },
      { value: 'WORDPRESS_COM', label: 'WordPress.com', status: 'Direct API (Creator/Business Plan)', type: 'direct' },
      { value: 'SHOPIFY', label: 'Shopify', status: 'Direct API', type: 'direct' },
      { value: 'WEBFLOW', label: 'Webflow', status: 'Direct API', type: 'direct' },
      { value: 'GHOST', label: 'Ghost', status: 'Direct API', type: 'direct' },
      { value: 'NOTION', label: 'Notion', status: 'Direct API', type: 'direct' },
      { value: 'WIX', label: 'Wix', status: 'Direct API', type: 'direct' },
      { value: 'BIGCOMMERCE', label: 'BigCommerce', status: 'Direct API', type: 'direct' },
      { value: 'DUDA', label: 'Duda', status: 'Direct API', type: 'direct' },
      { value: 'HUBSPOT', label: 'HubSpot', status: 'Direct API', type: 'direct' },
      { value: 'HIGHLEVEL', label: 'HighLevel', status: 'Direct API', type: 'direct' },
    ]
  },
  {
    label: 'Webhook & Automation Bridges',
    options: [
      { value: 'SQUARESPACE', label: 'Squarespace', status: 'Webhook / Automation Bridge', type: 'bridge' },
      { value: 'FRAMER', label: 'Framer', status: 'Framer CMS Sync Bridge', type: 'bridge' },
      { value: 'LOVABLE', label: 'Lovable', status: 'Lovable App Endpoint', type: 'bridge' },
    ]
  },
  {
    label: 'Developer & Custom Feeds',
    options: [
      { value: 'NEXTJS', label: 'Next.js Blog', status: 'Webhook / API Route', type: 'custom' },
      { value: 'WEBHOOK', label: 'Generic Webhook', status: 'HTTP Dispatch', type: 'custom' },
      { value: 'RSS', label: 'RSS Feed', status: 'Autonomous Feed', type: 'custom' },
      { value: 'CUSTOM', label: 'Custom API', status: 'Custom Endpoint', type: 'custom' },
    ]
  }
];

export default function CmsConnections({ websiteId, apiUrl, supabase }: any) {
  const [connections, setConnections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [newConnData, setNewConnData] = useState({ 
    provider: 'WORDPRESS', 
    name: '', 
    baseUrl: '', 
    username: '', 
    token: '',
    authMethod: 'BEARER',
    databaseId: '',
    siteId: '',
    storeHash: '',
    clientId: '',
    locationId: '',
    blogId: '',
    collectionName: '',
    titleProperty: '',
    statusProperty: '',
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
        credentials: {},
        metadata: {}
      };

      if (['WORDPRESS', 'WORDPRESS_COM'].includes(newConnData.provider)) {
        payload.credentials = { username: newConnData.username, applicationPassword: newConnData.token };
      } else if (newConnData.provider === 'SHOPIFY') {
        payload.credentials = { accessToken: newConnData.token };
        payload.metadata = { blogId: newConnData.blogId || '' };
      } else if (newConnData.provider === 'WEBFLOW') {
        payload.credentials = { accessToken: newConnData.token };
        payload.metadata = { siteId: newConnData.siteId, collectionId: newConnData.databaseId };
      } else if (newConnData.provider === 'GHOST') {
        payload.credentials = { adminApiKey: newConnData.token };
      } else if (newConnData.provider === 'NOTION') {
        payload.credentials = { integrationToken: newConnData.token };
        payload.metadata = { 
          databaseId: newConnData.databaseId,
          titleProperty: newConnData.titleProperty?.trim() || undefined,
          statusProperty: newConnData.statusProperty?.trim() || undefined,
        };
      } else if (newConnData.provider === 'WIX') {
        payload.credentials = { apiKey: newConnData.token, siteId: newConnData.siteId };
        payload.metadata = { siteId: newConnData.siteId };
      } else if (newConnData.provider === 'SQUARESPACE') {
        payload.credentials = { secretToken: newConnData.token };
        payload.metadata = { webhookUrl: newConnData.baseUrl };
      } else if (newConnData.provider === 'BIGCOMMERCE') {
        payload.credentials = { accessToken: newConnData.token, clientId: newConnData.clientId, storeHash: newConnData.storeHash };
        payload.metadata = { storeHash: newConnData.storeHash, clientId: newConnData.clientId };
      } else if (newConnData.provider === 'DUDA') {
        payload.credentials = { username: newConnData.username, password: newConnData.token, siteName: newConnData.siteId };
        payload.metadata = { siteName: newConnData.siteId };
      } else if (newConnData.provider === 'HUBSPOT') {
        payload.credentials = { accessToken: newConnData.token };
        payload.metadata = { contentGroupId: newConnData.blogId };
      } else if (newConnData.provider === 'HIGHLEVEL') {
        payload.credentials = { accessToken: newConnData.token, locationId: newConnData.locationId };
        payload.metadata = { locationId: newConnData.locationId, blogId: newConnData.blogId };
      } else if (newConnData.provider === 'FRAMER') {
        payload.credentials = { accessToken: newConnData.token };
        payload.metadata = { collectionName: newConnData.collectionName || 'Blog', webhookUrl: newConnData.baseUrl };
      } else if (newConnData.provider === 'LOVABLE') {
        payload.credentials = { secretToken: newConnData.token };
        payload.metadata = { endpointUrl: newConnData.baseUrl };
      } else if (['CUSTOM', 'WEBHOOK', 'NEXTJS'].includes(newConnData.provider)) {
        payload.credentials = { token: newConnData.token };
        payload.metadata = { authMethod: newConnData.authMethod };
      } else if (newConnData.provider === 'RSS') {
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
      setNewConnData({ 
        provider: 'WORDPRESS', 
        name: '', 
        baseUrl: '', 
        username: '', 
        token: '', 
        authMethod: 'BEARER', 
        databaseId: '',
        siteId: '',
        storeHash: '',
        clientId: '',
        locationId: '',
        blogId: '',
        collectionName: '',
        titleProperty: '',
        statusProperty: '',
      });
      fetchConnections();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTest = async (id: string) => {
    setError(null);
    setSuccess(null);
    setTestingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await apiFetch(`${apiUrl}/api/websites/${websiteId}/cms-connections/${id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.message || resData.error || 'Connection test failed');
      }

      setSuccess(resData.message || 'Connection test successful.');
      fetchConnections();
    } catch (err: any) {
      setError(err.message || 'Connection test failed');
      fetchConnections();
    } finally {
      setTestingId(null);
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

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Loader2 className={styles.spinner} size={32} /></div>;

  return (
    <div style={{ marginTop: '40px' }}>
      <div className={styles.header}>
        <h2 className={styles.title}>CMS Publishing Integrations</h2>
        <p className={styles.subtitle}>Connect 18 supported publishing targets to distribute autonomous SEO articles.</p>
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
            <p className={styles.cardDesc}>{c.baseUrl || 'Managed configuration'}</p>
            
            {c.lastError && (
              <p style={{ color: 'var(--error-500)', fontSize: '0.875rem', marginTop: '8px' }}>{c.lastError}</p>
            )}

            <div className={styles.cardActions}>
              <button 
                className={styles.primaryButton} 
                onClick={() => handleTest(c.id)}
                disabled={testingId === c.id}
              >
                {testingId === c.id ? (
                  <>
                    <Loader2 className={styles.spinner} size={14} style={{ display: 'inline', marginRight: '6px' }} />
                    Testing...
                  </>
                ) : 'Test'}
              </button>
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
          <h3>Add New CMS Connection</h3>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Platform / Integration</label>
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

            {newConnData.provider === 'WIX' && (
              <div style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600, color: '#2563eb' }}>
                  <Info size={18} />
                  <span>Wix Blog Direct REST API Setup Guide</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>1. How to get your Wix Site ID:</strong> Open your Wix site dashboard in your browser. The Site ID is the UUID in your URL bar right after <code>/dashboard/</code> (for example: <code>https://www.wix.com/dashboard/<strong>12345678-abcd-ef01-2345-6789abcdef01</strong>/home</code>).
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>2. How to generate your Wix API Key:</strong> In your Wix Account, navigate to <strong>Account Settings</strong> &gt; <strong>API Keys Manager</strong>. Click <strong>Generate API Key</strong>, name it &quot;RankAutonomous&quot;, and grant the <strong>Wix Blog &gt; Manage Blog</strong> (<code>wix.blog.manage</code>) permission scope for your site.
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>3. Draft-First Architecture:</strong> To safeguard your live site, articles are created as Drafts on Wix first. They are published live only after passing RankAutonomous approval.
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>4. Scheduling Note:</strong> Wix Blog REST API v3 does not support a native programmatic future scheduling date. Scheduled articles are saved as Drafts on Wix and published live at your scheduled time by the RankAutonomous autonomous scheduler.
                  </div>
                </div>
              </div>
            )}

            {newConnData.provider === 'WORDPRESS_COM' && (
              <div style={{ padding: '16px', background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)', borderRadius: '8px', fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600, color: '#ca8a04' }}>
                  <Info size={18} />
                  <span>WordPress.com Plan Requirements &amp; Setup Guide</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>1. Creator or Business Plan Required:</strong> Hosted WordPress.com requires a <strong style={{ color: '#ca8a04' }}>Creator or Business plan</strong> (or higher) to enable REST API Application Passwords and custom developer tools. Free, Personal, and Premium plans do not permit REST API password authentication.
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>2. Generate Application Password:</strong> In your WordPress.com WP-Admin dashboard (e.g. <code>yoursite.wordpress.com/wp-admin</code>), go to <strong>Users</strong> &gt; <strong>Profile</strong>. Scroll to <strong>Application Passwords</strong>, enter &quot;RankAutonomous&quot;, click <strong>Add New Application Password</strong>, and paste the generated 24-character key below.
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>3. Self-Hosted WordPress:</strong> If your blog is hosted on your own server or hosting provider (Hostinger, AWS, DigitalOcean, Siteground, etc.), select the <strong style={{ color: 'var(--text-primary)' }}>WordPress</strong> platform option instead.
                  </div>
                </div>
              </div>
            )}

            {newConnData.provider === 'NOTION' && (
              <div style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600, color: '#2563eb' }}>
                  <Info size={18} />
                  <span>Notion Database Integration Guide</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>1. Internal Integration Secret:</strong> Create an internal integration in <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>Notion Developers</a> and paste the Internal Integration Secret in the token field below.
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>2. Connect Integration to Database:</strong> In Notion, navigate to your destination Database page, click the <strong>&bull;&bull;&bull;</strong> menu in the upper right &gt; <strong>Connect to</strong> &gt; select your integration.
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-primary)' }}>3. Database Properties:</strong> RankAutonomous syncs article title, status, and full rich-text body blocks. By default, it maps to <code>Name</code> (Title) and <code>Status</code> (Select or Status). Custom column names can be specified below.
                  </div>
                </div>
              </div>
            )}

            {newConnData.provider === 'SQUARESPACE' && (
              <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: '8px', fontSize: '0.875rem', display: 'flex', gap: '8px' }}>
                <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Squarespace Automation Bridge:</strong> Squarespace does not provide an official public REST API for direct blog post creation. Enter your Squarespace Zapier, Make, or custom automation webhook URL below to ingest articles automatically.
                </span>
              </div>
            )}

            {newConnData.provider === 'FRAMER' && (
              <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: '8px', fontSize: '0.875rem', display: 'flex', gap: '8px' }}>
                <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Framer CMS Sync Bridge:</strong> Framer requires synchronization via a headless CMS sync webhook or bridge worker. Enter your Framer CMS sync endpoint URL below.
                </span>
              </div>
            )}

            {newConnData.provider === 'LOVABLE' && (
              <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: '8px', fontSize: '0.875rem', display: 'flex', gap: '8px' }}>
                <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Lovable App Endpoint:</strong> Lovable generates custom React/Supabase web applications. Provide your Lovable application API endpoint or Supabase Edge Function URL to receive published articles.
                </span>
              </div>
            )}

            {newConnData.provider === 'RSS' && (
              <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '8px', fontSize: '0.875rem', display: 'flex', gap: '8px' }}>
                <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Autonomous RSS Feed:</strong> Generates a standard RSS 2.0 XML feed of your published articles automatically without requiring external API credentials.
                </span>
              </div>
            )}

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Connection Name</label>
              <input 
                required
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                value={newConnData.name} onChange={e => setNewConnData({...newConnData, name: e.target.value})} 
                placeholder={newConnData.provider === 'WIX' ? 'e.g. My Production Wix Blog' : 'e.g. My Production Blog'} 
              />
            </div>

            {/* Base URL or Endpoint */}
            {!['WEBFLOW', 'NOTION', 'RSS'].includes(newConnData.provider) && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {newConnData.provider === 'SHOPIFY' ? 'Store URL (e.g. mystore.myshopify.com)' : 
                   ['SQUARESPACE', 'FRAMER', 'LOVABLE', 'WEBHOOK', 'NEXTJS', 'CUSTOM'].includes(newConnData.provider) ? 'Webhook / Endpoint URL' : 
                   newConnData.provider === 'WIX' ? 'Website URL (e.g. https://mywixsite.com)' :
                   'Base URL / Website URL'}
                </label>
                <input 
                  required={newConnData.provider !== 'WIX'}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={newConnData.baseUrl} onChange={e => setNewConnData({...newConnData, baseUrl: e.target.value})} 
                  placeholder={newConnData.provider === 'SHOPIFY' ? 'store.myshopify.com' : newConnData.provider === 'WIX' ? 'https://yourwixsite.com' : 'https://...'} 
                />
              </div>
            )}

            {/* Username / API User */}
            {['WORDPRESS', 'WORDPRESS_COM', 'DUDA'].includes(newConnData.provider) && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {newConnData.provider === 'DUDA' ? 'Duda API Username' : 'Username'}
                </label>
                <input 
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={newConnData.username} onChange={e => setNewConnData({...newConnData, username: e.target.value})} 
                  placeholder="admin"
                />
              </div>
            )}

            {/* Site / Location / Database Identifiers */}
            {newConnData.provider === 'WIX' && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Wix Site ID (MetaSite ID)</label>
                <input 
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={newConnData.siteId} onChange={e => setNewConnData({...newConnData, siteId: e.target.value})} 
                  placeholder="e.g. 12345678-abcd-ef01-2345-6789abcdef01" 
                />
              </div>
            )}

            {newConnData.provider === 'BIGCOMMERCE' && (
              <>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Store Hash</label>
                  <input 
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    value={newConnData.storeHash} onChange={e => setNewConnData({...newConnData, storeHash: e.target.value})} 
                    placeholder="e.g. abc123def" 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Client ID</label>
                  <input 
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    value={newConnData.clientId} onChange={e => setNewConnData({...newConnData, clientId: e.target.value})} 
                    placeholder="e.g. 7q8z..." 
                  />
                </div>
              </>
            )}

            {newConnData.provider === 'DUDA' && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Duda Site Name / Alias</label>
                <input 
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={newConnData.siteId} onChange={e => setNewConnData({...newConnData, siteId: e.target.value})} 
                  placeholder="e.g. my-site-alias" 
                />
              </div>
            )}

            {newConnData.provider === 'HIGHLEVEL' && (
              <>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Location ID (Sub-Account ID)</label>
                  <input 
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    value={newConnData.locationId} onChange={e => setNewConnData({...newConnData, locationId: e.target.value})} 
                    placeholder="e.g. ve91tXO2pzda..." 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Blog ID (Optional)</label>
                  <input 
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    value={newConnData.blogId} onChange={e => setNewConnData({...newConnData, blogId: e.target.value})} 
                    placeholder="Leave blank for default blog" 
                  />
                </div>
              </>
            )}

            {newConnData.provider === 'HUBSPOT' && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Content Group ID (Blog ID - Optional)</label>
                <input 
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={newConnData.blogId} onChange={e => setNewConnData({...newConnData, blogId: e.target.value})} 
                  placeholder="Leave blank for default blog" 
                />
              </div>
            )}

            {newConnData.provider === 'FRAMER' && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Collection Name (Optional)</label>
                <input 
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={newConnData.collectionName} onChange={e => setNewConnData({...newConnData, collectionName: e.target.value})} 
                  placeholder="Blog" 
                />
              </div>
            )}

            {newConnData.provider === 'WEBFLOW' && (
              <>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Site ID</label>
                  <input 
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    value={newConnData.siteId} onChange={e => setNewConnData({...newConnData, siteId: e.target.value})} 
                    placeholder="e.g. 5f8a..." 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Collection ID</label>
                  <input 
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    value={newConnData.databaseId} onChange={e => setNewConnData({...newConnData, databaseId: e.target.value})} 
                    placeholder="e.g. 5f8b..." 
                  />
                </div>
              </>
            )}

            {newConnData.provider === 'NOTION' && (
              <>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Notion Database ID</label>
                  <input 
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    value={newConnData.databaseId} onChange={e => setNewConnData({...newConnData, databaseId: e.target.value})} 
                    placeholder="e.g. e2a123... (32-character ID in database URL)" 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Title Column Name (Optional)</label>
                  <input 
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    value={newConnData.titleProperty} onChange={e => setNewConnData({...newConnData, titleProperty: e.target.value})} 
                    placeholder="Name (default)" 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Status Column Name (Optional)</label>
                  <input 
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                    value={newConnData.statusProperty} onChange={e => setNewConnData({...newConnData, statusProperty: e.target.value})} 
                    placeholder="Status (default)" 
                  />
                </div>
              </>
            )}

            {newConnData.provider === 'SHOPIFY' && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Blog ID</label>
                <input 
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={newConnData.blogId} onChange={e => setNewConnData({...newConnData, blogId: e.target.value})} 
                  placeholder="e.g. 12345678" 
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

            {/* Secret token / API key field */}
            {newConnData.provider !== 'RSS' && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {['WORDPRESS', 'WORDPRESS_COM'].includes(newConnData.provider) ? 'Application Password' : 
                   newConnData.provider === 'GHOST' ? 'Admin API Key (id:secret)' : 
                   newConnData.provider === 'NOTION' ? 'Internal Integration Token' : 
                   newConnData.provider === 'WIX' ? 'Wix API Key or OAuth Token' :
                   newConnData.provider === 'BIGCOMMERCE' ? 'API Access Token (X-Auth-Token)' :
                   newConnData.provider === 'DUDA' ? 'Duda API Password' :
                   newConnData.provider === 'HUBSPOT' ? 'HubSpot Private App Access Token' :
                   newConnData.provider === 'HIGHLEVEL' ? 'HighLevel Private API Key / Bearer Token' :
                   ['SQUARESPACE', 'FRAMER', 'LOVABLE'].includes(newConnData.provider) ? 'Secret Token / Signature Key (Optional)' :
                   'Access Token / API Key'}
                </label>
                <input 
                  required={!['WEBHOOK', 'NEXTJS', 'CUSTOM', 'SQUARESPACE', 'FRAMER', 'LOVABLE'].includes(newConnData.provider) || newConnData.authMethod !== 'NONE'}
                  type="password"
                  autoComplete="new-password"
                  placeholder={newConnData.provider === 'WIX' ? 'Paste Wix API Key or Bearer Token (kept empty)' : ''}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                  value={newConnData.token} onChange={e => setNewConnData({...newConnData, token: e.target.value})} 
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="submit" className={styles.primaryButton}>Save Connection</button>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsAdding(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
