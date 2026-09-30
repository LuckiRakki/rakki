import { useMemo, type ReactNode } from 'react';

import { useLucidAccent } from '@/appearance/lucid';
import { useAppearance } from '@/appearance/store';
import { buildTheme, ThemeContext } from '@/ui/theme';

/**
 * Rebuilds the theme whenever an appearance setting changes, and (in Lucid mode) whenever the
 * playing album changes; the whole app follows.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const accentMode = useAppearance((s) => s.accentMode);
  const customAccent = useAppearance((s) => s.accent);
  const background = useAppearance((s) => s.background);
  const textScale = useAppearance((s) => s.textScale);
  const roundness = useAppearance((s) => s.roundness);
  const density = useAppearance((s) => s.density);
  const lucid = useLucidAccent(accentMode === 'lucid');
  const accent = lucid ?? customAccent;

  const theme = useMemo(
    () => buildTheme({ accentMode, accent, background, textScale, roundness, density }),
    [accentMode, accent, background, textScale, roundness, density],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
