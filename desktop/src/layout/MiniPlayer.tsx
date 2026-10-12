// The mini player: the window itself shrinks to a small player that stays on top of other
// windows (a second window would mean a second webview, ~100 MB more). The artwork with the
// song, the controls and a thin seek bar; drag it anywhere. The expand button (or Esc) grows
// the window back to the size it was.
import { LogicalSize } from '@tauri-apps/api/dpi';
import { Maximize2, Pause, Pin, PinOff, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';

import { artColor } from '@/lib/blurhash';
import { useAuth } from '~/auth/session';
import { useLivePosition, Range } from '~/layout/frame';
import { useLayout, win } from '~/layout/layout';
import { usePlayer } from '~/player/store';
import { ArtistLinks, Artwork, SaveButton } from '~/ui/parts';

export const MINI = { width: 380, height: 132 };

let before: { width: number; height: number; maximized: boolean } | null = null;

/** Into the mini player (remembering the window's size) or back out. */
export async function setMini(on: boolean) {
  const l = useLayout.getState();
  if (on === l.mini) return;
  if (!win) return useLayout.setState({ mini: on });
  if (on) {
    const size = (await win.innerSize()).toLogical(await win.scaleFactor());
    before = { width: size.width, height: size.height, maximized: await win.isMaximized() };
    if (l.fullscreen) l.setFullscreen(false);
    if (before.maximized) await win.unmaximize();
    useLayout.setState({ mini: true, nowPlaying: false });
    await win.setMinSize(new LogicalSize(MINI.width, MINI.height));
    await win.setSize(new LogicalSize(MINI.width, MINI.height));
    await win.setResizable(false);
    await win.setAlwaysOnTop(l.miniOnTop);
  } else {
    useLayout.setState({ mini: false });
    await win.setAlwaysOnTop(false);
    await win.setResizable(true);
    await win.setMinSize(new LogicalSize(900, 600));
    await win.setSize(new LogicalSize(before?.width ?? 1280, before?.height ?? 800));
    if (before?.maximized) await win.toggleMaximize();
  }
}

export function MiniPlayer() {
  const item = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const duration = usePlayer((s) => s.duration);
  const onTop = useLayout((s) => s.miniOnTop);
  const client = useAuth((s) => s.client);
  const position = useLivePosition();
  const [hover, setHover] = useState(false);
  const p = usePlayer.getState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void setMini(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tint = item && client ? artColor(client.blurhash(item), '#1b1b1e') : '#1b1b1e';
  return (
    <div className={`mini${hover ? ' hover' : ''}`} style={{ ['--tint' as string]: tint }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} data-tauri-drag-region>
      <Artwork item={item} size={240} className="mini-art" />
      <div className="mini-body" data-tauri-drag-region>
        <div className="mini-top" data-tauri-drag-region>
          <div className="mini-text" data-tauri-drag-region>
            <div className="mini-title" data-tauri-drag-region>
              {item?.Name ?? 'Nothing playing'}
            </div>
            <div className="mini-by">{item ? <ArtistLinks item={item} /> : null}</div>
          </div>
          <button
            className={`iconbtn${onTop ? ' on' : ''}`}
            aria-label={onTop ? 'Stop keeping on top' : 'Keep on top'}
            title={onTop ? 'Stop keeping on top' : 'Keep on top of other windows'}
            onClick={() => {
              useLayout.getState().setMiniOnTop(!onTop);
              void win?.setAlwaysOnTop(!onTop);
            }}>
            {onTop ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button className="iconbtn" aria-label="Back to the full window" title="Back to the full window (Esc)" onClick={() => void setMini(false)}>
            <Maximize2 size={15} />
          </button>
        </div>
        <div className="mini-controls">
          {item ? <SaveButton item={item} size={16} /> : <span />}
          <button className="iconbtn" aria-label="Previous" title="Previous" onClick={() => p.previous()}>
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button className="pp" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} onClick={() => p.toggle()}>
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button className="iconbtn" aria-label="Next" title="Next" onClick={() => p.next()}>
            <SkipForward size={18} fill="currentColor" />
          </button>
          <span />
        </div>
        <div className="mini-seek">
          <Range value={position} max={duration} onSet={(v) => p.seek(v)} />
        </div>
      </div>
    </div>
  );
}
