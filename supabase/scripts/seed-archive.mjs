// One-off: seed "The Archive" with the albums the group listened to BEFORE the
// app existed. Two phases, dependency-free (fetch + Spotify + PostgREST):
//
//   1. MATCH (default)
//        SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy \
//          node supabase/scripts/seed-archive.mjs
//      Parses the embedded list, searches Spotify (album), grabs artwork / year /
//      tracklist, and writes supabase/scripts/archive-seed.json for review.
//      Anything where the matched artist/title drifts from the input is flagged
//      "review": true — eyeball those (self-titled albums, live/deluxe editions,
//      the reversed "Man on the Moon II - Kid Cudi" line, etc.) and hand-fix the
//      spotifyUrl/title/artist in the JSON before inserting.
//
//   2. INSERT
//        SEED_EMAIL=you@example.com SEED_PASSWORD=... SEED_CLUB_ID=<club-uuid> \
//          node supabase/scripts/seed-archive.mjs --insert
//      Signs in as that (admin) member, skips any album already done in a real
//      cycle, and inserts the rest via the add_archive_album RPC. Archive↔archive
//      dupes are rejected by the DB and reported.
//
// SUPABASE url + anon key are read from app/.env.local. Re-running INSERT is
// safe: already-present albums are reported as skipped, not duplicated.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = resolve(HERE, 'archive-seed.json');

// ── The pre-app listening history. "Artist - Title". Fix-ups already applied:
// the wrapped Dominic Fike line is joined; flag the reversed Cudi line on review.
const RAW = `
A Tribe Called Quest - People's Instinctive Travels and the Paths of Rhythm
Action Bronson - Lamb Over Rice
Al Green - Let's Stay Together
Alanis Morissette - Jagged Little Pill
Alex G - God Save the Animals
Alt-J - An Awesome Wave
Angel Du$t - Brand New Soul
Avett Brothers - I and Love and You
Avicii - True
Baby Huey - The Living Legend
Bad Bunny - Un Verano Sin Ti
Beck - Guero
Bendigo Fletcher - Consensual Wisdom
Big Thief - Dragon New Warm Mountain I Believe In You
Black Eyed Peas - Monkey Business
Brent Faiyaz - WASTELAND
Bruno Major - A Song for Every Moon
C. Tangana - El Madrileño
Car Seat Headrest - Teens of Denial
case/lang/veirs - case/lang/veirs
Childish Gambino - Because the Internet
Courtney Barnett - The Double EP
Daft Punk - Random Access Memories
Daniel Caesar - Case Study 01
Deadmau5 - For Lack of a Better Name
Disclosure - Settle
Dominic Fike - What Could Possibly Go Wrong
Dominic Fike - Sunburn
EARTHGANG - Mirrorland
Fruit Bats - Gold Past Life
Flying Lotus - You're Dead
George Benson - Give Me the Night
Glass Animals - How to Be a Human Being
Genesis Owusu - Smiling with No Teeth
Inhaler - It Won't Always Be Like This
Jack's Mannequin - Everything in Transit
James Blake - Assume Form
Janis Joplin - Pearl
Janis Joplin - I Got Dem Ol' Kozmic Blues Again Mama!
Japanese Breakfast - Psychopomp
John Mayer Trio - Try!
Juice WRLD - Goodbye and Good Riddance
Kanye West - The College Dropout
Kanye West - My Beautiful Dark Twisted Fantasy
Kaytranada - 99.9%
Kendrick Lamar - DAMN
Khruangbin - The Universe Smiles Upon You
King Gizzard & the Lizard Wizard - Nonagon Infinity
King Gizzard & the Lizard Wizard - Quarters
King Sunny Ade - Juju Music
Kings of Leon - When You See Yourself
Knox Fortune - Stock Child Wonder
Led Zeppelin - Led Zeppelin
Lizzo - Cuz I Love You
Lynyrd Skynyrd - Pronounced Leh-Nerd Skin-Nerd
Mamas & the Papas - Deliver
Marvin Gaye - What's Going On
Methyl Ethel - Triage
Michael Jackson - Thriller
Modest Mouse - Good News for People Who Love Bad News
My Morning Jacket - Chapter 2: Early Recordings
Noname - Telefone
Omar Apollo - Stereo
Passion Pit - Manners
Pink Sweat$ - Volume 2
Pixies - Doolittle
Post Malone - Hollywood's Bleeding
Queens of the Stone Age - Lullabies to Paralyze
RAC - BOY
Radiohead - In Rainbows
Remi Wolf - Juno
Rihanna - Anti
Rostam - Half-Light
Sampha - Process
Steely Dan - Katy Lied
Sylvan Esso - Sylvan Esso
SZA - SOS
The Beatles - Rubber Soul
The Clash - London Calling
The Doors - L.A. Woman
The Raconteurs - Help Us Stranger
The Strokes - Room on Fire
The Weeknd - After Hours
Travis Scott - Birds in the Trap Sing McKnight
TV on the Radio - Seeds
Tom Misch - Geography
Toro y Moi - Outer Peace
Tyler Childers - Purgatory
U2 - How to Dismantle an Atomic Bomb
Vulfpeck - Thrill of the Arts
Widespread Panic - Panic in the Streets
Wolf Alice - My Love Is Cool
Kid Cudi - Man on the Moon II
`;

// ── env: parse app/.env.local for the Supabase url + anon key ────────────────
function loadEnvLocal() {
  const path = resolve(ROOT, 'app/.env.local');
  const env = {};
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  return env;
}
const FILE_ENV = loadEnvLocal();
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || FILE_ENV.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FILE_ENV.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const norm = (s) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function parseList() {
  return RAW.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(' - ');
      if (i === -1) return { artist: line, title: '', raw: line };
      return { artist: line.slice(0, i).trim(), title: line.slice(i + 3).trim(), raw: line };
    });
}

