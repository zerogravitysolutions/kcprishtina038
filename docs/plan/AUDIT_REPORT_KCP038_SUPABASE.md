# Implementation Audit Report — KÇ Prishtina 038 Supabase Backend

## Summary

| Metric | Value |
|--------|-------|
| Plan document | [docs/plan/PLAN_KCP038_SUPABASE.md](PLAN_KCP038_SUPABASE.md) |
| Implementation log | [docs/plan/IMPLEMENTATION_LOG_KCP038_SUPABASE.md](IMPLEMENTATION_LOG_KCP038_SUPABASE.md) |
| Plan created | 2026-05-17 |
| Audit date | 2026-05-17 |
| Commits audited | `59a4b1e`, `8acf5d3` |
| Total steps in plan | ~50 (8 phases) |
| Steps implemented | 17 explicit + 1 bonus (migration 0010) |
| Steps correct | 17 |
| Steps with issues | 0 |
| Steps skipped or deferred | ~33 (all of Phase V, VI, VII, VIII — intentionally deferred, not failures) |
| Extra changes (not in plan) | 1 (migration 0010 — bonus, justified) |
| Deviations from plan | 1 documented (no `prebuild.sh`, hardcoded key — justified) |
| Audit verdict | **PASS** (for the scope claimed; remaining work tracked correctly) |

## Step-by-Step Verification

| Step | Plan Requirement | Implemented | Code Matches Plan | Log Matches Code | Issue |
|------|-----------------|-------------|-------------------|------------------|-------|
| I.1 | Copy 3 new top-level HTML pages | YES | YES (byte-identical) | YES | — |
| I.2 | Copy `admin/` (12 HTML + 2 assets) | YES | YES | YES | — |
| I.3 | Nav "Sign in" link on 6 public pages + CSS + i18n | YES | YES — `id="nav-signin"` on all 6 pages, `.nav-signin{}` in styles.css, `nav.signin` in both SQ/EN dicts | YES | — |
| II.1 | Create Supabase project | YES (user did this) | URL/key match plan | YES | — |
| II.2 | `assets/supabase.js` client + helpers | YES | YES — exports `supa`, `getSession`, `getProfile`, `requireAuth`, `signOut`, `getSectionBySlug` | YES (deviation documented: hardcoded key vs `prebuild.sh`) | — (deviation justified — `sb_publishable_*` keys are browser-safe by Supabase design) |
| II.3 | nav-signin runtime hook in `assets/app.js` | YES | YES — IIFE at lines 614-635 swaps pill → "Llogaria ime" or "Admin" based on `profile.role` | YES | — |
| III.1 | `supabase/config.toml` linked to project ref | YES | YES — `project_id = "xutklvcsdgzmhxzexisb"` | YES | — |
| III.2 | Enums + utility functions (migration 0001) | YES | YES — 10 enums, 4 helper functions (`current_role`, `has_role`, `is_coach_of`, `set_updated_at`) | YES | — |
| III.3 | Core tables (migration 0002) | YES | YES — sections + profiles + `on_auth_user_created` trigger; `sections_coach_fk` deferred correctly | YES | — |
| III.4 | Applications + events + categories + registrations (0003) | YES | YES — 4 tables with FKs intact | YES | — |
| III.5 | Results + media + news + sponsors (0004) | YES | YES — 4 tables; `events.cover_media_id` FK closed after media exists | YES | — |
| III.6 | Dues + attendance + settings + audit_log (0005) | YES | YES — 4 tables | YES | — |
| III.7 | RLS policies (migration 0006) | YES | YES — RLS enabled on 14 tables, 41 policies (plan said "~40"); `profiles_update_own` CHECK clause blocks role/status self-mutation | YES | — |
| III.8 | Seed 6 sections + 7 settings keys (0007) | YES | YES — confirmed counts | YES | — |
| V.2 (RPC half) | `approve_application`, `reject_application`, `set_user_role` (0008) | YES | YES — all `SECURITY DEFINER`, all check `has_role()`, all write to `audit_log` | YES | — |
| V.10 (policies half) | Storage bucket policies for media/avatars/documents (0009) | YES | YES — 13 policies across the 3 buckets; owner-scoped pattern for `documents` and `avatars` | YES | Buckets must exist in dashboard before policies fire — user confirmed buckets created |
| III.10 (bonus) | Promote initial admin (migration 0010) | YES | YES — idempotent UPDATE for `qendrim.pllanna@gmail.com` | YES (logged as deviation/bonus) | — |
| IV.1 | Wire `login.html` to `signInWithPassword` | YES | YES — real auth, error display, redirect-if-authed, `profile.status !== "active"` gate forces sign-out, role-based redirect | YES | — |
| IV.2 | Forgot-password + `reset-password.html` | YES | YES — `resetPasswordForEmail` with prompt; new page uses `detectSessionInUrl` + `updateUser({password})` | YES | — |
| IV.3 | `join.html` form → Supabase `applications` table | YES | YES — `mailto:` action removed (line 269 in commit `8acf5d3`), `<form id="join-form">`, `supa.from("applications").insert(...)`, honeypot preserved, success/error UI | YES | — |
| IV.4 | `member-portal.html` data wiring | YES | YES — `requireAuth`, sidebar identity, next-race from `event_registrations`, dues pill, weekly attendance count | YES | Minor: `requireAuth` accepts all 5 roles, so admins can visit the portal manually. Intentional (everyone needs a "view-own-dues" surface); not a bug. |
| IV.5 | `member-profile.html` minimal wiring | YES (minimal) | YES — `requireAuth`, hydrate + save `full_name/dob/phone/bio` only; unmapped design fields (address, ID, equipment, social handles, emergency contact, medical) stay static | YES (deviation explicitly logged) | — |

