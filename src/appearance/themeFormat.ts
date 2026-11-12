// Rakki themes: one .css file, imported from Settings → Look → Theme (no marketplace), like a
// Spicetify theme's user.css and color.ini in one. The format is in docs/THEMES.md.
//
// A theme file is a leading comment with its details (@name, @author, @description, @version,
// @backdrop), then plain CSS. The colours a theme sets on :root (--bg, --surface, --text...)
// are the part both apps understand; the phone app will read those, while the desktop also
// applies the rest of the CSS. (The accent isn't one: it's the user's, from Settings → Look →
// Colour.) Plain TypeScript (no DOM): the phone app (src/appearance/themes.ts) and the desktop
// (desktop/src/themes) both use it.

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

/** The tokens that are colours (everything but --radius), with a name for editors. */
export const COLOR_TOKENS: { token: (typeof THEME_TOKENS)[number]; label: string }[] = [
  { token: 'bg', label: 'Background' },
  { token: 'surface', label: 'Panels' },
  { token: 'surface-2', label: 'Cards' },
  { token: 'surface-3', label: 'Raised' },
  { token: 'surface-4', label: 'Hover' },
  { token: 'line', label: 'Lines' },
  { token: 'text', label: 'Text' },
  { token: 'text-2', label: 'Secondary Text' },
  { token: 'text-3', label: 'Faint Text' },
];

/**
 * The CSS with `--token: value` set in its first :root block (added to it, or a new :root block
 * after the header when there's none). Everything else stays as written.
 */
export function setRootToken(css: string, token: string, value: string): string {
  const root = /(^|[}\s,]):root\s*\{([^}]*)\}/.exec(css);
  if (!root) {
    const head = /^\s*\/\*[\s\S]*?\*\/\s*/.exec(css)?.[0] ?? '';
    return `${head}${head && !head.endsWith('\n\n') ? '\n' : ''}:root {\n  --${token}: ${value};\n}\n\n${css.slice(head.length)}`;
  }
  const bodyStart = root.index + root[0].indexOf('{') + 1;
  const body = root[2];
  const decl = new RegExp(`(--${token}\\s*:\\s*)([^;}]*)`, 'i');
  const trimmed = body.replace(/\s*$/, '');
  // The last declaration may have no ; of its own.
  const before = trimmed && !trimmed.endsWith(';') ? `${trimmed};` : trimmed;
  const next = decl.test(body) ? body.replace(decl, `$1${value}`) : `${before}\n  --${token}: ${value};\n`;
  return css.slice(0, bodyStart) + next + css.slice(bodyStart + body.length);
}

/** [r, g, b, a] of #rgb, #rrggbb, #rrggbbaa, rgb() or rgba(), or null for anything else. */
export function readColor(value: string): [number, number, number, number] | null {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{3,8})$/.exec(v)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = (i: number) => parseInt(full.slice(i * 2, i * 2 + 2), 16);
    return [n(0), n(1), n(2), full.length === 8 ? n(3) / 255 : 1];
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Math.max(0, Math.min(1, alpha))];
}

/** "#rrggbb" for an editor's colour picker (the alpha is dropped), or null. */
export function toHex(value: string): string | null {
  const c = readColor(value);
  return c ? `#${c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}` : null;
}

/** A new theme to start from in an editor: every shared token, with Rakki's own values. */
export const STARTER_THEME = `/*
 * @name My Theme
 * @author You
 * @description One line about it.
 * @version 1.0
 * @backdrop none
 */

:root {
  --bg: #0b0b0d;
  --surface: #141417;
  --surface-2: #1d1d21;
  --surface-3: #27272c;
  --surface-4: #313137;
  --line: rgba(255, 255, 255, 0.1);
  --text: #ffffff;
  --text-2: rgba(255, 255, 255, 0.8);
  --text-3: rgba(255, 255, 255, 0.6);
  --radius: 8px;
}
`;
