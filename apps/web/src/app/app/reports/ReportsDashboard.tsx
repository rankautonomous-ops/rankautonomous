'use client';

import { useState, useEffect } from 'react';
import { getApiUrl } from '../../../lib/api';

export default function ReportsDashboard({ initialWebsite }: { initialWebsite: any }) {
  const website = initialWebsite;
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  useEffect(() => {
    fetchReports();
  }, [website]);

  const fetchReports = async () => {
    if (!website) return;
    try {
      setLoading(true);
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/websites/${website.id}/reports`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('supabase_token')}`,
        }
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports);
        if (data.reports && data.reports.length > 0 && !selectedReport) {
          setSelectedReport(data.reports[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch reports', err);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (!website) return;
    try {
      setGenerating(true);
      const d = new Date();
      // Generate for current month
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;

      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/websites/${website.id}/reports/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('supabase_token')}`,
        },
        body: JSON.stringify({ year, month })
      });
      
      if (res.ok) {
        await fetchReports();
      } else {
        alert('Failed to generate report');
      }
    } catch (err) {
      alert('Error generating report');
    } finally {
      setGenerating(false);
    }
  };

  if (!website) return <div>Please select a website first.</div>;
  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      {/* Sidebar with history */}
      <div style={{ width: '250px', background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>History</h3>
        <button 
          onClick={generateReport} 
          disabled={generating}
          style={{ width: '100%', padding: '8px', marginBottom: '16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: generating ? 'not-allowed' : 'pointer' }}
        >
          {generating ? 'Generating...' : 'Generate New Report'}
        </button>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {reports.map(r => (
            <div 
              key={r.id} 
              onClick={() => setSelectedReport(r)}
              style={{
                padding: '12px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: selectedReport?.id === r.id ? 'var(--primary-light)' : 'transparent',
                border: '1px solid',
                borderColor: selectedReport?.id === r.id ? 'var(--primary)' : 'var(--border)'
              }}
            >
              <div style={{ fontWeight: 500 }}>{r.reportYear}-{String(r.reportMonth).padStart(2, '0')}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Status: {r.status}</div>
              {r.seoScore !== null && <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Score: {r.seoScore}</div>}
            </div>
          ))}
          {reports.length === 0 && <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>No reports yet.</div>}
        </div>
      </div>

      {/* Main Report View */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {selectedReport ? (
          <>
            <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>SEO REPORT - {selectedReport.reportYear}/{selectedReport.reportMonth}</h2>
              {selectedReport.status === 'GENERATING' && <p>Report is currently being generated...</p>}
              {selectedReport.status === 'FAILED' && <p>Report generation failed. {selectedReport.reportData?.error}</p>}
              
              {selectedReport.status === 'READY' && (
                <div>
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Executive Summary</h3>
                    <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      {selectedReport.reportData?.summary || 'No summary available.'}
                    </p>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>SEO Score</div>
                      <div style={{ fontSize: '24px', fontWeight: 600 }}>{selectedReport.seoScore ?? 'N/A'}</div>
                    </div>
                    <div style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Organic Clicks</div>
                      <div style={{ fontSize: '24px', fontWeight: 600 }}>{selectedReport.organicClicks ?? 'N/A'}</div>
                    </div>
                    <div style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Organic Impressions</div>
                      <div style={{ fontSize: '24px', fontWeight: 600 }}>{selectedReport.organicImpressions ?? 'N/A'}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                    <div style={{ padding: '24px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Content Performance</h3>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <li>Articles Generated: {selectedReport.reportData?.content?.generated ?? 0}</li>
                        <li>Articles Published: {selectedReport.reportData?.content?.published ?? 0}</li>
                        <li>Awaiting Review: {selectedReport.reportData?.content?.awaitingReview ?? 0}</li>
                      </ul>
                    </div>

                    <div style={{ padding: '24px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Backlink Performance</h3>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <li>Acquired: {selectedReport.reportData?.backlinks?.acquired ?? 0}</li>
                        <li>Verified: {selectedReport.reportData?.backlinks?.verified ?? 0}</li>
                        <li>Missing: {selectedReport.reportData?.backlinks?.missing ?? 0}</li>
                      </ul>
                    </div>
                  </div>
                  
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Select a report to view details.
          </div>
        )}
      </div>
    </div>
  );
}
