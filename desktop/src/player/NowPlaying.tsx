// The full player (like Feishin's): over everything except the player bar, which stays put.
// The artwork blurred behind it all; on the left the artwork large with the song, artists,
// album and badges (format, year) under it; on the right the queue as a table, related songs,
// or the lyrics big and left-aligned. Icon buttons bottom right switch between them. The
// expand button (or F11) makes the window fill the screen. The top fades while the mouse is
// still. Esc leaves full screen first, then the player.
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Ellipsis, Expand, ListMusic, MicVocal, Radio, Shrink, SlidersHorizontal, TextSize, Visualizer as VisualizerIcon } from '~/ui/icons';
import { LYRICS_SIZES, useLook } from '~/settings/look';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { artColor } from '@/lib/blurhash';
import { useAuth } from '~/auth/session';
import { songMenu } from '~/library/menus';
import { WindowButtons } from '~/layout/TitleBar';
import { useLayout, type PlayerTab } from '~/layout/layout';
import { formatOf } from '~/layout/NowPlayingPanel';
import { useLyrics } from '@/lyrics/fetch';
import { useSettings } from '@/settings/store';
import { LyricsView, pickLyrics } from '~/lyrics/LyricsView';
import { SpicyView } from '~/spicy/SpicyView';
import { LyricsTiming } from '~/lyrics/LyricsTiming';
import { go } from '~/nav';
import { usePlayer } from '~/player/store';
import { useItem } from '~/queries';
import { Visualizer } from '~/audio/Visualizer';
import { DynamicBackground } from '~/ui/DynamicBackground';
import { usePresence } from '~/ui/motion';
import { Loading } from '~/ui/states';
import { openMenu } from '~/ui/overlays';
import { ArtistLinks, Artwork, formatTime, SaveButton, ticksToSeconds } from '~/ui/parts';

/** Genres for songs that came without them (song lists don't ask for genres), 100 at a time. */
function useGenres(songs: BaseItem[]): Map<string, string> {
  const client = useAuth((s) => s.client);
  const missing = [...new Set(songs.filter((s) => !s.Genres).map((s) => s.Id))];
  const q = useQuery({
    queryKey: ['genresOf', missing.join(',')],
    enabled: !!client && missing.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const out = new Map<string, string>();
      for (let i = 0; i < missing.length; i += 100) {
        const r = await client!.items({ Ids: missing.slice(i, i + 100).join(','), Fields: 'Genres', EnableImageTypes: '' });
        for (const it of r.Items) if (it.Genres?.[0]) out.set(it.Id, it.Genres[0]);
      }
      return out;
    },
  });
  return q.data ?? new Map();
}

