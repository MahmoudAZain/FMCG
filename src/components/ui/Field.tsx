import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

/**
 * Form controls.
 *
 * The error is rendered next to the field it belongs to, not collected into a
 * summary at the top: on a 360px screen a summary scrolls out of sight the
 * moment the keyboard opens.
 */

const controlClass = [
  'w-full min-h-touch rounded border bg-surface px-3 text-base text-ink',
  'transition-colors placeholder:text-ink-3',
  'focus:border-brand focus:outline-none',
].join(' ');

function Wrapper({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="ms-1 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {hint && (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      )}

      {children}

      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({
  label,
  error,
  hint,
  id,
  required,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
  id: string;
}) {
  return (
    <Wrapper label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
          undefined
        }
        className={`${controlClass} ${error ? 'border-danger' : 'border-rule'} ${className}`}
        {...props}
      />
    </Wrapper>
  );
}

export function Select({
  label,
  error,
  hint,
  id,
  required,
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <Wrapper label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`${controlClass} ${error ? 'border-danger' : 'border-rule'} ${className}`}
        {...props}
      >
        {children}
      </select>
    </Wrapper>
  );
}

/** A whole-form error: a rejected sign-in, a refused order. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded border border-danger bg-danger-soft px-4 py-3 text-danger">
      {children}
    </div>
  );
}
