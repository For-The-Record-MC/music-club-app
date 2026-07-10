-- One-off data repair: iTunes' catalog for Billie Eilish's "HIT ME HARD AND
-- SOFT" carries an 11th "track" that is really a 5-second music video named
-- after the album (wrapperType 'track', kind 'music-video'). getAlbumTracks
-- stored it into albums.tracks at pick time; the client now filters
-- kind='song' so this can't recur. Strip the phantom entry from any affected
-- album and drop song notes members left on it.
with fixed as (
  update public.albums a
  set tracks = (
    select coalesce(jsonb_agg(t order by (t->>'trackNumber')::int), '[]'::jsonb)
    from jsonb_array_elements(a.tracks) t
    where not ((t->>'trackName') = 'HIT ME HARD AND SOFT' and (t->>'trackNumber')::int = 11)
  )
  where a.title = 'HIT ME HARD AND SOFT'
    and a.tracks @> '[{"trackNumber": 11, "trackName": "HIT ME HARD AND SOFT"}]'::jsonb
  returning a.id
)
delete from public.song_notes n
using fixed
where n.album_id = fixed.id
  and n.track_number = 11;
