# FMB Portal — Issues Tracker
> Generated: 2026-04-30 | Full codebase audit + second-pass review

Legend: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low | ✅ Fixed | ⏳ Open

---

## SECURITY

| ID | Sev | Status | File | Issue |
|----|-----|--------|------|-------|
| SEC-01 | 🔴 | ✅ Fixed | `api/admin/create-mumin-user/route.ts` | No auth/role check — any logged-in user could create Supabase auth accounts. Added `requireAdminAuth()` guard + isAdmin check. |
| SEC-02 | — | ✅ By Design | `api/admin/create-mumin-user/route.ts` | HOF auth: email = `{sf_no}@fmb.internal`, password = ITS#. This is intentional — the Flutter app authenticates mumineen using SF# as login ID and ITS# as password. No force-reset needed. |
| SEC-03 | 🟠 | ✅ Fixed | `api/notifications/broadcast/route.ts` | No auth check on broadcast route. Added `requireAdminAuth()` guard. |
| SEC-04 | 🟠 | ✅ Fixed | `api/admin/create-mumin-user/route.ts` | Error message revealed whether email already existed. Now returns generic message. |
| SEC-05 | 🟠 | ⏳ Open | All API routes | No explicit Bearer token validation — routes rely on implicit HTTP-only session cookie. Acceptable if CSRF protection is in place (verify Supabase SSR handles this). |
| SEC-06 | 🟡 | ⏳ Open | `api/kitchen/arrival/route.ts` | No rate limiting. A bad actor could spam check-ins. Add per-IP or per-distributor throttle (e.g., 1 req/min). |
| SEC-07 | 🟡 | ⏳ Open | RLS policies | All RLS policies assumed correct but never audited. Run Supabase RLS audit to confirm data isolation. |

---

## KITCHEN FLOW

| ID | Sev | Status | File | Issue |
|----|-----|--------|------|-------|
| KIT-01 | 🟠 | ✅ Fixed | `api/kitchen/arrival/route.ts:22` | Inactive distributors could check in (no `status='active'` filter). Added `.eq('status','active')` + 403 response. |
| KIT-02 | 🟠 | ✅ Fixed | `api/kitchen/arrival/route.ts:88` | Re-check-in after dispatch silently accepted. Now returns 409 Conflict when session is already dispatched. |
| KIT-03 | 🟠 | ✅ Fixed | `kitchen/counter-a/[id]/page.tsx:131` | Counter A was auto-creating a session with wrong status `'active'` (not in the flow) when no arrival session existed, bypassing all arrival-step validation. Now shows an error directing staff to the arrival desk. |
| KIT-04 | 🟡 | ⏳ Open | `lib/kitchen-eligible.ts:78` | `stop_thaalis` query uses `gte('to_date', today)` — inclusive. Document clearly that `to_date` is the last stopped day (inclusive). If edge-case disputes arise, verify with users. |
| KIT-05 | 🟢 | ✅ N/A | `kitchen/counter-b/page.tsx` | Already fixed in codebase — `handleScanRef.current` is updated on every render via `useEffect(() => { handleScanRef.current = handleScan; })`. `currentRef` and `activeSessionRef` refs also in place. |

---

## DATA INTEGRITY

| ID | Sev | Status | File | Issue |
|----|-----|--------|------|-------|
| DAT-01 | 🟠 | ✅ Fixed | `api/admin/create-mumin-user/route.ts` | If `mumineen.update()` failed after auth user creation, auth user was left orphaned. Now rolls back (`auth.admin.deleteUser`) on failure. |
| DAT-02 | 🟡 | ✅ N/A | `thaali/customizations/page.tsx` | Orphaned customizations would crash the page. Verified: page is read-only display from Flutter app; null reg is already handled gracefully (shows '—'). Not a real bug. |
| DAT-03 | 🟡 | ✅ N/A | `thaali/customizations/page.tsx` | `stop_thaali: true` and food items saved together — mutually exclusive states. Verified: page is read-only; save logic lives in Flutter app, not this portal. Not a portal issue. |
| DAT-04 | 🟢 | ⏳ Open | `kitchen/counter-a/[id]/page.tsx:133` | (Removed by KIT-03 fix) Session was created with no thaali counts. |

---

## QUERY ISSUES

| ID | Sev | Status | File | Issue |
|----|-----|--------|------|-------|
| QRY-01 | 🟠 | ✅ Fixed | `thaali/page.tsx` | Client-side search only scanned the current page (50 rows), missing results on other pages; pagination count was also wrong when search active. Fixed: server-side mumin ID lookup via `.or('full_name.ilike,sf_no.ilike,its_no.ilike')` + thaali number match from preloaded lookup, then `.or('mumin_id.in,thaali_id.in')` filter on registrations query. Count is now accurate for pagination. |
| QRY-02 | 🟢 | ✅ Fixed | `thaali/stickers/page.tsx` | Interface already had `thaalis?: { thaali_number: number }`. Fixed: `as any[]` cast on `setRegistrations` → `as AssignedThaali[]`; removed `(r: any)` and `as any` casts throughout. |

