-- ============================================================================
-- FIX: module permissions did nothing for non-admin groups
-- ============================================================================
-- Applied live on 2026-09-14.
--
-- Granting a group the Mumineen module had no effect: the page opened, but
-- every row was filtered out, so staff saw an empty table. The cause is
-- mumineen_admin_full_access, which hardcodes two group NAMES:
--
--     ug.name IN ('Admin', 'Super Admin')
--
-- Any other group — Approver, Kitchen, anything created later — reads nothing
-- from mumineen no matter which modules are ticked in Users -> Groups. The
-- permission UI was therefore decorative for every group except those two.
--
-- The policies below grant access by MODULE instead, via has_permission()
-- (see 20260913_fix_push_triggers_and_lock_admin_tables.sql).
--
-- WHY THIS IS SAFE FOR THE MOBILE APP
-- Permissive policies are OR'd, so adding one can only ever grant more access,
-- never less. The existing app policies are untouched and keep working:
--
--   mumineen_select_own_record      auth_id = auth.uid()
--   mumineen_select_family_members  auth_id = auth.uid() OR hof_id = get_user_hof_id()
--   mumineen_update_own_and_family  same
--   mumineen_insert_family_members  / mumineen_delete_family_members
--
-- Those cover every way the Flutter app touches mumineen: login and profile by
-- auth_id, FCM token registration by sf_no, the family list by hof_id, family
-- add/edit/remove, and the family-total recalculation on the HOF's own row.
--
-- Safe to run more than once.
-- ============================================================================

drop policy if exists mumineen_module_select on public.mumineen;
create policy mumineen_module_select on public.mumineen
  for select to authenticated
  using (public.has_permission('mumineen', 'can_view'));

drop policy if exists mumineen_module_insert on public.mumineen;
create policy mumineen_module_insert on public.mumineen
  for insert to authenticated
  with check (public.has_permission('mumineen', 'can_add'));

drop policy if exists mumineen_module_update on public.mumineen;
create policy mumineen_module_update on public.mumineen
  for update to authenticated
  using (public.has_permission('mumineen', 'can_edit'))
  with check (public.has_permission('mumineen', 'can_edit'));

drop policy if exists mumineen_module_delete on public.mumineen;
create policy mumineen_module_delete on public.mumineen
  for delete to authenticated
  using (public.has_permission('mumineen', 'can_deactivate'));

-- ============================================================================
-- VERIFIED 2026-09-14: a test user in a non-admin group, given Mumineen: View,
-- went from an empty table to seeing the HOF record. Super Admin unaffected.
--
-- STILL OUTSTANDING — both PRE-EXISTING, neither introduced here:
--
--   1. public.permissions is writable by ANY active admin_users row:
--        active_admins_write_permissions  ALL  to public
--        using (exists (select 1 from admin_users
--                       where auth_id = auth.uid() and status = 'active'))
--      No group check, so a staff member can grant their own group every
--      module. This undermines the whole permission system and should be
--      restricted to Super Admin.
--
--   2. public.thaali_registrations is readable by EVERY authenticated user:
--        read_thaali_registrations  SELECT  using (auth.role() = 'authenticated')
--      That includes every mumin signed into the phone app, not just staff.
--      house_sectors and permissions have the same blanket read.
--
--   3. Only mumineen has module policies so far. Other modules appear to work
--      for non-admin staff only because their tables carry the blanket
--      authenticated read in (2) — which is the bug, not the feature. As those
--      reads are tightened, each module needs its own has_permission policies.
-- ============================================================================
