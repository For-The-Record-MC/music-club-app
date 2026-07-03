# TestFlight Deployment Plan — For The Record MC

Goal: take the Expo (SDK 56, expo-router) app from simulator-only to installable on a
physical iPhone via TestFlight, using **EAS Build + EAS Submit**.

### Progress (last updated 2026-06-26)

**🎉 LIVE ON DEVICE via TestFlight.** Phases 0–4 complete — built with `eas build`, submitted
with `eas submit`, installed and working on Jordan's iPhone through Internal Testing.

Done:
- ✅ Phase 1 config — `bundleIdentifier: com.jordanreticker.fortherecordmc`,
  `scheme: fortherecordmc`, `eas.json` (dev/preview/production), `extra.eas.projectId`
  (`c2a496ca-7281-4220-b545-9b2d27378111`), `ITSAppUsesNonExemptEncryption: false`.
- ✅ Apple Developer Program re-enrolled as paid; build + submit succeeded.
- ✅ `eas.json` env values filled in; cloud build green; on TestFlight Internal Testing.
- ✅ CI: `.github/workflows/eas-build.yml` — manual (`workflow_dispatch`) iOS build, optional
  auto-submit. Needs the `EXPO_TOKEN` repo secret (see Phase 6).
- ✅ Privacy policy page — `app/public/privacy.html`, ships to GitHub Pages at
  `https://for-the-record-mc.github.io/music-club-app/privacy.html` on the next web deploy.

More done (2026-06-26):
- ✅ Committed + pushed; `delete-account` deployed.
- ✅ Redirect URIs registered: `fortherecordmc://spotify-callback` (Spotify) + `fortherecordmc://`
  (Supabase Auth).
- ✅ `EXPO_TOKEN` repo secret added — CI workflow ready.
- ✅ Privacy page live: https://for-the-record-mc.github.io/music-club-app/privacy.html

App Store Connect listing — DONE (2026-06-26):
- ✅ Privacy URL pasted; App Privacy nutrition labels filled.
- ✅ 4 screenshots uploaded (how-it-works, home, album review, profile — 6.9" set; ASC auto-scales
  for smaller sizes, so 6.5" optional). Screenshots captured from a local Release build
  (`expo run:ios --configuration Release`) to drop the dev-menu cog; status bar overridden to 9:41.
- ✅ Description, keywords, promotional text, category, support URL, age rating all entered.

### SUBMITTED FOR REVIEW 2026-07-03 — build 12 (v1.0.0, commit 422c4e8), waiting on Apple

All gating items completed:
- [x] **Reviewer test account** — `jordanreticker+review@gmail.com` (password + Auto Confirm),
  display name "App Reviewer", member of Briarglade Boiz (deliberately NOT admin — the review
  notes point reviewers at create-club to try owner features). Creds + notes in ASC → App Review
  Information.
- [x] **Account deletion confirmed** end-to-end on TestFlight.
- [x] **Push notifications** shipped + delivery verified on device (APNs key via `eas credentials`).
- [x] **Screenshots refreshed** from a local `expo run:ios --configuration Release` build
  (Release config is what removes the dev-menu cog).
- [x] **Description updated** with THE CLUBHOUSE section (all 9 Studio rooms); copyright +
  additional privacy fields added in ASC during submission.
- [x] **Submitted for Review** (2026-07-03).

Next: respond to any App Review feedback, then release the approved build.

> Note: everything entered in App Store Connect persists on the "1.0 Prepare for Submission" draft
> and pre-fills future versions (description, keywords, screenshots, privacy, review info all carry
> over; only "What's New" is per-version). Taking time before submitting loses nothing.

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
  "supportsTablet": false,
  "infoPlist": { "ITSAppUsesNonExemptEncryption": false }
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
- **Privacy policy URL — page DONE, needs deploy + paste.** Page at `app/public/privacy.html`
  → publishes to `https://for-the-record-mc.github.io/music-club-app/privacy.html` on the next web
  deploy (push to main, or run the "Deploy web" workflow). Then paste that URL into App Store
  Connect → App Information → Privacy Policy URL.
- **Nutrition labels.** App Store Connect → App Privacy → fill the data-collection questionnaire:
  email = Contact Info; posts/notes/ratings = User Content; "last active" = Usage Data. All
  "linked to identity", none used for tracking/ads.
- **Store listing assets.** Screenshots (6.7" + 6.5"), description, keywords, category
  (Music or Social Networking), support URL, age rating.
- **Third-party content/ToS.** Spotify / Apple Music / Genius / Ticketmaster usage must stay within
  each API's terms; app should degrade gracefully when a provider is unavailable.
- **Reviewer test account.** In App Review Information, give a working login — use the
  password-path dev account (reviewers can't receive magic-link emails reliably).

Suggested order: deploy `delete-account` + register redirect URIs → deploy web (publishes privacy
page) → paste privacy URL + fill nutrition labels → screenshots/listing → submit for review.

---

## Phase 6 — CI: build from GitHub Actions (no Xcode, no laptop)

`.github/workflows/eas-build.yml` runs an iOS build on EAS's servers, triggered **manually**
(not on every push). One-time setup:

1. Create an Expo access token: expo.dev → Account Settings → **Access Tokens** → create one.
2. Add it as a GitHub repo secret named **`EXPO_TOKEN`** (Settings → Secrets and variables →
   Actions → New repository secret).

Then to cut a build: GitHub → **Actions** tab → **EAS build (iOS)** → **Run workflow** → pick the
profile (`production`) and whether to auto-submit to TestFlight. Or from the CLI:
`gh workflow run eas-build.yml -f profile=production -f submit=true`.

Notes:
- The build's `EXPO_PUBLIC_*` env comes from `eas.json` (no extra secrets needed).
- `--auto-submit` reuses the App Store Connect credentials EAS already stored during the first
  interactive `eas submit`, so CI submits don't prompt.
- `--no-wait` returns immediately; watch progress at expo.dev or in the EAS dashboard.
