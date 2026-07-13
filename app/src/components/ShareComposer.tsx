import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PlaylistForm } from '@/components/PlaylistComposer';
import { Button, Card, InlineNote, Label, TextField } from '@/components/ui';
import { useCycle } from '@/hooks/useCycle';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { useMyClubs } from '@/hooks/useMyClubs';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { resolveAppleAlbum, resolveAppleTrack, searchAlbums as searchItunesAlbums, searchSongs as searchItunes } from '@/utils/itunes';
import { resolveSpotifyAlbum, resolveSpotifyTrack, searchAlbums as searchSpotifyAlbums, searchSongs as searchSpotify } from '@/utils/spotify';
import { confirmAsync } from '@/utils/confirm';
import { normKey } from '@/utils/normalize';
import {
  activity,
  clubs as clubsDb,
  feed as feedDb,
  streaming as streamingDb,
  type SongQuota,
} from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

type Platform = 'spotify' | 'apple' | 'other';
type Kind = 'track' | 'album';
// The toggle's options: search kinds plus (when enabled) the paste-a-link
// playlist form, which delegates to PlaylistForm rather than the search flow.
type ShareKind = Kind | 'playlist';

// One search row for the composer list. Search is Spotify-first (best catalog),
// falling back to iTunes; whichever source produced it, the *other* service's
// link is resolved on pick so every post opens in both.
interface SearchResult {
  key: string;
  kind: Kind;
  // For album results, trackName carries the album title.
  trackName: string;
  artistName: string;
  artworkUrl: string;
  spotifyUrl: string | null;
  spotifyUri: string | null;
  appleUrl: string | null;
  // Recording code from Spotify track results — stored in post metadata so the
  // apple-music resolver can exact-match without a second Spotify lookup.
  isrc: string | null;
}

