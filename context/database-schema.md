# Database schema

Current-state DDL: [../supabase/schema.sql](../supabase/schema.sql) (generated — read that, not migrations). This file is the prose: what each table means and the invariants that aren't obvious from DDL. Planned future tables: see [../PLAN.md](../PLAN.md).

## Tables (Phase 1)

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users` (auto-created by `handle_new_user` trigger on signup). `display_name` stays **null until the user completes profile setup** — the app gates the lobby on this. `avatar_color` indexes into the 7-color avatar palette. |
| `clubs` | A listening club. `invite_code` (8 chars, unambiguous alphabet) is the join credential; `owner_id` is informational/FK convenience — **authority always comes from `club_members.role`**. |
| `club_members` | Membership + role: `owner` / `admin` / `member`. Unique `(club_id, profile_id)`. A partial unique index enforces **exactly one owner row per club**. |

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
| `generate_invite_code()` | internal | 8 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. |
| `handle_new_user()` | trigger only | auth.users insert → profiles row (random avatar color). |

## Auth model

Email OTP (6-digit code): `signInWithOtp` → `verifyOtp` — no redirect URLs, identical on web and native. **Dashboard prerequisite:** the *Magic Link* email template must include `{{ .Token }}` so the code appears in the email (Authentication → Email Templates).
