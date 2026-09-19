-- ============================================================================
-- SECURITY: stop staff accounts granting themselves access
-- ============================================================================
-- Applied live on 2026-09-20.
--
-- Two problems, both letting any active staff account escalate to full access:
--
--   1. active_admins_write_permissions  ALL on public.permissions, to public
--        using (exists (select 1 from admin_users
--                       where auth_id = auth.uid() and status = 'active'))
--      No group check. Any staff account could tick every module for its own
--      group, defeating the whole permission system.
--
--   2. admin_users_write_admin  ALL on public.admin_users
--        using (public.is_admin())
--      is_admin() only checks that the caller IS an active admin_users row —
--      it does NOT check their group, despite the name. So any staff account
--      could simply repoint its own row at the Super Admin group.
--
-- Closing (1) alone would not have helped: (2) is the shorter path.
--
-- read_permissions also allowed SELECT to every authenticated user, which
-- includes every mumin signed into the phone app.
--
-- is_portal_admin() below is the group-aware check that is_admin() was assumed
-- to be. is_admin() is left in place — other policies reference it, and as
-- "is active portal staff" it still correctly keeps app members out.
--
-- Safe to run more than once.
-- ============================================================================

-- --- group-aware admin check ------------------------------------------------
-- SECURITY DEFINER so it reads admin_users/user_groups without tripping their
-- own policies (which would recurse).
create or replace function public.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    join public.user_groups g on g.id = a.user_group_id
    where a.auth_id = auth.uid()
      and a.status = 'active'
      and lower(g.name) in ('admin', 'super admin', 'super_admin')
  );
$$;

revoke all on function public.is_portal_admin() from anon;
grant execute on function public.is_portal_admin() to authenticated;

-- --- the caller's own group, for "may read my own permissions" --------------
create or replace function public.my_user_group_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select a.user_group_id
  from public.admin_users a
  where a.auth_id = auth.uid() and a.status = 'active'
  limit 1;
$$;

revoke all on function public.my_user_group_id() from anon;
grant execute on function public.my_user_group_id() to authenticated;

-- --- has_permission(): recorded here for the first time ---------------------
-- Created live on 2026-09-14 and never version-controlled. Mumineen module
-- access depends on it, so if it were dropped that access would break with
-- nothing in the repo to explain why — exactly how call_push_notification
-- went missing. Re-stated verbatim so the repo now describes the database.
create or replace function public.has_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users a
    left join public.user_groups g on g.id = a.user_group_id
    where a.auth_id = auth.uid()
      and a.status = 'active'
      and (
        lower(g.name) in ('super admin', 'admin', 'super_admin')
        or exists (
          select 1 from public.permissions p
          where p.user_group_id = a.user_group_id
            and p.module = p_module
            and case p_action
                  when 'can_view'       then p.can_view
                  when 'can_add'        then p.can_add
                  when 'can_edit'       then p.can_edit
                  when 'can_deactivate' then p.can_deactivate
                  else false
                end
        )
      )
  );
$$;

revoke all on function public.has_permission(text, text) from anon;
grant execute on function public.has_permission(text, text) to authenticated;

-- --- permissions ------------------------------------------------------------
-- Read: your own group's rows (the sidebar and page guards need this), or any
-- group's if you are a portal admin (the Users page shows the full matrix).
-- Write: portal admins only.
alter table public.permissions enable row level security;
revoke all on public.permissions from anon;
grant select, insert, update, delete on public.permissions to authenticated;

drop policy if exists read_permissions                on public.permissions;
drop policy if exists active_admins_write_permissions on public.permissions;
drop policy if exists permissions_read_own_or_admin   on public.permissions;
drop policy if exists permissions_write_admin         on public.permissions;

create policy permissions_read_own_or_admin on public.permissions
  for select to authenticated
  using (public.is_portal_admin() or user_group_id = public.my_user_group_id());

create policy permissions_write_admin on public.permissions
  for all to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- --- admin_users ------------------------------------------------------------
-- Read: your own row (every page needs it), or all rows if you are a portal
-- admin. Write: portal admins only — this is the escalation path.
drop policy if exists admin_users_read_authenticated  on public.admin_users;
drop policy if exists admin_users_write_authenticated on public.admin_users;
drop policy if exists admin_users_read_admin          on public.admin_users;
drop policy if exists admin_users_write_admin         on public.admin_users;
drop policy if exists admin_users_read_self_or_admin  on public.admin_users;
drop policy if exists admin_users_write_portal_admin  on public.admin_users;

create policy admin_users_read_self_or_admin on public.admin_users
  for select to authenticated
  using (public.is_portal_admin() or auth_id = auth.uid());

create policy admin_users_write_portal_admin on public.admin_users
  for all to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- ============================================================================
-- Unaffected: /api/admin/create-admin-user, /api/admin/delete-admin-user and
-- /api/auth/forgot-password all use the service-role key, which bypasses RLS.
--
-- STILL OUTSTANDING:
--   * public.user_groups writes were not touched — its policies were not read
--     first, and dropping them blind risks breaking group management. A staff
--     account can still rename or delete groups. It is not an escalation path
--     now (assigning yourself to a group needs admin_users, and giving a group
--     modules needs permissions — both locked above), but it is destructive.
--   * public.thaali_registrations and public.house_sectors still allow SELECT
--     to every authenticated user, phone-app members included.
-- ============================================================================
