'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, RefreshCw, Trash2, Layers, Sparkles } from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import styles from './keywords.module.css';

export default function KeywordWorkspace() {
  const [activeWebsite, setActiveWebsite] = useState<any>(null);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [intentFilter, setIntentFilter] = useState<'ALL' | 'INFORMATIONAL' | 'COMMERCIAL' | 'TRANSACTIONAL'>('ALL');

  // New Keyword inputs
  const [newKeyword, setNewKeyword] = useState('');
  const [intent, setIntent] = useState('INFORMATIONAL');
  const [targetUrl, setTargetUrl] = useState('');
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const supabase = createClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchActiveWebsite();
  }, []);

  const fetchActiveWebsite = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const siteRes = await fetch(`${apiUrl}/api/websites/active`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!siteRes.ok) throw new Error('No active website');
      
      const siteData = await siteRes.json();
      setActiveWebsite(siteData.website || siteData);
      
      const targetSite = siteData.website || siteData;
      if (targetSite?.id) {
        fetchKeywords(targetSite.id, session.access_token);
      }
    } catch (err: any) {
      console.error(err);
      setError('Please connect a website in Onboarding before accessing Keyword Research.');
      setLoading(false);
    }
  };

  const fetchKeywords = async (websiteId: string, token: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/keywords`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setKeywords(data.keywords || []);
      }
    } catch (err) {
      console.error('Failed to load keywords', err);
    } finally {
      setLoading(false);
    }
  };

  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim() || !activeWebsite) return;

    setAddingKeyword(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/keywords`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          keywords: [{
            keyword: newKeyword.trim(),
            intent: intent,
            targetUrl: targetUrl.trim() || null
          }]
        })
      });

      if (res.ok) {
        setNewKeyword('');
        setTargetUrl('');
        fetchKeywords(activeWebsite.id, session!.access_token);
      } else {
        const errData = await res.json();
        alert(errData.message || 'Failed to add keyword');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingKeyword(false);
    }
  };

  const archiveKeyword = async (keywordId: string) => {
    if (!activeWebsite) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/keywords/${keywordId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (res.ok) {
        setKeywords(prev => prev.filter(k => k.id !== keywordId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const enrichKeywords = async () => {
    if (!activeWebsite || keywords.length === 0) return;
    setProviderError(null);
    setEnriching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const keywordIds = keywords.map(k => k.id);
      
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/keywords/research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ keywordIds })
      });

      if (res.status === 503) {
        const errData = await res.json();
        setProviderError(errData.message || 'Keyword provider not configured. Metrics will display as Not available.');
      } else if (res.ok) {
        fetchKeywords(activeWebsite.id, session!.access_token);
      } else {
        setProviderError('Failed to enrich keywords with third-party provider.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEnriching(false);
    }
  };

  // Filtered keywords
  const filteredKeywords = keywords.filter(kw => {
    const matchesSearch = !searchQuery.trim() || kw.keyword.toLowerCase().includes(searchQuery.toLowerCase().trim());
    const matchesIntent = intentFilter === 'ALL' || kw.intent?.toUpperCase() === intentFilter;
    return matchesSearch && matchesIntent;
  });

  if (loading) {
    return (
      <div className={styles.card} style={{ textAlign: 'center', padding: '60px 24px' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading keyword workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.card} style={{ textAlign: 'center', padding: '60px 24px' }}>
        <p style={{ color: 'var(--error, #c66f6f)', marginBottom: '16px' }}>{error}</p>
        <a href="/app/onboarding" className={styles.primaryButton}>
          Go to Onboarding →
        </a>
      </div>
    );
  }

  return (
    <div className={styles.workspaceContainer}>
      {providerError && (
        <div className={styles.infoBanner}>
          ℹ️ {providerError}
        </div>
      )}

      {/* Main Research Card */}
      <div className={styles.card}>
        {/* Top bar: search and intent pills */}
        <div className={styles.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: '240px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
              <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search keywords..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={styles.inputField}
                style={{ width: '100%', paddingLeft: '38px' }}
              />
            </div>

            <div className={styles.filtersRow}>
              <button
                type="button"
                className={`${styles.filterPill} ${intentFilter === 'ALL' ? styles.filterPillActive : ''}`}
                onClick={() => setIntentFilter('ALL')}
              >
                All
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${intentFilter === 'INFORMATIONAL' ? styles.filterPillActive : ''}`}
                onClick={() => setIntentFilter('INFORMATIONAL')}
              >
                Informational
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${intentFilter === 'COMMERCIAL' ? styles.filterPillActive : ''}`}
                onClick={() => setIntentFilter('COMMERCIAL')}
              >
                Commercial
              </button>
              <button
                type="button"
                className={`${styles.filterPill} ${intentFilter === 'TRANSACTIONAL' ? styles.filterPillActive : ''}`}
                onClick={() => setIntentFilter('TRANSACTIONAL')}
              >
                Transactional
              </button>
            </div>
          </div>

          <div className={styles.actionControls}>
            <button
              onClick={enrichKeywords}
              disabled={enriching || keywords.length === 0}
              className={styles.secondaryButton}
            >
              <RefreshCw size={14} className={enriching ? 'animate-spin' : ''} />
              <span>{enriching ? 'Enriching...' : 'Enrich Metrics'}</span>
            </button>
          </div>
        </div>

        {/* Add keyword form */}
        <form onSubmit={addKeyword} className={styles.addForm}>
          <input
            type="text"
            placeholder="Add new keyword..."
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            className={styles.inputField}
            style={{ flex: 1, minWidth: '200px' }}
            required
          />
          <select
            value={intent}
            onChange={e => setIntent(e.target.value)}
            className={styles.selectField}
          >
            <option value="INFORMATIONAL">Informational</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="TRANSACTIONAL">Transactional</option>
            <option value="NAVIGATIONAL">Navigational</option>
          </select>
          <input
            type="text"
            placeholder="Target URL (Optional)"
            value={targetUrl}
            onChange={e => setTargetUrl(e.target.value)}
            className={styles.inputField}
            style={{ minWidth: '180px' }}
          />
          <button type="submit" disabled={addingKeyword} className={styles.primaryButton}>
            <Plus size={16} />
            <span>{addingKeyword ? 'Adding...' : 'Add Keyword'}</span>
          </button>
        </form>

        {/* Research table (Section 20 & Section 30) */}
        <div className={styles.tableContainer}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Intent</th>
                <th>Volume</th>
                <th>Difficulty</th>
                <th>Current Rank</th>
                <th>Opportunity</th>
                <th>Cluster</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeywords.map(kw => (
                <tr key={kw.id}>
                  <td>
                    <span className={styles.keywordText}>{kw.keyword}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {kw.intent ? kw.intent.toLowerCase() : 'Not available'}
                    </span>
                  </td>
                  <td>
                    {kw.searchVolume != null ? (
                      kw.searchVolume.toLocaleString()
                    ) : (
                      <span className={styles.unavailableText}>Not available</span>
                    )}
                  </td>
                  <td>
                    {kw.difficulty != null ? (
                      kw.difficulty
                    ) : (
                      <span className={styles.unavailableText}>Not available</span>
                    )}
                  </td>
                  <td>
                    {kw.currentRanking != null ? (
                      `#${kw.currentRanking}`
                    ) : (
                      <span className={styles.unavailableText}>Not available</span>
                    )}
                  </td>
                  <td>
                    {kw.opportunityScore != null ? (
                      `${kw.opportunityScore}/100`
                    ) : (
                      <span className={styles.unavailableText}>Not available</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {kw.cluster || 'General'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => archiveKeyword(kw.id)}
                      className={styles.archiveButton}
                      title="Archive keyword"
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
              {filteredKeywords.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)' }}>
                    No keywords found matching current criteria. Add your first seed keyword above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
