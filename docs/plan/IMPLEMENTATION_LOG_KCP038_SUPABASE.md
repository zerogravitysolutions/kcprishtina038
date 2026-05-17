# Implementation Log — KÇ Prishtina 038 Supabase Backend

## Source Document

[docs/plan/PLAN_KCP038_SUPABASE.md](PLAN_KCP038_SUPABASE.md)

## Status

Phase: VI | Steps V.* + VI.1 complete; Phase VII/VIII pending | Status: IN PROGRESS
Last verified: 2026-05-17

## Locked-in Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Editor role | Reserved; granted later via admin UI. |
| 2 | Coach role | 1-coach-per-section (`sections.coach_id`). Multi-coach = v2. |
| 3 | Dues automation | Manual creation by staff in v1. Cron + Edge Function in v2. |
| 4 | Payments | Out of scope — link to external instructions / `mailto:`. |
| 5 | Cross-section coach edits | Blocked by RLS — admin/editor cross-cuts only. |
| 6 | DB content i18n | `_sq` + `_en` columns per content table. |
| (new) | Supabase Project | `xutklvcsdgzmhxzexisb.supabase.co` (Frankfurt-area). |
| (new) | GitHub integration | Supabase ↔ GitHub auto-applies migrations on push to `main`. |
| (new) | Publishable key | Hardcode in `assets/supabase.js` (browser-safe by design). |

## Credential Hygiene Note

**DB password `n83QWJ&u_Bn9Uuy` was shared in chat on 2026-05-17 and must be rotated** by the user in Supabase Dashboard → Settings → Database → Reset database password. The publishable key is browser-safe and does not need rotation.

## Deviations from Plan

| Deviation | Plan says | Doing instead | Why |
|-----------|-----------|---------------|-----|
| No `prebuild.sh` env-var substitution | "Vercel env vars + `prebuild.sh` replace placeholders" | Hardcode the publishable key + URL directly into `assets/supabase.js` | The new `sb_publishable_*` key format is explicitly browser-safe (Supabase docs). RLS is the real boundary. Simpler is correct. |
| No `buildCommand` in `vercel.json` | Add `buildCommand: bash ./prebuild.sh` | Leave `vercel.json` unchanged | Follows from the above. |
| Migrations applied via Supabase ↔ GitHub integration | "supabase db push from local CLI" | Push migrations to GitHub `main`, Supabase picks them up automatically | User confirmed the integration is wired. |

## Version History

