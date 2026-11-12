// Settings → Connections: Last.fm, Discord and MRQ.
import { useState } from 'react';

import { checkLastfmKey, LastfmError } from '@/lib/lastfm';
import { useSettings } from '@/settings/store';
import { inTauri } from '~/lib/tauri';
import { mrqVersion, normalizeMrqUrl, useMrq } from '~/mrq/client';
import { GITHUB_BUTTON_LABEL, SONG_BUTTON_LABEL, useDiscord } from '~/player/discord';
import { currentPosition, usePlayer } from '~/player/store';
import { Music } from '~/ui/icons';
import { Artwork, formatTime } from '~/ui/parts';
import { Card, Choice, More, Row, Toggle } from '~/settings/rows';

export function LastfmCard() {
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

export function DiscordCard() {
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
export function MrqCard() {
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
