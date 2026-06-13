import { type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
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
  if (other) pills.push({ label: 'Open link', url: other, bg: palette.text3 });
  if (!pills.length) return null;
  return (
    <View style={[styles.listenRow, style]}>
      {pills.map((p) => (
        <Pressable
          key={p.label}
          onPress={() => Linking.openURL(p.url)}
          style={({ pressed }) => [styles.listenPill, { backgroundColor: p.bg, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.listenPillText}>▶ {p.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function TextField(props: TextInputProps) {
  const { palette } = useTheme();
  return (
    <TextInput
      placeholderTextColor={palette.text3}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: palette.card2,
          borderColor: palette.border,
          color: palette.text1,
        },
        props.style,
      ]}
    />
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
          Head to the Clubs tab and pick a club to see its {what}.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  listenPillText: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    color: '#fff',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 13,
    fontSize: 14,
    fontFamily: fonts.sans,
  },
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
