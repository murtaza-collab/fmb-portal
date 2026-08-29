-- ============================================================================
-- SECURITY: revoke anonymous access to admin_users and notification_templates
-- ============================================================================
-- Verified 2026-08-29 against the live project using only the PUBLIC anon key
-- (the one compiled into .next/static/chunks/app/login/page.js, readable by
-- any visitor):
--
--   READ   GET  /rest/v1/admin_users?select=*            -> 200, all rows
--          leaking auth_id, username, full_name, status
--          GET  /rest/v1/notification_templates          -> 200, all 11 rows
--
--   WRITE  PATCH /rest/v1/admin_users?id=eq.<real>       -> 200 + row returned
--          PATCH /rest/v1/notification_templates?id=eq.2 -> 200 + row returned
--          (tested idempotently by writing each column's existing value back;
--           no data was modified)
--
-- RLS is already correct elsewhere: anon sees 0 rows of house_sectors (170
-- real), thaalis (5000), permissions (47), user_groups (5), fiscal_years (8).
-- These two tables were missed.
--
-- NOTE: mumineen is currently EMPTY, so its policies could NOT be validated —
-- 0 visible rows out of 0 real rows proves nothing. Re-run the check after
-- loading real mumineen data, before go-live.
-- ============================================================================

-- --- admin_users ------------------------------------------------------------
alter table public.admin_users enable row level security;

revoke all on public.admin_users from anon;
grant select, insert, update, delete on public.admin_users to authenticated;

drop policy if exists admin_users_read_authenticated on public.admin_users;
create policy admin_users_read_authenticated
  on public.admin_users for select
  to authenticated
  using (true);

drop policy if exists admin_users_write_authenticated on public.admin_users;
create policy admin_users_write_authenticated
  on public.admin_users for all
  to authenticated
  using (true)
  with check (true);

-- --- notification_templates -------------------------------------------------
alter table public.notification_templates enable row level security;

revoke all on public.notification_templates from anon;
grant select, insert, update, delete on public.notification_templates to authenticated;

drop policy if exists templates_read_authenticated on public.notification_templates;
create policy templates_read_authenticated
  on public.notification_templates for select
  to authenticated
  using (true);

drop policy if exists templates_write_authenticated on public.notification_templates;
create policy templates_write_authenticated
  on public.notification_templates for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================================
-- VERIFY (run after applying; both should return zero rows for anon)
--   set role anon;
--   select count(*) from public.admin_users;             -- expect 0
--   select count(*) from public.notification_templates;  -- expect 0
--   reset role;
-- ============================================================================
