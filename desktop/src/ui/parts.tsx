// The pieces every screen is built from: artwork, cards, shelves, the song table, and the header
// and action bar at the top of album, artist and playlist pages.
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeft, ChevronRight, Clock3, Heart, MoreHorizontal, Music2, Pause, Play, Search, Shuffle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { artColor } from '@/lib/blurhash';
import { displayName, isMix, mixArtists } from '@/lib/mixes';
import { useAuth } from '~/auth/session';
import { playItem, setLiked } from '~/library/actions';
import { collectionMenu, songMenu, type MenuContext } from '~/library/menus';
import { go, openItem } from '~/nav';
import { usePlayer } from '~/player/store';
import { openMenu } from '~/ui/overlays';

export function Artwork({ item, size = 300, round, className }: { item?: BaseItem; size?: number; round?: boolean; className?: string }) {
  const client = useAuth((s) => s.client);
  const src = item ? client?.imageUrl(item, size) : undefined;
  const [failed, setFailed] = useState(false);
  const bg = item && client ? artColor(client.blurhash(item), '#2a2a2e') : undefined;
  return (
    <div className={`artwork${round ? ' round' : ''}${src && !failed ? '' : ' empty'}${className ? ` ${className}` : ''}`} style={bg ? { background: bg } : undefined}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <Music2 size={22} />
      )}
    </div>
  );
}

export function subtitle(item: BaseItem): string {
  if (isMix(item)) return mixArtists(item);
  switch (item.Type) {
    case 'MusicAlbum':
      return [item.ProductionYear, item.AlbumArtist].filter(Boolean).join(' · ');
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

export function ItemCard({ item }: { item: BaseItem }) {
  const round = item.Type === 'MusicArtist';
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => openItem(item)}
      onKeyDown={(e) => e.key === 'Enter' && openItem(item)}
      onContextMenu={(e) => openMenu(e, collectionMenu(item), displayName(item))}>
      <div className="art">
        <Artwork item={item} round={round} />
        <button
          className="play"
          aria-label={`Play ${displayName(item)}`}
          title="Play"
          onClick={(e) => {
            e.stopPropagation();
            void playItem(item, item.Type === 'MusicArtist' ? { shuffle: true } : undefined);
          }}>
          <Play size={20} fill="currentColor" />
        </button>
      </div>
      <div className={`title${round ? ' center' : ''}`}>{displayName(item)}</div>
      <div className={`sub${round ? ' center' : ''}`}>{subtitle(item)}</div>
    </div>
  );
}

