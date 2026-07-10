#!/usr/bin/env node
// Phase 2 backfill (APPLE_MUSIC_PLAN.md): re-resolve EVERY existing song/album
// row through the deployed apple-music Edge Function — the same path new rows
// take via trigger. The resolver's write policy does the heavy lifting:
// ISRC-verified matches overwrite wrong fuzzy links, text-search fallbacks only
// fill missing ones, and total misses land in apple_match_queue for the hourly
// sweep. Safe to re-run; already-verified rows just resolve again to the same
// values.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... APPLE_MATCH_SECRET=... \
//     node supabase/backfill-apple-matches.mjs [table ...]
//
// With no args it does all tables. Pass table names to limit (e.g. a re-run
// after a partial failure).

const PROJECT_URL = 'https://yecjvvnposykmrzemcej.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MATCH_SECRET = process.env.APPLE_MATCH_SECRET
if (!SERVICE_KEY || !MATCH_SECRET) {
  console.error('SUPABASE_SERVICE_ROLE_KEY and APPLE_MATCH_SECRET are required')
  process.exit(1)
}

// Every table the request_apple_match trigger watches. feed_posts is filtered
// to the kinds that carry a resolvable song/album (playlist posts don't).
const TABLES = [
  { table: 'albums' },
  { table: 'best_bars' },
  { table: 'perfect_playlist_songs' },
  { table: 'aux_battle_songs' },
  { table: 'convince_tracks' },
  { table: 'showdown_submissions' },
  { table: 'bracket_tracks' },
  { table: 'bingo_boxes', filter: 'title=not.is.null' },
  { table: 'feed_posts', filter: 'kind=in.(track,album)' },
]

const CONCURRENCY = 3
const PAGE = 200

async function listIds(table, filter) {
  const ids = []
  let last = null
  for (;;) {
    const params = [`select=id`, `order=id.asc`, `limit=${PAGE}`]
    if (filter) params.push(filter)
    if (last) params.push(`id=gt.${last}`)
    const res = await fetch(`${PROJECT_URL}/rest/v1/${table}?${params.join('&')}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    if (!res.ok) throw new Error(`list ${table} failed (${res.status}): ${await res.text()}`)
    const rows = await res.json()
    ids.push(...rows.map((r) => r.id))
    if (rows.length < PAGE) return ids
    last = rows[rows.length - 1].id
  }
}

async function resolveOne(table, id) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${PROJECT_URL}/functions/v1/apple-music`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-apple-secret': MATCH_SECRET },
        body: JSON.stringify({ source_table: table, source_id: id }),
      })
      const j = await res.json().catch(() => null)
      if (res.ok && j?.ok) return j.outcome
      // 429s and transient 5xxs: brief pause then one retry.
      await new Promise((r) => setTimeout(r, 3000))
    } catch {
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  return 'error'
}

const only = process.argv.slice(2)
const grand = {}
for (const { table, filter } of TABLES) {
  if (only.length && !only.includes(table)) continue
  const ids = await listIds(table, filter)
  const counts = {}
  let done = 0
  // Small fixed worker pool — enough throughput without bursting Apple's
  // undocumented rate limit.
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (ids.length) {
        const id = ids.shift()
        const outcome = await resolveOne(table, id)
        counts[outcome] = (counts[outcome] ?? 0) + 1
        done++
        if (done % 50 === 0) console.log(`  ${table}: ${done} done…`)
      }
    }),
  )
  grand[table] = counts
  console.log(`${table}: ${JSON.stringify(counts)}`)
}
console.log('\nTOTALS by table:')
for (const [t, c] of Object.entries(grand)) console.log(`  ${t}: ${JSON.stringify(c)}`)
