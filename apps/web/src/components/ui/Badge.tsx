import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'error' | 'ai';
  pill?: boolean;
}

export const Badge = ({
  variant = 'default',
  pill = true,
  children,
  style,
  className = '',
  ...props
}: BadgeProps) => {
  const variantStyles: Record<string, React.CSSProperties> = {
    default: {
      background: 'var(--surface-soft, #fbf8f5)',
      color: 'var(--text-secondary, #5f5b58)',
      border: '1px solid var(--border, #ded9d4)',
    },
    accent: {
      background: 'var(--accent-soft, #f6d8d5)',
      color: '#8b4b47',
      border: '1px solid var(--accent, #e8aaa6)',
    },
    success: {
      background: 'var(--success-soft, #eaf3ed)',
      color: '#3b6647',
      border: '1px solid rgba(111, 155, 124, 0.4)',
    },
    warning: {
      background: 'var(--warning-soft, #faf3e8)',
      color: '#825e27',
      border: '1px solid rgba(198, 151, 82, 0.4)',
    },
    error: {
      background: 'var(--error-soft, #faecec)',
      color: '#8e3e3e',
      border: '1px solid rgba(198, 111, 111, 0.4)',
    },
    ai: {
      background: 'var(--ai-soft, #f3eff9)',
      color: '#5e4e7e',
      border: '1px solid rgba(184, 168, 217, 0.5)',
    },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: pill ? 'var(--radius-pill, 999px)' : 'var(--radius-sm, 10px)',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.2px',
        lineHeight: 1,
        ...variantStyles[variant],
        ...style,
      }}
      className={className}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;
