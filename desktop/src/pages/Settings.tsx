// Settings, one group at a time (the list on the left): account, look (accent, Lucid, the
// moving backgrounds), lyrics, the visualizer, playback, connections (Last.fm, Discord) and
// about. Each group shows the everyday choices; the rest folds away under More options.
// Playback, lyrics and Last.fm are the phone app's settings (shared store), so they behave the
// same.
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState, type ReactNode } from 'react';

import { checkLastfmKey, LastfmError } from '@/lib/lastfm';
import { SWATCHES } from '@/appearance/presets';
import { BITRATE_OPTIONS, useSettings, type Bitrate } from '@/settings/store';
import { Visualizer } from '~/audio/Visualizer';
import { useAuth } from '~/auth/session';
import { inTauri } from '~/lib/tauri';
import { openUpdate, useUpdate } from '~/lib/updateCheck';
import { useNav } from '~/nav';
import { useDiscord } from '~/player/discord';
import { FEISHIN, LYRICS_SIZES, presetOf, useLook, VISUALIZER_PRESETS, type VisualizerLook } from '~/settings/look';
import { Check, ChevronDown, LogOut } from '~/ui/icons';
import { Avatar } from '~/ui/Avatar';
import { Range } from '~/ui/Range';
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

/** A slider with its value beside it. */
function Slider({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show(v: number): string; onChange(v: number): void }) {
  return (
    <div className="slider">
      <Range label={label} value={value - min} max={max - min} step={step} valueText={(v) => show(v + min)} onSet={(v) => onChange(Math.round((v + min) / step) * step)} />
      <span>{show(value)}</span>
    </div>
  );
}

/** The less-used options of a group, folded away until asked for. */
function More({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`more${open ? ' open' : ''}`}>
      <button className="more-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        More options
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

function Look() {
  const { accent, lucid, set: setTheme } = useTheme();
  const [custom, setCustom] = useState(accent);
  const bg = useLook((s) => s.background);
  const setBg = useLook((s) => s.setBackground);
  return (
    <>
      <Card title="Colour">
        <Toggle on={lucid} onChange={(v) => setTheme({ lucid: v })} label="Lucid" detail="The accent takes the colour of the album that's playing (your colour when nothing is)." />
        <div className="setting column">
          <div className="setting-label">Accent colour</div>
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
              <input className="field" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="#RRGGBB" aria-label="Your own colour (#RRGGBB)" />
            </form>
          </div>
        </div>
      </Card>
      <Card title="Backgrounds">
        <Row label="Full player and video" detail="The cover (or the video) flows like liquid behind them, as in Spicy Lyrics.">
          <Choice
            label="Background motion"
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
          label="Moves with the music"
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
      <Row label="Text size" detail="The full player's lyrics, scaled to their side of the window. Fill uses all of it.">
        <Choice label="Lyrics text size" value={size} onChange={setSize} options={LYRICS_SIZES} />
      </Row>
      <Row label="Lyrics style" detail="Spicy: word by word, as on the phone. Regular: line by line. Also switchable in the full player.">
        <Choice
          label="Lyrics style"
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
            label="Visualizer look"
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
              { value: 'mono', label: 'White and grey' },
              { value: 'accent', label: 'Accent' },
              { value: 'prism', label: 'Prism' },
              { value: 'rainbow', label: 'Rainbow' },
            ]}
          />
        </Row>
        <More>
          <Row label="Drawn as">
            <Choice
              label="Drawn as"
              value={look.style}
              onChange={(style) => set({ style })}
              options={[
                { value: 'line', label: 'Line' },
                { value: 'bars', label: 'Bars' },
              ]}
            />
          </Row>
          {line ? (
            <Row label="Line width">
              <Slider label="Line width" value={look.lineWidth} min={0.5} max={4} step={0.1} show={(v) => v.toFixed(1)} onChange={(lineWidth) => set({ lineWidth })} />
            </Row>
          ) : (
            <Row label="Bars" detail="How finely the sound is split.">
              <Choice<VisualizerLook['barsPerOctave']>
                label="Bars per octave"
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
          <Row label={line ? 'Fill under the line' : 'Bar opacity'}>
            <Slider label={line ? 'Fill under the line' : 'Bar opacity'} value={look.fill} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(fill) => set({ fill })} />
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
          <Row label="Lowest sound shown">
            <Choice
              label="Lowest frequency"
              value={look.minFreq}
              onChange={(minFreq) => set({ minFreq })}
              options={[
                { value: 20, label: '20 Hz' },
                { value: 40, label: '40 Hz' },
                { value: 80, label: '80 Hz' },
              ]}
            />
          </Row>
          <Row label="Highest sound shown">
            <Choice
              label="Highest frequency"
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
              Back to the default look
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
        label="Start with the computer"
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
      <Row label="Streaming quality" detail="Original plays the file as it is (mpv plays every format). Lower qualities are converted to AAC by your server.">
        <label className="select">
          <select aria-label="Streaming quality" value={s.wifiBitrate} onChange={(e) => s.set('wifiBitrate', Number(e.target.value) as Bitrate)}>
            {BITRATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.detail})
              </option>
            ))}
          </select>
        </label>
      </Row>
      <Toggle on={s.autoplay} onChange={(v) => s.set('autoplay', v)} label="Autoplay" detail="When the queue ends, keep going with similar songs." />
      <Toggle on={s.videoAutoplay} onChange={(v) => s.set('videoAutoplay', v)} label="Autoplay music videos" detail="When a video ends, the next in Up next follows after a short countdown." />
      <More>
        <Toggle on={s.normalize} onChange={(v) => s.set('normalize', v)} label="Volume normalization" detail="Songs play at the same loudness (Jellyfin's loudness measurement)." />
        <StartupToggle />
      </More>
    </Card>
  );
}

