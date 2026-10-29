import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCoverStyle } from '@/ui/CollapsingHeader';
import { barWidth, Line } from '@/ui/Reveal';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/**
 * The top of a playlist / Liked Songs / album page: big art on an art-coloured gradient,
 * title, details, and the Shuffle / Play (and optional "…") buttons. A title or line that's
 * still loading (null) holds its place with a placeholder, so nothing under it moves when it comes.
 */
export function CollectionHeader({
  art,
  tint,
  title,
  lines,
  playing,
  onPlay,
  onShuffle,
  shuffleOn,
  onMore,
  onEdit,
  download,
  scrollY,
}: {
  art: ReactNode;
  tint: string;
  /** null: still loading. */
  title: string | null;
  /** Lines under the title ('': none; null: still loading). */
  lines: (string | null)[];
  playing: boolean;
  onPlay: () => void;
  /** The shuffle toggle (a dot under it while on); Play follows it. */
  onShuffle: () => void;
  shuffleOn?: boolean;
  onMore?: () => void;
  onEdit?: () => void;
  /** The download toggle (DownloadButton), next to Shuffle. */
  download?: ReactNode;
  /** The page's scroll position (useScrollY): the cover shrinks and fades as it scrolls. */
  scrollY?: SharedValue<number>;
}) {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const still = useSharedValue(0);
  const cover = useCoverStyle(scrollY ?? still);
  return (
    <View>
      <LinearGradient colors={[t.tint(tint), t.colors.bg]} style={{ paddingTop: insets.top + 56, paddingBottom: t.space.lg, alignItems: 'center' }}>
        <Animated.View style={[styles.artShadow, cover]}>{art}</Animated.View>
      </LinearGradient>
      <View style={{ paddingHorizontal: t.space.lg }}>
        {title === null ? (
          <Line variant="title" width="58%" />
        ) : (
          <T variant="title" numberOfLines={2}>
            {title}
          </T>
        )}
        {lines
          .filter((line) => line !== '')
          .map((line, i) => {
            const variant = i === 0 ? 'bodyStrong' : 'caption';
            const style = { marginTop: i === 0 ? t.space.sm : 2 };
            return line === null ? (
              <Line key={i} variant={variant} width={barWidth(i + 2, 20)} style={style} />
            ) : (
              <T key={i} variant={variant} style={style}>
                {line}
              </T>
            );
          })}
        <View style={styles.actions}>
          <Pressable
            hitSlop={8}
            onPress={onShuffle}
            accessibilityRole="switch"
            accessibilityState={{ checked: !!shuffleOn }}
            accessibilityLabel="Shuffle"
            style={{ alignItems: 'center' }}>
            <Ionicons name="shuffle" size={28} color={shuffleOn ? t.colors.accent : t.colors.textSecondary} />
            {shuffleOn ? <View style={styles.shuffleDot} /> : null}
          </Pressable>
          {download ? <View style={{ marginLeft: t.space.lg }}>{download}</View> : null}
          {onEdit ? (
            <Pressable hitSlop={8} onPress={onEdit} accessibilityLabel="Edit playlist" style={{ marginLeft: t.space.lg }}>
              <Ionicons name="pencil" size={22} color={t.colors.textSecondary} />
            </Pressable>
          ) : null}
          {onMore ? (
            <Pressable hitSlop={8} onPress={onMore} style={{ marginLeft: t.space.lg }}>
              <Ionicons name="ellipsis-horizontal" size={24} color={t.colors.textSecondary} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable onPress={onPlay} style={({ pressed }) => [styles.playBtn, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Ionicons name={playing ? 'pause' : 'play'} size={28} color="#000" style={{ marginLeft: playing ? 0 : 3 }} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  shuffleDot: { position: 'absolute', bottom: -6, width: 4, height: 4, borderRadius: 2, backgroundColor: t.colors.accent },
  artShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: t.space.md, marginBottom: t.space.sm },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/** Floating back button for pages without a header bar. */
export function BackButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={{
        position: 'absolute',
        top: insets.top + t.space.sm,
        left: t.space.md,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Ionicons name="chevron-back" size={24} color={t.colors.text} />
    </Pressable>
  );
}
