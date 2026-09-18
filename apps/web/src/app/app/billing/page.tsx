'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, CreditCard, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import styles from '../app.module.css';

interface SubscriptionData {
  id: string;
  plan: string;
  interval: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

type BillingState = 'LOADING' | 'SYNCING' | 'ACTIVE' | 'INACTIVE' | 'ERROR';

const MAX_SYNC_ATTEMPTS = 6;
const SYNC_INTERVAL_MS = 1500;

function BillingContent() {
  const searchParams = useSearchParams();
  const checkoutParam = searchParams.get('checkout');
  const successParam = searchParams.get('success');
  const sessionIdParam = searchParams.get('session_id');
  const isCheckoutReturn = checkoutParam === 'success' || successParam === 'true';
  const isCheckoutCancelled = checkoutParam === 'cancelled' || checkoutParam === 'canceled';

  // Single authoritative billing state machine
  const [billingState, setBillingState] = useState<BillingState>(
    isCheckoutReturn ? 'SYNCING' : 'LOADING'
  );
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncAttempt, setSyncAttempt] = useState(1);
  const [showVerifiedBanner, setShowVerifiedBanner] = useState(false);

  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const fetchSubscriptionStatus = useCallback(
    async (attemptCount: number = 1): Promise<void> => {
      try {
        if (!isMountedRef.current) return;

        const supabase = createClient();
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          if (isMountedRef.current) {
            setBillingState('ERROR');
            setErrorMessage('Unable to verify authentication session. Please refresh or log in again.');
          }
          return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const queryParams = new URLSearchParams();
        if (sessionIdParam) {
          queryParams.set('session_id', sessionIdParam);
        }
        const endpointUrl = queryParams.toString()
          ? `${apiUrl}/api/billing/subscription?${queryParams.toString()}`
          : `${apiUrl}/api/billing/subscription`;

        const res = await fetch(endpointUrl, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: 'no-store',
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Billing service returned status ${res.status}`);
        }

        const data = await res.json();
        const fetchedSub: SubscriptionData | null = data.subscription;
        const isEntitledActive =
          Boolean(data.hasActiveSubscription) ||
          fetchedSub?.status === 'ACTIVE' ||
          fetchedSub?.status === 'TRIALING';

        if (!isMountedRef.current) return;

        if (isEntitledActive && fetchedSub) {
          // Authoritative ACTIVE subscription verified
          setSubscription(fetchedSub);
          setBillingState('ACTIVE');
          if (isCheckoutReturn) {
            setShowVerifiedBanner(true);
          }
        } else if (isCheckoutReturn && attemptCount < MAX_SYNC_ATTEMPTS) {
          // Webhook synchronization in-progress; continue polling
          setBillingState('SYNCING');
          setSyncAttempt(attemptCount + 1);

          retryTimerRef.current = setTimeout(() => {
            fetchSubscriptionStatus(attemptCount + 1);
          }, SYNC_INTERVAL_MS);
        } else if (isCheckoutReturn && attemptCount >= MAX_SYNC_ATTEMPTS) {
          // Sync timed out without verified active state
          setBillingState('ERROR');
          setErrorMessage(
            'We received your checkout completion from Stripe, but database activation is taking longer than expected. Please click Retry Verification below.'
          );
        } else {
          // Standard no-subscription / inactive state
          setSubscription(fetchedSub);
          setBillingState('INACTIVE');
        }
      } catch (err: any) {
        if (!isMountedRef.current) return;

        if (isCheckoutReturn && attemptCount < MAX_SYNC_ATTEMPTS) {
          // Retry temporary network error during checkout sync
          retryTimerRef.current = setTimeout(() => {
            fetchSubscriptionStatus(attemptCount + 1);
          }, SYNC_INTERVAL_MS);
        } else {
          setBillingState('ERROR');
          setErrorMessage(err?.message || 'Failed to communicate with billing service.');
        }
      }
    },
    [isCheckoutReturn]
  );

  useEffect(() => {
    fetchSubscriptionStatus(1);
  }, [fetchSubscriptionStatus]);

  const handleManualRetry = () => {
    setErrorMessage(null);
    setBillingState('LOADING');
    fetchSubscriptionStatus(1);
  };

  const handleOpenPortal = async () => {
    setActionLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Authentication session not found.');
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/billing/create-portal-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.message || 'Failed to open customer billing portal.');
      }

      window.location.href = data.url;
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to open billing portal.');
      setActionLoading(false);
    }
  };

  const handleStartCheckout = async (plan: 'monthly' | 'annual') => {
    setActionLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Authentication session not found.');
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/billing/create-checkout-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.message || 'Failed to initiate checkout.');
      }

      window.location.href = data.url;
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to start checkout.');
      setActionLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', width: '100%' }}>
      {/* Header section */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.greetingPrefix}>Subscription</div>
          <h1 className={styles.pageTitle}>Billing &amp; Invoices</h1>
          <p className={styles.pageSubtitle}>
            Manage your RankAutonomous plan, payment methods, and invoices via Stripe.
          </p>
        </div>
      </div>

      {/* Cancellation Banner (Only when returning from cancelled checkout) */}
      {isCheckoutCancelled && billingState === 'INACTIVE' && (
        <div
          style={{
            background: '#fdf6ed',
            border: '1px solid #fae2b6',
            color: '#926412',
            padding: '14px 20px',
            borderRadius: 'var(--radius-sm, 8px)',
            marginBottom: '24px',
            fontSize: '14px',
          }}
        >
          Checkout was cancelled. No charges were made. You can choose a plan below whenever you are ready.
        </div>
      )}

      {/* =========================================================================
          STATE 1: LOADING (Initial data retrieval)
          ========================================================================= */}
      {billingState === 'LOADING' && (
        <div className={styles.card} style={{ textAlign: 'center', padding: '56px 32px' }}>
          <Loader2
            size={36}
            className="animate-spin"
            style={{ margin: '0 auto 16px auto', color: 'var(--text-muted)' }}
          />
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', margin: '0 0 6px 0' }}>
            Checking Subscription Status
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Verifying your current RankAutonomous billing entitlement...
          </p>
        </div>
      )}

      {/* =========================================================================
          STATE 2: SYNCING (Finalizing Stripe checkout webhook synchronization)
          ========================================================================= */}
      {billingState === 'SYNCING' && (
        <div className={styles.card} style={{ textAlign: 'center', padding: '64px 32px' }}>
          <Loader2
            size={40}
            className="animate-spin"
            style={{ margin: '0 auto 20px auto', color: 'var(--accent, #9e3d34)' }}
          />
          <div
            style={{
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--accent, #9e3d34)',
              marginBottom: '8px',
            }}
          >
            Finalizing Subscription
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', margin: '0 0 10px 0' }}>
            We're confirming your Stripe subscription...
          </h2>
          <p
            style={{
              fontSize: '15px',
              color: 'var(--text-secondary)',
              maxWidth: '480px',
              margin: '0 auto 20px auto',
              lineHeight: '1.5',
            }}
          >
            Payment was received by Stripe. Synchronizing your account credentials with the automation engine...
          </p>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Synchronizing database record (check {syncAttempt} of {MAX_SYNC_ATTEMPTS})...
          </div>
        </div>
      )}

      {/* =========================================================================
          STATE 3: ACTIVE (Authoritative verified active subscription)
          ========================================================================= */}
      {billingState === 'ACTIVE' && subscription && (
        <div>
          {/* Verified Activation Banner */}
          {showVerifiedBanner && (
            <div
              style={{
                background: '#edf7ee',
                border: '1px solid #b6e2be',
                color: '#2e6b3b',
                padding: '16px 20px',
                borderRadius: 'var(--radius-sm, 8px)',
                marginBottom: '24px',
                fontSize: '15px',
                lineHeight: '1.5',
              }}
            >
              🎉 <strong>Subscription Activated!</strong> Thank you for subscribing to RankAutonomous. Your SEO automation engine is fully active.
            </div>
          )}

          <div className={styles.card}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                marginBottom: '28px',
              }}
            >
              <div>
                <span className={styles.statLabel}>Current Plan</span>
                <h2
                  style={{
                    fontSize: '26px',
                    fontWeight: 700,
                    color: 'var(--text)',
                    margin: '4px 0 0 0',
                    letterSpacing: '-0.02em',
                  }}
                >
                  RankAutonomous Complete
                </h2>
              </div>
              <span
                style={{
                  background: '#edf7ee',
                  border: '1px solid #b6e2be',
                  color: '#2e6b3b',
                  padding: '6px 16px',
                  borderRadius: 'var(--radius-pill, 9999px)',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {subscription.status}
              </span>
            </div>

            <div className={styles.infoGrid} style={{ marginBottom: '32px' }}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Pricing Rate</span>
                <span className={styles.infoValue}>
                  {subscription.interval === 'year' || subscription.plan === 'annual'
                    ? '$149 / month (billed $1,788 annually)'
                    : '$199 / month'}
                </span>
              </div>

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Next Renewal</span>
                <span className={styles.infoValue}>
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'Active'}
                </span>
              </div>

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Renewal Status</span>
                <span className={styles.infoValue}>
                  {subscription.cancelAtPeriodEnd ? (
                    <span style={{ color: 'var(--error)' }}>Cancels at end of cycle</span>
                  ) : (
                    <span style={{ color: 'var(--success)' }}>Active (Auto-renews)</span>
                  )}
                </span>
              </div>

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Subscription ID</span>
                <span
                  className={styles.infoValue}
                  style={{ fontSize: '13px', color: 'var(--text-secondary)' }}
                >
                  {subscription.id}
                </span>
              </div>
            </div>

            <div
              style={{
                paddingTop: '24px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <button
                type="button"
                onClick={handleOpenPortal}
                disabled={actionLoading}
                className={styles.primaryButton}
              >
                {actionLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Opening Customer Portal...</span>
                  </>
                ) : (
                  <>
                    <CreditCard size={16} />
                    <span>Manage Billing &amp; Invoices</span>
                    <ExternalLink size={14} />
                  </>
                )}
              </button>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Securely powered by Stripe Customer Portal.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STATE 4: INACTIVE (No active subscription)
          ========================================================================= */}
      {billingState === 'INACTIVE' && (
        <div>
          <div
            className={styles.card}
            style={{
              background: 'var(--surface-soft, #f4eee9)',
              borderColor: 'var(--accent, #9e3d34)',
              marginBottom: '32px',
            }}
          >
            <h2 className={styles.cardTitle} style={{ color: '#8c423d' }}>
              <span>⚠️</span> Subscription Required
            </h2>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                lineHeight: '1.6',
                margin: '8px 0 0 0',
              }}
            >
              Your account does not have an active plan. Select a billing option below to unlock automated crawls, daily SEO articles, and keyword strategy.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '24px',
            }}
          >
            {/* Monthly Option */}
            <div
              className={styles.card}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
                  Monthly Billing
                </h3>
                <div
                  style={{
                    fontSize: '40px',
                    fontWeight: 800,
                    color: 'var(--text)',
                    marginBottom: '16px',
                    letterSpacing: '-0.03em',
                  }}
                >
                  $199<span style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: 500 }}> / month</span>
                </div>
                <p
                  style={{
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    marginBottom: '24px',
                    lineHeight: '1.5',
                  }}
                >
                  Complete autonomous SEO engine billed month-to-month. Cancel anytime with zero lock-in.
                </p>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: '0 0 24px 0',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <li style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Check size={16} color="var(--success)" /> 1 Daily AI Article (30/month)
                  </li>
                  <li style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Check size={16} color="var(--success)" /> Continuous Technical Auditing
                  </li>
                  <li style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Check size={16} color="var(--success)" /> Automated CMS Publishing
                  </li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => handleStartCheckout('monthly')}
                disabled={actionLoading}
                className={styles.secondaryButton}
                style={{ width: '100%', height: '48px' }}
              >
                {actionLoading ? 'Connecting...' : 'Subscribe Monthly ($199/mo)'}
              </button>
            </div>

            {/* Annual Option */}
            <div
              className={styles.card}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: '2px solid var(--text)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-13px',
                  right: '24px',
                  background: 'var(--accent-soft, #f8ebe9)',
                  border: '1px solid var(--accent, #9e3d34)',
                  color: '#8c423d',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-pill, 9999px)',
                  letterSpacing: '0.05em',
                }}
              >
                SAVE $600 / YEAR
              </div>

              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
                  Annual Billing
                </h3>
                <div
                  style={{
                    fontSize: '40px',
                    fontWeight: 800,
                    color: 'var(--text)',
                    marginBottom: '16px',
                    letterSpacing: '-0.03em',
                  }}
                >
                  $149<span style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: 500 }}> / month eq.</span>
                </div>
                <p
                  style={{
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    marginBottom: '24px',
                    lineHeight: '1.5',
                  }}
                >
                  Billed annually at $1,788/year. Best value for compounding domain growth.
                </p>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: '0 0 24px 0',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <li style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Check size={16} color="var(--success)" /> Complete RankAutonomous access
                  </li>
                  <li style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Check size={16} color="var(--success)" /> Save 25% compared to monthly
                  </li>
                  <li style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Check size={16} color="var(--success)" /> Priority crawl &amp; AI generation
                  </li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => handleStartCheckout('annual')}
                disabled={actionLoading}
                className={styles.primaryButton}
                style={{ width: '100%', height: '48px' }}
              >
                {actionLoading ? 'Connecting...' : 'Subscribe Annually ($1,788/yr)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STATE 5: ERROR (Failed synchronization or server communication error)
          ========================================================================= */}
      {billingState === 'ERROR' && (
        <div className={styles.card} style={{ textAlign: 'center', padding: '56px 32px' }}>
          <div style={{ fontSize: '36px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
            Unable to verify subscription
          </h2>
          <p
            style={{
              fontSize: '15px',
              color: 'var(--text-secondary)',
              maxWidth: '520px',
              margin: '0 auto 24px auto',
              lineHeight: '1.5',
            }}
          >
            {errorMessage || 'We encountered an error verifying your subscription status. Please try again.'}
          </p>
          <button
            type="button"
            onClick={handleManualRetry}
            className={styles.primaryButton}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
          >
            <RefreshCw size={16} />
            <span>Retry Verification</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      }
    >
      <BillingContent />
    </Suspense>
  );
}
