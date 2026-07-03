import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

// The app's loading indicator: a vinyl record spinning on the platter. Drop-in
// replacement for ActivityIndicator — use size="small" inside buttons/rows and
// size="large" (default) for full-screen loading states.
export function SpinningRecord({
  size = 'large',
  color,
  style,
}: {
  size?: 'small' | 'large' | number;
  // Label color; defaults to the theme teal. Buttons pass their text color.
  color?: string;
  style?: ViewStyle;
}) {
  const { palette, isDark } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const px = typeof size === 'number' ? size : size === 'small' ? 20 : 44;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Fixed vinyl colors (a record is black in any theme); grooves need contrast
  // against the dark disc, so they don't come from the palette either.
  const disc = isDark ? '#161616' : '#1c1c1a';
  const groove = 'rgba(255,255,255,0.14)';
  const label = color ?? palette.teal;

  return (
    <Animated.View
      style={[
        styles.disc,
        { width: px, height: px, borderRadius: px / 2, backgroundColor: disc, transform: [{ rotate }] },
        style,
      ]}
    >
      <Ring pct={0.86} px={px} color={groove} />
      <Ring pct={0.68} px={px} color={groove} />
      <Ring pct={0.5} px={px} color={groove} />
      {/* An off-center notch on the label makes the rotation visible. */}
      <View style={[styles.label, sized(px * 0.34), { backgroundColor: label }]}>
        <View
          style={[
            styles.notch,
            {
              width: Math.max(2, px * 0.05),
              height: Math.max(2, px * 0.09),
              backgroundColor: disc,
              borderRadius: px,
            },
          ]}
        />
        <View style={[styles.hole, sized(Math.max(2, px * 0.07)), { backgroundColor: disc }]} />
      </View>
    </Animated.View>
  );
}

function Ring({ pct, px, color }: { pct: number; px: number; color: string }) {
  return (
    <View
      style={[
        styles.ring,
        sized(px * pct),
        { borderColor: color, borderWidth: StyleSheet.hairlineWidth },
      ]}
    />
  );
}

function sized(px: number) {
  return { width: px, height: px, borderRadius: px / 2 };
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute' },
  label: { alignItems: 'center', justifyContent: 'center' },
  notch: { position: 'absolute', top: '12%' },
  hole: {},
});
