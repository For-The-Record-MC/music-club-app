import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useClubData } from '@/hooks/useClubData';
import { useAuthStore } from '@/stores/authStore';
import { fonts } from '@/theme';
import { cycles } from '@/utils/supabase/db';

type Phase = 'idle' | 'spinning' | 'done';

// The wheel. Randomness is server-side (spin_wheel RPC): the RPC creates the
// cycle and returns the picker; the spinner animation here is pure theater
// choreographed to land on that result.
export default function Wheel() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const { club, members, myRole } = useClubData(id);
  const [poolIds, setPoolIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [displayIdx, setDisplayIdx] = useState(0);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = myRole === 'owner' || myRole === 'admin';

  useEffect(() => {
    if (!id) return;
    cycles.pool(id).then(({ data }) => setPoolIds((data as string[] | null) ?? []));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  const pool = useMemo(
    () =>
      poolIds
        .map((pid) => members.find((m) => m.profile_id === pid))
        .filter((m) => !!m)
        .map((m) => ({
          profileId: m!.profile_id,
          name: m!.profiles?.display_name ?? '(no name)',
          color: m!.profiles?.avatar_color ?? 0,
        })),
    [poolIds, members],
  );

  const spin = async () => {
    if (!id || pool.length === 0) return;
    setError(null);
    const { data, error: err } = await cycles.spin(id);
    if (err || !data) {
      setError(err?.message ?? 'Spin failed.');
      return;
    }
    const winner = data.picker_id;
    setWinnerId(winner);
    setPhase('spinning');

    // Slot-machine deceleration that lands exactly on the winner.
    const winnerIdx = Math.max(0, pool.findIndex((p) => p.profileId === winner));
    const ticks = pool.length === 1 ? 8 : 24 + Math.floor(Math.random() * pool.length);
    const startIdx = (((winnerIdx - (ticks - 1)) % pool.length) + pool.length) % pool.length;
    let t = 0;
    const step = () => {
      setDisplayIdx((startIdx + t) % pool.length);
      t += 1;
      if (t < ticks) {
        const delay = 60 + 340 * Math.pow(t / ticks, 2.5);
        timer.current = setTimeout(step, delay);
      } else {
        setPhase('done');
      }
    };
    step();
  };

  const current = pool[displayIdx];
  const winner = pool.find((p) => p.profileId === winnerId);
  const iAmWinner = winnerId === userId;

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>
            {club ? club.name.toUpperCase() : ''}
          </Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎡 The Wheel</Text>
        </View>
      </View>

      <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
        {phase === 'idle' ? (
          <>
            <Text style={[styles.bigEmoji]}>🎡</Text>
            <Text style={[styles.spinTitle, { color: palette.text1 }]}>
              Who picks this cycle's albums?
            </Text>
            <Text style={[styles.spinSub, { color: palette.text2 }]}>
              {pool.length} member{pool.length === 1 ? '' : 's'} in the pool — anyone who
              picked in the last 3 cycles sits out.
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.bigEmoji]}>{phase === 'done' ? '🎉' : '🎡'}</Text>
            {current ? (
              <View style={styles.nameRow}>
                <Avatar name={current.name} colorIndex={current.color} size={44} />
                <Text style={[styles.spinName, { color: palette.text1 }]}>{current.name}</Text>
              </View>
            ) : null}
            {phase === 'done' && winner ? (
              <Text style={[styles.winnerNote, { color: palette.teal }]}>
                {iAmWinner ? 'You pick both albums this cycle!' : `${winner.name} picks both albums this cycle!`}
              </Text>
            ) : null}
          </>
        )}
      </Card>

      {phase === 'idle' ? (
        <>
          <Label>The pool</Label>
          <Card>
            {pool.map((p) => (
              <View key={p.profileId} style={styles.poolRow}>
                <Avatar name={p.name} colorIndex={p.color} size={30} />
                <Text style={[styles.poolName, { color: palette.text1 }]}>{p.name}</Text>
              </View>
            ))}
          </Card>
          {isAdmin ? (
            <Button title="SPIN THE WHEEL" onPress={spin} disabled={pool.length === 0} />
          ) : (
            <InlineNote text="Only club admins can spin the wheel." />
          )}
        </>
      ) : null}

      {phase === 'done' ? (
        <View style={{ gap: 8 }}>
          {iAmWinner || isAdmin ? (
            <Button title="Choose the albums →" onPress={() => router.replace(`/club/${id}/pick-albums`)} />
          ) : null}
          <Button title="Back to the club" variant="ghost" onPress={() => router.replace(`/club/${id}`)} />
        </View>
      ) : null}

      {error ? <InlineNote text={error} tone="error" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  bigEmoji: { fontSize: 54, marginBottom: 14 },
  spinTitle: { fontFamily: fonts.sansBold, fontSize: 18, marginBottom: 8, textAlign: 'center' },
  spinSub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 300 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spinName: { fontFamily: fonts.sansBold, fontSize: 24 },
  winnerNote: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1, marginTop: 14, textAlign: 'center' },
  poolRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  poolName: { fontFamily: fonts.sansMedium, fontSize: 14 },
});
