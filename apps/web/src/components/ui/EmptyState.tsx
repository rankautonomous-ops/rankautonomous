import React from 'react';
import Card from './Card';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  whyItMatters?: string;
  action?: React.ReactNode;
}

export const EmptyState = ({
  icon,
  title,
  description,
  whyItMatters,
  action,
}: EmptyStateProps) => {
  return (
    <Card
      variant="soft"
      radius="xl"
      style={{
        textAlign: 'center',
        padding: 'clamp(32px, 5vw, 64px) 24px',
        maxWidth: '680px',
        margin: '0 auto',
      }}
    >
      {icon && (
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-md, 16px)',
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border, #ded9d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: 'var(--text-secondary, #5f5b58)',
          }}
        >
          {icon}
        </div>
      )}

      <h3
        style={{
          fontSize: '22px',
          fontWeight: 600,
          color: 'var(--text, #111111)',
          marginBottom: '10px',
          letterSpacing: '-0.3px',
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: '15px',
          color: 'var(--text-secondary, #5f5b58)',
          lineHeight: 1.6,
          marginBottom: whyItMatters ? '12px' : '24px',
          maxWidth: '520px',
          marginInline: 'auto',
        }}
      >
        {description}
      </p>

      {whyItMatters && (
        <p
          style={{
            fontSize: '13px',
            color: 'var(--text-muted, #8b8580)',
            lineHeight: 1.5,
            marginBottom: '24px',
            maxWidth: '480px',
            marginInline: 'auto',
          }}
        >
          {whyItMatters}
        </p>
      )}

      {action && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
          {action}
        </div>
      )}
    </Card>
  );
};

export default EmptyState;
