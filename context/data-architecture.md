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

Bottom-tab UX (v2). `src/app/_layout.tsx` is the root `Stack` wrapped in `Stack.Protected`:

- guard `!!userId`: **`(tabs)`** (the tab navigator), `profile-setup`, `create-club`, `join/index`, and the club **detail/action** screens `club/[id]/{members,wheel,pick-albums,schedule,rsvp,suggestions,album/[albumId],rate/[albumId]}` (pushed on top of the tabs).
- guard `!userId`: `sign-in`.
- **`join/[code]` is deliberately unguarded** — invite links must survive sign-in (renders `AuthForm` inline, auto-joins on session).

`src/app/(tabs)/_layout.tsx` is the `Tabs` navigator: **Home** (`home`), **Feed** (`feed`), **Notes** (`notes`), **Concerts** (`concerts`), **History** (`history`). The club switcher is opened from the Home topbar (tapping Home while focused). **Activity** is no longer a tab — it's a pushed screen `club/[id]/activity` reached via the 🔔 bell in the Home topbar (the bell carries the unread badge). The Home tab redirects to `/profile-setup` while `profile.display_name` is null (first sign-in). **History** lists closed cycles → `club/[id]/cycle/[cycleId]` highlights detail.

### The selected-club model

Tabs are persistent, so the four club tabs can't take a route param. The **selected club** lives in `stores/currentClubStore.ts` (zustand, persisted to AsyncStorage, hydrated in the root layout). The Clubs tab calls `setClub(id)` then routes to `/home`; the other tabs read `clubId` from the store and render `<NoClubSelected>` when it's null. create-club / join also `setClub` + go to `/home`; leaving or deleting a club calls `setClub(null)`.

Detail/action screens still live at `club/[id]/*` and **do** take the `id` route param — the tabs push them with the explicit club id (`/club/${clubId}/wheel`). Their "back to club" actions use `router.replace('/home')`.

When adding a **club browse view**, add a tab under `(tabs)/` reading the store. When adding a **detail/action screen**, add it under `club/[id]/` and register it in the root `_layout.tsx` protected group.

## UI primitives

`app/src/components/ui.tsx`: `Screen`, `Card`, `Label`, `Button`, `TextField`, `Avatar`, `Badge`, `InlineNote` — all themed via `useTheme()`, visual language ported from the legacy MVP. `AuthForm` (`components/AuthForm.tsx`) is the shared email-OTP form (with a no-email "I have a password" path for admin/dev). `ThemeToggle` cycles system/dark/light. Cross-platform destructive confirms: `utils/confirm.ts` (`window.confirm` on web, `Alert.alert` native).

## Theme & refresh

- Theme: `useTheme()` resolves the active palette from `stores/themeStore.ts` (mode `system`/`dark`/`light`, persisted to AsyncStorage, hydrated in the root layout) falling back to the device scheme. Never read `useColorScheme` directly in screens.
- Pull-to-refresh: `<Screen onRefresh refreshing>` renders a `RefreshControl`; pair it with `hooks/useRefresh.ts` wrapping a hook's `refresh`. Wired on lobby, club home (refreshes club+cycle+activity+past), feed, concerts, activity.
