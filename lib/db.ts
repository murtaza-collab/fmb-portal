/**
 * Guard for Supabase writes that silently affect zero rows.
 *
 * A PostgREST UPDATE/DELETE that matches nothing — because RLS filtered it or
 * the id is stale — returns HTTP 204 with `error === null`. Verified against
 * the live API: a PATCH with a non-matching filter returns 204 and an empty
 * body, while the same request with .select() returns 200 and []. So without
 * .select() there is no signal whatsoever, and callers report success for a
 * write that did nothing.
 *
 * This matters more since RLS was tightened (2026-08-29): a policy gap now
 * surfaces as a silent no-op rather than an error.
 *
 * Usage — the query MUST already have .select() chained:
 *
 *   const r = await wrote(
 *     supabase.from('house_sectors').update({ name }).eq('id', id).select('id'),
 *     'sector',
 *   )
 *   if (!r.ok) { setActionError(r.message); return }
 */
export type WriteResult = { ok: true } | { ok: false; message: string }

export async function wrote(
  query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  subject = 'record',
): Promise<WriteResult> {
  const { data, error } = await query
  if (error) return { ok: false, message: error.message }
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: `No ${subject} was changed — it may have been removed, or you may not have permission.`,
    }
  }
  return { ok: true }
}