| Step | Date | Status | Plan Ref | Commit | Summary |
|------|------|--------|----------|--------|---------|
| I.1  | 2026-05-17 | DONE | §I.1 | (pending push) | Copied `login.html`, `member-portal.html`, `member-profile.html` to repo root |
| I.2  | 2026-05-17 | DONE | §I.2 | (pending push) | Copied `admin/` (12 HTML + `_shell.js` + `styles.css`) |
| II.2 | 2026-05-17 | DONE | §II.2 | (pending push) | `assets/supabase.js` — hardcoded publishable key + URL (per deviation), exports `supa`, `getSession`, `getProfile`, `requireAuth`, `signOut`, `getSectionBySlug` |
| III.1 | 2026-05-17 | DONE | §III.1 | (pending push) | `supabase/config.toml` linked to project `xutklvcsdgzmhxzexisb` |
| III.2 | 2026-05-17 | DONE | §III.2 | (pending push) | 0001 enums + utils (`has_role`, `is_coach_of`, `current_role`, `set_updated_at`) |
| III.3 | 2026-05-17 | DONE | §III.3 | (pending push) | 0002 core tables: sections + profiles + `on_auth_user_created` trigger |
| III.4 | 2026-05-17 | DONE | §III.4 | (pending push) | 0003 applications + events + categories + registrations |
| III.5 | 2026-05-17 | DONE | §III.5 | (pending push) | 0004 results + media + news + sponsors |
| III.6 | 2026-05-17 | DONE | §III.6 | (pending push) | 0005 dues + attendance + settings + audit_log |
| III.7 | 2026-05-17 | DONE | §III.7 | (pending push) | 0006 RLS policies — 14 tables, ~40 policies; member self-promotion blocked by CHECK clause |
| III.8 | 2026-05-17 | DONE | §III.8 | (pending push) | 0007 seed: 6 sections + 7 default `settings` keys |
| V.2 (RPC half) | 2026-05-17 | DONE | §V.2 | (pending push) | 0008 SECURITY DEFINER RPCs: `approve_application`, `reject_application`, `set_user_role` (all audit-logged) |
| V.10 (policies) | 2026-05-17 | DONE | §V.10 | (pending push) | 0009 storage bucket policies for `media`, `avatars`, `documents` — owner-scoped private bucket pattern for documents |
| I.3 | 2026-05-17 | DONE | §I.3 | (pending push) | Nav "Sign in" pill on all 6 public pages + `.nav-signin` CSS + SQ/EN i18n keys |
| II.3 | 2026-05-17 | DONE | §II.3 | (pending push) | `app.js` runtime hook swaps pill → "Llogaria ime" / "Admin" based on `profile.role` |
| III.10 (new) | 2026-05-17 | DONE | (new) | (pending push) | Migration 0010 — idempotent promotion of `qendrim.pllanna@gmail.com` to admin role + active status |
| IV.1 | 2026-05-17 | DONE | §IV.1 | (pending push) | `login.html` wired: real `signInWithPassword`, error display, redirect-if-already-authed, profile-status gate, role-based landing redirect, Google OAuth button hooked |
| IV.2 | 2026-05-17 | DONE | §IV.2 | (pending push) | Forgot-password prompt via `resetPasswordForEmail`; new `reset-password.html` handles the recovery callback and calls `updateUser({password})` |
| IV.3 | 2026-05-17 | DONE | §IV.3 | (pending push) | `join.html` form action removed from `mailto:`; POSTs to Supabase `applications` table via JS client; user-facing success/error message bar; honeypot preserved |
| IV.4 | 2026-05-17 | DONE | §IV.4 | (pending push) | `member-portal.html` wired: requireAuth, sidebar identity, next-race card from event_registrations, dues pill from unpaid totals, weekly attendance count |
| IV.5 | 2026-05-17 | DONE (minimal) | §IV.5 | (pending push) | `member-profile.html` wired: requireAuth, sidebar identity, hydrate + save full_name/dob/phone/bio. Unmapped design fields (address, ID, equipment, social handles, emergency contact, medical) stay static — schema doesn't model them. |
| (shared) | 2026-05-17 | DONE | (Phase V common) | (pending push) | New `admin/admin.js` shared module — exports `boot`, `requireStaff`, `escapeHtml`, `fmtRelative`, `initials`, `toast`, `filterNavByRole`, `patchSidebarIdentity`. Adds sign-out button to topbar, role-based nav filtering, sidebar identity patch. |
| V.1 | 2026-05-17 | DONE | §V.1 | (pending push) | `admin/dashboard.html` — KPIs (active members, pending applications, dues this month), next-race card, latest-applications table — all from Supabase. |
| V.2 | 2026-05-17 | DONE | §V.2 | (pending push) | `admin/applications.html` — inbox list with filter chips (pending/approved/rejected/all), detail pane, **approve** and **reject** buttons call the `approve_application` / `reject_application` RPCs. |
| V.3 | 2026-05-17 | DONE | §V.3 | (pending push) | `admin/members.html` — full roster table with section-chip filtering (6 sections + all), live counts. Static demo rows stripped via Python regex. |
| V.4 | 2026-05-17 | DONE (minimal) | §V.4 | (pending push) | `admin/member-detail.html` — fetches profile by `?id=`, lists dues + registrations. Full edit form not wired in this pass. |
| V.5 | 2026-05-17 | DONE | §V.5 | (pending push) | `admin/sections.html` — table of 6 sections with coach name and active flag. |
| V.6 | 2026-05-17 | DONE | §V.6 | (pending push) | `admin/staff.html` — non-member profiles with inline role-picker `<select>` that calls the `set_user_role` RPC on change (admin-only). |
| V.7 | 2026-05-17 | DONE | §V.7 | (pending push) | `admin/events.html` — last 50 events ordered by start_at desc. |
| V.8 | 2026-05-17 | DONE | §V.8 | (pending push) | `admin/results.html` — last 50 results with event + rider + category. |
| V.9 | 2026-05-17 | DONE | §V.9 | (pending push) | `admin/news.html` — last 50 news posts with status badge. |
| V.10 | 2026-05-17 | DONE | §V.10 | (pending push) | `admin/media.html` — grid of media library with file-upload `<input>` that uploads to the `media` Storage bucket and inserts the corresponding `media` table row. |
| V.11 | 2026-05-17 | DONE | §V.11 | (pending push) | `admin/sponsors.html` — sponsor list with tier + active flag. |
| V.12 | 2026-05-17 | DONE | §V.12 | (pending push) | `admin/settings.html` — key/value editor with inline JSON parsing and save buttons (admin-only). |
| VI.1 | 2026-05-17 | DONE | §VI.1 | (pending push) | `events.html` (public) — replaces static event rows with DB rows when Supabase returns published, future events; static fallback retained on error/empty. |
| VI.2-5 | 2026-05-17 | DEFERRED | §VI.2-5 | — | Countdown auto-target, news cards, sponsors, sections still hardcoded. Quick wins for the next pass once DB has content. |
| VII.* | 2026-05-17 | DEFERRED | §VII | — | RLS test suite + nightly smoke + keepalive ping. |
| VIII.* | 2026-05-17 | DEFERRED | §VIII | — | Vercel env vars (n/a — we hardcoded the publishable key per deviation), Supabase email templates branding, RUNBOOK, first-admin walkthrough. |
