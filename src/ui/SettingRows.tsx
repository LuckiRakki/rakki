import type { ReactNode } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { T } from '@/ui/T';
import { makeStyles, useTheme } from '@/ui/theme';

/** A titled card of settings with an optional Reset (Customize, Lyrics style). */
export function SettingSection({ title, onReset, children }: { title: string; onReset?: () => void; children: ReactNode }) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <>
      <View style={styles.head}>
        <T variant="label">{title}</T>
        {onReset ? (
          <Pressable hitSlop={10} onPress={onReset}>
            <T variant="caption" style={{ fontFamily: t.fonts.semibold }}>
              Reset
            </T>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.card}>{children}</View>
    </>
  );
}

/** A labelled control, with its current value on the right. */
export function Field({ label, value, hint, children }: { label: string; value?: string; hint?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: t.space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: t.space.sm }}>
        <T variant="bodyStrong">{label}</T>
        {value ? <T variant="caption">{value}</T> : null}
      </View>
      {children}
      {hint ? (
        <T variant="caption" style={{ marginTop: t.space.xs, fontSize: t.size(12) }}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/** A label (and detail) with a switch. */
export function Toggle({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: t.space.md }}>
      <View style={{ flex: 1, marginRight: t.space.md }}>
        <T variant="bodyStrong">{label}</T>
        {detail ? (
          <T variant="caption" style={{ fontSize: t.size(12) }}>
            {detail}
          </T>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.colors.accent, false: t.colors.surface3 }} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: t.space.xl,
    marginBottom: t.space.sm,
  },
  card: { backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.space.lg, paddingTop: t.space.xs },
}));
