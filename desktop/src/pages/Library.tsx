// Your Library's lists: albums, artists, playlists and mixes as grids, every song as a table,
// and genres (tiles, then a genre's page).
import { useMemo, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { blurhashAverage } from '@/lib/blurhash';
import { tileColor } from '@/lib/color';
import { useAuth } from '~/auth/session';
import { createPlaylist } from '~/library/actions';
import { go } from '~/nav';
import { useAllAlbums, useAllArtists, useAllSongs, useDailyMixes, useGenreAlbums, useGenres, useGenreTopSongs, usePlaylists } from '~/queries';
import { ArrowDownAZ, Blend, Disc3, ListMusic, Music, Search, Tags, UserRound, type Icon } from '~/ui/icons';
import { ActionBar, Artwork, findIn, ItemCard, LibraryHeader, TrackTable } from '~/ui/parts';
import { Empty, QueryState } from '~/ui/states';

type SortKey = 'name' | 'recent' | 'artist' | 'year';
const SORT_LABEL: Record<SortKey, string> = { name: 'Alphabetical', recent: 'Recently Added', artist: 'Artist', year: 'Release year' };

function sortItems(items: BaseItem[], key: SortKey): BaseItem[] {
  const by = (f: (i: BaseItem) => string | number) =>
    [...items].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      return typeof x === 'number' && typeof y === 'number' ? y - x : String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
    });
  switch (key) {
    case 'recent':
      return [...items].sort((a, b) => (b.DateCreated ?? '').localeCompare(a.DateCreated ?? ''));
    case 'artist':
      return by((i) => `${i.AlbumArtist ?? ''} ${i.ProductionYear ?? ''} ${i.Name}`);
    case 'year':
      return by((i) => i.ProductionYear ?? 0);
    default:
      return by((i) => i.Name);
  }
}

interface GridQuery {
  data?: BaseItem[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch(): unknown;
}

function LibraryGrid({ title, q, sorts, empty }: { title: string; q: GridQuery; sorts: SortKey[]; empty: { icon: Icon; title: string; detail: string; action?: { label: string; run(): void } } }) {
  const storeKey = `rakki.sort.${title}`;
  const [sort, setSort] = useState<SortKey>(() => (localStorage.getItem(storeKey) as SortKey) || sorts[0]);
  const [find, setFind] = useState('');
  const items = q.data;
  const shown = useMemo(() => {
    const words = find.toLowerCase().split(/\s+/).filter(Boolean);
    const found = (items ?? []).filter((i) => {
      const hay = `${i.Name} ${i.AlbumArtist ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return sortItems(found, sort);
  }, [items, find, sort]);
  return (
    <div className="page">
      <div className="page-head">
        <h1>{title}</h1>
        <span className="muted count">{items ? `${items.length.toLocaleString()}` : ''}</span>
        <div style={{ flex: 1 }} />
        <label className="find">
          <Search size={16} />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Find in ${title.toLowerCase()}`} aria-label={`Find in ${title.toLowerCase()}`} />
        </label>
        {sorts.length > 1 ? (
          <label className="select">
            <ArrowDownAZ size={16} />
            <select
              aria-label="Sort By"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                localStorage.setItem(storeKey, e.target.value);
              }}>
              {sorts.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <QueryState q={q} what={`your ${title.toLowerCase()}`} empty={<Empty {...empty} />} />
      <div className="grid">
        {shown.map((i) => (
          <ItemCard key={i.Id} item={i} />
        ))}
      </div>
      {items?.length && !shown.length ? <p className="empty-note">Nothing matches “{find}”.</p> : null}
    </div>
  );
}

export const Albums = () => (
  <LibraryGrid
    title="Albums"
    q={useAllAlbums()}
    sorts={['name', 'recent', 'artist', 'year']}
    empty={{ icon: Disc3, title: 'No Albums Yet', detail: 'Albums in your Jellyfin music library show up here.' }}
  />
);
export const Artists = () => (
  <LibraryGrid title="Artists" q={useAllArtists()} sorts={['name', 'recent']} empty={{ icon: UserRound, title: 'No Artists Yet', detail: 'The artists of your albums show up here.' }} />
);
export const Playlists = () => (
  <LibraryGrid
    title="Playlists"
    q={usePlaylists()}
    sorts={['name', 'recent']}
    empty={{ icon: ListMusic, title: 'No Playlists Yet', detail: 'Make one here, or from any song’s Add to playlist.', action: { label: 'New Playlist', run: () => void createPlaylist() } }}
  />
);
export const Mixes = () => (
  <LibraryGrid
    title="Daily Mixes"
    q={useDailyMixes()}
    sorts={['name']}
    empty={{ icon: Blend, title: 'No Daily Mixes Yet', detail: 'The Rakki plugin on your server makes them from what you play, once a day.' }}
  />
);

export function Songs() {
  const q = useAllSongs();
  const [find, setFind] = useState('');
  const tracks = useMemo(() => findIn(q.data ?? [], find), [q.data, find]);
  return (
    <div>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="page-head">
          <h1>Songs</h1>
          <span className="muted count">{q.data ? q.data.length.toLocaleString() : ''}</span>
        </div>
      </div>
      <ActionBar tracks={tracks} find={find} onFind={setFind} />
      <div className="page-states">
        <QueryState q={q} what="your songs" empty={<Empty icon={Music} title="No Songs Yet" detail="Songs in your Jellyfin music library show up here." />} />
      </div>
      {q.data?.length ? <TrackTable tracks={tracks} plays /> : null}
    </div>
  );
}

export function Genres() {
  const q = useGenres();
  const client = useAuth((s) => s.client);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Genres</h1>
      </div>
      <QueryState q={q} what="genres" empty={<Empty icon={Tags} title="No Genres Yet" detail="Genres come from your music’s tags." />} />
      <div className="genre-grid">
        {q.data?.map((g) => {
          const rgb = g.album && client ? blurhashAverage(client.blurhash(g.album)) : null;
          return (
            <button key={g.name} className="genre-tile" style={{ background: tileColor(rgb, g.name) }} onClick={() => go({ name: 'genre', id: g.name })}>
              <span>{g.name}</span>
              <small>{g.count} albums</small>
              {g.album ? <Artwork item={g.album} size={160} className="genre-art" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Genre({ name }: { name: string }) {
  const albumsQ = useGenreAlbums(name);
  const albums = albumsQ.data;
  const top = useGenreTopSongs(name).data ?? [];
  const tint = tileColor(null, name);
  return (
    <div>
      <LibraryHeader
        kind="Genre"
        title={name}
        color={tint}
        meta={albums ? `${albums.length} albums` : ''}
        art={
          <div className="artwork empty genre-cover" style={{ background: tint }}>
            {name.slice(0, 1)}
          </div>
        }
      />
      <ActionBar tracks={top} color={tint} />
      {top.length ? (
        <div className="page" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <h2>Your Most Played</h2>
        </div>
      ) : null}
      <TrackTable tracks={top} plays />
      <div className="page" style={{ paddingTop: 8 }}>
        <h2 style={{ marginBottom: 12 }}>Albums</h2>
        <QueryState q={albumsQ} what={`${name} albums`} empty={<Empty icon={Disc3} title={`No ${name} albums`} detail="Albums tagged with this genre show up here." />} />
        <div className="grid">
          {albums?.map((a) => (
            <ItemCard key={a.Id} item={a} />
          ))}
        </div>
      </div>
    </div>
  );
}
