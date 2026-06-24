# TestFlight Deployment Plan — For The Record MC

Goal: take the Expo (SDK 56, expo-router) app from simulator-only to installable on a
physical iPhone via TestFlight, using **EAS Build + EAS Submit**.

Status as of writing: Apple Developer Program membership is active. No `eas.json` yet,
no iOS `bundleIdentifier`, `eas-cli` not installed, not logged into an Expo account.

---

## Phase 0 — One-time account setup
- `npm i -g eas-cli`
- `eas login` (create a free Expo account if needed)
- App Store Connect app record can be auto-created later by `eas submit` — nothing to do there yet.

## Phase 1 — Config changes (the 3 gaps)

**a) Add iOS bundle identifier** to `app/app.json` under `ios`:
```json
"ios": {
  "icon": "./assets/expo.icon",
  "bundleIdentifier": "com.jordanreticker.vinylvino",
  "buildNumber": "1"
}
```
Must be globally unique and permanent — can't be changed after shipping without a new app record.

**b) Run `eas build:configure`** — generates `eas.json` and adds `extra.eas.projectId` to app.json.

**c) Wire env vars into `eas.json`.** Cloud builds can't read `app/.env.local`, so each profile
needs the `EXPO_PUBLIC_*` values (they're inlined at build time):
```json
{
  "cli": { "version": ">= 14.0.0" },
  "build": {
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://<ref>.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<anon-key>",
        "EXPO_PUBLIC_SPOTIFY_CLIENT_ID": "<spotify-id>"
      }
    },
    "production": {
      "env": { "...same three..." }
    }
  },
  "submit": { "production": {} }
}
```
These three are public-safe (see `app/.env.example` — RLS protects the data), so committing them
in `eas.json` is fine.

> **Do NOT** put CLI-only secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) in `eas.json` —
> it is git-tracked.

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
1. **Bundle ID** — pick the reverse-domain string now; it's permanent. Suggested: `com.jordanreticker.vinylvino`.
2. **Deep-link scheme** — app uses `"scheme": "vinylvino"`. Confirm Spotify OAuth redirect URI is
   registered for the real build, not just simulator.
3. **`baseUrl` experiment** (`/music-club-app`) — web-only, harmless for iOS native build.
4. **Supabase redirect URLs** — if email auth / magic links are used, add the `vinylvino://` scheme
   to Supabase's allowed redirect URLs, or links fail on the physical device.
