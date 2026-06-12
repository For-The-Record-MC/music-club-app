import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { fonts } from '@/theme';
import { clubs } from '@/utils/supabase/db';

// Manual invite-code entry (invite links land on /join/[code] instead).
export default function JoinClub() {
  const { palette } = useTheme();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await clubs.join(code);
    setBusy(false);
    if (err || !data) {
      setError(err?.message ?? 'Could not join.');
      return;
    }
    router.replace(`/club/${data.id}`);
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()}>
        <Text style={[styles.back, { color: palette.text2 }]}>← back to clubs</Text>
      </Pressable>
      <Card>
        <Label>Join a club</Label>
        <Text style={[styles.sub, { color: palette.text2 }]}>
          Enter the 8-character invite code from your club's invite link.
        </Text>
        <TextField
          placeholder="e.g. KX7PQ2MN"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={8}
          onSubmitEditing={join}
        />
        <Button
          title="Join club"
          onPress={join}
          loading={busy}
          disabled={code.trim().length !== 8}
          style={{ marginTop: 12 }}
        />
        {error ? <InlineNote text={error} tone="error" /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { fontFamily: fonts.mono, fontSize: 13, marginBottom: 20 },
  sub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginBottom: 12 },
});
