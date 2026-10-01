import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/**
 * The top of a playlist / Liked Songs / album page: big art on an art-coloured gradient,
 * title, details, and the Shuffle / Play (and optional "…") buttons.
 */
export function CollectionHeader({
  art,
  tint,
  title,
  lines,
  playing,
  onPlay,
  onShuffle,
  onMore,
  onEdit,
}: {
  art: ReactNode;
  tint: string;
  title: string;
  lines: string[];
  playing: boolean;
  onPlay: () => void;
  onShuffle: () => void;
  onMore?: () => void;
  onEdit?: () => void;
}) {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View>
      <LinearGradient colors={[tint, t.colors.bg]} style={{ paddingTop: insets.top + 56, paddingBottom: t.space.lg, alignItems: 'center' }}>
        <View style={styles.artShadow}>{art}</View>
      </LinearGradient>
      <View style={{ paddingHorizontal: t.space.lg }}>
        <T variant="title" numberOfLines={2}>
          {title}
        </T>
        {lines.filter(Boolean).map((line, i) => (
          <T key={i} variant={i === 0 ? 'bodyStrong' : 'caption'} style={{ marginTop: i === 0 ? t.space.sm : 2 }}>
            {line}
          </T>
        ))}
        <View style={styles.actions}>
          <Pressable hitSlop={8} onPress={onShuffle}>
            <Ionicons name="shuffle" size={28} color={t.colors.textSecondary} />
          </Pressable>
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
