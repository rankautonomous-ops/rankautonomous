'use client';

import { useState } from 'react';
import { Loader2, AlertTriangle, Play } from 'lucide-react';
import { createClient } from '../../../../../lib/supabase/client';
import styles from '../../app.module.css';

interface SubscriptionManagerProps {
  subscriptionId: string;
  cancelAtPeriodEnd: boolean;
  onUpdate: () => void;
}

export function SubscriptionManager({ subscriptionId, cancelAtPeriodEnd, onUpdate }: SubscriptionManagerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCancellation = async () => {
    if (cancelAtPeriodEnd) {
      // Trying to resume
      const confirmResume = window.confirm('Are you sure you want to resume your subscription? Your auto-renewal will be reactivated.');
      if (!confirmResume) return;
    } else {
      // Trying to cancel
      const confirmCancel = window.confirm('Are you sure you want to cancel your subscription? You will lose access to all premium features at the end of your billing cycle.');
      if (!confirmCancel) return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/billing/subscription/cancel`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cancel: !cancelAtPeriodEnd }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to update subscription status');
      }
      
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', marginBottom: '16px' }}>Danger Zone</h3>
      
      {error && <div style={{ color: 'var(--error)', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', background: 'var(--surface-soft)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <div>
          <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px 0' }}>
            {cancelAtPeriodEnd ? 'Resume Subscription' : 'Cancel Subscription'}
          </h4>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, maxWidth: '400px', lineHeight: '1.5' }}>
            {cancelAtPeriodEnd 
              ? 'Your subscription is scheduled to cancel at the end of the billing period. Resume now to keep your access active.' 
              : 'Cancel your subscription. You will retain access until the end of your current billing period.'}
          </p>
        </div>
        
        <button 
          onClick={toggleCancellation}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '14px',
            cursor: loading ? 'not-allowed' : 'pointer',
            border: 'none',
            background: cancelAtPeriodEnd ? '#edf7ee' : '#fdf6ed',
            color: cancelAtPeriodEnd ? '#2e6b3b' : '#9e3d34',
            opacity: loading ? 0.7 : 1,
            transition: 'opacity 0.2s'
          }}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : cancelAtPeriodEnd ? (
            <Play size={16} />
          ) : (
            <AlertTriangle size={16} />
          )}
          {cancelAtPeriodEnd ? 'Resume Subscription' : 'Cancel Subscription'}
        </button>
      </div>
    </div>
  );
}
