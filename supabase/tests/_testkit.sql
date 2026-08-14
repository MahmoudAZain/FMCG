-- Test toolkit — applied AFTER the migrations.
--
-- It has to come after, because migration 0009 revokes every grant in the
-- public schema as its starting position. Anything granted before that point
-- is stripped. Splitting the Supabase shim (_harness.sql, applied first) from
-- the test tooling here keeps both correct.

create table if not exists public._test_results (
  id     bigserial primary key,
  suite  text not null,
  name   text not null,
  passed boolean not null,
  detail text
);

grant insert, select on public._test_results to anon, authenticated;
grant usage, select on sequence public._test_results_id_seq to anon, authenticated;

-- Assertion helper: record a pass/fail rather than aborting on the first
-- failure, so one run reports every problem.
create table if not exists public._test_results (
  id       bigserial primary key,
  suite    text not null,
  name     text not null,
  passed   boolean not null,
  detail   text
);

grant insert, select on public._test_results to anon, authenticated;
grant usage, select on sequence public._test_results_id_seq to anon, authenticated;

create or replace function public.assert(
  p_suite text, p_name text, p_condition boolean, p_detail text default null
)
returns void
language plpgsql
as $$
begin
  insert into public._test_results (suite, name, passed, detail)
  values (p_suite, p_name, coalesce(p_condition, false), p_detail);
end $$;

-- Assert that a statement fails, and optionally that it fails for the expected
-- reason. Used heavily by the RLS suite, where "it threw" is the pass
-- condition.
create or replace function public.assert_raises(
  p_suite text, p_name text, p_sql text, p_expect text default null
)
returns void
language plpgsql
as $$
declare
  msg text;
begin
  execute p_sql;
  perform public.assert(p_suite, p_name, false, 'expected an error, none raised');
exception
  when others then
    msg := sqlerrm;
    if p_expect is null or position(p_expect in msg) > 0 then
      perform public.assert(p_suite, p_name, true, msg);
    else
      perform public.assert(p_suite, p_name, false,
        format('expected %L, got %L', p_expect, msg));
    end if;
end $$;

grant execute on function public.assert(text, text, boolean, text) to anon, authenticated;
grant execute on function public.assert_raises(text, text, text, text) to anon, authenticated;
