// Settings, one group at a time (the list on the left): account, look (accent, Lucid, the
// moving backgrounds), lyrics, the visualizer, playback, keyboard shortcuts, connections
// (Last.fm, Discord, MRQ) and about. Each group shows the everyday choices; the rest folds away under More options.
// Playback, lyrics and Last.fm are the phone app's settings (shared store), so they behave the
// same.
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

import { checkLastfmKey, LastfmError } from '@/lib/lastfm';
import { SWATCHES } from '@/appearance/presets';
import { BITRATE_OPTIONS, useSettings, type Bitrate } from '@/settings/store';
import { Visualizer } from '~/audio/Visualizer';
import { useAuth } from '~/auth/session';
import { dataFolder } from '~/lib/kv';
import { inTauri } from '~/lib/tauri';
import { installUpdate, useUpdate } from '~/lib/updateCheck';
import { mrqVersion, normalizeMrqUrl, useMrq } from '~/mrq/client';
import { useNav } from '~/nav';
import { GITHUB_BUTTON_LABEL, SONG_BUTTON_LABEL, useDiscord } from '~/player/discord';
import { currentPosition, usePlayer } from '~/player/store';
import { APP_LOOK, FEISHIN, LYRICS_SIZE, presetOf, useLook, VISUALIZER_PRESETS, type VisualizerLook } from '~/settings/look';
import {
  comboFromEvent,
  comboKeys,
  conflictOf,
  DEFAULT_BINDINGS,
  isReserved,
  SHORTCUT_ACTIONS,
  useShortcuts,
  type ShortcutId,
} from '~/settings/shortcuts';
import { ThemeError } from '~/themes/format';
import { allThemes, useThemes } from '~/themes/themes';
import { openLink } from '~/lib/links';
import { toast } from '~/ui/overlays';
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, LogOut, Music, Plus, Trash2, Undo, X, type Icon } from '~/ui/icons';
import { Avatar } from '~/ui/Avatar';
import { Artwork, formatTime } from '~/ui/parts';
import { Slider } from '~/ui/Slider';
import { DEFAULT_ACCENT, useTheme } from '~/ui/theme';
import pkg from '../../package.json';

// ---- Pieces ----

function Toggle({ on, onChange, label, detail }: { on: boolean; onChange(v: boolean): void; label: string; detail?: string }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        {detail ? <div className="setting-detail">{detail}</div> : null}
      </div>
      <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
        <span />
      </button>
    </div>
  );
}

/** A row with a label on the left and its control on the right. */
function Row({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        {detail ? <div className="setting-detail">{detail}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** A few choices as chips (one picked). */
function Choice<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange(v: T): void; label: string }) {
  return (
    <div className="choice" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The less-used options of a group, folded away until asked for. */
function More({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`more${open ? ' open' : ''}`}>
      <button className="more-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        More Options
        <ChevronDown size={16} />
      </button>
      {open ? <div className="more-body">{children}</div> : null}
    </div>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      {title ? <h2>{title}</h2> : null}
      <div className="settings-card">{children}</div>
    </section>
  );
}

// ---- Groups ----

function Account() {
  const session = useAuth((s) => s.session);
  return (
    <Card>
      <div className="account">
        <Avatar size={56} big />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="setting-label">{session?.userName}</div>
          <div className="setting-detail">
            {session?.serverName} · {session?.serverUrl}
          </div>
        </div>
        <button className="secondary small" onClick={() => useAuth.getState().signOut()}>
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </Card>
  );
}

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
          <div className="setting-label">Import a Theme</div>
          <div className="setting-detail">
            A .css file, like a Spicetify theme. Import an edited file again to update it.{' '}
            <span className="linkish" role="link" tabIndex={0} onClick={() => openLink(THEMES_HELP)} onKeyDown={(e) => e.key === 'Enter' && openLink(THEMES_HELP)}>
              How to make one
            </span>
          </div>
        </div>
        <button className="secondary small" onClick={pick}>
          <ArrowDownToLine size={15} /> Import
        </button>
      </div>
    </Card>
  );
}

