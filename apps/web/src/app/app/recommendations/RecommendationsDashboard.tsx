'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Zap, 
  Clock, 
  ExternalLink,
  Check,
  XCircle,
  TrendingUp,
  FileCode,
  Tag,
  Filter
} from 'lucide-react';
import { getApiUrl, apiFetch } from '../../../lib/api';

interface Recommendation {
  id: string;
  websiteId: string;
  type: string;
  category: string;
  title: string;
  description: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  impact: number;
  effort: number;
  confidence: number;
  score: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';
  targetUrl?: string | null;
  targetKeyword?: string | null;
  suggestedAction?: string | null;
  automationType?: string;
  createdAt: string;
}

export default function RecommendationsDashboard({ initialWebsite }: { initialWebsite: any }) {
  const website = initialWebsite;
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const fetchRecommendations = async () => {
    if (!website) return;
    try {
      setLoading(true);
      const apiUrl = getApiUrl();
      const res = await apiFetch(`${apiUrl}/api/websites/${website.id}/recommendations`);
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [website?.id]);

  const generateRecommendations = async () => {
    if (!website) return;
    try {
      setGenerating(true);
      setError('');
      const apiUrl = getApiUrl();
      const res = await apiFetch(`${apiUrl}/api/websites/${website.id}/recommendations/generate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to generate recommendations');
      }
      await fetchRecommendations();
    } catch (err: any) {
      setError(err.message || 'Failed to generate recommendations');
    } finally {
      setGenerating(false);
    }
  };

  const executeRecommendation = async (id: string) => {
    if (!website) return;
    try {
      setExecutingId(id);
      const apiUrl = getApiUrl();
      const res = await apiFetch(`${apiUrl}/api/websites/${website.id}/recommendations/${id}/execute`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Execution failed');
      }
      await fetchRecommendations();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setExecutingId(null);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    if (!website) return;
    try {
      const apiUrl = getApiUrl();
      const res = await apiFetch(`${apiUrl}/api/websites/${website.id}/recommendations/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Update failed');
      await fetchRecommendations();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const priorityStyles: Record<string, { color: string; bg: string; label: string }> = {
    CRITICAL: { color: '#dc2626', bg: '#fee2e2', label: 'Critical Priority' },
    HIGH: { color: '#ea580c', bg: '#ffedd5', label: 'High Priority' },
    MEDIUM: { color: '#ca8a04', bg: '#fef9c3', label: 'Medium Priority' },
    LOW: { color: '#2563eb', bg: '#dbeafe', label: 'Low Priority' }
  };

  // Filter recommendations
  const filteredRecs = useMemo(() => {
    if (activeCategory === 'ALL') return recommendations;
    if (activeCategory === 'HIGH_PRIORITY') {
      return recommendations.filter(r => r.priority === 'CRITICAL' || r.priority === 'HIGH');
    }
    return recommendations.filter(r => r.category === activeCategory);
  }, [recommendations, activeCategory]);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    recommendations.forEach(r => {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });
    return counts;
  }, [recommendations]);

  if (loading) {
    return (
      <div style={{
        padding: '60px 20px',
        textAlign: 'center',
        background: 'var(--surface, #ffffff)',
        borderRadius: '16px',
        border: '1px solid var(--border, #ded9d4)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        color: 'var(--text-secondary, #5f5b58)'
      }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading SEO Action Plan...</span>
        <style jsx>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header controls */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text, #111111)', margin: 0 }}>
            Action Items
          </h2>
          <span style={{
            fontSize: '12px',
            fontWeight: 600,
            padding: '2px 8px',
            background: 'var(--surface-soft, #fbf8f5)',
            border: '1px solid var(--border, #ded9d4)',
            borderRadius: '999px',
            color: 'var(--text-secondary, #5f5b58)'
          }}>
            {recommendations.length} total
          </span>
        </div>

        <button
          onClick={generateRecommendations}
          disabled={generating}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 18px',
            backgroundColor: '#111111',
            color: '#ffffff',
            borderRadius: '10px',
            border: 'none',
            fontSize: '13px',
            fontWeight: 600,
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.7 : 1,
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
          }}
        >
          <RefreshCw size={14} style={generating ? { animation: 'spin 1s linear infinite' } : {}} />
          {generating ? 'Scanning & Rebuilding Plan...' : 'Refresh AI Recommendations'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '10px',
          color: '#b91c1c',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Category Filter Pills */}
      {recommendations.length > 0 && (
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          flexWrap: 'wrap',
          paddingBottom: '4px'
        }}>
          <button
            onClick={() => setActiveCategory('ALL')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: activeCategory === 'ALL' ? 700 : 500,
              borderRadius: '999px',
              border: '1px solid',
              borderColor: activeCategory === 'ALL' ? '#111111' : 'var(--border, #ded9d4)',
              background: activeCategory === 'ALL' ? '#111111' : 'var(--surface, #ffffff)',
              color: activeCategory === 'ALL' ? '#ffffff' : 'var(--text-secondary, #5f5b58)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            All ({recommendations.length})
          </button>

          <button
            onClick={() => setActiveCategory('HIGH_PRIORITY')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: activeCategory === 'HIGH_PRIORITY' ? 700 : 500,
              borderRadius: '999px',
              border: '1px solid',
              borderColor: activeCategory === 'HIGH_PRIORITY' ? '#dc2626' : 'var(--border, #ded9d4)',
              background: activeCategory === 'HIGH_PRIORITY' ? '#fee2e2' : 'var(--surface, #ffffff)',
              color: activeCategory === 'HIGH_PRIORITY' ? '#dc2626' : 'var(--text-secondary, #5f5b58)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Critical & High ({recommendations.filter(r => r.priority === 'CRITICAL' || r.priority === 'HIGH').length})
          </button>

          {Object.entries(categories).map(([cat, count]) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: activeCategory === cat ? 700 : 500,
                borderRadius: '999px',
                border: '1px solid',
                borderColor: activeCategory === cat ? '#111111' : 'var(--border, #ded9d4)',
                background: activeCategory === cat ? '#111111' : 'var(--surface, #ffffff)',
                color: activeCategory === cat ? '#ffffff' : 'var(--text-secondary, #5f5b58)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textTransform: 'capitalize'
              }}
            >
              {cat.toLowerCase().replace('_', ' ')} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Main Content Area */}
      {recommendations.length === 0 ? (
        <div style={{ 
          padding: '56px 24px', 
          textAlign: 'center', 
          backgroundColor: 'var(--surface, #ffffff)', 
          borderRadius: '16px',
          border: '1px solid var(--border, #ded9d4)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '680px',
          margin: '20px auto',
          gap: '16px'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--surface-soft, #fbf8f5)',
            border: '1px solid var(--border, #ded9d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8c423d'
          }}>
            <Sparkles size={28} />
          </div>

          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text, #111111)', margin: '0 0 6px 0' }}>
              No Action Items Generated Yet
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary, #5f5b58)', margin: 0, lineHeight: 1.5 }}>
              Your website crawl and audit are ready. Click below to analyze your signals and compile a prioritized, step-by-step SEO roadmap.
            </p>
          </div>

          <button
            onClick={generateRecommendations}
            disabled={generating}
            style={{
              marginTop: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '11px 24px',
              backgroundColor: '#111111',
              color: '#ffffff',
              borderRadius: '10px',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: generating ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          >
            <Sparkles size={16} />
            {generating ? 'Scanning Opportunities...' : 'Generate AI Action Plan'}
          </button>
        </div>
      ) : filteredRecs.length === 0 ? (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: 'var(--surface, #ffffff)',
          borderRadius: '16px',
          border: '1px solid var(--border, #ded9d4)',
          color: 'var(--text-secondary, #5f5b58)',
          fontSize: '14px'
        }}>
          No recommendations found matching the selected filter.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {filteredRecs.map(rec => {
            const pStyle = priorityStyles[rec.priority] || priorityStyles.MEDIUM;
            const isExecuting = executingId === rec.id;

            return (
              <div 
                key={rec.id} 
                style={{ 
                  backgroundColor: 'var(--surface, #ffffff)', 
                  border: `1px solid var(--border, #ded9d4)`, 
                  borderLeft: `5px solid ${pStyle.color}`,
                  borderRadius: '12px', 
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <span style={{ 
                        fontSize: '11px', 
                        fontWeight: 700, 
                        color: pStyle.color, 
                        backgroundColor: pStyle.bg, 
                        padding: '3px 9px', 
                        borderRadius: '999px',
                        letterSpacing: '0.02em'
                      }}>
                        {pStyle.label}
                      </span>
                      <span style={{ 
                        fontSize: '11px', 
                        fontWeight: 600,
                        color: 'var(--text-secondary, #5f5b58)', 
                        textTransform: 'uppercase',
                        background: 'var(--surface-soft, #fbf8f5)',
                        border: '1px solid var(--border, #ded9d4)',
                        padding: '3px 8px',
                        borderRadius: '6px'
                      }}>
                        {rec.category.replace('_', ' ')}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary, #5f5b58)', fontWeight: 500 }}>
                        Impact Score: <strong>{rec.score}/100</strong>
                      </span>
                    </div>

                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text, #111111)' }}>
                      {rec.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary, #5f5b58)', lineHeight: 1.5 }}>
                      {rec.description}
                    </p>
                  </div>
                  
                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {rec.status === 'OPEN' && (
                      <button 
                        onClick={() => executeRecommendation(rec.id)}
                        disabled={isExecuting}
                        style={{ 
                          padding: '7px 14px', 
                          backgroundColor: '#111111', 
                          color: '#ffffff', 
                          border: 'none', 
                          borderRadius: '8px', 
                          cursor: isExecuting ? 'not-allowed' : 'pointer', 
                          fontSize: '12px', 
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Zap size={13} />
                        {isExecuting ? 'Automating...' : 'Automate Action'}
                      </button>
                    )}

                    {rec.status === 'IN_PROGRESS' && (
                      <span style={{ 
                        fontSize: '12px', 
                        padding: '6px 12px', 
                        backgroundColor: '#eff6ff', 
                        color: '#2563eb', 
                        borderRadius: '6px', 
                        fontWeight: 600,
                        border: '1px solid #bfdbfe',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <Clock size={13} /> In Progress
                      </span>
                    )}

                    {rec.status !== 'COMPLETED' && (
                      <button 
                        onClick={() => updateStatus(rec.id, 'COMPLETED')}
                        style={{ 
                          padding: '7px 12px', 
                          backgroundColor: 'transparent', 
                          color: 'var(--text, #111111)', 
                          border: '1px solid var(--border, #ded9d4)', 
                          borderRadius: '8px', 
                          cursor: 'pointer', 
                          fontSize: '12px',
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="Mark as completed"
                      >
                        <Check size={13} /> Done
                      </button>
                    )}

                    {rec.status !== 'DISMISSED' && (
                      <button 
                        onClick={() => updateStatus(rec.id, 'DISMISSED')}
                        style={{ 
                          padding: '7px 12px', 
                          backgroundColor: 'transparent', 
                          color: 'var(--text-secondary, #5f5b58)', 
                          border: '1px solid var(--border, #ded9d4)', 
                          borderRadius: '8px', 
                          cursor: 'pointer', 
                          fontSize: '12px' 
                        }}
                        title="Dismiss recommendation"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Metrics bar */}
                <div style={{ 
                  display: 'flex', 
                  gap: '20px', 
                  fontSize: '12px', 
                  color: 'var(--text-secondary, #5f5b58)', 
                  borderTop: '1px solid var(--border, #ded9d4)', 
                  paddingTop: '12px',
                  flexWrap: 'wrap',
                  alignItems: 'center'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted, #8b8580)' }}>Impact: </span>
                    <strong style={{ color: 'var(--text, #111111)' }}>{rec.impact}/100</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted, #8b8580)' }}>Effort: </span>
                    <strong style={{ color: 'var(--text, #111111)' }}>{rec.effort}/100</strong>
                  </div>
                  {rec.targetUrl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: 'var(--text-muted, #8b8580)' }}>Target: </span>
                      <a 
                        href={rec.targetUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        style={{ color: '#8c423d', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                      >
                        {rec.targetUrl.replace(/^https?:\/\/[^/]+/, '') || '/'}
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  )}
                  {rec.targetKeyword && (
                    <div>
                      <span style={{ color: 'var(--text-muted, #8b8580)' }}>Keyword: </span>
                      <strong style={{ color: 'var(--text, #111111)' }}>{rec.targetKeyword}</strong>
                    </div>
                  )}
                </div>
                
                {/* AI Guidance snippet if present */}
                {rec.suggestedAction && (
                  <div style={{ 
                    marginTop: '4px', 
                    padding: '14px 16px', 
                    backgroundColor: 'var(--surface-soft, #fbf8f5)', 
                    border: '1px solid var(--border, #ded9d4)',
                    borderRadius: '8px', 
                    fontSize: '13px', 
                    lineHeight: '1.5'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#8c423d', marginBottom: '4px' }}>
                      <Sparkles size={14} /> AI Action Guide
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text, #111111)' }}>
                      {rec.suggestedAction}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
