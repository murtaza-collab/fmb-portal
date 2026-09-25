-- ============================================================================
-- FIX: push triggers failed on bigint mumin_id, and could abort the write
-- ============================================================================
-- Applied live on 2026-09-20.
--
-- CORRECTS 20260913_fix_push_triggers_and_lock_admin_tables.sql, which states
-- that call_push_notification "does not exist in this database". That was
-- wrong. It exists, and always did, in two forms:
--
--     call_push_notification(p_mumin_id integer, p_event_type text)
--     call_push_notification(p_mumin_id integer, p_title text,
--                            p_body text, p_category text)
--
-- Both take INTEGER. PostgreSQL will not implicitly narrow bigint to integer
-- when resolving a function call, so a trigger on a table whose mumin_id is
-- bigint raised:
--
--     42883  function call_push_notification(bigint, unknown) does not exist
--
-- which reads as "missing" but actually means "no overload accepts bigint".
--
-- That is why the failure looked selective:
--
--   fcm_tokens           bigint   -> welcome push failed, and because an
--                                   AFTER trigger runs in the same
--                                   transaction, it rolled back the token
--                                   INSERT — no device ever registered
--   stop_thaalis         integer  -> approval push worked all along
--   thaali_daily_status  bigint   -> dispatch push would fail the same way
--
-- Dropping welcome_push_trigger on 2026-09-13 did fix registration, but for
-- the wrong reason. With the overloads below, that trigger could be restored.
--
-- ---------------------------------------------------------------------------
-- Three problems fixed here
-- ---------------------------------------------------------------------------
-- 1. No bigint overload (above). Added, delegating to the integer version so
--    there is one implementation.
--
-- 2. notify_thaali_dispatched had the push outside any exception block, so a
--    failed notification aborts the dispatch. A member missing "your thaali is
--    on its way" is an annoyance; the kitchen being unable to record dispatch
--    is an operational failure. They must not share a fate.
--
-- 3. notify_thaali_filled waited for status 'counter_bc_done', which is a
--    distribution_sessions status and is never written to thaali_daily_status.
--    The kitchen writes 'counter_b_filled' (counter-b/page.tsx:195) and
--    'counter_c_filled' (counter-c/page.tsx:110). The condition could never be
--    true, so no "thaali packed" notification has ever been sent.
--
-- Safe to run more than once.
-- ============================================================================

-- --- bigint overloads -------------------------------------------------------

create or replace function public.call_push_notification(p_mumin_id bigint, p_event_type text)
returns void language plpgsql as $$
begin
  perform public.call_push_notification(p_mumin_id::integer, p_event_type);
end;
$$;

create or replace function public.call_push_notification(
  p_mumin_id bigint, p_title text, p_body text, p_category text)
returns void language plpgsql as $$
begin
  perform public.call_push_notification(p_mumin_id::integer, p_title, p_body, p_category);
end;
$$;

grant execute on function public.call_push_notification(bigint, text) to authenticated;
grant execute on function public.call_push_notification(bigint, text, text, text) to authenticated;

-- --- dispatched: guard the push so it cannot abort the dispatch -------------

create or replace function public.notify_thaali_dispatched()
returns trigger language plpgsql as $function$
begin
  if old.status is not distinct from new.status then return new; end if;
  if new.status != 'dispatched' then return new; end if;
  if new.mumin_id is null then return new; end if;

  begin
    perform call_push_notification(new.mumin_id, 'thaali_dispatched');
  exception when others then
    raise warning 'thaali_dispatched push failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

-- --- filled: match the statuses the kitchen actually writes -----------------

create or replace function public.notify_thaali_filled()
returns trigger language plpgsql as $function$
begin
  if old.status is not distinct from new.status then return new; end if;
  if new.status not in ('counter_b_filled', 'counter_c_filled') then return new; end if;
  if new.mumin_id is null then return new; end if;

  begin
    perform call_push_notification(new.mumin_id, 'thaali_filled');
  exception when others then
    raise warning 'thaali_filled push failed: %', sqlerrm;
  end;
  return new;
end;
$function$;

-- --- duplicate trigger ------------------------------------------------------
-- address_change_requests carried two triggers on the same event calling the
-- same function, so every approval or rejection notified the member twice.
-- Same duplication previously found on stop_thaalis.

drop trigger if exists address_change_push_trigger on public.address_change_requests;

-- ============================================================================
-- STILL OUTSTANDING:
--
--   * welcome_push_trigger on fcm_tokens is still dropped (2026-09-13). It can
--     now be restored, but only with the same exception guard used above —
--     without it, a failed welcome push again rolls back the token INSERT and
--     no device registers. That was the original outage.
--
--   * thaali_customizations.mumin_id is bigint and has no push trigger today.
--     If one is added it needs the bigint overload, which now exists.
--
--   * wa_broadcast_queue.mumin_id is uuid, a third type for the same concept
--     (integer / bigint / uuid across the schema). It cannot join cleanly to
--     mumineen.id. Not urgent, but it will block WhatsApp work that needs to
--     match a queue row to a mumin.
--
--   * notify_thaali_filled now fires on BOTH counter_b_filled and
--     counter_c_filled. A thaali that passes through both counters will
--     notify twice. Verify against the real kitchen flow once a distribution
--     session has run; if both can occur for one thaali, narrow the condition
--     or make the notification idempotent.
-- ============================================================================
