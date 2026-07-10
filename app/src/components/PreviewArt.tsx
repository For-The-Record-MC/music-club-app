import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { usePreviewPlayer } from '@/stores/previewPlayerStore';
import { resolveApplePreview } from '@/utils/itunes';

// Artwork thumbnail with a 30s-preview play button (SONG_PREVIEWS_PLAN.md).
// Drop-in replacement for the bare artwork <Image> on song rows: pass the
// row's existing art style (size + radius) through `style`. When the row has
// no preview_url it renders just the artwork — no dead controls. One preview
// plays app-wide at a time (see previewPlayerStore); `id` should be unique
// across surfaces, e.g. `bingo:${box.id}`.
export function PreviewArt({
  id,
  uri,
  previewUrl,
  title,
  artist,
  style,
  glyphSize = 12,
}: {
  id: string;
  uri?: string | null;
  previewUrl?: string | null;
  // Title/artist power the stale-URL refetch (Apple preview links rot
  // occasionally); omit them and a rotted link just stops silently.
  title?: string;
  artist?: string;
  style?: StyleProp<ViewStyle>;
  glyphSize?: number;
}) {
  const { palette } = useTheme();
  const playing = usePreviewPlayer((s) => s.playingId === id);
  const progress = usePreviewPlayer((s) => (s.playingId === id ? s.progress : 0));

  // Leaving the screen with this row's preview playing stops it.
  useEffect(
    () => () => {
      const s = usePreviewPlayer.getState();
      if (s.playingId === id) s.stop();
    },
    [id],
  );

  const art = uri ? (
    <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
  ) : (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.card2 }]} />
  );

  if (!previewUrl) return <View style={[style, styles.wrap]}>{art}</View>;

  const toggle = () => {
    const s = usePreviewPlayer.getState();
    if (playing) s.stop();
    else {
      s.play(
        id,
        previewUrl,
        title ? () => resolveApplePreview(title, artist ?? '') : undefined,
      );
    }
  };

  return (
    <Pressable onPress={toggle} hitSlop={4} style={[style, styles.wrap]}>
      {art}
      <View style={[styles.badge, { width: glyphSize * 2, height: glyphSize * 2, borderRadius: glyphSize }]}>
        <Text style={[styles.glyph, { fontSize: glyphSize }]}>{playing ? '❚❚' : '▶'}</Text>
      </View>
      {playing ? (
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: palette.teal }]}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  badge: {
    backgroundColor: 'rgba(8, 8, 8, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: '#fff', lineHeight: undefined },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(8, 8, 8, 0.35)',
  },
  progressFill: { height: 3 },
});
