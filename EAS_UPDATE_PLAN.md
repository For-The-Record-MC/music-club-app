# EAS Update (OTA) Plan — post-1.0 approval

**Goal:** ship JS-only changes (screens, styling, copy, most feature work) over-the-air in
minutes, without an App Store review or an EAS build. A reviewed binary becomes rare —
only for native changes (new native module, `app.json` native config, Expo SDK upgrade).

**Do NOT start until the 1.0 build (build 12) is approved and released.** `expo-updates`
is itself a native module, so turning this on requires one final reviewed binary (1.0.1).
Touching it while 1.0 sits in the review queue only confuses things.

---

## Phase 1 — Wire up expo-updates (one-time)

1. `cd app && npx expo install expo-updates`
2. `eas update:configure` — this should:
   - add `updates.url` (the EAS Update CDN endpoint for projectId
     `c2a496ca-7281-4220-b545-9b2d27378111`) to `app.json`
   - set `runtimeVersion: { policy: "fingerprint" }` in `app.json` — the fingerprint
     policy hashes the native code; updates are only delivered to binaries with a
     matching fingerprint, so a JS update can never reach a binary missing native code
     it needs. When the fingerprint changes, that's the signal a real build is required.
   - add `channel` to each build profile in `eas.json` (`production` profile →
     `"channel": "production"`, preview → `"channel": "preview"`)
3. Sanity-check the diff of `app.json` / `eas.json` against the docs before committing —
   configure has been known to change defaults between CLI versions.
4. `npx tsc --noEmit` + `npx expo export --platform web` still pass (expo-updates is a
   no-op on web, but verify the web build isn't broken; web deploys stay Pages-based).

## Phase 2 — Ship the 1.0.1 binary

1. Bump `version` to `1.0.1` in `app/app.json` (or rely on remote version source +
   autoIncrement if configured — check `eas.json` `cli.appVersionSource`).
2. Commit, then run the `eas-build.yml` workflow (or `eas build -p ios --profile
   production --auto-submit`).
3. TestFlight pass: install build, confirm the app launches and behaves identically
   (expo-updates embedded bundle = launch behavior unchanged).
4. Submit 1.0.1 for review. "What's New": something honest and boring — "Performance
   improvements and under-the-hood updates."
5. Release it. **OTA is now live for everyone on ≥1.0.1.**

## Phase 3 — First OTA + verify the loop

1. Make a trivially visible JS change (copy tweak somewhere).
2. `eas update --channel production --message "test OTA pipeline"`
   - Note: `EXPO_PUBLIC_*` env vars get baked into the bundle **at publish time** —
     run with the same env as builds (source `app/.env.local` context / same shell setup).
3. On the phone: cold-launch the app (downloads in background), force-quit, launch
   again → change visible. That's the two-cold-launch default.
4. Try `eas update:list` and a rollback (`eas update:rollback`) once, so the escape
   hatch is familiar before it's needed in anger.

## Phase 4 (optional, later) — smoother update UX

- `useUpdates()` hook in `_layout.tsx`: when a downloaded update is pending, show a
  small "New version ready — tap to refresh" toast that calls
  `Updates.reloadAsync()`. Or silently reload at a safe moment (app foregrounded on
  Home with no in-flight input).
- Consider `checkAutomatically: ON_LOAD` (default) vs also checking on foreground via
  AppState if the two-launch lag ever annoys.

---

## The new day-to-day workflow

| Change | Ships via | Review? |
| --- | --- | --- |
| Supabase (migrations, Edge Functions, RLS, cron) | `supabase db push` / `functions deploy` | No — instant |
| JS/TS app code, styling, copy, new screens | `eas update --channel production` | No — minutes |
| New native module / `app.json` native config / SDK upgrade | `eas build` + submit | Yes (usually <24h) |
| Web | commit to `main` → Pages | No |

Rules of thumb:
- If `npx expo-updates fingerprint` changes (or you added anything under "native"),
  it's a build. Otherwise it's an `eas update`.
- Keep OTA to look-and-feel and fixes; ship *announceable* features as a real
  versioned binary anyway (users see What's New, App Store listing stays honest).
- Free tier: 1,000 MAU / 100 GiB bandwidth per month — club-scale is nowhere close.
- Builds still capped at 15/month on the current EAS plan; OTA doesn't count.

## Gotchas

- **An OTA update only reaches binaries whose fingerprint matches the update's.**
  After any new binary ships, republish pending JS changes with `eas update` so the
  new fingerprint's channel has them too (usually a non-issue: the new build embeds
  the latest JS at build time).
- Updates apply on the **second cold launch** by default; iOS keeps apps warm for
  days, so propagation is "within a day or two of normal use," not instant.
- Don't OTA anything that depends on an undeployed Supabase migration — deploy the
  backend first, then publish the update (same discipline as the current web deploys).
