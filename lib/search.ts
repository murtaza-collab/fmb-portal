/**
 * Escaping helpers for PostgREST text search.
 *
 * A raw search term interpolated into `.or('col.ilike.%term%')` breaks in two
 * ways, both verified against the live API:
 *
 *   - `,` `(` `)` are logic-tree delimiters. A term containing one either
 *     fails the whole request with PGRST100 (the Supabase client then returns
 *     data: null, so the list silently renders empty) or, with `)`, parses
 *     into a *different* filter and returns wrong rows.
 *   - `%` and `_` are LIKE wildcards. Searching `%` matched every row in the
 *     table rather than the literal character.
 *
 * Wrapping the value in double quotes fixes the delimiters; escaping the LIKE
 * metacharacters fixes the wildcards. Two escape layers apply, innermost first:
 *
 *   1. SQL ILIKE   — `\` escapes `%` and `_`
 *   2. PostgREST   — inside "..." , `\` escapes `\` and `"`
 */
export function escapeSearchTerm(raw: string): string {
  const likeSafe = raw
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
  return likeSafe
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

/**
 * Build a quoted PostgREST `or=` filter matching `term` against every column
 * in `columns` (case-insensitive substring).
 *
 *   buildIlikeOr(['full_name', 'sf_no'], 'a,b')
 *   // full_name.ilike."%a,b%",sf_no.ilike."%a,b%"
 *
 * Pass the result straight to `.or(...)`.
 */
export function buildIlikeOr(columns: string[], term: string): string {
  const safe = escapeSearchTerm(term.trim())
  return columns.map(c => `${c}.ilike."%${safe}%"`).join(',')
}
