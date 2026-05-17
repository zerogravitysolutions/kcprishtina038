# KÇ Prishtina 038 — Operations Runbook

Last reviewed: 2026-05-17. Aimed at a non-Claude operator who has the keys.

## TL;DR

| What | Where | Auth |
|------|-------|------|
| Site source | `github.com/zerogravitysolutions/kcprishtina038` | GitHub |
| Production URL | `https://kcprishtina038.vercel.app` (custom domain pending) | — |
| Hosting | Vercel project `kcprishtina038` (Hobby) | Vercel |
| Database + Auth + Storage | Supabase project `xutklvcsdgzmhxzexisb` (`xutklvcsdgzmhxzexisb.supabase.co`) | Supabase |
| Deploys | `git push origin main` → auto Vercel redeploy + auto Supabase migration apply | — |

## Editing content (no code)

| Want to | Go to |
|---------|-------|
| Approve / reject membership applications | `/admin/applications` |
| Mark dues paid | `/admin/members` → click member → set dues |
| Add an event or race | `/admin/events` (CRUD page — currently lists only; full editor: roadmap) |
| Publish news | `/admin/news` (currently lists only — write directly in Supabase Table Editor for now) |
| Upload photos | `/admin/media` (drag-drop) |
| Change a sponsor | `/admin/sponsors` |
| Change the default monthly dues | `/admin/settings` → row `dues.default_amount_eur` |
| Promote/demote a user | `/admin/staff` → role dropdown next to their row |

## Editing content (direct DB)

Some admin pages are list-only in v1; for create/edit, open Supabase Dashboard → Table Editor:

- News drafts → `news` table → insert row, set `status='draft'`, fill `title_sq` + `body_sq` + `slug`. Flip to `published` when ready.
- Events → `events` table → insert with `type` (race/ride/camp/training), `start_at`, `section_id`, set `status='published'` when ready to surface on the public site.
- Event categories → `event_categories` → add rows per event for Elite / U23 / Masters / Femra / Youth.
- Results → `results` table → after each race, insert one row per finishing rider (member_id from `profiles`, position, time_seconds).

## Deploys

```bash
# from a clone of the repo
git pull
# edit files
git commit -am "..." && git push origin main
```

That single push triggers:
1. **Vercel** rebuilds the static site (~20s) and replaces the production deployment.
2. **Supabase ↔ GitHub** applies any new migration files in `supabase/migrations/` to the production DB.

### Rolling back a bad deploy

In Vercel → Deployments → pick a previous green deployment → "Promote to Production". The old code goes live within seconds. **This does NOT roll back DB migrations** — those run forward only. For schema rollback, write a new migration that reverses the change.

## Database

### Schema location

All migrations live in `supabase/migrations/<timestamp>_<name>.sql`. Run order is by filename (timestamps). Never edit a migration that has been applied to production — write a new one to amend.

### Backups

Free-tier Supabase: daily automatic backups (last 7 days, restorable via Dashboard → Database → Backups). For longer retention, do manual dumps:

```bash
# Install the Supabase CLI once:
brew install supabase/tap/supabase
supabase login
supabase link --project-ref xutklvcsdgzmhxzexisb

# Take a dated snapshot:
supabase db dump --linked --data-only > backups/kcp-$(date +%F).sql
# OR full (schema + data):
supabase db dump --linked > backups/kcp-full-$(date +%F).sql
```

Store the resulting `.sql` somewhere private (encrypted disk, password manager attachment, or a private GitHub Gist).

### Restoring from a backup

```bash
# DANGER: this wipes the production DB. Never run without confirmation.
supabase db reset --linked
psql "$(supabase db connection-string --linked)" < backups/kcp-full-<DATE>.sql
```

### Rotating the DB password

The DB *master password* (used for `psql` direct access) was shared in a chat transcript on 2026-05-17. Rotate via:

1. Supabase Dashboard → Settings → Database → "Reset database password".
2. Save the new password in a password manager.
3. Update any local `supabase link` configs that cached the old password.

The **publishable key** (`sb_publishable_…`) is browser-safe by Supabase design and does not need rotation. RLS is the actual security boundary.

## Auth

### Creating a new staff/coach user

1. Supabase Dashboard → Authentication → Users → "Add user" → enter email + password.
2. The `on_auth_user_created` trigger auto-creates a `profiles` row with `role='member', status='pending'`.
3. Promote in `/admin/staff` → set the role from the dropdown. The `set_user_role` RPC writes the change to `audit_log`.
4. Flip status to `active`: SQL Editor → `UPDATE profiles SET status='active' WHERE email='...';`.

