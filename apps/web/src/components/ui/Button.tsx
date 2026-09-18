import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading = false, children, className = '', disabled, style, ...props }, ref) => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      borderRadius: 'var(--radius-sm, 12px)',
      fontWeight: 500,
      cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
      opacity: disabled || isLoading ? 0.6 : 1,
      transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      border: 'none',
      whiteSpace: 'nowrap',
      textDecoration: 'none',
      ...style,
    };

    const sizeStyles: Record<string, React.CSSProperties> = {
      sm: { height: '36px', padding: '0 14px', fontSize: '13px' },
      md: { height: '44px', padding: '0 20px', fontSize: '15px' },
      lg: { height: '52px', padding: '0 28px', fontSize: '16px' },
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      primary: {
        background: 'var(--text, #111111)',
        color: '#ffffff',
        border: '1px solid var(--text, #111111)',
      },
      secondary: {
        background: 'var(--surface, #ffffff)',
        color: 'var(--text, #111111)',
        border: '1px solid var(--border, #ded9d4)',
      },
      tertiary: {
        background: 'transparent',
        color: 'var(--text-secondary, #5f5b58)',
        border: '1px solid transparent',
      },
      danger: {
        background: 'var(--error-soft, #faecec)',
        color: 'var(--error, #c66f6f)',
        border: '1px solid var(--error, #c66f6f)',
      },
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        style={{
          ...baseStyle,
          ...sizeStyles[size],
          ...variantStyles[variant],
        }}
        className={className}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
