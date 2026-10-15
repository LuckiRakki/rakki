// The pieces every screen is built from: artwork, cards, shelves, the song table, and the header
// and action bar at the top of album, artist and playlist pages.
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeft, ChevronRight, Clock3, Disc3, Heart, MoreHorizontal, Music2, Pause, Play, Search, Shuffle } from '~/ui/icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { useInAnyPlaylist } from '@/library/playlistCache';
import { artColor } from '@/lib/blurhash';
import { displayName, isMix, mixArtists } from '@/lib/mixes';
import { useAuth } from '~/auth/session';
import { playItem, setLiked } from '~/library/actions';
import { openAddToPlaylist } from '~/library/AddToPlaylist';
import { collectionMenu, songMenu, type MenuContext } from '~/library/menus';
import { go, openItem } from '~/nav';
import { usePlayer } from '~/player/store';
import { useLook } from '~/settings/look';
import { activateOnKey } from '~/ui/keys';
import { openMenu } from '~/ui/overlays';

/** Pictures picked on this computer, shown while they upload (library/actions.ts). */
const useLocalPictures = create<Record<string, string>>(() => ({}));

export function showLocalPicture(id: string, url: string | null) {
  useLocalPictures.setState((m) => {
    const next = { ...m };
    if (url) next[id] = url;
    else delete next[id];
    return next;
  }, true);
}

