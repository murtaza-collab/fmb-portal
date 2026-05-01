# FMB Portal — Full Codebase Context
> Last updated: 2026-04-30 (v4.3 audit)

---

## OVERVIEW

FMB Portal manages thaali (food distribution) operations for the Dawoodi Bohra community (Faiz ul Mawaid il Burhaniyah). Two apps share one Next.js codebase:

1. **Admin Portal** (`/app/(portal)/`) — Staff dashboard for mumineen, thaali, kitchen, takhmeen, notifications management
2. **Kitchen Portal** (`/app/kitchen/`) — Distributor check-in and counter-flow tracking

---

## TECH STACK

| Layer | Tech | Version |
|-------|------|---------|
| Framework | Next.js (App Router) | 15.5.12 |
| React | React / React DOM | 19.2.3 |
| Language | TypeScript (strict) | 5.x |
| CSS | Tailwind CSS 4 + Bootstrap 5.3.8 | latest |
| Components | Reactstrap | 9.2.3 |
| Icons | Bootstrap Icons (CDN) | 1.11.3 |
| Database | Supabase (PostgreSQL + RLS + Auth) | 2.97.0 |
| Auth SSR | @supabase/ssr | 0.9.0 |
| QR Scanning | html5-qrcode | 2.3.8 |
| PDF Gen | jsPDF | 4.2.0 |
| QR Code Gen | qrcode | 1.5.4 |

**Build:** ESLint ignored during builds. No ORM — raw Supabase queries.

---

## FILE MAP

### App Routes

```
app/
├── layout.tsx                          Root layout — theme flash prevention, dark/light/system
├── page.tsx                            → redirect to /login
├── login/page.tsx                      Auth: username@fmb.internal email mapping
├── privacy-policy/page.tsx             Data privacy page (light-theme forced)
│
├── (portal)/                           Admin portal (sidebar + topbar)
│   ├── layout.tsx                      Auth guard, permissions loader, sidebar nav, theme
│   ├── dashboard/page.tsx              Stats, kitchen flow, menu, fiscal year rollover
│   ├── mumineen/
│   │   ├── page.tsx                    HOF list, tabs (HOFs/Members/All), CRUD
│   │   ├── [id]/page.tsx               HOF detail + family + thaali + address
│   │   └── categories/page.tsx         Mumin category CRUD (color coded)
│   ├── thaali/
│   │   ├── page.tsx                    Thaali registrations
│   │   ├── numbers/page.tsx            Thaali # management (1–9999)
│   │   ├── types/page.tsx              Normal, Spicy, Chronic
│   │   ├── categories/page.tsx         Large, Medium, Mini, One Day
│   │   ├── stickers/page.tsx           PDF label generator (12/page, dual QR)
│   │   ├── stop-requests/page.tsx      Approve/reject stop requests (indefinite flag)
│   │   └── customizations/page.tsx     Daily meal overrides (expandable rows)
│   ├── takhmeen/page.tsx               Annual pledge (verify → entry → approve tabs)
│   ├── distribution/page.tsx           Export by FY, filters, CSV
│   ├── distributors/page.tsx           CRUD + sector assignment
│   ├── sectors/page.tsx                house_sectors CRUD
│   ├── calendar/page.tsx               Gregorian/Hijri dual calendar, menu & schedule
│   ├── users/page.tsx                  Admin users + groups + permissions matrix
│   ├── settings/page.tsx               Sectors, blocks, types, niyyat, thaali, kitchen settings
│   ├── address-requests/page.tsx       Pending address change approvals
│   ├── notifications/page.tsx          Templates + broadcast + log
│   └── components/
│       └── NotificationBell.tsx        Real-time dropdown, unread badge, mark-as-read
│
├── kitchen/                            Kitchen portal (no sidebar, slim topbar, live clock)
│   ├── layout.tsx                      Kitchen shell
│   ├── page.tsx                        Arrival check-in (manual / QR / RFID)
│   ├── scan/page.tsx                   QR scan mobile view, auto-demo mode
│   ├── counter-a/
│   │   ├── page.tsx                    Counter A list
│   │   └── [id]/page.tsx               Counter A session detail — confirm → in_progress
│   ├── counter-b/page.tsx              Counter B — mark counter_b_done
│   ├── counter-c/page.tsx              Counter C — mark counter_c_done
│   └── dispatch/page.tsx              Final dispatch — mark dispatched
│
└── api/
    ├── kitchen/arrival/route.ts         POST: check-in session, GET: today's session
    ├── admin/create-mumin-user/route.ts POST: create Supabase auth user for HOF
    ├── admin/change-password/route.ts   POST: reset admin password
    ├── mumineen/family/route.ts         GET/POST: family member self-service
    ├── mumineen/profile/route.ts        GET/POST: mumin profile self-service
    └── notifications/broadcast/route.ts POST: trigger FCM broadcast via Supabase Function
```

