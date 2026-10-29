// An album, a playlist (or Daily Mix), and Liked Songs: a header, the action bar and the songs.
// They load in order (ui/reveal.tsx): the header at once from the list it was opened from (or
// placeholders), then the songs into rows that were holding their place, then what's below.
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { releaseKind } from '@/lib/items';
import { trackPlaycount } from '@/lib/lastfm';
import { isMix } from '@/lib/mixes';
import { useSettings } from '@/settings/store';
import { changePlaylistPicture, movePlaylistSong, setLiked } from '~/library/actions';
import { go } from '~/nav';
import { useAlbumTracks, useArtistAlbums, useItem, useLiked, usePlaylistTracks } from '~/queries';
import { ArrowDownAZ, Heart, ImagePlus, ListMusic } from '~/ui/icons';
import { ActionBar, Artwork, findIn, LibraryHeader, Shelf, totalLength, TrackTable } from '~/ui/parts';
import { partOf, Reveal, useReveal } from '~/ui/reveal';
import { Empty, QueryState } from '~/ui/states';

/** Placeholder rows for a list of `count` songs (as many as fit on screen). */
const holdFor = (count?: number) => Math.max(1, Math.min(count || 10, 14));

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
  const itemQ = useItem(id);
  const item = itemQ.data;
  const tracksQ = useAlbumTracks(id);
  const tracks = tracksQ.data ?? [];
  const lastfm = useAlbumLastfmPlays(item, tracks).data;
  const artistId = item?.AlbumArtists?.[0]?.Id ?? '';
  const more = useArtistAlbums(artistId, !!artistId).data?.filter((a) => a.Id !== id);
  const [find, setFind] = useState('');
  const shown = useMemo(() => findIn(tracks, find), [tracks, find]);
  const discs = new Set(tracks.map((t) => t.ParentIndexNumber ?? 1)).size;
  // The header, the songs, then the notes and the artist's other albums at the bottom.
  const [header, songs, below] = useReveal([
    partOf(item, { failed: itemQ.isError }),
    partOf(tracksQ.data, { failed: tracksQ.isError }),
    item?.Overview || more?.length ? 'ready' : more === undefined && !itemQ.isError ? 'waiting' : 'empty',
  ]);
  if (itemQ.isError && !item) return <div className="page"><QueryState q={itemQ} what="this album" /></div>;
  return (
    <div>
      <LibraryHeader
        step={header}
        item={item}
        kind={item ? releaseKind(item) : 'Album'}
        meta={
          item ? (
            <>
              {item.AlbumArtists?.map((a, i) => (
                <span key={a.Id}>
                  {i ? ', ' : ''}
                  <b className="linkish" onClick={() => go({ name: 'artist', id: a.Id })}>
                    {a.Name}
                  </b>
                </span>
              ))}
              {item.ProductionYear ? ` · ${item.ProductionYear}` : ''}
              {tracksQ.data ? ` · ${tracks.length} songs, ${totalLength(tracks)}` : ''}
              {discs > 1 ? ` · ${discs} discs` : ''}
            </>
          ) : null
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
      <div className="page-states">
        <QueryState q={tracksQ} what="the songs" placeholders />
      </div>
      <TrackTable
        tracks={shown}
        step={songs}
        holdRows={holdFor(item?.ChildCount)}
        album={false}
        art={false}
        trackNumbers
        discs
        plays={!!lastfm}
        playsOf={lastfm ? (t) => lastfm[t.Id] : undefined}
      />
      <Reveal step={below}>
        <div className="page">
          {item?.Overview ? <p className="overview">{item.Overview}</p> : null}
          <Shelf title={`More by ${item?.AlbumArtist ?? 'this artist'}`} items={more} onShowAll={artistId ? () => go({ name: 'artist', id: artistId }) : undefined} />
        </div>
      </Reveal>
    </div>
  );
}

type PlaylistSort = 'custom' | 'title' | 'artist' | 'album' | 'length';

export function Playlist({ id }: { id: string }) {
  const itemQ = useItem(id);
  const item = itemQ.data;
  const tracksQ = usePlaylistTracks(id);
  const tracks = tracksQ.data ?? [];
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
  const [header, songs] = useReveal([partOf(item, { failed: itemQ.isError }), partOf(tracksQ.data, { failed: tracksQ.isError })]);
  if (itemQ.isError && !item) return <div className="page"><QueryState q={itemQ} what="this playlist" /></div>;
  return (
    <div>
      <LibraryHeader
        step={header}
        item={item}
        kind={mix ? 'Daily Mix' : 'Playlist'}
        art={
          item && !mix ? (
            <button className="cover-edit" title="Change Picture" aria-label="Change the playlist’s picture" onClick={() => changePlaylistPicture(item)}>
              <Artwork item={item} size={500} />
              <span>
                <ImagePlus size={34} />
                Choose Picture
              </span>
            </button>
          ) : undefined
        }
        meta={
          <>
            {item?.Overview && mix ? <div className="overview-line">{item.Overview.split('. ')[0]}</div> : null}
            {tracksQ.data ? `${tracks.length} songs, ${totalLength(tracks)}` : ''}
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
            <ArrowDownAZ size={16} />
            <select aria-label="Sort By" value={sort} onChange={(e) => setSort(e.target.value as PlaylistSort)}>
              <option value="custom">Custom Order</option>
              <option value="title">Title</option>
              <option value="artist">Artist</option>
              <option value="album">Album</option>
              <option value="length">Length</option>
            </select>
          </label>
        }
      />
      <div className="page-states">
        <QueryState
          q={tracksQ}
          what="the songs"
          placeholders
          empty={
            <Empty
              icon={ListMusic}
              title="This Playlist Is Empty"
              detail="Right-click any song (or use its heart) and choose Add to playlist."
              action={{ label: 'Find Songs', run: () => go({ name: 'search', term: '' }) }}
            />
          }
        />
      </div>
      <TrackTable
        tracks={shown}
        step={songs}
        holdRows={holdFor(item?.ChildCount)}
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
  const [songs] = useReveal([partOf(q.data, { failed: q.isError })]);
  return (
    <div>
      <LibraryHeader
        kind="Playlist"
        title="Liked Songs"
        color="#4a2fd1"
        meta={q.data ? `${tracks.length} songs, ${totalLength(tracks)}` : ''}
        art={
          <div className="artwork empty liked-art">
            <Heart size={72} fill="#fff" />
          </div>
        }
      />
      <ActionBar tracks={shown} color="#4a2fd1" find={find} onFind={setFind} />
      <div className="page-states">
        <QueryState
          q={q}
          what="your liked songs"
          placeholders
          empty={
            <Empty
              icon={Heart}
              title="No Liked Songs Yet"
              detail="Click the heart beside a song to keep it here."
              action={{ label: 'Browse Songs', run: () => go({ name: 'songs' }) }}
            />
          }
        />
      </div>
      {tracks.length || songs.show === 'placeholder' ? <TrackTable tracks={shown} step={songs} holdRows={12} /> : null}
    </div>
  );
}
