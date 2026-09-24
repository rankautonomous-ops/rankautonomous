'use client';

import { useState, useEffect } from 'react';
import { getApiUrl } from '../../../lib/api';

export default function RecommendationsDashboard({ initialWebsite }: { initialWebsite: any }) {
  const website = initialWebsite;
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const fetchRecommendations = async () => {
    if (!website) return;
    try {
      setLoading(true);
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/websites/${website.id}/recommendations`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('supabase_token')}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [website]);

  const generateRecommendations = async () => {
    if (!website) return;
    try {
      setGenerating(true);
      setError('');
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/websites/${website.id}/recommendations/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('supabase_token')}`,
        },
      });
      if (!res.ok) throw new Error('Failed to generate recommendations');
      await fetchRecommendations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const executeRecommendation = async (id: string) => {
    if (!website) return;
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/websites/${website.id}/recommendations/${id}/execute`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('supabase_token')}`,
        },
      });
      if (!res.ok) throw new Error('Execution failed');
      await fetchRecommendations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    if (!website) return;
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/websites/${website.id}/recommendations/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('supabase_token')}`,
        },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Update failed');
      await fetchRecommendations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div>Loading...</div>;

  const priorityColors: Record<string, string> = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    MEDIUM: '#eab308',
    LOW: '#3b82f6'
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 500 }}>Action Items</h2>
        </div>
        <button
          onClick={generateRecommendations}
          disabled={generating}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--primary)',
            color: 'white',
            borderRadius: '6px',
            border: 'none',
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.7 : 1
          }}
        >
          {generating ? 'Scanning...' : 'Refresh AI Recommendations'}
        </button>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '16px' }}>{error}</div>}

      {recommendations.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: 'var(--surface)', borderRadius: '12px' }}>
          <p>No recommendations found. Click refresh to scan for SEO opportunities.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {recommendations.map(rec => (
            <div key={rec.id} style={{ 
              backgroundColor: 'var(--surface)', 
              border: `1px solid var(--border)`, 
              borderLeft: `4px solid ${priorityColors[rec.priority] || '#ccc'}`,
              borderRadius: '8px', 
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: priorityColors[rec.priority], backgroundColor: `${priorityColors[rec.priority]}20`, padding: '2px 8px', borderRadius: '12px' }}>
                      {rec.priority} ({rec.score})
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {rec.category.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px 0' }}>{rec.title}</h3>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>{rec.description}</p>
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  {rec.status === 'OPEN' && (
                    <button 
                      onClick={() => executeRecommendation(rec.id)}
                      style={{ padding: '6px 12px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
                    >
                      Automate Action
                    </button>
                  )}
                  {rec.status === 'IN_PROGRESS' && (
                    <span style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#3b82f620', color: '#3b82f6', borderRadius: '4px', fontWeight: 500 }}>
                      In Progress
                    </span>
                  )}
                  
                  {rec.status !== 'DISMISSED' && (
                    <button 
                      onClick={() => updateStatus(rec.id, 'DISMISSED')}
                      style={{ padding: '6px 12px', backgroundColor: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                <div><strong>Impact:</strong> {rec.impact}/100</div>
                <div><strong>Effort:</strong> {rec.effort}/100</div>
                {rec.targetUrl && <div><strong>Target:</strong> {rec.targetUrl}</div>}
                {rec.targetKeyword && <div><strong>Keyword:</strong> {rec.targetKeyword}</div>}
              </div>
              
              {rec.suggestedAction && (
                <div style={{ marginTop: '8px', padding: '12px', backgroundColor: 'var(--background)', borderRadius: '6px', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                  <strong>AI Suggestion:</strong>
                  <div style={{ marginTop: '4px' }}>{rec.suggestedAction}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
