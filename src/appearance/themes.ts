// Theme files on the phone (Customize → Theme): the same .css files as the desktop
// (docs/THEMES.md, parsed by themeFormat.ts). The phone uses only the colours a theme sets on
// :root; the rest of the CSS is for the desktop. Kept on the phone with the other settings.
import { useMemo } from 'react';
import { create } from 'zustand';

import { parseTheme, readColor, ThemeError, type Theme } from '@/appearance/themeFormat';
import { readPref, writePref } from '@/lib/prefs';

export const DEFAULT_THEME = 'default';
const KEY = 'rakki.themes';

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
    return { active: imported.some((t) => t.id === v.active) ? v.active! : DEFAULT_THEME, imported };
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

/** A see-through colour laid over `under` (phone screens have nothing behind them but the background). */
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
 * The phone's colours from a theme's tokens. Panels on the desktop are the phone's page, so
 * cards, raised things and hover map to the phone's three surfaces. Values the phone can't
 * draw (var(), color-mix()) are skipped and stay Rakki's.
 */
export function phoneColors(tokens: Record<string, string>): ThemeColors {
  const bg = solid(tokens.bg, '#000000');
  const base = bg ?? '#121212';
  const radius = /^\s*([\d.]+)px\s*$/.exec(tokens.radius ?? '')?.[1];
  return {
    bg,
    surface: solid(tokens['surface-2'], base),
    surface2: solid(tokens['surface-3'], base),
    surface3: solid(tokens['surface-4'], base),
    border: plain(tokens.line),
    text: plain(tokens.text),
    textSecondary: plain(tokens['text-2']),
    textMuted: plain(tokens['text-3']),
    radius: radius ? Number(radius) : undefined,
  };
}

/** The colours of the theme in use (empty for Rakki's own look). */
export function useThemeColors(): ThemeColors | null {
  const active = usePhoneThemes((s) => s.active);
  const theme = usePhoneThemes((s) => s.imported.find((t) => t.id === active));
  return useMemo(() => (theme ? phoneColors(theme.tokens) : null), [theme]);
}
