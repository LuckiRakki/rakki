// The player bar while another device is picked in Devices (Spotify's "Playing on ..."): that
// device's song, its controls (sent to it), its place in the song, its volume when it takes
// volume commands, and the way back (Play here takes the music over; the X controls this
// computer again).
import { ArrowDownToLine, Pause, Play, SkipBack, SkipForward, Smartphone, Monitor, Volume2, X } from '~/ui/icons';
import { useEffect, useState } from 'react';

import { positionNow, type RakkiDevice } from '@/remote/devices';
import { isPhone, DevicesButton } from '~/layout/Devices';
import { Range } from '~/ui/Range';
import { useRemote } from '~/player/remote';
import { ArtistLinks, Artwork, formatTime, ticksToSeconds } from '~/ui/parts';

export function RemoteBar({ target }: { target: RakkiDevice }) {
  const [, tick] = useState(0);
  const [volume, setVolume] = useState(80);
  const busy = useRemote((s) => s.busy);
  useEffect(() => {
    if (target.paused) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [target]);
  const r = useRemote.getState();
  const item = target.item;
  const length = ticksToSeconds(item?.RunTimeTicks);
  const position = Math.min(positionNow(target), length || Infinity);
  const Icon = isPhone(target) ? Smartphone : Monitor;
  const hasVolume = target.commands.includes('SetVolume');
  return (
    <footer className="playerbar remote">
      <div className="np">
        {item ? (
          <>
            <Artwork key={item.Id} item={item} size={160} className="thumb np-art" />
            <div key={`t-${item.Id}`} className="t">
              <div className="name">{item.Name}</div>
              <div className="by">
                <ArtistLinks item={item} />
              </div>
            </div>
          </>
        ) : (
          <div className="t">
            <div className="name">Nothing playing</div>
            <div className="by">on {target.name}</div>
          </div>
        )}
      </div>
      <div className="controls">
        <div className="buttons">
          <button className="iconbtn" aria-label="Previous" title="Previous" disabled={!item} onClick={() => r.command('PreviousTrack')}>
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button className="pp" aria-label={target.paused ? 'Play' : 'Pause'} title={target.paused ? 'Play' : 'Pause'} disabled={!item} onClick={() => r.command('PlayPause')}>
            {target.paused ? <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} /> : <Pause size={18} fill="currentColor" />}
          </button>
          <button className="iconbtn" aria-label="Next" title="Next" disabled={!item} onClick={() => r.command('NextTrack')}>
            <SkipForward size={20} fill="currentColor" />
          </button>
        </div>
        <div className="seek">
          <span>{formatTime(position)}</span>
          <Range label="Seek" step={5} value={position} max={length} onSet={(v) => r.seek(v)} />
          <span>{formatTime(length)}</span>
        </div>
        <div className="remote-strip">
          <Icon size={13} />
          {busy ?? `Playing on ${target.name}`}
        </div>
      </div>
      <div className="right">
        <button className="device-btn" disabled={!!busy || !item} onClick={() => void r.playHere(target)} title={`Take over what ${target.name} is playing`}>
          <ArrowDownToLine size={14} /> Play here
        </button>
        <DevicesButton />
        {hasVolume ? (
          <div className="volume" title={`${target.name}'s volume`}>
            <Volume2 size={18} />
            <div className="vol">
              <Range
                label="Volume"
                step={5}
                value={volume}
                max={100}
                onSet={(v) => {
                  setVolume(v);
                  r.volume(v);
                }}
              />
            </div>
          </div>
        ) : null}
        <button className="iconbtn" aria-label="Control this computer" title="Control this computer again" onClick={() => r.setTarget(null)}>
          <X size={17} />
        </button>
      </div>
    </footer>
  );
}
