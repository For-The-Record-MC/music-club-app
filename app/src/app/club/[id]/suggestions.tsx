import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Card, InlineNote, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { timeAgo } from '@/utils/activityTemplates';
import { feed, type FeedPost } from '@/utils/supabase/db';
import { fonts } from '@/theme';

interface SuggestionRow extends FeedPost {
  profiles: { display_name: string | null; avatar_color: number } | null;
}

// The album-suggestion backlog — the picker draws from this when their spin
// comes up. Same posts as the feed, filtered to is_album_suggestion.
export default function Suggestions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { cycle } = useCycle(id);
  const [rows, setRows] = useState<SuggestionRow[]>([]);

  useEffect(() => {
    if (!id) return;
    feed.suggestions(id).then(({ data }) => setRows((data ?? []) as SuggestionRow[]));
  }, [id]);

  const isPicker = cycle?.picker_id === userId;

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>ALBUM SUGGESTIONS</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>💡 The Backlog</Text>
        </View>
      </View>

      {isPicker ? (
        <InlineNote text="Your spin! Draw from these when you pick this cycle's albums." tone="success" />
      ) : (
        <InlineNote text="Album ideas the club has suggested. Flag any feed post as a suggestion to add it here." />
      )}

      {rows.length === 0 ? (
        <InlineNote text="No suggestions yet." />
      ) : (
        rows.map((s) => (
          <Card key={s.id}>
            <View style={styles.row}>
              <Avatar name={s.profiles?.display_name ?? null} colorIndex={s.profiles?.avatar_color ?? 0} size={28} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.sTitle, { color: palette.text1 }]}>{s.title}</Text>
                {s.artist ? <Text style={[styles.sArtist, { color: palette.text2 }]}>{s.artist}</Text> : null}
                <Text style={[styles.sMeta, { color: palette.text3 }]}>
                  {s.profiles?.display_name ?? 'Someone'} · {timeAgo(s.created_at)}
                </Text>
              </View>
            </View>
            {s.note ? <Text style={[styles.sNote, { color: palette.text2 }]}>{s.note}</Text> : null}
            {s.url ? (
              <Pressable onPress={() => Linking.openURL(s.url!)}>
                <Text style={[styles.sLink, { color: palette.teal }]}>▶ Open link</Text>
              </Pressable>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sTitle: { fontFamily: fonts.sansBold, fontSize: 14 },
  sArtist: { fontFamily: fonts.sans, fontSize: 12 },
  sMeta: { fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  sNote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, fontStyle: 'italic', marginTop: 8 },
  sLink: { fontFamily: fonts.monoMedium, fontSize: 11, marginTop: 6 },
});
