// Connect, like Spotify's: the Devices button opens a list of your Rakki apps (this computer and
// the others signed in to this server, docs/REMOTE_PLAYBACK.md) in the right sidebar. Click one
// to listen there: the music moves over at the same moment in the song and the player bar
// controls that device. Click This computer to bring it back. A device with nothing to move
// to it (nothing playing here) is simply controlled. The list asks the server every few
// seconds while open; a toast says when the music has moved (or why not).
import { useEffect, useState } from 'react';

import { otherRakkiDevices, type RakkiDevice } from '@/remote/devices';
import { useAuth } from '~/auth/session';
import { useLayout } from '~/layout/layout';
import { useRemote } from '~/player/remote';
import { usePlayer } from '~/player/store';
import { ChevronDown, Monitor, MonitorSpeaker, Smartphone, X } from '~/ui/icons';

const REFRESH_MS = 4000;

export const isPhone = (d: { name: string }) => /iphone|ipad|ios|android|phone/i.test(d.name);

/** The player bar's button: opens Connect in the right sidebar. */
export function DevicesButton() {
  const open = useLayout((s) => s.panel === 'devices');
  const target = useRemote((s) => s.target);
  return (
    <button
      className={`iconbtn${open || target ? ' on' : ''}${target ? ' dot' : ''}`}
      aria-label={target ? `Listening on ${target.name}` : 'Connect to a Device'}
      aria-pressed={open}
      title={target ? `Listening on ${target.name}` : 'Connect to a Device'}
      onClick={() => useLayout.getState().togglePanel('devices')}>
      <MonitorSpeaker size={20} />
    </button>
  );
}

function nowLine(d: RakkiDevice): string {
  if (!d.item) return 'Not playing';
  const who = d.item.Artists?.join(', ') ?? d.item.AlbumArtist;
  return `${d.paused ? 'Paused' : 'Playing'}: ${d.item.Name}${who ? ` · ${who}` : ''}`;
}

/** One device; the one you're listening on is lit. */
function Row({ icon: Icon, name, sub, on, paused, disabled, onPick }: { icon: typeof Monitor; name: string; sub: string; on: boolean; paused: boolean; disabled?: boolean; onPick(): void }) {
  return (
    <button className={`connect-row${on ? ' on' : ''}`} aria-current={on ? 'true' : undefined} disabled={disabled} onClick={onPick}>
      <Icon size={22} />
      <span className="t">
        <span className="name">{name}</span>
        <span className="sub">{sub}</span>
      </span>
      {on ? (
        <span className={`eq${paused ? ' paused' : ''}`} aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </button>
  );
}

export function DevicesPanel() {
  const client = useAuth((s) => s.client);
  const target = useRemote((s) => s.target);
  const here = usePlayer((s) => s.queue[s.index]);
  const playingHere = usePlayer((s) => s.playing);
  const [devices, setDevices] = useState<RakkiDevice[] | null>(null);
  const [error, setError] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    const load = () =>
      otherRakkiDevices(client)
        .then((d) => alive && (setDevices(d), setError(false)))
        .catch(() => alive && setError(true));
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [client]);

  const r = useRemote.getState();
  const hasMusicHere = !!here && !here.Radio;

  /** Listen on this computer: take the music back from the device you were on. */
  const pickHere = () => {
    if (!target) return;
    if (target.item && target.controllable) void r.playHere(target);
    else r.setTarget(null);
  };

  /** Listen on another device: move this computer's music there, or just control it. */
  const pick = (d: RakkiDevice) => {
    if (target?.sessionId === d.sessionId) return;
    if (!target && hasMusicHere) void r.playOn(d);
    else r.setTarget(d);
  };

  return (
    <aside className="rightpanel panel">
      <header className="rp-head">
        <div className="rp-title">Connect</div>
        <button className="iconbtn" aria-label="Close" title="Close" onClick={() => useLayout.getState().setPanel(null)}>
          <X size={18} />
        </button>
      </header>
      <div className="panel-body connect">
        <Row
          icon={Monitor}
          name="This Computer"
          on={!target}
          paused={!playingHere}
          sub={here ? `${playingHere ? 'Playing' : 'Paused'}: ${here.Name}` : 'Nothing Playing'}
          onPick={pickHere}
        />
        {devices?.map((d) => (
          <Row
            key={d.sessionId}
            icon={isPhone(d) ? Smartphone : Monitor}
            name={d.name}
            on={target?.sessionId === d.sessionId}
            paused={!d.item || d.paused}
            disabled={!d.controllable}
            sub={d.controllable ? nowLine(d) : 'Update Rakki there to connect to it'}
            onPick={() => pick(d)}
          />
        ))}
        {devices === null && !error ? <p className="connect-note">Looking for your other Rakki apps</p> : null}
        {error ? <p className="connect-note">Couldn’t ask your server for your devices.</p> : null}
      </div>
      <div className="connect-foot">
        <button className="connect-help" aria-expanded={help} onClick={() => setHelp(!help)}>
          Don’t see your device?
          <ChevronDown size={16} />
        </button>
        {help ? (
          <p className="connect-note">
            Open Rakki on it, signed in to the same server. An iPhone shows up while Rakki is open or playing on it; your music moves over at the same
            moment in the song.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
