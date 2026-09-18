import React from 'react';
import Card from './Card';

export interface StatCardProps {
  label: string;
  value: string | number | null | undefined;
  change?: string | null;
  changeType?: 'positive' | 'negative' | 'neutral';
  subtext?: string;
  badge?: string;
}

export const StatCard = ({
  label,
  value,
  change,
  changeType = 'positive',
  subtext,
  badge,
}: StatCardProps) => {
  const isAvailable = value !== null && value !== undefined && value !== '';
  const displayValue = isAvailable ? value : 'Not available';

  const changeColors: Record<string, string> = {
    positive: 'var(--success, #6f9b7c)',
    negative: 'var(--error, #c66f6f)',
    neutral: 'var(--text-muted, #8b8580)',
  };

  return (
    <Card
      variant="surface"
      radius="lg"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px',
        minHeight: '130px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #5f5b58)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </span>
        {badge && (
          <span style={{ fontSize: '11px', fontWeight: 600, background: 'var(--surface-soft, #fbf8f5)', border: '1px solid var(--border, #ded9d4)', padding: '2px 8px', borderRadius: 'var(--radius-pill, 999px)', color: 'var(--text-muted, #8b8580)' }}>
            {badge}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: 'auto' }}>
        <span
          style={{
            fontSize: isAvailable ? 'clamp(28px, 3vw, 36px)' : '20px',
            fontWeight: 700,
            color: isAvailable ? 'var(--text, #111111)' : 'var(--text-muted, #8b8580)',
            lineHeight: 1,
            letterSpacing: '-0.5px',
          }}
        >
          {displayValue}
        </span>

        {isAvailable && change && (
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: changeColors[changeType],
            }}
          >
            {change}
          </span>
        )}
      </div>

      {subtext && (
        <span style={{ fontSize: '12px', color: 'var(--text-muted, #8b8580)', marginTop: '6px' }}>
          {subtext}
        </span>
      )}
    </Card>
  );
};

export default StatCard;