### Libraries

```
lib/
├── supabase.ts           Client-side Supabase (anon key) — used in 'use client' components
├── supabase/server.ts    SSR Supabase (anon key + cookies) — server actions
├── time.ts               todayPKT(), nowUTC(), formatTimePKT(), formatDateTimePKT()
├── kitchen-eligible.ts   loadKitchenDayData(), getEligibleRegistrations(), getStoppedMuminIds()
└── hijri.ts              Hijri↔Gregorian (Misri/Bohra calendar), getFMBFiscalYear()

components/
└── NavigationProgress.tsx  Progress bar on route changes

scripts/
└── create_mumin_auth_users.js  Bulk one-time auth user creation

supabase/functions/
└── create-mumin-user/index.ts  Edge Function (used by broadcast notifications)
```

---

## DATABASE SCHEMA

### Core Tables

**mumineen** — Community members
- `sf_no`, `its_no`, `full_name`, `dob`, `phone_no`, `whatsapp_no`, `email`
- `full_address`, `address_sector_id`, `address_block_id`, `address_type_id`
- `address_number`, `address_category`, `address_floor`
- `is_hof`, `hof_id`, `status` (active/transferred)
- `niyyat_status_id`, `mumin_category_id`
- `total_adult`, `total_child`, `total_infant`, `remarks`
- `auth_id`, `change_address`, `niyyat_done`, `niyyat_done_on`

**mumin_categories** — HOF classification: name, hex color, description, status
**niyyat_statuses** — No-Show → Verified → Pending Approval → Approved
**house_sectors**, **house_blocks**, **house_types** — Address hierarchy

### Thaali Tables

**thaalis** — Physical thaali numbers (1–9999)

**thaali_registrations** — mumin → thaali link
- `mumin_id`, `thaali_id`, `thaali_type_id`, `thaali_category_id`
- `distributor_id`, `fiscal_year_id`, `status`, `remarks`

**thaali_types** — Normal, Spicy, Chronic
**thaali_categories** — Large, Medium, Mini, One Day

**stop_thaalis** — Pause requests
- `mumin_id`, `thaali_id`, `from_date`, `to_date`
- `status`: pending → approved → rejected
- Indefinite: `to_date = '2099-12-31'`

**thaali_customizations** — Daily overrides per mumin
- `mithas`, `tarkari`, `soup`, `chawal`, `roti`, `salad`
- `stop_thaali`, `notes`, `extra_items`, `status`
- Date-scoped per submission

### Kitchen Tables

**thaali_schedule** — Per-day kitchen config
- `event_date`, `thaali_enabled`, `event_name`
- `niyyat_status_ids[]`, `thaali_type_ids[]`, `thaali_category_ids[]`
- `extra_thaali_count`, `notes`

**daily_menu** — Per-day menu
- `mithas`, `tarkari`, `chawal`, `soup`, `roti`, `notes`, `extra_items[]`

**distribution_sessions** — Distributor flow tracking
- `distributor_id`, `session_date`, `arrived_at` (UTC ISO)
- `total_thaalis`, `stopped_thaalis`, `customized_thaalis`, `default_thaalis`
- `status`: arrived → in_progress → counter_b_done → counter_c_done → dispatched

### Admin Tables

**admin_users** — `auth_id`, `full_name`, `username`, `user_group_id`, `status`
**user_groups** — Role templates
**permissions** — Module × action matrix: `can_view`, `can_add`, `can_edit`, `can_deactivate` (9 modules)

### Takhmeen Tables

**takhmeen** — Annual pledge
- `mumin_id`, `fiscal_year_id`, `niyyat_amount`, `approved_amount`
- `approved_at`, `remarks`, `status`

**fiscal_years** — Hijri fiscal years (1 Ramadan → 29 Shaban)
**takhmeen_niyyat_log** — Audit trail
**fiscal_year_rollovers** — Rollover event log

