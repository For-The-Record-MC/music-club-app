import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpinningRecord } from '@/components/SpinningRecord';
import { useTheme } from '@/hooks/use-theme';
import { avatarColors, fonts, radius } from '@/theme';

// Shared primitives ported from the MVP's visual language (legacy/index.html):
// cards with hairline borders, mono eyebrow labels, pill badges, initial avatars.

export function Screen({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  scrollRef,
}: {
  children: ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  // iOS sometimes fails to remove the keyboard content inset on dismiss
  // (swipe-down, screen transitions), leaving a keyboard-sized scrollable
  // void below the content. Only apply the automatic inset while the keyboard
  // is actually up so a stale inset can never linger.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const inner = (
    <View style={styles.pageInner}>
      {refreshing ? (
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <SpinningRecord size={28} />
        </View>
      ) : null}
      {children}
    </View>
  );
  return scroll ? (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={[styles.pageContent, { paddingTop: insets.top + 20 }]}
      // Without this, a tap on an inline search result (profile tracks, album
      // cover, concert search) is swallowed to dismiss the keyboard instead of
      // registering — the row feels "unclickable" until you tap twice.
      keyboardShouldPersistTaps="handled"
      // Inset the scroll view for the software keyboard (iOS) so a text field near
      // the bottom scrolls above the keyboard instead of being hidden behind it.
      automaticallyAdjustKeyboardInsets={keyboardOpen}
      // Let the pull-to-refresh gesture work even when content is shorter than
      // the screen — without this, iOS won't bounce (and won't trigger refresh)
      // on sparse screens like an empty feed or a quiet activity list.
      alwaysBounceVertical={!!onRefresh}
      refreshControl={
        onRefresh ? (
          // iOS can't swap a custom view into RefreshControl, so the native
          // spinner is hidden and the SpinningRecord above the content is the
          // visible "refreshing" indicator instead. Android keeps its material
          // control (tinted teal) — hiding it there leaves no pull affordance.
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={[palette.teal]}
          />
        ) : undefined
      }
    >
      {inner}
    </ScrollView>
  ) : (
    <View
      style={[
        { flex: 1, backgroundColor: palette.bg },
        styles.pageContent,
        { paddingTop: insets.top + 20 },
      ]}
    >
      {inner}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.card, borderColor: palette.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return <Text style={[styles.label, { color: palette.teal }]}>{children}</Text>;
}

type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();
  const colors: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: palette.teal, fg: palette.tealDark },
    accent: { bg: palette.purpleBg, fg: palette.purple, border: palette.purple },
    ghost: { bg: 'transparent', fg: palette.text2, border: palette.border },
    danger: { bg: palette.coralBg, fg: palette.coral, border: palette.coral },
  };
  const c = colors[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: c.bg,
          borderColor: c.border ?? 'transparent',
          borderWidth: c.border ? StyleSheet.hairlineWidth : 0,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <SpinningRecord size="small" color={c.fg} />
      ) : (
        <Text style={[styles.btnText, { color: c.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

// Brand-colored "open in…" pill buttons. A post/album can carry an Apple Music
// and/or Spotify link (the search picker resolves both); `other` is the generic
// fallback for a manually pasted link. Renders nothing when all are absent.
export function ListenLinks({
  apple,
  spotify,
  other,
  style,
  onOpen,
}: {
  apple?: string | null;
  spotify?: string | null;
  other?: string | null;
  style?: ViewStyle;
  // Fired just before the link-out — Listening Bingo stamps its listen timer here.
  onOpen?: () => void;
}) {
  const { palette } = useTheme();
  const pills: { label: string; url: string; bg: string }[] = [];
  if (spotify) pills.push({ label: 'Spotify', url: spotify, bg: palette.spotify });
  if (apple) pills.push({ label: 'Apple Music', url: apple, bg: palette.apple });
  if (other) pills.push({ label: 'Open link', url: other, bg: palette.text2 });
  if (!pills.length) return null;
  return (
    <View style={[styles.listenRow, style]}>
      {pills.map((p) => (
        <Pressable
          key={p.label}
          onPress={() => {
            onOpen?.();
            Linking.openURL(p.url);
          }}
          style={({ pressed }) => [styles.listenPill, { backgroundColor: p.bg }, pressed && styles.listenPillPressed]}
        >
          <View style={styles.listenPlay}>
            <Text style={[styles.listenPlayIcon, { color: p.bg }]}>▶</Text>
          </View>
          <Text style={styles.listenPillText}>{p.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function TextField(props: TextInputProps) {
  const { palette } = useTheme();
  const [revealed, setRevealed] = useState(false);

  // Password fields get a Show/Hide toggle so the member can confirm what they
  // typed. When revealed we drop secureTextEntry (and the toggle is only shown
  // when the caller asked for a secure field).
  const secure = !!props.secureTextEntry;
  const field = (
    <TextInput
      placeholderTextColor={palette.text3}
      {...props}
      secureTextEntry={secure && !revealed}
      style={[
        styles.input,
        {
          backgroundColor: palette.card2,
          borderColor: palette.border,
          color: palette.text1,
        },
        secure && { paddingRight: 58 },
        props.style,
      ]}
    />
  );

  if (!secure) return field;
  return (
    <View>
      {field}
      <Pressable
        onPress={() => setRevealed((r) => !r)}
        hitSlop={8}
        style={styles.revealToggle}
      >
        <Text style={[styles.revealText, { color: palette.text2 }]}>
          {revealed ? 'Hide' : 'Show'}
        </Text>
      </Pressable>
    </View>
  );
}

// A touch slider for decimal scores (1.0–10.0 in 0.1 steps by default). Works
// on web and native via PanResponder. `value === null` means "not set yet" — the
// thumb is hidden and the readout shows a dash until the member touches it.
export function Slider({
  value,
  onChange,
  min = 1,
  max = 10,
  step = 0.1,
  disabled = false,
  accent,
}: {
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  accent?: string;
}) {
  const { palette } = useTheme();
  const color = accent ?? palette.teal;
  const decimals = step < 1 ? 1 : 0;
  const widthRef = useRef(0);
  // Grow the thumb while dragging so it's easy to grab and less likely to slip
  // into the screen's edge-swipe (which would navigate back mid-drag).
  const [dragging, setDragging] = useState(false);

  const setFromX = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / w));
    const raw = min + ratio * (max - min);
    const snapped = Math.round((raw - min) / step) * step + min;
    const factor = 10 ** decimals;
    onChange(Math.round(snapped * factor) / factor);
  };

  // Keep the latest callback/disabled in refs so the once-created PanResponder
  // never reads stale closures.
  const setFromXRef = useRef(setFromX);
  setFromXRef.current = setFromX;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      // Once we've claimed the drag, don't let a parent (scroll view, the
      // screen's back-swipe) steal it out from under us.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        setDragging(true);
        setFromXRef.current(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => setFromXRef.current(e.nativeEvent.locationX),
      onPanResponderRelease: () => setDragging(false),
      onPanResponderTerminate: () => setDragging(false),
    }),
  ).current;

  // Track height is 28; keep the thumb vertically centered as it grows.
  const thumbSize = dragging ? 30 : 20;

  const ratio = value == null ? 0 : (value - min) / (max - min);
  return (
    <View style={{ gap: 8, opacity: disabled ? 0.5 : 1 }}>
      <View style={styles.sliderHead}>
        <Text style={[styles.sliderValue, { color }]}>
          {value == null ? '—' : value.toFixed(decimals)}
        </Text>
        <Text style={[styles.sliderMax, { color: palette.text3 }]}>/ {max}</Text>
      </View>
      <View
        {...responder.panHandlers}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        style={[styles.sliderTrack, { backgroundColor: palette.card2, borderColor: palette.border }]}
      >
        <View
          pointerEvents="none"
          style={[styles.sliderFill, { width: `${ratio * 100}%`, backgroundColor: color }]}
        />
        {value != null ? (
          <View
            pointerEvents="none"
            style={[
              styles.sliderThumb,
              {
                left: `${ratio * 100}%`,
                width: thumbSize,
                height: thumbSize,
                borderRadius: thumbSize / 2,
                top: (28 - thumbSize) / 2,
                transform: [{ translateX: -thumbSize / 2 }],
                borderColor: color,
                backgroundColor: palette.card,
              },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

export function Avatar({
  name,
  colorIndex,
  size = 36,
  imageUrl,
}: {
  name: string | null;
  colorIndex: number;
  size?: number;
  // When set (e.g. an album cover the member chose), render the image instead
  // of the initials-on-color fallback.
  imageUrl?: string | null;
}) {
  const c = avatarColors[((colorIndex % 7) + 7) % 7];
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg }}
      />
    );
  }
  const initials = (name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: size * 0.32, color: c.fg }}>
        {initials}
      </Text>
    </View>
  );
}

export function Badge({
  text,
  color,
  bg,
}: {
  text: string;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export function InlineNote({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'error' | 'success' }) {
  const { palette } = useTheme();
  const color = tone === 'error' ? palette.coral : tone === 'success' ? palette.teal : palette.text3;
  return <Text style={[styles.note, { color }]}>{text}</Text>;
}

// Full-width loading state for screens: a spinning record on the platter.
// Use in place of "Loading…" text while a screen's data is in flight.
export function Loading({ label }: { label?: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, gap: 14 }}>
      <SpinningRecord />
      {label ? <Text style={[styles.note, { color: palette.text3 }]}>{label}</Text> : null}
    </View>
  );
}

// Shown on a club tab when no club is selected yet.
export function NoClubSelected({ what }: { what: string }) {
  const { palette } = useTheme();
  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingVertical: 60 }}>
        <Text style={{ fontSize: 44, marginBottom: 14 }}>💿</Text>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: palette.text1, marginBottom: 6 }}>
          No club selected
        </Text>
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            lineHeight: 20,
            color: palette.text2,
            textAlign: 'center',
            maxWidth: 280,
          }}
        >
          Pick a club from the menu at the top of Home to see its {what}.
        </Text>
      </View>
    </Screen>
  );
}

