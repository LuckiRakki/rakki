// Edit Theme (Settings → Look → Theme → Edit, or New Theme): a theme's CSS in a code box, with
// its colours as pickers beside it. The whole window is the preview: every keystroke shows at
// once (themes.ts uses the draft while this page is open). Save keeps it as an imported theme
// and uses it; built-in themes are edited as a copy. Unsaved changes stay here while Rakki runs,
// so leaving the page loses nothing.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { COLOR_TOKENS, parseTheme, setRootToken, STARTER_THEME, ThemeError, toHex } from './format';
import { allThemes, DEFAULT_THEME, useThemes } from './themes';
import { go } from '~/nav';
import { Check, Copy } from '~/ui/icons';
import { toast } from '~/ui/overlays';

/** Open the editor on a theme (its id), or on a new one. */
export function openThemeEditor(id = 'new') {
  go({ name: 'themeEditor', id });
}

/** Unsaved CSS per theme, kept while Rakki runs. */
const pending = new Map<string, string>();

/** The CSS the editor starts from: the theme's own (built-in ones as a copy), or the starter. */
function startingCss(id: string): string {
  const theme = allThemes(useThemes.getState().imported).find((t) => t.id === id);
  if (!theme || id === DEFAULT_THEME) return STARTER_THEME;
  if (!theme.builtIn) return theme.css;
  return theme.css.replace(/(@name\s+)(.+)/, (_, key: string, name: string) => `${key}${name.trim()} Copy`);
}

export function ThemeEditor({ id }: { id: string }) {
  const editsOwn = useThemes((s) => s.imported.some((t) => t.id === id));
  const [css, setCss] = useState(() => pending.get(id) ?? startingCss(id));
  const gutter = useRef<HTMLDivElement>(null);

  const edit = (next: string) => {
    setCss(next);
    pending.set(id, next);
  };

  // The draft is the theme on screen while this page is open.
  useEffect(() => {
    useThemes.getState().setDraft(css);
  }, [css]);
  useEffect(() => () => useThemes.getState().setDraft(null), []);

  const parsed = useMemo(() => {
    try {
      return { theme: parseTheme(css, 'My Theme', 'draft'), error: null };
    } catch (e) {
      return { theme: null, error: e instanceof ThemeError ? e.message : "That isn't a theme yet." };
    }
  }, [css]);

  const save = () => {
    try {
      const theme = useThemes.getState().saveCss(css, editsOwn ? id : undefined);
      pending.delete(id);
      toast(`Saved ${theme.meta.name}`);
      // A new theme or a copy is its own theme from now on: keep editing that one.
      if (theme.id !== id) {
        pending.delete(theme.id);
        openThemeEditor(theme.id);
      }
    } catch (e) {
      toast(e instanceof ThemeError ? e.message : "Couldn't save the theme.");
    }
  };

  const discard = () => {
    pending.delete(id);
    setCss(startingCss(id));
  };

  // Tab indents (two spaces) instead of leaving the box; Ctrl+S saves.
  const key = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.setRangeText('  ', e.currentTarget.selectionStart, e.currentTarget.selectionEnd, 'end');
      edit(e.currentTarget.value);
    }
  };

  const lines = css.split('\n').length;
  const tokens = parsed.theme?.tokens ?? {};
  const name = parsed.theme?.meta.name ?? 'Theme';
  const changed = css !== startingCss(id);

  return (
    <div className="page theme-editor">
      <div className="te-head">
        <div style={{ minWidth: 0 }}>
          <div className="te-eyebrow">Edit Theme</div>
          <h1 className="te-name">{name}</h1>
        </div>
        <div className="te-actions">
          <button className="secondary small" onClick={() => void navigator.clipboard.writeText(css).then(() => toast('Copied the CSS'), () => toast("Couldn't copy"))}>
            <Copy size={15} /> Copy CSS
          </button>
          <button className="secondary small" disabled={!changed} onClick={discard}>
            Undo Changes
          </button>
          <button className="primary te-save" disabled={!!parsed.error} onClick={save}>
            <Check size={15} /> Save
          </button>
        </div>
      </div>
      <div className="te-body">
        <div className="te-code">
          <div className="te-gutter" ref={gutter} aria-hidden>
            {Array.from({ length: lines }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            className="te-text"
            value={css}
            spellCheck={false}
            aria-label="Theme CSS"
            onChange={(e) => edit(e.target.value)}
            onKeyDown={key}
            onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
          />
        </div>
        <aside className="te-side">
          <section className="ae-card">
            <div className="ae-card-head">
              <h2>Colours</h2>
            </div>
            {COLOR_TOKENS.map(({ token, label }) => {
              const value = tokens[token] ?? '';
              const hex = toHex(value);
              return (
                <div key={token} className="te-token">
                  <label className="te-swatch" style={{ background: hex ? value : undefined }} title={hex ? `Pick ${label}` : 'Set a colour first, or type one'}>
                    <input
                      type="color"
                      value={hex ?? '#000000'}
                      aria-label={label}
                      onChange={(e) => {
                        // Keeps a see-through colour see-through: only the colour changes.
                        const alpha = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(value)?.[1];
                        const [r, g, b] = [1, 3, 5].map((i) => parseInt(e.target.value.slice(i, i + 2), 16));
                        edit(setRootToken(css, token, alpha ? `rgba(${r}, ${g}, ${b}, ${alpha})` : e.target.value));
                      }}
                    />
                  </label>
                  <div className="te-token-text">
                    <div className="setting-label">{label}</div>
                    <div className="setting-detail">--{token}</div>
                  </div>
                  <input
                    className="field te-value"
                    value={value}
                    placeholder="Rakki's"
                    spellCheck={false}
                    aria-label={`${label} value`}
                    onChange={(e) => edit(setRootToken(css, token, e.target.value))}
                  />
                </div>
              );
            })}
          </section>
          <p className={`te-status${parsed.error ? ' bad' : ''}`}>
            {parsed.error ??
              (editsOwn ? 'Changes show as you type. Save keeps them (Ctrl+S).' : 'Changes show as you type. Save adds this as a theme of your own (Ctrl+S).')}
          </p>
        </aside>
      </div>
    </div>
  );
}
