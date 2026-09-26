-- ============================================================================
-- SECURITY: call_push_notification was executable by anyone, incl. anonymous
-- ============================================================================
-- Applied live on 2026-09-26.
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default. pg_proc
-- showed all four overloads with an ACL entry of:
--
--     =X/postgres          <- empty grantee before "=" means PUBLIC
--
-- so every role could call them, anon included. An earlier attempt that did
-- `revoke execute ... from anon, authenticated` achieved nothing: the
-- privilege was never held by those roles individually, it was held by PUBLIC.
--
-- Why this matters: the four-argument overload takes an arbitrary title and
-- body, so anyone able to call it could send any push message to any mumin.
--
-- WHY EXECUTE IS RE-GRANTED TO authenticated
-- The notify_* trigger functions are plain plpgsql, not SECURITY DEFINER, so
-- they run as whoever performed the triggering write — a portal staff member
-- is `authenticated`. Revoking from PUBLIC without re-granting would make
-- those triggers raise, and notify_niyyat_approved, notify_address_change_status
-- and notify_thaali_approval have NO exception guard, so the raise would roll
-- back the approval itself. That is the same failure mode as the original
-- fcm_tokens outage.
--
-- Safe to run more than once.
-- ============================================================================

revoke execute on function public.call_push_notification(integer, text) from public;
revoke execute on function public.call_push_notification(bigint, text) from public;
revoke execute on function public.call_push_notification(integer, text, text, text) from public;
revoke execute on function public.call_push_notification(bigint, text, text, text) from public;

grant execute on function public.call_push_notification(integer, text) to authenticated;
grant execute on function public.call_push_notification(bigint, text) to authenticated;
grant execute on function public.call_push_notification(integer, text, text, text) to authenticated;
grant execute on function public.call_push_notification(bigint, text, text, text) to authenticated;

-- ============================================================================
-- VERIFIED: an address change submitted from the app and approved in the
-- portal still delivered a push, so the triggers survived the change. Exactly
-- ONE notification arrived, confirming the duplicate address_change_push_trigger
-- dropped in 20260920 is gone.
--
-- NOT VERIFIED: the resulting pg_proc ACL was not re-read after applying, so
-- it is not confirmed that "=X/postgres" (PUBLIC) is actually gone. Re-run:
--
--   select pg_get_function_identity_arguments(p.oid),
--          coalesce(array_to_string(p.proacl, ' | '), 'PUBLIC')
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname='call_push_notification';
--
-- Expect authenticated=X/postgres and NO bare "=X/postgres" entry.
--
-- ---------------------------------------------------------------------------
-- STILL OUTSTANDING — both important
-- ---------------------------------------------------------------------------
-- 1. THE SERVICE ROLE KEY IS HARD-CODED IN THE FUNCTION BODY, in plain text,
--    inside the net.http_post Authorization header. That key bypasses every
--    RLS policy in this database. It is therefore present in every backup and
--    dump, and readable by anyone who can read function definitions. It has
--    also been pasted into a chat transcript, so it should be treated as
--    compromised.
--
--    Fix: rotate the key in the Supabase dashboard, then store the new one in
--    Vault and read it via vault.decrypted_secrets rather than inlining it.
--    Rotating will briefly break notifications until the function is updated,
--    so do it deliberately rather than in passing.
--
-- 2. A logged-in MEMBER (the app signs mumineen in as `authenticated`) can
--    still call the four-argument overload over PostgREST and send an
--    arbitrary message to any mumin. Re-granting to authenticated was required
--    to keep the triggers working, so this is a partial fix.
--
--    Proper fix: move call_push_notification into a schema PostgREST does not
--    expose (e.g. `private`), update the seven notify_* functions to call it
--    by qualified name, and revoke execute from PUBLIC entirely. Then no API
--    caller can reach it at all and the re-grant above becomes unnecessary.
--
-- NOTE: the automated on/off switches on the portal's Notifications tab are
-- live and always were. call_push_notification reads notification_templates by
-- event_type and returns early when `enabled` is false, taking title and body
-- from that row. They only appeared broken because the bigint overloads were
-- missing (see 20260920_fix_push_bigint_overloads.sql).
-- ============================================================================
