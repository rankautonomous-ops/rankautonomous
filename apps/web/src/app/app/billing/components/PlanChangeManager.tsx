'use client';

import { useState } from 'react';
import { Sparkles, Check, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PRICING_CONFIG } from '@/lib/pricing';
import { apiFetch } from '../../../../lib/api';

interface PlanChangeManagerProps {
  currentPlan: string; // 'monthly' | 'annual' | 'trial' | string
  isCancelling?: boolean;
  onUpdate: () => void;
}

export function PlanChangeManager({
  currentPlan,
  isCancelling = false,
  onUpdate,
}: PlanChangeManagerProps) {
  const [loading, setLoading] = useState(false);
  const [targetPlan, setTargetPlan] = useState<'monthly' | 'annual' | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const planNormalized = currentPlan?.toLowerCase() || 'monthly';
  const isTrial = planNormalized.includes('trial');
  const isMonthly = planNormalized.includes('month') && !isTrial;
  const isAnnual = planNormalized.includes('annual') || planNormalized.includes('year');

  const handleOpenModal = (plan: 'monthly' | 'annual') => {
    setTargetPlan(plan);
    setError(null);
    setShowModal(true);
  };

  const handleExecutePlanChange = async () => {
    if (!targetPlan) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('You must be logged in to modify your subscription.');
      }

      const res = await apiFetch(`/api/billing/subscription/change-plan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPlan: targetPlan }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update subscription plan.');
      }

      setSuccessMessage(data.message || `Successfully changed plan to ${targetPlan}.`);
      setShowModal(false);
      onUpdate();
    } catch (err: any) {
      console.error('[Change Plan Error]:', err);
      setError(err?.message || 'Failed to update plan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '36px', paddingTop: '32px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px 0' }}>
            Change or Upgrade Plan
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
            Switch plans anytime. Changes take effect immediately with automated Stripe proration.
          </p>
        </div>
      </div>

      {successMessage && (
        <div style={{ background: '#edf7ee', border: '1px solid #b6e2be', color: '#2e6b3b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          ✓ {successMessage}
        </div>
      )}

      {error && !showModal && (
        <div style={{ background: '#fdf6ed', border: '1px solid #fae2b6', color: '#9e3d34', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        {/* Annual Option */}
        <div
          style={{
            background: isAnnual ? 'var(--surface-soft)' : 'var(--surface)',
            border: isAnnual ? '2px solid var(--border)' : '2px solid #2e6b3b',
            borderRadius: '10px',
            padding: '20px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {!isAnnual && (
            <div
              style={{
                position: 'absolute',
                top: '-12px',
                right: '16px',
                background: '#2e6b3b',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '9999px',
                letterSpacing: '0.04em',
              }}
            >
              SAVE $600 / YEAR
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Annual Plan
              </h4>
              {isAnnual && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--border)', padding: '2px 8px', borderRadius: '4px' }}>
                  Current Plan
                </span>
              )}
            </div>

            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px', letterSpacing: '-0.02em' }}>
              $99<span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}> / month eq.</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.4 }}>
              Billed annually at $1,188/year. Best long-term value for compounding search authority.
            </p>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', fontSize: '13px', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Check size={14} color="#2e6b3b" /> Save $600/year over monthly billing
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Check size={14} color="#2e6b3b" /> 30 publish-ready AI articles per month
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Check size={14} color="#2e6b3b" /> Autonomous backlinks &amp; verification
              </li>
            </ul>
          </div>

          {!isAnnual ? (
            <button
              type="button"
              onClick={() => handleOpenModal('annual')}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: '#2e6b3b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Sparkles size={16} />
              <span>Upgrade to Annual (Save $600)</span>
            </button>
          ) : (
            <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)', padding: '8px 0' }}>
              ✓ You are on the best value annual plan
            </div>
          )}
        </div>

        {/* Monthly Option */}
        <div
          style={{
            background: isMonthly ? 'var(--surface-soft)' : 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Monthly Plan
              </h4>
              {isMonthly && (
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--border)', padding: '2px 8px', borderRadius: '4px' }}>
                  Current Plan
                </span>
              )}
            </div>

            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px', letterSpacing: '-0.02em' }}>
              $149<span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}> / month</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.4 }}>
              Flexible month-to-month subscription. Cancel anytime without lock-in.
            </p>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', fontSize: '13px', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Check size={14} color="var(--success)" /> 1 Daily AI article (30/month)
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Check size={14} color="var(--success)" /> Continuous technical audits
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Check size={14} color="var(--success)" /> Automated CMS publishing
              </li>
            </ul>
          </div>

          {!isMonthly ? (
            <button
              type="button"
              onClick={() => handleOpenModal('monthly')}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: 'var(--surface)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>{isTrial ? 'Activate Monthly ($149/mo)' : 'Switch to Monthly ($149/mo)'}</span>
            </button>
          ) : (
            <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)', padding: '8px 0' }}>
              ✓ You are on the monthly plan
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showModal && targetPlan && (
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
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: '0 0 8px 0' }}>
              Confirm Plan Change to {targetPlan === 'annual' ? 'Annual Plan' : 'Monthly Plan'}
            </h3>

            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              {targetPlan === 'annual' ? (
                <>
                  You are upgrading to the <strong>Annual Plan</strong> at <strong>$99/month equivalent ($1,188/year)</strong>, saving $600 compared to monthly billing.
                  {isTrial && ' Your trial will graduate immediately to the annual plan.'}
                  {isMonthly && ' Any remaining balance on your current month will be automatically prorated in Stripe.'}
                </>
              ) : (
                <>
                  You are switching to the <strong>Monthly Plan</strong> at <strong>$149.00/month</strong>.
                  {isTrial && ' Your trial will graduate immediately to monthly subscription.'}
                </>
              )}
            </p>

            {error && (
              <div style={{ background: '#fdf6ed', border: '1px solid #fae2b6', color: '#9e3d34', padding: '10px 12px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
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
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePlanChange}
                disabled={loading}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  background: targetPlan === 'annual' ? '#2e6b3b' : 'var(--text)',
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
                <span>{loading ? 'Updating in Stripe...' : `Confirm Change to ${targetPlan === 'annual' ? 'Annual' : 'Monthly'}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

