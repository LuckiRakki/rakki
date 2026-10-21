// Rakki themes: one .css file, imported from Settings → Look → Theme (no marketplace), like a
// Spicetify theme's user.css and color.ini in one. The format is in docs/THEMES.md.
//
// A theme file is a leading comment with its details (@name, @author, @description, @version,
// @backdrop), then plain CSS. The colours a theme sets on :root (--bg, --surface, --text...)
// are the part both apps understand; the phone app will read those, while the desktop also
// applies the rest of the CSS. (The accent isn't one: it's the user's, from Settings → Look →
// Colour.) This file is plain TypeScript (no DOM) so the phone app can share it as it is.

/** What's behind the whole window: nothing, the playing cover blurred and still, or flowing. */
export type ThemeBackdrop = 'none' | 'album' | 'flow';

export interface ThemeMeta {
  name: string;
  author?: string;
  description?: string;
  version?: string;
  backdrop: ThemeBackdrop;
}

export interface Theme {
  /** 'default', a built-in theme's name, or `file:` and a number for imported ones. */
  id: string;
  meta: ThemeMeta;
  css: string;
  /** The :root custom properties (without the --), what the phone app can use. */
  tokens: Record<string, string>;
  builtIn?: boolean;
}

/** The colours both apps share; a theme can set any of them (and anything else on the desktop). */
export const THEME_TOKENS = [
  'bg',
  'surface',
  'surface-2',
  'surface-3',
  'surface-4',
  'line',
  'text',
  'text-2',
  'text-3',
  'radius',
] as const;

/** Big enough for any real theme, small enough to keep in settings. */
export const MAX_THEME_BYTES = 512 * 1024;

export class ThemeError extends Error {}

const BACKDROPS: ThemeBackdrop[] = ['none', 'album', 'flow'];

/** The @key value lines of the file's first comment. */
function header(css: string): Record<string, string> {
  const m = /^\s*\/\*([\s\S]*?)\*\//.exec(css);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^[\s*]*@([a-z-]+)\s+(.+?)\s*$/i.exec(line);
    if (kv) out[kv[1].toLowerCase()] = kv[2];
  }
  return out;
}

/** Custom properties set in :root blocks (the last one wins, as in CSS). */
export function rootTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = /(?:^|[}\s,]):root\s*\{([^}]*)\}/g;
  let b: RegExpExecArray | null;
  while ((b = blocks.exec(noComments))) {
    const decls = /--([a-z0-9-]+)\s*:\s*([^;]+?)\s*(?:;|$)/gi;
    let d: RegExpExecArray | null;
    while ((d = decls.exec(b[1]))) out[d[1].toLowerCase()] = d[2].replace(/\s*!important$/i, '');
  }
  return out;
}

/** Reads a theme file; throws ThemeError with a sentence for the user when it isn't one. */
export function parseTheme(text: string, fileName = 'Theme', id = 'file'): Theme {
  if (text.length > MAX_THEME_BYTES) throw new ThemeError("That file is too big for a theme (themes can be up to 512 KB).");
  // A theme is styling only: no scripts, no other files pulled in.
  if (/<\/?(script|style)\b/i.test(text)) throw new ThemeError("That doesn't look like a CSS file.");
  if (/@import\b/i.test(text)) throw new ThemeError('Themes have to be one file: put what @import pulls in into the theme itself.');
  if (!/[{}]/.test(text) && !/^\s*\/\*/.test(text)) throw new ThemeError("That file has no CSS in it.");
  const h = header(text);
  const backdrop = (h.backdrop?.toLowerCase() ?? 'none') as ThemeBackdrop;
  const name = h.name?.slice(0, 60) || fileName.replace(/\.(css|rakkitheme)$/i, '').slice(0, 60) || 'Theme';
  return {
    id,
    meta: {
      name,
      author: h.author?.slice(0, 60),
      description: h.description?.slice(0, 200),
      version: h.version?.slice(0, 20),
      backdrop: BACKDROPS.includes(backdrop) ? backdrop : 'none',
    },
    css: text,
    tokens: rootTokens(text),
  };
}
