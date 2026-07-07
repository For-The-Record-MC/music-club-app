# Trophies & Cycle Recap Tabs — Profile glory + Studio wrap

Design locked 2026-07-06 via grill session. Ships into the uncommitted v1 batch.

## Locked decisions

| # | Decision | Ruling |
|---|----------|--------|
| 1 | Trophy taxonomy | **Wins + feats only** on the shelf: Showdown wins, Aux Battle wins, bingo crowns (first verified bingo of a game), blackouts. Participation (takes, bars, brackets finished…) stays numeric in the stats grid. Scarce = meaningful |
| 2 | Shelf UI | **Emoji trophy cases with counts** near the top of the profile (🏆 ×3 · 🎚️ ×2 · 🎱 ×1 · ⬛ ×1); tap a case → expands the receipts (cycle, song/theme, date) |
| 3 | Champions gallery | **Horizontal scroll of champion cards** (album art of their crowned pick + artist + 👑) under the shelf; tap → the archived bracket in Track Madness. Consensus-match ✓ deferred (consensus is client-computed from full pick sets — too heavy for profile load; v2) |
| 4 | Data source | **Computed on read, no trophies table.** One security-definer RPC `member_studio_stats(p_club, p_profile)` unions wins/feats/gallery/stats from the game tables. Retroactive for all past wins, zero write-path drift risk |
| 5 | New stats-grid entries | Brackets finished, Takes posted, Bars dropped, Boxes lit, Bingos, Conversions (Convince Me targets who marked Converted) |
| 6 | Recap layout | **Two tabs**: segmented control — **The Record** (existing album content, default) / **The Studio** (the cycle's games + social) |
| 7 | Studio scope | Cycle-tied rooms (Showdown, Aux, Perfect Playlist, Bingo) get full result blocks; standing rooms (Track Madness, takes, bars, recs, feed shares) filter by created/closed **within the cycle's open→close window** |
| 8 | Studio data | **Live via RPC `cycle_studio_recap(p_cycle)`** — results are frozen post-close so nothing drifts; every past cycle gets a Studio tab retroactively; cycle-highlights Edge Function + email untouched (Record-only) |
| 9 | Surfaces & timing | Profile-only trophies (no extra activity events — each win already emits its own). Build now into the v1 batch; read-only RPCs, no risk |

## Backend (one migration, read-only RPCs)

- `member_studio_stats(p_club, p_profile) → jsonb` — club-member gated:
  `{ showdown_wins: [{cycle_number,title,artist,theme}], aux_wins: [{cycle_number,theme}],
     bingo_crowns: [{closed_at}], blackouts: [{closed_at}],
     champions: [{bracket_id,artist_name,size,closed_at,champ_title,champ_artwork_url,champ_seed}],
     stats: {brackets_finished,takes,bars,boxes_lit,bingos,conversions} }`
- `cycle_studio_recap(p_cycle) → jsonb` — club-member gated:
  `{ showdown: {theme,podium:[{title,artist,submitter,net}]},
     aux: [{theme,a,b,winner,a_votes,b_votes}],
     playlist: {theme,song_count,contributor_count},
     bingo: {cards,standings:[{name,line,self_certified}],blackouts:[names],first_crown},
     brackets: [{id,artist_name,size,closed_at}]  // closed in window
     window: {takes:[{author,snippet}],bars:[{author,snippet,title}],share_count,convince_conversions} }`

## Client

- Profile (`club/[id]/member/[profileId].tsx`): trophy shelf cases + expandable
  receipts, champions gallery rail, six new Stat cells fed by the RPC (replaces
  the two ad-hoc win-count queries).
- Cycle recap (`club/[id]/cycle/[cycleId].tsx`): segmented Record/Studio tabs;
  Record = existing sections unchanged; Studio = podium/aux/playlist/bingo/
  bracket/window blocks from `cycle_studio_recap`, each linking to its room.
