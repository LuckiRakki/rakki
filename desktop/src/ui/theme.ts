// The accent colour: your own, or Lucid (the colour of the album that's playing, like the phone
// app's), applied as CSS variables so every screen follows without re-rendering.
import { useEffect } from 'react';
import { create } from 'zustand';

import { blurhashAverage } from '@/lib/blurhash';
import { vividAccent, withAlpha } from '@/lib/color';
import { readPref, writePref } from '@/lib/prefs';
import { useAuth } from '~/auth/session';
import { usePlayer } from '~/player/store';

export const DEFAULT_ACCENT = '#fd642d';
const KEY = 'rakki.desktop.theme';

interface ThemeState {
  accent: string;
  lucid: boolean;
  set(patch: Partial<Pick<ThemeState, 'accent' | 'lucid'>>): void;
}

function saved(): Pick<ThemeState, 'accent' | 'lucid'> {
  try {
    const v = JSON.parse(readPref(KEY) ?? '{}') as Partial<ThemeState>;
    return { accent: v.accent ?? DEFAULT_ACCENT, lucid: v.lucid ?? true };
  } catch {
    return { accent: DEFAULT_ACCENT, lucid: true };
  }
}

export const useTheme = create<ThemeState>((set, get) => ({
  ...saved(),
  set(patch) {
    set(patch);
    const { accent, lucid } = get();
    writePref(KEY, JSON.stringify({ accent, lucid }));
  },
}));

/** Keeps --accent (and its soft tint) in step with the setting and what's playing. */
export function useApplyTheme() {
  const { accent, lucid } = useTheme();
  const client = useAuth((s) => s.client);
  const item = usePlayer((s) => s.queue[s.index]);
  const hash = item && client ? client.blurhash(item) : undefined;
  const rgb = lucid ? blurhashAverage(hash) : null;
  const color = rgb ? vividAccent(rgb) : accent;
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--accent', color);
    root.setProperty('--accent-soft', withAlpha(color, 0.16));
  }, [color]);
}