function Look() {
  const { accent, lucid, set: setTheme } = useTheme();
  const [custom, setCustom] = useState(accent);
  const bg = useLook((s) => s.background);
  const setBg = useLook((s) => s.setBackground);
  const app = useLook((s) => s.app);
  const setApp = useLook((s) => s.setApp);
  return (
    <>
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
      <Card title="Size and Text">
        <Row label="App Size" detail="Everything bigger or smaller, like zooming a browser.">
          <Slider label="App Size" value={app.size} min={0.8} max={1.5} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(size) => setApp({ size })} />
        </Row>
        <Row label="Typeface" detail="Inter, as on the phone, or this computer's own.">
          <Choice
            label="Typeface"
            value={app.font}
            onChange={(font) => setApp({ font })}
            options={[
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

function Lyrics() {
  const s = useSettings();
  const size = useLook((l) => l.lyricsSize);
  const setSize = useLook((l) => l.setLyricsSize);
  return (
    <Card>
      <Row label="Text Size" detail="The full player's lyrics, scaled to their side of the window; turn it up to fill it. Also in the full player (Aa).">
        <Slider label="Lyrics Text Size" value={size} min={LYRICS_SIZE.min} max={LYRICS_SIZE.max} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={setSize} />
      </Row>
      <Row label="Lyrics Style" detail="Spicy: word by word, as on the phone. Regular: line by line. Also switchable in the full player.">
        <Choice
          label="Lyrics Style"
          value={s.lyricsMode}
          onChange={(v) => s.set('lyricsMode', v)}
          options={[
            { value: 'spicy', label: 'Spicy' },
            { value: 'regular', label: 'Regular' },
          ]}
        />
      </Row>
    </Card>
  );
}

function VisualizerSettings() {
  const look = useLook((s) => s.visualizer);
  const set = useLook((s) => s.setVisualizer);
  const preset = presetOf(look);
  const line = look.style === 'line';
  return (
    <>
      <div className="settings-visualizer">
        <Visualizer className="settings-visualizer-graph" />
        <span className="setting-detail">Plays along with whatever Rakki plays.</span>
      </div>
      <Card>
        <Row label="Look">
          <Choice
            label="Visualizer Look"
            value={preset ?? 'custom'}
            onChange={(id) => {
              const p = VISUALIZER_PRESETS.find((x) => x.id === id);
              if (p) set(p.look);
            }}
            options={[...VISUALIZER_PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(preset ? [] : [{ value: 'custom', label: 'Yours' }])]}
          />
        </Row>
        <Row label="Colours" detail="Accent follows Lucid: the colour of what's playing.">
          <Choice
            label="Colours"
            value={look.colors}
            onChange={(colors) => set({ colors })}
            options={[
              { value: 'mono', label: 'White and Grey' },
              { value: 'accent', label: 'Accent' },
              { value: 'prism', label: 'Prism' },
              { value: 'rainbow', label: 'Rainbow' },
            ]}
          />
        </Row>
        <More>
          <Row label="Drawn As">
            <Choice
              label="Drawn As"
              value={look.style}
              onChange={(style) => set({ style })}
              options={[
                { value: 'line', label: 'Line' },
                { value: 'bars', label: 'Bars' },
              ]}
            />
          </Row>
          {line ? (
            <Row label="Line Width">
              <Slider label="Line Width" value={look.lineWidth} min={0.5} max={4} step={0.1} show={(v) => v.toFixed(1)} onChange={(lineWidth) => set({ lineWidth })} />
            </Row>
          ) : (
            <Row label="Bars" detail="How finely the sound is split.">
              <Choice<VisualizerLook['barsPerOctave']>
                label="Bars per Octave"
                value={look.barsPerOctave}
                onChange={(barsPerOctave) => set({ barsPerOctave })}
                options={[
                  { value: 1, label: 'Few' },
                  { value: 3, label: 'Some' },
                  { value: 6, label: 'Many' },
                  { value: 12, label: 'Lots' },
                  { value: 24, label: 'Most' },
                ]}
              />
            </Row>
          )}
          <Row label={line ? 'Fill Under the Line' : 'Bar Opacity'}>
            <Slider label={line ? 'Fill Under the Line' : 'Bar Opacity'} value={look.fill} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(fill) => set({ fill })} />
          </Row>
          <Row label="Reflection" detail="A faint mirror under it.">
            <Choice
              label="Reflection"
              value={look.reflection}
              onChange={(reflection) => set({ reflection })}
              options={[
                { value: 0, label: 'Off' },
                { value: 0.25, label: 'Short' },
                { value: 0.5, label: 'Half' },
              ]}
            />
          </Row>
          <Row label="Lowest Sound Shown">
            <Choice
              label="Lowest Frequency"
              value={look.minFreq}
              onChange={(minFreq) => set({ minFreq })}
              options={[
                { value: 20, label: '20 Hz' },
                { value: 40, label: '40 Hz' },
                { value: 80, label: '80 Hz' },
              ]}
            />
          </Row>
          <Row label="Highest Sound Shown">
            <Choice
              label="Highest Frequency"
              value={look.maxFreq}
              onChange={(maxFreq) => set({ maxFreq })}
              options={[
                { value: 12000, label: '12 kHz' },
                { value: 16000, label: '16 kHz' },
                { value: 22050, label: '22 kHz' },
              ]}
            />
          </Row>
          <Row label="Smoothing" detail="Higher: calmer movement.">
            <Slider label="Smoothing" value={look.smoothing} min={0} max={0.9} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(smoothing) => set({ smoothing })} />
          </Row>
          <Toggle on={look.peaks} onChange={(peaks) => set({ peaks })} label="Peaks" detail="Marks that hold the highest points for a moment." />
          <div className="setting">
            <button className="secondary small" disabled={preset === 'feishin'} onClick={() => set(FEISHIN)}>
              Back to the Default Look
            </button>
          </div>
        </More>
      </Card>
    </>
  );
}

/** Start with the computer: in the tray, quietly, when you sign in (src-tauri autostart.rs). */
function StartupToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (inTauri) void invoke<boolean>('autostart_get').then(setOn).catch(() => setOn(false));
  }, []);
  if (!inTauri) return null;
  return (
    <>
      <Toggle
        on={!!on}
        onChange={(v) => {
          // Shown at once; back if the system says no.
          setOn(v);
          setNote(null);
          void invoke<boolean>('autostart_set', { on: v })
            .then(setOn)
            .catch((e) => {
              setOn(!v);
              setNote(`Couldn’t change it: ${String(e)}`);
            });
        }}
        label="Start with the Computer"
        detail="Rakki opens in the tray when you sign in to the computer, ready to play (the window stays closed)."
      />
      {note ? <div className="setting-detail error pad">{note}</div> : null}
    </>
  );
}