export function Artwork({ item, size = 300, round, className }: { item?: BaseItem; size?: number; round?: boolean; className?: string }) {
  const client = useAuth((s) => s.client);
  const local = useLocalPictures((m) => (item ? m[item.Id] : undefined));
  // A radio station's picture is what's on air (SUB/WAVE), not a Jellyfin image.
  const src = local ?? (item?.Radio ? item.Radio.coverUrl : item ? client?.imageUrl(item, size) : undefined);
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
      aria-label={`${displayName(item)}, ${subtitle(item)}`}
      onKeyDown={activateOnKey(() => openItem(item))}
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
          <button className="arrow" aria-label="Scroll Left" onClick={() => scroll(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button className="arrow" aria-label="Scroll Right" onClick={() => scroll(1)}>
            <ChevronRight size={18} />
          </button>
          {onShowAll ? (
            <button className="show-all" onClick={onShowAll}>
              Show All
            </button>
          ) : null}
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

export function ArtistLinks({ item, sep = ', ' }: { item: BaseItem; sep?: string }) {
  if (!item.ArtistItems?.length) return <>{item.Artists?.join(sep) || item.AlbumArtist}</>;
  return (
    <>
      {item.ArtistItems.map((a, i) => (
        <span key={a.Id}>
          {i ? sep : ''}
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

/**
 * A song's save button (Spotify's): filled when the song is in Liked Songs or any of your
 * playlists. Not saved: one click likes it. Saved: opens Add to playlist to change where.
 */
export function SaveButton({ item, size = 16, className = '', tabIndex }: { item: BaseItem; size?: number; className?: string; tabIndex?: number }) {
  const inPlaylist = useInAnyPlaylist(item.Id);
  const liked = !!item.UserData?.IsFavorite;
  const saved = liked || inPlaylist;
  // A radio station isn't a Jellyfin item: nothing to save.
  if (item.Radio) return null;
  const title = liked ? 'In Liked Songs: change where it’s saved' : inPlaylist ? 'In your playlists: change where it’s saved' : 'Add to Liked Songs';
  return (
    <button
      className={`heart${saved ? ' on' : ''}${className ? ` ${className}` : ''}`}
      aria-label={title}
      title={title}
      tabIndex={tabIndex}
      onClick={(e) => {
        e.stopPropagation();
        if (saved) openAddToPlaylist([item]);
        else void setLiked([item], true);
      }}>
      <Heart size={size} fill={saved ? 'currentColor' : 'none'} />
    </button>
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
  /** Album pages: a heading before each disc's songs when there's more than one. */
  discs?: boolean;
  /** Songs in a playlist ("Remove from This Playlist" in the menu). */
  menu?: MenuContext;
  /** Extra numbers shown in the plays column (Last.fm plays), by song id. */
  playsOf?: (t: BaseItem) => number | undefined;
  /** Drag rows to reorder (a playlist in its own order): called with the old and new index. */
  onMove?: (from: number, to: number) => void;
}

/**
 * Songs as a table, like Spotify's: click selects (Ctrl adds, Shift picks a range), double-click
 * or Enter plays, right-click (or the Menu key) opens the menu for what's selected. From the
 * keyboard: Tab reaches the table, the arrow keys move (Shift extends), Space selects, Home / End
 * jump. Only the rows on screen are drawn, so a 5,000-song list costs the same as a 20-song one.
 */
const ROW_HEIGHT = { comfortable: 56, compact: 44 };
const DISC_H = 48;

export function TrackTable({ tracks, album = true, art = true, plays = false, trackNumbers = false, discs = false, menu, playsOf, onMove }: TrackTableProps) {
  const parent = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const ROW_H = ROW_HEIGHT[useLook((l) => l.app.density)];
  // Albums with more than one disc: a "Disc 2" heading before each disc's songs (not while
  // reordering, which needs every row the same height).
  const { slots, slotOf } = useMemo(() => {
    const out: ({ disc: number } | { track: number })[] = [];
    const where: number[] = [];
    const many = discs && !onMove && new Set(tracks.map((t) => t.ParentIndexNumber ?? 1)).size > 1;
    let last: number | null = null;
    tracks.forEach((t, i) => {
      const d = t.ParentIndexNumber ?? 1;
      if (many && d !== last) out.push({ disc: d });
      last = d;
      where[i] = out.length;
      out.push({ track: i });
    });
    return { slots: out, slotOf: where };
  }, [tracks, discs, onMove]);
  // Dragging a row: which one, and the gap it would drop into (0..length).
  const [drag, setDrag] = useState<{ from: number; gap: number } | null>(null);
  const nowId = usePlayer((s) => s.queue[s.index]?.Id);
  const playing = usePlayer((s) => s.playing);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState(0);
  const [margin, setMargin] = useState(0);
  // The row the keyboard is on (the one Tab lands on).
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    setMargin(parent.current?.offsetTop ?? 0);
  }, []);

  const rows = useVirtualizer({
    count: slots.length,
    getScrollElement: () => document.getElementById('main'),
    estimateSize: (i) => (slots[i] && 'disc' in slots[i] ? DISC_H : ROW_H),
    overscan: 10,
    scrollMargin: margin,
  });
  // Spacing changed (Settings -> Look): every row's size changed with it.
  useEffect(() => rows.measure(), [ROW_H]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = (i: number) => usePlayer.getState().playQueue(tracks, i, { shuffle: false });

  /** Keyboard: move to row i (scrolling it into view), selecting it, or the range with Shift. */
  const moveTo = (i: number, extend: boolean) => {
    const to = Math.max(0, Math.min(tracks.length - 1, i));
    setCursor(to);
    if (extend) {
      const [a, b] = [Math.min(anchor, to), Math.max(anchor, to)];
      setSelected(new Set(Array.from({ length: b - a + 1 }, (_, k) => a + k)));
    } else {
      setSelected(new Set([to]));
      setAnchor(to);
    }
    rows.scrollToIndex(slotOf[to] ?? to, { align: 'auto' });
    requestAnimationFrame(() => body.current?.querySelector<HTMLElement>(`[data-row="${to}"]`)?.focus());
  };
  const onRowKey = (e: React.KeyboardEvent, i: number) => {
    const page = Math.max(1, Math.floor((document.getElementById('main')?.clientHeight ?? 560) / ROW_H) - 1);
    const to: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, PageDown: i + page, PageUp: i - page, Home: 0, End: tracks.length - 1 };
    if (to[e.key] !== undefined) {
      e.preventDefault();
      moveTo(to[e.key], e.shiftKey);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      play(i);
    } else if (e.key === ' ') {
      e.preventDefault();
      const next = new Set(selected);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      setSelected(next);
      setAnchor(i);
    }
  };
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

  /** Press on a row: past a few pixels of movement it becomes a drag (reorder). */
  const startDrag = (from: number, e: React.PointerEvent) => {
    if (!onMove || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest('button, .linkish')) return;
    const y0 = e.clientY;
    let gap = -1;
    const main = document.getElementById('main');
    const move = (ev: PointerEvent) => {
      if (gap < 0 && Math.abs(ev.clientY - y0) < 6) return;
      const top = body.current?.getBoundingClientRect().top ?? 0;
      gap = Math.max(0, Math.min(tracks.length, Math.round((ev.clientY - top) / ROW_H)));
      setDrag({ from, gap });
      // Near the top or bottom of the page: scroll along.
      const r = main?.getBoundingClientRect();
      if (main && r) {
        if (ev.clientY < r.top + 60) main.scrollBy(0, -18);
        else if (ev.clientY > r.bottom - 60) main.scrollBy(0, 18);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (gap < 0) return;
      const to = gap > from ? gap - 1 : gap;
      if (to !== from) onMove(from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const cols = ['num', 'title', ...(album ? ['album'] : []), ...(plays ? ['plays'] : []), 'like', 'len'];
  const grid = cols.map((c) => ({ num: '40px', title: 'minmax(0, 5fr)', album: 'minmax(0, 3fr)', plays: '110px', like: '36px', len: '56px' })[c]).join(' ');

  return (
    <div
      className={`tracktable${drag ? ' dragging' : ''}${onMove ? ' movable' : ''}`}
      ref={parent}
      role="grid"
      aria-rowcount={tracks.length}
      aria-multiselectable
      onKeyDown={(e) => {
        if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          setSelected(new Set(tracks.map((_, i) => i)));
        }
      }}>
      <div className="tt-head" role="row" style={{ gridTemplateColumns: grid }}>
        <div className="num">#</div>
        <div>Title</div>
        {album ? <div>Album</div> : null}
        {plays ? <div className="right">Plays</div> : null}
        <div />
        <div className="right">
          <Clock3 size={15} />
        </div>
      </div>
      <div ref={body} style={{ height: rows.getTotalSize(), position: 'relative' }}>
        {drag ? <div className="tt-drop" style={{ top: drag.gap * ROW_H - 1 }} /> : null}
        {rows.getVirtualItems().map((row) => {
          const slot = slots[row.index];
          if ('disc' in slot) {
            return (
              <div key={row.key} className="tt-disc" style={{ height: DISC_H, transform: `translateY(${row.start - margin}px)` }}>
                <Disc3 size={18} />
                Disc {slot.disc}
              </div>
            );
          }
          const ti = slot.track;
          const t = tracks[ti];
          const now = t.Id === nowId;
          const count = playsOf?.(t);
          return (
            <div
              key={row.key}
              className={`tt-row${selected.has(ti) ? ' sel' : ''}${now ? ' now' : ''}${drag?.from === ti ? ' lifted' : ''}`}
              style={{ gridTemplateColumns: grid, height: ROW_H, transform: `translateY(${row.start - margin}px)` }}
              role="row"
              aria-rowindex={ti + 1}
              aria-selected={selected.has(ti)}
              aria-label={`${t.Name}, ${t.Artists?.join(', ') ?? ''}`}
              data-row={ti}
              tabIndex={ti === Math.min(cursor, tracks.length - 1) ? 0 : -1}
              onKeyDown={(e) => onRowKey(e, ti)}
              onFocus={() => setCursor(ti)}
              onPointerDown={(e) => startDrag(ti, e)}
              onClick={(e) => pick(ti, e)}
              onDoubleClick={() => play(ti)}
              onContextMenu={(e) => {
                const inSel = selected.has(ti);
                const indexes = inSel ? [...selected].sort((a, b) => a - b) : [ti];
                if (!inSel) {
                  setSelected(new Set([ti]));
                  setAnchor(ti);
                }
                const items = indexes.map((i) => tracks[i]);
                openMenu(e, songMenu(items, menu), items.length > 1 ? `${items.length} songs` : undefined);
              }}>
              <div className="num">
                <span className="n">{now ? <Playing paused={!playing} /> : trackNumbers ? (t.IndexNumber ?? ti + 1) : ti + 1}</span>
                <button
                  className="hoverplay"
                  tabIndex={-1}
                  aria-label={now && playing ? 'Pause' : 'Play'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (now) usePlayer.getState().toggle();
                    else play(ti);
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
                <SaveButton item={t} tabIndex={-1} />
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
        aria-label="Shuffle Play"
        title="Shuffle Play"
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
          <input value={find} onChange={(e) => onFind(e.target.value)} placeholder="Find in List" />
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
