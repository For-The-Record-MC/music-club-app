// concert-search — Edge Function proxying the Ticketmaster Discovery API.
//
// Lets every club member search for live events to autofill the concert form
// (artist + date + time + venue + ticket link) the same way spotify-search fills
// the song picker. Ticketmaster's key can't ship in the public web bundle, so
// this function holds it (secret TICKETMASTER_API_KEY) and the app calls here.
//
// Simpler than spotify-search: the Discovery API authenticates with a plain
// `apikey` query param — no token-minting/caching step.
//
// verify_jwt is on (see config.toml) so only authenticated members can call it,
// keeping our daily call budget from being burned anonymously.
//
// Returns 200 { results } on success; 200 { results: [] } for empty/short
// queries; { ok:false, message } with a 4xx/5xx for misconfig/upstream errors.

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

// A live event, normalized to exactly the concert form's fields. date is a
// calendar day (YYYY-MM-DD); time is wall-clock (HH:MM:SS) or null when the
// event has no announced start time ("time TBA").
interface ConcertEvent {
  id: string
  artist: string
  date: string | null
  time: string | null
  venue: string // "Venue, City" — matches the form's free-text venue field
  ticketUrl: string
  imageUrl: string
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405)

    const apiKey = Deno.env.get('TICKETMASTER_API_KEY')
    if (!apiKey) {
      return json({ ok: false, message: 'concert-search is missing TICKETMASTER_API_KEY' }, 500)
    }

    let term = ''
    // countryCode defaults to 'US'; the app passes '' to search worldwide.
    let countryCode = 'US'
    // Optional US state filter (e.g. 'NY'); ignored when searching worldwide.
    let stateCode = ''
    // Optional date-range bounds (YYYY-MM-DD). startDate defaults to "now" so
    // past events are never returned; endDate is open-ended unless provided.
    let startDate = ''
    let endDate = ''
    // Zero-based page index for "Load more" paging.
    let page = 0
    try {
      const body = await req.json()
      term = String(body?.term ?? '').trim()
      if (typeof body?.countryCode === 'string') countryCode = body.countryCode
      if (typeof body?.stateCode === 'string') stateCode = body.stateCode.trim()
      if (typeof body?.startDate === 'string') startDate = body.startDate.trim()
      if (typeof body?.endDate === 'string') endDate = body.endDate.trim()
      if (Number.isFinite(body?.page)) page = Math.max(0, Math.floor(body.page))
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }
    if (term.length < 1) return json({ results: [], page: 0, totalPages: 0 })

    // Lower bound is the later of "now" and any requested start date, so the
    // range filter can never surface events that have already happened.
    const nowIso = `${new Date().toISOString().slice(0, 19)}Z`
    const startIso = startDate ? `${startDate}T00:00:00Z` : nowIso
    const params = new URLSearchParams({
      apikey: apiKey,
      keyword: term,
      classificationName: 'music',
      size: '20',
      page: String(page),
      sort: 'date,asc',
      startDateTime: startIso > nowIso ? startIso : nowIso,
    })
    if (endDate) params.set('endDateTime', `${endDate}T23:59:59Z`)
    if (countryCode) params.set('countryCode', countryCode)
    // Ticketmaster only honors stateCode alongside a countryCode.
    if (countryCode && stateCode) params.set('stateCode', stateCode)

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`
    const res = await fetch(url)
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).slice(0, 300)
      return json({ ok: false, message: `Ticketmaster search failed (${res.status}): ${snippet}` }, 502)
    }
    const payload = await res.json()
    const totalPages = Number(payload?.page?.totalPages ?? 0)
    return json({ results: normalize(payload), page, totalPages })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})

function pickImage(images: { url: string; width?: number; ratio?: string }[] = []): string {
  if (!images.length) return ''
  // Prefer a 16:9 image around 300px wide; else the first available.
  const wide = images.filter((i) => i.ratio === '16_9')
  const pool = wide.length ? wide : images
  const sorted = [...pool].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  return (sorted.find((i) => (i.width ?? 0) >= 300) ?? sorted[0]).url
}

// "Headliner" attraction if present, else the event name (often already the
// artist for music events).
function pickArtist(ev: any): string {
  const attractions = ev?._embedded?.attractions ?? []
  const named = attractions.find((a: any) => a?.name)?.name
  return named ?? ev?.name ?? ''
}

function pickVenue(ev: any): string {
  const v = ev?._embedded?.venues?.[0]
  if (!v) return ''
  const city = v.city?.name
  return [v.name, city].filter(Boolean).join(', ')
}

function normalize(payload: any): ConcertEvent[] {
  const events = payload?._embedded?.events ?? []
  return events
    .filter((ev: any) => ev?.id && ev?.name)
    .map((ev: any): ConcertEvent => {
      const start = ev?.dates?.start ?? {}
      return {
        id: ev.id,
        artist: pickArtist(ev),
        // localDate is YYYY-MM-DD; localTime is HH:MM:SS (absent when time TBA).
        date: start.localDate ?? null,
        time: start.dateTBA || start.timeTBA ? null : (start.localTime ?? null),
        venue: pickVenue(ev),
        ticketUrl: ev.url ?? '',
        imageUrl: pickImage(ev.images),
      }
    })
}
