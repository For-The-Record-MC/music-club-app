# OTA Update Runbook

How to ship JS/asset changes to installed apps over the air — no App Store
review, no new build. Background and the one-time setup live in
[EAS_UPDATE_PLAN.md](EAS_UPDATE_PLAN.md); this is the "I want to ship now"
checklist.

## ⛔ Prerequisites (one-time, in order — see EAS_UPDATE_PLAN.md)

1. v1.0 approved and released.
2. Phase 1: `expo-updates` installed + `eas update:configure` run.
3. Phase 2: the 1.0.1 binary (which embeds expo-updates) built, reviewed,
   released. **OTA only reaches installs ≥ 1.0.1.**

Until all three are done, neither the CLI command nor the GitHub Action will
do anything useful.

## What can / can't ride an OTA

✅ Anything in `app/src`, image assets, copy, styling, whole new screens.
❌ New native modules, `app.json` native config (permissions, icons, plugins),
   Expo SDK upgrades → those need `eas-build.yml` + review, and they change the
   runtime fingerprint so older updates stop applying to the new binary.

## Pre-flight (every time, ~10 min)

1. `cd app && npx tsc --noEmit` — must be clean.
2. Smoke-test the changes in the dev build on a real phone. An OTA ships to
   the whole club at once with no reviewer in between.
3. Commit the batch (the update should correspond to a commit you can point
   at later: `eas update` records the git hash).

## Ship it — option A: GitHub Action (preferred)

Actions tab → **EAS update (OTA)** → Run workflow:

- **channel**: `production` (the App Store build) or `preview` (internal builds)
- **message**: short description, e.g. `Listening Bingo + trophies batch`

Or from the CLI:

```bash
gh workflow run eas-update.yml -f channel=production -f message="Listening Bingo + trophies batch"
```

The workflow typechecks first and refuses to publish on errors. It uses the
`EXPO_TOKEN` repo secret (same one as `eas-build.yml`).

## Ship it — option B: local CLI

```bash
cd app
# EXPO_PUBLIC_* vars bake in at publish time — load the same env the builds use:
set -a; source .env.local; set +a
eas update --channel production --message "what shipped"
```

## Verify

1. On a phone with the production app: cold-launch (update downloads in the
   background), force-quit, launch again → changes visible. Two launches is
   the expected default.
2. `eas update:list --branch production` shows the new update on top.

## Rollback (if something's broken)

```bash
cd app
eas update:rollback   # interactive: pick the previous good update
```

Or just fix forward: publish another update — clients pick up the newest on
next launch. Rollback/republish reaches phones on the same two-launch cadence,
so for a hard crash on launch, expect some members to need to force-quit twice.

## Gotchas

- **Channel ↔ build profile**: an update on `production` only reaches apps
  built with the `production` profile (App Store). TestFlight preview builds
  listen to `preview`.
- **Env vars bake at publish**: publishing from a shell without
  `EXPO_PUBLIC_SUPABASE_URL` etc. ships a bundle that can't reach the backend.
  The Action sets them explicitly; locally, source `app/.env.local` first.
- **Fingerprint mismatch = silent no-op**: if an update doesn't apply, check
  that no native-affecting change slipped in since the last build
  (`npx expo-updates fingerprint:generate` to compare).
