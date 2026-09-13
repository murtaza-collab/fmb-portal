-- ============================================================================
-- FIX: push notifications were silently dead + lock admin tables to admins
-- ============================================================================
-- Applied live on 2026-09-13. This file records what was run, because none of
-- it existed in either repo — which is precisely why the bug below survived
-- undetected for an unknown length of time.
--
-- ---------------------------------------------------------------------------
-- PART 1 — why push notifications were completely broken
-- ---------------------------------------------------------------------------
-- The Flutter app upserts into fcm_tokens on login. That INSERT fired:
--
--     welcome_push_trigger AFTER INSERT ON fcm_tokens -> notify_welcome()
--
-- whose body called call_push_notification(bigint, text). That function does
-- not exist in this database (it is referenced nowhere in either repo and was
-- never version-controlled, so when/why it vanished is unknown). Postgres does
-- not record a dependency between a PL/pgSQL body and the functions it calls,
-- so it could be dropped with no error — the failure only appears at runtime.
--
-- The trigger raised 42883, which rolled back the INSERT. firebase_service.dart
-- caught the exception into a debugPrint (invisible in release builds), so:
--
--   * no device ever completed registration
--   * fcm_tokens stayed empty; the portal showed "0 devices"
--   * the portal's broadcast returned {success: true, sent: 0} — a SUCCESS
--
-- notify_welcome() only fired when COUNT(*) = 1, i.e. a mumin's FIRST token.
-- Because logout deletes the token row, every logout permanently stranded that
-- user at zero tokens. Verified fixed: device count went 0 -> 1 immediately
-- after the drop below, confirmed both in the portal and in the app log.
--
-- notify_stop_thaali_status() contained the same dead call, reached whenever a
-- stop request moved to 'approved' or 'rejected' — so admin approvals would
-- have failed outright the first time one was attempted. stop_thaalis also
-- carried TWO identical triggers on the same event, which would have sent
-- duplicate pushes had the function existed.
--
-- ---------------------------------------------------------------------------
-- PART 2 — why admin tables needed locking
-- ---------------------------------------------------------------------------
-- 20260829_rls_lock_anon.sql and 20260829_fix_admin_users_recursion.sql closed
-- anon access but granted authenticated blanket `using (true)`. The mobile app
-- signs mumineen in as `authenticated` against this same project, so every
-- member could read AND write admin_users and notification_templates. The
-- recursion fix solved 42P17 by removing the admin check entirely rather than
-- making it non-recursive.
--
-- is_admin() below is the non-recursive form: SECURITY DEFINER runs as the
-- owner, which bypasses RLS on the inner read, so it cannot re-enter the
-- policy. notification_logs was additionally still reachable by the anon key
-- (HTTP 200), exposing the title, body and recipient count of every push sent.
--
-- Safe to run more than once.
-- ============================================================================

-- --- Part 1: remove the dead push triggers ----------------------------------

drop trigger if exists welcome_push_trigger      on public.fcm_tokens;
drop trigger if exists stop_thaali_push_trigger  on public.stop_thaalis;

-- The surviving stop-thaali trigger is made best-effort: a notification must
-- never be able to abort the approval that triggered it. If
-- call_push_notification is ever restored, alerts resume with no further change.
create or replace function public.notify_stop_thaali_status()
returns trigger
language plpgsql
as $function$
begin
  if old.status is not distinct from new.status then return new; end if;

  begin
    if new.status = 'approved' then
      perform call_push_notification(new.mumin_id, 'stop_request_approved');
    elsif new.status = 'rejected' then
      perform call_push_notification(new.mumin_id, 'stop_request_rejected');
    end if;
  exception when others then
    raise warning 'stop-thaali push failed: %', sqlerrm;
  end;

  return new;
end;
$function$;

-- --- Part 2: non-recursive admin check --------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where auth_id = auth.uid() and status = 'active'
  );
$$;

revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- --- notification_logs (was reachable by anon) ------------------------------

alter table public.notification_logs enable row level security;
revoke all on public.notification_logs from anon;
grant select, insert, update, delete on public.notification_logs to authenticated;

drop policy if exists notification_logs_read_admin  on public.notification_logs;
drop policy if exists notification_logs_write_admin on public.notification_logs;

create policy notification_logs_read_admin on public.notification_logs
  for select to authenticated using (public.is_admin());
create policy notification_logs_write_admin on public.notification_logs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --- notification_templates -------------------------------------------------
-- admin_full_access was a leftover policy granting role `public` full access.

drop policy if exists admin_full_access             on public.notification_templates;
drop policy if exists templates_read_authenticated  on public.notification_templates;
drop policy if exists templates_write_authenticated on public.notification_templates;
drop policy if exists templates_read_admin          on public.notification_templates;
drop policy if exists templates_write_admin         on public.notification_templates;

create policy templates_read_admin on public.notification_templates
  for select to authenticated using (public.is_admin());
create policy templates_write_admin on public.notification_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --- password_reset_requests ------------------------------------------------
-- The public /forgot-password flow posts to an API route using the service-role
-- key, which bypasses RLS, so tightening these does not affect it.

drop policy if exists reset_requests_read_authenticated  on public.password_reset_requests;
drop policy if exists reset_requests_write_authenticated on public.password_reset_requests;
drop policy if exists reset_requests_read_admin          on public.password_reset_requests;
drop policy if exists reset_requests_write_admin         on public.password_reset_requests;

create policy reset_requests_read_admin on public.password_reset_requests
  for select to authenticated using (public.is_admin());
create policy reset_requests_write_admin on public.password_reset_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --- admin_users ------------------------------------------------------------

drop policy if exists admin_users_read_authenticated  on public.admin_users;
drop policy if exists admin_users_write_authenticated on public.admin_users;
drop policy if exists admin_users_read_admin          on public.admin_users;
drop policy if exists admin_users_write_admin         on public.admin_users;

create policy admin_users_read_admin on public.admin_users
  for select to authenticated using (public.is_admin());
create policy admin_users_write_admin on public.admin_users
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- VERIFIED after applying, 2026-09-13:
--   * app log: "FCM token saved for mumin 32" (previously a 42883 error)
--   * portal device count 0 -> 1 after a logout/login cycle
--   * anon key returns 401 for admin_users, notification_templates,
--     notification_logs and password_reset_requests (notification_logs was 200)
--   * portal /login /dashboard /users /notifications all 200, admin intact
--
-- STILL OUTSTANDING:
--   * call_push_notification does not exist, so no DB-driven push is sent at
--     all. The portal sends its own via notifications/page.tsx -> broadcast
--     route -> send-push-notification, so nothing user-facing depends on it.
--     Recreate it only if DB-driven alerts are wanted; if so, keep the
--     exception guard above so a failure can never abort a write.
--   * app/api/notifications/broadcast/route.ts checks auth.ok but never
--     auth.isAdmin, so any active admin_users row of any group can broadcast
--     to every mumin. See the usage note in lib/api-auth.ts.
-- ============================================================================
