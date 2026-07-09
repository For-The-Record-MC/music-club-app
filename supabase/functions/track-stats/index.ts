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

    // Spotify metadata vs Last.fm's catalog: Spotify joins every collaborator
    // into one artist string ("mgk, blackbear") and decorates titles with
    // "(feat. …)" / "- Acoustic" etc.; Last.fm indexes by primary artist and
    // clean title. Look up the cleaned pair first, fall back to the raw one.
    const primaryArtist = artist.split(',')[0].trim()
    const cleanTitle = title
      .replace(/\s*[([](?:feat|ft|with)\.?[^)\]]*[)\]]/gi, '')
      .replace(/\s+-\s+.*$/i, '')
      .trim() || title

    const lookup = async (t: string, a: string) => {
      const url =
        `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&format=json&autocorrect=1` +
        `&api_key=${key}&track=${encodeURIComponent(t)}&artist=${encodeURIComponent(a)}`
      const res = await fetch(url)
      if (!res.ok) return null
      const track = (await res.json())?.track
      const playcount = track?.playcount != null ? Number(track.playcount) : null
      const listeners = track?.listeners != null ? Number(track.listeners) : null
      if (!Number.isFinite(playcount as number)) return null
      return { playcount, listeners: Number.isFinite(listeners as number) ? listeners : null }
    }

    const cleaned = await lookup(cleanTitle, primaryArtist)
    // A cleaned hit with a real count wins; a tiny count on a decorated title
    // usually means we found some obscure alias — take the better of the two.
    const raw =
      cleanTitle !== title || primaryArtist !== artist
        ? await lookup(title, artist)
        : null
    const best =
      (cleaned?.playcount ?? -1) >= (raw?.playcount ?? -1) ? cleaned : raw
    return json(best ?? { playcount: null, listeners: null })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})
