import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import { useOverlays } from '@/ui/overlays';
import { SheetPanel } from '@/ui/Sheet';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** The pick-one sheet (inside OverlayHost): "Sort by" with the current choice ticked. */
export function OptionsPanel() {
  const t = useTheme();
  const styles = useStyles();
  const sheet = useOverlays((s) => s.options);
  const close = () => useOverlays.getState().closeOptions();
  return (
    <SheetPanel visible={!!sheet} onClose={close}>
      {sheet ? (
        <>
          <T variant="bodyStrong" style={styles.title}>
            {sheet.title}
          </T>
          <View style={styles.divider} />
          {sheet.options.map((o) => {
            const selected = o.key === sheet.selected;
            return (
              <Pressable
                key={o.key}
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => {});
                  close();
                  sheet.onSelect(o.key);
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.colors.surface3 }]}>
                <T style={[styles.label, selected && { color: t.colors.accent }]}>{o.label}</T>
                {selected ? <Ionicons name="checkmark" size={22} color={t.colors.accent} /> : null}
              </Pressable>
            );
          })}
        </>
      ) : null}
    </SheetPanel>
  );
}

const useStyles = makeStyles((t) => ({
  title: { paddingHorizontal: t.space.lg, paddingVertical: t.space.md, fontSize: t.size(16) },
  divider: { height: 1, backgroundColor: t.colors.border, marginBottom: t.space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.lg,
    paddingVertical: 14,
  },
  label: { fontFamily: t.fonts.medium, fontSize: t.size(16), color: t.colors.text },
}));
