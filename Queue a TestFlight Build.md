# Queue a TestFlight Build (from the GitHub UI)

How to kick off a new iOS build — and optionally ship it straight to TestFlight —
without touching your laptop, Xcode, or the command line. The build runs on
Expo's (EAS) servers via the **EAS build (iOS)** GitHub Action
([.github/workflows/eas-build.yml](.github/workflows/eas-build.yml)).

---

## One-time prerequisites (already done — just for reference)

- **`EXPO_TOKEN` repo secret** — an Expo access token, set under
  Settings → Secrets and variables → Actions. The workflow authenticates with it.
- **First interactive `eas submit`** was already run, so EAS has your App Store
  Connect credentials stored. That's why CI can auto-submit without prompting.

If a build ever fails with an auth error, the token is the first thing to check
(regenerate at expo.dev → Account settings → Access tokens, then update the secret).

---

## Steps

1. Go to the repo on **github.com**.
2. Click the **Actions** tab (top of the repo).
3. In the left sidebar, click the workflow named **EAS build (iOS)**.
4. On the right, click the **Run workflow** button (gray dropdown).
5. Set the options:
   - **Use workflow from:** leave as `Branch: main`.
   - **EAS build profile:** `production` (this is the TestFlight/App Store build).
     Use `preview` only for an internal ad-hoc test build.
   - **Auto-submit to App Store Connect / TestFlight after the build:**
     - ✅ **checked** → builds *and* uploads to TestFlight automatically.
     - ⬜ unchecked → only builds; you'd submit later with `eas submit`.
6. Click the green **Run workflow** button.

That's it. A run appears in the Actions list within a few seconds.

---

## What happens next

- The GitHub Action only *triggers* the build, then finishes in ~1–2 min (it uses
  `--no-wait`, so it doesn't sit idling while EAS compiles).
- The actual build runs on **EAS servers** (~15–25 min). Watch it at
  **[expo.dev](https://expo.dev)** → your project → **Builds**.
- If you checked auto-submit, EAS uploads the `.ipa` to App Store Connect when the
  build finishes. Apple then does ~5–15 min of processing.
- The new build shows up in **App Store Connect → your app → TestFlight**. For
  **Internal Testing** there's no review — it's installable on your phone via the
  TestFlight app within minutes of processing finishing.

The build number auto-increments (EAS owns it via `appVersionSource: remote`), so
you never have to bump it by hand.

---

## CLI equivalent (optional)

Same thing from a terminal, if you prefer:

```bash
gh workflow run eas-build.yml -f profile=production -f submit=true
```

---

## Heads-up: the next build adds push notifications

The app now includes **expo-notifications**, which is a new *native* capability.
The build you have on your phone today does **not** have it. So the next time you
queue a build, that fresh build is what you'll use to test push on a real device
(APNs keys are auto-managed by EAS — nothing extra to configure). See
[context/notifications.md](context/notifications.md) and `PLAN.md` (v5) for the
push design, and the "Remaining before submitting" block in
[TestFlight Deployment Plan.MD](TestFlight%20Deployment%20Plan.MD) for the
device-test checklist.

---

## Troubleshooting

- **Run fails immediately with an auth/login error** → `EXPO_TOKEN` is missing or
  expired. Regenerate and update the repo secret.
- **Build fails on EAS** → open the build at expo.dev → Builds and read the logs;
  the failing phase (e.g. credentials, native compile) is shown there, not in the
  GitHub Action.
- **Build succeeds but nothing in TestFlight** → you probably left auto-submit
  unchecked. Re-run with it checked, or run `eas submit --platform ios --latest`.
- **"Run workflow" button is missing** → make sure you're on the **Actions** tab
  and have selected the **EAS build (iOS)** workflow first; the button only appears
  for workflows that allow manual dispatch.