/** A titled row of cards that scrolls sideways (with arrows on hover). */
export function Shelf({ title, items, onShowAll }: { title: string; items?: BaseItem[]; onShowAll?: () => void }) {
  const row = useRef<HTMLDivElement>(null);
  if (!items?.length) return null;
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2 className={onShowAll ? 'linkish' : undefined} onClick={onShowAll}>
          {title}
        </h2>
        <div className="shelf-tools">
          {onShowAll ? <button onClick={onShowAll}>Show all</button> : null}
          <button className="arrow" aria-label="Scroll left" onClick={() => scroll(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button className="arrow" aria-label="Scroll right" onClick={() => scroll(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="shelf-row" ref={row}>
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

export const ticksToSeconds = (t?: number) => (t ? t / 10_000_000 : 0);

export function totalLength(tracks: BaseItem[]): string {
  const s = tracks.reduce((n, t) => n + ticksToSeconds(t.RunTimeTicks), 0);
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} hr ${m} min` : `${m} min`;
}

export function ArtistLinks({ item }: { item: BaseItem }) {
  if (!item.ArtistItems?.length) return <>{item.Artists?.join(', ') || item.AlbumArtist}</>;
  return (
    <>
      {item.ArtistItems.map((a, i) => (
        <span key={a.Id}>
          {i ? ', ' : ''}
          <span
            className="linkish"
            onClick={(e) => {
              e.stopPropagation();
              go({ name: 'artist', id: a.Id });
            }}>
            {a.Name}
          </span>
        </span>
      ))}
    </>
  );
}

/** Animated bars for the song that's playing (still while paused). */
function Playing({ paused }: { paused: boolean }) {
  return (
    <span className={`eq${paused ? ' paused' : ''}`} aria-label="Playing">
      <i />
      <i />
      <i />
    </span>
  );
}

export interface TrackTableProps {
  tracks: BaseItem[];
  /** Columns: the album (off on album pages), artwork (off on album pages), plays. */
  album?: boolean;
  art?: boolean;
  plays?: boolean;
  /** Album pages: the disc's track numbers instead of 1, 2, 3. */
  trackNumbers?: boolean;
  /** Songs in a playlist ("Remove from this playlist" in the menu). */
  menu?: MenuContext;
  /** Extra numbers shown in the plays column (Last.fm plays), by song id. */
  playsOf?: (t: BaseItem) => number | undefined;
}

/**
 * Songs as a table, like Spotify's: click selects (Ctrl adds, Shift picks a range), double-click
 * or Enter plays, right-click opens the menu for what's selected. Only the rows on screen are
 * drawn, so a 5,000-song list costs the same as a 20-song one.
 */
export function TrackTable({ tracks, album = true, art = true, plays = false, trackNumbers = false, menu, playsOf }: TrackTableProps) {
  const parent = useRef<HTMLDivElement>(null);
  const nowId = usePlayer((s) => s.queue[s.index]?.Id);
  const playing = usePlayer((s) => s.playing);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState(0);
  const [margin, setMargin] = useState(0);

  useEffect(() => {
    setMargin(parent.current?.offsetTop ?? 0);
  }, []);

  const rows = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => document.getElementById('main'),
    estimateSize: () => 56,
    overscan: 10,
    scrollMargin: margin,
  });

  const play = (i: number) => usePlayer.getState().playQueue(tracks, i, { shuffle: false });
  const pick = (i: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      setSelected(new Set(Array.from({ length: b - a + 1 }, (_, k) => a + k)));
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      setSelected(next);
      setAnchor(i);
    } else {
      setSelected(new Set([i]));
      setAnchor(i);
    }
  };

  const cols = ['num', 'title', ...(album ? ['album'] : []), ...(plays ? ['plays'] : []), 'like', 'len'];
  const grid = cols.map((c) => ({ num: '40px', title: 'minmax(0, 5fr)', album: 'minmax(0, 3fr)', plays: '110px', like: '36px', len: '56px' })[c]).join(' ');

  return (
    <div
      className="tracktable"
      ref={parent}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && selected.size) play(Math.min(...selected));
        if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          setSelected(new Set(tracks.map((_, i) => i)));
        }
      }}>
      <div className="tt-head" style={{ gridTemplateColumns: grid }}>
        <div className="num">#</div>
        <div>Title</div>
        {album ? <div>Album</div> : null}
        {plays ? <div className="right">Plays</div> : null}
        <div />
        <div className="right">
          <Clock3 size={15} />
        </div>
      </div>
      <div style={{ height: rows.getTotalSize(), position: 'relative' }}>
        {rows.getVirtualItems().map((row) => {
          const t = tracks[row.index];
          const now = t.Id === nowId;
          const liked = !!t.UserData?.IsFavorite;
          const count = playsOf?.(t);
          return (
            <div
              key={row.key}
              className={`tt-row${selected.has(row.index) ? ' sel' : ''}${now ? ' now' : ''}`}
              style={{ gridTemplateColumns: grid, transform: `translateY(${row.start - margin}px)` }}
              onClick={(e) => pick(row.index, e)}
              onDoubleClick={() => play(row.index)}
              onContextMenu={(e) => {
                const inSel = selected.has(row.index);
                const indexes = inSel ? [...selected].sort((a, b) => a - b) : [row.index];
                if (!inSel) {
                  setSelected(new Set([row.index]));
                  setAnchor(row.index);
                }
                const items = indexes.map((i) => tracks[i]);
                openMenu(e, songMenu(items, menu), items.length > 1 ? `${items.length} songs` : undefined);
              }}>
              <div className="num">
                <span className="n">{now ? <Playing paused={!playing} /> : trackNumbers ? (t.IndexNumber ?? row.index + 1) : row.index + 1}</span>
                <button
                  className="hoverplay"
                  aria-label={now && playing ? 'Pause' : 'Play'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (now) usePlayer.getState().toggle();
                    else play(row.index);
                  }}>
                  {now && playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>
              </div>
              <div className="who">
                {art ? <Artwork item={t} size={80} className="thumb" /> : null}
                <div className="tt-text">
                  <div className="name">{t.Name}</div>
                  <div className="by">
                    <ArtistLinks item={t} />
                  </div>
                </div>
              </div>
              {album ? (
                <div className="album">
                  {t.AlbumId ? (
                    <span
                      className="linkish"
                      onClick={(e) => {
                        e.stopPropagation();
                        go({ name: 'album', id: t.AlbumId! });
                      }}>
                      {t.Album}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {plays ? <div className="right plays">{count !== undefined ? count.toLocaleString() : (t.UserData?.PlayCount ?? 0) || ''}</div> : null}
              <div className="like">
                <button
                  className={`heart${liked ? ' on' : ''}`}
                  aria-label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                  title={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                  onClick={(e) => {
                    e.stopPropagation();
                    void setLiked([t], !liked);
                  }}>
                  <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="right len">{formatTime(ticksToSeconds(t.RunTimeTicks))}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The top of an album, artist or playlist page: the picture and name over the item's colour. */
export function LibraryHeader({
  item,
  kind,
  title,
  meta,
  art,
  color,
}: {
  item?: BaseItem;
  kind: string;
  title?: string;
  meta?: ReactNode;
  art?: ReactNode;
  color?: string;
}) {
  const client = useAuth((s) => s.client);
  const tint = color ?? (item && client ? artColor(client.blurhash(item), '#3a3a3e') : '#3a3a3e');
  const name = title ?? (item ? displayName(item) : '');
  const size = name.length > 40 ? 'small' : name.length > 18 ? 'medium' : '';
  return (
    <div className="lib-header" style={{ ['--tint' as string]: tint }}>
      <div className="lib-cover">{art ?? <Artwork item={item} size={500} round={item?.Type === 'MusicArtist'} />}</div>
      <div className="lib-meta">
        <div className="kind">{kind}</div>
        <h1 className={size}>{name}</h1>
        <div className="meta">{meta}</div>
      </div>
    </div>
  );
}

/** Under the header: play, shuffle, like, more; and a find box (and sort) on the right. */
export function ActionBar({
  tracks,
  item,
  liked,
  onLike,
  find,
  onFind,
  extra,
  shuffleFirst,
  color,
}: {
  tracks: BaseItem[];
  item?: BaseItem;
  liked?: boolean;
  onLike?: () => void;
  find?: string;
  onFind?: (v: string) => void;
  extra?: ReactNode;
  shuffleFirst?: boolean;
  color?: string;
}) {
  const client = useAuth((s) => s.client);
  const tint = color ?? (item && client ? artColor(client.blurhash(item), '#3a3a3e') : '#3a3a3e');
  const nowId = usePlayer((s) => s.queue[s.index]?.Id);
  const playing = usePlayer((s) => s.playing);
  const isThis = !!nowId && tracks.some((t) => t.Id === nowId);
  return (
    <div className="action-bar" style={{ ['--tint' as string]: tint }}>
      <button
        className="bigplay"
        aria-label={isThis && playing ? 'Pause' : 'Play'}
        title={isThis && playing ? 'Pause' : 'Play'}
        disabled={!tracks.length}
        onClick={() => (isThis ? usePlayer.getState().toggle() : usePlayer.getState().playQueue(tracks, 0, { shuffle: !!shuffleFirst }))}>
        {isThis && playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: 3 }} />}
      </button>
      <button
        className="iconbtn big"
        aria-label="Shuffle play"
        title="Shuffle play"
        disabled={!tracks.length}
        onClick={() => usePlayer.getState().playQueue(tracks, Math.floor(Math.random() * tracks.length), { shuffle: true })}>
        <Shuffle size={26} />
      </button>
      {onLike ? (
        <button className={`iconbtn big${liked ? ' on' : ''}`} aria-label="Like" title={liked ? 'Remove from your library' : 'Save to your library'} onClick={onLike}>
          <Heart size={28} fill={liked ? 'currentColor' : 'none'} />
        </button>
      ) : null}
      {item ? (
        <button className="iconbtn big" aria-label="More" title="More" onClick={(e) => openMenu(e, collectionMenu(item), displayName(item))}>
          <MoreHorizontal size={28} />
        </button>
      ) : null}
      <div style={{ flex: 1 }} />
      {extra}
      {onFind ? (
        <label className="find">
          <Search size={15} />
          <input value={find} onChange={(e) => onFind(e.target.value)} placeholder="Find in list" />
        </label>
      ) : null}
    </div>
  );
}

/** Filter songs by the words typed (title, artists, album). */
export function findIn(tracks: BaseItem[], text: string): BaseItem[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return tracks;
  return tracks.filter((t) => {
    const hay = `${t.Name} ${t.Artists?.join(' ') ?? ''} ${t.AlbumArtist ?? ''} ${t.Album ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