---

## LOGIC BUGS

| ID | Sev | Status | File | Issue |
|----|-----|--------|------|-------|
| LOG-01 | 🟢 | ✅ Fixed | `lib/hijri.ts:9` | Comment said kabisa years `2,5,7,10,13,15,18,21,24,26,29` but code correctly uses `2,5,8,10,13,16,18,21,24,26,29` (Bohra Misri set). Fixed the comment. |
| LOG-02 | 🟡 | ✅ Fixed | `calendar/page.tsx` | `todayStr` now uses `todayPKT()` and lock cutoff uses `new Date(Date.now() + 5*3600000).getUTCHours() >= 6` — both PKT-aware. |
| LOG-03 | 🟡 | ✅ N/A | `calendar/page.tsx:237` | Both `saveMenu` and `saveSchedule` already have `if (error) return showMsg(...)` early return — `fetchData()` is never called on failure. False positive. |

---

## UX BUGS

| ID | Sev | Status | File | Issue |
|----|-----|--------|------|-------|
| UX-01 | 🟢 | ✅ N/A | `thaali/page.tsx:285` | Verified: `openAdd()` explicitly resets all fields (`mumin_id: 0, mumin_label: '', thaali_id: '', thaali_type_id: '', thaali_category_id: '', distributor_id: ''`). No stale values possible. False positive. |

---

## CODE QUALITY

| ID | Sev | Status | File | Issue |
|----|-----|--------|------|-------|
| CQ-01 | 🟢 | ⏳ Open | Multiple pages | `useState<any[]>([])` — explicit `any` used in kitchen pages. Add proper types. |
| CQ-02 | 🟢 | ⏳ Open | Multiple pages | Address building logic duplicated across `mumineen`, `address-requests`, `takhmeen`. Extract to `lib/address.ts`. |
| CQ-03 | 🟢 | ⏳ Open | All portal pages | No shared Modal component. Per-page implementations differ in style. |
| CQ-04 | 🟢 | ⏳ Open | All pages | Hex color strings hardcoded throughout. Move to CSS variables or Tailwind tokens. |
| CQ-05 | 🟢 | ⏳ Open | Entire codebase | Zero test files. At minimum, add unit tests for `lib/hijri.ts`, `lib/kitchen-eligible.ts`, and API routes. |

---

## MISSING FEATURES / OPEN QUESTIONS

| ID | Priority | Description |
|----|----------|-------------|
| MF-01 | 🟠 | ✅ Fixed | Notifications page had two bugs: (1) toggle only updated local state — never persisted to DB; (2) Save button was disabled when template was off, making it impossible to turn off a template. Fixed: toggle now auto-saves via `toggleTemplate()` with optimistic revert on failure. Save button no longer disabled when off. Title/body inputs now editable regardless of enabled state. |
| MF-02 | 🟡 Medium | No delivery status shown after broadcast — would be helpful to display "X sent, Y failed" per FCM response. |
| MF-03 | 🟢 Low | No pagination on notification logs — grows unbounded over time. Add limit/offset. |
| MF-04 | 🟡 | ✅ Fixed | `mumineen/page.tsx`, `api/admin/create-mumin-user/route.ts` | ITS# now validated as exactly 8 digits (`/^\d{8}$/`) in both `handleSave` and `handleSaveMember`. API updated from `length < 6` to same regex. Inputs have `maxLength={8}` and `inputMode="numeric"`. |

---

## FIXES APPLIED (continued, 2026-04-30)

| File | What Changed |
|------|-------------|
| `thaali/page.tsx` | **QRY-01** — Server-side search: pre-queries `mumineen` by ilike + matches thaali numbers from preloaded lookup; applies `.or('mumin_id.in,thaali_id.in')` on registrations. Pagination count now accurate. |
| `thaali/customizations/page.tsx` | Replaced `localToday()` (browser timezone) with `todayPKT()` from `lib/time` — fixes wrong default date for users overseas |

---

## FIXES APPLIED (first batch, 2026-04-30)

| File | What Changed |
|------|-------------|
| `lib/api-auth.ts` | **NEW** — shared auth helper for API routes (`requireAdminAuth()`) |
| `api/admin/create-mumin-user/route.ts` | Added admin auth guard, generic error messages, auth rollback on DB failure |
| `api/kitchen/arrival/route.ts` | Added `status='active'` distributor check, 409 on already-dispatched, `isNaN` guard on distributor_id |
| `api/notifications/broadcast/route.ts` | Added admin auth guard, proper error handling on function call failure |
| `kitchen/counter-a/[id]/page.tsx` | Block "Confirm & Send" if no arrival session exists (requires proper check-in first) |
| `lib/hijri.ts` | Fixed wrong kabisa set comment |
