import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useCycle } from '@/hooks/useCycle';
import { useTheme } from '@/hooks/use-theme';
import { fonts } from '@/theme';
import { activity, cycles } from '@/utils/supabase/db';

// Admin sets the cycle's meeting (one meeting per cycle, host-set dates).
export default function Schedule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const { cycle, loading } = useCycle(id);
  const [date, setDate] = useState('');
  const [timeLocation, setTimeLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cycle) {
      setDate(cycle.meeting_date ?? '');
      setTimeLocation(cycle.meeting_time_location ?? '');
    }
  }, [cycle]);

  const save = async () => {
    if (!cycle) return;
    const trimmed = date.trim();
    if (trimmed && !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      setError('Date must be YYYY-MM-DD (e.g. 2026-07-12).');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await cycles.scheduleMeeting(
      cycle.id,
      trimmed || null,
      timeLocation.trim() || null,
    );
    if (!err && id) {
      await activity.publish(id, 'meeting_scheduled', {
        cycle_number: cycle.number,
        meeting_date: trimmed || null,
      });
    }
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace(`/club/${id}`);
  };

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>
            {cycle ? `CYCLE ${cycle.number}` : ''}
          </Text>
          <Text style={[styles.title, { color: palette.text1 }]}>Schedule the meeting</Text>
        </View>
      </View>
      {!cycle && !loading ? (
        <InlineNote text="No open cycle — spin the wheel first." />
      ) : (
        <Card>
          <Label>Meeting date</Label>
          <TextField
            placeholder="YYYY-MM-DD (e.g. 2026-07-12)"
            value={date}
            onChangeText={setDate}
            autoCorrect={false}
          />
          <Label>{'\n'}Time & location</Label>
          <TextField
            placeholder="e.g. 7:00 PM · Mia's place"
            value={timeLocation}
            onChangeText={setTimeLocation}
            onSubmitEditing={save}
          />
          <Button title="Save meeting" onPress={save} loading={busy} style={{ marginTop: 16 }} />
          {error ? <InlineNote text={error} tone="error" /> : null}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
});
