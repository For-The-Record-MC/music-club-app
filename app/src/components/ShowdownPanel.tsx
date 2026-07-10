import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PreviewArt } from '@/components/PreviewArt';
import { SongSearchField, type PickedSong } from '@/components/SongSearchField';
import { ThemePanel } from '@/components/ThemePanel';
import { Avatar, BottomSheet, Button, Card, InlineNote, Label, ListenLinks } from '@/components/ui';
import { useShowdown } from '@/hooks/useShowdown';
import { useTheme } from '@/hooks/use-theme';
import { confirmAsync } from '@/utils/confirm';
import { showdown as showdownDb, type Cycle, type ShowdownEntry } from '@/utils/supabase/db';
import { fonts, radius, type Palette } from '@/theme';

// The Jukebox Showdown for a cycle: the theme, your one submission, the
// (anonymous, blind) field with your 2-up/1-down vote budget, and — once the
// cycle is revealed — the scored field with the crowned winner. Powers both the
// Feed "Showdown" segment and the dedicated theme route.
export function ShowdownPanel({
  cycle,
  cycleNumber,
}: {
  cycle: Cycle | null;
  cycleNumber?: number;
}) {
  const { palette } = useTheme();
  const { view, loading, refresh } = useShowdown(cycle?.id);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cycle) {
    return <InlineNote text="No active cycle — a Showdown opens when the wheel is spun." />;
  }
  if (loading) {
    return <InlineNote text="Loading the Showdown…" />;
  }
  if (!view) {
    return (
      <InlineNote text="No theme set this cycle yet. The picker (or an admin) sets one when they choose the albums." />
    );
  }

  const mine = view.submissions.find((s) => s.is_mine) ?? null;
  const others = view.submissions.filter((s) => !s.is_mine);

  const submitSong = async (song: PickedSong) => {
    setSheet(false);
    setBusy(true);
    setError(null);
    const { error: err } = await showdownDb.submit(view.showdown_id, {
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl,
      spotifyUrl: song.spotifyUrl,
      appleUrl: song.appleUrl,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    refresh();
  };

  const withdraw = async () => {
    if (!(await confirmAsync('Withdraw your song?', 'You can submit a different one while the cycle is open.'))) return;
    setBusy(true);
    setError(null);
    const { error: err } = await showdownDb.deleteSubmission(view.showdown_id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    refresh();
  };

  // Toggle a vote: tapping the active direction clears it, otherwise sets it.
  const vote = async (entry: ShowdownEntry, dir: 1 | -1) => {
    setError(null);
    const next = entry.my_vote === dir ? 0 : dir;
    const { error: err } = await showdownDb.vote(entry.id, next);
    if (err) {
      setError(err.message);
      return;
    }
    refresh();
  };

  return (
    <View style={{ gap: 14 }}>
      <ThemePanel theme={view.theme_text} subtitle={cycleNumber ? `Cycle ${cycleNumber}` : undefined} />

      {/* Your submission */}
      <Card>
        <Label>Your song</Label>
        {mine ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <SongRow entry={mine} palette={palette} />
            {!view.revealed ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Swap" variant="ghost" onPress={() => setSheet(true)} style={{ flex: 1 }} />
                <Button title="Withdraw" variant="danger" onPress={withdraw} loading={busy} style={{ flex: 1 }} />
              </View>
            ) : null}
            {!view.revealed ? (
              <InlineNote text="You can swap or withdraw until your song gets its first vote." />
            ) : null}
          </View>
        ) : view.revealed ? (
          <InlineNote text="You didn't submit a song this cycle." />
        ) : (
          <View style={{ gap: 8, marginTop: 8 }}>
            <InlineNote text="Submit one song that fits the theme. Voting is blind until the meeting." />
            <Button title="🎵 Submit your song" onPress={() => setSheet(true)} loading={busy} />
          </View>
        )}
        {error ? <InlineNote text={error} tone="error" /> : null}
      </Card>

      {/* The field */}
      {view.revealed ? (
        <RevealedField view={view} palette={palette} />
      ) : (
        <BlindField view={view} others={others} onVote={vote} palette={palette} />
      )}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)}>
        <Label>{mine ? 'Swap your song' : 'Submit your song'}</Label>
        <View style={{ marginTop: 10 }}>
          <SongSearchField onPick={submitSong} />
        </View>
      </BottomSheet>
    </View>
  );
}

