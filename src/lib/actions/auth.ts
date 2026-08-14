'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
// Registration must create an auth user, and sign-in must write login_attempts.
// A signed-out visitor has no grant for either, so this is one of the few
// legitimate uses of the service role — hence the rule is suspended for exactly
// this import and nothing else in the file.
// eslint-disable-next-line no-restricted-imports
import { createServiceClient } from '@/lib/supabase/service';
import { phoneToAuthIdentifier } from '@/lib/phone';
import { registerSchema, loginSchema } from '@/lib/validation/schemas';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };

/** Failed sign-ins allowed per number before the door closes (FR-014). */
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

/**
 * Registration.
 *
 * Creates three things that must all exist or none: an auth user, a profile,
 * and a first address. Postgres cannot wrap the auth user in the same
 * transaction as the profile — it lives in a schema the API writes through a
 * separate call — so the failure path compensates by deleting what it created.
 * A half-registered customer who can sign in but has no profile is worse than
 * one who has to try again.
 */
export async function registerCustomer(formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    password: formData.get('password'),
    locale: formData.get('locale') ?? 'ar',
    governorate_id: formData.get('governorate_id'),
    street_address: formData.get('street_address'),
    landmark: formData.get('landmark'),
    building: formData.get('building') ?? '',
    floor_apartment: formData.get('floor_apartment') ?? '',
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'errors.invalidInput', field: String(first?.path[0] ?? '') };
  }

  const input = parsed.data;
  const service = createServiceClient();

  // A friendly refusal before the unique index produces an opaque one. The
  // index is still the guarantee — this is only a better message (FR-011).
  const { data: existing } = await service
    .from('profiles')
    .select('id')
    .eq('phone', input.phone)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: 'errors.phoneAlreadyRegistered', field: 'phone' };
  }

  const { data: created, error: authError } = await service.auth.admin.createUser({
    email: phoneToAuthIdentifier(input.phone),
    password: input.password,
    // Nothing can confirm a synthetic address on a non-routable domain, so the
    // account is created already confirmed. Without this, signup would stall
    // forever waiting for an email that cannot arrive (research R2).
    email_confirm: true,
  });

  if (authError || !created.user) {
    if (authError?.message?.includes('already been registered')) {
      return { ok: false, error: 'errors.phoneAlreadyRegistered', field: 'phone' };
    }
    return { ok: false, error: 'errors.registrationFailed' };
  }

  const userId = created.user.id;

  const { error: profileError } = await service.from('profiles').insert({
    id: userId,
    full_name: input.full_name,
    phone: input.phone,
    role: 'customer',
    preferred_locale: input.locale,
  });

  if (profileError) {
    await service.auth.admin.deleteUser(userId);
    return {
      ok: false,
      error: profileError.code === '23505' ? 'errors.phoneAlreadyRegistered' : 'errors.registrationFailed',
      field: profileError.code === '23505' ? 'phone' : undefined,
    };
  }

  const { error: addressError } = await service.from('addresses').insert({
    profile_id: userId,
    governorate_id: input.governorate_id,
    street_address: input.street_address,
    landmark: input.landmark,
    building: input.building || null,
    floor_apartment: input.floor_apartment || null,
    is_default: true,
  });

  if (addressError) {
    // Compensate in reverse order. The profile cascades from the auth user, so
    // deleting the user is enough — but being explicit costs nothing and
    // survives a future change to the cascade.
    await service.from('profiles').delete().eq('id', userId);
    await service.auth.admin.deleteUser(userId);
    return { ok: false, error: 'errors.registrationFailed' };
  }

  // Sign in through the ordinary client so the session cookie is set on this
  // response.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: phoneToAuthIdentifier(input.phone),
    password: input.password,
  });

  if (signInError) {
    // The account exists and is sound; only the session failed. Send them to
    // sign in rather than destroying a good registration.
    return { ok: false, error: 'errors.registeredButSignInFailed' };
  }

  return { ok: true, data: undefined };
}

/**
 * Sign-in.
 *
 * Two things here are deliberate and easy to get wrong:
 *
 * 1. **The failure message is identical** whether the number is unknown or the
 *    password is wrong. Distinguishing them turns the login form into a tool
 *    for discovering which phone numbers hold accounts.
 * 2. **Attempts are counted per canonical phone**, not per session or IP, so
 *    clearing cookies does not reset the counter (FR-014).
 */
export async function loginCustomer(formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    phone: formData.get('phone'),
    password: formData.get('password'),
  });

  // Even a malformed number gets the generic message — a specific "that isn't a
  // valid number" reply is a free oracle.
  if (!parsed.success) {
    return { ok: false, error: 'errors.signInFailed' };
  }

  const { phone, password } = parsed.data;
  const service = createServiceClient();

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await service
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .eq('succeeded', false)
    .gte('attempted_at', since);

  if ((count ?? 0) >= MAX_ATTEMPTS) {
    return { ok: false, error: 'errors.tooManyAttempts' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: phoneToAuthIdentifier(phone),
    password,
  });

  await service.from('login_attempts').insert({ phone, succeeded: !error });

  if (error) {
    return { ok: false, error: 'errors.signInFailed' };
  }

  return { ok: true, data: undefined };
}

export async function logout(locale: string): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}`);
}

/** The signed-in customer's profile, or null. Safe on public pages. */
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // RLS restricts this to the caller's own row, so no filter is needed for
  // safety — only for clarity.
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, preferred_locale, is_active')
    .eq('id', user.id)
    .maybeSingle();

  return data;
}
