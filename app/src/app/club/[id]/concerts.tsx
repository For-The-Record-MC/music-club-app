import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useConcerts, type ConcertRow } from '@/hooks/useConcerts';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { confirmAsync } from '@/utils/confirm';
import { activity, concerts as concertsDb } from '@/utils/supabase/db';
import { fonts } from '@/theme';

export default function Concerts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { rows, refresh } = useConcerts(id);

  const [open, setOpen] = useState(false);
  const [artist, setArtist] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [price, setPrice] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!id || !userId || !artist.trim()) {
      setError('Artist name is required.');
      return;
    }
    if (date.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      setError('Date must be YYYY-MM-DD.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await concertsDb.create({
      club_id: id,
      added_by: userId,
      artist: artist.trim(),
      concert_date: date.trim() || null,
      venue: venue.trim() || null,
      price: price.trim() || null,
      ticket_url: ticketUrl.trim() || null,
      note: note.trim() || null,
    });
    if (!err && data) await activity.publish(id, 'concert_added', { artist: data.artist });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setArtist('');
    setDate('');
    setVenue('');
    setPrice('');
    setTicketUrl('');
    setNote('');
    setOpen(false);
    refresh();
  };

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>SHOWS WORTH SEEING</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎤 Concerts</Text>
        </View>
      </View>

      {!open ? (
        <Button title="+ Add a concert" onPress={() => setOpen(true)} style={{ marginBottom: 14 }} />
      ) : (
        <Card>
          <Label>Add a concert</Label>
          <View style={{ gap: 8 }}>
            <TextField placeholder="Artist / band" value={artist} onChangeText={setArtist} />
            <TextField placeholder="Date — YYYY-MM-DD (optional)" value={date} onChangeText={setDate} autoCapitalize="none" />
            <TextField placeholder="Venue & city (optional)" value={venue} onChangeText={setVenue} />
            <TextField placeholder="Ticket price (optional)" value={price} onChangeText={setPrice} />
            <TextField placeholder="Ticket link (optional)" value={ticketUrl} onChangeText={setTicketUrl} autoCapitalize="none" />
            <TextField placeholder="Notes (optional)" value={note} onChangeText={setNote} />
            <Button title="Add" onPress={add} loading={busy} />
            <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </View>
        </Card>
      )}

      {rows.length === 0 ? (
        <InlineNote text="No concerts yet — add a show and see who's in." />
      ) : (
        rows.map((c) => (
          <ConcertCard key={c.id} concert={c} userId={userId} onChange={refresh} />
        ))
      )}
    </Screen>
  );
}

function ConcertCard({
  concert,
  userId,
  onChange,
}: {
  concert: ConcertRow;
  userId: string | null;
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const interested = concert.concert_interest.some((i) => i.profile_id === userId);
  const count = concert.concert_interest.length;
  const canDelete = concert.added_by === userId;

  const toggle = async () => {
    if (!userId) return;
    await concertsDb.setInterest(concert.id, userId, !interested);
    onChange();
  };

  const remove = async () => {
    if (await confirmAsync('Remove concert', `Remove ${concert.artist}?`)) {
      await concertsDb.remove(concert.id);
      onChange();
    }
  };

  return (
    <Card>
      <View style={styles.cHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.cArtist, { color: palette.text1 }]}>{concert.artist}</Text>
          {concert.venue ? <Text style={[styles.cVenue, { color: palette.text2 }]}>{concert.venue}</Text> : null}
          <Text style={[styles.cMeta, { color: palette.text3 }]}>
            {concert.concert_date ?? 'Date TBA'}
            {concert.price ? ` · ${concert.price}` : ''}
          </Text>
        </View>
        {canDelete ? (
          <Pressable onPress={remove}>
            <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
          </Pressable>
        ) : null}
      </View>
      {concert.note ? <Text style={[styles.cNote, { color: palette.text2 }]}>{concert.note}</Text> : null}
      <View style={styles.cFooter}>
        <Pressable
          onPress={toggle}
          style={[
            styles.inBtn,
            { borderColor: palette.border, backgroundColor: palette.card2 },
            interested && { borderColor: palette.teal, backgroundColor: palette.tealBg },
          ]}
        >
          <Text style={[styles.inText, { color: interested ? palette.teal : palette.text3 }]}>
            {interested ? "✓ I'm in" : "I'm interested"}
          </Text>
        </Pressable>
        <Text style={[styles.cCount, { color: palette.text2 }]}>
          {count} interested
        </Text>
        {concert.ticket_url ? (
          <Pressable onPress={() => Linking.openURL(concert.ticket_url!)} style={{ marginLeft: 'auto' }}>
            <Text style={[styles.cTicket, { color: palette.amber, backgroundColor: palette.amberBg }]}>
              🎟 Tickets
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  cHead: { flexDirection: 'row', alignItems: 'flex-start' },
  cArtist: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 2 },
  cVenue: { fontFamily: fonts.sans, fontSize: 12, marginBottom: 2 },
  cMeta: { fontFamily: fonts.mono, fontSize: 11 },
  cNote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginTop: 8 },
  cFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  inBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  inText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  cCount: { fontFamily: fonts.sans, fontSize: 12 },
  cTicket: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden',
  },
});
