# TODO

Open items as of 2026-09-13. Status verified against the live project, not
assumed — the check commands are included so any of this can be re-confirmed
rather than trusted.

Branch: `feat/jade-gold-theme-and-password-reset`, not pushed.

---

## 1. Apply the password-reset migration — BLOCKING

`supabase/migrations/20260912_password_reset_requests.sql` has not been run.
The table returns 404, so `/forgot-password` fails at the final insert; every
step before it already works.

There is no `supabase/config.toml`, so `supabase db push` is not wired up —
paste the file into the Supabase SQL editor.

```bash
# expect 200 once applied; 404 means still outstanding
curl -s -o /dev/null -w '%{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/password_reset_requests?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

The migration's own trailing comment carries the post-apply verification (anon
must be refused; exactly two policies, both `authenticated`).

## 2. Close the `notifications` RLS gap — SECURITY

`notifications` returns **200 to the public anon key** — the one compiled into
the client bundle and readable by any visitor. Anyone can read every
notification in the table.

This is the same class of gap `20260829_rls_lock_anon.sql` fixed for
`admin_users` and `notification_templates`; this table was missed. No migration
written yet.

```bash
# expect 401 once fixed; 200 means still exposed
curl -s -o /dev/null -w '%{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/notifications?select=id&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Worth re-running the same probe across every table while in there — the August
migration note flags that `mumineen` was empty at the time, so its policies
were never actually validated. That check is still outstanding and matters
before go-live.

## 3. Eyeball the Jade & Gold palette

Applied across 22 files and verified by build, typecheck and contrast maths,
but not yet looked at in a browser.

`/dashboard` and `/kitchen` held the densest hardcoded colour (23 and 6 brand
hexes respectively), so a stray would surface there first.

```bash
grep -rnE '#(d4a032|ffd97d|6b4010)' app lib components   # expect no matches
```

## 4. Confirm the console `TypeError: Load failed` is gone

Reported on every page load. Almost certainly the dev server dying underneath
an open tab — the OS killed it three times for memory, and it later exited on
stdin close. Both causes are now addressed (emulator closed, server started
detached from stdin).

If it persists after a hard reload, the failed row in the Network tab names the
resource; `TypeError: Load failed` alone does not.

## 5. Decide how this branch lands

Two commits, local only:

- `d8a5892` refactor(theme): replace brand gold with jade & gold palette
- `91f04e9` feat(auth): admin-approved password reset requests

Fast-forward `main`, or open a PR.

---

## Known and deliberate — not bugs

**Forgot-password confirms whether a username exists.** It returns "No account
found with that username" rather than a uniform response, which lets a visitor
enumerate valid admin usernames. Chosen so staff who mistype get a usable
error; rate limited to 5 per IP per 10 minutes. The reasoning is recorded in
`app/api/auth/forgot-password/route.ts` so it is not silently "fixed" later.

**Gold is accent-only.** White on the old gold `#d4a032` measured 2.37:1
against a 4.5:1 AA floor. Jade `#0b6b53` carries the interface at 6.48:1 and
gold now appears only on dark grounds. Do not promote `--fmb-accent` back onto
a light surface — that reintroduces the exact defect this replaced.

**`users/page.tsx` appears in both commits.** It needed the token rename for
the theme commit to compile, and separately gained the Reset Requests tab. The
split is deliberate so each commit builds on its own.
