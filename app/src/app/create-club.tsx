import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clubEmojis, fonts, radius } from '@/theme';
import { clubs } from '@/utils/supabase/db';

export default function CreateClub() {
  const { palette } = useTheme();
  const router = useRouter();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>('🎵');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) {
      setError('Give your club a name.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await clubs.create(name, emoji);
    setBusy(false);
    if (err || !data) {
      setError(err?.message ?? 'Could not create the club.');
      return;
    }
    router.replace(`/club/${data.id}`);
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()}>
        <Text style={[styles.back, { color: palette.text2 }]}>← back to clubs</Text>
      </Pressable>
      <View style={styles.header}>
        <Text style={styles.logo}>{emoji}</Text>
        <Text style={[styles.title, { color: palette.text1 }]}>New club</Text>
        <Text style={[styles.sub, { color: palette.text2 }]}>
          Name it, pick an emoji, then share the invite link with your people.
        </Text>
      </View>
      <Card>
        <Label>Club emoji</Label>
        <View style={styles.emojiGrid}>
          {clubEmojis.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEmoji(e)}
              style={[
                styles.emojiOpt,
                { backgroundColor: palette.card2, borderColor: palette.border },
                e === emoji && { borderColor: palette.teal, backgroundColor: palette.tealBg },
              ]}
            >
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <Label>{'\n'}Club name</Label>
        <TextField
          placeholder="e.g. Vinyl & Vino, The Record Room…"
          value={name}
          onChangeText={setName}
          maxLength={60}
          onSubmitEditing={create}
        />
        <Button title="Launch club 🎉" onPress={create} loading={busy} style={{ marginTop: 16 }} />
        {error ? <InlineNote text={error} tone="error" /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { fontFamily: fonts.mono, fontSize: 13, marginBottom: 20 },
  header: { alignItems: 'center', marginBottom: 22 },
  logo: { fontSize: 42, marginBottom: 12 },
  title: { fontFamily: fonts.sansBold, fontSize: 24, marginBottom: 6 },
  sub: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 320 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiOpt: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
