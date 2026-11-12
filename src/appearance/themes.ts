// Themes on the phone (Settings → Look → Theme): Rakki's own look, Kawarp, or a theme file (the
// same .css files as the desktop, docs/THEMES.md, parsed by themeFormat.ts). The phone uses the
// colours a theme sets on :root and its @backdrop (what's behind every screen); the rest of the
// CSS is for the desktop. Kept on the phone with the other settings.
import { useMemo } from 'react';
import { create } from 'zustand';

import { parseTheme, readColor, ThemeError, type Theme, type ThemeBackdrop } from '@/appearance/themeFormat';
import { readPref, writePref } from '@/lib/prefs';

export const DEFAULT_THEME = 'default';
const KEY = 'rakki.themes';

/**
 * Kawarp, as on the desktop (desktop/src/themes/kawarp.css, whose :root colours these are): every
 * screen over the playing cover flowing like liquid, dark see-through cards on it.
 */
export const KAWARP: Theme = {
  id: 'kawarp',
  meta: { name: 'Kawarp', author: 'Rakki', description: 'Every screen over the playing cover, flowing like liquid.', backdrop: 'flow' },
  css: '',
  tokens: {
    bg: '#0B0B0D',
    surface: 'rgba(0, 0, 0, 0.36)',
    'surface-2': 'rgba(255, 255, 255, 0.08)',
    'surface-3': 'rgba(255, 255, 255, 0.14)',
    'surface-4': 'rgba(255, 255, 255, 0.2)',
    line: 'rgba(255, 255, 255, 0.12)',
    text: '#fff',
    'text-2': 'rgba(255, 255, 255, 0.8)',
    'text-3': 'rgba(255, 255, 255, 0.7)',
  },
  builtIn: true,
};

/** The themes that come with the app (Rakki's own look is DEFAULT_THEME, not a theme). */
export const BUILT_IN_THEMES: Theme[] = [KAWARP];

/** The theme colours the phone's theme (src/ui/theme.ts) takes over; anything left out stays Rakki's. */
export interface ThemeColors {
  bg?: string;
  surface?: string;
  surface2?: string;
  surface3?: string;
  border?: string;
  text?: string;
  textSecondary?: string;
  textMuted?: string;
  /** Card corners, in points. */
  radius?: number;
  /** What's behind every screen: Rakki's plain background, the playing cover blurred, or flowing (Kawarp). */
  backdrop?: ThemeBackdrop;
}

interface Saved {
  active: string;
  imported: { id: string; css: string }[];
}

function load(): { active: string; imported: Theme[] } {
  try {
    const v = JSON.parse(readPref(KEY) ?? '{}') as Partial<Saved>;
    const imported = (v.imported ?? []).flatMap((t) => {
      try {
        return [parseTheme(t.css, 'Theme', t.id)];
      } catch {
        return [];
      }
    });
    const known = [...BUILT_IN_THEMES, ...imported].some((t) => t.id === v.active);
    return { active: known ? v.active! : DEFAULT_THEME, imported };
  } catch {
    return { active: DEFAULT_THEME, imported: [] };
  }
}

interface ThemesState {
  active: string;
  imported: Theme[];
  setActive(id: string): void;
  /** Adds a theme's CSS and switches to it. A theme with the same name is replaced (an edited file added again). */
  add(css: string): Theme;
  remove(id: string): void;
}

export const usePhoneThemes = create<ThemesState>((set, get) => {
  const save = () => {
    const { active, imported } = get();
    writePref(KEY, JSON.stringify({ active, imported: imported.map((t) => ({ id: t.id, css: t.css })) } satisfies Saved));
  };
  return {
    ...load(),
    setActive(active) {
      set({ active });
      save();
    },
    add(css) {
      const parsed = parseTheme(css, 'Theme', '');
      if (!Object.keys(parsed.tokens).length) throw new ThemeError('That theme sets no colours on :root, so it would look the same as Rakki on the phone.');
      const same = get().imported.find((t) => t.meta.name.toLowerCase() === parsed.meta.name.toLowerCase());
      const theme = { ...parsed, id: same?.id ?? `file:${Date.now().toString(36)}` };
      set({ imported: same ? get().imported.map((t) => (t.id === same.id ? theme : t)) : [...get().imported, theme], active: theme.id });
      save();
      return theme;
    },
    remove(id) {
      const { active, imported } = get();
      set({ imported: imported.filter((t) => t.id !== id), active: active === id ? DEFAULT_THEME : active });
      save();
    },
  };
});

/** Reads a theme from a link (a raw .css file on GitHub, a gist...). */
export async function fetchTheme(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url.trim());
  } catch {
    throw new ThemeError("Couldn't reach that link.");
  }
  if (!res.ok) throw new ThemeError(`That link answered ${res.status}.`);
  return res.text();
}

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** A see-through colour laid over `under` (for screens with nothing behind them but the background). */
function solid(value: string | undefined, under: string): string | undefined {
  const c = value ? readColor(value) : null;
  if (!c) return undefined;
  const u = readColor(under) ?? [0, 0, 0, 1];
  const [r, g, b] = [0, 1, 2].map((i) => c[i] * c[3] + u[i] * (1 - c[3]));
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** As written when it's a colour the phone can draw (hex, rgb, rgba). */
const plain = (value: string | undefined) => (value && readColor(value) ? value.trim() : undefined);

/**
 * The phone's colours from a theme. Panels on the desktop are the phone's page, so cards, raised
 * things and hover map to the phone's three surfaces. Over a backdrop (Kawarp) they stay
 * see-through, as on the desktop; otherwise they're laid over the background. Values the phone
 * can't draw (var(), color-mix()) are skipped and stay Rakki's.
 */
export function phoneColors(theme: Pick<Theme, 'tokens' | 'meta'>): ThemeColors {
  const { tokens } = theme;
  const backdrop = theme.meta.backdrop;
  const bg = solid(tokens.bg, '#000000');
  const base = bg ?? '#121212';
  const radius = /^\s*([\d.]+)px\s*$/.exec(tokens.radius ?? '')?.[1];
  const card = (value: string | undefined) => (backdrop === 'none' ? solid(value, base) : plain(value));
  return {
    backdrop,
    bg,
    surface: card(tokens['surface-2']),
    surface2: card(tokens['surface-3']),
    surface3: card(tokens['surface-4']),
    border: plain(tokens.line),
    text: plain(tokens.text),
    textSecondary: plain(tokens['text-2']),
    textMuted: plain(tokens['text-3']),
    radius: radius ? Number(radius) : undefined,
  };
}

/** The theme with this id: a built-in one or an added file. */
export const findTheme = (id: string, imported: Theme[]) => BUILT_IN_THEMES.find((t) => t.id === id) ?? imported.find((t) => t.id === id);

/** The colours of the theme in use (null for Rakki's own look). */
export function useThemeColors(): ThemeColors | null {
  const active = usePhoneThemes((s) => s.active);
  const theme = usePhoneThemes((s) => findTheme(active, s.imported));
  return useMemo(() => (theme ? phoneColors(theme) : null), [theme]);
}
