// Themes on the desktop (Settings → Look → Theme): Rakki's own look, the built-in ones, and the
// files you import. The theme's CSS goes in one <style> after Rakki's own, so it can change any
// colour or rule; its @backdrop puts the playing cover behind the whole window (ThemeBackdrop).
// Imported themes are kept on this computer with the rest of the settings.
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';

import { parseTheme, ThemeError, type Theme } from './format';
import kawarpCss from './kawarp.css?raw';
import lucidCss from './lucid.css?raw';
import { kv } from '~/lib/kv';

export const DEFAULT_THEME = 'default';
/** The theme a new install starts on (and what removing the theme in use goes back to): Kawarp. */
export const STARTING_THEME = 'kawarp';

const RAKKI: Theme = { id: DEFAULT_THEME, meta: { name: 'Rakki', description: "Rakki's own look.", backdrop: 'none' }, css: '', tokens: {}, builtIn: true };
export const BUILT_IN: Theme[] = [RAKKI, { ...parseTheme(lucidCss, 'Lucid', 'lucid'), builtIn: true }, { ...parseTheme(kawarpCss, 'Kawarp', 'kawarp'), builtIn: true }];

const KEY = 'rakki.themes';

interface Saved {
  active: string;
  /** Set once Kawarp became the starting theme (desktop 1.7.0): Rakki's own look picked since then stays. */
  kawarpDefault?: boolean;
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
    // From before Kawarp was the default: Rakki's own look then was simply the default, so it
    // moves to Kawarp once. Picking Rakki again afterwards is kept.
    if (!v.kawarpDefault && (v.active === undefined || v.active === DEFAULT_THEME)) return { active: STARTING_THEME, imported };
    return { active: all.some((t) => t.id === v.active) ? v.active! : STARTING_THEME, imported };
  } catch {
    return { active: STARTING_THEME, imported: [] };
  }
}

interface ThemesState {
  active: string;
  imported: Theme[];
  setActive(id: string): void;
  /** Reads a .css file and switches to it. A theme with the same name is replaced (an edited file imported again). */
  importFile(file: File): Promise<Theme>;
  remove(id: string): void;
  /** The theme editor's CSS, shown live instead of the theme in use while it's open (null: closed). */
  draft: string | null;
  setDraft(css: string | null): void;
  /** Keeps CSS from the editor: replaces the imported theme `id`, else adds it (or replaces one of the same name), and uses it. */
  saveCss(css: string, id?: string): Theme;
}

export const useThemes = create<ThemesState>((set, get) => {
  const save = () => {
    const { active, imported } = get();
    const data: Saved = { active, kawarpDefault: true, imported: imported.map((t) => ({ id: t.id, fileName: t.meta.name, css: t.css })) };
    try {
      kv.setItem(KEY, JSON.stringify(data));
    } catch {
      // Full: kept for this session only.
    }
  };
  /** Adds or replaces an imported theme (`id`, else one with the same name) and switches to it. */
  const keep = (parsed: Theme, id?: string): Theme => {
    const same = id ?? get().imported.find((t) => t.meta.name.toLowerCase() === parsed.meta.name.toLowerCase())?.id;
    const theme = { ...parsed, id: same ?? `file:${Date.now().toString(36)}` };
    set({ imported: same ? get().imported.map((t) => (t.id === same ? theme : t)) : [...get().imported, theme], active: theme.id });
    save();
    return theme;
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
      return keep(parseTheme(text, file.name, ''));
    },
    draft: null,
    setDraft(draft) {
      set({ draft });
    },
    saveCss(css, id) {
      return keep(parseTheme(css, 'My Theme', ''), get().imported.some((t) => t.id === id) ? id : undefined);
    },
    remove(id) {
      const { active, imported } = get();
      set({ imported: imported.filter((t) => t.id !== id), active: active === id ? STARTING_THEME : active });
      save();
    },
  };
});

export function allThemes(imported: Theme[]): Theme[] {
  return [...BUILT_IN, ...imported];
}

/** The theme in use (the editor's draft while it's open). */
export function useActiveTheme(): Theme {
  const active = useThemes((s) => s.active);
  const imported = useThemes((s) => s.imported);
  const draft = useThemes((s) => s.draft);
  return useMemo(() => {
    const inUse = allThemes(imported).find((t) => t.id === active) ?? RAKKI;
    if (draft === null) return inUse;
    try {
      return parseTheme(draft, 'Draft', 'draft');
    } catch {
      return inUse;
    }
  }, [active, imported, draft]);
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
