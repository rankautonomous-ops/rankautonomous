'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, RefreshCw, Trash2, Layers, Sparkles, CheckSquare, Square } from 'lucide-react';
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

  // Discovery mode
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discoverSeed, setDiscoverSeed] = useState('');
  const [discoverTopic, setDiscoverTopic] = useState('');
  const [discoverLocation, setDiscoverLocation] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discoveredKeywords, setDiscoveredKeywords] = useState<any[]>([]);
  const [selectedDiscovered, setSelectedDiscovered] = useState<Set<string>>(new Set());
  const [addingDiscovered, setAddingDiscovered] = useState(false);

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
      const targetSite = siteData.website || siteData;
      setActiveWebsite(targetSite);
      
      if (targetSite?.primaryKeywords && Array.isArray(targetSite.primaryKeywords)) {
        setDiscoverSeed(targetSite.primaryKeywords.join(', '));
      }

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
        setProviderError('Failed to enrich keywords.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEnriching(false);
    }
  };

  const runDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWebsite) return;

    setDiscovering(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const seeds = discoverSeed.split(',').map(s => s.trim()).filter(Boolean);
      
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/keywords/discover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          seedKeywords: seeds,
          topic: discoverTopic,
          location: discoverLocation
        })
      });

      if (res.ok) {
        const data = await res.json();
        setDiscoveredKeywords(data.keywords || []);
        setSelectedDiscovered(new Set());
      } else {
        const errData = await res.json();
        alert(errData.message || 'Failed to discover keywords');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDiscovering(false);
    }
  };

  const toggleSelectDiscovered = (keyword: string) => {
    const newSelected = new Set(selectedDiscovered);
    if (newSelected.has(keyword)) newSelected.delete(keyword);
    else newSelected.add(keyword);
    setSelectedDiscovered(newSelected);
  };

  const selectAllDiscovered = () => {
    const selectable = discoveredKeywords.filter(kw => !keywords.some(k => (k.keyword || '').toLowerCase() === (kw.keyword || '').toLowerCase()));
    if (selectedDiscovered.size === selectable.length && selectable.length > 0) {
      setSelectedDiscovered(new Set());
    } else {
      setSelectedDiscovered(new Set(selectable.map(k => k.keyword)));
    }
  };

  const addSelectedDiscovered = async () => {
    if (!activeWebsite || selectedDiscovered.size === 0) return;
    setAddingDiscovered(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const keywordsToAdd = discoveredKeywords
        .filter(k => selectedDiscovered.has(k.keyword))
        .map(k => ({
          keyword: k.keyword,
          intent: k.intent || 'INFORMATIONAL',
          source: k.source
        }));

      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/keywords`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ keywords: keywordsToAdd })
      });

      if (res.ok) {
        setDiscoveredKeywords(prev => prev.filter(k => !selectedDiscovered.has(k.keyword)));
        setSelectedDiscovered(new Set());
        fetchKeywords(activeWebsite.id, session!.access_token);
        setShowDiscovery(false);
      } else {
        alert('Failed to add selected keywords');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingDiscovered(false);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>Keyword Workspace</h2>
        <button 
          onClick={() => setShowDiscovery(!showDiscovery)}
          className={showDiscovery ? styles.secondaryButton : styles.primaryButton}
        >
          <Sparkles size={16} />
          <span>{showDiscovery ? 'Back to Workspace' : 'Discover Keywords'}</span>
        </button>
      </div>

      {providerError && (
        <div className={styles.infoBanner}>
          ℹ️ {providerError}
        </div>
      )}

      {showDiscovery ? (
        <div className={styles.card}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Keyword Opportunity Engine</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Discover high-value keywords using Google Search Console data, Competitor overlaps, and AI suggestions.
            </p>
            
            <form onSubmit={runDiscovery} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1', minWidth: '200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Seed Keywords (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. accounting, tax software"
                  value={discoverSeed}
                  onChange={e => setDiscoverSeed(e.target.value)}
                  className={styles.inputField}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: '1', minWidth: '150px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Topic Focus (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. small business"
                  value={discoverTopic}
                  onChange={e => setDiscoverTopic(e.target.value)}
                  className={styles.inputField}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: '1', minWidth: '150px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Target Location (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. London"
                  value={discoverLocation}
                  onChange={e => setDiscoverLocation(e.target.value)}
                  className={styles.inputField}
                  style={{ width: '100%' }}
                />
              </div>
              <button type="submit" disabled={discovering} className={styles.primaryButton} style={{ height: '42px' }}>
                {discovering ? 'Discovering...' : 'Discover'}
              </button>
            </form>
          </div>

          {discoveredKeywords.length > 0 && (
            <div className={styles.tableContainer}>
              <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <button onClick={selectAllDiscovered} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                    {(() => {
                      const selectable = discoveredKeywords.filter(kw => !keywords.some(k => (k.keyword || '').toLowerCase() === (kw.keyword || '').toLowerCase()));
                      const isAllSelected = selectedDiscovered.size === selectable.length && selectable.length > 0;
                      return isAllSelected ? <CheckSquare size={18} /> : <Square size={18} />;
                    })()}
                  </button>
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>{selectedDiscovered.size} selected</span>
                </div>
                <button 
                  onClick={addSelectedDiscovered}
                  disabled={selectedDiscovered.size === 0 || addingDiscovered}
                  className={styles.primaryButton}
                >
                  <Plus size={16} />
                  <span>{addingDiscovered ? 'Adding...' : 'Add Selected to Workspace'}</span>
                </button>
              </div>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Keyword</th>
                    <th>Intent</th>
                    <th>Source</th>
                    <th>GSC Impressions</th>
                    <th>Opp Score</th>
                  </tr>
                </thead>
                <tbody>
                  {discoveredKeywords.map((kw, idx) => {
                    const isExisting = keywords.some(k => (k.keyword || '').toLowerCase() === (kw.keyword || '').toLowerCase());
                    return (
                      <tr key={`${kw.keyword}-${idx}`} onClick={() => !isExisting && toggleSelectDiscovered(kw.keyword)} style={{ cursor: isExisting ? 'default' : 'pointer', opacity: isExisting ? 0.6 : 1 }}>
                        <td>
                          {isExisting ? (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Already added</span>
                          ) : selectedDiscovered.has(kw.keyword) ? (
                            <CheckSquare size={16} color="var(--text)" />
                          ) : (
                            <Square size={16} color="var(--text-muted)" />
                          )}
                        </td>
                        <td><span className={styles.keywordText}>{kw.keyword}</span></td>
                        <td>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {kw.intent ? kw.intent.toLowerCase() : '-'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                            {kw.source}
                          </span>
                        </td>
                        <td>{kw.gscImpressions ? kw.gscImpressions.toLocaleString() : '-'}</td>
                        <td style={{ minWidth: '120px' }}>
                          {kw.opportunityScore != null ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px' }}>
                                <div style={{ height: '100%', width: `${kw.opportunityScore}%`, backgroundColor: 'var(--accent-strong)', borderRadius: '2px' }} />
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 600 }}>{kw.opportunityScore}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Not available</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.card}>
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

          <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Intent</th>
                  <th>GSC Impr/Clicks</th>
                  <th>Vol / KD</th>
                  <th>Position</th>
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
                        {kw.intent ? kw.intent.toLowerCase() : '-'}
                      </span>
                    </td>
                    <td>
                      {kw.gscImpressions30d != null ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{kw.gscImpressions30d.toLocaleString()} Impr</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{kw.gscClicks30d?.toLocaleString() || 0} Clicks</span>
                        </div>
                      ) : (
                        <span className={styles.unavailableText}>-</span>
                      )}
                    </td>
                    <td>
                      {kw.searchVolume != null ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{kw.searchVolume.toLocaleString()} Vol</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{kw.difficulty || 0} KD</span>
                        </div>
                      ) : (
                        <span className={styles.unavailableText}>-</span>
                      )}
                    </td>
                    <td>
                      {kw.currentRanking != null ? (
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>#{Math.round(kw.currentRanking)}</span>
                      ) : kw.gscAvgPosition != null ? (
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>#{Math.round(kw.gscAvgPosition)} <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>(GSC)</span></span>
                      ) : (
                        <span className={styles.unavailableText}>-</span>
                      )}
                    </td>
                    <td style={{ minWidth: '120px' }}>
                      {kw.opportunityScore != null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px' }}>
                            <div style={{ height: '100%', width: `${kw.opportunityScore}%`, backgroundColor: 'var(--primary-color)', borderRadius: '2px' }} />
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>{kw.opportunityScore}</span>
                        </div>
                      ) : (
                        <span className={styles.unavailableText}>Not available</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {kw.cluster || 'General'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <a
                        href={`/app/content?keyword=${encodeURIComponent(kw.keyword)}`}
                        className={styles.secondaryButton}
                        style={{ padding: '4px 8px', fontSize: '12px', height: 'auto', textDecoration: 'none' }}
                        title="Create article for this keyword"
                      >
                        Create Article
                      </a>
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
      )}
    </div>
  );
}
