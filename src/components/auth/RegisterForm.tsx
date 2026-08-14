'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { registerCustomer } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { Input, Select, FormError } from '@/components/ui/Field';

interface Governorate {
  id: string;
  name_ar: string;
  name_en: string;
}

export function RegisterForm({ governorates }: { governorates: Governorate[] }) {
  const t = useTranslations('auth');
  const tError = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    setFieldError(null);

    formData.set('locale', locale);
    const result = await registerCustomer(formData);

    if (result.ok) {
      router.push('/');
      router.refresh();
      return;
    }

    setError(result.error);
    setFieldError(result.field ?? null);
    setSubmitting(false);
  }

  const errorFor = (field: string) =>
    fieldError === field && error ? tError(error) : undefined;

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      {error && !fieldError && <FormError>{tError(error)}</FormError>}

      <Input id="full_name" name="full_name" label={t('fullName')} required autoComplete="name" />

      <Input
        id="phone"
        name="phone"
        label={t('phone')}
        hint={t('phoneHint')}
        error={errorFor('phone')}
        required
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        // Latin digits regardless of interface language: Egyptians type their
        // number in Latin numerals even when reading Arabic.
        dir="ltr"
      />

      <Input
        id="password"
        name="password"
        label={t('password')}
        hint={t('passwordHint')}
        error={errorFor('password')}
        required
        type="password"
        autoComplete="new-password"
        minLength={8}
      />

      <Select id="governorate_id" name="governorate_id" label={t('governorate')} required>
        {governorates.map((g) => (
          <option key={g.id} value={g.id}>
            {locale === 'ar' ? g.name_ar : g.name_en}
          </option>
        ))}
      </Select>

      <Input
        id="street_address"
        name="street_address"
        label={t('streetAddress')}
        hint={t('streetAddressHint')}
        required
        autoComplete="street-address"
      />

      {/*
        The landmark is required, and the hint says why rather than just
        demanding it. Egyptian addresses are frequently unfindable without one,
        and a customer who understands the reason writes a useful one (FR-007).
      */}
      <Input
        id="landmark"
        name="landmark"
        label={t('landmark')}
        hint={t('landmarkHint')}
        required
        minLength={3}
      />

      <Input id="building" name="building" label={t('building')} />
      <Input id="floor_apartment" name="floor_apartment" label={t('floorApartment')} />

      <Button type="submit" size="lg" fullWidth disabled={submitting}>
        {t('submitRegister')}
      </Button>

      <p className="text-sm text-ink-2">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-semibold text-brand">
          {t('goToLogin')}
        </Link>
      </p>
    </form>
  );
}
