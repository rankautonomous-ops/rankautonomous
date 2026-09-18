'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import styles from './integrations.module.css';

import { createClient } from '../../../lib/supabase/client';

interface Property {
  id: string; // Internal identifier for the radio button
  name: string;
  url?: string;
  meta?: string;
  raw: any; // The original object
}

interface PropertySelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  provider: 'SEARCH_CONSOLE' | 'ANALYTICS';
  fetchUrl: string;
  submitUrl: string;
  websiteId: string;
  onSuccess: () => void;
}

export default function PropertySelectionModal({
  isOpen,
  onClose,
  title,
  provider,
  fetchUrl,
  submitUrl,
  websiteId,
  onSuccess,
}: PropertySelectionModalProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const supabase = createClient();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    if (!isOpen) {
      setProperties([]);
      setError(null);
      setSelectedId(null);
      return;
    }

    const fetchProperties = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const res = await fetch(`${apiUrl}${fetchUrl}?websiteId=${websiteId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.message || 'Failed to load properties');
        }

        if (data.properties && Array.isArray(data.properties)) {
          const mapped: Property[] = data.properties.map((p: any) => {
            if (provider === 'SEARCH_CONSOLE') {
              return {
                id: p.siteUrl,
                name: p.siteUrl,
                meta: `Permission: ${p.permissionLevel}`,
                raw: p,
              };
            } else {
              return {
                id: p.propertyId,
                name: p.propertyName,
                meta: `Account: ${p.accountName} (${p.accountId})`,
                raw: p,
              };
            }
          });
          setProperties(mapped);
          
          if (mapped.length > 0) {
            setSelectedId(mapped[0].id);
          }
        } else {
          setProperties([]);
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching properties.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProperties();
  }, [isOpen, websiteId, fetchUrl, provider, supabase, apiUrl]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!selectedId) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const selectedProp = properties.find((p) => p.id === selectedId);
      if (!selectedProp) throw new Error('Invalid selection');

      const payload = provider === 'SEARCH_CONSOLE' 
        ? { websiteId, siteUrl: selectedProp.raw.siteUrl }
        : { websiteId, propertyId: selectedProp.raw.propertyId };

      const res = await fetch(`${apiUrl}${submitUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to save property selection');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving the property.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button onClick={onClose} className={styles.closeButton} disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.modalBody}>
          {error && (
            <div className={`${styles.alert} ${styles.error}`}>
              {error}
            </div>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Loader2 className={styles.spinner} size={24} color="var(--text-muted)" />
            </div>
          ) : properties.length === 0 && !error ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              No properties found for this account.
            </div>
          ) : (
            <div className={styles.propertyList}>
              {properties.map((prop) => (
                <div 
                  key={prop.id}
                  className={`${styles.propertyOption} ${selectedId === prop.id ? styles.selected : ''}`}
                  onClick={() => !isSubmitting && setSelectedId(prop.id)}
                >
                  <input
                    type="radio"
                    name="property-selection"
                    className={styles.propertyRadio}
                    checked={selectedId === prop.id}
                    onChange={() => !isSubmitting && setSelectedId(prop.id)}
                    disabled={isSubmitting}
                  />
                  <div>
                    <div className={styles.propertyOptionName}>{prop.name}</div>
                    {prop.meta && <div className={styles.propertyOptionMeta}>{prop.meta}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button 
            className={styles.secondaryButton} 
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button 
            className={styles.primaryButton}
            onClick={handleSubmit}
            disabled={isLoading || isSubmitting || !selectedId || properties.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className={styles.spinner} size={16} />
                Saving...
              </>
            ) : (
              'Confirm Selection'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
