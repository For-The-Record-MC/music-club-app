import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { avatarColors, fonts } from '@/theme';
import { profiles } from '@/utils/supabase/db';

// First-run (and later editable) profile: display name + avatar color.
export default function ProfileSetup() {
  const { palette } = useTheme();
  const router = useRouter();
  const { userId, profile, refreshProfile } = useAuthStore();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [color, setColor] = useState(profile?.avatar_color ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <View style={styles.header}>
        <Avatar name={name || null} colorIndex={color} size={64} />
        <Text style={[styles.title, { color: palette.text1 }]}>
          {profile?.display_name ? 'Edit profile' : 'Welcome! Who are you?'}
        </Text>
        <Text style={[styles.sub, { color: palette.text2 }]}>
          Your name and color show up on RSVPs, ratings, and the member list.
        </Text>
      </View>
      <Card>
        <Label>Display name</Label>
        <TextField
          placeholder="e.g. Jordan"
          value={name}
          onChangeText={setName}
          autoFocus={!profile?.display_name}
          maxLength={40}
          onSubmitEditing={save}
        />
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
        <Button title="Save" onPress={save} loading={busy} style={{ marginTop: 16 }} />
        {error ? <InlineNote text={error} tone="error" /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: 24, marginBottom: 20, gap: 10 },
  title: { fontFamily: fonts.sansBold, fontSize: 22 },
  sub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  swatches: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  swatch: { width: 36, height: 36, borderRadius: 18 },
});