// One song's artwork + title/artist + listen links. author shows only when the
// entry carries it (post-reveal, or the caller's own).
function SongRow({ entry, palette, rank }: { entry: ShowdownEntry; palette: Palette; rank?: number }) {
  return (
    <View style={styles.songRow}>
      {rank ? <Text style={[styles.rank, { color: palette.text3 }]}>{rank}</Text> : null}
      <PreviewArt
        id={`showdown:${entry.id}`}
        uri={entry.artwork_url}
        previewUrl={entry.preview_url}
        title={entry.title}
        artist={entry.artist}
        style={styles.art}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.songTitle, { color: palette.text1 }]}>{entry.title}</Text>
        <Text numberOfLines={1} style={[styles.songArtist, { color: palette.text2 }]}>{entry.artist}</Text>
        {entry.author_name ? (
          <View style={styles.authorRow}>
            <Avatar name={entry.author_name} colorIndex={entry.author_color ?? 0} imageUrl={entry.author_avatar} size={18} />
            <Text style={[styles.author, { color: palette.text3 }]}>{entry.author_name}</Text>
          </View>
        ) : null}
        <ListenLinks apple={entry.apple_url} spotify={entry.spotify_url} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

// Blind voting: anonymous field, your up/down controls, no scores. Self entry
// is shown in "Your song" above, so it's excluded here.
function BlindField({
  view,
  others,
  onVote,
  palette,
}: {
  view: NonNullable<ReturnType<typeof useShowdown>['view']>;
  others: ShowdownEntry[];
  onVote: (entry: ShowdownEntry, dir: 1 | -1) => void;
  palette: Palette;
}) {
  return (
    <Card>
      <View style={styles.fieldHead}>
        <Label>The field · {view.submission_count}</Label>
        <Text style={[styles.budget, { color: palette.text3 }]}>
          ▲ {view.up_remaining} left · ▼ {view.downvote_unlocked ? `${view.down_remaining} left` : 'locked'}
        </Text>
      </View>
      {others.length === 0 ? (
        <InlineNote text="No other songs yet. Check back as the club submits." />
      ) : (
        others.map((entry) => (
          <View key={entry.id} style={styles.voteRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <SongRow entry={entry} palette={palette} />
            </View>
            <View style={styles.voteBtns}>
              <Pressable
                onPress={() => onVote(entry, 1)}
                style={[
                  styles.voteBtn,
                  { borderColor: palette.border },
                  entry.my_vote === 1 && { borderColor: palette.teal, backgroundColor: palette.tealBg },
                ]}
              >
                <Text style={[styles.voteIcon, { color: entry.my_vote === 1 ? palette.teal : palette.text3 }]}>▲</Text>
              </Pressable>
              <Pressable
                onPress={() => view.downvote_unlocked && onVote(entry, -1)}
                disabled={!view.downvote_unlocked}
                style={[
                  styles.voteBtn,
                  { borderColor: palette.border },
                  !view.downvote_unlocked && { opacity: 0.35 },
                  entry.my_vote === -1 && { borderColor: palette.coral, backgroundColor: palette.coralBg },
                ]}
              >
                <Text style={[styles.voteIcon, { color: entry.my_vote === -1 ? palette.coral : palette.text3 }]}>▼</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
      <InlineNote text="🔒 Scores stay hidden until the meeting reveal." />
    </Card>
  );
}

// Post-reveal: scored field, sorted by net score, winner crowned.
function RevealedField({
  view,
  palette,
}: {
  view: NonNullable<ReturnType<typeof useShowdown>['view']>;
  palette: Palette;
}) {
  const ranked = [...view.submissions].sort((a, b) => (b.net_score ?? 0) - (a.net_score ?? 0));
  return (
    <Card>
      <Label>Results</Label>
      {ranked.map((entry, i) => {
        const isWinner = entry.id === view.winner_submission_id;
        return (
          <View
            key={entry.id}
            style={[styles.resultRow, isWinner && { backgroundColor: palette.tealBg, borderColor: palette.teal, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md }]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <SongRow entry={entry} palette={palette} rank={i + 1} />
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              {isWinner ? <Text style={styles.trophy}>🏆</Text> : null}
              <Text style={[styles.score, { color: palette.text1 }]}>
                {(entry.net_score ?? 0) > 0 ? '+' : ''}{entry.net_score ?? 0}
              </Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  songRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rank: { fontFamily: fonts.monoMedium, fontSize: 13, width: 18, paddingTop: 12 },
  art: { width: 48, height: 48, borderRadius: radius.sm },
  songTitle: { fontFamily: fonts.sansMedium, fontSize: 15 },
  songArtist: { fontFamily: fonts.sans, fontSize: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  author: { fontFamily: fonts.mono, fontSize: 11 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  budget: { fontFamily: fonts.monoMedium, fontSize: 12 },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  voteBtns: { gap: 6 },
  voteBtn: { width: 40, height: 32, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  voteIcon: { fontFamily: fonts.sansBold, fontSize: 14 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 6 },
  trophy: { fontSize: 18 },
  score: { fontFamily: fonts.monoMedium, fontSize: 16 },
});