function Playback() {
  const s = useSettings();
  return (
    <Card>
      <Row label="Streaming Quality" detail="Original plays the file as it is (mpv plays every format). Lower qualities are converted to AAC by your server.">
        <label className="select">
          <select aria-label="Streaming Quality" value={s.wifiBitrate} onChange={(e) => s.set('wifiBitrate', Number(e.target.value) as Bitrate)}>
            {BITRATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.detail})
              </option>
            ))}
          </select>
        </label>
      </Row>
      <Toggle on={s.autoplay} onChange={(v) => s.set('autoplay', v)} label="Autoplay" detail="When the queue ends, keep going with similar songs." />
      <Toggle on={s.videoAutoplay} onChange={(v) => s.set('videoAutoplay', v)} label="Autoplay Music Videos" detail="When a video ends, the next in Up next follows after a short countdown." />
      <More>
        <Toggle on={s.normalize} onChange={(v) => s.set('normalize', v)} label="Volume Normalization" detail="Songs play at the same loudness (Jellyfin's loudness measurement)." />
        <StartupToggle />
      </More>
    </Card>
  );
}

// ---- Keyboard shortcuts ----

const sameKeys = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((k, i) => k === b[i]);
const actionLabel = (id: ShortcutId) => SHORTCUT_ACTIONS.find((a) => a.id === id)?.label ?? id;

/** The arrow keys, drawn as arrows (settings/shortcuts.ts names them with arrow characters). */
const ARROW_KEYS: Record<string, { icon: Icon; name: string }> = {
  '←': { icon: ArrowLeft, name: 'Left Arrow' },
  '→': { icon: ArrowRight, name: 'Right Arrow' },
  '↑': { icon: ArrowUp, name: 'Up Arrow' },
  '↓': { icon: ArrowDown, name: 'Down Arrow' },
};

/** A shortcut in words, for toasts and screen readers: "Ctrl+Left Arrow". */
const comboWords = (combo: string) => comboKeys(combo).map((k) => ARROW_KEYS[k]?.name ?? k).join('+');

