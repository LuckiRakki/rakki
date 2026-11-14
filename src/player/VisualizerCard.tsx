import { router } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { Ionicons } from '@/ui/Icon';
import { SoundGraph } from '@/ui/SoundGraph';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** The card's side margins in the player (its page has 12 on each side). */
const PAGE_PAD = 12;

/**
 * For a song without lyrics, the visualizer under the player where the lyrics card would be
 * (Look → Visualizer → When a Song Has No Lyrics). Tap it for the full visualizer.
 */
export function VisualizerCard() {
  const t = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/lyrics', params: { visualizer: '1' } })}
      accessibilityLabel="Open the visualizer"
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.head}>
        <T style={styles.title}>Visualizer</T>
        <View style={styles.expand}>
          <Ionicons name="expand" size={16} color={t.colors.text} />
        </View>
      </View>
      <T variant="caption" style={{ fontSize: t.size(12), marginBottom: t.space.md }}>
        No lyrics for this song
      </T>
      <SoundGraph width={width - PAGE_PAD * 2 - t.space.lg * 2} height={170} />
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    padding: t.space.lg,
    borderRadius: t.radius.card,
    backgroundColor: t.colors.surface2,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  title: { fontFamily: t.fonts.bold, fontSize: t.size(16), color: t.colors.text },
  expand: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
