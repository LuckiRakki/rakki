import { useMemo, type ReactNode } from 'react';

import { useAppearance } from '@/appearance/store';
import { buildTheme, ThemeContext } from '@/ui/theme';

/** Rebuilds the theme whenever an appearance setting changes; the whole app follows. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const accentMode = useAppearance((s) => s.accentMode);
  const accent = useAppearance((s) => s.accent);
  const background = useAppearance((s) => s.background);
  const textScale = useAppearance((s) => s.textScale);
  const roundness = useAppearance((s) => s.roundness);
  const density = useAppearance((s) => s.density);
  const theme = useMemo(
    () => buildTheme({ accentMode, accent, background, textScale, roundness, density }),
    [accentMode, accent, background, textScale, roundness, density],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