### Distributor Tables

**distributors** — `full_name`, `username`, `phone_no`, `status`
**distributor_sectors** — N:M: distributor ↔ house_sectors

### Notification Tables

**notifications** — `id`, `title`, `message`, `type`, `category`, `is_read`, `created_at`, `read_at`
**notification_templates** — `event_type`, `title`, `body`, `enabled`
**notification_logs** — Broadcast history: `sent_at`, `sent_count`, `segment`

---

## AUTHENTICATION & PERMISSIONS

### Login Flow
```
Username → email mapping: {username}@fmb.internal
→ supabase.auth.signInWithPassword()
→ Check admin_users.status === 'active'
→ Load user_groups → permissions
→ Redirect to /dashboard
```

### Permissions Model
- `admin_users` → `user_groups` (M:1)
- `user_groups` → `permissions` (1:M, one row per module)
- 9 modules: mumineen, thaali, takhmeen, distribution, distributors, sectors, calendar, users, settings
- Each: `can_view`, `can_add`, `can_edit`, `can_deactivate`
- Super Admin / Admin bypass all module checks
- Portal layout filters sidebar nav by `can_view`

### Mumin Auth (Flutter App)
- HOF email: `{sf_no}@fmb.internal` (lowercase) — SF# is the login ID
- Password: ITS# — this is the permanent credential, not a temp password
- Created via `/api/admin/create-mumin-user` when a new HOF is added in the portal
- Flutter app authenticates mumineen using SF# (as email prefix) + ITS# (as password) via Supabase Auth
- `email_confirm: true` is set so no email verification is required

---

## KITCHEN FLOW

### Eligibility Chain (lib/kitchen-eligible.ts)
1. Load `thaali_schedule` for today → if `thaali_enabled = false`, skip all
2. Fetch `thaali_registrations` where `thaali_id IS NOT NULL`
3. Filter: `mumin.niyyat_status_id IN schedule.niyyat_status_ids`
4. Exclude: mumineen with approved stop covering today (`from_date ≤ today ≤ to_date`)
5. Exclude: if category filter set and `thaali_category_id NOT IN schedule.thaali_category_ids`
6. Count by category, add `extra_thaali_count`

### Session Status Flow
```
arrived → in_progress → counter_b_done → counter_c_done → dispatched
```

### Stop Thaali Logic
- `pending` → no kitchen effect
- `approved` + `from_date ≤ today ≤ to_date` → excluded from kitchen
- `to_date = '2099-12-31'` → indefinite
- Past `to_date` → historical only

### Check-In API (POST /api/kitchen/arrival)
```
{ distributor_id } 
→ Validate distributor exists
→ Count eligible thaalis via lib/kitchen-eligible.ts
→ Count approved stops for today
→ Count customizations for today
→ Upsert distribution_sessions (unless already dispatched)
→ Return session with counts + distributor_name
```

---

## NOTIFICATIONS SYSTEM

### Architecture
```
Mumineen App → FCM Token → DB
Admin Portal (Broadcast Page)
  → POST /api/notifications/broadcast
  → Supabase Function: send-push-notification
  → Firebase Cloud Messaging
  → Mumineen devices
NotificationBell (admin portal)
  → Real-time Postgres subscription on 'notifications' table
  → Shows unread count badge, dropdown, mark as read
```

### Broadcast Route (POST /api/notifications/broadcast)
- Input: `{ tokens[], title, body, segment, event_type }`
- Calls Supabase Edge Function
- No auth check in route body (session cookie implicit)

### Templates (automated triggers)
- stop_request_approved, address_approved, niyyat_approved, welcome
- Enabled/disabled, editable title/body
- Edit UI shown but persistence to DB not confirmed in audit

---

## KEY BUSINESS LOGIC

### Fiscal Year Rollover
- Triggers on 1 Ramadan (Hijri), confirmed via lib/hijri.ts
- Dashboard shows countdown, "Rollover Now" button
- Resets active HOFs: `niyyat_status = No-Show`, `niyyat_done = false`
- Logs to `fiscal_year_rollovers`; prevents double rollover

### Thaali Stickers PDF
- 12 stickers per page (2 cols × 6 rows), 92.6mm × 49.4mm each
- Per sticker: Name, SF#, Thaali#, 2 QR codes
  - QR 1: thaali_number only
  - QR 2: thaali_number + SF# combined