/** Songs as a table: #, title with artwork and artists, album, genre, year, length, like. */
function SongTable({ songs, first, current, onPlay, queue }: { songs: BaseItem[]; first: number; current?: number; onPlay(i: number): void; queue?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const playing = usePlayer((s) => s.playing);
  const genres = useGenres(songs);
  // Open with the playing song near the top.
  useLayoutEffect(() => {
    const b = box.current;
    const el = b?.querySelector<HTMLElement>('.st-row.now');
    if (b && el) b.scrollTop = Math.max(0, el.offsetTop - 120);
  }, []);

  return (
    <div className="songtable" ref={box}>
      <div className="st-row st-head">
        <span className="st-n">#</span>
        <span>Title</span>
        <span className="st-album">Album</span>
        <span className="st-genre">Genre</span>
        <span className="st-year">Year</span>
        <span className="st-len">Length</span>
        <span />
      </div>
      {songs.map((t, k) => {
        const i = first + k;
        const now = i === current;
        return (
          <div
            key={`${t.Id}-${i}`}
            className={`st-row${now ? ' now' : ''}${current !== undefined && i < current ? ' past' : ''}`}
            onDoubleClick={() => !now && onPlay(i)}
            onContextMenu={(e) => openMenu(e, songMenu([t], queue && !now ? { queueIndex: i } : {}))}>
            <span className="st-n">{now ? <span className={`eq${playing ? '' : ' paused'}`}><i /><i /><i /></span> : i + 1}</span>
            <span className="st-title">
              <Artwork item={t} size={80} className="thumb" />
              <span className="t">
                <span className="name">{t.Name}</span>
                <span className="sub">
                  <ArtistLinks item={t} />
                </span>
              </span>
            </span>
            <span className="st-album">
              <span className="linkish" onClick={() => t.AlbumId && go({ name: 'album', id: t.AlbumId })}>
                {t.Album}
              </span>
            </span>
            <span className="st-genre">{t.Genres?.[0] ?? genres.get(t.Id) ?? ''}</span>
            <span className="st-year">{t.ProductionYear ?? ''}</span>
            <span className="st-len">{formatTime(ticksToSeconds(t.RunTimeTicks))}</span>
            <SaveButton item={t} />
          </div>
        );
      })}
    </div>
  );
}

function QueueTab() {
  const { queue, index } = usePlayer();
  if (!queue.length) return <p className="lyrics-empty">The queue is empty.</p>;
  // A window around the playing song keeps big queues light.
  const first = Math.max(0, index - 30);
  return <SongTable songs={queue.slice(first, index + 300)} first={first} current={index} onPlay={(i) => usePlayer.getState().playAt(i)} queue />;
}

function RelatedTab({ item }: { item: BaseItem }) {
  const client = useAuth((s) => s.client);
  const q = useQuery({
    queryKey: ['related', item.Id],
    enabled: !!client,
    queryFn: () => client!.getInstantMix(item.Id, 40),
  });
  const songs = (q.data ?? []).filter((s) => s.Id !== item.Id);
  if (q.isLoading) return <Loading what="related songs" />;
  if (!songs.length) return <p className="lyrics-empty">Nothing related found.</p>;
  return <SongTable songs={songs} first={0} onPlay={(i) => usePlayer.getState().playQueue(songs, i, { shuffle: false })} />;
}

/** The lyrics tab: Spicy (word by word, the web mod's engine) or Regular (line by line), the
 *  same choice as the phone app's Lyrics style. */
function PlayerLyrics() {
  const mode = useSettings((s) => s.lyricsMode);
  const item = usePlayer((s) => s.queue[s.index]);
  const q = useLyrics(item?.Radio ? undefined : item?.Id);
  const lyrics = pickLyrics(q.data);
  if (mode === 'spicy' && lyrics) return <SpicyView key={item?.Id} lyrics={lyrics} itemId={item?.Id} />;
  return <LyricsView variant="big" />;
}

/** The lyrics' text size, from the player (the same choice as Settings → Lyrics). */
function LyricsSize() {
  const size = useLook((s) => s.lyricsSize);
  return (
    <button
      className="iconbtn"
      aria-label="Text size"
      title="Text size"
      onClick={(e) =>
        openMenu(
          e,
          LYRICS_SIZES.map((o) => ({ label: o.label, icon: o.value === size ? Check : undefined, run: () => useLook.getState().setLyricsSize(o.value) })),
          'Lyrics text size',
        )
      }>
      <TextSize size={20} />
    </button>
  );
}

function LyricsStyle() {
  const mode = useSettings((s) => s.lyricsMode);
  return (
    <div className="seg" role="group" aria-label="Lyrics style">
      {(['spicy', 'regular'] as const).map((m) => (
        <button key={m} className={mode === m ? 'on' : ''} title={m === 'spicy' ? 'Word by word' : 'Line by line'} onClick={() => useSettings.getState().set('lyricsMode', m)}>
          {m === 'spicy' ? 'Spicy' : 'Regular'}
        </button>
      ))}
    </div>
  );
}

const TABS: { tab: PlayerTab; label: string; icon: typeof ListMusic }[] = [
  { tab: 'queue', label: 'Queue', icon: ListMusic },
  { tab: 'related', label: 'Related', icon: Radio },
  { tab: 'visualizer', label: 'Visualizer', icon: VisualizerIcon },
  { tab: 'lyrics', label: 'Lyrics', icon: MicVocal },
];

/** The visualizer tab: Rakki's sound across the whole side (Settings → Visualizer for its look). */
function VisualizerTab() {
  return <Visualizer className="np-visualizer" />;
}

export function NowPlaying() {
  const open = useLayout((s) => s.nowPlaying);
  const fullscreen = useLayout((s) => s.fullscreen);
  const tab = useLayout((s) => s.playerTab);
  const item = usePlayer((s) => s.queue[s.index]);
  const full = useItem(open ? item?.Id : undefined).data;
  const client = useAuth((s) => s.client);
  const [idle, setIdle] = useState(false);
  const presence = usePresence(open, 260);

  useEffect(() => {
    if (!open) return;
    // Esc: out of full screen first, then out of the player.
    const close = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const l = useLayout.getState();
      if (l.fullscreen) l.setFullscreen(false);
      else l.setNowPlaying(false);
    };
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

  // Nothing left to show: close.
  useEffect(() => {
    if (open && !item) useLayout.getState().setNowPlaying(false);
  }, [open, item]);

  if (!presence.render || !item) return null;
  const tint = client ? artColor(client.blurhash(item), '#202024') : '#202024';
  const backdrop = client?.imageUrl(item, 500);
  const song = { ...item, ...full, UserData: item.UserData };
  const badges = [formatOf(song)[0], song.ProductionYear].filter(Boolean);
  const l = useLayout.getState();

  return (
    <div className={`nowplaying${idle ? ' idle' : ''}${presence.leaving ? ' leaving' : ''}`} style={{ ['--tint' as string]: tint }}>
      <div className="np-solid" />
      <DynamicBackground image={backdrop} active={!presence.leaving} />
      <div className="np-shade" />
      <div className="np-top" data-tauri-drag-region>
        <button className="iconbtn" aria-label="Close full player" title="Close (Esc)" onClick={() => l.setNowPlaying(false)}>
          <ChevronDown size={24} />
        </button>
        <button className="iconbtn" aria-label="Song options" title="Song options" onClick={(e) => openMenu(e, songMenu([item]))}>
          <Ellipsis size={20} />
        </button>
        <div style={{ flex: 1 }} data-tauri-drag-region />
        {tab === 'lyrics' && !item.Radio ? <LyricsTiming itemId={item.Id} /> : null}
        {tab === 'lyrics' ? <LyricsSize /> : null}
        {tab === 'lyrics' ? <LyricsStyle /> : null}
        {tab === 'visualizer' ? (
          <button
            className="iconbtn"
            aria-label="Visualizer settings"
            title="Visualizer settings"
            onClick={() => {
              l.setNowPlaying(false);
              go({ name: 'settings', section: 'visualizer' });
            }}>
            <SlidersHorizontal size={19} />
          </button>
        ) : null}
        <button
          className="iconbtn np-fs"
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          title={fullscreen ? 'Exit full screen (F11)' : 'Full screen (F11)'}
          onClick={() => l.setFullscreen(!fullscreen)}>
          {fullscreen ? <Shrink size={19} /> : <Expand size={19} />}
        </button>
        {fullscreen ? null : <WindowButtons />}
      </div>
      <div className="np-body">
        <div className="np-left">
          <Artwork key={item.Id} item={item} size={1000} className="np-cover" />
          <div className="np-meta" onContextMenu={(e) => openMenu(e, songMenu([item]))}>
            <div className="np-title">{item.Name}</div>
            <div className="np-artist" onClick={() => l.setNowPlaying(false)}>
              <ArtistLinks item={item} sep=" • " />
            </div>
            {item.Album ? (
              <div
                className="np-album linkish"
                onClick={() => {
                  if (!item.AlbumId) return;
                  l.setNowPlaying(false);
                  go({ name: 'album', id: item.AlbumId });
                }}>
                {item.Album}
              </div>
            ) : null}
            <div className="np-badges">
              {badges.map((b) => (
                <span key={String(b)} className="badge-pill">
                  {b}
                </span>
              ))}
              <SaveButton item={item} size={18} />
            </div>
          </div>
        </div>
        <div className="np-right">
          <div key={tab} className="np-tab-pane">
            {tab === 'queue' ? <QueueTab /> : tab === 'lyrics' ? <PlayerLyrics /> : tab === 'visualizer' ? <VisualizerTab /> : <RelatedTab item={item} />}
          </div>
        </div>
      </div>
      <div className="np-tabs">
        {TABS.map(({ tab: t, label, icon: Icon }) => (
          <button key={t} className={`iconbtn${tab === t ? ' on' : ''}`} aria-label={label} aria-pressed={tab === t} title={label} onClick={() => l.setPlayerTab(t)}>
            <Icon size={19} />
          </button>
        ))}
      </div>
    </div>
  );
}
