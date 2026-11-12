// Settings → Look: themes (docs/THEMES.md), Glass, the pause button, accent and Lucid, the moving
// backgrounds, sizes and motion.
import { useState } from 'react';

import { SWATCHES } from '@/appearance/presets';
import { APP_LOOK, useLook } from '~/settings/look';
import { ThemeError } from '~/themes/format';
import { openThemeEditor } from '~/themes/ThemeEditor';
import { allThemes, useThemes } from '~/themes/themes';
import { openLink } from '~/lib/links';
import { toast } from '~/ui/overlays';
import { ArrowDownToLine, Check, Pause, Pencil, Plus, SkipBack, SkipForward, Trash2 } from '~/ui/icons';
import { Slider } from '~/ui/Slider';
import { DEFAULT_ACCENT, useTheme } from '~/ui/theme';
import { useLayout } from '~/layout/layout';
import { setMiniLyrics } from '~/layout/MiniPlayer';
import { Card, Choice, Row, Toggle } from '~/settings/rows';

const THEMES_HELP = 'https://github.com/LuckiRakki/rakki/blob/main/docs/THEMES.md';

/** Themes: Rakki's own look, the built-in ones, and .css files you import (docs/THEMES.md). */
function ThemeCard() {
  const { active, imported, setActive, importFile, remove } = useThemes();
  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.css,text/css';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      importFile(file).then(
        (t) => toast(`Using ${t.meta.name}`),
        (e: unknown) => toast(e instanceof ThemeError ? e.message : "Couldn't import that theme."),
      );
    };
    input.click();
  };
  return (
    <Card title="Theme">
      {allThemes(imported).map((t) => {
        const on = t.id === active;
        return (
          <div key={t.id} className="setting theme-row">
            <div className="setting-text">
              <div className="setting-label">{t.meta.name}</div>
              <div className="setting-detail">{[t.meta.description, t.meta.author ? `By ${t.meta.author}` : null, t.builtIn ? null : 'Imported'].filter(Boolean).join(' · ')}</div>
            </div>
            <button className="iconbtn" aria-label={t.builtIn ? `Edit a copy of ${t.meta.name}` : `Edit ${t.meta.name}`} title={t.builtIn ? 'Edit a Copy' : 'Edit'} onClick={() => openThemeEditor(t.id)}>
              <Pencil size={17} />
            </button>
            {t.builtIn ? null : (
              <button className="iconbtn" aria-label={`Remove ${t.meta.name}`} title="Remove" onClick={() => remove(t.id)}>
                <Trash2 size={17} />
              </button>
            )}
            <button className={`secondary small${on ? ' on' : ''}`} aria-pressed={on} disabled={on} onClick={() => setActive(t.id)}>
              {on ? (
                <>
                  <Check size={15} /> In Use
                </>
              ) : (
                'Use'
              )}
            </button>
          </div>
        );
      })}
      <div className="setting">
        <div className="setting-text">
          <div className="setting-label">Make or Import a Theme</div>
          <div className="setting-detail">
            Write one here with a live preview, or import a .css file like a Spicetify theme.{' '}
            <span className="linkish" role="link" tabIndex={0} onClick={() => openLink(THEMES_HELP)} onKeyDown={(e) => e.key === 'Enter' && openLink(THEMES_HELP)}>
              How to make one
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="secondary small" onClick={() => openThemeEditor()}>
            <Plus size={15} /> New Theme
          </button>
          <button className="secondary small" onClick={pick}>
            <ArrowDownToLine size={15} /> Import
          </button>
        </div>
      </div>
    </Card>
  );
}

const GLASS_LABEL = { frost: 'Frost', clear: 'Clear', tint: 'Tint' } as const;

