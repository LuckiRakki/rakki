// Search, as on the phone: Jellyfin's own search merged with the on-device fuzzy index (so
// typos still find things), ranked together; songs whose lyrics match (the Rakki plugin's
// lyrics index); filters; and the results you opened lately while the box is empty.
import { X } from '~/ui/icons';
import { useEffect, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { blurhashAverage } from '@/lib/blurhash';
import { tileColor } from '@/lib/color';
import { ensureSearchIndex, useSearchIndex } from '@/search/index';
import { useLyricsSearch } from '@/search/lyricsSearch';
import { loadRecentSearches, useRecentSearches } from '@/search/recent';
import { useSearchResults, type Filter } from '@/search/useSearch';
import { useAuth } from '~/auth/session';
import { songMenu } from '~/library/menus';
import { go, openItem, useNav } from '~/nav';
import { usePlayer } from '~/player/store';
import { useGenres } from '~/queries';
import { openMenu } from '~/ui/overlays';
import { activateOnKey } from '~/ui/keys';
import { ArtistLinks, Artwork, ItemCard, Shelf, TrackTable } from '~/ui/parts';
import { Loading } from '~/ui/states';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'songs', label: 'Songs' },
  { key: 'artists', label: 'Artists' },
  { key: 'albums', label: 'Albums' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'genres', label: 'Genres' },
];

const kindLabel = (item: BaseItem) =>
  item.Type === 'MusicArtist'
    ? 'Artist'
    : item.Type === 'MusicAlbum'
      ? `Album · ${item.AlbumArtist ?? ''}`
      : item.Type === 'Playlist'
        ? 'Playlist'
        : item.Type === 'Genre'
          ? 'Genre'
          : `Song · ${item.Artists?.join(', ') ?? ''}`;

/** Open a result (and remember it in recent searches). */
function open(item: BaseItem) {
  useRecentSearches.getState().add(item);
  if (item.Type === 'Audio') usePlayer.getState().playQueue([item], 0);
  else if (item.Type === 'Genre') go({ name: 'genre', id: item.Name });
  else openItem(item);
}

