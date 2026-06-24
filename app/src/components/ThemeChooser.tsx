import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemePanel } from '@/components/ThemePanel';
import { Button, Card, InlineNote, Label, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { showdown as showdownDb, type Showdown, type ShowdownThemeIdea } from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

type ReelPhase = 'idle' | 'spinning' | 'done';

// The Jukebox Showdown theme picker, shown in pick-albums. The picker (or an
// admin) sets the cycle's theme by spinning the reel, choosing from the unused
// idea pool, or typing their own. Commits via set_showdown_theme.
export function ThemeChooser({ clubId, cycleId }: { clubId: string; cycleId: string }) {
  const { palette } = useTheme();
  const [current, setCurrent] = useState<Showdown | null>(null);
  const [ideas, setIdeas] = useState<ShowdownThemeIdea[]>([]);
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reel state.
  const [phase, setPhase] = useState<ReelPhase>('idle');
  const [displayIdx, setDisplayIdx] = useState(0);
  const [landed, setLanded] = useState<ShowdownThemeIdea | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    const [{ data: sd }, { data: pool }] = await Promise.all([
      showdownDb.forCycle(cycleId),
      showdownDb.ideas(clubId),
    ]);
    setCurrent((sd as Showdown | null) ?? null);
    setIdeas((pool as ShowdownThemeIdea[] | null) ?? []);
  };

  useEffect(() => {
    load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, cycleId]);

  const commit = async (text: string, ideaId?: string | null) => {
    setBusy(true);
    setError(null);
    const { error: err } = await showdownDb.setTheme(cycleId, text, ideaId ?? null);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditing(false);
    setPhase('idle');
    setLanded(null);
    setCustom('');
    load();
  };

  const spin = async () => {
    setError(null);
    const { data, error: err } = await showdownDb.spinTheme(clubId);
    if (err || !data) {
      setError(err?.message ?? 'No themes left to spin.');
      return;
    }
    const result = data as ShowdownThemeIdea;
    setLanded(result);
    setPhase('spinning');
    // Slot-machine deceleration that lands on the server-chosen idea.
    const labels = ideas.length ? ideas : [result];
    const winnerIdx = Math.max(0, labels.findIndex((i) => i.id === result.id));
    const ticks = labels.length === 1 ? 8 : 20 + Math.floor(Math.random() * labels.length);
    const startIdx = (((winnerIdx - (ticks - 1)) % labels.length) + labels.length) % labels.length;
    let t = 0;
    const step = () => {
      setDisplayIdx((startIdx + t) % labels.length);
      t += 1;
      if (t < ticks) {
        timer.current = setTimeout(step, 60 + 340 * Math.pow(t / ticks, 2.5));
      } else {
        setPhase('done');
      }
    };
    step();
  };

  const reelLabels = ideas.length ? ideas : landed ? [landed] : [];
  const reelText = phase === 'done' ? landed?.text : reelLabels[displayIdx]?.text;

  // Already set, not editing: show the theme + a change affordance.
  if (current && !editing) {
    return (
      <View style={{ gap: 10 }}>
        <ThemePanel theme={current.theme_text} />
        <Button title="Change the theme" variant="ghost" onPress={() => setEditing(true)} />
      </View>
    );
  }

  return (
    <Card>
      <Label>{current ? 'Change the Showdown theme' : 'Set the Showdown theme'}</Label>
      <Text style={[styles.hint, { color: palette.text3 }]}>
        Each cycle has an optional song contest. Set its theme — or skip it.
      </Text>

      {/* The reel */}
      <View style={[styles.reel, { backgroundColor: palette.purpleBg, borderColor: palette.purple }]}>
        <Text style={[styles.reelEyebrow, { color: palette.purple }]}>🎰 SPIN THE JUKEBOX</Text>
        <View style={[styles.reelSlot, { backgroundColor: palette.surface, borderColor: palette.purple }]}>
          <Text numberOfLines={2} style={[styles.reelText, { color: palette.text1 }]}>
            {reelText ?? '—'}
          </Text>
        </View>
        {phase === 'done' && landed ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Spin again" variant="ghost" onPress={spin} style={{ flex: 1 }} />
            <Button title="Use this theme" onPress={() => commit(landed.text, landed.id)} loading={busy} style={{ flex: 1 }} />
          </View>
        ) : (
          <Button
            title={phase === 'spinning' ? 'Spinning…' : '🎰 Spin'}
            onPress={spin}
            disabled={phase === 'spinning' || ideas.length === 0}
          />
        )}
      </View>

      {/* Pool list */}
      {ideas.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <Text style={[styles.subLabel, { color: palette.text3 }]}>OR PICK FROM THE POOL</Text>
          {ideas.slice(0, 12).map((idea) => (
            <Pressable
              key={idea.id}
              onPress={() => commit(idea.text, idea.id)}
              style={({ pressed }) => [styles.poolRow, { borderColor: palette.border }, pressed && { backgroundColor: palette.card2 }]}
            >
              <Text style={[styles.poolText, { color: palette.text1 }]}>{idea.text}</Text>
              {idea.club_id === null ? (
                <Text style={[styles.seedTag, { color: palette.text3 }]}>seed</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Custom */}
      <View style={{ marginTop: 12, gap: 8 }}>
        <Text style={[styles.subLabel, { color: palette.text3 }]}>OR WRITE YOUR OWN</Text>
        <TextField
          placeholder="e.g. Songs with a question in the title"
          value={custom}
          onChangeText={setCustom}
        />
        <Button title="Set this theme" onPress={() => commit(custom.trim())} loading={busy} disabled={custom.trim().length === 0} />
      </View>

      {current ? <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} /> : null}
      {error ? <InlineNote text={error} tone="error" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 10 },
  reel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: 14, gap: 10 },
  reelEyebrow: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1 },
  reelSlot: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: 18, paddingHorizontal: 12, alignItems: 'center' },
  reelText: { fontFamily: fonts.sansBold, fontSize: 18, textAlign: 'center', lineHeight: 24 },
  subLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, marginBottom: 6 },
  poolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 11, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, marginBottom: 6 },
  poolText: { fontFamily: fonts.sansMedium, fontSize: 14, flex: 1 },
  seedTag: { fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase' },
});
