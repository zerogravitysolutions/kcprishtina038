# Strava training import setup

The club app uses Strava OAuth as an account connection. Cyclists continue to
sign in to the club portal with their existing account. A linked `team_members`
rider record is required before the connection button appears.

## Before enabling

1. Create the club's Strava API application and set its callback domain to the
   production domain. Request enough athlete capacity for the connected riders.
2. Apply `supabase/migrations/20261004000002_strava_connections_and_training_titles.sql`,
   `20261004000004_strava_review_and_event_queue.sql`,
   `20261004000005_strava_solo_reviews.sql`, and
   `20261005000004_strava_auto_publish.sql` in migration order.
3. Add these **server-side** environment variables locally and in Vercel:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Access the private OAuth token table. Never expose it to the browser. |
| `STRAVA_CLIENT_ID` | Strava API application ID. |
| `STRAVA_CLIENT_SECRET` | Strava API application secret. |
| `STRAVA_REDIRECT_URI` | Exact callback URL, e.g. `https://your-domain/api/strava/callback`. |
| `STRAVA_TOKEN_ENCRYPTION_KEY` | Base64 encoding of 32 random bytes; generate with `openssl rand -base64 32`. Back this up securely. |
| `CRON_SECRET` | Random secret for the scheduled retry and seven-day backfill route. |

The encryption key must stay stable while connections exist. Rotating it
requires reconnecting every cyclist or migrating the stored tokens first.

## Connect and import

1. Each cyclist opens **Portali → Profili → Lidh me Strava**, authorizes
   `activity:read_all` and `profile:read_all`, and returns to the club portal. The app stores encrypted
   access and refresh tokens in a service-role-only table and queues their recent rides immediately.
2. A Strava activity create/update webhook queues the activity by ID. The app
   acknowledges the webhook promptly, then processes it after the response.
   A daily Vercel cron retries queued failures and backfills rides from the
   previous seven days. A coach can also open **Stërvitjet → Importo nga Strava**
   and search that window manually. An activity published weeks after the ride
   is still checked: the webhook provides its ID, and the matcher searches
   connected cyclists around the activity's **ride start time**, not upload time.
3. Only cycling activities are imported: road, mountain, gravel, e-bike, and
   virtual rides. A `Ride` marked as a trainer session is indoor cycling. Runs,
   swims, walks, gym workouts, and other sports are ignored. Indoor rides form
   a group when every pair starts within 10 minutes, durations differ by no
   more than 20%, and at least 80% of the shorter session overlaps in time.
   Virtual GPS is not used for indoor grouping. A proposed outdoor group
   requires at least 60% overlap of **both** GPS routes,
   starts within 30 minutes, at least 70% overlapping elapsed time, and
   elevation difference no greater than 20% or 150 m. Distance must also be
   within 25% or 3 km. Every pair in an outdoor group must pass. Outdoor rides
   without GPS are imported individually but cannot pass the group route check.
4. Every eligible cycling activity (at least 20 km or 150 m of climbing) is
   saved directly as a training, with no coach approval, even when only one
   cyclist is connected. Matching activities from other cyclists are grouped,
   including activities published later; a solo training becomes a group when
   a matching cyclist joins it. If a coach deletes an imported training or
   rider, those activity IDs are remembered so later Strava updates do not
   recreate them.
5. The title uses a shared Strava activity name when all riders use the same
   name. Exercise type uses matching workout words in at least half the names;
   otherwise the exercise type defaults to a group ride outdoors or indoor
   training indoors. The coach can edit the suggested
   date, title, exercise type, section, shared base values, rider selection, and
   individual metrics before approving the training. The shared Strava field is
   filled with one representative activity URL; no extra clickable Strava links
   appear in the coach view. The app fetches and validates all selected Strava
   activities again on a manual import. Each rider receives their own activity ID
   and metrics; duplicate imports for the same rider are blocked.

Detailed activity data fills distance, moving/elapsed time, elevation, heart
rate, average and weighted power, and cadence when Strava provides them. Power
and time streams yield best 1, 3, 5, 10, 20, and 60 minute power when the
recording contains enough continuous samples. Athlete FTP fills the FTP field
only when Strava returns it with `profile:read_all`; a club profile FTP can
still be used to calculate IF/TSS. Existing connections need to reconnect to grant the
new profile scope.

No GPS tracks are stored in the database. Imported entries are marked so they
can be removed when an athlete disconnects or deletes an activity.

## Webhook for revocations and deletions

Set these additional server-side variables:

| Variable | Purpose |
| --- | --- |
| `STRAVA_WEBHOOK_SECRET` | Long random URL segment. |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Random token used during Strava's subscription challenge. |
| `STRAVA_WEBHOOK_SUBSCRIPTION_ID` | ID returned when the subscription is created. |

Register a Strava webhook subscription with callback URL
`https://your-domain/api/strava/webhook/<STRAVA_WEBHOOK_SECRET>` and the
`STRAVA_WEBHOOK_VERIFY_TOKEN`. Strava calls the URL with a GET challenge before
activating it. The returned subscription ID must match the environment variable.
The webhook removes imported data when a cyclist revokes the app or deletes an
activity. These events are queued for prompt acknowledgement and retried by the
daily job. Disconnecting through the portal also revokes the token and removes
imported entries. The daily schedule in `vercel.json` runs at 04:00 UTC; on a
Vercel Hobby plan, cron can run only once per day. Webhook processing normally
runs promptly after the acknowledgement; cron is the retry path.

The API currently uses `https://www.strava.com/api/v3`; Strava's changelog says
the replacement API host becomes available January 4, 2027. Review that before
the changeover. This integration requires the club's written Strava approval for
cross-rider route comparison and coach-visible import proposals.