/** A shortcut as keycaps. */
function Keys({ combo }: { combo: string }) {
  return (
    <span className="keys-caps">
      {comboKeys(combo).map((k, i) => {
        const Arrow = ARROW_KEYS[k]?.icon;
        return (
          <kbd key={i} aria-label={ARROW_KEYS[k]?.name}>
            {Arrow ? <Arrow size={14} /> : k}
          </kbd>
        );
      })}
    </span>
  );
}

/**
 * Waits for the new keys: the shortcut you press is taken as soon as it has a key besides
 * Ctrl, Alt and Shift (shown as you hold them). Esc or clicking away cancels.
 */
function KeyRecorder({ onKeys, onCancel, label }: { onKeys(combo: string): void; onCancel(): void; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [held, setHeld] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  // Shortcuts rest while keys are being recorded, so pressing Space here doesn't play.
  useEffect(() => {
    ref.current?.focus();
    useShortcuts.getState().setRecording(true);
    return () => useShortcuts.getState().setRecording(false);
  }, []);
  const mods = (e: ReactKeyboardEvent) => [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter((m): m is string => !!m);
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Tab') return onCancel();
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) return onCancel();
    const combo = comboFromEvent(e.nativeEvent);
    if (!combo) return setHeld(mods(e));
    if (isReserved(combo)) {
      setHeld([]);
      return setNote('Esc, Tab and Enter keep their usual jobs. Try another.');
    }
    onKeys(combo);
  };
  return (
    <span className="key-recorder-wrap">
      <button
        ref={ref}
        className="key-chip recording"
        aria-label={`Press the New Shortcut for ${label}`}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => setHeld(mods(e))}
        onBlur={onCancel}>
        {held.length ? (
          <span className="keys-caps">
            {held.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
            <span className="key-wait">…</span>
          </span>
        ) : (
          'Press the Keys'
        )}
      </button>
      {note ? <span className="key-note">{note}</span> : null}
    </span>
  );
}

function ShortcutRow({ id, label }: { id: ShortcutId; label: string }) {
  const combos = useShortcuts((s) => s.bindings[id] ?? []);
  /** Which shortcut is being replaced (its place), 'new' for an added one, null when not recording. */
  const [recording, setRecording] = useState<number | 'new' | null>(null);
  const changed = !sameKeys(combos, DEFAULT_BINDINGS[id]);

  const take = (combo: string) => {
    const s = useShortcuts.getState();
    const mine = s.bindings[id] ?? [];
    const next = recording === 'new' || recording === null ? [...mine, combo] : mine.map((c, i) => (i === recording ? combo : c));
    setRecording(null);
    // Used by another action: it moves here (the other loses it), and a toast says so.
    const other = conflictOf(combo, id);
    if (other) {
      s.setBinding(other, (s.bindings[other] ?? []).filter((c) => c !== combo));
      toast(`${comboWords(combo)} moved here from ${actionLabel(other)}`);
    }
    s.setBinding(id, [...new Set(next)]);
  };
  const remove = (i: number) => useShortcuts.getState().setBinding(id, combos.filter((_, j) => j !== i));

  return (
    <div className="setting shortcut-row">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
      </div>
      <div className="shortcut-keys">
        {combos.map((c, i) =>
          recording === i ? (
            <KeyRecorder key={c} label={label} onKeys={take} onCancel={() => setRecording(null)} />
          ) : (
            <span key={c} className="key-chip-wrap">
              <button className="key-chip" aria-label={`${label}: ${comboWords(c)}. Change`} title="Change" onClick={() => setRecording(i)}>
                <Keys combo={c} />
              </button>
              <button className="key-remove" aria-label={`Remove ${comboWords(c)} from ${label}`} title="Remove" onClick={() => remove(i)}>
                <X size={12} />
              </button>
            </span>
          ),
        )}
        {recording === 'new' ? (
          <KeyRecorder label={label} onKeys={take} onCancel={() => setRecording(null)} />
        ) : combos.length ? (
          combos.length < 3 ? (
            <button className="key-add" aria-label={`Add a Shortcut for ${label}`} title="Add Another" onClick={() => setRecording('new')}>
              <Plus size={15} />
            </button>
          ) : null
        ) : (
          <button className="key-chip empty" aria-label={`Add a Shortcut for ${label}`} onClick={() => setRecording('new')}>
            Add Shortcut
          </button>
        )}
        <button
          className={`key-reset${changed ? '' : ' hidden'}`}
          aria-label={`Back to the Default for ${label}`}
          title="Back to the Default"
          tabIndex={changed ? 0 : -1}
          aria-hidden={!changed}
          onClick={() => useShortcuts.getState().resetBinding(id)}>
          <Undo size={15} />
        </button>
      </div>
    </div>
  );
}

