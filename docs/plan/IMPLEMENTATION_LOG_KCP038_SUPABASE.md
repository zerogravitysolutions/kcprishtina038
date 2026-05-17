# Implementation Log — KÇ Prishtina 038 Supabase Backend

## Source Document

[docs/plan/PLAN_KCP038_SUPABASE.md](PLAN_KCP038_SUPABASE.md)

## Status

Phase: III | Step: III.* (writing migration SQL) | Status: IN PROGRESS
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
| I.3 | 2026-05-17 | PENDING | §I.3 | — | Nav "Sign in" link not yet added to public pages (chose to defer to Phase IV to batch with auth-aware UI swap) |
| II.3 | 2026-05-17 | PENDING | §II.3 | — | nav-signin runtime hook (depends on I.3) |
