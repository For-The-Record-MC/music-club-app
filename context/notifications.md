# Push notifications

Expo push, built on top of the existing `activity_events` table (decision #15's
intended seam). Every notifiable moment is already an `activity_events` row, so push
is a *delivery pipe* hung off inserts — not a separate event system. Web stays
bell-only (no Expo token on web).

## Pipeline (reactive)

1. A lifecycle RPC / mention / announcement inserts into `activity_events`.
2. AFTER INSERT trigger `notify_send_push` (migration `20260629000000`) reads two
   Vault secrets (`send_push_url`, `send_push_secret`) and `pg_net.http_post`s the
   new row's `event_id` to the `send-push` Edge Function with an `x-push-secret`
   header. **The trigger fails open** — any error is swallowed so a push hiccup can
   never roll back a spin/schedule/close.
3. `send-push` (deployed with `--no-verify-jwt`; authenticates via the shared
   secret, not a user JWT):
   - loads the event (service role), builds title/body/category via
     `supabase/functions/_shared/pushTemplate.ts`,
   - resolves recipients — targeted (`recipient_id`) → that member; broadcast →
     club members minus the actor, minus `club_members.notifications_muted`, minus
     anyone whose category preference is off,
   - collects `push_tokens`, POSTs to the Expo Push API in batches of 100,
   - prunes tokens Expo reports `DeviceNotRegistered`.

## Categories & preferences

`notification_preferences` (own-row RLS), one row per member; an **absent row means
defaults**, and `send-push` coalesces the same way (`PREF_DEFAULTS`):

| Category | Default | Events |
|---|---|---|
| `mentions` | on | `comment_mention`, `you_are_picker` |
| `lifecycle` | on | `wheel_spun`, `albums_set`, `meeting_scheduled`, `meeting_reminder`, `ratings_revealed`, `cycle_closed`, `showdown_started`, `showdown_winner` |
| `social` | **off** (opt-in) | `feed_post`, `concert_added` |
| `announcements` | on | `club_announcement` |

**Per-club mute:** `club_members.notifications_muted`. Silences all push for one club
regardless of categories. Members can't UPDATE their own membership row (RLS is
owner-only for role management), so the toggle goes through the
`set_club_mute(p_club, p_muted)` RPC.

UI: `app/src/app/notifications.tsx` (reached from the account menu in
`ClubSwitcher`) — four category switches + a per-club mute list.

## Display text — two template files, keep in sync

- `app/src/utils/activityTemplates.ts` — renders the in-app **bell**.
- `supabase/functions/_shared/pushTemplate.ts` — renders the **OS push** (title =
  club name, body = the sentence) + the event→category map.

Adding/renaming an event type means updating **both**. Push text lives in TS (not
SQL) so wording changes need no migration.

## Notable events

- **Picker split** (migration `20260629010000`): `spin_wheel` emits the broadcast
  `wheel_spun` *and* a targeted `you_are_picker` (recipient = winner) for a personal
  "you're up" push.
- **Announcements** (migration `20260629030000`): `post_announcement(club, title,
  body)` — owner/admin only, per-**club** cap of 3 per rolling 24h (multiple admins
  share the budget), length-limited. It's a normal broadcast `club_announcement`
  event with author-written payload. `my_announcement_quota(club)` powers the
  composer's "N of 3 left today" note. Composer lives in `club/[id]/settings.tsx`.
- **Meeting reminders** (migration `20260629040000`): the only non-reactive push.
  `pg_cron` job `meeting-reminders` runs every 30 min → `send_meeting_reminders()`
  inserts targeted `meeting_reminder` rows for open un-revealed cycles whose
  `meeting_at` is within 24h (and again within 1h) for every member not RSVP'd 'no'.
  Per-cycle `meeting_reminder_24h_sent_at` / `_1h_sent_at` markers fire each window
  once.

## Client registration

`app/src/utils/push.ts`: `registerPushToken(userId)` (called from `_layout.tsx` once
signed in; no-op on web/simulator) upserts the Expo token into `push_tokens`.
`setNotificationHandler` suppresses the OS banner while foregrounded (the bell badge
already reflects new activity). `routeFromNotification` deep-links a tap through the
same `ActivityTarget` shape the bell uses, switching `currentClubStore` to the
event's club first. The response listener + cold-start handler are installed in
`_layout.tsx` (native only).

## Ops / secrets (out of git)

- Function env: `PUSH_SHARED_SECRET` (set via `supabase secrets set`).
- Vault: `send_push_url` = `https://<ref>.supabase.co/functions/v1/send-push`,
  `send_push_secret` = same value as `PUSH_SHARED_SECRET`. Set with
  `select vault.create_secret(value, name)`. If either Vault secret is missing the
  trigger no-ops (e.g. local/dev), so push silently does nothing rather than failing.
- **Deliver on iOS requires an EAS dev/prod build with an APNs key** — Expo Go
  won't receive these. App-icon badge counts are not yet server-driven (follow-up).
