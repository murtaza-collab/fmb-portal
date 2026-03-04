/**
 * Misri (Fatimi) Hijri Calendar Utility
 * Dawoodi Bohra community — tabular calculation from Bu Saheba Sahifa
 *
 * Rules:
 * - Odd months (1,3,5,7,9,11) = 30 days (kamil)
 * - Even months (2,4,6,8,10,12) = 29 days (naqis)
 * - Kabisa years: Zilhajj (month 12) gets 30 days instead of 29
 * - Kabisa years in 30-year cycle: 2,5,7,10,13,15,18,21,24,26,29
 *
 * Verified anchor: 1 Moharram 1446H = 7 July 2024
 * Verified: 1 Ramadan 1447H = 17 Feb 2026 ✓
 * Verified: 1 Moharram 1447H = 26 Jun 2025 ✓
 */

export const HIJRI_MONTHS = [
  'Moharram ul Haram',
  'Safar ul Muzaffar',
  'Rabi ul Awwal',
  'Rabi ul Aakhar',
  'Jumad ul Ula',
  'Jumad ul Ukhra',
  'Rajab ul Asab',
  'Shaban ul Karim',
  'Ramadan ul Moazzam',
  'Shawwal ul Mukarram',
  'Zilqad ul Haram',
  'Zilhajj ul Haram',
]

export const HIJRI_MONTHS_SHORT = [
  'Moharram', 'Safar', 'Rabi I', 'Rabi II',
  'Jumad I', 'Jumad II', 'Rajab', 'Shaban',
  'Ramadan', 'Shawwal', 'Zilqad', 'Zilhajj',
]

// Bohra Misri kabisa set (differs from standard Islamic tabular)
// Verified: 1447H (mod30=7) is NOT kabisa → Zilhajj=29 days, ends 14 Jun 2026 ✓
const KABISA_YEARS = new Set([2, 5, 8, 10, 13, 16, 18, 21, 24, 26, 29])

export function isKabisa(hijriYear: number): boolean {
  return KABISA_YEARS.has(hijriYear % 30)
}

export function daysInHijriMonth(month: number, hijriYear: number): number {
  if (month % 2 === 1) return 30
  if (month === 12 && isKabisa(hijriYear)) return 30
  return 29
}

export function daysInHijriYear(hijriYear: number): number {
  return isKabisa(hijriYear) ? 355 : 354
}

// Anchor: 1 Moharram 1446H = 7 July 2024
const ANCHOR_YEAR = 1446
const ANCHOR_MONTH = 1
const ANCHOR_DAY = 1
const ANCHOR_DATE = new Date(2024, 6, 7)

export function hijriToGregorian(hYear: number, hMonth: number, hDay: number): Date {
  let diffDays = 0

  if (hYear > ANCHOR_YEAR) {
    for (let m = ANCHOR_MONTH; m <= 12; m++) diffDays += daysInHijriMonth(m, ANCHOR_YEAR)
    for (let y = ANCHOR_YEAR + 1; y < hYear; y++) diffDays += daysInHijriYear(y)
    for (let m = 1; m < hMonth; m++) diffDays += daysInHijriMonth(m, hYear)
  } else if (hYear === ANCHOR_YEAR) {
    for (let m = ANCHOR_MONTH; m < hMonth; m++) diffDays += daysInHijriMonth(m, hYear)
  } else {
    for (let y = hYear; y < ANCHOR_YEAR; y++) diffDays -= daysInHijriYear(y)
    for (let m = 1; m < ANCHOR_MONTH; m++) diffDays += daysInHijriMonth(m, ANCHOR_YEAR)
    for (let m = 1; m < hMonth; m++) diffDays -= daysInHijriMonth(m, hYear)
  }

  diffDays += hDay - ANCHOR_DAY
  const result = new Date(ANCHOR_DATE)
  result.setDate(result.getDate() + diffDays)
  return result
}

