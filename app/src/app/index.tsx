import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';
import { db } from '@/utils/supabase/db';

type ConnState = 'checking' | 'connected' | 'unreachable';

// Phase 0 scaffold screen — proves theme, fonts, routing, and Supabase
// connectivity end-to-end. Replaced by the lobby in Phase 1.
export default function Index() {
  const { palette } = useTheme();
  const [conn, setConn] = useState<ConnState>('checking');

  useEffect(() => {
    let cancelled = false;
    db.ping().then((ok) => {
      if (!cancelled) setConn(ok ? 'connected' : 'unreachable');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const connColor =
    conn === 'connected' ? palette.teal : conn === 'unreachable' ? palette.coral : palette.amber;
  const connBg =
    conn === 'connected' ? palette.tealBg : conn === 'unreachable' ? palette.coralBg : palette.amberBg;

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <Text style={[styles.eyebrow, { color: palette.text3 }]}>LISTENING CLUBS</Text>
        <Text style={[styles.title, { color: palette.text1 }]}>Vinyl &amp; Vino</Text>
        <Text style={[styles.sub, { color: palette.text2 }]}>
          Phase 0 scaffold — Expo + Supabase wired up. The lobby arrives in Phase 1.
        </Text>
        <View style={[styles.pill, { backgroundColor: connBg }]}>
          <Text style={[styles.pillText, { color: connColor }]}>
            {conn === 'checking' && 'CHECKING SUPABASE…'}
            {conn === 'connected' && '● SUPABASE CONNECTED'}
            {conn === 'unreachable' && '● SUPABASE UNREACHABLE'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: 24,
  },
  eyebrow: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 2.5,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 26,
    marginBottom: 8,
  },
  sub: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 1,
  },
});
