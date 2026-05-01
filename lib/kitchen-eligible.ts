/**
 * lib/kitchen-eligible.ts
 *
 * Single source of truth for "who gets thaali today" across all kitchen screens.
 *
 * Filter chain:
 *   thaali_registrations
 *     → mumineen.niyyat_status_id IN thaali_schedule.niyyat_status_ids for today
 *     → EXCLUDE mumin_id where active/approved stop_thaali covers today
 *     → EXCLUDE if thaali_category_ids filter set and category doesn't match
 *     → optionally filter by distributor_id (Counter A)
 *
 * NOTE: is_hof filter removed — thaali registrations exist on the mumin directly,
 * not restricted to HOFs only at the kitchen eligibility level.
 *
 * NOTE: stop_thaalis — only status='active' or 'approved' rows are counted.
 * Pending stop requests do not affect kitchen eligibility until admin approves.
 */

import { supabase } from '@/lib/supabase'
import { todayPKT } from '@/lib/time'

// Keep todayISO as an alias so existing imports don't break
export const todayISO = todayPKT

export interface TodaySchedule {
  id?: number
  event_date: string
  thaali_enabled: boolean
  niyyat_status_ids: number[]
  extra_thaali_count: number
  thaali_category_ids: number[]
  event_name?: string
  notes?: string
}

export interface EligibleRegistration {
  registration_id: number
  mumin_id: number
  thaali_id: number
  thaali_number: number
  thaali_type_id: number | null
  thaali_category_id: number | null
  distributor_id: number | null
  full_name: string
  sf_no: string
  niyyat_status_id: number
}

const DEFAULT_SCHEDULE: TodaySchedule = {
  event_date: '',
  thaali_enabled: true,
  niyyat_status_ids: [1],
  extra_thaali_count: 0,
  thaali_category_ids: [],
}

// todayISO is now an alias for todayPKT — see lib/time.ts

export async function getTodaySchedule(date?: string): Promise<TodaySchedule> {
  const d = date || todayISO()
  const { data } = await supabase
    .from('thaali_schedule')
    .select('*')
    .eq('event_date', d)
    .maybeSingle()
  if (!data) return { ...DEFAULT_SCHEDULE, event_date: d }
  return data as TodaySchedule
}

// Only 'approved' stops affect kitchen — pending/rejected have no effect.
// 'active' status removed from the data model — approved is the single active state.
export async function getStoppedMuminIds(date?: string): Promise<Set<number>> {
  const d = date || todayISO()
  const { data } = await supabase
    .from('stop_thaalis')
    .select('mumin_id')
    .lte('from_date', d)
    .gte('to_date', d)
    .eq('status', 'approved')
  return new Set((data || []).map((s: any) => s.mumin_id))
}

export async function getEligibleRegistrations(opts: {
  schedule: TodaySchedule
  stoppedMuminIds: Set<number>
  distributorId?: number
}): Promise<EligibleRegistration[]> {
  let query = supabase
    .from('thaali_registrations')
    .select(`
      id,
      mumin_id,
      thaali_id,
      thaali_type_id,
      thaali_category_id,
      distributor_id,
      thaalis!fk_tr_thaali(thaali_number),
      mumineen!fk_tr_mumin(full_name, sf_no, niyyat_status_id)
    `)
    .not('thaali_id', 'is', null)

  if (opts.distributorId) {
    query = query.eq('distributor_id', opts.distributorId)
  }

  const { data, error } = await query
  if (error || !data) return []

  const statusIds = opts.schedule.niyyat_status_ids.map(Number)

  return (data as any[])
    .filter(r => {
      const m = r.mumineen
      if (!m) return false
      if (!statusIds.includes(Number(m.niyyat_status_id))) return false
      if (opts.stoppedMuminIds.has(r.mumin_id)) return false
      if (
        opts.schedule.thaali_category_ids?.length > 0 &&
        !opts.schedule.thaali_category_ids.includes(r.thaali_category_id)
      ) return false
      return true
    })
    .map(r => ({
      registration_id: r.id,
      mumin_id: r.mumin_id,
      thaali_id: r.thaali_id,
      thaali_number: r.thaalis?.thaali_number,
      thaali_type_id: r.thaali_type_id,
      thaali_category_id: r.thaali_category_id,
      distributor_id: r.distributor_id,
      full_name: r.mumineen?.full_name || '',
      sf_no: r.mumineen?.sf_no || '',
      niyyat_status_id: r.mumineen?.niyyat_status_id,
    }))
}

export async function loadKitchenDayData(opts: { distributorId?: number; date?: string }) {
  const [schedule, stoppedMuminIds] = await Promise.all([
    getTodaySchedule(opts.date),
    getStoppedMuminIds(opts.date),
  ])

  if (!schedule.thaali_enabled) {
    return { schedule, stoppedMuminIds, eligible: [], noThaaliDay: true }
  }

  const eligible = await getEligibleRegistrations({
    schedule,
    stoppedMuminIds,
    distributorId: opts.distributorId,
  })

  return { schedule, stoppedMuminIds, eligible, noThaaliDay: false }
}