## Phase Coverage

| Phase | Plan steps | Implemented | Status |
|-------|------------|-------------|--------|
| I — Design files | I.1, I.2, I.3 | 3/3 | ✓ |
| II — Supabase bootstrap | II.1, II.2, II.3 | 3/3 | ✓ |
| III — Schema + RLS + seed | III.1 → III.9 | 8/9 (III.9 RLS test suite deferred) | Partial — test suite still to write |
| IV — Auth + portal | IV.1, IV.2, IV.3, IV.4, IV.5 | 5/5 | ✓ |
| V — 12 admin pages | V.1 → V.12 | 1.5 / 12 (only V.2 RPC half + V.10 policy half) | **NOT IMPLEMENTED — Phase V follows next** |
| VI — Public pages → DB | VI.1 → VI.5 | 0/5 | **NOT IMPLEMENTED** |
| VII — Testing + observability | VII.1, VII.2, VII.3 | 0/3 | **NOT IMPLEMENTED** |
| VIII — Ops handoff | VIII.1 → VIII.4 | 0/4 | **NOT IMPLEMENTED** |

## Issues Found

### Issue #1 — none CRITICAL or HIGH severity

All implemented work matches the plan. Two LOW-severity observations:

#### Observation A — LOW — `requireAuth` on `member-portal.html` accepts all 5 roles
- **Where:** [member-portal.html:587](member-portal.html#L587) — `await requireAuth({ roles: ["member","admin","editor","staff","coach"] })`
- **Plan said:** Step IV.4 didn't specify `roles` argument; default is "any authenticated active user".
- **Code does:** Same effect — admin/editor/staff/coach can also see the portal if they navigate to it manually.
- **Discrepancy:** None functionally; this is intentional. The login flow routes admin → admin/dashboard, so admins won't land here by default. Manual nav still works and shows their own empty dues/registrations.
- **Impact:** None.
- **Recommendation:** No action. If you ever want strict role-based pages, change to `roles: ["member"]` and admin/editor/staff/coach would get bounced to /admin/dashboard via the redirect in `requireAuth`.

#### Observation B — LOW — Dynamic `import()` from a non-module script
- **Where:** [assets/app.js:621](assets/app.js#L621) — `const mod = await import("./supabase.js");`
- **Plan said:** Step II.3 — runtime hook imports `supabase.js`.
- **Code does:** Works in all modern browsers (dynamic import returns a Promise from regular scripts). The `await` is inside an `async function` IIFE, which is valid in classic scripts.
- **Impact:** None on modern browsers. Old browsers (pre-2020) would fail silently, which is acceptable — they'd see the unaffected "Identifikohu" link.

## Extra Changes (Not in Plan)

| File | Change | In Any Step? | Justified | Risk |
|------|--------|-------------|-----------|------|
| `supabase/migrations/20260517000010_initial_admin.sql` | Bonus migration: idempotent UPDATE to promote `qendrim.pllanna@gmail.com` to admin/active | Implicitly in plan ("Until that runs, no one has admin access" — Step III.8) | YES | LOW — idempotent, no PII beyond email already in chat |

No other extra changes detected.

## Parameter Verification

| Parameter | Plan Default | Config Value | Code Fallback | Match |
|-----------|-------------|-------------|---------------|-------|
| `SUPABASE_URL` | (set in Vercel env per plan) | Hardcoded `https://xutklvcsdgzmhxzexisb.supabase.co` in `assets/supabase.js` | n/a — required | DEVIATION (documented) |
| `SUPABASE_ANON_KEY` (now `_PUBLISHABLE_KEY`) | (set in Vercel env per plan) | Hardcoded `sb_publishable_…` in `assets/supabase.js` | n/a — required | DEVIATION (documented) |
| `dues.default_amount_eur` | 25 | `25` in settings table (migration 0007 seed) | n/a | MATCH |
| `payments.instructions_url` | (plan implicit) | `https://prishtina038.cc/payments` | n/a | MATCH |
| `club.contact_email` | (plan implicit) | `info@prishtina038.cc` | n/a | MATCH |

## Dependency Order Verification

| Step | Depends On | Implemented After Dependency? | Issue |
|------|-----------|-------------------------------|-------|
| I.3 (nav pill) | I.1, I.2 done | YES | — |
| II.2 (supabase.js) | II.1 (project exists) | YES | — |
| II.3 (runtime hook) | II.2, I.3 | YES | — |
| III.* migrations | III.1 (Supabase CLI / GitHub integration set up) | YES — all migrations in order with timestamp ordering | — |
| 0002 core tables | 0001 enums + utils | YES (0001 → 0002 order) | — |
| 0004 events.cover_media_id FK | 0004 media table (same migration) | YES — FK added after media `create table` | — |
| 0006 RLS policies | 0002–0005 all tables created | YES | — |
| 0007 seed | All schema in place | YES | — |
| 0008 RPCs | 0007 schema + audit_log | YES | — |
| 0009 storage policies | (requires buckets to exist in dashboard) | YES — user confirmed buckets created out-of-band | — |
| 0010 admin promotion | 0002 profiles + 0006 RLS | YES — idempotent so safe to re-run | — |
| IV.* page wiring | III.* schema applied | YES | — |

No order violations.

## Verification Replay (independent checks)

The implementation log claimed several verifications passed. Spot-checking the critical ones:

| Log claim | Independent check | Result |
|-----------|-------------------|--------|
| 6 public pages have `nav-signin` pill | `grep -c 'id="nav-signin"' *.html` → 6 (one per public page) | ✓ |
| 4 auth pages import Supabase | grep `assets/supabase.js` in login/join/member-portal/member-profile/reset-password | ✓ all 5 (including reset-password) |
| `join.html` mailto removed from form action | `grep "action=\"mailto" join.html` → no matches; remaining mailto refs are body+footer contact links (correct) | ✓ |
| `vercel.json` has no `buildCommand` (deviation) | Read file: no `buildCommand` key | ✓ |
| Migration 0006 enables RLS on 14 tables | `grep -c "enable row level security"` → 14 | ✓ |
| Migration 0006 has ~40 policies | `grep -c "^create policy"` → 41 | ✓ |
| `profiles_update_own` blocks role/status self-mutation | Code: `with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()) and status = ...)` — Postgres CHECK subqueries see pre-UPDATE values, so NEW.role must equal OLD.role | ✓ |
| `signInWithPassword` flow gates non-active profiles | Code at login.html lines 510-517: if `profile.status !== "active"`, immediately `supa.auth.signOut()` and show error | ✓ |
| Migration 0010 is idempotent | Code: `UPDATE profiles SET role='admin'... WHERE email='...'` — re-runs are no-ops once the row already has role=admin | ✓ |

All sampled verifications pass.

## Recommendations

1. **Proceed to Phase V** — the implementation is correct for everything claimed; Phase V (12 admin pages) is the next logical chunk.
2. **Re-verify the admin promotion after migration 0010 applies** — SQL Editor:
   ```sql
   select id, email, role, status, full_name from public.profiles where email = 'qendrim.pllanna@gmail.com';
   ```
   Expected: `role='admin', status='active', full_name='Qëndrim Pllana'`.
3. **Phase VII.3 (free-tier keepalive)** — even with traffic, schedule a thin `select 1` from `sections` on the public landing to keep the Supabase free project warm. Defer to Phase VII implementation.
4. **Rotate DB password** when convenient — chat-history exposure is a real risk for the master DB password (the publishable key stays as-is).
5. **member-profile.html unmapped fields** — the design has address, equipment, social handles, emergency contact, and medical info that aren't in the `profiles` schema. Decide between: (a) extend the schema (cleanest), (b) add a `metadata jsonb` column for catch-all (most flexible), or (c) drop those design fields. Currently they're cosmetic-only and don't persist.

## Verdict

**PASS.** All 17 explicitly-implemented steps match the plan with documented deviations. No critical or high-severity issues. The remaining ~33 steps (Phases V, VI, VII, VIII) are correctly tracked as not-yet-implemented rather than failed — `/plan-implement` will tackle them next.