function Shortcuts() {
  const bindings = useShortcuts((s) => s.bindings);
  const groups = [...new Set(SHORTCUT_ACTIONS.map((a) => a.group))];
  const changed = SHORTCUT_ACTIONS.some((a) => !sameKeys(bindings[a.id], DEFAULT_BINDINGS[a.id]));
  return (
    <>
      <p className="settings-lead">
        Click a shortcut and press the keys you want instead; Esc cancels. Keys you give one action leave the one that had them. While you type in a
        box, most shortcuts wait so the keys can type.
      </p>
      {groups.map((g) => (
        <Card key={g} title={g}>
          {SHORTCUT_ACTIONS.filter((a) => a.group === g).map((a) => (
            <ShortcutRow key={a.id} id={a.id} label={a.label} />
          ))}
        </Card>
      ))}
      <div className="settings-foot">
        <button className="secondary small" disabled={!changed} onClick={() => useShortcuts.getState().resetAll()}>
          Back to the Default Shortcuts
        </button>
      </div>
    </>
  );
}

function LastfmCard() {
  const s = useSettings();
  const [key, setKey] = useState(s.lastfmApiKey);
  const [note, setNote] = useState<string | null>(null);
  return (
    <Card title="Last.fm">
      <div className="setting column">
        <div className="setting-label">API Key</div>
        <div className="setting-detail">
          Worldwide play counts on artist and album pages, smarter radio. Shared with your phone and the Rakki plugin on your server, so it only needs entering once.
        </div>
        <form
          className="row-form"
          onSubmit={(e) => {
            e.preventDefault();
            // Saved at once; Last.fm checks it behind the screen, and a key it refuses is undone.
            const before = s.lastfmApiKey;
            const typed = key.trim();
            s.set('lastfmApiKey', typed);
            setNote('Saved.');
            void checkLastfmKey(typed)
              .then(() => setNote('Saved. Last.fm accepted it.'))
              .catch((err) => {
                if (useSettings.getState().lastfmApiKey === typed) s.set('lastfmApiKey', before);
                setNote(`That key didn’t work, so the old one stays: ${err instanceof LastfmError ? err.message : 'Last.fm refused it.'}`);
              });
          }}>
          <input className="field" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your API key" aria-label="Last.fm API Key" spellCheck={false} />
          <button className="secondary small" disabled={!key.trim() || key.trim() === s.lastfmApiKey}>
            Save
          </button>
        </form>
        {note ? <div className="setting-detail">{note}</div> : null}
      </div>
      <More>
        <Toggle on={s.lastfmAlbumPlays} onChange={(v) => s.set('lastfmAlbumPlays', v)} label="Plays on Album Pages" detail="Each song's worldwide plays from Last.fm." />
        <Toggle on={s.popularSort === 'lastfm'} onChange={(v) => s.set('popularSort', v ? 'lastfm' : 'mine')} label="Popular by Worldwide Plays" detail="Artist pages' Popular by Last.fm (off: by your own plays)." />
      </More>
    </Card>
  );
}

