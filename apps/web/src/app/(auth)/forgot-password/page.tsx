'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import styles from '../auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResetRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (cooldown > 0) return;
    
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      const redirectUrl = `${baseUrl}/reset-password`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (resetError) {
        // Obscure whether account exists or not
        console.error('Password reset request failed');
        // We still show success to not leak email existence, unless it's a rate limit error
        if (resetError.status === 429) {
          setError('Too many requests. Please try again later.');
          setLoading(false);
          return;
        }
      }

      setSuccess(true);
      setCooldown(60); // 60 seconds cooldown for resend
      setLoading(false);
    } catch (err: any) {
      // Don't expose raw API errors
      console.error(err);
      setError('An unexpected error occurred. Please try again later.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <>
        <h1 className={styles.title}>Check your email</h1>
        <p className={styles.subtitle}>
          We've sent password reset instructions if an account exists for that email.
        </p>

        {error && <div className={styles.errorBanner} aria-live="assertive">{error}</div>}

        <div className={styles.formGroup} style={{ marginTop: '24px' }}>
          <button 
            type="button" 
            onClick={() => handleResetRequest()} 
            disabled={loading || cooldown > 0} 
            className={styles.submitBtn}
          >
            {loading ? (
              <>
                <span className={styles.spinner} />
                <span>Sending...</span>
              </>
            ) : cooldown > 0 ? (
              `Resend email in ${cooldown}s`
            ) : (
              'Resend email'
            )}
          </button>
        </div>

        <p className={styles.footerText}>
          <Link href="/login" className={styles.footerLink}>
            Back to Sign In
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>Forgot Password</h1>
      <p className={styles.subtitle}>
        Enter the email associated with your account.
      </p>

      {error && <div className={styles.errorBanner} aria-live="assertive">{error}</div>}

      <form onSubmit={handleResetRequest} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="email" className={styles.label}>
            Email
          </label>
          <div className={styles.inputWrapper}>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={styles.input}
              disabled={loading}
              aria-required="true"
            />
          </div>
        </div>

        <button type="submit" disabled={loading} className={styles.submitBtn}>
          {loading ? (
            <>
              <span className={styles.spinner} />
              <span>Sending link...</span>
            </>
          ) : (
            'Send Reset Link'
          )}
        </button>
      </form>

      <p className={styles.footerText}>
        <Link href="/login" className={styles.footerLink}>
          Back to Sign In
        </Link>
      </p>
    </>
  );
}
