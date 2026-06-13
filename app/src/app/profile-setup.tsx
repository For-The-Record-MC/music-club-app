import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { avatarColors, fonts, radius } from '@/theme';
import { searchAlbums, type ItunesAlbum } from '@/utils/itunes';
import { supabase } from '@/utils/supabase/client';
import { profiles } from '@/utils/supabase/db';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Album cover search (iTunes — keyless, always works) for the profile picture.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItunesAlbum[]>([]);
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

  const pickCover = (album: ItunesAlbum) => {
    setAvatarUrl(album.artworkUrl);
    setAvatarLabel(`${album.collectionName} — ${album.artistName}`);
    setQuery('');
    setResults([]);
  };

  const removeCover = () => {
    setAvatarUrl(null);
    setAvatarLabel(null);
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
                key={r.collectionId}
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

      <PasswordCard />
    </Screen>
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
