-- Local test harness — NOT a migration, and never applied to Supabase.
--
-- Supabase provides an `auth` schema and the roles `anon`, `authenticated` and
-- `service_role`. A plain Postgres does not. This file creates just enough of
-- them that the migrations and the RLS suite can run against a local server,
-- so the security guarantees are tested rather than assumed.
--
-- Usage: psql -f supabase/tests/_harness.sql before applying migrations.

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase reads the caller's identity from the request's JWT claims. Tests set
-- the same setting, so `auth.uid()` behaves identically here and in production.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  -- Unset or empty claims mean an anonymous visitor, so guard the cast: an
  -- empty string is not valid JSON and would raise instead of returning NULL.
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )::uuid
$$;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Test helpers
-- ---------------------------------------------------------------------------

-- Become a signed-in customer, staff member or admin for subsequent statements.
-- Session-level, not transaction-local, so a test script can switch identity
-- between statements without wrapping everything in one transaction.
create or replace function auth.login_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id)::text, false);
  execute 'set role authenticated';
end $$;

create or replace function auth.browse_anonymously()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set role anon';
end $$;

-- Back to the owner, for fixture setup between test cases.
create or replace function auth.reset_role()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'reset role';
end $$;

grant execute on function auth.login_as(uuid) to anon, authenticated;
grant execute on function auth.browse_anonymously() to anon, authenticated;
grant execute on function auth.reset_role() to anon, authenticated;
