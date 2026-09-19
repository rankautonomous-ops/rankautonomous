'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Loader2, CreditCard, Plus, X } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { createClient } from '../../../../../lib/supabase/client';
import styles from '../../app.module.css';

// Initialize Stripe outside component
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

function PaymentForm({ clientSecret, onCancel, onSuccess }: { clientSecret: string, onCancel: () => void, onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || 'An error occurred.');
      setLoading(false);
      return;
    }

    const { error: setupError } = await stripe.confirmSetup({
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/app/billing?setup_intent=success`,
      },
      redirect: 'if_required', // Attempt to avoid redirect if possible
    });

    if (setupError) {
      setError(setupError.message || 'Failed to update payment method.');
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PaymentElement />
      {error && <div style={{ color: 'var(--error)', fontSize: '14px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button 
          type="button" 
          onClick={onCancel} 
          disabled={loading}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '8px 16px', fontWeight: 600 }}
        >
          Cancel
        </button>
        <button 
          type="submit" 
          disabled={!stripe || loading}
          className={styles.primaryButton}
          style={{ padding: '8px 24px' }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Save Card'}
        </button>
      </div>
    </form>
  );
}

export function PaymentMethodManager() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchPaymentMethods = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/billing/payment-methods`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      
      if (!res.ok) throw new Error('Failed to fetch payment methods');
      
      const data = await res.json();
      setPaymentMethods(data.paymentMethods || []);
    } catch (err: any) {
      setError(err.message || 'Unable to load payment methods.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const handleStartUpdate = async () => {
    setIsUpdating(true);
    setClientSecret(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/billing/payment-methods/setup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      
      if (!res.ok) throw new Error('Failed to initiate payment method update');
      
      const data = await res.json();
      setClientSecret(data.clientSecret);
    } catch (err: any) {
      alert(err.message || 'Unable to start update.');
      setIsUpdating(false);
    }
  };

  const handleSetupSuccess = () => {
    setIsUpdating(false);
    setClientSecret(null);
    fetchPaymentMethods();
  };

  if (loading && paymentMethods.length === 0 && !isUpdating) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
      </div>
    );
  }

  const defaultCard = paymentMethods[0];

  return (
    <div>
      {error && <div style={{ color: 'var(--error)', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}
      
      {!isUpdating ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: 'var(--surface-soft)', padding: '12px', borderRadius: '8px', color: 'var(--text-secondary)' }}>
              <CreditCard size={24} />
            </div>
            {defaultCard ? (
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ textTransform: 'capitalize' }}>{defaultCard.brand}</span> ending in {defaultCard.last4}
                  <span style={{ background: '#edf7ee', color: '#2e6b3b', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.05em' }}>DEFAULT</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Expires {defaultCard.expMonth}/{defaultCard.expYear}
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>No payment method on file</div>
            )}
          </div>
          <button 
            type="button"
            onClick={handleStartUpdate}
            className={styles.secondaryButton}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} /> Update Card
          </button>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>Update Payment Method</h3>
            <button onClick={() => setIsUpdating(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
          
          {!clientSecret ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
              <PaymentForm 
                clientSecret={clientSecret} 
                onCancel={() => setIsUpdating(false)} 
                onSuccess={handleSetupSuccess} 
              />
            </Elements>
          )}
        </div>
      )}
    </div>
  );
}
