// track-stats — Last.fm track.getInfo proxy for Listening Bingo rarity.
//
// Given a title + artist, returns the track's global all-time playcount (and
// listener count) from Last.fm. The client stores the playcount on the bingo
// box and scores rarity from it — fewer streams = rarer pick. Same secret as
// bracket-seed (LASTFM_API_KEY); verify_jwt is on so only signed-in members
// can spend our rate budget.
//
// Best-effort by design: a title Last.fm doesn't know returns
// { playcount: null } with a 200 — the pick simply goes unscored.

import { trackPlaycount } from '../_shared/lastfm.ts'

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

    const key = Deno.env.get('LASTFM_API_KEY')
    if (!key) return json({ ok: false, message: 'track-stats is missing LASTFM_API_KEY' }, 500)

    let title = ''
    let artist = ''
    try {
      const body = await req.json()
      title = String(body?.title ?? '').trim()
      artist = String(body?.artist ?? '').trim()
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }
    if (!title || !artist) return json({ playcount: null, listeners: null })

    const best = await trackPlaycount(key, title, artist)
    return json(best ?? { playcount: null, listeners: null })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})
