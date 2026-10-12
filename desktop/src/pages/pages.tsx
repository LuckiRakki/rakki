// The main area's screens.
import { useQuery } from '@tanstack/react-query';
import { ArrowDownAZ, Heart, ImagePlus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { tileColor } from '@/lib/color';
import { isSingleOrEp, releaseKind } from '@/lib/items';
import { artistTopTracks, matchPopular, trackPlaycount } from '@/lib/lastfm';
import { blurhashAverage } from '@/lib/blurhash';
import { isMix } from '@/lib/mixes';
import { useSettings } from '@/settings/store';
import { useAuth } from '~/auth/session';
import { changePlaylistPicture, movePlaylistSong, playItem, setLiked } from '~/library/actions';
import { go, useNav } from '~/nav';
import { usePlayer } from '~/player/store';
import {
  useAlbumTracks,
  useAllAlbums,
  useAllArtists,
  useAllSongs,
  useAppearsOn,
  useArtistAlbums,
  useArtistTracks,
  useDailyMixes,
  useGenreAlbums,
  useGenres,
  useGenreTopSongs,
  useItem,
  useLiked,
  useMostPlayed,
  usePlaylists,
  usePlaylistTracks,
  useRandomAlbums,
  useRecentlyAdded,
  useRecentlyPlayed,
  useRediscover,
  useSimilarArtists,
  useTopArtists,
  useTopTracks,
} from '~/queries';
import { SearchPage } from '~/pages/Search';
import { Settings } from '~/pages/Settings';
import { ActionBar, Artwork, findIn, ItemCard, LibraryHeader, Shelf, Spinner, totalLength, TrackTable } from '~/ui/parts';

// ---- Home ----

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Liked Songs and your last albums as wide tiles, like Spotify's (and the phone app's) quick picks. */
function QuickPicks({ recent }: { recent?: BaseItem[] }) {
  const tiles = (recent ?? []).slice(0, 7);
  const tile = (key: string, label: string, art: React.ReactNode, onClick: () => void, item?: BaseItem) => (
    <button key={key} className="quick" onClick={onClick} onDoubleClick={item ? () => void playItem(item) : undefined}>
      {art}
      <span>{label}</span>
    </button>
  );
  return (
    <div className="quick-grid">
      {tile(
        'liked',
        'Liked Songs',
        <div className="artwork empty liked-art quick-art">
          <Heart size={20} fill="#fff" color="#fff" />
        </div>,
        () => go({ name: 'liked' }),
      )}
      {tiles.map((a) => tile(a.Id, a.Name, <Artwork item={a} size={120} className="quick-art" />, () => go({ name: 'album', id: a.Id }), a))}
    </div>
  );
}

export function Home() {
  const recent = useRecentlyPlayed();
  const mixes = useDailyMixes();
  const added = useRecentlyAdded();
  const most = useMostPlayed();
  const rediscover = useRediscover();
  const random = useRandomAlbums();
  const artists = useTopArtists();
  const playlists = usePlaylists();
  return (
    <div className="page home">
      <h1>{greeting()}</h1>
      <QuickPicks recent={recent.data} />
      <Shelf title="Your Daily Mixes" items={mixes.data} onShowAll={() => go({ name: 'mixes' })} />
      <Shelf title="Jump back in" items={recent.data?.slice(7)} />
      <Shelf title="Recently added" items={added.data} onShowAll={() => go({ name: 'albums' })} />
      <Shelf title="Your playlists" items={playlists.data} onShowAll={() => go({ name: 'playlists' })} />
      <Shelf title="Artists you play" items={artists.data} onShowAll={() => go({ name: 'artists' })} />
      <Shelf title="Most played" items={most.data} />
      <Shelf title="Rediscover" items={rediscover.data} />
      <Shelf title="Random picks" items={random.data} />
      {recent.isLoading ? <Spinner /> : null}
    </div>
  );
}

// ---- Library lists ----

type SortKey = 'name' | 'recent' | 'artist' | 'year';
const SORT_LABEL: Record<SortKey, string> = { name: 'Alphabetical', recent: 'Recently added', artist: 'Artist', year: 'Release year' };

