// The Devices button (player bar): your other Rakki apps signed in to this server and what each
// is playing, like Spotify's device list (phase 1 of docs/REMOTE_PLAYBACK.md: seeing them;
// controlling them and moving playback come next). Asks the server every few seconds while open.
import { MonitorSpeaker, Monitor, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { otherRakkiDevices, positionNow, type RakkiDevice } from '@/remote/devices';
import { useAuth } from '~/auth/session';
import { go } from '~/nav';
import { usePlayer } from '~/player/store';
import { Artwork, formatTime, ticksToSeconds } from '~/ui/parts';

const REFRESH_MS = 5000;

const isPhone = (d: RakkiDevice) => /iphone|ipad|ios|android|phone/i.test(d.name);

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function DeviceRow({ d }: { d: RakkiDevice }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!d.item || d.paused) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [d]);
  const Icon = isPhone(d) ? Smartphone : Monitor;
  const length = ticksToSeconds(d.item?.RunTimeTicks);
  return (
    <div className={`device${d.item && !d.paused ? ' playing' : ''}`}>
      <Icon size={20} className="device-icon" />
      <div className="t">
        <div className="name">{d.name}</div>
        {d.item ? (
          <button className="device-song" onClick={() => d.item?.AlbumId && go({ name: 'album', id: d.item.AlbumId })} title="Open the album">
            <Artwork item={d.item} size={80} className="thumb" />
            <span className="t">
              <span className="song">{d.item.Name}</span>
              <span className="sub">
                {d.item.Artists?.join(', ') ?? d.item.AlbumArtist}
                {' · '}
                {d.paused ? 'Paused' : 'Playing'} {formatTime(Math.min(positionNow(d), length || Infinity))}
                {length ? ` / ${formatTime(length)}` : ''}
              </span>
            </span>
          </button>
        ) : (
          <div className="sub">Not playing · seen {ago(d.reportedAt)}</div>
        )}
      </div>
    </div>
  );
}

export function DevicesButton() {
  const client = useAuth((s) => s.client);
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<RakkiDevice[] | null>(null);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !client) return;
    let alive = true;
    const load = () =>
      otherRakkiDevices(client)
        .then((d) => alive && (setDevices(d), setError(false)))
        .catch(() => alive && setError(true));
    void load();
    const id = setInterval(load, REFRESH_MS);
    const outside = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', esc);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', esc);
    };
  }, [open, client]);

  const here = usePlayer((s) => s.queue[s.index]);
  const playingHere = usePlayer((s) => s.playing);
  const playingElsewhere = devices?.some((d) => d.item && !d.paused);
  return (
    <div className="devices" ref={box}>
      <button className={`iconbtn${open || playingElsewhere ? ' on' : ''}`} aria-label="Your devices" title="Your devices" onClick={() => setOpen(!open)}>
        <MonitorSpeaker size={18} />
      </button>
      {open ? (
        <div className="devices-pop">
          <h3>Your devices</h3>
          <div className="device current">
            <Monitor size={20} className="device-icon" />
            <div className="t">
              <div className="name">This computer</div>
              <div className="sub">{here ? (playingHere ? `Playing ${here.Name}` : `Paused: ${here.Name}`) : 'Nothing playing here'}</div>
            </div>
          </div>
          {devices === null && !error ? <div className="sub pad">Looking…</div> : null}
          {error ? <div className="sub pad">Couldn't ask the server.</div> : null}
          {devices?.map((d) => <DeviceRow key={d.sessionId} d={d} />)}
          {devices && !devices.length ? <div className="sub pad">No other Rakki apps are signed in right now. Open Rakki on your phone to see it here.</div> : null}
          <div className="devices-note">Moving playback between devices is coming.</div>
        </div>
      ) : null}
    </div>
  );
}