function DiscordCard() {
  const d = useDiscord();
  const [id, setId] = useState(d.appId);
  const valid = id.trim() === '' || /^\d{15,22}$/.test(id.trim());
  return (
    <Card title="Discord">
      <Toggle
        on={d.enabled}
        onChange={(v) => d.set({ enabled: v })}
        label="Show What You're Listening To"
        detail={`Your Discord profile shows the song, artists and a time bar while Rakki plays (the Discord app must be open on this computer).${d.enabled && d.connected && !d.error ? ' Connected.' : ''}`}
      />
      {d.error ? <div className="setting-detail error pad">{d.error}</div> : null}
      <Row label="When Paused" detail="Show the song as paused, without the time bar, or clear your status. A pause of over 15 minutes clears it either way.">
        <Choice
          label="When Paused"
          value={d.whenPaused}
          onChange={(whenPaused) => d.set({ whenPaused })}
          options={[
            { value: 'show', label: 'Show Paused' },
            { value: 'clear', label: 'Clear' },
          ]}
        />
      </Row>
      <Toggle
        on={d.songButton}
        onChange={(v) => d.set({ songButton: v })}
        label="Song Button"
        detail="Opens the song on song.link, which has it on every music service (else a Spotify search)."
      />
      <Toggle on={d.githubButton} onChange={(v) => d.set({ githubButton: v })} label="Rakki Button" detail="Opens Rakki's page on GitHub, so friends can get it too." />
      <DiscordPreview />
      <More>
        <div className="setting column">
          <div className="setting-label">Application ID</div>
          <div className="setting-detail">
            Rakki uses its own Discord application, so your status reads Listening to Rakki. To show another name, make an application at
            discord.com/developers/applications and paste its Application ID here; leave it empty for Rakki's.
          </div>
          <form
            className="row-form"
            onSubmit={(e) => {
              e.preventDefault();
              d.set({ appId: id.trim() });
            }}>
            <input className="field" value={id} onChange={(e) => setId(e.target.value)} placeholder="Rakki's (leave empty)" aria-label="Discord Application ID" spellCheck={false} inputMode="numeric" />
            <button className="secondary small" disabled={!valid || id.trim() === d.appId}>
              Save
            </button>
          </form>
          <div className="setting-detail">
            Discord only shows pictures from public addresses its servers can download, so covers come from Apple's public iTunes search (by artist and album
            name), else Last.fm with your key.
          </div>
        </div>
      </More>
    </Card>
  );
}

/**
 * Roughly what your friends see on your profile: the song, a time bar and the buttons. Discord
 * never shows you your own buttons, so this is the only place you see them.
 */
function DiscordPreview() {
  const d = useDiscord();
  const item = usePlayer((s) => s.queue[s.index]);
  const duration = usePlayer((s) => s.duration);
  // A snapshot of where the song is; it doesn't tick (nothing moves while you read settings).
  const at = usePlayer((s) => Math.floor(currentPosition(s) / 5) * 5);
  const buttons = [d.songButton ? SONG_BUTTON_LABEL : null, d.githubButton ? GITHUB_BUTTON_LABEL : null].filter((b): b is string => !!b);
  const artists = item?.Artists?.join(', ') || item?.AlbumArtist;
  return (
    <div className={`setting column discord-preview-row${d.enabled ? '' : ' off'}`}>
      <div className="setting-text">
        <div className="setting-label">What Friends See</div>
        <div className="setting-detail">{d.enabled ? "Discord doesn't show you your own buttons; everyone else sees them." : "Turn on Show What You're Listening To first."}</div>
      </div>
      <div className="discord-preview" aria-label="Preview of your Discord status">
        <div className="dp-head">Listening to Rakki</div>
        <div className="dp-body">
          {item ? <Artwork item={item} size={120} className="dp-art" /> : <div className="artwork empty dp-art"><Music size={26} /></div>}
          <div className="dp-text">
            <div className="dp-title">{item?.Name ?? 'Song Title'}</div>
            <div className="dp-line">{item ? artists || 'Unknown Artist' : 'Artist'}</div>
            <div className="dp-line">{item ? (item.Album ?? '') : 'Album'}</div>
            <div className="dp-time">
              <span>{formatTime(item ? at : 72)}</span>
              <div className="dp-bar">
                <div style={{ width: `${Math.min(100, ((item ? at : 72) / Math.max(1, item ? duration : 214)) * 100)}%` }} />
              </div>
              <span>{formatTime(item ? duration : 214)}</span>
            </div>
          </div>
        </div>
        {buttons.map((b) => (
          <div key={b} className="dp-button">
            {b}
          </div>
        ))}
      </div>
    </div>
  );
}

