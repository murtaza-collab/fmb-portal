/**
 * lib/time.ts
 *
 * Single source of truth for date/time across the entire FMB Portal.
 *
 * Pakistan Standard Time = UTC+5, no DST.
 *
 * Rules:
 *   - DATE strings (YYYY-MM-DD) → always PKT — use todayPKT()
 *   - TIMESTAMP storage         → always UTC ISO (standard DB practice)
 *   - TIMESTAMP display         → convert to PKT for display
 *
 * Works identically on client (browser) and server (Vercel/Node).
 * Never use new Date().toISOString().split('T')[0] — that returns UTC date.
 */

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5

/**
 * Returns today's date in YYYY-MM-DD format in Pakistan time.
 * Safe to call on both client and server.
 */
export function todayPKT(): string {
  const pkt = new Date(Date.now() + PKT_OFFSET_MS);
  const yyyy = pkt.getUTCFullYear();
  const mm   = String(pkt.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(pkt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns current time as a UTC ISO string for DB timestamp columns.
 * Timestamps are always stored in UTC — display layer converts to PKT.
 */
export function nowUTC(): string {
  return new Date().toISOString();
}

/**
 * Formats a UTC ISO timestamp for display in PKT.
 * e.g. "2026-03-25T04:30:00Z" → "9:30 AM" (PKT)
 */
export function formatTimePKT(utcISO: string): string {
  const d = new Date(utcISO);
  return d.toLocaleTimeString('en-US', {
    hour:     'numeric',
    minute:   '2-digit',
    timeZone: 'Asia/Karachi',
  });
}

/**
 * Formats a UTC ISO timestamp as full date+time in PKT.
 */
export function formatDateTimePKT(utcISO: string): string {
  const d = new Date(utcISO);
  return d.toLocaleString('en-US', {
    day:      'numeric',
    month:    'short',
    year:     'numeric',
    hour:     'numeric',
    minute:   '2-digit',
    timeZone: 'Asia/Karachi',
  });
}