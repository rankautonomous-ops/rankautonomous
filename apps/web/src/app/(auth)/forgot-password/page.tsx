'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import styles from '../auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const redirectUrl = `${window.location.origin}/reset-password`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset link. Please try again.');
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className={styles.title}>Reset your password</h1>
      <p className={styles.subtitle}>
        Enter your account email and we&apos;ll send you a password reset link.
      </p>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {success && (
        <div className={styles.successBanner}>
          Password reset instructions have been sent to <strong>{email}</strong>. Please check your inbox and spam folders.
        </div>
      )}

      {!success && (
        <form onSubmit={handleResetRequest} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>
              Email address
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
      )}

      <p className={styles.footerText}>
        Remember your password?
        <Link href="/login" className={styles.footerLink}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}