function LastfmCard() {
  const s = useSettings();
  const [key, setKey] = useState(s.lastfmApiKey);
  const [note, setNote] = useState<string | null>(null);
  return (
    <Card title="Last.fm">
      <div className="setting column">
        <div className="setting-label">API key</div>
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
          <input className="field" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your API key" aria-label="Last.fm API key" spellCheck={false} />
          <button className="secondary small" disabled={!key.trim() || key.trim() === s.lastfmApiKey}>
            Save
          </button>
        </form>
        {note ? <div className="setting-detail">{note}</div> : null}
      </div>
      <More>
        <Toggle on={s.lastfmAlbumPlays} onChange={(v) => s.set('lastfmAlbumPlays', v)} label="Plays on album pages" detail="Each song's worldwide plays from Last.fm." />
        <Toggle on={s.popularSort === 'lastfm'} onChange={(v) => s.set('popularSort', v ? 'lastfm' : 'mine')} label="Popular by worldwide plays" detail="Artist pages' Popular by Last.fm (off: by your own plays)." />
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
        label="Show what you're listening to"
        detail="Your Discord profile shows the song, artists and a time bar while Rakki plays (the Discord app must be open on this computer)."
      />
      {d.error ? <div className="setting-detail error pad">{d.error}</div> : null}
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
              <span className="linkish" role="link" tabIndex={0} onClick={openUpdate} onKeyDown={(e) => e.key === 'Enter' && openUpdate()}>
                Download it
              </span>
            </div>
          ) : null}
          <div className="setting-detail">Jellyfin music, word by word. Music plays through mpv; closing the window keeps it playing in the tray.</div>
        </div>
      </div>
    </Card>
  );
}

const GROUPS: { id: string; label: string; view: () => ReactNode }[] = [
  { id: 'account', label: 'Account', view: () => <Account /> },
  { id: 'look', label: 'Look', view: () => <Look /> },
  { id: 'lyrics', label: 'Lyrics', view: () => <Lyrics /> },
  { id: 'visualizer', label: 'Visualizer', view: () => <VisualizerSettings /> },
  { id: 'playback', label: 'Playback', view: () => <Playback /> },
  {
    id: 'connections',
    label: 'Connections',
    view: () => (
      <>
        <LastfmCard />
        <DiscordCard />
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
        <nav className="settings-nav" aria-label="Settings groups">
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
