'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import styles from './backlinks.module.css';

interface DiscoveryModalProps {
  websiteId: string;
  accessToken: string;
  apiUrl: string;
  onClose: () => void;
  onDiscover: (candidates: any[]) => void;
}

export default function DiscoveryModal({ websiteId, accessToken, apiUrl, onClose, onDiscover }: DiscoveryModalProps) {
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState('');
  const [keyword, setKeyword] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [error, setError] = useState('');

  const handleDiscover = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/websites/${websiteId}/backlinks/discover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ topic, keyword, competitor }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Discovery failed');

      onDiscover(data.candidates || []);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h3>Discover Opportunities</h3>
        {error && <div className={styles.errorMessage}>{error}</div>}
        
        <div className={styles.formGroup}>
          <label>Target Topic</label>
          <input className={styles.input} value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. B2B SaaS" />
        </div>
        
        <div className={styles.formGroup}>
          <label>Target Keyword (Optional)</label>
          <input className={styles.input} value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. saas pricing models" />
        </div>
        
        <div className={styles.formGroup}>
          <label>Competitor Domain (Optional)</label>
          <input className={styles.input} value={competitor} onChange={e => setCompetitor(e.target.value)} placeholder="e.g. competitor.com" />
        </div>

        <div className={styles.modalActions}>
          <button className={styles.secondaryButton} onClick={onClose} disabled={loading}>Cancel</button>
          <button className={styles.primaryButton} onClick={handleDiscover} disabled={loading}>
            {loading ? <Loader2 className={styles.spinner} /> : 'Discover'}
          </button>
        </div>
      </div>
    </div>
  );
}
