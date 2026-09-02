-- ============================================================================
-- Family members left "active" under a transferred HOF
-- ============================================================================
-- The mumineen list decides whether a member is transferred from that member's
-- OWN status column (this is what server-side pagination requires; PostgREST
-- cannot express "member.status = 'transferred' OR hof.status = 'transferred'"
-- in a single query, and forcing an inner join to the parent silently DROPS
-- members whose hof_id is NULL — verified against this project's API).
--
-- handleTransfer writes the HOF and then its members, so the two normally
-- agree. They can drift if:
--   * the member cascade errored (now surfaced in the UI rather than ignored)
--   * rows were edited directly in the database
--   * data predates the cascade being written
--
-- A drifted member shows as ACTIVE under a transferred HOF, so it still counts
-- toward active totals and still appears in kitchen-facing lists.
--
-- STEP 1 — inspect. Run this first and read the output. It changes nothing.
--
--   select m.id, m.sf_no, m.full_name, m.status as member_status,
--          h.id as hof_id, h.full_name as hof_name, h.status as hof_status
--   from public.mumineen m
--   join public.mumineen h on h.id = m.hof_id
--   where m.is_hof = false
--     and h.status = 'transferred'
--     and m.status is distinct from 'transferred'
--   order by h.full_name, m.full_name;
--
-- STEP 2 — repair. Only run this once step 1's list looks correct to you.
-- ============================================================================

update public.mumineen m
   set status = 'transferred'
  from public.mumineen h
 where h.id = m.hof_id
   and m.is_hof = false
   and h.status = 'transferred'
   and m.status is distinct from 'transferred';

-- ============================================================================
-- VERIFY — expect 0
--
--   select count(*)
--   from public.mumineen m
--   join public.mumineen h on h.id = m.hof_id
--   where m.is_hof = false
--     and h.status = 'transferred'
--     and m.status is distinct from 'transferred';
--
-- OPTIONAL — make drift structurally impossible instead of repairable.
-- Cascades HOF status to its members on every HOF status change, so the app
-- can never leave the two out of step:
--
--   create or replace function public.cascade_hof_status()
--   returns trigger language plpgsql as $$
--   begin
--     if new.is_hof and new.status is distinct from old.status then
--       update public.mumineen
--          set status = new.status
--        where hof_id = new.id and is_hof = false;
--     end if;
--     return new;
--   end $$;
--
--   create trigger trg_cascade_hof_status
--     after update of status on public.mumineen
--     for each row execute function public.cascade_hof_status();
--
-- Consider this only if members should ALWAYS mirror their HOF. It would also
-- cascade a transferred -> active change, which the app does not currently do.
-- ============================================================================
