'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import styles from './backlinks.module.css';

interface CampaignsViewProps {
  websiteId: string;
  accessToken: string;
  apiUrl: string;
}

export default function CampaignsView({ websiteId, accessToken, apiUrl }: CampaignsViewProps) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/backlinks/campaigns`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch campaigns');
      setCampaigns(data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [websiteId]);

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/backlinks/campaigns/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) fetchCampaigns();
    } catch (err) {
      console.error(err);
    }
  };

  const generateMessage = async (id: string) => {
    setGeneratingFor(id);
    try {
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/backlinks/campaigns/${id}/generate-message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) fetchCampaigns();
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingFor(null);
    }
  };

  if (loading) return <div className={styles.emptyState}><Loader2 className={styles.spinner} /></div>;
  if (error) return <div className={styles.errorMessage}>{error}</div>;

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Opportunity</th>
            <th>Contact Info</th>
            <th>Status</th>
            <th>Message</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.length === 0 ? (
            <tr><td colSpan={5} className={styles.emptyState}>No campaigns found</td></tr>
          ) : (
            campaigns.map(c => (
              <tr key={c.id}>
                <td>
                  <strong>{c.opportunity?.domain}</strong><br/>
                  <span style={{fontSize: 12}}>{c.opportunity?.type}</span>
                </td>
                <td>
                  {c.contactName || 'No Name'} <br/>
                  {c.contactEmail || 'No Email'}
                </td>
                <td>
                  <span className={styles.statusBadge}>{c.status}</span>
                </td>
                <td>
                  {c.message ? (
                    <div style={{ maxWidth: 300, maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12 }}>
                      <strong>{c.subject}</strong><br/>
                      {c.message}
                    </div>
                  ) : (
                    <span style={{fontSize: 12, color: 'gray'}}>No draft yet</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className={styles.secondaryButton} onClick={() => generateMessage(c.id)} disabled={generatingFor === c.id}>
                      {generatingFor === c.id ? 'Generating...' : 'Generate AI Message'}
                    </button>
                    {c.message && (
                      <a href={`mailto:${c.contactEmail || ''}?subject=${encodeURIComponent(c.subject || '')}&body=${encodeURIComponent(c.message)}`} className={styles.secondaryButton}>
                        Send Email
                      </a>
                    )}
                    <select 
                      className={styles.statusSelect}
                      value=""
                      onChange={(e) => updateStatus(c.id, e.target.value)}
                    >
                      <option value="" disabled>Change Status...</option>
                      <option value="CONTACTED">Mark Contacted</option>
                      <option value="REPLIED">Mark Replied</option>
                      <option value="ACCEPTED">Mark Accepted</option>
                      <option value="REJECTED">Mark Rejected</option>
                      <option value="COMPLETED">Mark Completed</option>
                      <option value="CANCELLED">Cancel Campaign</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