### Resetting a forgotten password

User flow: `/login` → "Harruat fjalëkalimin?" → enters email → receives Supabase email → clicks link → lands on `/reset-password` → sets new password.

Admin override: Dashboard → Authentication → Users → click user → "Send password recovery" or set password directly.

### Disabling a user

`UPDATE profiles SET status='suspended' WHERE email='...';` blocks `signInWithPassword` at the application layer (the login page checks `status !== 'active'` and signs them out immediately).

## Branding the Supabase auth emails

Supabase Dashboard → Authentication → Email Templates. The 4 templates that fire:

1. **Confirm signup** — sent when a user registers (currently signup is admin-only).
2. **Magic link** — only if you enable passwordless login.
3. **Change email** — when a user changes their email.
4. **Reset password** — when "Harruat fjalëkalimin?" is used.

Each template is HTML. Recommended changes:

- Subject lines in Albanian: e.g. "Resetoni fjalëkalimin tuaj në KÇ Prishtina 038".
- Replace the default Supabase logo with the club logo (host as an absolute URL — Supabase's CDN-served `https://kcprishtina038.vercel.app/assets/logo.jpg` works).
- Apply the `#0F1A2E` ink + `#C25A2D` ember palette to buttons.

## Storage

Three buckets:

| Bucket | Visibility | What it holds |
|--------|-----------|---------------|
| `media` | public | Hero photos, news covers, sponsor logos, anything shown on the public site |
| `avatars` | public | Per-user profile photos (path convention: `<user_id>/avatar.<ext>`) |
| `documents` | private | Member documents (waivers, medical certificates) — signed URLs only |

RLS on `storage.objects`:
- `media`: anyone can read; admin/editor can write.
- `avatars`: anyone can read; users can only write/update files under their own `auth.uid()/` folder.
- `documents`: owner-only read for non-staff; admin/staff can read all. Owner writes their own folder.

## Monitoring

### Smoke test

`scripts/smoke.py` checks all public routes + the Supabase REST endpoint. Run on demand or schedule:

```bash
python3 scripts/smoke.py
```

Recommended schedule: every 6 hours via a GitHub Actions cron, or once a day via UptimeRobot's free tier hitting the homepage.

### Free-tier idle pause

Supabase pauses free projects after 7 days with zero requests. The site already makes a Supabase request on every public page load (the nav sign-in pill calls `getProfile()`), so any organic traffic keeps the project warm. **Action needed only if traffic drops to zero for a week** — in which case manual unpause via Dashboard.

### RLS test suite

`supabase/tests/rls.sql` verifies the anon-role policy floor (no leak of profiles, applications, audit_log, settings). Run locally:

```bash
supabase test db   # requires supabase CLI + local docker stack
```

## Common tasks recipes

### Create the May 2026 dues batch (one row per active member)

```sql
insert into public.dues (member_id, period, amount_eur)
select id, '2026-05-01'::date, 25
from public.profiles
where status = 'active'
on conflict (member_id, period) do nothing;
```

Then mark them paid as members pay:

```sql
update public.dues
set status='paid', paid_at=now(), paid_method='bank'
where member_id = '<UUID>' and period = '2026-05-01';
```

### Find members with unpaid dues > 30 days

```sql
select p.full_name, p.email, d.period, d.amount_eur
from public.dues d
join public.profiles p on p.id = d.member_id
where d.status in ('unpaid','overdue')
  and d.period < (current_date - interval '30 days')
order by d.period;
```

### Audit who changed roles in the last 30 days

```sql
select created_at, actor_id, entity_id, before->'role' as from_role, after->'role' as to_role
from public.audit_log
where action = 'profile.role_change'
  and created_at > now() - interval '30 days'
order by created_at desc;
```

## Custom domain

When ready to point `prishtina038.cc` at the production deployment:

1. Vercel → Project → Settings → Domains → "Add domain" → `prishtina038.cc`.
2. Vercel shows DNS records to add at your registrar (typically: A record for the apex + CNAME for `www`).
3. Wait for DNS propagation (5 min – 1 hour).
4. Vercel issues a TLS certificate automatically.
5. Supabase: Dashboard → Authentication → URL Configuration → update Site URL to `https://prishtina038.cc` and add it to "Redirect URLs". Otherwise password-reset and magic-link emails redirect to the old Vercel subdomain.

## Contacts

- **Owner**: Qëndrim Pllana — `qendrim.pllanna@gmail.com`
- **Repo issues**: github.com/zerogravitysolutions/kcprishtina038/issues
