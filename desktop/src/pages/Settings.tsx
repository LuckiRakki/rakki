// Settings: your account, the look (accent or Lucid), playback, lyrics and Last.fm. Playback and
// Last.fm are the phone app's settings (shared store), so they behave the same.
import { Check, LogOut } from 'lucide-react';
import { useState } from 'react';

import { checkLastfmKey, LastfmError } from '@/lib/lastfm';
import { SWATCHES } from '@/appearance/presets';
import { BITRATE_OPTIONS, useSettings, type Bitrate } from '@/settings/store';
import { useAuth } from '~/auth/session';
import { openUpdate, useUpdate } from '~/lib/updateCheck';
import { useDiscord } from '~/player/discord';
import { DEFAULT_ACCENT, useTheme } from '~/ui/theme';
import pkg from '../../package.json';

function Toggle({ on, onChange, label, detail }: { on: boolean; onChange(v: boolean): void; label: string; detail?: string }) {
  return (
    <label className="setting">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        {detail ? <div className="setting-detail">{detail}</div> : null}
      </div>
      <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
        <span />
      </button>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      <div className="settings-card">{children}</div>
    </section>
  );
}

function DiscordSection() {
  const d = useDiscord();
  const [id, setId] = useState(d.appId);
  const valid = /^\d{15,22}$/.test(id.trim());
  return (
    <Section title="Discord">
      <Toggle
        on={d.enabled}
        onChange={(v) => d.set({ enabled: v })}
        label="Show what you're listening to"
        detail="Your Discord profile shows the song, artists and a time bar while Rakki plays (the Discord app must be open on this computer)."
      />
      <div className="setting column">
        <div className="setting-label">Application ID</div>
        <div className="setting-detail">
          Discord shows the name of an application you make, once: open discord.com/developers/applications, choose New Application, name it Rakki (that's the
          name people see), and copy its Application ID here. For a picture when Discord can't find the album's cover, upload Rakki's icon under Rich Presence, Art
          Assets, named rakki.
        </div>
        <form
          className="row-form"
          onSubmit={(e) => {
            e.preventDefault();
            d.set({ appId: id.trim() });
          }}>
          <input className="field" value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. 1234567890123456789" spellCheck={false} inputMode="numeric" />
          <button className="secondary small" disabled={!valid || id.trim() === d.appId}>
            Save
          </button>
        </form>
        {d.error ? <div className="setting-detail error">{d.error}</div> : null}
        <div className="setting-detail">
          Discord only shows pictures from public addresses its servers can download, so covers come from Apple's public iTunes search (by artist and album
          name), else Last.fm with your key.
        </div>
      </div>
    </Section>
  );
}

