'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Loader2 } from 'lucide-react';
import styles from './marketing.module.css';

interface HeaderNavProps {
  sessionUser: boolean;
}

export default function HeaderNav({ sessionUser }: HeaderNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const closeMenu = () => setIsOpen(false);

  // Proactively ping the backend API in the background on mount to wake up Render if asleep
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://rankautonomous-api.onrender.com';
    fetch(`${apiUrl.replace(/\/+$/, '')}/health`, { mode: 'no-cors' }).catch(() => {});
  }, []);

  const prewarmBackend = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://rankautonomous-api.onrender.com';
    fetch(`${apiUrl.replace(/\/+$/, '')}/health`, { mode: 'no-cors' }).catch(() => {});
  };

  return (
    <>
      {/* Desktop Navigation */}
      <nav className={styles.navigation} aria-label="Main Navigation">
        <Link href="/features" className={styles.navItem}>Features</Link>
        <Link href="/how-it-works" className={styles.navItem}>How It Works</Link>
        <Link href="/pricing" className={styles.navItem}>Pricing</Link>
        <Link href="/blog" className={styles.navItem}>Blog</Link>
        <Link href="/faq" className={styles.navItem}>FAQ</Link>
      </nav>

      {/* Desktop Action Buttons */}
      <div className={styles.actions}>
        {sessionUser ? (
          <Link
            href="/app"
            className={styles.primaryAction}
            onClick={() => setIsNavigating(true)}
            onMouseEnter={prewarmBackend}
            onFocus={prewarmBackend}
          >
            {isNavigating ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Opening...
              </span>
            ) : (
              'Open Workspace →'
            )}
          </Link>
        ) : (
          <>
            <Link href="/login" className={styles.loginAction}>
              Log in
            </Link>
            <Link href="/signup" className={styles.primaryAction}>
              Start Growing →
            </Link>
          </>
        )}
      </div>

      {/* Mobile Menu Trigger */}
      <button
        type="button"
        className={styles.mobileMenuButton}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
      >
        {isOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Mobile Drawer / Dropdown */}
      {isOpen && (
        <div className={styles.mobileDrawerBackdrop} onClick={closeMenu}>
          <div
            className={styles.mobileDrawer}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.mobileNavLinks}>
              <Link href="/features" className={styles.mobileNavItem} onClick={closeMenu}>
                Features
              </Link>
              <Link href="/how-it-works" className={styles.mobileNavItem} onClick={closeMenu}>
                How It Works
              </Link>
              <Link href="/pricing" className={styles.mobileNavItem} onClick={closeMenu}>
                Pricing
              </Link>
              <Link href="/blog" className={styles.mobileNavItem} onClick={closeMenu}>
                Blog
              </Link>
              <Link href="/faq" className={styles.mobileNavItem} onClick={closeMenu}>
                FAQ
              </Link>
            </div>

            <div className={styles.mobileDivider} />

            <div className={styles.mobileActions}>
              {sessionUser ? (
                <Link
                  href="/app"
                  className={styles.mobilePrimaryAction}
                  onClick={() => {
                    setIsNavigating(true);
                    closeMenu();
                  }}
                >
                  {isNavigating ? 'Opening Workspace...' : 'Open Workspace →'}
                </Link>
              ) : (
                <>
                  <Link href="/login" className={styles.mobileLoginAction} onClick={closeMenu}>
                    Log in
                  </Link>
                  <Link href="/signup" className={styles.mobilePrimaryAction} onClick={closeMenu}>
                    Start Growing →
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
