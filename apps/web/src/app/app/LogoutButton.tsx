'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import styles from './app.module.css';

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <button onClick={handleLogout} className={styles.logoutBtn} type="button">
      Sign Out
    </button>
  );
}
