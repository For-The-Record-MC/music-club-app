// spotify-oauth — exchanges a Spotify Authorization Code for tokens and stores
// the per-club connection. Owner-only.
//
// The client runs the consent flow (it knows the public client_id) and posts the
// returned { code, redirect_uri, club_id } here. We hold the client secret, do
// the server-side code→token exchange, read the Spotify profile, and upsert the
// streaming_connections row with the service role (the client can never read or
// write that table). Tokens never leave the server.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { exchangeCode, getMe } from '../_shared/spotify.ts'

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
    const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')
    const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !clientId || !clientSecret) {
      return json({ ok: false, message: 'Function is missing required secrets' }, 500)
    }

    let code = '', redirectUri = '', clubId = ''
    try {
      const body = await req.json()
      code = String(body?.code ?? '').trim()
      redirectUri = String(body?.redirect_uri ?? '').trim()
      clubId = String(body?.club_id ?? '').trim()
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }
    if (!code || !redirectUri || !clubId) {
      return json({ ok: false, message: 'code, redirect_uri and club_id are required' }, 400)
    }

    // Authenticate the caller and confirm they own this club.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ ok: false, message: 'Not authenticated' }, 401)

    const { data: membership } = await admin
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('profile_id', user.id)
      .maybeSingle()
    if (membership?.role !== 'owner') {
      return json({ ok: false, message: 'Only the club owner can connect Spotify' }, 403)
    }

    // Server-side code → tokens, then read the connected profile.
    const tokens = await exchangeCode(clientId, clientSecret, code, redirectUri)
    const me = await getMe(tokens.access_token)

    const { error: upsertErr } = await admin
      .from('streaming_connections')
      .upsert({
        club_id: clubId,
        provider: 'spotify',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? '',
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope ?? null,
        spotify_user_id: me.id,
        display_name: me.display_name,
        status: 'active',
        connected_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'club_id' })
    if (upsertErr) return json({ ok: false, message: `Could not save connection: ${upsertErr.message}` }, 500)

    return json({ ok: true, display_name: me.display_name, spotify_user_id: me.id })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})
