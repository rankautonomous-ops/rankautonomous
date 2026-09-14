import Link from 'next/link';
import styles from '../auth.module.css';

export default function VerifyEmailPage() {
  return (
    <>
      <h1 className={styles.title}>Verify your email</h1>
      <p className={styles.subtitle}>
        A confirmation link has been sent to your email address. Please click the link inside the email to complete your registration and activate your account.
      </p>

      <div className={styles.successBanner}>
        Tip: If you don&apos;t see the email within a few minutes, please check your spam or junk folder.
      </div>

      <div style={{ marginTop: '24px' }}>
        <Link href="/login" className={styles.submitBtn} style={{ textDecoration: 'none' }}>
          Back to Sign In
        </Link>
      </div>
    </>
  );
}
