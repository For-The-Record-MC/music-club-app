// delete-account — permanently deletes the calling user's account and all data
// they own. Required by App Store Review Guideline 5.1.1(v): any app with
// account creation must offer in-app account deletion (not just sign-out).
//
// Most data cascades for free: profiles.id references auth.users(id) ON DELETE
// CASCADE, and nearly every table references profiles(id) ON DELETE CASCADE — so
// deleting the auth user unwinds ratings, posts, notes, memberships, etc.
//
// The one exception is clubs.owner_id, which references profiles(id) with NO
// cascade (a club must always have an owner). So before deleting the user we
// resolve every club they own:
//   - if another member exists, transfer ownership to the most senior one
//     (admins first, then earliest-joined) and promote them to 'owner';
//   - if they're the sole member, delete the club (cascades its cycles/albums/…).
// Only then do we delete the auth user.
//
// verify_jwt is on (see config.toml): the caller can only ever delete themselves
// (we act on the JWT's user id via the service role — no id is taken from the
// request body).
//
// Returns 200 { ok:true } on success; { ok:false, message } with a 4xx/5xx on
// auth failure or an unrecoverable error.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
      return json({ ok: false, message: 'Function is missing required secrets' }, 500)
    }

    // Identify the caller from their JWT — the only id we ever act on.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ ok: false, message: 'Not authenticated' }, 401)
    const uid = user.id

    // Hand off or tear down every club this user owns, so the (non-cascading,
    // NOT NULL) clubs.owner_id FK can't block the user delete.
    const { data: ownedClubs, error: clubsErr } = await admin
      .from('clubs')
      .select('id')
      .eq('owner_id', uid)
    if (clubsErr) return json({ ok: false, message: clubsErr.message }, 500)

    for (const { id: clubId } of ownedClubs ?? []) {
      // Most senior OTHER member: admins before members, then earliest joined.
      const { data: heir } = await admin
        .from('club_members')
        .select('profile_id, role')
        .eq('club_id', clubId)
        .neq('profile_id', uid)
        .order('role', { ascending: true }) // 'admin' < 'member' alphabetically
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (heir) {
        const { error: transferErr } = await admin
          .from('clubs')
          .update({ owner_id: heir.profile_id })
          .eq('id', clubId)
        if (transferErr) return json({ ok: false, message: transferErr.message }, 500)

        const { error: promoteErr } = await admin
          .from('club_members')
          .update({ role: 'owner' })
          .eq('club_id', clubId)
          .eq('profile_id', heir.profile_id)
        if (promoteErr) return json({ ok: false, message: promoteErr.message }, 500)
      } else {
        // Sole member — remove the club entirely (cascades cycles/albums/etc).
        const { error: delClubErr } = await admin.from('clubs').delete().eq('id', clubId)
        if (delClubErr) return json({ ok: false, message: delClubErr.message }, 500)
      }
    }

    // Delete the auth user; ON DELETE CASCADE from auth.users → profiles → the
    // rest removes everything else this user authored.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) return json({ ok: false, message: delErr.message }, 500)

    return json({ ok: true })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