function sortItems(items: BaseItem[], key: SortKey): BaseItem[] {
  const by = (f: (i: BaseItem) => string | number) => [...items].sort((a, b) => {
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

function LibraryGrid({ title, items, loading, sorts }: { title: string; items?: BaseItem[]; loading?: boolean; sorts: SortKey[] }) {
  const storeKey = `rakki.sort.${title}`;
  const [sort, setSort] = useState<SortKey>(() => (localStorage.getItem(storeKey) as SortKey) || sorts[0]);
  const [find, setFind] = useState('');
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
          <Search size={15} />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Find in ${title.toLowerCase()}`} />
        </label>
        {sorts.length > 1 ? (
          <label className="select">
            <ArrowDownAZ size={15} />
            <select
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
      {loading ? <Spinner /> : null}
      <div className="grid">
        {shown.map((i) => (
          <ItemCard key={i.Id} item={i} />
        ))}
      </div>
      {items && !shown.length ? <p className="empty-note">Nothing matches “{find}”.</p> : null}
    </div>
  );
}

export const Albums = () => {
  const q = useAllAlbums();
  return <LibraryGrid title="Albums" items={q.data} loading={q.isLoading} sorts={['name', 'recent', 'artist', 'year']} />;
};
export const Artists = () => {
  const q = useAllArtists();
  return <LibraryGrid title="Artists" items={q.data} loading={q.isLoading} sorts={['name', 'recent']} />;
};
export const Playlists = () => {
  const q = usePlaylists();
  return <LibraryGrid title="Playlists" items={q.data} loading={q.isLoading} sorts={['name', 'recent']} />;
};
export const Mixes = () => {
  const q = useDailyMixes();
  return <LibraryGrid title="Daily Mixes" items={q.data} loading={q.isLoading} sorts={['name']} />;
};

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
      {q.isLoading ? <Spinner /> : <TrackTable tracks={tracks} plays />}
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
      {q.isLoading ? <Spinner /> : null}
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
  const albums = useGenreAlbums(name).data;
  const top = useGenreTopSongs(name).data ?? [];
  const tint = tileColor(null, name);
  return (
    <div>
      <LibraryHeader
        kind="Genre"
        title={name}
        color={tint}
        meta={albums ? `${albums.length} albums` : ''}
        art={<div className="artwork empty genre-cover" style={{ background: tint }}>{name.slice(0, 1)}</div>}
      />
      <ActionBar tracks={top} color={tint} />
      {top.length ? (
        <div className="page" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <h2>Your most played</h2>
        </div>
      ) : null}
      <TrackTable tracks={top} plays />
      <div className="page" style={{ paddingTop: 8 }}>
        <h2 style={{ marginBottom: 12 }}>Albums</h2>
        <div className="grid">
          {albums?.map((a) => (
            <ItemCard key={a.Id} item={a} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Album, playlist, Liked Songs ----

/** Worldwide plays for an album's songs from Last.fm (when there's a key), a few at a time. */
function useAlbumLastfmPlays(album: BaseItem | undefined, tracks: BaseItem[]) {
  const key = useSettings((s) => s.lastfmApiKey.trim());
  const on = useSettings((s) => s.lastfmAlbumPlays);
  return useQuery({
    queryKey: ['albumLastfm', album?.Id, tracks.length],
    enabled: !!album && !!key && on && tracks.length > 0,
    staleTime: 24 * 3600_000,
    queryFn: async () => {
      const out: Record<string, number> = {};
      for (let i = 0; i < tracks.length; i += 4) {
        await Promise.all(
          tracks.slice(i, i + 4).map(async (t) => {
            const n = await trackPlaycount(t.Artists?.[0] ?? album!.AlbumArtist ?? '', t.Name).catch(() => null);
            if (n !== null) out[t.Id] = n;
          }),
        );
      }
      return out;
    },
  });
}

export function Album({ id }: { id: string }) {
  const item = useItem(id).data;
  const tracks = useAlbumTracks(id).data ?? [];
  const lastfm = useAlbumLastfmPlays(item, tracks).data;
  const more = useArtistAlbums(item?.AlbumArtists?.[0]?.Id ?? '').data?.filter((a) => a.Id !== id);
  const [find, setFind] = useState('');
  const shown = useMemo(() => findIn(tracks, find), [tracks, find]);
  const multiDisc = new Set(tracks.map((t) => t.ParentIndexNumber ?? 1)).size > 1;
  return (
    <div>
      <LibraryHeader
        item={item}
        kind={item ? releaseKind(item) : 'Album'}
        meta={
          <>
            {item?.AlbumArtists?.map((a, i) => (
              <span key={a.Id}>
                {i ? ', ' : ''}
                <b className="linkish" onClick={() => go({ name: 'artist', id: a.Id })}>
                  {a.Name}
                </b>
              </span>
            ))}
            {item?.ProductionYear ? ` · ${item.ProductionYear}` : ''} · {tracks.length} songs, {totalLength(tracks)}
            {multiDisc ? ` · ${new Set(tracks.map((t) => t.ParentIndexNumber ?? 1)).size} discs` : ''}
          </>
        }
      />
      <ActionBar
        tracks={tracks}
        item={item}
        liked={!!item?.UserData?.IsFavorite}
        onLike={item ? () => void setLiked([item], !item.UserData?.IsFavorite) : undefined}
        find={find}
        onFind={setFind}
      />
      <TrackTable tracks={shown} album={false} art={false} trackNumbers plays={!!lastfm} playsOf={lastfm ? (t) => lastfm[t.Id] : undefined} />
      <div className="page">
        {item?.Overview ? <p className="overview">{item.Overview}</p> : null}
        <Shelf title={`More by ${item?.AlbumArtist ?? 'this artist'}`} items={more} onShowAll={item?.AlbumArtists?.[0] ? () => go({ name: 'artist', id: item.AlbumArtists![0].Id }) : undefined} />
      </div>
    </div>
  );
}

type PlaylistSort = 'custom' | 'title' | 'artist' | 'album' | 'length';

export function Playlist({ id }: { id: string }) {
  const item = useItem(id).data;
  const tracks = usePlaylistTracks(id).data ?? [];
  const [find, setFind] = useState('');
  const [sort, setSort] = useState<PlaylistSort>('custom');
  const shown = useMemo(() => {
    const found = findIn(tracks, find);
    const cmp = (f: (t: BaseItem) => string) => [...found].sort((a, b) => f(a).localeCompare(f(b), undefined, { sensitivity: 'base' }));
    if (sort === 'title') return cmp((t) => t.Name);
    if (sort === 'artist') return cmp((t) => `${t.Artists?.[0] ?? ''} ${t.Album ?? ''}`);
    if (sort === 'album') return cmp((t) => `${t.Album ?? ''} ${String(t.IndexNumber ?? 0).padStart(3, '0')}`);
    if (sort === 'length') return [...found].sort((a, b) => (b.RunTimeTicks ?? 0) - (a.RunTimeTicks ?? 0));
    return found;
  }, [tracks, find, sort]);
  const mix = item ? isMix(item) : false;
  return (
    <div>
      <LibraryHeader
        item={item}
        kind={mix ? 'Daily Mix' : 'Playlist'}
        art={
          item && !mix ? (
            <button className="cover-edit" title="Change picture" onClick={() => changePlaylistPicture(item)}>
              <Artwork item={item} size={500} />
              <span>
                <ImagePlus size={34} />
                Choose picture
              </span>
            </button>
          ) : undefined
        }
        meta={
          <>
            {item?.Overview && mix ? <div className="overview-line">{item.Overview.split('. ')[0]}</div> : null}
            {tracks.length} songs, {totalLength(tracks)}
          </>
        }
      />
      <ActionBar
        tracks={shown}
        item={item}
        find={find}
        onFind={setFind}
        extra={
          <label className="select">
            <ArrowDownAZ size={15} />
            <select value={sort} onChange={(e) => setSort(e.target.value as PlaylistSort)}>
              <option value="custom">Custom order</option>
              <option value="title">Title</option>
              <option value="artist">Artist</option>
              <option value="album">Album</option>
              <option value="length">Length</option>
            </select>
          </label>
        }
      />
      <TrackTable
        tracks={shown}
        menu={mix ? undefined : { playlistId: id }}
        onMove={!mix && sort === 'custom' && !find ? (from, to) => void movePlaylistSong(id, from, to) : undefined}
      />
    </div>
  );
}

export function Liked() {
  const q = useLiked();
  const tracks = q.data ?? [];
  const [find, setFind] = useState('');
  const shown = useMemo(() => findIn(tracks, find), [tracks, find]);
  return (
    <div>
      <LibraryHeader
        kind="Playlist"
        title="Liked Songs"
        color="#4a2fd1"
        meta={`${tracks.length} songs, ${totalLength(tracks)}`}
        art={
          <div className="artwork empty liked-art">
            <Heart size={72} fill="#fff" color="#fff" />
          </div>
        }
      />
      <ActionBar tracks={shown} color="#4a2fd1" find={find} onFind={setFind} />
      {q.isLoading ? <Spinner /> : <TrackTable tracks={shown} />}
    </div>
  );
}

// ---- Artist ----

/** The artist's most played songs worldwide (Last.fm, matched to your library), else by your plays. */
function usePopular(artist: BaseItem | undefined) {
  const key = useSettings((s) => s.lastfmApiKey.trim());
  const sortMine = useSettings((s) => s.popularSort === 'mine');
  const mine = useTopTracks(artist?.Id ?? '').data ?? [];
  const library = useArtistTracks(artist?.Id ?? '').data;
  const lastfm = useQuery({
    queryKey: ['artistPopular', artist?.Id],
    enabled: !!artist && !!key && !sortMine && !!library,
    staleTime: 24 * 3600_000,
    queryFn: async () => matchPopular(await artistTopTracks(artist!.Name), library!, artist!.Id).slice(0, 10),
  });
  if (lastfm.data?.length) {
    const counts = Object.fromEntries(lastfm.data.map((p) => [p.track.Id, p.playcount]));
    return { tracks: lastfm.data.map((p) => p.track), playsOf: (t: BaseItem) => counts[t.Id], source: 'Last.fm' as const };
  }
  return { tracks: mine, playsOf: undefined, source: 'you' as const };
}

export function Artist({ id }: { id: string }) {
  const item = useItem(id).data;
  const client = useAuth((s) => s.client);
  const popular = usePopular(item);
  const albums = useArtistAlbums(id).data;
  const appears = useAppearsOn(id).data;
  const similar = useSimilarArtists(id).data;
  const [showAll, setShowAll] = useState(false);
  const full = albums?.filter((a) => !isSingleOrEp(a));
  const singles = albums?.filter(isSingleOrEp);
  const backdrop = item && client ? client.backdropUrl(item, 1600) : undefined;
  const following = !!item?.UserData?.IsFavorite;
  return (
    <div>
      <div className={`artist-hero${backdrop ? ' with-image' : ''}`} style={backdrop ? { backgroundImage: `url("${backdrop}")` } : undefined}>
        {!backdrop ? <LibraryHeader item={item} kind="Artist" meta={item?.Genres?.slice(0, 3).join(' · ')} /> : (
          <div className="artist-name">
            <div className="kind">Artist</div>
            <h1>{item?.Name}</h1>
            <div className="meta">{item?.Genres?.slice(0, 3).join(' · ')}</div>
          </div>
        )}
      </div>
      <ActionBar
        tracks={popular.tracks}
        item={item}
        shuffleFirst
        extra={
          <button className={`pill${following ? ' on' : ''}`} onClick={() => item && void setLiked([item], !following)}>
            {following ? 'Following' : 'Follow'}
          </button>
        }
      />
      <div className="page" style={{ paddingTop: 0, paddingBottom: 4 }}>
        <h2>
          Popular <span className="muted small">{popular.source === 'Last.fm' ? 'worldwide plays from Last.fm' : 'your plays'}</span>
        </h2>
      </div>
      <TrackTable tracks={showAll ? popular.tracks : popular.tracks.slice(0, 5)} album plays playsOf={popular.playsOf} />
      {popular.tracks.length > 5 ? (
        <div className="page" style={{ padding: '0 28px' }}>
          <button className="textbtn" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show less' : 'See more'}
          </button>
        </div>
      ) : null}
      <div className="page">
        <Shelf title="Albums" items={full} />
        <Shelf title="Singles and EPs" items={singles} />
        <Shelf title="Appears on" items={appears} />
        <Shelf title="Fans also like" items={similar} />
        {item?.Overview ? (
          <section className="shelf">
            <h2 style={{ marginBottom: 10 }}>About</h2>
            <p className="overview">{item.Overview}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

// ---- Search ----

export function Page() {
  const route = useNav((s) => s.route);
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'albums':
      return <Albums />;
    case 'songs':
      return <Songs />;
    case 'artists':
      return <Artists />;
    case 'genres':
      return <Genres />;
    case 'genre':
      return <Genre key={route.id} name={route.id} />;
    case 'playlists':
      return <Playlists />;
    case 'mixes':
      return <Mixes />;
    case 'liked':
      return <Liked />;
    case 'album':
      return <Album key={route.id} id={route.id} />;
    case 'artist':
      return <Artist key={route.id} id={route.id} />;
    case 'playlist':
      return <Playlist key={route.id} id={route.id} />;
    case 'search':
      return <SearchPage term={route.term ?? ''} />;
    case 'settings':
      return <Settings />;
  }
}