export function Look() {
  const { accent, lucid, set: setTheme } = useTheme();
  const [custom, setCustom] = useState(accent);
  const bg = useLook((s) => s.background);
  const setBg = useLook((s) => s.setBackground);
  const app = useLook((s) => s.app);
  const setApp = useLook((s) => s.setApp);
  const miniLyrics = useLayout((s) => s.miniLyrics);
  return (
    <>
      <Card title="Glass">
        <div className="glass-picks" role="group" aria-label="Glass">
          {(['frost', 'clear', 'tint'] as const).map((g) => (
            <button key={g} className={`glass-pick ${g}${app.glass === g ? ' on' : ''}`} aria-pressed={app.glass === g} onClick={() => setApp({ glass: g })}>
              <span className="swatch-flow">
                <span className="swatch-bar">
                  <SkipBack size={14} />
                  <Pause size={16} />
                  <SkipForward size={14} />
                </span>
              </span>
              {GLASS_LABEL[g]}
            </button>
          ))}
        </div>
        <Row label="Pause Button" detail="The accent circle, or a plain white icon.">
          <Choice
            label="Pause Button"
            value={app.pause}
            onChange={(pause) => setApp({ pause })}
            options={[
              { value: 'circle', label: 'Accent Circle' },
              { value: 'plain', label: 'Plain' },
            ]}
          />
        </Row>
      </Card>
      <ThemeCard />
      <Card title="Colour">
        <Toggle on={lucid} onChange={(v) => setTheme({ lucid: v })} label="Lucid" detail="The accent takes the colour of the album that's playing (your colour when nothing is)." />
        <div className="setting column">
          <div className="setting-label">Accent Colour</div>
          <div className="swatches">
            {[DEFAULT_ACCENT, ...SWATCHES].map((c) => (
              <button key={c} className={`swatch${accent.toLowerCase() === c.toLowerCase() ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setTheme({ accent: c })}>
                {accent.toLowerCase() === c.toLowerCase() ? <Check size={16} color="#000" /> : null}
              </button>
            ))}
            <form
              className="hex"
              onSubmit={(e) => {
                e.preventDefault();
                if (/^#[0-9a-f]{6}$/i.test(custom)) setTheme({ accent: custom });
              }}>
              <input className="field" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="#RRGGBB" aria-label="Your Own Colour (#RRGGBB)" />
            </form>
          </div>
        </div>
      </Card>
      <Card title="Mini Player">
        <Toggle
          on={miniLyrics}
          onChange={(on) => void setMiniLyrics(on)}
          label="Lyrics"
          detail="The line being sung under the controls, with its credit. The mini player grows to fit it."
        />
      </Card>
      <Card title="Size and Text">
        <Row label="App Size" detail="Everything bigger or smaller, like zooming a browser.">
          <Slider label="App Size" value={app.size} min={0.8} max={1.5} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(size) => setApp({ size })} />
        </Row>
        <Row label="Typeface" detail="Figtree, as on the phone, Inter, or this computer's own.">
          <Choice
            label="Typeface"
            value={app.font}
            onChange={(font) => setApp({ font })}
            options={[
              { value: 'figtree', label: 'Figtree' },
              { value: 'inter', label: 'Inter' },
              { value: 'system', label: 'System' },
            ]}
          />
        </Row>
      </Card>
      <Card title="Shape">
        <Row label="Corners" detail="Of covers, cards, rows and panels.">
          <Choice
            label="Corners"
            value={app.corners}
            onChange={(corners) => setApp({ corners })}
            options={[
              { value: 'rounded', label: 'Rounded' },
              { value: 'soft', label: 'Soft' },
              { value: 'square', label: 'Square' },
            ]}
          />
        </Row>
        <Row label="Spacing" detail="Compact fits more songs and covers on screen.">
          <Choice
            label="Spacing"
            value={app.density}
            onChange={(density) => setApp({ density })}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </Row>
        <Toggle on={app.reduceMotion} onChange={(reduceMotion) => setApp({ reduceMotion })} label="Reduce Motion" detail="Pages and panels appear without sliding, and backgrounds hold still." />
        <div className="setting">
          <button className="secondary small" disabled={JSON.stringify(app) === JSON.stringify(APP_LOOK)} onClick={() => setApp(APP_LOOK)}>
            Back to the Default Look
          </button>
        </div>
      </Card>
      <Card title="Backgrounds">
        <Row label="Full Player and Video" detail="The cover (or the video) flows like liquid behind them, as in Spicy Lyrics.">
          <Choice
            label="Background Motion"
            value={bg.motion}
            onChange={(motion) => setBg({ motion })}
            options={[
              { value: 'lively', label: 'Lively' },
              { value: 'calm', label: 'Calm' },
              { value: 'still', label: 'Still' },
            ]}
          />
        </Row>
        <Toggle
          on={bg.followMusic}
          onChange={(followMusic) => setBg({ followMusic })}
          label="Moves with the Music"
          detail="Faster when it's louder, with a push on each beat. Only Rakki's own sound is listened to."
        />
      </Card>
    </>
  );
}