export function Settings() {
  const session = useAuth((s) => s.session);
  const client = useAuth((s) => s.client);
  const { accent, lucid, set: setTheme } = useTheme();
  const s = useSettings();
  const update = useUpdate((u) => u.version);
  const [key, setKey] = useState(s.lastfmApiKey);
  const [keyState, setKeyState] = useState<string | null>(null);
  const [custom, setCustom] = useState(accent);
  const avatar = session && client ? client.userImageUrl({ Id: session.userId }, 160) : undefined;

  return (
    <div className="page settings">
      <h1 style={{ marginBottom: 24 }}>Settings</h1>

      <Section title="Account">
        <div className="account">
          <div className="avatar big">{avatar ? <img src={avatar} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} /> : null}<span>{session?.userName.slice(0, 1).toUpperCase()}</span></div>
          <div style={{ flex: 1 }}>
            <div className="setting-label">{session?.userName}</div>
            <div className="setting-detail">
              {session?.serverName} · {session?.serverUrl}
            </div>
          </div>
          <button className="secondary small" onClick={() => useAuth.getState().signOut()}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </Section>

      <Section title="Look">
        <Toggle on={lucid} onChange={(v) => setTheme({ lucid: v })} label="Lucid" detail="The accent takes the colour of the album that's playing (your colour when nothing is)." />
        <div className="setting column">
          <div className="setting-label">Accent colour</div>
          <div className="swatches">
            {[DEFAULT_ACCENT, ...SWATCHES].map((c) => (
              <button key={c} className={`swatch${accent.toLowerCase() === c.toLowerCase() ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setTheme({ accent: c })}>
                {accent.toLowerCase() === c.toLowerCase() ? <Check size={14} color="#000" /> : null}
              </button>
            ))}
            <form
              className="hex"
              onSubmit={(e) => {
                e.preventDefault();
                if (/^#[0-9a-f]{6}$/i.test(custom)) setTheme({ accent: custom });
              }}>
              <input className="field" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="#RRGGBB" />
            </form>
          </div>
        </div>
      </Section>

      <Section title="Playback">
        <div className="setting">
          <div className="setting-text">
            <div className="setting-label">Streaming quality</div>
            <div className="setting-detail">Original plays the file as it is (mpv plays every format). Lower qualities are converted to AAC by your server.</div>
          </div>
          <label className="select">
            <select value={s.wifiBitrate} onChange={(e) => s.set('wifiBitrate', Number(e.target.value) as Bitrate)}>
              {BITRATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({o.detail})
                </option>
              ))}
            </select>
          </label>
        </div>
        <Toggle on={s.normalize} onChange={(v) => s.set('normalize', v)} label="Volume normalization" detail="Songs play at the same loudness (Jellyfin's loudness measurement)." />
        <Toggle on={s.autoplay} onChange={(v) => s.set('autoplay', v)} label="Autoplay" detail="When the queue ends, keep going with similar songs." />
      </Section>

      <Section title="Lyrics">
        <div className="setting">
          <div className="setting-text">
            <div className="setting-label">Lyrics style</div>
            <div className="setting-detail">Spicy: word by word, as on the phone (the full player's lyrics). Regular: line by line. Also switchable in the full player.</div>
          </div>
          <label className="select">
            <select value={s.lyricsMode} onChange={(e) => s.set('lyricsMode', e.target.value as 'spicy' | 'regular')}>
              <option value="spicy">Spicy</option>
              <option value="regular">Regular</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title="Last.fm">
        <div className="setting column">
          <div className="setting-label">API key</div>
          <div className="setting-detail">
            Worldwide play counts on artist and album pages, smarter radio. Shared with your phone and the Rakki plugin on your server, so it only needs entering once.
          </div>
          <form
            className="row-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setKeyState('Checking...');
              try {
                await checkLastfmKey(key);
                s.set('lastfmApiKey', key.trim());
                setKeyState('Works.');
              } catch (err) {
                setKeyState(err instanceof LastfmError ? err.message : "That key didn't work.");
              }
            }}>
            <input className="field" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your API key" spellCheck={false} />
            <button className="secondary small" disabled={!key.trim()}>
              Check and save
            </button>
          </form>
          {keyState ? <div className="setting-detail">{keyState}</div> : null}
        </div>
        <Toggle on={s.lastfmAlbumPlays} onChange={(v) => s.set('lastfmAlbumPlays', v)} label="Plays on album pages" detail="Each song's worldwide plays from Last.fm." />
        <Toggle on={s.popularSort === 'lastfm'} onChange={(v) => s.set('popularSort', v ? 'lastfm' : 'mine')} label="Popular by worldwide plays" detail="Artist pages' Popular by Last.fm (off: by your own plays)." />
      </Section>

      <DiscordSection />

      <Section title="About">
        <div className="setting">
          <div className="setting-text">
            <div className="setting-label">Rakki for desktop {pkg.version}</div>
            {update ? (
              <div className="setting-detail">
                Rakki {update} is out.{' '}
                <span className="linkish" onClick={openUpdate}>
                  Download it
                </span>
              </div>
            ) : null}
            <div className="setting-detail">Jellyfin music, word by word. Music plays through mpv; closing the window keeps it playing in the tray.</div>
          </div>
        </div>
      </Section>
    </div>
  );
}
