# Database schema

Current-state DDL: [../supabase/schema.sql](../supabase/schema.sql) (generated — read that, not migrations). This file is the prose: what each table means and the invariants that aren't obvious from DDL. Planned future tables: see [../PLAN.md](../PLAN.md).

## Tables

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users` (auto-created by `handle_new_user` trigger on signup). `display_name` stays **null until the user completes profile setup** — the app gates the lobby on this. `avatar_color` indexes into the 7-color avatar palette. |
| `clubs` | A listening club. `invite_code` (8 chars, unambiguous alphabet) is the join credential; `owner_id` is informational/FK convenience — **authority always comes from `club_members.role`**. |
| `club_members` | Membership + role: `owner` / `admin` / `member`. Unique `(club_id, profile_id)`. A partial unique index enforces **exactly one owner row per club**. |
| `cycles` | One listening cycle: per-club sequential `number`, wheel-chosen `picker_id`, `status` `open`/`closed`, host-set `meeting_date` + free-text `meeting_time_location`, `revealed_at` (ratings reveal, Phase 3), `closed_at`. **Partial unique index: at most one open cycle per club** — "current cycle" is the `status='open'` row, never `max(number)`. |
| `albums` | The cycle's two picks: `slot` 1\|2 (unique per cycle), title/artist/year, iTunes metadata snapshot (`artwork_url`, `itunes_collection_id`, `apple_url`, `tracks` jsonb `[{trackNumber, trackName}]` — powers Phase 3 song pickers), optional `spotify_url`. |
| `rsvps` | One row per (cycle, member): `yes`/`maybe`/`no`. Upserted by the member. |
| `cycle_guests` | Plus-ones for a cycle's meeting: name + status, `added_by` member. |

## Invariants & conventions

- **All ids are `uuid`.** Timestamps are `timestamptz`.
- **Roles:** owner ⊃ admin ⊃ member. Owner: delete club, promote/demote admins, remove anyone. Admin: remove plain members, rotate invite code, edit club. Member: read + leave.
- **Membership rows are never direct-inserted** — only the `create_club` / `join_club` RPCs (security definer) create them. Updates (role) and deletes (leave/remove) go through RLS policies that mirror the role rules.
- **RLS helpers** `is_club_member(uuid)` / `club_role(uuid)` are `security definer` specifically to avoid policy self-recursion on `club_members`. Reuse them in every future club-scoped policy.
- `profiles` are readable by **any** authenticated user (display names only); writable only by the owning user.

## RPCs

| Function | Access | Behavior |
|---|---|---|
| `create_club(p_name, p_emoji)` | authenticated | Insert club + owner membership atomically; returns the club row. |
| `join_club(p_code)` | authenticated | Code → club; idempotent membership insert; returns the club row. Raises on bad code. |
| `rotate_invite_code(p_club)` | admin+ (checked inside) | Regenerates and returns the invite code. |
| `wheel_pool(p_club)` | members | Eligible picker ids: members minus the last-3-cycle pickers, **relaxing 3→1→0** so small clubs always have a pool. Single source of eligibility truth — used by `spin_wheel` AND the wheel screen. |
| `spin_wheel(p_club)` | admin+ | Server-side random pick from `wheel_pool`; atomically creates the next open cycle (number = max+1). Raises if a cycle is already open. The client animation lands on the returned `picker_id`. |
| `reveal_cycle(p_cycle)` | admin+ | Sets `revealed_at` (idempotent). Phase 3 rating visibility keys off this. |
| `close_cycle(p_cycle)` | admin+ | `status='closed'` + `closed_at` (implies reveal); unlocks the next spin. |
| `generate_invite_code()` | internal | 8 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. |
| `handle_new_user()` | trigger only | auth.users insert → profiles row (random avatar color). |

## Cycle-table write rules (RLS)

- `cycles`: members read; admins update (meeting fields); owner may delete a mis-spun cycle; **creation/status transitions only via RPCs**.
- `albums`: members read; **the picker or an admin** writes, only while the cycle is `open`; `set_by` must be the caller.
- `rsvps`: members read; each member upserts **their own row** while the cycle is open.
- `cycle_guests`: members read; any member adds while open; the adder or an admin edits/removes.

## Auth model

Email OTP (6-digit code): `signInWithOtp` → `verifyOtp` — no redirect URLs, identical on web and native. **Dashboard prerequisite:** the *Magic Link* email template must include `{{ .Token }}` so the code appears in the email (Authentication → Email Templates).
