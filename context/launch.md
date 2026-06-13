# Launch checklist & ops

State as of Phase 5: all feature phases shipped; the app is fully usable on the
hosted web build. These are the operational steps to take it from "works for the
builder" to "ready for the whole club."

## 1. Email delivery (REQUIRED before onboarding real members)

Auth is email OTP. Supabase's built-in SMTP is rate-limited to a few messages
per hour — fine for solo testing, not for a club.

- **OTP code in the email:** Dashboard → Authentication → Email Templates → **Magic Link**. The body MUST include `{{ .Token }}` (we use the 6-digit code, not the magic link):
  ```html
  <h2>Your Vinyl & Vino sign-in code</h2>
  <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
  ```
- **Custom SMTP:** Dashboard → Project Settings → Authentication → SMTP Settings. Wire a provider with a free tier (Resend, Postmark, SendGrid). Without this, members past the first few per hour get "email rate limit exceeded."
- **Site URL / redirects:** Authentication → URL Configuration → Site URL = `https://jordanreticker.github.io/music-club-app/`. (OTP doesn't need redirects, but set this for correctness.)

## 2. Admin / dev login (no email)

The sign-in form has an **"I have a password"** path (no email send). Set or reset
a password for an account via Dashboard → Authentication → Users → Update password,
or the admin API. Jordan's account (`jordanreticker@gmail.com`) is set up this way
for testing. Real members use the OTP path.

## 3. Entering the existing club's data

No bulk importer yet — seed by hand through the UI (it's the safest path given RLS
and the cycle lifecycle):
1. Owner signs in, creates the club, shares the invite link.
2. Members join via the link and set their display names.
3. For history: an admin can spin a cycle, set its two albums, then **close** it to
   move it into "Past cycles." Ratings backfill is optional (members rate before close).

## 4. Native (TestFlight) — deferred

Web is the launch channel. When ready for native: configure EAS (`eas.json`), then
`eas build --platform ios` + `eas submit`. The codebase is already Expo-native; no
app changes needed beyond signing/credentials.

## 5. Known follow-ups (non-blocking)

- Bulk/CSV import for legacy history.
- Expo push notifications (the `activity_events` table is the natural source).
- Spotify links on albums (column exists; only Apple/iTunes is auto-filled today).
- Pull-to-refresh is on the main browse screens (lobby, club home, feed, concerts,
  activity); detail/form screens refetch on mount.
