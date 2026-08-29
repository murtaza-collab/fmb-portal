-- ============================================================================
-- FIX: infinite recursion in admin_users RLS policy  (error 42P17)
-- ============================================================================
-- After 20260829_rls_lock_anon.sql enabled RLS on admin_users, reads began
-- failing with:
--     42P17  infinite recursion detected in policy for relation "admin_users"
--
-- Cause: a pre-existing policy on admin_users subqueries admin_users itself
-- (the usual "is the caller an admin?" self-reference). It was dormant while
-- RLS was disabled; enabling RLS activated it. Permissive policies are OR'd,
-- so ONE recursive policy breaks evaluation for every role.
--
-- This drops every policy on the table (names unknown, so it is done
-- dynamically) and recreates only non-recursive ones.
--
-- Safe to run more than once.
-- ============================================================================

-- 1. Drop ALL existing policies on admin_users, whatever they are called
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'admin_users'
  loop
    execute format('drop policy %I on public.admin_users', pol.policyname);
  end loop;
end $$;

-- 2. Recreate, with NO self-reference. auth.uid() is read from the JWT and
--    never touches admin_users, so it cannot recurse.
alter table public.admin_users enable row level security;

create policy admin_users_read_authenticated
  on public.admin_users for select
  to authenticated
  using (true);

create policy admin_users_write_authenticated
  on public.admin_users for all
  to authenticated
  using (true)
  with check (true);

-- 3. Re-apply the grants (the earlier migration appears to have stopped before
--    this point on this table — anon was still reaching policy evaluation
--    rather than being refused at the grant level).
revoke all on public.admin_users from anon;
grant select, insert, update, delete on public.admin_users to authenticated;

-- ============================================================================
-- VERIFY — run this and read the output
--   select policyname, roles, cmd, qual
--   from pg_policies
--   where schemaname='public' and tablename='admin_users';
--
-- Expect exactly two rows, both {authenticated}, qual = true.
-- Any policy whose qual mentions admin_users is the recursive one and must go.
-- ============================================================================
