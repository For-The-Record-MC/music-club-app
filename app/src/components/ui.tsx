import { type ReactNode, type RefObject, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
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
  const inner = (
    <View style={styles.pageInner}>{children}</View>
  );
  return scroll ? (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={[styles.pageContent, { paddingTop: insets.top + 20 }]}
      // Let the pull-to-refresh gesture work even when content is shorter than
      // the screen — without this, iOS won't bounce (and won't trigger refresh)
      // on sparse screens like an empty feed or a quiet activity list.
      alwaysBounceVertical={!!onRefresh}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.text2} />
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

type ButtonVariant = 'primary' | 'ghost' | 'danger';

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
        <ActivityIndicator size="small" color={c.fg} />
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
}: {
  apple?: string | null;
  spotify?: string | null;
  other?: string | null;
  style?: ViewStyle;
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
          onPress={() => Linking.openURL(p.url)}
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
