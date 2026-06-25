# TestFlight Deployment Plan — For The Record MC

Goal: take the Expo (SDK 56, expo-router) app from simulator-only to installable on a
physical iPhone via TestFlight, using **EAS Build + EAS Submit**.

### Progress (last updated 2026-06-25)

**Currently paused at Phase 2 (the build itself).**

Done:
- ✅ Phase 1 config committed — `bundleIdentifier: com.jordanreticker.fortherecordmc`,
  `scheme: fortherecordmc`, `eas.json` with dev/preview/production profiles.
- ✅ `eas build:configure` run — `extra.eas.projectId` (`c2a496ca-7281-4220-b545-9b2d27378111`)
  added to `app/app.json`.
- ✅ `ITSAppUsesNonExemptEncryption: false` added under `ios.infoPlist` — pre-answers the
  Export Compliance question so `eas submit` won't pause for it.
- ✅ Apple Developer Program — **re-enrolled as paid** (membership lapsed; a fresh enrollment can
  take a few hours to propagate, and there may be a new license agreement to accept at
  developer.apple.com + App Store Connect before builds/submits succeed).

Assumed done (verify before resuming): `eas-cli` installed, `eas login`, and the three
`EXPO_PUBLIC_*` values pasted into `eas.json` (replacing `REPLACE_ME`).

Still TODO before/around the build:
- [ ] `supabase functions deploy delete-account` (account-deletion fn must be live).
- [ ] Confirm `app/assets/images/icon.png` is 1024×1024 with **no alpha**.
- [ ] Register redirect URIs (scheme was renamed): `fortherecordmc://spotify-callback` in the
      Spotify dashboard, `fortherecordmc://` in Supabase → Auth → URL Configuration.

Next command to run: `eas build --platform ios --profile production` (Phase 2 below).

---

## Phase 0 — One-time account setup
- `npm i -g eas-cli`
- `eas login` (create a free Expo account if needed)
- App Store Connect app record can be auto-created later by `eas submit` — nothing to do there yet.

## Phase 1 — Config changes ✅ DONE (in repo)

**a) iOS bundle identifier** — added to [app/app.json](app/app.json) under `ios`:
```json
"ios": {
  "bundleIdentifier": "com.jordanreticker.fortherecordmc",
  "buildNumber": "1",
  "supportsTablet": false
}
```
Globally unique and permanent — can't be changed after shipping without a new app record.
(No `ios.icon` needed: the top-level `"icon": "./assets/images/icon.png"` already applies to
iOS. Verify it's 1024×1024 with **no alpha/transparency**, or Apple rejects the binary.)

**b) `eas.json`** — committed at [app/eas.json](app/eas.json) with `development` / `preview` /
`production` profiles (production uses `appVersionSource: remote` + `autoIncrement`, so EAS owns
the build number going forward).

**c) Env vars** — each profile carries the three `EXPO_PUBLIC_*` keys (cloud builds can't read
`app/.env.local`; they're inlined at build time). **Action required:** replace the `REPLACE_ME`
placeholders in `eas.json` with the real values from `app/.env.local`. They're public-safe
(see `app/.env.example` — RLS protects the data), so committing them is fine.

> **Do NOT** put CLI-only secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) in `eas.json` —
> it is git-tracked.

> Also run `eas build:configure` once — it adds `extra.eas.projectId` to app.json (links the repo
> to your Expo project). It won't clobber the hand-written `eas.json` above.

## Phase 2 — Build
```
eas build --platform ios --profile production
```
- First run: let EAS manage Apple credentials (it creates the App ID, distribution cert, and
  provisioning profile automatically — no Xcode).
- Runs in Expo's cloud (~15–25 min). Produces an `.ipa`.

## Phase 3 — Submit to TestFlight
```
eas submit --platform ios --latest
```
- Uploads to App Store Connect; first time prompts to create the app record (name, bundle id, SKU).
- Apple does automated processing (~5–15 min) + an Export Compliance question (standard HTTPS
  encryption → typically "no" to proprietary encryption, but answer honestly).

## Phase 4 — Install on phone
- App Store Connect → app → **TestFlight** tab → add yourself under **Internal Testing**
  (no review needed for internal testers).
- Install the **TestFlight** app on the iPhone, sign in, build appears.

---

## Decide / watch before starting
1. **Bundle ID** — `com.jordanreticker.fortherecordmc` (committed; permanent).
2. **Deep-link scheme** — app uses `"scheme": "fortherecordmc"`. Confirm Spotify OAuth redirect URI is
   registered for the real build, not just simulator.
3. **`baseUrl` experiment** (`/music-club-app`) — web-only, harmless for iOS native build.
4. **Supabase redirect URLs** — magic-link auth is used, so add the `fortherecordmc://` scheme
   to Supabase's allowed redirect URLs, or links fail on the physical device.

---

## Phase 5 — Public App Store release (beyond TestFlight)

TestFlight (Phases 0–4) needs **no App Review**. A public listing does. These are the gates:

- **Account deletion — DONE in code.** Guideline 5.1.1(v) requires in-app account deletion for any
  app with account creation. Shipped: `supabase/functions/delete-account/index.ts` (transfers or
  deletes owned clubs, then deletes the auth user → cascade), a "Delete account" row in the account
  sheet ([app/src/components/ClubSwitcher.tsx](app/src/components/ClubSwitcher.tsx)), and the
  `account.deleteSelf()` client helper. **Deploy it:** `supabase functions deploy delete-account`.
  Sign in with Apple is **not** required for us (no third-party/social login — first-party email +
  magic link only).
- **Production SMTP — DONE.** Auth uses magic links (`signInWithOtp`). Custom SMTP is already wired
  (Gmail App Password, port 587, ~500/day — see [context/launch.md](context/launch.md)), which
  removes Supabase's built-in rate limit. Ample for review + a club; revisit a higher-volume provider
  (Resend/Postmark/SES) only if usage outgrows Gmail's daily cap.
- **Privacy policy URL + nutrition labels.** App Store Connect needs a hosted privacy-policy URL and
  the data-collection questionnaire filled (email, user content, usage).
- **Store listing assets.** Screenshots (6.7" + 6.5"), description, keywords, category, support URL,
  age rating.
- **Third-party content/ToS.** Spotify / Apple Music / Genius / Ticketmaster usage must stay within
  each API's terms; app should degrade gracefully when a provider is unavailable.

Suggested order: Phases 0–4 (get it on your phone) → deploy `delete-account` →
privacy policy + nutrition labels → screenshots/listing → submit for review.
