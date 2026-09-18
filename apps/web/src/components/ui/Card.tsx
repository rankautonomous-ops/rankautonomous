import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'surface' | 'soft' | 'accent' | 'ai';
  radius?: 'md' | 'lg' | 'xl';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'surface', radius = 'lg', children, style, className = '', ...props }, ref) => {
    const radiusMap: Record<string, string> = {
      md: 'var(--radius-md, 16px)',
      lg: 'var(--radius-lg, 24px)',
      xl: 'var(--radius-xl, 32px)',
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      surface: {
        background: 'var(--surface, #ffffff)',
        border: '1px solid var(--border, #ded9d4)',
      },
      soft: {
        background: 'var(--surface-soft, #fbf8f5)',
        border: '1px solid var(--border, #ded9d4)',
      },
      accent: {
        background: 'var(--accent-soft, #f6d8d5)',
        border: '1px solid var(--accent, #e8aaa6)',
      },
      ai: {
        background: 'var(--ai-soft, #f3eff9)',
        border: '1px solid var(--ai, #b8a8d9)',
      },
    };

    return (
      <div
        ref={ref}
        style={{
          borderRadius: radiusMap[radius],
          boxShadow: 'var(--shadow-card, 0 8px 30px rgba(17, 17, 17, 0.04))',
          padding: 'clamp(20px, 3vw, 36px)',
          ...variantStyles[variant],
          ...style,
        }}
        className={className}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
export default Card;