// A bottom-anchored modal sheet with a dimmed, tap-to-dismiss backdrop.
// Used by the club switcher; kept generic for reuse.
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        {/* Inner Pressable absorbs taps so they don't dismiss the sheet. */}
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: palette.surface, borderColor: palette.border, paddingBottom: insets.bottom + 16 },
          ]}
          onPress={() => {}}
        >
          <View style={[styles.sheetGrabber, { backgroundColor: palette.border2 }]} />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  sheetGrabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  pageContent: {
    paddingHorizontal: 14,
    paddingBottom: 60,
  },
  pageInner: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  btn: {
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  btnText: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
  },
  listenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  listenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 22,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
  },
  listenPillPressed: { opacity: 0.85 },
  listenPlay: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listenPlayIcon: { fontSize: 9, marginLeft: 1 },
  listenPillText: {
    fontFamily: fonts.sansBold,
    fontSize: 12.5,
    color: '#fff',
    letterSpacing: 0.2,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 13,
    fontSize: 14,
    fontFamily: fonts.sans,
  },
  sliderHead: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  sliderValue: { fontFamily: fonts.sansBold, fontSize: 24 },
  sliderMax: { fontFamily: fonts.monoMedium, fontSize: 12 },
  sliderTrack: {
    height: 28,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'visible',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.lg,
    opacity: 0.35,
  },
  sliderThumb: {
    position: 'absolute',
    top: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    transform: [{ translateX: -10 }],
  },
  revealToggle: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  revealText: { fontFamily: fonts.sansMedium, fontSize: 12 },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  note: {
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 8,
  },
});