- Positioned from reference PDF dimensions

### Hijri Calendar (lib/hijri.ts)
- Misri calendar: odd months = 30 days, even months = 29 days
- Kabisa years (leap): adds 1 day to Zilhajj (month 12)
- Kabisa set: {2, 5, 8, 10, 13, 16, 18, 21, 24, 26, 29} in 30-year cycle
- FMB Fiscal Year: 1 Ramadan → 29 Shaban next year

### Time Utilities (lib/time.ts)
- All dates: YYYY-MM-DD in PKT (UTC+5, no DST)
- All timestamps: UTC ISO 8601
- `todayPKT()` works in both browser and Node.js environments

---

## UI PATTERNS

### Theme
- `fmb-theme` localStorage key: `light` / `dark` / `system`
- Inline script in root layout prevents flash on load
- Kitchen portal has own theme toggle (no sidebar)

### Colors
| Role | Hex |
|------|-----|
| Primary | `#364574` |
| Success | `#0ab39c` |
| Warning | `#ffbf69` |
| Danger | `#f06548` |
| Info | `#299cdb` |

### Tables
- `.table-responsive` wrapper
- Sort via Supabase `.order()`
- Pagination: PAGE_SIZE 50–100, offset-based
- Search: `.ilike()` in SQL or client-side `.includes()` for joined fields

### Modals
- Custom overlay: `.modal.show.d-block` class toggle
- Separate form state from display state
- Per-page implementation (no shared Modal component)

### Kitchen Pages
- No sidebar, slim topbar
- Live clock (1s interval)
- 10s polling for session updates
- FIFO sorting on session cards

---

## ENV VARS

```
NEXT_PUBLIC_SUPABASE_URL          — Public (client-side OK)
NEXT_PUBLIC_SUPABASE_ANON_KEY     — Public (RLS-protected)
SUPABASE_SERVICE_ROLE_KEY         — Server only (API routes)
```

---

## KNOWN ISSUES & TECH DEBT
> See ISSUES.md for full tracker. Summary below.

### Fixed (2026-04-30)
- ✅ SEC-01: create-mumin-user had no auth check — added `requireAdminAuth()` guard
- ✅ SEC-03: broadcast route had no auth check — added guard
- ✅ SEC-04: create-mumin-user leaked "email exists" — now generic error
- ✅ KIT-01: Inactive distributors could check in — added `status='active'` filter
- ✅ KIT-02: Re-check-in after dispatch silently accepted — now 409 Conflict
- ✅ KIT-03: Counter A auto-created sessions with wrong status `'active'` — now blocks and requires arrival first
- ✅ DAT-01: Orphaned auth user if mumineen DB update failed — added rollback
- ✅ LOG-01: Hijri.ts comment had wrong kabisa set — corrected

### Still Open
- 🔴 SEC-02: HOF password = ITS# (no force-reset on first login)
- 🟠 SEC-05: No explicit Bearer token validation in API routes
- 🟠 SEC-06: No rate limiting on `/api/kitchen/arrival`
- 🟠 QRY-01: Client-side text search on mumineen/thaali — should use SQL `.ilike()`
- 🟡 KIT-04: stop_thaalis `to_date` inclusive boundary — document and verify intent
- 🟡 DAT-02: Orphaned customizations (no registration) crash customizations page
- 🟡 DAT-03: stop_thaali=true + food items saved together — mutually exclusive, clear on save
- 🟡 MF-01: Notification template edits may not persist to DB — verify save handler
- 🟡 MF-04: ITS# min-length not enforced on HOF add form (only in API)
- 🟢 KIT-05: Stale closure in Counter B QR scanner callback
- 🟢 LOG-02: Calendar lock cutoff uses local hours, not PKT
- 🟢 LOG-03: Calendar save error calls fetchData() even on failure
- 🟢 CQ-05: Zero test files

---

## DEPLOYMENT

- Hosting: Vercel (inferred — Next.js 15, no Dockerfile)
- Database: Supabase (hosted PostgreSQL)
- Edge Functions: Supabase Functions (send-push-notification)
- Push Notifications: Firebase Cloud Messaging (FCM)
- No ORM — direct Supabase client queries
- Build: `next build` (ESLint errors ignored via `ignoreDuringBuilds: true`)
