import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover disabled:bg-rule-strong',
  secondary: 'border border-rule bg-surface text-ink hover:border-brand hover:text-brand',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'border border-danger bg-surface text-danger hover:bg-danger-soft',
};

const sizes: Record<Size, string> = {
  // Never below 44px: on a phone, a smaller target is one the customer misses
  // (Constitution Principle IV).
  md: 'min-h-touch px-4 text-sm',
  lg: 'min-h-touch px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded font-semibold',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}
