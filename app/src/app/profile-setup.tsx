import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { avatarColors, fonts, radius } from '@/theme';
import {
  searchAlbums as searchItunesAlbums,
  searchSongs as searchItunesSongs,
} from '@/utils/itunes';
import {
  searchAlbums as searchSpotifyAlbums,
  searchSongs as searchSpotifySongs,
} from '@/utils/spotify';
import { supabase } from '@/utils/supabase/client';
import {
  profiles,
  profileTracks,
  TRACK_SLOTS,
  TRACK_SLOT_LABELS,
  type PreferredService,
  type ProfileTrack,
  type TrackSlot,
} from '@/utils/supabase/db';

// One unified album hit from either catalog (Spotify first, iTunes fallback).
interface AlbumHit {
  key: string;
  collectionName: string;
  artistName: string;
  artworkUrl: string;
  year: number | null;
  url: string | null;
}

// Spotify is the better catalog; fall back to iTunes when it's empty (creds
// unset, function un-deployed, or iTunes blocked) — same approach as the album
// picker and the song search below.
async function searchAlbums(term: string): Promise<AlbumHit[]> {
  const spotify = await searchSpotifyAlbums(term);
  if (spotify.length) {
    return spotify.map((a) => ({
      key: a.id,
      collectionName: a.collectionName,
      artistName: a.artistName,
      artworkUrl: a.artworkUrl,
      year: a.year,
      url: a.spotifyUrl,
    }));
  }
  return (await searchItunesAlbums(term)).map((a) => ({
    key: String(a.collectionId),
    collectionName: a.collectionName,
    artistName: a.artistName,
    artworkUrl: a.artworkUrl,
    year: a.year,
    url: a.appleUrl || null,
  }));
}

// One unified song hit from either catalog (Spotify first, iTunes fallback).
interface SongHit {
  trackName: string;
  artistName: string;
  albumName: string;
  artworkUrl: string;
  url: string | null;
  uri: string | null;
}

// Spotify is the better catalog; fall back to iTunes when it's empty (creds
// unset, or a track Spotify lacks) — same approach as the feed composer.
async function searchSongs(term: string): Promise<SongHit[]> {
  const spotify = await searchSpotifySongs(term);
  if (spotify.length) {
    return spotify.map((s) => ({
      trackName: s.trackName,
      artistName: s.artistName,
      albumName: s.collectionName,
      artworkUrl: s.artworkUrl,
      url: s.spotifyUrl,
      uri: s.uri,
    }));
  }
  return (await searchItunesSongs(term)).map((s) => ({
    trackName: s.trackName,
    artistName: s.artistName,
    albumName: s.collectionName,
    artworkUrl: s.artworkUrl,
    url: s.appleUrl || null,
    uri: null,
  }));
}

