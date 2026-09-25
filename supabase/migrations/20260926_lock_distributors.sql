-- ============================================================================
-- SECURITY: distributors' personal data was readable by the anon key
-- ============================================================================
-- Applied live on 2026-09-26.
--
-- public.distributors answered the anonymous key — the one compiled into the
-- Flutter app and served in the portal's client JavaScript, so readable by
-- anyone — returning real rows with:
--
--     full_name, username, its_no, phone_no, whatsapp_no, address, sabeel_no
--
-- i.e. contact details and ITS numbers for every distributor. Writes were
-- already refused; this was read-only exposure, but of personal data.
--
-- The Flutter app never reads this table (no reference anywhere in its lib/).
-- Nine portal pages do, across several modules — dashboard, distribution,
-- distributors, takhmeen, thaali, thaali/stickers, thaali/customizations,
-- mumineen/[id], address-requests — plus api/kitchen/arrival.
--
-- So reads are granted to any ACTIVE PORTAL STAFF rather than to one module:
-- requiring, say, the distributors module would break the dashboard for staff
-- who legitimately have only the distribution module. is_admin() is the right
-- check for that despite its name — it tests "active row in admin_users",
-- which excludes anon and excludes phone-app members (who are authenticated
-- but have no admin_users row).
--
-- Writes require the distributors module.
--
-- Policies are dropped dynamically because their names were not known in
-- advance — same approach as 20260829_fix_admin_users_recursion.sql.
--
-- Safe to run more than once.
-- ============================================================================

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'distributors'
  loop
    execute format('drop policy %I on public.distributors', pol.policyname);
  end loop;
end $$;

alter table public.distributors enable row level security;

revoke all on public.distributors from anon;
grant select, insert, update, delete on public.distributors to authenticated;

create policy distributors_read_staff on public.distributors
  for select to authenticated
  using (public.is_admin());

create policy distributors_write_perm on public.distributors
  for all to authenticated
  using (public.has_permission('distributors', 'can_edit'))
  with check (public.has_permission('distributors', 'can_edit'));

-- ============================================================================
-- VERIFIED 2026-09-26: anon read of /rest/v1/distributors went from HTTP 200
-- with full rows to HTTP 401 permission denied. Portal /distributors,
-- /distribution, /dashboard and /thaali all still served.
--
-- STILL OUTSTANDING — tables still answering the anon key with HTTP 200:
--   mumineen, daily_menu, kitchen_settings all return 200 but ZERO rows, so
--   RLS is filtering correctly and nothing leaks. They are reachable rather
--   than exposed. Re-check daily_menu once a menu is published and
--   kitchen_settings holds live values, in case either has a permissive
--   policy that only looks safe while the table is empty.
-- ============================================================================
