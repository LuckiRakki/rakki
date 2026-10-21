// The player bar while you listen on another device (Spotify's "Listening on ..."): that
// device's song, its controls (sent to it), its place in the song and its volume when it takes
// volume commands. Listening on ... opens Connect, where This computer brings the music back.
import { Pause, Play, SkipBack, SkipForward, Smartphone, Monitor, Volume2 } from '~/ui/icons';
import { useEffect, useState } from 'react';

import { positionNow, type RakkiDevice } from '@/remote/devices';
import { isPhone, DevicesButton } from '~/layout/Devices';
import { Range } from '~/ui/Range';
import { useLayout } from '~/layout/layout';
import { useRemote } from '~/player/remote';
import { ArtistLinks, Artwork, formatTime, ticksToSeconds } from '~/ui/parts';

export function RemoteBar({ target }: { target: RakkiDevice }) {
  const [, tick] = useState(0);
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
            <div className="name">Nothing Playing</div>
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
        <button className="remote-strip" title="Choose Where to Listen" onClick={() => useLayout.getState().setPanel('devices')}>
          <Icon size={14} />
          {busy ?? `Listening on ${target.name}`}
        </button>
      </div>
      <div className="right">
        <DevicesButton />
        {hasVolume ? (
          <div className="volume" title={`${target.name}'s volume`}>
            <Volume2 size={18} />
            <div className="vol">
              <Range
                label="Volume"
                step={5}
                value={target.volume ?? 80}
                max={100}
                onSet={(v) => r.volume(v)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </footer>
  );
}
