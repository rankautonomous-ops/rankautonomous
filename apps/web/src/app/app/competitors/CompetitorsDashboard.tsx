'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { Plus, Trash, Zap, ExternalLink, ChevronRight, Check } from 'lucide-react';
import styles from '../app.module.css';

export default function CompetitorsDashboard() {
  const [activeWebsite, setActiveWebsite] = useState<any>(null);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const router = useRouter();
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
      
      if (targetSite?.id) {
        fetchCompetitors(targetSite.id, session.access_token);
      }
    } catch (err: any) {
      console.error(err);
      setError('Please connect a website in Onboarding before managing competitors.');
      setLoading(false);
    }
  };

  const fetchCompetitors = async (websiteId: string, token: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/competitors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setCompetitors(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load competitors', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim() || !activeWebsite) return;
    
    setAdding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/competitors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ url: newUrl })
      });

      if (res.ok) {
        const newComp = await res.json();
        setCompetitors([newComp, ...competitors]);
        setNewUrl('');
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to add competitor');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setAdding(false);
    }
  };

  const handleSuggest = async () => {
    if (!activeWebsite) return;
    setSuggesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/competitors/suggest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setAiSuggestions(json.data || []);
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to get suggestions');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setSuggesting(false);
    }
  };

  const handleAddSuggestion = async (url: string, name: string) => {
    if (!activeWebsite) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/competitors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ url, name })
      });

      if (res.ok) {
        const newComp = await res.json();
        setCompetitors([newComp, ...competitors]);
        setAiSuggestions(aiSuggestions.filter(s => s.url !== url));
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to add competitor');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!activeWebsite || !confirm('Are you sure you want to delete this competitor?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/competitors/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      if (res.ok || res.status === 204) {
        setCompetitors(competitors.filter(c => c.id !== id));
      } else {
        alert('Failed to delete competitor');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const handleAnalyze = async (id: string) => {
    if (!activeWebsite) return;
    setAnalyzingId(id);
    
    // Optimistic update
    setCompetitors(comps => comps.map(c => c.id === id ? { ...c, status: 'ANALYZING' } : c));
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/competitors/${id}/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setCompetitors(comps => comps.map(c => c.id === id ? { ...c, status: 'ANALYZED', analysisData: json.data } : c));
        setExpandedId(id);
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to analyze competitor');
        setCompetitors(comps => comps.map(c => c.id === id ? { ...c, status: 'ERROR' } : c));
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
      setCompetitors(comps => comps.map(c => c.id === id ? { ...c, status: 'ERROR' } : c));
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleAddKeyword = async (compId: string, kw: any) => {
    if (!activeWebsite) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/competitors/${compId}/add-keyword`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ keyword: kw.keyword, intent: kw.intent })
      });
      if (res.ok) {
        alert('Keyword added successfully!');
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to add keyword');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const handleCreateArticleFromGap = async (gap: any) => {
    if (!activeWebsite) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/articles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          topic: gap.topic,
          primaryKeyword: gap.suggestedTitle,
          targetKeyword: gap.suggestedTitle,
          wordCount: 1500
        })
      });
      if (res.ok) {
        const article = await res.json();
        router.push(`/app/content/${article.id}`);
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to create article');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  if (loading) {
    return <div className={styles.card} style={{ textAlign: 'center', padding: '60px' }}>Loading workspace...</div>;
  }

  if (error || !activeWebsite) {
    return <div className={styles.card} style={{ padding: '60px' }}>{error || 'No active website found.'}</div>;
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Add Competitor</h3>
          <p className={styles.cardDescription} style={{ marginBottom: '16px' }}>Manually add a competitor to track and analyze.</p>
          <form onSubmit={handleAddManual} style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="text" 
              className={styles.input} 
              placeholder="e.g. https://competitor.com" 
              value={newUrl} 
              onChange={e => setNewUrl(e.target.value)} 
              required 
            />
            <button type="submit" className={styles.primaryButton} disabled={adding}>
              {adding ? 'Adding...' : 'Add'}
            </button>
          </form>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>AI Discovery</h3>
          <p className={styles.cardDescription} style={{ marginBottom: '16px' }}>Find real competitors based on your website's goals and industry.</p>
          <button onClick={handleSuggest} className={styles.primaryButton} disabled={suggesting}>
            <SparklesIcon /> {suggesting ? 'Finding...' : 'Find Competitors with AI'}
          </button>
          
          {aiSuggestions.length > 0 && (
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {aiSuggestions.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.domain}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{s.reason}</div>
                  </div>
                  <button onClick={() => handleAddSuggestion(s.url, s.domain)} className={styles.secondaryButton} style={{ padding: '6px 12px' }}>
                    <Plus size={14} /> Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Tracked Competitors</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {competitors.length === 0 && (
          <div className={styles.card} style={{ textAlign: 'center', padding: '60px' }}>
            <p style={{ color: 'var(--text-secondary)' }}>No competitors tracked yet. Add one above or use AI discovery.</p>
          </div>
        )}
        
        {competitors.map(comp => (
          <div key={comp.id} className={styles.card} style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {comp.domain}
                  <StatusBadge status={comp.status} />
                </h4>
                <a href={comp.url} target="_blank" rel="noreferrer" style={{ fontSize: '14px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                  {comp.url} <ExternalLink size={12} />
                </a>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  onClick={() => handleAnalyze(comp.id)} 
                  className={styles.secondaryButton} 
                  disabled={analyzingId === comp.id || comp.status === 'ANALYZING'}
                >
                  <Zap size={14} /> {analyzingId === comp.id ? 'Analyzing...' : 'Analyze'}
                </button>
                {comp.analysisData && (
                  <button 
                    onClick={() => setExpandedId(expandedId === comp.id ? null : comp.id)} 
                    className={styles.secondaryButton}
                  >
                    {expandedId === comp.id ? 'Hide Details' : 'View Details'}
                  </button>
                )}
                <button onClick={() => handleDelete(comp.id)} className={styles.secondaryButton} style={{ color: 'var(--error)' }}>
                  <Trash size={14} />
                </button>
              </div>
            </div>

            {expandedId === comp.id && comp.analysisData && (
              <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                
                <div style={{ marginBottom: '24px' }}>
                  <h5 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>Strategic Positioning</h5>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{comp.analysisData.positioning}</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                  <div>
                    <h5 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#10b981' }}>Strengths</h5>
                    <ul style={{ paddingLeft: '20px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {(comp.analysisData.strengths || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h5 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#ef4444' }}>Weaknesses</h5>
                    <ul style={{ paddingLeft: '20px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {(comp.analysisData.weaknesses || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h5 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Keyword Opportunities</h5>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px 8px' }}>Keyword</th>
                          <th style={{ padding: '12px 8px' }}>Intent</th>
                          <th style={{ padding: '12px 8px' }}>Why It Matters</th>
                          <th style={{ padding: '12px 8px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(comp.analysisData.keywordOpportunities || []).map((kw: any, i: number) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 8px', fontWeight: 500 }}>{kw.keyword}</td>
                            <td style={{ padding: '12px 8px' }}>{kw.intent}</td>
                            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{kw.reason}</td>
                            <td style={{ padding: '12px 8px' }}>
                              <button onClick={() => handleAddKeyword(comp.id, kw)} className={styles.secondaryButton} style={{ padding: '4px 8px', fontSize: '12px' }}>
                                Add to My Keywords
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h5 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Content Gaps</h5>
                  <div style={{ display: 'grid', gap: '16px' }}>
                    {(comp.analysisData.contentGaps || []).map((gap: any, i: number) => (
                      <div key={i} style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)', marginBottom: '4px', textTransform: 'uppercase' }}>{gap.topic}</div>
                            <h6 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>{gap.suggestedTitle}</h6>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{gap.reason}</p>
                          </div>
                          <button onClick={() => handleCreateArticleFromGap(gap)} className={styles.primaryButton} style={{ padding: '6px 12px', fontSize: '13px', whiteSpace: 'nowrap' }}>
                            Create Article
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  let bg = '#374151';
  let color = '#d1d5db';
  if (status === 'ANALYZED') { bg = '#065f46'; color = '#34d399'; }
  if (status === 'ANALYZING') { bg = '#1e3a8a'; color = '#60a5fa'; }
  if (status === 'ERROR') { bg = '#7f1d1d'; color = '#f87171'; }
  
  return (
    <span style={{ 
      fontSize: '11px', 
      fontWeight: 600, 
      padding: '2px 8px', 
      borderRadius: '99px', 
      background: bg, 
      color: color 
    }}>
      {status}
    </span>
  );
}

function SparklesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
    </svg>
  );
}