export function gregorianToHijri(date: Date): { year: number; month: number; day: number } {
  const gDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const anchor = new Date(ANCHOR_DATE.getFullYear(), ANCHOR_DATE.getMonth(), ANCHOR_DATE.getDate())
  let diffDays = Math.round((gDate.getTime() - anchor.getTime()) / 86400000)

  let hYear = ANCHOR_YEAR, hMonth = ANCHOR_MONTH, hDay = ANCHOR_DAY

  if (diffDays >= 0) {
    while (diffDays > 0) {
      const dim = daysInHijriMonth(hMonth, hYear)
      const remaining = dim - hDay + 1
      if (diffDays < remaining) { hDay += diffDays; diffDays = 0 }
      else { diffDays -= remaining; hDay = 1; hMonth++; if (hMonth > 12) { hMonth = 1; hYear++ } }
    }
  } else {
    diffDays = -diffDays
    while (diffDays > 0) {
      if (diffDays < hDay) { hDay -= diffDays; diffDays = 0 }
      else { diffDays -= hDay; hMonth--; if (hMonth < 1) { hMonth = 12; hYear-- }; hDay = daysInHijriMonth(hMonth, hYear) }
    }
  }
  return { year: hYear, month: hMonth, day: hDay }
}

export function hijriMonthStart(hYear: number, hMonth: number): Date {
  return hijriToGregorian(hYear, hMonth, 1)
}

export function formatHijri(hYear: number, hMonth: number, hDay: number, short = false): string {
  const name = short ? HIJRI_MONTHS_SHORT[hMonth - 1] : HIJRI_MONTHS[hMonth - 1]
  return `${hDay} ${name} ${hYear}H`
}

export function todayHijri(): { year: number; month: number; day: number } {
  return gregorianToHijri(new Date())
}

export function getHijriYearMonths(hYear: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const days = daysInHijriMonth(month, hYear)
    const gregorianStart = hijriToGregorian(hYear, month, 1)
    const gregorianEnd = new Date(gregorianStart)
    gregorianEnd.setDate(gregorianEnd.getDate() + days - 1)
    return { month, name: HIJRI_MONTHS[i], nameShort: HIJRI_MONTHS_SHORT[i], days, gregorianStart, gregorianEnd }
  })
}

export function getRamadanStart(hYear: number): Date {
  return hijriToGregorian(hYear, 9, 1)
}

export function isInRamadan(date: Date): { isRamadan: boolean; hYear: number; hDay: number } {
  const h = gregorianToHijri(date)
  return { isRamadan: h.month === 9, hYear: h.year, hDay: h.day }
}

/**
 * FMB Fiscal Year = 1 Ramadan hYear → 29 Shaban (hYear+1)
 */
export function getFMBFiscalYear(hYear: number) {
  const start = hijriToGregorian(hYear, 9, 1)
  const nextRamadan = hijriToGregorian(hYear + 1, 9, 1)
  const end = new Date(nextRamadan); end.setDate(end.getDate() - 1)
  return {
    hijriYear: hYear,
    label: `${hYear}H`,
    gregorianLabel: `${start.getFullYear()}–${end.getFullYear()}`,
    startGregorian: start,
    endGregorian: end,
  }
}

// Pre-computed month starts 1446H–1447H (verified)
export const VERIFIED_MONTH_STARTS: Record<string, string> = {
  '1446-1': '2024-07-07', '1446-2': '2024-08-06', '1446-3': '2024-09-04',
  '1446-4': '2024-10-04', '1446-5': '2024-11-02', '1446-6': '2024-12-02',
  '1446-7': '2024-12-31', '1446-8': '2025-01-30', '1446-9': '2025-02-28',
  '1446-10':'2025-03-30', '1446-11':'2025-04-28', '1446-12':'2025-05-28',
  '1447-1': '2025-06-26', '1447-2': '2025-07-26', '1447-3': '2025-08-24',
  '1447-4': '2025-09-23', '1447-5': '2025-10-22', '1447-6': '2025-11-21',
  '1447-7': '2025-12-20', '1447-8': '2026-01-19', '1447-9': '2026-02-17',
  '1447-10':'2026-03-19', '1447-11':'2026-04-17', '1447-12':'2026-05-17', // Zilhajj ends 14 Jun (29 days, not kabisa)
}