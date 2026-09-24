import { Suspense } from 'react';
import CompetitorsDashboard from './CompetitorsDashboard';
import styles from '../app.module.css';

export default function CompetitorsPage() {
  return (
    <div style={{ padding: '0' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>Competitor Research</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Analyze competitors to find content gaps and keyword opportunities using AI.
        </p>
      </header>

      <Suspense fallback={<div>Loading competitors...</div>}>
        <CompetitorsDashboard />
      </Suspense>
    </div>
  );
}
