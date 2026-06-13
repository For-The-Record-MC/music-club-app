import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useCycle } from '@/hooks/useCycle';
import { useTheme } from '@/hooks/use-theme';
import { fonts } from '@/theme';
import { activity, cycles } from '@/utils/supabase/db';

// Admin sets the cycle's meeting: a true date+time (calendar-ready) plus a
// free-text location.
export default function Schedule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const { cycle, loading } = useCycle(id);
  const [when, setWhen] = useState<Date | null>(null);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cycle) {
      setWhen(cycle.meeting_at ? new Date(cycle.meeting_at) : null);
      setLocation(cycle.meeting_time_location ?? '');
    }
  }, [cycle]);

  const save = async () => {
    if (!cycle) return;
    setBusy(true);
    setError(null);
    const { error: err } = await cycles.scheduleMeeting(
      cycle.id,
      when ? when.toISOString() : null,
      location.trim() || null,
    );
    if (!err && id) {
      await activity.publish(id, 'meeting_scheduled', {
        cycle_number: cycle.number,
        meeting_date: when
          ? when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : null,
      });
    }
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace('/home');
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
          <Label>Date & time</Label>
          <DateTimeField value={when} onChange={setWhen} />
          <Label>{'\n'}Location</Label>
          <TextField
            placeholder="e.g. Mia's place · 123 Main St"
            value={location}
            onChangeText={setLocation}
            onSubmitEditing={save}
          />
          <Button title="Save meeting" onPress={save} loading={busy} style={{ marginTop: 16 }} />
          {when ? (
            <Text style={[styles.preview, { color: palette.text3 }]}>
              {when.toLocaleString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          ) : null}
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
  preview: { fontFamily: fonts.mono, fontSize: 11, marginTop: 10, textAlign: 'center' },
});
