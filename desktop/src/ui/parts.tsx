// The pieces every screen is built from: artwork, item cards, shelves and the song list.
import { useVirtualizer } from '@tanstack/react-virtual';
import { Disc3, Heart, Music2, Play } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { displayName, isMix, mixArtists } from '@/lib/mixes';
import { useAuth } from '~/auth/session';
import { go, openItem } from '~/nav';
import { usePlayer } from '~/player/store';

export function Artwork({ item, size = 300, round, className }: { item?: BaseItem; size?: number; round?: boolean; className?: string }) {
  const client = useAuth((s) => s.client);
  const src = item ? client?.imageUrl(item, size) : undefined;
  return (
    <div className={`artwork${round ? ' round' : ''}${src ? '' : ' empty'}${className ? ` ${className}` : ''}`}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} /> : <Music2 size={22} />}
    </div>
  );
}

export function subtitle(item: BaseItem): string {
  if (isMix(item)) return mixArtists(item);
  switch (item.Type) {
    case 'MusicAlbum':
      return [item.AlbumArtist, item.ProductionYear].filter(Boolean).join(' · ');
    case 'MusicArtist':
      return 'Artist';
    case 'Playlist':
      return item.ChildCount ? `Playlist · ${item.ChildCount} songs` : 'Playlist';
    case 'Audio':
      return item.Artists?.join(', ') || item.AlbumArtist || '';
    default:
      return '';
  }
}

/** Play an album, playlist or artist straight from its card. */
async function playItem(item: BaseItem) {
  const c = useAuth.getState().client;
  if (!c) return;
  let tracks: BaseItem[] = [];
  if (item.Type === 'MusicAlbum') tracks = (await c.getAlbumTracks(item.Id)).Items;
  else if (item.Type === 'Playlist') tracks = (await c.getPlaylistItems(item.Id)).Items;
  else if (item.Type === 'MusicArtist') tracks = await c.getArtistTracks(item.Id);
  if (tracks.length) usePlayer.getState().playQueue(tracks, 0, item.Type === 'MusicArtist' ? { shuffle: true } : undefined);
}

export function ItemCard({ item }: { item: BaseItem }) {
  const round = item.Type === 'MusicArtist';
  return (
    <div className="card" role="button" tabIndex={0} onClick={() => openItem(item)} onKeyDown={(e) => e.key === 'Enter' && openItem(item)}>
      <div className="art">
        <Artwork item={item} round={round} />
        <button
          className="play"
          aria-label={`Play ${displayName(item)}`}
          onClick={(e) => {
            e.stopPropagation();
            void playItem(item);
          }}>
          <Play size={20} fill="#000" />
        </button>
      </div>
      <div className="title" style={round ? { textAlign: 'center' } : undefined}>
        {displayName(item)}
      </div>
      <div className="sub" style={round ? { textAlign: 'center' } : undefined}>
        {subtitle(item)}
      </div>
    </div>
  );
}

export function Shelf({ title, items, onShowAll }: { title: string; items?: BaseItem[]; onShowAll?: () => void }) {
  if (!items?.length) return null;
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2>{title}</h2>
        {onShowAll ? <button onClick={onShowAll}>Show all</button> : null}
      </div>
      <div className="shelf-row">
        {items.map((i) => (
          <ItemCard key={i.Id} item={i} />
        ))}
      </div>
    </section>
  );
}

export function Spinner() {
  return <div className="spin" />;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const ticksToSeconds = (t?: number) => (t ? t / 10_000_000 : 0);

/**
 * Songs, one row each. Long lists only draw the rows on screen (a 5,000-song list costs the
 * same as a 20-song one).
 */
export function TrackList({ tracks, showAlbum = true, showArt = true, numbered = false }: { tracks: BaseItem[]; showAlbum?: boolean; showArt?: boolean; numbered?: boolean }) {
  const parent = useRef<HTMLDivElement>(null);
  const nowId = usePlayer((s) => s.queue[s.index]?.Id);
  const rows = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => document.getElementById('main'),
    estimateSize: () => 56,
    overscan: 8,
    scrollMargin: parent.current?.offsetTop ?? 0,
  });
  return (
    <div className="tracks" ref={parent}>
      <div style={{ height: rows.getTotalSize(), position: 'relative' }}>
        {rows.getVirtualItems().map((row) => {
          const t = tracks[row.index];
          return (
            <div
              key={row.key}
              className={`track${showAlbum ? '' : ' noalbum'}${t.Id === nowId ? ' now' : ''}`}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${row.start - rows.options.scrollMargin}px)` }}
              onDoubleClick={() => usePlayer.getState().playQueue(tracks, row.index)}>
              <div className="num">{numbered ? (t.IndexNumber ?? row.index + 1) : row.index + 1}</div>
              <div className="who">
                {showArt ? <Artwork item={t} size={80} className="thumb" /> : null}
                <div style={{ minWidth: 0 }}>
                  <div className="name">{t.Name}</div>
                  <div className="by">
                    {t.ArtistItems?.length
                      ? t.ArtistItems.map((a, i) => (
                          <span key={a.Id}>
                            {i ? ', ' : ''}
                            <span className="linkish" onClick={() => go({ name: 'artist', id: a.Id })}>
                              {a.Name}
                            </span>
                          </span>
                        ))
                      : t.Artists?.join(', ')}
                  </div>
                </div>
              </div>
              {showAlbum ? (
                <div className="album">
                  {t.AlbumId ? (
                    <span className="linkish" onClick={() => go({ name: 'album', id: t.AlbumId! })}>
                      {t.Album}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="len">
                {t.UserData?.IsFavorite ? <Heart size={13} fill="var(--accent)" color="var(--accent)" style={{ marginRight: 8, verticalAlign: -2 }} /> : null}
                {formatTime(ticksToSeconds(t.RunTimeTicks))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Album / playlist / artist header: the picture, the name, a line under it. */
export function Hero({ item, kind, meta, children }: { item?: BaseItem; kind: string; meta?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <div className="hero">
        <div className="cover">
          {item ? <Artwork item={item} size={500} round={item.Type === 'MusicArtist'} /> : <div className="artwork empty"><Disc3 size={40} /></div>}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="kind">{kind}</div>
          <h1>{item ? displayName(item) : ''}</h1>
          <div className="meta">{meta}</div>
        </div>
      </div>
      {children}
    </>
  );
}

export function totalLength(tracks: BaseItem[]): string {
  const s = tracks.reduce((n, t) => n + ticksToSeconds(t.RunTimeTicks), 0);
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
