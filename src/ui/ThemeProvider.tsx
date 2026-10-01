import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { useLucidAccent } from '@/appearance/lucid';
import { APPEARANCE_DEFAULTS, useAppearance, type Appearance } from '@/appearance/store';
import { buildTheme, ThemeContext } from '@/ui/theme';

const KEYS = Object.keys(APPEARANCE_DEFAULTS) as (keyof Appearance)[];

/**
 * Rebuilds the theme whenever an appearance setting changes, when iOS Reduce Motion changes,
 * and (in Lucid mode) whenever the playing album changes; the whole app follows.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const appearance = useAppearance(
    useShallow((s) => {
      const out = {} as Record<string, unknown>;
      for (const k of KEYS) out[k] = s[k];
      return out as unknown as Appearance;
    }),
  );
  const lucid = useLucidAccent(appearance.accentMode === 'lucid');
  const accent = lucid ?? appearance.accent;
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduceMotion);
    return () => sub.remove();
  }, []);

  const theme = useMemo(
    () => buildTheme({ ...appearance, accent }, { systemReduceMotion }),
    [appearance, accent, systemReduceMotion],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
