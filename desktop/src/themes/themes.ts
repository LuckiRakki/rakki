// Themes on the desktop (Settings → Look → Theme): Rakki's own look, the built-in ones, and the
// files you import. The theme's CSS goes in one <style> after Rakki's own, so it can change any
// colour or rule; its @backdrop puts the playing cover behind the whole window (ThemeBackdrop).
// Imported themes are kept on this computer with the rest of the settings.
import { useEffect } from 'react';
import { create } from 'zustand';

import { parseTheme, ThemeError, type Theme } from './format';
import kawarpCss from './kawarp.css?raw';
import lucidCss from './lucid.css?raw';
import { kv } from '~/lib/kv';

export const DEFAULT_THEME = 'default';

const RAKKI: Theme = { id: DEFAULT_THEME, meta: { name: 'Rakki', description: "Rakki's own look.", backdrop: 'none' }, css: '', tokens: {}, builtIn: true };
export const BUILT_IN: Theme[] = [RAKKI, { ...parseTheme(lucidCss, 'Lucid', 'lucid'), builtIn: true }, { ...parseTheme(kawarpCss, 'Kawarp', 'kawarp'), builtIn: true }];

const KEY = 'rakki.themes';

interface Saved {
  active: string;
  imported: { id: string; fileName: string; css: string }[];
}

function load(): { active: string; imported: Theme[] } {
  try {
    const v = JSON.parse(kv.getItem(KEY) ?? '{}') as Partial<Saved>;
    const imported = (v.imported ?? []).flatMap((t) => {
      try {
        return [parseTheme(t.css, t.fileName, t.id)];
      } catch {
        return [];
      }
    });
    const all = [...BUILT_IN, ...imported];
    return { active: all.some((t) => t.id === v.active) ? v.active! : DEFAULT_THEME, imported };
  } catch {
    return { active: DEFAULT_THEME, imported: [] };
  }
}

interface ThemesState {
  active: string;
  imported: Theme[];
  setActive(id: string): void;
  /** Reads a .css file and switches to it. A theme with the same name is replaced (an edited file imported again). */
  importFile(file: File): Promise<Theme>;
  remove(id: string): void;
}

export const useThemes = create<ThemesState>((set, get) => {
  const save = () => {
    const { active, imported } = get();
    const data: Saved = { active, imported: imported.map((t) => ({ id: t.id, fileName: t.meta.name, css: t.css })) };
    try {
      kv.setItem(KEY, JSON.stringify(data));
    } catch {
      // Full: kept for this session only.
    }
  };
  return {
    ...load(),
    setActive(active) {
      set({ active });
      save();
    },
    async importFile(file) {
      const text = await file.text().catch(() => {
        throw new ThemeError("Couldn't read that file.");
      });
      const parsed = parseTheme(text, file.name, '');
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

export function allThemes(imported: Theme[]): Theme[] {
  return [...BUILT_IN, ...imported];
}

/** The theme in use. */
export function useActiveTheme(): Theme {
  const active = useThemes((s) => s.active);
  const imported = useThemes((s) => s.imported);
  return allThemes(imported).find((t) => t.id === active) ?? RAKKI;
}

/** Puts the theme's CSS on the page and names it on <html> (data-theme) for anything that asks. */
export function useApplyCustomTheme() {
  const theme = useActiveTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    root.dataset.backdrop = theme.meta.backdrop;
    let el = document.getElementById('rakki-theme') as HTMLStyleElement | null;
    if (!theme.css) return el?.remove();
    if (!el) {
      el = document.createElement('style');
      el.id = 'rakki-theme';
    }
    // Always last in <head>, so it comes after Rakki's own styles.
    document.head.appendChild(el);
    if (el.textContent !== theme.css) el.textContent = theme.css;
  }, [theme]);
}