// ── Spotify (client-credentials, same flow as the spotify-search function) ────
async function spotifyToken() {
  const id = process.env.SPOTIFY_CLIENT_ID || FILE_ENV.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the environment.');
    process.exit(1);
  }
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    console.error('Spotify token failed:', res.status, await res.text());
    process.exit(1);
  }
  return (await res.json()).access_token;
}

const pickArt = (images = []) => {
  if (!images.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= 200) ?? sorted[0]).url;
};

async function searchAlbum(token, artist, title) {
  const q = `${artist} ${title}`.trim();
  const url = `https://api.spotify.com/v1/search?type=album&limit=5&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const items = (await res.json())?.albums?.items ?? [];
  return items[0] ?? null;
}

async function albumTracks(token, albumId) {
  const url = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const items = (await res.json())?.items ?? [];
  return items
    .map((t) => ({ trackNumber: t.track_number, trackName: t.name }))
    .sort((a, b) => a.trackNumber - b.trackNumber);
}

async function runMatch() {
  const token = await spotifyToken();
  const list = parseList();
  const out = [];
  for (const item of list) {
    const hit = await searchAlbum(token, item.artist, item.title);
    if (!hit) {
      out.push({ ...item, review: true, note: 'no Spotify match', spotifyUrl: null });
      console.log(`✗ ${item.raw}  — no match`);
      continue;
    }
    const hitArtist = (hit.artists ?? []).map((a) => a.name).join(', ');
    const tracks = await albumTracks(token, hit.id);
    // Flag drift: matched artist/title meaningfully different from the input.
    const artistOk = norm(hitArtist).includes(norm(item.artist)) || norm(item.artist).includes(norm(hitArtist));
    const titleOk = norm(hit.name).includes(norm(item.title)) || norm(item.title).includes(norm(hit.name));
    const review = !(artistOk && titleOk);
    out.push({
      input: item.raw,
      title: hit.name,
      artist: hitArtist,
      year: hit.release_date ? Number(String(hit.release_date).slice(0, 4)) || null : null,
      artworkUrl: pickArt(hit.images),
      spotifyUrl: hit.external_urls?.spotify ?? null,
      appleUrl: null,
      tracks,
      review,
    });
    console.log(`${review ? '⚠' : '✓'} ${item.raw}  →  ${hitArtist} – ${hit.name}`);
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  const flagged = out.filter((o) => o.review).length;
  console.log(`\nWrote ${out.length} matches to ${OUT} (${flagged} flagged for review).`);
  console.log('Review/fix the ⚠ rows, then: node supabase/scripts/seed-archive.mjs --insert');
}

// ── Insert phase ─────────────────────────────────────────────────────────────
async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error('Sign-in failed:', data.error_description || data.msg || res.status);
    process.exit(1);
  }
  return data.access_token;
}

async function existingStandardTitles(token, clubId) {
  const url =
    `${SUPABASE_URL}/rest/v1/albums?select=title,cycles!inner(club_id,kind)` +
    `&cycles.club_id=eq.${clubId}&cycles.kind=eq.standard`;
  const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return new Set();
  const rows = await res.json();
  return new Set(rows.map((r) => norm(r.title)));
}

async function addArchiveAlbum(token, clubId, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_archive_album`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_club: clubId,
      p_title: row.title,
      p_artist: row.artist ?? '',
      p_year: row.year ?? null,
      p_artwork_url: row.artworkUrl ?? null,
      p_spotify_url: row.spotifyUrl ?? null,
      p_apple_url: row.appleUrl ?? null,
      p_tracks: row.tracks ?? null,
    }),
  });
  if (res.ok) return { ok: true };
  const err = await res.json().catch(() => ({}));
  return { ok: false, message: err.message || `HTTP ${res.status}` };
}

async function runInsert() {
  const { SEED_EMAIL, SEED_PASSWORD, SEED_CLUB_ID } = process.env;
  if (!SEED_EMAIL || !SEED_PASSWORD || !SEED_CLUB_ID) {
    console.error('Set SEED_EMAIL, SEED_PASSWORD, and SEED_CLUB_ID for --insert.');
    process.exit(1);
  }
  if (!existsSync(OUT)) {
    console.error(`No ${OUT} — run the match phase first.`);
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(OUT, 'utf8')).filter((r) => r.spotifyUrl && r.title);
  const token = await signIn(SEED_EMAIL, SEED_PASSWORD);
  const done = await existingStandardTitles(token, SEED_CLUB_ID);

  let added = 0,
    skippedCycle = 0,
    skippedDupe = 0,
    failed = 0;
  for (const row of rows) {
    if (done.has(norm(row.title))) {
      console.log(`↷ ${row.artist} – ${row.title}  (already done in a real cycle)`);
      skippedCycle++;
      continue;
    }
    const r = await addArchiveAlbum(token, SEED_CLUB_ID, row);
    if (r.ok) {
      console.log(`✓ ${row.artist} – ${row.title}`);
      added++;
    } else if (/already in the Archive/i.test(r.message)) {
      console.log(`↷ ${row.artist} – ${row.title}  (already in the Archive)`);
      skippedDupe++;
    } else {
      console.log(`✗ ${row.artist} – ${row.title}  — ${r.message}`);
      failed++;
    }
  }
  console.log(
    `\nDone. added=${added} skipped(cycle)=${skippedCycle} skipped(dupe)=${skippedDupe} failed=${failed}`,
  );
}

const insert = process.argv.includes('--insert');
(insert ? runInsert() : runMatch()).catch((e) => {
  console.error(e);
  process.exit(1);
});
