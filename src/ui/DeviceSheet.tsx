// Holding a device in Connect (app/devices.tsx): a sheet with what you can do with it, so a tap
// can stay the quick, likely thing. Play this phone's song there (it moves over and this phone
// becomes its remote), remote control it (nothing moves), or play its song here. Choices that
// can't be picked now say why. The choices and what they do are remote/connect.ts.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/auth/store';
import { tick } from '@/lib/haptics';
import { deviceChoices, runChoice, type DeviceChoiceKey } from '@/remote/connect';
import type { RakkiDevice } from '@/remote/devices';
import { useOverlays } from '@/ui/overlays';
import { SheetPanel } from '@/ui/Sheet';
import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<DeviceChoiceKey, IconName> = {
  playThere: 'volume-high-outline',
  control: 'keypad-outline',
  takeOver: 'phone-portrait-outline',
};

/** A phone or tablet by its name, else a computer. */
export function deviceIcon(d: { name: string }): IconName {
  return /iphone|ipad|ios|android|phone/i.test(d.name) ? 'phone-portrait-outline' : 'laptop-outline';
}

/** "Playing: Song · Artist", "Paused: ...", or "Not playing". */
export function nowLine(d: RakkiDevice): string {
  if (!d.item) return 'Not playing';
  const who = d.item.Artists?.join(', ') ?? d.item.AlbumArtist;
  return `${d.paused ? 'Paused' : 'Playing'}: ${d.item.Name}${who ? ` · ${who}` : ''}`;
}

/** The held device's choices (inside OverlayHost, like the long-press menu). */
export function DeviceSheetPanel() {
  const t = useTheme();
  const styles = useStyles();
  const device = useOverlays((s) => s.device);
  const client = useAuth((s) => s.client);
  const close = () => useOverlays.getState().closeDevice();
  const choices = device ? deviceChoices(device) : [];

  return (
    <SheetPanel visible={!!device} onClose={close}>
      {device ? (
        <>
          <View style={styles.header}>
            <Ionicons name={deviceIcon(device)} size={30} color={t.colors.text} />
            <View style={{ flex: 1, marginLeft: t.space.md }}>
              <T variant="bodyStrong" numberOfLines={1}>
                {device.name}
              </T>
              <T variant="caption" numberOfLines={1}>
                {device.controllable ? nowLine(device) : 'Update Rakki there to connect to it'}
              </T>
            </View>
          </View>
          <View style={styles.divider} />
          {choices.map((c) => (
            <Pressable
              key={c.key}
              disabled={!c.enabled}
              onPress={() => {
                if (!client) return;
                tick();
                close();
                // Closes Connect too; a toast says how it went.
                runChoice(client, device, c.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: !c.enabled }}
              accessibilityLabel={c.why ? `${c.label}. ${c.why}` : c.label}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: t.colors.surface3 }, !c.enabled && { opacity: 0.45 }]}>
              <Ionicons name={ICONS[c.key]} size={24} color={t.colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <T style={styles.label}>{c.label}</T>
                {c.why ? (
                  <T variant="caption" style={{ fontSize: t.size(12) }}>
                    {c.why}
                  </T>
                ) : null}
              </View>
            </Pressable>
          ))}
        </>
      ) : null}
    </SheetPanel>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.space.lg, paddingVertical: t.space.md },
  divider: { height: 1, backgroundColor: t.colors.border, marginBottom: t.space.xs },
  // 52 pt rows: comfortably over the 44 pt minimum.
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.lg, minHeight: 52, paddingHorizontal: t.space.lg, paddingVertical: 12 },
  label: { fontFamily: t.fonts.medium, fontSize: t.size(16), color: t.colors.text },
}));
