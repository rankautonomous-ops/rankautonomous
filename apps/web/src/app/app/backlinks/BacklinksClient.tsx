'use client';

import React, { useState, useEffect } from 'react';
import styles from './backlinks.module.css';
import { createClient } from '../../../lib/supabase/client';

type OpportunityStatus = 'DISCOVERED' | 'QUALIFIED' | 'READY' | 'CONTACTED' | 'REPLIED' | 'ACCEPTED' | 'LINK_ACQUIRED' | 'REJECTED';

type BacklinkOpportunity = {
  id: string;
  domain: string;
  url: string | null;
  status: OpportunityStatus;
  relevance: number | null;
  domainAuthority: number | null;
  type: string;
  suggestedAction: string | null;
  suggestedAnchor: string | null;
  createdAt: string;
};

type Backlink = {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  referringDomain: string;
  anchorText: string | null;
  status: 'ACTIVE' | 'LOST';
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'MISSING' | 'ERROR';
  lastErrorMessage: string | null;
  firstDiscoveredAt: string;
  lastCheckedAt: string | null;
};

const KANBAN_COLUMNS: OpportunityStatus[] = [
  'DISCOVERED', 'QUALIFIED', 'READY', 'CONTACTED', 'REPLIED', 'ACCEPTED', 'LINK_ACQUIRED', 'REJECTED'
];

const VALID_TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  DISCOVERED: ['QUALIFIED', 'REJECTED', 'LINK_ACQUIRED'],
  QUALIFIED: ['READY', 'REJECTED', 'LINK_ACQUIRED'],
  READY: ['CONTACTED', 'REJECTED', 'LINK_ACQUIRED'],
  CONTACTED: ['REPLIED', 'REJECTED', 'LINK_ACQUIRED'],
  REPLIED: ['ACCEPTED', 'REJECTED', 'LINK_ACQUIRED'],
  ACCEPTED: ['LINK_ACQUIRED', 'REJECTED'],
  LINK_ACQUIRED: ['REJECTED'],
  REJECTED: ['DISCOVERED'] // Can resurrect
};

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  DISCOVERED: 'Discovered',
  QUALIFIED: 'Qualified',
  READY: 'Ready',
  CONTACTED: 'Contacted',
  REPLIED: 'Replied',
  ACCEPTED: 'Accepted',
  LINK_ACQUIRED: 'Link Acquired',
  REJECTED: 'Rejected'
};

