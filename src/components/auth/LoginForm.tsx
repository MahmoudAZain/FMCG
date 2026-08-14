'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { loginCustomer } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { Input, FormError } from '@/components/ui/Field';

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations('auth');
  const tError = useTranslations();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);

    const result = await loginCustomer(formData);

    if (result.ok) {
      router.push(next ?? '/');
      router.refresh();
      return;
    }

    // Deliberately one message for every failure mode. Saying "no account with
    // that number" would turn this form into a way to find out which numbers
    // hold accounts.
    setError(result.error);
    setSubmitting(false);
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      {error && <FormError>{tError(error)}</FormError>}

      <Input
        id="phone"
        name="phone"
        label={t('phone')}
        hint={t('phoneHint')}
        required
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
      />

      <Input
        id="password"
        name="password"
        label={t('password')}
        required
        type="password"
        autoComplete="current-password"
      />

      <Button type="submit" size="lg" fullWidth disabled={submitting}>
        {t('submitLogin')}
      </Button>

      {/*
        Stated plainly rather than hidden: there is no self-service reset,
        because there is no SMS and no email to send one through. A customer who
        learns this at the moment they need it feels abandoned; one who reads it
        here knows to call (FR-016, research R2).
      */}
      <p className="text-sm text-ink-3">{t('noPasswordReset')}</p>

      <p className="text-sm text-ink-2">
        {t('noAccount')}{' '}
        <Link href="/register" className="font-semibold text-brand">
          {t('goToRegister')}
        </Link>
      </p>
    </form>
  );
}