/** MRQ, your tag editor on the server: its address turns on Edit Metadata (mrq/client.ts). */
function MrqCard() {
  const saved = useMrq((m) => m.url);
  const setUrl = useMrq((m) => m.setUrl);
  const [url, setTyped] = useState(saved);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const typed = normalizeMrqUrl(url);
  const test = (address: string, after: string) =>
    void mrqVersion(address)
      .then((v) => setNote({ text: `${after}MRQ ${v} answered.` }))
      .catch((e: unknown) => setNote({ text: `${after}${e instanceof Error ? e.message : 'MRQ didn’t answer.'}`, bad: true }));
  if (!inTauri) return null;
  return (
    <Card title="MRQ">
      <div className="setting column">
        <div className="setting-label">Address</div>
        <div className="setting-detail">
          Music Review Queue, your tag editor on the server. With its address here, right-click a song or an album and pick Edit Metadata to change its
          title, artists, album, genres, year, numbers or cover in the files themselves. Jellyfin reads them again straight after.
        </div>
        <form
          className="row-form"
          onSubmit={(e) => {
            e.preventDefault();
            // Saved at once; MRQ is asked behind the screen, and the answer shows under it.
            setUrl(typed);
            setTyped(typed);
            if (!typed) return setNote({ text: 'Removed. Edit Metadata is off.' });
            setNote({ text: 'Saved.' });
            test(typed, 'Saved. ');
          }}>
          <input className="field" value={url} onChange={(e) => setTyped(e.target.value)} placeholder="http://your-server:5000" aria-label="MRQ Address" spellCheck={false} />
          <button className="secondary small" disabled={typed === saved}>
            Save
          </button>
          <button type="button" className="secondary small" disabled={!saved || typed !== saved} onClick={() => test(saved, '')}>
            Test
          </button>
        </form>
        {note ? <div className={`setting-detail${note.bad ? ' error' : ''}`}>{note.text}</div> : null}
      </div>
    </Card>
  );
}

function About() {
  const update = useUpdate((u) => u.version);
  return (
    <Card>
      <div className="setting">
        <div className="setting-text">
          <div className="setting-label">Rakki for desktop {pkg.version}</div>
          {update ? (
            <div className="setting-detail">
              Rakki {update} is out.{' '}
              <span className="linkish" role="button" tabIndex={0} onClick={() => void installUpdate()} onKeyDown={(e) => e.key === 'Enter' && void installUpdate()}>
                Update and restart
              </span>
            </div>
          ) : null}
          <div className="setting-detail">Jellyfin music, word by word. Music plays through mpv; closing the window keeps it playing in the tray.</div>
        </div>
      </div>
      <DataFolder />
    </Card>
  );
}

/** Where Rakki keeps its settings, lyric timings and drafts (lib/kv.ts). */
function DataFolder() {
  const folder = dataFolder();
  if (!folder) return null;
  const sep = folder.includes('\\') ? '\\' : '/';
  return (
    <Row label="Your Data" detail={`Settings, lyric timings and drafts, as files you can open: ${folder}.${sep === '\\' ? " Your sign-in stays in Windows' Credential Manager." : ''}`}>
      <button className="secondary small" onClick={() => void revealItemInDir(`${folder}${sep}settings.json`).catch(() => toast("Couldn't open the folder"))}>
        Show Folder
      </button>
    </Row>
  );
}

const GROUPS: { id: string; label: string; view: () => ReactNode }[] = [
  { id: 'account', label: 'Account', view: () => <Account /> },
  { id: 'look', label: 'Look', view: () => <Look /> },
  { id: 'lyrics', label: 'Lyrics', view: () => <Lyrics /> },
  { id: 'visualizer', label: 'Visualizer', view: () => <VisualizerSettings /> },
  { id: 'playback', label: 'Playback', view: () => <Playback /> },
  { id: 'shortcuts', label: 'Shortcuts', view: () => <Shortcuts /> },
  {
    id: 'connections',
    label: 'Connections',
    view: () => (
      <>
        <LastfmCard />
        <DiscordCard />
        <MrqCard />
      </>
    ),
  },
  { id: 'about', label: 'About', view: () => <About /> },
];

export function Settings() {
  const route = useNav((s) => s.route);
  const asked = route.name === 'settings' ? route.section : undefined;
  const [group, setGroup] = useState(asked && GROUPS.some((g) => g.id === asked) ? asked : 'account');
  // Opened at a group from elsewhere (the full player's visualizer settings button).
  useEffect(() => {
    if (asked && GROUPS.some((g) => g.id === asked)) setGroup(asked);
  }, [asked, route]);
  const current = GROUPS.find((g) => g.id === group) ?? GROUPS[0];
  return (
    <div className="page settings">
      <h1>Settings</h1>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings Groups">
          {GROUPS.map((g) => (
            <button key={g.id} className={g.id === group ? 'on' : ''} aria-current={g.id === group ? 'page' : undefined} onClick={() => setGroup(g.id)}>
              {g.label}
            </button>
          ))}
        </nav>
        <div key={current.id} className="settings-body">
          {current.view()}
        </div>
      </div>
    </div>
  );
}
