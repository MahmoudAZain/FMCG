-- 0002 — Customer and staff profiles
--
-- Extends auth.users. The business identity is `phone`, not the synthetic
-- email Supabase Auth holds (research R2) — that address exists only so the
-- email/password provider has something to key on, and is never shown to
-- anyone.

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  full_name         text        not null,
  phone             text        not null,
  role              public.user_role not null default 'customer',
  preferred_locale  text        not null default 'ar',
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint profiles_full_name_length check (char_length(btrim(full_name)) between 2 and 120),

  -- Canonical E.164 for an Egyptian mobile: +20 then 1, then the operator digit
  -- (0 Vodafone, 1 Etisalat, 2 Orange, 5 WE), then 8 more. Normalisation to this
  -- shape happens in normalize_phone() before any insert (FR-009, FR-010).
  constraint profiles_phone_egyptian check (phone ~ '^\+201[0-25][0-9]{8}$'),

  constraint profiles_locale_supported check (preferred_locale in ('ar', 'en'))
);

-- FR-011 at the database level, not merely in the registration form.
create unique index profiles_phone_key on public.profiles (phone);

-- Staff lookups are rare against a table of customers; a partial index keeps it
-- small.
create index profiles_staff_idx on public.profiles (role) where role <> 'customer';

comment on column public.profiles.phone is
  'Canonical E.164 Egyptian mobile. The business identity — the synthetic auth email is an implementation detail.';

-- ---------------------------------------------------------------------------
-- Privilege-escalation guard
--
-- RLS can decide whether a row may be updated, but not which columns an update
-- touches. Without this trigger, the "customer may update their own profile"
-- policy would let any customer set role = 'admin' on themselves.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not public.is_admin() then
    raise exception 'not_authorized: role and is_active are admin-only'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- The trigger is attached in 0009, after is_admin() exists.

-- ---------------------------------------------------------------------------
-- Keep updated_at honest without every caller remembering to set it.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Rate limiting for sign-in (FR-014).
--
-- Supabase does not rate-limit at the granularity we need (per canonical phone),
-- so failures are recorded here and the sign-in action refuses further attempts
-- past a threshold. Swept daily to stay small against the 500 MB free tier.
-- ---------------------------------------------------------------------------
create table public.login_attempts (
  id           bigserial primary key,
  phone        text        not null,
  succeeded    boolean     not null,
  attempted_at timestamptz not null default now()
);

create index login_attempts_phone_time_idx
  on public.login_attempts (phone, attempted_at desc);

-- ---------------------------------------------------------------------------
-- Audit of privileged administrative actions (FR-016, FR-085).
--
-- A staff-mediated password reset takes over a customer's account. That must
-- leave a trace.
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid        not null references public.profiles (id),
  action      text        not null,
  target_type text,
  target_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index admin_audit_log_time_idx on public.admin_audit_log (created_at desc);
