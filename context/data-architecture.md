# Data architecture (app layer)

The pattern, inherited from Pindejos: **screens consume hooks; hooks call `db.*`; `db.ts` is the only place the supabase client is queried.**

## Layers

| Layer | Location | Rules |
|---|---|---|
| Query objects | `app/src/utils/supabase/db.ts` | One typed object per domain (`profiles`, `clubs`, `clubMembers`, `health`). Methods return supabase builders (`{ data, error }` thenables). Domain row types (`Profile`, `Club`, `ClubMember`, `ClubRole`) are exported from here via `Tables<>` from the generated `database.types.ts`. |
| Auth/session | `app/src/stores/authStore.ts` (zustand) | `hydrate()` once from the root layout: reads the session, fetches the profile, attaches a single `onAuthStateChange` listener. Exposes `userId`, `profile`, `isHydrated`, `refreshProfile`, `signOut` (clears state immediately — the SIGNED_OUT event is unreliable on RN). |
| Hooks | `app/src/hooks/` | One per screen-level data need (`useMyClubs`, `useClubData`). Own `loading` + `refresh`; return plain data. |
| Screens | `app/src/app/` (expo-router) | Compute derivations inline (wrap in `useMemo` when non-trivial); never import the supabase client. |

## Routing & auth gating

`src/app/_layout.tsx` wraps routes in `Stack.Protected`:

- guard `!!userId`: `index` (lobby), `profile-setup`, `create-club`, `join/index`, `club/[id]/*`.
- guard `!userId`: `sign-in`.
- **`join/[code]` is deliberately unguarded** — invite links must survive sign-in, so that screen renders `AuthForm` inline when signed out and auto-joins when the session appears.

The lobby redirects to `/profile-setup` while `profile.display_name` is null (first sign-in).

When adding a screen: create the route file, then **add a `Stack.Screen` entry to the correct guard group** — unlisted routes are NOT protected.

## UI primitives

`app/src/components/ui.tsx`: `Screen`, `Card`, `Label`, `Button`, `TextField`, `Avatar`, `Badge`, `InlineNote` — all themed via `useTheme()`, visual language ported from the legacy MVP. `AuthForm` (`components/AuthForm.tsx`) is the shared email-OTP form (with a no-email "I have a password" path for admin/dev). `ThemeToggle` cycles system/dark/light. Cross-platform destructive confirms: `utils/confirm.ts` (`window.confirm` on web, `Alert.alert` native).

## Theme & refresh

- Theme: `useTheme()` resolves the active palette from `stores/themeStore.ts` (mode `system`/`dark`/`light`, persisted to AsyncStorage, hydrated in the root layout) falling back to the device scheme. Never read `useColorScheme` directly in screens.
- Pull-to-refresh: `<Screen onRefresh refreshing>` renders a `RefreshControl`; pair it with `hooks/useRefresh.ts` wrapping a hook's `refresh`. Wired on lobby, club home (refreshes club+cycle+activity+past), feed, concerts, activity.