// The "+ Share something" button and the song/album composer behind it —
// extracted from Club Radio so Home can offer the same quick-share. Songs post
// to Club Radio (with the quota, dup-guard, cross-post and playlist-sync
// behavior); albums are queued as suggestions, so they land in The Queue —
// never the radio feed — no matter which room the composer is opened from.
// Home shows all three kinds (`includePlaylists`); Club Radio's Songs tab is
// songs-only (`includeAlbums={false}`) since albums belong to The Queue and
// playlists have their own tab. With one kind the toggle row hides entirely.
export function ShareComposer({
  clubId,
  onPosted,
  includeAlbums = true,
  includePlaylists = false,
}: {
  clubId: string;
  onPosted?: () => void;
  includeAlbums?: boolean;
  includePlaylists?: boolean;
}) {
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { cycle } = useCycle(clubId);

  // Your other clubs — the candidates for cross-posting a song/album.
  const { rows: myClubRows } = useMyClubs();
  const otherClubs = useMemo(
    () =>
      myClubRows
        .filter((r) => r.club.id !== clubId)
        .map((r) => ({ id: r.club.id, name: r.club.name, emoji: r.club.emoji })),
    [myClubRows, clubId],
  );

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<ShareKind>('track');
  const [artwork, setArtwork] = useState<string | null>(null);
  const [spotifyUri, setSpotifyUri] = useState<string | null>(null);
  const [spotifyUrl, setSpotifyUrl] = useState<string | null>(null);
  const [appleUrl, setAppleUrl] = useState<string | null>(null);
  const [isrc, setIsrc] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const searchDebounce = useDebouncedSearch();
  const pickSeq = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Post-submit confirmation shown under the collapsed button — matters most
  // for albums, which land in The Queue rather than visibly in the feed.
  const [notice, setNotice] = useState<string | null>(null);
  const [quota, setQuota] = useState<SongQuota | null>(null);
  const [shareTargets, setShareTargets] = useState<string[]>([]);
  // Other clubs' remaining song slots; null = uncapped/no open cycle.
  const [otherQuota, setOtherQuota] = useState<Record<string, number | null>>({});

  // My per-cycle song quota — drives the "X of N songs left" hint and disables
  // posting a song once the cap is hit. Only kind='track' counts. Loaded when
  // the composer opens (the hint only renders inside it).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    clubsDb.songQuota(clubId).then(({ data }) => {
      if (!cancelled) setQuota((data as unknown as SongQuota) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, clubId]);

  // While the composer is open, learn each other club's remaining song slots so
  // "Also post to" can disable clubs where you're already at the cap (tracks).
  useEffect(() => {
    if (!open || otherClubs.length === 0) return;
    let cancelled = false;
    (async () => {
      const quotas = await Promise.all(otherClubs.map((c) => clubsDb.songQuota(c.id)));
      if (cancelled) return;
      const map: Record<string, number | null> = {};
      otherClubs.forEach((c, i) => {
        const q = quotas[i].data as unknown as SongQuota | null;
        map[c.id] = q && q.limit != null && q.has_open_cycle ? Math.max(0, q.limit - q.used) : null;
      });
      setOtherQuota(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, otherClubs]);

  const toggleShareTarget = (targetId: string) =>
    setShareTargets((t) => (t.includes(targetId) ? t.filter((x) => x !== targetId) : [...t, targetId]));

  const capped = quota?.limit != null && quota.has_open_cycle;
  const remaining = capped ? Math.max(0, (quota!.limit as number) - quota!.used) : null;
  const songBlocked = kind === 'track' && remaining === 0;
  // Picked share targets that aren't capped-out for a song — what actually posts.
  const activeShareCount = shareTargets.filter((t) => !(kind === 'track' && otherQuota[t] === 0)).length;

  // Search the catalog for the active kind. searchKind is passed explicitly so
  // the track/album toggle can re-run immediately without a stale `kind` closure.
  // Spotify first (best catalog/search); fall back to iTunes if it's empty —
  // e.g. app credentials unset, or something Spotify simply doesn't have.
  const runSearch = (term: string, explicitKind?: Kind) => {
    // Only the track/album UI calls this; the playlist form has no search.
    const searchKind: Kind = explicitKind ?? (kind === 'playlist' ? 'track' : kind);
    setSearch(term);
    if (term.trim().length < 3) {
      searchDebounce.cancel();
      setResults([]);
      return;
    }
    searchDebounce.schedule((isCurrent) => performSearch(term, searchKind, isCurrent));
  };

  const performSearch = async (term: string, searchKind: Kind, isCurrent: () => boolean) => {
    let found: SearchResult[];
    if (searchKind === 'album') {
      const spotifyHits = await searchSpotifyAlbums(term);
      found = spotifyHits.length
        ? spotifyHits.map((a) => ({
            key: a.id,
            kind: 'album' as const,
            trackName: a.collectionName,
            artistName: a.artistName,
            artworkUrl: a.artworkUrl,
            spotifyUrl: a.spotifyUrl,
            spotifyUri: a.uri,
            appleUrl: null,
            isrc: null,
          }))
        : (await searchItunesAlbums(term)).map((a) => ({
            key: String(a.collectionId),
            kind: 'album' as const,
            trackName: a.collectionName,
            artistName: a.artistName,
            artworkUrl: a.artworkUrl,
            spotifyUrl: null,
            spotifyUri: null,
            appleUrl: a.appleUrl || null,
            isrc: null,
          }));
    } else {
      const spotifyHits = await searchSpotify(term);
      found = spotifyHits.length
        ? spotifyHits.map((s) => ({
            key: s.id,
            kind: 'track' as const,
            trackName: s.trackName,
            artistName: s.artistName,
            artworkUrl: s.artworkUrl,
            spotifyUrl: s.spotifyUrl,
            spotifyUri: s.uri,
            appleUrl: null,
            isrc: s.isrc ?? null,
          }))
        : (await searchItunes(term)).map((s) => ({
            key: String(s.trackId),
            kind: 'track' as const,
            trackName: s.trackName,
            artistName: s.artistName,
            artworkUrl: s.artworkUrl,
            spotifyUrl: null,
            spotifyUri: null,
            appleUrl: s.appleUrl,
            isrc: null,
          }));
    }
    if (isCurrent()) setResults(found);
  };

  // Switching the search kind clears stale results AND the current pick — album
  // mode has no visible title/artist fields, so anything carried over from the
  // other mode would be invisible state. Re-runs the search against the new
  // catalog so the dropdown matches what the toggle says it's searching.
  const changeKind = (k: ShareKind) => {
    if (k === kind) return;
    setKind(k);
    setResults([]);
    setTitle('');
    setArtist('');
    setUrl('');
    setArtwork(null);
    setSpotifyUri(null);
    setSpotifyUrl(null);
    setAppleUrl(null);
    setIsrc(null);
    if (k !== 'playlist' && search.trim().length >= 3) runSearch(search, k);
  };

  const pickSong = async (s: SearchResult) => {
    const seq = ++pickSeq.current;
    setTitle(s.trackName);
    setArtist(s.artistName);
    setUrl('');
    setArtwork(s.artworkUrl || null);
    setSpotifyUri(s.spotifyUri);
    setSpotifyUrl(s.spotifyUrl);
    setAppleUrl(s.appleUrl);
    setIsrc(s.isrc);
    setKind(s.kind);
    setResults([]);
    setSearch('');
    // Resolve the other service's link so the post opens in both. Keyless on the
    // Apple side, app-token on the Spotify side; best-effort, guarded vs a stale pick.
    if (s.spotifyUrl && !s.appleUrl) {
      const apple =
        s.kind === 'album'
          ? (await resolveAppleAlbum(s.trackName, s.artistName))?.appleUrl ?? null
          : await resolveAppleTrack(s.trackName, s.artistName);
      if (apple && seq === pickSeq.current) setAppleUrl(apple);
    } else if (s.appleUrl && !s.spotifyUrl) {
      const match =
        s.kind === 'album'
          ? await resolveSpotifyAlbum(s.trackName, s.artistName)
          : await resolveSpotifyTrack(s.trackName, s.artistName);
      if (match && seq === pickSeq.current) {
        setSpotifyUri(match.uri);
        setSpotifyUrl(match.url);
      }
    }
  };

  const resetComposer = () => {
    setTitle('');
    setArtist('');
    setUrl('');
    setNote('');
    setKind('track');
    setArtwork(null);
    setSpotifyUri(null);
    setSpotifyUrl(null);
    setAppleUrl(null);
    setIsrc(null);
    setSearch('');
    setResults([]);
    setShareTargets([]);
    setOpen(false);
  };

  const submit = async () => {
    if (!clubId || !userId || !title.trim()) {
      setError(kind === 'album' ? 'Pick an album.' : 'A title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    // Soft resubmission guard for songs: warn (don't block) if this track was
    // already shared in the feed this cycle, matched on spotify_uri or
    // normalized title|artist. Albums are uncapped and skip this.
    if (kind === 'track' && cycle) {
      const { data: thisCycle } = await feedDb.tracksThisCycle(clubId, cycle.created_at);
      const key = normKey(title, artist);
      const dup = (thisCycle ?? []).some((p) => {
        const uri = (p.metadata as { spotify_uri?: string } | null)?.spotify_uri ?? null;
        if (spotifyUri && uri && uri === spotifyUri) return true;
        return normKey(p.title, p.artist) === key;
      });
      if (dup) {
        const ok = await confirmAsync(
          'Already shared this cycle',
          `“${title.trim()}” has already been posted to the feed this cycle. Post it again anyway?`,
        );
        if (!ok) {
          setBusy(false);
          return;
        }
      }
    }
    // Fold a manually pasted link into the right service slot (detected from the
    // host), or treat it as a generic "other" link. Picked results already set
    // appleUrl/spotifyUrl.
    const manual = url.trim();
    let aUrl = appleUrl;
    let sUrl = spotifyUrl;
    let otherUrl: string | null = null;
    if (manual) {
      if (/spotify\.com/i.test(manual)) sUrl = sUrl ?? manual;
      else if (/apple\.com/i.test(manual)) aUrl = aUrl ?? manual;
      else otherUrl = manual;
    }
    // url+platform stay populated as a single-link fallback for older clients.
    const primaryUrl = sUrl ?? aUrl ?? otherUrl;
    const platform: Platform = sUrl ? 'spotify' : aUrl ? 'apple' : 'other';
    const meta = {
      ...(artwork ? { artwork } : {}),
      ...(spotifyUri ? { spotify_uri: spotifyUri } : {}),
      ...(sUrl ? { spotify_url: sUrl } : {}),
      ...(aUrl ? { apple_url: aUrl } : {}),
      ...(isrc ? { isrc } : {}),
    };
    // Fields shared by the post in this club and any "Also post to" copies.
    // Albums are queue *suggestions* (The Queue shows them, Club Radio filters
    // them out); songs are regular radio posts.
    const isSuggestion = kind === 'album';
    const basePost = {
      author_id: userId,
      kind,
      title: title.trim(),
      artist: artist.trim(),
      url: primaryUrl,
      platform,
      note: note.trim() || null,
      is_album_suggestion: isSuggestion,
      metadata: Object.keys(meta).length ? meta : null,
    };
    const { data, error: err } = await feedDb.create({ ...basePost, club_id: clubId });
    if (err || !data) {
      setBusy(false);
      setError(err?.message ?? 'Could not post.');
      return;
    }
    await activity.publish(clubId, 'feed_post', {
      title: data.title,
      is_album_suggestion: isSuggestion,
      post_id: data.id,
    });
    // Fan out to the picked clubs as copies linked to the original. Skip clubs
    // where a song would bust the cap (server enforces too); albums are uncapped.
    const targets = shareTargets.filter((t) => !(kind === 'track' && otherQuota[t] === 0));
    for (const targetId of targets) {
      const { data: copy } = await feedDb.create({ ...basePost, club_id: targetId, origin_post_id: data.id });
      if (!copy) continue;
      await activity.publish(targetId, 'feed_post', {
        title: copy.title,
        is_album_suggestion: isSuggestion,
        post_id: copy.id,
      });
      if (kind === 'track') streamingDb.sync(targetId).catch(() => {});
    }
    setBusy(false);
    resetComposer();
    setNotice(isSuggestion ? '💿 Added to The Queue — the picker draws from it.' : '📻 Shared to Club Radio.');
    setTimeout(() => setNotice(null), 4000);
    onPosted?.();
    // Push to this club's cycle playlist if connected. Fire-and-forget + no-ops
    // server-side when not connected / not a track.
    if (kind === 'track') streamingDb.sync(clubId).catch(() => {});
  };

  if (!open) {
    return (
      <View style={{ marginBottom: 14 }}>
        <Button
          title={includeAlbums || includePlaylists ? '+ Share something' : '+ Share a song'}
          onPress={() => {
            setNotice(null);
            setShareTargets([]);
            setOpen(true);
          }}
        />
        {notice ? <InlineNote text={notice} tone="success" /> : null}
      </View>
    );
  }

  return (
    <Card>
      {(() => {
        const kinds = [
          'track',
          ...(includeAlbums ? ['album'] : []),
          ...(includePlaylists ? ['playlist'] : []),
        ] as ShareKind[];
        if (kinds.length < 2) return null;
        return (
          <View style={styles.segRow}>
            {kinds.map((k) => (
              <Pressable
                key={k}
                onPress={() => changeKind(k)}
                style={[
                  styles.seg,
                  { borderColor: palette.border, backgroundColor: palette.card2 },
                  kind === k && { borderColor: palette.teal, backgroundColor: palette.tealBg },
                ]}
              >
                <Text style={[styles.segText, { color: kind === k ? palette.teal : palette.text3 }]}>
                  {k}
                </Text>
              </Pressable>
            ))}
          </View>
        );
      })()}
      <Text style={[styles.destHint, { color: palette.text3 }]}>
        {kind === 'album'
          ? '💿 Albums go to The Queue — the backlog the picker chooses from.'
          : kind === 'playlist'
            ? "📼 Playlists post to Club Radio's Playlists tab."
            : '📻 Songs post to Club Radio and the cycle playlist.'}
      </Text>
      {kind === 'playlist' ? (
        <View style={{ marginTop: 12 }}>
          <PlaylistForm
            clubId={clubId}
            onPosted={() => {
              resetComposer();
              setNotice("📼 Shared to Club Radio's Playlists tab.");
              setTimeout(() => setNotice(null), 4000);
              onPosted?.();
            }}
            onCancel={resetComposer}
          />
        </View>
      ) : (
        <>
      <View style={{ marginTop: 10 }}>
        <Label>{kind === 'album' ? 'Search an album' : 'Search a song'}</Label>
      </View>
      {/* Album mode mirrors The Queue's composer: search until you pick, then
          just the picked album + a "why this one" note. No manual fields. */}
      {kind === 'album' && title ? null : (
        <>
          <TextField
            placeholder={
              kind === 'album'
                ? 'Search an album… (e.g. Rumours)'
                : 'Search a song… (e.g. Dreams Fleetwood Mac)'
            }
            value={search}
            onChangeText={(t) => runSearch(t)}
            autoCorrect={false}
          />
          {results.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => pickSong(s)}
              style={({ pressed }) => [
                styles.resultRow,
                { backgroundColor: pressed ? palette.card2 : 'transparent' },
              ]}
            >
              {s.artworkUrl ? (
                <Image source={{ uri: s.artworkUrl }} style={styles.resultArt} contentFit="cover" />
              ) : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text1 }]}>{s.trackName}</Text>
                <Text numberOfLines={1} style={[styles.resultArtist, { color: palette.text2 }]}>{s.artistName}</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}

      {(kind === 'album' ? title : artwork) ? (
        <View style={styles.pickedRow}>
          {artwork ? <Image source={{ uri: artwork }} style={styles.resultArt} contentFit="cover" /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text1 }]}>{title}</Text>
            <Text numberOfLines={1} style={[styles.resultArtist, { color: palette.text2 }]}>{artist}</Text>
            {spotifyUrl || appleUrl ? (
              <Text style={[styles.pickedHint, { color: palette.text3 }]}>
                Opens in {[spotifyUrl && 'Spotify', appleUrl && 'Apple Music'].filter(Boolean).join(' + ')}
              </Text>
            ) : null}
          </View>
          <Text
            onPress={() => {
              // Album mode also clears title/artist — there are no manual
              // fields showing them, so they'd otherwise linger invisibly.
              if (kind === 'album') { setTitle(''); setArtist(''); }
              setArtwork(null); setUrl(''); setSpotifyUri(null); setSpotifyUrl(null); setAppleUrl(null); setIsrc(null);
            }}
            style={[styles.clearPick, { color: palette.text3 }]}
          >
            ×
          </Text>
        </View>
      ) : null}

      {kind === 'track' ? (
        <Text style={[styles.orNote, { color: palette.text3 }]}>or enter it manually</Text>
      ) : null}

      <View style={{ gap: 8, marginTop: 8 }}>
        {kind === 'track' ? (
          <>
            <TextField placeholder="Title (track / album)" value={title} onChangeText={setTitle} />
            <TextField placeholder="Artist (optional)" value={artist} onChangeText={setArtist} />
            <TextField placeholder="Paste a link… (optional)" value={url} onChangeText={setUrl} autoCapitalize="none" />
          </>
        ) : null}
        <TextField
          placeholder={kind === 'album' ? 'Why this one? (optional)' : 'A note — why you love it… (optional)'}
          value={note}
          onChangeText={setNote}
          multiline
          style={{ minHeight: 60, textAlignVertical: 'top' }}
        />
        {capped && kind === 'track' ? (
          <InlineNote
            text={
              remaining === 0
                ? `You've used all ${quota!.limit} of this cycle's songs.`
                : `${remaining} of ${quota!.limit} song${quota!.limit === 1 ? '' : 's'} left this cycle.`
            }
            tone={remaining === 0 ? 'error' : 'muted'}
          />
        ) : null}
        {otherClubs.length > 0 ? (
          <View style={styles.sharePickBlock}>
            <Text style={[styles.sharePickLabel, { color: palette.text3 }]}>ALSO POST TO (OPTIONAL)</Text>
            <View style={styles.shareChips}>
              {otherClubs.map((c) => {
                const capReached = kind === 'track' && otherQuota[c.id] === 0;
                const on = shareTargets.includes(c.id) && !capReached;
                return (
                  <Pressable
                    key={c.id}
                    onPress={capReached ? undefined : () => toggleShareTarget(c.id)}
                    disabled={capReached}
                    style={[
                      styles.shareChip,
                      { borderColor: palette.border, backgroundColor: palette.card2 },
                      on && { borderColor: palette.teal, backgroundColor: palette.tealBg },
                      capReached && { opacity: 0.5 },
                    ]}
                  >
                    <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.shareChipText, { color: on ? palette.teal : palette.text2 }]}
                    >
                      {c.name}
                      {capReached ? ' · capped' : ''}
                    </Text>
                    {on ? <Text style={[styles.shareChipCheck, { color: palette.teal }]}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <Button
          title={
            kind === 'album'
              ? activeShareCount > 0
                ? `Queue & share to ${activeShareCount}`
                : 'Add to the Queue'
              : activeShareCount > 0
                ? `Post & share to ${activeShareCount}`
                : 'Post to Club Radio'
          }
          onPress={submit}
          loading={busy}
          disabled={kind === 'album' ? !title.trim() : songBlocked}
        />
        <Button title="Cancel" variant="ghost" onPress={resetComposer} />
        {error ? <InlineNote text={error} tone="error" /> : null}
      </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  segRow: { flexDirection: 'row', gap: 6 },
  seg: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  segText: { fontFamily: fonts.monoMedium, fontSize: 11, textTransform: 'uppercase' },
  destHint: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 10 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: radius.md },
  resultArt: { width: 40, height: 40, borderRadius: radius.sm },
  resultTitle: { fontFamily: fonts.sansMedium, fontSize: 13 },
  resultArtist: { fontFamily: fonts.sans, fontSize: 11 },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 6,
    marginTop: 6,
    borderRadius: radius.md,
  },
  clearPick: { fontSize: 18, paddingHorizontal: 4 },
  pickedHint: { fontFamily: fonts.monoMedium, fontSize: 10, marginTop: 3 },
  orNote: { fontFamily: fonts.mono, fontSize: 10, textAlign: 'center', marginVertical: 8 },
  sharePickBlock: { gap: 8, marginTop: 2 },
  sharePickLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.5 },
  shareChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  shareChipText: { fontFamily: fonts.sansMedium, fontSize: 12, flexShrink: 1 },
  shareChipCheck: { fontFamily: fonts.monoMedium, fontSize: 11 },
});
