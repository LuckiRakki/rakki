// The Devices button (player bar), like Spotify's device list: your other Rakki apps signed in to
// this server and what each is playing (docs/REMOTE_PLAYBACK.md). Click one to control it from
// the player bar, or move playback: Play here (take it over) or Play on it (send it there).
// Asks the server every few seconds while open. Moving playback closes the list at once; a toast
// says when it's playing on the other side (or why not).
import { ArrowDownToLine, ArrowUpFromLine, Monitor, MonitorSpeaker, Pause, Play, SkipBack, SkipForward, Smartphone } from '~/ui/icons';
import { useEffect, useRef, useState } from 'react';

import { otherRakkiDevices, positionNow, type RakkiDevice } from '@/remote/devices';
import { useAuth } from '~/auth/session';
import { usePlayer } from '~/player/store';
import { useRemote } from '~/player/remote';
import { Artwork, formatTime, ticksToSeconds } from '~/ui/parts';

const REFRESH_MS = 4000;

export const isPhone = (d: { name: string }) => /iphone|ipad|ios|android|phone/i.test(d.name);

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function DeviceRow({ d, onPicked }: { d: RakkiDevice; onPicked(): void }) {
  const [, tick] = useState(0);
  const target = useRemote((s) => s.target);
  const hasQueueHere = usePlayer((s) => s.queue.length > 0 && !s.queue[s.index]?.Radio);
  useEffect(() => {
    if (!d.item || d.paused) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [d]);
  const Icon = isPhone(d) ? Smartphone : Monitor;
  const length = ticksToSeconds(d.item?.RunTimeTicks);
  const picked = target?.sessionId === d.sessionId;
  const r = useRemote.getState();
  const send = (cmd: 'PlayPause' | 'NextTrack' | 'PreviousTrack') => {
    if (!picked) r.setTarget(d);
    useRemote.getState().command(cmd);
  };
  return (
    <div className={`device${d.item && !d.paused ? ' playing' : ''}${picked ? ' picked' : ''}`}>
      <Icon size={20} className="device-icon" />
      <div className="t">
        <button
          className="device-pick"
          disabled={!d.controllable}
          title={d.controllable ? `Control ${d.name} from here` : undefined}
          onClick={() => {
            r.setTarget(picked ? null : d);
            onPicked();
          }}>
          <span className="name">{d.name}</span>
          {picked ? <span className="device-tag">Controlling</span> : null}
        </button>
        {d.item ? (
          <div className="device-song">
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
          </div>
        ) : (
          <div className="sub">Not playing · seen {ago(d.reportedAt)}</div>
        )}
        {d.controllable ? (
          <div className="device-actions">
            {d.item ? (
              <>
                <button className="iconbtn" aria-label="Previous" title="Previous" onClick={() => send('PreviousTrack')}>
                  <SkipBack size={16} />
                </button>
                <button className="iconbtn" aria-label={d.paused ? 'Play' : 'Pause'} title={d.paused ? 'Play' : 'Pause'} onClick={() => send('PlayPause')}>
                  {d.paused ? <Play size={16} /> : <Pause size={16} />}
                </button>
                <button className="iconbtn" aria-label="Next" title="Next" onClick={() => send('NextTrack')}>
                  <SkipForward size={16} />
                </button>
                <span className="spacer" />
                <button
                  className="device-btn"
                  onClick={() => {
                    onPicked();
                    void r.playHere(d);
                  }}
                  title={`Take over what ${d.name} is playing, at the same moment`}>
                  <ArrowDownToLine size={14} /> Play here
                </button>
              </>
            ) : (
              <span className="spacer" />
            )}
            {hasQueueHere ? (
              <button
                className="device-btn"
                onClick={() => {
                  onPicked();
                  void r.playOn(d);
                }}
                title={`Send this computer's queue to ${d.name}, at the same moment`}>
                <ArrowUpFromLine size={14} /> Play on {isPhone(d) ? 'phone' : 'it'}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="sub">Update Rakki on this device to control it from here.</div>
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
  const target = useRemote((s) => s.target);
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
      <button
        className={`iconbtn${open || playingElsewhere || target ? ' on' : ''}${target ? ' dot' : ''}`}
        aria-label="Your devices"
        title={target ? `Controlling ${target.name}` : 'Your devices'}
        onClick={() => setOpen(!open)}>
        <MonitorSpeaker size={20} />
      </button>
      {open ? (
        <div className="devices-pop">
          <h3>Your devices</h3>
          <div className={`device current${target ? '' : ' picked'}`}>
            <Monitor size={20} className="device-icon" />
            <div className="t">
              <button className="device-pick" onClick={() => useRemote.getState().setTarget(null)} title="Control this computer">
                <span className="name">This computer</span>
                {target ? null : <span className="device-tag">Controlling</span>}
              </button>
              <div className="sub">{here ? (playingHere ? `Playing ${here.Name}` : `Paused: ${here.Name}`) : 'Nothing playing here'}</div>
            </div>
          </div>
          {devices === null && !error ? <div className="sub pad">Looking for your other Rakki apps</div> : null}
          {error ? <div className="sub pad">Couldn't ask the server.</div> : null}
          {devices?.map((d) => <DeviceRow key={d.sessionId} d={d} onPicked={() => setOpen(false)} />)}
          {devices && !devices.length ? <div className="sub pad">No other Rakki apps are signed in right now. Open Rakki on your phone to see it here.</div> : null}
          <div className="devices-note">An iPhone takes commands while Rakki is open or playing on it.</div>
        </div>
      ) : null}
    </div>
  );
}