function BrowseAll() {
  const genres = useGenres().data;
  const client = useAuth((s) => s.client);
  return (
    <div className="genre-grid">
      {genres?.map((g) => {
        const rgb = g.album && client ? blurhashAverage(client.blurhash(g.album)) : null;
        return (
          <button key={g.name} className="genre-tile" style={{ background: tileColor(rgb, g.name) }} onClick={() => go({ name: 'genre', id: g.name })}>
            <span>{g.name}</span>
            {g.album ? <Artwork item={g.album} size={160} className="genre-art" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function Recent() {
  const items = useRecentSearches((s) => s.items);
  if (!items.length) return null;
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2>Recent searches</h2>
        <div className="shelf-tools">
          <button onClick={() => useRecentSearches.getState().clear()}>Clear</button>
        </div>
      </div>
      <div className="recent-grid">
        {items.slice(0, 12).map((item) => (
          <div key={item.Id} className="recent" role="button" tabIndex={0} aria-label={`${item.Name}, ${kindLabel(item)}`} onClick={() => open(item)} onKeyDown={activateOnKey(() => open(item))}>
            {item.Type === 'Genre' ? <div className="artwork empty thumb" /> : <Artwork item={item} size={100} round={item.Type === 'MusicArtist'} className="thumb" />}
            <div className="t">
              <div className="name">{item.Name}</div>
              <div className="sub">{kindLabel(item)}</div>
            </div>
            <button
              className="iconbtn"
              aria-label={`Remove ${item.Name} from recent searches`}
              title="Remove"
              onClick={(e) => {
                e.stopPropagation();
                useRecentSearches.getState().remove(item.Id);
              }}>
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function LyricsMatches({ term }: { term: string }) {
  const q = useLyricsSearch(term);
  const hits = q.data ?? [];
  if (!hits.length) return null;
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2>From the lyrics</h2>
      </div>
      <div className="lyric-hits">
        {hits.map(({ track, line }, i) => (
          <button
            key={`${track.Id}-${i}`}
            className="lyric-hit"
            onDoubleClick={() => open(track)}
            onClick={() => open(track)}
            onContextMenu={(e) => openMenu(e, songMenu([track]))}>
            <Artwork item={track} size={100} className="thumb" />
            <div className="t">
              <div className="line">“{line}”</div>
              <div className="sub">
                {track.Name} · <ArtistLinks item={track} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function SearchPage({ term }: { term: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const session = useAuth((s) => s.session);
  const syncing = useSearchIndex((s) => s.syncing);
  const t = term.trim();
  const q = useSearchResults(t, filter);
  const r = q.data;

  // The fuzzy index: loaded from disk, topped up in the background (it throttles itself).
  useEffect(() => {
    if (session) loadRecentSearches(session.userId);
    void ensureSearchIndex();
  }, [session]);

  // Anything opened from here counts as a recent search.
  useEffect(
    () =>
      useNav.subscribe((s, prev) => {
        if (prev.route.name !== 'search' || !r) return;
        const id = 'id' in s.route ? s.route.id : null;
        const hit = id ? [...r.artists, ...r.albums, ...r.playlists].find((x) => x.Id === id) : null;
        if (hit) useRecentSearches.getState().add(hit);
      }),
    [r],
  );

  if (!t) {
    return (
      <div className="page">
        <Recent />
        <h1 className="browse-title">Browse all</h1>
        <BrowseAll />
      </div>
    );
  }

  const nothing = r && !r.songs.length && !r.albums.length && !r.artists.length && !r.playlists.length && !r.genres.length;
  const genres = (r?.genres ?? []).map((g) => ({ Id: `genre:${g.name}`, Name: g.name, Type: 'Genre', ...(g.album ? { album: g.album } : {}) }));

  return (
    <div className="page">
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
        {syncing ? <span className="muted small">Updating the search index in the background</span> : null}
      </div>
      {q.isLoading ? <Loading what={`results for “${t}”`} /> : null}
      {nothing ? <p className="empty-note">Nothing found for “{t}”. Check the spelling, or try fewer words.</p> : null}

      {filter === 'all' && r ? (
        <>
          {r.top ? (
            <div className="search-top">
              <section>
                <h2>Top result</h2>
                <button className="top-result" onClick={() => open(r.top!)} onContextMenu={r.top.Type === 'Audio' ? (e) => openMenu(e, songMenu([r.top!])) : undefined}>
                  <Artwork item={r.top} size={200} round={r.top.Type === 'MusicArtist'} className="top-art" />
                  <div className="top-name">{r.top.Name}</div>
                  <div className="muted">{kindLabel(r.top)}</div>
                </button>
              </section>
              {r.songs.length ? (
                <section style={{ minWidth: 0 }}>
                  <h2>Songs</h2>
                  <TrackTable tracks={r.songs.slice(0, 5)} album={false} />
                </section>
              ) : null}
            </div>
          ) : null}
          <LyricsMatches term={t} />
          <Shelf title="Artists" items={r.artists} onShowAll={r.artists.length > 6 ? () => setFilter('artists') : undefined} />
          <Shelf title="Albums" items={r.albums} onShowAll={r.albums.length > 6 ? () => setFilter('albums') : undefined} />
          <Shelf title="Playlists" items={r.playlists} onShowAll={r.playlists.length > 6 ? () => setFilter('playlists') : undefined} />
          {genres.length ? (
            <section className="shelf">
              <div className="shelf-head">
                <h2>Genres</h2>
              </div>
              <div className="filters">
                {genres.map((g) => (
                  <button key={g.Id} onClick={() => open(g)}>
                    {g.Name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {filter === 'songs' && r ? (
        <>
          <TrackTable tracks={r.songs} />
          <LyricsMatches term={t} />
        </>
      ) : null}
      {(filter === 'artists' || filter === 'albums' || filter === 'playlists') && r ? (
        <div className="grid">
          {r[filter].map((item) => (
            <ItemCard key={item.Id} item={item} />
          ))}
        </div>
      ) : null}
      {filter === 'genres' && r ? (
        <div className="filters">
          {genres.map((g) => (
            <button key={g.Id} onClick={() => open(g)}>
              {g.Name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