export default function BacklinksClient({ activeWebsite }: { activeWebsite: any }) {
  const [activeTab, setActiveTab] = useState<'opportunities' | 'backlinks'>('opportunities');
  const [opportunities, setOpportunities] = useState<BacklinkOpportunity[]>([]);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingBacklinks, setVerifyingBacklinks] = useState<Record<string, { status: string, jobId?: string }>>({});

  // Modals
  const [showAddOpp, setShowAddOpp] = useState(false);
  const [showAddBacklink, setShowAddBacklink] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<{ opp: BacklinkOpportunity, status: OpportunityStatus } | null>(null);

  // Form states
  const [oppForm, setOppForm] = useState({ domain: '', url: '', type: 'GUEST_POST', relevance: '', domainAuthority: '' });
  const [blForm, setBlForm] = useState({ sourceUrl: '', targetUrl: '', referringDomain: '', anchorText: '' });
  const [linkAcquiredForm, setLinkAcquiredForm] = useState({ sourceUrl: '', targetUrl: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const supabase = createClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchData();
  }, [activeWebsite.id, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      if (activeTab === 'opportunities') {
        const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/backlink-opportunities?limit=100`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch opportunities');
        const json = await res.json();
        setOpportunities(json.data || []);
      } else {
        const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/backlinks?limit=100`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch backlinks');
        const json = await res.json();
        setBacklinks(json.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAddOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const payload: any = {
        domain: oppForm.domain,
        type: oppForm.type,
      };
      if (oppForm.url) payload.url = oppForm.url;
      if (oppForm.relevance) payload.relevance = parseInt(oppForm.relevance, 10);
      if (oppForm.domainAuthority) payload.domainAuthority = parseInt(oppForm.domainAuthority, 10);

      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/backlink-opportunities`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to add opportunity');
      }
      
      await fetchData();
      setShowAddOpp(false);
      setOppForm({ domain: '', url: '', type: 'GUEST_POST', relevance: '', domainAuthority: '' });
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBacklink = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const payload: any = {
        sourceUrl: blForm.sourceUrl,
        targetUrl: blForm.targetUrl,
        referringDomain: blForm.referringDomain,
      };
      if (blForm.anchorText) payload.anchorText = blForm.anchorText;

      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/backlinks`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to add backlink');
      }
      
      await fetchData();
      setShowAddBacklink(false);
      setBlForm({ sourceUrl: '', targetUrl: '', referringDomain: '', anchorText: '' });
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (backlink: Backlink) => {
    if (verifyingBacklinks[backlink.id]) return;
    setVerifyingBacklinks(prev => ({ ...prev, [backlink.id]: { status: 'Queueing...' } }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/backlinks/${backlink.id}/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      if (res.status === 401) throw new Error('Session expired / login required.');
      if (res.status === 403) throw new Error('Subscription required.');
      if (res.status === 404) throw new Error('Backlink no longer exists.');
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'Failed to queue verification');
      
      setVerifyingBacklinks(prev => ({ ...prev, [backlink.id]: { status: 'Queued', jobId: json.jobId } }));
      pollVerification(backlink.id);
    } catch (err: any) {
      alert(err.message);
      setVerifyingBacklinks(prev => {
        const next = { ...prev };
        delete next[backlink.id];
        return next;
      });
    }
  };

  const pollVerification = async (backlinkId: string) => {
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds at 2s interval
    
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        setVerifyingBacklinks(prev => {
          if (!prev[backlinkId]) return prev;
          return { ...prev, [backlinkId]: { ...prev[backlinkId], status: 'Timeout' } };
        });
        alert('Verification is still processing. Refresh later.');
        return;
      }
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/backlinks/${backlinkId}/verification-job`, {
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });
        if (!res.ok) return;
        
        const json = await res.json();
        const job = json.job;
        if (!job) {
          // If the job disappeared entirely, we should just refresh data and stop polling
          clearInterval(interval);
          setVerifyingBacklinks(prev => { const next = { ...prev }; delete next[backlinkId]; return next; });
          fetchData();
          return;
        }
        
        if (job.status === 'PROCESSING') {
          setVerifyingBacklinks(prev => ({ ...prev, [backlinkId]: { ...prev[backlinkId], status: 'Verifying...' } }));
        } else if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
          clearInterval(interval);
          setVerifyingBacklinks(prev => {
            const next = { ...prev };
            delete next[backlinkId];
            return next;
          });
          fetchData();
        }
      } catch (err) {
        // silently ignore polling errors (e.g. transient network failure)
      }
    }, 2000);
  };

  const handleStatusChange = (opp: BacklinkOpportunity, newStatus: OpportunityStatus) => {
    if (newStatus === 'LINK_ACQUIRED') {
      setTransitionTarget({ opp, status: newStatus });
      setLinkAcquiredForm({ sourceUrl: opp.url || '', targetUrl: `https://${activeWebsite.domain}` });
    } else {
      executeStatusChange(opp.id, newStatus);
    }
  };

  const executeStatusChange = async (id: string, status: OpportunityStatus, targetUrl?: string, sourceUrl?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload: any = { status };
      if (status === 'LINK_ACQUIRED' && targetUrl && sourceUrl) {
        payload.targetUrl = targetUrl;
        payload.sourceUrl = sourceUrl;
      }

      const res = await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/backlink-opportunities/${id}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.message}`);
        return;
      }
      
      setTransitionTarget(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteOpp = async (id: string) => {
    if (!confirm('Are you sure you want to delete this opportunity?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/backlink-opportunities/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      fetchData();
    } catch (e) {}
  };

  const handleDeleteBacklink = async (id: string) => {
    if (!confirm('Are you sure you want to delete this backlink?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${apiUrl}/api/websites/${activeWebsite.id}/backlinks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      fetchData();
    } catch (e) {}
  };

  const totalOpps = opportunities.length;
  const readyToContact = opportunities.filter(o => o.status === 'READY').length;
  const linkAcquiredCount = opportunities.filter(o => o.status === 'LINK_ACQUIRED').length;
  const activeBacklinksCount = backlinks.filter(b => b.status === 'ACTIVE').length;

  return (
    <div className={styles.workspaceContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Backlinks Pipeline</h1>
        <p className={styles.pageSubtitle}>
          Track backlink opportunities and acquired links for {activeWebsite.domain}.
        </p>
      </div>

      <div className={styles.metricsRow}>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{totalOpps}</div>
          <div className={styles.metricLabel}>Total Opportunities</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{readyToContact}</div>
          <div className={styles.metricLabel}>Ready to Contact</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{linkAcquiredCount}</div>
          <div className={styles.metricLabel}>Link Acquired</div>
        </div>
        <div className={styles.metricCard}>
          <div className={styles.metricValue}>{activeTab === 'backlinks' ? activeBacklinksCount : backlinks.length}</div>
          <div className={styles.metricLabel}>Active Backlinks</div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'opportunities' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('opportunities')}
        >
          Opportunities
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'backlinks' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('backlinks')}
        >
          Acquired Backlinks
        </button>
      </div>

      <div className={styles.topBar}>
        <div className={styles.filtersRow}>
          {/* Future implementation: filters */}
        </div>
        <div className={styles.actionControls}>
          {activeTab === 'opportunities' ? (
            <button className={styles.primaryButton} onClick={() => setShowAddOpp(true)}>+ Add Opportunity</button>
          ) : (
            <button className={styles.primaryButton} onClick={() => setShowAddBacklink(true)}>+ Add Backlink</button>
          )}
        </div>
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}

      {loading ? (
        <div className={styles.emptyState}>Loading...</div>
      ) : activeTab === 'opportunities' ? (
        opportunities.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateTitle}>No backlink opportunities yet.</div>
            <div className={styles.emptyStateDesc}>
              You can manually add prospects now. Automated discovery will be available when a supported data provider is configured.
            </div>
            <button className={styles.primaryButton} onClick={() => setShowAddOpp(true)}>+ Add Opportunity</button>
          </div>
        ) : (
          <div className={styles.kanbanBoard}>
            {KANBAN_COLUMNS.map(status => {
              const colOpps = opportunities.filter(o => o.status === status);
              return (
                <div key={status} className={styles.kanbanColumn}>
                  <div className={styles.kanbanColumnHeader}>
                    <span className={styles.kanbanColumnTitle}>{STATUS_LABELS[status]}</span>
                    <span className={styles.kanbanCardCount}>{colOpps.length}</span>
                  </div>
                  {colOpps.map(opp => (
                    <div key={opp.id} className={styles.kanbanCard}>
                      <div className={styles.cardDomain}>{opp.domain}</div>
                      <div className={styles.cardType}>{opp.type.replace(/_/g, ' ')}</div>
                      {opp.domainAuthority && <div style={{ fontSize: 12, marginBottom: 8, color: '#5f5b58' }}>DA: {opp.domainAuthority}</div>}
                      
                      <div className={styles.cardActions}>
                        <select 
                          className={styles.statusSelect}
                          value=""
                          onChange={(e) => handleStatusChange(opp, e.target.value as OpportunityStatus)}
                        >
                          <option value="" disabled>Move to...</option>
                          {VALID_TRANSITIONS[opp.status]?.map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                        <button className={`${styles.actionLink} ${styles.dangerLink}`} onClick={() => handleDeleteOpp(opp.id)}>Del</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )
      ) : (
        backlinks.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateTitle}>No acquired backlinks tracked yet.</div>
            <div className={styles.emptyStateDesc}>
              You can manually record acquired backlinks.
            </div>
            <button className={styles.primaryButton} onClick={() => setShowAddBacklink(true)}>+ Add Backlink</button>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Source URL</th>
                  <th>Target URL</th>
                  <th>Referring Domain</th>
                  <th>Status</th>
                  <th>Verification</th>
                  <th>Last Checked</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backlinks.map(bl => (
                  <tr key={bl.id}>
                    <td><a href={bl.sourceUrl} target="_blank" rel="noreferrer" style={{color: '#0066cc'}}>{bl.sourceUrl}</a></td>
                    <td><a href={bl.targetUrl} target="_blank" rel="noreferrer" style={{color: '#0066cc'}}>{bl.targetUrl}</a></td>
                    <td>{bl.referringDomain}</td>
                    <td>
                      <span style={{ 
                        background: bl.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2', 
                        color: bl.status === 'ACTIVE' ? '#166534' : '#991b1b',
                        padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 
                      }}>
                        {bl.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                        <span style={{ 
                          background: bl.verificationStatus === 'VERIFIED' ? '#dcfce7' : bl.verificationStatus === 'ERROR' ? '#fee2e2' : bl.verificationStatus === 'MISSING' ? '#fef08a' : '#f3f4f6', 
                          color: bl.verificationStatus === 'VERIFIED' ? '#166534' : bl.verificationStatus === 'ERROR' ? '#991b1b' : bl.verificationStatus === 'MISSING' ? '#854d0e' : '#374151',
                          padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 
                        }}>
                          {bl.verificationStatus}
                        </span>
                        {bl.verificationStatus === 'ERROR' && (
                           <span style={{ fontSize: 11, color: '#991b1b', maxWidth: 150, wordWrap: 'break-word' }}>
                             {bl.lastErrorMessage || 'Verification could not be completed.'}
                           </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: '#5f5b58' }}>
                        {bl.lastCheckedAt ? new Date(bl.lastCheckedAt).toLocaleString() : 'Never'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button 
                          className={styles.secondaryButton} 
                          style={{ padding: '4px 8px', fontSize: 12, minWidth: '80px', display: 'flex', justifyContent: 'center' }}
                          onClick={() => handleVerify(bl)}
                          disabled={!!verifyingBacklinks[bl.id] || verifyingBacklinks[bl.id]?.status === 'Timeout'}
                        >
                          {verifyingBacklinks[bl.id] ? verifyingBacklinks[bl.id].status : 'Verify'}
                        </button>
                        <button className={`${styles.actionLink} ${styles.dangerLink}`} onClick={() => handleDeleteBacklink(bl.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Add Opportunity Modal */}
      {showAddOpp && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add Opportunity</h2>
              <button className={styles.closeButton} onClick={() => setShowAddOpp(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddOpportunity}>
              {formError && <div className={styles.errorMessage}>{formError}</div>}
              
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Target Domain *</label>
                <input required className={styles.formInput} placeholder="e.g. forbes.com" value={oppForm.domain} onChange={e => setOppForm({...oppForm, domain: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Specific URL (Optional)</label>
                <input type="url" className={styles.formInput} placeholder="https://forbes.com/article" value={oppForm.url} onChange={e => setOppForm({...oppForm, url: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Opportunity Type *</label>
                <select className={styles.formSelect} value={oppForm.type} onChange={e => setOppForm({...oppForm, type: e.target.value})}>
                  <option value="GUEST_POST">Guest Post</option>
                  <option value="RESOURCE_PAGE">Resource Page</option>
                  <option value="LINK_INSERTION">Link Insertion</option>
                  <option value="BROKEN_LINK">Broken Link</option>
                  <option value="PR">PR / Media</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Domain Authority (0-100)</label>
                <input type="number" min="0" max="100" className={styles.formInput} value={oppForm.domainAuthority} onChange={e => setOppForm({...oppForm, domainAuthority: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Relevance (0-100)</label>
                <input type="number" min="0" max="100" className={styles.formInput} value={oppForm.relevance} onChange={e => setOppForm({...oppForm, relevance: e.target.value})} />
              </div>
              
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowAddOpp(false)}>Cancel</button>
                <button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? 'Saving...' : 'Add Opportunity'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Backlink Modal */}
      {showAddBacklink && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Record Acquired Backlink</h2>
              <button className={styles.closeButton} onClick={() => setShowAddBacklink(false)}>&times;</button>
            </div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#5f5b58' }}>
              Recording a backlink does not verify that the link currently exists. Future background workers will handle live verification.
            </div>
            <form onSubmit={handleAddBacklink}>
              {formError && <div className={styles.errorMessage}>{formError}</div>}
              
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Source URL (Where the link lives) *</label>
                <input required type="url" className={styles.formInput} value={blForm.sourceUrl} onChange={e => setBlForm({...blForm, sourceUrl: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Target URL (Your page) *</label>
                <input required type="url" className={styles.formInput} value={blForm.targetUrl} onChange={e => setBlForm({...blForm, targetUrl: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Referring Domain *</label>
                <input required className={styles.formInput} placeholder="e.g. example.com" value={blForm.referringDomain} onChange={e => setBlForm({...blForm, referringDomain: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Anchor Text</label>
                <input className={styles.formInput} value={blForm.anchorText} onChange={e => setBlForm({...blForm, anchorText: e.target.value})} />
              </div>
              
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowAddBacklink(false)}>Cancel</button>
                <button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? 'Saving...' : 'Record Backlink'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transition to LINK_ACQUIRED Modal */}
      {transitionTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Link Acquired!</h2>
              <button className={styles.closeButton} onClick={() => setTransitionTarget(null)}>&times;</button>
            </div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#5f5b58' }}>
              Provide the source and target URLs to automatically create the permanent Backlink tracking record.
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              executeStatusChange(transitionTarget.opp.id, 'LINK_ACQUIRED', linkAcquiredForm.targetUrl, linkAcquiredForm.sourceUrl);
            }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Source URL (Where the link lives) *</label>
                <input required type="url" className={styles.formInput} value={linkAcquiredForm.sourceUrl} onChange={e => setLinkAcquiredForm({...linkAcquiredForm, sourceUrl: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Target URL (Your page) *</label>
                <input required type="url" className={styles.formInput} value={linkAcquiredForm.targetUrl} onChange={e => setLinkAcquiredForm({...linkAcquiredForm, targetUrl: e.target.value})} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setTransitionTarget(null)}>Cancel</button>
                <button type="submit" className={styles.primaryButton}>Complete</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
