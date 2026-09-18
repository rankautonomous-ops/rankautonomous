'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../../../lib/supabase/client';
import styles from '../app.module.css';

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email || '');
        setName(user.user_metadata?.name || '');
      }
    });
  }, []);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setProfileLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: { name: name.trim() },
      });

      if (error) {
        setProfileError(error.message);
        setProfileLoading(false);
        return;
      }

      setProfileSuccess('Profile updated successfully!');
      setProfileLoading(false);
    } catch (err: any) {
      setProfileError(err?.message || 'Failed to update profile.');
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setPasswordError(error.message);
        setPasswordLoading(false);
        return;
      }

      setPasswordSuccess('Password changed successfully!');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordLoading(false);
    } catch (err: any) {
      setPasswordError(err?.message || 'Failed to change password.');
      setPasswordLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.greetingPrefix}>Settings</div>
          <h1 className={styles.pageTitle}>Profile &amp; Security</h1>
          <p className={styles.pageSubtitle}>
            Manage your personal credentials, workspace profile, and password.
          </p>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Personal Information</h2>
        <p className={styles.cardDescription} style={{ marginBottom: '20px' }}>
          Your display name and registered email address.
        </p>

        {profileSuccess && <div className={styles.successBanner}>{profileSuccess}</div>}
        {profileError && <div className={styles.errorBanner}>{profileError}</div>}

        <form onSubmit={handleProfileUpdate} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>
              Email address
            </label>
            <input
              id="email"
              type="email"
              disabled
              value={email}
              className={styles.input}
              style={{ opacity: 0.7, cursor: 'not-allowed', background: 'var(--surface-soft)' }}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="name" className={styles.label}>
              Full name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className={styles.input}
              disabled={profileLoading}
            />
          </div>

          <div>
            <button type="submit" disabled={profileLoading} className={styles.primaryButton}>
              {profileLoading ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Change Password</h2>
        <p className={styles.cardDescription} style={{ marginBottom: '20px' }}>
          Ensure your account stays secure with a strong password.
        </p>

        {passwordSuccess && <div className={styles.successBanner}>{passwordSuccess}</div>}
        {passwordError && <div className={styles.errorBanner}>{passwordError}</div>}

        <form onSubmit={handlePasswordChange} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="newPassword" className={styles.label}>
              New password (min 8 characters)
            </label>
            <input
              id="newPassword"
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className={styles.input}
              disabled={passwordLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword" className={styles.label}>
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className={styles.input}
              disabled={passwordLoading}
            />
          </div>

          <div>
            <button type="submit" disabled={passwordLoading} className={styles.primaryButton}>
              {passwordLoading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