// First-run (and later editable) profile: display name, avatar (album cover or
// color), and an optional password so the member can skip the email code next
// time. Reached on first sign-in (no display_name) and by tapping the avatar.
export default function ProfileSetup() {
  const { palette } = useTheme();
  const router = useRouter();
  const { userId, profile, refreshProfile } = useAuthStore();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [color, setColor] = useState(profile?.avatar_color ?? 0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [avatarLabel, setAvatarLabel] = useState<string | null>(profile?.avatar_label ?? null);
  const [avatarAlbumUrl, setAvatarAlbumUrl] = useState<string | null>(
    profile?.avatar_album_url ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Album cover search (iTunes — keyless, always works) for the profile picture.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AlbumHit[]>([]);
  const searchSeq = useRef(0);

  const runSearch = async (term: string) => {
    setQuery(term);
    const seq = ++searchSeq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
    const found = await searchAlbums(term);
    if (seq === searchSeq.current) setResults(found);
  };

  const pickCover = (album: AlbumHit) => {
    setAvatarUrl(album.artworkUrl);
    setAvatarLabel(`${album.collectionName} — ${album.artistName}`);
    setAvatarAlbumUrl(album.url);
    setQuery('');
    setResults([]);
  };

  const removeCover = () => {
    setAvatarUrl(null);
    setAvatarLabel(null);
    setAvatarAlbumUrl(null);
  };

  const save = async () => {
    if (!userId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a name your club will recognize.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await profiles.update(userId, {
      display_name: trimmed,
      avatar_color: color,
      avatar_url: avatarUrl,
      avatar_label: avatarUrl ? avatarLabel : null,
      avatar_album_url: avatarUrl ? avatarAlbumUrl : null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await refreshProfile();
    router.replace('/');
  };

  return (
    <Screen>
      {profile?.display_name ? (
        <View style={styles.topbar}>
          <Pressable onPress={close} hitSlop={12}>
            <Text style={[styles.close, { color: palette.text2 }]}>✕</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.header}>
        <Avatar name={name || null} colorIndex={color} imageUrl={avatarUrl} size={64} />
        <Text style={[styles.title, { color: palette.text1 }]}>
          {profile?.display_name ? 'Edit profile' : 'Welcome! Who are you?'}
        </Text>
        {avatarUrl && avatarLabel ? (
          <Text style={[styles.albumLabel, { color: palette.text2 }]} numberOfLines={2}>
            🎵 {avatarLabel}
          </Text>
        ) : (
          <Text style={[styles.sub, { color: palette.text2 }]}>
            Your name and avatar show up on RSVPs, ratings, and the member list.
          </Text>
        )}
      </View>

      <Card>
        <Label>Display name</Label>
        <TextField
          placeholder="e.g. Jordan"
          value={name}
          onChangeText={setName}
          autoFocus={!profile?.display_name}
          maxLength={40}
        />

        <Label>{'\n'}Profile picture</Label>
        <Text style={[styles.hint, { color: palette.text2 }]}>
          Search an album and tap its cover to use it as your picture.
        </Text>
        <TextField
          placeholder="Search albums…"
          value={query}
          onChangeText={runSearch}
          autoCapitalize="none"
        />
        {results.length > 0 ? (
          <View style={styles.results}>
            {results.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => pickCover(r)}
                style={({ pressed }) => [
                  styles.resultRow,
                  { borderColor: pressed ? palette.teal : palette.border },
                ]}
              >
                <Image
                  source={{ uri: r.artworkUrl }}
                  style={styles.resultArt}
                  contentFit="cover"
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.resultName, { color: palette.text1 }]} numberOfLines={1}>
                    {r.collectionName}
                  </Text>
                  <Text style={[styles.resultArtist, { color: palette.text2 }]} numberOfLines={1}>
                    {r.artistName}
                    {r.year ? ` · ${r.year}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {avatarUrl ? (
          <Button
            title="Remove picture (use a color)"
            variant="ghost"
            onPress={removeCover}
            style={{ marginTop: 4 }}
          />
        ) : null}

        {!avatarUrl ? (
          <>
            <Label>{'\n'}Avatar color</Label>
            <View style={styles.swatches}>
              {avatarColors.map((c, i) => (
                <Pressable
                  key={c.bg}
                  onPress={() => setColor(i)}
                  style={[
                    styles.swatch,
                    { backgroundColor: c.bg },
                    i === color && { borderColor: palette.text1, borderWidth: 2 },
                  ]}
                />
              ))}
            </View>
          </>
        ) : null}

        <Button title="Save" onPress={save} loading={busy} style={{ marginTop: 16 }} />
        {error ? <InlineNote text={error} tone="error" /> : null}
      </Card>

      <StreamingServiceCard />

      <PasswordCard />

      {userId ? <FeaturedTracksCard userId={userId} /> : null}
    </Screen>
  );
}

// Which service's "open in…" buttons show on songs and albums. Saves on tap
// (like the featured-track slots); 'both' is the default dual-pill behavior.
const SERVICE_OPTIONS: { value: PreferredService; label: string }[] = [
  { value: 'spotify', label: 'Spotify' },
  { value: 'apple', label: 'Apple Music' },
  { value: 'both', label: 'Both' },
];

function StreamingServiceCard() {
  const { palette } = useTheme();
  const { userId, profile, refreshProfile } = useAuthStore();
  const current = (profile?.preferred_service ?? 'both') as PreferredService;
  const [saving, setSaving] = useState(false);

  const choose = async (value: PreferredService) => {
    if (!userId || value === current || saving) return;
    setSaving(true);
    await profiles.update(userId, { preferred_service: value });
    await refreshProfile();
    setSaving(false);
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <Label>Streaming service</Label>
      <Text style={[styles.hint, { color: palette.text2 }]}>
        Song and album buttons open in the service you pick. If something isn’t
        on your service, the other one’s button shows instead.
      </Text>
      <View style={styles.serviceRow}>
        {SERVICE_OPTIONS.map((o) => {
          const active = o.value === current;
          return (
            <Pressable
              key={o.value}
              onPress={() => choose(o.value)}
              disabled={saving}
              style={[
                styles.serviceChip,
                { borderColor: active ? palette.teal : palette.border },
                active && { backgroundColor: palette.tealBg },
              ]}
            >
              <Text
                style={[
                  styles.serviceChipText,
                  { color: active ? palette.text1 : palette.text2 },
                ]}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

// Your three featured songs (global — they show on your profile in every club).
// One inline song search per slot, plus an optional caption. Saves immediately.
const SLOT_EMOJI: Record<TrackSlot, string> = { new: '✨', old: '📼', obsession: '🔁' };

function FeaturedTracksCard({ userId }: { userId: string }) {
  const { palette } = useTheme();
  const [tracks, setTracks] = useState<Record<string, ProfileTrack>>({});

  const reload = async () => {
    const { data } = await profileTracks.listByProfile(userId);
    const map: Record<string, ProfileTrack> = {};
    for (const t of (data ?? []) as ProfileTrack[]) map[t.slot] = t;
    setTracks(map);
  };

  useEffect(() => {
    reload();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card style={{ marginTop: 16 }}>
      <Label>Your 3 tracks</Label>
      <Text style={[styles.hint, { color: palette.text2 }]}>
        Three songs that say who you are right now. They show on your profile in every club.
      </Text>
      {TRACK_SLOTS.map((slot) => (
        <SlotEditor
          key={slot}
          userId={userId}
          slot={slot}
          track={tracks[slot] ?? null}
          onChange={reload}
        />
      ))}
    </Card>
  );
}

function SlotEditor({
  userId,
  slot,
  track,
  onChange,
}: {
  userId: string;
  slot: TrackSlot;
  track: ProfileTrack | null;
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongHit[]>([]);
  const [caption, setCaption] = useState(track?.caption ?? '');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    setCaption(track?.caption ?? '');
  }, [track?.caption]);

  // The note is "dirty" (needs saving) when it differs from what's stored.
  const noteDirty = (caption.trim() || '') !== (track?.caption ?? '');

  const runSearch = async (term: string) => {
    setQuery(term);
    const seq = ++searchSeq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
    const found = await searchSongs(term);
    if (seq === searchSeq.current) setResults(found);
  };

  const pick = async (hit: SongHit) => {
    setQuery('');
    setResults([]);
    await profileTracks.upsert({
      profile_id: userId,
      slot,
      track_name: hit.trackName,
      artist_name: hit.artistName,
      album_name: hit.albumName,
      artwork_url: hit.artworkUrl,
      spotify_url: hit.url,
      spotify_uri: hit.uri,
      caption: caption.trim() || null,
    });
    onChange();
  };

  const saveCaption = async () => {
    if (!track) return;
    setSavingNote(true);
    await profileTracks.upsert({
      profile_id: userId,
      slot,
      track_name: track.track_name,
      artist_name: track.artist_name,
      album_name: track.album_name,
      artwork_url: track.artwork_url,
      spotify_url: track.spotify_url,
      spotify_uri: track.spotify_uri,
      caption: caption.trim() || null,
    });
    setSavingNote(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
    onChange();
  };

  const clear = async () => {
    await profileTracks.clear(userId, slot);
    setCaption('');
    onChange();
  };

  return (
    <View style={styles.slot}>
      <Text style={[styles.slotLabel, { color: palette.text3 }]}>
        {SLOT_EMOJI[slot]} {TRACK_SLOT_LABELS[slot].toUpperCase()}
      </Text>

      {track ? (
        <View style={[styles.resultRow, { borderColor: palette.border }]}>
          <Image source={{ uri: track.artwork_url ?? undefined }} style={styles.resultArt} contentFit="cover" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.resultName, { color: palette.text1 }]} numberOfLines={1}>
              {track.track_name}
            </Text>
            <Text style={[styles.resultArtist, { color: palette.text2 }]} numberOfLines={1}>
              {track.artist_name}
            </Text>
          </View>
          <Pressable onPress={clear} hitSlop={10}>
            <Text style={{ color: palette.text3, fontFamily: fonts.sansMedium, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>
      ) : (
        <TextField
          placeholder="Search a song…"
          value={query}
          onChangeText={runSearch}
          autoCapitalize="none"
        />
      )}

      {results.length > 0 ? (
        <View style={styles.results}>
          {results.map((r, i) => (
            <Pressable
              key={`${r.trackName}-${i}`}
              onPress={() => pick(r)}
              style={({ pressed }) => [
                styles.resultRow,
                { borderColor: pressed ? palette.teal : palette.border },
              ]}
            >
              <Image source={{ uri: r.artworkUrl }} style={styles.resultArt} contentFit="cover" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.resultName, { color: palette.text1 }]} numberOfLines={1}>
                  {r.trackName}
                </Text>
                <Text style={[styles.resultArtist, { color: palette.text2 }]} numberOfLines={1}>
                  {r.artistName}
                  {r.albumName ? ` · ${r.albumName}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {track ? (
        <>
          <TextField
            placeholder="Why this one? (optional)"
            value={caption}
            onChangeText={(t) => {
              setCaption(t);
              setNoteSaved(false);
            }}
            onSubmitEditing={saveCaption}
            maxLength={140}
          />
          <Button
            title={noteSaved ? '✓ Note saved' : 'Save note'}
            variant="ghost"
            onPress={saveCaption}
            loading={savingNote}
            disabled={!noteDirty && !noteSaved}
            style={{ marginTop: 2 }}
          />
        </>
      ) : null}
    </View>
  );
}

// Optional: set a password so future sign-ins skip the emailed code. Initial
// sign-in is always the email code; this just adds the password path after.
function PasswordCard() {
  const { palette } = useTheme();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  const save = async () => {
    if (password.length < 8) {
      setNote({ text: 'Use at least 8 characters.', tone: 'error' });
      return;
    }
    setBusy(true);
    setNote(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setNote({ text: error.message, tone: 'error' });
      return;
    }
    setPassword('');
    setNote({ text: 'Password set — you can sign in with it next time.', tone: 'success' });
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <Label>Password (optional)</Label>
      <Text style={[styles.hint, { color: palette.text2 }]}>
        Set a password to sign in without waiting for an email code.
      </Text>
      <TextField
        placeholder="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        onSubmitEditing={save}
      />
      <Button
        title="Set password"
        variant="ghost"
        onPress={save}
        loading={busy}
        disabled={!password}
        style={{ marginTop: 10 }}
      />
      {note ? <InlineNote text={note.text} tone={note.tone} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  close: { fontFamily: fonts.sansMedium, fontSize: 22, paddingHorizontal: 4 },
  header: { alignItems: 'center', marginTop: 8, marginBottom: 20, gap: 10 },
  title: { fontFamily: fonts.sansBold, fontSize: 22 },
  sub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  albumLabel: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 300 },
  hint: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  swatches: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  serviceRow: { flexDirection: 'row', gap: 8 },
  serviceChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  serviceChipText: { fontFamily: fonts.sansMedium, fontSize: 13 },
  slot: { marginTop: 14, gap: 8 },
  slotLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.5 },
  results: { gap: 8, marginTop: 10 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resultArt: { width: 48, height: 48, borderRadius: radius.sm },
  resultName: { fontFamily: fonts.sansMedium, fontSize: 14 },
  resultArtist: { fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
});
