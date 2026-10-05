// Lyrics timing: move this song's lyrics earlier or later. Saved on this phone as you go;
// "Save to server" writes it into the lyrics themselves (see offset.ts).
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { tick } from '@/lib/haptics';
import { saveOffsetToServer, serverSaveFor, useLyricsOffset, useLyricsOffsets } from '@/lyrics/offset';
import type { Lyrics } from '@/lyrics/types';
import { showToast } from '@/ui/overlays';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

const STEPS = [-500, -100, 100, 500];

function describe(ms: number): string {
  if (ms === 0) return 'As written';
  const s = (Math.abs(ms) / 1000).toFixed(1);
  return ms > 0 ? `${s} s later` : `${s} s earlier`;
}

export function SyncPanel({ itemId, lyrics, onClose }: { itemId: string; lyrics: Lyrics; onClose: () => void }) {
  const t = useTheme();
  const styles = useStyles();
  const offset = useLyricsOffset(itemId);
  const [saving, setSaving] = useState(false);
  const target = serverSaveFor(lyrics);
  const move = (by: number) => {
    tick();
    useLyricsOffsets.getState().set(itemId, offset + by);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveOffsetToServer(itemId, lyrics, offset);
      showToast('Lyrics timing saved to the server');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t save the timing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)} style={styles.panel}>
      <View style={styles.head}>
        <T variant="bodyStrong">Lyrics timing</T>
        <Pressable hitSlop={10} onPress={onClose} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={t.colors.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {STEPS.slice(0, 2).map((s) => (
          <Pressable key={s} onPress={() => move(s)} style={styles.step} accessibilityLabel={`${Math.abs(s) / 1000} seconds earlier`}>
            <T style={styles.stepText}>{s / 1000} s</T>
          </Pressable>
        ))}
        <Pressable onPress={() => offset !== 0 && move(-offset)} style={{ flex: 1, alignItems: 'center' }} accessibilityLabel="Reset">
          <T style={{ fontFamily: t.fonts.bold, fontSize: t.size(16) }}>{describe(offset)}</T>
          {offset !== 0 ? (
            <T variant="caption" style={{ fontSize: t.size(11) }}>
              Tap to reset
            </T>
          ) : null}
        </Pressable>
        {STEPS.slice(2).map((s) => (
          <Pressable key={s} onPress={() => move(s)} style={styles.step} accessibilityLabel={`${s / 1000} seconds later`}>
            <T style={styles.stepText}>+{s / 1000} s</T>
          </Pressable>
        ))}
      </View>
      <T variant="caption" style={{ marginTop: t.space.sm, fontSize: t.size(12) }}>
        {target.ok
          ? 'Saved on this phone. Save to the server to fix the lyrics everywhere.'
          : `Saved on this phone. ${target.reason}.`}
      </T>
      {target.ok ? (
        <Pressable
          disabled={offset === 0 || saving}
          onPress={() => void save()}
          style={({ pressed }) => [styles.save, (offset === 0 || pressed) && { opacity: 0.5 }]}>
          {saving ? <ActivityIndicator color="#000" /> : <T style={{ fontFamily: t.fonts.bold, color: '#000' }}>Save to server</T>}
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  panel: {
    marginHorizontal: t.space.lg,
    marginBottom: t.space.sm,
    padding: t.space.md,
    borderRadius: t.radius.card,
    backgroundColor: 'rgba(20,20,20,0.92)',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: t.space.md },
  step: {
    paddingHorizontal: 10,
    height: 36,
    borderRadius: t.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontFamily: t.fonts.semibold, fontSize: t.size(13) },
  save: {
    marginTop: t.space.md,
    height: 42,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
