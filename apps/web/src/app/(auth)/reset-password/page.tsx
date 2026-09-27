'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import styles from '../auth.module.css';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();
      
      // Wait a short moment for supabase to parse the hash/code if present
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setHasSession(true);
      } else {
        setHasSession(false);
      }
      setSessionLoading(false);
    };
    
    checkSession();
  }, []);

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify and try again.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        console.error('Update password error');
        setError('Failed to update password. Please try again.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError('An unexpected error occurred. Please try again later.');
      setLoading(false);
    }
  };

  if (sessionLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <span className={styles.spinner} style={{ borderColor: 'var(--brand-color, #000)', borderRightColor: 'transparent', width: '24px', height: '24px', display: 'inline-block' }} />
        <p style={{ marginTop: '16px', color: '#666' }}>Verifying reset link...</p>
      </div>
    );
  }

  if (!hasSession && !success) {
    return (
      <>
        <h1 className={styles.title}>Password reset link unavailable</h1>
        <p className={styles.subtitle}>
          The link may have expired or already been used.
        </p>
        
        <div className={styles.formGroup} style={{ marginTop: '32px' }}>
          <Link href="/forgot-password" className={styles.submitBtn} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            Request a new reset link
          </Link>
        </div>

        <p className={styles.footerText}>
          <Link href="/login" className={styles.footerLink}>
            Back to Sign In
          </Link>
        </p>
      </>
    );
  }

  if (success) {
    return (
      <>
        <h1 className={styles.title}>Password updated successfully</h1>
        <p className={styles.subtitle}>
          Your password has been changed. You can now sign in with your new password.
        </p>
        
        <div className={styles.formGroup} style={{ marginTop: '32px' }}>
          <Link href="/login" className={styles.submitBtn} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            Sign In
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>Reset your password</h1>
      <p className={styles.subtitle}>
        Create a new password for your account.
      </p>

      {error && <div className={styles.errorBanner} aria-live="assertive">{error}</div>}

      <form onSubmit={handlePasswordUpdate} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="password" className={styles.label}>
            New password
          </label>
          <div className={styles.inputWrapper}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={styles.input}
              disabled={loading}
              aria-required="true"
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? '👁‍🗨' : '👁'}
            </button>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="confirmPassword" className={styles.label}>
            Confirm password
          </label>
          <div className={styles.inputWrapper}>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className={styles.input}
              disabled={loading}
              aria-required="true"
            />
          </div>
        </div>

        <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '24px', lineHeight: '1.6' }}>
          <strong>Password requirements:</strong><br />
          ✓ Minimum 8 characters<br />
          ✓ Passwords must match
        </div>

        <button type="submit" disabled={loading} className={styles.submitBtn}>
          {loading ? (
            <>
              <span className={styles.spinner} />
              <span>Updating password...</span>
            </>
          ) : (
            'Update Password'
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
