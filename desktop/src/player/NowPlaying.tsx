// Now Playing, filling the window (like Feishin's full-screen player): the artwork large over a
// blurred copy of itself, the song and controls under it, and Up next / Lyrics / Related on the
// right. The controls fade out while the mouse is still. Esc or the chevron closes it.
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Heart } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { artColor } from '@/lib/blurhash';
import { useAuth } from '~/auth/session';
import { setLiked } from '~/library/actions';
import { songMenu } from '~/library/menus';
import { SeekBar, Transport, useLayout, WindowButtons } from '~/layout/frame';
import { LyricsView } from '~/lyrics/LyricsView';
import { go } from '~/nav';
import { usePlayer } from '~/player/store';
import { openMenu } from '~/ui/overlays';
import { ArtistLinks, Artwork } from '~/ui/parts';

type Tab = 'next' | 'lyrics' | 'related';

function Related({ item }: { item: BaseItem }) {
  const client = useAuth((s) => s.client);
  const q = useQuery({
    queryKey: ['related', item.Id],
    enabled: !!client,
    queryFn: () => client!.getInstantMix(item.Id, 30),
  });
  const songs = (q.data ?? []).filter((s) => s.Id !== item.Id);
  return (
    <div className="np-list">
      {songs.map((t, i) => (
        <button
          key={t.Id}
          className="qrow"
          onDoubleClick={() => usePlayer.getState().playQueue(songs, i, { shuffle: false })}
          onContextMenu={(e) => openMenu(e, songMenu([t]))}>
          <Artwork item={t} size={80} className="thumb" />
          <div className="t">
            <div className="name">{t.Name}</div>
            <div className="sub">{t.Artists?.join(', ')}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function UpNext() {
  const { queue, index } = usePlayer();
  const upcoming = queue.slice(index + 1, index + 101);
  if (!upcoming.length) return <p className="muted pad">Nothing after this song.</p>;
  return (
    <div className="np-list">
      {upcoming.map((t, i) => (
        <button
          key={`${t.Id}-${i}`}
          className="qrow"
          onDoubleClick={() => usePlayer.getState().playAt(index + 1 + i)}
          onContextMenu={(e) => openMenu(e, songMenu([t], { queueIndex: index + 1 + i }))}>
          <Artwork item={t} size={80} className="thumb" />
          <div className="t">
            <div className="name">{t.Name}</div>
            <div className="sub">{t.Artists?.join(', ')}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function NowPlaying() {
  const open = useLayout((s) => s.nowPlaying);
  const item = usePlayer((s) => s.queue[s.index]);
  const client = useAuth((s) => s.client);
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('rakki.npTab') as Tab) || 'lyrics');
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && useLayout.getState().setNowPlaying(false);
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 2500);
    };
    wake();
    window.addEventListener('keydown', close);
    window.addEventListener('mousemove', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', close);
      window.removeEventListener('mousemove', wake);
    };
  }, [open]);

  if (!open || !item) return null;
  const tint = client ? artColor(client.blurhash(item), '#202024') : '#202024';
  const big = client?.imageUrl(item, 1000);
  const liked = !!item.UserData?.IsFavorite;
  const choose = (t: Tab) => {
    setTab(t);
    localStorage.setItem('rakki.npTab', t);
  };

  return (
    <div className={`nowplaying${idle ? ' idle' : ''}`} style={{ ['--tint' as string]: tint }}>
      {big ? <div className="np-backdrop" style={{ backgroundImage: `url("${big}")` }} /> : null}
      <div className="np-shade" />
      <div className="np-top" data-tauri-drag-region>
        <button className="iconbtn" aria-label="Close Now Playing" title="Close (Esc)" onClick={() => useLayout.getState().setNowPlaying(false)}>
          <ChevronDown size={26} />
        </button>
        <div style={{ flex: 1 }} data-tauri-drag-region />
        <WindowButtons />
      </div>
      <div className="np-body">
        <div className="np-left">
          <Artwork item={item} size={1000} className="np-cover" />
          <div className="np-info" onContextMenu={(e) => openMenu(e, songMenu([item]))}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                className="np-title linkish"
                onClick={() => {
                  if (!item.AlbumId) return;
                  useLayout.getState().setNowPlaying(false);
                  go({ name: 'album', id: item.AlbumId });
                }}>
                {item.Name}
              </div>
              <div className="np-artist" onClick={() => useLayout.getState().setNowPlaying(false)}>
                <ArtistLinks item={item} />
              </div>
            </div>
            <button className={`heart big${liked ? ' on' : ''}`} aria-label="Like" title={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'} onClick={() => void setLiked([item], !liked)}>
              <Heart size={24} fill={liked ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="np-controls">
            <SeekBar />
            <Transport size="big" />
          </div>
        </div>
        <div className="np-right">
          <div className="tabs big">
            <button className={tab === 'next' ? 'on' : ''} onClick={() => choose('next')}>
              Up next
            </button>
            <button className={tab === 'lyrics' ? 'on' : ''} onClick={() => choose('lyrics')}>
              Lyrics
            </button>
            <button className={tab === 'related' ? 'on' : ''} onClick={() => choose('related')}>
              Related
            </button>
          </div>
          <div className="np-tab">{tab === 'next' ? <UpNext /> : tab === 'lyrics' ? <LyricsView big /> : <Related item={item} />}</div>
        </div>
      </div>
    </div>
  );
}
