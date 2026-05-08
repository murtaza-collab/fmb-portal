import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminAuth } from '@/lib/api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const { rows } = await req.json()
  // rows: Array<{ sf_no: string, amounts: { [hijri_year: string]: number } }>

  if (!Array.isArray(rows) || !rows.length) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }

  // 1. Load all mumineen SF# → id map
  const { data: mumineen, error: mErr } = await supabase
    .from('mumineen')
    .select('id, sf_no')
    .eq('is_hof', true)

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  const muminMap = new Map<string, number>()
  for (const m of mumineen ?? []) {
    muminMap.set(String(m.sf_no).trim().toLowerCase(), m.id)
  }

  // 2. Load fiscal years hijri_year → id map
  const { data: fiscalYears, error: fyErr } = await supabase
    .from('fiscal_years')
    .select('id, hijri_year')

  if (fyErr) return NextResponse.json({ error: fyErr.message }, { status: 500 })

  const fyMap = new Map<string, number>()
  for (const fy of fiscalYears ?? []) {
    fyMap.set(String(fy.hijri_year).trim().toLowerCase(), fy.id)
  }

  // 3. Process rows
  const report = {
    total:    rows.length,
    inserted: 0,
    updated:  0,
    skipped:  0,  // zero amounts
    failed:   [] as { sf_no: string; reason: string }[],
  }

  const toUpsert: {
    mumin_id: number
    fiscal_year_id: number
    approved_amount: number
    status: string
    niyyat_amount: number | null
    approved_at: string | null
    remarks: string | null
  }[] = []

  for (const row of rows) {
    const sfNo = String(row.sf_no ?? '').trim().toLowerCase()
    if (!sfNo) { report.failed.push({ sf_no: String(row.sf_no), reason: 'Empty SF#' }); continue }

    const muminId = muminMap.get(sfNo)
    if (!muminId) {
      report.failed.push({ sf_no: String(row.sf_no), reason: 'SF# not found in portal' })
      continue
    }

    for (const [year, amount] of Object.entries(row.amounts ?? {})) {
      const amt = Number(amount)
      if (!amt || amt <= 0) { report.skipped++; continue }

      const fyId = fyMap.get(year.trim().toLowerCase())
      if (!fyId) {
        report.failed.push({ sf_no: String(row.sf_no), reason: `Fiscal year "${year}" not found` })
        continue
      }

      toUpsert.push({
        mumin_id:        muminId,
        fiscal_year_id:  fyId,
        approved_amount: amt,
        status:          'approved',
        niyyat_amount:   amt,
        approved_at:     null,
        remarks:         'Imported from historical data',
      })
    }
  }

  // 4. Upsert in batches of 100
  if (toUpsert.length > 0) {
    // Check which ones already exist to distinguish insert vs update
    const { data: existing } = await supabase
      .from('takhmeen')
      .select('mumin_id, fiscal_year_id')

    const existingSet = new Set(
      (existing ?? []).map(e => `${e.mumin_id}_${e.fiscal_year_id}`)
    )

    for (let i = 0; i < toUpsert.length; i += 100) {
      const batch = toUpsert.slice(i, i + 100)
      const { error } = await supabase
        .from('takhmeen')
        .upsert(batch, { onConflict: 'mumin_id,fiscal_year_id' })

      if (error) {
        report.failed.push({ sf_no: 'batch', reason: error.message })
      } else {
        for (const r of batch) {
          if (existingSet.has(`${r.mumin_id}_${r.fiscal_year_id}`)) report.updated++
          else report.inserted++
        }
      }
    }
  }

  return NextResponse.json({ report })
}
