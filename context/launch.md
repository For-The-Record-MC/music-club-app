# Launch checklist & ops

State as of Phase 5: all feature phases shipped; the app is fully usable on the
hosted web build. These are the operational steps to take it from "works for the
builder" to "ready for the whole club."

## 1. Email delivery — CONFIGURED (2026-06-13)

Auth is email OTP. Custom SMTP is wired, which both removes Supabase's built-in
rate limit AND unlocks email-template editing (template edits are blocked on the
free tier while using the default provider).

- **Provider:** Gmail SMTP via App Password on the dedicated club account `vinylandvinomusicclub@gmail.com`. Config: `smtp_host=smtp.gmail.com`, **`smtp_port=587`** (587/STARTTLS works with GoTrue; 465/SSL returned "Error sending magic link email"), `smtp_user`/`smtp_admin_email`=the club address, sender name "Vinyl & Vino". Limit ≈500/day — ample for a club.
- **Templates:** Confirmation, Magic Link, and Recovery all set to show `{{ .Token }}` (the 6-digit code the app's `verifyOtp` expects). Note: a brand-new email signing up hits the **Confirmation** template, not Magic Link — both must carry the token.
- **Managed via the Management API**, not the dashboard: `PATCH https://api.supabase.com/v1/projects/<ref>/config/auth` with `SUPABASE_ACCESS_TOKEN`. `smtp_port` must be a **string**. The Gmail App Password lives only in Supabase's server-side config — never in the repo. Rotate/revoke it at myaccount.google.com/apppasswords.
- **To change the template wording later:** PATCH `mailer_templates_magic_link_content` / `mailer_templates_confirmation_content` (keep `{{ .Token }}`).
- **Site URL:** set Authentication → URL Configuration → Site URL = `https://jordanreticker.github.io/music-club-app/` for correctness (OTP itself doesn't need redirects).

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
