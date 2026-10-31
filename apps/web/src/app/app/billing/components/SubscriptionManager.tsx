'use client';

import { useState } from 'react';
import { Loader2, AlertTriangle, Play, CheckCircle2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '../../../../lib/api';

interface SubscriptionManagerProps {
  subscriptionId?: string;
  cancelAtPeriodEnd: boolean;
  effectiveDate?: string | null;
  planName?: string;
  isTrial?: boolean;
  subsequentAmount?: string;
  onUpdate: () => void;
}

export function SubscriptionManager({
  subscriptionId,
  cancelAtPeriodEnd,
  effectiveDate,
  planName = 'Subscription',
  isTrial = false,
  subsequentAmount = '$149.00/month',
  onUpdate,
}: SubscriptionManagerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const formattedDate = effectiveDate
    ? new Date(effectiveDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'the end of your current cycle';

  const handleOpenConfirm = () => {
    setError(null);
    setShowConfirmModal(true);
  };

  const handleConfirmToggle = async () => {
    setLoading(true);
    setError(null);

    const willCancel = !cancelAtPeriodEnd;

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to modify your subscription.');
      }

      const res = await apiFetch(`/api/billing/subscription/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cancel: willCancel }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update cancellation status.');
      }

      setShowConfirmModal(false);
      setSuccessNotice(
        willCancel
          ? isTrial
            ? `Trial cancellation confirmed. You retain full access until ${formattedDate}. You will NOT be charged ${subsequentAmount}.`
            : `Subscription cancellation confirmed. You retain access until ${formattedDate}. No further charges will occur.`
          : 'Subscription renewal has been resumed successfully.'
      );
      onUpdate();
    } catch (err: any) {
      console.error('[Subscription Cancel Error]:', err);
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px solid var(--border)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', marginBottom: '16px' }}>
        Subscription Management &amp; Cancellation
      </h3>

      {successNotice && (
        <div
          style={{
            background: '#edf7ee',
            border: '1px solid #b6e2be',
            color: '#2e6b3b',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successNotice}</span>
        </div>
      )}

      {error && !showConfirmModal && (
        <div
          style={{
            background: '#fdf6ed',
            border: '1px solid #fae2b6',
            color: '#9e3d34',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          background: cancelAtPeriodEnd ? '#fdf6ed' : 'var(--surface-soft)',
          padding: '20px',
          borderRadius: '8px',
          border: cancelAtPeriodEnd ? '1px solid #fae2b6' : '1px solid var(--border)',
        }}
      >
        <div style={{ maxWidth: '520px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {cancelAtPeriodEnd
                ? isTrial
                  ? 'Trial Scheduled to Cancel'
                  : 'Subscription Scheduled to Cancel'
                : isTrial
                ? 'Cancel 3-Day Trial'
                : 'Cancel Subscription'}
            </h4>
            {cancelAtPeriodEnd && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#fae2b6',
                  color: '#926412',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  textTransform: 'uppercase',
                }}
              >
                Cancelling
              </span>
            )}
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
            {cancelAtPeriodEnd
              ? isTrial
                ? `Your trial is set to cancel. Full access remains active until ${formattedDate}. You will NOT be billed the ${subsequentAmount} fee.`
                : `Your subscription will cancel at the end of your billing cycle on ${formattedDate}. You will not be charged again.`
              : isTrial
              ? `Cancel your $1 trial anytime before it renews. You will retain full access until ${formattedDate} without being charged ${subsequentAmount}.`
              : `Cancel your subscription easily. You retain full access to all features until ${formattedDate}.`}
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenConfirm}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '14px',
            cursor: loading ? 'not-allowed' : 'pointer',
            border: cancelAtPeriodEnd ? '1px solid #b6e2be' : '1px solid #fae2b6',
            background: cancelAtPeriodEnd ? '#edf7ee' : '#ffffff',
            color: cancelAtPeriodEnd ? '#2e6b3b' : '#9e3d34',
            opacity: loading ? 0.7 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : cancelAtPeriodEnd ? (
            <Play size={16} />
          ) : (
            <AlertTriangle size={16} />
          )}
          <span>
            {cancelAtPeriodEnd
              ? isTrial
                ? 'Resume Trial Auto-Billing'
                : 'Resume Subscription'
              : isTrial
              ? 'Cancel $1 Trial'
              : 'Cancel Subscription'}
          </span>
        </button>
      </div>

      {/* Confirmation Modal with Detailed Cancellation Disclosure */}
      {showConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'var(--surface, #ffffff)',
              borderRadius: '12px',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                {cancelAtPeriodEnd
                  ? isTrial
                    ? 'Resume Trial Renewal?'
                    : 'Resume Subscription?'
                  : isTrial
                  ? 'Cancel Your $1 Trial?'
                  : 'Cancel Your Subscription?'}
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Applicable cancellation details */}
            <div
              style={{
                background: cancelAtPeriodEnd ? '#edf7ee' : '#fdf6ed',
                border: cancelAtPeriodEnd ? '1px solid #b6e2be' : '1px solid #fae2b6',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '16px',
                fontSize: '14px',
                lineHeight: 1.5,
              }}
            >
              {cancelAtPeriodEnd ? (
                <div>
                  <strong>Resuming Renewal:</strong>
                  <p style={{ margin: '6px 0 0 0', color: '#2e6b3b' }}>
                    {isTrial
                      ? `Your trial will remain active and automatically renew at ${subsequentAmount} on ${formattedDate}.`
                      : `Your subscription will continue to renew automatically on ${formattedDate}.`}
                  </p>
                </div>
              ) : (
                <div>
                  <strong style={{ color: '#9e3d34' }}>Cancellation Details:</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#926412', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>
                      <strong>Access End Date:</strong> Full access remains active until <strong>{formattedDate}</strong>.
                    </li>
                    <li>
                      <strong>No Future Charges:</strong> You will <strong>NOT</strong> be billed the{' '}
                      <strong>{subsequentAmount}</strong> fee.
                    </li>
                    <li>
                      <strong>Easy Reactivation:</strong> You can resume auto-renewal anytime before {formattedDate}.
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {error && (
              <div
                style={{
                  background: '#fdf6ed',
                  border: '1px solid #fae2b6',
                  color: '#9e3d34',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  fontSize: '13px',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Keep Current Plan
              </button>
              <button
                type="button"
                onClick={handleConfirmToggle}
                disabled={loading}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  background: cancelAtPeriodEnd ? '#2e6b3b' : '#9e3d34',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                <span>
                  {loading
                    ? 'Updating in Stripe...'
                    : cancelAtPeriodEnd
                    ? 'Confirm Resume'
                    : isTrial
                    ? 'Confirm Trial Cancellation'
                    : 'Confirm Cancellation'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
