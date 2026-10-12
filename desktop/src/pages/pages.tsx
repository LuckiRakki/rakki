// The main area's screens.
import { Heart, Play, Shuffle } from 'lucide-react';

import type { BaseItem } from '@/api/jellyfin';
import { go, useNav } from '~/nav';
import { usePlayer } from '~/player/store';
import {
  useAlbumTracks,
  useAllAlbums,
  useAllArtists,
  useArtistAlbums,
  useDailyMixes,
  useItem,
  useLiked,
  useMostPlayed,
  usePlaylists,
  usePlaylistTracks,
  useRecentlyAdded,
  useRecentlyPlayed,
  useSearch,
  useSimilarArtists,
  useTopArtists,
  useTopTracks,
} from '~/queries';
import { Hero, ItemCard, Shelf, Spinner, totalLength, TrackList } from '~/ui/parts';

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const recent = useRecentlyPlayed();
  const mixes = useDailyMixes();
  const added = useRecentlyAdded();
  const most = useMostPlayed();
  const artists = useTopArtists();
  const playlists = usePlaylists();
  return (
    <div className="page">
      <h1>{greeting()}</h1>
      <Shelf title="Jump back in" items={recent.data} />
      <Shelf title="Your Daily Mixes" items={mixes.data} onShowAll={() => go({ name: 'mixes' })} />
      <Shelf title="Recently added" items={added.data} onShowAll={() => go({ name: 'albums' })} />
      <Shelf title="Your playlists" items={playlists.data} onShowAll={() => go({ name: 'playlists' })} />
      <Shelf title="Most played" items={most.data} />
      <Shelf title="Artists you play" items={artists.data} onShowAll={() => go({ name: 'artists' })} />
      {recent.isLoading ? <Spinner /> : null}
    </div>
  );
}

function Grid({ title, items, loading }: { title: string; items?: BaseItem[]; loading?: boolean }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      {loading ? <Spinner /> : null}
      <div className="grid">
        {items?.map((i) => (
          <ItemCard key={i.Id} item={i} />
        ))}
      </div>
    </div>
  );
}

export const Albums = () => {
  const q = useAllAlbums();
  return <Grid title="Albums" items={q.data} loading={q.isLoading} />;
};
export const Artists = () => {
  const q = useAllArtists();
  return <Grid title="Artists" items={q.data} loading={q.isLoading} />;
};
export const Playlists = () => {
  const q = usePlaylists();
  return <Grid title="Playlists" items={q.data} loading={q.isLoading} />;
};
export const Mixes = () => {
  const q = useDailyMixes();
  return <Grid title="Daily Mixes" items={q.data} loading={q.isLoading} />;
};

function PlayActions({ tracks, shuffleFirst }: { tracks: BaseItem[]; shuffleFirst?: boolean }) {
  const shuffle = usePlayer((s) => s.shuffle);
  return (
    <div className="actions">
      <button className="bigplay" aria-label="Play" onClick={() => usePlayer.getState().playQueue(tracks, 0, shuffleFirst ? { shuffle: true } : undefined)}>
        <Play size={24} fill="#000" />
      </button>
      <button
        className={`iconbtn${shuffle ? ' on' : ''}`}
        aria-label="Shuffle"
        title="Shuffle play"
        onClick={() => usePlayer.getState().playQueue(tracks, Math.floor(Math.random() * tracks.length), { shuffle: true })}>
        <Shuffle size={26} />
      </button>
    </div>
  );
}

export function Album({ id }: { id: string }) {
  const item = useItem(id).data;
  const tracks = useAlbumTracks(id).data ?? [];
  return (
    <div>
      <Hero
        item={item}
        kind="Album"
        meta={
          <>
            {item?.AlbumArtists?.map((a) => (
              <span key={a.Id} className="linkish" style={{ color: 'var(--text)' }} onClick={() => go({ name: 'artist', id: a.Id })}>
                {a.Name}
              </span>
            ))}
            {item?.ProductionYear ? ` · ${item.ProductionYear}` : ''} · {tracks.length} songs, {totalLength(tracks)}
          </>
        }
      />
      <PlayActions tracks={tracks} />
      <TrackList tracks={tracks} showAlbum={false} showArt={false} numbered />
    </div>
  );
}

export function Playlist({ id }: { id: string }) {
  const item = useItem(id).data;
  const tracks = usePlaylistTracks(id).data ?? [];
  return (
    <div>
      <Hero item={item} kind="Playlist" meta={`${tracks.length} songs, ${totalLength(tracks)}`} />
      <PlayActions tracks={tracks} />
      <TrackList tracks={tracks} />
    </div>
  );
}

export function Liked() {
  const tracks = useLiked().data ?? [];
  return (
    <div>
      <div className="hero" style={{ ['--hero' as string]: '#5b2bd1' }}>
        <div className="cover">
          <div className="artwork empty" style={{ background: 'linear-gradient(135deg, #4a2fd1, #9a86f5)' }}>
            <Heart size={64} fill="#fff" color="#fff" />
          </div>
        </div>
        <div>
          <div className="kind">Playlist</div>
          <h1>Liked Songs</h1>
          <div className="meta">{tracks.length} songs</div>
        </div>
      </div>
      <PlayActions tracks={tracks} />
      <TrackList tracks={tracks} />
    </div>
  );
}

export function Artist({ id }: { id: string }) {
  const item = useItem(id).data;
  const top = useTopTracks(id).data ?? [];
  const albums = useArtistAlbums(id).data;
  const similar = useSimilarArtists(id).data;
  return (
    <div>
      <Hero item={item} kind="Artist" meta={item?.Genres?.slice(0, 3).join(' · ')} />
      <PlayActions tracks={top} shuffleFirst />
      <div className="page" style={{ paddingTop: 0 }}>
        <h2 style={{ marginBottom: 8 }}>Popular</h2>
      </div>
      <TrackList tracks={top} />
      <div className="page" style={{ paddingTop: 0 }}>
        <Shelf title="Discography" items={albums} />
        <Shelf title="Fans also like" items={similar} />
      </div>
    </div>
  );
}

export function Search({ term }: { term: string }) {
  const q = useSearch(term);
  const r = q.data;
  if (term.trim().length < 2) {
    return (
      <div className="page">
        <h1>Search</h1>
        <p className="muted">Type in the box at the top: songs, albums, artists and playlists.</p>
      </div>
    );
  }
  const nothing = r && !r.songs.length && !r.albums.length && !r.artists.length && !r.playlists.length;
  return (
    <div>
      <div className="page" style={{ paddingBottom: 0 }}>
        <h1>Results for “{term}”</h1>
        {q.isLoading ? <Spinner /> : null}
        {nothing ? <p className="empty-note">Nothing found for that.</p> : null}
        {r?.songs.length ? <h2 style={{ marginBottom: 8 }}>Songs</h2> : null}
      </div>
      {r?.songs.length ? <TrackList tracks={r.songs} /> : null}
      <div className="page" style={{ paddingTop: 0 }}>
        <Shelf title="Artists" items={r?.artists} />
        <Shelf title="Albums" items={r?.albums} />
        <Shelf title="Playlists" items={r?.playlists} />
      </div>
    </div>
  );
}

export function Page() {
  const route = useNav((s) => s.route);
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'albums':
      return <Albums />;
    case 'artists':
      return <Artists />;
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
      return <Search term={route.term ?? ''} />;
  }
}
